import * as THREE from 'three';
import { GLTFLoader } from './node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { STATE } from './renderer-modules/state.js';
import {
  DEFAULT_SETTINGS,
  clampSetting,
  loadPetSettings,
  loadPortfolio,
  loadSavedStocks,
  savedStockForSymbol,
  loadSelectedSymbol,
  loadMarketEventSettings,
  loadJson,
  saveJson
} from './renderer-modules/storage.js';
import { MarketStore } from './renderer-modules/market-data.js';
import {
  DEFAULT_MARKET_EVENT_CONFIG,
  MARKET_EVENT,
  MarketEventEngine,
  normalizeMarketEventConfig
} from './renderer-modules/market-event-engine.js';
import {
  performanceForBaseState,
  performanceForMarketEvent
} from './renderer-modules/market-event-actions.js';
import { AudioManager } from './renderer-modules/audio-manager.js';
import { ActionScheduler } from './renderer-modules/action-scheduler.js';
import { BehaviorStateMachine } from './renderer-modules/behavior-state-machine.js';
import { Bull2DController, Bull3DController } from './renderer-modules/bull-controllers.js';
import {
  COMIC_LAYER,
  EffectsManager
} from './renderer-modules/effects-manager.js';
import { HomeWindowController } from './renderer-modules/home-window-controller.js';
import { DesktopRoamingController } from './renderer-modules/desktop-roaming-controller.js';
import {
  SkeletalAnimationController,
  inspectRig
} from './renderer-modules/skeletal-animation-controller.js';
import { installAnimationDebugPanel } from './renderer-modules/animation-debug-panel.js';
import { installMarketDebugPanel } from './renderer-modules/market-debug-panel.js';
import { EmotionMemory } from './renderer-modules/emotion-memory.js';
import { DailySessionTracker } from './renderer-modules/daily-session.js';
import {
  ALERT_PRESENTATION,
  ALERT_TRIGGER_TYPE,
  AlertTriggerEngine,
  normalizeAlertTriggers
} from './renderer-modules/alert-trigger-engine.js';
import { isQuietOfficeActive, quietRuntimeSettings } from './renderer-modules/quiet-office.js';
import { sleepViewportFit } from './renderer-modules/sleep-viewport-fit.js';

const IS_ROAMING_OVERLAY =
  new URLSearchParams(window.location.search).get('roaming') === '1';
document.body.classList.toggle('roaming-overlay', IS_ROAMING_OVERLAY);

const lerp = THREE.MathUtils.lerp;
const KEY_BASE_COLOR = new THREE.Color(0xfff4d8);

const STATE_STYLE = {
  [STATE.CLOSED]: {
    color: new THREE.Color(0x9a7b4f),
    emissive: new THREE.Color(0x241408),
    emissiveIntensity: 0,
    glowColor: new THREE.Color(0x6f5a3a),
    glowIntensity: 0,
    spin: 0,
    bob: 0.02
  },
  [STATE.FLAT]: {
    color: new THREE.Color(0xd9a441),
    emissive: new THREE.Color(0x5a3a10),
    emissiveIntensity: 0.08,
    glowColor: new THREE.Color(0xffb35c),
    glowIntensity: 2,
    spin: 0.18,
    bob: 0.05
  },
  [STATE.BULLISH]: {
    color: new THREE.Color(0xffb54f),
    emissive: new THREE.Color(0xff4d1f),
    emissiveIntensity: 0.45,
    glowColor: new THREE.Color(0xff5c2d),
    glowIntensity: 16,
    spin: 0.5,
    bob: 0.12
  },
  [STATE.BEARISH]: {
    color: new THREE.Color(0xa8bdb0),
    emissive: new THREE.Color(0x1e6b47),
    emissiveIntensity: 0.28,
    glowColor: new THREE.Color(0x3fae7f),
    glowIntensity: 8,
    spin: -0.08,
    bob: 0.06
  },
  [STATE.DISCONNECTED]: {
    color: new THREE.Color(0xb4aa99),
    emissive: new THREE.Color(0x2a2620),
    emissiveIntensity: 0.04,
    glowColor: new THREE.Color(0x77716a),
    glowIntensity: 0,
    spin: 0,
    bob: 0.02
  }
};

const statusEl = document.getElementById('status');
const sceneEl = document.getElementById('scene');
const quoteCardEl = document.getElementById('quote-card');
const quoteNameEl = document.getElementById('quote-name');
const quoteCodeEl = document.getElementById('quote-code');
const quotePriceEl = document.getElementById('quote-price');
const quoteChangeEl = document.getElementById('quote-change');
const quoteTrendEl = document.getElementById('quote-trend');
const roamingTodayPnlEl = document.getElementById('roaming-today-pnl');
const roamingTotalPnlEl = document.getElementById('roaming-total-pnl');
const roamingPositionBaseEl = document.getElementById('roaming-position-base');
const roamingFunUnitEl = document.getElementById('roaming-fun-unit');
const settingsToggleEl = document.getElementById('settings-toggle');
const stockDetailPanelEl = document.getElementById('stock-detail-panel');
const stockPickerPanelEl = document.getElementById('stock-picker-panel');
const savedStockListEl = document.getElementById('saved-stock-list');
const pickerCloseEl = document.getElementById('picker-close');
const pickerDetailEl = document.getElementById('picker-detail');
const pickerWebEl = document.getElementById('picker-web');
const detailCloseEl = document.getElementById('detail-close');
const detailNameEl = document.getElementById('detail-name');
const detailCodeEl = document.getElementById('detail-code');
const detailPriceEl = document.getElementById('detail-price');
const detailChangeEl = document.getElementById('detail-change');
const detailPrevCloseEl = document.getElementById('detail-prev-close');
const detailDayChangeEl = document.getElementById('detail-day-change');
const detailVolumeEl = document.getElementById('detail-volume');
const detailAmountEl = document.getElementById('detail-amount');
const detailPositionEl = document.getElementById('detail-position');
const detailSourceEl = document.getElementById('detail-source');
const detailTimeEl = document.getElementById('detail-time');
const detailWebEl = document.getElementById('detail-web');
const settingsPanelEl = document.getElementById('settings-panel');
const settingsFormEl = document.getElementById('settings-form');
const settingsCloseEl = document.getElementById('settings-close');
const settingsCancelEl = document.getElementById('settings-cancel');
const settingsResetEl = document.getElementById('settings-reset');
const settingsHelpEl = document.getElementById('settings-help');
const settingsRecenterEl = document.getElementById('settings-recenter');
const settingsRecallEl = document.getElementById('settings-recall');
const settingSymbolEl = document.getElementById('setting-symbol');
const stockSearchButtonEl = document.getElementById('stock-search-button');
const stockSearchResultsEl = document.getElementById('stock-search-results');
const marketCnEl = document.getElementById('market-cn');
const marketHkEl = document.getElementById('market-hk');
const marketUsEl = document.getElementById('market-us');
const settingCostEl = document.getElementById('setting-cost');
const settingSharesEl = document.getElementById('setting-shares');
const settingSaveStockEl = document.getElementById('setting-save-stock');
const settingVolumeEl = document.getElementById('setting-volume');
const settingMotionEl = document.getElementById('setting-motion');
const settingScaleEl = document.getElementById('setting-scale');
const settingEffectsEl = document.getElementById('setting-effects');
const settingRoamingSpeedEl = document.getElementById('setting-roaming-speed');
const settingRoamingFrequencyEl = document.getElementById('setting-roaming-frequency');
const settingSoundEl = document.getElementById('setting-sound');
const settingQuoteEl = document.getElementById('setting-quote');
const settingQuoteFollowEl = document.getElementById('setting-quote-follow');
const settingPowerSaveEl = document.getElementById('setting-power-save');
const settingAllowRoamingEl = document.getElementById('setting-allow-roaming');
const settingCrossDisplayEl = document.getElementById('setting-cross-display');
const settingAutoContinueEl = document.getElementById('setting-auto-continue');
const settingAutoHomeEl = document.getElementById('setting-auto-home');
const settingExtremePerformanceEl = document.getElementById('setting-extreme-performance');
const settingModelQualityEl = document.getElementById('setting-model-quality');
const settingEffectsQualityEl = document.getElementById('setting-effects-quality');
const settingMaxFpsEl = document.getElementById('setting-max-fps');
const applyPowerRecommendationEl = document.getElementById('apply-power-recommendation');
const settingDisplayModeEl = document.getElementById('setting-display-mode');
const valueVolumeEl = document.getElementById('value-volume');
const valueMotionEl = document.getElementById('value-motion');
const valueScaleEl = document.getElementById('value-scale');
const valueEffectsEl = document.getElementById('value-effects');
const valueRoamingSpeedEl = document.getElementById('value-roaming-speed');
const valueRoamingFrequencyEl = document.getElementById('value-roaming-frequency');
const positionPnlEl = document.getElementById('position-pnl');
const pnlTotalEl = document.getElementById('pnl-total');
const pnlTodayEl = document.getElementById('pnl-today');
const interactionLayerEl = document.getElementById('interaction-layer');
const speechBubbleEl = document.getElementById('speech-bubble');
const incenseButtonEl = document.getElementById('action-incense');
const bullFeedButtonEl = document.getElementById('action-bull-feed');
const bearFeedButtonEl = document.getElementById('action-bear-feed');
const closeButtonEl = document.getElementById('close');
const exitConfirmEl = document.getElementById('exit-confirm');
const exitCancelEl = document.getElementById('exit-cancel');
const exitAcceptEl = document.getElementById('exit-accept');
const spriteModeEl = document.getElementById('sprite-mode');
const spriteBullEl = document.getElementById('sprite-bull');
const incense2DEl = document.getElementById('incense-2d');
const helpPanelEl = document.getElementById('help-panel');
const helpCloseEl = document.getElementById('help-close');
const helpContentEl = document.getElementById('help-content');
const windowResetEl = document.getElementById('window-reset');
const dragHandleEl = document.getElementById('drag-handle');
const settingsFeaturesEl = document.getElementById('settings-features');
const featurePanelEl = document.getElementById('feature-panel');
const featureFormEl = document.getElementById('feature-form');
const featureCloseEl = document.getElementById('feature-close');
const featureEmotionEl = document.getElementById('feature-emotion');
const featureSummaryEl = document.getElementById('feature-summary');
const featureQuietEl = document.getElementById('feature-quiet');
const featureQuietStartEl = document.getElementById('feature-quiet-start');
const featureQuietEndEl = document.getElementById('feature-quiet-end');
const emotionStatusEl = document.getElementById('emotion-status');
const triggerTypeEl = document.getElementById('trigger-type');
const triggerComparatorEl = document.getElementById('trigger-comparator');
const triggerValueEl = document.getElementById('trigger-value');
const triggerPresentationEl = document.getElementById('trigger-presentation');
const triggerSoundEl = document.getElementById('trigger-sound');
const triggerAddEl = document.getElementById('trigger-add');
const triggerListEl = document.getElementById('trigger-list');
const closeSummaryPanelEl = document.getElementById('close-summary-panel');
const summaryCloseEl = document.getElementById('summary-close');
const summaryDisableEl = document.getElementById('summary-disable');
const summaryDateEl = document.getElementById('summary-date');
const summaryChangeEl = document.getElementById('summary-change');
const summaryPnlEl = document.getElementById('summary-pnl');
const summaryMaxProfitEl = document.getElementById('summary-max-profit');
const summaryDrawdownEl = document.getElementById('summary-drawdown');
const summaryMoveEl = document.querySelector('#summary-move strong');
const summaryCommentEl = document.getElementById('summary-comment');
const alertToastEl = document.getElementById('alert-toast');
document.body.dataset.quoteSide = 'right';
let selectedSymbol = 's_sh000001';

let draggingWindowPointer = null;

dragHandleEl.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || draggingWindowPointer !== null) return;
  event.preventDefault();
  draggingWindowPointer = event.pointerId;
  dragHandleEl.setPointerCapture(event.pointerId);
  dragHandleEl.classList.add('dragging');
  window.desktopPet?.beginWindowDrag?.();
});

function finishWindowDrag(event) {
  if (draggingWindowPointer === null) return;
  if (event?.pointerId !== undefined && event.pointerId !== draggingWindowPointer) return;
  const pointerId = draggingWindowPointer;
  draggingWindowPointer = null;
  dragHandleEl.classList.remove('dragging');
  if (dragHandleEl.hasPointerCapture(pointerId)) {
    dragHandleEl.releasePointerCapture(pointerId);
  }
  window.desktopPet?.endWindowDrag?.();
}

dragHandleEl.addEventListener('pointerup', finishWindowDrag);
dragHandleEl.addEventListener('pointercancel', finishWindowDrag);
dragHandleEl.addEventListener('lostpointercapture', finishWindowDrag);

windowResetEl.addEventListener('click', async () => {
  const result = await homeWindowController.reset();
  showSpeech(result?.ok ? '已恢复 300×300 并回到右下角' : '窗口恢复失败，请重试');
});

let petSettings = loadPetSettings();
let activeDisplayMode = petSettings.displayMode === '3d' ? '3d' : '2d';
let formMorphState = {
  preferredMode: petSettings.displayMode,
  activeForm: activeDisplayMode,
  state: activeDisplayMode === '3d' ? 'THREE_D_HOME' : 'TWO_D_HOME',
  reason: 'renderer-startup'
};
const legacyPortfolio = loadPortfolio();
let savedStocks = loadSavedStocks();
selectedSymbol = loadSelectedSymbol(legacyPortfolio.symbol);
let portfolio = savedStockForSymbol(savedStocks, selectedSymbol) ||
  (legacyPortfolio.symbol === selectedSymbol ? legacyPortfolio : { symbol: selectedSymbol, cost: 0, shares: 0 });
const marketStore = new MarketStore({ symbol: selectedSymbol, portfolio });
let marketEventConfig = normalizeMarketEventConfig(
  loadMarketEventSettings(DEFAULT_MARKET_EVENT_CONFIG)
);
const marketEventEngine = new MarketEventEngine({
  config: marketEventConfig,
  symbol: selectedSymbol
});
const emotionMemory = new EmotionMemory({
  enabled: petSettings.emotionMemory,
  state: loadJson(localStorage, 'niulai:emotion-memory-v1', null)
});
const dailySession = new DailySessionTracker({
  state: loadJson(localStorage, 'niulai:daily-session-v1', null)
});
let alertTriggers = normalizeAlertTriggers(
  loadJson(localStorage, 'niulai:alert-triggers-v1', [])
);
const alertTriggerEngine = new AlertTriggerEngine({ triggers: alertTriggers });
let quietOfficeActive = isQuietOfficeActive(petSettings.quietOffice);
let lastEmotionMood = emotionMemory.snapshot().mood;
const audioManager = new AudioManager(assetUrl);
const effectsManager = new EffectsManager();
let armedComicSoundDirection = null;
effectsManager.onLayer(COMIC_LAYER.SOUND, (event) => {
  if (event.type === 'arm-direction') {
    armedComicSoundDirection = event.direction;
    return;
  }
  if (
    event.type !== 'play' ||
    (event.userInitiated !== true && event.alertAuthorized !== true) ||
    quietOfficeActive
  ) return;
  audioManager.play(event.direction);
});
const actionScheduler = new ActionScheduler({ priorities: { prayer: 60, interaction: 30, market: 10 } });
const behaviorStateMachine = new BehaviorStateMachine({ initial: STATE.CLOSED });
const homeWindowController = new HomeWindowController(window.desktopPet);
const desktopRoamingController = new DesktopRoamingController(window.desktopPet);
let skeletalAnimationController = null;
let renderer = null;
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
const HOME_VISIBLE_PHASES = new Set([
  HOME_PHASE.HOME_SLEEP_ENTER,
  HOME_PHASE.HOME_SLEEPING,
  HOME_PHASE.HOME_WAKING,
  HOME_PHASE.HOME_AWAKE,
  HOME_PHASE.HOME_EXITING,
  HOME_PHASE.SAFE_HOME
]);
const ROAMING_VISIBLE_PHASES = new Set([
  HOME_PHASE.HOME_EXITING,
  HOME_PHASE.ROAMING,
  HOME_PHASE.RETURNING,
  HOME_PHASE.ENTERING_HOME,
  HOME_PHASE.SAFE_HOME
]);
let petLifecycle = {
  phase: HOME_PHASE.HOME_SLEEPING,
  duration: 0,
  reason: 'renderer-startup',
  receivedAt: performance.now()
};
let roamingMotion = {
  state: 'AT_HOME',
  animation: 'sleep_loop',
  moving: false,
  direction: 1,
  heading: 0,
  speed: 0,
  gaitScale: 1
};
const bull2DController = new Bull2DController({
  root: spriteModeEl,
  canvas: spriteBullEl,
  assetUrl,
  report: (level, message) => window.desktopPet?.report?.(level, message),
  setState: (state) => { spriteModeEl.dataset.state = String(state).toLowerCase(); }
});
const bull3DController = new Bull3DController({
  setVisible: (visible) => { if (petRoot) petRoot.visible = visible; },
  setState: (state) => { if (!IS_ROAMING_OVERLAY) desktopRoamingController.setMarketState(state); }
});
let fallingBackTo2D = false;
let threeRenderingDisabled = false;

function isHome3DVisible() {
  if (IS_ROAMING_OVERLAY || activeDisplayMode !== '3d') return false;
  if (!petSettings.allowRoaming) return true;
  return HOME_VISIBLE_PHASES.has(petLifecycle.phase);
}

function isRoaming3DVisible() {
  return IS_ROAMING_OVERLAY &&
    activeDisplayMode === '3d' &&
    ROAMING_VISIBLE_PHASES.has(petLifecycle.phase);
}

function is3DVisibleInThisWindow() {
  return IS_ROAMING_OVERLAY ? isRoaming3DVisible() : isHome3DVisible();
}

function is2DVisibleInThisWindow() {
  return !IS_ROAMING_OVERLAY && activeDisplayMode === '2d';
}

let roamingHitRegionFrame = 0;
function syncRoamingHitRegions() {
  if (!IS_ROAMING_OVERLAY) return;
  cancelAnimationFrame(roamingHitRegionFrame);
  roamingHitRegionFrame = requestAnimationFrame(() => {
    const regions = [];
    const bullRect = interactionLayerEl.getBoundingClientRect();
    regions.push({
      x: bullRect.left,
      y: bullRect.top,
      width: bullRect.width,
      height: bullRect.height
    });
    if (!quoteCardEl.hidden && !document.body.classList.contains('quote-action-hidden')) {
      const expanded = quoteCardEl.matches(':hover, :focus-visible, :focus-within');
      if (expanded) {
        regions.push({
          x: document.body.dataset.quoteSide === 'left' ? 6 : 154,
          y: 8,
          width: 140,
          height: 119
        });
      } else {
        const quoteRect = quoteCardEl.getBoundingClientRect();
        regions.push({
          x: quoteRect.left,
          y: quoteRect.top,
          width: quoteRect.width,
          height: quoteRect.height
        });
      }
    }
    desktopRoamingController.setHitRegion({ regions });
  });
}

function quoteCardShouldShowHere() {
  if (!petSettings.showQuote) return false;
  if (activeDisplayMode === '2d') return !IS_ROAMING_OVERLAY;
  if (petSettings.quoteCardMode === 'home') return !IS_ROAMING_OVERLAY;
  return is3DVisibleInThisWindow();
}

function applyQuoteCardPlacement() {
  quoteCardEl.hidden = !quoteCardShouldShowHere();
  document.body.classList.toggle('quote-follows-pet', petSettings.quoteCardMode === 'follow');
  document.body.classList.toggle('quote-fixed-home', petSettings.quoteCardMode === 'home');
  syncRoamingHitRegions();
}

function applyLifecycleAnimation() {
  if (!skeletalAnimationController) return;
  const phase = petLifecycle.phase;
  if (!IS_ROAMING_OVERLAY) {
    if (phase === HOME_PHASE.HOME_SLEEP_ENTER || phase === HOME_PHASE.SAFE_HOME) {
      skeletalAnimationController.play('sleep_enter', { force: true, fade: 0.22 });
    } else if (phase === HOME_PHASE.HOME_SLEEPING) {
      skeletalAnimationController.play('sleep_loop', { force: true, loop: true, fade: 0.32 });
    } else if (phase === HOME_PHASE.HOME_WAKING) {
      skeletalAnimationController.play('wake_up', { force: true, fade: 0.16 });
    } else if (phase === HOME_PHASE.HOME_AWAKE) {
      skeletalAnimationController.play('idle_breathe', { force: true, loop: true, fade: 0.30 });
    } else if (phase === HOME_PHASE.HOME_EXITING) {
      skeletalAnimationController.play('walk', { force: true, loop: true, fade: 0.18 });
    }
    return;
  }

  if ([HOME_PHASE.HOME_EXITING, HOME_PHASE.ENTERING_HOME].includes(phase)) {
    skeletalAnimationController.play('walk', { force: true, loop: true, fade: 0.16 });
  } else if (phase === HOME_PHASE.RETURNING || phase === HOME_PHASE.ROAMING) {
    if (!forwardedAutoPerformance) {
      skeletalAnimationController.applyRoamingMotion(roamingMotion);
    }
  }
}

function receivePetLifecycle(payload) {
  const phase = String(payload?.phase || '');
  if (!Object.values(HOME_PHASE).includes(phase)) return;
  petLifecycle = {
    ...payload,
    phase,
    duration: Math.max(0, Number(payload?.duration) || 0),
    receivedAt: performance.now()
  };
  if ([HOME_PHASE.RETURNING, HOME_PHASE.ENTERING_HOME, HOME_PHASE.SAFE_HOME].includes(phase)) {
    actionScheduler.cancelAll();
  }
  document.body.dataset.petLifecycle = phase;
  applyLifecycleAnimation();
  applyPetVisibilityState();
  effectsManager.setContext({
    visible: is3DVisibleInThisWindow() || is2DVisibleInThisWindow(),
    sleeping: isSleepingLifecycle(),
    lowPower: petSettings.powerSave,
    role: IS_ROAMING_OVERLAY ? 'roaming' : 'home'
  });
}

window.desktopPet?.onPetLifecycle?.(receivePetLifecycle);

function receiveFormState(payload) {
  const nextActiveForm = payload?.activeForm === '3d' ? '3d' : '2d';
  const previousActiveForm = activeDisplayMode;
  if (nextActiveForm === '3d' && threeRenderingDisabled) {
    activeDisplayMode = '2d';
    formMorphState = { ...formMorphState, ...payload, activeForm: '2d', state: 'FALLBACK_2D' };
    applyPetVisibilityState();
    window.desktopPet?.report3DError?.('WebGL 或3D渲染层此前已失效');
    return;
  }
  activeDisplayMode = nextActiveForm;
  formMorphState = { ...formMorphState, ...payload, activeForm: nextActiveForm };
  document.body.dataset.activeForm = nextActiveForm;
  document.body.dataset.formState = String(payload?.state || '');
  if (previousActiveForm === '3d' && nextActiveForm === '2d') {
    actionScheduler.cancelAll();
    effectsManager.clearHighIntensity('form-switched-to-2d');
  }
  applyPetVisibilityState();
  effectsManager.setContext({
    visible: is3DVisibleInThisWindow() || is2DVisibleInThisWindow(),
    sleeping: isSleepingLifecycle(),
    lowPower: petSettings.powerSave,
    role: IS_ROAMING_OVERLAY ? 'roaming' : 'home'
  });
}

window.desktopPet?.onFormState?.(receiveFormState);

function fallback3DTo2D(reason) {
  threeRenderingDisabled = true;
  if (fallingBackTo2D) return;
  if (activeDisplayMode !== '3d') {
    window.desktopPet?.report?.('error', `3D 渲染层已停用，2D 牛继续运行: ${String(reason)}`);
    if (!IS_ROAMING_OVERLAY) {
      showSpeech('3D 模式暂不可用，已优先显示 2D 趴窗牛', 4200);
    }
    return;
  }
  fallingBackTo2D = true;
  const message = String(reason?.stack || reason || '未知 3D 渲染错误');
  window.desktopPet?.report?.('error', `3D 模式异常，准备回退 2D: ${message}`);
  window.desktopPet?.report3DError?.(message);
  if (IS_ROAMING_OVERLAY) {
    return;
  }
  activeDisplayMode = '2d';
  applyPetVisibilityState();
  showSpeech('3D 模式暂不可用，已自动切回 2D 趴窗牛', 4200);
  fallingBackTo2D = false;
}

window.desktopPet?.onForce2D?.((payload) => {
  if (IS_ROAMING_OVERLAY) return;
  fallback3DTo2D(payload?.message || '3D 漫游窗口异常');
});

if (IS_ROAMING_OVERLAY) {
  window.desktopPet?.onRoamingSettings?.((settings) => {
    petSettings = {
      ...petSettings,
      ...settings,
      displayMode: settings?.preferredDisplayMode || settings?.displayMode || petSettings.displayMode
    };
    quietOfficeActive = settings?.quietMode === true || isQuietOfficeActive(petSettings.quietOffice);
    activeDisplayMode = '3d';
    applyPetSettings(false);
  });
  window.desktopPet?.onHomeBounds?.((bounds) => {
    document.body.dataset.homeX = String(bounds?.x ?? '');
    document.body.dataset.homeY = String(bounds?.y ?? '');
  });
  window.desktopPet?.onRoamingMotion?.((motion) => {
    roamingMotion = { ...roamingMotion, ...motion };
    const syncedMarketState = STATE[motion?.marketState];
    if (!forwardedAutoPerformance && syncedMarketState && syncedMarketState !== targetState) {
      previousState = targetState;
      targetState = syncedMarketState;
      stateStartedAt = elapsed;
      transition = 0;
    }
    document.body.dataset.roamingDirection = String(motion?.direction ?? 0);
    document.body.dataset.roamingMoving = String(Boolean(motion?.moving));
    document.body.dataset.roamingBehavior = String(motion?.state || '');
    const quoteSide = motion?.quoteSide === 'left' ? 'left' : 'right';
    if (document.body.dataset.quoteSide !== quoteSide) {
      document.body.dataset.quoteSide = quoteSide;
      syncRoamingHitRegions();
    }
    if (!forwardedAutoPerformance) {
      skeletalAnimationController?.applyRoamingMotion(roamingMotion);
    }
  });
}

function syncUiPanelState() {
  const open = [
    settingsPanelEl,
    stockPickerPanelEl,
    stockDetailPanelEl,
    helpPanelEl,
    featurePanelEl,
    closeSummaryPanelEl,
    exitConfirmEl
  ].some(
    (element) => element.classList.contains('open')
  );
  document.body.classList.toggle('ui-panel-open', open);
}

const TRIGGER_TYPE_LABEL = Object.freeze({
  price: '价格',
  change_pct: '涨跌幅',
  cost_return: '回成本',
  pnl_amount: '累计盈亏',
  rapid_rise: '快速拉升',
  rapid_fall: '快速跳水'
});
const TRIGGER_PRESENTATION_LABEL = Object.freeze({ card: '行情牌', '2d': '2D动作', '3d': '3D演出' });

function triggerNeedsValue(type = triggerTypeEl.value) {
  return ![
    ALERT_TRIGGER_TYPE.COST_RETURN,
    ALERT_TRIGGER_TYPE.RAPID_RISE,
    ALERT_TRIGGER_TYPE.RAPID_FALL
  ].includes(type);
}

function syncTriggerEditor() {
  const needsValue = triggerNeedsValue();
  triggerValueEl.disabled = !needsValue;
  triggerComparatorEl.disabled = !needsValue;
  triggerValueEl.style.opacity = needsValue ? '1' : '.45';
  triggerComparatorEl.style.opacity = needsValue ? '1' : '.45';
}

function renderTriggerList() {
  triggerListEl.replaceChildren();
  if (!alertTriggers.length) {
    const empty = document.createElement('div');
    empty.className = 'trigger-item';
    empty.textContent = '尚未添加提醒；默认不会产生额外提醒。';
    triggerListEl.appendChild(empty);
    return;
  }
  for (const trigger of alertTriggers) {
    const row = document.createElement('div');
    row.className = 'trigger-item';
    const text = document.createElement('span');
    const noValue = !triggerNeedsValue(trigger.type);
    const comparator = trigger.comparator === 'lte' ? '≤' : '≥';
    text.textContent = `${TRIGGER_TYPE_LABEL[trigger.type]}${noValue ? '' : ` ${comparator} ${trigger.value}`}` +
      ` · ${TRIGGER_PRESENTATION_LABEL[trigger.presentation]}${trigger.sound ? ' · 声音' : ''}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '删';
    remove.setAttribute('aria-label', `删除${text.textContent}`);
    remove.addEventListener('click', () => {
      alertTriggers = alertTriggers.filter((item) => item.id !== trigger.id);
      renderTriggerList();
    });
    row.append(text, remove);
    triggerListEl.appendChild(row);
  }
}

function populateFeatureForm() {
  featureEmotionEl.checked = petSettings.emotionMemory;
  featureSummaryEl.checked = petSettings.closeSummary;
  featureQuietEl.checked = petSettings.quietOffice.enabled;
  featureQuietStartEl.value = petSettings.quietOffice.start;
  featureQuietEndEl.value = petSettings.quietOffice.end;
  const emotion = emotionMemory.snapshot();
  emotionStatusEl.textContent = emotion.enabled ? `${emotion.label} · 仅本地` : '未启用';
  renderTriggerList();
  syncTriggerEditor();
}

let featureTriggerBackup = [];
let featureDraftCommitted = false;

function setFeaturePanelOpen(open) {
  const wasOpen = featurePanelEl.classList.contains('open');
  if (open && !wasOpen) {
    featureTriggerBackup = alertTriggers.map((trigger) => ({ ...trigger }));
    featureDraftCommitted = false;
  } else if (!open && wasOpen && !featureDraftCommitted) {
    alertTriggers = featureTriggerBackup.map((trigger) => ({ ...trigger }));
  }
  featurePanelEl.classList.toggle('open', open);
  featurePanelEl.setAttribute('aria-hidden', String(!open));
  if (open) {
    settingsPanelEl.classList.remove('open');
    settingsPanelEl.setAttribute('aria-hidden', 'true');
    populateFeatureForm();
    featureCloseEl.focus();
  }
  if (!open) featureDraftCommitted = false;
  syncUiPanelState();
}

function setCloseSummaryOpen(open) {
  closeSummaryPanelEl.classList.toggle('open', open);
  closeSummaryPanelEl.setAttribute('aria-hidden', String(!open));
  if (open) {
    setSettingsPanelOpen(false);
    setStockPickerOpen(false);
    setStockDetailOpen(false);
    setFeaturePanelOpen(false);
  }
  syncUiPanelState();
}

function renderCloseSummary(summary) {
  if (!summary || IS_ROAMING_OVERLAY) return;
  summaryDateEl.textContent = `${summary.day} · 数据仅保存在本机`;
  summaryChangeEl.textContent = formatPct(summary.changePct);
  summaryPnlEl.textContent = summary.todayPnl === null ? '未设置持仓' : signedMoney(summary.todayPnl);
  summaryMaxProfitEl.textContent = summary.maxFloatingProfit === null ? '--' : signedMoney(summary.maxFloatingProfit);
  summaryDrawdownEl.textContent = summary.maxDrawdown === null
    ? '--'
    : `${currencyPrefix()}${moneyFormatter.format(summary.maxDrawdown)}`;
  summaryMoveEl.textContent = summary.strongestMove
    ? `${summary.strongestMove.direction === 'rise' ? '拉升 +' : '跳水 -'}${Math.abs(summary.strongestMove.deltaPct).toFixed(2)}%`
    : '今日波动较平缓';
  summaryCommentEl.textContent = summary.comment;
  setCloseSummaryOpen(true);
}

let alertToastToken = 0;
function showAlertToast(text, duration = 4800) {
  const token = ++alertToastToken;
  alertToastEl.textContent = text;
  alertToastEl.classList.add('show');
  setTimeout(() => {
    if (token === alertToastToken) alertToastEl.classList.remove('show');
  }, duration);
}

function setExitConfirmOpen(open) {
  exitConfirmEl.classList.toggle('open', open);
  exitConfirmEl.setAttribute('aria-hidden', String(!open));
  if (open) {
    setSettingsPanelOpen(false);
    setStockPickerOpen(false);
    setStockDetailOpen(false);
    setFeaturePanelOpen(false);
    setCloseSummaryOpen(false);
    requestAnimationFrame(() => exitCancelEl.focus());
  } else {
    closeButtonEl.focus({ preventScroll: true });
  }
  syncUiPanelState();
}

closeButtonEl.addEventListener('click', () => setExitConfirmOpen(true));
exitCancelEl.addEventListener('click', () => setExitConfirmOpen(false));
exitAcceptEl.addEventListener('click', () => {
  actionScheduler.cancelAll();
  window.desktopPet?.quit();
});
exitConfirmEl.addEventListener('pointerdown', (event) => {
  if (event.target === exitConfirmEl) setExitConfirmOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && exitConfirmEl.classList.contains('open')) {
    event.preventDefault();
    setExitConfirmOpen(false);
  }
});

let helpLoaded = false;

async function setHelpPanelOpen(open) {
  helpPanelEl.classList.toggle('open', open);
  helpPanelEl.setAttribute('aria-hidden', String(!open));
  if (!open) {
    syncUiPanelState();
    return;
  }
  setSettingsPanelOpen(false);
  setStockPickerOpen(false);
  setStockDetailOpen(false);
  setFeaturePanelOpen(false);
  setCloseSummaryOpen(false);
  if (!helpLoaded) {
    try {
      const response = await fetch(projectUrl('docs/软件介绍与使用教程.md'));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      helpContentEl.textContent = await response.text();
      helpLoaded = true;
    } catch (error) {
      helpContentEl.textContent = `使用说明加载失败：${error.message}`;
    }
  }
  helpCloseEl.focus();
  syncUiPanelState();
}

window.addEventListener('error', (event) => {
  window.desktopPet?.report?.('error', `${event.message} @ ${event.filename}:${event.lineno}`);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.stack : String(event.reason);
  window.desktopPet?.report?.('error', `Unhandled rejection: ${reason}`);
});

function projectUrl(relativePath) {
  if (location.protocol === 'file:') {
    return `pet://local/${relativePath}`;
  }
  return `./${relativePath}`;
}

function assetUrl(relativePath) {
  return projectUrl(`assets/${relativePath}`);
}

bull2DController.loadSprite();

function applyPetVisibilityState() {
  const using2D = is2DVisibleInThisWindow();
  const showing3D = is3DVisibleInThisWindow();
  const roamingEnabled =
    !IS_ROAMING_OVERLAY &&
    activeDisplayMode === '3d' &&
    petSettings.allowRoaming;
  document.body.classList.toggle('mode-2d', using2D);
  document.body.classList.toggle(
    'roaming-anchor',
    !IS_ROAMING_OVERLAY && roamingEnabled && !showing3D
  );
  spriteModeEl.setAttribute('aria-hidden', String(!using2D));
  document.body.classList.toggle('pet-3d-visible', showing3D);
  applyQuoteCardPlacement();
}

function applyPetSettings(persist = true) {
  const quietRuntime = quietRuntimeSettings(petSettings, quietOfficeActive);
  const emotion = emotionMemory.snapshot();
  const effectsQualityScale = { low: 0.62, balanced: 1, high: 1.18 }[
    petSettings.effectsQuality
  ] || 1;
  const audibleVolume = quietRuntime.muted ? 0 : petSettings.volume;
  audioManager.setVolume(audibleVolume);
  effectsManager.configure({
    level: Math.min(1.5, quietRuntime.effects * effectsQualityScale),
    lowPower: quietRuntime.powerSave,
    quietMode: quietRuntime.quietMode,
    role: IS_ROAMING_OVERLAY ? 'roaming' : 'home',
    visible: is3DVisibleInThisWindow() || is2DVisibleInThisWindow(),
    sleeping: isSleepingLifecycle()
  });
  const roamingEnabled =
    !IS_ROAMING_OVERLAY &&
    activeDisplayMode === '3d' &&
    petSettings.allowRoaming;
  applyPetVisibilityState();
  document.body.classList.toggle('power-save', quietRuntime.powerSave);
  document.body.classList.toggle('quiet-office', quietOfficeActive);
  document.body.dataset.emotion = emotion.enabled ? emotion.mood : 'neutral';
  document.body.dataset.modelQuality = petSettings.modelQuality;
  document.body.dataset.effectsQuality = petSettings.effectsQuality;
  applyRendererQuality();
  if (!is2DVisibleInThisWindow() || quietRuntime.effects <= 0.01) {
    incense2DEl.classList.remove('active');
  }

  if (persist) {
    try {
      saveJson(localStorage, 'niulai:pet-settings', petSettings);
    } catch {}
  }
  if (!IS_ROAMING_OVERLAY) {
    homeWindowController.setThreeDimensional(roamingEnabled, {
      ...petSettings,
      powerSave: quietRuntime.powerSave,
      roamingSpeed: quietRuntime.roamingSpeed,
      roamingFrequency: petSettings.roamingFrequency,
      quietMode: quietRuntime.quietMode,
      emotion: emotion.enabled ? emotion.mood : 'neutral',
      emotionProfile: emotion.enabled ? emotion.profile : null,
      effectiveDisplayMode: activeDisplayMode
    });
  }
}

function applyRendererQuality() {
  if (!renderer) return;
  const pixelRatioLimit = { low: 1, balanced: 1.5, high: 2 }[petSettings.modelQuality] || 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioLimit));
  renderer.setSize(300, 300, false);
}

function refreshRuntimePolicies({ force = false } = {}) {
  const nextQuiet = isQuietOfficeActive(petSettings.quietOffice);
  if (!force && nextQuiet === quietOfficeActive) return false;
  quietOfficeActive = nextQuiet;
  applyPetSettings(false);
  if (!IS_ROAMING_OVERLAY) {
    window.desktopPet?.report?.('info', `安静办公模式${quietOfficeActive ? '已启用' : '已结束'}`);
  }
  return true;
}

function updateSettingOutputs() {
  valueVolumeEl.textContent = `${settingVolumeEl.value}%`;
  valueMotionEl.textContent = `${settingMotionEl.value}%`;
  valueScaleEl.textContent = `${settingScaleEl.value}%`;
  valueEffectsEl.textContent = `${settingEffectsEl.value}%`;
  valueRoamingSpeedEl.textContent = `${settingRoamingSpeedEl.value}%`;
  valueRoamingFrequencyEl.textContent = `${settingRoamingFrequencyEl.value}%`;
  settingsPanelEl.classList.toggle(
    'power-recommendation-visible',
    settingPowerSaveEl.checked
  );
}

function symbolMarket(symbol) {
  const value = String(symbol || '').toLowerCase();
  if (value.startsWith('rt_hk')) return 'hk';
  if (value.startsWith('gb_')) return 'us';
  return 'cn';
}

function marketLabel(market) {
  return { cn: 'A股', hk: '港股', us: '美股' }[market] || '股票';
}

function selectedMarketsFromForm() {
  return [
    marketCnEl.checked ? 'cn' : '',
    marketHkEl.checked ? 'hk' : '',
    marketUsEl.checked ? 'us' : ''
  ].filter(Boolean);
}

function populateSettingsForm() {
  resetAllSettingsPending = false;
  settingsResetEl.textContent = '恢复默认';
  const remembered = savedStockForSymbol(savedStocks, selectedSymbol);
  const sameHolding = portfolio.symbol === selectedSymbol;
  settingSymbolEl.value = displaySymbol(selectedSymbol);
  settingSymbolEl.dataset.code = selectedSymbol;
  settingSymbolEl.dataset.name = remembered?.name || quote?.name || '';
  settingCostEl.value =
    sameHolding && portfolio.cost > 0 ? portfolio.cost.toFixed(2) : '';
  settingSharesEl.value =
    sameHolding && portfolio.shares > 0 ? String(portfolio.shares) : '';
  settingSaveStockEl.checked = Boolean(remembered) || savedStocks.length === 0;
  marketCnEl.checked = petSettings.markets.includes('cn');
  marketHkEl.checked = petSettings.markets.includes('hk');
  marketUsEl.checked = petSettings.markets.includes('us');
  stockSearchResultsEl.replaceChildren();
  settingVolumeEl.value = String(Math.round(petSettings.volume * 100));
  settingMotionEl.value = String(Math.round(petSettings.motion * 100));
  settingScaleEl.value = String(Math.round(petSettings.modelScale * 100));
  settingEffectsEl.value = String(Math.round(petSettings.effects * 100));
  settingRoamingSpeedEl.value = String(Math.round(petSettings.roamingSpeed * 100));
  settingRoamingFrequencyEl.value = String(Math.round(petSettings.roamingFrequency * 100));
  settingSoundEl.checked = !petSettings.muted;
  settingQuoteEl.checked = petSettings.showQuote;
  settingQuoteFollowEl.checked = petSettings.quoteCardMode === 'follow';
  settingPowerSaveEl.checked = petSettings.powerSave;
  settingAllowRoamingEl.checked = petSettings.allowRoaming;
  settingCrossDisplayEl.checked = petSettings.crossDisplayRoaming;
  settingAutoContinueEl.checked = petSettings.autoContinueRoaming;
  settingAutoHomeEl.checked = petSettings.autoHome;
  settingExtremePerformanceEl.checked = petSettings.extremeMarketPerformance;
  settingModelQualityEl.value = petSettings.modelQuality;
  settingEffectsQualityEl.value = petSettings.effectsQuality;
  settingMaxFpsEl.value = String(petSettings.maxFps);
  settingDisplayModeEl.value = petSettings.displayMode;
  settingSymbolEl.setCustomValidity('');
  settingCostEl.setCustomValidity('');
  settingSharesEl.setCustomValidity('');
  updateSettingOutputs();
}

let resetAllSettingsPending = false;

function setSettingsPanelOpen(open) {
  if (open) {
    stockPickerPanelEl.classList.remove('open');
    stockPickerPanelEl.setAttribute('aria-hidden', 'true');
    stockDetailPanelEl.classList.remove('open');
    stockDetailPanelEl.setAttribute('aria-hidden', 'true');
    helpPanelEl.classList.remove('open');
    helpPanelEl.setAttribute('aria-hidden', 'true');
    featurePanelEl.classList.remove('open');
    featurePanelEl.setAttribute('aria-hidden', 'true');
    closeSummaryPanelEl.classList.remove('open');
    closeSummaryPanelEl.setAttribute('aria-hidden', 'true');
    featurePanelEl.classList.remove('open');
    featurePanelEl.setAttribute('aria-hidden', 'true');
    closeSummaryPanelEl.classList.remove('open');
    closeSummaryPanelEl.setAttribute('aria-hidden', 'true');
  }
  settingsPanelEl.classList.toggle('open', open);
  settingsPanelEl.setAttribute('aria-hidden', String(!open));
  settingsToggleEl.setAttribute('aria-expanded', String(open));
  settingsToggleEl.setAttribute('aria-label', open ? '关闭设置' : '打开设置');
  if (open) {
    populateSettingsForm();
  }
  syncUiPanelState();
}

function setStockDetailOpen(open) {
  if (open) {
    stockPickerPanelEl.classList.remove('open');
    stockPickerPanelEl.setAttribute('aria-hidden', 'true');
    settingsPanelEl.classList.remove('open');
    settingsPanelEl.setAttribute('aria-hidden', 'true');
    settingsToggleEl.setAttribute('aria-expanded', 'false');
    helpPanelEl.classList.remove('open');
    helpPanelEl.setAttribute('aria-hidden', 'true');
    renderStockDetails(quote);
  }
  stockDetailPanelEl.classList.toggle('open', open);
  stockDetailPanelEl.setAttribute('aria-hidden', String(!open));
  syncUiPanelState();
}

function setStockPickerOpen(open) {
  if (open) {
    settingsPanelEl.classList.remove('open');
    settingsPanelEl.setAttribute('aria-hidden', 'true');
    settingsToggleEl.setAttribute('aria-expanded', 'false');
    stockDetailPanelEl.classList.remove('open');
    stockDetailPanelEl.setAttribute('aria-hidden', 'true');
    helpPanelEl.classList.remove('open');
    helpPanelEl.setAttribute('aria-hidden', 'true');
    featurePanelEl.classList.remove('open');
    featurePanelEl.setAttribute('aria-hidden', 'true');
    renderSavedStockList();
  }
  stockPickerPanelEl.classList.toggle('open', open);
  stockPickerPanelEl.setAttribute('aria-hidden', String(!open));
  syncUiPanelState();
}

settingsToggleEl.addEventListener('click', (event) => {
  event.stopPropagation();
  setSettingsPanelOpen(!settingsPanelEl.classList.contains('open'));
});
settingsFeaturesEl.addEventListener('click', () => setFeaturePanelOpen(true));
featureCloseEl.addEventListener('click', () => setFeaturePanelOpen(false));
triggerTypeEl.addEventListener('change', syncTriggerEditor);
triggerAddEl.addEventListener('click', () => {
  if (alertTriggers.length >= 20) {
    showAlertToast('最多保留20条提醒');
    return;
  }
  alertTriggers.push({
    id: `alert-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    enabled: true,
    type: triggerTypeEl.value,
    comparator: triggerComparatorEl.value,
    value: Number(triggerValueEl.value) || 0,
    presentation: triggerPresentationEl.value,
    sound: triggerSoundEl.checked,
    cooldownMs: 60000
  });
  alertTriggers = normalizeAlertTriggers(alertTriggers);
  renderTriggerList();
});
featureFormEl.addEventListener('submit', (event) => {
  event.preventDefault();
  petSettings = {
    ...petSettings,
    emotionMemory: featureEmotionEl.checked,
    closeSummary: featureSummaryEl.checked,
    quietOffice: {
      enabled: featureQuietEl.checked,
      start: featureQuietStartEl.value || '09:30',
      end: featureQuietEndEl.value || '11:30'
    }
  };
  emotionMemory.configure({ enabled: petSettings.emotionMemory });
  alertTriggerEngine.configure(alertTriggers);
  saveJson(localStorage, 'niulai:alert-triggers-v1', alertTriggers);
  saveJson(localStorage, 'niulai:emotion-memory-v1', emotionMemory.snapshot());
  quietOfficeActive = isQuietOfficeActive(petSettings.quietOffice);
  applyPetSettings(true);
  featureDraftCommitted = true;
  setFeaturePanelOpen(false);
  showAlertToast('特色设置已保存在本机');
});
summaryCloseEl.addEventListener('click', () => setCloseSummaryOpen(false));
summaryDisableEl.addEventListener('click', () => {
  petSettings = { ...petSettings, closeSummary: false };
  applyPetSettings(true);
  setCloseSummaryOpen(false);
  showAlertToast('以后不再自动展示收盘总结');
});
settingsPanelEl.addEventListener('pointerdown', (event) => event.stopPropagation());
featurePanelEl.addEventListener('pointerdown', (event) => event.stopPropagation());
closeSummaryPanelEl.addEventListener('pointerdown', (event) => event.stopPropagation());
stockDetailPanelEl.addEventListener('pointerdown', (event) => event.stopPropagation());
stockPickerPanelEl.addEventListener('pointerdown', (event) => event.stopPropagation());
detailCloseEl.addEventListener('click', () => setStockDetailOpen(false));
document.addEventListener('pointerdown', (event) => {
  if (
    settingsPanelEl.classList.contains('open') &&
    !settingsPanelEl.contains(event.target) &&
    event.target !== settingsToggleEl
  ) {
    setSettingsPanelOpen(false);
  }
  if (stockDetailPanelEl.classList.contains('open') && !stockDetailPanelEl.contains(event.target) && !quoteCardEl.contains(event.target)) setStockDetailOpen(false);
  if (stockPickerPanelEl.classList.contains('open') && !stockPickerPanelEl.contains(event.target) && !quoteCardEl.contains(event.target)) setStockPickerOpen(false);
});

for (const input of [
  settingVolumeEl,
  settingMotionEl,
  settingScaleEl,
  settingEffectsEl,
  settingRoamingSpeedEl,
  settingRoamingFrequencyEl
]) {
  input.addEventListener('input', updateSettingOutputs);
}
settingPowerSaveEl.addEventListener('change', updateSettingOutputs);
settingAutoHomeEl.addEventListener('change', () => {
  settingAutoContinueEl.checked = !settingAutoHomeEl.checked;
});
applyPowerRecommendationEl.addEventListener('click', () => {
  settingMaxFpsEl.value = '30';
  settingModelQualityEl.value = 'low';
  settingEffectsQualityEl.value = 'low';
  settingRoamingFrequencyEl.value = '55';
  updateSettingOutputs();
});
settingsResetEl.addEventListener('click', () => {
  resetAllSettingsPending = true;
  settingsResetEl.textContent = '默认待保存';
  settingSymbolEl.value = 'sh000001';
  settingSymbolEl.dataset.code = 's_sh000001';
  settingSymbolEl.dataset.name = '上证指数';
  settingCostEl.value = '';
  settingSharesEl.value = '';
  settingSaveStockEl.checked = true;
  marketCnEl.checked = true;
  marketHkEl.checked = true;
  marketUsEl.checked = true;
  settingVolumeEl.value = String(DEFAULT_SETTINGS.volume * 100);
  settingMotionEl.value = String(DEFAULT_SETTINGS.motion * 100);
  settingScaleEl.value = String(DEFAULT_SETTINGS.modelScale * 100);
  settingEffectsEl.value = String(DEFAULT_SETTINGS.effects * 100);
  settingRoamingSpeedEl.value = String(DEFAULT_SETTINGS.roamingSpeed * 100);
  settingRoamingFrequencyEl.value = String(DEFAULT_SETTINGS.roamingFrequency * 100);
  settingSoundEl.checked = true;
  settingQuoteEl.checked = true;
  settingQuoteFollowEl.checked = DEFAULT_SETTINGS.quoteCardMode === 'follow';
  settingPowerSaveEl.checked = DEFAULT_SETTINGS.powerSave;
  settingAllowRoamingEl.checked = DEFAULT_SETTINGS.allowRoaming;
  settingCrossDisplayEl.checked = DEFAULT_SETTINGS.crossDisplayRoaming;
  settingAutoContinueEl.checked = DEFAULT_SETTINGS.autoContinueRoaming;
  settingAutoHomeEl.checked = DEFAULT_SETTINGS.autoHome;
  settingExtremePerformanceEl.checked = DEFAULT_SETTINGS.extremeMarketPerformance;
  settingModelQualityEl.value = DEFAULT_SETTINGS.modelQuality;
  settingEffectsQualityEl.value = DEFAULT_SETTINGS.effectsQuality;
  settingMaxFpsEl.value = String(DEFAULT_SETTINGS.maxFps);
  settingDisplayModeEl.value = DEFAULT_SETTINGS.displayMode;
  updateSettingOutputs();
});
settingsHelpEl.addEventListener('click', () => setHelpPanelOpen(true));
settingsRecenterEl.addEventListener('click', async () => {
  const result = await window.desktopPet?.resetWindowPosition?.();
  showSpeech(result?.ok ? '已经回到屏幕右下角啦！' : '窗口归位失败，请重试');
});
settingsRecallEl.addEventListener('click', async () => {
  actionScheduler.cancelAll();
  const result = await homeWindowController.recallRoaming();
  showSpeech(result?.message || (result?.ok ? '牛来正在回家' : '巡游牛尚未开启'));
});
settingsCloseEl.addEventListener('click', () => {
  resetAllSettingsPending = false;
  settingsResetEl.textContent = '恢复默认';
  setSettingsPanelOpen(false);
});
settingsCancelEl.addEventListener('click', () => {
  resetAllSettingsPending = false;
  settingsResetEl.textContent = '恢复默认';
  setSettingsPanelOpen(false);
});
helpCloseEl.addEventListener('click', () => setHelpPanelOpen(false));
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (helpPanelEl.classList.contains('open')) setHelpPanelOpen(false);
  else if (stockPickerPanelEl.classList.contains('open')) setStockPickerOpen(false);
  else if (stockDetailPanelEl.classList.contains('open')) setStockDetailOpen(false);
  else if (settingsPanelEl.classList.contains('open')) setSettingsPanelOpen(false);
  else return;
  event.preventDefault();
});
function renderStockSearchResults(results, message = '') {
  stockSearchResultsEl.replaceChildren();
  if (!results?.length) {
    const empty = document.createElement('div');
    empty.className = 'search-message';
    empty.textContent = message || '没有找到匹配股票';
    stockSearchResultsEl.appendChild(empty);
    return;
  }
  for (const result of results) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stock-search-result';
    const badge = document.createElement('span');
    badge.className = 'market-badge';
    badge.textContent = marketLabel(result.market);
    const name = document.createElement('strong');
    name.textContent = result.name || result.displayCode;
    const code = document.createElement('small');
    code.textContent = result.displayCode || displaySymbol(result.code);
    button.append(badge, name, code);
    button.addEventListener('click', () => {
      settingSymbolEl.value = result.displayCode || displaySymbol(result.code);
      settingSymbolEl.dataset.code = result.code;
      settingSymbolEl.dataset.name = result.name || '';
      const remembered = savedStockForSymbol(savedStocks, result.code);
      settingCostEl.value = remembered?.cost > 0 ? String(remembered.cost) : '';
      settingSharesEl.value = remembered?.shares > 0 ? String(remembered.shares) : '';
      settingSaveStockEl.checked = true;
      stockSearchResultsEl.replaceChildren();
      settingSymbolEl.focus();
    });
    stockSearchResultsEl.appendChild(button);
  }
}

let stockSearchToken = 0;
async function searchStocks() {
  const query = settingSymbolEl.value.trim();
  const markets = selectedMarketsFromForm();
  const token = ++stockSearchToken;
  if (!markets.length) {
    renderStockSearchResults([], '请至少勾选一个市场');
    return;
  }
  if (!query) {
    stockSearchResultsEl.replaceChildren();
    return;
  }
  stockSearchButtonEl.disabled = true;
  renderStockSearchResults([], '正在同时搜索…');
  const result = await window.desktopPet?.searchSymbols?.(query, markets);
  if (token !== stockSearchToken) return;
  stockSearchButtonEl.disabled = false;
  renderStockSearchResults(result?.results || [], result?.message || '没有找到匹配股票');
}

let stockSearchTimer = null;
settingSymbolEl.addEventListener('input', () => {
  delete settingSymbolEl.dataset.code;
  delete settingSymbolEl.dataset.name;
  clearTimeout(stockSearchTimer);
  stockSearchTimer = setTimeout(searchStocks, 360);
});
stockSearchButtonEl.addEventListener('click', searchStocks);
for (const checkbox of [marketCnEl, marketHkEl, marketUsEl]) {
  checkbox.addEventListener('change', () => {
    clearTimeout(stockSearchTimer);
    if (settingSymbolEl.value.trim()) stockSearchTimer = setTimeout(searchStocks, 120);
  });
}
settingsFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  const cost = Math.max(0, Number(settingCostEl.value) || 0);
  const shares = Math.max(0, Number(settingSharesEl.value) || 0);
  const markets = selectedMarketsFromForm();

  settingCostEl.setCustomValidity('');
  settingSharesEl.setCustomValidity('');
  settingSymbolEl.setCustomValidity('');
  if (!markets.length) {
    settingSymbolEl.setCustomValidity('请至少选择 A股、港股或美股中的一个市场');
    settingSymbolEl.reportValidity();
    return;
  }
  if ((cost > 0) !== (shares > 0)) {
    const missing = cost > 0 ? settingSharesEl : settingCostEl;
    missing.setCustomValidity('成本价与持股数量需要同时填写，或同时留空');
    missing.reportValidity();
    return;
  }

  const result = await window.desktopPet?.selectSymbol(
    settingSymbolEl.dataset.code || settingSymbolEl.value
  );
  if (!result?.ok) {
    settingSymbolEl.setCustomValidity(
      result?.message || '请输入股票名称或代码并从搜索结果中选择'
    );
    settingSymbolEl.reportValidity();
    return;
  }
  if (!markets.includes(result.market || symbolMarket(result.code))) {
    settingSymbolEl.setCustomValidity('当前股票所属市场未勾选，请先启用对应市场');
    settingSymbolEl.reportValidity();
    return;
  }

  selectedSymbol = result.code;
  marketEventEngine.setSymbol(selectedSymbol);
  const existingStock = savedStockForSymbol(savedStocks, result.code);
  portfolio = { symbol: result.code, cost, shares };
  if (settingSaveStockEl.checked) {
    const remembered = {
      symbol: result.code,
      name: settingSymbolEl.dataset.name || existingStock?.name || '',
      market: result.market || symbolMarket(result.code),
      cost,
      shares,
      savedAt: existingStock?.savedAt || Date.now()
    };
    savedStocks = [remembered, ...savedStocks.filter((item) => item.symbol !== result.code)].slice(0, 50);
  } else {
    savedStocks = savedStocks.filter((item) => item.symbol !== result.code);
  }
  marketStore.portfolio = portfolio;
  petSettings = {
    volume: Number(settingVolumeEl.value) / 100,
    muted: !settingSoundEl.checked,
    motion: Number(settingMotionEl.value) / 100,
    modelScale: Number(settingScaleEl.value) / 100,
    effects: Number(settingEffectsEl.value) / 100,
    roamingSpeed: Number(settingRoamingSpeedEl.value) / 100,
    roamingFrequency: Number(settingRoamingFrequencyEl.value) / 100,
    allowRoaming: settingAllowRoamingEl.checked,
    crossDisplayRoaming: settingCrossDisplayEl.checked,
    showQuote: settingQuoteEl.checked,
    quoteCardMode: settingQuoteFollowEl.checked ? 'follow' : 'home',
    autoContinueRoaming: !settingAutoHomeEl.checked,
    autoHome: settingAutoHomeEl.checked,
    displayMode: ['2d', '3d', 'auto'].includes(settingDisplayModeEl.value)
      ? settingDisplayModeEl.value
      : '2d',
    powerSave: settingPowerSaveEl.checked,
    extremeMarketPerformance: settingExtremePerformanceEl.checked,
    modelQuality: ['low', 'balanced', 'high'].includes(settingModelQualityEl.value)
      ? settingModelQualityEl.value
      : 'balanced',
    effectsQuality: ['low', 'balanced', 'high'].includes(settingEffectsQualityEl.value)
      ? settingEffectsQualityEl.value
      : 'balanced',
    maxFps: [24, 30, 45, 60].includes(Number(settingMaxFpsEl.value))
      ? Number(settingMaxFpsEl.value)
      : 60,
    emotionMemory: resetAllSettingsPending ? DEFAULT_SETTINGS.emotionMemory : petSettings.emotionMemory,
    closeSummary: resetAllSettingsPending ? DEFAULT_SETTINGS.closeSummary : petSettings.closeSummary,
    markets,
    quietOffice: resetAllSettingsPending
      ? { ...DEFAULT_SETTINGS.quietOffice }
      : { ...petSettings.quietOffice }
  };
  if (resetAllSettingsPending) {
    alertTriggers = [];
    alertTriggerEngine.configure(alertTriggers);
    emotionMemory.configure({ enabled: false });
    saveJson(localStorage, 'niulai:alert-triggers-v1', alertTriggers);
  }
  try {
    saveJson(localStorage, 'niulai:portfolio', portfolio);
    saveJson(localStorage, 'niulai:saved-stocks-v1', savedStocks);
    localStorage.setItem('niulai:selected-symbol', selectedSymbol);
  } catch {}
  applyPetSettings();
  if (demoState) {
    renderQuoteCard(quote);
    renderPositionPnl(quote);
  } else {
    marketStore.setSymbol(selectedSymbol);
    quote = marketStore.quote;
    prevQuote = marketStore.previousQuote;
    renderQuoteCard(null);
    renderPositionPnl(null);
  }
  updateStatus();
  resetAllSettingsPending = false;
  settingsResetEl.textContent = '恢复默认';
  setSettingsPanelOpen(false);
});
applyPetSettings(false);

renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance'
});
applyRendererQuality();
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
sceneEl.appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  fallback3DTo2D('WebGL 上下文丢失');
});

const scene = new THREE.Scene();

let bullFurTexturePromise = null;
function loadBullFurTexture() {
  if (bullFurTexturePromise) return bullFurTexturePromise;
  bullFurTexturePromise = new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      assetUrl('textures/bull-fur-v2.png'),
      (texture) => {
        texture.name = 'bull_fur_v2';
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(3.5, 3.5);
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        resolve(texture);
      },
      undefined,
      reject
    );
  });
  return bullFurTexturePromise;
}

function applyBullFurTexture(root) {
  loadBullFurTexture().then((texture) => {
    root?.traverse?.((object) => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material || !/^fur_/.test(material.name || '')) continue;
        material.map = texture;
        material.color.set(0xffffff);
        material.roughness = 0.82;
        material.needsUpdate = true;
      }
    });
  }).catch((error) => {
    window.desktopPet?.report?.('warn', `毛发贴图加载失败，继续使用基础材质: ${error.message}`);
  });
}
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 1.65, 6.0);
camera.lookAt(0, 0.9, 0);

const hemisphere = new THREE.HemisphereLight(0xfff4e0, 0x5a4632, 1.0);
const keyLight = new THREE.DirectionalLight(0xfff0d0, 1.8);
keyLight.position.set(3, 5, 4);
const rimLight = new THREE.DirectionalLight(0x9fc8ff, 1.1);
rimLight.position.set(-4, 2, -3);
const glowLight = new THREE.PointLight(0xffaa55, 0, 8);
glowLight.position.set(0, 1.8, 1.2);
scene.add(hemisphere, keyLight, rimLight, glowLight);

function makeZzzTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 160, 160);
  ctx.font = 'bold 58px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillText('zzz', 80, 82);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createFurTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b86f2e';
  ctx.fillRect(0, 0, 256, 256);

  let seed = 9371;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };

  for (let i = 0; i < 2200; i += 1) {
    const x = random() * 256;
    const y = random() * 256;
    const length = 2 + random() * 7;
    const light = random() > 0.48;
    ctx.strokeStyle = light
      ? `rgba(255, 205, 135, ${0.06 + random() * 0.13})`
      : `rgba(82, 38, 12, ${0.05 + random() * 0.16})`;
    ctx.lineWidth = 0.45 + random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 2, y + length);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.4, 2.4);
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function createProceduralBull() {
  const group = new THREE.Group();
  group.name = 'reference_bull';

  const furTexture = createFurTexture();
  const fur = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: furTexture,
    roughness: 0.94,
    metalness: 0
  });
  const furDark = new THREE.MeshStandardMaterial({
    color: 0x754018,
    roughness: 0.98,
    metalness: 0
  });
  const muzzleMaterial = new THREE.MeshStandardMaterial({
    color: 0xd99883,
    roughness: 0.88,
    metalness: 0
  });
  const hornMaterial = new THREE.MeshStandardMaterial({
    color: 0x77736d,
    roughness: 0.82,
    metalness: 0.05
  });
  const hoofMaterial = new THREE.MeshStandardMaterial({
    color: 0x625c55,
    roughness: 0.9,
    metalness: 0.02
  });
  const eyeWhite = new THREE.MeshStandardMaterial({
    color: 0xf4eadc,
    roughness: 0.72,
    metalness: 0
  });
  const eyeDark = new THREE.MeshStandardMaterial({
    color: 0x171008,
    roughness: 0.55,
    metalness: 0
  });

  const addMesh = (
    geometry,
    material,
    position,
    scale = [1, 1, 1],
    rotation = [0, 0, 0],
    parent = group
  ) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    object.scale.set(...scale);
    object.rotation.set(...rotation);
    parent.add(object);
    return object;
  };

  addMesh(
    new THREE.CapsuleGeometry(0.5, 0.78, 10, 24),
    fur,
    [0, 1.18, 0],
    [1.04, 1, 0.76]
  );
  addMesh(
    new THREE.SphereGeometry(0.52, 32, 24),
    fur,
    [0, 0.93, 0.12],
    [1.05, 1.12, 0.76]
  );
  addMesh(
    new THREE.SphereGeometry(0.42, 28, 20),
    furDark,
    [0, 1.5, -0.16],
    [1.1, 0.7, 0.72]
  );

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.98, 0.02);
  group.add(head);

  addMesh(
    new THREE.SphereGeometry(0.46, 32, 24),
    fur,
    [0, 0, 0],
    [1, 0.92, 0.8],
    [0, 0, 0],
    head
  );
  addMesh(
    new THREE.SphereGeometry(0.3, 28, 20),
    muzzleMaterial,
    [0, -0.13, 0.34],
    [1.16, 0.68, 0.72],
    [0, 0, 0],
    head
  );
  addMesh(
    new THREE.SphereGeometry(0.23, 24, 18),
    muzzleMaterial,
    [0, -0.29, 0.39],
    [1.28, 0.36, 0.66],
    [0, 0, 0],
    head
  );

  for (const side of [-1, 1]) {
    addMesh(
      new THREE.SphereGeometry(0.085, 16, 12),
      eyeWhite,
      [side * 0.17, 0.075, 0.334],
      [1.25, 0.57, 0.38],
      [0, 0, 0],
      head
    );
    addMesh(
      new THREE.SphereGeometry(0.035, 14, 10),
      eyeDark,
      [side * 0.155, 0.068, 0.38],
      [0.72, 1, 0.5],
      [0, 0, 0],
      head
    );
    addMesh(
      new THREE.BoxGeometry(0.22, 0.032, 0.035),
      furDark,
      [side * 0.17, 0.178, 0.35],
      [1, 1, 1],
      [0, 0, side * -0.13],
      head
    );
    addMesh(
      new THREE.SphereGeometry(0.027, 12, 8),
      furDark,
      [side * 0.105, -0.14, 0.535],
      [1.3, 0.72, 0.45],
      [0, 0, 0],
      head
    );

    const ear = addMesh(
      new THREE.SphereGeometry(0.16, 20, 14),
      fur,
      [side * 0.46, 0.09, -0.01],
      [1.16, 0.48, 0.76],
      [0, side * 0.16, side * -0.24],
      head
    );
    ear.name = side < 0 ? 'ear_left' : 'ear_right';

    const hornCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.24, 0.27, -0.02),
      new THREE.Vector3(side * 0.32, 0.5, -0.02),
      new THREE.Vector3(side * 0.47, 0.62, 0),
      new THREE.Vector3(side * 0.58, 0.67, 0.03)
    ]);
    addMesh(
      new THREE.TubeGeometry(hornCurve, 28, 0.055, 10, false),
      hornMaterial,
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
      head
    );
    addMesh(
      new THREE.ConeGeometry(0.055, 0.18, 12),
      hornMaterial,
      [side * 0.62, 0.72, 0.04],
      [1, 1, 1],
      [0, 0, side * -0.62],
      head
    );
  }

  const mouth = addMesh(
    new THREE.TorusGeometry(0.16, 0.014, 8, 32, Math.PI),
    furDark,
    [0, -0.27, 0.55],
    [1.1, 0.55, 1],
    [0, 0, Math.PI],
    head
  );
  mouth.name = 'mouth';

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'arm_left' : 'arm_right';
    arm.position.set(side * 0.65, 1.28, 0.01);
    arm.rotation.z = side * -0.08;
    group.add(arm);
    addMesh(
      new THREE.CapsuleGeometry(0.15, 0.48, 8, 16),
      fur,
      [0, -0.24, 0],
      [1, 1, 0.88],
      [0, 0, 0],
      arm
    );
    addMesh(
      new THREE.SphereGeometry(0.16, 20, 14),
      muzzleMaterial,
      [0, -0.65, 0.03],
      [0.88, 1.15, 0.72],
      [0, 0, 0],
      arm
    );
    arms.push(arm);
  }

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'leg_left' : 'leg_right';
    leg.position.set(side * 0.27, 0.55, 0);
    group.add(leg);
    addMesh(
      new THREE.CapsuleGeometry(0.235, 0.42, 10, 18),
      fur,
      [0, -0.17, 0],
      [1, 1.08, 0.82],
      [0, 0, 0],
      leg
    );
    addMesh(
      new THREE.SphereGeometry(0.25, 22, 16),
      hoofMaterial,
      [0, -0.5, 0.08],
      [1.05, 0.42, 1.18],
      [0, 0, 0],
      leg
    );
    addMesh(
      new THREE.BoxGeometry(0.022, 0.12, 0.22),
      furDark,
      [0, -0.5, 0.285],
      [1, 1, 1],
      [0, 0, 0],
      leg
    );
    legs.push(leg);
  }

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.34, 1.02, -0.34),
    new THREE.Vector3(0.58, 0.83, -0.38),
    new THREE.Vector3(0.59, 0.54, -0.32),
    new THREE.Vector3(0.5, 0.4, -0.25)
  ]);
  addMesh(
    new THREE.TubeGeometry(tailCurve, 24, 0.035, 9, false),
    furDark,
    [0, 0, 0]
  );
  addMesh(
    new THREE.SphereGeometry(0.1, 16, 12),
    furDark,
    [0.5, 0.36, -0.23],
    [0.62, 1.28, 0.62]
  );

  group.scale.setScalar(0.94);
  group.userData.materials = [
    fur,
    furDark,
    muzzleMaterial,
    hornMaterial,
    hoofMaterial,
    eyeWhite,
    eyeDark
  ];
  group.userData.head = head;
  group.userData.frontLegs = arms;
  group.userData.backLegs = legs;
  return group;
}

function collectMaterials(root, output) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (material && !output.includes(material)) {
        output.push(material);
      }
    }
  });
}

function disposeObject(root) {
  root.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (material) material.dispose();
    }
  });
}

function findNode(root, keywords) {
  let found = null;
  root.traverse((object) => {
    if (found || object === root) return;
    const name = object.name.toLowerCase();
    if (keywords.some((keyword) => name.includes(keyword))) {
      found = object;
    }
  });
  return found;
}

function normalizeModel(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  let continuousMesh = false;
  root.traverse((object) => {
    if (object.userData?.rig?.meshType === 'continuous_reference_reconstruction') {
      continuousMesh = true;
    }
  });
  const targetDimension = continuousMesh ? 2.16 : 2.35;
  const scale = targetDimension / maxDimension;
  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(root);
  const min = scaledBox.min;
  const center = scaledBox.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= min.y;
}

const petRoot = new THREE.Group();
scene.add(petRoot);

skeletalAnimationController = new SkeletalAnimationController({
  report: (level, message) => window.desktopPet?.report?.(level, message),
  onFallback: (action) => {
    document.body.dataset.animationFallback = action;
  },
  onEvent: (event) => {
    effectsManager.handleAnimationEvent(event);
    if (event.type === 'animation-finished') {
      actionScheduler.finish(`animation:${event.action}`);
    }
    window.dispatchEvent(new CustomEvent('niulai:animation-event', { detail: event }));
  }
});
installAnimationDebugPanel(skeletalAnimationController);

function scheduleBullAnimation(name, {
  priority = 30,
  cooldown = 0,
  queue = false,
  loop,
  fade,
  timeScale,
  duration = 0,
  recoverMotion = true,
  onStart,
  onComplete
} = {}) {
  let started = false;
  let releaseTimer = null;
  const actionName = `animation:${name}`;
  const clearReleaseTimer = () => {
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = null;
  };
  const scheduled = actionScheduler.run({
    name: actionName,
    priority,
    cooldown,
    queue,
    start: () => {
      onStart?.();
      started = skeletalAnimationController.play(name, {
        force: true,
        loop,
        fade,
        timeScale
      });
      if (!started) {
        queueMicrotask(() => actionScheduler.finish(actionName));
      } else if (duration > 0) {
        releaseTimer = setTimeout(() => actionScheduler.finish(actionName), duration);
      }
    },
    interrupt: clearReleaseTimer,
    recover: () => {
      clearReleaseTimer();
      if (recoverMotion) skeletalAnimationController.applyRoamingMotion(roamingMotion);
      onComplete?.();
    }
  });
  return scheduled;
}

function runMarketPerformance(performance, event = null, { onComplete, atomicSequence = false } = {}) {
  if (!performance || targetState === STATE.CLOSED) return false;
  if (performance.effectCue) effectsManager.beginPerformance(performance.effectCue, { event });
  if (atomicSequence && performance.actions.length > 0) {
    let accepted = false;
    const playNext = (index) => {
      const action = performance.actions[index];
      if (!action) {
        skeletalAnimationController.applyRoamingMotion(roamingMotion);
        onComplete?.();
        return;
      }
      const scheduled = scheduleBullAnimation(action, {
        priority: performance.priority,
        queue: false,
        loop: false,
        fade: performance.rare ? 0.07 : 0.16,
        recoverMotion: index === performance.actions.length - 1,
        onComplete: () => {
          if (index === performance.actions.length - 1) onComplete?.();
          else playNext(index + 1);
        },
        onStart: index === 0 && performance.speech && !performance.effectCue
          ? () => showSpeech(performance.speech, performance.rare ? 4200 : 3000)
          : undefined
      });
      accepted ||= scheduled;
    };
    playNext(0);
    return accepted;
  }
  let accepted = false;
  performance.actions.forEach((action, index) => {
    const scheduled = scheduleBullAnimation(action, {
      priority: performance.priority,
      queue: performance.queue || index > 0,
      loop: false,
      fade: performance.rare ? 0.07 : 0.16,
      onComplete: index === performance.actions.length - 1 ? onComplete : undefined,
      onStart: index === 0 && performance.speech && !performance.effectCue
        ? () => showSpeech(performance.speech, performance.rare ? 4200 : 3000)
        : undefined
    });
    accepted ||= scheduled;
  });
  if (accepted && event && activeDisplayMode === '2d') {
    animate2DReaction(event.direction < 0 ? 'rage' : 'happy', performance.rare ? 1800 : 1280);
  }
  return accepted;
}

const AUTO_3D_EVENT_TYPES = new Set([
  MARKET_EVENT.RAPID_RISE,
  MARKET_EVENT.RAPID_FALL,
  MARKET_EVENT.LIMIT_UP,
  MARKET_EVENT.LIMIT_DOWN
]);
let forwardedAutoPerformance = null;

function dispatchMarketEvent(event) {
  if (
    IS_ROAMING_OVERLAY &&
    forwardedAutoPerformance?.type === event?.type &&
    performance.now() < forwardedAutoPerformance.until
  ) {
    return true;
  }
  if (!petSettings.extremeMarketPerformance && AUTO_3D_EVENT_TYPES.has(event?.type)) {
    showAlertToast(`极端行情提醒 · ${event?.direction < 0 ? '快速走弱' : '快速走强'}`);
    scheduleBullAnimation(event?.direction < 0 ? 'sad' : 'idle_look', {
      priority: 15,
      cooldown: 6000,
      fade: 0.28
    });
    if (activeDisplayMode === '2d') {
      animate2DReaction(event?.direction < 0 ? 'rage' : 'happy', 620);
    }
    return true;
  }
  if (quietOfficeActive) {
    showAlertToast(`安静提醒 · ${event?.direction < 0 ? '行情走弱' : '行情走强'}`);
    const subtleAction = event?.direction < 0 ? 'sad' : 'idle_look';
    scheduleBullAnimation(subtleAction, { priority: 14, cooldown: 6000, fade: 0.28 });
    if (activeDisplayMode === '2d') {
      animate2DReaction(event?.direction < 0 ? 'rage' : 'happy', 520);
    }
    return true;
  }
  if (
    !IS_ROAMING_OVERLAY &&
    petSettings.displayMode === 'auto' &&
    activeDisplayMode === '2d' &&
    petSettings.powerSave === false &&
    petSettings.allowRoaming &&
    AUTO_3D_EVENT_TYPES.has(event?.type)
  ) {
    window.desktopPet?.requestImportantMarketPerformance?.(event, petSettings);
    window.desktopPet?.report?.('info', `重要行情 ${event.type} 已请求自动切换3D演出`);
    return true;
  }
  const performance = performanceForMarketEvent(event);
  const accepted = runMarketPerformance(performance, event);
  window.desktopPet?.report?.(
    'info',
    `行情事件 ${event.type}${accepted ? ' 已进入动作调度' : ' 已被更高优先级动作抑制'}`
  );
  return accepted;
}

function handleAlertHit(hit) {
  const direction = Number(hit.direction) < 0 ? -1 : 1;
  showAlertToast(`提醒 · ${hit.label}`);
  if (hit.sound && !quietOfficeActive && !petSettings.muted) {
    effectsManager.trigger(COMIC_LAYER.SOUND, 'play', {
      direction: direction < 0 ? STATE.BEARISH : STATE.BULLISH,
      alertAuthorized: true
    });
  }
  if (quietOfficeActive || hit.presentation === ALERT_PRESENTATION.CARD) return;
  if (hit.presentation === ALERT_PRESENTATION.TWO_D) {
    if (activeDisplayMode === '2d') {
      animate2DReaction(direction < 0 ? 'rage' : 'happy', 1100);
      scheduleBullAnimation(direction < 0 ? 'sad' : 'happy', {
        priority: 34,
        cooldown: 4000
      });
    }
    return;
  }
  if (hit.presentation === ALERT_PRESENTATION.THREE_D) {
    if (!petSettings.extremeMarketPerformance) return;
    if (activeDisplayMode === '3d') {
      runMarketPerformance(
        performanceForMarketEvent({ type: direction < 0 ? MARKET_EVENT.RAPID_FALL : MARKET_EVENT.RAPID_RISE }),
        { type: direction < 0 ? MARKET_EVENT.RAPID_FALL : MARKET_EVENT.RAPID_RISE, direction }
      );
    } else if (petSettings.displayMode === 'auto' && !petSettings.powerSave && petSettings.allowRoaming) {
      window.desktopPet?.requestImportantMarketPerformance?.({
        type: direction < 0 ? MARKET_EVENT.RAPID_FALL : MARKET_EVENT.RAPID_RISE,
        direction,
        source: 'user-alert'
      }, petSettings);
    }
  }
}

function updateLocalFeatureState({ quote: nextQuote, position, marketOpen: open, events = [] } = {}) {
  if (IS_ROAMING_OVERLAY) return;
  dailySession.update({ quote: nextQuote, position, marketOpen: open });
  const emotion = open || events.length
    ? emotionMemory.update({ quote: nextQuote, position, marketOpen: open, events })
    : emotionMemory.snapshot();
  saveJson(localStorage, 'niulai:daily-session-v1', dailySession.snapshot());
  saveJson(localStorage, 'niulai:emotion-memory-v1', emotionMemory.snapshot());
  if (emotion.enabled && emotion.mood !== lastEmotionMood) {
    lastEmotionMood = emotion.mood;
    document.body.dataset.emotion = emotion.mood;
    applyPetSettings(false);
  }
  if (!open) return;
  const hits = alertTriggerEngine.evaluate({ quote: nextQuote, position, events });
  for (const hit of hits) handleAlertHit(hit);
}

function handleMarketClosedSummary() {
  if (IS_ROAMING_OVERLAY) return;
  const closed = dailySession.close();
  if (!closed) {
    window.desktopPet?.report?.('info', '收盘总结跳过：今日尚无有效行情样本');
    return;
  }
  window.desktopPet?.report?.(
    'info',
    `收盘总结检查：启用=${petSettings.closeSummary}，已展示=${closed.shown}，样本=${closed.samples}`
  );
  if (petSettings.closeSummary && !closed.shown) {
    dailySession.markShown();
    renderCloseSummary(dailySession.summary(emotionMemory.snapshot().label));
    window.desktopPet?.report?.('info', '收盘总结卡已展示');
  }
  saveJson(localStorage, 'niulai:daily-session-v1', dailySession.snapshot());
}

window.desktopPet?.onAutoPerformance?.((event) => {
  if (activeDisplayMode !== '3d' || !AUTO_3D_EVENT_TYPES.has(event?.type)) return;
  if ([STATE.CLOSED, STATE.DISCONNECTED].includes(targetState)) {
    previousState = targetState;
    targetState = Number(event?.direction) < 0 ? STATE.BEARISH : STATE.BULLISH;
    stateStartedAt = elapsed;
    transition = 0;
    bull2DController.setMarketState(targetState);
    bull3DController.setMarketState(targetState);
  }
  const finalAction = {
    [MARKET_EVENT.RAPID_RISE]: 'brake',
    [MARKET_EVENT.RAPID_FALL]: 'get_up',
    [MARKET_EVENT.LIMIT_UP]: 'happy',
    [MARKET_EVENT.LIMIT_DOWN]: 'get_up'
  }[event.type];
  forwardedAutoPerformance = {
    type: event.type,
    finalAction,
    until: performance.now() + 12000
  };
  runMarketPerformance(performanceForMarketEvent(event), event, {
    atomicSequence: true,
    onComplete: () => {
      if (forwardedAutoPerformance?.type !== event.type) return;
      forwardedAutoPerformance = null;
      window.desktopPet?.completeAutoPerformance?.(event.type);
    }
  });
});

// bull.glb 是无骨骼的高精度扫描网格。下面这些 uniform 会在 GPU 中给静态
// 网格增加一套轻量“软骨骼”，保留原模型颜色和细节，同时让头、手臂和腿独立运动。
const softRigUniforms = {
  armSwing: { value: 0 },
  legSwing: { value: 0 },
  headPitch: { value: 0 },
  headTilt: { value: 0 },
  tailWag: { value: 0 }
};
let softRigEnabled = false;

function installSoftRig(material) {
  if (!material || material.userData.softRigInstalled) return;
  material.userData.softRigInstalled = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uArmSwing = softRigUniforms.armSwing;
    shader.uniforms.uLegSwing = softRigUniforms.legSwing;
    shader.uniforms.uHeadPitch = softRigUniforms.headPitch;
    shader.uniforms.uHeadTilt = softRigUniforms.headTilt;
    shader.uniforms.uTailWag = softRigUniforms.tailWag;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uArmSwing;
uniform float uLegSwing;
uniform float uHeadPitch;
uniform float uHeadTilt;
uniform float uTailWag;
vec3 petRotateX(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}
vec3 petRotateZ(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
// 原始模型的局部坐标范围约为 [-1, 1]，Y 为高度，+Z 朝向镜头。
float side = position.x < 0.0 ? -1.0 : 1.0;
float armOuter = smoothstep(0.29, 0.43, abs(position.x));
float armTop = 1.0 - smoothstep(0.34, 0.54, position.y);
float armBottom = smoothstep(-0.64, -0.40, position.y);
float armMask = armOuter * armTop * armBottom;
vec3 shoulder = vec3(side * 0.34, 0.31, 0.0);
vec3 armPoint = transformed - shoulder;
float armAngle = uArmSwing * -side;
armPoint = petRotateX(armPoint, armAngle);
armPoint = petRotateZ(armPoint, armAngle * 0.24);
transformed = mix(transformed, armPoint + shoulder, armMask);

float legSide = smoothstep(0.075, 0.18, abs(position.x));
float legHeight = 1.0 - smoothstep(-0.24, -0.04, position.y);
float legMask = legSide * legHeight;
vec3 hip = vec3(side * 0.18, -0.24, 0.0);
vec3 legPoint = transformed - hip;
float legAngle = uLegSwing * side;
legPoint = petRotateX(legPoint, legAngle);
legPoint = petRotateZ(legPoint, legAngle * 0.09);
transformed = mix(transformed, legPoint + hip, legMask);

float headMask = smoothstep(0.40, 0.65, position.y);
vec3 neck = vec3(0.0, 0.40, 0.0);
vec3 headPoint = transformed - neck;
headPoint = petRotateX(headPoint, uHeadPitch);
headPoint = petRotateZ(headPoint, uHeadTilt);
transformed = mix(transformed, headPoint + neck, headMask);

// 模型尾巴位于后侧中央下方；仅对最靠后的细长区域做柔和横向摆动。
float tailDepth = smoothstep(0.24, 0.38, -position.z);
float tailCenter = 1.0 - smoothstep(0.12, 0.27, abs(position.x));
float tailBottom = smoothstep(-0.76, -0.53, position.y);
float tailTop = 1.0 - smoothstep(-0.02, 0.18, position.y);
float tailMask = tailDepth * tailCenter * tailBottom * tailTop;
transformed.x += uTailWag * tailMask * (0.16 + (-position.y) * 0.12);`
      );
  };
  material.customProgramCacheKey = () => 'niulai-soft-rig-v2';
  material.needsUpdate = true;
}

let bull = createProceduralBull();
let bullModelSource = 'procedural';
let headRef = bull.userData.head;
let frontLegRefs = bull.userData.frontLegs;
let backLegRefs = bull.userData.backLegs;
let materialTargets = [...bull.userData.materials];
petRoot.add(bull);

async function loadGltf(relativePath) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(assetUrl(relativePath), resolve, undefined, reject);
  });
}

async function loadAnimationContract(relativePath = 'models/bull-rigged.contract.json') {
  try {
    const response = await fetch(assetUrl(relativePath));
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function installLoadedBull(gltf, { skeletal, contract, source }) {
  const next = gltf.scene;
  normalizeModel(next);
  petRoot.remove(bull);
  disposeObject(bull);

  bull = next;
  bullModelSource = source || (skeletal ? 'rigged-unknown' : 'legacy-static');
  headRef = findNode(next, ['head', 'neck']);
  frontLegRefs = [];
  backLegRefs = [];
  materialTargets = [];
  collectMaterials(next, materialTargets);
  softRigEnabled = !skeletal;
  if (!skeletal) materialTargets.forEach(installSoftRig);
  petRoot.add(next);
  applyBullFurTexture(next);

  if (skeletal) {
    const result = skeletalAnimationController.bind(next, gltf.animations || [], contract);
    window.desktopPet?.report?.(
      result.missingActions.length ? 'warn' : 'info',
      result.missingActions.length
        ? `新版骨骼牛已加载，仍缺少动作：${result.missingActions.join(', ')}`
        : '新版骨骼牛及完整动作集已加载'
    );
    applyLifecycleAnimation();
  } else {
    skeletalAnimationController.dispose();
  }
}

async function tryUpgradeToGltf() {
  const contract = await loadAnimationContract();
  try {
    const rigged = await loadGltf('models/bull-rigged.glb');
    const inspection = inspectRig(rigged.scene, rigged.animations || []);
    if (!inspection.skeletal) {
      throw new Error('bull-rigged.glb 不包含 SkinnedMesh 与骨骼');
    }
    installLoadedBull(rigged, { skeletal: true, contract, source: 'bull-rigged.glb' });
    return;
  } catch (riggedError) {
    window.desktopPet?.report?.(
      'warn',
      `连续网格骨骼牛未就绪，尝试第三版回退牛：${riggedError.message}`
    );
  }

  try {
    const primitiveFallback = await loadGltf('models/bull-rigged-primitive-v3.glb');
    const fallbackInspection = inspectRig(primitiveFallback.scene, primitiveFallback.animations || []);
    if (!fallbackInspection.skeletal) {
      throw new Error('bull-rigged-primitive-v3.glb 不包含 SkinnedMesh 与骨骼');
    }
    installLoadedBull(primitiveFallback, {
      skeletal: true,
      contract,
      source: 'bull-rigged-primitive-v3.glb'
    });
    window.desktopPet?.report?.('warn', '已安全回退至第三版骨骼牛');
    return;
  } catch (primitiveFallbackError) {
    window.desktopPet?.report?.(
      'warn',
      `第三版回退牛也不可用，尝试第二版骨骼牛：${primitiveFallbackError.message}`
    );
  }

  try {
    const previousContract = await loadAnimationContract('models/bull-rigged-v2.contract.json');
    const previousRigged = await loadGltf('models/bull-rigged-v2.glb');
    const previousInspection = inspectRig(previousRigged.scene, previousRigged.animations || []);
    if (!previousInspection.skeletal) {
      throw new Error('bull-rigged-v2.glb 不包含 SkinnedMesh 与骨骼');
    }
    installLoadedBull(previousRigged, {
      skeletal: true,
      contract: previousContract,
      source: 'bull-rigged-v2.glb'
    });
    window.desktopPet?.report?.('warn', '已安全回退至第二版骨骼牛');
    return;
  } catch (previousError) {
    window.desktopPet?.report?.(
      'warn',
      `上一版骨骼牛也不可用，尝试旧静态3D模型：${previousError.message}`
    );
  }

  try {
    const legacy = await loadGltf('models/bull.glb');
    if (!legacy.scene || legacy.scene.children.length === 0) {
      throw new Error('bull.glb 场景为空');
    }
    installLoadedBull(legacy, { skeletal: false, contract: null, source: 'bull.glb' });
  } catch (legacyError) {
    console.warn('[model] bull.glb 不可用，继续使用程序化 Low-Poly 牛:', legacyError.message);
    window.desktopPet?.report?.(
      'warn',
      `旧3D模型加载失败，使用程序牛回退：${legacyError.message}`
    );
  }
}

tryUpgradeToGltf();

function makeStateEffectTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);

  const rising = kind === STATE.BULLISH;
  const glow = ctx.createRadialGradient(128, 126, 12, 128, 126, 108);
  glow.addColorStop(0, rising ? 'rgba(255,72,25,0.5)' : 'rgba(32,190,104,0.42)');
  glow.addColorStop(0.55, rising ? 'rgba(255,142,30,0.16)' : 'rgba(52,143,101,0.13)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 256);

  ctx.save();
  ctx.translate(128, 128);
  ctx.shadowBlur = 18;
  ctx.shadowColor = rising ? '#ff3b19' : '#1cb66d';
  ctx.fillStyle = rising ? '#ff4426' : '#20b76b';
  ctx.strokeStyle = rising ? '#ffd34e' : '#b8ffd9';
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (rising) {
    ctx.moveTo(0, -86);
    ctx.lineTo(54, -26);
    ctx.lineTo(22, -26);
    ctx.lineTo(22, 62);
    ctx.lineTo(-22, 62);
    ctx.lineTo(-22, -26);
    ctx.lineTo(-54, -26);
  } else {
    ctx.moveTo(0, 86);
    ctx.lineTo(54, 26);
    ctx.lineTo(22, 26);
    ctx.lineTo(22, -62);
    ctx.lineTo(-22, -62);
    ctx.lineTo(-22, 26);
    ctx.lineTo(-54, 26);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i += 1) {
    const angle = (Math.PI * 2 * i) / 7 - Math.PI / 2;
    const inner = 84;
    const outer = 105 + (i % 2) * 10;
    ctx.strokeStyle = rising
      ? `rgba(255, ${150 + i * 8}, 56, 0.78)`
      : `rgba(118, 220, 170, ${0.46 + i * 0.04})`;
    ctx.lineWidth = rising ? 5 : 4;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(angle) * inner, 128 + Math.sin(angle) * inner);
    ctx.lineTo(128 + Math.cos(angle) * outer, 128 + Math.sin(angle) * outer);
    ctx.stroke();
  }

  if (!rising) {
    ctx.fillStyle = 'rgba(158, 177, 171, 0.78)';
    for (const [x, y] of [[76, 202], [124, 216], [174, 198]]) {
      ctx.beginPath();
      ctx.moveTo(x, y - 13);
      ctx.quadraticCurveTo(x + 13, y + 5, x, y + 17);
      ctx.quadraticCurveTo(x - 13, y + 5, x, y - 13);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createHeadEffect(kind) {
  const material = new THREE.SpriteMaterial({
    map: makeStateEffectTexture(kind),
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: kind === STATE.BULLISH ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(0, 2.57, 0.58);
  sprite.scale.set(0.82, 0.82, 1);
  sprite.visible = false;
  sprite.renderOrder = 20;
  scene.add(sprite);
  return sprite;
}

const bullishHeadEffect = createHeadEffect(STATE.BULLISH);
const bearishHeadEffect = createHeadEffect(STATE.BEARISH);

function createVolumetricHeadEffect(kind) {
  const rising = kind === STATE.BULLISH;
  const group = new THREE.Group();
  group.visible = false;
  group.userData.opacity = 0;

  const colors = rising
    ? [0xff3f19, 0xffa21f, 0xffd34e]
    : [0x16a765, 0x5fd49a, 0xa6b9b1];
  const materials = colors.map(
    (color) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: rising ? THREE.AdditiveBlending : THREE.NormalBlending
      })
  );

  for (let i = 0; i < 3; i += 1) {
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.025 + i * 0.005,
        0.025 + i * 0.005,
        0.24,
        10
      ),
      materials[i]
    );
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.085, 0.15, 12),
      materials[i]
    );
    tip.position.y = rising ? 0.18 : -0.18;
    if (!rising) tip.rotation.z = Math.PI;
    arrow.add(shaft, tip);
    arrow.position.set((i - 1) * 0.20, (i % 2) * 0.08, -i * 0.035);
    arrow.rotation.z = (i - 1) * (rising ? 0.16 : -0.12);
    group.add(arrow);
  }

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: rising ? 0xff7b24 : 0x43c982,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: rising ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.018, 8, 40),
    ringMaterial
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  group.userData.materials = [...materials, ringMaterial];
  group.userData.ring = ring;
  scene.add(group);
  return group;
}

const bullish3dEffect = createVolumetricHeadEffect(STATE.BULLISH);
const bearish3dEffect = createVolumetricHeadEffect(STATE.BEARISH);
const headWorldPosition = new THREE.Vector3();
const headLocalPosition = new THREE.Vector3(0, 2.08, 0.38);

const raycaster = new THREE.Raycaster();
const rayPointer = new THREE.Vector2();
const particleTextures = new Map();
const interactiveParticles = [];
const interactionState = {
  happyUntil: 0,
  rageUntil: 0,
  incenseUntil: 0,
  bullFeedUntil: 0,
  bearFeedUntil: 0,
  smokeTimer: 0,
  incenseSmokeTimer: 0,
  gasTimer: 0,
  coinRainTimer: 0
};

const comicMainMaterial = new THREE.SpriteMaterial({
  transparent: true,
  depthTest: false,
  depthWrite: false
});
const comicMainSprite = new THREE.Sprite(comicMainMaterial);
comicMainSprite.visible = false;
comicMainSprite.renderOrder = 80;
scene.add(comicMainSprite);
const comicPrimaryGroup = new THREE.Group();
comicPrimaryGroup.visible = false;
comicPrimaryGroup.renderOrder = 65;
scene.add(comicPrimaryGroup);
const comicTransientMeshes = [];
let comicMainState = null;
let comicPrimaryState = null;
let windowFeedbackState = null;

function createComicTextTexture(text, theme) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const rise = theme === 'rise';
  ctx.save();
  ctx.translate(256, 144);
  ctx.beginPath();
  const points = 22;
  for (let index = 0; index < points; index += 1) {
    const angle = (Math.PI * 2 * index) / points - Math.PI / 2;
    const radius = index % 2 === 0 ? 132 : 92;
    const x = Math.cos(angle) * radius * 1.55;
    const y = Math.sin(angle) * radius * 0.82;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const gradient = ctx.createLinearGradient(-170, -70, 170, 80);
  if (rise) {
    gradient.addColorStop(0, '#ff3929');
    gradient.addColorStop(0.52, '#ff7a20');
    gradient.addColorStop(1, '#ffd83d');
  } else {
    gradient.addColorStop(0, '#113e2d');
    gradient.addColorStop(0.55, '#20a761');
    gradient.addColorStop(1, '#79e59a');
  }
  ctx.fillStyle = gradient;
  ctx.shadowColor = rise ? 'rgba(255,190,45,.85)' : 'rgba(26,255,133,.55)';
  ctx.shadowBlur = 22;
  ctx.fill();
  ctx.lineWidth = 11;
  ctx.strokeStyle = rise ? '#fff1a4' : '#d8ffe3';
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#271407';
  ctx.lineWidth = 13;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = text.length > 5 ? 72 : 96;
  ctx.font = `900 ${fontSize}px "Microsoft YaHei", sans-serif`;
  ctx.strokeText(text, 0, 5);
  ctx.fillText(text, 0, 5);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function clearComicGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  }
}

function showComicMain(event) {
  if (event.type === 'clear') {
    if (!comicMainState || event.token === comicMainState.token) {
      comicMainSprite.visible = false;
      comicMainMaterial.map?.dispose?.();
      comicMainMaterial.map = null;
      comicMainState = null;
    }
    return;
  }
  comicMainMaterial.map?.dispose?.();
  comicMainMaterial.map = createComicTextTexture(event.text, event.theme);
  comicMainMaterial.needsUpdate = true;
  comicMainMaterial.opacity = 0;
  comicMainSprite.visible = true;
  comicMainState = {
    token: event.token,
    age: 0,
    duration: Math.max(0.35, Number(event.durationMs || 820) / 1000),
    theme: event.theme
  };
}

function showComicPrimary(event) {
  if (event.type === 'clear') {
    if (!comicPrimaryState || event.token === comicPrimaryState.token) {
      clearComicGroup(comicPrimaryGroup);
      comicPrimaryGroup.visible = false;
      comicPrimaryState = null;
    }
    return;
  }
  clearComicGroup(comicPrimaryGroup);
  const rising = event.type.includes('up') || event.type.includes('gold');
  const count = effectsManager.particleBudget(event.type.includes('limit') ? 18 : 11);
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / Math.max(1, count) + Math.random() * 0.18;
    if (rising) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeParticleTexture(index % 3 === 0 ? 'coin' : 'spark'),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      sprite.position.set(Math.cos(angle) * 0.18, Math.sin(angle) * 0.12, 0);
      sprite.scale.setScalar(0.08 + Math.random() * 0.06);
      sprite.userData.velocity = new THREE.Vector3(
        Math.cos(angle) * (0.34 + Math.random() * 0.36),
        0.18 + Math.abs(Math.sin(angle)) * 0.42 + Math.random() * 0.18,
        0
      );
      comicPrimaryGroup.add(sprite);
    } else {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(0.025 + Math.random() * 0.025, 0.34 + Math.random() * 0.28),
        new THREE.MeshBasicMaterial({
          color: index % 2 ? 0x54e687 : 0x1da764,
          transparent: true,
          opacity: 0.82,
          depthTest: false,
          depthWrite: false
        })
      );
      const lineSide = index % 2 === 0 ? -1 : 1;
      line.position.set(lineSide * (0.38 + Math.random() * 0.30), 0.42 + Math.random() * 0.55, 0);
      line.rotation.z = -0.14 + Math.random() * 0.28;
      line.userData.velocity = new THREE.Vector3(0, -0.85 - Math.random() * 0.65, 0);
      line.userData.fallPhase = Math.random() * 1.55;
      line.userData.fallSpeed = 0.75 + Math.random() * 0.55;
      comicPrimaryGroup.add(line);
    }
  }
  comicPrimaryGroup.visible = true;
  comicPrimaryState = {
    token: event.token,
    type: event.type,
    age: 0,
    duration: Math.max(0.5, Number(event.durationMs || 1100) / 1000),
    rising
  };
}

function spawnUpwardImpactRing() {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffc928,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.028, 8, 48), material);
  ring.position.copy(headWorldPosition).add(new THREE.Vector3(0, -0.18, 0.70));
  ring.renderOrder = 70;
  scene.add(ring);
  comicTransientMeshes.push({ object: ring, age: 0, life: 0.62, velocityY: 0.46 });
}

function spawnFallStars() {
  const count = effectsManager.particleBudget(8);
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / Math.max(1, count);
    spawnInteractiveParticle(
      'star',
      headWorldPosition.clone().add(new THREE.Vector3(Math.cos(angle) * 0.28, Math.sin(angle) * 0.20, 0.55)),
      new THREE.Vector3(Math.cos(angle) * 0.15, 0.16 + Math.random() * 0.16, 0),
      { size: 0.10, life: 1.05, gravity: -0.08, grow: 0.1 }
    );
  }
}

function spawnComicCoins(event) {
  const count = Math.min(event.count || 0, effectsManager.particleBudget(18));
  for (let index = 0; index < count; index += 1) {
    spawnInteractiveParticle(
      'coin',
      headWorldPosition.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.40, 0.15, 0.55)),
      new THREE.Vector3((Math.random() - 0.5) * 0.55, 0.28 + Math.random() * 0.40, 0),
      { size: 0.09 + Math.random() * 0.05, life: 1.3, gravity: -0.48, grow: 0.08 }
    );
  }
}

function spawnBearCameo(event) {
  const kind = event.variant === 'spirit' ? 'spirit' : 'ramen';
  spawnInteractiveParticle(
    kind,
    headWorldPosition.clone().add(new THREE.Vector3(0.42, 0.22, 0.65)),
    new THREE.Vector3(0.04, 0.26, 0),
    { size: kind === 'spirit' ? 0.26 : 0.22, life: 1.65, gravity: -0.04, grow: 0.36 }
  );
}

effectsManager.onLayer(COMIC_LAYER.MAIN_TEXT, showComicMain);
effectsManager.onLayer(COMIC_LAYER.PRIMARY_PARTICLES, showComicPrimary);
effectsManager.onLayer(COMIC_LAYER.COMPANION_PARTICLES, (event) => {
  if (event.type === 'coins') spawnComicCoins(event);
  else if (event.type === 'bear-cameo') spawnBearCameo(event);
});
effectsManager.onLayer(COMIC_LAYER.WINDOW_FEEDBACK, (event) => {
  windowFeedbackState = { age: 0, duration: 0.30, strength: Number(event.strength) || 0.5, direction: event.type === 'impact-down' ? 1 : -1 };
});

function makeParticleTexture(kind) {
  if (particleTextures.has(kind)) return particleTextures.get(kind);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);

  if (['smoke', 'dust', 'red-smoke', 'gas', 'spark'].includes(kind)) {
    const colors = {
      smoke: ['rgba(255,255,255,0.90)', 'rgba(210,220,225,0)'],
      dust: ['rgba(174,119,59,0.82)', 'rgba(100,62,26,0)'],
      'red-smoke': ['rgba(255,74,56,0.88)', 'rgba(255,34,20,0)'],
      gas: ['rgba(70,220,120,0.78)', 'rgba(20,120,68,0)'],
      spark: ['rgba(255,232,112,1)', 'rgba(255,152,28,0)']
    };
    const gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 58);
    gradient.addColorStop(0, colors[kind][0]);
    gradient.addColorStop(1, colors[kind][1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  } else {
    const glyphs = {
      heart: ['♥', '#ffd34f'],
      coin: ['￥', '#ffcf35'],
      ramen: ['🍜', '#ffffff'],
      star: ['★', '#ffe45b'],
      spirit: ['👻', '#dffff0']
    };
    const [glyph, color] = glyphs[kind] || ['●', '#ffffff'];
    if (kind === 'coin') {
      ctx.beginPath();
      ctx.arc(64, 64, 46, 0, Math.PI * 2);
      ctx.fillStyle = '#d99812';
      ctx.fill();
      ctx.strokeStyle = '#fff09a';
      ctx.lineWidth = 7;
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = ['ramen', 'spirit'].includes(kind)
      ? '76px "Segoe UI Emoji"'
      : 'bold 68px sans-serif';
    ctx.fillText(glyph, 64, 68);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  particleTextures.set(kind, texture);
  return texture;
}

function spawnInteractiveParticle(kind, position, velocity, options = {}) {
  const maximumParticles = petSettings.powerSave || quietOfficeActive ? 64 : 150;
  if (interactiveParticles.length >= maximumParticles) return;
  const material = new THREE.SpriteMaterial({
    map: makeParticleTexture(kind),
    transparent: true,
    opacity: options.opacity ?? 0.95,
    depthTest: false,
    depthWrite: false,
    blending:
      kind === 'spark' || kind === 'heart'
        ? THREE.AdditiveBlending
        : THREE.NormalBlending
  });
  const sprite = new THREE.Sprite(material);
  const size = options.size ?? 0.16;
  sprite.position.copy(position);
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = 30;
  scene.add(sprite);
  interactiveParticles.push({
    sprite,
    velocity: velocity.clone(),
    age: 0,
    life: options.life ?? 1.8,
    gravity: options.gravity ?? 0,
    grow: options.grow ?? 0.35,
    spin: options.spin ?? (Math.random() - 0.5) * 3,
    baseSize: size,
    baseOpacity: options.opacity ?? 0.95
  });
}

function updateInteractiveParticles(dt) {
  for (let i = interactiveParticles.length - 1; i >= 0; i -= 1) {
    const particle = interactiveParticles[i];
    particle.age += dt;
    const progress = Math.min(1, particle.age / particle.life);
    particle.velocity.y += particle.gravity * dt;
    particle.sprite.position.addScaledVector(particle.velocity, dt);
    particle.sprite.material.rotation += particle.spin * dt;
    const scale = particle.baseSize * (1 + progress * particle.grow);
    particle.sprite.scale.set(scale, scale, 1);
    particle.sprite.material.opacity =
      particle.baseOpacity * (1 - progress) * (1 - progress);
    if (progress >= 1) {
      scene.remove(particle.sprite);
      particle.sprite.material.dispose();
      interactiveParticles.splice(i, 1);
    }
  }
}

function createIncenseGroup() {
  const group = new THREE.Group();
  const stickMaterial = new THREE.MeshBasicMaterial({ color: 0xc52c24 });
  const emberMaterial = new THREE.MeshBasicMaterial({ color: 0xffcf55 });
  for (let i = -1; i <= 1; i += 1) {
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.50, 8),
      stickMaterial
    );
    stick.position.set(i * 0.13, 0.25, 0);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), emberMaterial);
    ember.position.set(i * 0.13, 0.51, 0);
    group.add(stick, ember);
  }
  const holder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.22, 0.10, 24),
    new THREE.MeshStandardMaterial({ color: 0x5b1e20, roughness: 0.72 })
  );
  holder.position.y = -0.03;
  group.add(holder);
  group.position.set(0, 0.08, 0.92);
  group.visible = false;
  scene.add(group);
  return group;
}

const incenseGroup = createIncenseGroup();
const extremeHalo = new THREE.Group();
for (let i = 0; i < 3; i += 1) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.48 + i * 0.15, 0.018, 8, 48),
    new THREE.MeshBasicMaterial({
      color: i === 0 ? 0xffd34a : 0xff9d24,
      transparent: true,
      opacity: 0.66 - i * 0.12,
      depthTest: false,
      blending: THREE.AdditiveBlending
    })
  );
  ring.rotation.z = i * 0.72;
  extremeHalo.add(ring);
}
extremeHalo.visible = false;
scene.add(extremeHalo);

const extremeBearIcon = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeParticleTexture('ramen'),
    transparent: true,
    depthTest: false,
    depthWrite: false
  })
);
extremeBearIcon.scale.set(0.52, 0.52, 1);
extremeBearIcon.visible = false;
extremeBearIcon.renderOrder = 31;
scene.add(extremeBearIcon);

const bearHeadband = new THREE.Mesh(
  new THREE.TorusGeometry(0.31, 0.026, 8, 36),
  new THREE.MeshBasicMaterial({
    color: 0x23cc72,
    transparent: true,
    opacity: 0.84,
    depthTest: false
  })
);
bearHeadband.visible = false;
bearHeadband.renderOrder = 29;
scene.add(bearHeadband);

let previousState = STATE.CLOSED;
let targetState = STATE.CLOSED;
let transition = 1;
let quote = marketStore.quote;
let prevQuote = marketStore.previousQuote;
let quoteConnection = marketStore.connection;
let marketOpen = false;
let demoState = null;
let elapsed = 0;
let stateStartedAt = 0;
let zzzTimer = 0;
const zzzParticles = [];
const zzzTexture = makeZzzTexture();
let speechToken = 0;
let hoverWasOnBull = false;
let hoverSpeechCooldown = 0;
const clickTimes = [];
const indexCycle = ['s_sh000001', 's_sz399001', 's_sz399006'];

function pickBullAt(clientX, clientY) {
  if (activeDisplayMode === '2d') {
    const rect = spriteModeEl.getBoundingClientRect();
    return (
      clientX >= rect.left + 38 &&
      clientX <= rect.right - 38 &&
      clientY >= rect.top + 28 &&
      clientY <= rect.bottom - 18
    );
  }
  rayPointer.x = (clientX / window.innerWidth) * 2 - 1;
  rayPointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(rayPointer, camera);
  return raycaster.intersectObject(bull, true).length > 0;
}

function currentQuip() {
  if (emotionMemory.snapshot().enabled) {
    const context = targetState === STATE.CLOSED
      ? 'closed'
      : targetState === STATE.BEARISH
        ? 'down'
        : targetState === STATE.BULLISH
          ? 'up'
          : 'flat';
    const quips = emotionMemory.quips(context);
    return quips[Math.floor(Math.random() * quips.length)];
  }
  if (targetState === STATE.CLOSED) {
    return '收工！下周一定满仓牛来！';
  }
  if (targetState === STATE.DISCONNECTED) {
    return '行情走丢了，本牛正在重新连线。';
  }
  if (quote?.changePct >= 3) {
    return '这就去挑劳斯莱斯车漆颜色！';
  }
  if (quote?.changePct < 0) {
    return '老乡别走，只是技术性回调！';
  }
  return '横盘如织，不如摸鱼。';
}

function showSpeech(text, duration = 3000) {
  const token = ++speechToken;
  speechBubbleEl.textContent = text;
  speechBubbleEl.classList.add('show');
  setTimeout(() => {
    if (token === speechToken) speechBubbleEl.classList.remove('show');
  }, duration);
}

function scheduleFirstRunHint() {
  const key = 'niulai:onboarding-v1';
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, 'shown');
  } catch {}
  setTimeout(() => {
    showSpeech('拖动我换位置 · 牛身滚轮切指数 · 齿轮可切 2D/3D', 5200);
  }, 6000);
}

function animate2DReaction(className, duration) {
  if (activeDisplayMode !== '2d') return;
  spriteModeEl.classList.remove('happy', 'rage');
  void spriteModeEl.offsetWidth;
  spriteModeEl.classList.add(className);
  setTimeout(() => spriteModeEl.classList.remove(className), duration);
}

function spawnNostrilSmoke() {
  bull?.updateMatrixWorld?.(true);
  const headBone = bull?.getObjectByName?.('head');
  for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
    const side = sideIndex === 0 ? -1 : 1;
    const exactOrigin = headBone?.localToWorld?.(
      new THREE.Vector3(side * 0.102, -0.024, 0.718)
    );
    const fallbackOrigin = headWorldPosition.clone().add(new THREE.Vector3(side * 0.07, -0.50, 0.40));
    const baseOrigin = exactOrigin || fallbackOrigin;
    const count = effectsManager.particleBudget(8);
    for (let i = 0; i < count; i += 1) {
      const origin = baseOrigin.clone().add(new THREE.Vector3(0, Math.random() * 0.03, 0.025));
      const velocity = new THREE.Vector3(
        side * (0.22 + Math.random() * 0.34),
        0.09 + Math.random() * 0.25,
        (Math.random() - 0.5) * 0.12
      );
      spawnInteractiveParticle('smoke', origin, velocity, {
        size: 0.13 + Math.random() * 0.08,
        life: 1.0 + Math.random() * 0.7,
        grow: 1.2,
        opacity: 0.78
      });
    }
  }
}

function spawnActionDust(side = 'both', count = 4, kind = 'dust') {
  const names = side === 'both'
    ? ['hoof_l', 'hoof_r']
    : [side === 'left' ? 'hoof_l' : 'hoof_r'];
  for (const name of names) {
    const hoof = bull?.getObjectByName?.(name);
    const origin = hoof
      ? hoof.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(side === 'left' ? -0.22 : 0.22, 0.08, 0.20);
    origin.y = Math.max(0.03, origin.y - 0.10);
    for (let index = 0; index < effectsManager.particleBudget(count); index += 1) {
      spawnInteractiveParticle(
        kind,
        origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.12, 0, 0)),
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.30,
          0.08 + Math.random() * 0.18,
          (Math.random() - 0.5) * 0.18
        ),
        { size: 0.07 + Math.random() * 0.06, life: 0.45 + Math.random() * 0.35, grow: 0.8, opacity: 0.55 }
      );
    }
  }
}

effectsManager.onLayer(COMIC_LAYER.ACTION_SYNC, (event) => {
  if (event.type === 'landing-dust') {
    const side = event.marker === 'footstep_left'
      ? 'left'
      : event.marker === 'footstep_right' ? 'right' : 'both';
    spawnActionDust(side, event.marker === 'footstep_both' ? 4 : 2);
  } else if (event.type === 'paw-dust') {
    spawnActionDust('right', 5);
  } else if (event.type === 'nostril-smoke') {
    spawnNostrilSmoke();
  } else if (event.type === 'brake-dust') {
    spawnActionDust('both', 7);
  } else if (event.type === 'upward-impact-ring') {
    spawnUpwardImpactRing(event);
  } else if (event.type === 'fall-stars') {
    spawnFallStars(event);
  }
});

function spawnFeedReward() {
  petRoot.updateMatrixWorld(true);
  headWorldPosition.copy(headLocalPosition).applyMatrix4(petRoot.matrixWorld);
  for (let i = 0; i < 24; i += 1) {
    const kind = i % 3 === 0 ? 'heart' : 'coin';
    const angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.25;
    spawnInteractiveParticle(
      kind,
      headWorldPosition.clone().add(new THREE.Vector3(0, -0.15, 0.30)),
      new THREE.Vector3(
        Math.cos(angle) * (0.32 + Math.random() * 0.55),
        0.25 + Math.sin(angle) * 0.35 + Math.random() * 0.45,
        (Math.random() - 0.5) * 0.25
      ),
      {
        size: 0.12 + Math.random() * 0.12,
        life: 1.7 + Math.random() * 0.8,
        gravity: -0.20,
        grow: 0.18
      }
    );
  }
}

function spawnDisgustGas(count = 8) {
  petRoot.updateMatrixWorld(true);
  headWorldPosition.copy(headLocalPosition).applyMatrix4(petRoot.matrixWorld);
  for (let i = 0; i < count; i += 1) {
    spawnInteractiveParticle(
      'gas',
      headWorldPosition
        .clone()
        .add(new THREE.Vector3(0.10, -0.25, 0.34)),
      new THREE.Vector3(
        0.18 + Math.random() * 0.30,
        0.05 + Math.random() * 0.24,
        (Math.random() - 0.5) * 0.15
      ),
      {
        size: 0.17 + Math.random() * 0.13,
        life: 1.5 + Math.random(),
        grow: 1.25,
        opacity: 0.68
      }
    );
  }
}

function triggerHappy() {
  interactionState.happyUntil = elapsed + 2.2;
  scheduleBullAnimation('click_react', { priority: 30, cooldown: 320 });
  animate2DReaction('happy', 1280);
  showSpeech('摸到牛气了！');
}

function triggerRage() {
  interactionState.rageUntil = elapsed + 3.2;
  const accepted = scheduleBullAnimation('ground_paw', {
    priority: 52,
    cooldown: 1800,
    fade: 0.10
  });
  if (accepted) {
    scheduleBullAnimation('charge', { priority: 52, queue: true, fade: 0.07 });
    scheduleBullAnimation('brake', { priority: 52, queue: true, fade: 0.08 });
  }
  interactionState.happyUntil = 0;
  animate2DReaction('rage', 1380);
  showSpeech('别点了，本牛要冲锋了！');
}

let incense2DToken = 0;

function triggerIncense() {
  if (petSettings.effects <= 0.01) {
    showSpeech('特效已关闭，可在齿轮设置中开启');
    return;
  }
  interactionState.incenseUntil = elapsed + 15;
  scheduleBullAnimation('idle_look', {
    priority: 60,
    cooldown: 15000,
    loop: true,
    duration: 15000,
    fade: 0.30
  });
  interactionState.incenseSmokeTimer = 0;
  const token = ++incense2DToken;
  incense2DEl.classList.remove('active');
  void incense2DEl.offsetWidth;
  incense2DEl.classList.add('active');
  setTimeout(() => {
    if (token === incense2DToken) incense2DEl.classList.remove('active');
  }, 15000);
  showSpeech('三炷赛博香，愿账户长红！');
}

function triggerBullFeed() {
  interactionState.bullFeedUntil = elapsed + 3.2;
  scheduleBullAnimation('happy', { priority: 42, cooldown: 900 });
  interactionState.bearFeedUntil = 0;
  animate2DReaction('happy', 1280);
  showSpeech('这根阳线，有嚼劲！');
  setTimeout(spawnFeedReward, 650);
}

function triggerBearFeed() {
  interactionState.bearFeedUntil = elapsed + 3.2;
  scheduleBullAnimation('sad', { priority: 42, cooldown: 900 });
  interactionState.bullFeedUntil = 0;
  animate2DReaction('rage', 1380);
  interactionState.gasTimer = 0;
  spawnDisgustGas(12);
  showSpeech('呕！谁把阴线喂给我了？');
}

async function switchIndexByWheel(direction) {
  const currentIndex = indexCycle.indexOf(selectedSymbol);
  const baseIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex =
    (baseIndex + (direction > 0 ? 1 : -1) + indexCycle.length) %
    indexCycle.length;
  const result = await window.desktopPet?.selectSymbol(indexCycle[nextIndex]);
  if (!result?.ok) return;
  selectedSymbol = result.code;
  try {
    localStorage.setItem('niulai:selected-symbol', selectedSymbol);
  } catch {}
  marketStore.setSymbol(selectedSymbol);
  marketEventEngine.setSymbol(selectedSymbol);
  quote = marketStore.quote;
  prevQuote = marketStore.previousQuote;
  renderQuoteCard(null);
  renderPositionPnl(null);
  updateStatus();
  const names = ['上证指数', '深证成指', '创业板指'];
  showSpeech(`切换：${names[nextIndex]}`);
}

let roamingDragPointer = null;
let roamingSingleClickTimer = null;

interactionLayerEl.addEventListener('pointerdown', (event) => {
  if (!IS_ROAMING_OVERLAY || event.button !== 0 || roamingDragPointer !== null) return;
  if (!pickBullAt(event.clientX, event.clientY)) return;
  event.preventDefault();
  roamingDragPointer = event.pointerId;
  interactionLayerEl.setPointerCapture(event.pointerId);
  desktopRoamingController.beginDrag();
});

function finishRoamingDrag(event) {
  if (roamingDragPointer === null) return;
  if (event?.pointerId !== undefined && event.pointerId !== roamingDragPointer) return;
  const pointerId = roamingDragPointer;
  roamingDragPointer = null;
  if (interactionLayerEl.hasPointerCapture(pointerId)) {
    interactionLayerEl.releasePointerCapture(pointerId);
  }
  desktopRoamingController.endDrag();
}

interactionLayerEl.addEventListener('pointercancel', finishRoamingDrag);
interactionLayerEl.addEventListener('lostpointercapture', finishRoamingDrag);

function handleBullClick() {
  playVoiceForCurrentMarket();
  const now = performance.now();
  clickTimes.push(now);
  while (clickTimes.length && now - clickTimes[0] > 1150) clickTimes.shift();
  if (clickTimes.length >= 3) {
    clickTimes.length = 0;
    triggerRage();
  } else {
    triggerHappy();
  }
}

interactionLayerEl.addEventListener('pointerup', (event) => {
  finishRoamingDrag(event);
  if (!pickBullAt(event.clientX, event.clientY)) return;
  if (!IS_ROAMING_OVERLAY) {
    handleBullClick();
    return;
  }
  clearTimeout(roamingSingleClickTimer);
  roamingSingleClickTimer = setTimeout(handleBullClick, 260);
});

interactionLayerEl.addEventListener('dblclick', async (event) => {
  if (!pickBullAt(event.clientX, event.clientY)) return;
  event.preventDefault();
  event.stopPropagation();
  clearTimeout(roamingSingleClickTimer);
  roamingSingleClickTimer = null;
  if (IS_ROAMING_OVERLAY) {
    actionScheduler.cancelAll();
    const result = await homeWindowController.recallRoaming();
    showSpeech(result?.message || (result?.ok ? '牛来正在回家' : '巡游牛尚未开启'));
    return;
  }
  if (
    activeDisplayMode === '3d' &&
    [HOME_PHASE.HOME_SLEEPING, HOME_PHASE.HOME_SLEEP_ENTER].includes(petLifecycle.phase)
  ) {
    const result = await homeWindowController.wakeRoaming();
    showSpeech(result?.message || (result?.ok ? '牛来醒啦' : '暂时叫不醒牛来'));
  }
});

interactionLayerEl.addEventListener('pointermove', (event) => {
  const overBull = pickBullAt(event.clientX, event.clientY);
  interactionLayerEl.style.cursor = overBull ? 'pointer' : 'default';
  if (overBull && !hoverWasOnBull && performance.now() > hoverSpeechCooldown) {
    hoverSpeechCooldown = performance.now() + 6000;
    showSpeech(currentQuip());
  }
  hoverWasOnBull = overBull;
});

interactionLayerEl.addEventListener('pointerleave', () => {
  hoverWasOnBull = false;
});

interactionLayerEl.addEventListener(
  'wheel',
  (event) => {
    if (!pickBullAt(event.clientX, event.clientY)) return;
    event.preventDefault();
    switchIndexByWheel(event.deltaY >= 0 ? 1 : -1);
  },
  { passive: false }
);

incenseButtonEl.addEventListener('click', () => {
  triggerIncense();
  if (!IS_ROAMING_OVERLAY) desktopRoamingController.sendAction('incense');
});
bullFeedButtonEl.addEventListener('click', () => {
  triggerBullFeed();
  if (!IS_ROAMING_OVERLAY) desktopRoamingController.sendAction('bull-feed');
});
bearFeedButtonEl.addEventListener('click', () => {
  triggerBearFeed();
  if (!IS_ROAMING_OVERLAY) desktopRoamingController.sendAction('bear-feed');
});
let quoteActionRestoreTimer = null;
function setQuoteHiddenForAction(hidden) {
  if (quoteActionRestoreTimer) clearTimeout(quoteActionRestoreTimer);
  quoteActionRestoreTimer = null;
  document.body.classList.toggle('quote-action-hidden', hidden);
  syncRoamingHitRegions();
  if (hidden) {
    quoteActionRestoreTimer = setTimeout(() => {
      quoteActionRestoreTimer = null;
      document.body.classList.remove('quote-action-hidden');
      syncRoamingHitRegions();
    }, 3600);
  }
}

window.addEventListener('niulai:animation-event', (event) => {
  if (activeDisplayMode !== '3d') return;
  const detail = event.detail || {};
  if (
    IS_ROAMING_OVERLAY &&
    forwardedAutoPerformance &&
    ['animation-start', 'animation-finished'].includes(detail.type)
  ) {
    window.desktopPet?.report?.(
      'info',
      `自动演出动作事件: ${detail.type}/${detail.action}`
    );
  }
  if (detail.type === 'animation-start' && detail.action === 'charge') {
    setQuoteHiddenForAction(true);
  } else if (detail.type === 'animation-finished' && detail.action === 'brake') {
    setQuoteHiddenForAction(false);
  }
  if (
    IS_ROAMING_OVERLAY &&
    detail.type === 'animation-finished' &&
    forwardedAutoPerformance?.finalAction === detail.action
  ) {
    const completedType = forwardedAutoPerformance.type;
    forwardedAutoPerformance = null;
    window.desktopPet?.completeAutoPerformance?.(completedType);
  }
});

window.desktopPet?.onPetAction?.((action) => {
  if (action === 'quote-card-open' && !IS_ROAMING_OVERLAY) {
    openStockDetails();
    return;
  }
  if (action === 'incense') triggerIncense();
  if (action === 'bull-feed') triggerBullFeed();
  if (action === 'bear-feed') triggerBearFeed();
});
setInterval(() => showSpeech(currentQuip()), 30000);

function applyMaterialStyle(style) {
  void style;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function blendStyle(from, to, t) {
  return {
    color: from.color.clone().lerp(to.color, t),
    emissive: from.emissive.clone().lerp(to.emissive, t),
    emissiveIntensity: lerp(
      from.emissiveIntensity,
      to.emissiveIntensity,
      t
    ),
    glowColor: from.glowColor.clone().lerp(to.glowColor, t),
    glowIntensity: lerp(from.glowIntensity, to.glowIntensity, t),
    spin: lerp(from.spin, to.spin, t),
    bob: lerp(from.bob, to.bob, t)
  };
}

function getMarketClock(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return {
    weekday: map.weekday,
    hour: Number(map.hour) % 24,
    minute: Number(map.minute)
  };
}

function isMarketOpen() {
  const market = symbolMarket(selectedSymbol);
  const timeZone = market === 'us' ? 'America/New_York' : 'Asia/Shanghai';
  const { weekday, hour, minute } = getMarketClock(timeZone);
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const minutes = hour * 60 + minute;
  if (market === 'us') return minutes >= 570 && minutes <= 960;
  if (market === 'hk') {
    return (minutes >= 570 && minutes <= 720) || (minutes >= 780 && minutes <= 960);
  }
  return (
    (minutes >= 570 && minutes <= 690) ||
    (minutes >= 780 && minutes <= 900)
  );
}

function formatPct(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function displaySymbol(symbol) {
  const value = String(symbol || 's_sh000001');
  if (value.startsWith('rt_hk')) return `HK ${value.slice(5)}`;
  if (value.startsWith('gb_')) return value.slice(3).toUpperCase();
  return value.replace(/^s_/, '');
}

function renderQuoteCard(nextQuote) {
  const reconnecting = quoteConnection === 'error';
  if (!nextQuote) {
    quoteNameEl.textContent =
      selectedSymbol === 's_sh000001'
        ? '上证指数'
        : displaySymbol(selectedSymbol);
    quoteCodeEl.textContent = displaySymbol(selectedSymbol);
    quotePriceEl.textContent = '--';
    quoteTrendEl.textContent = reconnecting ? '⟳' : '→';
    quoteChangeEl.textContent = reconnecting ? '重连中' : '连接中';
    quoteChangeEl.dataset.pct = reconnecting ? '重连中' : '连接中';
    quoteCardEl.className = reconnecting ? 'disconnected' : 'flat';
    quoteCardEl.title = reconnecting ? '行情断线，正在自动重连' : '行情连接中，点击切换我的股票';
    renderRoamingQuoteDetails(null);
    renderStockDetails(null);
    return;
  }

  selectedSymbol = nextQuote.code || selectedSymbol;
  quoteNameEl.textContent = nextQuote.name || displaySymbol(selectedSymbol);
  quoteCodeEl.textContent = displaySymbol(selectedSymbol);
  quotePriceEl.textContent = nextQuote.price.toFixed(2);
  quoteTrendEl.textContent = nextQuote.changePct > 0 ? '↗' : nextQuote.changePct < 0 ? '↘' : '→';
  quoteChangeEl.textContent = `${nextQuote.change > 0 ? '+' : ''}${
    nextQuote.change.toFixed(2)
  }  ${formatPct(nextQuote.changePct)}`;
  quoteChangeEl.dataset.pct = reconnecting ? '重连中' : formatPct(nextQuote.changePct);
  quoteCardEl.className = reconnecting
    ? 'disconnected'
    : nextQuote.changePct > 0
      ? 'rising'
      : nextQuote.changePct < 0
        ? 'falling'
        : 'flat';
  if (reconnecting) {
    quoteTrendEl.textContent = '⟳';
    quoteChangeEl.textContent = '重连中';
  }
  quoteCardEl.title = reconnecting
    ? '行情断线，保留最后价格并自动重连'
    : '点击切换我的股票';
  renderRoamingQuoteDetails(nextQuote);
  renderStockDetails(nextQuote);
}

function renderSavedStockList() {
  savedStockListEl.replaceChildren();
  const visibleStocks = savedStocks.filter((stock) =>
    petSettings.markets.includes(stock.market || symbolMarket(stock.symbol))
  );
  if (!visibleStocks.length) {
    const empty = document.createElement('div');
    empty.className = 'picker-empty';
    empty.textContent = savedStocks.length
      ? '当前展示市场没有已保存股票\n可在齿轮设置中重新勾选市场'
      : '还没有保存股票\n可在齿轮设置中搜索并保存';
    savedStockListEl.appendChild(empty);
    return;
  }
  for (const stock of visibleStocks) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `saved-stock-row${stock.symbol === selectedSymbol ? ' current' : ''}`;
    const badge = document.createElement('span');
    badge.className = 'market-badge';
    badge.textContent = marketLabel(stock.market || symbolMarket(stock.symbol));
    const main = document.createElement('span');
    main.className = 'saved-stock-main';
    const name = document.createElement('strong');
    name.textContent = stock.name || displaySymbol(stock.symbol);
    const code = document.createElement('span');
    code.textContent = displaySymbol(stock.symbol);
    main.append(name, code);
    const position = document.createElement('span');
    position.className = 'saved-stock-position';
    position.textContent = stock.cost > 0 && stock.shares > 0
      ? `${stock.shares}股\n@ ${stock.cost}`
      : '仅关注';
    row.append(badge, main, position);
    row.addEventListener('click', () => switchToRememberedStock(stock));
    savedStockListEl.appendChild(row);
  }
}

async function switchToRememberedStock(stock) {
  const result = await window.desktopPet?.selectSymbol(stock.symbol);
  if (!result?.ok) {
    showSpeech(result?.message || '切换股票失败');
    return;
  }
  selectedSymbol = result.code;
  portfolio = { symbol: stock.symbol, cost: stock.cost || 0, shares: stock.shares || 0 };
  marketStore.portfolio = portfolio;
  marketStore.setSymbol(selectedSymbol);
  marketEventEngine.setSymbol(selectedSymbol);
  quote = marketStore.quote;
  prevQuote = marketStore.previousQuote;
  try {
    localStorage.setItem('niulai:selected-symbol', selectedSymbol);
    saveJson(localStorage, 'niulai:portfolio', portfolio);
  } catch {}
  renderQuoteCard(null);
  renderPositionPnl(null);
  updateStatus();
  setStockPickerOpen(false);
  showSpeech(`已切换：${stock.name || displaySymbol(stock.symbol)}`);
}

function openStockDetails() {
  if (IS_ROAMING_OVERLAY) {
    desktopRoamingController.sendAction('quote-card-open');
    return;
  }
  setStockPickerOpen(true);
  requestAnimationFrame(() => pickerCloseEl.focus());
}

function openCurrentStockDetails() {
  setStockDetailOpen(true);
  requestAnimationFrame(() => detailCloseEl.focus());
}

quoteCardEl.addEventListener('click', openStockDetails);
quoteCardEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openStockDetails();
  }
});
quoteCardEl.addEventListener('pointerenter', syncRoamingHitRegions);
quoteCardEl.addEventListener('pointerleave', syncRoamingHitRegions);
quoteCardEl.addEventListener('focus', syncRoamingHitRegions);
quoteCardEl.addEventListener('blur', syncRoamingHitRegions);
quoteCardEl.addEventListener('transitionend', syncRoamingHitRegions);
pickerCloseEl.addEventListener('click', () => setStockPickerOpen(false));
pickerDetailEl.addEventListener('click', openCurrentStockDetails);
pickerWebEl.addEventListener('click', () => window.desktopPet?.openExternalQuote?.(selectedSymbol));
detailWebEl.addEventListener('click', () => window.desktopPet?.openExternalQuote?.(selectedSymbol));

function hasPosition() {
  marketStore.selectedSymbol = selectedSymbol;
  marketStore.portfolio = portfolio;
  return marketStore.hasPosition();
}

function calculatePosition(nextQuote) {
  marketStore.selectedSymbol = selectedSymbol;
  marketStore.portfolio = portfolio;
  return marketStore.calculatePosition(nextQuote);
}

function funProfitUnit(amount) {
  const value = Math.abs(amount);
  if (value < 2000) {
    return `🍗 +${Math.max(1, Math.floor(value / 200))}个鸡腿`;
  }
  if (value < 5000) {
    return `🧋 +${Math.max(1, Math.floor(value / 25))}杯奶茶`;
  }
  if (value < 15000) {
    return `🍲 +${Math.max(1, Math.floor(value / 300))}顿火锅`;
  }
  return `📱 可换${Math.max(1, Math.floor(value / 5000))}部手机`;
}

function funLossUnit(amount) {
  const value = Math.abs(amount);
  if (value < 500) {
    return `🧋 少喝${Math.max(1, Math.floor(value / 32))}杯奶茶`;
  }
  if (value < 3000) {
    return `🍲 少吃${Math.max(1, Math.floor(value / 260))}顿火锅`;
  }
  return `🥪 连续吃土${Math.max(1, Math.ceil(value / 100))}天`;
}

const moneyFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0
});

function currencyPrefix(symbol = selectedSymbol) {
  const market = symbolMarket(symbol);
  return market === 'us' ? '$' : market === 'hk' ? 'HK$' : '¥';
}

function signedMoney(value, symbol = selectedSymbol) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${currencyPrefix(symbol)}${moneyFormatter.format(Math.abs(value))}`;
}

function renderRoamingQuoteDetails(nextQuote) {
  const result = calculatePosition(nextQuote);
  if (!result) {
    roamingTodayPnlEl.textContent = '未设置';
    roamingTotalPnlEl.textContent = '未设置';
    roamingPositionBaseEl.textContent = '-- / --';
    roamingFunUnitEl.textContent = hasPosition() ? '等待最新行情' : '齿轮中可设置持仓';
    return;
  }
  roamingTodayPnlEl.textContent = signedMoney(result.todayPnl);
  roamingTotalPnlEl.textContent = `${signedMoney(result.totalPnl)} ${formatPct(result.totalPct)}`;
  roamingPositionBaseEl.textContent = `${currencyPrefix()}${portfolio.cost.toFixed(2)} / ${moneyFormatter.format(portfolio.shares)}股`;
  roamingFunUnitEl.textContent = result.totalPnl > 0
    ? funProfitUnit(result.totalPnl)
    : result.totalPnl < 0
      ? funLossUnit(result.totalPnl)
      : '刚好回本';
}

function formatMarketNumber(value, unit = '') {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return '--';
  if (number >= 100000000) return `${(number / 100000000).toFixed(2)}亿${unit}`;
  if (number >= 10000) return `${(number / 10000).toFixed(2)}万${unit}`;
  return `${moneyFormatter.format(number)}${unit}`;
}

function renderStockDetails(nextQuote) {
  const name = nextQuote?.name || (selectedSymbol === 's_sh000001' ? '上证指数' : displaySymbol(selectedSymbol));
  detailNameEl.textContent = name;
  detailCodeEl.textContent = displaySymbol(selectedSymbol);
  stockDetailPanelEl.classList.remove('rising', 'falling', 'flat');
  stockDetailPanelEl.classList.add(
    !nextQuote
      ? 'flat'
      : nextQuote.changePct > 0
        ? 'rising'
        : nextQuote.changePct < 0
          ? 'falling'
          : 'flat'
  );

  if (!nextQuote) {
    detailPriceEl.textContent = '--';
    detailChangeEl.textContent = quoteConnection === 'error' ? '自动重连中' : '行情连接中';
    detailPrevCloseEl.textContent = '--';
    detailDayChangeEl.textContent = '--';
    detailVolumeEl.textContent = '--';
    detailAmountEl.textContent = '--';
    detailSourceEl.textContent = '数据源 --';
    detailTimeEl.textContent = '--';
  } else {
    const previousClose = Number.isFinite(nextQuote.prevClose)
      ? nextQuote.prevClose
      : nextQuote.price - nextQuote.change;
    detailPriceEl.textContent = nextQuote.price.toFixed(2);
    detailChangeEl.textContent = `${nextQuote.change > 0 ? '+' : ''}${nextQuote.change.toFixed(2)}\n${formatPct(nextQuote.changePct)}`;
    detailPrevCloseEl.textContent = previousClose.toFixed(2);
    detailDayChangeEl.textContent = formatPct(nextQuote.changePct);
    detailVolumeEl.textContent = formatMarketNumber(
      nextQuote.volume,
      symbolMarket(selectedSymbol) === 'cn' ? '手' : '股'
    );
    detailAmountEl.textContent = `${currencyPrefix()}${formatMarketNumber(nextQuote.amount)}`;
    detailSourceEl.textContent = `数据源 ${nextQuote.source === 'tencent' ? '腾讯' : '新浪'}`;
    detailTimeEl.textContent = nextQuote.time || '刚刚更新';
  }

  const position = calculatePosition(nextQuote);
  if (!position) {
    detailPositionEl.textContent = '未设置持仓，可在齿轮设置中填写';
    detailPositionEl.className = '';
  } else {
    detailPositionEl.textContent = `持仓累计 ${signedMoney(position.totalPnl)} (${formatPct(position.totalPct)}) · 今日 ${signedMoney(position.todayPnl)}`;
    detailPositionEl.className = position.totalPnl < 0 ? 'loss' : '';
  }
}

function renderPositionPnl(nextQuote) {
  const result = calculatePosition(nextQuote);
  const configured = hasPosition();
  document.body.classList.toggle('has-position', configured);
  positionPnlEl.hidden = !configured || !result;
  if (!result) return;

  const funText =
    result.totalPnl > 0
      ? funProfitUnit(result.totalPnl)
      : result.totalPnl < 0
        ? funLossUnit(result.totalPnl)
        : '刚好回本';
  pnlTotalEl.textContent = `累计 ${signedMoney(result.totalPnl)} (${formatPct(
    result.totalPct
  )}) ${funText}`;
  pnlTodayEl.textContent = `今日 ${signedMoney(result.todayPnl)}`;
  positionPnlEl.className =
    result.totalPnl > 0 ? 'profit' : result.totalPnl < 0 ? 'loss' : 'flat';
  positionPnlEl.title = `昨日收盘 ${result.previousClose.toFixed(2)} · 今日盈亏 ${signedMoney(
    result.todayPnl
  )} · 累计盈亏 ${signedMoney(result.totalPnl)}`;
}

function updateStatus() {
  if (!marketOpen) {
    statusEl.textContent =
      !hasPosition() && quote
        ? `${quote.price.toFixed(2)} (${formatPct(quote.changePct)}) · 休盘 💤`
        : '休盘中 💤';
    statusEl.className = 'closed';
    return;
  }
  if (!quote) {
    statusEl.textContent =
      quoteConnection === 'error' ? '行情暂不可用 · 自动重连中' : '行情连接中…';
    statusEl.className = 'connecting';
    return;
  }
  if (targetState === STATE.DISCONNECTED) {
    statusEl.textContent = '行情断线 · 自动重连中';
    statusEl.className = 'connecting';
    return;
  }

  const prefix =
    targetState === STATE.BULLISH
      ? '牛来 '
      : targetState === STATE.BEARISH
        ? '妈妈 '
        : '';
  statusEl.textContent = `${prefix}${quote.price.toFixed(2)} (${formatPct(
    quote.changePct
  )})`;
  statusEl.className = targetState.toLowerCase();
}

function playVoiceForCurrentMarket() {
  // 收盘后仍允许点击发声，使用当天所选标的最后一次成功行情的涨跌幅。
  // 平盘、尚未取得行情或用户静音时保持安静。
  if (!quote || petSettings.muted || quietOfficeActive || petSettings.volume <= 0) return;
  const changePct = Number(quote.changePct);
  if (!Number.isFinite(changePct)) return;
  const state = changePct > 0 ? STATE.BULLISH : changePct < 0 ? STATE.BEARISH : null;
  if (!state) return;
  const direction = armedComicSoundDirection === state ? armedComicSoundDirection : state;
  effectsManager.trigger(COMIC_LAYER.SOUND, 'play', {
    direction,
    userInitiated: true
  });
  window.desktopPet?.report?.(
    'info',
    `点击音效: ${state === STATE.BULLISH ? '牛来' : '妈妈'}`
  );
}

function basePerformanceForMood(next, previous) {
  const performance = performanceForBaseState(next, previous);
  if (!performance || !emotionMemory.snapshot().enabled) return performance;
  const direction = next === STATE.BEARISH ? -1 : next === STATE.BULLISH ? 1 : 0;
  const scale = emotionMemory.reactionScale(direction);
  const adapted = { ...performance, actions: [...performance.actions] };
  adapted.priority = Math.max(1, Math.round(adapted.priority * scale));
  if (scale < 0.9 && next === STATE.BULLISH) adapted.actions = ['idle_look'];
  return adapted;
}

function changeState(next) {
  if (
    IS_ROAMING_OVERLAY &&
    forwardedAutoPerformance &&
    [STATE.CLOSED, STATE.DISCONNECTED].includes(next)
  ) {
    return;
  }
  if (next === targetState) return;
  previousState = targetState;
  targetState = next;
  if (next === STATE.CLOSED) {
    actionScheduler.cancelAll();
    effectsManager.clearHighIntensity('market-closed');
    if (previousState !== STATE.CLOSED) handleMarketClosedSummary();
  }
  behaviorStateMachine.transition(next, { priority: next === STATE.CLOSED ? 70 : 10 });
  bull2DController.setMarketState(next);
  bull3DController.setMarketState(next);
  stateStartedAt = elapsed;
  transition = 0;
  if (next !== STATE.CLOSED && next !== STATE.DISCONNECTED) {
    if (quietOfficeActive) {
      scheduleBullAnimation(next === STATE.BEARISH ? 'sad' : 'idle_look', {
        priority: 9,
        cooldown: 5000,
        fade: 0.30
      });
    } else {
      runMarketPerformance(basePerformanceForMood(next, previousState));
    }
  }
  updateStatus();
}

function refreshState() {
  if (demoState) {
    marketOpen = demoState !== STATE.CLOSED;
    if (targetState !== demoState) changeState(demoState);
    updateStatus();
    return;
  }

  marketOpen = isMarketOpen();
  const next = marketEventEngine.classify({
    marketOpen,
    quote,
    connection: quoteConnection
  });

  if (next !== targetState) changeState(next);
  if (!IS_ROAMING_OVERLAY) desktopRoamingController.setMarketState(next);
  updateStatus();
}

function onQuote(payload) {
  if (demoState) return;
  if (!payload.ok) {
    marketStore.markError();
    quoteConnection = marketStore.connection;
    renderQuoteCard(quote);
    renderPositionPnl(quote);
    marketEventEngine.process({
      marketOpen: isMarketOpen(),
      quote,
      connection: quoteConnection,
      position: calculatePosition(quote)
    });
    refreshState();
    return;
  }
  const snapshot = marketStore.updateQuote(payload.quote);
  quoteConnection = marketStore.connection;
  prevQuote = snapshot.previousQuote;
  quote = snapshot.quote;
  const rememberedIndex = savedStocks.findIndex((item) => item.symbol === selectedSymbol);
  if (rememberedIndex >= 0 && quote.name && savedStocks[rememberedIndex].name !== quote.name) {
    savedStocks[rememberedIndex] = { ...savedStocks[rememberedIndex], name: quote.name };
    saveJson(localStorage, 'niulai:saved-stocks-v1', savedStocks);
  }
  renderQuoteCard(quote);
  renderPositionPnl(quote);

  const evaluation = marketEventEngine.process({
    marketOpen: isMarketOpen(),
    quote,
    connection: quoteConnection,
    position: calculatePosition(quote)
  });
  updateLocalFeatureState({
    quote,
    position: calculatePosition(quote),
    marketOpen: isMarketOpen(),
    events: evaluation.events
  });
  for (const event of evaluation.events) dispatchMarketEvent(event);

  refreshState();
}

function onDemo(payload) {
  if (!payload || payload.state === null) {
    demoState = null;
    refreshState();
    return;
  }

  const next = STATE[payload.state];
  if (!next) return;
  demoState = next;
  quote = next === STATE.CLOSED ? null : payload.quote;
  renderQuoteCard(quote);
  renderPositionPnl(quote);
  marketOpen = next !== STATE.CLOSED;
  if (next !== targetState) {
    previousState = targetState;
    targetState = next;
    behaviorStateMachine.transition(next, { priority: next === STATE.CLOSED ? 20 : 10 });
    bull2DController.setMarketState(next);
    bull3DController.setMarketState(next);
    stateStartedAt = elapsed;
    transition = 0;
  }
  if (!IS_ROAMING_OVERLAY) desktopRoamingController.setMarketState(next);
  updateStatus();
}

function makeDebugQuote(changePct) {
  const prevClose = 100;
  const price = prevClose * (1 + Number(changePct) / 100);
  return {
    code: selectedSymbol,
    name: '开发模拟标的',
    price,
    prevClose,
    change: price - prevClose,
    changePct: Number(changePct),
    volume: 1000000,
    amount: 100000000,
    source: 'debug',
    time: '开发模拟'
  };
}

function runMarketDebugScenario(name) {
  let simulatedNow = 100000;
  const engine = new MarketEventEngine({
    config: marketEventConfig,
    symbol: selectedSymbol,
    now: () => simulatedNow
  });
  const frames = [];
  const push = (changePct, position = null, options = {}) => {
    frames.push({
      quote: makeDebugQuote(changePct),
      position,
      marketOpen: options.marketOpen ?? true,
      connection: options.connection || 'connected',
      advanceMs: options.advanceMs ?? 4000
    });
  };
  const firstBreakout = marketEventConfig.breakoutLevelsPct[0] || 1;
  if (name === 'CLOSED') push(0, null, { marketOpen: false });
  else if (name === 'DISCONNECTED') push(0, null, { connection: 'error' });
  else if (name === 'FLAT') push(0.05);
  else if (name === 'BULLISH') push(Math.max(0.4, marketEventConfig.flatBandPct + 0.1));
  else if (name === 'BEARISH') push(-Math.max(0.4, marketEventConfig.flatBandPct + 0.1));
  else if (name === 'RAPID_RISE') {
    push(0.1);
    push(0.1 + marketEventConfig.rapidRisePct + 0.15);
  } else if (name === 'RAPID_FALL') {
    push(-0.1);
    push(-0.1 - marketEventConfig.rapidFallPct - 0.15);
  } else if (name === 'BREAKOUT_UP') {
    push(firstBreakout - 0.25);
    push(firstBreakout + 0.05);
  } else if (name === 'BREAKOUT_DOWN') {
    push(-firstBreakout + 0.25);
    push(-firstBreakout - 0.05);
  } else if (name === 'POSITION_BREAKEVEN') {
    push(-0.4, { totalPnl: -400, totalPct: -0.4, todayPnl: -100 });
    push(0.02, { totalPnl: 20, totalPct: 0.02, todayPnl: 20 });
  } else if (name === 'POSITION_RECOVERED') {
    push(-0.5, { totalPnl: -500, totalPct: -0.5, todayPnl: -100 });
    push(0.5, { totalPnl: 500, totalPct: 0.5, todayPnl: 100 });
  } else if (name === 'PROFIT_EXPANDED') {
    push(0.3, { totalPnl: 100, totalPct: 0.2, todayPnl: 100 });
    push(0.7, { totalPnl: 100 + marketEventConfig.profitExpansionAmount + 100, totalPct: 0.2 + marketEventConfig.profitExpansionPct + 0.1, todayPnl: 700 });
  } else if (name === 'PROFIT_PULLBACK') {
    const peak = Math.max(2000, marketEventConfig.profitPullbackAmount * 3);
    push(1.2, { totalPnl: peak, totalPct: 2, todayPnl: peak });
    push(0.6, { totalPnl: peak - Math.max(marketEventConfig.profitPullbackAmount + 100, peak * marketEventConfig.profitPullbackRatio + 100), totalPct: 1, todayPnl: 500 });
  } else if (name === 'LIMIT_UP') {
    push(0);
    push(marketEventConfig.limitUpPct + 0.05);
  } else if (name === 'LIMIT_DOWN') {
    push(0);
    push(marketEventConfig.limitDownPct - 0.05);
  }

  let result = { baseState: STATE.FLAT, events: [] };
  const events = [];
  for (const frame of frames) {
    simulatedNow += frame.advanceMs;
    result = engine.process(frame);
    events.push(...result.events);
    updateLocalFeatureState({
      quote: frame.marketOpen === false ? null : frame.quote,
      position: frame.position,
      marketOpen: frame.marketOpen !== false && frame.connection !== 'error',
      events: result.events
    });
  }
  demoState = result.baseState;
  marketOpen = result.baseState !== STATE.CLOSED;
  quoteConnection = result.baseState === STATE.DISCONNECTED ? 'error' : 'connected';
  quote = result.baseState === STATE.CLOSED ? null : frames.at(-1)?.quote || null;
  renderQuoteCard(quote);
  renderPositionPnl(quote);
  if (result.baseState !== targetState) changeState(result.baseState);
  else if (
    new URLSearchParams(window.location.search).get('debugFx') === '1' &&
    events.length === 0 &&
    [STATE.BULLISH, STATE.BEARISH].includes(result.baseState)
  ) {
    runMarketPerformance(performanceForBaseState(result.baseState, STATE.FLAT));
  }
  for (const event of events) dispatchMarketEvent(event);
  updateStatus();
  return {
    message: `基础状态 ${result.baseState}\n事件 ${events.map((event) => event.type).join(', ') || '无'}`
  };
}

function restoreLiveMarketAfterDebug() {
  demoState = null;
  quote = marketStore.quote;
  prevQuote = marketStore.previousQuote;
  quoteConnection = marketStore.connection;
  renderQuoteCard(quote);
  renderPositionPnl(quote);
  refreshState();
}

installMarketDebugPanel({
  config: marketEventConfig,
  onConfigure: (partial) => {
    marketEventConfig = normalizeMarketEventConfig({ ...marketEventConfig, ...partial });
    marketEventEngine.configure(marketEventConfig);
    saveJson(localStorage, 'niulai:market-event-settings', marketEventConfig);
    return marketEventConfig;
  },
  onScenario: runMarketDebugScenario,
  onReset: restoreLiveMarketAfterDebug
});
if (new URLSearchParams(window.location.search).get('debugFx') === '1') {
  window.__NIULAI_RUN_MARKET_SCENARIO__ = runMarketDebugScenario;
  window.__NIULAI_RESET_DAILY_SESSION__ = () => dailySession.reset();
}

window.desktopPet?.onQuote(onQuote);
window.desktopPet?.onDemo(onDemo);
renderQuoteCard(null);
renderPositionPnl(null);
window.desktopPet?.selectSymbol(selectedSymbol).then((result) => {
  if (!result?.ok) {
    selectedSymbol = 's_sh000001';
    portfolio.symbol = selectedSymbol;
    window.desktopPet?.selectSymbol(selectedSymbol);
  } else {
    selectedSymbol = result.code;
    marketEventEngine.setSymbol(selectedSymbol);
    quoteCodeEl.textContent = displaySymbol(selectedSymbol);
  }
});
setInterval(refreshState, 1000);
setInterval(() => refreshRuntimePolicies(), 30000);
refreshState();

function spawnZzz() {
  if (zzzParticles.length >= 5) return;
  const baseSize = 0.28 + Math.random() * 0.12;
  const spriteMaterial = new THREE.SpriteMaterial({
    map: zzzTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(baseSize, baseSize * 0.82, 1);
  petRoot.updateMatrixWorld(true);
  headWorldPosition.copy(headLocalPosition).applyMatrix4(petRoot.matrixWorld);
  const startX = headWorldPosition.x + (Math.random() - 0.5) * 0.30;
  const startY = headWorldPosition.y + 0.20;
  sprite.position.set(startX, startY, 0.72);
  scene.add(sprite);

  zzzParticles.push({
    sprite,
    baseSize,
    startX,
    startY,
    drift: 0.08 + Math.random() * 0.16,
    age: 0,
    life: 2.4 + Math.random() * 1.0
  });
}

function lifecycleProgress() {
  if (!petLifecycle.duration) return 1;
  return THREE.MathUtils.clamp(
    (performance.now() - petLifecycle.receivedAt) / petLifecycle.duration,
    0,
    1
  );
}

function isSleepingLifecycle() {
  return !IS_ROAMING_OVERLAY && [
    HOME_PHASE.HOME_SLEEP_ENTER,
    HOME_PHASE.HOME_SLEEPING,
    HOME_PHASE.SAFE_HOME
  ].includes(petLifecycle.phase);
}

function petTransferVisual() {
  const phase = petLifecycle.phase;
  const progress = lifecycleProgress();
  if (phase === HOME_PHASE.ENTERING_HOME && IS_ROAMING_OVERLAY) {
    return { opacity: 1 - progress, scale: 1 - progress * 0.42, lift: progress * 0.20 };
  }
  if (phase === HOME_PHASE.HOME_SLEEP_ENTER && !IS_ROAMING_OVERLAY) {
    return { opacity: progress, scale: 0.64 + progress * 0.36, lift: (1 - progress) * 0.18 };
  }
  if (phase === HOME_PHASE.HOME_EXITING) {
    return IS_ROAMING_OVERLAY
      ? { opacity: progress, scale: 0.64 + progress * 0.36, lift: (1 - progress) * 0.18 }
      : { opacity: 1 - progress, scale: 1 - progress * 0.36, lift: progress * 0.18 };
  }
  if (phase === HOME_PHASE.SAFE_HOME) {
    return IS_ROAMING_OVERLAY
      ? { opacity: 1 - progress, scale: 1 - progress * 0.30, lift: progress * 0.12 }
      : { opacity: progress, scale: 0.70 + progress * 0.30, lift: (1 - progress) * 0.12 };
  }
  return { opacity: 1, scale: 1, lift: 0 };
}

function updateZzz(dt) {
  if (!isSleepingLifecycle() || !is3DVisibleInThisWindow() || petSettings.effects <= 0.01) {
    if (zzzParticles.length > 0) {
      for (const particle of zzzParticles) {
        scene.remove(particle.sprite);
        particle.sprite.material.dispose();
      }
      zzzParticles.length = 0;
    }
    return;
  }

  zzzTimer += dt;
  if (transition >= 0.85 && zzzTimer >= 1.05) {
    zzzTimer = 0;
    spawnZzz();
  }

  for (let i = zzzParticles.length - 1; i >= 0; i -= 1) {
    const particle = zzzParticles[i];
    particle.age += dt;
    const progress = Math.min(1, particle.age / particle.life);
    const grow = 1 + progress * 0.7;

    particle.sprite.position.y = particle.startY + progress * 0.58;
    particle.sprite.position.x =
      particle.startX +
      Math.sin(particle.age * 1.8 + particle.startX) *
        particle.drift *
        0.45;
    particle.sprite.scale.set(
      particle.baseSize * grow,
      particle.baseSize * 0.82 * grow,
      1
    );
    particle.sprite.material.opacity =
      0.9 * petSettings.effects * (1 - progress) * (1 - progress);

    if (progress >= 1) {
      scene.remove(particle.sprite);
      particle.sprite.material.dispose();
      zzzParticles.splice(i, 1);
    }
  }
}

function updatePose(dt) {
  if (!bull) return;
  const skeletalDriving = skeletalAnimationController?.isDrivingPose() === true;
  if (transition < 1) {
    transition = Math.min(1, transition + dt / 0.55);
  }

  const smooth =
    1 - Math.exp(-dt * (targetState === STATE.CLOSED ? 2.7 : 5.2));
  const breathingSpeed = targetState === STATE.CLOSED ? 1.05 : 1.55;
  const emotionSnapshot = emotionMemory.snapshot();
  const motion = THREE.MathUtils.clamp(
    petSettings.motion * (emotionSnapshot.enabled ? emotionSnapshot.profile.motionScale : 1),
    0,
    1.6
  );
  const breathing =
    Math.sin(elapsed * breathingSpeed) * (0.25 + motion * 0.75);
  const stateAge = Math.max(0, elapsed - stateStartedAt);
  const standingSway = Math.sin(elapsed * 0.72) * 0.012;

  let targetX = 0;
  let targetY = 0.018 + breathing * 0.009;
  let targetRotX = 0;
  let targetRotY = Math.sin(elapsed * 0.34) * 0.035 * motion;
  let targetRotZ = standingSway * motion;
  let targetScaleX = 1 + breathing * 0.010;
  let targetScaleY = 1 + breathing * 0.012;
  let targetScaleZ = 1 + breathing * 0.010;
  let armSwing = 0;
  let legSwing = 0;
  let headPitch = 0;
  let headTilt = -standingSway * 0.55;
  let tailWag = 0;

  const overlayTransfer = IS_ROAMING_OVERLAY && [
    HOME_PHASE.HOME_EXITING,
    HOME_PHASE.ENTERING_HOME,
    HOME_PHASE.SAFE_HOME
  ].includes(petLifecycle.phase);
  if (IS_ROAMING_OVERLAY && (roamingMotion.state !== 'AT_HOME' || overlayTransfer)) {
    const action = [HOME_PHASE.HOME_EXITING, HOME_PHASE.ENTERING_HOME].includes(petLifecycle.phase)
      ? 'walk'
      : roamingMotion.animation || 'idle_breathe';
    const gait = THREE.MathUtils.clamp(Number(roamingMotion.gaitScale) || 1, 0.35, 1.75);
    const walkPhase = elapsed * 6.1 * gait;
    const stride = Math.sin(walkPhase);
    const heading = Number(roamingMotion.heading);
    const facing = Number.isFinite(heading)
      ? -Math.cos(heading) * 0.52
      : Number(roamingMotion.direction) < 0 ? 0.42 : -0.42;
    targetRotY = facing;
    targetRotZ = standingSway * motion;
    targetY = 0.018 + breathing * 0.007;

    if (action === 'walk' || action === 'run') {
      const intensity = action === 'run' ? 1.2 : 0.72;
      armSwing = stride * intensity * motion;
      legSwing = -stride * intensity * 0.86 * motion;
      targetY += Math.abs(stride) * 0.026 * motion;
      headPitch = -0.035 * intensity;
      tailWag = Math.sin(walkPhase * 0.72) * 0.42;
    } else if (action === 'turn_left' || action === 'turn_right') {
      const turnSign = action === 'turn_left' ? -1 : 1;
      targetRotY += turnSign * 0.18;
      targetRotZ = turnSign * 0.035;
      headTilt = turnSign * 0.07;
    } else if (action === 'idle_look') {
      targetRotY += Math.sin(elapsed * 0.9) * 0.16;
      headTilt = Math.sin(elapsed * 0.72) * 0.08;
    } else if (action === 'idle_tail') {
      tailWag = Math.sin(elapsed * 4.6) * 0.78;
    } else if (action === 'idle_scratch') {
      armSwing = 0.24 + Math.sin(elapsed * 5.8) * 0.18;
      headPitch = 0.08;
    } else if (action === 'idle_yawn') {
      headPitch = -0.13 + Math.sin(elapsed * 1.2) * 0.04;
      targetScaleY *= 1.015;
    }
  } else if (isSleepingLifecycle()) {
    if (skeletalDriving) {
      // 骨骼动作自身已经包含侧卧位移与旋转，外层只负责轻量呼吸，避免双重旋转翻成四脚朝天。
      targetX = 0;
      targetY = breathing * 0.004;
      targetRotX = 0;
      targetRotY = 0;
      targetRotZ = 0;
      targetScaleX = 1 + breathing * 0.004;
      targetScaleY = 1 + breathing * 0.008;
      targetScaleZ = 1 + breathing * 0.004;
    } else {
      // 无骨骼回退模型由外层完成下沉和自然侧卧。
      const settle = easeInOutCubic(Math.min(1, stateAge / 1.15));
      targetX = -0.74 * settle;
      targetY = lerp(0.02, 0.82, settle) + breathing * 0.006;
      targetRotX = 0.06 * settle;
      targetRotY = -0.08 * settle;
      targetRotZ = -1.47 * settle;
      targetScaleX = 1 + breathing * 0.006;
      targetScaleY = 1 + breathing * 0.019;
      targetScaleZ = 1 + breathing * 0.010;
      headPitch = 0.08 + Math.sin(elapsed * 0.58) * 0.018;
      headTilt = -0.04;
    }
  } else if (targetState === STATE.BULLISH) {
    // 普通上涨仅挺胸和轻微开心摇摆；冲刺由快速拉升或涨停事件单独调度。
    const confidence = Math.sin(stateAge * 2.3);
    targetY += Math.abs(confidence) * 0.014 * motion;
    targetRotX = -0.035 * motion;
    targetRotZ = confidence * 0.035 * motion;
    armSwing = confidence * 0.10 * motion;
    headPitch = -0.07 * motion;
    tailWag = Math.sin(stateAge * 4.2) * 0.30 * motion;
  } else if (targetState === STATE.BEARISH) {
    // 普通下跌仅缩肩低头并原地轻拖步；摔倒只由快速跳水或跌停事件调度。
    const walkPhase = stateAge * 4.1;
    const stride = Math.sin(walkPhase);
    targetX = Math.sin(stateAge * 0.8) * 0.025 * motion;
    targetY += Math.abs(stride) * 0.010 * motion;
    targetRotX = 0.075 * motion;
    targetRotY = (0.08 + stride * 0.025) * motion;
    targetRotZ =
      (-0.055 + Math.sin(walkPhase * 0.5) * 0.035) * motion;
    armSwing = stride * 0.34 * motion;
    legSwing = -stride * 0.30 * motion;
    headPitch = (0.31 + Math.abs(stride) * 0.035) * motion;
    headTilt =
      (0.065 + Math.sin(walkPhase * 0.5) * 0.025) * motion;
    targetScaleY = 0.975 + breathing * 0.008;
  }

  if (emotionSnapshot.enabled && targetState !== STATE.CLOSED) {
    const headBias = {
      excited: -0.035,
      cautious: 0.025,
      tired: 0.075,
      frustrated: 0.095,
      smug: -0.055
    }[emotionSnapshot.mood] || 0;
    headPitch += headBias;
    if (emotionSnapshot.mood === 'tired') targetScaleY *= 0.992;
    if (emotionSnapshot.mood === 'smug') targetRotZ -= 0.018;
  }

  if (targetState !== STATE.CLOSED) {
    if (elapsed < interactionState.incenseUntil) {
      targetX = 0;
      targetY = 0.01 + Math.sin(elapsed * 1.5) * 0.005;
      targetRotX = 0.03;
      targetRotY = 0;
      targetRotZ = 0;
      armSwing = Math.sin(elapsed * 1.4) * 0.06;
      legSwing = 0;
      headPitch = 0.28 + Math.sin(elapsed * 1.2) * 0.025;
      headTilt = 0;
    } else if (elapsed < interactionState.rageUntil) {
      const ragePhase = elapsed * 14.5;
      targetX = -0.10 + Math.max(0, Math.sin(ragePhase * 0.25)) * 0.16;
      targetY = -0.04 + Math.abs(Math.sin(ragePhase)) * 0.045;
      targetRotX = -0.10;
      targetRotY = Math.sin(ragePhase * 0.5) * 0.08;
      targetRotZ = Math.sin(ragePhase) * 0.045;
      armSwing = Math.sin(ragePhase) * 0.55;
      legSwing = -Math.sin(ragePhase) * 0.96;
      headPitch = -0.18;
      headTilt = Math.sin(ragePhase * 0.5) * 0.055;
      tailWag = Math.sin(ragePhase * 0.62) * 0.36;
    } else if (elapsed < interactionState.bullFeedUntil) {
      const chew = Math.sin(elapsed * 11.0);
      targetRotZ += Math.sin(elapsed * 4.2) * 0.055;
      armSwing = 0.10 + Math.sin(elapsed * 5.2) * 0.12;
      headPitch = 0.12 + Math.abs(chew) * 0.13;
      headTilt = Math.sin(elapsed * 5.5) * 0.035;
      targetScaleY *= 1 + Math.max(0, chew) * 0.015;
    } else if (elapsed < interactionState.bearFeedUntil) {
      const retch = Math.sin(elapsed * 12.5);
      targetRotZ += retch * 0.12;
      targetRotY += Math.sin(elapsed * 16.0) * 0.09;
      armSwing = retch * 0.28;
      headPitch = 0.20 + Math.abs(retch) * 0.22;
      headTilt = retch * 0.20;
    } else if (elapsed < interactionState.happyUntil) {
      const joy = Math.sin(elapsed * 8.0);
      targetRotZ += joy * 0.20;
      targetRotY += Math.sin(elapsed * 6.0) * 0.12;
      armSwing += joy * 0.26;
      headTilt -= joy * 0.14;
      targetY += Math.abs(joy) * 0.035;
      tailWag = Math.sin(elapsed * 13.0) * 0.92;
    }

    if (quote?.changePct <= -3) {
      const panic = Math.sin(elapsed * 34.0);
      targetX += panic * 0.027;
      targetRotY += panic * 0.055;
      targetRotZ += Math.sin(elapsed * 29.0) * 0.035;
      headTilt += panic * 0.06;
    }
  }

  if (
    IS_ROAMING_OVERLAY &&
    petSettings.showQuote &&
    petSettings.quoteCardMode === 'follow' &&
    !quoteCardEl.hidden
  ) {
    targetX += document.body.dataset.quoteSide === 'left' ? 0.32 : -0.32;
  }

  targetScaleX *= petSettings.modelScale;
  targetScaleY *= petSettings.modelScale;
  targetScaleZ *= petSettings.modelScale;

  // 横躺姿势比站姿宽得多；睡眠时限制有效尺寸并回中，醒来时平滑恢复用户比例。
  const sleepFit = sleepViewportFit(petLifecycle.phase, lifecycleProgress());
  if (!IS_ROAMING_OVERLAY && sleepFit.amount > 0) {
    const configuredScale = Math.max(0.01, petSettings.modelScale);
    const fittedScale = Math.min(configuredScale, sleepFit.maxScale);
    const fitScaleFactor = lerp(1, fittedScale / configuredScale, sleepFit.amount);
    targetX += sleepFit.x;
    targetY += sleepFit.y;
    targetScaleX *= fitScaleFactor;
    targetScaleY *= fitScaleFactor;
    targetScaleZ *= fitScaleFactor;
  }

  const transferVisual = petTransferVisual();
  targetY += transferVisual.lift;
  targetScaleX *= transferVisual.scale;
  targetScaleY *= transferVisual.scale;
  targetScaleZ *= transferVisual.scale;
  renderer.domElement.style.opacity = transferVisual.opacity.toFixed(3);

  glowLight.intensity = 0;
  keyLight.color.copy(KEY_BASE_COLOR);
  keyLight.intensity = 1.8;

  petRoot.rotation.x = lerp(petRoot.rotation.x, targetRotX, smooth);
  petRoot.rotation.y = lerp(petRoot.rotation.y, targetRotY, smooth);
  petRoot.rotation.z = lerp(petRoot.rotation.z, targetRotZ, smooth);
  petRoot.position.x = lerp(petRoot.position.x, targetX, smooth);
  petRoot.position.y = lerp(petRoot.position.y, targetY, smooth);
  petRoot.scale.set(
    lerp(petRoot.scale.x, targetScaleX, smooth),
    lerp(petRoot.scale.y, targetScaleY, smooth),
    lerp(petRoot.scale.z, targetScaleZ, smooth)
  );

  softRigUniforms.armSwing.value = lerp(
    softRigUniforms.armSwing.value,
    skeletalDriving ? 0 : armSwing,
    smooth
  );
  softRigUniforms.legSwing.value = lerp(
    softRigUniforms.legSwing.value,
    skeletalDriving ? 0 : legSwing,
    smooth
  );
  softRigUniforms.headPitch.value = lerp(
    softRigUniforms.headPitch.value,
    skeletalDriving ? 0 : headPitch,
    smooth
  );
  softRigUniforms.headTilt.value = lerp(
    softRigUniforms.headTilt.value,
    skeletalDriving ? 0 : headTilt,
    smooth
  );
  softRigUniforms.tailWag.value = lerp(
    softRigUniforms.tailWag.value,
    skeletalDriving ? 0 : tailWag,
    smooth
  );

  if (headRef && !skeletalDriving) {
    headRef.rotation.x = lerp(headRef.rotation.x, headPitch, smooth);
    headRef.rotation.z = lerp(headRef.rotation.z, headTilt, smooth);
  }
  if (!skeletalDriving) frontLegRefs.forEach((arm) => {
    const side = arm.position.x < 0 ? -1 : 1;
    arm.rotation.x = lerp(arm.rotation.x, armSwing * -side, smooth);
  });
  if (!skeletalDriving) backLegRefs.forEach((leg) => {
    const side = leg.position.x < 0 ? -1 : 1;
    leg.rotation.x = lerp(leg.rotation.x, legSwing * side, smooth);
  });
}

function updateHeadEffects(dt) {
  const ownsVisible3D = is3DVisibleInThisWindow() && !isSleepingLifecycle();
  const comicEventActive = Boolean(comicMainState || comicPrimaryState || effectsManager.isPerforming());
  const bullishVisible = ownsVisible3D && !comicEventActive && targetState === STATE.BULLISH;
  const bearishVisible = ownsVisible3D && !comicEventActive && targetState === STATE.BEARISH;
  const response = 1 - Math.exp(-dt * 9);

  bull?.updateMatrixWorld?.(true);
  const rigHead = bull?.getObjectByName?.('head');
  if (rigHead?.localToWorld) {
    headWorldPosition.copy(rigHead.localToWorld(new THREE.Vector3(0, -0.024, 0.718)));
    headWorldPosition.y += 0.28;
  } else {
    petRoot.updateMatrixWorld(true);
    headWorldPosition.copy(headLocalPosition).applyMatrix4(petRoot.matrixWorld);
  }

  bullishHeadEffect.material.opacity = lerp(
    bullishHeadEffect.material.opacity,
    bullishVisible ? Math.min(1, 0.96 * petSettings.effects) : 0,
    response
  );
  bearishHeadEffect.material.opacity = lerp(
    bearishHeadEffect.material.opacity,
    bearishVisible ? Math.min(1, 0.94 * petSettings.effects) : 0,
    response
  );
  bullishHeadEffect.visible = bullishHeadEffect.material.opacity > 0.015;
  bearishHeadEffect.visible = bearishHeadEffect.material.opacity > 0.015;

  const risePulse = 1 + Math.sin(elapsed * 5.8) * 0.09;
  bullishHeadEffect.position.set(
    headWorldPosition.x + Math.sin(elapsed * 2.5) * 0.025,
    headWorldPosition.y + 0.22 + Math.sin(elapsed * 4.1) * 0.040,
    0.72
  );
  const effectScale = 0.65 + petSettings.effects * 0.35;
  bullishHeadEffect.scale.set(
    0.66 * risePulse * effectScale,
    0.66 * risePulse * effectScale,
    1
  );
  bullishHeadEffect.material.rotation = Math.sin(elapsed * 3.4) * 0.035;

  const fallPulse = 1 + Math.sin(elapsed * 3.6) * 0.055;
  bearishHeadEffect.position.set(
    headWorldPosition.x + Math.sin(elapsed * 1.7) * 0.035,
    headWorldPosition.y + 0.74 - Math.abs(Math.sin(elapsed * 2.7)) * 0.045,
    0.72
  );
  bearishHeadEffect.scale.set(
    0.82 * fallPulse * effectScale,
    0.82 * fallPulse * effectScale,
    1
  );
  bearishHeadEffect.material.rotation = Math.sin(elapsed * 2.2) * 0.025;

  for (const [effect, visible, offsetY] of [
    [bullish3dEffect, bullishVisible, 0.25],
    [bearish3dEffect, bearishVisible, 0.66]
  ]) {
    effect.userData.opacity = lerp(
      effect.userData.opacity,
      visible ? Math.min(1, 0.88 * petSettings.effects) : 0,
      response
    );
    effect.visible = effect.userData.opacity > 0.015;
    effect.position.set(headWorldPosition.x, headWorldPosition.y + offsetY, 0.52);
    effect.rotation.y += dt * (effect === bullish3dEffect ? 2.8 : -1.35);
    effect.rotation.z = Math.sin(elapsed * 3.2) * 0.04;
    const pulse =
      1 +
      Math.sin(
        elapsed * (effect === bullish3dEffect ? 6.4 : 3.5)
      ) *
        0.08;
    effect.scale.setScalar(pulse * effectScale);
    effect.userData.ring.scale.setScalar(
      0.84 + Math.abs(Math.sin(elapsed * 3.8)) * 0.42
    );
    effect.userData.materials.forEach((material) => {
      material.opacity = effect.userData.opacity;
    });
  }
}

function updateUnifiedComicEffects(dt) {
  const visible = is3DVisibleInThisWindow();
  effectsManager.setContext({
    visible: visible || is2DVisibleInThisWindow(),
    sleeping: isSleepingLifecycle(),
    lowPower: petSettings.powerSave,
    role: IS_ROAMING_OVERLAY ? 'roaming' : 'home'
  });
  if (!visible || isSleepingLifecycle()) {
    comicMainSprite.visible = false;
    comicPrimaryGroup.visible = false;
    if (windowFeedbackState) renderer.domElement.style.transform = '';
    windowFeedbackState = null;
    for (const transient of comicTransientMeshes.splice(0)) {
      scene.remove(transient.object);
      transient.object.geometry.dispose();
      transient.object.material.dispose();
    }
    return;
  }

  if (comicMainState) {
    comicMainState.age += dt;
    const progress = Math.min(1, comicMainState.age / comicMainState.duration);
    const enter = Math.min(1, progress / 0.16);
    const exit = Math.min(1, (1 - progress) / 0.22);
    const opacity = Math.min(enter, exit);
    comicMainMaterial.opacity = opacity;
    const pop = 0.72 + Math.sin(Math.min(1, enter) * Math.PI * 0.5) * 0.34;
    const mainWidth = IS_ROAMING_OVERLAY ? 1.18 : 0.92;
    comicMainSprite.scale.set(mainWidth * pop, mainWidth * 0.56 * pop, 1);
    const side = IS_ROAMING_OVERLAY ? -1 : 1;
    comicMainSprite.position.set(
      headWorldPosition.x + side * (IS_ROAMING_OVERLAY ? 0.58 : 0.70),
      headWorldPosition.y + (IS_ROAMING_OVERLAY ? 0.48 : -0.10) + Math.sin(progress * Math.PI) * 0.06,
      0.92
    );
    if (progress >= 1) {
      const token = comicMainState.token;
      comicMainSprite.visible = false;
      comicMainMaterial.map?.dispose?.();
      comicMainMaterial.map = null;
      comicMainState = null;
      effectsManager.finish(COMIC_LAYER.MAIN_TEXT, token);
    }
  }

  if (comicPrimaryState) {
    comicPrimaryState.age += dt;
    const progress = Math.min(1, comicPrimaryState.age / comicPrimaryState.duration);
    comicPrimaryGroup.position.set(headWorldPosition.x, headWorldPosition.y + 0.10, 0.62);
    for (const child of comicPrimaryGroup.children) {
      if (comicPrimaryState.rising) {
        child.position.addScaledVector(child.userData.velocity, dt);
      } else {
        child.position.y = 0.72 - ((comicPrimaryState.age * child.userData.fallSpeed + child.userData.fallPhase) % 1.45);
      }
      child.material.opacity = Math.max(0, 1 - progress * progress);
      if (comicPrimaryState.rising) child.userData.velocity.y -= 0.28 * dt;
    }
    if (progress >= 1) {
      const token = comicPrimaryState.token;
      clearComicGroup(comicPrimaryGroup);
      comicPrimaryGroup.visible = false;
      comicPrimaryState = null;
      effectsManager.finish(COMIC_LAYER.PRIMARY_PARTICLES, token);
    }
  }

  for (let index = comicTransientMeshes.length - 1; index >= 0; index -= 1) {
    const transient = comicTransientMeshes[index];
    transient.age += dt;
    const progress = Math.min(1, transient.age / transient.life);
    transient.object.position.y += transient.velocityY * dt;
    transient.object.scale.setScalar(1 + progress * 2.1);
    transient.object.material.opacity = (1 - progress) * 0.9;
    if (progress >= 1) {
      scene.remove(transient.object);
      transient.object.geometry.dispose();
      transient.object.material.dispose();
      comicTransientMeshes.splice(index, 1);
    }
  }

  if (windowFeedbackState) {
    windowFeedbackState.age += dt;
    const progress = Math.min(1, windowFeedbackState.age / windowFeedbackState.duration);
    const amplitude = (1 - progress) * windowFeedbackState.strength *
      (petSettings.powerSave || quietOfficeActive ? 2 : 4);
    const x = Math.sin(progress * Math.PI * 7) * amplitude;
    const y = windowFeedbackState.direction * Math.sin(progress * Math.PI) * amplitude * 0.55;
    renderer.domElement.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
    if (progress >= 1) {
      renderer.domElement.style.transform = '';
      windowFeedbackState = null;
    }
  }
}

function updateInteractiveEffects(dt) {
  const effectsEnabled = petSettings.effects > 0.01 && is3DVisibleInThisWindow();
  const incenseActive = elapsed < interactionState.incenseUntil;
  const rageActive = elapsed < interactionState.rageUntil;
  const bearFeedActive = elapsed < interactionState.bearFeedUntil;
  const extremeUp = Boolean(comicPrimaryState?.type === 'limit-up-burst');
  const extremeDown = Boolean(comicPrimaryState?.type === 'limit-down-lines');

  incenseGroup.visible =
    incenseActive && effectsEnabled && activeDisplayMode !== '2d';
  if (incenseGroup.visible) {
    interactionState.incenseSmokeTimer += dt;
    if (interactionState.incenseSmokeTimer >= 0.13) {
      interactionState.incenseSmokeTimer = 0;
      for (let i = -1; i <= 1; i += 1) {
        const origin = new THREE.Vector3(i * 0.13, 0.60, 0.94);
        spawnInteractiveParticle(
          'red-smoke',
          origin,
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.10,
            0.20 + Math.random() * 0.18,
            (Math.random() - 0.5) * 0.05
          ),
          {
            size: 0.10 + Math.random() * 0.06,
            life: 1.7 + Math.random() * 0.9,
            grow: 1.1,
            opacity: 0.70
          }
        );
      }
    }
  }

  if (rageActive && effectsEnabled) {
    interactionState.smokeTimer += dt;
    if (interactionState.smokeTimer >= 0.46) {
      interactionState.smokeTimer = 0;
      spawnNostrilSmoke();
    }
  }

  if (bearFeedActive && effectsEnabled) {
    interactionState.gasTimer += dt;
    if (interactionState.gasTimer >= 0.28) {
      interactionState.gasTimer = 0;
      spawnDisgustGas(4);
    }
  }

  extremeHalo.visible = extremeUp && effectsEnabled;
  if (extremeHalo.visible) {
    extremeHalo.position.set(petRoot.position.x, petRoot.position.y + 1.16, 0.22);
    extremeHalo.rotation.z += dt * 0.9;
    extremeHalo.children.forEach((ring, index) => {
      ring.rotation.z += dt * (0.8 + index * 0.42);
      const pulse = 1 + Math.sin(elapsed * (3.2 + index)) * 0.09;
      ring.scale.setScalar(pulse);
    });
  }

  extremeBearIcon.visible = extremeDown && effectsEnabled;
  bearHeadband.visible = extremeDown && effectsEnabled;
  if (extremeDown && effectsEnabled) {
    extremeBearIcon.position.set(
      headWorldPosition.x + 0.34,
      headWorldPosition.y + 0.34 + Math.sin(elapsed * 5.2) * 0.04,
      0.74
    );
    extremeBearIcon.material.rotation = Math.sin(elapsed * 8.0) * 0.10;
    bearHeadband.position.set(
      headWorldPosition.x,
      headWorldPosition.y + 0.42,
      0.70
    );
    bearHeadband.rotation.z = Math.sin(elapsed * 28.0) * 0.06;
  }

  const projected = headWorldPosition
    .clone()
    .add(new THREE.Vector3(0, 0.46, 0))
    .project(camera);
  const bubbleX = THREE.MathUtils.clamp(
    (projected.x * 0.5 + 0.5) * window.innerWidth,
    72,
    window.innerWidth - 72
  );
  const bubbleY = THREE.MathUtils.clamp(
    (-projected.y * 0.5 + 0.5) * window.innerHeight,
    70,
    window.innerHeight - 68
  );
  speechBubbleEl.style.left = `${bubbleX}px`;
  speechBubbleEl.style.top = `${bubbleY}px`;
  updateInteractiveParticles(dt);
}

const clock = new THREE.Clock();
let lastRenderedAt = 0;
const qaFrameMetrics = {
  startedAt: performance.now(),
  policyFrames: 0,
  rendered3DFrames: 0,
  twoDFrames: 0,
  maximumDeltaSeconds: 0
};

function resetQaFrameMetrics() {
  qaFrameMetrics.startedAt = performance.now();
  qaFrameMetrics.policyFrames = 0;
  qaFrameMetrics.rendered3DFrames = 0;
  qaFrameMetrics.twoDFrames = 0;
  qaFrameMetrics.maximumDeltaSeconds = 0;
}

function qaFrameSnapshot() {
  const seconds = Math.max(0.001, (performance.now() - qaFrameMetrics.startedAt) / 1000);
  return {
    seconds: Number(seconds.toFixed(3)),
    policyFrames: qaFrameMetrics.policyFrames,
    rendered3DFrames: qaFrameMetrics.rendered3DFrames,
    twoDFrames: qaFrameMetrics.twoDFrames,
    effectiveFps: Number((qaFrameMetrics.policyFrames / seconds).toFixed(2)),
    rendered3DFps: Number((qaFrameMetrics.rendered3DFrames / seconds).toFixed(2)),
    maximumDeltaSeconds: Number(qaFrameMetrics.maximumDeltaSeconds.toFixed(4))
  };
}

function animate(timestamp = 0) {
  requestAnimationFrame(animate);
  const threeVisible = is3DVisibleInThisWindow();
  const sleeping = targetState === STATE.CLOSED && isSleepingLifecycle();
  const configuredFrameGap = 1000 / Math.max(24, Number(petSettings.maxFps) || 60);
  const policyFrameGap = !threeVisible
    ? 1000 / (petSettings.powerSave || quietOfficeActive ? 8 : 15)
    : sleeping
      ? 1000 / (petSettings.powerSave || quietOfficeActive ? 8 : 12)
      : petSettings.powerSave || quietOfficeActive ? 1000 / 30 : 0;
  const minimumFrameGap = Math.max(configuredFrameGap, policyFrameGap);
  if (minimumFrameGap && timestamp - lastRenderedAt + 0.25 < minimumFrameGap) return;
  lastRenderedAt = timestamp;
  const dt = Math.min(clock.getDelta(), 0.05);
  qaFrameMetrics.policyFrames += 1;
  qaFrameMetrics.maximumDeltaSeconds = Math.max(qaFrameMetrics.maximumDeltaSeconds, dt);
  elapsed += dt;
  const using2D = is2DVisibleInThisWindow();
  const showing3D = threeVisible;
  bull3DController.setVisibleState(showing3D);
  bull2DController.setVisible(using2D);
  sceneEl.style.visibility = showing3D ? 'visible' : 'hidden';
  bull2DController.setMarketState(targetState);
  if (using2D) {
    qaFrameMetrics.twoDFrames += 1;
    speechBubbleEl.style.left = '150px';
    speechBubbleEl.style.top = '108px';
  }
  if (!showing3D) return;
  if (threeRenderingDisabled) return;
  try {
    skeletalAnimationController?.update(dt);
    updatePose(dt);
    updateHeadEffects(dt);
    updateUnifiedComicEffects(dt);
    updateInteractiveEffects(dt);
    updateZzz(dt);
    renderer.render(scene, camera);
    qaFrameMetrics.rendered3DFrames += 1;
  } catch (error) {
    fallback3DTo2D(error);
  }
}

animate();
scheduleFirstRunHint();
window.__NIULAI_QA_SNAPSHOT__ = () => ({
  rendererReady: Boolean(window.__NIULAI_RENDERER_READY__),
  activeDisplayMode,
  preferredDisplayMode: petSettings.displayMode,
  targetState,
  lifecycle: { ...petLifecycle },
  modelSource: bullModelSource,
  skeletal: Boolean(skeletalAnimationController?.boundSkeletalRig),
  activeAnimation: skeletalAnimationController?.activeName || null,
  threeRenderingDisabled,
  spriteVisible: spriteModeEl.getAttribute('aria-hidden') === 'false',
  quote: quote ? { price: quote.price, changePct: quote.changePct } : null,
  portfolio: { ...portfolio },
  audio: audioManager.snapshot(),
  frames: qaFrameSnapshot()
});
window.__NIULAI_RESET_QA_METRICS__ = resetQaFrameMetrics;
window.__NIULAI_QA_PLAY_VOICE__ = () => playVoiceForCurrentMarket();
window.__NIULAI_RENDERER_READY__ = true;
window.desktopPet?.report?.('info', '渲染器已就绪');
