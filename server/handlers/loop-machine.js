const LOOP_ROOM = 'loop-machine-room';
const LOOP_MIN_BARS = 1;
const LOOP_MAX_BARS = 8;
const LOOP_STEPS_PER_BAR = 4;
const LOOP_DEFAULT_BARS = 4;

function createEmptyLoopRow(bars = LOOP_DEFAULT_BARS) {
    const totalSteps = bars * LOOP_STEPS_PER_BAR;
    return new Array(totalSteps).fill(0);
}

const EMPTY_GRID_ROW = createEmptyLoopRow();
const loopState = {
    grid: {
        kick:    [...EMPTY_GRID_ROW],
        snare:   [...EMPTY_GRID_ROW],
        hihat:   [...EMPTY_GRID_ROW],
        clap:    [...EMPTY_GRID_ROW],
        tom:     [...EMPTY_GRID_ROW],
        ride:    [...EMPTY_GRID_ROW],
        cowbell: [...EMPTY_GRID_ROW],
        bass:    [...EMPTY_GRID_ROW],
        synth:   [...EMPTY_GRID_ROW],
        pluck:   [...EMPTY_GRID_ROW],
        pad:     [...EMPTY_GRID_ROW],
    },
    bpm: 120,
    bars: LOOP_DEFAULT_BARS,
    isPlaying: false,
    currentStep: 0,
    masterVolume: 1.0,
    listeners: new Map(),  // socketId -> playerName
    synth: {
        waveform: 'square',
        frequency: 440,
        cutoff: 2000,
        resonance: 1,
        attack: 0.01,
        decay: 0.2,
        volume: 0.3
    },
    bass: {
        waveform: 'sine',
        frequency: 65.41,
        cutoff: 800,
        resonance: 1,
        attack: 0.01,
        decay: 0.5,
        distortion: 0
    }
};

export function registerLoopMachineHandlers(socket, io, { checkRateLimit, onlinePlayers }) {
    socket.on('loop-join', () => { try {
        if (!checkRateLimit(socket, 5)) return;

        const player = onlinePlayers.get(socket.id);
        const playerName = player?.name || 'Guest';

        socket.join(LOOP_ROOM);
        loopState.listeners.set(socket.id, playerName);

        // Send current state to the joining user
        socket.emit('loop-sync', {
            grid: loopState.grid,
            bpm: loopState.bpm,
            bars: loopState.bars,
            isPlaying: loopState.isPlaying,
            listeners: Array.from(loopState.listeners.values()),
            synth: loopState.synth,
            bass: loopState.bass,
            masterVolume: loopState.masterVolume
        });

        // Broadcast updated listener list to all
        io.to(LOOP_ROOM).emit('loop-listeners', {
            listeners: Array.from(loopState.listeners.values())
        });

        console.log(`[LoopMachine] ${playerName} joined (${loopState.listeners.size} listeners)`);
    } catch (err) { console.error('loop-join error:', err.message); } });

    socket.on('loop-leave', () => { try {
        if (!checkRateLimit(socket, 5)) return;

        const playerName = loopState.listeners.get(socket.id) || 'Guest';
        socket.leave(LOOP_ROOM);
        loopState.listeners.delete(socket.id);

        // Broadcast updated listener list
        io.to(LOOP_ROOM).emit('loop-listeners', {
            listeners: Array.from(loopState.listeners.values())
        });

        console.log(`[LoopMachine] ${playerName} left (${loopState.listeners.size} listeners)`);
    } catch (err) { console.error('loop-leave error:', err.message); } });

    socket.on('loop-toggle-cell', (data) => { try {
        if (!checkRateLimit(socket, 20)) return;

        const { instrument, step } = data;

        // Validate instrument
        const validInstruments = ['kick', 'snare', 'hihat', 'clap', 'tom', 'ride', 'cowbell', 'bass', 'synth', 'pluck', 'pad'];
        if (!validInstruments.includes(instrument)) return;

        // Validate step
        const stepNum = Number(step);
        const maxStep = (loopState.bars * LOOP_STEPS_PER_BAR) - 1;
        if (!Number.isInteger(stepNum) || stepNum < 0 || stepNum > maxStep) return;

        // Toggle the cell
        loopState.grid[instrument][stepNum] = loopState.grid[instrument][stepNum] === 1 ? 0 : 1;

        // Broadcast to all listeners
        io.to(LOOP_ROOM).emit('loop-cell-updated', {
            instrument,
            step: stepNum,
            value: loopState.grid[instrument][stepNum]
        });

        console.log(`[LoopMachine] Cell toggled: ${instrument}[${stepNum}] = ${loopState.grid[instrument][stepNum]}`);
    } catch (err) { console.error('loop-toggle-cell error:', err.message); } });

    socket.on('loop-set-bpm', (data) => { try {
        if (!checkRateLimit(socket, 5)) return;

        const bpm = Number(data.bpm);
        if (!Number.isInteger(bpm) || bpm < 60 || bpm > 200) return;

        loopState.bpm = bpm;

        // Broadcast to all listeners
        io.to(LOOP_ROOM).emit('loop-bpm-updated', {
            bpm: loopState.bpm
        });

        console.log(`[LoopMachine] BPM set to ${loopState.bpm}`);
    } catch (err) { console.error('loop-set-bpm error:', err.message); } });

    socket.on('loop-set-bars', (data) => { try {
        if (!checkRateLimit(socket, 5)) return;

        const bars = Number(data?.bars);
        if (!Number.isInteger(bars) || bars < LOOP_MIN_BARS || bars > LOOP_MAX_BARS) return;
        if (bars === loopState.bars) return;

        const nextSteps = bars * LOOP_STEPS_PER_BAR;
        for (const instrument in loopState.grid) {
            const currentRow = loopState.grid[instrument] || [];
            if (currentRow.length > nextSteps) {
                loopState.grid[instrument] = currentRow.slice(0, nextSteps);
            } else if (currentRow.length < nextSteps) {
                loopState.grid[instrument] = [...currentRow, ...new Array(nextSteps - currentRow.length).fill(0)];
            }
        }

        loopState.bars = bars;
        loopState.currentStep = loopState.currentStep % nextSteps;

        io.to(LOOP_ROOM).emit('loop-sync', {
            grid: loopState.grid,
            bpm: loopState.bpm,
            bars: loopState.bars,
            isPlaying: loopState.isPlaying,
            listeners: Array.from(loopState.listeners.values()),
            synth: loopState.synth,
            bass: loopState.bass,
            masterVolume: loopState.masterVolume
        });

        console.log(`[LoopMachine] Bars set to ${loopState.bars}`);
    } catch (err) { console.error('loop-set-bars error:', err.message); } });

    socket.on('loop-play-pause', () => { try {
        if (!checkRateLimit(socket, 5)) return;

        loopState.isPlaying = !loopState.isPlaying;

        // Broadcast to all listeners
        io.to(LOOP_ROOM).emit('loop-state-updated', {
            isPlaying: loopState.isPlaying
        });

        console.log(`[LoopMachine] ${loopState.isPlaying ? 'Playing' : 'Paused'}`);
    } catch (err) { console.error('loop-play-pause error:', err.message); } });

    socket.on('loop-set-synth', (data) => { try {
        if (!checkRateLimit(socket, 5)) return;
        if (!data || typeof data !== 'object') return;

        // Validate and clamp all values
        const validWaveforms = ['sine', 'square', 'sawtooth', 'triangle'];
        const waveform = validWaveforms.includes(data.waveform) ? data.waveform : 'square';
        
        const frequency = typeof data.frequency === 'number' 
            ? Math.max(50, Math.min(2000, data.frequency))
            : 440;
        
        const cutoff = typeof data.cutoff === 'number'
            ? Math.max(200, Math.min(8000, data.cutoff))
            : 2000;
        
        const resonance = typeof data.resonance === 'number'
            ? Math.max(0.1, Math.min(20, data.resonance))
            : 1;
        
        const attack = typeof data.attack === 'number'
            ? Math.max(0.01, Math.min(0.5, data.attack))
            : 0.01;
        
        const decay = typeof data.decay === 'number'
            ? Math.max(0.05, Math.min(1.0, data.decay))
            : 0.2;
        
        const volume = typeof data.volume === 'number'
            ? Math.max(0, Math.min(1, data.volume))
            : 0.3;

        // Update state
        loopState.synth = {
            waveform,
            frequency,
            cutoff,
            resonance,
            attack,
            decay,
            volume
        };

        // Broadcast to all listeners
        io.to(LOOP_ROOM).emit('loop-synth-updated', loopState.synth);

        console.log(`[LoopMachine] Synth settings updated: ${waveform} @ ${frequency}Hz`);
    } catch (err) { console.error('loop-set-synth error:', err.message); } });

    socket.on('loop-set-master-volume', (data) => { try {
        if (!checkRateLimit(socket, 5)) return;

        const volume = typeof data.masterVolume === 'number'
            ? Math.max(0, Math.min(1, data.masterVolume))
            : 1.0;

        loopState.masterVolume = volume;

        // Broadcast to all listeners
        io.to(LOOP_ROOM).emit('loop-master-volume-updated', {
            masterVolume: loopState.masterVolume
        });

        console.log(`[LoopMachine] Master volume set to ${Math.round(loopState.masterVolume * 100)}%`);
    } catch (err) { console.error('loop-set-master-volume error:', err.message); } });

    socket.on('loop-set-bass', (data) => { try {
        if (!checkRateLimit(socket, 5)) return;
        if (!data || typeof data !== 'object') return;

        // Validate and clamp all values
        const validWaveforms = ['sine', 'square', 'sawtooth', 'triangle'];
        const waveform = validWaveforms.includes(data.waveform) ? data.waveform : 'sine';
        
        const frequency = typeof data.frequency === 'number' 
            ? Math.max(30, Math.min(200, data.frequency))
            : 65.41;
        
        const cutoff = typeof data.cutoff === 'number'
            ? Math.max(100, Math.min(2000, data.cutoff))
            : 800;
        
        const resonance = typeof data.resonance === 'number'
            ? Math.max(0.1, Math.min(20, data.resonance))
            : 1;
        
        const attack = typeof data.attack === 'number'
            ? Math.max(0.01, Math.min(0.5, data.attack))
            : 0.01;
        
        const decay = typeof data.decay === 'number'
            ? Math.max(0.1, Math.min(2.0, data.decay))
            : 0.5;
        
        const distortion = typeof data.distortion === 'number'
            ? Math.max(0, Math.min(1, data.distortion))
            : 0;

        // Update state
        loopState.bass = {
            waveform,
            frequency,
            cutoff,
            resonance,
            attack,
            decay,
            distortion
        };

        // Broadcast to all listeners
        io.to(LOOP_ROOM).emit('loop-bass-updated', loopState.bass);

        console.log(`[LoopMachine] Bass settings updated: ${waveform} @ ${frequency.toFixed(2)}Hz`);
    } catch (err) { console.error('loop-set-bass error:', err.message); } });

    socket.on('loop-clear', () => { try {
        if (!checkRateLimit(socket, 3)) return;

        // Reset all grid cells to 0
        for (const instrument in loopState.grid) {
            loopState.grid[instrument] = createEmptyLoopRow(loopState.bars);
        }

        // Reset synth to defaults
        loopState.synth = {
            waveform: 'square',
            frequency: 440,
            cutoff: 2000,
            resonance: 1,
            attack: 0.01,
            decay: 0.2,
            volume: 0.3
        };

        // Reset bass to defaults
        loopState.bass = {
            waveform: 'sine',
            frequency: 65.41,
            cutoff: 800,
            resonance: 1,
            attack: 0.01,
            decay: 0.5,
            distortion: 0
        };

        // Broadcast full sync to all listeners
        io.to(LOOP_ROOM).emit('loop-sync', {
            grid: loopState.grid,
            bpm: loopState.bpm,
            bars: loopState.bars,
            isPlaying: loopState.isPlaying,
            listeners: Array.from(loopState.listeners.values()),
            synth: loopState.synth,
            bass: loopState.bass,
            masterVolume: loopState.masterVolume
        });

        console.log('[LoopMachine] Grid cleared');
    } catch (err) { console.error('loop-clear error:', err.message); } });
}

export function cleanupLoopOnDisconnect(socketId, io) {
    if (loopState.listeners.has(socketId)) {
        loopState.listeners.delete(socketId);
        io.to(LOOP_ROOM).emit('loop-listeners', {
            listeners: Array.from(loopState.listeners.values())
        });
    }
}
