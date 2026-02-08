// ===== Loop Machine Client =====
// Socket.IO + Web Audio API for collaborative step sequencer

const socket = io();

// ===== State =====
const state = {
    grid: {
        kick: new Array(16).fill(0),
        snare: new Array(16).fill(0),
        hihat: new Array(16).fill(0),
        clap: new Array(16).fill(0),
        bass: new Array(16).fill(0),
        synth: new Array(16).fill(0)
    },
    bpm: 120,
    isPlaying: false,
    currentStep: 0,
    listeners: []
};

// ===== Audio Context & Synthesis =====
let audioContext;
let isAudioInitialized = false;

function initAudio() {
    if (isAudioInitialized) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    isAudioInitialized = true;
    console.log('[LoopMachine] Audio context initialized');
}

function playKick() {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    
    // Oscillator for punch
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
    
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start(now);
    osc.stop(now + 0.3);
}

function playSnare() {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    
    // White noise + oscillator
    const bufferSize = audioContext.sampleRate * 0.2;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    
    const noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;
    
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioContext.destination);
    
    // Oscillator component
    const osc = audioContext.createOscillator();
    const oscGain = audioContext.createGain();
    
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
    
    oscGain.gain.setValueAtTime(0.3, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    osc.connect(oscGain);
    oscGain.connect(audioContext.destination);
    
    noise.start(now);
    noise.stop(now + 0.2);
    osc.start(now);
    osc.stop(now + 0.15);
}

function playHihat() {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    
    // High-frequency filtered noise
    const bufferSize = audioContext.sampleRate * 0.1;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    
    noise.start(now);
    noise.stop(now + 0.1);
}

function playClap() {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    
    // Filtered noise with envelope
    const bufferSize = audioContext.sampleRate * 0.15;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    filter.Q.value = 1;
    
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    
    noise.start(now);
    noise.stop(now + 0.15);
}

function playBass() {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now);
    
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start(now);
    osc.stop(now + 0.3);
}

function playSynth() {
    if (!audioContext) return;
    const now = audioContext.currentTime;
    
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, now);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(800, now + 0.2);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.start(now);
    osc.stop(now + 0.2);
}

const instrumentPlayers = {
    kick: playKick,
    snare: playSnare,
    hihat: playHihat,
    clap: playClap,
    bass: playBass,
    synth: playSynth
};

// ===== Sequencer Loop =====
let loopInterval = null;

function startLoop() {
    if (loopInterval) return;
    
    const stepDuration = (60 / state.bpm) * 1000 / 4; // 16th notes
    
    loopInterval = setInterval(() => {
        playStep(state.currentStep);
        updateStepHighlight(state.currentStep);
        
        state.currentStep = (state.currentStep + 1) % 16;
    }, stepDuration);
}

function stopLoop() {
    if (loopInterval) {
        clearInterval(loopInterval);
        loopInterval = null;
    }
    state.currentStep = 0;
    updateStepHighlight(-1); // Clear highlight
}

function playStep(step) {
    for (const instrument in state.grid) {
        if (state.grid[instrument][step] === 1) {
            instrumentPlayers[instrument]();
        }
    }
}

function updateStepHighlight(currentStep) {
    // Remove previous highlight
    document.querySelectorAll('.grid-cell.current-step').forEach(cell => {
        cell.classList.remove('current-step');
    });
    
    // Add highlight to current step
    if (currentStep >= 0) {
        document.querySelectorAll(`.grid-cell[data-step="${currentStep}"]`).forEach(cell => {
            cell.classList.add('current-step');
        });
    }
}

// ===== UI =====
function renderGrid() {
    const instruments = ['kick', 'snare', 'hihat', 'clap', 'bass', 'synth'];
    
    instruments.forEach(instrument => {
        const container = document.querySelector(`.grid-cells[data-instrument="${instrument}"]`);
        if (!container) return;
        
        container.innerHTML = '';
        for (let step = 0; step < 16; step++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.instrument = instrument;
            cell.dataset.step = step;
            
            if (state.grid[instrument][step] === 1) {
                cell.classList.add('active');
            }
            
            cell.addEventListener('click', () => {
                handleCellClick(instrument, step);
            });
            
            container.appendChild(cell);
        }
    });
}

function handleCellClick(instrument, step) {
    initAudio(); // Initialize audio on first interaction
    socket.emit('loop-toggle-cell', { instrument, step });
}

function updateCell(instrument, step, value) {
    state.grid[instrument][step] = value;
    const cell = document.querySelector(`.grid-cell[data-instrument="${instrument}"][data-step="${step}"]`);
    if (cell) {
        if (value === 1) {
            cell.classList.add('active');
        } else {
            cell.classList.remove('active');
        }
    }
}

function updateListeners(listeners) {
    state.listeners = listeners;
    const listEl = document.getElementById('listeners-list');
    const countEl = document.getElementById('listener-count');
    
    countEl.textContent = listeners.length;
    
    if (listeners.length === 0) {
        listEl.innerHTML = '<div class="listener-tag">No one here</div>';
    } else {
        listEl.innerHTML = listeners.map(name => 
            `<div class="listener-tag">${escapeHtml(name)}</div>`
        ).join('');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updatePlayPauseButton() {
    const btn = document.getElementById('play-pause-btn');
    if (state.isPlaying) {
        btn.textContent = '⏸ PAUSE';
    } else {
        btn.textContent = '▶ PLAY';
    }
}

function setStatus(message, type = '') {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = message;
    statusEl.className = 'status-message ' + type;
}

// ===== Socket Events =====
socket.on('connect', () => {
    console.log('[LoopMachine] Connected');
    setStatus('Connected', 'success');
    socket.emit('loop-join');
});

socket.on('disconnect', () => {
    console.log('[LoopMachine] Disconnected');
    setStatus('Disconnected', 'error');
    stopLoop();
    
    // Disable controls
    document.getElementById('play-pause-btn').disabled = true;
    document.getElementById('clear-btn').disabled = true;
    document.getElementById('bpm-input').disabled = true;
});

socket.on('loop-sync', (data) => {
    console.log('[LoopMachine] Sync received', data);
    
    // Update grid
    for (const instrument in data.grid) {
        state.grid[instrument] = [...data.grid[instrument]];
    }
    
    // Update BPM
    state.bpm = data.bpm;
    document.getElementById('bpm-input').value = data.bpm;
    
    // Update playing state
    state.isPlaying = data.isPlaying;
    updatePlayPauseButton();
    
    if (state.isPlaying) {
        initAudio();
        startLoop();
    } else {
        stopLoop();
    }
    
    // Update listeners
    updateListeners(data.listeners);
    
    // Re-render grid
    renderGrid();
    
    // Enable controls
    document.getElementById('play-pause-btn').disabled = false;
    document.getElementById('clear-btn').disabled = false;
    document.getElementById('bpm-input').disabled = false;
    
    setStatus('Synced', 'success');
});

socket.on('loop-cell-updated', (data) => {
    console.log('[LoopMachine] Cell updated', data);
    updateCell(data.instrument, data.step, data.value);
});

socket.on('loop-bpm-updated', (data) => {
    console.log('[LoopMachine] BPM updated', data);
    state.bpm = data.bpm;
    document.getElementById('bpm-input').value = data.bpm;
    
    // Restart loop with new BPM if playing
    if (state.isPlaying) {
        stopLoop();
        startLoop();
    }
});

socket.on('loop-state-updated', (data) => {
    console.log('[LoopMachine] State updated', data);
    state.isPlaying = data.isPlaying;
    updatePlayPauseButton();
    
    if (data.isPlaying) {
        initAudio();
        startLoop();
    } else {
        stopLoop();
    }
});

socket.on('loop-listeners', (data) => {
    console.log('[LoopMachine] Listeners updated', data);
    updateListeners(data.listeners);
});

// ===== Controls =====
document.getElementById('play-pause-btn').addEventListener('click', () => {
    initAudio(); // Initialize audio on first interaction
    socket.emit('loop-play-pause');
});

document.getElementById('clear-btn').addEventListener('click', () => {
    if (confirm('Clear the entire grid?')) {
        socket.emit('loop-clear');
    }
});

document.getElementById('bpm-input').addEventListener('change', (e) => {
    let bpm = parseInt(e.target.value, 10);
    if (bpm < 60) bpm = 60;
    if (bpm > 200) bpm = 200;
    e.target.value = bpm;
    socket.emit('loop-set-bpm', { bpm });
});

// ===== Cleanup =====
window.addEventListener('beforeunload', () => {
    socket.emit('loop-leave');
    stopLoop();
});

// ===== Initialize =====
renderGrid();
setStatus('Connecting...', '');
