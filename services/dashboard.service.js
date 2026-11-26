/*
 * The admin dashboard (GET /api/system/admin_dashboard?period=month).
 * Everything the first screen of the admin panel shows, in one call:
 *   orders      = sell_listings      (status: listing_status enum, 7 completed, 8 cancelled)
 *   pickups     = sell_pickups       (status: pickup_status enum, 1 scheduled, 2 rescheduled)
 *   paid amount = accepted renegotiation offer, else quoted price, else the customer's expected price
 *   special price requests waiting = technician app visits (tech_visits.t.smk.status = 'pending')
 * Each part is read on its own: a table that does not exist (e.g. no technician app yet) gives 0, never an error.
 * Repairs, dealer wallet recharges and follow-ups are not kept on this server: always 0.
 */
const pool = require('../config/database');

const DONE = 7;
const CANCELLED = 8;
const PENDING = 1;
const PAID = `COALESCE((SELECT o.amount FROM listing_offers o WHERE o.listing_id = l.id AND o.status = 2 ORDER BY o.id DESC LIMIT 1),
                       l.quoted_price, l.expected_price, 0)`;
const PERSON = (u, p) => `COALESCE(NULLIF(TRIM(COALESCE(${p}.first_name, '') || ' ' || COALESCE(${p}.last_name, '')), ''), ${u}.phone, ${u}.email)`;

// [from, to) for a period, as SQL
const RANGE = {
    today: [`CURRENT_DATE`, `CURRENT_DATE + 1`],
    week: [`CURRENT_DATE - 6`, `CURRENT_DATE + 1`],
    month: [`date_trunc('month', CURRENT_DATE)`, `CURRENT_DATE + 1`],
    last: [`date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'`, `date_trunc('month', CURRENT_DATE)`],
    all: [`'1970-01-01'::date`, `CURRENT_DATE + 1`],
};

async function safe(sql, params, fallback) {
    try {
        return (await pool.query(sql, params)).rows;
    } catch (_) {
        return fallback;
    }
}

exports.getAdminDashboard = async (query = {}) => {
    const period = RANGE[query.period] ? query.period : 'month';
    const [from, to] = RANGE[period];
    const smkWait = Math.max(1, Number(query.smk_wait_min) || 15);

    const [k, pickups, series, top, attention, todo, team, dealers, totals] = await Promise.all([
        safe(
            `SELECT COUNT(*) FILTER (WHERE l.status NOT IN (${DONE}, ${CANCELLED}))::int AS open,
                    COUNT(*) FILTER (WHERE l.status = ${PENDING})::int AS waiting,
                    COUNT(*) FILTER (WHERE l.created_at::date = CURRENT_DATE)::int AS new_today,
                    COUNT(*) FILTER (WHERE l.status = ${DONE} AND l.updated_at >= NOW() - INTERVAL '30 days')::int AS paid_n,
                    COALESCE(SUM(${PAID}) FILTER (WHERE l.status = ${DONE} AND l.updated_at >= NOW() - INTERVAL '30 days'), 0)::float AS paid_amount
               FROM sell_listings l`,
            [],
            [{}],
        ),
        safe(
            `SELECT l.id, to_char(p.pickup_slot_start, 'HH24:MI') || '–' || to_char(p.pickup_slot_end, 'HH24:MI') AS slot,
                    COALESCE(m.name, 'Device') || COALESCE(' · ' || c.name, '') AS title,
                    ${PERSON('u', 'up')} AS name,
                    a.pincode,
                    CASE WHEN p.assigned_agent_id IS NOT NULL THEN ${PERSON('au', 'ap')}
                         WHEN l.assigned_merchant_id IS NOT NULL THEN ${PERSON('mu', 'mp')} END AS who
               FROM sell_pickups p
               JOIN sell_listings l ON l.id = p.listing_id
          LEFT JOIN models m ON m.id = l.model_id
          LEFT JOIN sell_model_configs c ON c.id = l.config_id
          LEFT JOIN users u ON u.id = l.user_id
          LEFT JOIN user_profile up ON up.user_id = l.user_id
          LEFT JOIN addresses a ON a.id = p.address_id
          LEFT JOIN users au ON au.id = p.assigned_agent_id
          LEFT JOIN user_profile ap ON ap.user_id = p.assigned_agent_id
          LEFT JOIN users mu ON mu.id = l.assigned_merchant_id
          LEFT JOIN user_profile mp ON mp.user_id = l.assigned_merchant_id
              WHERE p.pickup_date = CURRENT_DATE AND p.status IN (1, 2) AND l.status NOT IN (${DONE}, ${CANCELLED})
           ORDER BY p.pickup_slot_start, l.id`,
            [],
            [],
        ),
        safe(
            `SELECT to_char(d, 'YYYY-MM-DD') AS day,
                    (SELECT COUNT(*)::int FROM sell_listings l WHERE l.created_at::date = d) AS sell
               FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, INTERVAL '1 day') AS g(d)
           ORDER BY d`,
            [],
            [],
        ),
        safe(
            `SELECT COALESCE(m.name, 'Device') AS name, COUNT(*)::int AS n
               FROM sell_listings l LEFT JOIN models m ON m.id = l.model_id
              WHERE l.status <> ${CANCELLED}
           GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 6`,
            [],
            [],
        ),
        safe(
            `WITH nextp AS (
                 SELECT DISTINCT ON (p.listing_id) p.listing_id, p.pickup_date, p.pickup_slot_start, p.pickup_slot_end, p.assigned_agent_id
                   FROM sell_pickups p WHERE p.status IN (1, 2)
               ORDER BY p.listing_id, p.pickup_date DESC, p.id DESC)
             SELECT l.id, COALESCE(m.name, 'Device') || COALESCE(' · ' || c.name, '') AS device,
                    CASE
                      WHEN np.pickup_date < CURRENT_DATE AND l.status IN (1, 2, 3)
                        THEN 'Pickup date passed ' || to_char(np.pickup_date, 'Dy, DD Mon')
                      WHEN l.status = ${PENDING} AND np.assigned_agent_id IS NULL AND l.assigned_merchant_id IS NULL AND np.pickup_date >= CURRENT_DATE
                        THEN 'No agent · pickup ' || to_char(np.pickup_date, 'Dy, DD Mon') || ', ' || to_char(np.pickup_slot_start, 'HH24:MI')
                      WHEN l.updated_at < NOW() - INTERVAL '3 days'
                        THEN 'No update for ' || EXTRACT(DAY FROM NOW() - l.updated_at)::int || ' days'
                    END AS why,
                    CASE
                      WHEN np.pickup_date < CURRENT_DATE AND l.status IN (1, 2, 3) THEN 1
                      WHEN l.status = ${PENDING} AND np.assigned_agent_id IS NULL AND l.assigned_merchant_id IS NULL AND np.pickup_date >= CURRENT_DATE THEN 2
                      ELSE 3
                    END AS rank, np.pickup_date, np.pickup_slot_start
               FROM sell_listings l
          LEFT JOIN nextp np ON np.listing_id = l.id
          LEFT JOIN models m ON m.id = l.model_id
          LEFT JOIN sell_model_configs c ON c.id = l.config_id
              WHERE l.status NOT IN (${DONE}, ${CANCELLED})
           ORDER BY rank, np.pickup_date NULLS LAST, np.pickup_slot_start NULLS LAST, l.id`,
            [],
            [],
        ),
        Promise.all([
            safe(
                `SELECT COUNT(*)::int AS n FROM tech_visits v
                  WHERE v.t -> 'smk' ->> 'status' = 'pending'
                    AND COALESCE((v.t -> 'smk' ->> 'at')::bigint, 0) + $1 * 60 >= EXTRACT(EPOCH FROM NOW())::bigint`,
                [smkWait],
                [{ n: 0 }],
            ),
            safe(`SELECT COUNT(DISTINCT d.tech_id)::int AS n FROM tech_docs d WHERE d.status = 'pending'`, [], [{ n: 0 }]),
            safe(
                `SELECT COUNT(*)::int AS n FROM tech_profiles t
                  WHERE t.active AND NOT EXISTS (SELECT 1 FROM tech_docs d WHERE d.tech_id = t.user_id AND d.kind = 'photo' AND d.status <> 'rejected')`,
                [],
                [{ n: 0 }],
            ),
        ]),
        safe(
            `SELECT x.id, ${PERSON('u', 'up')} AS name, u.phone,
                    COUNT(*)::int AS n,
                    COUNT(*) FILTER (WHERE l.status = ${DONE})::int AS done,
                    COUNT(*) FILTER (WHERE l.status = ${CANCELLED})::int AS canc,
                    COALESCE(SUM(${PAID}) FILTER (WHERE l.status = ${DONE}), 0)::float AS val
               FROM (SELECT DISTINCT ON (p.listing_id) p.listing_id, p.assigned_agent_id AS id
                       FROM sell_pickups p WHERE p.assigned_agent_id IS NOT NULL
                   ORDER BY p.listing_id, p.id DESC) x
               JOIN sell_listings l ON l.id = x.listing_id
               JOIN users u ON u.id = x.id
          LEFT JOIN user_profile up ON up.user_id = x.id
              WHERE l.created_at >= ${from} AND l.created_at < ${to}
           GROUP BY x.id, up.first_name, up.last_name, u.phone, u.email
           ORDER BY n DESC, name`,
            [],
            [],
        ),
        safe(
            `SELECT l.assigned_merchant_id AS id, ${PERSON('u', 'up')} AS name, u.phone,
                    (SELECT a.city FROM addresses a WHERE a.user_id = u.id ORDER BY a.is_default DESC, a.id LIMIT 1) AS city,
                    COUNT(*)::int AS n,
                    COUNT(*) FILTER (WHERE l.status = ${DONE})::int AS done,
                    COUNT(*) FILTER (WHERE l.status = ${CANCELLED})::int AS canc,
                    COALESCE(SUM(${PAID}) FILTER (WHERE l.status = ${DONE}), 0)::float AS val
               FROM sell_listings l
               JOIN users u ON u.id = l.assigned_merchant_id
          LEFT JOIN user_profile up ON up.user_id = u.id
              WHERE l.created_at >= ${from} AND l.created_at < ${to}
           GROUP BY l.assigned_merchant_id, u.id, up.first_name, up.last_name, u.phone, u.email
           ORDER BY n DESC, name`,
            [],
            [],
        ),
        safe(
            `SELECT COUNT(*)::int AS n,
                    COUNT(*) FILTER (WHERE l.status = ${DONE})::int AS done,
                    COUNT(*) FILTER (WHERE l.status = ${CANCELLED})::int AS canc,
                    COUNT(*) FILTER (WHERE l.status NOT IN (${DONE}, ${CANCELLED}))::int AS open,
                    COALESCE(SUM(${PAID}) FILTER (WHERE l.status = ${DONE}), 0)::float AS val
               FROM sell_listings l
              WHERE l.created_at >= ${from} AND l.created_at < ${to}`,
            [],
            [{ n: 0, done: 0, canc: 0, open: 0, val: 0 }],
        ),
    ]);

    const ratio = (r) => (r.done + r.canc ? r.canc / (r.done + r.canc) : null);
    const K = k[0] || {};
    const [smk, docs, nophoto] = todo;
    return {
        generated_at: new Date().toISOString(),
        period,
        kpis: {
            open: K.open || 0,
            waiting: K.waiting || 0,
            pickups_today: pickups.length,
            pickups_unassigned: pickups.filter((p) => !p.who).length,
            new_today: K.new_today || 0,
            paid_amount: K.paid_amount || 0,
            paid_count: K.paid_n || 0,
            repairs_open: 0,
            repairs_unassigned: 0,
        },
        todo: {
            special_price: smk[0]?.n || 0,
            pickups_unassigned: pickups.filter((p) => !p.who).length,
            new_orders: K.waiting || 0,
            wallet_recharges: 0,
            tech_docs: docs[0]?.n || 0,
            no_photo: nophoto[0]?.n || 0,
            terms: 0,
            followups: 0,
        },
        series: series.map((d) => ({ day: d.day, sell: d.sell, repair: 0 })),
        attention: attention.filter((a) => a.why).map((a) => ({ id: Number(a.id), device: a.device, why: a.why })),
        pickups: pickups.map((p) => ({ ...p, id: Number(p.id) })),
        top,
        followups: 0,
        report: {
            team: team.map((r) => ({ ...r, id: Number(r.id), ratio: ratio(r) })),
            dealers: dealers.map((r) => ({ ...r, id: Number(r.id), ratio: ratio(r) })),
            total: { ...(totals[0] || {}), ratio: ratio(totals[0] || { done: 0, canc: 0 }) },
        },
    };
};
