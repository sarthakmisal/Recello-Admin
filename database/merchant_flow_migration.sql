-- Merchant inspection flow migration (idempotent-ish)
-- Run this on an existing Resello database to support:
-- - listing_status lifecycle for merchant pickup/inspection
-- - inspection sessions (re-inspection safe)
-- - cancellations + renegotiation offers
-- - inspection-scoped answers via inspection_id

BEGIN;

-- 1) enum_master seeds (safe)
INSERT INTO enum_master(id, master_name, option_name)
VALUES
  (1,'listing_status','out_for_delivery'),
  (2,'listing_status','inspection_started'),
  (3,'listing_status','inspection_complete'),
  (4,'listing_status','assigned'),
  (5,'listing_status','renegotiating'),
  (6,'listing_status','completed'),
  (7,'listing_status','cancelled'),
  (1,'inspection_status','started'),
  (2,'inspection_status','completed'),
  (3,'inspection_status','cancelled'),
  (1,'offer_status','pending'),
  (2,'offer_status','accepted'),
  (3,'offer_status','rejected')
ON CONFLICT(master_name, option_name) DO NOTHING;

-- 2) inspections table
CREATE TABLE IF NOT EXISTS inspections (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES sell_listings(id) ON DELETE CASCADE,
  agent_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  otp_verified_at TIMESTAMP,
  status INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3) sell_listing_answers: inspection_id + unique by inspection
ALTER TABLE sell_listing_answers
  ADD COLUMN IF NOT EXISTS inspection_id BIGINT REFERENCES inspections(id) ON DELETE CASCADE;

-- Drop old unique constraint (name is from default Postgres naming)
ALTER TABLE sell_listing_answers
  DROP CONSTRAINT IF EXISTS sell_listing_answers_listing_id_question_id_option_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sell_listing_answers_inspection_id_question_id_option_id_key'
  ) THEN
    ALTER TABLE sell_listing_answers
      ADD CONSTRAINT sell_listing_answers_inspection_id_question_id_option_id_key
      UNIQUE (inspection_id, question_id, option_id);
  END IF;
END $$;

-- 4) cancellations + offers
CREATE TABLE IF NOT EXISTS listing_cancellations (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES sell_listings(id) ON DELETE CASCADE,
  inspection_id BIGINT REFERENCES inspections(id) ON DELETE SET NULL,
  cancelled_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  final_offered_price NUMERIC(10,2),
  customer_expected_price NUMERIC(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listing_offers (
  id BIGSERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL REFERENCES sell_listings(id) ON DELETE CASCADE,
  inspection_id BIGINT REFERENCES inspections(id) ON DELETE SET NULL,
  offered_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  status INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMIT;
