// ============================
// STRICTHOTEL LOBBY - Pictochat
// ============================

(function () {
    'use strict';

    var lobby = window.StrictHotelLobby || {};
    var socket = lobby.socket || window.StrictHotelLobbySocket || null;
    if (!socket) return;

    var panel = document.getElementById('pictochat-panel');
    if (!panel) return;

    var canvas = document.getElementById('picto-canvas');
    var preview = document.getElementById('picto-preview');
    var cursorsLayer = document.getElementById('picto-cursors');
    var palette = document.getElementById('picto-palette');
    var sizeInput = document.getElementById('picto-size');
    var statusEl = document.getElementById('picto-status');
    var chatMessages = document.getElementById('picto-chat-messages');
    var chatInput = document.getElementById('picto-chat-input');
    var chatSend = document.getElementById('picto-chat-send');

    var toolButtons = panel.querySelectorAll('.picto-tool');

    var COLORS = [
        '#111111',
        '#ff3366',
        '#ffdd00',
        '#00aaff',
        '#00ff88',
        '#ffffff',
        '#ff8800',
        '#9b6a3f'
    ];

    var strokes = [];
    var undoStack = [];
    var redoStack = [];

    var currentTool = 'pen';
    var currentColor = COLORS[1];
    var currentSize = parseInt(sizeInput && sizeInput.value, 10) || 4;

    var ctx = canvas.getContext('2d');
    var previewCtx = preview.getContext('2d');

    var canvasSize = { width: 1, height: 1 };
    var isDrawing = false;
    var currentStroke = null;
    var pendingPoints = [];
    var sendTimer = null;
    var lastPoint = null;
    var shapeStart = null;
    var strokeIdCounter = 0;
    var inProgress = {};
    var cursors = {};
    var lastCursorSent = 0;

    function updateStatus(text) {
        if (statusEl) statusEl.textContent = text;
    }

    function getName() {
        if (lobby.getName) return lobby.getName();
        var input = document.getElementById('input-name');
        if (input && input.value.trim()) return input.value.trim();
        return localStorage.getItem('stricthotel-name') || '';
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function colorFromName(name) {
        var hash = 0;
        for (var i = 0; i < name.length; i++) {
            hash = (hash << 5) - hash + name.charCodeAt(i);
            hash |= 0;
        }
        var hue = Math.abs(hash) % 360;
        return 'hsl(' + hue + ', 70%, 45%)';
    }

    function makeStrokeId() {
        strokeIdCounter += 1;
        return socket.id + '-' + Date.now() + '-' + strokeIdCounter;
    }

    function clamp01(n) {
        if (n < 0) return 0;
        if (n > 1) return 1;
        return n;
    }

    function normPointFromEvent(e) {
        var rect = canvas.getBoundingClientRect();
        return {
            x: clamp01((e.clientX - rect.left) / rect.width),
            y: clamp01((e.clientY - rect.top) / rect.height)
        };
    }

    function toCanvasPoint(p) {
        return { x: p.x * canvasSize.width, y: p.y * canvasSize.height };
    }

    function resizeCanvas() {
        var rect = canvas.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;

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
    }

    function clearCanvas(context) {
        context.clearRect(0, 0, canvasSize.width, canvasSize.height);
    }

    function applyStrokeStyle(context, stroke) {
        context.lineWidth = stroke.size;
        context.strokeStyle = stroke.color;
        context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    }

    function drawStrokeSegment(context, stroke, points) {
        if (points.length < 2) return;
        applyStrokeStyle(context, stroke);
        context.beginPath();
        var start = toCanvasPoint(points[0]);
        context.moveTo(start.x, start.y);
        for (var i = 1; i < points.length; i++) {
            var p = toCanvasPoint(points[i]);
            context.lineTo(p.x, p.y);
        }
        context.stroke();
        context.globalCompositeOperation = 'source-over';
    }

    function drawDot(context, stroke, point) {
        applyStrokeStyle(context, stroke);
        var p = toCanvasPoint(point);
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
    }

    function drawStroke(context, stroke) {
        if (stroke.points && stroke.points.length > 1) {
            drawStrokeSegment(context, stroke, stroke.points);
        } else if (stroke.points && stroke.points.length === 1) {
            drawDot(context, stroke, stroke.points[0]);
        }
    }

    function drawShape(context, stroke) {
        applyStrokeStyle(context, stroke);
        var start = toCanvasPoint(stroke.start);
        var end = toCanvasPoint(stroke.end);
        context.beginPath();
        if (stroke.tool === 'line') {
            context.moveTo(start.x, start.y);
            context.lineTo(end.x, end.y);
        } else if (stroke.tool === 'rect') {
            var x = Math.min(start.x, end.x);
            var y = Math.min(start.y, end.y);
            var w = Math.abs(end.x - start.x);
            var h = Math.abs(end.y - start.y);
            context.rect(x, y, w, h);
        } else if (stroke.tool === 'circle') {
            var cx = (start.x + end.x) / 2;
            var cy = (start.y + end.y) / 2;
            var rx = Math.abs(end.x - start.x) / 2;
            var ry = Math.abs(end.y - start.y) / 2;
            var r = Math.max(2, Math.min(rx, ry));
            context.arc(cx, cy, r, 0, Math.PI * 2);
        }
        context.stroke();
        context.globalCompositeOperation = 'source-over';
    }

    function renderPage() {
        clearCanvas(ctx);
        clearCanvas(previewCtx);
        for (var i = 0; i < strokes.length; i++) {
            var stroke = strokes[i];
            if (stroke.points) {
                drawStroke(ctx, stroke);
            } else if (stroke.start) {
                drawShape(ctx, stroke);
            }
        }
    }

    function setActiveTool(tool) {
        currentTool = tool;
        for (var i = 0; i < toolButtons.length; i++) {
            var btn = toolButtons[i];
            if (btn.dataset.tool) {
                btn.classList.toggle('active', btn.dataset.tool === tool);
            }
        }
    }

    function queueSend() {
        if (sendTimer) return;
        sendTimer = setTimeout(function () {
            sendTimer = null;
            flushPending();
        }, 40);
    }

    function flushPending() {
        if (!pendingPoints.length || !currentStroke) return;
        var batch = pendingPoints.slice(0);
        pendingPoints.length = 0;
        socket.emit('picto-stroke-segment', {
            strokeId: currentStroke.id,
            tool: currentStroke.tool,
            color: currentStroke.color,
            size: currentStroke.size,
            points: batch
        });
    }

    function startStroke(point) {
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
    }

    function continueStroke(point) {
        if (!currentStroke || !isDrawing) return;
        var dx = point.x - lastPoint.x;
        var dy = point.y - lastPoint.y;
        if ((dx * dx + dy * dy) < 0.00001) return;

        drawStrokeSegment(ctx, currentStroke, [lastPoint, point]);
        pendingPoints.push(point);
        lastPoint = point;
        queueSend();
    }

    function endStroke() {
        if (!currentStroke) return;
        flushPending();
        socket.emit('picto-stroke-end', {
            strokeId: currentStroke.id
        });
        currentStroke = null;
        isDrawing = false;
        lastPoint = null;
    }

    function startShape(point) {
        isDrawing = true;
        shapeStart = point;
    }

    function updateShape(point) {
        if (!shapeStart) return;
        clearCanvas(previewCtx);
        var shapeStroke = {
            tool: currentTool,
            color: currentColor,
            size: currentSize,
            start: shapeStart,
            end: point
        };
        drawShape(previewCtx, shapeStroke);
    }

    function endShape(point) {
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
        isDrawing = false;
    }

    function sendCursor(point) {
        var now = Date.now();
        if (now - lastCursorSent < 40) return;
        lastCursorSent = now;
        socket.emit('picto-cursor', {
            x: point.x,
            y: point.y
        });
    }

    function hideCursor() {
        socket.emit('picto-cursor-hide');
    }

    function appendMessage(payload) {
        if (!chatMessages) return;
        var item = document.createElement('div');
        item.className = 'picto-chat-message';
        var name = escapeHtml(payload.name || 'Anon');
        var text = escapeHtml(payload.text || '');
        item.innerHTML = '<span class="name">' + name + '</span>' + text;
        chatMessages.appendChild(item);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        var items = chatMessages.querySelectorAll('.picto-chat-message');
        if (items.length > 80) {
            items[0].remove();
        }
    }

    function setupPalette() {
        if (!palette) return;
        palette.innerHTML = '';
        COLORS.forEach(function (color, index) {
            var swatch = document.createElement('div');
            swatch.className = 'picto-swatch' + (index === 1 ? ' active' : '');
            swatch.style.background = color;
            swatch.dataset.color = color;
            swatch.addEventListener('click', function () {
                var swatches = palette.querySelectorAll('.picto-swatch');
                for (var i = 0; i < swatches.length; i++) {
                    swatches[i].classList.remove('active');
                }
                swatch.classList.add('active');
                currentColor = color;
            });
            palette.appendChild(swatch);
        });
    }

    function setupTools() {
        for (var i = 0; i < toolButtons.length; i++) {
            toolButtons[i].addEventListener('click', function () {
                var tool = this.dataset.tool;
                var action = this.dataset.action;
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
    }

    function setupChat() {
        if (chatSend) {
            chatSend.addEventListener('click', function () {
                var text = chatInput.value.trim();
                if (!text) return;
                socket.emit('picto-message', text);
                chatInput.value = '';
            });
        }

        if (chatInput) {
            chatInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    chatSend.click();
                }
            });
        }
    }

    function setupCanvas() {
        if (!canvas) return;
        canvas.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            var point = normPointFromEvent(e);
            canvas.setPointerCapture(e.pointerId);
            if (currentTool === 'pen' || currentTool === 'eraser') {
                startStroke(point);
            } else {
                startShape(point);
            }
        });

        canvas.addEventListener('pointermove', function (e) {
            var point = normPointFromEvent(e);
            sendCursor(point);
            if (!isDrawing) return;
            if (currentTool === 'pen' || currentTool === 'eraser') {
                continueStroke(point);
            } else {
                updateShape(point);
            }
        });

        canvas.addEventListener('pointerup', function (e) {
            if (!isDrawing) return;
            var point = normPointFromEvent(e);
            if (currentTool === 'pen' || currentTool === 'eraser') {
                endStroke();
            } else {
                endShape(point);
            }
        });

        canvas.addEventListener('pointerleave', function () {
            hideCursor();
            if (isDrawing && (currentTool === 'pen' || currentTool === 'eraser')) {
                endStroke();
            } else if (isDrawing) {
                clearCanvas(previewCtx);
                shapeStart = null;
                isDrawing = false;
            }
        });

        canvas.addEventListener('pointercancel', function () {
            hideCursor();
            if (isDrawing && (currentTool === 'pen' || currentTool === 'eraser')) {
                endStroke();
            } else if (isDrawing) {
                clearCanvas(previewCtx);
                shapeStart = null;
                isDrawing = false;
            }
        });
    }

    function renderCursor(data) {
        if (!cursorsLayer) return;

        var cursor = cursors[data.id];
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.className = 'picto-cursor';
            var dot = document.createElement('span');
            dot.className = 'picto-cursor-dot';
            cursor.appendChild(dot);
            var label = document.createElement('span');
            label.textContent = data.name || 'Anon';
            cursor.appendChild(label);
            cursor.style.color = colorFromName(data.name || '');
            cursorsLayer.appendChild(cursor);
            cursors[data.id] = cursor;
        }

        var x = data.x * canvasSize.width;
        var y = data.y * canvasSize.height;
        cursor.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    }

    function removeCursor(id) {
        if (!cursors[id]) return;
        cursors[id].remove();
        delete cursors[id];
    }

    function bindSocket() {
        socket.on('connect', function () {
            updateStatus('Connected');
            socket.emit('picto-join');
        });

        socket.on('disconnect', function () {
            updateStatus('Offline');
        });

        socket.on('picto-state', function (data) {
            if (!data) return;
            strokes = Array.isArray(data.strokes) ? data.strokes : [];
            renderPage();
            updateStatus('Ready');
        });

        socket.on('picto-stroke-segment', function (data) {
            if (!data) return;
            var stroke = inProgress[data.strokeId];
            if (!stroke) {
                stroke = {
                    tool: data.tool,
                    color: data.color,
                    size: data.size
                };
                inProgress[data.strokeId] = stroke;
            }
            var points = data.points || [];
            if (points.length === 1) {
                drawDot(ctx, stroke, points[0]);
            } else {
                drawStrokeSegment(ctx, stroke, points);
            }
        });

        socket.on('picto-stroke-commit', function (data) {
            if (!data) return;
            var stroke = {
                strokeId: data.strokeId,
                authorId: data.authorId,
                tool: data.tool,
                color: data.color,
                size: data.size,
                points: data.points || []
            };

            strokes.push(stroke);

            if (data.authorId === socket.id) {
                undoStack.push(data.strokeId);
                redoStack.length = 0;
            }

            if (!inProgress[data.strokeId]) {
                drawStroke(ctx, stroke);
            }
            delete inProgress[data.strokeId];
        });

        socket.on('picto-shape', function (data) {
            if (!data) return;
            var stroke = {
                strokeId: data.strokeId,
                authorId: data.authorId,
                tool: data.tool,
                color: data.color,
                size: data.size,
                start: data.start,
                end: data.end
            };
            strokes.push(stroke);
            drawShape(ctx, stroke);
        });

        socket.on('picto-undo', function (data) {
            if (!data) return;
            strokes = strokes.filter(function (s) {
                return s.strokeId !== data.strokeId;
            });
            renderPage();
            if (data.byId === socket.id) {
                undoStack.pop();
                redoStack.push(data.strokeId);
            }
        });

        socket.on('picto-redo', function (data) {
            if (!data || !data.stroke) return;
            strokes.push(data.stroke);
            if (data.stroke.points) {
                drawStroke(ctx, data.stroke);
            } else if (data.stroke.start) {
                drawShape(ctx, data.stroke);
            }
            if (data.byId === socket.id) {
                redoStack.pop();
                undoStack.push(data.stroke.strokeId);
            }
        });

        socket.on('picto-clear', function (data) {
            if (!data) return;
            strokes = [];
            renderPage();
            if (data.byId === socket.id) {
                undoStack.length = 0;
                redoStack.length = 0;
            }
        });

        socket.on('picto-cursor', function (data) {
            if (!data) return;
            renderCursor(data);
        });

        socket.on('picto-cursor-hide', function (data) {
            if (!data) return;
            removeCursor(data.id);
        });

        socket.on('picto-message', function (data) {
            appendMessage(data || {});
        });
    }

    setupPalette();
    setupTools();
    setupChat();
    setupCanvas();
    resizeCanvas();
    setActiveTool(currentTool);
    bindSocket();

    if (socket.connected) {
        updateStatus('Connected');
        socket.emit('picto-join');
    }
})();
