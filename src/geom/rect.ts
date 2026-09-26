// 바닥 평면(x, z)의 회전된 직사각형. 순수 함수 → 단위 테스트 대상. 물리 규칙 아님(기하).
// 회전은 three.js rotation.y 와 같다: 월드 = R(yaw)·로컬 + 중심,
//   x = lx·cos + lz·sin,  z = −lx·sin + lz·cos

import type { Cell } from '../grid/grid';

export interface Rect {
  xM: number;
  zM: number;
  /** 반폭(로컬 x), 반깊이(로컬 z). */
  hxM: number;
  hzM: number;
  yawRad: number;
}

const EPS = 1e-9;

export function toLocal(r: Rect, x: number, z: number): [number, number] {
  const c = Math.cos(r.yawRad);
  const s = Math.sin(r.yawRad);
  const dx = x - r.xM;
  const dz = z - r.zM;
  return [dx * c - dz * s, dx * s + dz * c];
}

export function toWorld(r: Rect, lx: number, lz: number): [number, number] {
  const c = Math.cos(r.yawRad);
  const s = Math.sin(r.yawRad);
  return [r.xM + lx * c + lz * s, r.zM - lx * s + lz * c];
}

/** 점이 사각형 안(경계 포함). marginM > 0 이면 그만큼 안쪽, < 0 이면 바깥으로 넓힌 사각형. */
export function pointInRect(r: Rect, x: number, z: number, marginM = 0): boolean {
  const [lx, lz] = toLocal(r, x, z);
  return Math.abs(lx) <= r.hxM - marginM + EPS && Math.abs(lz) <= r.hzM - marginM + EPS;
}

/** 셀(한 변 c)의 네 모서리가 모두 사각형 안인가 → 셀 전체가 사각형 안. */
export function cellInsideRect(r: Rect, cell: Cell, c: number): boolean {
  const x = cell[0] * c;
  const z = cell[1] * c;
  const h = c / 2;
  return [[-h, -h], [h, -h], [-h, h], [h, h]].every(([dx, dz]) => pointInRect(r, x + dx, z + dz));
}

/**
 * 셀이 사각형에 걸칠 수 있는가(보수적): 셀 중심이 셀 외접원 반지름(c·√2/2)만큼 넓힌 사각형 안.
 * 실제로 안 걸치는 셀을 걸친다고 볼 수는 있어도, 걸치는 셀을 놓치지는 않는다.
 */
export function cellNearRect(r: Rect, cell: Cell, c: number): boolean {
  return pointInRect(r, cell[0] * c, cell[1] * c, -(c * Math.SQRT2) / 2);
}

/** 선분 a→b 가 사각형 안쪽을 지나는가(경계를 스치는 것은 제외). 로컬 좌표에서 슬랩 클리핑. */
export function segmentHitsRect(r: Rect, ax: number, az: number, bx: number, bz: number): boolean {
  const [x0, z0] = toLocal(r, ax, az);
  const [x1, z1] = toLocal(r, bx, bz);
  let t0 = 0;
  let t1 = 1;
  const slab = (p: number, d: number, h: number): boolean => {
    if (Math.abs(d) < EPS) return Math.abs(p) < h - 1e-6;
    let ta = (-h - p) / d;
    let tb = (h - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    return t1 - t0 > 1e-9;
  };
  return slab(x0, x1 - x0, r.hxM) && slab(z0, z1 - z0, r.hzM);
}

/**
 * 허용된 변(0 = +x, 1 = −x, 2 = +z, 3 = −z) 위에서 점 (x, z) 에 가장 가까운 점과, 그 변의 바깥 방향(월드).
 * 점이 사각형 안이면 가장 가까운 변, 밖이면 사각형 경계에서 가장 가까운 점(허용된 변 중에서).
 */
export function closestOnEdges(
  r: Rect, x: number, z: number, sides: readonly number[] = [0, 1, 2, 3],
): { pointM: [number, number]; outward: [number, number] } {
  const [lx, lz] = toLocal(r, x, z);
  const edges: { p: [number, number]; n: [number, number] }[] = [
    { p: [r.hxM, clamp(lz, r.hzM)], n: [1, 0] },
    { p: [-r.hxM, clamp(lz, r.hzM)], n: [-1, 0] },
    { p: [clamp(lx, r.hxM), r.hzM], n: [0, 1] },
    { p: [clamp(lx, r.hxM), -r.hzM], n: [0, -1] },
  ];
  const best = sides
    .map((i) => edges[i])
    .reduce((a, b) => (Math.hypot(b.p[0] - lx, b.p[1] - lz) < Math.hypot(a.p[0] - lx, a.p[1] - lz) ? b : a));
  return { pointM: toWorld(r, best.p[0], best.p[1]), outward: toWorld({ ...r, xM: 0, zM: 0 }, best.n[0], best.n[1]) };
}

/** 사각형 안의 점에서 가장 가까운 변 위의 점과, 그 변의 바깥 방향 단위벡터(월드). */
export function nearestEdge(r: Rect, x: number, z: number): { pointM: [number, number]; outward: [number, number] } {
  return closestOnEdges(r, x, z);
}

/** 반지름 radiusM 원(플레이어)이 사각형과 겹치면 가장 가까운 바깥으로 밀어낸다(넓힌 사각형 근사). */
export function pushOutOfRect(r: Rect, x: number, z: number, radiusM: number): [number, number] {
  const big: Rect = { ...r, hxM: r.hxM + radiusM, hzM: r.hzM + radiusM };
  if (!pointInRect(big, x, z)) return [x, z];
  const e = nearestEdge(big, x, z);
  return e.pointM;
}

const clamp = (v: number, h: number) => Math.max(-h, Math.min(h, v));
