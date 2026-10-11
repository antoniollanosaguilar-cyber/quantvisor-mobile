/**
 * QuantFactory / QuantVisor - Strategy Tester & Quantitative Backtesting Engine
 * Grado Institucional estilo TradingView Desktop
 * Compatible con Lightweight Charts v4
 */

class StrategyTester {
    constructor() {
        this.activeStrategyId = 'cruce_ema';
        this.customStrategies = new Map();
        this.lastBacktestResult = null;
        this.markersVisible = true;
        this.activeTab = 'tab-resumen';
        
        // Paginación del Trade Blotter
        this.blotterCurrentPage = 1;
        this.blotterPageSize = 25;
        this.blotterFilter = 'all'; // 'all', 'long', 'short', 'win', 'loss'
        this.blotterSearchTerm = '';

        // Charts secundarios para Tab 2 (Curva de Capital)
        this.equityChart = null;
        this.equitySeries = null;
        this.drawdownChart = null;
        this.drawdownSeries = null;

        // Gráfico Nuevo Dedicado Exclusivo para Backtesting (Pestaña Separada)
        this.backtestChart = null;
        this.backtestCandleSeries = null;
        this.currentCandles = [];

        // Estado del panel inferior
        this.isMaximized = false;
        this.isCollapsed = false;
        this.panelHeight = 340;

        // Soporte Multi-Activo y Datasets de Velas CSV
        this.csvDatasets = {}; // { 'XAUUSD': [...candles], 'BTC-USD': [...candles] }
        this.isMultiAsset = false;
        this.multiAssetSymbols = ['BTC-USD', 'ETH-USD', 'XAUUSD'];
        this.currentImportBot = null;

        // Propiedades de Ejecución por Defecto
        this.executionProps = {
            initialCapital: 10000,
            orderType: 'percent', // 'percent' o 'fixed'
            orderValue: 10,       // 10% del capital o 1000 USD
            commissionPct: 0.06,  // 0.06% por trade (estándar Binance/Bybit)
            slippageTicks: 1,     // 1 tick de deslizamiento
            spread: 0,            // Spread fijo adicional
            direction: 'both',    // 'both', 'long', 'short'
            exitMode: 'intrabar'  // 'intrabar' (SL/TP exacto) o 'bar_close'
        };

        // Estrategias Precargadas con Parámetros por Defecto
        this.preloadedStrategies = {
            cruce_ema: {
                id: 'cruce_ema',
                name: 'Cruce de Medias EMA (20/50)',
                category: 'Tendencial',
                description: 'Estrategia clásica de seguimiento de tendencia con cruce de EMA rápida sobre lenta y gestión de riesgo.',
                params: {
                    fastPeriod: 20,
                    slowPeriod: 50,
                    stopLossPct: 2.0,
                    takeProfitPct: 4.0,
                    useTrailing: false,
                    trailingPct: 1.5
                }
            },
            squeeze_momentum: {
                id: 'squeeze_momentum',
                name: 'Squeeze Momentum Breakout (SQZMOM)',
                category: 'Volatilidad & Momentum',
                description: 'Detecta fases de compresión (Bollinger dentro de Keltner) y dispara en la liberación direccional del momentum.',
                params: {
                    bbLength: 20,
                    bbMult: 2.0,
                    kcLength: 20,
                    kcMult: 1.5,
                    stopLossPct: 2.5,
                    takeProfitPct: 5.0
                }
            },
            rsi_reversion: {
                id: 'rsi_reversion',
                name: 'RSI Mean Reversion (14) + Filtro EMA 200',
                category: 'Reversión a la Media',
                description: 'Compra en sobreventa (<30) a favor de la tendencia macro (EMA 200) y vende en sobrecompra (>70).',
                params: {
                    period: 14,
                    oversold: 30,
                    overbought: 70,
                    filterEma: 200,
                    stopLossPct: 2.0,
                    takeProfitPct: 3.5
                }
            },
            macd_trend: {
                id: 'macd_trend',
                name: 'MACD Divergence & Signal Cross',
                category: 'Tendencial',
                description: 'Cruces de línea MACD y Señal con filtro de línea cero para confirmar impulso tendencial.',
                params: {
                    fastP: 12,
                    slowP: 26,
                    sigP: 9,
                    stopLossPct: 2.0,
                    takeProfitPct: 4.5
                }
            },
            donchian_breakout: {
                id: 'donchian_breakout',
                name: 'Canales Donchian (Sistema Tortuga 20/10)',
                category: 'Ruptura (Breakout)',
                description: 'Compra rupturas de máximos de 20 barras y sale en rupturas de mínimos de 10 barras con stop de volatilidad.',
                params: {
                    entryPeriod: 20,
                    exitPeriod: 10,
                    atrPeriod: 14,
                    atrStopMult: 2.0
                }
            },
            bollinger_bounce: {
                id: 'bollinger_bounce',
                name: 'Reversión en Bandas de Bollinger',
                category: 'Reversión a la Media',
                description: 'Rebotes en bandas extremas de Bollinger hacia la media móvil central de 20 periodos.',
                params: {
                    period: 20,
                    mult: 2.0,
                    stopLossPct: 2.0,
                    takeProfitPct: 3.0
                }
            },
            btc_vcp: {
                id: 'btc_vcp',
                name: 'Bitcoin VCP Squeeze & Expansion (Long-Only)',
                category: 'Institucional Crypto',
                description: 'Compresión extrema de Bandas de Bollinger (BBW < 0.045), filtro tendencial EMA 200 y ruptura expansiva Donchian(24).',
                params: {
                    emaPeriod: 200,
                    bbPeriod: 20,
                    bbMult: 2.0,
                    donchianPeriod: 24,
                    atrPeriod: 14,
                    stopLossAtr: 1.25,
                    takeProfitAtr: 3.0
                }
            },
            gold_ao: {
                id: 'gold_ao',
                name: 'Oro AO 24h Breakout',
                category: 'Institucional Metales',
                description: 'Cruce de línea cero de Awesome Oscillator respaldado por ruptura de canal Donchian de 24 periodos.',
                params: {
                    donchianPeriod: 24,
                    atrPeriod: 14,
                    stopLossAtr: 1.5,
                    takeProfitAtr: 2.5
                }
            },
            eurusd_vcp: {
                id: 'eurusd_vcp',
                name: 'EURUSD VCP Contraction Breakout',
                category: 'Institucional Forex',
                description: 'Contracción Donchian(10)/ATR con posterior ruptura direccional asimétrica.',
                params: {
                    donchianPeriod: 10,
                    atrPeriod: 14,
                    stopLossAtr: 1.0,
                    takeProfitAtr: 3.0
                }
            },
            gold_rush: {
                id: 'gold_rush',
                name: 'Hobbiecode Gold Rush Breakout (XAUUSD H1)',
                category: 'Institucional Metales',
                description: 'Estrategia auditada de cuentas fondeadas ($48k+ en retiros). Rotura de Gann High-Low(5) y Donchian(51), orden Buy Stop de 10 barras y salida temporal en 5 velas.',
                params: {
                    gannPeriod: 5,
                    donchianPeriod: 51,
                    donchianThresholdPct: 0.5,
                    orderExpiryBars: 10,
                    timeExitBars: 5,
                    atrPeriod: 14,
                    atrStopMult: 1.5,
                    filterSession: true,
                    sessionStart: 6,
                    sessionEnd: 19
                }
            }
        };

        // Guardar copia inmutable de parámetros originales para reset
        this.defaultStrategyParams = JSON.parse(JSON.stringify(this.preloadedStrategies));

        this.init();
    }

    init() {
        this.initDOM();
        this.initEventos();
        this.initResizer();
        this.poblarSelectoresEstrategia();
        this.renderizarFormularioPropiedades();
        console.log("⚡ Strategy Tester Inicializado con éxito.");
    }

    initDOM() {
        // Enlazar elementos del DOM
        this.dom = {
            workspace: document.getElementById('backtest-workspace'),
            panel: document.getElementById('strategy-tester-panel'),
            splitter: document.getElementById('tester-splitter'),
            tabBtns: document.querySelectorAll('.tester-tab-btn'),
            tabContents: document.querySelectorAll('.tester-tab-content'),
            selectStrategyTester: document.getElementById('tester-strategy-select'),
            selectStrategyTop: document.getElementById('top-strategy-select'),
            selectSymbol: document.getElementById('bt-symbol-select'),
            selectTf: document.getElementById('bt-tf-select'),
            chartArea: document.getElementById('backtest-chart-area'),
            backtestChartContainer: document.getElementById('backtest-chart-container'),
            btnRunBacktest: document.getElementById('btn-run-backtest'),
            btnToggleMarkers: document.getElementById('btn-tester-markers-toggle'),
            btnMaximize: document.getElementById('btn-tester-maximize'),
            btnClose: document.getElementById('btn-tester-close'),
            btnBottomTester: document.getElementById('btn-bottom-tab-tester'),
            btnTopTester: document.getElementById('btn-toggle-tester'),
            btnCargarEstrategia: document.getElementById('btn-cargar-estrategia'),
            strategyFileInput: document.getElementById('strategy-file-input'),
            strategyImportModal: document.getElementById('strategy-import-modal'),
            tradesCountBadge: document.getElementById('trades-count-badge'),
            
            // Tab 1 (Resumen)
            summaryGrid: document.getElementById('summary-kpi-grid'),
            detailsGrid: document.getElementById('summary-details-container'),
            
            // Tab 2 (Curva)
            equityChartContainer: document.getElementById('equity-chart-canvas'),
            drawdownChartContainer: document.getElementById('drawdown-chart-canvas'),
            
            // Tab 3 (Blotter)
            blotterTableBody: document.getElementById('blotter-table-body'),
            blotterSearch: document.getElementById('blotter-search-input'),
            blotterFilterPills: document.querySelectorAll('.filter-pill'),
            blotterPaginationInfo: document.getElementById('blotter-pagination-info'),
            blotterPaginationControls: document.getElementById('blotter-pagination-controls'),
            btnExportCsv: document.getElementById('btn-export-csv'),
            
            // Tab 4 (Propiedades)
            dynamicParamsContainer: document.getElementById('strategy-dynamic-params'),
            btnSaveProps: document.getElementById('btn-save-properties'),
            btnResetProps: document.getElementById('btn-reset-properties'),

            // Controles de Modo Mono / Multi-Activo
            btModeSelect: document.getElementById('bt-mode-select'),
            btSingleSymbolWrap: document.getElementById('bt-single-symbol-wrap'),
            btMultiSymbolWrap: document.getElementById('bt-multi-symbol-wrap'),
            btMultiSymbolsInput: document.getElementById('bt-multi-symbols-input'),
            btnBtCargarCsv: document.getElementById('btn-bt-cargar-csv'),
            btCsvBadge: document.getElementById('bt-csv-badge'),

            // Modal Carga Bot (.mq5 / .ex5 / .json)
            btDropzoneBot: document.getElementById('bt-dropzone-bot'),
            btImportStatus: document.getElementById('bt-import-status'),
            btnBtImportFromFleet: document.getElementById('btn-bt-import-from-fleet'),
            btImportName: document.getElementById('bt-import-name'),
            btImportMagic: document.getElementById('bt-import-magic'),
            btImportStrat: document.getElementById('bt-import-strat'),
            btImportSymbols: document.getElementById('bt-import-symbols'),
            btImportParamsGrid: document.getElementById('bt-import-params-grid'),
            strategyModalEditor: document.getElementById('strategy-modal-editor'),
            strategyModalFile: document.getElementById('strategy-modal-file'),
            btnStrategyImportApply: document.getElementById('btn-strategy-import-apply'),
            btnStrategyImportCancel: document.getElementById('btn-strategy-import-cancel'),

            // Modal Carga CSV / Carpeta
            btCsvModal: document.getElementById('bt-csv-modal'),
            modalCsvClose: document.getElementById('modal-csv-close'),
            btnCsvModalDone: document.getElementById('btn-csv-modal-done'),
            btCsvDropzone: document.getElementById('bt-csv-dropzone'),
            btCsvFileInput: document.getElementById('bt-csv-file-input'),
            btCsvFolderInput: document.getElementById('bt-csv-folder-input'),
            btnBtPickCsvFiles: document.getElementById('btn-bt-pick-csv-files'),
            btnBtPickCsvFolder: document.getElementById('btn-bt-pick-csv-folder'),
            btnBtAutoScanCsvs: document.getElementById('btn-bt-auto-scan-csvs'),
            btCsvStatus: document.getElementById('bt-csv-status'),
            btCsvTableBody: document.getElementById('bt-csv-table-body'),
            btnBtClearCsvs: document.getElementById('btn-bt-clear-csvs')
        };
    }

    initEventos() {
        // Pestañas
        if (this.dom.tabBtns) {
            this.dom.tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetTab = btn.getAttribute('data-tab');
                    this.cambiarPestaña(targetTab);
                });
            });
        }

        // Cambio de Estrategia
        const onStrategyChange = (e) => {
            const val = e.target.value;
            this.activeStrategyId = val;
            if (this.dom.selectStrategyTester) this.dom.selectStrategyTester.value = val;
            if (this.dom.selectStrategyTop) this.dom.selectStrategyTop.value = val;
            this.renderizarFormularioPropiedades();
            this.ejecutarBacktest();
        };

        if (this.dom.selectStrategyTester) this.dom.selectStrategyTester.addEventListener('change', onStrategyChange);
        if (this.dom.selectStrategyTop) this.dom.selectStrategyTop.addEventListener('change', onStrategyChange);

        // Botón Ejecutar Backtest
        if (this.dom.btnRunBacktest) {
            this.dom.btnRunBacktest.addEventListener('click', () => this.ejecutarBacktest());
        }

        // Cambio de Símbolo y Temporalidad en Backtester
        if (this.dom.selectSymbol) {
            this.dom.selectSymbol.addEventListener('change', () => {
                this.currentCandles = [];
                this.ejecutarBacktest();
            });
        }
        if (this.dom.selectTf) {
            this.dom.selectTf.addEventListener('change', () => {
                this.currentCandles = [];
                this.ejecutarBacktest();
            });
        }

        // Toggle Marcadores
        const toggleMarkersHandler = () => {
            this.markersVisible = !this.markersVisible;
            this.actualizarVisibilidadMarcadores();
        };
        if (this.dom.btnToggleMarkers) this.dom.btnToggleMarkers.addEventListener('click', toggleMarkersHandler);

        const btnBottomMarkers = document.getElementById('btn-bottom-toggle-markers');
        if (btnBottomMarkers) btnBottomMarkers.addEventListener('click', toggleMarkersHandler);
        
        const btnTopMarkers = document.getElementById('btn-toggle-markers-top');
        if (btnTopMarkers) btnTopMarkers.addEventListener('click', toggleMarkersHandler);

        // Control de Ventana / Acoplamiento del Panel
        if (this.dom.btnMaximize) {
            this.dom.btnMaximize.addEventListener('click', () => this.toggleMaximizar());
        }
        if (this.dom.btnClose) {
            this.dom.btnClose.addEventListener('click', () => this.toggleColapsar(true));
        }

        // Botones de Apertura / Toggle desde Barra Inferior y Superior
        const togglePanelHandler = () => {
            if (this.dom.panel.classList.contains('collapsed')) {
                this.toggleColapsar(false);
            } else {
                this.toggleColapsar(true);
            }
        };
        if (this.dom.btnBottomTester) this.dom.btnBottomTester.addEventListener('click', togglePanelHandler);
        if (this.dom.btnTopTester) this.dom.btnTopTester.addEventListener('click', togglePanelHandler);

        // Resizer / Splitter Dragging
        this.initResizer();

        // Filtros y Búsqueda del Trade Blotter
        if (this.dom.blotterFilterPills) {
            this.dom.blotterFilterPills.forEach(pill => {
                pill.addEventListener('click', () => {
                    this.dom.blotterFilterPills.forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    this.blotterFilter = pill.getAttribute('data-filter');
                    this.blotterCurrentPage = 1;
                    this.renderizarTradeBlotter();
                });
            });
        }

        if (this.dom.blotterSearch) {
            this.dom.blotterSearch.addEventListener('input', (e) => {
                this.blotterSearchTerm = e.target.value.toLowerCase().trim();
                this.blotterCurrentPage = 1;
                this.renderizarTradeBlotter();
            });
        }

        if (this.dom.btnExportCsv) {
            this.dom.btnExportCsv.addEventListener('click', () => this.exportarBlotterCSV());
        }

        // Guardar Propiedades
        if (this.dom.btnSaveProps) {
            this.dom.btnSaveProps.addEventListener('click', () => {
                this.guardarFormularioPropiedades();
                this.ejecutarBacktest();
            });
        }

        if (this.dom.btnResetProps) {
            this.dom.btnResetProps.addEventListener('click', () => {
                this.resetearPropiedadesPorDefecto();
                this.ejecutarBacktest();
            });
        }

        // Selector de Modo Mono / Multi-Activo
        if (this.dom.btModeSelect) {
            this.dom.btModeSelect.addEventListener('change', (e) => {
                const isMulti = e.target.value === 'multi';
                this.isMultiAsset = isMulti;
                if (this.dom.btSingleSymbolWrap) this.dom.btSingleSymbolWrap.style.display = isMulti ? 'none' : 'flex';
                if (this.dom.btMultiSymbolWrap) this.dom.btMultiSymbolWrap.style.display = isMulti ? 'flex' : 'none';
            });
        }

        // Cargar Bot / Estrategia (.mq5 / .ex5 / .json)
        if (this.dom.btnCargarEstrategia) {
            this.dom.btnCargarEstrategia.addEventListener('click', () => {
                if (this.dom.strategyImportModal) {
                    this.dom.strategyImportModal.style.display = 'flex';
                } else if (this.dom.strategyFileInput) {
                    this.dom.strategyFileInput.click();
                }
            });
        }

        if (this.dom.strategyFileInput) {
            this.dom.strategyFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.procesarArchivoBot(file);
            });
        }

        // Modal de Importación de Bot (.mq5 / .ex5 / .json)
        this.initModalImportacion();

        // Modal de Carga de Datos Históricos CSV / Carpeta
        this.initModalCSV();
    }

    initResizer() {
        if (!this.dom.splitter || !this.dom.panel) return;
        let isDragging = false;
        let startY = 0;
        let startH = 340;

        this.dom.splitter.addEventListener('mousedown', (e) => {
            isDragging = true;
            startY = e.clientY;
            startH = this.dom.panel.clientHeight;
            this.dom.splitter.classList.add('dragging');
            this.dom.panel.classList.add('resizing');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const delta = startY - e.clientY;
            let newH = startH + delta;
            const maxH = window.innerHeight * 0.85;
            if (newH < 160) newH = 160;
            if (newH > maxH) newH = maxH;
            
            this.panelHeight = newH;
            this.dom.panel.style.height = `${newH}px`;
            
            if (window.resizeGraficos) window.resizeGraficos();
            this.resizeCharts();
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                this.dom.splitter.classList.remove('dragging');
                this.dom.panel.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                if (window.resizeGraficos) window.resizeGraficos();
                this.resizeCharts();
            }
        });
    }

    toggleMaximizar() {
        this.isMaximized = !this.isMaximized;
        if (this.isMaximized) {
            this.dom.panel.classList.add('maximized');
            if (this.dom.btnMaximize) this.dom.btnMaximize.innerHTML = '🗗';
        } else {
            this.dom.panel.classList.remove('maximized');
            this.dom.panel.style.height = `${this.panelHeight}px`;
            if (this.dom.btnMaximize) this.dom.btnMaximize.innerHTML = '🗖';
        }
        if (window.resizeGraficos) window.resizeGraficos();
        this.resizeCharts();
    }

    toggleColapsar(forzarCerrar = false) {
        if (forzarCerrar || !this.dom.panel.classList.contains('collapsed')) {
            this.dom.panel.classList.add('collapsed');
            if (this.dom.splitter) this.dom.splitter.style.display = 'none';
            if (this.dom.btnBottomTester) this.dom.btnBottomTester.classList.remove('active-tab');
            if (this.dom.btnTopTester) this.dom.btnTopTester.classList.remove('active');
        } else {
            this.dom.panel.classList.remove('collapsed');
            if (this.dom.splitter) this.dom.splitter.style.display = 'block';
            if (this.dom.btnBottomTester) this.dom.btnBottomTester.classList.add('active-tab');
            if (this.dom.btnTopTester) this.dom.btnTopTester.classList.add('active');
        }
        if (window.resizeGraficos) window.resizeGraficos();
        this.resizeCharts();
    }

    cambiarPestaña(tabId) {
        this.activeTab = tabId;
        if (this.dom.tabBtns) {
            this.dom.tabBtns.forEach(btn => {
                if (btn.getAttribute('data-tab') === tabId) btn.classList.add('active');
                else btn.classList.remove('active');
            });
        }
        if (this.dom.tabContents) {
            this.dom.tabContents.forEach(pane => {
                if (pane.id === tabId) pane.classList.add('active');
                else pane.classList.remove('active');
            });
        }

        if (tabId === 'tab-curva') {
            // Renderizar / redimensionar gráficos de curva de capital y drawdown
            setTimeout(() => this.garantizarChartsCurvaCapital(), 50);
        } else if (tabId === 'tab-operaciones') {
            this.renderizarTradeBlotter();
        }
    }

    poblarSelectoresEstrategia() {
        const fleetBots = (window.MT5Emulator && window.MT5Emulator.botsCatalog) ? window.MT5Emulator.botsCatalog : {};
        const todas = { ...this.preloadedStrategies };

        // Incluir bots de la flota de MT5
        Object.values(fleetBots).forEach(b => {
            if (b && b.id) {
                todas[b.id] = {
                    id: b.id,
                    name: `🤖 [MT5] ${b.name}`,
                    category: b.multiAsset ? 'Multi-Activo 24/7' : 'Flota MT5',
                    description: b.description || `Bot MT5 (${b.strategyType})`,
                    strategyType: b.strategyType || 'donchian_breakout',
                    multiAsset: b.multiAsset,
                    symbols: b.symbols,
                    magic: b.magic,
                    params: b.params || {}
                };
            }
        });

        // Incluir bots cargados personalizados en backtest
        this.customStrategies.forEach((b, id) => {
            todas[id] = b;
        });

        const opciones = Object.values(todas).map(strat => 
            `<option value="${strat.id}">${strat.name} [${strat.category}]</option>`
        ).join('');

        if (this.dom.selectStrategyTester) this.dom.selectStrategyTester.innerHTML = opciones;
        if (this.dom.selectStrategyTop) this.dom.selectStrategyTop.innerHTML = opciones;
        
        if (this.dom.selectStrategyTester) this.dom.selectStrategyTester.value = this.activeStrategyId;
        if (this.dom.selectStrategyTop) this.dom.selectStrategyTop.value = this.activeStrategyId;

        // Poblar selector de símbolos del backtester (combinando por defecto + datasets CSV cargados)
        if (this.dom.selectSymbol) {
            const currentVal = this.dom.selectSymbol.value;
            const baseSyms = [
                { s: 'BTC-USD', n: 'Bitcoin' },
                { s: 'ETH-USD', n: 'Ethereum' },
                { s: 'SOL-USD', n: 'Solana' },
                { s: 'XAUUSD', n: 'Oro Spot' },
                { s: 'NASDAQ', n: 'Nasdaq 100' },
                { s: 'SP500', n: 'S&P 500' },
                { s: 'EURUSD', n: 'Euro / Dólar' },
                { s: 'NVDA', n: 'NVIDIA' },
                { s: 'AAPL', n: 'Apple' },
                { s: 'TSLA', n: 'Tesla' }
            ];

            const csvSyms = Object.keys(this.csvDatasets).map(s => ({
                s: s,
                n: `CSV: ${this.csvDatasets[s].length} velas`,
                isCsv: true
            }));

            const combined = [...csvSyms, ...baseSyms.filter(b => !this.csvDatasets[b.s])];
            this.dom.selectSymbol.innerHTML = combined.map(x => 
                `<option value="${x.s}">${x.isCsv ? '📊 ' : ''}${x.s} (${x.n})</option>`
            ).join('');

            if (currentVal && combined.some(x => x.s === currentVal)) {
                this.dom.selectSymbol.value = currentVal;
            } else if (window.currentSymbol && combined.some(x => x.s === window.currentSymbol)) {
                this.dom.selectSymbol.value = window.currentSymbol;
            }
        }
    }

    garantizarBacktestChart() {
        const container = document.getElementById('backtest-chart-container');
        if (!container || !window.LightweightCharts) return;

        if (!this.backtestChart) {
            const w = container.clientWidth > 0 ? container.clientWidth : 800;
            const h = container.clientHeight > 0 ? container.clientHeight : 350;

            this.backtestChart = LightweightCharts.createChart(container, {
                width: w,
                height: h,
                layout: {
                    background: { type: 'solid', color: '#131722' },
                    textColor: '#d1d4dc',
                    fontSize: 11,
                    fontFamily: '-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif',
                },
                grid: {
                    vertLines: { color: '#1a1e29' },
                    horzLines: { color: '#1a1e29' }
                },
                crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
                rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.1, bottom: 0.2 } },
                timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false, rightOffset: 15 }
            });

            this.backtestCandleSeries = this.backtestChart.addCandlestickSeries({
                upColor: '#089981',
                downColor: '#f23645',
                borderVisible: false,
                wickUpColor: '#089981',
                wickDownColor: '#f23645'
            });

            this.backtestChart.subscribeCrosshairMove(param => {
                const legEl = document.getElementById('backtest-chart-legend');
                if (!legEl) return;
                const strat = this.getEstrategiaActiva();
                const stratName = strat ? strat.name : 'Estrategia Cuantitativa';
                const curSym = (this.dom.selectSymbol ? this.dom.selectSymbol.value : null) || window.currentSymbol || 'BTC-USD';

                if (!param || !param.time || !param.seriesData) {
                    legEl.innerHTML = `<span style="font-weight: bold; color: #fff;">${curSym}</span> <span style="color:#5b8cff;">[${stratName}]</span> <span style="color:#787b86;">Gráfico Cuantitativo Dedicado (Marcadores de Compra / Venta)</span>`;
                    return;
                }
                const d = param.seriesData.get(this.backtestCandleSeries);
                if (d) {
                    const diff = d.close - d.open;
                    const isUp = diff >= 0;
                    const color = isUp ? '#089981' : '#f23645';
                    legEl.innerHTML = `<span style="font-weight: bold; color: #fff;">${curSym}</span> <span style="color:#5b8cff;">[${stratName}]</span> O:<span style="color:${color};">${d.open.toFixed(2)}</span> H:<span style="color:${color};">${d.high.toFixed(2)}</span> L:<span style="color:${color};">${d.low.toFixed(2)}</span> C:<span style="color:${color};">${d.close.toFixed(2)}</span>`;
                }
            });

            new ResizeObserver(() => this.resizeCharts()).observe(container);
        }
    }

    // =========================================================================
    // MOTOR CUANTITATIVO DE BACKTESTING
    // =========================================================================
    async ejecutarBacktest() {
        const strat = this.getEstrategiaActiva();
        if (!strat) return;

        // Comprobar si estamos en Modo Multi-Activo (o si la estrategia es de cartera multi-activo)
        if (this.isMultiAsset || (strat && strat.multiAsset)) {
            let symbolsList = [];
            if (this.dom.btMultiSymbolsInput && this.dom.btMultiSymbolsInput.value.trim()) {
                symbolsList = this.dom.btMultiSymbolsInput.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
            }
            if (symbolsList.length === 0) {
                symbolsList = (strat && strat.symbols && strat.symbols.length) ? strat.symbols : this.multiAssetSymbols;
            }
            await this.ejecutarBacktestMultiActivo(symbolsList, strat);
            return;
        }

        // Modo Mono-Activo
        const curSym = (this.dom.selectSymbol ? this.dom.selectSymbol.value : null) || window.currentSymbol || 'BTC-USD';
        const curTf = (this.dom.selectTf ? this.dom.selectTf.value : null) || window.currentInterval || '1h';

        let candles = this.currentCandles;
        if (this.csvDatasets[curSym] && this.csvDatasets[curSym].length >= 10) {
            candles = this.csvDatasets[curSym];
            this.currentCandles = candles;
        } else if (!candles || candles.length < 30) {
            candles = await this.obtenerVelasParaSimbolo(curSym);
            this.currentCandles = candles;
        }

        if (!candles || candles.length < 30) {
            console.warn("⚠️ No hay suficientes velas para ejecutar el backtest (mínimo 30).");
            return;
        }

        this.garantizarBacktestChart();
        if (this.backtestCandleSeries && candles.length > 0) {
            this.backtestCandleSeries.setData(candles);
            if (this.backtestChart && this.backtestChart.timeScale()) {
                this.backtestChart.timeScale().fitContent();
            }
        }

        // Intentar invocar el motor de Rust nativo de ultra-alta velocidad si estamos en Tauri y no es CSV local
        const isCsvDataset = !!(this.csvDatasets[curSym]);
        const invoke = (!isCsvDataset && window.__TAURI__ && window.__TAURI__.core) ? window.__TAURI__.core.invoke : (!isCsvDataset && window.__TAURI__ ? window.__TAURI__.invoke : null);
        if (invoke) {
            try {
                const rustConfig = this.construirRustConfig(strat, this.executionProps);
                if (rustConfig) {
                    const rustResult = await invoke('ejecutar_backtest_cuantitativo', {
                        config: rustConfig,
                        candles: candles
                    });
                    if (rustResult && rustResult.metrics) {
                        this.procesarResultadoRust(rustResult, strat, candles);
                        return;
                    }
                }
            } catch (err) {
                console.warn("Fallo o fallback del motor Rust, ejecutando en motor JS local:", err);
            }
        }

        // Ejecutar en motor JS local de alta velocidad (Navegador / Fallback)
        this.ejecutarBacktestJS(candles, strat, curSym);
    }

    async obtenerVelasParaSimbolo(sym) {
        if (this.csvDatasets[sym] && this.csvDatasets[sym].length >= 10) {
            return this.csvDatasets[sym];
        }
        if (sym === window.currentSymbol && window.historialVelas && window.historialVelas.length >= 30) {
            return window.historialVelas;
        }
        const invoke = (window.__TAURI__ && window.__TAURI__.core) ? window.__TAURI__.core.invoke : (window.__TAURI__ ? window.__TAURI__.invoke : null);
        if (invoke) {
            try {
                const curTf = (this.dom.selectTf ? this.dom.selectTf.value : null) || window.currentInterval || '1h';
                const fetched = await invoke('cargar_historial', { simbolo: sym, intervalo: curTf });
                if (fetched && fetched.length >= 30) return fetched;
            } catch(e) {}
        }
        try {
            const resp = await fetch(`/api/history?symbol=${encodeURIComponent(sym)}&interval=1h`);
            if (resp.ok) {
                const data = await resp.json();
                if (Array.isArray(data) && data.length >= 30) return data;
            }
        } catch(e) {}

        if (typeof window.generarVelasSinteticasGenericas === 'function') {
            return window.generarVelasSinteticasGenericas(sym, 300);
        }
        return window.historialVelas || [];
    }

    async ejecutarBacktestMultiActivo(symbolsList, strat) {
        if (!symbolsList || symbolsList.length === 0) {
            symbolsList = ['BTC-USD', 'ETH-USD', 'XAUUSD'];
        }

        console.log(`🌐 Ejecutando Backtest Multi-Activo en ${symbolsList.length} activos:`, symbolsList);
        const totalCapital = this.executionProps.initialCapital || 10000;
        const capPerSymbol = totalCapital / symbolsList.length;

        let allTrades = [];
        const breakdown = {};
        let firstCandles = null;

        for (const sym of symbolsList) {
            const candles = await this.obtenerVelasParaSimbolo(sym);
            if (!candles || candles.length < 30) {
                console.warn(`⚠️ Omitiendo ${sym}: velas insuficientes (${candles ? candles.length : 0}).`);
                continue;
            }

            if (!firstCandles) firstCandles = candles;

            const sim = this.simularTradesParaVelas(candles, strat, sym, capPerSymbol);
            const symTrades = sim.trades;

            const wins = symTrades.filter(t => t.pnl > 0).length;
            const netPnL = symTrades.reduce((sum, t) => sum + t.pnl, 0);

            breakdown[sym] = {
                symbol: sym,
                candlesCount: candles.length,
                totalTrades: symTrades.length,
                wins: wins,
                winRate: symTrades.length > 0 ? (wins / symTrades.length) * 100 : 0,
                netPnL: netPnL,
                returnPct: capPerSymbol > 0 ? (netPnL / capPerSymbol) * 100 : 0
            };

            allTrades.push(...symTrades);
        }

        // Si tenemos velas de al menos un símbolo, dibujarlas en el chart dedicado del tester
        this.garantizarBacktestChart();
        if (firstCandles && this.backtestCandleSeries) {
            this.backtestCandleSeries.setData(firstCandles);
            if (this.backtestChart && this.backtestChart.timeScale()) {
                this.backtestChart.timeScale().fitContent();
            }
        }

        if (allTrades.length === 0) {
            console.warn("⚠️ No se generaron operaciones en la cesta multi-activo.");
            this.lastBacktestResult = {
                strategy: strat,
                trades: [],
                metrics: this.calcularMetricas([], totalCapital, totalCapital, 0, 0),
                isMultiAsset: true,
                symbols: symbolsList,
                breakdown: breakdown,
                candlesCount: 0
            };
            this.renderizarResumenKPIs();
            this.renderizarTradeBlotter();
            return;
        }

        // Ordenar cronológicamente todas las operaciones de la cartera por momento de salida
        allTrades.sort((a, b) => (a.exitTime || 0) - (b.exitTime || 0));

        // Re-calcular IDs y curva de capital consolidada del portafolio
        let portfolioBalance = totalCapital;
        let peakBalance = portfolioBalance;
        let maxDDUSD = 0;
        let maxDDPct = 0;

        allTrades.forEach((t, idx) => {
            t.id = idx + 1;
            portfolioBalance += t.pnl;
            if (portfolioBalance > peakBalance) peakBalance = portfolioBalance;
            const dd = peakBalance - portfolioBalance;
            const ddPct = peakBalance > 0 ? (dd / peakBalance) * 100 : 0;
            t.cumulativeBalance = portfolioBalance;
            t.drawdownPct = ddPct;
            if (dd > maxDDUSD) maxDDUSD = dd;
            if (ddPct > maxDDPct) maxDDPct = ddPct;
        });

        const portfolioMetrics = this.calcularMetricas(allTrades, totalCapital, portfolioBalance, maxDDUSD, maxDDPct);

        this.lastBacktestResult = {
            strategy: strat,
            trades: allTrades,
            metrics: portfolioMetrics,
            isMultiAsset: true,
            symbols: symbolsList,
            breakdown: breakdown,
            candlesCount: allTrades.length
        };

        this.renderizarResumenKPIs();
        this.renderizarTradeBlotter();
        if (this.activeTab === 'tab-curva') {
            this.garantizarChartsCurvaCapital();
        }
        this.actualizarMarcadoresEnGrafico();

        if (this.dom.tradesCountBadge) {
            this.dom.tradesCountBadge.innerText = allTrades.length;
        }

        console.log(`✅ Backtest Multi-Activo completado: ${allTrades.length} operaciones consolidadas en ${symbolsList.length} activos. PnL Total: $${portfolioMetrics.netProfit.toFixed(2)} (${portfolioMetrics.returnPct.toFixed(2)}%).`);
    }

    construirRustConfig(strat, props) {
        let rustStratName = null;
        let params = {};

        if (strat.id === 'cruce_ema') {
            rustStratName = 'MA_CROSS_MOMENTUM';
            params = {
                ema_fast: strat.params.fastPeriod || 20,
                ema_slow: strat.params.slowPeriod || 50,
                sl_atr_mult: (strat.params.stopLossPct || 2.0) / 2.0,
                tp_atr_mult: (strat.params.takeProfitPct || 4.0) / 2.0
            };
        } else if (strat.id === 'btc_vcp') {
            rustStratName = 'BTC_VCP_SQUEEZE';
            params = {
                ema_trend: strat.params.emaPeriod || 200,
                bb_period: strat.params.bbPeriod || 20,
                bb_mult: strat.params.bbMult || 2.0,
                bbw_threshold: 0.045,
                donchian_period: strat.params.donchianPeriod || 24,
                atr_period: strat.params.atrPeriod || 14,
                sl_atr_mult: strat.params.stopLossAtr || 1.25,
                tp_atr_mult: strat.params.takeProfitAtr || 3.0
            };
        } else if (strat.id === 'gold_ao') {
            rustStratName = 'GOLD_AO_BREAKOUT';
            params = {
                donchian_period: strat.params.donchianPeriod || 24,
                sl_atr_mult: strat.params.stopLossAtr || 1.5,
                tp_atr_mult: strat.params.takeProfitAtr || 2.5
            };
        } else if (strat.id === 'eurusd_vcp') {
            rustStratName = 'EURUSD_VCP_BREAKOUT';
            params = {
                donchian_period: strat.params.donchianPeriod || 10,
                vcp_threshold: strat.params.squeezeRatioMax || 2.5,
                sl_atr_mult: strat.params.stopLossAtr || 1.0,
                tp_atr_mult: strat.params.takeProfitAtr || 3.0
            };
        } else if (strat.isCustom && strat.rules) {
            rustStratName = 'CUSTOM_RULES';
            params = { custom_rules: strat.rules };
        }

        if (!rustStratName) return null;

        return {
            strategy: rustStratName,
            initial_balance: props.initialCapital || 10000,
            spread: {
                spread_type: 'points',
                value: props.spread || 0
            },
            slippage: {
                slippage_type: 'percent',
                value: (props.slippageTicks || 1) * 0.01
            },
            commission: {
                commission_type: 'percent',
                value: props.commissionPct || 0.06
            },
            sizing: {
                mode: props.orderType === 'percent' ? 'percent_of_equity' : 'fixed_amount',
                value: props.orderValue || 10
            },
            allow_short: props.direction !== 'long',
            max_open_positions: 1,
            params: params
        };
    }

    procesarResultadoRust(rustResult, strat, candles) {
        const trades = (rustResult.trades || []).map(t => ({
            id: t.id,
            type: t.direction,
            signal: strat.name,
            entryTime: t.entry_time,
            entryPrice: t.entry_price,
            exitTime: t.exit_time,
            exitPrice: t.exit_price,
            exitReason: t.exit_reason,
            contracts: t.qty,
            sizeUSD: t.qty * t.entry_price,
            commission: t.commission,
            grossPnL: t.gross_pnl,
            pnl: t.net_pnl,
            returnPct: t.pnl_pct,
            cumulativeBalance: t.balance_after,
            drawdownPct: 0
        }));

        this.lastBacktestResult = {
            strategy: strat,
            trades,
            metrics: {
                netProfit: rustResult.metrics.net_profit,
                returnPct: rustResult.metrics.return_pct,
                profitFactor: rustResult.metrics.profit_factor,
                winRate: rustResult.metrics.win_rate,
                maxDrawdown: rustResult.metrics.max_drawdown,
                maxDrawdownPct: rustResult.metrics.max_drawdown_pct,
                sharpeRatio: rustResult.metrics.sharpe_ratio,
                sortinoRatio: rustResult.metrics.sortino_ratio,
                totalTrades: rustResult.metrics.total_trades,
                winTrades: rustResult.metrics.win_trades,
                lossTrades: rustResult.metrics.loss_trades,
                avgTrade: rustResult.metrics.avg_trade,
                avgWin: rustResult.metrics.avg_win,
                avgLoss: rustResult.metrics.avg_loss,
                maxConsecutiveLosses: rustResult.metrics.max_consecutive_losses,
                riskRewardRatio: rustResult.metrics.avg_loss > 0 ? (rustResult.metrics.avg_win / rustResult.metrics.avg_loss) : 0,
                recoveryFactor: rustResult.metrics.max_drawdown > 0 ? (rustResult.metrics.net_profit / rustResult.metrics.max_drawdown) : 0
            },
            candlesCount: candles.length,
            rustEquityCurve: rustResult.equity_curve || []
        };

        this.renderizarResumenKPIs();
        this.renderizarTradeBlotter();
        if (this.activeTab === 'tab-curva') {
            this.garantizarChartsCurvaCapital();
        }
        this.actualizarMarcadoresEnGrafico();
    }

    simularTradesParaVelas(candles, strat, symbol = 'BTC-USD', initialCapital = 10000) {
        const props = this.executionProps;
        let capital = initialCapital;
        let peakCapital = capital;
        let maxDrawdownUSD = 0;
        let maxDrawdownPct = 0;

        const trades = [];
        let posicionActual = null; // { type: 'LONG'|'SHORT', entryPrice, entryTime, sizeUSD, contracts, stopLoss, takeProfit }

        // Indicadores según estrategia
        const ind = window.IndicatorsEngine || {};
        let seriesA = [], seriesB = [], seriesC = [];
        const stType = strat.strategyType || strat.id;

        if (stType === 'cruce_ema' || stType === 'ema_cross') {
            seriesA = ind.calcularEMA ? ind.calcularEMA(candles, (strat.params && strat.params.fastPeriod) || 20) : [];
            seriesB = ind.calcularEMA ? ind.calcularEMA(candles, (strat.params && strat.params.slowPeriod) || 50) : [];
        } else if (stType === 'squeeze_momentum' || stType === 'sqz_momentum') {
            const sqz = ind.calcularSqueezeMomentum ? ind.calcularSqueezeMomentum(candles, (strat.params && strat.params.bbLength) || 20, (strat.params && strat.params.bbMult) || 2.0, (strat.params && strat.params.kcLength) || 20, (strat.params && strat.params.kcMult) || 1.5) : { histogram: [], dots: [] };
            seriesA = sqz.histogram;
            seriesB = sqz.dots;
        } else if (stType === 'rsi_reversion') {
            seriesA = ind.calcularRSI ? ind.calcularRSI(candles, (strat.params && strat.params.period) || 14) : [];
            seriesB = ind.calcularEMA ? ind.calcularEMA(candles, (strat.params && strat.params.filterEma) || 200) : [];
        } else if (stType === 'macd_trend') {
            const macd = ind.calcularMACD ? ind.calcularMACD(candles, (strat.params && strat.params.fastP) || 12, (strat.params && strat.params.slowP) || 26, (strat.params && strat.params.sigP) || 9) : { macdLine: [], signalLine: [], histogram: [] };
            seriesA = macd.macdLine;
            seriesB = macd.signalLine;
            seriesC = macd.histogram;
        } else if (stType === 'donchian_breakout') {
            const don = ind.calcularDonchian ? ind.calcularDonchian(candles, (strat.params && strat.params.entryPeriod) || (strat.params && strat.params.donchianPeriod) || 20) : { upper: [], lower: [] };
            const donExit = ind.calcularDonchian ? ind.calcularDonchian(candles, (strat.params && strat.params.exitPeriod) || 10) : { upper: [], lower: [] };
            const atr = ind.calcularATR ? ind.calcularATR(candles, (strat.params && strat.params.atrPeriod) || 14) : [];
            seriesA = don.upper;
            seriesB = don.lower;
            seriesC = { exitUpper: donExit.upper, exitLower: donExit.lower, atr };
        } else if (stType === 'bollinger_bounce') {
            const bb = ind.calcularBollinger ? ind.calcularBollinger(candles, (strat.params && strat.params.period) || 20, (strat.params && strat.params.mult) || 2.0) : { upper: [], basis: [], lower: [] };
            seriesA = bb.upper;
            seriesB = bb.basis;
            seriesC = bb.lower;
        } else if (stType === 'btc_vcp' || stType === 'vcp_squeeze') {
            const bb = ind.calcularBollinger ? ind.calcularBollinger(candles, (strat.params && strat.params.bbPeriod) || 20, (strat.params && strat.params.bbMult) || 2.0) : { upper: [], basis: [], lower: [] };
            const ema = ind.calcularEMA ? ind.calcularEMA(candles, (strat.params && strat.params.emaPeriod) || 200) : [];
            const don = ind.calcularDonchian ? ind.calcularDonchian(candles, (strat.params && strat.params.donchianPeriod) || 24) : { upper: [], lower: [] };
            const atr = ind.calcularATR ? ind.calcularATR(candles, (strat.params && strat.params.atrPeriod) || 14) : [];
            seriesA = bb.upper;
            seriesB = ema;
            seriesC = { donUpper: don.upper, bbLower: bb.lower, bbBasis: bb.basis, atr };
        } else if (stType === 'gold_ao' || stType === 'eurusd_vcp') {
            const don = ind.calcularDonchian ? ind.calcularDonchian(candles, (strat.params && strat.params.donchianPeriod) || 24) : { upper: [], lower: [] };
            const atr = ind.calcularATR ? ind.calcularATR(candles, (strat.params && strat.params.atrPeriod) || 14) : [];
            const fastEma = ind.calcularEMA ? ind.calcularEMA(candles, 5) : [];
            const slowEma = ind.calcularEMA ? ind.calcularEMA(candles, 34) : [];
            seriesA = don.upper;
            seriesB = don.lower;
            seriesC = { atr, fastEma, slowEma };
        } else if (stType === 'gold_rush') {
            const gann = ind.calcularGannHiLo ? ind.calcularGannHiLo(candles, (strat.params && strat.params.gannPeriod) || 5) : [];
            const don = ind.calcularDonchian ? ind.calcularDonchian(candles, (strat.params && strat.params.donchianPeriod) || 51) : { upper: [], lower: [] };
            const atr = ind.calcularATR ? ind.calcularATR(candles, (strat.params && strat.params.atrPeriod) || 14) : [];
            seriesA = gann;
            seriesB = don.upper;
            seriesC = { atr, donLower: don.lower };
        }

        // Indexar por tiempo para búsqueda O(1)
        const mapA = new Map(Array.isArray(seriesA) ? seriesA.map(p => [p.time, (p && p.trend !== undefined) ? p : p.value]) : []);
        const mapB = new Map(Array.isArray(seriesB) ? seriesB.map(p => [p.time, p.value]) : []);
        const mapC = new Map(Array.isArray(seriesC) ? seriesC.map(p => [p.time, p.value]) : []);
        const mapATR = (seriesC && seriesC.atr && Array.isArray(seriesC.atr)) ? new Map(seriesC.atr.map(p => [p.time, p.value])) : null;
        let pendingOrder = null;

        const slippagePct = (props.slippageTicks * 0.0001); // aproximación
        const halfSpread = (props.spread || 0) / 2;
        const commPct = (props.commissionPct / 100);

        // Bucle cronológico de velas
        for (let i = 2; i < candles.length; i++) {
            const c = candles[i];
            const prevC = candles[i - 1];
            const t = c.time;
            const prevT = prevC.time;

            // 1. Evaluar salida de posición existente si la hay
            if (posicionActual) {
                let cerrar = false;
                let exitReason = '';
                let exitPrice = c.close;

                // Salida por Stop Loss o Take Profit Intrabar (con protección de gap en apertura)
                if (posicionActual.type === 'LONG') {
                    if (posicionActual.stopLoss && c.low <= posicionActual.stopLoss) {
                        cerrar = true;
                        exitPrice = c.open < posicionActual.stopLoss ? c.open : posicionActual.stopLoss;
                        exitReason = 'Stop Loss';
                    } else if (posicionActual.takeProfit && c.high >= posicionActual.takeProfit) {
                        cerrar = true;
                        exitPrice = c.open > posicionActual.takeProfit ? c.open : posicionActual.takeProfit;
                        exitReason = 'Take Profit';
                    }
                } else if (posicionActual.type === 'SHORT') {
                    if (posicionActual.stopLoss && c.high >= posicionActual.stopLoss) {
                        cerrar = true;
                        exitPrice = c.open > posicionActual.stopLoss ? c.open : posicionActual.stopLoss;
                        exitReason = 'Stop Loss';
                    } else if (posicionActual.takeProfit && c.low <= posicionActual.takeProfit) {
                        cerrar = true;
                        exitPrice = c.open < posicionActual.takeProfit ? c.open : posicionActual.takeProfit;
                        exitReason = 'Take Profit';
                    }
                }

                // Salidas técnicas por señal opuesta
                if (!cerrar) {
                    if (stType === 'cruce_ema' || stType === 'ema_cross') {
                        const fast = mapA.get(t), slow = mapB.get(t);
                        const prevFast = mapA.get(prevT), prevSlow = mapB.get(prevT);
                        if (posicionActual.type === 'LONG' && prevFast >= prevSlow && fast < slow) {
                            cerrar = true; exitPrice = c.close; exitReason = 'Cruce Bajista EMA';
                        } else if (posicionActual.type === 'SHORT' && prevFast <= prevSlow && fast > slow) {
                            cerrar = true; exitPrice = c.close; exitReason = 'Cruce Alcista EMA';
                        }
                    } else if (stType === 'donchian_breakout' && seriesC && seriesC.exitLower) {
                        const exitLow = (seriesC.exitLower.find(p => p.time === t) || {}).value;
                        const exitUp = (seriesC.exitUpper.find(p => p.time === t) || {}).value;
                        if (posicionActual.type === 'LONG' && exitLow && c.close < exitLow) {
                            cerrar = true; exitPrice = c.close; exitReason = 'Ruptura Salida Donchian';
                        } else if (posicionActual.type === 'SHORT' && exitUp && c.close > exitUp) {
                            cerrar = true; exitPrice = c.close; exitReason = 'Ruptura Salida Donchian';
                        }
                    } else if (stType === 'bollinger_bounce') {
                        const basis = mapB.get(t);
                        if (basis && ((posicionActual.type === 'LONG' && c.close >= basis) || (posicionActual.type === 'SHORT' && c.close <= basis))) {
                            cerrar = true; exitPrice = c.close; exitReason = 'Objetivo Media Central';
                        }
                    } else if (stType === 'gold_rush') {
                        const barsHeld = i - (posicionActual.entryIndex !== undefined ? posicionActual.entryIndex : i);
                        const timeExitLimit = (strat.params && strat.params.timeExitBars) || 5;
                        if (barsHeld >= timeExitLimit) {
                            cerrar = true;
                            exitPrice = c.close;
                            exitReason = `Time Exit (${timeExitLimit} velas)`;
                        }
                    }
                }

                // Ejecutar Cierre con spread y slippage
                if (cerrar) {
                    const finalExitPrice = posicionActual.type === 'LONG' 
                        ? (exitPrice * (1 - slippagePct) - halfSpread)
                        : (exitPrice * (1 + slippagePct) + halfSpread);

                    const priceDiff = posicionActual.type === 'LONG' 
                        ? (finalExitPrice - posicionActual.entryPrice)
                        : (posicionActual.entryPrice - finalExitPrice);

                    const grossPnL = priceDiff * posicionActual.contracts;
                    const commission = (posicionActual.entryPrice * posicionActual.contracts * commPct) +
                                       (finalExitPrice * posicionActual.contracts * commPct);
                    const netPnL = grossPnL - commission;
                    const returnPct = posicionActual.sizeUSD > 0 ? (netPnL / posicionActual.sizeUSD) * 100 : 0;

                    capital += netPnL;
                    if (capital > peakCapital) peakCapital = capital;
                    const currentDD = peakCapital - capital;
                    const currentDDPct = peakCapital > 0 ? (currentDD / peakCapital) * 100 : 0;
                    if (currentDD > maxDrawdownUSD) maxDrawdownUSD = currentDD;
                    if (currentDDPct > maxDrawdownPct) maxDrawdownPct = currentDDPct;

                    trades.push({
                        id: trades.length + 1,
                        symbol: symbol,
                        type: posicionActual.type,
                        signal: posicionActual.signal,
                        entryTime: posicionActual.entryTime,
                        entryPrice: posicionActual.entryPrice,
                        exitTime: t,
                        exitPrice: finalExitPrice,
                        exitReason: exitReason,
                        contracts: posicionActual.contracts,
                        sizeUSD: posicionActual.sizeUSD,
                        commission: commission,
                        grossPnL: grossPnL,
                        pnl: netPnL,
                        returnPct: returnPct,
                        cumulativeBalance: capital,
                        drawdownPct: currentDDPct
                    });

                    posicionActual = null;
                }
            }

            // 2. Si no hay posición abierta, evaluar entrada
            if (!posicionActual) {
                if (stType === 'gold_rush') {
                    // Gestionar orden pendiente Buy Stop existente
                    if (pendingOrder) {
                        if (i > pendingOrder.expiryIndex) {
                            pendingOrder = null; // Expirada (10 velas)
                        } else if (c.high >= pendingOrder.entryLevel) {
                            // Disparo de orden Buy Stop
                            const execPrice = Math.max(pendingOrder.entryLevel, c.open) * (1 + slippagePct) + halfSpread;
                            const slPrice = pendingOrder.slLevel;
                            let sizeUSD = props.orderType === 'percent' 
                                ? (capital * (props.orderValue / 100))
                                : Math.min(props.orderValue, capital);
                            if (sizeUSD < 10) sizeUSD = 10;
                            const contracts = sizeUSD / execPrice;

                            posicionActual = {
                                type: 'LONG',
                                signal: 'Buy Stop Trigger (Gann Pullback Breakout)',
                                entryTime: t,
                                entryIndex: i,
                                entryPrice: execPrice,
                                sizeUSD,
                                contracts,
                                stopLoss: slPrice,
                                takeProfit: null
                            };
                            pendingOrder = null;
                        }
                    }

                    // Si no hay posición ni orden pendiente, buscar Setup
                    if (!posicionActual && !pendingOrder) {
                        let inSession = true;
                        if (strat.params && strat.params.filterSession) {
                            let barHour = 12;
                            if (typeof t === 'number') {
                                barHour = new Date(t * 1000).getUTCHours();
                            } else if (typeof t === 'string' && t.includes(':')) {
                                barHour = new Date(t).getUTCHours();
                            }
                            const sStart = strat.params.sessionStart !== undefined ? strat.params.sessionStart : 6;
                            const sEnd = strat.params.sessionEnd !== undefined ? strat.params.sessionEnd : 19;
                            inSession = (barHour >= sStart && barHour <= sEnd);
                        }

                        if (inSession && i >= 15) {
                            const gannDataPrev = mapA.get(prevT);
                            const prevTrend = gannDataPrev ? (gannDataPrev.trend !== undefined ? gannDataPrev.trend : gannDataPrev) : 0;
                            const rollingHighPrev = mapB.get(prevT);

                            if (rollingHighPrev && prevTrend === -1) {
                                let recentHigh = 0;
                                const lookback = Math.min(15, i);
                                for (let k = 1; k <= lookback; k++) {
                                    if (candles[i - k].high > recentHigh) recentHigh = candles[i - k].high;
                                }

                                const threshold = 1 - (((strat.params && strat.params.donchianThresholdPct) || 0.5) / 100);
                                const wasAtHighs = (recentHigh >= rollingHighPrev * threshold);

                                if (wasAtHighs) {
                                    const swingHigh = recentHigh;
                                    const atrVal = (mapATR && mapATR.get(t)) ? mapATR.get(t) : (c.high - c.low);
                                    const slDistance = atrVal * ((strat.params && strat.params.atrStopMult) || 1.5);
                                    const slLevel = swingHigh - slDistance;

                                    pendingOrder = {
                                        entryLevel: swingHigh,
                                        slLevel: slLevel,
                                        createdIndex: i,
                                        expiryIndex: i + ((strat.params && strat.params.orderExpiryBars) || 10)
                                    };
                                }
                            }
                        }
                    }
                    continue; // Siguiente barra para gold_rush
                }

                let entrarLong = false;
                let entrarShort = false;
                let signalName = '';

                if (stType === 'cruce_ema' || stType === 'ema_cross') {
                    const fast = mapA.get(t), slow = mapB.get(t);
                    const prevFast = mapA.get(prevT), prevSlow = mapB.get(prevT);
                    if (prevFast <= prevSlow && fast > slow) {
                        entrarLong = true; signalName = 'Cruce Dorado EMA (Alcista)';
                    } else if (prevFast >= prevSlow && fast < slow) {
                        entrarShort = true; signalName = 'Cruce de Muerte EMA (Bajista)';
                    }
                } 
                else if (stType === 'squeeze_momentum' || stType === 'sqz_momentum') {
                    const hist = mapA.get(t);
                    const prevHist = mapA.get(prevT);
                    if (hist !== undefined && prevHist !== undefined) {
                        if (prevHist < 0 && hist >= 0) {
                            entrarLong = true; signalName = 'Disparo Squeeze Alcista';
                        } else if (prevHist > 0 && hist <= 0) {
                            entrarShort = true; signalName = 'Disparo Squeeze Bajista';
                        }
                    }
                }
                else if (stType === 'rsi_reversion') {
                    const rsi = mapA.get(t);
                    const prevRsi = mapA.get(prevT);
                    const emaTrend = mapB.get(t) || 0;
                    if (rsi !== undefined && prevRsi !== undefined) {
                        if (prevRsi <= ((strat.params && strat.params.oversold) || 30) && rsi > ((strat.params && strat.params.oversold) || 30) && c.close > emaTrend) {
                            entrarLong = true; signalName = 'Rebote Sobreventa RSI + Tendencia';
                        } else if (prevRsi >= ((strat.params && strat.params.overbought) || 70) && rsi < ((strat.params && strat.params.overbought) || 70) && c.close < emaTrend) {
                            entrarShort = true; signalName = 'Rechazo Sobrecompra RSI + Tendencia';
                        }
                    }
                }
                else if (stType === 'macd_trend') {
                    const macd = mapA.get(t), sig = mapB.get(t);
                    const prevMacd = mapA.get(prevT), prevSig = mapB.get(prevT);
                    if (prevMacd <= prevSig && macd > sig) {
                        entrarLong = true; signalName = 'Cruce Alcista MACD';
                    } else if (prevMacd >= prevSig && macd < sig) {
                        entrarShort = true; signalName = 'Cruce Bajista MACD';
                    }
                }
                else if (stType === 'donchian_breakout') {
                    const upper = mapA.get(prevT);
                    const lower = mapB.get(prevT);
                    if (upper && c.close > upper) {
                        entrarLong = true; signalName = 'Ruptura Canal Superior Donchian';
                    } else if (lower && c.close < lower) {
                        entrarShort = true; signalName = 'Ruptura Canal Inferior Donchian';
                    }
                }
                else if (stType === 'bollinger_bounce') {
                    const upper = mapA.get(prevT);
                    const lower = mapC.get(prevT);
                    if (lower && prevC.close <= lower && c.close > lower) {
                        entrarLong = true; signalName = 'Rebote Banda Inferior BB';
                    } else if (upper && prevC.close >= upper && c.close < upper) {
                        entrarShort = true; signalName = 'Rebote Banda Superior BB';
                    }
                }
                else if (stType === 'btc_vcp' || stType === 'vcp_squeeze') {
                    const donUpper = (seriesC && seriesC.donUpper ? seriesC.donUpper.find(p => p.time === prevT) : null);
                    const upVal = donUpper ? donUpper.value : mapA.get(prevT);
                    const emaTrend = mapB.get(t) || 0;
                    if (upVal && c.close > upVal && c.close > emaTrend) {
                        entrarLong = true; signalName = 'Ruptura VCP Squeeze';
                    }
                }

                // Filtrar según dirección permitida
                if (props.direction === 'long') entrarShort = false;
                if (props.direction === 'short') entrarLong = false;

                if (entrarLong || entrarShort) {
                    const type = entrarLong ? 'LONG' : 'SHORT';
                    const entryPrice = type === 'LONG' 
                        ? (c.close * (1 + slippagePct) + halfSpread)
                        : (c.close * (1 - slippagePct) - halfSpread);
                    
                    // Cálculo de tamaño de posición
                    let sizeUSD = props.orderType === 'percent' 
                        ? (capital * (props.orderValue / 100))
                        : Math.min(props.orderValue, capital);

                    if (sizeUSD < 10) sizeUSD = 10;
                    const contracts = sizeUSD / entryPrice;

                    // Cálculo de SL y TP
                    const slPct = ((strat.params && strat.params.stopLossPct) || (strat.params && strat.params.slPct) || 2.0) / 100;
                    const tpPct = ((strat.params && strat.params.takeProfitPct) || (strat.params && strat.params.tpPct) || 4.0) / 100;

                    const stopLoss = type === 'LONG' ? entryPrice * (1 - slPct) : entryPrice * (1 + slPct);
                    const takeProfit = type === 'LONG' ? entryPrice * (1 + tpPct) : entryPrice * (1 - tpPct);

                    posicionActual = {
                        type,
                        signal: signalName,
                        entryTime: t,
                        entryIndex: i,
                        entryPrice,
                        sizeUSD,
                        contracts,
                        stopLoss,
                        takeProfit
                    };
                }
            }
        }

        // Liquidar cualquier posición aún abierta en la última barra para evitar operaciones huérfanas
        if (posicionActual && candles.length > 0) {
            const lastC = candles[candles.length - 1];
            const finalExitPrice = posicionActual.type === 'LONG' 
                ? (lastC.close * (1 - slippagePct) - halfSpread)
                : (lastC.close * (1 + slippagePct) + halfSpread);
            const priceDiff = posicionActual.type === 'LONG' 
                ? (finalExitPrice - posicionActual.entryPrice)
                : (posicionActual.entryPrice - finalExitPrice);
            const grossPnL = priceDiff * posicionActual.contracts;
            const commission = (posicionActual.entryPrice * posicionActual.contracts * commPct) +
                               (finalExitPrice * posicionActual.contracts * commPct);
            const netPnL = grossPnL - commission;
            capital += netPnL;
            if (capital > peakCapital) peakCapital = capital;
            const currentDD = peakCapital - capital;
            const currentDDPct = peakCapital > 0 ? (currentDD / peakCapital) * 100 : 0;
            if (currentDD > maxDrawdownUSD) maxDrawdownUSD = currentDD;
            if (currentDDPct > maxDrawdownPct) maxDrawdownPct = currentDDPct;

            trades.push({
                id: trades.length + 1,
                symbol: symbol,
                type: posicionActual.type,
                signal: posicionActual.signal,
                entryTime: posicionActual.entryTime,
                entryPrice: posicionActual.entryPrice,
                exitTime: lastC.time,
                exitPrice: finalExitPrice,
                exitReason: 'Fin de Datos (TIME)',
                contracts: posicionActual.contracts,
                sizeUSD: posicionActual.sizeUSD,
                commission: commission,
                grossPnL: grossPnL,
                pnl: netPnL,
                returnPct: posicionActual.sizeUSD > 0 ? (netPnL / posicionActual.sizeUSD) * 100 : 0,
                cumulativeBalance: capital,
                drawdownPct: currentDDPct
            });
            posicionActual = null;
        }

        return {
            trades,
            finalCapital: capital,
            maxDrawdownUSD,
            maxDrawdownPct
        };
    }

    ejecutarBacktestJS(candles, strat, symbol = null) {
        const curSym = symbol || (this.dom.selectSymbol ? this.dom.selectSymbol.value : null) || window.currentSymbol || 'BTC-USD';
        const props = this.executionProps;
        const sim = this.simularTradesParaVelas(candles, strat, curSym, props.initialCapital);
        const metricas = this.calcularMetricas(sim.trades, props.initialCapital, sim.finalCapital, sim.maxDrawdownUSD, sim.maxDrawdownPct);

        this.lastBacktestResult = {
            strategy: strat,
            trades: sim.trades,
            metrics: metricas,
            candlesCount: candles.length,
            isMultiAsset: false,
            symbol: curSym
        };

        // Renderizar vistas
        this.renderizarResumenKPIs();
        this.renderizarTradeBlotter();
        if (this.activeTab === 'tab-curva') {
            this.garantizarChartsCurvaCapital();
        }

        // Renderizar marcadores sobre el gráfico principal
        this.actualizarMarcadoresEnGrafico();

        // Actualizar badge de contador
        if (this.dom.tradesCountBadge) {
            this.dom.tradesCountBadge.innerText = sim.trades.length;
        }

        console.log(`✅ Backtest completado: ${sim.trades.length} operaciones calculadas para ${curSym}. Ganancia Neta: $${metricas.netProfit.toFixed(2)} (${metricas.returnPct.toFixed(2)}%).`);
    }

    procesarResultadosExternos(trades, metrics) {
        if (!trades || !Array.isArray(trades)) return;
        
        const initialCap = this.properties.initialCapital || 10000;
        let finalCap = initialCap;
        if (trades.length > 0) {
            const lastTrade = trades[trades.length - 1];
            finalCap = lastTrade.balanceAfter !== undefined ? lastTrade.balanceAfter : (initialCap + trades.reduce((acc, t) => acc + (t.netPnL || 0), 0));
        }
        
        const metricasCalculadas = metrics || this.calcularMetricas(trades, initialCap, finalCap, 0, 0);

        this.lastBacktestResult = {
            strategy: { name: "Estrategia QuantEngine Pro", id: "PYTHON_QUANTENGINE" },
            trades: trades,
            metrics: metricasCalculadas,
            candlesCount: this.currentCandles ? this.currentCandles.length : 0
        };

        this.renderizarResumenKPIs();
        this.renderizarTradeBlotter();
        if (this.activeTab === 'tab-curva') {
            this.garantizarChartsCurvaCapital();
        }
        this.actualizarMarcadoresEnGrafico();

        if (this.dom.tradesCountBadge) {
            this.dom.tradesCountBadge.innerText = trades.length;
        }
    }

    calcularMetricas(trades, initialCapital, finalCapital, maxDDUSD, maxDDPct) {
        const totalTrades = trades.length;
        if (totalTrades === 0) {
            return {
                netProfit: 0, returnPct: 0, initialCapital, finalCapital,
                profitFactor: 0, winRate: 0, totalTrades: 0,
                winningTrades: 0, losingTrades: 0, grossProfit: 0, grossLoss: 0,
                maxDrawdownUSD: 0, maxDrawdownPct: 0,
                avgTrade: 0, avgWin: 0, avgLoss: 0, riskReward: 0,
                sharpe: 0, sortino: 0, recoveryFactor: 0,
                maxWinStreak: 0, maxLossStreak: 0,
                longTrades: 0, longWins: 0, longWinRate: 0, longPnL: 0,
                shortTrades: 0, shortWins: 0, shortWinRate: 0, shortPnL: 0,
                totalCommission: 0
            };
        }

        const netProfit = finalCapital - initialCapital;
        const returnPct = (netProfit / initialCapital) * 100;

        let grossProfit = 0;
        let grossLoss = 0;
        let winningTrades = 0;
        let losingTrades = 0;
        let totalCommission = 0;

        let longTrades = 0, longWins = 0, longPnL = 0;
        let shortTrades = 0, shortWins = 0, shortPnL = 0;

        let currentWinStreak = 0, maxWinStreak = 0;
        let currentLossStreak = 0, maxLossStreak = 0;

        const returnsArray = [];

        trades.forEach(t => {
            totalCommission += t.commission;
            returnsArray.push(t.returnPct);

            if (t.type === 'LONG') {
                longTrades++;
                longPnL += t.pnl;
                if (t.pnl > 0) longWins++;
            } else {
                shortTrades++;
                shortPnL += t.pnl;
                if (t.pnl > 0) shortWins++;
            }

            if (t.pnl > 0) {
                grossProfit += t.pnl;
                winningTrades++;
                currentWinStreak++;
                currentLossStreak = 0;
                if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
            } else if (t.pnl < 0) {
                grossLoss += Math.abs(t.pnl);
                losingTrades++;
                currentLossStreak++;
                currentWinStreak = 0;
                if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
            }
        });

        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
        const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 99.99 : 0) : (grossProfit / grossLoss);
        const avgTrade = netProfit / totalTrades;
        const avgWin = winningTrades > 0 ? grossProfit / winningTrades : 0;
        const avgLoss = losingTrades > 0 ? grossLoss / losingTrades : 0;
        const riskReward = avgLoss === 0 ? 0 : (avgWin / avgLoss);
        const recoveryFactor = maxDDUSD === 0 ? 99.99 : (netProfit / maxDDUSD);

        // Sharpe y Sortino
        const meanReturn = returnsArray.reduce((a, b) => a + b, 0) / totalTrades;
        const variance = returnsArray.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / (totalTrades > 1 ? totalTrades - 1 : 1);
        const stdDev = Math.sqrt(variance);
        const sharpe = stdDev === 0 ? 0 : (meanReturn / stdDev) * Math.sqrt(totalTrades);

        const downsideReturns = returnsArray.filter(r => r < 0);
        const downsideVariance = downsideReturns.length > 0 
            ? downsideReturns.reduce((a, b) => a + Math.pow(b, 2), 0) / downsideReturns.length 
            : 0;
        const downsideStdDev = Math.sqrt(downsideVariance);
        const sortino = downsideStdDev === 0 ? (sharpe > 0 ? 9.99 : 0) : (meanReturn / downsideStdDev) * Math.sqrt(totalTrades);

        return {
            netProfit, returnPct, initialCapital, finalCapital,
            profitFactor, winRate, totalTrades,
            winningTrades, losingTrades, grossProfit, grossLoss,
            maxDrawdownUSD: maxDDUSD, maxDrawdownPct: maxDDPct,
            avgTrade, avgWin, avgLoss, riskReward,
            sharpe, sortino, recoveryFactor,
            maxWinStreak, maxLossStreak,
            longTrades, longWins, longWinRate: longTrades > 0 ? (longWins / longTrades) * 100 : 0, longPnL,
            shortTrades, shortWins, shortWinRate: shortTrades > 0 ? (shortWins / shortTrades) * 100 : 0, shortPnL,
            totalCommission
        };
    }

    // =========================================================================
    // RENDERIZADO TAB 1: RESUMEN DEL RENDIMIENTO
    // =========================================================================
    renderizarResumenKPIs() {
        if (!this.lastBacktestResult) return;
        const m = this.lastBacktestResult.metrics;

        // 1. Grid de Tarjetas KPI
        if (this.dom.summaryGrid) {
            const netSign = m.netProfit >= 0 ? '+' : '';
            const netClass = m.netProfit >= 0 ? 'pos' : 'neg';
            const pfColor = m.profitFactor >= 1.5 ? 'pos' : (m.profitFactor >= 1.0 ? '' : 'neg');

            this.dom.summaryGrid.innerHTML = `
                <div class="tv-kpi-card accent-green">
                    <div class="tv-kpi-label">Ganancia Neta</div>
                    <div class="tv-kpi-value ${netClass}">${netSign}$${m.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div class="tv-kpi-sub">${netSign}${m.returnPct.toFixed(2)}% retorno</div>
                </div>
                <div class="tv-kpi-card accent-blue">
                    <div class="tv-kpi-label">Profit Factor</div>
                    <div class="tv-kpi-value ${pfColor}">${m.profitFactor.toFixed(2)}</div>
                    <div class="tv-kpi-sub">Bruto: +$${m.grossProfit.toFixed(0)} / -$${m.grossLoss.toFixed(0)}</div>
                </div>
                <div class="tv-kpi-card accent-green">
                    <div class="tv-kpi-label">Win Rate (% Acierto)</div>
                    <div class="tv-kpi-value">${m.winRate.toFixed(1)}%</div>
                    <div class="tv-kpi-sub">${m.winningTrades} Ganadoras / ${m.losingTrades} Perdedoras</div>
                </div>
                <div class="tv-kpi-card accent-red">
                    <div class="tv-kpi-label">Max Drawdown</div>
                    <div class="tv-kpi-value neg">-${m.maxDrawdownPct.toFixed(2)}%</div>
                    <div class="tv-kpi-sub">-$${m.maxDrawdownUSD.toFixed(2)} pico-a-valle</div>
                </div>
                <div class="tv-kpi-card accent-blue">
                    <div class="tv-kpi-label">Ratio de Sharpe</div>
                    <div class="tv-kpi-value">${m.sharpe.toFixed(2)}</div>
                    <div class="tv-kpi-sub">Rendimiento ajustado a riesgo</div>
                </div>
                <div class="tv-kpi-card accent-blue">
                    <div class="tv-kpi-label">Ratio de Sortino</div>
                    <div class="tv-kpi-value">${m.sortino.toFixed(2)}</div>
                    <div class="tv-kpi-sub">Penaliza sólo volatilidad a la baja</div>
                </div>
                <div class="tv-kpi-card accent-amber">
                    <div class="tv-kpi-label">Ratio R:R Promedio</div>
                    <div class="tv-kpi-value">1 : ${m.riskReward.toFixed(2)}</div>
                    <div class="tv-kpi-sub">Avg Win $${m.avgWin.toFixed(0)} / Loss $${m.avgLoss.toFixed(0)}</div>
                </div>
                <div class="tv-kpi-card accent-amber">
                    <div class="tv-kpi-label">Factor Recuperación</div>
                    <div class="tv-kpi-value">${m.recoveryFactor.toFixed(2)}</div>
                    <div class="tv-kpi-sub">Ganancia Neta / Max DD</div>
                </div>
            `;
        }

        // 2. Desglose detallado institucional
        if (this.dom.detailsGrid) {
            const winPct = m.totalTrades > 0 ? (m.winningTrades / m.totalTrades) * 100 : 0;
            const lossPct = 100 - winPct;

            this.dom.detailsGrid.innerHTML = `
                <!-- BLOQUE 1: OPERACIONES Y COSTES -->
                <div class="metrics-block">
                    <div class="metrics-block-title">
                        <span>Desglose de Operaciones</span>
                        <span style="color:var(--tv-blue);">${m.totalTrades} Ejecutadas</span>
                    </div>
                    <div class="metrics-row"><span class="m-label">Operaciones Totales:</span><span class="m-val">${m.totalTrades}</span></div>
                    <div class="metrics-row"><span class="m-label">Operaciones Ganadoras:</span><span class="m-val" style="color:var(--tv-green);">${m.winningTrades} (${winPct.toFixed(1)}%)</span></div>
                    <div class="metrics-row"><span class="m-label">Operaciones Perdedoras:</span><span class="m-val" style="color:var(--tv-red);">${m.losingTrades} (${lossPct.toFixed(1)}%)</span></div>
                    <div class="metrics-row"><span class="m-label">Ganancia Bruta:</span><span class="m-val" style="color:var(--tv-green);">+$${m.grossProfit.toFixed(2)}</span></div>
                    <div class="metrics-row"><span class="m-label">Pérdida Bruta:</span><span class="m-val" style="color:var(--tv-red);">-$${m.grossLoss.toFixed(2)}</span></div>
                    <div class="metrics-row"><span class="m-label">Comisiones Pagadas:</span><span class="m-val">-$${m.totalCommission.toFixed(2)}</span></div>
                    
                    <div class="win-loss-visual">
                        <div class="win-loss-bar-wrap">
                            <div class="win-bar-segment" style="width:${winPct}%;"></div>
                            <div class="loss-bar-segment" style="width:${lossPct}%;"></div>
                        </div>
                        <div class="win-loss-legend">
                            <span>🟢 Wins: ${m.winningTrades}</span>
                            <span>🔴 Losses: ${m.losingTrades}</span>
                        </div>
                    </div>
                </div>

                <!-- BLOQUE 2: PROMEDIOS Y RACHAS -->
                <div class="metrics-block">
                    <div class="metrics-block-title">
                        <span>Promedios & Rachas</span>
                        <span style="color:var(--tv-text-secondary);">Estadísticas</span>
                    </div>
                    <div class="metrics-row"><span class="m-label">Operación Promedio:</span><span class="m-val ${m.avgTrade>=0?'pnl-pos':'pnl-neg'}">${m.avgTrade>=0?'+':''}$${m.avgTrade.toFixed(2)}</span></div>
                    <div class="metrics-row"><span class="m-label">Ganancia Media:</span><span class="m-val" style="color:var(--tv-green);">+$${m.avgWin.toFixed(2)}</span></div>
                    <div class="metrics-row"><span class="m-label">Pérdida Media:</span><span class="m-val" style="color:var(--tv-red);">-$${m.avgLoss.toFixed(2)}</span></div>
                    <div class="metrics-row"><span class="m-label">Racha Ganadora Máxima:</span><span class="m-val" style="color:var(--tv-green);">${m.maxWinStreak} consecutivas</span></div>
                    <div class="metrics-row"><span class="m-label">Racha Perdedora Máxima:</span><span class="m-val" style="color:var(--tv-red);">${m.maxLossStreak} consecutivas</span></div>
                    <div class="metrics-row"><span class="m-label">Capital Inicial / Final:</span><span class="m-val">$${m.initialCapital.toFixed(0)} ➔ $${m.finalCapital.toFixed(2)}</span></div>
                </div>

                <!-- BLOQUE 3: LONG VS SHORT -->
                <div class="metrics-block">
                    <div class="metrics-block-title">
                        <span>Dirección: Long vs Short</span>
                        <span style="color:var(--tv-text-secondary);">Balance</span>
                    </div>
                    <div class="metrics-row"><span class="m-label">Operaciones Long:</span><span class="m-val">${m.longTrades} trades</span></div>
                    <div class="metrics-row"><span class="m-label">Win Rate Long:</span><span class="m-val">${m.longWinRate.toFixed(1)}% (${m.longWins} aciertos)</span></div>
                    <div class="metrics-row"><span class="m-label">PnL Neto Long:</span><span class="m-val ${m.longPnL>=0?'pnl-pos':'pnl-neg'}">${m.longPnL>=0?'+':''}$${m.longPnL.toFixed(2)}</span></div>
                    
                    <div style="margin-top:6px; border-top:1px dashed var(--tv-border); padding-top:4px;"></div>
                    
                    <div class="metrics-row"><span class="m-label">Operaciones Short:</span><span class="m-val">${m.shortTrades} trades</span></div>
                    <div class="metrics-row"><span class="m-label">Win Rate Short:</span><span class="m-val">${m.shortWinRate.toFixed(1)}% (${m.shortWins} aciertos)</span></div>
                    <div class="metrics-row"><span class="m-label">PnL Neto Short:</span><span class="m-val ${m.shortPnL>=0?'pnl-pos':'pnl-neg'}">${m.shortPnL>=0?'+':''}$${m.shortPnL.toFixed(2)}</span></div>
                </div>

                ${(this.lastBacktestResult && this.lastBacktestResult.isMultiAsset && this.lastBacktestResult.breakdown) ? `
                <!-- BLOQUE 4: DESGLOSE MULTI-ACTIVO POR INSTRUMENTO -->
                <div class="metrics-block" style="grid-column: 1 / -1; border-color: rgba(41,98,255,0.4); background: rgba(41,98,255,0.03);">
                    <div class="metrics-block-title">
                        <span style="color:var(--tv-blue); font-weight:bold;">🌐 Desglose por Activo del Portafolio</span>
                        <span style="background:rgba(41,98,255,0.15); padding:2px 8px; border-radius:4px; font-size:11px;">${(this.lastBacktestResult.symbols || []).length} Activos en Cesta</span>
                    </div>
                    <div style="overflow-x:auto; margin-top:8px;">
                        <table style="width:100%; border-collapse:collapse; font-size:11px; text-align:left;">
                            <thead>
                                <tr style="border-bottom:1px solid var(--tv-border); color:var(--tv-text-secondary);">
                                    <th style="padding:6px 8px;">Activo</th>
                                    <th style="padding:6px 8px;">Velas</th>
                                    <th style="padding:6px 8px;">Operaciones</th>
                                    <th style="padding:6px 8px;">Win Rate %</th>
                                    <th style="padding:6px 8px;">PnL Neto USD</th>
                                    <th style="padding:6px 8px;">Retorno %</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.values(this.lastBacktestResult.breakdown).map(b => {
                                    const pnlCls = b.netPnL >= 0 ? 'pnl-pos' : 'pnl-neg';
                                    const pnlSign = b.netPnL >= 0 ? '+' : '';
                                    return `
                                        <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                                            <td style="padding:6px 8px; font-weight:bold; color:var(--tv-blue);">${b.symbol}</td>
                                            <td style="padding:6px 8px; color:var(--tv-text-secondary);">${b.candlesCount}</td>
                                            <td style="padding:6px 8px; font-weight:bold;">${b.totalTrades} (${b.wins}W)</td>
                                            <td style="padding:6px 8px;">${b.winRate.toFixed(1)}%</td>
                                            <td style="padding:6px 8px;" class="${pnlCls}">${pnlSign}$${b.netPnL.toFixed(2)}</td>
                                            <td style="padding:6px 8px;" class="${pnlCls}">${pnlSign}${b.returnPct.toFixed(2)}%</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                ` : ''}
            `;
        }
    }

    // =========================================================================
    // RENDERIZADO TAB 2: CURVA DE CAPITAL & UNDERWATER DRAWDOWN
    // =========================================================================
    garantizarChartsCurvaCapital() {
        if (!this.lastBacktestResult) return;
        const trades = this.lastBacktestResult.trades;
        const initialCap = this.executionProps.initialCapital;
        const candles = window.historialVelas || [];
        const startTime = candles.length > 0 ? candles[0].time : Math.floor(Date.now()/1000) - 86400;

        // Actualizar chips de métricas superiores en Tab 2
        const capFinalEl = document.getElementById('chip-cap-final');
        const capMaxEl = document.getElementById('chip-cap-max');
        const ddMaxEl = document.getElementById('chip-dd-max');
        if (capFinalEl) capFinalEl.innerText = `$${this.lastBacktestResult.metrics.finalCapital.toFixed(2)}`;
        if (capMaxEl) capMaxEl.innerText = `$${(this.lastBacktestResult.metrics.initialCapital + Math.max(0, this.lastBacktestResult.metrics.grossProfit)).toFixed(2)}`;
        if (ddMaxEl) ddMaxEl.innerText = `-${this.lastBacktestResult.metrics.maxDrawdownPct.toFixed(2)}%`;

        const eqContainer = this.dom.equityChartContainer;
        const ddContainer = this.dom.drawdownChartContainer;
        if (!eqContainer || !ddContainer) return;

        // Construir datos de curva de capital
        const equityData = [{ time: startTime, value: initialCap }];
        const drawdownData = [{ time: startTime, value: 0 }];

        // Asegurar orden cronológico ascendente estricto
        const sortedTrades = [...trades].sort((a, b) => a.exitTime - b.exitTime);
        let prevTime = startTime;

        sortedTrades.forEach((t) => {
            let tradeTime = t.exitTime;
            if (tradeTime <= prevTime) tradeTime = prevTime + 1; // Evitar timestamps duplicados
            prevTime = tradeTime;

            equityData.push({
                time: tradeTime,
                value: t.cumulativeBalance
            });

            drawdownData.push({
                time: tradeTime,
                value: -Math.abs(t.drawdownPct)
            });
        });

        // 1. Inicializar o Actualizar Chart de Capital (Equity)
        if (!this.equityChart && window.LightweightCharts) {
            eqContainer.innerHTML = '';
            const w = eqContainer.clientWidth > 0 ? eqContainer.clientWidth : 600;
            const h = eqContainer.clientHeight > 0 ? eqContainer.clientHeight : 130;

            this.equityChart = LightweightCharts.createChart(eqContainer, {
                width: w,
                height: h,
                layout: {
                    background: { type: 'solid', color: '#131722' },
                    textColor: '#d1d4dc',
                    fontSize: 10,
                },
                grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
                rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.1, bottom: 0.1 } },
                timeScale: { borderColor: '#2a2e39', timeVisible: true },
            });

            this.equitySeries = this.equityChart.addAreaSeries({
                topColor: 'rgba(8, 153, 129, 0.4)',
                bottomColor: 'rgba(8, 153, 129, 0.02)',
                lineColor: '#089981',
                lineWidth: 2,
                priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
            });
        }

        if (this.equitySeries && equityData.length > 0) {
            this.equitySeries.setData(equityData);
            this.equityChart.timeScale().fitContent();
        }

        // 2. Inicializar o Actualizar Chart de Drawdown Submarino
        if (!this.drawdownChart && window.LightweightCharts) {
            ddContainer.innerHTML = '';
            const w = ddContainer.clientWidth > 0 ? ddContainer.clientWidth : 600;
            const h = ddContainer.clientHeight > 0 ? ddContainer.clientHeight : 100;

            this.drawdownChart = LightweightCharts.createChart(ddContainer, {
                width: w,
                height: h,
                layout: {
                    background: { type: 'solid', color: '#131722' },
                    textColor: '#d1d4dc',
                    fontSize: 10,
                },
                grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
                rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.05, bottom: 0.1 } },
                timeScale: { borderColor: '#2a2e39', timeVisible: true },
            });

            this.drawdownSeries = this.drawdownChart.addAreaSeries({
                topColor: 'rgba(242, 54, 69, 0.02)',
                bottomColor: 'rgba(242, 54, 69, 0.45)',
                lineColor: '#f23645',
                lineWidth: 2,
                priceFormat: { type: 'custom', formatter: (p) => `${p.toFixed(2)}%` }
            });

            // Sincronizar escalas de tiempo con guarda anti-recursión
            if (this.equityChart) {
                let isSyncingRange = false;
                this.equityChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
                    if (isSyncingRange) return;
                    isSyncingRange = true;
                    if (this.drawdownChart && range) this.drawdownChart.timeScale().setVisibleLogicalRange(range);
                    isSyncingRange = false;
                });
                this.drawdownChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
                    if (isSyncingRange) return;
                    isSyncingRange = true;
                    if (this.equityChart && range) this.equityChart.timeScale().setVisibleLogicalRange(range);
                    isSyncingRange = false;
                });
            }
        }

        if (this.drawdownSeries && drawdownData.length > 0) {
            this.drawdownSeries.setData(drawdownData);
            this.drawdownChart.timeScale().fitContent();
        }

        this.resizeCharts();
    }

    resizeCharts() {
        const container = document.getElementById('backtest-chart-container');
        if (this.backtestChart && container) {
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w > 0 && h > 0) this.backtestChart.applyOptions({ width: w, height: h });
        }
        if (this.equityChart && this.dom.equityChartContainer) {
            const w = this.dom.equityChartContainer.clientWidth;
            const h = this.dom.equityChartContainer.clientHeight;
            if (w > 0 && h > 0) this.equityChart.applyOptions({ width: w, height: h });
        }
        if (this.drawdownChart && this.dom.drawdownChartContainer) {
            const w = this.dom.drawdownChartContainer.clientWidth;
            const h = this.dom.drawdownChartContainer.clientHeight;
            if (w > 0 && h > 0) this.drawdownChart.applyOptions({ width: w, height: h });
        }
    }

    resize() {
        this.resizeCharts();
    }

    // =========================================================================
    // RENDERIZADO TAB 3: TRADE BLOTTER (LISTA DE OPERACIONES)
    // =========================================================================
    renderizarTradeBlotter() {
        if (!this.dom.blotterTableBody) return;
        if (!this.lastBacktestResult || this.lastBacktestResult.trades.length === 0) {
            this.dom.blotterTableBody.innerHTML = `
                <tr><td colspan="14" style="text-align:center; padding:24px; color:var(--tv-text-secondary);">
                    No hay operaciones ejecutadas. Seleccione una estrategia y pulse '▶ Ejecutar Backtest'.
                </td></tr>
            `;
            if (this.dom.blotterPaginationInfo) this.dom.blotterPaginationInfo.innerText = "0 operaciones";
            return;
        }

        const trades = this.lastBacktestResult.trades;

        // Filtrado
        let filtered = trades.filter(t => {
            if (this.blotterFilter === 'long' && t.type !== 'LONG') return false;
            if (this.blotterFilter === 'short' && t.type !== 'SHORT') return false;
            if (this.blotterFilter === 'win' && t.pnl <= 0) return false;
            if (this.blotterFilter === 'loss' && t.pnl >= 0) return false;

            if (this.blotterSearchTerm) {
                const searchStr = `${t.id} ${t.symbol || ''} ${t.type} ${t.signal} ${t.exitReason} ${t.entryPrice} ${t.exitPrice}`.toLowerCase();
                if (!searchStr.includes(this.blotterSearchTerm)) return false;
            }
            return true;
        });

        const totalFiltered = filtered.length;
        const totalPages = Math.ceil(totalFiltered / this.blotterPageSize) || 1;
        if (this.blotterCurrentPage > totalPages) this.blotterCurrentPage = totalPages;

        const startIndex = (this.blotterCurrentPage - 1) * this.blotterPageSize;
        const pageTrades = filtered.slice(startIndex, startIndex + this.blotterPageSize);

        // Construir filas HTML
        const formatDate = (ts) => {
            if (!ts) return '--';
            const d = new Date(ts * 1000);
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
        };

        const curSelectedSym = (this.dom.selectSymbol ? this.dom.selectSymbol.value : null) || 'BTC-USD';

        const rowsHTML = pageTrades.map(t => {
            const isLong = t.type === 'LONG';
            const typeBadge = isLong 
                ? `<span class="badge-trade-type long">▲ LONG</span>`
                : `<span class="badge-trade-type short">▼ SHORT</span>`;

            const pnlClass = t.pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
            const pnlSign = t.pnl >= 0 ? '+' : '';
            const symDisplay = t.symbol || curSelectedSym;

            return `
                <tr>
                    <td style="font-weight:bold; color:var(--tv-text-secondary);">${t.id}</td>
                    <td style="font-weight:bold; color:var(--tv-blue);"><span class="sym-badge" style="background:rgba(41,98,255,0.15); padding:2px 6px; border-radius:4px; font-size:11px;">${symDisplay}</span></td>
                    <td>${typeBadge}</td>
                    <td style="color:var(--tv-text-bright);">${t.signal}</td>
                    <td>${formatDate(t.entryTime)}</td>
                    <td style="font-weight:bold;">${this.formatPrecio(t.entryPrice)}</td>
                    <td>${formatDate(t.exitTime)}</td>
                    <td style="font-weight:bold;">${this.formatPrecio(t.exitPrice)}</td>
                    <td style="color:var(--tv-text-secondary);">${t.exitReason}</td>
                    <td style="color:var(--tv-text-secondary);">-$${t.commission.toFixed(2)}</td>
                    <td class="${pnlClass}">${pnlSign}$${t.pnl.toFixed(2)}</td>
                    <td class="${pnlClass}">${pnlSign}${t.returnPct.toFixed(2)}%</td>
                    <td style="color:var(--tv-text-bright); font-weight:bold;">$${t.cumulativeBalance.toFixed(2)}</td>
                    <td>
                        <button class="btn-table-action" onclick="window.StrategyTester.centrarGraficoEnTrade(${t.entryTime}, ${t.exitTime})" title="Ver este trade en el gráfico principal">🔍 Ver</button>
                    </td>
                </tr>
            `;
        }).join('');

        this.dom.blotterTableBody.innerHTML = rowsHTML;

        // Actualizar Info Paginación
        if (this.dom.blotterPaginationInfo) {
            const startDisplay = totalFiltered === 0 ? 0 : startIndex + 1;
            const endDisplay = Math.min(startIndex + this.blotterPageSize, totalFiltered);
            this.dom.blotterPaginationInfo.innerText = `Mostrando ${startDisplay}-${endDisplay} de ${totalFiltered} operaciones`;
        }

        // Renderizar botones de paginación
        if (this.dom.blotterPaginationControls) {
            let btnsHTML = `
                <button class="page-btn" ${this.blotterCurrentPage === 1 ? 'disabled' : ''} onclick="window.StrategyTester.irPagina(1)">«</button>
                <button class="page-btn" ${this.blotterCurrentPage === 1 ? 'disabled' : ''} onclick="window.StrategyTester.irPagina(${this.blotterCurrentPage - 1})">‹</button>
            `;

            for (let p = Math.max(1, this.blotterCurrentPage - 2); p <= Math.min(totalPages, this.blotterCurrentPage + 2); p++) {
                btnsHTML += `
                    <button class="page-btn ${p === this.blotterCurrentPage ? 'active' : ''}" onclick="window.StrategyTester.irPagina(${p})">${p}</button>
                `;
            }

            btnsHTML += `
                <button class="page-btn" ${this.blotterCurrentPage === totalPages ? 'disabled' : ''} onclick="window.StrategyTester.irPagina(${this.blotterCurrentPage + 1})">›</button>
                <button class="page-btn" ${this.blotterCurrentPage === totalPages ? 'disabled' : ''} onclick="window.StrategyTester.irPagina(${totalPages})">»</button>
            `;

            this.dom.blotterPaginationControls.innerHTML = btnsHTML;
        }
    }

    irPagina(num) {
        this.blotterCurrentPage = num;
        this.renderizarTradeBlotter();
    }

    centrarGraficoEnTrade(entryTime, exitTime) {
        this.garantizarBacktestChart();
        const chart = this.backtestChart;
        if (!chart || !entryTime) return;
        try {
            const buffer = 3600 * 8; // 8 horas de margen visual
            chart.timeScale().setVisibleRange({
                from: entryTime - buffer,
                to: exitTime ? exitTime + buffer : entryTime + buffer
            });
        } catch (e) {
            console.error("Error al centrar gráfico de backtest en trade:", e);
        }
    }

    exportarBlotterCSV() {
        if (!this.lastBacktestResult || !this.lastBacktestResult.trades.length) {
            alert("⚠️ No hay operaciones disponibles para exportar.");
            return;
        }

        const trades = this.lastBacktestResult.trades;
        const headers = ["#", "Tipo", "Señal", "Fecha Entrada", "Precio Entrada", "Fecha Salida", "Precio Salida", "Motivo Salida", "Comisión USD", "PnL Neto USD", "Retorno %", "Capital Acumulado USD"];
        
        const csvRows = [headers.join(',')];

        trades.forEach(t => {
            const entryD = new Date(t.entryTime * 1000).toISOString();
            const exitD = new Date(t.exitTime * 1000).toISOString();
            const row = [
                t.id,
                t.type,
                `"${t.signal.replace(/"/g, '""')}"`,
                entryD,
                t.entryPrice.toFixed(4),
                exitD,
                t.exitPrice.toFixed(4),
                `"${t.exitReason}"`,
                t.commission.toFixed(4),
                t.pnl.toFixed(4),
                t.returnPct.toFixed(4),
                t.cumulativeBalance.toFixed(4)
            ];
            csvRows.push(row.join(','));
        });

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `QuantVisor_Trades_${this.activeStrategyId}_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // =========================================================================
    // RENDERIZADO TAB 4: CONFIGURACIÓN & PROPIEDADES
    // =========================================================================
    renderizarFormularioPropiedades() {
        const strat = this.getEstrategiaActiva();
        if (!strat) return;

        // Rellenar sección de capital y ejecución
        const initCapEl = document.getElementById('prop-initial-capital');
        const orderTypeEl = document.getElementById('prop-order-type');
        const orderValEl = document.getElementById('prop-order-value');
        const commEl = document.getElementById('prop-commission');
        const slipEl = document.getElementById('prop-slippage');
        const dirEl = document.getElementById('prop-direction');

        if (initCapEl) initCapEl.value = this.executionProps.initialCapital;
        if (orderTypeEl) orderTypeEl.value = this.executionProps.orderType;
        if (orderValEl) orderValEl.value = this.executionProps.orderValue;
        if (commEl) commEl.value = this.executionProps.commissionPct;
        if (slipEl) slipEl.value = this.executionProps.slippageTicks;
        if (dirEl) dirEl.value = this.executionProps.direction;

        // Rellenar sección dinámica de parámetros de la estrategia
        const dynContainer = this.dom.dynamicParamsContainer;
        if (!dynContainer) return;

        let fieldsHTML = '';
        Object.entries(strat.params).forEach(([key, val]) => {
            const label = this.formatearEtiquetaParametro(key);
            const isBool = typeof val === 'boolean';
            const isFloat = typeof val === 'number' && !Number.isInteger(val);

            if (isBool) {
                fieldsHTML += `
                    <div class="prop-row">
                        <label>${label}:</label>
                        <input type="checkbox" id="param-${key}" ${val ? 'checked' : ''} style="width:20px; height:20px; cursor:pointer;">
                    </div>
                `;
            } else {
                const step = isFloat ? '0.1' : '1';
                fieldsHTML += `
                    <div class="prop-row">
                        <label>${label}:</label>
                        <input type="number" id="param-${key}" value="${val}" step="${step}" min="0">
                    </div>
                `;
            }
        });

        dynContainer.innerHTML = fieldsHTML;
    }

    guardarFormularioPropiedades() {
        const strat = this.getEstrategiaActiva();
        if (!strat) return;

        const initCapEl = document.getElementById('prop-initial-capital');
        const orderTypeEl = document.getElementById('prop-order-type');
        const orderValEl = document.getElementById('prop-order-value');
        const commEl = document.getElementById('prop-commission');
        const slipEl = document.getElementById('prop-slippage');
        const dirEl = document.getElementById('prop-direction');

        if (initCapEl) this.executionProps.initialCapital = parseFloat(initCapEl.value) || 10000;
        if (orderTypeEl) this.executionProps.orderType = orderTypeEl.value;
        if (orderValEl) this.executionProps.orderValue = parseFloat(orderValEl.value) || 10;
        if (commEl) this.executionProps.commissionPct = parseFloat(commEl.value) || 0.06;
        if (slipEl) this.executionProps.slippageTicks = parseInt(slipEl.value, 10) || 1;
        if (dirEl) this.executionProps.direction = dirEl.value;

        // Guardar parámetros específicos
        Object.keys(strat.params).forEach(key => {
            const input = document.getElementById(`param-${key}`);
            if (input) {
                if (input.type === 'checkbox') {
                    strat.params[key] = input.checked;
                } else {
                    strat.params[key] = parseFloat(input.value);
                }
            }
        });
    }

    resetearPropiedadesPorDefecto() {
        this.executionProps = {
            initialCapital: 10000,
            orderType: 'percent',
            orderValue: 10,
            commissionPct: 0.06,
            slippageTicks: 1,
            spread: 0,
            direction: 'both',
            exitMode: 'intrabar'
        };

        if (this.preloadedStrategies[this.activeStrategyId]) {
            // Re-instanciar parámetros limpios
            const base = this.preloadedStrategies[this.activeStrategyId];
            this.renderizarFormularioPropiedades();
        }
    }

    formatearEtiquetaParametro(key) {
        const labels = {
            fastPeriod: 'Período EMA Rápida',
            slowPeriod: 'Período EMA Lenta',
            stopLossPct: 'Stop Loss (%)',
            takeProfitPct: 'Take Profit (%)',
            useTrailing: 'Activar Trailing Stop',
            trailingPct: 'Trailing Stop (%)',
            bbLength: 'Longitud Bandas Bollinger',
            bbMult: 'Factor Mult Bollinger',
            kcLength: 'Longitud Keltner Channel',
            kcMult: 'Factor Mult Keltner',
            period: 'Período',
            oversold: 'Nivel Sobreventa',
            overbought: 'Nivel Sobrecompra',
            filterEma: 'Filtro Tendencial EMA',
            fastP: 'Período Rápido MACD',
            slowP: 'Período Lento MACD',
            sigP: 'Período Señal MACD',
            entryPeriod: 'Período Entrada Ruptura',
            exitPeriod: 'Período Salida Donchian',
            atrPeriod: 'Período ATR',
            atrStopMult: 'Multiplicador Stop ATR',
            mult: 'Multiplicador Desviación',
            gannPeriod: 'Período Gann HiLo',
            donchianPeriod: 'Período Donchian High',
            donchianThresholdPct: 'Umbral Donchian High (%)',
            orderExpiryBars: 'Expiración Buy Stop (Velas)',
            timeExitBars: 'Salida Temporal (Velas)',
            filterSession: 'Filtro Sesión Londres/NY',
            sessionStart: 'Hora Inicio Sesión UTC',
            sessionEnd: 'Hora Fin Sesión UTC'
        };
        return labels[key] || key;
    }

    // =========================================================================
    // MARCADORES VISUALES EN LIGHTWEIGHT CHARTS
    // =========================================================================
    actualizarMarcadoresEnGrafico() {
        // Asegurar que el gráfico principal NUNCA tenga marcadores para no confundir
        if (window.activePriceSeries && typeof window.activePriceSeries.setMarkers === 'function') {
            window.activePriceSeries.setMarkers([]);
        }

        this.garantizarBacktestChart();
        const btSeries = this.backtestCandleSeries;
        if (!btSeries || typeof btSeries.setMarkers !== 'function') return;

        if (!this.markersVisible || !this.lastBacktestResult || !this.lastBacktestResult.trades.length) {
            btSeries.setMarkers([]);
            return;
        }

        const trades = this.lastBacktestResult.trades;
        const markers = [];

        trades.forEach(t => {
            const isLong = t.type === 'LONG';
            const isWin = t.pnl >= 0;

            // 1. Marcador de Entrada
            markers.push({
                time: t.entryTime,
                position: isLong ? 'belowBar' : 'aboveBar',
                color: isLong ? '#089981' : '#f23645',
                shape: isLong ? 'arrowUp' : 'arrowDown',
                text: `${isLong ? '▲ Long' : '▼ Short'} @ ${this.formatPrecio(t.entryPrice)}`,
                size: 1
            });

            // 2. Marcador de Salida
            markers.push({
                time: t.exitTime,
                position: isLong ? 'aboveBar' : 'belowBar',
                color: isWin ? '#089981' : '#f23645',
                shape: 'circle',
                text: `✕ Salida ${isWin ? '+' : ''}$${t.pnl.toFixed(2)} (${isWin ? '+' : ''}${t.returnPct.toFixed(2)}%)`,
                size: 1
            });
        });

        // Requisito estricto LWC: Orden cronológico ascendente por 'time'
        markers.sort((a, b) => a.time - b.time);
        btSeries.setMarkers(markers);
    }

    actualizarVisibilidadMarcadores() {
        const text = this.markersVisible ? '🏷️ Marcadores: ON' : '🏷️ Marcadores: OFF';
        const clsActive = this.markersVisible;

        if (this.dom.btnToggleMarkers) {
            this.dom.btnToggleMarkers.innerText = text;
            if (clsActive) {
                this.dom.btnToggleMarkers.classList.add('toggle-active');
                this.dom.btnToggleMarkers.classList.remove('toggle-inactive');
            } else {
                this.dom.btnToggleMarkers.classList.add('toggle-inactive');
                this.dom.btnToggleMarkers.classList.remove('toggle-active');
            }
        }

        const btnBottom = document.getElementById('btn-bottom-toggle-markers');
        if (btnBottom) btnBottom.innerText = text;
        const btnTop = document.getElementById('btn-toggle-markers-top');
        if (btnTop) btnTop.innerText = text;

        this.actualizarMarcadoresEnGrafico();
    }

    // =========================================================================
    // PARSER & TRANSPILADOR DE BOTS METATRADER 5 (.MQ5 / .EX5 / .JSON)
    // =========================================================================
    extractStringsFromBuffer(buffer) {
        if (!buffer) return [];
        let bytes;
        if (buffer instanceof Uint8Array) {
            bytes = buffer;
        } else if (buffer instanceof ArrayBuffer) {
            bytes = new Uint8Array(buffer);
        } else if (buffer.buffer && buffer.byteOffset !== undefined) {
            bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        } else {
            bytes = new Uint8Array(buffer);
        }
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

    parseEX5(buffer, filename = '') {
        const strings = this.extractStringsFromBuffer(buffer);
        const cleanName = filename ? filename.replace(/\.ex5$/i, '').replace(/[_-]/g, ' ') : 'Bot MT5 Compilado';

        const bot = {
            id: 'bot_ex5_' + Date.now(),
            name: cleanName,
            symbol: (this.dom.selectSymbol ? this.dom.selectSymbol.value : 'BTC-USD'),
            symbols: [(this.dom.selectSymbol ? this.dom.selectSymbol.value : 'BTC-USD')],
            timeframe: (this.dom.selectTf ? this.dom.selectTf.value : '1h'),
            magic: Math.floor(1000 + Math.random() * 8999),
            description: `Expert Advisor MT5 compilado (.ex5) con parámetros extraídos dinámicamente del binario.`,
            strategyType: 'donchian_breakout',
            category: 'Bot MT5 (.ex5)',
            riskMode: 'LOTS',
            riskValue: 0.10,
            params: {
                donchianPeriod: 20,
                atrPeriod: 14,
                slAtrMult: 1.5,
                tpAtrMult: 3.0,
                stopLossPct: 2.0,
                takeProfitPct: 4.5
            }
        };

        // Escanear cadenas en busca de Magic Number, inputs y patrones
        strings.forEach(s => {
            const lower = s.toLowerCase();
            if (lower.includes('magic') && /\d+/.test(s)) {
                const match = s.match(/magic[^\d]*(\d+)/i) || s.match(/\d+/);
                if (match) {
                    const num = parseInt(match[1] || match[0], 10);
                    if (num > 100) bot.magic = num;
                }
            }
            if (s.startsWith('Inp') || s.startsWith('inp')) {
                const paramName = s.replace(/^inp/i, '');
                const cleanKey = paramName.charAt(0).toLowerCase() + paramName.slice(1);
                if (!bot.params[cleanKey]) {
                    if (cleanKey.toLowerCase().includes('period') || cleanKey.toLowerCase().includes('len')) {
                        bot.params[cleanKey] = 20;
                    } else if (cleanKey.toLowerCase().includes('mult') || cleanKey.toLowerCase().includes('ratio')) {
                        bot.params[cleanKey] = 1.5;
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
                bot.strategyType = 'cruce_ema';
            } else if (lower.includes('breakout') || lower.includes('donchian')) {
                bot.strategyType = 'donchian_breakout';
            }
        });

        return bot;
    }

    parseMQL5(code, filename = '') {
        const cleanName = filename ? filename.replace(/\.(mq5|txt)$/i, '').replace(/[_-]/g, ' ') : 'Bot MQL5';
        const bot = {
            id: 'bot_mql5_' + Date.now(),
            name: cleanName,
            symbol: (this.dom.selectSymbol ? this.dom.selectSymbol.value : 'BTC-USD'),
            symbols: [(this.dom.selectSymbol ? this.dom.selectSymbol.value : 'BTC-USD')],
            timeframe: (this.dom.selectTf ? this.dom.selectTf.value : '1h'),
            magic: Math.floor(1000 + Math.random() * 8999),
            description: 'Expert Advisor MQL5 personalizado.',
            strategyType: 'donchian_breakout',
            category: 'Bot MT5 (.mq5)',
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
        }

        // Detectar tipo de estrategia según indicadores presentes
        const codeLower = code.toLowerCase();
        if (/\bvcp\b/i.test(codeLower) || (codeLower.includes('bands') && codeLower.includes('donchian'))) {
            bot.strategyType = 'vcp_squeeze';
        } else if (/\b(squeeze|keltner)\b/i.test(codeLower)) {
            bot.strategyType = 'sqz_momentum';
        } else if (/\b(ema|ima|moving_average)\b/i.test(codeLower)) {
            bot.strategyType = 'cruce_ema';
        } else if (/\b(macd|imacd)\b/i.test(codeLower)) {
            bot.strategyType = 'macd_trend';
        } else if (/\b(donchian|breakout|channel)\b/i.test(codeLower)) {
            bot.strategyType = 'donchian_breakout';
        } else if (/\b(rsi|irsi|relative_strength)\b/i.test(codeLower)) {
            bot.strategyType = 'rsi_reversion';
        }

        // Parámetros por defecto si está vacío
        if (Object.keys(bot.params).length === 0) {
            bot.params = {
                fastPeriod: 20,
                slowPeriod: 50,
                donchianPeriod: 24,
                atrPeriod: 14,
                stopLossPct: 2.0,
                takeProfitPct: 4.5
            };
        }

        return bot;
    }

    procesarArchivoBot(file) {
        if (!file) return;
        const name = file.name;
        const lower = name.toLowerCase();

        const statusEl = this.dom.btImportStatus;
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.innerText = `⏳ Analizando archivo: ${name}...`;
        }

        if (lower.endsWith('.mq5') || lower.endsWith('.txt')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const code = e.target.result;
                const bot = this.parseMQL5(code, name);
                this.cargarBotEnFormularioImport(bot);
                if (statusEl) {
                    statusEl.innerText = `✅ Bot MQL5 '${bot.name}' analizado: ${Object.keys(bot.params).length} parámetros detectados.`;
                }
            };
            reader.readAsText(file);
        } else if (lower.endsWith('.ex5')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const buffer = e.target.result;
                const bot = this.parseEX5(buffer, name);
                this.cargarBotEnFormularioImport(bot);
                if (statusEl) {
                    statusEl.innerText = `✅ Binario MT5 (.ex5) '${bot.name}' descompilado: Magic ${bot.magic}, ${Object.keys(bot.params).length} parámetros descubiertos.`;
                }
            };
            reader.readAsArrayBuffer(file);
        } else if (lower.endsWith('.json')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const parsed = JSON.parse(e.target.result);
                    const bot = {
                        id: parsed.id || 'bot_' + Date.now(),
                        name: parsed.name || name.replace(/\.json$/i, ''),
                        symbol: parsed.symbol || (this.dom.selectSymbol ? this.dom.selectSymbol.value : 'BTC-USD'),
                        symbols: parsed.symbols || [parsed.symbol || 'BTC-USD'],
                        timeframe: parsed.timeframe || '1h',
                        magic: parsed.magic || 1001,
                        description: parsed.description || 'Estrategia JSON cuantitativa',
                        strategyType: parsed.strategyType || parsed.id || 'donchian_breakout',
                        category: parsed.category || 'Bot Personalizado',
                        params: parsed.params || {}
                    };
                    this.cargarBotEnFormularioImport(bot);
                    if (statusEl) {
                        statusEl.innerText = `✅ Estrategia JSON '${bot.name}' cargada correctamente.`;
                    }
                } catch (err) {
                    if (statusEl) statusEl.innerText = `⚠️ Error al parsear JSON: ${err.message}`;
                }
            };
            reader.readAsText(file);
        } else {
            if (statusEl) statusEl.innerText = `⚠️ Extensión no reconocida. Selecciona un archivo .mq5, .ex5 o .json`;
        }
    }

    cargarBotEnFormularioImport(bot) {
        this.currentImportBot = bot;

        if (this.dom.btImportName) this.dom.btImportName.value = bot.name || '';
        if (this.dom.btImportMagic) this.dom.btImportMagic.value = bot.magic || 1001;
        if (this.dom.btImportStrat) this.dom.btImportStrat.value = bot.strategyType || 'donchian_breakout';
        if (this.dom.btImportSymbols) {
            this.dom.btImportSymbols.value = (bot.symbols && bot.symbols.length) 
                ? bot.symbols.join(', ') 
                : (bot.symbol || (this.dom.selectSymbol ? this.dom.selectSymbol.value : 'BTC-USD'));
        }

        this.renderizarImportParamsGrid(bot.params || {});

        if (this.dom.strategyModalEditor) {
            this.dom.strategyModalEditor.value = JSON.stringify(bot, null, 2);
        }
    }

    renderizarImportParamsGrid(params) {
        const grid = this.dom.btImportParamsGrid;
        if (!grid) return;

        const entries = Object.entries(params);
        if (entries.length === 0) {
            grid.innerHTML = '<div style="color:var(--tv-text-secondary); font-size:12px; grid-column:1/-1;">Sin parámetros configurables.</div>';
            return;
        }

        grid.innerHTML = entries.map(([key, val]) => {
            const label = this.formatearEtiquetaParametro(key);
            const isBool = typeof val === 'boolean';
            const isNum = typeof val === 'number';

            if (isBool) {
                return `
                    <div class="prop-row" style="background:#131722; padding:6px 10px; border-radius:4px; border:1px solid var(--tv-border);">
                        <label style="font-size:11px;">${label}:</label>
                        <input type="checkbox" id="import-param-${key}" ${val ? 'checked' : ''} style="cursor:pointer;">
                    </div>
                `;
            } else {
                return `
                    <div class="prop-row" style="background:#131722; padding:6px 10px; border-radius:4px; border:1px solid var(--tv-border);">
                        <label style="font-size:11px;">${label}:</label>
                        <input type="number" id="import-param-${key}" value="${val}" step="${isNum && !Number.isInteger(val) ? '0.1' : '1'}" style="width:70px; background:#1e222d; border:1px solid #2a2e39; color:#fff; border-radius:3px; padding:3px 6px;">
                    </div>
                `;
            }
        }).join('');
    }

    importarBotDesdeEditor() {
        const modal = this.dom.strategyImportModal;
        let bot = this.currentImportBot || {};

        const name = (this.dom.btImportName && this.dom.btImportName.value.trim()) || bot.name || 'Bot Personalizado';
        const magic = (this.dom.btImportMagic && parseInt(this.dom.btImportMagic.value, 10)) || bot.magic || 1001;
        const stratType = (this.dom.btImportStrat && this.dom.btImportStrat.value) || bot.strategyType || 'donchian_breakout';
        
        let symbolsRaw = (this.dom.btImportSymbols && this.dom.btImportSymbols.value.trim()) || 'BTC-USD';
        const symbols = symbolsRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
        const isMulti = symbols.length > 1;

        // Recoger parámetros dinámicos
        const finalParams = { ...(bot.params || {}) };
        Object.keys(finalParams).forEach(k => {
            const input = document.getElementById(`import-param-${k}`);
            if (input) {
                if (input.type === 'checkbox') finalParams[k] = input.checked;
                else finalParams[k] = parseFloat(input.value) || 0;
            }
        });

        // Asegurar que parámetros esenciales estén definidos
        if (!finalParams.stopLossPct) finalParams.stopLossPct = 2.0;
        if (!finalParams.takeProfitPct) finalParams.takeProfitPct = 4.5;

        const botId = bot.id || ('bot_' + Date.now());

        const finalBot = {
            id: botId,
            name: `🤖 ${name}`,
            category: isMulti ? 'Bot Multi-Activo' : 'Bot Personalizado',
            description: bot.description || `Estrategia personalizada (${stratType})`,
            strategyType: stratType,
            multiAsset: isMulti,
            symbols: symbols,
            symbol: symbols[0] || 'BTC-USD',
            magic: magic,
            params: finalParams
        };

        // Registrar en el Strategy Tester
        this.customStrategies.set(botId, finalBot);
        this.activeStrategyId = botId;

        // Sincronizar con la Flota de MT5 para que esté disponible en vivo
        if (window.MT5Emulator && window.MT5Emulator.botsCatalog) {
            window.MT5Emulator.botsCatalog[botId] = {
                id: botId,
                name: name,
                enabled: true,
                symbol: symbols[0] || 'BTC-USD',
                symbols: symbols,
                multiAsset: isMulti,
                timeframe: '1h',
                strategyType: stratType,
                magic: magic,
                riskMode: 'LOTS',
                riskValue: 0.10,
                params: finalParams
            };
        }

        // Si es multi-activo, conmutar tester al modo multi-activo
        if (isMulti) {
            this.isMultiAsset = true;
            if (this.dom.btModeSelect) this.dom.btModeSelect.value = 'multi';
            if (this.dom.btSingleSymbolWrap) this.dom.btSingleSymbolWrap.style.display = 'none';
            if (this.dom.btMultiSymbolWrap) this.dom.btMultiSymbolWrap.style.display = 'flex';
            if (this.dom.btMultiSymbolsInput) this.dom.btMultiSymbolsInput.value = symbols.join(', ');
        }

        this.poblarSelectoresEstrategia();
        this.renderizarFormularioPropiedades();

        if (modal) modal.style.display = 'none';
        console.log(`🤖 Bot '${name}' cargado con éxito en el Tester. Ejecutando backtest...`);
        this.ejecutarBacktest();
    }

    importarDesdeFlotaMT5() {
        const fleetBots = (window.MT5Emulator && window.MT5Emulator.botsCatalog) ? window.MT5Emulator.botsCatalog : {};
        const botKeys = Object.keys(fleetBots);

        if (botKeys.length === 0) {
            alert("⚠️ No hay bots activos configurados en la flota del emulador MT5.");
            return;
        }

        const botListNames = botKeys.map((k, i) => `${i + 1}. ${fleetBots[k].name} (${fleetBots[k].strategyType || 'Breakout'})`).join('\n');
        const elegida = prompt(`Seleccione el número del bot de la Flota MT5 a importar al Tester:\n\n${botListNames}`, "1");
        if (!elegida) return;

        const idx = parseInt(elegida, 10) - 1;
        if (idx >= 0 && idx < botKeys.length) {
            const b = fleetBots[botKeys[idx]];
            this.cargarBotEnFormularioImport(b);
            const statusEl = this.dom.btImportStatus;
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.innerText = `✅ Bot '${b.name}' importado desde la Flota MT5.`;
            }
        }
    }

    initModalImportacion() {
        const modal = this.dom.strategyImportModal;
        if (!modal) return;

        const btnClose = document.getElementById('modal-strategy-close');
        const btnCancel = document.getElementById('btn-strategy-import-cancel');
        const btnApply = document.getElementById('btn-strategy-import-apply');
        const btnPickFile = document.getElementById('btn-bt-pick-bot-file');
        const fileInput = document.getElementById('strategy-modal-file');
        const dropzone = this.dom.btDropzoneBot;
        const btnFleet = this.dom.btnBtImportFromFleet;

        const cerrarModal = () => { modal.style.display = 'none'; };
        if (btnClose) btnClose.onclick = cerrarModal;
        if (btnCancel) btnCancel.onclick = cerrarModal;

        if (btnPickFile && fileInput) {
            btnPickFile.onclick = () => fileInput.click();
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.procesarArchivoBot(file);
            });
        }

        // Drag & drop en dropzone de bot
        if (dropzone) {
            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.style.borderColor = 'var(--tv-blue)';
                dropzone.style.background = 'rgba(41,98,255,0.08)';
            });
            dropzone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dropzone.style.borderColor = 'var(--tv-border)';
                dropzone.style.background = 'rgba(255,255,255,0.02)';
            });
            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.style.borderColor = 'var(--tv-border)';
                dropzone.style.background = 'rgba(255,255,255,0.02)';
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    this.procesarArchivoBot(e.dataTransfer.files[0]);
                }
            });
        }

        if (btnFleet) {
            btnFleet.onclick = () => this.importarDesdeFlotaMT5();
        }

        if (btnApply) {
            btnApply.onclick = () => this.importarBotDesdeEditor();
        }
    }

    // =========================================================================
    // GESTOR DE DATOS HISTÓRICOS CSV Y LECTURA DE CARPETAS
    // =========================================================================
    parseCSVData(csvText, fileName = '') {
        if (!csvText || typeof csvText !== 'string') return [];
        const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
        if (lines.length < 2) return [];

        // Detectar delimitador analizando la primera línea
        const headerLine = lines[0];
        let delimiter = ',';
        if (headerLine.includes('\t')) delimiter = '\t';
        else if (headerLine.includes(';')) delimiter = ';';

        const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

        // Localizar índices de columnas
        let idxTime = -1, idxDate = -1, idxOnlyTime = -1;
        let idxOpen = -1, idxHigh = -1, idxLow = -1, idxClose = -1, idxVol = -1;

        headers.forEach((h, i) => {
            if (h === 'datetime' || h === 'timestamp' || h === 'time_utc' || h === 'open_time' || h === '0') {
                idxTime = i;
            } else if (h === 'date' || h === '<date>') {
                idxDate = i;
            } else if (h === 'time' || h === '<time>') {
                idxOnlyTime = i;
            } else if (h === 'open' || h === 'bid_open' || h === '<open>') {
                idxOpen = i;
            } else if (h === 'high' || h === 'bid_high' || h === '<high>') {
                idxHigh = i;
            } else if (h === 'low' || h === 'bid_low' || h === '<low>') {
                idxLow = i;
            } else if (h === 'close' || h === 'bid_close' || h === '<close>') {
                idxClose = i;
            } else if (h.includes('vol') || h === '<vol>' || h === '<tickvol>') {
                idxVol = i;
            }
        });

        // Si no se detectó cabecera explícita, usar orden estándar por defecto
        if (idxOpen === -1 && lines.length > 1) {
            idxTime = 0;
            idxOpen = 1;
            idxHigh = 2;
            idxLow = 3;
            idxClose = 4;
            idxVol = 5;
        }

        const candles = [];
        let baseTime = Math.floor(Date.now() / 1000) - (lines.length * 3600);

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(delimiter).map(p => p.trim().replace(/['"]/g, ''));
            if (parts.length < 4) continue;

            // Extraer tiempo
            let ts = 0;
            let timeStr = '';
            if (idxDate !== -1 && idxOnlyTime !== -1) {
                timeStr = `${parts[idxDate]} ${parts[idxOnlyTime]}`;
            } else if (idxTime !== -1) {
                timeStr = parts[idxTime];
            } else if (idxDate !== -1) {
                timeStr = parts[idxDate];
            }

            if (timeStr) {
                // Normalizar puntos en fechas MT5: "2024.01.02" -> "2024-01-02"
                const normalizedDate = timeStr.replace(/(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3');
                const parsedDate = Date.parse(normalizedDate);
                if (!isNaN(parsedDate)) {
                    ts = Math.floor(parsedDate / 1000);
                } else if (!isNaN(Number(timeStr))) {
                    const num = Number(timeStr);
                    ts = num > 100000000000 ? Math.floor(num / 1000) : num;
                }
            }

            if (!ts || isNaN(ts) || ts <= 0) {
                ts = baseTime + (i * 3600);
            }

            const o = parseFloat(parts[idxOpen !== -1 ? idxOpen : 1]);
            const h = parseFloat(parts[idxHigh !== -1 ? idxHigh : 2]);
            const l = parseFloat(parts[idxLow !== -1 ? idxLow : 3]);
            const c = parseFloat(parts[idxClose !== -1 ? idxClose : 4]);
            const v = (idxVol !== -1 && parts[idxVol]) ? parseFloat(parts[idxVol]) : 100;

            if (!isNaN(o) && !isNaN(h) && !isNaN(l) && !isNaN(c) && o > 0 && h > 0 && l > 0 && c > 0) {
                candles.push({
                    time: ts,
                    open: o,
                    high: Math.max(h, o, c),
                    low: Math.min(l, o, c),
                    close: c,
                    volume: isNaN(v) ? 100 : v
                });
            }
        }

        // Ordenar cronológicamente y limpiar duplicados de timestamp
        candles.sort((a, b) => a.time - b.time);
        const deduplicated = [];
        let prevT = 0;
        for (const c of candles) {
            if (c.time > prevT) {
                deduplicated.push(c);
                prevT = c.time;
            }
        }

        return deduplicated;
    }

    detectarSimboloDeNombre(fileName = '') {
        const clean = fileName.toUpperCase().replace(/\.(CSV|TXT)$/i, '');
        const symsConocidos = ['XAUUSD', 'GOLD', 'BTC-USD', 'BTCUSD', 'ETH-USD', 'ETHUSD', 'SOL-USD', 'SOLUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'NASDAQ', 'NDX', 'SP500', 'SPX', 'NVDA', 'AAPL', 'TSLA'];

        for (const s of symsConocidos) {
            if (clean.includes(s.replace('-', '')) || clean.includes(s)) {
                return s.includes('BTC') ? 'BTC-USD' : (s.includes('ETH') ? 'ETH-USD' : (s.includes('SOL') ? 'SOL-USD' : (s === 'GOLD' ? 'XAUUSD' : s)));
            }
        }

        const match = clean.match(/^([A-Z0-9_-]+)/);
        return match ? match[1] : 'CUSTOM-SYM';
    }

    registrarDatasetCSV(symbol, candles, fileName = '') {
        if (!candles || candles.length < 5) return;
        this.csvDatasets[symbol] = candles;

        const count = Object.keys(this.csvDatasets).length;
        if (this.dom.btCsvBadge) {
            this.dom.btCsvBadge.innerText = `${count} CSV`;
            this.dom.btCsvBadge.style.display = 'inline-block';
        }

        this.poblarSelectoresEstrategia();
        this.renderizarTablaDatasetsCSV();
        console.log(`📊 Dataset CSV '${symbol}' registrado: ${candles.length} velas.`);
    }

    renderizarTablaDatasetsCSV() {
        const tbody = this.dom.btCsvTableBody;
        if (!tbody) return;

        const entries = Object.entries(this.csvDatasets);
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--tv-text-secondary);">No hay datasets CSV cargados aún.</td></tr>';
            return;
        }

        const formatDate = (ts) => {
            const d = new Date(ts * 1000);
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
        };

        tbody.innerHTML = entries.map(([sym, candles]) => {
            const first = candles[0];
            const last = candles[candles.length - 1];
            const range = `${formatDate(first.time)} ➔ ${formatDate(last.time)}`;

            return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:8px; font-weight:bold; color:var(--tv-blue);">${sym}</td>
                    <td style="padding:8px; font-weight:bold; color:#fff;">${candles.length.toLocaleString()}</td>
                    <td style="padding:8px; color:var(--tv-text-secondary); font-size:11px;">${range}</td>
                    <td style="padding:8px; font-size:11px;">$${last.close.toFixed(2)}</td>
                    <td style="padding:8px; display:flex; gap:6px;">
                        <button class="btn-table-action" onclick="window.StrategyTester.usarDatasetEnGrafico('${sym}')" style="background:#089981; color:#fff; border:none; padding:3px 8px; border-radius:3px; cursor:pointer;">▶ Usar</button>
                        <button class="btn-table-action" onclick="window.StrategyTester.eliminarDatasetCSV('${sym}')" style="background:#f23645; color:#fff; border:none; padding:3px 8px; border-radius:3px; cursor:pointer;">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    usarDatasetEnGrafico(symbol) {
        if (!this.csvDatasets[symbol]) return;
        this.isMultiAsset = false;
        if (this.dom.btModeSelect) this.dom.btModeSelect.value = 'single';
        if (this.dom.btSingleSymbolWrap) this.dom.btSingleSymbolWrap.style.display = 'flex';
        if (this.dom.btMultiSymbolWrap) this.dom.btMultiSymbolWrap.style.display = 'none';

        if (this.dom.selectSymbol) {
            this.dom.selectSymbol.value = symbol;
        }

        this.currentCandles = this.csvDatasets[symbol];
        if (this.dom.btCsvModal) this.dom.btCsvModal.style.display = 'none';
        this.ejecutarBacktest();
    }

    eliminarDatasetCSV(symbol) {
        delete this.csvDatasets[symbol];
        const count = Object.keys(this.csvDatasets).length;
        if (this.dom.btCsvBadge) {
            if (count > 0) {
                this.dom.btCsvBadge.innerText = `${count} CSV`;
                this.dom.btCsvBadge.style.display = 'inline-block';
            } else {
                this.dom.btCsvBadge.style.display = 'none';
            }
        }
        this.poblarSelectoresEstrategia();
        this.renderizarTablaDatasetsCSV();
    }

    procesarArchivosCSV(files) {
        if (!files || files.length === 0) return;
        const statusEl = this.dom.btCsvStatus;
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.innerText = `⏳ Procesando ${files.length} archivo(s)...`;
        }

        let procesados = 0;
        Array.from(files).forEach(file => {
            if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.txt')) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                const candles = this.parseCSVData(text, file.name);
                if (candles && candles.length >= 10) {
                    const sym = this.detectarSimboloDeNombre(file.name);
                    this.registrarDatasetCSV(sym, candles, file.name);
                    procesados++;
                }

                if (statusEl) {
                    statusEl.innerText = `✅ Procesados ${procesados} datasets CSV válidos.`;
                }
            };
            reader.readAsText(file);
        });
    }

    async autoEscanearCarpetaCSV() {
        const statusEl = this.dom.btCsvStatus;
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.innerText = '🔍 Escaneando directorio raíz y subcarpetas en busca de archivos CSV...';
        }

        try {
            const resp = await fetch('/api/backtest/list_csvs');
            if (!resp.ok) throw new Error('Servidor local no disponible');
            const data = await resp.json();

            if (!data.success || !data.files || data.files.length === 0) {
                if (statusEl) statusEl.innerText = 'ℹ️ No se encontraron archivos .csv en el proyecto.';
                return;
            }

            let importados = 0;
            for (const f of data.files) {
                try {
                    const readResp = await fetch(`/api/backtest/read_csv?file=${encodeURIComponent(f.name)}&limit=50000`);
                    if (readResp.ok) {
                        const csvContent = await readResp.text();
                        const candles = this.parseCSVData(csvContent, f.name);
                        if (candles && candles.length >= 10) {
                            this.registrarDatasetCSV(f.symbol || this.detectarSimboloDeNombre(f.name), candles, f.name);
                            importados++;
                        }
                    }
                } catch(e) {}
            }

            if (statusEl) {
                statusEl.innerText = `✅ Auto-escaneo completado: ${importados} datasets CSV cargados automáticamente.`;
            }
        } catch (err) {
            if (statusEl) {
                statusEl.innerText = `⚠️ Error al escanear: ${err.message}. Puedes usar 'Cargar Carpeta Completa' directamente.`;
            }
        }
    }

    initModalCSV() {
        const modal = this.dom.btCsvModal;
        if (!modal) return;

        const btnClose = this.dom.modalCsvClose;
        const btnDone = this.dom.btnCsvModalDone;
        const btnOpen = this.dom.btnBtCargarCsv;
        const dropzone = this.dom.btCsvDropzone;
        const fileInput = this.dom.btCsvFileInput;
        const folderInput = this.dom.btCsvFolderInput;
        const btnPickFiles = this.dom.btnBtPickCsvFiles;
        const btnPickFolder = this.dom.btnBtPickCsvFolder;
        const btnAutoScan = this.dom.btnBtAutoScanCsvs;
        const btnClear = this.dom.btnBtClearCsvs;

        const cerrarModal = () => { modal.style.display = 'none'; };
        if (btnClose) btnClose.onclick = cerrarModal;
        if (btnDone) btnDone.onclick = cerrarModal;

        if (btnOpen) {
            btnOpen.onclick = () => {
                modal.style.display = 'flex';
                this.renderizarTablaDatasetsCSV();
            };
        }

        if (btnPickFiles && fileInput) {
            btnPickFiles.onclick = () => fileInput.click();
        }
        if (fileInput) {
            fileInput.onchange = (e) => this.procesarArchivosCSV(e.target.files);
        }

        if (btnPickFolder && folderInput) {
            btnPickFolder.onclick = () => folderInput.click();
        }
        if (folderInput) {
            folderInput.onchange = (e) => this.procesarArchivosCSV(e.target.files);
        }

        if (btnAutoScan) {
            btnAutoScan.onclick = () => this.autoEscanearCarpetaCSV();
        }

        if (btnClear) {
            btnClear.onclick = () => {
                this.csvDatasets = {};
                if (this.dom.btCsvBadge) this.dom.btCsvBadge.style.display = 'none';
                this.poblarSelectoresEstrategia();
                this.renderizarTablaDatasetsCSV();
            };
        }

        // Drag & drop de CSV o Carpetas
        if (dropzone) {
            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.style.borderColor = 'var(--tv-blue)';
                dropzone.style.background = 'rgba(41,98,255,0.08)';
            });
            dropzone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dropzone.style.borderColor = 'var(--tv-border)';
                dropzone.style.background = 'rgba(255,255,255,0.02)';
            });
            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.style.borderColor = 'var(--tv-border)';
                dropzone.style.background = 'rgba(255,255,255,0.02)';
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    this.procesarArchivosCSV(e.dataTransfer.files);
                }
            });
        }
    }

    // =========================================================================
    // UTILIDADES & NOTIFICACIONES
    // =========================================================================
    getEstrategiaActiva() {
        return this.preloadedStrategies[this.activeStrategyId] || this.customStrategies.get(this.activeStrategyId);
    }

    onCandlesLoaded() {
        // Ejecutar backtest automático cuando se cargan nuevas velas en la app principal
        this.ejecutarBacktest();
    }

    formatPrecio(price) {
        if (price === undefined || price === null || isNaN(price)) return '0.00';
        const absP = Math.abs(price);
        if (absP === 0) return '0.00';
        if (absP < 0.0001) return price.toFixed(8);
        if (absP < 0.01) return price.toFixed(6);
        if (absP < 1) return price.toFixed(4);
        return price.toFixed(2);
    }
}

// Instanciar globalmente y asociar con el ciclo de vida del DOM
document.addEventListener('DOMContentLoaded', () => {
    window.StrategyTester = new StrategyTester();
});
