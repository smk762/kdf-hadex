#!/usr/bin/env python3
"""
KDF Home Assistant Integration
Uses pykomodefi to expose KDF data via Home Assistant REST API

This script should be run using the virtual environment:
/opt/kdf-venv/bin/python /usr/local/bin/kdf-ha-integration.py
"""

import os
import sys
import json
import time
import logging
import requests
from typing import Dict, Any, Optional
import pykomodefi


def load_addon_options():
    """Load addon options from /data/options.json (authoritative).

    Returns a dict; empty dict on failure.
    """
    options_file = '/data/options.json'
    try:
        if os.path.exists(options_file):
            with open(options_file, 'r') as f:
                return json.load(f)
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to read {options_file}: {e}")
    return {}

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [kdf-ha] %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)

class KDFHAIntegration:
    def __init__(self):
        self.kdf_api = None
        # Load authoritative addon options
        opts = load_addon_options()
        self.ha_url = opts.get('supervisor_url') or os.getenv('SUPERVISOR_URL', 'http://supervisor')
        self.ha_token = opts.get('supervisor_token') or os.getenv('SUPERVISOR_TOKEN', '')
        self.mm2_config_path = '/root/.kdf/MM2.json'
        self.update_interval = 30  # seconds
        
        # Exchange rate configuration (use /data/options.json as authoritative)
        self.selected_fiat_currency = opts.get('selected_fiat_currency', 'AUD')
        
        # For add-ons, we need to use the Supervisor API to create entities
        # The entities will be created via the add-on's configuration
        self.entities_created = False
        # RPC auth/port from options.json
        self.rpc_port = str(opts.get('rpc_port', os.getenv('KDF_RPC_PORT', '7783')))
        self.rpc_password = opts.get('rpc_password', '')

        # Load method versions overrides if present
        self.method_versions = {}
        mv_path = '/data/kdf_method_versions.json'
        try:
            if os.path.exists(mv_path):
                with open(mv_path, 'r') as f:
                    j = json.load(f)
                    if isinstance(j, dict):
                        self.method_versions = j
        except Exception:
            pass

        # Known legacy (v1) methods default set
        self.legacy_methods = set([
            'version', 'my_orders', 'buy', 'sell', 'setprice',
            'cancel_order', 'cancel_all_orders', 'get_directly_connected_peers'
        ])
        
    def initialize_kdf(self):
        """Initialize KDF API connection"""
        try:
            if os.path.exists(self.mm2_config_path):
                self.kdf_api = pykomodefi.KomoDeFi_API(config=self.mm2_config_path)
                logger.info("KDF API initialized successfully")
                return True
            else:
                logger.error(f"MM2.json not found at {self.mm2_config_path}")
                return False
        except Exception as e:
            logger.error(f"Failed to initialize KDF API: {e}")
            return False
    
    def test_kdf_connection(self):
        """Test if KDF is responding to requests"""
        try:
            if not self.kdf_api:
                logger.info("KDF API not initialized")
                return False
            
            # Try a simple version request
            logger.info("Testing KDF connection with version request...")
            response = self.rpc_call("version")
            
            if response:
                logger.info(f"KDF response type: {type(response)}")
                logger.info(f"KDF response content: {response}")
                
                # Check if it's a requests response object
                if hasattr(response, 'status_code'):
                    logger.info(f"KDF response status: {response.status_code}")
                    if response.status_code == 200:
                        logger.info("KDF connection test successful")
                        return True
                    else:
                        logger.warning(f"KDF returned non-200 status: {response.status_code}")
                        return False
                # Check if it's a dictionary (pykomodefi format)
                elif isinstance(response, dict):
                    if 'result' in response or 'error' not in response:
                        logger.info("KDF connection test successful (dict response)")
                        return True
                    else:
                        logger.warning(f"KDF returned error: {response}")
                        return False
                else:
                    logger.info("KDF connection test successful (unknown response type)")
                    return True
            else:
                logger.warning("KDF returned no response")
                return False
        except Exception as e:
            logger.error(f"KDF connection test failed: {e}")
            return False
    
    
    def create_ha_entity(self, entity_data: Dict[str, Any]):
        """Create a single Home Assistant entity"""
        try:
            url = f"{self.ha_url}/core/states/{entity_data['entity_id']}"
            headers = {
                'Authorization': f'Bearer {self.ha_token}',
                'Content-Type': 'application/json'
            }

            logger.debug(f"Creating HA entity {entity_data.get('entity_id')} -> URL: {url} payload_size={len(json.dumps(entity_data))} bytes")
            response = requests.post(url, json=entity_data, headers=headers)
            if response.status_code in [200, 201]:
                logger.info(f"Created entity: {entity_data['entity_id']} (status={response.status_code})")
            else:
                # Try to include response body for debugging
                try:
                    body = response.text
                except Exception:
                    body = '<unavailable>'
                logger.warning(f"Failed to create entity {entity_data['entity_id']}: status={response.status_code} body={body}")
        except Exception as e:
            logger.error(f"Error creating entity {entity_data['entity_id']}: {e}")
    
    def update_ha_entity(self, entity_id: str, state: str, attributes: Dict[str, Any]):
        """Update a Home Assistant entity"""
        try:
            url = f"{self.ha_url}/core/states/{entity_id}"
            headers = {
                'Authorization': f'Bearer {self.ha_token}',
                'Content-Type': 'application/json'
            }

            data = {
                "state": state,
                "attributes": attributes
            }

            logger.debug(f"Updating HA entity {entity_id} -> URL: {url} payload_size={len(json.dumps(data))} bytes")
            response = requests.post(url, json=data, headers=headers)
            if response.status_code in [200, 201]:
                logger.info(f"Updated entity: {entity_id} (status={response.status_code})")
            else:
                try:
                    body = response.text
                except Exception:
                    body = '<unavailable>'
                logger.warning(f"Failed to update entity {entity_id}: status={response.status_code} body={body}")
        except Exception as e:
            logger.error(f"Error updating entity {entity_id}: {e}")
    
    def get_kdf_status(self) -> Dict[str, Any]:
        """Get KDF status information"""
        try:
            if not self.kdf_api:
                return {"status": "disconnected", "version": "", "peer_count": 0, "enabled_coins": []}

            # Version via RPC (or pykomodefi attribute)
            version = 'unknown'
            try:
                v = self.rpc_call('version')
                if isinstance(v, dict) and 'result' in v:
                    version = v['result']
                elif isinstance(v, str):
                    version = v
                else:
                    version = str(v)
            except Exception:
                try:
                    version = getattr(self.kdf_api, 'version', 'unknown')
                except Exception:
                    version = 'unknown'

            # Fetch enabled coins via RPC (cached behavior handled by caller if needed)
            coin_tickers = []
            try:
                coins_res = self.rpc_call('get_enabled_coins')
                if isinstance(coins_res, list):
                    for c in coins_res:
                        if isinstance(c, dict):
                            t = c.get('ticker') or c.get('coin')
                            if t:
                                coin_tickers.append(t)
                        elif isinstance(c, str):
                            coin_tickers.append(c)
            except Exception:
                coin_tickers = []

            # Fetch peers via panel server authoritative API if available
            peer_count = 0
            try:
                import requests as _requests
                try:
                    r = _requests.get('http://127.0.0.1:8099/api/peers', timeout=2)
                    if r.status_code == 200:
                        pj = r.json()
                        peers_obj = pj.get('peers') if isinstance(pj, dict) else None
                        if isinstance(peers_obj, dict):
                            peer_count = len(peers_obj)
                        elif isinstance(peers_obj, list):
                            peer_count = len(peers_obj)
                    else:
                        # fallback to RPC if panel API unavailable
                        peers_res = self.rpc_call('get_directly_connected_peers')
                        if isinstance(peers_res, dict):
                            peer_count = len(peers_res)
                        elif isinstance(peers_res, list):
                            peer_count = len(peers_res)
                except Exception:
                    peers_res = self.rpc_call('get_directly_connected_peers')
                    if isinstance(peers_res, dict):
                        peer_count = len(peers_res)
                    elif isinstance(peers_res, list):
                        peer_count = len(peers_res)
            except Exception:
                peer_count = 0

            return {
                "status": "connected",
                "version": version,
                "peer_count": peer_count,
                "enabled_coins": coin_tickers
            }
        except Exception as e:
            logger.error(f"Error getting KDF status: {e}")
            return {"status": "error", "version": "", "peer_count": 0, "enabled_coins": []}
    
    def get_best_orders(self) -> Dict[str, Any]:
        """Get best orders from KDF"""
        try:
            if not self.kdf_api:
                return {"buy_orders": [], "sell_orders": []}
            
            # Get best orders (this would need to be implemented based on KDF API)
            # For now, return empty structure
            return {"buy_orders": [], "sell_orders": []}
        except Exception as e:
            logger.error(f"Error getting best orders: {e}")
            return {"buy_orders": [], "sell_orders": []}
    
    def get_active_swaps(self) -> Dict[str, Any]:
        """Get active swaps from KDF"""
        try:
            if not self.kdf_api:
                return {"swaps": []}
            
            active_swaps = getattr(self.kdf_api, 'active_swaps', {})
            if isinstance(active_swaps, str):
                return {"swaps": []}
            elif not isinstance(active_swaps, dict):
                return {"swaps": []}
            
            swap_uuids = active_swaps.get('uuids', [])
            if not isinstance(swap_uuids, list):
                swap_uuids = []
            
            return {"swaps": swap_uuids}
        except Exception as e:
            logger.error(f"Error getting active swaps: {e}")
            return {"swaps": []}
    
    def get_my_orders(self) -> Dict[str, Any]:
        """Get my orders from KDF"""
        try:
            if not self.kdf_api:
                return {"orders": []}
            
            orders = getattr(self.kdf_api, 'orders', {})
            if isinstance(orders, str):
                return {"orders": []}
            elif not isinstance(orders, dict):
                return {"orders": []}
            
            maker_orders = orders.get('maker_orders', {})
            taker_orders = orders.get('taker_orders', {})
            
            # Ensure these are lists
            if not isinstance(maker_orders, list):
                maker_orders = []
            if not isinstance(taker_orders, list):
                taker_orders = []
            
            all_orders = []
            for order_type, order_list in [('maker', maker_orders), ('taker', taker_orders)]:
                for order in order_list:
                    if isinstance(order, dict):
                        all_orders.append({
                            'type': order_type,
                            'uuid': order.get('uuid', ''),
                            'base': order.get('base', ''),
                            'rel': order.get('rel', ''),
                            'price': order.get('price', ''),
                            'volume': order.get('maxvolume', '')
                        })
            
            return {"orders": all_orders}
        except Exception as e:
            logger.error(f"Error getting my orders: {e}")
            return {"orders": []}
    
    def get_recent_swaps(self) -> Dict[str, Any]:
        """Get recent swaps from KDF"""
        try:
            if not self.kdf_api:
                return {"swaps": []}
            
            # This would need to be implemented based on KDF API
            # For now, return empty structure
            return {"swaps": []}
        except Exception as e:
            logger.error(f"Error getting recent swaps: {e}")
            return {"swaps": []}
    
    def update_all_entities(self):
        """Update all Home Assistant entities with latest KDF data"""
        logger.info("Collecting KDF data...")
        
        # Get KDF data
        status_data = self.get_kdf_status()
        best_orders = self.get_best_orders()
        active_swaps = self.get_active_swaps()
        my_orders = self.get_my_orders()
        recent_swaps = self.get_recent_swaps()
        
        # Log the data (for now, until we implement proper entity creation)
        logger.info(f"KDF Status: {status_data}")
        logger.info(f"Best Orders: {len(best_orders.get('buy_orders', []))} buy, {len(best_orders.get('sell_orders', []))} sell")
        logger.info(f"Active Swaps: {len(active_swaps.get('swaps', []))}")
        logger.info(f"My Orders: {len(my_orders.get('orders', []))}")
        logger.info(f"Recent Swaps: {len(recent_swaps.get('swaps', []))}")
        
        logger.info("KDF data collection completed")

        # Update Supervisor / Home Assistant entities for core info
        try:
            # Refresh selected fiat from options.json (authoritative)
            opts = load_addon_options()
            sel_fiat = opts.get('selected_fiat_currency', self.selected_fiat_currency)

            # Prepare hadex_status entity
            status_attrs = {
                'friendly_name': 'HADEX Status',
                'icon': 'mdi:chart-line',
                'version': status_data.get('version', ''),
                'peer_count': status_data.get('peer_count', 0),
                'enabled_coins': status_data.get('enabled_coins', []),
                'timestamp': status_data.get('timestamp', time.time())
            }
            try:
                self.update_ha_entity('sensor.hadex_status', status_data.get('status', 'disconnected'), status_attrs)
            except Exception as e:
                logger.warning(f"Failed to update sensor.hadex_status: {e}")

            # Prepare hadex_selected_fiat entity
            fiat_attrs = {
                'friendly_name': 'HADEX Selected Fiat',
                'icon': 'mdi:currency-usd',
                'description': 'User selected fiat currency (from addon options)',
                'timestamp': time.time()
            }
            try:
                # If no fiat selected, set state to 'N/A'
                fiat_state = sel_fiat if sel_fiat else 'N/A'
                self.update_ha_entity('sensor.hadex_selected_fiat', fiat_state, fiat_attrs)
            except Exception as e:
                logger.warning(f"Failed to update sensor.hadex_selected_fiat: {e}")
        except Exception as e:
            logger.error(f"Error updating HA supervisor entities: {e}")

    def create_ha_entities(self):
        """Create Home Assistant entities for KDF data.

        This implementation is intentionally lightweight: the addon/HA integration
        manages entity registration. Here we log intent and mark entities as created
        so the run loop can continue without raising AttributeError.
        """
        try:
            logger.info("Creating Home Assistant entities (stub)")
            # In a full implementation we would call self.create_ha_entity(...) for each
            # entity we wish to register. For now, mark as created to avoid repeated
            # registration attempts and to allow the update loop to run.
            self.entities_created = True
        except Exception as e:
            logger.error(f"Failed to create Home Assistant entities: {e}")

    def rpc_call(self, method: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Wrapper around KDF RPC that logs request and response for debugging.

        Returns whatever the underlying API returns. May raise exceptions.
        """
        try:
            logger.debug(f"KDF RPC call -> method: {method}, params: {params}")

            # Decide version: consult method_versions override, then legacy_methods
            mv = self.method_versions.get(method)
            if mv == 'legacy' or mv == 'v1':
                is_legacy = True
            elif mv == 'v2':
                is_legacy = False
            else:
                is_legacy = method in self.legacy_methods

            rpc_url = f'http://127.0.0.1:{self.rpc_port}/'
            headers = {'Content-Type': 'application/json'}

            # Build payload
            if is_legacy:
                payload = {'method': method}
                if isinstance(params, dict):
                    for k, v in params.items():
                        payload[k] = v
            else:
                # Special-case get_enabled_coins: omit params due to upstream bug
                if method == 'get_enabled_coins':
                    payload = {'method': method, 'mmrpc': '2.0'}
                else:
                    payload = {'method': method, 'mmrpc': '2.0', 'params': params or {}}

            # `version` method does not require RPC auth; enforce rpc_password is present for other methods
            if method != 'version' and not self.rpc_password:
                raise Exception(f"rpc_password is missing in /data/options.json; required for RPC method: {method}. Please set 'rpc_password' in addon options.")
            if self.rpc_password:
                payload['userpass'] = self.rpc_password

            # Logging
            masked = dict(payload)
            if 'userpass' in masked:
                masked['userpass'] = '***'
            logger.debug(f"KDF RPC outgoing masked payload: {masked}")
            logger.debug(f"KDF RPC outgoing raw payload: {payload}")

            # POST
            resp = requests.post(rpc_url, json=payload, headers=headers, timeout=5)
            logger.debug(f"KDF RPC response status={getattr(resp, 'status_code', 'n/a')}")
            try:
                text = resp.text
                logger.debug(f"KDF RPC response body: {text}")
            except Exception:
                text = ''

            if resp.status_code >= 400:
                # Retry workaround for v2 methods that fail with empty params
                if not is_legacy and isinstance(payload.get('params', None), dict) and payload.get('params') == {}:
                    lw = text.lower()
                    if 'expected unit struct' in lw or 'invalid type: map' in lw or 'getenabledcoinsrequest' in lw:
                        # retry without params
                        alt_payload = {'method': method, 'mmrpc': '2.0'}
                        if self.rpc_password:
                            alt_payload['userpass'] = self.rpc_password
                        logger.debug(f"Retrying KDF RPC without params for method={method}: masked={ {k:(v if k!='userpass' else '***') for k,v in alt_payload.items()} }")
                        alt_resp = requests.post(rpc_url, json=alt_payload, headers=headers, timeout=5)
                        try:
                            alt_text = alt_resp.text
                            logger.debug(f"KDF RPC retry response body: {alt_text}")
                        except Exception:
                            alt_text = ''
                        alt_resp.raise_for_status()
                        try:
                            return alt_resp.json()
                        except Exception:
                            return alt_text
                resp.raise_for_status()

            try:
                return resp.json()
            except Exception:
                return text
        except Exception as e:
            logger.error(f"KDF RPC call failed for method {method}: {e}")
            raise
    
    def run(self):
        """Main run loop"""
        logger.info("Starting KDF Home Assistant Integration...")
        
        # Wait for KDF to be ready with initial delay
        logger.info("Waiting for KDF to be ready...")
        time.sleep(5)  # Initial delay to let KDF fully start
        
        max_retries = 30
        retry_count = 0
        
        while retry_count < max_retries:
            if self.initialize_kdf():
                # Test the connection with a simple request
                if self.test_kdf_connection():
                    logger.info("KDF is ready and responding to requests")
                    break
                else:
                    logger.info("KDF initialized but not responding yet, waiting...")
            retry_count += 1
            logger.info(f"Retry {retry_count}/{max_retries} - waiting for KDF...")
            time.sleep(15)  # Longer delay between retries
        
        if not self.kdf_api:
            logger.error("Failed to initialize KDF API after maximum retries")
            return
        
        # Create Home Assistant entities
        logger.info("Creating Home Assistant entities...")
        self.create_ha_entities()
        
        # Main update loop
        logger.info(f"Starting update loop (interval: {self.update_interval}s)")
        while True:
            try:
                self.update_all_entities()
                time.sleep(self.update_interval)
            except KeyboardInterrupt:
                logger.info("Received interrupt signal, shutting down...")
                break
            except Exception as e:
                logger.error(f"Error in update loop: {e}")
                time.sleep(5)  # Wait before retrying

if __name__ == "__main__":
    integration = KDFHAIntegration()
    # Early fail: ensure rpc_password is configured for normal operation (version method is exception)
    if not integration.rpc_password:
        print('[kdf-ha] ERROR: rpc_password is missing in /data/options.json. The HA integration requires rpc_password for authenticated KDF RPC calls (the "version" method is an exception). Please set "rpc_password" in addon options and restart the addon.')
        sys.exit(1)
    integration.run()
