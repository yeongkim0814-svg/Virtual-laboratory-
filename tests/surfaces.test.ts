// 놓을 수 있는 면(바닥·테이블 윗면)과 찬장 재고 테스트 (배치 규칙, 물리 규칙 아님).
import { describe, expect, it } from 'vitest';
import type { FurnitureDef } from '../src/config/types';
import { CupboardStock } from '../src/room/cupboards';
import { FLOOR, Surfaces } from '../src/room/surfaces';

const room = { widthM: 10, depthM: 10, heightM: 3 };
const table: FurnitureDef = { id: 't', type: 'table', positionM: [0, 0, 1], rotationYDeg: 0, sizeM: [1.6, 0.75, 0.8] };
const cup: FurnitureDef = {
  id: 'c', type: 'cupboard', positionM: [-2, 0, 1], rotationYDeg: 90, sizeM: [1.2, 1.8, 0.5], stock: { a: 2 },
};
const s = new Surfaces(room, [table, cup], 0.05);

describe('Surfaces', () => {
  it('surfaceAt: 높이·범위가 맞는 면', () => {
    expect(s.surfaceAt(0.3, 0.75, 1)).toBe('t');
    expect(s.surfaceAt(0.3, 0, 1)).toBe(FLOOR);
    expect(s.surfaceAt(0.9, 0.75, 1)).toBeUndefined(); // 테이블 밖(반폭 0.8)
    expect(s.surfaceAt(0, 0.4, 1)).toBeUndefined();
  });
  it('surfaceBelow: 테이블 위 공중 → 테이블, 테이블 밑(높이 0.5) → 바닥, 밖 → 바닥', () => {
    expect(s.surfaceBelow(0, 1.2, 1).id).toBe('t');
    expect(s.surfaceBelow(0, 0.5, 1).id).toBe(FLOOR);
    expect(s.surfaceBelow(3, 1.2, 1).id).toBe(FLOOR);
  });
  it('테이블: 셀이 윗면 안에 완전히 들어가야 한다(x 15 = 0.725..0.775 안, 16 = 0.775..0.825 밖)', () => {
    expect(s.cellAllowed('t', [15, 20])).toBe(true);
    expect(s.cellAllowed('t', [16, 20])).toBe(false);
  });
  it('바닥: 테이블·찬장 자리는 안 됨, 그 밖은 됨', () => {
    expect(s.cellAllowed(FLOOR, [0, 20])).toBe(false); // 테이블 밑
    expect(s.cellAllowed(FLOOR, [-40, 20])).toBe(false); // 찬장 자리 (−2, 1)
    expect(s.cellAllowed(FLOOR, [0, 40])).toBe(true); // (0, 2)
  });
});

describe('CupboardStock', () => {
  it('꺼내면 줄고, 0 이면 못 꺼내고, 넣으면 는다', () => {
    const st = new CupboardStock([cup]);
    expect(st.take('c', 'a')).toBe(true);
    expect(st.take('c', 'a')).toBe(true);
    expect(st.take('c', 'a')).toBe(false);
    st.put('c', 'a');
    expect(st.items('c')).toEqual([['a', 1]]);
  });
  it('저장한 재고가 있으면 그 값, 없으면 lab.json 처음 값', () => {
    const st = new CupboardStock([cup]);
    st.load({ c: { a: 5 } });
    expect(st.toJSON()).toEqual({ c: { a: 5 } });
    st.load(undefined);
    expect(st.toJSON()).toEqual({ c: { a: 2 } });
  });
  it('테이블은 찬장이 아니다', () => {
    expect(new CupboardStock([table, cup]).has('t')).toBe(false);
  });
});
