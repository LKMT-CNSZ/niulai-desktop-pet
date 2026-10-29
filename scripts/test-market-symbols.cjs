const assert = require('node:assert/strict');
const {
  normalizeMarketSymbol,
  marketForSymbol,
  displaySymbol,
  quoteProviderSymbol,
  parseTencentSuggestions,
  externalQuoteUrl
} = require('../main-modules/market-symbols');
const { parseSinaQuote, parseTencentQuote } = require('../main-modules/quote-parsers');

assert.equal(normalizeMarketSymbol('600519'), 's_sh600519');
assert.equal(normalizeMarketSymbol('hk700'), 'rt_hk00700');
assert.equal(normalizeMarketSymbol('00700.HK'), 'rt_hk00700');
assert.equal(normalizeMarketSymbol('AAPL'), 'gb_aapl');
assert.equal(normalizeMarketSymbol('$TSLA'), 'gb_tsla');
assert.equal(normalizeMarketSymbol('BRK.B'), 'gb_brk.b');
assert.equal(normalizeMarketSymbol('AAPL', ['cn', 'hk']), null);
assert.equal(marketForSymbol('rt_hk00700'), 'hk');
assert.equal(marketForSymbol('gb_aapl'), 'us');
assert.equal(displaySymbol('rt_hk00700'), 'HK 00700');
assert.equal(displaySymbol('gb_aapl'), 'AAPL');
assert.equal(quoteProviderSymbol('rt_hk00700', 'tencent'), 'hk00700');
assert.equal(quoteProviderSymbol('gb_aapl', 'tencent'), 'usAAPL');
assert.equal(externalQuoteUrl('gb_aapl'), 'https://gu.qq.com/usAAPL/gp');

const suggestions = parseTencentSuggestions(
  'v_hint="hk~00700~\\u817e\\u8baf\\u63a7\\u80a1~txkg~GP^us~aapl.oq~Apple~apple~GP^sh~600519~\\u8d35\\u5dde\\u8305\\u53f0~gzmt~GP";',
  ['cn', 'hk', 'us']
);
assert.deepEqual(suggestions.map((item) => item.code), [
  'rt_hk00700',
  'gb_aapl',
  's_sh600519'
]);
assert.equal(suggestions[0].name, '腾讯控股');

const hkSina = parseSinaQuote(
  'var hq_str_rt_hk00700="TENCENT,腾讯控股,450.000,457.000,451.400,438.400,440.000,-17.000,-3.720,439.800,440.000,12881851919.788,29180102,15.995,0.000,675.134,411.000,2026/08/24,16:08:26";',
  'rt_hk00700'
);
assert.equal(hkSina.name, '腾讯控股');
assert.equal(hkSina.price, 440);
assert.equal(hkSina.prevClose, 457);
assert.equal(hkSina.changePct, -3.72);
assert.equal(hkSina.market, 'hk');

const usSina = parseSinaQuote(
  'var hq_str_gb_aapl="苹果,309.3500,-0.63,2026-08-24 20:11:03,-1.9500,312.0500,312.3800,307.0100,344.5700,223.9000,46876815,42246086,4514709583000,8.30,37.27,0,0.86,0,0,14594180000,63,310.50,0.37,1.15,Aug 24,Aug 21,311.3000";',
  'gb_aapl'
);
assert.equal(usSina.price, 309.35);
assert.equal(usSina.prevClose, 311.3);
assert.equal(usSina.market, 'us');

const hkTencent = parseTencentQuote(
  `v_hk00700="100~腾讯控股~00700~440.000~457.000~450.000~29180102.0${'~0'.repeat(23)}~2026/08/24 16:08:26~-17.000~-3.72~451.400~438.400~440.000~29180102.0~12881851919.788";`,
  'rt_hk00700'
);
assert.equal(hkTencent.price, 440);
assert.equal(hkTencent.prevClose, 457);
assert.equal(hkTencent.market, 'hk');

console.log('market symbol tests passed');
