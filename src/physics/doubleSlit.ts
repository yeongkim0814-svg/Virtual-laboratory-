// 이중 슬릿 — 사용자 승인 규칙 R5·R6. 순수 함수 → 단위 테스트 대상.
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
 * R6 슬릿을 지나는 세기: P_out = P_in × 2a / D.
 * 출처: 고른 세기 빔의 단면 중 두 슬릿이 차지하는 비율(폭 방향).
 * 가정: 빔 단면 세기가 고르다(실제 가우시안 빔은 가운데가 더 밝음), 슬릿이 빔 높이보다 길다.
 * 유효범위: 두 슬릿이 빔 안(d + a ≤ D). 장비 슬라이더 범위를 이 안으로 제한한다.
 */
export function slitTransmittedPowerW(inputPowerW: number, slitWidthM: number, beamDiameterM: number): number {
  return (inputPowerW * 2 * slitWidthM) / beamDiameterM;
}
