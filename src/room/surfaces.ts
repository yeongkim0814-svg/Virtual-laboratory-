// 장비를 놓을 수 있는 면: 바닥 + 테이블 윗면 + 찬장 선반. 순수 코드 → 단위 테스트 대상(배치 규칙).

import type { FurnitureDef, RoomSize } from '../config/types';
import { cellInsideRoom, type Cell } from '../grid/grid';
import { cellInsideRect, cellNearRect, pointInRect, type Rect } from '../geom/rect';
import { ALL_SIDES, FRONT_SIDE, furnitureRect, shelfLevels, shelfRect, tableLegRects } from './furnitureParts';

export const FLOOR = 'floor';
/** 이 높이 차 이내면 그 면 위로 본다. */
const HEIGHT_EPS_M = 0.01;

export interface Surface {
  id: string;
  yM: number;
  /** null = 바닥(방 전체). */
  rect: Rect | null;
  /** 위로 빈 높이(선반 사이). 장비가 이보다 크면 놓을 수 없다. 막힌 곳이 없으면 Infinity. */
  clearHeightM: number;
  /** 케이블이 넘어 나갈 수 있는 변(0 = +x, 1 = −x, 2 = +z 앞, 3 = −z). 선반은 앞만. */
  openSides: number[];
}

export { furnitureRect };

export class Surfaces {
  readonly list: Surface[];
  /** 바닥에서 가구가 차지한 자리(바닥에는 놓을 수 없음). */
  readonly furnitureRects: Rect[];
  /** 바닥 케이블이 피해야 하는 것: 찬장 전체, 테이블 다리(테이블 밑은 지나감). */
  readonly floorCableBoxes: Rect[];

  constructor(
    readonly room: RoomSize,
    readonly furniture: readonly FurnitureDef[],
    readonly cellSizeM: number,
  ) {
    this.furnitureRects = furniture.map(furnitureRect);
    this.floorCableBoxes = furniture.flatMap((f) => (f.type === 'table' ? tableLegRects(f) : [furnitureRect(f)]));
    this.list = [{ id: FLOOR, yM: 0, rect: null, clearHeightM: Infinity, openSides: ALL_SIDES }];
    for (const f of furniture) {
      if (f.type === 'table') {
        this.list.push({ id: f.id, yM: f.sizeM[1], rect: furnitureRect(f), clearHeightM: Infinity, openSides: ALL_SIDES });
      } else {
        const { yM, clearHeightM } = shelfLevels(f);
        const rect = shelfRect(f);
        yM.forEach((y, k) => this.list.push({ id: `${f.id}/${k + 1}`, yM: y, rect, clearHeightM, openSides: [FRONT_SIDE] }));
      }
    }
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
