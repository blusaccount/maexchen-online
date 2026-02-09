// ============================
// STRICTHOTEL LOBBY - Main Page
// ============================

(function () {
    'use strict';

    const socket = io();
    const Creator = window.StrictHotelCreator || window.MaexchenCreator;

    const $ = (id) => document.getElementById(id);

    const avatarImg = $('avatar-img');
    const avatarPlaceholder = $('avatar-placeholder');
    const inputName = $('input-name');
    const btnCreate = $('btn-create-character');

    const STORAGE_KEY = 'stricthotel-character';
    let registered = false;
    
    // Make It Rain constants
    const RAIN_AUDIO_PATH = '/userinput/winscreen.mp3';
    const RAIN_DURATION_MS = 20000;
    const COIN_SPAWN_INTERVAL_MS = 80;
    const MONEY_EMOJIS = ['💵', '💴', '💶', '💷', '💸', '💰', '💳', '🪙', '🤑', '💲', '💵', '💴', '💶', '💷', '💸'];

    window.StrictHotelLobby = window.StrictHotelLobby || {};
    window.StrictHotelLobby.socket = socket;
    window.StrictHotelLobby.getName = () => {
        return (inputName && inputName.value.trim()) || window.StrictHotelSocket.getPlayerName();
    };

    // --- Init: Load saved state ---
    const init = () => {
        // Restore name
        const savedName = window.StrictHotelSocket.getPlayerName();
        if (savedName && inputName) {
            inputName.value = savedName;
        }

        // Restore avatar
        updateAvatarDisplay();

        // Register if we have both name and character
        if (savedName && Creator && Creator.hasCharacter()) {
            registerPlayer();
        }
    };

    // --- Avatar Display ---
    const updateAvatarDisplay = () => {
        if (!Creator) return;

        if (Creator.hasCharacter()) {
            Creator.loadSavedCharacter();
            const dataURL = Creator.getAvatarDisplay();
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
    };

    // --- Character Creator Button ---
    if (btnCreate && Creator) {
        btnCreate.addEventListener('click', () => {
            Creator.showCreator(() => {
                updateAvatarDisplay();
                registerPlayer();
            });
        });
    }

    // --- Name input: save on change, register ---
    if (inputName) {
        inputName.addEventListener('input', () => {
            const name = inputName.value.trim();
            if (name) {
                localStorage.setItem(window.StrictHotelSocket.NAME_KEY, name);
            }
        });

        inputName.addEventListener('change', () => {
            registerPlayer();
        });
    }

    // --- Register player with server ---
    const registerPlayer = () => {
        const name = (inputName && inputName.value.trim()) || '';
        if (!name) return;

        localStorage.setItem(window.StrictHotelSocket.NAME_KEY, name);

        window.StrictHotelSocket.registerPlayer(socket, 'lobby');
        registered = true;
    };

    // --- Socket connect → re-register ---
    socket.on('connect', () => {
        if (registered) {
            registerPlayer();
        }
    });

    // --- Currency Balance ---
    socket.on('balance-update', (data) => {
        const el = document.getElementById('currency-amount');
        if (el && data && typeof data.balance === 'number') {
            el.textContent = data.balance;
            
            // Update make it rain button state
            const rainBtn = document.getElementById('btn-make-it-rain');
            if (rainBtn) {
                rainBtn.disabled = data.balance < 20;
            }
        }
    });

    // --- Make It Rain Button ---
    const rainBtn = document.getElementById('btn-make-it-rain');
    if (rainBtn) {
        rainBtn.addEventListener('click', () => {
            const currentBalance = parseFloat(document.getElementById('currency-amount')?.textContent || '0');
            if (currentBalance < 20) {
                return;
            }
            
            socket.emit('lobby-make-it-rain');
        });
    }

    // --- Make It Rain Effect ---
    socket.on('lobby-rain-effect', (data) => {
        if (!data || !data.playerName) return;
        
        // Show toast notification
        const toast = document.createElement('div');
        toast.className = 'rain-toast';
        toast.textContent = `${data.playerName} made it rain! 💸`;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
        
        // Play victory music for 20 seconds
        const audio = new Audio(RAIN_AUDIO_PATH);
        audio.volume = 0.5;
        audio.play().catch(() => {
            console.log('Audio playback failed');
        });
        setTimeout(() => {
            audio.pause();
            audio.currentTime = 0;
        }, RAIN_DURATION_MS);
        
        // Spawn falling coins
        const container = document.createElement('div');
        container.className = 'money-rain-container';
        document.body.appendChild(container);
        
        const interval = setInterval(() => {
            createFallingCoin(container);
        }, COIN_SPAWN_INTERVAL_MS);
        
        setTimeout(() => {
            clearInterval(interval);
            setTimeout(() => {
                container.remove();
            }, 3000);
        }, RAIN_DURATION_MS);
    });

    const createFallingCoin = (container) => {
        const coin = document.createElement('div');
        coin.className = 'falling-coin';
        coin.textContent = MONEY_EMOJIS[Math.floor(Math.random() * MONEY_EMOJIS.length)];
        coin.style.left = `${Math.random() * 100}vw`;
        coin.style.animationDuration = `${2 + Math.random() * 2}s`;
        coin.style.animationDelay = `${Math.random() * 0.5}s`;
        container.appendChild(coin);
        
        setTimeout(() => {
            coin.remove();
        }, 5000);
    };

    // --- Start ---
    init();
})();
