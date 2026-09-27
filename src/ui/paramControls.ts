import type { EquipmentInstance } from '../equipment/equipmentManager';
import type { ParamDef, ReadoutDef } from '../equipment/types';
import { decimalsForStep, formatValue, toDisplay } from './formatValue';

const READOUT_DECIMALS = 2;

/**
 * 수치 하나를 조정하는 줄(자동 생성): options 가 있으면 스위치(버튼 묶음), 없으면 슬라이더.
 * 슬라이더는 표시 단위, 값은 SI 로 저장(params 를 직접 바꿈).
 */
export function paramRow(inst: EquipmentInstance, p: ParamDef): HTMLDivElement {
  const row = div('row');
  if (p.options) {
    const buttons = div('switch');
    const mark = (): void => {
      buttons.querySelectorAll('button').forEach((b, i) => b.classList.toggle('selected', p.options[i].value === inst.params[p.key]));
    };
    for (const o of p.options) {
      const b = button(o.label);
      b.addEventListener('click', () => {
        inst.params[p.key] = o.value;
        mark();
      });
      buttons.append(b);
    }
    mark();
    row.append(p.label, buttons);
    return row;
  }
  const label = document.createElement('label');
  const value = document.createElement('span');
  const scale = p.displayScale ?? 1;
  const step = toDisplay(p.step, scale);
  const decimals = decimalsForStep(step);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(toDisplay(p.min, scale));
  slider.max = String(toDisplay(p.max, scale));
  slider.step = String(step);
  slider.value = String(toDisplay(inst.params[p.key], scale));
  const show = (): void => {
    value.textContent = formatValue(toDisplay(inst.params[p.key], scale), p.unit, decimals);
  };
  slider.addEventListener('input', () => {
    inst.params[p.key] = Number(slider.value) / scale;
    show();
  });
  show();
  label.append(p.label, ' ', value);
  row.append(label, slider);
  return row;
}

/** 읽기 전용 값 줄(보기 전용) + 매 프레임 값을 갱신하는 값칸. */
export function readoutRow(r: ReadoutDef): { row: HTMLDivElement; el: HTMLElement } {
  const row = div('row readout');
  const value = document.createElement('span');
  row.append(`${r.label} `, value);
  return { row, el: value };
}

/** readoutRow 의 값칸을 현재 값으로 갱신. */
export function tickReadout(inst: EquipmentInstance, def: ReadoutDef, el: HTMLElement): void {
  const v = inst.readouts[def.key];
  const named = v === null ? undefined : def.options?.find((o) => o.value === v);
  el.textContent = named ? named.label : formatValue(v === null ? null : toDisplay(v, def.displayScale ?? 1), def.unit, READOUT_DECIMALS);
}

function div(className: string, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  if (text) d.textContent = text;
  return d;
}

function button(text: string, className = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  if (className) b.className = className;
  return b;
}
