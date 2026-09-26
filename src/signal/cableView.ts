import * as THREE from 'three';
import type { WiringStyle } from '../config/types';
import type { CableRoute } from './cableRoute';

/** 꺾이는 점 하나당 튜브 마디 수. */
const SEGMENTS_PER_LEG = 2;

/**
 * 케이블 그리기: CableLayout 이 정한 경로(꺾은선)를 튜브로. 외형 값은 assets.json 의 wiring.
 */
export class CableView {
  private readonly group = new THREE.Group();
  private readonly material: THREE.MeshLambertMaterial;
  private readonly meshes = new Map<string, { mesh: THREE.Mesh; route: CableRoute }>();

  constructor(
    scene: THREE.Scene,
    private readonly routes: ReadonlyMap<string, CableRoute>,
    private readonly style: WiringStyle,
  ) {
    this.material = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.cableColor), flatShading: true });
    scene.add(this.group);
  }

  update(): void {
    for (const [key, route] of this.routes) {
      const cur = this.meshes.get(key);
      if (cur?.route === route) continue;
      const geometry = this.tube(route);
      if (cur) {
        cur.mesh.geometry.dispose();
        cur.mesh.geometry = geometry;
        cur.route = route;
      } else {
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.raycast = () => {}; // 케이블은 탭 대상 아님(포트를 탭해서 뽑는다)
        this.group.add(mesh);
        this.meshes.set(key, { mesh, route });
      }
    }
    for (const [key, m] of this.meshes) {
      if (this.routes.has(key)) continue;
      m.mesh.geometry.dispose();
      m.mesh.removeFromParent();
      this.meshes.delete(key);
    }
  }

  private tube(route: CableRoute): THREE.TubeGeometry {
    const path = new THREE.CurvePath<THREE.Vector3>();
    const pts = route.pointsM.map((p) => new THREE.Vector3(...p));
    for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
    return new THREE.TubeGeometry(path, Math.max(1, pts.length - 1) * SEGMENTS_PER_LEG, this.style.cableRadiusM, 5, false);
  }
}
