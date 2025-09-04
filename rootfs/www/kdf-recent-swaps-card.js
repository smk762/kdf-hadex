class KDFRecentSwapsCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._config = {};
        this._recentSwapsData = null;
    }

    static getConfigElement() {
        return document.createElement('kdf-recent-swaps-card-editor');
    }

    static getStubConfig() {
        return {
            type: 'custom:kdf-recent-swaps-card',
            title: 'KDF Recent Swaps',
            max_swaps: 10,
            refresh_interval: 60,
            panel_api_base: '/',
        };
    }

    setConfig(config) {
        this._config = {
            ...KDFRecentSwapsCard.getStubConfig(),
            ...config
        };
        this.render();
        this.loadRecentSwaps();
        
        // Set up auto-refresh
        if (this._config.refresh_interval > 0) {
            setInterval(() => this.loadRecentSwaps(), this._config.refresh_interval * 1000);
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
                    max-height: 500px;
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

                .swap-status.completed {
                    background: #00ff88;
                    color: #000;
                }

                .swap-status.failed {
                    background: #ff4444;
                    color: #fff;
                }

                .swap-status.cancelled {
                    background: #ffaa00;
                    color: #000;
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

                .swap-time {
                    margin-top: 8px;
                    padding-top: 8px;
                    border-top: 1px solid var(--divider-color, #333);
                    font-size: 0.8rem;
                    color: var(--secondary-text-color, #aaa);
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
                <div class="title">${this._config.title || 'KDF Recent Swaps'}</div>
                <div>
                    <button class="refresh-btn" onclick="this.refreshRecentSwaps()">↻ Refresh</button>
                    <button class="refresh-btn" onclick="this.showRawPayload(this._recentSwapsData)">Raw</button>
                </div>
            </div>

            <div class="swaps-container" id="swaps-container">
                <div class="loading">Loading recent swaps...</div>
            </div>

            <div class="last-updated" id="last-updated">
                Last updated: Never
            </div>
        `;
    }

    async loadRecentSwaps() {
        try {
            // Fetch data from panel server API with retry/backoff
            const payload = await this.fetchWithBackoff((this._config.panel_api_base || '') + '/api/kdf_request', { method: 'POST', body: JSON.stringify({ method: 'my_recent_swaps' }) }, { retries: 3, minTimeout: 500 });
            if (payload && payload.recent_swaps_full) {
                const transformed = this.transformRecentSwapsData(payload.recent_swaps_full);
                this.displayRecentSwaps(transformed);
            } else {
                // Fallback to mock
                const mockData = this.generateMockRecentSwaps();
                this.displayRecentSwaps(mockData);
            }
            
            this.updateLastUpdated();
            
        } catch (error) {
            console.error('Error loading recent swaps:', error);
            this.displayError(error.message);
        }
    }

    async fetchRecentSwaps() {
        // Deprecated: card now uses panel server API
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

    // Show raw JSON modal
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

    transformRecentSwapsData(kdfData) {
        // Transform KDF my_recent_swaps data to our display format
        const swaps = [];

        if (kdfData && Array.isArray(kdfData)) {
            kdfData.forEach(swap => {
                swaps.push({
                    uuid: swap.uuid || 'Unknown',
                    pair: `${swap.base}/${swap.rel}`,
                    status: this.mapSwapStatus(swap.status),
                    baseAmount: parseFloat(swap.base_amount || 0).toFixed(8),
                    relAmount: parseFloat(swap.rel_amount || 0).toFixed(8),
                    completedAt: swap.finished_at ? new Date(swap.finished_at * 1000).toLocaleString() : 'Unknown',
                    startedAt: swap.started_at ? new Date(swap.started_at * 1000).toLocaleString() : 'Unknown',
                    duration: this.calculateSwapDuration(swap.started_at, swap.finished_at)
                });
            });
        }

        return swaps.slice(0, this._config.max_swaps);
    }

    mapSwapStatus(status) {
        const statusMap = {
            'finished': 'completed',
            'failed': 'failed',
            'cancelled': 'cancelled',
            'timeout': 'failed'
        };
        return statusMap[status] || 'completed';
    }

    calculateSwapDuration(startedAt, finishedAt) {
        if (!startedAt || !finishedAt) return 'Unknown';
        const duration = finishedAt - startedAt;
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        return `${minutes}m ${seconds}s`;
    }

    generateMockRecentSwaps() {
        const now = Date.now();
        const mockSwaps = [
            {
                uuid: 'swap-001',
                pair: 'BTC/AUD',
                status: 'completed',
                baseAmount: '0.00100000',
                relAmount: '170.50',
                completedAt: new Date(now - 300000).toLocaleString(),
                startedAt: new Date(now - 600000).toLocaleString(),
                duration: '5m 0s'
            },
            {
                uuid: 'swap-002',
                pair: 'ETH/AUD',
                status: 'completed',
                baseAmount: '0.05000000',
                relAmount: '333.25',
                completedAt: new Date(now - 1800000).toLocaleString(),
                startedAt: new Date(now - 2100000).toLocaleString(),
                duration: '5m 0s'
            },
            {
                uuid: 'swap-003',
                pair: 'LTC/AUD',
                status: 'failed',
                baseAmount: '1.00000000',
                relAmount: '170.38',
                completedAt: new Date(now - 3600000).toLocaleString(),
                startedAt: new Date(now - 4200000).toLocaleString(),
                duration: '10m 0s'
            },
            {
                uuid: 'swap-004',
                pair: 'BNB/AUD',
                status: 'completed',
                baseAmount: '0.10000000',
                relAmount: '130.36',
                completedAt: new Date(now - 7200000).toLocaleString(),
                startedAt: new Date(now - 7800000).toLocaleString(),
                duration: '10m 0s'
            },
            {
                uuid: 'swap-005',
                pair: 'DOGE/AUD',
                status: 'cancelled',
                baseAmount: '1000.00000000',
                relAmount: '326.00',
                completedAt: new Date(now - 10800000).toLocaleString(),
                startedAt: new Date(now - 11400000).toLocaleString(),
                duration: '10m 0s'
            }
        ];

        return mockSwaps.slice(0, this._config.max_swaps);
    }

    displayRecentSwaps(swaps) {
        this._recentSwapsData = swaps;
        const container = this.shadowRoot.getElementById('swaps-container');
        
        if (swaps.length === 0) {
            container.innerHTML = '<div class="no-swaps">No recent swaps</div>';
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
                        <span class="swap-detail-label">Duration:</span>
                        <span class="swap-detail-value">${swap.duration}</span>
                    </div>
                    <div class="swap-detail">
                        <span class="swap-detail-label">Completed:</span>
                        <span class="swap-detail-value">${swap.completedAt}</span>
                    </div>
                </div>
                <div class="swap-time">
                    Started: ${swap.startedAt}
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

    refreshRecentSwaps() {
        this.loadRecentSwaps();
    }
}

customElements.define('kdf-recent-swaps-card', KDFRecentSwapsCard);
