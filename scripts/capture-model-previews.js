const { app, BrowserWindow } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outputDir = process.env.NIULAI_MODEL_PREVIEW_DIR
  ? path.resolve(process.env.NIULAI_MODEL_PREVIEW_DIR)
  : path.join(root, 'artifacts', 'rigged-bull');
const modelPath = process.env.NIULAI_MODEL_PREVIEW_PATH
  ? path.relative(root, path.resolve(process.env.NIULAI_MODEL_PREVIEW_PATH)).replaceAll('\\', '/')
  : 'assets/models/bull-rigged.glb';
const candidateMode = Boolean(process.env.NIULAI_MODEL_PREVIEW_PATH);
const includeActionPoses = !candidateMode || process.env.NIULAI_MODEL_PREVIEW_FULL === '1';
const includeMotionStrip = process.env.NIULAI_MODEL_PREVIEW_MOTION_STRIP === '1';
const captures = [
  { view: 'front' },
  { view: 'side' },
  { view: 'back' },
  { view: 'small80' },
  ...(includeActionPoses ? [
  { view: 'front', action: 'wave', pose: 0.90 },
  { view: 'front', action: 'point_screen', pose: 0.72 },
  { view: 'front', action: 'hold_head', pose: 0.92 },
  { view: 'front', action: 'facepalm', pose: 0.88 },
  { view: 'side', action: 'talk', pose: 0.70 },
  { view: 'front', action: 'jump', pose: 0.52 },
  { view: 'front', action: 'blink', pose: 0.50 },
  { view: 'front', action: 'thumbs_up', pose: 0.70 },
  { view: 'front', action: 'shrug', pose: 0.60 },
  { view: 'front', action: 'sleep_enter', pose: 1.52 },
  { view: 'front', action: 'sleep_loop', pose: 1.60 },
  { view: 'side', action: 'sleep_loop', pose: 1.60 },
  { view: 'front', action: 'wake_up', pose: 0.52 },
  { view: 'side', action: 'walk', pose: 0.04 },
  { view: 'side', action: 'run', pose: 0.04 },
  ...(includeMotionStrip ? [
    { view: 'front', action: 'sleep_enter', pose: 0.32, tag: 'enter-20' },
    { view: 'front', action: 'sleep_enter', pose: 0.72, tag: 'enter-45' },
    { view: 'front', action: 'sleep_enter', pose: 1.16, tag: 'enter-72' },
    { view: 'front', action: 'wake_up', pose: 0.24, tag: 'wake-16' },
    { view: 'front', action: 'wake_up', pose: 0.62, tag: 'wake-41' },
    { view: 'front', action: 'wake_up', pose: 1.06, tag: 'wake-70' }
  ] : [])
  ] : [])
];
const previewWindows = [];

async function capture({ view, action = 'idle_breathe', pose, tag }) {
  const window = new BrowserWindow({
    width: 600,
    height: 600,
    show: false,
    frame: false,
    backgroundColor: '#ede5d8',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      backgroundThrottling: false
    }
  });
  previewWindows.push(window);
  await window.loadFile(path.join(root, 'model-preview.html'), {
    query: {
      view,
      action,
      model: `./${modelPath}`,
      fur: candidateMode ? '0' : '1',
      ...(pose === undefined ? {} : { pose: String(pose) })
    }
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await window.webContents.executeJavaScript('window.__MODEL_PREVIEW__ || null');
    if (state?.ready) break;
    if (state?.error) throw new Error(state.error);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const state = await window.webContents.executeJavaScript('window.__MODEL_PREVIEW__ || null');
  if (!state?.ready) throw new Error(`${view} preview timed out`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const image = await window.webContents.capturePage();
  const suffix = action === 'idle_breathe' ? view : `pose-${action}-${view}${tag ? `-${tag}` : ''}`;
  const output = path.join(outputDir, `bull-rigged-${suffix}.png`);
  await fs.writeFile(output, image.toPNG());
  return { view, output, state };
}

app.whenReady().then(async () => {
  await fs.mkdir(outputDir, { recursive: true });
  const results = [];
  for (const options of captures) results.push(await capture(options));
  await fs.rm(path.join(outputDir, 'capture-error.txt'), { force: true });
  console.log(JSON.stringify(results, null, 2));
  for (const window of previewWindows) window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error.stack || error);
  fs.mkdir(outputDir, { recursive: true })
    .then(() => fs.writeFile(path.join(outputDir, 'capture-error.txt'), String(error.stack || error)))
    .finally(() => app.exit(1));
});
