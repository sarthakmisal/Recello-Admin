-- Questions: which brand / model a question is for, and battery-health bands.
-- Safe to run more than once. It only ADDS; nothing existing is changed or moved.
--   psql "$DATABASE_URL" -f database/migration_questions.sql
-- (The server also runs this itself the first time a question is read, so running it by hand is optional.)

-- 1. Battery question: its answers are bands. "min_value" is the lowest battery % of that band
--    (95, 90, 85, 80, 0). An answer with min_value NULL is the "Not sure" answer.
ALTER TABLE sell_question_options ADD COLUMN IF NOT EXISTS min_value INT;

-- 2. Where a question is asked. No rows = every brand / model of its categories (as before).
--    brand_id row = every model of that brand;  model_id row = that one model.
--    Brand rows and model rows narrow each other (brand Apple + model iphone-15 = only the iPhone 15).
CREATE TABLE IF NOT EXISTS sell_question_scope (
  id          BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES sell_questions(id) ON DELETE CASCADE,
  brand_id    BIGINT REFERENCES brands(id) ON DELETE CASCADE,
  model_id    BIGINT REFERENCES models(id) ON DELETE CASCADE,
  CHECK ((brand_id IS NULL) <> (model_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS sell_question_scope_uq
  ON sell_question_scope (question_id, COALESCE(brand_id, 0), COALESCE(model_id, 0));
CREATE INDEX IF NOT EXISTS sell_question_scope_q ON sell_question_scope (question_id);

-- Nothing else is needed:
--  * input_type 'battery' is just a new value in the existing VARCHAR column.
--  * An option's built-in picture is an images row whose url is 'preset:<name>' (e.g. preset:screen-crack),
--    created by the server when you send image_preset with an option.
