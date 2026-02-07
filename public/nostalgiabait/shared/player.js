/* Nostalgiabait Shared YouTube Player */
(function () {
    'use strict';

    var YT_STATE_ENDED = 0;

    var overlay = document.getElementById('start-overlay');
    var playerContainer = document.getElementById('yt-player-container');
    var controls = document.getElementById('player-controls');
    var btnReplay = document.getElementById('btn-replay');
    var btnBack = document.getElementById('btn-back');
    var errorScreen = document.getElementById('error-screen');

    if (!overlay || !playerContainer) return;

    // Determine experience key from URL path
    var pathParts = window.location.pathname.replace(/\/+$/, '').split('/');
    var experienceKey = pathParts[pathParts.length - 1]; // e.g. "ps1", "ps2", "gamecube"

    var videoId = null;
    var ytPlayer = null;
    var ytApiReady = false;
    var pendingStart = false;

    // Fetch config from server
    fetch('/api/nostalgia-config')
        .then(function (res) { return res.json(); })
        .then(function (config) {
            videoId = config[experienceKey];
            if (!videoId) {
                showError('No YouTube video configured');
            }
        })
        .catch(function () {
            showError('Failed to load configuration');
        });

    // Load YouTube IFrame API
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    var firstScript = document.getElementsByTagName('script')[0];
    firstScript.parentNode.insertBefore(tag, firstScript);

    // YouTube API ready callback
    window.onYouTubeIframeAPIReady = function () {
        ytApiReady = true;
        if (pendingStart) {
            pendingStart = false;
            createPlayer();
        }
    };

    // Click-to-start
    overlay.addEventListener('click', startVideo);
    overlay.addEventListener('touchend', function (e) {
        e.preventDefault();
        startVideo();
    });

    function startVideo() {
        if (!videoId) {
            showError('No YouTube video configured');
            return;
        }
        overlay.classList.add('hidden');
        playerContainer.classList.add('active');
        if (ytApiReady) {
            createPlayer();
        } else {
            pendingStart = true;
        }
    }

    function createPlayer() {
        if (ytPlayer) {
            ytPlayer.seekTo(0);
            ytPlayer.playVideo();
            return;
        }

        ytPlayer = new YT.Player('yt-player', {
            videoId: videoId,
            playerVars: {
                autoplay: 1,
                controls: 0,
                modestbranding: 1,
                rel: 0,
                showinfo: 0,
                iv_load_policy: 3,
                fs: 0,
                disablekb: 1,
                playsinline: 1
            },
            events: {
                onReady: function (e) { e.target.playVideo(); },
                onStateChange: onPlayerStateChange,
                onError: function () { showError('YouTube video failed to load'); }
            }
        });
    }

    function onPlayerStateChange(event) {
        if (event.data === YT_STATE_ENDED) {
            if (controls) controls.classList.add('visible');
        }
    }

    // Replay
    if (btnReplay) {
        btnReplay.addEventListener('click', function () {
            if (controls) controls.classList.remove('visible');
            if (ytPlayer) {
                ytPlayer.seekTo(0);
                ytPlayer.playVideo();
            }
        });
    }

    // Back
    if (btnBack) {
        btnBack.addEventListener('click', function () {
            window.location.href = '/nostalgiabait/';
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (!overlay.classList.contains('hidden')) {
                startVideo();
            } else if (ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() === YT_STATE_ENDED) {
                if (controls) controls.classList.remove('visible');
                ytPlayer.seekTo(0);
                ytPlayer.playVideo();
            }
        }
        if (e.key === 'Escape') {
            window.location.href = '/nostalgiabait/';
        }
    });

    function showError(msg) {
        overlay.classList.add('hidden');
        playerContainer.classList.remove('active');
        if (controls) controls.classList.remove('visible');
        if (errorScreen) {
            var errorSub = errorScreen.querySelector('.error-sub');
            if (errorSub && msg) errorSub.textContent = msg;
            errorScreen.classList.add('active');
        }
    }
})();
