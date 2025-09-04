class KDFOrderbookCardEditor extends HTMLElement {
    constructor() {
        super();
        this._config = {};
    }

    setConfig(config) {
        this._config = config;
    }

    configChanged(newConfig) {
        const event = new CustomEvent('config-changed', {
            detail: { config: newConfig },
            bubbles: true,
        });
        this.dispatchEvent(event);
    }

    render() {
        this.innerHTML = `
            <div class="card-config">
                <div class="config-section">
                    <h3>Basic Configuration</h3>
                    <div class="config-row">
                        <label for="title">Title:</label>
                        <input type="text" id="title" value="${this._config.title || 'KDF Orderbook'}" />
                    </div>
                    <div class="config-row">
                        <label for="coin">Default Coin:</label>
                        <select id="coin">
                            <option value="USD" ${this._config.coin === 'USD' ? 'selected' : ''}>USD</option>
                            <option value="LTC" ${this._config.coin === 'LTC' ? 'selected' : ''}>LTC</option>
                            <option value="BNB" ${this._config.coin === 'BNB' ? 'selected' : ''}>BNB</option>
                            <option value="BTC" ${this._config.coin === 'BTC' ? 'selected' : ''}>BTC</option>
                            <option value="ETH" ${this._config.coin === 'ETH' ? 'selected' : ''}>ETH</option>
                            <option value="AVAX" ${this._config.coin === 'AVAX' ? 'selected' : ''}>AVAX</option>
                            <option value="ATOM" ${this._config.coin === 'ATOM' ? 'selected' : ''}>ATOM</option>
                            <option value="MATIC" ${this._config.coin === 'MATIC' ? 'selected' : ''}>MATIC</option>
                            <option value="KMD" ${this._config.coin === 'KMD' ? 'selected' : ''}>KMD</option>
                            <option value="DOGE" ${this._config.coin === 'DOGE' ? 'selected' : ''}>DOGE</option>
                            <option value="DGB" ${this._config.coin === 'DGB' ? 'selected' : ''}>DGB</option>
                        </select>
                    </div>
                    <div class="config-row">
                        <label for="base_currency">Base Currency:</label>
                        <input type="text" id="base_currency" value="${this._config.base_currency || 'AUD'}" />
                    </div>
                </div>

                <div class="config-section">
                    <h3>Display Options</h3>
                    <div class="config-row">
                        <label for="show_spread">Show Spread:</label>
                        <input type="checkbox" id="show_spread" ${this._config.show_spread !== false ? 'checked' : ''} />
                    </div>
                    <div class="config-row">
                        <label for="max_orders">Max Orders:</label>
                        <input type="number" id="max_orders" value="${this._config.max_orders || 10}" min="1" max="50" />
                    </div>
                    <div class="config-row">
                        <label for="refresh_interval">Refresh Interval (seconds):</label>
                        <input type="number" id="refresh_interval" value="${this._config.refresh_interval || 30}" min="5" max="300" />
                    </div>
                </div>

                <div class="config-section">
                    <h3>Panel Server Configuration</h3>
                    <div class="config-row">
                        <label for="panel_api_base">Panel API base path:</label>
                        <input type="text" id="panel_api_base" value="${this._config.panel_api_base || '/'}" />
                    </div>
                    <div style="font-size:0.9rem;color:#666;margin-top:8px;">Note: The panel server handles RPC authentication via the add-on configuration; do not embed RPC passwords in card config.</div>
                </div>
            </div>

            <style>
                .card-config {
                    padding: 16px;
                    font-family: var(--primary-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
                }

                .config-section {
                    margin-bottom: 24px;
                    padding: 16px;
                    background: var(--card-background-color, #f5f5f5);
                    border-radius: 8px;
                    border: 1px solid var(--divider-color, #e0e0e0);
                }

                .config-section h3 {
                    margin: 0 0 16px 0;
                    color: var(--primary-text-color, #333);
                    font-size: 1.1rem;
                    font-weight: 600;
                }

                .config-row {
                    display: flex;
                    align-items: center;
                    margin-bottom: 12px;
                }

                .config-row label {
                    min-width: 150px;
                    margin-right: 12px;
                    color: var(--primary-text-color, #333);
                    font-weight: 500;
                }

                .config-row input,
                .config-row select {
                    flex: 1;
                    padding: 8px 12px;
                    border: 1px solid var(--divider-color, #ccc);
                    border-radius: 4px;
                    font-size: 14px;
                    background: var(--card-background-color, #fff);
                    color: var(--primary-text-color, #333);
                }

                .config-row input:focus,
                .config-row select:focus {
                    outline: none;
                    border-color: var(--primary-color, #00d4aa);
                    box-shadow: 0 0 0 2px rgba(0, 212, 170, 0.2);
                }

                .config-row input[type="checkbox"] {
                    width: auto;
                    margin-right: 8px;
                }
            </style>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const inputs = this.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener('change', () => {
                this.updateConfig();
            });
            input.addEventListener('input', () => {
                this.updateConfig();
            });
        });
    }

    updateConfig() {
        const newConfig = {
            type: 'custom:kdf-orderbook-card',
            title: this.querySelector('#title').value,
            coin: this.querySelector('#coin').value,
            base_currency: this.querySelector('#base_currency').value,
            show_spread: this.querySelector('#show_spread').checked,
            max_orders: parseInt(this.querySelector('#max_orders').value),
            refresh_interval: parseInt(this.querySelector('#refresh_interval').value),
            panel_api_base: this.querySelector('#panel_api_base').value
        };

        this.configChanged(newConfig);
    }

    connectedCallback() {
        this.render();
    }
}

customElements.define('kdf-orderbook-card-editor', KDFOrderbookCardEditor);
