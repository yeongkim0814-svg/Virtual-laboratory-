// 가구 부품·놓을 수 있는 면(바닥·테이블 윗면·찬장 선반) 테스트 (배치 규칙, 물리 규칙 아님). 기대값은 손계산.
import { describe, expect, it } from 'vitest';
import type { CupboardDef, TableDef } from '../src/config/types';
import { cupboardParts, shelfLevels, shelfRect, tableLegRects, tableParts } from '../src/room/furnitureParts';
import { FLOOR, Surfaces } from '../src/room/surfaces';

const room = { widthM: 10, depthM: 10, heightM: 3 };
const table: TableDef = {
  id: 't', type: 'table', positionM: [0, 0, 1], rotationYDeg: 0, sizeM: [1.6, 0.75, 0.8], topThicknessM: 0.04, legSizeM: 0.06,
};
const cup: CupboardDef = {
  id: 'c', type: 'cupboard', positionM: [-4.75, 0, -2.5], rotationYDeg: 90, sizeM: [4, 1.8, 0.5], shelves: 4, panelThicknessM: 0.02,
};
const s = new Surfaces(room, [table, cup], 0.05);

describe('가구 부품', () => {
  it('테이블: 상판(높이 0.71 에서 두께 0.04) + 다리 4개(높이 0.71, 모서리 안쪽 0.03)', () => {
    const p = tableParts(table);
    expect(p).toHaveLength(5);
    expect(p[0].positionM[1]).toBeCloseTo(0.71);
    expect(p[1].sizeM[1]).toBeCloseTo(0.71);
    expect(p[1].positionM[0]).toBeCloseTo(-0.77);
    expect(p[1].positionM[2]).toBeCloseTo(-0.37);
  });
  it('테이블 다리 바닥 사각형(월드): (−0.77, 0.63) 등, 반폭 0.03', () => {
    const r = tableLegRects(table)[0];
    expect(r.xM).toBeCloseTo(-0.77);
    expect(r.zM).toBeCloseTo(1 - 0.37);
    expect(r.hxM).toBeCloseTo(0.03);
  });
  it('선반 높이: s = (1.8 − 0.02)/4 = 0.445 → 0.02, 0.465, 0.91, 1.355, 빈 높이 0.425', () => {
    const l = shelfLevels(cup);
    [0.02, 0.465, 0.91, 1.355].forEach((y, i) => expect(l.yM[i]).toBeCloseTo(y));
    expect(l.clearHeightM).toBeCloseTo(0.425);
  });
  it('찬장 부품: 뒤·옆 2·위 + 선반 4 = 8, 앞은 열림', () => {
    expect(cupboardParts(cup)).toHaveLength(8);
  });
  it('선반 안쪽(90° 회전, 앞 = +x): 중심 (−4.74, −2.5), x 반폭 0.24 → x −4.98..−4.5, z 반폭 1.98', () => {
    const r = shelfRect(cup);
    expect(r.xM).toBeCloseTo(-4.74);
    expect(r.zM).toBeCloseTo(-2.5);
    expect(r.hxM).toBeCloseTo(1.98); // 로컬 x(폭) = 월드 z
    expect(r.hzM).toBeCloseTo(0.24); // 로컬 z(깊이) = 월드 x
  });
});

describe('Surfaces', () => {
  it('surfaceAt: 높이·범위가 맞는 면(바닥 / 테이블 / 선반 칸)', () => {
    expect(s.surfaceAt(0.3, 0.75, 1)).toBe('t');
    expect(s.surfaceAt(0.3, 0, 1)).toBe(FLOOR);
    expect(s.surfaceAt(-4.75, 0.02, -2)).toBe('c/1');
    expect(s.surfaceAt(-4.75, 0.91, -2)).toBe('c/3');
    expect(s.surfaceAt(0.9, 0.75, 1)).toBeUndefined(); // 테이블 밖(반폭 0.8)
    expect(s.surfaceAt(-4.75, 1.8, -2)).toBeUndefined(); // 찬장 윗판은 면이 아님
  });
  it('선반은 빈 높이 0.425, 케이블은 앞(+z 로컬 = 변 2)으로만 / 테이블·바닥은 막힌 곳 없음', () => {
    expect(s.get('c/2')!.clearHeightM).toBeCloseTo(0.425);
    expect(s.get('c/2')!.openSides).toEqual([2]);
    expect(s.get('t')!.clearHeightM).toBe(Infinity);
    expect(s.get('t')!.openSides).toEqual([0, 1, 2, 3]);
  });
  it('surfaceBelow: 테이블 위 공중 → 테이블, 테이블 밑(높이 0.5) → 바닥', () => {
    expect(s.surfaceBelow(0, 1.2, 1).id).toBe('t');
    expect(s.surfaceBelow(0, 0.5, 1).id).toBe(FLOOR);
  });
  it('테이블: 셀이 윗면 안에 완전히(x 15 = 0.725..0.775 안, 16 = 0.775..0.825 밖)', () => {
    expect(s.cellAllowed('t', [15, 20])).toBe(true);
    expect(s.cellAllowed('t', [16, 20])).toBe(false);
  });
  it('바닥: 테이블·찬장 자리는 안 됨, 그 밖은 됨', () => {
    expect(s.cellAllowed(FLOOR, [0, 20])).toBe(false);
    expect(s.cellAllowed(FLOOR, [-95, -40])).toBe(false);
    expect(s.cellAllowed(FLOOR, [0, 40])).toBe(true);
  });
  it('바닥 케이블 장애물: 테이블은 다리 4개만, 찬장은 전체', () => {
    expect(s.floorCableBoxes).toHaveLength(5);
  });
});
