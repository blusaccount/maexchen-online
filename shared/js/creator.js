// ============================
// PIXEL ART CHARACTER CREATOR - 16x16
// ============================

(function() {
    const $ = (window.MaexchenApp && window.MaexchenApp.$) || (id => document.getElementById(id));

    const GRID_SIZE = 16;
    const COLORS = [
        null,       // Eraser (transparent)
        '#00ff88', // Alien green
        '#00ffcc', // Cyan
        '#00aaff', // Blue
        '#aa00ff', // Purple
        '#ff00ff', // Magenta
        '#ff3366', // Red/Pink
        '#ffdd00', // Yellow
        '#ff6600', // Orange
        '#ffffff', // White
        '#888888', // Gray
        '#000000'  // Black
    ];

    // Current pixel grid (16x16, null = transparent)
    let pixels = createEmptyGrid();
    let selectedColor = 1; // Default: alien green
    let isDrawing = false;

    let onCompleteCallback = null;

    function createEmptyGrid() {
        return Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    }

    // Show character creator
    function showCreator(onComplete) {
        onCompleteCallback = onComplete;

        // Load saved character if exists
        loadSavedCharacter();

        createCreatorUI();
    }

    // Create the creator UI
    function createCreatorUI() {
        // Remove existing
        const existing = document.getElementById('character-creator');
        if (existing) existing.remove();

        const creator = document.createElement('div');
        creator.id = 'character-creator';

        creator.innerHTML = `
            <div class="creator-title">PIXEL ALIEN ERSTELLEN</div>
            <div class="creator-subtitle">16×16 Pixel Art</div>

            <div class="pixel-canvas-container">
                <div class="pixel-grid" id="pixel-grid"></div>
            </div>

            <div class="color-palette" id="color-palette"></div>

            <div class="creator-tools">
                <button class="btn btn-small" id="btn-clear">Löschen</button>
                <button class="btn btn-small" id="btn-fill">Füllen</button>
                <button class="btn btn-small" id="btn-random-alien">Zufällig</button>
            </div>

            <div class="creator-buttons">
                <button class="btn btn-primary" id="btn-confirm">Fertig!</button>
            </div>
        `;

        document.body.appendChild(creator);

        // Create pixel grid
        const grid = document.getElementById('pixel-grid');
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const cell = document.createElement('div');
                cell.className = 'pixel-cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                if (pixels[y][x]) {
                    cell.style.backgroundColor = pixels[y][x];
                }
                grid.appendChild(cell);
            }
        }

        // Create color palette
        const palette = document.getElementById('color-palette');
        COLORS.forEach((color, i) => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch' + (i === selectedColor ? ' selected' : '');
            if (i === 0) {
                swatch.innerHTML = '✕';
                swatch.classList.add('eraser');
            } else {
                swatch.style.backgroundColor = color;
            }
            swatch.dataset.index = i;
            palette.appendChild(swatch);
        });

        // Event listeners
        setupEventListeners(creator, grid, palette);
    }

    function setupEventListeners(creator, grid, palette) {
        // Drawing on grid
        grid.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('pixel-cell')) {
                isDrawing = true;
                paintCell(e.target);
            }
        });

        grid.addEventListener('mousemove', (e) => {
            if (isDrawing && e.target.classList.contains('pixel-cell')) {
                paintCell(e.target);
            }
        });

        document.addEventListener('mouseup', () => {
            isDrawing = false;
        });

        // Touch support
        grid.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const cell = document.elementFromPoint(touch.clientX, touch.clientY);
            if (cell && cell.classList.contains('pixel-cell')) {
                isDrawing = true;
                paintCell(cell);
            }
        });

        grid.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const cell = document.elementFromPoint(touch.clientX, touch.clientY);
            if (isDrawing && cell && cell.classList.contains('pixel-cell')) {
                paintCell(cell);
            }
        });

        grid.addEventListener('touchend', () => {
            isDrawing = false;
        });

        // Color selection
        palette.addEventListener('click', (e) => {
            const swatch = e.target.closest('.color-swatch');
            if (swatch) {
                selectedColor = parseInt(swatch.dataset.index);
                palette.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
                playSelectSound();
            }
        });

        // Tools
        document.getElementById('btn-clear').addEventListener('click', () => {
            pixels = createEmptyGrid();
            refreshGrid();
            playSelectSound();
        });

        document.getElementById('btn-fill').addEventListener('click', () => {
            const color = COLORS[selectedColor];
            for (let y = 0; y < GRID_SIZE; y++) {
                for (let x = 0; x < GRID_SIZE; x++) {
                    pixels[y][x] = color;
                }
            }
            refreshGrid();
            playSelectSound();
        });

        document.getElementById('btn-random-alien').addEventListener('click', () => {
            generateRandomAlien();
            refreshGrid();
            playConfirmSound();
        });

        document.getElementById('btn-confirm').addEventListener('click', confirm);
    }

    function paintCell(cell) {
        const x = parseInt(cell.dataset.x);
        const y = parseInt(cell.dataset.y);
        const color = COLORS[selectedColor];

        pixels[y][x] = color;

        if (color) {
            cell.style.backgroundColor = color;
        } else {
            cell.style.backgroundColor = '';
        }
    }

    function refreshGrid() {
        const cells = document.querySelectorAll('.pixel-cell');
        cells.forEach(cell => {
            const x = parseInt(cell.dataset.x);
            const y = parseInt(cell.dataset.y);
            const color = pixels[y][x];
            cell.style.backgroundColor = color || '';
        });
    }

    function generateRandomAlien() {
        pixels = createEmptyGrid();

        // Pick random colors
        const bodyColor = COLORS[1 + Math.floor(Math.random() * 5)]; // Green-purple range
        const eyeColor = COLORS[9]; // White
        const pupilColor = COLORS[11]; // Black

        // Generate symmetric alien (only draw left half, mirror to right)
        // Head shape (rows 2-6, symmetric)
        const headWidth = 3 + Math.floor(Math.random() * 3); // 3-5 pixels from center
        for (let y = 2; y <= 6; y++) {
            const rowWidth = headWidth - Math.abs(y - 4); // Oval shape
            for (let x = 8 - rowWidth; x < 8 + rowWidth; x++) {
                if (x >= 0 && x < 16) pixels[y][x] = bodyColor;
            }
        }

        // Eyes (row 4)
        const eyeOffset = 2 + Math.floor(Math.random() * 2);
        pixels[4][8 - eyeOffset] = eyeColor;
        pixels[4][8 + eyeOffset - 1] = eyeColor;
        pixels[5][8 - eyeOffset] = pupilColor;
        pixels[5][8 + eyeOffset - 1] = pupilColor;

        // Body (rows 7-12)
        for (let y = 7; y <= 12; y++) {
            const bodyWidth = 2 + Math.floor(Math.random() * 2);
            for (let x = 8 - bodyWidth; x < 8 + bodyWidth; x++) {
                pixels[y][x] = bodyColor;
            }
        }

        // Arms (row 9-10)
        const armLength = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < armLength; i++) {
            pixels[9][6 - i] = bodyColor;
            pixels[9][9 + i] = bodyColor;
        }

        // Legs (rows 13-15)
        pixels[13][7] = bodyColor;
        pixels[13][8] = bodyColor;
        pixels[14][6] = bodyColor;
        pixels[14][9] = bodyColor;
        pixels[15][5] = bodyColor;
        pixels[15][10] = bodyColor;

        // Random antenna or accessory
        if (Math.random() > 0.5) {
            pixels[1][7] = bodyColor;
            pixels[1][8] = bodyColor;
            pixels[0][7] = COLORS[7]; // Yellow tip
            pixels[0][8] = COLORS[7];
        }
    }

    function confirm() {
        // Save to localStorage
        localStorage.setItem('stricthotel-character', JSON.stringify(pixels));

        // Close creator
        const creator = document.getElementById('character-creator');
        if (creator) creator.remove();

        // Callback
        if (onCompleteCallback) {
            onCompleteCallback();
        }

        playConfirmSound();
    }

    // Render pixels to a canvas and return as data URL
    function renderToDataURL(size = 32) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const pixelSize = size / GRID_SIZE;

        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (pixels[y][x]) {
                    ctx.fillStyle = pixels[y][x];
                    ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
                }
            }
        }

        return canvas.toDataURL();
    }

    // Render to a canvas element
    function renderToCanvas(canvas, size = 32) {
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        const pixelSize = size / GRID_SIZE;

        ctx.clearRect(0, 0, size, size);

        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (pixels[y][x]) {
                    ctx.fillStyle = pixels[y][x];
                    ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
                }
            }
        }
    }

    // Get character data for network transfer
    function getCharacter() {
        return {
            pixels: pixels,
            dataURL: renderToDataURL(64)
        };
    }

    // Load saved character
    function loadSavedCharacter() {
        const saved = localStorage.getItem('stricthotel-character');
        if (saved) {
            try {
                pixels = JSON.parse(saved);
                return true;
            } catch (e) {
                pixels = createEmptyGrid();
            }
        }
        return false;
    }

    // Check if character was created
    function hasCharacter() {
        const saved = localStorage.getItem('stricthotel-character');
        if (!saved) return false;

        try {
            const p = JSON.parse(saved);
            // Check if any pixel is set
            return p.some(row => row.some(cell => cell !== null));
        } catch (e) {
            return false;
        }
    }

    // Get display for avatar views (returns data URL)
    function getAvatarDisplay() {
        return renderToDataURL(96);
    }

    // Sound effects
    function playSelectSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = 800 + Math.random() * 400;
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.05);
        } catch (e) {}
    }

    function playConfirmSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            [523, 659, 784].forEach((freq, i) => {
                setTimeout(() => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'square';
                    osc.frequency.value = freq;
                    gain.gain.setValueAtTime(0.08, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.15);
                }, i * 80);
            });
        } catch (e) {}
    }

    // Public API
    const api = {
        showCreator,
        getAvatarDisplay,
        getCharacter,
        loadSavedCharacter,
        hasCharacter,
        renderToCanvas,
        renderToDataURL,
        COLORS
    };
    window.MaexchenCreator = api;
    window.StrictHotelCreator = api;
})();
