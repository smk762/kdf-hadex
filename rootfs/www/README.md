# KDF Orderbook Lovelace Card

A custom Home Assistant Lovelace card for displaying real-time orderbook data from the Komodo DeFi Framework (KDF).

## Features

- **Real-time Orderbook Display**: Shows buy (bids) and sell (asks) orders
- **Multiple Cryptocurrencies**: Support for USD, LTC, BNB, BTC, ETH, AVAX, ATOM, MATIC, KMD, DOGE, DGB
- **Interactive Coin Selection**: Switch between different cryptocurrencies
- **Spread Information**: Displays current spread between best bid and ask
- **Auto-refresh**: Configurable refresh intervals
- **Responsive Design**: Works on desktop and mobile devices
- **Home Assistant Integration**: Native Lovelace card with configuration UI

## Installation

### Step 1: Copy Card Files

Copy the Lovelace card files to your Home Assistant `www` directory:

```bash
# Copy to your Home Assistant www directory
cp kdf-orderbook-card.js /config/www/
cp kdf-orderbook-card-editor.js /config/www/
cp manifest.json /config/www/
```

### Step 2: Add Card Resource

Add the card resource in your Lovelace configuration:

**Via UI:**
1. Go to **Configuration** → **Lovelace Dashboards** → **Resources**
2. Click **+ Add Resource**
3. Set URL to: `/local/kdf-orderbook-card.js`
4. Set Resource type to: **JavaScript Module**

**Via YAML:**
```yaml
resources:
  - url: /local/kdf-orderbook-card.js
    type: module
```

### Step 3: Add Card to Dashboard

Add the card to your dashboard using the card editor or YAML configuration (see examples below).

## Configuration

### Basic Configuration

```yaml
type: custom:kdf-orderbook-card
title: "KDF Orderbook"
coin: "BTC"
base_currency: "AUD"
show_spread: true
max_orders: 10
refresh_interval: 30
# Panel server handles RPC authentication; point cards at the panel API base path
# panel_api_base: "/"
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | "KDF Orderbook" | Display title for the card |
| `coin` | string | "BTC" | Default coin to display |
| `base_currency` | string | "AUD" | Base currency for prices |
| `show_spread` | boolean | true | Whether to show spread information |
| `max_orders` | number | 10 | Maximum orders to display (1-50) |
| `refresh_interval` | number | 30 | Auto-refresh interval in seconds (5-300) |
| `panel_api_base` | string | `/` | Base path for panel server API (panel handles RPC auth) |

### Supported Coins

- USD (USD/AUD rate)
- LTC (Litecoin)
- BNB (Binance Coin)
- BTC (Bitcoin)
- ETH (Ethereum)
- AVAX (Avalanche)
- ATOM (Cosmos)
- MATIC (Polygon)
- KMD (Komodo)
- DOGE (Dogecoin)
- DGB (DigiByte)

## Dashboard Examples

### Single Orderbook Card

```yaml
type: custom:kdf-orderbook-card
title: "BTC Orderbook"
coin: "BTC"
base_currency: "AUD"
show_spread: true
max_orders: 10
refresh_interval: 30
kdf_rpc_url: "http://localhost:7783"
kdf_rpc_password: "your_rpc_password"
```

### Multiple Orderbooks in Grid

```yaml
type: grid
columns: 2
cards:
  - type: custom:kdf-orderbook-card
    title: "BTC Orderbook"
    coin: "BTC"
    base_currency: "AUD"
    max_orders: 5
  - type: custom:kdf-orderbook-card
    title: "ETH Orderbook"
    coin: "ETH"
    base_currency: "AUD"
    max_orders: 5
```

### Horizontal Stack Layout

```yaml
type: horizontal-stack
cards:
  - type: custom:kdf-orderbook-card
    title: "BTC"
    coin: "BTC"
    base_currency: "AUD"
    max_orders: 5
  - type: custom:kdf-orderbook-card
    title: "ETH"
    coin: "ETH"
    base_currency: "AUD"
    max_orders: 5
  - type: custom:kdf-orderbook-card
    title: "LTC"
    coin: "LTC"
    base_currency: "AUD"
    max_orders: 5
```

### Raw RPC Debug Card

```yaml
- type: custom:kdf-raw-rpc-card
  title: "KDF Raw RPC"
  panel_api_base: "/"
```

This card allows pasting raw JSON RPC request bodies, sending them to the add-on's `POST /api/kdf_request` endpoint, and viewing the raw response. Useful for debugging and reproducing API calls.

## API Integration

The cards and demos integrate with the add-on's Panel Server which performs authenticated RPC requests to KDF on behalf of the browser. This avoids exposing `rpc_password` to the client.

To enable live data in your Lovelace dashboards:

1. Ensure the KDF add-on is running
2. In your card configuration set `panel_api_base` to the panel server base (default `/`)
3. The cards send authenticated KDF requests to the panel server via `POST /api/kdf_request` (single forwarder). For safe, unauthenticated info the following GET endpoints are available:

- `GET /api/version` - KDF version
- `GET /api/peers` - cleaned peer list
- `GET /api/tickers` - available tickers
- `GET /api/available_fiats` - detected fiat sensors

For all other KDF RPC methods use `POST /api/kdf_request` with a JSON-RPC style body, e.g.:

```json
{ "method": "orderbook", "params": { "base": "BTC", "rel": "LTC" } }
```

Do not store `rpc_password` in card configs; the panel server injects it from `options.json` when forwarding requests.

## Troubleshooting

### Card Not Loading

1. Check that the card files are in the correct location
2. Verify the resource is added to Lovelace configuration
3. Check browser console for JavaScript errors

### No Data Displayed

1. Verify KDF add-on is running
2. Check RPC URL and password configuration
3. Ensure network connectivity to KDF RPC endpoint

### Performance Issues

1. Reduce `max_orders` to display fewer orders
2. Increase `refresh_interval` to reduce API calls
3. Use fewer cards on the same dashboard

## Development

### File Structure

```
www/
├── kdf-orderbook-card.js          # Main card component
├── kdf-orderbook-card-editor.js   # Configuration editor
├── manifest.json                  # Card manifest
├── dashboard-example.yaml        # Example dashboard config
└── README.md                     # This file
```

### Customization

The card uses CSS custom properties for theming and can be customized to match your Home Assistant theme:

```css
:host {
  --primary-color: #00d4aa;
  --card-background-color: #1a1a1a;
  --primary-text-color: #ffffff;
  --secondary-text-color: #aaa;
  --divider-color: #444;
}
```

## License

This project is part of the KDF HADEX add-on and follows the same license terms.

## Support

For issues and support:
- Check the KDF add-on logs
- Verify configuration settings
- Ensure KDF is running and accessible
- Check Home Assistant logs for errors
