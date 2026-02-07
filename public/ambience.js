(function () {
    'use strict';

    // ============== CONFIG ==============

    var VIDEO_ID = '5k3uAtQ8vlg';
    var STORAGE_MUTE = 'ambience-muted';
    var DEFAULT_VOLUME = 30; // 0-100

    // ============== STATE ==============

    var player = null;
    var isMuted = false;
    var ready = false;
    var userInteracted = false;

    // ============== DOM ==============

    var muteBtn = document.getElementById('ambience-mute');
    var muteIcon = muteBtn ? muteBtn.querySelector('.ambience-mute-icon') : null;

    // ============== YOUTUBE IFRAME API ==============

    function loadYouTubeAPI() {
        if (window.YT && window.YT.Player) {
            createPlayer();
            return;
        }
        var tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
    }

    // YouTube API calls this globally when ready
    var previousOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
        if (previousOnReady) previousOnReady();
        createPlayer();
    };

    function createPlayer() {
        player = new YT.Player('ambience-yt-player', {
            videoId: VIDEO_ID,
            playerVars: {
                autoplay: 1,
                loop: 1,
                playlist: VIDEO_ID,
                controls: 0,
                disablekb: 1,
                fs: 0,
                modestbranding: 1,
                rel: 0
            },
            events: {
                onReady: onPlayerReady,
                onStateChange: onPlayerStateChange
            }
        });
    }

    function onPlayerReady() {
        ready = true;
        player.setVolume(DEFAULT_VOLUME);
        if (isMuted) {
            player.mute();
        } else {
            player.unMute();
        }
        // Attempt autoplay; will work if user already interacted
        player.playVideo();
    }

    function onPlayerStateChange(event) {
        // If video ends, restart (backup for loop)
        if (event.data === YT.PlayerState.ENDED) {
            player.seekTo(0);
            player.playVideo();
        }
    }

    // ============== MUTE CONTROL ==============

    function restoreSettings() {
        var saved = localStorage.getItem(STORAGE_MUTE);
        if (saved === 'true') {
            isMuted = true;
        }
        updateMuteUI();
    }

    function toggleMute() {
        isMuted = !isMuted;
        localStorage.setItem(STORAGE_MUTE, isMuted);
        updateMuteUI();

        if (!ready || !player) return;
        if (isMuted) {
            player.mute();
        } else {
            player.unMute();
            player.playVideo();
        }
    }

    function updateMuteUI() {
        if (!muteBtn || !muteIcon) return;
        muteBtn.classList.toggle('muted', isMuted);
        muteIcon.textContent = isMuted ? '🔇' : '🎵';
    }

    // ============== USER INTERACTION GATE ==============

    function onFirstInteraction() {
        if (userInteracted) return;
        userInteracted = true;
        document.removeEventListener('click', onFirstInteraction);
        document.removeEventListener('keydown', onFirstInteraction);
        if (ready && player && !isMuted) {
            player.playVideo();
        }
    }

    // ============== INIT ==============

    restoreSettings();

    if (muteBtn) {
        muteBtn.addEventListener('click', toggleMute);
    }

    // Listen for first interaction to enable autoplay
    document.addEventListener('click', onFirstInteraction);
    document.addEventListener('keydown', onFirstInteraction);

    // Load the YouTube API
    loadYouTubeAPI();
})();
