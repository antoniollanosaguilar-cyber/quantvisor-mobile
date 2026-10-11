/**
 * QuantVisor - Virtual MT5 Execution Engine & Prop Firm Live Sandbox
 * Emula el entorno de ejecución, gestión de órdenes y ciclo de vida de bots MQL5 de MetaTrader 5
 * Compatible con Lightweight Charts v4, Yahoo Finance & Bitget Data Feeds
 */

class MT5VirtualEmulator {
    constructor() {
        this.isRunning = false;
        this.selectedBotId = 'gold_rush';
        this.symbol = 'XAUUSD';
        this.timeframe = '1h';
        this.magicNumber = 884201;

        // Prop Firm Challenge Settings (FTMO / Funding Pips Standard)
        this.challengeConfig = {
            tier: 100000,              // $10,000, $25,000, $50,000, $100,000, $200,000
            dailyLossLimitPct: 5.0,    // 5% max daily drawdown
            maxTotalLossPct: 10.0,     // 10% max total trailing drawdown
            profitTargetPct: 8.0,      // 8% target (Fase 1)
            leverage: 100,             // 1:100 leverage
            riskMode: 'percent',       // 'percent' or 'fixed_lot'
            riskValue: 1.0             // 1% per trade or 1.0 lot
        };

        // Account State
        this.account = {
            initialBalance: 100000,
            balance: 100000,
            equity: 100000,
            margin: 0,
            freeMargin: 100000,
            marginLevel: 0,
            dayStartEquity: 100000,
            peakEquity: 100000,
            lastDayResetTimestamp: Math.floor(Date.now() / 1000),
            floatingPnL: 0,
            status: 'ACTIVE'           // 'ACTIVE', 'WARNING', 'PASSED', 'VIOLATED'
        };

        // Order Book & History
        this.openPositions = [];       // Active positions
        this.closedPositions = [];     // Order history
        this.nextTicket = 104201;
        this.journalLogs = [];

        // Dedicated Chart & Series
        this.chart = null;
        this.candleSeries = null;
        this.priceLines = [];          // Lightweight Charts price lines for open positions
        this.currentCandles = [];
        this.activeTab = 'tab-mt5-positions';

        // Preloaded MT5 Expert Advisors (Bots)
        this.botsCatalog = {
            gold_rush: {
                id: 'gold_rush',
                name: 'Hobbiecode Gold Rush Breakout (XAUUSD)',
                symbol: 'XAUUSD',
                timeframe: '1h',
                magic: 7701,
                description: 'Estrategia auditada de cuentas fondeadas ($48k+ en retiros). Rotura Donchian(51) + Gann(5), orden Buy Stop de 10 barras y salida temporal en 5 velas.',
                params: {
                    donchianPeriod: 51,
                    gannPeriod: 5,
                    atrPeriod: 14,
                    slAtrMult: 1.5,
                    tpAtrMult: 3.0,
                    timeExitBars: 5,
                    useTrailing: true,
                    trailingAtrMult: 1.2
                }
            },
            btc_vcp: {
                id: 'btc_vcp',
                name: 'Bitcoin VCP Squeeze & Expansion (BTC-USD)',
                symbol: 'BTC-USD',
                timeframe: '1h',
                magic: 7702,
                description: 'Compresión extrema de volatilidad BBW (< 0.045) sobre EMA 200 y ruptura asimétrica de Donchian(24) con 1:3 R:R.',
                params: {
                    emaPeriod: 200,
                    bbPeriod: 20,
                    bbMult: 2.0,
                    donchianPeriod: 24,
                    atrPeriod: 14,
                    slAtrMult: 1.25,
                    tpAtrMult: 3.2,
                    useTrailing: true,
                    trailingAtrMult: 1.5
                }
            },
            sqz_momentum: {
                id: 'sqz_momentum',
                name: 'Squeeze Momentum Breakout (Multi-Activo)',
                symbol: 'SOL-USD',
                timeframe: '1h',
                magic: 7703,
                description: 'Detección de compresión Bollinger dentro de Keltner con posterior liberación direccional de momentum.',
                params: {
                    bbLength: 20,
                    bbMult: 2.0,
                    kcLength: 20,
                    kcMult: 1.5,
                    slPct: 2.0,
                    tpPct: 4.5,
                    useTrailing: true,
                    trailingPct: 1.5
                }
            },
            eurusd_vcp: {
                id: 'eurusd_vcp',
                name: 'EURUSD VCP Institutional Breakout (EURUSD)',
                symbol: 'EURUSD',
                timeframe: '1h',
                magic: 7704,
                description: 'Estrategia de microestructura en divisas: contracción Donchian(10)/ATR con ruptura en sesión de Londres/Nueva York.',
                params: {
                    donchianPeriod: 10,
                    atrPeriod: 14,
                    slAtrMult: 1.0,
                    tpAtrMult: 3.0,
                    useTrailing: true,
                    trailingAtrMult: 1.0
                }
            },
            cruce_ema: {
                id: 'cruce_ema',
                name: 'Cruce Tendencial EMA (20/50) + ATR Trailing',
                symbol: 'NASDAQ',
                timeframe: '1h',
                magic: 7705,
                description: 'Cruce de medias exponenciales con filtro macro y trailing stop de volatilidad continua.',
                params: {
                    fastPeriod: 20,
                    slowPeriod: 50,
                    atrPeriod: 14,
                    slAtrMult: 2.0,
                    tpAtrMult: 4.0,
                    useTrailing: true,
                    trailingAtrMult: 1.5
                }
            }
        };

        // Symbol Specs
        this.symbolSpecs = {
            'XAUUSD':   { contractSize: 100, pointVal: 100, spread: 1.2, commPerLot: 5.0, digits: 2 },
            'BTC-USD':  { contractSize: 1,   pointVal: 1,   spread: 4.5, commPerLot: 3.0, digits: 2 },
            'ETH-USD':  { contractSize: 1,   pointVal: 1,   spread: 0.5, commPerLot: 2.0, digits: 2 },
            'SOL-USD':  { contractSize: 1,   pointVal: 1,   spread: 0.1, commPerLot: 1.5, digits: 2 },
            'EURUSD':   { contractSize: 100000, pointVal: 100000, spread: 0.00008, commPerLot: 5.0, digits: 5 },
            'NASDAQ':   { contractSize: 20,  pointVal: 20,  spread: 1.5, commPerLot: 4.0, digits: 2 },
            'SP500':    { contractSize: 50,  pointVal: 50,  spread: 0.4, commPerLot: 4.0, digits: 2 },
            'NVDA':     { contractSize: 100, pointVal: 100, spread: 0.15, commPerLot: 3.0, digits: 2 },
            'AAPL':     { contractSize: 100, pointVal: 100, spread: 0.10, commPerLot: 3.0, digits: 2 },
            'DOGE-USD': { contractSize: 1000, pointVal: 1000, spread: 0.0002, commPerLot: 1.0, digits: 5 }
        };

        this.initDOM();
    }

    initDOM() {
        this.dom = {
            workspace: document.getElementById('mt5-runner-workspace'),
            botSelect: document.getElementById('mt5-bot-select'),
            symbolSelect: document.getElementById('mt5-symbol-select'),
            tierSelect: document.getElementById('mt5-tier-select'),
            riskInput: document.getElementById('mt5-risk-input'),
            btnToggleRun: document.getElementById('btn-mt5-toggle-run'),
            btnPanicCloseAll: document.getElementById('btn-mt5-panic-close'),
            btnResetChallenge: document.getElementById('btn-mt5-reset-challenge'),
            chartContainer: document.getElementById('mt5-chart-container'),
            legend: document.getElementById('mt5-chart-legend'),
            
            // Header Badges
            valBalance: document.getElementById('mt5-val-balance'),
            valEquity: document.getElementById('mt5-val-equity'),
            valFreeMargin: document.getElementById('mt5-val-free-margin'),
            valFloatingPnL: document.getElementById('mt5-val-floating-pnl'),
            badgeStatus: document.getElementById('mt5-badge-status'),

            // Prop Firm Compliance Gauges
            gaugeDailyBar: document.getElementById('mt5-gauge-daily-bar'),
            gaugeDailyLbl: document.getElementById('mt5-gauge-daily-lbl'),
            gaugeTotalBar: document.getElementById('mt5-gauge-total-bar'),
            gaugeTotalLbl: document.getElementById('mt5-gauge-total-lbl'),
            gaugeTargetBar: document.getElementById('mt5-gauge-target-bar'),
            gaugeTargetLbl: document.getElementById('mt5-gauge-target-lbl'),

            // Tabs & Tables
            tabBtns: document.querySelectorAll('.mt5-tab-btn'),
            tabPanes: document.querySelectorAll('.mt5-tab-pane'),
            tablePositions: document.getElementById('mt5-positions-body'),
            tableHistory: document.getElementById('mt5-history-body'),
            journalContainer: document.getElementById('mt5-journal-logs'),
            paramsContainer: document.getElementById('mt5-bot-params-grid'),

            // Splitter
            splitter: document.getElementById('mt5-splitter'),
            panel: document.getElementById('mt5-terminal-panel')
        };

        this.initEventos();
        this.poblarSelectores();
        this.actualizarUI();
        this.renderizarFormularioParametros();
        this.logJournal(`[OnInit] Emulador Virtual MT5 v1.0 inicializado. Listo para Forward-Testing.`);
    }

    initEventos() {
        if (this.dom.botSelect) {
            this.dom.botSelect.addEventListener('change', (e) => {
                this.seleccionarBot(e.target.value);
            });
        }

        if (this.dom.symbolSelect) {
            this.dom.symbolSelect.addEventListener('change', (e) => {
                this.symbol = e.target.value;
                this.currentCandles = [];
                this.cargarVelasYActualizar();
            });
        }

        if (this.dom.tierSelect) {
            this.dom.tierSelect.addEventListener('change', (e) => {
                const tierVal = parseFloat(e.target.value) || 100000;
                this.challengeConfig.tier = tierVal;
                this.reiniciarCuenta(tierVal);
            });
        }

        if (this.dom.riskInput) {
            this.dom.riskInput.addEventListener('change', (e) => {
                this.challengeConfig.riskValue = Math.max(0.1, parseFloat(e.target.value) || 1.0);
            });
        }

        if (this.dom.btnToggleRun) {
            this.dom.btnToggleRun.addEventListener('click', () => {
                this.toggleEjecucionBot();
            });
        }

        if (this.dom.btnPanicCloseAll) {
            this.dom.btnPanicCloseAll.addEventListener('click', () => {
                this.cerrarTodasLasPosiciones('Cierre Manual de Emergencia (Pánico)');
            });
        }

        if (this.dom.btnResetChallenge) {
            this.dom.btnResetChallenge.addEventListener('click', () => {
                if (confirm("¿Estás seguro de reiniciar la cuenta del Challenge de Fondeo a su capital inicial?")) {
                    this.reiniciarCuenta(this.challengeConfig.tier);
                }
            });
        }

        // Tabs del Terminal
        if (this.dom.tabBtns) {
            this.dom.tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const target = btn.getAttribute('data-tab');
                    this.cambiarPestañaTerminal(target);
                });
            });
        }

        // Splitter interactivo del terminal
        if (this.dom.splitter && this.dom.panel) {
            let isDragging = false;
            let startY = 0;
            let startH = 260;

            this.dom.splitter.addEventListener('mousedown', (e) => {
                isDragging = true;
                startY = e.clientY;
                startH = this.dom.panel.clientHeight;
                document.body.style.cursor = 'row-resize';
                document.body.style.userSelect = 'none';
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const delta = startY - e.clientY;
                let newH = startH + delta;
                if (newH < 120) newH = 120;
                if (newH > window.innerHeight * 0.75) newH = window.innerHeight * 0.75;
                this.dom.panel.style.height = `${newH}px`;
                this.resize();
            });

            window.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    this.resize();
                }
            });
        }
    }

    poblarSelectores() {
        if (this.dom.botSelect) {
            this.dom.botSelect.innerHTML = Object.values(this.botsCatalog).map(b => 
                `<option value="${b.id}" ${b.id === this.selectedBotId ? 'selected' : ''}>🤖 ${b.name}</option>`
            ).join('');
        }

        if (this.dom.symbolSelect) {
            const syms = Object.keys(this.symbolSpecs);
            this.dom.symbolSelect.innerHTML = syms.map(s => 
                `<option value="${s}" ${s === this.symbol ? 'selected' : ''}>${s}</option>`
            ).join('');
        }

        if (this.dom.tierSelect) {
            const tiers = [10000, 25000, 50000, 100000, 200000];
            this.dom.tierSelect.innerHTML = tiers.map(t => 
                `<option value="${t}" ${t === this.challengeConfig.tier ? 'selected' : ''}>Cuenta $${t.toLocaleString()} USD</option>`
            ).join('');
        }
    }

    seleccionarBot(botId) {
        const bot = this.botsCatalog[botId];
        if (!bot) return;
        this.selectedBotId = botId;
        this.symbol = bot.symbol;
        this.timeframe = bot.timeframe;
        this.magicNumber = bot.magic;

        if (this.dom.symbolSelect) this.dom.symbolSelect.value = this.symbol;
        this.renderizarFormularioParametros();
        this.currentCandles = [];
        this.cargarVelasYActualizar();
        this.logJournal(`[BotSelected] Cargado bot: '${bot.name}' en ${this.symbol} (${this.timeframe}).`);
    }

    renderizarFormularioParametros() {
        const bot = this.botsCatalog[this.selectedBotId];
        if (!bot || !this.dom.paramsContainer) return;

        let html = '';
        Object.entries(bot.params).forEach(([key, val]) => {
            const isBool = typeof val === 'boolean';
            const isFloat = typeof val === 'number' && !Number.isInteger(val);
            const step = isFloat ? '0.1' : '1';

            html += `
                <div class="mt5-param-item">
                    <label>${this.formatearLabel(key)}:</label>
                    ${isBool 
                        ? `<input type="checkbox" id="mt5-p-${key}" ${val ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer;">`
                        : `<input type="number" id="mt5-p-${key}" value="${val}" step="${step}" style="background:#131722; border:1px solid #2a2e39; color:#fff; padding:4px 8px; border-radius:4px; font-size:11px; width:110px;">`
                    }
                </div>
            `;
        });

        this.dom.paramsContainer.innerHTML = html;

        // Conectar cambios inmediatos
        Object.keys(bot.params).forEach(key => {
            const input = document.getElementById(`mt5-p-${key}`);
            if (input) {
                input.addEventListener('change', (e) => {
                    const isBool = typeof bot.params[key] === 'boolean';
                    bot.params[key] = isBool ? e.target.checked : parseFloat(e.target.value);
                    this.logJournal(`[ParamUpdate] ${key} = ${bot.params[key]}`);
                });
            }
        });
    }

    formatearLabel(key) {
        return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    }

    cambiarPestañaTerminal(tabId) {
        this.activeTab = tabId;
        if (this.dom.tabBtns) {
            this.dom.tabBtns.forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
            });
        }
        if (this.dom.tabPanes) {
            this.dom.tabPanes.forEach(pane => {
                pane.classList.toggle('active', pane.id === tabId);
            });
        }
    }

    // =========================================================================
    // INICIALIZACIÓN DEL GRÁFICO DEDICADO DE MT5
    // =========================================================================
    garantizarChart() {
        const container = document.getElementById('mt5-chart-container');
        if (!container || !window.LightweightCharts) return;

        if (!this.chart) {
            const w = container.clientWidth > 0 ? container.clientWidth : 800;
            const h = container.clientHeight > 0 ? container.clientHeight : 380;

            this.chart = LightweightCharts.createChart(container, {
                width: w,
                height: h,
                layout: {
                    background: { type: 'solid', color: '#131722' },
                    textColor: '#d1d4dc',
                    fontSize: 11,
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif',
                },
                grid: {
                    vertLines: { color: '#1a1e29' },
                    horzLines: { color: '#1a1e29' }
                },
                crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
                rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.1, bottom: 0.2 } },
                timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false, rightOffset: 15 }
            });

            this.candleSeries = this.chart.addCandlestickSeries({
                upColor: '#089981',
                downColor: '#f23645',
                borderVisible: false,
                wickUpColor: '#089981',
                wickDownColor: '#f23645'
            });

            this.chart.subscribeCrosshairMove(param => {
                this.actualizarLeyendaOHLC(param);
            });

            new ResizeObserver(() => this.resize()).observe(container);
        }
    }

    actualizarLeyendaOHLC(param) {
        if (!this.dom.legend) return;
        const curSym = this.symbol;
        const botName = this.botsCatalog[this.selectedBotId]?.name || 'MT5 Bot';
        const statusBadge = this.isRunning ? `<span style="color:#089981; font-weight:bold;">● RUNNING</span>` : `<span style="color:#787b86;">⏸ PAUSED</span>`;

        if (!param || !param.time || !param.seriesData) {
            this.dom.legend.innerHTML = `<span style="font-weight: bold; color: #fff;">${curSym}</span> <span style="color:#5b8cff;">[${botName}]</span> ${statusBadge}`;
            return;
        }

        const d = param.seriesData.get(this.candleSeries);
        if (d) {
            const diff = d.close - d.open;
            const color = diff >= 0 ? '#089981' : '#f23645';
            this.dom.legend.innerHTML = `<span style="font-weight: bold; color: #fff;">${curSym}</span> <span style="color:#5b8cff;">[${botName}]</span> ${statusBadge} O:<span style="color:${color};">${d.open.toFixed(2)}</span> H:<span style="color:${color};">${d.high.toFixed(2)}</span> L:<span style="color:${color};">${d.low.toFixed(2)}</span> C:<span style="color:${color};">${d.close.toFixed(2)}</span>`;
        }
    }

    resize() {
        const container = document.getElementById('mt5-chart-container');
        if (this.chart && container) {
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w > 0 && h > 0) this.chart.applyOptions({ width: w, height: h });
        }
    }

    async cargarVelasYActualizar() {
        this.garantizarChart();
        let candles = this.currentCandles;

        if (!candles || candles.length < 30) {
            const invoke = (window.__TAURI__ && window.__TAURI__.core) ? window.__TAURI__.core.invoke : (window.__TAURI__ ? window.__TAURI__.invoke : null);
            if (invoke) {
                try {
                    const fetched = await invoke('cargar_historial', { simbolo: this.symbol, intervalo: this.timeframe });
                    if (fetched && fetched.length > 0) candles = fetched;
                } catch (e) {}
            }
            if (!candles || candles.length < 30) {
                candles = typeof window.generarVelasSinteticasGenericas === 'function'
                    ? window.generarVelasSinteticasGenericas(this.symbol, 300)
                    : (window.historialVelas || []);
            }
            this.currentCandles = candles;
        }

        if (this.candleSeries && candles.length > 0) {
            this.candleSeries.setData(candles);
            if (this.chart && this.chart.timeScale()) {
                this.chart.timeScale().fitContent();
            }
        }

        this.actualizarLineasPosiciones();
    }

    setCandles(candles) {
        if (!candles || candles.length === 0) return;
        this.garantizarChart();
        this.currentCandles = candles;
        if (this.candleSeries) {
            this.candleSeries.setData(candles);
            if (this.chart && this.chart.timeScale()) {
                this.chart.timeScale().fitContent();
            }
        }
        this.actualizarLineasPosiciones();
    }

    // =========================================================================
    // MOTOR DE EJECUCIÓN MQL5: ON_TICK & FORWARD TESTING EN TIEMPO REAL
    // =========================================================================
    toggleEjecucionBot() {
        this.isRunning = !this.isRunning;
        if (this.isRunning) {
            if (this.dom.btnToggleRun) {
                this.dom.btnToggleRun.innerHTML = '⏸ Pausar Bot';
                this.dom.btnToggleRun.classList.remove('primary');
                this.dom.btnToggleRun.classList.add('secondary');
            }
            this.logJournal(`[BotStarted] Bot activado para ejecución en vivo.`);
            this.evaluarLogicaBot();
        } else {
            if (this.dom.btnToggleRun) {
                this.dom.btnToggleRun.innerHTML = '▶ Iniciar Bot en Vivo';
                this.dom.btnToggleRun.classList.add('primary');
                this.dom.btnToggleRun.classList.remove('secondary');
            }
            this.logJournal(`[BotPaused] Bot pausado.`);
        }
        this.actualizarUI();
    }

    onTick(liveCandle) {
        if (!liveCandle) return;

        // Reset diario de Equidad a las 00:00 GMT (Regla estricta Prop Firm)
        const candleDay = Math.floor(liveCandle.time / 86400);
        const lastDay = Math.floor(this.account.lastDayResetTimestamp / 86400);
        if (candleDay > lastDay) {
            this.account.dayStartEquity = this.account.equity;
            this.account.lastDayResetTimestamp = liveCandle.time;
            this.logJournal(`[DailyReset] Medianoche GMT detectada. Equidad base para pérdida diaria: $${this.account.dayStartEquity.toFixed(2)}`);
        }

        // Actualizar precio de mercado de velas en la serie si estamos en este activo
        if (this.candleSeries && this.currentCandles.length > 0) {
            const last = this.currentCandles[this.currentCandles.length - 1];
            if (last && last.time === liveCandle.time) {
                this.currentCandles[this.currentCandles.length - 1] = liveCandle;
                this.candleSeries.update(liveCandle);
            } else if (last && liveCandle.time > last.time) {
                this.currentCandles.push(liveCandle);
                this.candleSeries.update(liveCandle);
            }
        }

        // 1. Evaluar SL / TP y Trailing Stop de posiciones abiertas
        this.procesarTicksEnPosiciones(liveCandle);

        // 2. Si el bot está activo, evaluar señales de entrada/salida
        if (this.isRunning && this.account.status === 'ACTIVE') {
            this.evaluarLogicaBot();
        }

        // 3. Evaluar reglas de cumplimiento de cuenta fondeada
        this.evaluarReglasPropFirm();

        // 4. Actualizar visuales y terminal
        this.actualizarUI();
    }

    procesarTicksEnPosiciones(candle) {
        const spec = this.symbolSpecs[this.symbol] || { contractSize: 1, pointVal: 1, spread: 1.0, digits: 2 };
        const curPrice = candle.close;
        let floatingSum = 0;

        for (let i = this.openPositions.length - 1; i >= 0; i--) {
            const pos = this.openPositions[i];
            pos.currentPrice = curPrice;

            // Cálculo de PnL en vivo
            const isBuy = pos.type === 'BUY';
            const priceDiff = isBuy ? (curPrice - pos.openPrice) : (pos.openPrice - curPrice);
            pos.profit = (priceDiff * pos.lots * spec.pointVal) - pos.commission;
            pos.profitPct = (pos.profit / this.account.initialBalance) * 100;
            floatingSum += pos.profit;

            // Verificación de Stop Loss (SL)
            if (pos.sl > 0) {
                const hitSL = isBuy ? (candle.low <= pos.sl) : (candle.high >= pos.sl);
                if (hitSL) {
                    this.cerrarPosicion(pos.ticket, pos.sl, 'Stop Loss (SL)');
                    continue;
                }
            }

            // Verificación de Take Profit (TP)
            if (pos.tp > 0) {
                const hitTP = isBuy ? (candle.high >= pos.tp) : (candle.low <= pos.tp);
                if (hitTP) {
                    this.cerrarPosicion(pos.ticket, pos.tp, 'Take Profit (TP)');
                    continue;
                }
            }

            // Trailing Stop dinámico
            const bot = this.botsCatalog[this.selectedBotId];
            if (bot && bot.params.useTrailing && pos.profit > 0) {
                const trailDist = (pos.openPrice * 0.015); // 1.5% o trailing ATR
                if (isBuy) {
                    const newSL = curPrice - trailDist;
                    if (newSL > (pos.sl || 0) && newSL > pos.openPrice) {
                        pos.sl = parseFloat(newSL.toFixed(spec.digits));
                        this.logJournal(`[TrailingStop] Ticket #${pos.ticket} SL ajustado a ${pos.sl}`);
                    }
                } else {
                    const newSL = curPrice + trailDist;
                    if ((pos.sl === 0 || newSL < pos.sl) && newSL < pos.openPrice) {
                        pos.sl = parseFloat(newSL.toFixed(spec.digits));
                        this.logJournal(`[TrailingStop] Ticket #${pos.ticket} SL ajustado a ${pos.sl}`);
                    }
                }
            }
        }

        this.account.floatingPnL = floatingSum;
        this.account.equity = this.account.balance + floatingSum;
        this.account.peakEquity = Math.max(this.account.peakEquity, this.account.equity);
        this.account.freeMargin = this.account.equity - this.account.margin;
        this.account.marginLevel = this.account.margin > 0 ? (this.account.equity / this.account.margin) * 100 : 0;
    }

    evaluarLogicaBot() {
        const candles = this.currentCandles;
        if (!candles || candles.length < 30) return;

        // No abrir más de 2 operaciones simultáneas para proteger la cuenta fondeada
        if (this.openPositions.length >= 2) return;

        const bot = this.botsCatalog[this.selectedBotId];
        if (!bot) return;

        const lastBar = candles[candles.length - 2];
        const curBar = candles[candles.length - 1];
        const curPrice = curBar.close;
        const spec = this.symbolSpecs[this.symbol] || { contractSize: 1, pointVal: 1, spread: 1.0, digits: 2 };

        let signal = null; // 'BUY' o 'SELL'
        let slPrice = 0;
        let tpPrice = 0;

        // 1. Hobbiecode Gold Rush Breakout (XAUUSD H1)
        if (bot.id === 'gold_rush') {
            const period = bot.params.donchianPeriod || 51;
            const lookback = candles.slice(-period - 2, -2);
            if (lookback.length >= period) {
                const maxHigh = Math.max(...lookback.map(c => c.high));
                const minLow = Math.min(...lookback.map(c => c.low));
                const atr = this.calcularATR(candles, 14);

                if (curBar.high >= maxHigh && curBar.close > lastBar.close) {
                    signal = 'BUY';
                    slPrice = curPrice - (atr * (bot.params.slAtrMult || 1.5));
                    tpPrice = curPrice + (atr * (bot.params.tpAtrMult || 3.0));
                }
            }
        }

        // 2. Bitcoin VCP Breakout & Expansion (BTC-USD)
        else if (bot.id === 'btc_vcp') {
            const ema200 = this.calcularEMA(candles, 200);
            const atr = this.calcularATR(candles, 14);
            const period = bot.params.donchianPeriod || 24;
            const lookback = candles.slice(-period - 2, -2);

            if (lookback.length >= period) {
                const maxH = Math.max(...lookback.map(c => c.high));
                if (curPrice > ema200 && curBar.high >= maxH) {
                    signal = 'BUY';
                    slPrice = curPrice - (atr * (bot.params.slAtrMult || 1.25));
                    tpPrice = curPrice + (atr * (bot.params.tpAtrMult || 3.2));
                }
            }
        }

        // 3. Cruce EMA Tendencial
        else if (bot.id === 'cruce_ema') {
            const emaFastPrev = this.calcularEMAPrecisa(candles.slice(0, -1), bot.params.fastPeriod || 20);
            const emaSlowPrev = this.calcularEMAPrecisa(candles.slice(0, -1), bot.params.slowPeriod || 50);
            const emaFastCur = this.calcularEMAPrecisa(candles, bot.params.fastPeriod || 20);
            const emaSlowCur = this.calcularEMAPrecisa(candles, bot.params.slowPeriod || 50);
            const atr = this.calcularATR(candles, 14);

            if (emaFastPrev <= emaSlowPrev && emaFastCur > emaSlowCur) {
                signal = 'BUY';
                slPrice = curPrice - (atr * (bot.params.slAtrMult || 2.0));
                tpPrice = curPrice + (atr * (bot.params.tpAtrMult || 4.0));
            } else if (emaFastPrev >= emaSlowPrev && emaFastCur < emaSlowCur) {
                signal = 'SELL';
                slPrice = curPrice + (atr * (bot.params.slAtrMult || 2.0));
                tpPrice = curPrice - (atr * (bot.params.tpAtrMult || 4.0));
            }
        }

        // Si hay señal válida, ejecutar OrderSend virtual de MT5
        if (signal) {
            const lots = this.calcularLotajeSeguro(curPrice, slPrice);
            this.orderSend(this.symbol, signal, lots, curPrice, slPrice, tpPrice, `[${bot.id}] Signal`);
        }
    }

    calcularLotajeSeguro(entryPrice, slPrice) {
        const spec = this.symbolSpecs[this.symbol] || { contractSize: 1, pointVal: 1, digits: 2 };
        const riskUSD = (this.challengeConfig.riskValue / 100) * this.account.balance;
        const slDist = Math.abs(entryPrice - slPrice);

        if (slDist <= 0) return 0.10;

        let lots = riskUSD / (slDist * spec.pointVal);
        lots = Math.max(0.01, Math.min(20.0, Math.round(lots * 100) / 100));
        return lots;
    }

    // =========================================================================
    // MQL5 API VIRTUAL: OrderSend, PositionClose, OrderModify
    // =========================================================================
    orderSend(symbol, type, lots, price, sl, tp, comment = '') {
        const spec = this.symbolSpecs[symbol] || { contractSize: 1, pointVal: 1, spread: 1.0, digits: 2 };
        const isBuy = type === 'BUY';
        const spreadOffset = isBuy ? (spec.spread * 0.5) : (-spec.spread * 0.5);
        const execPrice = parseFloat((price + spreadOffset).toFixed(spec.digits));

        // Margen requerido: (Lotes * ContractSize * Precio) / Leverage
        const requiredMargin = (lots * spec.contractSize * execPrice) / this.challengeConfig.leverage;

        if (requiredMargin > this.account.freeMargin) {
            this.logJournal(`[OrderSend REJECTED] Margen insuficiente. Requerido: $${requiredMargin.toFixed(2)}, Libre: $${this.account.freeMargin.toFixed(2)}`);
            return null;
        }

        const ticket = this.nextTicket++;
        const commission = lots * (spec.commPerLot || 5.0);

        const position = {
            ticket: ticket,
            time: Math.floor(Date.now() / 1000),
            symbol: symbol,
            type: type,
            lots: lots,
            openPrice: execPrice,
            currentPrice: execPrice,
            sl: parseFloat((sl || 0).toFixed(spec.digits)),
            tp: parseFloat((tp || 0).toFixed(spec.digits)),
            profit: -commission,
            commission: commission,
            swap: 0,
            comment: comment,
            magic: this.magicNumber
        };

        this.openPositions.push(position);
        this.account.margin += requiredMargin;
        this.account.freeMargin = this.account.equity - this.account.margin;

        this.logJournal(`[OrderSend SUCCESS] Ticket #${ticket} ${type} ${lots.toFixed(2)} lots ${symbol} @ ${execPrice.toFixed(spec.digits)} | SL: ${position.sl} TP: ${position.tp}`);
        
        this.actualizarLineasPosiciones();
        this.actualizarUI();
        return ticket;
    }

    cerrarPosicion(ticket, closePrice, exitReason = 'Manual') {
        const idx = this.openPositions.findIndex(p => p.ticket === ticket);
        if (idx === -1) return false;

        const pos = this.openPositions[idx];
        const spec = this.symbolSpecs[pos.symbol] || { contractSize: 1, pointVal: 1, digits: 2 };
        const isBuy = pos.type === 'BUY';
        const finalPrice = closePrice || pos.currentPrice;
        const priceDiff = isBuy ? (finalPrice - pos.openPrice) : (pos.openPrice - finalPrice);
        const netProfit = (priceDiff * pos.lots * spec.pointVal) - pos.commission;

        const closedRecord = {
            ticket: pos.ticket,
            openTime: pos.time,
            closeTime: Math.floor(Date.now() / 1000),
            symbol: pos.symbol,
            type: pos.type,
            lots: pos.lots,
            openPrice: pos.openPrice,
            closePrice: finalPrice,
            commission: pos.commission,
            profit: netProfit,
            reason: exitReason
        };

        this.closedPositions.unshift(closedRecord);
        this.openPositions.splice(idx, 1);

        // Liberar margen y actualizar balance
        const freedMargin = (pos.lots * spec.contractSize * pos.openPrice) / this.challengeConfig.leverage;
        this.account.balance += netProfit;
        this.account.margin = Math.max(0, this.account.margin - freedMargin);
        this.account.equity = this.account.balance + this.openPositions.reduce((acc, p) => acc + p.profit, 0);
        this.account.freeMargin = this.account.equity - this.account.margin;

        this.logJournal(`[OrderClose] Ticket #${ticket} cerrado a ${finalPrice.toFixed(spec.digits)} | PnL: ${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(2)} [${exitReason}]`);

        this.actualizarLineasPosiciones();
        this.actualizarUI();
        return true;
    }

    cerrarTodasLasPosiciones(motivo = 'Pánico') {
        const copy = [...this.openPositions];
        copy.forEach(pos => {
            this.cerrarPosicion(pos.ticket, pos.currentPrice, motivo);
        });
        this.logJournal(`[PanicClose] Todas las posiciones han sido cerradas. Motivo: ${motivo}`);
    }

    actualizarLineasPosiciones() {
        if (!this.candleSeries) return;

        // Limpiar líneas anteriores
        this.priceLines.forEach(l => {
            try { this.candleSeries.removePriceLine(l); } catch (e) {}
        });
        this.priceLines = [];

        // Dibujar líneas para cada posición abierta
        this.openPositions.forEach(pos => {
            const isBuy = pos.type === 'BUY';
            const color = isBuy ? '#089981' : '#f23645';

            // 1. Línea de Entrada
            const entryLine = this.candleSeries.createPriceLine({
                price: pos.openPrice,
                color: color,
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Solid,
                axisLabelVisible: true,
                title: `${pos.type} #${pos.ticket} (${pos.lots} lots)`
            });
            this.priceLines.push(entryLine);

            // 2. Línea de Stop Loss
            if (pos.sl > 0) {
                const slLine = this.candleSeries.createPriceLine({
                    price: pos.sl,
                    color: '#f23645',
                    lineWidth: 1,
                    lineStyle: LightweightCharts.LineStyle.Dashed,
                    axisLabelVisible: true,
                    title: `SL #${pos.ticket}`
                });
                this.priceLines.push(slLine);
            }

            // 3. Línea de Take Profit
            if (pos.tp > 0) {
                const tpLine = this.candleSeries.createPriceLine({
                    price: pos.tp,
                    color: '#089981',
                    lineWidth: 1,
                    lineStyle: LightweightCharts.LineStyle.Dashed,
                    axisLabelVisible: true,
                    title: `TP #${pos.ticket}`
                });
                this.priceLines.push(tpLine);
            }
        });
    }

    // =========================================================================
    // PROP FIRM COMPLIANCE GUARDIAN (FTMO / FUNDING PIPS RULES)
    // =========================================================================
    evaluarReglasPropFirm() {
        const initial = this.account.initialBalance;
        const dayStart = this.account.dayStartEquity;
        const currentEquity = this.account.equity;

        // 1. Pérdida Diaria Máxima (5.0%)
        const dailyLossUSD = Math.max(0, dayStart - currentEquity);
        const dailyLossPct = (dailyLossUSD / dayStart) * 100;
        const maxDailyUSD = (this.challengeConfig.dailyLossLimitPct / 100) * dayStart;

        // 2. Pérdida Total Máxima (10.0%)
        const totalLossUSD = Math.max(0, initial - currentEquity);
        const totalLossPct = (totalLossUSD / initial) * 100;
        const maxTotalUSD = (this.challengeConfig.maxTotalLossPct / 100) * initial;

        // 3. Profit Target (8.0%)
        const profitUSD = Math.max(0, currentEquity - initial);
        const profitPct = (profitUSD / initial) * 100;
        const targetUSD = (this.challengeConfig.profitTargetPct / 100) * initial;

        // Evaluar violaciones o aprobaciones
        if (dailyLossPct >= this.challengeConfig.dailyLossLimitPct) {
            this.account.status = 'VIOLATED';
            this.isRunning = false;
            this.cerrarTodasLasPosiciones('Prop Firm Rule: Pérdida Diaria Superada (5%)');
            this.logJournal(`🚨 [ACCOUNT VIOLATED] Has alcanzado el límite de pérdida diaria (${dailyLossPct.toFixed(2)}% >= 5%). Challenge Fallido.`);
        } else if (totalLossPct >= this.challengeConfig.maxTotalLossPct) {
            this.account.status = 'VIOLATED';
            this.isRunning = false;
            this.cerrarTodasLasPosiciones('Prop Firm Rule: Max Drawdown Total Superado (10%)');
            this.logJournal(`🚨 [ACCOUNT VIOLATED] Has alcanzado el Drawdown Máximo Total (${totalLossPct.toFixed(2)}% >= 10%). Challenge Fallido.`);
        } else if (profitPct >= this.challengeConfig.profitTargetPct && this.account.status !== 'PASSED') {
            this.account.status = 'PASSED';
            this.logJournal(`🏆 [CHALLENGE PASSED!] ¡Felicidades! Has alcanzado el objetivo de ganancia del ${profitPct.toFixed(2)}%. Fase 1 Aprobada.`);
        } else if (dailyLossPct >= 3.8 || totalLossPct >= 8.0) {
            this.account.status = 'WARNING';
        } else {
            this.account.status = 'ACTIVE';
        }

        // Actualizar Medidores Visuales
        if (this.dom.gaugeDailyBar) {
            const pctFill = Math.min(100, (dailyLossUSD / maxDailyUSD) * 100);
            this.dom.gaugeDailyBar.style.width = `${pctFill}%`;
            this.dom.gaugeDailyBar.style.backgroundColor = pctFill > 80 ? '#f23645' : (pctFill > 50 ? '#ff9800' : '#089981');
        }
        if (this.dom.gaugeDailyLbl) {
            this.dom.gaugeDailyLbl.innerText = `-$${dailyLossUSD.toFixed(0)} / -$${maxDailyUSD.toFixed(0)} (${dailyLossPct.toFixed(1)}% / 5%)`;
        }

        if (this.dom.gaugeTotalBar) {
            const pctFill = Math.min(100, (totalLossUSD / maxTotalUSD) * 100);
            this.dom.gaugeTotalBar.style.width = `${pctFill}%`;
            this.dom.gaugeTotalBar.style.backgroundColor = pctFill > 80 ? '#f23645' : (pctFill > 50 ? '#ff9800' : '#089981');
        }
        if (this.dom.gaugeTotalLbl) {
            this.dom.gaugeTotalLbl.innerText = `-$${totalLossUSD.toFixed(0)} / -$${maxTotalUSD.toFixed(0)} (${totalLossPct.toFixed(1)}% / 10%)`;
        }

        if (this.dom.gaugeTargetBar) {
            const pctFill = Math.min(100, (profitUSD / targetUSD) * 100);
            this.dom.gaugeTargetBar.style.width = `${pctFill}%`;
        }
        if (this.dom.gaugeTargetLbl) {
            this.dom.gaugeTargetLbl.innerText = `+$${profitUSD.toFixed(0)} / +$${targetUSD.toFixed(0)} (${profitPct.toFixed(1)}% / 8%)`;
        }
    }

    reiniciarCuenta(monto = 100000) {
        this.openPositions = [];
        this.closedPositions = [];
        this.account.initialBalance = monto;
        this.account.balance = monto;
        this.account.equity = monto;
        this.account.margin = 0;
        this.account.freeMargin = monto;
        this.account.marginLevel = 0;
        this.account.dayStartEquity = monto;
        this.account.peakEquity = monto;
        this.account.floatingPnL = 0;
        this.account.status = 'ACTIVE';
        this.isRunning = false;

        if (this.dom.btnToggleRun) {
            this.dom.btnToggleRun.innerHTML = '▶ Iniciar Bot en Vivo';
            this.dom.btnToggleRun.classList.add('primary');
            this.dom.btnToggleRun.classList.remove('secondary');
        }

        this.logJournal(`[ChallengeReset] Cuenta reiniciada con capital de $${monto.toLocaleString()} USD.`);
        this.actualizarLineasPosiciones();
        this.evaluarReglasPropFirm();
        this.actualizarUI();
    }

    // =========================================================================
    // ACTUALIZACIÓN DE INTERFAZ & TABLAS DE MT5
    // =========================================================================
    actualizarUI() {
        const acc = this.account;
        if (this.dom.valBalance) this.dom.valBalance.innerText = `$${acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (this.dom.valEquity) this.dom.valEquity.innerText = `$${acc.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (this.dom.valFreeMargin) this.dom.valFreeMargin.innerText = `$${acc.freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        if (this.dom.valFloatingPnL) {
            const pnl = acc.floatingPnL;
            this.dom.valFloatingPnL.innerText = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
            this.dom.valFloatingPnL.className = `mt5-stat-val ${pnl >= 0 ? 'pnl-pos' : 'pnl-neg'}`;
        }

        if (this.dom.badgeStatus) {
            if (acc.status === 'ACTIVE') {
                this.dom.badgeStatus.innerText = '🟢 ACTIVA (CUMPLIENDO REGLAS)';
                this.dom.badgeStatus.className = 'mt5-badge-status status-active';
            } else if (acc.status === 'WARNING') {
                this.dom.badgeStatus.innerText = '⚠️ ALERTA DE RIESGO';
                this.dom.badgeStatus.className = 'mt5-badge-status status-warning';
            } else if (acc.status === 'PASSED') {
                this.dom.badgeStatus.innerText = '🏆 CHALLENGE APROBADO';
                this.dom.badgeStatus.className = 'mt5-badge-status status-passed';
            } else if (acc.status === 'VIOLATED') {
                this.dom.badgeStatus.innerText = '❌ CUENTA REPROBADA';
                this.dom.badgeStatus.className = 'mt5-badge-status status-violated';
            }
        }

        this.renderizarTablaPosiciones();
        this.renderizarTablaHistorial();
    }

    renderizarTablaPosiciones() {
        if (!this.dom.tablePositions) return;
        if (this.openPositions.length === 0) {
            this.dom.tablePositions.innerHTML = `
                <tr><td colspan="12" style="text-align:center; padding:24px; color:#787b86;">
                    Sin órdenes abiertas en el mercado. ${this.isRunning ? 'Bot en espera de señal...' : 'Pulse "▶ Iniciar Bot en Vivo" para comenzar.'}
                </td></tr>
            `;
            return;
        }

        this.dom.tablePositions.innerHTML = this.openPositions.map(p => {
            const isBuy = p.type === 'BUY';
            const pnlCls = p.profit >= 0 ? 'pnl-pos' : 'pnl-neg';
            return `
                <tr>
                    <td style="font-family:monospace; font-weight:bold;">#${p.ticket}</td>
                    <td style="color:#787b86;">${new Date(p.time * 1000).toLocaleTimeString()}</td>
                    <td><span class="mt5-tag ${isBuy ? 'buy' : 'sell'}">${p.type}</span></td>
                    <td style="font-weight:bold;">${p.lots.toFixed(2)}</td>
                    <td style="font-weight:bold;">${p.symbol}</td>
                    <td>${p.openPrice.toFixed(2)}</td>
                    <td style="color:#f23645;">${p.sl > 0 ? p.sl.toFixed(2) : '--'}</td>
                    <td style="color:#089981;">${p.tp > 0 ? p.tp.toFixed(2) : '--'}</td>
                    <td>${p.currentPrice.toFixed(2)}</td>
                    <td style="color:#787b86;">-$${p.commission.toFixed(2)}</td>
                    <td class="${pnlCls}" style="font-weight:bold;">${p.profit >= 0 ? '+' : ''}$${p.profit.toFixed(2)}</td>
                    <td>
                        <button class="mt5-btn-close" onclick="window.MT5Emulator.cerrarPosicion(${p.ticket}, null, 'Cierre Manual')">✕ Cerrar</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    renderizarTablaHistorial() {
        if (!this.dom.tableHistory) return;
        if (this.closedPositions.length === 0) {
            this.dom.tableHistory.innerHTML = `
                <tr><td colspan="10" style="text-align:center; padding:24px; color:#787b86;">
                    Sin historial de operaciones en esta sesión.
                </td></tr>
            `;
            return;
        }

        this.dom.tableHistory.innerHTML = this.closedPositions.map(p => {
            const isBuy = p.type === 'BUY';
            const pnlCls = p.profit >= 0 ? 'pnl-pos' : 'pnl-neg';
            return `
                <tr>
                    <td style="font-family:monospace;">#${p.ticket}</td>
                    <td style="color:#787b86;">${new Date(p.closeTime * 1000).toLocaleTimeString()}</td>
                    <td><span class="mt5-tag ${isBuy ? 'buy' : 'sell'}">${p.type}</span></td>
                    <td>${p.lots.toFixed(2)}</td>
                    <td>${p.symbol}</td>
                    <td>${p.openPrice.toFixed(2)}</td>
                    <td>${p.closePrice.toFixed(2)}</td>
                    <td style="color:#787b86;">-$${p.commission.toFixed(2)}</td>
                    <td class="${pnlCls}" style="font-weight:bold;">${p.profit >= 0 ? '+' : ''}$${p.profit.toFixed(2)}</td>
                    <td style="color:#787b86; font-size:10px;">${p.reason}</td>
                </tr>
            `;
        }).join('');
    }

    logJournal(msg) {
        const timeStr = new Date().toLocaleTimeString();
        this.journalLogs.unshift({ time: timeStr, msg });
        if (this.journalLogs.length > 200) this.journalLogs.pop();

        if (this.dom.journalContainer) {
            this.dom.journalContainer.innerHTML = this.journalLogs.map(l => 
                `<div class="mt5-journal-entry"><span class="mt5-log-time">${l.time}</span> <span class="mt5-log-msg">${l.msg}</span></div>`
            ).join('');
        }
    }

    // =========================================================================
    // MATEMÁTICAS CUANTITATIVAS AUXILIARES
    // =========================================================================
    calcularATR(candles, period = 14) {
        if (!candles || candles.length < period + 1) return 10.0;
        let sum = 0;
        for (let i = candles.length - period; i < candles.length; i++) {
            const c = candles[i];
            const prev = candles[i - 1];
            const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
            sum += tr;
        }
        return sum / period;
    }

    calcularEMA(candles, period = 200) {
        if (!candles || candles.length < period) return candles[candles.length - 1]?.close || 1;
        const k = 2 / (period + 1);
        let ema = candles[0].close;
        for (let i = 1; i < candles.length; i++) {
            ema = (candles[i].close * k) + (ema * (1 - k));
        }
        return ema;
    }

    calcularEMAPrecisa(candles, period) {
        return this.calcularEMA(candles, period);
    }
}

// Instanciar globalmente
document.addEventListener('DOMContentLoaded', () => {
    window.MT5Emulator = new MT5VirtualEmulator();
});
