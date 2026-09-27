// 레이저 통합: 콘센트 → (전원선) → 레이저(스위치) → (빛, R1) → 스크린. R2′·R3 확인 + 직류 전원 장치(R9) 콘센트 연결. 기대값은 승인 규칙에서.
// (이전: 전원 장치 → (케이블) → 레이저 → (빛, R1) → 스크린. R2·R3 확인. 기대값은 승인 규칙에서.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlaceholderBox } from '../src/assets/placeholder';
import type { AssetsFile, LabFile } from '../src/config/types';
import { furnitureBoxes } from '../src/room/furnitureParts';
import { EquipmentManager } from '../src/equipment/equipmentManager';
import { loadEquipmentRegistry } from '../src/equipment/registry';
import { fixtureItems, parseSetup } from '../src/equipment/setup';
import { Surfaces } from '../src/room/surfaces';
import { cableRouter } from '../src/signal/cables';
import { LightRouter } from '../src/signal/lightRouter';
import { SignalBus } from '../src/signal/signalBus';

const registry = loadEquipmentRegistry();
const assetsFile = JSON.parse(readFileSync('public/assets.json', 'utf8')) as AssetsFile;
const assets = { create: async (name: string) => createPlaceholderBox(assetsFile.placeholders[name].sizeM!, '#000000') };
const room = { widthM: 10, depthM: 10, heightM: 3 };
// 모든 배치에 바닥 콘센트(고정 장비)를 두고 전원 장치를 꽂는다(전원 장치는 콘센트에 꽂혀야 출력)
const outlet = fixtureItems([{ id: 'wall', type: 'table-outlet', positionM: [-0.6, 0, 0.5], rotationYDeg: 180 }], registry.definitions);
const mainsCable = { from: { deviceId: 'wall', portId: 'socket-1' }, to: { deviceId: 'ps', portId: 'mains' } };
const laserCable = { from: { deviceId: 'wall', portId: 'socket-2' }, to: { deviceId: 'laser', portId: 'power' } };

async function make(opts: { cable?: boolean; mains?: boolean; blocker?: boolean; screenYawDeg?: number } = {}) {
  // cable = 레이저 전원선이 콘센트에 꽂힘, mains = 전원 장치 전원선이 콘센트에 꽂힘
  const { cable = true, mains = true, blocker = false, screenYawDeg = 180 } = opts;
  let m!: EquipmentManager;
  const light = new LightRouter({ bodyBoxes: () => m.bodyBoxes(), furnitureBoxes: [], room });
  m = new EquipmentManager(new THREE.Scene(), registry, assets, new SignalBus(cableRouter(() => m.cables), { Light: light.router }), {
    grid: { cellSizeM: 0.05, surfaces: new Surfaces(room, [], 0.05) }, portHitRadiusM: 0, mountOnlyHitRadiusM: 0, fixtures: outlet,
  });
  // 레이저 (0,0,0) 앞 = +z, 출구 z = 0.1. 스크린 (0,0,1) 을 180° 돌려 앞면(z = 0.99)이 레이저를 봄
  await m.load(parseSetup({
    version: 2,
    equipment: [
      { id: 'ps', type: 'power-supply', positionM: [-0.6, 0, 0], params: { voltageV: 12, currentLimitA: 1 } },
      { id: 'laser', type: 'laser', positionM: [0, 0, 0] },
      { id: 'screen', type: 'screen', positionM: [0, 0, 1], rotationYDeg: screenYawDeg },
      ...(blocker ? [{ id: 'block', type: 'test-probe', positionM: [0, 0, 0.5] }] : []),
    ],
    cables: [...(mains ? [mainsCable] : []), ...(cable ? [laserCable] : [])],
  }, registry.definitions, outlet));
  const run = (n = 4) => {
    for (let i = 0; i < n; i++) {
      light.beginFrame();
      m.update(1 / 60);
    }
  };
  return { m, light, run, screen: m.get('screen')!, laser: m.get('laser')! };
}

describe('레이저 → 스크린', () => {
  it('R3: 콘센트에 꽂히고 스위치 빨강이면 켜지고, 스크린이 받은 세기 = 레이저 출력(1 mW), 파장 650 nm', async () => {
    const { run, screen, laser, light } = await make();
    run();
    expect(laser.readouts.emittedPowerW).toBeCloseTo(0.001, 9);
    expect(screen.readouts.receivedPowerW).toBeCloseTo(0.001, 9);
    expect(screen.readouts.wavelengthM).toBeCloseTo(650e-9, 15);
    // R1: 출구 z = 0.1 → 스크린 앞면 z = 0.99, 거리 0.89
    expect(light.beams).toHaveLength(1);
    expect(light.beams[0].trace.hit.kind).toBe('face');
    expect(light.beams[0].trace.tM).toBeCloseTo(0.89, 6);
  });
  it('출력 슬라이더·스위치(초록)를 바꾸면 스크린 값도 바뀐다(3 mW, 532 nm)', async () => {
    const { run, screen, laser } = await make();
    laser.params.powerW = 0.003;
    laser.params.wavelengthM = 532e-9;
    run();
    expect(screen.readouts.receivedPowerW).toBeCloseTo(0.003, 9);
    expect(screen.readouts.wavelengthM).toBeCloseTo(532e-9, 15);
  });
  it("R2′: 꽂혀 있어도 스위치 OFF 면 꺼짐 → 빛 없음, 스크린 0", async () => {
    const { run, screen, laser, light } = await make();
    laser.params.wavelengthM = 0;
    run();
    expect(laser.readouts.emittedPowerW).toBe(0);
    expect(light.beams).toHaveLength(0);
    expect(screen.readouts.receivedPowerW).toBe(0);
    expect(screen.readouts.wavelengthM).toBeNull();
  });
  it("R2′: 레이저가 콘센트에 안 꽂혀 있으면(스위치 빨강) 꺼짐", async () => {
    const { run, screen, laser } = await make({ cable: false });
    run();
    expect(laser.readouts.emittedPowerW).toBe(0);
    expect(screen.readouts.receivedPowerW).toBe(0);
  });
  it('R9: 직류 전원 장치는 콘센트에 꽂혀야 출력 — 부하 없음 → 12 V, 0 A / 안 꽂힘 → 표시 없음', async () => {
    const on = await make();
    on.run();
    expect(on.m.get('ps')!.readouts.outputV).toBe(12);
    expect(on.m.get('ps')!.readouts.outputA).toBe(0);
    const off = await make({ mains: false });
    off.run();
    expect(off.m.get('ps')!.readouts.outputV).toBeNull();
    expect(off.m.get('ps')!.readouts.outputA).toBeNull();
  });
  it('레이저 플러그(mains)는 직류 단자(dc)에 꽂히지 않는다', async () => {
    const { m } = await make({ cable: false });
    expect(m.connect({ deviceId: 'ps', portId: 'out' }, { deviceId: 'laser', portId: 'power' })).toEqual({ ok: false, reason: 'plug-kind' });
  });
  it('콘센트(고정 장비)는 세팅 저장에 들어가지 않고, 꽂힌 케이블은 저장된다', async () => {
    const { m } = await make();
    const items = m.toSetupItems();
    expect(items.map((i) => i.id)).not.toContain('wall');
    expect(m.cables.some((c) => c.from.deviceId === 'wall')).toBe(true);
  });
  it('R1: 사이에 장비가 있으면 막힘 → 스크린 0, 빛은 그 장비 앞에서 멈춤', async () => {
    const { run, screen, light } = await make({ blocker: true });
    run();
    expect(screen.readouts.receivedPowerW).toBe(0);
    expect(light.beams[0].trace.hit).toEqual({ kind: 'box', id: 'block' });
    expect(light.beams[0].trace.tM).toBeCloseTo(0.3, 6); // 수신기 몸체 앞면 z = 0.5 − 0.1 = 0.4 → 0.4 − 0.1
  });
  it('R1: 스크린이 옆을 보면(90°) 앞면이 아니라 몸체 옆면에 닿음 → 0', async () => {
    const { run, screen, light } = await make({ screenYawDeg: 90 });
    run();
    expect(screen.readouts.receivedPowerW).toBe(0);
    expect(light.beams[0].trace.hit).toEqual({ kind: 'box', id: 'screen' });
  });
  it('레이저를 들고 있으면 빛이 나가지 않는다', async () => {
    const { m, run, light } = await make();
    m.setHeld('laser', true);
    run();
    expect(light.beams).toHaveLength(0);
  });
  it('빛 포트에는 케이블을 꽂을 수 없다', async () => {
    const { m } = await make();
    expect(m.connect({ deviceId: 'laser', portId: 'beam' }, { deviceId: 'screen', portId: 'face' })).toEqual({ ok: false, reason: 'light' });
  });
  it('기본 세팅(실제 방): 레이저 → 이중 슬릿 → 스크린. R6 투과(1 mW × 2·0.03/1 = 0.06 mW), 슬릿 정보 전달', async () => {
    const lab = JSON.parse(readFileSync('public/lab.json', 'utf8')) as LabFile;
    let m!: EquipmentManager;
    const light = new LightRouter({ bodyBoxes: () => m.bodyBoxes(), furnitureBoxes: furnitureBoxes(lab.furniture), room: lab.room });
    m = new EquipmentManager(new THREE.Scene(), registry, assets, new SignalBus(cableRouter(() => m.cables), { Light: light.router }), {
      grid: { cellSizeM: lab.grid.cellSizeM, surfaces: new Surfaces(lab.room, lab.furniture, lab.grid.cellSizeM) }, portHitRadiusM: 0, mountOnlyHitRadiusM: 0,
      fixtures: fixtureItems(lab.fixtures, registry.definitions),
    });
    await m.load(parseSetup(JSON.parse(readFileSync('public/setups/default.json', 'utf8')), registry.definitions, fixtureItems(lab.fixtures, registry.definitions)));
    for (let i = 0; i < 5; i++) {
      light.beginFrame();
      m.update(1 / 60);
    }
    expect(m.get('slit-1')!.readouts.transmittedPowerW).toBeCloseTo(0.00006, 12);
    expect(m.get('screen-1')!.readouts.receivedPowerW).toBeCloseTo(0.00006, 12);
    // 레이저 출구 x = −2.65 → 슬릿(클램프 위, 두께 ±0.005) 뒷면 −2.505 (0.145), 앞면 −2.495 → 스크린 앞면 −1.61 (L = 0.885)
    const toSlit = light.beams.find((b) => b.fromDeviceId === 'laser-1')!;
    const toScreen = light.beams.find((b) => b.fromDeviceId === 'slit-1')!;
    expect(toSlit.trace.tM).toBeCloseTo(0.145, 6);
    expect(toScreen.trace.tM).toBeCloseTo(0.885, 6);
    expect(toScreen.values.slitSpacingM).toBeCloseTo(0.0001, 12);
    expect(toScreen.target?.deviceId).toBe('screen-1');
  });
  it('슬릿판을 돌려도(30°) 빛은 꺾이지 않고 같은 직선으로 지나간다(R1)', async () => {
    let m!: EquipmentManager;
    const light = new LightRouter({ bodyBoxes: () => m.bodyBoxes(), furnitureBoxes: [], room });
    m = new EquipmentManager(new THREE.Scene(), registry, assets, new SignalBus(cableRouter(() => m.cables), { Light: light.router }), {
      grid: { cellSizeM: 0.05, surfaces: new Surfaces(room, [], 0.05) }, portHitRadiusM: 0, mountOnlyHitRadiusM: 0, fixtures: outlet,
    });
    await m.load(parseSetup({
      version: 2,
      equipment: [
        { id: 'laser', type: 'laser', positionM: [0, 0, 0] },
        { id: 'clamp', type: 'clamp', positionM: [0, 0, 0.4] },
        { id: 'slit', type: 'double-slit', positionM: [0, 0, 0.4], rotationYDeg: 30, mountedOn: { deviceId: 'clamp', mountId: 'slot' } },
        { id: 'screen', type: 'screen', positionM: [0, 0, 1.2], rotationYDeg: 180 },
      ],
      cables: [laserCable],
    }, registry.definitions, outlet));
    for (let i = 0; i < 5; i++) {
      light.beginFrame();
      m.update(1 / 60);
    }
    const out = light.beams.find((b) => b.fromDeviceId === 'slit')!;
    const dir = out.trace.pointM.map((v, i) => v - out.originM[i]);
    const len = Math.hypot(...dir);
    expect(dir[0] / len).toBeCloseTo(0, 9); // 레이저와 같은 +z 방향
    expect(dir[2] / len).toBeCloseTo(1, 9);
    expect(out.originM[0]).toBeCloseTo(0, 9); // 레이저 광선과 같은 직선(x = 0, y = 0.1)
    expect(out.originM[1]).toBeCloseTo(0.1, 9);
    expect(out.trace.pointM[0]).toBeCloseTo(0, 9);
    expect(out.target?.deviceId).toBe('screen');
    // R6′: θᵢ = 30° → 1 mW × 2·0.03/1 × cos30° = 0.05196 mW
    expect(m.get('slit')!.readouts.transmittedPowerW).toBeCloseTo(5.196e-5, 8);
    expect(m.get('screen')!.readouts.receivedPowerW).toBeCloseTo(5.196e-5, 8);
  });
  it('슬릿판 조준 영역(2 × 2 cm) 밖에 닿으면 판에 막힌다', async () => {
    let m!: EquipmentManager;
    const light = new LightRouter({ bodyBoxes: () => m.bodyBoxes(), furnitureBoxes: [], room });
    // 이 테스트만 촘촘한 격자(0.001 m) — 0.012 m 같은 값에 클램프를 정확히 놓기 위해(그리드 스냅 방지)
    m = new EquipmentManager(new THREE.Scene(), registry, assets, new SignalBus(cableRouter(() => m.cables), { Light: light.router }), {
      grid: { cellSizeM: 0.001, surfaces: new Surfaces(room, [], 0.001) }, portHitRadiusM: 0, mountOnlyHitRadiusM: 0, fixtures: outlet,
    });
    // 슬릿판을 옆으로 0.012 m 비켜 둠(조준 영역 반폭 0.004 밖, 판 반폭 0.022 안)
    await m.load(parseSetup({
      version: 2,
      equipment: [
        { id: 'laser', type: 'laser', positionM: [0, 0, 0] },
        { id: 'clamp', type: 'clamp', positionM: [0.012, 0, 0.4] },
        { id: 'slit', type: 'double-slit', positionM: [0.012, 0, 0.4], mountedOn: { deviceId: 'clamp', mountId: 'slot' } },
        { id: 'screen', type: 'screen', positionM: [0, 0, 1.2], rotationYDeg: 180 },
      ],
      cables: [laserCable],
    }, registry.definitions, outlet));
    for (let i = 0; i < 5; i++) {
      light.beginFrame();
      m.update(1 / 60);
    }
    expect(light.beams[0].trace.hit).toEqual({ kind: 'box', id: 'slit' });
    expect(m.get('screen')!.readouts.receivedPowerW).toBe(0);
  });
});

