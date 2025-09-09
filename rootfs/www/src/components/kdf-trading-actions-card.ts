class KDFTradingActionsCard extends HTMLElement {
    private _config: any = {};
    private _lastActionRaw: any = null;

    constructor(){ super(); this.attachShadow({ mode: 'open' }); }

    static getConfigElement(){ return document.createElement('kdf-trading-actions-card-editor'); }

    static getStubConfig(){ return { type: 'custom:kdf-trading-actions-card', title: 'KDF Trading Actions', panel_api_base: '/' }; }

    setConfig(config: any){ this._config = { ...KDFTradingActionsCard.getStubConfig(), ...config }; this.render(); }

    connectedCallback(){ this.render(); }

    render(){
        this.shadowRoot!.innerHTML = `
            <style>
                :host { display:block; background: var(--card-background-color, #1a1a1a); border-radius:12px; padding:16px; color:var(--primary-text-color,#fff); font-family:var(--primary-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); }
                .title { font-size:1.2rem; font-weight:600; color:var(--primary-color,#00d4aa); margin-bottom:16px; }
                .actions-container { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
                .form-group { margin-bottom:12px; }
                .form-label { display:block; margin-bottom:4px; color:var(--secondary-text-color,#aaa); }
                .form-input, .form-select { width:100%; padding:8px 12px; border:1px solid var(--divider-color,#444); border-radius:4px; background:var(--card-background-color,#1a1a1a); color:var(--primary-text-color,#fff); }
                .btn { width:100%; border:none; padding:10px 16px; border-radius:6px; cursor:pointer; font-weight:600; }
                .btn-sell { background:#ff4444; color:#fff; }
                .btn-buy { background:#00ff88; color:#000; }
                .status-message { margin-top:12px; padding:8px 12px; border-radius:4px; font-size:0.9rem; text-align:center; }
            </style>
            <div class="title">${this._config.title || 'KDF Trading Actions'}</div>
            <div class="actions-container">
                <div class="action-section">
                    <div class="action-title">Sell Order</div>
                    <form id="sell-form">
                        <div class="form-group"><label class="form-label" for="sell-base">Base Currency:</label><select class="form-select" id="sell-base"> <option value="BTC">BTC</option><option value="ETH">ETH</option><option value="LTC">LTC</option><option value="BNB">BNB</option><option value="AVAX">AVAX</option><option value="ATOM">ATOM</option><option value="MATIC">MATIC</option><option value="KMD">KMD</option><option value="DOGE">DOGE</option><option value="DGB">DGB</option></select></div>
                        <div class="form-group"><label class="form-label" for="sell-rel">Quote Currency:</label><select class="form-select" id="sell-rel"><option value="AUD">AUD</option><option value="USD">USD</option><option value="BTC">BTC</option><option value="ETH">ETH</option></select></div>
                        <div class="form-group"><label class="form-label" for="sell-volume">Volume:</label><input type="number" class="form-input" id="sell-volume" step="0.00000001" min="0" required></div>
                        <div class="form-group"><label class="form-label" for="sell-price">Price:</label><input type="number" class="form-input" id="sell-price" step="0.01" min="0" required></div>
                        <button type="submit" class="btn btn-sell">Place Sell Order</button>
                    </form>
                    <div id="sell-status" class="status-message" style="display:none;"></div>
                </div>
                <div class="action-section">
                    <div class="action-title">Buy Order</div>
                    <form id="buy-form">
                        <div class="form-group"><label class="form-label" for="buy-base">Base Currency:</label><select class="form-select" id="buy-base"><option value="BTC">BTC</option><option value="ETH">ETH</option><option value="LTC">LTC</option><option value="BNB">BNB</option><option value="AVAX">AVAX</option><option value="ATOM">ATOM</option><option value="MATIC">MATIC</option><option value="KMD">KMD</option><option value="DOGE">DOGE</option><option value="DGB">DGB</option></select></div>
                        <div class="form-group"><label class="form-label" for="buy-rel">Quote Currency:</label><select class="form-select" id="buy-rel"><option value="AUD">AUD</option><option value="USD">USD</option><option value="BTC">BTC</option><option value="ETH">ETH</option></select></div>
                        <div class="form-group"><label class="form-label" for="buy-volume">Volume:</label><input type="number" class="form-input" id="buy-volume" step="0.00000001" min="0" required></div>
                        <div class="form-group"><label class="form-label" for="buy-price">Price:</label><input type="number" class="form-input" id="buy-price" step="0.01" min="0" required></div>
                        <button type="submit" class="btn btn-buy">Place Buy Order</button>
                    </form>
                    <div id="buy-status" class="status-message" style="display:none;"></div>
                </div>
            </div>
        `;
        // wire forms
        const sellForm = this.shadowRoot!.getElementById('sell-form') as HTMLFormElement | null;
        const buyForm = this.shadowRoot!.getElementById('buy-form') as HTMLFormElement | null;
        if (sellForm) sellForm.addEventListener('submit', (e)=>{ e.preventDefault(); this.placeSellOrder(); });
        if (buyForm) buyForm.addEventListener('submit', (e)=>{ e.preventDefault(); this.placeBuyOrder(); });
    }

    async placeSellOrder(){
        const base = (this.shadowRoot!.getElementById('sell-base') as HTMLSelectElement).value;
        const rel = (this.shadowRoot!.getElementById('sell-rel') as HTMLSelectElement).value;
        const volume = (this.shadowRoot!.getElementById('sell-volume') as HTMLInputElement).value;
        const price = (this.shadowRoot!.getElementById('sell-price') as HTMLInputElement).value;
        if (!base || !rel || !volume || !price){ this.showStatus('sell-status','Please fill in all fields','error'); return; }
        try{ this.showStatus('sell-status','Placing sell order...','info'); const response = await fetch((this._config.panel_api_base || '') + '/api/sell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base, rel, volume, price }) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const data = await response.json(); if (data.error){ console.error('KDF error (sell):', data.error); this.showStatus('sell-status', `Error: ${data.error}`, 'error'); return; } this._lastActionRaw = data; this.showStatus('sell-status','Sell order placed successfully!','success'); this.clearForm('sell-form'); }catch(error){ console.error('Error placing sell order:', error); this.showStatus('sell-status', `Error: ${(error as Error).message}`, 'error'); }
    }

    async placeBuyOrder(){
        const base = (this.shadowRoot!.getElementById('buy-base') as HTMLSelectElement).value;
        const rel = (this.shadowRoot!.getElementById('buy-rel') as HTMLSelectElement).value;
        const volume = (this.shadowRoot!.getElementById('buy-volume') as HTMLInputElement).value;
        const price = (this.shadowRoot!.getElementById('buy-price') as HTMLInputElement).value;
        if (!base || !rel || !volume || !price){ this.showStatus('buy-status','Please fill in all fields','error'); return; }
        try{ this.showStatus('buy-status','Placing buy order...','info'); const response = await fetch((this._config.panel_api_base || '') + '/api/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base, rel, volume, price }) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const data = await response.json(); if (data.error){ console.error('KDF error (buy):', data.error); this.showStatus('buy-status', `Error: ${data.error}`, 'error'); return; } this._lastActionRaw = data; this.showStatus('buy-status','Buy order placed successfully!','success'); this.clearForm('buy-form'); }catch(error){ console.error('Error placing buy order:', error); this.showStatus('buy-status', `Error: ${(error as Error).message}`, 'error'); }
    }

    showStatus(elementId: string, message: string, type: string){ const el = this.shadowRoot!.getElementById(elementId) as HTMLElement | null; if (!el) return; el.textContent = message; el.className = `status-message status-${type}`; el.style.display = 'block'; setTimeout(()=>{ el.style.display = 'none'; }, 5000); }

    clearForm(formId: string){ const form = this.shadowRoot!.getElementById(formId) as HTMLFormElement | null; if (form) form.reset(); }
}

customElements.define('kdf-trading-actions-card', KDFTradingActionsCard);
