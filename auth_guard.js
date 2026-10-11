/**
 * auth_guard.js - Control de acceso para los servidores de QuantVisor.
 *
 * - Autenticación HTTP Basic (el navegador muestra su diálogo nativo de usuario/contraseña
 *   y reenvía las credenciales automáticamente en todas las peticiones del mismo origen,
 *   por lo que el frontend no necesita cambios).
 * - Rutas públicas mínimas para keep-alive (/health, /api/ping) que no exponen datos.
 * - Protección anti-CSRF: rechaza peticiones que modifican estado si vienen de otro origen.
 *
 * Variables de entorno:
 *   QV_USER      Usuario (por defecto: "admin")
 *   QV_PASSWORD  Contraseña. Si no está definida:
 *                  - modo 'cloud'  -> el servidor se bloquea (fail-closed) con un aviso.
 *                  - modo 'local'  -> acceso libre (uso en red doméstica).
 */

import crypto from 'crypto';

const PUBLIC_PATHS = new Set(['/health', '/api/ping']);

function safeEqual(a, b) {
    const ba = Buffer.from(String(a), 'utf8');
    const bb = Buffer.from(String(b), 'utf8');
    if (ba.length !== bb.length) {
        // Comparar igualmente para no filtrar longitud por tiempo
        crypto.timingSafeEqual(ba, ba);
        return false;
    }
    return crypto.timingSafeEqual(ba, bb);
}

export function isAuthConfigured() {
    return Boolean(process.env.QV_PASSWORD && process.env.QV_PASSWORD.length > 0);
}

/**
 * Devuelve true si la petición puede continuar. Si devuelve false, ya respondió al cliente.
 * @param {'cloud'|'local'} mode
 */
export function guardRequest(req, res, pathname, mode = 'cloud') {
    if (PUBLIC_PATHS.has(pathname)) return true;

    // Anti-CSRF: métodos que modifican estado deben venir del mismo origen
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
        const origin = req.headers.origin;
        if (origin) {
            let originHost = '';
            try { originHost = new URL(origin).host; } catch (e) { originHost = ''; }
            if (originHost !== req.headers.host) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Origen no permitido' }));
                return false;
            }
        }
    }

    const password = process.env.QV_PASSWORD || '';
    const user = process.env.QV_USER || 'admin';

    if (!password) {
        if (mode === 'local') return true;
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><title>QuantVisor bloqueado</title>
<body style="font-family:system-ui;background:#131722;color:#d1d4dc;padding:40px;max-width:640px;margin:auto">
<h2>🔒 QuantVisor está bloqueado por seguridad</h2>
<p>Este servidor es accesible desde internet y todavía no tiene contraseña.</p>
<p>En Render: <b>tu servicio → Environment → Add Environment Variable</b><br>
<code>QV_PASSWORD</code> = una contraseña larga (y opcionalmente <code>QV_USER</code>).</p>
<p>Guarda los cambios; el servicio se reiniciará y te pedirá usuario y contraseña.</p></body>`);
        return false;
    }

    const header = req.headers.authorization || '';
    if (header.startsWith('Basic ')) {
        let decoded = '';
        try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch (e) { decoded = ''; }
        const sep = decoded.indexOf(':');
        if (sep !== -1) {
            const u = decoded.slice(0, sep);
            const p = decoded.slice(sep + 1);
            // Evaluar ambos siempre para no filtrar cuál falló
            const okUser = safeEqual(u, user);
            const okPass = safeEqual(p, password);
            if (okUser && okPass) return true;
        }
    }

    res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="QuantVisor", charset="UTF-8"',
        'Content-Type': 'text/plain; charset=utf-8'
    });
    res.end('Autenticación requerida');
    return false;
}
