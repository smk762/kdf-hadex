class KDFBestOrdersCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._config = {};
        this._bestOrdersData = null;
    }

    static getConfigElement() {
        return document.createElement('kdf-best-orders-card-editor');
    }

    static getStubConfig() {
        return {
            type: 'custom:kdf-best-orders-card',
            title: 'KDF Best Orders',
            base_currency: 'AUD',
            coin: 'DGB',
            action: 'buy',
            max_orders: 10,
            refresh_interval: 30,
            panel_api_base: '/',
        };
    }

    setConfig(config) {
        this._config = {
            ...KDFBestOrdersCard.getStubConfig(),
            ...config
        };
        this.render();
        this.loadBestOrders();
        
        // Set up auto-refresh
        if (this._config.refresh_interval > 0) {
            setInterval(() => this.loadBestOrders(), this._config.refresh_interval * 1000);
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

                .orders-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                }

                .orders-section {
                    background: var(--secondary-background-color, #2a2a2a);
                    border-radius: 8px;
                    padding: 12px;
                    border: 1px solid var(--divider-color, #444);
                }

                .orders-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid var(--divider-color, #444);
                }

                .orders-title {
                    font-size: 1rem;
                    font-weight: 600;
                }

                .orders-title.buy {
                    color: #00ff88;
                }

                .orders-title.sell {
                    color: #ff4444;
                }

                .orders-table {
                    width: 100%;
                    font-size: 12px;
                }

                .orders-table th,
                .orders-table td {
                    padding: 6px 8px;
                    text-align: right;
                }

                .orders-table th {
                    background: var(--primary-background-color, #333);
                    color: var(--secondary-text-color, #aaa);
                    font-weight: 500;
                    border-bottom: 1px solid var(--divider-color, #444);
                }

                .orders-table td {
                    border-bottom: 1px solid var(--divider-color, #333);
                }

                .orders-table tr:hover {
                    background: var(--primary-background-color, #333);
                }

                .price {
                    font-weight: 600;
                    font-family: 'Courier New', monospace;
                }

                .price.buy {
                    color: #00ff88;
                }

                .price.sell {
                    color: #ff4444;
                }

                .volume {
                    color: var(--secondary-text-color, #aaa);
                    font-family: 'Courier New', monospace;
                }

                .loading {
                    text-align: center;
                    color: var(--secondary-text-color, #888);
                    padding: 20px;
                }

                .error {
                    text-align: center;
                    color: #ff4444;
                    padding: 20px;
                    background: #2a1a1a;
                    border-radius: 6px;
                    border: 1px solid #ff4444;
                }

                .last-updated {
                    text-align: center;
                    color: var(--secondary-text-color, #666);
                    font-size: 0.8rem;
                    margin-top: 12px;
                }

                @media (max-width: 600px) {
                    .orders-container {
                        grid-template-columns: 1fr;
                    }
                }
            </style>

            <div class="header">
                <div class="title">${this._config.title || 'KDF Best Orders'}</div>
                <div>
                    <button class="refresh-btn" onclick="this.refreshBestOrders()">↻ Refresh</button>
                    <button class="refresh-btn" onclick="this.showRawPayload(this._bestOrdersRaw)">Raw</button>
                </div>
            </div>

            <div class="orders-container">
                <div class="orders-section">
                    <div class="orders-header">
                        <div class="orders-title buy">Best Buy Orders</div>
                    </div>
                    <table class="orders-table">
                        <thead>
                            <tr>
                                <th>Price (${this._config.base_currency})</th>
                                <th>Volume</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody id="buy-orders-table">
                            <tr>
                                <td colspan="3" class="loading">Loading...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="orders-section">
                    <div class="orders-header">
                        <div class="orders-title sell">Best Sell Orders</div>
                    </div>
                    <table class="orders-table">
                        <thead>
                            <tr>
                                <th>Price (${this._config.base_currency})</th>
                                <th>Volume</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody id="sell-orders-table">
                            <tr>
                                <td colspan="3" class="loading">Loading...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="last-updated" id="last-updated">
                Last updated: Never
            </div>
        `;
    }

    async loadBestOrders() {
        try {
            // Try to fetch real data first, fall back to mock data if KDF is not available
            try {
                const realData = await this.fetchBestOrders();
                this.displayBestOrders(realData);
            } catch (apiError) {
                console.warn('KDF API not available, using mock data:', apiError.message);
                const mockData = this.generateMockBestOrders();
                this.displayBestOrders(mockData);
            }
            
            this.updateLastUpdated();
            
        } catch (error) {
            console.error('Error loading best orders:', error);
            this.displayError(error.message);
        }
    }

    async fetchBestOrders() {
        try {
            const url = (this._config.panel_api_base || '') + '/api/best_orders';
            // Build params per KDF best_orders API
            const params = {
                coin: this._config.coin || 'DGB',
                action: this._config.action || 'buy',
                request_by: { type: 'number', value: this._config.max_orders || 10 }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ params })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data.error) throw new Error(data.error);
            const result = data.result || data;
            // store raw
            this._bestOrdersRaw = result;
            return this.transformBestOrdersData(result);
        } catch (error) {
            console.error('KDF API Error:', error);
            throw error;
        }
    }

    transformBestOrdersData(kdfData) {
        // Transform KDF best_orders data to our display format
        const buyOrders = [];
        const sellOrders = [];

        // Process the best orders data structure
        // KDF may return { orders: { ticker: [...] } } or direct map; normalize
        let ordersMap = kdfData;
        if (kdfData && typeof kdfData === 'object' && kdfData.orders) {
            ordersMap = kdfData.orders;
        }

        if (ordersMap && typeof ordersMap === 'object') {
            Object.entries(ordersMap).forEach(([pair, orders]) => {
                if (orders.bids) {
                    orders.bids.forEach(bid => {
                        buyOrders.push({
                            pair: pair,
                            price: parseFloat(bid.price).toFixed(8),
                            volume: parseFloat(bid.maxvolume).toFixed(4),
                            total: (parseFloat(bid.price) * parseFloat(bid.maxvolume)).toFixed(2)
                        });
                    });
                }
                if (orders.asks) {
                    orders.asks.forEach(ask => {
                        sellOrders.push({
                            pair: pair,
                            price: parseFloat(ask.price).toFixed(8),
                            volume: parseFloat(ask.maxvolume).toFixed(4),
                            total: (parseFloat(ask.price) * parseFloat(ask.maxvolume)).toFixed(2)
                        });
                    });
                }
            });
        }

        return {
            buyOrders: buyOrders.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)).slice(0, this._config.max_orders),
            sellOrders: sellOrders.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)).slice(0, this._config.max_orders)
        };
    }

    generateMockBestOrders() {
        const mockBuyOrders = [];
        const mockSellOrders = [];

        // Generate mock buy orders
        for (let i = 0; i < this._config.max_orders; i++) {
            const price = 50000 - (i * 1000);
            const volume = Math.random() * 10 + 1;
            mockBuyOrders.push({
                pair: 'BTC/AUD',
                price: price.toFixed(2),
                volume: volume.toFixed(4),
                total: (price * volume).toFixed(2)
            });
        }

        // Generate mock sell orders
        for (let i = 0; i < this._config.max_orders; i++) {
            const price = 51000 + (i * 1000);
            const volume = Math.random() * 10 + 1;
            mockSellOrders.push({
                pair: 'BTC/AUD',
                price: price.toFixed(2),
                volume: volume.toFixed(4),
                total: (price * volume).toFixed(2)
            });
        }

        return {
            buyOrders: mockBuyOrders,
            sellOrders: mockSellOrders
        };
    }

    displayBestOrders(data) {
        this._bestOrdersData = data;
        
        // Update buy orders table
        const buyTable = this.shadowRoot.getElementById('buy-orders-table');
        buyTable.innerHTML = '';
        data.buyOrders.forEach(order => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="price buy">${order.price}</td>
                <td class="volume">${order.volume}</td>
                <td class="volume">${order.total}</td>
            `;
            buyTable.appendChild(row);
        });
        
        // Update sell orders table
        const sellTable = this.shadowRoot.getElementById('sell-orders-table');
        sellTable.innerHTML = '';
        data.sellOrders.forEach(order => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="price sell">${order.price}</td>
                <td class="volume">${order.volume}</td>
                <td class="volume">${order.total}</td>
            `;
            sellTable.appendChild(row);
        });

        // add link to orderbook for first pair if available
        if (this._bestOrdersRaw && this._bestOrdersRaw.orders) {
            const firstPair = Object.keys(this._bestOrdersRaw.orders)[0];
            if (firstPair) {
                const panelBase = this._config.panel_api_base || '/';
                const linkHtml = `<div style="margin-top:8px;"><a href="./orderbook.html?base=${firstPair.split('/')[0] || ''}&rel=${firstPair.split('/')[1] || ''}">Open Orderbook for ${firstPair}</a></div>`;
                const last = this.shadowRoot.getElementById('last-updated');
                if (last) last.insertAdjacentHTML('afterend', linkHtml);
            }
        }
    }

    displayError(message) {
        const buyTable = this.shadowRoot.getElementById('buy-orders-table');
        const sellTable = this.shadowRoot.getElementById('sell-orders-table');
        
        buyTable.innerHTML = `<tr><td colspan="3" class="error">Error: ${message}</td></tr>`;
        sellTable.innerHTML = `<tr><td colspan="3" class="error">Error: ${message}</td></tr>`;
    }

    updateLastUpdated() {
        const now = new Date();
        const lastUpdatedElement = this.shadowRoot.getElementById('last-updated');
        if (lastUpdatedElement) {
            lastUpdatedElement.textContent = `Last updated: ${now.toLocaleTimeString()}`;
        }
    }

    refreshBestOrders() {
        this.loadBestOrders();
    }
}

customElements.define('kdf-best-orders-card', KDFBestOrdersCard);
