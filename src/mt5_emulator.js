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
        this.activeTab = 'mt5-tab-positions';

        // 24/7 Daemon Sync & Multi-Asset Portfolio State
        this.modo247 = false;
        this.serverPollTimer = null;
        this.wakeLock = null;
        this.worker = null;
        this.multiAsset = false;
        this.basketSymbols = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XAUUSD', 'EURUSD'];
        this.assetMatrix = {};
        this.multiAssetCandles = {};

        // Preloaded MT5 Expert Advisors (Bots de la Flota Concurrente)
        this.botsCatalog = {
            multiasset_champion: {
                id: 'multiasset_champion',
                name: 'Mega Alpha Multi-Activo Champion (Crypto + Oro + Forex 24/7)',
                enabled: true,
                multiAsset: true,
                symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XAUUSD', 'EURUSD'],
                timeframe: '1h',
                strategyType: 'donchian_breakout',
                magic: 8801,
                riskMode: 'LOTS',
                riskValue: 0.10,
                description: 'Estrategia cuantitativa institucional que monitorea y opera simultáneamente sobre 5 activos clave 24/7.',
                params: {
                    donchianPeriod: 24,
                    atrPeriod: 14,
                    slAtrMult: 1.5,
                    tpAtrMult: 3.0,
                    useTrailing: true,
                    trailingAtrMult: 1.2
                }
            },
            gold_rush: {
                id: 'gold_rush',
                name: 'Hobbiecode Gold Rush Breakout (XAUUSD)',
                enabled: true,
                symbol: 'XAUUSD',
                symbols: ['XAUUSD'],
                timeframe: '1h',
                strategyType: 'donchian_breakout',
                magic: 7701,
                riskMode: 'LOTS',
                riskValue: 0.10,
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
                enabled: true,
                symbol: 'BTC-USD',
                symbols: ['BTC-USD'],
                timeframe: '1h',
                strategyType: 'vcp_squeeze',
                magic: 7702,
                riskMode: 'LOTS',
                riskValue: 0.10,
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
                name: 'Squeeze Momentum Breakout (SOL-USD)',
                enabled: true,
                symbol: 'SOL-USD',
                symbols: ['SOL-USD'],
                timeframe: '1h',
                strategyType: 'sqz_momentum',
                magic: 7703,
                riskMode: 'LOTS',
                riskValue: 0.10,
                description: 'Detección de compresión Bollinger dentro de Keltner con posterior liberación direccional de momentum en Solana.',
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
                enabled: true,
                symbol: 'EURUSD',
                symbols: ['EURUSD'],
                timeframe: '1h',
                strategyType: 'donchian_breakout',
                magic: 7704,
                riskMode: 'LOTS',
                riskValue: 0.10,
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
                enabled: false,
                symbol: 'NASDAQ',
                symbols: ['NASDAQ'],
                timeframe: '1h',
                strategyType: 'ema_cross',
                magic: 7705,
                riskMode: 'LOTS',
                riskValue: 0.10,
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
            dropzone: document.getElementById('mt5-dropzone'),
            importStatus: document.getElementById('mt5-import-status'),
            importName: document.getElementById('mt5-import-name'),
            importMagic: document.getElementById('mt5-import-magic'),
            importStrat: document.getElementById('mt5-import-strat'),
            importSymbols: document.getElementById('mt5-import-symbols'),
            importRiskMode: document.getElementById('mt5-import-risk-mode'),
            importRiskVal: document.getElementById('mt5-import-risk-val'),
            importParamsGrid: document.getElementById('mt5-import-params-grid'),
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
            panel: document.getElementById('mt5-terminal-panel'),

            // 24/7 y Multi-Activo
            btnToggle247: document.getElementById('btn-mt5-toggle-247'),
            btnWakeLock: document.getElementById('btn-mt5-wakelock'),
            badgeMultiAsset: document.getElementById('mt5-multiasset-badge'),
            tableMatrixBody: document.getElementById('mt5-matrix-body'),
            matrixCount: document.getElementById('mt5-matrix-count'),
            btnRefreshMatrix: document.getElementById('btn-mt5-refresh-matrix'),
            btnLoadMultiAssetTemplate: document.getElementById('btn-mt5-load-multiasset-template'),

            // Flota Multi-Bot Concurrente
            badgeFleet: document.getElementById('mt5-fleet-badge'),
            tableFleetBody: document.getElementById('mt5-fleet-body'),
            fleetCount: document.getElementById('mt5-fleet-count'),
            fleetTotalPnL: document.getElementById('mt5-fleet-total-pnl'),
            btnFleetStartAll: document.getElementById('btn-mt5-fleet-start-all'),
            btnFleetPauseAll: document.getElementById('btn-mt5-fleet-pause-all'),
            btnFleetAddBot: document.getElementById('btn-mt5-fleet-add-bot')
        };

        this.cargarBotsCustom();
        this.cargarEstadoPersistente();
        this.initEventos();
        this.initWebWorker();
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

    // =========================================================================
    // PARSER & TRANSPILADOR NATIVO DE BOTS METATRADER 5 (.MQ5 / .EX5 / .JSON)
    // =========================================================================
    extractStringsFromBuffer(buffer) {
        if (!buffer) return [];
        const bytes = new Uint8Array(buffer);
        const strings = [];

        // ASCII strings (min 3 chars)
        let curAscii = '';
        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i];
            if (b >= 32 && b <= 126) {
                curAscii += String.fromCharCode(b);
            } else {
                if (curAscii.length >= 3) strings.push(curAscii);
                curAscii = '';
            }
        }
        if (curAscii.length >= 3) strings.push(curAscii);

        // UTF-16LE strings (min 3 chars)
        let curUtf16 = '';
        for (let i = 0; i < bytes.length - 1; i += 2) {
            const b0 = bytes[i];
            const b1 = bytes[i + 1];
            if (b1 === 0 && b0 >= 32 && b0 <= 126) {
                curUtf16 += String.fromCharCode(b0);
            } else {
                if (curUtf16.length >= 3) strings.push(curUtf16);
                curUtf16 = '';
            }
        }
        if (curUtf16.length >= 3) strings.push(curUtf16);

        return [...new Set(strings)];
    }

    detectarSimbolosDeBot(fuente, filename = '') {
        const encontrados = new Set();

        const mapaAlias = {
            'XAUUSD': 'XAUUSD', 'GOLD': 'XAUUSD', 'ORO': 'XAUUSD',
            'XAGUSD': 'XAGUSD', 'SILVER': 'XAGUSD', 'PLATA': 'XAGUSD',
            'BTCUSD': 'BTC-USD', 'BTCUSDT': 'BTC-USD', 'BTC-USD': 'BTC-USD', 'BITCOIN': 'BTC-USD',
            'ETHUSD': 'ETH-USD', 'ETHUSDT': 'ETH-USD', 'ETH-USD': 'ETH-USD', 'ETHEREUM': 'ETH-USD',
            'SOLUSD': 'SOL-USD', 'SOLUSDT': 'SOL-USD', 'SOL-USD': 'SOL-USD', 'SOLANA': 'SOL-USD',
            'XRPUSD': 'XRP-USD', 'BNBUSD': 'BNB-USD', 'ADAUSD': 'ADA-USD',
            'EURUSD': 'EURUSD', 'GBPUSD': 'GBPUSD', 'USDJPY': 'USDJPY', 'AUDUSD': 'AUDUSD',
            'USDCAD': 'USDCAD', 'USDCHF': 'USDCHF', 'NZDUSD': 'NZDUSD',
            'EURGBP': 'EURGBP', 'EURJPY': 'EURJPY', 'GBPJPY': 'GBPJPY', 'AUDJPY': 'AUDJPY',
            'NASDAQ': 'NASDAQ', 'US100': 'NASDAQ', 'USTEC': 'NASDAQ', 'NQ': 'NASDAQ', 'NDX': 'NASDAQ',
            'SP500': 'SP500', 'US500': 'SP500', 'ES': 'SP500', 'SPX': 'SP500',
            'US30': 'US30', 'DOW': 'US30', 'DJI': 'US30', 'YM': 'US30',
            'DAX': 'DAX', 'GER40': 'DAX',
            'NVDA': 'NVDA', 'AAPL': 'AAPL', 'TSLA': 'TSLA', 'MSFT': 'MSFT', 'AMZN': 'AMZN', 'GOOGL': 'GOOGL'
        };

        const normalizar = (raw) => {
            if (!raw) return null;
            const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, '');
            if (mapaAlias[clean]) return mapaAlias[clean];
            const noGuion = clean.replace('-', '');
            if (mapaAlias[noGuion]) return mapaAlias[noGuion];
            if (/^[A-Z]{6}$/.test(clean)) return clean;
            return null;
        };

        // 1. Extraer de inputs de MQL5 o variables explícitas
        if (typeof fuente === 'string') {
            const regexInputString = /(?:input|sinput)\s+string\s+[a-zA-Z0-9_]*(?:symbol|symbols|pair|pairs|basket|instruments|asset|assets)[a-zA-Z0-9_]*\s*=\s*["']([^"']+)["']/gi;
            let m;
            while ((m = regexInputString.exec(fuente)) !== null) {
                const lista = m[1].split(/[,;\s|]+/);
                lista.forEach(item => {
                    const norm = normalizar(item);
                    if (norm) encontrados.add(norm);
                });
            }

            const regexFuncSymbol = /(?:SymbolInfoDouble|SymbolInfoInteger|SymbolInfoString|iClose|iOpen|iHigh|iLow|iVolume|iTime|iMA|iRSI|iATR|iBands|OrderSend)\s*\(\s*["']([A-Z0-9_\-]+)["']/gi;
            let mf;
            while ((mf = regexFuncSymbol.exec(fuente)) !== null) {
                const norm = normalizar(mf[1]);
                if (norm) encontrados.add(norm);
            }
        }

        // 2. Extraer de array de cadenas (EX5)
        if (Array.isArray(fuente)) {
            fuente.forEach(str => {
                const norm = normalizar(str);
                if (norm) encontrados.add(norm);
                if (str.includes(',') || str.includes(';')) {
                    str.split(/[,;\s]+/).forEach(p => {
                        const n = normalizar(p);
                        if (n) encontrados.add(n);
                    });
                }
            });
        }

        // 3. Extraer de nombre de archivo
        if (filename) {
            const cleanFn = filename.toUpperCase().replace(/\.(MQ5|EX5|JSON|TXT)$/i, '');
            Object.keys(mapaAlias).forEach(k => {
                if (k.length <= 3) {
                    const reg = new RegExp(`(^|[^A-Z0-9])${k}([^A-Z0-9]|$)`, 'i');
                    if (reg.test(cleanFn)) encontrados.add(mapaAlias[k]);
                } else if (cleanFn.includes(k)) {
                    encontrados.add(mapaAlias[k]);
                }
            });
        }

        // 4. Si el texto completo menciona símbolos conocidos
        if (typeof fuente === 'string' && encontrados.size === 0) {
            const upperCode = fuente.toUpperCase();
            const prioritized = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTC-USD', 'ETH-USD', 'SOL-USD', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'NASDAQ', 'US100', 'SP500', 'US500', 'US30'];
            prioritized.forEach(sym => {
                const reg = new RegExp(`\\b${sym.replace('-', '[-]?')}\\b`, 'i');
                if (reg.test(upperCode)) {
                    const norm = normalizar(sym);
                    if (norm) encontrados.add(norm);
                }
            });
        }

        return Array.from(encontrados);
    }

    parseEX5(buffer, filename = '') {
        const strings = this.extractStringsFromBuffer(buffer);
        const cleanName = filename ? filename.replace(/\.ex5$/i, '').replace(/[_-]/g, ' ') : 'Bot MT5 Compilado';
        const detectedSymbols = this.detectarSimbolosDeBot(strings, filename);
        const isMulti = detectedSymbols.length > 1;
        const primarySymbol = detectedSymbols[0] || this.symbol || 'BTC-USD';
        const symbolsList = detectedSymbols.length > 0 ? detectedSymbols : [primarySymbol];

        const bot = {
            id: 'bot_ex5_' + Date.now(),
            name: cleanName,
            symbol: primarySymbol,
            symbols: symbolsList,
            multiAsset: isMulti,
            timeframe: this.timeframe || '1h',
            magic: Math.floor(1000 + Math.random() * 8999),
            description: `Expert Advisor MT5 compilado (.ex5) con parámetros extraídos dinámicamente del binario.`,
            strategyType: 'donchian_breakout',
            category: isMulti ? 'Bot MT5 Multi-Activo (.ex5)' : 'Bot MT5 (.ex5)',
            riskMode: 'LOTS',
            riskValue: 0.10,
            params: {
                donchianPeriod: 20,
                atrPeriod: 14,
                slAtrMult: 1.5,
                tpAtrMult: 3.0,
                useTrailing: true,
                trailingAtrMult: 1.2
            }
        };

        // Escanear cadenas en busca de Magic Number, inputs y patrones
        strings.forEach(s => {
            const lower = s.toLowerCase();
            if (lower.includes('magic') && /\d+/.test(s)) {
                const num = parseInt(s.match(/\d+/)[0], 10);
                if (num > 100) bot.magic = num;
            }
            if (s.startsWith('Inp') || s.startsWith('inp')) {
                const paramName = s.replace(/^inp/i, '');
                const cleanKey = paramName.charAt(0).toLowerCase() + paramName.slice(1);
                if (!bot.params[cleanKey]) {
                    if (cleanKey.toLowerCase().includes('period') || cleanKey.toLowerCase().includes('len')) {
                        bot.params[cleanKey] = 20;
                    } else if (cleanKey.toLowerCase().includes('mult') || cleanKey.toLowerCase().includes('ratio')) {
                        bot.params[cleanKey] = 1.5;
                    } else if (cleanKey.toLowerCase().includes('lot')) {
                        bot.params[cleanKey] = 0.10;
                    } else {
                        bot.params[cleanKey] = 10;
                    }
                }
            }
            if (lower.includes('vcp') || lower.includes('squeeze')) {
                bot.strategyType = 'vcp_squeeze';
            } else if (lower.includes('momentum')) {
                bot.strategyType = 'sqz_momentum';
            } else if (lower.includes('ema') || lower.includes('ma_cross')) {
                bot.strategyType = 'ema_cross';
            } else if (lower.includes('breakout') || lower.includes('donchian')) {
                bot.strategyType = 'donchian_breakout';
            }
        });

        return bot;
    }

    parseMQL5(code, filename = '') {
        const cleanName = filename ? filename.replace(/\.(mq5|txt)$/i, '').replace(/[_-]/g, ' ') : 'Bot MQL5';
        const detectedSymbols = this.detectarSimbolosDeBot(code, filename);
        const isMulti = detectedSymbols.length > 1;
        const primarySymbol = detectedSymbols[0] || this.symbol || 'BTC-USD';
        const symbolsList = detectedSymbols.length > 0 ? detectedSymbols : [primarySymbol];

        const bot = {
            id: 'bot_mql5_' + Date.now(),
            name: cleanName,
            symbol: primarySymbol,
            symbols: symbolsList,
            multiAsset: isMulti,
            timeframe: this.timeframe || '1h',
            magic: Math.floor(1000 + Math.random() * 8999),
            description: 'Expert Advisor MQL5 personalizado.',
            strategyType: 'donchian_breakout',
            category: isMulti ? 'Bot MT5 Multi-Activo (.mq5)' : 'Bot MT5 (.mq5)',
            riskMode: 'LOTS',
            riskValue: 0.10,
            params: {}
        };

        const propDesc = code.match(/#property\s+description\s+["']([^"']+)["']/i);
        if (propDesc && propDesc[1]) bot.description = propDesc[1];

        const propName = code.match(/\/\/\s*\|\s*([a-zA-Z0-9_\- ]+)\.mq5/i);
        if (propName && propName[1]) bot.name = propName[1].trim();

        // Magic Number
        const magicMatch = code.match(/(?:input|sinput)\s+(?:ulong|int|uint|long)\s+[a-zA-Z0-9_]*magic[a-zA-Z0-9_]*\s*=\s*(\d+)/i)
            || code.match(/#define\s+[a-zA-Z0-9_]*MAGIC[a-zA-Z0-9_]*\s+(\d+)/i)
            || code.match(/(?:ulong|int|uint)\s+[a-zA-Z0-9_]*Magic(?:Number)?\s*=\s*(\d+)/i);
        if (magicMatch && magicMatch[1]) {
            bot.magic = parseInt(magicMatch[1], 10);
        }

        // Parse inputs
        const inputRegex = /(?:input|sinput)\s+(?:group\s+["'][^"']*["']\s*;|([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)\s*(?:=\s*([^;]+))?\s*;(?:\s*\/\/\s*([^\r\n]+))?)/gi;
        let match;
        while ((match = inputRegex.exec(code)) !== null) {
            const type = match[1];
            const varName = match[2];
            let valRaw = match[3];

            if (!varName) continue;
            if (valRaw !== undefined) valRaw = valRaw.trim();
            else valRaw = '';

            let val = valRaw;
            if (type === 'bool') {
                val = valRaw.toLowerCase() === 'true';
            } else if (['int', 'uint', 'ulong', 'long', 'char', 'short'].includes(type)) {
                val = parseInt(valRaw, 10);
                if (isNaN(val)) val = 0;
            } else if (['double', 'float'].includes(type)) {
                val = parseFloat(valRaw);
                if (isNaN(val)) val = 0.0;
            } else if (type === 'string') {
                val = valRaw.replace(/^["']|["']$/g, '');
            } else {
                if (valRaw.toLowerCase() === 'true') val = true;
                else if (valRaw.toLowerCase() === 'false') val = false;
                else if (!isNaN(Number(valRaw)) && valRaw !== '') val = Number(valRaw);
            }

            let paramKey = varName;
            if (paramKey.startsWith('Inp') && paramKey.length > 3) {
                paramKey = paramKey.charAt(3).toLowerCase() + paramKey.slice(4);
            } else if (paramKey.startsWith('inp') && paramKey.length > 3) {
                paramKey = paramKey.charAt(3).toLowerCase() + paramKey.slice(4);
            }

            bot.params[paramKey] = val;

            const lowerVar = varName.toLowerCase();
            if ((lowerVar.includes('lot') || lowerVar.includes('vol')) && typeof val === 'number') {
                bot.riskMode = 'LOTS';
                bot.riskValue = val;
            } else if (lowerVar.includes('risk') && typeof val === 'number' && val <= 10) {
                bot.riskMode = 'PCT';
                bot.riskValue = val;
            }

            if (typeof val === 'string' && (lowerVar.includes('symbol') || lowerVar.includes('basket'))) {
                const symList = val.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(s => s.length > 2);
                if (symList.length > 1) {
                    bot.symbols = symList;
                    bot.multiAsset = true;
                } else if (symList.length === 1) {
                    bot.symbol = symList[0];
                    bot.symbols = [symList[0]];
                }
            }
        }

        // Detección de estrategia
        const codeLower = code.toLowerCase();
        if (codeLower.includes('donchian') || codeLower.includes('ihighest') || codeLower.includes('ilowest')) {
            bot.strategyType = 'donchian_breakout';
        } else if (codeLower.includes('vcp') || (codeLower.includes('ibands') && codeLower.includes('ema'))) {
            bot.strategyType = 'vcp_squeeze';
        } else if (codeLower.includes('squeeze') || codeLower.includes('keltner')) {
            bot.strategyType = 'sqz_momentum';
        } else if (codeLower.includes('ima') || codeLower.includes('ema') || codeLower.includes('cruce')) {
            bot.strategyType = 'ema_cross';
        } else if (codeLower.includes('irsi') || codeLower.includes('rsi')) {
            bot.strategyType = 'rsi_reversion';
        }

        if (!bot.params.slAtrMult && !bot.params.stopLossPct) bot.params.slAtrMult = 1.5;
        if (!bot.params.tpAtrMult && !bot.params.takeProfitPct) bot.params.tpAtrMult = 3.0;
        if (bot.params.useTrailing === undefined) bot.params.useTrailing = true;
        if (!bot.params.trailingAtrMult) bot.params.trailingAtrMult = 1.2;

        return bot;
    }

    procesarArchivoBot(file) {
        if (!file) return;
        const fname = file.name || '';
        const ext = fname.split('.').pop().toLowerCase();

        if (ext === 'ex5') {
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const bot = this.parseEX5(evt.target.result, fname);
                    this.cargarBotEnFormularioImport(bot, 'EX5');
                } catch (err) {
                    alert('Error analizando archivo .ex5: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const text = evt.target.result || '';
                try {
                    if (ext === 'json' || text.trim().startsWith('{')) {
                        const bot = JSON.parse(text);
                        this.cargarBotEnFormularioImport(bot, 'JSON');
                    } else {
                        const bot = this.parseMQL5(text, fname);
                        this.cargarBotEnFormularioImport(bot, 'MQL5');
                    }
                } catch (err) {
                    alert('Error analizando archivo ' + fname + ': ' + err.message);
                }
            };
            reader.readAsText(file);
        }
    }

    cargarBotEnFormularioImport(bot, tipoOrigen = 'MQL5') {
        this.currentImportBot = bot;
        if (this.dom.importName) this.dom.importName.value = bot.name || 'Mi Bot MT5';
        if (this.dom.importMagic) this.dom.importMagic.value = bot.magic || 8801;
        if (this.dom.importStrat) this.dom.importStrat.value = bot.strategyType || 'donchian_breakout';
        
        const syms = (Array.isArray(bot.symbols) && bot.symbols.length > 0) ? bot.symbols.join(', ') : (bot.symbol || this.symbol || 'BTC-USD');
        if (this.dom.importSymbols) this.dom.importSymbols.value = syms;
        
        if (this.dom.importRiskMode) this.dom.importRiskMode.value = bot.riskMode || 'LOTS';
        if (this.dom.importRiskVal) this.dom.importRiskVal.value = bot.riskValue !== undefined ? bot.riskValue : (bot.riskMode === 'LOTS' ? 0.10 : 1.0);

        this.renderizarImportParamsGrid(bot.params || {});
        if (this.dom.editorImportBot) this.dom.editorImportBot.value = JSON.stringify(bot, null, 2);

        if (this.dom.importStatus) {
            this.dom.importStatus.style.display = 'block';
            if (tipoOrigen === 'MQL5') {
                this.dom.importStatus.style.background = 'rgba(8, 153, 129, 0.15)';
                this.dom.importStatus.style.border = '1px solid #089981';
                this.dom.importStatus.style.color = '#089981';
                this.dom.importStatus.innerHTML = `🟢 <strong>Archivo fuente .mq5 analizado con éxito:</strong> Estrategia <em>${bot.strategyType}</em> detectada con ${Object.keys(bot.params).length} parámetros configurables. Magic Number #${bot.magic}.`;
            } else if (tipoOrigen === 'EX5') {
                this.dom.importStatus.style.background = 'rgba(56, 136, 255, 0.15)';
                this.dom.importStatus.style.border = '1px solid #3888ff';
                this.dom.importStatus.style.color = '#5b8cff';
                this.dom.importStatus.innerHTML = `🔵 <strong>Archivo binario .ex5 analizado:</strong> Metadatos y ${Object.keys(bot.params).length} parámetros extraídos del bytecode. (💡 Para acceder a la lógica fuente completa se recomienda el archivo .mq5 si está disponible).`;
            } else {
                this.dom.importStatus.style.background = 'rgba(255, 152, 0, 0.15)';
                this.dom.importStatus.style.border = '1px solid #ff9800';
                this.dom.importStatus.style.color = '#ff9800';
                this.dom.importStatus.innerHTML = `🟠 <strong>Definición cargada:</strong> Bot listo para instalar en la flota.`;
            }
        }

        if (this.dom.modalImportBot) this.dom.modalImportBot.style.display = 'flex';
    }

    renderizarImportParamsGrid(params) {
        if (!this.dom.importParamsGrid) return;
        const entries = Object.entries(params || {});
        if (entries.length === 0) {
            this.dom.importParamsGrid.innerHTML = `<span style="color:#787b86; font-size:11px; padding:4px;">No se detectaron inputs adicionales. Se aplicarán parámetros cuantitativos predeterminados.</span>`;
            return;
        }

        this.dom.importParamsGrid.innerHTML = entries.map(([key, val]) => {
            const isBool = typeof val === 'boolean';
            const isFloat = typeof val === 'number' && !Number.isInteger(val);
            const step = isFloat ? '0.1' : '1';
            return `
                <div style="background:#181b24; padding:4px 6px; border-radius:3px; border:1px solid #2a2e39;">
                    <div style="font-size:10px; color:#5b8cff; font-family:monospace; margin-bottom:2px;" title="${key}">${key}:</div>
                    ${isBool
                        ? `<input type="checkbox" id="mt5-imp-p-${key}" ${val ? 'checked' : ''} style="cursor:pointer;">`
                        : `<input type="number" id="mt5-imp-p-${key}" value="${val}" step="${step}" style="width:100%; background:#131722; border:1px solid #2a2e39; color:#fff; font-size:10px; padding:2px 4px; border-radius:2px;">`
                    }
                </div>
            `;
        }).join('');
    }

    importarBotDesdeEditor() {
        try {
            // Si el editor contiene JSON manual válido, parsearlo primero
            let parsedJson = null;
            if (this.dom.editorImportBot && this.dom.editorImportBot.value && typeof this.dom.editorImportBot.value === 'string' && this.dom.editorImportBot.value.trim().startsWith('{')) {
                try {
                    parsedJson = JSON.parse(this.dom.editorImportBot.value.trim());
                } catch (e) {}
            }

            // Determinar ID del bot
            const botId = (parsedJson && parsedJson.id) || (this.currentImportBot && this.currentImportBot.id) || `bot_mql5_${Date.now()}`;

            // Determinar nombre del bot
            let formName = (this.dom.importName && this.dom.importName.value) ? this.dom.importName.value.trim() : '';
            if (formName === '1.0' || formName === 'Mi Bot MT5') formName = '';
            const name = formName || (parsedJson && parsedJson.name) || (this.currentImportBot && this.currentImportBot.name) || 'Mi Bot MT5';

            // Determinar magic number
            let formMagic = (this.dom.importMagic && this.dom.importMagic.value) ? parseInt(this.dom.importMagic.value, 10) : 0;
            if (formMagic === 1) formMagic = 0;
            const magic = formMagic || (parsedJson && parsedJson.magic) || (this.currentImportBot && this.currentImportBot.magic) || Math.floor(1000 + Math.random() * 8999);

            // Determinar estrategia
            let formStrat = (this.dom.importStrat && this.dom.importStrat.value) ? this.dom.importStrat.value.trim() : '';
            if (formStrat === '1.0') formStrat = '';
            const strategyType = formStrat || (parsedJson && parsedJson.strategyType) || (this.currentImportBot && this.currentImportBot.strategyType) || 'donchian_breakout';

            // Determinar símbolos
            let symbolsList = [];
            if (parsedJson) {
                if (Array.isArray(parsedJson.symbols) && parsedJson.symbols.length > 0) symbolsList = parsedJson.symbols;
                else if (parsedJson.symbol) symbolsList = [parsedJson.symbol];
            }
            if (symbolsList.length === 0 && this.dom.importSymbols && this.dom.importSymbols.value) {
                const symVal = this.dom.importSymbols.value.trim();
                if (symVal && symVal !== '1.0') {
                    const parsed = symVal.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(s => s.length >= 2);
                    if (parsed.length > 0) symbolsList = parsed;
                }
            }
            if (symbolsList.length === 0 && this.currentImportBot) {
                if (Array.isArray(this.currentImportBot.symbols) && this.currentImportBot.symbols.length > 0) symbolsList = this.currentImportBot.symbols;
                else if (this.currentImportBot.symbol) symbolsList = [this.currentImportBot.symbol];
            }
            if (symbolsList.length === 0) symbolsList = [this.symbol || 'BTC-USD'];

            // Determinar modo y valor de riesgo
            let formRiskMode = (this.dom.importRiskMode && this.dom.importRiskMode.value) ? this.dom.importRiskMode.value : '';
            if (formRiskMode === '1.0') formRiskMode = '';
            const riskMode = formRiskMode || (parsedJson && parsedJson.riskMode) || (this.currentImportBot && this.currentImportBot.riskMode) || 'LOTS';

            let formRiskVal = (this.dom.importRiskVal && this.dom.importRiskVal.value !== undefined) ? parseFloat(this.dom.importRiskVal.value) : NaN;
            const riskVal = (!isNaN(formRiskVal) && formRiskVal !== 1.0 ? formRiskVal : (parsedJson && parsedJson.riskValue !== undefined ? parsedJson.riskValue : (this.currentImportBot && this.currentImportBot.riskValue !== undefined ? this.currentImportBot.riskValue : (riskMode === 'LOTS' ? 0.10 : 1.0))));

            // Recopilar parámetros: base del bot cargado + grid visual + json manual
            const params = (this.currentImportBot && this.currentImportBot.params) ? { ...this.currentImportBot.params } : {};
            if (this.dom.importParamsGrid) {
                Object.keys(params).forEach(key => {
                    const inp = document.getElementById(`mt5-imp-p-${key}`);
                    if (inp) {
                        if (inp.type === 'checkbox') params[key] = inp.checked;
                        else params[key] = parseFloat(inp.value) || 0;
                    }
                });
            }
            if (parsedJson && parsedJson.params) {
                Object.assign(params, parsedJson.params);
            }

            const timeframe = (parsedJson && parsedJson.timeframe) || (this.currentImportBot && this.currentImportBot.timeframe) || this.timeframe || '1h';

            const bot = {
                id: botId,
                name: name,
                symbol: symbolsList[0] || 'BTC-USD',
                symbols: symbolsList.length > 0 ? symbolsList : [this.symbol || 'BTC-USD'],
                multiAsset: symbolsList.length > 1,
                timeframe: timeframe,
                magic: magic,
                strategyType: strategyType,
                riskMode: riskMode,
                riskValue: riskVal,
                description: (parsedJson && parsedJson.description) || (this.currentImportBot && this.currentImportBot.description) || `Bot MT5 ${name} (${strategyType})`,
                enabled: true,
                params: params
            };

            this.botsCatalog[bot.id] = bot;
            this.guardarBotsCustom();
            this.poblarSelectores();
            this.seleccionarBot(bot.id);
            this.renderizarFlotaBots();
            this.actualizarBadgeFlota();

            if (this.dom.modalImportBot) {
                this.dom.modalImportBot.style.display = 'none';
            }

            // Sincronizar con el daemon 24/7 en segundo plano
            if (typeof fetch !== 'undefined') {
                fetch('/api/mt5/daemon_configure', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bot: bot })
                }).catch(() => {});
            }

            this.logJournal(`[BotImported] Bot '${bot.name}' (Magic #${bot.magic}) importado e instalado exitosamente en la flota.`);
            alert(`¡Bot "${bot.name}" (Magic #${bot.magic}) importado e instalado exitosamente en la flota! Listo para Forward-Testing y ejecución 24/7.`);
        } catch (err) {
            alert('Error al importar bot: ' + err.message);
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

        // Modal de Carga de Bots MT5 (.mq5 / .ex5 / .json)
        if (this.dom.btnImportBot && this.dom.modalImportBot) {
            this.dom.btnImportBot.addEventListener('click', () => {
                this.dom.modalImportBot.style.display = 'flex';
            });
        }

        // Dropzone interactivo
        if (this.dom.dropzone) {
            this.dom.dropzone.addEventListener('click', () => {
                if (this.dom.modalBotFileInput) this.dom.modalBotFileInput.click();
            });
            this.dom.dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.dom.dropzone.style.borderColor = '#089981';
                this.dom.dropzone.style.background = 'rgba(8, 153, 129, 0.12)';
            });
            this.dom.dropzone.addEventListener('dragleave', () => {
                this.dom.dropzone.style.borderColor = '#2962ff';
                this.dom.dropzone.style.background = 'rgba(41, 98, 255, 0.06)';
            });
            this.dom.dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                this.dom.dropzone.style.borderColor = '#2962ff';
                this.dom.dropzone.style.background = 'rgba(41, 98, 255, 0.06)';
                const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (file) this.procesarArchivoBot(file);
            });
        }

        if (this.dom.botFileInput) {
            this.dom.botFileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) this.procesarArchivoBot(file);
            });
        }

        if (this.dom.modalBotFileInput) {
            this.dom.modalBotFileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) this.procesarArchivoBot(file);
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

        // Detección automática al escribir o pegar en el editor de código
        if (this.dom.editorImportBot) {
            this.dom.editorImportBot.addEventListener('input', () => {
                const val = this.dom.editorImportBot.value.trim();
                if (val.startsWith('{')) {
                    try {
                        const bot = JSON.parse(val);
                        this.cargarBotEnFormularioImport(bot, 'JSON');
                    } catch (e) {}
                } else if (val.includes('#property') || val.includes('input') || val.includes('OnTick') || val.includes('void')) {
                    const bot = this.parseMQL5(val, 'Pasted_EA.mq5');
                    this.cargarBotEnFormularioImport(bot, 'MQL5');
                }
            });
        }

        if (this.dom.btnApplyImportBot) {
            this.dom.btnApplyImportBot.addEventListener('click', () => {
                this.importarBotDesdeEditor();
            });
        }

        if (this.dom.btnLoadMultiAssetTemplate) {
            this.dom.btnLoadMultiAssetTemplate.addEventListener('click', () => {
                const template = {
                    id: 'mi_bot_multiactivo_247',
                    name: 'Mi Bot Multi-Activo Institucional 24/7',
                    multiAsset: true,
                    symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XAUUSD', 'EURUSD'],
                    timeframe: '1h',
                    magic: 9922,
                    description: 'Bot multi-activo diseñado para operar 24/7 en simultáneo en 5 activos.',
                    strategyType: 'donchian_breakout',
                    riskMode: 'LOTS',
                    riskValue: 0.10,
                    params: {
                        donchianPeriod: 20,
                        atrPeriod: 14,
                        slAtrMult: 1.5,
                        tpAtrMult: 3.0,
                        useTrailing: true,
                        trailingAtrMult: 1.2
                    }
                };
                this.cargarBotEnFormularioImport(template, 'JSON');
            });
        }

        // Modo 24/7 Cloud y Wake Lock
        if (this.dom.btnToggle247) {
            this.dom.btnToggle247.addEventListener('click', () => {
                this.toggleModo247();
            });
        }
        if (this.dom.btnWakeLock) {
            this.dom.btnWakeLock.addEventListener('click', () => {
                this.toggleWakeLock();
            });
        }
        if (this.dom.btnRefreshMatrix) {
            this.dom.btnRefreshMatrix.addEventListener('click', () => {
                this.evaluarLogicaMultiActivo();
                this.renderizarMatrizMultiActivo();
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

        // Controles de Flota Multi-Bot
        if (this.dom.btnFleetStartAll) {
            this.dom.btnFleetStartAll.addEventListener('click', () => {
                this.iniciarTodaLaFlota();
            });
        }
        if (this.dom.btnFleetPauseAll) {
            this.dom.btnFleetPauseAll.addEventListener('click', () => {
                this.pausarTodaLaFlota();
            });
        }
        if (this.dom.btnFleetAddBot) {
            this.dom.btnFleetAddBot.addEventListener('click', () => {
                if (this.dom.modalImportBot) this.dom.modalImportBot.style.display = 'flex';
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
        this.symbol = bot.symbol || (Array.isArray(bot.symbols) ? bot.symbols[0] : 'BTC-USD');
        this.timeframe = bot.timeframe || '1h';
        this.magicNumber = bot.magic || 8801;

        this.multiAsset = !!(bot.multiAsset || (Array.isArray(bot.symbols) && bot.symbols.length > 1));
        if (this.multiAsset && Array.isArray(bot.symbols)) {
            this.basketSymbols = bot.symbols;
            if (this.dom.badgeMultiAsset) {
                this.dom.badgeMultiAsset.style.display = 'block';
                this.dom.badgeMultiAsset.innerText = `🌐 Cesta: [${bot.symbols.join(', ')}]`;
            }
        } else {
            if (this.dom.badgeMultiAsset) this.dom.badgeMultiAsset.style.display = 'none';
        }

        if (this.dom.symbolSelect) this.dom.symbolSelect.value = this.symbol;
        if (this.dom.tfSelect) this.dom.tfSelect.value = this.timeframe;
        this.renderizarFormularioParametros();
        this.currentCandles = [];
        this.cargarVelasYActualizar();
        if (this.multiAsset) this.renderizarMatrizMultiActivo();
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
        } else if (tabId === 'mt5-tab-matrix') {
            this.renderizarMatrizMultiActivo();
        } else if (tabId === 'mt5-tab-fleet') {
            this.renderizarFlotaBots();
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
    // SERVICIOS EN SEGUNDO PLANO 24/7 (WEB WORKER & WAKE LOCK & SYNC)
    // =========================================================================
    initWebWorker() {
        if (typeof Worker === 'undefined' || typeof window === 'undefined') {
            return;
        }
        const candidatePaths = ['./mt5_worker.js', 'mt5_worker.js', 'src/mt5_worker.js'];
        for (const workerPath of candidatePaths) {
            try {
                this.worker = new Worker(workerPath);
                this.worker.onmessage = (e) => {
                    const data = e.data || {};
                    if (data.type === 'TICK_HEARTBEAT') {
                        this.onWorkerHeartbeat(data.time);
                    }
                };
                this.logJournal(`[WebWorker] Anti-throttling Web Worker inicializado con éxito (${workerPath}).`);
                break;
            } catch (e) {
                // Probar siguiente ruta
            }
        }
        if (!this.worker) {
            console.warn('No se pudo inicializar Web Worker en ninguna de las rutas candidatas.');
        }
    }

    onWorkerHeartbeat(time) {
        if (this.modo247) {
            this.sincronizarConServidor();
            return;
        }

        if (!this.isRunning || this.account.status !== 'ACTIVE') return;

        // Evaluar señales de toda la flota de bots habilitada
        this.evaluarLogicaFlota();

        if (this.multiAsset) {
            this.evaluarLogicaMultiActivo();
        } else {
            if (this.currentCandles && this.currentCandles.length > 0) {
                const last = this.currentCandles[this.currentCandles.length - 1];
                const delta = (Math.random() - 0.49) * (last.close * 0.0005);
                const newPrice = last.close + delta;
                const spec = this.symbolSpecs[this.symbol] || { digits: 2 };
                const updatedCandle = {
                    ...last,
                    high: Math.max(last.high, newPrice),
                    low: Math.min(last.low, newPrice),
                    close: parseFloat(newPrice.toFixed(spec.digits))
                };
                this.onTick(updatedCandle);
            }
        }
    }

    async toggleWakeLock() {
        if (typeof navigator === 'undefined' || !navigator.wakeLock) {
            if (typeof alert !== 'undefined') alert('Screen Wake Lock API no está soportada en este entorno o navegador.');
            return;
        }

        try {
            if (this.wakeLock) {
                await this.wakeLock.release();
                this.wakeLock = null;
                this.actualizarBotonWakeLock();
                this.logJournal(`[WakeLock] Pantalla activa liberada.`);
            } else {
                this.wakeLock = await navigator.wakeLock.request('screen');
                this.wakeLock.addEventListener('release', () => {
                    this.wakeLock = null;
                    this.actualizarBotonWakeLock();
                });
                this.actualizarBotonWakeLock();
                this.logJournal(`[WakeLock] Pantalla activa (Wake Lock) concedida. Previene la suspensión del sistema.`);
            }
        } catch (err) {
            console.warn('Wake Lock error:', err);
            this.logJournal(`[WakeLock] Error o permiso denegado: ${err.message}`);
        }
    }

    actualizarBotonWakeLock() {
        if (!this.dom.btnWakeLock) return;
        if (this.wakeLock) {
            this.dom.btnWakeLock.innerText = 'Pantalla Activa: ON';
            this.dom.btnWakeLock.style.background = 'rgba(8, 153, 129, 0.2)';
            this.dom.btnWakeLock.style.borderColor = '#089981';
            this.dom.btnWakeLock.style.color = '#089981';
        } else {
            this.dom.btnWakeLock.innerText = 'Pantalla Activa: OFF';
            this.dom.btnWakeLock.style.background = '#1e222d';
            this.dom.btnWakeLock.style.borderColor = '#2a2e39';
            this.dom.btnWakeLock.style.color = '#787b86';
        }
    }

    toggleModo247() {
        this.modo247 = !this.modo247;
        if (this.modo247) {
            if (this.dom.btnToggle247) {
                this.dom.btnToggle247.innerText = '24/7 Cloud: ON (Sincronizado)';
                this.dom.btnToggle247.style.background = 'rgba(8, 153, 129, 0.25)';
                this.dom.btnToggle247.style.borderColor = '#089981';
                this.dom.btnToggle247.style.color = '#089981';
            }
            this.logJournal(`[24/7] Modo 24/7 activado. Conectando con servidor y sincronizando estado...`);

            if (this.worker) {
                this.worker.postMessage({ type: 'START', intervalMs: 3000 });
            }

            if (typeof fetch !== 'undefined') {
                const bot = this.botsCatalog[this.selectedBotId];
                fetch('/api/mt5/daemon_configure', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        bot: bot,
                        symbols: this.basketSymbols,
                        riskMode: this.challengeConfig.riskMode,
                        riskValue: this.challengeConfig.riskValue,
                        tier: this.challengeConfig.tier
                    })
                }).then(() => {
                    return fetch('/api/mt5/daemon_control', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'START' })
                    });
                }).then(() => {
                    this.sincronizarConServidor();
                }).catch(err => {
                    this.logJournal(`[24/7 Warning] Servidor no respondió: ${err.message}. Operando con emulador local.`);
                });
            }

            if (this.serverPollTimer) clearInterval(this.serverPollTimer);
            this.serverPollTimer = setInterval(() => {
                this.sincronizarConServidor();
            }, 3500);

            this.sincronizarConServidor();
        } else {
            if (this.serverPollTimer) {
                clearInterval(this.serverPollTimer);
                this.serverPollTimer = null;
            }
            if (this.dom.btnToggle247) {
                this.dom.btnToggle247.innerText = '24/7 Cloud: OFF (Local)';
                this.dom.btnToggle247.style.background = 'rgba(56, 136, 255, 0.15)';
                this.dom.btnToggle247.style.borderColor = '#3888ff';
                this.dom.btnToggle247.style.color = '#5b8cff';
            }
            this.logJournal(`[24/7] Modo 24/7 desconectado. Ejecución retornada al cliente local.`);
        }
    }

    async sincronizarConServidor() {
        if (typeof fetch === 'undefined') return;
        try {
            const resp = await fetch('/api/mt5/daemon_state');
            if (!resp.ok) return;
            const data = await resp.json();
            if (data && data.account) {
                this.account = Object.assign(this.account, data.account);
                if (Array.isArray(data.openPositions)) this.openPositions = data.openPositions;
                if (Array.isArray(data.closedPositions)) this.closedPositions = data.closedPositions;
                if (Array.isArray(data.equityHistory) && data.equityHistory.length > 0) this.equityHistory = data.equityHistory;
                if (data.assetMatrix) this.assetMatrix = data.assetMatrix;
                if (data.challengeConfig) this.challengeConfig = Object.assign(this.challengeConfig, data.challengeConfig);
                if (data.botsCatalog && typeof data.botsCatalog === 'object') {
                    Object.keys(data.botsCatalog).forEach(k => {
                        if (this.botsCatalog[k]) {
                            Object.assign(this.botsCatalog[k], data.botsCatalog[k]);
                        } else {
                            this.botsCatalog[k] = data.botsCatalog[k];
                        }
                    });
                }
                if (typeof data.isRunning === 'boolean') {
                    this.isRunning = data.isRunning;
                    this.actualizarBotonEjecucion();
                }
                this.actualizarUI();
                if (this.activeTab === 'mt5-tab-matrix') {
                    this.renderizarMatrizMultiActivo();
                } else if (this.activeTab === 'mt5-tab-fleet') {
                    this.renderizarFlotaBots();
                }
            }
        } catch (e) {
            // Silencioso en desconexión transitoria
        }
    }

    // =========================================================================
    // MOTOR DE EJECUCIÓN MQL5: ON_TICK & FORWARD TESTING EN TIEMPO REAL
    // =========================================================================
    toggleEjecucionBot() {
        this.isRunning = !this.isRunning;
        this.actualizarBotonEjecucion();

        if (this.isRunning) {
            this.logJournal(`[BotStarted] Bot activado para ejecución en vivo.`);
            if (this.multiAsset) {
                this.evaluarLogicaMultiActivo();
            } else {
                this.evaluarLogicaBot();
            }
            if (this.worker) {
                this.worker.postMessage({ type: 'START', intervalMs: 2500 });
            }
            if (this.modo247 && typeof fetch !== 'undefined') {
                fetch('/api/mt5/daemon_control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'START' })
                }).catch(() => {});
            }
        } else {
            this.logJournal(`[BotPaused] Bot pausado.`);
            if (!this.modo247 && this.worker) {
                this.worker.postMessage({ type: 'STOP' });
            }
            if (this.modo247 && typeof fetch !== 'undefined') {
                fetch('/api/mt5/daemon_control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'PAUSE' })
                }).catch(() => {});
            }
        }
        this.actualizarUI();
    }

    actualizarBotonEjecucion() {
        if (!this.dom.btnToggleRun) return;
        if (this.isRunning) {
            this.dom.btnToggleRun.innerHTML = 'Pausar Bot';
            this.dom.btnToggleRun.classList.remove('primary');
            this.dom.btnToggleRun.classList.add('secondary');
        } else {
            this.dom.btnToggleRun.innerHTML = 'Iniciar Bot en Vivo';
            this.dom.btnToggleRun.classList.add('primary');
            this.dom.btnToggleRun.classList.remove('secondary');
        }
    }

    onTick(liveCandle) {
        if (!liveCandle) return;

        // Reset diario de Equidad a las 00:00 GMT (Regla estricta Prop Firm)
        const candleSec = liveCandle.time > 1e11 ? Math.floor(liveCandle.time / 1000) : liveCandle.time;
        const candleDay = Math.floor(candleSec / 86400);
        const lastDay = Math.floor(this.account.lastDayResetTimestamp / 86400);
        if (candleDay > lastDay) {
            this.account.dayStartEquity = this.account.equity;
            this.account.lastDayResetTimestamp = candleSec;
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
            this.evaluarLogicaFlota();
        }

        // 3. Evaluar reglas de cumplimiento de cuenta fondeada
        this.evaluarReglasPropFirm();

        // 4. Actualizar visuales y terminal
        this.actualizarUI();
    }

    procesarTicksEnPosiciones(candle) {
        const candleSym = candle.symbol || this.symbol;
        const curPrice = candle.close;
        let floatingSum = 0;

        for (let i = this.openPositions.length - 1; i >= 0; i--) {
            const pos = this.openPositions[i];
            
            // En carteras multi-activo, actualizar la posición solo con ticks de su símbolo correspondiente
            if (pos.symbol && pos.symbol !== candleSym) {
                floatingSum += (pos.profit || 0);
                continue;
            }

            const spec = this.symbolSpecs[pos.symbol] || this.symbolSpecs[this.symbol] || { contractSize: 1, pointVal: 1, spread: 1.0, digits: 2 };
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

            // Trailing Stop dinámico por bot (Magic Number)
            const bot = Object.values(this.botsCatalog).find(b => b.magic === pos.magic) || this.botsCatalog[this.selectedBotId];
            if (bot && bot.params && bot.params.useTrailing && pos.profit > 0) {
                const trailDist = (pos.openPrice * 0.015); // 1.5% o trailing ATR
                if (isBuy) {
                    const newSL = curPrice - trailDist;
                    if (newSL > (pos.sl || 0) && newSL > pos.openPrice) {
                        pos.sl = parseFloat(newSL.toFixed(spec.digits));
                        this.logJournal(`[TrailingStop] Ticket #${pos.ticket} (${bot.name}) SL ajustado a ${pos.sl}`);
                    }
                } else {
                    const newSL = curPrice + trailDist;
                    if ((pos.sl === 0 || newSL < pos.sl) && newSL < pos.openPrice) {
                        pos.sl = parseFloat(newSL.toFixed(spec.digits));
                        this.logJournal(`[TrailingStop] Ticket #${pos.ticket} (${bot.name}) SL ajustado a ${pos.sl}`);
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
        if (this.account.balance <= 0 || this.account.equity <= 0) return 0;
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

    calcularLotajeSeguroParaSimbolo(symbol, entryPrice, slPrice) {
        if (this.account.balance <= 0 || this.account.equity <= 0) return 0;
        const spec = this.symbolSpecs[symbol] || { contractSize: 1, pointVal: 1, digits: 2 };

        if (this.challengeConfig.riskMode === 'LOTS') {
            const fixedLots = Math.max(0.01, parseFloat(this.challengeConfig.riskValue) || 0.10);
            return Math.min(50.0, Math.round(fixedLots * 100) / 100);
        }

        const count = (this.basketSymbols && this.basketSymbols.length > 0) ? this.basketSymbols.length : 1;
        const riskPct = (this.challengeConfig.riskValue || 1.0) / count;
        const riskUSD = (riskPct / 100) * this.account.balance;
        const slDist = Math.abs(entryPrice - slPrice);

        if (slDist <= 0) return 0.10;

        let lots = riskUSD / (slDist * spec.pointVal);
        lots = Math.max(0.01, Math.min(20.0, Math.round(lots * 100) / 100));
        return lots;
    }

    evaluarLogicaMultiActivo() {
        const bot = this.botsCatalog[this.selectedBotId];
        const symbols = this.basketSymbols || ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XAUUSD', 'EURUSD'];
        
        symbols.forEach(sym => {
            let candles = this.multiAssetCandles[sym];
            if (!candles || candles.length < 30) {
                candles = this.generarVelasFallback(sym, 100);
                this.multiAssetCandles[sym] = candles;
            } else {
                const last = candles[candles.length - 1];
                const delta = (Math.random() - 0.49) * (last.close * 0.001);
                const newPrice = last.close + delta;
                const spec = this.symbolSpecs[sym] || { digits: 2 };
                last.close = parseFloat(newPrice.toFixed(spec.digits));
                last.high = Math.max(last.high, last.close);
                last.low = Math.min(last.low, last.close);
            }

            const curBar = candles[candles.length - 1];
            const lastBar = candles[candles.length - 2];
            const curPrice = curBar.close;
            const atr = this.calcularATR(candles, 14);

            const period = (bot && bot.params && bot.params.donchianPeriod) ? bot.params.donchianPeriod : 20;
            const lookback = candles.slice(-period - 2, -2);
            let signal = 'NEUTRAL';
            let slPrice = 0;
            let tpPrice = 0;

            if (lookback.length >= period) {
                const maxHigh = Math.max(...lookback.map(c => c.high));
                const minLow = Math.min(...lookback.map(c => c.low));
                const slAtrMult = (bot && bot.params && bot.params.slAtrMult) || 1.5;
                const tpAtrMult = (bot && bot.params && bot.params.tpAtrMult) || 3.0;

                if (curBar.high >= maxHigh && curBar.close > lastBar.close) {
                    signal = 'BUY';
                    slPrice = curPrice - (atr * slAtrMult);
                    tpPrice = curPrice + (atr * tpAtrMult);
                } else if (curBar.low <= minLow && curBar.close < lastBar.close) {
                    signal = 'SELL';
                    slPrice = curPrice - (atr * slAtrMult);
                    tpPrice = curPrice - (atr * tpAtrMult);
                }
            }

            const openPosForSym = this.openPositions.filter(p => p.symbol === sym);
            const openOrdersCount = openPosForSym.length;
            const floatingPnL = openPosForSym.reduce((acc, p) => acc + (p.profit || 0), 0);

            this.assetMatrix[sym] = {
                symbol: sym,
                price: curPrice,
                atr: atr,
                signal: signal,
                openOrdersCount: openOrdersCount,
                floatingPnL: floatingPnL,
                lastUpdate: Date.now()
            };

            // Ejecutar orden si el bot está corriendo en local, no en 24/7 cloud (que lo corre el servidor)
            if (this.isRunning && this.account.status === 'ACTIVE' && !this.modo247) {
                if (openOrdersCount === 0 && this.openPositions.length < 5 && signal !== 'NEUTRAL') {
                    const lots = this.calcularLotajeSeguroParaSimbolo(sym, curPrice, slPrice);
                    this.orderSend(sym, signal, lots, curPrice, slPrice, tpPrice, `[MultiAsset ${sym}] Signal`);
                }
            }
        });

        if (this.dom && this.dom.matrixCount) {
            this.dom.matrixCount.innerText = `${symbols.length} activos`;
        }

        if (this.activeTab === 'mt5-tab-matrix') {
            this.renderizarMatrizMultiActivo();
        }
    }

    async ejecutarOrdenManualEnSimbolo(sym, tipo) {
        if (this.account.status === 'VIOLATED') {
            if (typeof alert !== 'undefined') alert("No es posible operar: La cuenta ha sido reprobada por exceder los límites de riesgo del Prop Firm.");
            return;
        }

        if (this.modo247 && typeof fetch !== 'undefined') {
            try {
                const curPrice = this.assetMatrix[sym]?.price || (this.multiAssetCandles[sym]?.slice(-1)[0]?.close || 100);
                const atr = this.assetMatrix[sym]?.atr || 10;
                const isBuy = tipo === 'BUY';
                const sl = isBuy ? (curPrice - atr * 1.5) : (curPrice + atr * 1.5);
                const tp = isBuy ? (curPrice + atr * 3.0) : (curPrice - atr * 3.0);
                const lots = this.calcularLotajeSeguroParaSimbolo(sym, curPrice, sl);

                const resp = await fetch('/api/mt5/manual_order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        symbol: sym,
                        type: tipo,
                        lots: lots,
                        price: curPrice,
                        sl: sl,
                        tp: tp
                    })
                });
                const resData = await resp.json();
                if (resData.success) {
                    this.logJournal(`[24/7 ManualTrade] Orden #${resData.ticket} ${tipo} ${lots} lotes enviada al daemon para ${sym}.`);
                    this.sincronizarConServidor();
                } else {
                    if (typeof alert !== 'undefined') alert(`Error abriendo orden: ${resData.error}`);
                }
            } catch (err) {
                if (typeof alert !== 'undefined') alert(`Error comunicando con servidor 24/7: ${err.message}`);
            }
            return;
        }

        // Operativa local
        let candles = this.multiAssetCandles[sym] || (this.symbol === sym ? this.currentCandles : null);
        if (!candles || candles.length === 0) {
            candles = this.generarVelasFallback(sym, 100);
            this.multiAssetCandles[sym] = candles;
        }

        const curPrice = candles[candles.length - 1].close;
        const atr = this.calcularATR(candles, 14);
        const isBuy = tipo === 'BUY';
        const slPrice = isBuy ? (curPrice - (atr * 1.5)) : (curPrice + (atr * 1.5));
        const tpPrice = isBuy ? (curPrice + (atr * 3.0)) : (curPrice - (atr * 3.0));

        const lots = this.calcularLotajeSeguroParaSimbolo(sym, curPrice, slPrice);
        const ticket = this.orderSend(sym, tipo, lots, curPrice, slPrice, tpPrice, `Manual Matrix ${sym}`);
        if (ticket) {
            this.logJournal(`[ManualTrade] Orden #${ticket} ${tipo} ${lots} lotes abierta manualmente en ${sym}.`);
            this.evaluarLogicaMultiActivo();
        }
    }

    // =========================================================================
    // MQL5 API VIRTUAL: OrderSend, PositionClose, OrderModify
    // =========================================================================
    orderSend(symbol, type, lots, price, sl, tp, comment = '', magic = null, botName = null) {
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
        const effectiveMagic = magic !== null && magic !== undefined ? magic : (this.magicNumber || 8801);
        const effectiveBotName = botName || this.botsCatalog[this.selectedBotId]?.name || 'EA Bot';

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
            magic: effectiveMagic,
            botName: effectiveBotName
        };

        this.openPositions.push(position);
        this.account.margin += requiredMargin;
        this.account.freeMargin = this.account.equity - this.account.margin;

        this.logJournal(`[OrderSend SUCCESS] Ticket #${ticket} [Magic #${effectiveMagic} | ${effectiveBotName}] ${type} ${lots.toFixed(2)} lots ${symbol} @ ${execPrice.toFixed(spec.digits)} | SL: ${position.sl} TP: ${position.tp}`);
        
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
            reason: exitReason,
            magic: pos.magic || 8801,
            botName: pos.botName || 'EA Bot'
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
            this.dom.btnToggleRun.innerHTML = 'Iniciar Bot en Vivo';
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
        this.actualizarBadgeFlota();
        if (this.activeTab === 'mt5-tab-equity') {
            this.renderizarCurvaEquidad();
        } else if (this.activeTab === 'mt5-tab-stats') {
            this.renderizarEstadisticas();
        } else if (this.activeTab === 'mt5-tab-matrix') {
            this.renderizarMatrizMultiActivo();
        } else if (this.activeTab === 'mt5-tab-fleet') {
            this.renderizarFlotaBots();
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
                <tr><td colspan="13" style="text-align:center; padding:24px; color:#787b86;">
                    Sin órdenes abiertas en el mercado. ${this.isRunning ? 'Bot en espera de señal...' : 'Pulse "▶ Iniciar Bot en Vivo" para comenzar.'}
                </td></tr>
            `;
            return;
        }

        this.dom.tablePositions.innerHTML = this.openPositions.map(p => {
            const isBuy = p.type === 'BUY';
            const pnlCls = p.profit >= 0 ? 'pnl-pos' : 'pnl-neg';
            const botLabel = p.botName ? `<span style="font-weight:bold; color:#5b8cff;">${p.botName}</span><br><span style="font-size:10px; color:#787b86;">Magic: #${p.magic || '--'}</span>` : `<span style="color:#787b86;">Magic #${p.magic || '--'}</span>`;
            return `
                <tr>
                    <td style="font-family:monospace; font-weight:bold;">#${p.ticket}</td>
                    <td style="color:#787b86;">${new Date(p.time * 1000).toLocaleTimeString()}</td>
                    <td style="font-size:11px; line-height:1.2;">${botLabel}</td>
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
                        <button class="mt5-btn-close" onclick="window.MT5Emulator.cerrarPosicion(${p.ticket}, null, 'Cierre Manual')">Cerrar</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    renderizarTablaHistorial() {
        if (!this.dom.tableHistory) return;
        if (this.closedPositions.length === 0) {
            this.dom.tableHistory.innerHTML = `
                <tr><td colspan="11" style="text-align:center; padding:24px; color:#787b86;">
                    Sin historial de operaciones en esta sesión.
                </td></tr>
            `;
            return;
        }

        this.dom.tableHistory.innerHTML = this.closedPositions.map(p => {
            const isBuy = p.type === 'BUY';
            const pnlCls = p.profit >= 0 ? 'pnl-pos' : 'pnl-neg';
            const botLabel = p.botName ? `<span style="font-weight:bold; color:#5b8cff;">${p.botName}</span><br><span style="font-size:10px; color:#787b86;">Magic: #${p.magic || '--'}</span>` : `<span style="color:#787b86;">Magic #${p.magic || '--'}</span>`;
            return `
                <tr>
                    <td style="font-family:monospace;">#${p.ticket}</td>
                    <td style="color:#787b86;">${new Date(p.closeTime * 1000).toLocaleTimeString()}</td>
                    <td style="font-size:11px; line-height:1.2;">${botLabel}</td>
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

    renderizarMatrizMultiActivo() {
        if (!this.dom.tableMatrixBody) return;
        const symbols = this.basketSymbols || ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XAUUSD', 'EURUSD'];
        
        if (this.dom.matrixCount) {
            this.dom.matrixCount.innerText = `${symbols.length} activos`;
        }

        if (symbols.length === 0) {
            this.dom.tableMatrixBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#787b86;">No hay activos configurados en la cesta.</td></tr>`;
            return;
        }

        this.dom.tableMatrixBody.innerHTML = symbols.map(sym => {
            const data = this.assetMatrix[sym] || {};
            const spec = this.symbolSpecs[sym] || { digits: 2 };
            const price = data.price !== undefined ? data.price : (this.multiAssetCandles[sym]?.slice(-1)[0]?.close || 0);
            const atr = data.atr !== undefined ? data.atr : 0;
            const signal = data.signal || 'ESPERA';
            const openOrders = data.openOrdersCount !== undefined ? data.openOrdersCount : this.openPositions.filter(p => p.symbol === sym).length;
            const pnl = data.floatingPnL !== undefined ? data.floatingPnL : this.openPositions.filter(p => p.symbol === sym).reduce((acc, p) => acc + (p.profit || 0), 0);
            const timeStr = data.lastUpdate ? new Date(data.lastUpdate).toLocaleTimeString() : '--:--:--';

            let sigBadge = `<span class="mt5-tag" style="background: rgba(120, 123, 134, 0.2); color:#787b86;">⏸ ESPERA</span>`;
            if (signal === 'BUY') sigBadge = `<span class="mt5-tag buy">▲ BUY</span>`;
            else if (signal === 'SELL') sigBadge = `<span class="mt5-tag sell">▼ SELL</span>`;

            const pnlCls = pnl > 0 ? 'pnl-pos' : (pnl < 0 ? 'pnl-neg' : '');
            const pnlStr = pnl !== 0 ? `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : '$0.00';

            return `
                <tr>
                    <td style="font-weight:bold; color:#fff;">
                        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${openOrders > 0 ? '#089981' : '#3888ff'}; margin-right:6px;"></span>
                        ${sym}
                    </td>
                    <td style="font-family:monospace; font-weight:bold;">$${price.toFixed(spec.digits)}</td>
                    <td style="color:#787b86;">${atr.toFixed(spec.digits)}</td>
                    <td>${sigBadge}</td>
                    <td style="font-weight:bold; text-align:center;">${openOrders > 0 ? `<strong style="color:#3888ff;">${openOrders}</strong>` : '0'}</td>
                    <td class="${pnlCls}" style="font-weight:bold;">${pnlStr}</td>
                    <td style="color:#787b86; font-size:11px;">${timeStr}</td>
                    <td>
                        <div style="display:flex; gap:4px;">
                            <button class="mt5-btn-close" style="background:#1e222d; color:#5b8cff; border:1px solid #2a2e39;" onclick="window.MT5Emulator.cambiarSimboloActivo('${sym}')" title="Ver gráfico de ${sym}">Gráfico</button>
                            <button class="mt5-btn-close" style="background:rgba(8, 153, 129, 0.2); color:#089981; border:1px solid #089981; padding:2px 6px;" onclick="window.MT5Emulator.ejecutarOrdenManualEnSimbolo('${sym}', 'BUY')" title="Comprar ${sym}">+B</button>
                            <button class="mt5-btn-close" style="background:rgba(242, 54, 69, 0.2); color:#f23645; border:1px solid #f23645; padding:2px 6px;" onclick="window.MT5Emulator.ejecutarOrdenManualEnSimbolo('${sym}', 'SELL')" title="Vender ${sym}">-S</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    cambiarSimboloActivo(sym) {
        if (!sym) return;
        this.symbol = sym;
        if (this.dom.symbolSelect) this.dom.symbolSelect.value = sym;
        this.currentCandles = [];
        this.cargarVelasYActualizar();
        this.logJournal(`[SymbolSelect] Vista principal de gráfico cambiada a ${sym}.`);
    }

    // =========================================================================
    // FLOTA MULTI-BOT CONCURRENTE (MULTI-EA FLEET MANAGEMENT)
    // =========================================================================
    actualizarBadgeFlota() {
        const bots = Object.values(this.botsCatalog);
        const activeCount = bots.filter(b => b.enabled !== false).length;
        const totalFloatingPnL = this.openPositions.reduce((acc, p) => acc + (p.profit || 0), 0);

        if (this.dom.badgeFleet) {
            this.dom.badgeFleet.innerText = `🤖 Flota: ${activeCount}/${bots.length} Bots Activos`;
            this.dom.badgeFleet.style.color = activeCount > 0 ? '#3888ff' : '#787b86';
        }
        if (this.dom.fleetCount) {
            this.dom.fleetCount.innerText = `${activeCount} de ${bots.length} bots activos`;
        }
        if (this.dom.fleetTotalPnL) {
            this.dom.fleetTotalPnL.innerText = `${totalFloatingPnL >= 0 ? '+' : ''}$${totalFloatingPnL.toFixed(2)}`;
            this.dom.fleetTotalPnL.style.color = totalFloatingPnL >= 0 ? '#089981' : '#f23645';
        }
    }

    renderizarFlotaBots() {
        if (!this.dom.tableFleetBody) return;
        this.actualizarBadgeFlota();
        const bots = Object.values(this.botsCatalog);

        if (bots.length === 0) {
            this.dom.tableFleetBody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:#787b86;">No hay bots registrados en la flota.</td></tr>`;
            return;
        }

        this.dom.tableFleetBody.innerHTML = bots.map(bot => {
            const isEnabled = bot.enabled !== false;
            const magic = bot.magic || 8801;
            const openOrders = this.openPositions.filter(p => p.magic === magic);
            const closedOrders = this.closedPositions.filter(p => p.magic === magic);
            
            const openCount = openOrders.length;
            const floatingPnL = openOrders.reduce((acc, p) => acc + (p.profit || 0), 0);
            
            let wins = 0;
            let netPnL = 0;
            closedOrders.forEach(p => {
                netPnL += p.profit;
                if (p.profit > 0) wins++;
            });
            const tradesCount = closedOrders.length;
            const winRate = tradesCount > 0 ? ((wins / tradesCount) * 100).toFixed(1) : '0.0';

            const syms = Array.isArray(bot.symbols) && bot.symbols.length > 0 ? bot.symbols : [bot.symbol || 'BTC-USD'];
            const symBadges = syms.map(s => `<span class="mt5-tag" style="background:rgba(41,98,255,0.15); color:#5b8cff; font-size:10px; margin-right:2px;">${s}</span>`).join(' ');

            const pnlCls = floatingPnL > 0 ? 'pnl-pos' : (floatingPnL < 0 ? 'pnl-neg' : '');
            const pnlStr = floatingPnL !== 0 ? `${floatingPnL >= 0 ? '+' : ''}$${floatingPnL.toFixed(2)}` : '$0.00';
            const netPnLCls = netPnL > 0 ? 'pnl-pos' : (netPnL < 0 ? 'pnl-neg' : '');
            const netPnLStr = `${netPnL >= 0 ? '+' : ''}$${netPnL.toFixed(2)}`;

            const riskMode = bot.riskMode || 'LOTS';
            const riskValue = bot.riskValue !== undefined ? bot.riskValue : (riskMode === 'LOTS' ? 0.10 : 1.0);

            const statusBadge = isEnabled
                ? `<span class="mt5-tag buy" style="cursor:pointer;" onclick="window.MT5Emulator.toggleBotEnFlota('${bot.id}', false)">🟢 ON</span>`
                : `<span class="mt5-tag" style="background:#2a2e39; color:#787b86; cursor:pointer;" onclick="window.MT5Emulator.toggleBotEnFlota('${bot.id}', true)">⏸ OFF</span>`;

            return `
                <tr style="background: ${isEnabled ? 'transparent' : 'rgba(255,255,255,0.01)'}; opacity: ${isEnabled ? '1' : '0.75'};">
                    <td>${statusBadge}</td>
                    <td>
                        <div style="font-weight:bold; color:#fff;">${bot.name}</div>
                        <div style="font-size:11px; color:#787b86;">${bot.description ? bot.description.slice(0, 75) + '...' : (bot.strategyType || 'MQL5 EA')}</div>
                    </td>
                    <td style="font-family:monospace; font-weight:bold; color:#5b8cff;">#${magic}</td>
                    <td>${symBadges}</td>
                    <td>
                        <div style="display:flex; align-items:center; gap:4px;">
                            <select onchange="window.MT5Emulator.cambiarModoRiesgoBot('${bot.id}', this.value)" style="background:#131722; border:1px solid #2a2e39; color:#fff; font-size:10px; padding:2px 4px; border-radius:3px;">
                                <option value="LOTS" ${riskMode === 'LOTS' ? 'selected' : ''}>Lotes Fijos</option>
                                <option value="PCT" ${riskMode === 'PCT' ? 'selected' : ''}>% Riesgo</option>
                            </select>
                            <input type="number" value="${riskValue}" step="${riskMode === 'LOTS' ? '0.01' : '0.1'}" min="${riskMode === 'LOTS' ? '0.01' : '0.1'}"
                                onchange="window.MT5Emulator.cambiarValorRiesgoBot('${bot.id}', this.value)"
                                style="background:#131722; border:1px solid #2a2e39; color:#fff; font-size:11px; width:52px; padding:2px 4px; border-radius:3px; text-align:right;">
                            <span style="font-size:10px; color:#787b86;">${riskMode === 'LOTS' ? 'Lt' : '%'}</span>
                        </div>
                    </td>
                    <td style="font-weight:bold; text-align:center;">
                        ${openCount > 0 ? `<strong style="color:#3888ff;">${openCount}</strong>` : '<span style="color:#787b86;">0</span>'}
                    </td>
                    <td class="${pnlCls}" style="font-weight:bold;">${pnlStr}</td>
                    <td style="font-size:11px;">
                        <span>Trades: <strong>${tradesCount}</strong></span> | 
                        <span>WR: <strong>${winRate}%</strong></span> | 
                        <span class="${netPnLCls}">PnL: <strong>${netPnLStr}</strong></span>
                    </td>
                    <td>
                        <div style="display:flex; gap:4px;">
                            <button class="mt5-btn-close" style="background:${isEnabled ? 'rgba(242,54,69,0.2)' : 'rgba(8,153,129,0.2)'}; color:${isEnabled ? '#f23645' : '#089981'}; border:1px solid ${isEnabled ? '#f23645' : '#089981'}; padding:3px 8px;"
                                onclick="window.MT5Emulator.toggleBotEnFlota('${bot.id}', ${!isEnabled})">
                                ${isEnabled ? 'Pausar' : 'Activar'}
                            </button>
                            <button class="mt5-btn-close" style="background:#1e222d; color:#5b8cff; border:1px solid #2a2e39; padding:3px 6px;"
                                onclick="window.MT5Emulator.seleccionarBot('${bot.id}')" title="Seleccionar y ver en gráfico principal">
                                Ver
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async toggleBotEnFlota(botId, enable) {
        if (!this.botsCatalog[botId]) return;
        this.botsCatalog[botId].enabled = !!enable;
        this.guardarBotsCustom();
        this.actualizarBadgeFlota();
        if (this.activeTab === 'mt5-tab-fleet') this.renderizarFlotaBots();

        this.logJournal(`[FleetToggle] Bot '${this.botsCatalog[botId].name}' ${enable ? 'ACTIVADO 🟢' : 'PAUSADO ⏸'}.`);

        if (typeof fetch !== 'undefined') {
            try {
                await fetch('/api/mt5/fleet_toggle_bot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        botId: botId,
                        enabled: !!enable,
                        riskMode: this.botsCatalog[botId].riskMode,
                        riskValue: this.botsCatalog[botId].riskValue
                    })
                });
            } catch (e) {}
        }
    }

    async iniciarTodaLaFlota() {
        Object.values(this.botsCatalog).forEach(b => {
            b.enabled = true;
        });
        this.guardarBotsCustom();
        this.isRunning = true;
        this.actualizarBotonEjecucion();
        this.actualizarBadgeFlota();
        if (this.activeTab === 'mt5-tab-fleet') this.renderizarFlotaBots();

        if (this.worker) {
            this.worker.postMessage({ type: 'START', intervalMs: 2500 });
        }

        this.logJournal(`[FleetControl] Toda la flota (${Object.keys(this.botsCatalog).length} bots) ha sido iniciada.`);

        if (typeof fetch !== 'undefined') {
            try {
                await fetch('/api/mt5/fleet_control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'START_ALL' })
                });
            } catch (e) {}
        }
    }

    async pausarTodaLaFlota() {
        Object.values(this.botsCatalog).forEach(b => {
            b.enabled = false;
        });
        this.guardarBotsCustom();
        this.actualizarBadgeFlota();
        if (this.activeTab === 'mt5-tab-fleet') this.renderizarFlotaBots();

        this.logJournal(`[FleetControl] Toda la flota de bots ha sido pausada.`);

        if (typeof fetch !== 'undefined') {
            try {
                await fetch('/api/mt5/fleet_control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'PAUSE_ALL' })
                });
            } catch (e) {}
        }
    }

    async cambiarModoRiesgoBot(botId, mode) {
        if (!this.botsCatalog[botId]) return;
        this.botsCatalog[botId].riskMode = mode;
        if (mode === 'LOTS' && (!this.botsCatalog[botId].riskValue || this.botsCatalog[botId].riskValue > 5)) {
            this.botsCatalog[botId].riskValue = 0.10;
        } else if (mode === 'PCT' && (!this.botsCatalog[botId].riskValue || this.botsCatalog[botId].riskValue < 0.1)) {
            this.botsCatalog[botId].riskValue = 1.0;
        }
        this.guardarBotsCustom();
        if (this.activeTab === 'mt5-tab-fleet') this.renderizarFlotaBots();

        if (typeof fetch !== 'undefined') {
            try {
                await fetch('/api/mt5/fleet_toggle_bot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        botId: botId,
                        enabled: this.botsCatalog[botId].enabled !== false,
                        riskMode: mode,
                        riskValue: this.botsCatalog[botId].riskValue
                    })
                });
            } catch (e) {}
        }
    }

    async cambiarValorRiesgoBot(botId, val) {
        if (!this.botsCatalog[botId]) return;
        const num = parseFloat(val);
        if (isNaN(num) || num <= 0) return;
        this.botsCatalog[botId].riskValue = num;
        this.guardarBotsCustom();

        if (typeof fetch !== 'undefined') {
            try {
                await fetch('/api/mt5/fleet_toggle_bot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        botId: botId,
                        enabled: this.botsCatalog[botId].enabled !== false,
                        riskMode: this.botsCatalog[botId].riskMode || 'LOTS',
                        riskValue: num
                    })
                });
            } catch (e) {}
        }
    }

    calcularLotajeParaBot(bot, sym, entryPrice, slPrice) {
        const spec = this.symbolSpecs[sym] || { contractSize: 1, pointVal: 1, digits: 2 };
        const riskMode = bot.riskMode || this.challengeConfig.riskMode || 'LOTS';
        const riskValue = bot.riskValue !== undefined ? bot.riskValue : (this.challengeConfig.riskValue || 0.10);

        if (riskMode === 'LOTS') {
            const fixedLots = Math.max(0.01, parseFloat(riskValue) || 0.10);
            return Math.min(20.0, Math.round(fixedLots * 100) / 100);
        }

        const symCount = (Array.isArray(bot.symbols) && bot.symbols.length > 0) ? bot.symbols.length : 1;
        const riskPct = (parseFloat(riskValue) || 1.0) / symCount;
        const riskUSD = (riskPct / 100) * this.account.balance;
        const slDist = Math.abs(entryPrice - slPrice);
        if (slDist <= 0) return 0.10;

        let lots = riskUSD / (slDist * spec.pointVal);
        lots = Math.max(0.01, Math.min(20.0, Math.round(lots * 100) / 100));
        return lots;
    }

    evaluarLogicaFlota() {
        if (!this.isRunning || this.account.status !== 'ACTIVE' || this.modo247) return;

        const activeBots = Object.values(this.botsCatalog).filter(b => b.enabled !== false);
        if (activeBots.length === 0) return;

        // Límite de órdenes concurrentes en cartera
        if (this.openPositions.length >= 10) return;

        activeBots.forEach(bot => {
            const symbols = Array.isArray(bot.symbols) && bot.symbols.length > 0 ? bot.symbols : [bot.symbol || 'BTC-USD'];
            symbols.forEach(sym => {
                // Verificar si ya tiene orden abierta en este activo para este bot
                const openForBotSym = this.openPositions.filter(p => p.symbol === sym && p.magic === bot.magic);
                if (openForBotSym.length >= (bot.maxOpenPerAsset || 1)) return;

                let candles = this.multiAssetCandles[sym] || (this.symbol === sym ? this.currentCandles : null);
                if (!candles || candles.length < 25) {
                    candles = this.generarVelasFallback(sym, 100);
                    this.multiAssetCandles[sym] = candles;
                }

                const curBar = candles[candles.length - 1];
                const lastBar = candles[candles.length - 2];
                const curPrice = curBar.close;
                const atr = this.calcularATR(candles, (bot.params && bot.params.atrPeriod) || 14);

                let signal = null;
                let slPrice = 0;
                let tpPrice = 0;

                const stratType = bot.strategyType || bot.id || 'donchian_breakout';

                if (stratType === 'donchian_breakout' || stratType === 'multiasset_champion' || stratType === 'gold_rush' || stratType === 'eurusd_vcp') {
                    const period = (bot.params && bot.params.donchianPeriod) || 20;
                    const lookback = candles.slice(-period - 2, -2);
                    if (lookback.length >= period) {
                        const maxH = Math.max(...lookback.map(c => c.high));
                        const minL = Math.min(...lookback.map(c => c.low));
                        const slMult = (bot.params && bot.params.slAtrMult) || 1.5;
                        const tpMult = (bot.params && bot.params.tpAtrMult) || 3.0;

                        if (curBar.high >= maxH && curBar.close > lastBar.close) {
                            signal = 'BUY';
                            slPrice = curPrice - (atr * slMult);
                            tpPrice = curPrice + (atr * tpMult);
                        } else if (curBar.low <= minL && curBar.close < lastBar.close) {
                            signal = 'SELL';
                            slPrice = curPrice - (atr * slMult);
                            tpPrice = curPrice - (atr * tpMult);
                        }
                    }
                } else if (stratType === 'vcp_squeeze' || stratType === 'btc_vcp') {
                    const emaPeriod = (bot.params && bot.params.emaPeriod) || 200;
                    const emaVal = this.calcularEMA(candles, emaPeriod);
                    const period = (bot.params && bot.params.donchianPeriod) || 20;
                    const lookback = candles.slice(-period - 2, -2);
                    if (lookback.length >= period) {
                        const maxH = Math.max(...lookback.map(c => c.high));
                        const minL = Math.min(...lookback.map(c => c.low));
                        const slMult = (bot.params && bot.params.slAtrMult) || 1.25;
                        const tpMult = (bot.params && bot.params.tpAtrMult) || 3.2;

                        if (curPrice > emaVal && curBar.high >= maxH) {
                            signal = 'BUY';
                            slPrice = curPrice - (atr * slMult);
                            tpPrice = curPrice + (atr * tpMult);
                        } else if (curPrice < emaVal && curBar.low <= minL) {
                            signal = 'SELL';
                            slPrice = curPrice - (atr * slMult);
                            tpPrice = curPrice - (atr * tpMult);
                        }
                    }
                } else if (stratType === 'sqz_momentum') {
                    const slPct = ((bot.params && bot.params.slPct) || 2.0) / 100;
                    const tpPct = ((bot.params && bot.params.tpPct) || 4.5) / 100;
                    const lookback = candles.slice(-22, -2);
                    if (lookback.length >= 20) {
                        const maxHigh = Math.max(...lookback.map(c => c.high));
                        const minLow = Math.min(...lookback.map(c => c.low));
                        if (curBar.close > maxHigh && curBar.close > lastBar.close) {
                            signal = 'BUY';
                            slPrice = curPrice * (1 - slPct);
                            tpPrice = curPrice * (1 + tpPct);
                        } else if (curBar.close < minLow && curBar.close < lastBar.close) {
                            signal = 'SELL';
                            slPrice = curPrice * (1 + slPct);
                            tpPrice = curPrice * (1 - tpPct);
                        }
                    }
                } else if (stratType === 'ema_cross' || stratType === 'cruce_ema') {
                    const fast = (bot.params && bot.params.fastPeriod) || 20;
                    const slow = (bot.params && bot.params.slowPeriod) || 50;
                    const emaFastCur = this.calcularEMA(candles, fast);
                    const emaSlowCur = this.calcularEMA(candles, slow);
                    const prevSlice = candles.slice(0, -1);
                    const emaFastPrev = this.calcularEMA(prevSlice, fast);
                    const emaSlowPrev = this.calcularEMA(prevSlice, slow);
                    const slMult = (bot.params && bot.params.slAtrMult) || 2.0;
                    const tpMult = (bot.params && bot.params.tpAtrMult) || 4.0;

                    if (emaFastPrev <= emaSlowPrev && emaFastCur > emaSlowCur) {
                        signal = 'BUY';
                        slPrice = curPrice - (atr * slMult);
                        tpPrice = curPrice + (atr * tpMult);
                    } else if (emaFastPrev >= emaSlowPrev && emaFastCur < emaSlowCur) {
                        signal = 'SELL';
                        slPrice = curPrice - (atr * slMult);
                        tpPrice = curPrice - (atr * tpMult);
                    }
                }

                if (signal) {
                    const lots = this.calcularLotajeParaBot(bot, sym, curPrice, slPrice);
                    this.orderSend(sym, signal, lots, curPrice, slPrice, tpPrice, `[${bot.name}] Signal`, bot.magic, bot.name);
                }
            });
        });
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
    window.mt5Emulator = window.MT5Emulator;
});
