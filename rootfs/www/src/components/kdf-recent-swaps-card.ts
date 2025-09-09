class KDFRecentSwapsCard extends HTMLElement {
    private _config: any = {};
    private _recentSwapsData: any = null;
    private _refreshTimer: any = null;

    constructor(){ super(); this.attachShadow({ mode: 'open' }); }

    static getConfigElement(){ return document.createElement('kdf-recent-swaps-card-editor'); }

    static getStubConfig(){ return { type: 'custom:kdf-recent-swaps-card', title: 'KDF Recent Swaps', max_swaps: 10, refresh_interval: 60, panel_api_base: '/' }; }

    setConfig(config: any){ this._config = { ...KDFRecentSwapsCard.getStubConfig(), ...config }; this.render(); this.loadRecentSwaps(); if (this._config.refresh_interval > 0){ if (this._refreshTimer) clearInterval(this._refreshTimer); this._refreshTimer = setInterval(()=>this.loadRecentSwaps(), this._config.refresh_interval*1000); } }

    connectedCallback(){ this.render(); }

    render(){
        this.shadowRoot!.innerHTML = `
            <style>
                :host { display: block; background: var(--card-background-color, #1a1a1a); border-radius: var(--border-radius, 12px); padding: 16px; color: var(--primary-text-color, #ffffff); font-family: var(--primary-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); }
                .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:8px; border-bottom:1px solid var(--divider-color,#444); }
                .title { font-size:1.2rem; font-weight:600; color:var(--primary-color,#00d4aa); }
                .refresh-btn { background: var(--primary-color, #00d4aa); color: var(--text-primary-color, #000); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
                .swaps-container { max-height: 500px; overflow-y: auto; }
                .swap-item { background: var(--secondary-background-color, #2a2a2a); border-radius:8px; padding:12px; margin-bottom:8px; border:1px solid var(--divider-color,#444); }
                .loading{ text-align:center; color:var(--secondary-text-color,#888); padding:40px; }
                .error{ text-align:center; color:#ff4444; padding:40px; }
                .no-swaps{ text-align:center; color:var(--secondary-text-color,#888); padding:40px; font-style:italic; }
                .last-updated{ text-align:center; color:var(--secondary-text-color,#666); font-size:0.8rem; margin-top:12px; }
            </style>
            <div class="header">
                <div class="title">${this._config.title || 'KDF Recent Swaps'}</div>
                <div>
                    <button class="refresh-btn" id="refresh-btn">↻ Refresh</button>
                    <button class="refresh-btn" id="raw-btn">Raw</button>
                </div>
            </div>
            <div class="swaps-container" id="swaps-container"><div class="loading">Loading recent swaps...</div></div>
            <div class="last-updated" id="last-updated">Last updated: Never</div>
        `;
        const refresh = this.shadowRoot!.getElementById('refresh-btn');
        const raw = this.shadowRoot!.getElementById('raw-btn');
        if (refresh) refresh.addEventListener('click', ()=>this.refreshRecentSwaps());
        if (raw) raw.addEventListener('click', ()=>this.showRawPayload(this._recentSwapsData));
    }

    async loadRecentSwaps(){
        try{
            const resp = await this.fetchWithBackoff((this._config.panel_api_base || '') + '/api/recent_swaps_transformed?max_swaps=' + encodeURIComponent(this._config.max_swaps || 10), { retries: 3, minTimeout: 500 });
            const data = resp && resp.swaps ? resp.swaps : [];
            const transformed = this.transformRecentSwapsData(data);
            this.displayRecentSwaps(transformed);
            this.updateLastUpdated();
        }catch(e){ console.error('Error loading recent swaps:', e); this.displayError((e as Error).message || String(e)); }
    }

    async fetchWithBackoff(url: string, opts: any = {}){
        const retries = opts.retries || 3; const minTimeout = opts.minTimeout || 300; let attempt = 0;
        while (attempt <= retries){ try{ const res = await fetch(url); if (!res.ok) throw new Error(`HTTP ${res.status}`); return await res.json(); }catch(err){ attempt++; if (attempt>retries) throw err; const wait = Math.min(2000, minTimeout * Math.pow(2, attempt)); await new Promise(r => setTimeout(r, wait)); } }
    }

    showRawPayload(payload: any){ const modal = document.createElement('div'); modal.style = `position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;`; const box = document.createElement('div'); box.style = `background:#111;color:#eee;padding:16px;border-radius:8px;max-width:90%;max-height:90%;overflow:auto;font-family:monospace;`; const pre = document.createElement('pre'); pre.textContent = JSON.stringify(payload, null, 2); const btn = document.createElement('button'); btn.textContent = 'Close'; btn.style = 'display:block;margin-top:8px;'; btn.addEventListener('click', () => modal.remove()); box.appendChild(pre); box.appendChild(btn); modal.appendChild(box); document.body.appendChild(modal); }

    transformRecentSwapsData(kdfData: any){ const swaps: any[] = []; if (kdfData && Array.isArray(kdfData)){ kdfData.forEach((swap: any)=>{ swaps.push({ uuid: swap.uuid || 'Unknown', pair: `${swap.base}/${swap.rel}`, status: this.mapSwapStatus(swap.status), baseAmount: parseFloat(swap.base_amount || 0).toFixed(8), relAmount: parseFloat(swap.rel_amount || 0).toFixed(8), completedAt: swap.finished_at ? new Date(swap.finished_at * 1000).toLocaleString() : 'Unknown', startedAt: swap.started_at ? new Date(swap.started_at * 1000).toLocaleString() : 'Unknown', duration: this.calculateSwapDuration(swap.started_at, swap.finished_at) }); }); }
        return swaps.slice(0, this._config.max_swaps);
    }

    mapSwapStatus(status: any){ const statusMap: any = { 'finished': 'completed', 'failed':'failed', 'cancelled':'cancelled','timeout':'failed' }; return statusMap[status] || 'completed'; }

    calculateSwapDuration(startedAt: any, finishedAt: any){ if (!startedAt || !finishedAt) return 'Unknown'; const duration = finishedAt - startedAt; const minutes = Math.floor(duration/60); const seconds = duration % 60; return `${minutes}m ${seconds}s`; }

    displayRecentSwaps(swaps: any[]){ this._recentSwapsData = swaps; const container = this.shadowRoot!.getElementById('swaps-container'); if (!container) return; if (swaps.length === 0){ container.innerHTML = '<div class="no-swaps">No recent swaps</div>'; return; } container.innerHTML = ''; swaps.forEach(swap=>{ const swapElement = document.createElement('div'); swapElement.className = 'swap-item'; swapElement.innerHTML = `
            <div class="swap-header">
                <div class="swap-pair">${swap.pair}</div>
                <div class="swap-status ${swap.status}">${swap.status.toUpperCase()}</div>
            </div>
            <div class="swap-details">
                <div class="swap-detail"><span class="swap-detail-label">Base Amount:</span><span class="swap-detail-value">${swap.baseAmount}</span></div>
                <div class="swap-detail"><span class="swap-detail-label">Rel Amount:</span><span class="swap-detail-value">${swap.relAmount}</span></div>
                <div class="swap-detail"><span class="swap-detail-label">Duration:</span><span class="swap-detail-value">${swap.duration}</span></div>
                <div class="swap-detail"><span class="swap-detail-label">Completed:</span><span class="swap-detail-value">${swap.completedAt}</span></div>
            </div>
            <div class="swap-time">Started: ${swap.startedAt}</div>
        `; container.appendChild(swapElement); }); }

    displayError(message: string){ const container = this.shadowRoot!.getElementById('swaps-container'); if (container) container.innerHTML = `<div class="error">Error: ${message}</div>`; }

    updateLastUpdated(){ const now = new Date(); const el = this.shadowRoot!.getElementById('last-updated'); if (el) el.textContent = `Last updated: ${now.toLocaleTimeString()}`; }

    refreshRecentSwaps(){ this.loadRecentSwaps(); }
}

customElements.define('kdf-recent-swaps-card', KDFRecentSwapsCard);
