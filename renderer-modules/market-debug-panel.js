const SCENARIOS = Object.freeze([
  ['FLAT', '平盘'],
  ['BULLISH', '普通上涨'],
  ['BEARISH', '普通下跌'],
  ['RAPID_RISE', '快速拉升'],
  ['RAPID_FALL', '快速跳水'],
  ['BREAKOUT_UP', '涨幅突破'],
  ['BREAKOUT_DOWN', '跌幅突破'],
  ['POSITION_BREAKEVEN', '持仓回本'],
  ['POSITION_RECOVERED', '持仓解套'],
  ['PROFIT_EXPANDED', '盈利扩大'],
  ['PROFIT_PULLBACK', '盈利回撤'],
  ['LIMIT_UP', '涨停'],
  ['LIMIT_DOWN', '跌停'],
  ['DISCONNECTED', '行情断线'],
  ['CLOSED', '休盘']
]);

export function installMarketDebugPanel({ config, onConfigure, onScenario, onReset }) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('debugMarket') !== '1') return null;

  const style = document.createElement('style');
  style.textContent = `
    #market-debug-panel {
      position:fixed; left:5px; top:5px; z-index:1100; width:210px; padding:8px;
      color:#fff; background:rgba(18,23,20,.90); border:1px solid rgba(255,255,255,.28);
      border-radius:10px; backdrop-filter:blur(12px); font:10px/1.35 system-ui,sans-serif;
      -webkit-app-region:no-drag;
    }
    #market-debug-panel select, #market-debug-panel input, #market-debug-panel button {
      min-width:0; color:#fff; background:#29352e; border:1px solid #617367;
      border-radius:5px; font:inherit; -webkit-app-region:no-drag;
    }
    #market-debug-panel select { width:100%; margin:5px 0; }
    #market-debug-panel .market-debug-row { display:flex; gap:5px; margin-top:5px; align-items:center; }
    #market-debug-panel .market-debug-row label { width:76px; }
    #market-debug-panel .market-debug-row input { width:62px; }
    #market-debug-status { margin-top:6px; color:#f3dcae; white-space:pre-wrap; max-height:58px; overflow:auto; }
  `;
  document.head.appendChild(style);

  const panel = document.createElement('section');
  panel.id = 'market-debug-panel';
  panel.innerHTML = `
    <strong>行情事件调试</strong>
    <select data-role="scenario">${SCENARIOS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
    <div class="market-debug-row">
      <button type="button" data-role="run">运行场景</button>
      <button type="button" data-role="reset">恢复实时</button>
    </div>
    <div class="market-debug-row"><label>快涨/跳水%</label><input type="number" min="0.1" max="10" step="0.1" data-role="rapid" /></div>
    <div class="market-debug-row"><label>突破档位%</label><input type="text" data-role="breakouts" /></div>
    <div class="market-debug-row"><label>涨跌停%</label><input type="number" min="1" max="20" step="0.1" data-role="limit" /></div>
    <div class="market-debug-row"><button type="button" data-role="save">保存阈值</button></div>
    <div id="market-debug-status">开发模式；不会修改真实行情源。</div>
  `;
  document.body.appendChild(panel);

  const scenario = panel.querySelector('[data-role=scenario]');
  const rapid = panel.querySelector('[data-role=rapid]');
  const breakouts = panel.querySelector('[data-role=breakouts]');
  const limit = panel.querySelector('[data-role=limit]');
  const status = panel.querySelector('#market-debug-status');
  rapid.value = String(config.rapidRisePct);
  breakouts.value = config.breakoutLevelsPct.join(',');
  limit.value = String(config.limitUpPct);

  panel.querySelector('[data-role=run]').addEventListener('click', () => {
    const result = onScenario?.(scenario.value);
    status.textContent = result?.message || '场景已发送';
  });
  panel.querySelector('[data-role=reset]').addEventListener('click', () => {
    onReset?.();
    status.textContent = '已恢复实时行情。';
  });
  panel.querySelector('[data-role=save]').addEventListener('click', () => {
    const levels = breakouts.value.split(',').map(Number).filter(Number.isFinite);
    const next = onConfigure?.({
      rapidRisePct: Number(rapid.value),
      rapidFallPct: Number(rapid.value),
      breakoutLevelsPct: levels,
      limitUpPct: Number(limit.value),
      limitDownPct: -Number(limit.value)
    });
    status.textContent = next ? '阈值已保存，旧版本设置兼容保留。' : '阈值保存失败。';
  });
  return panel;
}
