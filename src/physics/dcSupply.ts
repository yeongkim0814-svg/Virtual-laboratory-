export interface DcOperatingPoint {
  voltageV: number;
  currentA: number;
  /** CV = 정전압(설정 전압 유지), CC = 정전류(전류 한계에 걸려 전압을 낮춤). */
  mode: 'CV' | 'CC';
}

/**
 * R9 직류 전원 장치의 동작점 (정전압 CV / 정전류 CC).
 * 출처: 실험실 직류 전원(CV/CC 자동 전환)의 표준 동작 + 옴의 법칙 V = IR.
 *   V_set / R ≤ I_set → CV: V = V_set, I = V_set / R
 *   V_set / R > I_set → CC: I = I_set, V = I_set · R
 *   부하 없음(개방, R = ∞) → V = V_set, I = 0
 * 가정: 이상적 조정(리플·내부 저항 없음), 전환은 즉시. 경계(V_set / R = I_set)는 CV 로 본다.
 * 유효범위: 저항성 부하(R ≥ 0). 다이오드·LED 같은 비선형 부하는 별도 모델이 필요.
 */
export function dcOperatingPoint(setVoltageV: number, currentLimitA: number, loadOhm: number | null): DcOperatingPoint {
  if (loadOhm === null) return { voltageV: setVoltageV, currentA: 0, mode: 'CV' };
  // 비교를 곱셈으로(R = 0 단락에서도 나눗셈 없이): V_set ≤ I_set · R 이면 CV
  if (setVoltageV <= currentLimitA * loadOhm) return { voltageV: setVoltageV, currentA: setVoltageV / loadOhm, mode: 'CV' };
  return { voltageV: currentLimitA * loadOhm, currentA: currentLimitA, mode: 'CC' };
}
