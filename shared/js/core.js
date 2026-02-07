// ============================
// MÄXCHEN ONLINE - Main Entry
// ============================

// Socket connection
const socket = io();

// DOM helper
const $ = id => document.getElementById(id);

// Screens
const screens = {
    start: $('screen-start'),
    waiting: $('screen-waiting'),
    game: $('screen-game'),
    reveal: $('screen-reveal'),
    gameover: $('screen-gameover')
};

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

// Client state
const state = {
    mySocketId: null,
    roomCode: null,
    isHost: false,
    playerName: '',
    gamePlayers: [],
    myPlayerIndex: -1,
    currentPlayerIndex: -1
};

// Socket ID
socket.on('connect', () => {
    state.mySocketId = socket.id;
});

// Error handling
socket.on('error', ({ message }) => {
    console.warn('Server:', message);
    const errorEl = $('start-error');
    if (errorEl) errorEl.textContent = message;
});

// Title click - return to start (all title elements)
document.querySelectorAll('.title-maexchen').forEach(el => {
    el.addEventListener('click', () => {
        if (state.roomCode) {
            socket.emit('leave-room');
        }
        // Reset state
        state.roomCode = null;
        state.isHost = false;
        state.gamePlayers = [];
        state.myPlayerIndex = -1;
        state.currentPlayerIndex = -1;

        // Hide chat
        if (window.MaexchenChat) {
            window.MaexchenChat.hideChat();
        }

        // Stop ambient sounds
        if (window.MaexchenAmbient) {
            window.MaexchenAmbient.stop();
        }

        // Cleanup watch party
        if (window.MaexchenWatchParty) {
            window.MaexchenWatchParty.cleanup();
        }

        // Show start screen
        showScreen('start');
    });
});

// Export for global access
window.MaexchenApp = { socket, $, showScreen, state };
