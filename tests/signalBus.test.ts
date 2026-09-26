// 신호 라우팅·케이블 테스트 (연결 규칙, 물리 규칙 아님).
import { describe, expect, it } from 'vitest';
import { cableAt, cableRouter, checkCable, type Cable, type PortAddress } from '../src/signal/cables';
import { portKey, SignalBus, type PortRef } from '../src/signal/signalBus';
import type { PortDef } from '../src/equipment/types';

const ref = (deviceId: string, portId: string, direction: 'in' | 'out', channel: PortRef['channel'] = 'Electric'): PortRef => ({
  deviceId, portId, channel, direction, worldPosM: [0, 0, 0],
});
const signal = { channel: 'Electric' as const, values: { voltageV: 5 } };

// 장비 a: out(Electric), b·c: in(Electric), t: in(Thermal), a2: out(Electric)
const ports: Record<string, PortDef> = {
  'a/out': { id: 'out', channel: 'Electric', direction: 'out', positionM: [0, 0, 0] },
  'a2/out': { id: 'out', channel: 'Electric', direction: 'out', positionM: [0, 0, 0] },
  'b/in': { id: 'in', channel: 'Electric', direction: 'in', positionM: [0, 0, 0] },
  'c/in': { id: 'in', channel: 'Electric', direction: 'in', positionM: [0, 0, 0] },
  't/in': { id: 'in', channel: 'Thermal', direction: 'in', positionM: [0, 0, 0] },
  'a/in2': { id: 'in2', channel: 'Electric', direction: 'in', positionM: [0, 0, 0] },
};
const portOf = (p: PortAddress) => ports[`${p.deviceId}/${p.portId}`];
const at = (deviceId: string, portId: string): PortAddress => ({ deviceId, portId });

describe('checkCable', () => {
  it('out → in, 같은 채널 → 연결', () => {
    expect(checkCable(at('a', 'out'), at('b', 'in'), portOf, [])).toEqual({ ok: true, cable: { from: at('a', 'out'), to: at('b', 'in') } });
  });
  it('입력 쪽을 먼저 골라도 출력 → 입력으로 정리', () => {
    const r = checkCable(at('b', 'in'), at('a', 'out'), portOf, []);
    expect(r.ok && r.cable).toEqual({ from: at('a', 'out'), to: at('b', 'in') });
  });
  it('오류: 채널 다름 / 같은 방향 / 같은 장비 / 이미 꽂힌 포트 / 없는 포트', () => {
    expect(checkCable(at('a', 'out'), at('t', 'in'), portOf, [])).toEqual({ ok: false, reason: 'channel' });
    expect(checkCable(at('a', 'out'), at('a2', 'out'), portOf, [])).toEqual({ ok: false, reason: 'direction' });
    expect(checkCable(at('a', 'out'), at('a', 'in2'), portOf, [])).toEqual({ ok: false, reason: 'same-device' });
    const busy: Cable[] = [{ from: at('a', 'out'), to: at('b', 'in') }];
    expect(checkCable(at('a', 'out'), at('c', 'in'), portOf, busy)).toEqual({ ok: false, reason: 'port-busy' });
    expect(checkCable(at('a2', 'out'), at('b', 'in'), portOf, busy)).toEqual({ ok: false, reason: 'port-busy' });
    expect(checkCable(at('a', 'x'), at('b', 'in'), portOf, [])).toEqual({ ok: false, reason: 'unknown-port' });
  });
  it('cableAt: 양쪽 끝 어느 쪽으로도 찾는다', () => {
    const cables: Cable[] = [{ from: at('a', 'out'), to: at('b', 'in') }];
    expect(cableAt(at('b', 'in'), cables)).toBe(cables[0]);
    expect(cableAt(at('a', 'out'), cables)).toBe(cables[0]);
    expect(cableAt(at('c', 'in'), cables)).toBeUndefined();
  });
});

describe('cableRouter + SignalBus', () => {
  it('케이블이 꽂힌 입력 포트에만 전달(위치와 무관)', () => {
    const cables: Cable[] = [{ from: at('a', 'out'), to: at('c', 'in') }];
    const bus = new SignalBus(cableRouter(() => cables));
    const r = bus.route([{ from: ref('a', 'out', 'out'), signal }], [ref('b', 'in', 'in'), ref('c', 'in', 'in')]);
    expect(r.get(portKey('c', 'in'))).toEqual([signal]);
    expect(r.has(portKey('b', 'in'))).toBe(false);
  });
  it('케이블을 뽑으면(목록이 바뀌면) 다음 전달부터 끊긴다', () => {
    let cables: Cable[] = [{ from: at('a', 'out'), to: at('b', 'in') }];
    const bus = new SignalBus(cableRouter(() => cables));
    const route = () => bus.route([{ from: ref('a', 'out', 'out'), signal }], [ref('b', 'in', 'in')]);
    expect(route().has(portKey('b', 'in'))).toBe(true);
    cables = [];
    expect(route().has(portKey('b', 'in'))).toBe(false);
  });
  it('채널별 라우터가 있으면 기본 라우터 대신 사용', () => {
    const bus = new SignalBus(cableRouter(() => []), { Electric: (_from, all) => [...all] });
    const r = bus.route([{ from: ref('a', 'out', 'out'), signal }], [ref('far', 'in', 'in')]);
    expect(r.get(portKey('far', 'in'))).toEqual([signal]);
  });
});
