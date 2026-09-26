// 모델이 내접하는 밑면 원 반지름 테스트 (기하, 물리 규칙 아님). 기대값은 손계산.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlaceholderBox } from '../src/assets/placeholder';
import { inscribingRadiusM } from '../src/equipment/footprint';

describe('inscribingRadiusM (수직축에서 가장 먼 꼭짓점의 수평 거리)', () => {
  it('0.3 × 0.2 m 상자 → √(0.15² + 0.1²) = 0.18028 m', () => {
    expect(inscribingRadiusM(createPlaceholderBox([0.3, 0.2, 0.2], '#000'))).toBeCloseTo(0.18028, 5);
  });
  it('반지름 0.1 m 원기둥 → 0.1 m (모양이 사각형이 아니어도)', () => {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 16));
    expect(inscribingRadiusM(cyl)).toBeCloseTo(0.1, 5);
  });
  it('중심에서 벗어난 부품도 포함: 0.1 m 상자를 x = 0.2 로 옮긴 자식 → 0.25 + … = √(0.25² + 0.05²)', () => {
    const root = new THREE.Group();
    const child = createPlaceholderBox([0.1, 0.1, 0.1], '#000');
    child.position.x = 0.2;
    root.add(child);
    expect(inscribingRadiusM(root)).toBeCloseTo(Math.hypot(0.25, 0.05), 5);
  });
  it('높이(y)는 반지름에 들어가지 않는다: 0.1 × 2 × 0.1 m 기둥 → √(0.05² + 0.05²)', () => {
    expect(inscribingRadiusM(createPlaceholderBox([0.1, 2, 0.1], '#000'))).toBeCloseTo(Math.hypot(0.05, 0.05), 5);
  });
});
