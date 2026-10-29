export const EMOTION = Object.freeze({
  EXCITED: 'excited',
  CAUTIOUS: 'cautious',
  TIRED: 'tired',
  FRUSTRATED: 'frustrated',
  SMUG: 'smug'
});

const EMOTION_LABELS = Object.freeze({
  [EMOTION.EXCITED]: '兴奋',
  [EMOTION.CAUTIOUS]: '谨慎',
  [EMOTION.TIRED]: '疲惫',
  [EMOTION.FRUSTRATED]: '沮丧',
  [EMOTION.SMUG]: '得意'
});

const EVENT_IMPULSE = Object.freeze({
  RAPID_RISE: { excited: 18, smug: 8 },
  LIMIT_UP: { excited: 24, smug: 22 },
  RAPID_FALL: { cautious: 12, frustrated: 18 },
  LIMIT_DOWN: { cautious: 14, frustrated: 25 },
  POSITION_RECOVERED: { excited: 12, smug: 18 },
  PROFIT_EXPANDED: { smug: 13 },
  PROFIT_PULLBACK: { cautious: 11, frustrated: 10 }
});

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function shanghaiDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function freshState(day = shanghaiDayKey()) {
  return {
    day,
    values: { excited: 18, cautious: 28, tired: 12, frustrated: 10, smug: 10 },
    mood: EMOTION.CAUTIOUS,
    updatedAt: 0
  };
}

export class EmotionMemory {
  constructor({ enabled = false, state, now = () => Date.now() } = {}) {
    this.enabled = enabled === true;
    this.now = now;
    this.state = this.normalizeState(state);
  }

  normalizeState(state) {
    const day = shanghaiDayKey(new Date(this.now()));
    if (!state || state.day !== day) return freshState(day);
    const next = freshState(day);
    for (const key of Object.values(EMOTION)) {
      next.values[key] = clamp(state.values?.[key] ?? next.values[key]);
    }
    next.mood = Object.values(EMOTION).includes(state.mood) ? state.mood : EMOTION.CAUTIOUS;
    next.updatedAt = Number(state.updatedAt) || 0;
    return next;
  }

  configure({ enabled } = {}) {
    if (typeof enabled === 'boolean') this.enabled = enabled;
  }

  ensureToday() {
    const day = shanghaiDayKey(new Date(this.now()));
    if (this.state.day !== day) this.state = freshState(day);
  }

  update({ quote, position, marketOpen = false, events = [] } = {}) {
    this.ensureToday();
    if (!this.enabled) return this.snapshot();
    const values = this.state.values;
    const changePct = Number(quote?.changePct) || 0;
    const totalPct = Number(position?.totalPct) || 0;
    const todayPnl = Number(position?.todayPnl) || 0;
    const hour = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false, hourCycle: 'h23'
    }).format(new Date(this.now()))) || 0;

    for (const key of Object.keys(values)) values[key] = clamp(values[key] * 0.965);
    values.excited = clamp(values.excited + Math.max(0, changePct) * 4.2 + Math.max(0, totalPct) * 0.8);
    values.smug = clamp(values.smug + Math.max(0, totalPct) * 2.2 + (todayPnl > 0 ? 1.2 : 0));
    values.cautious = clamp(values.cautious + Math.min(18, Math.abs(changePct) * 2.4) + (quote ? 0 : 4));
    values.frustrated = clamp(values.frustrated + Math.max(0, -changePct) * 4.5 + Math.max(0, -totalPct) * 1.4);
    values.tired = clamp(values.tired + (!marketOpen || hour >= 14 ? 2.4 : 0.35));

    for (const event of events) {
      const impulse = EVENT_IMPULSE[event?.type];
      if (!impulse) continue;
      for (const [key, amount] of Object.entries(impulse)) values[key] = clamp(values[key] + amount);
    }

    this.state.mood = Object.entries(values).sort((a, b) => b[1] - a[1])[0][0];
    this.state.updatedAt = this.now();
    return this.snapshot();
  }

  quips(context = 'flat') {
    const mood = this.state.mood;
    const bank = {
      excited: ['今天牛蹄有点烫，先别眨眼！', '行情一抬头，本牛就精神了。'],
      cautious: ['牌子看清楚，别让一根线骗了。', '先观察，牛也讲究确认信号。'],
      tired: ['盯了一天，眼皮比成交量还沉。', '慢一点，本牛正在省电。'],
      frustrated: ['这根绿线，本牛记住了。', '先低头，不代表认输。'],
      smug: ['这点浮盈，够本牛得意一会儿。', '别夸，主要是牛气比较稳。']
    };
    const fallback = context === 'closed' ? ['收工，明天再和K线讲道理。'] : ['横盘如织，不如摸鱼。'];
    return bank[mood] || fallback;
  }

  idleProfile() {
    const profiles = {
      excited: { idleActions: ['idle_tail', 'idle_look', 'idle_scratch'], idleMultiplier: 0.72, motionScale: 1.12 },
      cautious: { idleActions: ['idle_look', 'idle_breathe', 'idle_tail'], idleMultiplier: 1.18, motionScale: 0.90 },
      tired: { idleActions: ['idle_yawn', 'idle_breathe', 'idle_look'], idleMultiplier: 1.65, motionScale: 0.72 },
      frustrated: { idleActions: ['idle_breathe', 'idle_look', 'idle_scratch'], idleMultiplier: 1.38, motionScale: 0.86 },
      smug: { idleActions: ['idle_tail', 'idle_scratch', 'idle_breathe'], idleMultiplier: 0.92, motionScale: 1.04 }
    };
    return profiles[this.state.mood] || profiles.cautious;
  }

  reactionScale(direction = 0) {
    if (!this.enabled) return 1;
    if (direction > 0 && [EMOTION.EXCITED, EMOTION.SMUG].includes(this.state.mood)) return 1.14;
    if (direction < 0 && this.state.mood === EMOTION.FRUSTRATED) return 1.12;
    if ([EMOTION.CAUTIOUS, EMOTION.TIRED].includes(this.state.mood)) return 0.82;
    return 1;
  }

  snapshot() {
    return {
      enabled: this.enabled,
      day: this.state.day,
      mood: this.state.mood,
      label: EMOTION_LABELS[this.state.mood],
      values: { ...this.state.values },
      updatedAt: this.state.updatedAt,
      profile: this.idleProfile()
    };
  }
}
