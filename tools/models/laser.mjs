// 에셋 제작 스크립트(앱 코드 아님): 사용자 도면 "스팀펑크 실험용 레이저"를 단순 부품으로 근사한 로우폴리 모델.
// 규약: 1 단위 = 1 m, +Y 위, +Z 앞, 원점 = 바닥 중앙. 장비 정의와 맞춤:
//   빛 출구 (0, 0.10, +0.10) = 렌즈 앞면 중심, 전원 단자 (0, 0.05, −0.10) = 뒤 단자 면, 손잡이 (0, 0.13, 0) ≈ 경통 위.
// 실행: node tools/models/laser.mjs → public/models/laser.glb
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildGlb } from './glbWriter.mjs';

const MATERIALS = {
  iron: { color: '#2b2b2e', metallic: 0.3, roughness: 0.6 },
  brass: { color: '#b5843a', metallic: 0.4, roughness: 0.45 },
  copper: { color: '#b8653a', metallic: 0.4, roughness: 0.5 },
  lens: { color: '#2a8c8c', metallic: 0.1, roughness: 0.2 },
  dial: { color: '#e8e0c8', metallic: 0, roughness: 0.8 },
  red: { color: '#b3261e', metallic: 0.1, roughness: 0.5 },
};

const parts = [];
const add = (geometry, material) => parts.push({ geometry, material });

/** 세로(Y) 원기둥: 아래 y0, 위 y1. */
const vCyl = (r, y0, y1, mat, n = 20, x = 0, z = 0) =>
  add(new THREE.CylinderGeometry(r, r, y1 - y0, n).translate(x, (y0 + y1) / 2, z), mat);
/** 앞뒤(Z) 원기둥: 경통 축(높이 y), z0 → z1. */
const zCyl = (r, z0, z1, mat, n = 20, x = 0, y = 0.1) =>
  add(new THREE.CylinderGeometry(r, r, z1 - z0, n).rotateX(Math.PI / 2).translate(x, y, (z0 + z1) / 2), mat);
/** 좌우(X) 원기둥. */
const xCyl = (r, x0, x1, y, z, mat, n = 12) =>
  add(new THREE.CylinderGeometry(r, r, x1 - x0, n).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, y, z), mat);
const box = (sx, sy, sz, cx, cy, cz, mat) => add(new THREE.BoxGeometry(sx, sy, sz).translate(cx, cy, cz), mat);

// 받침: 바닥판 + 황동 테 + 윗단
vCyl(0.045, 0, 0.01, 'iron', 24);
vCyl(0.047, 0.01, 0.014, 'brass', 24);
vCyl(0.035, 0.014, 0.022, 'iron', 20);
// 기둥 + 황동 고리 2개 + 경통 받침
vCyl(0.014, 0.022, 0.072, 'iron', 16);
vCyl(0.018, 0.03, 0.036, 'brass', 16);
vCyl(0.02, 0.064, 0.072, 'brass', 16);
box(0.03, 0.01, 0.05, 0, 0.077, 0, 'brass');
// 경통(축 y = 0.10, 뒤 −0.10 → 앞 +0.08) + 황동 고리들
zCyl(0.022, -0.1, 0.08, 'iron', 20);
for (const [z, w, r] of [[-0.095, 0.01, 0.026], [-0.05, 0.006, 0.025], [-0.035, 0.006, 0.025], [0.02, 0.006, 0.025], [0.05, 0.012, 0.026]]) {
  zCyl(r, z - w / 2, z + w / 2, 'brass', 20);
}
// 앞: 렌즈 틀 + 렌즈(앞면 z = +0.10 = 빛 출구)
zCyl(0.026, 0.08, 0.095, 'brass', 20);
zCyl(0.018, 0.095, 0.1, 'lens', 20);
// 오른쪽(+x) 압력 게이지: 황동 통 + 눈금판 + 바늘
xCyl(0.012, 0.022, 0.03, 0.1, -0.06, 'brass', 16);
xCyl(0.01, 0.03, 0.032, 0.1, -0.06, 'dial', 16);
box(0.001, 0.0015, 0.008, 0.0325, 0.102, -0.058, 'red');
// 위 조절 손잡이
vCyl(0.005, 0.12, 0.13, 'brass', 10, 0, -0.07);
vCyl(0.007, 0.13, 0.134, 'brass', 12, 0, -0.07);
// 구리 관: 게이지 아래 → 기둥
const pipe = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.03, 0.09, -0.06),
  new THREE.Vector3(0.042, 0.07, -0.045),
  new THREE.Vector3(0.036, 0.05, -0.02),
  new THREE.Vector3(0.016, 0.045, -0.004),
]);
add(new THREE.TubeGeometry(pipe, 20, 0.003, 6, false), 'copper');
// 뒤 전원 단자: 경통 뒤에서 내려온 받침 + 황동 테 + 빨간 단자(뒤 면 z = −0.10, 중심 y = 0.05)
box(0.014, 0.036, 0.008, 0, 0.066, -0.092, 'iron');
zCyl(0.009, -0.098, -0.094, 'brass', 14, 0, 0.05);
zCyl(0.006, -0.1, -0.098, 'red', 14, 0, 0.05);

const { bytes, triangles } = buildGlb('laser', parts, MATERIALS);
writeFileSync(new URL('../../public/models/laser.glb', import.meta.url), bytes);
console.log(`laser.glb: ${bytes.length} bytes, ${triangles} triangles`);
