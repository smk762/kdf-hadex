export function initPanel() {
    try {
        if (typeof window !== 'undefined' && window.document) {
            if (!window.document.querySelector('kdf-panel')) {
                const el = window.document.createElement('kdf-panel');
                // Note: original setConfig may exist on the class
                if (typeof el.setConfig === 'function') {
                    try { el.setConfig((window as any).KDFPanel && (window as any).KDFPanel.getStubConfig ? (window as any).KDFPanel.getStubConfig() : {}); } catch (e) { /* ignore */ }
                }
                window.document.body.appendChild(el);
            }
        }
    } catch (e) {
        console.error('Panel init failed', e);
    }
}
