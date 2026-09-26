// 케이블 경로: 포트 → 면(바닥·테이블 윗면) → (장비를 피해) → 포트. 순수 함수 → 단위 테스트 대상.
// 물리 규칙이 아니라 배치 규칙(기하). 케이블은 늘어나지 않는 줄로 보고, 필요한 경로가
// 최대 길이보다 길면 연결할 수 없다(연결 중이면 빠진다).
//
// 면(Plane)마다 장애물 = 그 면에 놓인 장비의 밑넓이 원 + 가구 사각형(바닥의 찬장 등).
// 들고 있는 장비는 장애물이 아니다. 테이블은 바닥 케이블의 장애물이 아니다(밑으로 지나감).
// - 같은 면: 직선이 막히지 않으면 직선, 막히면 격자 A*(모든 이동 선분을 정확히 검사) 후 곧게 편다
// - 다른 면: 테이블 쪽 끝은 가장자리(가장 가까운 변 / 상대 쪽 변 중 짧은 쪽)로 가서, 테이블·장비를
//   지나지 않는 가장 먼 바닥 점까지 비스듬히 늘어뜨린 뒤 바닥에서 잇는다

import type { RoomSize, Vec3 } from '../config/types';
import { nearestEdge, pointInRect, segmentHitsRect, toLocal, toWorld, type Rect } from '../geom/rect';
import { cellInsideRoom, cellKey, cellToWorld, worldToCell, type Cell } from '../grid/grid';

export interface Circle {
  xM: number;
  zM: number;
  rM: number;
}

/** 케이블이 지나갈 수 있는 면. region = null 이면 바닥(방 전체). */
export interface Plane {
  id: string;
  yM: number;
  region: Rect | null;
  circles: Circle[];
  boxes: Rect[];
}

export interface CableEnd {
  /** 포트 위치(월드). */
  portM: Vec3;
  /** 포트가 달린 장비의 밑넓이 원. 들고 있는 장비면 null(포트 바로 아래로 내려간다). */
  body: Circle | null;
  /** 포트가 장비 중심에 있을 때 케이블이 나가는 방향(수평 단위벡터 x, z). */
  fallbackDir: [number, number];
  /** 케이블이 처음 닿는 면. */
  planeId: string;
}

export interface RouteConfig {
  cellSizeM: number;
  room: RoomSize;
  /** 케이블 중심의 면 위 높이(= 케이블 반지름). */
  liftM: number;
  /** 포트에서 수평으로 빠져나오는 길이. */
  portStubM: number;
  /** 장비 원·테이블 가장자리에서 떨어지는 여유. */
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

function planeSegmentClear(pl: Plane, ax: number, az: number, bx: number, bz: number): boolean {
  return segmentClear(ax, az, bx, bz, pl.circles) && !pl.boxes.some((b) => segmentHitsRect(b, ax, az, bx, bz));
}

export function polylineLength(pts: readonly Vec3[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
  }
  return s;
}

/**
 * 포트 쪽 끝부분: [포트, 포트에서 수평으로 조금 나온 점, 면 위 출구점].
 * 출구점은 장비 원 바깥(반지름 + 여유) — 장비 중심 → 포트 방향.
 */
export function endStub(end: CableEnd, planeYM: number, cfg: RouteConfig): { stub: Vec3[]; exit: [number, number] } {
  const [px, py, pz] = end.portM;
  const y = planeYM + cfg.liftM;
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
export function routeCable(a: CableEnd, b: CableEnd, planes: readonly Plane[], cfg: RouteConfig): CableRoute | null {
  const pa = planes.find((p) => p.id === a.planeId);
  const pb = planes.find((p) => p.id === b.planeId);
  const floor = planes.find((p) => !p.region);
  if (!pa || !pb || !floor) return null;
  const sa = endStub(a, pa.yM, cfg);
  const sb = endStub(b, pb.yM, cfg);

  if (pa.id === pb.id) {
    const budget = cfg.maxLengthM - polylineLength(sa.stub) - polylineLength(sb.stub);
    if (budget < 0) return null;
    const f = planarPath(sa.exit, sb.exit, pa, cfg, budget);
    if (!f) return null;
    const mid = f.map(([x, z]) => [x, pa.yM + cfg.liftM, z] as Vec3);
    return finish([...sa.stub, ...mid, ...[...sb.stub].reverse()], cfg);
  }

  // 다른 면: 테이블 쪽 끝은 가장자리 후보 2개(가장 가까운 변 / 상대 쪽을 향한 변) 중 짧은 경로
  const ea = pa.region ? edgeCandidates(pa.region, sa.exit, sb.exit) : [null];
  const eb = pb.region ? edgeCandidates(pb.region, sb.exit, sa.exit) : [null];
  let best: CableRoute | null = null;
  for (const x of ea) {
    for (const y of eb) {
      const r = crossRoute(sa, sb, pa, pb, floor, x, y, cfg);
      if (r && (!best || r.lengthM < best.lengthM)) best = r;
    }
  }
  return best;
}

type Edge = { pointM: [number, number]; outward: [number, number] };
type Stub = { stub: Vec3[]; exit: [number, number] };

function finish(pts: Vec3[], cfg: RouteConfig): CableRoute | null {
  const pointsM = dedupe(pts);
  const lengthM = polylineLength(pointsM);
  return lengthM <= cfg.maxLengthM + EPS ? { pointsM, lengthM } : null;
}

/** 가장자리 후보: 출구에서 가장 가까운 변 위의 점, 상대 쪽 목표에 가장 가까운 변 위의 점. */
function edgeCandidates(r: Rect, exit: [number, number], target: [number, number]): Edge[] {
  const a = nearestEdge(r, exit[0], exit[1]);
  const b = boundaryToward(r, target);
  return Math.hypot(a.pointM[0] - b.pointM[0], a.pointM[1] - b.pointM[1]) < 1e-4 ? [a] : [a, b];
}

/** 사각형 밖의 점 → 사각형 경계에서 가장 가까운 점(과 바깥 방향). 안이면 가장 가까운 변. */
function boundaryToward(r: Rect, target: [number, number]): Edge {
  const [lx, lz] = toLocal(r, target[0], target[1]);
  const ox = Math.abs(lx) - r.hxM;
  const oz = Math.abs(lz) - r.hzM;
  if (ox <= 0 && oz <= 0) return nearestEdge(r, target[0], target[1]);
  const cx = Math.max(-r.hxM, Math.min(r.hxM, lx));
  const cz = Math.max(-r.hzM, Math.min(r.hzM, lz));
  const n: [number, number] = ox >= oz ? [Math.sign(lx), 0] : [0, Math.sign(lz)];
  return { pointM: toWorld(r, cx, cz), outward: toWorld({ ...r, xM: 0, zM: 0 }, n[0], n[1]) };
}

/**
 * 서로 다른 면의 두 끝: [테이블 위 경로 → 가장자리] → 바닥 → [가장자리 → 테이블 위 경로].
 * 가장자리에서는 바로 아래로 떨어뜨리지 않고, 테이블·장비를 지나지 않는 한 가장 먼 바닥 점까지
 * 곧게 늘어뜨린다(실제 케이블처럼 비스듬히).
 */
function crossRoute(
  sa: Stub, sb: Stub, pa: Plane, pb: Plane, floor: Plane, ea: Edge | null, eb: Edge | null, cfg: RouteConfig,
): CableRoute | null {
  let budget = cfg.maxLengthM - polylineLength(sa.stub) - polylineLength(sb.stub);
  const off = cfg.clearanceM + cfg.liftM;
  const legOf = (s: Stub, pl: Plane, e: Edge) => {
    const path = planarPath(s.exit, e.pointM, pl, cfg, budget);
    if (!path) return null;
    const top = path.map(([x, z]) => [x, pl.yM + cfg.liftM, z] as Vec3);
    const drop: [number, number] = [e.pointM[0] + e.outward[0] * off, e.pointM[1] + e.outward[1] * off];
    return { top, drop, rect: pl.region!, lengthM: polylineLength(top) };
  };
  const la = ea ? legOf(sa, pa, ea) : null;
  if (ea && !la) return null;
  if (la) budget -= la.lengthM;
  const lb = eb ? legOf(sb, pb, eb) : null;
  if (eb && !lb) return null;
  if (lb) budget -= lb.lengthM;
  if (budget < 0) return null;

  const start = la ? la.drop : sa.exit;
  const end = lb ? lb.drop : sb.exit;
  // 늘어뜨리는 구간이 수직 낙하보다 길 일은 없으므로, 바닥 예산에는 높이를 빼지 않는다(최종 길이로 확인)
  const f = planarPath(start, end, floor, cfg, budget);
  if (!f) return null;

  const visible = (from: [number, number], to: [number, number], rect: Rect) =>
    planeSegmentClear(floor, from[0], from[1], to[0], to[1]) && !segmentHitsRect(rect, from[0], from[1], to[0], to[1]);
  let i0 = 0;
  if (la) while (i0 < f.length - 1 && visible(la.drop, f[i0 + 1], la.rect)) i0++;
  let i1 = f.length - 1;
  if (lb) while (i1 > i0 && visible(lb.drop, f[i1 - 1], lb.rect)) i1--;

  const y = floor.yM + cfg.liftM;
  const floorPts = f.slice(i0, i1 + 1).map(([x, z]) => [x, y, z] as Vec3);
  return finish([
    ...sa.stub,
    ...(la ? la.top : []),
    ...floorPts,
    ...(lb ? [...lb.top].reverse() : []),
    ...[...sb.stub].reverse(),
  ], cfg);
}

// ── 한 면 위의 경로 ──

function planarPath(
  s: [number, number],
  g: [number, number],
  pl: Plane,
  cfg: RouteConfig,
  budgetM: number,
): [number, number][] | null {
  if (planeSegmentClear(pl, s[0], s[1], g[0], g[1])) {
    return Math.hypot(g[0] - s[0], g[1] - s[1]) <= budgetM + EPS ? [s, g] : null;
  }
  const cells = astar(s, g, pl, cfg, budgetM);
  if (!cells) return null;
  const pts: [number, number][] = [s, ...cells.slice(1, -1).map((c) => cellToWorld(c, cfg.cellSizeM)), g];
  const smoothed = smooth(pts, pl);
  let len = 0;
  for (let i = 1; i < smoothed.length; i++) len += Math.hypot(smoothed[i][0] - smoothed[i - 1][0], smoothed[i][1] - smoothed[i - 1][1]);
  return len <= budgetM + EPS ? smoothed : null;
}

/**
 * 면 위 격자 A*. 노드 = 셀 중심(시작·도착은 정확한 출구점).
 * 셀 중심이 원 안이면 못 가고, 한 칸 이동하는 선분도 원을 지나면 안 된다(정확한 검사).
 * → 찾은 경로의 모든 선분이 장비 원을 지나지 않는다.
 */
function astar(
  s: [number, number],
  g: [number, number],
  pl: Plane,
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
    if (pl.region && !pointInRect(pl.region, x, z)) return false;
    return pl.circles.every((o) => Math.hypot(x - o.xM, z - o.zM) >= o.rM) && !pl.boxes.some((b) => pointInRect(b, x, z));
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
        if (!planeSegmentClear(pl, cp[0], cp[1], np[0], np[1])) continue;
        gScore.set(nk, ng);
        parent.set(nk, cur);
        heap.push(nb, ng + h(np));
      }
    }
  }
  return null;
}

/** 앞에서부터 보이는(원을 지나지 않는) 가장 먼 점으로 건너뛰며 곧게 편다. */
function smooth(pts: [number, number][], pl: Plane): [number, number][] {
  const out: [number, number][] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !planeSegmentClear(pl, pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--;
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
