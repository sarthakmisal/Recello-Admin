/*
 * Website + Android app API:  /api/web?action=...
 *
 * The Recello page (Recello-Mobile/src/index.html) talks only to this. It sits on top of YOUR tables:
 *   models / brands / categories / sell_model_configs  -> the catalogue and the prices
 *   sell_questions / sell_question_options             -> the condition questions and their % cuts
 *   users / user_profile / user_roles                  -> a customer is made the first time their OTP is verified
 *   addresses / sell_listings / sell_listing_answers / sell_pickups -> a booked sale, so it shows up in the admin panel
 *                                                        and the merchant app exactly like a sale made in the old app
 * and on a few new web_* tables (database/migration_web.sql) for what your schema has no place for
 * (4-digit website OTPs, order numbers SMK001..., repairs, call-backs, waitlist, referral codes).
 *
 * The offer is always worked out here, never in the browser. Prices stay hidden until the mobile number is verified.
 */
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const S = require('./web.store');
const authService = require('./auth.service');

const fail = (status, message, extra) => Object.assign({ status, message }, extra || {});
const PAGE_CATS = ['phone', 'tablet', 'laptop', 'watch'];

// ====================================================================================
// catalogue (models, variants, prices) from your tables
// ====================================================================================
let catCache = { at: 0, v: null };

/** Photo file for the page: panel uploads come from /uploads, otherwise the page's own built-in photo (matched by slug). */
const fs = require('fs');
const path = require('path');
let photoIndex = null;
function builtinPhoto(slug) {
    if (photoIndex === null) {
        photoIndex = {};
        try { photoIndex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'app', 'photos', 'models', 'index.json'), 'utf8')); } catch (_) { /* optional */ }
    }
    return photoIndex[slug] ? 'photos/models/' + photoIndex[slug] : '';
}
function uploadPath(url) {
    if (!url) return '';
    const f = String(url).replace(/^\/+/, '').replace(/^uploads\//, '');
    return /^[\w.-]+$/.test(f) ? 'uploads/' + f : '';
}

async function pageCatOf(slug, catmap) {
    const s = String(slug || '').toLowerCase();
    for (const k of PAGE_CATS) if ((catmap[k] || []).map((x) => String(x).toLowerCase()).includes(s)) return k;
    if (/mobile|phone/.test(s)) return 'phone';
    if (/tablet|ipad/.test(s)) return 'tablet';
    if (/laptop|macbook|notebook/.test(s)) return 'laptop';
    if (/watch/.test(s)) return 'watch';
    return null;
}

async function loadCatalog() {
    if (catCache.v && Date.now() - catCache.at < 45000) return catCache.v;
    const catmap = await S.setting('catmap');
    const mr = await pool.query(
        `SELECT m.id, m.slug, m.name, m.category_id, m.brand_id, b.name brand, ms.name series, c.slug cat_slug, img.url
           FROM models m
           JOIN brands b ON b.id = m.brand_id
           JOIN categories c ON c.id = m.category_id AND c.is_active IS NOT FALSE
      LEFT JOIN model_series ms ON ms.id = m.series_id
      LEFT JOIN LATERAL (SELECT i.url FROM model_images mi JOIN images i ON i.id = mi.image_id
                          WHERE mi.model_id = m.id ORDER BY mi.image_id LIMIT 1) img ON true
          ORDER BY b.name, m.name`);
    const cr = await pool.query(
        `SELECT id, model_id, name, base_price FROM sell_model_configs
          WHERE is_active IS NOT FALSE AND base_price IS NOT NULL ORDER BY model_id, id`);
    const cfgs = new Map();
    cr.rows.forEach((r) => {
        if (!cfgs.has(r.model_id)) cfgs.set(r.model_id, []);
        cfgs.get(r.model_id).push({ id: r.id, name: String(r.name), price: Math.round(+r.base_price) });
    });
    const models = [], byId = {};
    for (const r of mr.rows) {
        const cat = await pageCatOf(r.cat_slug, catmap);
        const list = cfgs.get(r.id) || [];
        if (!cat || !list.length || !r.slug) continue;
        const m = {
            id: r.slug, cat, brand: r.brand, name: r.name, series: r.series || '',
            db: { model_id: r.id, brand_id: r.brand_id, category_id: r.category_id },
            cfgs: list, img: uploadPath(r.url) || builtinPhoto(r.slug),
        };
        models.push(m); byId[m.id] = m;
    }
    catCache = { at: Date.now(), v: { models, byId } };
    return catCache.v;
}

// ====================================================================================
// condition questions: your sell_questions, or the page's built-in set for a device type that has none
// ====================================================================================
let qCache = { at: 0, v: null };
const TYPE_OF = { yes_no: 'single', single_select: 'single', multi_select: 'multi' };

async function loadQuestions() {
    if (qCache.v && Date.now() - qCache.at < 45000) return qCache.v;
    const catmap = await S.setting('catmap');
    const qr = await pool.query(
        `SELECT sq.id, sq.text, sq.description, sq.input_type, c.slug cat_slug, scq.sort_index cat_sort, sq.sort_index
           FROM sell_questions sq
           JOIN sell_category_questions scq ON scq.question_id = sq.id
           JOIN categories c ON c.id = scq.category_id
      LEFT JOIN enum_master ctx ON ctx.id = sq.context AND ctx.master_name = 'question_context'
          WHERE sq.is_active IS NOT FALSE AND (ctx.option_name IS NULL OR ctx.option_name IN ('sell', 'both'))
          ORDER BY scq.sort_index, sq.sort_index, sq.id`);
    const byQ = new Map();
    for (const r of qr.rows) {
        const cat = await pageCatOf(r.cat_slug, catmap);
        if (!cat) continue;
        let q = byQ.get(r.id);
        if (!q) {
            q = {
                id: String(r.id), title: r.text, help: r.description || '', type: TYPE_OF[String(r.input_type || '').toLowerCase()] || 'single',
                cats: [], brands: [], models: [], active: true, options: [], db: true,
            };
            byQ.set(r.id, q);
        }
        if (!q.cats.includes(cat)) q.cats.push(cat);
    }
    const ids = [...byQ.keys()];
    if (ids.length) {
        const or = await pool.query(
            `SELECT sqo.id, sqo.question_id, sqo.text, sqo.price_deduction, img.url
               FROM sell_question_options sqo
          LEFT JOIN images img ON img.id = sqo.option_image_id
              WHERE sqo.question_id = ANY($1::int[]) ORDER BY sqo.sort_index, sqo.id`, [ids]);
        or.rows.forEach((o) => {
            const q = byQ.get(o.question_id);
            if (q) q.options.push({ id: String(o.id), label: String(o.text), deduct: +o.price_deduction || 0, img: uploadPath(o.url), active: true });
        });
    }
    const list = [...byQ.values()].filter((q) => q.options.length);
    // a device type with no questions of its own uses the page's built-in questions
    const have = new Set();
    list.forEach((q) => q.cats.forEach((c) => have.add(c)));
    const missing = PAGE_CATS.filter((c) => !have.has(c));
    if (missing.length) {
        const seed = require('../config/web-questions.json');
        seed.forEach((q) => {
            const cats = (q.cats || []).filter((c) => missing.includes(c));
            if (cats.length) list.push({ ...JSON.parse(JSON.stringify(q)), cats });
        });
    }
    // what the browser may see: never the % cuts
    const pub = list.map((q) => {
        const o = { id: q.id, title: q.title, help: q.help || '', type: q.type, cats: q.cats, brands: q.brands || [], models: q.models || [] };
        o.options = (q.options || []).map((x) => ({ id: x.id, label: x.label, img: x.img || '' }));
        if (q.type === 'battery') { o.bands = (q.bands || []).map((b) => ({ min: b.min, deduct: 0 })); o.unsure = 0; }
        return o;
    });
    qCache = { at: Date.now(), v: { list, pub } };
    return qCache.v;
}

// the same rules as the page's own quoteQ(), run on the server
const lc = (s) => String(s || '').toLowerCase();
function qFor(Q, m) {
    return Q.filter((q) => q.active !== false && (q.cats || []).includes(m.cat)
        && (!(q.brands || []).length || q.brands.some((b) => lc(b) === lc(m.brand)))
        && (!(q.models || []).length || q.models.includes(m.id))
        && q.type !== 'color')
        .filter((q) => q.type === 'battery' || (q.options || []).length);
}
function quote(m, vi, ans, verified, Q, R) {
    const cfg = m.cfgs[vi];
    const top = cfg.price;
    let cut = 0, complete = true;
    for (const q of qFor(Q, m)) {
        const a = Array.isArray((ans || {})[q.id]) ? ans[q.id].map(String) : [];
        if (q.type === 'battery') {
            const v = a[0];
            if (v === 'unsure') { cut += +q.unsure || 0; continue; }
            if (!(+v >= 1 && +v <= 100)) { complete = false; continue; }
            const bands = [...(q.bands || [])].sort((x, y) => y.min - x.min);
            const b = bands.find((x) => +v >= x.min);
            cut += b ? +b.deduct || 0 : 0;
            continue;
        }
        let picked = a.filter((id) => q.options.some((o) => o.id === id));
        if (q.type === 'single') picked = picked.slice(0, 1);
        if (!picked.length) { complete = false; continue; }
        cut += q.options.filter((o) => picked.includes(o.id)).reduce((s, o) => s + (+o.deduct || 0), 0);
    }
    const bonus = verified ? Math.max(0, ((R && R.verified) || 1) - 1) * 100 : 0;
    const total = Math.max(-50, Math.min(95, cut - bonus));
    let price = Math.round(top * (1 - total / 100) / 10) * 10;
    const floor = ((R && R.floor) || {})[m.cat] || 1000;
    if (price < floor) price = floor;
    return { price, top: Math.round(top / 10) * 10, complete };
}

// ====================================================================================
// small shared pieces
// ====================================================================================
const SMK_RE = /^SMK\d{3,7}$/;
function normId(raw) {
    const d = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = d.match(/^SMK0*(\d{1,7})$/) || d.match(/^0*(\d{1,4})$/);
    return m ? S.orderCode(m[1]) : d;
}
const newKey = () => crypto.randomBytes(8).toString('hex').slice(0, 12).toUpperCase();
const sameKey = (a, b) => { a = String(a || ''); b = String(b || ''); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); };

async function ensureUser(phone) {
    const found = await pool.query('SELECT id, status FROM users WHERE phone = $1', [phone]);
    if (found.rowCount) {
        if (found.rows[0].status !== 1 && found.rows[0].status != null) throw fail(403, 'This account is not active. Please contact support.');
        return found.rows[0].id;
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10); // nobody logs in with a password; the OTP is the login
        const u = await client.query('INSERT INTO users (phone, password) VALUES ($1, $2) RETURNING id', [phone, hash]);
        await client.query('INSERT INTO user_profile (user_id, first_name, last_name) VALUES ($1, $2, $3)', [u.rows[0].id, 'Customer', '']);
        const role = await client.query("SELECT id FROM roles WHERE name = 'user' LIMIT 1");
        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [u.rows[0].id, role.rowCount ? role.rows[0].id : 1]);
        await client.query('COMMIT');
        return u.rows[0].id;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        if (e && e.code === '23505') { // two requests at once made the same user
            const again = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
            if (again.rowCount) return again.rows[0].id;
        }
        throw e;
    } finally { client.release(); }
}

function modelAndVariant(cat, body) {
    const m = cat.byId[S.str(body.model, 160)];
    if (!m) throw fail(404, 'That device is not on our list right now.');
    const vi = Math.max(0, parseInt(body.vi, 10) || 0);
    if (!m.cfgs[vi]) throw fail(400, 'Please pick the storage again.');
    return { m, vi };
}
const ansKey = (m, vi, ans) => crypto.createHash('sha256')
    .update(m.id + '|' + vi + '|' + JSON.stringify(Object.keys(ans || {}).sort().map((k) => [k, [...(ans[k] || [])].map(String).sort()]))).digest('hex').slice(0, 40);

/** The price we show is held for 7 days: it can go up, never down, until it ends. */
async function heldPrice(phone, key, now) {
    const r = await pool.query('SELECT price, until_at FROM web_holds WHERE phone = $1 AND hold_key = $2', [phone, key]);
    if (r.rowCount && new Date(r.rows[0].until_at) > new Date()) {
        const price = Math.max(+r.rows[0].price, now);
        if (price !== +r.rows[0].price) await pool.query('UPDATE web_holds SET price = $3 WHERE phone = $1 AND hold_key = $2', [phone, key, price]);
        return { price, until: new Date(r.rows[0].until_at).getTime() };
    }
    const until = Date.now() + 7 * 864e5;
    await pool.query(
        `INSERT INTO web_holds (phone, hold_key, price, until_at) VALUES ($1, $2, $3, to_timestamp($4))
         ON CONFLICT (phone, hold_key) DO UPDATE SET price = EXCLUDED.price, until_at = EXCLUDED.until_at`,
        [phone, key, now, until / 1000]);
    return { price: now, until };
}

async function workOut(body, tk, opts) {
    const cat = await loadCatalog();
    const { m, vi } = modelAndVariant(cat, body);
    const ans = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const { list } = await loadQuestions();
    const R = await S.setting('pricing');
    const verified = !!body.verified && (m.cat === 'phone' || m.cat === 'tablet');
    const q = quote(m, vi, ans, verified, list, R);
    if (!q.complete) throw fail(400, 'Please answer all the questions to see your price.');
    const key = ansKey(m, vi, ans);
    const hold = await heldPrice(tk.p, key, q.price);
    return { m, vi, ans, list, q, key, hold, cfg: m.cfgs[vi], now: q.price, price: hold.price };
}

// ====================================================================================
// actions
// ====================================================================================
const A = {};

A.catalog = async () => {
    const cat = await loadCatalog();
    const { pub } = await loadQuestions();
    const biz = await S.setting('business');
    const growth = await S.setting('growth');
    const pricing = await S.setting('pricing');
    const repair = await S.setting('repair');
    const gate = process.env.WEB_PRICE_GATE !== '0';
    const site = await S.setting('site');
    const have = new Set(cat.models.map((m) => m.cat));
    site.cats = { tablet: have.has('tablet') ? 'on' : 'soon', laptop: have.has('laptop') ? 'on' : 'soon', watch: have.has('watch') ? 'on' : 'soon', ...(site.cats || {}) };
    try {
        const f = await pool.query('SELECT question, answer FROM faqs WHERE status = true ORDER BY id');
        if (f.rowCount && !site.faq) site.faq = f.rows.map((x) => ({ q: x.question, a: x.answer }));
    } catch (_) { /* optional table */ }
    // "pickup booked in Pune" ticker: real bookings only, shown from 3
    let feed = [];
    try {
        const fr = await pool.query(
            `SELECT data->>'model_name' model, city, created_at FROM web_orders
              WHERE type = 'sell' AND created_at > now() - interval '30 days' AND status <> 'cancelled'
              ORDER BY created_at DESC LIMIT 20`);
        feed = fr.rows.filter((r) => r.model && r.city).map((r) => ({ model: r.model, city: r.city, at: S.epoch(r.created_at) }));
        if (feed.length < 3) feed = [];
    } catch (_) { /* no orders yet */ }
    return {
        models: cat.models.map((m) => {
            const top = Math.max(...m.cfgs.map((c) => c.price));
            return {
                id: m.id, cat: m.cat, brand: m.brand, name: m.name, series: m.series,
                base: gate ? 0 : top,
                variants: m.cfgs.map((c) => [c.name, +(c.price / top).toFixed(6)]),
                img: m.img, colors: [],
            };
        }),
        questions: pub,
        pricing: { verified: pricing.verified, floor: pricing.floor },
        business: biz, repair, growth, site, feed,
        price_gate: gate, ai: false,
    };
};

A.pow = async (req) => {
    if (!S.powOn()) return { salt: crypto.randomBytes(8).toString('hex'), exp: Math.floor(Date.now() / 1000) + 600, bits: 8, sig: 'off' };
    return S.powChallenge();
};

// ---- sign-in by OTP -------------------------------------------------------------------
const otpHash = (phone, code) => S.hmac('otp.' + phone + '.' + code);

A.otp_send = async (req, body) => {
    const phone = S.cleanPhone(body.phone);
    if (!S.okPhone(phone)) throw fail(400, 'Enter a 10-digit Indian mobile number.');
    await S.powCheck(body.pow);
    const ip = S.clientIp(req);
    await S.hit('otp:ip:' + ip, 20, 3600, 'Too many codes asked from this network.');
    await S.hit('otp:ph:h:' + phone, 5, 3600, 'Too many codes for this number.');
    await S.hit('otp:ph:d:' + phone, 10, 86400, 'Too many codes for this number today.');
    const fixed = process.env.GPLAY_STATIC_PHONE && process.env.GPLAY_STATIC_OTP && phone === process.env.GPLAY_STATIC_PHONE && /^\d{4}$/.test(process.env.GPLAY_STATIC_OTP);
    const dry = process.env.SMS_DRY_RUN === '1' && process.env.NODE_ENV !== 'production';
    const code = fixed ? process.env.GPLAY_STATIC_OTP : String(crypto.randomInt(1000, 10000));
    await pool.query('UPDATE web_otp SET used = true WHERE phone = $1 AND used = false', [phone]);
    await pool.query("INSERT INTO web_otp (phone, code_hash, expires_at) VALUES ($1, $2, now() + interval '5 minutes')", [phone, otpHash(phone, code)]);
    if (!fixed && !dry) {
        try { await authService.sendSMS({ otp: code, phone }); }
        catch (e) {
            console.error('web otp SMS failed:', e && e.message);
            throw fail(502, "We couldn't send the code right now. Please try again in a minute.");
        }
    }
    return { ok: true, resend_in: 30, ...(dry ? { dev_code: code } : {}) };
};

A.otp_verify = async (req, body) => {
    const phone = S.cleanPhone(body.phone), code = String(body.code || '').replace(/\D/g, '');
    if (!S.okPhone(phone) || code.length !== 4) throw fail(400, 'That code doesn\'t match. Check the message and try again.');
    await S.hit('otpv:ip:' + S.clientIp(req), 40, 3600, 'Too many tries from this network.');
    const r = await pool.query(
        'SELECT id, code_hash, attempts FROM web_otp WHERE phone = $1 AND used = false AND expires_at > now() ORDER BY id DESC LIMIT 1', [phone]);
    if (!r.rowCount) throw fail(400, 'That code has expired. Ask for a new one.');
    const row = r.rows[0];
    if (row.attempts >= 5) throw fail(429, 'Too many wrong codes. Ask for a new one.', { retry: 60 });
    const want = Buffer.from(row.code_hash), got = Buffer.from(otpHash(phone, code));
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
        await pool.query('UPDATE web_otp SET attempts = attempts + 1 WHERE id = $1', [row.id]);
        throw fail(400, 'That code doesn\'t match. Check the message and try again.');
    }
    await pool.query('UPDATE web_otp SET used = true WHERE id = $1', [row.id]);
    const uid = await ensureUser(phone);
    return { ok: true, token: S.signToken({ p: phone, u: uid, e: Math.floor(Date.now() / 1000) + 30 * 86400 }) };
};

// ---- prices and the offer -------------------------------------------------------------
A.prices = async (req, body) => {
    S.readToken(body.token);
    const cat = await loadCatalog();
    const bases = {};
    cat.models.forEach((m) => { bases[m.id] = Math.max(...m.cfgs.map((c) => c.price)); });
    return { ok: true, bases };
};

A.unlock = async (req, body) => {
    const tk = S.readToken(body.token);
    const w = await workOut(body, tk);
    await pool.query(
        'INSERT INTO web_leads (phone, model, vi, price, data) VALUES ($1, $2, $3, $4, $5)',
        [tk.p, w.m.id, w.vi, w.price, JSON.stringify({ src: S.str(body.src, 60), answers: w.ans })]).catch(() => {});
    return { ok: true, price: w.price, now: w.now, top: w.q.top, lock_until: S.istDate(w.hold.until) };
};

A.lead_reason = async (req, body) => {
    const tk = S.readToken(body.token);
    const reason = S.str(body.reason, 40);
    const m = S.str(body.model, 160);
    const vi = Math.max(0, parseInt(body.vi, 10) || 0);
    const u = await pool.query(
        `UPDATE web_leads SET reason = $4 WHERE id = (SELECT id FROM web_leads WHERE phone = $1 AND model = $2 AND vi = $3 ORDER BY id DESC LIMIT 1)`,
        [tk.p, m, vi, reason]);
    if (!u.rowCount) await pool.query('INSERT INTO web_leads (phone, model, vi, reason) VALUES ($1, $2, $3, $4)', [tk.p, m, vi, reason]);
    return { ok: true };
};

// ---- referral -------------------------------------------------------------------------
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from(crypto.randomBytes(6)).map((b) => CODE_CH[b % 32]).join('');
A.ref_code = async (req, body) => {
    const tk = S.readToken(body.token);
    const have = await pool.query('SELECT code FROM web_referrals WHERE phone = $1', [tk.p]);
    if (have.rowCount) return { ok: true, code: have.rows[0].code };
    for (let i = 0; i < 6; i++) {
        const code = makeCode();
        const ins = await pool.query('INSERT INTO web_referrals (phone, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING code', [tk.p, code]);
        if (ins.rowCount) return { ok: true, code };
        const again = await pool.query('SELECT code FROM web_referrals WHERE phone = $1', [tk.p]);
        if (again.rowCount) return { ok: true, code: again.rows[0].code };
    }
    throw fail(500, 'Could not make a code. Please try again.');
};
A.ref_check = async (req, body, query) => {
    const g = await S.setting('growth');
    const code = String(query.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    await S.hit('refc:ip:' + S.clientIp(req), 60, 3600, 'Too many tries.');
    if (!g.ref_on || code.length !== 6) return { ok: false };
    const r = await pool.query('SELECT 1 FROM web_referrals WHERE code = $1', [code]);
    return { ok: r.rowCount > 0, friend: +g.ref_friend || 0 };
};

// ---- booking --------------------------------------------------------------------------
const PIN_RE = /^[1-9]\d{5}$/;

async function createSell(req, body) {
    const tk = S.readToken(body.token);
    await S.hit('order:ph:' + tk.p, 10, 3600, 'Too many bookings from this number. Please call us.');
    await S.hit('order:ip:' + S.clientIp(req), 30, 3600, 'Too many bookings from this network.');
    const biz = await S.setting('business');
    const name = S.str(body.name, 60), contact = S.cleanPhone(body.phone), pin = S.str(body.pincode, 6), addr = S.str(body.address, 250);
    if (name.length < 2) throw fail(400, 'Enter your name.');
    if (!S.okPhone(contact)) throw fail(400, 'Enter a 10-digit Indian mobile number.');
    if (!PIN_RE.test(pin)) throw fail(400, 'Enter your 6-digit pincode.');
    if (!(biz.pins || []).some((p) => pin.startsWith(String(p)))) throw fail(400, `We don't pick up in ${pin} yet. Call or WhatsApp us and we'll see what we can do.`);
    if (addr.length < 5) throw fail(400, 'Enter your full address.');
    const city = (biz.cities || []).includes(body.city) ? body.city : biz.defaultCity;

    // when
    const rapid = body.slot_time === 'Rapid';
    const today = S.istDate();
    let date = S.str(body.slot_date, 10), slot = { start: '10:00', end: '18:00' }, slotLabel = S.str(body.slot_time, 40);
    if (rapid) {
        if (!(biz.rapid && biz.rapid.on)) throw fail(400, 'Rapid pickup is not available right now. Please pick a time slot.');
        const hr = new Date(Date.now() + 19800e3).getUTCHours();
        if (hr < biz.rapid.from || hr >= biz.rapid.to) throw fail(400, 'Rapid pickup just closed for today. Please pick a time slot.');
        date = today;
        const t = (ms) => new Date(ms + 19800e3).toISOString().slice(11, 16);
        slot = { start: t(Date.now()), end: t(Date.now() + (biz.rapid.minutes || 90) * 60000) };
    } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > S.istDate(Date.now() + 30 * 864e5)) throw fail(400, 'Pick a pickup day.');
        const p = S.parseSlot(slotLabel);
        if (!p) throw fail(400, 'Pick a time slot.');
        slot = p;
    }

    const w = await workOut(body, tk);
    const growth = await S.setting('growth');
    const phoneKnown = await pool.query("SELECT 1 FROM web_orders WHERE phone = $1 AND type = 'sell' LIMIT 1", [tk.p]);
    let refBonus = 0;
    const refCode = String(body.ref || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (growth.ref_on && refCode.length === 6 && !phoneKnown.rowCount) {
        const rr = await pool.query('SELECT phone FROM web_referrals WHERE code = $1', [refCode]);
        if (rr.rowCount && rr.rows[0].phone !== tk.p) refBonus = +growth.ref_friend || 0;
    }
    const todayBonus = growth.today_on && +growth.today_amount > 0 && date === today && w.price >= (+growth.today_min || 0) ? +growth.today_amount : 0;
    const video = !!(growth.video_on && body.video && w.price >= (+growth.video_min || 0));

    const title = `${w.m.name} · ${w.cfg.name}`;
    const payTxt = S.str(body.payout, 20);
    const client = await pool.connect();
    let out;
    try {
        await client.query('BEGIN');
        const st = await client.query("SELECT id FROM enum_master WHERE master_name = 'listing_status' AND option_name = 'pending'");
        if (!st.rowCount) throw fail(500, 'Server is not set up (listing status "pending" is missing).');
        const prof = await client.query('SELECT first_name FROM user_profile WHERE user_id = $1', [tk.u]);
        if (prof.rowCount && (!prof.rows[0].first_name || prof.rows[0].first_name === 'Customer')) {
            await client.query('UPDATE user_profile SET first_name = $2 WHERE user_id = $1', [tk.u, name]);
        } else if (!prof.rowCount) {
            await client.query('INSERT INTO user_profile (user_id, first_name, last_name) VALUES ($1, $2, $3)', [tk.u, name, '']);
        }
        const ad = await client.query(
            `INSERT INTO addresses (user_id, name, phone, line1, line2, city, state, pincode, country, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false) RETURNING id`,
            [tk.u, name, contact, addr, '', city, (biz.states || {})[city] || '', pin, 'India']);
        const ls = await client.query(
            `INSERT INTO sell_listings (user_id, category_id, brand_id, model_id, config_id, base_price, quoted_price, expected_price, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [tk.u, w.m.db.category_id, w.m.db.brand_id, w.m.db.model_id, w.cfg.id, w.cfg.price, w.price, w.price, st.rows[0].id]);
        const listingId = ls.rows[0].id;
        // answers that belong to your own questions go into sell_listing_answers (your merchant app shows them);
        // the page's built-in questions have no row there, so they are kept on the order instead
        const checks = [];
        for (const q of qFor(w.list, w.m)) {
            const picked = (Array.isArray(w.ans[q.id]) ? w.ans[q.id].map(String) : []);
            if (q.type === 'battery') { checks.push({ q: q.title, a: [picked[0] === 'unsure' ? 'Not sure' : picked[0] + '%'] }); continue; }
            const opts = q.options.filter((o) => picked.includes(o.id));
            checks.push({ q: q.title, a: opts.map((o) => o.label) });
            if (q.db) for (const o of opts) {
                await client.query('INSERT INTO sell_listing_answers (listing_id, question_id, option_id) VALUES ($1, $2, $3)', [listingId, +q.id, +o.id]);
            }
        }
        const notes = [`Website/app booking`, `Payout: ${payTxt || 'cash or UPI at the door'}`, body.device ? `Device: ${S.str(body.device, 300)}` : '', rapid ? 'RAPID pickup' : ''].filter(Boolean).join(' | ');
        await client.query(
            `INSERT INTO sell_pickups (listing_id, address_id, pickup_date, pickup_slot_start, pickup_slot_end, notes) VALUES ($1, $2, $3, $4, $5, $6)`,
            [listingId, ad.rows[0].id, date, slot.start, slot.end, notes]);
        const seq = await client.query("SELECT nextval('web_order_seq') n");
        const code = S.orderCode(seq.rows[0].n), key = newKey();
        const when = rapid ? 'Rapid pickup' : `${new Date(date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${slotLabel}`;
        await client.query(
            `INSERT INTO web_orders (code, access_key, type, listing_id, user_id, phone, title, amount, city, data)
             VALUES ($1, $2, 'sell', $3, $4, $5, $6, $7, $8, $9)`,
            [code, key, listingId, tk.u, tk.p, title, w.price, city,
                JSON.stringify({ model: w.m.id, model_name: w.m.name, vi: w.vi, checks, tests: body.tests || {}, device: S.str(body.device, 300),
                    geo: body.geo && typeof body.geo === 'object' ? { lat: +body.geo.lat || null, lng: +body.geo.lng || null } : null,
                    contact, contact_name: name, address: addr, pincode: pin, payout: payTxt, when, rapid, slot_date: date, slot_time: rapid ? 'Rapid' : slotLabel,
                    ref: refBonus ? refCode : '', ref_bonus: refBonus, today_bonus: todayBonus, video, wa_offers: !!body.wa_offers, src: S.str(body.src, 60) })]);
        await client.query('COMMIT');
        out = { ok: true, id: code, key, title, amount: w.price, lock_until: S.istDate(w.hold.until), ref_bonus: refBonus, today_bonus: todayBonus, video, agent_card: null, wa: false };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally { client.release(); }
    return out;
}

async function createRepair(req, body) {
    const phone = S.cleanPhone(body.phone), pin = S.str(body.pincode, 6);
    if (!S.okPhone(phone)) throw fail(400, 'Enter a 10-digit Indian mobile number.');
    if (!PIN_RE.test(pin)) throw fail(400, 'Enter your 6-digit pincode.');
    await S.hit('rep:ph:' + phone, 5, 3600, 'Too many bookings from this number. Please call us.');
    await S.hit('rep:ip:' + S.clientIp(req), 20, 3600, 'Too many bookings from this network.');
    const biz = await S.setting('business'), rep = await S.setting('repair');
    if (!(biz.pins || []).some((p) => pin.startsWith(String(p)))) throw fail(400, `We don't pick up in ${pin} yet. Call or WhatsApp us and we'll see what we can do.`);
    const di = rep.devices.findIndex((d) => d[0] === body.device), iss = rep.issues.find((i) => i[0] === body.issue);
    if (di < 0 || !iss) throw fail(400, 'Pick your phone and what needs fixing.');
    const mode = body.mode === 'walk' ? 'walk' : 'door';
    const city = (biz.cities || []).includes(body.city) ? body.city : biz.defaultCity;
    const title = `${iss[1]} repair · ${rep.devices[di][1]}`;
    const seq = await pool.query("SELECT nextval('web_order_seq') n");
    const code = S.orderCode(seq.rows[0].n), key = newKey();
    const when = mode === 'door' ? 'Technician calls to fix a time' : 'Walk in any time';
    await pool.query(
        `INSERT INTO web_orders (code, access_key, type, phone, title, amount, city, data) VALUES ($1, $2, 'repair', $3, $4, $5, $6, $7)`,
        [code, key, phone, title, iss[2][di], city, JSON.stringify({ device: body.device, issue: body.issue, mode, pincode: pin, when, model_name: title })]);
    return { ok: true, id: code, key, title, amount: iss[2][di], agent_card: null, wa: false };
}

A.create_order = async (req, body) => {
    await S.ensureSchema();
    if (body.type === 'repair') return createRepair(req, body);
    if (body.type === 'sell') return createSell(req, body);
    throw fail(400, 'Something went wrong. Please try again.');
};

// ---- tracking -------------------------------------------------------------------------
const FLOWS = {
    sell: ['Pickup booked', 'Agent assigned', 'Device checked', 'Paid'],
    repair: ['Repair booked', 'Technician assigned', 'Repaired and tested', 'Handed back to you'],
};
const SELL_STEP = { pending: 1, assigned: 2, inspection_complete: 3, completed: 4, cancelled: 0 };

async function shape(o) {
    const d = o.data || {};
    const flow = FLOWS[o.type] || FLOWS.sell;
    let step = 1, cancelled = false, agent = null;
    const history = [{ step: 1, at: S.epoch(o.created_at) }];
    if (o.type === 'sell' && o.listing_id) {
        const l = await pool.query(
            `SELECT em.option_name status, sl.updated_at, sl.assigned_merchant_id,
                    sp.assigned_agent_id,
                    COALESCE(NULLIF(trim(concat_ws(' ', ap.first_name, ap.last_name)), ''), NULLIF(trim(concat_ws(' ', mp.first_name, mp.last_name)), '')) person,
                    COALESCE(au.phone, mu.phone) person_phone
               FROM sell_listings sl
          LEFT JOIN enum_master em ON em.id = sl.status AND em.master_name = 'listing_status'
          LEFT JOIN sell_pickups sp ON sp.listing_id = sl.id
          LEFT JOIN users au ON au.id = sp.assigned_agent_id LEFT JOIN user_profile ap ON ap.user_id = au.id
          LEFT JOIN users mu ON mu.id = sl.assigned_merchant_id LEFT JOIN user_profile mp ON mp.user_id = mu.id
              WHERE sl.id = $1 ORDER BY sp.id DESC LIMIT 1`, [o.listing_id]);
        if (l.rowCount) {
            const r = l.rows[0];
            cancelled = r.status === 'cancelled';
            step = cancelled ? 1 : (SELL_STEP[r.status] || 1);
            if (cancelled) { step = o.status === 'booked' ? 1 : 1; history.push({ step: 1, at: S.epoch(r.updated_at), cancelled: true }); }
            else for (let s = 2; s <= step; s++) history.push({ step: s, at: S.epoch(r.updated_at) });
            if (r.person && step >= 2 && !cancelled) agent = { name: r.person, phone: String(r.person_phone || '').replace(/\D/g, '').slice(-10), role: 'pickup', open: step < 4, verified: false, slot: d.when || '' };
        }
    } else {
        cancelled = o.status === 'cancelled';
        step = { booked: 1, assigned: 2, repaired: 3, done: 4 }[o.status] || 1;
        for (let s = 2; s <= step; s++) history.push({ step: s, at: S.epoch(o.updated_at) });
        if (d.agent && step >= 2) agent = { name: d.agent.name, phone: String(d.agent.phone || ''), role: 'technician', open: step < 4, verified: false };
    }
    return {
        ok: true, id: o.code, key: o.access_key, type: o.type, title: o.title, amount: o.amount == null ? null : +o.amount,
        step, flow, cancelled, history, when: d.when || '', slot: d.when || '', agent_card: agent,
        checks: o.type === 'sell' ? (d.checks || []).map((c) => ({ q: c.q, a: Array.isArray(c.a) ? c.a : [c.a] })) : undefined, video: d.video ? { done: false } : undefined,
    };
}

A.track = async (req, body, query) => {
    const code = normId(query.id);
    await S.hit('track:ip:' + S.clientIp(req), 120, 3600, 'Too many lookups. Please try again later.');
    if (!SMK_RE.test(code)) throw fail(404, `We couldn't find ${S.str(query.id, 20).toUpperCase() || 'that order'}. The ID is on your booking confirmation.`);
    const r = await pool.query('SELECT * FROM web_orders WHERE code = $1', [code]);
    const nf = () => fail(404, `We couldn't find ${code}. The ID is on your booking confirmation.`);
    if (!r.rowCount) throw nf();
    const o = r.rows[0];
    const k = String(query.k || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 16).toUpperCase();
    const ph = String(query.ph || '').replace(/\D/g, '');
    const phones = [o.phone, (o.data || {}).contact].filter(Boolean);
    const byKey = k && sameKey(k, o.access_key);
    const byPhone = ph.length === 4 && phones.some((p) => String(p).slice(-4) === ph);
    if (!byKey && !byPhone) {
        // wrong guesses are limited, so order numbers cannot be walked through
        await S.hit('track:miss:' + S.clientIp(req), 20, 3600, 'Too many tries.');
        throw fail(403, ph.length === 4 ? 'Those digits don\'t match this order.' : 'For your privacy, enter the last 4 digits of the mobile number you booked with.', { need: 'phone' });
    }
    return shape(o);
};

A.my_orders = async (req, body) => {
    const tk = S.readToken(body.token);
    const r = await pool.query('SELECT * FROM web_orders WHERE phone = $1 OR user_id = $2 ORDER BY id DESC LIMIT 20', [tk.p, tk.u]);
    const out = [];
    for (const o of r.rows) {
        const s = await shape(o);
        out.push({ id: s.id, key: s.key, type: s.type, title: s.title, amount: s.amount, step: s.step, cancelled: s.cancelled, when: s.when, created: S.epoch(o.created_at) * 1000, city: o.city, live: true });
    }
    return { ok: true, orders: out };
};

// ---- requests: call-back, model not listed, beat my quote, watch price, delete account ---
const SHOT_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
A.request = async (req, body) => {
    await S.ensureSchema();
    const kind = S.str(body.kind, 20);
    const ip = S.clientIp(req);
    await S.hit('rq:ip:' + ip, 30, 3600, 'Too many requests from this network.');
    const biz = await S.setting('business');
    const city = (biz.cities || []).includes(body.city) ? body.city : biz.defaultCity;
    const save = (phone, data) => pool.query('INSERT INTO web_requests (kind, phone, data) VALUES ($1, $2, $3)', [kind, phone || null, JSON.stringify(data)]);
    const m = S.str(body.model, 160), vi = Math.max(0, parseInt(body.vi, 10) || 0);

    if (kind === 'call') {
        if (S.str(body.website, 100)) return { ok: true };                  // a robot filled the hidden field
        await S.powCheck(body.pow);
        const name = S.str(body.name, 60), phone = S.cleanPhone(body.phone);
        if (name.length < 2) throw fail(400, 'Enter your name.');
        if (!S.okPhone(phone)) throw fail(400, 'Enter a 10-digit Indian mobile number.');
        await S.hit('rq:call:' + phone, 3, 3600, 'We already have your request. We will call you soon.');
        await save(phone, { name, model: m, vi, city, where: S.str(body.where, 20), src: S.str(body.src, 60) });
        return { ok: true };
    }
    if (kind === 'model') {
        await S.powCheck(body.pow);
        const phone = S.cleanPhone(body.phone), model = S.str(body.model, 100);
        if (model.length < 2) throw fail(400, 'Type the model name.');
        if (!S.okPhone(phone)) throw fail(400, 'Enter a 10-digit Indian mobile number.');
        await S.hit('rq:model:' + phone, 5, 3600, 'Too many requests from this number.');
        await save(phone, { brand: S.str(body.brand, 60), model, storage: S.str(body.storage, 40), cond: S.str(body.cond, 20), cat: S.str(body.cat, 20), city, src: S.str(body.src, 60) });
        return { ok: true };
    }
    // everything below needs a verified mobile number
    const tk = S.readToken(body.token);
    if (kind === 'beat') {
        const their = Math.round(+body.their);
        if (!(their >= 100 && their <= 1000000)) throw fail(400, 'Enter the price they offered, in rupees.');
        if (typeof body.shot !== 'string' || body.shot.length > 1500000 || !SHOT_RE.test(body.shot)) throw fail(400, 'Add a screenshot of their quote (a JPG, PNG or WebP picture).');
        await S.hit('rq:beat:' + tk.p, 5, 86400, 'You have sent enough quotes today. We will call you.');
        await save(tk.p, { model: m, vi, their, shot: body.shot, city });
        return { ok: true };
    }
    if (kind === 'callback') {
        const when = ['asap', 'evening', 'tomorrow', 'weekend'].includes(body.when) ? body.when : 'asap';
        await S.hit('rq:cb:' + tk.p, 5, 3600, 'We already have your request. We will call you soon.');
        await save(tk.p, { model: m, vi, when, city });
        return { ok: true };
    }
    if (kind === 'bulk') {
        const count = Math.round(+body.count);
        if (!(count >= 2 && count <= 500)) throw fail(400, 'Tell us how many devices you have.');
        await save(tk.p, { count, what: S.str(body.what, 200), city });
        return { ok: true };
    }
    if (kind === 'upgrade') {
        const d = S.str(body.date, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d <= S.istDate() || d > S.istDate(Date.now() + 92 * 864e5)) throw fail(400, 'Pick the day your new phone arrives, in the next 3 months.');
        await save(tk.p, { model: m, vi, date: d, city });
        return { ok: true };
    }
    if (kind === 'watch') {
        await save(tk.p, { model: m, vi, city });
        return { ok: true };
    }
    if (kind === 'delete') {
        const reason = S.str(body.reason, 500) || 'Requested from the website';
        await pool.query(
            `INSERT INTO request_deletion (user_id, reason) VALUES ($1, $2)
             ON CONFLICT (user_id) DO UPDATE SET reason = $2, updated_at = NOW()`, [tk.u, reason]);
        await save(tk.p, { name: S.str(body.name, 60), reason, city });
        return { ok: true };
    }
    throw fail(400, 'Something went wrong. Please try again.');
};

A.waitlist_join = async (req, body) => {
    await S.ensureSchema();
    await S.powCheck(body.pow);
    const phone = S.cleanPhone(body.phone), city = S.str(body.city, 40);
    const biz = await S.setting('business');
    if (!S.okPhone(phone)) throw fail(400, 'Enter a 10-digit Indian mobile number.');
    if (!(biz.soon || []).includes(city)) throw fail(400, 'Pick a city from the list.');
    await S.hit('wl:ip:' + S.clientIp(req), 20, 3600, 'Too many tries from this network.');
    await pool.query('INSERT INTO web_waitlist (city, phone) VALUES ($1, $2) ON CONFLICT DO NOTHING', [city, phone]);
    return { ok: true };
};

A.ai = async () => { throw fail(404, 'The AI check is not switched on.'); };

// ====================================================================================
// entry point used by routes/web.routes.js
// ====================================================================================
const GET_OK = new Set(['catalog', 'pow', 'track', 'ref_check']);
exports.handle = async (req) => {
    await S.ensureSchema();
    const action = String(req.query.action || '').toLowerCase();
    const fn = Object.prototype.hasOwnProperty.call(A, action) ? A[action] : null;
    if (!fn) throw fail(404, 'Something went wrong. Please try again.');
    const isGet = req.method === 'GET';
    if (isGet && !GET_OK.has(action)) throw fail(405, 'Something went wrong. Please try again.');
    if (!isGet && GET_OK.has(action) && !['ref_check'].includes(action) && action !== 'pow') throw fail(405, 'Something went wrong. Please try again.');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const src = S.str(body.src, 60);
    if (src) body.src = src;
    return fn(req, body, req.query || {});
};
exports.__test = { quote, normId };
