// R9 직류 전원 장치 정전압(CV)/정전류(CC). 기대값은 사용자 승인값(V_set = 12 V, I_set = 1 A).
import { describe, expect, it } from 'vitest';
import { dcOperatingPoint } from '../src/physics/dcSupply';

describe('R9 직류 전원 CV/CC 동작점', () => {
  it('R = 24 Ω → CV: 12 V, 0.5 A', () => {
    expect(dcOperatingPoint(12, 1, 24)).toEqual({ voltageV: 12, currentA: 0.5, mode: 'CV' });
  });
  it('R = 6 Ω → CC: 6 V, 1 A', () => {
    expect(dcOperatingPoint(12, 1, 6)).toEqual({ voltageV: 6, currentA: 1, mode: 'CC' });
  });
  it('R = 12 Ω (경계) → 12 V, 1 A, CV 로 표시', () => {
    expect(dcOperatingPoint(12, 1, 12)).toEqual({ voltageV: 12, currentA: 1, mode: 'CV' });
  });
  it('부하 없음(개방) → 12 V, 0 A', () => {
    expect(dcOperatingPoint(12, 1, null)).toEqual({ voltageV: 12, currentA: 0, mode: 'CV' });
  });
});
