import * as THREE from 'three';
import type { WiringStyle } from '../config/types';
import type { EquipmentManager } from '../equipment/equipmentManager';
import { addressKey, type Cable } from './cables';

/** 두 끝점이 이 거리 이상 움직였을 때만 케이블 모양을 다시 만든다. */
const REBUILD_EPS_M = 1e-3;

/**
 * 케이블 그리기: 두 포트 표시 사이를 가운데가 처진 곡선 튜브로.
 * 처짐은 보기용(2차 베지에, 물리 계산 아님). 외형 값은 assets.json 의 wiring.
 */
export class CableView {
  private readonly group = new THREE.Group();
  private readonly material: THREE.MeshLambertMaterial;
  private readonly meshes = new Map<string, { mesh: THREE.Mesh; a: THREE.Vector3; b: THREE.Vector3 }>();
  private readonly pa = new THREE.Vector3();
  private readonly pb = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly manager: EquipmentManager,
    private readonly style: WiringStyle,
  ) {
    this.material = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.cableColor), flatShading: true });
    scene.add(this.group);
  }

  update(): void {
    const alive = new Set<string>();
    for (const c of this.manager.cables) {
      const key = cableKey(c);
      alive.add(key);
      const a = this.manager.portWorldPosition(c.from, this.pa);
      const b = this.manager.portWorldPosition(c.to, this.pb);
      if (!a || !b) continue;
      const cur = this.meshes.get(key);
      if (cur && cur.a.distanceTo(a) < REBUILD_EPS_M && cur.b.distanceTo(b) < REBUILD_EPS_M) continue;
      const geometry = this.tube(a, b);
      if (cur) {
        cur.mesh.geometry.dispose();
        cur.mesh.geometry = geometry;
        cur.a.copy(a);
        cur.b.copy(b);
      } else {
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.raycast = () => {}; // 케이블은 탭 대상 아님(포트를 탭해서 뽑는다)
        this.group.add(mesh);
        this.meshes.set(key, { mesh, a: a.clone(), b: b.clone() });
      }
    }
    for (const [key, m] of this.meshes) {
      if (alive.has(key)) continue;
      m.mesh.geometry.dispose();
      m.mesh.removeFromParent();
      this.meshes.delete(key);
    }
  }

  private tube(a: THREE.Vector3, b: THREE.Vector3): THREE.TubeGeometry {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y -= a.distanceTo(b) * this.style.cableSagRatio;
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    return new THREE.TubeGeometry(curve, this.style.cableSegments, this.style.cableRadiusM, 5, false);
  }
}

const cableKey = (c: Cable): string => `${addressKey(c.from)}→${addressKey(c.to)}`;
