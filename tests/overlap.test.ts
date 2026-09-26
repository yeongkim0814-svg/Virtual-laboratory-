// 겹침 검사·해소 테스트 (기하, 물리 규칙 아님). 기대값은 손계산.
import { describe, expect, it } from 'vitest';
import { clampFootprintToRoom, overlapMtv, resolvePlacement } from '../src/hand/overlap';

const box = { cx: 0, cz: 0, hx: 0.15, hz: 0.1 }; // 0.3 × 0.2 m
const sq = { cx: 0, cz: 0, hx: 0.1, hz: 0.1 }; // 0.2 × 0.2 m
const at = (xM: number, zM: number, yawDeg = 0) => ({ xM, zM, yawRad: (yawDeg * Math.PI) / 180 });
const room = { widthM: 10, depthM: 10, heightM: 3 };

describe('overlapMtv', () => {
  it('중심 거리 0.25 m: x 방향 0.15+0.15−0.25 = 0.05 m 겹침 → A 를 −x 로 0.05', () => {
    const m = overlapMtv(box, at(0, 0), box, at(0.25, 0))!;
    expect(m.depthM).toBeCloseTo(0.05);
    expect(m.dxM).toBeCloseTo(-0.05);
    expect(m.dzM).toBeCloseTo(0);
  });
  it('중심 거리 0.3 m: 딱 맞닿음 → 겹침 아님', () => {
    expect(overlapMtv(box, at(0, 0), box, at(0.3, 0))).toBeNull();
  });
  it('떨어져 있음 → null', () => {
    expect(overlapMtv(box, at(0, 0), box, at(1, 1))).toBeNull();
  });
  it('B 가 90° 회전: x 반폭 0.1 → 0.15+0.1−0.25 = 0 → 맞닿음', () => {
    expect(overlapMtv(box, at(0, 0), box, at(0.25, 0, 90))).toBeNull();
  });
  it('B 가 45° 회전(모서리가 파고듦): x 방향 0.1 + 0.1·√2 − 0.24 ≈ 0.00142 m', () => {
    const m = overlapMtv(sq, at(0, 0), sq, at(0.24, 0, 45))!;
    expect(m.depthM).toBeCloseTo(0.1 + 0.1 * Math.SQRT2 - 0.24, 5);
    expect(m.dxM).toBeLessThan(0);
  });
});

describe('clampFootprintToRoom', () => {
  it('벽 밖으로 나간 0.3×0.2 상자: x 최대 5−0.15 = 4.85', () => {
    expect(clampFootprintToRoom(box, at(6, 0), room).xM).toBeCloseTo(4.85);
  });
  it('90° 회전하면 x 반폭이 0.1 → 최대 4.9', () => {
    expect(clampFootprintToRoom(box, at(6, 0, 90), room).xM).toBeCloseTo(4.9);
  });
});

describe('resolvePlacement', () => {
  it('겹치면 맞닿는 자리까지 밀어낸다', () => {
    const p = resolvePlacement(box, at(0.25, 0), [{ footprint: box, pose: at(0, 0) }], room)!;
    expect(p.xM).toBeCloseTo(0.3, 3);
    expect(overlapMtv(box, p, box, at(0, 0))).toBeNull();
  });
  it('양옆이 막힌 좁은 틈(중심 간 0.5 m → 빈 폭 0.2 m)에는 폭 0.3 m 상자를 놓지 않는다(null)', () => {
    const others = [{ footprint: box, pose: at(-0.25, 0) }, { footprint: box, pose: at(0.25, 0) }];
    expect(resolvePlacement(box, at(0, 0), others, room)).toBeNull();
  });
  it('틈이 충분하면(중심 간 0.6 m → 빈 폭 0.3 m) 딱 맞게 들어간다', () => {
    const others = [{ footprint: box, pose: at(-0.3, 0) }, { footprint: box, pose: at(0.3, 0) }];
    expect(resolvePlacement(box, at(0.01, 0), others, room)).not.toBeNull();
  });
  it('안 겹치면 그대로', () => {
    expect(resolvePlacement(box, at(2, 2), [{ footprint: box, pose: at(0, 0) }], room)).toEqual(at(2, 2));
  });
});
