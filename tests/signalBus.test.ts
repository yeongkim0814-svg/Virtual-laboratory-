// 신호 라우팅 테스트 (연결 규칙, 물리 규칙 아님).
import { describe, expect, it } from 'vitest';
import { contactRouter, portKey, SignalBus, type PortRef } from '../src/signal/signalBus';

const out = (deviceId: string, pos: [number, number, number], channel: PortRef['channel'] = 'Electric'): PortRef => ({
  deviceId, portId: 'out', channel, direction: 'out', worldPosM: pos,
});
const inp = (deviceId: string, pos: [number, number, number], channel: PortRef['channel'] = 'Electric'): PortRef => ({
  deviceId, portId: 'in', channel, direction: 'in', worldPosM: pos,
});

describe('contactRouter (허용 거리 0.02 m)', () => {
  const route = contactRouter(0.02);
  it('같은 채널, 거리 0.01 m → 연결', () => {
    expect(route(out('a', [0, 0, 0]), [inp('b', [0.01, 0, 0])])).toHaveLength(1);
  });
  it('같은 채널, 거리 0.03 m → 연결 안 됨', () => {
    expect(route(out('a', [0, 0, 0]), [inp('b', [0.03, 0, 0])])).toHaveLength(0);
  });
  it('3차원 거리로 판정: (0.012, 0.016, 0) → 0.02 m 경계 포함', () => {
    expect(route(out('a', [0, 0, 0]), [inp('b', [0.012, 0.016, 0])])).toHaveLength(1);
  });
  it('채널이 다르면 붙어 있어도 연결 안 됨', () => {
    expect(route(out('a', [0, 0, 0], 'Electric'), [inp('b', [0, 0, 0], 'Thermal')])).toHaveLength(0);
  });
  it('자기 자신의 입력 포트에는 전달 안 함', () => {
    expect(route(out('a', [0, 0, 0]), [inp('a', [0, 0, 0])])).toHaveLength(0);
  });
});

describe('SignalBus', () => {
  const signal = { channel: 'Electric' as const, values: { voltageV: 5 } };

  it('닿은 입력 포트마다 신호를 모은다', () => {
    const bus = new SignalBus(contactRouter(0.02));
    const inputs = [inp('b', [0, 0, 0]), inp('c', [0, 0, 0]), inp('d', [5, 0, 0])];
    const r = bus.route([{ from: out('a', [0, 0, 0]), signal }], inputs);
    expect(r.get(portKey('b', 'in'))).toEqual([signal]);
    expect(r.get(portKey('c', 'in'))).toEqual([signal]);
    expect(r.has(portKey('d', 'in'))).toBe(false);
  });
  it('채널별 라우터가 있으면 기본 라우터 대신 사용', () => {
    const bus = new SignalBus(contactRouter(0.02), { Electric: (_from, all) => [...all] });
    const r = bus.route([{ from: out('a', [0, 0, 0]), signal }], [inp('far', [9, 9, 9])]);
    expect(r.get(portKey('far', 'in'))).toEqual([signal]);
  });
});
