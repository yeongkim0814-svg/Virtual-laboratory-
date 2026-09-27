// 이중 슬릿 — 사용자 승인 규칙 R5·R6, 비스듬한 입사 R5′·R6′. 순수 함수 → 단위 테스트 대상.
// 스크린 셰이더(src/interaction/screenOverlay.ts)의 GLSL 은 R5 와 같은 식을 옮긴 것이다.

export interface DoubleSlitParams {
  wavelengthM: number;
  /** 두 슬릿 중심 사이 간격 d. */
  slitSpacingM: number;
  /** 슬릿 하나의 폭 a. */
  slitWidthM: number;
  /** 슬릿 → 스크린 거리 L(가운데 광선). */
  distanceM: number;
}

/**
 * R5 이중 슬릿 세기 분포(프라운호퍼 회절):
 *   I/I₀ = cos²(π d sinθ / λ) · sinc²(π a sinθ / λ),  sinθ = y / √(y² + L²),  sinc(x) = sin x / x
 *   cos² = 두 슬릿의 간섭(경로차 d sinθ), sinc² = 슬릿 하나의 회절 포락선.
 * 출처: 프라운호퍼 회절(일반물리 광학, 예: Hecht "Optics" 10장).
 * 가정: 먼 거리 근사(L ≫ d²/λ), 단색·결맞는 빛, 두 슬릿에 같은 세기의 평면파, 슬릿은 빛보다 길다.
 * 유효범위: 기본값에서 L ≳ 0.3 m. 더 가까우면 프레넬 회절과 차이가 커진다.
 * @param yM 스크린 위 무늬 중심에서 슬릿 간격 방향으로 잰 거리
 */
export function doubleSlitIntensity(yM: number, p: DoubleSlitParams): number {
  const sinTheta = yM / Math.hypot(yM, p.distanceM);
  const beta = (Math.PI * p.slitSpacingM * sinTheta) / p.wavelengthM;
  const alpha = (Math.PI * p.slitWidthM * sinTheta) / p.wavelengthM;
  const sinc = Math.abs(alpha) < 1e-12 ? 1 : Math.sin(alpha) / alpha;
  return Math.cos(beta) ** 2 * sinc ** 2;
}

/**
 * R5′ 비스듬한 입사의 이중 슬릿 세기(프라운호퍼):
 *   I/I₀ = cos²(π d (sinθ − sinθᵢ) / λ) · sinc²(π a (sinθ − sinθᵢ) / λ)
 *   sinθ, sinθᵢ = 나가는/들어오는 방향의 "슬릿 간격 방향 성분"(방향 코사인, 슬릿판 법선 기준 각도의 sin).
 *   밝은 무늬 d(sinθ − sinθᵢ) = mλ 는 회절격자 방정식. θᵢ = 0 이면 R5(sinθ = y/√(y² + L²)).
 * 출처: 프라운호퍼 회절에서 입사 평면파의 위상 기울기(Hecht "Optics" 10장, 회절격자).
 * 가정: R5 와 같음(먼 거리, 단색·결맞음, 슬릿은 빛보다 길다). 판 두께에 의한 그림자 무시.
 * 유효범위: R5 와 같음. 입사각이 커서 cosθᵢ → 0 이면 판 두께 효과가 커져 맞지 않는다.
 */
export function doubleSlitIntensityOblique(
  sinTheta: number,
  sinThetaIn: number,
  p: Pick<DoubleSlitParams, 'wavelengthM' | 'slitSpacingM' | 'slitWidthM'>,
): number {
  const s = sinTheta - sinThetaIn;
  const beta = (Math.PI * p.slitSpacingM * s) / p.wavelengthM;
  const alpha = (Math.PI * p.slitWidthM * s) / p.wavelengthM;
  const sinc = Math.abs(alpha) < 1e-12 ? 1 : Math.sin(alpha) / alpha;
  return Math.cos(beta) ** 2 * sinc ** 2;
}

/**
 * R6 슬릿을 지나는 세기: P_out = P_in × 2a / D.
 * 출처: 고른 세기 빔의 단면 중 두 슬릿이 차지하는 비율(폭 방향).
 * 가정: 빔 단면 세기가 고르다(실제 가우시안 빔은 가운데가 더 밝음), 슬릿이 빔 높이보다 길다.
 * 유효범위: 두 슬릿이 빔 안(d + a ≤ D). 장비 슬라이더 범위를 이 안으로 제한한다.
 * R6′ 비스듬한 입사: × cosθᵢ — 빛 쪽에서 보면 슬릿 폭이 a·cosθᵢ 로 좁아 보인다(빔 단면에 투영).
 *   cosθᵢ = √(1 − sin²θᵢ), sinθᵢ = 입사 방향의 슬릿 간격 방향 성분. 생략 = 수직 입사(R6).
 */
export function slitTransmittedPowerW(inputPowerW: number, slitWidthM: number, beamDiameterM: number, cosIncidence = 1): number {
  return (inputPowerW * 2 * slitWidthM * cosIncidence) / beamDiameterM;
}
