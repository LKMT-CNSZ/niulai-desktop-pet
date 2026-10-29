const {
  MARKET,
  marketForSymbol,
  quoteProviderSymbol
} = require('./market-symbols');

function parseSinaQuote(text, symbol) {
  const escaped = String(symbol).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`var hq_str_${escaped}="([^"]*)"`));
  if (!match || !match[1]) return null;
  const parts = match[1].split(',');
  const market = marketForSymbol(symbol);
  const layout = market === MARKET.HK
    ? { name: 1, price: 6, change: 7, changePct: 8, prevClose: 3, volume: 12, amount: 11, date: 17, time: 18 }
    : market === MARKET.US
      ? { name: 0, price: 1, change: 4, changePct: 2, prevClose: 26, volume: 10, amount: 12, time: 3 }
      : { name: 0, price: 1, change: 2, changePct: 3, volume: 4, amount: 5, time: 31 };
  const price = Number.parseFloat(parts[layout.price]);
  const change = Number.parseFloat(parts[layout.change]);
  const changePct = Number.parseFloat(parts[layout.changePct]);
  if (![price, change, changePct].every(Number.isFinite)) return null;
  const providedPrevClose = Number.parseFloat(parts[layout.prevClose]);
  return {
    code: symbol,
    name: parts[layout.name] || String(symbol).replace(/^(s_|rt_hk|gb_)/, ''),
    price,
    change,
    prevClose: Number.isFinite(providedPrevClose) ? providedPrevClose : price - change,
    changePct,
    volume: parts[layout.volume] || '',
    amount: parts[layout.amount] || '',
    time: [parts[layout.date], parts[layout.time]].filter(Boolean).join(' '),
    market
  };
}

function parseTencentQuote(text, symbol) {
  const providerSymbol = quoteProviderSymbol(symbol, 'tencent');
  const escaped = providerSymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`v_${escaped}="([^"]*)"`));
  if (!match || !match[1]) return null;
  const parts = match[1].split('~');
  const market = marketForSymbol(symbol);
  const detailed = market !== MARKET.CN;
  const price = Number.parseFloat(parts[3]);
  const change = Number.parseFloat(parts[detailed ? 31 : 4]);
  const changePct = Number.parseFloat(parts[detailed ? 32 : 5]);
  if (![price, change, changePct].every(Number.isFinite)) return null;
  const providedPrevClose = Number.parseFloat(parts[4]);
  return {
    code: symbol,
    name: parts[1] || String(symbol).replace(/^(s_|rt_hk|gb_)/, ''),
    price,
    change,
    prevClose: detailed && Number.isFinite(providedPrevClose) ? providedPrevClose : price - change,
    changePct,
    volume: parts[6] || '',
    amount: parts[detailed ? 37 : 7] || '',
    time: detailed ? parts[30] || '' : '',
    source: 'tencent',
    market
  };
}

module.exports = { parseSinaQuote, parseTencentQuote };
