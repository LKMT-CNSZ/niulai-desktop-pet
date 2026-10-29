export const COMIC_LAYER = Object.freeze({
  MAIN_TEXT: 'main-text',
  ACTION_SYNC: 'action-sync',
  PRIMARY_PARTICLES: 'primary-particles',
  COMPANION_PARTICLES: 'companion-particles',
  SOUND: 'sound',
  WINDOW_FEEDBACK: 'window-feedback'
});

export const COMIC_CUE = Object.freeze({
  UP: 'UP',
  RAPID_RISE: 'RAPID_RISE',
  DOWN: 'DOWN',
  RAPID_FALL: 'RAPID_FALL',
  LIMIT_UP: 'LIMIT_UP',
  LIMIT_DOWN: 'LIMIT_DOWN'
});

const PROFILES = Object.freeze({
  [COMIC_CUE.UP]: { direction: 1, sound: 'BULLISH' },
  [COMIC_CUE.RAPID_RISE]: { direction: 1, sound: 'BULLISH' },
  [COMIC_CUE.DOWN]: { direction: -1, sound: 'BEARISH' },
  [COMIC_CUE.RAPID_FALL]: { direction: -1, sound: 'BEARISH' },
  [COMIC_CUE.LIMIT_UP]: { direction: 1, sound: 'BULLISH', rare: true },
  [COMIC_CUE.LIMIT_DOWN]: { direction: -1, sound: 'BEARISH', rare: true }
});

function normalizedCue(value) {
  return PROFILES[value] ? value : null;
}

export class EffectsManager {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.enabled = true;
    this.level = 1;
    this.listeners = new Map();
    this.layerListeners = new Map();
    this.context = {
      visible: true,
      sleeping: false,
      lowPower: false,
      quietMode: false,
      role: 'home'
    };
    this.performance = null;
    this.performanceSequence = 0;
    this.slotSequence = 0;
    this.slots = {
      [COMIC_LAYER.MAIN_TEXT]: null,
      [COMIC_LAYER.PRIMARY_PARTICLES]: null
    };
  }

  configure(levelOrOptions) {
    const options = typeof levelOrOptions === 'object' && levelOrOptions !== null
      ? levelOrOptions
      : { level: levelOrOptions };
    this.level = Number.isFinite(Number(options.level)) ? Number(options.level) : 1;
    this.enabled = this.level > 0.01;
    this.setContext(options);
  }

  setContext(partial = {}) {
    for (const key of ['visible', 'sleeping', 'lowPower', 'quietMode', 'role']) {
      if (partial[key] !== undefined) this.context[key] = partial[key];
    }
    if (!this.context.visible || this.context.sleeping || this.context.quietMode || !this.enabled) {
      this.clearHighIntensity('context-change');
    }
  }

  allows(layer = COMIC_LAYER.COMPANION_PARTICLES, { high = false } = {}) {
    if (!this.enabled) return false;
    if (layer !== COMIC_LAYER.SOUND && !this.context.visible) return false;
    if (this.context.quietMode && (high || [
      COMIC_LAYER.MAIN_TEXT,
      COMIC_LAYER.PRIMARY_PARTICLES,
      COMIC_LAYER.WINDOW_FEEDBACK
    ].includes(layer))) return false;
    if (this.context.sleeping && (high || [
      COMIC_LAYER.MAIN_TEXT,
      COMIC_LAYER.PRIMARY_PARTICLES,
      COMIC_LAYER.WINDOW_FEEDBACK
    ].includes(layer))) return false;
    return true;
  }

  particleBudget(baseCount) {
    const powerScale = this.context.lowPower ? 0.42 : 1;
    return Math.max(0, Math.round(Number(baseCount || 0) * Math.min(1.5, this.level) * powerScale));
  }

  on(name, listener) {
    if (!name || typeof listener !== 'function') return () => {};
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
    return () => this.listeners.get(name)?.delete(listener);
  }

  onLayer(layer, listener) {
    if (!layer || typeof listener !== 'function') return () => {};
    if (!this.layerListeners.has(layer)) this.layerListeners.set(layer, new Set());
    this.layerListeners.get(layer).add(listener);
    return () => this.layerListeners.get(layer)?.delete(listener);
  }

  deliver(listeners, payload) {
    let delivered = 0;
    for (const listener of listeners || []) {
      try {
        listener(payload);
        delivered += 1;
      } catch {}
    }
    return delivered;
  }

  emit(name, payload) {
    if (!this.enabled || !name) return 0;
    return this.deliver(this.listeners.get(name), payload);
  }

  trigger(layer, type, payload = {}, options = {}) {
    const high = options.high === true;
    if (!this.allows(layer, { high })) return null;
    const exclusive = [COMIC_LAYER.MAIN_TEXT, COMIC_LAYER.PRIMARY_PARTICLES].includes(layer);
    if (exclusive && this.slots[layer]) {
      this.deliver(this.layerListeners.get(layer), {
        layer,
        type: 'clear',
        token: this.slots[layer].token,
        reason: 'replaced'
      });
    }
    const token = ++this.slotSequence;
    const event = {
      layer,
      type,
      token,
      cue: this.performance?.cue || null,
      performanceId: this.performance?.id || null,
      level: this.level,
      lowPower: this.context.lowPower,
      ...payload
    };
    if (exclusive) this.slots[layer] = event;
    this.deliver(this.layerListeners.get(layer), event);
    return token;
  }

  finish(layer, token) {
    if (!this.slots[layer] || this.slots[layer].token !== token) return false;
    this.slots[layer] = null;
    return true;
  }

  clearHighIntensity(reason = 'clear') {
    for (const layer of [COMIC_LAYER.MAIN_TEXT, COMIC_LAYER.PRIMARY_PARTICLES]) {
      const active = this.slots[layer];
      if (!active) continue;
      this.slots[layer] = null;
      this.deliver(this.layerListeners.get(layer), {
        layer,
        type: 'clear',
        token: active.token,
        reason
      });
    }
    if (reason !== 'replaced') this.performance = null;
  }

  beginPerformance(cue, payload = {}) {
    const normalized = normalizedCue(cue);
    if (!normalized) return null;
    const profile = PROFILES[normalized];
    this.performance = {
      id: ++this.performanceSequence,
      cue: normalized,
      profile,
      payload,
      startedAt: this.now()
    };
    this.trigger(COMIC_LAYER.SOUND, 'arm-direction', {
      direction: profile.sound,
      userInitiatedOnly: true
    });
    return this.performance.id;
  }

  handleAnimationEvent(event) {
    if (!event?.type) return;
    if (event.type === 'keyframe') this.emit(event.event || event.name, event);
    const cue = this.performance?.cue;
    if (!cue || !this.context.visible || this.context.sleeping) return;
    const action = event.action;
    const marker = event.event || event.name;

    if (event.type === 'animation-finished') {
      const terminalAction = {
        [COMIC_CUE.UP]: 'happy',
        [COMIC_CUE.DOWN]: 'sad',
        [COMIC_CUE.RAPID_RISE]: 'brake',
        [COMIC_CUE.RAPID_FALL]: 'get_up',
        [COMIC_CUE.LIMIT_UP]: 'happy',
        [COMIC_CUE.LIMIT_DOWN]: 'get_up'
      }[cue];
      if (action === terminalAction) this.performance = null;
      return;
    }

    if (event.type === 'animation-start') {
      if (cue === COMIC_CUE.UP && action === 'happy') {
        this.riseOpening(false);
      } else if (cue === COMIC_CUE.DOWN && action === 'sad') {
        this.fallOpening(false);
      } else if ([COMIC_CUE.RAPID_RISE, COMIC_CUE.LIMIT_UP].includes(cue) && action === 'charge') {
        this.riseOpening(cue === COMIC_CUE.LIMIT_UP);
      } else if ([COMIC_CUE.RAPID_FALL, COMIC_CUE.LIMIT_DOWN].includes(cue) && action === 'sad') {
        this.fallOpening(cue === COMIC_CUE.LIMIT_DOWN);
      }
      return;
    }

    if (event.type !== 'keyframe') return;
    if (marker === 'footstep_left' || marker === 'footstep_right' || marker === 'footstep_both') {
      this.trigger(COMIC_LAYER.ACTION_SYNC, 'landing-dust', { marker, action });
    } else if (marker === 'paw_dust') {
      this.trigger(COMIC_LAYER.ACTION_SYNC, 'paw-dust', { marker, action });
    } else if (marker === 'nostril_smoke') {
      this.trigger(COMIC_LAYER.ACTION_SYNC, 'nostril-smoke', { marker, action });
    } else if (marker === 'brake_dust') {
      this.trigger(COMIC_LAYER.ACTION_SYNC, 'brake-dust', { marker, action });
    } else if (marker === 'impact_text' && [COMIC_CUE.RAPID_RISE, COMIC_CUE.LIMIT_UP].includes(cue)) {
      this.trigger(COMIC_LAYER.ACTION_SYNC, 'upward-impact-ring', { action }, { high: true });
      this.trigger(COMIC_LAYER.COMPANION_PARTICLES, 'coins', {
        count: this.particleBudget(cue === COMIC_CUE.LIMIT_UP ? 18 : 7)
      });
      this.trigger(COMIC_LAYER.WINDOW_FEEDBACK, 'impact-up', {
        strength: cue === COMIC_CUE.LIMIT_UP ? 1 : 0.55
      }, { high: true });
    } else if (marker === 'body_impact' && [COMIC_CUE.RAPID_FALL, COMIC_CUE.LIMIT_DOWN].includes(cue)) {
      this.trigger(COMIC_LAYER.ACTION_SYNC, 'fall-stars', { action }, { high: true });
      this.trigger(COMIC_LAYER.COMPANION_PARTICLES, 'bear-cameo', {
        variant: cue === COMIC_CUE.LIMIT_DOWN ? 'spirit' : 'ramen'
      });
      this.trigger(COMIC_LAYER.WINDOW_FEEDBACK, 'impact-down', {
        strength: cue === COMIC_CUE.LIMIT_DOWN ? 1 : 0.55
      }, { high: true });
    }
  }

  riseOpening(limit) {
    this.trigger(COMIC_LAYER.MAIN_TEXT, 'comic-text', {
      text: limit ? '涨停！牛来！' : '牛来！',
      theme: 'rise',
      durationMs: limit ? 1050 : 820
    }, { high: true });
    this.trigger(COMIC_LAYER.PRIMARY_PARTICLES, limit ? 'limit-up-burst' : 'red-gold-burst', {
      durationMs: limit ? 1500 : 1050
    }, { high: true });
  }

  fallOpening(limit) {
    const cue = this.performance?.cue;
    const durationMs = limit ? 3700 : cue === COMIC_CUE.RAPID_FALL ? 3300 : 1100;
    this.trigger(COMIC_LAYER.MAIN_TEXT, 'comic-text', {
      text: limit ? '跌停！妈妈！' : '妈妈！',
      theme: 'fall',
      durationMs: limit ? 1050 : 780
    }, { high: true });
    this.trigger(COMIC_LAYER.PRIMARY_PARTICLES, limit ? 'limit-down-lines' : 'falling-lines', {
      durationMs
    }, { high: true });
  }

  snapshot() {
    return {
      enabled: this.enabled,
      level: this.level,
      context: { ...this.context },
      performance: this.performance ? { ...this.performance, profile: { ...this.performance.profile } } : null,
      slots: { ...this.slots }
    };
  }

  isPerforming() {
    return Boolean(this.performance);
  }
}
