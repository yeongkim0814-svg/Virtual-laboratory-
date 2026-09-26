/** 슬라이더 step 에 맞는 소수 자릿수로 표시. (step 0.1 → 1자리, 0.005 → 3자리) */
export function decimalsForStep(step: number): number {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

export function formatValue(value: number | null, unit: string, decimals = 2): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals)} ${unit}`.trim();
}
