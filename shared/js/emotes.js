// ============================
// EMOTES MODULE - Mario Party Style Reactions
// ============================

(function() {
    const { socket, $, state } = window.MaexchenApp;

    // Available emotes with sounds
    const EMOTES = [
        { id: 'doubt', emoji: '🤔', text: 'Hmm...', color: '#ffdd00' },
        { id: 'shock', emoji: '😱', text: 'WAS?!', color: '#ff3366' },
        { id: 'smirk', emoji: '😏', text: 'Hehe...', color: '#00ff88' },
        { id: 'dice', emoji: '🎲', text: 'Würfel!', color: '#00aaff' },
        { id: 'skull', emoji: '💀', text: 'RIP', color: '#888888' },
        { id: 'fire', emoji: '🔥', text: 'SPICY!', color: '#ff6600' },
    ];

    let lastEmoteTime = 0;
    const EMOTE_COOLDOWN = 1000; // 1 second between emotes
    let audioCtx = null;

    // Get audio context
    function getAudioCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    // Initialize emotes
    function initEmotes() {
        createEmoteBar();

        // Listen for emote broadcasts
        socket.on('emote-broadcast', handleEmoteBroadcast);
    }

    // Create the emote bar UI
    function createEmoteBar() {
        const bar = document.createElement('div');
        bar.id = 'emote-bar';
        bar.innerHTML = EMOTES.map(e => `
            <button class="emote-btn" data-emote="${e.id}" title="${e.text}">
                ${e.emoji}
            </button>
        `).join('');

        document.body.appendChild(bar);

        // Add click handlers
        bar.querySelectorAll('.emote-btn').forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const emoteId = btn.dataset.emote;
                sendEmote(emoteId);
            });
        });
    }

    // Send an emote
    function sendEmote(emoteId) {
        const now = Date.now();
        if (now - lastEmoteTime < EMOTE_COOLDOWN) return;
        lastEmoteTime = now;

        console.log('[Emotes] Sending:', emoteId);
        socket.emit('emote', emoteId);

        // Visual feedback on button
        const btn = document.querySelector(`[data-emote="${emoteId}"]`);
        if (btn) {
            btn.classList.add('emote-sent');
            setTimeout(() => btn.classList.remove('emote-sent'), 300);
        }
    }

    // Handle incoming emote broadcast
    function handleEmoteBroadcast({ playerName, emoteId }) {
        console.log('[Emotes] Received:', playerName, emoteId);

        const emote = EMOTES.find(e => e.id === emoteId);
        if (!emote) return;

        // Show emote popup in corner
        showEmotePopup(playerName, emote);

        // Play emote sound
        playEmoteSound(emoteId);

        // TTS for the emote (with player's voice)
        if (window.MaexchenTTS && playerName !== state.playerName) {
            setTimeout(() => {
                window.MaexchenTTS.speakPlayerMessage(playerName, emote.text);
            }, 300);
        }
    }

    // Show emote popup in corner (less intrusive)
    function showEmotePopup(playerName, emote) {
        // Stack multiple emotes
        const existingPopups = document.querySelectorAll('.emote-popup');
        const offset = existingPopups.length * 80;

        const popup = document.createElement('div');
        popup.className = 'emote-popup';
        popup.style.setProperty('--emote-color', emote.color);
        popup.style.top = (100 + offset) + 'px';

        // Get player avatar HTML
        const avatarHTML = window.MaexchenAvatars ? window.MaexchenAvatars.getAvatarHTML(playerName, 20) : '';

        popup.innerHTML = `
            <div class="emote-popup-emoji">${emote.emoji}</div>
            <div class="emote-popup-info">
                <div class="emote-popup-player">${avatarHTML} ${playerName}</div>
                <div class="emote-popup-text">${emote.text}</div>
            </div>
        `;

        document.body.appendChild(popup);

        // Remove after delay
        setTimeout(() => {
            popup.classList.add('fade-out');
            setTimeout(() => popup.remove(), 300);
        }, 2000);
    }

    // Play emote sound effects
    function playEmoteSound(emoteId) {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;

        switch (emoteId) {
            case 'doubt':
                // Questioning sound - rising tones
                playTone(ctx, 400, 0.12, 'sine', 0.2);
                playTone(ctx, 500, 0.12, 'sine', 0.2, 0.12);
                playTone(ctx, 650, 0.15, 'sine', 0.2, 0.24);
                break;

            case 'shock':
                // Dramatic sting
                playTone(ctx, 800, 0.08, 'sawtooth', 0.25);
                playTone(ctx, 1000, 0.08, 'sawtooth', 0.25, 0.05);
                playTone(ctx, 1200, 0.15, 'sawtooth', 0.3, 0.1);
                playNoise(ctx, 0.1, 0.15, 0.1);
                break;

            case 'smirk':
                // Sneaky/cheeky sound
                playTone(ctx, 300, 0.1, 'sine', 0.15);
                playTone(ctx, 450, 0.1, 'sine', 0.15, 0.1);
                playTone(ctx, 350, 0.15, 'sine', 0.15, 0.2);
                break;

            case 'dice':
                // Dice rattle
                for (let i = 0; i < 6; i++) {
                    playNoise(ctx, 0.03, 0.12, i * 0.05);
                }
                playTone(ctx, 600, 0.1, 'sine', 0.15, 0.3);
                break;

            case 'skull':
                // Doom sound
                playTone(ctx, 150, 0.4, 'sawtooth', 0.2);
                playTone(ctx, 100, 0.5, 'sine', 0.15, 0.2);
                break;

            case 'fire':
                // Sizzle/fire sound
                playNoise(ctx, 0.2, 0.2);
                playTone(ctx, 800, 0.1, 'sawtooth', 0.15);
                playTone(ctx, 1000, 0.1, 'sawtooth', 0.12, 0.08);
                playTone(ctx, 1200, 0.1, 'sawtooth', 0.1, 0.16);
                break;
        }
    }

    function playTone(ctx, freq, duration, type, volume = 0.2, delay = 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = ctx.currentTime + delay;

        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.01);
    }

    function playNoise(ctx, duration, volume = 0.1, delay = 0) {
        const bufferSize = Math.ceil(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000;

        const gain = ctx.createGain();
        const startTime = ctx.currentTime + delay;
        gain.gain.setValueAtTime(volume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start(startTime);
        noise.stop(startTime + duration);
    }

    // Show/hide emote bar
    function showEmoteBar() {
        const bar = document.getElementById('emote-bar');
        if (bar) bar.style.display = 'flex';
    }

    function hideEmoteBar() {
        const bar = document.getElementById('emote-bar');
        if (bar) bar.style.display = 'none';
    }

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEmotes);
    } else {
        initEmotes();
    }

    // Public API
    window.MaexchenEmotes = {
        sendEmote,
        showEmoteBar,
        hideEmoteBar,
        EMOTES
    };
})();
