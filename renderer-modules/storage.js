import { normalizeQuietOffice } from './quiet-office.js';

export const DEFAULT_SETTINGS = Object.freeze({
  volume: 0.9,
  muted: false,
  motion: 1,
  modelScale: 1,
  effects: 1,
  roamingSpeed: 1,
  roamingFrequency: 1,
  allowRoaming: true,
  crossDisplayRoaming: false,
  showQuote: true,
  quoteCardMode: 'follow',
  autoContinueRoaming: false,
  autoHome: true,
  displayMode: '2d',
  powerSave: true,
  extremeMarketPerformance: true,
  modelQuality: 'balanced',
  effectsQuality: 'balanced',
  maxFps: 60,
  emotionMemory: false,
  closeSummary: false,
  markets: Object.freeze(['cn', 'hk', 'us']),
  quietOffice: Object.freeze({ enabled: false, start: '09:30', end: '11:30' })
});

export const DEFAULT_PORTFOLIO = Object.freeze({
  symbol: 's_sh000001',
  cost: 0,
  shares: 0
});

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clampSetting(value, min, max, fallback) {
  return Math.min(max, Math.max(min, numberOr(value, fallback)));
}

export function loadPetSettings(storage = globalThis.localStorage) {
  let saved = {};
  try {
    saved = JSON.parse(storage?.getItem('niulai:pet-settings') || '{}');
  } catch {}
  return {
    volume: clampSetting(saved.volume, 0, 1, DEFAULT_SETTINGS.volume),
    muted: typeof saved.muted === 'boolean' ? saved.muted : DEFAULT_SETTINGS.muted,
    motion: clampSetting(saved.motion, 0, 1.5, DEFAULT_SETTINGS.motion),
    modelScale: clampSetting(saved.modelScale, 0.75, 1.2, DEFAULT_SETTINGS.modelScale),
    effects: clampSetting(saved.effects, 0, 1.5, DEFAULT_SETTINGS.effects),
    roamingSpeed: clampSetting(saved.roamingSpeed, 0.3, 2, DEFAULT_SETTINGS.roamingSpeed),
    roamingFrequency: clampSetting(
      saved.roamingFrequency,
      0.25,
      2,
      DEFAULT_SETTINGS.roamingFrequency
    ),
    showQuote: typeof saved.showQuote === 'boolean' ? saved.showQuote : DEFAULT_SETTINGS.showQuote,
    quoteCardMode: saved.quoteCardMode === 'home' ? 'home' : DEFAULT_SETTINGS.quoteCardMode,
    displayMode: ['3d', 'auto'].includes(saved.displayMode)
      ? saved.displayMode
      : DEFAULT_SETTINGS.displayMode,
    autoContinueRoaming: typeof saved.autoContinueRoaming === 'boolean'
      ? saved.autoContinueRoaming
      : DEFAULT_SETTINGS.autoContinueRoaming,
    autoHome: typeof saved.autoHome === 'boolean'
      ? saved.autoHome
      : typeof saved.autoContinueRoaming === 'boolean'
        ? !saved.autoContinueRoaming
        : DEFAULT_SETTINGS.autoHome,
    allowRoaming: typeof saved.allowRoaming === 'boolean' ? saved.allowRoaming : DEFAULT_SETTINGS.allowRoaming,
    crossDisplayRoaming: typeof saved.crossDisplayRoaming === 'boolean'
      ? saved.crossDisplayRoaming
      : DEFAULT_SETTINGS.crossDisplayRoaming,
    powerSave: typeof saved.powerSave === 'boolean' ? saved.powerSave : DEFAULT_SETTINGS.powerSave,
    extremeMarketPerformance: typeof saved.extremeMarketPerformance === 'boolean'
      ? saved.extremeMarketPerformance
      : DEFAULT_SETTINGS.extremeMarketPerformance,
    modelQuality: ['low', 'balanced', 'high'].includes(saved.modelQuality)
      ? saved.modelQuality
      : DEFAULT_SETTINGS.modelQuality,
    effectsQuality: ['low', 'balanced', 'high'].includes(saved.effectsQuality)
      ? saved.effectsQuality
      : DEFAULT_SETTINGS.effectsQuality,
    maxFps: [24, 30, 45, 60].includes(Number(saved.maxFps))
      ? Number(saved.maxFps)
      : DEFAULT_SETTINGS.maxFps,
    emotionMemory: typeof saved.emotionMemory === 'boolean'
      ? saved.emotionMemory
      : DEFAULT_SETTINGS.emotionMemory,
    closeSummary: typeof saved.closeSummary === 'boolean'
      ? saved.closeSummary
      : DEFAULT_SETTINGS.closeSummary,
    markets: Array.isArray(saved.markets)
      ? [...new Set(saved.markets.map((value) => String(value).toLowerCase()))]
        .filter((value) => ['cn', 'hk', 'us'].includes(value))
      : [...DEFAULT_SETTINGS.markets],
    quietOffice: normalizeQuietOffice(saved.quietOffice || DEFAULT_SETTINGS.quietOffice)
  };
}

export function loadPortfolio(storage = globalThis.localStorage) {
  let saved = {};
  try {
    saved = JSON.parse(storage?.getItem('niulai:portfolio') || '{}');
  } catch {}
  let legacySymbol = DEFAULT_PORTFOLIO.symbol;
  try {
    legacySymbol = storage?.getItem('niulai:selected-symbol') || legacySymbol;
  } catch {}
  return {
    symbol: String(saved.symbol || legacySymbol),
    cost: Math.max(0, numberOr(saved.cost, 0)),
    shares: Math.max(0, numberOr(saved.shares, 0))
  };
}

function normalizedSavedStock(item) {
  if (!item || typeof item !== 'object') return null;
  const symbol = String(item.symbol || '').trim();
  if (!symbol) return null;
  return {
    symbol,
    name: String(item.name || '').trim().slice(0, 40),
    market: ['cn', 'hk', 'us'].includes(item.market) ? item.market : '',
    cost: Math.max(0, numberOr(item.cost, 0)),
    shares: Math.max(0, numberOr(item.shares, 0)),
    savedAt: Math.max(0, numberOr(item.savedAt, Date.now()))
  };
}

export function loadSavedStocks(storage = globalThis.localStorage) {
  let saved = null;
  try {
    saved = JSON.parse(storage?.getItem('niulai:saved-stocks-v1') || 'null');
  } catch {}
  const candidates = Array.isArray(saved) ? saved : [];
  if (!Array.isArray(saved)) {
    const legacy = loadPortfolio(storage);
    if (legacy.cost > 0 && legacy.shares > 0) candidates.push({ ...legacy, savedAt: Date.now() });
  }
  const seen = new Set();
  return candidates.map(normalizedSavedStock).filter((item) => {
    if (!item || seen.has(item.symbol)) return false;
    seen.add(item.symbol);
    return true;
  }).slice(0, 50);
}

export function savedStockForSymbol(stocks, symbol) {
  return (Array.isArray(stocks) ? stocks : []).find((item) => item.symbol === symbol) || null;
}

export function loadSelectedSymbol(fallback, storage = globalThis.localStorage) {
  try {
    return storage?.getItem('niulai:selected-symbol') || fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadJson(storage, key, fallback) {
  try {
    const value = JSON.parse(storage?.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function loadMarketEventSettings(defaults, storage = globalThis.localStorage) {
  let saved = {};
  try {
    saved = JSON.parse(storage?.getItem('niulai:market-event-settings') || '{}');
  } catch {}
  return { ...defaults, ...saved, cooldowns: { ...defaults.cooldowns, ...saved.cooldowns } };
}
