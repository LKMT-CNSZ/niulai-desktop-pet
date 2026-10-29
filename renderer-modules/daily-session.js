import { shanghaiDayKey } from './emotion-memory.js';

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function freshSession(day) {
  return {
    day,
    samples: 0,
    lastChangePct: 0,
    todayPnl: null,
    maxFloatingProfit: null,
    maxDrawdown: 0,
    peakTodayPnl: null,
    strongestMove: null,
    lastUpdatedAt: 0,
    closedAt: 0,
    shown: false
  };
}

export class DailySessionTracker {
  constructor({ state, now = () => Date.now() } = {}) {
    this.now = now;
    this.state = this.normalize(state);
  }

  normalize(state) {
    const day = shanghaiDayKey(new Date(this.now()));
    if (!state || state.day !== day) return freshSession(day);
    return { ...freshSession(day), ...state, day };
  }

  ensureToday() {
    const day = shanghaiDayKey(new Date(this.now()));
    if (this.state.day !== day) this.state = freshSession(day);
  }

  reset() {
    this.state = freshSession(shanghaiDayKey(new Date(this.now())));
    return this.snapshot();
  }

  update({ quote, position, marketOpen } = {}) {
    this.ensureToday();
    if (!marketOpen || !quote || !Number.isFinite(Number(quote.changePct))) return this.snapshot();
    const nextPct = finite(quote.changePct);
    if (this.state.samples > 0) {
      const deltaPct = nextPct - this.state.lastChangePct;
      if (!this.state.strongestMove || Math.abs(deltaPct) > Math.abs(this.state.strongestMove.deltaPct)) {
        this.state.strongestMove = {
          direction: deltaPct >= 0 ? 'rise' : 'fall',
          deltaPct,
          at: this.now()
        };
      }
    }
    this.state.samples += 1;
    this.state.lastChangePct = nextPct;
    if (position) {
      const pnl = finite(position.todayPnl);
      this.state.todayPnl = pnl;
      this.state.maxFloatingProfit = this.state.maxFloatingProfit === null
        ? pnl
        : Math.max(this.state.maxFloatingProfit, pnl);
      this.state.peakTodayPnl = this.state.peakTodayPnl === null
        ? pnl
        : Math.max(this.state.peakTodayPnl, pnl);
      this.state.maxDrawdown = Math.max(this.state.maxDrawdown, this.state.peakTodayPnl - pnl);
    }
    this.state.lastUpdatedAt = this.now();
    return this.snapshot();
  }

  close() {
    this.ensureToday();
    if (this.state.samples < 1) return null;
    this.state.closedAt = this.now();
    return this.snapshot();
  }

  markShown() {
    this.state.shown = true;
  }

  summary(moodLabel = '谨慎') {
    if (this.state.samples < 1) return null;
    const move = this.state.strongestMove;
    const comments = {
      兴奋: '今天的线有点精神，明天也别忘了看风险。',
      谨慎: '收盘先记账，明天不跟第一根线冲动。',
      疲惫: '钟声一响，本牛和CPU一起下班。',
      沮丧: '今天先认账，不认输。',
      得意: '浮盈先装进口袋，得意只留三分钟。'
    };
    return {
      day: this.state.day,
      changePct: this.state.lastChangePct,
      todayPnl: this.state.todayPnl,
      maxFloatingProfit: this.state.maxFloatingProfit,
      maxDrawdown: this.state.todayPnl === null ? null : this.state.maxDrawdown,
      strongestMove: move ? { ...move } : null,
      comment: comments[moodLabel] || comments.谨慎
    };
  }

  snapshot() {
    return { ...this.state, strongestMove: this.state.strongestMove ? { ...this.state.strongestMove } : null };
  }
}
