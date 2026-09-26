import * as THREE from 'three';
import type { AssetsFile } from '../config/types';
import type { EquipmentInstance } from '../equipment/equipmentManager';

/** 회전 중인 장비 둘레의 고리(밑넓이 원). 외형 값은 assets.json 의 rotateGizmo. */
export class RotateGizmo {
  private ring: THREE.Mesh | null = null;
  private readonly material: THREE.MeshBasicMaterial;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly style: AssetsFile['rotateGizmo'],
  ) {
    this.material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(style.color), transparent: true, opacity: style.opacity, depthWrite: false,
    });
  }

  show(inst: EquipmentInstance): void {
    this.hide();
    const g = new THREE.TorusGeometry(inst.footprintRadiusM, this.style.tubeRadiusM, 6, 48).rotateX(Math.PI / 2);
    this.ring = new THREE.Mesh(g, this.material);
    this.ring.raycast = () => {};
    const [x, y, z] = inst.positionM;
    this.ring.position.set(x, y + this.style.liftM, z);
    this.scene.add(this.ring);
  }

  hide(): void {
    if (!this.ring) return;
    this.ring.geometry.dispose();
    this.ring.removeFromParent();
    this.ring = null;
  }
}
