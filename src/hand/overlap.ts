// 장비 겹침 검사·해소 (바닥 평면의 회전된 직사각형, 분리축 정리). 순수 함수. 물리 규칙 아님.

import type { RoomSize } from '../config/types';

/** 장비 로컬 좌표의 바닥 사각형(회전 전): 중심 (cx, cz), 반 크기 (hx, hz). */
export interface Footprint {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
}

export interface FlatPose {
  xM: number;
  zM: number;
  yawRad: number;
}

/** 이 값 이하로 겹친 것은 "맞닿음"으로 본다(포트 스냅 후 면이 딱 붙는 경우). */
export const TOUCH_EPS_M = 1e-4;

interface Rect {
  c: [number, number];
  ux: [number, number]; // 로컬 x 축의 월드 방향 (x, z)
  uz: [number, number]; // 로컬 z 축의 월드 방향
  hx: number;
  hz: number;
}

function toRect(f: Footprint, p: FlatPose): Rect {
  const c = Math.cos(p.yawRad);
  const s = Math.sin(p.yawRad);
  return {
    c: [p.xM + f.cx * c + f.cz * s, p.zM - f.cx * s + f.cz * c],
    ux: [c, -s],
    uz: [s, c],
    hx: f.hx,
    hz: f.hz,
  };
}

const dot = (a: [number, number], b: [number, number]): number => a[0] * b[0] + a[1] * b[1];
const radius = (r: Rect, axis: [number, number]): number =>
  r.hx * Math.abs(dot(r.ux, axis)) + r.hz * Math.abs(dot(r.uz, axis));

/**
 * A 를 B 에서 빼내는 최소 이동(MTV). 겹치지 않으면(맞닿음 포함) null.
 * 분리축: 두 사각형의 변 방향 4개.
 */
export function overlapMtv(
  fa: Footprint, pa: FlatPose,
  fb: Footprint, pb: FlatPose,
): { dxM: number; dzM: number; depthM: number } | null {
  const a = toRect(fa, pa);
  const b = toRect(fb, pb);
  const d: [number, number] = [a.c[0] - b.c[0], a.c[1] - b.c[1]];
  let best: { axis: [number, number]; depth: number } | null = null;
  for (const axis of [a.ux, a.uz, b.ux, b.uz]) {
    const depth = radius(a, axis) + radius(b, axis) - Math.abs(dot(d, axis));
    if (depth <= TOUCH_EPS_M) return null;
    if (!best || depth < best.depth) best = { axis, depth };
  }
  const sign = dot(d, best!.axis) >= 0 ? 1 : -1;
  return { dxM: best!.axis[0] * best!.depth * sign, dzM: best!.axis[1] * best!.depth * sign, depthM: best!.depth };
}

/** 회전된 사각형이 방 안에 들어오도록 중심을 옮긴다. */
export function clampFootprintToRoom(f: Footprint, p: FlatPose, room: RoomSize): FlatPose {
  const r = toRect(f, p);
  const ex = radius(r, [1, 0]);
  const ez = radius(r, [0, 1]);
  const maxX = room.widthM / 2 - ex;
  const maxZ = room.depthM / 2 - ez;
  const cx = Math.max(-maxX, Math.min(maxX, r.c[0]));
  const cz = Math.max(-maxZ, Math.min(maxZ, r.c[1]));
  return { xM: p.xM + (cx - r.c[0]), zM: p.zM + (cz - r.c[1]), yawRad: p.yawRad };
}

/**
 * 놓을 자리 정하기: 방 안으로 넣고, 다른 장비와 겹치면 가장 깊이 겹친 것부터 밀어낸다.
 * maxIter 번 안에 겹침이 없어지면 그 자세, 아니면 null(놓을 공간 없음).
 * 양쪽이 막힌 좁은 틈처럼 밀어내기가 왕복하는 경우도 null → 엉뚱한 곳으로 옮기지 않고 거절한다.
 */
export function resolvePlacement(
  f: Footprint,
  pose: FlatPose,
  others: readonly { footprint: Footprint; pose: FlatPose }[],
  room: RoomSize,
  maxIter = 8,
): FlatPose | null {
  let p = clampFootprintToRoom(f, pose, room);
  for (let i = 0; i < maxIter; i++) {
    let worst: { dxM: number; dzM: number; depthM: number } | null = null;
    for (const o of others) {
      const m = overlapMtv(f, p, o.footprint, o.pose);
      if (m && (!worst || m.depthM > worst.depthM)) worst = m;
    }
    if (!worst) return p;
    // 경계에서 다시 겹치지 않도록 아주 조금 더 민다
    const k = (worst.depthM + TOUCH_EPS_M) / worst.depthM;
    p = clampFootprintToRoom(f, { xM: p.xM + worst.dxM * k, zM: p.zM + worst.dzM * k, yawRad: p.yawRad }, room);
  }
  return others.some((o) => overlapMtv(f, p, o.footprint, o.pose)) ? null : p;
}
