import os
import json
import urllib.request
import urllib.error
import urllib.parse
from jose import jwt

JWT_SECRET = "zrHPeHoI1h0YqLz0+mpKUuuQHWhFOEuobgoIe00l7O2joArcSCwsIHzUw94rzRE25UotV3GTtgVgbmJkRVBSHg=="
token = jwt.encode({"sub": "test-user"}, JWT_SECRET, algorithm="HS256")

url = "https://valamorthopharmacy-2.vercel.app/api/medicines"
req = urllib.request.Request(url, method="POST")
req.add_header("Authorization", f"Bearer {token}")
req.add_header("Content-Type", "application/json")
data = json.dumps({"name": "Test Medicine", "category": "", "manufacturer": "", "units_per_pack": 1, "gst_percent": 12, "min_stock": 10, "max_stock": 500}).encode("utf-8")

try:
    with urllib.request.urlopen(req, data=data) as response:
        print("Status:", response.status)
        print("Response:", response.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    print("Error Body:", e.read().decode())
except Exception as e:
    print("Other Error:", str(e))
