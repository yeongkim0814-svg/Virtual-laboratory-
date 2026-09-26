import * as THREE from 'three';

/**
 * 상자형 placeholder. 모델 규약과 동일하게 원점 = 바닥 중앙.
 * 크기는 호출자가, 색은 assets.json 이 정한다. (상자 1개 = 12 삼각형)
 */
export function createPlaceholderBox(sizeM: [number, number, number], color: string): THREE.Mesh {
  const [w, h, d] = sizeM;
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(0, h / 2, 0);
  const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), flatShading: true });
  return new THREE.Mesh(geometry, material);
}
