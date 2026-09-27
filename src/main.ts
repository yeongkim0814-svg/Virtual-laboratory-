import * as THREE from 'three';
import './style.css';
import { AssetRegistry } from './assets/assetRegistry';
import { loadPublicJson } from './config/loadJson';
import type { AssetsFile, LabFile } from './config/types';
import { TouchControls } from './input/touchControls';
import { Player } from './player/player';
import { buildRoom } from './room/buildRoom';
import { EquipmentManager } from './equipment/equipmentManager';
import { loadEquipmentRegistry } from './equipment/registry';
import { fixtureItems, parseSetup, serializeSetup } from './equipment/setup';
import { SignalBus } from './signal/signalBus';
import { cableRouter } from './signal/cables';
import { CableView } from './signal/cableView';
import { CableLayout } from './signal/cableLayout';
import { LightRouter } from './signal/lightRouter';
import { GlowView } from './interaction/glowView';
import { LaserView } from './interaction/laserView';
import { PatternView } from './interaction/patternView';
import { ScreenOverlay } from './interaction/screenOverlay';
import { furnitureBoxes } from './room/furnitureParts';
import { EquipmentPanel } from './ui/equipmentPanel';
import { Hand } from './hand/hand';
import { Interaction } from './interaction/interaction';
import { HoldControls } from './ui/holdControls';
import { PlacementPreview } from './interaction/placementPreview';
import { RotateGizmo } from './interaction/rotateGizmo';
import { Surfaces } from './room/surfaces';

const MAX_DT_S = 0.1; // 탭 전환 등으로 프레임이 멈췄다 재개될 때 순간이동 방지

async function main(): Promise<void> {
  const [assetsFile, lab, defaultSetup] = await Promise.all([
    loadPublicJson<AssetsFile>('assets.json'),
    loadPublicJson<LabFile>('lab.json'),
    loadPublicJson<unknown>('setups/default.json'),
  ]);
  const equipmentRegistry = loadEquipmentRegistry();
  const fixtures = fixtureItems(lab.fixtures, equipmentRegistry.definitions);

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

  const assets = new AssetRegistry(assetsFile);
  const room = await buildRoom(assets, lab.room, lab.furniture);
  const surfaces = new Surfaces(lab.room, lab.furniture, lab.grid.cellSizeM);
  scene.add(room);

  // 신호는 케이블(전기) 또는 광선 추적(빛)으로만 전달(장비끼리 직접 참조 없음).
  const light = new LightRouter({
    bodyBoxes: () => equipment.bodyBoxes(),
    furnitureBoxes: furnitureBoxes(lab.furniture),
    room: lab.room,
  });
  const bus = new SignalBus(cableRouter(() => equipment.cables), { Light: light.router });
  const equipment: EquipmentManager = new EquipmentManager(scene, equipmentRegistry, assets, bus, {
    grid: { cellSizeM: lab.grid.cellSizeM, surfaces },
    portHitRadiusM: assetsFile.wiring.portHitRadiusM,
    fixtures,
  });
  const cableLayout = new CableLayout(equipment, lab, assetsFile.wiring.cableRadiusM, surfaces);
  const cableView = new CableView(scene, cableLayout.routes, cableLayout.plugs, assetsFile.wiring, () => assets.create('plug'));
  const laserView = new LaserView(scene, assetsFile.laserBeam);
  const screenOverlay = new ScreenOverlay(equipment, assetsFile.screenOverlay);
  const patternView = new PatternView(scene, assetsFile.screenOverlay);
  const glowView = new GlowView(equipment, assets);
  await equipment.load(parseSetup(defaultSetup, equipmentRegistry.definitions, fixtures));

  const camera = new THREE.PerspectiveCamera(lab.camera.fovDeg, 1, lab.camera.nearM, lab.camera.farM);
  scene.add(camera); // 손(뷰모델)이 카메라의 자식이므로 카메라도 씬에 넣는다
  const player = new Player(camera, lab);
  const controls = new TouchControls(renderer.domElement, lab.controls.joystickRadiusPx, lab.controls);
  const hand = new Hand(camera, await assets.create('hand-right'), await assets.create('hand-left'), equipment, lab.hand);
  const holdControls = new HoldControls(hand, player);
  const preview = new PlacementPreview(scene, assetsFile.placementPreview, lab.grid.cellSizeM);
  const interaction = new Interaction(
    camera, room, equipment, hand, player, lab, preview, (m) => holdControls.notify(m), assetsFile.wiring.selectedPortScale,
    cableLayout, new RotateGizmo(scene, assetsFile.rotateGizmo), cableView.plugGroup,
  );

  const panel = new EquipmentPanel(equipment, {
    onSave: () => downloadText('setup.json', serializeSetup(equipment.toSetupItems(), equipment.cables)),
    onLoadFile: (file) => {
      file
        .text()
        .then(async (text) => {
          const setup = parseSetup(JSON.parse(text), equipmentRegistry.definitions, fixtures);
          await equipment.validate(setup); // 격자 검사 실패 시 여기서 멈춤(손·장비 그대로)
          hand.reset();
          await equipment.load(setup);
        })
        .then(() => panel.refresh())
        .catch((err: unknown) => alert(`불러오기 실패: ${String(err)}`));
    },
  });
  panel.refresh();


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
    // 길게 누르기 → 장비 회전(그 손가락의 드래그는 시점·이동 대신 회전)
    const lp = controls.pollLongPress(performance.now() / 1000);
    if (lp && interaction.startRotate(lp)) controls.capture(lp.id);
    if (controls.capturing) interaction.rotateBy(controls.consumeCaptureDx());
    else interaction.endRotate();
    const look = controls.consumeLook();
    player.update(dtS, controls.move, look);
    for (const tap of controls.consumeTaps()) interaction.handleTap(tap);
    hand.update(dtS, look, player.walkedM);
    interaction.update();
    if (cableLayout.update().length > 0) holdControls.notify('케이블이 빠졌어요 (너무 멀거나 길이 막힘)');
    cableView.update();
    light.beginFrame();
    equipment.update(dtS);
    laserView.update(light.beams);
    screenOverlay.update();
    patternView.update(light.beams);
    glowView.update();
    panel.tick();
    holdControls.tick();
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

function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

main().catch((err) => {
  console.error(err);
  document.body.textContent = `초기화 실패: ${String(err)}`;
});
