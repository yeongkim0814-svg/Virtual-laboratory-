import * as THREE from 'three';
import './style.css';
import { AssetRegistry } from './assets/assetRegistry';
import { loadPublicJson } from './config/loadJson';
import type { AssetsFile, LabFile } from './config/types';
import { TouchControls } from './input/touchControls';
import { Player } from './player/player';
import { buildRoom } from './room/buildRoom';

const MAX_DT_S = 0.1; // 탭 전환 등으로 프레임이 멈췄다 재개될 때 순간이동 방지

async function main(): Promise<void> {
  const [assetsFile, lab] = await Promise.all([
    loadPublicJson<AssetsFile>('assets.json'),
    loadPublicJson<LabFile>('lab.json'),
  ]);

  // 그림자·후처리 기본 OFF
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  document.body.appendChild(renderer.domElement);

  const env = assetsFile.environment;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(env.backgroundColor);
  scene.add(new THREE.AmbientLight(env.ambientLightColor, env.ambientLightIntensity));
  const sun = new THREE.DirectionalLight(env.sunLightColor, env.sunLightIntensity);
  sun.position.set(...env.sunLightDirection);
  scene.add(sun);

  scene.add(await buildRoom(new AssetRegistry(assetsFile), lab.room));

  const camera = new THREE.PerspectiveCamera(lab.camera.fovDeg, 1, lab.camera.nearM, lab.camera.farM);
  const player = new Player(camera, lab);
  const controls = new TouchControls(renderer.domElement, lab.controls.joystickRadiusPx);

  const resize = (): void => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const fpsEl = document.getElementById('fps')!;
  let frames = 0;
  let fpsTimerS = 0;
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const dtS = Math.min(clock.getDelta(), MAX_DT_S);
    player.update(dtS, controls.move, controls.consumeLook());
    renderer.render(scene, camera);

    frames++;
    fpsTimerS += dtS;
    if (fpsTimerS >= 1) {
      fpsEl.textContent = `${Math.round(frames / fpsTimerS)} fps`;
      frames = 0;
      fpsTimerS = 0;
    }
  });
}

main().catch((err) => {
  console.error(err);
  document.body.textContent = `초기화 실패: ${String(err)}`;
});
