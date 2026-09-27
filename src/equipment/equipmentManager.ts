import * as THREE from 'three';
import type { AssetRegistry } from '../assets/assetRegistry';
import type { Surfaces } from '../room/surfaces';
import {
  cellKey, cellToWorld, checkCells, circleOffsets, footprintCells, worldToCell, type Cell,
} from '../grid/grid';
import { cableAt, checkCable, portLookup, type Cable, type CableCheck, type PortAddress } from '../signal/cables';
import type { Signal } from '../signal/channels';
import { portKey, SignalBus, type Emission, type PortRef } from '../signal/signalBus';
import { inscribingRadiusM } from './footprint';
import { directionToWorld, localToWorld } from './ports';
import type { OrientedBox } from '../physics/optics';
import type { EquipmentRegistry } from './registry';
import type { SetupFile, SetupItem } from './setup';
import type { Behavior, EquipmentDefinition, PortDef } from './types';

const DEG = Math.PI / 180;

export interface EquipmentInstance extends SetupItem {
  def: EquipmentDefinition;
  behavior: Behavior;
  readouts: Record<string, number | null>;
  object: THREE.Object3D;
  /** 포트 id → 포트 표시(탭 대상). */
  portMarkers: Map<string, THREE.Object3D>;
  /** 손에 들려 있으면 true. 들린 장비의 포트는 신호 라우팅에서 빠진다(케이블은 꽂힌 채). */
  held: boolean;
  /** 밑넓이 원의 셀 오프셋(중심 셀 기준). 모델이 내접하는 원 → 격자. */
  footprintOffsets: Cell[];
  /** 모델이 내접하는 밑면 원의 반지름. */
  footprintRadiusM: number;
  /** 모델 높이(선반 사이 빈 높이와 비교). */
  heightM: number;
  /** 놓인 면(바닥·테이블·선반 id). 어느 면에도 없으면 null. */
  surfaceId: string | null;
}

export interface GridConfig {
  cellSizeM: number;
  surfaces: Surfaces;
}

export interface ManagerOptions {
  grid: GridConfig;
  /** 방에 고정된 장비(lab.json fixtures). 불러올 때마다 함께 놓이고 저장되지 않는다. */
  fixtures?: readonly SetupItem[];
  /** 포트 탭 판정용 보이지 않는 구의 반지름. 0 이면 만들지 않는다. */
  portHitRadiusM: number;
}

/** -180 < deg ≤ 180 로 정규화, 소수 둘째 자리까지. */
export function normalizeDeg(deg: number): number {
  let d = ((deg % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return Math.round(d * 100) / 100 + 0;
}

/** 레이캐스트로 맞은 객체(자식 포함)가 포트 표시면 그 주소. */
export function portAddressOf(obj: THREE.Object3D | null): PortAddress | undefined {
  for (let o = obj; o; o = o.parent) {
    if (o.userData.port) return o.userData.port as PortAddress;
    if (o.userData.equipmentId !== undefined) return undefined;
  }
  return undefined;
}

/**
 * 장비 인스턴스를 만들고 매 프레임 동작을 실행한다.
 * 장비끼리는 서로를 모른다. 신호는 SignalBus 가 케이블 목록으로만 전달한다.
 *
 * 순서: 지난 프레임에 방출된 신호를 이번 프레임 입력으로 전달(1프레임 지연).
 * → 장비 갱신 순서와 무관하게 결과가 같다.
 */
export class EquipmentManager {
  readonly instances: EquipmentInstance[] = [];
  cables: Cable[] = [];
  private pending: Emission[] = [];
  /** 장비 종류 → 밑넓이·높이(모델에서 한 번 계산). */
  private readonly footprintByType = new Map<
    string,
    { radiusM: number; offsets: Cell[]; heightM: number; boxMinM: [number, number, number]; boxMaxM: [number, number, number] }
  >();
  /** 놓여 있는 장비의 3D 객체가 들어가는 그룹(월드 좌표). */
  readonly group = new THREE.Group();
  readonly grid: GridConfig;

  constructor(
    scene: THREE.Scene,
    private readonly registry: EquipmentRegistry,
    private readonly assets: Pick<AssetRegistry, 'create'>,
    private readonly bus: SignalBus,
    private readonly options: ManagerOptions,
  ) {
    this.grid = options.grid;
    scene.add(this.group);
  }

  /**
   * 현재 장비·케이블을 모두 지우고 세팅을 불러온다.
   * 위치는 가장 가까운 셀 중심으로 맞춘다. 밑넓이가 방 밖이거나 서로 겹치면 오류(아무것도 바꾸지 않음).
   */
  async load(setup: SetupFile): Promise<void> {
    const placed = await this.validate(setup);
    this.group.clear();
    this.instances.length = 0;
    this.pending = [];
    for (const { item, def, surfaceId } of placed) await this.addInstance(item, def, surfaceId);
    this.cables = setup.cables.map((c) => ({ from: { ...c.from }, to: { ...c.to } }));
  }

  /**
   * 세팅을 격자에 맞춰 검사한다(상태는 바꾸지 않음). 위치는 가장 가까운 셀 중심으로 맞춘 값을 돌려준다.
   * 밑넓이가 방 밖에 걸치거나 장비끼리 셀이 겹치면 오류.
   */
  async validate(setup: SetupFile): Promise<{ item: SetupItem; def: EquipmentDefinition; surfaceId: string }[]> {
    const { cellSizeM, surfaces } = this.grid;
    const occupied = new Map<string, Set<string>>();
    const out: { item: SetupItem; def: EquipmentDefinition; surfaceId: string }[] = [];
    for (const item of [...(this.options.fixtures ?? []), ...setup.equipment]) {
      const def = this.registry.definitions.get(item.type)!;
      const { offsets, heightM } = await this.footprintFor(def);
      const [px, py, pz] = item.positionM;
      const surfaceId = surfaces.surfaceAt(px, py, pz);
      if (!surfaceId) throw new Error(`세팅: ${item.id} 이(가) 놓일 면(바닥·테이블 윗면·선반)이 없음`);
      if (heightM > surfaces.get(surfaceId)!.clearHeightM) throw new Error(`세팅: ${item.id} 이(가) 선반 사이 높이보다 큼`);
      const cell = worldToCell(px, pz, cellSizeM);
      const cells = footprintCells(cell, offsets);
      const occ = occupied.get(surfaceId) ?? new Set<string>();
      occupied.set(surfaceId, occ);
      const check = checkCells(cells, occ, (c) => surfaces.cellAllowed(surfaceId, c));
      if (!check.ok) {
        throw new Error(`세팅: ${item.id} ${check.reason === 'outside' ? '이(가) 놓인 면 밖에 걸침' : '이(가) 다른 장비와 겹침'}`);
      }
      for (const c of cells) occ.add(cellKey(c));
      const [x, z] = cellToWorld(cell, cellSizeM);
      const y = surfaces.get(surfaceId)!.yM;
      out.push({
        item: { ...item, positionM: [x, y, z], rotationYDeg: normalizeDeg(item.rotationYDeg) },
        def,
        surfaceId,
      });
    }
    return out;
  }

  get(id: string): EquipmentInstance | undefined {
    return this.instances.find((i) => i.id === id);
  }

  /** 레이캐스트로 맞은 3D 객체(자식 포함)가 어느 장비인지. */
  findByObject(obj: THREE.Object3D | null): EquipmentInstance | undefined {
    for (let o = obj; o; o = o.parent) {
      const id = o.userData.equipmentId as string | undefined;
      if (id !== undefined) return this.get(id);
    }
    return undefined;
  }

  setHeld(id: string, held: boolean): void {
    const inst = this.get(id);
    if (!inst) throw new Error(`장비 없음: ${id}`);
    inst.held = held;
  }

  /** 놓인 위치·회전 갱신(세팅 저장·포트 계산에 쓰임). 3D 객체 이동은 호출자가 한다. */
  setPose(id: string, positionM: [number, number, number], rotationYDeg: number): void {
    const inst = this.get(id);
    if (!inst) throw new Error(`장비 없음: ${id}`);
    inst.positionM = [...positionM];
    inst.rotationYDeg = normalizeDeg(rotationYDeg);
    inst.surfaceId = this.grid.surfaces.surfaceAt(...inst.positionM) ?? null;
  }

  /** 이 면에 놓여 있는(들리지 않은) 장비가 차지한 셀들. exceptId 장비는 제외. */
  occupiedCells(surfaceId: string, exceptId?: string): Set<string> {
    const out = new Set<string>();
    for (const i of this.instances) {
      if (i.held || i.id === exceptId || i.surfaceId !== surfaceId) continue;
      const center = worldToCell(i.positionM[0], i.positionM[2], this.grid.cellSizeM);
      for (const c of footprintCells(center, i.footprintOffsets)) out.add(cellKey(c));
    }
    return out;
  }

  /** 놓여 있는(들리지 않은) 장비 몸체 상자(월드, 모델 경계 상자) — 빛을 막는 것. id = 장비 id. */
  bodyBoxes(): OrientedBox[] {
    return this.instances.filter((i) => !i.held).map((i) => {
      const f = this.footprintByType.get(i.type)!;
      const yaw = i.rotationYDeg * DEG;
      const localCenter: [number, number, number] = [0, 1, 2].map((k) => (f.boxMinM[k] + f.boxMaxM[k]) / 2) as [number, number, number];
      return {
        id: i.id,
        centerM: localToWorld(localCenter, i.positionM, yaw),
        halfM: [0, 1, 2].map((k) => (f.boxMaxM[k] - f.boxMinM[k]) / 2) as [number, number, number],
        yawRad: yaw,
      };
    });
  }

  /** 놓인 장비의 각도 변경(밑넓이가 원이라 차지 셀은 그대로). 들고 있으면 false. */
  setRotation(id: string, deg: number): boolean {
    const inst = this.get(id);
    if (!inst || inst.held) return false;
    inst.rotationYDeg = normalizeDeg(deg);
    inst.object.rotation.y = inst.rotationYDeg * DEG;
    return true;
  }

  // ── 케이블 ──

  /** 두 포트를 케이블로 잇는다(순서 무관). 규칙은 checkCable. */
  connect(a: PortAddress, b: PortAddress): CableCheck {
    const r = checkCable(a, b, this.portDef, this.cables);
    if (r.ok) this.cables.push(r.cable);
    return r;
  }

  /** 이 포트의 케이블을 뽑는다. 뽑은 케이블(없으면 undefined). */
  disconnect(addr: PortAddress): Cable | undefined {
    const c = cableAt(addr, this.cables);
    if (c) this.cables = this.cables.filter((x) => x !== c);
    return c;
  }

  /** 포트 표시의 월드 위치(케이블 끝점). */
  portWorldPosition(addr: PortAddress, out = new THREE.Vector3()): THREE.Vector3 | undefined {
    const marker = this.get(addr.deviceId)?.portMarkers.get(addr.portId);
    return marker ? marker.getWorldPosition(out) : undefined;
  }

  /**
   * 현재 상태를 세팅 항목으로 (저장용).
   * 손에 든 장비는 집기 전에 놓여 있던 자리로 저장된다. 고정 장비(lab.json fixtures)는 빠진다.
   */
  toSetupItems(): SetupItem[] {
    return this.instances.filter((i) => !i.def.fixed).map(({ id, type, positionM, rotationYDeg, params }) => ({
      id, type, positionM, rotationYDeg, params,
    }));
  }

  update(dtS: number): void {
    const ports = this.worldPorts();
    const inputsByPort = this.bus.route(this.pending, ports.filter((p) => p.direction === 'in'));
    const next: Emission[] = [];

    for (const inst of this.instances) {
      const inputs: Record<string, Signal[]> = {};
      for (const p of inst.def.ports) {
        if (p.direction === 'in') inputs[p.id] = inputsByPort.get(portKey(inst.id, p.id)) ?? [];
      }
      inst.behavior.update({
        dtS,
        params: inst.params,
        inputs,
        emit: (portId, values) => {
          const decl = inst.def.ports.find((p) => p.id === portId);
          if (!decl || decl.direction !== 'out') throw new Error(`${inst.type}: 출력 포트 ${portId} 없음`);
          if (inst.held) return; // 들고 있는 동안은 신호가 나가지 않음
          const from = ports.find((p) => p.deviceId === inst.id && p.portId === portId)!;
          next.push({ from, signal: { channel: from.channel, values: { ...values } } });
        },
        setReadout: (key, value) => {
          if (!(key in inst.readouts)) throw new Error(`${inst.type}: readout ${key} 없음`);
          inst.readouts[key] = value;
        },
      });
    }
    this.pending = next;
  }

  // ── 내부 ──

  private async addInstance(item: SetupItem, def: EquipmentDefinition, surfaceId: string | null): Promise<EquipmentInstance> {
    const { offsets, radiusM, heightM } = await this.footprintFor(def);
    const object = await this.assets.create(def.asset);
    object.position.set(...item.positionM);
    object.rotation.y = item.rotationYDeg * DEG;
    object.userData.equipmentId = item.id;
    const portMarkers = await this.addPortMarkers(object, item.id, def);
    this.group.add(object);
    const readouts: Record<string, number | null> = {};
    for (const r of def.readouts) readouts[r.key] = null;
    const inst: EquipmentInstance = {
      ...item,
      params: { ...item.params },
      def,
      behavior: this.registry.behaviors.get(item.type)!.create(),
      readouts,
      object,
      portMarkers,
      held: false,
      footprintOffsets: offsets,
      footprintRadiusM: radiusM,
      heightM,
      surfaceId,
    };
    this.instances.push(inst);
    return inst;
  }

  private portDef = (addr: PortAddress): PortDef | undefined =>
    portLookup((id) => this.get(id)?.type, this.registry.definitions)(addr);

  /** 모델이 내접하는 원의 반지름 → 격자 원. 종류별로 한 번만(모델을 하나 만들어 잰다). */
  private async footprintFor(def: EquipmentDefinition) {
    let f = this.footprintByType.get(def.type);
    if (!f) {
      const model = await this.assets.create(def.asset);
      const radiusM = inscribingRadiusM(model);
      const box = new THREE.Box3().setFromObject(model);
      const heightM = box.isEmpty() ? 0 : box.max.y - Math.min(box.min.y, 0);
      const boxMinM = (box.isEmpty() ? [0, 0, 0] : box.min.toArray()) as [number, number, number];
      const boxMaxM = (box.isEmpty() ? [0, 0, 0] : box.max.toArray()) as [number, number, number];
      f = { radiusM, offsets: circleOffsets(radiusM, this.grid.cellSizeM), heightM, boxMinM, boxMaxM };
      this.footprintByType.set(def.type, f);
    }
    return f;
  }

  /** 포트마다 표시(assets.json "port-marker")와 탭 판정용 보이지 않는 구를 단다. */
  private async addPortMarkers(object: THREE.Object3D, deviceId: string, def: EquipmentDefinition): Promise<Map<string, THREE.Object3D>> {
    const markers = new Map<string, THREE.Object3D>();
    for (const p of def.ports) {
      if (p.channel === 'Light') continue; // 빛 포트는 케이블을 꽂지 않으므로 표시·탭 대상 없음
      const holder = new THREE.Group(); // 포트 위치에 중심을 둔다
      holder.position.set(...p.positionM);
      holder.userData.port = { deviceId, portId: p.id } satisfies PortAddress;
      const marker = await this.assets.create('port-marker');
      const box = new THREE.Box3().setFromObject(marker);
      if (!box.isEmpty()) marker.position.y = -(box.min.y + box.max.y) / 2; // 모델 원점(바닥 중앙) → 중심 정렬
      holder.add(marker);
      if (this.options.portHitRadiusM > 0) {
        const hit = new THREE.Mesh(new THREE.SphereGeometry(this.options.portHitRadiusM, 8, 6), new THREE.MeshBasicMaterial());
        hit.visible = false; // 보이지 않지만 레이캐스트에는 걸린다(작은 포트를 손가락으로 탭하기 쉽게)
        holder.add(hit);
      }
      object.add(holder);
      markers.set(p.id, holder);
    }
    return markers;
  }

  /** 놓여 있는 장비의 포트(월드 좌표). 들린 장비는 신호가 끊기므로 제외. */
  private worldPorts(): PortRef[] {
    return this.instances.filter((inst) => !inst.held).flatMap((inst) =>
      inst.def.ports.map((p) => ({
        deviceId: inst.id,
        portId: p.id,
        channel: p.channel,
        direction: p.direction,
        worldPosM: localToWorld(p.positionM, inst.positionM, inst.rotationYDeg * DEG),
        ...(p.directionLocal ? { worldDirM: directionToWorld(p.directionLocal, inst.rotationYDeg * DEG) } : {}),
        ...(p.faceSizeM ? { faceSizeM: p.faceSizeM } : {}),
      })),
    );
  }
}
