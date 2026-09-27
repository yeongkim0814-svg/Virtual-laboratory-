// 모델(.glb) 규약 테스트: assets.json 에 연결된 모든 모델. (디자인 교체 때 자동 검사)
// 규약: 1 단위 = 1 m, +Y 위, 원점 = 바닥 중앙, 스타일라이즈드 로우폴리(장비당 8,000 삼각형 이하).
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import type { AssetsFile } from '../src/config/types';
import { loadEquipmentRegistry } from '../src/equipment/registry';

const assetsFile = JSON.parse(readFileSync('public/assets.json', 'utf8')) as AssetsFile;
const models = Object.entries(assetsFile.assets).filter((e): e is [string, string] => e[1] !== null);
const registry = loadEquipmentRegistry();

async function load(path: string): Promise<THREE.Object3D> {
  const buf = readFileSync(`public/${path}`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((resolve, reject) => new GLTFLoader().parse(ab, '', (g) => resolve(g.scene), reject));
}
function triangles(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((m) => {
    const g = (m as THREE.Mesh).geometry;
    if ((m as THREE.Mesh).isMesh && g) n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return n;
}

describe.each(models)('모델 %s (%s)', (name, path) => {
  it('불러와지고, 원점 = 바닥 중앙(바닥 y ≈ 0, 가로 중심 ±1 cm), 8,000 삼각형 이하', async () => {
    const o = await load(path);
    const box = new THREE.Box3().setFromObject(o);
    expect(box.min.y).toBeCloseTo(0, 2);
    expect(Math.abs((box.min.x + box.max.x) / 2)).toBeLessThan(0.01);
    expect(triangles(o)).toBeLessThanOrEqual(8000);
    expect(triangles(o)).toBeGreaterThan(0);
  });
  it('장비라면: 빛 출구(Light 출력)가 모델 앞 끝과 맞는다(±5 mm)', async () => {
    const def = [...registry.definitions.values()].find((d) => d.asset === name);
    const beam = def?.ports.find((p) => p.channel === 'Light' && p.direction === 'out');
    if (!beam) return;
    const o = await load(path);
    const box = new THREE.Box3().setFromObject(o);
    expect(Math.abs(box.max.z - beam.positionM[2])).toBeLessThan(0.005);
  });
});
