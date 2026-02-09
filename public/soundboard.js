(function () {
    'use strict';

    // ============== SOCKET & DOM ==============

    var lobby = window.StrictHotelLobby || {};
    var socket = lobby.socket || window.StrictHotelLobbySocket || null;
    if (!socket) return;

    var panel = document.getElementById('soundboard-panel');
    if (!panel) return;
    var grid = document.getElementById('soundboard-grid');
    var muteBtn = document.getElementById('soundboard-mute');
    var muteIcon = muteBtn.querySelector('.soundboard-mute-icon');
    var volumeSlider = document.getElementById('soundboard-volume');
    var toastArea = document.getElementById('soundboard-toasts');

    // ============== SOUND DEFINITIONS ==============

    var SOUNDS = [
        { id: 'vineboom',     emoji: '\uD83D\uDCA5', label: 'Vine Boom',     file: 'vineboom.mp3' },
        { id: 'rizz',         emoji: '\uD83D\uDE0F', label: 'Rizz',          file: 'rizz.ogg' },
        { id: 'fahh',         emoji: '\uD83D\uDE29', label: 'FAHH',          file: 'fahh.ogg' },
        { id: 'reverbfart',   emoji: '\uD83D\uDCA8', label: 'Reverb Fart',   file: 'reverbfart.mp3' },
        { id: 'elgato',       emoji: '\uD83D\uDC31', label: 'El Gato',       file: 'elgato.mp3' },
        { id: 'seyuh',        emoji: '\uD83D\uDE4C', label: 'Seyuh',         file: 'seyuh.ogg' },
        { id: 'anatolia',     emoji: '\uD83C\uDDFA\uD83C\uDDF7', label: 'Anatolia', file: 'anatolia.mp3' },
        { id: 'massenhausen', emoji: '\uD83C\uDFD8\uFE0F',  label: 'Massenhausen', file: 'massenhausen.ogg' },
        { id: 'plug',         emoji: '\uD83D\uDD0C', label: 'Plug',          file: 'plug.ogg' }
    ];

    var AUDIO_BASE = '/shared/audio/soundboard/';

    // ============== STATE ==============

    var isMuted = false;
    var volume = 0.7;
    var audioCache = {};

    var STORAGE_MUTE = 'soundboard-muted';
    var STORAGE_VOL = 'soundboard-volume';

    // ============== HELPERS ==============

    var escapeHtml = window.StrictHotelSocket.escapeHtml;

    function getName() {
        if (lobby.getName) return lobby.getName();
        return window.StrictHotelSocket.getPlayerName() || 'Anon';
    }

    // ============== AUDIO ==============

    function preloadSounds() {
        SOUNDS.forEach(function (s) {
            var audio = new Audio(AUDIO_BASE + s.file);
            audio.preload = 'auto';
            audioCache[s.id] = audio;
        });
    }

    function playSound(soundId) {
        if (isMuted) return;
        var src = audioCache[soundId];
        if (!src) return;
        var audio = new Audio(src.src);
        audio.volume = volume;
        audio.play().catch(function () { /* autoplay blocked */ });
    }

    // ============== SETTINGS ==============

    function restoreSettings() {
        var savedMute = localStorage.getItem(STORAGE_MUTE);
        if (savedMute === 'true') {
            isMuted = true;
            muteBtn.classList.add('muted');
            muteIcon.textContent = '\uD83D\uDD07';
        }
        var savedVol = localStorage.getItem(STORAGE_VOL);
        if (savedVol !== null) {
            volume = parseFloat(savedVol);
            if (isNaN(volume) || volume < 0 || volume > 1) volume = 0.7;
            volumeSlider.value = Math.round(volume * 100);
        }
    }

    function setupControls() {
        muteBtn.addEventListener('click', function () {
            isMuted = !isMuted;
            muteBtn.classList.toggle('muted', isMuted);
            muteIcon.textContent = isMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
            localStorage.setItem(STORAGE_MUTE, isMuted);
        });

        volumeSlider.addEventListener('input', function () {
            volume = parseInt(volumeSlider.value, 10) / 100;
            localStorage.setItem(STORAGE_VOL, volume);
        });
    }

    // ============== GRID ==============

    function setupGrid() {
        SOUNDS.forEach(function (sound) {
            var btn = document.createElement('button');
            btn.className = 'soundboard-btn';
            btn.type = 'button';
            btn.dataset.soundId = sound.id;
            btn.innerHTML =
                '<span class="soundboard-btn-icon">' + sound.emoji + '</span>' +
                '<span class="soundboard-btn-label">' + sound.label + '</span>';
            btn.addEventListener('click', function () {
                socket.emit('soundboard-play', sound.id);
            });
            grid.appendChild(btn);
        });
    }

    // ============== VISUAL FEEDBACK ==============

    function highlightButton(soundId) {
        var btn = grid.querySelector('[data-sound-id="' + soundId + '"]');
        if (!btn) return;
        btn.classList.remove('playing');
        // Force reflow to restart animation
        void btn.offsetWidth;
        btn.classList.add('playing');
        setTimeout(function () { btn.classList.remove('playing'); }, 500);
    }

    function showToast(playerName, sound) {
        var toast = document.createElement('div');
        toast.className = 'soundboard-toast';
        toast.innerHTML =
            '<span class="soundboard-toast-name">' + escapeHtml(playerName) + '</span> ' +
            sound.emoji + ' ' + escapeHtml(sound.label);
        toastArea.appendChild(toast);

        // Max 3 visible toasts
        var toasts = toastArea.querySelectorAll('.soundboard-toast');
        while (toasts.length > 3) {
            toasts[0].remove();
            toasts = toastArea.querySelectorAll('.soundboard-toast');
        }

        // Auto-remove
        setTimeout(function () {
            toast.classList.add('fading');
            setTimeout(function () { toast.remove(); }, 300);
        }, 2200);
    }

    // ============== SOCKET ==============

    function bindSocket() {
        socket.on('soundboard-played', function (data) {
            if (!data || typeof data.soundId !== 'string') return;
            var sound = null;
            for (var i = 0; i < SOUNDS.length; i++) {
                if (SOUNDS[i].id === data.soundId) { sound = SOUNDS[i]; break; }
            }
            if (!sound) return;

            playSound(data.soundId);
            highlightButton(data.soundId);
            showToast(data.playerName || 'Anon', sound);
        });

        socket.on('connect', function () {
            socket.emit('soundboard-join');
        });
    }

    // ============== INIT ==============

    restoreSettings();
    setupGrid();
    setupControls();
    preloadSounds();
    bindSocket();

    if (socket.connected) {
        socket.emit('soundboard-join');
    }
})();
