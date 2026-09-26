import * as THREE from 'three';
import type { AssetRegistry } from '../assets/assetRegistry';
import type { RoomSize } from '../config/types';
import {
  cellKey, cellToWorld, checkCells, circleOffsets, footprintCells, worldToCell, type Cell,
} from '../grid/grid';
import type { Signal } from '../signal/channels';
import { portKey, SignalBus, type Emission, type PortRef } from '../signal/signalBus';
import { localToWorld } from './ports';
import type { EquipmentRegistry } from './registry';
import type { SetupFile, SetupItem } from './setup';
import type { Behavior, EquipmentDefinition } from './types';

const DEG = Math.PI / 180;

export interface EquipmentInstance extends SetupItem {
  def: EquipmentDefinition;
  behavior: Behavior;
  readouts: Record<string, number | null>;
  object: THREE.Object3D;
  /** 손에 들려 있으면 true. 들린 장비의 포트는 신호 라우팅에서 빠진다. */
  held: boolean;
  /** 밑넓이 원의 셀 오프셋(중심 셀 기준). 정의의 footprint.radiusM 과 격자 크기에서 계산. */
  footprintOffsets: Cell[];
}

export interface GridConfig {
  cellSizeM: number;
  room: RoomSize;
}

/** -180 < deg ≤ 180 로 정규화, 소수 둘째 자리까지. */
export function normalizeDeg(deg: number): number {
  let d = ((deg % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return Math.round(d * 100) / 100 + 0;
}

/**
 * 장비 인스턴스를 만들고 매 프레임 동작을 실행한다.
 * 장비끼리는 서로를 모른다. 신호는 SignalBus 가 포트 위치·채널로만 전달한다.
 *
 * 순서: 지난 프레임에 방출된 신호를 이번 프레임 입력으로 전달(1프레임 지연).
 * → 장비 갱신 순서와 무관하게 결과가 같다.
 */
export class EquipmentManager {
  readonly instances: EquipmentInstance[] = [];
  private pending: Emission[] = [];
  /** 놓여 있는 장비의 3D 객체가 들어가는 그룹(월드 좌표). */
  readonly group = new THREE.Group();

  constructor(
    scene: THREE.Scene,
    private readonly registry: EquipmentRegistry,
    private readonly assets: Pick<AssetRegistry, 'create'>,
    private readonly bus: SignalBus,
    readonly grid: GridConfig,
  ) {
    scene.add(this.group);
  }

  /**
   * 현재 장비를 모두 지우고 세팅을 불러온다.
   * 위치는 가장 가까운 셀 중심으로 맞춘다. 밑넓이가 방 밖이거나 서로 겹치면 오류(아무것도 바꾸지 않음).
   */
  async load(setup: SetupFile): Promise<void> {
    const placed = this.validate(setup);
    this.group.clear();
    this.instances.length = 0;
    this.pending = [];
    for (const { item, def, offsets } of placed) {
      const object = await this.assets.create(def.asset);
      object.position.set(...item.positionM);
      object.rotation.y = item.rotationYDeg * DEG;
      object.userData.equipmentId = item.id;
      this.group.add(object);
      const readouts: Record<string, number | null> = {};
      for (const r of def.readouts) readouts[r.key] = null;
      this.instances.push({
        ...item,
        params: { ...item.params },
        def,
        behavior: this.registry.behaviors.get(item.type)!.create(),
        readouts,
        object,
        held: false,
        footprintOffsets: offsets,
      });
    }
  }

  /**
   * 세팅을 격자에 맞춰 검사한다(상태는 바꾸지 않음). 위치는 가장 가까운 셀 중심으로 맞춘 값을 돌려준다.
   * 밑넓이가 방 밖에 걸치거나 장비끼리 셀이 겹치면 오류.
   */
  validate(setup: SetupFile): { item: SetupItem; def: EquipmentDefinition; offsets: Cell[] }[] {
    const { cellSizeM, room } = this.grid;
    const occupied = new Set<string>();
    return setup.equipment.map((item) => {
      const def = this.registry.definitions.get(item.type)!;
      const offsets = circleOffsets(def.footprint.radiusM, cellSizeM);
      const cell = worldToCell(item.positionM[0], item.positionM[2], cellSizeM);
      const cells = footprintCells(cell, offsets);
      const check = checkCells(cells, occupied, cellSizeM, room);
      if (!check.ok) {
        throw new Error(`세팅: ${item.id} ${check.reason === 'outside' ? '이(가) 방 밖에 걸침' : '이(가) 다른 장비와 겹침'}`);
      }
      for (const c of cells) occupied.add(cellKey(c));
      const [x, z] = cellToWorld(cell, cellSizeM);
      return { item: { ...item, positionM: [x, item.positionM[1], z] as [number, number, number], rotationYDeg: normalizeDeg(item.rotationYDeg) }, def, offsets };
    });
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
  }

  /** 놓여 있는(들리지 않은) 장비들의 포트, 월드 좌표. exceptId 장비는 제외. */
  placedPorts(exceptId?: string): PortRef[] {
    return this.worldPorts().filter((p) => p.deviceId !== exceptId);
  }

  /** 놓여 있는(들리지 않은) 장비가 차지한 셀들. exceptId 장비는 제외. */
  occupiedCells(exceptId?: string): Set<string> {
    const out = new Set<string>();
    for (const i of this.instances) {
      if (i.held || i.id === exceptId) continue;
      const center = worldToCell(i.positionM[0], i.positionM[2], this.grid.cellSizeM);
      for (const c of footprintCells(center, i.footprintOffsets)) out.add(cellKey(c));
    }
    return out;
  }

  /** 놓인 장비의 각도 변경(밑넓이가 원이라 차지 셀은 그대로). 들고 있으면 false. */
  setRotation(id: string, deg: number): boolean {
    const inst = this.get(id);
    if (!inst || inst.held) return false;
    inst.rotationYDeg = normalizeDeg(deg);
    inst.object.rotation.y = inst.rotationYDeg * DEG;
    return true;
  }

  /**
   * 현재 상태를 세팅 항목으로 (저장용).
   * 손에 든 장비는 집기 전에 놓여 있던 자리로 저장된다.
   */
  toSetupItems(): SetupItem[] {
    return this.instances.map(({ id, type, positionM, rotationYDeg, params }) => ({
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
          if (inst.held) return; // 들고 있는 동안은 어디에도 연결되지 않음
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

  /** 놓여 있는 장비의 포트(월드 좌표). 들린 장비는 연결되지 않으므로 제외. */
  private worldPorts(): PortRef[] {
    return this.instances.filter((inst) => !inst.held).flatMap((inst) =>
      inst.def.ports.map((p) => ({
        deviceId: inst.id,
        portId: p.id,
        channel: p.channel,
        direction: p.direction,
        worldPosM: localToWorld(p.positionM, inst.positionM, inst.rotationYDeg * DEG),
      })),
    );
  }
}
