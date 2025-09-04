#!/usr/bin/env python3
"""
KDF Ingress Web Server for Home Assistant
"""

import os
import sys
import json
import time
import requests
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Simple in-memory cache for RPC responses
_CACHE = {}

def cache_get_or_fetch(key, ttl, fetch_fn):
    now = time.time()
    entry = _CACHE.get(key)
    if entry and (now - entry.get('ts', 0) < ttl):
        return entry.get('val')
    val = fetch_fn()
    _CACHE[key] = {'val': val, 'ts': now}
    return val


def cache_set(key, val):
    _CACHE[key] = {'val': val, 'ts': time.time()}
    return val

def load_addon_options():
    """Load addon options from /data/options.json if present (Supervisor writes this)."""
    options_file = '/data/options.json'
    try:
        if os.path.exists(options_file):
            with open(options_file, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"Warning: failed to read options.json: {e}")
    return {}


def load_cache_config():
    """Load cache/refresh configuration from /data/panel_cache_config.json if present.
    Falls back to sensible defaults used previously.
    """
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
                # allow either flat mapping of method->ttl or nested structure
                out = {}
                for k, v in defaults.items():
                    if k in j and isinstance(j[k], (int, float)):
                        out[k] = int(j[k])
                    elif isinstance(j.get(k), dict) and 'cache' in j.get(k):
                        out[k] = int(j.get(k).get('cache'))
                    else:
                        out[k] = v
                return out
    except Exception as e:
        print(f"Warning: failed to load cache config: {e}")
    return defaults


_CACHE_CONFIG = load_cache_config()

def get_ttl(key, default):
    return _CACHE_CONFIG.get(key, default)


# Methods that use legacy RPC param layout (root-level params) and should not be wrapped
LEGACY_METHODS = set([
    'version', 'my_orders', 'buy', 'sell', 'setprice',
    'cancel_order', 'cancel_all_orders', 'get_directly_connected_peers'
])


def load_method_versions():
    """Load optional method version mapping from /data/kdf_method_versions.json.
    Format example: { "my_orders": "legacy", "orderbook": "v2" }
    """
    cfg_path = '/data/kdf_method_versions.json'
    try:
        if os.path.exists(cfg_path):
            with open(cfg_path, 'r') as f:
                j = json.load(f)
                if isinstance(j, dict):
                    return j
    except Exception as e:
        print(f"Warning: failed to load method versions: {e}")
    return {}


METHOD_VERSIONS = load_method_versions()

class KDFIngressHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests"""
        try:
            parsed_path = urlparse(self.path)
            
            # Serve the main dashboard
            if parsed_path.path == '/' or parsed_path.path == '/ingress':
                self.serve_dashboard()
            elif parsed_path.path == '/api/status':
                self.serve_api_status()
            elif parsed_path.path == '/api/health':
                self.serve_api_health()
            elif parsed_path.path == '/api/data':
                self.serve_api_data()
            elif parsed_path.path == '/api/tickers':
                # Return available tickers (from coins file) cached for 1 hour
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
                                print(f"Warning: failed to parse coins file: {e}")
                        return list(dict.fromkeys(tickers))

                    tickers = cache_get_or_fetch('tickers', get_ttl('tickers', 3600), fetch_tickers)
                    response = json.dumps({'tickers': tickers})
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(response)))
                    self.end_headers()
                    self.wfile.write(response.encode('utf-8'))
                except Exception as e:
                    print(f"Error serving tickers: {e}")
                    self.send_error(500, 'Error serving tickers')

            elif parsed_path.path == '/api/enabled_coins':
                # Return enabled coins (from KDF RPC) cached for 60s
                try:
                    def fetch_enabled():
                        try:
                            res = self.call_kdf_rpc('get_enabled_coins') or []
                            # normalize to list of tickers
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
                        except Exception as e:
                            print(f"Warning: failed to get enabled coins: {e}")
                            return []

                    enabled = cache_get_or_fetch('enabled_coins', get_ttl('enabled_coins', 60), fetch_enabled)
                    response = json.dumps({'enabled_coins': enabled})
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(response)))
                    self.end_headers()
                    self.wfile.write(response.encode('utf-8'))
                except Exception as e:
                    print(f"Error serving enabled_coins: {e}")
                    self.send_error(500, 'Error serving enabled_coins')
                return

            elif parsed_path.path == '/api/peers':
                # Return peer map cleaned for display: { peer_id: [domains...] }
                try:
                    def fetch_peers():
                        try:
                            r = self.call_kdf_rpc('get_directly_connected_peers') or {}
                            # r expected as map peer_id -> [multiaddrs]
                            clean = {}
                            if isinstance(r, dict):
                                for pid, addrs in r.items():
                                    domains = []
                                    if isinstance(addrs, list):
                                        for a in addrs:
                                            # remove /dns/ and /tcp/... parts
                                            d = a
                                            if isinstance(d, str):
                                                d = d.replace('/dns/', '')
                                                # strip /tcp/PORT and any trailing chars
                                                d = d.split('/tcp')[0]
                                                d = d.split('/')[0]
                                                domains.append(d)
                                    clean[pid] = domains
                            return clean
                        except Exception as e:
                            print(f"Warning: failed to fetch peers: {e}")
                            return {}

                    peers = cache_get_or_fetch('peers', get_ttl('peers', 60), fetch_peers)
                    response = json.dumps({'peers': peers})
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(response)))
                    self.end_headers()
                    self.wfile.write(response.encode('utf-8'))
                except Exception as e:
                    print(f"Error serving peers: {e}")
                    self.send_error(500, 'Error serving peers')
            else:
                # Try to serve static files from /root/www.
                # Tolerant handling: if the requested path contains a known static filename anywhere
                # (e.g., /<addon>/ingress/peers.html or /api/hassio_ingress/<token>/peers.html),
                # serve the file by basename.
                rel = parsed_path.path.lstrip('/')
                basename = os.path.basename(parsed_path.path)
                static_path = os.path.join('/root/www', basename)

                # If basename file exists, serve it (handles ingress-prefixed requests)
                if not (os.path.exists(static_path) and os.path.isfile(static_path)):
                    # If path contains '/ingress/', use the part after it
                    if '/ingress/' in parsed_path.path:
                        rel = parsed_path.path.split('/ingress/')[-1].lstrip('/')
                        static_path = os.path.join('/root/www', rel)
                    else:
                        # fallback to using the full rel under /root/www
                        rel = parsed_path.path.lstrip('/')
                        static_path = os.path.join('/root/www', rel)
                try:
                    # Debug: log static paths being checked
                    print(f"[PANEL] static check: static_path={static_path}")
                    print(f"[PANEL] static check: static_path_exists={os.path.exists(static_path)}")
                    print(f"[PANEL] static check: static_path_isfile={os.path.isfile(static_path)}")
                    if os.path.exists(static_path) and os.path.isfile(static_path):
                        # guess content type
                        ctype = 'application/octet-stream'
                        if static_path.endswith('.html'):
                            ctype = 'text/html; charset=utf-8'
                        elif static_path.endswith('.js'):
                            ctype = 'application/javascript; charset=utf-8'
                        elif static_path.endswith('.css'):
                            ctype = 'text/css; charset=utf-8'
                        elif static_path.endswith('.json'):
                            ctype = 'application/json; charset=utf-8'
                        with open(static_path, 'rb') as f:
                            content = f.read()
                        self.send_response(200)
                        self.send_header('Content-Type', ctype)
                        self.send_header('Content-Length', str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return
                    # Fallback: try basename only (handles ingress proxy paths)
                    base = os.path.basename(parsed_path.path)
                    static_path2 = os.path.join('/root/www', base)
                    print(f"[PANEL] static fallback: static_path2={static_path2}")
                    print(f"[PANEL] static fallback: exists={os.path.exists(static_path2)} isfile={os.path.isfile(static_path2)}")
                    if os.path.exists(static_path2) and os.path.isfile(static_path2):
                        ctype = 'application/octet-stream'
                        if static_path2.endswith('.html'):
                            # Add CSP for static HTML served via ingress
                            ctype = 'text/html; charset=utf-8'
                        elif static_path2.endswith('.js'):
                            ctype = 'application/javascript; charset=utf-8'
                        elif static_path2.endswith('.css'):
                            ctype = 'text/css; charset=utf-8'
                        elif static_path2.endswith('.json'):
                            ctype = 'application/json; charset=utf-8'
                        with open(static_path2, 'rb') as f:
                            content = f.read()
                        self.send_response(200)
                        self.send_header('Content-Type', ctype)
                        self.send_header('Content-Length', str(len(content)))
                        self.end_headers()
                        self.wfile.write(content)
                        return
                except Exception as e:
                    print(f"Error serving static fallback: {e}")
                self.send_error(404, "Not Found")
                
        except Exception as e:
            print(f"Error handling request: {e}")
            self.send_error(500, "Internal Server Error")

    def do_POST(self):
        """Handle POST requests for RPC actions routed through the panel server."""
        try:
            parsed_path = urlparse(self.path)
            if parsed_path.path == '/api/action':
                # Read body
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length) if length > 0 else b''
                try:
                    payload = json.loads(body.decode('utf-8') or '{}')
                except Exception as e:
                    print(f"Warning: failed to parse JSON body: {e}")
                    self.send_error(400, 'Invalid JSON')
                    return

                method = payload.get('method')
                params = payload.get('params')
                if not method:
                    self.send_error(400, 'Missing method')
                    return

                # Call KDF RPC (call_kdf_rpc will read options.json for auth)
                try:
                    result = self.call_kdf_rpc(method, params)
                    response = json.dumps({'result': result})
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(response)))
                    self.end_headers()
                    self.wfile.write(response.encode('utf-8'))
                except Exception as e:
                    print(f"Error forwarding action to KDF RPC: {e}")
                    # Return JSON error body so callers can parse the RPC error
                    err = {'error': str(e)}
                    err_body = json.dumps(err)
                    try:
                        self.send_response(500)
                        self.send_header('Content-Type', 'application/json')
                        self.send_header('Content-Length', str(len(err_body)))
                        self.end_headers()
                        self.wfile.write(err_body.encode('utf-8'))
                    except Exception:
                        # Fallback to plain send_error if headers already sent
                        try:
                            self.send_error(500, 'KDF RPC error')
                        except Exception:
                            pass
                return

            elif parsed_path.path == '/api/best_orders':
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length) if length > 0 else b''
                try:
                    payload = json.loads(body.decode('utf-8') or '{}')
                except Exception as e:
                    print(f"Warning: failed to parse JSON body for best_orders: {e}")
                    self.send_error(400, 'Invalid JSON')
                    return

                # Validate required params: coin, action, request_by
                params = payload.get('params') or {}
                coin = params.get('coin')
                action = params.get('action')
                request_by = params.get('request_by')
                if not coin or not action or not request_by:
                    self.send_error(400, 'Missing required params: coin, action, request_by')
                    return

                # Build RPC payload and forward (normalize params)
                try:
                    # Normalize request_by structure
                    rb = request_by
                    if isinstance(rb, dict) and 'type' in rb and 'value' in rb:
                        # valid
                        pass
                    else:
                        # Try to accept number shorthand
                        if isinstance(rb, int):
                            rb = {'type': 'number', 'value': rb}

                    normalized = {
                        'coin': coin,
                        'action': action,
                        'request_by': rb
                    }

                    cache_key = f"best_orders:{coin}:{action}:{rb.get('type') if isinstance(rb, dict) else 'na'}:{rb.get('value') if isinstance(rb, dict) else 'na'}"

                    def fetch_best():
                        # call_kdf_rpc will include userpass and mmrpc
                        return self.call_kdf_rpc('best_orders', normalized)

                    result = cache_get_or_fetch(cache_key, get_ttl('best_orders', 30), fetch_best)
                    response = json.dumps({'result': result})
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(response)))
                    self.end_headers()
                    self.wfile.write(response.encode('utf-8'))
                except Exception as e:
                    print(f"Error calling best_orders RPC: {e}")
                    err = {'error': str(e)}
                    err_body = json.dumps(err)
                    try:
                        self.send_response(500)
                        self.send_header('Content-Type', 'application/json')
                        self.send_header('Content-Length', str(len(err_body)))
                        self.end_headers()
                        self.wfile.write(err_body.encode('utf-8'))
                    except Exception:
                        try:
                            self.send_error(500, 'KDF RPC error')
                        except Exception:
                            pass
                return

            elif parsed_path.path == '/api/orderbook':
                # Return orderbook for given base/rel
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length) if length > 0 else b''
                try:
                    payload = json.loads(body.decode('utf-8') or '{}')
                except Exception as e:
                    print(f"Warning: failed to parse JSON body for orderbook: {e}")
                    self.send_error(400, 'Invalid JSON')
                    return

                params = payload.get('params') or {}
                base = params.get('base')
                rel = params.get('rel')
                if not base or not rel:
                    self.send_error(400, 'Missing required params: base and rel')
                    return

                try:
                    # Normalize params and call KDF
                    normalized = {'base': base, 'rel': rel}
                    cache_key = f"orderbook:{base}:{rel}"

                    def fetch_orderbook():
                        return self.call_kdf_rpc('orderbook', normalized)

                    result = cache_get_or_fetch(cache_key, get_ttl('orderbook', 10), fetch_orderbook)
                    response = json.dumps({'result': result})
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', str(len(response)))
                    self.end_headers()
                    self.wfile.write(response.encode('utf-8'))
                except Exception as e:
                    print(f"Error calling orderbook RPC: {e}")
                    err_body = json.dumps({'error': str(e)})
                    try:
                        self.send_response(500)
                        self.send_header('Content-Type', 'application/json')
                        self.send_header('Content-Length', str(len(err_body)))
                        self.end_headers()
                        self.wfile.write(err_body.encode('utf-8'))
                    except Exception:
                        try:
                            self.send_error(500, 'KDF RPC error')
                        except Exception:
                            pass
                return

            # Unknown POST path
            self.send_error(404, 'Not Found')
        except Exception as e:
            print(f"Error handling POST request: {e}")
            self.send_error(500, 'Internal Server Error')
    
    def serve_dashboard(self):
        """Serve the main KDF dashboard"""
        try:
            # Read the dashboard HTML file
            dashboard_path = '/root/www/kdf-panel.html'
            if os.path.exists(dashboard_path):
                with open(dashboard_path, 'r') as f:
                    content = f.read()
                
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content.encode('utf-8'))
            else:
                self.send_error(404, "Dashboard not found")
        except Exception as e:
            print(f"Error serving dashboard: {e}")
            self.send_error(500, "Error serving dashboard")
    
    def serve_api_status(self):
        """Serve KDF status API"""
        try:
            # Get real KDF status from the HA integration
            status_data = self.get_kdf_status()
            
            response = json.dumps(status_data)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response)))
            self.end_headers()
            self.wfile.write(response.encode('utf-8'))
        except Exception as e:
            print(f"Error serving status API: {e}")
            self.send_error(500, "Error serving status")

    def serve_api_health(self):
        """Serve health information for optional services (exchange rates)"""
        try:
            # Prefer reading Supervisor-provided options.json (more reliable than envs)
            opts = load_addon_options()
            enabled = False
            api_key = ''
            if opts:
                enabled = opts.get('enable_exchange_rates', False) is True
                api_key = opts.get('exchange_rates_api_key', '')
            else:
                enabled = 'false'
                api_key = ''

            if not enabled:
                health = {
                    'exchange_rates': {
                        'status': 'disabled',
                        'message': 'Exchange rates are disabled; restart addon to enable',
                        'link': 'https://openexchangerates.org'
                    }
                }
            else:
                if not api_key or api_key == 'CHANGE_ME':
                    health = {
                        'exchange_rates': {
                            'status': 'misconfigured',
                            'message': 'Exchange rates enabled but API key missing or invalid',
                            'link': 'https://openexchangerates.org'
                        }
                    }
                else:
                    health = {
                        'exchange_rates': {
                            'status': 'ok',
                            'message': 'Exchange rates enabled and configured'
                        }
                    }

            response = json.dumps(health)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response)))
            self.end_headers()
            self.wfile.write(response.encode('utf-8'))
        except Exception as e:
            print(f"Error serving health API: {e}")
            self.send_error(500, "Error serving health")
    
    def get_kdf_status(self):
        """Get KDF status from the HA integration"""
        try:
            # Try to read the KDF version from the version file created during setup
            version = "unknown"
            version_file = "/data/kdf_version.txt"
            if os.path.exists(version_file):
                try:
                    with open(version_file, 'r') as f:
                        version = f.read().strip()
                except Exception as e:
                    print(f"Error reading version file: {e}")
                    version = "unknown"
            
            # Try to get real-time status from the KDF RPC
            peer_count = 0
            enabled_coins = []

            try:
                # Cache enabled_coins and peers for 60s
                def fetch_peers():
                    r = self.call_kdf_rpc('get_directly_connected_peers')
                    if isinstance(r, (list, dict)):
                        return r
                    return []
                peers = cache_get_or_fetch('peers', 60, fetch_peers)
                peer_count = len(peers) if isinstance(peers, (list, dict)) else 0
            except Exception as e:
                print(f"Warning: failed to get peers from KDF RPC: {e}")

            try:
                def fetch_coins():
                    return self.call_kdf_rpc('get_enabled_coins') or []
                coins_result = cache_get_or_fetch('enabled_coins', 60, fetch_coins)
                if isinstance(coins_result, list):
                    coin_names = []
                    for c in coins_result:
                        if isinstance(c, dict) and 'ticker' in c:
                            coin_names.append(c.get('ticker'))
                        elif isinstance(c, str):
                            coin_names.append(c)
                    enabled_coins = [c for c in coin_names if c]
            except Exception as e:
                print(f"Warning: failed to get enabled coins from KDF RPC: {e}")

            return {
                "status": "connected",
                "version": version,
                "peer_count": peer_count,
                "enabled_coins": enabled_coins,
                "timestamp": time.time()
            }
        except Exception as e:
            print(f"Error getting KDF status: {e}")
            # Return fallback status
            return {
                "status": "error",
                "version": "unknown",
                "peer_count": 0,
                "enabled_coins": [],
                "timestamp": time.time()
            }
    
    def serve_api_data(self):
        """Serve KDF trading data API"""
        try:
            # Get real trading data from the HA integration
            data = self.get_kdf_trading_data()
            
            response = json.dumps(data)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response)))
            self.end_headers()
            self.wfile.write(response.encode('utf-8'))
        except Exception as e:
            print(f"Error serving data API: {e}")
            self.send_error(500, "Error serving data")
    
    def get_kdf_trading_data(self):
        """Get KDF trading data"""
        try:
            # Query KDF RPC for trading data
            active_swaps_full = []
            my_orders_full = []
            recent_swaps_full = []
            best_orders = {"buy_orders": [], "sell_orders": []}

            try:
                # active swaps should be cached for 30s unless in-progress
                def fetch_active():
                    return self.call_kdf_rpc('active_swaps') or {}
                active_swaps_full = cache_get_or_fetch('active_swaps', 30, fetch_active)
            except Exception as e:
                print(f"Warning: failed to fetch active_swaps: {e}")

            try:
                # my_orders returns a dict with maker_orders and taker_orders
                my_orders_full = cache_get_or_fetch('my_orders', 60, lambda: self.call_kdf_rpc('my_orders') or {})
            except Exception as e:
                print(f"Warning: failed to fetch my_orders: {e}")

            try:
                # recent swaps returns a structure with a 'swaps' list
                recent_swaps_full = cache_get_or_fetch('recent_swaps', 60, lambda: self.call_kdf_rpc('my_recent_swaps') or {})
            except Exception as e:
                print(f"Warning: failed to fetch my_recent_swaps: {e}")

            # best_orders may be provided by a specific API in the future

            # Compute counts robustly based on expected structures
            # active_swaps_full expected: { 'uuids': [...], 'statuses': ... } or list
            active_count = 0
            try:
                if isinstance(active_swaps_full, dict):
                    uuids = active_swaps_full.get('uuids') or []
                    active_count = len(uuids) if isinstance(uuids, (list, tuple)) else 0
                elif isinstance(active_swaps_full, list):
                    active_count = len(active_swaps_full)
            except Exception:
                active_count = 0

            # Determine if any active swap is in progress for interval tuning
            in_progress = False
            try:
                uuids_list = active_swaps_full.get('uuids') if isinstance(active_swaps_full, dict) else active_swaps_full
                if isinstance(uuids_list, list):
                    # We don't have full swap objects here; request individual swap statuses if needed later
                    in_progress = False
            except Exception:
                in_progress = False

            # my_orders_full expected: { 'maker_orders': [...], 'taker_orders': [...] }
            my_orders_count = 0
            try:
                if isinstance(my_orders_full, dict):
                    maker = my_orders_full.get('maker_orders') or []
                    taker = my_orders_full.get('taker_orders') or []
                    # maker/taker may be dicts or lists; handle both
                    if isinstance(maker, dict):
                        maker_count = sum(len(v) if isinstance(v, list) else 0 for v in maker.values())
                    elif isinstance(maker, list):
                        maker_count = len(maker)
                    else:
                        maker_count = 0

                    if isinstance(taker, dict):
                        taker_count = sum(len(v) if isinstance(v, list) else 0 for v in taker.values())
                    elif isinstance(taker, list):
                        taker_count = len(taker)
                    else:
                        taker_count = 0

                    my_orders_count = maker_count + taker_count
                elif isinstance(my_orders_full, list):
                    my_orders_count = len(my_orders_full)
            except Exception:
                my_orders_count = 0

            # recent_swaps_full expected: { 'swaps': [...] }
            recent_count = 0
            try:
                if isinstance(recent_swaps_full, dict):
                    swaps_list = recent_swaps_full.get('swaps') or []
                    recent_count = len(swaps_list) if isinstance(swaps_list, list) else 0
                elif isinstance(recent_swaps_full, list):
                    recent_count = len(recent_swaps_full)
            except Exception:
                recent_count = 0

            return {
                "active_swaps": active_count,
                "active_swaps_full": active_swaps_full,
                "my_orders": my_orders_count,
                "my_orders_full": my_orders_full,
                "recent_swaps": recent_count,
                "recent_swaps_full": recent_swaps_full,
                "best_orders": best_orders,
                "active_update_interval": 15 if in_progress else 30,
                "timestamp": time.time()
            }
        except Exception as e:
            print(f"Error getting KDF trading data: {e}")
            # Return fallback data
            return {
                "active_swaps": 0,
                "my_orders": 0,
                "recent_swaps": 0,
                "best_orders": {
                    "buy_orders": [],
                    "sell_orders": []
                },
                "timestamp": time.time()
            }
    
    def log_message(self, format, *args):
        """Log requests for debugging"""
        print(f"[PANEL] {format % args}")

    def call_kdf_rpc(self, method, params=None):
        """Call the local KDF RPC endpoint using HTTP POST to KDF's RPC port

        Expects environment variables KDF_RPC_PORT and KDF_RPC_PASSWORD to be set
        """
        try:
            # Load authoritative options for RPC auth/port
            opts = load_addon_options()
            rpc_port = str(opts.get('rpc_port', os.getenv('KDF_RPC_PORT', '7783')))
            rpc_password = opts.get('rpc_password', '')
            rpc_url = f'http://127.0.0.1:{rpc_port}/'

            # Decide method version: consult METHOD_VERSIONS override, then fallback to LEGACY_METHODS
            mv = METHOD_VERSIONS.get(method)
            if mv == 'legacy' or mv == 'v1':
                is_legacy = True
            elif mv == 'v2':
                is_legacy = False
            else:
                is_legacy = method in LEGACY_METHODS

            # Build payload accordingly
            if is_legacy:
                # Legacy methods expect params at root level and do NOT use mmrpc
                payload = {'method': method}
                if isinstance(params, dict):
                    for k, v in params.items():
                        payload[k] = v
            else:
                # v2 methods expect an explicit params object (may be empty) and mmrpc
                # Special-case: upstream KDF has a bug where some v2 methods (e.g. get_enabled_coins)
                # reject an empty params object. For these, omit the params field entirely.
                if method == 'get_enabled_coins':
                    payload = {'method': method, 'mmrpc': '2.0'}
                else:
                    payload = {'method': method, 'mmrpc': '2.0', 'params': params or {}}

            # userpass is always a top-level field
            if rpc_password:
                payload['userpass'] = rpc_password

            headers = {'Content-Type': 'application/json'}
            # Debug: show outgoing RPC attempt (mask password when printing)
            masked_payload = dict(payload)
            if 'userpass' in masked_payload:
                masked_payload['userpass'] = '***'
            mv = METHOD_VERSIONS.get(method)
            print(f"[PANEL] call_kdf_rpc -> method={method} url={rpc_url} userpass_present={bool(rpc_password)} method_version_override={mv}")
            print(f"[PANEL] call_kdf_rpc -> masked_payload={json.dumps(masked_payload)}")
            # Also log the full raw JSON request body (including userpass) for deep debugging
            try:
                print(f"[PANEL] call_kdf_rpc raw_payload: {json.dumps(payload)}")
            except Exception as e:
                print(f"[PANEL] call_kdf_rpc failed to json-serialize payload: {e}")

            resp = requests.post(rpc_url, headers=headers, json=payload, timeout=5)
            # Debug: show response status
            status = getattr(resp, 'status_code', 'n/a')
            print(f"[PANEL] call_kdf_rpc response status={status}")
            try:
                resp.raise_for_status()
            except requests.exceptions.HTTPError as he:
                # Capture body for debugging before deciding retry
                try:
                    body = resp.text
                except Exception:
                    body = '<unable to read body>'
                print(f"[PANEL] call_kdf_rpc HTTP error body: {body}")

                # Workaround: some v2 methods (e.g., get_enabled_coins) reject an empty params object
                # even though docs show params can be omitted. If the original request was v2 with
                # an empty params dict, retry once without the params field.
                if not is_legacy and isinstance(payload.get('params', None), dict) and (payload.get('params') == {}):
                    # detect specific error patterns indicating unit-struct expected
                    low = body.lower()
                    if 'expected unit struct' in low or 'invalid type: map' in low or 'getenabledcoinsrequest' in low:
                        try:
                            alt_payload = {'method': method, 'mmrpc': '2.0'}
                            if rpc_password:
                                alt_payload['userpass'] = rpc_password
                            masked_alt = dict(alt_payload)
                            if 'userpass' in masked_alt:
                                masked_alt['userpass'] = '***'
                            print(f"[PANEL] Retrying without params for method={method} masked_payload={json.dumps(masked_alt)}")
                            alt_resp = requests.post(rpc_url, headers=headers, json=alt_payload, timeout=5)
                            print(f"[PANEL] retry response status={getattr(alt_resp, 'status_code', 'n/a')}")
                            try:
                                alt_resp.raise_for_status()
                            except requests.exceptions.HTTPError as he2:
                                try:
                                    abody = alt_resp.text
                                except Exception:
                                    abody = '<unable to read body>'
                                print(f"[PANEL] retry HTTP error body: {abody}")
                                raise Exception(f"HTTP {getattr(alt_resp, 'status_code', 'n/a')}: {abody}") from he2
                            try:
                                data = alt_resp.json()
                            except Exception:
                                data = None
                            # If alt call returned valid JSON with result, return it
                            if isinstance(data, dict) and 'result' in data:
                                return data['result']
                            elif data is not None:
                                return data
                        except Exception as retry_e:
                            print(f"[PANEL] retry without params failed: {retry_e}")
                            # fall through to raising original error
                raise Exception(f"HTTP {status}: {body}") from he
            # Debug: show full response body for troubleshooting
            try:
                text = resp.text
                print(f"[PANEL] call_kdf_rpc response body: {text}")
            except Exception:
                pass

            # Parse JSON if possible
            try:
                data = resp.json()
            except Exception:
                data = None
            # Expected: {"result": ...} or similar
            if isinstance(data, dict) and 'result' in data:
                return data['result']
            return data
        except Exception as e:
            print(f"KDF RPC call failed ({method}): {e}")
            raise

def start_ingress_server():
    """Start the ingress web server"""
    try:
        port = 8099
        print(f"Creating HTTP server on 0.0.0.0:{port}")
        server = HTTPServer(('0.0.0.0', port), KDFIngressHandler)
        print(f"KDF Ingress server starting on port {port}")
        print(f"Dashboard will be available at: /a0d7b954_kdf/ingress")
        print(f"Testing dashboard file exists: {os.path.exists('/root/www/kdf-panel.html')}")
        print(f"Server ready and listening on 0.0.0.0:{port}")
        print("Starting server.serve_forever()...")
        server.serve_forever()
    except Exception as e:
        print(f"Ingress server error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    try:
        print("KDF Panel Server starting...")
        start_ingress_server()
    except Exception as e:
        print(f"Fatal error in panel server: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
