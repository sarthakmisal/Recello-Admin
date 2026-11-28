/*
 * Panel logins: main admins (role admin) and city managers (role city_manager + their cities).
 *   GET  /api/system/team          list
 *   POST /api/system/team          add   { name, email, role: 'admin'|'city_manager', cities[], password, active }
 *   PUT  /api/system/team/:id      edit  (same fields; empty password keeps the old one)
 *   GET  /api/system/me            who is signed in: name, email, role, cities
 * Guards: at least one active main admin always stays; you can't take away your own main-admin access or switch yourself off.
 */
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../config/database');
const store = require('./staff.store');

const fail = (status, message) => ({ status, message });
const ROLE = { admin: 'admin', city_manager: 'city_manager' };
const cleanCities = (a) =>
    [...new Set((Array.isArray(a) ? a : []).map((c) => String(c).trim()).filter((c) => /^[\p{L}\d .'-]{1,60}$/u.test(c)))];

const LIST_SQL = `
    SELECT u.id, u.email, u.phone, u.status, up.first_name, up.last_name,
           bool_or(r.name = 'admin') AS is_admin,
           COALESCE((SELECT array_agg(c.city ORDER BY c.city) FROM admin_city_access c WHERE c.user_id = u.id), '{}') AS cities,
           (SELECT MAX(a.at) FROM admin_audit a WHERE a.user_id = u.id OR lower(a.email) = lower(u.email)) AS last_seen
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id AND r.name IN ('admin', 'city_manager')
 LEFT JOIN user_profile up ON up.user_id = u.id
`;
const shape = (r) => ({
    id: Number(r.id),
    name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email,
    email: r.email,
    role: r.is_admin ? 'admin' : 'city_manager',
    cities: r.cities || [],
    active: Number(r.status) === 1,
    last_seen: r.last_seen,
});

exports.list = async () => {
    await store.ensure();
    const r = await pool.query(LIST_SQL + ` GROUP BY u.id, up.first_name, up.last_name ORDER BY bool_or(r.name = 'admin') DESC, up.first_name, u.email`);
    return r.rows.map(shape);
};

exports.me = async (userId) => {
    await store.ensure();
    const r = await pool.query(LIST_SQL + ` WHERE u.id = $1 GROUP BY u.id, up.first_name, up.last_name`, [userId]);
    if (!r.rowCount) throw fail(404, 'Not a panel login');
    return shape(r.rows[0]);
};

async function activeAdmins(client, exceptId) {
    const r = await client.query(
        `SELECT COUNT(DISTINCT u.id)::int AS n FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
          WHERE r.name = 'admin' AND u.status = 1 AND u.id <> $1`,
        [exceptId || 0],
    );
    return r.rows[0].n;
}

exports.save = async (id, body = {}, me) => {
    await store.ensure();
    const name = String(body.name || '').trim().slice(0, 100);
    const email = String(body.email || '').trim().toLowerCase();
    const role = ROLE[body.role] || 'city_manager';
    const cities = cleanCities(body.cities);
    const password = String(body.password || '');
    const active = body.active !== false;

    if (!name) throw fail(400, 'Name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'A valid email is required: it is their login.');
    if (role === 'city_manager' && !cities.length) throw fail(400, 'Tick at least one city for a city manager.');
    if ((!id || password) && password.length < 10) throw fail(400, 'Password must be at least 10 characters.');
    if (id && Number(id) === Number(me.userId)) {
        if (role !== 'admin') throw fail(400, 'You can’t take away your own main-admin access.');
        if (!active) throw fail(400, 'You can’t switch off your own login.');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const dup = await client.query('SELECT id FROM users WHERE lower(email) = $1 AND id <> $2', [email, id || 0]);
        if (dup.rowCount) throw fail(409, 'Another user already has this email.');

        let uid = id ? Number(id) : null;
        if (uid) {
            const ex = await client.query(LIST_SQL + ` WHERE u.id = $1 GROUP BY u.id, up.first_name, up.last_name`, [uid]);
            if (!ex.rowCount) throw fail(404, 'Login not found.');
            const wasAdmin = ex.rows[0].is_admin && Number(ex.rows[0].status) === 1;
            if (wasAdmin && (role !== 'admin' || !active) && (await activeAdmins(client, uid)) === 0)
                throw fail(400, 'Keep at least one active main admin.');
            await client.query('UPDATE users SET email = $2, status = $3, updated_at = NOW() WHERE id = $1', [uid, email, active ? 1 : 2]);
            if (password) await client.query('UPDATE users SET password = $2 WHERE id = $1', [uid, await bcrypt.hash(password, 10)]);
        } else {
            // users.phone is required and unique: staff without a phone get a placeholder
            const phone = 'st' + crypto.randomInt(10 ** 9, 10 ** 10 - 1);
            const r = await client.query(
                `INSERT INTO users (email, phone, password, status, is_verified) VALUES ($1, $2, $3, $4, true) RETURNING id`,
                [email, phone, await bcrypt.hash(password, 10), active ? 1 : 2],
            );
            uid = Number(r.rows[0].id);
        }
        const [first, ...rest] = name.split(/\s+/);
        await client.query(
            `INSERT INTO user_profile (user_id, first_name, last_name) VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, updated_at = NOW()`,
            [uid, first.slice(0, 50), rest.join(' ').slice(0, 50)],
        );
        // role: exactly one of admin / city_manager (other roles the user has stay)
        await client.query(`DELETE FROM user_roles WHERE user_id = $1 AND role_id IN (SELECT id FROM roles WHERE name IN ('admin', 'city_manager'))`, [uid]);
        await client.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2`, [uid, role]);
        await client.query('DELETE FROM admin_city_access WHERE user_id = $1', [uid]);
        if (role === 'city_manager')
            for (const c of cities) await client.query('INSERT INTO admin_city_access (user_id, city) VALUES ($1, $2)', [uid, c]);
        // switched off or password changed: end their sessions
        if (!active || (id && password)) await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [uid]);
        await client.query('COMMIT');
        return exports.me(uid);
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e.status ? e : fail(500, e.message);
    } finally {
        client.release();
    }
};

exports.changeOwnPassword = async (userId, { current, next } = {}) => {
    if (String(next || '').length < 10) throw fail(400, 'The new password must be at least 10 characters.');
    const r = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
    if (!r.rowCount || !(await bcrypt.compare(String(current || ''), r.rows[0].password))) throw fail(400, 'The current password is wrong.');
    if (await bcrypt.compare(String(next), r.rows[0].password)) throw fail(400, 'Pick a password you haven’t used here.');
    await pool.query('UPDATE users SET password = $2, updated_at = NOW() WHERE id = $1', [userId, await bcrypt.hash(String(next), 10)]);
    return { ok: true };
};
