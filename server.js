// server.js - Servidor Cloud 24/7 para QuantVisor Pro Mobile
// Compatible con Render, Railway, Vercel, Fly.io, Replit y VPS Node.js

import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { ServerMT5Daemon } from './server_mt5_engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const SRC_DIR = path.join(__dirname, 'src');

// Usar directorio temporal seguro para entornos en la nube (Render / Serverless)
const BASE_CACHE = process.env.CACHE_DIR || path.join(os.tmpdir(), 'quantvisor_cache');
const CACHE_DIR = path.join(BASE_CACHE, 'market_data');
const DRAWINGS_DIR = path.join(BASE_CACHE, 'drawings');

try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(DRAWINGS_DIR, { recursive: true }); } catch (e) {}

// Inicializar y arrancar el motor MT5 24/7 en segundo plano
let mt5Daemon = null;

function sanitizarNombre(str) {
    return (str || '').replace(/[^a-zA-Z0-9_\-]/g, '_').toUpperCase();
}

// 1. Mapeo de Símbolos a Yahoo Finance
function mapearSimboloYahoo(simbolo) {
    const s = (simbolo || '').trim().toUpperCase();
    switch (s) {
        case 'XAUUSD': case 'GOLD': case 'ORO': return 'GC=F';
        case 'XAGUSD': case 'SILVER': case 'PLATA': return 'SI=F';
        case 'OIL': case 'WTI': case 'CRUDE': case 'PETROLEO': return 'CL=F';
        case 'BRENT': return 'BZ=F';
        case 'NATGAS': case 'GAS': return 'NG=F';
        case 'COPPER': case 'COBRE': return 'HG=F';

        case 'US100': case 'NASDAQ': case 'NQ': case 'NDX': return 'NQ=F';
        case 'SP500': case 'US500': case 'ES': case 'SPX': return 'ES=F';
        case 'US30': case 'DOW': case 'YM': case 'DJI': return 'YM=F';
        case 'RUT': case 'RUSSELL': case 'RTY': return 'RTY=F';
        case 'DAX': case 'GER40': return '^GDAXI';
        case 'FTSE': case 'UK100': return '^FTSE';
        case 'NIKKEI': case 'JP225': return '^N225';

        case 'EURUSD': return 'EURUSD=X';
        case 'GBPUSD': return 'GBPUSD=X';
        case 'USDJPY': return 'USDJPY=X';
        case 'USDCAD': return 'USDCAD=X';
        case 'AUDUSD': return 'AUDUSD=X';
        case 'USDCHF': return 'USDCHF=X';
        case 'NZDUSD': return 'NZDUSD=X';

        case 'BTC': case 'BTCUSD': case 'BTCUSDT': return 'BTC-USD';
        case 'ETH': case 'ETHUSD': case 'ETHUSDT': return 'ETH-USD';
        case 'SOL': case 'SOLUSD': case 'SOLUSDT': return 'SOL-USD';
        case 'BNB': case 'BNBUSD': case 'BNBUSDT': return 'BNB-USD';
        case 'XRP': case 'XRPUSD': case 'XRPUSDT': return 'XRP-USD';
        case 'ADA': case 'ADAUSD': case 'ADAUSDT': return 'ADA-USD';
        case 'DOGE': case 'DOGEUSD': case 'DOGEUSDT': return 'DOGE-USD';
        case 'AVAX': case 'AVAXUSD': case 'AVAXUSDT': return 'AVAX-USD';
        case 'BCH': case 'BCHUSD': case 'BCHUSDT': return 'BCH-USD';
        case 'DOT': case 'DOTUSD': case 'DOTUSDT': return 'DOT-USD';
        case 'LINK': case 'LINKUSD': case 'LINKUSDT': return 'LINK-USD';
        case 'LTC': case 'LTCUSD': case 'LTCUSDT': return 'LTC-USD';
        case 'NEAR': case 'NEARUSD': case 'NEARUSDT': return 'NEAR-USD';
        case 'SHIB': case 'SHIBUSD': case 'SHIBUSDT': return 'SHIB-USD';

        default:
            if (s.endsWith('USDT') && s.length > 4) {
                return `${s.slice(0, -4)}-USD`;
            } else if (s.endsWith('USD') && s.length > 3 && !s.includes('-') && !s.includes('=') && !s.includes('^')) {
                return `${s.slice(0, -3)}-USD`;
            }
            return s;
    }
}

// 2. Mapeo de Intervalos
function mapearIntervaloYahoo(intervalo) {
    const intClean = (intervalo || '1h').trim().toLowerCase();
    switch (intClean) {
        case '1m': return { interval: '1m', range: '5d' };
        case '2m': return { interval: '2m', range: '30d' };
        case '3m': case '5m': return { interval: '5m', range: '60d' };
        case '15m': return { interval: '15m', range: '60d' };
        case '30m': return { interval: '30m', range: '60d' };
        case '1h': case '60m': return { interval: '1h', range: '730d' };
        case '2h': return { interval: '1h', range: '730d' };
        case '4h': return { interval: '1h', range: '730d' };
        case '1d': case 'd': return { interval: '1d', range: '10y' };
        case '1w': case '1wk': case 'w': case '1s': case 's': return { interval: '1wk', range: '10y' };
        case '1mo': case 'm': return { interval: '1mo', range: '10y' };
        default: return { interval: '1h', range: '730d' };
    }
}

function duracionSegundos(intervalo) {
    const intClean = (intervalo || '1h').trim().toLowerCase();
    switch (intClean) {
        case '1m': return 60;
        case '2m': return 120;
        case '3m': return 180;
        case '5m': return 300;
        case '15m': return 900;
        case '30m': return 1800;
        case '1h': case '60m': return 3600;
        case '2h': return 7200;
        case '4h': return 14400;
        case '1d': case 'd': return 86400;
        case '1w': case '1wk': case 'w': case '1s': case 's': return 604800;
        case '1mo': case 'm': return 2592000;
        default: return 3600;
    }
}

// 3. Coalescencia y Fusión de Velas
function coalescerVelas(rawCandles, intervaloObjetivo) {
    if (!Array.isArray(rawCandles) || rawCandles.length === 0) return [];
    const durSec = duracionSegundos(intervaloObjetivo);
    const intClean = (intervaloObjetivo || '1h').toLowerCase();

    if (durSec <= 3600 && intClean !== '2h' && intClean !== '4h') {
        return rawCandles;
    }

    const bucketMap = new Map();
    for (const c of rawCandles) {
        if (!c.time || isNaN(c.open) || isNaN(c.close)) continue;
        const bucketTime = Math.floor(c.time / durSec) * durSec;
        if (!bucketMap.has(bucketTime)) {
            bucketMap.set(bucketTime, {
                time: bucketTime,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume || 0
            });
        } else {
            const b = bucketMap.get(bucketTime);
            b.high = Math.max(b.high, c.high);
            b.low = Math.min(b.low, c.low);
            b.close = c.close;
            b.volume += (c.volume || 0);
        }
    }

    return Array.from(bucketMap.values()).sort((a, b) => a.time - b.time);
}

function fusionarVelas(cached, incoming, intervalo) {
    const rawMap = new Map();
    for (const c of cached) rawMap.set(c.time, c);
    for (const c of incoming) rawMap.set(c.time, c);

    const sortedRaw = Array.from(rawMap.values()).sort((a, b) => a.time - b.time);
    return coalescerVelas(sortedRaw, intervalo);
}

// 4. Ingesta desde Yahoo Finance
async function fetchYahooCandles(simbolo, intervalo) {
    const symYahoo = mapearSimboloYahoo(simbolo);
    const { interval: intYahoo, range } = mapearIntervaloYahoo(intervalo);
    const intClean = (intervalo || '1h').toLowerCase();

    const cacheFile = path.join(CACHE_DIR, `${sanitizarNombre(simbolo)}_${sanitizarNombre(intervalo)}.json`);
    let cached = [];
    if (fs.existsSync(cacheFile)) {
        try { cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) {}
    }

    const endpoints = [
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symYahoo)}?interval=${intYahoo}&range=${range}`,
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symYahoo)}?interval=${intYahoo}&range=${range}`
    ];

    for (const url of endpoints) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                }
            });

            if (!res.ok) continue;

            const data = await res.json();
            const result = data.chart?.result?.[0];
            if (!result || !result.timestamp) continue;

            const timestamps = result.timestamp;
            const quote = result.indicators?.quote?.[0] || {};
            const opens = quote.open || [];
            const highs = quote.high || [];
            const lows = quote.low || [];
            const closes = quote.close || [];
            const volumes = quote.volume || [];

            const incoming = [];
            for (let i = 0; i < timestamps.length; i++) {
                const time = timestamps[i];
                const open = opens[i];
                const high = highs[i] ?? open;
                const low = lows[i] ?? open;
                const close = closes[i] ?? open;
                const volume = volumes[i] ?? 0;

                if (time && open > 0 && close > 0) {
                    incoming.push({ time, open, high, low, close, volume });
                }
            }

            if (incoming.length > 0) {
                const merged = fusionarVelas(cached, incoming, intClean);
                try { fs.writeFileSync(cacheFile, JSON.stringify(merged)); } catch (e) {}
                return merged;
            }
        } catch (err) {}
    }

    return cached.length > 0 ? cached : [];
}

// Inicializar y arrancar el motor MT5 24/7 en segundo plano
try {
    mt5Daemon = new ServerMT5Daemon({
        cacheDir: CACHE_DIR,
        fetchCandlesFn: fetchYahooCandles
    });
    mt5Daemon.start();
} catch (e) {
    console.error('Error al arrancar mt5Daemon:', e);
}

// 5. Tipos MIME
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

// 6. Servidor HTTP
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // API: /api/mt5/daemon_state
    if (pathname === '/api/mt5/daemon_state') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(mt5Daemon ? mt5Daemon.getState() : { error: 'Daemon not running' }));
        return;
    }

    // API: /api/mt5/daemon_control
    if (pathname === '/api/mt5/daemon_control' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                if (mt5Daemon) {
                    if (data.action === 'START') mt5Daemon.start();
                    else if (data.action === 'PAUSE') mt5Daemon.pause();
                    else if (data.action === 'RESET') mt5Daemon.resetChallenge(data.tier || 100000);
                    else if (data.action === 'PANIC') mt5Daemon.cerrarTodasLasPosiciones('Pánico Cloud 24/7');
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, state: mt5Daemon ? mt5Daemon.getState() : null }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // API: /api/mt5/daemon_configure
    if (pathname === '/api/mt5/daemon_configure' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                if (mt5Daemon) {
                    if (data.bot) mt5Daemon.setBot(data.bot);
                    if (Array.isArray(data.symbols)) mt5Daemon.setSymbols(data.symbols);
                    if (data.riskMode) mt5Daemon.challengeConfig.riskMode = data.riskMode;
                    if (data.riskValue !== undefined) mt5Daemon.challengeConfig.riskValue = parseFloat(data.riskValue);
                    if (data.tier) mt5Daemon.challengeConfig.tier = parseFloat(data.tier);
                    mt5Daemon.guardarEstadoPersistente();
                }
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, state: mt5Daemon ? mt5Daemon.getState() : null }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // API: /api/mt5/manual_order
    if (pathname === '/api/mt5/manual_order' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                if (!mt5Daemon) throw new Error('Daemon no disponible');
                const sym = data.symbol || 'BTC-USD';
                const type = data.type || 'BUY';
                const lots = parseFloat(data.lots) || 0.10;
                const price = parseFloat(data.price) || 0;
                const sl = parseFloat(data.sl) || 0;
                const tp = parseFloat(data.tp) || 0;
                const ticket = mt5Daemon.orderSend(sym, type, lots, price, sl, tp, 'Manual Cloud');
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, ticket }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // API: /api/mt5/close_order
    if (pathname === '/api/mt5/close_order' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                if (!mt5Daemon) throw new Error('Daemon no disponible');
                const ok = mt5Daemon.cerrarPosicion(parseInt(data.ticket, 10), null, 'Cierre Manual Cloud');
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: ok }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // API: /api/history
    if (pathname === '/api/history') {
        const symbol = parsedUrl.searchParams.get('symbol') || 'BTC-USD';
        const interval = parsedUrl.searchParams.get('interval') || '1h';

        try {
            const candles = await fetchYahooCandles(symbol, interval);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(candles));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // API: /api/drawings
    if (pathname === '/api/drawings') {
        if (req.method === 'GET') {
            const symbol = parsedUrl.searchParams.get('symbol') || 'BTC-USD';
            const safeName = sanitizarNombre(symbol);
            const filePath = path.join(DRAWINGS_DIR, `${safeName}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ symbol, drawingsJson: content }));
                    return;
                } catch (e) {}
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ symbol, drawingsJson: '[]' }));
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const symbol = data.symbol || 'BTC-USD';
                    const safeName = sanitizarNombre(symbol);
                    const drawingsJson = typeof data.drawingsJson === 'string'
                        ? data.drawingsJson
                        : JSON.stringify(data.drawingsJson || []);
                    const filePath = path.join(DRAWINGS_DIR, `${safeName}.json`);
                    fs.writeFileSync(filePath, drawingsJson, 'utf8');
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true, symbol }));
                } catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }
    }

    // API: /api/status
    if (pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            server: 'QuantVisor Cloud Engine',
            version: '1.0.0',
            uptime: Math.floor(process.uptime()),
            platform: process.platform
        }));
        return;
    }

    // Static Files
    let filePath = path.join(SRC_DIR, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(SRC_DIR)) {
        res.writeHead(403);
        res.end('Acceso denegado');
        return;
    }

    if (!fs.existsSync(filePath)) {
        filePath = path.join(SRC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    } catch (err) {
        res.writeHead(500);
        res.end('Error al leer archivo estático');
    }
});

server.listen(PORT, () => {
    console.log(`🌐 QuantVisor Cloud Engine corriendo exitosamente en el puerto ${PORT}`);
});
