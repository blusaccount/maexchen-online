// ============================
// STRICTHOTEL LOBBY - Pictochat
// ============================

(function () {
    'use strict';

    const lobby = window.StrictHotelLobby || {};
    const socket = lobby.socket || window.StrictHotelLobbySocket || null;
    if (!socket) return;

    const panel = document.getElementById('pictochat-panel');
    if (!panel) return;

    const canvas = document.getElementById('picto-canvas');
    const preview = document.getElementById('picto-preview');
    const cursorsLayer = document.getElementById('picto-cursors');
    const palette = document.getElementById('picto-palette');
    const sizeInput = document.getElementById('picto-size');
    const statusEl = document.getElementById('picto-status');
    const chatMessages = document.getElementById('picto-chat-messages');
    const chatInput = document.getElementById('picto-chat-input');
    const chatSend = document.getElementById('picto-chat-send');

    const toolButtons = panel.querySelectorAll('.picto-tool');

    const COLORS = [
        '#111111',
        '#ff3366',
        '#ffdd00',
        '#00aaff',
        '#00ff88',
        '#ffffff',
        '#ff8800',
        '#9b6a3f'
    ];

    let strokes = [];
    const undoStack = [];
    const redoStack = [];

    let currentTool = 'pen';
    let currentColor = COLORS[1];
    let currentSize = parseInt(sizeInput && sizeInput.value, 10) || 4;

    const ctx = canvas.getContext('2d');
    const previewCtx = preview.getContext('2d');

    const canvasSize = { width: 1, height: 1 };
    let isDrawing = false;
    let currentStroke = null;
    const pendingPoints = [];
    let sendTimer = null;
    let lastPoint = null;
    let shapeStart = null;
    let shapeEnd = null;
    let strokeIdCounter = 0;
    const inProgress = {};
    const cursors = {};
    let lastCursorSent = 0;

    const updateStatus = (text) => {
        if (statusEl) statusEl.textContent = text;
    };

    const getName = () => {
        if (lobby.getName) return lobby.getName();
        const input = document.getElementById('input-name');
        if (input && input.value.trim()) return input.value.trim();
        return window.StrictHotelSocket.getPlayerName();
    };

    const escapeHtml = window.StrictHotelSocket.escapeHtml;

    const colorFromName = (name) => {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = (hash << 5) - hash + name.charCodeAt(i);
            hash |= 0;
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 70%, 45%)`;
    };

    const makeStrokeId = () => {
        strokeIdCounter += 1;
        return `${socket.id}-${Date.now()}-${strokeIdCounter}`;
    };

    const clamp01 = (n) => {
        if (n < 0) return 0;
        if (n > 1) return 1;
        return n;
    };

    const normPointFromEvent = (e) => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: clamp01((e.clientX - rect.left) / rect.width),
            y: clamp01((e.clientY - rect.top) / rect.height)
        };
    };

    const toCanvasPoint = (p) => {
        return { x: p.x * canvasSize.width, y: p.y * canvasSize.height };
    };

    const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        preview.width = canvas.width;
        preview.height = canvas.height;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        previewCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        previewCtx.lineCap = 'round';
        previewCtx.lineJoin = 'round';

        canvasSize.width = rect.width;
        canvasSize.height = rect.height;

        renderPage();
    };

    const clearCanvas = (context) => {
        context.clearRect(0, 0, canvasSize.width, canvasSize.height);
    };

    const applyStrokeStyle = (context, stroke) => {
        context.lineWidth = stroke.size;
        context.strokeStyle = stroke.color;
        context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    };

    const drawStrokeSegment = (context, stroke, points) => {
        if (points.length < 2) return;
        applyStrokeStyle(context, stroke);
        context.beginPath();
        const start = toCanvasPoint(points[0]);
        context.moveTo(start.x, start.y);
        for (let i = 1; i < points.length; i++) {
            const p = toCanvasPoint(points[i]);
            context.lineTo(p.x, p.y);
        }
        context.stroke();
        context.globalCompositeOperation = 'source-over';
    };

    const drawDot = (context, stroke, point) => {
        applyStrokeStyle(context, stroke);
        const p = toCanvasPoint(point);
        context.beginPath();
        context.arc(p.x, p.y, Math.max(1, stroke.size / 2), 0, Math.PI * 2);
        if (stroke.tool === 'eraser') {
            context.fillStyle = 'rgba(0,0,0,1)';
            context.fill();
            context.globalCompositeOperation = 'source-over';
            return;
        }
        context.fillStyle = stroke.color;
        context.fill();
        context.globalCompositeOperation = 'source-over';
    };

    const drawStroke = (context, stroke) => {
        if (stroke.points && stroke.points.length > 1) {
            drawStrokeSegment(context, stroke, stroke.points);
        } else if (stroke.points && stroke.points.length === 1) {
            drawDot(context, stroke, stroke.points[0]);
        }
    };

    const drawShape = (context, stroke) => {
        applyStrokeStyle(context, stroke);
        const start = toCanvasPoint(stroke.start);
        const end = toCanvasPoint(stroke.end);
        context.beginPath();
        if (stroke.tool === 'line') {
            context.moveTo(start.x, start.y);
            context.lineTo(end.x, end.y);
        } else if (stroke.tool === 'rect') {
            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            const w = Math.abs(end.x - start.x);
            const h = Math.abs(end.y - start.y);
            context.rect(x, y, w, h);
        } else if (stroke.tool === 'circle') {
            const cx = (start.x + end.x) / 2;
            const cy = (start.y + end.y) / 2;
            const rx = Math.abs(end.x - start.x) / 2;
            const ry = Math.abs(end.y - start.y) / 2;
            const r = Math.max(2, Math.min(rx, ry));
            context.arc(cx, cy, r, 0, Math.PI * 2);
        }
        context.stroke();
        context.globalCompositeOperation = 'source-over';
    };

    const renderPage = () => {
        clearCanvas(ctx);
        clearCanvas(previewCtx);
        for (let i = 0; i < strokes.length; i++) {
            const stroke = strokes[i];
            if (stroke.points) {
                drawStroke(ctx, stroke);
            } else if (stroke.start) {
                drawShape(ctx, stroke);
            }
        }
    };

    const strokeFromPayload = (data) => {
        if (!data) return null;
        const stroke = {
            strokeId: data.strokeId,
            authorId: data.authorId,
            tool: data.tool,
            color: data.color,
            size: data.size
        };
        if (data.points) {
            stroke.points = data.points || [];
        } else if (data.start && data.end) {
            stroke.start = data.start;
            stroke.end = data.end;
        }
        return stroke;
    };

    const applyStroke = (stroke, renderNow) => {
        if (!stroke) return;
        strokes.push(stroke);
        if (renderNow) {
            if (stroke.points) {
                drawStroke(ctx, stroke);
            } else if (stroke.start) {
                drawShape(ctx, stroke);
            }
        }
    };

    const setActiveTool = (tool) => {
        currentTool = tool;
        for (let i = 0; i < toolButtons.length; i++) {
            const btn = toolButtons[i];
            if (btn.dataset.tool) {
                btn.classList.toggle('active', btn.dataset.tool === tool);
            }
        }
    };

    const queueSend = () => {
        if (sendTimer) return;
        sendTimer = setTimeout(() => {
            sendTimer = null;
            flushPending();
        }, 40);
    };

    const flushPending = () => {
        if (!pendingPoints.length || !currentStroke) return;
        const batch = pendingPoints.slice(0);
        pendingPoints.length = 0;
        socket.emit('picto-stroke-segment', {
            strokeId: currentStroke.id,
            tool: currentStroke.tool,
            color: currentStroke.color,
            size: currentStroke.size,
            points: batch
        });
    };

    const startStroke = (point) => {
        isDrawing = true;
        currentStroke = {
            id: makeStrokeId(),
            tool: currentTool,
            color: currentColor,
            size: currentSize
        };
        pendingPoints.length = 0;
        lastPoint = null;

        pendingPoints.push(point);
        drawDot(ctx, currentStroke, point);
        lastPoint = point;
        queueSend();
    };

    const continueStroke = (point) => {
        if (!currentStroke || !isDrawing) return;
        const dx = point.x - lastPoint.x;
        const dy = point.y - lastPoint.y;
        if ((dx * dx + dy * dy) < 0.00001) return;

        drawStrokeSegment(ctx, currentStroke, [lastPoint, point]);
        pendingPoints.push(point);
        lastPoint = point;
        queueSend();
    };

    const endStroke = () => {
        if (!currentStroke) return;
        flushPending();
        socket.emit('picto-stroke-end', {
            strokeId: currentStroke.id
        });
        currentStroke = null;
        isDrawing = false;
        lastPoint = null;
    };

    const startShape = (point) => {
        isDrawing = true;
        shapeStart = point;
        shapeEnd = point;
    };

    const updateShape = (point) => {
        if (!shapeStart) return;
        shapeEnd = point;
        clearCanvas(previewCtx);
        const shapeStroke = {
            tool: currentTool,
            color: currentColor,
            size: currentSize,
            start: shapeStart,
            end: point
        };
        drawShape(previewCtx, shapeStroke);
    };

    const endShape = (point) => {
        if (!shapeStart) return;
        clearCanvas(previewCtx);
        socket.emit('picto-shape', {
            tool: currentTool,
            color: currentColor,
            size: currentSize,
            start: shapeStart,
            end: point
        });
        shapeStart = null;
        shapeEnd = null;
        isDrawing = false;
    };

    const sendCursor = (point) => {
        const now = Date.now();
        if (now - lastCursorSent < 40) return;
        lastCursorSent = now;
        socket.emit('picto-cursor', {
            x: point.x,
            y: point.y
        });
    };

    const hideCursor = () => {
        socket.emit('picto-cursor-hide');
    };

    const appendMessage = (payload) => {
        if (!chatMessages) return;
        const item = document.createElement('div');
        item.className = 'picto-chat-message';
        const name = escapeHtml(payload.name || 'Anon');
        const text = escapeHtml(payload.text || '');
        item.innerHTML = `<span class="name">${name}</span>${text}`;
        chatMessages.appendChild(item);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        const items = chatMessages.querySelectorAll('.picto-chat-message');
        if (items.length > 80) {
            items[0].remove();
        }
    };

    const setupPalette = () => {
        if (!palette) return;
        palette.innerHTML = '';
        COLORS.forEach((color, index) => {
            const swatch = document.createElement('div');
            swatch.className = `picto-swatch${index === 1 ? ' active' : ''}`;
            swatch.style.background = color;
            swatch.dataset.color = color;
            swatch.addEventListener('click', () => {
                const swatches = palette.querySelectorAll('.picto-swatch');
                for (let i = 0; i < swatches.length; i++) {
                    swatches[i].classList.remove('active');
                }
                swatch.classList.add('active');
                currentColor = color;
            });
            palette.appendChild(swatch);
        });
    };

    const setupTools = () => {
        for (let i = 0; i < toolButtons.length; i++) {
            toolButtons[i].addEventListener('click', function () {
                const tool = this.dataset.tool;
                const action = this.dataset.action;
                if (tool) {
                    setActiveTool(tool);
                } else if (action === 'undo') {
                    if (!undoStack.length) return;
                    socket.emit('picto-undo', {
                        strokeId: undoStack[undoStack.length - 1]
                    });
                } else if (action === 'redo') {
                    if (!redoStack.length) return;
                    socket.emit('picto-redo');
                } else if (action === 'clear') {
                    socket.emit('picto-clear');
                }
            });
        }
    };

    const setupChat = () => {
        if (chatSend) {
            chatSend.addEventListener('click', () => {
                const text = chatInput.value.trim();
                if (!text) return;
                socket.emit('picto-message', text);
                chatInput.value = '';
            });
        }

        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    chatSend.click();
                }
            });
        }
    };

    const setupCanvas = () => {
        if (!canvas) return;
        canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (e.button !== 0) return;
            const point = normPointFromEvent(e);
            canvas.setPointerCapture(e.pointerId);
            if (currentTool === 'pen' || currentTool === 'eraser') {
                startStroke(point);
            } else {
                startShape(point);
            }
        });

        canvas.addEventListener('pointermove', (e) => {
            e.preventDefault();
            const point = normPointFromEvent(e);
            if (!isDrawing) sendCursor(point);
            if (!isDrawing) return;
            if (currentTool === 'pen' || currentTool === 'eraser') {
                continueStroke(point);
            } else {
                updateShape(point);
            }
        });

        canvas.addEventListener('pointerup', (e) => {
            if (!isDrawing) return;
            const point = normPointFromEvent(e);
            if (currentTool === 'pen' || currentTool === 'eraser') {
                endStroke();
            } else {
                endShape(point);
            }
        });

        canvas.addEventListener('pointerleave', () => {
            hideCursor();
            if (isDrawing && (currentTool === 'pen' || currentTool === 'eraser')) {
                endStroke();
            }
        });

        canvas.addEventListener('pointercancel', () => {
            hideCursor();
            if (isDrawing && (currentTool === 'pen' || currentTool === 'eraser')) {
                endStroke();
            } else if (isDrawing) {
                if (shapeEnd) {
                    endShape(shapeEnd);
                } else {
                    clearCanvas(previewCtx);
                    shapeStart = null;
                    shapeEnd = null;
                    isDrawing = false;
                }
            }
        });
    };

    const renderCursor = (data) => {
        if (!cursorsLayer) return;

        let cursor = cursors[data.id];
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.className = 'picto-cursor';
            const dot = document.createElement('span');
            dot.className = 'picto-cursor-dot';
            cursor.appendChild(dot);
            const label = document.createElement('span');
            label.textContent = data.name || 'Anon';
            cursor.appendChild(label);
            cursor.style.color = colorFromName(data.name || '');
            cursorsLayer.appendChild(cursor);
            cursors[data.id] = cursor;
        }

        const x = data.x * canvasSize.width;
        const y = data.y * canvasSize.height;
        cursor.style.transform = `translate(${x}px, ${y}px)`;
    };

    const removeCursor = (id) => {
        if (!cursors[id]) return;
        cursors[id].remove();
        delete cursors[id];
    };

    const bindSocket = () => {
        socket.on('connect', () => {
            updateStatus('Connected');
            socket.emit('picto-join');
        });

        socket.on('disconnect', () => {
            updateStatus('Offline');
        });

        socket.on('picto-state', (data) => {
            if (!data) return;
            strokes = Array.isArray(data.strokes) ? data.strokes : [];
            undoStack.length = 0;
            redoStack.length = 0;
            renderPage();
            updateStatus('Ready');

            // Replay persisted messages
            if (Array.isArray(data.messages)) {
                for (let i = 0; i < data.messages.length; i++) {
                    appendMessage(data.messages[i]);
                }
            }
        });

        socket.on('picto-stroke-segment', (data) => {
            if (!data) return;
            let stroke = inProgress[data.strokeId];
            if (!stroke) {
                stroke = {
                    tool: data.tool,
                    color: data.color,
                    size: data.size,
                    lastPoint: null
                };
                inProgress[data.strokeId] = stroke;
            }
            const points = data.points || [];
            if (points.length === 0) return;
            if (points.length === 1 && !stroke.lastPoint) {
                drawDot(ctx, stroke, points[0]);
            } else {
                // Prepend lastPoint to connect consecutive batches
                const draw = stroke.lastPoint ? [stroke.lastPoint].concat(points) : points;
                drawStrokeSegment(ctx, stroke, draw);
            }
            stroke.lastPoint = points[points.length - 1];
        });

        socket.on('picto-stroke-commit', (data) => {
            if (!data) return;
            const stroke = strokeFromPayload(data);
            applyStroke(stroke, !inProgress[data.strokeId]);

            if (data.authorId === socket.id) {
                undoStack.push(data.strokeId);
                redoStack.length = 0;
            }

            delete inProgress[data.strokeId];
        });

        socket.on('picto-shape', (data) => {
            if (!data) return;
            const stroke = strokeFromPayload(data);
            applyStroke(stroke, true);
            if (data.authorId === socket.id) {
                undoStack.push(data.strokeId);
                redoStack.length = 0;
            }
        });

        socket.on('picto-undo', (data) => {
            if (!data) return;
            strokes = strokes.filter((s) => s.strokeId !== data.strokeId);
            renderPage();
            if (data.byId === socket.id) {
                undoStack.pop();
                redoStack.push(data.strokeId);
            }
        });

        socket.on('picto-redo', (data) => {
            if (!data || !data.stroke) return;
            applyStroke(data.stroke, true);
            if (data.byId === socket.id) {
                redoStack.pop();
                undoStack.push(data.stroke.strokeId);
            }
        });

        socket.on('picto-clear', (data) => {
            if (!data) return;
            strokes = [];
            undoStack.length = 0;
            redoStack.length = 0;
            renderPage();
        });

        socket.on('picto-cursor', (data) => {
            if (!data) return;
            renderCursor(data);
        });

        socket.on('picto-cursor-hide', (data) => {
            if (!data) return;
            removeCursor(data.id);
        });

        socket.on('picto-message', (data) => {
            appendMessage(data || {});
        });
    };

    if (sizeInput) {
        sizeInput.addEventListener('input', () => {
            currentSize = parseInt(sizeInput.value, 10) || 4;
        });
    }

    setupPalette();
    setupTools();
    setupChat();
    setupCanvas();
    resizeCanvas();
    setActiveTool(currentTool);
    bindSocket();

    // Re-render on window resize
    window.addEventListener('resize', resizeCanvas);

    if (socket.connected) {
        updateStatus('Connected');
        socket.emit('picto-join');
    }
})();
