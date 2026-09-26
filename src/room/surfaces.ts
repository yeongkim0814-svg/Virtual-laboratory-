// 장비를 놓을 수 있는 면: 바닥 + 테이블 윗면. 순수 코드 → 단위 테스트 대상(배치 규칙).

import type { FurnitureDef, RoomSize } from '../config/types';
import { cellInsideRoom, type Cell } from '../grid/grid';
import { cellInsideRect, cellNearRect, pointInRect, type Rect } from '../geom/rect';

export const FLOOR = 'floor';
const DEG = Math.PI / 180;
/** 이 높이 차 이내면 그 면 위로 본다. */
const HEIGHT_EPS_M = 0.01;

export interface Surface {
  id: string;
  yM: number;
  /** null = 바닥(방 전체). */
  rect: Rect | null;
}

export function furnitureRect(f: FurnitureDef): Rect {
  return { xM: f.positionM[0], zM: f.positionM[2], hxM: f.sizeM[0] / 2, hzM: f.sizeM[2] / 2, yawRad: f.rotationYDeg * DEG };
}

export class Surfaces {
  readonly list: Surface[];
  /** 바닥에서 가구가 차지한 자리(바닥에는 놓을 수 없음). */
  readonly furnitureRects: Rect[];

  constructor(
    readonly room: RoomSize,
    readonly furniture: readonly FurnitureDef[],
    readonly cellSizeM: number,
  ) {
    this.furnitureRects = furniture.map(furnitureRect);
    this.list = [
      { id: FLOOR, yM: 0, rect: null },
      ...furniture.filter((f) => f.type === 'table').map((f) => ({ id: f.id, yM: f.sizeM[1], rect: furnitureRect(f) })),
    ];
  }

  get(id: string): Surface | undefined {
    return this.list.find((s) => s.id === id);
  }

  /** (x, y, z) 가 어떤 면 위인가: 높이가 맞고 그 면 안. */
  surfaceAt(x: number, y: number, z: number): string | undefined {
    for (const s of this.list) {
      if (Math.abs(y - s.yM) > HEIGHT_EPS_M) continue;
      if (!s.rect || pointInRect(s.rect, x, z)) return s.id;
    }
    return undefined;
  }

  /** (x, z) 아래에 있는 가장 높은 면(높이 y 이하). 들고 있는 장비의 케이블이 내려갈 곳. */
  surfaceBelow(x: number, y: number, z: number): Surface {
    let best = this.list[0];
    for (const s of this.list) {
      if (s.rect && s.yM <= y + HEIGHT_EPS_M && s.yM > best.yM && pointInRect(s.rect, x, z)) best = s;
    }
    return best;
  }

  /** 이 면에 장비 밑넓이 셀을 둘 수 있는가(면 안에 완전히, 바닥이면 가구 자리 제외). */
  cellAllowed(id: string, cell: Cell): boolean {
    const s = this.get(id);
    if (!s) return false;
    if (s.rect) return cellInsideRect(s.rect, cell, this.cellSizeM);
    return cellInsideRoom(cell, this.cellSizeM, this.room) && !this.furnitureRects.some((r) => cellNearRect(r, cell, this.cellSizeM));
  }
}
