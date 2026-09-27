import * as THREE from 'three';
import type { AssetsFile } from '../config/types';
import { wavelengthToRgb } from '../physics/optics';
import type { Beam } from '../signal/lightRouter';

type Style = AssetsFile['screenOverlay'];

/**
 * 이중 슬릿 간섭 무늬를 "빛이 닿은 면"(스크린·벽·바닥·가구·장비 옆면)에 그린다.
 * 승인 규칙 R5′ 를 GLSL 로 옮김(GPU 계산). 각 픽셀의 월드 위치에서 슬릿까지의 방향으로 sinθ 를 구하므로
 * 면이 빛에 비스듬해도(기울어진 스크린·벽) 같은 식이 그대로 맞는다. 색 = 파장 색(R4) × I/I₀(R8).
 * 세로로는 퍼지지 않으므로(슬릿은 빛보다 길다) 빔 지름 두께의 부채꼴 면과 만나는 띠에만 그린다.
 * 한계: 슬릿 → 무늬 사이 장애물로 무늬 일부가 가려지는 것은 다루지 않는다(가운데 광선만 추적).
 */
export class PatternView {
  private readonly group = new THREE.Group();
  private readonly geo = new THREE.PlaneGeometry(1, 1);
  private readonly pool: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];

  constructor(
    scene: THREE.Scene,
    private readonly style: Style,
  ) {
    scene.add(this.group);
  }

  /** 무늬를 그리는 빛: 슬릿을 지났고, 닿은 면이 있고, 받는 면이면 무늬를 그리는 면(스크린)일 때. */
  static drawsPattern(b: Beam): boolean {
    return b.values.slitSpacingM !== undefined && b.sourceNormalM !== undefined && !!b.surface && (!b.target || !!b.target.displaysLight);
  }

  update(beams: readonly Beam[]): void {
    const shown = beams.filter(PatternView.drawsPattern);
    while (this.pool.length < shown.length) this.pool.push(this.make());
    this.pool.forEach((mesh, i) => {
      const b = shown[i];
      mesh.visible = !!b;
      if (b) this.place(mesh, b);
    });
  }

  private place(mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>, b: Beam): void {
    const s = b.surface!;
    const n = new THREE.Vector3(...s.normal);
    const u = new THREE.Vector3(...s.uAxis);
    const v = n.clone().cross(u);
    const hit = new THREE.Vector3(...b.trace.pointM);
    const origin = new THREE.Vector3(...b.originM);
    const dir = hit.clone().sub(origin).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const plate = new THREE.Vector3(...b.sourceNormalM!);
    const sep = up.clone().cross(plate).normalize(); // 슬릿 간격 방향(슬릿은 세로), R5′ 의 sinθ 성분 축
    const fanN = sep.clone().cross(dir).normalize(); // 무늬가 퍼지는 부채꼴 면의 법선
    const d = b.values.slitSpacingM;
    const a = b.values.slitWidthM;

    // 그리는 사각형: 닿은 점 중심, 포락선 patternExtentLobes 번째 0 까지(비스듬한 면이면 늘어남)
    const reach = Math.min(1, (this.style.patternExtentLobes * b.wavelengthM) / a);
    const slant = Math.max(0.2, Math.abs(dir.dot(n)));
    const half = Math.min(2, (b.trace.tM * reach) / slant + 0.01);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.makeBasis(u.clone().multiplyScalar(2 * half), v.clone().multiplyScalar(2 * half), n);
    mesh.matrix.setPosition(hit.clone().addScaledVector(n, this.style.liftM * 2));

    const un = mesh.material.uniforms;
    un.uSlit.value.copy(origin);
    un.uDir.value.copy(dir);
    un.uSep.value.copy(sep);
    un.uFanN.value.copy(fanN);
    un.uLambda.value = b.wavelengthM;
    un.uD.value = d;
    un.uA.value = a;
    un.uHalfBeam.value = (b.values.beamDiameterM ?? 1e-3) / 2;
    un.uRectC.value.set(...s.centerM);
    un.uRectU.value.copy(u);
    un.uRectV.value.copy(v);
    un.uRectHalf.value.set(s.halfWidthM, s.halfHeightM);
    un.uColor.value.setRGB(...wavelengthToRgb(b.wavelengthM));
  }

  private make(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      uniforms: {
        uSlit: { value: new THREE.Vector3() },
        uDir: { value: new THREE.Vector3(0, 0, 1) },
        uSep: { value: new THREE.Vector3(1, 0, 0) },
        uFanN: { value: new THREE.Vector3(0, 1, 0) },
        uLambda: { value: 650e-9 },
        uD: { value: 1e-4 },
        uA: { value: 3e-5 },
        uHalfBeam: { value: 5e-4 },
        uRectC: { value: new THREE.Vector3() },
        uRectU: { value: new THREE.Vector3(1, 0, 0) },
        uRectV: { value: new THREE.Vector3(0, 1, 0) },
        uRectHalf: { value: new THREE.Vector2(1, 1) },
        uColor: { value: new THREE.Color() },
        uGain: { value: this.style.patternGain },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        // 승인 규칙 R5′ (src/physics/doubleSlit.ts doubleSlitIntensityOblique 와 같은 식):
        //   I/I0 = cos^2(pi d s / lambda) * sinc^2(pi a s / lambda),  s = sinT - sinTi
        //   sinT = (슬릿 → 이 점 방향)·sep, sinTi = (들어온 방향)·sep  →  s = (w - dir)·sep
        uniform vec3 uSlit; uniform vec3 uDir; uniform vec3 uSep; uniform vec3 uFanN;
        uniform float uLambda; uniform float uD; uniform float uA; uniform float uHalfBeam;
        uniform vec3 uRectC; uniform vec3 uRectU; uniform vec3 uRectV; uniform vec2 uRectHalf;
        uniform vec3 uColor; uniform float uGain;
        varying vec3 vWorld;
        const float PI = 3.141592653589793;
        void main() {
          vec3 r = vWorld - uRectC;                      // 닿은 면 밖(벽 모서리 너머 등)은 그리지 않음
          if (abs(dot(r, uRectU)) > uRectHalf.x || abs(dot(r, uRectV)) > uRectHalf.y) discard;
          vec3 w = vWorld - uSlit;
          float h = dot(w, uFanN);                       // 부채꼴 면에서 벗어난 거리: 빔 두께만큼만
          float band = 1.0 - smoothstep(uHalfBeam, uHalfBeam + fwidth(h), abs(h));
          if (band <= 0.0) discard;
          vec3 wn = normalize(w);
          if (dot(wn, uDir) <= 0.0) discard;             // 슬릿 뒤쪽
          float s = dot(wn - uDir, uSep);
          float beta = PI * uD * s / uLambda;
          float alpha = PI * uA * s / uLambda;
          float sinc = abs(alpha) < 1e-6 ? 1.0 : sin(alpha) / alpha;
          float c = cos(beta);
          float v = c * c * sinc * sinc * band * uGain;
          if (v <= 0.001) discard;
          gl_FragColor = vec4(uColor * v, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(this.geo, material);
    mesh.raycast = () => {};
    mesh.frustumCulled = false; // 행렬을 직접 쓰므로 경계 구가 맞지 않음
    this.group.add(mesh);
    return mesh;
  }
}
