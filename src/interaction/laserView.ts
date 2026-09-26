import * as THREE from 'three';
import type { AssetsFile } from '../config/types';
import { wavelengthToRgb } from '../physics/optics';
import type { Beam } from '../signal/lightRouter';

/**
 * 레이저 빛 그리기: 출구 → 닿은 곳까지 가는 선(원기둥) + 닿은 곳의 빛 점.
 * 색은 파장에서(R4), 굵기·투명도는 assets.json 의 laserBeam. 빛과 빛 점만 스스로 빛나게(조명 무시) 그린다.
 * 참고: 실제 레이저 빛줄기는 깨끗한 공기에서 거의 보이지 않는다(먼지·연기에 산란될 때만 보임) →
 * showBeam = false 로 끄면 빛 점만 보인다.
 */
export class LaserView {
  private readonly group = new THREE.Group();
  private readonly beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
  private readonly spotGeo = new THREE.SphereGeometry(1, 12, 8);
  private readonly pool: { beam: THREE.Mesh; spot: THREE.Mesh }[] = [];
  private readonly up = new THREE.Vector3(0, 0, 1);

  constructor(
    scene: THREE.Scene,
    private readonly style: AssetsFile['laserBeam'],
  ) {
    scene.add(this.group);
  }

  update(beams: readonly Beam[]): void {
    while (this.pool.length < beams.length) this.pool.push(this.make());
    this.pool.forEach((p, i) => {
      const b = beams[i];
      p.beam.visible = !!b && this.style.showBeam;
      // 슬릿을 지난 빛이 스크린에 닿으면 빛 점 대신 간섭 무늬(ScreenOverlay)가 보인다
      p.spot.visible = !!b && !(b.values.slitSpacingM !== undefined && b.target);
      if (!b) return;
      const color = new THREE.Color(...wavelengthToRgb(b.wavelengthM));
      (p.beam.material as THREE.MeshBasicMaterial).color.copy(color);
      (p.spot.material as THREE.MeshBasicMaterial).color.copy(color);
      const from = new THREE.Vector3(...b.originM);
      const to = new THREE.Vector3(...b.trace.pointM);
      const dir = to.clone().sub(from);
      const len = dir.length();
      p.beam.position.copy(from);
      p.beam.quaternion.setFromUnitVectors(this.up, dir.normalize());
      p.beam.scale.set(this.style.beamRadiusM, this.style.beamRadiusM, len);
      p.spot.position.copy(to);
      p.spot.scale.setScalar(this.style.spotRadiusM);
    });
  }

  private make(): { beam: THREE.Mesh; spot: THREE.Mesh } {
    const beam = new THREE.Mesh(
      this.beamGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: this.style.beamOpacity, depthWrite: false }),
    );
    const spot = new THREE.Mesh(this.spotGeo, new THREE.MeshBasicMaterial());
    beam.raycast = () => {};
    spot.raycast = () => {};
    this.group.add(beam, spot);
    return { beam, spot };
  }
}
