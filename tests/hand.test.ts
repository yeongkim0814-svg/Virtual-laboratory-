// 손으로 집기·들기·놓기 흐름 테스트 (상태·자세, 물리 규칙 아님).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EquipmentManager } from '../src/equipment/equipmentManager';
import { loadEquipmentRegistry } from '../src/equipment/registry';
import { parseSetup } from '../src/equipment/setup';
import { Hand } from '../src/hand/hand';
import type { HandConfig } from '../src/config/types';
import { contactRouter, SignalBus } from '../src/signal/signalBus';

const registry = loadEquipmentRegistry();
const cfg: HandConfig = {
  restPositionM: [0.2, -0.3, -0.5], gripAnchorM: [0, 0, -0.06], reachM: 2, transitionS: 0.25,
  rotateStepDeg: 15, swayMPerPx: 0, swayMaxM: 0, swayReturnPerS: 10, bobAmplitudeM: 0, bobCyclesPerM: 1,
};

async function setup() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(camera);
  const m = new EquipmentManager(scene, registry, { create: async () => new THREE.Object3D() }, new SignalBus(contactRouter(0.02)));
  await m.load(parseSetup({
    version: 1,
    equipment: [
      { id: 's', type: 'test-source', positionM: [-0.15, 0, 1], params: { voltageV: 7 } },
      { id: 'p', type: 'test-probe', positionM: [0.15, 0, 1] },
      { id: 'r', type: 'test-probe', positionM: [2, 0, 2], rotationYDeg: 30 },
    ],
  }, registry.definitions));
  const hand = new Hand(camera, new THREE.Object3D(), m, cfg);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      hand.update(1 / 60, { x: 0, y: 0 }, 0);
      m.update(1 / 60);
    }
  };
  return { m, hand, run, probe: m.get('p')!, source: m.get('s')!, rotated: m.get('r')! };
}

describe('Hand', () => {
  it('집으면: 즉시 신호가 끊기고, transitionS 뒤 들고 있는 상태', async () => {
    const { hand, run, probe, source } = await setup();
    run(0.1);
    expect(probe.readouts.voltageV).toBe(7);
    hand.pick(source, 0);
    expect(hand.busy).toBe(true);
    run(0.1);
    expect(probe.readouts.voltageV).toBeNull();
    run(0.3);
    expect(hand.busy).toBe(false);
    expect(hand.heldInstance?.id).toBe('s');
  });

  it('들고 있을 때 grip 점이 손바닥(anchor)에 온다', async () => {
    const { hand, run, source } = await setup();
    hand.pick(source, 0);
    run(1);
    // 손 로컬: anchor (0,0,-0.06) − grip (0,0.2,0) = (0, −0.2, −0.06)
    const p = source.object.position;
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-0.2);
    expect(p.z).toBeCloseTo(-0.06);
  });

  it('집을 때 보이던 방향 유지: 장비 30°, 플레이어 0° → 손 기준 30°', async () => {
    const { hand, rotated } = await setup();
    hand.pick(rotated, 0);
    expect(hand.heldYawOffsetRad).toBeCloseTo(Math.PI / 6);
  });

  it('회전 버튼 2번(+15° ×2) → 손 기준 30°', async () => {
    const { hand, run, source } = await setup();
    hand.pick(source, 0);
    run(0.5);
    hand.rotateHeld(1);
    hand.rotateHeld(1);
    expect(hand.heldYawOffsetRad).toBeCloseTo(Math.PI / 6);
  });

  it('놓으면: transitionS 뒤 월드 자세·세팅 갱신, 신호 다시 연결', async () => {
    const { m, hand, run, probe, source } = await setup();
    hand.pick(source, 0);
    run(0.5);
    hand.place({ positionM: [-0.15, 0, 1], yawRad: 0 });
    run(0.5);
    expect(hand.heldInstance).toBeNull();
    expect(source.held).toBe(false);
    expect(source.object.parent).toBe(m.group);
    expect(source.object.position.x).toBeCloseTo(-0.15);
    expect(m.toSetupItems()[0].positionM).toEqual([-0.15, 0, 1]);
    expect(probe.readouts.voltageV).toBe(7);
  });

  it('다른 자리에 놓으면 연결 끊김 + 저장 위치 반영', async () => {
    const { m, hand, run, probe, source } = await setup();
    hand.pick(source, 0);
    run(0.5);
    hand.place({ positionM: [-1, 0, 1], yawRad: Math.PI / 2 });
    run(0.5);
    expect(probe.readouts.voltageV).toBeNull();
    expect(m.toSetupItems()[0].positionM).toEqual([-1, 0, 1]);
    expect(m.toSetupItems()[0].rotationYDeg).toBeCloseTo(90);
  });
});
