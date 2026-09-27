import type { BehaviorModule } from '../../types';

// 직류 전원 장치. 물리 계산 없음: 전원선이 콘센트에 꽂혀 전원이 들어오면 설정한 전압을 DC 단자로 내보낸다.
// (부하·내부 저항·변환 효율은 다루지 않음)
const mod: BehaviorModule = {
  type: 'power-supply',
  create: () => ({
    update(ctx) {
      const powered = (ctx.inputs.mains?.[0]?.values.voltageV ?? 0) > 0;
      if (powered) ctx.emit('out', { voltageV: ctx.params.voltageV });
      ctx.setReadout('outputV', powered ? ctx.params.voltageV : null);
    },
  }),
};
export default mod;
