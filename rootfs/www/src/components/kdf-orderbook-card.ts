import { formatSig, round6, extractDecimal } from '../lib/utils';

class KDFOrderbookCard extends HTMLElement {
    private _config: any = {};
    private _orderbookData: any = null;
    private _currentCoin: string = 'BTC';
    private _refreshTimer: any = null;
    private bidsTable: any = null;
    private asksTable: any = null;
    private _orderbookRaw: any = null;

    constructor(){
        super();
        this.attachShadow({ mode: 'open' });
    }

    static getConfigElement(){
        return document.createElement('kdf-orderbook-card-editor');
    }

    static getStubConfig(){
        return {
            type: 'custom:kdf-orderbook-card',
            title: 'KDF Orderbook',
            coin: 'BTC',
            base_currency: 'AUD',
            show_spread: true,
            max_orders: 10,
            refresh_interval: 30,
            panel_api_base: '/',
        };
    }

    setConfig(config: any){
        this._config = { ...KDFOrderbookCard.getStubConfig(), ...config };
        this._currentCoin = this._config.coin;
        this.render();
        this.loadOrderbook();
        if (this._refreshTimer) clearInterval(this._refreshTimer);
        if (this._config.refresh_interval > 0) {
            this._refreshTimer = setInterval(() => this.loadOrderbook(), this._config.refresh_interval * 1000);
        }
    }

    render(){
        this.shadowRoot!.innerHTML = `
            <style>
                :host { display:block; font-family: var(--primary-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); }
                .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
                .title { font-weight:700; }
                .coin-selector { margin-bottom:8px; }
                .coin-btn { margin-right:6px; padding:6px 8px; border-radius:6px; border:1px solid #333; background:var(--card-background-color,#111); color:var(--primary-text-color,#fff); cursor:pointer }
                .coin-btn.active { background:var(--primary-color,#00d4aa); color:#000 }
                .orderbook-container { display:flex; gap:12px; }
                .orderbook-section { flex:1; }
                .orderbook-header { display:flex; justify-content:space-between; align-items:center; }
                .orderbook-table { width:100%; border-collapse:collapse; }
                .orderbook-table td, .orderbook-table th { padding:6px; }
                .last-updated{ margin-top:8px; font-size:0.9rem; color:var(--secondary-text-color,#666) }
                .loading{ color:var(--secondary-text-color,#888) }
                .error{ color:#ff6666 }
            </style>

            <div class="header">
                <div class="title">${this._config.title || 'KDF Orderbook'}</div>
            </div>

            <div class="coin-selector">
                <button class="coin-btn" data-coin="USD">USD</button>
                <button class="coin-btn" data-coin="LTC">LTC</button>
                <button class="coin-btn" data-coin="BNB">BNB</button>
                <button class="coin-btn active" data-coin="BTC">BTC</button>
                <button class="coin-btn" data-coin="ETH">ETH</button>
                <button class="coin-btn" data-coin="AVAX">AVAX</button>
                <button class="coin-btn" data-coin="ATOM">ATOM</button>
                <button class="coin-btn" data-coin="MATIC">MATIC</button>
                <button class="coin-btn" data-coin="KMD">KMD</button>
                <button class="coin-btn" data-coin="DOGE">DOGE</button>
                <button class="coin-btn" data-coin="DGB">DGB</button>
            </div>

            ${this._config.show_spread ? `<div class="spread"><div class="spread-value" id="spread">--</div><div class="spread-label">Spread</div></div>` : ''}

            <div class="orderbook-container">
                <div class="orderbook-section">
                    <div class="orderbook-header">
                        <div class="orderbook-title bids">Bids (Buy)</div>
                        <div>
                            <button class="refresh-btn" id="refresh-bids">↻</button>
                            <button class="raw-btn" id="raw-bids">Raw</button>
                        </div>
                    </div>
                    <table class="orderbook-table"><thead><tr><th>Price (${this._config.base_currency})</th><th>Volume</th><th>Total</th></tr></thead><tbody id="bids-table"><tr><td colspan="3" class="loading">Loading...</td></tr></tbody></table>
                </div>

                <div class="orderbook-section">
                    <div class="orderbook-header">
                        <div class="orderbook-title asks">Asks (Sell)</div>
                    </div>
                    <table class="orderbook-table"><thead><tr><th>Price (${this._config.base_currency})</th><th>Volume</th><th>Total</th></tr></thead><tbody id="asks-table"><tr><td colspan="3" class="loading">Loading...</td></tr></tbody></table>
                </div>
            </div>

            <div class="last-updated" id="last-updated">Last updated: Never</div>
        `;

        // attach listeners
        const coinButtons = Array.from(this.shadowRoot!.querySelectorAll('.coin-btn')) as HTMLButtonElement[];
        coinButtons.forEach(btn => btn.addEventListener('click', (e)=>{ const b = e.currentTarget as HTMLButtonElement; coinButtons.forEach(x=>x.classList.remove('active')); b.classList.add('active'); this._currentCoin = b.dataset.coin || this._currentCoin; this.loadOrderbook(); }));
        const refreshBtn = this.shadowRoot!.getElementById('refresh-bids');
        if (refreshBtn) refreshBtn.addEventListener('click', ()=> this.refreshOrderbook());
        const rawBtn = this.shadowRoot!.getElementById('raw-bids');
        if (rawBtn) rawBtn.addEventListener('click', ()=> { this.showRawPayload(this._orderbookRaw); });

        // init Tabulator if available
        (async ()=>{
            try{
                // @ts-ignore
                const Tabulator = (window as any).TabulatorReady || await import('/local/kdf-hadex/vendor/tabulator/tabulator-loader.js').then((m:any)=>m.TabulatorReady);
                this.initOrderbookTabulator(Tabulator);
            }catch(e){ /* ignore Tabulator init errors */ }
        })();
    }

    async loadOrderbook(){
        try{
            const url = (this._config.panel_api_base || '') + '/api/orderbook_transformed?base=' + encodeURIComponent(this._currentCoin) + '&rel=' + encodeURIComponent(this._config.base_currency);
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            this.displayOrderbook({ bids: data.bids || [], asks: data.asks || [], spread: data.spread });
            this.updateLastUpdated();
        }catch(err){
            console.error('Orderbook fetch failed:', err);
            this.displayError(String(err));
        }
    }

    updateLastUpdated(){
        const now = new Date();
        const el = this.shadowRoot!.getElementById('last-updated');
        if (el) el.textContent = `Last updated: ${now.toLocaleTimeString()}`;
    }

    displayOrderbook(data: any){
        this._orderbookData = data;
        // update spread
        if (this._config.show_spread){
            const spreadEl = this.shadowRoot!.getElementById('spread');
            if (spreadEl) spreadEl.textContent = data.spread;
        }

        // Bids
        if (this.bidsTable && this.bidsTable.setData){
            this.bidsTable.setData(data.bids);
        } else {
            const bidsTable = this.shadowRoot!.getElementById('bids-table');
            if (!bidsTable) return;
            bidsTable.innerHTML = '';
            data.bids.forEach((bid: any) => {
                const row = document.createElement('tr');
                row.innerHTML = `<td>${bid.price}</td><td>${bid.volume}</td><td>${bid.total}</td>`;
                bidsTable.appendChild(row);
            });
        }

        // Asks
        if (this.asksTable && this.asksTable.setData){
            this.asksTable.setData(data.asks);
        } else {
            const asksTable = this.shadowRoot!.getElementById('asks-table');
            if (!asksTable) return;
            asksTable.innerHTML = '';
            data.asks.forEach((ask: any) => {
                const row = document.createElement('tr');
                row.innerHTML = `<td>${ask.price}</td><td>${ask.volume}</td><td>${ask.total}</td>`;
                asksTable.appendChild(row);
            });
        }
    }

    initOrderbookTabulator(Tabulator: any){
        const bidsEl = this.shadowRoot!.getElementById('bids-table');
        if (bidsEl){
            this.bidsTable = new Tabulator(bidsEl, {
                layout: 'fitColumns',
                placeholder: 'No bids',
                columns: [
                    { title: `Price (${this._config.base_currency})`, field: 'price', hozAlign: 'right' },
                    { title: 'Volume', field: 'volume', hozAlign: 'right' },
                    { title: 'Total', field: 'total', hozAlign: 'right' }
                ]
            });
        }
        const asksEl = this.shadowRoot!.getElementById('asks-table');
        if (asksEl){
            this.asksTable = new Tabulator(asksEl, {
                layout: 'fitColumns',
                placeholder: 'No asks',
                columns: [
                    { title: `Price (${this._config.base_currency})`, field: 'price', hozAlign: 'right' },
                    { title: 'Volume', field: 'volume', hozAlign: 'right' },
                    { title: 'Total', field: 'total', hozAlign: 'right' }
                ]
            });
        }
    }

    displayError(message: string){
        const bidsTable = this.shadowRoot!.getElementById('bids-table');
        const asksTable = this.shadowRoot!.getElementById('asks-table');
        if (bidsTable) bidsTable.innerHTML = `<tr><td colspan="3" class="error">Error: ${message}</td></tr>`;
        if (asksTable) asksTable.innerHTML = `<tr><td colspan="3" class="error">Error: ${message}</td></tr>`;
        const spreadEl = this.shadowRoot!.getElementById('spread');
        if (spreadEl) spreadEl.textContent = '--';
    }

    refreshOrderbook(){ this.loadOrderbook(); }

    showRawPayload(payload: any){
        const modal = document.createElement('div');
        modal.style = `position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;`;
        const box = document.createElement('div');
        box.style = `background:#111;color:#eee;padding:16px;border-radius:8px;max-width:90%;max-height:90%;overflow:auto;font-family:monospace;`;
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(payload, null, 2);
        const btn = document.createElement('button');
        btn.textContent = 'Close';
        btn.style = 'display:block;margin-top:8px;';
        btn.addEventListener('click', () => modal.remove());
        box.appendChild(pre);
        box.appendChild(btn);
        modal.appendChild(box);
        document.body.appendChild(modal);
    }
}

customElements.define('kdf-orderbook-card', KDFOrderbookCard);

// Auto-mount when used as a standalone page
(function(){
    try {
        if (typeof window !== 'undefined' && window.document) {
            if (!window.document.querySelector('kdf-orderbook-card')) {
                const el = window.document.createElement('kdf-orderbook-card');
                try { if (typeof (el as any).setConfig === 'function') (el as any).setConfig((KDFOrderbookCard as any).getStubConfig()); } catch(e) { /* ignore */ }
                window.document.body.appendChild(el);
            }
        }
    } catch (e) { /* ignore */ }
})();
