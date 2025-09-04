class KDFMyOrdersCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._config = {};
        this._myOrdersData = null;
    }

    static getConfigElement() {
        return document.createElement('kdf-my-orders-card-editor');
    }

    static getStubConfig() {
        return {
            type: 'custom:kdf-my-orders-card',
            title: 'KDF My Orders',
            refresh_interval: 30,
            panel_api_base: '/'
        };
    }

    setConfig(config) {
        this._config = {
            ...KDFMyOrdersCard.getStubConfig(),
            ...config
        };
        this.render();
        this.loadMyOrders();
        
        // Set up auto-refresh
        if (this._config.refresh_interval > 0) {
            setInterval(() => this.loadMyOrders(), this._config.refresh_interval * 1000);
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

                .header-actions {
                    display: flex;
                    gap: 8px;
                }

                .btn {
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    font-size: 0.9rem;
                }

                .btn-primary {
                    background: var(--primary-color, #00d4aa);
                    color: var(--text-primary-color, #000);
                }

                .btn-primary:hover {
                    background: var(--primary-color-dark, #00b894);
                }

                .btn-danger {
                    background: #ff4444;
                    color: #fff;
                }

                .btn-danger:hover {
                    background: #cc3333;
                }

                .orders-container {
                    max-height: 500px;
                    overflow-y: auto;
                }

                .order-item {
                    background: var(--secondary-background-color, #2a2a2a);
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 8px;
                    border: 1px solid var(--divider-color, #444);
                    transition: all 0.3s ease;
                }

                .order-item:hover {
                    background: var(--primary-background-color, #333);
                }

                .order-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }

                .order-pair {
                    font-weight: 600;
                    color: var(--primary-color, #00d4aa);
                }

                .order-type {
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 0.8rem;
                    font-weight: 600;
                }

                .order-type.buy {
                    background: #00ff88;
                    color: #000;
                }

                .order-type.sell {
                    background: #ff4444;
                    color: #fff;
                }

                .order-details {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                    font-size: 0.9rem;
                    margin-bottom: 8px;
                }

                .order-detail {
                    display: flex;
                    justify-content: space-between;
                }

                .order-detail-label {
                    color: var(--secondary-text-color, #aaa);
                }

                .order-detail-value {
                    font-weight: 600;
                    font-family: 'Courier New', monospace;
                }

                .order-actions {
                    display: flex;
                    gap: 8px;
                    margin-top: 8px;
                    padding-top: 8px;
                    border-top: 1px solid var(--divider-color, #333);
                }

                .btn-small {
                    padding: 4px 8px;
                    font-size: 0.8rem;
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

                .no-orders {
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
                    .order-details {
                        grid-template-columns: 1fr;
                    }
                    
                    .header-actions {
                        flex-direction: column;
                    }
                }
            </style>

            <div class="header">
                <div class="title">${this._config.title || 'KDF My Orders'}</div>
                <div class="header-actions">
                    <button class="btn btn-primary" onclick="this.refreshMyOrders()">↻ Refresh</button>
                    <button class="btn" onclick="this.showRawPayload(this._myOrdersData)">Raw</button>
                    <button class="btn btn-danger" onclick="this.cancelAllOrders()">Cancel All</button>
                </div>
            </div>

            <div class="orders-container" id="orders-container">
                <div class="loading">Loading my orders...</div>
            </div>

            <div class="last-updated" id="last-updated">
                Last updated: Never
            </div>
        `;
    }

    async loadMyOrders() {
        try {
            // Fetch from panel server API with retry/backoff
            const payload = await this.fetchWithBackoff((this._config.panel_api_base || '') + '/api/data', { retries: 3, minTimeout: 500 });
            if (payload && payload.my_orders_full) {
                const transformed = this.transformMyOrdersData(payload.my_orders_full);
                this.displayMyOrders(transformed);
            } else {
                const mockData = this.generateMockMyOrders();
                this.displayMyOrders(mockData);
            }
            
            this.updateLastUpdated();
            
        } catch (error) {
            console.error('Error loading my orders:', error);
            this.displayError(error.message);
        }
    }

    async fetchMyOrders() {
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

    transformMyOrdersData(kdfData) {
        // Transform KDF my_orders data to our display format
        const orders = [];

        if (kdfData && Array.isArray(kdfData)) {
            kdfData.forEach(order => {
                orders.push({
                    uuid: order.uuid || 'Unknown',
                    pair: `${order.base}/${order.rel}`,
                    type: order.type || 'unknown',
                    price: parseFloat(order.price || 0).toFixed(8),
                    volume: parseFloat(order.maxvolume || 0).toFixed(8),
                    total: (parseFloat(order.price || 0) * parseFloat(order.maxvolume || 0)).toFixed(2),
                    createdAt: order.created_at ? new Date(order.created_at * 1000).toLocaleString() : 'Unknown',
                    status: order.status || 'active'
                });
            });
        }

        return orders;
    }

    generateMockMyOrders() {
        const now = Date.now();
        const mockOrders = [
            {
                uuid: 'order-001',
                pair: 'BTC/AUD',
                type: 'sell',
                price: '175000.00',
                volume: '0.00100000',
                total: '175.00',
                createdAt: new Date(now - 3600000).toLocaleString(),
                status: 'active'
            },
            {
                uuid: 'order-002',
                pair: 'ETH/AUD',
                type: 'buy',
                price: '6500.00',
                volume: '0.10000000',
                total: '650.00',
                createdAt: new Date(now - 7200000).toLocaleString(),
                status: 'active'
            },
            {
                uuid: 'order-003',
                pair: 'LTC/AUD',
                type: 'sell',
                price: '180.00',
                volume: '5.00000000',
                total: '900.00',
                createdAt: new Date(now - 10800000).toLocaleString(),
                status: 'active'
            }
        ];

        return mockOrders;
    }

    displayMyOrders(orders) {
        this._myOrdersData = orders;
        const container = this.shadowRoot.getElementById('orders-container');
        
        if (orders.length === 0) {
            container.innerHTML = '<div class="no-orders">No active orders</div>';
            return;
        }

        container.innerHTML = '';
        orders.forEach(order => {
            const orderElement = document.createElement('div');
            orderElement.className = 'order-item';
            orderElement.innerHTML = `
                <div class="order-header">
                    <div class="order-pair">${order.pair}</div>
                    <div class="order-type ${order.type}">${order.type.toUpperCase()}</div>
                </div>
                <div class="order-details">
                    <div class="order-detail">
                        <span class="order-detail-label">Price:</span>
                        <span class="order-detail-value">${order.price}</span>
                    </div>
                    <div class="order-detail">
                        <span class="order-detail-label">Volume:</span>
                        <span class="order-detail-value">${order.volume}</span>
                    </div>
                    <div class="order-detail">
                        <span class="order-detail-label">Total:</span>
                        <span class="order-detail-value">${order.total}</span>
                    </div>
                    <div class="order-detail">
                        <span class="order-detail-label">Created:</span>
                        <span class="order-detail-value">${order.createdAt}</span>
                    </div>
                </div>
                <div class="order-actions">
                    <button class="btn btn-danger btn-small" onclick="this.cancelOrder('${order.uuid}')">Cancel Order</button>
                </div>
            `;
            container.appendChild(orderElement);
        });
    }

    async cancelOrder(uuid) {
        if (!confirm('Are you sure you want to cancel this order?')) {
            return;
        }

        try {
            // Forward action to panel-server which performs authenticated RPC
            const response = await fetch((this._config.panel_api_base || '') + '/api/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method: 'cancel_order', params: { uuid } })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            alert('Order cancelled successfully');
            this.loadMyOrders(); // Refresh the orders list
            
        } catch (error) {
            console.error('Error cancelling order:', error);
            alert(`Error cancelling order: ${error.message}`);
        }
    }

    async cancelAllOrders() {
        if (!confirm('Are you sure you want to cancel ALL orders? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch((this._config.panel_api_base || '') + '/api/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method: 'cancel_all_orders' })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            alert('All orders cancelled successfully');
            this.loadMyOrders(); // Refresh the orders list
            
        } catch (error) {
            console.error('Error cancelling all orders:', error);
            alert(`Error cancelling all orders: ${error.message}`);
        }
    }

    displayError(message) {
        const container = this.shadowRoot.getElementById('orders-container');
        container.innerHTML = `<div class="error">Error: ${message}</div>`;
    }

    updateLastUpdated() {
        const now = new Date();
        const lastUpdatedElement = this.shadowRoot.getElementById('last-updated');
        if (lastUpdatedElement) {
            lastUpdatedElement.textContent = `Last updated: ${now.toLocaleTimeString()}`;
        }
    }

    refreshMyOrders() {
        this.loadMyOrders();
    }
}

customElements.define('kdf-my-orders-card', KDFMyOrdersCard);
