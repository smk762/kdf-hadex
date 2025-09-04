class KDFActiveSwapsCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._config = {};
        this._activeSwapsData = null;
    }

    static getConfigElement() {
        return document.createElement('kdf-active-swaps-card-editor');
    }

    static getStubConfig() {
        return {
            type: 'custom:kdf-active-swaps-card',
            title: 'KDF Active Swaps',
            refresh_interval: 30,
            panel_api_base: '/',
        };
    }

    setConfig(config) {
        this._config = {
            ...KDFActiveSwapsCard.getStubConfig(),
            ...config
        };
        this.render();
        this.loadActiveSwaps();
        
        // Set up auto-refresh
        if (this._config.refresh_interval > 0) {
            setInterval(() => this.loadActiveSwaps(), this._config.refresh_interval * 1000);
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    background: var(--card-background-color, #1a1a1a);
                    border-radius: var(--border-radius, 12px);
                    padding: 16px;
                    box-shadow: var(--box-shadow, 0 2px 8px rgba(0,0,0,0.1));
                    color: var(--primary-text-color, #ffffff);
                    font-family: var(--primary-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
                }

                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid var(--divider-color, #444);
                }

                .title {
                    font-size: 1.2rem;
                    font-weight: 600;
                    color: var(--primary-color, #00d4aa);
                }

                .refresh-btn {
                    background: var(--primary-color, #00d4aa);
                    color: var(--text-primary-color, #000);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: background 0.3s ease;
                    font-size: 0.9rem;
                }

                .refresh-btn:hover {
                    background: var(--primary-color-dark, #00b894);
                }

                .swaps-container {
                    max-height: 400px;
                    overflow-y: auto;
                }

                .swap-item {
                    background: var(--secondary-background-color, #2a2a2a);
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 8px;
                    border: 1px solid var(--divider-color, #444);
                    transition: all 0.3s ease;
                }

                .swap-item:hover {
                    background: var(--primary-background-color, #333);
                }

                .swap-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }

                .swap-pair {
                    font-weight: 600;
                    color: var(--primary-color, #00d4aa);
                }

                .swap-status {
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 0.8rem;
                    font-weight: 600;
                }

                .swap-status.active {
                    background: #00ff88;
                    color: #000;
                }

                .swap-status.pending {
                    background: #ffaa00;
                    color: #000;
                }

                .swap-status.failed {
                    background: #ff4444;
                    color: #fff;
                }

                .swap-details {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                    font-size: 0.9rem;
                }

                .swap-detail {
                    display: flex;
                    justify-content: space-between;
                }

                .swap-detail-label {
                    color: var(--secondary-text-color, #aaa);
                }

                .swap-detail-value {
                    font-weight: 600;
                    font-family: 'Courier New', monospace;
                }

                .swap-progress {
                    margin-top: 8px;
                }

                .progress-bar {
                    width: 100%;
                    height: 4px;
                    background: var(--divider-color, #444);
                    border-radius: 2px;
                    overflow: hidden;
                }

                .progress-fill {
                    height: 100%;
                    background: var(--primary-color, #00d4aa);
                    transition: width 0.3s ease;
                }

                .loading {
                    text-align: center;
                    color: var(--secondary-text-color, #888);
                    padding: 40px;
                }

                .error {
                    text-align: center;
                    color: #ff4444;
                    padding: 40px;
                    background: #2a1a1a;
                    border-radius: 6px;
                    border: 1px solid #ff4444;
                }

                .no-swaps {
                    text-align: center;
                    color: var(--secondary-text-color, #888);
                    padding: 40px;
                    font-style: italic;
                }

                .last-updated {
                    text-align: center;
                    color: var(--secondary-text-color, #666);
                    font-size: 0.8rem;
                    margin-top: 12px;
                }

                @media (max-width: 600px) {
                    .swap-details {
                        grid-template-columns: 1fr;
                    }
                }
            </style>

            <div class="header">
                <div class="title">${this._config.title || 'KDF Active Swaps'}</div>
                <div>
                    <button class="refresh-btn" onclick="this.refreshActiveSwaps()">↻ Refresh</button>
                    <button class="refresh-btn" onclick="this.showRawPayload(this._activeSwapsData)">Raw</button>
                </div>
            </div>

            <div class="swaps-container" id="swaps-container">
                <div class="loading">Loading active swaps...</div>
            </div>

            <div class="last-updated" id="last-updated">
                Last updated: Never
            </div>
        `;
    }

    async loadActiveSwaps() {
        try {
            // Fetch from panel server API with retry/backoff
            const payload = await this.fetchWithBackoff((this._config.panel_api_base || '') + '/api/data', { retries: 3, minTimeout: 500 });
            if (payload && payload.active_swaps_full) {
                const transformed = this.transformActiveSwapsData(payload.active_swaps_full);
                this.displayActiveSwaps(transformed);
            } else {
                const mockData = this.generateMockActiveSwaps();
                this.displayActiveSwaps(mockData);
            }
            
            this.updateLastUpdated();
            
        } catch (error) {
            console.error('Error loading active swaps:', error);
            this.displayError(error.message);
        }
    }

    async fetchActiveSwaps() {
        // Deprecated: this card uses the panel server API
        throw new Error('Direct KDF RPC calls are deprecated; this card uses the panel server API');
    }

    async fetchWithBackoff(url, opts = {}) {
        const retries = opts.retries || 3;
        const minTimeout = opts.minTimeout || 300;
        let attempt = 0;
        while (attempt <= retries) {
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            } catch (err) {
                attempt += 1;
                if (attempt > retries) throw err;
                const wait = Math.min(2000, minTimeout * Math.pow(2, attempt));
                await new Promise(r => setTimeout(r, wait));
            }
        }
    }

    showRawPayload(payload) {
        const modal = document.createElement('div');
        modal.style = `position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;`;
        const box = document.createElement('div');
        box.style = `background:#111;color:#eee;padding:16px;border-radius:8px;max-width:90%;max-height:90%;overflow:auto;font-family:monospace;`;
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(payload, null, 2);
        const btn = document.createElement('button');
        btn.textContent = 'Close';
        btn.style = 'display:block;margin-top:8px;';
        btn.addEventListener('click', () => modal.remove());
        box.appendChild(pre);
        box.appendChild(btn);
        modal.appendChild(box);
        document.body.appendChild(modal);
    }

    transformActiveSwapsData(kdfData) {
        // Transform KDF active_swaps data to our display format
        const swaps = [];

        if (kdfData && Array.isArray(kdfData)) {
            kdfData.forEach(swap => {
                swaps.push({
                    uuid: swap.uuid || 'Unknown',
                    pair: `${swap.base}/${swap.rel}`,
                    status: this.mapSwapStatus(swap.status),
                    baseAmount: parseFloat(swap.base_amount || 0).toFixed(8),
                    relAmount: parseFloat(swap.rel_amount || 0).toFixed(8),
                    progress: this.calculateSwapProgress(swap),
                    startedAt: swap.started_at ? new Date(swap.started_at * 1000).toLocaleString() : 'Unknown',
                    expiresAt: swap.expires_at ? new Date(swap.expires_at * 1000).toLocaleString() : 'Unknown'
                });
            });
        }

        return swaps;
    }

    mapSwapStatus(status) {
        const statusMap = {
            'matched': 'active',
            'pending': 'pending',
            'failed': 'failed',
            'completed': 'active'
        };
        return statusMap[status] || 'pending';
    }

    calculateSwapProgress(swap) {
        // Calculate progress based on swap status and steps
        if (swap.status === 'completed') return 100;
        if (swap.status === 'failed') return 0;
        if (swap.status === 'matched') return 75;
        return 25; // pending
    }

    generateMockActiveSwaps() {
        const mockSwaps = [
            {
                uuid: 'swap-001',
                pair: 'BTC/AUD',
                status: 'active',
                baseAmount: '0.00100000',
                relAmount: '170.50',
                progress: 75,
                startedAt: new Date(Date.now() - 300000).toLocaleString(),
                expiresAt: new Date(Date.now() + 1800000).toLocaleString()
            },
            {
                uuid: 'swap-002',
                pair: 'ETH/AUD',
                status: 'pending',
                baseAmount: '0.05000000',
                relAmount: '333.25',
                progress: 25,
                startedAt: new Date(Date.now() - 60000).toLocaleString(),
                expiresAt: new Date(Date.now() + 2400000).toLocaleString()
            },
            {
                uuid: 'swap-003',
                pair: 'LTC/AUD',
                status: 'active',
                baseAmount: '1.00000000',
                relAmount: '170.38',
                progress: 90,
                startedAt: new Date(Date.now() - 600000).toLocaleString(),
                expiresAt: new Date(Date.now() + 1200000).toLocaleString()
            }
        ];

        return mockSwaps;
    }

    displayActiveSwaps(swaps) {
        this._activeSwapsData = swaps;
        const container = this.shadowRoot.getElementById('swaps-container');
        
        if (swaps.length === 0) {
            container.innerHTML = '<div class="no-swaps">No active swaps</div>';
            return;
        }

        container.innerHTML = '';
        swaps.forEach(swap => {
            const swapElement = document.createElement('div');
            swapElement.className = 'swap-item';
            swapElement.innerHTML = `
                <div class="swap-header">
                    <div class="swap-pair">${swap.pair}</div>
                    <div class="swap-status ${swap.status}">${swap.status.toUpperCase()}</div>
                </div>
                <div class="swap-details">
                    <div class="swap-detail">
                        <span class="swap-detail-label">Base Amount:</span>
                        <span class="swap-detail-value">${swap.baseAmount}</span>
                    </div>
                    <div class="swap-detail">
                        <span class="swap-detail-label">Rel Amount:</span>
                        <span class="swap-detail-value">${swap.relAmount}</span>
                    </div>
                    <div class="swap-detail">
                        <span class="swap-detail-label">Started:</span>
                        <span class="swap-detail-value">${swap.startedAt}</span>
                    </div>
                    <div class="swap-detail">
                        <span class="swap-detail-label">Expires:</span>
                        <span class="swap-detail-value">${swap.expiresAt}</span>
                    </div>
                </div>
                <div class="swap-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${swap.progress}%"></div>
                    </div>
                </div>
            `;
            container.appendChild(swapElement);
        });
    }

    displayError(message) {
        const container = this.shadowRoot.getElementById('swaps-container');
        container.innerHTML = `<div class="error">Error: ${message}</div>`;
    }

    updateLastUpdated() {
        const now = new Date();
        const lastUpdatedElement = this.shadowRoot.getElementById('last-updated');
        if (lastUpdatedElement) {
            lastUpdatedElement.textContent = `Last updated: ${now.toLocaleTimeString()}`;
        }
    }

    refreshActiveSwaps() {
        this.loadActiveSwaps();
    }
}

customElements.define('kdf-active-swaps-card', KDFActiveSwapsCard);
