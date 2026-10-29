import { STATE } from './state.js';

export const MARKET_EVENT = Object.freeze({
  RAPID_RISE: 'RAPID_RISE',
  RAPID_FALL: 'RAPID_FALL',
  BREAKOUT_UP: 'BREAKOUT_UP',
  BREAKOUT_DOWN: 'BREAKOUT_DOWN',
  POSITION_BREAKEVEN: 'POSITION_BREAKEVEN',
  POSITION_RECOVERED: 'POSITION_RECOVERED',
  PROFIT_EXPANDED: 'PROFIT_EXPANDED',
  PROFIT_PULLBACK: 'PROFIT_PULLBACK',
  LIMIT_UP: 'LIMIT_UP',
  LIMIT_DOWN: 'LIMIT_DOWN'
});

export const DEFAULT_MARKET_EVENT_CONFIG = Object.freeze({
  flatBandPct: 0.25,
  baseHysteresisPct: 0.08,
  rapidWindowMs: 12000,
  rapidRisePct: 0.6,
  rapidFallPct: 0.6,
  breakoutLevelsPct: Object.freeze([1, 2, 3, 5, 7]),
  breakoutHysteresisPct: 0.18,
  breakevenBandPct: 0.15,
  recoveredHysteresisPct: 0.25,
  profitExpansionAmount: 500,
  profitExpansionPct: 0.3,
  profitPullbackAmount: 300,
  profitPullbackRatio: 0.25,
  limitUpPct: 9.8,
  limitDownPct: -9.8,
  limitHysteresisPct: 0.25,
  mergeWindowMs: 12000,
  cooldowns: Object.freeze({
    [MARKET_EVENT.RAPID_RISE]: 45000,
    [MARKET_EVENT.RAPID_FALL]: 45000,
    [MARKET_EVENT.BREAKOUT_UP]: 30000,
    [MARKET_EVENT.BREAKOUT_DOWN]: 30000,
    [MARKET_EVENT.POSITION_BREAKEVEN]: 120000,
    [MARKET_EVENT.POSITION_RECOVERED]: 180000,
    [MARKET_EVENT.PROFIT_EXPANDED]: 60000,
    [MARKET_EVENT.PROFIT_PULLBACK]: 90000,
    [MARKET_EVENT.LIMIT_UP]: 300000,
    [MARKET_EVENT.LIMIT_DOWN]: 300000
  })
});

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback, minimum = 0) {
  return Math.max(minimum, finite(value, fallback));
}

function sortedLevels(value) {
  const source = Array.isArray(value) ? value : DEFAULT_MARKET_EVENT_CONFIG.breakoutLevelsPct;
  const levels = [...new Set(source
    .map((item) => positive(item, 0))
    .filter((item) => item > 0 && item < 20))]
    .sort((a, b) => a - b);
  return levels.length ? levels : [...DEFAULT_MARKET_EVENT_CONFIG.breakoutLevelsPct];
}

export function normalizeMarketEventConfig(input = {}) {
  const defaults = DEFAULT_MARKET_EVENT_CONFIG;
  const cooldowns = {};
  for (const type of Object.values(MARKET_EVENT)) {
    cooldowns[type] = positive(input.cooldowns?.[type], defaults.cooldowns[type]);
  }
  return {
    flatBandPct: positive(input.flatBandPct, defaults.flatBandPct),
    baseHysteresisPct: positive(input.baseHysteresisPct, defaults.baseHysteresisPct),
    rapidWindowMs: positive(input.rapidWindowMs, defaults.rapidWindowMs, 1000),
    rapidRisePct: positive(input.rapidRisePct, defaults.rapidRisePct, 0.01),
    rapidFallPct: positive(input.rapidFallPct, defaults.rapidFallPct, 0.01),
    breakoutLevelsPct: sortedLevels(input.breakoutLevelsPct),
    breakoutHysteresisPct: positive(input.breakoutHysteresisPct, defaults.breakoutHysteresisPct),
    breakevenBandPct: positive(input.breakevenBandPct, defaults.breakevenBandPct),
    recoveredHysteresisPct: positive(input.recoveredHysteresisPct, defaults.recoveredHysteresisPct),
    profitExpansionAmount: positive(input.profitExpansionAmount, defaults.profitExpansionAmount),
    profitExpansionPct: positive(input.profitExpansionPct, defaults.profitExpansionPct),
    profitPullbackAmount: positive(input.profitPullbackAmount, defaults.profitPullbackAmount),
    profitPullbackRatio: Math.min(1, positive(input.profitPullbackRatio, defaults.profitPullbackRatio)),
    limitUpPct: positive(input.limitUpPct, defaults.limitUpPct, 0.1),
    limitDownPct: -positive(Math.abs(finite(input.limitDownPct, defaults.limitDownPct)), Math.abs(defaults.limitDownPct), 0.1),
    limitHysteresisPct: positive(input.limitHysteresisPct, defaults.limitHysteresisPct),
    mergeWindowMs: positive(input.mergeWindowMs, defaults.mergeWindowMs),
    cooldowns
  };
}

function quoteSnapshot(quote, timestamp) {
  if (!quote) return null;
  const price = Number(quote.price);
  const changePct = Number(quote.changePct);
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) return null;
  return { timestamp, price, changePct };
}

export class MarketEventEngine {
  constructor({ config, now = () => Date.now(), symbol = '' } = {}) {
    this.now = now;
    this.config = normalizeMarketEventConfig(config);
    this.symbol = symbol;
    this.baseState = STATE.CLOSED;
    this.wasOpen = false;
    this.samples = [];
    this.previousPosition = null;
    this.profitPeak = 0;
    this.breakoutUp = new Set();
    this.breakoutDown = new Set();
    this.limitUpLatched = false;
    this.limitDownLatched = false;
    this.lastEmitted = new Map();
  }

  configure(config) {
    this.config = normalizeMarketEventConfig(config);
    return this.config;
  }

  setSymbol(symbol) {
    if (String(symbol) === String(this.symbol)) return;
    this.symbol = String(symbol || '');
    this.resetSession();
    this.previousPosition = null;
    this.lastEmitted.clear();
  }

  resetSession() {
    this.samples = [];
    this.profitPeak = 0;
    this.breakoutUp.clear();
    this.breakoutDown.clear();
    this.limitUpLatched = false;
    this.limitDownLatched = false;
  }

  classify({ marketOpen, quote, connection = 'connected' }) {
    if (!marketOpen) {
      this.baseState = STATE.CLOSED;
      return this.baseState;
    }
    if (connection === 'error') {
      this.baseState = STATE.DISCONNECTED;
      return this.baseState;
    }
    const changePct = Number(quote?.changePct);
    if (!Number.isFinite(changePct)) {
      this.baseState = STATE.FLAT;
      return this.baseState;
    }
    const band = this.config.flatBandPct;
    const release = Math.max(0, band - this.config.baseHysteresisPct);
    if (changePct >= band) this.baseState = STATE.BULLISH;
    else if (changePct <= -band) this.baseState = STATE.BEARISH;
    else if (Math.abs(changePct) <= release || ![STATE.BULLISH, STATE.BEARISH].includes(this.baseState)) {
      this.baseState = STATE.FLAT;
    }
    return this.baseState;
  }

  process({ marketOpen, quote, connection = 'connected', position = null } = {}) {
    const timestamp = this.now();
    if (marketOpen && !this.wasOpen) this.resetSession();
    this.wasOpen = Boolean(marketOpen);
    const baseState = this.classify({ marketOpen, quote, connection });
    if (!marketOpen || connection === 'error') {
      if (!marketOpen) this.previousPosition = position;
      return { baseState, events: [] };
    }

    const current = quoteSnapshot(quote, timestamp);
    if (!current) return { baseState, events: [] };
    const previous = this.samples.at(-1) || null;
    this.samples.push(current);
    const cutoff = timestamp - Math.max(this.config.rapidWindowMs * 2, 30000);
    while (this.samples.length > 2 && this.samples[0].timestamp < cutoff) this.samples.shift();

    const candidates = [];
    this.detectLimits(current, previous, candidates);
    this.detectRapidMove(current, candidates);
    this.detectBreakouts(current, previous, candidates);
    this.detectPosition(position, candidates);
    const hasLimitUp = candidates.some((candidate) => candidate.type === MARKET_EVENT.LIMIT_UP);
    const hasLimitDown = candidates.some((candidate) => candidate.type === MARKET_EVENT.LIMIT_DOWN);
    const effectiveCandidates = candidates.filter((candidate) => {
      if (hasLimitUp && candidate.direction > 0) return candidate.type === MARKET_EVENT.LIMIT_UP;
      if (hasLimitDown && candidate.direction < 0) return candidate.type === MARKET_EVENT.LIMIT_DOWN;
      return true;
    });
    const events = effectiveCandidates.filter((candidate) => this.accept(candidate, timestamp));
    this.previousPosition = position ? { ...position } : null;
    return { baseState, events };
  }

  detectRapidMove(current, candidates) {
    const start = this.samples.find((sample) => sample.timestamp >= current.timestamp - this.config.rapidWindowMs);
    if (!start || start === current) return;
    const deltaPct = current.changePct - start.changePct;
    if (deltaPct >= this.config.rapidRisePct) {
      candidates.push({ type: MARKET_EVENT.RAPID_RISE, direction: 1, deltaPct, windowMs: current.timestamp - start.timestamp });
    } else if (deltaPct <= -this.config.rapidFallPct) {
      candidates.push({ type: MARKET_EVENT.RAPID_FALL, direction: -1, deltaPct, windowMs: current.timestamp - start.timestamp });
    }
  }

  detectBreakouts(current, previous, candidates) {
    const previousPct = previous?.changePct ?? 0;
    let highestUp = null;
    let lowestDown = null;
    for (const level of this.config.breakoutLevelsPct) {
      if (current.changePct < level - this.config.breakoutHysteresisPct) this.breakoutUp.delete(level);
      if (current.changePct > -level + this.config.breakoutHysteresisPct) this.breakoutDown.delete(level);
      if (current.changePct >= level && previousPct < level && !this.breakoutUp.has(level)) highestUp = level;
      if (current.changePct <= -level && previousPct > -level && !this.breakoutDown.has(level)) lowestDown = level;
    }
    if (highestUp !== null) {
      for (const level of this.config.breakoutLevelsPct) if (level <= highestUp) this.breakoutUp.add(level);
      candidates.push({ type: MARKET_EVENT.BREAKOUT_UP, direction: 1, thresholdPct: highestUp });
    }
    if (lowestDown !== null) {
      for (const level of this.config.breakoutLevelsPct) if (level <= lowestDown) this.breakoutDown.add(level);
      candidates.push({ type: MARKET_EVENT.BREAKOUT_DOWN, direction: -1, thresholdPct: lowestDown });
    }
  }

  detectLimits(current, previous, candidates) {
    const previousPct = previous?.changePct ?? 0;
    if (current.changePct < this.config.limitUpPct - this.config.limitHysteresisPct) this.limitUpLatched = false;
    if (current.changePct > this.config.limitDownPct + this.config.limitHysteresisPct) this.limitDownLatched = false;
    if (current.changePct >= this.config.limitUpPct && previousPct < this.config.limitUpPct && !this.limitUpLatched) {
      this.limitUpLatched = true;
      candidates.push({ type: MARKET_EVENT.LIMIT_UP, direction: 1, thresholdPct: this.config.limitUpPct });
    }
    if (current.changePct <= this.config.limitDownPct && previousPct > this.config.limitDownPct && !this.limitDownLatched) {
      this.limitDownLatched = true;
      candidates.push({ type: MARKET_EVENT.LIMIT_DOWN, direction: -1, thresholdPct: this.config.limitDownPct });
    }
  }

  detectPosition(position, candidates) {
    if (!position || !Number.isFinite(position.totalPnl) || !Number.isFinite(position.totalPct)) {
      this.previousPosition = null;
      this.profitPeak = 0;
      return;
    }
    const previous = this.previousPosition;
    if (position.totalPnl > this.profitPeak) this.profitPeak = position.totalPnl;
    if (!previous) return;

    const band = this.config.breakevenBandPct;
    if (Math.abs(position.totalPct) <= band && Math.abs(previous.totalPct) > band) {
      candidates.push({ type: MARKET_EVENT.POSITION_BREAKEVEN, direction: position.totalPct >= 0 ? 1 : -1, totalPnl: position.totalPnl, totalPct: position.totalPct });
    }
    const recovered = this.config.recoveredHysteresisPct;
    if (previous.totalPct <= -recovered && position.totalPct >= recovered) {
      candidates.push({ type: MARKET_EVENT.POSITION_RECOVERED, direction: 1, totalPnl: position.totalPnl, totalPct: position.totalPct });
    }
    const pnlGain = position.totalPnl - previous.totalPnl;
    const pctGain = position.totalPct - previous.totalPct;
    if (position.totalPnl > 0 && pnlGain >= this.config.profitExpansionAmount && pctGain >= this.config.profitExpansionPct) {
      candidates.push({ type: MARKET_EVENT.PROFIT_EXPANDED, direction: 1, amount: pnlGain, totalPnl: position.totalPnl, totalPct: position.totalPct });
    }
    const drawdown = this.profitPeak - position.totalPnl;
    const requiredDrawdown = Math.max(
      this.config.profitPullbackAmount,
      this.profitPeak * this.config.profitPullbackRatio
    );
    if (this.profitPeak > 0 && drawdown >= requiredDrawdown) {
      candidates.push({ type: MARKET_EVENT.PROFIT_PULLBACK, direction: -1, amount: drawdown, totalPnl: position.totalPnl, totalPct: position.totalPct });
      this.profitPeak = Math.max(0, position.totalPnl);
    }
  }

  accept(candidate, timestamp) {
    const key = candidate.type;
    const previous = this.lastEmitted.get(key);
    const cooldown = this.config.cooldowns[candidate.type] || 0;
    const suppressFor = Math.max(this.config.mergeWindowMs, cooldown);
    if (previous && timestamp - previous.timestamp < suppressFor) {
      previous.mergedCount += 1;
      previous.latest = candidate;
      return false;
    }
    const event = {
      ...candidate,
      id: `${candidate.type}:${timestamp}`,
      symbol: this.symbol,
      occurredAt: timestamp,
      mergedCount: 1
    };
    Object.assign(candidate, event);
    this.lastEmitted.set(key, { timestamp, mergedCount: 1, latest: event });
    return true;
  }
}
