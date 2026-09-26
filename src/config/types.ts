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
}

export interface RoomSize {
  widthM: number; // x 방향 내부 폭
  depthM: number; // z 방향 내부 깊이
  heightM: number;
}

export interface LabFile {
  room: RoomSize;
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
  };
}
