import * as THREE from './node_modules/three/build/three.module.js';
import { GLTFLoader } from './node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const params = new URLSearchParams(location.search);
const view = params.get('view') || 'front';
const requestedAction = params.get('action') || 'idle_breathe';
const requestedPose = Number(params.get('pose'));
const requestedModel = params.get('model') || './assets/models/bull-rigged.glb';
const useFurTexture = params.get('fur') !== '0';
const viewNames = { front: '正面', side: '侧面', back: '背面', small80: '80像素辨识度' };
document.getElementById('label').textContent = `电影造型连续网格版 · ${viewNames[view] || view}${requestedAction === 'idle_breathe' ? '' : ` · ${requestedAction}`}`;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(600, 600);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1.35, 1.35, 1.35, -1.35, 0.1, 30);
scene.add(new THREE.HemisphereLight(0xfff4df, 0x6e5845, 2.35));
const key = new THREE.DirectionalLight(0xffe4bc, 3.2);
key.position.set(3.5, 5.5, 5);
scene.add(key);
const rim = new THREE.DirectionalLight(0x8fc4ff, 1.35);
rim.position.set(-4, 3, -4);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(0.85, 64),
  new THREE.MeshBasicMaterial({ color: 0x6d4a2f, transparent: true, opacity: 0.10, depthWrite: false })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0.002;
scene.add(ground);

function placeCamera(kind) {
  if (kind === 'side') camera.position.set(5, 1.18, 0);
  else if (kind === 'back') camera.position.set(0, 1.18, -5);
  else camera.position.set(0, 1.18, 5);
  camera.lookAt(0, 1.18, 0);
}

placeCamera(view);

async function loadPreview() {
try {
  const [gltf, furTexture] = await Promise.all([
    new GLTFLoader().loadAsync(requestedModel),
    useFurTexture
      ? new THREE.TextureLoader().loadAsync('./assets/textures/bull-fur-v2.png')
      : Promise.resolve(null)
  ]);
  const bull = gltf.scene;
  if (furTexture) {
    furTexture.colorSpace = THREE.SRGBColorSpace;
    furTexture.wrapS = THREE.RepeatWrapping;
    furTexture.wrapT = THREE.RepeatWrapping;
    furTexture.repeat.set(3.5, 3.5);
    furTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  }
  bull.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!furTexture || !material || !/^fur_/.test(material.name || '')) continue;
      material.map = furTexture;
      material.color.set(0xffffff);
      material.roughness = 0.82;
      material.needsUpdate = true;
    }
  });
  bull.name = 'BullPreviewRoot';
  scene.add(bull);
  bull.updateMatrixWorld(true);
  const initialBox = new THREE.Box3().setFromObject(bull);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  const fullHeightScale = 2.22 / Math.max(0.001, initialSize.y);
  const targetScale = view === 'small80' ? fullHeightScale * (80 / 500) : fullHeightScale;
  bull.scale.setScalar(targetScale);
  bull.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(bull);
  const center = box.getCenter(new THREE.Vector3());
  bull.position.x -= center.x;
  bull.position.y -= box.min.y;
  bull.position.z -= center.z;
  if (view === 'small80') bull.position.y += 0.82;

  const rigOwner = bull.getObjectByProperty('userData.rig.version') || (() => {
    let owner = null;
    bull.traverse((object) => {
      if (!owner && object.userData?.rig?.deformationDrivers) owner = object;
    });
    return owner;
  })();
  const helperRest = new Map();
  for (const driver of rigOwner?.userData?.rig?.deformationDrivers || []) {
    for (const definition of driver.helpers || []) {
      const helper = bull.getObjectByName(definition.name);
      if (helper) helperRest.set(definition.name, helper.quaternion.clone());
    }
  }

  const mixer = new THREE.AnimationMixer(bull);
  const clip = THREE.AnimationClip.findByName(gltf.animations, requestedAction) || THREE.AnimationClip.findByName(gltf.animations, 'idle_breathe');
  if (clip) mixer.clipAction(clip).play();
  mixer.update(Number.isFinite(requestedPose) ? requestedPose : requestedAction === 'idle_breathe' ? 0.36 : Math.max(0.05, clip.duration * 0.52));
  const identity = new THREE.Quaternion();
  for (const driver of rigOwner?.userData?.rig?.deformationDrivers || []) {
    const source = bull.getObjectByName(driver.source);
    if (!source) continue;
    for (const definition of driver.helpers || []) {
      const helper = bull.getObjectByName(definition.name);
      const rest = helperRest.get(definition.name);
      if (!helper || !rest) continue;
      const weight = THREE.MathUtils.clamp(Number(definition.weight) || 0, 0, 1);
      helper.quaternion.copy(rest).multiply(identity.clone().slerp(source.quaternion, weight));
    }
  }
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);

  let skinnedMeshes = 0;
  let bones = 0;
  let triangles = 0;
  bull.traverse((object) => {
    if (object.isSkinnedMesh) {
      skinnedMeshes += 1;
      triangles += object.geometry.index
        ? object.geometry.index.count / 3
        : object.geometry.attributes.position.count / 3;
    }
    if (object.isBone) bones += 1;
  });
  document.getElementById('metrics').textContent = `${Math.round(triangles).toLocaleString()} 三角面 · ${bones} 骨骼 · ${gltf.animations.length} 动作`;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  renderer.render(scene, camera);
  window.__MODEL_PREVIEW__ = { ready: true, view, action: requestedAction, model: requestedModel, skinnedMeshes, bones, animations: gltf.animations.length };
} catch (error) {
  document.getElementById('metrics').textContent = `加载失败：${error.message}`;
  window.__MODEL_PREVIEW__ = { ready: false, error: error.message };
}
}

loadPreview();
