import * as THREE from 'three';
import type { LabFile } from '../config/types';
import type { EquipmentInstance, EquipmentManager } from '../equipment/equipmentManager';
import { addressKey, type Cable, type PortAddress } from './cables';
import { looseCordRoute, routeCable, type CableEnd, type CableRoute, type Circle, type Plane, type RouteConfig } from './cableRoute';
import { FLOOR, type Surfaces } from '../room/surfaces';

const DEG = Math.PI / 180;
/** 끝점이 이만큼 움직였을 때만 경로를 다시 계산(손 흔들림 때문에 매 프레임 계산하지 않게). */
const MOVE_EPS_M = 0.005;

export const cableKey = (c: Cable): string => `${addressKey(c.from)}→${addressKey(c.to)}`;

/**
 * 케이블 배치: 매 프레임 각 케이블의 경로(장비를 피해 바닥을 지나는 선)를 정한다.
 * 최대 길이 안에서 경로가 없으면 그 케이블은 빠진다(update 가 돌려준다).
 */
/** 플러그 하나(그리기·탭용): 위치, 꽂히는 방향(수평 단위벡터), 이 플러그가 달린 전원선 포트. */
export interface PlugPose {
  pointM: [number, number, number];
  dir: [number, number];
  cordPort: PortAddress;
  plugged: boolean;
}

export class CableLayout {
  /** 케이블 경로 + 뽑힌 전원선 경로(키 "loose:장비/포트"). */
  readonly routes = new Map<string, CableRoute>();
  /** 전원선 플러그(꽂힌 것은 소켓 앞, 뽑힌 것은 전원선 끝). 키 = 전원선 포트 주소. */
  readonly plugs = new Map<string, PlugPose>();
  private readonly cache = new Map<string, string>();
  private readonly cfg: RouteConfig;

  constructor(
    private readonly manager: EquipmentManager,
    lab: LabFile,
    cableRadiusM: number,
    private readonly surfaces: Surfaces,
  ) {
    this.cfg = {
      cellSizeM: lab.grid.cellSizeM,
      room: lab.room,
      liftM: cableRadiusM,
      portStubM: lab.cable.portStubM,
      clearanceM: lab.cable.clearanceM,
      maxLengthM: lab.cable.maxLengthM,
    };
    this.restM = lab.cable.looseRestM;
  }

  private readonly restM: number;

  get maxLengthM(): number {
    return this.cfg.maxLengthM;
  }

  /** 두 포트를 지금 이으면 경로가 있는가. */
  canRoute(from: PortAddress, to: PortAddress): boolean {
    const o = this.planes();
    const a = this.end(from);
    const b = this.end(to);
    return !!a && !!b && routeCable(a, b, o, this.cfg) !== null;
  }

  /** 경로 갱신. 빠진 케이블 목록을 돌려준다(매니저에서도 이미 뺐다). */
  update(): Cable[] {
    const obstacles = this.planes();
    const obstacleSig = obstacles
      .map((p) => `${p.id}:` + p.circles.map((c) => `${r(c.xM)},${r(c.zM)},${r(c.rM)}`).join(';'))
      .join('|');
    const broken: Cable[] = [];
    const alive = new Set<string>();
    for (const c of [...this.manager.cables]) {
      const key = cableKey(c);
      const a = this.end(c.from);
      const b = this.end(c.to);
      if (!a || !b) continue;
      const sig = `${obstacleSig}|${sigOf(a)}|${sigOf(b)}`;
      if (this.cache.get(key) === sig && this.routes.has(key)) {
        alive.add(key);
        continue;
      }
      const route = routeCable(a, b, obstacles, this.cfg);
      if (!route) {
        this.manager.disconnect(c.from);
        broken.push(c);
        continue;
      }
      this.routes.set(key, route);
      this.cache.set(key, sig);
      alive.add(key);
    }
    this.layoutCords(obstacles, obstacleSig, alive);
    for (const key of [...this.routes.keys()]) {
      if (!alive.has(key)) {
        this.routes.delete(key);
        this.cache.delete(key);
      }
    }
    return broken;
  }

  /** 전원선: 꽂혀 있으면 소켓 쪽 끝에 플러그, 뽑혀 있으면 장비 옆에 놓인 짧은 선 + 플러그. */
  private layoutCords(planes: Plane[], obstacleSig: string, alive: Set<string>): void {
    this.plugs.clear();
    for (const inst of this.manager.instances) {
      for (const p of inst.def.ports) {
        if (!p.cord) continue;
        const addr = { deviceId: inst.id, portId: p.id };
        const ak = addressKey(addr);
        const cable = this.manager.cables.find((c) => addressKey(c.to) === ak || addressKey(c.from) === ak);
        const route = cable && this.routes.get(cableKey(cable));
        if (route) {
          // 케이블 from = 소켓(출력). 플러그는 소켓에서 케이블 쪽으로 조금 나온 곳, 소켓을 향함
          const [a, b] = route.pointsM;
          const d = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
          this.plugs.set(ak, { pointM: a, dir: [(a[0] - b[0]) / d, (a[2] - b[2]) / d], cordPort: addr, plugged: true });
          continue;
        }
        const end = this.end(addr);
        if (!end) continue;
        const key = `loose:${ak}`;
        alive.add(key);
        const sig = `${obstacleSig}|${sigOf(end)}`;
        const plane = planes.find((pl) => pl.id === end.planeId)!;
        const loose = looseCordRoute(end, plane.yM, this.cfg, this.restM);
        if (this.cache.get(key) !== sig || !this.routes.has(key)) {
          this.routes.set(key, { pointsM: loose.pointsM, lengthM: 0 });
          this.cache.set(key, sig);
        }
        this.plugs.set(ak, { pointM: loose.plugM, dir: loose.plugDir, cordPort: addr, plugged: false });
      }
    }
  }

  /**
   * 면마다 장애물: 그 면에 놓인 장비 원 + (바닥이면) 찬장·테이블 다리. 테이블 밑은 지나간다.
   * 가구 사각형은 케이블 반지름만큼 넓혀서 케이블이 옆면에 묻히지 않게 한다.
   * 클램프 등(mounts 가 있는 장비)은 뺀다 — 안 그러면 거기 끼운 장비(자기와 같은 자리)로 가는
   * 케이블이 클램프 자신의 원 안(닿을 수 없는 점)에서 끝나 버린다. bodyBoxes(빛)와 같은 이유.
   */
  private planes(): Plane[] {
    const lift = this.cfg.liftM;
    const boxes = this.surfaces.floorCableBoxes.map((b) => ({ ...b, hxM: b.hxM + lift, hzM: b.hzM + lift }));
    return this.surfaces.list.map((s) => ({
      id: s.id,
      yM: s.yM,
      region: s.rect,
      circles: this.manager.instances.filter((i) => !i.held && i.surfaceId === s.id && !i.def.mounts?.length).map(bodyOf),
      boxes: s.id === FLOOR ? boxes : [],
      openSides: s.openSides,
    }));
  }

  private end(addr: PortAddress): CableEnd | null {
    const inst = this.manager.get(addr.deviceId);
    const p = this.manager.portWorldPosition(addr, new THREE.Vector3());
    if (!inst || !p) return null;
    const loose = inst.held || inst.surfaceId === null;
    const planeId = loose ? this.surfaces.surfaceBelow(p.x, p.y, p.z).id : inst.surfaceId!;
    return { portM: [p.x, p.y, p.z], body: loose ? null : bodyOf(inst), fallbackDir: forward(inst), planeId };
  }
}

const r = (v: number) => Math.round(v / MOVE_EPS_M);
const sigOf = (e: CableEnd) => `${r(e.portM[0])},${r(e.portM[1])},${r(e.portM[2])},${e.body ? 1 : 0},${e.planeId}`;
const bodyOf = (i: EquipmentInstance): Circle => ({ xM: i.positionM[0], zM: i.positionM[2], rM: i.footprintRadiusM });
/** 장비 로컬 +x 방향(월드 수평). */
const forward = (i: EquipmentInstance): [number, number] => {
  const y = i.rotationYDeg * DEG;
  return [Math.cos(y), -Math.sin(y)];
};
