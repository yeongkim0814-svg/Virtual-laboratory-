// 에셋 제작 스크립트(앱 코드 아님): 이중 슬릿판 — 스타일라이즈드 로우폴리(부드러운 셰이딩 + 모서리 베벨,
// 손그림 텍스처 1장, 낡은 흔적). CLAUDE.md "그래픽 스타일" 절충안 규칙.
// 규약: 1 단위 = 1 m, +Y 위, +Z 앞, 원점 = 바닥 중앙. 장비 정의와 맞춤:
//   조준 영역 중심 (0, 0.10, −0.01) 2×2 cm, 출구 (0, 0.10, +0.01), 손잡이 ≈ (0, 0.20, 0) 판 위쪽.
// 판 두께(±0.01)·가로세로(0.12×0.20)는 물리(빛 차단 상자)와 그대로 맞아야 하므로
// 장식(리벳·테두리)은 반드시 이 상자 안쪽에 눌러 붙인다(밖으로 튀어나오지 않게).
// 실행: node tools/models/doubleSlit.mjs → public/models/double-slit.glb
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildAtlas } from './atlas.mjs';
import { buildTexturedGlb } from './glbWriter.mjs';

const COLORS = {
  iron: '#3a3a3d', // 판 몸체(짙은 철)
  brass: '#8a6a35', // 테두리·리벳(낡은 황동)
  patina: '#3f6b64', // 아래 명판 포인트(청록 녹청)
};
const atlas = buildAtlas(COLORS, { cellPx: 32, gridH: 128, seed: 7 });

const parts = [];
/** uv: u = 아틀라스 칸 중심(색), v = 모델 전체 높이 기준 비율(위=밝게 칠해진 부분과 맞춰 자연스러운 음영). */
function withUv(geometry, colorName, yMin = 0, yMax = 0.2) {
  const g = geometry.clone();
  const pos = g.getAttribute('position');
  const u = atlas.uOf(colorName);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const v = Math.min(1, Math.max(0, (y - yMin) / (yMax - yMin)));
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const add = (geometry, colorName, smooth = false) => parts.push({ geometry: withUv(geometry, colorName), smooth });

// 판 몸체: 0.12(가로) × 0.20(세로) × 0.02(두께), 바닥에서 y = 0 ~ 0.20, 중심 z = 0(±0.01 이 물리 판 두께).
// 베벨 반지름은 두께 절반(0.01)보다 작게 → 앞뒤 평평한 면(조준 영역·출구)은 그대로 평평.
add(new RoundedBoxGeometry(0.12, 0.2, 0.02, 3, 0.005).translate(0, 0.1, 0), 'iron', true);

// 네 모서리 리벳(장식): 앞면에 반쯤 박힌 작은 원통 — 앞면(z=+0.01)에 딱 맞춰 튀어나오지 않게.
const RIVET_XY = [
  [-0.05, 0.02],
  [0.05, 0.02],
  [-0.05, 0.18],
  [0.05, 0.18],
];
for (const [x, y] of RIVET_XY) {
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.007, 12).rotateX(Math.PI / 2).translate(x, y, 0.0065), 'brass', true);
}

// 테두리 프레임(장식): 위·아래·좌우 얇은 황동 띠, 판 두께 안에 절반 파묻힘(z = 0 ~ 0.01).
const rim = (w, h, x, y) => add(new THREE.BoxGeometry(w, h, 0.01).translate(x, y, 0.005), 'brass');
rim(0.116, 0.012, 0, 0.006); // 아래
rim(0.116, 0.012, 0, 0.194); // 위
rim(0.012, 0.176, -0.054, 0.1); // 왼쪽
rim(0.012, 0.176, 0.054, 0.1); // 오른쪽

// 아래쪽 작은 명판(장식, 청록 녹청 포인트): 조준 영역(중심부)에서 멀리 떨어진 하단부에 얇게.
add(new THREE.BoxGeometry(0.05, 0.02, 0.008).translate(0, 0.035, 0.004), 'patina');

const { bytes, triangles } = buildTexturedGlb('double-slit', parts, atlas.png);
writeFileSync(new URL('../../public/models/double-slit.glb', import.meta.url), bytes);
console.log(`double-slit.glb: ${bytes.length} bytes, ${triangles} triangles, atlas ${atlas.width}x${atlas.height}`);
