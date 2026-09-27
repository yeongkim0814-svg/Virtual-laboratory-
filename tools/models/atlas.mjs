// 에셋 제작 도구(앱 코드 아님): 손그림 느낌의 작은 색상 아틀라스를 절차적으로 그린다(이미지 편집 없이).
// 재질마다 세로 칸(swatch) 하나: 위(밝음) → 아래(어두움) 그러데이션(뭉툭한 음영) + 점 잡음(붓자국) + 얼룩(때·녹).
// 모델은 재질 1개 + 이 텍스처 1장만 쓴다(에셋 규칙). 열 수 × cellPx = 텍스처 가로, 세로는 gridH.
import { encodePng } from './png.mjs';

/** xorshift32 — 시드 고정 의사난수(빌드마다 같은 결과). */
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0xffffffff;
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * colors: { 이름: '#rrggbb' } 순서대로 칸을 배정. → { rgba, width, height, uOf(name): 칸 중심 u }
 * cellPx 는 칸 하나의 가로 폭(정사각형에 가깝게 유지하려고 세로 gridH 와 별도 지정 가능).
 */
export function buildAtlas(colors, { cellPx = 32, gridH = 128, seed = 1 } = {}) {
  const names = Object.keys(colors);
  const width = names.length * cellPx;
  const height = gridH;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const rand = rng(seed);

  names.forEach((name, ci) => {
    const [r, g, b] = hexToRgb(colors[name]);
    // 얼룩(때·녹) 몇 개: 칸 안의 원형 어두운 반점 — 손으로 칠한 듯한 불균일함
    const blotches = Array.from({ length: 3 + Math.floor(rand() * 3) }, () => ({
      x: rand() * cellPx,
      y: rand() * gridH,
      r: gridH * (0.08 + rand() * 0.12),
      dark: 0.55 + rand() * 0.3,
    }));
    for (let y = 0; y < height; y++) {
      // 그러데이션: 위(밝게, 1.15배) → 아래(어둡게, 0.75배) — 뭉툭한 음영(마스킹 페인트 느낌)
      const t = y / (height - 1);
      let shade = 1.15 - t * 0.4;
      for (let x = 0; x < cellPx; x++) {
        const px = ci * cellPx + x;
        let local = shade;
        local += (rand() - 0.5) * 0.06; // 붓자국 잡음
        for (const bl of blotches) {
          const d = Math.hypot(x - bl.x, y - bl.y);
          if (d < bl.r) local *= 1 - (1 - d / bl.r) * (1 - bl.dark);
        }
        const idx = (y * width + px) * 4;
        rgba[idx] = r * local;
        rgba[idx + 1] = g * local;
        rgba[idx + 2] = b * local;
        rgba[idx + 3] = 255;
      }
    }
  });

  const uOf = (name) => {
    const i = names.indexOf(name);
    if (i < 0) throw new Error(`atlas: 없는 색 ${name}`);
    return (i + 0.5) / names.length;
  };
  return { png: encodePng(width, height, rgba), width, height, uOf };
}
