// ============================
// WATCH PARTY MODULE
// ============================

(function () {
    const { socket, $, showScreen, state } = window.MaexchenApp;

    let ytPlayer = null;
    let isHost = false;
    let ignorePlayerEvents = false;
    let currentVideoId = null;
    let syncIntervalId = null;

    // --- Extract YouTube Video ID from URL or ID ---
    function extractVideoId(input) {
        if (!input || typeof input !== 'string') return '';
        input = input.trim();

        // Already a video ID (11 chars, alphanumeric + - _)
        if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

        try {
            var url = new URL(input);
            // youtube.com/watch?v=ID
            if (url.searchParams.has('v')) return url.searchParams.get('v').slice(0, 11);
            // youtu.be/ID
            if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0].slice(0, 11);
            // youtube.com/embed/ID
            var embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
            if (embedMatch) return embedMatch[1].slice(0, 11);
            // youtube.com/shorts/ID
            var shortsMatch = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
            if (shortsMatch) return shortsMatch[1].slice(0, 11);
        } catch (_) {
            // Not a valid URL
        }

        return '';
    }

    // --- Load YouTube IFrame API ---
    function loadYouTubeAPI() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        return new Promise(function (resolve) {
            var tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
            window.onYouTubeIframeAPIReady = resolve;
        });
    }

    // --- Create YouTube Player ---
    function createPlayer(videoId) {
        currentVideoId = videoId;
        var container = $('player-container');
        var placeholder = $('video-placeholder');

        if (placeholder) placeholder.style.display = 'none';
        container.innerHTML = '<div id="yt-player"></div>';

        loadYouTubeAPI().then(function () {
            ytPlayer = new YT.Player('yt-player', {
                videoId: videoId,
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 0,
                    controls: isHost ? 1 : 0,
                    disablekb: isHost ? 0 : 1,
                    modestbranding: 1,
                    rel: 0,
                    fs: 1
                },
                events: {
                    onStateChange: onPlayerStateChange
                }
            });
        });
    }

    // --- Player State Change (host only syncs to others) ---
    function onPlayerStateChange(event) {
        if (!isHost || ignorePlayerEvents) return;

        var playerState = event.data;
        var time = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;

        if (playerState === YT.PlayerState.PLAYING) {
            socket.emit('watchparty-playpause', { state: 'playing', time: time });
        } else if (playerState === YT.PlayerState.PAUSED) {
            socket.emit('watchparty-playpause', { state: 'paused', time: time });
        }
    }

    // --- Host: Periodic sync (every 5 seconds while playing) ---
    function startSyncInterval() {
        stopSyncInterval();
        syncIntervalId = setInterval(function () {
            if (!isHost || !ytPlayer || !ytPlayer.getPlayerState) return;
            if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                var time = ytPlayer.getCurrentTime();
                socket.emit('watchparty-seek', time);
            }
        }, 5000);
    }

    function stopSyncInterval() {
        if (syncIntervalId) {
            clearInterval(syncIntervalId);
            syncIntervalId = null;
        }
    }

    // --- Game Started (transition from waiting to game screen) ---
    socket.on('game-started', function () {
        isHost = state.isHost;
        showScreen('game');

        // Show host controls or viewer notice
        if (isHost) {
            $('url-input-section').style.display = 'flex';
            $('viewer-notice').style.display = 'none';
        } else {
            $('url-input-section').style.display = 'none';
            $('viewer-notice').style.display = 'block';
        }

        // Show chat
        if (window.MaexchenChat) {
            window.MaexchenChat.showChat();
            window.MaexchenChat.addLocalMessage('Watch Party gestartet!');
        }

        // Start periodic sync
        startSyncInterval();

        // Show player list
        renderPartyPlayers();

        // Request sync in case video is already loaded
        socket.emit('watchparty-request-sync');
    });

    // --- Load Video Button ---
    $('btn-load-video')?.addEventListener('click', function () {
        var input = $('input-video-url').value;
        var videoId = extractVideoId(input);
        if (!videoId) {
            $('input-video-url').style.borderColor = 'var(--danger)';
            setTimeout(function () {
                $('input-video-url').style.borderColor = 'var(--accent)';
            }, 2000);
            return;
        }
        socket.emit('watchparty-load', videoId);
    });

    // Enter key on URL input
    $('input-video-url')?.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') $('btn-load-video')?.click();
    });

    // --- Receive Video Load ---
    socket.on('watchparty-video', function (data) {
        if (!data || !data.videoId) return;

        if (currentVideoId !== data.videoId) {
            createPlayer(data.videoId);
        }

        // Apply initial state after player is ready
        waitForPlayer(function () {
            ignorePlayerEvents = true;
            if (data.time > 0) {
                ytPlayer.seekTo(data.time, true);
            }
            if (data.state === 'playing') {
                ytPlayer.playVideo();
            }
            setTimeout(function () { ignorePlayerEvents = false; }, 500);
        });
    });

    // --- Receive Sync ---
    socket.on('watchparty-sync', function (data) {
        if (isHost || !ytPlayer || !ytPlayer.getPlayerState) return;

        ignorePlayerEvents = true;

        var currentTime = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
        var timeDiff = Math.abs(currentTime - data.time);

        // Only seek if drift > 2 seconds
        if (timeDiff > 2) {
            ytPlayer.seekTo(data.time, true);
        }

        if (data.state === 'playing' && ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING) {
            ytPlayer.playVideo();
        } else if (data.state === 'paused' && ytPlayer.getPlayerState() !== YT.PlayerState.PAUSED) {
            ytPlayer.pauseVideo();
        }

        setTimeout(function () { ignorePlayerEvents = false; }, 300);

        // Update sync status
        var syncEl = $('sync-status');
        if (syncEl) {
            syncEl.innerHTML = '<span class="synced">● SYNCHRONISIERT</span>';
        }
    });

    // --- Room Update (refresh player list) ---
    socket.on('room-update', function (data) {
        if (!data || !data.players) return;
        isHost = (data.hostId === state.mySocketId);
        renderPartyPlayers(data.players);
    });

    // --- Player Left ---
    socket.on('player-left', function (data) {
        if (window.MaexchenChat && data && data.playerName) {
            window.MaexchenChat.addLocalMessage(data.playerName + ' hat die Party verlassen');
        }
    });

    // --- Render Player List ---
    function renderPartyPlayers(players) {
        var bar = $('lives-bar');
        if (!bar) return;

        // If no players passed, use room state
        if (!players) {
            bar.innerHTML = '';
            return;
        }

        bar.innerHTML = players.map(function (p) {
            var avatarHtml = p.character && p.character.dataURL
                ? '<img src="' + p.character.dataURL + '" alt="" style="width:24px;height:24px;image-rendering:pixelated;">'
                : '👽';
            var hostBadge = p.isHost ? '<span class="host-badge">HOST</span>' : '';
            return '<div class="online-player" style="margin:4px;">' +
                '<span class="online-avatar">' + avatarHtml + '</span>' +
                '<span>' + escapeHtml(p.name) + '</span>' +
                hostBadge +
                '</div>';
        }).join('');
    }

    // --- Wait for YT Player to be ready ---
    function waitForPlayer(callback) {
        var attempts = 0;
        var check = setInterval(function () {
            attempts++;
            if (ytPlayer && ytPlayer.getPlayerState) {
                clearInterval(check);
                callback();
            }
            if (attempts > 50) clearInterval(check); // timeout after ~5s
        }, 100);
    }

    // --- Utility ---
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Override start-game to not need 2 players for watch party
    // The shared lobby module handles the start-game button visibility
    // Host can start with just themselves

    // Expose cleanup for core.js title-click navigation
    window.MaexchenWatchParty = {
        cleanup: function () {
            stopSyncInterval();
            if (ytPlayer && ytPlayer.destroy) {
                ytPlayer.destroy();
            }
            ytPlayer = null;
            currentVideoId = null;
            isHost = false;
        }
    };

})();
