// 방(바닥 + 벽 4개) 배치 계산. 순수 함수 → 단위 테스트 대상.
// 좌표: 방 내부 중심이 원점, 바닥 윗면이 y=0.

import type { RoomSize } from '../config/types';

export interface Placement {
  positionM: [number, number, number];
  rotationYRad: number;
  /** placeholder 상자 크기 [x, y, z] (회전 전 로컬 기준). */
  sizeM: [number, number, number];
}

/** 바닥판: 윗면이 y=0 이 되도록 두께만큼 내려 둔다. */
export function floorPlacement(room: RoomSize, thicknessM: number): Placement {
  return {
    positionM: [0, -thicknessM, 0],
    rotationYRad: 0,
    sizeM: [room.widthM, thicknessM, room.depthM],
  };
}

/**
 * 벽 4개: 안쪽 면이 방 경계(±width/2, ±depth/2)에 오도록 두께의 절반만큼 바깥에 둔다.
 * 모서리 틈이 없도록 길이를 양쪽으로 두께만큼 늘린다.
 * 순서: 북(-z), 남(+z), 서(-x), 동(+x). 동·서 벽은 y축 90° 회전.
 */
export function wallPlacements(room: RoomSize, thicknessM: number): Placement[] {
  const t = thicknessM;
  const hx = room.widthM / 2 + t / 2;
  const hz = room.depthM / 2 + t / 2;
  const nsSize: [number, number, number] = [room.widthM + 2 * t, room.heightM, t];
  const ewSize: [number, number, number] = [room.depthM + 2 * t, room.heightM, t];
  return [
    { positionM: [0, 0, -hz], rotationYRad: 0, sizeM: nsSize },
    { positionM: [0, 0, hz], rotationYRad: Math.PI, sizeM: nsSize },
    { positionM: [-hx, 0, 0], rotationYRad: Math.PI / 2, sizeM: ewSize },
    { positionM: [hx, 0, 0], rotationYRad: -Math.PI / 2, sizeM: ewSize },
  ];
}

/**
 * 벽 충돌(단순): 플레이어 중심을 벽에서 radius 이상 떨어진 사각형 안으로 자른다.
 */
export function clampToRoom(
  xM: number,
  zM: number,
  room: RoomSize,
  radiusM: number,
): { xM: number; zM: number } {
  const maxX = room.widthM / 2 - radiusM;
  const maxZ = room.depthM / 2 - radiusM;
  return {
    xM: Math.max(-maxX, Math.min(maxX, xM)),
    zM: Math.max(-maxZ, Math.min(maxZ, zM)),
  };
}
