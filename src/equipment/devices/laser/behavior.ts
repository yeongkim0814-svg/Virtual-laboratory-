import { laserOn } from '../../../physics/optics';
import type { BehaviorModule } from '../../types';

/** 빔 지름(R6 에서 슬릿 투과 비율에 쓰임). 흔한 레이저 포인터 수준. */
const BEAM_DIAMETER_M = 1e-3;

// 레이저: 콘센트 전원 + 스위치(R2′) → 켜지면 스위치 파장(650 / 532 nm)·설정 출력의 빛을 beam 포트(앞, +z)로 내보낸다.
// 빛이 어디에 닿는지는 Light 라우터(R1 직진)가 정한다.
const mod: BehaviorModule = {
  type: 'laser',
  create: () => ({
    update(ctx) {
      const v = ctx.inputs.power?.[0]?.values.voltageV ?? null;
      const on = laserOn(v, ctx.params.wavelengthM);
      if (on) {
        ctx.emit('beam', { wavelengthM: ctx.params.wavelengthM, powerW: ctx.params.powerW, beamDiameterM: BEAM_DIAMETER_M });
      }
      ctx.setReadout('emittedPowerW', on ? ctx.params.powerW : 0);
    },
  }),
};
export default mod;
