// ===== Starfield Parallax =====
// Moves the starfield background slightly with cursor / touch / gyroscope
(function () {
    'use strict';

    var isMobile = window.innerWidth <= 768;
    var MAX_OFFSET = isMobile ? 15 : 30;
    var ticking = false;
    var usesTouch = false;

    function applyOffset(nx, ny) {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(function () {
                document.body.style.setProperty('--star-x', (nx * MAX_OFFSET) + 'px');
                document.body.style.setProperty('--star-y', (ny * MAX_OFFSET) + 'px');
                ticking = false;
            });
        }
    }

    // --- Desktop: mouse (skip if touch device) ---
    document.addEventListener('mousemove', function (e) {
        if (usesTouch) return;
        var nx = (e.clientX / window.innerWidth  - 0.5) * 2;
        var ny = (e.clientY / window.innerHeight - 0.5) * 2;
        applyOffset(nx, ny);
    });

    // --- Mobile: touch ---
    document.addEventListener('touchmove', function (e) {
        usesTouch = true;
        var t = e.touches[0];
        if (!t) return;
        var nx = (t.clientX / window.innerWidth  - 0.5) * 2;
        var ny = (t.clientY / window.innerHeight - 0.5) * 2;
        applyOffset(nx, ny);
    }, { passive: true });

    // --- Mobile: gyroscope (device tilt) ---
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', function (e) {
            // gamma: left/right tilt (-90…90), beta: front/back tilt (-180…180)
            var gamma = e.gamma || 0;
            var beta  = e.beta  || 0;
            // Clamp and normalise to -1…1
            var nx = Math.max(-1, Math.min(1, gamma / 30));
            var ny = Math.max(-1, Math.min(1, (beta - 45) / 30));
            applyOffset(nx, ny);
        });
    }

    // --- Recalculate MAX_OFFSET on resize (debounced) ---
    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            isMobile = window.innerWidth <= 768;
            MAX_OFFSET = isMobile ? 15 : 30;
        }, 150);
    });
})();
