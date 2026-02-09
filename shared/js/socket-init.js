// ============================
// STRICTHOTEL - Socket.IO Initialization Helpers
// ============================
// Shared utilities for Socket.IO connection, player registration, and common helpers.
// Use via window.StrictHotelSocket global (vanilla JS, no ES modules).

(function () {
    'use strict';

    // Storage keys
    var NAME_KEY = 'stricthotel-name';
    var CHAR_KEY = 'stricthotel-character';

    /**
     * Get the player name from localStorage
     * @returns {string} Player name or empty string
     */
    function getPlayerName() {
        return localStorage.getItem(NAME_KEY) || '';
    }

    /**
     * Get character data from localStorage or Creator
     * @returns {object|null} Character object or null
     */
    function getCharacterData() {
        var Creator = window.MaexchenCreator || window.StrictHotelCreator;
        if (Creator && Creator.hasCharacter()) {
            return Creator.getCharacter();
        }
        
        // Fallback: try to parse from localStorage
        var charJSON = localStorage.getItem(CHAR_KEY);
        if (charJSON) {
            try {
                return JSON.parse(charJSON);
            } catch (e) {
                return null;
            }
        }
        
        return null;
    }

    /**
     * Register player with server (emits 'register-player' event)
     * @param {object} socket - Socket.IO socket instance
     * @param {string} game - Game identifier (e.g., 'lobby', 'shop', 'maexchen')
     */
    function registerPlayer(socket, game) {
        var name = getPlayerName();
        if (!name) return;

        var character = getCharacterData();
        socket.emit('register-player', { name: name, character: character, game: game });
    }

    /**
     * Escape HTML to prevent XSS attacks
     * @param {string} str - String to escape
     * @returns {string} HTML-escaped string
     */
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Export as global
    window.StrictHotelSocket = {
        NAME_KEY: NAME_KEY,
        CHAR_KEY: CHAR_KEY,
        getPlayerName: getPlayerName,
        getCharacterData: getCharacterData,
        registerPlayer: registerPlayer,
        escapeHtml: escapeHtml
    };
})();
