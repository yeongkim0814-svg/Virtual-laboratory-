// 케이블 배치(경로·끊어짐) 통합 테스트 (배치 규칙, 물리 규칙 아님).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlaceholderBox } from '../src/assets/placeholder';
import type { LabFile } from '../src/config/types';
import { EquipmentManager } from '../src/equipment/equipmentManager';
import { loadEquipmentRegistry } from '../src/equipment/registry';
import { parseSetup } from '../src/equipment/setup';
import { CableLayout } from '../src/signal/cableLayout';
import { cableRouter } from '../src/signal/cables';
import { segmentClear } from '../src/signal/cableRoute';
import { SignalBus } from '../src/signal/signalBus';

const registry = loadEquipmentRegistry();
const assets = {
  create: async (name: string) =>
    createPlaceholderBox(name === 'port-marker' ? [0.03, 0.03, 0.03] : [0.3, 0.2, 0.2], '#000000'),
};
const lab = {
  room: { widthM: 10, depthM: 10, heightM: 3 },
  grid: { cellSizeM: 0.05 },
  cable: { maxLengthM: 1.5, portStubM: 0.03, clearanceM: 0.01 },
} as LabFile;

async function make(equipment: object[]) {
  const scene = new THREE.Scene();
  const m: EquipmentManager = new EquipmentManager(scene, registry, assets, new SignalBus(cableRouter(() => m.cables)), {
    grid: { cellSizeM: 0.05, room: lab.room },
    portHitRadiusM: 0,
  });
  await m.load(parseSetup({
    version: 2,
    equipment,
    cables: [{ from: { deviceId: 's', portId: 'out' }, to: { deviceId: 'p', portId: 'in' } }],
  }, registry.definitions));
  scene.updateMatrixWorld(true);
  return { m, scene, layout: new CableLayout(m, lab, 0) };
}
const src = (x: number, z = 1) => ({ id: 's', type: 'test-source', positionM: [x, 0, z] });
const probe = (x: number, z = 1) => ({ id: 'p', type: 'test-probe', positionM: [x, 0, z] });

describe('CableLayout', () => {
  it('0.6 m 간격: 경로가 있고 최대 길이(1.5 m) 안', async () => {
    const { m, layout } = await make([src(-0.3), probe(0.3)]);
    expect(layout.update()).toEqual([]);
    const route = [...layout.routes.values()][0];
    expect(route.lengthM).toBeLessThan(0.6);
    expect(m.cables).toHaveLength(1);
  });

  it('들고 멀리 가면 케이블이 빠진다', async () => {
    const { m, scene, layout } = await make([src(-0.3), probe(0.3)]);
    layout.update();
    m.setHeld('s', true);
    m.get('s')!.object.position.set(-3, 1, 1);
    scene.updateMatrixWorld(true);
    const broken = layout.update();
    expect(broken).toHaveLength(1);
    expect(m.cables).toHaveLength(0);
    expect(layout.routes.size).toBe(0);
  });

  it('들고 조금 움직이는 정도면 유지', async () => {
    const { m, scene, layout } = await make([src(-0.3), probe(0.3)]);
    layout.update();
    m.setHeld('s', true);
    m.get('s')!.object.position.set(-0.4, 0.6, 1);
    scene.updateMatrixWorld(true);
    expect(layout.update()).toEqual([]);
    expect(m.cables).toHaveLength(1);
  });

  it('처음부터 너무 먼 장비(중심 간 2 m)는 경로가 없다', async () => {
    const { layout } = await make([src(-1), probe(1)]);
    expect(layout.canRoute({ deviceId: 's', portId: 'out' }, { deviceId: 'p', portId: 'in' })).toBe(false);
  });

  it('사이에 다른 장비가 있으면 돌아가고, 어떤 구간도 장비 원을 지나지 않는다', async () => {
    // 신호원 (−0.5), 가운데 장비 (0), 수신기 (0.5): 가운데 장비를 피해 간다
    const { m, layout } = await make([src(-0.5), probe(0.5), { id: 'x', type: 'test-probe', positionM: [0, 0, 1] }]);
    expect(layout.update()).toEqual([]);
    const pts = [...layout.routes.values()][0].pointsM;
    const x = m.get('x')!;
    const circle = [{ xM: 0, zM: 1, rM: x.footprintRadiusM }];
    const floor = pts.filter((p) => p[1] < 1e-6);
    for (let i = 1; i < floor.length; i++) {
      expect(segmentClear(floor[i - 1][0], floor[i - 1][2], floor[i][0], floor[i][2], circle)).toBe(true);
    }
    expect(floor.some((p) => Math.abs(p[2] - 1) > 0.15)).toBe(true); // 옆으로 비켜 감
  });
});
