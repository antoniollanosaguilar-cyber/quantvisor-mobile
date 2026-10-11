/**
 * Motor de Dibujo Vectorial Completo estilo TradingView (Versión 7)
 * Sincroniza un Canvas HTML5 2D transparente sobre Lightweight Charts
 * Incluye selección interactiva, edición por arrastre de anclas/dibujos, borrado individual,
 * modal editable de parámetros y ETIQUETAS FLOTANTES INTERACTIVAS EN EL GRÁFICO (Stop, PyG/Cantidad, Target).
 */

function formatPrice(price) {
    if (price === undefined || price === null || isNaN(price)) return '0.00';
    const absP = Math.abs(price);
    if (absP === 0) return '0.00';
    if (absP < 0.0001) return price.toFixed(8);
    if (absP < 0.01) return price.toFixed(6);
    if (absP < 1) return price.toFixed(4);
    return price.toFixed(2);
}

window.DrawingEngine = class DrawingEngine {
    constructor(containerId, chart, mainSeries) {
        this.container = document.getElementById(containerId);
        this.chart = chart;
        this.mainSeries = mainSeries;
        this.candles = [];
        
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.zIndex = '25';
        this.canvas.style.pointerEvents = 'none';
        if (this.container) this.container.appendChild(this.canvas);

        // Contenedor HTML para etiquetas flotantes editables (Posición Larga / Corta)
        this.positionOverlaysContainer = document.createElement('div');
        this.positionOverlaysContainer.id = 'position-overlays-container';
        this.positionOverlaysContainer.style.position = 'absolute';
        this.positionOverlaysContainer.style.top = '0';
        this.positionOverlaysContainer.style.left = '0';
        this.positionOverlaysContainer.style.width = '100%';
        this.positionOverlaysContainer.style.height = '100%';
        this.positionOverlaysContainer.style.pointerEvents = 'none';
        this.positionOverlaysContainer.style.zIndex = '28';
        if (this.container) this.container.appendChild(this.positionOverlaysContainer);
        
        this.ctx = this.canvas.getContext('2d');
        this.drawings = [];
        this.activeTool = null;
        this.firstPoint = null;
        this.secondPoint = null;
        this.hoverPoint = null;
        this.brushPoints = [];
        this.isDrawingBrush = false;

        // Estado de selección y arrastre de dibujos / anclas
        this.selectedDrawing = null;
        this.isDraggingAnchor = false;
        this.draggedAnchorInfo = null;
        this.isDraggingDrawing = false;
        this.dragStartMouse = null;
        this.dragStartItemP1 = null;
        this.dragStartItemP2 = null;
        this.dragStartPoints = null;
        this.contextMenu = null;

        // Configuración del Perfil de Volumen del Rango Visible (VRVP)
        this.vrvpData = null; // { candles, numRows: 24, valueAreaPct: 70, enabled: false }
        this.onChangeCallback = null;

        // Modo Imán (Magnet Mode: Enganche automático a High/Low/Close/Open de velas)
        this.magnetMode = false;
        this.magnetPoint = null;

        this.resize();
        if (this.container && typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(() => this.resize());
            this._resizeObserver.observe(this.container);
        }
        if (this.chart && this.chart.timeScale() && typeof this.chart.timeScale().subscribeVisibleLogicalRangeChange === 'function') {
            this._rangeChangeCb = () => this.redraw();
            this.chart.timeScale().subscribeVisibleLogicalRangeChange(this._rangeChangeCb);
        }

        this.initInteractionEvents();
    }

    notifyChange() {
        if (typeof this.onChangeCallback === 'function') {
            try {
                this.onChangeCallback(this.exportDrawings());
            } catch (e) {
                console.error("Error al notificar cambio en DrawingEngine:", e);
            }
        }
    }

    setCandles(candles) {
        this.candles = Array.isArray(candles) ? candles : [];
    }

    resize() {
        if (!this.container) return;
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
        this.redraw();
    }

    ensureId(item) {
        if (!item.id) {
            item.id = 'draw_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        }
        if (item.p1 && item.p1.logical !== undefined) delete item.p1.logical;
        if (item.p2 && item.p2.logical !== undefined) delete item.p2.logical;
        if (Array.isArray(item.points)) {
            item.points.forEach(p => { if (p && p.logical !== undefined) delete p.logical; });
        }
        return item;
    }

    setTool(toolName) {
        this.activeTool = toolName;
        this.firstPoint = null;
        this.secondPoint = null;
        this.hoverPoint = null;
        this.brushPoints = [];
        this.selectedDrawing = null;
        this.hideContextMenu();
        this.canvas.style.pointerEvents = toolName ? 'auto' : (this.drawings.length > 0 ? 'auto' : 'none');
        this.redraw();
    }

    toggleMagnet() {
        this.magnetMode = !this.magnetMode;
        const btn = document.getElementById('btn-magnet');
        if (btn) btn.classList.toggle('active', this.magnetMode);
        const sheetBtn = document.getElementById('sheet-btn-magnet');
        if (sheetBtn) sheetBtn.textContent = `🧲 Modo Imán: ${this.magnetMode ? 'ON' : 'OFF'}`;
        if (!this.magnetMode) this.magnetPoint = null;
        this.redraw();
        return this.magnetMode;
    }

    snapToCandle(mouseX, mouseY) {
        if (!this.magnetMode || !this.chart || !this.mainSeries) {
            this.magnetPoint = null;
            return this.pixelToMarket(mouseX, mouseY);
        }

        const timeScale = this.chart.timeScale();
        if (!timeScale) {
            this.magnetPoint = null;
            return this.pixelToMarket(mouseX, mouseY);
        }

        const candles = (this.candles && this.candles.length > 0)
            ? this.candles
            : (this.vrvpData && this.vrvpData.candles ? this.vrvpData.candles : (window.historialVelas || []));

        if (!candles || candles.length === 0) {
            this.magnetPoint = null;
            return this.pixelToMarket(mouseX, mouseY);
        }

        const logical = typeof timeScale.coordinateToLogical === 'function'
            ? timeScale.coordinateToLogical(mouseX)
            : null;

        let nearestCandle = null;

        if (logical !== null) {
            const idx = Math.max(0, Math.min(candles.length - 1, Math.round(logical)));
            nearestCandle = candles[idx];
        } else {
            let minDistanceX = Infinity;
            for (let i = 0; i < candles.length; i++) {
                const cX = timeScale.timeToCoordinate(candles[i].time);
                if (cX !== null) {
                    const d = Math.abs(mouseX - cX);
                    if (d < minDistanceX) {
                        minDistanceX = d;
                        nearestCandle = candles[i];
                    }
                }
            }
        }

        if (!nearestCandle) {
            this.magnetPoint = null;
            return this.pixelToMarket(mouseX, mouseY);
        }

        const o = nearestCandle.open !== undefined ? nearestCandle.open : nearestCandle.value;
        const h = nearestCandle.high !== undefined ? nearestCandle.high : nearestCandle.value;
        const l = nearestCandle.low !== undefined ? nearestCandle.low : nearestCandle.value;
        const c = nearestCandle.close !== undefined ? nearestCandle.close : nearestCandle.value;

        const candidates = [
            { price: h, label: 'H' },
            { price: l, label: 'L' },
            { price: c, label: 'C' },
            { price: o, label: 'O' }
        ];

        let bestCand = candidates[0];
        let bestDistY = Infinity;
        let bestCoordY = mouseY;

        candidates.forEach(cand => {
            const coordY = this.mainSeries.priceToCoordinate(cand.price);
            if (coordY !== null) {
                const distY = Math.abs(mouseY - coordY);
                if (distY < bestDistY) {
                    bestDistY = distY;
                    bestCand = cand;
                    bestCoordY = coordY;
                }
            }
        });

        const snappedX = timeScale.timeToCoordinate(nearestCandle.time) ?? mouseX;

        this.magnetPoint = {
            x: snappedX,
            y: bestCoordY,
            time: nearestCandle.time,
            price: bestCand.price,
            level: bestCand.label
        };

        return {
            time: nearestCandle.time,
            price: bestCand.price,
            snapped: true
        };
    }

    clearDrawings() {
        this.drawings = [];
        this.firstPoint = null;
        this.secondPoint = null;
        this.hoverPoint = null;
        this.brushPoints = [];
        this.selectedDrawing = null;
        this.hideContextMenu();
        this.redraw();
        this.notifyChange();
    }

    exportDrawings() {
        return JSON.parse(JSON.stringify(this.drawings));
    }

    importDrawings(drawingsArray) {
        if (typeof drawingsArray === 'string') {
            try { drawingsArray = JSON.parse(drawingsArray); } catch(e) { drawingsArray = []; }
        }
        this.drawings = Array.isArray(drawingsArray) ? drawingsArray.map(d => this.ensureId(d)) : [];
        this.selectedDrawing = null;
        this.redraw();
    }

    undo() {
        if (this.drawings.length > 0) {
            const popped = this.drawings.pop();
            if (this.selectedDrawing && (this.selectedDrawing === popped || this.selectedDrawing.id === popped.id)) {
                this.selectedDrawing = null;
            }
            this.hideContextMenu();
            this.redraw();
            this.notifyChange();
        }
    }

    getSelectedDrawing() {
        return this.selectedDrawing;
    }

    deleteSelectedDrawing() {
        if (!this.selectedDrawing) return;
        const targetId = this.selectedDrawing.id;
        this.drawings = this.drawings.filter(d => d !== this.selectedDrawing && d.id !== targetId);
        this.selectedDrawing = null;
        this.hideContextMenu();
        this.redraw();
        this.notifyChange();
    }

    duplicateSelectedDrawing() {
        if (!this.selectedDrawing) return;
        const dup = JSON.parse(JSON.stringify(this.selectedDrawing));
        dup.id = 'draw_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        if (dup.p1 && typeof dup.p1.price === 'number') dup.p1.price *= 1.002;
        if (dup.p2 && typeof dup.p2.price === 'number') dup.p2.price *= 1.002;
        if (Array.isArray(dup.points)) {
            dup.points.forEach(p => { if (p && typeof p.price === 'number') p.price *= 1.002; });
        }
        this.drawings.push(dup);
        this.selectedDrawing = dup;
        this.redraw();
        this.notifyChange();
    }

    // MODAL DE EDICIÓN DE PARÁMETROS DE DIBUJO
    editDrawingParams(drawing) {
        if (!drawing) drawing = this.selectedDrawing;
        if (!drawing) return;

        this.hideContextMenu();

        const isLong = (drawing.type === 'longpos');
        const isShort = (drawing.type === 'shortpos');
        const isRiskReward = (isLong || isShort);

        let modal = document.getElementById('drawing-params-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'drawing-params-modal';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
            modal.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '10000';
            document.body.appendChild(modal);
        }

        const entryP = drawing.p1 ? drawing.p1.price : 0;
        const targetP = drawing.targetPrice !== undefined ? drawing.targetPrice : (drawing.p2 ? drawing.p2.price : entryP);
        
        let defaultStopP = drawing.stopPrice;
        if (defaultStopP === undefined) {
            const diff = Math.abs(targetP - entryP);
            defaultStopP = isLong ? entryP - diff : entryP + diff;
        }

        const qty = drawing.quantity !== undefined ? drawing.quantity : 1.0;

        const typeTitle = isLong ? 'Posición Larga (Long)' : isShort ? 'Posición Corta (Short)' : drawing.type.toUpperCase();

        let fieldsHTML = '';

        if (isRiskReward) {
            fieldsHTML = `
                <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                    <label style="color:#d1d4dc; font-size:12px;">Precio Entrada:</label>
                    <input type="number" id="edit-draw-entry" value="${entryP}" step="any" style="background:#131722; border:1px solid #363c4e; color:#fff; padding:6px 8px; border-radius:4px; width:150px; font-size:12px;">
                </div>
                <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                    <label style="color:#089981; font-size:12px; font-weight:bold;">Precio Objetivo (Take Profit):</label>
                    <input type="number" id="edit-draw-target" value="${targetP}" step="any" style="background:#131722; border:1px solid #089981; color:#089981; font-weight:bold; padding:6px 8px; border-radius:4px; width:150px; font-size:12px;">
                </div>
                <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                    <label style="color:#f23645; font-size:12px; font-weight:bold;">Precio Stop Loss:</label>
                    <input type="number" id="edit-draw-stop" value="${defaultStopP}" step="any" style="background:#131722; border:1px solid #f23645; color:#f23645; font-weight:bold; padding:6px 8px; border-radius:4px; width:150px; font-size:12px;">
                </div>
                <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                    <label style="color:#00bcd4; font-size:12px; font-weight:bold;">Cantidad Operada (Asset Qty):</label>
                    <input type="number" id="edit-draw-qty" value="${qty}" step="any" style="background:#131722; border:1px solid #00bcd4; color:#00bcd4; font-weight:bold; padding:6px 8px; border-radius:4px; width:150px; font-size:12px;">
                </div>
                <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                    <label style="color:#d1d4dc; font-size:12px;">Color del Borde:</label>
                    <input type="color" id="edit-draw-color" value="${drawing.color || (isLong ? '#089981' : '#f23645')}" style="background:none; border:none; width:40px; height:28px; cursor:pointer;">
                </div>
            `;
        } else {
            fieldsHTML = `
                <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                    <label style="color:#d1d4dc; font-size:12px;">Color:</label>
                    <input type="color" id="edit-draw-color" value="${drawing.color || '#2962ff'}" style="background:none; border:none; width:40px; height:28px; cursor:pointer;">
                </div>
            `;
            if (drawing.text !== undefined) {
                fieldsHTML += `
                    <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                        <label style="color:#d1d4dc; font-size:12px;">Texto:</label>
                        <input type="text" id="edit-draw-text" value="${drawing.text}" style="background:#131722; border:1px solid #363c4e; color:#fff; padding:6px 8px; border-radius:4px; width:180px; font-size:12px;">
                    </div>
                `;
            }
        }

        modal.innerHTML = `
            <div style="background:#1e222d; border:1px solid #2a2e39; border-radius:8px; width:360px; padding:16px; box-shadow:0 8px 24px rgba(0,0,0,0.6); color:#d1d4dc; font-family:-apple-system,BlinkMacSystemFont,Roboto,sans-serif;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #2a2e39; padding-bottom:10px; margin-bottom:16px;">
                    <h3 style="margin:0; font-size:14px; color:#fff;">Ajustes de ${typeTitle}</h3>
                    <button id="modal-edit-draw-close" style="background:none; border:none; color:#787b86; font-size:18px; cursor:pointer;">&times;</button>
                </div>
                <div>
                    ${fieldsHTML}
                </div>
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px; border-top:1px solid #2a2e39; padding-top:12px;">
                    <button id="btn-edit-draw-cancel" style="background:#2a2e39; border:none; color:#d1d4dc; padding:6px 14px; border-radius:4px; cursor:pointer; font-size:12px;">Cancelar</button>
                    <button id="btn-edit-draw-apply" style="background:#2962ff; border:none; color:#fff; padding:6px 14px; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold;">Aceptar</button>
                </div>
            </div>
        `;

        modal.style.display = 'flex';

        const closeModal = () => { modal.style.display = 'none'; };

        document.getElementById('modal-edit-draw-close').onclick = closeModal;
        document.getElementById('btn-edit-draw-cancel').onclick = closeModal;

        document.getElementById('btn-edit-draw-apply').onclick = () => {
            if (isRiskReward) {
                const newEntry = parseFloat(document.getElementById('edit-draw-entry').value);
                const newTarget = parseFloat(document.getElementById('edit-draw-target').value);
                const newStop = parseFloat(document.getElementById('edit-draw-stop').value);
                const newQty = parseFloat(document.getElementById('edit-draw-qty').value);
                const newColor = document.getElementById('edit-draw-color').value;

                if (!isNaN(newEntry) && drawing.p1) drawing.p1.price = newEntry;
                if (!isNaN(newTarget)) {
                    drawing.targetPrice = newTarget;
                    if (drawing.p2) drawing.p2.price = newTarget;
                }
                if (!isNaN(newStop)) {
                    drawing.stopPrice = newStop;
                }
                if (!isNaN(newQty)) {
                    drawing.quantity = newQty;
                }
                if (newColor) drawing.color = newColor;
            } else {
                const colorEl = document.getElementById('edit-draw-color');
                if (colorEl) drawing.color = colorEl.value;
                const textEl = document.getElementById('edit-draw-text');
                if (textEl) drawing.text = textEl.value;
            }

            closeModal();
            this.redraw();
            this.notifyChange();
        };
    }

    mapToPixel(point) {
        if (!point || typeof point.price !== 'number' || isNaN(point.price)) {
            return { x: null, y: null };
        }
        const y = this.mainSeries ? this.mainSeries.priceToCoordinate(point.price) : null;

        if (!this.chart || !this.chart.timeScale()) {
            return { x: null, y };
        }

        const timeScale = this.chart.timeScale();

        // 1. Coincidencia directa exacta de timestamp en la escala temporal activa
        let x = timeScale.timeToCoordinate(point.time);
        if (x !== null && !isNaN(x)) {
            return { x, y };
        }

        // Helper para resolver logicalToCoordinate sin el colapso a 0 de Lightweight Charts con floats
        const resolveLogicalCoord = (logVal) => {
            if (logVal === null || isNaN(logVal) || typeof timeScale.logicalToCoordinate !== 'function') return null;
            const base = Math.floor(logVal);
            const frac = logVal - base;
            const x0 = timeScale.logicalToCoordinate(base);
            const x1 = timeScale.logicalToCoordinate(base + 1);
            if (x0 !== null && x1 !== null && !isNaN(x0) && !isNaN(x1)) {
                return x0 + (x1 - x0) * frac;
            }
            if (x0 !== null && !isNaN(x0)) return x0;
            return timeScale.logicalToCoordinate(Math.round(logVal));
        };

        // 2. Mapeo continuo e interpolación sub-pixel invariante por temporalidad
        // Permite que dibujos proyectados hacia el futuro o creados en otras temporalidades
        // se posicionen con exactitud matemática tanto dentro como más adelante del gráfico.
        const candles = (this.candles && this.candles.length > 0)
            ? this.candles
            : (this.vrvpData && this.vrvpData.candles ? this.vrvpData.candles : (window.historialVelas || []));

        if (candles.length > 0) {
            const lastIdx = candles.length - 1;
            const firstTime = candles[0].time;
            const lastTime = candles[lastIdx].time;

            let candleStep = 60;
            if (lastIdx > 0) {
                const diffLast = candles[lastIdx].time - candles[lastIdx - 1].time;
                if (diffLast > 0 && !isNaN(diffLast)) candleStep = diffLast;
                else {
                    const avgDiff = (lastTime - firstTime) / lastIdx;
                    if (avgDiff > 0 && !isNaN(avgDiff)) candleStep = avgDiff;
                }
            }

            let targetLogical = null;

            if (point.time >= firstTime && point.time <= lastTime) {
                // Búsqueda binaria para ubicar el intervalo de velas exacto
                let low = 0, high = lastIdx;
                while (low <= high) {
                    const mid = Math.floor((low + high) / 2);
                    if (candles[mid].time === point.time) {
                        targetLogical = mid;
                        break;
                    } else if (candles[mid].time < point.time) {
                        low = mid + 1;
                    } else {
                        high = mid - 1;
                    }
                }

                if (targetLogical === null) {
                    // point.time se encuentra entre candles[high] y candles[low]
                    const i0 = Math.max(0, Math.min(high, lastIdx));
                    const i1 = Math.max(0, Math.min(low, lastIdx));
                    if (i0 !== i1 && candles[i1].time > candles[i0].time) {
                        const fraction = (point.time - candles[i0].time) / (candles[i1].time - candles[i0].time);
                        targetLogical = i0 + fraction;
                    } else {
                        targetLogical = i0;
                    }
                }
            } else {
                // Extrapolación lineal para puntos anteriores o posteriores al rango de velas cargado
                if (point.time > lastTime) {
                    targetLogical = lastIdx + (point.time - lastTime) / candleStep;
                } else {
                    targetLogical = 0 - (firstTime - point.time) / candleStep;
                }
            }

            if (targetLogical !== null) {
                x = resolveLogicalCoord(targetLogical);
            }
        }

        return { x, y };
    }

    pixelToMarket(x, y) {
        if (!this.mainSeries || !this.chart || !this.chart.timeScale()) return null;
        const price = this.mainSeries.coordinateToPrice(y);
        if (price === null || isNaN(price)) return null;

        const timeScale = this.chart.timeScale();
        let time = timeScale.coordinateToTime(x);
        const logical = typeof timeScale.coordinateToLogical === 'function'
            ? timeScale.coordinateToLogical(x)
            : null;

        const candles = (this.candles && this.candles.length > 0)
            ? this.candles
            : (this.vrvpData && this.vrvpData.candles ? this.vrvpData.candles : (window.historialVelas || []));

        if (candles.length > 0) {
            const lastIdx = candles.length - 1;
            let candleStep = 60;
            if (lastIdx > 0) {
                const diffLast = candles[lastIdx].time - candles[lastIdx - 1].time;
                if (diffLast > 0 && !isNaN(diffLast)) candleStep = diffLast;
                else {
                    const avgDiff = (candles[lastIdx].time - candles[0].time) / lastIdx;
                    if (avgDiff > 0 && !isNaN(avgDiff)) candleStep = avgDiff;
                }
            }

            if (time === null && logical !== null) {
                // Obtener coordenada lógica continua precisa (sub-barra) para suavidad píxel a píxel
                let preciseLogical = logical;
                if (typeof timeScale.logicalToCoordinate === 'function') {
                    const baseLog = Math.floor(logical);
                    const xBase = timeScale.logicalToCoordinate(baseLog);
                    const xNext = timeScale.logicalToCoordinate(baseLog + 1);
                    if (xBase !== null && xNext !== null && xBase !== xNext) {
                        preciseLogical = baseLog + (x - xBase) / (xNext - xBase);
                    }
                }

                if (preciseLogical > lastIdx) {
                    const diff = preciseLogical - lastIdx;
                    time = Math.round(candles[lastIdx].time + diff * candleStep);
                } else if (preciseLogical < 0) {
                    time = Math.round(candles[0].time + preciseLogical * candleStep);
                } else {
                    const baseIdx = Math.floor(preciseLogical);
                    const frac = preciseLogical - baseIdx;
                    if (baseIdx < lastIdx && candles[baseIdx + 1]) {
                        time = Math.round(candles[baseIdx].time + frac * (candles[baseIdx + 1].time - candles[baseIdx].time));
                    } else if (candles[baseIdx]) {
                        time = candles[baseIdx].time;
                    }
                }
            }
        }

        if (time === null || isNaN(time)) return null;
        return { time, price };
    }


    // LÓGICA DE DISTANCIAS Y HIT-TESTING
    dist(x1, y1, x2, y2) {
        return Math.hypot(x1 - x2, y1 - y2);
    }

    distToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        return Math.hypot(px - projX, py - projY);
    }

    hitTest(mouseX, mouseY) {
        const TOL = 8;
        let bestHit = null;
        let minDistance = Infinity;

        if (this.selectedDrawing) {
            const item = this.selectedDrawing;
            if (item.p1) {
                const p1 = this.mapToPixel(item.p1);
                if (p1.x !== null && p1.y !== null && this.dist(mouseX, mouseY, p1.x, p1.y) <= TOL + 3) {
                    return { drawing: item, anchor: 'p1', isAnchor: true };
                }
            }
            if (item.p2) {
                const p2 = this.mapToPixel(item.p2);
                if (p2.x !== null && p2.y !== null && this.dist(mouseX, mouseY, p2.x, p2.y) <= TOL + 3) {
                    return { drawing: item, anchor: 'p2', isAnchor: true };
                }
            }
            if (Array.isArray(item.points)) {
                for (let i = 0; i < item.points.length; i++) {
                    const p = this.mapToPixel(item.points[i]);
                    if (p.x !== null && p.y !== null && this.dist(mouseX, mouseY, p.x, p.y) <= TOL + 3) {
                        return { drawing: item, anchor: i, isAnchor: true };
                    }
                }
            }
        }

        for (let idx = this.drawings.length - 1; idx >= 0; idx--) {
            const item = this.drawings[idx];
            this.ensureId(item);

            if (item.p1) {
                const p1 = this.mapToPixel(item.p1);
                if (p1.x !== null && p1.y !== null) {
                    const d = this.dist(mouseX, mouseY, p1.x, p1.y);
                    if (d <= TOL + 2 && d < minDistance) {
                        minDistance = d;
                        bestHit = { drawing: item, anchor: 'p1', isAnchor: true };
                    }
                }
            }
            if (item.p2) {
                const p2 = this.mapToPixel(item.p2);
                if (p2.x !== null && p2.y !== null) {
                    const d = this.dist(mouseX, mouseY, p2.x, p2.y);
                    if (d <= TOL + 2 && d < minDistance) {
                        minDistance = d;
                        bestHit = { drawing: item, anchor: 'p2', isAnchor: true };
                    }
                }
            }

            let bodyHit = false;
            let dBody = Infinity;

            const p1 = item.p1 ? this.mapToPixel(item.p1) : null;
            const p2 = item.p2 ? this.mapToPixel(item.p2) : null;

            switch (item.type) {
                case 'trend':
                case 'trendline':
                case 'ruler':
                    if (p1 && p2 && p1.x !== null && p2.x !== null) {
                        dBody = this.distToSegment(mouseX, mouseY, p1.x, p1.y, p2.x, p2.y);
                        if (dBody <= TOL) bodyHit = true;
                    }
                    break;

                case 'ray':
                    if (p1 && p2 && p1.x !== null && p2.x !== null) {
                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        let endX = p2.x, endY = p2.y;
                        if (dx !== 0 || dy !== 0) {
                            let tList = [];
                            if (dx > 0) tList.push((this.canvas.width - p1.x) / dx);
                            if (dx < 0) tList.push((0 - p1.x) / dx);
                            if (dy > 0) tList.push((this.canvas.height - p1.y) / dy);
                            if (dy < 0) tList.push((0 - p1.y) / dy);
                            const posTs = tList.filter(t => t > 0);
                            if (posTs.length > 0) {
                                const t = Math.min(...posTs);
                                endX = p1.x + t * dx;
                                endY = p1.y + t * dy;
                            }
                        }
                        dBody = this.distToSegment(mouseX, mouseY, p1.x, p1.y, endX, endY);
                        if (dBody <= TOL) bodyHit = true;
                    }
                    break;

                case 'horzline':
                    if (p1 && p1.y !== null) {
                        dBody = Math.abs(mouseY - p1.y);
                        if (dBody <= TOL) bodyHit = true;
                    }
                    break;

                case 'vertline':
                    if (p1 && p1.x !== null) {
                        dBody = Math.abs(mouseX - p1.x);
                        if (dBody <= TOL) bodyHit = true;
                    }
                    break;

                case 'rectangle':
                case 'longpos':
                case 'shortpos':
                    if (p1 && p2 && p1.x !== null && p2.x !== null) {
                        const minX = Math.min(p1.x, p2.x) - TOL;
                        const maxX = Math.max(p1.x, p2.x) + TOL;
                        const minY = Math.min(p1.y, p2.y) - TOL;
                        const maxY = Math.max(p1.y, p2.y) + TOL;
                        if (mouseX >= minX && mouseX <= maxX && mouseY >= minY && mouseY <= maxY) {
                            bodyHit = true;
                            dBody = 0;
                        }
                    }
                    break;

                case 'ellipse':
                    if (p1 && p2 && p1.x !== null && p2.x !== null) {
                        const cx = (p1.x + p2.x) / 2;
                        const cy = (p1.y + p2.y) / 2;
                        const rx = Math.abs(p2.x - p1.x) / 2 + TOL;
                        const ry = Math.abs(p2.y - p1.y) / 2 + TOL;
                        if (rx > 0 && ry > 0) {
                            const eq = Math.pow((mouseX - cx) / rx, 2) + Math.pow((mouseY - cy) / ry, 2);
                            if (eq <= 1) {
                                bodyHit = true;
                                dBody = 0;
                            }
                        }
                    }
                    break;

                case 'fibo':
                case 'fibext':
                    if (p1 && p2 && p1.x !== null && p2.x !== null) {
                        const minX = Math.min(p1.x, p2.x) - TOL;
                        const maxX = Math.max(p1.x, p2.x) + TOL;
                        const minY = Math.min(p1.y, p2.y) - TOL;
                        const maxY = Math.max(p1.y, p2.y) + TOL;
                        if (mouseX >= minX && mouseX <= maxX && mouseY >= minY && mouseY <= maxY) {
                            bodyHit = true;
                            dBody = 0;
                        }
                    }
                    break;

                case 'brush':
                    if (Array.isArray(item.points) && item.points.length > 1) {
                        for (let i = 0; i < item.points.length - 1; i++) {
                            const pt1 = this.mapToPixel(item.points[i]);
                            const pt2 = this.mapToPixel(item.points[i + 1]);
                            if (pt1.x !== null && pt2.x !== null) {
                                const d = this.distToSegment(mouseX, mouseY, pt1.x, pt1.y, pt2.x, pt2.y);
                                if (d <= TOL) {
                                    bodyHit = true;
                                    dBody = Math.min(dBody, d);
                                }
                            }
                        }
                    }
                    break;

                case 'text':
                case 'callout':
                case 'pricetag':
                    if (p1 && p1.x !== null && p1.y !== null) {
                        dBody = this.dist(mouseX, mouseY, p1.x, p1.y);
                        if (dBody <= 25) bodyHit = true;
                    }
                    break;
            }

            if (bodyHit && dBody < minDistance) {
                minDistance = dBody;
                bestHit = { drawing: item, anchor: null, isAnchor: false };
            }
        }

        return bestHit;
    }

    // MENÚ CONTEXTUAL (CLIC DERECHO)
    showContextMenu(clientX, clientY) {
        this.hideContextMenu();
        if (!this.selectedDrawing) return;

        const menu = document.createElement('div');
        menu.id = 'drawing-context-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${clientX}px`;
        menu.style.top = `${clientY}px`;
        menu.style.backgroundColor = '#1e222d';
        menu.style.border = '1px solid #2a2e39';
        menu.style.borderRadius = '6px';
        menu.style.padding = '4px 0';
        menu.style.zIndex = '9999';
        menu.style.boxShadow = '0 6px 16px rgba(0,0,0,0.6)';
        menu.style.color = '#d1d4dc';
        menu.style.fontFamily = '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif';
        menu.style.fontSize = '12px';
        menu.style.minWidth = '160px';

        const createMenuItem = (label, icon, onClick) => {
            const item = document.createElement('div');
            item.style.padding = '8px 14px';
            item.style.cursor = 'pointer';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.gap = '8px';
            item.style.userSelect = 'none';
            item.innerHTML = `<span style="font-size:14px;">${icon}</span><span>${label}</span>`;
            item.onmouseenter = () => item.style.backgroundColor = '#2a2e39';
            item.onmouseleave = () => item.style.backgroundColor = 'transparent';
            item.onclick = (e) => {
                e.stopPropagation();
                onClick();
                this.hideContextMenu();
            };
            return item;
        };

        menu.appendChild(createMenuItem('Configurar / Editar', '⚙️', () => this.editDrawingParams(this.selectedDrawing)));
        menu.appendChild(createMenuItem('Eliminar dibujo', '🗑️', () => this.deleteSelectedDrawing()));
        menu.appendChild(createMenuItem('Duplicar', '📋', () => this.duplicateSelectedDrawing()));

        const colorItem = createMenuItem('Cambiar color', '🎨', () => {
            const newColor = prompt('Ingrese nuevo color (hex o nombre):', this.selectedDrawing.color || '#2962ff');
            if (newColor) {
                this.selectedDrawing.color = newColor;
                this.redraw();
            }
        });
        menu.appendChild(colorItem);

        document.body.appendChild(menu);
        this.contextMenu = menu;
    }

    hideContextMenu() {
        if (this.contextMenu) {
            if (this.contextMenu.parentNode) {
                this.contextMenu.parentNode.removeChild(this.contextMenu);
            }
            this.contextMenu = null;
        }
    }

    initInteractionEvents() {
        if (this.container && typeof this.container.addEventListener === 'function') {
            this.container.addEventListener('mousemove', (e) => {
                if (this.activeTool !== null || this.isDraggingAnchor || this.isDraggingDrawing) return;
                const rect = this.canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                const hit = this.hitTest(mouseX, mouseY);
                if (hit || this.selectedDrawing) {
                    this.canvas.style.pointerEvents = 'auto';
                    this.canvas.style.cursor = hit ? (hit.isAnchor ? 'grab' : 'pointer') : 'default';
                } else {
                    this.canvas.style.pointerEvents = 'none';
                }
            });
        }

        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            if (this.activeTool === 'brush') {
                this.isDrawingBrush = true;
                const marketPoint = this.pixelToMarket(mouseX, mouseY);
                if (marketPoint) this.brushPoints = [marketPoint];
                return;
            }

            if (!this.activeTool) {
                const hit = this.hitTest(mouseX, mouseY);
                this.hideContextMenu();

                if (hit) {
                    this.selectedDrawing = hit.drawing;
                    if (hit.isAnchor) {
                        this.isDraggingAnchor = true;
                        this.draggedAnchorInfo = hit;
                        this.canvas.style.cursor = 'grabbing';
                    } else {
                        this.isDraggingDrawing = true;
                        this.dragStartMouse = { x: mouseX, y: mouseY };
                        this.dragStartItemP1 = hit.drawing.p1 ? { ...hit.drawing.p1 } : null;
                        this.dragStartItemP2 = hit.drawing.p2 ? { ...hit.drawing.p2 } : null;
                        this.dragStartPoints = Array.isArray(hit.drawing.points)
                            ? hit.drawing.points.map(p => ({ ...p }))
                            : null;
                        this.canvas.style.cursor = 'move';
                    }
                    this.redraw();
                    e.stopPropagation();
                } else {
                    this.selectedDrawing = null;
                    this.redraw();
                    this.canvas.style.pointerEvents = 'none';
                }
            }
        });

        const handleMouseMove = (e) => {
            if (e.target === this.canvas && e.currentTarget === window) return;
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            if (!this.activeTool && !this.isDraggingAnchor && !this.isDraggingDrawing && !this.isDrawingBrush) {
                const hit = this.hitTest(mouseX, mouseY);
                if (hit || this.selectedDrawing) {
                    this.canvas.style.pointerEvents = 'auto';
                    this.canvas.style.cursor = hit ? (hit.isAnchor ? 'grab' : 'pointer') : 'default';
                } else {
                    this.canvas.style.pointerEvents = 'none';
                    this.canvas.style.cursor = 'default';
                }
            }

            const marketPoint = (this.magnetMode && (this.activeTool || this.isDraggingAnchor))
                ? this.snapToCandle(mouseX, mouseY)
                : this.pixelToMarket(mouseX, mouseY);

            if (this.isDrawingBrush && this.activeTool === 'brush' && marketPoint) {
                this.brushPoints.push(marketPoint);
                this.redraw();
                return;
            }

            if (this.activeTool && this.firstPoint && marketPoint) {
                this.hoverPoint = marketPoint;
                this.redraw();
                return;
            }

            if (this.isDraggingAnchor && this.draggedAnchorInfo && marketPoint) {
                const { drawing, anchor } = this.draggedAnchorInfo;
                if (anchor === 'p1') drawing.p1 = marketPoint;
                else if (anchor === 'p2') {
                    drawing.p2 = marketPoint;
                    drawing.targetPrice = marketPoint.price;
                }
                else if (typeof anchor === 'number' && Array.isArray(drawing.points)) {
                    drawing.points[anchor] = marketPoint;
                }
                this.redraw();
                return;
            }

            if (this.isDraggingDrawing && this.selectedDrawing) {
                const dx = mouseX - this.dragStartMouse.x;
                const dy = mouseY - this.dragStartMouse.y;

                if (this.dragStartItemP1) {
                    const pix1 = this.mapToPixel(this.dragStartItemP1);
                    if (pix1.x !== null && pix1.y !== null) {
                        const newP1 = this.pixelToMarket(pix1.x + dx, pix1.y + dy);
                        if (newP1) this.selectedDrawing.p1 = newP1;
                    }
                }
                if (this.dragStartItemP2) {
                    const pix2 = this.mapToPixel(this.dragStartItemP2);
                    if (pix2.x !== null && pix2.y !== null) {
                        const newP2 = this.pixelToMarket(pix2.x + dx, pix2.y + dy);
                        if (newP2) {
                            this.selectedDrawing.p2 = newP2;
                            this.selectedDrawing.targetPrice = newP2.price;
                        }
                    }
                }
                if (Array.isArray(this.dragStartPoints)) {
                    this.selectedDrawing.points = this.dragStartPoints.map(origPt => {
                        const pix = this.mapToPixel(origPt);
                        if (pix.x === null || pix.y === null) return origPt;
                        return this.pixelToMarket(pix.x + dx, pix.y + dy) || origPt;
                    });
                }
                this.redraw();
                return;
            }
        };

        this._handleMouseMove = handleMouseMove;
        this.canvas.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousemove', handleMouseMove);

        const finishInteractions = (e) => {
            if (e && e.target === this.canvas && e.currentTarget === window) return;
            if (this.isDrawingBrush && this.activeTool === 'brush') {
                this.isDrawingBrush = false;
                if (this.brushPoints.length > 1) {
                    this.drawings.push(this.ensureId({
                        type: 'brush',
                        points: [...this.brushPoints],
                        color: '#00bcd4'
                    }));
                    this.notifyChange();
                }
                this.brushPoints = [];
                this.setTool(null);
            }

            if (this.isDraggingAnchor || this.isDraggingDrawing) {
                this.isDraggingAnchor = false;
                this.draggedAnchorInfo = null;
                this.isDraggingDrawing = false;
                this.canvas.style.cursor = 'default';
                this.redraw();
                this.notifyChange();
            }
        };

        this._finishInteractions = finishInteractions;
        this.canvas.addEventListener('mouseup', finishInteractions);
        window.addEventListener('mouseup', finishInteractions);

        this.canvas.addEventListener('click', (e) => {
            if (!this.activeTool || this.activeTool === 'brush') return;
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const marketPoint = (this.magnetMode && this.activeTool)
                ? this.snapToCandle(mouseX, mouseY)
                : this.pixelToMarket(mouseX, mouseY);
            if (!marketPoint) return;

            if (this.activeTool === 'text' || this.activeTool === 'callout') {
                const textInput = prompt("Ingrese la anotación de texto:", "Nivel Relevante");
                if (textInput) {
                    this.drawings.push(this.ensureId({
                        type: this.activeTool,
                        p1: marketPoint,
                        text: textInput,
                        color: '#ffeb3b'
                    }));
                    this.notifyChange();
                }
                this.setTool(null);
                return;
            }

            if (this.activeTool === 'pricetag') {
                this.drawings.push(this.ensureId({
                    type: 'pricetag',
                    p1: marketPoint,
                    color: '#2962ff'
                }));
                this.notifyChange();
                this.setTool(null);
                return;
            }

            if (this.activeTool === 'horzline' || this.activeTool === 'vertline') {
                this.drawings.push(this.ensureId({
                    type: this.activeTool,
                    p1: marketPoint,
                    color: '#ff9800'
                }));
                this.notifyChange();
                this.setTool(null);
                return;
            }

            if (!this.firstPoint) {
                this.firstPoint = marketPoint;
            } else {
                this.drawings.push(this.ensureId({
                    type: this.activeTool,
                    p1: this.firstPoint,
                    p2: marketPoint,
                    targetPrice: marketPoint.price,
                    quantity: 1.0,
                    color: this.activeTool.includes('short') ? '#f23645' : '#089981'
                }));
                this.notifyChange();
                this.firstPoint = null;
                this.setTool(null);
            }
        });

        this.canvas.addEventListener('dblclick', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const hit = this.hitTest(mouseX, mouseY);
            if (hit) {
                this.selectedDrawing = hit.drawing;
                this.redraw();
                this.editDrawingParams(hit.drawing);
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const hit = this.hitTest(mouseX, mouseY);
            if (hit) {
                this.selectedDrawing = hit.drawing;
                this.redraw();
                this.showContextMenu(e.clientX, e.clientY);
            } else {
                this.hideContextMenu();
            }
        });

        this._handleWindowClick = (e) => {
            if (this.contextMenu && !this.contextMenu.contains(e.target)) {
                this.hideContextMenu();
            }
        };
        window.addEventListener('click', this._handleWindowClick);

        this._handleWindowKeyDown = (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const activeEl = document.activeElement;
                if (activeEl && (
                    activeEl.tagName === 'INPUT' ||
                    activeEl.tagName === 'TEXTAREA' ||
                    activeEl.tagName === 'SELECT' ||
                    activeEl.isContentEditable ||
                    activeEl.id === 'pine-code-editor' ||
                    (activeEl.closest && activeEl.closest('#pine-editor-modal'))
                )) {
                    return;
                }
                if (this.selectedDrawing) {
                    e.preventDefault();
                    this.deleteSelectedDrawing();
                }
            }
        };
        window.addEventListener('keydown', this._handleWindowKeyDown);
    }

    destroy() {
        if (typeof window !== 'undefined') {
            if (this._handleMouseMove) window.removeEventListener('mousemove', this._handleMouseMove);
            if (this._finishInteractions) window.removeEventListener('mouseup', this._finishInteractions);
            if (this._handleWindowClick) window.removeEventListener('click', this._handleWindowClick);
            if (this._handleWindowKeyDown) window.removeEventListener('keydown', this._handleWindowKeyDown);
        }
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        if (this.chart && this.chart.timeScale() && typeof this.chart.timeScale().unsubscribeVisibleLogicalRangeChange === 'function' && this._rangeChangeCb) {
            this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this._rangeChangeCb);
            this._rangeChangeCb = null;
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        if (this.positionOverlaysContainer && this.positionOverlaysContainer.parentNode) {
            this.positionOverlaysContainer.parentNode.removeChild(this.positionOverlaysContainer);
        }
    }

    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Renderizar Perfil de Volumen del Rango Visible (VRVP)
        if (this.vrvpData && this.vrvpData.enabled && this.vrvpData.candles.length > 0) {
            this.renderVolumeProfile(this.vrvpData);
        }

        for (const item of this.drawings) {
            this.ensureId(item);
            this.renderItem(item);
            if (item === this.selectedDrawing) {
                this.renderSelectionHighlight(item);
            }
        }

        if (this.isDrawingBrush && this.brushPoints.length > 1) {
            this.renderBrush({ type: 'brush', points: this.brushPoints, color: '#ffeb3b' });
        }

        if (this.firstPoint && this.hoverPoint && this.activeTool) {
            this.renderItem({
                type: this.activeTool,
                p1: this.firstPoint,
                p2: this.hoverPoint,
                color: '#ffeb3b',
                isTemp: true
            });
        }

        // Indicador visual de enganche magnético (Magnet Mode)
        if (this.magnetMode && this.magnetPoint && (this.activeTool || this.isDraggingAnchor)) {
            const p = this.magnetPoint;
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
            this.ctx.fillStyle = 'rgba(41, 98, 255, 0.35)';
            this.ctx.fill();
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeStyle = '#2962ff';
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fill();

            if (p.level) {
                this.ctx.font = 'bold 9px monospace';
                this.ctx.fillStyle = '#2962ff';
                this.ctx.fillText(p.level, p.x + 9, p.y + 3);
            }
            this.ctx.restore();
        }

        // Actualizar etiquetas flotantes HTML sobre el gráfico (Paridad TradingView)
        this.updatePositionOverlays();
    }

    // ETIQUETAS FLOTANTES SOBRE EL GRÁFICO (STOP, PYG / CANTIDAD, TARGET)
    updatePositionOverlays() {
        if (!this.positionOverlaysContainer || !this.positionOverlaysContainer.children) return;
        
        const activeRiskRewardDrawings = this.drawings.filter(d => d.type === 'longpos' || d.type === 'shortpos');
        const activeIds = new Set(activeRiskRewardDrawings.map(d => d.id));

        Array.from(this.positionOverlaysContainer.children).forEach(child => {
            const drawId = child.getAttribute('data-draw-id');
            if (drawId && !activeIds.has(drawId)) {
                this.positionOverlaysContainer.removeChild(child);
            }
        });

        for (const item of activeRiskRewardDrawings) {
            this.ensureId(item);
            const isLong = (item.type === 'longpos');

            const p1 = this.mapToPixel(item.p1);
            const p2 = this.mapToPixel(item.p2);
            if (p1.x === null || p1.y === null || p2.x === null || p2.y === null) continue;

            const entryPrice = item.p1.price;
            const targetPrice = item.targetPrice !== undefined ? item.targetPrice : item.p2.price;
            
            let stopPrice = item.stopPrice;
            if (stopPrice === undefined) {
                const diff = Math.abs(targetPrice - entryPrice);
                stopPrice = isLong ? entryPrice - diff : entryPrice + diff;
                item.stopPrice = stopPrice;
            }

            if (item.quantity === undefined) {
                item.quantity = 1.0;
            }

            const entryPixel = this.mapToPixel(item.p1);
            const targetPixel = this.mapToPixel({ price: targetPrice, time: item.p1.time });
            const stopPixel = this.mapToPixel({ price: stopPrice, time: item.p1.time });

            if (entryPixel.y === null || targetPixel.y === null || stopPixel.y === null) continue;

            const entryY = entryPixel.y;
            const targetY = targetPixel.y;
            const stopY = stopPixel.y;

            const leftX = Math.min(p1.x, p2.x);
            const rightX = Math.max(p1.x, p2.x);
            const width = Math.max(rightX - leftX, 80);

            const qty = parseFloat(item.quantity) || 1.0;
            const rewardPct = entryPrice > 0 ? (Math.abs(targetPrice - entryPrice) / entryPrice) * 100 : 0;
            const riskPct = entryPrice > 0 ? (Math.abs(entryPrice - stopPrice) / entryPrice) * 100 : 0;
            const rrRatio = riskPct > 0 ? (rewardPct / riskPct).toFixed(2) : '1.00';

            const rewardAmount = Math.abs(targetPrice - entryPrice) * qty;
            const riskAmount = Math.abs(entryPrice - stopPrice) * qty;

            let overlayElem = this.positionOverlaysContainer.querySelector(`[data-draw-id="${item.id}"]`);
            if (!overlayElem) {
                overlayElem = document.createElement('div');
                overlayElem.setAttribute('data-draw-id', item.id);
                overlayElem.className = 'position-overlay-group';
                overlayElem.style.position = 'absolute';
                overlayElem.style.pointerEvents = 'auto';
                this.positionOverlaysContainer.appendChild(overlayElem);
            }

            const topBadgeY = isLong ? targetY : stopY;
            const botBadgeY = isLong ? stopY : targetY;

            const topPriceVal = isLong ? targetPrice : stopPrice;
            const botPriceVal = isLong ? stopPrice : targetPrice;

            const topPct = isLong ? rewardPct : riskPct;
            const botPct = isLong ? riskPct : rewardPct;

            const topAmount = isLong ? rewardAmount : riskAmount;
            const botAmount = isLong ? riskAmount : rewardAmount;

            const topIsTarget = isLong;

            overlayElem.innerHTML = `
                <!-- ETIQUETA SUPERIOR -->
                <div style="position:absolute; left:${leftX + 4}px; top:${topBadgeY - 24}px; background:#1e222d; border:1px solid ${topIsTarget ? '#089981' : '#f23645'}; border-radius:4px; padding:2px 8px; color:#fff; font-size:10px; font-family:monospace; display:flex; align-items:center; gap:8px; box-shadow:0 2px 6px rgba(0,0,0,0.5); cursor:pointer;" onclick="window.drawingEngine && window.drawingEngine.editDrawingParams(window.drawingEngine.drawings.find(d => d.id === '${item.id}'))">
                    <span style="color:${topIsTarget ? '#089981' : '#f23645'}; font-weight:bold;">${topIsTarget ? 'TARGET' : 'STOP'}: ${formatPrice(topPriceVal)}</span>
                    <span style="color:#b2b5be;">(${topIsTarget ? '+' : '-'}${topPct.toFixed(2)}%)</span>
                    <span style="color:${topIsTarget ? '#089981' : '#f23645'};">Importe: ${topIsTarget ? '+' : '-'}$${topAmount.toFixed(2)}</span>
                </div>

                <!-- ETIQUETA CENTRAL (ENTRY) CON INPUT DE CANTIDAD EDITABLE -->
                <div style="position:absolute; left:${leftX + 4}px; top:${entryY - 14}px; background:#1e222d; border:1px solid #363c4e; border-radius:4px; padding:3px 8px; color:#fff; font-size:10px; font-family:monospace; display:flex; align-items:center; gap:10px; box-shadow:0 2px 8px rgba(0,0,0,0.6); z-index:35;">
                    <span>Cerrado PyG: <b style="color:#089981;">+$${rewardAmount.toFixed(2)}</b></span>
                    <span>Cantidad: <input type="number" id="overlay-qty-${item.id}" value="${qty}" step="any" style="background:#131722; border:1px solid #2a2e39; color:#00bcd4; font-weight:bold; font-size:10px; width:55px; border-radius:3px; padding:1px 4px; text-align:center;" onchange="if (window.drawingEngine) { const d = window.drawingEngine.drawings.find(x => x.id === '${item.id}'); if (d) { d.quantity = parseFloat(this.value) || 1.0; window.drawingEngine.redraw(); } }"></span>
                    <span>R:R: <b style="color:#ffeb3b;">${rrRatio}</b></span>
                </div>

                <!-- ETIQUETA INFERIOR -->
                <div style="position:absolute; left:${leftX + 4}px; top:${botBadgeY + 4}px; background:#1e222d; border:1px solid ${!topIsTarget ? '#089981' : '#f23645'}; border-radius:4px; padding:2px 8px; color:#fff; font-size:10px; font-family:monospace; display:flex; align-items:center; gap:8px; box-shadow:0 2px 6px rgba(0,0,0,0.5); cursor:pointer;" onclick="window.drawingEngine && window.drawingEngine.editDrawingParams(window.drawingEngine.drawings.find(d => d.id === '${item.id}'))">
                    <span style="color:${!topIsTarget ? '#089981' : '#f23645'}; font-weight:bold;">${!topIsTarget ? 'TARGET' : 'STOP'}: ${formatPrice(botPriceVal)}</span>
                    <span style="color:#b2b5be;">(${!topIsTarget ? '+' : '-'}${botPct.toFixed(2)}%)</span>
                    <span style="color:${!topIsTarget ? '#089981' : '#f23645'};">Importe: ${!topIsTarget ? '+' : '-'}$${botAmount.toFixed(2)}</span>
                </div>
            `;
        }
    }

    renderSelectionHighlight(item) {
        const p1 = item.p1 ? this.mapToPixel(item.p1) : null;
        const p2 = item.p2 ? this.mapToPixel(item.p2) : null;

        this.ctx.save();
        this.ctx.strokeStyle = '#00e676';
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([4, 4]);

        if (p1 && p2 && p1.x !== null && p2.x !== null) {
            const minX = Math.min(p1.x, p2.x) - 6;
            const minY = Math.min(p1.y, p2.y) - 6;
            const w = Math.abs(p2.x - p1.x) + 12;
            const h = Math.abs(p2.y - p1.y) + 12;
            this.ctx.strokeRect(minX, minY, w, h);
        } else if (p1 && p1.x !== null && p1.y !== null) {
            this.ctx.beginPath();
            this.ctx.arc(p1.x, p1.y, 12, 0, 2 * Math.PI);
            this.ctx.stroke();
        } else if (Array.isArray(item.points) && item.points.length > 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            item.points.forEach(pt => {
                const p = this.mapToPixel(pt);
                if (p.x !== null && p.y !== null) {
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                }
            });
            if (minX !== Infinity) {
                this.ctx.strokeRect(minX - 6, minY - 6, maxX - minX + 12, maxY - minY + 12);
            }
        }
        this.ctx.restore();
    }

    renderVolumeProfile(vrvp) {
        const range = this.chart.timeScale().getVisibleLogicalRange();
        if (!range) return;

        const visibleCandles = vrvp.candles.filter((_, idx) => idx >= range.from && idx <= range.to);
        if (visibleCandles.length === 0) return;

        let minPrice = Infinity, maxPrice = -Infinity;
        visibleCandles.forEach(c => {
            minPrice = Math.min(minPrice, c.low);
            maxPrice = Math.max(maxPrice, c.high);
        });

        if (minPrice === maxPrice) return;

        const numRows = vrvp.numRows || 24;
        const bucketSize = (maxPrice - minPrice) / numRows;

        const buckets = Array.from({ length: numRows }, () => ({ upVol: 0, downVol: 0, totalVol: 0 }));

        visibleCandles.forEach(c => {
            const avgP = (c.open + c.close + c.high + c.low) / 4;
            let bIdx = Math.floor((avgP - minPrice) / bucketSize);
            if (bIdx >= numRows) bIdx = numRows - 1;
            if (bIdx < 0) bIdx = 0;

            if (c.close >= c.open) buckets[bIdx].upVol += c.volume;
            else buckets[bIdx].downVol += c.volume;
            buckets[bIdx].totalVol += c.volume;
        });

        let maxBucketVol = 0;
        let pocIdx = 0;

        buckets.forEach((b, idx) => {
            if (b.totalVol > maxBucketVol) {
                maxBucketVol = b.totalVol;
                pocIdx = idx;
            }
        });

        if (maxBucketVol === 0) return;

        const rightX = this.canvas.width - 55;
        const maxBarWidth = 180;

        buckets.forEach((b, idx) => {
            const bMinP = minPrice + idx * bucketSize;
            const bMaxP = bMinP + bucketSize;

            const yTop = this.mainSeries.priceToCoordinate(bMaxP);
            const yBot = this.mainSeries.priceToCoordinate(bMinP);
            if (yTop === null || yBot === null) return;

            const barHeight = Math.max(Math.abs(yBot - yTop) - 1, 2);
            const totalWidth = (b.totalVol / maxBucketVol) * maxBarWidth;
            const upWidth = b.totalVol > 0 ? (b.upVol / b.totalVol) * totalWidth : 0;
            const downWidth = totalWidth - upWidth;

            this.ctx.fillStyle = idx === pocIdx ? 'rgba(8, 153, 129, 0.75)' : 'rgba(8, 153, 129, 0.45)';
            this.ctx.fillRect(rightX - upWidth - downWidth, Math.min(yTop, yBot), upWidth, barHeight);

            this.ctx.fillStyle = idx === pocIdx ? 'rgba(242, 54, 69, 0.75)' : 'rgba(242, 54, 69, 0.45)';
            this.ctx.fillRect(rightX - downWidth, Math.min(yTop, yBot), downWidth, barHeight);
        });

        const pocPrice = minPrice + (pocIdx + 0.5) * bucketSize;
        const pocY = this.mainSeries.priceToCoordinate(pocPrice);
        if (pocY !== null) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, pocY);
            this.ctx.lineTo(rightX, pocY);
            this.ctx.strokeStyle = '#f23645';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            this.ctx.fillStyle = '#f23645';
            this.ctx.font = 'bold 11px monospace';
            this.ctx.fillText(`POC: ${formatPrice(pocPrice)}`, rightX - 170, pocY - 4);
        }
    }

    renderItem(item) {
        switch (item.type) {
            case 'trend':
            case 'trendline': this.renderTrendline(item); break;
            case 'ray': this.renderRay(item); break;
            case 'horzline': this.renderHorzLine(item); break;
            case 'vertline': this.renderVertLine(item); break;
            case 'fibo': this.renderFibonacci(item); break;
            case 'fibext': this.renderFibExtension(item); break;
            case 'rectangle': this.renderRectangle(item); break;
            case 'ellipse': this.renderEllipse(item); break;
            case 'brush': this.renderBrush(item); break;
            case 'text':
            case 'callout': this.renderText(item); break;
            case 'pricetag': this.renderPriceTag(item); break;
            case 'longpos': this.renderRiskReward(item, true); break;
            case 'shortpos': this.renderRiskReward(item, false); break;
            case 'ruler': this.renderRuler(item); break;
        }
    }

    renderTrendline(item) {
        const p1 = this.mapToPixel(item.p1);
        const p2 = this.mapToPixel(item.p2);
        if (p1.x === null || p1.y === null || p2.x === null || p2.y === null) return;

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.strokeStyle = item.color || '#2962ff';
        this.ctx.lineWidth = 2;
        if (item.isTemp) this.ctx.setLineDash([4, 4]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        const isSel = (item === this.selectedDrawing);
        this.renderAnchor(p1.x, p1.y, isSel);
        this.renderAnchor(p2.x, p2.y, isSel);
    }

    renderRay(item) {
        const p1 = this.mapToPixel(item.p1);
        const p2 = this.mapToPixel(item.p2);
        if (p1.x === null || p1.y === null || p2.x === null || p2.y === null) return;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        let endX = p2.x;
        let endY = p2.y;

        if (dx !== 0 || dy !== 0) {
            let tList = [];
            if (dx > 0) tList.push((this.canvas.width - p1.x) / dx);
            if (dx < 0) tList.push((0 - p1.x) / dx);
            if (dy > 0) tList.push((this.canvas.height - p1.y) / dy);
            if (dy < 0) tList.push((0 - p1.y) / dy);

            const positiveTs = tList.filter(t => t > 0);
            if (positiveTs.length > 0) {
                const t = Math.min(...positiveTs);
                endX = p1.x + t * dx;
                endY = p1.y + t * dy;
            }
        }

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(endX, endY);
        this.ctx.strokeStyle = item.color || '#2962ff';
        this.ctx.lineWidth = 2;
        if (item.isTemp) this.ctx.setLineDash([4, 4]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        const isSel = (item === this.selectedDrawing);
        this.renderAnchor(p1.x, p1.y, isSel);
        this.renderAnchor(p2.x, p2.y, isSel);
    }

    renderHorzLine(item) {
        const p1 = this.mapToPixel(item.p1);
        if (p1.y === null) return;

        this.ctx.beginPath();
        this.ctx.moveTo(0, p1.y);
        this.ctx.lineTo(this.canvas.width, p1.y);
        this.ctx.strokeStyle = item.color || '#ff9800';
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([4, 4]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        this.ctx.fillStyle = '#ff9800';
        this.ctx.font = 'bold 11px monospace';
        this.ctx.fillText(`── ${formatPrice(item.p1.price)}`, this.canvas.width - 110, p1.y - 4);
        
        const isSel = (item === this.selectedDrawing);
        if (p1.x !== null) this.renderAnchor(p1.x, p1.y, isSel);
    }

    renderVertLine(item) {
        const p1 = this.mapToPixel(item.p1);
        if (p1.x === null) return;

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, 0);
        this.ctx.lineTo(p1.x, this.canvas.height);
        this.ctx.strokeStyle = item.color || '#ff9800';
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([4, 4]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        const isSel = (item === this.selectedDrawing);
        if (p1.y !== null) this.renderAnchor(p1.x, p1.y, isSel);
    }

    renderFibonacci(item) {
        const p1 = this.mapToPixel(item.p1);
        const p2 = this.mapToPixel(item.p2);
        if (p1.x === null || p1.y === null || p2.x === null || p2.y === null) return;

        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
        const colors = ['#787b86', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#2962ff'];
        const dy = p2.y - p1.y;
        const leftX = Math.min(p1.x, p2.x);
        const rightX = Math.max(p1.x, p2.x);

        levels.forEach((lvl, idx) => {
            const y = p1.y + dy * lvl;
            const priceVal = item.p1.price + (item.p2.price - item.p1.price) * (1 - lvl);

            this.ctx.beginPath();
            this.ctx.moveTo(leftX, y);
            this.ctx.lineTo(rightX, y);
            this.ctx.strokeStyle = colors[idx % colors.length];
            this.ctx.lineWidth = 1;
            this.ctx.stroke();

            this.ctx.fillStyle = colors[idx % colors.length];
            this.ctx.font = '10px monospace';
            this.ctx.fillText(`${(lvl * 100).toFixed(1)}% (${formatPrice(priceVal)})`, leftX + 5, y - 3);
        });

        const isSel = (item === this.selectedDrawing);
        this.renderAnchor(p1.x, p1.y, isSel);
        this.renderAnchor(p2.x, p2.y, isSel);
    }

    renderFibExtension(item) {
        const p1 = this.mapToPixel(item.p1);
        const p2 = this.mapToPixel(item.p2);
        if (p1.x === null || p1.y === null || p2.x === null || p2.y === null) return;

        const levels = [0, 0.382, 0.618, 1.0, 1.618, 2.618];
        const colors = ['#787b86', '#ff9800', '#089981', '#2962ff', '#9c27b0', '#e91e63'];
        const dy = p2.y - p1.y;
        const leftX = Math.min(p1.x, p2.x);
        const rightX = Math.max(p1.x, p2.x) + 40;

        levels.forEach((lvl, idx) => {
            const y = p1.y + dy * lvl;
            const priceVal = item.p1.price + (item.p2.price - item.p1.price) * lvl;

            this.ctx.beginPath();
            this.ctx.moveTo(leftX, y);
            this.ctx.lineTo(rightX, y);
            this.ctx.strokeStyle = colors[idx % colors.length];
            this.ctx.lineWidth = 1.5;
            this.ctx.setLineDash([2, 2]);
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            this.ctx.fillStyle = colors[idx % colors.length];
            this.ctx.font = '10px monospace';
            this.ctx.fillText(`Ext ${(lvl * 100).toFixed(1)}% (${formatPrice(priceVal)})`, leftX + 5, y - 3);
        });

        const isSel = (item === this.selectedDrawing);
        this.renderAnchor(p1.x, p1.y, isSel);
        this.renderAnchor(p2.x, p2.y, isSel);
    }

    renderRectangle(item) {
        const p1 = this.mapToPixel(item.p1);
        const p2 = this.mapToPixel(item.p2);
        if (p1.x === null || p1.y === null || p2.x === null || p2.y === null) return;

        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);

        this.ctx.fillStyle = 'rgba(8, 153, 129, 0.15)';
        this.ctx.fillRect(x, y, w, h);
        this.ctx.strokeStyle = item.color || '#089981';
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeRect(x, y, w, h);

        const isSel = (item === this.selectedDrawing);
        this.renderAnchor(p1.x, p1.y, isSel);
        this.renderAnchor(p2.x, p2.y, isSel);
    }

    renderEllipse(item) {
        const p1 = this.mapToPixel(item.p1);
        const p2 = this.mapToPixel(item.p2);
        if (p1.x === null || p1.y === null || p2.x === null || p2.y === null) return;

        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        const rx = Math.abs(p2.x - p1.x) / 2;
        const ry = Math.abs(p2.y - p1.y) / 2;

        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        this.ctx.fillStyle = 'rgba(41, 98, 255, 0.15)';
        this.ctx.fill();
        this.ctx.strokeStyle = item.color || '#2962ff';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        const isSel = (item === this.selectedDrawing);
        this.renderAnchor(p1.x, p1.y, isSel);
        this.renderAnchor(p2.x, p2.y, isSel);
    }

    renderBrush(item) {
        if (!item.points || item.points.length < 2) return;
        this.ctx.beginPath();
        const p0 = this.mapToPixel(item.points[0]);
        if (p0.x === null) return;
        this.ctx.moveTo(p0.x, p0.y);

        const isSel = (item === this.selectedDrawing);

        for (let i = 1; i < item.points.length; i++) {
            const p = this.mapToPixel(item.points[i]);
            if (p.x !== null) this.ctx.lineTo(p.x, p.y);
        }
        this.ctx.strokeStyle = item.color || '#00bcd4';
        this.ctx.lineWidth = isSel ? 3 : 2;
        this.ctx.stroke();

        if (isSel) {
            item.points.forEach(pt => {
                const pix = this.mapToPixel(pt);
                if (pix.x !== null) this.renderAnchor(pix.x, pix.y, true);
            });
        }
    }

    renderText(item) {
        const p1 = this.mapToPixel(item.p1);
        if (p1.x === null || p1.y === null) return;

        this.ctx.fillStyle = item.color || '#ffeb3b';
        this.ctx.font = 'bold 12px monospace';
        this.ctx.fillText(`📍 ${item.text}`, p1.x, p1.y);
        
        const isSel = (item === this.selectedDrawing);
        this.renderAnchor(p1.x, p1.y, isSel);
    }

    renderPriceTag(item) {
        const p1 = this.mapToPixel(item.p1);
        if (p1.x === null || p1.y === null) return;

        const label = formatPrice(item.p1.price);
        this.ctx.fillStyle = item.color || '#2962ff';
        this.ctx.fillRect(p1.x, p1.y - 10, 80, 20);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 11px monospace';
        this.ctx.fillText(label, p1.x + 8, p1.y + 4);

        const isSel = (item === this.selectedDrawing);
        this.renderAnchor(p1.x, p1.y, isSel);
    }

    // RENDERIZADO DE POSICIÓN LARGA / CORTA (RISK-REWARD ZONAS EN CANVAS)
    renderRiskReward(item, isLong) {
        const p1 = this.mapToPixel(item.p1);
        const p2 = this.mapToPixel(item.p2);
        if (p1.x === null || p1.y === null || p2.x === null || p2.y === null) return;

        const entryPrice = item.p1.price;
        const targetPrice = item.targetPrice !== undefined ? item.targetPrice : item.p2.price;
        
        let stopPrice = item.stopPrice;
        if (stopPrice === undefined) {
            const diff = Math.abs(targetPrice - entryPrice);
            stopPrice = isLong ? entryPrice - diff : entryPrice + diff;
            item.stopPrice = stopPrice;
        }

        const entryPixel = this.mapToPixel(item.p1);
        const targetPixel = this.mapToPixel({ price: targetPrice, time: item.p1.time });
        const stopPixel = this.mapToPixel({ price: stopPrice, time: item.p1.time });

        if (entryPixel.y === null || targetPixel.y === null || stopPixel.y === null) return;

        const entryY = entryPixel.y;
        const targetY = targetPixel.y;
        const stopY = stopPixel.y;

        const leftX = Math.min(p1.x, p2.x);
        const rightX = Math.max(p1.x, p2.x);
        const width = Math.max(rightX - leftX, 60);

        const minY = Math.min(entryY, targetY, stopY);
        const maxY = Math.max(entryY, targetY, stopY);

        // 1. Zona de Objetivo (VERDE #089981) - Entre Entry y Target
        const targetTopY = Math.min(entryY, targetY);
        const targetHeight = Math.abs(entryY - targetY);
        this.ctx.fillStyle = 'rgba(8, 153, 129, 0.35)';
        this.ctx.fillRect(leftX, targetTopY, width, targetHeight);

        // 2. Zona de Stop Loss (ROJO #f23645) - Entre Entry y Stop
        const stopTopY = Math.min(entryY, stopY);
        const stopHeight = Math.abs(entryY - stopY);
        this.ctx.fillStyle = 'rgba(242, 54, 69, 0.35)';
        this.ctx.fillRect(leftX, stopTopY, width, stopHeight);

        // 3. Borde exterior
        this.ctx.strokeStyle = item.color || (isLong ? '#089981' : '#f23645');
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeRect(leftX, minY, width, maxY - minY);

        // 4. Línea central de Entrada
        this.ctx.beginPath();
        this.ctx.moveTo(leftX, entryY);
        this.ctx.lineTo(leftX + width, entryY);
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        const isSel = (item === this.selectedDrawing);
        this.renderAnchor(p1.x, p1.y, isSel);
        this.renderAnchor(p2.x, p2.y, isSel);
    }

    renderRuler(item) {
        const p1 = this.mapToPixel(item.p1);
        const p2 = this.mapToPixel(item.p2);
        if (p1.x === null || p1.y === null || p2.x === null || p2.y === null) return;

        const priceDiff = item.p2.price - item.p1.price;
        const pctDiff = item.p1.price > 0 ? ((priceDiff) / item.p1.price) * 100 : 0;

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.strokeStyle = '#ffeb3b';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        this.ctx.fillStyle = '#ffeb3b';
        this.ctx.font = 'bold 11px monospace';
        this.ctx.fillText(`📐 ${formatPrice(priceDiff)} (${pctDiff >= 0 ? '+' : ''}${pctDiff.toFixed(2)}%)`, (p1.x + p2.x)/2, (p1.y + p2.y)/2 - 8);

        const isSel = (item === this.selectedDrawing);
        this.renderAnchor(p1.x, p1.y, isSel);
        this.renderAnchor(p2.x, p2.y, isSel);
    }

    renderAnchor(x, y, isSelected = false) {
        if (x === null || y === null) return;
        this.ctx.beginPath();
        this.ctx.arc(x, y, isSelected ? 6 : 4, 0, 2 * Math.PI);
        this.ctx.fillStyle = isSelected ? '#00e676' : '#2962ff';
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = isSelected ? 2 : 1;
        this.ctx.stroke();
    }
}
