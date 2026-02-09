// ============================
// STRICTHOTEL SHOP
// ============================

(function () {
    'use strict';

    const socket = io();
    const Creator = window.StrictHotelCreator || window.MaexchenCreator;

    let currentBalance = 0;
    let currentDiamonds = 0;

    const $ = (id) => document.getElementById(id);

    const coinBalanceEl = $('coin-balance');
    const diamondBalanceEl = $('diamond-balance');
    const diamondsOwnedEl = $('diamonds-owned');
    const buyDiamondBtn = $('buy-diamond-btn');

    // Register this player so they show up as online in "shop" status
    function registerSelf() {
        const name = window.StrictHotelSocket.getPlayerName();
        if (!name) {
            window.location.href = '/';
            return;
        }
        window.StrictHotelSocket.registerPlayer(socket, 'shop');
    }

    // Update balance displays
    function updateBalances() {
        if (coinBalanceEl) coinBalanceEl.textContent = currentBalance.toFixed(2);
        if (diamondBalanceEl) diamondBalanceEl.textContent = currentDiamonds;
        if (diamondsOwnedEl) diamondsOwnedEl.textContent = currentDiamonds;
        
        // Disable buy button if insufficient funds
        if (buyDiamondBtn) {
            buyDiamondBtn.disabled = currentBalance < 25;
        }
    }

    // Show error message
    function showError(message) {
        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.textContent = message;
        document.body.appendChild(errorEl);
        
        setTimeout(() => {
            errorEl.remove();
        }, 3000);
    }

    // Socket event handlers
    socket.on('connect', () => {
        registerSelf();
        socket.emit('get-balance');
        socket.emit('get-player-diamonds');
    });

    socket.on('balance-update', (data) => {
        if (data && typeof data.balance === 'number') {
            currentBalance = data.balance;
            updateBalances();
        }
    });

    socket.on('diamonds-update', (data) => {
        if (data && typeof data.diamonds === 'number') {
            currentDiamonds = data.diamonds;
            updateBalances();
        }
    });

    socket.on('error', (data) => {
        if (data && data.message) {
            showError(data.message);
        }
    });

    // Buy diamond button
    if (buyDiamondBtn) {
        buyDiamondBtn.addEventListener('click', () => {
            if (currentBalance < 25) {
                showError('Nicht genug Coins!');
                return;
            }
            
            // Play sound if available
            const switchSound = document.querySelector('audio[src*="switch"]');
            if (switchSound) {
                switchSound.currentTime = 0;
                switchSound.play().catch(() => {});
            }
            
            socket.emit('buy-diamonds', { count: 1 });
        });
    }

    // Initialize
    registerSelf();
})();
