import * as THREE from 'three';
import type { HandConfig } from '../config/types';
import type { EquipmentInstance, EquipmentManager } from '../equipment/equipmentManager';
import { bobOffsetM, heldLocalPosition, smoothstep, swayStep, wrapAngleRad, type SwayState } from './handMath';
import type { PlacementPose } from './placement';

const DEG = Math.PI / 180;
/** 들고 있는 동안 회전 버튼 등으로 바뀐 자세를 따라가는 빠르기(1/s). */
const HOLD_FOLLOW_PER_S = 20;

type HandState =
  | { kind: 'empty' }
  | { kind: 'picking'; inst: EquipmentInstance; tS: number; fromPos: THREE.Vector3; fromQuat: THREE.Quaternion }
  | { kind: 'holding'; inst: EquipmentInstance }
  | {
      kind: 'placing';
      inst: EquipmentInstance;
      tS: number;
      fromPos: THREE.Vector3;
      fromQuat: THREE.Quaternion;
      pose: PlacementPose;
    };

/**
 * 1인칭 손(카메라에 붙은 뷰모델). 장비를 집고, 들고, 내려놓는다.
 *
 * - 집기: 장비의 grip 점이 손바닥(gripAnchor)에 오도록 transitionS 동안 부드럽게 이동
 * - 들기: 손은 시점 회전에 살짝 뒤따르고(sway), 걸으면 위아래로 흔들린다(bob)
 * - 놓기: 손에서 목표 자세까지 transitionS 동안 이동한 뒤 월드에 놓인다
 *
 * 찬장 등에서 새 장비를 꺼내는 기능은 EquipmentManager 에 장비를 만든 뒤 pick() 을 부르면 된다.
 */
export class Hand {
  private state: HandState = { kind: 'empty' };
  /** 손 기준으로 들고 있는 장비의 회전(회전 버튼으로 바뀜). */
  private heldYawRad = 0;
  private sway: SwayState = { x: 0, y: 0 };
  private readonly root = new THREE.Group();

  constructor(
    camera: THREE.Camera,
    handModel: THREE.Object3D,
    private readonly manager: EquipmentManager,
    private readonly cfg: HandConfig,
  ) {
    this.root.add(handModel);
    this.root.position.set(...cfg.restPositionM);
    camera.add(this.root);
  }

  get busy(): boolean {
    return this.state.kind === 'picking' || this.state.kind === 'placing';
  }

  get heldInstance(): EquipmentInstance | null {
    return this.state.kind === 'holding' ? this.state.inst : null;
  }

  /** 손 기준 회전 → 내려놓을 때 플레이어 yaw 에 더해진다. */
  get heldYawOffsetRad(): number {
    return this.heldYawRad;
  }

  /** 장비를 집는다. playerYawRad: 장비가 지금 보이는 방향을 유지하도록 손 기준 회전을 정한다. */
  pick(inst: EquipmentInstance, playerYawRad: number): void {
    if (this.state.kind !== 'empty') return;
    this.manager.setHeld(inst.id, true);
    this.heldYawRad = wrapAngleRad(inst.rotationYDeg * DEG - playerYawRad);
    this.root.attach(inst.object); // 월드 자세 유지한 채 손의 자식으로
    this.state = {
      kind: 'picking',
      inst,
      tS: 0,
      fromPos: inst.object.position.clone(),
      fromQuat: inst.object.quaternion.clone(),
    };
  }

  /** 들고 있는 장비를 pose(월드)에 내려놓는다. */
  place(pose: PlacementPose): void {
    if (this.state.kind !== 'holding') return;
    const inst = this.state.inst;
    this.manager.group.attach(inst.object); // 월드 자세 유지한 채 월드 그룹으로
    this.state = {
      kind: 'placing',
      inst,
      tS: 0,
      fromPos: inst.object.position.clone(),
      fromQuat: inst.object.quaternion.clone(),
      pose,
    };
  }

  rotateHeld(steps: number): void {
    if (this.state.kind !== 'holding') return;
    this.heldYawRad = wrapAngleRad(this.heldYawRad + steps * this.cfg.rotateStepDeg * DEG);
  }

  /** 세팅을 새로 불러올 때: 손에 있던 것을 버린다(장비 객체는 매니저가 새로 만든다). */
  reset(): void {
    if (this.state.kind !== 'empty') this.state.inst.object.removeFromParent();
    this.state = { kind: 'empty' };
  }

  update(dtS: number, lookPx: { x: number; y: number }, walkedM: number): void {
    // 손 자체의 움직임: 기본 위치 + 흔들림 + 걸음
    this.sway = swayStep(this.sway, lookPx.x, lookPx.y, dtS, this.cfg);
    const [rx, ry, rz] = this.cfg.restPositionM;
    this.root.position.set(rx + this.sway.x, ry + this.sway.y + bobOffsetM(walkedM, this.cfg), rz);

    const s = this.state;
    if (s.kind === 'picking' || s.kind === 'holding') {
      const { pos, quat } = this.heldTarget(s.inst);
      const obj = s.inst.object;
      if (s.kind === 'picking') {
        s.tS += dtS;
        const k = smoothstep(s.tS / this.cfg.transitionS);
        obj.position.lerpVectors(s.fromPos, pos, k);
        obj.quaternion.slerpQuaternions(s.fromQuat, quat, k);
        if (k >= 1) this.state = { kind: 'holding', inst: s.inst };
      } else {
        const k = 1 - Math.exp(-HOLD_FOLLOW_PER_S * dtS);
        obj.position.lerp(pos, k);
        obj.quaternion.slerp(quat, k);
      }
    } else if (s.kind === 'placing') {
      s.tS += dtS;
      const k = smoothstep(s.tS / this.cfg.transitionS);
      const toPos = new THREE.Vector3(...s.pose.positionM);
      const toQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.pose.yawRad);
      const obj = s.inst.object;
      obj.position.lerpVectors(s.fromPos, toPos, k);
      obj.quaternion.slerpQuaternions(s.fromQuat, toQuat, k);
      if (k >= 1) {
        this.manager.setPose(s.inst.id, s.pose.positionM, s.pose.yawRad / DEG);
        this.manager.setHeld(s.inst.id, false);
        this.state = { kind: 'empty' };
      }
    }
  }

  /** 손 좌표계에서 들고 있는 장비의 목표 자세. */
  private heldTarget(inst: EquipmentInstance): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const p = heldLocalPosition(this.cfg.gripAnchorM, inst.def.grip.positionM, this.heldYawRad);
    return {
      pos: new THREE.Vector3(...p),
      quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heldYawRad),
    };
  }
}
