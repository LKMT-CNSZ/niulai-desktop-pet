import { MARKET_EVENT } from './market-event-engine.js';
import { STATE } from './state.js';

const PERFORMANCE = Object.freeze({
  [MARKET_EVENT.RAPID_RISE]: {
    priority: 24,
    queue: true,
    actions: ['ground_paw', 'charge', 'brake'],
    effectCue: 'RAPID_RISE',
    speech: '快速拉升！刨地、喷气，短冲一下！'
  },
  [MARKET_EVENT.RAPID_FALL]: {
    priority: 24,
    queue: true,
    actions: ['sad', 'fall', 'get_up'],
    effectCue: 'RAPID_FALL',
    speech: '快速跳水！扶稳行情牌！'
  },
  [MARKET_EVENT.BREAKOUT_UP]: {
    priority: 18,
    queue: true,
    actions: ['happy'],
    speech: (event) => `涨幅突破 +${Number(event.thresholdPct).toFixed(1)}%！`
  },
  [MARKET_EVENT.BREAKOUT_DOWN]: {
    priority: 18,
    queue: true,
    actions: ['sad'],
    speech: (event) => `跌幅跌破 -${Number(event.thresholdPct).toFixed(1)}%！`
  },
  [MARKET_EVENT.POSITION_BREAKEVEN]: {
    priority: 20,
    queue: true,
    actions: ['idle_look', 'happy'],
    speech: '持仓回到成本线附近，终于喘口气！'
  },
  [MARKET_EVENT.POSITION_RECOVERED]: {
    priority: 22,
    queue: true,
    actions: ['happy'],
    speech: '解套啦！这次真的回来了！'
  },
  [MARKET_EVENT.PROFIT_EXPANDED]: {
    priority: 18,
    queue: true,
    actions: ['happy'],
    speech: '盈利正在扩大，牛蹄站稳！'
  },
  [MARKET_EVENT.PROFIT_PULLBACK]: {
    priority: 20,
    queue: true,
    actions: ['sad'],
    speech: '盈利明显回撤，先把笑容收一收。'
  },
  [MARKET_EVENT.LIMIT_UP]: {
    priority: 48,
    queue: true,
    actions: ['ground_paw', 'charge', 'brake', 'happy'],
    effectCue: 'LIMIT_UP',
    speech: '涨停！牛来完整庆典启动！',
    rare: true
  },
  [MARKET_EVENT.LIMIT_DOWN]: {
    priority: 48,
    queue: true,
    actions: ['sad', 'fall', 'get_up'],
    effectCue: 'LIMIT_DOWN',
    speech: '跌停警报！先摔一跤，再爬起来。',
    rare: true
  }
});

export function performanceForMarketEvent(event) {
  const template = PERFORMANCE[event?.type];
  if (!template) return null;
  return {
    ...template,
    actions: [...template.actions],
    speech: typeof template.speech === 'function' ? template.speech(event) : template.speech
  };
}

export function performanceForBaseState(next, previous) {
  if (next === previous) return null;
  if (next === STATE.BULLISH) {
    return { priority: 10, queue: false, actions: ['happy'], speech: null, effectCue: 'UP' };
  }
  if (next === STATE.BEARISH) {
    return { priority: 10, queue: false, actions: ['sad'], speech: null, effectCue: 'DOWN' };
  }
  if (next === STATE.FLAT && [STATE.BULLISH, STATE.BEARISH].includes(previous)) {
    return { priority: 8, queue: false, actions: ['idle_look'], speech: null };
  }
  return null;
}
