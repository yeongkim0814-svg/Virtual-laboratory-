// 포트 좌표 변환 테스트 (기하, 물리 규칙 아님).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { localToWorld } from '../src/equipment/ports';

describe('localToWorld', () => {
  it('회전 0: 위치만 더한다', () => {
    const w = localToWorld([0.15, 0.1, 0], [1, 0, 2], 0);
    expect(w[0]).toBeCloseTo(1.15);
    expect(w[1]).toBeCloseTo(0.1);
    expect(w[2]).toBeCloseTo(2);
  });
  it('y축 90° 회전: 로컬 +x 가 월드 -z 로', () => {
    // (0.15, 0.1, 0) → (0, 0.1, -0.15) + (1, 0, 2) = (1, 0.1, 1.85)
    const w = localToWorld([0.15, 0.1, 0], [1, 0, 2], Math.PI / 2);
    expect(w[0]).toBeCloseTo(1);
    expect(w[1]).toBeCloseTo(0.1);
    expect(w[2]).toBeCloseTo(1.85);
  });
  it('three.js Object3D 의 회전과 같은 결과', () => {
    const o = new THREE.Object3D();
    o.position.set(-2, 0.5, 3);
    o.rotation.y = 0.7;
    o.updateMatrixWorld();
    const expected = new THREE.Vector3(0.3, 0.2, -0.4).applyMatrix4(o.matrixWorld);
    const w = localToWorld([0.3, 0.2, -0.4], [-2, 0.5, 3], 0.7);
    expect(w[0]).toBeCloseTo(expected.x);
    expect(w[1]).toBeCloseTo(expected.y);
    expect(w[2]).toBeCloseTo(expected.z);
  });
});
