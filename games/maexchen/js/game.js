// ============================
// GAME MODULE
// ============================

(function() {
    const { socket, $, showScreen, state } = window.MaexchenApp;

    // Game constants
    const ROLL_ORDER = [
        31, 32, 41, 42, 43, 51, 52, 53, 54, 61, 62, 63, 64, 65,
        11, 22, 33, 44, 55, 66,
        21
    ];

    function rollRank(val) {
        return ROLL_ORDER.indexOf(val);
    }

    function rollName(val) {
        if (val === 21) return 'Mäxchen!';
        const d1 = Math.floor(val / 10);
        const d2 = val % 10;
        if (d1 === d2) return `Pasch ${d1}er`;
        return String(val);
    }

    function isMaexchen(val) {
        return val === 21;
    }

    function isPasch(val) {
        return val >= 11 && val <= 66 && Math.floor(val / 10) === val % 10;
    }

    // Helpers for reactions
    function triggerReaction(type) {
        if (window.MaexchenReactions) {
            window.MaexchenReactions.showReactionAtDice(type);
        }
    }

    function triggerCenteredReaction(type) {
        if (window.MaexchenReactions) {
            window.MaexchenReactions.showReactionCentered(type);
        }
    }

    function shakeScreen() {
        if (window.MaexchenReactions) {
            window.MaexchenReactions.shakeScreen();
        }
    }

    // Game state
    let previousAnnouncement = null;
    let isFirstTurn = true;
    let hasRolled = false;
    let myRoll = null;

    // --- Game Started ---
    socket.on('game-started', ({ players }) => {
        state.gamePlayers = players;
        state.myPlayerIndex = players.findIndex(p => p.name === state.playerName);
        showScreen('game');

        // Create player sidebar
        createPlayerSidebar();
        renderPlayerSidebar();

        // Start transmissions
        if (window.MaexchenReactions) {
            window.MaexchenReactions.startTransmissions();
        }

        // Assign TTS voices to all players
        if (window.MaexchenTTS) {
            players.forEach(p => window.MaexchenTTS.assignVoice(p.name));
        }

        // Start ambient sounds
        if (window.MaexchenAmbient) {
            window.MaexchenAmbient.startAmbient();
        }

        // Show emote bar
        if (window.MaexchenEmotes) {
            window.MaexchenEmotes.showEmoteBar();
        }
    });

    // --- Turn Start ---
    socket.on('turn-start', ({ currentPlayerIndex, currentPlayerName, previousAnnouncement: prevAnn, isFirstTurn: first, players }) => {
        state.gamePlayers = players;
        state.currentPlayerIndex = currentPlayerIndex;
        previousAnnouncement = prevAnn;
        isFirstTurn = first;
        hasRolled = false;
        myRoll = null;

        // Clear dice
        if (window.MaexchenDice) {
            window.MaexchenDice.clear();
        }

        renderGameScreen();
        renderPlayerSidebar();
    });

    // --- Dice Rolled (broadcast to all) ---
    socket.on('dice-rolled', ({ playerName }) => {
        if (playerName !== state.playerName) {
            console.log(`${playerName} würfelt...`);
        }
        // Reaction for rolling
        triggerReaction('roll');
    });

    // --- Roll Result (only to roller) ---
    socket.on('roll-result', ({ d1, d2, value, name }) => {
        hasRolled = true;
        myRoll = { d1, d2, value, name };
        $('btn-roll').disabled = true;

        // Trigger dice animation
        if (window.MaexchenDice) {
            window.MaexchenDice.roll(d1, d2, () => {
                // After animation
                showDiceResult(value, name);
                $('announce-section').style.display = 'flex';
                renderAnnounceGrid();
            });
        } else {
            // Fallback without animation
            showDiceResult(value, name);
            $('announce-section').style.display = 'flex';
            renderAnnounceGrid();
        }
    });

    // --- Player Announced ---
    socket.on('player-announced', ({ playerName, value, valueName }) => {
        previousAnnouncement = { playerName, value, valueName };

        // Show big announcement to all players
        showBigAnnouncement(playerName, valueName, isMaexchen(value));

        // Trigger appropriate reaction based on what was announced
        if (isMaexchen(value)) {
            triggerReaction('announce_maexchen');
            shakeScreen();
        } else if (rollRank(value) >= 14) { // High values (pasch or above)
            triggerReaction('announce_high');
        } else {
            triggerReaction('announce_low');
        }
    });

    // Show big announcement overlay for all players
    function showBigAnnouncement(playerName, valueName, isMaex) {
        // Remove any existing announcement
        const existing = document.querySelector('.announcement-display');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'announcement-display';
        overlay.innerHTML = `
            <div class="player-name">${playerName} sagt:</div>
            <div class="announced-value ${isMaex ? 'maexchen' : ''}">${valueName}</div>
        `;
        document.body.appendChild(overlay);

        // Remove after delay
        setTimeout(() => {
            overlay.style.transition = 'opacity 0.3s, transform 0.3s';
            overlay.style.opacity = '0';
            overlay.style.transform = 'translate(-50%, -50%) scale(0.8)';
            setTimeout(() => overlay.remove(), 300);
        }, isMaex ? 2500 : 1500);
    }

    // --- Challenge Result ---
    socket.on('challenge-result', (data) => {
        showRevealScreen(data);

        // Trigger reaction based on result
        if (data.wasLying) {
            triggerCenteredReaction('challenge_won');
        } else {
            triggerCenteredReaction('challenge_lost');
        }
        shakeScreen();

        // Check for elimination
        if (data.players[data.loserIndex].lives <= 0) {
            setTimeout(() => triggerCenteredReaction('player_eliminated'), 1000);
        }
    });

    // --- Mäxchen Believed ---
    socket.on('maexchen-believed', (data) => {
        showMaexchenBelievedScreen(data);
        triggerCenteredReaction('believe');
        shakeScreen();

        // Check for elimination
        const believerData = data.players.find(p => p.name === data.believerName);
        if (believerData && believerData.lives <= 0) {
            setTimeout(() => triggerCenteredReaction('player_eliminated'), 1000);
        }
    });

    // --- Player Disconnected ---
    socket.on('player-disconnected', ({ playerName, players }) => {
        state.gamePlayers = players;
        console.log(`${playerName} wurde getrennt`);
        triggerCenteredReaction('leave');
    });

    // --- Game Over ---
    socket.on('game-over', ({ winnerName, players }) => {
        // Stop transmissions
        if (window.MaexchenReactions) {
            window.MaexchenReactions.stopTransmissions();
        }

        // Stop ambient
        if (window.MaexchenAmbient) {
            window.MaexchenAmbient.stopAmbient();
        }

        // Hide emote bar
        if (window.MaexchenEmotes) {
            window.MaexchenEmotes.hideEmoteBar();
        }

        setTimeout(() => {
            $('winner-name').textContent = winnerName;
            showScreen('gameover');
            triggerCenteredReaction('win');

            // Play victory sound
            if (window.MaexchenAmbient) {
                window.MaexchenAmbient.playVictory();
            }

            // Show victory particles
            showVictoryParticles();
        }, 3000);
    });

    // Victory particles animation
    function showVictoryParticles() {
        // Remove existing
        const existing = document.querySelector('.victory-particles');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.className = 'victory-particles';
        document.body.appendChild(container);

        const particles = ['⭐', '🌟', '✨', '💫', '🎉', '🎊', '👑', '🏆'];

        for (let i = 0; i < 30; i++) {
            setTimeout(() => {
                const particle = document.createElement('div');
                particle.className = 'victory-particle';
                particle.textContent = particles[Math.floor(Math.random() * particles.length)];
                particle.style.left = Math.random() * 100 + 'vw';
                particle.style.animationDuration = (2 + Math.random() * 2) + 's';
                particle.style.animationDelay = Math.random() * 0.5 + 's';
                container.appendChild(particle);

                // Remove after animation
                setTimeout(() => particle.remove(), 4000);
            }, i * 100);
        }

        // Remove container after all particles done
        setTimeout(() => container.remove(), 6000);
    }

    // --- Roll Button ---
    $('btn-roll').addEventListener('click', () => {
        if (hasRolled) return;
        socket.emit('roll');
    });

    // --- Challenge Buttons ---
    $('btn-challenge').addEventListener('click', () => {
        socket.emit('challenge');
        triggerReaction('challenge');
    });

    $('btn-challenge-m').addEventListener('click', () => {
        socket.emit('challenge');
        triggerReaction('challenge');
    });

    // --- Believe Mäxchen Button ---
    $('btn-believe').addEventListener('click', () => {
        socket.emit('believe-maexchen');
    });

    // --- Continue Button ---
    $('btn-continue').addEventListener('click', () => {
        showScreen('game');
    });

    // --- Restart Button ---
    $('btn-restart').addEventListener('click', () => {
        state.roomCode = null;
        state.gamePlayers = [];

        // Clear TTS voices
        if (window.MaexchenTTS) {
            window.MaexchenTTS.clearVoices();
        }

        // Clear avatars
        if (window.MaexchenAvatars) {
            window.MaexchenAvatars.clearAvatars();
        }

        // Hide chat
        if (window.MaexchenChat) {
            window.MaexchenChat.hideChat();
            window.MaexchenChat.clearMessages();
        }

        // Hide emote bar
        if (window.MaexchenEmotes) {
            window.MaexchenEmotes.hideEmoteBar();
        }

        // Stop ambient
        if (window.MaexchenAmbient) {
            window.MaexchenAmbient.stopAmbient();
        }

        // Remove sidebar
        removePlayerSidebar();

        showScreen('start');
    });

    function renderGameScreen() {
        renderLives('lives-bar');

        const isMyTurn = state.currentPlayerIndex === state.myPlayerIndex;
        const canChallenge = !isFirstTurn && previousAnnouncement;
        const prevWasMaexchen = canChallenge && isMaexchen(previousAnnouncement.value);

        // Previous announcement
        const prevBox = $('prev-announce-box');
        if (canChallenge) {
            prevBox.style.display = 'block';
            prevBox.innerHTML = `<span>${previousAnnouncement.playerName}</span> sagt: <strong>${previousAnnouncement.valueName}</strong>`;
        } else {
            prevBox.style.display = 'none';
        }

        // Reset displays
        $('dice-result').textContent = '';
        $('dice-result').style.display = 'none';
        $('announce-section').style.display = 'none';

        // Active player area vs waiting
        if (isMyTurn) {
            $('active-player-area').style.display = 'block';
            $('waiting-text').style.display = 'none';

            if (prevWasMaexchen) {
                // Must challenge or believe
                $('roll-section').style.display = 'none';
                $('maexchen-actions').style.display = 'flex';
                $('challenge-section').style.display = 'none';
            } else {
                $('roll-section').style.display = 'flex';
                $('maexchen-actions').style.display = 'none';
                $('challenge-section').style.display = canChallenge ? 'flex' : 'none';
                $('btn-roll').disabled = hasRolled;
            }
        } else {
            $('active-player-area').style.display = 'none';
            $('waiting-text').style.display = 'block';
            $('waiting-text').textContent = `${state.gamePlayers[state.currentPlayerIndex]?.name || '...'} ist am Zug...`;
        }
    }

    function renderAnnounceGrid() {
        const grid = $('announce-grid');
        grid.innerHTML = '';

        const minRank = (previousAnnouncement && !isFirstTurn)
            ? rollRank(previousAnnouncement.value) + 1
            : 0;

        // Normal rolls
        const normals = ROLL_ORDER.filter(v => !isPasch(v) && !isMaexchen(v));
        normals.forEach(val => {
            const btn = document.createElement('button');
            btn.className = 'announce-btn';
            btn.textContent = String(val);
            btn.disabled = rollRank(val) < minRank;
            btn.addEventListener('click', () => socket.emit('announce', val));
            grid.appendChild(btn);
        });

        // Pasch
        const pasches = ROLL_ORDER.filter(v => isPasch(v));
        pasches.forEach(val => {
            const btn = document.createElement('button');
            btn.className = 'announce-btn pasch';
            btn.textContent = rollName(val);
            btn.disabled = rollRank(val) < minRank;
            btn.addEventListener('click', () => socket.emit('announce', val));
            grid.appendChild(btn);
        });

        // Mäxchen
        const mBtn = document.createElement('button');
        mBtn.className = 'announce-btn maexchen';
        mBtn.textContent = 'MÄXCHEN (21)';
        mBtn.disabled = rollRank(21) < minRank;
        mBtn.addEventListener('click', () => socket.emit('announce', 21));
        grid.appendChild(mBtn);
    }

    function renderLives(containerId, playersOverride) {
        const container = $(containerId);
        const players = playersOverride || state.gamePlayers;
        container.innerHTML = '';

        players.forEach((p, i) => {
            const div = document.createElement('div');
            div.className = 'player-life';
            if (i === state.currentPlayerIndex) div.classList.add('current');
            if (p.lives <= 0) div.classList.add('eliminated');
            if (i === state.myPlayerIndex) div.classList.add('is-you');

            // Get avatar
            const avatar = window.MaexchenAvatars ? window.MaexchenAvatars.getAvatar(p.name) : '';

            let hearts = '';
            for (let h = 0; h < 3; h++) {
                hearts += h < p.lives
                    ? '<span class="hearts">&#9829;</span>'
                    : '<span class="hearts heart-lost">&#9829;</span>';
            }
            div.innerHTML = `<span class="player-avatar">${avatar}</span><span>${p.name}</span> ${hearts}`;
            container.appendChild(div);
        });
    }

    function showDiceResult(value, name) {
        const resultEl = $('dice-result');
        resultEl.textContent = `Dein Wurf: ${name}`;
        resultEl.style.display = 'block';
        resultEl.className = 'dice-result';
        if (value === 21) resultEl.classList.add('maexchen');
        else if (isPasch(value)) resultEl.classList.add('pasch');
    }

    function showRevealScreen(data) {
        const {
            challengerName, announcerName, actualRoll, actualName,
            announced, announcedName, wasLying, loserName, loserIndex, livesLost, players
        } = data;

        showScreen('reveal');
        renderLives('reveal-lives-bar', players);

        $('reveal-title').textContent = `${challengerName} zweifelt an!`;
        $('reveal-dice-result').textContent = `Tatsächlich: ${actualName}`;
        $('reveal-announced').textContent = `Angesagt: ${announcedName}`;

        const resultText = wasLying
            ? `${announcerName} hat gelogen!`
            : `${announcerName} hat die Wahrheit gesagt!`;
        $('reveal-result').className = `result-text ${wasLying ? 'liar' : 'truth'}`;
        $('reveal-result').textContent = resultText;

        $('reveal-life-lost').textContent = `${loserName} verliert ${livesLost} Leben!`;

        const elimDiv = $('reveal-elimination');
        if (players[loserIndex].lives <= 0) {
            elimDiv.textContent = `${loserName} ist ausgeschieden!`;
            elimDiv.style.display = 'block';
        } else {
            elimDiv.style.display = 'none';
        }
    }

    function showMaexchenBelievedScreen(data) {
        const { believerName, actualRoll, actualName, wasRealMaexchen, players } = data;

        showScreen('reveal');
        renderLives('reveal-lives-bar', players);

        $('reveal-title').textContent = `${believerName} glaubt das Mäxchen!`;
        $('reveal-dice-result').textContent = `Tatsächlich: ${actualName}`;
        $('reveal-announced').textContent = wasRealMaexchen
            ? 'Es war wirklich ein Mäxchen!'
            : 'Es war kein Mäxchen...';

        $('reveal-result').className = 'result-text liar';
        $('reveal-result').textContent = `${believerName} verliert 2 Leben!`;

        $('reveal-life-lost').textContent = '';

        const believerData = players.find(p => p.name === believerName);
        const elimDiv = $('reveal-elimination');
        if (believerData && believerData.lives <= 0) {
            elimDiv.textContent = `${believerName} ist ausgeschieden!`;
            elimDiv.style.display = 'block';
        } else {
            elimDiv.style.display = 'none';
        }
    }

    // Create player sidebar
    function createPlayerSidebar() {
        // Remove existing
        const existing = document.getElementById('player-sidebar');
        if (existing) existing.remove();

        const sidebar = document.createElement('div');
        sidebar.id = 'player-sidebar';
        document.body.appendChild(sidebar);
    }

    // Render player sidebar with pixel art characters
    function renderPlayerSidebar() {
        const sidebar = document.getElementById('player-sidebar');
        if (!sidebar) return;

        sidebar.innerHTML = '';

        state.gamePlayers.forEach((p, i) => {
            const playerEl = document.createElement('div');
            playerEl.className = 'sidebar-player';
            if (i === state.currentPlayerIndex) playerEl.classList.add('current');
            if (p.lives <= 0) playerEl.classList.add('eliminated');
            if (i === state.myPlayerIndex) playerEl.classList.add('is-you');

            // Get character data (pixel art)
            const char = p.character || {};

            // Hearts
            let hearts = '';
            for (let h = 0; h < 3; h++) {
                hearts += `<span class="heart ${h >= p.lives ? 'lost' : ''}">♥</span>`;
            }

            // Use dataURL for pixel art, or placeholder
            const avatarContent = char.dataURL
                ? `<img src="${char.dataURL}" class="pixel-avatar-img" alt="${p.name}">`
                : `<div class="pixel-avatar-placeholder">?</div>`;

            playerEl.innerHTML = `
                <div class="sidebar-avatar pixel-avatar">
                    ${avatarContent}
                </div>
                <div class="sidebar-name">${p.name}</div>
                <div class="sidebar-hearts">${hearts}</div>
                ${i === state.currentPlayerIndex ? '<div class="sidebar-turn-indicator">Am Zug</div>' : ''}
            `;

            sidebar.appendChild(playerEl);
        });
    }

    // Remove sidebar
    function removePlayerSidebar() {
        const sidebar = document.getElementById('player-sidebar');
        if (sidebar) sidebar.remove();
    }

    // Expose renderLives for reveal screen
    window.MaexchenGame = { renderLives, renderPlayerSidebar };
})();
