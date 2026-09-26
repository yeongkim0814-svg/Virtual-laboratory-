// 바닥 격자. 순수 함수 → 단위 테스트 대상. 물리 규칙 아님(배치 규칙).
//
// 규약: 셀 (kx, kz) 의 중심 = (kx·c, kz·c), c = cellSizeM. 방 중심(0,0)이 셀 (0,0) 의 중심.
//       셀이 방 안에 "완전히" 들어가야 쓸 수 있는 셀이다: |k|·c + c/2 ≤ 방 반폭.
// 장비 밑넓이 = 격자로 표현한 원: 반지름 radiusM 원이 조금이라도 들어가는 셀 전부(보수적 래스터화).
//   → 원 ⊂ 셀들의 합집합. 두 장비의 셀이 겹치지 않으면 두 원(= 그 안에 내접한 모델)도 겹치지 않는다.
//   (원이므로 장비를 어떤 각도로 돌려도 차지하는 셀이 같다)

import type { RoomSize } from '../config/types';

export type Cell = readonly [number, number];

const EPS = 1e-9;

export const cellKey = (c: Cell): string => `${c[0]},${c[1]}`;

/** 월드 좌표 → 가장 가까운 셀. */
export function worldToCell(xM: number, zM: number, cellSizeM: number): Cell {
  return [Math.round(xM / cellSizeM), Math.round(zM / cellSizeM)];
}

/** 셀 중심의 월드 좌표. 부동소수 잡음을 없애려고 1 µm 단위로 반올림. */
export function cellToWorld(cell: Cell, cellSizeM: number): [number, number] {
  const r = (v: number): number => Math.round(v * 1e6) / 1e6 + 0; // +0: -0 → 0
  return [r(cell[0] * cellSizeM), r(cell[1] * cellSizeM)];
}

/**
 * 반지름 radiusM 원이 들어가는 셀 오프셋(중심 셀 기준). 중심 셀은 항상 포함.
 * 셀 (i, j) 에서 원 중심에 가장 가까운 점까지 거리 < radiusM 이면 포함.
 * (거리가 정확히 radiusM 이면 원이 셀 경계에 접하기만 하므로 제외)
 */
export function circleOffsets(radiusM: number, cellSizeM: number): Cell[] {
  const n = Math.ceil(radiusM / cellSizeM + 0.5);
  const near = (k: number): number => Math.max(Math.abs(k) * cellSizeM - cellSizeM / 2, 0);
  const out: Cell[] = [];
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      if ((i === 0 && j === 0) || Math.hypot(near(i), near(j)) < radiusM - EPS) out.push([i + 0, j + 0]); // +0: -0 → 0
    }
  }
  return out;
}

export function footprintCells(center: Cell, offsets: readonly Cell[]): Cell[] {
  return offsets.map(([i, j]) => [center[0] + i, center[1] + j] as const);
}

export function cellInsideRoom(cell: Cell, cellSizeM: number, room: RoomSize): boolean {
  const half = cellSizeM / 2;
  return (
    Math.abs(cell[0]) * cellSizeM + half <= room.widthM / 2 + EPS &&
    Math.abs(cell[1]) * cellSizeM + half <= room.depthM / 2 + EPS
  );
}

export type PlaceCheck = { ok: true } | { ok: false; reason: 'outside' | 'overlap' };

/**
 * 이 셀들에 놓을 수 있는가: 모두 허용된 셀(면 안)이고, 이미 차지된 셀과 하나도 겹치지 않아야 한다.
 */
export function checkCells(
  cells: readonly Cell[],
  occupied: ReadonlySet<string>,
  allowed: (cell: Cell) => boolean,
): PlaceCheck {
  if (!cells.every(allowed)) return { ok: false, reason: 'outside' };
  if (cells.some((c) => occupied.has(cellKey(c)))) return { ok: false, reason: 'overlap' };
  return { ok: true };
}

/**
 * 면 안으로 끌어당기기: 중심 셀에서 밑넓이가 허용 셀 밖으로 나가면, maxShift 셀 이내에서
 * 밑넓이가 모두 허용 셀인 가장 가까운 중심 셀을 찾는다(겹침은 따로 검사). 없으면 null.
 * 선반처럼 깊이가 밑넓이와 비슷한 면에 조준을 정확히 맞추지 않아도 놓을 수 있게.
 */
export function nearestAllowedCenter(
  center: Cell,
  offsets: readonly Cell[],
  allowed: (cell: Cell) => boolean,
  maxShift: number,
): Cell | null {
  const fits = (c: Cell) => footprintCells(c, offsets).every(allowed);
  if (fits(center)) return center;
  const cand: Cell[] = [];
  for (let i = -maxShift; i <= maxShift; i++) {
    for (let j = -maxShift; j <= maxShift; j++) {
      if ((i !== 0 || j !== 0) && Math.hypot(i, j) <= maxShift) cand.push([center[0] + i, center[1] + j]);
    }
  }
  cand.sort((a, b) => Math.hypot(a[0] - center[0], a[1] - center[1]) - Math.hypot(b[0] - center[0], b[1] - center[1]));
  return cand.find(fits) ?? null;
}
