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

/**
 * 텍스처(손그림 아틀라스) 1장 + 재질 1개(에셋 규칙: 재질 1개 + 텍스처 1장)로 만드는 glTF 2.0 바이너리.
 * parts: [{ geometry(position·normal·uv 모두 있어야 함), smooth?: true(인덱스 유지 → 공유 정점, 곡면이 매끈)
 *   / false·생략(면마다 분리 → 평평한 모서리) }]
 * 재질은 비발광 PBR(발광은 GlowView 가 에셋 "<이름>-glow" 로 따로 처리).
 */
export function buildTexturedGlb(name, parts, atlasPng) {
  // smooth: 인덱스가 있는 동안(공유 정점) 법선을 계산해 곡면을 매끈하게, 그 다음 병합을 위해 비인덱스화.
  // flat(기본): 먼저 비인덱스화(삼각형마다 분리)한 뒤 법선을 계산해 평평한 모서리로.
  const geos = parts.map((p) => {
    let g = p.geometry.clone();
    if (p.smooth) {
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      if (g.index) g = g.toNonIndexed();
      return g;
    }
    if (g.index) g = g.toNonIndexed();
    g.deleteAttribute('normal');
    g.computeVertexNormals();
    return g;
  });
  const merged = mergeGeometries(geos, false);
  const pos = merged.getAttribute('position').array;
  const nor = merged.getAttribute('normal').array;
  const uv = merged.getAttribute('uv').array;
  const indices = merged.index ? merged.index.array : null;
  const triangles = (indices ? indices.length : pos.length / 3) / 3;

  const chunks = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const addView = (arr, target) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    chunks.push(bytes);
    offset += bytes.byteLength;
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      offset += pad;
    }
    return bufferViews.length - 1;
  };
  const minMax = (arr, n) => {
    const min = new Array(n).fill(Infinity);
    const max = new Array(n).fill(-Infinity);
    for (let i = 0; i < arr.length; i += n) for (let k = 0; k < n; k++) {
      min[k] = Math.min(min[k], arr[i + k]);
      max[k] = Math.max(max[k], arr[i + k]);
    }
    return { min, max };
  };

  const posView = addView(new Float32Array(pos), 34962);
  const { min, max } = minMax(pos, 3);
  accessors.push({ bufferView: posView, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
  const norView = addView(new Float32Array(nor), 34962);
  accessors.push({ bufferView: norView, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
  const uvView = addView(new Float32Array(uv), 34962);
  accessors.push({ bufferView: uvView, componentType: 5126, count: uv.length / 2, type: 'VEC2' });
  const primitive = { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, material: 0 };
  if (indices) {
    const idxArr = pos.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    const idxView = addView(idxArr, 34963);
    accessors.push({ bufferView: idxView, componentType: idxArr instanceof Uint32Array ? 5125 : 5123, count: idxArr.length, type: 'SCALAR' });
    primitive.indices = 3;
  }
  const imgView = addView(new Uint8Array(atlasPng.buffer ?? atlasPng, atlasPng.byteOffset ?? 0, atlasPng.byteLength ?? atlasPng.length));

  const json = {
    asset: { version: '2.0', generator: 'virtual-laboratory tools/models' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives: [primitive] }],
    materials: [{ name: 'atlas', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0.15, roughnessFactor: 0.7 } }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: [{ bufferView: imgView, mimeType: 'image/png' }],
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
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const b = 20 + jsonBytes.length;
  dv.setUint32(b, bin.length, true);
  dv.setUint32(b + 4, 0x004e4942, true);
  out.set(bin, b + 8);
  return { bytes: out, triangles };
}
