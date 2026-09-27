// 신호 라우팅. 장비는 서로를 모르고, 버스가 라우터(케이블 목록 등)만 보고 신호를 전달한다.

import type { Vec3 } from '../config/types';
import type { Channel, Signal } from './channels';

export interface PortRef {
  deviceId: string;
  portId: string;
  channel: Channel;
  direction: 'in' | 'out';
  worldPosM: Vec3;
  /** Light 포트만: 월드 방향(출력 = 빛이 나가는 방향, 입력 = 받는 면 바깥 법선). */
  worldDirM?: Vec3;
  /** Light 입력만: 받는 면 크기 [가로, 세로]. */
  faceSizeM?: [number, number];
  /** Light 입력만: 닿은 빛(빛 점·간섭 무늬)을 이 면에 그린다(PortDef.displaysLight). */
  displaysLight?: boolean;
  /** Light 출력만: 이 입력 포트에 닿은 광선을 이어서 내보낸다(PortDef.continuesFrom). */
  continuesFrom?: string;
}

export interface Emission {
  from: PortRef;
  signal: Signal;
}

/** 라우터가 고른 받는 포트. extraValues = 전달 경로가 덧붙이는 값(예: 빛의 입사각), 신호 값에 합쳐진다. */
export type RouteTarget = PortRef & { extraValues?: Record<string, number> };

/** 출력 포트 하나가 어느 입력 포트들에 닿는지 결정한다. 채널별로 교체 가능. */
export type Router = (from: PortRef, inputs: readonly PortRef[], signal: Signal) => RouteTarget[];

export const portKey = (deviceId: string, portId: string): string => `${deviceId}/${portId}`;

export class SignalBus {
  /**
   * @param defaultRouter 채널별 라우터가 없을 때 사용
   * @param routers 채널별 라우터(예: 나중에 Light 는 광선 추적 라우터, 나머지는 케이블)
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
      for (const target of router(e.from, inputs, e.signal)) {
        const k = portKey(target.deviceId, target.portId);
        const signal = target.extraValues ? { ...e.signal, values: { ...e.signal.values, ...target.extraValues } } : e.signal;
        const list = out.get(k);
        if (list) list.push(signal);
        else out.set(k, [signal]);
      }
    }
    return out;
  }
}
