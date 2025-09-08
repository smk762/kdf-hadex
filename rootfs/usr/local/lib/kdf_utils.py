#!/usr/bin/env python3
"""Shared KDF utilities for panel-server and HA integration."""
import os
import json
from typing import Any, Dict, Optional
import logging

LOG = logging.getLogger("kdf_utils")
logging.basicConfig(level=logging.DEBUG, format='[%(asctime)s] [kdf_utils] %(message)s')

class KdfCoin:
    def __init__(self, ticker: str):
        self.ticker = ticker
        self.usd_price = 0
        self.balance = 0
        self.parent = ""
        self.type = ""
        self.activation_method = self._get_activation_method()
        self.address = ""
        self.status = ""

    def _get_activation_method(self) -> str:
        if self.type == "UTXO":
            return "enable_btc"


class KdfMethod:
    def __init__(
        self,
        payload: Dict[str, Any],
        method_versions: Optional[Dict[str, str]] = None,
        legacy_methods: Optional[set] = None,
        method_timeouts: Optional[Dict[str, int]] = None,
        activation_methods: Optional[set] = None,
        get_ttl_fn: Optional[callable] = None,
    ):
        self.name = payload.get('method')
        self.payload = payload
        self.method_versions = method_versions or {}
        self.legacy_methods = legacy_methods or set()
        self.method_timeouts = method_timeouts or {}
        self.activation_methods = activation_methods or set()

        self.version = "v2" if "mmrpc" in payload else "v1"
        mv = self.method_versions.get(self.name)
        if mv == 'legacy' or mv == 'v1':
            self.is_legacy = True
        elif mv == 'v2':
            self.is_legacy = False
        else:
            self.is_legacy = self.name in self.legacy_methods

        self.params = payload.get('params', {}) if isinstance(payload.get('params', {}), dict) else {}
        self.timeout = int(self.method_timeouts.get(self.name, 30))
        if self.name in self.activation_methods:
            self.timeout = max(self.timeout, 300)
            self.is_activation = True
        else:
            self.is_activation = False

        self.cache_key = self._get_cache_key()
        if get_ttl_fn:
            try:
                self.cache_ttl = int(get_ttl_fn(self.cache_key, 30))
            except Exception:
                self.cache_ttl = 30
        else:
            self.cache_ttl = 30

    def _get_cache_key(self) -> str:
        try:
            if self.params:
                params_s = json.dumps(self.params, sort_keys=True)
                return f"{self.name}:{params_s}"
        except Exception:
            pass
        return self.name

    def as_payload(self, rpc_password: Optional[str] = None) -> Dict[str, Any]:
        """Return a JSON-RPC payload dict ready to POST to KDF.

        This will respect legacy/v2 formatting and special-case known methods.
        """
        if self.is_legacy:
            payload = {'method': self.name}
            if isinstance(self.params, dict):
                for k, v in self.params.items():
                    payload[k] = v
        else:
            if self.name == 'get_enabled_coins':
                payload = {'method': self.name, 'mmrpc': '2.0'}
            else:
                payload = {'method': self.name, 'mmrpc': '2.0', 'params': self.params or {}}

        if rpc_password:
            payload['userpass'] = rpc_password
        return payload


# Shared constants
SUPPORTED_COINS = [
    "BTC",
    "ETH",
    "LTC",
    "BCH",
    "DOGE",
    "DGB",
    "KMD",
    "MATIC",
    "AVAX",
    "ATOM",
    "BNB",
]

METHOD_TIMEOUTS = {
    'get_enabled_coins': 60,
}

ACTIVATION_METHODS = set([
    'task::enable_eth::init',
    'task::enable_qtum::init',
    'task::enable_utxo::init',
    'task::enable_tendermint::init',
    'task::enable_z_coin::init'
])

LEGACY_METHODS = set(['version', 'my_orders', 'buy', 'sell', 'setprice', 'cancel_order', 'cancel_all_orders', 'get_directly_connected_peers'])


COINS_CONFIG_URL = 'https://raw.githubusercontent.com/KomodoPlatform/coins/master/utils/coins_config.json'
COINS_CONFIG_PATH = '/data/coins_config.json'
COINS_FILE_URL = 'https://raw.githubusercontent.com/KomodoPlatform/coins/master/coins'
COINS_FILE_PATH = '/root/.kdf/coins'


def load_local_coins_config() -> Dict[str, Any]:
    """Load and normalize the canonical coins_config.json.

    This prefers the authoritative `COINS_CONFIG_PATH` (/data/coins_config.json).
    The older `coins` file is not considered authoritative for protocol metadata
    (nodes, rpc_urls, swap contracts), so we intentionally do not read `COINS_FILE_PATH` here.
    """
    # Cache the loaded coins_config for the process lifetime (loaded once on first call)
    global _COINS_CONFIG_CACHE
    try:
        if _COINS_CONFIG_CACHE is not None:
            return _COINS_CONFIG_CACHE
    except NameError:
        _COINS_CONFIG_CACHE = None

    # Try the authoritative coins_config locations only
    try:
        if os.path.exists(COINS_CONFIG_PATH):
            with open(COINS_CONFIG_PATH, 'r') as f:
                j = json.load(f)
                # Log counts before/after filtering
                try:
                    if isinstance(j, dict):
                        orig_count = len(j.keys())
                    elif isinstance(j, list):
                        orig_count = len(j)
                    else:
                        orig_count = 0
                except Exception:
                    orig_count = 0
                # Sanitize and normalize
                sanitized = _sanitize_coins_config(j)
                try:
                    sanitized_count = len(sanitized.keys())
                except Exception:
                    sanitized_count = 0
                LOG.info(f'coins_config loaded: original_count={orig_count} sanitized_count={sanitized_count}')
                _COINS_CONFIG_CACHE = sanitized
                return sanitized
    except Exception as e:
        LOG.info(f'error in load_local_coins_config (load_local_coins_config): {e}')
    _COINS_CONFIG_CACHE = {}
    return {}


def _sanitize_coins_config(raw: Any) -> Dict[str, Any]:
    """Sanitize coins_config data.

    - Remove coins with `delisted: true`.
    - Only keep coins whose protocol.type is one of ['ETH','TENDERMINT','UTXO'].
    - Remove node/electrum/rpc entries that contain websocket URLs (keys 'ws_url' or values starting with 'wss://').
    - Remove electrum entries whose 'protocol' field equals 'WSS' or 'TCP'.
    Returns a mapping keyed by uppercase ticker.
    """
    allowed = {'ETH', 'TENDERMINT', 'UTXO'}
    out: Dict[str, Any] = {}
    try:
        entries: list
        if isinstance(raw, dict):
            # raw mapping
            entries = []
            for k, v in raw.items():
                if isinstance(v, dict):
                    v = dict(v)
                    v.setdefault('coin', k)
                entries.append(v)
        elif isinstance(raw, list):
            entries = raw
        else:
            return {}

        for entry in entries:
            if not isinstance(entry, dict):
                continue
            # skip delisted
            if entry.get('delisted') is True:
                continue

            # determine ticker key
            ticker = (entry.get('coin') or entry.get('ticker') or entry.get('symbol') or entry.get('name'))
            if not ticker:
                continue
            t = str(ticker).upper()

            # protocol type
            prot = entry.get('protocol') or {}
            ptype = None
            if isinstance(prot, dict):
                ptype = prot.get('type')
            # fallback to top-level type
            if not ptype:
                ptype = entry.get('type')
            if not ptype:
                # unknown, skip
                continue
            ptype_u = str(ptype).upper()
            if ptype_u not in allowed:
                continue

            # sanitize nodes/rpc_urls: drop any node that has 'ws_url' key or any string value starting with 'wss://'
            def _clean_nodes(lst):
                out_nodes = []
                if not isinstance(lst, list):
                    return out_nodes
                for n in lst:
                    if not isinstance(n, dict):
                        continue
                    # drop if ws_url present
                    if 'ws_url' in n:
                        continue
                    skip = False
                    for v in n.values():
                        try:
                            if isinstance(v, str) and v.strip().lower().startswith('wss://'):
                                skip = True
                                break
                        except Exception:
                            continue
                    if skip:
                        continue
                    out_nodes.append(n)
                return out_nodes

            # clean electrum servers
            if 'electrum' in entry and isinstance(entry.get('electrum'), list):
                cleaned = []
                for e in entry.get('electrum'):
                    if not isinstance(e, dict):
                        continue
                    proto = e.get('protocol')
                    if isinstance(proto, str) and proto.upper() in ('WSS', 'TCP'):
                        # drop
                        continue
                    # drop entries that include any wss:// in values
                    bad = False
                    for v in e.values():
                        if isinstance(v, str) and v.strip().lower().startswith('wss://'):
                            bad = True
                            break
                    if bad:
                        continue
                    cleaned.append(e)
                entry['electrum'] = cleaned

            # clean nodes/rpc_urls
            if 'nodes' in entry:
                entry['nodes'] = _clean_nodes(entry.get('nodes'))
            if 'rpc_urls' in entry:
                entry['rpc_urls'] = _clean_nodes(entry.get('rpc_urls'))

            # Also ensure 'protocol.protocol_data' nodes/rpc entries are cleaned
            try:
                pd = None
                if isinstance(prot, dict):
                    pd = prot.get('protocol_data') or prot.get('protocolData')
                if isinstance(pd, dict):
                    if 'nodes' in pd:
                        pd['nodes'] = _clean_nodes(pd.get('nodes'))
                    if 'rpc_urls' in pd:
                        pd['rpc_urls'] = _clean_nodes(pd.get('rpc_urls'))
                    # attach back
                    prot['protocol_data'] = pd
                    entry['protocol'] = prot
            except Exception:
                pass

            out[t] = entry
        return out
    except Exception:
        return {}


def ensure_coins_config() -> Dict[str, Any]:
    """Always fetch canonical coins_config.json and write to local path.

    On success returns parsed dict and updates in-memory cache. On failure,
    falls back to any existing local copy.
    """
    try:
        import requests
        r = requests.get(COINS_CONFIG_URL, timeout=10)
        r.raise_for_status()
        try:
            j = r.json()
        except Exception:
            j = json.loads(r.text)
        # compute original count
        try:
            if isinstance(j, dict):
                orig_count = len(j.keys())
            elif isinstance(j, list):
                orig_count = len(j)
            else:
                orig_count = 0
        except Exception:
            orig_count = 0

        # Sanitize before writing to disk so the app never persists websocket entries
        sanitized = _sanitize_coins_config(j)
        try:
            sanitized_count = len(sanitized.keys())
        except Exception:
            sanitized_count = 0
        LOG.info(f'ensure_coins_config: fetched coins_config (original_count={orig_count} sanitized_count={sanitized_count})')

        # write sanitized mapping to path
        try:
            with open(COINS_CONFIG_PATH, 'w') as f:
                json.dump(sanitized)
        except Exception:
            pass

        # update cache
        try:
            global _COINS_CONFIG_CACHE
            _COINS_CONFIG_CACHE = sanitized
        except Exception:
            pass
        return sanitized
    except Exception as e:
        LOG.info(f'ensure_coins_config fetch failed: {e}')
        # fallback to local copy
        return load_local_coins_config()


def ensure_coins_file(url: str = COINS_FILE_URL, path: str = COINS_FILE_PATH) -> bool:
    """Fetch upstream `coins` file and write to runtime path used by KDF (~/.kdf/coins).

    Returns True on success, False otherwise.
    """
    try:
        import requests
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(resp.content)
        try:
            os.chmod(path, 0o644)
        except Exception:
            pass
        return True
    except Exception as e:
        LOG.info(f'ensure_coins_file failed: {e}')
        return False


def get_coin_protocol_type(ticker: str) -> Optional[str]:
    """Return the protocol.type for a ticker from coins config, if known."""
    cfg = load_local_coins_config()
    t = ticker.upper()
    # direct key
    if t in cfg and isinstance(cfg[t], dict):
        prot = cfg[t].get('protocol') or {}
        LOG.info(f'PROTOCOL: {prot}')
        return prot.get('type') if isinstance(prot, dict) else None
    # search entries by 'ticker' or 'symbol' or 'coin'
    for key, val in cfg.items():
        if not isinstance(val, dict):
            continue
        if val.get('ticker') == t or val.get('symbol') == t or val.get('coin') == t:
            prot = val.get('protocol') or {}
            return prot.get('type') if isinstance(prot, dict) else None
    return None


def get_coin_protocol(ticker: str) -> (Optional[str], Optional[Dict[str, Any]]):
    """Return a tuple (protocol_type, protocol_data) for a ticker from the coins config.

    protocol_type is a short string such as 'UTXO', 'ETH', 'TENDERMINT', etc.
    protocol_data is the protocol-specific dict (may contain chain_id, decimals, denom, etc.)
    """
    LOG.info(f'get_coin_protocol: {ticker}')
    try:
        cfg = load_local_coins_config()
        entry = cfg.get(ticker) or cfg.get(ticker.upper()) or cfg.get(ticker.lower())
        if isinstance(entry, dict):
            prot = entry.get('protocol') or {}
            if isinstance(prot, dict):
                ptype = prot.get('type')
                pdata = prot.get('protocol_data') or prot.get('protocolData') or {}
                # Merge useful top-level fields into protocol_data for activation helpers
                try:
                    
                    if 'nodes' in entry and isinstance(entry.get('nodes'), list):
                        # EVM coins
                        pdata.setdefault('nodes', entry.get('nodes'))

                    if 'electrum' in entry and isinstance(entry.get('electrum'), list):
                        # Electrum coins
                        pdata.setdefault('electrum', entry.get('electrum'))

                    if 'rpc_urls' in entry and isinstance(entry.get('rpc_urls'), list):
                        # Tendermint coins
                        pdata.setdefault('rpc_urls', entry.get('rpc_urls'))

                    # swap contract addresses for ETH-like
                    if 'swap_contract_address' in entry:
                        pdata.setdefault('swap_contract_address', entry.get('swap_contract_address'))
                    if 'fallback_swap_contract' in entry:
                        pdata.setdefault('fallback_swap_contract', entry.get('fallback_swap_contract'))
                except Exception as e:
                    LOG.info(f'error in get_coin_protocol (get_coin_protocol: server scan) {e}')
                    LOG.info(f'ticker: {ticker}')
                return ptype, pdata
        LOG.info(f'Entry not dict: {type(entry)}')
        return None, None
    except Exception as e:
        LOG.info(f'error in get_coin_protocol (get_coin_protocol): {e}')
        LOG.info(f'ticker: {ticker}')
        return None, None


# Cached KDF version: fetched once on first successful request and retained until process restart
_KDF_VERSION: Optional[str] = None


def get_kdf_version() -> str:
    """Return the KDF version string.

    This performs a single RPC request to the local KDF HTTP RPC and caches
    the returned value in-process. Once a successful response is obtained the
    value persists until the process restarts.
    """
    global _KDF_VERSION
    if _KDF_VERSION:
        return _KDF_VERSION

    opts_path = '/data/options.json'
    rpc_port = '7783'
    rpc_password = ''
    try:
        if os.path.exists(opts_path):
            with open(opts_path, 'r') as f:
                j = json.load(f) or {}
                rpc_port = str(j.get('rpc_port', rpc_port))
                rpc_password = j.get('rpc_password', rpc_password)
    except Exception:
        pass

    try:
        import requests
        url = f'http://127.0.0.1:{rpc_port}/'
        payload = {'method': 'version'}
        if rpc_password:
            payload['userpass'] = rpc_password
        resp = requests.post(url, json=payload, timeout=5)
        resp.raise_for_status()
        try:
            j = resp.json()
            if isinstance(j, dict) and 'result' in j:
                ver = j.get('result')
            elif isinstance(j, str):
                ver = j
            else:
                ver = str(j)
        except Exception:
            ver = resp.text or 'unknown'
        _KDF_VERSION = str(ver)
        return _KDF_VERSION
    except Exception:
        return 'unknown'


