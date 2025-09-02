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

## Notes
- This add-on does **not** store your seed in `MM2.json`. Use the integration service to import a seed only when needed.
- If `/usr/local/bin/kdf` is not present in the upstream image, adjust the Dockerfile COPY path accordingly.
