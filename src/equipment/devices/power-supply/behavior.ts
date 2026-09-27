import { dcOperatingPoint } from '../../../physics/dcSupply';
import type { BehaviorModule } from '../../types';

// 직류 전원 장치(CV/CC, 승인 규칙 R9). 전원선이 콘센트에 꽂혀 전압이 들어올 때만 출력한다.
// 부하: out 에 꽂힌 장비가 reply 로 알린 V–I 특성(문턱 thresholdV, 직렬 저항 seriesOhm; R10 LED 등).
// 알린 부하가 없으면 개방(전류 0). 정한 동작점(전압·전류)을 out 으로 내보낸다(한 프레임 늦게 반영).
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
      const load = ctx.replies.out?.[0]?.values;
      const dcLoad = load?.thresholdV !== undefined && load.seriesOhm !== undefined ? { thresholdV: load.thresholdV, seriesOhm: load.seriesOhm } : null;
      const op = dcOperatingPoint(ctx.params.voltageV, ctx.params.currentLimitA, dcLoad);
      ctx.emit('out', { voltageV: op.voltageV, currentA: op.currentA });
      ctx.setReadout('outputV', op.voltageV);
      ctx.setReadout('outputA', op.currentA);
    },
  }),
};
export default mod;
