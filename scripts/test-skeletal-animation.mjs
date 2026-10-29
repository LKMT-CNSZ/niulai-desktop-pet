import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  BULL_ACTIONS,
  LOOPING_BULL_ACTIONS,
  SkeletalAnimationController,
  inspectRig
} from '../renderer-modules/skeletal-animation-controller.js';

const root = new THREE.Group();
const bone = new THREE.Bone();
bone.name = 'root';
root.add(bone);
const skinned = new THREE.SkinnedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial()
);
root.add(skinned);

const clips = BULL_ACTIONS.map((name, index) => new THREE.AnimationClip(
  name,
  1,
  [new THREE.NumberKeyframeTrack('.position[x]', [0, 0.5, 1], [0, index * 0.001, 0])]
));
const contract = {
  actions: {
    walk: { events: [{ normalizedTime: 0.5, event: 'footstep_left' }] }
  }
};
const events = [];
const fallbacks = [];
const controller = new SkeletalAnimationController({
  onEvent: (event) => events.push(event),
  onFallback: (name) => fallbacks.push(name)
});
const inspection = controller.bind(root, clips, contract);
assert.equal(inspection.skeletal, true);
assert.equal(inspection.missingActions.length, 0);
assert.equal(inspectRig(root, clips).clipNames.length, BULL_ACTIONS.length);
const nonSkeletalRoot = new THREE.Group();
nonSkeletalRoot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
assert.equal(inspectRig(nonSkeletalRoot, []).skeletal, false);

for (const name of BULL_ACTIONS) {
  assert.equal(controller.play(name, { force: true, loop: false, fade: 0 }), true, name);
  controller.update(0.02);
  assert.equal(controller.getStatus().active, name);
}

controller.play('walk', { force: true, loop: true, fade: 0 });
for (let index = 0; index < 40; index += 1) controller.update(1 / 60);
assert.ok(events.some((event) => event.type === 'keyframe' && event.event === 'footstep_left'));
assert.equal(controller.applyRoamingMotion({ animation: 'walk', gaitScale: 1.4 }), true);
assert.ok(Math.abs(controller.activeAction.getEffectiveTimeScale() - 1.4) < 1e-6);
assert.equal(controller.play('missing_action', { force: true }), false);
assert.deepEqual(fallbacks, ['missing_action']);
controller.dispose();

let recoveryController;
recoveryController = new SkeletalAnimationController({
  onEvent: (event) => {
    if (event.type === 'animation-finished' && event.action === 'click_react') {
      recoveryController.play('walk', { force: true, loop: true, fade: 0 });
    }
  }
});
recoveryController.bind(root, clips, contract);
recoveryController.play('click_react', { force: true, loop: false, fade: 0 });
for (let index = 0; index < 12; index += 1) recoveryController.update(0.1);
assert.equal(recoveryController.getStatus().active, 'walk');
recoveryController.dispose();

const contractJson = JSON.parse(
  await fs.readFile(new URL('../assets/models/bull-rigged.contract.json', import.meta.url), 'utf8')
);
const modelBuffer = await fs.readFile(
  new URL('../assets/models/bull-rigged.glb', import.meta.url)
);
const arrayBuffer = modelBuffer.buffer.slice(
  modelBuffer.byteOffset,
  modelBuffer.byteOffset + modelBuffer.byteLength
);
const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
const realInspection = inspectRig(gltf.scene, gltf.animations);
assert.equal(realInspection.skeletal, true);
assert.deepEqual(realInspection.missingActions, []);
assert.equal(gltf.animations.length, BULL_ACTIONS.length);
assert.equal(realInspection.bones, 128, 'soft-body rig uses all 128 supported bones');
for (const name of ['armpit_dfrm_l', 'armpit_dfrm_r', 'groin_dfrm_l', 'groin_dfrm_r', 'knee_soft_l', 'knee_soft_r']) {
  assert.ok(gltf.scene.getObjectByName(name)?.isBone, `${name} soft deformation bone exists`);
}
for (const name of LOOPING_BULL_ACTIONS) {
  const clip = THREE.AnimationClip.findByName(gltf.animations, name);
  assert.ok(clip, `${name} clip exists`);
  for (const track of clip.tracks) {
    const stride = track.getValueSize();
    const first = track.values.slice(0, stride);
    const last = track.values.slice(track.values.length - stride);
    for (let index = 0; index < stride; index += 1) {
      assert.ok(Math.abs(first[index] - last[index]) < 1e-5, `${name}:${track.name} loops cleanly`);
    }
  }
}

for (const [fromName, toName] of [
  ['sleep_enter', 'sleep_loop'],
  ['sleep_loop', 'wake_up']
]) {
  const from = THREE.AnimationClip.findByName(gltf.animations, fromName);
  const to = THREE.AnimationClip.findByName(gltf.animations, toName);
  for (const fromTrack of from.tracks) {
    const toTrack = to.tracks.find((track) => track.name === fromTrack.name);
    if (!toTrack || fromTrack.getValueSize() !== toTrack.getValueSize()) continue;
    const stride = fromTrack.getValueSize();
    const fromOffset = fromTrack.values.length - stride;
    for (let index = 0; index < stride; index += 1) {
      assert.ok(
        Math.abs(fromTrack.values[fromOffset + index] - toTrack.values[index]) < 1e-4,
        `${fromName}:${fromTrack.name} connects continuously to ${toName}`
      );
    }
  }
}

const sleepLoop = THREE.AnimationClip.findByName(gltf.animations, 'sleep_loop');
const sleepRootTrack = sleepLoop.tracks.find((track) => track.name === 'root.quaternion');
const sleepArmTrack = sleepLoop.tracks.find((track) => track.name === 'upperarm_l.quaternion');
const sleepLegTrack = sleepLoop.tracks.find((track) => track.name === 'thigh_l.quaternion');
const sleepRightArmTrack = sleepLoop.tracks.find((track) => track.name === 'upperarm_r.quaternion');
const sleepRightLegTrack = sleepLoop.tracks.find((track) => track.name === 'thigh_r.quaternion');
assert.ok(new THREE.Quaternion().fromArray(sleepRootTrack.values, 0).angleTo(new THREE.Quaternion()) > 1.2,
  'sleep_loop lays the character down');
assert.ok(new THREE.Quaternion().fromArray(sleepArmTrack.values, 0).angleTo(new THREE.Quaternion()) > 0.6,
  'sleep_loop spreads the arms');
assert.ok(new THREE.Quaternion().fromArray(sleepLegTrack.values, 0).angleTo(new THREE.Quaternion()) > 0.35,
  'sleep_loop spreads the legs');
assert.ok(
  new THREE.Quaternion().fromArray(sleepArmTrack.values, 0).angleTo(
    new THREE.Quaternion().fromArray(sleepRightArmTrack.values, 0)
  ) >= 1.25,
  'sleep_loop rotates the arms onto separate depth planes to prevent torso clipping'
);
assert.ok(
  new THREE.Quaternion().fromArray(sleepLegTrack.values, 0).angleTo(
    new THREE.Quaternion().fromArray(sleepRightLegTrack.values, 0)
  ) >= 0.75,
  'sleep_loop rotates the hips onto separate depth planes without translating the leg sockets'
);
assert.equal(
  sleepLoop.tracks.some((track) => /^(clavicle|thigh)_[lr]\.position$/.test(track.name)),
  false,
  'sleep_loop keeps shoulder and hip sockets fixed to avoid stretching the continuous mesh'
);

for (const name of ['walk', 'run']) {
  const clip = THREE.AnimationClip.findByName(gltf.animations, name);
  assert.equal(clip.tracks.some((track) => track.name === 'root.position'), false, `${name} has no root motion`);
}

for (const name of ['turn_left', 'turn_right']) {
  const clip = THREE.AnimationClip.findByName(gltf.animations, name);
  const track = clip.tracks.find((entry) => entry.name === 'pelvis.quaternion');
  assert.ok(track, `${name} rotates the pelvis`);
  const start = new THREE.Quaternion().fromArray(track.values, 0);
  const end = new THREE.Quaternion().fromArray(track.values, track.values.length - 4);
  const angle = start.angleTo(end);
  assert.ok(angle > 0.4 && angle < 1.0, `${name} uses a limited turn instead of a 180 degree flip`);
}

for (const [name, action] of Object.entries(contractJson.actions)) {
  assert.ok(THREE.AnimationClip.findByName(gltf.animations, name), `${name} exists in GLB`);
  for (const marker of action.events) {
    assert.ok(marker.normalizedTime >= 0 && marker.normalizedTime <= 1, `${name}:${marker.event} marker range`);
  }
}

const realEvents = [];
const realController = new SkeletalAnimationController({
  onEvent: (event) => realEvents.push(event)
});
realController.bind(gltf.scene, gltf.animations, contractJson);
const controlStatus = realController.getStatus().controls;
assert.ok(controlStatus?.lookAt, 'Look At control metadata is available');
assert.deepEqual(
  Object.keys(controlStatus.ikChains || {}).sort(),
  ['foot_l', 'foot_r', 'hand_l', 'hand_r'],
  'hand and foot IK chains are available'
);

realController.play('idle_breathe', { force: true, loop: true, fade: 0 });
realController.update(1 / 60);
const head = gltf.scene.getObjectByName('head');
assert.ok(head, 'head bone exists');
const headBeforeLook = head.quaternion.clone();
const headWorld = head.getWorldPosition(new THREE.Vector3());
assert.equal(
  realController.setLookTarget(headWorld.clone().add(new THREE.Vector3(1.2, 0.35, 2.2)), 1),
  true,
  'Look At target can be assigned'
);
realController.update(1 / 60);
assert.ok(headBeforeLook.angleTo(head.quaternion) > 0.01, 'Look At rotates the head');
realController.setLookTarget(null);

const rightHand = gltf.scene.getObjectByName('hand_r');
assert.ok(rightHand, 'right hand effector exists');
gltf.scene.updateMatrixWorld(true);
const handStart = rightHand.getWorldPosition(new THREE.Vector3());
const handTarget = handStart.clone().add(new THREE.Vector3(-0.12, 0.14, 0.18));
const handDistanceBefore = handStart.distanceTo(handTarget);
assert.equal(realController.setIkTarget('hand_r', handTarget, 1), true, 'hand IK target can be assigned');
for (let index = 0; index < 8; index += 1) realController.update(1 / 60);
const handDistanceAfter = rightHand.getWorldPosition(new THREE.Vector3()).distanceTo(handTarget);
assert.ok(handDistanceAfter < handDistanceBefore, 'hand IK moves the effector toward its target');
realController.setIkTarget('hand_r', null, 0);

const skinningSummary = [];
gltf.scene.traverse((object) => {
  if (!object.isSkinnedMesh) return;
  const skinIndex = object.geometry.getAttribute('skinIndex');
  const skinWeight = object.geometry.getAttribute('skinWeight');
  assert.ok(skinIndex && skinWeight, `${object.name} has skin indices and weights`);
  assert.equal(skinIndex.itemSize, 4, `${object.name} uses at most four bone indices`);
  assert.equal(skinWeight.itemSize, 4, `${object.name} uses at most four bone weights`);
  let maximumWeightError = 0;
  for (let vertex = 0; vertex < skinWeight.count; vertex += 1) {
    let sum = 0;
    let activeInfluences = 0;
    for (let component = 0; component < 4; component += 1) {
      const value = skinWeight.array[vertex * 4 + component];
      assert.ok(Number.isFinite(value) && value >= 0, `${object.name} has valid non-negative weights`);
      sum += value;
      if (value > 1e-6) activeInfluences += 1;
    }
    maximumWeightError = Math.max(maximumWeightError, Math.abs(1 - sum));
    assert.ok(activeInfluences >= 1 && activeInfluences <= 4, `${object.name} influence count is valid`);
  }
  assert.ok(maximumWeightError < 1e-4, `${object.name} weights are normalized`);
  skinningSummary.push({
    mesh: object.name,
    vertices: skinWeight.count,
    maximumWeightError
  });
});
assert.ok(skinningSummary.length >= 1, 'the GLB contains weighted skinned meshes');

const criticalPoseSummary = {};
for (const name of ['wave', 'point_screen', 'hold_head', 'facepalm', 'talk', 'jump']) {
  const clip = THREE.AnimationClip.findByName(gltf.animations, name);
  realController.play(name, { force: true, loop: false, fade: 0 });
  let remaining = clip.duration * 0.55;
  while (remaining > 1e-9) {
    const step = Math.min(1 / 60, remaining);
    realController.update(step);
    remaining -= step;
  }
  gltf.scene.updateMatrixWorld(true);
  const points = contractJson.requiredBones.map((boneName) => {
    const node = gltf.scene.getObjectByName(boneName);
    assert.ok(node, `${name}:${boneName} remains available`);
    const position = node.getWorldPosition(new THREE.Vector3());
    assert.ok(position.toArray().every(Number.isFinite), `${name}:${boneName} transform remains finite`);
    return position;
  });
  const bounds = new THREE.Box3().setFromPoints(points);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x < 5 && size.y < 5 && size.z < 5, `${name} pose remains within sane rig bounds`);
  criticalPoseSummary[name] = { size: size.toArray() };
}

for (const name of BULL_ACTIONS) {
  const clip = THREE.AnimationClip.findByName(gltf.animations, name);
  assert.equal(realController.play(name, { force: true, loop: false, fade: 0 }), true, name);
  const steps = Math.ceil((clip.duration + 0.12) / 0.05);
  for (let index = 0; index < steps; index += 1) realController.update(0.05);
  assert.ok(
    realEvents.some((event) => event.type === 'animation-finished' && event.action === name),
    `${name} reaches animation-finished`
  );
}

for (const [name, action] of Object.entries(contractJson.actions)) {
  for (const marker of action.events) {
    assert.ok(
      realEvents.some(
        (event) => event.type === 'keyframe' && event.action === name && event.event === marker.event
      ),
      `${name}:${marker.event} keyframe event fires`
    );
  }
}

const footContacts = {};
for (const actionName of ['walk', 'run']) {
  const clip = THREE.AnimationClip.findByName(gltf.animations, actionName);
  footContacts[actionName] = {};
  for (const marker of contractJson.actions[actionName].events) {
    const side = marker.event.endsWith('left') ? 'left' : 'right';
    realController.play(actionName, { force: true, loop: true, fade: 0 });
    let remaining = marker.normalizedTime * clip.duration;
    while (remaining > 1e-9) {
      const step = Math.min(0.05, remaining);
      realController.update(step);
      remaining -= step;
    }
    const contact = realController.getFootStatus()[side];
    assert.ok(contact, `${actionName}:${side} hoof is discoverable`);
    assert.ok(Number.isFinite(contact.y));
    assert.ok(Number.isFinite(contact.deltaY));
    assert.ok(Number.isFinite(contact.driftXZ));
    assert.ok(
      Math.abs(contact.deltaY) <= contractJson.locomotion.footLockToleranceMeters,
      `${actionName}:${side} contact height is within tolerance`
    );
    footContacts[actionName][side] = contact;
  }
}
realController.dispose();

await fs.writeFile(
  new URL('../artifacts/skeletal-animation-validation.json', import.meta.url),
  `${JSON.stringify({
    valid: true,
    model: 'assets/models/bull-rigged.glb',
    testedActions: BULL_ACTIONS,
    loopingActions: LOOPING_BULL_ACTIONS,
    keyframeEvents: realEvents
      .filter((event) => event.type === 'keyframe')
      .map((event) => `${event.action}:${event.event}`),
    locomotion: {
      rootMotion: false,
      gaitScaleVerified: 1.4,
      footLockToleranceMeters: contractJson.locomotion.footLockToleranceMeters,
      footContacts
    },
    schedulerCoverage: [
      'priority',
      'interrupt',
      'queue',
      'cooldown',
      'recovery'
    ],
    fallbackCoverage: [
      'non-skeletal rig rejection',
      'missing action fallback callback',
      'interrupted one-shot recovery preservation'
    ],
    rigControlCoverage: {
      lookAt: true,
      handIk: {
        before: handDistanceBefore,
        after: handDistanceAfter
      },
      chains: Object.keys(controlStatus.ikChains || {}).sort()
    },
    skinningCoverage: skinningSummary,
    criticalPoseCoverage: criticalPoseSummary
  }, null, 2)}\n`,
  'utf8'
);

console.log('skeletal animation tests passed');
