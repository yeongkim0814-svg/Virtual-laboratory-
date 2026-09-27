// 클램프(mounts) — mountable 장비를 클램프 등에 끼우는 구조. 격자 칸을 새로 차지하지 않고
// 끼운 장비의 자리(+mounts 자리 offset)를 따른다. 참조·중복 검증(parseSetup)과
// 자리 계산·집기 규칙(EquipmentManager)을 확인한다.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlaceholderBox } from '../src/assets/placeholder';
import type { AssetsFile } from '../src/config/types';
import { EquipmentManager } from '../src/equipment/equipmentManager';
import { loadEquipmentRegistry } from '../src/equipment/registry';
import { parseSetup } from '../src/equipment/setup';
import { Surfaces } from '../src/room/surfaces';
import { cableRouter } from '../src/signal/cables';
import { SignalBus } from '../src/signal/signalBus';

const registry = loadEquipmentRegistry();
const assetsFile = JSON.parse(readFileSync('public/assets.json', 'utf8')) as AssetsFile;
const assets = { create: async (name: string) => createPlaceholderBox(assetsFile.placeholders[name].sizeM!, '#000000') };
const room = { widthM: 10, depthM: 10, heightM: 3 };
const grid = { cellSizeM: 0.05, surfaces: new Surfaces(room, [], 0.05) };

const setupWith = (equipment: object[]) => ({ version: 2, equipment, cables: [] });

describe('parseSetup: mountedOn 검증', () => {
  it('mountable 장비(슬릿)는 mountedOn 없이 면에 그냥 놓을 수도 있다(보관)', () => {
    expect(() => parseSetup(setupWith([{ id: 's', type: 'double-slit', positionM: [0, 0, 0] }]), registry.definitions))
      .not.toThrow();
  });
  it('mountable 아닌 장비에 mountedOn 을 붙이면 오류', () => {
    expect(() =>
      parseSetup(setupWith([
        { id: 'c', type: 'clamp', positionM: [0, 0, 0] },
        { id: 'p', type: 'power-supply', positionM: [0, 0, 0], mountedOn: { deviceId: 'c', mountId: 'slot' } },
      ]), registry.definitions),
    ).toThrow('mountedOn 은 mountable 장비에만');
  });
  it('없는 장비를 가리키면 오류', () => {
    expect(() =>
      parseSetup(setupWith([{ id: 's', type: 'double-slit', positionM: [0, 0, 0], mountedOn: { deviceId: 'nope', mountId: 'slot' } }]), registry.definitions),
    ).toThrow('mountedOn.deviceId nope 없음');
  });
  it('그 장비에 없는 mounts id 를 가리키면 오류', () => {
    expect(() =>
      parseSetup(setupWith([
        { id: 'c', type: 'clamp', positionM: [0, 0, 0] },
        { id: 's', type: 'double-slit', positionM: [0, 0, 0], mountedOn: { deviceId: 'c', mountId: 'nope' } },
      ]), registry.definitions),
    ).toThrow('mountedOn.mountId nope');
  });
  it('한 자리를 두 장비가 가리키면 오류', () => {
    expect(() =>
      parseSetup(setupWith([
        { id: 'c', type: 'clamp', positionM: [0, 0, 0] },
        { id: 's1', type: 'double-slit', positionM: [0, 0, 0], mountedOn: { deviceId: 'c', mountId: 'slot' } },
        { id: 's2', type: 'double-slit', positionM: [0, 0, 0], mountedOn: { deviceId: 'c', mountId: 'slot' } },
      ]), registry.definitions),
    ).toThrow('두 장비가 씀');
  });
  it('정상: 클램프 + 끼운 슬릿 → 오류 없음', () => {
    expect(() =>
      parseSetup(setupWith([
        { id: 'c', type: 'clamp', positionM: [0, 0, 0] },
        { id: 's', type: 'double-slit', positionM: [0, 0, 0], mountedOn: { deviceId: 'c', mountId: 'slot' } },
      ]), registry.definitions),
    ).not.toThrow();
  });
});

describe('EquipmentManager: 클램프에 끼운 장비', () => {
  async function make() {
    let m!: EquipmentManager;
    m = new EquipmentManager(new THREE.Scene(), registry, assets, new SignalBus(cableRouter(() => m.cables)), { grid, portHitRadiusM: 0.07, mountableHitRadiusM: 0.07 });
    await m.load(parseSetup(setupWith([
      { id: 'c', type: 'clamp', positionM: [0.5, 0, 0.5] },
      { id: 's', type: 'double-slit', positionM: [0, 0, 0], mountedOn: { deviceId: 'c', mountId: 'slot' } },
    ]), registry.definitions));
    return m;
  }

  it('끼운 장비의 자리 = 클램프 자리 + mounts 자리(클램프의 mounts.slot.positionM = [0, 0.08, 0])', async () => {
    const m = await make();
    expect(m.get('s')!.positionM).toEqual([0.5, 0.08, 0.5]);
    expect(m.get('s')!.surfaceId).toBe(m.get('c')!.surfaceId);
  });
  it('끼운 장비는 격자 칸을 새로 차지하지 않는다(클램프 칸만)', async () => {
    const m = await make();
    const cCells = m.occupiedCells(m.get('c')!.surfaceId!);
    // 슬릿을 들어도(끼운 채여도 칸 계산엔 원래 안 들어감) 칸 수가 그대로
    expect(cCells.size).toBeGreaterThan(0);
    m.setHeld('s', true);
    expect(m.occupiedCells(m.get('c')!.surfaceId!).size).toBe(cCells.size);
  });
  it('빛 차단 상자(bodyBoxes)에는 끼운 장비만 들어가고 클램프는 빠진다', async () => {
    const m = await make();
    const ids = m.bodyBoxes().map((b) => b.id);
    expect(ids).toContain('s');
    expect(ids).not.toContain('c');
  });
  it('isMounted / isMountSlotOccupied', async () => {
    const m = await make();
    expect(m.isMounted('c')).toBe(true);
    expect(m.isMountSlotOccupied('c', 'slot')).toBe(true);
    expect(m.isMountSlotOccupied('c', 'nope')).toBe(false);
  });
  it('끼운 장비를 들면(setHeld true) 자리가 비고, 저장 항목에서도 빠진다', async () => {
    const m = await make();
    m.setHeld('s', true);
    expect(m.isMounted('c')).toBe(false);
    expect(m.get('s')!.mountedOn).toBeUndefined();
    expect(m.toSetupItems().find((i) => i.id === 's')!.mountedOn).toBeUndefined();
  });
  it('저장 항목(toSetupItems)에 mountedOn 이 들어간다(들지 않았으면)', async () => {
    const m = await make();
    expect(m.toSetupItems().find((i) => i.id === 's')!.mountedOn).toEqual({ deviceId: 'c', mountId: 'slot' });
  });
  it('setPose 로 새로 끼우면 mountedOn 이 반영되고, 안 주면(일반 배치) 비워진다', async () => {
    const m = await make();
    m.setPose('s', [1, 0, 1], 0);
    expect(m.get('s')!.mountedOn).toBeUndefined();
    m.setPose('s', [0.5, 0.08, 0.5], 0, { deviceId: 'c', mountId: 'slot' });
    expect(m.get('s')!.mountedOn).toEqual({ deviceId: 'c', mountId: 'slot' });
  });
  it('끼운 채로 클램프 높이(heightM)를 바꾸면 끼운 장비도 새 높이로 따라간다', async () => {
    const m = await make();
    m.get('c')!.params.heightM = 0.15;
    m.update(1 / 60);
    const [x, y, z] = m.get('s')!.positionM;
    expect([x, z]).toEqual([0.5, 0.5]);
    expect(y).toBeCloseTo(0.15);
    expect(m.get('s')!.object.position.y).toBeCloseTo(0.15);
  });
  it('mountable 장비도 mountedOn 없이 면에 그냥 놓을 수 있다(보관)', async () => {
    let m!: EquipmentManager;
    m = new EquipmentManager(new THREE.Scene(), registry, assets, new SignalBus(cableRouter(() => m.cables)), { grid, portHitRadiusM: 0.07, mountableHitRadiusM: 0.07 });
    await m.load(parseSetup(setupWith([{ id: 's', type: 'double-slit', positionM: [0.5, 0, 0.5] }]), registry.definitions));
    expect(m.get('s')!.positionM).toEqual([0.5, 0, 0.5]);
    expect(m.get('s')!.mountedOn).toBeUndefined();
  });
});

describe('포트 탭 판정', () => {
  it('전원선(cord) 포트는 장비 몸체에 탭 판정 구가 없다(탭 대상은 플러그) — LED 몸체 탭이 가려지지 않게', async () => {
    let m!: EquipmentManager;
    m = new EquipmentManager(new THREE.Scene(), registry, assets, new SignalBus(cableRouter(() => m.cables)), { grid, portHitRadiusM: 0.07, mountableHitRadiusM: 0 });
    await m.load(parseSetup(setupWith([
      { id: 'led', type: 'led', positionM: [0.5, 0, 0.5] },
      { id: 'ps', type: 'power-supply', positionM: [-0.5, 0, -0.5] },
    ]), registry.definitions));
    expect(m.get('led')!.portMarkers.get('power')!.children).toHaveLength(0); // cord
    expect(m.get('ps')!.portMarkers.get('out')!.children).toHaveLength(1); // 소켓: 탭 판정 구 있음
  });
});
