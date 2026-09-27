import type { EquipmentInstance, EquipmentManager } from '../equipment/equipmentManager';
import type { ReadoutDef } from '../equipment/types';
import { readoutRow, tickReadout } from './paramControls';

/**
 * 단순 장비 패널. 장비 목록 → 선택한 장비의 readouts(보기 전용)와 저장/불러오기.
 * 수치 조정은 여기서 하지 않는다 — 장비를 놓은 뒤 두 번 탭하면 뜨는 조정 창(ParamsPopup)에서 한다.
 */
export class EquipmentPanel {
  private readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private selectedId: string | null = null;
  private readoutEls: { inst: EquipmentInstance; def: ReadoutDef; el: HTMLElement }[] = [];

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
    for (const { inst, def, el } of this.readoutEls) tickReadout(inst, def, el);
  }

  private renderDetail(): void {
    this.readoutEls = [];
    const inst = this.manager.instances.find((i) => i.id === this.selectedId);
    if (!inst) {
      this.detail.replaceChildren();
      return;
    }
    const rows: HTMLElement[] = [];

    if (inst.def.params.length > 0) rows.push(div('row hint', '수치 조정: 장비를 놓고 두 번 탭'));

    for (const r of inst.def.readouts) {
      const { row, el } = readoutRow(r);
      this.readoutEls.push({ inst, def: r, el });
      rows.push(row);
    }

    if (rows.length === 0) rows.push(div('row', '표시할 값 없음'));
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
