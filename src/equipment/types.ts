import type { Vec3 } from '../config/types';
import type { Channel, Signal } from '../signal/channels';

export interface PortDef {
  id: string;
  channel: Channel;
  direction: 'in' | 'out';
  /** 장비 로컬 좌표(원점=바닥 중앙, 회전 전). */
  positionM: Vec3;
}

/** 조정 가능한 수치. 슬라이더 UI 는 이 선언에서 자동 생성된다. */
export interface ParamDef {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

/** 장비가 표시하는 읽기 전용 값(측정값 등). */
export interface ReadoutDef {
  key: string;
  label: string;
  unit: string;
}

/** 장비 정의(JSON). devices/<type>/definition.json */
export interface EquipmentDefinition {
  type: string;
  label: string;
  /** assets.json 의 에셋 이름. */
  asset: string;
  channels: Channel[];
  ports: PortDef[];
  params: ParamDef[];
  readouts: ReadoutDef[];
}

/** 동작 모듈이 매 프레임 받는 문맥. 다른 장비에 대한 참조는 없다. */
export interface BehaviorContext {
  dtS: number;
  params: Readonly<Record<string, number>>;
  /** 입력 포트 id → 이번 프레임에 도착한 신호들. */
  inputs: Readonly<Record<string, readonly Signal[]>>;
  /** 출력 포트로 신호를 내보낸다(채널은 포트 선언을 따른다). */
  emit(portId: string, values: Record<string, number>): void;
  /** 읽기 전용 값 갱신. null = 표시할 값 없음. */
  setReadout(key: string, value: number | null): void;
}

export interface Behavior {
  update(ctx: BehaviorContext): void;
}

/** 동작 모듈(devices/<type>/behavior.ts)이 default export 하는 객체. */
export interface BehaviorModule {
  type: string;
  create(): Behavior;
}
