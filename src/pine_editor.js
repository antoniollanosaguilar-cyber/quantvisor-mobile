/**
 * Editor de Código Pine Script v5 & Motor de Validación e Integración Visual
 */

window.PineEditor = class PineEditor {
    constructor() {
        this.initUI();
    }

    initUI() {
        const btnOpen = document.getElementById('btn-pine-modal-open');
        const modalPine = document.getElementById('pine-editor-modal');
        const btnClosePine = document.getElementById('modal-pine-close');
        const btnApplyPine = document.getElementById('btn-modal-apply-pine');
        const btnSavePine = document.getElementById('btn-modal-save-pine');
        const codeEditor = document.getElementById('pine-code-editor');
        const nameInput = document.getElementById('pine-indicator-name');

        if (btnOpen && modalPine) {
            btnOpen.onclick = () => { modalPine.style.display = 'flex'; };
        }
        if (btnClosePine && modalPine) {
            btnClosePine.onclick = () => { modalPine.style.display = 'none'; };
        }

        if (btnApplyPine) {
            btnApplyPine.onclick = () => this.aplicarScriptAlGrafico();
        }

        if (btnSavePine) {
            btnSavePine.onclick = () => this.guardarIndicadorEnLista();
        }

        if (codeEditor && nameInput) {
            codeEditor.addEventListener('input', () => {
                if (!nameInput.dataset.userEdited) {
                    const code = codeEditor.value;
                    const match = code.match(/indicator\s*\(\s*["']([^"']+)["']/i) || 
                                  code.match(/strategy\s*\(\s*["']([^"']+)["']/i);
                    if (match && match[1]) {
                        nameInput.value = match[1].trim();
                    }
                }
            });

            nameInput.addEventListener('input', () => {
                nameInput.dataset.userEdited = 'true';
            });
        }
    }

    guardarIndicadorEnLista() {
        const nameInput = document.getElementById('pine-indicator-name');
        const codeEditor = document.getElementById('pine-code-editor');
        if (!codeEditor) return;

        let name = (nameInput ? nameInput.value : '').trim();
        const code = codeEditor.value.trim();

        if (!code) {
            alert("⚠️ El código Pine Script no puede estar vacío.");
            return;
        }

        if (!name) {
            const match = code.match(/indicator\s*\(\s*["']([^"']+)["']/i) || 
                          code.match(/strategy\s*\(\s*["']([^"']+)["']/i);
            name = match ? match[1].trim() : 'Mi Indicador Pine';
            if (nameInput) nameInput.value = name;
        }

        const nuevoIndicador = {
            id: 'pine_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            name: name,
            category: 'Pine Script (Personalizado)',
            type: 'PINE',
            code: code,
            createdAt: new Date().toISOString()
        };

        let customs = [];
        try {
            const raw = localStorage.getItem('quantvisor_custom_pine_indicators');
            if (raw) customs = JSON.parse(raw);
        } catch (e) {}

        const existIdx = customs.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
        if (existIdx >= 0) {
            customs[existIdx].code = code;
            customs[existIdx].updatedAt = new Date().toISOString();
        } else {
            customs.push(nuevoIndicador);
        }

        try {
            localStorage.setItem('quantvisor_custom_pine_indicators', JSON.stringify(customs));
        } catch (e) {
            console.warn("Error al guardar indicador en localStorage:", e);
        }

        const btnSave = document.getElementById('btn-modal-save-pine');
        if (btnSave) {
            const originalHTML = btnSave.innerHTML;
            btnSave.innerHTML = '✅ ¡Guardado en Lista!';
            btnSave.style.backgroundColor = '#2962ff';
            setTimeout(() => {
                btnSave.innerHTML = originalHTML;
                btnSave.style.backgroundColor = '#089981';
            }, 2000);
        }

        if (typeof window.actualizarCatalogoIndicadores === 'function') {
            window.actualizarCatalogoIndicadores();
        }
    }

    async aplicarScriptAlGrafico() {
        const invoke = window.__TAURI__ ? window.__TAURI__.core.invoke : null;
        const historialVelas = window.historialVelas || [];
        
        if (!historialVelas.length) {
            alert("⚠️ Primero debe cargar datos de velas para ejecutar o aplicar el script Pine.");
            return;
        }

        const codeEditor = document.getElementById('pine-code-editor');
        if (!codeEditor) return;
        const code = codeEditor.value;

        if (!invoke) {
            alert("⚠️ La evaluación de Pine Script requiere el backend de Rust en ejecución.");
            return;
        }

        try {
            const evalOutput = await invoke('evaluar_pine_script', {
                code: code,
                candles: historialVelas
            });

            if (!evalOutput || !evalOutput.plots || evalOutput.plots.length === 0) {
                alert("ℹ️ El script Pine se compiló correctamente pero no generó gráficos 'plot()'.");
                return;
            }

            const chart = window.chart;
            let oscillatorChart = window.oscillatorChart;

            evalOutput.plots.forEach(plot => {
                let targetChart = chart;
                if (plot.is_oscillator) {
                    if (typeof window.garantizarOscilador === 'function') {
                        window.garantizarOscilador();
                        oscillatorChart = window.oscillatorChart;
                    }
                    targetChart = oscillatorChart || chart;
                }

                if (!targetChart) return;

                let series;
                if (plot.plot_style === 'Histogram') {
                    series = targetChart.addHistogramSeries({
                        title: plot.name,
                        color: plot.color || '#2962ff'
                    });
                } else {
                    series = targetChart.addLineSeries({
                        title: plot.name,
                        color: plot.color || '#2962ff',
                        lineWidth: 2
                    });
                }

                const dataPoints = plot.points.map(pt => ({
                    time: pt.time,
                    value: pt.value,
                    color: pt.color || undefined
                }));

                series.setData(dataPoints);

                if (window.indicadoresActivos) {
                    window.indicadoresActivos.push({
                        type: 'PINE',
                        name: plot.name,
                        seriesList: [series],
                        isOscillator: plot.is_oscillator
                    });
                }
            });

            document.getElementById('pine-editor-modal').style.display = 'none';

        } catch (err) {
            alert(`⚠️ Error en sintaxis o ejecución de Pine Script: ${err}`);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.pineEditorInstance = new window.PineEditor();
});
