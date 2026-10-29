import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MarketStore } from '../renderer-modules/market-data.js';
import { DEFAULT_SETTINGS, loadPetSettings, loadPortfolio } from '../renderer-modules/storage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFile(path.join(root, relative));
const readText = async (relative) => (await read(relative)).toString('utf8');
const checks = [];

function pass(area, name, evidence) {
  checks.push({ area, name, status: 'passed', evidence });
}

async function requiredFile(relative, minimumBytes = 1) {
  const stat = await fs.stat(path.join(root, relative));
  assert.ok(stat.isFile(), `${relative} 必须是文件`);
  assert.ok(stat.size >= minimumBytes, `${relative} 文件过小`);
  pass('assets', relative, `${stat.size} bytes`);
  return stat;
}

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

for (const [relative, minimum] of [
  ['assets/2d/bull-window-v2.png', 100000],
  ['assets/audio/niulai.mp3', 10000],
  ['assets/audio/mama.mp3', 10000],
  ['assets/models/bull-rigged.glb', 500000],
  ['assets/models/bull-rigged-v2.glb', 500000],
  ['assets/models/bull.glb', 500000],
  ['assets/models/bull-rigged.contract.json', 1000],
  ['docs/软件介绍与使用教程.md', 1000],
  ['docs/牛来盯盘安装说明.txt', 1000]
]) await requiredFile(relative, minimum);

const png = await read('assets/2d/bull-window-v2.png');
assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
pass('2d', '二维牛PNG签名', 'PNG signature valid');

for (const name of ['niulai.mp3', 'mama.mp3']) {
  const audio = await read(`assets/audio/${name}`);
  let frameSync = false;
  for (let index = 0; index < Math.min(audio.length - 1, 65536); index += 1) {
    if (audio[index] === 0xff && (audio[index + 1] & 0xe0) === 0xe0) {
      frameSync = true;
      break;
    }
  }
  assert.equal(frameSync, true, `${name} 缺少MP3帧同步`);
  pass('audio', name, 'MP3 frame sync found');
}

const main = await readText('main.js');
const preload = await readText('preload.js');
const renderer = await readText('renderer.js');
const html = await readText('index.html');
const pkg = JSON.parse(await readText('package.json'));

for (const snippet of [
  'transparent: true', 'frame: false', 'alwaysOnTop: true', 'skipTaskbar: true',
  "process.platform === 'win32' ? 'screen-saver' : 'floating'", 'installPersistentAlwaysOnTop',
  'setIgnoreMouseEvents(ignore, { forward: true })', "app.on('second-instance'",
  "webContents.on('render-process-gone'", "powerMonitor.on('suspend'",
  "powerMonitor.on('resume'", "screen.on('display-removed'",
  "screen.on('display-metrics-changed'", 'beginReturnHome'
]) assert.ok(main.includes(snippet), `main.js 缺少 ${snippet}`);
pass('windows', '窗口与恢复机制', '透明/置顶/穿透/单实例/崩溃/电源/显示器事件均存在');

for (const api of [
  'beginRoamingDrag', 'endRoamingDrag', 'recallRoaming', 'wakeRoaming',
  'getRoamingDiagnostics', 'resetWindowPosition', 'searchSymbols',
  'openExternalQuote', 'quit'
]) assert.ok(preload.includes(`${api}(`), `preload 缺少 ${api}`);
pass('ipc', '巡游与家园IPC', '拖动、召回、唤醒、诊断、归位、退出接口齐全');

for (const id of [
  'sprite-mode', 'action-incense', 'action-bull-feed', 'action-bear-feed',
  'quote-card', 'position-pnl', 'settings-panel', 'setting-display-mode',
  'stock-picker-panel', 'saved-stock-list', 'market-cn', 'market-hk', 'market-us',
  'stock-search-results', 'setting-save-stock',
  'setting-allow-roaming', 'setting-cross-display', 'setting-auto-home',
  'setting-max-fps', 'exit-confirm'
]) assert.ok(html.includes(`id="${id}"`), `index.html 缺少 #${id}`);
for (const animation of [
  'sprite-watch-breathe', 'sprite-watch-blink', 'sprite-watch-bullish',
  'sprite-watch-bearish', 'sprite-watch-sleep', 'sprite-watch-happy', 'sprite-watch-rage'
]) assert.ok(html.includes(`@keyframes ${animation}`), `二维动作缺少 ${animation}`);
pass('2d', '二维动作与互动UI', '呼吸/眨眼/涨跌/睡眠/点击及三种互动入口齐全');

for (const snippet of [
  "loadGltf('models/bull-rigged.glb')", "loadGltf('models/bull-rigged-v2.glb')",
  "loadGltf('models/bull.glb')", 'createProceduralBull()', 'fallback3DTo2D',
  "addEventListener('webglcontextlost'", 'new THREE.Raycaster()',
  'applyLifecycleAnimation', 'playVoiceForCurrentMarket'
]) assert.ok(renderer.includes(snippet), `renderer.js 缺少 ${snippet}`);
pass('3d', '模型回退链与交互', '新版骨骼→旧骨骼→旧静态→程序牛，WebGL失败回2D');

const legacy = new MemoryStorage({
  'niulai:pet-settings': JSON.stringify({ volume: 0.37, modelScale: 0.92, autoContinueRoaming: true }),
  'niulai:portfolio': JSON.stringify({ symbol: 's_sh600519', cost: 1688.5, shares: 100 }),
  'niulai:selected-symbol': 's_sh600519'
});
const loaded = loadPetSettings(legacy);
const position = loadPortfolio(legacy);
assert.equal(loaded.volume, 0.37);
assert.equal(loaded.modelScale, 0.92);
assert.equal(loaded.autoHome, false);
assert.equal(loaded.roamingFrequency, DEFAULT_SETTINGS.roamingFrequency);
assert.equal(position.cost, 1688.5);
assert.equal(position.shares, 100);
pass('storage', '旧版本本地数据兼容', '原字段保留，新字段补默认值');

const store = new MarketStore({ symbol: 's_sh600519', portfolio: position });
store.markError();
assert.equal(store.connection, 'error');
const quote = { price: 1710, prevClose: 1690, change: 20, changePct: 1.18 };
store.updateQuote(quote);
assert.equal(store.connection, 'connected');
const pnl = store.calculatePosition();
assert.equal(pnl.todayPnl, 2000);
assert.equal(pnl.totalPnl, 2150);
assert.ok(Math.abs(pnl.totalPct - 1.2733) < 0.001);
pass('market', '断线恢复与持仓盈亏', 'error→connected，今日/累计盈亏公式通过');

assert.equal(pkg.version, '1.4.0');
assert.deepEqual(pkg.build.win.target.map((entry) => entry.target), ['nsis', 'portable']);
assert.equal(pkg.build.nsis.createDesktopShortcut, true);
assert.ok(pkg.build.files.includes('docs/**/*'));
pass('packaging', 'Windows双包配置', 'NSIS x64 + portable x64，包含文档且保留桌面快捷方式');

const report = {
  valid: true,
  version: pkg.version,
  generatedAt: new Date().toISOString(),
  checks,
  summary: { passed: checks.length, failed: 0 },
  note: '本报告为静态资产与模块级回归；真实Electron、性能和硬件覆盖记录在WINDOWS-QA-REPORT.md。'
};
await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
await fs.writeFile(
  path.join(root, 'artifacts', 'full-regression-static.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8'
);
console.log(`full regression static tests passed (${checks.length} checks)`);
