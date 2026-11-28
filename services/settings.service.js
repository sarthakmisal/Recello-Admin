/*
 * Settings saved from the admin panel (table app_settings, one JSON value per key):
 *   business  support email / phone / hours, cities live + coming soon, default city, pickup pincodes
 *   rapid     ⚡ rapid pickup: on, minutes, from hour, until hour
 *   growth    refer-a-friend, video check, buying-new, book-today bonus, sell-again months
 *   bills     business name, GSTIN, address, bill number prefix, signed by, terms
 * GET  /api/system/settings          all of them (panel)
 * PUT  /api/system/settings/:key     save one (main admin)
 * GET  /api/system/site_config       public: what the website and the app read (config/site-defaults.json + saved values)
 * GET  /api/system/backup            main admin: the database as one JSON file (gzip)
 * GET  /api/system/connection        main admin: OTP SMS, email, server time
 */
const zlib = require('zlib');
const pool = require('../config/database');
const store = require('./staff.store');
const DEFAULTS = require('../config/site-defaults.json');

const fail = (status, message) => ({ status, message });
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const num = (v, min, max, d) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x))) : d;
};
const list = (v, n = 60) =>
    [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map((x) => str(x, n)).filter(Boolean))];

const B = DEFAULTS.business || {};
const G = DEFAULTS.growth || {};
const BASE = {
    business: {
        supportEmail: B.supportEmail || '',
        supportPhone: '',
        hours: B.hours || '',
        cities: B.cities || ['Pune'],
        defaultCity: B.defaultCity || (B.cities || ['Pune'])[0],
        soon: B.soon || [],
        pins: B.pins || [],
        states: B.states || {},
    },
    rapid: { on: !!(B.rapid || {}).on, minutes: (B.rapid || {}).minutes || 90, from: (B.rapid || {}).from ?? 10, to: (B.rapid || {}).to ?? 18 },
    growth: {
        ref_on: !!G.ref_on, ref_friend: G.ref_friend || 0, ref_referrer: G.ref_referrer || 0,
        video_on: !!G.video_on, video_min: G.video_min || 0,
        upgrade_on: !!G.upgrade_on,
        today_on: !!G.today_on, today_amount: G.today_amount || 0, today_min: G.today_min || 0,
        sell_again_months: G.sell_again_months || 12,
    },
    bills: { name: 'Recello Solutions', gstin: '', address: '', prefix: 'RCL', signer: '', terms: [] },
};

// what each key accepts
const CLEAN = {
    business: (v, cur) => {
        const cities = list(v.cities ?? cur.cities);
        const soon = list(v.soon ?? cur.soon).filter((c) => !cities.includes(c));
        if (!cities.length) throw fail(400, 'Keep at least one live city: customers can only book there.');
        const pins = list(v.pins ?? cur.pins, 6).filter((p) => /^\d{3,6}$/.test(p));
        const defaultCity = cities.includes(v.defaultCity) ? v.defaultCity : cities.includes(cur.defaultCity) ? cur.defaultCity : cities[0];
        const email = str(v.supportEmail ?? cur.supportEmail, 120);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Support email doesn’t look right.');
        return {
            supportEmail: email,
            supportPhone: str(v.supportPhone ?? cur.supportPhone, 20),
            hours: str(v.hours ?? cur.hours, 80),
            cities, soon, pins, defaultCity,
            states: { ...(cur.states || {}), ...(v.states && typeof v.states === 'object' ? v.states : {}) },
        };
    },
    rapid: (v, cur) => {
        const from = num(v.from ?? cur.from, 0, 23, 10);
        const to = num(v.to ?? cur.to, 1, 24, 18);
        if (to <= from) throw fail(400, '"Until" must be after "From".');
        return { on: v.on === undefined ? cur.on : !!v.on, minutes: num(v.minutes ?? cur.minutes, 15, 480, 90), from, to };
    },
    growth: (v, cur) => ({
        ref_on: !!(v.ref_on ?? cur.ref_on), ref_friend: num(v.ref_friend ?? cur.ref_friend, 0, 100000, 0), ref_referrer: num(v.ref_referrer ?? cur.ref_referrer, 0, 100000, 0),
        video_on: !!(v.video_on ?? cur.video_on), video_min: num(v.video_min ?? cur.video_min, 0, 10000000, 0),
        upgrade_on: !!(v.upgrade_on ?? cur.upgrade_on),
        today_on: !!(v.today_on ?? cur.today_on), today_amount: num(v.today_amount ?? cur.today_amount, 0, 100000, 0), today_min: num(v.today_min ?? cur.today_min, 0, 10000000, 0),
        sell_again_months: num(v.sell_again_months ?? cur.sell_again_months, 1, 60, 12),
    }),
    bills: (v, cur) => {
        const gstin = str(v.gstin ?? cur.gstin, 15).toUpperCase();
        if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) throw fail(400, 'GSTIN should be 15 characters, like 27ABCDE1234F1Z5.');
        const prefix = str(v.prefix ?? cur.prefix, 10).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'RCL';
        return {
            name: str(v.name ?? cur.name, 120), gstin, address: str(v.address ?? cur.address, 400), prefix,
            signer: str(v.signer ?? cur.signer, 80),
            terms: list(Array.isArray(v.terms) ? v.terms : String(v.terms ?? (cur.terms || []).join('\n')).split('\n'), 300).slice(0, 12),
        };
    },
};

exports.all = async () => {
    await store.ensure();
    const r = await pool.query('SELECT key, value, updated_at FROM app_settings WHERE key = ANY($1)', [Object.keys(BASE)]);
    const out = {};
    for (const k of Object.keys(BASE)) {
        const row = r.rows.find((x) => x.key === k);
        out[k] = { ...BASE[k], ...(row ? row.value : {}) };
    }
    return out;
};

exports.save = async (key, value, userId) => {
    if (!CLEAN[key]) throw fail(404, 'No such setting.');
    const cur = (await exports.all())[key];
    const clean = CLEAN[key](value && typeof value === 'object' ? value : {}, cur);
    await store.setSetting(key, clean, userId);
    return clean;
};

/** What the website / app read: the shipped defaults with the saved settings laid over them. */
exports.siteConfig = async () => {
    const s = await exports.all();
    const d = JSON.parse(JSON.stringify(DEFAULTS));
    delete d._note;
    d.business = {
        ...(d.business || {}),
        cities: s.business.cities, defaultCity: s.business.defaultCity, soon: s.business.soon, pins: s.business.pins,
        supportEmail: s.business.supportEmail, supportPhone: s.business.supportPhone, hours: s.business.hours,
        states: s.business.states, rapid: s.rapid,
    };
    d.growth = { ...(d.growth || {}), ...s.growth };
    d.bills = { name: s.bills.name, gstin: s.bills.gstin, address: s.bills.address };
    return d;
};

/** The database as JSON (one object per table), gzip. Photos stay in /uploads. */
exports.backup = async () => {
    const t = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
    const skip = new Set(['refresh_tokens', 'auth_otp', 'tech_otp', 'login_attempts']);
    const out = { made_at: new Date().toISOString(), tables: {} };
    for (const { tablename } of t.rows) {
        if (skip.has(tablename)) continue;
        out.tables[tablename] = (await pool.query(`SELECT * FROM "${tablename.replace(/"/g, '')}"`)).rows;
    }
    return zlib.gzipSync(Buffer.from(JSON.stringify(out)));
};

exports.connection = async () => ({
    sms: {
        set_up: !!process.env.DOVE_API_KEY,
        sender: process.env.DOVE_SENDER_ID || '',
        play_store_phone: !!process.env.GPLAY_STATIC_PHONE,
    },
    email: { set_up: !!(process.env.EMAIL && process.env.EMAIL_PASSWORD), from: process.env.EMAIL || '' },
    whatsapp: { set_up: false },
    server_time: new Date().toISOString(),
    node: process.version,
});
