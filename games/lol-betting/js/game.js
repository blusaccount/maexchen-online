// ============== LOL BETTING CLIENT ==============

const socket = io();

let playerBalance = 0;
let selectedBetType = null;
let usernameValidated = false;
let validatedRiotId = null;

// Constants
const NAME_KEY = 'stricthotel-name';
const CHAR_KEY = 'stricthotel-character';

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
}

// Register player and request data on socket connection
function register() {
    const name = localStorage.getItem(NAME_KEY) || '';
    if (!name) {
        balanceDisplay.textContent = '💰 Not logged in';
        return;
    }
    
    const charJSON = localStorage.getItem(CHAR_KEY);
    let character = null;
    try { 
        character = charJSON ? JSON.parse(charJSON) : null; 
    } catch (e) { 
        /* ignore */ 
    }
    
    socket.emit('register-player', { name: name, character: character, game: 'lol-betting' });
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
        lolUsernameInput.value = validatedRiotId;
        validationStatus.textContent = '✓ ' + validatedRiotId + ' found';
        validationStatus.className = 'validation-status valid';
    } else {
        usernameValidated = false;
        validatedRiotId = null;
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
        betOnWin: selectedBetType
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
    validationStatus.textContent = '';
    validationStatus.className = 'validation-status';
    submitBtn.disabled = true;
    submitBtn.textContent = 'PLACE BET';
    updateValidateButton();
    
    // Show success message
    showSuccessMessage();
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

// ============== UI RENDERING ==============

function renderBetsList(bets) {
    if (!bets || bets.length === 0) {
        betsList.innerHTML = '<div class="empty-state">No active bets yet. Be the first to bet!</div>';
        return;
    }
    
    betsList.innerHTML = bets.map(bet => {
        const predictionText = bet.betOnWin ? 'WILL WIN' : 'WILL LOSE';
        const predictionIcon = bet.betOnWin ? '✅' : '❌';
        
        return `
            <div class="bet-item">
                <div class="bet-info">
                    <div class="bet-player">👤 ${escapeHtml(bet.playerName)}</div>
                    <div class="bet-target">⚔️ ${escapeHtml(bet.lolUsername)}</div>
                    <div class="bet-prediction">${predictionIcon} ${predictionText}</div>
                </div>
                <div class="bet-amount">${bet.amount} SC</div>
            </div>
        `;
    }).join('');
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============== START ==============

init();
