import { LitElement, html } from 'lit';
import { formatSig } from '../lib/utils';
import kdfStyles from '../styles/kdf-styles.js';
// Tabulator loader is provided at runtime; declare ambient to satisfy TS
declare const TabulatorReady: any;
// ensure TypeScript recognizes LitElement base types
declare global {
    interface HTMLElementTagNameMap {
        'kdf-best-orders-card': any;
    }
}

class KDFBestOrdersCard extends LitElement {
    static properties = {
        _config: { state: true },
        _bestOrdersData: { state: true },
        _bestOrdersRaw: { state: true }
    };
    static styles = kdfStyles;

    private _config: any = {};
    private _bestOrdersData: any = null;
    private _bestOrdersRaw: any = null;
    private _refreshTimer: any = null;

    constructor(){
        super();
    }

    static getConfigElement(){
        return document.createElement('kdf-best-orders-card-editor');
    }

    static getStubConfig(){
        return {
            type: 'custom:kdf-best-orders-card',
            title: 'KDF Best Orders',
            base_currency: 'AUD',
            coin: 'DGB',
            action: 'buy',
            max_orders: 10,
            refresh_interval: 30,
            panel_api_base: '/'
        };
    }

    setConfig(config: any){
        this._config = { ...KDFBestOrdersCard.getStubConfig(), ...config };
        this.loadBestOrders();
        if (this._refreshTimer) clearInterval(this._refreshTimer);
        if (this._config.refresh_interval > 0) {
            this._refreshTimer = setInterval(() => this.loadBestOrders(), this._config.refresh_interval * 1000);
        }
    }

    render(){
        return html`
            <div class="header">
                <div class="title">${this._config.title || 'KDF Best Orders'}</div>
                <div>
                    <button class="refresh-btn" @click=${this.refreshBestOrders}>↻ Refresh</button>
                    <button class="refresh-btn" @click=${() => this.showRawPayload(this._bestOrdersRaw)}>Raw</button>
                </div>
            </div>

            <div class="orders-container">
                <div class="orders-section">
                    <div class="orders-header">
                        <div class="orders-title buy">Best Buy Orders</div>
                    </div>
                    <div id="buy-orders-table"></div>
                </div>

                <div class="orders-section">
                    <div class="orders-header">
                        <div class="orders-title sell">Best Sell Orders</div>
                    </div>
                    <div id="sell-orders-table"></div>
                </div>
            </div>

            <div class="last-updated" id="last-updated">
                Last updated: Never
            </div>
        `;
    }

    firstUpdated(){
        (async () => {
            try{
                // @ts-ignore
                const Tabulator = (window as any).TabulatorReady || await import('/local/kdf-hadex/vendor/tabulator/tabulator-loader.js').then((m:any)=>m.TabulatorReady);
                this.initTabulators(Tabulator);
            }catch(e){ console.warn('Tabulator failed to initialize:', e); }
        })();
    }

    initTabulators(Tabulator: any){
        const buyEl = (this.renderRoot as unknown as ShadowRoot).getElementById('buy-orders-table');
        if(buyEl){
            (this as any).buyTable = new Tabulator(buyEl, { layout: 'fitColumns', responsiveLayout: 'hide', placeholder: 'No data available', columns:[{title:`Price (${this._config.base_currency})`, field:'price', hozAlign:'right'},{title:'Volume', field:'volume', hozAlign:'right'},{title:'Total', field:'total', hozAlign:'right'}] });
        }
        const sellEl = (this.renderRoot as unknown as ShadowRoot).getElementById('sell-orders-table');
        if(sellEl){
            (this as any).sellTable = new Tabulator(sellEl, { layout: 'fitColumns', responsiveLayout: 'hide', placeholder: 'No data available', columns:[{title:`Price (${this._config.base_currency})`, field:'price', hozAlign:'right'},{title:'Volume', field:'volume', hozAlign:'right'},{title:'Total', field:'total', hozAlign:'right'}] });
        }
    }

    async loadBestOrders(){
        try{
            const url = (this._config.panel_api_base || '') + '/api/best_orders_transformed?coin=' + encodeURIComponent(this._config.coin || 'DGB') + '&action=' + encodeURIComponent(this._config.action || 'buy') + '&max_orders=' + encodeURIComponent(this._config.max_orders || 10);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data.raw) this._bestOrdersRaw = data.raw;
            return this.displayBestOrders({ buyOrders: data.buyOrders || [], sellOrders: data.sellOrders || [] });
        }catch(e){ console.error('KDF API Error:', e); this.displayError(String(e)); }
    }

    transformBestOrdersData(kdfData: any){
        const buyOrders: any[] = [];
        const sellOrders: any[] = [];
        let ordersMap = kdfData;
        if (kdfData && typeof kdfData === 'object' && kdfData.orders) ordersMap = kdfData.orders;
        if (ordersMap && typeof ordersMap === 'object'){
            Object.entries(ordersMap).forEach(([pair, orders]) => {
                if ((orders as any).bids) { (orders as any).bids.forEach((bid:any)=>{ const price = Number(bid.price); const vol = Number(bid.maxvolume); buyOrders.push({ pair, price: formatSig(price), volume: formatSig(vol), total: formatSig(price * vol) }); }); }
                if ((orders as any).asks) { (orders as any).asks.forEach((ask:any)=>{ const price = Number(ask.price); const vol = Number(ask.maxvolume); sellOrders.push({ pair, price: formatSig(price), volume: formatSig(vol), total: formatSig(price * vol) }); }); }
            });
        }
        return { buyOrders: buyOrders.sort((a,b)=>parseFloat((b.price as any)) - parseFloat((a.price as any))).slice(0, this._config.max_orders), sellOrders: sellOrders.sort((a,b)=>parseFloat((a.price as any)) - parseFloat((b.price as any))).slice(0, this._config.max_orders) };
    }

    displayBestOrders(data: any){
        this._bestOrdersData = data;
        if ((this as any).buyTable && (this as any).buyTable.setData) { (this as any).buyTable.setData(data.buyOrders); } else {
            const buyTable = (this.renderRoot as unknown as ShadowRoot).getElementById('buy-orders-table')!; buyTable.innerHTML = ''; data.buyOrders.forEach((order:any)=>{ const row = document.createElement('div'); row.className='tab-row'; row.innerHTML = `${order.price}\t${order.volume}\t${order.total}`; buyTable.appendChild(row); });
        }
        if ((this as any).sellTable && (this as any).sellTable.setData) { (this as any).sellTable.setData(data.sellOrders); } else {
            const sellTable = (this.renderRoot as unknown as ShadowRoot).getElementById('sell-orders-table')!; sellTable.innerHTML = ''; data.sellOrders.forEach((order:any)=>{ const row = document.createElement('div'); row.className='tab-row'; row.innerHTML = `${order.price}\t${order.volume}\t${order.total}`; sellTable.appendChild(row); });
        }
        // Note: legacy standalone `orderbook.html` removed; navigation handled by panel UI.
    }

    displayError(message: string){
        const buyTable = (this.renderRoot as unknown as ShadowRoot).getElementById('buy-orders-table'); const sellTable = (this.renderRoot as unknown as ShadowRoot).getElementById('sell-orders-table');
        if (buyTable) buyTable.innerHTML = `<tr><td colspan="3" class="error">Error: ${message}</td></tr>`;
        if (sellTable) sellTable.innerHTML = `<tr><td colspan="3" class="error">Error: ${message}</td></tr>`;
    }

    updateLastUpdated(){ const now = new Date(); const lastUpdatedElement = (this.renderRoot as unknown as ShadowRoot).getElementById('last-updated'); if (lastUpdatedElement) lastUpdatedElement.textContent = `Last updated: ${now.toLocaleTimeString()}`; }

    refreshBestOrders(){ this.loadBestOrders(); }

    showRawPayload(payload: any){ try{ const modal = document.createElement('div'); modal.style = `position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;`; const box = document.createElement('div'); box.style = `background:#111;color:#eee;padding:16px;border-radius:8px;max-width:90%;max-height:90%;overflow:auto;font-family:monospace;`; const pre = document.createElement('pre'); pre.textContent = JSON.stringify(payload, null, 2); const btn = document.createElement('button'); btn.textContent = 'Close'; btn.style = 'display:block;margin-top:8px;'; btn.addEventListener('click', ()=>modal.remove()); box.appendChild(pre); box.appendChild(btn); modal.appendChild(box); document.body.appendChild(modal); }catch(e){}}
}

customElements.define('kdf-best-orders-card', KDFBestOrdersCard);

export default KDFBestOrdersCard;
