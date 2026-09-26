// 레이저 1단계 통합: 전원 장치 → (케이블) → 레이저 → (빛, R1) → 스크린. R2·R3 확인. 기대값은 승인 규칙에서.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlaceholderBox } from '../src/assets/placeholder';
import type { AssetsFile, LabFile } from '../src/config/types';
import { furnitureBoxes } from '../src/room/furnitureParts';
import { EquipmentManager } from '../src/equipment/equipmentManager';
import { loadEquipmentRegistry } from '../src/equipment/registry';
import { parseSetup } from '../src/equipment/setup';
import { Surfaces } from '../src/room/surfaces';
import { cableRouter } from '../src/signal/cables';
import { LightRouter } from '../src/signal/lightRouter';
import { SignalBus } from '../src/signal/signalBus';

const registry = loadEquipmentRegistry();
const assetsFile = JSON.parse(readFileSync('public/assets.json', 'utf8')) as AssetsFile;
const assets = { create: async (name: string) => createPlaceholderBox(assetsFile.placeholders[name].sizeM!, '#000000') };
const room = { widthM: 10, depthM: 10, heightM: 3 };

async function make(opts: { voltageV?: number; cable?: boolean; blocker?: boolean; screenYawDeg?: number } = {}) {
  const { voltageV = 5, cable = true, blocker = false, screenYawDeg = 180 } = opts;
  let m!: EquipmentManager;
  const light = new LightRouter({ bodyBoxes: () => m.bodyBoxes(), furnitureBoxes: [], room });
  m = new EquipmentManager(new THREE.Scene(), registry, assets, new SignalBus(cableRouter(() => m.cables), { Light: light.router }), {
    grid: { cellSizeM: 0.05, surfaces: new Surfaces(room, [], 0.05) }, portHitRadiusM: 0,
  });
  // 레이저 (0,0,0) 앞 = +z, 출구 z = 0.1. 스크린 (0,0,1) 을 180° 돌려 앞면(z = 0.99)이 레이저를 봄
  await m.load(parseSetup({
    version: 2,
    equipment: [
      { id: 'ps', type: 'power-supply', positionM: [-0.6, 0, 0], params: { voltageV } },
      { id: 'laser', type: 'laser', positionM: [0, 0, 0] },
      { id: 'screen', type: 'screen', positionM: [0, 0, 1], rotationYDeg: screenYawDeg },
      ...(blocker ? [{ id: 'block', type: 'test-probe', positionM: [0, 0, 0.5] }] : []),
    ],
    cables: cable ? [{ from: { deviceId: 'ps', portId: 'out' }, to: { deviceId: 'laser', portId: 'power' } }] : [],
  }, registry.definitions));
  const run = (n = 4) => {
    for (let i = 0; i < n; i++) {
      light.beginFrame();
      m.update(1 / 60);
    }
  };
  return { m, light, run, screen: m.get('screen')!, laser: m.get('laser')! };
}

describe('레이저 → 스크린', () => {
  it('R3: 5 V 이면 켜지고, 스크린이 받은 세기 = 레이저 출력(1 mW), 파장 650 nm', async () => {
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
  it('출력·파장 슬라이더를 바꾸면 스크린 값도 바뀐다(3 mW, 532 nm)', async () => {
    const { run, screen, laser } = await make();
    laser.params.powerW = 0.003;
    laser.params.wavelengthM = 532e-9;
    run();
    expect(screen.readouts.receivedPowerW).toBeCloseTo(0.003, 9);
    expect(screen.readouts.wavelengthM).toBeCloseTo(532e-9, 15);
  });
  it('R2: 4.9 V 면 꺼짐 → 빛 없음, 스크린 0', async () => {
    const { run, screen, laser, light } = await make({ voltageV: 4.9 });
    run();
    expect(laser.readouts.emittedPowerW).toBe(0);
    expect(light.beams).toHaveLength(0);
    expect(screen.readouts.receivedPowerW).toBe(0);
    expect(screen.readouts.wavelengthM).toBeNull();
  });
  it('R2: 케이블이 없으면 꺼짐', async () => {
    const { run, screen } = await make({ cable: false });
    run();
    expect(screen.readouts.receivedPowerW).toBe(0);
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
  it('기본 세팅(실제 방): 테이블 위 레이저 빛이 스크린 앞면에 닿고 1 mW 를 받는다', async () => {
    const lab = JSON.parse(readFileSync('public/lab.json', 'utf8')) as LabFile;
    let m!: EquipmentManager;
    const light = new LightRouter({ bodyBoxes: () => m.bodyBoxes(), furnitureBoxes: furnitureBoxes(lab.furniture), room: lab.room });
    m = new EquipmentManager(new THREE.Scene(), registry, assets, new SignalBus(cableRouter(() => m.cables), { Light: light.router }), {
      grid: { cellSizeM: lab.grid.cellSizeM, surfaces: new Surfaces(lab.room, lab.furniture, lab.grid.cellSizeM) }, portHitRadiusM: 0,
    });
    await m.load(parseSetup(JSON.parse(readFileSync('public/setups/default.json', 'utf8')), registry.definitions));
    for (let i = 0; i < 4; i++) {
      light.beginFrame();
      m.update(1 / 60);
    }
    expect(m.get('screen-1')!.readouts.receivedPowerW).toBeCloseTo(0.001, 9);
    // 출구 x = −2.75 + 0.1 = −2.65, 스크린 앞면 x = −1.6 − 0.01 = −1.61 → 1.04
    expect(light.beams[0].trace.tM).toBeCloseTo(1.04, 6);
  });
});

