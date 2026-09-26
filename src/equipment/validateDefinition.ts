import { isChannel } from '../signal/channels';
import type { EquipmentDefinition } from './types';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 장비 정의 JSON 검증. 문제가 있으면 오류 메시지 목록을 돌려준다(없으면 빈 배열). */
export function validateDefinition(d: EquipmentDefinition): string[] {
  const errs: string[] = [];
  const at = `장비 정의 ${d.type ?? '(type 없음)'}`;
  if (typeof d.type !== 'string' || d.type === '') errs.push(`${at}: type 없음`);
  if (typeof d.asset !== 'string' || d.asset === '') errs.push(`${at}: asset 없음`);
  if (!Array.isArray(d.channels) || !d.channels.every(isChannel)) errs.push(`${at}: channels 오류`);

  const gp = d.grip?.positionM;
  if (!Array.isArray(gp) || gp.length !== 3 || !gp.every(isNum)) errs.push(`${at}: grip.positionM 오류`);

  const portIds = new Set<string>();
  for (const p of d.ports ?? []) {
    if (portIds.has(p.id)) errs.push(`${at}: 포트 id 중복 ${p.id}`);
    portIds.add(p.id);
    if (!d.channels?.includes(p.channel)) errs.push(`${at}: 포트 ${p.id} 의 채널 ${p.channel} 이 channels 에 없음`);
    if (p.direction !== 'in' && p.direction !== 'out') errs.push(`${at}: 포트 ${p.id} direction 오류`);
    if (!Array.isArray(p.positionM) || p.positionM.length !== 3 || !p.positionM.every(isNum)) {
      errs.push(`${at}: 포트 ${p.id} positionM 오류`);
    }
  }

  const keys = new Set<string>();
  for (const p of d.params ?? []) {
    if (keys.has(p.key)) errs.push(`${at}: param 키 중복 ${p.key}`);
    keys.add(p.key);
    if (![p.min, p.max, p.step, p.default].every(isNum)) errs.push(`${at}: param ${p.key} 숫자 오류`);
    else if (!(p.min <= p.default && p.default <= p.max && p.step > 0)) {
      errs.push(`${at}: param ${p.key} 범위 오류 (min ≤ default ≤ max, step > 0)`);
    }
  }
  for (const r of d.readouts ?? []) {
    if (typeof r.key !== 'string' || r.key === '') errs.push(`${at}: readout key 없음`);
  }
  return errs;
}
