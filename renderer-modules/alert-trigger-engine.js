export const ALERT_TRIGGER_TYPE = Object.freeze({
  PRICE: 'price',
  CHANGE_PCT: 'change_pct',
  COST_RETURN: 'cost_return',
  PNL_AMOUNT: 'pnl_amount',
  RAPID_RISE: 'rapid_rise',
  RAPID_FALL: 'rapid_fall'
});

export const ALERT_PRESENTATION = Object.freeze({
  CARD: 'card',
  TWO_D: '2d',
  THREE_D: '3d'
});

const EVENT_TYPES = Object.freeze({
  [ALERT_TRIGGER_TYPE.RAPID_RISE]: 'RAPID_RISE',
  [ALERT_TRIGGER_TYPE.RAPID_FALL]: 'RAPID_FALL'
});

function normalizedComparator(value) {
  return value === 'lte' ? 'lte' : 'gte';
}

export function normalizeAlertTrigger(trigger = {}, index = 0) {
  const type = Object.values(ALERT_TRIGGER_TYPE).includes(trigger.type)
    ? trigger.type
    : ALERT_TRIGGER_TYPE.PRICE;
  return {
    id: String(trigger.id || `alert-${Date.now()}-${index}`),
    enabled: trigger.enabled !== false,
    type,
    comparator: normalizedComparator(trigger.comparator),
    value: Number.isFinite(Number(trigger.value)) ? Number(trigger.value) : 0,
    presentation: Object.values(ALERT_PRESENTATION).includes(trigger.presentation)
      ? trigger.presentation
      : ALERT_PRESENTATION.CARD,
    sound: trigger.sound === true,
    cooldownMs: Math.max(15000, Number(trigger.cooldownMs) || 60000)
  };
}

export function normalizeAlertTriggers(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map(normalizeAlertTrigger);
}

function crossed(current, previous, comparator, threshold) {
  if (!Number.isFinite(current)) return false;
  if (!Number.isFinite(previous)) return comparator === 'gte' ? current >= threshold : current <= threshold;
  return comparator === 'gte'
    ? previous < threshold && current >= threshold
    : previous > threshold && current <= threshold;
}

export class AlertTriggerEngine {
  constructor({ triggers = [], now = () => Date.now() } = {}) {
    this.now = now;
    this.triggers = normalizeAlertTriggers(triggers);
    this.previous = new Map();
    this.lastTriggered = new Map();
  }

  configure(triggers) {
    this.triggers = normalizeAlertTriggers(triggers);
    const ids = new Set(this.triggers.map((trigger) => trigger.id));
    for (const key of this.previous.keys()) if (!ids.has(key)) this.previous.delete(key);
    for (const key of this.lastTriggered.keys()) if (!ids.has(key)) this.lastTriggered.delete(key);
    return this.snapshot();
  }

  valueFor(trigger, { quote, position } = {}) {
    if (trigger.type === ALERT_TRIGGER_TYPE.PRICE) return Number(quote?.price);
    if (trigger.type === ALERT_TRIGGER_TYPE.CHANGE_PCT) return Number(quote?.changePct);
    if (trigger.type === ALERT_TRIGGER_TYPE.PNL_AMOUNT) return Number(position?.totalPnl);
    if (trigger.type === ALERT_TRIGGER_TYPE.COST_RETURN) return Number(position?.totalPnl);
    return NaN;
  }

  label(trigger, current) {
    const sign = trigger.comparator === 'gte' ? '达到' : '跌至';
    if (trigger.type === ALERT_TRIGGER_TYPE.PRICE) return `价格${sign} ${trigger.value.toFixed(2)}`;
    if (trigger.type === ALERT_TRIGGER_TYPE.CHANGE_PCT) return `涨跌幅${sign} ${trigger.value.toFixed(2)}%`;
    if (trigger.type === ALERT_TRIGGER_TYPE.PNL_AMOUNT) return `累计盈亏${sign} ¥${trigger.value.toFixed(0)}`;
    if (trigger.type === ALERT_TRIGGER_TYPE.COST_RETURN) return '价格回到持仓成本附近';
    if (trigger.type === ALERT_TRIGGER_TYPE.RAPID_RISE) return '检测到快速拉升';
    if (trigger.type === ALERT_TRIGGER_TYPE.RAPID_FALL) return '检测到快速跳水';
    return `提醒触发 ${current}`;
  }

  evaluate(context = {}) {
    const now = this.now();
    const eventTypes = new Set((context.events || []).map((event) => event?.type));
    const hits = [];
    for (const trigger of this.triggers) {
      if (!trigger.enabled) continue;
      let hit = false;
      let current = this.valueFor(trigger, context);
      if (EVENT_TYPES[trigger.type]) {
        hit = eventTypes.has(EVENT_TYPES[trigger.type]);
      } else if (trigger.type === ALERT_TRIGGER_TYPE.COST_RETURN) {
        const previous = this.previous.get(trigger.id);
        const tolerance = Math.max(1, Math.abs(Number(context.quote?.price) || 0) * 0.001);
        hit = Number.isFinite(current) && Math.abs(current) <= tolerance * Math.max(1, Number(context.position?.shares) || 1) &&
          (!Number.isFinite(previous) || Math.abs(previous) > Math.abs(current));
      } else {
        hit = crossed(current, this.previous.get(trigger.id), trigger.comparator, trigger.value);
      }
      if (Number.isFinite(current)) this.previous.set(trigger.id, current);
      const lastAt = this.lastTriggered.get(trigger.id) || 0;
      if (!hit || now - lastAt < trigger.cooldownMs) continue;
      this.lastTriggered.set(trigger.id, now);
      const direction = trigger.type === ALERT_TRIGGER_TYPE.RAPID_FALL || trigger.comparator === 'lte' ? -1 : 1;
      hits.push({ ...trigger, current, direction, label: this.label(trigger, current), triggeredAt: now });
    }
    return hits;
  }

  snapshot() {
    return this.triggers.map((trigger) => ({ ...trigger }));
  }
}

