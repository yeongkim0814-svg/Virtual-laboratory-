import * as THREE from 'three';

/**
 * 모델이 내접하는 밑면 원의 반지름: 모델의 모든 꼭짓점 중 수직축(원점, y축)에서 가장 먼 수평 거리.
 * 모델 모양(사각형·원형·임의)과 무관하게, 이 원 안에 모델의 바닥 투영이 전부 들어간다.
 * object 는 원점·무회전 상태여야 한다(장비 로컬 좌표 기준).
 */
export function inscribingRadiusM(object: THREE.Object3D): number {
  object.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(object.matrixWorld).invert();
  const toRoot = new THREE.Matrix4();
  const v = new THREE.Vector3();
  let r = 0;
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const pos = mesh.isMesh ? (mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined) : undefined;
    if (!pos) return;
    toRoot.multiplyMatrices(rootInv, mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(toRoot);
      r = Math.max(r, Math.hypot(v.x, v.z));
    }
  });
  return r;
}
