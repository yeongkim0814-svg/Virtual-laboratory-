// 케이블 경로 테스트 (기하·배치 규칙, 물리 규칙 아님). 기대값은 손계산.
import { describe, expect, it } from 'vitest';
import {
  endStub, routeCable, segmentClear, segmentDistance, type CableEnd, type Circle, type RouteConfig,
} from '../src/signal/cableRoute';

const cfg: RouteConfig = {
  cellSizeM: 0.05, room: { widthM: 10, depthM: 10, heightM: 3 },
  floorYM: 0, liftM: 0, portStubM: 0.03, clearanceM: 0.01, maxLengthM: 2,
};
const A: Circle = { xM: -0.3, zM: 0, rM: 0.18 };
const B: Circle = { xM: 0.3, zM: 0, rM: 0.18 };
const endA: CableEnd = { portM: [-0.15, 0.1, 0], body: A, fallbackDir: [1, 0] };
const endB: CableEnd = { portM: [0.15, 0.1, 0], body: B, fallbackDir: [-1, 0] };
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
    const s = endStub(endA, cfg);
    expect(s.exit[0]).toBeCloseTo(-0.11);
    expect(s.stub).toHaveLength(3);
    expect(s.stub[1][0]).toBeCloseTo(-0.12);
  });
  it('들고 있는 장비(body = null): 포트에서 바로 아래 바닥으로', () => {
    const s = endStub({ portM: [0.5, 0.8, 0.5], body: null, fallbackDir: [1, 0] }, cfg);
    expect(s.stub).toEqual([[0.5, 0.8, 0.5], [0.5, 0, 0.5]]);
  });
});

describe('routeCable', () => {
  it('사이에 아무것도 없으면 직선: 0.22 + 2 × 0.130499 = 0.480998 m', () => {
    const r = routeCable(endA, endB, [A, B], cfg)!;
    expect(r.lengthM).toBeCloseTo(0.22 + 2 * STUB, 5);
    expect(r.pointsM).toHaveLength(6);
  });
  it('사이에 장비(원 r = 0.06)가 있으면 돌아간다: 바닥 길이 ≥ 원을 감는 최단 거리 0.253634 m', () => {
    // 최단 = 접선 2개 √(0.11² − 0.06²) × 2 + 호 0.06 × (π − 2·acos(0.06/0.11))
    const C: Circle = { xM: 0, zM: 0, rM: 0.06 };
    const r = routeCable(endA, endB, [A, B, C], cfg)!;
    const floor = r.lengthM - 2 * STUB;
    expect(floor).toBeGreaterThanOrEqual(0.253634 - 1e-4);
    expect(floor).toBeLessThan(0.3);
    const pts = r.pointsM;
    for (let i = 1; i < pts.length; i++) {
      expect(segmentClear(pts[i - 1][0], pts[i - 1][2], pts[i][0], pts[i][2], [C])).toBe(true);
    }
  });
  it('최대 길이를 넘으면 null: 1.42 + 0.260998 = 1.680998 m', () => {
    const far: CableEnd = { portM: [1.35, 0.1, 0], body: { xM: 1.5, zM: 0, rM: 0.18 }, fallbackDir: [-1, 0] };
    expect(routeCable(endA, far, [A], { ...cfg, maxLengthM: 1.6 })).toBeNull();
    expect(routeCable(endA, far, [A], { ...cfg, maxLengthM: 1.7 })!.lengthM).toBeCloseTo(1.680998, 5);
  });
  it('길이 막혀 있으면 null (좁은 방을 가로막은 장비)', () => {
    const narrow = { ...cfg, room: { widthM: 2, depthM: 0.4, heightM: 3 } };
    const wall: Circle = { xM: 0, zM: 0, rM: 0.3 };
    const l: CableEnd = { portM: [-0.6, 0, 0], body: null, fallbackDir: [1, 0] };
    const r: CableEnd = { portM: [0.6, 0, 0], body: null, fallbackDir: [1, 0] };
    expect(routeCable(l, r, [wall], narrow)).toBeNull();
  });
});
