import * as THREE from 'three';
import type { WiringStyle } from '../config/types';
import type { CableRoute } from './cableRoute';
import type { PlugPose } from './cableLayout';

/** 꺾이는 점 하나당 튜브 마디 수. */
const SEGMENTS_PER_LEG = 2;

/**
 * 케이블 그리기: CableLayout 이 정한 경로(꺾은선)를 튜브로. 외형 값은 assets.json 의 wiring.
 */
export class CableView {
  private readonly group = new THREE.Group();
  private readonly material: THREE.MeshLambertMaterial;
  private readonly meshes = new Map<string, { mesh: THREE.Mesh; route: CableRoute }>();
  /** 플러그(탭 대상: userData.port = 전원선 포트). */
  readonly plugGroup = new THREE.Group();
  private readonly plugPool: THREE.Group[] = [];
  private plugHalfHeightM = 0;

  constructor(
    scene: THREE.Scene,
    private readonly routes: ReadonlyMap<string, CableRoute>,
    private readonly plugs: ReadonlyMap<string, PlugPose>,
    private readonly style: WiringStyle,
    /** assets.json "plug" 모델(원점 바닥 중앙, 길이 방향 +z). */
    private readonly makePlug: () => Promise<THREE.Object3D>,
  ) {
    this.material = new THREE.MeshLambertMaterial({ color: new THREE.Color(style.cableColor), flatShading: true });
    scene.add(this.group, this.plugGroup);
  }

  /** 플러그 모델을 필요한 만큼 미리 만든다(비동기 로드). */
  private async growPlugs(n: number): Promise<void> {
    while (this.plugPool.length < n) {
      const holder = new THREE.Group();
      this.plugPool.push(holder); // 먼저 넣어 두어 중복 생성 방지
      const model = await this.makePlug();
      const box = new THREE.Box3().setFromObject(model);
      this.plugHalfHeightM = box.isEmpty() ? 0 : (box.max.y - box.min.y) / 2;
      holder.add(model);
      holder.visible = false;
      this.plugGroup.add(holder);
    }
  }

  private updatePlugs(): void {
    const poses = [...this.plugs.values()];
    if (this.plugPool.length < poses.length) void this.growPlugs(poses.length);
    this.plugPool.forEach((h, i) => {
      const p = poses[i];
      h.visible = !!p && h.children.length > 0;
      if (!p) return;
      // 뽑힌 것: 면 위에 누움(바닥 = 경로 높이 − 케이블 반지름) / 꽂힌 것: 소켓 높이에 가운데
      const y = p.plugged ? p.pointM[1] - this.plugHalfHeightM : p.pointM[1] - this.style.cableRadiusM;
      h.position.set(p.pointM[0], y, p.pointM[2]);
      h.rotation.set(0, Math.atan2(p.dir[0], p.dir[1]), 0);
      h.userData.port = p.cordPort;
    });
  }

  update(): void {
    this.updatePlugs();
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
