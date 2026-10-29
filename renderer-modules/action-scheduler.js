export class ActionScheduler {
  constructor({ priorities = {}, now = () => performance.now() } = {}) {
    this.priorities = priorities;
    this.now = now;
    this.active = null;
    this.queue = [];
    this.cooldowns = new Map();
  }

  setCooldown(name, milliseconds) {
    this.cooldowns.set(name, { until: this.now() + Math.max(0, milliseconds) });
  }

  canRun(name) {
    return this.now() >= (this.cooldowns.get(name)?.until || 0);
  }

  run(action) {
    if (!action?.name || !this.canRun(action.cooldownKey || action.name)) return false;
    const priority = action.priority ?? this.priorities[action.name] ?? 0;
    if (this.active && action.queue) {
      const mergeKey = action.mergeKey || action.name;
      const duplicate = this.queue.find((queued) => (queued.mergeKey || queued.name) === mergeKey);
      if (duplicate) {
        duplicate.mergedCount = (duplicate.mergedCount || 1) + 1;
        return true;
      }
      this.queue.push({ ...action, priority });
      return true;
    }
    if (this.active && priority < this.active.priority) return false;
    if (this.active?.interrupt) this.active.interrupt();
    this.active = { ...action, priority };
    if (action.cooldown) {
      this.cooldowns.set(action.cooldownKey || action.name, { until: this.now() + action.cooldown });
    }
    action.start?.();
    return true;
  }

  finish(name) {
    if (!this.active || (name && this.active.name !== name)) return;
    const completed = this.active;
    this.active = null;
    const next = this.queue.shift();
    if (next) {
      this.run(next);
      return;
    }
    completed.recover?.();
  }

  cancelAll({ recover = false } = {}) {
    const active = this.active;
    this.active = null;
    this.queue.length = 0;
    active?.interrupt?.();
    if (recover) active?.recover?.();
    return Boolean(active);
  }
}
