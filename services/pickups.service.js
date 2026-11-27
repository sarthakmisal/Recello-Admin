/*
 * The admin panel's Pickups board.
 *   GET /api/system/pickups_board?from=YYYY-MM-DD&to=YYYY-MM-DD   pickups of those days + the people who can take them
 *   PUT /api/system/pickups/:id/assign  { to }                      give one pickup to someone (or to nobody)
 *
 * "to" is one of:
 *   'agent:<user id>'   a Recello technician (tech_profiles)       -> sell_pickups.assigned_agent_id (the technician app shows it)
 *   'dealer:<user id>'  a dealer (role merchant)                   -> sell_listings.assigned_merchant_id (the dealer app shows it; the dealer picks the person)
 *   'tech:<user id>'    one of a dealer's people (merchant_agents)  -> both: the dealer, and that person on the pickup
 *   ''                  nobody: back to "to assign"
 * A pickup that is done, cancelled or failed, or whose order is completed / cancelled, cannot be changed here.
 */
const pool = require('../config/database');

const OPEN_PICKUP = [1, 2]; // scheduled, rescheduled
const DONE = 7;
const CANCELLED = 8;
const PERSON = (u, p) => `COALESCE(NULLIF(TRIM(COALESCE(${p}.first_name, '') || ' ' || COALESCE(${p}.last_name, '')), ''), ${u}.phone, ${u}.email)`;
const day = (s, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : fallback);

async function safe(sql, params, fallback) {
    try {
        return (await pool.query(sql, params)).rows;
    } catch (_) {
        return fallback;
    }
}

exports.board = async (query = {}) => {
    const from = day(query.from, null);
    const to = day(query.to, null);
    const range = from && to ? `p.pickup_date BETWEEN $1::date AND $2::date` : `p.pickup_date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 6`;
    const params = from && to ? [from, to] : [];

    const [pickups, team, dealers, dealerTechs] = await Promise.all([
        pool.query(
            `SELECT p.id, l.id AS order_id, to_char(p.pickup_date, 'YYYY-MM-DD') AS date,
                    to_char(p.pickup_slot_start, 'HH24:MI') AS slot_start, to_char(p.pickup_slot_end, 'HH24:MI') AS slot_end,
                    COALESCE(m.name, 'Device') || COALESCE(' · ' || c.name, '') AS title,
                    COALESCE(NULLIF(a.name, ''), ${PERSON('u', 'up')}) AS name,
                    COALESCE(NULLIF(a.phone, ''), u.phone) AS phone,
                    a.pincode, COALESCE(NULLIF(a.city, ''), 'Other') AS city,
                    COALESCE((SELECT o.amount FROM listing_offers o WHERE o.listing_id = l.id AND o.status = 2 ORDER BY o.id DESC LIMIT 1),
                             l.expected_price, l.quoted_price, 0)::float AS amount,
                    l.status AS order_status, ls.option_name AS order_status_label,
                    p.status AS pickup_status, ps.option_name AS pickup_status_label,
                    p.assigned_agent_id AS agent_id, l.assigned_merchant_id AS dealer_id,
                    p.notes
               FROM sell_pickups p
               JOIN sell_listings l ON l.id = p.listing_id
          LEFT JOIN models m ON m.id = l.model_id
          LEFT JOIN sell_model_configs c ON c.id = l.config_id
          LEFT JOIN users u ON u.id = l.user_id
          LEFT JOIN user_profile up ON up.user_id = l.user_id
          LEFT JOIN addresses a ON a.id = p.address_id
          LEFT JOIN enum_master ls ON ls.master_name = 'listing_status' AND ls.id = l.status
          LEFT JOIN enum_master ps ON ps.master_name = 'pickup_status' AND ps.id = p.status
              WHERE ${range}
                AND p.status IN (${OPEN_PICKUP.join(',')}, 3)
                AND l.status <> ${CANCELLED}
                AND p.id = (SELECT MAX(p2.id) FROM sell_pickups p2 WHERE p2.listing_id = l.id)
           ORDER BY p.pickup_date, p.pickup_slot_start, p.id`,
            params,
        ).then((r) => r.rows),
        safe(
            `SELECT t.user_id AS id, ${PERSON('u', 'up')} AS name, u.phone, t.city
               FROM tech_profiles t JOIN users u ON u.id = t.user_id LEFT JOIN user_profile up ON up.user_id = u.id
              WHERE t.active AND u.status = 1
           ORDER BY name`,
            [],
            [],
        ),
        safe(
            `SELECT u.id, ${PERSON('u', 'up')} AS name, u.phone,
                    (SELECT a.city FROM addresses a WHERE a.user_id = u.id ORDER BY a.is_default DESC, a.id LIMIT 1) AS city
               FROM users u
               JOIN user_roles ur ON ur.user_id = u.id
               JOIN roles r ON r.id = ur.role_id AND r.name = 'merchant'
          LEFT JOIN user_profile up ON up.user_id = u.id
              WHERE u.status = 1
           ORDER BY name`,
            [],
            [],
        ),
        safe(
            `SELECT ma.agent_user_id AS id, ma.merchant_id AS dealer_id, ${PERSON('u', 'up')} AS name, u.phone
               FROM merchant_agents ma JOIN users u ON u.id = ma.agent_user_id LEFT JOIN user_profile up ON up.user_id = u.id
              WHERE ma.is_active
           ORDER BY name`,
            [],
            [],
        ),
    ]);

    const n = (x) => (x == null ? null : Number(x));
    return {
        pickups: pickups.map((p) => {
            const payout = /Payout: ([^|]+)/.exec(p.notes || '');
            const by = n(p.agent_id);
            const dealer = n(p.dealer_id);
            const techOfDealer = by && dealerTechs.some((t) => Number(t.id) === by && Number(t.dealer_id) === dealer);
            return {
                ...p,
                id: Number(p.id),
                order_id: Number(p.order_id),
                agent_id: by,
                dealer_id: dealer,
                slot: `${p.slot_start}–${p.slot_end}`,
                rapid: /RAPID pickup/.test(p.notes || ''),
                payout: payout ? payout[1].trim() : '',
                done: p.pickup_status === 3 || p.order_status === DONE,
                // who has it, as the board's "to" value
                to: techOfDealer ? `tech:${by}` : dealer ? `dealer:${dealer}` : by ? `agent:${by}` : '',
            };
        }),
        team: team.map((t) => ({ ...t, id: Number(t.id) })),
        dealers: dealers.map((d) => ({
            ...d,
            id: Number(d.id),
            techs: dealerTechs.filter((t) => Number(t.dealer_id) === Number(d.id)).map((t) => ({ id: Number(t.id), name: t.name, phone: t.phone })),
        })),
    };
};

exports.assign = async (pickupId, to = '') => {
    const id = Number(pickupId);
    if (!id) throw { status: 400, message: 'pickup id is required' };
    const m = /^(agent|dealer|tech):(\d+)$/.exec(String(to || ''));
    if (to && !m) throw { status: 400, message: "to must be 'agent:<id>', 'dealer:<id>', 'tech:<id>' or ''" };
    const kind = m ? m[1] : '';
    const who = m ? Number(m[2]) : null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const r = await client.query(
            `SELECT p.id, p.listing_id, p.status AS pickup_status, l.status AS order_status
               FROM sell_pickups p JOIN sell_listings l ON l.id = p.listing_id
              WHERE p.id = $1 FOR UPDATE OF p, l`,
            [id],
        );
        if (!r.rowCount) throw { status: 404, message: 'Pickup not found' };
        const row = r.rows[0];
        if (!OPEN_PICKUP.includes(Number(row.pickup_status)) || [DONE, CANCELLED].includes(Number(row.order_status)))
            throw { status: 409, message: 'This pickup is finished or cancelled; it cannot be given to someone else.' };

        let agentId = null;
        let dealerId = null;
        if (kind === 'agent') {
            const ok = await client.query('SELECT 1 FROM tech_profiles WHERE user_id = $1 AND active', [who]).catch(() => ({ rowCount: 0 }));
            if (!ok.rowCount) throw { status: 400, message: 'That person is not an active Recello technician.' };
            agentId = who;
        } else if (kind === 'dealer') {
            const ok = await client.query(
                `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 AND r.name = 'merchant'`,
                [who],
            );
            if (!ok.rowCount) throw { status: 400, message: 'That user is not a dealer.' };
            dealerId = who;
        } else if (kind === 'tech') {
            const ok = await client.query('SELECT merchant_id FROM merchant_agents WHERE agent_user_id = $1 AND is_active', [who]);
            if (!ok.rowCount) throw { status: 400, message: "That person is not an active member of a dealer's team." };
            agentId = who;
            dealerId = Number(ok.rows[0].merchant_id);
        }

        await client.query('UPDATE sell_pickups SET assigned_agent_id = $2, updated_at = NOW() WHERE id = $1', [id, agentId]);
        // order status: assigned when someone has it, back to pending when nobody has it (only from pending / assigned)
        await client.query(
            `UPDATE sell_listings
                SET assigned_merchant_id = $2,
                    status = CASE WHEN status IN (1, 2) THEN (CASE WHEN $3 THEN 2 ELSE 1 END) ELSE status END,
                    updated_at = NOW()
              WHERE id = $1`,
            [row.listing_id, dealerId, !!(agentId || dealerId)],
        );
        await client.query('COMMIT');
        return { ok: true, id, order_id: Number(row.listing_id), to: kind ? `${kind}:${who}` : '' };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw { status: e.status || 500, message: e.message || 'Could not assign the pickup' };
    } finally {
        client.release();
    }
};
