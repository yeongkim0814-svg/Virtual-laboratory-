// 물리 규칙: 이중 슬릿. 기대값은 사용자 승인 값(R5 세기 분포, R6 투과 세기).
// λ = 650 nm, d = 0.25 mm, a = 0.05 mm, L = 1 m.
import { describe, expect, it } from 'vitest';
import { doubleSlitIntensity, doubleSlitIntensityOblique, slitTransmittedPowerW } from '../src/physics/doubleSlit';

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

// R5′·R6′ 비스듬한 입사(사용자 승인). λ = 650 nm, d = 0.1 mm, a = 0.03 mm, θᵢ = 30°.
// 각도는 슬릿판 법선 기준, 슬릿 간격 방향 성분(방향 코사인)으로 잰다.
describe("R5′ 비스듬한 입사 I/I₀ = cos²(πd(sinθ − sinθᵢ)/λ)·sinc²(πa(sinθ − sinθᵢ)/λ)", () => {
  const q = { wavelengthM: 650e-9, slitSpacingM: 0.1e-3, slitWidthM: 0.03e-3 };
  const sinIn = Math.sin(Math.PI / 6);
  it('θᵢ = 0 이면 R5 와 같다(같은 sinθ)', () => {
    const y = 2.6e-3;
    const sinT = y / Math.hypot(y, 1);
    expect(doubleSlitIntensityOblique(sinT, 0, { ...p })).toBeCloseTo(doubleSlitIntensity(y, p), 12);
  });
  it('θ = θᵢ (직진 방향) → 1 (중앙 밝은 무늬는 입사 방향)', () => {
    expect(doubleSlitIntensityOblique(sinIn, sinIn, q)).toBeCloseTo(1, 12);
  });
  it('첫 어두운 무늬: sinθ = 0.5 + λ/(2d) = 0.50325 → 0, 가운데에서 Δθ ≈ 3.753 mrad (수직 입사 3.25 mrad 의 1/cos30°배)', () => {
    const sinDark = 0.5 + 650e-9 / (2 * 0.1e-3);
    expect(doubleSlitIntensityOblique(sinDark, sinIn, q)).toBeCloseTo(0, 6);
    expect(Math.asin(sinDark) - Math.PI / 6).toBeCloseTo(0.003753, 5);
  });
});

describe("R6′ 비스듬한 입사 투과 P_out = P_in × 2a·cosθᵢ/D", () => {
  it('1 mW, a = 0.03 mm, D = 1 mm, θᵢ = 30° → 0.05196 mW', () => {
    expect(slitTransmittedPowerW(1e-3, 0.03e-3, 1e-3, Math.cos(Math.PI / 6))).toBeCloseTo(5.196e-5, 8);
  });
  it('cosθᵢ 생략 = 수직 입사(R6)', () => {
    expect(slitTransmittedPowerW(1e-3, 0.03e-3, 1e-3)).toBeCloseTo(6e-5, 12);
  });
});
