// 에셋 규칙 테스트: assets.json 구조 / placeholder 원점 규약.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlaceholderBox } from '../src/assets/placeholder';
import type { AssetsFile } from '../src/config/types';

const assetsFile = JSON.parse(readFileSync('public/assets.json', 'utf8')) as AssetsFile;

describe('assets.json', () => {
  it('방 에셋 floor, wall 이 존재', () => {
    expect(assetsFile.assets).toHaveProperty('floor');
    expect(assetsFile.assets).toHaveProperty('wall');
  });
  it('모든 에셋 값은 문자열(.glb 경로) 또는 null', () => {
    for (const [name, v] of Object.entries(assetsFile.assets)) {
      expect(v === null || typeof v === 'string', name).toBe(true);
    }
  });
  it('모든 에셋은 placeholder 외형(색, 두께)을 가진다', () => {
    for (const name of Object.keys(assetsFile.assets)) {
      const s = assetsFile.placeholders[name];
      expect(s, name).toBeDefined();
      expect(typeof s.color, name).toBe('string');
      expect(s.thicknessM, name).toBeGreaterThan(0);
    }
  });
});

describe('placeholder', () => {
  it('원점 = 바닥 중앙 (바운딩박스 min.y=0, x·z 중심 0)', () => {
    const mesh = createPlaceholderBox([2, 0.9, 1], '#000000');
    const box = new THREE.Box3().setFromObject(mesh);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(0.9);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0);
  });
});
