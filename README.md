# KDF Add-on

Runs the Komodo DeFi Framework (kdf) inside Home Assistant as an add-on.

## Configuration

<div style="background:#fff2f2;border-left:6px solid #d93025;padding:12px;margin-bottom:12px;">
<strong style="color:#b00000;font-size:1.05em">⚠️ Required configuration (must be set before starting the add-on)</strong>
<ul style="margin-top:8px;color:#660000">
  <li><strong>rpc_password</strong> – RPC authentication password (cannot be empty or the default <code>CHANGE_ME</code>)</li>
  <li><strong>wallet_password</strong> – wallet encryption password (cannot be empty or the default <code>CHANGE_ME</code>)</li>
</ul>
<p style="margin-top:8px;color:#660000">If you want to import an existing seed, enable <code>import_mnemonic</code> in the add-on configuration and set <code>bip39_mnemonic</code>. If <code>import_mnemonic</code> is <code>false</code> (the default), the add-on/KDF will generate a new mnemonic and encrypt it with <code>wallet_password</code> on first start.</p>
Please ensure these values are set in the add-on configuration before clicking <em>Start</em>. The add-on will refuse to start if any required fields are missing or left at insecure defaults.
</div>

### Options
- `rpc_password` – RPC authentication password (8-32 chars, 1+ each: numeric, uppercase, lowercase, special char)
- `rpc_port` – default 7783
- `netid` – network ID (e.g., 8762)
- `coins_url` – optional URL to fetch coins.json on each start
- `log_level` – log verbosity (info|debug|warning|error)
- `wallet_name` - name of the wallet
- `wallet_password` – wallet encryption password (8-32 chars, 1+ each: numeric, uppercase, lowercase, special char)
- `bip39_mnemonic` – wallet seed phrase (12 or 24 words)
- `kdf_rpcip` – IP address for RPC binding (default: 0.0.0.0)
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

## Login & Mnemonic Flow (updated)

The add-on now provides a guided mnemonic import/export and secure login flow. Key points:

- **Fixed wallet name**: The wallet used by the add-on is `HAOS KDF Wallet` (read-only) to simplify onboarding and avoid multi-wallet management.
- **Import mnemonic**: If you want to use an existing seed, enable `import_mnemonic` in the add-on configuration and set `bip39_mnemonic`. If `import_mnemonic` is false, KDF will generate a new mnemonic and encrypt it using `wallet_password`.
- **Export mnemonic**:
  - Use the panel UI (Mnemonic & Wallet) to export the mnemonic.
  - Two formats supported: `encrypted` (recommended) and `plaintext`. Plaintext export requires entering the `wallet_password` and is rate-limited to once per 5 minutes to reduce accidental disclosure.
- **Change wallet password**: The panel can call KDF to change the mnemonic encryption password. When successful, the add-on will automatically update `wallet_password` in the add-on options so MM2.json and the add-on options remain in sync.
- **Delete wallet**: The panel supports deleting the static wallet. You must confirm with the wallet password. A "Backup wallet" button allows exporting the encrypted mnemonic before deletion. On successful deletion the addon will clear the imported mnemonic and set `import_mnemonic=false`.

Security recommendations:

- Always use the encrypted export (`encrypted`) for backups — keep it offline and protected.
- Avoid using plaintext export except for one-time recovery; do not paste the mnemonic into untrusted applications.
- Rotate passwords and store backups in secure storage.

API references (Komodo docs):

- `get_mnemonic`: https://dev.komodo-docs.pages.dev/en/docs/komodo-defi-framework/api/v20/utils/get_mnemonic/
- `change_mnemonic_password`: https://dev.komodo-docs.pages.dev/en/docs/komodo-defi-framework/api/v20/utils/change_mnemonic_password/
- `delete_wallet`: https://dev.komodo-docs.pages.dev/en/docs/komodo-defi-framework/api/v20/wallet/delete_wallet/

## Volumes
- `/data` – persists `MM2.json`, DB, and logs

## Checking KDF Version

The KDF version is displayed in the add-on logs during startup and is also exposed via the panel server API. The panel server caches the version value on first successful retrieval and will return the same value until the panel process restarts.

### From Home Assistant / Add-on UI:
1. Go to **Supervisor** → **Add-ons** → **KDF** → **Logs**
2. Look for a startup line that includes the KDF version (e.g. `[kdf] Komodo DeFi Framework 2.5.1-beta_...`).

### From the Panel API (recommended):
Use the panel server endpoint which does not require exposing RPC credentials to cards:
```bash
# Query the panel server for the cached KDF version
curl --url "http://127.0.0.1:8099/api/version"
```

### From Command Line (binary):
Only available if the upstream image provides the `kdf` binary:
```bash
# Check version via binary inside the running container
docker exec local_kdf /usr/local/bin/kdf --version
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
  - `GET /api/version` - KDF version
  - `GET /api/peers` - cleaned peer list
  - `GET /api/tickers` - available tickers
  - `GET /api/available_fiats` - detected fiat sensors

For authenticated RPC methods use a single forwarder:

- `POST /api/kdf_request` — send a raw JSON RPC request body (e.g. `{ "method": "orderbook", "params": { "base": "BTC", "rel": "LTC" } }`). The panel server injects `userpass` from `/data/options.json` if missing. Methods other than `version` require `rpc_password` in `options.json`.

Do NOT store `rpc_password` in card configs; the panel server injects it from `options.json` when forwarding requests.

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



## Creating Home Assistant entities from the Panel API

If you want Home Assistant entities for monitoring or automations, create `REST` and `template` sensors that query the panel server's API. The add-on purposely does not create Supervisor entities to minimise privileges.

Example `configuration.yaml` snippets (replace `panel_api_base` if you changed it):

```yaml
# REST sensor to fetch status from the panel server
sensor:
  - platform: rest
    name: hadex_status_raw
    resource: http://127.0.0.1:8099/api/status
    method: GET
    scan_interval: 30
    value_template: "{{ value_json.status }}"
    json_attributes_path: "$."
    json_attributes: 
      - version
      - peer_count
      - enabled_coins

# Template sensor that exposes the selected fiat (from options.json via panel)
  - platform: rest
    name: hadex_options_raw
    resource: http://127.0.0.1:8099/api/options
    method: GET
    scan_interval: 60
    value_template: "{{ (value_json.options.selected_fiat_currency) | default('N/A') }}"

# Friendly template sensors
template:
  - sensor:
      - name: "HADEX Status"
        state: "{{ states('sensor.hadex_status_raw') }}"
        attributes:
          version: "{{ state_attr('sensor.hadex_status_raw','version') }}"
          peer_count: "{{ state_attr('sensor.hadex_status_raw','peer_count') }}"
          enabled_coins: "{{ state_attr('sensor.hadex_status_raw','enabled_coins') }}"

      - name: "HADEX Selected Fiat"
        state: "{{ states('sensor.hadex_options_raw') }}"
        attributes:
          info: "Selected fiat from addon options"
```

Notes:
- Use the panel server base (`http://127.0.0.1:8099` inside the add-on container). When accessing from Home Assistant, replace with the add‑on ingress path or the add‑on host IP as appropriate.
- The `hadex_status_raw` REST sensor stores the full JSON in attributes (version, peer_count, enabled_coins). Use `template` sensors to expose friendly attributes.
