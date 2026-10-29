'use strict';

const FORM_MODE = Object.freeze({
  TWO_D: '2d',
  THREE_D: '3d',
  AUTO: 'auto'
});

const FORM_STATE = Object.freeze({
  TWO_D_HOME: 'TWO_D_HOME',
  THREE_D_HOME: 'THREE_D_HOME',
  THREE_D_WAKING: 'THREE_D_WAKING',
  THREE_D_ROAMING: 'THREE_D_ROAMING',
  AUTO_ENTERING: 'AUTO_ENTERING',
  AUTO_PERFORMING: 'AUTO_PERFORMING',
  AUTO_ROAMING: 'AUTO_ROAMING',
  AUTO_RETURNING: 'AUTO_RETURNING',
  MANUAL_RETURNING: 'MANUAL_RETURNING',
  FALLBACK_2D: 'FALLBACK_2D'
});

const IMPORTANT_AUTO_EVENTS = new Set([
  'RAPID_RISE',
  'RAPID_FALL',
  'LIMIT_UP',
  'LIMIT_DOWN'
]);

const THREE_D_STATES = new Set([
  FORM_STATE.THREE_D_HOME,
  FORM_STATE.THREE_D_WAKING,
  FORM_STATE.THREE_D_ROAMING,
  FORM_STATE.AUTO_ENTERING,
  FORM_STATE.AUTO_PERFORMING,
  FORM_STATE.AUTO_ROAMING,
  FORM_STATE.AUTO_RETURNING,
  FORM_STATE.MANUAL_RETURNING
]);

function normalizeMode(value) {
  if (value === FORM_MODE.THREE_D || value === FORM_MODE.AUTO) return value;
  return FORM_MODE.TWO_D;
}

class FormMorphStateMachine {
  constructor() {
    this.preferredMode = FORM_MODE.TWO_D;
    this.state = FORM_STATE.TWO_D_HOME;
    this.reason = 'startup';
    this.allowRoaming = true;
    this.powerSave = true;
    this.autoContinueRoaming = false;
    this.pendingEvent = null;
    this.threeDFailed = false;
    this.sequence = 0;
  }

  transition(state, reason, extra = {}) {
    this.state = state;
    this.reason = String(reason || 'state-change');
    Object.assign(this, extra);
    this.sequence += 1;
    return this.snapshot();
  }

  configure(settings = {}, marketState = 'CLOSED') {
    const previousMode = this.preferredMode;
    const previousState = this.state;
    const preserveActive3D =
      previousMode === normalizeMode(settings.displayMode) &&
      this.activeForm() === FORM_MODE.THREE_D &&
      !this.threeDFailed;
    this.preferredMode = normalizeMode(settings.displayMode);
    this.allowRoaming = settings.allowRoaming !== false;
    this.powerSave = settings.powerSave !== false;
    this.autoContinueRoaming = settings.autoContinueRoaming === true;
    this.threeDFailed = false;

    if (preserveActive3D) {
      return this.transition(previousState, 'runtime-settings-updated');
    }

    this.pendingEvent = null;

    if (this.preferredMode === FORM_MODE.TWO_D) {
      return this.transition(FORM_STATE.TWO_D_HOME, 'manual-2d');
    }
    if (this.preferredMode === FORM_MODE.AUTO) {
      return this.transition(FORM_STATE.TWO_D_HOME, 'auto-standby');
    }
    return this.transition(
      marketState === 'CLOSED' ? FORM_STATE.THREE_D_HOME : FORM_STATE.THREE_D_WAKING,
      marketState === 'CLOSED' ? 'manual-3d-closed' : 'manual-3d-open'
    );
  }

  requestAutoPerformance(event) {
    const type = String(event?.type || '');
    if (this.preferredMode !== FORM_MODE.AUTO) {
      return { accepted: false, reason: 'not-auto', snapshot: this.snapshot() };
    }
    if (!IMPORTANT_AUTO_EVENTS.has(type)) {
      return { accepted: false, reason: 'not-important', snapshot: this.snapshot() };
    }
    if (this.powerSave) {
      return { accepted: false, reason: 'power-save', snapshot: this.snapshot() };
    }
    if (!this.allowRoaming) {
      return { accepted: false, reason: 'roaming-disabled', snapshot: this.snapshot() };
    }
    if (this.threeDFailed) {
      return { accepted: false, reason: '3d-failed', snapshot: this.snapshot() };
    }
    if (this.activeForm() === FORM_MODE.THREE_D) {
      return { accepted: false, reason: 'already-3d', snapshot: this.snapshot() };
    }
    const pendingEvent = {
      ...event,
      type,
      requestedAt: Date.now()
    };
    return {
      accepted: true,
      reason: 'accepted',
      snapshot: this.transition(FORM_STATE.AUTO_ENTERING, `important-${type}`, {
        pendingEvent
      })
    };
  }

  roamingReady() {
    if (this.state === FORM_STATE.AUTO_ENTERING) {
      return this.transition(FORM_STATE.AUTO_PERFORMING, 'auto-performance-start');
    }
    if (this.preferredMode === FORM_MODE.THREE_D) {
      return this.transition(FORM_STATE.THREE_D_ROAMING, 'manual-3d-roaming');
    }
    return this.snapshot();
  }

  performanceComplete() {
    if (this.state !== FORM_STATE.AUTO_PERFORMING) return this.snapshot();
    this.pendingEvent = null;
    return this.transition(
      this.autoContinueRoaming ? FORM_STATE.AUTO_ROAMING : FORM_STATE.AUTO_RETURNING,
      this.autoContinueRoaming ? 'auto-continue-roaming' : 'auto-performance-complete'
    );
  }

  marketClosed() {
    this.pendingEvent = null;
    if (this.activeForm() !== FORM_MODE.THREE_D) return this.snapshot();
    return this.transition(
      this.preferredMode === FORM_MODE.AUTO
        ? FORM_STATE.AUTO_RETURNING
        : FORM_STATE.MANUAL_RETURNING,
      'market-closed'
    );
  }

  beginReturn(reason = 'return-home') {
    this.pendingEvent = null;
    if (this.activeForm() !== FORM_MODE.THREE_D) return this.snapshot();
    if ([FORM_STATE.AUTO_RETURNING, FORM_STATE.MANUAL_RETURNING].includes(this.state)) {
      return this.snapshot();
    }
    return this.transition(
      this.preferredMode === FORM_MODE.AUTO
        ? FORM_STATE.AUTO_RETURNING
        : FORM_STATE.MANUAL_RETURNING,
      reason
    );
  }

  homeArrived() {
    this.pendingEvent = null;
    if (this.preferredMode === FORM_MODE.AUTO) {
      return this.transition(FORM_STATE.TWO_D_HOME, 'auto-home-arrived');
    }
    if (this.preferredMode === FORM_MODE.THREE_D && !this.threeDFailed) {
      return this.transition(FORM_STATE.THREE_D_HOME, 'manual-3d-home');
    }
    return this.transition(
      this.threeDFailed ? FORM_STATE.FALLBACK_2D : FORM_STATE.TWO_D_HOME,
      this.threeDFailed ? '3d-fallback-home' : '2d-home'
    );
  }

  fail3D(reason = '3d-error') {
    this.pendingEvent = null;
    this.threeDFailed = true;
    return this.transition(FORM_STATE.FALLBACK_2D, reason);
  }

  activeForm() {
    return THREE_D_STATES.has(this.state) && !this.threeDFailed
      ? FORM_MODE.THREE_D
      : FORM_MODE.TWO_D;
  }

  snapshot() {
    return {
      preferredMode: this.preferredMode,
      activeForm: this.activeForm(),
      state: this.state,
      reason: this.reason,
      allowRoaming: this.allowRoaming,
      powerSave: this.powerSave,
      autoContinueRoaming: this.autoContinueRoaming,
      automatic: this.preferredMode === FORM_MODE.AUTO,
      pendingEvent: this.pendingEvent ? { ...this.pendingEvent } : null,
      threeDFailed: this.threeDFailed,
      sequence: this.sequence
    };
  }
}

module.exports = {
  FORM_MODE,
  FORM_STATE,
  IMPORTANT_AUTO_EVENTS,
  FormMorphStateMachine,
  normalizeMode
};
