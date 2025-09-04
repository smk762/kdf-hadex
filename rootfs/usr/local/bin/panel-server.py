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

LOG = logging.getLogger("panel-server")
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] [panel-server] %(message)s')

app = FastAPI(title="KDF Panel Server")


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
        'recent_swaps': 60
    }
    cfg_path = '/data/panel_cache_config.json'
    try:
        if os.path.exists(cfg_path):
            with open(cfg_path, 'r') as f:
                j = json.load(f)
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
    opts = load_addon_options()
    rpc_port = str(opts.get('rpc_port', 7783))
    rpc_password = opts.get('rpc_password', '')
    rpc_url = f'http://127.0.0.1:{rpc_port}/'

    mv = METHOD_VERSIONS.get(method)
    if mv == 'legacy' or mv == 'v1':
        is_legacy = True
    elif mv == 'v2':
        is_legacy = False
    else:
        is_legacy = method in LEGACY_METHODS

    if is_legacy:
        payload = {'method': method}
        if isinstance(params, dict):
            for k, v in params.items():
                payload[k] = v
    else:
        if method == 'get_enabled_coins':
            payload = {'method': method, 'mmrpc': '2.0'}
        else:
            payload = {'method': method, 'mmrpc': '2.0', 'params': params or {}}

    # `version` is allowed without auth
    if method != 'version' and not rpc_password:
        raise Exception(f"rpc_password missing in /data/options.json; required for method {method}")
    if rpc_password:
        payload['userpass'] = rpc_password

    masked = dict(payload)
    if 'userpass' in masked:
        masked['userpass'] = '***'
    LOG.debug(f"call_kdf_rpc -> method={method} url={rpc_url} masked={masked}")

    resp = requests.post(rpc_url, json=payload, timeout=5)
    try:
        text = resp.text
        LOG.debug(f"KDF response: status={getattr(resp,'status_code','n/a')} body={text}")
    except Exception:
        text = ''

    if resp.status_code >= 400:
        # retry for v2 empty params bug
        if not is_legacy and isinstance(payload.get('params', None), dict) and payload.get('params') == {}:
            lw = text.lower()
            if 'expected unit struct' in lw or 'invalid type: map' in lw or 'getenabledcoinsrequest' in lw:
                alt_payload = {'method': method, 'mmrpc': '2.0'}
                if rpc_password:
                    alt_payload['userpass'] = rpc_password
                alt_resp = requests.post(rpc_url, json=alt_payload, timeout=5)
                alt_resp.raise_for_status()
                try:
                    return alt_resp.json()
                except Exception:
                    return alt_resp.text
        resp.raise_for_status()

    try:
        return resp.json()
    except Exception:
        return text


# Static routes (ingress/static) are registered at the end of the file to
# ensure API endpoints are registered first and take precedence.


@app.get('/api/version')
def api_version():
    """Return KDF version (allowed without rpc_password)."""
    try:
        version = 'unknown'
        version_file = '/data/kdf_version.txt'
        if os.path.exists(version_file):
            try:
                with open(version_file, 'r') as f:
                    version = f.read().strip()
            except Exception:
                version = 'unknown'
        try:
            v = call_kdf_rpc('version')
            if isinstance(v, dict) and 'result' in v:
                version = v.get('result')
            elif isinstance(v, str):
                version = v
        except Exception:
            pass
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


@app.get('/api/enabled_coins')
def api_enabled_coins():
    try:
        def fetch_enabled():
            res = call_kdf_rpc('get_enabled_coins') or []
            names = []
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

    method = body.get('method')
    opts = load_addon_options()
    rpc_password = opts.get('rpc_password', '')
    if method != 'version' and not (body.get('userpass') or rpc_password):
        raise HTTPException(status_code=403, detail='rpc_password missing; required for this method')

    if 'userpass' not in body and rpc_password:
        body['userpass'] = rpc_password

    rpc_port = str(opts.get('rpc_port', 7783))
    rpc_url = f'http://127.0.0.1:{rpc_port}/'
    try:
        resp = requests.post(rpc_url, json=body, timeout=10)
        content = resp.content
        status = resp.status_code
        ctype = resp.headers.get('Content-Type', 'application/json')
        return Response(content=content, status_code=status, media_type=ctype)
    except requests.exceptions.RequestException as e:
        LOG.exception('error forwarding to KDF RPC')
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


@app.get('/api/hassio_ingress/{token}/{tail:path}')
def hassio_ingress_alias(token: str, tail: str, request: Request):
    return catch_all(tail, request)


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
def catch_all(full_path: str, request: Request):
    # If the path contains an embedded api segment (e.g. ingress-prefix/api/peers),
    # forward to the matching API handler defined above.
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
