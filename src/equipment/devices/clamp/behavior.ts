import type { BehaviorModule } from '../../types';

// 실험용 클램프: 채널·신호 없음, 순전히 받침(mounts). 작은 장비(슬릿·LED 등)를 끼워서 쓴다.
// 자리는 정의의 mounts, 물리(빛 차단 상자)에서는 빠진다(EquipmentManager.bodyBoxes).
const mod: BehaviorModule = {
  type: 'clamp',
  create: () => ({
    update() {
      // 할 일 없음
    },
  }),
};
export default mod;
