// ============================
// DICE MODULE - 2D Physics Animation with Audio (Alien Theme)
// ============================

(function() {
    const { $ } = window.MaexchenApp;

    // ===== AUDIO ENGINE =====
    let audioCtx = null;

    function ensureAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    function playBounceSound(intensity = 1) {
        const ctx = ensureAudio();
        const now = ctx.currentTime;
        const vol = Math.min(0.4, intensity * 0.3);

        // Create noise burst
        const duration = 0.03;
        const bufferSize = Math.ceil(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        // Bandpass filter for metallic sound
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(3000 + Math.random() * 2000, now);
        filter.Q.setValueAtTime(5 + Math.random() * 5, now);

        // Envelope
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start(now);
        noise.stop(now + duration);
    }

    function playCollisionSound() {
        const ctx = ensureAudio();
        const now = ctx.currentTime;

        // Metallic click/clack sound
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200 + Math.random() * 600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.1);
    }

    function playSettleSound() {
        const ctx = ensureAudio();
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.2);
    }

    // ===== PIP POSITIONS =====
    const PIP_POSITIONS = {
        1: [[50, 50]],
        2: [[25, 25], [75, 75]],
        3: [[25, 25], [50, 50], [75, 75]],
        4: [[25, 25], [75, 25], [25, 75], [75, 75]],
        5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
        6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]]
    };

    // Create a die element with value - ALIEN STYLE
    function createDie(value, size = 80) {
        const die = document.createElement('div');
        die.className = 'die';
        die.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            background: linear-gradient(145deg, #1a1a1a 0%, #0a0a0a 50%, #1a1a1a 100%);
            border-radius: 14px;
            position: absolute;
            border: 2px solid #00ff88;
            box-shadow:
                0 0 15px rgba(0,255,136,0.4),
                0 6px 20px rgba(0,0,0,0.8),
                inset 0 0 20px rgba(0,255,136,0.1),
                inset 0 -2px 6px rgba(0,0,0,0.5),
                inset 0 2px 6px rgba(0,255,136,0.2);
        `;

        const pipSize = size * 0.18;
        PIP_POSITIONS[value].forEach(([x, y]) => {
            const pip = document.createElement('div');
            pip.style.cssText = `
                width: ${pipSize}px;
                height: ${pipSize}px;
                background: radial-gradient(circle at 30% 30%, #00ffaa, #00ff88 40%, #00cc66 100%);
                border-radius: 50%;
                position: absolute;
                left: ${x}%;
                top: ${y}%;
                transform: translate(-50%, -50%);
                box-shadow:
                    0 0 8px #00ff88,
                    0 0 15px rgba(0,255,136,0.6),
                    inset 0 -2px 4px rgba(0,0,0,0.3);
            `;
            die.appendChild(pip);
        });

        return die;
    }

    // Physics simulation
    function simulateDice(container, d1Val, d2Val, onComplete) {
        container.innerHTML = '';
        ensureAudio();

        const width = container.clientWidth;
        const height = container.clientHeight;
        const dieSize = 80;

        const die1 = createDie(d1Val, dieSize);
        const die2 = createDie(d2Val, dieSize);
        container.appendChild(die1);
        container.appendChild(die2);

        // Random throw from different positions
        const throwType = Math.floor(Math.random() * 3);
        let startX1, startX2, startY1, startY2, vx1, vx2, vy1, vy2;

        if (throwType === 0) {
            // From left
            startX1 = -40;
            startX2 = -70;
            startY1 = height * 0.3;
            startY2 = height * 0.5;
            vx1 = 700 + Math.random() * 500;
            vx2 = 600 + Math.random() * 400;
            vy1 = -300 + Math.random() * 200;
            vy2 = -200 + Math.random() * 150;
        } else if (throwType === 1) {
            // From right
            startX1 = width + 40;
            startX2 = width + 70;
            startY1 = height * 0.3;
            startY2 = height * 0.5;
            vx1 = -(700 + Math.random() * 500);
            vx2 = -(600 + Math.random() * 400);
            vy1 = -300 + Math.random() * 200;
            vy2 = -200 + Math.random() * 150;
        } else {
            // From top corners
            const fromLeftTop = Math.random() > 0.5;
            startX1 = fromLeftTop ? -40 : width + 40;
            startX2 = fromLeftTop ? -70 : width + 70;
            startY1 = -40;
            startY2 = -70;
            const dir = fromLeftTop ? 1 : -1;
            vx1 = dir * (400 + Math.random() * 400);
            vx2 = dir * (350 + Math.random() * 350);
            vy1 = 500 + Math.random() * 300;
            vy2 = 450 + Math.random() * 250;
        }

        const dice = [
            {
                el: die1,
                x: startX1,
                y: startY1,
                vx: vx1,
                vy: vy1,
                angle: Math.random() * 360,
                va: (Math.random() - 0.5) * 1800
            },
            {
                el: die2,
                x: startX2,
                y: startY2,
                vx: vx2,
                vy: vy2,
                angle: Math.random() * 360,
                va: (Math.random() - 0.5) * 1800
            }
        ];

        const gravity = 1200;
        const bounce = 0.7;
        const friction = 0.995;
        const angularFriction = 0.98;

        let lastTime = null;
        let settled = false;
        let settledFrames = 0;

        function step(timestamp) {
            if (!lastTime) {
                lastTime = timestamp;
                requestAnimationFrame(step);
                return;
            }

            const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
            lastTime = timestamp;

            let allSettled = true;

            dice.forEach(d => {
                const oldVy = d.vy;
                const oldVx = d.vx;

                // Gravity
                d.vy += gravity * dt;

                // Movement
                d.x += d.vx * dt;
                d.y += d.vy * dt;
                d.angle += d.va * dt;

                // Friction
                d.vx *= friction;
                d.va *= angularFriction;

                // Bounce off walls
                if (d.x < dieSize / 2) {
                    d.x = dieSize / 2;
                    const impact = Math.abs(d.vx);
                    d.vx = Math.abs(d.vx) * bounce;
                    d.va += (Math.random() - 0.5) * 600;
                    if (impact > 100) playBounceSound(impact / 500);
                }
                if (d.x > width - dieSize / 2) {
                    d.x = width - dieSize / 2;
                    const impact = Math.abs(d.vx);
                    d.vx = -Math.abs(d.vx) * bounce;
                    d.va += (Math.random() - 0.5) * 600;
                    if (impact > 100) playBounceSound(impact / 500);
                }

                // Bounce off ceiling
                if (d.y < dieSize / 2) {
                    d.y = dieSize / 2;
                    d.vy = Math.abs(d.vy) * bounce;
                    d.va += (Math.random() - 0.5) * 400;
                }

                // Bounce off floor
                if (d.y > height - dieSize / 2) {
                    d.y = height - dieSize / 2;
                    const impact = Math.abs(oldVy);
                    if (impact > 30) {
                        d.vy = -Math.abs(d.vy) * bounce;
                        d.va += (Math.random() - 0.5) * 500;
                        d.vx += (Math.random() - 0.5) * 150;
                        if (impact > 80) playBounceSound(impact / 400);
                    } else {
                        d.vy = 0;
                        d.vx *= 0.9;
                        d.va *= 0.85;
                    }
                }

                // Check if settled
                const speed = Math.sqrt(d.vx * d.vx + d.vy * d.vy);
                if (speed > 12 || Math.abs(d.va) > 15 || d.y < height - dieSize / 2 - 3) {
                    allSettled = false;
                }

                // Render
                d.el.style.left = (d.x - dieSize / 2) + 'px';
                d.el.style.top = (d.y - dieSize / 2) + 'px';
                d.el.style.transform = `rotate(${d.angle}deg)`;
            });

            // Dice-to-dice collision
            const d1 = dice[0];
            const d2 = dice[1];
            const dx = d2.x - d1.x;
            const dy = d2.y - d1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = dieSize;

            if (dist < minDist && dist > 0) {
                const overlap = minDist - dist;
                const nx = dx / dist;
                const ny = dy / dist;

                d1.x -= nx * overlap * 0.5;
                d1.y -= ny * overlap * 0.5;
                d2.x += nx * overlap * 0.5;
                d2.y += ny * overlap * 0.5;

                const relVx = d1.vx - d2.vx;
                const relVy = d1.vy - d2.vy;
                const impulse = (relVx * nx + relVy * ny) * 0.9;

                d1.vx -= impulse * nx;
                d1.vy -= impulse * ny;
                d2.vx += impulse * nx;
                d2.vy += impulse * ny;

                d1.va += (Math.random() - 0.5) * 800;
                d2.va += (Math.random() - 0.5) * 800;

                if (Math.abs(impulse) > 50) playCollisionSound();

                allSettled = false;
            }

            if (allSettled) {
                settledFrames++;
                if (settledFrames > 8 && !settled) {
                    settled = true;
                    playSettleSound();
                    // Snap to clean rotation with glow pulse
                    dice.forEach(d => {
                        d.el.style.transition = 'transform 0.25s ease-out, box-shadow 0.3s ease';
                        d.el.style.transform = 'rotate(0deg)';
                        d.el.style.boxShadow = `
                            0 0 25px rgba(0,255,136,0.6),
                            0 6px 20px rgba(0,0,0,0.8),
                            inset 0 0 30px rgba(0,255,136,0.2),
                            inset 0 -2px 6px rgba(0,0,0,0.5),
                            inset 0 2px 6px rgba(0,255,136,0.3)
                        `;
                    });
                    setTimeout(() => {
                        if (onComplete) onComplete();
                    }, 300);
                    return;
                }
            } else {
                settledFrames = 0;
            }

            if (!settled) {
                requestAnimationFrame(step);
            }
        }

        requestAnimationFrame(step);
    }

    // Public API
    function roll(d1, d2, onComplete) {
        const container = $('dice-container');
        if (!container) {
            if (onComplete) onComplete();
            return;
        }
        simulateDice(container, d1, d2, onComplete);
    }

    function clear() {
        const container = $('dice-container');
        if (container) {
            container.innerHTML = '';
        }
        const resultEl = $('dice-result');
        if (resultEl) {
            resultEl.textContent = '';
            resultEl.style.display = 'none';
        }
    }

    window.MaexchenDice = { roll, clear };
})();
