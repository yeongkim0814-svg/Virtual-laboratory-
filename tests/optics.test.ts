// 물리 규칙: 레이저 1단계. 기대값은 사용자 승인 값(R1 직진, R2 켜짐 조건, R4 파장 → 색).
import { describe, expect, it } from 'vitest';
import { laserOn, traceRay, wavelengthToRgb, type Face, type OrientedBox } from '../src/physics/optics';

const room = { widthM: 10, depthM: 10, heightM: 3 };
const o: [number, number, number] = [0, 0.85, 0];
const d: [number, number, number] = [1, 0, 0];
const c30 = Math.cos(Math.PI / 6);
const s30 = Math.sin(Math.PI / 6);
/** 면: 중심, 바깥 법선(빛이 들어오는 쪽), 가로축 u, 반폭·반높이. */
const face = (center: [number, number, number], normal: [number, number, number], u: [number, number, number], hw: number, hh = 0.1): Face =>
  ({ id: 'screen/face', centerM: center, normal, uAxis: u, halfWidthM: hw, halfHeightM: hh });

describe('R1 직진: p(t) = o + t·d, 면과 만나는 t = (p₀ − o)·n / (d·n), 가장 작은 양의 t', () => {
  it('#1 스크린 면 x = 1 → 닿음, t = 1.000, 면 중심에서 0', () => {
    const r = traceRay(o, d, [face([1, 0.85, 0], [-1, 0, 0], [0, 0, 1], 0.1)], [], room);
    expect(r.hit).toEqual(expect.objectContaining({ kind: 'face', id: 'screen/face' }));
    expect(r.tM).toBeCloseTo(1, 6);
    expect(r.hit.kind === 'face' && Math.hypot(r.hit.u, r.hit.v)).toBeCloseTo(0, 6);
  });
  it('#2 사이에 상자(x 0.4~0.6) → x = 0.4 에서 멈춤, 스크린은 못 받음', () => {
    const box: OrientedBox = { id: 'block', centerM: [0.5, 0.85, 0], halfM: [0.1, 0.1, 0.1], yawRad: 0 };
    const r = traceRay(o, d, [face([1, 0.85, 0], [-1, 0, 0], [0, 0, 1], 0.1)], [box], room);
    expect(r.hit).toEqual({ kind: 'box', id: 'block' });
    expect(r.tM).toBeCloseTo(0.4, 6);
    expect(r.pointM[0]).toBeCloseTo(0.4, 6);
  });
  it('#3 30° 기울인 스크린(중심 (1, 0.85, 0.2), 반폭 0.25) → t = 1.115470, 면 중심에서 0.230940', () => {
    const r = traceRay(o, d, [face([1, 0.85, 0.2], [-c30, 0, -s30], [-s30, 0, c30], 0.25)], [], room);
    expect(r.hit.kind).toBe('face');
    expect(r.tM).toBeCloseTo(1.11547, 5);
    expect(r.hit.kind === 'face' && Math.hypot(r.hit.u, r.hit.v)).toBeCloseTo(0.23094, 5);
  });
  it('#4 스크린을 z = 0.3 으로(반폭 0.1) → 못 닿음, 벽(x = 5)까지 길이 5.0', () => {
    const r = traceRay(o, d, [face([1, 0.85, 0.3], [-1, 0, 0], [0, 0, 1], 0.1)], [], room);
    expect(r.hit).toEqual({ kind: 'room' });
    expect(r.tM).toBeCloseTo(5, 6);
  });
  it('#5 빛이 면과 나란함(d·n = 0) → 닿지 않음', () => {
    const r = traceRay(o, d, [face([1, 0.85, 0], [0, 0, -1], [1, 0, 0], 0.5)], [], room);
    expect(r.hit.kind).toBe('room');
  });
});

describe('R2 레이저 켜짐: 입력 전압 ≥ 정격 5 V', () => {
  it('4.9 V 꺼짐, 5.0 V 켜짐, 12 V 켜짐, 입력 없음(null) 꺼짐', () => {
    expect(laserOn(4.9, 5)).toBe(false);
    expect(laserOn(5.0, 5)).toBe(true);
    expect(laserOn(12, 5)).toBe(true);
    expect(laserOn(null, 5)).toBe(false);
  });
});

describe('R4 파장 → 빔 색 (Bruton 1996 근사, 보기용)', () => {
  const rgb = (nm: number) => wavelengthToRgb(nm * 1e-9);
  it('650 nm → (1, 0, 0)', () => expectRgb(rgb(650), [1, 0, 0]));
  it('532 nm → (0.314286, 1, 0)', () => expectRgb(rgb(532), [0.314286, 1, 0]));
  it('470 nm → (0, 0.6, 1)', () => expectRgb(rgb(470), [0, 0.6, 1]));
  it('405 nm → (0.430208, 0, 0.7375)', () => expectRgb(rgb(405), [0.430208, 0, 0.7375]));
});

function expectRgb(a: [number, number, number], b: [number, number, number]): void {
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5));
}
