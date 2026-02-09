// ============================
// STRICTHOTEL CONTACTS APP
// ============================

(() => {
    'use strict';

    const socket = io();

    const $ = (id) => document.getElementById(id);

    const contactsList = $('contacts-list');
    const contactsCount = $('contacts-count');
    const modal = $('character-modal');
    const modalName = $('modal-name');
    const modalAvatarWrap = $('modal-avatar-wrap');
    const modalStatus = $('modal-status');
    const modalClose = $('modal-close');

    const Creator = window.StrictHotelCreator || window.MaexchenCreator;
    
    // Store diamond counts fetched from server
    const playerDiamonds = new Map(); // playerName -> diamond count

    // Register this player so they show up as online
    const registerSelf = () => {
        const name = window.StrictHotelSocket.getPlayerName();
        if (!name) return;
        window.StrictHotelSocket.registerPlayer(socket, 'lobby');
    };

    // --- Online Players List ---
    socket.on('online-players', (players) => {
        if (!contactsList) return;

        if (contactsCount) contactsCount.textContent = players.length;

        if (players.length === 0) {
            contactsList.innerHTML = '<span class="no-contacts">Niemand online</span>';
            return;
        }

        contactsList.innerHTML = players.map((p) => {
            const avatarHtml = p.character && p.character.dataURL
                ? `<span class="contact-avatar"><img src="${escapeAttr(p.character.dataURL)}" alt=""></span>`
                : '<span class="contact-avatar"><div class="contact-avatar-placeholder">👽</div></span>';
            const statusText = p.game === 'lobby' ? 'Lobby' : p.game || '';
            
            // Get diamond count for this player
            const diamonds = playerDiamonds.get(p.name) || 0;
            const diamondHtml = diamonds > 0 
                ? `<span class="contact-diamonds"><img src="/assets/diamond.png" class="diamond-icon" alt="💎">×${diamonds}</span>` 
                : '';
            
            return `<div class="contact-card" data-name="${escapeAttr(p.name)}">` +
                avatarHtml +
                '<div class="contact-info">' +
                `<div class="contact-name">${escapeHtml(p.name)}${diamondHtml}</div>` +
                (statusText ? `<div class="contact-status">${escapeHtml(statusText)}</div>` : '') +
                '</div>' +
                '<div class="contact-online-dot"></div>' +
                '</div>';
        }).join('');
        
        // Request diamond data for all players (without opening modal)
        players.forEach((p) => {
            socket.emit('get-player-diamonds', { name: p.name });
        });
    });

    // --- Click on a contact to view character ---
    if (contactsList) {
        contactsList.addEventListener('click', (e) => {
            const card = e.target.closest('.contact-card');
            if (!card) return;
            const name = card.getAttribute('data-name');
            if (name) {
                socket.emit('get-player-character', { name: name });
            }
        });
    }

    // --- Receive diamond counts only (no modal) ---
    socket.on('player-diamonds', (data) => {
        if (!data || !data.name) return;
        
        // Store diamond count
        if (typeof data.diamonds === 'number') {
            playerDiamonds.set(data.name, data.diamonds);
            // Update the display if the contact list is already rendered
            const card = document.querySelector(`.contact-card[data-name="${escapeAttr(data.name)}"]`);
            if (card) {
                const nameEl = card.querySelector('.contact-name');
                if (nameEl) {
                    // Remove existing diamond display
                    const existingDiamond = nameEl.querySelector('.contact-diamonds');
                    if (existingDiamond) existingDiamond.remove();
                    
                    // Add new diamond display if > 0
                    if (data.diamonds > 0) {
                        const diamondSpan = document.createElement('span');
                        diamondSpan.className = 'contact-diamonds';
                        diamondSpan.innerHTML = `<img src="/assets/diamond.png" class="diamond-icon" alt="💎">×${data.diamonds}`;
                        nameEl.appendChild(diamondSpan);
                    }
                }
            }
        }
    });

    // --- Receive character details (and show modal) ---
    socket.on('player-character', (data) => {
        if (!data || !data.name) return;
        
        // Store diamond count
        if (typeof data.diamonds === 'number') {
            playerDiamonds.set(data.name, data.diamonds);
            // Update the display if the contact list is already rendered
            const card = document.querySelector(`.contact-card[data-name="${escapeAttr(data.name)}"]`);
            if (card) {
                const nameEl = card.querySelector('.contact-name');
                if (nameEl) {
                    // Remove existing diamond display
                    const existingDiamond = nameEl.querySelector('.contact-diamonds');
                    if (existingDiamond) existingDiamond.remove();
                    
                    // Add new diamond display if > 0
                    if (data.diamonds > 0) {
                        const diamondSpan = document.createElement('span');
                        diamondSpan.className = 'contact-diamonds';
                        diamondSpan.innerHTML = `<img src="/assets/diamond.png" class="diamond-icon" alt="💎">×${data.diamonds}`;
                        nameEl.appendChild(diamondSpan);
                    }
                }
            }
        }
        
        showCharacterModal(data);
    });

    const showCharacterModal = (data) => {
        if (!modal) return;

        if (modalName) modalName.textContent = data.name;

        if (modalAvatarWrap) {
            if (data.character && Array.isArray(data.character.pixels) && data.character.pixels.length > 0) {
                // Render from pixel data for crisp display at 128px
                modalAvatarWrap.innerHTML = '';
                const canvas = document.createElement('canvas');
                canvas.className = 'character-modal-avatar';
                canvas.width = 128;
                canvas.height = 128;
                canvas.style.imageRendering = 'pixelated';
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                const gridSize = data.character.pixels.length;
                const pixelSize = 128 / gridSize;
                for (let y = 0; y < gridSize; y++) {
                    const row = data.character.pixels[y];
                    if (!Array.isArray(row)) continue;
                    for (let x = 0; x < row.length; x++) {
                        if (row[x]) {
                            ctx.fillStyle = row[x];
                            ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
                        }
                    }
                }
                modalAvatarWrap.appendChild(canvas);
            } else if (data.character && data.character.dataURL) {
                modalAvatarWrap.innerHTML = `<img class="character-modal-avatar" src="${escapeAttr(data.character.dataURL)}" alt="">`;
            } else {
                modalAvatarWrap.innerHTML = '<div class="character-modal-placeholder">👽</div>';
            }
        }

        const statusText = data.game === 'lobby' ? 'Lobby' : data.game || '';
        if (modalStatus) modalStatus.textContent = statusText ? `Playing: ${statusText}` : '';

        modal.classList.add('active');
    };

    const hideCharacterModal = () => {
        if (modal) modal.classList.remove('active');
    };

    // --- Modal close ---
    if (modalClose) {
        modalClose.addEventListener('click', hideCharacterModal);
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideCharacterModal();
        });
    }

    // --- Re-register on reconnect ---
    socket.on('connect', () => {
        registerSelf();
    });

    // --- Utility ---
    const escapeHtml = window.StrictHotelSocket.escapeHtml;

    const escapeAttr = (str) => str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // --- Start ---
    registerSelf();
})();
