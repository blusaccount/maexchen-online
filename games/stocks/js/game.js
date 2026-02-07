// ============================
// STOCK MARKET GAME – Client
// ============================

(function () {
    'use strict';

    var socket = io();
    var $ = function (id) { return document.getElementById(id); };

    var NAME_KEY = 'stricthotel-name';
    var CHAR_KEY = 'stricthotel-character';

    var balanceEl = $('balance-display');
    var portfolioValueEl = $('portfolio-value');
    var portfolioGainEl = $('portfolio-gain');
    var portfolioCashEl = $('portfolio-cash');
    var portfolioNetEl = $('portfolio-net');
    var holdingsContainer = $('holdings-container');
    var marketGrid = $('market-grid');
    var tradeOverlay = $('trade-overlay');
    var tradeTitleEl = $('trade-title');
    var tradePriceEl = $('trade-price');
    var tradeAmountEl = $('trade-amount');
    var tradePreviewEl = $('trade-preview');
    var tradeConfirmEl = $('trade-confirm');
    var tradeCancelEl = $('trade-cancel');
    var toastEl = $('stock-toast');
    var searchInput = $('stock-search');
    var searchResults = $('search-results');

    // Category maps for filtering
    var ETF_SYMBOLS = [
        'URTH', 'QQQ', 'GDAXI', 'DIA', 'SPY', 'VGK', 'EEM',
        'IWM', 'VTI', 'ARKK', 'XLF', 'XLE', 'GLD', 'TLT'
    ];
    var COMMODITY_SYMBOLS = [
        'GC=F', 'SI=F', 'PL=F', 'HG=F', 'CL=F', 'BZ=F', 'NG=F'
    ];
    var CRYPTO_SYMBOLS = [
        'BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD', 'DOGE-USD'
    ];

    var FALLBACK_QUOTES = [
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

    var currentBalance = 0;
    var marketData = FALLBACK_QUOTES.slice();
    var portfolioData = { holdings: [], totalValue: 0 };
    var tradeSide = 'buy';
    var tradeSymbol = '';
    var tradeStock = null;
    var activeCategory = 'all';
    var searchDebounce = null;

    // --- Register with server ---
    function register() {
        var name = localStorage.getItem(NAME_KEY) || '';
        if (!name) return;
        var charJSON = localStorage.getItem(CHAR_KEY);
        var character = null;
        try { character = charJSON ? JSON.parse(charJSON) : null; } catch (e) { /* ignore */ }
        socket.emit('register-player', { name: name, character: character, game: 'stocks' });
    }

    socket.on('connect', register);

    // --- Balance ---
    socket.on('balance-update', function (data) {
        if (data && typeof data.balance === 'number') {
            currentBalance = data.balance;
            balanceEl.textContent = data.balance.toFixed(2);
            portfolioCashEl.textContent = data.balance.toFixed(2);
            updateNetWorth();
        }
    });

    // --- Portfolio ---
    socket.on('stock-portfolio', function (data) {
        if (!data) return;
        portfolioData = data;
        renderPortfolio();
        updateNetWorth();
    });

    // --- Errors ---
    socket.on('stock-error', function (data) {
        showToast(data.error || 'Error', 'error');
    });

    // --- Fetch market data ---
    function fetchMarket() {
        fetch('/api/ticker')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (Array.isArray(data) && data.length > 0) {
                    marketData = data;
                    renderMarket();
                }
            })
            .catch(function () { /* use fallback if already rendered */ });
    }

    // --- Determine asset type ---
    function getStockType(symbol) {
        if (COMMODITY_SYMBOLS.indexOf(symbol) >= 0) return 'COMMODITY';
        if (CRYPTO_SYMBOLS.indexOf(symbol) >= 0) return 'CRYPTO';
        if (ETF_SYMBOLS.indexOf(symbol) >= 0) return 'ETF';
        return 'STOCK';
    }

    // --- Render Market Grid ---
    function renderMarket() {
        var filtered = marketData;
        if (activeCategory !== 'all') {
            var cat = activeCategory.toUpperCase();
            filtered = marketData.filter(function (q) { return getStockType(q.symbol) === cat; });
        }

        marketGrid.innerHTML = filtered.map(function (q) {
            var up = q.change >= 0;
            var type = getStockType(q.symbol);
            return '<div class="stock-card" data-symbol="' + escapeAttr(q.symbol) + '">'
                + '<span class="type-badge">' + type + '</span>'
                + '<div class="stock-card-header">'
                + '<div><div class="symbol">' + escapeHtml(q.symbol) + '</div>'
                + '<div class="name">' + escapeHtml(q.name) + '</div></div>'
                + '<div style="text-align:right"><div class="price">$' + q.price.toFixed(2) + '</div>'
                + '<div class="change ' + (up ? 'up' : 'down') + '">'
                + Math.abs(q.change).toFixed(2)
                + ' (' + (up ? '+' : '') + q.pct.toFixed(2) + '%)</div></div>'
                + '</div></div>';
        }).join('');

        // Attach click
        var cards = marketGrid.querySelectorAll('.stock-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].addEventListener('click', function () {
                openTrade(this.getAttribute('data-symbol'));
            });
        }
    }

    // --- Category Tabs ---
    var catTabs = document.querySelectorAll('.category-tab');
    for (var ci = 0; ci < catTabs.length; ci++) {
        catTabs[ci].addEventListener('click', function () {
            activeCategory = this.getAttribute('data-cat');
            for (var cj = 0; cj < catTabs.length; cj++) {
                catTabs[cj].classList.toggle('active', catTabs[cj] === this);
            }
            renderMarket();
        });
    }

    // --- Search ---
    searchInput.addEventListener('input', function () {
        var query = searchInput.value.trim();
        clearTimeout(searchDebounce);
        if (!query) {
            searchResults.classList.remove('active');
            searchResults.innerHTML = '';
            return;
        }
        searchDebounce = setTimeout(function () {
            fetch('/api/stock-search?q=' + encodeURIComponent(query))
                .then(function (r) { return r.json(); })
                .then(function (results) {
                    if (!Array.isArray(results) || results.length === 0) {
                        searchResults.innerHTML = '<div class="search-result-item" style="color:var(--ds-text-dim);cursor:default;">No results</div>';
                        searchResults.classList.add('active');
                        return;
                    }
                    searchResults.innerHTML = results.map(function (r) {
                        return '<div class="search-result-item" data-symbol="' + escapeAttr(r.symbol) + '" data-name="' + escapeAttr(r.name) + '">'
                            + '<div><span class="search-result-symbol">' + escapeHtml(r.symbol) + '</span> '
                            + '<span class="search-result-name">' + escapeHtml(r.name) + '</span></div>'
                            + '<span class="search-result-type">' + escapeHtml(r.type || '') + '</span>'
                            + '</div>';
                    }).join('');
                    searchResults.classList.add('active');

                    // Attach click handlers
                    var items = searchResults.querySelectorAll('.search-result-item[data-symbol]');
                    for (var si = 0; si < items.length; si++) {
                        items[si].addEventListener('click', function () {
                            var sym = this.getAttribute('data-symbol');
                            var name = this.getAttribute('data-name');
                            searchInput.value = '';
                            searchResults.classList.remove('active');
                            openSearchedTrade(sym, name);
                        });
                    }
                })
                .catch(function () {
                    searchResults.innerHTML = '<div class="search-result-item" style="color:var(--ds-text-dim);cursor:default;">Search failed</div>';
                    searchResults.classList.add('active');
                });
        }, 300);
    });

    // Close search results on click outside
    document.addEventListener('click', function (e) {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('active');
        }
    });

    // Open trade for a searched stock (fetch live quote first)
    function openSearchedTrade(symbol, name) {
        fetch('/api/stock-quote?symbol=' + encodeURIComponent(symbol))
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.error) {
                    showToast(data.error, 'error');
                    return;
                }
                // Add to market data temporarily so trade modal works
                var existing = marketData.find(function (q) { return q.symbol === data.symbol; });
                if (!existing) {
                    marketData.push(data);
                }
                openTrade(data.symbol);
            })
            .catch(function () { showToast('Failed to fetch quote', 'error'); });
    }

    // --- Render Portfolio Holdings ---
    function renderPortfolio() {
        var h = portfolioData.holdings;
        portfolioValueEl.textContent = portfolioData.totalValue.toFixed(2);

        var totalGain = 0;
        for (var i = 0; i < h.length; i++) {
            totalGain += h[i].gainLoss;
        }
        portfolioGainEl.textContent = (totalGain >= 0 ? '+' : '') + totalGain.toFixed(2);
        portfolioGainEl.className = 'summary-value ' + (totalGain >= 0 ? 'positive' : 'negative');

        if (h.length === 0) {
            holdingsContainer.innerHTML = '<div class="no-holdings">No investments yet.</div>';
            return;
        }

        var html = '<table class="holdings-table"><thead><tr>'
            + '<th>SYMBOL</th><th>SHARES</th><th>AVG</th><th>PRICE</th>'
            + '<th>VALUE</th><th>G/L</th><th></th>'
            + '</tr></thead><tbody>';

        for (var j = 0; j < h.length; j++) {
            var p = h[j];
            var cls = p.gainLoss >= 0 ? 'positive' : 'negative';
            html += '<tr>'
                + '<td class="symbol">' + escapeHtml(p.symbol) + '<br><span style="color:var(--ds-text-dim);font-size:6px">' + escapeHtml(p.name) + '</span></td>'
                + '<td>' + p.shares.toFixed(4) + '</td>'
                + '<td>$' + p.avgCost.toFixed(2) + '</td>'
                + '<td>$' + p.currentPrice.toFixed(2) + '</td>'
                + '<td>$' + p.marketValue.toFixed(2) + '</td>'
                + '<td class="' + cls + '">' + (p.gainLoss >= 0 ? '+' : '') + p.gainLoss.toFixed(2)
                + ' (' + (p.gainLossPct >= 0 ? '+' : '') + p.gainLossPct.toFixed(2) + '%)</td>'
                + '<td><button class="btn-sell-row" data-symbol="' + escapeAttr(p.symbol) + '">SELL</button></td>'
                + '</tr>';
        }

        html += '</tbody></table>';
        holdingsContainer.innerHTML = html;

        // Attach sell buttons
        var btns = holdingsContainer.querySelectorAll('.btn-sell-row');
        for (var k = 0; k < btns.length; k++) {
            btns[k].addEventListener('click', function (e) {
                e.stopPropagation();
                openTrade(this.getAttribute('data-symbol'), 'sell');
            });
        }
    }

    function updateNetWorth() {
        var net = currentBalance + portfolioData.totalValue;
        portfolioNetEl.textContent = net.toFixed(2);
    }

    // --- Trade Modal ---
    function openTrade(symbol, side) {
        tradeSymbol = symbol;
        tradeStock = marketData.find(function (q) { return q.symbol === symbol; });
        if (!tradeStock) return;

        tradeSide = side || 'buy';
        tradeTitleEl.textContent = tradeStock.symbol + ' - ' + tradeStock.name;
        tradePriceEl.textContent = 'Current: $' + tradeStock.price.toFixed(2);
        tradeAmountEl.value = '';
        tradePreviewEl.textContent = '';

        // Update tab state
        var tabs = tradeOverlay.querySelectorAll('.trade-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].getAttribute('data-side') === tradeSide);
        }

        tradeOverlay.classList.add('active');
        tradeAmountEl.focus();
    }

    function closeTrade() {
        tradeOverlay.classList.remove('active');
        tradeSymbol = '';
        tradeStock = null;
    }

    // Tab switching
    var tabs = tradeOverlay.querySelectorAll('.trade-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', function () {
            tradeSide = this.getAttribute('data-side');
            for (var j = 0; j < tabs.length; j++) {
                tabs[j].classList.toggle('active', tabs[j] === this);
            }
            updatePreview();
        });
    }

    // Amount input → preview
    tradeAmountEl.addEventListener('input', updatePreview);

    function updatePreview() {
        if (!tradeStock) return;
        var amount = parseFloat(tradeAmountEl.value);
        if (!amount || amount <= 0) {
            tradePreviewEl.textContent = '';
            return;
        }
        var shares = amount / tradeStock.price;
        if (tradeSide === 'buy') {
            tradePreviewEl.textContent = 'BUY ~' + shares.toFixed(4) + ' shares for ' + amount.toFixed(2) + ' SC';
        } else {
            tradePreviewEl.textContent = 'SELL ~' + shares.toFixed(4) + ' shares for ' + amount.toFixed(2) + ' SC';
        }
    }

    // Confirm
    tradeConfirmEl.addEventListener('click', function () {
        if (!tradeStock) return;
        var amount = parseFloat(tradeAmountEl.value);
        if (!amount || amount <= 0) {
            showToast('Enter an amount', 'error');
            return;
        }

        var event = tradeSide === 'buy' ? 'stock-buy' : 'stock-sell';
        socket.emit(event, { symbol: tradeSymbol, amount: amount });

        showToast(tradeSide === 'buy'
            ? 'Buying ' + tradeSymbol + '...'
            : 'Selling ' + tradeSymbol + '...', 'success');
        closeTrade();
    });

    // Cancel
    tradeCancelEl.addEventListener('click', closeTrade);
    tradeOverlay.addEventListener('click', function (e) {
        if (e.target === tradeOverlay) closeTrade();
    });

    // --- Toast ---
    var toastTimer = null;
    function showToast(msg, type) {
        toastEl.textContent = msg;
        toastEl.className = 'stock-toast show ' + (type || 'success');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toastEl.classList.remove('show');
        }, 3000);
    }

    // --- Utilities ---
    function escapeHtml(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/[&"'<>]/g, function (c) {
            return { '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' }[c];
        });
    }

    // --- Leaderboard ---
    var leaderboardContainer = $('leaderboard-container');
    var refreshBtn = $('refresh-leaderboard');
    var myName = localStorage.getItem(NAME_KEY) || '';

    socket.on('stock-leaderboard', function (data) {
        if (!Array.isArray(data)) return;
        renderLeaderboard(data);
    });

    function renderLeaderboard(players) {
        if (players.length === 0) {
            leaderboardContainer.innerHTML = '<div class="no-holdings">No player portfolios yet.</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < players.length; i++) {
            var p = players[i];
            var isMe = p.name === myName;
            var holdingsHtml = '';

            if (p.holdings && p.holdings.length > 0) {
                holdingsHtml = '<table class="leaderboard-detail-table"><thead><tr>'
                    + '<th>SYMBOL</th><th>SHARES</th><th>VALUE</th><th>G/L</th>'
                    + '</tr></thead><tbody>';
                for (var j = 0; j < p.holdings.length; j++) {
                    var h = p.holdings[j];
                    var cls = h.gainLoss >= 0 ? 'positive' : 'negative';
                    holdingsHtml += '<tr>'
                        + '<td style="font-weight:700;">' + escapeHtml(h.symbol) + '</td>'
                        + '<td>' + h.shares.toFixed(4) + '</td>'
                        + '<td>$' + h.marketValue.toFixed(2) + '</td>'
                        + '<td class="' + cls + '">' + (h.gainLoss >= 0 ? '+' : '') + h.gainLoss.toFixed(2) + '</td>'
                        + '</tr>';
                }
                holdingsHtml += '</tbody></table>';
            } else {
                holdingsHtml = '<div style="color:var(--ds-text-dim);font-size:7px;padding:4px 0;">No holdings</div>';
            }

            html += '<div class="leaderboard-card" data-idx="' + i + '">'
                + '<div class="leaderboard-header">'
                + '<span class="leaderboard-rank">#' + (i + 1) + '</span>'
                + '<span class="leaderboard-name' + (isMe ? ' is-you' : '') + '">'
                + escapeHtml(p.name) + (isMe ? ' (YOU)' : '') + '</span>'
                + '<div class="leaderboard-stats">'
                + '<div class="leaderboard-networth">$' + p.portfolioValue.toFixed(2) + '</div>'
                + '<div class="leaderboard-breakdown">Cash: $' + p.cash.toFixed(2) + ' | Net Worth: $' + p.netWorth.toFixed(2) + '</div>'
                + '</div>'
                + '</div>'
                + '<div class="leaderboard-detail">' + holdingsHtml + '</div>'
                + '</div>';
        }

        leaderboardContainer.innerHTML = html;
    }

    // Event delegation for leaderboard card expand/collapse
    leaderboardContainer.addEventListener('click', function (e) {
        var card = e.target.closest('.leaderboard-card');
        if (card) {
            card.classList.toggle('expanded');
        }
    });

    refreshBtn.addEventListener('click', function () {
        socket.emit('stock-get-leaderboard');
    });

    // --- Init ---
    renderMarket();
    fetchMarket();
    setInterval(function () {
        fetchMarket();
        socket.emit('stock-get-portfolio');
        socket.emit('stock-get-leaderboard');
    }, 60 * 1000);

    socket.on('connect', function () {
        setTimeout(function () {
            socket.emit('stock-get-portfolio');
            socket.emit('stock-get-leaderboard');
        }, 500);
    });
})();
