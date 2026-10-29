'use strict';

const HOME_PHASE = Object.freeze({
  HOME_SLEEP_ENTER: 'HOME_SLEEP_ENTER',
  HOME_SLEEPING: 'HOME_SLEEPING',
  HOME_WAKING: 'HOME_WAKING',
  HOME_AWAKE: 'HOME_AWAKE',
  HOME_EXITING: 'HOME_EXITING',
  ROAMING: 'ROAMING',
  RETURNING: 'RETURNING',
  ENTERING_HOME: 'ENTERING_HOME',
  SAFE_HOME: 'SAFE_HOME',
  TWO_D: 'TWO_D'
});

const HOME_TIMING = Object.freeze({
  enterDoorMs: 850,
  sleepEnterMs: 1650,
  wakeMs: 1500,
  exitDoorMs: 850,
  safeFadeMs: 550,
  manualWakeMs: 60000
});

function returnTimeoutMs(distance, speedScale = 1) {
  const speed = 92 * Math.max(0.3, Number(speedScale) || 1) * 0.82;
  const travelMs = (Math.max(0, Number(distance) || 0) / speed) * 1000;
  return Math.round(Math.min(60000, Math.max(18000, travelMs + 12000)));
}

function windowDistance(first, second) {
  if (!first || !second) return Infinity;
  return Math.hypot(Number(second.x) - Number(first.x), Number(second.y) - Number(first.y));
}

function phaseShowsHome3D(phase) {
  return [
    HOME_PHASE.HOME_SLEEP_ENTER,
    HOME_PHASE.HOME_SLEEPING,
    HOME_PHASE.HOME_WAKING,
    HOME_PHASE.HOME_AWAKE,
    HOME_PHASE.HOME_EXITING,
    HOME_PHASE.SAFE_HOME
  ].includes(phase);
}

function phaseShowsRoaming3D(phase) {
  return [
    HOME_PHASE.HOME_EXITING,
    HOME_PHASE.ROAMING,
    HOME_PHASE.RETURNING,
    HOME_PHASE.ENTERING_HOME,
    HOME_PHASE.SAFE_HOME
  ].includes(phase);
}

module.exports = {
  HOME_PHASE,
  HOME_TIMING,
  phaseShowsHome3D,
  phaseShowsRoaming3D,
  returnTimeoutMs,
  windowDistance
};
