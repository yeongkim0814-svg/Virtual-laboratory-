// 손으로 집기·들기·놓기·떨어뜨리기 흐름 테스트 (상태·자세, 물리 규칙 아님).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlaceholderBox } from '../src/assets/placeholder';
import { EquipmentManager } from '../src/equipment/equipmentManager';
import { loadEquipmentRegistry } from '../src/equipment/registry';
import { parseSetup } from '../src/equipment/setup';
import { Hand } from '../src/hand/hand';
import type { HandConfig } from '../src/config/types';
import { contactRouter, SignalBus } from '../src/signal/signalBus';

const registry = loadEquipmentRegistry();
const cfg: HandConfig = {
  rightRestM: [0.2, -0.3, -0.5], leftRestM: [-0.3, -0.8, -0.5], twoHandAnchorM: [0, -0.4, -0.7],
  palmOffsetM: [0, 0, -0.06], handFollowPerS: 1000, reachM: 2, transitionS: 0.2,
  rotateStepDeg: 15, swayMPerPx: 0, swayMaxM: 0, swayReturnPerS: 10, bobAmplitudeM: 0, bobCyclesPerM: 1,
  swing: { durationS: 0.3, grabAtPhase: 0.35, offsetM: [-0.1, 0.05, -0.08], rotDeg: [-40, -20, -20] },
};
const fakeAssets = { create: async () => createPlaceholderBox([0.3, 0.2, 0.2], '#000000') };

async function setup() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(camera);
  const m = new EquipmentManager(scene, registry, fakeAssets, new SignalBus(contactRouter(0.02)));
  await m.load(parseSetup({
    version: 1,
    equipment: [
      { id: 's', type: 'test-source', positionM: [-0.15, 0, 1], params: { voltageV: 7 } },
      { id: 'p', type: 'test-probe', positionM: [0.15, 0, 1] },
      { id: 'r', type: 'test-source', positionM: [2, 0, 2], rotationYDeg: 30 },
    ],
  }, registry.definitions));
  const right = new THREE.Object3D();
  const left = new THREE.Object3D();
  const hand = new Hand(camera, right, left, m, cfg);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      hand.update(1 / 60, { x: 0, y: 0 }, 0);
      m.update(1 / 60);
    }
  };
  return { m, hand, run, right, left, probe: m.get('p')!, source: m.get('s')!, rotated: m.get('r')! };
}

describe('Hand: 집기', () => {
  it('휘두르기 중간(grabAtPhase)에 잡히며 연결이 끊기고, 끝나면 들고 있는 상태', async () => {
    const { hand, run, probe, source } = await setup();
    run(0.1);
    expect(probe.readouts.voltageV).toBe(7);
    hand.pick(source, 0);
    expect(hand.busy).toBe(true);
    run(0.05); // 스윙 위상 ≈ 0.17 < 0.35 → 아직 안 잡힘
    expect(source.held).toBe(false);
    run(0.1); // 위상 ≈ 0.5 → 잡힘
    expect(source.held).toBe(true);
    run(0.1);
    expect(probe.readouts.voltageV).toBeNull();
    run(0.4);
    expect(hand.busy).toBe(false);
    expect(hand.heldInstance?.id).toBe('s');
  });

  it('한 손 장비: grip 점이 오른손 손바닥(rightRestM)에, 왼손은 쉬는 자리', async () => {
    const { hand, run, source, right, left } = await setup();
    hand.pick(source, 0);
    run(1);
    // 장비 위치 = (0.2, -0.3, -0.5) − (0, 0.2, 0) = (0.2, -0.5, -0.5)
    expect(source.object.position.x).toBeCloseTo(0.2);
    expect(source.object.position.y).toBeCloseTo(-0.5);
    expect(source.object.position.z).toBeCloseTo(-0.5);
    // 손 모델 = 손바닥 − palmOffset
    expect(right.position.z).toBeCloseTo(-0.5 + 0.06);
    expect(left.position.y).toBeCloseTo(-0.8);
  });

  it('두 손 장비: grip 가운데가 twoHandAnchorM 에, 두 손이 각 grip 점에', async () => {
    const { hand, run, probe, right, left } = await setup();
    hand.pick(probe, 0);
    run(1);
    // 장비 위치 = (0, -0.4, -0.7) − (0, 0.2, 0)
    expect(probe.object.position.x).toBeCloseTo(0);
    expect(probe.object.position.y).toBeCloseTo(-0.6);
    // 왼손바닥 (-0.12, -0.4, -0.7), 오른손바닥 (0.12, -0.4, -0.7)
    expect(left.position.x).toBeCloseTo(-0.12);
    expect(right.position.x).toBeCloseTo(0.12);
    expect(left.position.y).toBeCloseTo(-0.4);
  });

  it('두 손 장비를 180° 돌려도 손이 엇갈리지 않는다', async () => {
    const { hand, run, probe, right, left } = await setup();
    hand.pick(probe, 0);
    run(1);
    for (let i = 0; i < 12; i++) hand.rotateHeld(1); // 12 × 15° = 180°
    run(1);
    expect(left.position.x).toBeLessThan(right.position.x);
  });

  it('집을 때 보이던 방향 유지: 장비 30°, 플레이어 0° → 손 기준 30°', async () => {
    const { hand, rotated } = await setup();
    hand.pick(rotated, 0);
    expect(hand.heldYawOffsetRad).toBeCloseTo(Math.PI / 6);
  });
});

describe('Hand: 놓기·떨어뜨리기', () => {
  it('놓으면: 끝난 뒤 월드 자세·세팅 갱신, 신호 다시 연결', async () => {
    const { m, hand, run, probe, source } = await setup();
    hand.pick(source, 0);
    run(1);
    hand.place({ positionM: [-0.15, 0, 1], yawRad: 0 });
    expect(hand.busy).toBe(true);
    run(1);
    expect(hand.heldInstance).toBeNull();
    expect(source.held).toBe(false);
    expect(source.object.parent).toBe(m.group);
    expect(source.object.position.x).toBeCloseTo(-0.15);
    expect(m.toSetupItems()[0].positionM).toEqual([-0.15, 0, 1]);
    expect(probe.readouts.voltageV).toBe(7);
  });

  it('떨어뜨리면: 스윙 없이 바로 손에서 떨어지고, 끝나면 그 자리에 놓인다', async () => {
    const { m, hand, run, source } = await setup();
    hand.pick(source, 0);
    run(1);
    hand.drop({ positionM: [-1, 0, 1], yawRad: Math.PI / 2 });
    expect(source.object.parent).toBe(m.group); // 즉시 손에서 떨어짐
    run(1);
    expect(source.held).toBe(false);
    expect(m.toSetupItems()[0].positionM).toEqual([-1, 0, 1]);
    expect(m.toSetupItems()[0].rotationYDeg).toBeCloseTo(90);
  });

  it('들고 있지 않으면 drop/place 는 아무 일도 안 한다', async () => {
    const { hand } = await setup();
    hand.drop({ positionM: [0, 0, 0], yawRad: 0 });
    hand.place({ positionM: [0, 0, 0], yawRad: 0 });
    expect(hand.busy).toBe(false);
  });
});
