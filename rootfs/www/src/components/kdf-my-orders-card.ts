import { formatSig } from '../lib/utils';
import { LitElement, html } from 'lit';
declare const kdfStyles: any;

class KDFMyOrdersCard extends LitElement {
    static properties = { _config: { state: true }, _myOrdersData: { state: true } };
    static styles = kdfStyles;

    private _config: any = {};
    private _myOrdersData: any = null;
    private _refreshTimer: any = null;

    constructor(){ super(); }

    static getConfigElement(){ return document.createElement('kdf-my-orders-card-editor'); }
    static getStubConfig(){ return { type: 'custom:kdf-my-orders-card', title: 'KDF My Orders', refresh_interval: 30, panel_api_base: '/' }; }

    setConfig(config: any){ this._config = { ...KDFMyOrdersCard.getStubConfig(), ...config }; this.loadMyOrders(); if (this._refreshTimer) clearInterval(this._refreshTimer); if (this._config.refresh_interval > 0) { this._refreshTimer = setInterval(() => this.loadMyOrders(), this._config.refresh_interval * 1000); } }

    render(){
        return html`
            <link rel="stylesheet" href="./kdf-styles.css">
            <div class="header">
                <div class="title">${this._config.title || 'KDF My Orders'}</div>
                <div class="header-actions">
                    <button class="btn btn-primary" @click=${this.refreshMyOrders}>↻ Refresh</button>
                    <button class="btn" @click=${() => this.showRawPayload(this._myOrdersData)}>Raw</button>
                    <button class="btn btn-danger" @click=${this.cancelAllOrders}>Cancel All</button>
                </div>
            </div>

            <div class="orders-container" id="orders-container">
                <div id="my-orders-table"></div>
            </div>

            <div class="last-updated" id="last-updated">
                Last updated: Never
            </div>
        `;
    }

    firstUpdated(){
        (async ()=>{ try{ // @ts-ignore
            const Tabulator = (window as any).TabulatorReady || TabulatorReady; this.initMyOrdersTable(Tabulator); }catch(e){ console.warn('Tabulator init failed for my orders:', e); } })();
    }

    initMyOrdersTable(Tabulator: any){
        const el = (this.renderRoot as unknown as ShadowRoot).getElementById('my-orders-table') as HTMLElement | null;
        if (!el) return;

        const columns = [
            { title: 'Pair', field: 'pair', hozAlign: 'left' },
            { title: 'Type', field: 'type', width: 80, hozAlign: 'center' },
            { title: 'Price', field: 'price', hozAlign: 'right' },
            { title: 'Volume', field: 'volume', hozAlign: 'right' },
            { title: 'Total', field: 'total', hozAlign: 'right' },
            { title: 'Created', field: 'createdAt', hozAlign: 'left' },
            { title: 'Status', field: 'status', hozAlign: 'center' },
            { title: '', field: 'actions', formatter: (cell: any) => {
                const uuid = cell.getRow().getData().uuid;
                return `<button class="btn btn-danger btn-small" data-uuid="${uuid}">Cancel</button>`;
            }, hozAlign: 'center', width: 110 }
        ];

        const self = this as any;

        self.myOrdersTable = new Tabulator(el, {
            layout: 'fitColumns',
            placeholder: 'No orders',
            columns,
            rowFormatter: (row: any) => {
                const rowEl = row.getElement();
                const btn = rowEl.querySelector('button[data-uuid]');
                if (btn && !(btn as any)._bound) {
                    btn.addEventListener('click', (e: Event) => {
                        const id = (e.currentTarget as HTMLElement).dataset.uuid;
                        try { row.getTable().component.cancelOrder(id); } catch (err) {}
                    });
                    (btn as any)._bound = true;
                }
            }
        });

        try{ self.myOrdersTable.component = self; }catch(e){}
    }

    async loadMyOrders(){
        try{
            const resp = await fetch((this._config.panel_api_base || '') + '/api/my_orders_transformed');
            if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const j = await resp.json();
            const data = j && j.orders ? j.orders : [];
            if(!data){ const msg = 'No my_orders data returned from KDF'; console.error(msg); this.displayError(msg); return; }
            // data is already transformed server-side
            this.displayMyOrders(data.map((o:any)=>({ uuid: o.uuid, pair: o.pair, type: o.type, price: o.price, volume: o.volume, total: o.total, createdAt: o.createdAt, status: o.status })));
            this.updateLastUpdated();
        }catch(error:any){ console.error('Error loading my orders:', error); this.displayError(error.message || String(error)); }
    }

    async fetchWithBackoff(url: string, opts: any = {}, cfg: any = { retries: 3, minTimeout: 300 }){
        const retries = cfg.retries || 3; const minTimeout = cfg.minTimeout || 300; let attempt = 0; while(attempt <= retries){ try{ const res = await fetch(url); if(!res.ok) throw new Error(`HTTP ${res.status}`); return await res.json(); }catch(err){ attempt += 1; if(attempt > retries) throw err; const wait = Math.min(2000, minTimeout * Math.pow(2, attempt)); await new Promise(r=>setTimeout(r, wait)); } }
    }

    showRawPayload(payload:any){ const modal = document.createElement('div'); modal.style = `position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;`; const box = document.createElement('div'); box.style = `background:#111;color:#eee;padding:16px;border-radius:8px;max-width:90%;max-height:90%;overflow:auto;font-family:monospace;`; const pre = document.createElement('pre'); pre.textContent = JSON.stringify(payload, null, 2); const btn = document.createElement('button'); btn.textContent = 'Close'; btn.style = 'display:block;margin-top:8px;'; btn.addEventListener('click', ()=>modal.remove()); box.appendChild(pre); box.appendChild(btn); modal.appendChild(box); document.body.appendChild(modal); }

    transformMyOrdersData(kdfData:any){ const orders:any[] = []; if (kdfData && Array.isArray(kdfData)) { kdfData.forEach(order=>{ const price = Number(order.price || 0); const vol = Number(order.maxvolume || 0); orders.push({ uuid: order.uuid || 'Unknown', pair: `${order.base}/${order.rel}`, type: order.type || 'unknown', price: formatSig(price), volume: formatSig(vol), total: formatSig(price * vol), createdAt: order.created_at ? new Date(order.created_at * 1000).toLocaleString() : 'Unknown', status: order.status || 'active' }); }); } return orders; }

    displayMyOrders(orders:any[]){ this._myOrdersData = orders; if((this as any).myOrdersTable && (this as any).myOrdersTable.setData){ (this as any).myOrdersTable.setData(orders); } else { const container = (this.renderRoot as unknown as ShadowRoot).getElementById('orders-container')!; if (orders.length === 0) { container.innerHTML = '<div class="no-orders">No active orders</div>'; return; } container.innerHTML = ''; orders.forEach(order=>{ const orderElement = document.createElement('div'); orderElement.className = 'order-item'; orderElement.innerHTML = `...`; container.appendChild(orderElement); }); } }

    async cancelOrder(uuid:string){ if(!confirm('Are you sure you want to cancel this order?')) return; try{ const response = await fetch((this._config.panel_api_base || '') + '/api/kdf_request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'cancel_order', params: { uuid } }) }); if(!response.ok) throw new Error(`HTTP error! status: ${response.status}`); const data = await response.json(); if(data.error) throw new Error(data.error); alert('Order cancelled successfully'); this.loadMyOrders(); }catch(error:any){ console.error('Error cancelling order:', error); alert(`Error cancelling order: ${error.message || String(error)}`); } }

    async cancelAllOrders(){ if(!confirm('Are you sure you want to cancel ALL orders? This action cannot be undone.')) return; try{ const response = await fetch((this._config.panel_api_base || '') + '/api/kdf_request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'cancel_all_orders' }) }); if(!response.ok) throw new Error(`HTTP error! status: ${response.status}`); const data = await response.json(); if(data.error) throw new Error(data.error); alert('All orders cancelled successfully'); this.loadMyOrders(); }catch(error:any){ console.error('Error cancelling all orders:', error); alert(`Error cancelling all orders: ${error.message || String(error)}`); } }

    displayError(message:string){ const container = (this.renderRoot as unknown as ShadowRoot).getElementById('orders-container')!; container.innerHTML = `<div class="error">Error: ${message}</div>`; }

    updateLastUpdated(){ const now = new Date(); const lastUpdatedElement = (this.renderRoot as unknown as ShadowRoot).getElementById('last-updated'); if (lastUpdatedElement) lastUpdatedElement.textContent = `Last updated: ${now.toLocaleTimeString()}`; }

    refreshMyOrders(){ this.loadMyOrders(); }
}

customElements.define('kdf-my-orders-card', KDFMyOrdersCard);
export default KDFMyOrdersCard;
