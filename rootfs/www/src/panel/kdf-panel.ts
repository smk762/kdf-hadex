import '../lib/utils';
import { RealtimeClient } from '../lib/realtime';
import { LitElement, html } from 'lit';
import kdfStyles from '../styles/kdf-styles.js';

class KDFPanel extends LitElement {
  static styles = kdfStyles;

  private realtime: RealtimeClient | null = null;

  static getStubConfig() { return {}; }

  render(){
    this.shadowRoot!.innerHTML = `
      <div class="kdf-panel">
        <div class="kdf-header">
          <h1>KDF Trading Dashboard</h1>
          <p>Komodo DeFi Framework Integration</p>
          <button class="refresh-btn">Refresh Data</button>
          <span id="next-update" style="margin-left:12px;font-size:0.9rem">Next update: --s</span>
          <div id="exchange-indicator" style="margin-top:8px;font-size:0.9rem"></div>
        </div>
        <div class="kdf-cards">
          <div class="kdf-card">
            <h3>Connection Status</h3>
            <div class="status-item"><span class="status-label">Status:</span><span class="status-value" id="connection-status">Loading...</span></div>
            <div class="status-item"><span class="status-label">Version:</span><span class="status-value" id="kdf-version">Loading...</span></div>
            <div class="status-item"><span class="status-label">Total Value:</span><span class="status-value" id="total-fiat">Loading...</span></div>
            <div class="status-item"><span class="status-label">Peer Count:</span><span class="status-value" id="peer-count">Loading...</span></div>
            <div class="status-item"><span class="status-label">Enabled Coins:</span><span class="status-value" id="enabled-coins">Loading...</span></div>
          </div>

          <div class="kdf-card">
            <h3>Trading Data</h3>
            <div class="status-item"><span class="status-label">Active Swaps:</span><span class="status-value" id="active-swaps">Loading...</span></div>
            <div class="status-item"><span class="status-label">My Orders:</span><span class="status-value" id="my-orders">Loading...</span></div>
            <div class="status-item"><span class="status-label">Recent Swaps:</span><span class="status-value" id="recent-swaps">Loading...</span></div>
          </div>

          <div class="kdf-card">
            <h3>Information</h3>
            <p>This dashboard shows real-time data from the Komodo DeFi Framework (KDF) running in your Home Assistant add-on.</p>
            <div style="margin-top:8px">
              <a href="/hassio/addon/local_kdf-hadex/logs" target="_blank" rel="noreferrer">View Add-on Logs</a> ·
              <a href="/hassio/addon/local_kdf-hadex/config" target="_blank" rel="noreferrer">Edit Add-on Config</a>
            </div>
          </div>
        </div>
        <div id="dynamic-cards" style="margin-top:16px"></div>
      </div>
    `;
    const btn = this.shadowRoot!.querySelector('.refresh-btn') as HTMLButtonElement | null;
    if (btn) btn.addEventListener('click', () => this.refreshData());
  }

  private _autoRefreshInterval: number = 30;
  private _countdown: number = 0;
  private _countdownTimer: any = null;

  async firstUpdated(){
    // Start realtime client (will fallback to polling if necessary)
    this.realtime = new RealtimeClient('');
    this.realtime.subscribe('status', (payload)=>{
      try{
        const statusData = payload && (payload.result || payload) || payload;
        const statusElement = this.shadowRoot!.getElementById('connection-status');
        if (statusElement) { statusElement.textContent = statusData.status || (statusData.result && statusData.result.status) || 'unknown'; statusElement.className = `status-value ${statusData.status === 'connected' ? 'success' : 'error'}`; }
        const versionElement = this.shadowRoot!.getElementById('kdf-version'); if (versionElement) versionElement.textContent = statusData.version || (statusData.result && statusData.result.version) || '';
        const peerElement = this.shadowRoot!.getElementById('peer-count'); if (peerElement) peerElement.textContent = (statusData.peer_count !== undefined ? String(statusData.peer_count) + ' peers' : '');
      }catch(e){}
    });

    this.realtime.subscribe('active_swaps', (payload)=>{
      try{
        const aRes = payload && (payload.result || payload) || payload;
        const activeSwapsElement = this.shadowRoot!.getElementById('active-swaps');
        const count = Array.isArray(aRes && aRes.uuids ? aRes.uuids : aRes) ? (aRes.uuids ? aRes.uuids.length : (Array.isArray(aRes) ? aRes.length : 0)) : 0;
        if (activeSwapsElement) activeSwapsElement.textContent = String(count);
      }catch(e){}
    });

    this.realtime.subscribe('my_orders', (payload)=>{
      try{
        const mRes = payload && (payload.result || payload) || payload;
        const myOrdersElement = this.shadowRoot!.getElementById('my-orders');
        let count = 0;
        if (mRes && typeof mRes === 'object') {
          const maker = mRes.maker_orders || {};
          const taker = mRes.taker_orders || {};
          const makerCount = Array.isArray(maker) ? maker.length : (Object.values(maker) as any[]).reduce((s:number, v:any) => s + (Array.isArray(v) ? v.length : 0), 0);
          const takerCount = Array.isArray(taker) ? taker.length : (Object.values(taker) as any[]).reduce((s:number, v:any) => s + (Array.isArray(v) ? v.length : 0), 0);
          count = makerCount + takerCount;
        }
        if (myOrdersElement) myOrdersElement.textContent = String(count);
      }catch(e){}
    });

    this.realtime.subscribe('my_recent_swaps', (payload)=>{
      try{
        const rRes = payload && (payload.result || payload) || payload;
        const swaps = (rRes && rRes.swaps) ? rRes.swaps : (Array.isArray(rRes) ? rRes : []);
        const recentSwapsElement = this.shadowRoot!.getElementById('recent-swaps');
        if (recentSwapsElement) recentSwapsElement.textContent = String(Array.isArray(swaps) ? swaps.length : 0);
      }catch(e){}
    });

    await this.realtime.start().catch(()=>{});
    // Ensure initial data is loaded even if realtime push hasn't arrived yet
    try{ this.refreshData(); }catch(e){}

    // Start auto-refresh countdown
    try{
      // determine ingress-aware base for cards and polling
      let computedBase = '';
      try{ const p = (window.location && window.location.pathname) ? window.location.pathname : ''; const m = p.match(/^(.*\/api\/hassio_ingress\/[^\/]+)\/?/); if(m && m[1]) computedBase = m[1]; }catch(_e){}

      // initialize countdown
      this._countdown = this._autoRefreshInterval;
      const nextElem = this.shadowRoot!.getElementById('next-update');
      if(nextElem) nextElem.textContent = `Next update: ${this._countdown}s`;
      this._countdownTimer = setInterval(()=>{
        try{
          this._countdown -= 1;
          if(this._countdown <= 0){
            this.refreshData();
            this._countdown = this._autoRefreshInterval;
          }
          const ne = this.shadowRoot!.getElementById('next-update'); if(ne) ne.textContent = `Next update: ${this._countdown}s`;
        }catch(e){}
      }, 1000);

      // Dynamically instantiate all cards for testing and pass panel_api_base
      try{
        const cardTags = ['kdf-active-swaps-card','kdf-best-orders-card','kdf-my-orders-card','kdf-orderbook-card','kdf-peers-card','kdf-recent-swaps-card','kdf-trading-actions-card','kdf-raw-rpc-card','coins-config-editor','kdf-orderbook-card-editor'];
        const container = this.shadowRoot!.getElementById('dynamic-cards');
        if(container){
          for(const tag of cardTags){
            try{
              if(typeof customElements !== 'undefined' && customElements.get(tag)){
                const el: any = document.createElement(tag);
                // if element exposes setConfig, configure ingress-aware base
                const cfg = { panel_api_base: (computedBase || '/') };
                try{ if(typeof el.setConfig === 'function') el.setConfig(cfg); else el.setAttribute && el.setAttribute('panel_api_base', cfg.panel_api_base); }catch(e){}
                container.appendChild(el);
              } else {
                // show a visible placeholder when the custom element isn't defined
                const ph = document.createElement('div');
                ph.className = 'card-missing';
                ph.style = 'padding:8px;margin:6px 0;border:1px dashed var(--divider-color);background:var(--secondary-background-color);color:var(--primary-text-color);border-radius:6px;font-size:0.9rem;';
                ph.textContent = `Card ${tag} not loaded: custom element not defined`;
                container.appendChild(ph);
              }
            }catch(e){
              const ph = document.createElement('div');
              ph.className = 'card-error';
              ph.style = 'padding:8px;margin:6px 0;border:1px dashed var(--divider-color);background:var(--secondary-background-color);color:#ff8888;border-radius:6px;font-size:0.9rem;';
              ph.textContent = `Card ${tag} failed to create: ${String((e as any) || '')}`;
              container.appendChild(ph);
              continue;
            }
          }
        }
      }catch(e){}
    }catch(e){}

    // Load coins_config once
    (async ()=>{
      try{
        const r = await fetch('./api/coins_config');
        if (r.ok){ const j = await r.json(); (window as any).COINS_CONFIG = j.coins_config || {}; (window as any).SUPPORTED_COINS = j.supported_coins || Object.keys((window as any).COINS_CONFIG || {}); }
        else { (window as any).COINS_CONFIG = {}; (window as any).SUPPORTED_COINS = []; }
      }catch(e){ (window as any).COINS_CONFIG = {}; (window as any).SUPPORTED_COINS = []; }
    })();

    window.addEventListener('storage', (e:any)=>{ if (e.key === 'kdf.options.updated') this.refreshData(); });
  }

  disconnectedCallback(): void {
    try{ if (this.realtime) { this.realtime.stop(); this.realtime = null; } }catch(e){}
  }

  async refreshData(){
    try{
      const statusResponse = await fetch('./api/status');
      if (statusResponse.ok){ const statusData = await statusResponse.json(); const statusElement = this.shadowRoot!.getElementById('connection-status'); if (statusElement) { statusElement.textContent = statusData.status; statusElement.className = `status-value ${statusData.status === 'connected' ? 'success' : 'error'}`; } const versionElement = this.shadowRoot!.getElementById('kdf-version'); if (versionElement) versionElement.textContent = statusData.version; const peerElement = this.shadowRoot!.getElementById('peer-count'); if (peerElement) peerElement.textContent = `${statusData.peer_count} peers`; const coinsElement = this.shadowRoot!.getElementById('enabled-coins'); if (coinsElement) coinsElement.textContent = statusData.enabled_coins.length > 0 ? statusData.enabled_coins.join(', ') : 'None'; }

      try{
        // Use /api/summary to get total value and fiat in one call
        const summaryResp = await fetch('./api/summary');
        if (summaryResp.ok) {
          const s = await summaryResp.json();
          const totalElem = this.shadowRoot!.getElementById('total-fiat');
          if (totalElem) {
            if (typeof s.total_value === 'number' && isFinite(s.total_value) && s.total_value !== 0) {
              totalElem.textContent = `${(s.fiat||'USD').toUpperCase()} ${s.total_value.toFixed(2)}`;
            } else {
              totalElem.textContent = 'N/A';
            }
          }
        }
      }catch(e){ const totalElem = this.shadowRoot!.getElementById('total-fiat'); if (totalElem) totalElem.textContent = 'N/A'; }

      try{
        const sresp = await fetch('./api/summary');
        if (sresp.ok) {
          const s = await sresp.json();
          const activeSwapsElement = this.shadowRoot!.getElementById('active-swaps');
          if (activeSwapsElement) activeSwapsElement.textContent = String(s.active_swaps_count || 0);
          const myOrdersElement = this.shadowRoot!.getElementById('my-orders');
          if (myOrdersElement) myOrdersElement.textContent = String(s.my_orders_count || 0);
          const recentSwapsElement = this.shadowRoot!.getElementById('recent-swaps');
          if (recentSwapsElement) recentSwapsElement.textContent = String(s.recent_swaps_count || 0);
        }
      }catch(e){ }

    }catch(error){ console.error('Error refreshing KDF data:', error); const statusElement = this.shadowRoot!.getElementById('connection-status'); if (statusElement) { statusElement.textContent = 'Error'; statusElement.className = 'status-value error'; } }
  }
}

customElements.define('kdf-panel', KDFPanel);
export default KDFPanel;
