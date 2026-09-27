import type { BehaviorModule } from '../../types';

/** 콘센트 전압(가정용). 교류(60 Hz)지만 지금은 크기만 쓴다(교류·위상은 다루지 않음). */
const MAINS_VOLTAGE_V = 220;

// 탁상 콘센트(고정 장비): 두 소켓으로 늘 전원을 내보낸다. 물리 계산 없음.
const mod: BehaviorModule = {
  type: 'table-outlet',
  create: () => ({
    update(ctx) {
      ctx.emit('socket-1', { voltageV: MAINS_VOLTAGE_V });
      ctx.emit('socket-2', { voltageV: MAINS_VOLTAGE_V });
    },
  }),
};
export default mod;
