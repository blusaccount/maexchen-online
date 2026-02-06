// ============================
// TTS MODULE - Alien Voices (Unique per Player)
// ============================

(function() {
    const { $ } = window.MaexchenApp;

    // Alien voice configurations - each player gets a unique one
    const ALIEN_VOICES = [
        { pitch: 0.4, rate: 0.7, name: 'Deep Alien' },
        { pitch: 1.9, rate: 1.4, name: 'High Squeaky' },
        { pitch: 0.9, rate: 2.0, name: 'Fast Robot' },
        { pitch: 0.3, rate: 0.5, name: 'Slow Rumble' },
        { pitch: 1.6, rate: 1.1, name: 'Chipmunk' },
        { pitch: 0.6, rate: 1.6, name: 'Whisperer' },
        { pitch: 1.3, rate: 0.6, name: 'Drawl' },
        { pitch: 2.0, rate: 1.9, name: 'Hyper' },
    ];

    let isMuted = false;
    let voices = [];
    let playerVoices = new Map(); // playerName -> voiceConfig
    let usedVoiceIndices = new Set(); // Track which voices are assigned

    // Initialize TTS
    function initTTS() {
        // Load voices
        if ('speechSynthesis' in window) {
            voices = speechSynthesis.getVoices();

            // Some browsers load voices async
            speechSynthesis.onvoiceschanged = () => {
                voices = speechSynthesis.getVoices();
            };
        }

        // Mute button
        const muteBtn = $('btn-mute');
        if (muteBtn) {
            muteBtn.addEventListener('click', toggleMute);
        }
    }

    // Toggle mute
    function toggleMute() {
        isMuted = !isMuted;
        const btn = $('btn-mute');
        if (btn) {
            btn.textContent = isMuted ? '🔇' : '🔊';
            btn.classList.toggle('muted', isMuted);
        }

        // Stop any current speech
        if (isMuted && 'speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
    }

    // Assign a unique alien voice to a player
    function assignVoice(playerName) {
        if (playerVoices.has(playerName)) {
            return playerVoices.get(playerName);
        }

        // Find an unused voice index
        let voiceIndex = -1;
        for (let i = 0; i < ALIEN_VOICES.length; i++) {
            if (!usedVoiceIndices.has(i)) {
                voiceIndex = i;
                break;
            }
        }

        // If all voices are used, pick a random one (fallback for 8+ players)
        if (voiceIndex === -1) {
            voiceIndex = Math.floor(Math.random() * ALIEN_VOICES.length);
        } else {
            usedVoiceIndices.add(voiceIndex);
        }

        const voiceConfig = { ...ALIEN_VOICES[voiceIndex], index: voiceIndex };
        playerVoices.set(playerName, voiceConfig);

        console.log(`[TTS] ${playerName} -> ${voiceConfig.name} (pitch: ${voiceConfig.pitch}, rate: ${voiceConfig.rate})`);

        return voiceConfig;
    }

    // Get or assign voice for player
    function getPlayerVoice(playerName) {
        if (!playerVoices.has(playerName)) {
            assignVoice(playerName);
        }
        return playerVoices.get(playerName);
    }

    // Speak text with given voice config
    function speak(text, voiceConfig = {}) {
        if (isMuted) return;
        if (!('speechSynthesis' in window)) return;

        // Cancel any current speech
        speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);

        // Apply alien voice settings
        utterance.pitch = voiceConfig.pitch || 1.0;
        utterance.rate = voiceConfig.rate || 1.0;
        utterance.volume = 0.9;

        // Try to use a German voice if available
        const germanVoice = voices.find(v => v.lang.startsWith('de'));
        if (germanVoice) {
            utterance.voice = germanVoice;
        }

        speechSynthesis.speak(utterance);
    }

    // Speak a player's message with their assigned voice
    function speakPlayerMessage(playerName, text) {
        const voiceConfig = getPlayerVoice(playerName);
        speak(text, voiceConfig);
    }

    // Speak a game announcement (neutral voice)
    function speakAnnouncement(text) {
        speak(text, { pitch: 1.0, rate: 1.2 });
    }

    // Clear all player voice assignments (for new game)
    function clearVoices() {
        playerVoices.clear();
        usedVoiceIndices.clear();
    }

    // Check if muted
    function getMuted() {
        return isMuted;
    }

    // Get voice info for a player (for display)
    function getVoiceInfo(playerName) {
        const voice = playerVoices.get(playerName);
        return voice ? voice.name : 'Unknown';
    }

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTTS);
    } else {
        initTTS();
    }

    // Public API
    window.MaexchenTTS = {
        speak,
        speakPlayerMessage,
        speakAnnouncement,
        assignVoice,
        getPlayerVoice,
        getVoiceInfo,
        clearVoices,
        toggleMute,
        getMuted
    };
})();
