// ============================
// STOCK MARKET GAME – Client
// ============================

(function () {
    'use strict';

    const socket = io();
    const $ = (id) => document.getElementById(id);

    const balanceEl = $('balance-display');
    const portfolioValueEl = $('portfolio-value');
    const portfolioGainEl = $('portfolio-gain');
    const portfolioCashEl = $('portfolio-cash');
    const portfolioNetEl = $('portfolio-net');
    const holdingsContainer = $('holdings-container');
    const marketGrid = $('market-grid');
    const marketStatusEl = $('market-status');
    const tradeOverlay = $('trade-overlay');
    const tradeTitleEl = $('trade-title');
    const tradePriceEl = $('trade-price');
    const tradeAmountEl = $('trade-amount');
    const tradePreviewEl = $('trade-preview');
    const tradeConfirmEl = $('trade-confirm');
    const tradeCancelEl = $('trade-cancel');
    const toastEl = $('stock-toast');
    const searchInput = $('stock-search');
    const searchResults = $('search-results');

    // Category maps for filtering
    const ETF_SYMBOLS = [
        'URTH', 'QQQ', 'GDAXI', 'DIA', 'SPY', 'VGK', 'EEM',
        'IWM', 'VTI', 'ARKK', 'XLF', 'XLE', 'GLD', 'TLT'
    ];
    const COMMODITY_SYMBOLS = [
        'GC=F', 'SI=F', 'PL=F', 'HG=F', 'CL=F', 'BZ=F', 'NG=F'
    ];
    const CRYPTO_SYMBOLS = [
        'BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD', 'DOGE-USD'
    ];

    const FALLBACK_QUOTES = [
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
        { symbol: 'AVGO', name: 'Broadcom', price: 185.30, change: 3.60, pct: 1.98, currency: 'USD' },
        { symbol: 'ORCL', name: 'Oracle', price: 178.20, change: 0.95, pct: 0.54, currency: 'USD' },
        { symbol: 'ADBE', name: 'Adobe', price: 485.60, change: -1.80, pct: -0.37, currency: 'USD' },
        { symbol: 'DIS', name: 'Disney', price: 112.40, change: 0.60, pct: 0.54, currency: 'USD' },
        { symbol: 'PYPL', name: 'PayPal', price: 85.30, change: -0.40, pct: -0.47, currency: 'USD' },
        { symbol: 'INTC', name: 'Intel', price: 22.80, change: 0.15, pct: 0.66, currency: 'USD' },
        { symbol: 'BA', name: 'Boeing', price: 178.90, change: -1.20, pct: -0.67, currency: 'USD' },
        { symbol: 'V', name: 'Visa', price: 298.50, change: 1.40, pct: 0.47, currency: 'USD' },
        { symbol: 'JPM', name: 'JPMorgan Chase', price: 242.30, change: 2.10, pct: 0.87, currency: 'USD' },
        { symbol: 'WMT', name: 'Walmart', price: 92.40, change: 0.35, pct: 0.38, currency: 'USD' },
        { symbol: 'KO', name: 'Coca-Cola', price: 62.10, change: 0.20, pct: 0.32, currency: 'USD' },
        { symbol: 'PEP', name: 'PepsiCo', price: 158.70, change: -0.55, pct: -0.35, currency: 'USD' },
        { symbol: 'JNJ', name: 'Johnson & Johnson', price: 155.20, change: 0.45, pct: 0.29, currency: 'USD' },
        { symbol: 'PG', name: 'Procter & Gamble', price: 170.80, change: 0.70, pct: 0.41, currency: 'USD' },
        { symbol: 'BRK-B', name: 'Berkshire Hathaway', price: 458.90, change: 3.20, pct: 0.70, currency: 'USD' },
        { symbol: 'XOM', name: 'ExxonMobil', price: 108.50, change: -0.80, pct: -0.73, currency: 'USD' },
        { symbol: 'UNH', name: 'UnitedHealth', price: 532.10, change: 2.80, pct: 0.53, currency: 'USD' },
        { symbol: 'URTH', name: 'MSCI World', price: 135.20, change: 0.85, pct: 0.63, currency: 'USD' },
        { symbol: 'QQQ', name: 'Nasdaq 100', price: 525.40, change: -1.20, pct: -0.23, currency: 'USD' },
        { symbol: 'SPY', name: 'S&P 500', price: 602.30, change: 2.10, pct: 0.35, currency: 'USD' },
        { symbol: 'DIA', name: 'DOW Jones', price: 432.10, change: 1.45, pct: 0.34, currency: 'USD' },
        { symbol: 'VGK', name: 'FTSE Europe', price: 68.90, change: 0.30, pct: 0.44, currency: 'USD' },
        { symbol: 'EEM', name: 'Emerging Mkts', price: 43.50, change: -0.15, pct: -0.34, currency: 'USD' },
        { symbol: 'GDAXI', name: 'DAX', price: 20145.00, change: 78.50, pct: 0.39, currency: 'EUR' },
        { symbol: 'IWM', name: 'Russell 2000', price: 225.60, change: 1.30, pct: 0.58, currency: 'USD' },
        { symbol: 'VTI', name: 'Total US Market', price: 285.40, change: 0.90, pct: 0.32, currency: 'USD' },
        { symbol: 'ARKK', name: 'ARK Innovation', price: 55.80, change: -0.65, pct: -1.15, currency: 'USD' },
        { symbol: 'XLF', name: 'Financials ETF', price: 46.20, change: 0.25, pct: 0.54, currency: 'USD' },
        { symbol: 'XLE', name: 'Energy ETF', price: 88.90, change: -0.40, pct: -0.45, currency: 'USD' },
        { symbol: 'GLD', name: 'Gold ETF', price: 242.10, change: 1.80, pct: 0.75, currency: 'USD' },
        { symbol: 'TLT', name: 'US Treasury 20+', price: 92.30, change: 0.15, pct: 0.16, currency: 'USD' },
        // Metals & Resources
        { symbol: 'GC=F', name: 'Gold', price: 2650.40, change: 12.30, pct: 0.47, currency: 'USD' },
        { symbol: 'SI=F', name: 'Silver', price: 31.20, change: 0.45, pct: 1.46, currency: 'USD' },
        { symbol: 'PL=F', name: 'Platinum', price: 985.60, change: -3.20, pct: -0.32, currency: 'USD' },
        { symbol: 'HG=F', name: 'Copper', price: 4.18, change: 0.03, pct: 0.72, currency: 'USD' },
        { symbol: 'CL=F', name: 'Crude Oil WTI', price: 72.80, change: -0.65, pct: -0.88, currency: 'USD' },
        { symbol: 'BZ=F', name: 'Brent Crude Oil', price: 76.40, change: -0.50, pct: -0.65, currency: 'USD' },
        { symbol: 'NG=F', name: 'Natural Gas', price: 3.25, change: 0.08, pct: 2.52, currency: 'USD' },
        // Crypto
        { symbol: 'BTC-USD', name: 'Bitcoin', price: 97500.00, change: 1250.00, pct: 1.30, currency: 'USD' },
        { symbol: 'ETH-USD', name: 'Ethereum', price: 3420.50, change: -45.20, pct: -1.30, currency: 'USD' },
        { symbol: 'SOL-USD', name: 'Solana', price: 198.30, change: 8.40, pct: 4.42, currency: 'USD' },
        { symbol: 'BNB-USD', name: 'BNB', price: 685.20, change: 12.80, pct: 1.90, currency: 'USD' },
        { symbol: 'XRP-USD', name: 'XRP', price: 2.45, change: 0.12, pct: 5.15, currency: 'USD' },
        { symbol: 'ADA-USD', name: 'Cardano', price: 0.98, change: -0.03, pct: -2.97, currency: 'USD' },
        { symbol: 'DOGE-USD', name: 'Dogecoin', price: 0.38, change: 0.02, pct: 5.56, currency: 'USD' },
    ];

    let currentBalance = 0;
    let marketData = FALLBACK_QUOTES.slice();
    let portfolioData = { holdings: [], totalValue: 0 };
    let tradeSide = 'buy';
    let tradeSymbol = '';
    let tradeStock = null;
    let activeCategory = 'all';
    let searchDebounce = null;

    // --- Register with server ---
    const register = () => {
        const name = window.StrictHotelSocket.getPlayerName();
        if (!name) return;
        window.StrictHotelSocket.registerPlayer(socket, 'stocks');
    };

    socket.on('connect', register);

    // --- Balance ---
    socket.on('balance-update', (data) => {
        if (data && typeof data.balance === 'number') {
            currentBalance = data.balance;
            balanceEl.textContent = formatNumber(data.balance);
            portfolioCashEl.textContent = formatNumber(data.balance);
            updateNetWorth();
        }
    });

    // --- Portfolio ---
    socket.on('stock-portfolio', (data) => {
        if (!data) return;
        portfolioData = data;
        renderPortfolio();
        updateNetWorth();
    });

    // --- Errors ---
    socket.on('stock-error', (data) => {
        showToast(data.error || 'Error', 'error');
    });

    // --- Fetch market data ---
    const fetchMarket = () => {
        fetch('/api/ticker')
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data) && data.length > 0) {
                    marketData = data;
                    renderMarket();
                    updateMarketStatus(data);
                }
            })
            .catch(() => { /* use fallback if already rendered */ });
    };

    // --- Market status indicator ---
    const updateMarketStatus = (data) => {
        if (!marketStatusEl) return;
        // Derive US market status from a well-known US stock
        const usStock = data.find((q) => q.symbol === 'AAPL' || q.symbol === 'MSFT');
        if (!usStock || !usStock.marketState) {
            marketStatusEl.style.display = 'none';
            return;
        }
        const state = usStock.marketState;
        let cls = 'closed';
        let label = 'US MARKET CLOSED';
        if (state === 'REGULAR') {
            cls = 'open';
            label = 'US MARKET OPEN';
        } else if (state === 'PRE' || state === 'PREPRE') {
            // PREPRE = extended pre-market (Yahoo Finance)
            cls = 'pre';
            label = 'US MARKET PRE-MARKET';
        } else if (state === 'POST' || state === 'POSTPOST') {
            // POSTPOST = extended after-hours (Yahoo Finance)
            cls = 'post';
            label = 'US MARKET AFTER-HOURS';
        }
        marketStatusEl.className = 'market-status ' + cls;
        marketStatusEl.innerHTML = '<span class="status-dot"></span>' + label;
        marketStatusEl.style.display = 'block';
    };

    // --- Determine asset type ---
    const getStockType = (symbol) => {
        if (COMMODITY_SYMBOLS.indexOf(symbol) >= 0) return 'COMMODITY';
        if (CRYPTO_SYMBOLS.indexOf(symbol) >= 0) return 'CRYPTO';
        if (ETF_SYMBOLS.indexOf(symbol) >= 0) return 'ETF';
        return 'STOCK';
    };

    // --- Render Market Grid ---
    const renderMarket = () => {
        let filtered = marketData;
        if (activeCategory !== 'all') {
            const cat = activeCategory.toUpperCase();
            filtered = marketData.filter((q) => getStockType(q.symbol) === cat);
        }

        marketGrid.innerHTML = filtered.map((q) => {
            const up = q.change >= 0;
            const type = getStockType(q.symbol);
            return `<div class="stock-card" data-symbol="${escapeAttr(q.symbol)}">`
                + `<span class="type-badge">${type}</span>`
                + `<div class="stock-card-header">`
                + `<div><div class="symbol">${escapeHtml(q.symbol)}</div>`
                + `<div class="name">${escapeHtml(q.name)}</div></div>`
                + `<div style="text-align:right"><div class="price">$${formatNumber(q.price)}</div>`
                + `<div class="change ${up ? 'up' : 'down'}">`
                + `${formatNumber(Math.abs(q.change))}`
                + ` (${up ? '+' : ''}${formatNumber(q.pct)}%)</div></div>`
                + `</div></div>`;
        }).join('');

        // Attach click
        const cards = marketGrid.querySelectorAll('.stock-card');
        for (let i = 0; i < cards.length; i++) {
            cards[i].addEventListener('click', function () {
                openTrade(this.getAttribute('data-symbol'));
            });
        }
    };

    // --- Category Tabs ---
    const catTabs = document.querySelectorAll('.category-tab');
    for (let ci = 0; ci < catTabs.length; ci++) {
        catTabs[ci].addEventListener('click', function () {
            activeCategory = this.getAttribute('data-cat');
            for (let cj = 0; cj < catTabs.length; cj++) {
                catTabs[cj].classList.toggle('active', catTabs[cj] === this);
            }
            renderMarket();
        });
    }

    // --- Search ---
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        clearTimeout(searchDebounce);
        if (!query) {
            searchResults.classList.remove('active');
            searchResults.innerHTML = '';
            return;
        }
        searchDebounce = setTimeout(() => {
            fetch(`/api/stock-search?q=${encodeURIComponent(query)}`)
                .then((r) => r.json())
                .then((results) => {
                    if (!Array.isArray(results) || results.length === 0) {
                        searchResults.innerHTML = '<div class="search-result-item" style="color:var(--ds-text-dim);cursor:default;">No results</div>';
                        searchResults.classList.add('active');
                        return;
                    }
                    searchResults.innerHTML = results.map((r) => {
                        return `<div class="search-result-item" data-symbol="${escapeAttr(r.symbol)}" data-name="${escapeAttr(r.name)}">`
                            + `<div><span class="search-result-symbol">${escapeHtml(r.symbol)}</span> `
                            + `<span class="search-result-name">${escapeHtml(r.name)}</span></div>`
                            + `<span class="search-result-type">${escapeHtml(r.type || '')}</span>`
                            + `</div>`;
                    }).join('');
                    searchResults.classList.add('active');

                    // Attach click handlers
                    const items = searchResults.querySelectorAll('.search-result-item[data-symbol]');
                    for (let si = 0; si < items.length; si++) {
                        items[si].addEventListener('click', function () {
                            const sym = this.getAttribute('data-symbol');
                            const name = this.getAttribute('data-name');
                            searchInput.value = '';
                            searchResults.classList.remove('active');
                            openSearchedTrade(sym, name);
                        });
                    }
                })
                .catch(() => {
                    searchResults.innerHTML = '<div class="search-result-item" style="color:var(--ds-text-dim);cursor:default;">Search failed</div>';
                    searchResults.classList.add('active');
                });
        }, 300);
    });

    // Close search results on click outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('active');
        }
    });

    // Open trade for a searched stock (fetch live quote first)
    const openSearchedTrade = (symbol, name) => {
        fetch(`/api/stock-quote?symbol=${encodeURIComponent(symbol)}`)
            .then((r) => r.json())
            .then((data) => {
                if (data.error) {
                    showToast(data.error, 'error');
                    return;
                }
                // Add to market data temporarily so trade modal works
                const existing = marketData.find((q) => q.symbol === data.symbol);
                if (!existing) {
                    marketData.push(data);
                }
                openTrade(data.symbol);
            })
            .catch(() => { showToast('Failed to fetch quote', 'error'); });
    };

    // --- Render Portfolio Holdings ---
    const renderPortfolio = () => {
        const h = portfolioData.holdings;
        portfolioValueEl.textContent = formatNumber(portfolioData.totalValue);

        let totalGain = 0;
        for (let i = 0; i < h.length; i++) {
            totalGain += h[i].gainLoss;
        }
        portfolioGainEl.textContent = (totalGain >= 0 ? '+' : '') + formatNumber(totalGain);
        portfolioGainEl.className = `summary-value ${totalGain >= 0 ? 'positive' : 'negative'}`;

        if (h.length === 0) {
            holdingsContainer.innerHTML = '<div class="no-holdings">No investments yet.</div>';
            return;
        }

        let html = '<table class="holdings-table"><thead><tr>'
            + '<th>SYMBOL</th><th>SHARES</th><th>AVG</th><th>PRICE</th>'
            + '<th>VALUE</th><th>G/L</th><th></th>'
            + '</tr></thead><tbody>';

        for (let j = 0; j < h.length; j++) {
            const p = h[j];
            const cls = p.gainLoss >= 0 ? 'positive' : 'negative';
            html += `<tr>`
                + `<td class="symbol">${escapeHtml(p.symbol)}<br><span style="color:var(--ds-text-dim);font-size:6px">${escapeHtml(p.name)}</span></td>`
                + `<td>${formatNumber(p.shares, 4)}</td>`
                + `<td>$${formatNumber(p.avgCost)}</td>`
                + `<td>$${formatNumber(p.currentPrice)}</td>`
                + `<td>$${formatNumber(p.marketValue)}</td>`
                + `<td class="${cls}">${p.gainLoss >= 0 ? '+' : ''}${formatNumber(p.gainLoss)}`
                + ` (${p.gainLossPct >= 0 ? '+' : ''}${formatNumber(p.gainLossPct)}%)</td>`
                + `<td><button class="btn-sell-row" data-symbol="${escapeAttr(p.symbol)}">SELL</button></td>`
                + `</tr>`;
        }

        html += '</tbody></table>';
        holdingsContainer.innerHTML = html;

        // Attach sell buttons
        const btns = holdingsContainer.querySelectorAll('.btn-sell-row');
        for (let k = 0; k < btns.length; k++) {
            btns[k].addEventListener('click', function (e) {
                e.stopPropagation();
                openTrade(this.getAttribute('data-symbol'), 'sell');
            });
        }
    };

    const updateNetWorth = () => {
        const net = currentBalance + portfolioData.totalValue;
        portfolioNetEl.textContent = formatNumber(net);
    };

    // --- Trade Modal ---
    const openTrade = (symbol, side) => {
        tradeSymbol = symbol;
        tradeStock = marketData.find((q) => q.symbol === symbol);
        if (!tradeStock) return;

        tradeSide = side || 'buy';
        tradeTitleEl.textContent = `${tradeStock.symbol} - ${tradeStock.name}`;
        tradePriceEl.textContent = `Current: $${formatNumber(tradeStock.price)}`;
        tradeAmountEl.value = '';
        tradePreviewEl.textContent = '';

        // Update tab state
        const tabs = tradeOverlay.querySelectorAll('.trade-tab');
        for (let i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].getAttribute('data-side') === tradeSide);
        }

        tradeOverlay.classList.add('active');
        tradeAmountEl.focus();
    };

    const closeTrade = () => {
        tradeOverlay.classList.remove('active');
        tradeSymbol = '';
        tradeStock = null;
    };

    // Tab switching
    const tabs = tradeOverlay.querySelectorAll('.trade-tab');
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', function () {
            tradeSide = this.getAttribute('data-side');
            for (let j = 0; j < tabs.length; j++) {
                tabs[j].classList.toggle('active', tabs[j] === this);
            }
            updatePreview();
        });
    }

    // Amount input → preview
    tradeAmountEl.addEventListener('input', updatePreview);

    function updatePreview() {
        if (!tradeStock) return;
        const amount = parseFloat(tradeAmountEl.value);
        if (!amount || amount <= 0) {
            tradePreviewEl.textContent = '';
            return;
        }
        const shares = amount / tradeStock.price;
        if (tradeSide === 'buy') {
            tradePreviewEl.textContent = `BUY ~${formatNumber(shares, 4)} shares for ${formatNumber(amount)} SC`;
        } else {
            tradePreviewEl.textContent = `SELL ~${formatNumber(shares, 4)} shares for ${formatNumber(amount)} SC`;
        }
    }

    // Confirm
    tradeConfirmEl.addEventListener('click', () => {
        if (!tradeStock) return;
        const amount = parseFloat(tradeAmountEl.value);
        if (!amount || amount <= 0) {
            showToast('Enter an amount', 'error');
            return;
        }

        const event = tradeSide === 'buy' ? 'stock-buy' : 'stock-sell';
        socket.emit(event, { symbol: tradeSymbol, amount: amount });

        showToast(tradeSide === 'buy'
            ? `Buying ${tradeSymbol}...`
            : `Selling ${tradeSymbol}...`, 'success');
        closeTrade();
    });

    // Cancel
    tradeCancelEl.addEventListener('click', closeTrade);
    tradeOverlay.addEventListener('click', (e) => {
        if (e.target === tradeOverlay) closeTrade();
    });

    // --- Toast ---
    let toastTimer = null;
    const showToast = (msg, type) => {
        toastEl.textContent = msg;
        toastEl.className = `stock-toast show ${type || 'success'}`;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastEl.classList.remove('show');
        }, 3000);
    };

    // --- Utilities ---
    const escapeHtml = (str) => {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    };

    const escapeAttr = (str) => {
        return str.replace(/[&"'<>]/g, (c) => {
            return { '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' }[c];
        });
    };

    const formatNumber = (num, decimals = 2) => {
        return num.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    };

    const leaderboardAvatarHtml = (player) => {
        if (player.character && player.character.dataURL) {
            return `<img class="leaderboard-avatar" src="${escapeAttr(player.character.dataURL)}" alt="${escapeAttr(player.name)}">`;
        }
        return '<span class="leaderboard-avatar-placeholder">👽</span>';
    };

    // --- Leaderboard ---
    const leaderboardContainer = $('leaderboard-container');
    const performanceLeaderboardContainer = $('performance-leaderboard-container');
    const refreshBtn = $('refresh-leaderboard');
    const myName = window.StrictHotelSocket.getPlayerName();

    socket.on('stock-leaderboard', (data) => {
        if (!Array.isArray(data)) return;
        renderLeaderboard(data);
    });

    socket.on('stock-performance-leaderboard', (data) => {
        if (!Array.isArray(data)) return;
        renderPerformanceLeaderboard(data);
    });

    const renderLeaderboard = (players) => {
        if (players.length === 0) {
            leaderboardContainer.innerHTML = '<div class="no-holdings">No player portfolios yet.</div>';
            return;
        }

        let html = '';
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            const isMe = p.name === myName;
            let holdingsHtml = '';

            if (p.holdings && p.holdings.length > 0) {
                holdingsHtml = '<table class="leaderboard-detail-table"><thead><tr>'
                    + '<th>SYMBOL</th><th>SHARES</th><th>VALUE</th><th>G/L</th>'
                    + '</tr></thead><tbody>';
                for (let j = 0; j < p.holdings.length; j++) {
                    const h = p.holdings[j];
                    const cls = h.gainLoss >= 0 ? 'positive' : 'negative';
                    holdingsHtml += `<tr>`
                        + `<td style="font-weight:700;">${escapeHtml(h.symbol)}</td>`
                        + `<td>${formatNumber(h.shares, 4)}</td>`
                        + `<td>$${formatNumber(h.marketValue)}</td>`
                        + `<td class="${cls}">${h.gainLoss >= 0 ? '+' : ''}${formatNumber(h.gainLoss)}</td>`
                        + `</tr>`;
                }
                holdingsHtml += '</tbody></table>';
            } else {
                holdingsHtml = '<div style="color:var(--ds-text-dim);font-size:7px;padding:4px 0;">No holdings</div>';
            }

            html += `<div class="leaderboard-card">`
                + `<div class="leaderboard-header">`
                + `<span class="leaderboard-rank">#${i + 1}</span>`
                + leaderboardAvatarHtml(p)
                + `<span class="leaderboard-name${isMe ? ' is-you' : ''}">`
                + `${escapeHtml(p.name)}${isMe ? ' (YOU)' : ''}</span>`
                + `<div class="leaderboard-stats">`
                + `<div class="leaderboard-networth">$${formatNumber(p.portfolioValue)}</div>`
                + `<div class="leaderboard-breakdown">Cash: $${formatNumber(p.cash)} | Net Worth: $${formatNumber(p.netWorth)}</div>`
                + `</div>`
                + `</div>`
                + `<div class="leaderboard-detail">${holdingsHtml}</div>`
                + `</div>`;
        }

        leaderboardContainer.innerHTML = html;
    };

    const renderPerformanceLeaderboard = (players) => {
        if (!performanceLeaderboardContainer) return;
        if (players.length === 0) {
            performanceLeaderboardContainer.innerHTML = '<div class="no-holdings">No active trade performance yet.</div>';
            return;
        }

        let html = '';
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            const isMe = p.name === myName;
            const cls = p.openPnl >= 0 ? 'positive' : 'negative';

            let holdingsHtml = '';
            if (p.holdings && p.holdings.length > 0) {
                holdingsHtml = '<table class="leaderboard-detail-table"><thead><tr>'
                    + '<th>SYMBOL</th><th>SHARES</th><th>VALUE</th><th>G/L</th>'
                    + '</tr></thead><tbody>';
                for (let j = 0; j < p.holdings.length; j++) {
                    const h = p.holdings[j];
                    const gainLossCls = h.gainLoss >= 0 ? 'positive' : 'negative';
                    holdingsHtml += `<tr>`
                        + `<td style="font-weight:700;">${escapeHtml(h.symbol)}</td>`
                        + `<td>${formatNumber(h.shares, 4)}</td>`
                        + `<td>$${formatNumber(h.marketValue)}</td>`
                        + `<td class="${gainLossCls}">${h.gainLoss >= 0 ? '+' : ''}${formatNumber(h.gainLoss)}</td>`
                        + `</tr>`;
                }
                holdingsHtml += '</tbody></table>';
            } else {
                holdingsHtml = '<div style="color:var(--ds-text-dim);font-size:7px;padding:4px 0;">No holdings</div>';
            }

            html += `<div class="leaderboard-card">`
                + `<div class="leaderboard-header">`
                + `<span class="leaderboard-rank">#${i + 1}</span>`
                + leaderboardAvatarHtml(p)
                + `<span class="leaderboard-name${isMe ? ' is-you' : ''}">`
                + `${escapeHtml(p.name)}${isMe ? ' (YOU)' : ''}</span>`
                + `<div class="leaderboard-stats">`
                + `<div class="leaderboard-networth ${cls}">`
                + `${p.performancePct >= 0 ? '+' : ''}${formatNumber(p.performancePct)}%</div>`
                + `<div class="leaderboard-breakdown">`
                + `PnL: ${p.openPnl >= 0 ? '+' : ''}$${formatNumber(Math.abs(p.openPnl))}`
                + ` | Base: $${formatNumber(p.investedCapital)}`
                + `</div>`
                + `</div>`
                + `</div>`
                + `<div class="leaderboard-detail">${holdingsHtml}</div>`
                + `</div>`;
        }

        performanceLeaderboardContainer.innerHTML = html;
    };

    // Event delegation for leaderboard card expand/collapse
    const toggleLeaderboardCard = (e) => {
        const card = e.target.closest('.leaderboard-card');
        if (card) {
            card.classList.toggle('expanded');
        }
    };

    leaderboardContainer.addEventListener('click', toggleLeaderboardCard);
    performanceLeaderboardContainer.addEventListener('click', toggleLeaderboardCard);

    refreshBtn.addEventListener('click', () => {
        socket.emit('stock-get-leaderboard');
    });

    // --- Portfolio Performance Chart ---
    const chartCanvas = $('portfolio-chart');
    const chartEmpty = $('chart-empty');
    let portfolioChart = null;

    socket.on('stock-portfolio-history', (data) => {
        if (!Array.isArray(data) || data.length < 2) {
            chartCanvas.style.display = 'none';
            chartEmpty.style.display = 'block';
            return;
        }
        chartEmpty.style.display = 'none';
        chartCanvas.style.display = 'block';
        renderChart(data);
    });

    const renderChart = (snapshots) => {
        const labels = snapshots.map((s) => {
            const d = new Date(s.ts);
            return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        });
        const netWorthData = snapshots.map((s) => s.netWorth);
        const portfolioValueData = snapshots.map((s) => s.portfolioValue);
        const cashData = snapshots.map((s) => s.cash);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        const textColor = isDark ? '#a0a0a0' : '#666666';

        if (portfolioChart) {
            portfolioChart.data.labels = labels;
            portfolioChart.data.datasets[0].data = netWorthData;
            portfolioChart.data.datasets[1].data = portfolioValueData;
            portfolioChart.data.datasets[2].data = cashData;
            portfolioChart.options.scales.x.ticks.color = textColor;
            portfolioChart.options.scales.y.ticks.color = textColor;
            portfolioChart.options.scales.x.grid.color = gridColor;
            portfolioChart.options.scales.y.grid.color = gridColor;
            portfolioChart.update('none');
            return;
        }

        portfolioChart = new Chart(chartCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Net Worth',
                        data: netWorthData,
                        borderColor: isDark ? '#eaeaea' : '#222222',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        tension: 0.3
                    },
                    {
                        label: 'Portfolio',
                        data: portfolioValueData,
                        borderColor: isDark ? '#6699cc' : '#336699',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        pointRadius: 1,
                        pointHoverRadius: 3,
                        tension: 0.3,
                        borderDash: [4, 2]
                    },
                    {
                        label: 'Cash',
                        data: cashData,
                        borderColor: isDark ? '#88aa88' : '#448844',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        pointRadius: 1,
                        pointHoverRadius: 3,
                        tension: 0.3,
                        borderDash: [2, 2]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: {
                            font: { family: "'Press Start 2P', monospace", size: 7 },
                            color: textColor,
                            boxWidth: 12,
                            padding: 8
                        }
                    },
                    tooltip: {
                        titleFont: { family: "'Press Start 2P', monospace", size: 7 },
                        bodyFont: { family: "'Press Start 2P', monospace", size: 7 },
                        callbacks: {
                            label: (ctx) => {
                                return `${ctx.dataset.label}: $${formatNumber(ctx.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            font: { family: "'Press Start 2P', monospace", size: 6 },
                            color: textColor,
                            maxTicksLimit: 8
                        },
                        grid: { color: gridColor }
                    },
                    y: {
                        ticks: {
                            font: { family: "'Press Start 2P', monospace", size: 6 },
                            color: textColor,
                            callback: (v) => { return `$${v}`; }
                        },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    };

    // --- Init ---
    renderMarket();
    fetchMarket();
    setInterval(() => {
        fetchMarket();
        socket.emit('stock-get-portfolio');
        socket.emit('stock-get-leaderboard');
    }, 60 * 1000);

    socket.on('connect', () => {
        setTimeout(() => {
            socket.emit('stock-get-portfolio');
            socket.emit('stock-get-leaderboard');
        }, 500);
    });
})();
