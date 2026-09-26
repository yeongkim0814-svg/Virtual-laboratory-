// 장비 등록·검증, 장비 간 신호 전달(통합) 테스트.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EquipmentManager } from '../src/equipment/equipmentManager';
import { loadEquipmentRegistry } from '../src/equipment/registry';
import { parseSetup } from '../src/equipment/setup';
import { validateDefinition } from '../src/equipment/validateDefinition';
import type { EquipmentDefinition } from '../src/equipment/types';
import type { AssetsFile } from '../src/config/types';
import { contactRouter, SignalBus } from '../src/signal/signalBus';

const registry = loadEquipmentRegistry();
const GRID = { cellSizeM: 0.05, room: { widthM: 10, depthM: 10, heightM: 3 } };
const fakeAssets = { create: async () => new THREE.Object3D() };
const assetsFile = JSON.parse(readFileSync('public/assets.json', 'utf8')) as AssetsFile;

describe('장비 등록', () => {
  it('모든 장비 정의가 유효하고, 동작 모듈과 짝이 맞는다', () => {
    expect(registry.definitions.size).toBeGreaterThan(0);
    for (const t of registry.definitions.keys()) expect(registry.behaviors.has(t)).toBe(true);
  });
  it('모든 장비의 asset 이 assets.json 에 있고 placeholder 크기가 있다', () => {
    for (const d of registry.definitions.values()) {
      expect(assetsFile.assets, d.type).toHaveProperty(d.asset);
      expect(assetsFile.placeholders[d.asset]?.sizeM, d.type).toHaveLength(3);
    }
  });
  it('기본 세팅(public/setups/default.json)을 불러올 수 있다', () => {
    const raw = JSON.parse(readFileSync('public/setups/default.json', 'utf8'));
    expect(() => parseSetup(raw, registry.definitions)).not.toThrow();
  });
});

describe('validateDefinition', () => {
  const good: EquipmentDefinition = {
    type: 'x', label: 'x', asset: 'x', hold: { hands: 1, grips: [[0, 0.1, 0]] }, footprint: { radiusM: 0.1 }, channels: ['Light'],
    ports: [{ id: 'p', channel: 'Light', direction: 'in', positionM: [0, 0, 0] }],
    params: [{ key: 'k', label: 'k', unit: '', min: 0, max: 1, step: 0.1, default: 0.5 }],
    readouts: [],
  };
  it('정상 정의 → 오류 없음', () => expect(validateDefinition(good)).toEqual([]));
  it('포트 채널이 channels 에 없으면 오류', () => {
    const bad = { ...good, ports: [{ ...good.ports[0], channel: 'Thermal' as const }] };
    expect(validateDefinition(bad).join()).toContain('channels 에 없음');
  });
  it('default 가 범위 밖이면 오류', () => {
    const bad = { ...good, params: [{ ...good.params[0], default: 2 }] };
    expect(validateDefinition(bad).join()).toContain('범위 오류');
  });
  it('hold 가 없으면 오류', () => {
    const bad = { ...good, hold: undefined } as unknown as EquipmentDefinition;
    expect(validateDefinition(bad).join()).toContain('hold.hands');
  });
  it('footprint.radiusM 이 0 이하면 오류', () => {
    const bad = { ...good, footprint: { radiusM: 0 } };
    expect(validateDefinition(bad).join()).toContain('footprint');
  });
  it('두 손인데 grip 이 1개면 오류', () => {
    const bad = { ...good, hold: { hands: 2 as const, grips: [[0, 0, 0] as [number, number, number]] } };
    expect(validateDefinition(bad).join()).toContain('hold.grips');
  });
  it('알 수 없는 채널 이름이면 오류', () => {
    const bad = { ...good, channels: ['Sound'] } as unknown as EquipmentDefinition;
    expect(validateDefinition(bad).join()).toContain('channels 오류');
  });
});

describe('장비 간 신호 전달 (test-source → test-probe)', () => {
  const make = async (probeX: number) => {
    const m = new EquipmentManager(new THREE.Scene(), registry, fakeAssets, new SignalBus(contactRouter(0.02)), GRID);
    await m.load(parseSetup({
      version: 1,
      equipment: [
        { id: 's', type: 'test-source', positionM: [-0.15, 0, 1], params: { voltageV: 7 } },
        { id: 'p', type: 'test-probe', positionM: [probeX, 0, 1] },
      ],
    }, registry.definitions));
    return { m, probe: m.instances.find((i) => i.id === 'p')! };
  };

  it('포트가 맞닿으면 전달된다 (1프레임 지연)', async () => {
    const { m, probe } = await make(0.15);
    m.update(1 / 60);
    expect(probe.readouts.voltageV).toBeNull(); // 첫 프레임: 아직 도착 전
    m.update(1 / 60);
    expect(probe.readouts.voltageV).toBe(7);
  });
  it('슬라이더(params) 변경이 다음 프레임에 반영된다', async () => {
    const { m, probe } = await make(0.15);
    m.update(1 / 60);
    m.update(1 / 60);
    m.instances.find((i) => i.id === 's')!.params.voltageV = 3.3;
    m.update(1 / 60);
    m.update(1 / 60);
    expect(probe.readouts.voltageV).toBe(3.3);
  });
  it('포트가 떨어져 있으면 전달되지 않는다', async () => {
    const { m, probe } = await make(0.5);
    m.update(1 / 60);
    m.update(1 / 60);
    expect(probe.readouts.voltageV).toBeNull();
  });
  it('불러올 때 위치를 가장 가까운 셀 중심으로 맞춘다: (−0.16, 0, 1.012) → (−0.15, 0, 1)', async () => {
    const m = new EquipmentManager(new THREE.Scene(), registry, fakeAssets, new SignalBus(contactRouter(0.02)), GRID);
    await m.load(parseSetup({ version: 1, equipment: [{ id: 'a', type: 'test-source', positionM: [-0.16, 0, 1.012] }] }, registry.definitions));
    expect(m.get('a')!.positionM).toEqual([-0.15, 0, 1]);
  });
  it('셀이 겹치는 세팅(중심 간 0.20 m)은 오류, 기존 장비는 그대로', async () => {
    const { m } = await make(0.15);
    const bad = parseSetup({ version: 1, equipment: [
      { id: 'a', type: 'test-source', positionM: [0, 0, 0] },
      { id: 'b', type: 'test-source', positionM: [0.2, 0, 0] },
    ] }, registry.definitions);
    await expect(m.load(bad)).rejects.toThrow('b');
    expect(m.instances.map((i) => i.id)).toEqual(['s', 'p']);
  });
  it('방 밖에 걸치는 세팅은 오류', () => {
    const m = new EquipmentManager(new THREE.Scene(), registry, fakeAssets, new SignalBus(contactRouter(0.02)), GRID);
    const bad = parseSetup({ version: 1, equipment: [{ id: 'w', type: 'test-source', positionM: [4.9, 0, 0] }] }, registry.definitions);
    expect(() => m.validate(bad)).toThrow('방 밖');
  });
  it('occupiedCells: 놓인 장비의 원 셀(21개씩), 제외 id·들린 장비는 빠짐', async () => {
    const { m } = await make(0.15);
    expect(m.occupiedCells().size).toBe(42);
    expect(m.occupiedCells('s').size).toBe(21);
    m.setHeld('p', true);
    expect(m.occupiedCells().size).toBe(21);
  });
  it('setRotation: 놓인 장비만, −180..180 으로 정규화', async () => {
    const { m } = await make(0.15);
    expect(m.setRotation('s', 270)).toBe(true);
    expect(m.get('s')!.rotationYDeg).toBe(-90);
    expect(m.get('s')!.object.rotation.y).toBeCloseTo(-Math.PI / 2);
    m.setHeld('p', true);
    expect(m.setRotation('p', 10)).toBe(false);
  });
  it('각도를 바꾸면 포트도 돌아서 연결이 끊긴다(수신기 90°)', async () => {
    const { m, probe } = await make(0.15);
    m.update(1 / 60); m.update(1 / 60);
    expect(probe.readouts.voltageV).toBe(7);
    m.setRotation('p', 90);
    m.update(1 / 60); m.update(1 / 60);
    expect(probe.readouts.voltageV).toBeNull();
  });
  it('저장용 세팅 항목에는 수정된 param 이 들어간다', async () => {
    const { m } = await make(0.15);
    m.instances[0].params.voltageV = 9;
    expect(m.toSetupItems()[0]).toEqual({ id: 's', type: 'test-source', positionM: [-0.15, 0, 1], rotationYDeg: 0, params: { voltageV: 9 } });
  });
});
