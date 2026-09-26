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

/** 로컬 점을 y축으로 yawRad 회전 (three.js rotation.y 와 같은 방향). */
export function rotateY(p: Vec3, yawRad: number): Vec3 {
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

/** grip 점들의 평균(두 손이면 두 점의 가운데). */
export function gripCenter(grips: readonly Vec3[]): Vec3 {
  const n = grips.length;
  const sum = grips.reduce<Vec3>((a, g) => [a[0] + g[0], a[1] + g[1], a[2] + g[2]], [0, 0, 0]);
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

/**
 * 들고 있을 때 장비의 위치(손 좌표계). grip 점들의 가운데가 anchor 에 오도록 한다.
 *   position = anchor − R_y(yaw)·gripCenter
 */
export function heldLocalPosition(anchorM: Vec3, grips: readonly Vec3[], yawRad: number): Vec3 {
  const r = rotateY(gripCenter(grips), yawRad);
  return [anchorM[0] - r[0], anchorM[1] - r[1], anchorM[2] - r[2]];
}

/**
 * grip 점 위치들을 손에 배정. 두 점이면 x 가 작은(왼쪽) 점을 왼손에 준다.
 * (장비를 180° 돌려도 손이 엇갈리지 않게)
 */
export function assignHands(points: readonly Vec3[]): { right: Vec3; left: Vec3 | null } {
  if (points.length === 1) return { right: points[0], left: null };
  const [a, b] = points;
  return a[0] <= b[0] ? { left: a, right: b } : { left: b, right: a };
}

/**
 * 두 손 장비를 들 때 손 기준 회전: 두 grip 점을 잇는 선이 몸의 좌우(x축)와 나란하도록 한다.
 * (상자를 두 손으로 들 때 양옆을 잡는 것처럼. 앞뒤로 늘어서면 두 손이 겹친다)
 * 조건 R_y(yaw)·d 의 z 성분 = −dx·sin + dz·cos = 0 → yaw = atan2(dz, dx) 또는 그 + π.
 * 둘 중 집을 때 보이던 방향(naturalYawRad)에 가까운 쪽.
 */
export function twoHandYawRad(grips: readonly Vec3[], naturalYawRad: number): number {
  const dx = grips[1][0] - grips[0][0];
  const dz = grips[1][2] - grips[0][2];
  const a = Math.atan2(dz, dx);
  const b = wrapAngleRad(a + Math.PI);
  return Math.abs(wrapAngleRad(a - naturalYawRad)) <= Math.abs(wrapAngleRad(b - naturalYawRad)) ? wrapAngleRad(a) : b;
}

export interface SwingConfig {
  durationS: number;
  /** 스윙 중 이 위상에서 장비를 잡는다/놓는다. */
  grabAtPhase: number;
  offsetM: Vec3;
  rotDeg: Vec3;
}

/**
 * Minecraft 식 손 휘두르기(위상 p: 0→1). p=0, 1 에서 제자리.
 * 앞쪽으로 빠르게 내려쳤다가(√p) 천천히 돌아온다.
 *   s1 = sin(π√p), s2 = sin(2π√p), s3 = sin(πp), s4 = sin(πp²)
 *   위치 = (ox·s1, oy·s2, oz·s3), 회전 = (rx·s1, ry·s4, rz·s1)
 */
export function swingPose(p: number, cfg: Pick<SwingConfig, 'offsetM' | 'rotDeg'>): { posM: Vec3; rotRad: Vec3 } {
  const t = Math.max(0, Math.min(1, p));
  const sq = Math.sqrt(t);
  const s1 = Math.sin(Math.PI * sq);
  const s2 = Math.sin(2 * Math.PI * sq);
  const s3 = Math.sin(Math.PI * t);
  const s4 = Math.sin(Math.PI * t * t);
  const d = Math.PI / 180;
  return {
    posM: [cfg.offsetM[0] * s1, cfg.offsetM[1] * s2, cfg.offsetM[2] * s3],
    rotRad: [cfg.rotDeg[0] * d * s1, cfg.rotDeg[1] * d * s4, cfg.rotDeg[2] * d * s1],
  };
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
