import * as THREE from 'three';
import type { AssetRegistry } from '../assets/assetRegistry';
import type { RoomSize } from '../config/types';
import { floorPlacement, wallPlacements, type Placement } from './roomLayout';

/** assets.json 의 floor / wall 에셋으로 빈 방을 만든다. */
export async function buildRoom(registry: AssetRegistry, room: RoomSize): Promise<THREE.Group> {
  const group = new THREE.Group();
  const place = async (name: string, p: Placement): Promise<THREE.Object3D> => {
    const obj = await registry.create(name, p.sizeM);
    obj.position.set(...p.positionM);
    obj.rotation.y = p.rotationYRad;
    group.add(obj);
    return obj;
  };

  const floor = await place('floor', floorPlacement(room, registry.thicknessM('floor')));
  // 장비를 내려놓을 수 있는 면. (나중에 테이블 등도 같은 표시를 단다.)
  floor.userData.placeSurface = true;
  for (const w of wallPlacements(room, registry.thicknessM('wall'))) await place('wall', w);
  return group;
}
