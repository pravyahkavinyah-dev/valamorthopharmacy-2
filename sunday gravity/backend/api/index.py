"""
PharmaPOS Backend — Full Production API
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

def get_body(handler):
    length = int(handler.headers.get("Content-Length", 0))
    return json.loads(handler.rfile.read(length)) if length else {}

# --- Route handlers ---

def handle_medicines(sb, method, path, body):
    if method == "POST":
        res = sb.table("medicines").insert(body).execute()
        return {"data": res.data, "success": True}
    res = sb.table("medicines").select("*").order("name").execute()
    return {"data": res.data}

def handle_inventory(sb, method, path, body):
    parts = path.rstrip("/").split("/")
    inv_id = parts[-1] if len(parts) > 3 else None

    if method == "POST":
        res = sb.table("inventory").insert(body).execute()
        return {"data": res.data, "success": True}
    elif method == "PUT" and inv_id:
        res = sb.table("inventory").update(body).eq("id", inv_id).execute()
        return {"data": res.data, "success": True}
    
    res = sb.table("inventory").select("*, medicines(name)").order("expiry").execute()
    return {"data": res.data}

def handle_sales(sb, method, path, body):
    if method == "POST":
        res = sb.table("sales").insert(body).execute()
        return {"data": res.data, "success": True}
    res = sb.table("sales").select("*, items:sale_items(*)").order("created_at", desc=True).execute()
    return {"data": res.data}

# --- Main Handler ---
class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self): json_response(self, {}, 204)
    def do_GET(self): self._handle("GET")
    def do_POST(self): self._handle("POST")
    def do_PUT(self): self._handle("PUT")

    def _handle(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        body = get_body(self) if method in ["POST", "PUT"] else {}
        sb = get_supabase()
        
        try:
            if path.startswith("/api/medicines"):
                result = handle_medicines(sb, method, path, body)
            elif path.startswith("/api/inventory"):
                result = handle_inventory(sb, method, path, body)
            elif path.startswith("/api/sales"):
                result = handle_sales(sb, method, path, body)
            elif path.startswith("/api/purchases"):
                res = sb.table("purchases").select("*").execute()
                result = {"data": res.data}
            elif path.startswith("/api/shor_tbook"):
                res = sb.table("short_book").select("*").execute()
                result = {"data": res.data}
            else:
                result = {"status": "Online", "msg": "API Ready"}
            json_response(self, result)
        except Exception as e:
            json_response(self, {"error": str(e), "traceback": traceback.format_exc()}, 500)
