// 손·배치 계산 테스트 (기하·보간, 물리 규칙 아님). 기대값은 손계산 가능한 단순 값.
import { describe, expect, it } from 'vitest';
import {
  assignHands, bobOffsetM, gripCenter, heldLocalPosition, placementYawRad, rotateY, smoothstep, swayStep, swingPose,
  twoHandYawRad, withinReach, wrapAngleRad,
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

describe('heldLocalPosition (grip 점들의 가운데가 anchor 에 오도록)', () => {
  it('한 손, 회전 0: anchor − grip', () => {
    // anchor (0,0,-0.06), grip (0,0.2,0) → (0, -0.2, -0.06)
    const p = heldLocalPosition([0, 0, -0.06], [[0, 0.2, 0]], 0);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(-0.2);
    expect(p[2]).toBeCloseTo(-0.06);
  });
  it('한 손, 90° 회전: grip (0.1, 0, 0) 은 R·grip = (0, 0, -0.1) → 위치 (0, 0, 0.1)', () => {
    const p = heldLocalPosition([0, 0, 0], [[0.1, 0, 0]], Math.PI / 2);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(0);
    expect(p[2]).toBeCloseTo(0.1);
  });
  it('두 손: grip (-0.12, 0.2, 0), (0.12, 0.2, 0) 의 가운데 (0, 0.2, 0) 이 anchor (0, -0.4, -0.7) 에', () => {
    const p = heldLocalPosition([0, -0.4, -0.7], [[-0.12, 0.2, 0], [0.12, 0.2, 0]], 0);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(-0.6);
    expect(p[2]).toBeCloseTo(-0.7);
  });
});

describe('rotateY / gripCenter', () => {
  it('rotateY 90°: (1, 2, 0) → (0, 2, -1)', () => {
    const r = rotateY([1, 2, 0], Math.PI / 2);
    expect(r[0]).toBeCloseTo(0);
    expect(r[1]).toBeCloseTo(2);
    expect(r[2]).toBeCloseTo(-1);
  });
  it('gripCenter: (0,0,0), (0.2,0.4,-0.2) → (0.1, 0.2, -0.1)', () => {
    const c = gripCenter([[0, 0, 0], [0.2, 0.4, -0.2]]);
    expect(c[0]).toBeCloseTo(0.1);
    expect(c[1]).toBeCloseTo(0.2);
    expect(c[2]).toBeCloseTo(-0.1);
  });
});

describe('assignHands', () => {
  it('한 점 → 오른손만', () => {
    expect(assignHands([[1, 2, 3]])).toEqual({ right: [1, 2, 3], left: null });
  });
  it('두 점 → x 가 작은 쪽이 왼손 (순서가 바뀌어도 같음)', () => {
    expect(assignHands([[0.1, 0, 0], [-0.1, 0, 0]])).toEqual({ left: [-0.1, 0, 0], right: [0.1, 0, 0] });
    expect(assignHands([[-0.1, 0, 0], [0.1, 0, 0]])).toEqual({ left: [-0.1, 0, 0], right: [0.1, 0, 0] });
  });
});

describe('twoHandYawRad (두 grip 을 잇는 선이 몸 좌우와 나란하게)', () => {
  const g: [number, number, number][] = [[-0.12, 0.2, 0], [0.12, 0.2, 0]];
  it('grip 이 로컬 x 축: 0° 또는 180° 중 가까운 쪽 (30° → 0°, 150° → 180°)', () => {
    expect(twoHandYawRad(g, (30 * Math.PI) / 180)).toBeCloseTo(0);
    expect(Math.abs(twoHandYawRad(g, (150 * Math.PI) / 180))).toBeCloseTo(Math.PI);
  });
  it('grip 이 로컬 z 축 (0,0,−0.1)→(0,0,0.1): atan2(0.2, 0) = 90° 또는 −90°', () => {
    const gz: [number, number, number][] = [[0, 0, -0.1], [0, 0, 0.1]];
    expect(twoHandYawRad(gz, 1)).toBeCloseTo(Math.PI / 2);
    expect(twoHandYawRad(gz, -1)).toBeCloseTo(-Math.PI / 2);
  });
  it('결과 회전 후 두 grip 의 z 가 같다(앞뒤로 겹치지 않음)', () => {
    const gz: [number, number, number][] = [[0.05, 0, -0.1], [-0.03, 0, 0.12]];
    const yaw = twoHandYawRad(gz, 0.7);
    const [a, b] = gz.map((p) => rotateY(p, yaw));
    expect(a[2]).toBeCloseTo(b[2]);
  });
});

describe('swingPose (Minecraft 식 휘두르기)', () => {
  const cfg = { offsetM: [-0.1, 0.05, -0.08] as [number, number, number], rotDeg: [-40, -20, -20] as [number, number, number] };
  it('p=0, p=1 에서 제자리', () => {
    for (const p of [0, 1]) {
      const s = swingPose(p, cfg);
      for (const v of [...s.posM, ...s.rotRad]) expect(v).toBeCloseTo(0);
    }
  });
  it('p=0.25 (√p=0.5): s1=1, s2=0, s3=sin(π/4), s4=sin(π/16)', () => {
    const s = swingPose(0.25, cfg);
    expect(s.posM[0]).toBeCloseTo(-0.1);
    expect(s.posM[1]).toBeCloseTo(0);
    expect(s.posM[2]).toBeCloseTo(-0.08 * Math.SQRT1_2);
    expect(s.rotRad[0]).toBeCloseTo((-40 * Math.PI) / 180);
    expect(s.rotRad[1]).toBeCloseTo(((-20 * Math.PI) / 180) * Math.sin(Math.PI / 16));
    expect(s.rotRad[2]).toBeCloseTo((-20 * Math.PI) / 180);
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
