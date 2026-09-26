import { laserOn } from '../../../physics/optics';
import type { BehaviorModule } from '../../types';

/** 정격 전압(승인 규칙 R2). 이 전압 이상이 들어오면 켜진다. */
const RATED_VOLTAGE_V = 5;

// 레이저: 전원(R2) → 켜지면 설정 파장·출력의 빛을 beam 포트(앞, +z)로 내보낸다.
// 빛이 어디에 닿는지는 Light 라우터(R1 직진)가 정한다.
const mod: BehaviorModule = {
  type: 'laser',
  create: () => ({
    update(ctx) {
      const v = ctx.inputs.power?.[0]?.values.voltageV ?? null;
      const on = laserOn(v, RATED_VOLTAGE_V);
      if (on) ctx.emit('beam', { wavelengthM: ctx.params.wavelengthM, powerW: ctx.params.powerW });
      ctx.setReadout('emittedPowerW', on ? ctx.params.powerW : 0);
    },
  }),
};
export default mod;
