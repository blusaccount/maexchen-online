// ============== LOL BETTING CLIENT ==============

const socket = io();

let playerBalance = 0;
let selectedBetType = null;

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
    
    // Form inputs
    lolUsernameInput.addEventListener('input', updateSubmitButton);
    betAmountInput.addEventListener('input', updateSubmitButton);
    
    // Form submission
    betForm.addEventListener('submit', handleBetSubmit);
}

function updateSubmitButton() {
    const username = lolUsernameInput.value.trim();
    const amount = parseInt(betAmountInput.value);
    
    const isValid = 
        username.length >= 3 && 
        username.length <= 16 &&
        amount >= 1 && 
        amount <= 1000 &&
        selectedBetType !== null;
    
    submitBtn.disabled = !isValid;
}

// ============== BET SUBMISSION ==============

function handleBetSubmit(e) {
    e.preventDefault();
    
    const username = lolUsernameInput.value.trim();
    const amount = parseInt(betAmountInput.value);
    
    if (!username || amount < 1 || amount > 1000 || selectedBetType === null) {
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
        lolUsername: username,
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
    submitBtn.disabled = true;
    submitBtn.textContent = 'PLACE BET';
    
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
