import * as THREE from 'three';
import type { LabFile, Vec3 } from '../config/types';
import {
  normalizeDeg, portAddressOf, type EquipmentInstance, type EquipmentManager,
} from '../equipment/equipmentManager';
import { addressKey, type PortAddress } from '../signal/cables';
import {
  cellToWorld, checkCells, footprintCells, nearestAllowedCenter, worldToCell, type Cell, type PlaceCheck,
} from '../grid/grid';
import type { Hand, PlacementPose } from '../hand/hand';
import { placementYawRad, withinReach } from '../hand/handMath';
import { snapAngleDeg, type Vec2 } from '../input/controlMath';
import type { PlacementPreview } from './placementPreview';
import type { RotateGizmo } from './rotateGizmo';
import type { CableLayout } from '../signal/cableLayout';

const DEG = Math.PI / 180;
const SCREEN_CENTER = new THREE.Vector2(0, 0);

type Check = PlaceCheck | { ok: false; reason: 'too-tall' };

interface Candidate {
  pose: PlacementPose;
  cells: Cell[];
  check: Check;
}

const REASON_TEXT = {
  outside: '놓을 수 있는 면(바닥·테이블·선반) 밖으로 나가요',
  overlap: '다른 장비와 겹쳐요',
  'too-tall': '선반 사이에 들어가지 않아요',
} as const;

const CABLE_REASON_TEXT = {
  'same-device': '같은 장비의 포트끼리는 이을 수 없어요',
  channel: '채널이 달라요',
  direction: '출력과 입력을 이어야 해요',
  'port-busy': '이미 케이블이 꽂힌 포트예요',
  'unknown-port': '포트를 찾을 수 없어요',
  light: '빛은 케이블 없이 전달돼요',
  'plug-kind': '플러그와 콘센트 종류가 달라요',
  'needs-socket': '전원선은 콘센트(전원 단자)에 꽂아요',
  'needs-plug': '콘센트에는 전원선을 꽂아요',
} as const;

/**
 * 탭·시선·버튼 → 손 동작.
 * - 빈손: 닿는 거리의 장비를 탭하면 집는다
 * - 빈손: 포트를 탭 → 다른 포트를 탭하면 케이블로 잇는다. 케이블이 꽂힌 포트를 탭하면 뽑는다
 * - 들고 있음: 화면 중앙으로 바라보는 가까운 면(바닥·테이블 윗면·찬장 선반)에 배치 미리보기(격자 셀에 맞춤).
 *   탭하면 미리보기 자리에 놓는다. 셀이 겹치거나 면 밖이거나 선반 사이보다 크면 놓지 않는다.
 *   (찬장은 문 없는 보관함: 선반에 놓고, 선반에서 집어 쓴다)
 * - 빈손: 놓인 장비를 길게 누른 채 좌우로 밀면 그 자리에서 회전(15° 배수 근처는 붙음), 손을 떼면 끝
 */
export class Interaction {
  private readonly raycaster = new THREE.Raycaster();
  private candidate: Candidate | null = null;
  /** 케이블을 잇기 위해 먼저 고른 포트. */
  private selectedPort: PortAddress | null = null;
  /** 회전 중인 장비와 붙이기 전 누적 각도. */
  private rotating: { inst: EquipmentInstance; rawDeg: number } | null = null;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    /** 방(바닥·벽·가구) 3D 객체. 시선이 닿는 곳의 높이·위치로 면(바닥·테이블·선반)을 정한다. */
    private readonly roomGroup: THREE.Object3D,
    private readonly manager: EquipmentManager,
    private readonly hand: Hand,
    private readonly player: { yaw: number },
    private readonly cfg: LabFile,
    private readonly preview: PlacementPreview,
    private readonly notify: (msg: string) => void,
    private readonly selectedPortScale: number,
    private readonly cableLayout: CableLayout,
    private readonly gizmo: RotateGizmo,
    /** 전원선 플러그(탭하면 꽂기·뽑기 대상). */
    private readonly plugGroup: THREE.Object3D,
  ) {}

  get isRotating(): boolean {
    return this.rotating !== null;
  }

  /** 길게 누르기: 닿는 거리의 놓인 장비(포트 제외)면 회전 시작. 시작했으면 true(그 손가락을 가져간다). */
  startRotate(pos: Vec2): boolean {
    if (this.hand.busy || this.hand.heldInstance) return false;
    this.raycaster.setFromCamera(this.ndc(pos), this.camera);
    const hit = this.raycaster.intersectObjects([this.manager.group, this.roomGroup], true)[0];
    const inst = hit && this.manager.findByObject(hit.object);
    if (!inst || portAddressOf(hit.object) || inst.held || inst.def.fixed) return false;
    if (!withinReach(this.eye(), hit.point.toArray(), this.cfg.hand.reachM)) {
      this.notify('너무 멀어요. 더 가까이 가세요');
      return false;
    }
    this.selectPort(null);
    this.rotating = { inst, rawDeg: inst.rotationYDeg };
    this.gizmo.show(inst);
    this.notify(`각도 ${inst.rotationYDeg}°`);
    return true;
  }

  /** 가로 드래그(px)만큼 회전. 오른쪽으로 밀면 위에서 보아 시계 방향(= yaw 감소). */
  rotateBy(dxPx: number): void {
    const r = this.rotating;
    if (!r || dxPx === 0) return;
    const c = this.cfg.controls;
    r.rawDeg -= dxPx * c.rotateDegPerPx;
    const deg = snapAngleDeg(r.rawDeg, c.rotateSnapStepDeg, c.rotateSnapWindowDeg);
    if (deg !== r.inst.rotationYDeg) {
      this.manager.setRotation(r.inst.id, deg);
      this.notify(`각도 ${deg}°`);
    }
  }

  endRotate(): void {
    if (!this.rotating) return;
    this.rotating = null;
    this.gizmo.hide();
  }

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
    this.raycaster.setFromCamera(this.ndc(tap), this.camera);
    // 장비 앞을 가로막는 방 객체(찬장 옆판·선반 등)가 있으면 그 뒤 장비는 집을 수 없다
    const hit = this.raycaster.intersectObjects([this.manager.group, this.plugGroup, this.roomGroup], true)[0];

    if (!held) {
      // 포트 표시 또는 전원선 플러그 → 꽂기·뽑기, 장비 몸체 → 집기
      const port = hit && portAddressOf(hit.object);
      const inst = hit && this.manager.findByObject(hit.object);
      if (!port && !inst) {
        this.selectPort(null);
        return;
      }
      if (!withinReach(this.eye(), hit.point.toArray(), this.cfg.hand.reachM)) {
        this.notify('너무 멀어요. 더 가까이 가세요');
        return;
      }
      if (port) {
        this.tapPort(port);
        return;
      }
      if (!inst) return;
      this.selectPort(null);
      if (inst.def.fixed) {
        this.notify('고정된 장비예요');
        return;
      }
      this.hand.pick(inst, this.player.yaw);
      return;
    }

    this.selectPort(null);
    const c = this.candidate;
    if (!c) {
      this.notify('놓을 곳(가까운 바닥·테이블·선반)을 바라보세요');
      return;
    }
    if (!c.check.ok) {
      this.notify(REASON_TEXT[c.check.reason]);
      return;
    }
    this.hand.place(c.pose);
    this.preview.hide();
  }

  // ── 내부 ──


  /** 포트 탭: 고르기 → 다른 포트면 잇기. 고른 게 없는데 꽂힌 포트면 뽑기. */
  private tapPort(port: PortAddress): void {
    const sel = this.selectedPort;
    if (!sel) {
      const removed = this.manager.disconnect(port);
      if (removed) {
        this.notify('케이블을 뽑았어요');
        return;
      }
      this.selectPort(port);
      this.notify('이을 포트를 탭하세요');
      return;
    }
    this.selectPort(null);
    if (addressKey(sel) === addressKey(port)) return; // 같은 포트를 다시 탭 → 취소
    const r = this.manager.connect(sel, port);
    if (!r.ok) {
      this.notify(CABLE_REASON_TEXT[r.reason]);
      return;
    }
    if (!this.cableLayout.canRoute(r.cable.from, r.cable.to)) {
      this.manager.disconnect(r.cable.from);
      this.notify(`케이블이 닿지 않아요 (최대 ${this.cableLayout.maxLengthM} m, 장비를 피해 가는 길이)`);
      return;
    }
    this.notify('케이블을 이었어요');
  }

  /** 고른 포트에만 표시를 (키워서) 보이고, 이전 것은 숨긴다. 평소 포트 표시는 숨김. */
  private selectPort(port: PortAddress | null): void {
    const holder = (p: PortAddress | null) => (p ? this.manager.get(p.deviceId)?.portMarkers.get(p.portId) : undefined);
    const show = (h: THREE.Object3D | undefined, on: boolean): void => {
      if (!h) return;
      h.scale.setScalar(on ? this.selectedPortScale : 1);
      if (h.userData.marker) (h.userData.marker as THREE.Object3D).visible = on;
    };
    show(holder(this.selectedPort), false);
    this.selectedPort = port;
    show(holder(port), true);
  }

  private ndc(p: Vec2): THREE.Vector2 {
    return new THREE.Vector2((p.x / window.innerWidth) * 2 - 1, -(p.y / window.innerHeight) * 2 + 1);
  }

  private eye(): Vec3 {
    return this.camera.getWorldPosition(new THREE.Vector3()).toArray() as Vec3;
  }

  /**
   * 화면 중앙 시선이 처음 닿는 방 객체가 놓을 수 있는 면의 윗면이면 → 배치 후보. 멀거나 아니면 null.
   * 장비는 시선에서 제외 → 장비 쪽을 봐도 그 아래 면을 기준으로 겹침이 빨간 미리보기로 보인다.
   */
  private gazeCandidate(held: EquipmentInstance): Candidate | null {
    this.raycaster.setFromCamera(SCREEN_CENTER, this.camera);
    const hit = this.raycaster.intersectObject(this.roomGroup, true)[0];
    if (!hit) return null;
    // 닿은 점의 높이·위치가 어떤 면의 윗면이면 그 면(옆면·벽 등은 아님)
    const surfaceId = this.manager.grid.surfaces.surfaceAt(hit.point.x, hit.point.y, hit.point.z);
    if (surfaceId === undefined) return null;
    if (!withinReach(this.eye(), hit.point.toArray(), this.cfg.hand.reachM)) return null;
    const yawRad = placementYawRad(this.player.yaw, this.hand.heldYawOffsetRad);
    return this.candidateAt(held, surfaceId, hit.point.x, hit.point.z, yawRad);
  }

  /**
   * (x, z) 에 가장 가까운 셀 중심(밑넓이가 면 밖으로 나가면 가까운 안쪽 셀로 끌어당김), 각도는 1° 단위로.
   */
  private candidateAt(held: EquipmentInstance, surfaceId: string, x: number, z: number, yawRad: number): Candidate {
    const { cellSizeM, surfaces } = this.manager.grid;
    const aimed = worldToCell(x, z, cellSizeM);
    const maxShift = Math.ceil(held.footprintRadiusM / cellSizeM) + 1;
    const cell = nearestAllowedCenter(aimed, held.footprintOffsets, (c) => surfaces.cellAllowed(surfaceId, c), maxShift) ?? aimed;
    const [cx, cz] = cellToWorld(cell, cellSizeM);
    const yawDeg = normalizeDeg(Math.round(yawRad / DEG));
    const cells = footprintCells(cell, held.footprintOffsets);
    const surface = surfaces.get(surfaceId)!;
    const check: Check =
      held.heightM > surface.clearHeightM
        ? { ok: false, reason: 'too-tall' }
        : checkCells(cells, this.manager.occupiedCells(surfaceId, held.id), (c) => surfaces.cellAllowed(surfaceId, c));
    return { pose: { positionM: [cx, surface.yM, cz], yawRad: yawDeg * DEG }, cells, check };
  }
}

