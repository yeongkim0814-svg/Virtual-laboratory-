// 물리 규칙: 이중 슬릿. 기대값은 사용자 승인 값(R5 세기 분포, R6 투과 세기).
// λ = 650 nm, d = 0.25 mm, a = 0.05 mm, L = 1 m.
import { describe, expect, it } from 'vitest';
import { doubleSlitIntensity, slitTransmittedPowerW } from '../src/physics/doubleSlit';

const p = { wavelengthM: 650e-9, slitSpacingM: 0.25e-3, slitWidthM: 0.05e-3, distanceM: 1 };
const I = (yMm: number) => doubleSlitIntensity(yMm * 1e-3, p);

describe('R5 이중 슬릿 I/I₀ = cos²(π d sinθ/λ)·sinc²(π a sinθ/λ), sinθ = y/√(y² + L²)', () => {
  it('#1 y = 0 → 1.000000 (중앙 밝은 무늬)', () => expect(I(0)).toBeCloseTo(1, 6));
  it('#2 y = 1.30 mm → 0.000000 (첫 어두운 무늬)', () => expect(I(1.3)).toBeCloseTo(0, 6));
  it('#3 y = 2.60 mm → 0.875141 (첫 밝은 무늬, Δy = λL/d)', () => expect(I(2.6)).toBeCloseTo(0.875141, 6));
  it('#4 y = 5.20 mm → 0.572796 (둘째 밝은 무늬)', () => expect(I(5.2)).toBeCloseTo(0.572796, 6));
  it('#5 y = 1.95 mm → 0.464064 (무늬 사이)', () => expect(I(1.95)).toBeCloseTo(0.464064, 6));
  it('#6 y = 13.0 mm → 0.000000 (포락선 0, 5차 결측)', () => expect(I(13)).toBeCloseTo(0, 6));
  it('대칭: I(−y) = I(y)', () => expect(I(-2.6)).toBeCloseTo(I(2.6), 12));
});

describe('R6 투과 세기 P_out = P_in × 2a/D (D = 빔 지름)', () => {
  it('1 mW, a = 0.05 mm, D = 1 mm → 0.1 mW', () => {
    expect(slitTransmittedPowerW(1e-3, 0.05e-3, 1e-3)).toBeCloseTo(1e-4, 12);
  });
});
