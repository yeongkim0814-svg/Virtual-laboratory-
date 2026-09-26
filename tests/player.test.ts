// 플레이어 앉기 테스트 (조작 규칙, 물리 규칙 아님).
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { LabFile } from '../src/config/types';
import { Player } from '../src/player/player';

const lab = JSON.parse(readFileSync('public/lab.json', 'utf8')) as LabFile;
const make = () => {
  const cam = new THREE.PerspectiveCamera();
  return { cam, p: new Player(cam, lab) };
};
const run = (p: Player, s: number, move = { x: 0, y: 0 }) => {
  for (let t = 0; t < s - 1e-9; t += 0.01) p.update(0.01, move, { x: 0, y: 0 });
};

describe('Player 앉기', () => {
  it('앉으면 눈높이가 전환 시간(0.25 s) 동안 1.6 → 0.9, 일어나면 다시 1.6', () => {
    const { cam, p } = make();
    p.crouching = true;
    run(p, 0.1);
    expect(cam.position.y).toBeCloseTo(1.6 - 0.7 * (0.1 / 0.25), 5); // 1.32
    run(p, 0.2);
    expect(cam.position.y).toBeCloseTo(0.9);
    p.crouching = false;
    run(p, 0.3);
    expect(cam.position.y).toBeCloseTo(1.6);
  });
  it('앉아서 걸으면 속도 절반: 1 s 동안 1.5 → 0.75 m (막힌 것 없는 뒤쪽으로)', () => {
    const a = make();
    const b = make();
    b.p.crouching = true;
    run(a.p, 1, { x: 0, y: -1 });
    run(b.p, 1, { x: 0, y: -1 });
    const start = lab.player.startPositionM[2];
    expect(a.cam.position.z - start).toBeCloseTo(1.5, 2);
    expect(b.cam.position.z - start).toBeCloseTo(0.75, 2);
  });
});
