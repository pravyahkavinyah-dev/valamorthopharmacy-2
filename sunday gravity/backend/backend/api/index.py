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
import traceback

# --- Environment ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get("APP_JWT_SECRET") or "pharmapos-secret-key"

# --- Supabase Client Management ---
_supabase: Client = None

def get_supabase() -> Client:
    """Get or create a global Supabase client instance."""
    global _supabase
    if _supabase is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("CRITICAL: SUPABASE_URL or SUPABASE_KEY not set in Vercel!")
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
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
        raise ValueError("No Bearer token found. Please log out and log in again.")
    
    token = auth[7:]
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except Exception as e:
        raise ValueError(f"Token verification failed: {str(e)}")

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

    return {"error": "Not found"}

def handle_medicines(handler, method, path, body):
    """Medicines CRUD."""
    sb = get_supabase()
    parts = path.rstrip("/").split("/")
    med_id = parts[3] if len(parts) > 3 else None

    if method == "GET" and not med_id:
        res = sb.table("medicines").select("*").order("name").execute()
        return {"data": res.data}
    if method == "POST":
        res = sb.table("medicines").insert(body).execute()
        return {"data": res.data, "success": True}
    return {"error": "Invalid request"}

def handle_inventory(handler, method, path, body):
    """Inventory CRUD."""
    sb = get_supabase()
    parts = path.rstrip("/").split("/")
    inv_id = parts[3] if len(parts) > 3 else None

    if method == "GET" and not inv_id:
        res = sb.table("inventory").select("*, medicines(name)").order("expiry").execute()
        return {"data": res.data}
    if method == "POST":
        res = sb.table("inventory").insert(body).execute()
        return {"data": res.data, "success": True}
    return {"error": "Invalid request"}

# --- Main Handler ---
class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        json_response(self, {}, 204)

    def do_GET(self): self._handle("GET")
    def do_POST(self): self._handle("POST")
    def do_PUT(self): self._handle("PUT")
    def do_DELETE(self): self._handle("DELETE")

    def _handle(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        body = get_body(self) if method in ("POST", "PUT") else {}

        if not path.startswith("/api/auth") and method != "OPTIONS":
            try:
                user = verify_token(self)
            except Exception as e:
                json_response(self, {"error": "Unauthorized", "details": str(e)}, 401)
                return

        try:
            if path.startswith("/api/auth"):
                result = handle_auth(self, method, path, body)
            elif path.startswith("/api/medicines"):
                result = handle_medicines(self, method, path, body)
            elif path.startswith("/api/inventory"):
                result = handle_inventory(self, method, path, body)
            else:
                result = {"error": "Not found"}
            json_response(self, result)
        except Exception as e:
            json_response(self, {"error": str(e), "traceback": traceback.format_exc()}, 500)
