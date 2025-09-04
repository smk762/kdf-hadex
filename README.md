# KDF Add-on

Runs the Komodo DeFi Framework (kdf) inside Home Assistant as an add-on.

## Configuration

### Options
- `rpc_password` – RPC authentication password (8-32 chars, 1+ each: numeric, uppercase, lowercase, special char)
- `rpc_port` – default 7783
- `netid` – network ID (e.g., 8762)
- `coins_url` – optional URL to fetch coins.json on each start
- `log_level` – log verbosity (info|debug|warning|error)
- `wallet_name` - name of the wallet
- `wallet_password` – wallet encryption password (8-32 chars, 1+ each: numeric, uppercase, lowercase, special char)
- `bip39_mnemonic` – wallet seed phrase (12 or 24 words)
- `haos_ip` – IP address for RPC binding (default: 0.0.0.0)
- `enable_dashboard` – enable the Home Assistant integration (default: true)
- `seednodes` – array of seed node addresses

### Password Requirements
- Passwords must be 8-32 characters with at least one of each:
  * Numeric (0-9)
  * Uppercase (A-Z) 
  * Lowercase (a-z)
  * Special character (!#*+ etc. - avoid $ for shell compatibility)
- No 3+ consecutive identical characters
- Cannot contain "password", "<", ">", "&", or "$"

## Volumes
- `/data` – persists `MM2.json`, DB, and logs
- `/share/kdf/coins.json` – optional local coins file

## Checking KDF Version

The KDF version is displayed in the add-on logs during startup. You can also check it manually:

### From Home Assistant:
1. Go to **Supervisor** → **Add-ons** → **KDF** → **Logs**
2. Look for the line: `[kdf] KDF Version: 2.5.1-beta_b891ed6...`

### From Command Line:
```bash
# Check version via RPC (when KDF is running)
docker exec local_kdf /usr/local/bin/kdf-version

# Check version via binary
docker exec local_kdf /usr/local/bin/kdf --version

# Check version file
docker exec local_kdf cat /data/kdf_version.txt
```

### Via RPC API:
```bash
curl --url "http://127.0.0.1:7783" --data '{
  "method": "version",
  "userpass": "your_rpc_password"
}'
```

## Home Assistant Integration

This add-on provides native Home Assistant integration using the [pykomodefi](https://pypi.org/project/pykomodefi/) library to expose KDF data as Home Assistant entities.

### Integration Configuration

The KDF Home Assistant integration can be enabled/disabled via the add-on configuration:

1. **Enable HA Integration**: Toggle the "Enable HA Integration" option in the add-on configuration
2. **Default**: Integration is enabled by default

### Home Assistant Entities

When enabled, the add-on creates the following Home Assistant entities:

- **`sensor.kdf_status`** - KDF connection status, version, and peer count
- **`sensor.kdf_best_orders`** - Best buy/sell orders from the network
- **`sensor.kdf_active_swaps`** - Currently active atomic swaps
- **`sensor.kdf_my_orders`** - Your active orders
- **`sensor.kdf_recent_swaps`** - Recent swap history

### Panel Server & Frontend

The add-on includes a lightweight panel server that the frontend cards use for authenticated RPC access. Frontend cards and the dashboard should point to the panel API base (`panel_api_base`) rather than embedding RPC credentials.

- **Panel API base**: When configuring cards or the demo panel, set `panel_api_base` to the panel root (default `/`). The panel server proxies authenticated RPC calls to KDF and provides the following endpoints:
  - `GET /api/status` - connection, version, peers
  - `GET /api/data` - trading summary (active swaps, my orders, recent swaps)
  - `GET /api/peers` - cleaned peer list
  - `POST /api/orderbook` - orderbook (params: `{params:{base,rel}}`)
  - `POST /api/best_orders` - best orders (params: `{params:{coin,action,request_by}}`)
  - `POST /api/action` - generic RPC action forwarder (method + params)

Do NOT store `rpc_password` in card configs; rely on the panel server to perform authenticated calls.

### Caching / Refresh Configuration

The panel server supports configurable cache/TTL settings. Create `/data/panel_cache_config.json` in the add-on data directory to override defaults. Example format:

```json
{
  "best_orders": 30,
  "orderbook": 10,
  "peers": 60
}
```

If the file is missing the server falls back to sensible defaults.

## Exchange Rates (recommended integration)

This add-on no longer ships its own exchange‑rate sensors. Instead it **integrates with Home Assistant's official Open Exchange Rates integration**. This reduces duplication and leverages the well‑maintained HA integration.

What to do:

1. Obtain an OpenExchangeRates API key: `https://openexchangerates.org`
2. Install the **Open Exchange Rates** integration in Home Assistant: Settings → Devices & Services → Add Integration → "Open Exchange Rates". Enter your API key.
3. Enable the fiat currencies you want to use in the integration's sensor options.

How the add-on uses it:

- The add‑on will detect available fiat sensors provided by the Open Exchange Rates integration and write a small manifest to `/data/available_fiats.json`.
- The add‑on UI will read `/api/available_fiats` (panel server proxy) and populate a fiat selection dropdown in the add‑on settings.
- If the Open Exchange Rates integration is not installed, the add‑on will gracefully fall back and display `N/A` where fiat values would otherwise be shown, and provide instructions to install the integration.

Security and notes:

- Installing the official integration is the recommended, privacy‑aware approach. The add‑on will not auto‑install anything into your Home Assistant configuration; installation is always opt‑in.
- If you prefer not to install the integration, the add‑on continues to work but fiat fields will show `N/A`.

### Features

- **Real-time Orderbooks**: Live orderbook data for all supported cryptocurrencies
- **Multi-coin Support**: USD, LTC, BNB, BTC, ETH, AVAX, ATOM, MATIC, KMD, DOGE, DGB
- **Responsive Design**: Works on desktop and mobile devices
- **Auto-refresh**: Configurable refresh intervals
- **Modern UI**: Clean, professional trading interface

### Adding to Home Assistant Sidebar

1. Copy the panel file to your Home Assistant `www` directory:
   ```bash
   cp rootfs/www/kdf-panel.js /config/www/
   ```

2. Add the panel resource in Lovelace configuration:
   - Go to **Configuration** → **Lovelace Dashboards** → **Resources**
   - Click **+ Add Resource**
   - Set URL to: `/local/kdf-panel.js`
   - Set Resource type to: **JavaScript Module**

3. The "KDF Trading" panel will appear in your Home Assistant sidebar

### Lovelace Cards (Optional)

For users who prefer individual cards in their dashboards, custom Lovelace cards are also available:

1. Run the installation script:
   ```bash
   ./install-cards.sh
   ```

2. Add the card resource and use in your dashboards (see `rootfs/www/README.md` for details)

## Notes
- This add-on does **not** store your seed in `MM2.json`. Use the integration service to import a seed only when needed.
- If `/usr/local/bin/kdf` is not present in the upstream image, adjust the Dockerfile COPY path accordingly.


## Optional features:

For exchange rates, this add-on relies on Home Assistant's official Open Exchange Rates integration. See the "Exchange Rates (recommended integration)" section above for details.