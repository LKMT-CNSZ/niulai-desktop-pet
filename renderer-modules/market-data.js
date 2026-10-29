export class MarketStore {
  constructor({ symbol, portfolio }) {
    this.selectedSymbol = symbol;
    this.portfolio = portfolio;
    this.quote = null;
    this.previousQuote = null;
    this.connection = 'connecting';
  }

  setSymbol(symbol) {
    this.selectedSymbol = symbol;
    this.quote = null;
    this.previousQuote = null;
    this.connection = 'connecting';
  }

  updateQuote(nextQuote) {
    this.previousQuote = this.quote;
    this.quote = nextQuote;
    this.connection = 'connected';
    return { quote: this.quote, previousQuote: this.previousQuote };
  }

  markError() {
    this.connection = 'error';
  }

  hasPosition() {
    return this.portfolio.symbol === this.selectedSymbol &&
      this.portfolio.cost > 0 && this.portfolio.shares > 0;
  }

  calculatePosition(nextQuote = this.quote) {
    if (!this.hasPosition() || !nextQuote) return null;
    const previousClose = Number.isFinite(nextQuote.prevClose)
      ? nextQuote.prevClose
      : nextQuote.price - nextQuote.change;
    const todayPnl = (nextQuote.price - previousClose) * this.portfolio.shares;
    const totalPnl = (nextQuote.price - this.portfolio.cost) * this.portfolio.shares;
    const totalPct = ((nextQuote.price - this.portfolio.cost) / this.portfolio.cost) * 100;
    return { todayPnl, totalPnl, totalPct, previousClose };
  }
}
