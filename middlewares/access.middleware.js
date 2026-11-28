/*
 * One gate in front of every /api route (app.js mounts it before the routes):
 *   1. security headers on every answer
 *   2. rate limits on public actions (OTP, sign-in, bookings, contact form) → 429 with Retry-After
 *   3. panel sign-in: wrong-password lock (8 wrong in 15 min from one network → wait; 10 wrong on one account → locked 1 hour)
 *   4. who may call what: admin-only routes need a signed-in main admin; a city manager gets a short list of
 *      routes (dashboard, pickups, leads) and only for their own cities; customers / dealers / technicians never
 *   5. every change made from the panel, and every panel sign-in, goes to the activity log (admin_audit)
 *   6. a city manager never sees customers' UPI IDs
 * Routes keep their own authMiddleware; this only adds checks, it never lets through what a route would refuse.
 */
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const store = require('../services/staff.store');

// ───────────────────────── who may call what ─────────────────────────
const PUBLIC_SYSTEM_GET = /^\/api\/(system|sarthak)\/(get_services|get_categories(\/[^/]+)?|categories\/\d+\/brands|get_brands(\/[^/]+)?|series\/[^/]+|get_models(\/[^/]+){0,3}|quick-sell|get_roles|site_config)\/?$/;

/** true = only the panel (admin / city manager) may call it */
function adminOnly(method, p) {
    if (p === '/api/logs' || p === '/api/logs_clean') return true;
    if (/^\/api\/(system|sarthak)\//.test(p)) return !(method === 'GET' && PUBLIC_SYSTEM_GET.test(p));
    if (p.startsWith('/api/sell/')) {
        if (method !== 'GET' && /^\/api\/sell\/(configs|questions|options|conditions|category-questions)(\/|$)/.test(p)) return true;
        if (method === 'PUT' && /^\/api\/sell\/listings\/\d+\/(assign|transfer)$/.test(p)) return true;
        if (method === 'GET' && /^\/api\/sell\/(listings|listings\/\d+|merchants)\/?$/.test(p)) return true;
        return false;
    }
    if (p.startsWith('/api/users/')) return /^\/api\/users\/(create|get_users(\/\d+)?|update\/\d+|delete_user\/\d+|\d+\/merchant)\/?$/.test(p);
    if (p.startsWith('/api/product/')) return /^\/api\/product\/(create|delete\/\d+|update\/\d+)$/.test(p);
    if (/^\/api\/(banners|faqs)(\/|$)/.test(p)) return method !== 'GET';
    if (/^\/api\/contact_us(\/|$)/.test(p)) return method !== 'POST';
    return false;
}

// what a city manager may do (all inside their cities)
const CITY_MANAGER_OK = [
    ['GET', /^\/api\/system\/(admin_dashboard|pickups_board|me)$/],
    ['PUT', /^\/api\/system\/pickups\/\d+\/assign$/],
    ['PUT', /^\/api\/system\/me\/password$/],
    ['GET', /^\/api\/sell\/(listings|merchants)$/],
    ['GET', /^\/api\/sell\/listings\/\d+$/],
    ['PUT', /^\/api\/sell\/listings\/\d+\/(assign|cancel)$/],
];

// ───────────────────────── rate limits ─────────────────────────
const LIMITS = [
    // [method, path regex, max, window minutes, name]
    ['POST', /^\/api\/auth\/(request_otp|resend_otp)$/, 5, 10, 'OTP codes'],
    ['POST', /^\/api\/auth\/verify_otp$/, 15, 10, 'OTP checks'],
    ['POST', /^\/api\/auth\/login$/, 30, 15, 'sign-in'],
    ['POST', /^\/api\/auth\/register$/, 5, 60, 'sign-ups'],
    ['POST', /^\/api\/sell\/listings$/, 20, 60, 'bookings'],
    ['POST', /^\/api\/sell\/pickup$/, 20, 60, 'pickups'],
    ['POST', /^\/api\/sell\/calculate-price$/, 120, 10, 'price checks'],
    ['POST', /^\/api\/contact_us\/?$/, 5, 10, 'call-back requests'],
];
exports.LIMITS = LIMITS;
const hits = new Map(); // key → [timestamps]
function limited(req) {
    for (const [m, re, max, mins, name] of LIMITS) {
        if (req.method !== m || !re.test(req.path)) continue;
        const key = name + '|' + req.ip;
        const now = Date.now();
        const win = mins * 60000;
        const list = (hits.get(key) || []).filter((t) => now - t < win);
        if (list.length >= max) {
            hits.set(key, list);
            return Math.ceil((list[0] + win - now) / 1000);
        }
        list.push(now);
        hits.set(key, list);
    }
    return 0;
}
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 3600000) hits.delete(k);
}, 10 * 60000).unref();

// ───────────────────────── sign-in lock ─────────────────────────
exports.LOCK = { networkMax: 8, networkMinutes: 15, accountMax: 10, accountMinutes: 60 };
async function lockWait(email, ip) {
    const L = exports.LOCK;
    const r = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM login_attempts WHERE ip = $2 AND NOT ok AND at > NOW() - make_interval(mins => $3)) AS net,
           (SELECT EXTRACT(EPOCH FROM (MAX(at) + make_interval(mins => $3) - NOW()))::int FROM login_attempts WHERE ip = $2 AND NOT ok AND at > NOW() - make_interval(mins => $3)) AS net_wait,
           (SELECT COUNT(*)::int FROM login_attempts WHERE lower(email) = lower($1) AND NOT ok AND at > NOW() - make_interval(mins => $4)) AS acc,
           (SELECT EXTRACT(EPOCH FROM (MAX(at) + make_interval(mins => $4) - NOW()))::int FROM login_attempts WHERE lower(email) = lower($1) AND NOT ok AND at > NOW() - make_interval(mins => $4)) AS acc_wait`,
        [email, ip, L.networkMinutes, L.accountMinutes],
    );
    const x = r.rows[0];
    if (x.acc >= L.accountMax) return { wait: Math.max(60, x.acc_wait || 0), why: 'This account is locked for an hour after too many wrong passwords.' };
    if (x.net >= L.networkMax) return { wait: Math.max(30, x.net_wait || 0), why: 'Too many wrong passwords from this network.' };
    return null;
}

// ───────────────────────── activity log wording ─────────────────────────
const WHAT = [
    [/^PUT \/api\/system\/pickups\/(\d+)\/assign$/, 'Assigned a pickup', 'pickup'],
    [/^POST \/api\/sell\/images$/, 'Uploaded a photo', ''],
    [/^(POST|PUT|DELETE) \/api\/system\/team(\/(\d+))?$/, 'Changed a panel login', 'login'],
    [/^PUT \/api\/system\/settings\/([\w-]+)$/, 'Changed settings', ''],
    [/^PUT \/api\/system\/me\/password$/, 'Changed own password', ''],
    [/^GET \/api\/system\/backup$/, 'Downloaded a backup', ''],
    [/^(POST|PUT|DELETE) \/api\/sell\/(questions|options|conditions|category-questions)/, 'Changed the questions', ''],
    [/^PUT \/api\/sell\/listings\/(\d+)\/assign$/, 'Gave an order to a dealer', 'order'],
    [/^PUT \/api\/sell\/listings\/(\d+)\/cancel$/, 'Cancelled an order', 'order'],
    [/^PUT \/api\/sell\/listings\/(\d+)\/transfer$/, 'Marked an order done', 'order'],
    [/^(POST|PUT|DELETE|PATCH) \/api\/sell\/configs/, 'Changed a model price', ''],
    [/^(POST|PUT|DELETE|PATCH) \/api\/system\/(models|series|create_brand|update_brand|delete_brand|toggle_brand|brands)/, 'Changed the catalog', ''],
    [/^(POST|PUT|DELETE|PATCH) \/api\/system\/(create_category|update_category|delete_category|toggle_category|categories)/, 'Changed the catalog', ''],
    [/^(POST|PUT|DELETE|PATCH) \/api\/system\/(create_service|update_service|delete_service|toggle_service)/, 'Changed the services', ''],
    [/^(POST|PUT|DELETE|PATCH) \/api\/system\/quick-sell/, 'Changed quick sell', ''],
    [/^(POST|PUT|DELETE|PATCH) \/api\/(banners|faqs)/, 'Changed the website', ''],
    [/^(POST|PUT|DELETE) \/api\/users\//, 'Changed a user', 'user'],
    [/^(POST|PUT|DELETE) \/api\/product\//, 'Changed a product', ''],
];
function describe(method, p) {
    const line = method + ' ' + p;
    for (const [re, what, kind] of WHAT) {
        const m = re.exec(line);
        if (m) {
            const id = (m.slice(1).find((x) => x && /^\d+$/.test(x)) || '');
            return { what, about: kind && id ? `${kind} ${id}` : (/settings\/([\w-]+)/.exec(p) || [])[1] || '' };
        }
    }
    return { what: 'Changed something', about: `${method} ${p}` };
}
const bodyKeys = (b) =>
    b && typeof b === 'object' && !Array.isArray(b)
        ? Object.keys(b).filter((k) => !/pass|token|secret|otp/i.test(k)).slice(0, 12).join(', ')
        : '';

// a UPI ID (name@bank, no dot after @), never an email
const UPI = /\b[\w.-]{2,}@(?![\w-]+\.)[a-z][a-z0-9]{1,30}\b/gi;
function maskUpi(v) {
    if (typeof v === 'string') return v.replace(UPI, 'UPI hidden');
    if (Array.isArray(v)) return v.map(maskUpi);
    if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) o[k] = maskUpi(v[k]);
        return o;
    }
    return v;
}

const deny = (res, code, message) => res.status(code).json({ message, code });

function tokenUser(req) {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!t) return null;
    try {
        return jwt.verify(t, process.env.JWT_ACCESS_SECRET);
    } catch {
        return null;
    }
}

// ───────────────────────── allowed browser origins ─────────────────────────
const DEFAULT_ORIGINS = [
    'https://recello.in', 'https://www.recello.in', 'https://dev.recello.in',
    'https://recello.thecanatech.com',
    'capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost',
];
exports.originAllowed = (origin) => {
    if (!origin) return true; // same-site pages, the apps' native calls, curl
    const extra = String(process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (DEFAULT_ORIGINS.includes(origin) || extra.includes(origin)) return true;
    // local development: any port on this machine or the local network
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) return true;
    return false;
};

// ───────────────────────── the gate ─────────────────────────
exports.gate = async (req, res, next) => {
    // 1. headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=15552000');

    const p = req.path.replace(/\/+$/, '') || '/';
    if (!p.startsWith('/api/')) return next();
    // the raw-SQL route is gone for good
    if (/^\/api\/(system|sarthak)\/query$/.test(p)) return deny(res, 404, 'Route not found');

    try {
        // 2. rate limits
        const wait = limited(req);
        if (wait) {
            res.setHeader('Retry-After', String(wait));
            return deny(res, 429, `Too many requests. Try again in ${wait < 90 ? wait + ' seconds' : Math.ceil(wait / 60) + ' minutes'}.`);
        }

        // 3. panel sign-in
        if (req.method === 'POST' && p === '/api/auth/login') {
            await store.ensure();
            const email = String(req.body?.email || '').trim();
            const lock = await lockWait(email, req.ip);
            if (lock) {
                res.setHeader('Retry-After', String(lock.wait));
                return deny(res, 429, `${lock.why} Try again in ${Math.ceil(lock.wait / 60)} minutes.`);
            }
            // written as wrong before the password is checked (so quick repeats can't slip past the count), set right after
            const row = await pool.query('INSERT INTO login_attempts (email, ip, ok) VALUES ($1, $2, false) RETURNING id', [email.slice(0, 200), req.ip]);
            res.on('finish', () => {
                const ok = res.statusCode === 200;
                if (ok) pool.query('UPDATE login_attempts SET ok = true WHERE id = $1', [row.rows[0].id]).catch(() => {});
                store.audit({ user: { email }, kind: ok ? 'signin' : 'bad_password', what: ok ? 'Signed in' : 'Wrong password', ip: req.ip });
            });
            return next();
        }

        // 4. who may call what
        // photo upload: any signed-in user (customers send a competitor's quote screenshot from the app)
        if (req.method === 'POST' && p === '/api/sell/images' && !tokenUser(req)) return deny(res, 401, 'Sign in first.');
        if (!adminOnly(req.method, p)) return next();
        const user = tokenUser(req);
        if (!user) return deny(res, 401, 'Sign in to the admin panel first.');
        const staff = await store.staffOf(user.userId);
        if (!staff || !staff.active || !(staff.admin || staff.cityManager)) return deny(res, 403, 'Only the admin panel can do this.');
        req.staff = { ...staff, userId: user.userId, email: user.email };
        req.scope = { cities: staff.admin ? null : staff.cities };

        if (staff.cityManager) {
            if (!CITY_MANAGER_OK.some(([m, re]) => m === req.method && re.test(p))) return deny(res, 403, 'City managers can’t open this.');
            const cities = staff.cities;
            // one order or pickup: must be in their cities
            const lid = (/^\/api\/sell\/listings\/(\d+)/.exec(p) || [])[1];
            const pid = (/^\/api\/system\/pickups\/(\d+)\/assign$/.exec(p) || [])[1];
            if (lid || pid) {
                const sql = lid
                    ? `SELECT 1 FROM sell_listings l WHERE l.id = $1 AND ${store.citySql('l', cities)}`
                    : `SELECT 1 FROM sell_pickups sp JOIN sell_listings l ON l.id = sp.listing_id WHERE sp.id = $1 AND ${store.citySql('l', cities)}`;
                const ok = await pool.query(sql, [lid || pid]);
                if (!ok.rowCount) return deny(res, 404, 'Not found in your cities.');
            }
            // the list of orders: only their cities
            let allowed = null;
            if (req.method === 'GET' && p === '/api/sell/listings') {
                const r = await pool.query(`SELECT l.id FROM sell_listings l WHERE ${store.citySql('l', cities)}`);
                allowed = new Set(r.rows.map((x) => String(x.id)));
            }
            // 6. no UPI IDs, and only their cities' orders
            const json = res.json.bind(res);
            res.json = (body) => {
                let b = body;
                if (allowed && Array.isArray(b)) b = b.filter((row) => allowed.has(String(row.id)));
                return json(maskUpi(b));
            };
        }

        // 5. activity log for every change
        if (req.method !== 'GET' || p === '/api/system/backup') {
            res.on('finish', () => {
                if (res.statusCode >= 400) return;
                const d = describe(req.method, p);
                let detail = bodyKeys(req.body);
                if (p.endsWith('/assign') && req.body) detail = 'to ' + (req.body.to || req.body.merchant_id || 'nobody');
                store.audit({ user: req.staff, kind: 'change', what: d.what, about: d.about, detail, ip: req.ip });
            });
        }
        return next();
    } catch (e) {
        return next(e);
    }
};

exports._test = { adminOnly, describe, maskUpi };
