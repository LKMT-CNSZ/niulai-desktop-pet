import { BULL_ACTIONS } from './skeletal-animation-controller.js';

export function installAnimationDebugPanel(controller) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('debugActions') !== '1') return null;

  const style = document.createElement('style');
  style.textContent = `
    #animation-debug-panel {
      position: fixed; left: 5px; bottom: 5px; z-index: 1000; width: 188px;
      padding: 7px; border: 1px solid rgba(255,255,255,.28); border-radius: 10px;
      color: #fff; background: rgba(20,18,16,.86); backdrop-filter: blur(12px);
      font: 10px/1.35 system-ui, sans-serif; -webkit-app-region: no-drag;
    }
    #animation-debug-panel .debug-row { display:flex; gap:5px; align-items:center; margin-top:5px; }
    #animation-debug-panel select, #animation-debug-panel input, #animation-debug-panel button {
      min-width:0; font:inherit; color:#fff; background:#39322b; border:1px solid #756657;
      border-radius:5px; -webkit-app-region:no-drag;
    }
    #animation-debug-panel select { width:100%; }
    #animation-debug-panel input[type=range] { width:92px; }
    #animation-debug-status { white-space:pre-wrap; color:#f3dcae; margin-top:5px; max-height:66px; overflow:auto; }
  `;
  document.head.appendChild(style);

  const panel = document.createElement('section');
  panel.id = 'animation-debug-panel';
  panel.innerHTML = `
    <strong>AnimationMixer 调试</strong>
    <select data-role="action">${BULL_ACTIONS.map((name) => `<option>${name}</option>`).join('')}</select>
    <div class="debug-row">
      <button type="button" data-role="play">播放</button>
      <label><input type="checkbox" data-role="loop" />循环</label>
      <button type="button" data-role="refresh">检查</button>
    </div>
    <div class="debug-row"><span>速度</span><input type="range" min="10" max="250" value="100" data-role="speed" /><output data-role="speed-output">1.00×</output></div>
    <div class="debug-row"><span>混合</span><input type="range" min="0" max="100" value="28" data-role="blend" /><output data-role="blend-output">0.28s</output></div>
    <label class="debug-row"><input type="checkbox" data-role="feet" />记录脚掌/撞击关键帧</label>
    <div id="animation-debug-status"></div>
  `;
  document.body.appendChild(panel);

  const action = panel.querySelector('[data-role=action]');
  const loop = panel.querySelector('[data-role=loop]');
  const speed = panel.querySelector('[data-role=speed]');
  const blend = panel.querySelector('[data-role=blend]');
  const speedOutput = panel.querySelector('[data-role=speed-output]');
  const blendOutput = panel.querySelector('[data-role=blend-output]');
  const feet = panel.querySelector('[data-role=feet]');
  const status = panel.querySelector('#animation-debug-status');

  const refresh = () => {
    const state = controller.getStatus();
    let message = state.skeletal
      ? `当前: ${state.active || '无'}\n可用 ${state.available.length}/${BULL_ACTIONS.length}；缺少 ${state.missing.length}`
      : '当前资源不是骨骼模型，正在使用旧3D/程序动作回退。';
    if (feet.checked && state.skeletal) {
      const foot = controller.getFootStatus();
      const format = (value) => value
        ? `Y ${value.y.toFixed(3)} ΔY ${value.deltaY.toFixed(3)} 漂移 ${value.driftXZ.toFixed(3)}`
        : '未找到蹄骨';
      message += `\n左蹄 ${format(foot.left)}\n右蹄 ${format(foot.right)}`;
    }
    status.textContent = message;
  };
  panel.querySelector('[data-role=play]').addEventListener('click', () => {
    const ok = controller.play(action.value, {
      loop: loop.checked,
      force: true,
      timeScale: Number(speed.value) / 100,
      fade: Number(blend.value) / 100
    });
    refresh();
    if (!ok) status.textContent += `\n${action.value} 未包含在当前 GLB 中。`;
  });
  panel.querySelector('[data-role=refresh]').addEventListener('click', refresh);
  speed.addEventListener('input', () => {
    const value = Number(speed.value) / 100;
    controller.setSpeed(value);
    speedOutput.textContent = `${value.toFixed(2)}×`;
  });
  blend.addEventListener('input', () => {
    const value = Number(blend.value) / 100;
    controller.setBlendDuration(value);
    blendOutput.textContent = `${value.toFixed(2)}s`;
  });
  window.addEventListener('niulai:animation-event', (event) => {
    if (!feet.checked || event.detail?.type !== 'keyframe') return;
    status.textContent = `${event.detail.action}: ${event.detail.event || event.detail.name}\n${status.textContent}`;
  });
  setInterval(refresh, 1200);
  refresh();
  return panel;
}
