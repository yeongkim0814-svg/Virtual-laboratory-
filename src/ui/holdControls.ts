import type { Hand } from '../hand/hand';

/** 들고 있을 때 조준점 + 짧은 안내 메시지 + 앉기 버튼. (들고 있는 동안 회전은 안 됨, 놓기는 면을 보고 탭) */
export class HoldControls {
  private readonly toast: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private toastTimer = 0;

  constructor(
    private readonly hand: Hand,
    player: { crouching: boolean },
  ) {
    const crouch = document.createElement('button');
    crouch.type = 'button';
    crouch.className = 'crouch-button';
    crouch.textContent = '앉기';
    // click 은 다른 손가락이 화면에 있으면(걷는 중) 만들어지지 않는다 → 닿는 순간(pointerdown)에 반응
    crouch.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      player.crouching = !player.crouching;
      crouch.textContent = player.crouching ? '일어서기' : '앉기';
    });
    document.body.append(crouch);

    this.toast = document.createElement('div');
    this.toast.className = 'toast';
    this.toast.hidden = true;
    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    document.body.append(this.toast, this.crosshair);
  }

  notify(msg: string): void {
    this.toast.textContent = msg;
    this.toast.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), 1800);
  }

  tick(): void {
    this.crosshair.hidden = this.hand.heldInstance === null;
  }
}
