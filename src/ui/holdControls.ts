import type { Hand } from '../hand/hand';

/** 장비를 들고 있을 때만 보이는 회전 버튼 + 짧은 안내 메시지. */
export class HoldControls {
  private readonly bar: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private toastTimer = 0;

  constructor(
    private readonly hand: Hand,
    onDrop: () => void,
  ) {
    this.bar = document.createElement('div');
    this.bar.className = 'hold-controls';
    const left = document.createElement('button');
    left.type = 'button';
    left.textContent = '⟲';
    left.addEventListener('click', () => hand.rotateHeld(+1)); // 위에서 보아 반시계 = +yaw
    const right = document.createElement('button');
    right.type = 'button';
    right.textContent = '⟳';
    right.addEventListener('click', () => hand.rotateHeld(-1));
    const drop = document.createElement('button');
    drop.type = 'button';
    drop.textContent = '놓기';
    drop.addEventListener('click', onDrop);
    this.bar.append(drop, left, right);

    this.toast = document.createElement('div');
    this.toast.className = 'toast';
    this.toast.hidden = true;
    document.body.append(this.bar, this.toast);
  }

  notify(msg: string): void {
    this.toast.textContent = msg;
    this.toast.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), 1800);
  }

  tick(): void {
    this.bar.hidden = this.hand.heldInstance === null;
  }
}
