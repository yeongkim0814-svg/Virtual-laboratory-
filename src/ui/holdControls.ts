import type { Hand } from '../hand/hand';

/** 장비를 들고 있을 때만 보이는 놓기 버튼 + 짧은 안내 메시지. (들고 있는 동안 회전은 안 됨) */
export class HoldControls {
  private readonly bar: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private toastTimer = 0;

  constructor(
    private readonly hand: Hand,
    onDrop: () => void,
  ) {
    this.bar = document.createElement('div');
    this.bar.className = 'hold-controls';
    const drop = document.createElement('button');
    drop.type = 'button';
    drop.textContent = '놓기';
    drop.addEventListener('click', onDrop);
    this.bar.append(drop);

    this.toast = document.createElement('div');
    this.toast.className = 'toast';
    this.toast.hidden = true;
    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    document.body.append(this.bar, this.toast, this.crosshair);
  }

  notify(msg: string): void {
    this.toast.textContent = msg;
    this.toast.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), 1800);
  }

  tick(): void {
    const holding = this.hand.heldInstance !== null;
    this.bar.hidden = !holding;
    this.crosshair.hidden = !holding;
  }
}
