/*
 * Technician app API:  /api/tech?action=...
 *
 * The Recello Partner (technician) app talks only to this. It is additive: it reads the orders the website / app
 * already writes (web_orders -> sell_listings / sell_pickups / addresses / sell_listing_answers) and keeps its own
 * state in the tech_* tables (database/migration_tech.sql). No existing table is changed.
 *
 *   who      users + user_roles('technician')  -> signs in with a 6-digit SMS code, gets a long-lived bearer token
 *   leads    sell_pickups.assigned_agent_id = the technician  (assign in the admin panel, or action=admin_assign)
 *   money    1 Point = Rs 1; a lead takes its Points when it is first given, they come back if the customer says no
 *            before the start code (tech_wallet)
 *   price    always worked out here, never in the app. The app never sees a cut, only prices and "cuts: yes/no".
 *
 * Every response is JSON; errors are { error: "..." } with a 4xx status (and "retry" seconds on a 429).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const pool = require('../config/database');
const S = require('./web.store');
const QX = require('./question.extra');

const DEFAULTS = require('../config/tech-defaults.json');
const WEB_Q = require('../config/web-questions.json');
const PRIVATE_DIR = path.join(__dirname, '..', 'private', 'tech');

const fail = (status, message, extra) => Object.assign(new Error(message), { status, message }, extra || {});
/** E(msg, status, persist): persist = keep the changes made so far (e.g. a wrong-code counter) even though the call fails */
const E = (msg, status, persist) => { throw fail(status || 400, msg, persist ? { persist: true } : {}); };
const now = () => Math.floor(Date.now() / 1000);
const r10 = (x) => Math.round(x / 10) * 10;
const rs = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const mask = (p) => String(p || '').slice(0, 2) + '••••••' + String(p || '').slice(-2);
const clone = (x) => JSON.parse(JSON.stringify(x));
const luhn = (s) => { let sum = 0; for (let i = 0; i < 15; i++) { let d = Number(s[14 - i]); if (i % 2) { d *= 2; if (d > 9) d -= 9; } sum += d; } return sum % 10 === 0; };
const PAGE_CATS = ['phone', 'tablet', 'laptop', 'watch'];
const TYPE_OF = { yes_no: 'single', single_select: 'single', multi_select: 'multi' };

// ====================================================================================
// schema + settings
// ====================================================================================
let schemaReady = null;
function ensureSchema() {
    if (!schemaReady) {
        const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'migration_tech.sql'), 'utf8');
        schemaReady = pool.query(sql).catch((e) => { schemaReady = null; throw e; });
    }
    return schemaReady;
}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const merge = (a, b) => (isObj(a) && isObj(b) ? Object.keys({ ...a, ...b }).reduce((o, k) => { o[k] = k in b ? merge(a[k], b[k]) : a[k]; return o; }, {}) : (b === undefined ? a : b));
/** defaults (config/tech-defaults.json) overridden per key by web_settings row key='tech' */
async function cfg() {
    const rows = await S.allSettings();
    return merge(clone(DEFAULTS), rows.tech || {});
}

// ====================================================================================
// small shared pieces: sms, tokens, files
// ====================================================================================
const dry = () => process.env.SMS_DRY_RUN === '1' && process.env.NODE_ENV !== 'production';

async function sendSms(phone, text) {
    const r = await axios.post('https://api.dovesoft.io/api/json/sendsms/', {
        listsms: [{ sms: text, mobiles: '+91' + phone, senderid: process.env.DOVE_SENDER_ID, entityid: process.env.DOVE_ENTITY_ID,
            tempid: process.env.TECH_DOVE_TEMPLATE_ID || process.env.DOVE_TEMPLATE_ID }],
    }, { headers: { 'Content-Type': 'application/json', key: process.env.DOVE_API_KEY }, timeout: 15000 });
    return r.data;
}

const hmac = (s, n) => S.hmac(s, n || 32);
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

function signToken(user, roles) {
    return jwt.sign({ userId: user.id, email: user.email || null, roles, tech: true }, process.env.JWT_ACCESS_SECRET,
        { expiresIn: `${parseInt(process.env.TECH_TOKEN_DAYS, 10) || 30}d` });
}

function sniff(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xFF && buf[1] === 0xD8) return { ext: 'jpg', mime: 'image/jpeg' };
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return { ext: 'png', mime: 'image/png' };
    if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
    if (buf.slice(4, 8).toString() === 'ftyp' && /^(heic|heix|mif1|msf1|heim|heis)/.test(buf.slice(8, 12).toString())) return { ext: 'heic', mime: 'image/heic' };
    if (buf.slice(0, 5).toString() === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
    return null;
}
function saveFile(sub, buf, ext) {
    const dir = path.join(PRIVATE_DIR, sub);
    fs.mkdirSync(dir, { recursive: true });
    const name = crypto.randomBytes(16).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(dir, name), buf);
    return sub + '/' + name;
}
const filePath = (rel) => { const p = path.join(PRIVATE_DIR, rel); if (!p.startsWith(PRIVATE_DIR + path.sep)) throw fail(404, 'Not found.'); return p; };

// ====================================================================================
// who is calling
// ====================================================================================
async function techFrom(req, roleNeeded) {
    const h = String(req.headers.authorization || '');
    const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
    let p;
    try { p = jwt.verify(tok, process.env.JWT_ACCESS_SECRET); } catch (_) { throw fail(401, 'Please sign in again.'); }
    const roles = Array.isArray(p.roles) ? p.roles : [];
    if (!roles.includes(roleNeeded)) throw fail(roleNeeded === 'admin' ? 403 : 401, roleNeeded === 'admin' ? 'Access denied' : 'Please sign in again.');
    const r = await pool.query(
        `SELECT u.id, u.phone, u.email, u.status, COALESCE(NULLIF(trim(concat_ws(' ', up.first_name, up.last_name)), ''), 'Partner') name,
                tp.city, tp.id_no, tp.active, tp.verified, tp.terms_ver, tp.terms_at, tp.last_seen, tp.created_at joined
           FROM users u
      LEFT JOIN user_profile up ON up.user_id = u.id
      LEFT JOIN tech_profiles tp ON tp.user_id = u.id
          WHERE u.id = $1`, [p.userId]);
    if (!r.rowCount) throw fail(401, 'Please sign in again.');
    const u = r.rows[0];
    if (roleNeeded === 'technician' && (u.active === false || u.status !== 1)) throw fail(401, 'This account is switched off. Call Recello.');
    return u;
}
const meOf = (u) => ({ id: Number(u.id), name: u.name, phone: String(u.phone), city: u.city || 'Pune', role: 'technician', verified: !!u.verified });

// ====================================================================================
// questions + the customer's answers (the same sources the website uses)
// ====================================================================================
const lc = (s) => String(s || '').toLowerCase();
function uploadPath(url) {
    if (!url) return '';
    const f = String(url).replace(/^\/+/, '').replace(/^uploads\//, '');
    return /^[\w.-]+$/.test(f) ? 'uploads/' + f : '';
}
async function pageCatOf(slug) {
    const catmap = await S.setting('catmap');
    const s = lc(slug);
    for (const k of PAGE_CATS) if ((catmap[k] || []).map(lc).includes(s)) return k;
    if (/mobile|phone/.test(s)) return 'phone';
    if (/tablet|ipad/.test(s)) return 'tablet';
    if (/laptop|macbook|notebook/.test(s)) return 'laptop';
    if (/watch/.test(s)) return 'watch';
    return 'phone';
}

let qCache = { at: 0, v: null };
/** every question with its % cuts (server side only) */
async function loadQuestions() {
    if (qCache.v && Date.now() - qCache.at < 45000) return qCache.v;
    const qr = await pool.query(
        `SELECT sq.id, sq.text, sq.description, sq.input_type, c.slug cat_slug
           FROM sell_questions sq
           JOIN sell_category_questions scq ON scq.question_id = sq.id
           JOIN categories c ON c.id = scq.category_id
      LEFT JOIN enum_master ctx ON ctx.id = sq.context AND ctx.master_name = 'question_context'
          WHERE sq.is_active IS NOT FALSE AND (ctx.option_name IS NULL OR ctx.option_name IN ('sell', 'both'))
          ORDER BY scq.sort_index, sq.sort_index, sq.id`);
    const byQ = new Map();
    for (const r of qr.rows) {
        const cat = await pageCatOf(r.cat_slug);
        let q = byQ.get(r.id);
        if (!q) {
            q = { id: String(r.id), title: r.text, help: r.description || '', type: TYPE_OF[lc(r.input_type)] || 'single', cats: [], brands: [], models: [], active: true, options: [], db: true };
            byQ.set(r.id, q);
        }
        if (!q.cats.includes(cat)) q.cats.push(cat);
    }
    const ids = [...byQ.keys()];
    if (ids.length) {
        await QX.ensure();
        const or = await pool.query(
            `SELECT sqo.id, sqo.question_id, sqo.text, sqo.price_deduction, img.url
               FROM sell_question_options sqo LEFT JOIN images img ON img.id = sqo.option_image_id
              WHERE sqo.question_id = ANY($1::bigint[]) AND sqo.is_active IS NOT FALSE ORDER BY sqo.sort_index, sqo.id`, [ids]);
        or.rows.forEach((o) => {
            const q = byQ.get(String(o.question_id)) || byQ.get(Number(o.question_id));
            if (q) q.options.push({ id: String(o.id), label: String(o.text), deduct: +o.price_deduction || 0, img: QX.optImg(o.url, uploadPath) });
        });
    }
    await QX.enrich(byQ); // brand / model scope + battery bands
    const list = [...byQ.values()].filter((q) => q.options.length || q.type === 'battery');
    const have = new Set();
    list.forEach((q) => q.cats.forEach((c) => have.add(c)));
    const missing = PAGE_CATS.filter((c) => !have.has(c));
    if (missing.length) WEB_Q.forEach((q) => {
        const cats = (q.cats || []).filter((c) => missing.includes(c));
        if (cats.length) list.push({ ...clone(q), cats });
    });
    qCache = { at: Date.now(), v: list };
    return list;
}
const qFor = (Q, m) => Q.filter((q) => q.active !== false && (q.cats || []).includes(m.cat)
    && (!(q.brands || []).length || q.brands.some((b) => lc(b) === lc(m.brand)))
    && (!(q.models || []).length || q.models.includes(m.model_key))
    && q.type !== 'color')
    .filter((q) => q.type === 'battery' || (q.options || []).length);

/** what the customer told the website, turned back into option ids (the order keeps question + answer text) */
function answersFrom(Q, checks) {
    const out = {};
    for (const q of Q) {
        const c = (checks || []).find((x) => x.q === q.title);
        if (!c) continue;
        const a = Array.isArray(c.a) ? c.a : [c.a];
        if (q.type === 'battery') { const v = String(a[0] || ''); out[q.id] = [/not sure/i.test(v) ? 'unsure' : v.replace(/\D/g, '')].filter(Boolean); continue; }
        out[q.id] = q.options.filter((o) => a.includes(o.label)).map((o) => o.id);
    }
    return out;
}
function cutOf(q, ids) {
    ids = ids || [];
    if (q.type === 'battery') {
        const v = ids[0];
        if (v === 'unsure') return +q.unsure || 0;
        if (!(+v >= 1 && +v <= 100)) return 0;
        const b = [...(q.bands || [])].sort((x, y) => y.min - x.min).find((x) => +v >= x.min);
        return b ? +b.deduct || 0 : 0;
    }
    return (q.options || []).filter((o) => ids.includes(o.id)).reduce((s, o) => s + (+o.deduct || 0), 0);
}
/** what the app may see of a question: never the cuts */
function pubQ(q) {
    const best = Math.min(0, ...(q.options || []).map((o) => +o.deduct || 0));
    const o = { id: q.id, title: q.title, help: q.help || '', type: q.type, when: [] };
    if (q.type === 'battery') { o.unsure = true; o.options = []; return o; }
    o.options = (q.options || []).map((x) => ({ id: x.id, label: x.label, img: x.img || '', down: (+x.deduct || 0) > best }));
    return o;
}

// ====================================================================================
// leads: the orders assigned to this technician
// ====================================================================================
const ORDER_SQL = `
    SELECT o.id order_id, o.code, o.phone order_phone, o.title order_title, o.amount, o.city, o.data, o.created_at,
           sl.id listing_id, sl.base_price, sl.quoted_price, sl.category_id, sl.model_id, sl.user_id customer_id,
           em.option_name lstatus, cfg.name cfg_name, b.name brand, c.slug cat_slug, m.name model_name, mi.url img,
           sp.id pickup_id, sp.pickup_date, sp.pickup_slot_start, sp.pickup_slot_end, sp.assigned_agent_id,
           tv.t visit_t, tv.tech_id visit_tech
      FROM web_orders o
      JOIN sell_listings sl ON sl.id = o.listing_id
      JOIN LATERAL (SELECT * FROM sell_pickups WHERE listing_id = sl.id ORDER BY id DESC LIMIT 1) sp ON true
 LEFT JOIN enum_master em ON em.id = sl.status AND em.master_name = 'listing_status'
 LEFT JOIN sell_model_configs cfg ON cfg.id = sl.config_id
 LEFT JOIN brands b ON b.id = sl.brand_id
 LEFT JOIN categories c ON c.id = sl.category_id
 LEFT JOIN models m ON m.id = sl.model_id
 LEFT JOIN LATERAL (SELECT i.url FROM model_images mim JOIN images i ON i.id = mim.image_id WHERE mim.model_id = sl.model_id ORDER BY i.sort_index, i.id LIMIT 1) mi ON true
 LEFT JOIN tech_visits tv ON tv.code = o.code
     WHERE o.type = 'sell' AND o.listing_id IS NOT NULL`;

const hhmm = (t) => String(t || '').slice(0, 5);
const ampm = (t) => { const [h, m] = hhmm(t).split(':').map(Number); const x = h % 12 || 12; return x + (m ? ':' + String(m).padStart(2, '0') : '') + (h >= 12 ? ' PM' : ' AM'); };

/** one lead as the app sees it: order row + the visit state "t" */
async function buildJob(row, Q) {
    const d = row.data || {};
    const cat = await pageCatOf(row.cat_slug);
    const m = { cat, brand: row.brand || '', model_key: d.model };
    const questions = qFor(Q, m);
    const color = S.str(d.color, 40);
    const slotDate = d.slot_date || S.istDate(new Date(row.pickup_date).getTime() + 12 * 3600e3);
    const t = row.visit_t && typeof row.visit_t === 'object' ? row.visit_t : {};
    const variant = row.cfg_name || String(row.order_title || '').split(' · ')[1] || '';
    const model = row.model_name || d.model_name || String(row.order_title || '').split(' · ')[0];
    const quoted = Math.round(+row.quoted_price || +row.amount || 0);
    return {
        id: row.code, row, d, t, cat, m, questions, Q,
        model, variant, color, apple: lc(row.brand) === 'apple',
        title: [model, variant, color].filter(Boolean).join(' · '),
        slot_date: slotDate,
        slot_time: d.slot_time || (hhmm(row.pickup_slot_start) ? `${ampm(row.pickup_slot_start)}–${ampm(row.pickup_slot_end)}` : ''),
        city: row.city || d.city || 'Pune', pincode: d.pincode || '',
        name: String(d.contact_name || '').trim(), phone: S.cleanPhone(d.contact || row.order_phone), address: d.address || '',
        quoted, top: +row.base_price || quoted, payout_pref: S.str(d.payout, 30),
        customer_answers: answersFrom(questions, d.checks),
        img: uploadPath(row.img),
    };
}

const stageOf = (t) => {
    if (t.cancelled) return 'cancelled';
    if ((t.step || 2) >= 4) return t.done_at ? 'done' : 'paid';
    if (t.pay) return 'paying';
    if ((t.step || 2) === 3 || t.agreed) return 'agreed';
    if (t.noshow) return 'noshow';
    if (t.check) return 'checked';
    if (t.identify) return t.identify.same === false ? 'mismatch' : 'identified';
    if (t.started) return 'started';
    if (t.arrived) return 'arrived';
    if (t.onway_at) return 'onway';
    return 'new';
};
const extrasSum = (t) => (t.extras || []).reduce((s, e) => s + e.price, 0);
const priceNow = (j) => { const t = j.t; return t.smk && t.smk.status === 'approved' ? t.smk.to : t.check ? t.check.price : (t.final || j.quoted); };
const payoutNow = (j) => priceNow(j) - extrasSum(j.t);
const isOpen = (j, today) => j.slot_date <= today || !!j.t.started;

function ev(j, what, info) { (j.t.events = j.t.events || []).push({ at: now(), what, info: info || '' }); }
function flag(j, k, info) { j.t.flags = j.t.flags || []; if (!j.t.flags.some((f) => f.k === k)) j.t.flags.push({ k, at: now(), info: info || '' }); }

function card(j, today, photosCount) {
    const o = isOpen(j, today), t = j.t;
    return {
        id: j.id, title: j.title, model: j.model, variant: j.variant, color: j.color, cat: j.cat, img: j.img, slot_date: j.slot_date, slot_time: j.slot_time,
        city: j.city, pincode: j.pincode, stage: stageOf(t), step: t.step || 2, quoted: j.quoted, price: priceNow(j), payout: j.payout_pref,
        name: j.name.split(' ')[0], phone: o ? j.phone : mask(j.phone), address: o ? j.address : '',
        maps: o ? mapsLink(j) : '', open: o, flags: (t.flags || []).length, checked: !!t.check,
    };
}
function mapsLink(j) {
    const g = j.d && j.d.geo;
    if (g && g.lat && g.lng) return `https://www.google.com/maps?q=${g.lat},${g.lng}`;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${j.address}, ${j.city} ${j.pincode}`);
}

// ====================================================================================
// price (the one place cuts are used)
// ====================================================================================
function priceFor(j, T, answers, checks) {
    const Q = j.questions, was = j.customer_answers, top = j.top;
    const lines = [], blocked = [], picked = {};
    Q.forEach((q) => {
        const a = answers[q.id] || [], b = was[q.id] || [];
        if (a.slice().sort().join('|') === b.slice().sort().join('|')) return;
        const diff = -r10(top * (cutOf(q, a) - cutOf(q, b)) / 100);
        const lab = (ids) => ids.map((id) => { const o = (q.options || []).find((x) => x.id === id); return o ? o.label : q.type === 'battery' ? (id === 'unsure' ? 'Not sure' : id + '%') : id; });
        lines.push({ kind: 'q', id: q.id, q: q.title, from: lab(b), to: lab(a), diff });
    });
    T.checks.forEach((ch) => {
        if (ch.active === false) return;
        let ids = [].concat((checks || {})[ch.id] || []).filter((id) => ch.options.some((o) => o.id === id));
        if (ch.type === 'single') ids = ids.slice(0, 1);
        if (!ids.length) return;
        picked[ch.id] = ids;
        const opts = ch.options.filter((o) => ids.includes(o.id));
        opts.forEach((o) => { if (o.block) blocked.push(o.label); });
        let pct = opts.reduce((s, o) => s + (+o.deduct || 0), 0);
        const flat = opts.reduce((s, o) => s + (+o.flat || 0), 0);
        let covered = 0;
        if (ch.covers && pct > 0) { const cq = Q.find((q) => q.id === ch.covers); covered = cq ? Math.min(pct, cutOf(cq, answers[cq.id])) : 0; pct -= covered; }
        const cut = r10(top * pct / 100 + flat);
        if (cut || opts.some((o) => o.deduct || o.flat)) lines.push({ kind: 'c', id: ch.id, q: ch.title, from: [], to: opts.map((o) => o.label), diff: -cut, covered: covered || undefined, photo: opts.some((o) => o.photo) && cut > 0 });
    });
    const floor = ((await_floor.v || {})[j.cat]) || 1000;
    const price = Math.max(floor, j.quoted + lines.reduce((s, l) => s + l.diff, 0));
    return { price, was: j.quoted, lines, blocked, checks: picked };
}
const await_floor = { v: null };

/** the checks as the app sees them: "cuts: yes/no", never the numbers */
function appChecks(T, cat) {
    return T.checks.filter((c) => c.active !== false && (!c.cats || c.cats.includes(cat))).map((c) => {
        const x = clone(c);
        x.options = x.options.filter((o) => o.active !== false).map((o) => { const cuts = Number(o.deduct) > 0 || Number(o.flat) > 0; delete o.deduct; delete o.flat; o.cuts = cuts; return o; });
        return x;
    });
}

// ====================================================================================
// points (wallet)
// ====================================================================================
function ptsFor(T, price) {
    const slabs = [...T.points.slabs].sort((a, b) => a.upto - b.upto);
    for (const s of slabs) if (price <= s.upto) return s.pts;
    return T.points.above;
}
const leadMin = (T) => Math.min(T.points.above, T.points.slabs.length ? Math.min(...T.points.slabs.map((s) => s.pts)) : T.points.above);
async function balance(client, techId) {
    const r = await (client || pool).query('SELECT COALESCE(SUM(pts), 0)::int b FROM tech_wallet WHERE tech_id = $1', [techId]);
    return r.rows[0].b;
}
async function walletInfo(client, techId, T) {
    const r = await (client || pool).query('SELECT kind, pts, note, order_code, model, extract(epoch FROM at)::bigint at FROM tech_wallet WHERE tech_id = $1 ORDER BY at DESC, id DESC', [techId]);
    const month = S.istDate().slice(0, 7);
    const title = (l) => (l.kind === 'topup' ? 'Points added' : l.kind === 'lead' ? 'Lead' : l.kind === 'refund' ? 'Points returned' : 'Correction');
    const rows = r.rows.map((l) => ({ ...l, pts: Number(l.pts), at: Number(l.at) }));
    const mine = rows.filter((l) => (l.kind === 'lead' || l.kind === 'refund') && S.istDate(l.at * 1000).slice(0, 7) === month);
    return {
        word: T.points.word || 'Points', balance: rows.reduce((s, l) => s + l.pts, 0),
        added: rows.filter((l) => l.kind === 'topup').reduce((s, l) => s + l.pts, 0),
        used: -rows.filter((l) => l.kind === 'lead' || l.kind === 'refund').reduce((s, l) => s + l.pts, 0),
        month: -mine.reduce((s, l) => s + l.pts, 0), leads_month: mine.filter((l) => l.kind === 'lead').length, free: !!T.points.free, lead_min: leadMin(T),
        recent: rows.map((l) => ({ kind: l.kind, title: title(l), order_id: l.order_code, model: l.model || '', note: l.kind === 'topup' ? l.note : '', pts: l.pts, at: l.at })).slice(0, 100),
    };
}

// ====================================================================================
// the customer's 4-digit codes
// ====================================================================================
const SMS = {
    start: 'Recello: {code} is your code to let our technician start checking your phone. Share it only with the technician at your door.',
    deal: 'Recello: {code} is your code to agree to the price of {amount}. Share it only if you accept this price.',
    paid: 'Recello: {code} is your code to confirm you received {amount}. Share it only after the money is in your hands.',
    cancel: 'Recello: {code} is your code to cancel this pickup. Share it only if you do not want to sell.',
};
async function sendCode(j, purpose, amount) {
    const old = (j.t.codes || {})[purpose];
    if (old && now() - old.at < 30) E('Wait a few seconds before sending the code again.', 429);
    const code = String(crypto.randomInt(1000, 10000));
    j.t.codes = j.t.codes || {};
    j.t.codes[purpose] = { h: hmac(`tc.${j.id}.${purpose}.${code}`), amount: amount == null ? null : amount, at: now(), tries: 0 };
    ev(j, purpose + ' code sent');
    const text = (SMS[purpose] || SMS.start).replace('{code}', code).replace('{amount}', amount == null ? '' : rs(amount));
    if (!dry()) {
        try { await sendSms(j.phone, text); }
        catch (e) { console.error('tech code SMS failed:', e && e.message); delete j.t.codes[purpose]; E("We couldn't send the code right now. Try again in a minute.", 502); }
    }
    return { sent_to: mask(j.phone), via: ['sms'], resend_in: 30, ...(dry() ? { dev_code: code } : {}) };
}
function checkCode(j, purpose, code, amount) {
    code = String(code || '').replace(/\D/g, '');
    if (code.length !== 4) E('Enter the 4-digit code the customer got.');
    const c = (j.t.codes || {})[purpose];
    if (!c) E('Send the code to the customer first.');
    if (amount != null && c.amount !== amount) E('The price changed after the code was sent. Send a new code.');
    if (!eq(c.h, hmac(`tc.${j.id}.${purpose}.${code}`))) {
        c.tries++;
        const left = 4 - c.tries;
        if (left <= 0) delete j.t.codes[purpose];
        E(left > 0 ? `That code doesn't match. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Send a new one.', 400, true);
    }
    delete j.t.codes[purpose];
}

// ====================================================================================
// a visit, opened for update (row lock) and saved on the way out
// ====================================================================================
async function loadRow(client, techId, code, lock) {
    const r = await client.query(ORDER_SQL + ' AND o.code = $1' + (lock ? ' FOR UPDATE OF o' : ''), [code]);
    if (!r.rowCount) throw fail(404, 'This pickup is not available.');
    const row = r.rows[0];
    if (Number(row.assigned_agent_id) !== Number(techId)) throw fail(404, 'This pickup is not available.');
    return row;
}
/** make sure the visit row exists and the lead has taken its Points */
async function ensureVisit(client, techId, row, T) {
    if (!row.visit_t) {
        await client.query(`INSERT INTO tech_visits (code, listing_id, tech_id, t) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING`,
            [row.code, row.listing_id, techId, JSON.stringify({ step: 2, events: [], flags: [], codes: {} })]);
        row.visit_t = { step: 2, events: [], flags: [], codes: {} };
    }
    const owner = await client.query('SELECT tech_id FROM tech_visits WHERE code = $1', [row.code]);
    if (owner.rowCount && Number(owner.rows[0].tech_id) !== Number(techId)) {
        // the lead was given to someone else before: this technician starts a clean visit
        await client.query('UPDATE tech_visits SET tech_id = $2, t = $3, updated_at = now() WHERE code = $1', [row.code, techId, JSON.stringify({ step: 2, events: [], flags: [], codes: {} })]);
        row.visit_t = { step: 2, events: [], flags: [], codes: {} };
    }
    if (!T.points.free) {
        const quoted = Math.round(+row.quoted_price || +row.amount || 0);
        await client.query(
            `INSERT INTO tech_wallet (tech_id, order_code, kind, pts, model) VALUES ($1, $2, 'lead', $3, $4) ON CONFLICT DO NOTHING`,
            [techId, row.code, -ptsFor(T, quoted), row.model_name || '']);
    }
}

async function withVisit(tech, code, fn) {
    const T = await cfg();
    const Q = await loadQuestions();
    await ensureSchema();
    const client = await pool.connect();
    let j, out, err;
    try {
        await client.query('BEGIN');
        let row = await loadRow(client, tech.id, code, true);
        await ensureVisit(client, tech.id, row, T);
        row = await loadRow(client, tech.id, code, true);
        j = await buildJob(row, Q);
        j.photos = (await client.query('SELECT ref, kind, extract(epoch FROM at)::bigint at FROM tech_photos WHERE code = $1 ORDER BY at', [code])).rows.map((p) => ({ ref: p.ref, kind: p.kind, at: Number(p.at) }));
        j.tech = tech; j.T = T;
        j.today = S.istDate();
        smkExpire(j, T);
        try { out = await fn(j, client, T); } catch (e) { err = e; }
        if (!err || err.persist) {
            await client.query('UPDATE tech_visits SET t = $2, updated_at = now() WHERE code = $1', [code, JSON.stringify(j.t)]);
            await client.query('COMMIT');
        } else await client.query('ROLLBACK');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
    finally { client.release(); }
    if (err) throw err;
    return out;
}
const hasPhoto = (j, kind) => j.photos.some((p) => p.kind === kind);

async function setStatus(client, j, option, extra) {
    const st = await client.query("SELECT id FROM enum_master WHERE master_name = 'listing_status' AND option_name = $1", [option]);
    if (!st.rowCount) return;
    await client.query(`UPDATE sell_listings SET status = $2, updated_at = now() ${extra ? ', ' + extra.set : ''} WHERE id = $1`, [j.row.listing_id, st.rows[0].id, ...(extra ? extra.args : [])]);
}
async function setPickup(client, j, option) {
    const st = await client.query("SELECT id FROM enum_master WHERE master_name = 'pickup_status' AND option_name = $1", [option]);
    if (st.rowCount) await client.query('UPDATE sell_pickups SET status = $2, updated_at = now() WHERE id = $1', [j.row.pickup_id, st.rows[0].id]);
}

// ====================================================================================
// special price
// ====================================================================================
function smkExpire(j, T) {
    const s = j.t.smk;
    if (s && s.status === 'pending' && now() > s.at + T.special.wait_min * 60) { s.status = 'expired'; s.decided_at = now(); s.reply = s.reply || 'No answer came in time.'; }
}
function smkView(j, T) {
    const t = j.t, s = t.smk, S0 = T.special;
    return {
        on: S0.on !== false, label: S0.label, wait_min: S0.wait_min, asks_left: Math.max(0, S0.asks - (t.smk_asks || 0)),
        reasons: Object.keys(S0.reasons).map((k) => ({ id: k, label: S0.reasons[k] })),
        req: s ? { status: s.status, from: s.from, ask: s.ask, to: s.to || null, reason: S0.reasons[s.reason] || '', note: s.note || '', reply: s.reply || '', at: s.at, decided_at: s.decided_at || null, auto: s.by === 'auto' || s.by === 'partner', ends_at: s.status === 'pending' ? s.at + S0.wait_min * 60 : null } : null,
    };
}
function smkApprove(j, to, by, reply) {
    const s = j.t.smk; s.status = 'approved'; s.to = to; s.by = by; s.decided_at = now(); if (reply) s.reply = reply;
    j.t.final = to; delete j.t.deal; flag(j, 'smk_price');
}

// ====================================================================================
// the actions
// ====================================================================================
const A = {};
const cleanId = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

// ---- sign in -----------------------------------------------------------------------
A.otp_send = async ({ req, body }) => {
    const phone = S.cleanPhone(body.phone);
    if (!S.okPhone(phone)) E('Enter your 10-digit mobile number.');
    await S.hit('tech:otp:ip:' + S.clientIp(req), 30, 3600, 'Too many codes asked from this network.');
    await S.hit('tech:otp:ph:' + phone, 6, 3600, 'Too many codes for this number. Try later.');
    const u = await pool.query(
        `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id AND r.name = 'technician'
          WHERE u.phone IN ($1, $2) AND u.status = 1 LIMIT 1`, [phone, '91' + phone]);
    // same answer for known and unknown numbers would hide a typo from the technician; this app is not public, so be clear
    if (!u.rowCount) E('This number is not registered with Recello. Call Recello to join.', 403);
    const code = String(crypto.randomInt(100000, 1000000));
    await pool.query('UPDATE tech_otp SET used = true WHERE phone = $1 AND used = false', [phone]);
    await pool.query("INSERT INTO tech_otp (phone, code_hash, expires_at) VALUES ($1, $2, now() + interval '5 minutes')", [phone, hmac(`to.${phone}.${code}`)]);
    if (!dry()) {
        try { await require('./auth.service').sendSMS({ otp: code, phone }); }
        catch (e) { console.error('tech login SMS failed:', e && e.message); E("We couldn't send the code right now. Try again in a minute.", 502); }
    }
    return { ok: true, resend_in: 30, ...(dry() ? { dev_code: code } : {}) };
};
A.otp_verify = async ({ req, body }) => {
    const phone = S.cleanPhone(body.phone), code = String(body.code || '').replace(/\D/g, '');
    if (!S.okPhone(phone) || code.length !== 6) E("That code doesn't match.");
    await S.hit('tech:otpv:ip:' + S.clientIp(req), 40, 3600, 'Too many tries from this network.');
    const r = await pool.query('SELECT id, code_hash, attempts FROM tech_otp WHERE phone = $1 AND used = false AND expires_at > now() ORDER BY id DESC LIMIT 1', [phone]);
    if (!r.rowCount) E('That code has expired. Ask for a new one.');
    if (r.rows[0].attempts >= 5) E('Too many wrong codes. Ask for a new one.', 429, false);
    if (!eq(r.rows[0].code_hash, hmac(`to.${phone}.${code}`))) {
        await pool.query('UPDATE tech_otp SET attempts = attempts + 1 WHERE id = $1', [r.rows[0].id]);
        E("That code doesn't match.");
    }
    await pool.query('UPDATE tech_otp SET used = true WHERE id = $1', [r.rows[0].id]);
    const u = await pool.query(
        `SELECT u.id, u.email, u.phone, array_remove(array_agg(DISTINCT r.name), NULL) roles
           FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
          WHERE u.phone IN ($1, $2) AND u.status = 1 GROUP BY u.id HAVING bool_or(r.name = 'technician') LIMIT 1`, [phone, '91' + phone]);
    if (!u.rowCount) E('This number is not registered with Recello.', 403);
    const id = u.rows[0].id;
    await pool.query(`INSERT INTO tech_profiles (user_id, id_no) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`, [id, 'RC-PUN-' + String(id).padStart(4, '0')]);
    const T = await cfg();
    if (body.terms === true) await pool.query('UPDATE tech_profiles SET terms_ver = $2, terms_at = now() WHERE user_id = $1', [id, T.terms.version]);
    const dev = /Android/i.test(req.headers['user-agent'] || '') ? 'Android phone' : /iPhone/i.test(req.headers['user-agent'] || '') ? 'iPhone' : 'Browser';
    await pool.query('INSERT INTO tech_logins (user_id, device) VALUES ($1, $2)', [id, S.str(body.device || dev, 80)]);
    const token = signToken(u.rows[0], u.rows[0].roles);
    const tech = await techFrom({ headers: { authorization: 'Bearer ' + token } }, 'technician');
    return { ok: true, token, me: meOf(tech) };
};
A.logout = async () => ({ ok: true });

// ---- lists -------------------------------------------------------------------------
async function myJobs(tech, T) {
    const Q = await loadQuestions();
    const today = S.istDate();
    const r = await pool.query(ORDER_SQL + ` AND sp.assigned_agent_id = $1
        AND (sp.pickup_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date - 8 OR tv.t IS NULL OR COALESCE(tv.t->>'done_at', '') = '' AND COALESCE(tv.t->>'cancelled', '') = '')
        ORDER BY sp.pickup_date, sp.pickup_slot_start, o.id`, [tech.id]);
    const jobs = [];
    for (const row of r.rows) {
        if (!row.visit_t || Number(row.visit_tech) !== Number(tech.id)) {
            const c = await pool.connect();
            try { await c.query('BEGIN'); await ensureVisit(c, tech.id, row, T); await c.query('COMMIT'); } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
        }
        const fresh = row.visit_t && Number(row.visit_tech) === Number(tech.id) ? row : { ...row, visit_t: { step: 2, events: [], flags: [], codes: {} } };
        const j = await buildJob(fresh, Q);
        j.today = today;
        // a closed lead older than a week drops off the list
        if (['done', 'cancelled', 'noshow'].includes(stageOf(j.t)) && j.slot_date < S.istDate(Date.now() - 7 * 864e5)) continue;
        jobs.push(j);
    }
    return { jobs, today };
}
A.jobs = async ({ tech }) => {
    const T = await cfg();
    const { jobs, today } = await myJobs(tech, T);
    const bal = await balance(null, tech.id);
    return { ok: true, today, jobs: jobs.map((j) => card(j, today)), wallet: { word: T.points.word, balance: bal, free: !!T.points.free, lead_min: leadMin(T) }, app: T.app };
};

function detail(j, T) {
    const t = j.t, c = card(j, j.today), Q = j.questions;
    const ans = t.check ? t.check.ans : j.customer_answers;
    const lab = (q, id) => { const o = (q.options || []).find((x) => x.id === id); return o ? o.label : q.type === 'battery' ? (id === 'unsure' ? 'Not sure' : id + '%') : id; };
    return {
        ok: true, job: c,
        told: Q.map((q) => ({ q: q.title, a: (j.customer_answers[q.id] || []).map((id) => lab(q, id)) })).filter((x) => x.a.length),
        customer_answers: j.customer_answers, answers: ans, checks_picked: t.check ? t.check.checks : {},
        questions: Q.map(pubQ), checks: appChecks(T, j.cat), groups: T.groups, extras: T.extras.filter((e) => e.active !== false), rules: T.rules,
        smk: smkView(j, T),
        visit: {
            onway_at: t.onway_at || null, arrived: t.arrived ? t.arrived.at : null, started: t.started || null,
            identify: t.identify ? { at: t.identify.at, same: t.identify.same } : null, check: t.check ? { price: priceNow(j), at: t.check.at } : null,
            extras: t.extras || [], deal: t.deal || null, agreed: t.agreed || null, pay: t.pay || null, done_at: t.done_at || null, bag: t.bag || '',
            wiped: t.wiped || null, imei: t.imei || '', noshow: t.noshow || null, no: t.no || null, payout: payoutNow(j), mode: t.check ? t.check.mode : null,
            dead: !!t.dead, id_doc: t.id_doc || null, final: t.check ? priceNow(j) : null,
        },
        need_imei: true, id_kinds: T.id_kinds, photos: j.photos.map((p) => ({ ref: p.ref, kind: p.kind, at: p.at })),
        points: { word: T.points.word, now: ptsFor(T, j.quoted), special: null, earned: null, slabs: T.points.slabs, above: T.points.above },
        can_wipe_photo: true,
    };
}
A.job = async ({ tech, query }) => withVisit(tech, cleanId(query.id), (j, c, T) => detail(j, T));

// ---- the visit ---------------------------------------------------------------------
const needOpen = (j) => { if (!isOpen(j, j.today)) E('You can start this lead on its day.'); };
const km = (a, b) => {
    const R = 6371, rad = (x) => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
};

A.onway = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j) => {
    needOpen(j);
    if (stageOf(j.t) !== 'new' && stageOf(j.t) !== 'onway') E('This lead is already in progress.');
    j.t.onway_at = j.t.onway_at || now(); ev(j, 'on the way');
    return { ok: true, stage: stageOf(j.t) };
});
A.arrive = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c, T) => {
    needOpen(j);
    if (!['new', 'onway', 'arrived'].includes(stageOf(j.t))) E('This lead is already in progress.');
    j.t.onway_at = j.t.onway_at || now();
    const lat = Number(body.lat), lng = Number(body.lng), has = Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng);
    j.t.arrived = { at: now(), lat: has ? lat : null, lng: has ? lng : null };
    if (!has) flag(j, 'no_gps');
    else if (j.d.geo && j.d.geo.lat && j.d.geo.lng && km({ lat, lng }, { lat: +j.d.geo.lat, lng: +j.d.geo.lng }) > (+T.rules.max_km || 2)) flag(j, 'far_from_address', 'More than ' + T.rules.max_km + ' km from the booked address');
    ev(j, 'arrived');
    const out = await sendCode(j, 'start');
    return { ok: true, stage: stageOf(j.t), ...out };
});
A.code_send = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j) => {
    const p = String(body.purpose || '');
    if (!['start', 'deal', 'paid', 'cancel'].includes(p)) E('Unknown code.');
    const st = stageOf(j.t);
    if (p === 'start' && st !== 'arrived') E('Tap "I have arrived" first.');
    if (p === 'deal' && st !== 'checked') E('Finish the check first.');
    if (p === 'paid' && st !== 'paying') E('Record the payment first.');
    if (p === 'cancel' && !j.t.no_ask) E('Pick why the customer is saying no first.');
    const amount = p === 'deal' || p === 'paid' ? payoutNow(j) : null;
    const out = await sendCode(j, p, amount);
    if (p === 'deal') j.t.deal = { amount, at: now() };
    return { ok: true, ...out };
});
A.start = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c) => {
    if (stageOf(j.t) !== 'arrived') E('Tap "I have arrived" first.');
    checkCode(j, 'start', body.code);
    j.t.started = now(); ev(j, 'customer gave the start code');
    await setPickup(c, j, 'in_progress').catch(() => {});
    return { ok: true, stage: stageOf(j.t) };
});
A.identify = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j) => {
    const st = stageOf(j.t);
    if (!['started', 'identified', 'mismatch'].includes(st)) E('Start the check with the customer\'s code first.');
    const same = body.same !== false;
    if (same) ['front', 'back'].forEach((k) => { if (!hasPhoto(j, k)) E('Take a photo of the ' + k + ' of the device.'); });
    j.t.identify = { at: now(), same }; if (!same) flag(j, 'device_mismatch');
    return { ok: true, stage: stageOf(j.t) };
});

const answersIn = (j, b) => {
    const out = {};
    for (const q of j.questions) {
        const v = b && b[q.id];
        out[q.id] = Array.isArray(v) ? v.map(String).filter((id) => q.type === 'battery' ? (id === 'unsure' || (+id >= 1 && +id <= 100)) : (q.options || []).some((o) => o.id === id)) : (j.customer_answers[q.id] || []);
        if (q.type !== 'multi') out[q.id] = out[q.id].slice(0, 1);
    }
    return out;
};
A.quote = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c, T) => {
    const p = priceFor(j, T, answersIn(j, body.answers), body.checks || {});
    return {
        ok: true, price: p.price, complete: true, blocked: p.blocked, changes: p.lines.length,
        need: p.lines.filter((l) => l.diff < 0 && (l.kind === 'q' || l.photo)).map((l) => l.kind + ':' + l.id),
    };
});
A.check = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c, T) => {
    const st = stageOf(j.t);
    if (st !== 'identified' && st !== 'checked') E('Finish identifying the device first.');
    if (j.t.smk && j.t.smk.status === 'pending') E('Your special price request is waiting for Recello. Wait for the answer first.');
    if (j.t.smk && j.t.smk.status === 'approved') { delete j.t.smk; delete j.t.final; }
    const mode = body.mode === 'complete' ? 'complete' : 'requote';
    const ans = mode === 'complete' ? j.customer_answers : answersIn(j, body.answers);
    const p = mode === 'complete' ? priceFor(j, T, j.customer_answers, {}) : priceFor(j, T, ans, body.checks || {});
    if (p.blocked.length) {
        flag(j, 'blocked', p.blocked.join(', '));
        E(`Recello can't buy this device: ${p.blocked.join(', ')}. Tap "Customer says no" and pick "Account or lock".`, 409, true);
    }
    if (mode === 'requote' && !p.lines.length) E('Nothing is different from what the customer told us. Tap "Everything matches" instead.');
    for (const l of p.lines) {
        if (l.diff >= 0) continue;
        if (l.kind === 'q' && !hasPhoto(j, 'q:' + l.id)) E('Add a photo for "' + l.q + '".');
        if (l.kind === 'c' && l.photo && !hasPhoto(j, 'c:' + l.id)) E('Add a photo for "' + l.q + '".');
    }
    delete j.t.deal;
    j.t.check = { at: now(), mode, ans, checks: p.checks, lines: p.lines, price: p.price, was: p.was };
    j.t.final = p.price === j.quoted ? null : p.price;
    const drop = j.quoted ? (j.quoted - p.price) / j.quoted * 100 : 0;
    if (drop >= (+T.rules.flag_drop_pct || 15)) flag(j, 'big_drop', Math.round(drop) + '% below the booked price');
    j.t.checks_n = (j.t.checks_n || 0) + 1;
    if (j.t.checks_n > (+T.rules.flag_changes || 3)) flag(j, 'many_changes', j.t.checks_n + ' price changes');
    ev(j, mode === 'complete' ? 'inspection complete' : 'requote', rs(p.was) + ' → ' + rs(p.price));
    return { ok: true, stage: stageOf(j.t), price: p.price };
});
A.smk_ask = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c, T) => {
    const t = j.t, S0 = T.special;
    if (S0.on === false) E('Special price is switched off.', 410);
    if (stageOf(t) !== 'checked') E('Finish the check first.');
    if (t.smk && t.smk.status === 'pending') E('Your request is waiting for Recello. Wait for the answer.');
    if ((t.smk_asks || 0) >= S0.asks) E('No more special price requests for this lead. Call Recello.');
    const from = priceNow(j), ask = r10(Number(String(body.price || '').replace(/[^\d]/g, '')) || 0);
    if (ask < 100) E('Type the special price.');
    if (ask === from) E(`That is the price now (${rs(from)}). Type a different price.`);
    const base = t.smk && t.smk.status === 'approved' ? t.smk.from : from;
    if (ask > from && ask > Math.floor(base * (1 + (+S0.max_up_pct || 20) / 100))) E('That is more than Recello can pay for this device. Try a lower price.');
    t.smk_asks = (t.smk_asks || 0) + 1;
    t.smk = { at: now(), from, ask, reason: S.str(body.reason, 30), note: S.str(body.note, 300), status: 'pending' };
    ev(j, 'special price asked', rs(from) + ' → ' + rs(ask));
    if (ask < from) smkApprove(j, ask, 'partner');
    else if (ask <= Math.min(Math.floor(base * (1 + (+S0.auto_up_pct || 5) / 100)), base + (+S0.auto_up_max || 1000))) smkApprove(j, ask, 'auto');
    return { ok: true, smk: smkView(j, T), price: priceNow(j), payout: payoutNow(j) };
});
A.smk_cancel = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c, T) => {
    if (!j.t.smk || j.t.smk.status !== 'pending') E('There is no request waiting.');
    j.t.smk.status = 'withdrawn'; j.t.smk.decided_at = now();
    return { ok: true, smk: smkView(j, T) };
});
A.special = async () => E('Use "Request a Special Price".', 410);
A.extras = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c, T) => {
    if (stageOf(j.t) !== 'checked') E('Extras can be added after the check and before the customer agrees.');
    const want = [].concat(body.extras || []).map(String);
    j.t.extras = T.extras.filter((e) => e.active !== false && want.includes(e.id)).map((e) => ({ id: e.id, label: e.label, price: e.price }));
    delete j.t.deal;
    return { ok: true, payout: payoutNow(j) };
});
A.agree = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c) => {
    if (stageOf(j.t) !== 'checked') E('Finish the check first.');
    const amount = payoutNow(j);
    if (!(j.t.deal && j.t.deal.amount === amount)) E('Send the price code to the customer first.');
    checkCode(j, 'deal', body.code, amount);
    j.t.agreed = { at: now(), amount }; j.t.step = 3; ev(j, 'customer agreed', rs(amount));
    await setStatus(c, j, 'inspection_complete');
    return { ok: true, stage: stageOf(j.t), payout: amount };
});
A.pay = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c, T) => {
    const st = stageOf(j.t);
    if (st !== 'agreed' && st !== 'paying') E('The customer has to agree to the price first.');
    const method = body.method === 'upi' ? 'upi' : body.method === 'cash' ? 'cash' : null;
    if (!method) E('Pick how you paid: cash or UPI.');
    const ref = String(body.ref || '').replace(/\s/g, '').toUpperCase();
    if (method === 'upi' && !/^[A-Z0-9]{8,30}$/.test(ref)) E('Enter the UPI reference (UTR) from the payment screen.');
    const amount = payoutNow(j);
    if (method === 'cash' && +T.rules.cash_max > 0 && amount > +T.rules.cash_max) E(`Cash above ${rs(T.rules.cash_max)} is not allowed. Pay by UPI.`);
    j.t.pay = { method, ref: method === 'upi' ? ref : '', at: now(), amount };
    const out = await sendCode(j, 'paid', amount);
    return { ok: true, stage: stageOf(j.t), ...out };
});
A.paid = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c) => {
    if (stageOf(j.t) !== 'paying') E('Record the payment first.');
    const amount = payoutNow(j);
    checkCode(j, 'paid', body.code, amount);
    j.t.paid_at = now(); j.t.step = 4; ev(j, 'customer confirmed the money', rs(amount));
    await setStatus(c, j, 'completed', { set: 'completed_by = $3', args: [tech_id(j)] });
    await setPickup(c, j, 'completed').catch(() => {});
    return { ok: true, stage: stageOf(j.t), bill: true };
});
const tech_id = (j) => j.tech.id;
A.finish = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c, T) => {
    if (stageOf(j.t) !== 'paid') E('This step comes after the customer confirms the money.');
    const dead = body.dead === true, kind = dead ? 'aadhaar' : String(body.id_kind || '');
    if (!T.id_kinds.some((k) => k.id === kind)) E("Pick the customer's ID: Aadhaar, PAN card or driving licence.");
    if (!hasPhoto(j, 'id-front')) E(dead ? "The phone is dead, so a photo of the customer's Aadhaar card is needed." : "Take a photo of the customer's ID.");
    const im = String(body.imei || '').replace(/\D/g, '');
    if (!dead && !(/^\d{15}$/.test(im) && luhn(im))) E('Enter the 15-digit IMEI. Dial *#06# on the phone to see it, or tick "Phone is dead".');
    if (!dead && !body.wiped) E("Tick that the customer's accounts are removed and the phone is reset.");
    const bag = String(body.bag || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (T.rules.bag && !/^[A-Z0-9-]{4,24}$/.test(bag)) E('Type the bag number.');
    if (im) j.t.imei = im;
    if (dead) { j.t.dead = now(); flag(j, 'phone_dead'); } else j.t.wiped = now();
    j.t.id_doc = { kind, at: now() }; j.t.bag = bag; j.t.done_at = now(); ev(j, 'finished');
    return { ok: true, stage: stageOf(j.t) };
});

// ---- the customer says no / is not home ---------------------------------------------
A.cancel_ask = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c, T) => {
    if (!T.cancel_reasons[body.reason]) E('Pick why the customer is saying no.');
    if (!j.t.arrived) E('Tap "I have arrived" first.');
    if (['paid', 'done', 'cancelled'].includes(stageOf(j.t))) E('This lead is already closed.');
    j.t.no_ask = { reason: body.reason, note: S.str(body.note, 300), at: now() };
    const out = await sendCode(j, 'cancel');
    return { ok: true, ...out };
});
A.cancel = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c, T) => {
    if (!j.t.no_ask) E('Pick a reason first.');
    checkCode(j, 'cancel', body.code);
    j.t.cancelled = true; j.t.no = j.t.no_ask; delete j.t.no_ask;
    if (j.t.check) flag(j, 'no_after_check');
    if (!j.t.started && !T.points.free) {
        await c.query(`INSERT INTO tech_wallet (tech_id, order_code, kind, pts, model) VALUES ($1, $2, 'refund', $3, $4) ON CONFLICT DO NOTHING`,
            [j.tech.id, j.id, ptsFor(T, j.quoted), j.model]);
    }
    await setStatus(c, j, 'cancelled');
    await setPickup(c, j, 'cancelled').catch(() => {});
    await c.query('INSERT INTO listing_cancellations (listing_id, cancelled_by, reason, final_offered_price, customer_expected_price) VALUES ($1, $2, $3, $4, $5)',
        [j.row.listing_id, j.tech.id, T.cancel_reasons[j.t.no.reason] + (j.t.no.note ? ': ' + j.t.no.note : ''), priceNow(j), j.quoted]).catch(() => {});
    ev(j, 'customer said no', T.cancel_reasons[j.t.no.reason]);
    return { ok: true, stage: stageOf(j.t) };
});
A.noshow = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c, T) => {
    if (!j.t.arrived) E('Tap "I have arrived" first, then call the customer.');
    if (j.t.started) E('The customer is here. Use "Customer says no" if they do not want to sell.');
    if (now() - j.t.arrived.at < 600) E('Wait 10 minutes and call the customer twice before you leave.');
    j.t.noshow = { at: now(), note: S.str(body.note, 300) }; flag(j, 'not_home');
    ev(j, 'customer not at home');
    return { ok: true, stage: stageOf(j.t) };
});

// ---- photos ------------------------------------------------------------------------
A.photo = async ({ tech, body, file }) => {
    const id = cleanId(body.id), kind = String(body.kind || '');
    if (!/^[a-z0-9:_-]{1,40}$/i.test(kind)) E('Unknown photo.');
    if (!file) E('No photo was received.');
    const type = sniff(file.buffer);
    if (!type || type.ext === 'pdf') E('Send a photo (JPG, PNG or WebP).');
    return withVisit(tech, id, async (j, c) => {
        if (!j.t.started) E('Get the start code from the customer first.');
        if (['done', 'cancelled'].includes(stageOf(j.t))) E('This lead is closed.');
        const ref = 'p' + crypto.randomBytes(8).toString('hex');
        const rel = saveFile('photos', file.buffer, type.ext);
        await c.query('INSERT INTO tech_photos (ref, code, tech_id, kind, file, mime) VALUES ($1, $2, $3, $4, $5, $6)', [ref, id, tech.id, kind, rel, type.mime]);
        return { ok: true, ref, kind };
    });
};
A.photo_delete = async ({ tech, body }) => withVisit(tech, cleanId(body.id), async (j, c) => {
    const p = j.photos.find((x) => x.ref === body.ref);
    if (!p) return { ok: true };
    if (j.t.done_at || j.t.cancelled || (j.t.check && /^[qc]:/.test(p.kind))) E('This photo can not be removed now.');
    await c.query('DELETE FROM tech_photos WHERE ref = $1', [p.ref]);
    return { ok: true };
});
A.photo_get = async ({ tech, query, res }) => {
    const r = await pool.query(
        `SELECT p.file, p.mime FROM tech_photos p WHERE p.ref = $1 AND p.code = $2 AND p.tech_id = $3`, [String(query.ref || ''), cleanId(query.id), tech.id]);
    if (!r.rowCount) E('Photo not found.', 404);
    return { __file: filePath(r.rows[0].file), mime: r.rows[0].mime };
};

// ---- me, wallet, profile ------------------------------------------------------------
async function profileOf(tech, T, jobs) {
    const docsR = await pool.query('SELECT id, kind, ext, bytes, status, note, extract(epoch FROM at)::bigint at FROM tech_docs WHERE tech_id = $1 ORDER BY at DESC, id', [tech.id]);
    const latest = {}; let photo = null;
    docsR.rows.forEach((d) => { if (d.kind === 'photo') { if (!photo && d.status !== 'rejected') photo = d; } else if (!latest[d.kind]) latest[d.kind] = d; });
    const docOut = (d) => ({ id: d.id, kind: d.kind, label: T.doc_kinds[d.kind] || d.kind, ext: d.ext, bytes: Number(d.bytes), at: Number(d.at), status: d.status, note: d.note });
    const lg = await pool.query('SELECT extract(epoch FROM at)::bigint at, device FROM tech_logins WHERE user_id = $1 ORDER BY at DESC LIMIT 2', [tech.id]);
    const done = jobs.filter((j) => (j.t.step || 2) >= 4).length;
    const visits = jobs.filter((j) => j.t.started).length;
    const closePct = visits ? Math.round(done / visits * 100) : 0;
    const arrived = jobs.filter((j) => j.t.arrived);
    const onTime = arrived.length ? Math.round(arrived.filter((j) => !(j.t.flags || []).some((f) => f.k === 'late')).length / arrived.length * 100) : 100;
    const bad = jobs.reduce((n, j) => n + (j.t.flags || []).filter((f) => !['smk_price', 'phone_dead', 'special_used'].includes(f.k)).length, 0);
    const clean = Math.max(0, 100 - bad * 5);
    const score = visits ? Math.round((closePct + onTime + clean) / 3) : 0;
    const rk = await pool.query(`SELECT count(*)::int n FROM (SELECT tech_id, count(*) c FROM tech_visits WHERE (t->>'done_at') IS NOT NULL AND updated_at > now() - interval '30 days' GROUP BY tech_id) x WHERE c > $1`, [done]);
    const levels = T.levels, tierIx = Math.max(0, Math.min(levels.length - 1, done >= 40 ? 3 : done >= 15 && score >= 75 ? 2 : done >= 5 ? 1 : 0));
    const nxt = levels[tierIx + 1];
    return {
        id_no: tech.id_no || 'RC-PUN-' + String(tech.id).padStart(4, '0'), joined: Math.floor(new Date(tech.joined || Date.now()).getTime() / 1000),
        photo: photo ? { id: photo.id, status: photo.status, at: Number(photo.at) } : null,
        docs: Object.keys(latest).map((k) => docOut(latest[k])),
        doc_kinds: Object.keys(T.doc_kinds).filter((k) => k !== 'other').map((k) => ({ id: k, label: T.doc_kinds[k] })),
        last_login: lg.rows[0] ? { at: Number(lg.rows[0].at), device: lg.rows[0].device } : null, prev_login: lg.rows[1] ? { at: Number(lg.rows[1].at), device: lg.rows[1].device } : null,
        last_seen: now(),
        perf: {
            score, parts: { close: closePct, on_time: onTime, clean }, visits, done, rank: rk.rows[0].n + 1,
            tier: { id: String(levels[tierIx].label).toLowerCase(), label: levels[tierIx].label }, daily: levels[tierIx].daily,
            next: nxt ? { label: nxt.label, daily: nxt.daily, need_score: 75, need_done: Math.max(0, (tierIx + 1 === 2 ? 15 : tierIx + 1 === 3 ? 40 : 5) - done) } : null,
            levels,
        },
        terms: { version: T.terms.version, title: T.terms.title, text: T.terms.text, accepted: tech.terms_ver === T.terms.version, accepted_at: tech.terms_at ? Math.floor(new Date(tech.terms_at).getTime() / 1000) : null },
    };
}
A.me = async ({ tech }) => {
    const T = await cfg();
    await pool.query('UPDATE tech_profiles SET last_seen = now() WHERE user_id = $1', [tech.id]).catch(() => {});
    const { jobs, today } = await myJobs(tech, T);
    const month = today.slice(0, 7);
    const inMonth = (sec) => sec && S.istDate(sec * 1000).slice(0, 7) === month;
    const stats = {
        today: jobs.filter((j) => j.slot_date === today && !j.t.cancelled).length,
        done_today: jobs.filter((j) => j.t.paid_at && S.istDate(j.t.paid_at * 1000) === today).length,
        done_month: jobs.filter((j) => inMonth(j.t.paid_at)).length,
        said_no_month: jobs.filter((j) => j.t.cancelled && j.t.no && inMonth(j.t.no.at)).length,
        flags_month: jobs.reduce((n, j) => n + (j.t.flags || []).filter((f) => !['special_used', 'smk_price', 'phone_dead'].includes(f.k) && inMonth(f.at)).length, 0),
    };
    return { ok: true, me: meOf(tech), stats, support: T.support, wallet: await walletInfo(null, tech.id, T), profile: await profileOf(tech, T, jobs), app: T.app };
};
A.wallet = async ({ tech }) => {
    const T = await cfg();
    return { ok: true, wallet: await walletInfo(null, tech.id, T), support: T.support };
};
A.terms_accept = async ({ tech, body }) => {
    const T = await cfg();
    if (Number(body.version) !== T.terms.version) E('The terms changed while you were reading. Read the new version and agree again.', 409);
    await pool.query('UPDATE tech_profiles SET terms_ver = $2, terms_at = now() WHERE user_id = $1', [tech.id, T.terms.version]);
    return { ok: true, terms: { version: T.terms.version, at: now() } };
};
A.doc_upload = async ({ tech, body, file }) => {
    const T = await cfg();
    const kind = String(body.kind || '');
    if (!T.doc_kinds[kind] || kind === 'other') E('Pick what kind of document this is.');
    if (!file) E('No file was received.');
    if (file.size > 6 * 1024 * 1024) E('Files must be 6 MB or smaller.');
    const type = sniff(file.buffer);
    if (!type) E('Send a photo (JPG, PNG, WebP) or a PDF.');
    if (kind === 'photo' && type.ext === 'pdf') E('The profile photo must be a picture, not a PDF.');
    const id = 'd' + crypto.randomBytes(8).toString('hex');
    const rel = saveFile('docs', file.buffer, type.ext);
    const r = await pool.query(
        `INSERT INTO tech_docs (id, tech_id, kind, ext, bytes, file, mime) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING extract(epoch FROM at)::bigint at`,
        [id, tech.id, kind, type.ext === 'pdf' ? 'pdf' : 'jpg', file.size, rel, type.mime]);
    return { ok: true, doc: { id, kind, label: T.doc_kinds[kind], ext: type.ext === 'pdf' ? 'pdf' : 'jpg', bytes: file.size, at: Number(r.rows[0].at), status: 'pending', note: '' } };
};
A.doc_get = async ({ tech, query }) => {
    const r = await pool.query('SELECT file, mime FROM tech_docs WHERE id = $1 AND tech_id = $2', [String(query.ref || ''), tech.id]);
    if (!r.rowCount) E('Document not found.', 404);
    return { __file: filePath(r.rows[0].file), mime: r.rows[0].mime };
};

// ====================================================================================
// Recello side (role "admin"): the small set of things the technician app waits on
// ====================================================================================
const ADMIN = {};
async function techByPhone(phone) {
    const p = S.cleanPhone(phone);
    const r = await pool.query(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id AND r.name = 'technician' WHERE u.phone IN ($1, $2) LIMIT 1`, [p, '91' + p]);
    if (!r.rowCount) E('No technician with this number.', 404);
    return r.rows[0].id;
}
ADMIN.admin_tech_create = async ({ body }) => {
    const phone = S.cleanPhone(body.phone), name = S.str(body.name, 60) || 'Partner';
    if (!S.okPhone(phone)) E('Enter a 10-digit mobile number.');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let u = await client.query('SELECT id FROM users WHERE phone IN ($1, $2)', [phone, '91' + phone]);
        let id;
        if (u.rowCount) id = u.rows[0].id;
        else {
            const pw = await bcrypt.hash(crypto.randomBytes(18).toString('hex'), 10);
            id = (await client.query('INSERT INTO users (phone, password, is_verified) VALUES ($1, $2, true) RETURNING id', [phone, pw])).rows[0].id;
            await client.query('INSERT INTO user_profile (user_id, first_name, last_name) VALUES ($1, $2, $3)', [id, name.split(' ')[0], name.split(' ').slice(1).join(' ')]);
        }
        await client.query("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'technician' ON CONFLICT DO NOTHING", [id]);
        await client.query(`INSERT INTO tech_profiles (user_id, city, id_no, verified) VALUES ($1, $2, $3, true) ON CONFLICT (user_id) DO UPDATE SET active = true`,
            [id, S.str(body.city, 40) || 'Pune', 'RC-PUN-' + String(id).padStart(4, '0')]);
        await client.query('COMMIT');
        return { ok: true, id: Number(id) };
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
};
ADMIN.admin_assign = async ({ body }) => {
    const code = cleanId(body.id), tid = body.tech_id ? Number(body.tech_id) : await techByPhone(body.phone);
    const T = await cfg();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const r = await client.query(ORDER_SQL + ' AND o.code = $1 FOR UPDATE OF o', [code]);
        if (!r.rowCount) E('No such order.', 404);
        const row = r.rows[0];
        if (row.visit_t && row.visit_tech && Number(row.visit_tech) !== tid && row.visit_t.started) E('The visit has already started with another technician.', 409);
        await client.query('UPDATE sell_pickups SET assigned_agent_id = $2, updated_at = now() WHERE id = $1', [row.pickup_id, tid]);
        const st = await client.query("SELECT id FROM enum_master WHERE master_name = 'listing_status' AND option_name = 'assigned'");
        if (st.rowCount) await client.query('UPDATE sell_listings SET status = $2, updated_at = now() WHERE id = $1', [row.listing_id, st.rows[0].id]);
        row.assigned_agent_id = tid;
        await ensureVisit(client, tid, row, T);
        await client.query('COMMIT');
        return { ok: true, id: code, tech_id: tid };
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
};
ADMIN.admin_topup = async ({ body }) => {
    const tid = body.tech_id ? Number(body.tech_id) : await techByPhone(body.phone), pts = Math.round(Number(body.pts));
    if (!pts || Math.abs(pts) > 1000000) E('Enter the Points to add.');
    await pool.query('INSERT INTO tech_wallet (tech_id, kind, pts, note) VALUES ($1, $2, $3, $4)', [tid, pts > 0 ? 'topup' : 'fix', pts, S.str(body.note, 80)]);
    return { ok: true, balance: await balance(null, tid) };
};
ADMIN.admin_smk = async ({ body }) => {
    const code = cleanId(body.id);
    const r = await pool.query('SELECT tech_id FROM tech_visits WHERE code = $1', [code]);
    if (!r.rowCount) E('No such lead.', 404);
    const tech = { id: r.rows[0].tech_id };
    return withVisit(tech, code, async (j) => {
        const s = j.t.smk;
        if (!s || s.status !== 'pending') E('There is no request waiting.', 409);
        if (body.decision === 'approve') {
            const to = r10(Number(body.price) || s.ask);
            smkApprove(j, to, 'Recello', S.str(body.reply, 200));
        } else { s.status = 'rejected'; s.decided_at = now(); s.by = 'Recello'; s.reply = S.str(body.reply, 200) || 'Recello cannot do this price.'; }
        return { ok: true, status: j.t.smk.status, price: priceNow(j) };
    });
};
ADMIN.admin_doc = async ({ body }) => {
    if (!['verified', 'rejected', 'pending'].includes(body.status)) E('Pick verified or rejected.');
    const r = await pool.query('UPDATE tech_docs SET status = $2, note = $3 WHERE id = $1 RETURNING id', [String(body.ref || ''), body.status, S.str(body.note, 200)]);
    if (!r.rowCount) E('Document not found.', 404);
    return { ok: true };
};
ADMIN.admin_techs = async () => {
    const r = await pool.query(`SELECT u.id, u.phone, COALESCE(NULLIF(trim(concat_ws(' ', up.first_name, up.last_name)), ''), '') name, tp.active, COALESCE((SELECT sum(pts) FROM tech_wallet w WHERE w.tech_id = u.id), 0)::int points
        FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id AND r.name = 'technician' LEFT JOIN user_profile up ON up.user_id = u.id LEFT JOIN tech_profiles tp ON tp.user_id = u.id ORDER BY u.id`);
    return { ok: true, techs: r.rows };
};

// ====================================================================================
// entry point
// ====================================================================================
const PUBLIC = new Set(['otp_send', 'otp_verify']);
const GET_OK = new Set(['me', 'jobs', 'job', 'wallet', 'doc_get', 'photo_get', 'admin_techs']);
const MULTIPART = new Set(['photo', 'doc_upload']);

exports.handle = async (req) => {
    await ensureSchema();
    const T = await cfg();
    await_floor.v = (await S.setting('pricing')).floor;
    const action = String(req.query.action || '').toLowerCase();
    const isAdmin = Object.prototype.hasOwnProperty.call(ADMIN, action);
    const fn = isAdmin ? ADMIN[action] : Object.prototype.hasOwnProperty.call(A, action) ? A[action] : null;
    if (!fn) throw fail(404, 'Unknown request.');
    const isGet = req.method === 'GET';
    if (isGet !== GET_OK.has(action)) throw fail(405, 'Unknown request.');
    if (T.app.maintenance && !isAdmin && action !== 'otp_send' && action !== 'otp_verify') throw fail(503, T.app.maintenance_msg || 'Recello is being updated. Try again soon.');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const ctx = { req, body, query: req.query || {}, file: req.file };
    if (!PUBLIC.has(action)) ctx.tech = await techFrom(req, isAdmin ? 'admin' : 'technician');
    return fn(ctx);
};
exports.__test = { priceFor, cutOf, ptsFor, stageOf };
exports.ensureSchema = ensureSchema;
