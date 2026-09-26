import * as THREE from 'three';
import type { LabFile } from '../config/types';
import { applyLook, walkDelta, type Vec2 } from '../input/controlMath';
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
  private readonly furniture: Rect[];

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly cfg: LabFile,
  ) {
    this.furniture = cfg.furniture.map(furnitureRect);
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

    const d = walkDelta(this.yawRad, move, this.cfg.player.walkSpeedMPerS, dtS);
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
    this.camera.position.set(this.xM, this.cfg.player.eyeHeightM, this.zM);
    this.camera.rotation.set(this.pitchRad, this.yawRad, 0);
  }
}
