class KDFOrderbookCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._config = {};
        this._orderbookData = null;
        this._currentCoin = 'BTC';
    }

    static getConfigElement() {
        return document.createElement('kdf-orderbook-card-editor');
    }

    static getStubConfig() {
        return {
            type: 'custom:kdf-orderbook-card',
            title: 'KDF Orderbook',
            coin: 'BTC',
            base_currency: 'AUD',
            show_spread: true,
            max_orders: 10,
            refresh_interval: 30,
            panel_api_base: '/',
        };
    }

    setConfig(config) {
        this._config = {
            ...KDFOrderbookCard.getStubConfig(),
            ...config
        };
        this._currentCoin = this._config.coin;
        this.render();
        this.loadOrderbook();
        
        // Set up auto-refresh
        if (this._config.refresh_interval > 0) {
            setInterval(() => this.loadOrderbook(), this._config.refresh_interval * 1000);
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

                .coin-selector {
                    display: flex;
                    gap: 8px;
                    margin-bottom: 16px;
                    flex-wrap: wrap;
                }

                .coin-btn {
                    background: var(--secondary-background-color, #2a2a2a);
                    border: 1px solid var(--divider-color, #444);
                    color: var(--primary-text-color, #fff);
                    padding: 6px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-size: 12px;
                    font-weight: 500;
                }

                .coin-btn:hover {
                    background: var(--primary-color, #00d4aa);
                    color: var(--text-primary-color, #000);
                }

                .coin-btn.active {
                    background: var(--primary-color, #00d4aa);
                    color: var(--text-primary-color, #000);
                }

                .spread {
                    text-align: center;
                    background: var(--secondary-background-color, #2a2a2a);
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 16px;
                    border: 1px solid var(--divider-color, #444);
                }

                .spread-value {
                    font-size: 1.3rem;
                    font-weight: 600;
                    color: var(--primary-color, #00d4aa);
                    font-family: 'Courier New', monospace;
                }

                .spread-label {
                    color: var(--secondary-text-color, #aaa);
                    font-size: 0.8rem;
                    margin-top: 4px;
                }

                .orderbook-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                }

                .orderbook-section {
                    background: var(--secondary-background-color, #2a2a2a);
                    border-radius: 8px;
                    padding: 12px;
                    border: 1px solid var(--divider-color, #444);
                }

                .orderbook-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid var(--divider-color, #444);
                }

                .orderbook-title {
                    font-size: 1rem;
                    font-weight: 600;
                }

                .orderbook-title.bids {
                    color: #00ff88;
                }

                .orderbook-title.asks {
                    color: #ff4444;
                }

                .refresh-btn {
                    background: var(--primary-color, #00d4aa);
                    color: var(--text-primary-color, #000);
                    border: none;
                    padding: 4px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 10px;
                    font-weight: 600;
                    transition: background 0.3s ease;
                }

                .refresh-btn:hover {
                    background: var(--primary-color-dark, #00b894);
                }

                .orderbook-table {
                    width: 100%;
                    font-size: 12px;
                }

                .orderbook-table th,
                .orderbook-table td {
                    padding: 4px 6px;
                    text-align: right;
                }

                .orderbook-table th {
                    background: var(--primary-background-color, #333);
                    color: var(--secondary-text-color, #aaa);
                    font-weight: 500;
                    border-bottom: 1px solid var(--divider-color, #444);
                }

                .orderbook-table td {
                    border-bottom: 1px solid var(--divider-color, #333);
                }

                .orderbook-table tr:hover {
                    background: var(--primary-background-color, #333);
                }

                .price {
                    font-weight: 600;
                    font-family: 'Courier New', monospace;
                }

                .price.bid {
                    color: #00ff88;
                }

                .price.ask {
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
                    .orderbook-container {
                        grid-template-columns: 1fr;
                    }
                    
                    .coin-selector {
                        justify-content: flex-start;
                        overflow-x: auto;
                        padding-bottom: 8px;
                    }
                    
                    .coin-btn {
                        white-space: nowrap;
                        flex-shrink: 0;
                    }
                }
            </style>

            <div class="header">
                <div class="title">${this._config.title || 'KDF Orderbook'}</div>
            </div>

            <div class="coin-selector">
                <button class="coin-btn active" data-coin="USD">USD</button>
                <button class="coin-btn" data-coin="LTC">LTC</button>
                <button class="coin-btn" data-coin="BNB">BNB</button>
                <button class="coin-btn" data-coin="BTC">BTC</button>
                <button class="coin-btn" data-coin="ETH">ETH</button>
                <button class="coin-btn" data-coin="AVAX">AVAX</button>
                <button class="coin-btn" data-coin="ATOM">ATOM</button>
                <button class="coin-btn" data-coin="MATIC">MATIC</button>
                <button class="coin-btn" data-coin="KMD">KMD</button>
                <button class="coin-btn" data-coin="DOGE">DOGE</button>
                <button class="coin-btn" data-coin="DGB">DGB</button>
            </div>

            ${this._config.show_spread ? `
                <div class="spread">
                    <div class="spread-value" id="spread">--</div>
                    <div class="spread-label">Spread</div>
                </div>
            ` : ''}

            <div class="orderbook-container">
                <div class="orderbook-section">
                    <div class="orderbook-header">
                        <div class="orderbook-title bids">Bids (Buy)</div>
                        <div>
                            <button class="refresh-btn" onclick="this.refreshOrderbook()">↻</button>
                            <button class="refresh-btn" onclick="this.showRawPayload(this._orderbookRaw)">Raw</button>
                        </div>
                    </div>
                    <table class="orderbook-table">
                        <thead>
                            <tr>
                                <th>Price (${this._config.base_currency})</th>
                                <th>Volume</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody id="bids-table">
                            <tr>
                                <td colspan="3" class="loading">Loading...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="orderbook-section">
                    <div class="orderbook-header">
                        <div class="orderbook-title asks">Asks (Sell)</div>
                    </div>
                    <table class="orderbook-table">
                        <thead>
                            <tr>
                                <th>Price (${this._config.base_currency})</th>
                                <th>Volume</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody id="asks-table">
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

        this.setupEventListeners();
    }

    setupEventListeners() {
        const coinButtons = this.shadowRoot.querySelectorAll('.coin-btn');
        coinButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove active class from all buttons
                coinButtons.forEach(b => b.classList.remove('active'));
                // Add active class to clicked button
                e.target.classList.add('active');
                
                // Update current coin
                this._currentCoin = e.target.dataset.coin;
                
                // Load new orderbook
                this.loadOrderbook();
            });
        });
    }

    async loadOrderbook() {
        try {
            // Try to fetch real data first, fall back to mock data if KDF is not available
            try {
                const realData = await this.fetchRealOrderbook(this._currentCoin, this._config.base_currency);
                this.displayOrderbook(realData);
            } catch (apiError) {
                console.warn(`KDF API not available for ${this._currentCoin}, using mock data:`, apiError.message);
                const mockData = this.generateMockOrderbook();
                this.displayOrderbook(mockData);
            }
            
            this.updateLastUpdated();
            
        } catch (error) {
            console.error('Error loading orderbook:', error);
            this.displayError(error.message);
        }
    }

    generateMockOrderbook() {
        const basePrice = this.getBasePrice(this._currentCoin);
        const spread = basePrice * 0.001; // 0.1% spread
        
        const bids = [];
        const asks = [];
        
        // Generate bids (buy orders)
        for (let i = 0; i < this._config.max_orders; i++) {
            const price = basePrice - (spread / 2) - (i * spread * 0.1);
            const volume = Math.random() * 100 + 10;
            bids.push({
                price: price.toFixed(8),
                volume: volume.toFixed(4),
                total: (price * volume).toFixed(2)
            });
        }
        
        // Generate asks (sell orders)
        for (let i = 0; i < this._config.max_orders; i++) {
            const price = basePrice + (spread / 2) + (i * spread * 0.1);
            const volume = Math.random() * 100 + 10;
            asks.push({
                price: price.toFixed(8),
                volume: volume.toFixed(4),
                total: (price * volume).toFixed(2)
            });
        }
        
        return {
            bids: bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)),
            asks: asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)),
            spread: spread.toFixed(8)
        };
    }

    getBasePrice(coin) {
        const prices = {
            'USD': 1.533551,
            'LTC': 170.38,
            'BNB': 1303.6104,
            'BTC': 170690.35,
            'ETH': 6669.6433,
            'AVAX': 36.7592,
            'ATOM': 6.7921,
            'MATIC': 0.4421,
            'KMD': 0.0484,
            'DOGE': 0.326,
            'DGB': 0.0127
        };
        return prices[coin] || 100;
    }

    displayOrderbook(data) {
        this._orderbookData = data;
        
        // Update spread
        if (this._config.show_spread) {
            const spreadElement = this.shadowRoot.getElementById('spread');
            if (spreadElement) {
                spreadElement.textContent = data.spread;
            }
        }
        
        // Update bids table
        const bidsTable = this.shadowRoot.getElementById('bids-table');
        bidsTable.innerHTML = '';
        data.bids.forEach(bid => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="price bid">${bid.price}</td>
                <td class="volume">${bid.volume}</td>
                <td class="volume">${bid.total}</td>
            `;
            bidsTable.appendChild(row);
        });
        
        // Update asks table
        const asksTable = this.shadowRoot.getElementById('asks-table');
        asksTable.innerHTML = '';
        data.asks.forEach(ask => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="price ask">${ask.price}</td>
                <td class="volume">${ask.volume}</td>
                <td class="volume">${ask.total}</td>
            `;
            asksTable.appendChild(row);
        });
    }

    displayError(message) {
        const bidsTable = this.shadowRoot.getElementById('bids-table');
        const asksTable = this.shadowRoot.getElementById('asks-table');
        
        bidsTable.innerHTML = `<tr><td colspan="3" class="error">Error: ${message}</td></tr>`;
        asksTable.innerHTML = `<tr><td colspan="3" class="error">Error: ${message}</td></tr>`;
        
        if (this._config.show_spread) {
            const spreadElement = this.shadowRoot.getElementById('spread');
            if (spreadElement) {
                spreadElement.textContent = '--';
            }
        }
    }

    updateLastUpdated() {
        const now = new Date();
        const lastUpdatedElement = this.shadowRoot.getElementById('last-updated');
        if (lastUpdatedElement) {
            lastUpdatedElement.textContent = `Last updated: ${now.toLocaleTimeString()}`;
        }
    }

    refreshOrderbook() {
        this.loadOrderbook();
    }

    // Real KDF API integration
    async fetchRealOrderbook(base, rel) {
        try {
            const response = await fetch((this._config.panel_api_base || '') + '/api/kdf_request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method: 'orderbook', params: { base, rel } })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            // store raw
            this._orderbookRaw = data.result || data;

            // Transform KDF orderbook data to our format
            return this.transformKDFOrderbook(data.result);
        } catch (error) {
            console.error('KDF API Error:', error);
            throw error;
        }
    }

    transformKDFOrderbook(kdfData) {
        // Transform KDF orderbook format to our display format
        const bids = kdfData.bids ? kdfData.bids.map(bid => ({
            price: parseFloat(bid.price).toFixed(8),
            volume: parseFloat(bid.maxvolume).toFixed(4),
            total: (parseFloat(bid.price) * parseFloat(bid.maxvolume)).toFixed(2)
        })) : [];

        const asks = kdfData.asks ? kdfData.asks.map(ask => ({
            price: parseFloat(ask.price).toFixed(8),
            volume: parseFloat(ask.maxvolume).toFixed(4),
            total: (parseFloat(ask.price) * parseFloat(ask.maxvolume)).toFixed(2)
        })) : [];

        // Calculate spread
        const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0;
        const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : 0;
        const spread = bestBid > 0 && bestAsk > 0 ? (bestAsk - bestBid).toFixed(8) : '0.00000000';

        return {
            bids: bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price)),
            asks: asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)),
            spread: spread
        };
    }
}

customElements.define('kdf-orderbook-card', KDFOrderbookCard);
