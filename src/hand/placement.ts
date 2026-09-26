// 배치 스냅: 손에 든 장비의 포트가 이미 놓인 장비의 포트 근처면 맞닿도록 수평 이동.
// (접촉 라우터의 허용 거리가 작아서, 손으로 대충 놓아도 연결될 수 있게 한다.)

import type { Vec3 } from '../config/types';
import { localToWorld } from '../equipment/ports';
import type { PortDef } from '../equipment/types';
import type { PortRef } from '../signal/signalBus';

export interface PlacementPose {
  positionM: Vec3;
  yawRad: number;
}

export interface SnapResult {
  pose: PlacementPose;
  /** 스냅된 경우 연결될 포트 쌍. */
  snapped: { heldPortId: string; target: PortRef } | null;
}

/**
 * 조건: 같은 채널, 반대 방향(out↔in), 수평 거리 ≤ snapRadiusM, 높이 차 ≤ snapRadiusM.
 * 여러 쌍이 가능하면 수평 거리가 가장 가까운 쌍. 높이(y)는 바꾸지 않는다(바닥에서 뜨지 않게).
 */
export function snapPlacement(
  heldPorts: readonly PortDef[],
  pose: PlacementPose,
  placedPorts: readonly PortRef[],
  snapRadiusM: number,
): SnapResult {
  let best: { d: number; dx: number; dz: number; heldPortId: string; target: PortRef } | null = null;
  for (const hp of heldPorts) {
    const w = localToWorld(hp.positionM, pose.positionM, pose.yawRad);
    for (const t of placedPorts) {
      if (t.channel !== hp.channel || t.direction === hp.direction) continue;
      const dx = t.worldPosM[0] - w[0];
      const dz = t.worldPosM[2] - w[2];
      const d = Math.hypot(dx, dz);
      if (d > snapRadiusM || Math.abs(t.worldPosM[1] - w[1]) > snapRadiusM) continue;
      if (!best || d < best.d) best = { d, dx, dz, heldPortId: hp.id, target: t };
    }
  }
  if (!best) return { pose, snapped: null };
  const [x, y, z] = pose.positionM;
  return {
    pose: { positionM: [x + best.dx, y, z + best.dz], yawRad: pose.yawRad },
    snapped: { heldPortId: best.heldPortId, target: best.target },
  };
}
