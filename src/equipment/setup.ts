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
}

export interface SetupFile {
  version: number;
  equipment: SetupItem[];
  cables: Cable[];
  /** 찬장 재고(찬장 id → 종류 → 개수). 없으면 lab.json 의 처음 재고. */
  cupboards?: Record<string, Record<string, number>>;
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
): SetupFile {
  if (typeof raw !== 'object' || raw === null) throw new Error('세팅: 객체가 아님');
  const r = raw as { version?: unknown; equipment?: unknown; cables?: unknown; cupboards?: unknown };
  if (r.version !== 1 && r.version !== SETUP_VERSION) throw new Error(`세팅: 지원하지 않는 version ${String(r.version)}`);
  if (!Array.isArray(r.equipment)) throw new Error('세팅: equipment 배열이 없음');

  const ids = new Set<string>();
  const equipment = r.equipment.map((item: unknown, i): SetupItem => {
    const e = item as Partial<SetupItem>;
    const where = `세팅 equipment[${i}]`;
    if (typeof e.id !== 'string' || e.id === '') throw new Error(`${where}: id 없음`);
    if (ids.has(e.id)) throw new Error(`${where}: 중복 id ${e.id}`);
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
      params[p.key] = isNum(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default;
    }
    return { id: e.id, type: def.type, positionM: [...e.positionM], rotationYDeg, params };
  });

  const typeOf = new Map(equipment.map((e) => [e.id, e.type]));
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

  let cupboards: Record<string, Record<string, number>> | undefined;
  if (r.cupboards !== undefined) {
    if (typeof r.cupboards !== 'object' || r.cupboards === null) throw new Error('세팅: cupboards 는 객체');
    cupboards = {};
    for (const [id, stock] of Object.entries(r.cupboards as Record<string, unknown>)) {
      if (typeof stock !== 'object' || stock === null) throw new Error(`세팅 cupboards.${id}: 객체가 아님`);
      cupboards[id] = {};
      for (const [type, n] of Object.entries(stock as Record<string, unknown>)) {
        if (!definitions.has(type)) throw new Error(`세팅 cupboards.${id}: 알 수 없는 장비 종류 ${type}`);
        if (!Number.isInteger(n) || (n as number) < 0) throw new Error(`세팅 cupboards.${id}.${type}: 0 이상 정수`);
        cupboards[id][type] = n as number;
      }
    }
  }

  return { version: SETUP_VERSION, equipment, cables, ...(cupboards ? { cupboards } : {}) };
}

/** 세팅 → JSON 문자열 (사람이 읽기 쉽게 들여쓰기). */
export function serializeSetup(
  equipment: readonly SetupItem[],
  cables: readonly Cable[] = [],
  cupboards?: Record<string, Record<string, number>>,
): string {
  const file: SetupFile = {
    version: SETUP_VERSION,
    equipment: equipment.map((e) => ({
      id: e.id,
      type: e.type,
      positionM: [...e.positionM],
      rotationYDeg: e.rotationYDeg,
      params: { ...e.params },
    })),
    cables: cables.map((c) => ({ from: { ...c.from }, to: { ...c.to } })),
    ...(cupboards ? { cupboards } : {}),
  };
  return JSON.stringify(file, null, 2);
}
