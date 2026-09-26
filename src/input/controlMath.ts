// 조작 관련 순수 함수 (DOM·three 의존 없음 → 단위 테스트 대상).
// 좌표계: three.js 기본. +Y 위, yaw=0 일 때 시선은 -Z.

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * 조이스틱 중심으로부터의 손가락 변위(px, 화면 좌표: 아래가 +y)를
 * [-1, 1] 입력으로 변환. 반지름을 넘으면 길이 1 로 자른다.
 * 반환값의 y 는 "앞으로" 가 + (화면 위쪽으로 밀면 전진).
 */
export function joystickInput(dxPx: number, dyPx: number, radiusPx: number): Vec2 {
  const x = dxPx / radiusPx;
  const y = -dyPx / radiusPx;
  const len = Math.hypot(x, y);
  if (len <= 1) return { x, y };
  return { x: x / len, y: y / len };
}

/**
 * 조이스틱 입력 → 이번 프레임의 수평 이동량(m).
 * forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)  [x, z 성분]
 */
export function walkDelta(
  yawRad: number,
  input: Vec2,
  speedMPerS: number,
  dtS: number,
): { dxM: number; dzM: number } {
  const s = speedMPerS * dtS;
  const sin = Math.sin(yawRad);
  const cos = Math.cos(yawRad);
  return {
    dxM: (input.x * cos - input.y * sin) * s,
    dzM: (-input.x * sin - input.y * cos) * s,
  };
}

/**
 * 드래그(px) → 시점 회전. 오른쪽으로 끌면 오른쪽을, 위로 끌면 위를 본다.
 * pitch 는 ±maxPitchRad 로 제한.
 */
export function applyLook(
  yawRad: number,
  pitchRad: number,
  dxPx: number,
  dyPx: number,
  sensitivityRadPerPx: number,
  maxPitchRad: number,
): { yawRad: number; pitchRad: number } {
  const nextPitch = pitchRad - dyPx * sensitivityRadPerPx;
  return {
    yawRad: yawRad - dxPx * sensitivityRadPerPx,
    pitchRad: Math.max(-maxPitchRad, Math.min(maxPitchRad, nextPitch)),
  };
}

/**
 * 탭 판정: 손가락이 거의 움직이지 않고(maxMovePx 이하) 짧게(maxDurationS 이하) 뗐는가.
 * 드래그(시점 회전)·조이스틱과 구분하는 데 쓴다.
 */
export function isTap(
  movedPx: number,
  durationS: number,
  cfg: { tapMaxMovePx: number; tapMaxDurationS: number },
): boolean {
  return movedPx <= cfg.tapMaxMovePx && durationS <= cfg.tapMaxDurationS;
}

/** 길게 누르기: 거의 움직이지 않고(≤ tapMaxMovePx) longPressS 이상 누르고 있음. */
export function isLongPress(
  movedPx: number,
  heldS: number,
  cfg: { tapMaxMovePx: number; longPressS: number },
): boolean {
  return movedPx <= cfg.tapMaxMovePx && heldS >= cfg.longPressS;
}

/**
 * 회전 각도 붙임: 가장 가까운 stepDeg 배수와 windowDeg 이내면 그 배수로, 아니면 1° 단위.
 * 결과는 −180 < 각 ≤ 180.
 */
export function snapAngleDeg(rawDeg: number, stepDeg: number, windowDeg: number): number {
  const nearest = Math.round(rawDeg / stepDeg) * stepDeg;
  const d = Math.abs(rawDeg - nearest) <= windowDeg ? nearest : Math.round(rawDeg);
  let w = ((d % 360) + 360) % 360;
  if (w > 180) w -= 360;
  return w + 0;
}

/** current 를 target 쪽으로 최대 maxStep 만큼 옮긴다(앉기·서기 눈높이 전환). */
export function approach(current: number, target: number, maxStep: number): number {
  if (Math.abs(target - current) <= maxStep) return target;
  return current + Math.sign(target - current) * maxStep;
}
