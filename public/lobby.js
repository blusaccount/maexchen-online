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
    var onlineList = $('online-list');
    var onlineCount = $('online-count');

    var STORAGE_KEY = 'stricthotel-character';
    var NAME_KEY = 'stricthotel-name';
    var registered = false;

    window.StrictHotelLobby = window.StrictHotelLobby || {};
    window.StrictHotelLobby.socket = socket;
    window.StrictHotelLobby.getName = function () {
        return (inputName && inputName.value.trim()) || localStorage.getItem(NAME_KEY) || '';
    };

    // --- Init: Load saved state ---
    function init() {
        // Restore name
        var savedName = localStorage.getItem(NAME_KEY);
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
                localStorage.setItem(NAME_KEY, name);
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

        localStorage.setItem(NAME_KEY, name);

        var character = (Creator && Creator.hasCharacter()) ? Creator.getCharacter() : null;
        socket.emit('register-player', { name: name, character: character, game: 'lobby' });
        registered = true;
    }

    // --- Online Players ---
    socket.on('online-players', function (players) {
        if (!onlineList) return;

        if (onlineCount) onlineCount.textContent = players.length;

        if (players.length === 0) {
            onlineList.innerHTML = '<span class="no-players">Niemand online</span>';
            return;
        }

        onlineList.innerHTML = players.map(function (p) {
            var avatarHtml = p.character && p.character.dataURL
                ? '<img src="' + p.character.dataURL + '" alt="">'
                : '👽';
            var statusText = p.game === 'lobby' ? 'Lobby' : p.game || '';
            return '<div class="online-player">' +
                '<span class="online-avatar">' + avatarHtml + '</span>' +
                '<span>' + escapeHtml(p.name) + '</span>' +
                (statusText ? '<span class="online-status">' + escapeHtml(statusText) + '</span>' : '') +
                '</div>';
        }).join('');
    });

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
        }
    });

    // --- Utility ---
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // --- Start ---
    init();
})();
