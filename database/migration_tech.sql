-- Technician app (/api/tech). Additive only: CREATE ... IF NOT EXISTS, no existing table is changed.
-- Needs the website tables (web_orders, web_order_seq, web_hits, web_settings) from migration_web.sql to exist.
-- Runs by itself on the first /api/tech call; you can also run it by hand:  psql "$DATABASE_URL" -f database/migration_tech.sql

INSERT INTO roles (name, description, is_system)
SELECT 'technician', 'Recello technician (pickup + inspection app)', true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'technician');

-- one row per technician: the extra fields the app shows on the profile page
CREATE TABLE IF NOT EXISTS tech_profiles (
    user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    city        TEXT NOT NULL DEFAULT 'Pune',
    id_no       TEXT,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    verified    BOOLEAN NOT NULL DEFAULT FALSE,
    terms_ver   INT,
    terms_at    TIMESTAMPTZ,
    last_seen   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tech_logins (
    id      BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    device  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS tech_logins_user_idx ON tech_logins (user_id, at DESC);

-- the technician's sign-in code (6 digits by SMS)
CREATE TABLE IF NOT EXISTS tech_otp (
    id         BIGSERIAL PRIMARY KEY,
    phone      VARCHAR(15) NOT NULL,
    code_hash  TEXT NOT NULL,
    attempts   INT NOT NULL DEFAULT 0,
    used       BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tech_otp_phone_idx ON tech_otp (phone, id DESC);

-- one row per lead (web order) a technician works on. "t" holds the visit as it goes: events, flags,
-- the customer's codes (hashed), identify / check / smk / extras / deal / agree / pay / finish.
CREATE TABLE IF NOT EXISTS tech_visits (
    code       TEXT PRIMARY KEY,                       -- web_orders.code  (SMK123)
    listing_id BIGINT,
    tech_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    t          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tech_visits_tech_idx ON tech_visits (tech_id, updated_at DESC);

-- photos taken during a visit. Files live in private/tech (never under /uploads) and are served only to the owner.
CREATE TABLE IF NOT EXISTS tech_photos (
    ref        TEXT PRIMARY KEY,
    code       TEXT NOT NULL,
    tech_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    file       TEXT NOT NULL,
    mime       TEXT NOT NULL DEFAULT 'image/jpeg',
    at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tech_photos_code_idx ON tech_photos (code);

-- the technician's own documents (ID, police verification ...) with the review status Recello sets
CREATE TABLE IF NOT EXISTS tech_docs (
    id         TEXT PRIMARY KEY,
    tech_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    ext        TEXT NOT NULL,
    bytes      INT NOT NULL DEFAULT 0,
    file       TEXT NOT NULL,
    mime       TEXT NOT NULL DEFAULT 'image/jpeg',
    status     TEXT NOT NULL DEFAULT 'pending',        -- pending | verified | rejected
    note       TEXT NOT NULL DEFAULT '',
    at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tech_docs_tech_idx ON tech_docs (tech_id, at DESC);

-- Points wallet (1 Point = Rs 1): a lead takes its Points when it is first given, they come back if the
-- customer says no before the start code. "topup" rows are added by Recello.
CREATE TABLE IF NOT EXISTS tech_wallet (
    id         BIGSERIAL PRIMARY KEY,
    tech_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_code TEXT,
    kind       TEXT NOT NULL,                          -- topup | lead | refund | fix
    pts        INT NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    model      TEXT NOT NULL DEFAULT '',
    at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tech_wallet_tech_idx ON tech_wallet (tech_id, at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS tech_wallet_once ON tech_wallet (tech_id, order_code, kind) WHERE kind IN ('lead', 'refund');
