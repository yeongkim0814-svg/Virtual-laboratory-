import type { Vec3 } from '../config/types';

/**
 * 장비 로컬 좌표 → 월드 좌표. 장비는 y축 회전만 한다.
 * three.js 의 rotation.y 와 같은 방향: (x, z) → (x cosθ + z sinθ, −x sinθ + z cosθ)
 */
export function localToWorld(localM: Vec3, positionM: Vec3, rotationYRad: number): Vec3 {
  const [x, y, z] = localM;
  const c = Math.cos(rotationYRad);
  const s = Math.sin(rotationYRad);
  return [positionM[0] + x * c + z * s, positionM[1] + y, positionM[2] - x * s + z * c];
}
