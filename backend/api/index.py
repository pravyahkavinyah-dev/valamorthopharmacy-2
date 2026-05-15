"""
PharmaPOS Backend — Main API Router (TEMPORARY BYPASS)
"""
import os
import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse
from supabase import create_client, Client
import traceback

# --- Environment ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY", "")

_supabase: Client = None

def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase

def json_response(handler, data, status=200):
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization")
    handler.end_headers()
    handler.wfile.write(json.dumps(data).encode())

# --- Route handlers ---

def handle_medicines(handler, method, path, body):
    sb = get_supabase()
    res = sb.table("medicines").select("*").order("name").execute()
    return {"data": res.data}

def handle_inventory(handler, method, path, body):
    sb = get_supabase()
    res = sb.table("inventory").select("*, medicines(name)").order("expiry").execute()
    return {"data": res.data}

# --- Main Handler ---
class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self): json_response(self, {}, 204)
    def do_GET(self): self._handle("GET")
    def do_POST(self): self._handle("POST")

    def _handle(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        
        # SKIP SECURITY CHECK FOR NOW TO TEST CONNECTION
        try:
            if path.startswith("/api/medicines"):
                result = handle_medicines(self, method, path, {})
            elif path.startswith("/api/inventory"):
                result = handle_inventory(self, method, path, {})
            else:
                result = {"status": "Security Bypassed", "msg": "API is online"}
            json_response(self, result)
        except Exception as e:
            json_response(self, {"error": str(e), "traceback": traceback.format_exc()}, 500)

