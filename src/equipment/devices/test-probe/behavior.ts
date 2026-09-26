import type { BehaviorModule } from '../../types';

// 채널 연결 확인용. 물리 계산 없음: in 포트로 받은 값을 그대로 표시한다.
// 연결된 신호가 없으면 표시하지 않는다(null).
const mod: BehaviorModule = {
  type: 'test-probe',
  create: () => ({
    update(ctx) {
      const first = ctx.inputs.in?.[0];
      ctx.setReadout('voltageV', first ? (first.values.voltageV ?? null) : null);
    },
  }),
};
export default mod;
