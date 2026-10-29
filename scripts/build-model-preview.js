const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
esbuild.buildSync({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'model-preview.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome128',
  outfile: path.join(root, 'model-preview.bundle.js'),
  logLevel: 'info'
});
