import assert from 'node:assert/strict';
import { EmotionMemory } from '../renderer-modules/emotion-memory.js';
import { DailySessionTracker } from '../renderer-modules/daily-session.js';
import {
  AlertTriggerEngine,
  normalizeAlertTriggers
} from '../renderer-modules/alert-trigger-engine.js';
import {
  isQuietOfficeActive,
  normalizeQuietOffice,
  quietRuntimeSettings
} from '../renderer-modules/quiet-office.js';

const openTime = new Date('2026-08-24T02:00:00.000Z').getTime();
let now = openTime;
const emotion = new EmotionMemory({ enabled: true, now: () => now });
const quoteInput = Object.freeze({ price: 108, changePct: 8 });
const positionInput = Object.freeze({ todayPnl: 8000, totalPnl: 12000, totalPct: 8, shares: 1000 });
emotion.update({
  quote: quoteInput,
  position: positionInput,
  marketOpen: true,
  events: [{ type: 'LIMIT_UP' }]
});
assert.ok(['excited', 'smug'].includes(emotion.snapshot().mood));
assert.equal(quoteInput.price, 108, '情绪系统不得修改行情对象');
assert.equal(positionInput.totalPnl, 12000, '情绪系统不得修改持仓对象');
assert.ok(emotion.idleProfile().idleActions.length >= 3);

const disabledEmotion = new EmotionMemory({ enabled: false, now: () => now });
const disabledBefore = disabledEmotion.snapshot();
disabledEmotion.update({ quote: { changePct: -10 }, events: [{ type: 'LIMIT_DOWN' }] });
assert.deepEqual(disabledEmotion.snapshot().values, disabledBefore.values);

const session = new DailySessionTracker({ now: () => now });
session.update({ quote: { changePct: 0.2 }, position: { todayPnl: 100 }, marketOpen: true });
now += 4000;
session.update({ quote: { changePct: 1.1 }, position: { todayPnl: 900 }, marketOpen: true });
now += 4000;
session.update({ quote: { changePct: 0.4 }, position: { todayPnl: 250 }, marketOpen: true });
const closed = session.close();
assert.equal(closed.samples, 3);
assert.equal(closed.maxFloatingProfit, 900);
assert.equal(closed.maxDrawdown, 650);
assert.equal(closed.strongestMove.direction, 'rise');
assert.equal(session.summary('得意').todayPnl, 250);

const quiet = normalizeQuietOffice({ enabled: true, start: '09:30', end: '11:30' });
assert.equal(isQuietOfficeActive(quiet, new Date('2026-08-24T02:00:00.000Z')), true);
assert.equal(isQuietOfficeActive(quiet, new Date('2026-08-24T04:00:00.000Z')), false);
assert.equal(
  isQuietOfficeActive({ enabled: true, start: '22:00', end: '07:00' }, new Date('2026-08-24T15:00:00.000Z')),
  true,
  '跨午夜时段应受支持'
);
const quietRuntime = quietRuntimeSettings({ muted: false, effects: 1, powerSave: false, roamingSpeed: 1 }, true);
assert.equal(quietRuntime.muted, true);
assert.equal(quietRuntime.powerSave, true);
assert.ok(quietRuntime.effects <= 0.18);
assert.ok(quietRuntime.roamingSpeed < 1);

now = openTime;
const triggers = normalizeAlertTriggers([
  { id: 'price', type: 'price', comparator: 'gte', value: 10, presentation: 'card' },
  { id: 'fall', type: 'rapid_fall', presentation: '3d', sound: true }
]);
const alerts = new AlertTriggerEngine({ triggers, now: () => now });
assert.equal(alerts.evaluate({ quote: { price: 9 }, events: [] }).length, 0);
assert.equal(alerts.evaluate({ quote: { price: 10.1 }, events: [] })[0].id, 'price');
assert.equal(alerts.evaluate({ quote: { price: 10.2 }, events: [] }).length, 0, '阈值上方抖动不能重复触发');
assert.equal(
  alerts.evaluate({ quote: { price: 10.2 }, events: [{ type: 'RAPID_FALL' }] })[0].id,
  'fall'
);
assert.equal(
  alerts.evaluate({ quote: { price: 10.2 }, events: [{ type: 'RAPID_FALL' }] }).length,
  0,
  '事件提醒应遵守冷却'
);

console.log('feature systems tests passed');

