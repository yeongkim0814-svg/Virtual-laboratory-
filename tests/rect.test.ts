// 회전된 직사각형 기하 테스트 (물리 규칙 아님). 기대값은 손계산.
import { describe, expect, it } from 'vitest';
import {
  cellInsideRect, cellNearRect, nearestEdge, pointInRect, pushOutOfRect, segmentHitsRect, toLocal, toWorld, type Rect,
} from '../src/geom/rect';

const r: Rect = { xM: 1, zM: 2, hxM: 0.5, hzM: 0.25, yawRad: 0 };
const r90: Rect = { ...r, yawRad: Math.PI / 2 };

describe('rect', () => {
  it('toLocal / toWorld 는 서로 역: 90° 회전이면 로컬 x=0.5 → 월드 (1, 1.5)', () => {
    const w = toWorld(r90, 0.5, 0);
    expect(w[0]).toBeCloseTo(1);
    expect(w[1]).toBeCloseTo(1.5);
    const l = toLocal(r90, w[0], w[1]);
    expect(l[0]).toBeCloseTo(0.5);
    expect(l[1]).toBeCloseTo(0);
  });
  it('pointInRect: 경계 포함, 90° 회전하면 가로·세로가 바뀐다', () => {
    expect(pointInRect(r, 1.5, 2)).toBe(true);
    expect(pointInRect(r, 1.51, 2)).toBe(false);
    expect(pointInRect(r90, 1.2, 2)).toBe(true); // x 반폭 0.25
    expect(pointInRect(r90, 1.3, 2)).toBe(false);
  });
  it('cellInsideRect(셀 5 cm): 셀 (29, 40) = x 1.425..1.475 → 안, (30, 40) = 1.475..1.525 → 밖', () => {
    expect(cellInsideRect(r, [29, 40], 0.05)).toBe(true);
    expect(cellInsideRect(r, [30, 40], 0.05)).toBe(false);
  });
  it('cellNearRect: 사각형에 걸치는 셀은 반드시 포함(보수적)', () => {
    expect(cellNearRect(r, [30, 40], 0.05)).toBe(true);
    expect(cellNearRect(r, [32, 40], 0.05)).toBe(false); // 중심 1.6, 넓힌 반폭 0.5 + 0.0354
  });
  it('segmentHitsRect: 가로지르면 true, 옆으로 지나면 false', () => {
    expect(segmentHitsRect(r, 0, 2, 2, 2)).toBe(true);
    expect(segmentHitsRect(r, 0, 2.3, 2, 2.3)).toBe(false);
    expect(segmentHitsRect(r, 0, 2.25, 2, 2.25)).toBe(false); // 경계를 스침
  });
  it('nearestEdge: (1.1, 2.2) → 가장 가까운 변은 +z(0.05 거리), 점 (1.1, 2.25), 바깥 방향 (0, 1)', () => {
    const e = nearestEdge(r, 1.1, 2.2);
    expect(e.pointM[0]).toBeCloseTo(1.1);
    expect(e.pointM[1]).toBeCloseTo(2.25);
    expect(e.outward[0]).toBeCloseTo(0);
    expect(e.outward[1]).toBeCloseTo(1);
  });
  it('pushOutOfRect(반지름 0.3): 겹치면 가장 가까운 바깥으로, 안 겹치면 그대로', () => {
    const p = pushOutOfRect(r, 1.7, 2, 0.3); // 넓힌 반폭 0.8 → x 1.8 까지 겹침 → 1.8 로
    expect(p[0]).toBeCloseTo(1.8);
    expect(p[1]).toBeCloseTo(2);
    expect(pushOutOfRect(r, 1.9, 2, 0.3)).toEqual([1.9, 2]); // 0.9 > 0.8 → 안 겹침
  });
});
