import type { BehaviorModule } from '../../types';

// 채널 연결 확인용. 물리 계산 없음: 슬라이더 값을 그대로 out 포트로 내보낸다.
const mod: BehaviorModule = {
  type: 'test-source',
  create: () => ({
    update(ctx) {
      ctx.emit('out', { voltageV: ctx.params.voltageV });
    },
  }),
};
export default mod;
