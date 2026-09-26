// 배치 스냅 테스트 (기하, 물리 규칙 아님).
import { describe, expect, it } from 'vitest';
import { snapPlacement } from '../src/hand/placement';
import type { PortDef } from '../src/equipment/types';
import type { PortRef } from '../src/signal/signalBus';

const heldOut: PortDef[] = [{ id: 'out', channel: 'Electric', direction: 'out', positionM: [0.15, 0.1, 0] }];
const target = (pos: [number, number, number], over: Partial<PortRef> = {}): PortRef => ({
  deviceId: 'p', portId: 'in', channel: 'Electric', direction: 'in', worldPosM: pos, ...over,
});

describe('snapPlacement (반경 0.1 m)', () => {
  it('포트 사이 (0.05, 0, 0.02) → 그만큼 장비를 옮겨 맞닿게', () => {
    // 놓을 위치 (0.1, 0, 1) → out 포트 (0.25, 0.1, 1). 대상 in 포트 (0.3, 0.1, 1.02)
    const r = snapPlacement(heldOut, { positionM: [0.1, 0, 1], yawRad: 0 }, [target([0.3, 0.1, 1.02])], 0.1);
    expect(r.snapped?.target.deviceId).toBe('p');
    expect(r.pose.positionM[0]).toBeCloseTo(0.15);
    expect(r.pose.positionM[1]).toBeCloseTo(0);
    expect(r.pose.positionM[2]).toBeCloseTo(1.02);
  });
  it('반경 밖(0.2 m)이면 그대로', () => {
    const r = snapPlacement(heldOut, { positionM: [0.1, 0, 1], yawRad: 0 }, [target([0.45, 0.1, 1])], 0.1);
    expect(r.snapped).toBeNull();
    expect(r.pose.positionM).toEqual([0.1, 0, 1]);
  });
  it('채널이 다르거나 방향이 같으면(out↔out) 스냅 안 함', () => {
    const pose = { positionM: [0.1, 0, 1] as [number, number, number], yawRad: 0 };
    expect(snapPlacement(heldOut, pose, [target([0.26, 0.1, 1], { channel: 'Thermal' })], 0.1).snapped).toBeNull();
    expect(snapPlacement(heldOut, pose, [target([0.26, 0.1, 1], { direction: 'out' })], 0.1).snapped).toBeNull();
  });
  it('후보가 여럿이면 가장 가까운 것', () => {
    const r = snapPlacement(heldOut, { positionM: [0, 0, 0], yawRad: 0 }, [
      target([0.23, 0.1, 0], { deviceId: 'far' }),
      target([0.17, 0.1, 0], { deviceId: 'near' }),
    ], 0.1);
    expect(r.snapped?.target.deviceId).toBe('near');
    expect(r.pose.positionM[0]).toBeCloseTo(0.02);
  });
  it('회전된 채로 놓아도 회전 후 포트 위치로 판단: yaw 90° 면 out 포트는 (0, 0.1, −0.15)', () => {
    const r = snapPlacement(heldOut, { positionM: [0, 0, 0], yawRad: Math.PI / 2 }, [target([0.03, 0.1, -0.19])], 0.1);
    expect(r.pose.positionM[0]).toBeCloseTo(0.03);
    expect(r.pose.positionM[2]).toBeCloseTo(-0.04);
  });
});
