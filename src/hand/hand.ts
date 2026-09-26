import * as THREE from 'three';
import type { HandConfig, Vec3 } from '../config/types';
import type { EquipmentInstance, EquipmentManager } from '../equipment/equipmentManager';
import {
  assignHands, bobOffsetM, heldLocalPosition, smoothstep, swayStep, swingPose, wrapAngleRad, type SwayState,
} from './handMath';

const DEG = Math.PI / 180;

/** 장비를 놓을 월드 자세(원점 = 장비 바닥 중앙). */
export interface PlacementPose {
  positionM: Vec3;
  yawRad: number;
}
/** 들고 있는 동안 목표 자세를 따라가는 빠르기(1/s). */
const HOLD_FOLLOW_PER_S = 20;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** 장비가 한쪽 자세에서 다른 쪽으로 옮겨지는 중(transitionS 동안). */
interface Move {
  tS: number;
  fromPos: THREE.Vector3;
  fromQuat: THREE.Quaternion;
}

type HandState =
  | { kind: 'empty' }
  | { kind: 'picking'; inst: EquipmentInstance; swingS: number; grab: Move | null }
  | { kind: 'holding'; inst: EquipmentInstance }
  | { kind: 'placing'; inst: EquipmentInstance; swingS: number; pose: PlacementPose; release: Move | null }
  | { kind: 'dropping'; inst: EquipmentInstance; move: Move; pose: PlacementPose };

/**
 * 1인칭 손(카메라에 붙은 뷰모델). 장비를 집고, 들고, 놓고, 떨어뜨린다.
 *
 * 구조: camera → rig(흔들림·걸음) → swingGroup(휘두르기) → 오른손·왼손·들고 있는 장비
 * - 한 손 장비: grip 점이 오른손 손바닥(rightRestM)에. 왼손은 화면 밖.
 * - 두 손 장비: grip 점들의 가운데가 twoHandAnchorM 에, 두 손은 각 grip 점으로.
 * - 집기·놓기: Minecraft 식 휘두르기, 스윙 중 grabAtPhase 에 장비를 잡거나 놓는다.
 * - 떨어뜨리기: 휘두르기 없이 그 자리에서 손을 뗀다.
 *
 * 찬장 등에서 새 장비를 꺼내는 기능은 EquipmentManager 에 장비를 만든 뒤 pick() 을 부르면 된다.
 */
export class Hand {
  private state: HandState = { kind: 'empty' };
  private heldYawRad = 0;
  private sway: SwayState = { x: 0, y: 0 };
  private readonly rig = new THREE.Group();
  private readonly swingGroup = new THREE.Group();

  constructor(
    camera: THREE.Camera,
    private readonly right: THREE.Object3D,
    private readonly left: THREE.Object3D,
    private readonly manager: EquipmentManager,
    private readonly cfg: HandConfig,
  ) {
    this.swingGroup.matrixAutoUpdate = false;
    this.swingGroup.add(right, left);
    this.rig.add(this.swingGroup);
    camera.add(this.rig);
    right.position.copy(this.handPosFor(cfg.rightRestM, false));
    left.position.copy(this.handPosFor(cfg.leftRestM, true));
  }

  get busy(): boolean {
    return this.state.kind !== 'empty' && this.state.kind !== 'holding';
  }

  get heldInstance(): EquipmentInstance | null {
    return this.state.kind === 'holding' ? this.state.inst : null;
  }

  /**
   * 손 기준 회전(집을 때 정해지고, 들고 있는 동안은 바꿀 수 없다).
   * 놓을 때 플레이어 yaw 에 더해진다. 각도 조정은 놓은 뒤 패널 슬라이더로.
   */
  get heldYawOffsetRad(): number {
    return this.heldYawRad;
  }

  /** 장비를 집는다. 장비가 지금 보이는 방향을 유지하도록 손 기준 회전을 정한다. */
  pick(inst: EquipmentInstance, playerYawRad: number): void {
    if (this.state.kind !== 'empty') return;
    this.heldYawRad = wrapAngleRad(inst.rotationYDeg * DEG - playerYawRad);
    this.state = { kind: 'picking', inst, swingS: 0, grab: null };
  }

  /** 들고 있는 장비를 pose(월드)에 놓는다(휘두르기 동작 포함). */
  place(pose: PlacementPose): void {
    if (this.state.kind !== 'holding') return;
    this.state = { kind: 'placing', inst: this.state.inst, swingS: 0, pose, release: null };
  }

  /** 들고 있는 장비에서 손을 뗀다. pose = 떨어져 닿을 자리(월드). */
  drop(pose: PlacementPose): void {
    if (this.state.kind !== 'holding') return;
    const inst = this.state.inst;
    this.state = { kind: 'dropping', inst, move: this.detach(inst), pose };
  }

  /** 세팅을 새로 불러올 때: 손에 있던 것을 버린다(장비 객체는 매니저가 새로 만든다). */
  reset(): void {
    if (this.state.kind !== 'empty') this.state.inst.object.removeFromParent();
    this.state = { kind: 'empty' };
  }

  update(dtS: number, lookPx: { x: number; y: number }, walkedM: number): void {
    const cfg = this.cfg;
    this.sway = swayStep(this.sway, lookPx.x, lookPx.y, dtS, cfg);
    this.rig.position.set(this.sway.x, this.sway.y + bobOffsetM(walkedM, cfg), 0);

    const s = this.state;
    // ── 장비 이동 ──
    if (s.kind === 'picking') {
      s.swingS += dtS;
      if (!s.grab && this.swingPhase(s.swingS) >= cfg.swing.grabAtPhase) {
        this.manager.setHeld(s.inst.id, true);
        this.updateSwingMatrix(); // attach 가 현재 스윙 자세를 기준으로 하도록
        this.swingGroup.attach(s.inst.object);
        s.grab = this.moveFrom(s.inst.object);
      }
      if (s.grab) {
        const done = this.stepMove(s.grab, s.inst.object, this.heldTarget(s.inst), dtS);
        if (done && this.swingPhase(s.swingS) >= 1) this.state = { kind: 'holding', inst: s.inst };
      }
    } else if (s.kind === 'holding') {
      const t = this.heldTarget(s.inst);
      const k = 1 - Math.exp(-HOLD_FOLLOW_PER_S * dtS);
      s.inst.object.position.lerp(t.pos, k);
      s.inst.object.quaternion.slerp(t.quat, k);
    } else if (s.kind === 'placing') {
      s.swingS += dtS;
      if (!s.release && this.swingPhase(s.swingS) >= cfg.swing.grabAtPhase) s.release = this.detach(s.inst);
      if (s.release) {
        const done = this.stepMove(s.release, s.inst.object, this.worldTarget(s.pose), dtS);
        if (done && this.swingPhase(s.swingS) >= 1) this.finishPlace(s.inst, s.pose);
      }
    } else if (s.kind === 'dropping') {
      // TODO(물리 승인 대기): 자유낙하 y(t) = y0 − ½gt² 로 교체. 지금은 비물리적 보간.
      if (this.stepMove(s.move, s.inst.object, this.worldTarget(s.pose), dtS)) this.finishPlace(s.inst, s.pose);
    }

    // ── 휘두르기 ──
    this.updateSwingMatrix();

    // ── 손 위치: 장비를 쥐고 있으면 grip 점으로, 아니면 기본 자리로 ──
    const inHand =
      (s.kind === 'picking' && s.grab) || s.kind === 'holding' || (s.kind === 'placing' && !s.release)
        ? s.inst
        : null;
    let rightPalm = cfg.rightRestM;
    let leftPalm = cfg.leftRestM;
    if (inHand) {
      inHand.object.updateMatrix();
      const pts = inHand.def.hold.grips.map((g) => new THREE.Vector3(...g).applyMatrix4(inHand.object.matrix).toArray() as Vec3);
      const a = assignHands(pts);
      rightPalm = a.right;
      if (a.left) leftPalm = a.left;
    }
    const kHand = 1 - Math.exp(-cfg.handFollowPerS * dtS);
    this.right.position.lerp(this.handPosFor(rightPalm, false), kHand);
    this.left.position.lerp(this.handPosFor(leftPalm, true), kHand);
  }

  // ── 내부 ──

  private swingPhase(swingS: number): number {
    return swingS / this.cfg.swing.durationS;
  }

  /** 지금 스윙의 회전 중심: 두 손 장비면 두 손 가운데, 아니면 오른손. */
  private pivot(): Vec3 {
    const s = this.state;
    const twoHands = s.kind !== 'empty' && s.inst.def.hold.hands === 2;
    return twoHands ? this.cfg.twoHandAnchorM : this.cfg.rightRestM;
  }

  /** swingGroup 행렬 = T(pivot + 이동)·R(회전)·T(−pivot). 스윙 중이 아니면 단위 행렬. */
  private updateSwingMatrix(): void {
    const s = this.state;
    const swingS = s.kind === 'picking' || s.kind === 'placing' ? s.swingS : null;
    if (swingS === null || this.swingPhase(swingS) >= 1) {
      this.swingGroup.matrix.identity();
    } else {
      const pose = swingPose(this.swingPhase(swingS), this.cfg.swing);
      const pv = new THREE.Vector3(...this.pivot());
      const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...pose.rotRad, 'YXZ'));
      this.swingGroup.matrix
        .makeTranslation(pv.x + pose.posM[0], pv.y + pose.posM[1], pv.z + pose.posM[2])
        .multiply(rot)
        .multiply(new THREE.Matrix4().makeTranslation(-pv.x, -pv.y, -pv.z));
    }
    this.swingGroup.matrixWorldNeedsUpdate = true;
  }

  /** 손바닥이 palm 에 오도록 하는 손 모델 위치. 왼손은 palmOffset 의 x 를 반전. */
  private handPosFor(palm: Vec3, isLeft: boolean): THREE.Vector3 {
    const o = this.cfg.palmOffsetM;
    return new THREE.Vector3(palm[0] - (isLeft ? -o[0] : o[0]), palm[1] - o[1], palm[2] - o[2]);
  }

  private heldTarget(inst: EquipmentInstance): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const anchor = inst.def.hold.hands === 2 ? this.cfg.twoHandAnchorM : this.cfg.rightRestM;
    return {
      pos: new THREE.Vector3(...heldLocalPosition(anchor, inst.def.hold.grips, this.heldYawRad)),
      quat: new THREE.Quaternion().setFromAxisAngle(Y_AXIS, this.heldYawRad),
    };
  }

  private worldTarget(pose: PlacementPose): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    return {
      pos: new THREE.Vector3(...pose.positionM),
      quat: new THREE.Quaternion().setFromAxisAngle(Y_AXIS, pose.yawRad),
    };
  }

  /** 월드 자세를 유지한 채 월드 그룹으로 옮기고, 거기서부터의 이동을 시작한다. */
  private detach(inst: EquipmentInstance): Move {
    this.manager.group.attach(inst.object);
    return this.moveFrom(inst.object);
  }

  private moveFrom(obj: THREE.Object3D): Move {
    return { tS: 0, fromPos: obj.position.clone(), fromQuat: obj.quaternion.clone() };
  }

  /** 이동 한 걸음. 끝났으면 true. */
  private stepMove(m: Move, obj: THREE.Object3D, to: { pos: THREE.Vector3; quat: THREE.Quaternion }, dtS: number): boolean {
    m.tS += dtS;
    const k = smoothstep(m.tS / this.cfg.transitionS);
    obj.position.lerpVectors(m.fromPos, to.pos, k);
    obj.quaternion.slerpQuaternions(m.fromQuat, to.quat, k);
    return k >= 1;
  }

  private finishPlace(inst: EquipmentInstance, pose: PlacementPose): void {
    this.manager.setPose(inst.id, pose.positionM, pose.yawRad / DEG);
    this.manager.setHeld(inst.id, false);
    this.state = { kind: 'empty' };
  }
}
