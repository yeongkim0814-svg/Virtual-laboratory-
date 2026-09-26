import * as THREE from 'three';
import type { AssetRegistry } from '../assets/assetRegistry';
import type { FurnitureDef, RoomSize } from '../config/types';
import { FLOOR } from './surfaces';
import { floorPlacement, wallPlacements, type Placement } from './roomLayout';

/**
 * assets.json 의 floor / wall 에셋으로 방을 만들고, 가구(에셋 이름 = 가구 type)를 놓는다.
 * 놓을 수 있는 면에는 userData.placeSurface = 면 id, 찬장에는 userData.cupboardId 를 단다.
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

  const floor = await place('floor', floorPlacement(room, registry.thicknessM('floor')));
  floor.userData.placeSurface = FLOOR;
  for (const w of wallPlacements(room, registry.thicknessM('wall'))) await place('wall', w);
  for (const f of furniture) {
    const obj = await place(f.type, { positionM: [f.positionM[0], 0, f.positionM[2]], rotationYRad: (f.rotationYDeg * Math.PI) / 180, sizeM: f.sizeM });
    if (f.type === 'table') obj.userData.placeSurface = f.id;
    else obj.userData.cupboardId = f.id;
  }
  return group;
}
