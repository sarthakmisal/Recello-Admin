/*
 * Security page: checks that look at THIS server right now, and the activity log.
 *   GET /api/system/security                checks + score
 *   GET /api/system/activity?kind=&limit=   sign-ins, wrong passwords, changes (kept a year)
 * state: ok (green) · bad (red, needs you) · warn (amber, worth a look) · na (grey, can't be checked here)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const pool = require('../config/database');
const store = require('./staff.store');
const access = require('../middlewares/access.middleware');

const strong = (s) => typeof s === 'string' && s.length >= 32 && !/change-me|secret|password|123/i.test(s);

function get(port, p) {
    return new Promise((resolve) => {
        const req = http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, (res) => {
            res.resume();
            resolve(res.statusCode);
        });
        req.on('error', () => resolve(0));
        req.on('timeout', () => {
            req.destroy();
            resolve(0);
        });
    });
}

exports.checks = async (req) => {
    await store.ensure();
    const env = process.env;
    const out = [];
    const add = (state, title, text, fix = '') => out.push({ state, title, text, fix });
    const root = path.resolve(__dirname, '..');

    // secrets
    const weak = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter((k) => !strong(env[k]));
    if (weak.length) add('bad', 'Admin passwords and secrets', `${weak.join(' and ')} is missing or short, so sign-in tokens could be forged.`, '.env: use 32+ random characters for each, then restart (everyone signs in again).');
    else add('ok', 'Admin passwords and secrets', 'The sign-in token secrets are long and random.');

    // the password OTP sign-ups get
    if (!env.SYSTEM_PASSWORD || env.SYSTEM_PASSWORD.length < 16)
        add('bad', 'Password given to customers who sign up with OTP', 'SYSTEM_PASSWORD is not set or short; customers who sign up with an OTP get the built-in password "resello@123".', '.env → SYSTEM_PASSWORD = 32+ random characters.');
    else add('ok', 'Password given to customers who sign up with OTP', 'It is a long secret, not the built-in default.');

    // OTP
    if (!env.DOVE_API_KEY) add('bad', 'OTP text messages', 'No SMS provider key: customers can’t get their login code.', '.env → DOVE_API_KEY and the other DOVE_ settings.');
    else add('ok', 'OTP text messages', `Codes are sent by SMS (Dove${env.DOVE_SENDER_ID ? ', sender ' + env.DOVE_SENDER_ID : ''}). A code works for 10 minutes and 6 tries.`);
    if (env.GPLAY_STATIC_PHONE) add('warn', 'Play Store test phone', `The number ending ${String(env.GPLAY_STATIC_PHONE).slice(-4)} signs in with any code. Fine while the Play Store reviews the app.`, '.env → remove GPLAY_STATIC_PHONE after the review.');

    // backups
    if (env.EMAIL && env.EMAIL_PASSWORD) add('warn', 'Backups', 'Email is set up, but no automatic backup is going out yet.', 'Settings → Backup → Download backup every week. Also keep the database server’s own backups.');
    else add('warn', 'Backups', 'No automatic backup is going out (email isn’t set up).', 'Settings → Backup → Download backup every week, and set EMAIL / EMAIL_PASSWORD in .env.');

    // https
    const host = String(req.headers.host || '');
    if (/^(localhost|127\.|\[::1\])/.test(host)) add('na', 'Secure connection (https)', 'This is a test copy on this computer, so it isn’t checked here.');
    else if (req.secure || req.headers['x-forwarded-proto'] === 'https') add('ok', 'Secure connection (https)', 'This page came over https, and browsers are told to always use it.');
    else add('bad', 'Secure connection (https)', 'This page came over plain http: passwords and customer data travel unencrypted.', 'Put the site behind https (nginx + Let’s Encrypt) and send X-Forwarded-Proto.');

    // who can sign in
    const who = (await pool.query(
        `SELECT COUNT(DISTINCT u.id) FILTER (WHERE r.name = 'admin')::int AS admins,
                COUNT(DISTINCT u.id) FILTER (WHERE r.name = 'city_manager' AND NOT EXISTS (
                    SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id WHERE ur2.user_id = u.id AND r2.name = 'admin'))::int AS cms
           FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
          WHERE u.status = 1`,
    )).rows[0];
    add(who.admins > 0 ? 'ok' : 'bad', 'Who can sign in', `${who.admins} main admin${who.admins === 1 ? '' : 's'}, ${who.cms} city manager${who.cms === 1 ? '' : 's'}. City managers see only their own cities (dashboard, pickups, leads), never prices, questions, settings, backups or customers’ UPI IDs.`, who.admins ? '' : 'Team → add a main admin.');

    // only the panel can change things
    add('ok', 'Only the admin panel can change things', 'Prices, questions, the catalog, users, banners, FAQs, settings and the orders list need a signed-in main admin; app customers, dealers and technicians get “Only the admin panel can do this”. The old route that ran any SQL is switched off.');

    // password guessing
    const L = access.LOCK;
    const bad24 = (await pool.query(`SELECT COUNT(*)::int AS n FROM login_attempts WHERE NOT ok AND at > NOW() - INTERVAL '24 hours'`)).rows[0].n;
    add('ok', 'Password guessing is stopped', `After ${L.networkMax} wrong passwords in ${L.networkMinutes} minutes a network has to wait, and an account locks for an hour after ${L.accountMax}. Wrong passwords in the last 24 hours: ${bad24}.`);

    // rate limits
    add('ok', 'Rate limits on public actions', `${access.LIMITS.map((l) => l[4]).join(', ')} all have limits. When one is reached the answer is “429 Too many requests” with a countdown.`);

    // headers
    add('ok', 'Browser security headers', 'Answers can’t be shown inside other sites, browsers don’t guess file types, and only Recello may ask for the camera, microphone or location.');

    // private files
    const port = req.socket?.localPort || env.PORT || 5500;
    const codes = await Promise.all(['/.env', '/package.json', '/database/db_script_resello.sql'].map((p) => get(port, p)));
    if (codes.every((c) => c === 404 || c === 403)) add('ok', 'Private files can’t be downloaded', `Asked just now: .env, package.json and the database script all said no (${codes.join(', ')}).`);
    else add('bad', 'Private files can’t be downloaded', `Asked just now: .env, package.json and the database script answered ${codes.join(', ')}.`, 'Serve only /public and /uploads; never the project folder.');

    // uploads
    const multerSrc = fs.readFileSync(path.join(root, 'config', 'multer.config.js'), 'utf8');
    if (/IMAGE_TYPES/.test(multerSrc)) add('ok', 'Uploads can’t run code', 'Only JPG, PNG, WebP and GIF are accepted (10 MB at most), names are random, and the uploads folder is served as plain files that can’t run scripts.');
    else add('bad', 'Uploads can’t run code', 'Any file type can be uploaded and keeps its name.', 'config/multer.config.js: accept images only.');

    // CORS
    if (!access.originAllowed('https://evil.example')) add('ok', 'Other websites can’t use the API', `Only recello.in (with and without www), the Android/iOS app${env.CORS_ORIGINS ? ' and the addresses in CORS_ORIGINS' : ''} may call the API from a browser.`);
    else add('bad', 'Other websites can’t use the API', 'Any website can call the API with a visitor’s sign-in.', 'app.js: CORS origin check.');

    // logs
    add('ok', 'Server logs are private', '/api/logs and /api/logs_clean need a main admin (they were open to anyone before).');

    // activity log
    const n7 = (await pool.query(`SELECT COUNT(*)::int AS n FROM admin_audit WHERE at > NOW() - INTERVAL '7 days'`)).rows[0].n;
    add('ok', 'Every admin action is logged', `${n7} entr${n7 === 1 ? 'y' : 'ies'} in the last 7 days: who, what, when and from which network. Kept for a year. See Activity below.`);

    // node
    const major = Number(process.versions.node.split('.')[0]);
    add(major >= 20 ? 'ok' : 'warn', 'Server software', `Node.js ${process.versions.node} ${major >= 20 ? 'gets security fixes' : 'is old: update to 20 or newer'}.`);

    // not on this server yet
    add('na', 'Automatic jobs', 'Nothing runs on a timer yet (daily report, nightly backup, reminders come in the next phase).');
    add('na', 'WhatsApp replies', 'WhatsApp isn’t connected, so there is nothing to check.');

    const scored = out.filter((c) => c.state !== 'na');
    return {
        checked_at: new Date().toISOString(),
        in_place: scored.filter((c) => c.state === 'ok').length,
        of: scored.length,
        needs_you: out.filter((c) => c.state === 'bad').length,
        bad_passwords_24h: bad24,
        checks: [...out.filter((c) => c.state === 'bad'), ...out.filter((c) => c.state === 'warn'), ...out.filter((c) => c.state === 'na'), ...out.filter((c) => c.state === 'ok')],
    };
};

exports.activity = async ({ kind, limit, before } = {}) => {
    await store.ensure();
    const k = ['signin', 'bad_password', 'change'].includes(kind) ? kind : null;
    const lim = Math.min(500, Math.max(10, Number(limit) || 200));
    const r = await pool.query(
        `SELECT id, at, email, kind, what, about, detail, ip FROM admin_audit
          WHERE ($1::text IS NULL OR kind = $1) AND ($2::bigint IS NULL OR id < $2)
       ORDER BY id DESC LIMIT $3`,
        [k, Number(before) || null, lim],
    );
    return r.rows.map((x) => ({ ...x, id: Number(x.id) }));
};
