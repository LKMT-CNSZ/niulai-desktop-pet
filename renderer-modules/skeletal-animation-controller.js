import * as THREE from 'three';

export const BULL_ACTIONS = Object.freeze([
  'idle_breathe',
  'idle_look',
  'idle_tail',
  'idle_scratch',
  'idle_yawn',
  'walk',
  'run',
  'turn_left',
  'turn_right',
  'happy',
  'sad',
  'ground_paw',
  'charge',
  'brake',
  'fall',
  'get_up',
  'sleep_enter',
  'sleep_loop',
  'wake_up',
  'click_react',
  'blink',
  'talk',
  'wave',
  'point_screen',
  'thumbs_up',
  'shrug',
  'hold_head',
  'facepalm',
  'nod',
  'shake_head',
  'jump',
  'ear_twitch'
]);

export const LOOPING_BULL_ACTIONS = Object.freeze([
  'idle_breathe',
  'idle_look',
  'idle_tail',
  'walk',
  'run',
  'sleep_loop'
]);

const LOOPING_ACTIONS = new Set(LOOPING_BULL_ACTIONS);

function normalizedName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, '_')
    .replace(/^bull_/, '');
}

function clipAliases(name) {
  const aliases = {
    idle_breathe: ['idle', 'breathe', 'idle01'],
    idle_look: ['look', 'look_around'],
    idle_tail: ['tail', 'tail_wag'],
    walk: ['walking', 'walk_cycle'],
    run: ['running', 'run_cycle'],
    turn_left: ['turnleft'],
    turn_right: ['turnright'],
    click_react: ['click', 'react']
  };
  return [name, ...(aliases[name] || [])].map(normalizedName);
}

export function inspectRig(root, clips = []) {
  let skinnedMeshes = 0;
  let bones = 0;
  root?.traverse?.((object) => {
    if (object.isSkinnedMesh) skinnedMeshes += 1;
    if (object.isBone) bones += 1;
  });
  const clipNames = clips.map((clip) => normalizedName(clip.name));
  return {
    skeletal: skinnedMeshes > 0 && bones > 0,
    skinnedMeshes,
    bones,
    clipNames,
    missingActions: BULL_ACTIONS.filter(
      (required) => !clipAliases(required).some((alias) => clipNames.includes(alias))
    )
  };
}

export class SkeletalAnimationController {
  constructor({ onEvent, onFallback, report } = {}) {
    this.onEvent = onEvent;
    this.onFallback = onFallback;
    this.report = report;
    this.root = null;
    this.mixer = null;
    this.actions = new Map();
    this.clips = new Map();
    this.contract = null;
    this.activeName = null;
    this.activeAction = null;
    this.activeLoop = false;
    this.activeMarkers = [];
    this.lastActionTime = 0;
    this.loopCount = 0;
    this.speed = 1;
    this.blendDuration = 0.28;
    this.boundSkeletalRig = false;
    this.missingReported = new Set();
    this.resumeName = 'idle_breathe';
    this.footNodes = { left: null, right: null };
    this.footRest = { left: null, right: null };
    this.rigControls = null;
    this.lookTarget = null;
    this.lookWeight = 0;
    this.ikTargets = new Map();
    this.deformationStates = new Map();
  }

  bind(root, clips = [], contract = null) {
    this.dispose();
    this.root = root;
    this.contract = contract;
    const inspection = inspectRig(root, clips);
    this.boundSkeletalRig = inspection.skeletal;
    if (!inspection.skeletal) return inspection;

    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of clips) {
      const key = normalizedName(clip.name);
      this.clips.set(key, clip);
      this.actions.set(key, this.mixer.clipAction(clip));
    }
    this.mixer.addEventListener('finished', (event) => {
      if (event.action !== this.activeAction) return;
      const completed = this.activeName;
      this.onEvent?.({ type: 'animation-finished', action: completed });
      if (this.activeName !== completed || this.activeAction !== event.action) return;
      this.activeLoop = false;
      if (!LOOPING_ACTIONS.has(completed)) this.play(this.resumeName, { force: true });
    });
    this.footNodes.left = root.getObjectByName('hoof_l');
    this.footNodes.right = root.getObjectByName('hoof_r');
    this.footRest = this.readFootPositions();
    this.rigControls = root.userData?.rig || root.children?.find?.((child) => child.userData?.rig)?.userData?.rig || null;
    this.deformationStates.clear();
    this.report?.(
      'info',
      `骨骼牛动作已绑定：${clips.length} 个片段，缺少 ${inspection.missingActions.length} 项`
    );
    return inspection;
  }

  resolve(name) {
    for (const alias of clipAliases(name)) {
      if (this.actions.has(alias)) return { key: alias, action: this.actions.get(alias), clip: this.clips.get(alias) };
    }
    return null;
  }

  play(name, options = {}) {
    const requested = normalizedName(name);
    const resolved = this.resolve(requested);
    if (!this.mixer || !resolved) {
      if (!this.missingReported.has(requested)) {
        this.missingReported.add(requested);
        this.onFallback?.(requested);
      }
      return false;
    }
    if (this.activeName === requested && !options.force) {
      if (Number.isFinite(options.timeScale)) this.activeAction.setEffectiveTimeScale(options.timeScale);
      return true;
    }

    const previous = this.activeAction;
    const next = resolved.action;
    const loop = options.loop ?? LOOPING_ACTIONS.has(requested);
    const fade = Math.max(0, Number(options.fade ?? this.blendDuration));
    next.enabled = true;
    next.reset();
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(Number(options.timeScale) || this.speed);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    if (previous && previous !== next) {
      if (fade > 0) previous.crossFadeTo(next, fade, false);
      else previous.stop();
    }
    next.play();

    this.activeName = requested;
    this.activeAction = next;
    this.activeLoop = loop;
    this.lastActionTime = 0;
    this.loopCount = 0;
    this.activeMarkers = this.markersFor(requested, resolved.clip);
    if (loop && requested.startsWith('idle_')) this.resumeName = requested;
    this.onEvent?.({ type: 'animation-start', action: requested });
    return true;
  }

  markersFor(name, clip) {
    const configured = this.contract?.actions?.[name]?.events;
    if (!Array.isArray(configured) || !clip?.duration) return [];
    return configured
      .map((marker) => ({
        ...marker,
        time: marker.normalizedTime !== undefined
          ? Number(marker.normalizedTime) * clip.duration
          : Number(marker.time)
      }))
      .filter((marker) => Number.isFinite(marker.time))
      .sort((a, b) => a.time - b.time);
  }

  setSpeed(value) {
    this.speed = THREE.MathUtils.clamp(Number(value) || 1, 0.1, 3);
    this.activeAction?.setEffectiveTimeScale(this.speed);
  }

  setBlendDuration(value) {
    this.blendDuration = THREE.MathUtils.clamp(Number(value) || 0, 0, 1.5);
  }

  setLookTarget(target, weight = 1) {
    if (!target) {
      this.lookTarget = null;
      this.lookWeight = 0;
      return false;
    }
    this.lookTarget = target.isVector3
      ? target.clone()
      : new THREE.Vector3(Number(target.x) || 0, Number(target.y) || 0, Number(target.z) || 0);
    this.lookWeight = THREE.MathUtils.clamp(Number(weight) || 0, 0, 1);
    return Boolean(this.root?.getObjectByName('head'));
  }

  setIkTarget(controlName, target, weight = 1) {
    const key = String(controlName || '');
    if (!target || weight <= 0) {
      this.ikTargets.delete(key);
      return false;
    }
    const position = target.isVector3
      ? target.clone()
      : new THREE.Vector3(Number(target.x) || 0, Number(target.y) || 0, Number(target.z) || 0);
    this.ikTargets.set(key, { position, weight: THREE.MathUtils.clamp(Number(weight) || 0, 0, 1) });
    return Boolean(this.rigControls?.ikChains?.[key]);
  }

  applyLookAt() {
    if (!this.lookTarget || this.lookWeight <= 0 || !this.root) return;
    const head = this.root.getObjectByName('head');
    if (!head?.parent) return;
    this.root.updateMatrixWorld(true);
    const origin = head.getWorldPosition(new THREE.Vector3());
    const localTarget = head.parent.worldToLocal(this.lookTarget.clone());
    const localOrigin = head.parent.worldToLocal(origin.clone());
    const direction = localTarget.sub(localOrigin).normalize();
    const yaw = THREE.MathUtils.clamp(Math.atan2(direction.x, direction.z), -0.58, 0.58);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(direction.y, Math.hypot(direction.x, direction.z)), -0.38, 0.38);
    const desired = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0));
    head.quaternion.slerp(desired, this.lookWeight);
    for (const name of ['eye_l', 'eye_r']) {
      const eye = this.root.getObjectByName(name);
      if (!eye) continue;
      const eyeDesired = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * 0.32, yaw * 0.42, 0));
      eye.quaternion.slerp(eyeDesired, this.lookWeight);
    }
    this.root.updateMatrixWorld(true);
  }

  solveIkChain(controlName, target) {
    const definition = this.rigControls?.ikChains?.[controlName];
    if (!definition || !this.root) return;
    const chain = definition.chain.map((name) => this.root.getObjectByName(name)).filter(Boolean);
    if (chain.length < 3) return;
    const effector = chain.at(-1);
    const joints = chain.slice(0, -1).slice(-2).reverse();
    for (let iteration = 0; iteration < 2; iteration += 1) {
      for (const joint of joints) {
        this.root.updateMatrixWorld(true);
        const jointPosition = joint.getWorldPosition(new THREE.Vector3());
        const effectorDirection = effector.getWorldPosition(new THREE.Vector3()).sub(jointPosition).normalize();
        const targetDirection = target.position.clone().sub(jointPosition).normalize();
        if (effectorDirection.lengthSq() < 0.5 || targetDirection.lengthSq() < 0.5) continue;
        const deltaWorld = new THREE.Quaternion().setFromUnitVectors(effectorDirection, targetDirection);
        const currentWorld = joint.getWorldQuaternion(new THREE.Quaternion());
        const desiredWorld = deltaWorld.multiply(currentWorld);
        const parentWorld = joint.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
        const desiredLocal = parentWorld.invert().multiply(desiredWorld);
        joint.quaternion.slerp(desiredLocal, target.weight * 0.68);
      }
    }
    this.root.updateMatrixWorld(true);
  }

  applyDeformationDrivers(deltaSeconds) {
    const drivers = this.rigControls?.deformationDrivers;
    if (!Array.isArray(drivers) || !this.root) return;
    const identity = new THREE.Quaternion();
    for (const driver of drivers) {
      const source = this.root.getObjectByName(driver.source);
      if (!source) continue;
      const response = THREE.MathUtils.clamp(Number(driver.response) || 18, 1, 60);
      const alpha = 1 - Math.exp(-response * Math.max(0, Math.min(0.1, deltaSeconds)));
      for (const definition of driver.helpers || []) {
        const helper = this.root.getObjectByName(definition.name);
        if (!helper) continue;
        let state = this.deformationStates.get(definition.name);
        if (!state) {
          state = {
            rest: helper.quaternion.clone(),
            current: helper.quaternion.clone()
          };
          this.deformationStates.set(definition.name, state);
        }
        const weight = THREE.MathUtils.clamp(Number(definition.weight) || 0, 0, 1);
        const partial = identity.clone().slerp(source.quaternion, weight);
        const desired = state.rest.clone().multiply(partial);
        state.current.slerp(desired, alpha);
        helper.quaternion.copy(state.current);
      }
    }
    this.root.updateMatrixWorld(true);
  }

  readFootPositions() {
    if (!this.root) return { left: null, right: null };
    this.root.updateMatrixWorld(true);
    const inverseRoot = this.root.matrixWorld.clone().invert();
    const read = (node) => {
      if (!node) return null;
      const position = node.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverseRoot);
      return { x: position.x, y: position.y, z: position.z };
    };
    return {
      left: read(this.footNodes.left),
      right: read(this.footNodes.right)
    };
  }

  getFootStatus() {
    const current = this.readFootPositions();
    const summarize = (side) => {
      const position = current[side];
      const rest = this.footRest[side];
      if (!position) return null;
      return {
        ...position,
        deltaY: rest ? position.y - rest.y : 0,
        driftXZ: rest ? Math.hypot(position.x - rest.x, position.z - rest.z) : 0
      };
    };
    return { left: summarize('left'), right: summarize('right') };
  }

  applyRoamingMotion(motion) {
    if (!motion) return false;
    if (this.activeAction?.isRunning() && !this.activeLoop) return true;
    const name = motion.animation || (motion.moving ? 'walk' : 'idle_breathe');
    const gaitScale = name === 'walk' || name === 'run'
      ? THREE.MathUtils.clamp(Number(motion.gaitScale) || 1, 0.35, 1.75)
      : 1;
    const fade = name.startsWith('turn_') ? 0.12 : name === 'walk' ? 0.20 : 0.32;
    return this.play(name, { timeScale: gaitScale, fade });
  }

  update(deltaSeconds) {
    if (!this.mixer || !this.activeAction) return;
    const before = this.activeAction.time;
    this.mixer.update(Math.max(0, Math.min(0.1, deltaSeconds)));
    const after = this.activeAction.time;
    const duration = this.activeAction.getClip().duration || 1;
    const wrapped = after < before;
    for (const marker of this.activeMarkers) {
      const crossed = wrapped
        ? marker.time >= before || marker.time <= after
        : marker.time > before && marker.time <= after;
      if (crossed) this.onEvent?.({ type: 'keyframe', action: this.activeName, ...marker });
    }
    if (wrapped) this.loopCount += 1;
    this.lastActionTime = after % duration;
    this.applyLookAt();
    for (const [controlName, target] of this.ikTargets) this.solveIkChain(controlName, target);
    this.applyDeformationDrivers(deltaSeconds);
  }

  isDrivingPose() {
    return Boolean(this.boundSkeletalRig && this.activeAction?.isRunning());
  }

  getStatus() {
    return {
      skeletal: this.boundSkeletalRig,
      active: this.activeName,
      speed: this.speed,
      blend: this.blendDuration,
      available: BULL_ACTIONS.filter((name) => Boolean(this.resolve(name))),
      missing: BULL_ACTIONS.filter((name) => !this.resolve(name)),
      controls: this.rigControls
    };
  }

  dispose() {
    if (this.mixer && this.root) this.mixer.uncacheRoot(this.root);
    this.root = null;
    this.mixer = null;
    this.actions.clear();
    this.clips.clear();
    this.activeName = null;
    this.activeAction = null;
    this.activeLoop = false;
    this.boundSkeletalRig = false;
    this.footNodes = { left: null, right: null };
    this.footRest = { left: null, right: null };
    this.rigControls = null;
    this.lookTarget = null;
    this.lookWeight = 0;
    this.ikTargets.clear();
    this.deformationStates.clear();
  }
}
