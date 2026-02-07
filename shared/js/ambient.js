// ============================
// AMBIENT MODULE - Spaceship Atmosphere
// ============================

(function() {
    const { $ } = window.MaexchenApp;

    const STORAGE_MUTE = 'ambient-muted';
    const STORAGE_VOL = 'ambient-volume';
    const DEFAULT_VOLUME = 0.04; // Very quiet master gain

    let audioCtx = null;
    let ambientGain = null;
    let isPlaying = false;
    let isMuted = false;
    let volume = DEFAULT_VOLUME;

    // Ambient sound nodes
    let droneOsc = null;
    let noiseNode = null;
    let beepInterval = null;

    // Restore saved settings
    function restoreSettings() {
        const saved = localStorage.getItem(STORAGE_MUTE);
        if (saved === 'true') {
            isMuted = true;
        }
        const savedVol = localStorage.getItem(STORAGE_VOL);
        if (savedVol !== null) {
            const parsed = parseFloat(savedVol);
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
                volume = parsed;
            }
        }
    }

    // Initialize ambient system
    function initAmbient() {
        // Will be started on first user interaction
    }

    // Get or create audio context
    function getAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    // Start ambient sounds
    function startAmbient() {
        if (isPlaying || isMuted) return;

        const ctx = getAudioContext();
        isPlaying = true;

        // Master gain for ambient
        ambientGain = ctx.createGain();
        ambientGain.gain.value = volume;
        ambientGain.connect(ctx.destination);

        // Low drone
        startDrone(ctx);

        // Subtle noise (air/static)
        startNoise(ctx);

        // Occasional beeps
        startBeeps(ctx);

        console.log('[Ambient] Started spaceship atmosphere');
    }

    // Stop ambient sounds
    function stopAmbient() {
        if (!isPlaying) return;
        isPlaying = false;

        if (droneOsc) {
            droneOsc.stop();
            droneOsc = null;
        }

        if (noiseNode) {
            noiseNode.stop();
            noiseNode = null;
        }

        if (beepInterval) {
            clearInterval(beepInterval);
            beepInterval = null;
        }

        console.log('[Ambient] Stopped');
    }

    // Low frequency drone
    function startDrone(ctx) {
        droneOsc = ctx.createOscillator();
        droneOsc.type = 'sine';
        droneOsc.frequency.value = 55; // Low A

        const droneGain = ctx.createGain();
        droneGain.gain.value = 0.3;

        // Add subtle modulation
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.1; // Very slow

        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 5; // Subtle pitch variation

        lfo.connect(lfoGain);
        lfoGain.connect(droneOsc.frequency);
        lfo.start();

        droneOsc.connect(droneGain);
        droneGain.connect(ambientGain);
        droneOsc.start();
    }

    // Background noise (air circulation)
    function startNoise(ctx) {
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // Brown noise (smoother than white)
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5;
        }

        noiseNode = ctx.createBufferSource();
        noiseNode.buffer = buffer;
        noiseNode.loop = true;

        // Lowpass filter for rumble
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 200;

        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0.4;

        noiseNode.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ambientGain);
        noiseNode.start();
    }

    // Occasional computer beeps
    function startBeeps(ctx) {
        beepInterval = setInterval(() => {
            if (isMuted || !isPlaying) return;
            if (Math.random() > 0.3) return; // 30% chance

            playBeep(ctx);
        }, 4000); // Every 4 seconds maybe
    }

    function playBeep(ctx) {
        const freqs = [880, 1100, 1320, 660, 990];
        const freq = freqs[Math.floor(Math.random() * freqs.length)];

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;

        const gain = ctx.createGain();
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.05, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(ambientGain);

        osc.start(now);
        osc.stop(now + 0.2);

        // Sometimes double beep
        if (Math.random() > 0.6) {
            setTimeout(() => {
                if (!isPlaying || isMuted) return;
                const osc2 = ctx.createOscillator();
                osc2.type = 'sine';
                osc2.frequency.value = freq * 1.2;
                const gain2 = ctx.createGain();
                const now2 = ctx.currentTime;
                gain2.gain.setValueAtTime(0, now2);
                gain2.gain.linearRampToValueAtTime(0.04, now2 + 0.01);
                gain2.gain.exponentialRampToValueAtTime(0.001, now2 + 0.1);
                osc2.connect(gain2);
                gain2.connect(ambientGain);
                osc2.start(now2);
                osc2.stop(now2 + 0.15);
            }, 120);
        }
    }

    // Play alert sound (for important events)
    function playAlert() {
        if (isMuted) return;
        const ctx = getAudioContext();

        const osc = ctx.createOscillator();
        osc.type = 'square';

        const gain = ctx.createGain();
        const now = ctx.currentTime;

        // Two-tone alert
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(600, now + 0.15);
        osc.frequency.setValueAtTime(800, now + 0.3);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.setValueAtTime(0.1, now + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.5);
    }

    // Play victory fanfare
    let victoryAudio = null;
    function playVictory() {
        if (isMuted) return;
        if (victoryAudio) {
            victoryAudio.pause();
            victoryAudio.currentTime = 0;
        }
        victoryAudio = new Audio('/userinput/winscreen.mp3');
        victoryAudio.volume = 0.5;
        victoryAudio.play().catch(() => {});
    }

    // Stop victory sound
    function stopVictory() {
        if (victoryAudio) {
            victoryAudio.pause();
            victoryAudio.currentTime = 0;
            victoryAudio = null;
        }
    }

    // Toggle mute
    function toggleMute() {
        isMuted = !isMuted;
        localStorage.setItem(STORAGE_MUTE, isMuted);
        if (isMuted) {
            stopAmbient();
        } else {
            startAmbient();
        }
        updateMuteUI();
        return isMuted;
    }

    function getMuted() {
        return isMuted;
    }

    // Set volume (0-100 from slider, mapped to 0.0–0.15 gain range)
    function setVolume(val) {
        volume = (val / 100) * 0.15;
        localStorage.setItem(STORAGE_VOL, volume);
        if (ambientGain) {
            ambientGain.gain.value = volume;
        }
    }

    // Update mute button UI
    function updateMuteUI() {
        const btn = document.getElementById('ambient-mute');
        if (!btn) return;
        const icon = btn.querySelector('.ambient-mute-icon');
        if (!icon) return;
        btn.classList.toggle('muted', isMuted);
        icon.textContent = isMuted ? '🔇' : '🔊';
    }

    // Bind volume slider and mute button if present
    function bindControls() {
        const btn = document.getElementById('ambient-mute');
        const slider = document.getElementById('ambient-volume');

        if (btn) {
            btn.addEventListener('click', function () {
                toggleMute();
            });
        }

        if (slider) {
            // Set slider to current volume (map gain 0–0.15 to 0–100)
            slider.value = Math.round((volume / 0.15) * 100);
            slider.addEventListener('input', function () {
                setVolume(parseInt(slider.value, 10));
            });
        }

        updateMuteUI();
    }

    // Restore settings on load
    restoreSettings();
    bindControls();

    // Public API
    window.MaexchenAmbient = {
        startAmbient,
        stopAmbient,
        playAlert,
        playVictory,
        stopVictory,
        toggleMute,
        isMuted: getMuted,
        getAudioContext,
        setVolume
    };
})();
