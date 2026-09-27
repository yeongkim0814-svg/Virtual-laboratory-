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

  const hold = d.hold;
  if (!hold || (hold.hands !== 1 && hold.hands !== 2)) errs.push(`${at}: hold.hands 는 1 또는 2`);
  else if (
    !Array.isArray(hold.grips) || hold.grips.length !== hold.hands ||
    !hold.grips.every((g) => Array.isArray(g) && g.length === 3 && g.every(isNum))
  ) errs.push(`${at}: hold.grips 는 손 수만큼의 [x, y, z]`);

  const portIds = new Set<string>();
  for (const p of d.ports ?? []) {
    if (portIds.has(p.id)) errs.push(`${at}: 포트 id 중복 ${p.id}`);
    portIds.add(p.id);
    if (!d.channels?.includes(p.channel)) errs.push(`${at}: 포트 ${p.id} 의 채널 ${p.channel} 이 channels 에 없음`);
    if (p.direction !== 'in' && p.direction !== 'out') errs.push(`${at}: 포트 ${p.id} direction 오류`);
    if (!Array.isArray(p.positionM) || p.positionM.length !== 3 || !p.positionM.every(isNum)) {
      errs.push(`${at}: 포트 ${p.id} positionM 오류`);
    }
    const kinds = ['mains', 'dc'];
    if (p.cord !== undefined && !(p.channel === 'Electric' && p.direction === 'in' && kinds.includes(p.cord.plug))) {
      errs.push(`${at}: 포트 ${p.id} cord 는 Electric 입력에만, plug 는 mains|dc`);
    }
    if (p.socket !== undefined && !(p.channel === 'Electric' && p.direction === 'out' && kinds.includes(p.socket))) {
      errs.push(`${at}: 포트 ${p.id} socket 은 Electric 출력에만, 종류는 mains|dc`);
    }
    if (p.continuesFrom !== undefined) {
      const src = (d.ports ?? []).find((q) => q.id === p.continuesFrom);
      if (!(p.channel === 'Light' && p.direction === 'out' && src?.channel === 'Light' && src.direction === 'in')) {
        errs.push(`${at}: 포트 ${p.id} continuesFrom 은 Light 출력에만, 같은 장비의 Light 입력 id`);
      }
    }
    if (p.channel === 'Light') {
      const dir = p.directionLocal;
      if (!Array.isArray(dir) || dir.length !== 3 || !dir.every(isNum) || Math.abs(Math.hypot(...dir) - 1) > 1e-6) {
        errs.push(`${at}: Light 포트 ${p.id} 는 directionLocal(단위벡터) 필요`);
      }
      const f = p.faceSizeM;
      if (p.direction === 'in' && (!Array.isArray(f) || f.length !== 2 || !f.every((v) => isNum(v) && v > 0))) {
        errs.push(`${at}: Light 입력 ${p.id} 는 faceSizeM [가로, 세로] 필요`);
      }
    }
  }

  const keys = new Set<string>();
  for (const p of d.params ?? []) {
    if (keys.has(p.key)) errs.push(`${at}: param 키 중복 ${p.key}`);
    keys.add(p.key);
    if (p.displayScale !== undefined && !(isNum(p.displayScale) && p.displayScale > 0)) {
      errs.push(`${at}: param ${p.key} displayScale 는 양수`);
    } else if (p.options !== undefined) {
      const values = Array.isArray(p.options) ? p.options.map((o) => o?.value) : [];
      if (values.length < 2 || !values.every(isNum) || new Set(values).size !== values.length) {
        errs.push(`${at}: param ${p.key} options 는 서로 다른 숫자 값 2개 이상`);
      } else if (!values.includes(p.default)) errs.push(`${at}: param ${p.key} default 는 options 값 중 하나`);
    } else if (![p.min, p.max, p.step, p.default].every(isNum)) errs.push(`${at}: param ${p.key} 숫자 오류`);
    else if (!(p.min <= p.default && p.default <= p.max && p.step > 0)) {
      errs.push(`${at}: param ${p.key} 범위 오류 (min ≤ default ≤ max, step > 0)`);
    }
  }
  for (const r of d.readouts ?? []) {
    if (typeof r.key !== 'string' || r.key === '') errs.push(`${at}: readout key 없음`);
  }
  return errs;
}
