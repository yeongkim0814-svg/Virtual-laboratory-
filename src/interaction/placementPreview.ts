import * as THREE from 'three';
import type { PlacementPreviewStyle } from '../config/types';
import type { EquipmentInstance } from '../equipment/equipmentManager';
import { cellToWorld, type Cell } from '../grid/grid';
import type { PlacementPose } from '../hand/hand';

/**
 * 배치 미리보기: 놓일 자리에 반투명 장비 + 차지할 셀(놓을 수 있으면 validColor, 없으면 invalidColor).
 * 외형 값은 전부 assets.json 의 placementPreview 에서 온다.
 */
export class PlacementPreview {
  private ghost: THREE.Object3D | null = null;
  private ghostFor: string | null = null;
  private cells: THREE.InstancedMesh | null = null;
  private readonly cellMaterial: THREE.MeshBasicMaterial;
  private readonly cellGeometry: THREE.PlaneGeometry;
  private readonly validColor: THREE.Color;
  private readonly invalidColor: THREE.Color;
  private readonly tmp = new THREE.Matrix4();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly style: PlacementPreviewStyle,
    private readonly cellSizeM: number,
  ) {
    const size = cellSizeM * style.cellInsetRatio;
    this.cellGeometry = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
    this.cellMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: style.cellOpacity,
      depthWrite: false,
    });
    this.validColor = new THREE.Color(style.validColor);
    this.invalidColor = new THREE.Color(style.invalidColor);
  }

  /** 들고 있는 장비의 반투명 복제본을 준비한다(장비가 바뀔 때만 새로 만든다). */
  private ensureGhost(inst: EquipmentInstance): THREE.Object3D {
    if (this.ghost && this.ghostFor === inst.id) return this.ghost;
    this.disposeGhost();
    const g = inst.object.clone(true);
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clones = mats.map((m) => {
        const c = m.clone();
        c.transparent = true;
        c.opacity = this.style.ghostOpacity;
        c.depthWrite = false;
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? clones : clones[0];
      mesh.raycast = () => {}; // 미리보기는 탭·시선에 걸리지 않게
    });
    this.scene.add(g);
    this.ghost = g;
    this.ghostFor = inst.id;
    return g;
  }

  show(inst: EquipmentInstance, pose: PlacementPose, cells: readonly Cell[], valid: boolean): void {
    const g = this.ensureGhost(inst);
    g.visible = true;
    g.position.set(...pose.positionM);
    g.rotation.set(0, pose.yawRad, 0);

    if (!this.cells || this.cells.instanceMatrix.count < cells.length) {
      this.cells?.removeFromParent();
      this.cells = new THREE.InstancedMesh(this.cellGeometry, this.cellMaterial, cells.length);
      this.cells.raycast = () => {};
      this.scene.add(this.cells);
    }
    const y = pose.positionM[1] + this.style.cellLiftM;
    cells.forEach((c, i) => {
      const [x, z] = cellToWorld(c, this.cellSizeM);
      this.cells!.setMatrixAt(i, this.tmp.makeTranslation(x, y, z));
    });
    this.cells.count = cells.length;
    this.cells.instanceMatrix.needsUpdate = true;
    this.cellMaterial.color.copy(valid ? this.validColor : this.invalidColor);
    this.cells.visible = true;
  }

  hide(): void {
    if (this.ghost) this.ghost.visible = false;
    if (this.cells) this.cells.visible = false;
  }

  /** 들고 있지 않을 때: 복제본을 버린다. */
  clear(): void {
    this.hide();
    this.disposeGhost();
  }

  private disposeGhost(): void {
    if (!this.ghost) return;
    this.ghost.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
    });
    this.ghost.removeFromParent();
    this.ghost = null;
    this.ghostFor = null;
  }
}
