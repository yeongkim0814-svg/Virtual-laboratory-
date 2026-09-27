// 에셋 제작 스크립트(앱 코드 아님): 실험용 클램프 — 간단한 도형(상자·원기둥·고리)만으로.
// 규약: 1 단위 = 1 m, +Y 위, 원점 = 바닥 중앙. 장비 정의와 맞춤:
//   받침대 → 기둥 → 위쪽 고리(mounts "slot" 자리, 로컬 y = 0.08). 손잡이 ≈ (0, 0.05, 0) 기둥 중간.
// 물리에는 안 들어간다(EquipmentManager.bodyBoxes 가 mounts 있는 장비를 뺌) — 모양은 순전히 보기용.
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildGlb } from './glbWriter.mjs';

const MOUNT_Y = 0.08;

const MATERIALS = {
  iron: { color: '#33383d', metallic: 0.3, roughness: 0.6 },
  brass: { color: '#8a6a35', metallic: 0.4, roughness: 0.45 },
};

const parts = [];
const add = (geometry, material) => parts.push({ geometry, material });

// 받침대
add(new THREE.BoxGeometry(0.05, 0.015, 0.05).translate(0, 0.0075, 0), 'iron');
// 기둥
add(new THREE.CylinderGeometry(0.006, 0.007, MOUNT_Y - 0.015, 12).translate(0, 0.015 + (MOUNT_Y - 0.015) / 2, 0), 'iron');
// 위쪽 고리(3/4 만 — 나머지는 장비를 끼우는 틈): 수평으로 눕힌 토러스
add(
  new THREE.TorusGeometry(0.024, 0.004, 8, 16, Math.PI * 1.5).rotateX(Math.PI / 2).rotateY(Math.PI * 0.75).translate(0, MOUNT_Y, 0),
  'brass',
);
// 틈 옆의 작은 나사(손잡이): 고리가 열린 쪽에 튀어나온 손잡이
add(new THREE.CylinderGeometry(0.003, 0.003, 0.014, 8).rotateZ(Math.PI / 2).translate(0.03, MOUNT_Y, -0.017), 'brass');

const { bytes, triangles } = buildGlb('clamp', parts, MATERIALS);
writeFileSync(new URL('../../public/models/clamp.glb', import.meta.url), bytes);
console.log(`clamp.glb: ${bytes.length} bytes, ${triangles} triangles`);
