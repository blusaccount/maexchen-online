// ============================
// AVATARS MODULE - Uses Character Creator
// ============================

(function() {
    const { state } = window.MaexchenApp;

    // Fallback avatars for other players
    const FALLBACK_AVATARS = [
        '👽', '🛸', '🌌', '🪐', '🌙', '⭐', '🔮', '🎭',
        '🤖', '👾', '🦑', '🐙', '🦎', '🐲', '🦋', '🌀'
    ];

    let playerAvatars = new Map();
    let usedFallbackIndices = new Set();

    // Assign avatar to a player
    function assignAvatar(playerName) {
        if (playerAvatars.has(playerName)) {
            return playerAvatars.get(playerName);
        }

        // If it's the current player, use their created character
        if (playerName === state.playerName && window.MaexchenCreator) {
            window.MaexchenCreator.loadSavedCharacter();
            const avatar = window.MaexchenCreator.getAvatarDisplay();
            playerAvatars.set(playerName, avatar);
            return avatar;
        }

        // For other players, use fallback
        let avatarIndex = -1;
        for (let i = 0; i < FALLBACK_AVATARS.length; i++) {
            if (!usedFallbackIndices.has(i)) {
                avatarIndex = i;
                break;
            }
        }

        if (avatarIndex === -1) {
            avatarIndex = Math.floor(Math.random() * FALLBACK_AVATARS.length);
        } else {
            usedFallbackIndices.add(avatarIndex);
        }

        const avatar = FALLBACK_AVATARS[avatarIndex];
        playerAvatars.set(playerName, avatar);

        return avatar;
    }

    // Get avatar for player (returns { type: 'emoji'|'image', value: string })
    function getAvatar(playerName) {
        if (!playerAvatars.has(playerName)) {
            assignAvatar(playerName);
        }
        return playerAvatars.get(playerName);
    }

    // Get avatar HTML for display
    function getAvatarHTML(playerName, size = 24) {
        const avatar = getAvatar(playerName);

        // Check if it's a dataURL (pixel art)
        if (avatar && avatar.startsWith('data:image/')) {
            return `<img src="${avatar}" style="width:${size}px;height:${size}px;image-rendering:pixelated;vertical-align:middle;">`;
        }

        // It's an emoji
        return `<span style="font-size:${size * 0.8}px;">${avatar || '👽'}</span>`;
    }

    // Get avatar color (only for players with created characters)
    function getAvatarColor(playerName) {
        if (playerName === state.playerName && window.MaexchenCreator) {
            return window.MaexchenCreator.getAvatarColor();
        }
        return '#00ff88'; // Default color
    }

    // Clear all assignments
    function clearAvatars() {
        playerAvatars.clear();
        usedFallbackIndices.clear();
    }

    // Public API
    window.MaexchenAvatars = {
        assignAvatar,
        getAvatar,
        getAvatarHTML,
        getAvatarColor,
        clearAvatars,
        FALLBACK_AVATARS
    };
})();
