/**
 * Motor de Cálculo de Indicadores Técnicos (20+ Indicadores)
 * Compatible con TradingView Lightweight Charts
 */

function calcularSMA(candles, period = 20) {
    if (!candles || !Array.isArray(candles) || candles.length === 0 || !period || period <= 0 || candles.length < period) return [];
    const res = [];
    for (let i = 0; i < candles.length; i++) {
        if (i < period - 1) continue;
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += candles[i - j].close;
        }
        res.push({ time: candles[i].time, value: sum / period });
    }
    return res;
}

function calcularEMA(candles, period = 20) {
    if (!candles || !Array.isArray(candles) || candles.length === 0 || !period || period <= 0 || candles.length < period) return [];
    const res = [];
    const k = 2 / (period + 1);
    let smaSum = 0;

    for (let i = 0; i < candles.length; i++) {
        if (i < period - 1) {
            smaSum += candles[i].close;
            continue;
        }
        if (i === period - 1) {
            smaSum += candles[i].close;
            let currentEma = smaSum / period;
            res.push({ time: candles[i].time, value: currentEma });
            continue;
        }
        const prevEma = res[res.length - 1].value;
        const currentEma = (candles[i].close * k) + (prevEma * (1 - k));
        res.push({ time: candles[i].time, value: currentEma });
    }
    return res;
}

function calcularWMA(candles, period = 20) {
    if (!candles || !Array.isArray(candles) || candles.length === 0 || !period || period <= 0 || candles.length < period) return [];
    const res = [];
    const weightSum = (period * (period + 1)) / 2;

    for (let i = 0; i < candles.length; i++) {
        if (i < period - 1) continue;
        let sum = 0;
        for (let j = 0; j < period; j++) {
            const weight = period - j;
            sum += candles[i - j].close * weight;
        }
        res.push({ time: candles[i].time, value: sum / weightSum });
    }
    return res;
}

function calcularRMA(data, period = 14) {
    // Wilder's Smoothing Average (usado en RSI, ATR, etc.)
    if (!data || !Array.isArray(data) || data.length === 0 || !period || period <= 0 || data.length < period) return [];
    const res = [];
    const alpha = 1 / period;
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
        const val = typeof data[i] === 'number' ? data[i] : data[i].close;
        if (i < period - 1) {
            sum += val;
            continue;
        }
        if (i === period - 1) {
            sum += val;
            let currentRma = sum / period;
            res.push({ time: data[i].time || i, value: currentRma });
            continue;
        }
        const prevRma = res[res.length - 1].value;
        const currentRma = (val * alpha) + (prevRma * (1 - alpha));
        res.push({ time: data[i].time || i, value: currentRma });
    }
    return res;
}

function linreg(dataArray) {
    const N = dataArray.length;
    if (N === 0) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < N; i++) {
        sumX += i;
        sumY += dataArray[i];
        sumXY += i * dataArray[i];
        sumXX += i * i;
    }
    const denom = N * sumXX - sumX * sumX;
    if (denom === 0) return sumY / N;
    const m = (N * sumXY - sumX * sumY) / denom;
    const b = (sumY - m * sumX) / N;
    return m * (N - 1) + b;
}

// SQUEEZE MOMENTUM INDICATOR (SQZMOM_LB con Squeeze Dots de LazyBear)
function calcularSqueezeMomentum(candles, bbLength = 20, bbMult = 2.0, kcLength = 20, kcMult = 1.5, useTrueRange = true, styleParams = {}) {
    if (!candles || candles.length < Math.max(bbLength, kcLength)) {
        return { histogram: [], dots: [] };
    }

    const col0 = styleParams.col0 || '#00e676';
    const col1 = styleParams.col1 || '#089981';
    const col2 = styleParams.col2 || '#ff1744';
    const col3 = styleParams.col3 || '#f23645';

    const colSqzOn = styleParams.colSqzOn || '#2962ff';   // Squeeze On (Blue)
    const colSqzOff = styleParams.colSqzOff || '#000000'; // Squeeze Off (Black)
    const colSqzNo = styleParams.colSqzNo || '#787b86';   // Squeeze Release (Gray)

    const smaMap = new Map(calcularSMA(candles, bbLength).map(p => [p.time, p.value]));
    
    // calcular stdev para Bollinger Bands
    const bbMap = new Map();
    for (let i = 0; i < candles.length; i++) {
        if (i < bbLength - 1) continue;
        const mean = smaMap.get(candles[i].time);
        if (mean === undefined) continue;
        let sumSq = 0;
        for (let j = 0; j < bbLength; j++) {
            sumSq += Math.pow(candles[i - j].close - mean, 2);
        }
        const dev = Math.sqrt(sumSq / bbLength);
        bbMap.set(candles[i].time, {
            upper: mean + bbMult * dev,
            lower: mean - bbMult * dev
        });
    }

    // calcular Keltner Channels
    const trArray = [];
    for (let i = 0; i < candles.length; i++) {
        if (i === 0) {
            trArray.push(candles[i].high - candles[i].low);
        } else {
            const h = candles[i].high;
            const l = candles[i].low;
            const prevC = candles[i - 1].close;
            trArray.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
        }
    }
    const kcRangeSma = new Map();
    for (let i = 0; i < candles.length; i++) {
        if (i < kcLength - 1) continue;
        let sumTR = 0;
        for (let j = 0; j < kcLength; j++) {
            sumTR += useTrueRange ? trArray[i - j] : (candles[i - j].high - candles[i - j].low);
        }
        kcRangeSma.set(candles[i].time, sumTR / kcLength);
    }

    const rawVal = [];
    const dots = [];

    for (let i = 0; i < candles.length; i++) {
        if (i < Math.max(bbLength, kcLength) - 1) continue;

        let maxH = -Infinity, minL = Infinity;
        for (let j = 0; j < kcLength; j++) {
            maxH = Math.max(maxH, candles[i - j].high);
            minL = Math.min(minL, candles[i - j].low);
        }

        const smaVal = smaMap.get(candles[i].time) || candles[i].close;
        const avgPrice = ((maxH + minL) / 2 + smaVal) / 2;
        const diff = candles[i].close - avgPrice;
        rawVal.push({ time: candles[i].time, diff: diff });

        // Determinación de los Squeeze Dots
        const bb = bbMap.get(candles[i].time);
        const rangeVal = kcRangeSma.get(candles[i].time);

        if (bb && rangeVal !== undefined) {
            const upperKC = smaVal + kcMult * rangeVal;
            const lowerKC = smaVal - kcMult * rangeVal;

            const sqzOn = (bb.lower > lowerKC) && (bb.upper < upperKC);
            const sqzOff = (bb.lower < lowerKC) && (bb.upper > upperKC);

            let dotColor = colSqzNo;
            if (sqzOn) dotColor = colSqzOn;
            else if (sqzOff) dotColor = colSqzOff;

            dots.push({
                time: candles[i].time,
                value: 0,
                color: dotColor
            });
        }
    }

    const histogram = [];
    for (let i = kcLength - 1; i < rawVal.length; i++) {
        const slice = rawVal.slice(i - kcLength + 1, i + 1).map(r => r.diff);
        const val = linreg(slice);

        const prevVal = histogram.length > 0 ? histogram[histogram.length - 1].value : 0;
        let color = col1;

        if (val >= 0) {
            color = val > prevVal ? col0 : col1;
        } else {
            color = val < prevVal ? col2 : col3;
        }

        histogram.push({
            time: rawVal[i].time,
            value: val,
            color: color
        });
    }

    return { histogram, dots };
}

// DMI / ADX
function calcularADX(candles, period = 14, keyLevel = 23) {
    if (!candles || !Array.isArray(candles) || candles.length < period + 1) {
        return { adx: [], pdi: [], ndi: [], keyLevel: [] };
    }

    const tr = [], pDM = [], nDM = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high, l = candles[i].low;
        const prevH = candles[i - 1].high, prevL = candles[i - 1].low, prevC = candles[i - 1].close;

        const currentTR = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
        const upMove = h - prevH;
        const downMove = prevL - l;

        const currentPDM = (upMove > downMove && upMove > 0) ? upMove : 0;
        const currentNDM = (downMove > upMove && downMove > 0) ? downMove : 0;

        tr.push(currentTR); pDM.push(currentPDM); nDM.push(currentNDM);
    }

    let smoothTR = 0, smoothPDM = 0, smoothNDM = 0;
    for (let i = 0; i < period; i++) {
        smoothTR += tr[i]; smoothPDM += pDM[i]; smoothNDM += nDM[i];
    }

    const pdi = [], ndi = [], dx = [], kl = [];

    let plusDI = smoothTR === 0 ? 0 : (smoothPDM / smoothTR) * 100;
    let minusDI = smoothTR === 0 ? 0 : (smoothNDM / smoothTR) * 100;
    let time = candles[period].time;

    pdi.push({ time: time, value: plusDI });
    ndi.push({ time: time, value: minusDI });
    kl.push({ time: time, value: keyLevel });

    let diDiff = Math.abs(plusDI - minusDI);
    let diSum = plusDI + minusDI;
    dx.push({ time: time, value: diSum === 0 ? 0 : (diDiff / diSum) * 100 });

    for (let i = period; i < tr.length; i++) {
        smoothTR = smoothTR - (smoothTR / period) + tr[i];
        smoothPDM = smoothPDM - (smoothPDM / period) + pDM[i];
        smoothNDM = smoothNDM - (smoothNDM / period) + nDM[i];

        plusDI = smoothTR === 0 ? 0 : (smoothPDM / smoothTR) * 100;
        minusDI = smoothTR === 0 ? 0 : (smoothNDM / smoothTR) * 100;
        time = candles[i + 1].time;

        pdi.push({ time: time, value: plusDI });
        ndi.push({ time: time, value: minusDI });
        kl.push({ time: time, value: keyLevel });

        diDiff = Math.abs(plusDI - minusDI);
        diSum = plusDI + minusDI;
        dx.push({ time: time, value: diSum === 0 ? 0 : (diDiff / diSum) * 100 });
    }

    const adx = [];
    if (dx.length >= period) {
        let sumDX = 0;
        for (let i = 0; i < period; i++) sumDX += dx[i].value;
        let prevADX = sumDX / period;
        adx.push({ time: dx[period - 1].time, value: prevADX });

        for (let i = period; i < dx.length; i++) {
            prevADX = (prevADX * (period - 1) + dx[i].value) / period;
            adx.push({ time: dx[i].time, value: prevADX });
        }
    }

    return { adx, pdi, ndi, keyLevel: kl };
}

// RSI
function calcularRSI(candles, period = 14) {
    if (!candles || !Array.isArray(candles) || candles.length <= period) return [];
    const res = [];
    let gains = 0, losses = 0;

    for (let i = 1; i <= period; i++) {
        const change = candles[i].close - candles[i - 1].close;
        if (change >= 0) gains += change;
        else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    let rsi0 = (avgLoss === 0 && avgGain === 0)
        ? 50
        : (avgLoss === 0 ? 100 : (avgGain === 0 ? 0 : 100 - (100 / (1 + (avgGain / avgLoss)))));
    res.push({ time: candles[period].time, value: rsi0 });

    for (let i = period + 1; i < candles.length; i++) {
        const change = candles[i].close - candles[i - 1].close;
        const gain = change >= 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        let rsiVal = (avgLoss === 0 && avgGain === 0)
            ? 50
            : (avgLoss === 0 ? 100 : (avgGain === 0 ? 0 : 100 - (100 / (1 + (avgGain / avgLoss)))));
        res.push({ time: candles[i].time, value: rsiVal });
    }
    return res;
}

// MACD
function calcularMACD(candles, fastP = 12, slowP = 26, sigP = 9) {
    if (!candles || candles.length < slowP + sigP) {
        return { macdLine: [], signalLine: [], histogram: [] };
    }
    const fastEma = calcularEMA(candles, fastP);
    const slowEma = calcularEMA(candles, slowP);

    const slowMap = new Map(slowEma.map(p => [p.time, p.value]));
    const macdData = [];

    for (const f of fastEma) {
        const sVal = slowMap.get(f.time);
        if (sVal !== undefined) {
            macdData.push({ time: f.time, close: f.value - sVal });
        }
    }

    const signalData = calcularEMA(macdData, sigP);
    const signalMap = new Map(signalData.map(p => [p.time, p.value]));

    const macdLine = [];
    const signalLine = [];
    const histogram = [];

    for (const m of macdData) {
        const sigVal = signalMap.get(m.time);
        if (sigVal !== undefined) {
            macdLine.push({ time: m.time, value: m.close });
            signalLine.push({ time: m.time, value: sigVal });
            histogram.push({ time: m.time, value: m.close - sigVal, color: (m.close - sigVal) >= 0 ? '#089981' : '#f23645' });
        }
    }

    return { macdLine, signalLine, histogram };
}

// BOLLINGER BANDS
function calcularBollinger(candles, period = 20, mult = 2.0) {
    if (!candles || candles.length < period) {
        return { basis: [], upper: [], lower: [] };
    }
    const sma = calcularSMA(candles, period);
    const basis = [], upper = [], lower = [];

    for (let i = 0; i < candles.length; i++) {
        if (i < period - 1) continue;
        const mean = sma[i - period + 1].value;
        let sumSq = 0;
        for (let j = 0; j < period; j++) {
            sumSq += Math.pow(candles[i - j].close - mean, 2);
        }
        const stdev = Math.sqrt(sumSq / period);

        const t = candles[i].time;
        basis.push({ time: t, value: mean });
        upper.push({ time: t, value: mean + mult * stdev });
        lower.push({ time: t, value: mean - mult * stdev });
    }

    return { basis, upper, lower };
}

// DONCHIAN CHANNELS
function calcularDonchian(candles, period = 20) {
    if (!candles || candles.length < period) {
        return { upper: [], basis: [], lower: [] };
    }
    const upper = [], basis = [], lower = [];

    for (let i = 0; i < candles.length; i++) {
        if (i < period - 1) continue;
        let maxH = -Infinity, minL = Infinity;
        for (let j = 0; j < period; j++) {
            maxH = Math.max(maxH, candles[i - j].high);
            minL = Math.min(minL, candles[i - j].low);
        }
        const t = candles[i].time;
        const mid = (maxH + minL) / 2;
        upper.push({ time: t, value: maxH });
        lower.push({ time: t, value: minL });
        basis.push({ time: t, value: mid });
    }
    return { upper, basis, lower };
}

// ATR
function calcularATR(candles, period = 14) {
    if (!candles || candles.length < period) return [];
    const trData = [];
    for (let i = 0; i < candles.length; i++) {
        if (i === 0) {
            trData.push({ time: candles[i].time, close: candles[i].high - candles[i].low });
        } else {
            const h = candles[i].high, l = candles[i].low, prevC = candles[i - 1].close;
            const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
            trData.push({ time: candles[i].time, close: tr });
        }
    }
    return calcularRMA(trData, period);
}

// KELTNER CHANNELS
function calcularKeltner(candles, period = 20, mult = 2.0) {
    if (!candles || candles.length < period) {
        return { upper: [], basis: [], lower: [] };
    }
    const emaBasis = calcularEMA(candles, period);
    const atrData = calcularATR(candles, period);
    const atrMap = new Map(atrData.map(a => [a.time, a.value]));

    const upper = [], basis = [], lower = [];

    for (const b of emaBasis) {
        const atrVal = atrMap.get(b.time);
        if (atrVal !== undefined) {
            basis.push({ time: b.time, value: b.value });
            upper.push({ time: b.time, value: b.value + mult * atrVal });
            lower.push({ time: b.time, value: b.value - mult * atrVal });
        }
    }
    return { upper, basis, lower };
}

// STOCHASTIC OSCILLATOR (%K, %D)
function calcularStoch(candles, period = 14, smoothK = 3, smoothD = 3) {
    if (!candles || candles.length < period) return { k: [], d: [] };
    const rawK = [];

    for (let i = 0; i < candles.length; i++) {
        if (i < period - 1) continue;
        let maxH = -Infinity, minL = Infinity;
        for (let j = 0; j < period; j++) {
            maxH = Math.max(maxH, candles[i - j].high);
            minL = Math.min(minL, candles[i - j].low);
        }
        const denom = maxH - minL;
        const val = denom === 0 ? 50 : ((candles[i].close - minL) / denom) * 100;
        rawK.push({ time: candles[i].time, close: val });
    }

    const kData = calcularSMA(rawK, smoothK);
    const dData = calcularSMA(kData.map(p => ({ time: p.time, close: p.value })), smoothD);

    return { k: kData, d: dData };
}

// SUPERTREND
function calcularSupertrend(candles, period = 10, mult = 3.0) {
    if (!candles || candles.length < period) return [];
    const atrData = calcularATR(candles, period);
    const atrMap = new Map(atrData.map(a => [a.time, a.value]));

    const res = [];
    let prevTrend = 1;
    let prevUpper = 0;
    let prevLower = 0;

    for (let i = 0; i < candles.length; i++) {
        const atr = atrMap.get(candles[i].time);
        if (atr === undefined) continue;

        const hl2 = (candles[i].high + candles[i].low) / 2;
        let basicUpper = hl2 + mult * atr;
        let basicLower = hl2 - mult * atr;

        const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;

        let finalUpper, finalLower;
        if (res.length === 0) {
            finalUpper = basicUpper;
            finalLower = basicLower;
        } else {
            finalUpper = (basicUpper < prevUpper || prevClose > prevUpper) ? basicUpper : prevUpper;
            finalLower = (basicLower > prevLower || prevClose < prevLower) ? basicLower : prevLower;
        }

        let trend = prevTrend;
        if (prevTrend === 1 && candles[i].close < finalLower) {
            trend = -1;
            finalUpper = basicUpper;
        } else if (prevTrend === -1 && candles[i].close > finalUpper) {
            trend = 1;
            finalLower = basicLower;
        }

        const value = trend === 1 ? finalLower : finalUpper;
        const color = trend === 1 ? '#089981' : '#f23645';

        res.push({ time: candles[i].time, value, trend, color });

        prevTrend = trend;
        prevUpper = finalUpper;
        prevLower = finalLower;
    }
    return res;
}

// VWAP
function calcularVWAP(candles) {
    if (!candles || candles.length === 0) return [];
    const res = [];
    let cumVol = 0;
    let cumPriceVol = 0;

    for (let i = 0; i < candles.length; i++) {
        const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
        const vol = candles[i].volume || 1;

        cumPriceVol += tp * vol;
        cumVol += vol;

        res.push({ time: candles[i].time, value: cumVol === 0 ? tp : cumPriceVol / cumVol });
    }
    return res;
}

// CCI (Commodity Channel Index)
function calcularCCI(candles, period = 20) {
    if (!candles || candles.length < period) return [];
    const tpList = candles.map(c => ({ time: c.time, tp: (c.high + c.low + c.close) / 3 }));
    const res = [];

    for (let i = 0; i < tpList.length; i++) {
        if (i < period - 1) continue;
        let sumTp = 0;
        for (let j = 0; j < period; j++) {
            sumTp += tpList[i - j].tp;
        }
        const smaTp = sumTp / period;

        let sumDev = 0;
        for (let j = 0; j < period; j++) {
            sumDev += Math.abs(tpList[i - j].tp - smaTp);
        }
        const meanDev = sumDev / period;

        const cci = meanDev === 0 ? 0 : (tpList[i].tp - smaTp) / (0.015 * meanDev);
        res.push({ time: tpList[i].time, value: cci });
    }
    return res;
}

// ROC (Rate of Change)
function calcularROC(candles, period = 12) {
    if (!candles || candles.length <= period) return [];
    const res = [];
    for (let i = period; i < candles.length; i++) {
        const prevC = candles[i - period].close;
        const roc = prevC === 0 ? 0 : ((candles[i].close - prevC) / prevC) * 100;
        res.push({ time: candles[i].time, value: roc });
    }
    return res;
}

// MFI (Money Flow Index)
function calcularMFI(candles, period = 14) {
    if (!candles || !Array.isArray(candles) || candles.length <= period) return [];
    const res = [];
    const tpList = candles.map(c => (c.high + c.low + c.close) / 3);

    for (let i = period; i < candles.length; i++) {
        let posFlow = 0, negFlow = 0;
        for (let j = i - period + 1; j <= i; j++) {
            const rawFlow = tpList[j] * (candles[j].volume || 1);
            if (tpList[j] > tpList[j - 1]) posFlow += rawFlow;
            else if (tpList[j] < tpList[j - 1]) negFlow += rawFlow;
        }
        const mfi = negFlow === 0 ? 100 : 100 - (100 / (1 + (posFlow / negFlow)));
        res.push({ time: candles[i].time, value: mfi });
    }
    return res;
}

// OBV (On Balance Volume)
function calcularOBV(candles) {
    if (!candles || candles.length === 0) return [];
    const res = [];
    let currentOBV = 0;
    res.push({ time: candles[0].time, value: 0 });

    for (let i = 1; i < candles.length; i++) {
        const change = candles[i].close - candles[i - 1].close;
        const vol = candles[i].volume || 0;
        if (change > 0) currentOBV += vol;
        else if (change < 0) currentOBV -= vol;
        res.push({ time: candles[i].time, value: currentOBV });
    }
    return res;
}

// HMA (Hull Moving Average)
function calcularHMA(candles, period = 9) {
    if (!candles || !Array.isArray(candles) || candles.length < period) return [];
    const halfPeriod = Math.floor(period / 2);
    const sqrtPeriod = Math.floor(Math.sqrt(period));

    const wmaHalf = calcularWMA(candles, halfPeriod);
    const wmaFull = calcularWMA(candles, period);

    const fullMap = new Map(wmaFull.map(p => [p.time, p.value]));
    const diffData = [];

    for (const h of wmaHalf) {
        const fVal = fullMap.get(h.time);
        if (fVal !== undefined) {
            diffData.push({ time: h.time, close: 2 * h.value - fVal });
        }
    }

    return calcularWMA(diffData, sqrtPeriod);
}

// Gann High-Low Activator (Robert Krausz / Hobbiecode Gold Rush)
function calcularGannHiLo(candles, period = 5) {
    if (!candles || !Array.isArray(candles) || candles.length < period) return [];
    const n = candles.length;
    const res = [];
    let currentTrend = 1;

    const smaHigh = [];
    const smaLow = [];
    for (let i = 0; i < n; i++) {
        if (i < period - 1) {
            smaHigh.push(null);
            smaLow.push(null);
            continue;
        }
        let sumH = 0, sumL = 0;
        for (let j = 0; j < period; j++) {
            sumH += candles[i - j].high;
            sumL += candles[i - j].low;
        }
        smaHigh.push(sumH / period);
        smaLow.push(sumL / period);
    }

    for (let i = period; i < n; i++) {
        const prevH = smaHigh[i - 1];
        const prevL = smaLow[i - 1];
        const c = candles[i].close;

        let stopLine = 0;
        if (currentTrend === 1) {
            if (c < prevL) {
                currentTrend = -1;
                stopLine = prevH;
            } else {
                stopLine = prevL;
            }
        } else {
            if (c > prevH) {
                currentTrend = 1;
                stopLine = prevL;
            } else {
                stopLine = prevH;
            }
        }
        res.push({
            time: candles[i].time,
            trend: currentTrend,
            stopLine: stopLine,
            highMA: prevH,
            lowMA: prevL
        });
    }
    return res;
}

// EXPORTACIÓN DE MOTOR COMPLETO DE INDICADORES
const IndicatorsEngine = {
    calcularSMA,
    calcularEMA,
    calcularWMA,
    calcularRMA,
    calcularSqueezeMomentum,
    calcularADX,
    calcularRSI,
    calcularMACD,
    calcularBollinger,
    calcularDonchian,
    calcularKeltner,
    calcularStoch,
    calcularATR,
    calcularSupertrend,
    calcularVWAP,
    calcularCCI,
    calcularROC,
    calcularMFI,
    calcularOBV,
    calcularHMA,
    calcularGannHiLo
};

if (typeof window !== 'undefined') {
    window.IndicatorsEngine = IndicatorsEngine;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IndicatorsEngine;
}
if (typeof global !== 'undefined') {
    global.IndicatorsEngine = IndicatorsEngine;
}

