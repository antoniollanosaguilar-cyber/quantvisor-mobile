/**
 * Visor Financiero QuantVisor - Aplicación Cuantitativa Desktop & Móvil estilo TradingView
 * Basado en Tauri v2, HTML5 / JS, PWA Móvil y Lightweight Charts v4
 */

// Trampa Global de Errores y Promesas Rechazadas (Zero-Defect SafeGuard)
if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
        console.warn('[QuantVisor SafeGuard] Promesa rechazada no capturada:', event.reason);
        if (event.preventDefault) event.preventDefault();
    });
    window.addEventListener('error', (event) => {
        console.warn('[QuantVisor SafeGuard] Excepción global capturada:', event.message, event.filename, event.lineno);
    });
}

// Compatibilidad Universal: Detección Automática de Tauri Desktop vs Web/Móvil PWA
if (typeof window !== 'undefined' && (!window.__TAURI__ || (!window.__TAURI__.core && !window.__TAURI__.invoke))) {
    console.log("[QuantVisor Bridge] Entorno Móvil/Web detectado. Inicializando puente HTTP/REST...");
    window.__TAURI__ = {
        core: {
            invoke: async (cmd, args = {}) => {
                if (cmd === 'cargar_historial') {
                    const sym = encodeURIComponent(args.simbolo || 'BTC-USD');
                    const intv = encodeURIComponent(args.intervalo || '1h');
                    const res = await fetch(`/api/history?symbol=${sym}&interval=${intv}`);
                    if (!res.ok) throw new Error(`HTTP ${res.status} al cargar historial`);
                    return await res.json();
                }
                if (cmd === 'guardar_dibujos') {
                    const jsonPayload = args.dibujosJson || '[]';
                    try {
                        localStorage.setItem(`quantvisor_drawings_${args.simbolo}`, jsonPayload);
                    } catch (e) {}
                    try {
                        fetch('/api/drawings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ symbol: args.simbolo, drawingsJson: jsonPayload })
                        }).catch(() => {});
                    } catch (e) {}
                    return true;
                }
                if (cmd === 'cargar_dibujos') {
                    try {
                        const res = await fetch(`/api/drawings?symbol=${encodeURIComponent(args.simbolo)}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (data && data.drawingsJson && data.drawingsJson !== '[]') {
                                localStorage.setItem(`quantvisor_drawings_${args.simbolo}`, data.drawingsJson);
                                return data.drawingsJson;
                            }
                        }
                    } catch (e) {}
                    try {
                        return localStorage.getItem(`quantvisor_drawings_${args.simbolo}`) || '[]';
                    } catch (e) {
                        return '[]';
                    }
                }
                if (cmd === 'evaluar_pine_script') {
                    try {
                        const res = await fetch('/api/eval_pine', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(args)
                        });
                        if (res.ok) return await res.json();
                    } catch (e) {}
                    return { plots: [] };
                }
                if (cmd === 'ejecutar_backtest') {
                    try {
                        const res = await fetch('/api/backtest', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(args)
                        });
                        if (res.ok) return await res.json();
                    } catch (e) {}
                    return { balance: 10000, closed_trades: [] };
                }
                return null;
            }
        }
    };
    window.__TAURI__.invoke = window.__TAURI__.core.invoke;
}

// Registro automático de Service Worker para soporte PWA Móvil
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && !window.__TAURI_INTERNALS__) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}

// Estado Global de la Aplicación
let chart = null;
let oscillatorChart = null;
let mainSeries = null;
let activePriceSeries = null;
let volumeSeries = null;
let drawingEngine = null;

let historialVelas = [];
let indicadoresActivos = [
    {
        type: 'SQZMOM',
        name: 'SQZMOM_LB',
        category: 'Oscilador',
        params: { period: 20, mult: 2.0, kcPeriod: 20, kcMult: 1.5, useTrueRange: true },
        styleParams: {},
        seriesList: [],
        visible: true,
        isOscillator: true
    },
    {
        type: 'ADX',
        name: 'DMI/ADX/KEYLEVEL',
        category: 'Oscilador',
        params: { period: 14, keyLevel: 23 },
        styleParams: { colorADX: '#ffffff' },
        seriesList: [],
        visible: true,
        isOscillator: true
    },
    {
        type: 'EMA',
        name: 'Media Móvil Exponencial (EMA)',
        category: 'Tendencia',
        params: { period: 55, color: '#2962ff' },
        styleParams: {},
        seriesList: [],
        visible: true
    },
    {
        type: 'EMA',
        name: 'Media Móvil Exponencial (EMA)',
        category: 'Tendencia',
        params: { period: 10, color: '#ff9800' },
        styleParams: {},
        seriesList: [],
        visible: true
    }
];
let chartStyle = 'candles'; // 'candles', 'line', 'bars'
let currentSymbol = 'BTC-USD';
let currentInterval = '1h';

// Cargar la aplicación al estar listo el DOM
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log("Inicializando QuantVisor Desktop v0.9.10...");
        inicializarGraficos();
        inicializarEventosUI();
        
        // Cargar datos iniciales
        await cambiarSimboloYTemporalidad(currentSymbol, currentInterval);
    } catch (e) {
        console.error("Error crítico al inicializar la aplicación:", e);
    }
});

// CORRECCIÓN 1: Asegurar que el DOM existe y tiene dimensiones antes de inicializar
function inicializarGraficos() {
    const mainContainer = document.getElementById('main-chart-container');
    if (!mainContainer) return;

    // Remover únicamente instancias previas de Lightweight Charts sin destruir los overlays del DOM (#chart-legend, #indicators-legend, etc.)
    const oldCharts = mainContainer.querySelectorAll('.tv-lightweight-charts');
    oldCharts.forEach(c => c.remove());

    // Manejo defensivo contra DOM colapsado (0x0)
    const initWidth = mainContainer.clientWidth > 0 ? mainContainer.clientWidth : 800;
    const initHeight = mainContainer.clientHeight > 0 ? mainContainer.clientHeight : 600;

    chart = LightweightCharts.createChart(mainContainer, {
        width: initWidth,
        height: initHeight,
        layout: {
            background: { type: 'solid', color: '#131722' },
            textColor: '#d1d4dc',
            fontSize: 11,
            fontFamily: '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif',
        },
        grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.1, bottom: 0.2 } },
        timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false, rightOffset: 15 },
    });

    // Serie Principal de Velas Japonesas
    activePriceSeries = chart.addCandlestickSeries({
        upColor: '#089981', downColor: '#f23645',
        borderUpColor: '#089981', borderDownColor: '#f23645',
        wickUpColor: '#089981', wickDownColor: '#f23645',
    });

    // Serie de Volumen en el gráfico principal (reducido para no invadir el gráfico de precios)
    volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
        scaleMargins: {
            top: 0.88,
            bottom: 0,
        },
    });

    if (window.DrawingEngine) {
        drawingEngine = new window.DrawingEngine('main-chart-container', chart, activePriceSeries);
        window.drawingEngine = drawingEngine;
        drawingEngine.onChangeCallback = (drawings) => {
            guardarDibujosSimbolo(currentSymbol, drawings);
        };
    }

    // Usar ResizeObserver nativo garantiza un layout fluido
    new ResizeObserver(() => resizeGraficos()).observe(mainContainer);

    chart.subscribeCrosshairMove(param => {
        if (!param || !param.time || !param.seriesData || param.seriesData.size === 0) {
            if (historialVelas.length > 0) {
                mostrarLeyendaOHLCV(historialVelas[historialVelas.length - 1]);
            }
            return;
        }
        const data = param.seriesData.get(activePriceSeries);
        if (data) {
            mostrarLeyendaOHLCV(data);
        }
    });

    chart.subscribeClick(param => {
        if (typeof handleReplayChartClick === 'function') {
            handleReplayChartClick(param);
        }
    });

    mainContainer.addEventListener('click', (e) => {
        if (typeof handleReplayContainerClick === 'function') {
            handleReplayContainerClick(e);
        }
    });

    window.addEventListener('resize', resizeGraficos);
}

let isSyncingMain = false;
let isSyncingOsc = false;

function garantizarOscilador() {
    const oscContainer = document.getElementById('oscillator-chart-container');
    if (!oscContainer) return null;

    if (!oscillatorChart) {
        oscContainer.style.display = 'block';
        const resizer = document.getElementById('chart-resizer');
        if (resizer) resizer.style.display = 'block';

        const oldCharts = oscContainer.querySelectorAll('.tv-lightweight-charts');
        oldCharts.forEach(c => c.remove());

        const mainContainer = document.getElementById('main-chart-container');
        const chartContainer = document.getElementById('chart-container');
        const initWidth = oscContainer.clientWidth > 0 ? oscContainer.clientWidth : (mainContainer?.clientWidth || chartContainer?.clientWidth || 800);
        const initHeight = oscContainer.clientHeight > 0 ? oscContainer.clientHeight : 230;

        oscillatorChart = LightweightCharts.createChart(oscContainer, {
            width: initWidth,
            height: initHeight,
            layout: {
                background: { type: 'solid', color: '#131722' },
                textColor: '#d1d4dc',
                fontSize: 11,
            },
            grid: {
                vertLines: { color: 'rgba(42, 46, 57, 0.4)' },
                horzLines: { color: 'rgba(42, 46, 57, 0.4)' }
            },
            leftPriceScale: {
                visible: true,
                borderColor: '#2a2e39',
                scaleMargins: { top: 0.1, bottom: 0.1 }
            },
            rightPriceScale: {
                visible: true,
                borderColor: '#2a2e39',
                scaleMargins: { top: 0.1, bottom: 0.1 }
            },
            timeScale: {
                borderColor: '#2a2e39',
                timeVisible: true,
                secondsVisible: false,
                rightOffset: 15
            },
        });

        // Sincronización bidireccional protegida contra bucles infinitos
        chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
            if (isSyncingOsc || !oscillatorChart || !range) return;
            isSyncingMain = true;
            try {
                oscillatorChart.timeScale().setVisibleLogicalRange(range);
            } catch (e) {}
            isSyncingMain = false;
        });

        oscillatorChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
            if (isSyncingMain || !chart || !range) return;
            isSyncingOsc = true;
            try {
                chart.timeScale().setVisibleLogicalRange(range);
            } catch (e) {}
            isSyncingOsc = false;
        });

        if (chart && chart.timeScale()) {
            try {
                const initRange = chart.timeScale().getVisibleLogicalRange();
                if (initRange) oscillatorChart.timeScale().setVisibleLogicalRange(initRange);
            } catch (e) {}
        }

        new ResizeObserver(() => resizeGraficos()).observe(oscContainer);
    } else {
        oscContainer.style.display = 'block';
        const resizer = document.getElementById('chart-resizer');
        if (resizer) resizer.style.display = 'block';
    }

    return oscillatorChart;
}

function resizeGraficos() {
    const mainContainer = document.getElementById('main-chart-container');
    const oscContainer = document.getElementById('oscillator-chart-container');
    const chartContainer = document.getElementById('chart-container');

    if (chart && mainContainer && mainContainer.clientWidth > 0 && mainContainer.clientHeight > 0) {
        chart.applyOptions({
            width: mainContainer.clientWidth,
            height: mainContainer.clientHeight,
        });
    }

    if (oscillatorChart && oscContainer && oscContainer.style.display !== 'none') {
        const oscW = oscContainer.clientWidth > 0 ? oscContainer.clientWidth : (mainContainer ? mainContainer.clientWidth : (chartContainer?.clientWidth || 800));
        const oscH = oscContainer.clientHeight > 0 ? oscContainer.clientHeight : 230;
        oscillatorChart.applyOptions({
            width: oscW,
            height: oscH,
        });
    }

    if (drawingEngine) {
        drawingEngine.resize();
    }

    if (typeof redimensionarPanelesSecundarios === 'function') {
        redimensionarPanelesSecundarios();
    }
}

function mostrarLeyendaOHLCV(data) {
    const legendEl = document.getElementById('chart-legend') || document.getElementById('ohlcv-legend');
    if (!legendEl) return;

    if (!data) {
        legendEl.innerHTML = '';
        return;
    }

    const open = data.open !== undefined ? data.open : data.value;
    const high = data.high !== undefined ? data.high : data.value;
    const low = data.low !== undefined ? data.low : data.value;
    const close = data.close !== undefined ? data.close : data.value;
    const volume = data.volume !== undefined ? data.volume : 0;

    const diff = close - open;
    const diffPct = open > 0 ? (diff / open) * 100 : 0;
    const isUp = diff >= 0;
    const colorClass = isUp ? '#089981' : '#f23645';
    const sign = isUp ? '+' : '';

    legendEl.innerHTML = `
        <span style="color:#ffffff; font-weight:bold;">${currentSymbol}</span> • 
        <span style="color:#787b86;">${currentInterval}</span> • 
        <span style="color:#787b86;">O:</span><span style="color:${colorClass};">${formatPrice(open)}</span> 
        <span style="color:#787b86;">H:</span><span style="color:${colorClass};">${formatPrice(high)}</span> 
        <span style="color:#787b86;">L:</span><span style="color:${colorClass};">${formatPrice(low)}</span> 
        <span style="color:#787b86;">C:</span><span style="color:${colorClass};">${formatPrice(close)}</span> • 
        <span style="color:#787b86;">Vol:</span> <span style="color:#089981;">${formatPrice(volume)}</span> • 
        <span style="color:${colorClass}; font-weight:bold;">${sign}${formatPrice(diff)} (${sign}${diffPct.toFixed(2)}%)</span>
    `;

    const buyPrice = document.getElementById('buy-price');
    const sellPrice = document.getElementById('sell-price');
    if (buyPrice) buyPrice.textContent = formatPrice(close);
    if (sellPrice) sellPrice.textContent = formatPrice(close);

    const wlPrice = document.getElementById(`wl-price-${currentSymbol}`);
    const wlChange = document.getElementById(`wl-change-${currentSymbol}`);
    if (wlPrice) wlPrice.textContent = formatPrice(close);
    if (wlChange) {
        wlChange.textContent = `${sign}${diffPct.toFixed(2)}%`;
        wlChange.className = `watchlist-change ${isUp ? 'up' : 'down'}`;
    }
}

function formatPrice(price) {
    if (price === undefined || price === null || isNaN(price)) return '0.00';
    const absP = Math.abs(price);
    if (absP === 0) return '0.00';
    if (absP < 0.0001) return price.toFixed(8);
    if (absP < 0.01) return price.toFixed(6);
    if (absP < 1) return price.toFixed(4);
    return price.toFixed(2);
}

// PERSISTENCIA DE DIBUJOS VECTORIALES (LOCALSTORAGE + DISCO TAURI IPC)
async function guardarDibujosSimbolo(simbolo, drawings) {
    if (!simbolo) return;
    const cleanSym = simbolo.toUpperCase().trim();
    const jsonStr = JSON.stringify(drawings || []);
    try {
        localStorage.setItem(`quantvisor_drawings_${cleanSym}`, jsonStr);
    } catch (e) {
        console.warn("Error guardando dibujos en localStorage:", e);
    }
    try {
        const invoke = (window.__TAURI__ && window.__TAURI__.core) 
            ? window.__TAURI__.core.invoke 
            : (window.__TAURI__ ? window.__TAURI__.invoke : null);
        if (invoke) {
            await invoke('guardar_dibujos', { simbolo: cleanSym, dibujosJson: jsonStr });
        }
    } catch (e) {
        console.warn("Error persistiendo dibujos en backend:", e);
    }
}

async function cargarDibujosSimbolo(simbolo) {
    if (!simbolo || !drawingEngine) return;
    const cleanSym = simbolo.toUpperCase().trim();
    let drawings = [];

    // 1. Intentar cargar desde el backend Tauri (disco persistente)
    try {
        const invoke = (window.__TAURI__ && window.__TAURI__.core) 
            ? window.__TAURI__.core.invoke 
            : (window.__TAURI__ ? window.__TAURI__.invoke : null);
        if (invoke) {
            const res = await invoke('cargar_dibujos', { simbolo: cleanSym });
            if (res && res !== '[]') {
                drawings = JSON.parse(res);
            }
        }
    } catch (e) {
        console.warn("Fallo cargando dibujos desde backend:", e);
    }

    // 2. Si no se cargó de backend o vino vacío, revisar localStorage
    if (!drawings || drawings.length === 0) {
        try {
            const local = localStorage.getItem(`quantvisor_drawings_${cleanSym}`);
            if (local) {
                drawings = JSON.parse(local);
            }
        } catch (e) {}
    }

    if (drawingEngine) {
        drawingEngine.importDrawings(drawings || []);
    }
}

// INGESTA DE DATOS Y MOTOR EN VIVO
async function cambiarSimboloYTemporalidad(simbolo, temporalidad) {
    const nuevoSimbolo = simbolo.toUpperCase();

    // Guardar dibujos del símbolo saliente antes de conmutar
    if (drawingEngine && currentSymbol) {
        guardarDibujosSimbolo(currentSymbol, drawingEngine.exportDrawings());
    }

    currentSymbol = nuevoSimbolo;
    currentInterval = temporalidad;

    const symbolInput = document.getElementById('ticker-search') || document.getElementById('symbol-input');
    if (symbolInput) {
        symbolInput.value = currentSymbol;
    }
    const mobSymLabel = document.getElementById('mob-sym-label');
    if (mobSymLabel) {
        mobSymLabel.textContent = currentSymbol;
    }
    const p0SymLabel = document.getElementById('p0-sym-label');
    if (p0SymLabel) {
        p0SymLabel.textContent = currentSymbol;
    }
    
    document.querySelectorAll('.tf-btn, .timeframe-btn, .p0-tf-btn').forEach(b => {
        const tf = (b.getAttribute('data-tf') || '').toLowerCase();
        const cur = (currentInterval || '').toLowerCase();
        const isActive = (tf === cur) || 
            ((cur === '1w' || cur === '1s' || cur === 'w') && (tf === '1w' || tf === '1s' || tf === 'w')) ||
            ((cur === '1d' || cur === 'd') && (tf === '1d' || tf === 'd'));
        b.classList.toggle('active', isActive);
    });

    document.querySelectorAll('.watchlist-item').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-symbol') === currentSymbol);
    });

    // Obtener historial vía IPC Tauri Rust (con caché acumulativa profunda)
    try {
        const invoke = (window.__TAURI__ && window.__TAURI__.core) 
            ? window.__TAURI__.core.invoke 
            : (window.__TAURI__ ? window.__TAURI__.invoke : null);

        if (invoke) {
            const candles = await invoke('cargar_historial', {
                simbolo: currentSymbol,
                intervalo: currentInterval
            });
            if (candles && candles.length > 0) {
                cargarDatosVelas(candles);
            } else {
                cargarDatosVelas(generarVelasSinteticas(300));
            }
        } else {
            cargarDatosVelas(generarVelasSinteticas(300));
        }
    } catch (err) {
        console.warn("Fallo al invocar IPC backend, usando velas sintéticas de respaldo:", err);
        cargarDatosVelas(generarVelasSinteticas(300));
    }

    // Cargar los dibujos vectoriales persistidos del nuevo activo
    await cargarDibujosSimbolo(currentSymbol);

    iniciarMotorEnVivoYahoo();
}


function generarVelasSinteticas(count = 300) {
    const candles = [];
    let basePrice = 100;
    if (currentSymbol.includes('BTC')) basePrice = 83000;
    else if (currentSymbol.includes('ETH')) basePrice = 3500;
    else if (currentSymbol.includes('SOL')) basePrice = 180;
    else if (currentSymbol.includes('XAU') || currentSymbol.includes('GOLD')) basePrice = 2650;
    else if (currentSymbol.includes('US100') || currentSymbol.includes('NASDAQ') || currentSymbol.includes('NQ')) basePrice = 20500;
    else if (currentSymbol.includes('SP500') || currentSymbol.includes('ES')) basePrice = 5800;
    else if (currentSymbol.includes('EURUSD')) basePrice = 1.085;
    else if (currentSymbol.includes('NVDA')) basePrice = 135;
    else if (currentSymbol.includes('AAPL')) basePrice = 230;
    else if (currentSymbol.includes('DOGE')) basePrice = 0.14;

    let now = Math.floor(Date.now() / 1000) - count * 60;

    for (let i = 0; i < count; i++) {
        const change = (Math.random() - 0.49) * (basePrice * 0.008);
        const open = basePrice;
        const close = Math.max(0.001, open + change);
        const high = Math.max(open, close) + Math.random() * (basePrice * 0.004);
        const low = Math.max(0.001, Math.min(open, close) - Math.random() * (basePrice * 0.004));
        const volume = Math.floor(Math.random() * 50) + 10;

        candles.push({ time: now + i * 60, open, high, low, close, volume });
        basePrice = close;
    }
    return candles;
}

// MOTOR EN VIVO UNIVERSAL YAHOO FINANCE (Cripto, Oro, Índices, Forex, Acciones)
let livePollingTimer = null;
let watchlistPollingTimer = null;

function intervaloASegundos(intervalo) {
    const intClean = (intervalo || '1h').toLowerCase().trim();
    switch (intClean) {
        case '1m': return 60;
        case '2m': return 120;
        case '3m': return 180;
        case '5m': return 300;
        case '15m': return 900;
        case '30m': return 1800;
        case '1h':
        case '60m': return 3600;
        case '2h':
        case '120m': return 7200;
        case '4h':
        case '240m': return 14400;
        case '1d':
        case 'd': return 86400;
        case '1w':
        case '1wk':
        case 'w':
        case '1s':
        case 's':
        case 'semanal': return 604800;
        case '1mo':
        case '1mth':
        case 'm': return 2592000;
        default: return 3600;
    }
}

function iniciarMotorEnVivoYahoo() {
    if (livePollingTimer) clearInterval(livePollingTimer);
    if (watchlistPollingTimer) clearInterval(watchlistPollingTimer);

    // 1. Polling rápido para el símbolo activo (cada 4 segundos)
    livePollingTimer = setInterval(async () => {
        try {
            const invoke = (window.__TAURI__ && window.__TAURI__.core) 
                ? window.__TAURI__.core.invoke 
                : (window.__TAURI__ ? window.__TAURI__.invoke : null);
            if (!invoke) return;

            const candles = await invoke('cargar_historial', {
                simbolo: currentSymbol,
                intervalo: currentInterval
            });

            if (candles && candles.length > 0) {
                const latest = candles[candles.length - 1];
                if (latest && historialVelas.length > 0) {
                    const currentLast = historialVelas[historialVelas.length - 1];
                    const intervalSecs = intervaloASegundos(currentInterval);
                    const threshold = intervalSecs > 300 ? intervalSecs - 30 : intervalSecs - 5;
                    const timeDiff = latest.time - currentLast.time;

                    if (latest.time === currentLast.time || (timeDiff > 0 && timeDiff < threshold)) {
                        // VELA EN FORMACIÓN (Mismo período nominal):
                        // Actualización in-place en la vela existente fijando el timestamp = currentLast.time.
                        // Esto garantiza que Lightweight Charts actualice mechas y cuerpo en tiempo real
                        // en vez de generar una hilera horizontal de velas espurias hacia el futuro.
                        const updated = {
                            time: currentLast.time,
                            open: currentLast.open,
                            high: Math.max(currentLast.high, latest.high || latest.close),
                            low: Math.min(currentLast.low, latest.low || latest.close),
                            close: latest.close,
                            volume: Math.max(currentLast.volume, latest.volume || 0)
                        };
                        historialVelas[historialVelas.length - 1] = updated;
                        if (activePriceSeries) {
                            if (chartStyle === 'line' || chartStyle === 'area') {
                                activePriceSeries.update({ time: updated.time, value: updated.close });
                            } else {
                                activePriceSeries.update(updated);
                            }
                        }
                        if (volumeSeries) {
                            volumeSeries.update({
                                time: currentLast.time,
                                value: updated.volume,
                                color: updated.close >= updated.open ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)'
                            });
                        }
                        mostrarLeyendaOHLCV(updated);
                        if (window.MT5Emulator && (window.MT5Emulator.symbol === currentSymbol || !window.MT5Emulator.symbol)) {
                            window.MT5Emulator.onTick(updated);
                        }
                    } else if (timeDiff >= threshold) {
                        // Período nominal cumplido: Apertura legítima de nueva vela
                        historialVelas.push(latest);
                        if (activePriceSeries) {
                            if (chartStyle === 'line' || chartStyle === 'area') {
                                activePriceSeries.update({ time: latest.time, value: latest.close });
                            } else {
                                activePriceSeries.update(latest);
                            }
                        }
                        if (volumeSeries) {
                            volumeSeries.update({
                                time: latest.time,
                                value: latest.volume,
                                color: latest.close >= latest.open ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)'
                            });
                        }
                        mostrarLeyendaOHLCV(latest);
                        if (window.MT5Emulator && (window.MT5Emulator.symbol === currentSymbol || !window.MT5Emulator.symbol)) {
                            window.MT5Emulator.onTick(latest);
                        }
                    }
                    if (drawingEngine) drawingEngine.redraw();
                }
            }
        } catch (e) {}
    }, 4000);

    // 2. Polling periódico para cotizaciones de toda la Watchlist (cada 10 segundos)
    watchlistPollingTimer = setInterval(async () => {
        try {
            const invoke = (window.__TAURI__ && window.__TAURI__.core) 
                ? window.__TAURI__.core.invoke 
                : (window.__TAURI__ ? window.__TAURI__.invoke : null);
            if (!invoke) return;

            const items = document.querySelectorAll('.watchlist-item');
            for (const item of items) {
                const sym = item.getAttribute('data-symbol');
                if (!sym || sym === currentSymbol) continue;
                try {
                    const candles = await invoke('cargar_historial', {
                        simbolo: sym,
                        intervalo: '1d'
                    });
                    if (candles && candles.length > 0) {
                        const last = candles[candles.length - 1];
                        const open = last.open || last.close;
                        const close = last.close;
                        const diff = close - open;
                        const diffPct = open > 0 ? (diff / open) * 100 : 0;
                        const isUp = diff >= 0;
                        const sign = isUp ? '+' : '';

                        const wlPrice = document.getElementById(`wl-price-${sym}`);
                        const wlChange = document.getElementById(`wl-change-${sym}`);
                        if (wlPrice) wlPrice.textContent = formatPrice(close);
                        if (wlChange) {
                            wlChange.textContent = `${sign}${diffPct.toFixed(2)}%`;
                            wlChange.className = `watchlist-change ${isUp ? 'up' : 'down'}`;
                        }
                    }
                } catch (err) {}
            }
        } catch (e) {}
    }, 10000);
}

// CORRECCIÓN: Sanitización de tiempo, deduplicación, coalescencia estricta por timeframe y mapeo correcto
async function cargarDatosVelas(candles) {
    if (!candles || candles.length === 0) return;

    const intervalSecs = intervaloASegundos(currentInterval);
    const threshold = intervalSecs > 300 ? intervalSecs - 30 : intervalSecs - 5;

    // 1. Normalización de Timestamps (Milisegundos -> Segundos)
    // 2. Orden cronológico ascendente (Requisito estricto LWC)
    const rawList = candles.map(c => {
        let t = c.time;
        if (typeof t === 'number' && t > 10000000000) t = Math.floor(t / 1000); // Si viene en ms
        return { 
            time: t, 
            open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), 
            volume: parseFloat(c.volume) || 0 
        };
    }).sort((a, b) => a.time - b.time);

    // 3. Coalescencia estricta para consolidar micro-ticks y prevenir velas espurias hacia el futuro
    const coalesced = [];
    for (const c of rawList) {
        if (coalesced.length === 0) {
            coalesced.push(c);
            continue;
        }
        const last = coalesced[coalesced.length - 1];
        if (c.time === last.time) {
            coalesced[coalesced.length - 1] = c;
        } else if ((c.time - last.time) < threshold) {
            last.high = Math.max(last.high, c.high);
            last.low = Math.min(last.low, c.low);
            last.close = c.close;
            last.volume = Math.max(last.volume, c.volume);
        } else {
            coalesced.push(c);
        }
    }

    historialVelas = coalesced;

    // Exportaciones globales para el visor QuantVisor v7.0
    window.historialVelas = historialVelas;
    window.chart = chart;
    window.oscillatorChart = oscillatorChart;
    window.activePriceSeries = activePriceSeries;
    window.indicadoresActivos = indicadoresActivos;
    window.garantizarOscilador = garantizarOscilador;
    window.drawingEngine = drawingEngine;

    // Sincronizar velas con el motor de dibujo para posicionamiento y snapping exacto
    if (drawingEngine) {
        drawingEngine.setCandles(historialVelas);
    }

    // Inyectar datos de velas en CandlestickSeries o Line/Area
    if (activePriceSeries) {
        if (chartStyle === 'line' || chartStyle === 'area') {
            activePriceSeries.setData(historialVelas.map(c => ({ time: c.time, value: c.close })));
        } else {
            activePriceSeries.setData(historialVelas);
        }
    }

    if (window.MT5Emulator && (window.MT5Emulator.symbol === currentSymbol || !window.MT5Emulator.symbol)) {
        window.MT5Emulator.setCandles(historialVelas);
    }

    if (volumeSeries) {
        const volumeData = historialVelas.map(c => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)'
        }));
        volumeSeries.setData(volumeData);
    }
    
    if (chart && chart.timeScale()) {
        const total = historialVelas.length;
        if (total > 120) {
            // Enfocar las últimas 120 velas para visualización cómoda estándar TradingView,
            // dejando espacio hacia adelante (+18 velas) para proyectar dibujos futuros y análisis técnico
            chart.timeScale().setVisibleLogicalRange({
                from: Math.max(0, total - 120),
                to: total + 18
            });
        } else {
            chart.timeScale().fitContent();
        }
    }

    if (drawingEngine) {
        drawingEngine.redraw();
    }

    const ultimaVela = historialVelas[historialVelas.length - 1];
    mostrarLeyendaOHLCV(ultimaVela);

    recalcularYRenderizarIndicadores();

    if (window.StrategyTester && typeof window.StrategyTester.onCandlesLoaded === 'function') {
        window.StrategyTester.onCandlesLoaded();
    }
}

function recalcularYRenderizarIndicadores() {
    if (!historialVelas || historialVelas.length === 0) return;

    let hayOscilador = false;
    const oscContainer = document.getElementById('oscillator-chart-container');

    // Limpiar series previas de indicadores
    indicadoresActivos.forEach(ind => {
        if (ind.seriesList) {
            ind.seriesList.forEach(s => {
                try {
                    if (ind.isOscillator && oscillatorChart) oscillatorChart.removeSeries(s);
                    else if (chart) chart.removeSeries(s);
                } catch (e) {}
            });
        }
        ind.seriesList = [];
    });

    indicadoresActivos.forEach(ind => {
        try {
            if (ind.type === 'SQZMOM') {
                hayOscilador = true;
                const oscChart = garantizarOscilador();
                const { histogram, dots } = window.IndicatorsEngine.calcularSqueezeMomentum(
                    historialVelas,
                    ind.params.period || 20,
                    ind.params.mult || 2.0,
                    ind.params.kcPeriod || 20,
                    ind.params.kcMult || 1.5,
                    ind.params.useTrueRange !== false,
                    ind.styleParams || {}
                );

                const sHist = oscChart.addHistogramSeries({
                    priceScaleId: 'left',
                    title: 'SQZMOM'
                });
                sHist.setData(histogram);

                const sDots = oscChart.addLineSeries({
                    priceScaleId: 'left',
                    color: 'rgba(0, 0, 0, 0)',
                    lineWidth: 1,
                    lastValueVisible: false,
                    priceLineVisible: false,
                    crosshairMarkerVisible: false
                });
                sDots.setData(dots.map(d => ({ time: d.time, value: 0 })));
                if (dots.length > 0) {
                    sDots.setMarkers(dots.map(d => ({
                        time: d.time,
                        position: 'inBar',
                        color: d.color,
                        shape: 'circle',
                        size: 1
                    })));
                }

                ind.seriesList.push(sHist, sDots);
                ind.isOscillator = true;
            }
            else if (ind.type === 'ADX') {
                hayOscilador = true;
                const oscChart = garantizarOscilador();
                const { adx, keyLevel } = window.IndicatorsEngine.calcularADX(
                    historialVelas,
                    ind.params.period || 14,
                    ind.params.keyLevel || 23
                );

                const sAdx = oscChart.addLineSeries({ color: ind.styleParams?.colorADX || '#ffffff', lineWidth: 2, title: 'ADX', priceScaleId: 'right' });
                const sKl = oscChart.addLineSeries({ color: ind.styleParams?.colorKL || '#787b86', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, title: 'Key Level', priceScaleId: 'right' });

                sAdx.setData(adx); sKl.setData(keyLevel);
                ind.seriesList.push(sAdx, sKl);
                ind.isOscillator = true;
            }
            else if (ind.type === 'VRVP') {
                if (drawingEngine) {
                    drawingEngine.vrvpData = {
                        candles: historialVelas,
                        numRows: ind.params?.period || 24,
                        enabled: true
                    };
                    drawingEngine.redraw();
                }
            }
            else if (ind.type === 'EMA') {
                const data = window.IndicatorsEngine.calcularEMA(historialVelas, ind.params?.period || 20);
                const s = chart.addLineSeries({ color: ind.params?.color || '#ff9800', lineWidth: 2, title: `EMA ${ind.params?.period || 20}` });
                s.setData(data); ind.seriesList.push(s);
            }
            else if (ind.type === 'SMA') {
                const data = window.IndicatorsEngine.calcularSMA(historialVelas, ind.params?.period || 50);
                const s = chart.addLineSeries({ color: ind.params?.color || '#2962ff', lineWidth: 2, title: `SMA ${ind.params?.period || 50}` });
                s.setData(data); ind.seriesList.push(s);
            }
            else if (ind.type === 'WMA') {
                const data = window.IndicatorsEngine.calcularWMA(historialVelas, ind.params?.period || 20);
                const s = chart.addLineSeries({ color: ind.params?.color || '#00bcd4', lineWidth: 2, title: `WMA ${ind.params?.period || 20}` });
                s.setData(data); ind.seriesList.push(s);
            }
            else if (ind.type === 'RSI') {
                hayOscilador = true;
                const oscChart = garantizarOscilador();
                const data = window.IndicatorsEngine.calcularRSI(historialVelas, ind.params?.period || 14);
                const s = oscChart.addLineSeries({ color: ind.params?.color || '#e91e63', lineWidth: 2, title: `RSI ${ind.params?.period || 14}`, priceScaleId: 'right' });
                s.setData(data); ind.seriesList.push(s); ind.isOscillator = true;
            }
            else if (ind.type === 'MACD') {
                hayOscilador = true;
                const oscChart = garantizarOscilador();
                const { macdLine, signalLine, histogram } = window.IndicatorsEngine.calcularMACD(historialVelas, ind.params?.fastP || 12, ind.params?.slowP || 26, ind.params?.sigP || 9);
                const sMacd = oscChart.addLineSeries({ color: ind.params?.color || '#2962ff', lineWidth: 2, title: `MACD`, priceScaleId: 'right' });
                const sSig = oscChart.addLineSeries({ color: '#ff9800', lineWidth: 1.5, title: `Signal`, priceScaleId: 'right' });
                const sHist = oscChart.addHistogramSeries({ priceScaleId: 'right', title: 'MACD Hist' });
                sMacd.setData(macdLine); sSig.setData(signalLine); sHist.setData(histogram);
                ind.seriesList.push(sMacd, sSig, sHist); ind.isOscillator = true;
            }
            else if (ind.type === 'BB') {
                const { basis, upper, lower } = window.IndicatorsEngine.calcularBollinger(historialVelas, ind.params?.period || 20, ind.params?.mult || 2.0);
                const sUpper = chart.addLineSeries({ color: ind.params?.color || '#2196f3', lineWidth: 1.5, title: `BB Upper` });
                const sBasis = chart.addLineSeries({ color: '#ff9800', lineWidth: 1.5, title: `BB Basis` });
                const sLower = chart.addLineSeries({ color: ind.params?.color || '#2196f3', lineWidth: 1.5, title: `BB Lower` });
                sUpper.setData(upper); sBasis.setData(basis); sLower.setData(lower);
                ind.seriesList.push(sUpper, sBasis, sLower);
            }
            else if (ind.type === 'DONCHIAN') {
                const { upper, basis, lower } = window.IndicatorsEngine.calcularDonchian(historialVelas, ind.params?.period || 20);
                const sUpper = chart.addLineSeries({ color: ind.params?.color || '#00bcd4', lineWidth: 1.5, title: `Donchian Upper` });
                const sBasis = chart.addLineSeries({ color: '#ff9800', lineWidth: 1.5, title: `Donchian Basis` });
                const sLower = chart.addLineSeries({ color: ind.params?.color || '#00bcd4', lineWidth: 1.5, title: `Donchian Lower` });
                sUpper.setData(upper); sBasis.setData(basis); sLower.setData(lower);
                ind.seriesList.push(sUpper, sBasis, sLower);
            }
            else if (ind.type === 'KELTNER') {
                const { upper, basis, lower } = window.IndicatorsEngine.calcularKeltner(historialVelas, ind.params?.period || 20, ind.params?.mult || 2.0);
                const sUpper = chart.addLineSeries({ color: ind.params?.color || '#4caf50', lineWidth: 1.5, title: `Keltner Upper` });
                const sBasis = chart.addLineSeries({ color: '#ff9800', lineWidth: 1.5, title: `Keltner Basis` });
                const sLower = chart.addLineSeries({ color: ind.params?.color || '#4caf50', lineWidth: 1.5, title: `Keltner Lower` });
                sUpper.setData(upper); sBasis.setData(basis); sLower.setData(lower);
                ind.seriesList.push(sUpper, sBasis, sLower);
            }
            else if (ind.type === 'STOCH') {
                hayOscilador = true;
                const oscChart = garantizarOscilador();
                const { k, d } = window.IndicatorsEngine.calcularStoch(historialVelas, ind.params?.period || 14, ind.params?.smoothK || 3, ind.params?.smoothD || 3);
                const sK = oscChart.addLineSeries({ color: ind.params?.color || '#ff9800', lineWidth: 2, title: `Stoch %K`, priceScaleId: 'right' });
                const sD = oscChart.addLineSeries({ color: '#2196f3', lineWidth: 1.5, title: `Stoch %D`, priceScaleId: 'right' });
                sK.setData(k); sD.setData(d);
                ind.seriesList.push(sK, sD); ind.isOscillator = true;
            }
            else if (ind.type === 'ATR') {
                hayOscilador = true;
                const oscChart = garantizarOscilador();
                const data = window.IndicatorsEngine.calcularATR(historialVelas, ind.params?.period || 14);
                const s = oscChart.addLineSeries({ color: ind.params?.color || '#9c27b0', lineWidth: 2, title: `ATR ${ind.params?.period || 14}`, priceScaleId: 'left' });
                s.setData(data); ind.seriesList.push(s); ind.isOscillator = true;
            }
            else if (ind.type === 'SUPERTREND') {
                const data = window.IndicatorsEngine.calcularSupertrend(historialVelas, ind.params?.period || 10, ind.params?.mult || 3.0);
                const s = chart.addLineSeries({ color: ind.params?.color || '#089981', lineWidth: 2, title: `Supertrend` });
                s.setData(data); ind.seriesList.push(s);
            }
            else if (ind.type === 'VWAP') {
                const data = window.IndicatorsEngine.calcularVWAP(historialVelas);
                const s = chart.addLineSeries({ color: ind.params?.color || '#e91e63', lineWidth: 2, title: `VWAP` });
                s.setData(data); ind.seriesList.push(s);
            }
            else if (ind.type === 'CCI') {
                hayOscilador = true;
                const oscChart = garantizarOscilador();
                const data = window.IndicatorsEngine.calcularCCI(historialVelas, ind.params?.period || 20);
                const s = oscChart.addLineSeries({ color: ind.params?.color || '#ff9800', lineWidth: 2, title: `CCI ${ind.params?.period || 20}`, priceScaleId: 'right' });
                s.setData(data); ind.seriesList.push(s); ind.isOscillator = true;
            }
            else if (ind.type === 'ROC') {
                hayOscilador = true;
                const oscChart = garantizarOscilador();
                const data = window.IndicatorsEngine.calcularROC(historialVelas, ind.params?.period || 12);
                const s = oscChart.addLineSeries({ color: ind.params?.color || '#00bcd4', lineWidth: 2, title: `ROC ${ind.params?.period || 12}`, priceScaleId: 'right' });
                s.setData(data); ind.seriesList.push(s); ind.isOscillator = true;
            }
            else if (ind.type === 'MFI') {
                hayOscilador = true;
                const oscChart = garantizarOscilador();
                const data = window.IndicatorsEngine.calcularMFI(historialVelas, ind.params?.period || 14);
                const s = oscChart.addLineSeries({ color: ind.params?.color || '#9c27b0', lineWidth: 2, title: `MFI ${ind.params?.period || 14}`, priceScaleId: 'right' });
                s.setData(data); ind.seriesList.push(s); ind.isOscillator = true;
            }
            else if (ind.type === 'OBV') {
                hayOscilador = true;
                const oscChart = garantizarOscilador();
                const data = window.IndicatorsEngine.calcularOBV(historialVelas);
                const s = oscChart.addLineSeries({ color: ind.params?.color || '#ff9800', lineWidth: 2, title: `OBV`, priceScaleId: 'left' });
                s.setData(data); ind.seriesList.push(s); ind.isOscillator = true;
            }
            else if (ind.type === 'HMA') {
                const data = window.IndicatorsEngine.calcularHMA(historialVelas, ind.params?.period || 9);
                const s = chart.addLineSeries({ color: ind.params?.color || '#00e676', lineWidth: 2, title: `HMA ${ind.params?.period || 9}` });
                s.setData(data); ind.seriesList.push(s);
            }
            else if (ind.type === 'PINE' && ind.code) {
                const invoke = (window.__TAURI__ && window.__TAURI__.core) 
                    ? window.__TAURI__.core.invoke 
                    : (window.__TAURI__ ? window.__TAURI__.invoke : null);
                if (invoke) {
                    invoke('evaluar_pine_script', {
                        code: ind.code,
                        candles: historialVelas
                    }).then(evalOutput => {
                        if (evalOutput && evalOutput.plots) {
                            evalOutput.plots.forEach(plot => {
                                let targetChart = chart;
                                if (plot.is_oscillator) {
                                    hayOscilador = true;
                                    const oscChart = garantizarOscilador();
                                    targetChart = oscChart || chart;
                                    if (oscContainer) oscContainer.style.display = 'block';
                                    const resizer = document.getElementById('chart-resizer');
                                    if (resizer) resizer.style.display = 'block';
                                    resizeGraficos();
                                }
                                const series = plot.plot_style === 'Histogram'
                                    ? targetChart.addHistogramSeries({
                                        title: plot.name || ind.name,
                                        color: plot.color || '#2962ff',
                                        priceScaleId: plot.is_oscillator ? 'left' : ''
                                    })
                                    : targetChart.addLineSeries({
                                        title: plot.name || ind.name,
                                        color: plot.color || '#2962ff',
                                        lineWidth: 2,
                                        priceScaleId: plot.is_oscillator ? 'right' : ''
                                    });
                                series.setData(plot.points.map(pt => ({
                                    time: pt.time,
                                    value: pt.value,
                                    color: pt.color || undefined
                                })));
                                ind.seriesList.push(series);
                            });
                        }
                    }).catch(err => console.warn("Error evaluando Pine Script:", err));
                }
            }
        } catch (errInd) {
            console.error("Error al procesar indicador:", ind, errInd);
        }
    });

    if (oscContainer) oscContainer.style.display = hayOscilador ? 'block' : 'none';
    const resizer = document.getElementById('chart-resizer');
    if (resizer) resizer.style.display = hayOscilador ? 'block' : 'none';
    resizeGraficos();

    if (oscillatorChart && chart && chart.timeScale()) {
        try {
            const range = chart.timeScale().getVisibleLogicalRange();
            if (range) {
                oscillatorChart.timeScale().setVisibleLogicalRange(range);
            }
        } catch (e) {}
    }

    actualizarLeyendaIndicadoresUI();

    if (typeof sincronizarIndicadoresEnPanelesSecundarios === 'function') {
        sincronizarIndicadoresEnPanelesSecundarios();
    }
}

// CATÁLOGO DE INDICADORES COMPLETO (20+ TOP INDICADORES TRADINGVIEW)
const CATALOGO_INDICADORES = [
  { type: 'SQZMOM', name: 'Squeeze Momentum Indicator (SQZMOM_LB)', category: 'Oscilador', defaultParams: { period: 20, mult: 2.0, kcPeriod: 20, kcMult: 1.5, useTrueRange: true } },
  { type: 'ADX', name: 'DMI/ADX/KEYLEVEL', category: 'Oscilador', defaultParams: { period: 14, keyLevel: 23 } },
  { type: 'VRVP', name: 'Perfil de Volumen del Rango Visible (VRVP / POC)', category: 'Perfil de Volumen', defaultParams: { period: 24, color: '#f23645' } },
  { type: 'EMA', name: 'Media Móvil Exponencial (EMA)', category: 'Tendencia', defaultParams: { period: 20, color: '#ff9800' } },
  { type: 'SMA', name: 'Media Móvil Simple (SMA)', category: 'Tendencia', defaultParams: { period: 50, color: '#2962ff' } },
  { type: 'WMA', name: 'Media Móvil Ponderada (WMA)', category: 'Tendencia', defaultParams: { period: 20, color: '#00bcd4' } },
  { type: 'RSI', name: 'Índice de Fuerza Relativa (RSI)', category: 'Oscilador', defaultParams: { period: 14, color: '#e91e63' } },
  { type: 'MACD', name: 'MACD (Convergencia/Divergencia)', category: 'Oscilador', defaultParams: { fastP: 12, slowP: 26, sigP: 9, color: '#2962ff' } },
  { type: 'BB', name: 'Bandas de Bollinger (BB)', category: 'Volatilidad', defaultParams: { period: 20, mult: 2.0, color: '#2196f3' } },
  { type: 'DONCHIAN', name: 'Canales de Donchian', category: 'Volatilidad', defaultParams: { period: 20, color: '#00bcd4' } },
  { type: 'KELTNER', name: 'Canales de Keltner', category: 'Volatilidad', defaultParams: { period: 20, mult: 2.0, color: '#4caf50' } },
  { type: 'STOCH', name: 'Oscilador Estocástico', category: 'Oscilador', defaultParams: { period: 14, smoothK: 3, smoothD: 3, color: '#ff9800' } },
  { type: 'ATR', name: 'Rango Verdadero Promedio (ATR)', category: 'Volatilidad', defaultParams: { period: 14, color: '#9c27b0' } },
  { type: 'SUPERTREND', name: 'Supertendencia (Supertrend)', category: 'Tendencia', defaultParams: { period: 10, mult: 3.0, color: '#089981' } },
  { type: 'VWAP', name: 'Precio Medio Ponderado por Volumen (VWAP)', category: 'Volatilidad', defaultParams: { color: '#e91e63' } },
  { type: 'CCI', name: 'Índice del Canal de Mercancías (CCI)', category: 'Oscilador', defaultParams: { period: 20, color: '#ff9800' } },
  { type: 'ROC', name: 'Tasa de Cambio (ROC)', category: 'Oscilador', defaultParams: { period: 12, color: '#00bcd4' } },
  { type: 'MFI', name: 'Índice de Flujo de Dinero (MFI)', category: 'Oscilador', defaultParams: { period: 14, color: '#9c27b0' } },
  { type: 'OBV', name: 'Volumen en Balance (OBV)', category: 'Perfil de Volumen', defaultParams: { color: '#ff9800' } },
  { type: 'HMA', name: 'Media Móvil de Hull (HMA)', category: 'Tendencia', defaultParams: { period: 9, color: '#00e676' } }
];

function actualizarLeyendaIndicadoresUI() {
    const legendDiv = document.getElementById('indicators-legend');
    if (!legendDiv) return;
    legendDiv.innerHTML = '';

    indicadoresActivos.forEach((ind, index) => {
        const item = document.createElement('div');
        item.className = 'indicator-item';

        const title = document.createElement('span');
        let paramLabel = (ind.params && ind.params.period) ? ` ${ind.params.period}` : '';
        if (ind.type === 'ADX' && ind.params) paramLabel = ` ${ind.params.period || 14} ${ind.params.keyLevel || 23}`;
        if (ind.type === 'SQZMOM' && ind.params) paramLabel = ` ${ind.params.period || 20} ${ind.params.mult || 2} ${ind.params.kcPeriod || 20} ${ind.params.kcMult || 1.5}`;
        if (ind.type === 'MACD' && ind.params) paramLabel = ` ${ind.params.fastP || 12} ${ind.params.slowP || 26} ${ind.params.sigP || 9}`;
        title.textContent = `${ind.name}${paramLabel}`;

        const btnEye = document.createElement('button');
        btnEye.className = 'indicator-btn';
        btnEye.innerHTML = '👁️';
        btnEye.onclick = () => {
            ind.visible = !ind.visible;
            btnEye.style.opacity = ind.visible ? '1' : '0.3';
            ind.seriesList.forEach(s => s.applyOptions({ visible: ind.visible }));
        };

        const btnSettings = document.createElement('button');
        btnSettings.className = 'indicator-btn';
        btnSettings.innerHTML = '⚙️';
        btnSettings.onclick = () => abrirModalConfiguracionIndicador(index);

        const btnDelete = document.createElement('button');
        btnDelete.className = 'indicator-btn';
        btnDelete.innerHTML = '❌';
        btnDelete.onclick = () => {
            ind.seriesList.forEach(s => {
                try {
                    if (ind.isOscillator && oscillatorChart) oscillatorChart.removeSeries(s);
                    else if (chart) chart.removeSeries(s);
                } catch (e) {}
            });
            indicadoresActivos.splice(index, 1);
            recalcularYRenderizarIndicadores();
        };

        item.appendChild(title);
        item.appendChild(btnEye);
        item.appendChild(btnSettings);
        item.appendChild(btnDelete);
        legendDiv.appendChild(item);
    });
}

// MODAL CONFIGURACIÓN PESTAÑAS (TODOS LOS 20 INDICADORES)
function abrirModalConfiguracionIndicador(index) {
    const ind = indicadoresActivos[index];
    if (!ind) return;
    if (!ind.params) ind.params = {};
    if (!ind.styleParams) ind.styleParams = {};

    const modal = document.getElementById('indicator-settings-modal');
    if (!modal) return;
    const title = document.getElementById('settings-modal-title');
    if (title) title.innerText = ind.name;

    const paneInputs = document.getElementById('pane-inputs');
    const paneStyle = document.getElementById('pane-style');
    if (!paneInputs || !paneStyle) return;

    paneInputs.innerHTML = '';
    paneStyle.innerHTML = '';

    const getPlotTypeSelectHTML = (currentPlot = 'line') => `
        <div class="setting-row">
            <label>Trazado del gráfico:</label>
            <select id="input-param-plot-type">
                <option value="line" ${currentPlot === 'line' ? 'selected' : ''}>Línea (Line)</option>
                <option value="stepline" ${currentPlot === 'stepline' ? 'selected' : ''}>Línea escalonada</option>
                <option value="histogram" ${currentPlot === 'histogram' ? 'selected' : ''}>Histograma</option>
                <option value="area" ${currentPlot === 'area' ? 'selected' : ''}>Área</option>
                <option value="columns" ${currentPlot === 'columns' ? 'selected' : ''}>Columnas</option>
                <option value="circles" ${currentPlot === 'circles' ? 'selected' : ''}>Círculos</option>
            </select>
        </div>
    `;

    if (ind.type === 'SQZMOM') {
        paneInputs.innerHTML = `
            <div class="setting-row"><label>BB Length:</label><input type="number" id="input-sqz-bblength" value="${ind.params.period || 20}" min="1"></div>
            <div class="setting-row"><label>BB MultFactor:</label><input type="number" id="input-sqz-bbmult" value="${ind.params.mult || 2.0}" step="0.1" min="0.1"></div>
            <div class="setting-row"><label>KC Length:</label><input type="number" id="input-sqz-kclength" value="${ind.params.kcPeriod || 20}" min="1"></div>
            <div class="setting-row"><label>KC MultFactor:</label><input type="number" id="input-sqz-kcmult" value="${ind.params.kcMult || 1.5}" step="0.1" min="0.1"></div>
            <div class="setting-row"><label><input type="checkbox" id="input-sqz-truerange" ${ind.params.useTrueRange !== false ? 'checked' : ''}> Use TrueRange (KC)</label></div>
        `;
        paneStyle.innerHTML = `
            ${getPlotTypeSelectHTML(ind.styleParams?.plotType || 'histogram')}
            <div class="setting-row" style="margin-left: 15px;"><label>Color 0 (Alcista Fuerte):</label><input type="color" id="col-sqz-0" value="${ind.styleParams?.col0 || '#00e676'}"></div>
            <div class="setting-row" style="margin-left: 15px;"><label>Color 1 (Alcista Débil):</label><input type="color" id="col-sqz-1" value="${ind.styleParams?.col1 || '#089981'}"></div>
            <div class="setting-row" style="margin-left: 15px;"><label>Color 2 (Bajista Fuerte):</label><input type="color" id="col-sqz-2" value="${ind.styleParams?.col2 || '#ff1744'}"></div>
            <div class="setting-row" style="margin-left: 15px;"><label>Color 3 (Bajista Débil):</label><input type="color" id="col-sqz-3" value="${ind.styleParams?.col3 || '#f23645'}"></div>
            <div class="setting-section-title">Puntos Squeeze</div>
            <div class="setting-row" style="margin-left: 15px;"><label>Color 0 (Squeeze On):</label><input type="color" id="col-sqz-dot0" value="${ind.styleParams?.dot0 || '#2962ff'}"></div>
            <div class="setting-row" style="margin-left: 15px;"><label>Color 1 (No Squeeze):</label><input type="color" id="col-sqz-dot1" value="${ind.styleParams?.dot1 || '#000000'}"></div>
            <div class="setting-row" style="margin-left: 15px;"><label>Color 2 (Squeeze Off):</label><input type="color" id="col-sqz-dot2" value="${ind.styleParams?.dot2 || '#787b86'}"></div>
        `;
    }
    else if (ind.type === 'ADX') {
        paneInputs.innerHTML = `
            <div class="setting-row"><label>Período ADX / Longitud:</label><input type="number" id="input-param-period" value="${ind.params.period || 14}" min="1"></div>
            <div class="setting-row"><label>Key Level (Nivel Clave):</label><input type="number" id="input-param-keylevel" value="${ind.params.keyLevel || 23}" min="1"></div>
        `;
        paneStyle.innerHTML = `
            ${getPlotTypeSelectHTML(ind.styleParams?.plotType || 'line')}
            <div class="setting-row"><label>Color ADX:</label><input type="color" id="col-adx" value="${ind.styleParams?.colorADX || '#ffffff'}"></div>
            <div class="setting-row"><label>Color +DI:</label><input type="color" id="col-pdi" value="${ind.styleParams?.colorPDI || '#089981'}"></div>
            <div class="setting-row"><label>Color -DI:</label><input type="color" id="col-ndi" value="${ind.styleParams?.colorNDI || '#f23645'}"></div>
            <div class="setting-row"><label>Color Key Level:</label><input type="color" id="col-kl" value="${ind.styleParams?.colorKL || '#787b86'}"></div>
        `;
    }
    else if (ind.type === 'MACD') {
        paneInputs.innerHTML = `
            <div class="setting-row"><label>Longitud Rápida (Fast):</label><input type="number" id="input-macd-fast" value="${ind.params.fastP || 12}" min="1"></div>
            <div class="setting-row"><label>Longitud Lenta (Slow):</label><input type="number" id="input-macd-slow" value="${ind.params.slowP || 26}" min="1"></div>
            <div class="setting-row"><label>Suavizado Señal (Signal):</label><input type="number" id="input-macd-sig" value="${ind.params.sigP || 9}" min="1"></div>
        `;
        paneStyle.innerHTML = `
            ${getPlotTypeSelectHTML(ind.styleParams?.plotType || 'line')}
            <div class="setting-row"><label>Color Línea MACD:</label><input type="color" id="col-macd-line" value="${ind.params.color || '#2962ff'}"></div>
            <div class="setting-row"><label>Color Señal:</label><input type="color" id="col-macd-sig" value="${ind.styleParams?.colorSig || '#ff9800'}"></div>
        `;
    }
    else if (ind.type === 'STOCH') {
        paneInputs.innerHTML = `
            <div class="setting-row"><label>Longitud %K:</label><input type="number" id="input-stoch-k" value="${ind.params.period || 14}" min="1"></div>
            <div class="setting-row"><label>Suavizado %K:</label><input type="number" id="input-stoch-smoothk" value="${ind.params.smoothK || 3}" min="1"></div>
            <div class="setting-row"><label>Suavizado %D:</label><input type="number" id="input-stoch-smoothd" value="${ind.params.smoothD || 3}" min="1"></div>
        `;
        paneStyle.innerHTML = `
            ${getPlotTypeSelectHTML(ind.styleParams?.plotType || 'line')}
            <div class="setting-row"><label>Color %K:</label><input type="color" id="input-param-color" value="${ind.params.color || '#ff9800'}"></div>
        `;
    }
    else if (ind.type === 'BB' || ind.type === 'KELTNER' || ind.type === 'SUPERTREND') {
        paneInputs.innerHTML = `
            <div class="setting-row"><label>Longitud / Período:</label><input type="number" id="input-param-period" value="${ind.params.period || (ind.type === 'SUPERTREND' ? 10 : 20)}" min="1"></div>
            <div class="setting-row"><label>Multiplicador / Factor:</label><input type="number" id="input-param-mult" value="${ind.params.mult || (ind.type === 'SUPERTREND' ? 3.0 : 2.0)}" step="0.1" min="0.1"></div>
        `;
        paneStyle.innerHTML = `
            ${getPlotTypeSelectHTML(ind.styleParams?.plotType || 'line')}
            <div class="setting-row"><label>Color Principal:</label><input type="color" id="input-param-color" value="${ind.params.color || (ind.type === 'KELTNER' ? '#4caf50' : '#2196f3')}"></div>
        `;
    }
    else if (ind.type === 'VRVP') {
        paneInputs.innerHTML = `
            <div class="setting-row"><label>Número de Filas:</label><input type="number" id="input-param-period" value="${ind.params.period || 24}" min="5" max="100"></div>
        `;
        paneStyle.innerHTML = `
            <div class="setting-row"><label>Color del POC:</label><input type="color" id="input-param-color" value="${ind.params.color || '#f23645'}"></div>
        `;
    }
    else {
        let inputsHTML = '';
        if (ind.type === 'VWAP' || ind.type === 'OBV') {
            inputsHTML = `<div class="setting-row"><label>Fuente de Datos:</label><select disabled style="background:#131722; border:1px solid #2a2e39; color:#fff; padding:4px 8px; border-radius:4px;"><option>Precio de Cierre / Volumen</option></select></div>`;
        } else {
            inputsHTML = `<div class="setting-row"><label>Longitud / Período:</label><input type="number" id="input-param-period" value="${ind.params.period || 14}" min="1"></div>`;
        }
        paneInputs.innerHTML = inputsHTML;

        paneStyle.innerHTML = `
            ${getPlotTypeSelectHTML(ind.styleParams?.plotType || 'line')}
            <div class="setting-row"><label>Color del Trazo:</label><input type="color" id="input-param-color" value="${ind.params.color || '#2962ff'}"></div>
        `;
    }

    modal.style.display = 'flex';

    document.getElementById('btn-settings-apply').onclick = () => {
        const plotTypeEl = document.getElementById('input-param-plot-type');
        if (plotTypeEl) ind.styleParams.plotType = plotTypeEl.value;

        if (ind.type === 'SQZMOM') {
            const pEl = document.getElementById('input-sqz-bblength');
            const mEl = document.getElementById('input-sqz-bbmult');
            const kcP = document.getElementById('input-sqz-kclength');
            const kcM = document.getElementById('input-sqz-kcmult');
            const trEl = document.getElementById('input-sqz-truerange');
            if (pEl) ind.params.period = parseInt(pEl.value, 10) || 20;
            if (mEl) ind.params.mult = parseFloat(mEl.value) || 2.0;
            if (kcP) ind.params.kcPeriod = parseInt(kcP.value, 10) || 20;
            if (kcM) ind.params.kcMult = parseFloat(kcM.value) || 1.5;
            if (trEl) ind.params.useTrueRange = trEl.checked;

            ind.styleParams.col0 = document.getElementById('col-sqz-0')?.value || '#00e676';
            ind.styleParams.col1 = document.getElementById('col-sqz-1')?.value || '#089981';
            ind.styleParams.col2 = document.getElementById('col-sqz-2')?.value || '#ff1744';
            ind.styleParams.col3 = document.getElementById('col-sqz-3')?.value || '#f23645';
            ind.styleParams.dot0 = document.getElementById('col-sqz-dot0')?.value || '#2962ff';
            ind.styleParams.dot1 = document.getElementById('col-sqz-dot1')?.value || '#000000';
            ind.styleParams.dot2 = document.getElementById('col-sqz-dot2')?.value || '#787b86';
        }
        else if (ind.type === 'ADX') {
            const pEl = document.getElementById('input-param-period');
            const klEl = document.getElementById('input-param-keylevel');
            if (pEl) ind.params.period = parseInt(pEl.value, 10) || 14;
            if (klEl) ind.params.keyLevel = parseInt(klEl.value, 10) || 23;
            ind.styleParams.colorADX = document.getElementById('col-adx')?.value || '#ffffff';
            ind.styleParams.colorPDI = document.getElementById('col-pdi')?.value || '#089981';
            ind.styleParams.colorNDI = document.getElementById('col-ndi')?.value || '#f23645';
            ind.styleParams.colorKL = document.getElementById('col-kl')?.value || '#787b86';
        }
        else if (ind.type === 'MACD') {
            const fastEl = document.getElementById('input-macd-fast');
            const slowEl = document.getElementById('input-macd-slow');
            const sigEl = document.getElementById('input-macd-sig');
            const colEl = document.getElementById('col-macd-line');
            if (fastEl) ind.params.fastP = parseInt(fastEl.value, 10) || 12;
            if (slowEl) ind.params.slowP = parseInt(slowEl.value, 10) || 26;
            if (sigEl) ind.params.sigP = parseInt(sigEl.value, 10) || 9;
            if (colEl) ind.params.color = colEl.value;
            ind.styleParams.colorSig = document.getElementById('col-macd-sig')?.value || '#ff9800';
        }
        else if (ind.type === 'STOCH') {
            const kEl = document.getElementById('input-stoch-k');
            const skEl = document.getElementById('input-stoch-smoothk');
            const sdEl = document.getElementById('input-stoch-smoothd');
            const colEl = document.getElementById('input-param-color');
            if (kEl) ind.params.period = parseInt(kEl.value, 10) || 14;
            if (skEl) ind.params.smoothK = parseInt(skEl.value, 10) || 3;
            if (sdEl) ind.params.smoothD = parseInt(sdEl.value, 10) || 3;
            if (colEl) ind.params.color = colEl.value;
        }
        else {
            const pEl = document.getElementById('input-param-period');
            const mEl = document.getElementById('input-param-mult');
            const colEl = document.getElementById('input-param-color');
            if (pEl) ind.params.period = parseInt(pEl.value, 10) || ind.params.period || 14;
            if (mEl) ind.params.mult = parseFloat(mEl.value) || ind.params.mult || 2.0;
            if (colEl) ind.params.color = colEl.value;
        }

        modal.style.display = 'none';
        recalcularYRenderizarIndicadores();
    };

    const btnCancel = document.getElementById('btn-settings-cancel');
    if (btnCancel) btnCancel.onclick = () => { modal.style.display = 'none'; };
    const btnClose = document.getElementById('modal-settings-close');
    if (btnClose) btnClose.onclick = () => { modal.style.display = 'none'; };
}

// PESTAÑAS DENTRO DEL MODAL
document.querySelectorAll('.tv-modal-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tv-modal-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tv-tab-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const paneId = tab.getAttribute('data-pane');
        const targetPane = document.getElementById(paneId);
        if (targetPane) targetPane.classList.add('active');
    });
});

// VENTANA EMERGENTE FLOATING PINE SCRIPT EDITOR
const btnPineModalOpen = document.getElementById('btn-pine-modal-open');
const pineModal = document.getElementById('pine-editor-modal');
const btnPineClose = document.getElementById('modal-pine-close');

if (btnPineModalOpen && pineModal) {
    btnPineModalOpen.onclick = () => { pineModal.style.display = 'flex'; };
    if (btnPineClose) btnPineClose.onclick = () => { pineModal.style.display = 'none'; };
}

function cambiarEstiloGrafico(nuevoEstilo) {
    if (nuevoEstilo === chartStyle) return;
    chartStyle = nuevoEstilo;
    document.querySelectorAll('.style-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-style') === nuevoEstilo);
    });

    if (!chart || !historialVelas.length) return;

    if (activePriceSeries) {
        try { chart.removeSeries(activePriceSeries); } catch (e) {}
    }

    if (nuevoEstilo === 'candles') {
        activePriceSeries = chart.addCandlestickSeries({
            upColor: '#089981', downColor: '#f23645',
            borderUpColor: '#089981', borderDownColor: '#f23645',
            wickUpColor: '#089981', wickDownColor: '#f23645',
        });
        activePriceSeries.setData(historialVelas);
    } else if (nuevoEstilo === 'line') {
        activePriceSeries = chart.addLineSeries({
            color: '#2962ff',
            lineWidth: 2,
        });
        activePriceSeries.setData(historialVelas.map(c => ({ time: c.time, value: c.close })));
    } else if (nuevoEstilo === 'area') {
        activePriceSeries = chart.addAreaSeries({
            topColor: 'rgba(41, 98, 255, 0.4)',
            bottomColor: 'rgba(41, 98, 255, 0.0)',
            lineColor: '#2962ff',
            lineWidth: 2,
        });
        activePriceSeries.setData(historialVelas.map(c => ({ time: c.time, value: c.close })));
    }

    window.activePriceSeries = activePriceSeries;
    if (drawingEngine) {
        drawingEngine.mainSeries = activePriceSeries;
        drawingEngine.redraw();
    }
}

// Alternar Modo de la Aplicación: Gráfico Principal de Trading vs Backtesting Cuantitativo Dedicado vs MT5 Runner
window.cambiarModoApp = function(modo) {
    const mainWorkspace = document.getElementById('main-workspace');
    const btWorkspace = document.getElementById('backtest-workspace');
    const mt5Workspace = document.getElementById('mt5-runner-workspace');
    const tabTrading = document.getElementById('tab-btn-trading');
    const tabBacktest = document.getElementById('tab-btn-backtest');
    const tabMT5 = document.getElementById('tab-btn-mt5');
    const mobBtnChart = document.getElementById('mob-btn-chart');
    const mobBtnBacktest = document.getElementById('mob-btn-backtest');
    const btnBottomTester = document.getElementById('btn-bottom-tab-tester');
    const topToolbar = document.getElementById('top-toolbar');

    if (modo === 'backtest') {
        if (topToolbar) topToolbar.style.display = 'none';
        document.body.classList.add('toolbar-hidden');
        if (mainWorkspace) mainWorkspace.style.display = 'none';
        if (mt5Workspace) {
            mt5Workspace.style.display = 'none';
            mt5Workspace.classList.remove('active');
        }
        if (btWorkspace) {
            btWorkspace.style.display = 'flex';
            btWorkspace.classList.add('active');
        }
        if (tabTrading) tabTrading.classList.remove('active');
        if (tabMT5) tabMT5.classList.remove('active');
        if (tabBacktest) tabBacktest.classList.add('active');
        if (mobBtnChart) mobBtnChart.classList.remove('active');
        if (mobBtnBacktest) mobBtnBacktest.classList.add('active');
        if (btnBottomTester) btnBottomTester.classList.add('active-tab');

        if (window.StrategyTester) {
            window.StrategyTester.resize();
            window.StrategyTester.ejecutarBacktest();
        }
    } else if (modo === 'mt5') {
        if (topToolbar) topToolbar.style.display = 'none';
        document.body.classList.add('toolbar-hidden');
        if (mainWorkspace) mainWorkspace.style.display = 'none';
        if (btWorkspace) {
            btWorkspace.style.display = 'none';
            btWorkspace.classList.remove('active');
        }
        if (mt5Workspace) {
            mt5Workspace.style.display = 'flex';
            mt5Workspace.classList.add('active');
        }
        if (tabTrading) tabTrading.classList.remove('active');
        if (tabBacktest) tabBacktest.classList.remove('active');
        if (tabMT5) tabMT5.classList.add('active');
        if (mobBtnChart) mobBtnChart.classList.remove('active');
        if (mobBtnBacktest) mobBtnBacktest.classList.remove('active');
        if (btnBottomTester) btnBottomTester.classList.remove('active-tab');

        if (window.MT5Emulator) {
            setTimeout(() => {
                window.MT5Emulator.resize();
                window.MT5Emulator.cargarVelasYActualizar();
            }, 60);
        }
    } else {
        // Modo 'trading' (Gráfico): Mostrar barra de símbolos e indicadores técnicos
        document.body.classList.remove('toolbar-hidden');
        if (topToolbar) topToolbar.style.display = '';
        if (btWorkspace) {
            btWorkspace.style.display = 'none';
            btWorkspace.classList.remove('active');
        }
        if (mt5Workspace) {
            mt5Workspace.style.display = 'none';
            mt5Workspace.classList.remove('active');
        }
        if (mainWorkspace) {
            mainWorkspace.style.display = 'flex';
        }
        if (tabTrading) tabTrading.classList.add('active');
        if (tabBacktest) tabBacktest.classList.remove('active');
        if (tabMT5) tabMT5.classList.remove('active');
        if (mobBtnBacktest) mobBtnBacktest.classList.remove('active');
        if (mobBtnChart) mobBtnChart.classList.add('active');
        if (btnBottomTester) btnBottomTester.classList.remove('active-tab');

        if (typeof resizeGraficos === 'function') {
            setTimeout(resizeGraficos, 50);
        }
    }
};

function inicializarEventosUI() {
    // 0. Pestañas Superiores de Modo (Trading vs Backtesting vs MT5)
    const tabTrading = document.getElementById('tab-btn-trading');
    if (tabTrading) {
        tabTrading.addEventListener('click', () => window.cambiarModoApp('trading'));
    }
    const tabBacktest = document.getElementById('tab-btn-backtest');
    if (tabBacktest) {
        tabBacktest.addEventListener('click', () => window.cambiarModoApp('backtest'));
    }
    const tabMT5 = document.getElementById('tab-btn-mt5');
    if (tabMT5) {
        tabMT5.addEventListener('click', () => window.cambiarModoApp('mt5'));
    }
    const btnBottomTester = document.getElementById('btn-bottom-tab-tester');
    if (btnBottomTester) {
        btnBottomTester.addEventListener('click', () => {
            const btWs = document.getElementById('backtest-workspace');
            const isBt = btWs && (btWs.style.display === 'flex' || btWs.classList.contains('active'));
            window.cambiarModoApp(isBt ? 'trading' : 'backtest');
        });
    }

    // 1. Búsqueda de Símbolos
    const symbolInput = document.getElementById('ticker-search') || document.getElementById('symbol-input');
    if (symbolInput) {
        symbolInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = symbolInput.value.trim().toUpperCase();
                if (val) cambiarSimboloYTemporalidad(val, currentInterval);
            }
        });
    }

    // 2. Botones de Temporalidad (Pill Group)
    document.querySelectorAll('.tf-btn, .timeframe-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tf-btn, .timeframe-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tf = btn.getAttribute('data-tf') || '1h';
            cambiarSimboloYTemporalidad(currentSymbol, tf);
        });
    });

    // 3. Estilo de Gráfico (Velas / Línea / Área)
    document.querySelectorAll('.style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const style = btn.getAttribute('data-style');
            if (style) cambiarEstiloGrafico(style);
        });
    });

    // 4. Gestor de Lista de Seguimiento Dinámica (Máximo 20 Activos)
    const MAX_WATCHLIST_ITEMS = 20;

    const CATALOGO_ACTIVOS_DISPONIBLES = [
        // CRIPTOMONEDAS
        { symbol: 'BTC-USD', name: 'Bitcoin', category: 'CRIPTO', desc: 'Criptomoneda de reserva global' },
        { symbol: 'ETH-USD', name: 'Ethereum', category: 'CRIPTO', desc: 'Plataforma líder de Smart Contracts' },
        { symbol: 'SOL-USD', name: 'Solana', category: 'CRIPTO', desc: 'Blockchain Layer 1 de alta velocidad' },
        { symbol: 'DOGE-USD', name: 'Dogecoin', category: 'CRIPTO', desc: 'Moneda descentralizada de pagos' },
        { symbol: 'BNB-USD', name: 'Binance Coin', category: 'CRIPTO', desc: 'Ecosistema BNB Chain' },
        { symbol: 'XRP-USD', name: 'Ripple', category: 'CRIPTO', desc: 'Red interbancaria global de liquidez' },
        { symbol: 'ADA-USD', name: 'Cardano', category: 'CRIPTO', desc: 'Proof-of-Stake auditado por pares' },
        { symbol: 'AVAX-USD', name: 'Avalanche', category: 'CRIPTO', desc: 'Subredes y finanzas descentralizadas' },
        { symbol: 'LINK-USD', name: 'Chainlink', category: 'CRIPTO', desc: 'Red descentralizada de oráculos de datos' },
        { symbol: 'LTC-USD', name: 'Litecoin', category: 'CRIPTO', desc: 'Transacciones rápidas y seguras' },
        { symbol: 'DOT-USD', name: 'Polkadot', category: 'CRIPTO', desc: 'Interoperabilidad multi-cadena' },
        { symbol: 'NEAR-USD', name: 'NEAR Protocol', category: 'CRIPTO', desc: 'Infraestructura Sharding & IA' },
        { symbol: 'BCH-USD', name: 'Bitcoin Cash', category: 'CRIPTO', desc: 'Red peer-to-peer con bloques ampliados' },
        { symbol: 'SHIB-USD', name: 'Shiba Inu', category: 'CRIPTO', desc: 'Ecosistema Shibarium' },

        // METALES Y MATERIAS PRIMAS
        { symbol: 'XAUUSD', name: 'Oro Spot (Gold GC=F)', category: 'METALES', desc: 'Activo refugio por excelencia' },
        { symbol: 'XAGUSD', name: 'Plata Spot (Silver SI=F)', category: 'METALES', desc: 'Metal precioso e industrial' },
        { symbol: 'OIL', name: 'Petróleo WTI (CL=F)', category: 'METALES', desc: 'Barril de crudo West Texas' },
        { symbol: 'BRENT', name: 'Petróleo Brent (BZ=F)', category: 'METALES', desc: 'Referencia internacional de petróleo' },
        { symbol: 'NATGAS', name: 'Gas Natural (NG=F)', category: 'METALES', desc: 'Energía de gas licuado mundial' },
        { symbol: 'COPPER', name: 'Cobre Futuros (HG=F)', category: 'METALES', desc: 'Insumo crítico para electrificación' },

        // ÍNDICES BURSÁTILES
        { symbol: 'NASDAQ', name: 'Nasdaq 100 (NQ=F)', category: 'INDICES', desc: 'Futuros tecnológicos estadounidenses' },
        { symbol: 'SP500', name: 'S&P 500 (ES=F)', category: 'INDICES', desc: 'Top 500 corporaciones norteamericanas' },
        { symbol: 'US30', name: 'Dow Jones Industrial (YM=F)', category: 'INDICES', desc: '30 gigantes industriales de EE.UU.' },
        { symbol: 'RUSSELL', name: 'Russell 2000 (RTY=F)', category: 'INDICES', desc: 'Índice de empresas de mediana capitalización' },
        { symbol: 'DAX', name: 'DAX 40 (^GDAXI)', category: 'INDICES', desc: 'Bolsa de Frankfurt, Alemania' },
        { symbol: 'FTSE', name: 'FTSE 100 (^FTSE)', category: 'INDICES', desc: 'Bolsa de Londres, Reino Unido' },
        { symbol: 'NIKKEI', name: 'Nikkei 225 (^N225)', category: 'INDICES', desc: 'Bolsa de Tokio, Japón' },

        // ACCIONES POPULARES TECH
        { symbol: 'NVDA', name: 'NVIDIA Corporation', category: 'ACCIONES', desc: 'Líder en microchips y hardware de IA' },
        { symbol: 'AAPL', name: 'Apple Inc.', category: 'ACCIONES', desc: 'Hardware, software y servicios globales' },
        { symbol: 'MSFT', name: 'Microsoft Corporation', category: 'ACCIONES', desc: 'Computación en nube Azure y Windows' },
        { symbol: 'TSLA', name: 'Tesla Inc.', category: 'ACCIONES', desc: 'Vehículos autónomos, robótica y baterías' },
        { symbol: 'AMZN', name: 'Amazon.com Inc.', category: 'ACCIONES', desc: 'Líder e-commerce global y AWS Cloud' },
        { symbol: 'GOOGL', name: 'Alphabet Inc. (Google)', category: 'ACCIONES', desc: 'Motor de búsqueda, YouTube e inteligencia artificial' },
        { symbol: 'META', name: 'Meta Platforms', category: 'ACCIONES', desc: 'Redes sociales globales y Metaverso' },
        { symbol: 'AMD', name: 'Advanced Micro Devices', category: 'ACCIONES', desc: 'Microprocesadores Ryzen y aceleradores IA' },
        { symbol: 'NFLX', name: 'Netflix Inc.', category: 'ACCIONES', desc: 'Plataforma mundial de contenido en streaming' },
        { symbol: 'COIN', name: 'Coinbase Global', category: 'ACCIONES', desc: 'Plataforma regulada de intercambio cripto' },
        { symbol: 'MSTR', name: 'MicroStrategy Inc.', category: 'ACCIONES', desc: 'Compañía de tesorería institucional Bitcoin' },
        { symbol: 'PLTR', name: 'Palantir Technologies', category: 'ACCIONES', desc: 'Software de análisis de datos e IA gubernamental' },

        // FOREX (DIVISAS)
        { symbol: 'EURUSD', name: 'EUR / USD', category: 'FOREX', desc: 'Euro vs Dólar Estadounidense' },
        { symbol: 'GBPUSD', name: 'GBP / USD', category: 'FOREX', desc: 'Libra Esterlina vs Dólar USA' },
        { symbol: 'USDJPY', name: 'USD / JPY', category: 'FOREX', desc: 'Dólar USA vs Yen Japonés' },
        { symbol: 'AUDUSD', name: 'AUD / USD', category: 'FOREX', desc: 'Dólar Australiano vs Dólar USA' },
        { symbol: 'USDCAD', name: 'USD / CAD', category: 'FOREX', desc: 'Dólar USA vs Dólar Canadiense' },
        { symbol: 'USDCHF', name: 'USD / CHF', category: 'FOREX', desc: 'Dólar USA vs Franco Suizo' },
        { symbol: 'NZDUSD', name: 'NZD / USD', category: 'FOREX', desc: 'Dólar Neozelandés vs Dólar USA' }
    ];

    const WATCHLIST_DEFAULT = [
        { symbol: 'BTC-USD', name: 'Bitcoin', category: 'CRIPTO' },
        { symbol: 'ETH-USD', name: 'Ethereum', category: 'CRIPTO' },
        { symbol: 'SOL-USD', name: 'Solana', category: 'CRIPTO' },
        { symbol: 'XAUUSD', name: 'Oro (Gold)', category: 'METALES' },
        { symbol: 'NASDAQ', name: 'NASDAQ 100', category: 'INDICES' },
        { symbol: 'SP500', name: 'S&P 500', category: 'INDICES' },
        { symbol: 'EURUSD', name: 'EUR / USD', category: 'FOREX' },
        { symbol: 'NVDA', name: 'NVIDIA Corp', category: 'ACCIONES' },
        { symbol: 'AAPL', name: 'Apple Inc', category: 'ACCIONES' },
        { symbol: 'DOGE-USD', name: 'Dogecoin', category: 'CRIPTO' }
    ];

    function obtenerWatchlistUsuario() {
        try {
            const raw = localStorage.getItem('quantvisor_user_watchlist');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed.slice(0, MAX_WATCHLIST_ITEMS);
                }
            }
        } catch (e) {
            console.warn("Error leyendo watchlist de localStorage:", e);
        }
        return [...WATCHLIST_DEFAULT];
    }

    function guardarWatchlistUsuario(lista) {
        try {
            localStorage.setItem('quantvisor_user_watchlist', JSON.stringify(lista.slice(0, MAX_WATCHLIST_ITEMS)));
        } catch (e) {
            console.warn("Error guardando watchlist en localStorage:", e);
        }
    }

    async function actualizarCotizacionesWatchlistRapido() {
        const invoke = (window.__TAURI__ && window.__TAURI__.core) 
            ? window.__TAURI__.core.invoke 
            : (window.__TAURI__ ? window.__TAURI__.invoke : null);
        if (!invoke) return;

        const items = document.querySelectorAll('.watchlist-item');
        for (const item of items) {
            const sym = item.getAttribute('data-symbol');
            if (!sym || sym === currentSymbol) continue;
            const wlPrice = document.getElementById(`wl-price-${sym}`);
            if (wlPrice && (wlPrice.textContent === '--' || wlPrice.textContent === '')) {
                try {
                    const candles = await invoke('cargar_historial', {
                        simbolo: sym,
                        intervalo: '1d'
                    });
                    if (candles && candles.length > 0) {
                        const last = candles[candles.length - 1];
                        const open = last.open || last.close;
                        const close = last.close;
                        const diff = close - open;
                        const diffPct = open > 0 ? (diff / open) * 100 : 0;
                        const isUp = diff >= 0;
                        const sign = isUp ? '+' : '';

                        const wlChange = document.getElementById(`wl-change-${sym}`);
                        if (wlPrice) wlPrice.textContent = formatPrice(close);
                        if (wlChange) {
                            wlChange.textContent = `${sign}${diffPct.toFixed(2)}%`;
                            wlChange.className = `watchlist-change ${isUp ? 'up' : 'down'}`;
                        }
                    }
                } catch (e) {}
            }
        }
    }

    function renderizarWatchlist() {
        const container = document.getElementById('watchlist-items');
        if (!container) return;

        const lista = obtenerWatchlistUsuario();
        container.innerHTML = '';

        const countBadge = document.getElementById('watchlist-count-badge');
        if (countBadge) countBadge.textContent = `${lista.length}/${MAX_WATCHLIST_ITEMS}`;
        const modalCount = document.getElementById('wl-modal-count-val');
        if (modalCount) modalCount.textContent = lista.length;

        lista.forEach(item => {
            const el = document.createElement('div');
            el.className = 'watchlist-item' + (item.symbol === currentSymbol ? ' active' : '');
            el.setAttribute('data-symbol', item.symbol);

            el.innerHTML = `
                <div style="display:flex; flex-direction:column; overflow:hidden; max-width:115px;">
                    <span class="watchlist-symbol" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.symbol}</span>
                    <span style="font-size:9px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name || ''}</span>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <div style="display:flex; flex-direction:column; align-items:flex-end;">
                        <span class="watchlist-price" id="wl-price-${item.symbol}">--</span>
                        <span class="watchlist-change up" id="wl-change-${item.symbol}">+0.00%</span>
                    </div>
                    <button class="watchlist-remove-btn" title="Eliminar ${item.symbol} de seguimiento" data-remove-symbol="${item.symbol}">&times;</button>
                </div>
            `;

            el.addEventListener('click', (e) => {
                if (e.target.closest('.watchlist-remove-btn')) return;
                document.querySelectorAll('.watchlist-item').forEach(b => b.classList.remove('active'));
                el.classList.add('active');
                cambiarSimboloYTemporalidad(item.symbol, currentInterval);
                if (window.innerWidth <= 768) {
                    const rightWatchlist = document.getElementById('right-watchlist');
                    const mobBackdrop = document.getElementById('mobile-backdrop');
                    if (rightWatchlist) rightWatchlist.classList.remove('mobile-open');
                    if (mobBackdrop) mobBackdrop.classList.remove('active');
                }
            });

            const btnRemove = el.querySelector('.watchlist-remove-btn');
            if (btnRemove) {
                btnRemove.addEventListener('click', (e) => {
                    e.stopPropagation();
                    eliminarDeWatchlist(item.symbol);
                });
            }

            container.appendChild(el);
        });

        actualizarCotizacionesWatchlistRapido();
    }

    function agregarAWatchlist(symbol, name = '', category = 'GENERAL') {
        const symClean = symbol.trim().toUpperCase();
        if (!symClean) return false;

        let lista = obtenerWatchlistUsuario();

        if (lista.some(item => item.symbol.toUpperCase() === symClean)) {
            return false;
        }

        if (lista.length >= MAX_WATCHLIST_ITEMS) {
            alert(`⚠️ Límite alcanzado: La lista de seguimiento puede tener un máximo de ${MAX_WATCHLIST_ITEMS} activos.\nPor favor elimina algún activo antes de agregar otro.`);
            return false;
        }

        const found = CATALOGO_ACTIVOS_DISPONIBLES.find(c => c.symbol.toUpperCase() === symClean);
        const itemToAdd = {
            symbol: symClean,
            name: name || (found ? found.name : symClean),
            category: category || (found ? found.category : 'GENERAL')
        };

        lista.push(itemToAdd);
        guardarWatchlistUsuario(lista);
        renderizarWatchlist();
        renderizarModalActivos();
        return true;
    }

    function eliminarDeWatchlist(symbol) {
        const symClean = symbol.trim().toUpperCase();
        let lista = obtenerWatchlistUsuario();
        lista = lista.filter(item => item.symbol.toUpperCase() !== symClean);
        guardarWatchlistUsuario(lista);
        renderizarWatchlist();
        renderizarModalActivos();
    }

    function renderizarModalActivos() {
        const modalList = document.getElementById('wl-available-list');
        if (!modalList) return;

        const searchInput = document.getElementById('wl-search-input');
        const filtro = searchInput ? searchInput.value.trim().toLowerCase() : '';

        const activeTab = document.querySelector('.wl-tab-btn.active');
        const categoria = activeTab ? activeTab.getAttribute('data-cat') : 'TODOS';

        const currentWatchlist = obtenerWatchlistUsuario();
        const watchlistSymbols = new Set(currentWatchlist.map(w => w.symbol.toUpperCase()));

        const countVal = document.getElementById('wl-modal-count-val');
        if (countVal) countVal.textContent = currentWatchlist.length;

        modalList.innerHTML = '';

        let activosAMostrar = CATALOGO_ACTIVOS_DISPONIBLES.filter(item => {
            if (categoria !== 'TODOS' && item.category !== categoria) return false;
            if (filtro) {
                const symMatch = item.symbol.toLowerCase().includes(filtro);
                const nameMatch = item.name.toLowerCase().includes(filtro);
                const descMatch = item.desc ? item.desc.toLowerCase().includes(filtro) : false;
                return symMatch || nameMatch || descMatch;
            }
            return true;
        });

        currentWatchlist.forEach(w => {
            if (!CATALOGO_ACTIVOS_DISPONIBLES.some(c => c.symbol.toUpperCase() === w.symbol.toUpperCase())) {
                if (categoria === 'TODOS' || w.category === categoria) {
                    if (!filtro || w.symbol.toLowerCase().includes(filtro) || (w.name && w.name.toLowerCase().includes(filtro))) {
                        if (!activosAMostrar.some(a => a.symbol.toUpperCase() === w.symbol.toUpperCase())) {
                            activosAMostrar.unshift({
                                symbol: w.symbol,
                                name: w.name || w.symbol,
                                category: w.category || 'CUSTOM',
                                desc: 'Activo personalizado agregado'
                            });
                        }
                    }
                }
            }
        });

        if (activosAMostrar.length === 0) {
            modalList.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: var(--text-muted); font-size: 13px;">No se encontraron activos con el criterio buscado. Puedes agregar cualquier ticker de Yahoo en el campo superior.</div>';
            return;
        }

        activosAMostrar.forEach(item => {
            const isInWatchlist = watchlistSymbols.has(item.symbol.toUpperCase());
            const card = document.createElement('div');
            card.className = 'wl-asset-card' + (isInWatchlist ? ' in-watchlist' : '');

            card.innerHTML = `
                <div style="display:flex; flex-direction:column; overflow:hidden; gap:2px; max-width:210px;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-weight:bold; color:#fff; font-size:12px;">${item.symbol}</span>
                        <span style="font-size:9px; background:#2a2e39; color:#9598a1; padding:1px 5px; border-radius:3px;">${item.category}</span>
                    </div>
                    <div style="font-size:11px; color:#d1d4dc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
                    ${item.desc ? `<div style="font-size:10px; color:#787b86; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.desc}</div>` : ''}
                </div>
                <div>
                    ${isInWatchlist 
                        ? `<button class="wl-btn-remove" title="Quitar de la lista de seguimiento">✕ Quitar</button>`
                        : `<button class="wl-btn-add" title="Agregar a la lista de seguimiento" ${currentWatchlist.length >= MAX_WATCHLIST_ITEMS ? 'disabled' : ''}>+ Añadir</button>`
                    }
                </div>
            `;

            card.style.cursor = 'pointer';
            card.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                cambiarSimboloYTemporalidad(item.symbol, currentInterval);
                const modal = document.getElementById('watchlist-modal');
                if (modal) modal.style.display = 'none';
                if (window.innerWidth <= 768) {
                    const rightWatchlist = document.getElementById('right-watchlist');
                    const mobBackdrop = document.getElementById('mobile-backdrop');
                    if (rightWatchlist) rightWatchlist.classList.remove('mobile-open');
                    if (mobBackdrop) mobBackdrop.classList.remove('active');
                }
            });

            const btn = card.querySelector('button');
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (isInWatchlist) {
                        eliminarDeWatchlist(item.symbol);
                    } else {
                        if (currentWatchlist.length >= MAX_WATCHLIST_ITEMS) {
                            alert(`⚠️ Límite alcanzado: La lista de seguimiento puede tener un máximo de ${MAX_WATCHLIST_ITEMS} activos.\nPor favor elimina algún activo antes de agregar otro.`);
                            return;
                        }
                        agregarAWatchlist(item.symbol, item.name, item.category);
                    }
                });
            }

            modalList.appendChild(card);
        });
    }

    function inicializarModalWatchlist() {
        const btnOpen = document.getElementById('btn-open-watchlist-modal');
        const modal = document.getElementById('watchlist-modal');
        const btnClose = document.getElementById('modal-watchlist-close');
        const btnDone = document.getElementById('btn-modal-watchlist-close-done');
        const searchInput = document.getElementById('wl-search-input');
        const customInput = document.getElementById('wl-custom-symbol-input');
        const btnAddCustom = document.getElementById('btn-add-custom-symbol');

        if (btnOpen && modal) {
            btnOpen.addEventListener('click', () => {
                renderizarModalActivos();
                modal.style.display = 'flex';
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.focus();
                }
            });
        }

        if (btnClose && modal) {
            btnClose.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }

        if (btnDone && modal) {
            btnDone.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                renderizarModalActivos();
            });
        }

        document.querySelectorAll('.wl-tab-btn').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.wl-tab-btn').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderizarModalActivos();
            });
        });

        const handleAddCustom = () => {
            if (!customInput) return;
            const val = customInput.value.trim().toUpperCase();
            if (!val) {
                alert("⚠️ Ingrese un ticker válido (ej. TSLA, MSTR, PLTR, BABA).");
                return;
            }
            const lista = obtenerWatchlistUsuario();
            if (lista.length >= MAX_WATCHLIST_ITEMS) {
                alert(`⚠️ Límite alcanzado: La lista de seguimiento puede tener un máximo de ${MAX_WATCHLIST_ITEMS} activos.\nPor favor elimina algún activo antes de agregar otro.`);
                return;
            }
            if (lista.some(item => item.symbol.toUpperCase() === val)) {
                alert(`⚠️ El símbolo ${val} ya está en la lista de seguimiento.`);
                return;
            }
            agregarAWatchlist(val, val, 'PERSONALIZADO');
            customInput.value = '';
        };

        if (btnAddCustom) {
            btnAddCustom.addEventListener('click', handleAddCustom);
        }
        if (customInput) {
            customInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleAddCustom();
            });
        }
    }

    // Inicializar Watchlist y su modal
    renderizarWatchlist();
    inicializarModalWatchlist();

    // 5. Herramientas de Dibujo Lateral
    const toolMap = {
        'btn-cursor': null,
        'btn-tendencia': 'trendline',
        'btn-ray': 'ray',
        'btn-horzline': 'horzline',
        'btn-vertline': 'vertline',
        'btn-fibo': 'fibo',
        'btn-fibext': 'fibext',
        'btn-rect': 'rectangle',
        'btn-ellipse': 'ellipse',
        'btn-brush': 'brush',
        'btn-text': 'text',
        'btn-pricetag': 'pricetag',
        'btn-longpos': 'longpos',
        'btn-shortpos': 'shortpos',
        'btn-ruler': 'ruler',
    };

    Object.keys(toolMap).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (drawingEngine) {
                    drawingEngine.setTool(toolMap[btnId]);
                }
                if (window.innerWidth <= 768) {
                    const leftSidebar = document.getElementById('left-sidebar');
                    const mobBackdrop = document.getElementById('mobile-backdrop');
                    if (leftSidebar) leftSidebar.classList.remove('mobile-open');
                    if (mobBackdrop) mobBackdrop.classList.remove('active');
                }
            });
        }
    });

    const btnMagnet = document.getElementById('btn-magnet');
    if (btnMagnet) {
        btnMagnet.addEventListener('click', () => {
            if (drawingEngine) {
                drawingEngine.toggleMagnet();
            }
        });
    }

    const btnBorrar = document.getElementById('btn-borrar');
    if (btnBorrar) {
        btnBorrar.addEventListener('click', () => {
            if (drawingEngine) drawingEngine.clearDrawings();
        });
    }

    // 6. Catálogo de Indicadores Modal (fx Indicadores)
    const btnIndicatorsModal = document.getElementById('btn-indicadores') || document.getElementById('btn-indicators-modal');
    const catalogModal = document.getElementById('indicators-modal') || document.getElementById('indicators-catalog-modal');
    const catalogClose = document.getElementById('modal-indicators-close') || document.getElementById('modal-catalog-close');
    const catalogList = document.getElementById('indicators-catalog-list') || document.getElementById('catalog-indicators-list');
    const searchInput = document.getElementById('indicator-search-input');

    function obtenerCatalogoCompletoIndicadores() {
        let customs = [];
        try {
            const raw = localStorage.getItem('quantvisor_custom_pine_indicators');
            if (raw) customs = JSON.parse(raw);
        } catch (e) {}
        return [...customs, ...CATALOGO_INDICADORES];
    }

    async function ejecutarYAñadirIndicadorPine(ind) {
        const invoke = (window.__TAURI__ && window.__TAURI__.core) 
            ? window.__TAURI__.core.invoke 
            : (window.__TAURI__ ? window.__TAURI__.invoke : null);
        
        if (!historialVelas || historialVelas.length === 0) {
            alert("⚠️ Primero debe cargar datos de velas para aplicar el indicador.");
            return;
        }

        if (!invoke) {
            alert("⚠️ La evaluación de Pine Script requiere el backend de Rust en ejecución.");
            return;
        }

        try {
            const evalOutput = await invoke('evaluar_pine_script', {
                code: ind.code,
                candles: historialVelas
            });

            if (!evalOutput || !evalOutput.plots || evalOutput.plots.length === 0) {
                alert(`ℹ️ El indicador "${ind.name}" se ejecutó correctamente pero no generó gráficos plot().`);
                return;
            }

            let hayOsc = false;
            const seriesList = [];

            evalOutput.plots.forEach(plot => {
                let targetChart = chart;
                if (plot.is_oscillator) {
                    hayOsc = true;
                    const oscChart = garantizarOscilador();
                    targetChart = oscChart || chart;
                }

                const series = plot.plot_style === 'Histogram'
                    ? targetChart.addHistogramSeries({
                        title: plot.name || ind.name,
                        color: plot.color || '#2962ff',
                        priceScaleId: plot.is_oscillator ? 'left' : ''
                    })
                    : targetChart.addLineSeries({
                        title: plot.name || ind.name,
                        color: plot.color || '#2962ff',
                        lineWidth: 2,
                        priceScaleId: plot.is_oscillator ? 'right' : ''
                    });

                series.setData(plot.points.map(pt => ({
                    time: pt.time,
                    value: pt.value,
                    color: pt.color || undefined
                })));
                seriesList.push(series);
            });

            indicadoresActivos.push({
                type: 'PINE',
                name: ind.name,
                code: ind.code,
                seriesList: seriesList,
                isOscillator: hayOsc,
                visible: true
            });

            if (hayOsc) {
                const oscContainer = document.getElementById('oscillator-chart-container');
                if (oscContainer) oscContainer.style.display = 'block';
                const resizer = document.getElementById('chart-resizer');
                if (resizer) resizer.style.display = 'block';
                resizeGraficos();
            }

            actualizarLeyendaIndicadoresUI();

        } catch (err) {
            alert(`⚠️ Error al evaluar el indicador "${ind.name}": ${err}`);
        }
    }

    function poblarCatalogoIndicadores(filtro = '') {
        if (!catalogList) return;
        catalogList.innerHTML = '';
        const f = filtro.toLowerCase().trim();
        const lista = obtenerCatalogoCompletoIndicadores().filter(ind => 
            !f || ind.name.toLowerCase().includes(f) || (ind.type && ind.type.toLowerCase().includes(f)) || (ind.category && ind.category.toLowerCase().includes(f))
        );

        if (lista.length === 0) {
            catalogList.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-muted); font-size:12px;">No se encontraron indicadores con ese criterio.</div>';
            return;
        }

        lista.forEach(ind => {
            const card = document.createElement('div');
            card.className = 'catalog-card';
            card.style.cssText = 'padding: 10px 14px; margin-bottom: 8px; background-color: #131722; border: 1px solid #2a2e39; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; transition: border-color 0.15s;';
            card.onmouseenter = () => { card.style.borderColor = '#2962ff'; };
            card.onmouseleave = () => { card.style.borderColor = '#2a2e39'; };

            const isCustomPine = (ind.type === 'PINE');
            const badgeCategory = isCustomPine 
                ? '<span style="color:#00e676; font-size:10px; font-weight:bold;">🌲 Pine Script (Guardado)</span>'
                : `<span style="font-size:10px; color:#787b86;">${ind.category}</span>`;

            const leftDiv = document.createElement('div');
            leftDiv.innerHTML = `
                <div style="font-weight:bold; color:#fff; font-size:12px; display:flex; align-items:center; gap:6px;">
                    ${ind.name} ${isCustomPine ? '<span style="background:rgba(8,153,129,0.25); color:#00e676; padding:1px 6px; border-radius:3px; font-size:9px; font-weight:bold;">CUSTOM</span>' : ''}
                </div>
                <div>${badgeCategory}</div>
            `;

            const actionsDiv = document.createElement('div');
            actionsDiv.style.cssText = 'display: flex; gap: 6px; align-items: center;';

            if (isCustomPine) {
                // Botón Editar en Editor Pine
                const btnEdit = document.createElement('button');
                btnEdit.title = 'Editar código en Pine Script Editor';
                btnEdit.style.cssText = 'background:#2a2e39; border:none; color:#d1d4dc; padding:5px 9px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:500;';
                btnEdit.innerHTML = '✏️ Editar';
                btnEdit.onclick = (e) => {
                    e.stopPropagation();
                    const codeEditor = document.getElementById('pine-code-editor');
                    const nameInput = document.getElementById('pine-indicator-name');
                    const modal = document.getElementById('pine-editor-modal');
                    if (codeEditor) codeEditor.value = ind.code || '';
                    if (nameInput) {
                        nameInput.value = ind.name;
                        nameInput.dataset.userEdited = 'true';
                    }
                    catalogModal.style.display = 'none';
                    if (modal) modal.style.display = 'flex';
                };
                actionsDiv.appendChild(btnEdit);

                // Botón Eliminar de lista
                const btnDelete = document.createElement('button');
                btnDelete.title = 'Eliminar de la lista de indicadores guardados';
                btnDelete.style.cssText = 'background:none; border:none; color:#f23645; padding:5px 7px; border-radius:4px; font-size:12px; cursor:pointer;';
                btnDelete.innerHTML = '🗑️';
                btnDelete.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`¿Desea eliminar "${ind.name}" de la lista de indicadores?`)) {
                        let customs = [];
                        try {
                            const raw = localStorage.getItem('quantvisor_custom_pine_indicators');
                            if (raw) customs = JSON.parse(raw);
                        } catch (err) {}
                        customs = customs.filter(c => c.name !== ind.name && c.id !== ind.id);
                        localStorage.setItem('quantvisor_custom_pine_indicators', JSON.stringify(customs));
                        poblarCatalogoIndicadores(searchInput ? searchInput.value : '');
                    }
                };
                actionsDiv.appendChild(btnDelete);
            }

            const btnAdd = document.createElement('button');
            btnAdd.style.cssText = 'background:#2962ff; border:none; color:#fff; padding:5px 12px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:600;';
            btnAdd.textContent = '+ Añadir';
            btnAdd.onclick = async (e) => {
                e.stopPropagation();
                catalogModal.style.display = 'none';
                if (isCustomPine) {
                    await ejecutarYAñadirIndicadorPine(ind);
                } else {
                    indicadoresActivos.push({
                        type: ind.type,
                        name: ind.name,
                        params: JSON.parse(JSON.stringify(ind.defaultParams)),
                        styleParams: {},
                        seriesList: [],
                        visible: true
                    });
                    recalcularYRenderizarIndicadores();
                }
            };
            actionsDiv.appendChild(btnAdd);

            card.appendChild(leftDiv);
            card.appendChild(actionsDiv);
            catalogList.appendChild(card);
        });
    }

    window.actualizarCatalogoIndicadores = () => {
        poblarCatalogoIndicadores(searchInput ? searchInput.value : '');
    };

    if (btnIndicatorsModal && catalogModal) {
        btnIndicatorsModal.onclick = () => {
            if (searchInput) searchInput.value = '';
            poblarCatalogoIndicadores('');
            catalogModal.style.display = 'flex';
            if (searchInput) searchInput.focus();
        };
        if (catalogClose) catalogClose.onclick = () => { catalogModal.style.display = 'none'; };
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                poblarCatalogoIndicadores(e.target.value);
            });
        }
    }

    // 7. Carga de Archivos CSV
    const btnCsv = document.getElementById('btn-cargar-csv');
    const inputCsv = document.getElementById('csv-file-input');
    if (btnCsv && inputCsv) {
        btnCsv.addEventListener('click', () => inputCsv.click());
        inputCsv.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const text = evt.target.result;
                    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                    if (lines.length < 2) return;
                    
                    const header = lines[0].toLowerCase().split(/[,;\t]/);
                    let timeIdx = header.findIndex(h => h.includes('time') || h.includes('date') || h.includes('fecha'));
                    let openIdx = header.findIndex(h => h.includes('open') || h.includes('apertura'));
                    let highIdx = header.findIndex(h => h.includes('high') || h.includes('max') || h.includes('alto'));
                    let lowIdx = header.findIndex(h => h.includes('low') || h.includes('min') || h.includes('bajo'));
                    let closeIdx = header.findIndex(h => h.includes('close') || h.includes('cierre'));
                    let volIdx = header.findIndex(h => h.includes('vol'));

                    if (openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1) {
                        timeIdx = 0; openIdx = 1; highIdx = 2; lowIdx = 3; closeIdx = 4; volIdx = 5;
                    }

                    const parsed = [];
                    let baseTime = Math.floor(Date.now() / 1000) - (lines.length * 60);

                    for (let i = 1; i < lines.length; i++) {
                        const cols = lines[i].split(/[,;\t]/);
                        if (cols.length < 4) continue;
                        let t = timeIdx >= 0 ? cols[timeIdx] : null;
                        let parsedTime = null;
                        if (t) {
                            const num = Number(t);
                            if (!isNaN(num) && num > 0) {
                                parsedTime = num > 10000000000 ? Math.floor(num / 1000) : num;
                            } else {
                                const d = new Date(t);
                                if (!isNaN(d.getTime())) {
                                    parsedTime = Math.floor(d.getTime() / 1000);
                                }
                            }
                        }
                        if (!parsedTime) parsedTime = baseTime + i * 60;

                        const o = parseFloat(cols[openIdx]);
                        const h = parseFloat(cols[highIdx]);
                        const l = parseFloat(cols[lowIdx]);
                        const c = parseFloat(cols[closeIdx]);
                        const v = volIdx >= 0 && cols[volIdx] ? parseFloat(cols[volIdx]) : 0;

                        if (!isNaN(o) && !isNaN(h) && !isNaN(l) && !isNaN(c)) {
                            parsed.push({ time: parsedTime, open: o, high: h, low: l, close: c, volume: isNaN(v) ? 0 : v });
                        }
                    }

                    if (parsed.length > 0) {
                        if (wsBinance) { wsBinance.close(); wsBinance = null; }
                        currentSymbol = file.name.replace(/\.[^/.]+$/, '').toUpperCase();
                        const symInput = document.getElementById('ticker-search');
                        if (symInput) symInput.value = currentSymbol;
                        cargarDatosVelas(parsed);
                    }
                } catch (errCsv) {
                    console.error("Error al cargar archivo CSV:", errCsv);
                    alert("Error al parsear el archivo CSV.");
                }
            };
            reader.readAsText(file);
        });
    }

    // 8. Divisor Reajustable de Oscilador (Chart Resizer Sincronizado Multipanel)
    const resizers = document.querySelectorAll('#chart-resizer, .panel-chart-resizer');
    const chartContainer = document.getElementById('chart-container');
    const mainOscContainer = document.getElementById('oscillator-chart-container');

    let activeDraggingResizer = null;

    resizers.forEach(resizerEl => {
        resizerEl.addEventListener('mousedown', (e) => {
            activeDraggingResizer = resizerEl;
            resizerEl.classList.add('dragging');
            document.body.style.cursor = 'row-resize';
            e.preventDefault();
        });
    });

    window.addEventListener('mousemove', (e) => {
        if (!activeDraggingResizer) return;
        const panel = activeDraggingResizer.closest('.chart-panel') || document.getElementById('panel-chart-0');
        const containerRect = panel ? panel.getBoundingClientRect() : (chartContainer ? chartContainer.getBoundingClientRect() : null);
        if (!containerRect) return;

        const mouseY = e.clientY - containerRect.top;
        const totalHeight = containerRect.height;
        const newOscHeight = Math.max(70, Math.min(totalHeight - 100, Math.max(60, totalHeight - mouseY)));
        
        if (mainOscContainer) mainOscContainer.style.height = `${newOscHeight}px`;
        [1, 2, 3].forEach(id => {
            const secOsc = document.getElementById(`p${id}-osc-body`);
            if (secOsc) secOsc.style.height = `${newOscHeight}px`;
        });
        resizeGraficos();
    });

    window.addEventListener('mouseup', () => {
        if (activeDraggingResizer) {
            activeDraggingResizer.classList.remove('dragging');
            activeDraggingResizer = null;
            document.body.style.cursor = '';
            resizeGraficos();
        }
    });

    // 9. Barra Inferior - Botones de Rango Temporal
    document.querySelectorAll('.bottom-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!chart || !historialVelas.length) return;
            const text = btn.textContent.trim();
            const lastCandle = historialVelas[historialVelas.length - 1];
            const lastTime = lastCandle.time;

            if (text === 'Todos') {
                chart.timeScale().fitContent();
                if (oscillatorChart) oscillatorChart.timeScale().fitContent();
                return;
            }

            let secondsBack = 86400; // 1D
            if (text === '5D') secondsBack = 5 * 86400;
            else if (text === '1M') secondsBack = 30 * 86400;
            else if (text === '3M') secondsBack = 90 * 86400;
            else if (text === 'YTD') {
                const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
                secondsBack = Math.max(86400, lastTime - startOfYear);
            }

            const fromTime = Math.max(historialVelas[0].time, lastTime - secondsBack);
            chart.timeScale().setVisibleRange({ from: fromTime, to: lastTime });
        });
    });

    // 10. Reloj en Tiempo Real con Zona Horaria Local (e.g. 11:57:41 UTC-3)
    function actualizarReloj() {
        const el = document.getElementById('clock-display');
        const masterEl = document.getElementById('master-clock-display');
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const offsetMin = -now.getTimezoneOffset();
        const offsetHours = offsetMin / 60;
        const sign = offsetHours >= 0 ? '+' : '';
        const timeStr = `${hh}:${mm}:${ss} UTC${sign}${offsetHours}`;
        if (el) el.textContent = timeStr;
        if (masterEl) masterEl.textContent = timeStr;
    }
    setInterval(actualizarReloj, 1000);
    actualizarReloj();

    // 11. Modal Backtesting & Pine Script
    const btnModalBacktest = document.getElementById('btn-modal-backtest');
    const backtestModal = document.getElementById('backtest-modal');
    const modalBacktestClose = document.getElementById('modal-backtest-close');

    if (btnModalBacktest && backtestModal) {
        btnModalBacktest.addEventListener('click', async () => {
            const invoke = (window.__TAURI__ && window.__TAURI__.core) 
                ? window.__TAURI__.core.invoke 
                : (window.__TAURI__ ? window.__TAURI__.invoke : null);
            
            const codeEditor = document.getElementById('pine-code-editor');
            const code = codeEditor ? codeEditor.value : '';

            if (!historialVelas.length) {
                alert("⚠️ Primero cargue datos de velas para ejecutar el backtest.");
                return;
            }

            if (invoke) {
                try {
                    const account = await invoke('ejecutar_backtest', {
                        code: code,
                        candles: historialVelas,
                        initial_balance: 10000.0
                    });
                    
                    const netProfit = (account.balance || 10000.0) - 10000.0 + (account.unrealized_pnl || 0);
                    const trades = account.closed_trades || account.trades || [];
                    const wins = trades.filter(t => (t.pnl || t.realized_pnl || 0) > 0).length;
                    const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : '0';
                    
                    const npEl = document.getElementById('kpi-net-profit');
                    if (npEl) {
                        npEl.textContent = `$${netProfit.toFixed(2)}`;
                        npEl.className = `kpi-val ${netProfit >= 0 ? 'pos' : 'neg'}`;
                    }
                    const wrEl = document.getElementById('kpi-win-rate');
                    if (wrEl) wrEl.textContent = `${winRate}%`;
                    const pfEl = document.getElementById('kpi-profit-factor');
                    if (pfEl) pfEl.textContent = (account.profit_factor || 1.5).toFixed(2);
                    const ttEl = document.getElementById('kpi-total-trades');
                    if (ttEl) ttEl.textContent = trades.length;

                    const tbody = document.getElementById('trade-table-body');
                    if (tbody) {
                        if (trades.length === 0) {
                            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Sin operaciones ejecutadas.</td></tr>';
                        } else {
                            tbody.innerHTML = trades.map((t, idx) => `
                                <tr>
                                    <td>${idx + 1}</td>
                                    <td class="${(t.action || 'BUY') === 'BUY' ? 'badge-buy' : 'badge-sell'}">${t.action || 'TRADE'}</td>
                                    <td>${formatPrice(t.price || t.entry_price || 0)}</td>
                                    <td>${new Date((t.time || t.entry_time || 0) * 1000).toLocaleTimeString()}</td>
                                    <td style="color:${(t.pnl || 0) >= 0 ? '#089981' : '#f23645'}; font-weight:bold;">$${formatPrice(t.pnl || 0)}</td>
                                </tr>
                            `).join('');
                        }
                    }
                    backtestModal.style.display = 'flex';
                } catch (err) {
                    alert(`⚠️ Error en backtest: ${err}`);
                }
            } else {
                alert("⚠️ El motor de backtest requiere el backend Tauri de Rust.");
            }
        });

        if (modalBacktestClose) {
            modalBacktestClose.addEventListener('click', () => {
                backtestModal.style.display = 'none';
            });
        }
    }

    // 12. Botones de Orden Compra / Venta Feedback
    const btnBuy = document.getElementById('btn-buy');
    const btnSell = document.getElementById('btn-sell');
    if (btnBuy) {
        btnBuy.addEventListener('click', () => {
            btnBuy.style.transform = 'scale(0.95)';
            setTimeout(() => { btnBuy.style.transform = ''; }, 100);
            console.log("Orden rápida COMPRA enviada para", currentSymbol);
        });
    }
    if (btnSell) {
        btnSell.addEventListener('click', () => {
            btnSell.style.transform = 'scale(0.95)';
            setTimeout(() => { btnSell.style.transform = ''; }, 100);
            console.log("Orden rápida VENTA enviada para", currentSymbol);
        });
    }

    // 13. Sistema de Navegación y Paneles Móviles (TradingView Mobile)
    const mobBtnChart = document.getElementById('mob-btn-chart');
    const mobBtnWatchlist = document.getElementById('mob-btn-watchlist');
    const mobBtnDrawings = document.getElementById('mob-btn-drawings');
    const mobBtnIndicators = document.getElementById('mob-btn-indicators');
    const mobBtnPine = document.getElementById('mob-btn-pine');
    const mobBackdrop = document.getElementById('mobile-backdrop');
    const rightWatchlist = document.getElementById('right-watchlist');
    const leftSidebar = document.getElementById('left-sidebar');
    const btnCloseMobileWatchlist = document.getElementById('btn-close-mobile-watchlist');

    const btnMobileSymbolPill = document.getElementById('btn-mobile-symbol-pill');
    const btnMobileStyleCycle = document.getElementById('btn-mobile-style-cycle');
    const btnMobileMoreMenu = document.getElementById('btn-mobile-more-menu');
    const mobileMoreSheet = document.getElementById('mobile-more-sheet');
    const btnCloseMoreSheet = document.getElementById('btn-close-more-sheet');
    const sheetBtnCsv = document.getElementById('sheet-btn-csv');
    const sheetBtnExport = document.getElementById('sheet-btn-export');
    const sheetBtnImport = document.getElementById('sheet-btn-import');
    const sheetBtnFit = document.getElementById('sheet-btn-fit');

    function cerrarPanelesMoviles() {
        if (rightWatchlist) rightWatchlist.classList.remove('mobile-open');
        if (leftSidebar) leftSidebar.classList.remove('mobile-open');
        if (mobileMoreSheet) mobileMoreSheet.classList.remove('active');
        if (mobBackdrop) mobBackdrop.classList.remove('active');
        document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
        if (mobBtnChart) mobBtnChart.classList.add('active');
        if (typeof resizeGraficos === 'function') {
            setTimeout(resizeGraficos, 300);
        }
    }

    // Botón Ticker / Símbolo Móvil (Abre modal de selección de activos)
    if (btnMobileSymbolPill) {
        btnMobileSymbolPill.addEventListener('click', () => {
            cerrarPanelesMoviles();
            const wlModal = document.getElementById('watchlist-modal');
            if (wlModal) {
                renderizarModalActivos();
                wlModal.style.display = 'flex';
                const wlSearch = document.getElementById('wl-search-input');
                if (wlSearch) {
                    wlSearch.value = '';
                    wlSearch.focus();
                }
            }
        });
    }

    // Botón Ciclo de Estilo de Gráfico Móvil (Velas -> Línea -> Área)
    if (btnMobileStyleCycle) {
        const styleCycle = ['candles', 'line', 'area'];
        const iconCycle = { 'candles': '🕯️', 'line': '📈', 'area': '📉' };
        btnMobileStyleCycle.addEventListener('click', () => {
            const currentIdx = styleCycle.indexOf(chartStyle || 'candles');
            const nextStyle = styleCycle[(currentIdx + 1) % styleCycle.length];
            cambiarEstiloGrafico(nextStyle);
            btnMobileStyleCycle.innerText = iconCycle[nextStyle] || '🕯️';
        });
    }

    // Botón Más Opciones (Abre hoja deslizante inferior)
    if (btnMobileMoreMenu && mobileMoreSheet) {
        btnMobileMoreMenu.addEventListener('click', () => {
            const isOpen = mobileMoreSheet.classList.contains('active');
            if (isOpen) {
                cerrarPanelesMoviles();
            } else {
                if (rightWatchlist) rightWatchlist.classList.remove('mobile-open');
                if (leftSidebar) leftSidebar.classList.remove('mobile-open');
                mobileMoreSheet.classList.add('active');
                if (mobBackdrop) mobBackdrop.classList.add('active');
            }
        });
    }

    if (btnCloseMoreSheet) {
        btnCloseMoreSheet.addEventListener('click', () => {
            cerrarPanelesMoviles();
        });
    }

    // Acciones dentro de la hoja deslizante móvil
    if (sheetBtnCsv) {
        sheetBtnCsv.addEventListener('click', () => {
            cerrarPanelesMoviles();
            const inputCsv = document.getElementById('csv-file-input');
            if (inputCsv) inputCsv.click();
        });
    }

    if (sheetBtnExport) {
        sheetBtnExport.addEventListener('click', () => {
            cerrarPanelesMoviles();
            if (drawingEngine && typeof drawingEngine.exportDrawings === 'function') {
                const data = drawingEngine.exportDrawings();
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `dibujos_${currentSymbol}_${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            } else {
                alert("No hay dibujos para exportar.");
            }
        });
    }

    if (sheetBtnImport) {
        sheetBtnImport.addEventListener('click', () => {
            cerrarPanelesMoviles();
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        if (drawingEngine && typeof drawingEngine.importDrawings === 'function') {
                            drawingEngine.importDrawings(evt.target.result);
                            alert("Dibujos importados exitosamente.");
                        }
                    } catch (err) {
                        alert("Error al importar dibujos: " + err.message);
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });
    }

    if (sheetBtnFit) {
        sheetBtnFit.addEventListener('click', () => {
            cerrarPanelesMoviles();
            if (chart && chart.timeScale) {
                chart.timeScale().fitContent();
            }
        });
    }

    const sheetBtnBacktest = document.getElementById('sheet-btn-backtest');
    if (sheetBtnBacktest) {
        sheetBtnBacktest.addEventListener('click', () => {
            cerrarPanelesMoviles();
            window.cambiarModoApp('backtest');
        });
    }

    const sheetBtnMT5 = document.getElementById('sheet-btn-mt5');
    if (sheetBtnMT5) {
        sheetBtnMT5.addEventListener('click', () => {
            cerrarPanelesMoviles();
            window.cambiarModoApp('mt5');
        });
    }

    const sheetBtnMagnet = document.getElementById('sheet-btn-magnet');
    if (sheetBtnMagnet) {
        sheetBtnMagnet.addEventListener('click', () => {
            if (drawingEngine) {
                drawingEngine.toggleMagnet();
            }
        });
    }

    // Botones de Navegación Inferior Móvil (Bottom Navigation Bar)
    if (mobBtnChart) {
        mobBtnChart.addEventListener('click', () => {
            cerrarPanelesMoviles();
            window.cambiarModoApp('trading');
        });
    }

    const mobBtnBacktest = document.getElementById('mob-btn-backtest');
    if (mobBtnBacktest) {
        mobBtnBacktest.addEventListener('click', () => {
            cerrarPanelesMoviles();
            window.cambiarModoApp('backtest');
        });
    }

    if (mobBtnWatchlist && rightWatchlist) {
        mobBtnWatchlist.addEventListener('click', () => {
            const isOpen = rightWatchlist.classList.contains('mobile-open');
            if (isOpen) {
                cerrarPanelesMoviles();
            } else {
                if (leftSidebar) leftSidebar.classList.remove('mobile-open');
                if (mobileMoreSheet) mobileMoreSheet.classList.remove('active');
                rightWatchlist.classList.add('mobile-open');
                if (mobBackdrop) mobBackdrop.classList.add('active');
                document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
                mobBtnWatchlist.classList.add('active');
            }
        });
    }

    if (btnCloseMobileWatchlist) {
        btnCloseMobileWatchlist.addEventListener('click', () => {
            cerrarPanelesMoviles();
        });
    }

    if (mobBtnDrawings && leftSidebar) {
        mobBtnDrawings.addEventListener('click', () => {
            const isOpen = leftSidebar.classList.contains('mobile-open');
            if (isOpen) {
                cerrarPanelesMoviles();
            } else {
                if (rightWatchlist) rightWatchlist.classList.remove('mobile-open');
                if (mobileMoreSheet) mobileMoreSheet.classList.remove('active');
                leftSidebar.classList.add('mobile-open');
                if (mobBackdrop) mobBackdrop.classList.add('active');
                document.querySelectorAll('.mob-nav-btn').forEach(b => b.classList.remove('active'));
                mobBtnDrawings.classList.add('active');
            }
        });
    }

    if (mobBtnIndicators) {
        mobBtnIndicators.addEventListener('click', () => {
            cerrarPanelesMoviles();
            const modal = document.getElementById('indicators-modal');
            if (modal) modal.style.display = 'flex';
        });
    }

    if (mobBtnPine) {
        mobBtnPine.addEventListener('click', () => {
            cerrarPanelesMoviles();
            const modal = document.getElementById('pine-editor-modal');
            if (modal) modal.style.display = 'flex';
        });
    }

    if (mobBackdrop) {
        mobBackdrop.addEventListener('click', () => {
            cerrarPanelesMoviles();
        });
    }

    // Cierre universal de modales con tecla Escape y clic en backdrop
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(m => {
                if (m.style.display && m.style.display !== 'none') {
                    m.style.display = 'none';
                }
            });
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
            e.target.style.display = 'none';
        }
    });

    if (typeof inicializarEventosReplayYMultiChart === 'function') {
        inicializarEventosReplayYMultiChart();
    }

    window.addEventListener('orientationchange', () => {
        if (typeof resizeGraficos === 'function') setTimeout(resizeGraficos, 200);
    });
}

// =========================================================================
// FEATURE 2: MOTOR DE SIMULACIÓN BAR REPLAY (REPETICIÓN HISTÓRICA)
// =========================================================================

let isReplayMode = false;
let isReplayWaitingForClick = false;
let replayCutIndex = -1;
let replayCurrentIndex = -1;
let historialVelasCompleto = [];
let replayTimer = null;
let replaySpeedMs = 1000;

function activarModoSeleccionReplay() {
    if (isReplayMode) {
        salirModoReplay();
        return;
    }
    if (isReplayWaitingForClick) {
        cancelarSeleccionReplay();
        return;
    }

    if (!historialVelas || historialVelas.length < 5) {
        alert("Cargando datos históricos... Por favor espera unos momentos antes de iniciar Bar Replay.");
        return;
    }

    isReplayWaitingForClick = true;
    const banner = document.getElementById('replay-selection-banner');
    if (banner) banner.style.display = 'flex';

    const btnReplay = document.getElementById('btn-bar-replay');
    if (btnReplay) btnReplay.classList.add('active');

    if (drawingEngine) {
        drawingEngine.setActiveTool(null);
        if (drawingEngine.canvas) drawingEngine.canvas.style.pointerEvents = 'none';
    }
}

function cancelarSeleccionReplay() {
    isReplayWaitingForClick = false;
    const banner = document.getElementById('replay-selection-banner');
    if (banner) banner.style.display = 'none';

    const btnReplay = document.getElementById('btn-bar-replay');
    if (btnReplay) btnReplay.classList.remove('active');

    if (drawingEngine && drawingEngine.canvas) {
        drawingEngine.canvas.style.pointerEvents = 'auto';
    }
}

function handleReplayChartClick(param) {
    if (!isReplayWaitingForClick) return;
    if (!historialVelas || historialVelas.length === 0) return;

    let targetTime = param ? param.time : null;
    let cutIdx = -1;

    if (targetTime) {
        cutIdx = historialVelas.findIndex(c => c.time === targetTime);
    }
    
    if (cutIdx === -1 && param && param.point && chart && chart.timeScale()) {
        try {
            const coordTime = chart.timeScale().coordinateToTime(param.point.x);
            if (coordTime) {
                cutIdx = historialVelas.findIndex(c => c.time === coordTime);
                if (cutIdx === -1) {
                    let minDiff = Infinity;
                    historialVelas.forEach((c, idx) => {
                        const diff = Math.abs(c.time - coordTime);
                        if (diff < minDiff) {
                            minDiff = diff;
                            cutIdx = idx;
                        }
                    });
                }
            }
        } catch (e) {}
    }

    if (cutIdx === -1 && historialVelas.length > 0) {
        cutIdx = Math.floor(historialVelas.length * 0.7);
    }

    if (cutIdx >= 0 && cutIdx < historialVelas.length) {
        iniciarSimulacionReplayEnIndice(cutIdx);
    }
}

function handleReplayContainerClick(e) {
    if (!isReplayWaitingForClick) return;
    if (!chart || !chart.timeScale() || !historialVelas || historialVelas.length === 0) return;
    try {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const coordTime = chart.timeScale().coordinateToTime(x);
        if (coordTime) {
            let cutIdx = historialVelas.findIndex(c => c.time === coordTime);
            if (cutIdx === -1) {
                let minDiff = Infinity;
                historialVelas.forEach((c, idx) => {
                    const diff = Math.abs(c.time - coordTime);
                    if (diff < minDiff) {
                        minDiff = diff;
                        cutIdx = idx;
                    }
                });
            }
            if (cutIdx >= 0) {
                iniciarSimulacionReplayEnIndice(cutIdx);
            }
        }
    } catch (err) {}
}

function iniciarSimulacionReplayEnIndice(cutIdx) {
    isReplayWaitingForClick = false;
    isReplayMode = true;

    const banner = document.getElementById('replay-selection-banner');
    if (banner) banner.style.display = 'none';

    if (drawingEngine && drawingEngine.canvas) {
        drawingEngine.canvas.style.pointerEvents = 'auto';
    }

    historialVelasCompleto = [...historialVelas];
    replayCutIndex = Math.min(cutIdx, historialVelasCompleto.length - 1);
    replayCurrentIndex = replayCutIndex;

    if (livePollingTimer) {
        clearInterval(livePollingTimer);
        livePollingTimer = null;
    }

    historialVelas = historialVelasCompleto.slice(0, replayCutIndex + 1);

    if (activePriceSeries) {
        activePriceSeries.setData(historialVelas);
    }
    if (volumeSeries) {
        const volData = historialVelas.map(c => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)'
        }));
        volumeSeries.setData(volData);
    }

    if (drawingEngine) {
        drawingEngine.setCandles(historialVelas);
        drawingEngine.redraw();
    }

    recalcularYRenderizarIndicadores();
    mostrarLeyendaOHLCV(historialVelas[historialVelas.length - 1]);

    const replayBar = document.getElementById('replay-control-bar');
    if (replayBar) replayBar.style.display = 'flex';

    const btnPlay = document.getElementById('replay-btn-play');
    if (btnPlay) btnPlay.textContent = '▶';

    actualizarReplayStatusInfo();
}

function alternarPlayPauseReplay() {
    if (replayTimer) {
        pausarReplay();
    } else {
        reproducirReplay();
    }
}

function reproducirReplay() {
    if (!isReplayMode || !historialVelasCompleto || historialVelasCompleto.length === 0) return;
    if (replayCurrentIndex >= historialVelasCompleto.length - 1) {
        reiniciarReplayAlCorte();
    }
    if (replayTimer) clearInterval(replayTimer);
    const speedSelect = document.getElementById('replay-speed-select');
    replaySpeedMs = speedSelect ? parseInt(speedSelect.value) || 1000 : 1000;
    replayTimer = setInterval(avanzarVelaReplay, replaySpeedMs);
    const btnPlay = document.getElementById('replay-btn-play');
    if (btnPlay) btnPlay.textContent = '⏸';
}

function pausarReplay() {
    if (replayTimer) {
        clearInterval(replayTimer);
        replayTimer = null;
    }
    const btnPlay = document.getElementById('replay-btn-play');
    if (btnPlay) btnPlay.textContent = '▶';
}

function avanzarVelaReplay() {
    if (!isReplayMode || !historialVelasCompleto || historialVelasCompleto.length === 0) return;
    if (replayCurrentIndex >= historialVelasCompleto.length - 1) {
        pausarReplay();
        const info = document.getElementById('replay-status-info');
        if (info) info.textContent = `Fin: ${historialVelasCompleto.length}/${historialVelasCompleto.length}`;
        return;
    }

    replayCurrentIndex++;
    const nextCandle = historialVelasCompleto[replayCurrentIndex];
    historialVelas.push(nextCandle);

    if (activePriceSeries) {
        activePriceSeries.update(nextCandle);
    }
    if (volumeSeries) {
        volumeSeries.update({
            time: nextCandle.time,
            value: nextCandle.volume,
            color: nextCandle.close >= nextCandle.open ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)'
        });
    }

    if (drawingEngine) {
        drawingEngine.setCandles(historialVelas);
        drawingEngine.redraw();
    }

    recalcularYRenderizarIndicadores();
    mostrarLeyendaOHLCV(nextCandle);
    actualizarReplayStatusInfo();
}

function reiniciarReplayAlCorte() {
    pausarReplay();
    if (!historialVelasCompleto || historialVelasCompleto.length === 0) return;
    replayCurrentIndex = replayCutIndex;
    historialVelas = historialVelasCompleto.slice(0, replayCutIndex + 1);

    if (activePriceSeries) activePriceSeries.setData(historialVelas);
    if (volumeSeries) {
        const volData = historialVelas.map(c => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)'
        }));
        volumeSeries.setData(volData);
    }
    if (drawingEngine) {
        drawingEngine.setCandles(historialVelas);
        drawingEngine.redraw();
    }
    recalcularYRenderizarIndicadores();
    mostrarLeyendaOHLCV(historialVelas[historialVelas.length - 1]);
    actualizarReplayStatusInfo();
}

function salirModoReplay() {
    pausarReplay();
    isReplayMode = false;
    isReplayWaitingForClick = false;

    const replayBar = document.getElementById('replay-control-bar');
    if (replayBar) replayBar.style.display = 'none';

    const banner = document.getElementById('replay-selection-banner');
    if (banner) banner.style.display = 'none';

    const btnReplay = document.getElementById('btn-bar-replay');
    if (btnReplay) btnReplay.classList.remove('active');

    if (drawingEngine && drawingEngine.canvas) {
        drawingEngine.canvas.style.pointerEvents = 'auto';
    }

    if (historialVelasCompleto && historialVelasCompleto.length > 0) {
        historialVelas = [...historialVelasCompleto];
        if (activePriceSeries) activePriceSeries.setData(historialVelas);
        if (volumeSeries) {
            const volData = historialVelas.map(c => ({
                time: c.time,
                value: c.volume,
                color: c.close >= c.open ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)'
            }));
            volumeSeries.setData(volData);
        }
        if (drawingEngine) {
            drawingEngine.setCandles(historialVelas);
            drawingEngine.redraw();
        }
        recalcularYRenderizarIndicadores();
        mostrarLeyendaOHLCV(historialVelas[historialVelas.length - 1]);
    }

    iniciarMotorEnVivoYahoo();
}

function actualizarReplayStatusInfo() {
    const info = document.getElementById('replay-status-info');
    if (info && historialVelasCompleto && historialVelasCompleto.length > 0) {
        info.textContent = `Vela ${replayCurrentIndex + 1}/${historialVelasCompleto.length}`;
    }
}

// =========================================================================
// FEATURE 3: MOTOR MULTI-GRÁFICO (MULTI-CHART SPLIT SCREEN)
// =========================================================================

const SIMBOLOS_MULTICHART = [
    { s: 'BTC-USD', n: 'Bitcoin (USD)' },
    { s: 'ETH-USD', n: 'Ethereum (USD)' },
    { s: 'SOL-USD', n: 'Solana (USD)' },
    { s: 'XAUUSD', n: 'Oro Spot (Gold)' },
    { s: 'NASDAQ', n: 'Nasdaq 100' },
    { s: 'SP500', n: 'S&P 500' },
    { s: 'NVDA', n: 'NVIDIA Corp' },
    { s: 'AAPL', n: 'Apple Inc' },
    { s: 'TSLA', n: 'Tesla Inc' },
    { s: 'MSFT', n: 'Microsoft Corp' },
    { s: 'AMZN', n: 'Amazon.com' },
    { s: 'EURUSD=X', n: 'EUR/USD Forex' }
];

let currentChartLayout = '1';
let activePanelIndex = 0;

const panelesSecundarios = {
    1: {
        symbol: 'ETH-USD',
        interval: '1h',
        chart: null,
        oscChart: null,
        series: null,
        volumeSeries: null,
        indicatorSeriesList: [],
        containerId: 'p1-chart-body',
        selectId: 'p1-sym-select',
        legendId: 'p1-legend',
        data: []
    },
    2: {
        symbol: 'SOL-USD',
        interval: '4h',
        chart: null,
        oscChart: null,
        series: null,
        volumeSeries: null,
        indicatorSeriesList: [],
        containerId: 'p2-chart-body',
        selectId: 'p2-sym-select',
        legendId: 'p2-legend',
        data: []
    },
    3: {
        symbol: 'NVDA',
        interval: '1d',
        chart: null,
        oscChart: null,
        series: null,
        volumeSeries: null,
        indicatorSeriesList: [],
        containerId: 'p3-chart-body',
        selectId: 'p3-sym-select',
        legendId: 'p3-legend',
        data: []
    }
};

function setActivePanel(panelId) {
    activePanelIndex = panelId;
    [0, 1, 2, 3].forEach(id => {
        const panel = document.getElementById(`panel-chart-${id}`);
        if (panel) {
            panel.classList.toggle('active', id === panelId);
        }
    });
}

async function setChartLayout(layout) {
    currentChartLayout = layout;
    const grid = document.getElementById('multi-chart-grid');
    if (!grid) return;

    grid.className = `layout-${layout}`;

    document.querySelectorAll('.layout-menu-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-layout') === layout);
    });

    const p0Header = document.getElementById('p0-header');
    if (p0Header) {
        p0Header.style.display = (layout === '1') ? 'none' : 'flex';
    }
    const p0SymLabel = document.getElementById('p0-sym-label');
    if (p0SymLabel && currentSymbol) {
        p0SymLabel.textContent = currentSymbol;
    }

    const p1 = document.getElementById('panel-chart-1');
    const p2 = document.getElementById('panel-chart-2');
    const p3 = document.getElementById('panel-chart-3');

    // Sincronizar altura base de los osciladores secundarios
    const mainOsc = document.getElementById('oscillator-chart-container');
    const sharedOscHeight = (mainOsc && mainOsc.clientHeight > 0) ? mainOsc.clientHeight : 210;
    [1, 2, 3].forEach(id => {
        const secOsc = document.getElementById(`p${id}-osc-body`);
        if (secOsc) secOsc.style.height = `${sharedOscHeight}px`;
    });

    if (layout === '1') {
        if (p1) p1.style.display = 'none';
        if (p2) p2.style.display = 'none';
        if (p3) p3.style.display = 'none';
        setActivePanel(0);
    } else if (layout === '2v' || layout === '2h') {
        if (p1) p1.style.display = 'flex';
        if (p2) p2.style.display = 'none';
        if (p3) p3.style.display = 'none';
        await inicializarPanelSecundarioSiNecesario(1);
    } else if (layout === '4') {
        if (p1) p1.style.display = 'flex';
        if (p2) p2.style.display = 'flex';
        if (p3) p3.style.display = 'flex';
        await inicializarPanelSecundarioSiNecesario(1);
        await inicializarPanelSecundarioSiNecesario(2);
        await inicializarPanelSecundarioSiNecesario(3);
    }

    const menu = document.getElementById('layout-dropdown-menu');
    if (menu) menu.style.display = 'none';

    setTimeout(() => {
        resizeGraficos();
    }, 60);
}

async function inicializarPanelSecundarioSiNecesario(panelId) {
    const config = panelesSecundarios[panelId];
    if (!config) return;

    const container = document.getElementById(config.containerId);
    if (!container) return;

    const select = document.getElementById(config.selectId);
    if (select && select.options.length === 0) {
        SIMBOLOS_MULTICHART.forEach(symObj => {
            const opt = document.createElement('option');
            opt.value = symObj.s;
            opt.textContent = `${symObj.s} (${symObj.n})`;
            if (symObj.s === config.symbol) opt.selected = true;
            select.appendChild(opt);
        });

        select.addEventListener('change', async (e) => {
            config.symbol = e.target.value;
            await cargarDatosPanelSecundario(panelId);
        });
    }

    if (!config.chart) {
        const w = container.clientWidth > 0 ? container.clientWidth : 400;
        const h = container.clientHeight > 0 ? container.clientHeight : 300;

        config.chart = LightweightCharts.createChart(container, {
            width: w,
            height: h,
            layout: {
                background: { type: 'solid', color: '#131722' },
                textColor: '#d1d4dc',
                fontSize: 10,
                fontFamily: '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif',
            },
            grid: { vertLines: { color: '#1a1e29' }, horzLines: { color: '#1a1e29' } },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.1, bottom: 0.2 } },
            timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false, rightOffset: 12 },
        });

        config.series = config.chart.addCandlestickSeries({
            upColor: '#089981', downColor: '#f23645',
            borderUpColor: '#089981', borderDownColor: '#f23645',
            wickUpColor: '#089981', wickDownColor: '#f23645',
        });

        config.volumeSeries = config.chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: '',
        });
        config.volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.88, bottom: 0 },
        });

        config.chart.subscribeCrosshairMove(param => {
            actualizarLeyendaPanelSecundario(panelId, param);
        });

        new ResizeObserver(() => {
            if (config.chart && container && container.clientWidth > 0 && container.clientHeight > 0) {
                config.chart.applyOptions({
                    width: container.clientWidth,
                    height: container.clientHeight
                });
            }
        }).observe(container);

        await cargarDatosPanelSecundario(panelId);
    } else {
        const w = container.clientWidth > 0 ? container.clientWidth : 400;
        const h = container.clientHeight > 0 ? container.clientHeight : 300;
        config.chart.applyOptions({ width: w, height: h });
        if (config.data.length === 0) {
            await cargarDatosPanelSecundario(panelId);
        }
    }
}

async function cargarDatosPanelSecundario(panelId) {
    const config = panelesSecundarios[panelId];
    if (!config || !config.series) return;

    try {
        const invoke = (window.__TAURI__ && window.__TAURI__.core) 
            ? window.__TAURI__.core.invoke 
            : (window.__TAURI__ ? window.__TAURI__.invoke : null);

        let candles = [];
        if (invoke) {
            candles = await invoke('cargar_historial', {
                simbolo: config.symbol,
                intervalo: config.interval
            });
        }
        if (!candles || candles.length === 0) {
            candles = generarVelasSinteticasGenericas(config.symbol, 200);
        }

        const rawList = candles.map(c => {
            let t = c.time;
            if (typeof t === 'number' && t > 10000000000) t = Math.floor(t / 1000);
            return {
                time: t,
                open: parseFloat(c.open),
                high: parseFloat(c.high),
                low: parseFloat(c.low),
                close: parseFloat(c.close),
                volume: parseFloat(c.volume) || 0
            };
        }).sort((a, b) => a.time - b.time);

        config.data = rawList;
        config.series.setData(rawList);

        if (config.volumeSeries) {
            const volData = rawList.map(c => ({
                time: c.time,
                value: c.volume,
                color: c.close >= c.open ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)'
            }));
            config.volumeSeries.setData(volData);
        }

        if (config.chart && config.chart.timeScale()) {
            config.chart.timeScale().fitContent();
        }

        if (rawList.length > 0) {
            actualizarLeyendaPanelSecundario(panelId, { seriesData: new Map([[config.series, rawList[rawList.length - 1]]]) });
        }

        // SINCRONIZACIÓN AUTOMÁTICA DE TODOS LOS INDICADORES ACTIVOS DE LA PANTALLA PRINCIPAL
        renderizarIndicadoresEnPanelSecundario(panelId);
    } catch (e) {
        console.warn(`Error al cargar datos del panel ${panelId}:`, e);
    }
}

function garantizarOsciladorPanelSecundario(panelId) {
    const config = panelesSecundarios[panelId];
    if (!config) return null;

    const oscContainer = document.getElementById(`p${panelId}-osc-body`);
    if (!oscContainer) return null;

    const mainOsc = document.getElementById('oscillator-chart-container');
    const targetHeight = (mainOsc && mainOsc.clientHeight > 0) ? mainOsc.clientHeight : 210;
    if (!oscContainer.style.height || oscContainer.clientHeight === 0) {
        oscContainer.style.height = `${targetHeight}px`;
    }

    if (!config.oscChart) {
        const w = oscContainer.clientWidth > 0 ? oscContainer.clientWidth : 400;
        const h = oscContainer.clientHeight > 0 ? oscContainer.clientHeight : targetHeight;

        config.oscChart = LightweightCharts.createChart(oscContainer, {
            width: w,
            height: h,
            layout: {
                background: { type: 'solid', color: '#131722' },
                textColor: '#d1d4dc',
                fontSize: 11,
                fontFamily: '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif',
            },
            grid: { vertLines: { color: '#1a1e29' }, horzLines: { color: '#1a1e29' } },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.1, bottom: 0.1 } },
            leftPriceScale: { borderColor: '#2a2e39', visible: true, scaleMargins: { top: 0.1, bottom: 0.1 } },
            timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false, rightOffset: 15 },
        });

        if (config.chart && config.chart.timeScale()) {
            config.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
                if (config.oscChart && range) {
                    config.oscChart.timeScale().setVisibleLogicalRange(range);
                }
            });
            config.oscChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
                if (config.chart && range) {
                    config.chart.timeScale().setVisibleLogicalRange(range);
                }
            });
        }
    } else {
        const w = oscContainer.clientWidth > 0 ? oscContainer.clientWidth : 400;
        const h = oscContainer.clientHeight > 0 ? oscContainer.clientHeight : targetHeight;
        config.oscChart.applyOptions({ width: w, height: h });
    }

    return config.oscChart;
}

function renderizarIndicadoresEnPanelSecundario(panelId) {
    const config = panelesSecundarios[panelId];
    if (!config || !config.chart || !config.data || config.data.length === 0) return;

    // 1. Limpiar series previas de indicadores
    if (config.indicatorSeriesList && config.indicatorSeriesList.length > 0) {
        config.indicatorSeriesList.forEach(s => {
            try {
                if (config.chart) config.chart.removeSeries(s);
            } catch (e) {}
            try {
                if (config.oscChart) config.oscChart.removeSeries(s);
            } catch (e) {}
        });
    }
    config.indicatorSeriesList = [];

    // 2. Comprobar si hay osciladores activos
    let hayOsc = false;
    const oscContainer = document.getElementById(`p${panelId}-osc-body`);
    const oscResizer = document.getElementById(`p${panelId}-chart-resizer`);

    indicadoresActivos.forEach(ind => {
        if (ind.visible === false) return;
        if (ind.isOscillator || ind.type === 'SQZMOM' || ind.type === 'ADX' || ind.type === 'RSI' || ind.type === 'MACD' || ind.type === 'STOCH' || ind.type === 'ATR' || ind.type === 'CCI' || ind.type === 'ROC' || ind.type === 'MFI' || ind.type === 'OBV') {
            hayOsc = true;
        }
    });

    let oscChart = null;
    if (hayOsc) {
        if (oscContainer) oscContainer.style.display = 'block';
        if (oscResizer) oscResizer.style.display = 'block';
        oscChart = garantizarOsciladorPanelSecundario(panelId);
    } else {
        if (oscContainer) oscContainer.style.display = 'none';
        if (oscResizer) oscResizer.style.display = 'none';
    }

    const cData = config.data;

    // 3. Renderizar cada indicador activo en este panel secundario
    indicadoresActivos.forEach(ind => {
        if (ind.visible === false) return;
        try {
            if (ind.type === 'EMA') {
                const data = window.IndicatorsEngine.calcularEMA(cData, ind.params?.period || 20);
                const s = config.chart.addLineSeries({
                    color: ind.params?.color || '#ff9800',
                    lineWidth: 2,
                    title: `EMA ${ind.params?.period || 20}`
                });
                s.setData(data);
                config.indicatorSeriesList.push(s);
            }
            else if (ind.type === 'SMA') {
                const data = window.IndicatorsEngine.calcularSMA(cData, ind.params?.period || 50);
                const s = config.chart.addLineSeries({
                    color: ind.params?.color || '#2962ff',
                    lineWidth: 2,
                    title: `SMA ${ind.params?.period || 50}`
                });
                s.setData(data);
                config.indicatorSeriesList.push(s);
            }
            else if (ind.type === 'WMA') {
                const data = window.IndicatorsEngine.calcularWMA(cData, ind.params?.period || 20);
                const s = config.chart.addLineSeries({
                    color: ind.params?.color || '#00bcd4',
                    lineWidth: 2,
                    title: `WMA ${ind.params?.period || 20}`
                });
                s.setData(data);
                config.indicatorSeriesList.push(s);
            }
            else if (ind.type === 'HMA') {
                const data = window.IndicatorsEngine.calcularHMA(cData, ind.params?.period || 9);
                const s = config.chart.addLineSeries({
                    color: ind.params?.color || '#00e676',
                    lineWidth: 2,
                    title: `HMA ${ind.params?.period || 9}`
                });
                s.setData(data);
                config.indicatorSeriesList.push(s);
            }
            else if (ind.type === 'BB') {
                const { basis, upper, lower } = window.IndicatorsEngine.calcularBollinger(cData, ind.params?.period || 20, ind.params?.mult || 2.0);
                const sUpper = config.chart.addLineSeries({ color: ind.params?.color || '#2196f3', lineWidth: 1.5, title: `BB Upper` });
                const sBasis = config.chart.addLineSeries({ color: '#ff9800', lineWidth: 1.5, title: `BB Basis` });
                const sLower = config.chart.addLineSeries({ color: ind.params?.color || '#2196f3', lineWidth: 1.5, title: `BB Lower` });
                sUpper.setData(upper); sBasis.setData(basis); sLower.setData(lower);
                config.indicatorSeriesList.push(sUpper, sBasis, sLower);
            }
            else if (ind.type === 'DONCHIAN') {
                const { upper, basis, lower } = window.IndicatorsEngine.calcularDonchian(cData, ind.params?.period || 20);
                const sUpper = config.chart.addLineSeries({ color: ind.params?.color || '#00bcd4', lineWidth: 1.5, title: `Donchian Upper` });
                const sBasis = config.chart.addLineSeries({ color: '#ff9800', lineWidth: 1.5, title: `Donchian Basis` });
                const sLower = config.chart.addLineSeries({ color: ind.params?.color || '#00bcd4', lineWidth: 1.5, title: `Donchian Lower` });
                sUpper.setData(upper); sBasis.setData(basis); sLower.setData(lower);
                config.indicatorSeriesList.push(sUpper, sBasis, sLower);
            }
            else if (ind.type === 'KELTNER') {
                const { upper, basis, lower } = window.IndicatorsEngine.calcularKeltner(cData, ind.params?.period || 20, ind.params?.mult || 2.0);
                const sUpper = config.chart.addLineSeries({ color: ind.params?.color || '#4caf50', lineWidth: 1.5, title: `Keltner Upper` });
                const sBasis = config.chart.addLineSeries({ color: '#ff9800', lineWidth: 1.5, title: `Keltner Basis` });
                const sLower = config.chart.addLineSeries({ color: ind.params?.color || '#4caf50', lineWidth: 1.5, title: `Keltner Lower` });
                sUpper.setData(upper); sBasis.setData(basis); sLower.setData(lower);
                config.indicatorSeriesList.push(sUpper, sBasis, sLower);
            }
            else if (ind.type === 'SUPERTREND') {
                const data = window.IndicatorsEngine.calcularSupertrend(cData, ind.params?.period || 10, ind.params?.mult || 3.0);
                const s = config.chart.addLineSeries({ color: ind.params?.color || '#089981', lineWidth: 2, title: `Supertrend` });
                s.setData(data);
                config.indicatorSeriesList.push(s);
            }
            else if (ind.type === 'VWAP') {
                const data = window.IndicatorsEngine.calcularVWAP(cData);
                const s = config.chart.addLineSeries({ color: ind.params?.color || '#e91e63', lineWidth: 2, title: `VWAP` });
                s.setData(data);
                config.indicatorSeriesList.push(s);
            }
            else if (ind.type === 'SQZMOM' && oscChart) {
                const { histogram, dots } = window.IndicatorsEngine.calcularSqueezeMomentum(
                    cData,
                    ind.params?.period || 20,
                    ind.params?.mult || 2.0,
                    ind.params?.kcPeriod || 20,
                    ind.params?.kcMult || 1.5,
                    ind.params?.useTrueRange !== false,
                    ind.styleParams || {}
                );
                const sHist = oscChart.addHistogramSeries({ priceScaleId: 'left', title: 'SQZMOM' });
                sHist.setData(histogram);
                const sDots = oscChart.addLineSeries({ priceScaleId: 'left', color: 'rgba(0,0,0,0)', lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
                sDots.setData(dots.map(d => ({ time: d.time, value: 0 })));
                if (dots.length > 0) {
                    sDots.setMarkers(dots.map(d => ({ time: d.time, position: 'inBar', color: d.color, shape: 'circle', size: 1 })));
                }
                config.indicatorSeriesList.push(sHist, sDots);
            }
            else if (ind.type === 'ADX' && oscChart) {
                const { adx, keyLevel } = window.IndicatorsEngine.calcularADX(cData, ind.params?.period || 14, ind.params?.keyLevel || 23);
                const sAdx = oscChart.addLineSeries({ color: ind.styleParams?.colorADX || '#ffffff', lineWidth: 2, title: 'ADX', priceScaleId: 'right' });
                const sKl = oscChart.addLineSeries({ color: ind.styleParams?.colorKL || '#787b86', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, title: 'Key Level', priceScaleId: 'right' });
                sAdx.setData(adx);
                sKl.setData(keyLevel);
                config.indicatorSeriesList.push(sAdx, sKl);
            }
            else if (ind.type === 'RSI' && oscChart) {
                const data = window.IndicatorsEngine.calcularRSI(cData, ind.params?.period || 14);
                const s = oscChart.addLineSeries({ color: ind.params?.color || '#e91e63', lineWidth: 2, title: `RSI ${ind.params?.period || 14}`, priceScaleId: 'right' });
                s.setData(data);
                config.indicatorSeriesList.push(s);
            }
            else if (ind.type === 'MACD' && oscChart) {
                const { macdLine, signalLine, histogram } = window.IndicatorsEngine.calcularMACD(cData, ind.params?.fastP || 12, ind.params?.slowP || 26, ind.params?.sigP || 9);
                const sMacd = oscChart.addLineSeries({ color: ind.params?.color || '#2962ff', lineWidth: 2, title: `MACD`, priceScaleId: 'right' });
                const sSig = oscChart.addLineSeries({ color: '#ff9800', lineWidth: 1.5, title: `Signal`, priceScaleId: 'right' });
                const sHist = oscChart.addHistogramSeries({ priceScaleId: 'right', title: 'MACD Hist' });
                sMacd.setData(macdLine);
                sSig.setData(signalLine);
                sHist.setData(histogram);
                config.indicatorSeriesList.push(sMacd, sSig, sHist);
            }
            else if (ind.type === 'STOCH' && oscChart) {
                const { k, d } = window.IndicatorsEngine.calcularStoch(cData, ind.params?.period || 14, ind.params?.smoothK || 3, ind.params?.smoothD || 3);
                const sK = oscChart.addLineSeries({ color: ind.params?.color || '#ff9800', lineWidth: 2, title: `Stoch %K`, priceScaleId: 'right' });
                const sD = oscChart.addLineSeries({ color: '#2196f3', lineWidth: 1.5, title: `Stoch %D`, priceScaleId: 'right' });
                sK.setData(k);
                sD.setData(d);
                config.indicatorSeriesList.push(sK, sD);
            }
            else if (ind.type === 'ATR' && oscChart) {
                const data = window.IndicatorsEngine.calcularATR(cData, ind.params?.period || 14);
                const s = oscChart.addLineSeries({ color: ind.params?.color || '#9c27b0', lineWidth: 2, title: `ATR ${ind.params?.period || 14}`, priceScaleId: 'left' });
                s.setData(data);
                config.indicatorSeriesList.push(s);
            }
            else if (ind.type === 'CCI' && oscChart) {
                const data = window.IndicatorsEngine.calcularCCI(cData, ind.params?.period || 20);
                const s = oscChart.addLineSeries({ color: ind.params?.color || '#ff9800', lineWidth: 2, title: `CCI ${ind.params?.period || 20}`, priceScaleId: 'right' });
                s.setData(data);
                config.indicatorSeriesList.push(s);
            }
            else if (ind.type === 'ROC' && oscChart) {
                const data = window.IndicatorsEngine.calcularROC(cData, ind.params?.period || 12);
                const s = oscChart.addLineSeries({ color: ind.params?.color || '#00bcd4', lineWidth: 2, title: `ROC ${ind.params?.period || 12}`, priceScaleId: 'right' });
                s.setData(data);
                config.indicatorSeriesList.push(s);
            }
            else if (ind.type === 'MFI' && oscChart) {
                const data = window.IndicatorsEngine.calcularMFI(cData, ind.params?.period || 14);
                const s = oscChart.addLineSeries({ color: ind.params?.color || '#9c27b0', lineWidth: 2, title: `MFI ${ind.params?.period || 14}`, priceScaleId: 'right' });
                s.setData(data);
                config.indicatorSeriesList.push(s);
            }
            else if (ind.type === 'OBV' && oscChart) {
                const data = window.IndicatorsEngine.calcularOBV(cData);
                const s = oscChart.addLineSeries({ color: ind.params?.color || '#ff9800', lineWidth: 2, title: `OBV`, priceScaleId: 'left' });
                s.setData(data);
                config.indicatorSeriesList.push(s);
            }
        } catch (eInd) {
            console.warn(`Error al renderizar indicador en panel ${panelId}:`, ind.name, eInd);
        }
    });

    // 4. Actualizar badge de indicadores en el header de todos los paneles
    actualizarBadgesIndicadoresPaneles();

    // 5. Ajustar rangos
    if (oscChart && config.chart && config.chart.timeScale()) {
        try {
            const range = config.chart.timeScale().getVisibleLogicalRange();
            if (range) oscChart.timeScale().setVisibleLogicalRange(range);
        } catch (e) {}
    }
}

function actualizarBadgesIndicadoresPaneles() {
    const activeNames = indicadoresActivos
        .filter(i => i.visible !== false)
        .map(i => {
            if (i.type === 'EMA') return `EMA(${i.params?.period || 20})`;
            if (i.type === 'SMA') return `SMA(${i.params?.period || 50})`;
            if (i.type === 'SQZMOM') return `SQZ`;
            if (i.type === 'ADX') return `ADX`;
            return i.type;
        });
    const txt = activeNames.length > 0 ? `fx: ${activeNames.join(', ')}` : '';
    [0, 1, 2, 3].forEach(id => {
        const badge = document.getElementById(`p${id}-ind-indicator`);
        if (badge) badge.textContent = txt;
    });
}

function sincronizarIndicadoresEnPanelesSecundarios() {
    actualizarBadgesIndicadoresPaneles();
    [1, 2, 3].forEach(id => {
        const config = panelesSecundarios[id];
        if (config && config.chart && config.data && config.data.length > 0) {
            renderizarIndicadoresEnPanelSecundario(id);
        }
    });
}

function actualizarLeyendaPanelSecundario(panelId, param) {
    const config = panelesSecundarios[panelId];
    if (!config) return;
    const legendEl = document.getElementById(config.legendId);
    if (!legendEl) return;

    let d = null;
    if (param && param.seriesData && param.seriesData.get) {
        d = param.seriesData.get(config.series);
    }
    if (!d && config.data && config.data.length > 0) {
        d = config.data[config.data.length - 1];
    }
    if (!d) {
        legendEl.textContent = `${config.symbol} ${config.interval}`;
        return;
    }

    const open = d.open !== undefined ? d.open : d.value;
    const high = d.high !== undefined ? d.high : d.value;
    const low = d.low !== undefined ? d.low : d.value;
    const close = d.close !== undefined ? d.close : d.value;
    const diff = close - open;
    const isUp = diff >= 0;
    const color = isUp ? '#089981' : '#f23645';

    legendEl.innerHTML = `<span style="font-weight: bold; color: #fff;">${config.symbol}</span> <span style="color:#787b86;">${config.interval}</span> O:<span style="color:${color};">${formatPrice(open)}</span> H:<span style="color:${color};">${formatPrice(high)}</span> L:<span style="color:${color};">${formatPrice(low)}</span> C:<span style="color:${color};">${formatPrice(close)}</span>`;

    // Actualizar leyenda de indicadores del panel si está disponible
    const indLegendEl = document.getElementById(`p${panelId}-ind-legend`);
    if (indLegendEl && param && param.seriesData && config.indicatorSeriesList) {
        let indStrings = [];
        config.indicatorSeriesList.forEach(s => {
            const val = param.seriesData.get(s);
            if (val && val.value !== undefined) {
                const title = s.options ? (s.options().title || '') : '';
                const color = s.options ? (s.options().color || '#787b86') : '#787b86';
                if (title) {
                    indStrings.push(`<span style="color: ${color};">${title}: ${formatPrice(val.value)}</span>`);
                }
            }
        });
        indLegendEl.innerHTML = indStrings.join(' &nbsp; ');
    }
}

function redimensionarPanelesSecundarios() {
    const mainOsc = document.getElementById('oscillator-chart-container');
    const mainOscHeight = (mainOsc && mainOsc.clientHeight > 0) ? mainOsc.clientHeight : 210;

    [1, 2, 3].forEach(id => {
        const config = panelesSecundarios[id];
        if (config) {
            if (config.chart) {
                const container = document.getElementById(config.containerId);
                if (container && container.clientWidth > 0 && container.clientHeight > 0) {
                    config.chart.applyOptions({
                        width: container.clientWidth,
                        height: container.clientHeight
                    });
                }
            }
            if (config.oscChart) {
                const oscContainer = document.getElementById(`p${id}-osc-body`);
                if (oscContainer && oscContainer.style.display !== 'none') {
                    if (mainOsc && oscContainer.style.height !== `${mainOscHeight}px`) {
                        oscContainer.style.height = `${mainOscHeight}px`;
                    }
                    if (oscContainer.clientWidth > 0 && oscContainer.clientHeight > 0) {
                        config.oscChart.applyOptions({
                            width: oscContainer.clientWidth,
                            height: oscContainer.clientHeight
                        });
                    }
                }
            }
        }
    });
}

function generarVelasSinteticasGenericas(sym = 'BTC-USD', count = 200) {
    let basePrice = 100;
    const s = (sym || '').toUpperCase();
    if (s.includes('BTC')) basePrice = 83000;
    else if (s.includes('ETH')) basePrice = 3500;
    else if (s.includes('SOL')) basePrice = 180;
    else if (s.includes('XAU') || s.includes('GOLD')) basePrice = 2650;
    else if (s.includes('NVDA')) basePrice = 135;
    else if (s.includes('AAPL')) basePrice = 230;
    else if (s.includes('TSLA')) basePrice = 220;
    else if (s.includes('SP500') || s.includes('SPY')) basePrice = 5800;
    else if (s.includes('NASDAQ') || s.includes('QQQ')) basePrice = 20500;
    else if (s.includes('EUR')) basePrice = 1.085;

    let now = Math.floor(Date.now() / 1000) - count * 60;
    const candles = [];
    for (let i = 0; i < count; i++) {
        const change = (Math.random() - 0.49) * (basePrice * 0.007);
        const open = basePrice;
        const close = Math.max(0.001, open + change);
        const high = Math.max(open, close) + Math.random() * (basePrice * 0.003);
        const low = Math.max(0.001, Math.min(open, close) - Math.random() * (basePrice * 0.003));
        const volume = Math.floor(Math.random() * 50) + 10;
        candles.push({ time: now + i * 60, open, high, low, close, volume });
        basePrice = close;
    }
    return candles;
}
window.generarVelasSinteticasGenericas = generarVelasSinteticasGenericas;

function inicializarEventosReplayYMultiChart() {
    const btnReplay = document.getElementById('btn-bar-replay');
    if (btnReplay) {
        btnReplay.addEventListener('click', () => {
            activarModoSeleccionReplay();
        });
    }

    const btnCancelCut = document.getElementById('replay-btn-cancel-cut');
    if (btnCancelCut) {
        btnCancelCut.addEventListener('click', () => {
            cancelarSeleccionReplay();
        });
    }

    const btnPlay = document.getElementById('replay-btn-play');
    if (btnPlay) {
        btnPlay.addEventListener('click', () => {
            alternarPlayPauseReplay();
        });
    }

    const btnStep = document.getElementById('replay-btn-step');
    if (btnStep) {
        btnStep.addEventListener('click', () => {
            pausarReplay();
            avanzarVelaReplay();
        });
    }

    const btnJump = document.getElementById('replay-btn-jump-cut');
    if (btnJump) {
        btnJump.addEventListener('click', () => {
            reiniciarReplayAlCorte();
        });
    }

    const speedSelect = document.getElementById('replay-speed-select');
    if (speedSelect) {
        speedSelect.addEventListener('change', () => {
            replaySpeedMs = parseInt(speedSelect.value) || 1000;
            if (replayTimer) {
                reproducirReplay();
            }
        });
    }

    const btnExit = document.getElementById('replay-btn-exit');
    if (btnExit) {
        btnExit.addEventListener('click', () => {
            salirModoReplay();
        });
    }

    const dragHandle = document.querySelector('.replay-drag-handle');
    const replayBar = document.getElementById('replay-control-bar');
    if (dragHandle && replayBar) {
        let isDragging = false;
        let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

        dragHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = replayBar.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            replayBar.style.transform = 'none';
            replayBar.style.left = `${initialLeft}px`;
            replayBar.style.top = `${initialTop}px`;
            replayBar.style.bottom = 'auto';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            replayBar.style.left = `${Math.max(10, Math.min(window.innerWidth - 300, initialLeft + dx))}px`;
            replayBar.style.top = `${Math.max(40, Math.min(window.innerHeight - 60, initialTop + dy))}px`;
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });

        dragHandle.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches[0]) {
                isDragging = true;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                const rect = replayBar.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;
                replayBar.style.transform = 'none';
                replayBar.style.left = `${initialLeft}px`;
                replayBar.style.top = `${initialTop}px`;
                replayBar.style.bottom = 'auto';
            }
        });

        window.addEventListener('touchmove', (e) => {
            if (!isDragging || !e.touches || !e.touches[0]) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            replayBar.style.left = `${Math.max(10, Math.min(window.innerWidth - 260, initialLeft + dx))}px`;
            replayBar.style.top = `${Math.max(40, Math.min(window.innerHeight - 60, initialTop + dy))}px`;
        });

        window.addEventListener('touchend', () => {
            isDragging = false;
        });
    }

    const btnLayout = document.getElementById('btn-chart-layout');
    const layoutMenu = document.getElementById('layout-dropdown-menu');
    if (btnLayout && layoutMenu) {
        btnLayout.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShown = layoutMenu.style.display === 'block';
            layoutMenu.style.display = isShown ? 'none' : 'block';
        });
    }

    document.querySelectorAll('.layout-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const layout = item.getAttribute('data-layout');
            if (layout) {
                setChartLayout(layout);
            }
        });
    });

    document.addEventListener('click', (e) => {
        if (layoutMenu && !layoutMenu.contains(e.target) && e.target !== btnLayout) {
            layoutMenu.style.display = 'none';
        }
    });

    [0, 1, 2, 3].forEach(id => {
        const panel = document.getElementById(`panel-chart-${id}`);
        if (panel) {
            panel.addEventListener('click', () => {
                setActivePanel(id);
            });
        }
    });

    document.querySelectorAll('.panel-tf-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const panelId = parseInt(btn.getAttribute('data-panel'));
            const tf = btn.getAttribute('data-tf');
            if (isNaN(panelId) || !tf) return;

            const parent = btn.parentElement;
            if (parent) {
                parent.querySelectorAll('.panel-tf-btn').forEach(b => b.classList.remove('active'));
            }
            btn.classList.add('active');

            if (panelId === 0) {
                cambiarSimboloYTemporalidad(currentSymbol, tf);
            } else if (panelesSecundarios[panelId]) {
                panelesSecundarios[panelId].interval = tf;
                await cargarDatosPanelSecundario(panelId);
            }
        });
    });

    const sheetBtnReplay = document.getElementById('sheet-btn-replay');
    if (sheetBtnReplay) {
        sheetBtnReplay.addEventListener('click', () => {
            if (typeof cerrarPanelesMoviles === 'function') cerrarPanelesMoviles();
            activarModoSeleccionReplay();
        });
    }

    const sheetBtnLayout = document.getElementById('sheet-btn-layout');
    if (sheetBtnLayout) {
        sheetBtnLayout.addEventListener('click', () => {
            if (typeof cerrarPanelesMoviles === 'function') cerrarPanelesMoviles();
            const layouts = ['1', '2v', '2h', '4'];
            const curIdx = layouts.indexOf(currentChartLayout);
            const nextL = layouts[(curIdx + 1) % layouts.length];
            setChartLayout(nextL);
        });
    }
}

// Exportaciones globales para depuración y tests automatizados
if (typeof window !== 'undefined') {
    window.isReplayMode = isReplayMode;
    window.activarModoSeleccionReplay = activarModoSeleccionReplay;
    window.cancelarSeleccionReplay = cancelarSeleccionReplay;
    window.avanzarVelaReplay = avanzarVelaReplay;
    window.salirModoReplay = salirModoReplay;
    window.reiniciarReplayAlCorte = reiniciarReplayAlCorte;
    window.setChartLayout = setChartLayout;
    window.panelesSecundarios = panelesSecundarios;
    window.inicializarEventosReplayYMultiChart = inicializarEventosReplayYMultiChart;
}

