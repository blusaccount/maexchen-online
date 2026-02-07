// ===== Starfield Parallax =====
// Moves the starfield background slightly with cursor movement
(function () {
    'use strict';

    var MAX_OFFSET = 30; // max pixels the stars shift
    var ticking = false;

    document.addEventListener('mousemove', function (e) {
        var cx = e.clientX;
        var cy = e.clientY;

        if (!ticking) {
            ticking = true;
            requestAnimationFrame(function () {
                // Normalise cursor to -1 … 1 range (centre = 0)
                var nx = (cx / window.innerWidth  - 0.5) * 2;
                var ny = (cy / window.innerHeight - 0.5) * 2;

                document.body.style.setProperty('--star-x', (nx * MAX_OFFSET) + 'px');
                document.body.style.setProperty('--star-y', (ny * MAX_OFFSET) + 'px');
                ticking = false;
            });
        }
    });
})();
