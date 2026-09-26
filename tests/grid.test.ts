// 격자 배치 규칙 테스트 (물리 규칙 아님). 기대값은 손계산.
import { describe, expect, it } from 'vitest';
import {
  cellInsideRoom, cellKey, cellToWorld, checkCells, circleOffsets, footprintCells, nearestAllowedCenter, worldToCell,
} from '../src/grid/grid';

const C = 0.05; // 셀 5 cm
const room = { widthM: 10, depthM: 10, heightM: 3 };
const inRoom = (c: readonly [number, number]) => cellInsideRoom(c, C, room);

describe('셀 ↔ 월드 (셀 중심 = k·c)', () => {
  it('worldToCell: 가장 가까운 셀', () => {
    expect(worldToCell(-0.15, 1, C)).toEqual([-3, 20]);
    expect(worldToCell(0.024, -0.026, C)).toEqual([0, -1]);
  });
  it('cellToWorld: 부동소수 잡음 없이 (−3·0.05 = −0.15 정확히)', () => {
    expect(cellToWorld([-3, 20], C)).toEqual([-0.15, 1]);
  });
});

describe('circleOffsets (원이 조금이라도 들어가는 셀, 보수적)', () => {
  // 셀 (i, j) 에서 원 중심에 가장 가까운 점까지 거리(셀 단위) a = max(|k| − 0.5, 0) → a_i² + a_j² < (r/c)²
  it('r = 0.10 m (r/c = 2, 기준 4): |i|≤1 → |j|≤2 (5+5+5) + |i|=2(a²=2.25) → |j|≤1 (3+3) = 21셀', () => {
    expect(circleOffsets(0.1, C)).toHaveLength(21);
  });
  it('0.3×0.2 상자에 외접하는 r = 0.18028 m (기준 13): 9 + 18 + 14 + 14 + 6 = 61셀, 가로로 ±4셀', () => {
    const o = circleOffsets(Math.hypot(0.15, 0.1), C);
    expect(o).toHaveLength(61);
    expect(Math.max(...o.map(([i]) => i))).toBe(4);
  });
  it('셀보다 작은 원(r = 0.02 m) → 중심 셀 1개', () => {
    expect(circleOffsets(0.02, C)).toEqual([[0, 0]]);
  });
  it('원이 옆 셀 경계에 접하기만 하면(r = 0.025 m) 그 셀은 제외 → 1개', () => {
    expect(circleOffsets(0.025, C)).toEqual([[0, 0]]);
  });
  it('원 전체가 셀들 안에 들어간다: 원 위의 점 72개가 모두 차지 셀 안', () => {
    const r = 0.18;
    const keys = new Set(circleOffsets(r, C).map(cellKey));
    for (let k = 0; k < 72; k++) {
      const t = (k / 72) * 2 * Math.PI;
      const x = r * 0.999 * Math.cos(t);
      const z = r * 0.999 * Math.sin(t);
      expect(keys.has(cellKey(worldToCell(x, z, C)))).toBe(true);
    }
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
  const offsets = circleOffsets(0.1, C); // 가로 ±2셀
  it('중심 간 5셀(0.25 m): −2..2 와 3..7 → 안 겹침', () => {
    const occupied = new Set(footprintCells([0, 0], offsets).map(cellKey));
    expect(checkCells(footprintCells([5, 0], offsets), occupied, inRoom)).toEqual({ ok: true });
  });
  it('중심 간 4셀(0.20 m): 2 를 함께 차지 → overlap', () => {
    const occupied = new Set(footprintCells([0, 0], offsets).map(cellKey));
    expect(checkCells(footprintCells([4, 0], offsets), occupied, inRoom)).toEqual({ ok: false, reason: 'overlap' });
  });
  it('벽 옆: 중심 k = 98 이면 100 셀이 방 밖 → outside, 97 은 안', () => {
    expect(checkCells(footprintCells([98, 0], offsets), new Set(), inRoom)).toEqual({ ok: false, reason: 'outside' });
    expect(checkCells(footprintCells([97, 0], offsets), new Set(), inRoom).ok).toBe(true);
  });
});

describe('nearestAllowedCenter (면 안으로 끌어당기기)', () => {
  const offsets = circleOffsets(0.1, C); // ±2셀
  // 폭 5셀짜리 띠(j = −2..2)만 허용 → 중심은 j = 0 한 줄만 가능
  const strip = (c: readonly [number, number]) => Math.abs(c[1]) <= 2;
  it('이미 들어가면 그대로', () => {
    expect(nearestAllowedCenter([3, 0], offsets, strip, 3)).toEqual([3, 0]);
  });
  it('j = 2 로 조준해도 가장 가까운 j = 0 으로 (2셀 이동)', () => {
    expect(nearestAllowedCenter([3, 2], offsets, strip, 3)).toEqual([3, 0]);
  });
  it('허용 범위(maxShift) 안에 없으면 null', () => {
    expect(nearestAllowedCenter([3, 5], offsets, strip, 3)).toBeNull();
  });
});

