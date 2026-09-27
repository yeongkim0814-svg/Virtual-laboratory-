// R10 LED: 문턱 전압 V_F = hc/(eλ) + 직렬 저항 R_D(구간 선형), 빛 출력 η·I·V_F, 정격 초과 시 탐.
// 기대값은 사용자 승인값(빨강 630 nm, R_D = 10 Ω, η = 0.2, 정격 20 mA).
import { describe, expect, it } from 'vitest';
import { dcOperatingPoint } from '../src/physics/dcSupply';
import { ledBurnsOut, ledOpticalPowerW, ledThresholdV } from '../src/physics/led';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createPlaceholderBox } from '../src/assets/placeholder';
import type { AssetsFile } from '../src/config/types';
import { EquipmentManager } from '../src/equipment/equipmentManager';
import { loadEquipmentRegistry } from '../src/equipment/registry';
import { fixtureItems, parseSetup } from '../src/equipment/setup';
import { Surfaces } from '../src/room/surfaces';
import { cableRouter } from '../src/signal/cables';
import { SignalBus } from '../src/signal/signalBus';

const VF = ledThresholdV(630e-9);
const led = { thresholdV: VF, seriesOhm: 10 };

describe('R10 LED', () => {
  it('빨강 630 nm: V_F = hc/(eλ) = 1.968 V', () => {
    expect(VF).toBeCloseTo(1.968, 3);
  });
  it('V_set 1.5 V, I_set 1 A → 문턱 아래: I = 0, V = 1.5 V, 꺼짐', () => {
    const op = dcOperatingPoint(1.5, 1, led);
    expect(op.currentA).toBe(0);
    expect(op.voltageV).toBe(1.5);
    expect(op.mode).toBe('CV');
  });
  it('V_set 2.1 V, I_set 1 A → CV: I = 13.2 mA, 빛 출력 5.20 mW', () => {
    const op = dcOperatingPoint(2.1, 1, led);
    expect(op.mode).toBe('CV');
    expect(op.voltageV).toBe(2.1);
    expect(op.currentA).toBeCloseTo(0.0132, 5);
    expect(ledOpticalPowerW(op.currentA, VF, 0.2)).toBeCloseTo(0.0052, 5);
  });
  it('V_set 5 V, I_set 10 mA → CC: I = 10 mA, V = 2.068 V', () => {
    const op = dcOperatingPoint(5, 0.01, led);
    expect(op.mode).toBe('CC');
    expect(op.currentA).toBe(0.01);
    expect(op.voltageV).toBeCloseTo(2.068, 3);
  });
  it('V_set 5 V, I_set 1 A → CV 로 303 mA > 정격 20 mA → 탐', () => {
    const op = dcOperatingPoint(5, 1, led);
    expect(op.currentA).toBeCloseTo(0.3032, 4);
    expect(ledBurnsOut(op.currentA, 0.02)).toBe(true);
    expect(ledBurnsOut(0.02, 0.02)).toBe(false); // 정격 그대로는 괜찮음
  });
});

// ── 통합: 콘센트 → 직류 전원 장치 → (케이블) → LED. 부하 특성은 reply 로 전원 장치에 전달된다. ──

const registry = loadEquipmentRegistry();
const assetsFile = JSON.parse(readFileSync('public/assets.json', 'utf8')) as AssetsFile;
const assets = { create: async (name: string) => createPlaceholderBox(assetsFile.placeholders[name].sizeM!, '#000000') };
const room = { widthM: 10, depthM: 10, heightM: 3 };
const outlet = fixtureItems([{ id: 'wall', type: 'table-outlet', positionM: [-0.6, 0, 0.5], rotationYDeg: 180 }], registry.definitions);

async function circuit(voltageV: number, currentLimitA: number) {
  let m!: EquipmentManager;
  m = new EquipmentManager(new THREE.Scene(), registry, assets, new SignalBus(cableRouter(() => m.cables)), {
    grid: { cellSizeM: 0.05, surfaces: new Surfaces(room, [], 0.05) }, portHitRadiusM: 0, mountableHitRadiusM: 0, fixtures: outlet,
  });
  await m.load(parseSetup({
    version: 2,
    equipment: [
      { id: 'ps', type: 'power-supply', positionM: [-0.6, 0, 0], params: { voltageV, currentLimitA } },
      { id: 'clamp', type: 'clamp', positionM: [0, 0, 0] },
      { id: 'led', type: 'led', positionM: [0, 0, 0], mountedOn: { deviceId: 'clamp', mountId: 'slot' } },
    ],
    cables: [
      { from: { deviceId: 'wall', portId: 'socket-1' }, to: { deviceId: 'ps', portId: 'mains' } },
      { from: { deviceId: 'ps', portId: 'out' }, to: { deviceId: 'led', portId: 'power' } },
    ],
  }, registry.definitions, outlet));
  const run = (n = 8) => { for (let i = 0; i < n; i++) m.update(1 / 60); };
  return { m, run, ps: m.get('ps')!, led: m.get('led')! };
}

describe('R10 LED 통합 (전원 장치 ↔ LED)', () => {
  it('V_set 2.1 V, I_set 1 A → CV 13.2 mA, 켜짐, 빛 5.20 mW (전원 장치도 13.2 mA 표시)', async () => {
    const { run, ps, led } = await circuit(2.1, 1);
    run();
    expect(led.readouts.status).toBe(1);
    expect(led.readouts.currentA).toBeCloseTo(0.0132, 5);
    expect(led.readouts.lightPowerW).toBeCloseTo(0.0052, 5);
    expect(ps.readouts.outputA).toBeCloseTo(0.0132, 5);
    expect(ps.readouts.outputV).toBe(2.1);
  });
  it('V_set 5 V, I_set 10 mA → CC: 10 mA, LED 전압 2.068 V, 타지 않음', async () => {
    const { run, ps, led } = await circuit(5, 0.01);
    run();
    expect(led.readouts.status).toBe(1);
    expect(led.readouts.currentA).toBe(0.01);
    expect(led.readouts.voltageV).toBeCloseTo(2.068, 3);
    expect(ps.readouts.outputV).toBeCloseTo(2.068, 3);
  });
  it('V_set 5 V, I_set 1 A → 탐: 이후 전류 0, 빛 0, 전원 장치는 개방(0 A, 5 V)', async () => {
    const { run, ps, led } = await circuit(5, 1);
    run();
    expect(led.readouts.status).toBe(2);
    expect(led.readouts.currentA).toBe(0);
    expect(led.readouts.lightPowerW).toBe(0);
    expect(ps.readouts.outputA).toBe(0);
    expect(ps.readouts.outputV).toBe(5);
  });
  it('탄 LED 는 전압을 낮춰도 안 켜지고, 색을 바꾸면(새 LED로 교체) 탐이 풀린다', async () => {
    const { run, ps, led } = await circuit(5, 1);
    run();
    ps.params.voltageV = 2.1;
    run();
    expect(led.readouts.status).toBe(2);
    ps.params.currentLimitA = 0.01; // 교체한 LED 가 다시 타지 않도록 전류 한계를 먼저 낮춤
    led.params.wavelengthM = 4.7e-7;
    run();
    expect(led.readouts.status).not.toBe(2);
  });
  it('LED 를 뽑으면 전원 장치는 개방(0 A)', async () => {
    const { m, run, ps } = await circuit(2.1, 1);
    run();
    m.disconnect({ deviceId: 'led', portId: 'power' });
    run();
    expect(ps.readouts.outputA).toBe(0);
  });
});
