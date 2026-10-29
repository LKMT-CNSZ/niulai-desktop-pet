const { app, BrowserWindow, ipcMain, protocol, screen, powerMonitor, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const {
  clampBoundsToWorkArea,
  pointInLocalRegion,
  quoteSideForWindow
} = require('./main-modules/roaming-geometry');
const {
  BEHAVIOR,
  RoamingBehavior,
  workAreasAreAdjacent
} = require('./main-modules/roaming-behavior');
const {
  HOME_PHASE,
  HOME_TIMING,
  phaseShowsRoaming3D,
  returnTimeoutMs,
  windowDistance
} = require('./main-modules/home-lifecycle');
const {
  FORM_MODE,
  FORM_STATE,
  FormMorphStateMachine
} = require('./main-modules/form-morph-state-machine');
const {
  normalizeMarketList,
  normalizeMarketSymbol,
  marketForSymbol,
  quoteProviderSymbol,
  parseTencentSuggestions,
  externalQuoteUrl
} = require('./main-modules/market-symbols');
const { parseSinaQuote, parseTencentQuote } = require('./main-modules/quote-parsers');

const SINA_QUOTE_BASE_URL = 'https://hq.sinajs.cn/list=';
const TENCENT_QUOTE_BASE_URL = 'https://qt.gtimg.cn/q=';
const TENCENT_SEARCH_BASE_URL = 'https://smartbox.gtimg.cn/s3/?t=all&q=';
const QUOTE_TIMEOUT_MS = 5000;
const POLL_MIN_MS = 3000;
const POLL_MAX_MS = 5000;
const WINDOW_SIZE = 300;
const ALWAYS_ON_TOP_LEVEL = process.platform === 'win32' ? 'screen-saver' : 'floating';
const CAPTURE_PREVIEW = process.argv.includes('--capture-preview');
const CAPTURE_SETTINGS = process.argv.includes('--capture-settings');
const CAPTURE_POSITION = process.argv.includes('--capture-position');
const CAPTURE_QUICK = process.argv.includes('--capture-quick');
const CAPTURE_ACTION = (
  process.argv.find((value) => value.startsWith('--capture-action=')) || ''
).split('=')[1];
const CAPTURE_EXTREME = process.argv.includes('--capture-extreme');
const CAPTURE_STATE = (
  process.argv.find((value) => value.startsWith('--capture-state=')) || ''
)
  .split('=')[1]
  ?.toUpperCase();
const QA_USER_DATA = (
  process.argv.find((value) => value.startsWith('--qa-user-data-dir=')) || ''
).slice('--qa-user-data-dir='.length);
const QA_AUTO_QUIT_MS = Math.max(0, Number((
  process.argv.find((value) => value.startsWith('--qa-auto-quit=')) || ''
).slice('--qa-auto-quit='.length)) || 0);
if (!CAPTURE_PREVIEW && QA_USER_DATA) {
  app.setPath('userData', path.resolve(QA_USER_DATA));
}
const HAS_SINGLE_INSTANCE_LOCK =
  CAPTURE_PREVIEW || app.requestSingleInstanceLock();
if (CAPTURE_PREVIEW) {
  app.setPath('userData', path.join(app.getPath('temp'), 'niulai-desktop-pet-preview'));
}

let mainWindow = null;
let roamingWindow = null;
let roamingTimer = null;
let roamingMouseTimer = null;
let roamingDragTimer = null;
let roamingDragOrigin = null;
let roamingState = 'CLOSED';
let roamingSpeed = 1;
let roamingPowerSave = true;
let roamingRecalled = false;
let roamingIgnoringMouse = true;
let roamingCrossDisplay = false;
let roamingDisplayId = null;
let roamingBehavior = null;
let roamingMotionSequence = 0;
let homeBounds = null;
let roamingAllowed = false;
let petDisplayMode = '2d';
let roamingRendererReady = false;
let petLifecycle = HOME_PHASE.HOME_SLEEPING;
let lifecycleTimer = null;
let returnDeadline = 0;
let manualWakeUntil = 0;
let lifecycleReason = 'startup';
const lifecycleHistory = [];
let roamingHitRegions = [{ x: 46, y: 64, width: 208, height: 165 }];
let pollTimer = null;
let selectedSymbol = 's_sh000001';
let logPath = null;
let rendererRecoveryCount = 0;
let saveBoundsTimer = null;
let repairingGeometry = false;
let windowDragTimer = null;
let windowDragTimeout = null;
let windowDragOrigin = null;
let isQuitting = false;
const formMorphStateMachine = new FormMorphStateMachine();
let currentPetSettings = {
  displayMode: '2d',
  allowRoaming: true,
  powerSave: true,
  autoContinueRoaming: false
};
let autoPerformanceTimer = null;

function writeLog(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${String(message)}\n`;
  try {
    if (logPath) fsSync.appendFileSync(logPath, line, 'utf8');
  } catch {}
}

function initializeLogging() {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fsSync.mkdirSync(logDir, { recursive: true });
    logPath = path.join(logDir, 'main.log');
    writeLog('INFO', `启动 ${app.getVersion()}，平台 ${process.platform} ${process.arch}`);
  } catch {}
}

process.on('uncaughtException', (error) => {
  writeLog('ERROR', `主进程异常: ${error?.stack || error}`);
});

process.on('unhandledRejection', (reason) => {
  writeLog('ERROR', `未处理的 Promise: ${reason?.stack || reason}`);
});

if (!HAS_SINGLE_INSTANCE_LOCK) {
  app.quit();
}

app.on('second-instance', () => {
  writeLog('INFO', '检测到重复启动，刷新并唤醒现有窗口');
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  repairWindowGeometry();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.reloadIgnoringCache();
});

function sendDemoState(state, price, changePct) {
  broadcastToRenderers('demo:state', {
    state,
    quote:
      state === null
        ? null
        : {
            code: 's_sh000001',
            name: '上证指数演示',
            price,
            change: price * (changePct / 100),
            prevClose: price - price * (changePct / 100),
            changePct
          }
  });
}

function rendererWindows() {
  return [mainWindow, roamingWindow].filter(
    (window) => window && !window.isDestroyed()
  );
}

function enforceAlwaysOnTop(window) {
  if (!window || window.isDestroyed()) return;
  window.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);
  if (process.platform === 'win32' && typeof window.moveTop === 'function') {
    window.moveTop();
  }
}

function installPersistentAlwaysOnTop(window) {
  enforceAlwaysOnTop(window);
  const reinforce = () => setTimeout(() => enforceAlwaysOnTop(window), 0);
  window.on('show', reinforce);
  window.on('restore', reinforce);
  window.on('blur', reinforce);
  window.on('always-on-top-changed', (_event, isAlwaysOnTop) => {
    if (!isAlwaysOnTop) reinforce();
  });
}

function broadcastToRenderers(channel, payload, exceptSender = null) {
  for (const window of rendererWindows()) {
    if (window.webContents === exceptSender) continue;
    window.webContents.send(channel, payload);
  }
}

function clearAutoPerformanceTimer() {
  if (autoPerformanceTimer) clearTimeout(autoPerformanceTimer);
  autoPerformanceTimer = null;
}

function sendFormStateTo(window, extra = {}) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send('pet:form-state', {
    ...formMorphStateMachine.snapshot(),
    ...extra
  });
}

function publishFormState(extra = {}) {
  petDisplayMode = formMorphStateMachine.snapshot().activeForm;
  broadcastToRenderers('pet:form-state', {
    ...formMorphStateMachine.snapshot(),
    ...extra
  });
  writeLog(
    'INFO',
    `双形态状态: ${formMorphStateMachine.state}，实际 ${petDisplayMode}，偏好 ${formMorphStateMachine.preferredMode}`
  );
}

function autoPerformanceDurationMs(event) {
  return ['LIMIT_UP', 'LIMIT_DOWN'].includes(String(event?.type || '')) ? 11000 : 7600;
}

function finishAutoPerformance(reason = 'renderer-complete') {
  if (formMorphStateMachine.state !== FORM_STATE.AUTO_PERFORMING) return false;
  clearAutoPerformanceTimer();
  const next = formMorphStateMachine.performanceComplete();
  publishFormState({ performanceCompleteReason: reason });
  if (next.state === FORM_STATE.AUTO_RETURNING) {
    beginReturnHome('auto-performance-complete');
  }
  return true;
}

function startPendingAutoPerformance() {
  const snapshot = formMorphStateMachine.snapshot();
  if (snapshot.state !== FORM_STATE.AUTO_ENTERING || !snapshot.pendingEvent) return false;
  if (!roamingWindow || roamingWindow.isDestroyed() || !roamingRendererReady) return false;
  const event = { ...snapshot.pendingEvent };
  formMorphStateMachine.roamingReady();
  publishFormState({ performanceEvent: event });
  roamingWindow.webContents.send('pet:auto-performance', event);
  clearAutoPerformanceTimer();
  autoPerformanceTimer = setTimeout(() => {
    autoPerformanceTimer = null;
    finishAutoPerformance('safety-timeout');
  }, autoPerformanceDurationMs(event));
  writeLog('INFO', `自动3D行情演出开始: ${event.type}`);
  return true;
}

function clearLifecycleTimer() {
  if (lifecycleTimer) clearTimeout(lifecycleTimer);
  lifecycleTimer = null;
}

function lifecyclePayload(phase = petLifecycle, extra = {}) {
  return {
    phase,
    reason: lifecycleReason,
    startedAt: Date.now(),
    duration: 0,
    ...extra
  };
}

function sendLifecycleTo(window, extra = {}) {
  if (!window || window.isDestroyed()) return;
  window.webContents.send('pet:lifecycle', lifecyclePayload(petLifecycle, extra));
}

function setPetLifecycle(phase, { duration = 0, reason = lifecycleReason, ...extra } = {}) {
  petLifecycle = phase;
  lifecycleReason = reason;
  const payload = lifecyclePayload(phase, { duration, reason, ...extra });
  lifecycleHistory.push({ phase, reason, at: payload.startedAt });
  if (lifecycleHistory.length > 60) lifecycleHistory.shift();
  broadcastToRenderers('pet:lifecycle', payload);
  writeLog('INFO', `桌宠生命周期: ${phase} (${reason})`);
  return payload;
}

function stopRoamingRuntime() {
  stopRoamingTimer();
  stopRoamingMouseTimer();
  stopRoamingDrag();
}

function ensureHomeInsideWorkArea() {
  if (!mainWindow || mainWindow.isDestroyed()) return getHomeBounds();
  const current = mainWindow.getBounds();
  const display = screen.getDisplayMatching(current);
  const safe = clampBoundsToWorkArea(current, display.workArea, WINDOW_SIZE);
  if (safe.x !== current.x || safe.y !== current.y || current.width !== WINDOW_SIZE || current.height !== WINDOW_SIZE) {
    mainWindow.setBounds(safe, false);
    writeLog('WARN', `家的位置不可完整到达，已修正到安全区域: ${JSON.stringify(safe)}`);
  }
  homeBounds = safe;
  return safe;
}

function displayForBounds(bounds) {
  return screen.getDisplayMatching({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: WINDOW_SIZE,
    height: WINDOW_SIZE
  });
}

function displaysCanConnect(first, second) {
  if (!first || !second || String(first.id) === String(second.id)) return true;
  return workAreasAreAdjacent(first.workArea, second.workArea, 40);
}

function stopRoamingTimer() {
  if (roamingTimer) clearInterval(roamingTimer);
  roamingTimer = null;
}

function stopRoamingMouseTimer() {
  if (roamingMouseTimer) clearInterval(roamingMouseTimer);
  roamingMouseTimer = null;
}

function stopRoamingDrag() {
  if (roamingDragTimer) clearInterval(roamingDragTimer);
  roamingDragTimer = null;
  roamingDragOrigin = null;
}

function getHomeBounds() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    homeBounds = { x: bounds.x, y: bounds.y, width: WINDOW_SIZE, height: WINDOW_SIZE };
  }
  return homeBounds || defaultWindowBounds();
}

function syncHomeBounds() {
  const bounds = getHomeBounds();
  if (!roamingWindow || roamingWindow.isDestroyed()) return bounds;
  roamingWindow.webContents.send('home:bounds', bounds);
  const homeDisplay = screen.getDisplayMatching(bounds);
  roamingBehavior?.updateHomeTarget(bounds, homeDisplay.id);
  if (petLifecycle === HOME_PHASE.RETURNING) {
    const current = roamingWindow.getBounds();
    const currentDisplay = displayForBounds(current);
    if (!displaysCanConnect(currentDisplay, homeDisplay)) {
      queueMicrotask(() => forceSafeHome('home-moved-to-unreachable-display'));
      return bounds;
    }
    returnDeadline = Date.now() + returnTimeoutMs(windowDistance(current, bounds), roamingSpeed);
  }
  if (roamingRecalled && !roamingDragOrigin) {
    setRoamingBounds(bounds.x, bounds.y, { displayId: homeDisplay.id });
  }
  return bounds;
}

function getDisplayById(displayId) {
  return screen.getAllDisplays().find((display) => String(display.id) === String(displayId));
}

function intersectsWorkArea(bounds, workArea) {
  return bounds.x < workArea.x + workArea.width &&
    bounds.x + bounds.width > workArea.x &&
    bounds.y < workArea.y + workArea.height &&
    bounds.y + bounds.height > workArea.y;
}

function setRoamingBounds(
  x,
  y,
  { crossing = false, displayId = null, allowHomeTransition = false } = {}
) {
  if (!roamingWindow || roamingWindow.isDestroyed()) return;
  const requested = { x: Math.round(x), y: Math.round(y), width: WINDOW_SIZE, height: WINDOW_SIZE };
  const display = getDisplayById(displayId) || screen.getDisplayMatching(requested);
  const allowCrossing = (roamingCrossDisplay || allowHomeTransition) && crossing;
  const intersectsDisplay = screen.getAllDisplays().some((candidate) =>
    intersectsWorkArea(requested, candidate.workArea)
  );
  const safe = allowCrossing && intersectsDisplay
    ? requested
    : clampBoundsToWorkArea(requested, display.workArea, WINDOW_SIZE);
  let requestedWidth = WINDOW_SIZE;
  let requestedHeight = WINDOW_SIZE;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    roamingWindow.setBounds(
      { x: safe.x, y: safe.y, width: requestedWidth, height: requestedHeight },
      false
    );
    const actual = roamingWindow.getBounds();
    if (actual.width === WINDOW_SIZE && actual.height === WINDOW_SIZE) return;
    requestedWidth += WINDOW_SIZE - actual.width;
    requestedHeight += WINDOW_SIZE - actual.height;
  }
}

function setRoamingMousePassthrough(ignore) {
  if (!roamingWindow || roamingWindow.isDestroyed()) return;
  if (roamingIgnoringMouse === ignore) return;
  roamingIgnoringMouse = ignore;
  roamingWindow.setIgnoreMouseEvents(ignore, { forward: true });
}

function getRoamingQuoteSide(bounds = roamingWindow?.getBounds?.()) {
  if (!bounds) return 'right';
  const display = screen.getDisplayMatching(bounds);
  return quoteSideForWindow(bounds, display.workArea, WINDOW_SIZE);
}

function startRoamingMouseTimer() {
  stopRoamingMouseTimer();
  const interval = roamingPowerSave ? 100 : 50;
  roamingMouseTimer = setInterval(() => {
    if (!roamingWindow || roamingWindow.isDestroyed()) {
      stopRoamingMouseTimer();
      return;
    }
    if (roamingDragOrigin) {
      setRoamingMousePassthrough(false);
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    const bounds = roamingWindow.getBounds();
    const overInteractivePart = roamingHitRegions.some((region) =>
      pointInLocalRegion(cursor, bounds, region)
    );
    setRoamingMousePassthrough(!overInteractivePart);
  }, interval);
}

function startRoamingTimer() {
  stopRoamingTimer();
  let previousTick = Date.now();
  let accumulator = 0;
  const fixedStep = 1 / 60;
  const interval = roamingPowerSave ? 66 : 33;
  roamingTimer = setInterval(() => {
    if (!roamingWindow || roamingWindow.isDestroyed()) {
      stopRoamingTimer();
      return;
    }
    const now = Date.now();
    const elapsedSeconds = Math.min(0.12, Math.max(0, (now - previousTick) / 1000));
    previousTick = now;
    if (!roamingBehavior || roamingDragOrigin) {
      accumulator = 0;
      return;
    }

    const home = getHomeBounds();
    const homeDisplay = screen.getDisplayMatching(home);
    if (returnDeadline && now >= returnDeadline && petLifecycle === HOME_PHASE.RETURNING) {
      forceSafeHome('return-timeout');
      return;
    }
    if (
      roamingState === 'CLOSED' &&
      now >= manualWakeUntil &&
      ![BEHAVIOR.RETURN_HOME, BEHAVIOR.AT_HOME].includes(roamingBehavior.state) &&
      ![HOME_PHASE.ENTERING_HOME, HOME_PHASE.HOME_SLEEP_ENTER].includes(petLifecycle)
    ) {
      beginReturnHome('market-closed');
      return;
    }

    const allDisplays = screen.getAllDisplays();
    const lockedDisplay =
      getDisplayById(roamingDisplayId) || screen.getDisplayMatching(roamingWindow.getBounds());
    const returning = petLifecycle === HOME_PHASE.RETURNING ||
      roamingBehavior.state === BEHAVIOR.RETURN_HOME;
    const displays = roamingCrossDisplay || returning ? allDisplays : [lockedDisplay];
    accumulator = Math.min(0.25, accumulator + elapsedSeconds);
    let motion = roamingBehavior.snapshot();
    let iterations = 0;
    while (accumulator >= fixedStep && iterations < 8) {
      motion = roamingBehavior.tick(fixedStep, displays);
      accumulator -= fixedStep;
      iterations += 1;
    }

    setRoamingBounds(motion.x, motion.y, {
      crossing: motion.crossing,
      displayId: motion.displayId,
      allowHomeTransition: returning
    });
    const actualBounds = roamingWindow.getBounds();
    if (motion.recalled && petLifecycle === HOME_PHASE.RETURNING) {
      beginEnterHome(lifecycleReason);
      return;
    }
    roamingWindow.webContents.send('roaming:motion', {
      ...motion,
      marketState: roamingState,
      quoteSide: getRoamingQuoteSide(actualBounds),
      sequence: ++roamingMotionSequence
    });
  }, interval);
}

function beginRoamingDrag() {
  if (!roamingWindow || roamingWindow.isDestroyed()) return;
  stopRoamingDrag();
  roamingRecalled = false;
  roamingBehavior?.releaseFromHome(0);
  roamingDragOrigin = {
    cursor: screen.getCursorScreenPoint(),
    bounds: roamingWindow.getBounds()
  };
  setRoamingMousePassthrough(false);
  roamingDragTimer = setInterval(() => {
    if (!roamingWindow || roamingWindow.isDestroyed() || !roamingDragOrigin) {
      stopRoamingDrag();
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    setRoamingBounds(
      roamingDragOrigin.bounds.x + cursor.x - roamingDragOrigin.cursor.x,
      roamingDragOrigin.bounds.y + cursor.y - roamingDragOrigin.cursor.y
    );
  }, roamingPowerSave ? 33 : 16);
}

function endRoamingDrag() {
  stopRoamingDrag();
  if (roamingWindow && !roamingWindow.isDestroyed()) {
    const bounds = roamingWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const safe = clampBoundsToWorkArea(bounds, display.workArea, WINDOW_SIZE);
    roamingDisplayId = display.id;
    setRoamingBounds(safe.x, safe.y, { displayId: display.id });
    roamingBehavior?.setPosition(safe, display.id, { replan: true });
  }
}

function completeHomeTransfer(reason = lifecycleReason) {
  clearLifecycleTimer();
  returnDeadline = 0;
  manualWakeUntil = 0;
  const home = ensureHomeInsideWorkArea();
  const homeDisplay = displayForBounds(home);
  roamingBehavior?.forceHome(home, homeDisplay.id);
  roamingRecalled = true;
  setRoamingBounds(home.x, home.y, { displayId: homeDisplay.id });
  if (roamingWindow && !roamingWindow.isDestroyed()) roamingWindow.hide();
  stopRoamingRuntime();
  clearAutoPerformanceTimer();
  if (formMorphStateMachine.preferredMode === FORM_MODE.AUTO) {
    formMorphStateMachine.homeArrived();
    petDisplayMode = FORM_MODE.TWO_D;
    destroyRoamingWindow();
    setPetLifecycle(HOME_PHASE.TWO_D, { reason });
    publishFormState();
    return;
  }
  formMorphStateMachine.homeArrived();
  publishFormState();
  setPetLifecycle(HOME_PHASE.HOME_SLEEP_ENTER, {
    duration: HOME_TIMING.sleepEnterMs,
    reason
  });
  lifecycleTimer = setTimeout(() => {
    lifecycleTimer = null;
    setPetLifecycle(HOME_PHASE.HOME_SLEEPING, { reason });
  }, HOME_TIMING.sleepEnterMs);
}

function beginEnterHome(reason = lifecycleReason) {
  if (petLifecycle === HOME_PHASE.ENTERING_HOME) return;
  clearLifecycleTimer();
  returnDeadline = 0;
  const home = ensureHomeInsideWorkArea();
  const homeDisplay = displayForBounds(home);
  roamingBehavior?.forceHome(home, homeDisplay.id);
  roamingRecalled = true;
  setRoamingBounds(home.x, home.y, { displayId: homeDisplay.id });
  setPetLifecycle(HOME_PHASE.ENTERING_HOME, {
    duration: HOME_TIMING.enterDoorMs,
    reason,
    homeBounds: home
  });
  setRoamingMousePassthrough(true);
  lifecycleTimer = setTimeout(() => {
    lifecycleTimer = null;
    completeHomeTransfer(reason);
  }, HOME_TIMING.enterDoorMs);
}

function forceSafeHome(reason = 'safe-recovery') {
  clearLifecycleTimer();
  returnDeadline = 0;
  endRoamingDrag();
  const home = ensureHomeInsideWorkArea();
  const homeDisplay = displayForBounds(home);
  roamingBehavior?.forceHome(home, homeDisplay.id);
  roamingRecalled = true;
  setRoamingBounds(home.x, home.y, { displayId: homeDisplay.id });
  setPetLifecycle(HOME_PHASE.SAFE_HOME, {
    duration: HOME_TIMING.safeFadeMs,
    reason,
    safeFallback: true
  });
  writeLog('WARN', `执行安全过渡回家: reason=${reason}, home=${JSON.stringify(home)}`);
  lifecycleTimer = setTimeout(() => {
    lifecycleTimer = null;
    completeHomeTransfer(reason);
  }, HOME_TIMING.safeFadeMs);
  return { ok: true, safeFallback: true, bounds: home };
}

function beginReturnHome(reason = 'market-closed') {
  if (petLifecycle === HOME_PHASE.RETURNING) return true;
  if (petLifecycle === HOME_PHASE.ENTERING_HOME) return true;
  clearLifecycleTimer();
  clearAutoPerformanceTimer();
  if (formMorphStateMachine.snapshot().activeForm === FORM_MODE.THREE_D) {
    const previousMorphSequence = formMorphStateMachine.sequence;
    formMorphStateMachine.beginReturn(reason);
    if (formMorphStateMachine.sequence !== previousMorphSequence) publishFormState();
  }
  endRoamingDrag();
  const home = ensureHomeInsideWorkArea();
  if (!roamingAllowed || !roamingWindow || roamingWindow.isDestroyed() || !roamingRendererReady) {
    completeHomeTransfer(reason);
    return true;
  }

  const current = roamingWindow.getBounds();
  const currentDisplay = displayForBounds(current);
  const homeDisplay = displayForBounds(home);
  if (!displaysCanConnect(currentDisplay, homeDisplay)) {
    forceSafeHome('home-unreachable-display-gap');
    return true;
  }

  roamingWindow.showInactive();
  roamingRecalled = false;
  roamingBehavior?.setPosition(current, currentDisplay.id);
  roamingBehavior?.requestHome(home, homeDisplay.id);
  returnDeadline = Date.now() + returnTimeoutMs(windowDistance(current, home), roamingSpeed);
  setPetLifecycle(HOME_PHASE.RETURNING, {
    reason,
    homeBounds: home,
    deadline: returnDeadline
  });
  roamingWindow.webContents.send('roaming:motion', {
    ...roamingBehavior?.snapshot?.('turn_left'),
    state: BEHAVIOR.RETURN_HOME,
    animation: 'turn_left',
    moving: false,
    returning: true,
    recalled: false,
    marketState: roamingState,
    quoteSide: getRoamingQuoteSide(current),
    sequence: ++roamingMotionSequence
  });
  startRoamingTimer();
  startRoamingMouseTimer();
  writeLog('INFO', `3D 巡游牛开始平滑回家: ${JSON.stringify(home)}`);
  return true;
}

function finishWakeExit(reason = lifecycleReason) {
  if (!roamingAllowed || roamingState === 'CLOSED' && Date.now() >= manualWakeUntil) {
    if (roamingState === 'CLOSED') beginReturnHome('closed-during-wake');
    else setPetLifecycle(HOME_PHASE.HOME_AWAKE, { reason });
    return;
  }
  const home = ensureHomeInsideWorkArea();
  const homeDisplay = displayForBounds(home);
  roamingBehavior?.forceHome(home, homeDisplay.id);
  roamingBehavior?.releaseFromHome(0.35);
  roamingRecalled = false;
  setPetLifecycle(HOME_PHASE.ROAMING, { reason });
  startRoamingTimer();
  startRoamingMouseTimer();
  if (!startPendingAutoPerformance()) {
    formMorphStateMachine.roamingReady();
    publishFormState();
  }
}

function beginWakeFromHome(reason = 'market-open', { manual = false } = {}) {
  if (petDisplayMode !== '3d') return { ok: false, message: '当前使用二维牛' };
  if ([HOME_PHASE.ROAMING, HOME_PHASE.HOME_EXITING].includes(petLifecycle)) {
    return { ok: true, message: '牛来已经醒着' };
  }
  clearLifecycleTimer();
  returnDeadline = 0;
  if (manual) manualWakeUntil = Date.now() + HOME_TIMING.manualWakeMs;

  if (!roamingAllowed) {
    setPetLifecycle(HOME_PHASE.HOME_WAKING, {
      duration: HOME_TIMING.wakeMs,
      reason
    });
    lifecycleTimer = setTimeout(() => {
      lifecycleTimer = null;
      setPetLifecycle(HOME_PHASE.HOME_AWAKE, { reason });
    }, HOME_TIMING.wakeMs);
    return { ok: true, message: '牛来醒啦，会留在家中' };
  }

  if (!roamingWindow || roamingWindow.isDestroyed()) {
    createRoamingWindow({
      roamingSpeed,
      crossDisplayRoaming: roamingCrossDisplay,
      powerSave: roamingPowerSave
    });
    return { ok: true, pending: true, message: '牛来正在醒来' };
  }
  if (!roamingRendererReady) {
    return { ok: true, pending: true, message: '牛来正在准备出门' };
  }

  setPetLifecycle(HOME_PHASE.HOME_WAKING, {
    duration: HOME_TIMING.wakeMs,
    reason
  });
  lifecycleTimer = setTimeout(() => {
    lifecycleTimer = null;
    if (!roamingWindow || roamingWindow.isDestroyed()) {
      forceSafeHome('overlay-missing-during-wake');
      return;
    }
    const home = ensureHomeInsideWorkArea();
    const homeDisplay = displayForBounds(home);
    roamingBehavior?.forceHome(home, homeDisplay.id);
    setRoamingBounds(home.x, home.y, { displayId: homeDisplay.id });
    setRoamingMousePassthrough(true);
    roamingWindow.showInactive();
    setPetLifecycle(HOME_PHASE.HOME_EXITING, {
      duration: HOME_TIMING.exitDoorMs,
      reason,
      homeBounds: home
    });
    lifecycleTimer = setTimeout(() => {
      lifecycleTimer = null;
      finishWakeExit(reason);
    }, HOME_TIMING.exitDoorMs);
  }, HOME_TIMING.wakeMs);
  return { ok: true, message: '牛来正在醒来并准备出门' };
}

function recallRoamingWindow() {
  if (petDisplayMode !== '3d') {
    return { ok: false, message: '当前是二维牛，无需召回' };
  }
  if ([HOME_PHASE.HOME_SLEEPING, HOME_PHASE.HOME_SLEEP_ENTER].includes(petLifecycle)) {
    return { ok: true, returning: false, message: '牛来已经在家睡觉' };
  }
  beginReturnHome('user-recall');
  return {
    ok: true,
    returning: true,
    bounds: getHomeBounds(),
    message: '牛来正在平滑回家'
  };
}

function destroyRoamingWindow() {
  const existed = Boolean(roamingWindow && !roamingWindow.isDestroyed());
  stopRoamingTimer();
  stopRoamingMouseTimer();
  stopRoamingDrag();
  if (roamingWindow && !roamingWindow.isDestroyed()) roamingWindow.destroy();
  roamingWindow = null;
  roamingRendererReady = false;
  roamingHitRegions = [{ x: 46, y: 64, width: 208, height: 165 }];
  roamingRecalled = false;
  roamingBehavior = null;
  roamingDisplayId = null;
  if (existed) writeLog('INFO', '3D 桌面漫游牛已收回');
}

function createRoamingWindow(settings = {}) {
  if (isQuitting) return;
  roamingSpeed = Math.min(2, Math.max(0.3, Number(settings.roamingSpeed) || 1));
  roamingCrossDisplay = settings.crossDisplayRoaming === true;
  const nextPowerSave = settings.powerSave !== false;
  if (roamingWindow && !roamingWindow.isDestroyed()) {
    const powerChanged = roamingPowerSave !== nextPowerSave;
    roamingPowerSave = nextPowerSave;
    roamingBehavior?.configure({
      speedScale: roamingSpeed,
      frequencyScale: settings.roamingFrequency,
      powerSave: roamingPowerSave,
      crossDisplay: roamingCrossDisplay,
      quietMode: settings.quietMode === true,
      emotion: settings.emotion,
      emotionProfile: settings.emotionProfile
    });
    roamingWindow.webContents.send('roaming:settings', settings);
    if (powerChanged && phaseShowsRoaming3D(petLifecycle)) {
      startRoamingTimer();
      startRoamingMouseTimer();
    }
    return;
  }
  roamingPowerSave = nextPowerSave;
  roamingRecalled = true;
  roamingRendererReady = false;
  const anchor = getHomeBounds();
  const anchorDisplay = screen.getDisplayMatching(anchor);
  roamingDisplayId = anchorDisplay.id;
  roamingBehavior = new RoamingBehavior({ windowSize: WINDOW_SIZE });
  roamingBehavior.configure({
    speedScale: roamingSpeed,
    frequencyScale: settings.roamingFrequency,
    powerSave: roamingPowerSave,
    crossDisplay: roamingCrossDisplay,
    quietMode: settings.quietMode === true,
    emotion: settings.emotion,
    emotionProfile: settings.emotionProfile
  });
  roamingBehavior.setPosition(anchor, anchorDisplay.id);
  roamingBehavior.updateHomeTarget(anchor, anchorDisplay.id);
  roamingWindow = new BrowserWindow({
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    x: anchor.x,
    y: anchor.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  installPersistentAlwaysOnTop(roamingWindow);
  roamingIgnoringMouse = true;
  roamingWindow.setIgnoreMouseEvents(true, { forward: true });
  const query = { roaming: '1' };
  if (!app.isPackaged && process.argv.includes('--debug-actions')) query.debugActions = '1';
  roamingWindow.loadFile('index.html', { query });
  roamingWindow.once('ready-to-show', () => {
    if (!roamingWindow || roamingWindow.isDestroyed()) return;
    roamingRendererReady = true;
    setRoamingBounds(anchor.x, anchor.y, { displayId: anchorDisplay.id });
    roamingWindow.webContents.send('roaming:settings', settings);
    roamingWindow.webContents.send('home:bounds', getHomeBounds());
    sendLifecycleTo(roamingWindow);
    sendFormStateTo(roamingWindow);
    if (phaseShowsRoaming3D(petLifecycle)) {
      roamingWindow.showInactive();
      startRoamingTimer();
      startRoamingMouseTimer();
    } else {
      roamingWindow.hide();
    }
    writeLog('INFO', '3D 桌面漫游牛已启动');
    if (roamingState !== 'CLOSED') beginWakeFromHome('market-open');
    const initialBounds = roamingWindow.getBounds();
    setTimeout(() => {
      if (!roamingWindow || roamingWindow.isDestroyed()) return;
      writeLog(
        'INFO',
        `3D 漫游位置检查: ${JSON.stringify(initialBounds)} -> ${JSON.stringify(roamingWindow.getBounds())}`
      );
    }, 3000);
  });
  roamingWindow.on('closed', () => {
    stopRoamingTimer();
    stopRoamingMouseTimer();
    stopRoamingDrag();
    roamingWindow = null;
    roamingRendererReady = false;
    roamingBehavior = null;
    roamingDisplayId = null;
  });
}

function runDemoSequence() {
  // 先保留休盘睡眠，随后完整演示斜上冲刺和斜下拖步。
  setTimeout(() => sendDemoState('BULLISH', 3500.88, 1.28), 4200);
  setTimeout(() => sendDemoState('BEARISH', 3388.66, -1.36), 12200);
  setTimeout(() => sendDemoState(null, 0, 0), 20200);
}

async function collectQaSample(label) {
  const rendererSnapshot = mainWindow && !mainWindow.isDestroyed()
    ? await mainWindow.webContents.executeJavaScript(
        "window.__NIULAI_QA_SNAPSHOT__?.() || null"
      ).catch((error) => ({ error: String(error?.message || error) }))
    : null;
  const roamingSnapshot = roamingWindow && !roamingWindow.isDestroyed()
    ? await roamingWindow.webContents.executeJavaScript(
        "window.__NIULAI_QA_SNAPSHOT__?.() || null"
      ).catch((error) => ({ error: String(error?.message || error) }))
    : null;
  const mainMemory = await process.getProcessMemoryInfo().catch(() => null);
  const processMetrics = app.getAppMetrics();
  const memoryForWindow = (window) => {
    if (!window || window.isDestroyed()) return null;
    const pid = window.webContents.getOSProcessId();
    const metric = processMetrics.find((entry) => entry.pid === pid);
    return metric ? { pid, type: metric.type, ...metric.memory } : { pid };
  };
  const rendererMemory = memoryForWindow(mainWindow);
  const roamingMemory = memoryForWindow(roamingWindow);
  return {
    label,
    timestamp: new Date().toISOString(),
    renderer: rendererSnapshot,
    roamingRenderer: roamingSnapshot,
    memoryKb: { main: mainMemory, renderer: rendererMemory, roaming: roamingMemory },
    windows: {
      home: mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null,
      roaming: roamingWindow && !roamingWindow.isDestroyed() ? roamingWindow.getBounds() : null,
      roamingVisible: Boolean(roamingWindow?.isVisible?.()),
      mousePassthrough: roamingIgnoringMouse
    },
    displays: screen.getAllDisplays().map((display) => ({
      id: display.id,
      scaleFactor: display.scaleFactor,
      workArea: display.workArea
    }))
  };
}

async function writeQaArtifact(name, data) {
  const outputRoot = app.isPackaged
    ? path.join(app.getPath('userData'), 'artifacts')
    : path.join(__dirname, 'artifacts');
  const outputPath = path.join(outputRoot, name);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`);
  writeLog('INFO', `QA报告: ${outputPath}`);
}

async function capturePreview() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const outputDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'artifacts')
    : path.join(__dirname, 'artifacts');
  const suffix = `${CAPTURE_STATE ? `-${CAPTURE_STATE.toLowerCase()}` : ''}${
    CAPTURE_SETTINGS ? '-settings' : ''
  }${CAPTURE_POSITION ? '-position' : ''}${CAPTURE_QUICK ? '-quick' : ''}${
    CAPTURE_ACTION ? `-${CAPTURE_ACTION}` : ''
  }${CAPTURE_EXTREME ? '-extreme' : ''}`;
  const outputPath = path.join(outputDir, `bull-preview${suffix}.png`);
  await fs.mkdir(outputDir, { recursive: true });
  const image = await mainWindow.webContents.capturePage();
  await fs.writeFile(outputPath, image.toPNG());
  writeLog('INFO', `预览截图: ${outputPath}`);
  if (roamingWindow && !roamingWindow.isDestroyed()) {
    const roamingImage = await roamingWindow.webContents.capturePage();
    const roamingPath = path.join(outputDir, `bull-preview${suffix}-roaming.png`);
    await fs.writeFile(roamingPath, roamingImage.toPNG());
    writeLog('INFO', `漫游牛预览截图: ${roamingPath}`);
  }
  app.quit();
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'pet',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

const MIME_TYPES = {
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

async function handlePetRequest(request) {
  try {
    const url = new URL(request.url);
    if (url.hostname !== 'local') {
      return new Response('Not found', { status: 404 });
    }

    const appRoot = app.getAppPath();
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const target = path.resolve(appRoot, relative);
    const assetsRoot = path.join(appRoot, 'assets');
    const docsRoot = path.join(appRoot, 'docs');
    const insideAllowedRoot = [assetsRoot, docsRoot].some(
      (root) => target === root || target.startsWith(root + path.sep)
    );

    if (!insideAllowedRoot) {
      return new Response('Forbidden', { status: 403 });
    }

    const data = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function defaultWindowBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.max(workArea.x, workArea.x + workArea.width - WINDOW_SIZE - 24),
    y: Math.max(workArea.y, workArea.y + workArea.height - WINDOW_SIZE - 48),
    width: WINDOW_SIZE,
    height: WINDOW_SIZE
  };
}

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

async function readWindowBounds() {
  try {
    const saved = JSON.parse(await fs.readFile(windowStatePath(), 'utf8'));
    if (!Number.isFinite(saved.x) || !Number.isFinite(saved.y)) {
      return defaultWindowBounds();
    }
    const candidate = {
      x: Math.round(saved.x),
      y: Math.round(saved.y),
      width: WINDOW_SIZE,
      height: WINDOW_SIZE
    };
    const { workArea } = screen.getDisplayMatching(candidate);
    const visibleMargin = 48;
    candidate.x = Math.min(
      workArea.x + workArea.width - visibleMargin,
      Math.max(workArea.x - WINDOW_SIZE + visibleMargin, candidate.x)
    );
    candidate.y = Math.min(
      workArea.y + workArea.height - visibleMargin,
      Math.max(workArea.y - WINDOW_SIZE + visibleMargin, candidate.y)
    );
    return candidate;
  } catch {
    return defaultWindowBounds();
  }
}

async function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { x, y } = mainWindow.getBounds();
  try {
    await fs.writeFile(windowStatePath(), JSON.stringify({ x, y }), 'utf8');
  } catch (error) {
    writeLog('WARN', `窗口位置保存失败: ${error.message}`);
  }
}

function scheduleSaveWindowBounds() {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => {
    saveBoundsTimer = null;
    saveWindowBounds();
  }, 350);
}

async function resetWindowPosition() {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
  const bounds = defaultWindowBounds();
  mainWindow.setBounds(bounds, true);
  await saveWindowBounds();
  syncHomeBounds();
  return { ok: true };
}

function repairWindowGeometry() {
  if (!mainWindow || mainWindow.isDestroyed() || repairingGeometry) return;
  repairingGeometry = true;
  try {
    const current = mainWindow.getBounds();
    const { workArea } = screen.getDisplayMatching(current);
    const visibleMargin = 48;
    const repaired = {
      x: Math.min(
        workArea.x + workArea.width - visibleMargin,
        Math.max(workArea.x - WINDOW_SIZE + visibleMargin, Math.round(current.x))
      ),
      y: Math.min(
        workArea.y + workArea.height - visibleMargin,
        Math.max(workArea.y - WINDOW_SIZE + visibleMargin, Math.round(current.y))
      ),
      width: WINDOW_SIZE,
      height: WINDOW_SIZE
    };
    if (
      current.x !== repaired.x ||
      current.y !== repaired.y ||
      current.width !== repaired.width ||
      current.height !== repaired.height
    ) {
      mainWindow.setBounds(repaired, false);
      writeLog('INFO', `窗口尺寸已自动修复: ${JSON.stringify(repaired)}`);
    }
  } catch (error) {
    writeLog('WARN', `窗口尺寸自动修复失败: ${error.message}`);
  } finally {
    repairingGeometry = false;
  }
}

function clampDraggedBounds(x, y) {
  const point = {
    x: Math.round(Math.max(-1000000, Math.min(1000000, x))),
    y: Math.round(Math.max(-1000000, Math.min(1000000, y)))
  };
  const { workArea } = screen.getDisplayNearestPoint(point);
  const visibleMargin = 48;
  return {
    x: Math.min(
      workArea.x + workArea.width - visibleMargin,
      Math.max(workArea.x - WINDOW_SIZE + visibleMargin, point.x)
    ),
    y: Math.min(
      workArea.y + workArea.height - visibleMargin,
      Math.max(workArea.y - WINDOW_SIZE + visibleMargin, point.y)
    ),
    width: WINDOW_SIZE,
    height: WINDOW_SIZE
  };
}

function endWindowDrag() {
  if (windowDragTimer) clearInterval(windowDragTimer);
  if (windowDragTimeout) clearTimeout(windowDragTimeout);
  const wasDragging = Boolean(windowDragOrigin);
  windowDragTimer = null;
  windowDragTimeout = null;
  windowDragOrigin = null;
  if (!wasDragging) return;
  repairWindowGeometry();
  if ([HOME_PHASE.RETURNING, HOME_PHASE.ENTERING_HOME].includes(petLifecycle)) {
    ensureHomeInsideWorkArea();
  }
  scheduleSaveWindowBounds();
  syncHomeBounds();
  if (mainWindow && !mainWindow.isDestroyed()) {
    writeLog('INFO', `窗口拖动结束: ${JSON.stringify(mainWindow.getBounds())}`);
  }
}

function beginWindowDrag() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  endWindowDrag();
  const cursor = screen.getCursorScreenPoint();
  const bounds = mainWindow.getBounds();
  windowDragOrigin = { cursor, bounds };
  writeLog('INFO', `窗口拖动开始: ${JSON.stringify(bounds)}`);

  windowDragTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !windowDragOrigin) {
      endWindowDrag();
      return;
    }
    const currentCursor = screen.getCursorScreenPoint();
    const next = clampDraggedBounds(
      windowDragOrigin.bounds.x + currentCursor.x - windowDragOrigin.cursor.x,
      windowDragOrigin.bounds.y + currentCursor.y - windowDragOrigin.cursor.y
    );
    try {
      mainWindow.setBounds(next, false);
    } catch (error) {
      writeLog('WARN', `窗口拖动失败: ${error.message}`);
      endWindowDrag();
    }
  }, 16);

  windowDragTimeout = setTimeout(endWindowDrag, 20000);
}

async function createWindow() {
  const bounds = await readWindowBounds();

  const options = {
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    x: bounds.x,
    y: bounds.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  };

  if (process.platform === 'darwin') {
    options.type = 'panel';
  }

  mainWindow = new BrowserWindow(options);
  installPersistentAlwaysOnTop(mainWindow);
  mainWindow.webContents.on('console-message', (_event, ...args) => {
    const details = args[0];
    const message =
      details && typeof details === 'object' ? details.message : args[1] || args[0];
    if (message) writeLog('INFO', `渲染器控制台: ${message}`);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeLog(
      'ERROR',
      `渲染进程退出: reason=${details.reason}, exitCode=${details.exitCode}`
    );
    if (
      details.reason !== 'clean-exit' &&
      mainWindow &&
      !mainWindow.isDestroyed() &&
      rendererRecoveryCount < 2
    ) {
      rendererRecoveryCount += 1;
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
      }, 350);
    }
  });
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      writeLog(
        'ERROR',
        `页面加载失败: ${errorCode} ${errorDescription} ${validatedURL}`
      );
    }
  );
  mainWindow.webContents.on('did-finish-load', () => {
    writeLog('INFO', '渲染页面加载完成');
    sendLifecycleTo(mainWindow);
    sendFormStateTo(mainWindow);
    setTimeout(async () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      try {
        const health = await mainWindow.webContents.executeJavaScript(`({
          ready: Boolean(window.__NIULAI_RENDERER_READY__),
          status: document.getElementById('status')?.textContent || '',
          errors: Array.isArray(window.__NIULAI_BOOT_ERRORS__)
            ? window.__NIULAI_BOOT_ERRORS__.slice(-5)
            : []
        })`);
        writeLog('INFO', `渲染健康检查: ${JSON.stringify(health)}`);
      } catch (error) {
        writeLog('ERROR', `渲染健康检查失败: ${error?.stack || error}`);
      }
    }, 8500);
    setTimeout(() => {
      rendererRecoveryCount = 0;
    }, 15000);
  });
  mainWindow.on('unresponsive', () => writeLog('WARN', '窗口暂时无响应'));
  mainWindow.on('responsive', () => writeLog('INFO', '窗口已恢复响应'));
  mainWindow.on('resize', repairWindowGeometry);
  const handleHomeMoved = () => {
    repairWindowGeometry();
    scheduleSaveWindowBounds();
    syncHomeBounds();
  };
  mainWindow.on('move', handleHomeMoved);
  mainWindow.on('moved', handleHomeMoved);

  if (process.platform === 'darwin') {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  const mainQuery = {};
  if (!app.isPackaged && process.argv.includes('--debug-actions')) mainQuery.debugActions = '1';
  if (!app.isPackaged && process.argv.includes('--debug-market')) mainQuery.debugMarket = '1';
  if (
    !app.isPackaged &&
    (CAPTURE_ACTION?.startsWith('fx-') || ['featuresummary', 'connectionqa'].includes(CAPTURE_ACTION))
  ) mainQuery.debugFx = '1';
  mainWindow.loadFile('index.html', { query: mainQuery });
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      repairWindowGeometry();
      syncHomeBounds();
      mainWindow.show();
      if (process.argv.includes('--demo')) runDemoSequence();
      if (CAPTURE_PREVIEW) {
        if (['CLOSED', 'BULLISH', 'BEARISH'].includes(CAPTURE_STATE)) {
          setTimeout(() => {
            const sample =
              CAPTURE_STATE === 'BULLISH'
                ? [3500.88, CAPTURE_EXTREME ? 3.68 : 1.28]
                : CAPTURE_STATE === 'BEARISH'
                  ? [3388.66, CAPTURE_EXTREME ? -3.66 : -1.36]
                  : [0, 0];
            sendDemoState(CAPTURE_STATE, sample[0], sample[1]);
          }, 250);
        }
        if (CAPTURE_SETTINGS) {
          setTimeout(() => {
            mainWindow?.webContents
              .executeJavaScript(
                "document.getElementById('settings-toggle')?.click()"
              )
              .catch(() => {});
          }, 500);
        }
        if (CAPTURE_QUICK) {
          setTimeout(() => {
            mainWindow?.webContents
              .executeJavaScript(
                "document.getElementById('quote-card')?.click()"
              )
              .catch(() => {});
          }, 500);
        }
        if (CAPTURE_POSITION) {
          setTimeout(() => {
            mainWindow?.webContents
              .executeJavaScript(`
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-symbol').value = 'sh000001';
                document.getElementById('setting-cost').value = '3499.63';
                document.getElementById('setting-shares').value = '1000';
                document.getElementById('settings-form')?.requestSubmit();
              `)
              .catch(() => {});
          }, 650);
        }
        if (CAPTURE_ACTION) {
          setTimeout(() => {
            const actionScript = {
              incense: "document.getElementById('action-incense')?.click()",
              bullfeed: "document.getElementById('action-bull-feed')?.click()",
              bearfeed: "document.getElementById('action-bear-feed')?.click()",
              rage: `
                const layer = document.getElementById('interaction-layer');
                for (let i = 0; i < 3; i += 1) {
                  layer?.dispatchEvent(new PointerEvent('pointerup', {
                    clientX: 150,
                    clientY: 165,
                    bubbles: true
                  }));
                }
              `,
              wheel: `
                document.getElementById('interaction-layer')?.dispatchEvent(
                  new WheelEvent('wheel', {
                    clientX: 150,
                    clientY: 165,
                    deltaY: 120,
                    bubbles: true,
                    cancelable: true
                  })
                )
              `,
              quickenter: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-symbol').value = 'sz399006';
                document.getElementById('settings-form')?.requestSubmit()
              `,
              stockpicker: `
                document.getElementById('settings-toggle')?.click();
                const symbol = document.getElementById('setting-symbol');
                symbol.value = 'sh600519';
                symbol.dispatchEvent(new Event('input', { bubbles: true }));
                symbol.dataset.code = 's_sh600519';
                symbol.dataset.name = '贵州茅台';
                document.getElementById('setting-cost').value = '1650';
                document.getElementById('setting-shares').value = '100';
                document.getElementById('setting-save-stock').checked = true;
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => {
                  document.getElementById('settings-toggle')?.click();
                  const nextSymbol = document.getElementById('setting-symbol');
                  nextSymbol.value = 'hk00700';
                  nextSymbol.dispatchEvent(new Event('input', { bubbles: true }));
                  nextSymbol.dataset.code = 'rt_hk00700';
                  nextSymbol.dataset.name = '腾讯控股';
                  document.getElementById('setting-cost').value = '420';
                  document.getElementById('setting-shares').value = '200';
                  document.getElementById('setting-save-stock').checked = true;
                  document.getElementById('settings-form')?.requestSubmit();
                  setTimeout(() => document.getElementById('quote-card')?.click(), 800);
                }, 800)
              `,
              marketsearch: `
                document.getElementById('settings-toggle')?.click();
                const searchInput = document.getElementById('setting-symbol');
                searchInput.value = '腾讯';
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                document.getElementById('stock-search-button')?.click()
              `,
              featurepanel: `
                document.getElementById('settings-toggle')?.click();
                setTimeout(() => document.getElementById('settings-features')?.click(), 280)
              `,
              settingsperformance: `
                document.getElementById('settings-toggle')?.click();
                setTimeout(() => {
                  const groups = [...document.querySelectorAll('#settings-panel .setting-group')];
                  groups.forEach((group, index) => { group.open = index === 8; });
                  const powerSave = document.getElementById('setting-power-save');
                  if (powerSave) {
                    powerSave.checked = true;
                    powerSave.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                  groups[8]?.scrollIntoView({ block: 'start' });
                }, 280)
              `,
              settingsroundtrip: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-symbol').value = 'sh000001';
                document.getElementById('setting-roaming-frequency').value = '137';
                document.getElementById('setting-auto-home').checked = false;
                document.getElementById('setting-max-fps').value = '45';
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => {
                  document.getElementById('settings-toggle')?.click();
                  const afterSave = {
                    roamingFrequency: document.getElementById('setting-roaming-frequency')?.value,
                    autoHome: document.getElementById('setting-auto-home')?.checked,
                    maxFps: document.getElementById('setting-max-fps')?.value
                  };
                  document.getElementById('settings-reset')?.click();
                  document.getElementById('settings-cancel')?.click();
                  document.getElementById('settings-toggle')?.click();
                  const afterCancel = {
                    roamingFrequency: document.getElementById('setting-roaming-frequency')?.value,
                    autoHome: document.getElementById('setting-auto-home')?.checked,
                    maxFps: document.getElementById('setting-max-fps')?.value
                  };
                  document.body.dataset.settingsQa = JSON.stringify({ afterSave, afterCancel });
                }, 900)
              `,
              modelqa: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = false;
                document.getElementById('setting-power-save').checked = false;
                document.getElementById('settings-form')?.requestSubmit();
              `,
              fallbackqa: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = false;
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => {
                  document.querySelector('#scene canvas')?.dispatchEvent(
                    new Event('webglcontextlost', { cancelable: true })
                  );
                }, 2300)
              `,
              audiobull: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '2d';
                document.getElementById('setting-sound').checked = true;
                document.getElementById('setting-volume').value = '100';
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.__NIULAI_QA_PLAY_VOICE__?.(), 2600)
              `,
              audiobear: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '2d';
                document.getElementById('setting-sound').checked = true;
                document.getElementById('setting-volume').value = '100';
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.__NIULAI_QA_PLAY_VOICE__?.(), 2600)
              `,
              perf60: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = false;
                document.getElementById('setting-power-save').checked = false;
                document.getElementById('setting-max-fps').value = '60';
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.__NIULAI_RESET_QA_METRICS__?.(), 1000)
              `,
              perf30: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = false;
                document.getElementById('setting-power-save').checked = true;
                document.getElementById('setting-max-fps').value = '60';
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.__NIULAI_RESET_QA_METRICS__?.(), 1000)
              `,
              perfsleep: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '2d';
                document.getElementById('setting-power-save').checked = true;
                document.getElementById('setting-max-fps').value = '60';
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.__NIULAI_RESET_QA_METRICS__?.(), 1000)
              `,
              perf3dsleep: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = false;
                document.getElementById('setting-power-save').checked = false;
                document.getElementById('setting-max-fps').value = '60';
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.__NIULAI_RESET_QA_METRICS__?.(), 1000)
              `,
              perflong: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = true;
                document.getElementById('setting-power-save').checked = true;
                document.getElementById('setting-max-fps').value = '60';
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.__NIULAI_RESET_QA_METRICS__?.(), 1000)
              `,
              connectionqa: `
                window.__NIULAI_RUN_MARKET_SCENARIO__?.('DISCONNECTED');
                setTimeout(() => window.__NIULAI_RUN_MARKET_SCENARIO__?.('BULLISH'), 1500)
              `,
              crashrecovery: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '2d';
                document.getElementById('settings-form')?.requestSubmit()
              `,
              featurepersist: `
                document.getElementById('settings-toggle')?.click();
                setTimeout(() => {
                  document.getElementById('settings-features')?.click();
                  document.getElementById('feature-emotion').checked = true;
                  document.getElementById('feature-summary').checked = true;
                  document.getElementById('trigger-type').value = 'price';
                  document.getElementById('trigger-value').value = '3500';
                  document.getElementById('trigger-add')?.click();
                  document.getElementById('feature-form')?.requestSubmit();
                  setTimeout(() => {
                    document.getElementById('settings-toggle')?.click();
                    document.getElementById('settings-features')?.click();
                  }, 500);
                }, 280)
              `,
              featuresummary: `
                localStorage.removeItem('niulai:daily-session-v1');
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '2d';
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => {
                  document.getElementById('settings-toggle')?.click();
                  document.getElementById('settings-features')?.click();
                  document.getElementById('feature-summary').checked = true;
                  document.getElementById('feature-form')?.requestSubmit();
                  window.__NIULAI_RESET_DAILY_SESSION__?.();
                  window.__NIULAI_RUN_MARKET_SCENARIO__?.('RAPID_RISE');
                  setTimeout(() => window.__NIULAI_RUN_MARKET_SCENARIO__?.('CLOSED'), 900);
                }, 280)
              `,
              shortclose: `
                document.getElementById('close')?.click()
              `,
              exitconfirm: `
                document.getElementById('close')?.click()
              `,
              exitcancel: `
                document.getElementById('close')?.click();
                setTimeout(() => document.getElementById('exit-cancel')?.click(), 260)
              `,
              exitaccept: `
                document.getElementById('close')?.click();
                setTimeout(() => document.getElementById('exit-accept')?.click(), 260)
              `,
              twod: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '2d';
                document.getElementById('settings-form')?.requestSubmit()
              `,
              threed: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('settings-form')?.requestSubmit()
              `,
              roamingtoggle: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => {
                  document.getElementById('settings-toggle')?.click();
                  document.getElementById('setting-display-mode').value = '2d';
                  document.getElementById('settings-form')?.requestSubmit();
                }, 1800)
              `,
              roaminginfra: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = true;
                document.getElementById('settings-form')?.requestSubmit()
              `,
              quotefollow: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = true;
                document.getElementById('setting-quote').checked = true;
                document.getElementById('setting-quote-follow').checked = true;
                document.getElementById('setting-cost').value = '3499.63';
                document.getElementById('setting-shares').value = '1000';
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => document.getElementById('quote-card')?.focus(), 4300)
              `,
              automorph: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = 'auto';
                document.getElementById('setting-power-save').checked = false;
                document.getElementById('setting-allow-roaming').checked = true;
                document.getElementById('setting-auto-continue').checked = false;
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.desktopPet?.requestImportantMarketPerformance?.({
                  type: 'RAPID_RISE',
                  direction: 1,
                  deltaPct: 1.2
                }, {}), 1100)
              `,
              automorphreturn: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = 'auto';
                document.getElementById('setting-power-save').checked = false;
                document.getElementById('setting-allow-roaming').checked = true;
                document.getElementById('setting-auto-continue').checked = false;
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.desktopPet?.requestImportantMarketPerformance?.({
                  type: 'RAPID_RISE',
                  direction: 1,
                  deltaPct: 1.2
                }, {}), 1100)
              `,
              homeflow: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = true;
                document.getElementById('settings-form')?.requestSubmit()
              `,
              saferecovery: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = true;
                document.getElementById('settings-form')?.requestSubmit()
              `,
              threedincense: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => document.getElementById('action-incense')?.click(), 1800)
              `,
              help: `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('settings-help')?.click()
              `,
              marketdebug: `
                const panel = document.getElementById('market-debug-panel');
                const scenario = panel?.querySelector('[data-role=scenario]');
                if (scenario) scenario.value = 'RAPID_RISE';
                panel?.querySelector('[data-role=run]')?.click()
              `,
              'fx-up': `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = false;
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.__NIULAI_RUN_MARKET_SCENARIO__?.('BULLISH'), 1900)
              `,
              'fx-rapid-rise': `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = false;
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.__NIULAI_RUN_MARKET_SCENARIO__?.('RAPID_RISE'), 1900)
              `,
              'fx-down': `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = false;
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.__NIULAI_RUN_MARKET_SCENARIO__?.('BEARISH'), 1900)
              `,
              'fx-rapid-fall': `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = false;
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.__NIULAI_RUN_MARKET_SCENARIO__?.('RAPID_FALL'), 1900)
              `,
              'fx-limit-up': `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = false;
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.__NIULAI_RUN_MARKET_SCENARIO__?.('LIMIT_UP'), 1900)
              `,
              'fx-limit-down': `
                document.getElementById('settings-toggle')?.click();
                document.getElementById('setting-display-mode').value = '3d';
                document.getElementById('setting-allow-roaming').checked = false;
                document.getElementById('settings-form')?.requestSubmit();
                setTimeout(() => window.__NIULAI_RUN_MARKET_SCENARIO__?.('LIMIT_DOWN'), 1900)
              `
            }[CAPTURE_ACTION];
            if (actionScript) {
              mainWindow?.webContents.executeJavaScript(actionScript).catch(() => {});
            }
            if (CAPTURE_ACTION?.startsWith('fx-')) {
              setTimeout(() => {
                const falling = ['fx-down', 'fx-rapid-fall', 'fx-limit-down'].includes(CAPTURE_ACTION);
                sendDemoState(falling ? 'BEARISH' : 'BULLISH', falling ? 97.6 : 102.4, falling ? -2.4 : 2.4);
              }, 300);
            }
            if (CAPTURE_ACTION === 'roaminginfra') {
              setTimeout(async () => {
                if (!mainWindow || mainWindow.isDestroyed()) return;
                const before = mainWindow.getBounds();
                mainWindow.setBounds({ ...before, x: before.x - 36, y: before.y - 24 }, false);
                syncHomeBounds();
                try {
                  const overlayHome = roamingWindow && !roamingWindow.isDestroyed()
                    ? await roamingWindow.webContents.executeJavaScript(`({
                        x: Number(document.body.dataset.homeX),
                        y: Number(document.body.dataset.homeY)
                      })`)
                    : null;
                  writeLog('INFO', `巡游基础架构检查: ${JSON.stringify({
                    home: getHomeBounds(),
                    overlayHome,
                    roaming: roamingWindow?.getBounds?.() || null,
                    displays: screen.getAllDisplays().map((display) => ({
                      id: display.id,
                      scaleFactor: display.scaleFactor,
                      workArea: display.workArea
                    })),
                    mousePassthrough: roamingIgnoringMouse
                  })}`);
                } catch (error) {
                  writeLog('ERROR', `巡游基础架构检查失败: ${error?.stack || error}`);
                }
              }, 4300);
              setTimeout(() => {
                const result = recallRoamingWindow();
                writeLog('INFO', `巡游召回接口检查: ${JSON.stringify(result)}`);
              }, 6500);
              setTimeout(() => {
                writeLog('INFO', `巡游平滑回家结果: ${JSON.stringify({
                  home: getHomeBounds(),
                  roaming: roamingWindow?.getBounds?.() || null,
                  behavior: roamingBehavior?.snapshot?.() || null
                })}`);
              }, 12000);
            }
            if (CAPTURE_ACTION === 'settingsroundtrip') {
              setTimeout(async () => {
                try {
                  const result = await mainWindow?.webContents.executeJavaScript(
                    "document.body.dataset.settingsQa || ''"
                  );
                  const parsed = JSON.parse(result || '{}');
                  const passed =
                    parsed.afterSave?.roamingFrequency === '137' &&
                    parsed.afterSave?.autoHome === false &&
                    parsed.afterSave?.maxFps === '45' &&
                    JSON.stringify(parsed.afterSave) === JSON.stringify(parsed.afterCancel);
                  writeLog('INFO', `设置保存/取消/恢复默认检查: ${passed ? '通过' : '失败'} ${result}`);
                } catch (error) {
                  writeLog('ERROR', `设置保存/取消检查异常: ${error?.stack || error}`);
                }
              }, 3800);
            }
            if (['modelqa', 'fallbackqa', 'audiobull', 'audiobear', 'connectionqa'].includes(CAPTURE_ACTION)) {
              if (CAPTURE_ACTION === 'audiobull') {
                setTimeout(() => sendDemoState('BULLISH', 3500.88, 1.28), 350);
              } else if (CAPTURE_ACTION === 'audiobear') {
                setTimeout(() => sendDemoState('BEARISH', 3388.66, -1.36), 350);
              }
              setTimeout(async () => {
                try {
                  const sample = await collectQaSample(CAPTURE_ACTION);
                  await writeQaArtifact(`qa-${CAPTURE_ACTION}.json`, sample);
                } catch (error) {
                  writeLog('ERROR', `${CAPTURE_ACTION} 检查失败: ${error?.stack || error}`);
                }
              }, 6500);
            }
            if (['perf60', 'perf30', 'perfsleep', 'perf3dsleep'].includes(CAPTURE_ACTION)) {
              if (!['perfsleep', 'perf3dsleep'].includes(CAPTURE_ACTION)) {
                setTimeout(() => sendDemoState('BULLISH', 3500.88, 1.28), 350);
              } else {
                setTimeout(() => sendDemoState('CLOSED', 0, 0), 350);
              }
              setTimeout(async () => {
                const sample = await collectQaSample(CAPTURE_ACTION);
                await writeQaArtifact(`performance-${CAPTURE_ACTION}.json`, sample);
              }, 9500);
            }
            if (CAPTURE_ACTION === 'perflong') {
              setTimeout(() => sendDemoState('BULLISH', 3500.88, 1.28), 350);
              const samples = [];
              for (const seconds of [5, 15, 25, 35, 45, 55, 65]) {
                setTimeout(async () => {
                  samples.push(await collectQaSample(`perflong-${seconds}s`));
                  if (seconds === 65) {
                    await writeQaArtifact('performance-long-run.json', {
                      durationSeconds: 65,
                      samples
                    });
                  }
                }, seconds * 1000);
              }
            }
            if (CAPTURE_ACTION === 'crashrecovery') {
              setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                  writeLog('WARN', '开始QA渲染进程崩溃注入');
                  mainWindow.webContents.forcefullyCrashRenderer();
                }
              }, 3300);
            }
            if (CAPTURE_ACTION === 'quotefollow') {
              setTimeout(() => sendDemoState('BULLISH', 3500.88, 1.28), 350);
              setTimeout(() => {
                roamingWindow?.webContents
                  .executeJavaScript("document.getElementById('quote-card')?.focus()")
                  .catch(() => {});
              }, 4700);
              setTimeout(() => {
                roamingWindow?.webContents
                  .executeJavaScript("document.getElementById('quote-card')?.click()")
                  .catch(() => {});
              }, 5400);
              setTimeout(async () => {
                try {
                  const opened = await mainWindow?.webContents.executeJavaScript(
                    "document.getElementById('stock-detail-panel')?.classList.contains('open')"
                  );
                  writeLog('INFO', `随身行情牌点击联动检查: ${opened === true ? '通过' : '失败'}`);
                  await roamingWindow?.webContents.executeJavaScript(
                    "document.getElementById('quote-card')?.focus()"
                  );
                } catch (error) {
                  writeLog('ERROR', `随身行情牌点击联动检查异常: ${error?.stack || error}`);
                }
              }, 6000);
            }
            if (['automorph', 'automorphreturn'].includes(CAPTURE_ACTION)) {
              setTimeout(() => sendDemoState('BULLISH', 3500.88, 1.28), 250);
              setTimeout(async () => {
                try {
                  const homeVisibility = await mainWindow?.webContents.executeJavaScript(`({
                    spriteHidden: document.getElementById('sprite-mode')?.getAttribute('aria-hidden'),
                    sceneVisibility: document.getElementById('scene')?.style.visibility,
                    activeForm: document.body.dataset.activeForm,
                    formState: document.body.dataset.formState
                  })`);
                  const roamingVisibility = roamingWindow && !roamingWindow.isDestroyed()
                    ? await roamingWindow.webContents.executeJavaScript(`({
                        spriteHidden: document.getElementById('sprite-mode')?.getAttribute('aria-hidden'),
                        sceneVisibility: document.getElementById('scene')?.style.visibility,
                        activeForm: document.body.dataset.activeForm,
                        formState: document.body.dataset.formState
                      })`)
                    : null;
                  writeLog('INFO', `双形态互斥检查: ${JSON.stringify({
                    morph: formMorphStateMachine.snapshot(),
                    lifecycle: petLifecycle,
                    homeVisibility,
                    roamingVisibility
                  })}`);
                } catch (error) {
                  writeLog('ERROR', `双形态互斥检查异常: ${error?.stack || error}`);
                }
              }, 5000);
              if (CAPTURE_ACTION === 'automorphreturn') {
                setTimeout(() => {
                  writeLog('INFO', `自动3D演出返家检查: ${JSON.stringify({
                    morph: formMorphStateMachine.snapshot(),
                    lifecycle: petLifecycle,
                    roamingExists: Boolean(roamingWindow && !roamingWindow.isDestroyed()),
                    roamingVisible: Boolean(roamingWindow?.isVisible?.())
                  })}`);
                }, 16500);
              }
            }
            if (CAPTURE_ACTION === 'homeflow') {
              setTimeout(() => sendDemoState('BULLISH', 3500.88, 1.28), 350);
              setTimeout(() => {
                if (!roamingWindow || roamingWindow.isDestroyed()) return;
                const home = getHomeBounds();
                const display = displayForBounds(home);
                const start = clampBoundsToWorkArea(
                  { ...home, x: home.x - 190, y: home.y - 90 },
                  display.workArea,
                  WINDOW_SIZE
                );
                setRoamingBounds(start.x, start.y, { displayId: display.id });
                roamingBehavior?.setPosition(start, display.id, { replan: true });
                setPetLifecycle(HOME_PHASE.ROAMING, { reason: 'capture-homeflow-start' });
              }, 3600);
              setTimeout(() => sendDemoState('CLOSED', 0, 0), 4500);
              setTimeout(() => {
                if (!mainWindow || mainWindow.isDestroyed()) return;
                const moved = mainWindow.getBounds();
                mainWindow.setBounds({ ...moved, x: moved.x - 24, y: moved.y - 16 }, false);
                syncHomeBounds();
              }, 5600);
              setTimeout(() => {
                writeLog('INFO', `完整回家流程检查: ${JSON.stringify({
                  lifecycle: petLifecycle,
                  history: lifecycleHistory.slice(-12),
                  home: getHomeBounds(),
                  roaming: roamingWindow?.getBounds?.() || null,
                  roamingVisible: Boolean(roamingWindow?.isVisible?.()),
                  behavior: roamingBehavior?.snapshot?.() || null
                })}`);
              }, 15000);
            }
            if (CAPTURE_ACTION === 'saferecovery') {
              setTimeout(() => sendDemoState('BULLISH', 3500.88, 1.28), 350);
              setTimeout(() => recoverAfterSystemChange('capture-simulated-display-change'), 3900);
              setTimeout(() => {
                writeLog('INFO', `安全恢复流程检查: ${JSON.stringify({
                  lifecycle: petLifecycle,
                  history: lifecycleHistory.slice(-8),
                  home: getHomeBounds(),
                  roaming: roamingWindow?.getBounds?.() || null,
                  roamingVisible: Boolean(roamingWindow?.isVisible?.()),
                  behavior: roamingBehavior?.snapshot?.() || null
                })}`);
              }, 7000);
            }
          }, 1450);
        }
        setTimeout(() => {
          capturePreview().catch((error) => {
            writeLog('ERROR', `预览截图失败: ${error?.stack || error}`);
            app.exit(1);
          });
        }, CAPTURE_ACTION === 'fx-up' || CAPTURE_ACTION === 'fx-down'
          ? 3800
          : CAPTURE_ACTION === 'fx-rapid-rise' || CAPTURE_ACTION === 'fx-limit-up'
            ? 5700
            : CAPTURE_ACTION === 'fx-rapid-fall' || CAPTURE_ACTION === 'fx-limit-down'
              ? 6050
        : CAPTURE_ACTION === 'homeflow'
          ? 17000
          : CAPTURE_ACTION === 'saferecovery'
            ? 9500
          : CAPTURE_ACTION === 'roaminginfra'
            ? 16000
            : CAPTURE_ACTION === 'quotefollow'
              ? 7200
            : CAPTURE_ACTION === 'automorph'
              ? 6500
            : CAPTURE_ACTION === 'automorphreturn'
              ? 18000
            : CAPTURE_ACTION === 'crashrecovery'
              ? 16000
            : CAPTURE_ACTION === 'perflong'
              ? 70000
            : CAPTURE_STATE
              ? 8500
              : 12000);
      }
    }
  });
  mainWindow.on('closed', () => {
    endWindowDrag();
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
    saveBoundsTimer = null;
    mainWindow = null;
  });
}

async function fetchQuoteResponse(url, referer) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS),
    headers: {
      Referer: referer,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36'
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  try {
    return new TextDecoder('gbk').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

async function fetchSinaQuote(symbol) {
  try {
    const sinaText = await fetchQuoteResponse(
      `${SINA_QUOTE_BASE_URL}${symbol}`,
      'https://finance.sina.com.cn/'
    );
    const sinaQuote = parseSinaQuote(sinaText, symbol);
    if (sinaQuote) return { ...sinaQuote, source: 'sina' };
    throw new Error('返回内容无法解析');
  } catch (sinaError) {
    writeLog('WARN', `新浪行情请求失败，切换备用源: ${sinaError.message}`);
    try {
      const tencentText = await fetchQuoteResponse(
        `${TENCENT_QUOTE_BASE_URL}${quoteProviderSymbol(symbol, 'tencent')}`,
        'https://gu.qq.com/'
      );
      const tencentQuote = parseTencentQuote(tencentText, symbol);
      if (tencentQuote) return tencentQuote;
      throw new Error('返回内容无法解析');
    } catch (tencentError) {
      writeLog('WARN', `腾讯备用行情请求失败: ${tencentError.message}`);
      return null;
    }
  }
}

function startMarketPoller() {
  stopMarketPoller();

  const tick = async () => {
    const requestedSymbol = selectedSymbol;
    const quote = await fetchSinaQuote(requestedSymbol);
    if (requestedSymbol !== selectedSymbol) return;
    broadcastToRenderers(
      'market:quote',
      quote ? { ok: true, quote } : { ok: false, quote: null }
    );
    const delay =
      POLL_MIN_MS + Math.random() * (POLL_MAX_MS - POLL_MIN_MS);
    pollTimer = setTimeout(tick, delay);
  };

  pollTimer = setTimeout(tick, 800);
}

function stopMarketPoller() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

ipcMain.on('app:quit', () => {
  writeLog('INFO', '收到用户确认退出指令');
  app.quit();
});

ipcMain.on('renderer:log', (_event, payload) => {
  const level = String(payload?.level || 'info').toUpperCase();
  const safeLevel = ['INFO', 'WARN', 'ERROR'].includes(level) ? level : 'INFO';
  writeLog(safeLevel, `渲染器: ${String(payload?.message || '')}`);
});

ipcMain.on('renderer:3d-error', (_event, payload) => {
  const message = String(payload?.message || '未知 3D 渲染错误');
  writeLog('ERROR', `3D 模式异常，自动回退 2D: ${message}`);
  clearAutoPerformanceTimer();
  formMorphStateMachine.fail3D('renderer-3d-error');
  petDisplayMode = FORM_MODE.TWO_D;
  roamingAllowed = false;
  destroyRoamingWindow();
  setPetLifecycle(HOME_PHASE.TWO_D, { reason: 'renderer-3d-error' });
  publishFormState({ fallbackMessage: message });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pet:force-2d', { message });
  }
});

ipcMain.on('roaming:set-mode', (event, payload) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
  const settings = payload?.settings || {};
  currentPetSettings = { ...currentPetSettings, ...settings };
  const previousFormState = formMorphStateMachine.snapshot();
  const formState = formMorphStateMachine.configure(currentPetSettings, roamingState);
  if (
    previousFormState.preferredMode !== formState.preferredMode ||
    formState.activeForm === FORM_MODE.TWO_D
  ) {
    clearAutoPerformanceTimer();
  }
  petDisplayMode = formState.activeForm;
  roamingAllowed = Boolean(
    petDisplayMode === FORM_MODE.THREE_D && currentPetSettings.allowRoaming !== false
  );
  roamingSpeed = Math.min(
    2,
    Math.max(0.3, Number(currentPetSettings.roamingSpeed) || 1)
  );
  roamingCrossDisplay = currentPetSettings.crossDisplayRoaming === true;
  roamingPowerSave = currentPetSettings.powerSave !== false;

  if (petDisplayMode === FORM_MODE.THREE_D && roamingAllowed) {
    createRoamingWindow({
      ...currentPetSettings,
      displayMode: FORM_MODE.THREE_D,
      preferredDisplayMode: formMorphStateMachine.preferredMode
    });
    if (roamingState === 'CLOSED') {
      if (![HOME_PHASE.HOME_SLEEPING, HOME_PHASE.HOME_SLEEP_ENTER].includes(petLifecycle)) {
        completeHomeTransfer('roaming-enabled-while-closed');
      } else {
        setPetLifecycle(HOME_PHASE.HOME_SLEEPING, { reason: 'roaming-enabled-while-closed' });
      }
    } else {
      beginWakeFromHome('roaming-enabled-while-open');
    }
    publishFormState();
    return;
  }

  clearLifecycleTimer();
  destroyRoamingWindow();
  if (petDisplayMode === FORM_MODE.THREE_D) {
    if (roamingState === 'CLOSED') completeHomeTransfer('roaming-disabled');
    else setPetLifecycle(HOME_PHASE.HOME_AWAKE, { reason: 'roaming-disabled' });
  } else {
    setPetLifecycle(HOME_PHASE.TWO_D, { reason: 'display-mode-2d' });
  }
  publishFormState();
});

ipcMain.on('pet:important-market', (event, payload) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
  if (roamingState === 'CLOSED') return;
  const type = String(payload?.event?.type || '');
  const marketEvent = {
    type,
    direction: Number(payload?.event?.direction) || 0,
    thresholdPct: Number(payload?.event?.thresholdPct) || 0,
    deltaPct: Number(payload?.event?.deltaPct) || 0
  };
  const result = formMorphStateMachine.requestAutoPerformance(marketEvent);
  if (!result.accepted) {
    writeLog('INFO', `自动3D行情演出未启动: ${type} (${result.reason})`);
    return;
  }
  currentPetSettings = { ...currentPetSettings, ...(payload?.settings || {}) };
  petDisplayMode = FORM_MODE.THREE_D;
  roamingAllowed = true;
  createRoamingWindow({
    ...currentPetSettings,
    displayMode: FORM_MODE.THREE_D,
    preferredDisplayMode: FORM_MODE.AUTO
  });
  publishFormState({ performanceEvent: marketEvent });
  beginWakeFromHome(`auto-${type.toLowerCase()}`);
});

ipcMain.on('pet:auto-performance-complete', (event, payload) => {
  if (!roamingWindow || roamingWindow.isDestroyed() || event.sender !== roamingWindow.webContents) return;
  const eventType = String(payload?.eventType || '');
  const pendingType = String(formMorphStateMachine.snapshot().pendingEvent?.type || '');
  if (eventType && pendingType && eventType !== pendingType) return;
  if (finishAutoPerformance(`animation-${eventType || 'complete'}`)) {
    writeLog('INFO', `自动3D行情演出动作完成: ${eventType || 'unknown'}`);
  }
});

ipcMain.on('roaming:set-state', (_event, state) => {
  if (['CLOSED', 'FLAT', 'BULLISH', 'BEARISH', 'DISCONNECTED'].includes(state)) {
    const previous = roamingState;
    roamingState = state;
    if (state === previous) return;
    if (state === 'CLOSED') {
      clearAutoPerformanceTimer();
      formMorphStateMachine.marketClosed();
      publishFormState();
      if (petDisplayMode === FORM_MODE.THREE_D) beginReturnHome('market-closed');
    } else if (previous === 'CLOSED' && state !== 'CLOSED' && petDisplayMode === FORM_MODE.THREE_D) {
      beginWakeFromHome('market-open');
    }
  }
});

ipcMain.on('roaming:set-hit-region', (event, payload) => {
  if (!roamingWindow || roamingWindow.isDestroyed() || event.sender !== roamingWindow.webContents) return;
  const candidates = Array.isArray(payload?.regions)
    ? payload.regions
    : Array.isArray(payload) ? payload : [payload];
  const nextRegions = candidates.slice(0, 4).map((region) => {
    const x = Number(region?.x);
    const y = Number(region?.y);
    const width = Number(region?.width);
    const height = Number(region?.height);
    if (![x, y, width, height].every(Number.isFinite) || width < 1 || height < 1) return null;
    const safeX = Math.min(WINDOW_SIZE - 1, Math.max(0, Math.round(x)));
    const safeY = Math.min(WINDOW_SIZE - 1, Math.max(0, Math.round(y)));
    return {
      x: safeX,
      y: safeY,
      width: Math.min(WINDOW_SIZE - safeX, Math.round(width)),
      height: Math.min(WINDOW_SIZE - safeY, Math.round(height))
    };
  }).filter(Boolean);
  if (nextRegions.length > 0) roamingHitRegions = nextRegions;
});

ipcMain.on('roaming:drag-begin', (event) => {
  if (roamingWindow && !roamingWindow.isDestroyed() && event.sender === roamingWindow.webContents) {
    beginRoamingDrag();
  }
});

ipcMain.on('roaming:drag-end', (event) => {
  if (roamingWindow && !roamingWindow.isDestroyed() && event.sender === roamingWindow.webContents) {
    endRoamingDrag();
  }
});

ipcMain.handle('roaming:recall', () => recallRoamingWindow());

ipcMain.handle('roaming:wake', () =>
  beginWakeFromHome('user-wake', { manual: true })
);

ipcMain.handle('roaming:diagnostics', () => ({
  homeBounds: getHomeBounds(),
  roamingBounds: roamingWindow && !roamingWindow.isDestroyed() ? roamingWindow.getBounds() : null,
  displays: screen.getAllDisplays().map((display) => ({
    id: display.id,
    scaleFactor: display.scaleFactor,
    bounds: display.bounds,
    workArea: display.workArea
  })),
  mousePassthrough: roamingIgnoringMouse,
  hitRegions: roamingHitRegions.map((region) => ({ ...region })),
  recalled: roamingRecalled,
  lifecycle: petLifecycle,
  lifecycleReason,
  returnDeadline,
  roamingVisible: Boolean(roamingWindow && !roamingWindow.isDestroyed() && roamingWindow.isVisible()),
  crossDisplay: roamingCrossDisplay,
  behavior: roamingBehavior?.snapshot?.() || null,
  lifecycleHistory: lifecycleHistory.slice(-20),
  formMorph: formMorphStateMachine.snapshot()
}));

ipcMain.on('pet:action', (event, action) => {
  if (action === 'quote-card-open') {
    if (mainWindow && !mainWindow.isDestroyed()) {
      repairWindowGeometry();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('pet:action', action);
    }
    return;
  }
  if (action === 'incense') {
    roamingBehavior?.pause(15, 'idle_look');
    if (roamingWindow && !roamingWindow.isDestroyed()) {
      const stoppedAt = roamingWindow.getBounds();
      writeLog('INFO', `3D 漫游上香停步: ${JSON.stringify(stoppedAt)}`);
      setTimeout(() => {
        if (!roamingWindow || roamingWindow.isDestroyed()) return;
        writeLog(
          'INFO',
          `3D 漫游上香朝向用户并保持原地: ${JSON.stringify(roamingWindow.getBounds())}`
        );
      }, 1200);
    }
  }
  broadcastToRenderers('pet:action', action, event.sender);
});

ipcMain.handle('window:reset-position', () => resetWindowPosition());

ipcMain.on('window:drag-begin', (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return;
  }
  beginWindowDrag();
});

ipcMain.on('window:drag-end', (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    return;
  }
  endWindowDrag();
});

ipcMain.handle('market:set-symbol', (_event, input) => {
  const normalized = normalizeMarketSymbol(input);
  if (!normalized) {
    return { ok: false, message: '请输入 A 股代码、港股代码（如 hk00700）或美股代码（如 AAPL）' };
  }
  selectedSymbol = normalized;
  startMarketPoller();
  return { ok: true, code: normalized, market: marketForSymbol(normalized) };
});

ipcMain.handle('market:search-symbols', async (_event, payload) => {
  const query = String(payload?.query || '').trim().slice(0, 40);
  const markets = normalizeMarketList(payload?.markets);
  if (!query) return { ok: true, results: [] };
  try {
    const text = await fetchQuoteResponse(
      `${TENCENT_SEARCH_BASE_URL}${encodeURIComponent(query)}`,
      'https://gu.qq.com/'
    );
    const results = parseTencentSuggestions(text, markets);
    const directCode = normalizeMarketSymbol(query, markets);
    if (directCode && !results.some((item) => item.code === directCode)) {
      results.unshift({
        code: directCode,
        name: query.toUpperCase(),
        market: marketForSymbol(directCode),
        displayCode: query.toUpperCase()
      });
    }
    return { ok: true, results: results.slice(0, 12) };
  } catch (error) {
    const directCode = normalizeMarketSymbol(query, markets);
    writeLog('WARN', `跨市场搜索失败: ${error.message}`);
    return {
      ok: Boolean(directCode),
      results: directCode ? [{
        code: directCode,
        name: query.toUpperCase(),
        market: marketForSymbol(directCode),
        displayCode: query.toUpperCase()
      }] : [],
      message: directCode ? '搜索服务暂不可用，已按代码识别' : '搜索服务暂不可用'
    };
  }
});

ipcMain.handle('market:open-external', async (_event, symbol) => {
  const url = externalQuoteUrl(symbol);
  if (!url) return { ok: false, message: '无法识别股票代码' };
  await shell.openExternal(url);
  return { ok: true, url };
});

function recoverAfterSystemChange(reason) {
  if (petDisplayMode !== '3d') {
    repairWindowGeometry();
    syncHomeBounds();
    return;
  }
  forceSafeHome(reason);
}

function recoverAndResumeIfOpen(reason) {
  recoverAfterSystemChange(reason);
  if (roamingState !== 'CLOSED' && petDisplayMode === '3d') {
    setTimeout(
      () => beginWakeFromHome(reason),
      HOME_TIMING.safeFadeMs + 80
    );
  }
}

function installSystemRecoveryHandlers() {
  powerMonitor.on('suspend', () => recoverAfterSystemChange('system-suspend'));
  powerMonitor.on('lock-screen', () => recoverAfterSystemChange('screen-locked'));
  powerMonitor.on('resume', () => {
    recoverAndResumeIfOpen('system-resume');
  });
  powerMonitor.on('unlock-screen', () => {
    recoverAndResumeIfOpen('screen-unlocked');
  });
  screen.on('display-removed', (_event, display) => {
    writeLog('WARN', `显示器已断开: ${display?.id ?? 'unknown'}`);
    recoverAndResumeIfOpen('display-removed');
  });
  screen.on('display-metrics-changed', (_event, display, metrics) => {
    writeLog('WARN', `显示参数变化: display=${display?.id ?? 'unknown'}, metrics=${metrics?.join(',') || ''}`);
    recoverAndResumeIfOpen('display-metrics-changed');
  });
}

app.whenReady().then(async () => {
  if (!HAS_SINGLE_INSTANCE_LOCK) return;
  initializeLogging();
  protocol.handle('pet', handlePetRequest);

  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  await createWindow();
  startMarketPoller();
  installSystemRecoveryHandlers();
  if (QA_AUTO_QUIT_MS > 0) {
    setTimeout(() => {
      writeLog('INFO', `QA自动退出 ${QA_AUTO_QUIT_MS}ms`);
      app.quit();
    }, QA_AUTO_QUIT_MS);
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
      startMarketPoller();
    }
  });
});

app.on('window-all-closed', () => {
  stopMarketPoller();
  app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  endWindowDrag();
  clearLifecycleTimer();
  clearAutoPerformanceTimer();
  destroyRoamingWindow();
  writeLog('INFO', '软件正在退出');
});
