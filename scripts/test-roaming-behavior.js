'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  BEHAVIOR,
  RoamingBehavior,
  normalizeAngle
} = require('../main-modules/roaming-behavior');

function seededRandom(seed = 123456789) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const primary = { id: 1, scaleFactor: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const left = { id: 2, scaleFactor: 1.5, workArea: { x: -1280, y: 0, width: 1280, height: 680 } };

function simulate({ fps, seconds, seed = 42, displays = [primary], crossDisplay = false, powerSave = false }) {
  const behavior = new RoamingBehavior({ random: seededRandom(seed) });
  behavior.configure({ speedScale: 1, powerSave, crossDisplay });
  behavior.setPosition({ x: 960, y: 500 }, 1);
  behavior.releaseFromHome(0);
  let accumulator = 0;
  const fixed = 1 / 60;
  const states = new Set();
  const actions = new Set();
  const stateCounts = new Map();
  let maxSpeed = 0;
  let crossingSeen = false;
  let previousPosition = null;
  let maxStepDistance = 0;
  let maxHeadingStep = 0;
  let previousHeading = null;
  for (let frame = 0; frame < fps * seconds; frame += 1) {
    accumulator += 1 / fps;
    while (accumulator + 1e-12 >= fixed) {
      const motion = behavior.tick(fixed, displays);
      states.add(motion.state);
      actions.add(motion.animation);
      stateCounts.set(motion.state, (stateCounts.get(motion.state) || 0) + 1);
      maxSpeed = Math.max(maxSpeed, motion.speed);
      crossingSeen ||= motion.crossing;
      if (previousPosition) {
        maxStepDistance = Math.max(
          maxStepDistance,
          Math.hypot(motion.x - previousPosition.x, motion.y - previousPosition.y)
        );
      }
      if (previousHeading !== null) {
        maxHeadingStep = Math.max(
          maxHeadingStep,
          Math.abs(normalizeAngle(motion.heading - previousHeading))
        );
      }
      previousPosition = { x: motion.x, y: motion.y };
      previousHeading = motion.heading;
      assert.ok(Number.isFinite(motion.x) && Number.isFinite(motion.y));
      accumulator -= fixed;
    }
  }
  return {
    behavior,
    snapshot: behavior.snapshot(),
    states,
    actions,
    stateCounts,
    maxSpeed,
    maxStepDistance,
    maxHeadingStep,
    crossingSeen
  };
}

const at30 = simulate({ fps: 30, seconds: 180, seed: 77 });
const at60 = simulate({ fps: 60, seconds: 180, seed: 77 });
assert.ok(Math.abs(at30.snapshot.x - at60.snapshot.x) < 0.001);
assert.ok(Math.abs(at30.snapshot.y - at60.snapshot.y) < 0.001);
assert.ok(at30.states.has(BEHAVIOR.WALK));
assert.ok(at30.states.has(BEHAVIOR.TURN));
assert.ok(at30.states.has(BEHAVIOR.IDLE));
assert.ok(at30.states.has(BEHAVIOR.OBSERVE));
assert.ok(at30.actions.has('idle_look'));
assert.ok(at30.maxSpeed <= 92.01);
assert.ok(at30.maxStepDistance <= 92.01 / 60 + 1e-6);
assert.ok(at30.maxHeadingStep <= at30.behavior.angularSpeed / 60 + 1e-6);
assert.ok(at30.snapshot.x >= 0 && at30.snapshot.x <= 1620);
assert.ok(at30.snapshot.y >= 0 && at30.snapshot.y <= 740);

const dragged = new RoamingBehavior({ random: seededRandom(9) });
dragged.setPosition({ x: 300, y: 200 }, 1);
dragged.releaseFromHome(0);
dragged.tick(1 / 60, [primary]);
dragged.setPosition({ x: 1210, y: 610 }, 1, { replan: true });
assert.equal(dragged.state, BEHAVIOR.IDLE);
assert.equal(dragged.snapshot().x, 1210);
assert.equal(dragged.snapshot().y, 610);

dragged.requestHome({ x: 1500, y: 690 }, 1);
for (let index = 0; index < 3600 && dragged.state !== BEHAVIOR.AT_HOME; index += 1) {
  dragged.tick(1 / 60, [primary]);
}
assert.equal(dragged.state, BEHAVIOR.AT_HOME);
assert.ok(Math.abs(dragged.snapshot().x - 1500) < 0.001);
assert.ok(Math.abs(dragged.snapshot().y - 690) < 0.001);
assert.ok(Math.abs(normalizeAngle(dragged.snapshot().heading - dragged.desiredHeading)) < 0.12);

const observer = new RoamingBehavior({ random: () => 0.1 });
observer.setPosition({ x: 600, y: 320 }, 1);
observer.heading = 0.35;
observer.enterIdle();
assert.equal(observer.state, BEHAVIOR.OBSERVE);
const observeStart = observer.heading;
let maximumLookAngle = 0;
let previousHeading = observer.heading;
for (let index = 0; index < 240 && observer.state === BEHAVIOR.OBSERVE; index += 1) {
  const motion = observer.tick(1 / 60, [primary]);
  maximumLookAngle = Math.max(maximumLookAngle, Math.abs(normalizeAngle(motion.heading - observeStart)));
  assert.ok(
    Math.abs(normalizeAngle(motion.heading - previousHeading)) <= observer.angularSpeed * 0.42 / 60 + 1e-9
  );
  previousHeading = motion.heading;
}
assert.ok(maximumLookAngle > 0.45);
assert.notEqual(observer.state, BEHAVIOR.OBSERVE);

const cross = new RoamingBehavior({ random: () => 0.1 });
cross.configure({ crossDisplay: true });
cross.setPosition({ x: 80, y: 220 }, 1);
cross.releaseFromHome(0);
cross.tick(1 / 60, [primary, left]);
assert.equal(String(cross.targetDisplayId), '2');
let crossed = false;
for (let index = 0; index < 12000 && cross.currentDisplayId !== 2; index += 1) {
  const motion = cross.tick(1 / 60, [primary, left]);
  crossed ||= motion.crossing;
}
assert.equal(cross.currentDisplayId, 2);
assert.equal(crossed, true);
assert.ok(cross.snapshot().x >= left.workArea.x);
assert.ok(cross.snapshot().x <= left.workArea.x + left.workArea.width - 300);

const lockedToPrimary = simulate({
  fps: 30,
  seconds: 10 * 60,
  seed: 61,
  displays: [primary, left],
  crossDisplay: false
});
assert.equal(String(lockedToPrimary.snapshot.displayId), '1');
assert.equal(lockedToPrimary.crossingSeen, false);

const edge = new RoamingBehavior({ random: seededRandom(5) });
edge.setPosition({ x: 1540, y: 300 }, 1);
edge.target = { x: 1598, y: 300 };
edge.targetDisplayId = 1;
edge.state = BEHAVIOR.WALK;
edge.heading = 0;
edge.velocity = 92;
let edgeMaximumX = edge.position.x;
let edgeDirectionChanged = false;
let edgeMinimumMovingSpeed = edge.velocity;
for (let index = 0; index < 300 && edge.state === BEHAVIOR.WALK; index += 1) {
  const motion = edge.tick(1 / 60, [primary]);
  edgeMaximumX = Math.max(edgeMaximumX, motion.x);
  edgeDirectionChanged ||= motion.direction < 0;
  if (motion.state === BEHAVIOR.WALK && motion.speed > 0) {
    edgeMinimumMovingSpeed = Math.min(edgeMinimumMovingSpeed, motion.speed);
  }
}
assert.ok(edgeMaximumX <= 1598 + 1e-6);
assert.equal(edgeDirectionChanged, false);
assert.ok(edgeMinimumMovingSpeed < 92);
assert.notEqual(edge.state, BEHAVIOR.WALK);

const returning = new RoamingBehavior({ random: seededRandom(88) });
returning.setPosition({ x: 300, y: 180 }, 1);
returning.requestHome({ x: 1420, y: 690 }, 1);
let farSpeed = 0;
let nearSpeed = Infinity;
for (let index = 0; index < 7200 && returning.state !== BEHAVIOR.AT_HOME; index += 1) {
  const motion = returning.tick(1 / 60, [primary]);
  const distance = Math.hypot(1420 - motion.x, 690 - motion.y);
  if (distance > 160) farSpeed = Math.max(farSpeed, motion.speed);
  if (distance < 12 && motion.speed > 0) nearSpeed = Math.min(nearSpeed, motion.speed);
}
assert.equal(returning.state, BEHAVIOR.AT_HOME);
assert.ok(Number.isFinite(nearSpeed));
assert.ok(nearSpeed < farSpeed);
assert.ok(Math.abs(normalizeAngle(returning.heading - returning.desiredHeading)) < 0.12);

const normalIdle = new RoamingBehavior({ random: () => 0.5 });
normalIdle.configure({ powerSave: false });
normalIdle.enterIdle();
const normalIdleDuration = normalIdle.idleRemaining;
const savingIdle = new RoamingBehavior({ random: () => 0.5 });
savingIdle.configure({ powerSave: true });
savingIdle.enterIdle();
assert.ok(savingIdle.idleRemaining > normalIdleDuration);

const emotionalIdle = new RoamingBehavior({ random: () => 0.9 });
emotionalIdle.configure({
  powerSave: false,
  emotion: 'tired',
  emotionProfile: {
    idleActions: ['idle_yawn', 'idle_breathe'],
    idleMultiplier: 1.6
  }
});
emotionalIdle.enterIdle(undefined, 'idle_yawn');
assert.equal(emotionalIdle.snapshot().emotion, 'tired');
assert.equal(emotionalIdle.snapshot().animation, 'idle_yawn');
assert.ok(emotionalIdle.idleRemaining > normalIdleDuration);

const quietIdle = new RoamingBehavior({ random: () => 0.5 });
quietIdle.configure({ powerSave: true, quietMode: true });
quietIdle.enterIdle();
assert.equal(quietIdle.snapshot().quietMode, true);
assert.ok(quietIdle.idleRemaining > savingIdle.idleRemaining);

const frequentRoaming = new RoamingBehavior({ random: () => 0.5 });
frequentRoaming.configure({ powerSave: false, frequencyScale: 2 });
frequentRoaming.enterIdle();
const infrequentRoaming = new RoamingBehavior({ random: () => 0.5 });
infrequentRoaming.configure({ powerSave: false, frequencyScale: 0.5 });
infrequentRoaming.enterIdle();
assert.ok(frequentRoaming.idleRemaining < infrequentRoaming.idleRemaining);

const longRun = simulate({ fps: 30, seconds: 30 * 60, seed: 1024 });
assert.ok(longRun.states.has(BEHAVIOR.WALK));
assert.ok(longRun.states.has(BEHAVIOR.IDLE));
assert.ok(longRun.states.has(BEHAVIOR.OBSERVE));
assert.ok(longRun.snapshot.x >= 0 && longRun.snapshot.x <= 1620);
assert.ok(longRun.snapshot.y >= 0 && longRun.snapshot.y <= 740);

const report = {
  valid: true,
  fixedStepSeconds: 1 / 60,
  frameRateComparison: {
    fps30: at30.snapshot,
    fps60: at60.snapshot,
    positionError: Math.hypot(at30.snapshot.x - at60.snapshot.x, at30.snapshot.y - at60.snapshot.y)
  },
  behaviorStates: [...longRun.states],
  idleActionsObserved: [...longRun.actions].filter((name) => name.startsWith('idle_')),
  maximumStepDistance: longRun.maxStepDistance,
  maximumHeadingStepRadians: longRun.maxHeadingStep,
  maximumSpeed: longRun.maxSpeed,
  longRunSeconds: 30 * 60,
  dragReplan: true,
  smoothReturnHome: true,
  edgeNoBounce: true,
  defaultSingleDisplay: true,
  crossDisplay: true,
  dpiScalesCoveredByGeometrySuite: [1, 1.25, 1.5],
  powerSaveLongerIdle: true
};

fs.mkdir(path.join(__dirname, '..', 'artifacts'), { recursive: true })
  .then(() => fs.writeFile(
    path.join(__dirname, '..', 'artifacts', 'roaming-behavior-validation.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  ))
  .then(() => console.log('roaming behavior tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
