/*
 * Tables for the admin panel's Team, Security and Settings (database/migration_admin.sql has the same SQL):
 *   admin_city_access  which cities a city manager may see
 *   admin_audit        every sign-in and every change made from the panel (kept a year)
 *   login_attempts     panel sign-ins, right and wrong, for the lock after too many wrong passwords
 *   app_settings       business settings (cities, pincodes, rapid pickup, bills, …) as JSON per key
 * They are created on first use, so the server works before the migration is run.
 */
const pool = require('../config/database');

const SQL = `
CREATE TABLE IF NOT EXISTS admin_city_access (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    city    VARCHAR(60) NOT NULL,
    PRIMARY KEY (user_id, city)
);
CREATE TABLE IF NOT EXISTS admin_audit (
    id      BIGSERIAL PRIMARY KEY,
    at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id BIGINT,
    email   TEXT,
    kind    VARCHAR(20) NOT NULL DEFAULT 'change',   -- signin | bad_password | change
    what    TEXT NOT NULL,
    about   TEXT,
    detail  TEXT,
    ip      VARCHAR(64)
);
CREATE INDEX IF NOT EXISTS admin_audit_at ON admin_audit (at DESC);
CREATE TABLE IF NOT EXISTS login_attempts (
    id    BIGSERIAL PRIMARY KEY,
    at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    email TEXT,
    ip    VARCHAR(64),
    ok    BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_email_at ON login_attempts (lower(email), at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_ip_at ON login_attempts (ip, at DESC);
CREATE TABLE IF NOT EXISTS app_settings (
    key        VARCHAR(40) PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by BIGINT
);
INSERT INTO roles (name, description, is_system) VALUES ('city_manager', 'Admin panel: only their cities', true)
    ON CONFLICT (name) DO NOTHING;
`;

let ready = null;
exports.ensure = () => {
    if (!ready)
        ready = pool.query(SQL).catch((e) => {
            ready = null;
            throw e;
        });
    return ready;
};
exports.SQL = SQL;

/** Roles and cities of a signed-in user (fresh from the database, so a change applies at once). */
exports.staffOf = async (userId) => {
    await exports.ensure();
    const r = await pool.query(
        `SELECT u.status,
                COALESCE(array_remove(array_agg(DISTINCT r.name), NULL), '{}') AS roles,
                COALESCE((SELECT array_agg(c.city ORDER BY c.city) FROM admin_city_access c WHERE c.user_id = u.id), '{}') AS cities
           FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
          WHERE u.id = $1
       GROUP BY u.id`,
        [userId],
    );
    if (!r.rowCount) return null;
    const row = r.rows[0];
    const roles = row.roles || [];
    return {
        active: Number(row.status) === 1,
        admin: roles.includes('admin'),
        cityManager: !roles.includes('admin') && roles.includes('city_manager'),
        roles,
        cities: row.cities || [],
    };
};

exports.audit = async ({ user, kind = 'change', what, about = '', detail = '', ip = '' }) => {
    try {
        await exports.ensure();
        await pool.query(
            `INSERT INTO admin_audit (user_id, email, kind, what, about, detail, ip) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user?.userId || null, user?.email || null, kind, String(what).slice(0, 200), String(about || '').slice(0, 200), String(detail || '').slice(0, 500), String(ip || '').slice(0, 64)],
        );
        // keep a year
        if (Math.random() < 0.01) await pool.query(`DELETE FROM admin_audit WHERE at < NOW() - INTERVAL '366 days'`);
    } catch (_) {
        /* logging never breaks a request */
    }
};

exports.getSetting = async (key, fallback = null) => {
    await exports.ensure();
    const r = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
    return r.rowCount ? r.rows[0].value : fallback;
};
exports.setSetting = async (key, value, userId) => {
    await exports.ensure();
    await pool.query(
        `INSERT INTO app_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        [key, JSON.stringify(value), userId || null],
    );
    return value;
};

/** SQL that keeps only listings whose (latest) pickup address is in one of the cities. alias = sell_listings alias. */
exports.citySql = (alias, cities) => {
    if (!cities) return 'TRUE';
    const list = cities
        .filter((c) => /^[\p{L}\d .'-]{1,60}$/u.test(c))
        .map((c) => `'${c.toLowerCase().replace(/'/g, "''")}'`);
    if (!list.length) return 'FALSE';
    return `EXISTS (SELECT 1 FROM sell_pickups cp JOIN addresses ca ON ca.id = cp.address_id
                     WHERE cp.listing_id = ${alias}.id
                       AND cp.id = (SELECT MAX(cp2.id) FROM sell_pickups cp2 WHERE cp2.listing_id = ${alias}.id)
                       AND lower(ca.city) = ANY(ARRAY[${list.join(',')}]))`;
};
