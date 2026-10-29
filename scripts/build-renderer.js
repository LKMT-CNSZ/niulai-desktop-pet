const path = require('path');
const esbuild = require('esbuild');

const projectRoot = path.resolve(__dirname, '..');

esbuild.buildSync({
  entryPoints: [path.join(projectRoot, 'renderer.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome128',
  outfile: path.join(projectRoot, 'renderer.bundle.js'),
  logLevel: 'info'
});
