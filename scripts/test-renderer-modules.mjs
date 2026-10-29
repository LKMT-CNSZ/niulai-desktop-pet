import assert from 'node:assert/strict';
import { loadMarketEventSettings, loadPetSettings, loadPortfolio, loadSavedStocks, loadSelectedSymbol } from '../renderer-modules/storage.js';
import { MarketStore } from '../renderer-modules/market-data.js';
import { ActionScheduler } from '../renderer-modules/action-scheduler.js';
import { BehaviorStateMachine } from '../renderer-modules/behavior-state-machine.js';
import {
  COMIC_LAYER,
  EffectsManager
} from '../renderer-modules/effects-manager.js';
import { STATE } from '../renderer-modules/state.js';
import {
  SLEEP_VIEWPORT_MAX_SCALE,
  sleepViewportFit
} from '../renderer-modules/sleep-viewport-fit.js';

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
  }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const storage = new MemoryStorage({
  'niulai:pet-settings': JSON.stringify({ volume: 0.4, muted: true, displayMode: '2d' }),
  'niulai:portfolio': JSON.stringify({ symbol: 's_sz000001', cost: 18.5, shares: 1000 }),
  'niulai:selected-symbol': 's_sz000001'
});
const settings = loadPetSettings(storage);
assert.equal(settings.volume, 0.4);
assert.equal(settings.muted, true);
assert.equal(settings.displayMode, '2d');
assert.equal(settings.powerSave, true);
assert.equal(settings.roamingSpeed, 1);
assert.equal(settings.roamingFrequency, 1);
assert.equal(settings.allowRoaming, true);
assert.equal(settings.crossDisplayRoaming, false);
assert.equal(settings.quoteCardMode, 'follow');
assert.equal(settings.autoContinueRoaming, false);
assert.equal(settings.autoHome, true);
assert.equal(settings.extremeMarketPerformance, true);
assert.equal(settings.modelQuality, 'balanced');
assert.equal(settings.effectsQuality, 'balanced');
assert.equal(settings.maxFps, 60);
assert.equal(settings.emotionMemory, false);
assert.equal(settings.closeSummary, false);
assert.deepEqual(settings.markets, ['cn', 'hk', 'us']);
assert.deepEqual(settings.quietOffice, { enabled: false, start: '09:30', end: '11:30' });
const legacyFixedQuote = loadPetSettings(new MemoryStorage({
  'niulai:pet-settings': JSON.stringify({ quoteCardMode: 'home' })
}));
assert.equal(legacyFixedQuote.quoteCardMode, 'home');
const automaticMode = loadPetSettings(new MemoryStorage({
  'niulai:pet-settings': JSON.stringify({ displayMode: 'auto', autoContinueRoaming: true })
}));
assert.equal(automaticMode.displayMode, 'auto');
assert.equal(automaticMode.autoContinueRoaming, true);
assert.equal(automaticMode.autoHome, false, '旧版演后巡游字段应迁移为不自动回家');
const modernPerformance = loadPetSettings(new MemoryStorage({
  'niulai:pet-settings': JSON.stringify({
    roamingFrequency: 1.7,
    autoHome: true,
    extremeMarketPerformance: false,
    modelQuality: 'low',
    effectsQuality: 'high',
    maxFps: 30
  })
}));
assert.equal(modernPerformance.roamingFrequency, 1.7);
assert.equal(modernPerformance.autoHome, true);
assert.equal(modernPerformance.extremeMarketPerformance, false);
assert.equal(modernPerformance.modelQuality, 'low');
assert.equal(modernPerformance.effectsQuality, 'high');
assert.equal(modernPerformance.maxFps, 30);
const portfolio = loadPortfolio(storage);
assert.deepEqual(portfolio, { symbol: 's_sz000001', cost: 18.5, shares: 1000 });
assert.deepEqual(loadSavedStocks(storage).map((item) => item.symbol), ['s_sz000001']);
const multiMarketStocks = loadSavedStocks(new MemoryStorage({
  'niulai:saved-stocks-v1': JSON.stringify([
    { symbol: 'rt_hk00700', name: '腾讯控股', market: 'hk', cost: 400, shares: 200 },
    { symbol: 'gb_aapl', name: 'Apple', market: 'us', cost: 180, shares: 5.5 }
  ])
}));
assert.deepEqual(multiMarketStocks.map((item) => [item.symbol, item.shares]), [
  ['rt_hk00700', 200],
  ['gb_aapl', 5.5]
]);
assert.equal(loadSelectedSymbol('s_sh000001', storage), 's_sz000001');
const marketSettings = loadMarketEventSettings(
  { flatBandPct: 0.25, rapidRisePct: 0.6, cooldowns: { RAPID_RISE: 45000 } },
  new MemoryStorage({ 'niulai:market-event-settings': JSON.stringify({ rapidRisePct: 0.8 }) })
);
assert.deepEqual(marketSettings, {
  flatBandPct: 0.25,
  rapidRisePct: 0.8,
  cooldowns: { RAPID_RISE: 45000 }
});

const market = new MarketStore({ symbol: 's_sz000001', portfolio });
market.updateQuote({ price: 20, prevClose: 19, change: 1 });
assert.deepEqual(market.calculatePosition(), {
  todayPnl: 1000,
  totalPnl: 1500,
  totalPct: (1.5 / 18.5) * 100,
  previousClose: 19
});

let now = 1000;
const scheduler = new ActionScheduler({ now: () => now });
assert.equal(scheduler.run({ name: 'pray', priority: 60, cooldown: 500 }), true);
scheduler.finish('pray');
assert.equal(scheduler.run({ name: 'pray', priority: 60 }), false);
now = 1500;
assert.equal(scheduler.run({ name: 'pray', priority: 60 }), true);

const actionOrder = [];
const sequence = new ActionScheduler({ now: () => now });
assert.equal(sequence.run({
  name: 'ground_paw',
  priority: 52,
  start: () => actionOrder.push('ground_paw'),
  interrupt: () => actionOrder.push('ground_paw:interrupt'),
  recover: () => actionOrder.push('recover')
}), true);
assert.equal(sequence.run({
  name: 'charge',
  priority: 52,
  queue: true,
  start: () => actionOrder.push('charge'),
  recover: () => actionOrder.push('recover')
}), true);
assert.equal(sequence.run({
  name: 'brake',
  priority: 52,
  queue: true,
  start: () => actionOrder.push('brake'),
  recover: () => actionOrder.push('recover')
}), true);
assert.deepEqual(actionOrder, ['ground_paw']);
sequence.finish('ground_paw');
assert.deepEqual(actionOrder, ['ground_paw', 'charge']);
sequence.finish('charge');
assert.deepEqual(actionOrder, ['ground_paw', 'charge', 'brake']);
sequence.finish('brake');
assert.deepEqual(actionOrder, ['ground_paw', 'charge', 'brake', 'recover']);

const cancelled = [];
const cancellable = new ActionScheduler({ now: () => now });
cancellable.run({
  name: 'market-impact',
  priority: 24,
  start: () => cancelled.push('start'),
  interrupt: () => cancelled.push('interrupt'),
  recover: () => cancelled.push('recover')
});
cancellable.run({ name: 'queued-impact', priority: 24, queue: true, start: () => cancelled.push('queued') });
assert.equal(cancellable.cancelAll(), true);
assert.deepEqual(cancelled, ['start', 'interrupt']);
assert.equal(cancellable.active, null);
assert.equal(cancellable.queue.length, 0);

const priorityOrder = [];
const priorityScheduler = new ActionScheduler({ now: () => now });
priorityScheduler.run({
  name: 'idle',
  priority: 10,
  start: () => priorityOrder.push('idle'),
  interrupt: () => priorityOrder.push('idle:interrupt')
});
assert.equal(priorityScheduler.run({ name: 'low', priority: 5 }), false);
assert.equal(priorityScheduler.run({
  name: 'impact',
  priority: 80,
  start: () => priorityOrder.push('impact')
}), true);
assert.deepEqual(priorityOrder, ['idle', 'idle:interrupt', 'impact']);

const effects = new EffectsManager();
const effectEvents = [];
const removeEffectListener = effects.on('footstep_left', (payload) => effectEvents.push(payload));
assert.equal(effects.emit('footstep_left', { strength: 1 }), 1);
effects.configure(0);
assert.equal(effects.emit('footstep_left', { strength: 2 }), 0);
effects.configure(1);
removeEffectListener();
assert.equal(effects.emit('footstep_left', { strength: 3 }), 0);
assert.deepEqual(effectEvents, [{ strength: 1 }]);

const comic = new EffectsManager();
comic.configure({ level: 1, visible: true, sleeping: false, lowPower: false, role: 'roaming' });
const comicEvents = [];
for (const layer of Object.values(COMIC_LAYER)) {
  comic.onLayer(layer, (event) => comicEvents.push(event));
}
assert.ok(comic.beginPerformance('RAPID_RISE'));
comic.handleAnimationEvent({ type: 'animation-start', action: 'charge' });
assert.equal(comic.snapshot().slots[COMIC_LAYER.MAIN_TEXT].text, '牛来！');
assert.equal(comic.snapshot().slots[COMIC_LAYER.PRIMARY_PARTICLES].type, 'red-gold-burst');
comic.handleAnimationEvent({ type: 'keyframe', action: 'charge', event: 'nostril_smoke' });
comic.handleAnimationEvent({ type: 'keyframe', action: 'charge', event: 'impact_text' });
assert.ok(comicEvents.some((event) => event.layer === COMIC_LAYER.ACTION_SYNC && event.type === 'nostril-smoke'));
assert.ok(comicEvents.some((event) => event.layer === COMIC_LAYER.ACTION_SYNC && event.type === 'upward-impact-ring'));
assert.ok(comicEvents.some((event) => event.layer === COMIC_LAYER.COMPANION_PARTICLES && event.type === 'coins'));
assert.ok(comicEvents.some((event) => event.layer === COMIC_LAYER.WINDOW_FEEDBACK && event.type === 'impact-up'));
const quietEffects = new EffectsManager();
quietEffects.configure({ level: 1, visible: true, quietMode: true, lowPower: true });
assert.equal(quietEffects.trigger(COMIC_LAYER.MAIN_TEXT, 'comic-text', {}, { high: true }), null);
assert.equal(quietEffects.trigger(COMIC_LAYER.WINDOW_FEEDBACK, 'impact-up', {}), null);
assert.ok(quietEffects.trigger(COMIC_LAYER.COMPANION_PARTICLES, 'small-reminder', { count: 1 }));
const firstMainToken = comic.snapshot().slots[COMIC_LAYER.MAIN_TEXT].token;
comic.beginPerformance('LIMIT_UP');
comic.handleAnimationEvent({ type: 'animation-start', action: 'charge' });
assert.notEqual(comic.snapshot().slots[COMIC_LAYER.MAIN_TEXT].token, firstMainToken);
assert.equal(
  comicEvents.filter((event) => event.layer === COMIC_LAYER.MAIN_TEXT && event.type !== 'clear').length,
  2,
  'only one main-text slot is replaced instead of stacked'
);
comic.configure({ level: 1, visible: true, sleeping: false, lowPower: true });
assert.equal(comic.particleBudget(10), 4, 'low-power mode reduces particles');
comic.setContext({ sleeping: true });
assert.equal(comic.snapshot().slots[COMIC_LAYER.MAIN_TEXT], null);
assert.equal(comic.snapshot().slots[COMIC_LAYER.PRIMARY_PARTICLES], null);
assert.equal(
  comic.trigger(COMIC_LAYER.MAIN_TEXT, 'comic-text', { text: 'blocked' }, { high: true }),
  null,
  'sleep blocks high-intensity effects'
);

const transitions = [];
const machine = new BehaviorStateMachine({
  initial: STATE.CLOSED,
  now: () => now,
  onChange: (next) => transitions.push(next)
});
assert.equal(machine.transition(STATE.BULLISH, { priority: 10 }), true);
assert.equal(machine.transition(STATE.FLAT, { priority: 5, interrupt: false, queue: true }), false);
machine.recover(STATE.CLOSED);
assert.equal(machine.state, STATE.FLAT);
assert.deepEqual(transitions, [STATE.BULLISH, STATE.CLOSED, STATE.FLAT]);

const awakeFit = sleepViewportFit('HOME_AWAKE', 1);
assert.deepEqual(awakeFit, {
  amount: 0,
  maxScale: SLEEP_VIEWPORT_MAX_SCALE,
  x: 0,
  y: 0
});
const sleepFit = sleepViewportFit('HOME_SLEEPING', 1);
assert.equal(sleepFit.amount, 1);
assert.equal(sleepFit.maxScale, 0.82);
assert.ok(sleepFit.x < 0, 'sleeping bull shifts left so the head stays inside the window');
assert.ok(sleepFit.y > 0, 'sleeping bull keeps a small top margin');
assert.equal(sleepViewportFit('HOME_SLEEP_ENTER', 0).amount, 0);
assert.equal(sleepViewportFit('HOME_SLEEP_ENTER', 1).amount, 1);
assert.equal(sleepViewportFit('HOME_WAKING', 0).amount, 1);
assert.equal(sleepViewportFit('HOME_WAKING', 1).amount, 0);
assert.ok(
  sleepViewportFit('HOME_SLEEP_ENTER', 0.75).amount >
    sleepViewportFit('HOME_SLEEP_ENTER', 0.25).amount,
  'sleep viewport fit enters smoothly and monotonically'
);

console.log('renderer module tests passed');
