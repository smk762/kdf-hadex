class KDFTradingActionsCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._config = {};
    }

    static getConfigElement() {
        return document.createElement('kdf-trading-actions-card-editor');
    }

    static getStubConfig() {
        return {
            type: 'custom:kdf-trading-actions-card',
            title: 'KDF Trading Actions',
            panel_api_base: '/',
        };
    }

    setConfig(config) {
        this._config = {
            ...KDFTradingActionsCard.getStubConfig(),
            ...config
        };
        this.render();
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

                .title {
                    font-size: 1.2rem;
                    font-weight: 600;
                    color: var(--primary-color, #00d4aa);
                    margin-bottom: 16px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid var(--divider-color, #444);
                }

                .actions-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                }

                .action-section {
                    background: var(--secondary-background-color, #2a2a2a);
                    border-radius: 8px;
                    padding: 16px;
                    border: 1px solid var(--divider-color, #444);
                }

                .action-title {
                    font-size: 1rem;
                    font-weight: 600;
                    margin-bottom: 12px;
                    color: var(--primary-color, #00d4aa);
                }

                .form-group {
                    margin-bottom: 12px;
                }

                .form-label {
                    display: block;
                    margin-bottom: 4px;
                    font-size: 0.9rem;
                    color: var(--secondary-text-color, #aaa);
                }

                .form-input {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid var(--divider-color, #444);
                    border-radius: 4px;
                    background: var(--card-background-color, #1a1a1a);
                    color: var(--primary-text-color, #ffffff);
                    font-size: 0.9rem;
                }

                .form-input:focus {
                    outline: none;
                    border-color: var(--primary-color, #00d4aa);
                    box-shadow: 0 0 0 2px rgba(0, 212, 170, 0.2);
                }

                .form-select {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid var(--divider-color, #444);
                    border-radius: 4px;
                    background: var(--card-background-color, #1a1a1a);
                    color: var(--primary-text-color, #ffffff);
                    font-size: 0.9rem;
                }

                .btn {
                    width: 100%;
                    border: none;
                    padding: 10px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.3s ease;
                    font-size: 0.9rem;
                    margin-top: 8px;
                }

                .btn-sell {
                    background: #ff4444;
                    color: #fff;
                }

                .btn-sell:hover {
                    background: #cc3333;
                }

                .btn-buy {
                    background: #00ff88;
                    color: #000;
                }

                .btn-buy:hover {
                    background: #00cc6a;
                }

                .btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .status-message {
                    margin-top: 12px;
                    padding: 8px 12px;
                    border-radius: 4px;
                    font-size: 0.9rem;
                    text-align: center;
                }

                .status-success {
                    background: rgba(0, 255, 136, 0.1);
                    border: 1px solid #00ff88;
                    color: #00ff88;
                }

                .status-error {
                    background: rgba(255, 68, 68, 0.1);
                    border: 1px solid #ff4444;
                    color: #ff4444;
                }

                .status-info {
                    background: rgba(0, 212, 170, 0.1);
                    border: 1px solid #00d4aa;
                    color: #00d4aa;
                }

                @media (max-width: 600px) {
                    .actions-container {
                        grid-template-columns: 1fr;
                    }
                }
            </style>

            <div class="title">${this._config.title || 'KDF Trading Actions'}</div>

            <div class="actions-container">
                <div class="action-section">
                    <div class="action-title">Sell Order</div>
                    <form id="sell-form">
                        <div class="form-group">
                            <label class="form-label" for="sell-base">Base Currency:</label>
                            <select class="form-select" id="sell-base" required>
                                <option value="BTC">BTC</option>
                                <option value="ETH">ETH</option>
                                <option value="LTC">LTC</option>
                                <option value="BNB">BNB</option>
                                <option value="AVAX">AVAX</option>
                                <option value="ATOM">ATOM</option>
                                <option value="MATIC">MATIC</option>
                                <option value="KMD">KMD</option>
                                <option value="DOGE">DOGE</option>
                                <option value="DGB">DGB</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="sell-rel">Quote Currency:</label>
                            <select class="form-select" id="sell-rel" required>
                                <option value="AUD">AUD</option>
                                <option value="USD">USD</option>
                                <option value="BTC">BTC</option>
                                <option value="ETH">ETH</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="sell-volume">Volume:</label>
                            <input type="number" class="form-input" id="sell-volume" step="0.00000001" min="0" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="sell-price">Price:</label>
                            <input type="number" class="form-input" id="sell-price" step="0.01" min="0" required>
                        </div>
                        <button type="submit" class="btn btn-sell">Place Sell Order</button>
                    </form>
                    <div id="sell-status" class="status-message" style="display: none;"></div>
                </div>

                <div class="action-section">
                    <div class="action-title">Buy Order</div>
                    <form id="buy-form">
                        <div class="form-group">
                            <label class="form-label" for="buy-base">Base Currency:</label>
                            <select class="form-select" id="buy-base" required>
                                <option value="BTC">BTC</option>
                                <option value="ETH">ETH</option>
                                <option value="LTC">LTC</option>
                                <option value="BNB">BNB</option>
                                <option value="AVAX">AVAX</option>
                                <option value="ATOM">ATOM</option>
                                <option value="MATIC">MATIC</option>
                                <option value="KMD">KMD</option>
                                <option value="DOGE">DOGE</option>
                                <option value="DGB">DGB</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="buy-rel">Quote Currency:</label>
                            <select class="form-select" id="buy-rel" required>
                                <option value="AUD">AUD</option>
                                <option value="USD">USD</option>
                                <option value="BTC">BTC</option>
                                <option value="ETH">ETH</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="buy-volume">Volume:</label>
                            <input type="number" class="form-input" id="buy-volume" step="0.00000001" min="0" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="buy-price">Price:</label>
                            <input type="number" class="form-input" id="buy-price" step="0.01" min="0" required>
                        </div>
                        <button type="submit" class="btn btn-buy">Place Buy Order</button>
                    </form>
                    <div id="buy-status" class="status-message" style="display: none;"></div>
                </div>
            </div>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const sellForm = this.shadowRoot.getElementById('sell-form');
        const buyForm = this.shadowRoot.getElementById('buy-form');

        sellForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.placeSellOrder();
        });

        buyForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.placeBuyOrder();
        });
    }

    async placeSellOrder() {
        const base = this.shadowRoot.getElementById('sell-base').value;
        const rel = this.shadowRoot.getElementById('sell-rel').value;
        const volume = this.shadowRoot.getElementById('sell-volume').value;
        const price = this.shadowRoot.getElementById('sell-price').value;

        if (!base || !rel || !volume || !price) {
            this.showStatus('sell-status', 'Please fill in all fields', 'error');
            return;
        }

        try {
            this.showStatus('sell-status', 'Placing sell order...', 'info');
            
            const response = await fetch((this._config.panel_api_base || '') + '/api/kdf_request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method: 'sell', params: { base, rel, volume, price } })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data.error) {
                console.error('KDF error (sell):', data.error);
                this.showStatus('sell-status', `Error: ${data.error}`, 'error');
                return;
            }

            // store raw response for debugging
            this._lastActionRaw = data;

            this.showStatus('sell-status', 'Sell order placed successfully!', 'success');
            this.clearForm('sell-form');
            
        } catch (error) {
            console.error('Error placing sell order:', error);
            this.showStatus('sell-status', `Error: ${error.message}`, 'error');
        }
    }

    async placeBuyOrder() {
        const base = this.shadowRoot.getElementById('buy-base').value;
        const rel = this.shadowRoot.getElementById('buy-rel').value;
        const volume = this.shadowRoot.getElementById('buy-volume').value;
        const price = this.shadowRoot.getElementById('buy-price').value;

        if (!base || !rel || !volume || !price) {
            this.showStatus('buy-status', 'Please fill in all fields', 'error');
            return;
        }

        try {
            this.showStatus('buy-status', 'Placing buy order...', 'info');
            
            const response = await fetch((this._config.panel_api_base || '') + '/api/kdf_request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method: 'buy', params: { base, rel, volume, price } })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data.error) {
                console.error('KDF error (buy):', data.error);
                this.showStatus('buy-status', `Error: ${data.error}`, 'error');
                return;
            }

            // store raw response for debugging
            this._lastActionRaw = data;

            this.showStatus('buy-status', 'Buy order placed successfully!', 'success');
            this.clearForm('buy-form');
            
        } catch (error) {
            console.error('Error placing buy order:', error);
            this.showStatus('buy-status', `Error: ${error.message}`, 'error');
        }
    }

    showStatus(elementId, message, type) {
        const statusElement = this.shadowRoot.getElementById(elementId);
        statusElement.textContent = message;
        statusElement.className = `status-message status-${type}`;
        statusElement.style.display = 'block';

        // Hide status after 5 seconds
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 5000);
    }

    clearForm(formId) {
        const form = this.shadowRoot.getElementById(formId);
        form.reset();
    }
}

customElements.define('kdf-trading-actions-card', KDFTradingActionsCard);
