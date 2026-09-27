import { dcOperatingPoint } from '../../../physics/dcSupply';
import type { BehaviorModule } from '../../types';

// 직류 전원 장치(CV/CC, 승인 규칙 R9). 전원선이 콘센트에 꽂혀 전압이 들어올 때만 출력한다.
// 부하 저항: 아직 직류 단자에 꽂는 부하 장비가 없어 항상 개방(null) → 전류 0 A.
// (부하가 자기 특성을 알리는 방식은 LED 등 부하 장비를 추가할 때 붙인다)
const mod: BehaviorModule = {
  type: 'power-supply',
  create: () => ({
    update(ctx) {
      const powered = (ctx.inputs.mains?.[0]?.values.voltageV ?? 0) > 0;
      if (!powered) {
        ctx.setReadout('outputV', null);
        ctx.setReadout('outputA', null);
        return;
      }
      const op = dcOperatingPoint(ctx.params.voltageV, ctx.params.currentLimitA, null);
      ctx.emit('out', { voltageV: op.voltageV });
      ctx.setReadout('outputV', op.voltageV);
      ctx.setReadout('outputA', op.currentA);
    },
  }),
};
export default mod;
