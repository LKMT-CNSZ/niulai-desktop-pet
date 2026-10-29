export class BehaviorStateMachine {
  constructor({ initial, onChange, now = () => performance.now() }) {
    this.state = initial;
    this.onChange = onChange;
    this.now = now;
    this.priority = 0;
    this.previous = null;
    this.queue = [];
    this.cooldowns = new Map();
  }

  transition(next, { priority = 0, interrupt = true, queue = false, cooldown = 0 } = {}) {
    if (!next || this.now() < (this.cooldowns.get(next) || 0)) return false;
    if (priority < this.priority && !interrupt) {
      if (queue) this.queue.push({ next, priority, cooldown });
      return false;
    }
    if (next === this.state && priority <= this.priority) return false;
    const previous = this.state;
    this.previous = previous;
    this.state = next;
    this.priority = priority;
    if (cooldown > 0) this.cooldowns.set(next, this.now() + cooldown);
    this.onChange?.(next, previous);
    return true;
  }

  recover(state, priority = 0) {
    const target = state || this.previous;
    this.priority = 0;
    const changed = target
      ? this.transition(target, { priority, interrupt: true })
      : false;
    const queued = this.queue.shift();
    if (queued) this.transition(queued.next, { ...queued, interrupt: true });
    return changed;
  }
}
