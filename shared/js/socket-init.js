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
                var parsed = JSON.parse(charJSON);
                // localStorage stores raw pixel grid (2D array); wrap it into
                // a proper character object with a dataURL so the server receives
                // both the pixel data and a renderable image.
                if (Array.isArray(parsed)) {
                    var dataURL = renderPixelGridToDataURL(parsed);
                    return { pixels: parsed, dataURL: dataURL };
                }
                return parsed;
            } catch (e) {
                return null;
            }
        }
        
        return null;
    }

    /**
     * Render a 2D pixel grid to a canvas data URL.
     * Used as fallback when the Creator module is not loaded.
     */
    function renderPixelGridToDataURL(pixels) {
        try {
            var size = 64;
            var gridSize = pixels.length || 16;
            var canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            var ctx = canvas.getContext('2d');
            var pixelSize = size / gridSize;
            for (var y = 0; y < gridSize; y++) {
                var row = pixels[y];
                if (!Array.isArray(row)) continue;
                for (var x = 0; x < row.length; x++) {
                    if (row[x]) {
                        ctx.fillStyle = row[x];
                        ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
                    }
                }
            }
            return canvas.toDataURL();
        } catch (e) {
            return null;
        }
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
