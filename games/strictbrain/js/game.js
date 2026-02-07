// ============================
// STRICT BRAIN — Game Logic
// ============================

(function () {
    'use strict';

    // Socket connection
    const socket = io();

    // DOM helper
    const $ = id => document.getElementById(id);

    // Screens
    function showScreen(name) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const el = $('screen-' + name);
        if (el) el.classList.add('active');
    }

    // Player state
    let playerName = localStorage.getItem('stricthotel-name') || '';

    // Register player
    if (playerName) {
        socket.emit('register-player', { name: playerName, character: null, game: 'strictbrain' });
    }

    socket.on('connect', () => {
        if (playerName) {
            socket.emit('register-player', { name: playerName, character: null, game: 'strictbrain' });
        }
        socket.emit('brain-get-leaderboard');
    });

    // ============== LEADERBOARD ==============

    socket.on('brain-leaderboard', (entries) => {
        const list = $('leaderboard-list');
        if (!list) return;
        if (!entries || entries.length === 0) {
            list.innerHTML = '<div class="lb-row"><span style="color:var(--ds-text-dim)">Noch keine Ergebnisse</span></div>';
            return;
        }
        list.innerHTML = entries.map((e, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
            return '<div class="lb-row">' +
                '<span class="lb-rank">' + medal + '</span>' +
                '<span class="lb-name">' + escapeHtml(e.name) + '</span>' +
                '<span class="lb-age">' + e.brainAge + ' J.</span>' +
                '</div>';
        }).join('');
    });

    // ============== PER-GAME LEADERBOARDS ==============

    let gameLeaderboardData = {};
    let activeGameTab = 'math';

    const GAME_TAB_NAMES = {
        math: '➗ Mathe-Blitz',
        stroop: '🎨 Farbe vs. Wort',
        chimp: '🔢 Zahlen-Memory',
        reaction: '⚡ Reaktionstest',
        scramble: '🔤 Wort-Scramble'
    };

    socket.on('brain-game-leaderboards', (data) => {
        if (!data) return;
        gameLeaderboardData = data;
        renderGameLeaderboard(activeGameTab);
    });

    function renderGameLeaderboard(gameId) {
        const list = $('game-lb-list');
        const title = $('game-lb-title');
        if (!list || !title) return;

        title.textContent = GAME_TAB_NAMES[gameId] || gameId;

        const entries = gameLeaderboardData[gameId];
        if (!entries || entries.length === 0) {
            list.innerHTML = '<div class="lb-row"><span style="color:var(--ds-text-dim)">Noch keine Ergebnisse</span></div>';
            return;
        }
        list.innerHTML = entries.map((e, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
            return '<div class="lb-row">' +
                '<span class="lb-rank">' + medal + '</span>' +
                '<span class="lb-name">' + escapeHtml(e.name) + '</span>' +
                '<span class="lb-score">' + e.score + '/100</span>' +
                '</div>';
        }).join('');
    }

    // Tab click handlers
    document.querySelectorAll('.game-lb-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.game-lb-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeGameTab = tab.dataset.game;
            renderGameLeaderboard(activeGameTab);
        });
    });

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ============== NAVIGATION ==============

    $('btn-daily-test').addEventListener('click', () => startDailyTest());
    $('btn-free-training').addEventListener('click', () => showScreen('training'));
    $('btn-back-training').addEventListener('click', () => showScreen('menu'));
    $('btn-back-results').addEventListener('click', () => {
        socket.emit('brain-get-leaderboard');
        showScreen('menu');
    });

    $('brain-title').addEventListener('click', () => {
        stopTimer();
        isDailyTest = false;
        $('game-area').innerHTML = '';
        socket.emit('brain-get-leaderboard');
        showScreen('menu');
    });

    // Free training buttons
    document.querySelectorAll('.training-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const game = btn.dataset.game;
            startSingleGame(game, true);
        });
    });

    // ============== DAILY TEST ==============

    const ALL_GAMES = ['math', 'stroop', 'chimp', 'reaction', 'scramble'];
    let dailyGames = [];
    let dailyIndex = 0;
    let dailyResults = [];
    let isDailyTest = false;

    function shuffleArray(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    function startDailyTest() {
        isDailyTest = true;
        dailyGames = shuffleArray(ALL_GAMES).slice(0, 3);
        dailyIndex = 0;
        dailyResults = [];
        startSingleGame(dailyGames[0], false);
    }

    function onGameFinished(gameId, score, rawData) {
        if (isDailyTest) {
            dailyResults.push({ gameId, score, rawData });
            dailyIndex++;
            if (dailyIndex < dailyGames.length) {
                // Brief pause then next game
                setTimeout(() => startSingleGame(dailyGames[dailyIndex], false), 1200);
            } else {
                showDailyResults();
            }
        } else {
            // Free training - show single result
            showSingleResult(gameId, score, rawData);
        }
    }

    // ============== BRAIN AGE CALCULATION ==============

    // Each game returns a score 0-100 (percentile-like).
    // Brain age formula: lower score = older brain age, higher = younger
    function calculateBrainAge(scores) {
        if (scores.length === 0) return 80;
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        // Map: score 100 → age 20, score 0 → age 80
        const age = Math.round(80 - (avg / 100) * 60);
        return Math.max(20, Math.min(80, age));
    }

    function calculateCoins(brainAge) {
        // Better brain age = more coins
        if (brainAge <= 25) return 50;
        if (brainAge <= 35) return 30;
        if (brainAge <= 45) return 20;
        if (brainAge <= 55) return 10;
        return 5;
    }

    const GAME_NAMES = {
        math: '➗ Mathe-Blitz',
        stroop: '🎨 Farbe vs. Wort',
        chimp: '🔢 Zahlen-Memory',
        reaction: '⚡ Reaktionstest',
        scramble: '🔤 Wort-Scramble'
    };

    function showDailyResults() {
        const scores = dailyResults.map(r => r.score);
        const brainAge = calculateBrainAge(scores);
        const coins = calculateCoins(brainAge);

        $('results-brain-age').textContent = brainAge;
        $('results-age-label').textContent = 'Dein Gehirnalter';

        // Professor comment
        if (brainAge <= 25) {
            $('results-speech').textContent = 'Unglaublich! Dein Gehirn ist in Topform!';
        } else if (brainAge <= 35) {
            $('results-speech').textContent = 'Sehr gut! Dein Gehirn ist richtig fit!';
        } else if (brainAge <= 50) {
            $('results-speech').textContent = 'Solide Leistung! Weiter trainieren!';
        } else {
            $('results-speech').textContent = 'Da geht noch mehr! Übung macht den Meister!';
        }

        // Breakdown
        const breakdown = $('results-breakdown');
        breakdown.innerHTML = dailyResults.map(r =>
            '<div class="results-row">' +
            '<span class="results-game-name">' + GAME_NAMES[r.gameId] + '</span>' +
            '<span class="results-game-score">' + r.score + '/100</span>' +
            '</div>'
        ).join('');

        // Coins
        $('results-coins-amount').textContent = '+' + coins + ' StrictCoins';

        // Send to server
        if (playerName) {
            socket.emit('brain-submit-score', {
                playerName: playerName,
                brainAge: brainAge,
                coins: coins,
                games: dailyResults.map(r => ({ gameId: r.gameId, score: r.score }))
            });
        }

        showScreen('results');
    }

    function showSingleResult(gameId, score, rawData) {
        const brainAge = calculateBrainAge([score]);
        const coins = Math.max(2, Math.floor(calculateCoins(brainAge) / 2));

        $('results-brain-age').textContent = score + '/100';
        $('results-age-label').textContent = GAME_NAMES[gameId] + ' Score';

        if (score >= 80) {
            $('results-speech').textContent = 'Fantastisch! Weiter so!';
        } else if (score >= 50) {
            $('results-speech').textContent = 'Gut gemacht! Da ist noch Luft nach oben!';
        } else {
            $('results-speech').textContent = 'Übung macht den Meister! Probier es nochmal!';
        }

        const breakdown = $('results-breakdown');
        breakdown.innerHTML = '<div class="results-row">' +
            '<span class="results-game-name">' + GAME_NAMES[gameId] + '</span>' +
            '<span class="results-game-score">' + score + '/100</span>' +
            '</div>';

        $('results-coins-amount').textContent = '+' + coins + ' StrictCoins';

        if (playerName) {
            socket.emit('brain-training-score', {
                playerName: playerName,
                coins: coins,
                gameId: gameId,
                score: score
            });
        }

        showScreen('results');
    }

    // ============== GAME ENGINE ==============

    let gameTimer = null;
    let gameTimeLeft = 0;

    function startSingleGame(gameId, isFreeTraining) {
        showScreen('game');
        $('game-title-label').textContent = GAME_NAMES[gameId] || gameId;
        $('game-score').textContent = '0';
        $('game-area').innerHTML = '';

        switch (gameId) {
            case 'math': startMathGame(); break;
            case 'stroop': startStroopGame(); break;
            case 'chimp': startChimpGame(); break;
            case 'reaction': startReactionGame(); break;
            case 'scramble': startScrambleGame(); break;
        }
    }

    function startTimer(seconds, onTick, onEnd) {
        clearInterval(gameTimer);
        gameTimeLeft = seconds;
        $('game-timer').textContent = gameTimeLeft;
        gameTimer = setInterval(() => {
            gameTimeLeft--;
            $('game-timer').textContent = Math.max(0, gameTimeLeft);
            if (onTick) onTick(gameTimeLeft);
            if (gameTimeLeft <= 0) {
                clearInterval(gameTimer);
                if (onEnd) onEnd();
            }
        }, 1000);
    }

    function stopTimer() {
        clearInterval(gameTimer);
    }

    // ============== 1. MATHE-BLITZ ==============

    function startMathGame() {
        let score = 0;
        let streak = 0;
        let difficulty = 1;

        const area = $('game-area');
        area.innerHTML =
            '<div class="math-problem" id="math-problem"></div>' +
            '<input type="number" class="math-input" id="math-answer" autocomplete="off" inputmode="numeric">' +
            '<div class="math-feedback" id="math-feedback"></div>';

        const problemEl = $('math-problem');
        const answerEl = $('math-answer');
        const feedbackEl = $('math-feedback');
        let currentAnswer = 0;

        function nextProblem() {
            const ops = ['+', '-', '×'];
            const op = ops[Math.floor(Math.random() * Math.min(ops.length, 1 + difficulty))];
            let a, b, answer;

            const maxNum = Math.min(10 + difficulty * 5, 50);
            a = Math.floor(Math.random() * maxNum) + 1;
            b = Math.floor(Math.random() * maxNum) + 1;

            if (op === '+') {
                answer = a + b;
            } else if (op === '-') {
                if (a < b) { const t = a; a = b; b = t; }
                answer = a - b;
            } else {
                a = Math.floor(Math.random() * Math.min(12, 5 + difficulty * 2)) + 1;
                b = Math.floor(Math.random() * Math.min(12, 5 + difficulty * 2)) + 1;
                answer = a * b;
            }

            currentAnswer = answer;
            problemEl.textContent = a + ' ' + op + ' ' + b + ' = ?';
            answerEl.value = '';
            answerEl.focus();
        }

        answerEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = parseInt(answerEl.value, 10);
                if (val === currentAnswer) {
                    score++;
                    streak++;
                    if (streak >= 3) { difficulty++; streak = 0; }
                    feedbackEl.textContent = '✓ Richtig!';
                    feedbackEl.className = 'math-feedback correct';
                    $('game-score').textContent = score;
                    nextProblem();
                } else {
                    streak = 0;
                    feedbackEl.textContent = '✗ ' + currentAnswer;
                    feedbackEl.className = 'math-feedback wrong';
                    setTimeout(nextProblem, 600);
                }
            }
        });

        nextProblem();

        startTimer(60, null, () => {
            // Score: map number of correct answers to 0-100
            const normalized = Math.min(100, Math.round((score / 25) * 100));
            onGameFinished('math', normalized, { correct: score });
        });
    }

    // ============== 2. FARBE VS. WORT (Stroop) ==============

    function startStroopGame() {
        const COLORS = [
            { name: 'ROT', hex: '#cc3333' },
            { name: 'BLAU', hex: '#3366cc' },
            { name: 'GRÜN', hex: '#228833' },
            { name: 'GELB', hex: '#cc9900' }
        ];

        let score = 0;
        let total = 0;

        const area = $('game-area');
        area.innerHTML =
            '<div class="stroop-hint">Drücke die FARBE in der das Wort geschrieben ist!</div>' +
            '<div class="stroop-word" id="stroop-word"></div>' +
            '<div class="stroop-buttons" id="stroop-buttons"></div>';

        const wordEl = $('stroop-word');
        const btnsEl = $('stroop-buttons');

        // Create buttons
        COLORS.forEach(c => {
            const btn = document.createElement('button');
            btn.className = 'stroop-btn';
            btn.style.background = c.hex;
            btn.textContent = c.name;
            btn.dataset.color = c.name;
            btn.addEventListener('click', () => checkStroop(c.name));
            btnsEl.appendChild(btn);
        });

        let currentColor = '';

        function nextStroop() {
            // Word text (random color name)
            const wordColor = COLORS[Math.floor(Math.random() * COLORS.length)];
            // Ink color (different from word)
            let inkColor;
            do {
                inkColor = COLORS[Math.floor(Math.random() * COLORS.length)];
            } while (inkColor.name === wordColor.name);

            wordEl.textContent = wordColor.name;
            wordEl.style.color = inkColor.hex;
            currentColor = inkColor.name;
        }

        function checkStroop(chosen) {
            total++;
            if (chosen === currentColor) {
                score++;
            }
            $('game-score').textContent = score;
            nextStroop();
        }

        nextStroop();

        startTimer(45, null, () => {
            const accuracy = total > 0 ? score / total : 0;
            const speed = total / 45; // answers per second
            const normalized = Math.min(100, Math.round((accuracy * 60) + (speed * 40)));
            onGameFinished('stroop', normalized, { correct: score, total: total });
        });
    }

    // ============== 3. ZAHLEN-MEMORY (Chimp Test) ==============

    function startChimpGame() {
        let level = 3; // start with 3 numbers
        let maxLevel = 3;
        let lives = 3;

        const area = $('game-area');
        $('game-timer').textContent = '♥'.repeat(lives);

        function renderLevel() {
            $('game-score').textContent = 'Level ' + level;
            area.innerHTML =
                '<div class="chimp-info" id="chimp-info">Merke dir die Reihenfolge der Zahlen!</div>' +
                '<div class="chimp-grid" id="chimp-grid"></div>';

            const grid = $('chimp-grid');
            const totalCells = 20; // 5x4 grid
            const positions = [];

            // Pick random positions for numbers
            while (positions.length < level) {
                const pos = Math.floor(Math.random() * totalCells);
                if (!positions.includes(pos)) positions.push(pos);
            }

            // Create cells
            const cells = [];
            for (let i = 0; i < totalCells; i++) {
                const cell = document.createElement('div');
                cell.className = 'chimp-cell';
                cell.dataset.index = i;
                cells.push(cell);
                grid.appendChild(cell);
            }

            // Place numbers
            const numberMap = {};
            positions.forEach((pos, idx) => {
                numberMap[pos] = idx + 1;
                cells[pos].textContent = idx + 1;
                cells[pos].classList.add('revealed');
            });

            // Show numbers briefly, then hide
            let numbersHidden = false;
            let nextExpected = 1;

            setTimeout(() => {
                positions.forEach(pos => {
                    cells[pos].textContent = '';
                    cells[pos].classList.remove('revealed');
                    cells[pos].classList.add('hidden-number');
                });
                numbersHidden = true;
                $('chimp-info').textContent = 'Tippe die Zahlen in der richtigen Reihenfolge!';
            }, Math.min(2000 + level * 200, 4000));

            // Click handler
            cells.forEach(cell => {
                cell.addEventListener('click', () => {
                    if (!numbersHidden) return;
                    const idx = parseInt(cell.dataset.index);
                    if (numberMap[idx] === nextExpected) {
                        cell.textContent = nextExpected;
                        cell.classList.remove('hidden-number');
                        cell.classList.add('correct');
                        nextExpected++;
                        if (nextExpected > level) {
                            // Level complete
                            maxLevel = Math.max(maxLevel, level);
                            level++;
                            if (level > 9) {
                                finishChimp();
                            } else {
                                setTimeout(renderLevel, 800);
                            }
                        }
                    } else if (numberMap[idx] !== undefined) {
                        cell.classList.remove('hidden-number');
                        cell.classList.add('wrong');
                        cell.textContent = numberMap[idx];
                        lives--;
                        $('game-timer').textContent = '♥'.repeat(Math.max(0, lives));
                        if (lives <= 0) {
                            finishChimp();
                        } else {
                            setTimeout(renderLevel, 1000);
                        }
                    }
                });
            });
        }

        function finishChimp() {
            stopTimer();
            // Score: level 3 = 0, level 9 = 100
            const normalized = Math.min(100, Math.round(((maxLevel - 3) / 6) * 100));
            onGameFinished('chimp', normalized, { maxLevel: maxLevel });
        }

        renderLevel();
    }

    // ============== 4. REAKTIONSTEST ==============

    function startReactionGame() {
        const area = $('game-area');
        let round = 0;
        const maxRounds = 5;
        let reactionTimes = [];
        let falseStarts = 0;
        let waitTimeout = null;
        let startTime = 0;
        let state = 'idle'; // idle, waiting, ready

        $('game-timer').textContent = round + '/' + maxRounds;
        $('game-score').textContent = '';

        function renderRound() {
            area.innerHTML =
                '<div class="reaction-area waiting" id="reaction-zone">' +
                'Warte auf GRÜN...<br>Dann so schnell wie möglich klicken!' +
                '</div>' +
                '<div class="reaction-results" id="reaction-results"></div>';

            state = 'waiting';
            const zone = $('reaction-zone');

            // Random delay 1-4 seconds
            const delay = 1000 + Math.random() * 3000;

            // Randomly decide: green (click) or stay red (don't click)
            const isGreen = Math.random() > 0.2; // 80% green, 20% red trap

            waitTimeout = setTimeout(() => {
                if (isGreen) {
                    zone.className = 'reaction-area ready';
                    zone.innerHTML = 'JETZT KLICKEN!';
                    state = 'ready';
                    startTime = performance.now();

                    // Auto-fail after 2 seconds
                    waitTimeout = setTimeout(() => {
                        if (state === 'ready') {
                            reactionTimes.push(2000);
                            nextRound();
                        }
                    }, 2000);
                } else {
                    // Red trap - wait 2 seconds then auto-pass
                    waitTimeout = setTimeout(() => {
                        if (state === 'waiting') {
                            nextRound();
                        }
                    }, 2000);
                }
            }, delay);

            zone.addEventListener('click', function handler() {
                zone.removeEventListener('click', handler);
                clearTimeout(waitTimeout);

                if (state === 'ready') {
                    const rt = performance.now() - startTime;
                    reactionTimes.push(Math.round(rt));
                    zone.className = 'reaction-area result';
                    zone.innerHTML = Math.round(rt) + ' ms';
                    setTimeout(nextRound, 800);
                } else if (state === 'waiting') {
                    falseStarts++;
                    zone.className = 'reaction-area too-early';
                    zone.innerHTML = 'Zu früh! Warte auf GRÜN!';
                    setTimeout(nextRound, 1000);
                }
                state = 'idle';
            });
        }

        function nextRound() {
            round++;
            $('game-timer').textContent = round + '/' + maxRounds;
            if (round >= maxRounds) {
                finishReaction();
            } else {
                renderRound();
            }
        }

        function finishReaction() {
            stopTimer();
            const validTimes = reactionTimes.filter(t => t < 2000);
            const avgTime = validTimes.length > 0
                ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length)
                : 2000;

            // Score: 150ms = 100, 500ms+ = 0
            let normalized = Math.round(Math.max(0, Math.min(100, ((500 - avgTime) / 350) * 100)));
            // Penalize false starts
            normalized = Math.max(0, normalized - falseStarts * 10);

            const resultsEl = $('reaction-results');
            if (resultsEl) {
                resultsEl.innerHTML = 'Durchschnitt: ' + avgTime + 'ms | Fehlstarts: ' + falseStarts;
            }

            onGameFinished('reaction', normalized, { avgTime, falseStarts });
        }

        renderRound();
    }

    // ============== 5. WORT-SCRAMBLE ==============

    function startScrambleGame() {
        const WORDS = [
            'HOTEL', 'STERN', 'GABEL', 'WOLKE', 'BLUME', 'TISCH', 'KERZE', 'STURM',
            'STADT', 'STEIN', 'FISCH', 'VOGEL', 'SCHAF', 'GRUEN', 'LAMPE', 'NADEL',
            'HAUSE', 'NACHT', 'REGEN', 'SONNE', 'ESSEN', 'MUSIK', 'BRIEF', 'WAGEN',
            'PFERD', 'KATZE', 'MILCH', 'BODEN', 'BIRNE', 'SALAT', 'TRAUM', 'FARBE',
            'STIFT', 'RADIO', 'SPORT', 'PLATZ', 'SORTE', 'KARTE', 'KLEID', 'BLATT',
            'FRUCHT', 'GARTEN', 'SOMMER', 'WINTER', 'MORGEN', 'FLASCHE', 'BRILLE',
            'KOFFER', 'BALKON', 'FENSTER', 'SCHULE'
        ];

        let score = 0;
        let wordIndex = 0;
        const usedWords = [];

        const area = $('game-area');

        function scrambleWord(word) {
            const arr = word.split('');
            if (arr.length <= 1) return arr.join('');
            // Shuffle until different from original
            let attempts = 0;
            do {
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
                }
                attempts++;
            } while (arr.join('') === word && attempts < 10);
            return arr.join('');
        }

        function nextWord() {
            // Reset used words pool when exhausted
            if (usedWords.length >= WORDS.length) {
                usedWords.length = 0;
            }
            let word;
            do {
                word = WORDS[Math.floor(Math.random() * WORDS.length)];
            } while (usedWords.includes(word));
            usedWords.push(word);

            const scrambled = scrambleWord(word);

            area.innerHTML =
                '<div class="scramble-letters" id="scramble-display"></div>' +
                '<input type="text" class="scramble-input" id="scramble-answer" autocomplete="off" maxlength="' + (word.length + 2) + '" placeholder="Wort eingeben...">' +
                '<div class="math-feedback" id="scramble-feedback"></div>';

            const display = $('scramble-display');
            scrambled.split('').forEach(ch => {
                const el = document.createElement('div');
                el.className = 'scramble-letter';
                el.textContent = ch;
                display.appendChild(el);
            });

            const answerEl = $('scramble-answer');
            answerEl.focus();

            answerEl.addEventListener('keydown', function handler(e) {
                if (e.key === 'Enter') {
                    answerEl.removeEventListener('keydown', handler);
                    const guess = answerEl.value.trim().toUpperCase();
                    if (guess === word) {
                        score++;
                        $('scramble-feedback').textContent = '✓ Richtig!';
                        $('scramble-feedback').className = 'math-feedback correct';
                        $('game-score').textContent = score;
                        setTimeout(nextWord, 500);
                    } else {
                        $('scramble-feedback').textContent = '✗ ' + word;
                        $('scramble-feedback').className = 'math-feedback wrong';
                        setTimeout(nextWord, 800);
                    }
                }
            });
        }

        nextWord();

        startTimer(60, null, () => {
            const normalized = Math.min(100, Math.round((score / 12) * 100));
            onGameFinished('scramble', normalized, { correct: score });
        });
    }

    // ============== COIN REWARDS ==============

    socket.on('balance-update', (data) => {
        // If lobby page has currency display
        const el = document.querySelector('#currency-amount');
        if (el) el.textContent = data.balance;
    });

    // ============== VERSUS MODE ==============

    let versusRoomCode = null;
    let versusGameId = null;
    let versusIsHost = false;
    let versusOpponentName = '';
    let versusMyScore = 0;
    let versusTimer = null;

    $('btn-versus-mode').addEventListener('click', () => {
        versusRoomCode = null;
        versusIsHost = false;
        $('versus-room-code').style.display = 'none';
        $('versus-actions').style.display = 'block';
        $('versus-game-select').style.display = 'none';
        $('versus-professor-text').textContent = 'Fordere einen Freund zum Duell heraus!';
        resetVersusSlots();
        showScreen('versus-lobby');
    });

    $('btn-back-versus').addEventListener('click', () => {
        if (versusRoomCode) {
            socket.emit('brain-versus-leave');
            versusRoomCode = null;
        }
        showScreen('menu');
    });

    function resetVersusSlots() {
        $('versus-slot-1').innerHTML = '<div style="font-size:1.5rem">❓</div><div class="versus-player-name">Warte...</div>';
        $('versus-slot-1').classList.remove('filled');
        $('versus-slot-2').innerHTML = '<div style="font-size:1.5rem">❓</div><div class="versus-player-name">Warte...</div>';
        $('versus-slot-2').classList.remove('filled');
    }

    function updateVersusSlots(players) {
        const slots = [$('versus-slot-1'), $('versus-slot-2')];
        players.forEach((name, i) => {
            if (slots[i]) {
                slots[i].innerHTML = '<div style="font-size:1.5rem">🧠</div><div class="versus-player-name">' + escapeHtml(name) + '</div>';
                slots[i].classList.add('filled');
            }
        });
        for (let i = players.length; i < 2; i++) {
            slots[i].innerHTML = '<div style="font-size:1.5rem">❓</div><div class="versus-player-name">Warte...</div>';
            slots[i].classList.remove('filled');
        }
    }

    // Create room
    $('btn-versus-create').addEventListener('click', () => {
        if (!playerName) { alert('Bitte zuerst einen Namen setzen!'); return; }
        socket.emit('brain-versus-create', { playerName });
    });

    socket.on('brain-versus-created', (data) => {
        versusRoomCode = data.code;
        versusIsHost = true;
        $('versus-room-code').textContent = data.code;
        $('versus-room-code').style.display = 'block';
        $('versus-actions').style.display = 'none';
        $('versus-professor-text').textContent = 'Raum erstellt! Teile den Code mit deinem Gegner: ' + data.code;
        updateVersusSlots([playerName]);
    });

    // Join room
    $('btn-versus-join').addEventListener('click', () => {
        if (!playerName) { alert('Bitte zuerst einen Namen setzen!'); return; }
        const code = $('versus-join-code').value.trim().toUpperCase();
        if (code.length !== 4) { alert('Bitte einen 4-stelligen Code eingeben!'); return; }
        socket.emit('brain-versus-join', { code, playerName });
    });

    $('versus-join-code').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('btn-versus-join').click();
    });

    // Lobby update
    socket.on('brain-versus-lobby', (data) => {
        versusRoomCode = data.code;
        $('versus-room-code').textContent = data.code;
        $('versus-room-code').style.display = 'block';
        $('versus-actions').style.display = 'none';
        updateVersusSlots(data.players);

        if (data.players.length >= 2) {
            versusOpponentName = data.players.find(n => n !== playerName) || data.players[1];
            if (versusIsHost) {
                $('versus-game-select').style.display = 'block';
                $('versus-professor-text').textContent = 'Gegner gefunden! Wähle ein Spiel!';
            } else {
                $('versus-professor-text').textContent = 'Warte auf den Host...';
            }
        }
    });

    // Player left
    socket.on('brain-versus-player-left', (data) => {
        if (versusRoomCode) {
            updateVersusSlots([playerName]);
            $('versus-game-select').style.display = 'none';
            $('versus-professor-text').textContent = escapeHtml(data.playerName) + ' hat den Raum verlassen.';
        }
    });

    // Game select buttons (host only)
    document.querySelectorAll('.versus-game-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const gameId = btn.dataset.game === 'random' ? null : btn.dataset.game;
            socket.emit('brain-versus-start', { gameId });
        });
    });

    // Game started
    socket.on('brain-versus-game-start', (data) => {
        versusGameId = data.gameId;
        versusMyScore = 0;

        const myName = playerName;
        const opName = data.players.find(p => p.name !== myName)?.name || '???';
        versusOpponentName = opName;

        $('versus-sb-name1').textContent = myName;
        $('versus-sb-score1').textContent = '0';
        $('versus-sb-name2').textContent = opName;
        $('versus-sb-score2').textContent = '0';
        $('versus-game-label').textContent = GAME_NAMES[data.gameId] || data.gameId;
        $('versus-game-score').textContent = '0';
        $('versus-game-area').innerHTML = '';

        showScreen('versus-game');
        startVersusGame(data.gameId);
    });

    // Live score updates
    socket.on('brain-versus-scores', (data) => {
        if (!data || !data.players) return;
        const me = data.players.find(p => p.name === playerName);
        const op = data.players.find(p => p.name !== playerName);
        if (me) $('versus-sb-score1').textContent = me.score;
        if (op) {
            $('versus-sb-score2').textContent = op.score;
            if (op.finished) {
                $('versus-sb-score2').textContent = op.score + ' ✓';
            }
        }
    });

    // Results
    socket.on('brain-versus-result', (data) => {
        clearInterval(versusTimer);
        versusTimer = null;

        const banner = $('versus-result-banner');
        if (data.forfeit) {
            if (data.winner === playerName) {
                banner.className = 'versus-result-banner win';
                banner.textContent = '🏆 GEWONNEN! (Aufgabe)';
                $('versus-results-speech').textContent = 'Dein Gegner hat aufgegeben!';
            }
        } else if (data.isDraw) {
            banner.className = 'versus-result-banner draw';
            banner.textContent = '🤝 UNENTSCHIEDEN!';
            $('versus-results-speech').textContent = 'Gleichstand! Was für ein Duell!';
        } else if (data.winner === playerName) {
            banner.className = 'versus-result-banner win';
            banner.textContent = '🏆 GEWONNEN!';
            $('versus-results-speech').textContent = 'Fantastisch! Du hast gewonnen!';
        } else {
            banner.className = 'versus-result-banner lose';
            banner.textContent = '💀 VERLOREN!';
            $('versus-results-speech').textContent = 'Nächstes Mal! Übung macht den Meister!';
        }

        const me = data.players.find(p => p.name === playerName);
        const op = data.players.find(p => p.name !== playerName);

        $('versus-res-name1').textContent = me ? me.name : playerName;
        $('versus-res-score1').textContent = (me ? me.score : 0) + '/100';
        $('versus-res-name2').textContent = op ? op.name : '???';
        $('versus-res-score2').textContent = (op ? op.score : 0) + '/100';

        // Highlight winner
        $('versus-res-p1').classList.toggle('winner', data.winner === playerName);
        $('versus-res-p2').classList.toggle('winner', data.winner && data.winner !== playerName);

        const myCoins = data.isDraw ? data.coins : (data.winner === playerName ? data.coins : 5);
        $('versus-results-coins-amount').textContent = '+' + myCoins + ' StrictCoins';

        showScreen('versus-results');
    });

    // Rematch
    $('btn-versus-rematch').addEventListener('click', () => {
        if (versusRoomCode) {
            // Go back to lobby with same room
            $('versus-game-select').style.display = versusIsHost ? 'block' : 'none';
            $('versus-professor-text').textContent = versusIsHost ? 'Wähle ein Spiel für die Revanche!' : 'Warte auf den Host...';
            showScreen('versus-lobby');
        } else {
            showScreen('menu');
        }
    });

    $('btn-versus-back-menu').addEventListener('click', () => {
        if (versusRoomCode) {
            socket.emit('brain-versus-leave');
            versusRoomCode = null;
        }
        socket.emit('brain-get-leaderboard');
        showScreen('menu');
    });

    // ============== VERSUS GAME ENGINE ==============

    function startVersusGame(gameId) {
        switch (gameId) {
            case 'math': startVersusMathGame(); break;
            case 'stroop': startVersusStroopGame(); break;
            case 'chimp': startVersusChimpGame(); break;
            case 'reaction': startVersusReactionGame(); break;
            case 'scramble': startVersusScrambleGame(); break;
        }
    }

    function startVersusTimer(seconds, onTick, onEnd) {
        clearInterval(versusTimer);
        let timeLeft = seconds;
        $('versus-game-timer').textContent = timeLeft;
        versusTimer = setInterval(() => {
            timeLeft--;
            $('versus-game-timer').textContent = Math.max(0, timeLeft);
            if (onTick) onTick(timeLeft);
            if (timeLeft <= 0) {
                clearInterval(versusTimer);
                if (onEnd) onEnd();
            }
        }, 1000);
    }

    function versusScoreUpdate(rawScore) {
        versusMyScore = rawScore;
        $('versus-game-score').textContent = rawScore;
        $('versus-sb-score1').textContent = rawScore;
        socket.emit('brain-versus-score-update', { score: rawScore });
    }

    function versusFinish(normalizedScore) {
        clearInterval(versusTimer);
        socket.emit('brain-versus-finished', { score: normalizedScore });
    }

    // ----- Versus: Math -----
    function startVersusMathGame() {
        let score = 0;
        let streak = 0;
        let difficulty = 1;

        const area = $('versus-game-area');
        area.innerHTML =
            '<div class="math-problem" id="v-math-problem"></div>' +
            '<input type="number" class="math-input" id="v-math-answer" autocomplete="off" inputmode="numeric">' +
            '<div class="math-feedback" id="v-math-feedback"></div>';

        const problemEl = $('v-math-problem');
        const answerEl = $('v-math-answer');
        const feedbackEl = $('v-math-feedback');
        let currentAnswer = 0;

        function nextProblem() {
            const ops = ['+', '-', '×'];
            const op = ops[Math.floor(Math.random() * Math.min(ops.length, 1 + difficulty))];
            let a, b, answer;
            const maxNum = Math.min(10 + difficulty * 5, 50);
            a = Math.floor(Math.random() * maxNum) + 1;
            b = Math.floor(Math.random() * maxNum) + 1;
            if (op === '+') { answer = a + b; }
            else if (op === '-') { if (a < b) { const t = a; a = b; b = t; } answer = a - b; }
            else { a = Math.floor(Math.random() * Math.min(12, 5 + difficulty * 2)) + 1; b = Math.floor(Math.random() * Math.min(12, 5 + difficulty * 2)) + 1; answer = a * b; }
            currentAnswer = answer;
            problemEl.textContent = a + ' ' + op + ' ' + b + ' = ?';
            answerEl.value = '';
            answerEl.focus();
        }

        answerEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = parseInt(answerEl.value, 10);
                if (val === currentAnswer) {
                    score++; streak++;
                    if (streak >= 3) { difficulty++; streak = 0; }
                    feedbackEl.textContent = '✓ Richtig!';
                    feedbackEl.className = 'math-feedback correct';
                    versusScoreUpdate(score);
                    nextProblem();
                } else {
                    streak = 0;
                    feedbackEl.textContent = '✗ ' + currentAnswer;
                    feedbackEl.className = 'math-feedback wrong';
                    setTimeout(nextProblem, 600);
                }
            }
        });

        nextProblem();
        startVersusTimer(60, null, () => {
            const normalized = Math.min(100, Math.round((score / 25) * 100));
            versusFinish(normalized);
        });
    }

    // ----- Versus: Stroop -----
    function startVersusStroopGame() {
        const COLORS = [
            { name: 'ROT', hex: '#cc3333' },
            { name: 'BLAU', hex: '#3366cc' },
            { name: 'GRÜN', hex: '#228833' },
            { name: 'GELB', hex: '#cc9900' }
        ];
        let score = 0;
        let total = 0;
        const area = $('versus-game-area');
        area.innerHTML =
            '<div class="stroop-hint">Drücke die FARBE in der das Wort geschrieben ist!</div>' +
            '<div class="stroop-word" id="v-stroop-word"></div>' +
            '<div class="stroop-buttons" id="v-stroop-buttons"></div>';
        const wordEl = $('v-stroop-word');
        const btnsEl = $('v-stroop-buttons');
        let currentColor = '';

        COLORS.forEach(c => {
            const btn = document.createElement('button');
            btn.className = 'stroop-btn';
            btn.style.background = c.hex;
            btn.textContent = c.name;
            btn.addEventListener('click', () => {
                total++;
                if (c.name === currentColor) { score++; }
                versusScoreUpdate(score);
                nextStroop();
            });
            btnsEl.appendChild(btn);
        });

        function nextStroop() {
            const wordColor = COLORS[Math.floor(Math.random() * COLORS.length)];
            let inkColor;
            do { inkColor = COLORS[Math.floor(Math.random() * COLORS.length)]; } while (inkColor.name === wordColor.name);
            wordEl.textContent = wordColor.name;
            wordEl.style.color = inkColor.hex;
            currentColor = inkColor.name;
        }

        nextStroop();
        startVersusTimer(45, null, () => {
            const accuracy = total > 0 ? score / total : 0;
            const speed = total / 45;
            const normalized = Math.min(100, Math.round((accuracy * 60) + (speed * 40)));
            versusFinish(normalized);
        });
    }

    // ----- Versus: Chimp -----
    function startVersusChimpGame() {
        let level = 3;
        let maxLevel = 3;
        let lives = 3;
        const area = $('versus-game-area');
        $('versus-game-timer').textContent = '♥'.repeat(lives);

        function renderLevel() {
            versusScoreUpdate(level);
            area.innerHTML =
                '<div class="chimp-info" id="v-chimp-info">Merke dir die Reihenfolge!</div>' +
                '<div class="chimp-grid" id="v-chimp-grid"></div>';
            const grid = $('v-chimp-grid');
            const totalCells = 20;
            const positions = [];
            while (positions.length < level) {
                const pos = Math.floor(Math.random() * totalCells);
                if (!positions.includes(pos)) positions.push(pos);
            }
            const cells = [];
            for (let i = 0; i < totalCells; i++) {
                const cell = document.createElement('div');
                cell.className = 'chimp-cell';
                cell.dataset.index = i;
                cells.push(cell);
                grid.appendChild(cell);
            }
            const numberMap = {};
            positions.forEach((pos, idx) => {
                numberMap[pos] = idx + 1;
                cells[pos].textContent = idx + 1;
                cells[pos].classList.add('revealed');
            });
            let numbersHidden = false;
            let nextExpected = 1;
            setTimeout(() => {
                positions.forEach(pos => {
                    cells[pos].textContent = '';
                    cells[pos].classList.remove('revealed');
                    cells[pos].classList.add('hidden-number');
                });
                numbersHidden = true;
                $('v-chimp-info').textContent = 'Tippe die Zahlen in der richtigen Reihenfolge!';
            }, Math.min(2000 + level * 200, 4000));
            cells.forEach(cell => {
                cell.addEventListener('click', () => {
                    if (!numbersHidden) return;
                    const idx = parseInt(cell.dataset.index);
                    if (numberMap[idx] === nextExpected) {
                        cell.textContent = nextExpected;
                        cell.classList.remove('hidden-number');
                        cell.classList.add('correct');
                        nextExpected++;
                        if (nextExpected > level) {
                            maxLevel = Math.max(maxLevel, level);
                            level++;
                            if (level > 9) { finishChimp(); } else { setTimeout(renderLevel, 800); }
                        }
                    } else if (numberMap[idx] !== undefined) {
                        cell.classList.remove('hidden-number');
                        cell.classList.add('wrong');
                        cell.textContent = numberMap[idx];
                        lives--;
                        $('versus-game-timer').textContent = '♥'.repeat(Math.max(0, lives));
                        if (lives <= 0) { finishChimp(); } else { setTimeout(renderLevel, 1000); }
                    }
                });
            });
        }

        function finishChimp() {
            const normalized = Math.min(100, Math.round(((maxLevel - 3) / 6) * 100));
            versusFinish(normalized);
        }

        renderLevel();
    }

    // ----- Versus: Reaction -----
    function startVersusReactionGame() {
        const area = $('versus-game-area');
        let round = 0;
        const maxRounds = 5;
        let reactionTimes = [];
        let falseStarts = 0;
        let waitTimeout = null;
        let startTime = 0;
        let state = 'idle';
        $('versus-game-timer').textContent = round + '/' + maxRounds;
        $('versus-game-score').textContent = '';

        function renderRound() {
            area.innerHTML =
                '<div class="reaction-area waiting" id="v-reaction-zone">Warte auf GRÜN...<br>Dann so schnell wie möglich klicken!</div>' +
                '<div class="reaction-results" id="v-reaction-results"></div>';
            state = 'waiting';
            const zone = $('v-reaction-zone');
            const delay = 1000 + Math.random() * 3000;
            const isGreen = Math.random() > 0.2;
            waitTimeout = setTimeout(() => {
                if (isGreen) {
                    zone.className = 'reaction-area ready';
                    zone.innerHTML = 'JETZT KLICKEN!';
                    state = 'ready';
                    startTime = performance.now();
                    waitTimeout = setTimeout(() => { if (state === 'ready') { reactionTimes.push(2000); nextRound(); } }, 2000);
                } else {
                    waitTimeout = setTimeout(() => { if (state === 'waiting') { nextRound(); } }, 2000);
                }
            }, delay);
            zone.addEventListener('click', function handler() {
                zone.removeEventListener('click', handler);
                clearTimeout(waitTimeout);
                if (state === 'ready') {
                    const rt = performance.now() - startTime;
                    reactionTimes.push(Math.round(rt));
                    zone.className = 'reaction-area result';
                    zone.innerHTML = Math.round(rt) + ' ms';
                    versusScoreUpdate(reactionTimes.length);
                    setTimeout(nextRound, 800);
                } else if (state === 'waiting') {
                    falseStarts++;
                    zone.className = 'reaction-area too-early';
                    zone.innerHTML = 'Zu früh! Warte auf GRÜN!';
                    setTimeout(nextRound, 1000);
                }
                state = 'idle';
            });
        }

        function nextRound() {
            round++;
            $('versus-game-timer').textContent = round + '/' + maxRounds;
            if (round >= maxRounds) { finishReaction(); } else { renderRound(); }
        }

        function finishReaction() {
            const validTimes = reactionTimes.filter(t => t < 2000);
            const avgTime = validTimes.length > 0 ? Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length) : 2000;
            let normalized = Math.round(Math.max(0, Math.min(100, ((500 - avgTime) / 350) * 100)));
            normalized = Math.max(0, normalized - falseStarts * 10);
            versusFinish(normalized);
        }

        renderRound();
    }

    // ----- Versus: Scramble -----
    function startVersusScrambleGame() {
        const WORDS = [
            'HOTEL', 'STERN', 'GABEL', 'WOLKE', 'BLUME', 'TISCH', 'KERZE', 'STURM',
            'STADT', 'STEIN', 'FISCH', 'VOGEL', 'SCHAF', 'GRUEN', 'LAMPE', 'NADEL',
            'HAUSE', 'NACHT', 'REGEN', 'SONNE', 'ESSEN', 'MUSIK', 'BRIEF', 'WAGEN',
            'PFERD', 'KATZE', 'MILCH', 'BODEN', 'BIRNE', 'SALAT', 'TRAUM', 'FARBE',
            'STIFT', 'RADIO', 'SPORT', 'PLATZ', 'SORTE', 'KARTE', 'KLEID', 'BLATT',
            'FRUCHT', 'GARTEN', 'SOMMER', 'WINTER', 'MORGEN', 'FLASCHE', 'BRILLE',
            'KOFFER', 'BALKON', 'FENSTER', 'SCHULE'
        ];
        let score = 0;
        const usedWords = [];
        const area = $('versus-game-area');

        function scrambleWord(word) {
            const arr = word.split('');
            if (arr.length <= 1) return arr.join('');
            let attempts = 0;
            do {
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
                }
                attempts++;
            } while (arr.join('') === word && attempts < 10);
            return arr.join('');
        }

        function nextWord() {
            if (usedWords.length >= WORDS.length) usedWords.length = 0;
            let word;
            do { word = WORDS[Math.floor(Math.random() * WORDS.length)]; } while (usedWords.includes(word));
            usedWords.push(word);
            const scrambled = scrambleWord(word);
            area.innerHTML =
                '<div class="scramble-letters" id="v-scramble-display"></div>' +
                '<input type="text" class="scramble-input" id="v-scramble-answer" autocomplete="off" maxlength="' + (word.length + 2) + '" placeholder="Wort eingeben...">' +
                '<div class="math-feedback" id="v-scramble-feedback"></div>';
            const display = $('v-scramble-display');
            scrambled.split('').forEach(ch => {
                const el = document.createElement('div');
                el.className = 'scramble-letter';
                el.textContent = ch;
                display.appendChild(el);
            });
            const answerEl = $('v-scramble-answer');
            answerEl.focus();
            answerEl.addEventListener('keydown', function handler(e) {
                if (e.key === 'Enter') {
                    answerEl.removeEventListener('keydown', handler);
                    const guess = answerEl.value.trim().toUpperCase();
                    if (guess === word) {
                        score++;
                        $('v-scramble-feedback').textContent = '✓ Richtig!';
                        $('v-scramble-feedback').className = 'math-feedback correct';
                        versusScoreUpdate(score);
                        setTimeout(nextWord, 500);
                    } else {
                        $('v-scramble-feedback').textContent = '✗ ' + word;
                        $('v-scramble-feedback').className = 'math-feedback wrong';
                        setTimeout(nextWord, 800);
                    }
                }
            });
        }

        nextWord();
        startVersusTimer(60, null, () => {
            const normalized = Math.min(100, Math.round((score / 12) * 100));
            versusFinish(normalized);
        });
    }

})();
