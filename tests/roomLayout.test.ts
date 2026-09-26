// 방 배치·벽 충돌 테스트 (물리 규칙 아님, 기하 배치). 기대값은 손계산 가능한 단순 값.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPlaceholderBox } from '../src/assets/placeholder';
import { clampToRoom, floorPlacement, wallPlacements, type Placement } from '../src/room/roomLayout';

const room = { widthM: 10, depthM: 8, heightM: 3 };

/** 배치를 실제 상자로 만들어 월드 바운딩박스를 구한다. */
function worldBox(p: Placement): THREE.Box3 {
  const m = createPlaceholderBox(p.sizeM, '#000000');
  m.position.set(...p.positionM);
  m.rotation.y = p.rotationYRad;
  m.updateMatrixWorld();
  return new THREE.Box3().setFromObject(m);
}

describe('floorPlacement', () => {
  it('바닥 윗면 y=0, 방 크기 10×8 을 덮는다', () => {
    const b = worldBox(floorPlacement(room, 0.05));
    expect(b.max.y).toBeCloseTo(0);
    expect(b.min.y).toBeCloseTo(-0.05);
    expect(b.max.x - b.min.x).toBeCloseTo(10);
    expect(b.max.z - b.min.z).toBeCloseTo(8);
  });
});

describe('wallPlacements', () => {
  const walls = wallPlacements(room, 0.1).map(worldBox);

  it('벽은 4개, 모두 바닥(y=0)부터 높이 3 m', () => {
    expect(walls).toHaveLength(4);
    for (const b of walls) {
      expect(b.min.y).toBeCloseTo(0);
      expect(b.max.y).toBeCloseTo(3);
    }
  });
  it('안쪽 면이 방 경계에 닿는다: 북 z=-4, 남 z=+4, 서 x=-5, 동 x=+5', () => {
    const [n, s, w, e] = walls;
    expect(n.max.z).toBeCloseTo(-4);
    expect(s.min.z).toBeCloseTo(4);
    expect(w.max.x).toBeCloseTo(-5);
    expect(e.min.x).toBeCloseTo(5);
  });
  it('벽 두께 0.1 m 는 방 바깥쪽으로 난다', () => {
    const [n, , , e] = walls;
    expect(n.min.z).toBeCloseTo(-4.1);
    expect(e.max.x).toBeCloseTo(5.1);
  });
});

describe('clampToRoom', () => {
  it('방 안쪽은 그대로', () => {
    expect(clampToRoom(1, -2, room, 0.3)).toEqual({ xM: 1, zM: -2 });
  });
  it('방 밖 좌표는 벽에서 반지름만큼 안쪽으로: x ±(5-0.3)=±4.7, z ±(4-0.3)=±3.7', () => {
    const p = clampToRoom(20, -20, room, 0.3);
    expect(p.xM).toBeCloseTo(4.7);
    expect(p.zM).toBeCloseTo(-3.7);
    const q = clampToRoom(-20, 20, room, 0.3);
    expect(q.xM).toBeCloseTo(-4.7);
    expect(q.zM).toBeCloseTo(3.7);
  });
});
