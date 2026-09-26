/** 찬장 목록(장비 종류·남은 개수). 고르면 onPick, 닫기로 취소. 버튼 최소 44px. */
export class CupboardMenu {
  private readonly el: HTMLDivElement;

  constructor(private readonly labelOf: (type: string) => string) {
    this.el = document.createElement('div');
    this.el.className = 'cupboard-menu';
    this.el.hidden = true;
    document.body.append(this.el);
  }

  open(items: readonly [string, number][], onPick: (type: string) => void): void {
    this.el.replaceChildren();
    const title = document.createElement('div');
    title.textContent = '찬장';
    this.el.append(title);
    for (const [type, n] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${this.labelOf(type)} (${n})`;
      b.disabled = n <= 0;
      b.addEventListener('click', () => {
        this.close();
        onPick(type);
      });
      this.el.append(b);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '닫기';
    close.addEventListener('click', () => this.close());
    this.el.append(close);
    this.el.hidden = false;
  }

  close(): void {
    this.el.hidden = true;
  }
}
