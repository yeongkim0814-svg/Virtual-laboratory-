// 찬장 재고: 찬장 id → (장비 종류 → 개수). 순수 코드 → 단위 테스트 대상.
// 처음 재고는 lab.json(가구의 stock), 저장한 세팅에 있으면 그 값이 우선.

import type { FurnitureDef } from '../config/types';

export type StockMap = Record<string, Record<string, number>>;

export class CupboardStock {
  private stock = new Map<string, Map<string, number>>();

  constructor(private readonly furniture: readonly FurnitureDef[]) {
    this.load();
  }

  /** 재고를 처음 값(lab.json)으로, saved 에 있는 찬장은 그 값으로. */
  load(saved?: StockMap): void {
    this.stock = new Map(
      this.furniture
        .filter((f) => f.type === 'cupboard')
        .map((f) => [f.id, new Map(Object.entries(saved?.[f.id] ?? f.stock ?? {}))]),
    );
  }

  has(cupboardId: string): boolean {
    return this.stock.has(cupboardId);
  }

  items(cupboardId: string): [string, number][] {
    return [...(this.stock.get(cupboardId) ?? new Map<string, number>())];
  }

  /** 하나 꺼낸다. 없으면 false. */
  take(cupboardId: string, type: string): boolean {
    const m = this.stock.get(cupboardId);
    const n = m?.get(type) ?? 0;
    if (!m || n <= 0) return false;
    m.set(type, n - 1);
    return true;
  }

  put(cupboardId: string, type: string): void {
    const m = this.stock.get(cupboardId);
    if (!m) throw new Error(`찬장 없음: ${cupboardId}`);
    m.set(type, (m.get(type) ?? 0) + 1);
  }

  toJSON(): StockMap {
    return Object.fromEntries([...this.stock].map(([id, m]) => [id, Object.fromEntries(m)]));
  }
}
