class KDFOrderbookCardEditor extends HTMLElement {
    private _config: any = {};

    constructor(){
        super();
        this.attachShadow({ mode: 'open' });
    }

    setConfig(config: any){ this._config = config || {}; this.render(); }

    connectedCallback(){ this.render(); }

    render(){
        this.shadowRoot!.innerHTML = `
            <style>
                .card-config { padding: 16px; font-family: var(--primary-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); }
                .config-section { margin-bottom: 24px; padding: 16px; background: var(--card-background-color, #f5f5f5); border-radius: 8px; border: 1px solid var(--divider-color, #e0e0e0); }
                .config-section h3 { margin: 0 0 16px 0; color: var(--primary-text-color, #333); font-size: 1.1rem; font-weight: 600; }
                .config-row { display:flex; align-items:center; margin-bottom:12px; }
                .config-row label { min-width:150px; margin-right:12px; color:var(--primary-text-color,#333); font-weight:500; }
                .config-row input, .config-row select { flex:1; padding:8px 12px; border:1px solid var(--divider-color,#ccc); border-radius:4px; font-size:14px; background:var(--card-background-color,#fff); color:var(--primary-text-color,#333); }
            </style>

            <div class="card-config">
                <div class="config-section">
                    <h3>Basic Configuration</h3>
                    <div class="config-row">
                        <label for="title">Title:</label>
                        <input id="title" type="text" value="${this._config.title || 'KDF Orderbook'}" />
                    </div>
                    <div class="config-row">
                        <label for="coin">Default Coin:</label>
                        <select id="coin">
                            <option value="USD" ${this._config.coin==='USD' ? 'selected' : ''}>USD</option>
                            <option value="LTC" ${this._config.coin==='LTC' ? 'selected' : ''}>LTC</option>
                            <option value="BNB" ${this._config.coin==='BNB' ? 'selected' : ''}>BNB</option>
                            <option value="BTC" ${this._config.coin==='BTC' ? 'selected' : ''}>BTC</option>
                            <option value="ETH" ${this._config.coin==='ETH' ? 'selected' : ''}>ETH</option>
                            <option value="AVAX" ${this._config.coin==='AVAX' ? 'selected' : ''}>AVAX</option>
                            <option value="ATOM" ${this._config.coin==='ATOM' ? 'selected' : ''}>ATOM</option>
                            <option value="MATIC" ${this._config.coin==='MATIC' ? 'selected' : ''}>MATIC</option>
                            <option value="KMD" ${this._config.coin==='KMD' ? 'selected' : ''}>KMD</option>
                            <option value="DOGE" ${this._config.coin==='DOGE' ? 'selected' : ''}>DOGE</option>
                            <option value="DGB" ${this._config.coin==='DGB' ? 'selected' : ''}>DGB</option>
                        </select>
                    </div>
                    <div class="config-row">
                        <label for="base_currency">Base Currency:</label>
                        <input id="base_currency" type="text" value="${this._config.base_currency || 'AUD'}" />
                    </div>
                </div>

                <div class="config-section">
                    <h3>Display Options</h3>
                    <div class="config-row">
                        <label for="show_spread">Show Spread:</label>
                        <input id="show_spread" type="checkbox" ${this._config.show_spread!==false ? 'checked' : ''} />
                    </div>
                    <div class="config-row">
                        <label for="max_orders">Max Orders:</label>
                        <input id="max_orders" type="number" value="${this._config.max_orders || 10}" min="1" max="50" />
                    </div>
                    <div class="config-row">
                        <label for="refresh_interval">Refresh Interval (seconds):</label>
                        <input id="refresh_interval" type="number" value="${this._config.refresh_interval || 30}" min="5" max="300" />
                    </div>
                </div>

                <div class="config-section">
                    <h3>Panel Server Configuration</h3>
                    <div class="config-row">
                        <label for="panel_api_base">Panel API base path:</label>
                        <input id="panel_api_base" type="text" value="${this._config.panel_api_base || '/'}" />
                    </div>
                    <div style="font-size:0.9rem;color:#666;margin-top:8px;">Note: The panel server handles RPC authentication via the add-on configuration; do not embed RPC passwords in card config.</div>
                </div>
            </div>
        `;

        // wire inputs
        this.shadowRoot!.querySelectorAll('input, select').forEach((el: Element) => {
            el.addEventListener('change', () => this.updateConfig());
            el.addEventListener('input', () => this.updateConfig());
        });
    }

    updateConfig(){
        const newConfig: any = {
            type: 'custom:kdf-orderbook-card',
            title: (this.shadowRoot!.querySelector('#title') as HTMLInputElement).value,
            coin: (this.shadowRoot!.querySelector('#coin') as HTMLSelectElement).value,
            base_currency: (this.shadowRoot!.querySelector('#base_currency') as HTMLInputElement).value,
            show_spread: (this.shadowRoot!.querySelector('#show_spread') as HTMLInputElement).checked,
            max_orders: parseInt((this.shadowRoot!.querySelector('#max_orders') as HTMLInputElement).value),
            refresh_interval: parseInt((this.shadowRoot!.querySelector('#refresh_interval') as HTMLInputElement).value),
            panel_api_base: (this.shadowRoot!.querySelector('#panel_api_base') as HTMLInputElement).value
        };
        this.configChanged(newConfig);
    }

    configChanged(newConfig: any){
        this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: newConfig }, bubbles: true }));
    }
}

customElements.define('kdf-orderbook-card-editor', KDFOrderbookCardEditor);
