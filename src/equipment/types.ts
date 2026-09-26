import type { Vec3 } from '../config/types';
import type { Channel, Signal } from '../signal/channels';

export interface PortDef {
  id: string;
  channel: Channel;
  direction: 'in' | 'out';
  /** 장비 로컬 좌표(원점=바닥 중앙, 회전 전). */
  positionM: Vec3;
  /**
   * Light 포트만: 장비 로컬 방향(단위벡터). 출력 = 빛이 나가는 방향, 입력 = 받는 면의 바깥 법선.
   * Light 는 케이블이 아니라 광선 추적으로 전달된다.
   */
  directionLocal?: Vec3;
  /** Light 입력만: 빛을 받는 면 크기 [가로, 세로] (면 중심 = positionM, 가로축 = 로컬 y축 × 법선). */
  faceSizeM?: [number, number];
  /** Light 입력만: 이 면에 닿은 빛(빛 점·간섭 무늬)과 1 mm 눈금을 그린다(스크린). */
  displaysLight?: boolean;
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
  /** 화면 표시 배율(값은 SI 로 저장, 표시는 값 × 배율 + unit). 예: 파장 m → nm 이면 1e9. 기본 1. */
  displayScale?: number;
}

/** 장비가 표시하는 읽기 전용 값(측정값 등). */
export interface ReadoutDef {
  key: string;
  label: string;
  unit: string;
  /** 화면 표시 배율(ParamDef 와 같음). */
  displayScale?: number;
}

/** 장비 정의(JSON). devices/<type>/definition.json */
export interface EquipmentDefinition {
  type: string;
  label: string;
  /** assets.json 의 에셋 이름. */
  asset: string;
  /**
   * 드는 방법. hands = 1(한 손) | 2(두 손), grips = 손바닥이 닿는 점(장비 로컬 좌표), 손 수만큼.
   * 두 손이면 두 점 중 왼쪽에 있는 점을 왼손이 잡는다.
   */
  hold: { hands: 1 | 2; grips: Vec3[] };
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
