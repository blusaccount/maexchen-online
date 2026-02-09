// ========================================
// STRICT CLUB - Main Client Logic
// ========================================

(function () {
    'use strict';

    var socket = io();
    var player = null;
    var playerReady = false;
    var currentVideoId = null;
    var isPlaying = false;

    var $ = function (id) { return document.getElementById(id); };

    var urlInput = $('youtube-url-input');
    var queueBtn = $('queue-btn');
    var playBtn = $('play-btn');
    var skipBtn = $('skip-btn');
    var nowPlayingTitle = $('now-playing-title');
    var nowPlayingQueued = $('now-playing-queued');
    var listenersList = $('listeners-list');
    var listenersCount = $('listeners-count');
    var queueList = $('queue-list');
    var queueCount = $('queue-count');

    // ====== Extract YouTube Video ID ======
    function extractYouTubeId(input) {
        if (!input || typeof input !== 'string') return null;
        
        input = input.trim();
        
        // Direct video ID (11 chars, alphanumeric + _ -)
        if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
            return input;
        }

        // Standard URL patterns
        var patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
        ];

        for (var i = 0; i < patterns.length; i++) {
            var match = input.match(patterns[i]);
            if (match && match[1]) {
                return match[1];
            }
        }

        return null;
    }

    // ====== YouTube Player Setup ======
    window.onYouTubeIframeAPIReady = function () {
        player = new YT.Player('youtube-player', {
            height: '1',
            width: '1',
            playerVars: {
                autoplay: 0,
                controls: 0,
                disablekb: 1,
                fs: 0,
                modestbranding: 1,
                playsinline: 1
            },
            events: {
                onReady: onPlayerReady,
                onStateChange: onPlayerStateChange
            }
        });
    };

    function onPlayerReady() {
        playerReady = true;
        console.log('[StrictClub] YouTube player ready');
        
        // Try to connect visualizer to player audio
        if (window.StrictClubVisualizer) {
            window.StrictClubVisualizer.init();
            window.StrictClubVisualizer.connect(player);
        }
    }

    function onPlayerStateChange(event) {
        // Sync local state with player
        if (event.data === YT.PlayerState.PLAYING) {
            isPlaying = true;
            playBtn.textContent = '⏸️';
            if (window.StrictClubVisualizer) {
                window.StrictClubVisualizer.setPlaying(true);
            }
        } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
            isPlaying = false;
            playBtn.textContent = '▶️';
            if (window.StrictClubVisualizer) {
                window.StrictClubVisualizer.setPlaying(false);
            }
        }

        // Notify server if track ended
        if (event.data === YT.PlayerState.ENDED) {
            socket.emit('club-skip');
        }
    }

    // ====== UI Handlers ======
    if (queueBtn && urlInput) {
        queueBtn.addEventListener('click', function () {
            var input = urlInput.value.trim();
            if (!input) return;

            var videoId = extractYouTubeId(input);
            if (!videoId) {
                alert('Invalid YouTube URL or Video ID');
                return;
            }

            socket.emit('club-queue', videoId);
            urlInput.value = '';
        });

        urlInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                queueBtn.click();
            }
        });
    }

    if (playBtn) {
        playBtn.addEventListener('click', function () {
            if (!currentVideoId) return;
            socket.emit('club-pause', !isPlaying);
        });
    }

    if (skipBtn) {
        skipBtn.addEventListener('click', function () {
            socket.emit('club-skip');
        });
    }

    // ====== Socket Event Handlers ======

    socket.on('connect', function () {
        console.log('[StrictClub] Connected to server');
        
        // Register player for global online status
        var name = window.StrictHotelSocket.getPlayerName();
        if (name) {
            window.StrictHotelSocket.registerPlayer(socket, 'strict-club');
        }
        
        socket.emit('club-join');
    });

    socket.on('disconnect', function () {
        console.log('[StrictClub] Disconnected from server');
        updateListeners([]);
    });

    // Server sends current club state to newly joined user
    socket.on('club-sync', function (data) {
        console.log('[StrictClub] Syncing state:', data);
        
        if (data.videoId && data.videoId !== currentVideoId) {
            loadVideo(data.videoId, data.title, data.queuedBy);
        }

        if (!data.videoId && currentVideoId) {
            currentVideoId = null;
            if (nowPlayingTitle) nowPlayingTitle.textContent = 'No track playing';
            if (nowPlayingQueued) nowPlayingQueued.textContent = '';
            if (playerReady && player) player.stopVideo();
        }

        isPlaying = data.isPlaying;
        
        if (playerReady && player) {
            if (data.isPlaying) {
                player.playVideo();
            } else {
                player.pauseVideo();
            }
        }

        if (data.listeners) {
            updateListeners(data.listeners);
        }

        if (data.queue) {
            updateQueue(data.queue);
        }
    });

    // Server broadcasts when a new track starts
    socket.on('club-play', function (data) {
        console.log('[StrictClub] Playing:', data);
        loadVideo(data.videoId, data.title, data.queuedBy);
        
        if (playerReady && player) {
            player.playVideo();
        }
    });

    // Server broadcasts play/pause state changes
    socket.on('club-pause', function (data) {
        isPlaying = data.isPlaying;
        
        if (playerReady && player) {
            if (data.isPlaying) {
                player.playVideo();
            } else {
                player.pauseVideo();
            }
        }
    });

    // Server broadcasts listener list updates
    socket.on('club-listeners', function (data) {
        updateListeners(data.listeners || []);
    });

    // Server broadcasts queue updates
    socket.on('club-queue-update', function (data) {
        updateQueue(data.queue || []);
    });

    // ====== Helper Functions ======

    function loadVideo(videoId, title, queuedBy) {
        currentVideoId = videoId;
        
        if (nowPlayingTitle) {
            nowPlayingTitle.textContent = title || 'Unknown Track';
        }
        
        if (nowPlayingQueued) {
            nowPlayingQueued.textContent = queuedBy ? 'Queued by ' + queuedBy : '';
        }

        if (playerReady && player) {
            player.loadVideoById(videoId);
        }
    }

    function updateListeners(listeners) {
        if (!listenersList || !listenersCount) return;

        listenersCount.textContent = listeners.length;

        if (listeners.length === 0) {
            listenersList.innerHTML = '<div class="listener-item">No one here yet...</div>';
            return;
        }

        listenersList.innerHTML = '';
        listeners.forEach(function (listener) {
            var item = document.createElement('div');
            item.className = 'listener-item';
            item.textContent = listener;
            listenersList.appendChild(item);
        });
    }

    function updateQueue(queue) {
        if (!queueList || !queueCount) return;

        queueCount.textContent = queue.length;

        if (queue.length === 0) {
            queueList.innerHTML = '<div class="queue-item empty">Queue is empty</div>';
            return;
        }

        queueList.innerHTML = '';
        queue.forEach(function (entry, index) {
            var item = document.createElement('div');
            item.className = 'queue-item';

            var pos = document.createElement('span');
            pos.className = 'queue-position';
            pos.textContent = (index + 1) + '.';

            var title = document.createElement('span');
            title.className = 'queue-title';
            title.textContent = ' ' + (entry.title || 'YouTube Track');

            var by = document.createElement('span');
            by.className = 'queue-by';
            by.textContent = ' \u2014 ' + (entry.queuedBy || 'Guest');

            item.appendChild(pos);
            item.appendChild(title);
            item.appendChild(by);
            queueList.appendChild(item);
        });
    }

    // ====== Cleanup on page unload ======
    window.addEventListener('beforeunload', function () {
        socket.emit('club-leave');
    });

})();
