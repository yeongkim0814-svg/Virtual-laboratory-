import type { EquipmentInstance, EquipmentManager } from '../equipment/equipmentManager';
import { decimalsForStep, formatValue } from './formatValue';

const READOUT_DECIMALS = 2;

/**
 * 단순 장비 패널. 장비 목록 → 선택한 장비의 params 슬라이더(자동 생성)와 readouts.
 * 세팅 저장(파일 내려받기) / 불러오기(파일 선택) 버튼 포함.
 */
export class EquipmentPanel {
  private readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private selectedId: string | null = null;
  private readoutEls: { inst: EquipmentInstance; key: string; unit: string; el: HTMLElement }[] = [];

  constructor(
    private readonly manager: EquipmentManager,
    handlers: { onSave: () => void; onLoadFile: (file: File) => void },
  ) {
    const toggle = button('장비', 'panel-toggle');
    this.root = div('panel');
    this.root.hidden = true;
    toggle.addEventListener('click', () => {
      this.root.hidden = !this.root.hidden;
      if (!this.root.hidden) this.refresh();
    });

    const actions = div('panel-actions');
    const save = button('저장');
    save.addEventListener('click', handlers.onSave);
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.hidden = true;
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (f) handlers.onLoadFile(f);
      fileInput.value = '';
    });
    const load = button('불러오기');
    load.addEventListener('click', () => fileInput.click());
    actions.append(save, load, fileInput);

    this.list = div('panel-list');
    this.detail = div('panel-detail');
    this.root.append(actions, this.list, this.detail);
    document.body.append(toggle, this.root);
  }

  /** 장비 목록이 바뀌었을 때(불러오기 후) 다시 그린다. */
  refresh(): void {
    if (!this.manager.instances.some((i) => i.id === this.selectedId)) {
      this.selectedId = this.manager.instances[0]?.id ?? null;
    }
    this.list.replaceChildren(
      ...this.manager.instances.map((inst) => {
        const b = button(`${inst.def.label} · ${inst.id}`);
        if (inst.id === this.selectedId) b.classList.add('selected');
        b.addEventListener('click', () => {
          this.selectedId = inst.id;
          this.refresh();
        });
        return b;
      }),
    );
    this.renderDetail();
  }

  /** 매 프레임 호출: 패널이 열려 있으면 readout 값만 갱신. */
  tick(): void {
    if (this.root.hidden) return;
    for (const r of this.readoutEls) {
      r.el.textContent = formatValue(r.inst.readouts[r.key], r.unit, READOUT_DECIMALS);
    }
  }

  private renderDetail(): void {
    this.readoutEls = [];
    const inst = this.manager.instances.find((i) => i.id === this.selectedId);
    if (!inst) {
      this.detail.replaceChildren();
      return;
    }
    const rows: HTMLElement[] = [];

    // params → 슬라이더 자동 생성
    for (const p of inst.def.params) {
      const row = div('row');
      const label = document.createElement('label');
      const value = document.createElement('span');
      const decimals = decimalsForStep(p.step);
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(p.min);
      slider.max = String(p.max);
      slider.step = String(p.step);
      slider.value = String(inst.params[p.key]);
      const show = (): void => {
        value.textContent = formatValue(inst.params[p.key], p.unit, decimals);
      };
      slider.addEventListener('input', () => {
        inst.params[p.key] = Number(slider.value);
        show();
      });
      show();
      label.append(p.label, ' ', value);
      row.append(label, slider);
      rows.push(row);
    }

    for (const r of inst.def.readouts) {
      const row = div('row readout');
      const value = document.createElement('span');
      row.append(`${r.label} `, value);
      this.readoutEls.push({ inst, key: r.key, unit: r.unit, el: value });
      rows.push(row);
    }

    if (rows.length === 0) rows.push(div('row', '조정할 수치 없음'));
    this.detail.replaceChildren(...rows);
    this.tick();
  }
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
