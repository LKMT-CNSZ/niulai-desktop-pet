const MARKET = Object.freeze({
  CN: 'cn',
  HK: 'hk',
  US: 'us'
});

const MARKET_LABEL = Object.freeze({
  [MARKET.CN]: 'A股',
  [MARKET.HK]: '港股',
  [MARKET.US]: '美股'
});

function marketForSymbol(symbol) {
  const value = String(symbol || '').toLowerCase();
  if (value.startsWith('rt_hk')) return MARKET.HK;
  if (value.startsWith('gb_')) return MARKET.US;
  return MARKET.CN;
}

function normalizeMarketList(markets) {
  const values = Array.isArray(markets) ? markets : [MARKET.CN, MARKET.HK, MARKET.US];
  const normalized = [...new Set(values.map((value) => String(value).toLowerCase()))]
    .filter((value) => Object.values(MARKET).includes(value));
  return normalized.length ? normalized : [MARKET.CN, MARKET.HK, MARKET.US];
}

function normalizeMarketSymbol(input, markets) {
  const allowed = normalizeMarketList(markets);
  let value = String(input || '').trim().replace(/\s+/g, '');
  const lower = value.toLowerCase();

  if (lower === '上证指数' || lower === '上证') return allowed.includes(MARKET.CN) ? 's_sh000001' : null;
  if (/^s_(sh|sz)\d{6}$/.test(lower)) return allowed.includes(MARKET.CN) ? lower : null;
  if (/^(sh|sz)\d{6}$/.test(lower)) return allowed.includes(MARKET.CN) ? `s_${lower}` : null;
  if (/^\d{6}$/.test(lower)) {
    if (!allowed.includes(MARKET.CN)) return null;
    const exchange = /^(5|6|9)/.test(lower) ? 'sh' : 'sz';
    return `s_${exchange}${lower}`;
  }

  const hkMatch = lower.match(/^(?:rt_)?hk(\d{1,5})$/) || lower.match(/^(\d{1,5})\.hk$/);
  if (hkMatch) {
    return allowed.includes(MARKET.HK) ? `rt_hk${hkMatch[1].padStart(5, '0')}` : null;
  }
  if (/^\d{5}$/.test(lower)) {
    return allowed.includes(MARKET.HK) ? `rt_hk${lower}` : null;
  }

  if (/^gb_[a-z][a-z0-9.-]{0,11}$/.test(lower)) {
    return allowed.includes(MARKET.US) ? lower : null;
  }
  value = value.replace(/^\$/, '').replace(/\.us$/i, '').replace(/^us/i, '');
  if (/^[a-z][a-z0-9.-]{0,11}$/i.test(value) && /[a-z]/i.test(value)) {
    const ticker = value.replace(/[^a-z0-9.-]/gi, '').toLowerCase();
    return ticker && allowed.includes(MARKET.US) ? `gb_${ticker}` : null;
  }
  return null;
}

function displaySymbol(symbol) {
  const value = String(symbol || 's_sh000001');
  if (value.startsWith('rt_hk')) return `HK ${value.slice(5)}`;
  if (value.startsWith('gb_')) return value.slice(3).toUpperCase();
  return value.replace(/^s_/, '');
}

function quoteProviderSymbol(symbol, provider = 'sina') {
  const market = marketForSymbol(symbol);
  if (provider === 'sina') return String(symbol);
  if (market === MARKET.HK) return `hk${String(symbol).slice(5)}`;
  if (market === MARKET.US) return `us${String(symbol).slice(3).toUpperCase()}`;
  return String(symbol);
}

function decodeJavascriptString(value) {
  return String(value || '')
    .replace(/\\u([0-9a-f]{4})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function parseTencentSuggestions(text, markets) {
  const allowed = normalizeMarketList(markets);
  const match = String(text || '').match(/v_hint="([\s\S]*?)"\s*;?/);
  if (!match) return [];
  const seen = new Set();
  const results = [];
  for (const row of decodeJavascriptString(match[1]).split('^')) {
    const [prefix, rawCode, name, , type] = row.split('~');
    if (!prefix || !rawCode || type !== 'GP') continue;
    let code = null;
    if (prefix === 'sh' || prefix === 'sz') code = `s_${prefix}${rawCode}`;
    else if (prefix === 'hk') code = `rt_hk${String(rawCode).padStart(5, '0')}`;
    else if (prefix === 'us') {
      const ticker = String(rawCode).replace(/\.(oq|o|n|a|ps|k)$/i, '').toLowerCase();
      code = `gb_${ticker}`;
    }
    if (!code || !allowed.includes(marketForSymbol(code)) || seen.has(code)) continue;
    seen.add(code);
    results.push({
      code,
      name: name || displaySymbol(code),
      market: marketForSymbol(code),
      marketLabel: MARKET_LABEL[marketForSymbol(code)],
      displayCode: displaySymbol(code)
    });
    if (results.length >= 12) break;
  }
  return results;
}

function externalQuoteUrl(symbol) {
  const code = normalizeMarketSymbol(symbol);
  if (!code) return null;
  const market = marketForSymbol(code);
  if (market === MARKET.HK) return `https://gu.qq.com/hk${code.slice(5)}/gp`;
  if (market === MARKET.US) return `https://gu.qq.com/us${code.slice(3).toUpperCase()}/gp`;
  return `https://gu.qq.com/${code.replace(/^s_/, '')}/gp`;
}

module.exports = {
  MARKET,
  MARKET_LABEL,
  normalizeMarketList,
  normalizeMarketSymbol,
  marketForSymbol,
  displaySymbol,
  quoteProviderSymbol,
  parseTencentSuggestions,
  externalQuoteUrl
};
