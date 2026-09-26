import type { BehaviorModule } from '../../types';

// 직류 전원 장치. 물리 계산 없음: 설정한 전압을 출력 포트로 내보낸다(부하·내부 저항은 다루지 않음).
const mod: BehaviorModule = {
  type: 'power-supply',
  create: () => ({
    update(ctx) {
      ctx.emit('out', { voltageV: ctx.params.voltageV });
    },
  }),
};
export default mod;
