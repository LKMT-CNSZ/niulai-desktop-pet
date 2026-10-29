'use strict';

const assert = require('node:assert/strict');
const {
  clampBoundsToWorkArea,
  pointInLocalRegion,
  quoteSideForWindow,
  stepHorizontal
} = require('../main-modules/roaming-geometry');

const primary = { x: 0, y: 0, width: 1920, height: 1040 };
assert.deepEqual(
  clampBoundsToWorkArea({ x: 1800, y: 980 }, primary),
  { x: 1620, y: 740, width: 300, height: 300 }
);
const leftDisplay = { x: -2560, y: -120, width: 2560, height: 1440 };
assert.deepEqual(
  clampBoundsToWorkArea({ x: -2800, y: -300 }, leftDisplay),
  { x: -2560, y: -120, width: 300, height: 300 }
);
assert.deepEqual(
  stepHorizontal({ x: 1618, y: 300 }, primary, 1, 8),
  { bounds: { x: 1620, y: 300, width: 300, height: 300 }, direction: -1 }
);
const scaled125 = { x: 0, y: 0, width: 1536, height: 824 };
assert.deepEqual(
  clampBoundsToWorkArea({ x: 1500, y: 800 }, scaled125),
  { x: 1236, y: 524, width: 300, height: 300 }
);
const scaled150 = { x: 1536, y: 0, width: 1280, height: 680 };
assert.deepEqual(
  clampBoundsToWorkArea({ x: 2750, y: 620 }, scaled150),
  { x: 2516, y: 380, width: 300, height: 300 }
);
const taskbarTop = { x: 0, y: 48, width: 1920, height: 1032 };
assert.deepEqual(
  clampBoundsToWorkArea({ x: 400, y: 0 }, taskbarTop),
  { x: 400, y: 48, width: 300, height: 300 }
);
const taskbarLeft = { x: 64, y: 0, width: 1856, height: 1080 };
assert.deepEqual(
  clampBoundsToWorkArea({ x: 0, y: 200 }, taskbarLeft),
  { x: 64, y: 200, width: 300, height: 300 }
);
const taskbarRight = { x: 0, y: 0, width: 1856, height: 1080 };
assert.deepEqual(
  clampBoundsToWorkArea({ x: 1800, y: 200 }, taskbarRight),
  { x: 1556, y: 200, width: 300, height: 300 }
);
const disconnectedDisplayBounds = { x: -1180, y: 260 };
assert.deepEqual(
  clampBoundsToWorkArea(disconnectedDisplayBounds, primary),
  { x: 0, y: 260, width: 300, height: 300 }
);
assert.equal(
  pointInLocalRegion({ x: 150, y: 100 }, { x: 0, y: 0 }, { x: 46, y: 64, width: 208, height: 165 }),
  true
);
assert.equal(
  pointInLocalRegion({ x: 12, y: 12 }, { x: 0, y: 0 }, { x: 46, y: 64, width: 208, height: 165 }),
  false
);
assert.equal(quoteSideForWindow({ x: 0, y: 200 }, primary), 'right');
assert.equal(quoteSideForWindow({ x: 1620, y: 200 }, primary), 'left');
assert.equal(quoteSideForWindow({ x: 620, y: 200 }, primary), 'right');
assert.equal(quoteSideForWindow({ x: 1000, y: 200 }, primary), 'left');
assert.equal(quoteSideForWindow({ x: -2560, y: 200 }, leftDisplay), 'right');
assert.equal(quoteSideForWindow({ x: -300, y: 200 }, leftDisplay), 'left');

console.log('roaming geometry tests passed');
