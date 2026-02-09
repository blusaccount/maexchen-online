// ============== STRICTLY7S CLIENT ==============

(() => {
    'use strict';

    const socket = io();
    const SYMBOLS = [
        { id: 'SEVEN', label: '7️⃣' },
        { id: 'BAR', label: '🟫' },
        { id: 'DIAMOND', label: '💎' },
        { id: 'BELL', label: '🔔' },
        { id: 'CHERRY', label: '🍒' },
        { id: 'LEMON', label: '🍋' }
    ];

    const symbolById = SYMBOLS.reduce((acc, s) => {
        acc[s.id] = s.label;
        return acc;
    }, {});

    const REEL_HEIGHT = 96;
    const REEL_REPEAT = 50;
    const reels = [
        {
            frame: document.getElementById('reel-frame-1'),
            strip: document.getElementById('reel-1'),
            offset: 0,
            speed: 0.75,
            raf: 0,
            spinning: false,
            isStopping: false,
            symbolIndices: {},
            stripHeight: 0
        },
        {
            frame: document.getElementById('reel-frame-2'),
            strip: document.getElementById('reel-2'),
            offset: 0,
            speed: 0.85,
            raf: 0,
            spinning: false,
            isStopping: false,
            symbolIndices: {},
            stripHeight: 0
        },
        {
            frame: document.getElementById('reel-frame-3'),
            strip: document.getElementById('reel-3'),
            offset: 0,
            speed: 0.95,
            raf: 0,
            spinning: false,
            isStopping: false,
            symbolIndices: {},
            stripHeight: 0
        }
    ];
    const statusEl = document.getElementById('status');
    const balanceEl = document.getElementById('balance-display');
    const spinBtn = document.getElementById('spin-btn');
    const betButtons = Array.prototype.slice.call(document.querySelectorAll('.bet-btn'));
    const soundToggle = document.getElementById('sound-toggle');

    let selectedBet = null;
    let isSpinning = false;
    let audioEnabled = true;
    let audioCtx = null;
    let pendingResultTimer = null;

    function setStatus(text, kind) {
        statusEl.textContent = text;
        statusEl.setAttribute('data-kind', kind || 'info');
    }

    function setBalance(value) {
        if (typeof value === 'number') {
            balanceEl.textContent = String(value);
        }
    }

    function buildReelStrip(reel) {
        const frag = document.createDocumentFragment();
        const indices = {};
        for (let i = 0; i < REEL_REPEAT; i++) {
            for (let j = 0; j < SYMBOLS.length; j++) {
                const symbol = SYMBOLS[j];
                const item = document.createElement('div');
                item.className = 'reel-item';
                item.textContent = symbol.label;
                const idx = (i * SYMBOLS.length) + j;
                if (!indices[symbol.id]) indices[symbol.id] = [];
                indices[symbol.id].push(idx);
                frag.appendChild(item);
            }
        }
        reel.strip.innerHTML = '';
        reel.strip.appendChild(frag);
        reel.symbolIndices = indices;
        reel.stripHeight = REEL_HEIGHT * REEL_REPEAT * SYMBOLS.length;
        reel.offset = 0;
        reel.strip.style.transform = 'translateY(0px)';
    }

    function setReels(values) {
        for (let i = 0; i < reels.length; i++) {
            const symbol = values[i] || '---';
            reels[i].strip.innerHTML = '';
            const item = document.createElement('div');
            item.className = 'reel-item';
            item.textContent = symbol;
            reels[i].strip.appendChild(item);
        }
    }

    function setSpinningState(active) {
        isSpinning = active;
        spinBtn.disabled = active || selectedBet === null;
    }

    function startSpinAnimation() {
        reels.forEach((reel) => {
            buildReelStrip(reel);
            reel.frame.classList.add('spinning');
            reel.spinning = true;
            reel.isStopping = false;
            startReelLoop(reel);
        });
    }

    function startReelLoop(reel) {
        if (reel.raf) {
            cancelAnimationFrame(reel.raf);
            reel.raf = 0;
        }
        let last = performance.now();
        const maxSafeOffset = reel.stripHeight - REEL_HEIGHT - (SYMBOLS.length * REEL_HEIGHT * 3);
        const resetOffset = reel.stripHeight / 2;
        const tick = (ts) => {
            if (!reel.spinning || reel.isStopping) return;
            const dt = ts - last;
            last = ts;
            reel.offset += reel.speed * dt;
            if (reel.offset > maxSafeOffset) {
                reel.offset -= resetOffset;
            }
            reel.strip.style.transform = `translateY(${-reel.offset}px)`;
            reel.raf = requestAnimationFrame(tick);
        };
        reel.raf = requestAnimationFrame(tick);
    }

    function stopReel(reel, symbolId, delay) {
        setTimeout(() => {
            reel.spinning = false;
            reel.isStopping = true;
            if (reel.raf) {
                cancelAnimationFrame(reel.raf);
                reel.raf = 0;
            }

            const indices = reel.symbolIndices[symbolId] || [];
            if (!indices.length) {
                reel.frame.classList.remove('spinning');
                reel.isStopping = false;
                return;
            }

            const currentIndex = Math.floor(reel.offset / REEL_HEIGHT);
            const minIndex = currentIndex + (SYMBOLS.length * 2);
            let targetIndex = null;
            for (let i = 0; i < indices.length; i++) {
                if (indices[i] >= minIndex) {
                    targetIndex = indices[i];
                    break;
                }
            }
            if (targetIndex === null) {
                targetIndex = indices[indices.length - 1];
            }

            let targetOffset = targetIndex * REEL_HEIGHT;
            if (targetOffset > reel.stripHeight - REEL_HEIGHT) {
                targetOffset = reel.stripHeight - REEL_HEIGHT;
            }

            reel.strip.style.transition = 'transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)';
            reel.strip.style.transform = `translateY(${-targetOffset}px)`;
            reel.offset = targetOffset;

            setTimeout(() => {
                reel.strip.style.transition = '';
                reel.frame.classList.remove('spinning');
                reel.isStopping = false;
            }, 650);
        }, delay);
    }

    function stopSpinAnimation(finalReels) {
        for (let i = 0; i < reels.length; i++) {
            stopReel(reels[i], finalReels[i], i * 180);
        }
    }

    function ensureAudioContext() {
        if (!audioCtx) {
            const AudioCtor = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtor) return null;
            audioCtx = new AudioCtor();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    function playTone(freq, durationMs, type, volume) {
        if (!audioEnabled) return;
        const ctx = ensureAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || 'square';
        osc.frequency.value = freq;
        gain.gain.value = volume || 0.03;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
        osc.stop(ctx.currentTime + durationMs / 1000);
    }

    function playSpinSound() {
        playTone(320, 80, 'square', 0.02);
    }

    function playWinSound(multiplier) {
        if (multiplier >= 20) {
            playTone(520, 120, 'square', 0.04);
            setTimeout(() => { playTone(660, 160, 'square', 0.04); }, 140);
            setTimeout(() => { playTone(820, 220, 'square', 0.04); }, 320);
        } else {
            playTone(440, 150, 'square', 0.03);
            setTimeout(() => { playTone(620, 180, 'square', 0.03); }, 160);
        }
    }

    function playLoseSound() {
        playTone(160, 140, 'sawtooth', 0.02);
    }

    function registerPlayer() {
        const name = window.StrictHotelSocket.getPlayerName();
        if (!name) {
            setStatus('Not logged in. Set a name in the lobby first.', 'loss');
            spinBtn.disabled = true;
            return;
        }

        window.StrictHotelSocket.registerPlayer(socket, 'strictly7s');
        socket.emit('get-balance');
    }

    function handleBetClick(btn) {
        const betValue = Number(btn.getAttribute('data-bet'));
        if (!Number.isInteger(betValue)) return;
        selectedBet = betValue;
        betButtons.forEach((b) => { b.classList.remove('active'); });
        btn.classList.add('active');
        spinBtn.disabled = isSpinning || selectedBet === null;
        setStatus(`Bet set to ${betValue} SC. Ready to spin.`, 'info');
    }

    function handleSpin() {
        if (isSpinning || selectedBet === null) return;
        setStatus('Spinning...', 'info');
        setSpinningState(true);
        startSpinAnimation();
        playSpinSound();
        socket.emit('strictly7s-spin', { bet: selectedBet });
    }

    function formatWinMessage(result) {
        if (result.multiplier <= 0) {
            return 'No win this time.';
        }
        if (result.winType === 'two-cherries') {
            return `Two CHERRY hit. You won ${result.payout} SC.`;
        }
        const label = symbolById[result.reels[0]] || result.reels[0];
        return `${label} x3. You won ${result.payout} SC.`;
    }

    socket.on('connect', () => {
        registerPlayer();
    });

    socket.on('balance-update', (data) => {
        if (data && typeof data.balance === 'number') {
            setBalance(data.balance);
        }
    });

    socket.on('strictly7s-spin-result', (result) => {
        const finalReels = (result.reels || []).map((id) => {
            return id || '---';
        });

        pendingResultTimer = setTimeout(() => {
            pendingResultTimer = null;
            stopSpinAnimation(finalReels);
            setTimeout(() => {
                setSpinningState(false);
                setBalance(result.balance);
            }, 420);

            if (result.multiplier > 0) {
                setStatus(formatWinMessage(result), 'win');
                playWinSound(result.multiplier);
            } else {
                setStatus('No win this time.', 'loss');
                playLoseSound();
            }
        }, 450);
    });

    socket.on('strictly7s-error', (data) => {
        // Clear pending result timer to avoid race condition
        if (pendingResultTimer !== null) {
            clearTimeout(pendingResultTimer);
            pendingResultTimer = null;
        }

        reels.forEach((reel) => {
            if (reel.raf) {
                cancelAnimationFrame(reel.raf);
                reel.raf = 0;
            }
            reel.spinning = false;
            reel.isStopping = false;
            reel.frame.classList.remove('spinning');
            reel.strip.style.transition = '';
        });
        setReels(['---', '---', '---']);
        setSpinningState(false);
        setStatus(data && data.message ? data.message : 'Spin failed.', 'loss');
    });

    betButtons.forEach((btn) => {
        btn.addEventListener('click', () => { handleBetClick(btn); });
    });

    spinBtn.addEventListener('click', handleSpin);

    soundToggle.addEventListener('click', () => {
        audioEnabled = !audioEnabled;
        soundToggle.textContent = `Sound: ${audioEnabled ? 'On' : 'Off'}`;
        if (audioEnabled) {
            ensureAudioContext();
        }
    });

    setReels(['---', '---', '---']);
})();
