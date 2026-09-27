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
  /** 신호 값 전체(슬릿을 지난 빛이면 slitSpacingM·slitWidthM 포함). */
  values: Readonly<Record<string, number>>;
  /** 받는 면에 닿았으면 그 면(무늬 그리기용). */
  face?: Face;
  /** 닿은 면의 포트(장비 id·포트 id). */
  target?: PortRef;
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
  /**
   * 받는 면(portKey)에 마지막으로 닿은 광선: 닿은 점·방향. continuesFrom 출력이 이어서 쏠 때 쓴다.
   * 신호가 한 프레임 늦게 도착하므로 프레임을 넘어 유지한다(덮어쓰기).
   */
  private readonly arrivals = new Map<string, { pointM: Vec3; dirM: Vec3 }>();

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
    // 빛을 "지나보내는" 출력(슬릿): 입력 면에 닿은 광선을 그 점에서 같은 방향으로 잇는다(R1 직진)
    const arrival = from.continuesFrom ? this.arrivals.get(portKey(from.deviceId, from.continuesFrom)) : undefined;
    if (from.continuesFrom && !arrival) return [];
    // 이어지는 광선은 같은 직선을 따라 출력 면(출력 포트를 지나고 출력 방향에 수직인 면)까지 간 점에서 출발
    // → 수직 입사면 예전처럼 슬릿 앞면에서 출발(승인값 L 유지), 비스듬하면 같은 직선 위 앞면의 점
    const originM = arrival ? pointOnPlane(arrival.pointM, arrival.dirM, from.worldPosM, from.worldDirM) : from.worldPosM;
    const dirM = arrival ? arrival.dirM : from.worldDirM;
    if (!dirM) return [];
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
    const dir = normalize(dirM);
    const trace = traceRay(originM, dir, faces, boxes, this.world.room);
    const hit = trace.hit;
    const target = hit.kind === 'face' ? byFace.get(hit.id) : undefined;
    if (target) this.arrivals.set(portKey(target.deviceId, target.portId), { pointM: trace.pointM, dirM: dir });
    this.beams.push({
      fromDeviceId: from.deviceId,
      originM,
      trace,
      wavelengthM: signal.values.wavelengthM ?? 0,
      powerW: signal.values.powerW ?? 0,
      values: signal.values,
      face: hit.kind === 'face' ? faces.find((f) => f.id === hit.id) : undefined,
      target,
    });
    return target ? [target] : [];
  };
}

/** p 에서 d 방향 직선이 (q 를 지나고 법선 n 인) 면과 만나는 점. 면과 나란하거나 n 이 없으면 p. */
function pointOnPlane(p: Vec3, d: Vec3, q: Vec3, n: Vec3 | undefined): Vec3 {
  if (!n) return p;
  const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
  if (Math.abs(dn) < 1e-9) return p;
  const t = ((q[0] - p[0]) * n[0] + (q[1] - p[1]) * n[1] + (q[2] - p[2]) * n[2]) / dn;
  return [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(...v);
  return l < 1e-12 ? v : [v[0] / l, v[1] / l, v[2] / l];
}
