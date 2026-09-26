/** 신호 채널 목록. 새 채널이 필요하면 여기에만 추가한다. */
export const CHANNELS = ['Light', 'Electric', 'Mechanical', 'Thermal', 'Chemical'] as const;
export type Channel = (typeof CHANNELS)[number];

export function isChannel(v: unknown): v is Channel {
  return typeof v === 'string' && (CHANNELS as readonly string[]).includes(v);
}

/**
 * 채널 위를 흐르는 신호 1개. 값의 키는 SI 단위를 표기한다(voltageV, powerW …).
 * 어떤 키를 쓰는지는 채널을 사용하는 장비들 사이의 약속이다.
 */
export interface Signal {
  channel: Channel;
  values: Readonly<Record<string, number>>;
}
