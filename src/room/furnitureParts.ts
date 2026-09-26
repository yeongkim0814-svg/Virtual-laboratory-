// 가구 부품·면 계산. 순수 함수 → 단위 테스트 대상(배치 규칙, 물리 규칙 아님).
// 좌표: 가구 로컬(원점 = 바닥 중앙, +z = 앞). 부품 상자는 원점 = 상자 바닥 중앙.

import type { CupboardDef, FurnitureDef, TableDef, Vec3 } from '../config/types';
import { toWorld, type Rect } from '../geom/rect';

const DEG = Math.PI / 180;

export interface Part {
  positionM: Vec3;
  sizeM: Vec3;
}

/** 사각형 변 번호: 0 = +x, 1 = −x, 2 = +z(앞), 3 = −z. */
export const ALL_SIDES = [0, 1, 2, 3];
export const FRONT_SIDE = 2;

export function furnitureRect(f: FurnitureDef): Rect {
  return { xM: f.positionM[0], zM: f.positionM[2], hxM: f.sizeM[0] / 2, hzM: f.sizeM[2] / 2, yawRad: f.rotationYDeg * DEG };
}

/** 테이블: 상판 + 네 모서리 다리. */
export function tableParts(f: TableDef): Part[] {
  const [w, h, d] = f.sizeM;
  const t = f.topThicknessM;
  const l = f.legSizeM;
  const lx = w / 2 - l / 2;
  const lz = d / 2 - l / 2;
  return [
    { positionM: [0, h - t, 0], sizeM: [w, t, d] },
    ...[[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].map(([x, z]) => ({ positionM: [x, 0, z] as Vec3, sizeM: [l, h - t, l] as Vec3 })),
  ];
}

/** 테이블 다리의 바닥 사각형(월드). */
export function tableLegRects(f: TableDef): Rect[] {
  const r = furnitureRect(f);
  return tableParts(f).slice(1).map((p) => {
    const [x, z] = toWorld(r, p.positionM[0], p.positionM[2]);
    return { xM: x, zM: z, hxM: p.sizeM[0] / 2, hzM: p.sizeM[2] / 2, yawRad: r.yawRad };
  });
}

/**
 * 찬장 선반 높이: 판 두께 t, 칸 수 n, 칸 간격 s = (h − t) / n.
 * k 번째 선반(0 = 맨 아래 바닥판) 윗면 높이 = t + k·s, 선반 사이 빈 높이 = s − t.
 */
export function shelfLevels(f: CupboardDef): { yM: number[]; clearHeightM: number } {
  const t = f.panelThicknessM;
  const s = (f.sizeM[1] - t) / f.shelves;
  return { yM: Array.from({ length: f.shelves }, (_, k) => t + k * s), clearHeightM: s - t };
}

/** 찬장: 뒤판, 옆판 2, 윗판, 선반 판들(앞은 열림). */
export function cupboardParts(f: CupboardDef): Part[] {
  const [w, h, d] = f.sizeM;
  const t = f.panelThicknessM;
  return [
    { positionM: [0, 0, -d / 2 + t / 2], sizeM: [w, h, t] },
    { positionM: [-w / 2 + t / 2, 0, 0], sizeM: [t, h, d] },
    { positionM: [w / 2 - t / 2, 0, 0], sizeM: [t, h, d] },
    { positionM: [0, h - t, 0], sizeM: [w, t, d] },
    ...shelfLevels(f).yM.map((y) => ({ positionM: [0, y - t, t / 2] as Vec3, sizeM: [w - 2 * t, t, d - t] as Vec3 })),
  ];
}

/** 선반 안쪽 사각형(월드): 옆판·뒤판 안쪽, 앞은 찬장 앞면까지. */
export function shelfRect(f: CupboardDef): Rect {
  const r = furnitureRect(f);
  const t = f.panelThicknessM;
  const [x, z] = toWorld(r, 0, t / 2);
  return { xM: x, zM: z, hxM: (f.sizeM[0] - 2 * t) / 2, hzM: (f.sizeM[2] - t) / 2, yawRad: r.yawRad };
}
