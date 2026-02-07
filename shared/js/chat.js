// ============================
// CHAT MODULE - Alien Transmission System
// ============================

(function() {
    const { socket, $, state } = window.MaexchenApp;

    let chatVisible = false;

    // Drawing note state
    const NOTE_SIZE = 16;
    const NOTE_COLORS = [
        null,       // Eraser
        '#00ff88', // Green
        '#00aaff', // Blue
        '#ff3366', // Red
        '#ffdd00', // Yellow
        '#ffffff', // White
        '#000000'  // Black
    ];
    let notePixels = createEmptyNoteGrid();
    let noteSelectedColor = 1;
    let noteIsDrawing = false;

    function createEmptyNoteGrid() {
        return Array(NOTE_SIZE).fill(null).map(() => Array(NOTE_SIZE).fill(null));
    }

    // Initialize chat
    function initChat() {
        const sendBtn = $('btn-send');
        const chatInput = $('chat-input');
        const drawBtn = $('btn-draw');

        if (sendBtn) {
            sendBtn.addEventListener('click', sendMessage);
        }

        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }

        if (drawBtn) {
            drawBtn.addEventListener('click', openDrawingPanel);
        }

        // Listen for chat broadcasts
        socket.on('chat-broadcast', handleChatBroadcast);

        // Listen for system messages
        socket.on('system-message', handleSystemMessage);

        // Listen for drawing notes
        socket.on('drawing-note', handleDrawingNote);

        // Setup drawing panel controls
        setupDrawingPanel();
    }

    let noteGridInitialized = false;

    // Open drawing panel
    function openDrawingPanel() {
        const overlay = $('draw-note-overlay');
        if (!overlay) return;

        // Reset canvas
        notePixels = createEmptyNoteGrid();
        noteSelectedColor = 1;

        // Create grid (initializes listeners only once)
        createNoteGrid();

        // Create palette
        createNotePalette();

        // Populate recipient dropdown
        populateRecipients();

        overlay.style.display = 'flex';
    }

    // Create the drawing grid
    function createNoteGrid() {
        const grid = $('draw-note-grid');
        if (!grid) return;

        grid.innerHTML = '';

        for (let y = 0; y < NOTE_SIZE; y++) {
            for (let x = 0; x < NOTE_SIZE; x++) {
                const cell = document.createElement('div');
                cell.className = 'note-cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                grid.appendChild(cell);
            }
        }

        // Only add event listeners once to prevent accumulation
        if (!noteGridInitialized) {
            noteGridInitialized = true;

            // Mouse events
            grid.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('note-cell')) {
                    noteIsDrawing = true;
                    paintNoteCell(e.target);
                }
            });

            grid.addEventListener('mousemove', (e) => {
                if (noteIsDrawing && e.target.classList.contains('note-cell')) {
                    paintNoteCell(e.target);
                }
            });

            document.addEventListener('mouseup', () => {
                noteIsDrawing = false;
            });

            // Touch events
            grid.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                const cell = document.elementFromPoint(touch.clientX, touch.clientY);
                if (cell && cell.classList.contains('note-cell')) {
                    noteIsDrawing = true;
                    paintNoteCell(cell);
                }
            });

            grid.addEventListener('touchmove', (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                const cell = document.elementFromPoint(touch.clientX, touch.clientY);
                if (noteIsDrawing && cell && cell.classList.contains('note-cell')) {
                    paintNoteCell(cell);
                }
            });

            grid.addEventListener('touchend', () => {
                noteIsDrawing = false;
            });
        }
    }

    // Create color palette
    function createNotePalette() {
        const palette = $('draw-note-palette');
        if (!palette) return;

        palette.innerHTML = '';

        NOTE_COLORS.forEach((color, i) => {
            const swatch = document.createElement('div');
            swatch.className = 'note-swatch' + (i === noteSelectedColor ? ' selected' : '');
            if (i === 0) {
                swatch.innerHTML = '✕';
                swatch.classList.add('eraser');
            } else {
                swatch.style.backgroundColor = color;
            }
            swatch.dataset.index = i;
            palette.appendChild(swatch);

            swatch.addEventListener('click', () => {
                noteSelectedColor = i;
                palette.querySelectorAll('.note-swatch').forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
            });
        });
    }

    // Paint a cell
    function paintNoteCell(cell) {
        const x = parseInt(cell.dataset.x);
        const y = parseInt(cell.dataset.y);
        const color = NOTE_COLORS[noteSelectedColor];

        notePixels[y][x] = color;
        cell.style.backgroundColor = color || '';
    }

    // Populate recipient dropdown
    function populateRecipients() {
        const select = $('draw-note-target');
        if (!select) return;

        select.innerHTML = '<option value="all">Alle Spieler</option>';

        // Add each player except self
        if (state.gamePlayers && state.gamePlayers.length > 0) {
            state.gamePlayers.forEach(p => {
                if (p.name !== state.playerName) {
                    const opt = document.createElement('option');
                    opt.value = p.name;
                    opt.textContent = p.name;
                    select.appendChild(opt);
                }
            });
        }
    }

    // Setup drawing panel controls
    function setupDrawingPanel() {
        const clearBtn = $('btn-note-clear');
        const cancelBtn = $('btn-note-cancel');
        const sendBtn = $('btn-note-send');

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                notePixels = createEmptyNoteGrid();
                const cells = document.querySelectorAll('.note-cell');
                cells.forEach(cell => cell.style.backgroundColor = '');
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeDrawingPanel);
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', sendDrawingNote);
        }
    }

    // Close drawing panel
    function closeDrawingPanel() {
        const overlay = $('draw-note-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    // Send drawing note
    function sendDrawingNote() {
        const select = $('draw-note-target');
        const target = select ? select.value : 'all';

        // Check if anything was drawn
        const hasDrawing = notePixels.some(row => row.some(cell => cell !== null));
        if (!hasDrawing) {
            closeDrawingPanel();
            return;
        }

        // Render to data URL
        const dataURL = renderNoteToDataURL();

        socket.emit('drawing-note', {
            pixels: notePixels,
            dataURL: dataURL,
            target: target
        });

        // Show in own chat
        displayDrawingInChat(state.playerName, dataURL, target);

        closeDrawingPanel();
        playNoteSentSound();
    }

    // Render note pixels to data URL
    function renderNoteToDataURL() {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const pixelSize = size / NOTE_SIZE;

        for (let y = 0; y < NOTE_SIZE; y++) {
            for (let x = 0; x < NOTE_SIZE; x++) {
                if (notePixels[y][x]) {
                    ctx.fillStyle = notePixels[y][x];
                    ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
                }
            }
        }

        return canvas.toDataURL();
    }

    // Handle incoming drawing note
    function handleDrawingNote({ from, dataURL, target }) {
        // Check if this is for us
        if (target !== 'all' && target !== state.playerName) return;

        // Show popup
        showReceivedDrawing(from, dataURL);

        // Also show in chat
        displayDrawingInChat(from, dataURL, target === 'all' ? 'all' : 'dir');
    }

    // Show received drawing as popup
    function showReceivedDrawing(from, dataURL) {
        const container = $('received-drawing');
        if (!container) return;

        const fromEl = container.querySelector('.received-from');
        const canvas = $('received-canvas');

        if (fromEl) fromEl.textContent = `${from} sendet:`;

        if (canvas) {
            const img = new Image();
            img.onload = () => {
                canvas.width = 128;
                canvas.height = 128;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, 0, 0, 128, 128);
            };
            img.src = dataURL;
        }

        container.style.display = 'flex';
        playNoteReceivedSound();

        // Auto-hide after 4 seconds
        setTimeout(() => {
            container.style.display = 'none';
        }, 4000);

        // Click to dismiss
        container.onclick = () => {
            container.style.display = 'none';
        };
    }

    // Display drawing in chat
    function displayDrawingInChat(sender, dataURL, targetInfo) {
        const messagesContainer = $('chat-messages');
        if (!messagesContainer) return;

        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message drawing-message';

        const targetText = targetInfo === 'all' ? '(an alle)' :
                          targetInfo === 'dir' ? '(an dich)' :
                          `(an ${targetInfo})`;

        msgEl.innerHTML = `
            <div class="sender">${escapeHtml(sender)} ${targetText}</div>
            <img src="${dataURL}" class="chat-drawing" alt="Zeichnung">
        `;

        messagesContainer.appendChild(msgEl);
        scrollToBottom();
    }

    // Show chat panel
    function showChat() {
        const panel = $('chat-panel');
        if (panel) {
            panel.style.display = 'flex';
            chatVisible = true;
        }
    }

    // Hide chat panel
    function hideChat() {
        const panel = $('chat-panel');
        if (panel) {
            panel.style.display = 'none';
            chatVisible = false;
        }
    }

    // Send a message
    function sendMessage() {
        const input = $('chat-input');
        if (!input) return;

        const text = input.value.trim();
        if (!text) return;

        socket.emit('chat-message', text);
        input.value = '';
    }

    // Handle incoming chat broadcast
    function handleChatBroadcast({ playerName, text, timestamp }) {
        displayMessage({
            sender: playerName,
            text: text,
            timestamp: timestamp,
            isSystem: false
        });

        // TTS - speak the message with player's voice
        if (window.MaexchenTTS && playerName !== state.playerName) {
            window.MaexchenTTS.speakPlayerMessage(playerName, text);
        }
    }

    // Handle system messages
    function handleSystemMessage({ text, timestamp }) {
        displayMessage({
            sender: 'SYSTEM',
            text: text,
            timestamp: timestamp,
            isSystem: true
        });
    }

    // Display a message in the chat
    function displayMessage({ sender, text, timestamp, isSystem }) {
        const messagesContainer = $('chat-messages');
        if (!messagesContainer) return;

        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message' + (isSystem ? ' system' : '');

        const time = timestamp ? new Date(timestamp).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
        }) : '';

        msgEl.innerHTML = `
            <div class="sender">${escapeHtml(sender)}</div>
            <div class="text">${escapeHtml(text)}</div>
            ${time ? `<div class="timestamp">${time}</div>` : ''}
        `;

        messagesContainer.appendChild(msgEl);
        scrollToBottom();

        // Remove old messages if too many
        while (messagesContainer.children.length > 50) {
            messagesContainer.removeChild(messagesContainer.firstChild);
        }
    }

    // Add a local system message (not from server)
    function addLocalMessage(text) {
        displayMessage({
            sender: 'SYSTEM',
            text: text,
            timestamp: Date.now(),
            isSystem: true
        });
    }

    // Scroll chat to bottom
    function scrollToBottom() {
        const container = $('chat-messages');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    // Clear all messages
    function clearMessages() {
        const container = $('chat-messages');
        if (container) {
            container.innerHTML = '';
        }
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Shared AudioContext (reused across sound effects)
    let sharedAudioCtx = null;
    function getAudioCtx() {
        if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
            sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return sharedAudioCtx;
    }

    // Sound effects
    function playNoteSentSound() {
        try {
            const ctx = getAudioCtx();
            [400, 600, 800].forEach((freq, i) => {
                const startTime = ctx.currentTime + i * 0.06;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.1, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(startTime);
                osc.stop(startTime + 0.1);
            });
        } catch (e) {}
    }

    function playNoteReceivedSound() {
        try {
            const ctx = getAudioCtx();
            [600, 800, 1000, 800].forEach((freq, i) => {
                const startTime = ctx.currentTime + i * 0.08;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.12, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(startTime);
                osc.stop(startTime + 0.15);
            });
        } catch (e) {}
    }

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChat);
    } else {
        initChat();
    }

    // Public API
    window.MaexchenChat = {
        showChat,
        hideChat,
        sendMessage,
        displayMessage,
        addLocalMessage,
        clearMessages,
        scrollToBottom,
        openDrawingPanel
    };
})();
