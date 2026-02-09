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

    const REEL_HEIGHT = 160;
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
    const ambienceVolumeSlider = document.getElementById('ambience-volume');
    const historyList = document.getElementById('history-list');

    let selectedBet = null;
    let isSpinning = false;
    let audioEnabled = true;
    let audioCtx = null;
    let pendingResultTimer = null;
    let currentBalance = null;
    let spinHistory = [];

    // Audio files
    const audioFiles = {
        ambience: new Audio('/games/strictly7s/audio/casino-ambiance.mp3'),
        smallWin: new Audio('/games/strictly7s/audio/slots-medium-win.mp3'),
        // Medium and big wins share the same audio instance (only 3 win sound files available)
        bigWin: new Audio('/games/strictly7s/audio/slots-big-win.mp3'),
        jackpot: new Audio('/games/strictly7s/audio/slots-jackpot.mp3')
    };
    // Reuse bigWin for mediumWin
    audioFiles.mediumWin = audioFiles.bigWin;

    // Configure ambience
    audioFiles.ambience.loop = true;
    audioFiles.ambience.volume = 0.3;

    // Configure win sounds at half volume
    audioFiles.smallWin.volume = 0.5;
    audioFiles.bigWin.volume = 0.5;
    audioFiles.jackpot.volume = 0.5;

    let ambienceStarted = false;

    function setStatus(text, kind) {
        statusEl.textContent = text;
        statusEl.setAttribute('data-kind', kind || 'info');
    }

    function setBalance(value) {
        if (typeof value === 'number') {
            currentBalance = value;
            balanceEl.textContent = String(value);
            updateBetButtons();
        }
    }

    function updateBetButtons() {
        if (currentBalance === null) return;
        
        betButtons.forEach((btn) => {
            const betValue = Number(btn.getAttribute('data-bet'));
            if (betValue > currentBalance) {
                btn.classList.add('insufficient');
            } else {
                btn.classList.remove('insufficient');
            }
        });

        // Deselect current bet if insufficient
        if (selectedBet !== null && selectedBet > currentBalance) {
            selectedBet = null;
            betButtons.forEach((b) => b.classList.remove('active'));
            spinBtn.disabled = true;
            setStatus('Insufficient balance. Choose a lower bet.', 'loss');
        }
    }

    function addToHistory(reels, payout, bet, winType) {
        const reelEmojis = reels.map((id) => symbolById[id] || '?');
        const entry = { reels: reelEmojis, payout, bet, winType };
        
        spinHistory.unshift(entry);
        if (spinHistory.length > 5) {
            spinHistory = spinHistory.slice(0, 5);
        }
        
        renderHistory();
    }

    function renderHistory() {
        historyList.innerHTML = '';
        
        spinHistory.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'history-row';
            
            const reelsDiv = document.createElement('div');
            reelsDiv.className = 'history-reels';
            reelsDiv.textContent = entry.reels.join(' ');
            
            const resultDiv = document.createElement('div');
            resultDiv.className = 'history-result';
            if (entry.payout > 0) {
                resultDiv.textContent = `+${entry.payout}`;
                resultDiv.classList.add('win');
            } else {
                resultDiv.textContent = `−${entry.bet}`;
                resultDiv.classList.add('loss');
            }
            
            row.appendChild(reelsDiv);
            row.appendChild(resultDiv);
            historyList.appendChild(row);
        });
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

    function playWinAnimation(isJackpot) {
        const animClass = isJackpot ? 'jackpot-flash' : 'win-flash';
        reels.forEach((reel) => {
            reel.frame.classList.add(animClass);
        });
        
        // Remove animation class after it completes
        // Regular win: 3 iterations × 0.4s = 1.2s; Jackpot: 5 iterations × 0.4s = 2.0s
        const duration = isJackpot ? 2000 : 1200;
        setTimeout(() => {
            reels.forEach((reel) => {
                reel.frame.classList.remove(animClass);
            });
        }, duration);
    }

    function playLossAnimation() {
        reels.forEach((reel) => {
            reel.frame.classList.add('loss-dim');
        });
        
        setTimeout(() => {
            reels.forEach((reel) => {
                reel.frame.classList.remove('loss-dim');
            });
        }, 600);
    }

    function playAudioFile(audio) {
        if (!audioEnabled) return;
        // Reset playback position if audio is ready
        if (audio.readyState >= 2) { // HAVE_CURRENT_DATA or greater
            audio.currentTime = 0;
        }
        audio.play().catch(err => console.log('Audio play failed:', err));
    }

    function playSpinSound() {
        // Keep the synthesized spin sound - it's quick feedback
        if (!audioEnabled) return;
        if (!audioCtx) {
            const AudioCtor = window.AudioContext || window.webkitAudioContext;
            if (AudioCtor) audioCtx = new AudioCtor();
        }
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = 320;
        gain.gain.value = 0.02;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.08);
        osc.stop(audioCtx.currentTime + 0.08);
    }

    function playWinSound(multiplier) {
        if (!audioEnabled) return;
        
        // Map multipliers to sounds:
        // Small: 2x-9x (CHERRY 9x, LEMON 7x, Two CHERRY 2x)
        // Medium: 17x-29x (BELL 17x, DIAMOND 29x)
        // Big: 50x (BAR 50x)
        // Jackpot: 140x (SEVEN 140x)
        
        if (multiplier >= 140) {
            // Jackpot
            playAudioFile(audioFiles.jackpot);
        } else if (multiplier >= 50) {
            // Big win
            playAudioFile(audioFiles.bigWin);
        } else if (multiplier >= 17) {
            // Medium win
            playAudioFile(audioFiles.mediumWin);
        } else if (multiplier >= 2) {
            // Small win
            playAudioFile(audioFiles.smallWin);
        }
    }

    function playLoseSound() {
        // Keep the synthesized lose sound
        if (!audioEnabled) return;
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 160;
        gain.gain.value = 0.02;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.14);
        osc.stop(audioCtx.currentTime + 0.14);
    }

    function startAmbience() {
        if (audioEnabled && !ambienceStarted) {
            audioFiles.ambience.play()
                .then(() => {
                    ambienceStarted = true;
                })
                .catch(err => {
                    // Autoplay blocked - will retry on first user interaction
                    console.log('Ambience autoplay blocked (expected):', err.message);
                });
        } else if (audioEnabled && ambienceStarted) {
            // Already started, just play if paused
            if (audioFiles.ambience.paused) {
                audioFiles.ambience.play().catch(err => console.log('Ambience play failed:', err));
            }
        }
    }

    function stopAmbience() {
        audioFiles.ambience.pause();
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
        
        // Start ambience on first user interaction
        if (!ambienceStarted) {
            startAmbience();
        }
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
                
                // Add to history
                addToHistory(result.reels, result.payout, result.bet, result.winType);
                
                // Play animations and sounds
                if (result.multiplier > 0) {
                    const isJackpot = result.reels[0] === 'SEVEN' && result.winType === 'three-kind';
                    playWinAnimation(isJackpot);
                    setStatus(formatWinMessage(result), 'win');
                    playWinSound(result.multiplier);
                } else {
                    playLossAnimation();
                    setStatus('No win this time.', 'loss');
                    playLoseSound();
                }
            }, 420);
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
            startAmbience();
        } else {
            stopAmbience();
        }
    });

    ambienceVolumeSlider.addEventListener('input', (e) => {
        const volume = e.target.value / 100;
        audioFiles.ambience.volume = volume;
    });

    // Note: Ambience will start on first user interaction (bet selection)
    // to comply with browser autoplay policies

    setReels(['---', '---', '---']);
})();
