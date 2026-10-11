/**
 * src/mt5_worker.js - Web Worker Anti-Throttling para Ejecución Ininterrumpida en Navegador
 * Mantiene el ciclo de ejecución activo independientemente de si la pestaña está minimizada o en segundo plano.
 */

let timerId = null;
let intervalMs = 2500;

self.onmessage = function (e) {
    const data = e.data || {};
    if (data.type === 'START') {
        if (data.intervalMs) intervalMs = data.intervalMs;
        if (timerId) clearInterval(timerId);
        timerId = setInterval(() => {
            self.postMessage({ type: 'TICK_HEARTBEAT', time: Math.floor(Date.now() / 1000) });
        }, intervalMs);
        self.postMessage({ type: 'WORKER_STARTED', intervalMs });
    } else if (data.type === 'STOP') {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
        self.postMessage({ type: 'WORKER_STOPPED' });
    } else if (data.type === 'SET_INTERVAL') {
        intervalMs = data.intervalMs || 2500;
        if (timerId) {
            clearInterval(timerId);
            timerId = setInterval(() => {
                self.postMessage({ type: 'TICK_HEARTBEAT', time: Math.floor(Date.now() / 1000) });
            }, intervalMs);
        }
    }
};
