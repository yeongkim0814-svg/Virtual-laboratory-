// 신호 라우팅. 장비는 서로를 모르고, 버스가 포트 위치·채널만 보고 신호를 전달한다.

import type { Vec3 } from '../config/types';
import type { Channel, Signal } from './channels';

export interface PortRef {
  deviceId: string;
  portId: string;
  channel: Channel;
  direction: 'in' | 'out';
  worldPosM: Vec3;
}

export interface Emission {
  from: PortRef;
  signal: Signal;
}

/** 출력 포트 하나가 어느 입력 포트들에 닿는지 결정한다. 채널별로 교체 가능. */
export type Router = (from: PortRef, inputs: readonly PortRef[]) => PortRef[];

/**
 * 접촉 라우터: 같은 채널의 입력 포트 중 출력 포트와 거리가 toleranceM 이하인 것에 전달.
 * (커넥터를 꽂은 것처럼 포트끼리 맞닿아야 연결된다.)
 */
export function contactRouter(toleranceM: number): Router {
  return (from, inputs) =>
    inputs.filter((p) => {
      if (p.channel !== from.channel || p.deviceId === from.deviceId) return false;
      const dx = p.worldPosM[0] - from.worldPosM[0];
      const dy = p.worldPosM[1] - from.worldPosM[1];
      const dz = p.worldPosM[2] - from.worldPosM[2];
      return Math.hypot(dx, dy, dz) <= toleranceM;
    });
}

export const portKey = (deviceId: string, portId: string): string => `${deviceId}/${portId}`;

export class SignalBus {
  /**
   * @param defaultRouter 채널별 라우터가 없을 때 사용
   * @param routers 채널별 라우터(예: 나중에 Light 는 광선 추적 라우터)
   */
  constructor(
    private readonly defaultRouter: Router,
    private readonly routers: Partial<Record<Channel, Router>> = {},
  ) {}

  /** 방출된 신호들을 입력 포트별로 모은다. key = portKey(deviceId, portId) */
  route(emissions: readonly Emission[], inputs: readonly PortRef[]): Map<string, Signal[]> {
    const out = new Map<string, Signal[]>();
    for (const e of emissions) {
      const router = this.routers[e.from.channel] ?? this.defaultRouter;
      for (const target of router(e.from, inputs)) {
        const k = portKey(target.deviceId, target.portId);
        const list = out.get(k);
        if (list) list.push(e.signal);
        else out.set(k, [e.signal]);
      }
    }
    return out;
  }
}
