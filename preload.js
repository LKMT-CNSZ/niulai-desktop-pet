const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopPet', {
  onQuote(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('market:quote', listener);
    return () => ipcRenderer.removeListener('market:quote', listener);
  },
  onDemo(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('demo:state', listener);
    return () => ipcRenderer.removeListener('demo:state', listener);
  },
  onRoamingSettings(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('roaming:settings', listener);
    return () => ipcRenderer.removeListener('roaming:settings', listener);
  },
  onHomeBounds(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('home:bounds', listener);
    return () => ipcRenderer.removeListener('home:bounds', listener);
  },
  onRoamingMotion(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('roaming:motion', listener);
    return () => ipcRenderer.removeListener('roaming:motion', listener);
  },
  onPetLifecycle(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('pet:lifecycle', listener);
    return () => ipcRenderer.removeListener('pet:lifecycle', listener);
  },
  onFormState(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('pet:form-state', listener);
    return () => ipcRenderer.removeListener('pet:form-state', listener);
  },
  onAutoPerformance(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('pet:auto-performance', listener);
    return () => ipcRenderer.removeListener('pet:auto-performance', listener);
  },
  onPetAction(callback) {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('pet:action', listener);
    return () => ipcRenderer.removeListener('pet:action', listener);
  },
  onForce2D(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('pet:force-2d', listener);
    return () => ipcRenderer.removeListener('pet:force-2d', listener);
  },
  selectSymbol(symbol) {
    return ipcRenderer.invoke('market:set-symbol', symbol);
  },
  searchSymbols(query, markets) {
    return ipcRenderer.invoke('market:search-symbols', { query, markets });
  },
  openExternalQuote(symbol) {
    return ipcRenderer.invoke('market:open-external', symbol);
  },
  report(level, message) {
    ipcRenderer.send('renderer:log', { level, message });
  },
  report3DError(message) {
    ipcRenderer.send('renderer:3d-error', { message });
  },
  setRoamingMode(enabled, settings) {
    ipcRenderer.send('roaming:set-mode', { enabled, settings });
  },
  setRoamingState(state) {
    ipcRenderer.send('roaming:set-state', state);
  },
  setRoamingHitRegion(region) {
    ipcRenderer.send('roaming:set-hit-region', region);
  },
  beginRoamingDrag() {
    ipcRenderer.send('roaming:drag-begin');
  },
  endRoamingDrag() {
    ipcRenderer.send('roaming:drag-end');
  },
  recallRoaming() {
    return ipcRenderer.invoke('roaming:recall');
  },
  wakeRoaming() {
    return ipcRenderer.invoke('roaming:wake');
  },
  getRoamingDiagnostics() {
    return ipcRenderer.invoke('roaming:diagnostics');
  },
  sendPetAction(action) {
    ipcRenderer.send('pet:action', action);
  },
  requestImportantMarketPerformance(event, settings) {
    ipcRenderer.send('pet:important-market', { event, settings });
  },
  completeAutoPerformance(eventType) {
    ipcRenderer.send('pet:auto-performance-complete', { eventType });
  },
  resetWindowPosition() {
    return ipcRenderer.invoke('window:reset-position');
  },
  beginWindowDrag() {
    ipcRenderer.send('window:drag-begin');
  },
  endWindowDrag() {
    ipcRenderer.send('window:drag-end');
  },
  quit() {
    ipcRenderer.send('app:quit');
  }
});
