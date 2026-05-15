# Pharmacy POS MVP

Modern lightweight Pharmacy POS with a single-file frontend, Python API, Supabase database/auth, and TOTP 2FA.

## Structure

- `frontend/index.html`: responsive, accessible POS app UI.
- `backend/api/index.py`: FastAPI endpoints for auth, inventory, sales, purchase, reports.
- `database/schema.sql`: Supabase schema, constraints, indexes, RLS.
- `database/seed.sql`: starter medicine and inventory data.
- `backend/vercel.json`: Vercel Python deployment config.
- `netlify.toml`: Netlify frontend publish + API redirect.

## Environment Variables (Backend)

Copy `backend/.env.example` to `backend/.env` and configure:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_JWT_SECRET`
- `APP_JWT_ISSUER`
- `APP_JWT_AUDIENCE`
- `APP_TOKEN_TTL_MINUTES`
- `TOTP_ENCRYPTION_KEY` (Fernet key; generate with Python `Fernet.generate_key()`).
- `CORS_ORIGINS` (comma-separated frontend URLs)

## Supabase Setup

1. Run `database/schema.sql` in Supabase SQL Editor.
2. Run `database/seed.sql`.
3. Enable email/password in Supabase Auth.
4. Create a test user from Supabase Auth dashboard.

## Local Development

Backend:

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
uvicorn api.index:app --reload
```

Frontend:

- Serve `frontend/` with any static server and open `index.html`.
- Set browser local storage key `api_base_url` to backend URL (`http://localhost:8000` by default).

## Deployment

### Backend on Vercel

1. Import `backend` directory as Vercel project.
2. Add env vars from `.env.example`.
3. Deploy and copy API URL.

### Frontend on Netlify

1. Import repository and set publish directory to `frontend`.
2. Update `netlify.toml` redirect destination with Vercel backend URL.
3. Deploy.

## Implemented MVP Modules

- Dashboard: sales/purchase snapshots + alerts.
- Sales: cart, live calculations, bill creation, printable invoice.
- Purchase: quick bill entry and stock increase.
- Inventory: batch listing and stock adjustment.
- Short Book: reorder view from low-stock batches.
- Reports: daily/monthly report snapshots.
- Auth: Supabase login + Google Authenticator-compatible TOTP verification.
