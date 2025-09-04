class KDFPeersCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._config = { panel_api_base: '/' };
        this._peers = [];
    }

    static getStubConfig() {
        return {
            type: 'custom:kdf-peers-card',
            title: 'KDF Peers',
            panel_api_base: '/'
        };
    }

    setConfig(config) {
        this._config = { ...KDFPeersCard.getStubConfig(), ...config };
        this.render();
        this.loadPeers();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display:block; background:var(--card-background-color,#1a1a1a); padding:12px; border-radius:8px; color:var(--primary-text-color,#fff); }
                table { width:100%; border-collapse:collapse; font-family: monospace; }
                th,td { text-align:left; padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.04); }
                th { color:var(--secondary-text-color,#aaa); font-weight:600; }
            </style>
            <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <div style="font-weight:600">Peers</div>
                    <div><button id="refresh">↻</button></div>
                </div>
                <div id="table-container"><div class="loading">Loading peers...</div></div>
            </div>
        `;
        this.shadowRoot.getElementById('refresh').addEventListener('click', () => this.loadPeers(true));
    }

    async loadPeers(force=false) {
        try {
            const url = (this._config.panel_api_base || '') + '/api/peers';
            const res = await fetch(url + (force ? '?_=' + Date.now() : ''));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const j = await res.json();
            const peers = j.peers || {};
            // Convert to array of {id, host}
            const rows = [];
            for (const [pid, domains] of Object.entries(peers)) {
                const host = (Array.isArray(domains) && domains.length>0 && domains[0]) ? domains[0] : '';
                rows.push({ id: pid, host });
            }
            rows.sort((a,b) => (a.host || '').localeCompare(b.host || ''));
            this._peers = rows;
            this.renderTable();
        } catch (e) {
            this.shadowRoot.getElementById('table-container').innerHTML = `<div class="error">Error: ${e.message}</div>`;
        }
    }

    renderTable() {
        const container = this.shadowRoot.getElementById('table-container');
        if (!this._peers || this._peers.length === 0) {
            container.innerHTML = '<div class="loading">No peers</div>';
            return;
        }
        let html = '<table><thead><tr><th>Peer ID</th><th>Host</th></tr></thead><tbody>';
        for (const r of this._peers) {
            html += `<tr><td>${r.id}</td><td>${r.host}</td></tr>`;
        }
        html += '</tbody></table>';
        container.innerHTML = html;
    }
}

customElements.define('kdf-peers-card', KDFPeersCard);

class KDFPeersCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._config = {};
        this._peers = {};
    }

    static getStubConfig() {
        return {
            type: 'custom:kdf-peers-card',
            title: 'KDF Peers',
            panel_api_base: '/',
            refresh_interval: 60
        };
    }

    setConfig(config) {
        this._config = { ...KDFPeersCard.getStubConfig(), ...config };
        this.render();
        this.loadPeers();
        if (this._config.refresh_interval > 0) {
            setInterval(() => this.loadPeers(), this._config.refresh_interval * 1000);
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host { display:block; background:var(--card-background-color,#1a1a1a); padding:12px; border-radius:8px; color:var(--primary-text-color,#fff); }
                h3 { margin:0 0 8px 0; color:var(--primary-color,#00d4aa); }
                table { width:100%; border-collapse:collapse; font-size:13px; }
                th, td { padding:6px 8px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.04); }
                .peer-id { font-family: monospace; word-break:break-all; }
            </style>
            <div>
                <h3>${this._config.title || 'KDF Peers'}</h3>
                <div id="peers-container">Loading peers...</div>
            </div>
        `;
    }

    async loadPeers() {
        try {
            const url = (this._config.panel_api_base || '') + '/api/peers';
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const j = await res.json();
            if (j && j.peers) {
                this._peers = j.peers;
                this.displayPeers();
            } else {
                this.displayError('No peers data');
            }
        } catch (e) {
            console.error('Error loading peers:', e);
            this.displayError(e.message);
        }
    }

    displayPeers() {
        const container = this.shadowRoot.getElementById('peers-container');
        const peers = this._peers || {};
        const keys = Object.keys(peers);
        if (!keys.length) {
            container.innerHTML = '<div>No peers connected</div>';
            return;
        }
        let html = '<table><thead><tr><th>Peer ID</th><th>Domain(s)</th></tr></thead><tbody>';
        keys.forEach(pid => {
            const domains = peers[pid] || [];
            const dstr = domains.join(', ');
            html += `<tr><td class="peer-id">${pid}</td><td>${dstr}</td></tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    displayError(msg) {
        const container = this.shadowRoot.getElementById('peers-container');
        container.innerHTML = `<div style="color:#ff6666">Error: ${msg}</div>`;
    }
}

customElements.define('kdf-peers-card', KDFPeersCard);


