// Stock Ticker - scrolling ticker bar like a news show
(function () {
  // Fallback data used when the API is unavailable
  const FALLBACK = [
    { symbol: 'URTH', name: 'MSCI World', price: 135.20, change: 0.85, pct: 0.63, currency: 'USD' },
    { symbol: 'QQQ', name: 'Nasdaq 100', price: 525.40, change: -1.20, pct: -0.23, currency: 'USD' },
    { symbol: 'GDAXI', name: 'DAX', price: 20145.00, change: 78.50, pct: 0.39, currency: 'EUR' },
    { symbol: 'DIA', name: 'DOW Jones', price: 432.10, change: 1.45, pct: 0.34, currency: 'USD' },
    { symbol: 'SPY', name: 'S&P 500', price: 602.30, change: 2.10, pct: 0.35, currency: 'USD' },
    { symbol: 'VGK', name: 'FTSE Europe', price: 68.90, change: 0.30, pct: 0.44, currency: 'USD' },
    { symbol: 'EEM', name: 'Emerging Mkts', price: 43.50, change: -0.15, pct: -0.34, currency: 'USD' },
    { symbol: 'IWM', name: 'Russell 2000', price: 225.60, change: 1.30, pct: 0.58, currency: 'USD' },
    { symbol: 'VTI', name: 'Total US Market', price: 285.40, change: 0.90, pct: 0.32, currency: 'USD' },
    { symbol: 'ARKK', name: 'ARK Innovation', price: 55.80, change: -0.65, pct: -1.15, currency: 'USD' },
    { symbol: 'XLF', name: 'Financials ETF', price: 46.20, change: 0.25, pct: 0.54, currency: 'USD' },
    { symbol: 'XLE', name: 'Energy ETF', price: 88.90, change: -0.40, pct: -0.45, currency: 'USD' },
    { symbol: 'GLD', name: 'Gold ETF', price: 242.10, change: 1.80, pct: 0.75, currency: 'USD' },
    { symbol: 'TLT', name: 'US Treasury 20+', price: 92.30, change: 0.15, pct: 0.16, currency: 'USD' },
    { symbol: 'AAPL', name: 'Apple', price: 237.50, change: 1.25, pct: 0.53, currency: 'USD' },
    { symbol: 'MSFT', name: 'Microsoft', price: 432.80, change: -0.90, pct: -0.21, currency: 'USD' },
    { symbol: 'NVDA', name: 'NVIDIA', price: 140.20, change: 3.40, pct: 2.48, currency: 'USD' },
    { symbol: 'TSLA', name: 'Tesla', price: 394.50, change: -5.30, pct: -1.33, currency: 'USD' },
    { symbol: 'AMZN', name: 'Amazon', price: 225.30, change: 0.80, pct: 0.36, currency: 'USD' },
    { symbol: 'META', name: 'Meta', price: 638.40, change: 2.60, pct: 0.41, currency: 'USD' },
    { symbol: 'GOOGL', name: 'Alphabet', price: 196.70, change: -0.45, pct: -0.23, currency: 'USD' },
    { symbol: 'NFLX', name: 'Netflix', price: 982.10, change: 4.20, pct: 0.43, currency: 'USD' },
    { symbol: 'AMD', name: 'AMD', price: 120.50, change: 1.10, pct: 0.92, currency: 'USD' },
    { symbol: 'CRM', name: 'Salesforce', price: 328.40, change: -2.15, pct: -0.65, currency: 'USD' },
    { symbol: 'V', name: 'Visa', price: 298.50, change: 1.40, pct: 0.47, currency: 'USD' },
    { symbol: 'JPM', name: 'JPMorgan Chase', price: 242.30, change: 2.10, pct: 0.87, currency: 'USD' },
    { symbol: 'WMT', name: 'Walmart', price: 92.40, change: 0.35, pct: 0.38, currency: 'USD' },
    { symbol: 'KO', name: 'Coca-Cola', price: 62.10, change: 0.20, pct: 0.32, currency: 'USD' },
    { symbol: 'GC=F', name: 'Gold', price: 2650.40, change: 12.30, pct: 0.47, currency: 'USD' },
    { symbol: 'SI=F', name: 'Silver', price: 31.20, change: 0.45, pct: 1.46, currency: 'USD' },
    { symbol: 'CL=F', name: 'Crude Oil', price: 72.80, change: -0.65, pct: -0.88, currency: 'USD' },
    { symbol: 'NG=F', name: 'Natural Gas', price: 3.25, change: 0.08, pct: 2.52, currency: 'USD' },
    { symbol: 'BTC-USD', name: 'Bitcoin', price: 97500.00, change: 1250.00, pct: 1.30, currency: 'USD' },
    { symbol: 'ETH-USD', name: 'Ethereum', price: 3420.50, change: -45.20, pct: -1.30, currency: 'USD' },
    { symbol: 'SOL-USD', name: 'Solana', price: 198.30, change: 8.40, pct: 4.42, currency: 'USD' },
    { symbol: 'XRP-USD', name: 'XRP', price: 2.45, change: 0.12, pct: 5.15, currency: 'USD' },
  ];

  const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CHF: 'CHF ' };

  function buildTickerHTML(quotes) {
    return quotes.map((q) => {
      const up = q.change >= 0;
      const cs = CURRENCY_SYMBOLS[q.currency] || q.currency + ' ';
      return `<span class="ticker-item">`
        + `<span class="ticker-symbol">${q.symbol}</span>`
        + `<span class="ticker-price">${cs}${q.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
        + `<span class="ticker-change ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(q.change).toFixed(2)} (${up ? '+' : ''}${q.pct.toFixed(2)}%)</span>`
        + `</span>`;
    }).join('');
  }

  function renderTicker(track, quotes) {
    const items = buildTickerHTML(quotes);
    track.innerHTML = items + items;
  }

  async function fetchQuotes() {
    const res = await fetch('/api/ticker');
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('Empty data');
    return data;
  }

  function init() {
    const bar = document.createElement('div');
    bar.className = 'stock-ticker-bar';

    const track = document.createElement('div');
    track.className = 'stock-ticker-track';

    // Show fallback immediately, then replace with real data
    renderTicker(track, FALLBACK);

    bar.appendChild(track);
    document.body.appendChild(bar);

    // Fetch real prices on load
    fetchQuotes()
      .then((data) => renderTicker(track, data))
      .catch(() => { /* keep fallback */ });

    // Refresh real prices every 5 minutes while in the DOM
    const intervalId = setInterval(() => {
      if (!document.body.contains(bar)) {
        clearInterval(intervalId);
        return;
      }
      fetchQuotes()
        .then((data) => renderTicker(track, data))
        .catch(() => { /* keep current data */ });
    }, 5 * 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
