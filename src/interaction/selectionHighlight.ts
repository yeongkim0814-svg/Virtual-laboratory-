import * as THREE from 'three';
import type { AssetsFile } from '../config/types';

/**
 * 강조할 대상. move = 크기·들썩임도 줄지(전선 플러그만 — 장비 몸체는 크기·위치를 바꾸면 포트 위치가 따라
 * 움직여 케이블 경로가 매 프레임 다시 계산되므로 색만 바꾼다).
 */
export interface HighlightTarget {
  object: THREE.Object3D;
  move: boolean;
}

/**
 * 케이블을 이으려고 고른 포트 표시: 따로 도형을 띄우지 않고 대상 자체를 잠깐 바꾼다.
 * - 색: 재질 색을 강조색 쪽으로 (0.4~1)×colorMix 만큼 섞어 pulseHz 박자로 깜박임(재질은 복제해 바꾸고,
 *   끝나면 원래 재질로 돌림 — 같은 모델을 쓰는 다른 장비에는 영향 없음). 발광(emissive)은 쓰지 않음
 *   (그래픽 규칙: 발광은 레이저·무늬만)
 * - move 대상(전선 플러그)만: 크기 1 ↔ pulseScale, liftM 만큼 떠서 같은 박자로 들썩임
 * 외형 값은 assets.json 의 selectionHighlight. 대상은 매 프레임 resolve() 로 다시 찾는다
 * (플러그 모델은 풀에서 재사용되어 자리가 바뀔 수 있음).
 */
export class SelectionHighlight {
  private resolve: (() => HighlightTarget | null) | null = null;
  private current: HighlightTarget | null = null;
  private baseScale = new THREE.Vector3(1, 1, 1);
  private baseY = 0;
  private tS = 0;
  private readonly originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private readonly tinted: { color: THREE.Color; base: THREE.Color }[] = [];
  private readonly highlightColor: THREE.Color;

  constructor(private readonly style: AssetsFile['selectionHighlight']) {
    this.highlightColor = new THREE.Color(style.color);
  }

  /** 강조할 대상을 정한다(null = 강조 끔). */
  set(resolve: (() => HighlightTarget | null) | null): void {
    this.restore();
    this.resolve = resolve;
    this.tS = 0;
  }

  update(dtS: number): void {
    const next = this.resolve?.() ?? null;
    if (next?.object !== this.current?.object) {
      this.restore();
      if (next) this.apply(next);
    }
    const cur = this.current;
    if (!cur) return;
    this.tS += dtS;
    const k = (1 - Math.cos(2 * Math.PI * this.style.pulseHz * this.tS)) / 2; // 0 → 1 → 0
    const mix = this.style.colorMix * (0.4 + 0.6 * k);
    for (const t of this.tinted) t.color.copy(t.base).lerp(this.highlightColor, mix);
    if (!cur.move) return;
    cur.object.scale.copy(this.baseScale).multiplyScalar(1 + (this.style.pulseScale - 1) * k);
    cur.object.position.y = this.baseY + this.style.liftM * (0.5 + 0.5 * k);
  }

  private apply(t: HighlightTarget): void {
    this.current = t;
    this.baseScale.copy(t.object.scale);
    this.baseY = t.object.position.y;
    t.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return; // 보이지 않는 탭 판정 구 등은 건드리지 않음
      this.originals.set(mesh, mesh.material);
      const tint = (m: THREE.Material): THREE.Material => {
        const c = m.clone();
        const color = (c as THREE.Material & { color?: THREE.Color }).color;
        if (color) this.tinted.push({ color, base: color.clone() });
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tint) : tint(mesh.material);
    });
  }

  private restore(): void {
    const cur = this.current;
    if (!cur) return;
    if (cur.move) {
      cur.object.scale.copy(this.baseScale);
      cur.object.position.y = this.baseY;
    }
    for (const [mesh, original] of this.originals) {
      const tinted = mesh.material;
      for (const m of Array.isArray(tinted) ? tinted : [tinted]) m.dispose();
      mesh.material = original;
    }
    this.originals.clear();
    this.tinted.length = 0;
    this.current = null;
  }
}
