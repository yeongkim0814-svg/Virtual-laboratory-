// 장비 자동 등록. devices/<type>/definition.json + behavior.ts 를 넣기만 하면 된다.
// 기존 코드 수정 없이 새 장비를 추가할 수 있도록 import.meta.glob 으로 수집한다.

import type { BehaviorModule, EquipmentDefinition } from './types';
import { validateDefinition } from './validateDefinition';

const defModules = import.meta.glob<EquipmentDefinition>('./devices/*/definition.json', {
  eager: true,
  import: 'default',
});
const behaviorModules = import.meta.glob<BehaviorModule>('./devices/*/behavior.ts', {
  eager: true,
  import: 'default',
});

export interface EquipmentRegistry {
  definitions: Map<string, EquipmentDefinition>;
  behaviors: Map<string, BehaviorModule>;
}

/** 수집한 정의·동작을 검증해 등록한다. 문제가 있으면 모아서 오류를 던진다. */
export function loadEquipmentRegistry(): EquipmentRegistry {
  const definitions = new Map<string, EquipmentDefinition>();
  const behaviors = new Map<string, BehaviorModule>();
  const errs: string[] = [];

  for (const [path, def] of Object.entries(defModules)) {
    const folder = path.split('/')[2];
    if (def.type !== folder) errs.push(`${path}: type(${def.type}) 과 폴더 이름(${folder}) 이 다름`);
    errs.push(...validateDefinition(def));
    definitions.set(def.type, def);
  }
  for (const [path, mod] of Object.entries(behaviorModules)) {
    const folder = path.split('/')[2];
    if (mod.type !== folder) errs.push(`${path}: type(${mod.type}) 과 폴더 이름(${folder}) 이 다름`);
    behaviors.set(mod.type, mod);
  }
  for (const type of definitions.keys()) {
    if (!behaviors.has(type)) errs.push(`장비 ${type}: behavior.ts 없음`);
  }
  for (const type of behaviors.keys()) {
    if (!definitions.has(type)) errs.push(`장비 ${type}: definition.json 없음`);
  }

  if (errs.length > 0) throw new Error(errs.join('\n'));
  return { definitions, behaviors };
}
