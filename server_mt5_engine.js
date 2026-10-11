/**
 * server_mt5_engine.js - Motor Autónomo de Ejecución Virtual MT5 24/7 Multi-Activo
 * Ejecuta bots de trading institucionales de forma continua en segundo plano en Node.js
 * Compatible con Render Cloud, VPS y servidores locales.
 */

import fs from 'fs';
import path from 'path';

export class ServerMT5Daemon {
    constructor(options = {}) {
        this.cacheDir = options.cacheDir || './quantvisor_cache';
        this.stateFile = path.join(this.cacheDir, 'mt5_daemon_state.json');
        this.fetchCandlesFn = options.fetchCandlesFn || null;

        this.isRunning = false;
        this.timer = null;
        this.pollIntervalMs = options.pollIntervalMs || 10000; // 10 segundos por ciclo

        // Símbolos por defecto del Portafolio Multi-Activo
        this.symbols = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XAUUSD', 'EURUSD'];
        this.activeBotId = 'multiasset_champion';

        // Especificaciones Institucionales de Contrato MT5
        this.symbolSpecs = {
            'XAUUSD':   { contractSize: 100,    pointVal: 100,    spread: 1.2,     commPerLot: 5.0, digits: 2 },
            'BTC-USD':  { contractSize: 1,      pointVal: 1,      spread: 4.5,     commPerLot: 3.0, digits: 2 },
            'ETH-USD':  { contractSize: 1,      pointVal: 1,      spread: 0.5,     commPerLot: 2.0, digits: 2 },
            'SOL-USD':  { contractSize: 1,      pointVal: 1,      spread: 0.1,     commPerLot: 1.5, digits: 2 },
            'EURUSD':   { contractSize: 100000, pointVal: 100000, spread: 0.00008, commPerLot: 5.0, digits: 5 },
            'NASDAQ':   { contractSize: 20,     pointVal: 20,     spread: 1.5,     commPerLot: 4.0, digits: 2 },
            'SP500':    { contractSize: 50,     pointVal: 50,     spread: 0.4,     commPerLot: 4.0, digits: 2 }
        };

        // Configuración de Challenge Prop Firm
        this.challengeConfig = {
            tier: 100000,
            dailyLossLimitPct: 5.0,
            maxTotalLossPct: 10.0,
            profitTargetPct: 8.0,
            leverage: 100,
            riskMode: 'LOTS',        // 'LOTS' (Fijo) o 'PCT' (%)
            riskValue: 0.10,         // 0.10 lotes o 1.0%
            maxOpenPerAsset: 1,      // Máximo 1 orden abierta por activo
            maxTotalOpen: 5          // Máximo 5 órdenes en todo el portafolio
        };

        // Estado de Cuenta
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
            status: 'ACTIVE'         // 'ACTIVE', 'WARNING', 'PASSED', 'VIOLATED'
        };

        this.openPositions = [];
        this.closedPositions = [];
        this.nextTicket = 508001;
        this.equityHistory = [{
            time: Math.floor(Date.now() / 1000),
            balance: 100000,
            equity: 100000
        }];
        this.journalLogs = [];

        // Estado en tiempo real de cada activo del portafolio
        this.assetMatrix = {};
        this.symbols.forEach(sym => {
            this.assetMatrix[sym] = {
                symbol: sym,
                price: 0,
                signal: 'WAITING',
                openTradesCount: 0,
                floatingPnL: 0,
                atr: 0,
                lastUpdate: Math.floor(Date.now() / 1000)
            };
        });

        // Catálogo de Bots Multi-Activo
        this.botsCatalog = {
            multiasset_champion: {
                id: 'multiasset_champion',
                name: 'Mega Alpha Multi-Asset Champion (Crypto + Oro + Forex)',
                multiAsset: true,
                symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XAUUSD', 'EURUSD'],
                timeframe: '1h',
                strategyType: 'donchian_breakout',
                magic: 8801,
                description: 'Estrategia institucional que opera concurrentemente sobre Bitcoin, Ethereum, Solana, Oro y EURUSD.',
                params: {
                    donchianPeriod: 24,
                    atrPeriod: 14,
                    slAtrMult: 1.5,
                    tpAtrMult: 3.0,
                    useTrailing: true,
                    trailingAtrMult: 1.2
                }
            },
            crypto_vcp_ensemble: {
                id: 'crypto_vcp_ensemble',
                name: 'Crypto Basket VCP Squeeze (BTC, ETH, SOL)',
                multiAsset: true,
                symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
                timeframe: '1h',
                strategyType: 'vcp_squeeze',
                magic: 8802,
                description: 'Rotura asimétrica de volatilidad con filtro tendencial EMA 200 en canasta cripto.',
                params: {
                    emaPeriod: 200,
                    donchianPeriod: 20,
                    atrPeriod: 14,
                    slAtrMult: 1.25,
                    tpAtrMult: 3.2,
                    useTrailing: true
                }
            }
        };

        this.cargarEstadoPersistente();
        this.log(`[DaemonInit] Motor MT5 24/7 inicializado con cesta: [${this.symbols.join(', ')}].`);
    }

    // =========================================================================
    // PERSISTENCIA EN DISCO
    // =========================================================================
    cargarEstadoPersistente() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const raw = fs.readFileSync(this.stateFile, 'utf8');
                const saved = JSON.parse(raw);
                if (saved) {
                    if (saved.account) this.account = Object.assign(this.account, saved.account);
                    if (Array.isArray(saved.openPositions)) this.openPositions = saved.openPositions;
                    if (Array.isArray(saved.closedPositions)) this.closedPositions = saved.closedPositions;
                    if (Array.isArray(saved.equityHistory)) this.equityHistory = saved.equityHistory;
                    if (Array.isArray(saved.symbols) && saved.symbols.length > 0) this.symbols = saved.symbols;
                    if (saved.activeBotId && this.botsCatalog[saved.activeBotId]) this.activeBotId = saved.activeBotId;
                    if (saved.challengeConfig) this.challengeConfig = Object.assign(this.challengeConfig, saved.challengeConfig);
                    if (saved.nextTicket) this.nextTicket = saved.nextTicket;
                    if (saved.isRunning !== undefined) this.isRunning = saved.isRunning;
                }
            }
        } catch (e) {
            console.warn('[Daemon] Error al cargar estado persistente:', e.message);
        }
    }

    guardarEstadoPersistente() {
        try {
            const data = {
                account: this.account,
                openPositions: this.openPositions,
                closedPositions: this.closedPositions.slice(0, 100),
                equityHistory: this.equityHistory.slice(-500),
                symbols: this.symbols,
                activeBotId: this.activeBotId,
                challengeConfig: this.challengeConfig,
                nextTicket: this.nextTicket,
                isRunning: this.isRunning,
                lastSavedAt: new Date().toISOString()
            };
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
            fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2), 'utf8');
        } catch (e) {
            console.warn('[Daemon] Error al guardar estado persistente:', e.message);
        }
    }

    log(msg) {
        const timeStr = new Date().toLocaleTimeString();
        const entry = { time: timeStr, msg };
        this.journalLogs.unshift(entry);
        if (this.journalLogs.length > 300) this.journalLogs.pop();
        console.log(`[MT5 24/7] ${timeStr} - ${msg}`);
    }

    // =========================================================================
    // CONTROL DEL DAEMON 24/7
    // =========================================================================
    start() {
        if (this.isRunning && this.timer) return;
        this.isRunning = true;
        this.guardarEstadoPersistente();
        this.log(`🚀 [DaemonStarted] Bot MT5 24/7 activado en segundo plano. Escaneando ${this.symbols.length} activos.`);

        if (!this.timer) {
            this.timer = setInterval(() => this.ejecutarCiclo(), this.pollIntervalMs);
        }
        // Ejecutar primer ciclo inmediatamente
        this.ejecutarCiclo();
    }

    pause() {
        this.isRunning = false;
        this.guardarEstadoPersistente();
        this.log(`⏸ [DaemonPaused] Bot MT5 pausado en segundo plano.`);
    }

    stop() {
        this.pause();
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    setSymbols(symbolsArray) {
        if (!Array.isArray(symbolsArray) || symbolsArray.length === 0) return;
        this.symbols = [...new Set(symbolsArray)];
        this.symbols.forEach(s => {
            if (!this.assetMatrix[s]) {
                this.assetMatrix[s] = {
                    symbol: s,
                    price: 0,
                    signal: 'WAITING',
                    openTradesCount: 0,
                    floatingPnL: 0,
                    atr: 0,
                    lastUpdate: Math.floor(Date.now() / 1000)
                };
            }
        });
        this.guardarEstadoPersistente();
        this.log(`[SymbolsUpdated] Nueva cesta multi-activo: [${this.symbols.join(', ')}]`);
    }

    setBot(botConfig) {
        if (!botConfig || !botConfig.name) return;
        const id = botConfig.id || `custom_bot_${Date.now()}`;
        botConfig.id = id;
        this.botsCatalog[id] = botConfig;
        this.activeBotId = id;
        if (Array.isArray(botConfig.symbols) && botConfig.symbols.length > 0) {
            this.setSymbols(botConfig.symbols);
        }
        this.guardarEstadoPersistente();
        this.log(`[BotInstalled] Bot '${botConfig.name}' activado para ejecución 24/7.`);
    }

    // =========================================================================
    // CICLO PERIÓDICO MULTI-ACTIVO (EVERY 10 SECONDS)
    // =========================================================================
    async ejecutarCiclo() {
        try {
            // 1. Obtener datos y procesar cada símbolo de la cesta
            for (const sym of this.symbols) {
                await this.procesarSimbolo(sym);
            }

            // 2. Evaluar reglas de cumplimiento Prop Firm a nivel global de la cuenta
            this.evaluarReglasPropFirm();

            // 3. Registrar punto en la curva de capital si cambió la equidad o cada minuto
            const nowSec = Math.floor(Date.now() / 1000);
            const lastEq = this.equityHistory[this.equityHistory.length - 1];
            if (!lastEq || Math.abs(lastEq.equity - this.account.equity) >= 1 || (nowSec - lastEq.time >= 60)) {
                this.equityHistory.push({
                    time: nowSec,
                    balance: this.account.balance,
                    equity: this.account.equity
                });
                if (this.equityHistory.length > 1000) this.equityHistory.shift();
                this.guardarEstadoPersistente();
            }
        } catch (err) {
            console.error('[Daemon Error en ciclo]:', err.message);
        }
    }

    async procesarSimbolo(sym) {
        const bot = this.botsCatalog[this.activeBotId] || Object.values(this.botsCatalog)[0];
        const tf = bot?.timeframe || '1h';

        // Obtener velas para el símbolo
        let candles = [];
        if (typeof this.fetchCandlesFn === 'function') {
            try {
                candles = await this.fetchCandlesFn(sym, tf);
            } catch (e) {}
        }

        if (!candles || candles.length < 25) {
            candles = this.generarVelasFallback(sym, 100);
        }

        const lastBar = candles[candles.length - 1];
        if (!lastBar) return;

        const curPrice = lastBar.close;
        const atr = this.calcularATR(candles, 14);

        // Actualizar matriz de activos
        if (!this.assetMatrix[sym]) {
            this.assetMatrix[sym] = { symbol: sym };
        }
        this.assetMatrix[sym].price = curPrice;
        this.assetMatrix[sym].atr = parseFloat(atr.toFixed(2));
        this.assetMatrix[sym].lastUpdate = Math.floor(Date.now() / 1000);

        // 1. Procesar posiciones abiertas de este activo (SL, TP, Trailing)
        this.procesarTicksEnPosiciones(sym, lastBar);

        // 2. Si el bot está activo y la cuenta está vigente, evaluar estrategia multi-activo
        if (this.isRunning && this.account.status === 'ACTIVE') {
            this.evaluarEstrategiaMultiActivo(sym, candles, bot);
        }

        // Actualizar estadísticas de matriz para este activo
        const symOpen = this.openPositions.filter(p => p.symbol === sym);
        this.assetMatrix[sym].openTradesCount = symOpen.length;
        this.assetMatrix[sym].floatingPnL = symOpen.reduce((acc, p) => acc + p.profit, 0);
    }

    procesarTicksEnPosiciones(sym, candle) {
        const spec = this.symbolSpecs[sym] || { contractSize: 1, pointVal: 1, digits: 2 };
        const curPrice = candle.close;
        const bot = this.botsCatalog[this.activeBotId];

        for (let i = this.openPositions.length - 1; i >= 0; i--) {
            const pos = this.openPositions[i];
            if (pos.symbol !== sym) continue;

            pos.currentPrice = curPrice;
            const isBuy = pos.type === 'BUY';
            const priceDiff = isBuy ? (curPrice - pos.openPrice) : (pos.openPrice - curPrice);
            pos.profit = (priceDiff * pos.lots * spec.pointVal) - pos.commission;

            // SL Hit
            if (pos.sl > 0) {
                const hitSL = isBuy ? (candle.low <= pos.sl) : (candle.high >= pos.sl);
                if (hitSL) {
                    this.cerrarPosicion(pos.ticket, pos.sl, 'Stop Loss (SL)');
                    continue;
                }
            }

            // TP Hit
            if (pos.tp > 0) {
                const hitTP = isBuy ? (candle.high >= pos.tp) : (candle.low <= pos.tp);
                if (hitTP) {
                    this.cerrarPosicion(pos.ticket, pos.tp, 'Take Profit (TP)');
                    continue;
                }
            }

            // Trailing Stop
            if (bot && bot.params && bot.params.useTrailing && pos.profit > 0) {
                const trailDist = pos.openPrice * 0.015;
                if (isBuy) {
                    const newSL = curPrice - trailDist;
                    if (newSL > (pos.sl || 0) && newSL > pos.openPrice) {
                        pos.sl = parseFloat(newSL.toFixed(spec.digits));
                        this.log(`[TrailingStop] Ticket #${pos.ticket} (${sym}) SL ajustado a ${pos.sl}`);
                    }
                } else {
                    const newSL = curPrice + trailDist;
                    if ((pos.sl === 0 || newSL < pos.sl) && newSL < pos.openPrice) {
                        pos.sl = parseFloat(newSL.toFixed(spec.digits));
                        this.log(`[TrailingStop] Ticket #${pos.ticket} (${sym}) SL ajustado a ${pos.sl}`);
                    }
                }
            }
        }

        // Recalcular métricas de cuenta
        const totalFloating = this.openPositions.reduce((acc, p) => acc + p.profit, 0);
        this.account.floatingPnL = totalFloating;
        this.account.equity = this.account.balance + totalFloating;
        this.account.peakEquity = Math.max(this.account.peakEquity, this.account.equity);
        this.account.freeMargin = this.account.equity - this.account.margin;
    }

    evaluarEstrategiaMultiActivo(sym, candles, bot) {
        if (!candles || candles.length < 30) return;

        // Reglas de portafolio
        const totalOpen = this.openPositions.length;
        if (totalOpen >= (this.challengeConfig.maxTotalOpen || 5)) return;

        const openInSym = this.openPositions.filter(p => p.symbol === sym).length;
        if (openInSym >= (this.challengeConfig.maxOpenPerAsset || 1)) return;

        const curBar = candles[candles.length - 1];
        const lastBar = candles[candles.length - 2];
        const curPrice = curBar.close;
        const atr = this.calcularATR(candles, bot.params.atrPeriod || 14);

        let signal = null;
        let slPrice = 0;
        let tpPrice = 0;

        const stratType = bot.strategyType || 'donchian_breakout';

        if (stratType === 'donchian_breakout') {
            const period = bot.params.donchianPeriod || 20;
            const lookback = candles.slice(-period - 2, -2);
            if (lookback.length >= period) {
                const maxH = Math.max(...lookback.map(c => c.high));
                const minL = Math.min(...lookback.map(c => c.low));
                const slMult = bot.params.slAtrMult || 1.5;
                const tpMult = bot.params.tpAtrMult || 3.0;

                if (curBar.high >= maxH && curBar.close > lastBar.close) {
                    signal = 'BUY';
                    slPrice = curPrice - (atr * slMult);
                    tpPrice = curPrice + (atr * tpMult);
                } else if (curBar.low <= minL && curBar.close < lastBar.close) {
                    signal = 'SELL';
                    slPrice = curPrice + (atr * slMult);
                    tpPrice = curPrice - (atr * tpMult);
                }
            }
        } else if (stratType === 'vcp_squeeze') {
            const emaPeriod = bot.params.emaPeriod || 200;
            const emaVal = this.calcularEMA(candles, emaPeriod);
            const period = bot.params.donchianPeriod || 20;
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

        // Actualizar señal en la matriz
        if (this.assetMatrix[sym]) {
            this.assetMatrix[sym].signal = signal || 'WAITING';
        }

        // Ejecutar orden si hay señal
        if (signal) {
            const lots = this.calcularLotajeSeguro(sym, curPrice, slPrice);
            this.orderSend(sym, signal, lots, curPrice, slPrice, tpPrice, `[24/7 ${bot.id}]`);
        }
    }

    calcularLotajeSeguro(sym, entryPrice, slPrice) {
        const spec = this.symbolSpecs[sym] || { contractSize: 1, pointVal: 1, digits: 2 };

        if (this.challengeConfig.riskMode === 'LOTS') {
            const fixedLots = Math.max(0.01, parseFloat(this.challengeConfig.riskValue) || 0.10);
            return Math.min(20.0, Math.round(fixedLots * 100) / 100);
        }

        // Modo Porcentaje (%)
        const riskUSD = (this.challengeConfig.riskValue / 100) * this.account.balance;
        const slDist = Math.abs(entryPrice - slPrice);
        if (slDist <= 0) return 0.10;

        let lots = riskUSD / (slDist * spec.pointVal);
        lots = Math.max(0.01, Math.min(20.0, Math.round(lots * 100) / 100));
        return lots;
    }

    orderSend(symbol, type, lots, price, sl, tp, comment = '') {
        const spec = this.symbolSpecs[symbol] || { contractSize: 1, pointVal: 1, spread: 1.0, digits: 2 };
        const isBuy = type === 'BUY';
        const spreadOffset = isBuy ? (spec.spread * 0.5) : (-spec.spread * 0.5);
        const execPrice = parseFloat((price + spreadOffset).toFixed(spec.digits));

        const requiredMargin = (lots * spec.contractSize * execPrice) / this.challengeConfig.leverage;
        if (requiredMargin > this.account.freeMargin) {
            this.log(`[OrderSend REJECTED] Margen insuficiente para ${symbol}. Requerido: $${requiredMargin.toFixed(2)}, Libre: $${this.account.freeMargin.toFixed(2)}`);
            return null;
        }

        const ticket = this.nextTicket++;
        const commission = lots * (spec.commPerLot || 5.0);

        const position = {
            ticket,
            time: Math.floor(Date.now() / 1000),
            symbol,
            type,
            lots,
            openPrice: execPrice,
            currentPrice: execPrice,
            sl: parseFloat((sl || 0).toFixed(spec.digits)),
            tp: parseFloat((tp || 0).toFixed(spec.digits)),
            profit: -commission,
            commission,
            comment,
            magic: 8801
        };

        this.openPositions.push(position);
        this.account.margin += requiredMargin;
        this.account.freeMargin = this.account.equity - this.account.margin;

        this.log(`[OrderSend SUCCESS] Ticket #${ticket} ${type} ${lots.toFixed(2)} lots ${symbol} @ ${execPrice} | SL: ${position.sl} TP: ${position.tp}`);
        this.guardarEstadoPersistente();
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

        const freedMargin = (pos.lots * spec.contractSize * pos.openPrice) / this.challengeConfig.leverage;
        this.account.balance += netProfit;
        this.account.margin = Math.max(0, this.account.margin - freedMargin);
        this.account.equity = this.account.balance + this.openPositions.reduce((acc, p) => acc + p.profit, 0);
        this.account.freeMargin = this.account.equity - this.account.margin;

        this.equityHistory.push({
            time: Math.floor(Date.now() / 1000),
            balance: this.account.balance,
            equity: this.account.equity
        });
        if (this.equityHistory.length > 1000) this.equityHistory.shift();

        this.log(`[OrderClose] Ticket #${ticket} (${pos.symbol}) cerrado a ${finalPrice.toFixed(spec.digits)} | PnL: ${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(2)} [${exitReason}]`);
        this.guardarEstadoPersistente();
        return true;
    }

    cerrarTodasLasPosiciones(motivo = 'Pánico') {
        const copy = [...this.openPositions];
        copy.forEach(pos => {
            this.cerrarPosicion(pos.ticket, pos.currentPrice, motivo);
        });
        this.log(`[PanicClose] Todas las posiciones del portafolio cerradas. Motivo: ${motivo}`);
        this.guardarEstadoPersistente();
    }

    evaluarReglasPropFirm() {
        const initial = this.account.initialBalance;
        const dayStart = this.account.dayStartEquity;
        const currentEquity = this.account.equity;

        const dailyLossUSD = Math.max(0, dayStart - currentEquity);
        const dailyLossPct = (dailyLossUSD / dayStart) * 100;
        const totalLossUSD = Math.max(0, initial - currentEquity);
        const totalLossPct = (totalLossUSD / initial) * 100;
        const profitUSD = Math.max(0, currentEquity - initial);
        const profitPct = (profitUSD / initial) * 100;

        if (dailyLossPct >= this.challengeConfig.dailyLossLimitPct) {
            this.account.status = 'VIOLATED';
            this.isRunning = false;
            this.cerrarTodasLasPosiciones('Prop Firm Rule: Pérdida Diaria Superada (5%)');
            this.log(`🚨 [ACCOUNT VIOLATED] Has alcanzado el límite de pérdida diaria (${dailyLossPct.toFixed(2)}% >= 5%).`);
        } else if (totalLossPct >= this.challengeConfig.maxTotalLossPct) {
            this.account.status = 'VIOLATED';
            this.isRunning = false;
            this.cerrarTodasLasPosiciones('Prop Firm Rule: Max Drawdown Total Superado (10%)');
            this.log(`🚨 [ACCOUNT VIOLATED] Has alcanzado el Drawdown Máximo Total (${totalLossPct.toFixed(2)}% >= 10%).`);
        } else if (profitPct >= this.challengeConfig.profitTargetPct && this.account.status !== 'PASSED') {
            this.account.status = 'PASSED';
            this.log(`🏆 [CHALLENGE PASSED!] ¡Felicidades! Objetivo alcanzado: +${profitPct.toFixed(2)}% en cuenta.`);
        } else if (dailyLossPct >= 3.8 || totalLossPct >= 8.0) {
            this.account.status = 'WARNING';
        } else {
            this.account.status = 'ACTIVE';
        }
    }

    resetChallenge(tier = 100000) {
        this.openPositions = [];
        this.closedPositions = [];
        this.account.initialBalance = tier;
        this.account.balance = tier;
        this.account.equity = tier;
        this.account.margin = 0;
        this.account.freeMargin = tier;
        this.account.marginLevel = 0;
        this.account.dayStartEquity = tier;
        this.account.peakEquity = tier;
        this.account.floatingPnL = 0;
        this.account.status = 'ACTIVE';
        this.isRunning = false;

        this.equityHistory = [{
            time: Math.floor(Date.now() / 1000),
            balance: tier,
            equity: tier
        }];

        this.log(`[ChallengeReset] Cuenta reiniciada con capital de $${tier.toLocaleString()} USD.`);
        this.guardarEstadoPersistente();
    }

    getState() {
        return {
            isRunning: this.isRunning,
            activeBotId: this.activeBotId,
            bot: this.botsCatalog[this.activeBotId] || null,
            symbols: this.symbols,
            assetMatrix: this.assetMatrix,
            account: this.account,
            openPositions: this.openPositions,
            closedPositions: this.closedPositions.slice(0, 50),
            equityHistory: this.equityHistory.slice(-500),
            journalLogs: this.journalLogs.slice(0, 100),
            challengeConfig: this.challengeConfig
        };
    }

    // =========================================================================
    // MATEMÁTICAS AUXILIARES
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

    generarVelasFallback(sym = 'BTC-USD', count = 100) {
        let basePrice = 100;
        const s = (sym || '').toUpperCase();
        if (s.includes('BTC')) basePrice = 83000;
        else if (s.includes('ETH')) basePrice = 3500;
        else if (s.includes('SOL')) basePrice = 180;
        else if (s.includes('XAU') || s.includes('GOLD')) basePrice = 2650;
        else if (s.includes('EUR')) basePrice = 1.085;
        else if (s.includes('NASDAQ')) basePrice = 20500;

        const now = Math.floor(Date.now() / 1000) - count * 3600;
        const candles = [];
        let price = basePrice;
        for (let i = 0; i < count; i++) {
            const delta = (Math.random() - 0.49) * (basePrice * 0.006);
            const open = price;
            const close = open + delta;
            const high = Math.max(open, close) + Math.random() * (basePrice * 0.002);
            const low = Math.min(open, close) - Math.random() * (basePrice * 0.002);
            candles.push({
                time: now + (i * 3600),
                open, high, low, close, volume: 100
            });
            price = close;
        }
        return candles;
    }
}
