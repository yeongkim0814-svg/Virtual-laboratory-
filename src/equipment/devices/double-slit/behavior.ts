import { slitTransmittedPowerW } from '../../../physics/doubleSlit';
import type { BehaviorModule } from '../../types';

// 이중 슬릿판: 뒷면 조준 영역(in)에 빛이 닿으면(R7: 두 슬릿 가운데를 지난다고 봄)
// R6 만큼의 세기로 앞(out, +z)으로 내보낸다. 슬릿 간격·폭을 함께 실어 스크린이 R5 무늬를 그리게 한다.
// 슬라이더 범위: d + a ≤ 0.58 mm < 빔 지름 1 mm (R6 유효범위), a < d.
const mod: BehaviorModule = {
  type: 'double-slit',
  create: () => ({
    update(ctx) {
      const light = ctx.inputs.in?.[0];
      if (!light) {
        ctx.setReadout('transmittedPowerW', 0);
        return;
      }
      const { wavelengthM = 0, powerW = 0, beamDiameterM = 0 } = light.values;
      const outW = beamDiameterM > 0 ? slitTransmittedPowerW(powerW, ctx.params.slitWidthM, beamDiameterM) : 0;
      ctx.emit('out', {
        wavelengthM,
        powerW: outW,
        slitSpacingM: ctx.params.slitSpacingM,
        slitWidthM: ctx.params.slitWidthM,
      });
      ctx.setReadout('transmittedPowerW', outW);
    },
  }),
};
export default mod;
