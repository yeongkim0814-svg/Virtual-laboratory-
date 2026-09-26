// 세팅 JSON 저장/불러오기 테스트.
import { describe, expect, it } from 'vitest';
import { parseSetup, serializeSetup } from '../src/equipment/setup';
import type { EquipmentDefinition } from '../src/equipment/types';

const def: EquipmentDefinition = {
  type: 'dev',
  label: 'dev',
  asset: 'dev',
  hold: { hands: 1, grips: [[0, 0, 0]] },
  channels: ['Electric'],
  ports: [],
  params: [{ key: 'voltageV', label: 'V', unit: 'V', min: 0, max: 12, step: 0.1, default: 5 }],
  readouts: [],
};
const defs = new Map([[def.type, def]]);
const item = (over: object = {}) => ({ id: 'd1', type: 'dev', positionM: [1, 0, 2], rotationYDeg: 30, params: { voltageV: 3 }, ...over });

describe('parseSetup', () => {
  it('정상 세팅 그대로', () => {
    const s = parseSetup({ version: 1, equipment: [item()] }, defs);
    expect(s.equipment[0]).toEqual(item());
  });
  it('빠진 param → default(5), 빠진 회전 → 0', () => {
    const s = parseSetup({ version: 1, equipment: [item({ params: {}, rotationYDeg: undefined })] }, defs);
    expect(s.equipment[0].params.voltageV).toBe(5);
    expect(s.equipment[0].rotationYDeg).toBe(0);
  });
  it('범위 밖 param → [0, 12] 로 자름', () => {
    expect(parseSetup({ version: 1, equipment: [item({ params: { voltageV: 99 } })] }, defs).equipment[0].params.voltageV).toBe(12);
    expect(parseSetup({ version: 1, equipment: [item({ params: { voltageV: -1 } })] }, defs).equipment[0].params.voltageV).toBe(0);
  });
  it('오류: 알 수 없는 종류 / 중복 id / 없는 param / 잘못된 좌표 / version', () => {
    expect(() => parseSetup({ version: 1, equipment: [item({ type: 'nope' })] }, defs)).toThrow('알 수 없는 장비');
    expect(() => parseSetup({ version: 1, equipment: [item(), item()] }, defs)).toThrow('중복 id');
    expect(() => parseSetup({ version: 1, equipment: [item({ params: { x: 1 } })] }, defs)).toThrow('없는 param');
    expect(() => parseSetup({ version: 1, equipment: [item({ positionM: [1, 2] })] }, defs)).toThrow('positionM');
    expect(() => parseSetup({ version: 2, equipment: [] }, defs)).toThrow('version');
  });
});

describe('serializeSetup', () => {
  it('저장 → 불러오기 하면 같은 세팅', () => {
    const original = parseSetup({ version: 1, equipment: [item(), item({ id: 'd2', positionM: [-1, 0, 0] })] }, defs);
    const again = parseSetup(JSON.parse(serializeSetup(original.equipment)), defs);
    expect(again).toEqual(original);
  });
});
