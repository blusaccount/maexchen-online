// ============== LOL BETTING CLIENT ==============

const socket = io();

let playerBalance = 0;
let selectedBetType = null;
let usernameValidated = false;
let validatedRiotId = null;
let validatedPuuid = null;

// DOM Elements
const balanceDisplay = document.getElementById('balance-display');
const betForm = document.getElementById('bet-form');
const lolUsernameInput = document.getElementById('lol-username');
const betAmountInput = document.getElementById('bet-amount');
const betTypeButtons = document.querySelectorAll('.bet-type-btn');
const submitBtn = document.getElementById('submit-btn');
const errorMessage = document.getElementById('error-message');
const betsList = document.getElementById('bets-list');
const validateBtn = document.getElementById('validate-btn');
const validationStatus = document.getElementById('validation-status');

// ============== INITIALIZATION ==============

function init() {
    // Setup event listeners
    setupEventListeners();
    
    // Setup socket listeners for manual bet checking
    setupBetCheckListeners();
}

// Register player and request data on socket connection
function register() {
    const name = window.StrictHotelSocket.getPlayerName();
    if (!name) {
        balanceDisplay.textContent = '💰 Not logged in';
        return;
    }
    
    window.StrictHotelSocket.registerPlayer(socket, 'lol-betting');
}

// Wait for socket connection before registering
socket.on('connect', () => {
    register();
    
    // Request active bets
    socket.emit('lol-get-bets');
});

function setupEventListeners() {
    // Bet type buttons
    betTypeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            betTypeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedBetType = btn.dataset.bet === 'win';
            updateSubmitButton();
        });
    });
    
    // Username input — invalidate on change
    lolUsernameInput.addEventListener('input', () => {
        usernameValidated = false;
        validatedRiotId = null;
        validatedPuuid = null;
        validationStatus.textContent = '';
        validationStatus.className = 'validation-status';
        updateValidateButton();
        updateSubmitButton();
    });

    // Validate button
    validateBtn.addEventListener('click', handleValidateUsername);

    // Allow pressing Enter in the username field to trigger validation
    lolUsernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!validateBtn.disabled) handleValidateUsername();
        }
    });

    // Form inputs
    betAmountInput.addEventListener('input', updateSubmitButton);
    
    // Form submission
    betForm.addEventListener('submit', handleBetSubmit);
}

/**
 * Check whether the input looks like a Riot ID (contains #).
 */
function hasRiotIdFormat(value) {
    const trimmed = value.trim();
    const hashIndex = trimmed.lastIndexOf('#');
    if (hashIndex < 1) return false;
    const name = trimmed.slice(0, hashIndex).trim();
    const tag = trimmed.slice(hashIndex + 1).trim();
    return name.length >= 3 && name.length <= 16 && tag.length >= 2 && tag.length <= 5;
}

function updateValidateButton() {
    const value = lolUsernameInput.value;
    validateBtn.disabled = !hasRiotIdFormat(value) || usernameValidated;
}

function updateSubmitButton() {
    const amount = parseInt(betAmountInput.value);
    
    const isValid = 
        usernameValidated &&
        amount >= 1 && 
        amount <= 1000 &&
        selectedBetType !== null;
    
    submitBtn.disabled = !isValid;
}

// ============== USERNAME VALIDATION ==============

function handleValidateUsername() {
    const riotId = lolUsernameInput.value.trim();
    if (!hasRiotIdFormat(riotId)) return;

    validateBtn.disabled = true;
    validateBtn.textContent = '...';
    validationStatus.textContent = 'Searching...';
    validationStatus.className = 'validation-status loading';

    socket.emit('lol-validate-username', { riotId });
}

socket.on('lol-username-result', (data) => {
    validateBtn.textContent = 'SEARCH';

    if (data.valid) {
        usernameValidated = true;
        validatedRiotId = data.gameName + '#' + data.tagLine;
        validatedPuuid = data.puuid || null;
        lolUsernameInput.value = validatedRiotId;
        validationStatus.textContent = '✓ ' + validatedRiotId + ' found';
        validationStatus.className = 'validation-status valid';
    } else {
        usernameValidated = false;
        validatedRiotId = null;
        validatedPuuid = null;
        validationStatus.textContent = '✗ ' + (data.reason || 'Not found');
        validationStatus.className = 'validation-status invalid';
    }

    updateValidateButton();
    updateSubmitButton();
});

// ============== BET SUBMISSION ==============

function handleBetSubmit(e) {
    e.preventDefault();
    
    if (!usernameValidated || !validatedRiotId) {
        showError('Please validate the Riot ID first');
        return;
    }

    const amount = parseInt(betAmountInput.value);
    
    if (amount < 1 || amount > 1000 || selectedBetType === null) {
        showError('Please fill in all fields correctly');
        return;
    }
    
    if (amount > playerBalance) {
        showError('Insufficient balance');
        return;
    }
    
    // Disable form while submitting
    submitBtn.disabled = true;
    submitBtn.textContent = 'PLACING BET...';
    
    // Send bet to server
    socket.emit('lol-place-bet', {
        lolUsername: validatedRiotId,
        amount: amount,
        betOnWin: selectedBetType,
        puuid: validatedPuuid
    });
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
    
    setTimeout(() => {
        errorMessage.classList.remove('show');
    }, 5000);
}

// ============== SOCKET HANDLERS ==============

// Balance update
socket.on('balance-update', (data) => {
    playerBalance = data.balance;
    balanceDisplay.textContent = `💰 ${playerBalance.toFixed(0)} SC`;
});

// Bet placed successfully
socket.on('lol-bet-placed', (data) => {
    playerBalance = data.newBalance;
    balanceDisplay.textContent = `💰 ${playerBalance.toFixed(0)} SC`;
    
    // Reset form
    betForm.reset();
    betTypeButtons.forEach(b => b.classList.remove('active'));
    selectedBetType = null;
    usernameValidated = false;
    validatedRiotId = null;
    validatedPuuid = null;
    validationStatus.textContent = '';
    validationStatus.className = 'validation-status';
    submitBtn.disabled = true;
    submitBtn.textContent = 'PLACE BET';
    updateValidateButton();
    
    // Show success message
    showSuccessMessage();
});

// Bet warning/info
socket.on('lol-bet-warning', (data) => {
    if (data && data.message) {
        showNotification(data.message, 'info');
    }
});

// Bet error
socket.on('lol-bet-error', (data) => {
    showError(data.message || 'Failed to place bet');
    submitBtn.disabled = false;
    submitBtn.textContent = 'PLACE BET';
});

// Active bets update
socket.on('lol-bets-update', (data) => {
    renderBetsList(data.bets);
});

// Bet resolved notification
socket.on('lol-bet-resolved', (data) => {
    const { playerName, wonBet, payout, lolUsername, matchId } = data;
    
    // Only show notification if this is our bet
    const myName = window.StrictHotelSocket.getPlayerName();
    if (playerName !== myName) {
        return; // Not our bet, ignore
    }
    
    // Pass structured data to notification function
    showBetResolutionNotification({
        wonBet,
        payout,
        lolUsername
    });
    
    // Refresh balance if provided
    if (data.newBalance !== undefined) {
        playerBalance = data.newBalance;
        balanceDisplay.textContent = `💰 ${playerBalance.toFixed(0)} SC`;
    }
    
    // Request updated bets list
    socket.emit('lol-get-bets');
});

// Bet refunded notification
socket.on('lol-bet-refunded', (data) => {
    const myName = window.StrictHotelSocket.getPlayerName();
    if (data.playerName !== myName) {
        return;
    }

    const amount = Number(data.amount || 0);
    showNotification(`⏳ Bet timed out. ${amount.toFixed(0)} SC refunded.`, 'info');

    if (data.newBalance !== undefined) {
        playerBalance = data.newBalance;
        balanceDisplay.textContent = `💰 ${playerBalance.toFixed(0)} SC`;
    }

    socket.emit('lol-get-bets');
});

// ============== BET CHECK SOCKET LISTENERS ==============

function setupBetCheckListeners() {
    socket.on('lol-bet-check-result', (result) => {
        const { success, resolved, wonBet, payout, lolUsername, message, error } = result;
        
        if (success && resolved) {
            // Bet was resolved - show win/loss notification
            showNotification(message, wonBet ? 'success' : 'error');
            
            // Request updated bets list
            socket.emit('lol-get-bets');
        } else if (success && !resolved) {
            // No new match found - show info notification
            showNotification(message, 'info');
        } else {
            // Error occurred - show error notification
            showNotification(message, 'error');
        }
    });
}

/**
 * Handle manual bet status check request
 * Sends a socket request to check if a bet should be resolved and manages button states
 * @param {number} betId - The ID of the bet to check
 */
function handleCheckBetStatus(betId) {
    // Disable all check buttons temporarily
    const allCheckButtons = document.querySelectorAll('.check-bet-btn');
    allCheckButtons.forEach(btn => {
        btn.disabled = true;
        if (btn.dataset.betId === String(betId)) {
            btn.textContent = '🔄 Checking...';
        }
    });
    
    // Send check request
    socket.emit('lol-check-bet-status', { betId });
    
    // Re-enable buttons after a delay
    setTimeout(() => {
        allCheckButtons.forEach(btn => {
            btn.disabled = false;
            btn.textContent = '🔄 Check Status';
        });
    }, 1000);
}

// ============== UI RENDERING ==============

function renderBetsList(bets) {
    if (!bets || bets.length === 0) {
        betsList.innerHTML = '<div class="empty-state">No active bets yet. Be the first to bet!</div>';
        return;
    }
    
    const myName = window.StrictHotelSocket.getPlayerName();
    
    betsList.innerHTML = bets.map(bet => {
        const predictionText = bet.betOnWin ? 'WILL WIN' : 'WILL LOSE';
        const predictionIcon = bet.betOnWin ? '✅' : '❌';
        const isMyBet = bet.playerName === myName;
        
        return `
            <div class="bet-item">
                <div class="bet-info">
                    <div class="bet-player">👤 ${window.StrictHotelSocket.escapeHtml(bet.playerName)}</div>
                    <div class="bet-target">⚔️ ${window.StrictHotelSocket.escapeHtml(bet.lolUsername)}</div>
                    <div class="bet-prediction">${predictionIcon} ${predictionText}</div>
                </div>
                <div class="bet-right">
                    <div class="bet-amount">${bet.amount} SC</div>
                    ${isMyBet ? `<button class="check-bet-btn" data-bet-id="${bet.id}">🔄 Check Status</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // Add click handlers to check buttons
    if (myName) {
        const checkButtons = document.querySelectorAll('.check-bet-btn');
        checkButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const betId = parseInt(btn.dataset.betId);
                handleCheckBetStatus(betId);
            });
        });
    }
}

function showSuccessMessage() {
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #4caf50;
        color: white;
        padding: 20px 40px;
        border: 2px solid white;
        font-size: 1.2em;
        z-index: 1000;
        animation: fadeInOut 2s ease-in-out;
    `;
    successDiv.textContent = 'BET PLACED!';
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        document.body.removeChild(successDiv);
    }, 2000);
}

function showBetResolutionNotification(data) {
    const { wonBet, payout, lolUsername } = data;
    
    const notificationDiv = document.createElement('div');
    notificationDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${wonBet ? '#4caf50' : '#f44336'};
        color: white;
        padding: 30px 50px;
        border: 3px solid white;
        font-size: 1.3em;
        z-index: 1000;
        text-align: center;
        max-width: 80%;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;
    
    // Build message safely using textContent
    const messageDiv = document.createElement('div');
    if (wonBet) {
        messageDiv.textContent = `🎉 You won ${payout.toFixed(0)} SC! ${lolUsername} won their game!`;
    } else {
        messageDiv.textContent = `💀 You lost your bet. ${lolUsername} lost their game.`;
    }
    
    notificationDiv.appendChild(messageDiv);
    document.body.appendChild(notificationDiv);
    
    setTimeout(() => {
        document.body.removeChild(notificationDiv);
    }, 5000);
}

function showNotification(message, type = 'info') {
    const colors = {
        success: '#4caf50',
        error: '#f44336',
        info: '#2196f3'
    };
    
    const notificationDiv = document.createElement('div');
    notificationDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: ${colors[type] || colors.info};
        color: white;
        padding: 30px 50px;
        border: 3px solid white;
        font-size: 1.1em;
        z-index: 1000;
        text-align: center;
        max-width: 80%;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;
    
    notificationDiv.textContent = message;
    document.body.appendChild(notificationDiv);
    
    setTimeout(() => {
        if (document.body.contains(notificationDiv)) {
            document.body.removeChild(notificationDiv);
        }
    }, 5000);
}

// ============== START ==============

init();
