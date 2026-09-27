export interface DcOperatingPoint {
  voltageV: number;
  currentA: number;
  /** CV = 정전압(설정 전압 유지), CC = 정전류(전류 한계에 걸려 전압을 낮춤). */
  mode: 'CV' | 'CC';
}

/**
 * 구간 선형 부하: V < thresholdV 이면 I = 0, 아니면 I = (V − thresholdV) / seriesOhm.
 * 저항 = 문턱 0 V 인 경우, LED(R10) = 문턱 V_F + 직렬 저항 R_D.
 */
export interface DcLoad {
  thresholdV: number;
  seriesOhm: number;
}

/**
 * R9 직류 전원 장치의 동작점 (정전압 CV / 정전류 CC). R10 에서 문턱 있는 부하(LED)로 확장.
 * 출처: 실험실 직류 전원(CV/CC 자동 전환)의 표준 동작 + 부하의 V–I 관계(저항은 옴의 법칙 V = IR).
 *   CV 로 계산한 전류 I = max(0, (V_set − V_th) / R) ≤ I_set → CV: V = V_set
 *   I > I_set → CC: I = I_set, V = V_th + I_set · R
 *   부하 없음(개방) → V = V_set, I = 0
 * 가정: 이상적 조정(리플·내부 저항 없음), 전환은 즉시. 경계(I = I_set)는 CV 로 본다.
 * 유효범위: 저항성 부하와 구간 선형 부하(R10 LED 근사).
 * @param load 저항값(Ω) 또는 구간 선형 부하. null = 개방.
 */
export function dcOperatingPoint(setVoltageV: number, currentLimitA: number, load: number | DcLoad | null): DcOperatingPoint {
  if (load === null) return { voltageV: setVoltageV, currentA: 0, mode: 'CV' };
  const { thresholdV, seriesOhm } = typeof load === 'number' ? { thresholdV: 0, seriesOhm: load } : load;
  const overV = Math.max(0, setVoltageV - thresholdV);
  // 비교를 곱셈으로(R = 0 단락에서도 나눗셈 없이): (V_set − V_th) ≤ I_set · R 이면 CV
  if (overV <= currentLimitA * seriesOhm) {
    return { voltageV: setVoltageV, currentA: overV === 0 ? 0 : overV / seriesOhm, mode: 'CV' };
  }
  return { voltageV: thresholdV + currentLimitA * seriesOhm, currentA: currentLimitA, mode: 'CC' };
}
