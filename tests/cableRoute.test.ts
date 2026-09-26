// 케이블 경로 테스트 (기하·배치 규칙, 물리 규칙 아님). 기대값은 손계산.
import { describe, expect, it } from 'vitest';
import {
  endStub, routeCable, segmentClear, segmentDistance, type CableEnd, type Circle, type Plane, type RouteConfig,
} from '../src/signal/cableRoute';

const cfg: RouteConfig = {
  cellSizeM: 0.05, room: { widthM: 10, depthM: 10, heightM: 3 },
  liftM: 0, portStubM: 0.03, clearanceM: 0.01, maxLengthM: 2,
};
const onFloor = (circles: Circle[], boxes: Plane['boxes'] = []): Plane[] => [{ id: 'floor', yM: 0, region: null, circles, boxes }];
const A: Circle = { xM: -0.3, zM: 0, rM: 0.18 };
const B: Circle = { xM: 0.3, zM: 0, rM: 0.18 };
const endA: CableEnd = { portM: [-0.15, 0.1, 0], body: A, fallbackDir: [1, 0], planeId: 'floor' };
const endB: CableEnd = { portM: [0.15, 0.1, 0], body: B, fallbackDir: [-1, 0], planeId: 'floor' };
// 한쪽 끝부분 길이: 수평 0.03 + 비스듬히 hypot(0.01, 0.1) = 0.130499
const STUB = 0.03 + Math.hypot(0.01, 0.1);

describe('segmentDistance / segmentClear', () => {
  it('점 (0, 1) 에서 선분 (−1,0)→(1,0) 까지 1, 끝점 밖이면 끝점까지', () => {
    expect(segmentDistance(0, 1, -1, 0, 1, 0)).toBeCloseTo(1);
    expect(segmentDistance(3, 0, -1, 0, 1, 0)).toBeCloseTo(2);
  });
  it('원 안을 지나면 막힘, 경계에 닿기만 하면 통과', () => {
    const c = [{ xM: 0, zM: 0, rM: 0.5 }];
    expect(segmentClear(-1, 0, 1, 0, c)).toBe(false);
    expect(segmentClear(-1, 0.5, 1, 0.5, c)).toBe(true);
  });
});

describe('endStub', () => {
  it('출구점 = 장비 중심 + 포트 방향 × max(r + 여유, 포트 거리 + 0.03) = −0.3 + 0.19 = −0.11', () => {
    const s = endStub(endA, 0, cfg);
    expect(s.exit[0]).toBeCloseTo(-0.11);
    expect(s.stub).toHaveLength(3);
    expect(s.stub[1][0]).toBeCloseTo(-0.12);
  });
  it('들고 있는 장비(body = null): 포트에서 바로 아래 바닥으로', () => {
    const s = endStub({ portM: [0.5, 0.8, 0.5], body: null, fallbackDir: [1, 0], planeId: 'floor' }, 0, cfg);
    expect(s.stub).toEqual([[0.5, 0.8, 0.5], [0.5, 0, 0.5]]);
  });
});

describe('routeCable', () => {
  it('사이에 아무것도 없으면 직선: 0.22 + 2 × 0.130499 = 0.480998 m', () => {
    const r = routeCable(endA, endB, onFloor([A, B]), cfg)!;
    expect(r.lengthM).toBeCloseTo(0.22 + 2 * STUB, 5);
    expect(r.pointsM).toHaveLength(6);
  });
  it('사이에 장비(원 r = 0.06)가 있으면 돌아간다: 바닥 길이 ≥ 원을 감는 최단 거리 0.253634 m', () => {
    // 최단 = 접선 2개 √(0.11² − 0.06²) × 2 + 호 0.06 × (π − 2·acos(0.06/0.11))
    const C: Circle = { xM: 0, zM: 0, rM: 0.06 };
    const r = routeCable(endA, endB, onFloor([A, B, C]), cfg)!;
    const floor = r.lengthM - 2 * STUB;
    expect(floor).toBeGreaterThanOrEqual(0.253634 - 1e-4);
    expect(floor).toBeLessThan(0.3);
    const pts = r.pointsM;
    for (let i = 1; i < pts.length; i++) {
      expect(segmentClear(pts[i - 1][0], pts[i - 1][2], pts[i][0], pts[i][2], [C])).toBe(true);
    }
  });
  it('최대 길이를 넘으면 null: 1.42 + 0.260998 = 1.680998 m', () => {
    const far: CableEnd = { portM: [1.35, 0.1, 0], body: { xM: 1.5, zM: 0, rM: 0.18 }, fallbackDir: [-1, 0], planeId: 'floor' };
    expect(routeCable(endA, far, onFloor([A]), { ...cfg, maxLengthM: 1.6 })).toBeNull();
    expect(routeCable(endA, far, onFloor([A]), { ...cfg, maxLengthM: 1.7 })!.lengthM).toBeCloseTo(1.680998, 5);
  });
  it('길이 막혀 있으면 null (좁은 방을 가로막은 장비)', () => {
    const narrow = { ...cfg, room: { widthM: 2, depthM: 0.4, heightM: 3 } };
    const wall: Circle = { xM: 0, zM: 0, rM: 0.3 };
    const l: CableEnd = { portM: [-0.6, 0, 0], body: null, fallbackDir: [1, 0], planeId: 'floor' };
    const r: CableEnd = { portM: [0.6, 0, 0], body: null, fallbackDir: [1, 0], planeId: 'floor' };
    expect(routeCable(l, r, onFloor([wall]), narrow)).toBeNull();
  });
  it('테이블 위 장비 → 가장자리를 넘어 → 비스듬히 바닥 장비: 0.13 + 0.31 + √(0.56² + 0.75²) + 0.13 = 1.506002 m', () => {
    // 테이블 윗면 높이 0.75, 반폭 0.5, 반깊이 0.3 (원점). 테이블 위 장비 원 (0,0) r 0.1, 포트 (0.1, 0.85, 0)
    // 출구 (0.13, 0) → +z 변 (0.13, 0.3) → 윗면 높이로 여유 0.01 넘어 (0.13, 0.31)
    // → 바닥 장비 출구 (0.13, 0, 0.87) 까지 곧게 늘어뜨림(가림 없음)
    // 바닥 장비 원 (0.13, 1) r 0.1, 포트 (0.13, 0.1, 0.9) → 출구 (0.13, 0.87)
    const planes: Plane[] = [
      { id: 'floor', yM: 0, region: null, circles: [{ xM: 0.13, zM: 1, rM: 0.1 }], boxes: [] },
      { id: 't', yM: 0.75, region: { xM: 0, zM: 0, hxM: 0.5, hzM: 0.3, yawRad: 0 }, circles: [{ xM: 0, zM: 0, rM: 0.1 }], boxes: [] },
    ];
    const onTable: CableEnd = { portM: [0.1, 0.85, 0], body: { xM: 0, zM: 0, rM: 0.1 }, fallbackDir: [1, 0], planeId: 't' };
    const onFloorEnd: CableEnd = { portM: [0.13, 0.1, 0.9], body: { xM: 0.13, zM: 1, rM: 0.1 }, fallbackDir: [0, -1], planeId: 'floor' };
    const r = routeCable(onTable, onFloorEnd, planes, cfg)!;
    expect(r.lengthM).toBeCloseTo(0.13 + 0.31 + Math.hypot(0.56, 0.75) + 0.13, 5);
    expect(routeCable(onTable, onFloorEnd, planes, { ...cfg, maxLengthM: 1.45 })).toBeNull();
  });
  it('상대가 테이블 옆쪽에 있으면 가장 가까운 변이 아니라 상대 쪽 변으로 간다', () => {
    // 테이블 위 출구 (0.13, 0) → 가장 가까운 변은 +z(0.3). 상대(바닥)는 x = 1.2 쪽 → +x 변(0.5)이 더 짧다
    const planes: Plane[] = [
      { id: 'floor', yM: 0, region: null, circles: [], boxes: [] },
      { id: 't', yM: 0.75, region: { xM: 0, zM: 0, hxM: 0.5, hzM: 0.3, yawRad: 0 }, circles: [], boxes: [] },
    ];
    const onTable: CableEnd = { portM: [0.1, 0.85, 0], body: { xM: 0, zM: 0, rM: 0.1 }, fallbackDir: [1, 0], planeId: 't' };
    const held: CableEnd = { portM: [1.2, 0, 0], body: null, fallbackDir: [1, 0], planeId: 'floor' };
    const r = routeCable(onTable, held, planes, cfg)!;
    // 0.13 + (0.13 → 0.5 = 0.37) + 넘기 0.01 + (0.51, 0.75, 0) → (1.2, 0, 0) = √(0.69² + 0.75²)
    expect(r.lengthM).toBeCloseTo(0.13 + 0.38 + Math.hypot(0.69, 0.75), 5);
  });
  it('바닥의 찬장(사각형)은 피해 간다', () => {
    const box = { xM: 0, zM: 0, hxM: 0.05, hzM: 0.3, yawRad: 0 };
    const r = routeCable(endA, endB, onFloor([A, B], [box]), cfg)!;
    expect(r.lengthM).toBeGreaterThan(0.22 + 2 * STUB + 0.1);
  });
  it('테이블 위 → 바닥 케이블은 테이블 부피(케이블 반지름만큼 넓힘) 안을 지나지 않는다', () => {
    const lifted = { ...cfg, liftM: 0.006 };
    const rect = { xM: 0, zM: 0, hxM: 0.5, hzM: 0.3, yawRad: 0 };
    const planes: Plane[] = [
      { id: 'floor', yM: 0, region: null, circles: [], boxes: [] },
      { id: 't', yM: 0.75, region: rect, circles: [{ xM: 0.3, zM: 0, rM: 0.1 }], boxes: [] },
    ];
    const onTable: CableEnd = { portM: [0.4, 0.85, 0], body: { xM: 0.3, zM: 0, rM: 0.1 }, fallbackDir: [1, 0], planeId: 't' };
    // 목표: 옆, 모서리 너머, 반대편 아래(테이블 밑 바닥)
    for (const [x, z] of [[0.9, 0], [0.3, 0.8], [0.9, 0.7], [-0.2, 0.5], [0, 0]]) {
      const target: CableEnd = { portM: [x, 0, z], body: null, fallbackDir: [1, 0], planeId: 'floor' };
      const r = routeCable(onTable, target, planes, lifted)!;
      expect(r).not.toBeNull();
      const pts = r.pointsM;
      for (let i = 1; i < pts.length; i++) {
        for (let k = 0; k <= 20; k++) {
          const t = k / 20;
          const px = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
          const py = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
          const pz = pts[i - 1][2] + (pts[i][2] - pts[i - 1][2]) * t;
          const inside = Math.abs(px) < 0.5 + 0.006 - 1e-6 && Math.abs(pz) < 0.3 + 0.006 - 1e-6;
          const buried = inside && py < 0.75 + 0.006 - 1e-6 && py > 0.006 + 1e-6; // 윗면 위·바닥 위는 괜찮음
          expect(buried, `목표 (${x}, ${z}) 구간 ${i} t=${t} 점 (${px.toFixed(3)}, ${py.toFixed(3)}, ${pz.toFixed(3)})`).toBe(false);
        }
      }
    }
  });
  it('선반 위 장비의 케이블은 앞으로만 나온다(옆·뒤판을 뚫지 않음)', () => {
    // 선반 안쪽: 중심 (0, 0), 반폭 1, 반깊이 0.25, 높이 0.91, 앞 = +z. 상대는 선반 옆쪽 (2, 0, −0.1)
    const planes: Plane[] = [
      { id: 'floor', yM: 0, region: null, circles: [], boxes: [] },
      { id: 's', yM: 0.91, region: { xM: 0, zM: 0, hxM: 1, hzM: 0.25, yawRad: 0 }, circles: [{ xM: 0.8, zM: 0, rM: 0.1 }], boxes: [], openSides: [2] },
    ];
    const onShelf: CableEnd = { portM: [0.9, 1.01, 0], body: { xM: 0.8, zM: 0, rM: 0.1 }, fallbackDir: [1, 0], planeId: 's' };
    const target: CableEnd = { portM: [2, 0, -0.1], body: null, fallbackDir: [1, 0], planeId: 'floor' };
    const r = routeCable(onShelf, target, planes, cfg)!;
    // 선반 높이에서 선반 밖으로 나가는 점은 모두 앞(z ≥ 0.25) 쪽
    const leaving = r.pointsM.filter((p) => p[1] > 0.9 && (Math.abs(p[0]) > 1 || Math.abs(p[2]) > 0.25));
    expect(leaving.length).toBeGreaterThan(0);
    for (const p of leaving) expect(p[2]).toBeGreaterThanOrEqual(0.25);
  });
});

