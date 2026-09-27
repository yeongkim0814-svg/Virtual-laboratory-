import type { EquipmentInstance } from '../equipment/equipmentManager';
import { paramRow } from './paramControls';

/**
 * 장비를 놓은 뒤 두 번 탭하면 뜨는 수치 조정 창(그 장비 하나만). 장비 탭(EquipmentPanel)에서는
 * 더 이상 수치를 조정하지 않는다 — 여기서만 한다.
 */
export class ParamsPopup {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLSpanElement;
  private readonly body: HTMLDivElement;
  private openId: string | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'params-popup';
    this.root.hidden = true;

    const header = document.createElement('div');
    header.className = 'params-popup-header';
    this.title = document.createElement('span');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'params-popup-close';
    close.textContent = '닫기';
    close.addEventListener('click', () => this.hide());
    header.append(this.title, close);

    this.body = document.createElement('div');
    this.body.className = 'params-popup-body';

    this.root.append(header, this.body);
    document.body.append(this.root);
  }

  show(inst: EquipmentInstance): void {
    this.openId = inst.id;
    this.title.textContent = `${inst.def.label} · ${inst.id}`;
    this.body.replaceChildren(...inst.def.params.map((p) => paramRow(inst, p)));
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.openId = null;
  }

  /** 지금 이 장비의 창이 열려 있으면 true(장비가 사라지는 등 정리에 씀). */
  isOpenFor(id: string): boolean {
    return this.openId === id;
  }
}
