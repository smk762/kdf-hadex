class KDFBestOrdersCardEditor extends HTMLElement {
    constructor() {
        super();
        this._config = {};
    }

    setConfig(config) {
        this._config = config || {};
    }

    configChanged(newConfig) {
        const event = new CustomEvent('config-changed', {
            detail: { config: newConfig },
            bubbles: true
        });
        this.dispatchEvent(event);
    }

    render() {
        this.innerHTML = `
            <div class="card-config">
                <div class="config-section">
                    <h3>Basic</h3>
                    <div class="config-row">
                        <label for="title">Title:</label>
                        <input type="text" id="title" value="${this._config.title || 'KDF Best Orders'}" />
                    </div>
                    <div class="config-row">
                        <label for="coin">Coin:</label>
                        <input type="text" id="coin" value="${this._config.coin || 'DGB'}" />
                    </div>
                    <div class="config-row">
                        <label for="action">Action:</label>
                        <select id="action">
                            <option value="buy" ${this._config.action === 'buy' ? 'selected' : ''}>Buy</option>
                            <option value="sell" ${this._config.action === 'sell' ? 'selected' : ''}>Sell</option>
                        </select>
                    </div>
                    <div class="config-row">
                        <label for="max_orders">Max Orders:</label>
                        <input type="number" id="max_orders" value="${this._config.max_orders || 10}" min="1" max="100" />
                    </div>
                    <div class="config-row">
                        <label for="refresh_interval">Refresh Interval (s):</label>
                        <input type="number" id="refresh_interval" value="${this._config.refresh_interval || 30}" min="5" max="3600" />
                    </div>
                </div>

                <div class="config-section">
                    <h3>Panel</h3>
                    <div class="config-row">
                        <label for="panel_api_base">Panel API base:</label>
                        <input type="text" id="panel_api_base" value="${this._config.panel_api_base || '/'}" />
                    </div>
                    <div style="font-size:0.9rem;color:#666;margin-top:8px;">The panel server performs authenticated RPC calls; do not store RPC passwords in card config.</div>
                </div>
            </div>

            <style>
                .card-config { padding: 12px; font-family: var(--primary-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); }
                .config-section { margin-bottom: 12px; padding: 8px; background: var(--card-background-color, #fff); border-radius: 6px; }
                .config-row { display:flex; align-items:center; margin-bottom:8px; }
                .config-row label { min-width:130px; margin-right:8px; }
                .config-row input, .config-row select { flex:1; padding:6px 8px; }
            </style>
        `;

        this.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('change', () => this.updateConfig());
            el.addEventListener('input', () => this.updateConfig());
        });

        // Autocomplete for coin: fetch enabled coins from panel server (/api/status)
        const coinInput = this.querySelector('#coin');
        if (coinInput) {
            coinInput.setAttribute('list', 'kdf-coins-datalist');
            // Create datalist element if not present
            if (!this.querySelector('#kdf-coins-datalist')) {
                const dl = document.createElement('datalist');
                dl.id = 'kdf-coins-datalist';
                this.appendChild(dl);
            }

            const populate = (coins) => {
                const dl = this.querySelector('#kdf-coins-datalist');
                dl.innerHTML = '';
                if (!coins || !Array.isArray(coins) || coins.length === 0) {
                    // Fallback list
                    coins = ['BTC','ETH','LTC','DGB','KMD','USDT','USDC','DOGE'];
                }
                coins.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c;
                    dl.appendChild(opt);
                });
            };

            // Fetch enabled_coins using kdf_request via panel server
            const panelBase = this._config.panel_api_base || '/';
            const baseNoSlash = (panelBase.replace(/\/$/, '') || '');
            const tryKdfRequest = baseNoSlash + '/api/kdf_request';

            fetch(tryKdfRequest, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'get_enabled_coins' }) }).then(r => r.json()).then(js => {
                if (js && js.result) {
                    const arr = Array.isArray(js.result) ? js.result.map(c => (c.ticker || c.coin || c)) : [];
                    populate(arr);
                } else {
                    populate([]);
                }
            }).catch(() => populate([]));
        }
    }

    updateConfig() {
        const newConfig = {
            type: 'custom:kdf-best-orders-card',
            title: this.querySelector('#title').value,
            coin: this.querySelector('#coin').value,
            action: this.querySelector('#action').value,
            max_orders: parseInt(this.querySelector('#max_orders').value, 10) || 10,
            refresh_interval: parseInt(this.querySelector('#refresh_interval').value, 10) || 30,
            panel_api_base: this.querySelector('#panel_api_base').value || '/'
        };
        this.configChanged(newConfig);
    }

    connectedCallback() {
        this.render();
    }
}

customElements.define('kdf-best-orders-card-editor', KDFBestOrdersCardEditor);


