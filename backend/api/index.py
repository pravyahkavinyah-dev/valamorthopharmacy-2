"""
PharmaPOS Backend — Sale Fix
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

def handle_sales(sb, method, path, body):
    if method == "POST":
        # Separate items from the main sale data
        items = body.pop('items', [])
        
        # 1. Save the main Sale
        res = sb.table("sales").insert(body).execute()
        if not res.data:
            return {"error": "Failed to create sale"}
        
        sale_id = res.data[0]['id']
        
        # 2. Save each item and update stock
        for item in items:
            item['sale_id'] = sale_id
            sb.table("sale_items").insert(item).execute()
            
            # Update inventory quantity
            inv = sb.table("inventory").select("quantity").eq("id", item['inventory_id']).execute()
            if inv.data:
                new_qty = inv.data[0]['quantity'] - item['quantity']
                sb.table("inventory").update({"quantity": new_qty}).eq("id", item['inventory_id']).execute()
                
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
                res = sb.table("medicines").insert(body).execute() if method == "POST" else sb.table("medicines").select("*").order("name").execute()
                result = {"data": res.data, "success": True}
            elif path.startswith("/api/inventory"):
                if method == "PUT":
                    parts = path.rstrip("/").split("/")
                    res = sb.table("inventory").update(body).eq("id", parts[-1]).execute()
                elif method == "POST":
                    res = sb.table("inventory").insert(body).execute()
                else:
                    res = sb.table("inventory").select("*, medicines(name)").order("expiry").execute()
                result = {"data": res.data, "success": True}
            elif path.startswith("/api/sales"):
                result = handle_sales(sb, method, path, body)
            elif path.startswith("/api/shortbook"):
                res = sb.table("short_book").select("*").execute()
                result = {"data": res.data}
            else:
                result = {"status": "Online"}
            json_response(self, result)
        except Exception as e:
            json_response(self, {"error": str(e), "traceback": traceback.format_exc()}, 500)
