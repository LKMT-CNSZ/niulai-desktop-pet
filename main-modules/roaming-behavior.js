'use strict';

const BEHAVIOR = Object.freeze({
  AT_HOME: 'AT_HOME',
  IDLE: 'IDLE',
  OBSERVE: 'OBSERVE',
  TURN: 'TURN',
  WALK: 'WALK',
  RETURN_HOME: 'RETURN_HOME',
  PAUSED: 'PAUSED'
});

const IDLE_ACTIONS = Object.freeze([
  'idle_breathe',
  'idle_look',
  'idle_tail',
  'idle_scratch',
  'idle_yawn'
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAngle(angle) {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function moveToward(value, target, maxDelta) {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}

function areaForWindow(workArea, size, margin = 22) {
  const horizontalMargin = Math.min(margin, Math.max(0, (workArea.width - size) / 2));
  const verticalMargin = Math.min(margin, Math.max(0, (workArea.height - size) / 2));
  return {
    id: workArea.id,
    x: workArea.x + horizontalMargin,
    y: workArea.y + verticalMargin,
    width: Math.max(0, workArea.width - size - horizontalMargin * 2),
    height: Math.max(0, workArea.height - size - verticalMargin * 2),
    source: workArea
  };
}

function pointInsideArea(point, area, padding = 0) {
  return point.x >= area.x - padding &&
    point.x <= area.x + area.width + padding &&
    point.y >= area.y - padding &&
    point.y <= area.y + area.height + padding;
}

function workAreasAreAdjacent(first, second, tolerance = 36) {
  const a = first.source || first;
  const b = second.source || second;
  const horizontalGap = Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
  const verticalGap = Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);
  const verticalOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const horizontalOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return (horizontalGap <= tolerance && verticalOverlap > 80) ||
    (verticalGap <= tolerance && horizontalOverlap > 80);
}

class RoamingBehavior {
  constructor({
    windowSize = 300,
    random = Math.random,
    baseSpeed = 92,
    acceleration = 150,
    deceleration = 190,
    angularSpeed = Math.PI * 1.15
  } = {}) {
    this.windowSize = windowSize;
    this.random = random;
    this.baseSpeed = baseSpeed;
    this.acceleration = acceleration;
    this.deceleration = deceleration;
    this.angularSpeed = angularSpeed;
    this.speedScale = 1;
    this.frequencyScale = 1;
    this.powerSave = true;
    this.quietMode = false;
    this.emotion = 'cautious';
    this.emotionIdleActions = null;
    this.emotionIdleMultiplier = 1;
    this.crossDisplay = false;
    this.position = { x: 0, y: 0 };
    this.target = null;
    this.targetDisplayId = null;
    this.currentDisplayId = null;
    this.homeTarget = null;
    this.heading = 0;
    this.desiredHeading = 0;
    this.velocity = 0;
    this.state = BEHAVIOR.AT_HOME;
    this.stateTime = 0;
    this.idleRemaining = 0;
    this.pauseRemaining = 0;
    this.idleAction = 'idle_breathe';
    this.observeDuration = 0;
    this.observeStartHeading = 0;
    this.observeTargetHeading = 0;
    this.recalled = true;
  }

  configure({
    speedScale,
    frequencyScale,
    powerSave,
    crossDisplay,
    quietMode,
    emotion,
    emotionProfile
  } = {}) {
    if (Number.isFinite(speedScale)) this.speedScale = clamp(speedScale, 0.3, 2);
    if (Number.isFinite(frequencyScale)) this.frequencyScale = clamp(frequencyScale, 0.25, 2);
    if (typeof powerSave === 'boolean') this.powerSave = powerSave;
    if (typeof crossDisplay === 'boolean') this.crossDisplay = crossDisplay;
    if (typeof quietMode === 'boolean') this.quietMode = quietMode;
    if (typeof emotion === 'string') this.emotion = emotion;
    if (Array.isArray(emotionProfile?.idleActions) && emotionProfile.idleActions.length) {
      this.emotionIdleActions = emotionProfile.idleActions.filter((action) => IDLE_ACTIONS.includes(action));
    }
    if (Number.isFinite(Number(emotionProfile?.idleMultiplier))) {
      this.emotionIdleMultiplier = clamp(Number(emotionProfile.idleMultiplier), 0.6, 2);
    }
  }

  setPosition(bounds, displayId, { replan = false } = {}) {
    if (Number.isFinite(bounds?.x)) this.position.x = bounds.x;
    if (Number.isFinite(bounds?.y)) this.position.y = bounds.y;
    if (displayId !== undefined && displayId !== null) this.currentDisplayId = displayId;
    if (replan) {
      this.velocity = 0;
      this.target = null;
      this.targetDisplayId = null;
      this.recalled = false;
      this.enterIdle(0.45, 'idle_look');
    }
  }

  releaseFromHome(delay = 0.8) {
    this.recalled = false;
    this.homeTarget = null;
    this.enterIdle(delay, 'idle_look');
  }

  requestHome(homeBounds, displayId) {
    if (!homeBounds) return false;
    this.homeTarget = { x: homeBounds.x, y: homeBounds.y, displayId };
    this.target = { x: homeBounds.x, y: homeBounds.y };
    this.targetDisplayId = displayId;
    this.recalled = false;
    this.state = BEHAVIOR.RETURN_HOME;
    this.stateTime = 0;
    return true;
  }

  updateHomeTarget(homeBounds, displayId) {
    if (!homeBounds) return;
    this.homeTarget = { x: homeBounds.x, y: homeBounds.y, displayId };
    if (this.state === BEHAVIOR.RETURN_HOME) {
      this.target = { x: homeBounds.x, y: homeBounds.y };
      this.targetDisplayId = displayId;
    }
    if (this.state === BEHAVIOR.AT_HOME) {
      this.position.x = homeBounds.x;
      this.position.y = homeBounds.y;
      this.currentDisplayId = displayId;
    }
  }

  forceHome(homeBounds, displayId) {
    if (!homeBounds) return false;
    this.position.x = Number(homeBounds.x) || 0;
    this.position.y = Number(homeBounds.y) || 0;
    this.currentDisplayId = displayId ?? this.currentDisplayId;
    this.homeTarget = {
      x: this.position.x,
      y: this.position.y,
      displayId: this.currentDisplayId
    };
    this.target = null;
    this.targetDisplayId = null;
    this.velocity = 0;
    this.state = BEHAVIOR.AT_HOME;
    this.stateTime = 0;
    this.recalled = true;
    return true;
  }

  pause(seconds, action = 'idle_look') {
    this.pauseRemaining = Math.max(0, Number(seconds) || 0);
    this.velocity = 0;
    this.state = BEHAVIOR.PAUSED;
    this.stateTime = 0;
    this.idleAction = action;
  }

  enterIdle(duration, action) {
    if (!action && this.random() < 0.24) {
      this.enterObserve(duration);
      return;
    }
    this.state = BEHAVIOR.IDLE;
    this.stateTime = 0;
    this.velocity = 0;
    const quietMultiplier = this.quietMode ? 1.85 : 1;
    this.idleRemaining = duration ??
      (2.4 + this.random() * (this.powerSave ? 6.5 : 4.7)) *
        this.emotionIdleMultiplier * quietMultiplier / this.frequencyScale;
    const candidates = this.emotionIdleActions?.length ? this.emotionIdleActions : IDLE_ACTIONS;
    this.idleAction = action || candidates[Math.floor(this.random() * candidates.length)];
  }

  enterObserve(duration) {
    this.state = BEHAVIOR.OBSERVE;
    this.stateTime = 0;
    this.velocity = 0;
    this.observeDuration = duration ?? (2.1 + this.random() * (this.powerSave ? 3.8 : 2.6));
    this.idleRemaining = this.observeDuration;
    this.idleAction = 'idle_look';
    this.observeStartHeading = this.heading;
    const side = this.random() < 0.5 ? -1 : 1;
    this.observeTargetHeading = normalizeAngle(
      this.heading + side * (0.62 + this.random() * 0.58)
    );
  }

  selectTarget(displays) {
    if (!displays.length) return false;
    const areas = displays.map((display) => areaForWindow({ ...display.workArea, id: display.id }, this.windowSize));
    let current = areas.find((area) => String(area.id) === String(this.currentDisplayId));
    if (!current) {
      current = areas.find((area) => pointInsideArea(this.position, area, this.windowSize * 0.55)) || areas[0];
      this.currentDisplayId = current.id;
    }

    let destination = current;
    if (this.crossDisplay && areas.length > 1 && this.random() < 0.24) {
      const adjacent = areas.filter(
        (area) => area !== current && workAreasAreAdjacent(current, area)
      );
      if (adjacent.length) destination = adjacent[Math.floor(this.random() * adjacent.length)];
    }

    const angle = this.random() * Math.PI * 2;
    const distance = 180 + this.random() * 390;
    const rawX = this.position.x + Math.cos(angle) * distance;
    const rawY = this.position.y + Math.sin(angle) * distance * 0.42;
    this.target = {
      x: clamp(rawX, destination.x, destination.x + destination.width),
      y: clamp(rawY, destination.y, destination.y + destination.height)
    };

    if (destination !== current) {
      this.target.x = destination.x + destination.width * (0.22 + this.random() * 0.56);
      this.target.y = destination.y + destination.height * (0.20 + this.random() * 0.60);
    }

    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    if (Math.hypot(dx, dy) < 70) {
      this.target.x = clamp(
        this.position.x + (this.random() < 0.5 ? -1 : 1) * 130,
        destination.x,
        destination.x + destination.width
      );
    }
    this.targetDisplayId = destination.id;
    this.desiredHeading = Math.atan2(this.target.y - this.position.y, this.target.x - this.position.x);
    this.state = BEHAVIOR.TURN;
    this.stateTime = 0;
    return true;
  }

  tick(dt, displays) {
    const step = clamp(Number(dt) || 0, 0, 0.1);
    this.stateTime += step;

    if (this.state === BEHAVIOR.PAUSED) {
      this.pauseRemaining -= step;
      if (this.pauseRemaining <= 0) this.enterIdle(0.8, 'idle_breathe');
      return this.snapshot();
    }

    if (this.state === BEHAVIOR.AT_HOME) return this.snapshot('sleep_loop');

    if (this.state === BEHAVIOR.OBSERVE) {
      this.idleRemaining -= step;
      const progress = 1 - clamp(
        this.idleRemaining / Math.max(0.001, this.observeDuration),
        0,
        1
      );
      const lookHeading = progress < 0.58
        ? this.observeTargetHeading
        : this.observeStartHeading;
      const angleDelta = normalizeAngle(lookHeading - this.heading);
      const maxLookTurn = this.angularSpeed * 0.42 * step;
      this.heading = normalizeAngle(
        this.heading + clamp(angleDelta, -maxLookTurn, maxLookTurn)
      );
      if (this.idleRemaining <= 0) {
        this.heading = this.observeStartHeading;
        this.selectTarget(displays);
      }
      return this.snapshot('idle_look');
    }

    if (this.state === BEHAVIOR.IDLE) {
      this.idleRemaining -= step;
      if (this.idleRemaining <= 0) this.selectTarget(displays);
      return this.snapshot(this.idleAction);
    }

    if (!this.target) {
      this.enterIdle(0.5, 'idle_look');
      return this.snapshot();
    }

    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    this.desiredHeading = Math.atan2(dy, dx);
    const angleDelta = normalizeAngle(this.desiredHeading - this.heading);
    const maxTurn = this.angularSpeed * step * (this.state === BEHAVIOR.RETURN_HOME ? 1.15 : 1);
    this.heading = normalizeAngle(this.heading + clamp(angleDelta, -maxTurn, maxTurn));

    if (this.state === BEHAVIOR.TURN) {
      this.velocity = moveToward(this.velocity, 0, this.deceleration * step);
      if (Math.abs(angleDelta) <= 0.12) {
        this.state = BEHAVIOR.WALK;
        this.stateTime = 0;
      }
      return this.snapshot(angleDelta < 0 ? 'turn_left' : 'turn_right');
    }

    const returning = this.state === BEHAVIOR.RETURN_HOME;
    const arrivalRadius = returning ? 0.5 : 0.75;
    if (distance <= arrivalRadius) {
      this.position.x = this.target.x;
      this.position.y = this.target.y;
      this.velocity = 0;
      this.currentDisplayId = this.targetDisplayId ?? this.currentDisplayId;
      if (returning) {
        this.state = BEHAVIOR.AT_HOME;
        this.recalled = true;
        this.target = null;
        this.targetDisplayId = null;
        return this.snapshot('sleep_enter');
      }
      this.target = null;
      this.targetDisplayId = null;
      this.enterIdle(undefined);
      return this.snapshot();
    }

    const maxSpeed = this.baseSpeed * this.speedScale * (returning ? 0.82 : 1);
    const brakingSpeed = Math.sqrt(Math.max(0, 2 * this.deceleration * distance));
    const turnFactor = clamp(1 - Math.abs(angleDelta) / Math.PI, 0.22, 1);
    const desiredSpeed = Math.min(maxSpeed, brakingSpeed) * turnFactor;
    this.velocity = moveToward(
      this.velocity,
      desiredSpeed,
      (desiredSpeed >= this.velocity ? this.acceleration : this.deceleration) * step
    );

    const movement = Math.min(distance, this.velocity * step);
    this.position.x += Math.cos(this.heading) * movement;
    this.position.y += Math.sin(this.heading) * movement;

    const destination = displays.find((display) => String(display.id) === String(this.targetDisplayId));
    if (destination && String(this.currentDisplayId) === String(this.targetDisplayId)) {
      const area = areaForWindow({ ...destination.workArea, id: destination.id }, this.windowSize, 8);
      this.position.x = clamp(this.position.x, area.x, area.x + area.width);
      this.position.y = clamp(this.position.y, area.y, area.y + area.height);
    }

    return this.snapshot('walk');
  }

  snapshot(animation) {
    const moving = this.state === BEHAVIOR.WALK || this.state === BEHAVIOR.RETURN_HOME;
    const direction = Math.cos(this.heading) >= 0 ? 1 : -1;
    const crossing = this.targetDisplayId !== null &&
      String(this.targetDisplayId) !== String(this.currentDisplayId);
    return {
      x: this.position.x,
      y: this.position.y,
      state: this.state,
      animation: animation || this.idleAction,
      moving,
      direction,
      heading: this.heading,
      speed: this.velocity,
      gaitScale: clamp(this.velocity / Math.max(1, this.baseSpeed), 0.35, 1.75),
      displayId: this.currentDisplayId,
      targetDisplayId: this.targetDisplayId,
      crossing,
      observing: this.state === BEHAVIOR.OBSERVE,
      recalled: this.recalled,
      emotion: this.emotion,
      quietMode: this.quietMode
    };
  }
}

module.exports = {
  BEHAVIOR,
  IDLE_ACTIONS,
  RoamingBehavior,
  areaForWindow,
  normalizeAngle,
  workAreasAreAdjacent
};
