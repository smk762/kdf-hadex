class KDFRawRPCCard extends HTMLElement {
    private _config: any = { panel_api_base: '/' };

    constructor(){
        super();
        this.attachShadow({ mode: 'open' });
    }

    static getStubConfig(){ return { type: 'custom:kdf-raw-rpc-card', title: 'KDF Raw RPC', panel_api_base: '/' }; }

    setConfig(config: any){ this._config = { ...KDFRawRPCCard.getStubConfig(), ...config }; this.render(); }

    connectedCallback(){ this.render(); }

    render(){
        this.shadowRoot!.innerHTML = `
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

        const sendBtn = this.shadowRoot!.getElementById('send-btn');
        const clearBtn = this.shadowRoot!.getElementById('clear-btn');
        if (sendBtn) sendBtn.addEventListener('click', () => this.sendRequest());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearRequest());
    }

    async sendRequest(){
        const reqEl = this.shadowRoot!.getElementById('kdf-request') as HTMLTextAreaElement | null;
        const resEl = this.shadowRoot!.getElementById('kdf-response') as HTMLTextAreaElement | null;
        if (!reqEl || !resEl) return;
        let body: any = null;
        try { body = JSON.parse(reqEl.value); } catch(e){ resEl.value = `Invalid JSON: ${(e as Error).message}`; return; }

        const url = (this._config.panel_api_base || '/') + 'api/kdf_request';
        try{
            const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const text = await resp.text();
            try{ const j = JSON.parse(text); resEl.value = JSON.stringify(j, null, 2); } catch(e){ resEl.value = text; }
        }catch(e){ resEl.value = `Request failed: ${(e as Error).message}`; }
    }

    clearRequest(){
        const req = this.shadowRoot!.getElementById('kdf-request') as HTMLTextAreaElement | null;
        const res = this.shadowRoot!.getElementById('kdf-response') as HTMLTextAreaElement | null;
        if (req) req.value = '';
        if (res) res.value = '';
    }
}

customElements.define('kdf-raw-rpc-card', KDFRawRPCCard);
