import * as THREE from 'three';
import type { AssetsFile } from '../config/types';
import type { EquipmentManager } from '../equipment/equipmentManager';
import type { PortDef } from '../equipment/types';
import { wavelengthToRgb } from '../physics/optics';
import type { Beam } from '../signal/lightRouter';

type Style = AssetsFile['screenOverlay'];

/**
 * 스크린 면(Light 입력, displaysLight) 위에 그리는 것:
 * - 1 mm 눈금(아래쪽 띠, 5·10 mm 마다 길게) — 무늬 간격을 재서 λ·d 를 역산하는 실험용
 * - 이중 슬릿 간섭 무늬(승인 규칙 R5 를 GLSL 로 옮김, GPU 계산). 색 = 파장 색(R4) × I/I₀(R8)
 *   세로로는 퍼지지 않으므로(슬릿은 빛보다 길다) 빔 지름만큼의 높이로 그린다.
 * 장비 객체의 자식으로 붙어서 장비를 옮기거나 들어도 함께 움직인다.
 */
export class ScreenOverlay {
  private readonly faces = new Map<string, { object: THREE.Object3D; pattern: THREE.ShaderMaterial }>();

  constructor(
    private readonly manager: EquipmentManager,
    private readonly style: Style,
  ) {}

  update(beams: readonly Beam[]): void {
    this.syncFaces();
    const active = new Set<string>();
    for (const b of beams) {
      const d = b.values.slitSpacingM;
      const a = b.values.slitWidthM;
      if (!b.face || !b.target || d === undefined || a === undefined) continue;
      const key = `${b.target.deviceId}/${b.target.portId}`;
      const f = this.faces.get(key);
      if (!f) continue;
      active.add(key);
      const face = b.face;
      const n = new THREE.Vector3(...face.normal);
      const u = new THREE.Vector3(...face.uAxis);
      const v = n.clone().cross(u);
      const rel = new THREE.Vector3(...b.trace.pointM).sub(new THREE.Vector3(...face.centerM));
      const beamDir = new THREE.Vector3(...b.trace.pointM).sub(new THREE.Vector3(...b.originM)).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const sep = up.clone().cross(beamDir).normalize(); // 슬릿 간격 방향(슬릿은 세로)
      const un = f.pattern.uniforms;
      un.uActive.value = 1;
      un.uHit.value.set(rel.dot(u), rel.dot(v));
      un.uSep.value.set(sep.dot(u), sep.dot(v));
      un.uPerp.value.set(up.dot(u), up.dot(v));
      un.uLambda.value = b.wavelengthM;
      un.uD.value = d;
      un.uA.value = a;
      un.uL.value = b.trace.tM;
      un.uHalfBeam.value = (b.values.beamDiameterM ?? 1e-3) / 2;
      un.uColor.value.setRGB(...wavelengthToRgb(b.wavelengthM));
    }
    for (const [key, f] of this.faces) if (!active.has(key)) f.pattern.uniforms.uActive.value = 0;
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

  private build(parent: THREE.Object3D, p: PortDef): { object: THREE.Object3D; pattern: THREE.ShaderMaterial } {
    const [w, h] = p.faceSizeM!;
    const n = new THREE.Vector3(...p.directionLocal!);
    const u = new THREE.Vector3(0, 1, 0).cross(n).normalize(); // 라우터와 같은 가로축: 위 × 법선
    const v = n.clone().cross(u);
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.makeBasis(u, v, n).setPosition(new THREE.Vector3(...p.positionM).addScaledVector(n, this.style.liftM));

    const geo = new THREE.PlaneGeometry(w, h);
    const ruler = new THREE.Mesh(geo, this.rulerMaterial(w, h));
    const pattern = this.patternMaterial();
    const glow = new THREE.Mesh(geo, pattern);
    glow.position.z = this.style.liftM; // 눈금 위
    for (const m of [ruler, glow]) m.raycast = () => {};
    holder.add(ruler, glow);
    parent.add(holder);
    return { object: holder, pattern };
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

  private patternMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uActive: { value: 0 },
        uHit: { value: new THREE.Vector2() },
        uSep: { value: new THREE.Vector2(1, 0) },
        uPerp: { value: new THREE.Vector2(0, 1) },
        uLambda: { value: 650e-9 },
        uD: { value: 1e-4 },
        uA: { value: 3e-5 },
        uL: { value: 1 },
        uHalfBeam: { value: 5e-4 },
        uHalf: { value: new THREE.Vector2(0.1, 0.075) },
        uColor: { value: new THREE.Color() },
        uGain: { value: this.style.patternGain },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        // 승인 규칙 R5 (src/physics/doubleSlit.ts 와 같은 식):
        //   I/I0 = cos^2(pi d sinT / lambda) * sinc^2(pi a sinT / lambda), sinT = y / sqrt(y^2 + L^2)
        uniform float uActive; uniform vec2 uHit; uniform vec2 uSep; uniform vec2 uPerp;
        uniform float uLambda; uniform float uD; uniform float uA; uniform float uL; uniform float uHalfBeam;
        uniform vec2 uHalf; uniform vec3 uColor; uniform float uGain;
        varying vec2 vUv;
        const float PI = 3.141592653589793;
        void main() {
          if (uActive < 0.5) discard;
          vec2 rel = (vUv - 0.5) * 2.0 * uHalf - uHit;   // 무늬 중심(가운데 광선이 닿은 곳) 기준
          float y = dot(rel, uSep);                      // 슬릿 간격 방향 거리
          float yPerp = dot(rel, uPerp);                 // 세로(슬릿 길이 방향): 빔 높이만큼만
          float sinT = y / sqrt(y * y + uL * uL);
          float beta = PI * uD * sinT / uLambda;
          float alpha = PI * uA * sinT / uLambda;
          float sinc = abs(alpha) < 1e-6 ? 1.0 : sin(alpha) / alpha;
          float c = cos(beta);
          float I = c * c * sinc * sinc;
          float band = 1.0 - smoothstep(uHalfBeam, uHalfBeam + fwidth(yPerp), abs(yPerp));
          float v = I * band * uGain;
          if (v <= 0.001) discard;
          gl_FragColor = vec4(uColor * v, 1.0);
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
