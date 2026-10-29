export const STATE = Object.freeze({
  CLOSED: 'CLOSED',
  FLAT: 'FLAT',
  BULLISH: 'BULLISH',
  BEARISH: 'BEARISH',
  DISCONNECTED: 'DISCONNECTED'
});

export const ACTION_PRIORITY = Object.freeze({
  ambient: 0,
  market: 10,
  marketEvent: 24,
  marketExtreme: 48,
  interaction: 30,
  prayer: 60,
  shutdown: 100
});
