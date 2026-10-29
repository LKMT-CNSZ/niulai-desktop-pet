'use strict';

const assert = require('node:assert/strict');
const {
  FORM_STATE,
  FormMorphStateMachine
} = require('../main-modules/form-morph-state-machine');

const manual2d = new FormMorphStateMachine();
manual2d.configure({ displayMode: '2d', powerSave: false, allowRoaming: true }, 'BULLISH');
assert.equal(manual2d.snapshot().activeForm, '2d');
assert.equal(manual2d.requestAutoPerformance({ type: 'LIMIT_UP' }).accepted, false);

const automatic = new FormMorphStateMachine();
automatic.configure({
  displayMode: 'auto',
  powerSave: false,
  allowRoaming: true,
  autoContinueRoaming: false
}, 'BULLISH');
assert.equal(automatic.state, FORM_STATE.TWO_D_HOME);
assert.equal(automatic.requestAutoPerformance({ type: 'BREAKOUT_UP' }).accepted, false);
assert.equal(automatic.requestAutoPerformance({ type: 'RAPID_RISE', direction: 1 }).accepted, true);
assert.equal(automatic.snapshot().activeForm, '3d');
automatic.roamingReady();
assert.equal(automatic.state, FORM_STATE.AUTO_PERFORMING);
automatic.performanceComplete();
assert.equal(automatic.state, FORM_STATE.AUTO_RETURNING);
automatic.homeArrived();
assert.equal(automatic.snapshot().activeForm, '2d');

const continueRoaming = new FormMorphStateMachine();
continueRoaming.configure({
  displayMode: 'auto',
  powerSave: false,
  allowRoaming: true,
  autoContinueRoaming: true
}, 'BEARISH');
continueRoaming.requestAutoPerformance({ type: 'RAPID_FALL', direction: -1 });
continueRoaming.roamingReady();
continueRoaming.performanceComplete();
assert.equal(continueRoaming.state, FORM_STATE.AUTO_ROAMING);
continueRoaming.configure({
  displayMode: 'auto',
  powerSave: false,
  allowRoaming: true,
  autoContinueRoaming: true,
  volume: 0.4
}, 'BULLISH');
assert.equal(continueRoaming.state, FORM_STATE.AUTO_ROAMING, '保存普通设置不能中断自动巡游');
continueRoaming.marketClosed();
assert.equal(continueRoaming.state, FORM_STATE.AUTO_RETURNING);
continueRoaming.homeArrived();
assert.equal(continueRoaming.snapshot().activeForm, '2d');

const powerSave = new FormMorphStateMachine();
powerSave.configure({ displayMode: 'auto', powerSave: true, allowRoaming: true }, 'BULLISH');
assert.deepEqual(
  powerSave.requestAutoPerformance({ type: 'LIMIT_UP' }).reason,
  'power-save'
);

const manual3d = new FormMorphStateMachine();
manual3d.configure({ displayMode: '3d', powerSave: true, allowRoaming: true }, 'BULLISH');
assert.equal(manual3d.snapshot().activeForm, '3d');
manual3d.marketClosed();
assert.equal(manual3d.state, FORM_STATE.MANUAL_RETURNING);
manual3d.homeArrived();
assert.equal(manual3d.state, FORM_STATE.THREE_D_HOME);

const override = new FormMorphStateMachine();
override.configure({ displayMode: 'auto', powerSave: false, allowRoaming: true }, 'BULLISH');
override.requestAutoPerformance({ type: 'LIMIT_UP' });
override.roamingReady();
override.configure({ displayMode: '2d', powerSave: false, allowRoaming: true }, 'BULLISH');
assert.equal(override.state, FORM_STATE.TWO_D_HOME, '手动2D必须立即覆盖自动3D');
assert.equal(override.snapshot().activeForm, '2d');

manual3d.fail3D('test-error');
assert.equal(manual3d.snapshot().activeForm, '2d');
assert.equal(manual3d.snapshot().preferredMode, '3d');

console.log('form morph state-machine tests passed');
