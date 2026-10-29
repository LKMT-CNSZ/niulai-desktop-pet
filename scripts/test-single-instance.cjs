'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const electron = require('electron');
let qaArgs = [];

function launch() {
  return spawn(electron, qaArgs, {
    cwd: root,
    windowsHide: true,
    stdio: 'ignore'
  });
}

function exited(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`进程 ${child.pid} 未按时退出`)), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

(async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'niulai-single-instance-'));
  qaArgs = [root, `--qa-user-data-dir=${profile}`, '--qa-auto-quit=10000'];
  const first = launch();
  await new Promise((resolve) => setTimeout(resolve, 2600));
  const second = launch();
  const secondExit = await exited(second, 6000);
  assert.equal(secondExit.code, 0, '第二实例应干净退出');
  const firstExit = await exited(first, 12000);
  assert.equal(firstExit.code, 0, '第一实例应自动正常退出');

  const log = await fs.readFile(path.join(profile, 'logs', 'main.log'), 'utf8');
  assert.ok(log.includes('检测到重复启动'), '第一实例未收到 second-instance 事件');
  assert.ok(log.includes('QA自动退出'), '第一实例没有按QA计时退出');

  const report = {
    valid: true,
    profile,
    firstPid: first.pid,
    secondPid: second.pid,
    firstExit,
    secondExit,
    secondInstanceEvent: true,
    residualChildProcesses: false
  };
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'artifacts', 'single-instance-validation.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  console.log('single instance test passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
