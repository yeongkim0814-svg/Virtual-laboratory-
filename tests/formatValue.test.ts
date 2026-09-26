import { describe, expect, it } from 'vitest';
import { decimalsForStep, formatValue, toDisplay } from '../src/ui/formatValue';

describe('formatValue', () => {
  it('step 에서 소수 자릿수', () => {
    expect(decimalsForStep(1)).toBe(0);
    expect(decimalsForStep(0.1)).toBe(1);
    expect(decimalsForStep(0.005)).toBe(3);
  });
  it('값 없음은 —', () => {
    expect(formatValue(null, 'V')).toBe('—');
    expect(formatValue(5, 'V', 1)).toBe('5.0 V');
  });
});

describe('toDisplay (SI → 표시 단위)', () => {
  it('650e-9 m × 1e9 = 650 nm, 0.1e-3 W × 1e3 = 0.1 mW (부동소수 잡음 없이)', () => {
    expect(toDisplay(650e-9, 1e9)).toBe(650);
    expect(toDisplay(0.1e-3, 1e3)).toBe(0.1);
    expect(decimalsForStep(toDisplay(0.1e-3, 1e3))).toBe(1);
  });
});

