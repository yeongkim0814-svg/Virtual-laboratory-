import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetsFile } from '../config/types';
import { createPlaceholderBox } from './placeholder';

/**
 * 모든 3D 시각 요소는 이 레지스트리를 통해 이름으로만 생성한다.
 * assets.json 값이 null 이면 placeholder 상자, 아니면 .glb 를 로드한다.
 */
export class AssetRegistry {
  private readonly loader = new GLTFLoader();
  private readonly modelCache = new Map<string, Promise<THREE.Object3D>>();

  constructor(private readonly file: AssetsFile) {}

  /**
   * @param placeholderSizeM model 이 null 일 때 만들 상자 크기 [x, y, z].
   *   생략하면 assets.json placeholders 의 sizeM 을 쓴다.
   *   모델이 있으면 무시된다(모델은 1단위=1m 규약대로 제작).
   */
  async create(name: string, placeholderSizeM?: [number, number, number]): Promise<THREE.Object3D> {
    if (!(name in this.file.assets)) throw new Error(`assets.json 에 없는 에셋: ${name}`);
    const modelPath = this.file.assets[name];
    if (modelPath === null) return this.placeholder(name, placeholderSizeM);

    const url = `${import.meta.env.BASE_URL}${modelPath}`;
    let cached = this.modelCache.get(url);
    if (!cached) {
      cached = this.loader.loadAsync(url).then((gltf) => gltf.scene);
      this.modelCache.set(url, cached);
    }
    try {
      return (await cached).clone(true);
    } catch (err) {
      console.warn(`모델 로드 실패, placeholder 사용: ${name}`, err);
      return this.placeholder(name, placeholderSizeM);
    }
  }

  /**
   * 여러 부품으로 된 에셋(가구 등). 모델이 있으면 모델 하나, 없으면 부품마다 placeholder 상자.
   * 부품 좌표 = 에셋 로컬(원점 바닥 중앙), 각 상자 원점도 바닥 중앙.
   */
  async createAssembly(name: string, parts: readonly { positionM: [number, number, number]; sizeM: [number, number, number] }[]): Promise<THREE.Object3D> {
    if (!(name in this.file.assets)) throw new Error(`assets.json 에 없는 에셋: ${name}`);
    if (this.file.assets[name] !== null) return this.create(name);
    const group = new THREE.Group();
    for (const p of parts) {
      const box = this.placeholder(name, p.sizeM);
      box.position.set(...p.positionM);
      group.add(box);
    }
    return group;
  }

  /** placeholder 두께(판 형태 에셋용). */
  thicknessM(name: string): number {
    const t = this.style(name).thicknessM;
    if (t === undefined) throw new Error(`assets.json placeholders.${name}.thicknessM 없음`);
    return t;
  }

  private placeholder(name: string, sizeM?: [number, number, number]): THREE.Object3D {
    const style = this.style(name);
    const size = sizeM ?? style.sizeM;
    if (!size) throw new Error(`assets.json placeholders.${name}.sizeM 없음`);
    return createPlaceholderBox(size, style.color);
  }

  private style(name: string) {
    const s = this.file.placeholders[name];
    if (!s) throw new Error(`assets.json placeholders 에 없는 항목: ${name}`);
    return s;
  }
}
