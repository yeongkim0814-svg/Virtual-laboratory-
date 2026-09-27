import { ledBurnsOut, ledOpticalPowerW, ledThresholdV } from '../../../physics/led';
import type { BehaviorModule } from '../../types';

/** R10 상수(승인값): 직렬 저항 R_D, 외부 양자효율 η, 정격 전류. */
const SERIES_OHM = 10;
const EFFICIENCY = 0.2;
const RATED_CURRENT_A = 0.02;

const STATUS_OFF = 0;
const STATUS_ON = 1;
const STATUS_BURNED = 2;

// LED(R10): 직류 전원에 꽂으면 자기 V–I 특성(문턱 V_F, R_D)을 케이블을 거꾸로 알리고(reply),
// 전원 장치가 정한 동작점(전압·전류)을 받아 빛 출력을 계산한다. 정격을 넘는 전류가 흐르면 탄다.
// 탄 LED 는 끊긴 회로(특성을 알리지 않음 → 전원 쪽에서 개방). 색을 바꾸면 새 LED 로 교체(탐 해제).
const mod: BehaviorModule = {
  type: 'led',
  create: () => {
    let burned = false;
    let fittedWavelengthM: number | null = null;
    return {
      update(ctx) {
        const wavelengthM = ctx.params.wavelengthM;
        if (wavelengthM !== fittedWavelengthM) {
          fittedWavelengthM = wavelengthM;
          burned = false;
        }
        const thresholdV = ledThresholdV(wavelengthM);
        const sig = ctx.inputs.power?.[0]?.values;
        const voltageV = sig?.voltageV ?? null;
        // 전원이 전류를 알려 주면 그 값(동작점), 아니면 전압으로 직접 계산(구간 선형)
        const currentA = sig === undefined ? 0 : (sig.currentA ?? Math.max(0, ((voltageV ?? 0) - thresholdV) / SERIES_OHM));
        if (!burned && ledBurnsOut(currentA, RATED_CURRENT_A)) burned = true;
        if (!burned) ctx.reply('power', { thresholdV, seriesOhm: SERIES_OHM });

        const i = burned ? 0 : currentA;
        ctx.setReadout('status', burned ? STATUS_BURNED : i > 0 ? STATUS_ON : STATUS_OFF);
        ctx.setReadout('thresholdV', thresholdV);
        ctx.setReadout('voltageV', voltageV);
        ctx.setReadout('currentA', i);
        ctx.setReadout('lightPowerW', ledOpticalPowerW(i, thresholdV, EFFICIENCY));
      },
    };
  },
};
export default mod;
