import * as THREE from 'three';
import type { AssetRegistry } from '../assets/assetRegistry';
import type { RoomSize } from '../config/types';
import { floorPlacement, wallPlacements, type Placement } from './roomLayout';

/** assets.json 의 floor / wall 에셋으로 빈 방을 만든다. */
export async function buildRoom(registry: AssetRegistry, room: RoomSize): Promise<THREE.Group> {
  const group = new THREE.Group();
  const place = async (name: string, p: Placement): Promise<void> => {
    const obj = await registry.create(name, p.sizeM);
    obj.position.set(...p.positionM);
    obj.rotation.y = p.rotationYRad;
    group.add(obj);
  };

  await place('floor', floorPlacement(room, registry.thicknessM('floor')));
  for (const w of wallPlacements(room, registry.thicknessM('wall'))) await place('wall', w);
  return group;
}
