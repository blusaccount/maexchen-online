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
    var hasRealAudio = false;

    // Smoothing: store previous bar heights and lerp toward targets
    var BAR_COUNT = 48;
    var smoothBars = new Float32Array(BAR_COUNT);
    var LERP_UP = 0.18;
    var LERP_DOWN = 0.08;

    // Resize canvas to match display size
    function resizeCanvas() {
        var dpr = window.devicePixelRatio || 1;
        var rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
            analyser.smoothingTimeConstant = 0.8;
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
            var iframe = player.getIframe();
            if (!iframe || !iframe.contentWindow) return false;

            var source = audioContext.createMediaElementSource(
                iframe.contentWindow.document.querySelector('video')
            );
            source.connect(analyser);
            analyser.connect(audioContext.destination);
            hasRealAudio = true;
            return true;
        } catch (err) {
            console.warn('Could not connect Web Audio API (CORS), using simulated visualizer');
            hasRealAudio = false;
            return false;
        }
    }

    // HSL helper
    function hsl(h, s, l, a) {
        if (a !== undefined) return 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')';
        return 'hsl(' + h + ',' + s + '%,' + l + '%)';
    }

    // Draw visualizer
    function draw() {
        var width = canvas.width / (window.devicePixelRatio || 1);
        var height = canvas.height / (window.devicePixelRatio || 1);
        var now = Date.now();

        // Clear with translucent fill for trail effect
        ctx.fillStyle = 'rgba(8, 10, 28, 0.35)';
        ctx.fillRect(0, 0, width, height);

        // Fetch real audio data once per frame
        if (hasRealAudio && analyser && dataArray && isPlaying) {
            analyser.getByteFrequencyData(dataArray);
        }

        var barWidth = (width / BAR_COUNT) * 0.75;
        var gap = (width / BAR_COUNT) * 0.25;
        var hueBase = (now / 40) % 360;

        for (var i = 0; i < BAR_COUNT; i++) {
            var target;

            if (hasRealAudio && dataArray && isPlaying) {
                var index = Math.floor((i / BAR_COUNT) * bufferLength);
                target = (dataArray[index] / 255) * height * 0.85;
            } else if (isPlaying) {
                // Smooth simulated waveform using layered sine waves
                var t = now / 1000;
                var wave = Math.sin((i / BAR_COUNT) * Math.PI * 3 + t * 1.2) * 0.25
                         + Math.sin((i / BAR_COUNT) * Math.PI * 5 + t * 0.7) * 0.15
                         + Math.sin((i / BAR_COUNT) * Math.PI + t * 2.0) * 0.10
                         + 0.50;
                target = wave * height * 0.70;
            } else {
                // Idle gentle wave
                var idle = Math.sin((i / BAR_COUNT) * Math.PI * 2 + now / 2000) * 0.08 + 0.10;
                target = idle * height;
            }

            // Lerp smoothing (fast attack, slow release)
            var rate = target > smoothBars[i] ? LERP_UP : LERP_DOWN;
            smoothBars[i] += (target - smoothBars[i]) * rate;

            var barHeight = Math.max(2, smoothBars[i]);
            var x = i * (barWidth + gap);
            var y = height - barHeight;

            // Per-bar hue shifts across the rainbow
            var barHue = (hueBase + (i / BAR_COUNT) * 280) % 360;
            var intensity = barHeight / height;

            // Gradient from bottom to top
            var barGrad = ctx.createLinearGradient(0, height, 0, y);
            barGrad.addColorStop(0, hsl(barHue, 90, 55));
            barGrad.addColorStop(0.5, hsl((barHue + 40) % 360, 85, 65));
            barGrad.addColorStop(1, hsl((barHue + 80) % 360, 80, 80, 0.9));

            // Glow
            ctx.shadowColor = hsl(barHue, 100, 60, 0.6);
            ctx.shadowBlur = 12 + intensity * 18;

            // Draw rounded bar
            var radius = Math.min(barWidth / 2, barHeight / 2);
            ctx.fillStyle = barGrad;
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

            // Bright cap on top of each bar
            ctx.shadowBlur = 0;
            ctx.fillStyle = hsl((barHue + 60) % 360, 100, 88, 0.9);
            ctx.fillRect(x, y, barWidth, Math.min(3, barHeight));
        }

        ctx.shadowBlur = 0;
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
