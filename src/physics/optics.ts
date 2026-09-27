// 광학 1단계(레이저) — 사용자 승인 규칙 R1·R2·R4. 순수 함수 → 단위 테스트 대상.
// (R3 공기 중 손실 없음: 받는 세기 = 레이저 출력 — 라우터가 신호 값을 그대로 전달하는 것으로 구현)

import type { RoomSize, Vec3 } from '../config/types';

/** 빛을 받는 면(스크린 등). normal = 바깥쪽(빛이 들어오는 쪽), uAxis = 면의 가로 방향(단위), v = n × u. */
export interface Face {
  id: string;
  centerM: Vec3;
  normal: Vec3;
  uAxis: Vec3;
  halfWidthM: number;
  halfHeightM: number;
}

/** 빛을 막는 상자(장비 몸체·가구 부품). y 축 회전만. */
export interface OrientedBox {
  id: string;
  centerM: Vec3;
  halfM: Vec3;
  yawRad: number;
}

export type TraceHit =
  | { kind: 'face'; id: string; u: number; v: number }
  | { kind: 'box'; id: string }
  | { kind: 'room' };

export interface TraceResult {
  tM: number;
  pointM: Vec3;
  hit: TraceHit;
}

const EPS = 1e-9;
/** 면과 상자 표면이 같은 곳에 있으면(스크린 앞면) 면이 이긴다. */
const FACE_TIE_M = 1e-6;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * R1 직진(기하광학): 광선 p(t) = o + t·d (t > 0, d 단위벡터)가 처음 닿는 것.
 *   면(점 p₀, 법선 n): t = (p₀ − o)·n / (d·n). 앞쪽에서 들어올 때(d·n < 0)만, 사각형 안일 때만.
 *   상자: 로컬 좌표에서 슬랩(축별 구간 교집합) → 들어가는 t.
 *   방: 안쪽에서 벽·바닥·천장으로 나가는 t(방 = x ±w/2, y 0..h, z ±d/2).
 * 출처: 기하광학(균일 매질에서 빛의 직진) / 광선-평면·광선-상자 교차.
 * 가정: 균일한 공기, 불투명한 물체에서 멈춤(반사·투과·회절 없음), 광선 두께 0.
 * 유효범위: 빛의 파장에 비해 훨씬 큰 물체(수 mm 이상). 슬릿처럼 파장 규모의 구조는 이후 단계(회절).
 */
export function traceRay(
  o: Vec3,
  d: Vec3,
  faces: readonly Face[],
  boxes: readonly OrientedBox[],
  room: RoomSize,
): TraceResult {
  let best: { tM: number; hit: TraceHit } = { tM: roomExitT(o, d, room), hit: { kind: 'room' } };

  for (const b of boxes) {
    const t = boxEntryT(o, d, b);
    if (t !== null && t < best.tM) best = { tM: t, hit: { kind: 'box', id: b.id } };
  }
  for (const f of faces) {
    const dn = dot(d, f.normal);
    if (dn > -EPS) continue; // 나란하거나 뒤에서 옴
    const t = dot(sub(f.centerM, o), f.normal) / dn;
    if (t <= EPS || t > best.tM + FACE_TIE_M) continue;
    const p: Vec3 = [o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2]];
    const rel = sub(p, f.centerM);
    const u = dot(rel, f.uAxis);
    const v = dot(rel, cross(f.normal, f.uAxis));
    if (Math.abs(u) <= f.halfWidthM && Math.abs(v) <= f.halfHeightM) best = { tM: t, hit: { kind: 'face', id: f.id, u, v } };
  }
  const t = best.tM;
  return { tM: t, pointM: [o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2]], hit: best.hit };
}

function roomExitT(o: Vec3, d: Vec3, room: RoomSize): number {
  const lo: Vec3 = [-room.widthM / 2, 0, -room.depthM / 2];
  const hi: Vec3 = [room.widthM / 2, room.heightM, room.depthM / 2];
  let t = Infinity;
  for (let i = 0; i < 3; i++) {
    if (d[i] > EPS) t = Math.min(t, (hi[i] - o[i]) / d[i]);
    else if (d[i] < -EPS) t = Math.min(t, (lo[i] - o[i]) / d[i]);
  }
  return t;
}

function boxEntryT(o: Vec3, d: Vec3, b: OrientedBox): number | null {
  // 월드 = R(yaw)·로컬 → 로컬 = R(−yaw)·(월드 − 중심):  x = X cos − Z sin, z = X sin + Z cos
  const c = Math.cos(b.yawRad);
  const s = Math.sin(b.yawRad);
  const rx = o[0] - b.centerM[0];
  const rz = o[2] - b.centerM[2];
  const lo: Vec3 = [rx * c - rz * s, o[1] - b.centerM[1], rx * s + rz * c];
  const ld: Vec3 = [d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c];
  let tMin = -Infinity;
  let tMax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ld[i]) < EPS) {
      if (Math.abs(lo[i]) > b.halfM[i]) return null;
      continue;
    }
    let t1 = (-b.halfM[i] - lo[i]) / ld[i];
    let t2 = (b.halfM[i] - lo[i]) / ld[i];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin > EPS ? tMin : null; // 상자 안에서 출발하면(자기 몸체 등) 무시
}

/**
 * R2′ 레이저 켜짐: 콘센트에 꽂혀 전압이 들어오고(> 0) 파장 스위치가 OFF(0)가 아니면 켜짐.
 * 출처: 실험용 레이저 모듈은 어댑터 내장형으로 콘센트에 직접 꽂고, 스위치로 켜고 끈다.
 * 가정: 켜지면 설정 출력 그대로(켬/끔만), 전압 크기·교류는 무시. 스위치 값 = 파장(m), OFF = 0.
 * 유효범위: 켜짐 여부만 다루는 교육용 수준. 출력-전류 곡선·예열은 다루지 않는다.
 */
export function laserOn(mainsVoltageV: number | null, switchWavelengthM: number): boolean {
  return mainsVoltageV !== null && mainsVoltageV > 0 && switchWavelengthM > 0;
}

/**
 * R4 파장 → 보이는 색(RGB 0..1). 물리 법칙이 아니라 사람 눈에 보이는 색의 근사(보기용).
 * 출처: Dan Bruton, "Approximate RGB values for visible wavelengths" (1996). 감마 보정은 생략.
 * 구간 선형식 + 양 끝(380–420, 700–780 nm) 세기 감소(눈의 감도가 낮아짐).
 * 유효범위: 380–780 nm. 밖이면 (0, 0, 0).
 */
export function wavelengthToRgb(wavelengthM: number): [number, number, number] {
  const l = wavelengthM * 1e9;
  let r = 0;
  let g = 0;
  let b = 0;
  if (l >= 380 && l < 440) [r, g, b] = [-(l - 440) / 60, 0, 1];
  else if (l >= 440 && l < 490) [r, g, b] = [0, (l - 440) / 50, 1];
  else if (l >= 490 && l < 510) [r, g, b] = [0, 1, -(l - 510) / 20];
  else if (l >= 510 && l < 580) [r, g, b] = [(l - 510) / 70, 1, 0];
  else if (l >= 580 && l < 645) [r, g, b] = [1, -(l - 645) / 65, 0];
  else if (l >= 645 && l <= 780) [r, g, b] = [1, 0, 0];
  let f = 0;
  if (l >= 380 && l < 420) f = 0.3 + (0.7 * (l - 380)) / 40;
  else if (l >= 420 && l <= 700) f = 1;
  else if (l > 700 && l <= 780) f = 0.3 + (0.7 * (780 - l)) / 80;
  return [r * f + 0, g * f + 0, b * f + 0];
}
