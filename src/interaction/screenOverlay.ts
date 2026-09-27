import * as THREE from 'three';
import type { AssetsFile } from '../config/types';
import type { EquipmentManager } from '../equipment/equipmentManager';
import type { PortDef } from '../equipment/types';

type Style = AssetsFile['screenOverlay'];

/**
 * 스크린 면(Light 입력, displaysLight) 위의 1 mm 눈금(아래쪽 띠, 5·10 mm 마다 길게)
 * — 무늬 간격을 재서 λ·d 를 역산하는 실험용. 간섭 무늬 자체는 PatternView 가 (스크린·벽 어디든) 그린다.
 * 장비 객체의 자식으로 붙어서 장비를 옮기거나 들어도 함께 움직인다.
 */
export class ScreenOverlay {
  private readonly faces = new Map<string, { object: THREE.Object3D }>();

  constructor(
    private readonly manager: EquipmentManager,
    private readonly style: Style,
  ) {}

  update(): void {
    this.syncFaces();
  }

  /** 장비가 새로 생기거나(불러오기) 사라지면 면 표시를 붙이거나 뗀다. */
  private syncFaces(): void {
    const alive = new Set<string>();
    for (const inst of this.manager.instances) {
      for (const p of inst.def.ports) {
        if (p.channel !== 'Light' || p.direction !== 'in' || !p.displaysLight || !p.faceSizeM || !p.directionLocal) continue;
        const key = `${inst.id}/${p.id}`;
        alive.add(key);
        const cur = this.faces.get(key);
        if (cur && cur.object.parent === inst.object) continue;
        cur?.object.removeFromParent();
        this.faces.set(key, this.build(inst.object, p));
      }
    }
    for (const [key, f] of this.faces) {
      if (alive.has(key)) continue;
      f.object.removeFromParent();
      this.faces.delete(key);
    }
  }

  private build(parent: THREE.Object3D, p: PortDef): { object: THREE.Object3D } {
    const [w, h] = p.faceSizeM!;
    const n = new THREE.Vector3(...p.directionLocal!);
    const u = new THREE.Vector3(0, 1, 0).cross(n).normalize(); // 라우터와 같은 가로축: 위 × 법선
    const v = n.clone().cross(u);
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.makeBasis(u, v, n).setPosition(new THREE.Vector3(...p.positionM).addScaledVector(n, this.style.liftM));

    const geo = new THREE.PlaneGeometry(w, h);
    const ruler = new THREE.Mesh(geo, this.rulerMaterial(w, h));
    ruler.raycast = () => {};
    holder.add(ruler);
    parent.add(holder);
    return { object: holder };
  }

  private rulerMaterial(w: number, h: number): THREE.ShaderMaterial {
    const s = this.style;
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(s.rulerColor) },
        uTick: { value: s.rulerTickM },
        uBand: { value: s.rulerBandHeightM },
        uLine: { value: s.rulerLineWidthM },
        uHalf: { value: new THREE.Vector2(w / 2, h / 2) },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTick; uniform float uBand; uniform float uLine; uniform vec2 uHalf;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0 * uHalf;          // 면 로컬 (u, v) m, 중심 0
          float fromBottom = p.y + uHalf.y;
          if (fromBottom > uBand) discard;
          // 눈금 3단계(1·5·10 mm): 각자 자기 간격으로 흐려진다 → 멀리서도 5·10 mm 눈금은 보인다
          float aa = fwidth(p.x);
          float halfW = max(uLine * 0.5, aa * 0.5);       // 최소 1 픽셀 굵기
          float line = 0.0;
          for (int i = 0; i < 3; i++) {
            float mult = i == 0 ? 1.0 : (i == 1 ? 5.0 : 10.0);
            float len = i == 0 ? 0.4 : (i == 1 ? 0.7 : 1.0);
            float spacing = uTick * mult;
            float k = p.x / spacing;
            float dist = abs(k - floor(k + 0.5)) * spacing;
            float l = 1.0 - smoothstep(halfW, halfW + aa, dist);
            l *= step(fromBottom, uBand * len);
            l *= 1.0 - smoothstep(0.2, 0.4, aa / spacing);
            line = max(line, l);
          }
          float base = 1.0 - smoothstep(max(uLine * 0.5, fwidth(p.y) * 0.5), max(uLine * 0.5, fwidth(p.y) * 0.5) + fwidth(p.y), fromBottom); // 아래 기준선
          float alpha = max(line, base);
          if (alpha <= 0.0) discard;
          gl_FragColor = vec4(uColor, alpha);
        }`,
    });
  }
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
