import type { Vec3 } from '../config/types';
import type { Channel, Signal } from '../signal/channels';

/** 플러그·소켓 종류: mains = 가정용 콘센트(220 V), dc = 직류 단자. 같은 종류끼리만 꽂힌다. */
export type PlugKind = 'mains' | 'dc';

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
  /**
   * Light 출력만: 같은 장비의 Light 입력 포트 id. 그 면에 닿은 광선을 이어서 내보낸다
   * (출발점 = 닿은 점, 방향 = 들어온 방향, R1 직진). 슬릿처럼 빛이 "지나가는" 장비용.
   * 없으면 포트 위치·directionLocal 로 쏜다(레이저처럼 빛을 "만드는" 장비).
   */
  continuesFrom?: string;
  /** Light 입력만: 이 면에 닿은 빛(빛 점·간섭 무늬)과 1 mm 눈금을 그린다(스크린). */
  displaysLight?: boolean;
  /**
   * Electric 입력만: 장비에 붙어 있는 전원선(끝에 플러그). 뽑혀 있으면 플러그가 장비 옆에 놓이고,
   * 같은 종류의 소켓(socket)에만 꽂힌다.
   */
  cord?: { plug: PlugKind };
  /** Electric 출력만: 전원선 플러그를 꽂는 소켓(콘센트·전원 단자). 전원선만 받는다. */
  socket?: PlugKind;
}

interface ParamBase {
  key: string;
  label: string;
  unit: string;
  default: number;
  /** 화면 표시 배율(값은 SI 로 저장, 표시는 값 × 배율 + unit). 예: 파장 m → nm 이면 1e9. 기본 1. */
  displayScale?: number;
}

/** 연속 수치 → 슬라이더. */
export interface SliderParamDef extends ParamBase {
  min: number;
  max: number;
  step: number;
  options?: undefined;
}

/** 정해진 값 중 하나(스위치) → 버튼 묶음. 값은 숫자(SI)로 저장되어 세팅 JSON 에 그대로 들어간다. */
export interface ChoiceParamDef extends ParamBase {
  options: { value: number; label: string }[];
}

/** 조정 가능한 수치. UI(슬라이더 / 스위치 버튼)는 이 선언에서 자동 생성된다. */
export type ParamDef = SliderParamDef | ChoiceParamDef;

/** 장비가 표시하는 읽기 전용 값(측정값 등). */
export interface ReadoutDef {
  key: string;
  label: string;
  unit: string;
  /** 화면 표시 배율(ParamDef 와 같음). */
  displayScale?: number;
  /** 값 대신 보여 줄 이름(상태 표시 등). 예: 0 = 꺼짐, 1 = 켜짐. */
  options?: { value: number; label: string }[];
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
  /** 고정 장비(테이블 콘센트 등): 집거나 돌릴 수 없고 세팅 저장에 들어가지 않는다(lab.json fixtures). */
  fixed?: boolean;
  /**
   * 스스로 빛나는 부분(LED 등): assets.json "<asset>-glow" 를 positionM 에 붙이고,
   * 색 = 파장(wavelengthParam)의 색(R4), 밝기 = readout(powerReadout) / fullPowerW (최대 1).
   */
  glow?: { positionM: Vec3; powerReadout: string; wavelengthParam: string; fullPowerW: number };
  /**
   * 이 장비가 끼울 수 있는 자리(클램프 등). id 는 이 장비 안에서 서로 달라야 한다.
   * positionM = 끼운 장비의 원점이 오는 자리(로컬 좌표, 회전 전). 물리(빛 차단 상자)에는 들어가지 않는다
   * (mounts 가 있는 장비는 받침일 뿐이라고 보고 bodyBoxes 에서 뺌).
   * heightParam 이 있으면 positionM[1] 대신 이 장비의 그 이름 param 값을 자리 높이로 쓴다
   * (params 에 있는 슬라이더로 조정 → 자리·모델이 그 값을 따른다).
   */
  mounts?: { id: string; positionM: Vec3; heightParam?: string }[];
  /**
   * 바닥·테이블·선반에 직접 놓을 수 없고, 클램프 등의 mounts 자리에만 끼울 수 있는 장비(작은 슬릿·LED 등).
   * 세팅 JSON 에서 이 장비는 반드시 mountedOn 을 갖는다.
   */
  mountOnly?: boolean;
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
  /**
   * 부하 → 전원 방향 신호(같은 케이블을 거꾸로). 입력 포트에서 보내면 다음 프레임에 그 케이블의
   * 출력 포트 쪽 장비가 replies 로 받는다. 예: LED 가 자기 V–I 특성을 전원 장치에 알린다. 케이블 채널만.
   */
  reply(inPortId: string, values: Record<string, number>): void;
  /** 출력 포트 id → 이번 프레임에 그 포트에 연결된 부하가 보낸 reply 들. */
  replies: Readonly<Record<string, readonly Signal[]>>;
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
