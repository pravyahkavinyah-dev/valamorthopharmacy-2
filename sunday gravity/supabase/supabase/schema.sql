-- ============================================================
-- Pharmacy POS — Supabase PostgreSQL Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. MEDICINES (Master catalog)
-- ============================================================
CREATE TABLE medicines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    category        TEXT,
    manufacturer    TEXT,
    hsn_code        TEXT,
    units_per_pack  INTEGER DEFAULT 1,
    gst_percent     NUMERIC(5,2) DEFAULT 0,
    min_stock       INTEGER DEFAULT 10,
    max_stock       INTEGER DEFAULT 500,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. INVENTORY (Batch-wise stock tracking)
-- ============================================================
CREATE TABLE inventory (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medicine_id     UUID REFERENCES medicines(id) ON DELETE CASCADE,
    batch           TEXT NOT NULL,
    expiry          DATE NOT NULL,
    mrp             NUMERIC(10,2) NOT NULL,
    ptr             NUMERIC(10,2),
    quantity        INTEGER NOT NULL DEFAULT 0,
    free_quantity   INTEGER DEFAULT 0,
    purchase_id     UUID, -- reference to the purchase that added this stock
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast expiry lookups
CREATE INDEX idx_inventory_expiry ON inventory(expiry);
CREATE INDEX idx_inventory_medicine ON inventory(medicine_id);

-- ============================================================
-- 3. CUSTOMERS
-- ============================================================
CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    age             INTEGER,
    mobile          TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. DISTRIBUTORS
-- ============================================================
CREATE TABLE distributors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    contact         TEXT,
    address         TEXT,
    gst_number      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. SALES (Bill header)
-- ============================================================
CREATE TABLE sales (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_number     TEXT UNIQUE NOT NULL,
    bill_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    customer_id     UUID REFERENCES customers(id),
    customer_name   TEXT,
    customer_age    INTEGER,
    customer_mobile TEXT,
    subtotal        NUMERIC(12,2) DEFAULT 0,
    discount_total  NUMERIC(12,2) DEFAULT 0,
    gst_total       NUMERIC(12,2) DEFAULT 0,
    consultation    NUMERIC(10,2) DEFAULT 0,
    grand_total     NUMERIC(12,2) DEFAULT 0,
    payment_method  TEXT CHECK (payment_method IN ('cash', 'upi', 'card', 'mixed')) DEFAULT 'cash',
    created_by      UUID, -- user id from supabase auth
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. SALE_ITEMS (Bill line items)
-- ============================================================
CREATE TABLE sale_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id         UUID REFERENCES sales(id) ON DELETE CASCADE,
    medicine_id     UUID REFERENCES medicines(id),
    inventory_id    UUID REFERENCES inventory(id),
    medicine_name   TEXT NOT NULL,
    batch           TEXT,
    expiry          DATE,
    mrp             NUMERIC(10,2) NOT NULL,
    quantity        INTEGER NOT NULL,
    units_per_pack  INTEGER DEFAULT 1,
    discount        NUMERIC(5,2) DEFAULT 0,
    gst_percent     NUMERIC(5,2) DEFAULT 0,
    gst_amount      NUMERIC(10,2) DEFAULT 0,
    amount          NUMERIC(12,2) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. PURCHASES (Purchase header)
-- ============================================================
CREATE TABLE purchases (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_number     TEXT NOT NULL,
    bill_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    distributor_id  UUID REFERENCES distributors(id),
    distributor_name TEXT,
    subtotal        NUMERIC(12,2) DEFAULT 0,
    discount_total  NUMERIC(12,2) DEFAULT 0,
    gst_total       NUMERIC(12,2) DEFAULT 0,
    grand_total     NUMERIC(12,2) DEFAULT 0,
    created_by      UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. PURCHASE_ITEMS (Purchase line items)
-- ============================================================
CREATE TABLE purchase_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id     UUID REFERENCES purchases(id) ON DELETE CASCADE,
    medicine_id     UUID REFERENCES medicines(id),
    medicine_name   TEXT NOT NULL,
    batch           TEXT NOT NULL,
    expiry          DATE NOT NULL,
    mrp             NUMERIC(10,2) NOT NULL,
    ptr             NUMERIC(10,2),
    quantity        INTEGER NOT NULL,
    free_quantity   INTEGER DEFAULT 0,
    discount        NUMERIC(5,2) DEFAULT 0,
    gst_percent     NUMERIC(5,2) DEFAULT 0,
    gst_amount      NUMERIC(10,2) DEFAULT 0,
    amount          NUMERIC(12,2) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. SHORT_BOOK (Reorder tracking)
-- ============================================================
CREATE TABLE short_book (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medicine_id     UUID REFERENCES medicines(id) ON DELETE CASCADE,
    medicine_name   TEXT NOT NULL,
    current_stock   INTEGER DEFAULT 0,
    min_stock       INTEGER DEFAULT 0,
    max_stock       INTEGER DEFAULT 0,
    reorder_qty     INTEGER DEFAULT 0,
    status          TEXT CHECK (status IN ('pending', 'ordered', 'received')) DEFAULT 'pending',
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. STOCK_ADJUSTMENTS (Audit trail)
-- ============================================================
CREATE TABLE stock_adjustments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id    UUID REFERENCES inventory(id) ON DELETE CASCADE,
    medicine_id     UUID REFERENCES medicines(id),
    adjustment_type TEXT CHECK (adjustment_type IN ('opening', 'add', 'remove', 'damage', 'expired', 'return')) NOT NULL,
    quantity        INTEGER NOT NULL,
    reason          TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE short_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

-- Policies: Authenticated users can do everything (pharmacy staff)
CREATE POLICY "Authenticated users full access" ON medicines
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON inventory
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON customers
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON distributors
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON sales
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON sale_items
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON purchases
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON purchase_items
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON short_book
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON stock_adjustments
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- HELPER VIEWS
-- ============================================================

-- View: Current stock per medicine with low stock flag
CREATE OR REPLACE VIEW v_stock_summary AS
SELECT 
    m.id AS medicine_id,
    m.name AS medicine_name,
    m.category,
    m.min_stock,
    m.max_stock,
    COALESCE(SUM(i.quantity), 0) AS total_stock,
    CASE WHEN COALESCE(SUM(i.quantity), 0) <= m.min_stock THEN TRUE ELSE FALSE END AS is_low_stock,
    MIN(i.expiry) AS nearest_expiry
FROM medicines m
LEFT JOIN inventory i ON i.medicine_id = m.id AND i.quantity > 0
GROUP BY m.id, m.name, m.category, m.min_stock, m.max_stock;

-- View: Items expiring within 6 months
CREATE OR REPLACE VIEW v_expiring_soon AS
SELECT 
    i.id AS inventory_id,
    m.name AS medicine_name,
    i.batch,
    i.expiry,
    i.mrp,
    i.quantity,
    (i.expiry - CURRENT_DATE) AS days_until_expiry
FROM inventory i
JOIN medicines m ON m.id = i.medicine_id
WHERE i.expiry <= (CURRENT_DATE + INTERVAL '6 months')
  AND i.quantity > 0
ORDER BY i.expiry ASC;

-- View: Daily sales summary
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT 
    bill_date,
    COUNT(*) AS total_bills,
    SUM(grand_total) AS total_revenue,
    SUM(gst_total) AS total_gst,
    SUM(discount_total) AS total_discount
FROM sales
GROUP BY bill_date
ORDER BY bill_date DESC;
