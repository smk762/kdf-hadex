#!/usr/bin/env python3
"""
Simple test panel server
"""

import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

class TestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(b'<h1>KDF Panel Test</h1><p>Panel server is working!</p>')
    
    def log_message(self, format, *args):
        print(f"[TEST] {format % args}")

def main():
    try:
        print("Starting test panel server...")
        port = 8099
        server = HTTPServer(('0.0.0.0', port), TestHandler)
        print(f"Test server listening on port {port}")
        server.serve_forever()
    except Exception as e:
        print(f"Test server error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
