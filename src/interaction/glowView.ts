import * as THREE from 'three';
import type { EquipmentManager } from '../equipment/equipmentManager';
import { wavelengthToRgb } from '../physics/optics';

/**
 * 스스로 빛나는 부분(정의의 glow, 예: LED 머리) 그리기.
 * 모양 = assets.json "<asset>-glow"(없으면 placeholder), 색 = 파장 색(R4), 밝기 = 빛 출력 / fullPowerW.
 * 재질의 emissive 만 바꾼다(꺼져 있으면 에셋 본래 색). 장비 객체의 자식이라 함께 움직인다.
 */
export class GlowView {
  private readonly glows = new Map<string, { object: THREE.Object3D; materials: THREE.Material[]; baseColors: THREE.Color[] }>();
  private readonly loading = new Set<string>();

  constructor(
    private readonly manager: EquipmentManager,
    private readonly assets: { create(name: string): Promise<THREE.Object3D> },
  ) {}

  update(): void {
    const alive = new Set<string>();
    for (const inst of this.manager.instances) {
      const g = inst.def.glow;
      if (!g) continue;
      alive.add(inst.id);
      const cur = this.glows.get(inst.id);
      if (!cur || cur.object.parent !== inst.object) {
        this.attach(inst.id, inst.object, `${inst.def.asset}-glow`, g.positionM);
        continue;
      }
      const power = inst.readouts[g.powerReadout] ?? 0;
      // 보기용 밝기: 눈은 밝기를 로그에 가깝게 느끼므로 √(비율) — 약하게 켜져도 켜진 게 보이게
      const k = Math.sqrt(Math.min(1, Math.max(0, power / g.fullPowerW)));
      const [r, gr, b] = wavelengthToRgb(inst.params[g.wavelengthParam]);
      cur.materials.forEach((m, i) => {
        const mat = m as THREE.MeshLambertMaterial;
        if (!mat.emissive || !mat.color) return;
        mat.emissive.setRGB(r * k, gr * k, b * k);
        mat.color.copy(cur.baseColors[i]).multiplyScalar(1 - k); // 켜질수록 본래 색은 빠지고 빛 색이 보임
      });
    }
    for (const [id, gl] of this.glows) {
      if (alive.has(id)) continue;
      gl.object.removeFromParent();
      this.glows.delete(id);
    }
  }

  private attach(id: string, parent: THREE.Object3D, assetName: string, positionM: [number, number, number]): void {
    if (this.loading.has(id)) return;
    this.loading.add(id);
    void this.assets.create(assetName).then((object) => {
      this.loading.delete(id);
      this.glows.get(id)?.object.removeFromParent();
      const materials: THREE.Material[] = [];
      object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.raycast = () => {}; // 탭은 장비 몸체로
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone(); // 장비마다 따로 빛남
        materials.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
      });
      object.position.set(...positionM);
      parent.add(object);
      const baseColors = materials.map((m) => ((m as THREE.MeshLambertMaterial).color ?? new THREE.Color()).clone());
      this.glows.set(id, { object, materials, baseColors });
    });
  }
}
