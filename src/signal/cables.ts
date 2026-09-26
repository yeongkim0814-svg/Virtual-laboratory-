// 케이블: 출력 포트 → 입력 포트를 잇는 명시적 연결. 순수 함수 → 단위 테스트 대상.
// 장비끼리는 여전히 서로를 모른다. 버스가 케이블 목록만 보고 신호를 전달한다.

import type { EquipmentDefinition, PortDef } from '../equipment/types';
import type { Router } from './signalBus';

export interface PortAddress {
  deviceId: string;
  portId: string;
}

export interface Cable {
  from: PortAddress; // 출력 포트
  to: PortAddress; // 입력 포트
}

export const addressKey = (a: PortAddress): string => `${a.deviceId}/${a.portId}`;
const sameAddress = (a: PortAddress, b: PortAddress): boolean => a.deviceId === b.deviceId && a.portId === b.portId;

export type CableCheck =
  | { ok: true; cable: Cable }
  | { ok: false; reason: 'same-device' | 'channel' | 'direction' | 'port-busy' | 'unknown-port' };

/**
 * 두 포트를 케이블로 이을 수 있는지. 순서는 상관없다(출력→입력으로 정리해서 돌려준다).
 * 규칙: 서로 다른 장비, 같은 채널, 하나는 out·하나는 in, 각 포트는 케이블 하나만.
 */
export function checkCable(
  a: PortAddress,
  b: PortAddress,
  portOf: (addr: PortAddress) => PortDef | undefined,
  cables: readonly Cable[],
): CableCheck {
  const pa = portOf(a);
  const pb = portOf(b);
  if (!pa || !pb) return { ok: false, reason: 'unknown-port' };
  if (a.deviceId === b.deviceId) return { ok: false, reason: 'same-device' };
  if (pa.channel !== pb.channel) return { ok: false, reason: 'channel' };
  if (pa.direction === pb.direction) return { ok: false, reason: 'direction' };
  if (cables.some((c) => [c.from, c.to].some((e) => sameAddress(e, a) || sameAddress(e, b)))) {
    return { ok: false, reason: 'port-busy' };
  }
  return pa.direction === 'out' ? { ok: true, cable: { from: a, to: b } } : { ok: true, cable: { from: b, to: a } };
}

/** 이 포트에 꽂힌 케이블(없으면 undefined). */
export function cableAt(addr: PortAddress, cables: readonly Cable[]): Cable | undefined {
  return cables.find((c) => sameAddress(c.from, addr) || sameAddress(c.to, addr));
}

/** 장비 정의 목록으로 포트 찾기 함수를 만든다. deviceType: 장비 id → 종류. */
export function portLookup(
  deviceType: (deviceId: string) => string | undefined,
  definitions: ReadonlyMap<string, EquipmentDefinition>,
): (addr: PortAddress) => PortDef | undefined {
  return (addr) => {
    const type = deviceType(addr.deviceId);
    return type ? definitions.get(type)?.ports.find((p) => p.id === addr.portId) : undefined;
  };
}

/** 케이블 라우터: 출력 포트에 꽂힌 케이블의 반대쪽 입력 포트로만 전달. */
export function cableRouter(getCables: () => readonly Cable[]): Router {
  return (from, inputs) => {
    const targets = getCables().filter((c) => sameAddress(c.from, from)).map((c) => c.to);
    return inputs.filter((p) => targets.some((t) => sameAddress(t, p)));
  };
}
