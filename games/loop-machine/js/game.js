// ===== Loop Machine Client =====
// Socket.IO + Web Audio API for collaborative step sequencer

const socket = io();
const LOOP_MIN_BARS = 1;
const LOOP_MAX_BARS = 8;
const STEPS_PER_BAR = 4;
const DEFAULT_BARS = 4;

function createEmptyRow(bars = DEFAULT_BARS) {
    return new Array(bars * STEPS_PER_BAR).fill(0);
}

// ===== State =====
const state = {
    grid: {
        kick: createEmptyRow(),
        snare: createEmptyRow(),
        hihat: createEmptyRow(),
        clap: createEmptyRow(),
        tom: createEmptyRow(),
        ride: createEmptyRow(),
        cowbell: createEmptyRow(),
        bass: createEmptyRow(),
        synth: createEmptyRow(),
        pluck: createEmptyRow(),
        pad: createEmptyRow()
    },
    bpm: 120,
    bars: DEFAULT_BARS,
    isPlaying: false,
    currentStep: 0,
    listeners: [],
    masterVolume: 1.0
};

const synthSettings = {
    waveform: 'square',
    frequency: 440,
    cutoff: 2000,
    resonance: 1,
    attack: 0.01,
    decay: 0.2,
    volume: 0.3
};

const bassSettings = {
    waveform: 'sine',
    frequency: 65.41, // C2
    cutoff: 800,
    resonance: 1,
    attack: 0.01,
    decay: 0.5,
    distortion: 0
};

// ===== Audio Context & Synthesis =====
let audioContext;
let masterGainNode;
let isAudioInitialized = false;

function initAudio() {
    if (isAudioInitialized) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create master gain node for volume control
    masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = 1.0; // Default 100%
    masterGainNode.connect(audioContext.destination);
    
    isAudioInitialized = true;
    console.log('[LoopMachine] Audio context initialized');
}

function playKick() {
    if (!audioContext || !masterGainNode) return;
    const now = audioContext.currentTime;
    
    // Oscillator for punch
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
    
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc.connect(gain);
    gain.connect(masterGainNode);
    
    osc.start(now);
    osc.stop(now + 0.3);
}

function playSnare() {
    if (!audioContext || !masterGainNode) return;
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
    noiseGain.connect(masterGainNode);
    
    // Oscillator component
    const osc = audioContext.createOscillator();
    const oscGain = audioContext.createGain();
    
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
    
    oscGain.gain.setValueAtTime(0.3, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    osc.connect(oscGain);
    oscGain.connect(masterGainNode);
    
    noise.start(now);
    noise.stop(now + 0.2);
    osc.start(now);
    osc.stop(now + 0.15);
}

function playHihat() {
    if (!audioContext || !masterGainNode) return;
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
    gain.connect(masterGainNode);
    
    noise.start(now);
    noise.stop(now + 0.1);
}

function playClap() {
    if (!audioContext || !masterGainNode) return;
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
    gain.connect(masterGainNode);
    
    noise.start(now);
    noise.stop(now + 0.15);
}

function playBass() {
    if (!audioContext || !masterGainNode) return;
    const now = audioContext.currentTime;
    
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    
    // Use bassSettings
    osc.type = bassSettings.waveform;
    osc.frequency.setValueAtTime(bassSettings.frequency, now);
    
    // Filter
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(bassSettings.cutoff, now);
    filter.frequency.exponentialRampToValueAtTime(
        Math.max(50, bassSettings.cutoff * 0.3),
        now + bassSettings.attack + bassSettings.decay
    );
    filter.Q.value = bassSettings.resonance;
    
    // Envelope: attack then decay
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.5, now + bassSettings.attack);
    gain.gain.exponentialRampToValueAtTime(0.01, now + bassSettings.attack + bassSettings.decay);
    
    osc.connect(filter);
    
    // Optional distortion
    if (bassSettings.distortion > 0) {
        const distortion = audioContext.createWaveShaper();
        distortion.curve = makeDistortionCurve(bassSettings.distortion * 100);
        filter.connect(distortion);
        distortion.connect(gain);
    } else {
        filter.connect(gain);
    }
    
    gain.connect(masterGainNode);
    
    const duration = bassSettings.attack + bassSettings.decay;
    osc.start(now);
    osc.stop(now + duration);
}

function makeDistortionCurve(amount) {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    
    for (let i = 0; i < samples; i++) {
        const x = (i * 2 / samples) - 1;
        curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
    }
    return curve;
}

function playTom() {
    if (!audioContext || !masterGainNode) return;
    const now = audioContext.currentTime;
    
    // Oscillator starting at ~120Hz with quick pitch envelope down to 50Hz
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
    
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    
    osc.connect(gain);
    gain.connect(masterGainNode);
    
    osc.start(now);
    osc.stop(now + 0.4);
}

function playRide() {
    if (!audioContext || !masterGainNode) return;
    const now = audioContext.currentTime;
    
    // High-frequency noise with band-pass filter
    const bufferSize = audioContext.sampleRate * 0.3;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 10000;
    filter.Q.value = 1;
    
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainNode);
    
    noise.start(now);
    noise.stop(now + 0.3);
}

function playCowbell() {
    if (!audioContext || !masterGainNode) return;
    const now = audioContext.currentTime;
    
    // Two square wave oscillators (800Hz + 540Hz)
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(800, now);
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(540, now);
    
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 1;
    
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainNode);
    
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.1);
    osc2.stop(now + 0.1);
}

function playPluck() {
    if (!audioContext || !masterGainNode) return;
    const now = audioContext.currentTime;
    
    // Triangle wave with fast attack and medium decay
    const osc = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now); // A3
    
    // Filter sweep for pluck character
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.3);
    filter.Q.value = 2;
    
    // Fast attack, medium decay
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainNode);
    
    osc.start(now);
    osc.stop(now + 0.3);
}

function playPad() {
    if (!audioContext || !masterGainNode) return;
    const now = audioContext.currentTime;
    
    // Multiple detuned oscillators for rich pad sound
    const osc1 = audioContext.createOscillator();
    const osc2 = audioContext.createOscillator();
    const osc3 = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    const baseFreq = 130.81; // C3
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(baseFreq * 1.01, now); // Slightly detuned
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(baseFreq * 0.99, now); // Slightly detuned down
    
    // Slow attack and long release
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.2);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
    
    osc1.connect(gain);
    osc2.connect(gain);
    osc3.connect(gain);
    gain.connect(masterGainNode);
    
    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    osc1.stop(now + 1.0);
    osc2.stop(now + 1.0);
    osc3.stop(now + 1.0);
}

function playSynth() {
    if (!audioContext || !masterGainNode) return;
    const now = audioContext.currentTime;
    
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    
    // Use synthSettings
    osc.type = synthSettings.waveform;
    osc.frequency.setValueAtTime(synthSettings.frequency, now);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(synthSettings.cutoff, now);
    filter.frequency.exponentialRampToValueAtTime(
        Math.max(50, synthSettings.cutoff * 0.4), 
        now + synthSettings.attack + synthSettings.decay
    );
    filter.Q.value = synthSettings.resonance;
    
    // Envelope: attack then decay
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(synthSettings.volume, now + synthSettings.attack);
    gain.gain.exponentialRampToValueAtTime(0.01, now + synthSettings.attack + synthSettings.decay);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainNode);
    
    const duration = synthSettings.attack + synthSettings.decay;
    osc.start(now);
    osc.stop(now + duration);
}

const instrumentPlayers = {
    kick: playKick,
    snare: playSnare,
    hihat: playHihat,
    clap: playClap,
    tom: playTom,
    ride: playRide,
    cowbell: playCowbell,
    bass: playBass,
    synth: playSynth,
    pluck: playPluck,
    pad: playPad
};

// ===== Sequencer Loop =====
let loopInterval = null;

function startLoop() {
    if (loopInterval) return;
    
    const stepDuration = (60 / state.bpm) * 1000 / 4; // 16th notes
    
    loopInterval = setInterval(() => {
        playStep(state.currentStep);
        updateStepHighlight(state.currentStep);
        
        const totalSteps = state.bars * STEPS_PER_BAR;
        state.currentStep = (state.currentStep + 1) % totalSteps;
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
    const instruments = ['kick', 'snare', 'hihat', 'clap', 'tom', 'ride', 'cowbell', 'bass', 'synth', 'pluck', 'pad'];
    
    instruments.forEach(instrument => {
        const container = document.querySelector(`.grid-cells[data-instrument="${instrument}"]`);
        if (!container) return;
        
        container.innerHTML = '';
        const totalSteps = state.bars * STEPS_PER_BAR;
        for (let step = 0; step < totalSteps; step++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            if (step % STEPS_PER_BAR === 0 && step > 0) {
                cell.classList.add('bar-start');
            }
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
            `<div class="listener-tag">${window.StrictHotelSocket.escapeHtml(name)}</div>`
        ).join('');
    }
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
    
    // Register player for global online status
    const name = window.StrictHotelSocket.getPlayerName();
    if (name) {
        window.StrictHotelSocket.registerPlayer(socket, 'loop-machine');
    }
    
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
    document.getElementById('bars-input').disabled = true;
    document.getElementById('master-volume').disabled = true;
    enableSynthControls(false);
    enableBassControls(false);
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

    // Update bars
    if (Number.isInteger(data.bars)) {
        state.bars = data.bars;
        document.getElementById('bars-input').value = data.bars;
        const totalSteps = state.bars * STEPS_PER_BAR;
        state.currentStep = state.currentStep % totalSteps;
    }
    
    // Update master volume
    if (typeof data.masterVolume === 'number') {
        state.masterVolume = data.masterVolume;
        if (masterGainNode) {
            masterGainNode.gain.value = data.masterVolume;
        }
        document.getElementById('master-volume').value = Math.round(data.masterVolume * 100);
        document.getElementById('master-volume-value').textContent = Math.round(data.masterVolume * 100) + '%';
    }
    
    // Update synth settings
    if (data.synth) {
        Object.assign(synthSettings, data.synth);
        updateSynthUI();
    }
    
    // Update bass settings
    if (data.bass) {
        Object.assign(bassSettings, data.bass);
        updateBassUI();
    }
    
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
    document.getElementById('bars-input').disabled = false;
    document.getElementById('master-volume').disabled = false;
    enableSynthControls(true);
    enableBassControls(true);
    
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

socket.on('loop-synth-updated', (data) => {
    console.log('[LoopMachine] Synth updated', data);
    Object.assign(synthSettings, data);
    updateSynthUI();
});

socket.on('loop-master-volume-updated', (data) => {
    console.log('[LoopMachine] Master volume updated', data);
    state.masterVolume = data.masterVolume;
    if (masterGainNode) {
        masterGainNode.gain.value = data.masterVolume;
    }
    document.getElementById('master-volume').value = Math.round(data.masterVolume * 100);
    document.getElementById('master-volume-value').textContent = Math.round(data.masterVolume * 100) + '%';
});

socket.on('loop-bass-updated', (data) => {
    console.log('[LoopMachine] Bass updated', data);
    Object.assign(bassSettings, data);
    updateBassUI();
});

// ===== Synth Helpers =====
function emitSynthSettings() {
    socket.emit('loop-set-synth', { ...synthSettings });
}

function updateSynthUI() {
    // Update wave buttons
    document.querySelectorAll('.wave-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.wave === synthSettings.waveform);
    });
    
    // Update note dropdown
    const noteSelect = document.getElementById('synth-note');
    if (noteSelect) noteSelect.value = synthSettings.frequency;
    
    // Update sliders and their value displays
    const cutoffSlider = document.getElementById('synth-cutoff');
    const cutoffValue = document.getElementById('synth-cutoff-value');
    if (cutoffSlider) cutoffSlider.value = synthSettings.cutoff;
    if (cutoffValue) cutoffValue.textContent = synthSettings.cutoff;
    
    const resoSlider = document.getElementById('synth-resonance');
    const resoValue = document.getElementById('synth-resonance-value');
    if (resoSlider) resoSlider.value = Math.round(synthSettings.resonance * 10);
    if (resoValue) resoValue.textContent = (synthSettings.resonance).toFixed(1);
    
    const attackSlider = document.getElementById('synth-attack');
    const attackValue = document.getElementById('synth-attack-value');
    if (attackSlider) attackSlider.value = Math.round(synthSettings.attack * 100);
    if (attackValue) attackValue.textContent = (synthSettings.attack).toFixed(2) + 's';
    
    const decaySlider = document.getElementById('synth-decay');
    const decayValue = document.getElementById('synth-decay-value');
    if (decaySlider) decaySlider.value = Math.round(synthSettings.decay * 100);
    if (decayValue) decayValue.textContent = (synthSettings.decay).toFixed(2) + 's';
    
    const volSlider = document.getElementById('synth-volume');
    const volValue = document.getElementById('synth-volume-value');
    if (volSlider) volSlider.value = Math.round(synthSettings.volume * 100);
    if (volValue) volValue.textContent = Math.round(synthSettings.volume * 100) + '%';
}

function enableSynthControls(enabled) {
    // Enable/disable wave buttons for synth
    document.querySelectorAll('.wave-btn:not([data-target="bass"])').forEach(btn => {
        btn.disabled = !enabled;
    });
    
    // Enable/disable note dropdown
    const noteSelect = document.getElementById('synth-note');
    if (noteSelect) noteSelect.disabled = !enabled;
    
    // Enable/disable all sliders
    const sliders = ['synth-cutoff', 'synth-resonance', 'synth-attack', 'synth-decay', 'synth-volume'];
    sliders.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !enabled;
    });
}

// ===== Bass Helpers =====
function emitBassSettings() {
    socket.emit('loop-set-bass', { ...bassSettings });
}

function updateBassUI() {
    // Update wave buttons
    document.querySelectorAll('.wave-btn[data-target="bass"]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.wave === bassSettings.waveform);
    });
    
    // Update note dropdown
    const noteSelect = document.getElementById('bass-note');
    if (noteSelect) noteSelect.value = bassSettings.frequency;
    
    // Update sliders and their value displays
    const cutoffSlider = document.getElementById('bass-cutoff');
    const cutoffValue = document.getElementById('bass-cutoff-value');
    if (cutoffSlider) cutoffSlider.value = bassSettings.cutoff;
    if (cutoffValue) cutoffValue.textContent = bassSettings.cutoff;
    
    const resoSlider = document.getElementById('bass-resonance');
    const resoValue = document.getElementById('bass-resonance-value');
    if (resoSlider) resoSlider.value = Math.round(bassSettings.resonance * 10);
    if (resoValue) resoValue.textContent = (bassSettings.resonance).toFixed(1);
    
    const attackSlider = document.getElementById('bass-attack');
    const attackValue = document.getElementById('bass-attack-value');
    if (attackSlider) attackSlider.value = Math.round(bassSettings.attack * 100);
    if (attackValue) attackValue.textContent = (bassSettings.attack).toFixed(2) + 's';
    
    const decaySlider = document.getElementById('bass-decay');
    const decayValue = document.getElementById('bass-decay-value');
    if (decaySlider) decaySlider.value = Math.round(bassSettings.decay * 100);
    if (decayValue) decayValue.textContent = (bassSettings.decay).toFixed(2) + 's';
    
    const distSlider = document.getElementById('bass-distortion');
    const distValue = document.getElementById('bass-distortion-value');
    if (distSlider) distSlider.value = Math.round(bassSettings.distortion * 100);
    if (distValue) distValue.textContent = Math.round(bassSettings.distortion * 100) + '%';
}

function enableBassControls(enabled) {
    // Enable/disable wave buttons for bass
    document.querySelectorAll('.wave-btn[data-target="bass"]').forEach(btn => {
        btn.disabled = !enabled;
    });
    
    // Enable/disable note dropdown
    const noteSelect = document.getElementById('bass-note');
    if (noteSelect) noteSelect.disabled = !enabled;
    
    // Enable/disable all sliders
    const sliders = ['bass-cutoff', 'bass-resonance', 'bass-attack', 'bass-decay', 'bass-distortion'];
    sliders.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !enabled;
    });
}

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

document.getElementById('bars-input').addEventListener('change', (e) => {
    let bars = parseInt(e.target.value, 10);
    if (bars < LOOP_MIN_BARS) bars = LOOP_MIN_BARS;
    if (bars > LOOP_MAX_BARS) bars = LOOP_MAX_BARS;
    e.target.value = bars;
    socket.emit('loop-set-bars', { bars });
});

// Master volume slider
const masterVolumeSlider = document.getElementById('master-volume');
const masterVolumeValue = document.getElementById('master-volume-value');
if (masterVolumeSlider && masterVolumeValue) {
    masterVolumeSlider.addEventListener('input', (e) => {
        initAudio();
        const volume = parseInt(e.target.value, 10) / 100;
        state.masterVolume = volume;
        if (masterGainNode) {
            masterGainNode.gain.value = volume;
        }
        masterVolumeValue.textContent = e.target.value + '%';
        socket.emit('loop-set-master-volume', { masterVolume: volume });
    });
}

// ===== Synth Controls =====
// Collapsible toggle
const synthHeader = document.getElementById('synth-header');
const synthControls = document.getElementById('synth-controls');
if (synthHeader && synthControls) {
    synthHeader.addEventListener('click', () => {
        const isHidden = synthControls.style.display === 'none';
        synthControls.style.display = isHidden ? '' : 'none';
        synthHeader.classList.toggle('collapsed', !isHidden);
    });
}

// Wave buttons
document.querySelectorAll('.wave-btn:not([data-target="bass"])').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.disabled) return;
        initAudio();
        synthSettings.waveform = btn.dataset.wave;
        updateSynthUI();
        emitSynthSettings();
    });
});

// Note dropdown
const noteSelect = document.getElementById('synth-note');
if (noteSelect) {
    noteSelect.addEventListener('change', (e) => {
        initAudio();
        synthSettings.frequency = parseFloat(e.target.value);
        emitSynthSettings();
    });
}

// Cutoff slider
const cutoffSlider = document.getElementById('synth-cutoff');
const cutoffValue = document.getElementById('synth-cutoff-value');
if (cutoffSlider && cutoffValue) {
    cutoffSlider.addEventListener('input', (e) => {
        initAudio();
        synthSettings.cutoff = parseInt(e.target.value, 10);
        cutoffValue.textContent = synthSettings.cutoff;
        emitSynthSettings();
    });
}

// Resonance slider
const resoSlider = document.getElementById('synth-resonance');
const resoValue = document.getElementById('synth-resonance-value');
if (resoSlider && resoValue) {
    resoSlider.addEventListener('input', (e) => {
        initAudio();
        synthSettings.resonance = parseInt(e.target.value, 10) / 10;
        resoValue.textContent = synthSettings.resonance.toFixed(1);
        emitSynthSettings();
    });
}

// Attack slider
const attackSlider = document.getElementById('synth-attack');
const attackValue = document.getElementById('synth-attack-value');
if (attackSlider && attackValue) {
    attackSlider.addEventListener('input', (e) => {
        initAudio();
        synthSettings.attack = parseInt(e.target.value, 10) / 100;
        attackValue.textContent = synthSettings.attack.toFixed(2) + 's';
        emitSynthSettings();
    });
}

// Decay slider
const decaySlider = document.getElementById('synth-decay');
const decayValue = document.getElementById('synth-decay-value');
if (decaySlider && decayValue) {
    decaySlider.addEventListener('input', (e) => {
        initAudio();
        synthSettings.decay = parseInt(e.target.value, 10) / 100;
        decayValue.textContent = synthSettings.decay.toFixed(2) + 's';
        emitSynthSettings();
    });
}

// Volume slider
const volSlider = document.getElementById('synth-volume');
const volValue = document.getElementById('synth-volume-value');
if (volSlider && volValue) {
    volSlider.addEventListener('input', (e) => {
        initAudio();
        synthSettings.volume = parseInt(e.target.value, 10) / 100;
        volValue.textContent = Math.round(synthSettings.volume * 100) + '%';
        emitSynthSettings();
    });
}

// ===== Bass Controls =====
// Collapsible toggle
const bassHeader = document.getElementById('bass-header');
const bassControls = document.getElementById('bass-controls');
if (bassHeader && bassControls) {
    bassHeader.addEventListener('click', () => {
        const isHidden = bassControls.style.display === 'none';
        bassControls.style.display = isHidden ? '' : 'none';
        bassHeader.classList.toggle('collapsed', !isHidden);
    });
}

// Wave buttons
document.querySelectorAll('.wave-btn[data-target="bass"]').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.disabled) return;
        initAudio();
        bassSettings.waveform = btn.dataset.wave;
        updateBassUI();
        emitBassSettings();
    });
});

// Note dropdown
const bassNoteSelect = document.getElementById('bass-note');
if (bassNoteSelect) {
    bassNoteSelect.addEventListener('change', (e) => {
        initAudio();
        bassSettings.frequency = parseFloat(e.target.value);
        emitBassSettings();
    });
}

// Cutoff slider
const bassCutoffSlider = document.getElementById('bass-cutoff');
const bassCutoffValue = document.getElementById('bass-cutoff-value');
if (bassCutoffSlider && bassCutoffValue) {
    bassCutoffSlider.addEventListener('input', (e) => {
        initAudio();
        bassSettings.cutoff = parseInt(e.target.value, 10);
        bassCutoffValue.textContent = bassSettings.cutoff;
        emitBassSettings();
    });
}

// Resonance slider
const bassResoSlider = document.getElementById('bass-resonance');
const bassResoValue = document.getElementById('bass-resonance-value');
if (bassResoSlider && bassResoValue) {
    bassResoSlider.addEventListener('input', (e) => {
        initAudio();
        bassSettings.resonance = parseInt(e.target.value, 10) / 10;
        bassResoValue.textContent = bassSettings.resonance.toFixed(1);
        emitBassSettings();
    });
}

// Attack slider
const bassAttackSlider = document.getElementById('bass-attack');
const bassAttackValue = document.getElementById('bass-attack-value');
if (bassAttackSlider && bassAttackValue) {
    bassAttackSlider.addEventListener('input', (e) => {
        initAudio();
        bassSettings.attack = parseInt(e.target.value, 10) / 100;
        bassAttackValue.textContent = bassSettings.attack.toFixed(2) + 's';
        emitBassSettings();
    });
}

// Decay slider
const bassDecaySlider = document.getElementById('bass-decay');
const bassDecayValue = document.getElementById('bass-decay-value');
if (bassDecaySlider && bassDecayValue) {
    bassDecaySlider.addEventListener('input', (e) => {
        initAudio();
        bassSettings.decay = parseInt(e.target.value, 10) / 100;
        bassDecayValue.textContent = bassSettings.decay.toFixed(2) + 's';
        emitBassSettings();
    });
}

// Distortion slider
const bassDistSlider = document.getElementById('bass-distortion');
const bassDistValue = document.getElementById('bass-distortion-value');
if (bassDistSlider && bassDistValue) {
    bassDistSlider.addEventListener('input', (e) => {
        initAudio();
        bassSettings.distortion = parseInt(e.target.value, 10) / 100;
        bassDistValue.textContent = Math.round(bassSettings.distortion * 100) + '%';
        emitBassSettings();
    });
}

// ===== Cleanup =====
window.addEventListener('beforeunload', () => {
    socket.emit('loop-leave');
    stopLoop();
});

// ===== Initialize =====
renderGrid();
setStatus('Connecting...', '');
