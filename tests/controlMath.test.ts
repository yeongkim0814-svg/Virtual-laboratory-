// 조작 로직 테스트 (물리 규칙 아님). 기대값은 모두 손계산 가능한 단순 값.
import { describe, expect, it } from 'vitest';
import { applyLook, joystickInput, walkDelta } from '../src/input/controlMath';

describe('joystickInput', () => {
  it('반지름 안: 변위/반지름, 화면 위(-dy)가 전진(+y)', () => {
    // dx=30, dy=-30, r=60 → (0.5, 0.5)
    const v = joystickInput(30, -30, 60);
    expect(v.x).toBeCloseTo(0.5);
    expect(v.y).toBeCloseTo(0.5);
  });
  it('반지름 밖: 길이 1로 자름', () => {
    // dx=120, dy=0, r=60 → (1, 0)
    const v = joystickInput(120, 0, 60);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
  });
  it('대각선 밖: 방향 유지, 길이 1', () => {
    // (300, -400) → 방향 (0.6, 0.8)
    const v = joystickInput(300, -400, 60);
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(0.8);
  });
});

describe('walkDelta', () => {
  it('yaw=0 전진 → -Z 방향', () => {
    // 1.5 m/s × 1 s = 1.5 m
    const d = walkDelta(0, { x: 0, y: 1 }, 1.5, 1);
    expect(d.dxM).toBeCloseTo(0);
    expect(d.dzM).toBeCloseTo(-1.5);
  });
  it('yaw=0 오른쪽 → +X 방향', () => {
    const d = walkDelta(0, { x: 1, y: 0 }, 2, 0.5);
    expect(d.dxM).toBeCloseTo(1);
    expect(d.dzM).toBeCloseTo(0);
  });
  it('yaw=90°(왼쪽으로 돈 상태) 전진 → -X 방향', () => {
    const d = walkDelta(Math.PI / 2, { x: 0, y: 1 }, 1, 1);
    expect(d.dxM).toBeCloseTo(-1);
    expect(d.dzM).toBeCloseTo(0);
  });
});

describe('applyLook', () => {
  it('오른쪽 드래그 → yaw 감소(오른쪽 보기), 위로 드래그 → pitch 증가', () => {
    // 100px × 0.005 rad/px = 0.5 rad
    const r = applyLook(0, 0, 100, -100, 0.005, 1.5);
    expect(r.yawRad).toBeCloseTo(-0.5);
    expect(r.pitchRad).toBeCloseTo(0.5);
  });
  it('pitch 는 ±max 로 제한', () => {
    const r = applyLook(0, 0, 0, 10000, 0.005, 1.4);
    expect(r.pitchRad).toBeCloseTo(-1.4);
  });
});
