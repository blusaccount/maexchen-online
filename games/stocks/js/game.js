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

    var FALLBACK_QUOTES = [
        { symbol: 'AAPL', name: 'Apple', price: 237.50, change: 1.25, pct: 0.53, currency: 'USD' },
        { symbol: 'MSFT', name: 'Microsoft', price: 432.80, change: -0.90, pct: -0.21, currency: 'USD' },
        { symbol: 'NVDA', name: 'NVIDIA', price: 140.20, change: 3.40, pct: 2.48, currency: 'USD' },
        { symbol: 'TSLA', name: 'Tesla', price: 394.50, change: -5.30, pct: -1.33, currency: 'USD' },
        { symbol: 'AMZN', name: 'Amazon', price: 225.30, change: 0.80, pct: 0.36, currency: 'USD' },
        { symbol: 'META', name: 'Meta', price: 638.40, change: 2.60, pct: 0.41, currency: 'USD' },
        { symbol: 'GOOGL', name: 'Alphabet', price: 196.70, change: -0.45, pct: -0.23, currency: 'USD' },
        { symbol: 'NFLX', name: 'Netflix', price: 982.10, change: 4.20, pct: 0.43, currency: 'USD' },
        { symbol: 'URTH', name: 'MSCI World', price: 135.20, change: 0.85, pct: 0.63, currency: 'USD' },
        { symbol: 'QQQ', name: 'Nasdaq 100', price: 525.40, change: -1.20, pct: -0.23, currency: 'USD' },
        { symbol: 'SPY', name: 'S&P 500', price: 602.30, change: 2.10, pct: 0.35, currency: 'USD' },
        { symbol: 'DIA', name: 'DOW Jones', price: 432.10, change: 1.45, pct: 0.34, currency: 'USD' },
        { symbol: 'VGK', name: 'FTSE Europe', price: 68.90, change: 0.30, pct: 0.44, currency: 'USD' },
        { symbol: 'EEM', name: 'Emerging Mkts', price: 43.50, change: -0.15, pct: -0.34, currency: 'USD' },
        { symbol: 'GDAXI', name: 'DAX', price: 20145.00, change: 78.50, pct: 0.39, currency: 'EUR' },
    ];

    var currentBalance = 0;
    var marketData = FALLBACK_QUOTES.slice(); // start with fallback, replace with live data
    var portfolioData = { holdings: [], totalValue: 0 };
    var tradeSide = 'buy'; // 'buy' | 'sell'
    var tradeSymbol = '';
    var tradeStock = null;

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

    // --- Render Market Grid ---
    function renderMarket() {
        marketGrid.innerHTML = marketData.map(function (q) {
            var up = q.change >= 0;
            return '<div class="stock-card" data-symbol="' + escapeAttr(q.symbol) + '">'
                + '<div class="stock-card-header">'
                + '<div><div class="symbol">' + escapeHtml(q.symbol) + '</div>'
                + '<div class="name">' + escapeHtml(q.name) + '</div></div>'
                + '<div style="text-align:right"><div class="price">$' + q.price.toFixed(2) + '</div>'
                + '<div class="change ' + (up ? 'up' : 'down') + '">'
                + (up ? '▲' : '▼') + ' ' + Math.abs(q.change).toFixed(2)
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
            holdingsContainer.innerHTML = '<div class="no-holdings">No investments yet — pick a stock below to start trading!</div>';
            return;
        }

        var html = '<table class="holdings-table"><thead><tr>'
            + '<th>SYMBOL</th><th>SHARES</th><th>AVG COST</th><th>PRICE</th>'
            + '<th>VALUE</th><th>GAIN/LOSS</th><th></th>'
            + '</tr></thead><tbody>';

        for (var j = 0; j < h.length; j++) {
            var p = h[j];
            var cls = p.gainLoss >= 0 ? 'positive' : 'negative';
            html += '<tr>'
                + '<td class="symbol">' + escapeHtml(p.symbol) + '<br><span style="color:var(--text-dim);font-size:0.6rem">' + escapeHtml(p.name) + '</span></td>'
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
        tradeTitleEl.textContent = tradeStock.symbol + ' – ' + tradeStock.name;
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
            tradePreviewEl.textContent = 'You will buy ~' + shares.toFixed(4) + ' shares for ' + amount.toFixed(2) + ' SC';
        } else {
            tradePreviewEl.textContent = 'You will sell ~' + shares.toFixed(4) + ' shares for ' + amount.toFixed(2) + ' SC';
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

    // --- Init ---
    renderMarket(); // show fallback immediately
    fetchMarket();  // replace with live data when available
    // Refresh market prices every 60 seconds
    setInterval(function () {
        fetchMarket();
        socket.emit('stock-get-portfolio');
    }, 60 * 1000);

    // Request portfolio once connected
    socket.on('connect', function () {
        setTimeout(function () {
            socket.emit('stock-get-portfolio');
        }, 500);
    });
})();
