// 손·배치 관련 순수 함수 (DOM·three 의존 없음 → 단위 테스트 대상). 물리 규칙 아님.

import type { Vec3 } from '../config/types';

/** 0→1 부드러운 보간 계수 (시작·끝 속도 0). t 는 [0,1] 로 자른다. */
export function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** 각도를 (-π, π] 로. */
export function wrapAngleRad(a: number): number {
  const twoPi = 2 * Math.PI;
  let r = ((a + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  if (r === -Math.PI) r = Math.PI;
  return r;
}

/**
 * 손에 든 장비의 손 좌표계 기준 위치.
 * 장비의 grip 점(장비 로컬)이 손의 gripAnchor(손 로컬)에 오도록 한다.
 * 장비는 손 기준으로 y축 yawRad 만큼 돌아가 있다.
 *   position = anchor − R_y(yaw)·grip
 */
export function heldLocalPosition(gripAnchorM: Vec3, gripPointM: Vec3, yawRad: number): Vec3 {
  const [gx, gy, gz] = gripPointM;
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  // R_y(yaw)·grip (three.js rotation.y 와 같은 방향)
  const rx = gx * c + gz * s;
  const rz = -gx * s + gz * c;
  return [gripAnchorM[0] - rx, gripAnchorM[1] - gy, gripAnchorM[2] - rz];
}

/** 내려놓을 때 장비의 월드 yaw = 플레이어 yaw + 손에서 돌린 각도. */
export function placementYawRad(playerYawRad: number, heldYawOffsetRad: number): number {
  return wrapAngleRad(playerYawRad + heldYawOffsetRad);
}

/** 두 점 사이 거리가 reach 이하인가. */
export function withinReach(a: Vec3, b: Vec3, reachM: number): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= reachM;
}

export interface SwayState {
  x: number;
  y: number;
}

/**
 * 손 흔들림(시점을 돌릴 때 손이 살짝 뒤따라오는 느낌).
 * 드래그 반대 방향으로 밀렸다가 지수적으로 원위치. 크기는 maxM 로 제한.
 */
export function swayStep(
  prev: SwayState,
  lookDxPx: number,
  lookDyPx: number,
  dtS: number,
  cfg: { swayMPerPx: number; swayMaxM: number; swayReturnPerS: number },
): SwayState {
  const decay = Math.exp(-cfg.swayReturnPerS * dtS);
  const clamp = (v: number): number => Math.max(-cfg.swayMaxM, Math.min(cfg.swayMaxM, v));
  return {
    x: clamp(prev.x * decay - lookDxPx * cfg.swayMPerPx),
    y: clamp(prev.y * decay + lookDyPx * cfg.swayMPerPx),
  };
}

/** 걸을 때 손 위아래 흔들림. walkedM = 누적 이동 거리. */
export function bobOffsetM(walkedM: number, cfg: { bobAmplitudeM: number; bobCyclesPerM: number }): number {
  return cfg.bobAmplitudeM * Math.sin(2 * Math.PI * cfg.bobCyclesPerM * walkedM);
}
