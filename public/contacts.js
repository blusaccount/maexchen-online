// ============================
// STRICTHOTEL CONTACTS APP
// ============================

(function () {
    'use strict';

    var socket = io();

    var $ = function (id) { return document.getElementById(id); };

    var contactsList = $('contacts-list');
    var contactsCount = $('contacts-count');
    var modal = $('character-modal');
    var modalName = $('modal-name');
    var modalAvatarWrap = $('modal-avatar-wrap');
    var modalStatus = $('modal-status');
    var modalClose = $('modal-close');

    var Creator = window.StrictHotelCreator || window.MaexchenCreator;
    
    // Store diamond counts fetched from server
    var playerDiamonds = new Map(); // playerName -> diamond count

    // Register this player so they show up as online
    function registerSelf() {
        var name = window.StrictHotelSocket.getPlayerName();
        if (!name) return;
        window.StrictHotelSocket.registerPlayer(socket, 'lobby');
    }

    // --- Online Players List ---
    socket.on('online-players', function (players) {
        if (!contactsList) return;

        if (contactsCount) contactsCount.textContent = players.length;

        if (players.length === 0) {
            contactsList.innerHTML = '<span class="no-contacts">Niemand online</span>';
            return;
        }

        contactsList.innerHTML = players.map(function (p) {
            var avatarHtml = p.character && p.character.dataURL
                ? '<span class="contact-avatar"><img src="' + escapeAttr(p.character.dataURL) + '" alt=""></span>'
                : '<span class="contact-avatar"><div class="contact-avatar-placeholder">👽</div></span>';
            var statusText = p.game === 'lobby' ? 'Lobby' : p.game || '';
            
            // Get diamond count for this player
            var diamonds = playerDiamonds.get(p.name) || 0;
            var diamondHtml = diamonds > 0 
                ? '<span class="contact-diamonds"><img src="/assets/diamond.png" class="diamond-icon" alt="💎">×' + diamonds + '</span>' 
                : '';
            
            return '<div class="contact-card" data-name="' + escapeAttr(p.name) + '">' +
                avatarHtml +
                '<div class="contact-info">' +
                '<div class="contact-name">' + escapeHtml(p.name) + diamondHtml + '</div>' +
                (statusText ? '<div class="contact-status">' + escapeHtml(statusText) + '</div>' : '') +
                '</div>' +
                '<div class="contact-online-dot"></div>' +
                '</div>';
        }).join('');
        
        // Request diamond data for all players (without opening modal)
        players.forEach(function(p) {
            socket.emit('get-player-diamonds', { name: p.name });
        });
    });

    // --- Click on a contact to view character ---
    if (contactsList) {
        contactsList.addEventListener('click', function (e) {
            var card = e.target.closest('.contact-card');
            if (!card) return;
            var name = card.getAttribute('data-name');
            if (name) {
                socket.emit('get-player-character', { name: name });
            }
        });
    }

    // --- Receive diamond counts only (no modal) ---
    socket.on('player-diamonds', function (data) {
        if (!data || !data.name) return;
        
        // Store diamond count
        if (typeof data.diamonds === 'number') {
            playerDiamonds.set(data.name, data.diamonds);
            // Update the display if the contact list is already rendered
            var card = document.querySelector('.contact-card[data-name="' + escapeAttr(data.name) + '"]');
            if (card) {
                var nameEl = card.querySelector('.contact-name');
                if (nameEl) {
                    // Remove existing diamond display
                    var existingDiamond = nameEl.querySelector('.contact-diamonds');
                    if (existingDiamond) existingDiamond.remove();
                    
                    // Add new diamond display if > 0
                    if (data.diamonds > 0) {
                        var diamondSpan = document.createElement('span');
                        diamondSpan.className = 'contact-diamonds';
                        diamondSpan.innerHTML = '<img src="/assets/diamond.png" class="diamond-icon" alt="💎">×' + data.diamonds;
                        nameEl.appendChild(diamondSpan);
                    }
                }
            }
        }
    });

    // --- Receive character details (and show modal) ---
    socket.on('player-character', function (data) {
        if (!data || !data.name) return;
        
        // Store diamond count
        if (typeof data.diamonds === 'number') {
            playerDiamonds.set(data.name, data.diamonds);
            // Update the display if the contact list is already rendered
            var card = document.querySelector('.contact-card[data-name="' + escapeAttr(data.name) + '"]');
            if (card) {
                var nameEl = card.querySelector('.contact-name');
                if (nameEl) {
                    // Remove existing diamond display
                    var existingDiamond = nameEl.querySelector('.contact-diamonds');
                    if (existingDiamond) existingDiamond.remove();
                    
                    // Add new diamond display if > 0
                    if (data.diamonds > 0) {
                        var diamondSpan = document.createElement('span');
                        diamondSpan.className = 'contact-diamonds';
                        diamondSpan.innerHTML = '<img src="/assets/diamond.png" class="diamond-icon" alt="💎">×' + data.diamonds;
                        nameEl.appendChild(diamondSpan);
                    }
                }
            }
        }
        
        showCharacterModal(data);
    });

    function showCharacterModal(data) {
        if (!modal) return;

        if (modalName) modalName.textContent = data.name;

        if (modalAvatarWrap) {
            if (data.character && Array.isArray(data.character.pixels) && data.character.pixels.length > 0) {
                // Render from pixel data for crisp display at 128px
                modalAvatarWrap.innerHTML = '';
                var canvas = document.createElement('canvas');
                canvas.className = 'character-modal-avatar';
                canvas.width = 128;
                canvas.height = 128;
                canvas.style.imageRendering = 'pixelated';
                var ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                var gridSize = data.character.pixels.length;
                var pixelSize = 128 / gridSize;
                for (var y = 0; y < gridSize; y++) {
                    var row = data.character.pixels[y];
                    if (!Array.isArray(row)) continue;
                    for (var x = 0; x < row.length; x++) {
                        if (row[x]) {
                            ctx.fillStyle = row[x];
                            ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
                        }
                    }
                }
                modalAvatarWrap.appendChild(canvas);
            } else if (data.character && data.character.dataURL) {
                modalAvatarWrap.innerHTML = '<img class="character-modal-avatar" src="' + escapeAttr(data.character.dataURL) + '" alt="">';
            } else {
                modalAvatarWrap.innerHTML = '<div class="character-modal-placeholder">👽</div>';
            }
        }

        var statusText = data.game === 'lobby' ? 'Lobby' : data.game || '';
        if (modalStatus) modalStatus.textContent = statusText ? 'Playing: ' + statusText : '';

        modal.classList.add('active');
    }

    function hideCharacterModal() {
        if (modal) modal.classList.remove('active');
    }

    // --- Modal close ---
    if (modalClose) {
        modalClose.addEventListener('click', hideCharacterModal);
    }

    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) hideCharacterModal();
        });
    }

    // --- Re-register on reconnect ---
    socket.on('connect', function () {
        registerSelf();
    });

    // --- Utility ---
    var escapeHtml = window.StrictHotelSocket.escapeHtml;

    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // --- Start ---
    registerSelf();
})();
