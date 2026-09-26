// public/assets.json, public/lab.json 의 타입 정의.
// 시각 요소 값(색·두께·모델 경로)은 전부 assets.json 에서만 온다.

export type Vec3 = [number, number, number];

export interface PlaceholderStyle {
  color: string;
  /** 판 형태(바닥·벽) placeholder 의 두께. 크기는 방 크기에서 정해진다. */
  thicknessM?: number;
  /** 고정 크기 placeholder(장비 등)의 [x, y, z]. */
  sizeM?: Vec3;
}

export interface EnvironmentSpec {
  backgroundColor: string;
  ambientLightColor: string;
  ambientLightIntensity: number;
  sunLightColor: string;
  sunLightIntensity: number;
  sunLightDirection: Vec3;
}

export interface AssetsFile {
  /** 에셋 이름 → .glb 경로(public/ 기준). null 이면 placeholder 표시. */
  assets: Record<string, string | null>;
  /** model 이 null 일 때 쓰는 placeholder 의 외형. */
  placeholders: Record<string, PlaceholderStyle>;
  environment: EnvironmentSpec;
  placementPreview: PlacementPreviewStyle;
  wiring: WiringStyle;
  /** 레이저 빛(선·빛 점) 외형. 색은 파장에서 계산. showBeam = false 면 빛 점만(실제 공기 중처럼). */
  laserBeam: { showBeam: boolean; beamRadiusM: number; beamOpacity: number; spotRadiusM: number };
  /** 스크린 면 표시: 눈금(색·간격·띠 높이·선 굵기), 면에서 띄우는 높이, 무늬 밝기 배율. */
  screenOverlay: {
    rulerColor: string;
    rulerTickM: number;
    rulerBandHeightM: number;
    rulerLineWidthM: number;
    liftM: number;
    patternGain: number;
  };
  /** 장비 회전 중 표시하는 고리(밑넓이 원 둘레). */
  rotateGizmo: { color: string; tubeRadiusM: number; opacity: number; liftM: number };
}

/** 케이블·포트 외형. */
export interface WiringStyle {
  cableColor: string;
  cableRadiusM: number;
  /** 포트 탭 판정 반경(보이지 않음). 작은 포트를 손가락으로 누르기 쉽게. */
  portHitRadiusM: number;
  /** 케이블을 이을 포트를 골랐을 때 포트 표시 확대 배율. */
  selectedPortScale: number;
}

/** 배치 미리보기(반투명 장비 + 밑넓이 셀) 외형. */
export interface PlacementPreviewStyle {
  validColor: string;
  invalidColor: string;
  cellOpacity: number;
  ghostOpacity: number;
  /** 셀 표시 사각형 크기 / 셀 크기 (셀 사이 틈이 보이게). */
  cellInsetRatio: number;
  /** 바닥과 겹쳐 깜박이지 않게 셀 표시를 띄우는 높이. */
  cellLiftM: number;
}

export interface RoomSize {
  widthM: number; // x 방향 내부 폭
  depthM: number; // z 방향 내부 깊이
  heightM: number;
}

/**
 * 가구(방 구성, 고정). sizeM = [폭 x, 높이 y, 깊이 z], 원점 = 바닥 중앙, 로컬 +z = 앞.
 * 모양은 assets.json 의 type 이름 에셋(없으면 아래 치수로 만든 단순 부품들).
 * 모델을 바꿔도 여기 치수가 기능(윗면·선반 높이, 다리 자리)을 정하므로 모델과 맞춰야 한다.
 */
export type FurnitureDef = TableDef | CupboardDef;

interface FurnitureBase {
  id: string;
  positionM: Vec3;
  rotationYDeg: number;
  sizeM: Vec3;
}

export interface TableDef extends FurnitureBase {
  type: 'table';
  /** 상판 두께. */
  topThicknessM: number;
  /** 다리 한 변(정사각 단면, 네 모서리). 바닥 케이블은 다리만 피해 테이블 밑을 지난다. */
  legSizeM: number;
}

/** 문 없는 선반형 보관함. 선반마다 장비를 놓을 수 있다. */
export interface CupboardDef extends FurnitureBase {
  type: 'cupboard';
  /** 선반 칸 수(맨 아래 바닥판 포함). */
  shelves: number;
  /** 옆·뒤·위 판과 선반 판 두께. */
  panelThicknessM: number;
}

export interface LabFile {
  room: RoomSize;
  furniture: FurnitureDef[];
  /** 장비 배치 격자. 셀 중심 = (k·cellSizeM), 방 중심이 셀 (0,0) 중심. */
  grid: { cellSizeM: number };
  /**
   * 케이블(전원선·연결선). 늘어나지 않는 줄: 장비를 피해 가는 경로가 maxLengthM 보다 길면
   * 연결할 수 없고, 연결 중이면 빠진다.
   */
  cable: { maxLengthM: number; portStubM: number; clearanceM: number };
  player: {
    startPositionM: Vec3;
    startYawDeg: number;
    eyeHeightM: number;
    /** 벽과의 최소 거리(몸 반지름). */
    radiusM: number;
    walkSpeedMPerS: number;
    /** 앉았을 때 눈높이, 서기↔앉기 전환 시간, 앉아서 걷는 속도 배율. */
    crouchEyeHeightM: number;
    crouchTransitionS: number;
    crouchSpeedFactor: number;
  };
  camera: { fovDeg: number; nearM: number; farM: number };
  controls: {
    joystickRadiusPx: number;
    lookSensitivityRadPerPx: number;
    maxPitchDeg: number;
    /** 탭 판정: 이 거리(px) 이하로 움직이고 이 시간(s) 안에 떼면 탭. */
    tapMaxMovePx: number;
    tapMaxDurationS: number;
    /** 이 시간(s) 이상 거의 움직이지 않고 누르면 길게 누르기(장비 회전 시작). */
    longPressS: number;
    /** 장비 회전: 좌우 1 px 당 각도, 이 간격(°)의 배수 ±window° 안이면 그 각도에 붙음. */
    rotateDegPerPx: number;
    rotateSnapStepDeg: number;
    rotateSnapWindowDeg: number;
  };
  hand: HandConfig;
}

/** 1인칭 손(뷰모델). 좌표는 카메라 기준(+x 오른쪽, +y 위, -z 앞). */
export interface HandConfig {
  /** 빈손·한 손으로 들 때 오른손 손바닥 위치. */
  rightRestM: Vec3;
  /** 쓰지 않을 때 왼손을 두는 곳(화면 밖 아래). */
  leftRestM: Vec3;
  /** 두 손으로 들 때 grip 점들의 가운데가 오는 위치. */
  twoHandAnchorM: Vec3;
  /** 손 모델 로컬 좌표의 손바닥 점(오른손 기준, 왼손은 x 반전). */
  palmOffsetM: Vec3;
  /** 손이 목표 위치를 따라가는 빠르기(1/s). */
  handFollowPerS: number;
  /** 집기·놓기가 가능한 거리(카메라에서). */
  reachM: number;
  /** 장비가 손으로/손에서 옮겨지는 시간. */
  transitionS: number;
  swayMPerPx: number;
  swayMaxM: number;
  swayReturnPerS: number;
  bobAmplitudeM: number;
  bobCyclesPerM: number;
  /** 집기·놓기 때 손 휘두르기(Minecraft 식). */
  swing: {
    durationS: number;
    grabAtPhase: number;
    offsetM: Vec3;
    rotDeg: Vec3;
  };
}
