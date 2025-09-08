#!/opt/kdf-venv/bin/python3
"""
KDF Panel Server (FastAPI)

Serves static UI from /root/www and exposes REST API endpoints that proxy
authenticated KDF RPC calls. Configuration is read from /data/options.json.
"""
import os
import sys
import json
import time
import logging
import requests
from typing import Any, Dict, Optional
from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

# Use shared utilities (ensure /usr/local/lib is on sys.path)
sys.path.insert(0, '/usr/local/lib')

from kdf_utils import get_coin_protocol, get_kdf_version, KdfMethod, SUPPORTED_COINS, METHOD_TIMEOUTS, ACTIVATION_METHODS, LEGACY_METHODS, ensure_coins_config, ensure_coins_file, load_local_coins_config
from contextlib import asynccontextmanager
import asyncio


LOG = logging.getLogger("panel-server")
logging.basicConfig(level=logging.DEBUG, format='[%(asctime)s] [panel-server] %(message)s')

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan handler: wait for KDF RPC readiness, then start background workers and prune stores."""
    LOG.info('panel-server lifespan startup: waiting for KDF RPC readiness')
    # Wait for KDF RPC to become available (shorter, bounded wait)
    max_retries = 30
    kdf_ready = False
    # Attempt to fetch and cache KDF version once; rely on shared helper to cache the value
    # Ensure coins config and runtime coins file are present before activation attempts
    try:
        try:
            ensure_coins_config()
            LOG.info('coins_config ensured at startup')
        except Exception as e:
            LOG.info(f'ensure_coins_config failed at startup: {e}')
        try:
            ensure_coins_file()
            LOG.info('coins runtime file ensured at startup')
        except Exception as e:
            LOG.info(f'ensure_coins_file failed at startup: {e}')
    except Exception:
        pass

    for i in range(max_retries):
        try:
            ver = get_kdf_version()
            if ver and ver != 'unknown':
                kdf_ready = True
                LOG.info(f'KDF RPC available (version={ver})')
                break
        except Exception:
            LOG.debug(f'KDF RPC not ready, retry {i+1}/{max_retries}')
        await asyncio.sleep(3)

    # Start activation worker thread (will no-op activations until RPC is ready)
    try:
        import threading
        t = threading.Thread(target=activation_worker_loop, daemon=True)
        t.start()
    except Exception:
        LOG.exception('failed to start activation worker')

    # If KDF is ready, prune activation store based on enabled coins
    if kdf_ready:
        try:
            enabled_resp = call_kdf_rpc('get_enabled_coins') or {}
            enabled = []
            if isinstance(enabled_resp, dict) and 'result' in enabled_resp:
                enabled_resp = enabled_resp['result']
            if isinstance(enabled_resp, list):
                for c in enabled_resp:
                    if isinstance(c, dict):
                        t = c.get('ticker') or c.get('coin')
                        if t:
                            enabled.append(t.upper())
                    elif isinstance(c, str):
                        enabled.append(c.upper())
            store = load_activation_store()
            new_store = {k: v for k, v in store.items() if k.upper() in enabled}
            save_activation_store(new_store)
        except Exception:
            LOG.exception('failed to prune activation store on startup')

    # Save OpenAPI schema to disk for the static UI to consume
    try:
        try:
            schema = app.openapi()
            out_path = '/root/www/openapi.json'
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, 'w') as f:
                json.dump(schema, f, indent=2)
            LOG.info(f'Wrote OpenAPI schema to {out_path}')
        except Exception as e:
            LOG.exception(f'failed to write OpenAPI schema: {e}')
    except Exception:
        # non-fatal: do not prevent server startup
        pass

    yield

    # shutdown cleanup (none needed)

# openapi_url is the path to the OpenAPI schema. With Hassio ingress, we need to prefix the path with the token. Need to find a way to keep this fresh.
app = FastAPI(title="KDF Panel Server", lifespan=lifespan, openapi_url='/api/hassio_ingress/4x6ZqMyCf0XX8UUMqzn5xFiJxe7FesRJDpSjJLS4c0E/openapi.json')


@app.middleware("http")
async def log_requests_middleware(request: Request, call_next):
    LOG.info(f"HTTP request -> method={request.method} path={request.url.path} client={request.client}")
    try:
        resp = await call_next(request)
        LOG.info(f"HTTP response <- path={request.url.path} status={resp.status_code}")
        return resp
    except Exception as e:
        LOG.exception(f"Unhandled exception while handling request {request.method} {request.url.path}")
        raise

# Simple in-memory cache
_CACHE: Dict[str, Dict[str, Any]] = {}

# Rate limiting state for sensitive operations
# Allow plaintext mnemonic export at most once per PLAINTEXT_EXPORT_WINDOW seconds
PLAINTEXT_EXPORT_WINDOW = 300  # seconds
_PLAINTEXT_EXPORT_STATE = { 'last_ts': 0 }

METHOD_TIMEOUTS = {
    'get_enabled_coins': 60,
}

# These methods require a longer timeout as first activation in HD mode can take a while
ACTIVATION_METHODS = set([
    'task::enable_eth::init',
    'task::enable_qtum::init',
    'task::enable_utxo::init',
    'task::enable_tendermint::init',
    'task::enable_z_coin::init'
])



def cache_get_or_fetch(key: str, ttl: int, fetch_fn):
    now = time.time()
    entry = _CACHE.get(key)
    if entry and (now - entry.get('ts', 0) < ttl):
        return entry.get('val')
    val = fetch_fn()
    _CACHE[key] = {'val': val, 'ts': now}
    return val

def cache_set(key: str, val: Any):
    _CACHE[key] = {'val': val, 'ts': time.time()}
    return val



def normalize_activation_result(init_method: str, resp: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize activation status response across protocols into common shape.
    Returns: { ticker, status, block_height, addresses: [...], balances: {...} }
    """
    out = {'ticker': None, 'status': None, 'block_height': None, 'addresses': [], 'balances': {}}
    try:
        if not isinstance(resp, dict):
            return out
        j = resp.get('result') if isinstance(resp.get('result'), dict) else resp
        # status
        status = j.get('status') or (j.get('result') and j.get('result').get('status'))
        if status:
            out['status'] = status

        details = None
        if isinstance(j.get('details'), dict):
            details = j.get('details')
        elif isinstance(j.get('result'), dict) and isinstance(j.get('result').get('details'), dict):
            details = j.get('result').get('details')
        elif isinstance(j.get('result'), dict):
            details = j.get('result')

        if details and isinstance(details, dict):
            out['ticker'] = details.get('ticker') or details.get('coin')
            # block/current_block
            out['block_height'] = details.get('current_block') or details.get('block') or details.get('block_height')

            # UTXO style: wallet_balance/accounts/addresses
            wb = details.get('wallet_balance')
            if isinstance(wb, dict):
                # try to extract addresses under accounts -> addresses
                accs = wb.get('accounts') or []
                for a in accs:
                    addrs = a.get('addresses') or []
                    for addr in addrs:
                        if isinstance(addr, dict) and addr.get('address'):
                            out['addresses'].append(addr.get('address'))
                # balances: try to flatten
                if isinstance(wb.get('accounts'), list) and len(wb.get('accounts'))>0:
                    try:
                        out['balances'] = wb.get('accounts')[0].get('total_balance') or {}
                    except Exception:
                        out['balances'] = {}

            # ETH style: details may include wallet_balance/accounts/... similar to above
            if not out['addresses'] and details.get('address'):
                out['addresses'].append(details.get('address'))

            # balances for tendermint/eth single account
            if not out['balances'] and isinstance(details.get('balance'), dict):
                out['balances'] = details.get('balance')

        return out
    except Exception:
        return out


def load_addon_options() -> Dict[str, Any]:
    path = '/data/options.json'
    try:
        if os.path.exists(path):
            with open(path, 'r') as f:
                return json.load(f)
    except Exception as e:
        LOG.warning(f"failed to read options.json: {e}")
    return {}


def load_cache_config() -> Dict[str, int]:
    defaults = {
        'tickers': 3600,
        'enabled_coins': 60,
        'peers': 60,
        'best_orders': 30,
        'orderbook': 10,
        'active_swaps': 30,
        'my_orders': 60,
        'recent_swaps': 60,
        'coingecko_prices': 300
    }
    cfg_path = '/data/panel_cache_config.json'
    try:
        if os.path.exists(cfg_path):
            with open(cfg_path, 'r') as f:
                j = json.load(f) or {}
                out = {}
                for k, v in defaults.items():
                    if k in j and isinstance(j[k], (int, float)):
                        out[k] = int(j[k])
                    else:
                        out[k] = v
                return out
    except Exception as e:
        LOG.warning(f"failed to load cache config: {e}")
    return defaults


_CACHE_CONFIG = load_cache_config()

def get_ttl(key: str, default: int) -> int:
    return _CACHE_CONFIG.get(key, default)


def load_method_versions() -> Dict[str, str]:
    cfg_path = '/data/kdf_method_versions.json'
    try:
        if os.path.exists(cfg_path):
            with open(cfg_path, 'r') as f:
                j = json.load(f)
                if isinstance(j, dict):
                    return j
    except Exception as e:
        LOG.warning(f"failed to load method versions: {e}")
    return {}


METHOD_VERSIONS = load_method_versions()
LEGACY_METHODS = set(['version', 'my_orders', 'buy', 'sell', 'setprice', 'cancel_order', 'cancel_all_orders', 'get_directly_connected_peers'])


def call_kdf_rpc(method: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """Call KDF RPC using shared KdfMethod to build payload and determine TTL/timeouts.

    Returns the parsed JSON or text response. Raises on HTTP errors.
    """
    opts = load_addon_options()
    rpc_port = str(opts.get('rpc_port', 7783))
    rpc_password = opts.get('rpc_password', '')
    rpc_url = f'http://127.0.0.1:{rpc_port}/'

    # Build method wrapper
    method_payload = {'method': method, 'params': params or {}}
    method_obj = KdfMethod(method_payload, METHOD_VERSIONS, LEGACY_METHODS, METHOD_TIMEOUTS, ACTIVATION_METHODS, get_ttl)
    payload = method_obj.as_payload(rpc_password)
    timeout = method_obj.timeout

    masked = dict(payload)
    if 'userpass' in masked:
        masked['userpass'] = '***'
    LOG.debug(f"call_kdf_rpc -> method={method} url={rpc_url} masked={masked} timeout={timeout}")
    try:
        resp = requests.post(rpc_url, json=payload, timeout=timeout)
        text = resp.text
        LOG.debug(f"KDF response: status={getattr(resp,'status_code','n/a')} body={text}")
        return resp.json()
    except Exception as e:
        LOG.debug(f'call_kdf_rpc POST to {rpc_url} failed: {e}')
        raise


# Static routes (ingress/static) are registered at the end of the file to
# ensure API endpoints are registered first and take precedence.


@app.get('/api/version')
def api_version():
    """Return KDF version (allowed without rpc_password)."""
    try:
        # Use shared cached version helper so callers always get the same value
        try:
            version = get_kdf_version()
        except Exception:
            version = 'unknown'
        return JSONResponse({'version': version, 'timestamp': time.time()})
    except Exception as e:
        LOG.exception('error in /api/version')
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/peers')
def api_peers():
    try:
        def fetch_peers():
            r = call_kdf_rpc('get_directly_connected_peers') or {}
            clean = {}
            if 'result' in r:
                r = r['result']
            if isinstance(r, dict):
                for pid, addrs in r.items():
                    domains = []
                    if isinstance(addrs, list):
                        for a in addrs:
                            d = a
                            if isinstance(d, str):
                                d = d.replace('/dns/', '')
                                d = d.split('/tcp')[0]
                                d = d.split('/')[0]
                                domains.append(d)
                    clean[pid] = domains
            return clean

        peers = cache_get_or_fetch('peers', get_ttl('peers', 60), fetch_peers)
        return JSONResponse({'peers': peers})
    except Exception as e:
        LOG.exception('error in /api/peers')
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/tickers')
def api_tickers():
    try:
        def fetch_tickers():
            coins_path = '/root/.kdf/coins'
            tickers = []
            if os.path.exists(coins_path):
                try:
                    with open(coins_path, 'r') as f:
                        j = json.load(f)
                        if isinstance(j, list):
                            for c in j:
                                if isinstance(c, dict):
                                    t = c.get('ticker') or c.get('symbol')
                                    if t:
                                        tickers.append(t)
                                elif isinstance(c, str):
                                    tickers.append(c)
                except Exception as e:
                    LOG.warning(f"failed to parse coins file: {e}")
            return list(dict.fromkeys(tickers))

        tickers = cache_get_or_fetch('tickers', get_ttl('tickers', 3600), fetch_tickers)

        return JSONResponse({'tickers': tickers})
    except Exception as e:
        LOG.exception('error in /api/tickers')
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/coins_config')
def api_coins_config():
    """Return the cached coins configuration (downloaded from Komodo coins repo)."""
    try:
        # Serve canonical coins_config.json (authoritative). Accepts optional ?ticker=XYZ
        cfg = load_local_coins_config()
        # If a ticker query param is provided, return only that coin's metadata
        request_ticker = None

        # Determine supported coins from addon options (override) or default constant
        supported = SUPPORTED_COINS
        try:
            opts = load_addon_options()
            sc = opts.get('supported_coins')
            if isinstance(sc, list) and len(sc) > 0:
                supported = [s.upper() for s in sc if isinstance(s, str)]
        except Exception:
            pass

        # If ticker param in query string, return full metadata for that ticker (case-insensitive)
        qs = ''
        try:
            qs = os.environ.get('QUERY_STRING','')
        except Exception:
            qs = ''
        if qs:
            for part in qs.split('&'):
                if part.startswith('ticker='):
                    request_ticker = part.split('=',1)[1].upper()
                    break

        if request_ticker:
            entry = cfg.get(request_ticker) or cfg.get(request_ticker.upper()) or cfg.get(request_ticker.lower())
            return JSONResponse({'coin': entry})

        # Build a filtered mapping with name and protocol.type for each supported ticker
        out = {}
        coins_full = {}
        for t in supported:
            entry = cfg.get(t) or cfg.get(t.upper()) or cfg.get(t.lower())
            if isinstance(entry, dict):
                name = entry.get('name') or entry.get('fname') or t
                prot = entry.get('protocol') or {}
                ptype = prot.get('type') if isinstance(prot, dict) else None
                out[t] = {'name': name, 'protocol_type': ptype}
                coins_full[t] = entry
            else:
                out[t] = {'name': t, 'protocol_type': None}
                coins_full[t] = None

        return JSONResponse({'coins_config': out, 'coins_full': coins_full, 'supported_coins': supported})
    except Exception:
        return JSONResponse({'error': 'failed to load coins config', 'coins_config': {}, 'supported_coins': supported})


@app.get('/api/coins_config/{ticker}')
def api_coins_config_ticker(ticker: str):
    """Return full metadata for a specific ticker (case-insensitive)."""
    try:
        cfg = load_local_coins_config()
        t = ticker.upper()
        entry = cfg.get(t) or cfg.get(t.lower()) or cfg.get(t.upper())
        return JSONResponse({'coin': entry})
    except Exception as e:
        LOG.exception('error in /api/coins_config/{ticker}')
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/supported_fiats')
def api_supported_fiats():
    """Return the combined set of fiats supported by Coingecko.

    Coingecko list is fetched from upstream (cached).
    """
    try:
        # Try to fetch from coingecko supported_vs_currencies (cache 1h)
        key = 'coingecko:vs_currencies'
        def fetch_fn():
            url = 'https://api.coingecko.com/api/v3/simple/supported_vs_currencies'
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            return resp.json()

        data = cache_get_or_fetch(key, 3600, fetch_fn)
        if not isinstance(data, list):
            data = []

        # normalize to uppercase common codes
        result = sorted([str(x).upper() for x in data])

        return JSONResponse({'fiats': result})
    except Exception as e:
        LOG.exception('error in /api/supported_fiats')
        raise HTTPException(status_code=500, detail=str(e))


# Determine protocol type for a ticker from coins config using shared helper
def get_coin_protocol_type(ticker: str) -> Optional[str]:
    try:
        ptype, _ = get_coin_protocol(ticker)
        return ptype
    except Exception as e:
        LOG.exception(f'error in get_coin_protocol_type {ticker} (get_coin_protocol_type): {e}')
        return None


def get_electrum_servers_for_ticker(ticker: str):
    """Return a list of electrum servers defined in coins_config for a ticker.

    Expected shape in coins_config: entry['electrum'] -> {'servers': [ { 'url':..., 'protocol': ... }, ... ] }
    """
    try:
        cfg = load_local_coins_config()
        entry = cfg.get(ticker.upper())
        return entry.get('electrum')
    except Exception as e:
        LOG.exception(f'error in get_electrum_servers_for_ticker {ticker} (get_electrum_servers_for_ticker): {e}')
        return None


# Background activation worker
def activation_worker_loop():
    LOG.info('Starting coin activation background worker')
    while True:
        try:
            # reload options each loop
            opts = load_addon_options()
            desired = opts.get('supported_coins') if isinstance(opts.get('supported_coins'), list) and len(opts.get('supported_coins'))>0 else SUPPORTED_COINS
            desired = [d.upper() for d in desired]

            # fetch enabled coins
            enabled = []
            enabled_fetch_failed = False
            try:
                res = call_kdf_rpc('get_enabled_coins') or {}
                if isinstance(res, dict) and 'result' in res:
                    res = res['result']
                if isinstance(res, list):
                    for c in res:
                        if isinstance(c, dict):
                            t = c.get('ticker') or c.get('coin')
                            if t:
                                enabled.append(t)
                        elif isinstance(c, str):
                            enabled.append(c)
                enabled = [e.upper() for e in enabled if e]
            except Exception as e:
                LOG.warning(f'failed to fetch enabled coins for activation: {e}')
                enabled = []
                enabled_fetch_failed = True

            missing = [c for c in desired if c not in enabled]
            if enabled_fetch_failed:
                LOG.info('Skipping activation attempts because KDF RPC is not yet available; will retry')
                # wait a short while before next outer loop iteration
                time.sleep(5)
                continue

            if missing:
                LOG.info(f'Coins missing/enabled mismatch, attempting activation for: {missing}')

            for coin in missing:
                try:
                    # If we have a recent in-progress activation recorded, skip re-triggering
                    try:
                        store = load_activation_store()
                        entry = store.get(coin) or {}
                        task_id_existing = entry.get('task_id')
                        completed_at = entry.get('completed_at') or entry.get('failed_at')
                        now = time.time()
                        last_started = entry.get('last_started', 0)
                        last_checked = entry.get('last_checked', 0)
                        # If a task_id exists and hasn't completed, and was started/checked recently,
                        # skip re-activation to give it time to finish.
                        if task_id_existing and not completed_at:
                            # skip if last_checked within 5 minutes or last_started within 15 minutes
                            if (now - last_checked) < 300 or (now - last_started) < 900:
                                LOG.info(f'Skipping activation for {coin}; task {task_id_existing} appears in-progress (last_started={last_started}, last_checked={last_checked})')
                                continue
                    except Exception:
                        # non-fatal, proceed to attempt activation
                        pass
                    # Use extended helper to obtain protocol type and data
                    try:
                        ptype, pdata = get_coin_protocol(coin)
                        LOG.info(f'ptype: {ptype}')
                        LOG.info(f'pdata: {pdata}')
                    except Exception as e:
                        LOG.info(f'error in get_coin_protocol (missing coin): {e}')
                        LOG.info(f'ticker: {coin}')
                        ptype, pdata = None, None

                    # build init params, include electrum servers for utxo
                    params = {'ticker': coin}

                    if ptype:
                        ptype_l = ptype.lower()
                    else:
                        ptype_l = 'utxo'

                    if ptype == 'ETH':
                        init_method = 'task::enable_eth::init'
                        status_method = 'task::enable_eth::status'
                        params['nodes'] = pdata.get('nodes')
                        params['swap_contract_address'] = pdata.get('swap_contract_address')
                        params['fallback_swap_contract'] = pdata.get('fallback_swap_contract')
                        params['erc20_tokens_requests'] = []
                        params['tx_history'] = True
                        params['get_balances'] = True

                    elif ptype == 'TENDERMINT':
                        init_method = 'task::enable_tendermint::init'
                        status_method = 'task::enable_tendermint::status'
                        params['nodes'] = pdata.get('nodes')
                        params['tokens_params'] = []
                        params['tx_history'] = True
                        params['get_balances'] = True

                    elif ptype == 'UTXO':
                        init_method = 'task::enable_utxo::init'
                        status_method = 'task::enable_utxo::status'
                        params = {
                            'ticker': coin,
                            'tx_history': True,
                            'get_balances': True,
                            "activation_params": {
                                "mode": {
                                    "rpc":"Electrum",
                                    "rpc_data": {
                                        "servers": pdata.get('electrum')
                                    }
                                }
                            }
                        }
                    else:
                        LOG.warning(f'Unsupported protocol type: {ptype}')
                        continue
                    
                    LOG.info(f'Activating coin {coin} using {init_method} (protocol={ptype})')

                    init_res = call_kdf_rpc(init_method, params) or {}
                    # extract task id (if any) immediately
                    task_id = None
                    if isinstance(init_res, dict):
                        if 'result' in init_res and isinstance(init_res['result'], dict):
                            task_id = init_res['result'].get('task_id') or init_res['result'].get('id')
                        task_id = task_id or init_res.get('task_id') or init_res.get('id')

                    # store normalized activation result for UI/store (include task_id when available)
                    try:
                        norm = normalize_activation_result(init_method, init_res or {})
                        upd = {'status_raw': init_res, 'normalized': norm, 'last_started': time.time()}
                        if task_id:
                            upd['task_id'] = task_id
                        update_activation_store(coin, upd)
                    except Exception as e:
                        LOG.info(f'error in update_activation_store: {e}')
                        LOG.info(f'coin: {coin}')
                        LOG.info(f'task_id: {task_id}')
                        LOG.info(f'init_res: {init_res}')
                        LOG.info(f'norm: {locals().get("norm") if "norm" in locals() else None}')
                        # on failure we still want existing behavior
                        pass

                    if not task_id:
                        LOG.warning(f'No task_id returned for activation of {coin}; response: {init_res}')
                        continue

                    # poll status
                    completed = False
                    while True:
                        try:
                            st = call_kdf_rpc(status_method, {'task_id': task_id}) or {}
                            LOG.debug(f'status for {coin} task {task_id}: {st}')
                            # inspect status
                            status_val = None
                            if isinstance(st, dict):
                                if 'result' in st and isinstance(st['result'], dict):
                                    status_val = st['result'].get('status') or st['result'].get('state')
                                status_val = status_val or st.get('status')
                            # persist intermediate status
                            try:
                                update_activation_store(coin, {'task_id': task_id, 'status_raw': st, 'last_checked': time.time()})
                            except Exception:
                                LOG.exception('failed to update activation store')
                            if status_val:
                                sval = str(status_val).lower()
                                if any(x in sval for x in ('done','finished','completed','success','ok')):
                                    completed = True
                                    LOG.info(f'Activation completed for {coin} (task {task_id})')
                                    # fetch final status/result and store
                                    try:
                                        final = call_kdf_rpc(status_method, {'task_id': task_id, 'forget_if_finished': False}) or {}
                                        update_activation_store(coin, {'task_id': task_id, 'status_raw': final, 'completed_at': time.time(), 'result': final})
                                    except Exception:
                                        LOG.exception('failed to fetch/store final activation result')
                                    break
                                if any(x in sval for x in ('failed','error')):
                                    LOG.warning(f'Activation failed for {coin} (task {task_id}) status={status_val}')
                                    try:
                                        update_activation_store(coin, {'task_id': task_id, 'status_raw': st, 'failed_at': time.time()})
                                    except Exception:
                                        LOG.exception('failed to update activation store on failure')
                                    break
                            # otherwise, wait and poll
                        except Exception as e:
                            LOG.warning(f'error polling activation status for {coin} task {task_id}: {e}')
                        time.sleep(10)

                except Exception as e:
                    LOG.exception(f'error activating coin {coin}: {e}')

            # sleep 5 minutes before rechecking missing coins
        except Exception as e:
            LOG.exception(f'activation worker loop error: {e}')
        time.sleep(300)


# (lifespan handler replaces on_event startup; activation worker started from lifespan)


# Simple activation store persisted to /data/activation_store.json
ACTIVATION_STORE_PATH = '/data/activation_store.json'

# In-memory cache of activation store to avoid file race conditions. This is
# populated on first load and updated in-memory; writes flush to disk.
_ACTIVATION_STORE_CACHE: Optional[Dict[str, Any]] = None


def load_activation_store() -> Dict[str, Any]:
    global _ACTIVATION_STORE_CACHE
    try:
        if _ACTIVATION_STORE_CACHE is not None:
            return _ACTIVATION_STORE_CACHE
    except NameError:
        _ACTIVATION_STORE_CACHE = None

    try:
        if os.path.exists(ACTIVATION_STORE_PATH):
            with open(ACTIVATION_STORE_PATH, 'r') as f:
                _ACTIVATION_STORE_CACHE = json.load(f) or {}
                return _ACTIVATION_STORE_CACHE
    except Exception:
        LOG.exception('failed to load activation store from disk')

    _ACTIVATION_STORE_CACHE = {}
    return _ACTIVATION_STORE_CACHE


def save_activation_store(store: Dict[str, Any]):
    global _ACTIVATION_STORE_CACHE
    try:
        os.makedirs(os.path.dirname(ACTIVATION_STORE_PATH), exist_ok=True)
        with open(ACTIVATION_STORE_PATH, 'w') as f:
            json.dump(store, f, indent=2)
        _ACTIVATION_STORE_CACHE = store
    except Exception:
        LOG.exception('failed to save activation store')


def update_activation_store(ticker: str, data: Dict[str, Any]):
    store = load_activation_store() or {}
    entry = store.get(ticker, {})
    entry.update(data)
    store[ticker] = entry
    # write-through to disk
    try:
        save_activation_store(store)
    except Exception:
        LOG.exception('failed to persist activation store after update')
    return entry


@app.get('/api/activation_status')
def api_activation_status():
    """Return activation store and enabled coins summary."""
    try:
        store = load_activation_store()
        # Build a summarized activation view: omit block_height and per-address balances,
        # return only a total_balance mapping for each coin when available.
        from decimal import Decimal, InvalidOperation

        def _compute_total_balance(norm: Dict[str, Any]) -> Dict[str, str]:
            # norm is the normalized activation result produced earlier
            out = {}
            try:
                balances = norm.get('balances') or {}
                # If balances looks like { 'BTC': { 'spendable': '1', 'unspendable': '0' }, ... }
                if isinstance(balances, dict):
                    # detect if currency-keyed
                    is_currency_keyed = False
                    for k, v in balances.items():
                        if isinstance(v, dict) and ('spendable' in v or 'unspendable' in v):
                            is_currency_keyed = True
                            break

                    if is_currency_keyed:
                        for cur, val in balances.items():
                            try:
                                sp = Decimal(str(val.get('spendable', '0')))
                            except Exception:
                                sp = Decimal(0)
                            try:
                                un = Decimal(str(val.get('unspendable', '0')))
                            except Exception:
                                un = Decimal(0)
                            total = sp + un
                            out[cur] = str(total)
                        return out

                    # else if balances is a single balance object like { 'spendable': '0', 'unspendable': '0' }
                    if 'spendable' in balances or 'unspendable' in balances:
                        try:
                            sp = Decimal(str(balances.get('spendable', '0')))
                        except Exception:
                            sp = Decimal(0)
                        try:
                            un = Decimal(str(balances.get('unspendable', '0')))
                        except Exception:
                            un = Decimal(0)
                        # use ticker from norm if present
                        cur = (norm.get('ticker') or '').upper() or 'UNKNOWN'
                        out[cur] = str(sp + un)
                        return out
            except Exception:
                pass
            return out
        # also include enabled_coins
        try:
            enabled = call_kdf_rpc('get_enabled_coins') or {}
            if isinstance(enabled, dict) and 'result' in enabled:
                enabled = enabled['result']
        except Exception:
            enabled = []
        # build summarized activation store view
        summarized = {}
        for t, entry in (store or {}).items():
            s = dict(entry)
            norm = s.get('normalized') or {}
            summary = {}
            summary['status'] = norm.get('status') or s.get('status_raw') and (s.get('status_raw').get('result') or {}).get('status')
            # compute total_balance only
            try:
                tb = _compute_total_balance(norm or {})
            except Exception:
                tb = {}
            summary['total_balance'] = tb
            # include task id and timestamps if present
            if s.get('task_id'):
                summary['task_id'] = s.get('task_id')
            if s.get('completed_at'):
                summary['completed_at'] = s.get('completed_at')
            if s.get('last_checked'):
                summary['last_checked'] = s.get('last_checked')
            summarized[t] = summary

        return JSONResponse({'activation': summarized, 'enabled_coins': enabled})
    except Exception as e:
        LOG.exception('error in /api/activation_status')
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/openapi.json')
def api_openapi_json():
    """Return the OpenAPI schema."""
    return JSONResponse(app.openapi())

@app.get('/api/coingecko_prices')
def api_coingecko_prices():
    """Fetch coingecko simple price for supported coins in selected fiat (cached 60s).

    Uses coins_config coingecko_id values. Falls back to USD when selected fiat not available.
    """
    try:
        opts = load_addon_options()
        fiat = (opts.get('selected_fiat_currency') or 'AUD').lower()

        cfg = load_local_coins_config()
        supported = []
        sc = opts.get('supported_coins')
        if isinstance(sc, list) and len(sc)>0:
            supported = [s.upper() for s in sc if isinstance(s, str)]
        else:
            supported = SUPPORTED_COINS

        ids = []
        ticker_map = {}
        for t in supported:
            ent = cfg.get(t) or cfg.get(t.upper()) or cfg.get(t.lower())
            if isinstance(ent, dict):
                gid = ent.get('coingecko_id') or ent.get('coingecko')
                if gid:
                    ids.append(gid)
                    ticker_map[gid] = t

        if not ids:
            return JSONResponse({'prices': {}, 'fiat': fiat})

        key = f'coingecko:{fiat}:{"|".join(sorted(ids))}'
        def fetch_fn():
            url = 'https://api.coingecko.com/api/v3/simple/price'
            params = {'vs_currencies': fiat, 'ids': ','.join(ids)}
            try:
                resp = requests.get(url, params=params, timeout=10)
                resp.raise_for_status()
                return resp.json()
            except Exception:
                # fallback to USD if primary fails
                params = {'vs_currencies': 'usd', 'ids': ','.join(ids)}
                resp = requests.get(url, params=params, timeout=10)
                resp.raise_for_status()
                return {'fallback_usd': resp.json()}

        # only keep ids for supported coins (already filtered above)
        data = cache_get_or_fetch(key, get_ttl('coingecko_prices', 300), fetch_fn)
        # map back to tickers
        out = {}
        if isinstance(data, dict):
            if 'fallback_usd' in data:
                # map usd results under fallback_usd
                for gid, vals in (data.get('fallback_usd') or {}).items():
                    t = ticker_map.get(gid)
                    if t:
                        out[t] = {'coingecko_id': gid, 'price': vals.get('usd'), 'fiat': None, 'fallback_usd': True}
            else:
                for gid, vals in data.items():
                    t = ticker_map.get(gid)
                    if t:
                        out[t] = {'coingecko_id': gid, 'price': vals.get(fiat), 'fiat': fiat, 'fallback_usd': False}

        return JSONResponse({'prices': out, 'fiat': fiat})
    except Exception as e:
        LOG.exception('error in /api/coingecko_prices')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/activate_coin')
def api_activate_coin(payload: Dict[str, Any]):
    """Trigger activation init for a single coin and store task info."""
    try:
        ticker = None
        if isinstance(payload, dict):
            ticker = payload.get('ticker') or payload.get('coin')
        if not ticker or not isinstance(ticker, str):
            raise HTTPException(status_code=400, detail='Missing ticker')
        t = ticker.upper()

        # Determine protocol and build activation params from coins config when available
        try:
            ptype, pdata = get_coin_protocol(t)
        except Exception as e:
            LOG.info(f'error in get_coin_protocol (activate_coin): {e}')
            LOG.info(f'ticker: {t}')
            ptype, pdata = None, None

        ptype_l = (ptype or 'utxo').lower()

        if 'eth' in ptype_l:
            init_method = 'task::enable_eth::init'
        elif 'tendermint' in ptype_l or 'cosmos' in ptype_l:
            init_method = 'task::enable_tendermint::init'
        else:
            init_method = 'task::enable_utxo::init'

        params = {'ticker': t}
        # Build activation params per protocol
        if init_method == 'task::enable_utxo::init':
            servers = get_electrum_servers_for_ticker(t)
            activation_params = {'mode': {'rpc': 'Electrum'}}
            if servers:
                activation_params['mode']['rpc_data'] = {'servers': servers}
            activation_params['tx_history'] = True
            activation_params['balances'] = True
            params['activation_params'] = activation_params
        elif init_method == 'task::enable_eth::init':
            activation_params = {'tx_history': True, 'balances': True, 'erc20_tokens_requests': [], 'priv_key_policy': {'type': 'ContextPrivKey'}}
            # extract nodes and swap contract data from protocol data when available
            nodes = []
            if pdata and isinstance(pdata, dict):
                if isinstance(pdata.get('nodes'), list):
                    nodes = pdata.get('nodes')
                elif isinstance(pdata.get('nodes'), str):
                    nodes = [{'url': pdata.get('nodes')}]
                elif pdata.get('rpc'):
                    rpcv = pdata.get('rpc')
                    if isinstance(rpcv, list):
                        nodes = [{'url': u} for u in rpcv if isinstance(u, str)]
                    elif isinstance(rpcv, str):
                        nodes = [{'url': rpcv}]

                # swap contract addresses
                sc = pdata.get('swap_contract_address') or pdata.get('swap_contract') or pdata.get('swap') or pdata.get('swap_contracts')
                if isinstance(sc, list) and len(sc) > 0:
                    activation_params['swap_contract_address'] = sc[0]
                    if len(sc) > 1:
                        activation_params['fallback_swap_contract'] = sc[1]
                elif isinstance(sc, str):
                    activation_params['swap_contract_address'] = sc

                fb = pdata.get('fallback_swap_contract') or pdata.get('fallback_swap') or pdata.get('fallback_swap_contract_address')
                if fb and 'fallback_swap_contract' not in activation_params:
                    activation_params['fallback_swap_contract'] = fb

            # normalize nodes
            if nodes:
                norm_nodes = []
                for n in nodes:
                    if isinstance(n, dict) and 'url' in n:
                        norm_nodes.append({'url': n['url']})
                    elif isinstance(n, str):
                        norm_nodes.append({'url': n})
                if norm_nodes:
                    activation_params['nodes'] = norm_nodes

            rc = None
            if pdata and isinstance(pdata, dict):
                rc = pdata.get('required_confirmations')
            activation_params['required_confirmations'] = int(rc or 5)
            params['activation_params'] = activation_params
        elif init_method == 'task::enable_tendermint::init':
            activation_params = {'tx_history': True, 'balances': True}
            if pdata and isinstance(pdata, dict):
                cid = pdata.get('chain_id') or pdata.get('chainId') or pdata.get('chain_registry_name')
                if cid:
                    activation_params['chain_id'] = cid
                denom = pdata.get('denom')
                if denom:
                    activation_params['denom'] = denom
                # rpc_urls in coins_config -> map to nodes expected by KDF tendermint init
                nodes = []
                if isinstance(pdata.get('rpc_urls'), list):
                    for e in pdata.get('rpc_urls'):
                        if isinstance(e, dict):
                            node = {}
                            if 'url' in e:
                                node['url'] = e.get('url')
                            if 'api_url' in e:
                                node['api_url'] = e.get('api_url')
                            if 'grpc_url' in e:
                                node['grpc_url'] = e.get('grpc_url')
                            if 'ws_url' in e:
                                node['ws_url'] = e.get('ws_url')
                            # only include nodes with at least a url
                            if node.get('url'):
                                nodes.append(node)
                        elif isinstance(e, str):
                            nodes.append({'url': e})
                # fallback to older 'nodes' key if present
                if not nodes and isinstance(pdata.get('nodes'), list):
                    for n in pdata.get('nodes'):
                        if isinstance(n, dict) and 'url' in n:
                            nodes.append({'url': n.get('url')})
                if nodes:
                    activation_params['nodes'] = nodes
            params['activation_params'] = activation_params

        LOG.info(f'API activate_coin -> {t} using {init_method}')
        init_res = call_kdf_rpc(init_method, params) or {}

        # extract task_id
        task_id = None
        if isinstance(init_res, dict):
            if 'result' in init_res and isinstance(init_res['result'], dict):
                task_id = init_res['result'].get('task_id') or init_res['result'].get('id')
            task_id = task_id or init_res.get('task_id') or init_res.get('id')

        update_activation_store(t, {'task_id': task_id, 'status_raw': init_res, 'last_started': time.time()})

        return JSONResponse({'ticker': t, 'task_id': task_id, 'raw': init_res})
    except HTTPException:
        raise
    except Exception as e:
        LOG.exception('error in /api/activate_coin')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/set_ui_prefs')
def api_set_ui_prefs(payload: Dict[str, Any]):
    """Merge UI preferences into /data/options.json (only allowed keys).

    Allowed keys: coins_table_sort, coins_table_order
    """
    try:
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail='Invalid payload')
        allowed = ('coins_table_sort', 'coins_table_order')
        to_set = {k: payload[k] for k in allowed if k in payload}
        if not to_set:
            return JSONResponse({'result': 'ok', 'updated': {}})

        opts_path = '/data/options.json'
        opts = {}
        if os.path.exists(opts_path):
            try:
                with open(opts_path, 'r') as f:
                    opts = json.load(f)
            except Exception:
                raise HTTPException(status_code=500, detail='Failed to load options.json')

        ui = opts.get('ui_prefs') or {}
        ui.update(to_set)
        opts['ui_prefs'] = ui
        with open(opts_path, 'w') as f:
            json.dump(opts, f, indent=2)

        return JSONResponse({'result': 'ok', 'updated': to_set})
    except HTTPException:
        raise
    except Exception as e:
        LOG.exception('error in /api/set_ui_prefs')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/enable_fiat_sensor')
def api_enable_fiat_sensor(payload: Dict[str, Any]):
    """Attempt to enable a fiat sensor in Home Assistant. Currently a best-effort stub.

    Expects { entity_id: 'sensor.open_exchange_rates_usd_aud' }
    Returns 501 if the server cannot perform the action.
    """
    try:
        entity_id = None
        if isinstance(payload, dict):
            entity_id = payload.get('entity_id')
        if not entity_id:
            raise HTTPException(status_code=400, detail='Missing entity_id')

        # We do not have Home Assistant credentials here; return not implemented
        raise HTTPException(status_code=501, detail='Enable via Home Assistant UI or provide HA API credentials to allow automated enabling')
    except HTTPException:
        raise
    except Exception as e:
        LOG.exception('error in /api/enable_fiat_sensor')
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/enabled_coins')
def api_enabled_coins():
    try:
        def fetch_enabled():
            res = call_kdf_rpc('get_enabled_coins') or []
            names = []
            if 'result' in res:
                res = res['result']
            if isinstance(res, list):
                for c in res:
                    if isinstance(c, dict):
                        t = c.get('ticker') or c.get('coin')
                        if t:
                            names.append(t)
                    elif isinstance(c, str):
                        names.append(c)
            return [n for n in names if n]

        enabled = cache_get_or_fetch('enabled_coins', get_ttl('enabled_coins', 60), fetch_enabled)
        return JSONResponse({'enabled_coins': enabled})
    except Exception as e:
        LOG.exception('error in /api/enabled_coins')
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/available_fiats')
def api_available_fiats():
    try:
        cfg_path = '/data/available_fiats.json'
        if os.path.exists(cfg_path):
            with open(cfg_path, 'r') as f:
                data = json.load(f)
        else:
            data = []
        return JSONResponse({'available_fiats': data})
    except Exception as e:
        LOG.exception('error in /api/available_fiats')
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/options')
def api_options():
    try:
        opts = {}
        path = '/data/options.json'
        if os.path.exists(path):
            with open(path, 'r') as f:
                opts = json.load(f)
        return JSONResponse({'options': opts})
    except Exception as e:
        LOG.exception('error in /api/options')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/set_options')
def api_set_options(payload: Dict[str, Any]):
    """Save the options payload to /data/options.json (used by editor UI)."""
    try:
        opts_path = '/data/options.json'
        with open(opts_path, 'w') as f:
            if 'selected_fiat_currency' not in payload:
                payload['selected_fiat_currency'] = 'USD'
            json.dump(payload, f, indent=2)
        return JSONResponse({'result': 'ok'})
    except Exception as e:
        LOG.exception('error in /api/set_options')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/set_supported_coins')
def api_set_supported_coins(payload: Dict[str, Any]):
    """Merge supported_coins into /data/options.json after validating against coins_config."""
    try:
        sc = payload.get('supported_coins')
        if not isinstance(sc, list):
            raise HTTPException(status_code=400, detail='supported_coins must be a list')

        # load coins config
        cfg = {}
        cfg_path = '/data/coins_config.json'
        if os.path.exists(cfg_path):
            try:
                with open(cfg_path, 'r') as f:
                    cfg = json.load(f)
            except Exception:
                cfg = {}

        # validate tickers
        invalid = [s for s in sc if not (isinstance(s, str) and (s in cfg or s.upper() in cfg or s.lower() in cfg))]
        if invalid:
            raise HTTPException(status_code=400, detail=f'Invalid tickers: {invalid}')

        # merge into options.json
        opts_path = '/data/options.json'
        opts = {}
        if os.path.exists(opts_path):
            try:
                with open(opts_path, 'r') as f:
                    opts = json.load(f)
            except Exception:
                raise HTTPException(status_code=500, detail='Failed to load options.json')
        opts['supported_coins'] = [s.upper() for s in sc]
        with open(opts_path, 'w') as f:
            json.dump(opts, f, indent=2)

        return JSONResponse({'result': 'ok', 'supported_coins': opts['supported_coins']})
    except HTTPException:
        raise
    except Exception as e:
        LOG.exception('error in /api/set_supported_coins')
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/status')
def api_status():
    try:
        try:
            version = get_kdf_version()
        except Exception:
            pass

        peer_count = 0
        enabled_coins = []
        try:
            def fetch_peers():
                r = call_kdf_rpc('get_directly_connected_peers') or {}
                return r
            peers = cache_get_or_fetch('peers', get_ttl('peers', 60), fetch_peers)
            peer_count = len(peers) if isinstance(peers, (list, dict)) else 0
        except Exception as e:
            LOG.warning(f"failed to fetch peers for status: {e}")

        try:
            def fetch_coins():
                # Normalize various shapes returned by KDF get_enabled_coins
                r = call_kdf_rpc('get_enabled_coins') or {}
                # If KDF returns {"result": {...}} or {"result": [ ... ]}
                if isinstance(r, dict) and 'result' in r:
                    rr = r['result']
                else:
                    rr = r

                # Common KDF shape: { "coins": [ {"ticker": "BTC"}, ... ] }
                if isinstance(rr, dict) and isinstance(rr.get('coins'), list):
                    return rr.get('coins')
                # Already a list of tickers or coin dicts
                if isinstance(rr, list):
                    return rr
                return []

            coins_result = cache_get_or_fetch('enabled_coins', get_ttl('enabled_coins', 60), fetch_coins)
            coin_names = []
            if isinstance(coins_result, list):
                for c in coins_result:
                    if isinstance(c, dict) and 'ticker' in c:
                        coin_names.append(c.get('ticker'))
                    elif isinstance(c, str):
                        coin_names.append(c)
            enabled_coins = [c for c in coin_names if c]
        except Exception as e:
            LOG.warning(f"failed to fetch enabled_coins for status: {e}")

        return JSONResponse({
            'status': 'connected',
            'version': version,
            'peer_count': peer_count,
            'enabled_coins': enabled_coins,
            'timestamp': time.time()
        })
    except Exception as e:
        LOG.exception('error in /api/status')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/set_fiat')
def api_set_fiat(payload: Dict[str, Any]):
    fiat = payload.get('fiat')
    if not fiat or not isinstance(fiat, str):
        raise HTTPException(status_code=400, detail='Missing fiat')
    opts_path = '/data/options.json'
    try:
        opts = {}
        if os.path.exists(opts_path):
            with open(opts_path, 'r') as f:
                opts = json.load(f)
        opts['selected_fiat_currency'] = fiat
        with open(opts_path, 'w') as f:
            json.dump(opts, f, indent=2)
        return JSONResponse({'result': 'ok', 'selected_fiat_currency': fiat})
    except Exception as e:
        LOG.exception('error in /api/set_fiat')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/kdf_request')
async def api_kdf_request(request: Request):
    
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid JSON')
    opts = load_addon_options()
    rpc_password = opts.get('rpc_password', '')
    rpc_port = str(opts.get('rpc_port', 7783))
    rpc_url = f'http://127.0.0.1:{rpc_port}/'

    # helper to forward raw payload to KDF RPC
    def _forward(payload):
        if isinstance(payload, dict) and 'userpass' not in payload and rpc_password:
            payload['userpass'] = rpc_password
        timeout = 30
        resp = requests.post(rpc_url, json=payload, timeout=timeout)
        resp.raise_for_status()
        try:
            return resp.json()
        except Exception:
            return resp.text

    # Support batch requests (array of request objects) - forward directly
    if isinstance(body, list):
        try:
            # enforce no-login restrictions on batch when configured
            no_login = bool(opts.get('no_login', True))
            if no_login:
                ALLOWED = set(['orderbook', 'best_orders', 'get_directly_connected_peers', 'version', 'tickers', 'peers', 'status'])
                for item in body:
                    if isinstance(item, dict):
                        m = item.get('method')
                        if isinstance(m, str) and m not in ALLOWED:
                            raise HTTPException(status_code=403, detail=f'Method "{m}" not allowed in no-login mode')
            # inject userpass into each item if missing
            for item in body:
                if isinstance(item, dict) and 'userpass' not in item and rpc_password:
                    item['userpass'] = rpc_password
            resp = requests.post(rpc_url, json=body, timeout=15)
            resp.raise_for_status()
            try:
                return JSONResponse(resp.json())
            except Exception:
                return Response(content=resp.content, status_code=resp.status_code, media_type=resp.headers.get('Content-Type', 'application/json'))
        except requests.exceptions.RequestException as e:
            LOG.exception('error forwarding batch to KDF RPC')
            raise HTTPException(status_code=500, detail=str(e))

    # Single request handling with optional caching for safe read-only methods
    if not isinstance(body, dict) or 'method' not in body:
        raise HTTPException(status_code=400, detail='Invalid RPC request')

    method = body.get('method')
    # Ensure auth present for protected methods
    if method != 'version' and not (body.get('userpass') or rpc_password):
        raise HTTPException(status_code=403, detail='rpc_password missing; required for this method')

    # caching TTLs per method (seconds)
    CACHE_TTLS = {
        'get_enabled_coins': 60,
        'get_directly_connected_peers': 60,
        'active_swaps': 30,
        'my_orders': 60,
        'my_recent_swaps': 60,
        'tickers': 3600
    }

    try:
        ttl = CACHE_TTLS.get(method)
        if ttl:
            # Use cache_get_or_fetch keyed by method and serialized params
            key = method
            # include params in key when present
            if 'params' in body and body.get('params'):
                try:
                    key = f"{method}:{json.dumps(body.get('params'), sort_keys=True)}"
                except Exception:
                    key = method

            def fetch_fn():
                single = dict(body)
                if KdfMethod is not None:
                    try:
                        mobj = KdfMethod(single, METHOD_VERSIONS, LEGACY_METHODS, METHOD_TIMEOUTS, ACTIVATION_METHODS, get_ttl)
                        payload = mobj.as_payload(rpc_password)
                        return _forward(payload)
                    except Exception:
                        pass
                return _forward(single)

            result = cache_get_or_fetch(key, int(ttl), fetch_fn)
            return JSONResponse(result)
        else:
            # no caching - forward directly
            single = dict(body)
            if KdfMethod is not None:
                try:
                    mobj = KdfMethod(single, METHOD_VERSIONS, LEGACY_METHODS, METHOD_TIMEOUTS, ACTIVATION_METHODS, get_ttl)
                    payload = mobj.as_payload(rpc_password)
                    timeout = getattr(mobj, 'timeout', 30)
                    resp = requests.post(rpc_url, json=payload, timeout=timeout)
                    resp.raise_for_status()
                    try:
                        return JSONResponse(resp.json())
                    except Exception:
                        return Response(content=resp.content, status_code=resp.status_code, media_type=resp.headers.get('Content-Type', 'application/json'))
                except Exception:
                    pass

            result = _forward(single)
            return JSONResponse(result)
    except requests.exceptions.RequestException as e:
        LOG.exception(f'error forwarding {method} to KDF RPC: {e} /n {body}')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/validate_config')
def api_validate_config():
    """Validate addon options and return a structured result for UI display.

    Checks for common missing required fields such as rpc_password and wallet_password.
    """
    try:
        opts = load_addon_options()
        required = [
            ('rpc_password', 'RPC password (rpc_password)'),
            ('wallet_password', 'KDF wallet password (wallet_password)'),
        ]
        problems = []
        for key, desc in required:
            val = opts.get(key)
            if not val or (isinstance(val, str) and val.strip() == '') or (isinstance(val, str) and val.strip().upper() == 'CHANGE_ME'):
                problems.append({'key': key, 'message': f'Missing or default value for {desc}'})

        # Basic sanity: rpc_port should be an int-like
        rpc_port = opts.get('rpc_port')
        try:
            if rpc_port is not None:
                int(rpc_port)
        except Exception:
            problems.append({'key': 'rpc_port', 'message': 'rpc_port should be a number'})

        ok = len(problems) == 0
        return JSONResponse({'ok': ok, 'problems': problems})
    except Exception as e:
        LOG.exception('error in /api/validate_config')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/export_mnemonic')
def api_export_mnemonic(payload: Dict[str, Any]):
    """Export the wallet mnemonic from KDF.

    Payload keys:
      - format: 'encrypted' or 'plaintext' (default 'encrypted')
      - password: required when requesting 'plaintext' (must match wallet_password)
    Returns the raw KDF response.
    """
    try:
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail='Invalid payload')
        fmt = payload.get('format', 'encrypted')
        if fmt not in ('encrypted', 'plaintext'):
            raise HTTPException(status_code=400, detail='format must be "encrypted" or "plaintext"')

        opts = load_addon_options()
        rpc_password = opts.get('rpc_password', '')
        if not rpc_password:
            raise HTTPException(status_code=403, detail='rpc_password not set in addon options')

        params = {'format': fmt}
        if fmt == 'plaintext':
            pwd = payload.get('password')
            if not pwd:
                raise HTTPException(status_code=400, detail='password is required for plaintext export')
            # Rate-limit plaintext exports globally to reduce accidental exposure
            now = int(time.time())
            last = int(_PLAINTEXT_EXPORT_STATE.get('last_ts', 0))
            if now - last < PLAINTEXT_EXPORT_WINDOW:
                raise HTTPException(status_code=429, detail=f'Plaintext export allowed once every {PLAINTEXT_EXPORT_WINDOW} seconds')
            params['password'] = pwd

        # forward raw get_mnemonic request to KDF via call_kdf_rpc helper
        res = call_kdf_rpc('get_mnemonic', params) or {}
        # if plaintext export, update last_ts to now to enforce rate limit
        try:
            if fmt == 'plaintext':
                _PLAINTEXT_EXPORT_STATE['last_ts'] = int(time.time())
        except Exception:
            pass
        return JSONResponse({'result': res})
    except HTTPException:
        raise
    except Exception as e:
        LOG.exception('error in /api/export_mnemonic')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/change_mnemonic_password')
def api_change_mnemonic_password(payload: Dict[str, Any]):
    """Change the mnemonic encryption password and autosync addon options.

    Expects: { current_password: str, new_password: str }
    On success, updates /data/options.json wallet_password to new_password so MM2.json remains consistent on restart.
    """
    try:
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail='Invalid payload')
        cur = payload.get('current_password')
        new = payload.get('new_password')
        if not cur or not new:
            raise HTTPException(status_code=400, detail='current_password and new_password are required')

        # Forward to KDF
        params = {'current_password': cur, 'new_password': new}
        res = call_kdf_rpc('change_mnemonic_password', params) or {}

        # If KDF reports success (result is null in docs), update addon options wallet_password
        # Conservative check: assume no 'error' key
        if isinstance(res, dict) and 'error' in res:
            return JSONResponse({'result': res})

        # merge into options.json
        opts_path = '/data/options.json'
        opts = {}
        if os.path.exists(opts_path):
            try:
                with open(opts_path, 'r') as f:
                    opts = json.load(f)
            except Exception:
                raise HTTPException(status_code=500, detail='Failed to load options.json')
        opts['wallet_password'] = new
        with open(opts_path, 'w') as f:
            json.dump(opts, f, indent=2)

        return JSONResponse({'result': res, 'wallet_password_synced': True})
    except HTTPException:
        raise
    except Exception as e:
        LOG.exception('error in /api/change_mnemonic_password')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/delete_wallet')
def api_delete_wallet(payload: Dict[str, Any]):
    """Delete the static wallet and autosync addon options.

    Expects: { password: str }
    On success, clears bip39_mnemonic and sets import_mnemonic false in options.json.
    """
    try:
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail='Invalid payload')
        pwd = payload.get('password')
        if not pwd:
            raise HTTPException(status_code=400, detail='password required')

        # call delete_wallet on KDF
        res = call_kdf_rpc('delete_wallet', {'wallet_name': 'HAOS KDF Wallet', 'password': pwd}) or {}
        if isinstance(res, dict) and 'error' in res:
            return JSONResponse({'result': res})

        # on success, clear options
        opts_path = '/data/options.json'
        opts = {}
        if os.path.exists(opts_path):
            try:
                with open(opts_path, 'r') as f:
                    opts = json.load(f)
            except Exception:
                raise HTTPException(status_code=500, detail='Failed to load options.json')
        # remove mnemonic and mark import flag false
        opts.pop('bip39_mnemonic', None)
        opts['import_mnemonic'] = False
        with open(opts_path, 'w') as f:
            json.dump(opts, f, indent=2)

        # also clear activation store (safe to keep, but user may expect fresh)
        try:
            save_activation_store({})
        except Exception:
            LOG.exception('failed to clear activation store after wallet deletion')

        return JSONResponse({'result': res, 'options_synced': True})
    except HTTPException:
        raise
    except Exception as e:
        LOG.exception('error in /api/delete_wallet')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/merge_options')
def api_merge_options(payload: Dict[str, Any]):
    """Merge provided keys into /data/options.json (non-destructive merge).

    Useful for autosync when updating a single field.
    """
    try:
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail='Invalid payload')
        opts_path = '/data/options.json'
        opts = {}
        if os.path.exists(opts_path):
            try:
                with open(opts_path, 'r') as f:
                    opts = json.load(f)
            except Exception:
                raise HTTPException(status_code=500, detail='Failed to load options.json')
        # merge
        opts.update(payload)
        with open(opts_path, 'w') as f:
            json.dump(opts, f, indent=2)
        return JSONResponse({'result': 'ok', 'updated': list(payload.keys())})
    except HTTPException:
        raise
    except Exception as e:
        LOG.exception('error in /api/merge_options')
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/api/apply_login')
def api_apply_login(payload: Dict[str, Any]):
    """Apply login settings: validate, write MM2.json, save options and attempt to restart KDF.

    Expects keys: rpc_password, wallet_password, import_mnemonic (bool), bip39_mnemonic (optional), rpc_port, netid, kdf_rpcip, no_login
    Returns: {'validated': bool, 'warnings': [...], 'restart': {'attempted': bool, 'ok': bool, 'message': str}}
    """
    try:
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail='Invalid payload')

        warnings = []
        rpc_password = payload.get('rpc_password', '')
        wallet_password = payload.get('wallet_password', '')
        import_mnemonic_flag = bool(payload.get('import_mnemonic', False))
        bip39 = payload.get('bip39_mnemonic', '')
        rpc_port = int(payload.get('rpc_port', 7783))
        netid = int(payload.get('netid', 8762))
        rpcip = payload.get('kdf_rpcip', '0.0.0.0')
        no_login = bool(payload.get('no_login', True))

        # Basic validation
        if not no_login:
            if not rpc_password or rpc_password.strip() == '':
                warnings.append('rpc_password is required when disabling no-login mode')
            if not wallet_password or wallet_password.strip() == '':
                warnings.append('wallet_password is required when disabling no-login mode')
            if import_mnemonic_flag and (not bip39 or bip39.strip() == ''):
                warnings.append('bip39_mnemonic must be provided when import_mnemonic is true')

        validated = len(warnings) == 0

        # Persist options regardless (so UI shows settings); merge existing options
        opts_path = '/data/options.json'
        opts = {}
        if os.path.exists(opts_path):
            try:
                with open(opts_path, 'r') as f:
                    opts = json.load(f) 
            except Exception:
                raise HTTPException(status_code=500, detail='Failed to load options.json')

        opts.update({
            'rpc_password': rpc_password,
            'wallet_password': wallet_password,
            'import_mnemonic': import_mnemonic_flag,
            'bip39_mnemonic': bip39 if import_mnemonic_flag else '',
            'rpc_port': rpc_port,
            'netid': netid,
            'kdf_rpcip': rpcip,
            'no_login': no_login
        })
        with open(opts_path, 'w') as f:
            json.dump(opts, f, indent=2)

        restart_result = {'attempted': False, 'ok': False, 'message': ''}

        # If user is enabling login (no_login False) and validation passed, write MM2.json and attempt restart
        if not no_login and validated:
            MM2_JSON = '/root/.kdf/MM2.json'
            try:
                # build MM2.json content similar to init script
                EFFECTIVE_NETID = netid
                EFFECTIVE_RPCPORT = rpc_port
                # load seednodes from options if present
                seednodes = opts.get('seednodes') or ['"seed01.kmdefi.net", "seed02.kmdefi.net", "balerion.dragon-seed.com", "drogon.dragon-seed.com", "falkor.dragon-seed.com"']
                # format seednodes properly
                if isinstance(seednodes, list):
                    EFFECTIVE_SEEDNODES = json.dumps(seednodes)
                else:
                    EFFECTIVE_SEEDNODES = str(seednodes)

                if import_mnemonic_flag and bip39:
                    passphrase_line = f'    "passphrase": "{bip39}",\n'
                else:
                    passphrase_line = ''

                mm2 = {
                    "gui": "HADEX",
                    "enable_hd": True,
                    "use_watchers": True,
                    "dbdir": "/data/.kdf/",
                    "netid": EFFECTIVE_NETID,
                    "rpcport": EFFECTIVE_RPCPORT,
                    "seednodes": json.loads(EFFECTIVE_SEEDNODES) if isinstance(EFFECTIVE_SEEDNODES, str) and EFFECTIVE_SEEDNODES.startswith('[') else EFFECTIVE_SEEDNODES,
                    "wallet_name": opts.get('wallet_name', 'HAOS KDF Wallet'),
                    "wallet_password": wallet_password,
                    "i_am_seed": False,
                    "is_bootstrap_node": False,
                    "disable_p2p": False,
                    "use_trading_proto_v2": False,
                    "allow_weak_password": False,
                    "rpc_local_only": False,
                    "rpcip": rpcip,
                    "rpc_password": rpc_password
                }
                # write mm2
                try:
                    with open(MM2_JSON, 'w') as f:
                        json.dump(mm2, f, indent=4)
                except Exception as e:
                    LOG.exception('failed to write MM2.json')
                    warnings.append('Failed to write MM2.json: ' + str(e))

                # Attempt to restart KDF process (best-effort): kill processes named mm2/kdf so s6-restarts them
                restart_result['attempted'] = True
                try:
                    import subprocess
                    # Prefer graceful stop via KDF RPC 'stop' so supervised services exit cleanly
                    try:
                        call_kdf_rpc('stop')
                        restart_result['ok'] = True
                        restart_result['message'] = "Stop RPC sent to KDF"
                    except Exception:
                        # fallback to pkill if RPC stop fails
                        subprocess.call(['pkill', '-f', 'mm2'])
                        subprocess.call(['pkill', '-f', 'kdf'])
                        restart_result['ok'] = True
                        restart_result['message'] = 'Restart signal sent (pkill fallback).'
                except Exception as e:
                    restart_result['ok'] = False
                    restart_result['message'] = 'Failed to signal restart: ' + str(e)
            except Exception as e:
                LOG.exception('apply_login failed')
                warnings.append('apply_login exception: ' + str(e))

        return JSONResponse({'validated': validated, 'warnings': warnings, 'restart': restart_result})
    except HTTPException:
        raise
    except Exception as e:
        LOG.exception('error in /api/apply_login')
        raise HTTPException(status_code=500, detail=str(e))

# HA ingress helper aliases to support paths rewritten by Home Assistant
@app.get('/local_kdf/ingress')
def local_ingress_root():
    return ingress_root()


@app.get('/local_kdf/ingress/{tail:path}')
def local_ingress_tail(tail: str, request: Request):
    # tail may include api/... or static paths
    return catch_all(tail, request)


@app.get('/local_kdf/{tail:path}')
def local_kdf_prefix(tail: str, request: Request):
    return catch_all(tail, request)

# Support ingress alias matching the add-on slug (some supervisors use the addon folder name)
@app.get('/kdf-hadex/ingress')
def kh_ingress_root():
    return ingress_root()


@app.get('/kdf-hadex/ingress/{tail:path}')
def kh_ingress_tail(tail: str, request: Request):
    return catch_all(tail, request)


@app.get('/kdf-hadex/{tail:path}')
def kh_prefix_tail(tail: str, request: Request):
    return catch_all(tail, request)


@app.get('/api/hassio_ingress/{token}/{tail:path}')
def hassio_ingress_alias(token: str, tail: str, request: Request):
    return catch_all(tail, request, token)


# Register static routes after API routes so API endpoints are matched first.
def _guess_media_type(path: str) -> str:
    if path.endswith('.html'):
        return 'text/html; charset=utf-8'
    if path.endswith('.js'):
        return 'application/javascript; charset=utf-8'
    if path.endswith('.css'):
        return 'text/css; charset=utf-8'
    if path.endswith('.json'):
        return 'application/json; charset=utf-8'
    return 'application/octet-stream'


@app.get('/ingress')
def ingress_root():
    dashboard = '/root/www/kdf-panel.html'
    if os.path.exists(dashboard):
        return FileResponse(dashboard, media_type='text/html; charset=utf-8')
    raise HTTPException(status_code=404, detail='Dashboard not found')


@app.get('/{full_path:path}')
def catch_all(full_path: str, request: Request, token: Optional[str] = None):
    # If the path contains an embedded api segment (e.g. ingress-prefix/api/peers),
    # forward to the matching API handler defined above.
    if token:
        LOG.info(f'token: {token}')
        LOG.info(f'token: {token}')
        LOG.info(f'token: {token}')
    else:
        LOG.info(f'NO token:')
        LOG.info(f'No token:')

    if '/api/' in full_path:
        tail = full_path.split('/api/', 1)[1]
        # map common API endpoints to functions
        if tail.startswith('peers') and request.method == 'GET':
            return api_peers()
        if tail.startswith('tickers') and request.method == 'GET':
            return api_tickers()
        if tail.startswith('enabled_coins') and request.method == 'GET':
            return api_enabled_coins()
        if tail.startswith('available_fiats') and request.method == 'GET':
            return api_available_fiats()
        if tail.startswith('options') and request.method == 'GET':
            return api_options()
        if tail.startswith('status') and request.method == 'GET':
            return api_status()
        # For kdf_request POST, we cannot easily proxy here; return 404 so client retries proper path
        if tail.startswith('kdf_request') and request.method == 'POST':
            raise HTTPException(status_code=404)

    rel = full_path.lstrip('/')
    candidates = [os.path.join('/root/www', rel), os.path.join('/root/www', os.path.basename(rel))]
    if '/ingress/' in rel:
        candidates.append(os.path.join('/root/www', rel.split('/ingress/')[-1].lstrip('/')))

    for p in candidates:
        if p and os.path.exists(p) and os.path.isfile(p):
            return FileResponse(p, media_type=_guess_media_type(p))

    # Common HA ingress alias used by older setups
    if full_path in ('', '/', 'local_kdf/ingress', 'local_kdf'):
        dashboard = '/root/www/kdf-panel.html'
        if os.path.exists(dashboard):
            return FileResponse(dashboard, media_type='text/html; charset=utf-8')

    raise HTTPException(status_code=404, detail='Not Found')

# Allow running the server by executing the module directly (fallback if uvicorn binary is not used).
if __name__ == '__main__':
    try:
        import uvicorn
        port = int(os.environ.get('PANEL_PORT', '8099'))
        LOG.info(f"Starting FastAPI panel server via __main__ on 0.0.0.0:{port}")
        uvicorn.run('panel-server:app', host='0.0.0.0', port=port, log_level='info')
    except Exception as e:
        LOG.exception('Failed to start panel server via __main__')
        sys.exit(1)
