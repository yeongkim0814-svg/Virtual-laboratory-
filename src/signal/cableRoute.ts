// 케이블 경로: 포트 → 바닥 → (장비를 피해) 바닥 → 포트. 순수 함수 → 단위 테스트 대상.
// 물리 규칙이 아니라 배치 규칙(기하). 케이블은 늘어나지 않는 줄로 보고, 필요한 경로가
// 최대 길이보다 길면 연결할 수 없다(연결 중이면 빠진다).
//
// 장애물 = 놓인 장비의 밑넓이 원(모델이 내접하는 원). 들고 있는 장비는 장애물이 아니다.
// 1) 두 출구점을 잇는 직선이 어떤 원도 지나지 않으면 직선
// 2) 아니면 바닥 격자 A*(모든 이동 선분이 원을 지나지 않게) → 보이는 점끼리 이어 곧게 편다

import type { RoomSize, Vec3 } from '../config/types';
import { cellInsideRoom, cellKey, cellToWorld, worldToCell, type Cell } from '../grid/grid';

export interface Circle {
  xM: number;
  zM: number;
  rM: number;
}

export interface CableEnd {
  /** 포트 위치(월드). */
  portM: Vec3;
  /** 포트가 달린 장비의 밑넓이 원. 들고 있는 장비면 null(포트 바로 아래로 내려간다). */
  body: Circle | null;
  /** 포트가 장비 중심에 있을 때 케이블이 나가는 방향(수평 단위벡터 x, z). */
  fallbackDir: [number, number];
}

export interface RouteConfig {
  cellSizeM: number;
  room: RoomSize;
  floorYM: number;
  /** 케이블 중심의 바닥 위 높이(= 케이블 반지름). */
  liftM: number;
  /** 포트에서 수평으로 빠져나오는 길이. */
  portStubM: number;
  /** 장비 원에서 떨어지는 여유. */
  clearanceM: number;
  maxLengthM: number;
}

export interface CableRoute {
  pointsM: Vec3[];
  lengthM: number;
}

const EPS = 1e-6;

/** 점 (px, pz) 에서 선분 (a → b) 까지 수평 거리. */
export function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 < EPS ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** 선분이 어떤 원의 안쪽도 지나지 않는가(경계에 닿는 것은 허용). */
export function segmentClear(ax: number, az: number, bx: number, bz: number, circles: readonly Circle[]): boolean {
  return circles.every((c) => segmentDistance(c.xM, c.zM, ax, az, bx, bz) >= c.rM - 1e-4);
}

export function polylineLength(pts: readonly Vec3[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
  }
  return s;
}

/**
 * 포트 쪽 끝부분: [포트, 포트에서 수평으로 조금 나온 점, 바닥 출구점].
 * 출구점은 장비 원 바깥(반지름 + 여유) — 장비 중심 → 포트 방향.
 */
export function endStub(end: CableEnd, cfg: RouteConfig): { stub: Vec3[]; exit: [number, number] } {
  const [px, py, pz] = end.portM;
  const y = cfg.floorYM + cfg.liftM;
  if (!end.body) return { stub: [end.portM, [px, y, pz]], exit: [px, pz] };
  let dx = px - end.body.xM;
  let dz = pz - end.body.zM;
  const d = Math.hypot(dx, dz);
  if (d < EPS) [dx, dz] = end.fallbackDir;
  else [dx, dz] = [dx / d, dz / d];
  const out = Math.max(end.body.rM + cfg.clearanceM, d + cfg.portStubM);
  const ex = end.body.xM + dx * out;
  const ez = end.body.zM + dz * out;
  const sx = px + dx * cfg.portStubM;
  const sz = pz + dz * cfg.portStubM;
  return { stub: [end.portM, [sx, py, sz], [ex, y, ez]], exit: [ex, ez] };
}

/** 두 포트 사이 케이블 경로. 최대 길이 안에서 경로가 없으면 null. */
export function routeCable(a: CableEnd, b: CableEnd, obstacles: readonly Circle[], cfg: RouteConfig): CableRoute | null {
  const sa = endStub(a, cfg);
  const sb = endStub(b, cfg);
  const stubLen = polylineLength(sa.stub) + polylineLength(sb.stub);
  const budget = cfg.maxLengthM - stubLen;
  if (budget < 0) return null;

  const floor = floorPath(sa.exit, sb.exit, obstacles, cfg, budget);
  if (!floor) return null;
  const y = cfg.floorYM + cfg.liftM;
  const mid = floor.slice(1, -1).map(([x, z]) => [x, y, z] as Vec3);
  const pointsM = dedupe([...sa.stub, ...mid, ...[...sb.stub].reverse()]);
  const lengthM = polylineLength(pointsM);
  return lengthM <= cfg.maxLengthM + EPS ? { pointsM, lengthM } : null;
}

// ── 바닥 경로 ──

function floorPath(
  s: [number, number],
  g: [number, number],
  circles: readonly Circle[],
  cfg: RouteConfig,
  budgetM: number,
): [number, number][] | null {
  if (segmentClear(s[0], s[1], g[0], g[1], circles)) {
    return Math.hypot(g[0] - s[0], g[1] - s[1]) <= budgetM + EPS ? [s, g] : null;
  }
  const cells = astar(s, g, circles, cfg, budgetM);
  if (!cells) return null;
  const pts: [number, number][] = [s, ...cells.slice(1, -1).map((c) => cellToWorld(c, cfg.cellSizeM)), g];
  const smoothed = smooth(pts, circles);
  let len = 0;
  for (let i = 1; i < smoothed.length; i++) len += Math.hypot(smoothed[i][0] - smoothed[i - 1][0], smoothed[i][1] - smoothed[i - 1][1]);
  return len <= budgetM + EPS ? smoothed : null;
}

/**
 * 바닥 격자 A*. 노드 = 셀 중심(시작·도착은 정확한 출구점).
 * 셀 중심이 원 안이면 못 가고, 한 칸 이동하는 선분도 원을 지나면 안 된다(정확한 검사).
 * → 찾은 경로의 모든 선분이 장비 원을 지나지 않는다.
 */
function astar(
  s: [number, number],
  g: [number, number],
  circles: readonly Circle[],
  cfg: RouteConfig,
  budgetM: number,
): Cell[] | null {
  const c = cfg.cellSizeM;
  const start = worldToCell(s[0], s[1], c);
  const goal = worldToCell(g[0], g[1], c);
  const startKey = cellKey(start);
  const goalKey = cellKey(goal);
  const pos = (cell: Cell, k: string): [number, number] =>
    k === startKey ? s : k === goalKey ? g : cellToWorld(cell, c);
  const free = (cell: Cell, k: string): boolean => {
    if (k === startKey || k === goalKey) return true;
    if (!cellInsideRoom(cell, c, cfg.room)) return false;
    const [x, z] = cellToWorld(cell, c);
    return circles.every((o) => Math.hypot(x - o.xM, z - o.zM) >= o.rM);
  };
  const h = (p: [number, number]) => Math.hypot(p[0] - g[0], p[1] - g[1]);

  const gScore = new Map<string, number>([[startKey, 0]]);
  const parent = new Map<string, Cell>();
  const heap = new MinHeap<Cell>();
  heap.push(start, h(s));
  while (heap.size > 0) {
    const cur = heap.pop()!;
    const ck = cellKey(cur);
    if (ck === goalKey) {
      const path: Cell[] = [cur];
      for (let p = parent.get(ck); p; p = parent.get(cellKey(p))) path.push(p);
      return path.reverse();
    }
    const gc = gScore.get(ck)!;
    const cp = pos(cur, ck);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        const nb: Cell = [cur[0] + di, cur[1] + dj];
        const nk = cellKey(nb);
        if (!free(nb, nk)) continue;
        const np = pos(nb, nk);
        const ng = gc + Math.hypot(np[0] - cp[0], np[1] - cp[1]);
        if (ng + h(np) > budgetM + EPS) continue; // 최대 길이 안에서만 찾는다
        if (ng >= (gScore.get(nk) ?? Infinity)) continue;
        if (!segmentClear(cp[0], cp[1], np[0], np[1], circles)) continue;
        gScore.set(nk, ng);
        parent.set(nk, cur);
        heap.push(nb, ng + h(np));
      }
    }
  }
  return null;
}

/** 앞에서부터 보이는(원을 지나지 않는) 가장 먼 점으로 건너뛰며 곧게 편다. */
function smooth(pts: [number, number][], circles: readonly Circle[]): [number, number][] {
  const out: [number, number][] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !segmentClear(pts[i][0], pts[i][1], pts[j][0], pts[j][1], circles)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

function dedupe(pts: Vec3[]): Vec3[] {
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) > 1e-5);
}

class MinHeap<T> {
  private readonly items: { v: T; k: number }[] = [];
  get size(): number {
    return this.items.length;
  }
  push(v: T, k: number): void {
    const a = this.items;
    a.push({ v, k });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0].v;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}
