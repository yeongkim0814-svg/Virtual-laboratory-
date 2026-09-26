import { isLongPress, isTap, joystickInput, type Vec2 } from './controlMath';

/**
 * 멀티터치 입력 (Touch Events). 화면 왼쪽 절반에서 시작한 터치 = 조이스틱(이동),
 * 오른쪽 절반에서 시작한 터치 = 드래그(시점). Touch.identifier 로 손가락을 각각
 * 추적하므로 두 손가락 동시 조작이 가능하다.
 * 거의 움직이지 않고 짧게 뗀 터치는 "탭"으로도 기록한다(장비 집기·놓기용).
 * 거의 움직이지 않고 길게 누르면 "길게 누르기"로 알리고, 받는 쪽이 capture 하면 그 손가락의
 * 이후 드래그는 조이스틱·시점 대신 captureDx 로 모인다(장비 회전용). 손을 떼면 capture 끝.
 */
export class TouchControls {
  /** 현재 조이스틱 입력 ([-1,1]). */
  move: Vec2 = { x: 0, y: 0 };

  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private lookAccum = { x: 0, y: 0 };

  /** 진행 중인 터치의 시작점·시각·최대 이동 거리 (탭 판정용). */
  private readonly touchStarts = new Map<
    number,
    { x: number; y: number; tS: number; movedPx: number; lastX: number; longPressReported: boolean }
  >();
  private taps: Vec2[] = [];
  private captureId: number | null = null;
  private captureDx = 0;

  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;

  constructor(
    surface: HTMLElement,
    private readonly radiusPx: number,
    private readonly tapCfg: { tapMaxMovePx: number; tapMaxDurationS: number; longPressS: number },
  ) {
    this.base = document.createElement('div');
    this.base.className = 'joystick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.base.appendChild(this.knob);
    document.body.appendChild(this.base);
    this.base.style.width = this.base.style.height = `${radiusPx * 2}px`;

    // passive: false → preventDefault 로 스크롤·확대 제스처를 막는다.
    const opts = { passive: false } as const;
    surface.addEventListener('touchstart', this.onStart, opts);
    surface.addEventListener('touchmove', this.onMove, opts);
    surface.addEventListener('touchend', this.onEnd, opts);
    surface.addEventListener('touchcancel', this.onEnd, opts);
  }

  /** 마지막 호출 이후 누적된 시점 드래그(px)를 꺼내고 0 으로 되돌린다. */
  consumeLook(): Vec2 {
    const d = { ...this.lookAccum };
    this.lookAccum = { x: 0, y: 0 };
    return d;
  }

  /** 마지막 호출 이후 발생한 탭(화면 좌표 px)을 꺼낸다. */
  consumeTaps(): Vec2[] {
    const t = this.taps;
    this.taps = [];
    return t;
  }

  /** 길게 누르기가 새로 생겼으면 그 손가락(한 번만 알림). nowS 는 performance.now()/1000. */
  pollLongPress(nowS: number): { id: number; x: number; y: number } | null {
    for (const [id, st] of this.touchStarts) {
      if (st.longPressReported || id === this.captureId) continue;
      if (isLongPress(st.movedPx, nowS - st.tS, this.tapCfg)) {
        st.longPressReported = true;
        return { id, x: st.x, y: st.y };
      }
    }
    return null;
  }

  /** 이 손가락의 드래그를 가져온다(조이스틱·시점에서 뺀다). */
  capture(id: number): void {
    this.captureId = id;
    this.captureDx = 0;
    if (id === this.joyId) {
      this.joyId = null;
      this.move = { x: 0, y: 0 };
      this.base.classList.remove('active');
    } else if (id === this.lookId) {
      this.lookId = null;
    }
  }

  get capturing(): boolean {
    return this.captureId !== null;
  }

  /** capture 된 손가락의 가로 이동(px) 누적을 꺼낸다. */
  consumeCaptureDx(): number {
    const d = this.captureDx;
    this.captureDx = 0;
    return d;
  }

  private onStart = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      this.touchStarts.set(t.identifier, {
        x: t.clientX, y: t.clientY, tS: e.timeStamp / 1000, movedPx: 0, lastX: t.clientX, longPressReported: false,
      });
      const leftHalf = t.clientX < window.innerWidth / 2;
      if (leftHalf && this.joyId === null) {
        this.joyId = t.identifier;
        this.joyOrigin = { x: t.clientX, y: t.clientY };
        this.base.style.left = `${t.clientX}px`;
        this.base.style.top = `${t.clientY}px`;
        this.base.classList.add('active');
        this.setKnob(0, 0);
      } else if (!leftHalf && this.lookId === null) {
        this.lookId = t.identifier;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  };

  private onMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const st = this.touchStarts.get(t.identifier);
      if (st) st.movedPx = Math.max(st.movedPx, Math.hypot(t.clientX - st.x, t.clientY - st.y));
      if (t.identifier === this.captureId && st) {
        this.captureDx += t.clientX - st.lastX;
      } else if (t.identifier === this.joyId) {
        this.move = joystickInput(t.clientX - this.joyOrigin.x, t.clientY - this.joyOrigin.y, this.radiusPx);
        this.setKnob(this.move.x * this.radiusPx, -this.move.y * this.radiusPx);
      } else if (t.identifier === this.lookId) {
        this.lookAccum.x += t.clientX - this.lookLast.x;
        this.lookAccum.y += t.clientY - this.lookLast.y;
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
      if (st) st.lastX = t.clientX;
    }
  };

  private onEnd = (e: TouchEvent): void => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const st = this.touchStarts.get(t.identifier);
      this.touchStarts.delete(t.identifier);
      if (st && e.type === 'touchend' && isTap(st.movedPx, e.timeStamp / 1000 - st.tS, this.tapCfg)) {
        this.taps.push({ x: st.x, y: st.y });
      }
      if (t.identifier === this.captureId) {
        this.captureId = null;
      } else if (t.identifier === this.joyId) {
        this.joyId = null;
        this.move = { x: 0, y: 0 };
        this.base.classList.remove('active');
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
      }
    }
  };

  private setKnob(xPx: number, yPx: number): void {
    this.knob.style.transform = `translate(calc(-50% + ${xPx}px), calc(-50% + ${yPx}px))`;
  }
}
