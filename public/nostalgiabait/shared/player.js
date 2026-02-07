/* Nostalgiabait Shared Video Player */
(function () {
    'use strict';

    var video = document.getElementById('boot-video');
    var overlay = document.getElementById('start-overlay');
    var controls = document.getElementById('player-controls');
    var btnReplay = document.getElementById('btn-replay');
    var btnBack = document.getElementById('btn-back');
    var errorScreen = document.getElementById('error-screen');

    if (!video || !overlay) return;

    // Click-to-start
    overlay.addEventListener('click', startVideo);
    overlay.addEventListener('touchend', function (e) {
        e.preventDefault();
        startVideo();
    });

    function startVideo() {
        overlay.classList.add('hidden');
        video.classList.add('active');
        video.play().catch(showError);
    }

    // Video ended → show controls
    video.addEventListener('ended', function () {
        if (controls) controls.classList.add('visible');
    });

    // Replay
    if (btnReplay) {
        btnReplay.addEventListener('click', function () {
            if (controls) controls.classList.remove('visible');
            video.currentTime = 0;
            video.play().catch(showError);
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
            } else if (video.ended) {
                if (controls) controls.classList.remove('visible');
                video.currentTime = 0;
                video.play().catch(showError);
            }
        }
        if (e.key === 'Escape') {
            window.location.href = '/nostalgiabait/';
        }
    });

    // Suppress context menu on video
    video.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });

    // Error handler
    video.addEventListener('error', function () {
        showError();
    });

    function showError() {
        overlay.classList.add('hidden');
        video.classList.remove('active');
        if (controls) controls.classList.remove('visible');
        if (errorScreen) errorScreen.classList.add('active');
    }
})();
