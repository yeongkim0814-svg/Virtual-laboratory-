// 에셋 제작 도구(앱 코드 아님): 재질별로 합친 삼각형 메시 → glTF 2.0 바이너리(.glb).
// 법선은 면마다(플랫 셰이딩), 색은 단색 PBR(비발광).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** parts: [{ geometry: THREE.BufferGeometry(변환 적용된 것), material: 이름 }] */
export function buildGlb(name, parts, materials) {
  const byMat = new Map();
  for (const p of parts) {
    const g = (p.geometry.index ? p.geometry.toNonIndexed() : p.geometry).clone();
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g.computeVertexNormals(); // 인덱스 없는 삼각형 → 면 법선(플랫)
    if (!byMat.has(p.material)) byMat.set(p.material, []);
    byMat.get(p.material).push(g);
  }
  const matNames = [...byMat.keys()];
  const chunks = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  let triangles = 0;
  const addView = (arr) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target: 34962 });
    chunks.push(bytes);
    offset += bytes.byteLength;
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      offset += pad;
    }
    return bufferViews.length - 1;
  };
  matNames.forEach((m, mi) => {
    const g = mergeGeometries(byMat.get(m));
    const pos = g.getAttribute('position').array;
    const nor = g.getAttribute('normal').array;
    triangles += pos.length / 9;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k]);
      max[k] = Math.max(max[k], pos[i + k]);
    }
    const pv = addView(new Float32Array(pos));
    accessors.push({ bufferView: pv, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
    const nv = addView(new Float32Array(nor));
    accessors.push({ bufferView: nv, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
    meshes.push({ name: m, primitives: [{ attributes: { POSITION: accessors.length - 2, NORMAL: accessors.length - 1 }, material: mi }] });
  });
  const toLinear = (c) => new THREE.Color(c).convertSRGBToLinear();
  const json = {
    asset: { version: '2.0', generator: 'virtual-laboratory tools/models' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, children: meshes.map((_, i) => i + 1) }, ...meshes.map((m, i) => ({ name: m.name, mesh: i }))],
    meshes,
    materials: matNames.map((m) => {
      const s = materials[m];
      const c = toLinear(s.color);
      return {
        name: m,
        pbrMetallicRoughness: { baseColorFactor: [c.r, c.g, c.b, 1], metallicFactor: s.metallic, roughnessFactor: s.roughness },
      };
    }),
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  jsonBytes = new Uint8Array([...jsonBytes, ...new Array(jpad).fill(0x20)]);
  const bin = new Uint8Array(offset);
  let o = 0;
  for (const c of chunks) {
    bin.set(c, o);
    o += c.byteLength;
  }
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonBytes, 20);
  const b = 20 + jsonBytes.length;
  dv.setUint32(b, bin.length, true);
  dv.setUint32(b + 4, 0x004e4942, true); // 'BIN'
  out.set(bin, b + 8);
  return { bytes: out, triangles };
}
