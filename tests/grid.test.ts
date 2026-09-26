// 격자 배치 규칙 테스트 (물리 규칙 아님). 기대값은 손계산.
import { describe, expect, it } from 'vitest';
import {
  cellInsideRoom, cellKey, cellToWorld, checkCells, circleOffsets, footprintCells, worldToCell,
} from '../src/grid/grid';

const C = 0.05; // 셀 5 cm
const room = { widthM: 10, depthM: 10, heightM: 3 };

describe('셀 ↔ 월드 (셀 중심 = k·c)', () => {
  it('worldToCell: 가장 가까운 셀', () => {
    expect(worldToCell(-0.15, 1, C)).toEqual([-3, 20]);
    expect(worldToCell(0.024, -0.026, C)).toEqual([0, -1]);
  });
  it('cellToWorld: 부동소수 잡음 없이 (−3·0.05 = −0.15 정확히)', () => {
    expect(cellToWorld([-3, 20], C)).toEqual([-0.15, 1]);
  });
});

describe('circleOffsets (셀 중심까지 거리 ≤ 반지름)', () => {
  it('r = 0.14 m, c = 0.05 m: i²+j² ≤ 7.84 → 5×5 에서 네 모서리(2,2) 제외 = 21셀', () => {
    const o = circleOffsets(0.14, C);
    expect(o).toHaveLength(21);
    expect(o.some(([i, j]) => i === 2 && j === 2)).toBe(false);
    expect(o.some(([i, j]) => i === 2 && j === 1)).toBe(true); // √5·0.05 ≈ 0.112
  });
  it('경계 포함: r = 0.10 m → (2,0) 거리 0.10 포함, (2,1) 0.112 제외 → i²+j² ≤ 4 = 13셀', () => {
    expect(circleOffsets(0.1, C)).toHaveLength(13);
  });
  it('셀보다 작은 원(r = 0.02 m) → 중심 셀 1개', () => {
    expect(circleOffsets(0.02, C)).toEqual([[0, 0]]);
  });
  it('원은 x·z 대칭 → 90° 회전해도 같은 셀 집합', () => {
    const o = circleOffsets(0.14, C);
    const keys = new Set(o.map(cellKey));
    for (const [i, j] of o) expect(keys.has(cellKey([-j, i]))).toBe(true);
  });
});

describe('cellInsideRoom (셀이 방 안에 완전히)', () => {
  it('10 m 방: k = 99 → 4.95 + 0.025 = 4.975 ≤ 5 → 안 / k = 100 → 5.025 → 밖', () => {
    expect(cellInsideRoom([99, 0], C, room)).toBe(true);
    expect(cellInsideRoom([100, 0], C, room)).toBe(false);
    expect(cellInsideRoom([0, -100], C, room)).toBe(false);
  });
});

describe('checkCells', () => {
  const offsets = circleOffsets(0.14, C); // 반경 2셀
  it('중심 간 6셀(0.30 m): 차지 셀 −5..−1 과 1..5 → 안 겹침', () => {
    const occupied = new Set(footprintCells([-3, 0], offsets).map(cellKey));
    expect(checkCells(footprintCells([3, 0], offsets), occupied, C, room)).toEqual({ ok: true });
  });
  it('중심 간 4셀(0.20 m): 셀 공유 → overlap', () => {
    const occupied = new Set(footprintCells([-2, 0], offsets).map(cellKey));
    expect(checkCells(footprintCells([2, 0], offsets), occupied, C, room)).toEqual({ ok: false, reason: 'overlap' });
  });
  it('중심 간 5셀(0.25 m): −4..0 과 1..5 → 맞닿지만 안 겹침', () => {
    const occupied = new Set(footprintCells([-2, 0], offsets).map(cellKey));
    expect(checkCells(footprintCells([3, 0], offsets), occupied, C, room).ok).toBe(true);
  });
  it('벽 옆: 중심 k = 98 이면 98+2 = 100 셀이 방 밖 → outside', () => {
    expect(checkCells(footprintCells([98, 0], offsets), new Set(), C, room)).toEqual({ ok: false, reason: 'outside' });
    expect(checkCells(footprintCells([97, 0], offsets), new Set(), C, room).ok).toBe(true);
  });
});
