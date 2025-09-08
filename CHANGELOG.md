## 0.1.4 - 2025-09-07

- Fix: Stop autogenerating `wallet_password`; require it in add-on options to avoid HMAC decryption errors on startup.
- Feat: Centralise KDF `version` retrieval via `kdf_utils.get_kdf_version()` and cache the value for the process lifetime to avoid repeated RPC calls.
- Refactor: Updated `panel-server` and `kdf-ha-integration` to use the shared cached version helper.

## 0.1.3 - 2025-09-06

- Initial release.

# Changelog

## 0.1.2
- Initial release: HAOS add-on skeleton for KDF (mm2)
- Copies `mm2` from upstream image, creates `mm2.json`, and starts service via s6
- Supports optional `coins.json` from URL or /share

## 0.1.3
- Switch to FastAPI panel server and single `POST /api/kdf_request` forwarder
- Added `kdf_utils.py` shared utilities and `KdfMethod` for payload/version handling
- Implemented in-memory caching for common read RPCs and Coingecko price caching
- New settings panel UI (`/kdf-settings.html`) to manage addon options and `no_login` toggle
- `no_login` mode: allows unauthenticated read-only calls (orderbook, best_orders, peers, version)
- Mnemonic management: import/export (encrypted/plaintext), change wallet password, delete wallet with backup
- Autosync: change password and delete wallet update `/data/options.json` automatically
- Plaintext mnemonic export rate-limited (5 minutes) to reduce accidental exposure
- Init-time auto-generation of secure `rpc_password` and `wallet_password` when missing
- Dashboard UI updates: show login state (`No-login mode` or `Logged into {wallet_name}`) and new settings link
- Use KDF `stop` RPC for graceful restart when applying login settings (pkill fallback)