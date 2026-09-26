import { describe, expect, it } from 'vitest';
import { decimalsForStep, formatValue } from '../src/ui/formatValue';

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
