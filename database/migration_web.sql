-- Tables used by the website / Android app API (/api/web).
-- Safe to run more than once. The server also runs this itself on the first /api/web request,
-- so running it by hand is optional:   psql "$DATABASE_URL" -f database/migration_web.sql
-- It only ADDS tables (web_*). Nothing in your existing tables is changed.

CREATE SEQUENCE IF NOT EXISTS web_order_seq START 1;

CREATE TABLE IF NOT EXISTS web_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_otp (
  id         bigserial PRIMARY KEY,
  phone      text NOT NULL,
  code_hash  text NOT NULL,
  attempts   int  NOT NULL DEFAULT 0,
  used       boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_otp_phone_idx ON web_otp (phone, created_at DESC);

-- rate limits and one-time robot-check tickets
CREATE TABLE IF NOT EXISTS web_hits (
  k  text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_hits_k_idx ON web_hits (k, at DESC);

-- orders made on the website / app. Sales also create a normal sell_listings row (+ address + pickup),
-- so they show in your admin panel and merchant app exactly like before. Repairs live only here.
CREATE TABLE IF NOT EXISTS web_orders (
  id          bigserial PRIMARY KEY,
  code        text UNIQUE NOT NULL,            -- SMK001, SMK002 ...
  access_key  text NOT NULL,                   -- opens the order page without the phone digits
  type        text NOT NULL,                   -- sell | repair
  listing_id  int,                             -- sell_listings.id for sales
  user_id     int,
  phone       text NOT NULL,
  title       text NOT NULL,
  amount      numeric,
  city        text,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'booked',  -- booked | assigned | done | cancelled (repairs; sales follow sell_listings.status)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_orders_phone_idx ON web_orders (phone);
CREATE INDEX IF NOT EXISTS web_orders_listing_idx ON web_orders (listing_id);

-- a visitor who saw a price (to call back), and the price we promised for 7 days
CREATE TABLE IF NOT EXISTS web_leads (
  id         bigserial PRIMARY KEY,
  phone      text NOT NULL,
  model      text,
  vi         int,
  price      numeric,
  reason     text,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_leads_phone_idx ON web_leads (phone, created_at DESC);

CREATE TABLE IF NOT EXISTS web_holds (
  phone      text NOT NULL,
  hold_key   text NOT NULL,
  price      numeric NOT NULL,
  until_at   timestamptz NOT NULL,
  PRIMARY KEY (phone, hold_key)
);

-- call-backs, "model not listed", "beat my quote", watch price, bulk, upgrade, delete account ...
CREATE TABLE IF NOT EXISTS web_requests (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL,
  phone      text,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status     text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_requests_kind_idx ON web_requests (kind, created_at DESC);

CREATE TABLE IF NOT EXISTS web_waitlist (
  city       text NOT NULL,
  phone      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (city, phone)
);

CREATE TABLE IF NOT EXISTS web_referrals (
  phone      text PRIMARY KEY,
  code       text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
