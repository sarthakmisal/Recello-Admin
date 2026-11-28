-- Admin panel: Team (city managers), Security (activity log, sign-in lock), Settings.
-- Safe to run more than once. The server also creates these on first use.
CREATE TABLE IF NOT EXISTS admin_city_access (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    city    VARCHAR(60) NOT NULL,
    PRIMARY KEY (user_id, city)
);
CREATE TABLE IF NOT EXISTS admin_audit (
    id      BIGSERIAL PRIMARY KEY,
    at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id BIGINT,
    email   TEXT,
    kind    VARCHAR(20) NOT NULL DEFAULT 'change',   -- signin | bad_password | change
    what    TEXT NOT NULL,
    about   TEXT,
    detail  TEXT,
    ip      VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS admin_audit_at ON admin_audit (at DESC);
CREATE TABLE IF NOT EXISTS login_attempts (
    id    BIGSERIAL PRIMARY KEY,
    at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    email TEXT,
    ip    VARCHAR(64),
    ok    BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_email_at ON login_attempts (lower(email), at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_ip_at ON login_attempts (ip, at DESC);
CREATE TABLE IF NOT EXISTS app_settings (
    key        VARCHAR(40) PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by BIGINT
);
INSERT INTO roles (name, description, is_system) VALUES ('city_manager', 'Admin panel: only their cities', true)
    ON CONFLICT (name) DO NOTHING;
