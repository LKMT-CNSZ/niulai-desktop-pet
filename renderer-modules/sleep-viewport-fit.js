export const SLEEP_VIEWPORT_MAX_SCALE = 0.82;
export const SLEEP_VIEWPORT_X_OFFSET = -0.18;
export const SLEEP_VIEWPORT_Y_OFFSET = 0.04;

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function smoothstep(value) {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
}

export function sleepViewportFit(phase, progress = 1) {
  let amount = 0;
  if (phase === 'HOME_SLEEP_ENTER') {
    amount = smoothstep(progress);
  } else if (phase === 'HOME_SLEEPING' || phase === 'SAFE_HOME') {
    amount = 1;
  } else if (phase === 'HOME_WAKING') {
    amount = 1 - smoothstep(progress);
  }

  return {
    amount,
    maxScale: SLEEP_VIEWPORT_MAX_SCALE,
    x: amount === 0 ? 0 : SLEEP_VIEWPORT_X_OFFSET * amount,
    y: amount === 0 ? 0 : SLEEP_VIEWPORT_Y_OFFSET * amount
  };
}
