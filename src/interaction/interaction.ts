import * as THREE from 'three';
import type { LabFile, Vec3 } from '../config/types';
import type { EquipmentManager } from '../equipment/equipmentManager';
import type { Hand } from '../hand/hand';
import { placementYawRad, withinReach } from '../hand/handMath';
import { snapPlacement } from '../hand/placement';
import type { Vec2 } from '../input/controlMath';

/**
 * 탭 → 레이캐스트 → 손 동작.
 * - 빈손: 닿는 거리의 장비를 탭하면 집는다
 * - 들고 있음: 닿는 거리의 바닥(placeSurface)을 탭하면 그 자리에 놓는다(포트 근처면 스냅)
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
    const pose = {
      positionM: hit.point.toArray() as Vec3,
      yawRad: placementYawRad(this.player.yaw, this.hand.heldYawOffsetRad),
    };
    const snap = snapPlacement(held.def.ports, pose, this.manager.placedPorts(held.id), this.cfg.placement.snapRadiusM);
    this.hand.place(snap.pose);
    if (snap.snapped) this.notify(`포트 연결: ${held.id}/${snap.snapped.heldPortId} ↔ ${snap.snapped.target.deviceId}/${snap.snapped.target.portId}`);
  }
}
