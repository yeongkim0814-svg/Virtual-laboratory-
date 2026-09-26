import * as THREE from 'three';
import type { LabFile, Vec3 } from '../config/types';
import { normalizeDeg, type EquipmentInstance, type EquipmentManager } from '../equipment/equipmentManager';
import { cellToWorld, checkCells, footprintCells, worldToCell, type Cell, type PlaceCheck } from '../grid/grid';
import type { Hand, PlacementPose } from '../hand/hand';
import { placementYawRad, withinReach } from '../hand/handMath';
import type { Vec2 } from '../input/controlMath';
import type { PlacementPreview } from './placementPreview';

const DOWN = new THREE.Vector3(0, -1, 0);
const DEG = Math.PI / 180;
const SCREEN_CENTER = new THREE.Vector2(0, 0);

interface Candidate {
  pose: PlacementPose;
  cells: Cell[];
  check: PlaceCheck;
}

const REASON_TEXT = {
  outside: '방 밖으로 나가요',
  overlap: '다른 장비와 겹쳐요',
} as const;

/**
 * 탭·시선·버튼 → 손 동작.
 * - 빈손: 닿는 거리의 장비를 탭하면 집는다
 * - 들고 있음: 화면 중앙으로 바라보는 가까운 바닥에 배치 미리보기(격자 셀에 맞춤).
 *   탭하면 미리보기 자리에 놓는다. 셀이 겹치거나 방 밖이면 놓지 않는다.
 * - 놓기 버튼: 들고 있는 자리 바로 아래 셀로 떨어뜨린다(같은 격자 규칙).
 */
export class Interaction {
  private readonly raycaster = new THREE.Raycaster();
  private candidate: Candidate | null = null;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly surfaces: THREE.Object3D,
    private readonly manager: EquipmentManager,
    private readonly hand: Hand,
    private readonly player: { yaw: number },
    private readonly cfg: LabFile,
    private readonly preview: PlacementPreview,
    private readonly notify: (msg: string) => void,
  ) {}

  /** 매 프레임: 들고 있으면 시선이 닿는 바닥에 배치 미리보기. */
  update(): void {
    const held = this.hand.heldInstance;
    if (!held) {
      this.candidate = null;
      if (!this.hand.busy) this.preview.clear();
      else this.preview.hide();
      return;
    }
    this.candidate = this.gazeCandidate(held);
    if (this.candidate) {
      this.preview.show(held, this.candidate.pose, this.candidate.cells, this.candidate.check.ok);
    } else {
      this.preview.hide();
    }
  }

  handleTap(tap: Vec2): void {
    if (this.hand.busy) return;
    const held = this.hand.heldInstance;

    if (!held) {
      this.raycaster.setFromCamera(
        new THREE.Vector2((tap.x / window.innerWidth) * 2 - 1, -(tap.y / window.innerHeight) * 2 + 1),
        this.camera,
      );
      const hit = this.raycaster.intersectObject(this.manager.group, true)[0];
      const inst = hit && this.manager.findByObject(hit.object);
      if (!inst) return;
      if (!withinReach(this.eye(), hit.point.toArray(), this.cfg.hand.reachM)) {
        this.notify('너무 멀어요. 더 가까이 가세요');
        return;
      }
      this.hand.pick(inst, this.player.yaw);
      return;
    }

    const c = this.candidate;
    if (!c) {
      this.notify('놓을 곳(가까운 바닥)을 바라보세요');
      return;
    }
    if (!c.check.ok) {
      this.notify(REASON_TEXT[c.check.reason]);
      return;
    }
    this.hand.place(c.pose);
    this.preview.hide();
  }

  /** 놓기 버튼: 들고 있는 장비를 그 자리 바로 아래 셀로 떨어뜨린다. */
  drop(): void {
    const held = this.hand.heldInstance;
    if (!held || this.hand.busy) return;
    const pos = held.object.getWorldPosition(new THREE.Vector3());
    const yawRad = new THREE.Euler().setFromQuaternion(held.object.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;

    this.raycaster.set(pos.clone().add(new THREE.Vector3(0, 0.01, 0)), DOWN);
    const below = this.raycaster.intersectObject(this.surfaces, true).find((h) => h.object.userData.placeSurface);
    if (!below) {
      this.notify('아래에 놓을 곳이 없어요');
      return;
    }
    const c = this.candidateAt(held, pos.x, below.point.y, pos.z, yawRad);
    if (!c.check.ok) {
      this.notify(REASON_TEXT[c.check.reason]);
      return;
    }
    this.hand.drop(c.pose);
    this.preview.hide();
  }

  // ── 내부 ──

  private eye(): Vec3 {
    return this.camera.getWorldPosition(new THREE.Vector3()).toArray() as Vec3;
  }

  /**
   * 화면 중앙 시선이 닿는 가까운 바닥 → 배치 후보. 멀면 null.
   * 시선이 다른 장비에 걸려도 그 뒤(아래) 바닥을 기준으로 한다 → 겹침이 빨간 미리보기로 보인다.
   */
  private gazeCandidate(held: EquipmentInstance): Candidate | null {
    this.raycaster.setFromCamera(SCREEN_CENTER, this.camera);
    const hit = this.raycaster.intersectObject(this.surfaces, true).find((h) => h.object.userData.placeSurface);
    if (!hit) return null;
    if (!withinReach(this.eye(), hit.point.toArray(), this.cfg.hand.reachM)) return null;
    const yawRad = placementYawRad(this.player.yaw, this.hand.heldYawOffsetRad);
    return this.candidateAt(held, hit.point.x, hit.point.y, hit.point.z, yawRad);
  }

  /** (x, z) 에 가장 가까운 셀 중심, 각도는 1° 단위로. */
  private candidateAt(held: EquipmentInstance, x: number, y: number, z: number, yawRad: number): Candidate {
    const { cellSizeM } = this.manager.grid;
    const cell = worldToCell(x, z, cellSizeM);
    const [cx, cz] = cellToWorld(cell, cellSizeM);
    const yawDeg = normalizeDeg(Math.round(yawRad / DEG));
    const cells = footprintCells(cell, held.footprintOffsets);
    return {
      pose: { positionM: [cx, y, cz], yawRad: yawDeg * DEG },
      cells,
      check: checkCells(cells, this.manager.occupiedCells(held.id), cellSizeM, this.cfg.room),
    };
  }
}
