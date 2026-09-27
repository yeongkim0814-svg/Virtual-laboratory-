/** 플랑크 상수 h (J·s), 빛의 속력 c (m/s), 기본 전하 e (C). SI 2019 정의값. */
const PLANCK_J_S = 6.62607015e-34;
const LIGHT_SPEED_M_S = 299792458;
const ELEMENTARY_CHARGE_C = 1.602176634e-19;

/**
 * R10 LED 문턱 전압 V_F = hc / (eλ).
 * 출처: 접합을 넘는 전자 하나가 광자 하나(에너지 hc/λ)를 만들려면 eV ≥ hc/λ (LED 로 플랑크 상수 재는 실험의 식).
 * 가정: 문턱에서 딱 꺾임(구간 선형), 스펙트럼 폭 무시.
 * 유효범위: 교육용 근사. 실제 파랑·초록(InGaN) LED 는 이보다 높다(파랑 식 2.64 V, 실제 약 3 V).
 */
export function ledThresholdV(wavelengthM: number): number {
  return (PLANCK_J_S * LIGHT_SPEED_M_S) / (ELEMENTARY_CHARGE_C * wavelengthM);
}

/**
 * R10 LED 빛 출력 P = η · I · V_F.
 * 출처: 1초에 지나는 전자 수 I/e 중 η 만큼이 광자(에너지 eV_F = hc/λ)가 되어 나간다.
 * 가정: 외부 양자효율 η 는 전류와 무관한 상수(효율 저하·발열 무시).
 * 유효범위: 정격 전류 이하.
 */
export function ledOpticalPowerW(currentA: number, thresholdV: number, efficiency: number): number {
  return efficiency * currentA * thresholdV;
}

/**
 * R10 LED 탐: 전류가 정격을 넘으면 탄다(정격 그대로는 괜찮음). 탄 LED 는 끊긴 회로(전류 0).
 * 가정: 순간적으로 판정(열 축적·시간 무시).
 */
export function ledBurnsOut(currentA: number, ratedCurrentA: number): boolean {
  return currentA > ratedCurrentA;
}
