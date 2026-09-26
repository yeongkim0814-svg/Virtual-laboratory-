import * as THREE from 'three';
import type { AssetRegistry } from '../assets/assetRegistry';
import type { FurnitureDef, RoomSize } from '../config/types';
import { cupboardParts, tableParts } from './furnitureParts';
import { floorPlacement, wallPlacements, type Placement } from './roomLayout';

/**
 * assets.json 의 floor / wall 에셋으로 방을 만들고, 가구(에셋 이름 = 가구 type)를 놓는다.
 * 가구 placeholder 는 lab.json 치수로 만든 부품(테이블: 상판·다리, 찬장: 판·선반).
 */
export async function buildRoom(registry: AssetRegistry, room: RoomSize, furniture: readonly FurnitureDef[]): Promise<THREE.Group> {
  const group = new THREE.Group();
  const place = async (name: string, p: Placement): Promise<THREE.Object3D> => {
    const obj = await registry.create(name, p.sizeM);
    obj.position.set(...p.positionM);
    obj.rotation.y = p.rotationYRad;
    group.add(obj);
    return obj;
  };

  await place('floor', floorPlacement(room, registry.thicknessM('floor')));
  for (const w of wallPlacements(room, registry.thicknessM('wall'))) await place('wall', w);
  for (const f of furniture) {
    const obj = await registry.createAssembly(f.type, f.type === 'table' ? tableParts(f) : cupboardParts(f));
    obj.position.set(f.positionM[0], 0, f.positionM[2]);
    obj.rotation.y = (f.rotationYDeg * Math.PI) / 180;
    group.add(obj);
  }
  return group;
}
