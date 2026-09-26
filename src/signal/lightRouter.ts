import type { RoomSize, Vec3 } from '../config/types';
import { traceRay, type Face, type OrientedBox, type TraceResult } from '../physics/optics';
import type { Signal } from './channels';
import { portKey, type PortRef, type Router } from './signalBus';

/** 이번 프레임에 나간 빛 하나(그리기용). */
export interface Beam {
  fromDeviceId: string;
  originM: Vec3;
  trace: TraceResult;
  wavelengthM: number;
  powerW: number;
}

const UP: Vec3 = [0, 1, 0];

/**
 * Light 채널 라우터: 출력 포트(레이저 출구)에서 광선을 쏴서(R1 직진) 처음 닿는 것을 찾는다.
 * 받는 면(Light 입력 포트)이면 그 포트로 신호를 그대로 전달(R3 손실 없음), 장비 몸체·가구·벽이면 멈춘다.
 * 장비끼리는 여전히 서로를 모른다 — 라우터가 포트 위치·방향과 몸체 상자만 본다.
 */
export class LightRouter {
  /** 이번 프레임의 빛들. 매 프레임 beginFrame() 으로 비운 뒤 장비 갱신 중에 채워진다. */
  beams: Beam[] = [];

  constructor(
    private readonly world: {
      bodyBoxes(): OrientedBox[];
      furnitureBoxes: readonly OrientedBox[];
      room: RoomSize;
    },
  ) {}

  beginFrame(): void {
    this.beams = [];
  }

  readonly router: Router = (from: PortRef, inputs: readonly PortRef[], signal: Signal): PortRef[] => {
    if (!from.worldDirM) return [];
    const faces: Face[] = [];
    const byFace = new Map<string, PortRef>();
    for (const p of inputs) {
      if (p.channel !== 'Light' || !p.worldDirM || !p.faceSizeM || p.deviceId === from.deviceId) continue;
      const n = p.worldDirM;
      const u = normalize(cross(UP, n));
      const id = portKey(p.deviceId, p.portId);
      faces.push({ id, centerM: p.worldPosM, normal: n, uAxis: u, halfWidthM: p.faceSizeM[0] / 2, halfHeightM: p.faceSizeM[1] / 2 });
      byFace.set(id, p);
    }
    const boxes = [...this.world.bodyBoxes().filter((b) => b.id !== from.deviceId), ...this.world.furnitureBoxes];
    const trace = traceRay(from.worldPosM, normalize(from.worldDirM), faces, boxes, this.world.room);
    this.beams.push({
      fromDeviceId: from.deviceId,
      originM: from.worldPosM,
      trace,
      wavelengthM: signal.values.wavelengthM ?? 0,
      powerW: signal.values.powerW ?? 0,
    });
    const target = trace.hit.kind === 'face' ? byFace.get(trace.hit.id) : undefined;
    return target ? [target] : [];
  };
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(...v);
  return l < 1e-12 ? v : [v[0] / l, v[1] / l, v[2] / l];
}
