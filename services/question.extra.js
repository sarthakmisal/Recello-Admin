/*
 * Question extras shared by the website API (web.service), the technician API (tech.service) and the sell API (sell.service):
 *   - brand / model scope           (sell_question_scope)
 *   - battery-health questions      (input_type 'battery'; answers are bands, sell_question_options.min_value)
 *   - built-in option pictures      (images.url = 'preset:<name>')
 * Everything is optional: a question with no scope rows, no battery type and no preset behaves exactly as before.
 */
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

let ready = null;
/** Adds the two new things to the database once per server start (same SQL as database/migration_questions.sql). */
function ensure() {
    if (!ready) {
        const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'migration_questions.sql'), 'utf8');
        ready = pool.query(sql).catch((e) => { ready = null; throw e; });
    }
    return ready;
}

const PRESET = /^preset:[a-z0-9-]{1,30}$/;
/** The picture of an option for the page: a built-in 'preset:name', else the uploaded file path. */
const optImg = (url, uploadPath) => (PRESET.test(String(url || '')) ? String(url) : uploadPath(url));

/** images.id for a built-in picture name; the row is made the first time the name is used. */
async function presetImageId(db, name) {
    const key = String(name || '').replace(/^preset:/, '');
    if (!/^[a-z0-9-]{1,30}$/.test(key)) throw { status: 400, message: 'image_preset may only use a-z, 0-9 and dashes (max 30)' };
    const url = 'preset:' + key;
    const f = await db.query('SELECT id FROM images WHERE url = $1 ORDER BY id LIMIT 1', [url]);
    if (f.rowCount) return f.rows[0].id;
    const r = await db.query('INSERT INTO images (url, alt_text) VALUES ($1, $2) RETURNING id', [url, key]);
    return r.rows[0].id;
}

/**
 * Adds brands / models (scope) and battery bands to questions the loaders already built.
 * byQ: Map of question objects ({ id, type, options, brands, models … }). Never throws: on any problem the questions stay as they were.
 */
async function enrich(byQ) {
    const qs = [...byQ.values()];
    if (!qs.length) return;
    const by = new Map(qs.map((q) => [String(q.id), q]));
    const ids = [...by.keys()];
    try {
        await ensure();
        const sc = await pool.query(
            `SELECT s.question_id, b.name brand, m.slug model
               FROM sell_question_scope s
          LEFT JOIN brands b ON b.id = s.brand_id
          LEFT JOIN models m ON m.id = s.model_id
              WHERE s.question_id = ANY($1::bigint[])`, [ids]);
        for (const r of sc.rows) {
            const q = by.get(String(r.question_id));
            if (!q) continue;
            if (r.brand && !q.brands.includes(r.brand)) q.brands.push(r.brand);
            if (r.model && !q.models.includes(r.model)) q.models.push(r.model);
        }
        const bq = await pool.query(
            `SELECT id FROM sell_questions WHERE id = ANY($1::bigint[]) AND lower(input_type) = 'battery'`, [ids]);
        const batt = new Set(bq.rows.map((r) => String(r.id)));
        if (batt.size) {
            const or = await pool.query(
                `SELECT id, question_id, min_value, price_deduction FROM sell_question_options
                  WHERE question_id = ANY($1::bigint[]) AND is_active IS NOT FALSE ORDER BY min_value DESC NULLS LAST, id`, [[...batt]]);
            for (const id of batt) { const q = by.get(id); q.type = 'battery'; q.options = []; q.bands = []; q.unsure = 0; }
            for (const o of or.rows) {
                const q = by.get(String(o.question_id));
                if (!q) continue;
                if (o.min_value == null) { q.unsure = +o.price_deduction || 0; q.unsureOid = o.id; }
                else q.bands.push({ min: +o.min_value, deduct: +o.price_deduction || 0, oid: o.id });
            }
        }
    } catch (e) {
        console.error('[questions] scope / battery not loaded:', e.message);
    }
}

/**
 * SQL for "this question is asked for this model". modelId / brandId are SQL expressions (a $n parameter or a column).
 * No scope rows = asked everywhere.
 */
const scopeSql = (qCol, modelId, brandId) => `(
    (NOT EXISTS (SELECT 1 FROM sell_question_scope s WHERE s.question_id = ${qCol} AND s.brand_id IS NOT NULL)
      OR EXISTS (SELECT 1 FROM sell_question_scope s WHERE s.question_id = ${qCol} AND s.brand_id = ${brandId}))
    AND (NOT EXISTS (SELECT 1 FROM sell_question_scope s WHERE s.question_id = ${qCol} AND s.model_id IS NOT NULL)
      OR EXISTS (SELECT 1 FROM sell_question_scope s WHERE s.question_id = ${qCol} AND s.model_id = ${modelId}))
)`;

module.exports = { ensure, optImg, presetImageId, enrich, scopeSql, PRESET };
