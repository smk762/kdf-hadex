class KDFPeersCard extends HTMLElement {
    private _config: any = { panel_api_base: '/' };
    private _peers: any = [];

    constructor(){
        super();
        this.attachShadow({ mode: 'open' });
    }

    static getStubConfig(){
        return { type: 'custom:kdf-peers-card', title: 'KDF Peers', panel_api_base: '/' };
    }

    setConfig(config: any){
        this._config = { ...KDFPeersCard.getStubConfig(), ...config };
        this.render();
        this.loadPeers();
    }

    render(){
        this.shadowRoot!.innerHTML = `
            <style>
                :host { display:block; background:var(--card-background-color,#1a1a1a); padding:12px; border-radius:8px; color:var(--primary-text-color,#fff); }
                table { width:100%; border-collapse:collapse; font-family: monospace; }
                th,td { text-align:left; padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.04); }
                th { color:var(--secondary-text-color,#aaa); font-weight:600; }
            </style>
            <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <div style="font-weight:600">Peers</div>
                    <div><button id="refresh-btn">↻</button></div>
                </div>
                <div id="table-container"><div class="loading">Loading peers...</div></div>
            </div>
        `;
        const refreshBtn = this.shadowRoot!.getElementById('refresh-btn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadPeers(true));
    }

    async loadPeers(force=false){
        try{
            const url = (this._config.panel_api_base || '') + '/api/peers';
            const res = await fetch(url + (force ? '?_=' + Date.now() : ''));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const j = await res.json();
            const peers = j.peers || {};
            const rows: Array<any> = [];
            for (const [pid, domains] of Object.entries(peers)){
                const host = (Array.isArray(domains) && domains.length>0 && domains[0]) ? domains[0] : '';
                rows.push({ id: pid, host });
            }
            rows.sort((a,b)=> (a.host||'').localeCompare(b.host||''));
            this._peers = rows;
            this.renderTable();
        }catch(e){
            const container = this.shadowRoot!.getElementById('table-container');
            if (container) container.innerHTML = `<div class="error">Error: ${(e as Error).message}</div>`;
        }
    }

    renderTable(){
        const container = this.shadowRoot!.getElementById('table-container');
        if (!container) return;
        if (!this._peers || this._peers.length === 0){ container.innerHTML = '<div class="loading">No peers</div>'; return; }
        let html = '<table><thead><tr><th>Peer ID</th><th>Host</th></tr></thead><tbody>';
        for (const r of this._peers){ html += `<tr><td>${r.id}</td><td>${r.host}</td></tr>`; }
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    displayError(msg: string){
        const container = this.shadowRoot!.getElementById('table-container');
        if (container) container.innerHTML = `<div style="color:#ff6666">Error: ${msg}</div>`;
    }
}

customElements.define('kdf-peers-card', KDFPeersCard);
