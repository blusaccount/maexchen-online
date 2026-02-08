// ========================================
// STRICT CLUB - Audio Visualizer
// ========================================

(function () {
    'use strict';

    var canvas = document.getElementById('visualizer-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var audioContext = null;
    var analyser = null;
    var dataArray = null;
    var bufferLength = 0;
    var animationId = null;
    var isPlaying = false;
    var simulatedLevel = 0;

    // Resize canvas to match display size
    function resizeCanvas() {
        var rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio || rect.width;
        canvas.height = rect.height * window.devicePixelRatio || rect.height;
        ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize Web Audio API
    function initAudioContext() {
        if (audioContext) return;
        try {
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContext();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
        } catch (err) {
            console.warn('Web Audio API not available:', err.message);
        }
    }

    // Connect to YouTube player audio
    function connectToPlayer(player) {
        if (!audioContext || !analyser) return false;
        
        try {
            // Attempt to connect to the iframe's audio (may fail due to CORS)
            var iframe = player.getIframe();
            if (!iframe || !iframe.contentWindow) return false;

            var source = audioContext.createMediaElementSource(iframe.contentWindow.document.querySelector('video'));
            source.connect(analyser);
            analyser.connect(audioContext.destination);
            return true;
        } catch (err) {
            console.warn('Could not connect Web Audio API (CORS):', err.message);
            return false;
        }
    }

    // Draw visualizer bars
    function draw() {
        var width = canvas.width / (window.devicePixelRatio || 1);
        var height = canvas.height / (window.devicePixelRatio || 1);

        // Clear canvas with dark gradient background
        var bgGrad = ctx.createLinearGradient(0, 0, 0, height);
        bgGrad.addColorStop(0, 'rgba(0, 30, 60, 0.3)');
        bgGrad.addColorStop(1, 'rgba(0, 10, 20, 0.5)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        var barCount = 64;
        var barWidth = (width / barCount) * 0.8;
        var gap = (width / barCount) * 0.2;

        for (var i = 0; i < barCount; i++) {
            var barHeight;

            if (dataArray && analyser && isPlaying) {
                // Real audio data
                analyser.getByteFrequencyData(dataArray);
                var index = Math.floor((i / barCount) * bufferLength);
                barHeight = (dataArray[index] / 255) * height * 0.8;
            } else {
                // Simulated visualizer when no real data available
                if (isPlaying) {
                    simulatedLevel += (Math.random() - 0.5) * 0.1;
                    simulatedLevel = Math.max(0.1, Math.min(0.6, simulatedLevel));
                } else {
                    simulatedLevel *= 0.95;
                }
                var wave = Math.sin((i / barCount) * Math.PI * 2 + Date.now() / 500) * 0.3 + 0.5;
                barHeight = wave * simulatedLevel * height * 0.7;
            }

            // Bar color gradient (ocean blue to sky blue to white)
            var barGrad = ctx.createLinearGradient(0, height - barHeight, 0, height);
            barGrad.addColorStop(0, '#ffffff');
            barGrad.addColorStop(0.5, '#87CEEB');
            barGrad.addColorStop(1, '#0077BE');
            ctx.fillStyle = barGrad;

            // Draw rounded bar
            var x = i * (barWidth + gap);
            var y = height - barHeight;
            var radius = barWidth / 2;

            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + barWidth - radius, y);
            ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
            ctx.lineTo(x + barWidth, height);
            ctx.lineTo(x, height);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.fill();

            // Subtle glow
            ctx.shadowColor = 'rgba(135, 206, 235, 0.5)';
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        animationId = requestAnimationFrame(draw);
    }

    // Start visualizer
    function start() {
        if (!animationId) {
            draw();
        }
    }

    // Stop visualizer
    function stop() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    // Public API
    window.StrictClubVisualizer = {
        init: initAudioContext,
        connect: connectToPlayer,
        start: start,
        stop: stop,
        setPlaying: function (playing) {
            isPlaying = playing;
            if (playing) {
                start();
            }
        }
    };

    // Auto-start with simulated mode
    start();
})();
