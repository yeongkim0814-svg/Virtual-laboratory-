import type { BehaviorModule } from '../../types';

// 스크린: 앞면(face)에 닿은 빛의 세기 합과 파장을 표시한다.
// R3(승인): 공기 중 손실 없음 → 받은 세기 = 레이저 출력(라우터가 값을 그대로 전달).
const mod: BehaviorModule = {
  type: 'screen',
  create: () => ({
    update(ctx) {
      const light = ctx.inputs.face ?? [];
      ctx.setReadout('receivedPowerW', light.reduce((sum, s) => sum + (s.values.powerW ?? 0), 0));
      ctx.setReadout('wavelengthM', light[0]?.values.wavelengthM ?? null);
    },
  }),
};
export default mod;
