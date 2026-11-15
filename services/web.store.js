/*
 * Shared helpers for the website / app API (services/web.service.js):
 * tables, settings, rate limits, signed tokens, the robot check, small formatters.
 * Nothing here touches your existing tables.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../config/database');

const DEFAULTS = require('../config/web-defaults.json');

// ---------- tables ----------
let schemaReady = null;
function ensureSchema() {
    if (!schemaReady) {
        const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'migration_web.sql'), 'utf8');
        schemaReady = pool.query(sql).catch((e) => { schemaReady = null; throw e; });
    }
    return schemaReady;
}

// ---------- secrets, tokens ----------
const secret = () => {
    const s = process.env.WEB_SECRET || process.env.TRACK_SECRET || process.env.JWT_ACCESS_SECRET;
    if (!s || s.length < 16) throw { status: 500, message: 'Server is not set up: set WEB_SECRET (16+ random characters) in .env.' };
    return s;
};
const hmac = (s, n) => crypto.createHmac('sha256', secret()).update(s).digest('hex').slice(0, n || 64);
const b64u = (b) => Buffer.from(b).toString('base64url');

/** Sign-in token the page keeps after the OTP: { p: phone, u: user id, e: expiry (epoch seconds) } */
function signToken(payload) {
    const body = b64u(JSON.stringify(payload));
    return body + '.' + hmac('t.' + body);
}
function readToken(tok) {
    const bad = () => { throw { status: 401, message: 'Please verify your mobile number again.' }; };
    if (typeof tok !== 'string' || tok.length > 600) bad();
    const [body, sig] = tok.split('.');
    if (!body || !sig) bad();
    const want = hmac('t.' + body);
    const a = Buffer.from(sig), b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) bad();
    let p;
    try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (_) { bad(); }
    if (!p || !/^[6-9]\d{9}$/.test(p.p || '') || !(p.e > Date.now() / 1000)) bad();
    return p;
}

// ---------- settings (defaults file + optional web_settings rows) ----------
let settingsCache = { at: 0, rows: {} };
async function allSettings() {
    if (Date.now() - settingsCache.at < 30000) return settingsCache.rows;
    const rows = {};
    try {
        const r = await pool.query('SELECT key, value FROM web_settings');
        r.rows.forEach((x) => { rows[x.key] = x.value; });
    } catch (_) { /* table not created yet: defaults only */ }
    settingsCache = { at: Date.now(), rows };
    return rows;
}
const merge = (a, b) => {
    if (b == null) return a;
    if (Array.isArray(a) || Array.isArray(b) || typeof a !== 'object' || typeof b !== 'object' || a === null) return b;
    const o = { ...a };
    Object.keys(b).forEach((k) => { o[k] = merge(a[k], b[k]); });
    return o;
};
async function setting(key) {
    const rows = await allSettings();
    return merge(DEFAULTS[key] === undefined ? {} : JSON.parse(JSON.stringify(DEFAULTS[key])), rows[key]);
}

// ---------- who is calling ----------
const isPrivate = (ip) => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::ffff:127\.|::ffff:10\.|::ffff:192\.168\.|fc|fd)/i.test(ip || '');
/** Behind nginx the address nginx saw is the LAST entry of X-Forwarded-For (the first can be made up by the visitor). */
function clientIp(req) {
    const direct = (req.socket && req.socket.remoteAddress) || req.ip || '';
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length && isPrivate(direct)) return xff[xff.length - 1];
    return direct;
}

// ---------- rate limits (counted in web_hits, so several servers share them) ----------
const waitWords = (s) => (s < 60 ? s + ' seconds' : s < 3600 ? Math.ceil(s / 60) + (Math.ceil(s / 60) === 1 ? ' minute' : ' minutes') : Math.ceil(s / 3600) + (Math.ceil(s / 3600) === 1 ? ' hour' : ' hours'));
async function hit(key, limit, windowSec, what) {
    const r = await pool.query(
        `SELECT count(*)::int c,
                GREATEST(1, COALESCE(EXTRACT(EPOCH FROM (min(at) + make_interval(secs => $2) - now())), 1))::int wait
           FROM web_hits WHERE k = $1 AND at > now() - make_interval(secs => $2)`,
        [key, windowSec],
    );
    if (r.rows[0].c >= limit) {
        const wait = r.rows[0].wait;
        throw { status: 429, retry: wait, message: (what || 'Too many tries.') };
    }
    await pool.query('INSERT INTO web_hits (k) VALUES ($1)', [key]);
    if (Math.random() < 0.01) pool.query("DELETE FROM web_hits WHERE at < now() - interval '2 days'").catch(() => {});
}

// ---------- robot check (proof of work, same as the page's powSolve) ----------
const POW_BITS = () => Math.max(8, Math.min(22, parseInt(process.env.WEB_BOT_CHECK_BITS, 10) || 16));
const powOn = () => process.env.WEB_BOT_CHECK !== '0';
function powChallenge() {
    const salt = crypto.randomBytes(8).toString('hex');
    const exp = Math.floor(Date.now() / 1000) + 600;
    const bits = POW_BITS();
    return { salt, exp, bits, sig: hmac(`pow.${salt}.${exp}.${bits}`, 32) };
}
async function powCheck(ticket) {
    if (!powOn()) return;
    const need = () => { throw { status: 400, need: 'pow', message: 'Please try again.' }; };
    if (typeof ticket !== 'string' || ticket.length > 200) need();
    const [salt, exp, bits, sig, n] = ticket.split('.');
    if (!salt || !exp || !bits || !sig || !/^\d{1,12}$/.test(n || '')) need();
    if (!(+exp > Date.now() / 1000) || +bits < POW_BITS()) need();
    const want = hmac(`pow.${salt}.${exp}.${bits}`, 32);
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) need();
    const h = crypto.createHash('sha256').update(salt + n).digest().readUInt32BE(0);
    if ((h >>> (32 - +bits)) !== 0) need();
    // each ticket works once
    const used = await pool.query('SELECT 1 FROM web_hits WHERE k = $1 LIMIT 1', ['pow:' + salt]);
    if (used.rowCount) need();
    await pool.query('INSERT INTO web_hits (k) VALUES ($1)', ['pow:' + salt]);
}

// ---------- formatters ----------
const IST = 19800e3;
const istDate = (ms) => { const d = new Date((ms == null ? Date.now() : ms) + IST); return d.toISOString().slice(0, 10); };
const cleanPhone = (v) => String(v || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
const okPhone = (p) => /^[6-9]\d{9}$/.test(p);
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max || 200);
const epoch = (d) => Math.floor(new Date(d).getTime() / 1000);

/** "9–11 AM", "11 AM–1 PM", "1–3 PM"  ->  { start: "09:00", end: "11:00" } */
function parseSlot(label) {
    const m = String(label || '').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (!m) return null;
    const to24 = (h, mer) => { h = +h % 12; return mer.toUpperCase() === 'PM' ? h + 12 : h; };
    const endMer = m[6].toUpperCase();
    let startMer = (m[3] || endMer).toUpperCase();
    if (!m[3] && endMer === 'PM' && (+m[1] % 12) > (+m[4] % 12)) startMer = 'AM';
    const z = (n) => String(n).padStart(2, '0');
    return { start: `${z(to24(m[1], startMer))}:${z(m[2] || 0)}`, end: `${z(to24(m[4], endMer))}:${z(m[5] || 0)}` };
}

const orderCode = (n) => 'SMK' + String(n).padStart(3, '0');

module.exports = {
    DEFAULTS, ensureSchema, signToken, readToken, setting, allSettings, clientIp, hit, waitWords,
    powChallenge, powCheck, powOn, istDate, cleanPhone, okPhone, str, epoch, parseSlot, orderCode, hmac,
};
