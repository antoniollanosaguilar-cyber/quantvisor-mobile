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

        // Persistencia remota opcional (Upstash Redis REST)
        this.remoteUrl = String(options.redisUrl || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
        this.remoteToken = options.redisToken || process.env.UPSTASH_REDIS_REST_TOKEN || '';
        this.remoteKey = options.redisKey || process.env.QV_STATE_KEY || 'quantvisor:mt5_daemon_state';
        this.remoteSaveDelayMs = options.remoteSaveDelayMs || 15000;
        this.remoteSaveTimer = null;
        this.remoteReady = false; // solo true tras una lectura remota exitosa
        this.remoteLastSavedAt = null;
        this.remoteLastError = null;

        // Notificaciones opcionales por Telegram
        this.telegramToken = options.telegramToken || process.env.TELEGRAM_BOT_TOKEN || '';
        this.telegramChatId = options.telegramChatId || process.env.TELEGRAM_CHAT_ID || '';

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

        // Catálogo de Bots Multi-Activo (Flota Concurrente)
        this.botsCatalog = {
            multiasset_champion: {
                id: 'multiasset_champion',
                name: 'Mega Alpha Multi-Asset Champion (Crypto + Oro + Forex)',
                enabled: true,
                multiAsset: true,
                symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XAUUSD', 'EURUSD'],
                timeframe: '1h',
                strategyType: 'donchian_breakout',
                magic: 8801,
                riskMode: 'LOTS',
                riskValue: 0.10,
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
                description: 'Estrategia auditada en Oro. Rotura Donchian(51) con trailing ATR.',
                params: {
                    donchianPeriod: 51,
                    atrPeriod: 14,
                    slAtrMult: 1.5,
                    tpAtrMult: 3.0,
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
                description: 'Compresión BBW sobre EMA 200 y ruptura Donchian en Bitcoin.',
                params: {
                    emaPeriod: 200,
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
                description: 'Liberación de compresión de momentum en Solana.',
                params: {
                    bbLength: 20,
                    slPct: 2.0,
                    tpPct: 4.5,
                    useTrailing: true
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
                description: 'Contracción Donchian(10) en sesión de divisas.',
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
                name: 'Cruce Tendencial EMA (NASDAQ)',
                enabled: false,
                symbol: 'NASDAQ',
                symbols: ['NASDAQ'],
                timeframe: '1h',
                strategyType: 'ema_cross',
                magic: 7705,
                riskMode: 'LOTS',
                riskValue: 0.10,
                description: 'Cruce de medias exponenciales 20/50 en índices.',
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
                this.aplicarEstadoGuardado(JSON.parse(raw));
            }
        } catch (e) {
            console.warn('[Daemon] Error al cargar estado persistente:', e.message);
        }
    }

    aplicarEstadoGuardado(saved) {
        if (!saved || typeof saved !== 'object') return;
        if (saved.account) this.account = Object.assign(this.account, saved.account);
        if (Array.isArray(saved.openPositions)) this.openPositions = saved.openPositions;
        if (Array.isArray(saved.closedPositions)) this.closedPositions = saved.closedPositions;
        if (Array.isArray(saved.equityHistory)) this.equityHistory = saved.equityHistory;
        if (Array.isArray(saved.symbols) && saved.symbols.length > 0) this.symbols = saved.symbols;
        if (saved.botsCatalog && typeof saved.botsCatalog === 'object') {
            Object.keys(saved.botsCatalog).forEach(k => {
                if (this.botsCatalog[k]) {
                    Object.assign(this.botsCatalog[k], saved.botsCatalog[k]);
                } else {
                    this.botsCatalog[k] = saved.botsCatalog[k];
                }
            });
        }
        if (saved.activeBotId && this.botsCatalog[saved.activeBotId]) this.activeBotId = saved.activeBotId;
        if (saved.challengeConfig) this.challengeConfig = Object.assign(this.challengeConfig, saved.challengeConfig);
        if (saved.nextTicket) this.nextTicket = saved.nextTicket;
        if (saved.isRunning !== undefined) this.isRunning = saved.isRunning;
    }

    serializarEstado() {
        return {
            account: this.account,
            openPositions: this.openPositions,
            closedPositions: this.closedPositions.slice(0, 100),
            equityHistory: this.equityHistory.slice(-500),
            symbols: this.symbols,
            activeBotId: this.activeBotId,
            botsCatalog: this.botsCatalog,
            challengeConfig: this.challengeConfig,
            nextTicket: this.nextTicket,
            isRunning: this.isRunning,
            lastSavedAt: new Date().toISOString()
        };
    }

    guardarEstadoPersistente() {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
            fs.writeFileSync(this.stateFile, JSON.stringify(this.serializarEstado(), null, 2), 'utf8');
        } catch (e) {
            console.warn('[Daemon] Error al guardar estado persistente:', e.message);
        }
        this.programarGuardadoRemoto();
    }

    // =========================================================================
    // PERSISTENCIA REMOTA (Upstash Redis REST - opcional, plan gratuito)
    // Necesaria en hosts con disco efímero (Render Free): sin ella el estado
    // se pierde en cada reinicio/redeploy.
    // =========================================================================
    hasRemoteStore() {
        return Boolean(this.remoteUrl && this.remoteToken);
    }

    getPersistenceInfo() {
        if (this.hasRemoteStore()) {
            return { backend: 'upstash-redis', key: this.remoteKey, lastSavedAt: this.remoteLastSavedAt, lastError: this.remoteLastError };
        }
        return { backend: 'file', path: this.stateFile, warning: 'En hosts con disco efímero (Render Free) el estado se pierde al reiniciar. Configure UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN.' };
    }

    async cargarEstadoRemoto(maxAttempts = 3) {
        if (!this.hasRemoteStore()) return false;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const resp = await fetch(`${this.remoteUrl}/get/${encodeURIComponent(this.remoteKey)}`, {
                    headers: { Authorization: `Bearer ${this.remoteToken}` }
                });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const json = await resp.json();
                this.remoteReady = true;
                this.remoteLastError = null;
                if (json && typeof json.result === 'string' && json.result.length > 0) {
                    this.aplicarEstadoGuardado(JSON.parse(json.result));
                    this.log(`[Persistence] Estado restaurado desde Upstash Redis (balance $${Number(this.account.balance).toFixed(2)}, ${this.openPositions.length} posiciones abiertas).`);
                    return true;
                }
                this.log('[Persistence] Upstash Redis conectado, sin estado previo. Se usa el estado inicial.');
                return false;
            } catch (e) {
                this.remoteLastError = e.message;
                if (attempt < maxAttempts) {
                    await new Promise(r => setTimeout(r, 1000 * attempt * attempt));
                }
            }
        }
        // No se habilitan escrituras remotas para no sobrescribir un estado válido que no pudimos leer
        this.log(`[Persistence ERROR] No se pudo leer el estado remoto tras ${maxAttempts} intentos (${this.remoteLastError}). Guardado remoto desactivado hasta reiniciar.`);
        return false;
    }

    programarGuardadoRemoto() {
        if (!this.hasRemoteStore() || !this.remoteReady || this.remoteSaveTimer) return;
        // Agrupa escrituras para respetar la cuota gratuita de Upstash
        this.remoteSaveTimer = setTimeout(() => {
            this.remoteSaveTimer = null;
            this.guardarEstadoRemoto();
        }, this.remoteSaveDelayMs);
        if (typeof this.remoteSaveTimer.unref === 'function') this.remoteSaveTimer.unref();
    }

    async guardarEstadoRemoto() {
        if (!this.hasRemoteStore() || !this.remoteReady) return false;
        if (this.remoteSaveTimer) {
            clearTimeout(this.remoteSaveTimer);
            this.remoteSaveTimer = null;
        }
        try {
            const resp = await fetch(`${this.remoteUrl}/set/${encodeURIComponent(this.remoteKey)}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.remoteToken}`, 'Content-Type': 'text/plain' },
                body: JSON.stringify(this.serializarEstado())
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            this.remoteLastSavedAt = new Date().toISOString();
            this.remoteLastError = null;
            return true;
        } catch (e) {
            this.remoteLastError = e.message;
            console.warn('[Daemon] Error al guardar estado remoto:', e.message);
            return false;
        }
    }

    // =========================================================================
    // NOTIFICACIONES TELEGRAM (opcional)
    // =========================================================================
    notificar(msg) {
        if (!this.telegramToken || !this.telegramChatId || typeof fetch === 'undefined') return;
        if (!/OrderSend SUCCESS|OrderClose|PanicClose|ChallengeReset|ACCOUNT VIOLATED|CHALLENGE PASSED|Persistence ERROR/.test(msg)) return;
        fetch(`https://api.telegram.org/bot${this.telegramToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: this.telegramChatId, text: `QuantVisor (SIMULACIÓN)\n${msg}`, disable_web_page_preview: true })
        }).catch(e => console.warn('[Telegram] Error al enviar:', e.message));
    }

    log(msg) {
        const timeStr = new Date().toLocaleTimeString();
        const entry = { time: timeStr, msg };
        this.journalLogs.unshift(entry);
        if (this.journalLogs.length > 300) this.journalLogs.pop();
        console.log(`[MT5 24/7] ${timeStr} - ${msg}`);
        this.notificar(msg);
    }

    // =========================================================================
    // CONTROL DEL DAEMON 24/7 & FLOTA MULTI-BOT
    // =========================================================================
    start() {
        if (this.isRunning && this.timer) return;
        this.isRunning = true;
        this.guardarEstadoPersistente();
        const activeCount = this.getActiveBots().length;
        this.log(`🚀 [DaemonStarted] Flota MT5 24/7 activada en segundo plano (${activeCount} bots activos concurrentes).`);

        if (!this.timer) {
            this.timer = setInterval(() => this.ejecutarCiclo(), this.pollIntervalMs);
        }
        this.ejecutarCiclo();
    }

    pause() {
        this.isRunning = false;
        this.guardarEstadoPersistente();
        this.log(`⏸ [DaemonPaused] Flota MT5 pausada en segundo plano.`);
    }

    stop() {
        this.pause();
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    getActiveBots() {
        return Object.values(this.botsCatalog).filter(b => b.enabled !== false);
    }

    toggleBot(botId, enabled, options = {}) {
        if (!this.botsCatalog[botId]) return false;
        this.botsCatalog[botId].enabled = !!enabled;
        if (options.riskMode) this.botsCatalog[botId].riskMode = options.riskMode;
        if (options.riskValue !== undefined) this.botsCatalog[botId].riskValue = parseFloat(options.riskValue);
        this.guardarEstadoPersistente();
        this.log(`[FleetToggle] Bot '${this.botsCatalog[botId].name}' (${botId}) -> ${enabled ? 'ACTIVADO 🟢' : 'PAUSADO ⏸'}`);
        return true;
    }

    setAllBots(enabled) {
        Object.values(this.botsCatalog).forEach(b => {
            b.enabled = !!enabled;
        });
        this.guardarEstadoPersistente();
        this.log(`[FleetControl] Toda la flota de bots ha sido ${enabled ? 'ACTIVADA' : 'PAUSADA'}.`);
    }

    setBotRisk(botId, riskMode, riskValue) {
        if (!this.botsCatalog[botId]) return false;
        if (riskMode) this.botsCatalog[botId].riskMode = riskMode;
        if (riskValue !== undefined) this.botsCatalog[botId].riskValue = parseFloat(riskValue);
        this.guardarEstadoPersistente();
        this.log(`[FleetRisk] Riesgo de '${this.botsCatalog[botId].name}' fijado a ${this.botsCatalog[botId].riskValue} (${this.botsCatalog[botId].riskMode})`);
        return true;
    }

    getFleetStats() {
        const stats = {};
        Object.values(this.botsCatalog).forEach(bot => {
            const magic = bot.magic;
            const openForBot = this.openPositions.filter(p => p.magic === magic);
            const closedForBot = this.closedPositions.filter(p => p.magic === magic);
            
            let wins = 0;
            let grossProfit = 0;
            let grossLoss = 0;
            let netPnL = 0;

            closedForBot.forEach(p => {
                netPnL += p.profit;
                if (p.profit > 0) {
                    wins++;
                    grossProfit += p.profit;
                } else if (p.profit < 0) {
                    grossLoss += Math.abs(p.profit);
                }
            });

            const totalTrades = closedForBot.length;
            const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
            const floatingPnL = openForBot.reduce((acc, p) => acc + (p.profit || 0), 0);

            stats[bot.id] = {
                id: bot.id,
                name: bot.name,
                magic: bot.magic,
                enabled: bot.enabled !== false,
                symbols: Array.isArray(bot.symbols) ? bot.symbols : [bot.symbol || 'BTC-USD'],
                timeframe: bot.timeframe || '1h',
                strategyType: bot.strategyType || 'donchian_breakout',
                riskMode: bot.riskMode || 'LOTS',
                riskValue: bot.riskValue !== undefined ? bot.riskValue : 0.10,
                openCount: openForBot.length,
                floatingPnL: parseFloat(floatingPnL.toFixed(2)),
                tradesCount: totalTrades,
                winRate: parseFloat(winRate.toFixed(1)),
                netPnL: parseFloat(netPnL.toFixed(2))
            };
        });
        return stats;
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
        this.log(`[SymbolsUpdated] Cesta general actualizada: [${this.symbols.join(', ')}]`);
    }

    setBot(botConfig) {
        if (!botConfig || !botConfig.name) return;
        const id = botConfig.id || `custom_bot_${Date.now()}`;
        botConfig.id = id;
        if (botConfig.enabled === undefined) botConfig.enabled = true;
        this.botsCatalog[id] = botConfig;
        this.activeBotId = id;
        if (Array.isArray(botConfig.symbols) && botConfig.symbols.length > 0) {
            this.setSymbols(botConfig.symbols);
        }
        this.guardarEstadoPersistente();
        this.log(`[BotInstalled] Bot '${botConfig.name}' añadido a la flota 24/7.`);
    }

    // =========================================================================
    // CICLO PERIÓDICO MULTI-BOT CONCURRENTE (EVERY 10 SECONDS)
    // =========================================================================
    async ejecutarCiclo() {
        try {
            const activeBots = this.getActiveBots();

            // 1. Unificar todos los símbolos necesarios (cesta base + símbolos de bots activos)
            const neededSymbolsSet = new Set(this.symbols);
            activeBots.forEach(bot => {
                if (Array.isArray(bot.symbols)) bot.symbols.forEach(s => neededSymbolsSet.add(s));
                else if (bot.symbol) neededSymbolsSet.add(bot.symbol);
            });
            const neededSymbols = Array.from(neededSymbolsSet);

            // 0. Reset diario de Equidad a las 00:00 GMT (Regla Prop Firm Guardian)
            const nowSec = Math.floor(Date.now() / 1000);
            const currentDay = Math.floor(nowSec / 86400);
            const lastResetDay = Math.floor((this.account.lastDayResetTimestamp || nowSec) / 86400);
            if (currentDay > lastResetDay) {
                this.account.dayStartEquity = this.account.equity;
                this.account.lastDayResetTimestamp = nowSec;
                this.log(`[DailyReset] Medianoche GMT detectada en Daemon 24/7. Equidad base fijada en: $${this.account.dayStartEquity.toFixed(2)}`);
                this.guardarEstadoPersistente();
            }

            // 2. Procesar velas, cotizaciones y posiciones abiertas para cada símbolo
            const candlesBySymbol = {};
            for (const sym of neededSymbols) {
                candlesBySymbol[sym] = await this.procesarSimbolo(sym);
            }

            // 3. Si la flota está activa y la cuenta no violó reglas, evaluar señales para CADA bot activo en paralelo
            if (this.isRunning && this.account.status === 'ACTIVE') {
                for (const bot of activeBots) {
                    const botSyms = Array.isArray(bot.symbols) && bot.symbols.length > 0 ? bot.symbols : [bot.symbol || 'BTC-USD'];
                    for (const sym of botSyms) {
                        const candles = candlesBySymbol[sym];
                        if (candles && candles.length >= 25) {
                            this.evaluarEstrategiaParaBot(sym, candles, bot);
                        }
                    }
                }
            }

            // 4. Evaluar reglas de cumplimiento Prop Firm a nivel global de la cuenta
            this.evaluarReglasPropFirm();

            // 5. Registrar curva de capital
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
        // Obtener velas para el símbolo
        let candles = [];
        if (typeof this.fetchCandlesFn === 'function') {
            try {
                candles = await this.fetchCandlesFn(sym, '1h');
            } catch (e) {}
        }

        if (!candles || candles.length < 25) {
            candles = this.generarVelasFallback(sym, 100);
        }

        const lastBar = candles[candles.length - 1];
        if (!lastBar) return candles;

        const curPrice = lastBar.close;
        const atr = this.calcularATR(candles, 14);

        // Actualizar matriz de activos en tiempo real
        if (!this.assetMatrix[sym]) {
            this.assetMatrix[sym] = { symbol: sym };
        }
        this.assetMatrix[sym].price = curPrice;
        this.assetMatrix[sym].atr = parseFloat(atr.toFixed(2));
        this.assetMatrix[sym].lastUpdate = Math.floor(Date.now() / 1000);

        // Procesar posiciones abiertas de este activo (SL, TP, Trailing stop específico de cada bot)
        this.procesarTicksEnPosiciones(sym, lastBar, atr);

        // Actualizar estadísticas de matriz para este activo
        const symOpen = this.openPositions.filter(p => p.symbol === sym);
        this.assetMatrix[sym].openTradesCount = symOpen.length;
        this.assetMatrix[sym].floatingPnL = parseFloat(symOpen.reduce((acc, p) => acc + p.profit, 0).toFixed(2));

        return candles;
    }

    procesarTicksEnPosiciones(sym, candle, atr) {
        const spec = this.symbolSpecs[sym] || { contractSize: 1, pointVal: 1, digits: 2 };
        const curPrice = candle.close;

        for (let i = this.openPositions.length - 1; i >= 0; i--) {
            const pos = this.openPositions[i];
            if (pos.symbol !== sym) continue;

            pos.currentPrice = curPrice;
            const isBuy = pos.type === 'BUY';
            const priceDiff = isBuy ? (curPrice - pos.openPrice) : (pos.openPrice - curPrice);
            pos.profit = (priceDiff * pos.lots * spec.pointVal) - pos.commission;

            // Stop Loss
            if (pos.sl > 0) {
                const hitSL = isBuy ? (candle.low <= pos.sl) : (candle.high >= pos.sl);
                if (hitSL) {
                    this.cerrarPosicion(pos.ticket, pos.sl, 'Stop Loss (SL)');
                    continue;
                }
            }

            // Take Profit
            if (pos.tp > 0) {
                const hitTP = isBuy ? (candle.high >= pos.tp) : (candle.low <= pos.tp);
                if (hitTP) {
                    this.cerrarPosicion(pos.ticket, pos.tp, 'Take Profit (TP)');
                    continue;
                }
            }

            // Trailing Stop dinámico específico del bot propietario de la posición
            const bot = Object.values(this.botsCatalog).find(b => b.magic === pos.magic) || this.botsCatalog[this.activeBotId];
            if (bot && bot.params && bot.params.useTrailing && pos.profit > 0) {
                const mult = bot.params.trailingAtrMult || 1.2;
                const trailDist = (atr && atr > 0) ? (atr * mult) : (pos.openPrice * 0.015);
                if (isBuy) {
                    const newSL = curPrice - trailDist;
                    if (newSL > (pos.sl || 0) && newSL > pos.openPrice) {
                        pos.sl = parseFloat(newSL.toFixed(spec.digits));
                        this.log(`[TrailingStop] Ticket #${pos.ticket} (${bot.name} en ${sym}) SL ajustado a ${pos.sl}`);
                    }
                } else {
                    const newSL = curPrice + trailDist;
                    if ((pos.sl === 0 || newSL < pos.sl) && newSL < pos.openPrice) {
                        pos.sl = parseFloat(newSL.toFixed(spec.digits));
                        this.log(`[TrailingStop] Ticket #${pos.ticket} (${bot.name} en ${sym}) SL ajustado a ${pos.sl}`);
                    }
                }
            }
        }

        // Recalcular métricas de cuenta consolidadas
        const totalFloating = this.openPositions.reduce((acc, p) => acc + p.profit, 0);
        this.account.floatingPnL = parseFloat(totalFloating.toFixed(2));
        this.account.equity = parseFloat((this.account.balance + totalFloating).toFixed(2));
        this.account.peakEquity = Math.max(this.account.peakEquity, this.account.equity);
        this.account.freeMargin = parseFloat((this.account.equity - this.account.margin).toFixed(2));
        this.account.marginLevel = this.account.margin > 0 ? (this.account.equity / this.account.margin) * 100 : 0;
    }

    evaluarEstrategiaParaBot(sym, candles, bot) {
        if (!candles || candles.length < 25) return;

        // Reglas de portafolio y límites de concurrencia
        const maxTotal = this.challengeConfig.maxTotalOpen || 10;
        if (this.openPositions.length >= maxTotal) return;

        // Limitar a máximo 1 orden abierta por este bot en este activo
        const botOpenInSym = this.openPositions.filter(p => p.symbol === sym && p.magic === bot.magic).length;
        if (botOpenInSym >= (bot.maxOpenPerAsset || 1)) return;

        const curBar = candles[candles.length - 1];
        const lastBar = candles[candles.length - 2];
        const curPrice = curBar.close;
        const atr = this.calcularATR(candles, (bot.params && bot.params.atrPeriod) || 14);

        let signal = null;
        let slPrice = 0;
        let tpPrice = 0;

        const stratType = bot.strategyType || bot.id || 'donchian_breakout';

        // 1. Donchian Breakout
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
                    slPrice = curPrice + (atr * slMult);
                    tpPrice = curPrice - (atr * tpMult);
                }
            }
        }

        // 2. VCP Squeeze
        else if (stratType === 'vcp_squeeze' || stratType === 'btc_vcp' || stratType === 'crypto_vcp_ensemble') {
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
                    slPrice = curPrice + (atr * slMult);
                    tpPrice = curPrice - (atr * tpMult);
                }
            }
        }

        // 3. Squeeze Momentum Breakout
        else if (stratType === 'sqz_momentum' || stratType === 'sqz_momentum') {
            const len = (bot.params && bot.params.bbLength) || 20;
            const ema = this.calcularEMA(candles, len);
            const slPct = ((bot.params && bot.params.slPct) || 2.0) / 100;
            const tpPct = ((bot.params && bot.params.tpPct) || 4.5) / 100;

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

        // 4. Cruce EMA Tendencial
        else if (stratType === 'ema_cross' || stratType === 'cruce_ema') {
            const fastP = (bot.params && bot.params.fastPeriod) || 20;
            const slowP = (bot.params && bot.params.slowPeriod) || 50;
            const emaFastPrev = this.calcularEMA(candles.slice(0, -1), fastP);
            const emaSlowPrev = this.calcularEMA(candles.slice(0, -1), slowP);
            const emaFastCur = this.calcularEMA(candles, fastP);
            const emaSlowCur = this.calcularEMA(candles, slowP);
            const slMult = (bot.params && bot.params.slAtrMult) || 2.0;
            const tpMult = (bot.params && bot.params.tpAtrMult) || 4.0;

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

        // 5. Fallback genérico para bot personalizado importado (.mq5 / .ex5)
        else {
            const period = (bot.params && (bot.params.donchianPeriod || bot.params.period)) || 20;
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
                    slPrice = curPrice + (atr * slMult);
                    tpPrice = curPrice - (atr * tpMult);
                }
            }
        }

        // Actualizar señal en la matriz si es el bot principal o no tiene señal previa
        if (this.assetMatrix[sym]) {
            if (signal) this.assetMatrix[sym].signal = `${signal} (${bot.name.slice(0, 10)})`;
        }

        // Ejecutar orden con el Magic Number y Nombre del Bot
        if (signal) {
            const lots = this.calcularLotajeParaBot(bot, sym, curPrice, slPrice);
            this.orderSend(sym, signal, lots, curPrice, slPrice, tpPrice, `[${bot.name}]`, bot.magic, bot.name);
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

        // Modo Porcentaje (%) dividido entre los símbolos del bot
        const symbolsCount = (Array.isArray(bot.symbols) && bot.symbols.length > 0) ? bot.symbols.length : 1;
        const riskPct = (parseFloat(riskValue) || 1.0) / symbolsCount;
        const riskUSD = (riskPct / 100) * this.account.balance;
        const slDist = Math.abs(entryPrice - slPrice);
        if (slDist <= 0) return 0.10;

        let lots = riskUSD / (slDist * spec.pointVal);
        lots = Math.max(0.01, Math.min(20.0, Math.round(lots * 100) / 100));
        return lots;
    }

    orderSend(symbol, type, lots, price, sl, tp, comment = '', magic = 8801, botName = 'MT5 Bot') {
        const spec = this.symbolSpecs[symbol] || { contractSize: 1, pointVal: 1, spread: 1.0, digits: 2 };
        const isBuy = type === 'BUY';
        const spreadOffset = isBuy ? (spec.spread * 0.5) : (-spec.spread * 0.5);
        const execPrice = parseFloat((price + spreadOffset).toFixed(spec.digits));

        // Guardia direccional: SL y TP deben estar del lado correcto de la entrada
        const slBad = sl > 0 && (isBuy ? sl >= execPrice : sl <= execPrice);
        const tpBad = tp > 0 && (isBuy ? tp <= execPrice : tp >= execPrice);
        if (slBad || tpBad || !Number.isFinite(execPrice) || !(lots > 0)) {
            this.log(`[OrderSend REJECTED] Niveles inválidos para ${type} ${symbol} @ ${execPrice} | SL: ${sl} TP: ${tp} | Lotes: ${lots}`);
            return null;
        }

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
            magic: magic || 8801,
            botName: botName || 'MT5 Bot'
        };

        this.openPositions.push(position);
        this.account.margin += requiredMargin;
        this.account.freeMargin = this.account.equity - this.account.margin;

        this.log(`[OrderSend SUCCESS] Ticket #${ticket} ${type} ${lots.toFixed(2)} lots ${symbol} @ ${execPrice} [Bot: ${botName} #${magic}] | SL: ${position.sl} TP: ${position.tp}`);
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
            reason: exitReason,
            magic: pos.magic || 8801,
            botName: pos.botName || 'MT5 Bot'
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

        this.log(`[OrderClose] Ticket #${ticket} (${pos.symbol} - ${pos.botName}) cerrado a ${finalPrice.toFixed(spec.digits)} | PnL: ${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(2)} [${exitReason}]`);
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
        // VIOLATED es un estado terminal: solo resetChallenge() lo revierte.
        // (Antes, el reset diario a medianoche devolvía una cuenta violada a ACTIVE.)
        if (this.account.status === 'VIOLATED') return;

        const initial = this.account.initialBalance;
        const dayStart = this.account.dayStartEquity;
        const currentEquity = this.account.equity;

        const dailyLossUSD = Math.max(0, dayStart - currentEquity);
        const dailyLossPct = dayStart > 0 ? (dailyLossUSD / dayStart) * 100 : 0;
        const totalLossUSD = Math.max(0, initial - currentEquity);
        const totalLossPct = initial > 0 ? (totalLossUSD / initial) * 100 : 0;
        const profitUSD = Math.max(0, currentEquity - initial);
        const profitPct = initial > 0 ? (profitUSD / initial) * 100 : 0;

        if (dailyLossPct >= this.challengeConfig.dailyLossLimitPct) {
            this.account.status = 'VIOLATED';
            this.isRunning = false;
            this.cerrarTodasLasPosiciones(`Prop Firm Rule: Pérdida Diaria Superada (${this.challengeConfig.dailyLossLimitPct}%)`);
            this.log(`🚨 [ACCOUNT VIOLATED] Has alcanzado el límite de pérdida diaria (${dailyLossPct.toFixed(2)}% >= ${this.challengeConfig.dailyLossLimitPct}%).`);
        } else if (totalLossPct >= this.challengeConfig.maxTotalLossPct) {
            this.account.status = 'VIOLATED';
            this.isRunning = false;
            this.cerrarTodasLasPosiciones(`Prop Firm Rule: Max Drawdown Total Superado (${this.challengeConfig.maxTotalLossPct}%)`);
            this.log(`🚨 [ACCOUNT VIOLATED] Has alcanzado el Drawdown Máximo Total (${totalLossPct.toFixed(2)}% >= ${this.challengeConfig.maxTotalLossPct}%).`);
        } else if (this.account.status === 'PASSED') {
            // Objetivo ya alcanzado: se mantiene PASSED (antes volvía a ACTIVE y se re-anunciaba en bucle)
        } else if (profitPct >= this.challengeConfig.profitTargetPct) {
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
            botsCatalog: this.botsCatalog,
            fleetStats: this.getFleetStats(),
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
