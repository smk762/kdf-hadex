// KDF Trading Panel for Home Assistant
const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class KDFPanel extends LitElement {
  static get styles() {
    return css`
      :host {
        --kdf-primary: #03a9f4;
        --kdf-secondary: #4caf50;
        --kdf-error: #f44336;
        --kdf-warning: #ff9800;
      }
      
      .kdf-panel {
        padding: 20px;
        max-width: 1200px;
        margin: 0 auto;
      }
      
      .kdf-header {
        text-align: center;
        margin-bottom: 30px;
      }
      
      .kdf-header h1 {
        color: var(--kdf-primary);
        margin-bottom: 10px;
      }
      
      .kdf-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
      }
      
      .kdf-card {
        background: var(--card-background-color);
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      
      .kdf-card h3 {
        margin-top: 0;
        color: var(--kdf-primary);
        border-bottom: 2px solid var(--kdf-primary);
        padding-bottom: 10px;
      }
      
      .status-item {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
        padding: 5px 0;
      }
      
      .status-label {
        font-weight: 500;
      }
      
      .status-value {
        color: var(--kdf-secondary);
      }
      
      .status-error {
        color: var(--kdf-error);
      }
      
      .status-warning {
        color: var(--kdf-warning);
      }
      
      .loading {
        text-align: center;
        color: var(--secondary-text-color);
        font-style: italic;
      }
      
      .refresh-btn {
        background: var(--kdf-primary);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
        margin: 10px 0;
      }
      
      .refresh-btn:hover {
        background: var(--kdf-secondary);
      }
    `;
  }

  render() {
    return html`
      <div class="kdf-panel">
        <div class="kdf-header">
          <h1>KDF Trading Dashboard</h1>
          <p>Komodo DeFi Framework Integration</p>
          <button class="refresh-btn" @click=${this.refreshData}>Refresh Data</button>
          <div id="exchange-indicator" style="margin-top:8px;font-size:0.9rem"></div>
        </div>
        
        <div class="kdf-cards">
          <div class="kdf-card">
            <h3>Connection Status</h3>
            <div class="status-item">
              <span class="status-label">Status:</span>
              <span class="status-value" id="connection-status">Loading...</span>
            </div>
            <div class="status-item">
              <span class="status-label">Version:</span>
              <span class="status-value" id="kdf-version">Loading...</span>
            </div>
            <div class="status-item">
              <span class="status-label">Total Value:</span>
              <span class="status-value" id="total-fiat">Loading...</span>
            </div>
            <div class="status-item">
              <span class="status-label">Peer Count:</span>
              <span class="status-value" id="peer-count">Loading...</span>
            </div>
            <div class="status-item">
              <span class="status-label">Enabled Coins:</span>
              <span class="status-value" id="enabled-coins">Loading...</span>
            </div>
          </div>
          
          <div class="kdf-card">
            <h3>Trading Data</h3>
            <div class="status-item">
              <span class="status-label">Active Swaps:</span>
              <span class="status-value" id="active-swaps">Loading...</span>
            </div>
            <div class="status-item">
              <span class="status-label">My Orders:</span>
              <span class="status-value" id="my-orders">Loading...</span>
            </div>
            <div class="status-item">
              <span class="status-label">Recent Swaps:</span>
              <span class="status-value" id="recent-swaps">Loading...</span>
            </div>
          </div>
          
          <div class="kdf-card">
            <h3>Information</h3>
            <p>This dashboard shows real-time data from the Komodo DeFi Framework (KDF) running in your Home Assistant add-on.</p>
            <p>Data is collected every 30 seconds and displayed here for monitoring your trading activity.</p>
            <p><strong>Note:</strong> This is a demo panel. In a full implementation, this would connect to Home Assistant's REST API to show real KDF data.</p>
          </div>
        </div>
      </div>
    `;
  }

  firstUpdated() {
    this.refreshData();
    // Auto-refresh every 30 seconds
    setInterval(() => this.refreshData(), 30000);

    // Fetch coins_config to expose to other panels
    (async () => {
      try {
        const r = await fetch('./api/coins_config');
        if (r.ok) {
          const j = await r.json();
          window.COINS_CONFIG = j.coins_config || {};
          window.SUPPORTED_COINS = j.supported_coins || Object.keys(window.COINS_CONFIG || {});
        } else {
          window.COINS_CONFIG = {};
          window.SUPPORTED_COINS = [];
        }
      } catch (e) {
        window.COINS_CONFIG = {};
        window.SUPPORTED_COINS = [];
      }
    })();

    // Listen for options changes and refresh when saved from settings
    window.addEventListener('storage', (e) => {
      if (e.key === 'kdf.options.updated') {
        this.refreshData();
      }
    });
  }

  async refreshData() {
    console.log('Refreshing KDF data...');
    
    try {
      // Fetch status data from the panel server API
      const statusResponse = await fetch('./api/status');
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        
        // Update connection status
        const statusElement = this.shadowRoot.getElementById('connection-status');
        if (statusElement) {
          statusElement.textContent = statusData.status;
          statusElement.className = `status-value ${statusData.status === 'connected' ? 'success' : 'error'}`;
        }
        
        // Update version
        const versionElement = this.shadowRoot.getElementById('kdf-version');
        if (versionElement) {
          versionElement.textContent = statusData.version;
        }
        
        // Update peer count
        const peerElement = this.shadowRoot.getElementById('peer-count');
        if (peerElement) {
          peerElement.textContent = `${statusData.peer_count} peers`;
        }
        
        // Update enabled coins
        const coinsElement = this.shadowRoot.getElementById('enabled-coins');
        if (coinsElement) {
          coinsElement.textContent = statusData.enabled_coins.length > 0 
            ? statusData.enabled_coins.join(', ') 
            : 'None';
        }
      }

      
      // Fetch activation and price data to compute total fiat value
      try {
        const [actResp, priceResp] = await Promise.all([
          fetch('./api/activation_status'),
          fetch('./api/coingecko_prices')
        ]);
        let totalValue = 0;
        let fiat = '';
        if (actResp.ok && priceResp.ok) {
          const actJson = await actResp.json();
          const priceJson = await priceResp.json();
          const act = actJson.activation || {};
          const prices = (priceJson.prices) || {};
          fiat = priceJson.fiat || '';

          Object.keys(act).forEach(t => {
            try {
              const total = act[t].total_balance || {};
              Object.keys(total).forEach(cur => {
                const amt = parseFloat(total[cur]);
                if (!isNaN(amt) && amt !== 0) {
                  const p = prices[cur] && prices[cur].price ? parseFloat(prices[cur].price) : null;
                  if (p !== null && !isNaN(p)) {
                    totalValue += amt * p;
                  }
                }
              });
            } catch (e) {
              // skip
            }
          });
        }
        const totalElem = this.shadowRoot.getElementById('total-fiat');
        if (totalElem) {
          if (isFinite(totalValue) && totalValue !== 0) {
            const displayFiat = fiat ? fiat.toUpperCase() : '';
            totalElem.textContent = `${displayFiat} ${totalValue.toFixed(2)}`;
          } else {
            totalElem.textContent = 'N/A';
          }
        }
      } catch (e) {
        const totalElem = this.shadowRoot.getElementById('total-fiat');
        if (totalElem) totalElem.textContent = 'N/A';
      }

      // Fetch trading data using a single batch to reduce round-trips
      try {
        const batch = [
          { method: 'active_swaps' },
          { method: 'my_orders' },
          { method: 'my_recent_swaps' }
        ];
        const batchResp = await fetch('./api/kdf_request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch) });
        if (batchResp.ok) {
          const arr = await batchResp.json();
          // arr should be an array with results in order
          const activeData = Array.isArray(arr) ? arr[0] : arr;
          const myData = Array.isArray(arr) ? arr[1] : arr;
          const recentData = Array.isArray(arr) ? arr[2] : arr;

          const activeSwapsElement = this.shadowRoot.getElementById('active-swaps');
          if (activeSwapsElement) {
            const aRes = activeData && activeData.result ? activeData.result : activeData;
            const count = Array.isArray(aRes && aRes.uuids ? aRes.uuids : aRes) ? (aRes.uuids ? aRes.uuids.length : (Array.isArray(aRes) ? aRes.length : 0)) : 0;
            activeSwapsElement.textContent = count;
          }

          const myOrdersElement = this.shadowRoot.getElementById('my-orders');
          if (myOrdersElement) {
            const mRes = myData && myData.result ? myData.result : myData;
            let count = 0;
            if (mRes && typeof mRes === 'object') {
              const maker = mRes.maker_orders || {};
              const taker = mRes.taker_orders || {};
              const makerCount = Array.isArray(maker) ? maker.length : Object.values(maker).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
              const takerCount = Array.isArray(taker) ? taker.length : Object.values(taker).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
              count = makerCount + takerCount;
            }
            myOrdersElement.textContent = count;
          }

          const recentSwapsElement = this.shadowRoot.getElementById('recent-swaps');
          if (recentSwapsElement) {
            const rRes = recentData && recentData.result ? recentData.result : recentData;
            const swaps = (rRes && rRes.swaps) ? rRes.swaps : (Array.isArray(rRes) ? rRes : []);
            recentSwapsElement.textContent = Array.isArray(swaps) ? swaps.length : 0;
          }
        }
      } catch (e) {
        // ignore trading data errors
      }
      
    } catch (error) {
      console.error('Error refreshing KDF data:', error);
      
      // Set error state for connection status
      const statusElement = this.shadowRoot.getElementById('connection-status');
      if (statusElement) {
        statusElement.textContent = 'Error';
        statusElement.className = 'status-value error';
      }
    }
  }
}

customElements.define('kdf-panel', KDFPanel);