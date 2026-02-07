// ============================
// LOBBY MODULE
// ============================

(function() {
    const { socket, $, showScreen, state } = window.MaexchenApp;

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Get current game type from URL path
    const gameType = window.location.pathname.split('/')[2] || 'maexchen';

    // Check URL for lobby code (?code=XXXX)
    const urlParams = new URLSearchParams(window.location.search);
    const urlCode = urlParams.get('code');
    if (urlCode && $('input-code')) {
        $('input-code').value = urlCode.toUpperCase().slice(0, 4);
    }

    // Request lobbies on load
    socket.emit('get-lobbies', gameType);

    // Periodically refresh lobbies
    setInterval(() => {
        if ($('screen-start')?.classList.contains('active')) {
            socket.emit('get-lobbies', gameType);
        }
    }, 5000);

    // Event delegation for lobby card clicks (single listener instead of per-card)
    const lobbyList = $('lobby-list');
    if (lobbyList) {
        lobbyList.addEventListener('click', (e) => {
            const card = e.target.closest('.lobby-card');
            if (card && card.dataset.code) {
                joinLobby(card.dataset.code);
            }
        });
    }

    // --- Create Room ---
    $('btn-create')?.addEventListener('click', () => {
        const name = $('input-name').value.trim();
        if (!name) {
            $('start-error').textContent = 'Bitte gib einen Namen ein!';
            return;
        }
        state.playerName = name;
        $('start-error').textContent = '';

        // Register as online player
        registerPlayer(name);

        // Check if character exists, if not show creator
        if (window.MaexchenCreator && !window.MaexchenCreator.hasCharacter()) {
            window.MaexchenCreator.showCreator(() => {
                const character = window.MaexchenCreator.getCharacter();
                socket.emit('create-room', { playerName: name, character, gameType });
            });
        } else {
            const character = window.MaexchenCreator ? window.MaexchenCreator.getCharacter() : null;
            socket.emit('create-room', { playerName: name, character, gameType });
        }
    });

    // --- Join Room ---
    $('btn-join')?.addEventListener('click', () => {
        const name = $('input-name').value.trim();
        const code = $('input-code').value.trim().toUpperCase();

        if (!name) {
            $('start-error').textContent = 'Bitte gib einen Namen ein!';
            return;
        }
        if (!code || code.length !== 4) {
            $('start-error').textContent = 'Bitte 4-stelligen Code eingeben!';
            return;
        }

        state.playerName = name;
        $('start-error').textContent = '';

        // Register as online player
        registerPlayer(name);

        // Check if character exists, if not show creator
        if (window.MaexchenCreator && !window.MaexchenCreator.hasCharacter()) {
            window.MaexchenCreator.showCreator(() => {
                const character = window.MaexchenCreator.getCharacter();
                socket.emit('join-room', { code, playerName: name, character });
            });
        } else {
            const character = window.MaexchenCreator ? window.MaexchenCreator.getCharacter() : null;
            socket.emit('join-room', { code, playerName: name, character });
        }
    });

    // Join lobby by clicking on it
    function joinLobby(code) {
        const name = $('input-name').value.trim();
        if (!name) {
            $('start-error').textContent = 'Bitte gib zuerst einen Namen ein!';
            $('input-name').focus();
            return;
        }

        state.playerName = name;
        registerPlayer(name);

        if (window.MaexchenCreator && !window.MaexchenCreator.hasCharacter()) {
            window.MaexchenCreator.showCreator(() => {
                const character = window.MaexchenCreator.getCharacter();
                socket.emit('join-room', { code, playerName: name, character });
            });
        } else {
            const character = window.MaexchenCreator ? window.MaexchenCreator.getCharacter() : null;
            socket.emit('join-room', { code, playerName: name, character });
        }
    }

    // Register player as online
    function registerPlayer(name) {
        const character = window.MaexchenCreator?.hasCharacter()
            ? window.MaexchenCreator.getCharacter()
            : null;
        socket.emit('register-player', { name, character, game: gameType });
        // Sync name to shared storage
        localStorage.setItem('stricthotel-name', name);
    }

    // Edit character button
    $('btn-edit-character')?.addEventListener('click', () => {
        if (window.MaexchenCreator) {
            window.MaexchenCreator.showCreator(() => {
                updateCharacterPreview();
            });
        }
    });

    // Update character preview on start screen
    function updateCharacterPreview() {
        const avatarImg = $('current-avatar');
        const placeholder = $('current-avatar-placeholder');
        const btnText = avatarImg?.nextElementSibling?.nextElementSibling;

        if (avatarImg && window.MaexchenCreator) {
            if (window.MaexchenCreator.hasCharacter()) {
                window.MaexchenCreator.loadSavedCharacter();
                avatarImg.src = window.MaexchenCreator.getAvatarDisplay();
                avatarImg.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
                if (btnText) btnText.textContent = 'Charakter ändern';
            } else {
                avatarImg.style.display = 'none';
                if (placeholder) placeholder.style.display = 'inline';
                if (btnText) btnText.textContent = 'Charakter erstellen';
            }
        }
    }

    // Initialize character preview
    setTimeout(updateCharacterPreview, 100);

    // Pre-fill name from lobby if saved
    const savedLobbyName = localStorage.getItem('stricthotel-name');
    if (savedLobbyName && $('input-name') && !$('input-name').value) {
        $('input-name').value = savedLobbyName;
    }

    // Enter key handlers
    $('input-name')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const code = $('input-code').value.trim();
            if (code.length === 4) {
                $('btn-join').click();
            } else {
                $('btn-create').click();
            }
        }
    });

    $('input-code')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('btn-join').click();
    });

    // --- Online Players Update ---
    socket.on('online-players', (players) => {
        renderOnlinePlayers(players);
    });

    // --- Lobbies Update ---
    socket.on('lobbies-update', ({ gameType: gt, lobbies }) => {
        if (gt === gameType) {
            renderLobbies(lobbies);
        }
    });

    // --- Room Created ---
    socket.on('room-created', ({ code }) => {
        state.roomCode = code;
        state.isHost = true;
        $('room-code-display').textContent = code;
        updateInviteLink(code);
        showScreen('waiting');

        // Show chat panel
        if (window.MaexchenChat) {
            window.MaexchenChat.showChat();
            window.MaexchenChat.addLocalMessage('Raum erstellt. Warte auf Spieler...');
        }
    });

    // --- Room Joined ---
    socket.on('room-joined', ({ code }) => {
        state.roomCode = code;
        state.isHost = false;
        $('room-code-display').textContent = code;
        updateInviteLink(code);
        showScreen('waiting');

        // Show chat panel
        if (window.MaexchenChat) {
            window.MaexchenChat.showChat();
            window.MaexchenChat.addLocalMessage('Raum beigetreten!');
        }

        // Trigger join reaction
        if (window.MaexchenReactions) {
            window.MaexchenReactions.showReactionCentered('join');
        }
    });

    // --- Room Update ---
    socket.on('room-update', ({ players, hostId }) => {
        renderPlayerList(players);
        state.isHost = (hostId === state.mySocketId);

        // Show/hide start button
        const minPlayers = gameType === 'watchparty' ? 1 : 2;
        const canStart = state.isHost && players.length >= minPlayers;
        $('btn-start-game').style.display = canStart ? 'inline-block' : 'none';
        $('waiting-hint').textContent = players.length < minPlayers
            ? 'Warte auf weitere Spieler...'
            : (state.isHost ? '' : 'Warte auf den Host...');
    });

    // --- Start Game ---
    $('btn-start-game')?.addEventListener('click', () => {
        socket.emit('start-game');
    });

    // --- Player Left ---
    socket.on('player-left', ({ playerName }) => {
        console.log(`${playerName} hat den Raum verlassen`);
    });

    // Render online players
    function renderOnlinePlayers(players) {
        const list = $('online-list');
        const count = $('online-count');
        if (!list) return;

        if (count) count.textContent = players.length;

        if (players.length === 0) {
            list.innerHTML = '<span class="no-players">Niemand online</span>';
            return;
        }

        list.innerHTML = players.map(p => {
            const avatarHtml = p.character?.dataURL
                ? `<img src="${escapeHtml(p.character.dataURL)}" alt="">`
                : '👽';
            return `
                <div class="online-player">
                    <span class="online-avatar">${avatarHtml}</span>
                    <span>${escapeHtml(p.name)}</span>
                </div>
            `;
        }).join('');
    }

    // Render open lobbies
    function renderLobbies(lobbies) {
        const list = $('lobby-list');
        if (!list) return;

        if (lobbies.length === 0) {
            list.innerHTML = '<p class="no-lobbies">Keine offenen Räume</p>';
            return;
        }

        list.innerHTML = lobbies.map(lobby => {
            const avatars = lobby.players.slice(0, 4).map(p => {
                if (p.character?.dataURL) {
                    return `<div class="lobby-avatar"><img src="${escapeHtml(p.character.dataURL)}" alt=""></div>`;
                }
                return `<div class="lobby-avatar">👽</div>`;
            }).join('');

            const statusBadge = lobby.started
                ? '<span class="lobby-status lobby-live">▶ LIVE</span>'
                : '';

            return `
                <div class="lobby-card" data-code="${lobby.code}">
                    <div class="lobby-info">
                        <div class="lobby-host">${escapeHtml(lobby.hostName)}'s Raum ${statusBadge}</div>
                        <div class="lobby-code">${escapeHtml(lobby.code)}</div>
                    </div>
                    <div class="lobby-players">
                        <div class="lobby-avatars">${avatars}</div>
                        <span class="lobby-player-count">${lobby.playerCount}/6</span>
                    </div>
                </div>
            `;
        }).join('');

        // Click handlers are managed via event delegation (see below)
    }

    function renderPlayerList(players) {
        const list = $('player-list');
        list.innerHTML = '';

        players.forEach(p => {
            const item = document.createElement('div');
            item.className = 'player-item';

            // Get character display (pixel art dataURL)
            let avatarHtml = '<span class="player-avatar-placeholder">?</span>';
            if (p.character && p.character.dataURL) {
                avatarHtml = `<img class="player-avatar-img" src="${escapeHtml(p.character.dataURL)}" alt="${escapeHtml(p.name)}">`;
            }

            let badges = '';
            if (p.isHost) badges += '<span class="badge badge-host">HOST</span>';
            if (p.name === state.playerName) badges += '<span class="badge badge-you">DU</span>';

            item.innerHTML = `<span class="player-avatar">${avatarHtml}</span><span>${p.name}</span>${badges}`;
            list.appendChild(item);
        });
    }
    // --- Invite Link ---
    function updateInviteLink(code) {
        const btn = $('btn-invite-link');
        if (!btn) return;
        btn.style.display = 'inline-flex';
        btn.onclick = () => {
            const url = `${window.location.origin}${window.location.pathname}?code=${code}`;
            navigator.clipboard.writeText(url).then(() => {
                const original = btn.textContent;
                btn.textContent = '✓ Link kopiert!';
                setTimeout(() => { btn.textContent = original; }, 2000);
            }).catch((err) => {
                console.warn('Clipboard write failed:', err);
                // Fallback: show URL for manual copy
                prompt('Einladungslink:', url);
            });
        };
    }

})();
