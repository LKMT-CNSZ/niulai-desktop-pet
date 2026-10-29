'use strict';

const assert = require('assert');
const {
  HOME_PHASE,
  HOME_TIMING,
  phaseShowsHome3D,
  phaseShowsRoaming3D,
  returnTimeoutMs,
  windowDistance
} = require('../main-modules/home-lifecycle');
const { BEHAVIOR, RoamingBehavior } = require('../main-modules/roaming-behavior');

assert.strictEqual(phaseShowsHome3D(HOME_PHASE.HOME_SLEEPING), true);
assert.strictEqual(phaseShowsHome3D(HOME_PHASE.ROAMING), false);
assert.strictEqual(phaseShowsRoaming3D(HOME_PHASE.RETURNING), true);
assert.strictEqual(phaseShowsRoaming3D(HOME_PHASE.ENTERING_HOME), true);
assert.strictEqual(phaseShowsRoaming3D(HOME_PHASE.HOME_SLEEPING), false);
assert(HOME_TIMING.enterDoorMs >= 500);
assert(HOME_TIMING.sleepEnterMs >= 1000);
assert.strictEqual(windowDistance({ x: 0, y: 0 }, { x: 300, y: 400 }), 500);
assert(returnTimeoutMs(0, 1) >= 18000);
assert(returnTimeoutMs(100000, 0.3) <= 60000);

const display = {
  id: 1,
  workArea: { x: 0, y: 0, width: 1920, height: 1040 }
};
const behavior = new RoamingBehavior({ windowSize: 300, random: () => 0.42 });
behavior.configure({ speedScale: 1, powerSave: false, crossDisplay: false });
behavior.setPosition({ x: 180, y: 220 }, display.id);
const firstHome = { x: 1180, y: 680, width: 300, height: 300 };
behavior.requestHome(firstHome, display.id);

let elapsed = 0;
let movedHome = false;
while (behavior.state !== BEHAVIOR.AT_HOME && elapsed < 30) {
  behavior.tick(1 / 60, [display]);
  elapsed += 1 / 60;
  if (!movedHome && elapsed > 2) {
    movedHome = true;
    behavior.updateHomeTarget({ x: 1090, y: 620, width: 300, height: 300 }, display.id);
  }
}
assert.strictEqual(behavior.state, BEHAVIOR.AT_HOME, '牛应在超时前走回更新后的家');
assert(Math.abs(behavior.position.x - 1090) < 0.01);
assert(Math.abs(behavior.position.y - 620) < 0.01);
assert.strictEqual(behavior.snapshot().recalled, true);

behavior.setPosition({ x: 200, y: 300 }, display.id, { replan: true });
behavior.forceHome(firstHome, display.id);
assert.strictEqual(behavior.state, BEHAVIOR.AT_HOME);
assert.strictEqual(behavior.velocity, 0);
assert.deepStrictEqual(behavior.position, { x: firstHome.x, y: firstHome.y });

console.log(JSON.stringify({
  ok: true,
  simulatedReturnSeconds: Number(elapsed.toFixed(3)),
  phases: Object.values(HOME_PHASE),
  safeTimeoutRangeMs: [returnTimeoutMs(0, 1), returnTimeoutMs(100000, 0.3)]
}, null, 2));
