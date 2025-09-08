#!/usr/bin/env python3
"""Generate MM2.json from /data/options.json

This script centralises MM2.json creation so it can be invoked from the kdf run
script and from the integration service if needed.
"""
import json
import os
import requests
import shutil
import sys
import secrets
import string


OPTIONS_PATH = '/data/options.json'
MM2_PATH = '/root/.kdf/MM2.json'

def load_opts():
    try:
        if os.path.exists(OPTIONS_PATH):
            with open(OPTIONS_PATH, 'r') as f:
                return json.load(f) or {}
    except Exception:
        pass
    return {}


# Ensure wallet_password and rpc_password exist; generate strong defaults if missing
def generate_password(length: int = 16) -> str:
    chars = string.ascii_letters + string.digits + '!@#%^&*()-_=+'
    while True:
        pw = ''.join(secrets.choice(chars) for _ in range(length))
        if (any(c.isdigit() for c in pw) and any(c.islower() for c in pw)
                and any(c.isupper() for c in pw) and any(c in '!@#%^&*()-_=+' for c in pw)):
            return pw

def write_mm2(opts: dict):
    netid = opts.get('netid', 8762)
    rpcport = opts.get('rpc_port', 7783)
    seednodes = opts.get('seednodes') or ["seed01.kmdefi.net", "seed02.kmdefi.net", "balerion.dragon-seed.com", "drogon.dragon-seed.com", "falkor.dragon-seed.com"]
    wallet_name = opts.get('wallet_name')
    if not wallet_name:
        print('wallet_name missing in options; set "wallet_name" in config.yaml', file=sys.stderr)
        return False
    wallet_password = opts.get('wallet_password')
    if not wallet_password:
        print('wallet_password missing in options; set "wallet_password" in config.yaml', file=sys.stderr)
        return False

    rpcip = opts.get('kdf_rpcip', '0.0.0.0')
    rpc_password = opts.get('rpc_password', generate_password(16))
    
    import_mnemonic = bool(opts.get('import_mnemonic', False))
    bip39 = opts.get('bip39_mnemonic', '') if import_mnemonic else ''

    mm2 = {
        "gui": "HADEX",
        "enable_hd": True,
        "use_watchers": True,
        "dbdir": "/data/.kdf/",
        "netid": netid,
        "rpcport": rpcport,
        "seednodes": seednodes,
        "wallet_name": wallet_name,
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

    # include passphrase only when import requested
    if import_mnemonic and bip39:
        mm2['passphrase'] = bip39

    try:
        os.makedirs(os.path.dirname(MM2_PATH), exist_ok=True)

        with open(MM2_PATH, 'w') as f:
            json.dump(mm2, f, indent=4)
            f.write('\n')
        print('MM2.json written')

        for k, v in mm2.items():
            opts[k] = v
        with open(OPTIONS_PATH, 'w') as f:
            json.dump(opts, f, indent=4)
            f.write('\n')
        print('options.json written')

        return True
    except Exception as e:
        print('Failed to write MM2.json:', e)
        return False

if __name__ == '__main__':
    opts = load_opts()
    ok = write_mm2(opts)
    if not ok:
        raise SystemExit(1)

