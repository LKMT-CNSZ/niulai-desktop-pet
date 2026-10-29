import assert from 'node:assert/strict';
import { STATE } from '../renderer-modules/state.js';
import {
  MARKET_EVENT,
  MarketEventEngine,
  normalizeMarketEventConfig
} from '../renderer-modules/market-event-engine.js';
import {
  performanceForBaseState,
  performanceForMarketEvent
} from '../renderer-modules/market-event-actions.js';

let now = 100000;
const config = normalizeMarketEventConfig({
  flatBandPct: 0.25,
  baseHysteresisPct: 0.08,
  rapidWindowMs: 12000,
  rapidRisePct: 0.6,
  rapidFallPct: 0.6,
  breakoutLevelsPct: [1, 2, 3],
  mergeWindowMs: 10000,
  cooldowns: Object.fromEntries(Object.values(MARKET_EVENT).map((type) => [type, 30000]))
});
const quote = (changePct) => ({ price: 100 * (1 + changePct / 100), changePct });

const base = new MarketEventEngine({ config, now: () => now, symbol: 's_sh000001' });
assert.equal(base.process({ marketOpen: false, quote: quote(1) }).baseState, STATE.CLOSED);
assert.equal(base.process({ marketOpen: true, quote: quote(0.1) }).baseState, STATE.FLAT);
assert.equal(base.process({ marketOpen: true, quote: quote(0.3) }).baseState, STATE.BULLISH);
assert.equal(base.process({ marketOpen: true, quote: quote(0.2) }).baseState, STATE.BULLISH, '上涨迟滞带内不应抖回平盘');
assert.equal(base.process({ marketOpen: true, quote: quote(0.1) }).baseState, STATE.FLAT);
assert.equal(base.process({ marketOpen: true, quote: quote(0), connection: 'error' }).baseState, STATE.DISCONNECTED);

const rapid = new MarketEventEngine({ config, now: () => now, symbol: 's_sh000001' });
rapid.process({ marketOpen: true, quote: quote(0.1) });
now += 4000;
let result = rapid.process({ marketOpen: true, quote: quote(0.85) });
assert(result.events.some((event) => event.type === MARKET_EVENT.RAPID_RISE));
now += 3000;
result = rapid.process({ marketOpen: true, quote: quote(1.0) });
assert(!result.events.some((event) => event.type === MARKET_EVENT.RAPID_RISE), '冷却内快速拉升应合并');

now += 40000;
const jump = new MarketEventEngine({ config, now: () => now, symbol: 's_sh000001' });
jump.process({ marketOpen: true, quote: quote(-0.1) });
now += 4000;
result = jump.process({ marketOpen: true, quote: quote(-0.9) });
assert(result.events.some((event) => event.type === MARKET_EVENT.RAPID_FALL));

now += 40000;
const breakout = new MarketEventEngine({ config, now: () => now, symbol: 's_sh000001' });
breakout.process({ marketOpen: true, quote: quote(0.8) });
now += 4000;
result = breakout.process({ marketOpen: true, quote: quote(1.05) });
assert.deepEqual(result.events.map((event) => event.type), [MARKET_EVENT.BREAKOUT_UP]);
assert.equal(result.events[0].thresholdPct, 1);

now += 40000;
const holding = new MarketEventEngine({ config, now: () => now, symbol: 's_sh600519' });
holding.process({ marketOpen: true, quote: quote(-0.4), position: { totalPnl: -400, totalPct: -0.4 } });
now += 4000;
result = holding.process({ marketOpen: true, quote: quote(0.02), position: { totalPnl: 20, totalPct: 0.02 } });
assert(result.events.some((event) => event.type === MARKET_EVENT.POSITION_BREAKEVEN));

now += 40000;
const recovered = new MarketEventEngine({ config, now: () => now, symbol: 's_sh600519' });
recovered.process({ marketOpen: true, quote: quote(-0.5), position: { totalPnl: -500, totalPct: -0.5 } });
now += 4000;
result = recovered.process({ marketOpen: true, quote: quote(0.5), position: { totalPnl: 500, totalPct: 0.5 } });
assert(result.events.some((event) => event.type === MARKET_EVENT.POSITION_RECOVERED));

now += 40000;
const pullback = new MarketEventEngine({ config, now: () => now, symbol: 's_sh600519' });
pullback.process({ marketOpen: true, quote: quote(2), position: { totalPnl: 2000, totalPct: 2 } });
now += 4000;
result = pullback.process({ marketOpen: true, quote: quote(1), position: { totalPnl: 1000, totalPct: 1 } });
assert(result.events.some((event) => event.type === MARKET_EVENT.PROFIT_PULLBACK));

now += 40000;
const limit = new MarketEventEngine({ config, now: () => now, symbol: 's_sh600519' });
limit.process({ marketOpen: true, quote: quote(0) });
now += 4000;
result = limit.process({ marketOpen: true, quote: quote(config.limitUpPct + 0.05) });
assert.deepEqual(result.events.map((event) => event.type), [MARKET_EVENT.LIMIT_UP], '涨停应压制同方向低级事件叠加');

assert.deepEqual(performanceForBaseState(STATE.BULLISH, STATE.FLAT).actions, ['happy']);
assert.deepEqual(performanceForBaseState(STATE.BEARISH, STATE.FLAT).actions, ['sad']);
assert.deepEqual(performanceForMarketEvent({ type: MARKET_EVENT.RAPID_RISE }).actions, ['ground_paw', 'charge', 'brake']);
assert.deepEqual(performanceForMarketEvent({ type: MARKET_EVENT.RAPID_FALL }).actions, ['sad', 'fall', 'get_up']);

console.log('market event tests passed');
