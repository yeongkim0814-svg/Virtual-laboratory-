// 실험 세팅(장비 종류·위치·회전·수치) JSON 직렬화 / 역직렬화. 순수 함수.

import type { Vec3 } from '../config/types';
import type { EquipmentDefinition } from './types';

export const SETUP_VERSION = 1;

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
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNum);

/**
 * 세팅 JSON 을 검증·정규화한다.
 * - 알 수 없는 장비 종류, 중복 id, 잘못된 좌표 → 오류
 * - 빠진 param → 정의의 default, 범위 밖 param → [min, max] 로 자름
 * - 정의에 없는 param 키 → 오류
 */
export function parseSetup(
  raw: unknown,
  definitions: ReadonlyMap<string, EquipmentDefinition>,
): SetupFile {
  if (typeof raw !== 'object' || raw === null) throw new Error('세팅: 객체가 아님');
  const r = raw as { version?: unknown; equipment?: unknown };
  if (r.version !== SETUP_VERSION) throw new Error(`세팅: 지원하지 않는 version ${String(r.version)}`);
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

  return { version: SETUP_VERSION, equipment };
}

/** 세팅 → JSON 문자열 (사람이 읽기 쉽게 들여쓰기). */
export function serializeSetup(equipment: readonly SetupItem[]): string {
  const file: SetupFile = {
    version: SETUP_VERSION,
    equipment: equipment.map((e) => ({
      id: e.id,
      type: e.type,
      positionM: [...e.positionM],
      rotationYDeg: e.rotationYDeg,
      params: { ...e.params },
    })),
  };
  return JSON.stringify(file, null, 2);
}
