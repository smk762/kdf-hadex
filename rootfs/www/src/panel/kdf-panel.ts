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
          </div>
        </div>
      </div>
    `;
    const btn = this.shadowRoot!.querySelector('.refresh-btn') as HTMLButtonElement | null;
    if (btn) btn.addEventListener('click', () => this.refreshData());
  }

  firstUpdated(){
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

    this.realtime.start().catch(()=>{});

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
