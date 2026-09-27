// 장비 등록·검증, 장비 간 신호 전달(통합) 테스트.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Surfaces } from '../src/room/surfaces';
import { EquipmentManager } from '../src/equipment/equipmentManager';
import { loadEquipmentRegistry } from '../src/equipment/registry';
import { fixtureItems, parseSetup } from '../src/equipment/setup';
import { validateDefinition } from '../src/equipment/validateDefinition';
import type { EquipmentDefinition } from '../src/equipment/types';
import type { AssetsFile, LabFile } from '../src/config/types';
import { SignalBus } from '../src/signal/signalBus';
import { cableRouter, type Cable } from '../src/signal/cables';
import { createPlaceholderBox } from '../src/assets/placeholder';

const registry = loadEquipmentRegistry();
const GRID = { cellSizeM: 0.05, surfaces: new Surfaces({ widthM: 10, depthM: 10, heightM: 3 }, [], 0.05) };
const boxAssets = {
  create: async (name: string) =>
    createPlaceholderBox(name === 'port-marker' ? [0.03, 0.03, 0.03] : [0.3, 0.2, 0.2], '#000000'),
};
const busFor = (cables: () => readonly Cable[]) => new SignalBus(cableRouter(cables));
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
  it('기본 세팅은 실제 방(lab.json 가구·격자)에서 배치 규칙을 통과한다(선반·테이블 위, 안 겹침)', async () => {
    const lab = JSON.parse(readFileSync('public/lab.json', 'utf8')) as LabFile;
    const surfaces = new Surfaces(lab.room, lab.furniture, lab.grid.cellSizeM);
    // 실제 placeholder 크기(assets.json)로 밑넓이를 계산
    const realAssets = { create: async (name: string) => createPlaceholderBox(assetsFile.placeholders[name].sizeM!, '#000000') };
    const fixtures = fixtureItems(lab.fixtures, registry.definitions);
    const m = new EquipmentManager(new THREE.Scene(), registry, realAssets, busFor(() => []), {
      grid: { cellSizeM: lab.grid.cellSizeM, surfaces }, portHitRadiusM: 0, mountOnlyHitRadiusM: 0, fixtures,
    });
    const setup = parseSetup(JSON.parse(readFileSync('public/setups/default.json', 'utf8')), registry.definitions, fixtures);
    const placed = await m.validate(setup);
    // 첫 번째 = 테이블 콘센트(고정 장비)
    expect(placed.map((p) => p.surfaceId)).toEqual([
      'table-1', 'table-1', 'table-1', 'table-1', 'table-1', 'table-1', 'table-1', 'table-1',
      'cupboard-n/3', 'cupboard-n/3', 'cupboard-w/2',
    ]);
  });
  it('기본 세팅(public/setups/default.json)을 불러올 수 있다(테이블 콘센트 케이블 포함)', () => {
    const raw = JSON.parse(readFileSync('public/setups/default.json', 'utf8'));
    const lab = JSON.parse(readFileSync('public/lab.json', 'utf8')) as LabFile;
    expect(() => parseSetup(raw, registry.definitions, fixtureItems(lab.fixtures, registry.definitions))).not.toThrow();
  });
});

describe('validateDefinition', () => {
  const good: EquipmentDefinition = {
    type: 'x', label: 'x', asset: 'x', hold: { hands: 1, grips: [[0, 0.1, 0]] }, channels: ['Light'],
    ports: [{ id: 'p', channel: 'Light', direction: 'in', positionM: [0, 0, 0], directionLocal: [0, 0, 1], faceSizeM: [0.2, 0.1] }],
    params: [{ key: 'k', label: 'k', unit: '', min: 0, max: 1, step: 0.1, default: 0.5 }],
    readouts: [],
  };
  it('정상 정의 → 오류 없음', () => expect(validateDefinition(good)).toEqual([]));
  it('포트 채널이 channels 에 없으면 오류', () => {
    const bad = { ...good, ports: [{ ...good.ports[0], channel: 'Thermal' as const }] };
    expect(validateDefinition(bad).join()).toContain('channels 에 없음');
  });
  it('스위치(options): 정상 / 값 1개 / 중복 값 / default 가 options 에 없음', () => {
    const sw = (options: { value: number; label: string }[], d: number) => ({ ...good, params: [{ key: 's', label: 's', unit: '', default: d, options }] });
    const two = [{ value: 0, label: 'OFF' }, { value: 1, label: 'ON' }];
    expect(validateDefinition(sw(two, 1))).toEqual([]);
    expect(validateDefinition(sw([two[0]], 0)).join()).toContain('2개 이상');
    expect(validateDefinition(sw([two[0], two[0]], 0)).join()).toContain('2개 이상');
    expect(validateDefinition(sw(two, 5)).join()).toContain('options 값 중 하나');
  });
  it('default 가 범위 밖이면 오류', () => {
    const bad = { ...good, params: [{ ...good.params[0], default: 2 }] };
    expect(validateDefinition(bad).join()).toContain('범위 오류');
  });
  it('Light 포트에 방향(단위벡터)이 없거나, 입력에 받는 면 크기가 없으면 오류', () => {
    const noDir = { ...good, ports: [{ ...good.ports[0], directionLocal: undefined }] };
    expect(validateDefinition(noDir).join()).toContain('directionLocal');
    const notUnit = { ...good, ports: [{ ...good.ports[0], directionLocal: [0, 0, 2] as [number, number, number] }] };
    expect(validateDefinition(notUnit).join()).toContain('directionLocal');
    const noFace = { ...good, ports: [{ ...good.ports[0], faceSizeM: undefined }] };
    expect(validateDefinition(noFace).join()).toContain('faceSizeM');
  });
  it('hold 가 없으면 오류', () => {
    const bad = { ...good, hold: undefined } as unknown as EquipmentDefinition;
    expect(validateDefinition(bad).join()).toContain('hold.hands');
  });
  it('두 손인데 grip 이 1개면 오류', () => {
    const bad = { ...good, hold: { hands: 2 as const, grips: [[0, 0, 0] as [number, number, number]] } };
    expect(validateDefinition(bad).join()).toContain('hold.grips');
  });
  it('mounts: 정상 / id 중복 / positionM 오류', () => {
    const withMounts = (mounts: unknown) => ({ ...good, mounts }) as EquipmentDefinition;
    expect(validateDefinition(withMounts([{ id: 'slot', positionM: [0, 0.08, 0] }]))).toEqual([]);
    expect(validateDefinition(withMounts([{ id: 'a', positionM: [0, 0, 0] }, { id: 'a', positionM: [0, 0, 0] }])).join()).toContain('mounts id 중복');
    expect(validateDefinition(withMounts([{ id: 'a', positionM: [0, 0] }])).join()).toContain('mounts a positionM');
  });
  it('mountOnly 와 mounts 를 동시에 가지면 오류', () => {
    const bad = { ...good, mountOnly: true, mounts: [{ id: 's', positionM: [0, 0, 0] as [number, number, number] }] };
    expect(validateDefinition(bad).join()).toContain('mountOnly 장비는 mounts');
  });
  it('알 수 없는 채널 이름이면 오류', () => {
    const bad = { ...good, channels: ['Sound'] } as unknown as EquipmentDefinition;
    expect(validateDefinition(bad).join()).toContain('channels 오류');
  });
});

describe('장비 간 신호 전달·배치 (케이블, 격자)', () => {
  // 테스트 장비 모델 = 0.3×0.2×0.2 상자 → 내접 원 반지름 0.18028 m → 61셀(가로 ±4셀)
  const opts = { grid: GRID, portHitRadiusM: 0.07, mountOnlyHitRadiusM: 0.07 };
  const make = async (cabled = true) => {
    const m = new EquipmentManager(new THREE.Scene(), registry, boxAssets, busFor(() => m.cables), opts);
    await m.load(parseSetup({
      version: 2,
      equipment: [
        { id: 's', type: 'test-source', positionM: [-0.3, 0, 1], params: { voltageV: 7 } },
        { id: 'p', type: 'test-probe', positionM: [0.3, 0, 1] },
      ],
      cables: cabled ? [{ from: { deviceId: 's', portId: 'out' }, to: { deviceId: 'p', portId: 'in' } }] : [],
    }, registry.definitions));
    return { m, probe: m.get('p')! };
  };
  const tick = (m: EquipmentManager, n = 2) => { for (let i = 0; i < n; i++) m.update(1 / 60); };

  it('케이블로 이어져 있으면 전달된다 (1프레임 지연)', async () => {
    const { m, probe } = await make();
    m.update(1 / 60);
    expect(probe.readouts.voltageV).toBeNull(); // 첫 프레임: 아직 도착 전
    m.update(1 / 60);
    expect(probe.readouts.voltageV).toBe(7);
  });
  it('슬라이더(params) 변경이 다음 프레임에 반영된다', async () => {
    const { m, probe } = await make();
    tick(m);
    m.get('s')!.params.voltageV = 3.3;
    tick(m);
    expect(probe.readouts.voltageV).toBe(3.3);
  });
  it('케이블이 없으면 전달되지 않는다', async () => {
    const { m, probe } = await make(false);
    tick(m);
    expect(probe.readouts.voltageV).toBeNull();
  });
  it('connect / disconnect: 포트를 이으면 전달, 뽑으면 끊김', async () => {
    const { m, probe } = await make(false);
    const r = m.connect({ deviceId: 'p', portId: 'in' }, { deviceId: 's', portId: 'out' });
    expect(r.ok).toBe(true);
    tick(m);
    expect(probe.readouts.voltageV).toBe(7);
    expect(m.disconnect({ deviceId: 's', portId: 'out' })).toBeDefined();
    tick(m);
    expect(probe.readouts.voltageV).toBeNull();
  });
  it('각도를 바꿔도 케이블 연결은 유지된다(수신기 90°)', async () => {
    const { m, probe } = await make();
    m.setRotation('p', 90);
    tick(m);
    expect(probe.readouts.voltageV).toBe(7);
  });
  it('들고 있는 동안은 케이블이 꽂힌 채 신호만 끊기고, 놓으면 다시 전달', async () => {
    const { m, probe } = await make();
    m.setHeld('s', true);
    tick(m);
    expect(probe.readouts.voltageV).toBeNull();
    expect(m.cables).toHaveLength(1);
    m.setHeld('s', false);
    tick(m);
    expect(probe.readouts.voltageV).toBe(7);
  });
  it('포트 표시: 포트마다 하나, 월드 위치 = 장비 위치 + 로컬 포트 위치', async () => {
    const { m } = await make();
    const s = m.get('s')!;
    expect([...s.portMarkers.keys()]).toEqual(['out']);
    s.object.updateMatrixWorld(true);
    const p = m.portWorldPosition({ deviceId: 's', portId: 'out' })!;
    expect(p.x).toBeCloseTo(-0.3 + 0.15);
    expect(p.y).toBeCloseTo(0.1);
    expect(p.z).toBeCloseTo(1);
  });
  it('밑넓이는 모델이 내접하는 원(61셀), 포트 표시는 반지름 계산에 안 들어간다', async () => {
    const { m } = await make();
    expect(m.get('s')!.footprintOffsets).toHaveLength(61);
    expect(m.occupiedCells('floor').size).toBe(122);
    expect(m.occupiedCells('floor', 's').size).toBe(61);
    m.setHeld('p', true);
    expect(m.occupiedCells('floor').size).toBe(61);
  });
  it('불러올 때 위치를 가장 가까운 셀 중심으로 맞춘다: (−0.31, 0, 1.012) → (−0.3, 0, 1)', async () => {
    const m = new EquipmentManager(new THREE.Scene(), registry, boxAssets, busFor(() => []), opts);
    await m.load(parseSetup({ version: 2, equipment: [{ id: 'a', type: 'test-source', positionM: [-0.31, 0, 1.012] }] }, registry.definitions));
    expect(m.get('a')!.positionM).toEqual([-0.3, 0, 1]);
  });
  it('셀을 공유하는 간격(중심 간 8셀 = 0.40 m)은 오류, 기존 장비는 그대로 / 9셀(0.45 m)은 가능', async () => {
    const { m } = await make();
    // ±4셀 → 중심 간 8셀(0.40 m)이면 4 를 함께 차지. 9셀(0.45 m)부터 가능
    const bad = parseSetup({ version: 2, equipment: [
      { id: 'a', type: 'test-source', positionM: [0, 0, 0] },
      { id: 'b', type: 'test-source', positionM: [0.4, 0, 0] },
    ] }, registry.definitions);
    await expect(m.load(bad)).rejects.toThrow('b');
    expect(m.instances.map((i) => i.id)).toEqual(['s', 'p']);
    const ok = parseSetup({ version: 2, equipment: [
      { id: 'a', type: 'test-source', positionM: [0, 0, 0] },
      { id: 'b', type: 'test-source', positionM: [0.45, 0, 0] },
    ] }, registry.definitions);
    await expect(m.validate(ok)).resolves.toHaveLength(2);
  });
  it('방 밖에 걸치는 세팅은 오류: 중심 4.75 m(k=95) 면 +4셀 k=99 → 4.975 m 안, 4.8 m(k=96) 면 k=100 → 밖', async () => {
    const m = new EquipmentManager(new THREE.Scene(), registry, boxAssets, busFor(() => []), opts);
    const at = (x: number) => parseSetup({ version: 2, equipment: [{ id: 'w', type: 'test-source', positionM: [x, 0, 0] }] }, registry.definitions);
    await expect(m.validate(at(4.75))).resolves.toHaveLength(1);
    await expect(m.validate(at(4.8))).rejects.toThrow('면 밖');
  });
  it('setRotation: 놓인 장비만, −180..180 으로 정규화', async () => {
    const { m } = await make();
    expect(m.setRotation('s', 270)).toBe(true);
    expect(m.get('s')!.rotationYDeg).toBe(-90);
    expect(m.get('s')!.object.rotation.y).toBeCloseTo(-Math.PI / 2);
    m.setHeld('p', true);
    expect(m.setRotation('p', 10)).toBe(false);
  });
  it('저장용 세팅 항목에는 수정된 param 이 들어간다', async () => {
    const { m } = await make();
    m.get('s')!.params.voltageV = 9;
    expect(m.toSetupItems()[0]).toEqual({ id: 's', type: 'test-source', positionM: [-0.3, 0, 1], rotationYDeg: 0, params: { voltageV: 9 } });
  });
});

describe('테이블·찬장 선반 배치', () => {
  const table = { id: 't', type: 'table' as const, positionM: [0, 0, 1] as [number, number, number], rotationYDeg: 0, sizeM: [1.6, 0.75, 0.8] as [number, number, number], topThicknessM: 0.04, legSizeM: 0.06 };
  const shelf = (shelves: number) => ({ id: 'c', type: 'cupboard' as const, positionM: [0, 0, -4.75] as [number, number, number], rotationYDeg: 0, sizeM: [4, 1.8, 0.5] as [number, number, number], shelves, panelThicknessM: 0.02 });
  const surfaces = new Surfaces({ widthM: 10, depthM: 10, heightM: 3 }, [table], 0.05);
  const newM = () => {
    const m: EquipmentManager = new EquipmentManager(new THREE.Scene(), registry, boxAssets, busFor(() => m.cables), {
      grid: { cellSizeM: 0.05, surfaces }, portHitRadiusM: 0, mountOnlyHitRadiusM: 0,
    });
    return m;
  };
  const at = (x: number, y: number, z = 1) => parseSetup({ version: 2, equipment: [{ id: 'a', type: 'test-source', positionM: [x, y, z] }] }, registry.definitions);

  it('테이블 윗면(높이 0.75)에 놓인다: 면 = 테이블', async () => {
    const m = newM();
    await m.load(at(0.3, 0.75));
    expect(m.get('a')!.surfaceId).toBe('t');
    expect(m.occupiedCells('t').size).toBe(61);
    expect(m.occupiedCells('floor').size).toBe(0);
  });
  it('테이블 가장자리: 중심 셀 k 의 +4셀 윗변 (k+4)·0.05 + 0.025 ≤ 0.8 → k ≤ 11 → 0.55 는 가능, 0.6 은 걸침', async () => {
    await expect(newM().validate(at(0.55, 0.75))).resolves.toHaveLength(1);
    await expect(newM().validate(at(0.6, 0.75))).rejects.toThrow('면 밖');
  });
  it('테이블 밑 바닥에는 못 놓는다 / 놓일 면이 없는 높이는 오류', async () => {
    await expect(newM().validate(at(0, 0))).rejects.toThrow('면 밖');
    await expect(newM().validate(at(3, 0.4))).rejects.toThrow('놓일 면');
    expect(newM().grid.surfaces.get('t')!.clearHeightM).toBe(Infinity);
  });
  it('찬장 선반(칸 4개, 높이 0.02·0.465·0.91·1.355)에 놓인다: 면 = 찬장/칸 번호', async () => {
    const surf = new Surfaces({ widthM: 10, depthM: 10, heightM: 3 }, [shelf(4)], 0.05);
    const m: EquipmentManager = new EquipmentManager(new THREE.Scene(), registry, boxAssets, busFor(() => m.cables), {
      grid: { cellSizeM: 0.05, surfaces: surf }, portHitRadiusM: 0, mountOnlyHitRadiusM: 0,
    });
    await m.load(at(0, 0.91, -4.75));
    expect(m.get('a')!.surfaceId).toBe('c/3');
  });
  it('선반 사이 빈 높이보다 큰 장비는 못 놓는다: 칸 10개 → (1.8 − 0.02)/10 − 0.02 = 0.158 < 장비 0.2', async () => {
    const surf = new Surfaces({ widthM: 10, depthM: 10, heightM: 3 }, [shelf(10)], 0.05);
    const m: EquipmentManager = new EquipmentManager(new THREE.Scene(), registry, boxAssets, busFor(() => m.cables), {
      grid: { cellSizeM: 0.05, surfaces: surf }, portHitRadiusM: 0, mountOnlyHitRadiusM: 0,
    });
    await expect(m.validate(at(0, 0.02, -4.75))).rejects.toThrow('선반 사이 높이');
  });
});

