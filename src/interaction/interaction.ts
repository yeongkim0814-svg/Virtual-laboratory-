import * as THREE from 'three';
import type { LabFile, Vec3 } from '../config/types';
import {
  normalizeDeg, portAddressOf, type EquipmentInstance, type EquipmentManager,
} from '../equipment/equipmentManager';
import { addressKey, type PortAddress } from '../signal/cables';
import { cellToWorld, checkCells, footprintCells, worldToCell, type Cell, type PlaceCheck } from '../grid/grid';
import type { Hand, PlacementPose } from '../hand/hand';
import { placementYawRad, withinReach } from '../hand/handMath';
import type { Vec2 } from '../input/controlMath';
import type { PlacementPreview } from './placementPreview';
import type { CableLayout } from '../signal/cableLayout';
import type { CupboardStock } from '../room/cupboards';

const DEG = Math.PI / 180;
const SCREEN_CENTER = new THREE.Vector2(0, 0);

interface Candidate {
  pose: PlacementPose;
  cells: Cell[];
  check: PlaceCheck;
}

const REASON_TEXT = {
  outside: '놓을 수 있는 면(바닥·테이블 윗면) 밖으로 나가요',
  overlap: '다른 장비와 겹쳐요',
} as const;

const CABLE_REASON_TEXT = {
  'same-device': '같은 장비의 포트끼리는 이을 수 없어요',
  channel: '채널이 달라요',
  direction: '출력과 입력을 이어야 해요',
  'port-busy': '이미 케이블이 꽂힌 포트예요',
  'unknown-port': '포트를 찾을 수 없어요',
} as const;

/**
 * 탭·시선·버튼 → 손 동작.
 * - 빈손: 닿는 거리의 장비를 탭하면 집는다
 * - 빈손: 포트를 탭 → 다른 포트를 탭하면 케이블로 잇는다. 케이블이 꽂힌 포트를 탭하면 뽑는다
 * - 빈손: 찬장을 탭 → 목록에서 고르면 새 장비를 꺼내 손에 든다
 * - 들고 있음: 화면 중앙으로 바라보는 가까운 면(바닥·테이블 윗면)에 배치 미리보기(격자 셀에 맞춤).
 *   탭하면 미리보기 자리에 놓는다. 셀이 겹치거나 면 밖이면 놓지 않는다.
 * - 들고 있음: 찬장을 탭하면 찬장에 넣는다
 */
export class Interaction {
  private readonly raycaster = new THREE.Raycaster();
  private candidate: Candidate | null = null;
  /** 케이블을 잇기 위해 먼저 고른 포트. */
  private selectedPort: PortAddress | null = null;
  /** 찬장에서 꺼낸 장비 id → 찬장 id (아직 놓기 전에 저장하면 재고로 되돌리려고). */
  private readonly origin = new Map<string, string>();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    /** 방(바닥·벽·가구) 3D 객체. 면에는 userData.placeSurface = 면 id, 찬장에는 userData.cupboardId. */
    private readonly roomGroup: THREE.Object3D,
    private readonly manager: EquipmentManager,
    private readonly hand: Hand,
    private readonly player: { yaw: number },
    private readonly cfg: LabFile,
    private readonly preview: PlacementPreview,
    private readonly notify: (msg: string) => void,
    private readonly selectedPortScale: number,
    private readonly cableLayout: CableLayout,
    private readonly cupboards: CupboardStock,
    private readonly openCupboardMenu: (cupboardId: string, onPick: (type: string) => void) => void,
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
    this.raycaster.setFromCamera(
      new THREE.Vector2((tap.x / window.innerWidth) * 2 - 1, -(tap.y / window.innerHeight) * 2 + 1),
      this.camera,
    );
    const hit = this.raycaster.intersectObjects([this.manager.group, this.roomGroup], true)[0];
    const cupboardId = hit && (findUp(hit.object, 'cupboardId') as string | undefined);
    if (cupboardId && this.cupboards.has(cupboardId)) {
      this.selectPort(null);
      if (!withinReach(this.eye(), hit.point.toArray(), this.cfg.hand.reachM)) {
        this.notify('너무 멀어요. 더 가까이 가세요');
        return;
      }
      if (held) this.store(held, cupboardId);
      else this.openCupboardMenu(cupboardId, (type) => void this.takeOut(cupboardId, type));
      return;
    }

    if (!held) {
      const inst = hit && this.manager.findByObject(hit.object);
      if (!inst) {
        this.selectPort(null);
        return;
      }
      if (!withinReach(this.eye(), hit.point.toArray(), this.cfg.hand.reachM)) {
        this.notify('너무 멀어요. 더 가까이 가세요');
        return;
      }
      const port = portAddressOf(hit.object);
      if (port) {
        this.tapPort(port);
        return;
      }
      this.selectPort(null);
      this.hand.pick(inst, this.player.yaw);
      return;
    }

    this.selectPort(null);
    const c = this.candidate;
    if (!c) {
      this.notify('놓을 곳(가까운 바닥·테이블 윗면)을 바라보세요');
      return;
    }
    if (!c.check.ok) {
      this.notify(REASON_TEXT[c.check.reason]);
      return;
    }
    this.hand.place(c.pose);
    this.preview.hide();
  }

  /** 저장용 재고: 찬장에서 꺼내 아직 놓지 않은 장비는 원래 찬장으로 센다. */
  stockForSave(): Record<string, Record<string, number>> {
    const stock = this.cupboards.toJSON();
    for (const i of this.manager.instances) {
      const c = i.surfaceId === null ? this.origin.get(i.id) : undefined;
      if (c && stock[c]) stock[c][i.type] = (stock[c][i.type] ?? 0) + 1;
    }
    return stock;
  }

  // ── 내부 ──

  /** 찬장 안쪽(가운데, 높이 절반): 꺼낼 때 여기서 나와 손으로 오고, 넣을 때 여기로 들어간다. */
  private cupboardInside(cupboardId: string): { positionM: Vec3; yawDeg: number } {
    const f = this.cfg.furniture.find((x) => x.id === cupboardId)!;
    return { positionM: [f.positionM[0], f.sizeM[1] / 2, f.positionM[2]], yawDeg: f.rotationYDeg };
  }

  private async takeOut(cupboardId: string, type: string): Promise<void> {
    if (this.hand.busy || this.hand.heldInstance) return;
    if (!this.cupboards.take(cupboardId, type)) {
      this.notify('남은 것이 없어요');
      return;
    }
    const at = this.cupboardInside(cupboardId);
    const inst = await this.manager.spawn(type, at.positionM, at.yawDeg);
    this.origin.set(inst.id, cupboardId);
    this.hand.pick(inst, this.player.yaw);
  }

  private store(held: EquipmentInstance, cupboardId: string): void {
    const at = this.cupboardInside(cupboardId);
    this.preview.hide();
    this.hand.place({ positionM: at.positionM, yawRad: at.yawDeg * DEG }, () => {
      this.manager.remove(held.id);
      this.cupboards.put(cupboardId, held.type);
      this.notify('찬장에 넣었어요');
    });
  }

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

  /** 고른 포트 표시를 키우고, 이전 것은 되돌린다. */
  private selectPort(port: PortAddress | null): void {
    const marker = (p: PortAddress | null) => (p ? this.manager.get(p.deviceId)?.portMarkers.get(p.portId) : undefined);
    marker(this.selectedPort)?.scale.setScalar(1);
    this.selectedPort = port;
    marker(port)?.scale.setScalar(this.selectedPortScale);
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
    const surfaceId = findUp(hit.object, 'placeSurface') as string | undefined;
    const surface = surfaceId !== undefined ? this.manager.grid.surfaces.get(surfaceId) : undefined;
    if (!surface || Math.abs(hit.point.y - surface.yM) > 0.01) return null; // 옆면이 아닌 윗면만
    if (!withinReach(this.eye(), hit.point.toArray(), this.cfg.hand.reachM)) return null;
    const yawRad = placementYawRad(this.player.yaw, this.hand.heldYawOffsetRad);
    return this.candidateAt(held, surface.id, hit.point.x, hit.point.z, yawRad);
  }

  /** (x, z) 에 가장 가까운 셀 중심, 각도는 1° 단위로. */
  private candidateAt(held: EquipmentInstance, surfaceId: string, x: number, z: number, yawRad: number): Candidate {
    const { cellSizeM, surfaces } = this.manager.grid;
    const cell = worldToCell(x, z, cellSizeM);
    const [cx, cz] = cellToWorld(cell, cellSizeM);
    const yawDeg = normalizeDeg(Math.round(yawRad / DEG));
    const cells = footprintCells(cell, held.footprintOffsets);
    return {
      pose: { positionM: [cx, surfaces.get(surfaceId)!.yM, cz], yawRad: yawDeg * DEG },
      cells,
      check: checkCells(cells, this.manager.occupiedCells(surfaceId, held.id), (c) => surfaces.cellAllowed(surfaceId, c)),
    };
  }
}

/** 객체 또는 조상에서 userData[key] 를 찾는다. */
function findUp(obj: THREE.Object3D | null, key: string): unknown {
  for (let o = obj; o; o = o.parent) if (o.userData[key] !== undefined) return o.userData[key];
  return undefined;
}
