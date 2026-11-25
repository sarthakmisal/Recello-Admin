-- Ready-to-use queries for the questions part. Run after migration_questions.sql.
-- Replace the names / slugs in quotes with yours. Every block can be run on its own.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Make a question appear only for some brands (Apple-only, Samsung-only …)
--    (no scope rows = every brand; this REPLACES what was set before for that question)
-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE FROM sell_question_scope WHERE question_id = 12;
-- INSERT INTO sell_question_scope (question_id, brand_id)
--   SELECT 12, id FROM brands WHERE name IN ('Apple');

-- Only for some models (S Pen question for the Ultra phones, fold question for foldables …)
-- INSERT INTO sell_question_scope (question_id, model_id)
--   SELECT 15, id FROM models WHERE slug IN ('samsung-galaxy-s24-ultra-5g', 'samsung-galaxy-s23-ultra-5g');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Battery health question (Apple phones). Options ARE the bands.
--    min_value = lowest battery % of the band, NULL = "Not sure". price_deduction = % taken off.
--    The question is for the website / app sell flow only (context = sell), so the merchant inspection app does not get it.
-- ─────────────────────────────────────────────────────────────────────────────
-- WITH q AS (
--   INSERT INTO sell_questions (text, description, input_type, context, sort_index)
--   VALUES ('What is the battery health?', 'On iPhone: Settings → Battery → Battery Health → Maximum Capacity.', 'battery',
--           (SELECT id FROM enum_master WHERE master_name = 'question_context' AND option_name = 'sell'), 6)
--   RETURNING id),
-- cat AS (INSERT INTO sell_category_questions (category_id, question_id, sort_index)
--           SELECT c.id, q.id, 6 FROM q, categories c WHERE c.slug = 'smartphones' RETURNING question_id),
-- scope AS (INSERT INTO sell_question_scope (question_id, brand_id)
--           SELECT q.id, b.id FROM q, brands b WHERE b.name = 'Apple' RETURNING question_id)
-- INSERT INTO sell_question_options (question_id, text, price_deduction, min_value, sort_index)
-- SELECT q.id, v.t, v.d, v.m, v.s FROM q, (VALUES
--   ('95% and above', 0, 95, 1), ('90 – 94%', 0, 90, 2), ('85 – 89%', 2, 85, 3), ('80 – 84%', 4, 80, 4),
--   ('Below 80%', 8, 0, 5), ('Not sure', 3, NULL, 6)) AS v(t, d, m, s);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Give options a built-in picture (the website shows it). Name = picture key, e.g. screen-crack, body-good, cal-6, bill, box, charger.
-- ─────────────────────────────────────────────────────────────────────────────
-- INSERT INTO images (url, alt_text)
--   SELECT 'preset:screen-crack', 'screen-crack' WHERE NOT EXISTS (SELECT 1 FROM images WHERE url = 'preset:screen-crack');
-- UPDATE sell_question_options SET option_image_id = (SELECT id FROM images WHERE url = 'preset:screen-crack' ORDER BY id LIMIT 1)
--   WHERE question_id = 3 AND text ILIKE 'Cracked%';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Look at what is set up (read-only)
-- ─────────────────────────────────────────────────────────────────────────────
-- all questions, their type, categories and scope
SELECT q.id, q.text, q.input_type, q.is_active,
       (SELECT string_agg(c.slug, ', ') FROM sell_category_questions x JOIN categories c ON c.id = x.category_id WHERE x.question_id = q.id) AS categories,
       (SELECT string_agg(b.name, ', ') FROM sell_question_scope s JOIN brands b ON b.id = s.brand_id WHERE s.question_id = q.id) AS only_brands,
       (SELECT string_agg(m.slug, ', ') FROM sell_question_scope s JOIN models m ON m.id = s.model_id WHERE s.question_id = q.id) AS only_models
  FROM sell_questions q ORDER BY q.sort_index, q.id;

-- the questions one model gets (change the slug)
SELECT q.id, q.text, q.input_type
  FROM models m
  JOIN sell_category_questions cq ON cq.category_id = m.category_id
  JOIN sell_questions q ON q.id = cq.question_id AND q.is_active
 WHERE m.slug = 'iphone-15'
   AND (NOT EXISTS (SELECT 1 FROM sell_question_scope s WHERE s.question_id = q.id AND s.brand_id IS NOT NULL)
        OR EXISTS (SELECT 1 FROM sell_question_scope s WHERE s.question_id = q.id AND s.brand_id = m.brand_id))
   AND (NOT EXISTS (SELECT 1 FROM sell_question_scope s WHERE s.question_id = q.id AND s.model_id IS NOT NULL)
        OR EXISTS (SELECT 1 FROM sell_question_scope s WHERE s.question_id = q.id AND s.model_id = m.id))
 ORDER BY cq.sort_index, q.id;

-- option cuts are PERCENT of the base price: anything above 95 or below -50 is a typo
SELECT q.text, o.text, o.price_deduction FROM sell_question_options o JOIN sell_questions q ON q.id = o.question_id
 WHERE o.price_deduction > 95 OR o.price_deduction < -50;
