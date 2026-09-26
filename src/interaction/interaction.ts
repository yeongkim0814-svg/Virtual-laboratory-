import * as THREE from 'three';
import type { LabFile, Vec3 } from '../config/types';
import type { EquipmentInstance, EquipmentManager } from '../equipment/equipmentManager';
import type { Hand } from '../hand/hand';
import { placementYawRad, withinReach } from '../hand/handMath';
import { resolvePlacement } from '../hand/overlap';
import { snapPlacement, type PlacementPose } from '../hand/placement';
import type { Vec2 } from '../input/controlMath';

const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * 탭·버튼 → 레이캐스트 → 손 동작.
 * - 빈손: 닿는 거리의 장비를 탭하면 집는다
 * - 들고 있음: 닿는 거리의 바닥(placeSurface)을 탭하면 놓는다(포트 스냅 → 겹침 해소)
 * - 놓기 버튼: 지금 들고 있는 자리 바로 아래로 떨어뜨린다(겹침 해소)
 */
export class Interaction {
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly surfaces: THREE.Object3D,
    private readonly manager: EquipmentManager,
    private readonly hand: Hand,
    private readonly player: { yaw: number },
    private readonly cfg: LabFile,
    private readonly notify: (msg: string) => void,
  ) {}

  handleTap(tap: Vec2): void {
    if (this.hand.busy) return;
    this.raycaster.setFromCamera(
      new THREE.Vector2((tap.x / window.innerWidth) * 2 - 1, -(tap.y / window.innerHeight) * 2 + 1),
      this.camera,
    );
    const eye = this.camera.getWorldPosition(new THREE.Vector3());
    const eyeM: Vec3 = [eye.x, eye.y, eye.z];
    const held = this.hand.heldInstance;

    if (!held) {
      const hit = this.raycaster.intersectObject(this.manager.group, true)[0];
      const inst = hit && this.manager.findByObject(hit.object);
      if (!inst) return;
      if (!withinReach(eyeM, hit.point.toArray(), this.cfg.hand.reachM)) {
        this.notify('너무 멀어요. 더 가까이 가세요');
        return;
      }
      this.hand.pick(inst, this.player.yaw);
      return;
    }

    // 들고 있을 때: 바닥과 다른 장비 중 가장 먼저 맞은 것
    const hit = this.raycaster.intersectObjects([this.surfaces, this.manager.group], true)[0];
    if (!hit) return;
    if (!hit.object.userData.placeSurface) {
      this.notify('여기에는 놓을 수 없어요');
      return;
    }
    if (!withinReach(eyeM, hit.point.toArray(), this.cfg.hand.reachM)) {
      this.notify('너무 멀어요. 더 가까이 가세요');
      return;
    }
    const pose: PlacementPose = {
      positionM: hit.point.toArray() as Vec3,
      yawRad: placementYawRad(this.player.yaw, this.hand.heldYawOffsetRad),
    };
    const snap = snapPlacement(held.def.ports, pose, this.manager.placedPorts(held.id), this.cfg.placement.snapRadiusM);
    const final = this.resolve(held, snap.pose);
    if (!final) {
      this.notify('놓을 공간이 부족해요');
      return;
    }
    this.hand.place(final);
    const moved = Math.hypot(final.positionM[0] - snap.pose.positionM[0], final.positionM[2] - snap.pose.positionM[2]);
    if (snap.snapped && moved < 1e-3) {
      this.notify(`포트 연결: ${held.id}/${snap.snapped.heldPortId} ↔ ${snap.snapped.target.deviceId}/${snap.snapped.target.portId}`);
    }
  }

  /** 놓기 버튼: 들고 있는 장비를 그 자리 바로 아래 면으로 떨어뜨린다. */
  drop(): void {
    const held = this.hand.heldInstance;
    if (!held || this.hand.busy) return;
    const obj = held.object;
    const pos = obj.getWorldPosition(new THREE.Vector3());
    const yawRad = new THREE.Euler().setFromQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;

    // 장비 원점(바닥 중앙) 바로 아래의 놓을 수 있는 면. 없으면 떨어뜨리지 않는다.
    this.raycaster.set(pos.clone().add(new THREE.Vector3(0, 0.01, 0)), DOWN);
    const below = this.raycaster.intersectObject(this.surfaces, true).find((h) => h.object.userData.placeSurface);
    if (!below) {
      this.notify('아래에 놓을 곳이 없어요');
      return;
    }
    const final = this.resolve(held, { positionM: [pos.x, below.point.y, pos.z], yawRad });
    if (!final) {
      this.notify('놓을 공간이 부족해요');
      return;
    }
    this.hand.drop(final);
  }

  /** 방 안으로 넣고 다른 장비와 겹치지 않게. 불가능하면 null. */
  private resolve(held: EquipmentInstance, pose: PlacementPose): PlacementPose | null {
    const r = resolvePlacement(
      held.footprint,
      { xM: pose.positionM[0], zM: pose.positionM[2], yawRad: pose.yawRad },
      this.manager.placedFootprints(held.id),
      this.cfg.room,
    );
    return r && { positionM: [r.xM, pose.positionM[1], r.zM], yawRad: r.yawRad };
  }
}
