-- ══════════════════════════════════════════════════════════════════
-- عيادة النور البصرية — Supabase Schema
-- Run this once in the Supabase SQL Editor (dashboard → SQL Editor)
-- ══════════════════════════════════════════════════════════════════

-- Patients
CREATE TABLE IF NOT EXISTS patients (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT,
    age             TEXT,
    phone           TEXT,
    address         TEXT,
    admission_date  TEXT,
    next_review     TEXT,
    notes           TEXT,
    od_sph  TEXT, od_cyl  TEXT, od_axis TEXT,
    od_add  TEXT, od_va   TEXT, od_bcva TEXT,
    os_sph  TEXT, os_cyl  TEXT, os_axis TEXT,
    os_add  TEXT, os_va   TEXT, os_bcva TEXT,
    pd              TEXT,
    checkup_done    INTEGER DEFAULT 0,
    checkup_paid    INTEGER DEFAULT 0,
    checkup_fee     REAL    DEFAULT 5000,
    lenses_qty      INTEGER DEFAULT 2,
    lens1_id        BIGINT,
    lens1_cost      REAL    DEFAULT 0,
    lens2_id        BIGINT,
    lens2_cost      REAL    DEFAULT 0,
    frame_name      TEXT,
    frame_type      TEXT,
    frame_cost      REAL    DEFAULT 0,
    frame_price     REAL    DEFAULT 0,
    total_cost      REAL    DEFAULT 0,
    amount_paid     REAL    DEFAULT 0,
    rxtype          TEXT,
    material        TEXT,
    features        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Patient payments
CREATE TABLE IF NOT EXISTS patient_payments (
    id          BIGSERIAL PRIMARY KEY,
    patient_id  BIGINT REFERENCES patients(id) ON DELETE CASCADE,
    amount      REAL,
    date        TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Debtors
CREATE TABLE IF NOT EXISTS debtors (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT,
    phone         TEXT,
    category      TEXT,
    what_bought   TEXT,
    total_we_owe  REAL DEFAULT 0,
    total_paid    REAL DEFAULT 0,
    remaining     REAL DEFAULT 0,
    status        TEXT DEFAULT 'unpaid',
    due_date      TEXT,
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Debtor payments
CREATE TABLE IF NOT EXISTS debtor_payments (
    id          BIGSERIAL PRIMARY KEY,
    debtor_id   BIGINT REFERENCES debtors(id) ON DELETE CASCADE,
    amount      REAL,
    method      TEXT,
    note        TEXT,
    date        TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Lenses inventory
CREATE TABLE IF NOT EXISTS lenses (
    id            BIGSERIAL PRIMARY KEY,
    lens_type     TEXT,
    category      TEXT,
    sph           TEXT,
    cyl           TEXT,
    material      TEXT,
    filter_type   TEXT,
    tint          TEXT,
    stock         INTEGER DEFAULT 0,
    reorder_point INTEGER DEFAULT 5,
    cost          REAL    DEFAULT 0,
    price         REAL    DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Lens restock history
CREATE TABLE IF NOT EXISTS lens_restocks (
    id            BIGSERIAL PRIMARY KEY,
    lens_id       BIGINT REFERENCES lenses(id) ON DELETE SET NULL,
    qty           INTEGER,
    cost_per_unit REAL,
    date          TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Operational costs
CREATE TABLE IF NOT EXISTS op_costs (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT,
    amount      REAL,
    frequency   TEXT,
    category    TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Custom (misc) sales
CREATE TABLE IF NOT EXISTS custom_sales (
    id          BIGSERIAL PRIMARY KEY,
    date        TEXT,
    item_name   TEXT,
    category    TEXT,
    qty         INTEGER DEFAULT 1,
    unit_price  REAL    DEFAULT 0,
    total       REAL    DEFAULT 0,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Financial ledger
CREATE TABLE IF NOT EXISTS ledger (
    id            BIGSERIAL PRIMARY KEY,
    date          TEXT,
    entry_type    TEXT,
    category      TEXT,
    description   TEXT,
    total_amount  REAL    DEFAULT 0,
    paid_amount   REAL    DEFAULT 0,
    is_expense    BOOLEAN DEFAULT FALSE,
    source_ref    TEXT    DEFAULT '',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Clinic settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- Seed default settings
INSERT INTO settings (key, value) VALUES
    ('clinic_name',  'عيادة النور البصرية'),
    ('doctor_name',  ''),
    ('location',     ''),
    ('phone1',       ''),
    ('phone2',       ''),
    ('checkup_fee',  '5000'),
    ('currency',     'IQD'),
    ('owner',        ''),
    ('owner_title',  ''),
    ('owner_phone',  ''),
    ('specialty',    ''),
    ('hours',        ''),
    ('language',     'ar')
ON CONFLICT (key) DO NOTHING;

-- ── Row Level Security (RLS) ───────────────────────────────────────────────
-- Enable RLS and allow full access via the anon key (single-tenant app).
-- Tighten these policies if you add user authentication later.

ALTER TABLE patients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE debtors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE debtor_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_restocks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE op_costs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_sales     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger           ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings         ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon role (single-clinic deployment)
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'patients','patient_payments','debtors','debtor_payments',
        'lenses','lens_restocks','op_costs','custom_sales','ledger','settings'
    ] LOOP
        EXECUTE format(
            'CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
            tbl, tbl
        );
    END LOOP;
END $$;
