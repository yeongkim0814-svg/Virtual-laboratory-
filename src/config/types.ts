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

export interface LabFile {
  room: RoomSize;
  /** 장비 배치 격자. 셀 중심 = (k·cellSizeM), 방 중심이 셀 (0,0) 중심. */
  grid: { cellSizeM: number };
  signal: {
    /** 출력·입력 포트가 이 거리 이하면 연결된 것으로 본다. */
    contactToleranceM: number;
  };
  player: {
    startPositionM: Vec3;
    startYawDeg: number;
    eyeHeightM: number;
    /** 벽과의 최소 거리(몸 반지름). */
    radiusM: number;
    walkSpeedMPerS: number;
  };
  camera: { fovDeg: number; nearM: number; farM: number };
  controls: {
    joystickRadiusPx: number;
    lookSensitivityRadPerPx: number;
    maxPitchDeg: number;
    /** 탭 판정: 이 거리(px) 이하로 움직이고 이 시간(s) 안에 떼면 탭. */
    tapMaxMovePx: number;
    tapMaxDurationS: number;
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
