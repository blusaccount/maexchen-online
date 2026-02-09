// ============================
// STRICTHOTEL LOBBY - Main Page
// ============================

(function () {
    'use strict';

    var socket = io();
    var Creator = window.StrictHotelCreator || window.MaexchenCreator;

    var $ = function (id) { return document.getElementById(id); };

    var avatarImg = $('avatar-img');
    var avatarPlaceholder = $('avatar-placeholder');
    var inputName = $('input-name');
    var btnCreate = $('btn-create-character');

    var STORAGE_KEY = 'stricthotel-character';
    var registered = false;
    
    // Make It Rain constants
    var RAIN_AUDIO_PATH = '/userinput/winscreen.mp3';
    var RAIN_DURATION_MS = 20000;
    var COIN_SPAWN_INTERVAL_MS = 300;

    window.StrictHotelLobby = window.StrictHotelLobby || {};
    window.StrictHotelLobby.socket = socket;
    window.StrictHotelLobby.getName = function () {
        return (inputName && inputName.value.trim()) || window.StrictHotelSocket.getPlayerName();
    };

    // --- Init: Load saved state ---
    function init() {
        // Restore name
        var savedName = window.StrictHotelSocket.getPlayerName();
        if (savedName && inputName) {
            inputName.value = savedName;
        }

        // Restore avatar
        updateAvatarDisplay();

        // Register if we have both name and character
        if (savedName && Creator && Creator.hasCharacter()) {
            registerPlayer();
        }
    }

    // --- Avatar Display ---
    function updateAvatarDisplay() {
        if (!Creator) return;

        if (Creator.hasCharacter()) {
            Creator.loadSavedCharacter();
            var dataURL = Creator.getAvatarDisplay();
            if (avatarImg) {
                avatarImg.src = dataURL;
                avatarImg.style.display = 'block';
            }
            if (avatarPlaceholder) {
                avatarPlaceholder.style.display = 'none';
            }
            if (btnCreate) {
                btnCreate.textContent = 'CHARAKTER ÄNDERN';
            }
        } else {
            if (avatarImg) avatarImg.style.display = 'none';
            if (avatarPlaceholder) avatarPlaceholder.style.display = 'flex';
            if (btnCreate) btnCreate.textContent = 'CHARAKTER ERSTELLEN';
        }
    }

    // --- Character Creator Button ---
    if (btnCreate && Creator) {
        btnCreate.addEventListener('click', function () {
            Creator.showCreator(function () {
                updateAvatarDisplay();
                registerPlayer();
            });
        });
    }

    // --- Name input: save on change, register ---
    if (inputName) {
        inputName.addEventListener('input', function () {
            var name = inputName.value.trim();
            if (name) {
                localStorage.setItem(window.StrictHotelSocket.NAME_KEY, name);
            }
        });

        inputName.addEventListener('change', function () {
            registerPlayer();
        });
    }

    // --- Register player with server ---
    function registerPlayer() {
        var name = (inputName && inputName.value.trim()) || '';
        if (!name) return;

        localStorage.setItem(window.StrictHotelSocket.NAME_KEY, name);

        window.StrictHotelSocket.registerPlayer(socket, 'lobby');
        registered = true;
    }

    // --- Socket connect → re-register ---
    socket.on('connect', function () {
        if (registered) {
            registerPlayer();
        }
    });

    // --- Currency Balance ---
    socket.on('balance-update', function (data) {
        var el = document.getElementById('currency-amount');
        if (el && data && typeof data.balance === 'number') {
            el.textContent = data.balance;
            
            // Update make it rain button state
            var rainBtn = document.getElementById('btn-make-it-rain');
            if (rainBtn) {
                rainBtn.disabled = data.balance < 20;
            }
        }
    });

    // --- Make It Rain Button ---
    var rainBtn = document.getElementById('btn-make-it-rain');
    if (rainBtn) {
        rainBtn.addEventListener('click', function () {
            var currentBalance = parseFloat(document.getElementById('currency-amount')?.textContent || '0');
            if (currentBalance < 20) {
                return;
            }
            
            socket.emit('lobby-make-it-rain');
        });
    }

    // --- Make It Rain Effect ---
    socket.on('lobby-rain-effect', function (data) {
        if (!data || !data.playerName) return;
        
        // Show toast notification
        var toast = document.createElement('div');
        toast.className = 'rain-toast';
        toast.textContent = data.playerName + ' made it rain! 💸';
        document.body.appendChild(toast);
        
        setTimeout(function () {
            toast.remove();
        }, 5000);
        
        // Play victory music for 20 seconds
        var audio = new Audio(RAIN_AUDIO_PATH);
        audio.volume = 0.5;
        audio.play().catch(function () {
            console.log('Audio playback failed');
        });
        setTimeout(function () {
            audio.pause();
            audio.currentTime = 0;
        }, RAIN_DURATION_MS);
        
        // Spawn falling coins
        var container = document.createElement('div');
        container.className = 'money-rain-container';
        document.body.appendChild(container);
        
        var interval = setInterval(function () {
            createFallingCoin(container);
        }, COIN_SPAWN_INTERVAL_MS);
        
        setTimeout(function () {
            clearInterval(interval);
            setTimeout(function () {
                container.remove();
            }, 3000);
        }, RAIN_DURATION_MS);
    });

    function createFallingCoin(container) {
        var coin = document.createElement('div');
        coin.className = 'falling-coin';
        coin.textContent = '🪙';
        coin.style.left = Math.random() * 100 + 'vw';
        coin.style.animationDuration = (2 + Math.random() * 2) + 's';
        coin.style.animationDelay = Math.random() * 0.5 + 's';
        container.appendChild(coin);
        
        setTimeout(function () {
            coin.remove();
        }, 5000);
    }

    // --- Start ---
    init();
})();
