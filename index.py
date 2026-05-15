"""
PharmaPOS Backend — Main API Router
Vercel Serverless Python Function
"""
import os
import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from supabase import create_client, Client
from jose import jwt
import pyotp

# --- Environment ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "pharmapos-secret-key")

# --- Supabase Client Management ---
_supabase: Client = None

def get_supabase() -> Client:
    """Get or create a global Supabase client instance."""
    global _supabase
    if _supabase is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
        
        if not url or not key:
            raise ValueError("CRITICAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY is not set in Vercel environment variables.")
        
        _supabase = create_client(url, key)
    return _supabase

def json_response(handler, data, status=200):
    """Send JSON response."""
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization")
    handler.end_headers()
    handler.wfile.write(json.dumps(data).encode())

def get_body(handler):
    """Parse JSON request body."""
    length = int(handler.headers.get("Content-Length", 0))
    if length:
        return json.loads(handler.rfile.read(length))
    return {}

def verify_token(handler):
    """Verify JWT token from Authorization header."""
    auth = handler.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise ValueError("Missing or invalid Authorization header")
    token = auth[7:]
    # Decode using our app's JWT_SECRET
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])

# --- Route handlers ---

def handle_auth(handler, method, path, body):
    """Authentication endpoints."""
    sb = get_supabase()

    if path == "/api/auth/login" and method == "POST":
        email = body.get("email", "")
        password = body.get("password", "")
        try:
            res = sb.auth.sign_in_with_password({"email": email, "password": password})
            token = jwt.encode(
                {"sub": res.user.id, "email": email, "role": "authenticated"},
                JWT_SECRET, algorithm="HS256"
            )
            return {"success": True, "token": token, "user": {"id": res.user.id, "email": email}}
        except Exception as e:
            return {"success": False, "error": str(e)}

    if path == "/api/auth/setup-2fa" and method == "POST":
        user = verify_token(handler)
        if not user:
            return {"success": False, "error": "Unauthorized"}
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        uri = totp.provisioning_uri(name=user.get("email", ""), issuer_name="PharmaPOS")
        # Store secret in user metadata via Supabase
        try:
            sb.table("user_2fa").upsert({"user_id": user["sub"], "totp_secret": secret}).execute()
        except Exception:
            pass
        return {"success": True, "secret": secret, "uri": uri}

    if path == "/api/auth/verify-2fa" and method == "POST":
        code = body.get("code", "")
        token = body.get("token", "")
        try:
            user_data = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            res = sb.table("user_2fa").select("totp_secret").eq("user_id", user_data["sub"]).single().execute()
            secret = res.data.get("totp_secret", "")
            totp = pyotp.TOTP(secret)
            if totp.verify(code):
                return {"success": True}
            return {"success": False, "error": "Invalid code"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    return {"error": "Not found"}

def handle_medicines(handler, method, path, body):
    """Medicines CRUD."""
    sb = get_supabase()
    parts = path.rstrip("/").split("/")
    med_id = parts[3] if len(parts) > 3 else None

    if method == "GET" and not med_id:
        res = sb.table("medicines").select("*").order("name").execute()
        return {"data": res.data}
    if method == "GET" and med_id:
        res = sb.table("medicines").select("*").eq("id", med_id).single().execute()
        return {"data": res.data}
    if method == "POST":
        res = sb.table("medicines").insert(body).execute()
        return {"data": res.data, "success": True}
    if method == "PUT" and med_id:
        res = sb.table("medicines").update(body).eq("id", med_id).execute()
        return {"data": res.data, "success": True}
    if method == "DELETE" and med_id:
        sb.table("medicines").delete().eq("id", med_id).execute()
        return {"success": True}
    return {"error": "Invalid request"}

def handle_inventory(handler, method, path, body):
    """Inventory CRUD with batch/expiry management."""
    sb = get_supabase()
    parts = path.rstrip("/").split("/")
    inv_id = parts[3] if len(parts) > 3 else None

    if method == "GET" and not inv_id:
        q = sb.table("inventory").select("*, medicines(name, category, min_stock, max_stock)").order("created_at", desc=True)
        res = q.execute()
        return {"data": res.data}
    if method == "GET" and inv_id:
        res = sb.table("inventory").select("*").eq("id", inv_id).single().execute()
        return {"data": res.data}
    if method == "POST":
        # Validate stock
        if body.get("quantity", 0) < 0:
            return {"error": "Quantity cannot be negative", "success": False}
        res = sb.table("inventory").insert(body).execute()
        return {"data": res.data, "success": True}
    if method == "PUT" and inv_id:
        res = sb.table("inventory").update(body).eq("id", inv_id).execute()
        return {"data": res.data, "success": True}
    if method == "DELETE" and inv_id:
        sb.table("inventory").delete().eq("id", inv_id).execute()
        return {"success": True}

    # Special endpoints
    if path.endswith("/low-stock"):
        res = sb.rpc("get_low_stock").execute()
        return {"data": res.data}
    if path.endswith("/expiring"):
        res = sb.from_("v_expiring_soon").select("*").execute()
        return {"data": res.data}

    return {"error": "Invalid request"}

def handle_sales(handler, method, path, body):
    """Sales CRUD with inventory deduction."""
    sb = get_supabase()
    parts = path.rstrip("/").split("/")
    sale_id = parts[3] if len(parts) > 3 else None

    if method == "GET" and not sale_id:
        res = sb.table("sales").select("*").order("created_at", desc=True).execute()
        return {"data": res.data}
    if method == "GET" and sale_id:
        sale = sb.table("sales").select("*").eq("id", sale_id).single().execute()
        items = sb.table("sale_items").select("*").eq("sale_id", sale_id).execute()
        return {"data": {**sale.data, "items": items.data}}
    if method == "POST":
        items = body.pop("items", [])
        # Insert sale header
        sale_res = sb.table("sales").insert(body).execute()
        sale_data = sale_res.data[0]
        # Insert items & deduct inventory
        for item in items:
            item["sale_id"] = sale_data["id"]
            sb.table("sale_items").insert(item).execute()
            # Deduct from inventory
            if item.get("inventory_id"):
                inv = sb.table("inventory").select("quantity").eq("id", item["inventory_id"]).single().execute()
                new_qty = max(0, inv.data["quantity"] - item.get("quantity", 0))
                sb.table("inventory").update({"quantity": new_qty}).eq("id", item["inventory_id"]).execute()
        return {"data": sale_data, "success": True}
    if method == "DELETE" and sale_id:
        sb.table("sale_items").delete().eq("sale_id", sale_id).execute()
        sb.table("sales").delete().eq("id", sale_id).execute()
        return {"success": True}
    return {"error": "Invalid request"}

def handle_purchases(handler, method, path, body):
    """Purchase CRUD with inventory addition."""
    sb = get_supabase()
    parts = path.rstrip("/").split("/")
    pur_id = parts[3] if len(parts) > 3 else None

    if method == "GET" and not pur_id:
        res = sb.table("purchases").select("*").order("created_at", desc=True).execute()
        return {"data": res.data}
    if method == "POST":
        items = body.pop("items", [])
        pur_res = sb.table("purchases").insert(body).execute()
        pur_data = pur_res.data[0]
        for item in items:
            item["purchase_id"] = pur_data["id"]
            sb.table("purchase_items").insert(item).execute()
            # Add to inventory
            sb.table("inventory").insert({
                "medicine_id": item.get("medicine_id"),
                "batch": item.get("batch"),
                "expiry": item.get("expiry"),
                "mrp": item.get("mrp"),
                "ptr": item.get("ptr"),
                "quantity": item.get("quantity", 0) + item.get("free_quantity", 0),
                "purchase_id": pur_data["id"]
            }).execute()
        return {"data": pur_data, "success": True}
    if method == "DELETE" and pur_id:
        sb.table("purchase_items").delete().eq("purchase_id", pur_id).execute()
        sb.table("purchases").delete().eq("id", pur_id).execute()
        return {"success": True}
    return {"error": "Invalid request"}

def handle_shortbook(handler, method, path, body):
    """Short Book CRUD."""
    sb = get_supabase()
    parts = path.rstrip("/").split("/")
    sb_id = parts[3] if len(parts) > 3 else None

    if method == "GET":
        res = sb.table("short_book").select("*").order("created_at", desc=True).execute()
        return {"data": res.data}
    if method == "POST":
        res = sb.table("short_book").insert(body).execute()
        return {"data": res.data, "success": True}
    if method == "PUT" and sb_id:
        res = sb.table("short_book").update(body).eq("id", sb_id).execute()
        return {"data": res.data, "success": True}
    return {"error": "Invalid request"}

def handle_reports(handler, method, path, body):
    """Reports endpoints."""
    sb = get_supabase()

    if path.endswith("/daily"):
        res = sb.from_("v_daily_sales").select("*").limit(30).execute()
        return {"data": res.data}
    if path.endswith("/summary"):
        stock = sb.from_("v_stock_summary").select("*").execute()
        expiring = sb.from_("v_expiring_soon").select("*").execute()
        return {"data": {"stock": stock.data, "expiring": expiring.data}}
    return {"error": "Invalid report type"}

# --- Main Handler ---
class handler(BaseHTTPRequestHandler):
    """Vercel serverless function handler."""

    def do_OPTIONS(self):
        json_response(self, {}, 204)

    def do_GET(self):
        self._handle("GET")

    def do_POST(self):
        self._handle("POST")

    def do_PUT(self):
        self._handle("PUT")

    def do_DELETE(self):
        self._handle("DELETE")

    def _handle(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        body = get_body(self) if method in ("POST", "PUT") else {}

        # Auth check (skip for login/2fa and OPTIONS)
        if not path.startswith("/api/auth") and method != "OPTIONS":
            try:
                user = verify_token(self)
            except Exception as e:
                json_response(self, {"error": "Unauthorized", "details": str(e)}, 401)
                return

        # Route to handlers
        try:
            if path.startswith("/api/auth"):
                result = handle_auth(self, method, path, body)
            elif path.startswith("/api/medicines"):
                result = handle_medicines(self, method, path, body)
            elif path.startswith("/api/inventory"):
                result = handle_inventory(self, method, path, body)
            elif path.startswith("/api/sales"):
                result = handle_sales(self, method, path, body)
            elif path.startswith("/api/purchases"):
                result = handle_purchases(self, method, path, body)
            elif path.startswith("/api/shortbook"):
                result = handle_shortbook(self, method, path, body)
            elif path.startswith("/api/reports"):
                result = handle_reports(self, method, path, body)
            else:
                result = {"error": "Not found", "routes": [
                    "/api/auth/*", "/api/medicines", "/api/inventory",
                    "/api/sales", "/api/purchases", "/api/shortbook", "/api/reports"
                ]}
            json_response(self, result)
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            json_response(self, {"error": str(e), "traceback": error_details}, 500)
