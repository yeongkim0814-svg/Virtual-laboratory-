// 에셋 제작 스크립트(앱 코드 아님): LED — 실제 부품 모양(다리 2개 + 몸통 + 둥근 머리).
// 규약: 1 단위 = 1 m, +Y 위, 원점 = 바닥 중앙. 장비 정의와 맞춤:
//   전원선 단자 ≈ (0, 0, 0.01) 다리 밑동 근처, 발광 위치(glow) = (0, 0.036, 0) 머리 가운데, 손잡이 (0, 0.03, 0).
// led-glow(발광 머리, GlowView 가 색을 입힘)도 같이 만든다: 작은 반투명해 보이는 흰 구슬(꺼지면 원래 색).
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildGlb } from './glbWriter.mjs';

const LEG_TOP_Y = 0.018;
const BODY_TOP_Y = 0.036;
const DOME_R = 0.013;

const MATERIALS = {
  lead: { color: '#8a8f96', metallic: 0.5, roughness: 0.4 }, // 다리(금속)
  epoxy: { color: '#c9c4b8', metallic: 0, roughness: 0.5 }, // 몸통(투명 에폭시를 흐린 색으로)
};

const legParts = [];
const add = (arr, geometry, material) => arr.push({ geometry, material });

for (const x of [-0.006, 0.006]) {
  add(legParts, new THREE.CylinderGeometry(0.0015, 0.0015, LEG_TOP_Y, 8).translate(x, LEG_TOP_Y / 2, 0), 'lead');
}
add(legParts, new THREE.CylinderGeometry(DOME_R, DOME_R, BODY_TOP_Y - LEG_TOP_Y, 14).translate(0, (LEG_TOP_Y + BODY_TOP_Y) / 2, 0), 'epoxy');
add(
  legParts,
  new THREE.SphereGeometry(DOME_R, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, BODY_TOP_Y, 0),
  'epoxy',
);

const led = buildGlb('led', legParts, MATERIALS);
writeFileSync(new URL('../../public/models/led.glb', import.meta.url), led.bytes);
console.log(`led.glb: ${led.bytes.length} bytes, ${led.triangles} triangles`);

const glowR = DOME_R * 0.85;
const glowParts = [{ geometry: new THREE.SphereGeometry(glowR, 12, 8).translate(0, glowR, 0), material: 'bulb' }];
const glow = buildGlb('led-glow', glowParts, { bulb: { color: '#d8d4c4', metallic: 0, roughness: 0.6 } });
writeFileSync(new URL('../../public/models/led-glow.glb', import.meta.url), glow.bytes);
console.log(`led-glow.glb: ${glow.bytes.length} bytes, ${glow.triangles} triangles`);
