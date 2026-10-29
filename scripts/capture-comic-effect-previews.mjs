import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scenarios = [
  'fx-up',
  'fx-rapid-rise',
  'fx-down',
  'fx-rapid-fall',
  'fx-limit-up',
  'fx-limit-down'
];

for (const scenario of scenarios) {
  const result = spawnSync(
    electronPath,
    [root, '--capture-preview', `--capture-action=${scenario}`],
    { cwd: root, stdio: 'inherit', windowsHide: true }
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
  const output = path.join(root, 'artifacts', `bull-preview-${scenario}.png`);
  if (!fs.existsSync(output) || fs.statSync(output).size < 1000) {
    throw new Error(`预览未生成或文件为空：${output}`);
  }
}

console.log(`comic effect previews generated: ${scenarios.length}`);
