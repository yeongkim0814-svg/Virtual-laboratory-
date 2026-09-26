// 손·배치 계산 테스트 (기하·보간, 물리 규칙 아님). 기대값은 손계산 가능한 단순 값.
import { describe, expect, it } from 'vitest';
import {
  bobOffsetM, heldLocalPosition, placementYawRad, smoothstep, swayStep, withinReach, wrapAngleRad,
} from '../src/hand/handMath';
import { isTap } from '../src/input/controlMath';

describe('smoothstep', () => {
  it('0 → 0, 0.5 → 0.5, 1 → 1, 범위 밖은 자름', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(2)).toBe(1);
  });
  it('0.25 → 0.15625 (3t²−2t³)', () => expect(smoothstep(0.25)).toBeCloseTo(0.15625));
});

describe('wrapAngleRad', () => {
  it('(-π, π] 로 정규화', () => {
    expect(wrapAngleRad(3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(wrapAngleRad(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(wrapAngleRad(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngleRad(0.3)).toBeCloseTo(0.3);
  });
});

describe('heldLocalPosition (grip 점이 손바닥에 오도록)', () => {
  it('회전 0: anchor − grip', () => {
    // anchor (0,0,-0.06), grip (0,0.2,0) → (0, -0.2, -0.06)
    const p = heldLocalPosition([0, 0, -0.06], [0, 0.2, 0], 0);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(-0.2);
    expect(p[2]).toBeCloseTo(-0.06);
  });
  it('90° 회전: grip (0.1, 0, 0) 은 R·grip = (0, 0, -0.1) → 위치 (0, 0, 0.1)', () => {
    const p = heldLocalPosition([0, 0, 0], [0.1, 0, 0], Math.PI / 2);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(0);
    expect(p[2]).toBeCloseTo(0.1);
  });
});

describe('placementYawRad', () => {
  it('플레이어 yaw + 손 회전, 정규화', () => {
    expect(placementYawRad(0.5, 0.25)).toBeCloseTo(0.75);
    expect(placementYawRad(Math.PI, Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
  });
});

describe('withinReach', () => {
  it('거리 2 m 경계 포함, 2.1 m 는 밖', () => {
    expect(withinReach([0, 0, 0], [0, 2, 0], 2)).toBe(true);
    expect(withinReach([0, 0, 0], [1.2, 1.6, 0.5], 2)).toBe(false); // √4.25 ≈ 2.06
  });
});

describe('swayStep', () => {
  const cfg = { swayMPerPx: 0.001, swayMaxM: 0.03, swayReturnPerS: 10 };
  it('오른쪽 드래그 10px → 손은 왼쪽으로 0.01 m', () => {
    const s = swayStep({ x: 0, y: 0 }, 10, 0, 0, cfg);
    expect(s.x).toBeCloseTo(-0.01);
  });
  it('최대 0.03 m 로 제한', () => {
    expect(swayStep({ x: 0, y: 0 }, 1000, 0, 0, cfg).x).toBeCloseTo(-0.03);
  });
  it('입력 없으면 e^(−10·0.1) 배로 줄어든다', () => {
    expect(swayStep({ x: 0.02, y: 0 }, 0, 0, 0.1, cfg).x).toBeCloseTo(0.02 * Math.exp(-1));
  });
});

describe('bobOffsetM', () => {
  const cfg = { bobAmplitudeM: 0.01, bobCyclesPerM: 0.8 };
  it('0 m → 0, 1/4 주기(0.3125 m) → 최대 0.01 m', () => {
    expect(bobOffsetM(0, cfg)).toBeCloseTo(0);
    expect(bobOffsetM(0.3125, cfg)).toBeCloseTo(0.01);
  });
});

describe('isTap', () => {
  const cfg = { tapMaxMovePx: 10, tapMaxDurationS: 0.3 };
  it('8px, 0.2s → 탭 / 15px → 아님 / 0.5s → 아님', () => {
    expect(isTap(8, 0.2, cfg)).toBe(true);
    expect(isTap(15, 0.2, cfg)).toBe(false);
    expect(isTap(8, 0.5, cfg)).toBe(false);
  });
});
