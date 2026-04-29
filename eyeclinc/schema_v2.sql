-- ══════════════════════════════════════════════════════════════════
-- عيادة النور البصرية — Schema v2
-- Adds: clinics, users (with roles), license system
-- Run this in your Supabase SQL Editor ONCE
-- ══════════════════════════════════════════════════════════════════

-- ── 1. CLINICS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinics (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT      NOT NULL,
    slug        TEXT      UNIQUE,          -- short URL-safe name e.g. "alnoor"
    is_active   BOOLEAN   DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: one default clinic so existing data keeps working
INSERT INTO clinics (id, name, slug)
VALUES (1, 'عيادة النور البصرية', 'alnoor')
ON CONFLICT DO NOTHING;

-- ── 2. USERS ─────────────────────────────────────────────────────
-- Roles: admin | doctor | receptionist
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    clinic_id     BIGINT    REFERENCES clinics(id) ON DELETE CASCADE DEFAULT 1,
    username      TEXT      NOT NULL,
    password_hash TEXT      NOT NULL,       -- bcrypt hash stored by the server
    full_name     TEXT,
    role          TEXT      NOT NULL DEFAULT 'receptionist'
                            CHECK (role IN ('admin','doctor','receptionist')),
    is_active     BOOLEAN   DEFAULT TRUE,
    last_login    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (clinic_id, username)
);

-- Default admin user  (password: admin1234 — CHANGE THIS IMMEDIATELY)
-- Hash generated with bcrypt rounds=12 for "admin1234"
INSERT INTO users (clinic_id, username, password_hash, full_name, role)
VALUES (
    1,
    'admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj2NjU5IUXS2',
    'مدير العيادة',
    'admin'
) ON CONFLICT DO NOTHING;

-- ── 3. SESSIONS ───────────────────────────────────────────────────
-- Server-side sessions (token → user).  Expires after 8 hours.
CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT      PRIMARY KEY,
    user_id     BIGINT    REFERENCES users(id) ON DELETE CASCADE,
    clinic_id   BIGINT    REFERENCES clinics(id) ON DELETE CASCADE,
    role        TEXT,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-clean expired sessions (Supabase cron or call manually)
CREATE OR REPLACE FUNCTION delete_expired_sessions()
RETURNS void LANGUAGE sql AS $$
    DELETE FROM sessions WHERE expires_at < NOW();
$$;

-- ── 4. LICENSES ───────────────────────────────────────────────────
-- Each clinic has one active license row.
-- Plans: monthly=30000 IQD | bimonthly=75000 IQD | biannual=210000 IQD
CREATE TABLE IF NOT EXISTS licenses (
    id            BIGSERIAL PRIMARY KEY,
    clinic_id     BIGINT    REFERENCES clinics(id) ON DELETE CASCADE,
    plan          TEXT      NOT NULL DEFAULT 'monthly'
                            CHECK (plan IN ('monthly','bimonthly','biannual','trial','lifetime')),
    price_iqd     INTEGER   DEFAULT 0,
    starts_at     DATE      NOT NULL DEFAULT CURRENT_DATE,
    expires_at    DATE      NOT NULL,
    grace_days    INTEGER   DEFAULT 5,       -- days after expiry before lockout
    is_active     BOOLEAN   DEFAULT TRUE,
    payment_ref   TEXT,                      -- receipt / transfer reference
    notes         TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed a 30-day trial license for clinic 1
INSERT INTO licenses (clinic_id, plan, price_iqd, starts_at, expires_at, grace_days, notes)
VALUES (
    1, 'trial', 0,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    5,
    'نسخة تجريبية — 30 يوم'
) ON CONFLICT DO NOTHING;

-- ── 5. AUDIT LOG ──────────────────────────────────────────────────
-- Lightweight log of sensitive actions (delete, login, settings change)
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    clinic_id   BIGINT    REFERENCES clinics(id),
    user_id     BIGINT    REFERENCES users(id),
    username    TEXT,
    action      TEXT,                        -- e.g. "delete_patient", "login"
    detail      TEXT,                        -- JSON or free text
    ip          TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. ADD clinic_id TO ALL EXISTING TABLES ───────────────────────
-- This ties every row to a clinic so the app is multi-tenant ready.
-- The DEFAULT 1 means all existing rows belong to clinic 1 — safe.

ALTER TABLE patients         ADD COLUMN IF NOT EXISTS clinic_id BIGINT DEFAULT 1 REFERENCES clinics(id);
ALTER TABLE patient_payments ADD COLUMN IF NOT EXISTS clinic_id BIGINT DEFAULT 1 REFERENCES clinics(id);
ALTER TABLE debtors          ADD COLUMN IF NOT EXISTS clinic_id BIGINT DEFAULT 1 REFERENCES clinics(id);
ALTER TABLE debtor_payments  ADD COLUMN IF NOT EXISTS clinic_id BIGINT DEFAULT 1 REFERENCES clinics(id);
ALTER TABLE lenses           ADD COLUMN IF NOT EXISTS clinic_id BIGINT DEFAULT 1 REFERENCES clinics(id);
ALTER TABLE lens_restocks    ADD COLUMN IF NOT EXISTS clinic_id BIGINT DEFAULT 1 REFERENCES clinics(id);
ALTER TABLE op_costs         ADD COLUMN IF NOT EXISTS clinic_id BIGINT DEFAULT 1 REFERENCES clinics(id);
ALTER TABLE custom_sales     ADD COLUMN IF NOT EXISTS clinic_id BIGINT DEFAULT 1 REFERENCES clinics(id);
ALTER TABLE ledger           ADD COLUMN IF NOT EXISTS clinic_id BIGINT DEFAULT 1 REFERENCES clinics(id);
ALTER TABLE settings         ADD COLUMN IF NOT EXISTS clinic_id BIGINT DEFAULT 1 REFERENCES clinics(id);

-- Add frame_price column that the newer app.py uses
ALTER TABLE patients ADD COLUMN IF NOT EXISTS frame_price REAL DEFAULT 0;

-- ── 7. RLS — LOCK DOWN EVERYTHING ────────────────────────────────
-- Remove the old open-access policies and replace with
-- "service_role only" — the Flask backend uses the service key,
-- so it bypasses RLS entirely.  The anon key (used by no one now)
-- gets zero access.

-- Drop old permissive policies
DO $$
DECLARE tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'patients','patient_payments','debtors','debtor_payments',
        'lenses','lens_restocks','op_costs','custom_sales','ledger','settings',
        'users','sessions','licenses','audit_log','clinics'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I', tbl, tbl);
    END LOOP;
END $$;

-- Enable RLS on new tables
ALTER TABLE clinics    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log  ENABLE ROW LEVEL SECURITY;

-- NO anon policies — only service_role (your Flask backend) can read/write.
-- In Supabase: Settings → API → use the "service_role" key in your .env
-- NEVER expose the service_role key in the frontend.

-- ── 8. INDEXES ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_clinic     ON users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_licenses_clinic  ON licenses(clinic_id);
CREATE INDEX IF NOT EXISTS idx_audit_clinic     ON audit_log(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patients_clinic  ON patients(clinic_id, admission_date DESC);
