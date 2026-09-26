import * as THREE from 'three';
import type { LabFile } from '../config/types';
import { applyLook, approach, walkDelta, type Vec2 } from '../input/controlMath';
import { clampToRoom } from '../room/roomLayout';
import { furnitureRect } from '../room/surfaces';
import { pushOutOfRect, type Rect } from '../geom/rect';

const DEG = Math.PI / 180;

/** 1인칭 플레이어: 위치(바닥 기준)와 시선(yaw, pitch)을 카메라에 반영. */
export class Player {
  private xM: number;
  private zM: number;
  private yawRad: number;
  private pitchRad = 0;
  /** 누적 이동 거리(손 흔들림 계산용). */
  walkedM = 0;
  /** 앉기 상태(버튼으로 전환). 눈높이는 전환 시간 동안 부드럽게 바뀐다. */
  crouching = false;
  private eyeM: number;
  private readonly furniture: Rect[];

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly cfg: LabFile,
  ) {
    this.furniture = cfg.furniture.map(furnitureRect);
    this.eyeM = cfg.player.eyeHeightM;
    const [x, , z] = cfg.player.startPositionM;
    this.xM = x;
    this.zM = z;
    this.yawRad = cfg.player.startYawDeg * DEG;
    camera.rotation.order = 'YXZ';
    this.apply();
  }

  update(dtS: number, move: Vec2, lookPx: Vec2): void {
    const c = this.cfg.controls;
    const look = applyLook(
      this.yawRad, this.pitchRad, lookPx.x, lookPx.y,
      c.lookSensitivityRadPerPx, c.maxPitchDeg * DEG,
    );
    this.yawRad = look.yawRad;
    this.pitchRad = look.pitchRad;

    const pl = this.cfg.player;
    const eyeTarget = this.crouching ? pl.crouchEyeHeightM : pl.eyeHeightM;
    const eyeRate = Math.abs(pl.eyeHeightM - pl.crouchEyeHeightM) / pl.crouchTransitionS;
    this.eyeM = approach(this.eyeM, eyeTarget, eyeRate * dtS);

    const speed = pl.walkSpeedMPerS * (this.crouching ? pl.crouchSpeedFactor : 1);
    const d = walkDelta(this.yawRad, move, speed, dtS);
    let p = clampToRoom(this.xM + d.dxM, this.zM + d.dzM, this.cfg.room, this.cfg.player.radiusM);
    for (const r of this.furniture) {
      const [x, z] = pushOutOfRect(r, p.xM, p.zM, this.cfg.player.radiusM); // 가구를 통과하지 못함
      p = clampToRoom(x, z, this.cfg.room, this.cfg.player.radiusM);
    }
    this.walkedM += Math.hypot(p.xM - this.xM, p.zM - this.zM);
    this.xM = p.xM;
    this.zM = p.zM;
    this.apply();
  }

  get yaw(): number {
    return this.yawRad;
  }

  private apply(): void {
    this.camera.position.set(this.xM, this.eyeM, this.zM);
    this.camera.rotation.set(this.pitchRad, this.yawRad, 0);
  }
}
