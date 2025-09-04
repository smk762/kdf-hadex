class KDFRawRPCCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._config = { panel_api_base: '/' };
        this._lastResponse = '';
    }

    static getStubConfig() {
        return { type: 'custom:kdf-raw-rpc-card', title: 'KDF Raw RPC', panel_api_base: '/' };
    }

    setConfig(config) {
        this._config = { ...KDFRawRPCCard.getStubConfig(), ...config };
        this.render();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display:block; font-family:var(--primary-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif); }
                textarea { width:100%; height:180px; background:var(--card-background-color,#111); color:#eee; border:1px solid #333; padding:8px; box-sizing:border-box; font-family:monospace; }
                .controls { display:flex; gap:8px; margin-top:8px; }
                button { padding:8px 12px; border-radius:6px; border:none; cursor:pointer; background:#03a9f4; color:#000; font-weight:600; }
                button.secondary { background:#555; color:#fff; }
                .title { font-weight:700; margin-bottom:8px; }
            </style>
            <div class="title">${this._config.title || 'KDF Raw RPC'}</div>
            <div>
                <label for="kdf-request">Request (JSON)</label>
                <textarea id="kdf-request">{ "method": "version" }</textarea>
            </div>
            <div class="controls">
                <button id="send-btn">Send</button>
                <button id="clear-btn" class="secondary">Clear</button>
            </div>
            <div style="margin-top:12px;">
                <label for="kdf-response">Response (readonly)</label>
                <textarea id="kdf-response" readonly></textarea>
            </div>
        `;

        this.shadowRoot.getElementById('send-btn').addEventListener('click', () => this.sendRequest());
        this.shadowRoot.getElementById('clear-btn').addEventListener('click', () => this.clearRequest());
    }

    async sendRequest() {
        const reqEl = this.shadowRoot.getElementById('kdf-request');
        const resEl = this.shadowRoot.getElementById('kdf-response');
        let body = null;
        try {
            body = JSON.parse(reqEl.value);
        } catch (e) {
            resEl.value = `Invalid JSON: ${e.message}`;
            return;
        }

        const url = (this._config.panel_api_base || '/') + 'api/kdf_request';

        try {
            const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const text = await resp.text();
            try {
                const j = JSON.parse(text);
                resEl.value = JSON.stringify(j, null, 2);
            } catch (e) {
                resEl.value = text;
            }
        } catch (e) {
            resEl.value = `Request failed: ${e.message}`;
        }
    }

    clearRequest() {
        this.shadowRoot.getElementById('kdf-request').value = '';
        this.shadowRoot.getElementById('kdf-response').value = '';
    }
}

customElements.define('kdf-raw-rpc-card', KDFRawRPCCard);


