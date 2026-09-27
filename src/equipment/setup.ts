// 실험 세팅(장비 종류·위치·회전·수치, 케이블) JSON 직렬화 / 역직렬화. 순수 함수.
// version 1: 장비만 / version 2: 장비 + 케이블. 1 도 읽을 수 있다(케이블 없음).

import type { Vec3 } from '../config/types';
import { checkCable, portLookup, type Cable } from '../signal/cables';
import type { EquipmentDefinition } from './types';

export const SETUP_VERSION = 2;

export interface SetupItem {
  id: string;
  type: string;
  positionM: Vec3;
  rotationYDeg: number;
  params: Record<string, number>;
  /**
   * 클램프 등에 끼워져 있으면: 그 장비 id·mounts id(mountable 장비만).
   * 위치는 저장돼도 무시되고, 불러올 때 끼운 장비의 자리로 다시 계산된다(EquipmentManager.validate).
   */
  mountedOn?: { deviceId: string; mountId: string };
}

export interface SetupFile {
  version: number;
  equipment: SetupItem[];
  cables: Cable[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNum);

/**
 * 세팅 JSON 을 검증·정규화한다.
 * - 알 수 없는 장비 종류, 중복 id, 잘못된 좌표 → 오류
 * - 빠진 param → 정의의 default, 범위 밖 param → [min, max] 로 자름
 * - 정의에 없는 param 키 → 오류
 * - 케이블: 없는 장비·포트, 채널·방향 불일치, 포트 하나에 케이블 둘 → 오류
 */
export function parseSetup(
  raw: unknown,
  definitions: ReadonlyMap<string, EquipmentDefinition>,
  /** 방에 고정된 장비(lab.json fixtures). id 가 겹치면 안 되고, 케이블은 이들에도 꽂을 수 있다. */
  fixtures: readonly { id: string; type: string }[] = [],
): SetupFile {
  if (typeof raw !== 'object' || raw === null) throw new Error('세팅: 객체가 아님');
  const r = raw as { version?: unknown; equipment?: unknown; cables?: unknown };
  if (r.version !== 1 && r.version !== SETUP_VERSION) throw new Error(`세팅: 지원하지 않는 version ${String(r.version)}`);
  if (!Array.isArray(r.equipment)) throw new Error('세팅: equipment 배열이 없음');

  const ids = new Set<string>(fixtures.map((f) => f.id));
  const equipment = r.equipment.map((item: unknown, i): SetupItem => {
    const e = item as Partial<SetupItem>;
    const where = `세팅 equipment[${i}]`;
    if (typeof e.id !== 'string' || e.id === '') throw new Error(`${where}: id 없음`);
    if (ids.has(e.id)) throw new Error(`${where}: 중복 id ${e.id}(고정 장비 id 와도 겹치면 안 됨)`);
    ids.add(e.id);
    const def = typeof e.type === 'string' ? definitions.get(e.type) : undefined;
    if (!def) throw new Error(`${where}: 알 수 없는 장비 종류 ${String(e.type)}`);
    if (!isVec3(e.positionM)) throw new Error(`${where}: positionM 은 숫자 3개`);
    const rotationYDeg = e.rotationYDeg ?? 0;
    if (!isNum(rotationYDeg)) throw new Error(`${where}: rotationYDeg 는 숫자`);

    const given = e.params ?? {};
    for (const k of Object.keys(given)) {
      if (!def.params.some((p) => p.key === k)) throw new Error(`${where}: ${def.type} 에 없는 param ${k}`);
    }
    const params: Record<string, number> = {};
    for (const p of def.params) {
      const v = given[p.key];
      if (!isNum(v)) params[p.key] = p.default;
      else if (p.options) params[p.key] = p.options.some((o) => o.value === v) ? v : p.default; // 없는 스위치 값 → 기본값
      else params[p.key] = Math.min(p.max, Math.max(p.min, v));
    }
    const rawMounted = (item as { mountedOn?: unknown }).mountedOn;
    let mountedOn: SetupItem['mountedOn'];
    if (rawMounted !== undefined) {
      const mo = rawMounted as Partial<{ deviceId: string; mountId: string }>;
      if (typeof mo.deviceId !== 'string' || typeof mo.mountId !== 'string') {
        throw new Error(`${where}: mountedOn 은 { deviceId, mountId }`);
      }
      mountedOn = { deviceId: mo.deviceId, mountId: mo.mountId };
    }
    if (!def.mountable && mountedOn) throw new Error(`${where}: mountedOn 은 mountable 장비에만`);
    return { id: e.id, type: def.type, positionM: [...e.positionM], rotationYDeg, params, ...(mountedOn ? { mountedOn } : {}) };
  });

  const typeOf = new Map([...fixtures, ...equipment].map((e) => [e.id, e.type]));
  // mountedOn 이 가리키는 장비·자리가 실제 있는지, 자리 하나를 두 장비가 쓰지 않는지.
  const claimedMounts = new Set<string>();
  for (const e of equipment) {
    if (!e.mountedOn) continue;
    const hostType = typeOf.get(e.mountedOn.deviceId);
    if (!hostType) throw new Error(`세팅: ${e.id} 의 mountedOn.deviceId ${e.mountedOn.deviceId} 없음`);
    const hostDef = definitions.get(hostType)!;
    if (!hostDef.mounts?.some((m) => m.id === e.mountedOn!.mountId)) {
      throw new Error(`세팅: ${e.id} 의 mountedOn.mountId ${e.mountedOn.mountId} 가 ${hostType} 에 없음`);
    }
    const key = `${e.mountedOn.deviceId}/${e.mountedOn.mountId}`;
    if (claimedMounts.has(key)) throw new Error(`세팅: mounts 자리 ${key} 를 두 장비가 씀`);
    claimedMounts.add(key);
  }
  const portOf = portLookup((id) => typeOf.get(id), definitions);
  const rawCables = r.version === 1 ? [] : r.cables ?? [];
  if (!Array.isArray(rawCables)) throw new Error('세팅: cables 는 배열');
  const cables: Cable[] = [];
  rawCables.forEach((c: unknown, i) => {
    const cc = c as Partial<Cable>;
    const ok = (a: unknown): a is { deviceId: string; portId: string } =>
      typeof a === 'object' && a !== null && typeof (a as { deviceId?: unknown }).deviceId === 'string' &&
      typeof (a as { portId?: unknown }).portId === 'string';
    if (!ok(cc.from) || !ok(cc.to)) throw new Error(`세팅 cables[${i}]: from/to 는 { deviceId, portId }`);
    const check = checkCable(cc.from, cc.to, portOf, cables);
    if (!check.ok) throw new Error(`세팅 cables[${i}]: 연결할 수 없음 (${check.reason})`);
    cables.push(check.cable);
  });

  return { version: SETUP_VERSION, equipment, cables };
}

/** 세팅 → JSON 문자열 (사람이 읽기 쉽게 들여쓰기). */
export function serializeSetup(equipment: readonly SetupItem[], cables: readonly Cable[] = []): string {
  const file: SetupFile = {
    version: SETUP_VERSION,
    equipment: equipment.map((e) => ({
      id: e.id,
      type: e.type,
      positionM: [...e.positionM],
      rotationYDeg: e.rotationYDeg,
      params: { ...e.params },
      ...(e.mountedOn ? { mountedOn: { ...e.mountedOn } } : {}),
    })),
    cables: cables.map((c) => ({ from: { ...c.from }, to: { ...c.to } })),
  };
  return JSON.stringify(file, null, 2);
}

/** lab.json fixtures → 세팅 항목(params 는 기본값). */
export function fixtureItems(
  fixtures: readonly { id: string; type: string; positionM: Vec3; rotationYDeg: number }[],
  definitions: ReadonlyMap<string, EquipmentDefinition>,
): SetupItem[] {
  return fixtures.map((f) => {
    const def = definitions.get(f.type);
    if (!def?.fixed) throw new Error(`lab.json fixtures: ${f.id} 의 종류 ${f.type} 는 고정 장비(fixed)가 아님`);
    return {
      id: f.id,
      type: f.type,
      positionM: [...f.positionM] as Vec3,
      rotationYDeg: f.rotationYDeg,
      params: Object.fromEntries(def.params.map((p) => [p.key, p.default])),
    };
  });
}
