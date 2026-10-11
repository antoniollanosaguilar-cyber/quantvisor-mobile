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
            riskMode: 'PCT',           // 'PCT' (Porcentaje %) o 'LOTS' (Lotes Fijos)
            riskValue: 1.0             // 1.0% o 0.10 lotes según el modo
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

        // Historial de Equidad para la Curva de Rendimiento
        this.equityHistory = [{
            time: Math.floor(Date.now() / 1000),
            balance: 100000,
            equity: 100000
        }];

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
            tfSelect: document.getElementById('mt5-tf-select'),
            tierSelect: document.getElementById('mt5-tier-select'),
            riskModeSelect: document.getElementById('mt5-risk-mode'),
            riskInput: document.getElementById('mt5-risk-input'),
            btnToggleRun: document.getElementById('btn-mt5-toggle-run'),
            btnPanicCloseAll: document.getElementById('btn-mt5-panic-close'),
            btnResetChallenge: document.getElementById('btn-mt5-reset-challenge'),
            btnManualBuy: document.getElementById('btn-mt5-manual-buy'),
            btnManualSell: document.getElementById('btn-mt5-manual-sell'),
            btnImportBot: document.getElementById('btn-mt5-import-bot'),
            botFileInput: document.getElementById('mt5-bot-file-input'),
            modalImportBot: document.getElementById('mt5-bot-import-modal'),
            btnCloseImportBot: document.getElementById('btn-close-mt5-import-modal'),
            btnCancelImportBot: document.getElementById('btn-cancel-mt5-import'),
            btnApplyImportBot: document.getElementById('btn-apply-mt5-import'),
            editorImportBot: document.getElementById('mt5-modal-bot-editor'),
            modalBotFileInput: document.getElementById('mt5-modal-bot-file'),
            equityCanvas: document.getElementById('mt5-equity-chart'),
            equitySummary: document.getElementById('mt5-equity-stats-summary'),

            // KPIs
            statTrades: document.getElementById('mt5-stat-trades'),
            statWinrate: document.getElementById('mt5-stat-winrate'),
            statPF: document.getElementById('mt5-stat-pf'),
            statNetPnL: document.getElementById('mt5-stat-netpnl'),
            statMaxDD: document.getElementById('mt5-stat-maxdd'),
            statAvgWin: document.getElementById('mt5-stat-avgwin'),
            statAvgLoss: document.getElementById('mt5-stat-avgloss'),
            statRR: document.getElementById('mt5-stat-rr'),

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

        this.cargarBotsCustom();
        this.cargarEstadoPersistente();
        this.initEventos();
        this.poblarSelectores();
        this.actualizarUI();
        this.renderizarFormularioParametros();
        this.logJournal(`[OnInit] Emulador Virtual MT5 v2.0 inicializado. Listo para Forward-Testing & Prop Firm Sandbox.`);
    }

    cargarBotsCustom() {
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem('quantvisor_custom_mt5_bots');
                if (raw) {
                    const custom = JSON.parse(raw);
                    if (custom && typeof custom === 'object') {
                        Object.values(custom).forEach(bot => {
                            if (bot && bot.id) {
                                this.botsCatalog[bot.id] = bot;
                            }
                        });
                    }
                }
            }
        } catch (e) {
            console.warn('Error cargando bots custom de localStorage:', e);
        }
    }

    guardarBotsCustom() {
        try {
            if (typeof localStorage !== 'undefined') {
                const customBots = {};
                const defaultIds = ['gold_rush', 'btc_vcp', 'sqz_momentum', 'eurusd_vcp', 'cruce_ema'];
                Object.keys(this.botsCatalog).forEach(k => {
                    if (!defaultIds.includes(k)) {
                        customBots[k] = this.botsCatalog[k];
                    }
                });
                localStorage.setItem('quantvisor_custom_mt5_bots', JSON.stringify(customBots));
            }
        } catch (e) {
            console.warn('Error guardando bots custom:', e);
        }
    }

    importarBotDesdeEditor() {
        if (!this.dom.editorImportBot) return;
        try {
            const text = this.dom.editorImportBot.value.trim();
            if (!text) {
                alert('Por favor ingrese la definición en JSON del bot.');
                return;
            }
            const bot = JSON.parse(text);
            if (!bot.name || !bot.params) {
                alert('La configuración del bot debe contener al menos "name" y "params".');
                return;
            }

            if (!bot.id) {
                bot.id = 'bot_' + Date.now();
            }
            if (!bot.symbol) bot.symbol = this.symbol || 'BTC-USD';
            if (!bot.timeframe) bot.timeframe = this.timeframe || '1h';
            if (!bot.magic) bot.magic = Math.floor(1000 + Math.random() * 9000);
            if (!bot.description) bot.description = 'Bot MT5 importado por el usuario.';

            this.botsCatalog[bot.id] = bot;
            this.guardarBotsCustom();
            this.poblarSelectores();
            this.seleccionarBot(bot.id);

            if (this.dom.modalImportBot) {
                this.dom.modalImportBot.style.display = 'none';
            }

            this.logJournal(`[BotImported] Bot '${bot.name}' importado con éxito e instalado en el catálogo.`);
            alert(`¡Bot "${bot.name}" importado e instalado exitosamente!`);
        } catch (err) {
            alert('Error al parsear el JSON del bot: ' + err.message);
        }
    }

    cargarEstadoPersistente() {
        try {
            if (typeof localStorage === 'undefined') return;
            const raw = localStorage.getItem('quantvisor_mt5_state');
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (saved && saved.account) {
                this.account = Object.assign(this.account, saved.account);
                if (Array.isArray(saved.openPositions)) this.openPositions = saved.openPositions;
                if (Array.isArray(saved.closedPositions)) this.closedPositions = saved.closedPositions;
                if (Array.isArray(saved.equityHistory) && saved.equityHistory.length > 0) {
                    this.equityHistory = saved.equityHistory;
                }
                if (saved.challengeConfig) {
                    this.challengeConfig = Object.assign(this.challengeConfig, saved.challengeConfig);
                    if (this.dom.riskModeSelect) this.dom.riskModeSelect.value = this.challengeConfig.riskMode || 'PCT';
                    if (this.dom.riskInput) this.dom.riskInput.value = this.challengeConfig.riskValue || 1.0;
                }
                if (saved.symbol) this.symbol = saved.symbol;
                if (saved.timeframe) {
                    this.timeframe = saved.timeframe;
                    if (this.dom.tfSelect) this.dom.tfSelect.value = this.timeframe;
                }
                if (saved.selectedBotId && this.botsCatalog[saved.selectedBotId]) {
                    this.selectedBotId = saved.selectedBotId;
                }
            }
        } catch (e) {
            console.warn('Error cargando estado persistente MT5:', e);
        }
    }

    guardarEstadoPersistente() {
        try {
            if (typeof localStorage === 'undefined') return;
            const state = {
                account: this.account,
                openPositions: this.openPositions,
                closedPositions: this.closedPositions.slice(0, 50),
                equityHistory: this.equityHistory.slice(-500),
                challengeConfig: this.challengeConfig,
                symbol: this.symbol,
                timeframe: this.timeframe,
                selectedBotId: this.selectedBotId
            };
            localStorage.setItem('quantvisor_mt5_state', JSON.stringify(state));
        } catch (e) {}
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
                this.logJournal(`[SymbolChanged] Símbolo activo cambiado a ${this.symbol}.`);
            });
        }

        if (this.dom.tfSelect) {
            this.dom.tfSelect.addEventListener('change', (e) => {
                this.timeframe = e.target.value;
                this.currentCandles = [];
                this.cargarVelasYActualizar();
                this.logJournal(`[TimeframeChanged] Temporalidad cambiada a ${this.timeframe}.`);
            });
        }

        if (this.dom.tierSelect) {
            this.dom.tierSelect.addEventListener('change', (e) => {
                const tierVal = parseFloat(e.target.value) || 100000;
                this.challengeConfig.tier = tierVal;
                this.reiniciarCuenta(tierVal);
            });
        }

        if (this.dom.riskModeSelect) {
            this.dom.riskModeSelect.addEventListener('change', (e) => {
                this.challengeConfig.riskMode = e.target.value;
                if (this.dom.riskInput) {
                    if (this.challengeConfig.riskMode === 'LOTS') {
                        this.dom.riskInput.step = '0.01';
                        this.dom.riskInput.min = '0.01';
                        this.dom.riskInput.value = '0.10';
                        this.challengeConfig.riskValue = 0.10;
                    } else {
                        this.dom.riskInput.step = '0.1';
                        this.dom.riskInput.min = '0.1';
                        this.dom.riskInput.value = '1.0';
                        this.challengeConfig.riskValue = 1.0;
                    }
                }
                this.logJournal(`[RiskMode] Modo de dimensionamiento: ${this.challengeConfig.riskMode === 'LOTS' ? 'Lotes Fijos' : 'Porcentaje de Riesgo (%)'}.`);
            });
        }

        if (this.dom.riskInput) {
            this.dom.riskInput.addEventListener('change', (e) => {
                const isLots = this.challengeConfig.riskMode === 'LOTS';
                const minVal = isLots ? 0.01 : 0.1;
                this.challengeConfig.riskValue = Math.max(minVal, parseFloat(e.target.value) || (isLots ? 0.10 : 1.0));
                this.logJournal(`[RiskUpdate] Valor de riesgo fijado a: ${this.challengeConfig.riskValue}${isLots ? ' Lotes' : '%'}`);
            });
        }

        // Trading Manual Rápido (Discretionary Execution en Prop Sandbox)
        if (this.dom.btnManualBuy) {
            this.dom.btnManualBuy.addEventListener('click', () => {
                this.ejecutarOrdenManual('BUY');
            });
        }
        if (this.dom.btnManualSell) {
            this.dom.btnManualSell.addEventListener('click', () => {
                this.ejecutarOrdenManual('SELL');
            });
        }

        // Modal de Carga de Bots MT5
        if (this.dom.btnImportBot && this.dom.modalImportBot) {
            this.dom.btnImportBot.addEventListener('click', () => {
                this.dom.modalImportBot.style.display = 'flex';
            });
        }
        if (this.dom.botFileInput) {
            this.dom.botFileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    if (this.dom.editorImportBot) this.dom.editorImportBot.value = evt.target.result;
                    if (this.dom.modalImportBot) this.dom.modalImportBot.style.display = 'flex';
                };
                reader.readAsText(file);
            });
        }
        if (this.dom.btnCloseImportBot && this.dom.modalImportBot) {
            this.dom.btnCloseImportBot.addEventListener('click', () => {
                this.dom.modalImportBot.style.display = 'none';
            });
        }
        if (this.dom.btnCancelImportBot && this.dom.modalImportBot) {
            this.dom.btnCancelImportBot.addEventListener('click', () => {
                this.dom.modalImportBot.style.display = 'none';
            });
        }
        if (this.dom.modalBotFileInput && this.dom.editorImportBot) {
            this.dom.modalBotFileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    this.dom.editorImportBot.value = evt.target.result;
                };
                reader.readAsText(file);
            });
        }
        if (this.dom.btnApplyImportBot && this.dom.editorImportBot) {
            this.dom.btnApplyImportBot.addEventListener('click', () => {
                this.importarBotDesdeEditor();
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

        if (this.dom.tfSelect) {
            this.dom.tfSelect.value = this.timeframe || '1h';
        }

        if (this.dom.tierSelect) {
            const tiers = [10000, 25000, 50000, 100000, 200000];
            this.dom.tierSelect.innerHTML = tiers.map(t => 
                `<option value="${t}" ${t === this.challengeConfig.tier ? 'selected' : ''}>Cuenta $${t.toLocaleString()} USD</option>`
            ).join('');
        }

        if (this.dom.riskModeSelect) {
            this.dom.riskModeSelect.value = this.challengeConfig.riskMode || 'PCT';
        }

        if (this.dom.riskInput) {
            this.dom.riskInput.value = this.challengeConfig.riskValue || (this.challengeConfig.riskMode === 'LOTS' ? 0.10 : 1.0);
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
        if (this.dom.tfSelect) this.dom.tfSelect.value = this.timeframe;
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
        if (tabId === 'mt5-tab-equity') {
            this.renderizarCurvaEquidad();
        } else if (tabId === 'mt5-tab-stats') {
            this.renderizarEstadisticas();
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
        if (this.activeTab === 'mt5-tab-equity') {
            this.renderizarCurvaEquidad();
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
            if (!candles || candles.length < 30) {
                candles = this.generarVelasFallback(this.symbol, 300);
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

        // Registrar punto en la curva de capital si hay operaciones activas
        if (this.openPositions.length > 0) {
            const lastPoint = this.equityHistory[this.equityHistory.length - 1];
            const nowSec = Math.floor(Date.now() / 1000);
            if (!lastPoint || Math.abs(lastPoint.equity - this.account.equity) >= 1 || (nowSec - lastPoint.time >= 5)) {
                this.equityHistory.push({
                    time: nowSec,
                    balance: this.account.balance,
                    equity: this.account.equity
                });
                if (this.equityHistory.length > 1000) this.equityHistory.shift();
            }
        }
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

        let signal = null; // 'BUY' o 'SELL'
        let slPrice = 0;
        let tpPrice = 0;

        const stratType = bot.strategyType || bot.id;

        // 1. Donchian Breakout (Gold Rush, EURUSD VCP o Custom)
        if (stratType === 'donchian_breakout' || bot.id === 'gold_rush' || bot.id === 'eurusd_vcp') {
            const period = bot.params.donchianPeriod || (bot.id === 'eurusd_vcp' ? 10 : 51);
            const lookback = candles.slice(-period - 2, -2);
            if (lookback.length >= period) {
                const maxHigh = Math.max(...lookback.map(c => c.high));
                const minLow = Math.min(...lookback.map(c => c.low));
                const atr = this.calcularATR(candles, bot.params.atrPeriod || 14);
                const slMult = bot.params.slAtrMult || 1.5;
                const tpMult = bot.params.tpAtrMult || 3.0;

                if (curBar.high >= maxHigh && curBar.close > lastBar.close) {
                    signal = 'BUY';
                    slPrice = curPrice - (atr * slMult);
                    tpPrice = curPrice + (atr * tpMult);
                } else if (curBar.low <= minLow && curBar.close < lastBar.close) {
                    signal = 'SELL';
                    slPrice = curPrice + (atr * slMult);
                    tpPrice = curPrice - (atr * tpMult);
                }
            }
        }

        // 2. Bitcoin VCP Breakout & Expansion (BTC-USD o VCP Squeeze)
        else if (stratType === 'vcp_squeeze' || bot.id === 'btc_vcp') {
            const emaPeriod = bot.params.emaPeriod || 200;
            const emaVal = this.calcularEMA(candles, emaPeriod);
            const atr = this.calcularATR(candles, bot.params.atrPeriod || 14);
            const period = bot.params.donchianPeriod || 24;
            const lookback = candles.slice(-period - 2, -2);

            if (lookback.length >= period) {
                const maxH = Math.max(...lookback.map(c => c.high));
                const minL = Math.min(...lookback.map(c => c.low));
                const slMult = bot.params.slAtrMult || 1.25;
                const tpMult = bot.params.tpAtrMult || 3.2;

                if (curPrice > emaVal && curBar.high >= maxH) {
                    signal = 'BUY';
                    slPrice = curPrice - (atr * slMult);
                    tpPrice = curPrice + (atr * tpMult);
                } else if (curPrice < emaVal && curBar.low <= minL) {
                    signal = 'SELL';
                    slPrice = curPrice + (atr * slMult);
                    tpPrice = curPrice - (atr * tpMult);
                }
            }
        }

        // 3. Cruce EMA Tendencial
        else if (stratType === 'ema_cross' || bot.id === 'cruce_ema') {
            const fastP = bot.params.fastPeriod || 20;
            const slowP = bot.params.slowPeriod || 50;
            const emaFastPrev = this.calcularEMAPrecisa(candles.slice(0, -1), fastP);
            const emaSlowPrev = this.calcularEMAPrecisa(candles.slice(0, -1), slowP);
            const emaFastCur = this.calcularEMAPrecisa(candles, fastP);
            const emaSlowCur = this.calcularEMAPrecisa(candles, slowP);
            const atr = this.calcularATR(candles, bot.params.atrPeriod || 14);
            const slMult = bot.params.slAtrMult || 2.0;
            const tpMult = bot.params.tpAtrMult || 4.0;

            if (emaFastPrev <= emaSlowPrev && emaFastCur > emaSlowCur) {
                signal = 'BUY';
                slPrice = curPrice - (atr * slMult);
                tpPrice = curPrice + (atr * tpMult);
            } else if (emaFastPrev >= emaSlowPrev && emaFastCur < emaSlowCur) {
                signal = 'SELL';
                slPrice = curPrice + (atr * slMult);
                tpPrice = curPrice - (atr * tpMult);
            }
        }

        // 4. Squeeze Momentum Breakout
        else if (stratType === 'sqz_momentum' || bot.id === 'sqz_momentum') {
            const len = bot.params.bbLength || 20;
            const atr = this.calcularATR(candles, 14);
            const ema = this.calcularEMA(candles, len);
            const slPct = (bot.params.slPct || 2.0) / 100;
            const tpPct = (bot.params.tpPct || 4.5) / 100;

            if (curBar.close > lastBar.high && curBar.close > ema) {
                signal = 'BUY';
                slPrice = curPrice * (1 - slPct);
                tpPrice = curPrice * (1 + tpPct);
            } else if (curBar.close < lastBar.low && curBar.close < ema) {
                signal = 'SELL';
                slPrice = curPrice * (1 + slPct);
                tpPrice = curPrice * (1 - tpPct);
            }
        }

        // 5. Fallback genérico para bot personalizado
        else {
            const atr = this.calcularATR(candles, 14);
            const period = bot.params.donchianPeriod || bot.params.period || 20;
            const lookback = candles.slice(-period - 2, -2);
            if (lookback.length >= period) {
                const maxHigh = Math.max(...lookback.map(c => c.high));
                const minLow = Math.min(...lookback.map(c => c.low));
                if (curBar.close > maxHigh) {
                    signal = 'BUY';
                    slPrice = curPrice - (atr * 1.5);
                    tpPrice = curPrice + (atr * 3.0);
                } else if (curBar.close < minLow) {
                    signal = 'SELL';
                    slPrice = curPrice + (atr * 1.5);
                    tpPrice = curPrice - (atr * 3.0);
                }
            }
        }

        // Si hay señal válida, ejecutar OrderSend virtual de MT5
        if (signal) {
            const lots = this.calcularLotajeSeguro(curPrice, slPrice);
            this.orderSend(this.symbol, signal, lots, curPrice, slPrice, tpPrice, `[${bot.name || bot.id}] Signal`);
        }
    }

    calcularLotajeSeguro(entryPrice, slPrice) {
        const spec = this.symbolSpecs[this.symbol] || { contractSize: 1, pointVal: 1, digits: 2 };

        if (this.challengeConfig.riskMode === 'LOTS') {
            const fixedLots = Math.max(0.01, parseFloat(this.challengeConfig.riskValue) || 0.10);
            return Math.min(50.0, Math.round(fixedLots * 100) / 100);
        }

        // Modo Porcentaje (%)
        const riskUSD = (this.challengeConfig.riskValue / 100) * this.account.balance;
        const slDist = Math.abs(entryPrice - slPrice);

        if (slDist <= 0) return 0.10;

        let lots = riskUSD / (slDist * spec.pointVal);
        lots = Math.max(0.01, Math.min(20.0, Math.round(lots * 100) / 100));
        return lots;
    }

    ejecutarOrdenManual(tipo) {
        if (this.account.status === 'VIOLATED') {
            alert("No es posible operar: La cuenta ha sido reprobada por exceder los límites de riesgo del Prop Firm.");
            return;
        }

        const candles = this.currentCandles;
        if (!candles || candles.length === 0) {
            alert("No hay datos de velas cargados en el gráfico para ejecutar la orden.");
            return;
        }

        const curPrice = candles[candles.length - 1].close;
        const atr = this.calcularATR(candles, 14);
        const isBuy = tipo === 'BUY';
        const slPrice = isBuy ? (curPrice - (atr * 1.5)) : (curPrice + (atr * 1.5));
        const tpPrice = isBuy ? (curPrice + (atr * 3.0)) : (curPrice - (atr * 3.0));

        const lots = this.calcularLotajeSeguro(curPrice, slPrice);
        const ticket = this.orderSend(this.symbol, tipo, lots, curPrice, slPrice, tpPrice, 'Manual Discretionary');
        if (ticket) {
            this.logJournal(`[ManualTrade] Orden #${ticket} ${tipo} ${lots} lotes abierta manualmente en ${this.symbol}.`);
        }
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

        // Registrar punto en la curva de capital y guardar estado
        this.equityHistory.push({
            time: Math.floor(Date.now() / 1000),
            balance: this.account.balance,
            equity: this.account.equity
        });
        if (this.equityHistory.length > 1000) this.equityHistory.shift();
        this.guardarEstadoPersistente();

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

        this.equityHistory = [{
            time: Math.floor(Date.now() / 1000),
            balance: monto,
            equity: monto
        }];

        if (this.dom.btnToggleRun) {
            this.dom.btnToggleRun.innerHTML = '▶ Iniciar Bot en Vivo';
            this.dom.btnToggleRun.classList.add('primary');
            this.dom.btnToggleRun.classList.remove('secondary');
        }

        this.guardarEstadoPersistente();
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
        if (this.activeTab === 'mt5-tab-equity') {
            this.renderizarCurvaEquidad();
        } else if (this.activeTab === 'mt5-tab-stats') {
            this.renderizarEstadisticas();
        }
    }

    renderizarCurvaEquidad() {
        const canvas = this.dom.equityCanvas;
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;

        const w = parent.clientWidth || 600;
        const h = parent.clientHeight || 200;
        if (w <= 0 || h <= 0) return;

        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        // Fondo oscuro institucional
        ctx.fillStyle = '#131722';
        ctx.fillRect(0, 0, w, h);

        const history = this.equityHistory;
        if (!history || history.length === 0) return;

        // Calcular min y max para escala vertical
        let minVal = Infinity;
        let maxVal = -Infinity;
        history.forEach(p => {
            if (p.balance < minVal) minVal = p.balance;
            if (p.equity < minVal) minVal = p.equity;
            if (p.balance > maxVal) maxVal = p.balance;
            if (p.equity > maxVal) maxVal = p.equity;
        });

        const initBal = this.account.initialBalance;
        minVal = Math.min(minVal, initBal * 0.96);
        maxVal = Math.max(maxVal, initBal * 1.04);

        const padTop = 18;
        const padBottom = 22;
        const padLeft = 10;
        const padRight = 65;
        const chartW = Math.max(10, w - padLeft - padRight);
        const chartH = Math.max(10, h - padTop - padBottom);
        const valRange = (maxVal - minVal) || 1;

        // Cuadrícula y etiquetas
        ctx.strokeStyle = '#1e222d';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#787b86';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
        ctx.textAlign = 'left';

        const steps = 4;
        for (let i = 0; i <= steps; i++) {
            const y = padTop + (chartH / steps) * i;
            const val = maxVal - (valRange / steps) * i;
            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(w - padRight, y);
            ctx.stroke();

            ctx.fillText(`$${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, w - padRight + 5, y + 3);
        }

        // Línea base del balance inicial (dashed)
        const yInit = padTop + ((maxVal - initBal) / valRange) * chartH;
        ctx.strokeStyle = '#2a2e39';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padLeft, yInit);
        ctx.lineTo(w - padRight, yInit);
        ctx.stroke();
        ctx.setLineDash([]);

        const getX = (idx) => padLeft + (idx / Math.max(1, history.length - 1)) * chartW;
        const getY = (val) => padTop + ((maxVal - val) / valRange) * chartH;

        // 1. Trazar Curva de Equidad (Verde esmeralda)
        ctx.strokeStyle = '#089981';
        ctx.lineWidth = 2;
        ctx.beginPath();
        history.forEach((pt, idx) => {
            const x = getX(idx);
            const y = getY(pt.equity);
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // 2. Trazar Curva de Balance (Azul acento)
        ctx.strokeStyle = '#3888ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        history.forEach((pt, idx) => {
            const x = getX(idx);
            const y = getY(pt.balance);
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Actualizar Resumen de Estadísticas en el encabezado del tab
        if (this.dom.equitySummary) {
            const retPct = ((this.account.equity - initBal) / initBal) * 100;
            const pnlSign = retPct >= 0 ? '+' : '';
            this.dom.equitySummary.innerHTML = `
                Balance: <strong style="color:#3888ff;">$${this.account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> &nbsp;|&nbsp; 
                Equity: <strong style="color:#089981;">$${this.account.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> &nbsp;|&nbsp; 
                Retorno: <strong style="color:${retPct >= 0 ? '#089981' : '#f23645'};">${pnlSign}${retPct.toFixed(2)}%</strong>
            `;
        }
    }

    renderizarEstadisticas() {
        const totalTrades = this.closedPositions.length;
        let wins = 0;
        let losses = 0;
        let grossProfit = 0;
        let grossLoss = 0;

        this.closedPositions.forEach(p => {
            if (p.profit > 0) {
                wins++;
                grossProfit += p.profit;
            } else if (p.profit < 0) {
                losses++;
                grossLoss += Math.abs(p.profit);
            }
        });

        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
        const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? 99.99 : 0);
        const netPnL = this.account.balance - this.account.initialBalance;
        const avgWin = wins > 0 ? grossProfit / wins : 0;
        const avgLoss = losses > 0 ? grossLoss / losses : 0;
        const ratioRR = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 99.99 : 0);

        let peak = this.account.initialBalance;
        let maxDDPct = 0;
        if (this.equityHistory && this.equityHistory.length > 0) {
            this.equityHistory.forEach(h => {
                if (h.equity > peak) peak = h.equity;
                const dd = peak > 0 ? ((peak - h.equity) / peak) * 100 : 0;
                if (dd > maxDDPct) maxDDPct = dd;
            });
        }

        if (this.dom.statTrades) this.dom.statTrades.innerText = totalTrades;
        if (this.dom.statWinrate) this.dom.statWinrate.innerText = `${winRate.toFixed(1)}%`;
        if (this.dom.statPF) this.dom.statPF.innerText = profitFactor >= 99 ? '∞' : profitFactor.toFixed(2);
        if (this.dom.statNetPnL) {
            this.dom.statNetPnL.innerText = `${netPnL >= 0 ? '+' : ''}$${netPnL.toFixed(2)}`;
            this.dom.statNetPnL.className = `mt5-kpi-val ${netPnL >= 0 ? 'pnl-pos' : 'pnl-neg'}`;
        }
        if (this.dom.statMaxDD) this.dom.statMaxDD.innerText = `${maxDDPct.toFixed(1)}%`;
        if (this.dom.statAvgWin) this.dom.statAvgWin.innerText = `+$${avgWin.toFixed(2)}`;
        if (this.dom.statAvgLoss) this.dom.statAvgLoss.innerText = `-$${avgLoss.toFixed(2)}`;
        if (this.dom.statRR) this.dom.statRR.innerText = `1 : ${ratioRR.toFixed(2)}`;
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

    generarVelasFallback(sym = 'BTC-USD', count = 300) {
        let basePrice = 100;
        const s = (sym || '').toUpperCase();
        if (s.includes('BTC')) basePrice = 83000;
        else if (s.includes('ETH')) basePrice = 3500;
        else if (s.includes('SOL')) basePrice = 180;
        else if (s.includes('XAU') || s.includes('GOLD')) basePrice = 2650;
        else if (s.includes('EUR')) basePrice = 1.085;
        else if (s.includes('NASDAQ') || s.includes('QQQ')) basePrice = 20500;
        else if (s.includes('SP500') || s.includes('SPY')) basePrice = 5800;

        let now = Math.floor(Date.now() / 1000) - count * 3600;
        const candles = [];
        let price = basePrice;
        for (let i = 0; i < count; i++) {
            const delta = (Math.random() - 0.49) * (basePrice * 0.006);
            const open = price;
            const close = open + delta;
            const high = Math.max(open, close) + Math.random() * (basePrice * 0.003);
            const low = Math.min(open, close) - Math.random() * (basePrice * 0.003);
            const volume = Math.floor(Math.random() * 400) + 50;
            const digits = s.includes('EUR') ? 5 : 2;
            candles.push({
                time: now + (i * 3600),
                open: parseFloat(open.toFixed(digits)),
                high: parseFloat(high.toFixed(digits)),
                low: parseFloat(low.toFixed(digits)),
                close: parseFloat(close.toFixed(digits)),
                volume: volume
            });
            price = close;
        }
        return candles;
    }
}

// Instanciar globalmente
document.addEventListener('DOMContentLoaded', () => {
    window.MT5Emulator = new MT5VirtualEmulator();
});
