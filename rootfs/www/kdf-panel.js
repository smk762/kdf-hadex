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

      
      // Fetch trading data from the panel server API
      const dataResponse = await fetch('./api/data');
      if (dataResponse.ok) {
        const tradingData = await dataResponse.json();
        
        // Update active swaps
        const activeSwapsElement = this.shadowRoot.getElementById('active-swaps');
        if (activeSwapsElement) {
          activeSwapsElement.textContent = tradingData.active_swaps;
        }
        
        // Update my orders
        const myOrdersElement = this.shadowRoot.getElementById('my-orders');
        if (myOrdersElement) {
          myOrdersElement.textContent = tradingData.my_orders;
        }
        
        // Update recent swaps
        const recentSwapsElement = this.shadowRoot.getElementById('recent-swaps');
        if (recentSwapsElement) {
          recentSwapsElement.textContent = tradingData.recent_swaps;
        }
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