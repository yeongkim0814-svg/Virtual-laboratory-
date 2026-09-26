import * as THREE from 'three';
import type { LabFile } from '../config/types';
import type { EquipmentInstance, EquipmentManager } from '../equipment/equipmentManager';
import { addressKey, type Cable, type PortAddress } from './cables';
import { routeCable, type CableEnd, type CableRoute, type Circle, type Plane, type RouteConfig } from './cableRoute';
import { FLOOR, furnitureRect, type Surfaces } from '../room/surfaces';

const DEG = Math.PI / 180;
/** 끝점이 이만큼 움직였을 때만 경로를 다시 계산(손 흔들림 때문에 매 프레임 계산하지 않게). */
const MOVE_EPS_M = 0.005;

export const cableKey = (c: Cable): string => `${addressKey(c.from)}→${addressKey(c.to)}`;

/**
 * 케이블 배치: 매 프레임 각 케이블의 경로(장비를 피해 바닥을 지나는 선)를 정한다.
 * 최대 길이 안에서 경로가 없으면 그 케이블은 빠진다(update 가 돌려준다).
 */
export class CableLayout {
  readonly routes = new Map<string, CableRoute>();
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
  }

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
    for (const key of [...this.routes.keys()]) {
      if (!alive.has(key)) {
        this.routes.delete(key);
        this.cache.delete(key);
      }
    }
    return broken;
  }

  /** 면마다 장애물: 그 면에 놓인 장비 원 + (바닥이면) 찬장 등 가구 사각형. 테이블은 바닥 케이블이 밑으로 지나간다. */
  private planes(): Plane[] {
    const cupboards = this.surfaces.furniture.filter((f) => f.type !== 'table').map(furnitureRect);
    return this.surfaces.list.map((s) => ({
      id: s.id,
      yM: s.yM,
      region: s.rect,
      circles: this.manager.instances.filter((i) => !i.held && i.surfaceId === s.id).map(bodyOf),
      boxes: s.id === FLOOR ? cupboards : [],
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
