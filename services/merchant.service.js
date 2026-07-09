const pool = require('../config/database');
const bcrypt = require("bcrypt");
const authService = require('./auth.service');
const { v7: uuid7 } = require('uuid')
const { sendEmail } = require("../providers/email.provider");
const { sendEmailOTP } = require("../services/auth.service")
const { getQuestions } = require('./sell.service');
const SALT_ROUNDS = 10;

const LISTING_STATUS_MASTER = 'listing_status';
const INSPECTION_STATUS_MASTER = 'inspection_status';
const OFFER_STATUS_MASTER = 'offer_status';

const toTitle = (slug) => {
    if (!slug) return '';
    return String(slug)
        .split('_')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
};

const resolveEnumId = async (db, masterName, optionName) => {
    const res = await db.query(
        `SELECT id FROM enum_master WHERE master_name=$1 AND option_name=$2`,
        [masterName, optionName],
    );
    if (res.rowCount === 0) throw { status: 500, message: `Missing enum_master(${masterName}:${optionName})` };
    return res.rows[0].id;
};

exports.uploadMerchantImage = async ({ user, file, alt_text } = {}) => {
    if (!user?.userId) throw { status: 401, message: 'Invalid session' };
    // Allow both merchant and agent (both are part of merchant app ops)
    if (!Array.isArray(user.roles) || (!user.roles.includes('merchant') && !user.roles.includes('agent'))) {
        throw { status: 403, message: 'Access denied' };
    }
    if (!file?.filename) throw { status: 400, message: 'Image file is required (field: image)' };

    const res = await pool.query(
        `INSERT INTO images(url, alt_text, uploaded_by)
         VALUES ($1,$2,$3)
         RETURNING id, url, alt_text`,
        [file.filename, alt_text || null, user.userId],
    );
    return res.rows[0];
};

exports.loginMerchant = async ({ email, password }) => {
    if (!email || !password) throw { status: 400, message: "Email and Password are required" };
    email = email.trim().toLowerCase();
    password = password.trim().toLowerCase();
    const isMerchant = await pool.query(`SELECT * FROM users u JOIN user_roles ur ON u.id=ur.user_id JOIN roles r ON ur.role_id=r.id WHERE u.email=$1 AND (r.name='merchant' OR r.name='agent') AND u.status=1`, [email]);

    if (isMerchant.rowCount === 0) throw { status: 403, message: "Access denied. Not a merchant account." };

    const data = await authService.loginUser({ email, password });
    return data;
};
exports.getProfileDetails = async ({ userId, roles }) => {
    // console.log(userId, roles)
    if (!userId || !roles || !roles.includes('merchant')) {
        throw { status: 403, message: "Not Allowed" };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await client.query(
            `SELECT u.id, up.first_name, up.last_name, u.email, u.phone, r.name role FROM users u
            JOIN user_profile up ON u.id=up.user_id
            JOIN user_roles ur ON u.id=ur.user_id
            JOIN roles r ON ur.role_id=r.id
            WHERE u.id = $1 AND r.name='merchant'`,
            [userId]
        );

        if (result.rowCount == 0) {
            throw { status: 403, message: "Invalid or Expired Token" };
        }

        // await this.sendEmailOTP({ link: link, email: contact });
        await client.query('COMMIT');

        return result.rows[0];

    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: 500, message: error.message || "Internal Server Error" };
    } finally {
        client.release();
    }
};

exports.updateProfileDetails = async ({ user, first_name, last_name, email, phone }) => {
    // console.log(user, first_name)
    if (!user || !first_name || !last_name || !email || !user.roles.includes('merchant') || !phone) {
        throw { status: 400, message: "Insufficient Details" };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await client.query(
            `SELECT u.id, up.first_name, up.last_name, u.email, u.phone, r.name role FROM users u
            JOIN user_profile up ON u.id=up.user_id
            JOIN user_roles ur ON u.id=ur.user_id
            JOIN roles r ON ur.role_id=r.id
            WHERE u.id = $1 AND r.name='merchant'`,
            [user.userId]
        );

        if (result.rowCount == 0) {
            throw { status: 403, message: "Request Forbidden" };
        }

        let updateUser = await client.query(
            `UPDATE users SET email=$1, phone=$2 WHERE id=$3 RETURNING email, phone`,
            [email, phone, user.userId]
        );
        const updateProfile = await client.query(
            `UPDATE user_profile SET first_name=$1, last_name=$2 WHERE user_id=$3 RETURNING first_name, last_name`,
            [first_name, last_name, user.userId]
        );
        updateUser = { ...updateUser.rows[0], ...updateProfile.rows[0] };
        await client.query('COMMIT');

        return updateUser;

    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: 500, message: error.message || "Internal Server Error" };
    } finally {
        client.release();
    }
};
exports.getLeadsByMerchant = async ({ userId }) => {
    // console.log(user)
    if (!userId) throw { status: 400, message: "Invalid User" };
    const leads = await pool.query(`
         SELECT sl.id, sl.base_price, sl.quoted_price, sl.expected_price,
               sl.created_at, sl.updated_at,
               em.option_name status_label,
               u.email user_email,
               up.first_name, up.last_name,
               c.name category, b.name brand, m.name model,
               smc.name config_name
        FROM sell_listings sl
        LEFT JOIN users u ON sl.user_id=u.id
        LEFT JOIN user_profile up ON u.id=up.user_id
        LEFT JOIN categories c ON sl.category_id=c.id
        LEFT JOIN brands b ON sl.brand_id=b.id
        LEFT JOIN models m ON sl.model_id=m.id
        LEFT JOIN sell_model_configs smc ON sl.config_id=smc.id
        LEFT JOIN enum_master em ON sl.status=em.id AND em.master_name='listing_status'
        WHERE sl.assigned_merchant_id=$1
        `, [userId]);
    return leads.rows;
};

exports.getCompletedLeads = async ({ user } = {}) => {
    if (!user?.userId) throw { status: 401, message: 'Invalid session' };
    if (!Array.isArray(user.roles) || !user.roles.includes('merchant')) {
        throw { status: 403, message: 'Access denied' };
    }

    const merchantId = user.userId;
    const result = await pool.query(
        `
        SELECT sl.id,
               sl.base_price,
               sl.quoted_price,
               sl.expected_price,
               sl.created_at,
               sl.updated_at,
               em.option_name status_label,
               u.email user_email,
               up.first_name,
               up.last_name,
               c.name category,
               b.name brand,
               m.name model,
               smc.name config_name,
               ia.agent_id,
               ia.agent_name
        FROM sell_listings sl
        LEFT JOIN users u ON sl.user_id=u.id
        LEFT JOIN user_profile up ON u.id=up.user_id
        LEFT JOIN categories c ON sl.category_id=c.id
        LEFT JOIN brands b ON sl.brand_id=b.id
        LEFT JOIN models m ON sl.model_id=m.id
        LEFT JOIN sell_model_configs smc ON sl.config_id=smc.id
        LEFT JOIN enum_master em ON sl.status=em.id AND em.master_name='listing_status'
        LEFT JOIN LATERAL (
            SELECT i.agent_id,
                   CONCAT(COALESCE(upa.first_name,''), CASE WHEN upa.last_name IS NULL OR upa.last_name='' THEN '' ELSE ' ' END, COALESCE(upa.last_name,'')) agent_name
            FROM inspections i
            LEFT JOIN enum_master im ON i.status=im.id AND im.master_name='inspection_status'
            LEFT JOIN user_profile upa ON upa.user_id=i.agent_id
            WHERE i.listing_id=sl.id
              AND (im.option_name='completed' OR im.option_name IS NULL)
            ORDER BY i.updated_at DESC NULLS LAST, i.created_at DESC
            LIMIT 1
        ) ia ON true
        WHERE sl.assigned_merchant_id=$1
          AND em.option_name='completed'
        ORDER BY sl.updated_at DESC, sl.id DESC
        `,
        [merchantId],
    );
    return result.rows;
};
exports.getLeadsByLeadId = async ({ userId }, { id }) => {
    // console.log(user)
    if (!id) throw { status: 400, message: "Invalid Lead ID" };
    const leads = await pool.query(`
         SELECT sl.id, sl.base_price, sl.quoted_price, sl.expected_price,
               sl.created_at, sl.updated_at,
               em.option_name status_label,
               u.email user_email,
               up.first_name, up.last_name,
               c.name category, b.name brand, m.name model,
               smc.name config_name,
               sp.pickup_date, sp.pickup_slot_start, sp.pickup_slot_end
        FROM sell_listings sl
        LEFT JOIN users u ON sl.user_id=u.id
        LEFT JOIN user_profile up ON u.id=up.user_id
        LEFT JOIN categories c ON sl.category_id=c.id
        LEFT JOIN brands b ON sl.brand_id=b.id
        LEFT JOIN models m ON sl.model_id=m.id
        LEFT JOIN sell_model_configs smc ON sl.config_id=smc.id
        LEFT JOIN sell_pickups sp ON sl.id=sp.listing_id
        JOIN addresses a ON sp.address_id=a.id
        LEFT JOIN enum_master em ON sl.status=em.id AND em.master_name='listing_status'
        WHERE sl.id=$1 AND sl.assigned_merchant_id=$2
        `, [id, userId]);
    return leads.rows;
};

exports.requestOTP = async (user, { listing_id } = {}) => {
    if (!listing_id) throw { status: 400, message: 'listing_id is required' };
    const merchant_id = await resolveMerchantIdFromAuth(user);
    
    const client = await pool.connect();
    try {
        
        await client.query('BEGIN');
        
        const agentData=await client.query(`SELECT u.email FROM users u WHERE u.id=$1`, [user.userId]);
        const email=agentData.rows[0].email;
        if(!email) throw { status: 400, message: 'Agent email not found' };

        const listingRes = await client.query(
            `SELECT sl.id, sl.user_id, sl.assigned_merchant_id, u.email user_email
             FROM sell_listings sl
             LEFT JOIN users u ON sl.user_id=u.id
             WHERE sl.id=$1
             LIMIT 1`,
            [listing_id],
        );
        if (listingRes.rowCount === 0) throw { status: 404, message: 'Listing not found' };
        if (String(listingRes.rows[0].assigned_merchant_id || '') !== String(merchant_id)) {
            throw { status: 403, message: 'Listing is not assigned to this merchant' };
        }

        const sent_to = (email || listingRes.rows[0].user_email || '').trim();
        if (!sent_to) throw { status: 400, message: 'Customer email is required' };

        // Basic throttling: max 3 OTPs per listing+sent_to in 10 minutes
        const recentCount = await client.query(
            `SELECT COUNT(*)::int cnt
             FROM sell_listing_otps
             WHERE listing_id=$1 AND sent_to=$2 AND created_at > NOW() - INTERVAL '10 minutes'`,
            [listing_id, sent_to],
        );
        if ((recentCount.rows[0]?.cnt || 0) >= 3) throw { status: 429, message: 'Too many OTP requests. Retry after 10 minutes.' };

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const id = uuid7();

        await client.query(
            `INSERT INTO sell_listing_otps (id, listing_id, sent_to, otp_hash)
             VALUES ($1,$2,$3,$4)`,
            [id, listing_id, sent_to, otp],
        );

        await sendEmailOTP({ otp, email: sent_to });
        await client.query('COMMIT');
        return { message: 'OTP sent to email', id };
    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: error.status || 500, message: error.message };
    } finally {
        client.release();
    }
};

exports.verifyOTP = async ({ user, id, otp, inspection_id } = {}) => {
    if (!user) throw { status: 401, message: 'Invalid session' };
    if (!id || !otp) throw { status: 400, message: 'id and otp are required' };

    const merchant_id = await resolveMerchantIdFromAuth(user);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const otpRes = await client.query(
            `SELECT id, listing_id, sent_to, otp_hash, attempts, expires_at, verified_at
             FROM sell_listing_otps
             WHERE id=$1
             FOR UPDATE`,
            [id],
        );
        if (otpRes.rowCount === 0) throw { status: 404, message: 'Invalid OTP' };
        const otpRow = otpRes.rows[0];

        // Idempotency: if client retries verify due to network issues, return success.
        if (otpRow.verified_at) {
            // Still ensure listing belongs to this merchant before returning.
            const listingRes = await client.query(
                `SELECT id, assigned_merchant_id
                 FROM sell_listings
                 WHERE id=$1
                 LIMIT 1`,
                [otpRow.listing_id],
            );
            if (listingRes.rowCount === 0) throw { status: 404, message: 'Listing not found' };
            if (String(listingRes.rows[0].assigned_merchant_id || '') !== String(merchant_id)) {
                throw { status: 403, message: 'Listing is not assigned to this merchant' };
            }
            await client.query('COMMIT');
            return {
                message: 'OTP already verified',
                listing_id: otpRow.listing_id,
                inspection_id: inspection_id ?? null,
            };
        }
        if (new Date(otpRow.expires_at) < new Date()) throw { status: 401, message: 'OTP expired. Request new OTP.' };
        if ((otpRow.attempts || 0) >= 5) throw { status: 429, message: 'Max retries exceeded. Request new OTP.' };

        // Ensure listing belongs to this merchant
        const listingRes = await client.query(
            `SELECT id, assigned_merchant_id
             FROM sell_listings
             WHERE id=$1
             LIMIT 1`,
            [otpRow.listing_id],
        );
        if (listingRes.rowCount === 0) throw { status: 404, message: 'Listing not found' };
        if (String(listingRes.rows[0].assigned_merchant_id || '') !== String(merchant_id)) {
            throw { status: 403, message: 'Listing is not assigned to this merchant' };
        }

        const isMatch = String(otp) === String(otpRow.otp_hash);
        if (!isMatch) {
            await client.query(`UPDATE sell_listing_otps SET attempts=attempts+1 WHERE id=$1`, [id]);
            throw { status: 401, message: 'Invalid OTP' };
        }

        await client.query(
            `UPDATE sell_listing_otps
             SET verified_by=$2, verified_at=NOW(), attempts=attempts+1
             WHERE id=$1`,
            [id, user.userId],
        );

        if (inspection_id) {
            await client.query(
                `UPDATE inspections
                 SET otp_verified_at=NOW(), updated_at=NOW()
                 WHERE id=$1 AND listing_id=$2`,
                [inspection_id, otpRow.listing_id],
            );
        }

        await client.query('COMMIT');
        return { message: 'OTP verified', listing_id: otpRow.listing_id, inspection_id: inspection_id ?? null };
    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: error.status || 500, message: error.message };
    } finally {
        client.release();
    }
};


exports.acceptLead = async ({ lead_id, agent_id }) => {
    if (!lead_id || !agent_id) throw { status: 400, message: "Invalid Data" };

    const merchant = await pool.query(`SELECT ma.merchant_id FROM merchant_agents ma WHERE ma.agent_user_id=$1`, [agent_id])
    // console.log(merchant.rows,lead_id,agent_id);

    if (merchant.rowCount === 0) throw { status: 400, message: "Agent no longer Exist" }

    const result = await pool.query(
        `UPDATE sell_listings SET status=(SELECT id FROM enum_master WHERE master_name='listing_status' AND option_name='assigned')
        WHERE id=$1 AND assigned_merchant_id=$2 RETURNING *`,
        [lead_id, merchant.rows[0].merchant_id]
    );

    if (result.rowCount == 0) throw { status: 403, message: "No such Lead Exist" }
    return result.rows;
}


exports.inviteMerchantAgent = async ({
    user_id, contact
}) => {

    if (!user_id || !contact) {
        throw { status: 400, message: "Contact Details are required" };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const isMerchant = await client.query(
            `SELECT * FROM users u 
            JOIN user_roles ur ON ur.user_id=u.id 
            JOIN roles r ON ur.role_id=r.id
            WHERE r.name='merchant' AND u.id = $1`,
            [user_id]
        );

        if (isMerchant.rowCount == 0) {
            throw { status: 403, message: "Forbidden" };
        }
        const token = uuid7();
        const result = await client.query(
            `INSERT INTO merchant_agent_invites(merchant_id, contact, token)
            VALUES($1,$2,$3)
            ON CONFLICT(contact) DO UPDATE SET token=EXCLUDED.token, status=1, created_at = NOW()
            RETURNING *`,
            [user_id, contact, token]
        );

        const link = `${process.env.BASE_URL}/api/merchant/verify_agent?token=${token}`;
        // console.log(link, contact)

        await this.sendEmailOTP({ link: link, email: contact });
        await client.query('COMMIT');

        return result.rows[0];

    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: 500, message: error.message || "Internal Server Error" };
    } finally {
        client.release();
    }
};

exports.verifyMerchantAgent = async ({ token }) => {

    if (!token) {
        throw { status: 400, message: "Token is required" };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await client.query(
            `SELECT * FROM merchant_agent_invites mi
            JOIN users u ON mi.merchant_id=u.id
            WHERE mi.token = $1 AND mi.status < 3 AND mi.created_at > NOW() - INTERVAL '48 hours'`,
            [token]
        );

        if (result.rowCount == 0) {
            await client.query('UPDATE merchant_agent_invites SET status = 3 WHERE token=$1', [token]);
            throw { status: 403, message: "Invalid or Expired Token" };
        }

        await client.query(
            `UPDATE merchant_agent_invites SET status=2 WHERE token=$1`,
            [token]
        );
        // await this.sendEmailOTP({ link: link, email: contact });
        await client.query('COMMIT');

        return {
            message: "Token is valid. Agent can proceed with registration.", merchant_id: result.rows[0].merchant_id
        };

    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: 500, message: error.message || "Internal Server Error" };
    } finally {
        client.release();
    }
};

exports.registerMerchantAgent = async ({ merchant_id, first_name, last_name, email, phone, password, token }) => {
    if (!merchant_id || !first_name || !last_name || !email || !phone || !password) {
        throw { status: 400, message: "Insufficient Details" };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const [isTokenValid, isMerchantValid, isExisting] = await Promise.all([
            client.query(
                `SELECT token, contact FROM merchant_agent_invites WHERE token = $1 AND status = 2`,
                [token]
            ),
            client.query(
                `SELECT 1 FROM users u
                JOIN user_roles ur ON u.id=ur.user_id
                JOIN roles r ON ur.role_id=r.id
                WHERE u.id = $1 AND r.name='merchant'`,
                [merchant_id]
            ),
            client.query(
                `SELECT 1 FROM users WHERE email=$1`,
                [email]
            )
        ]);
        if (isTokenValid.rowCount === 0) {
            throw { status: 403, message: "Invalid or Expired Token" };
        }
        if (isTokenValid.rows[0].contact !== email) {
            throw { status: 403, message: "Invalid Invitee" };
        }
        if (isMerchantValid.rowCount === 0) {
            throw { status: 403, message: "Request Forbidden" };
        }
        if (isExisting.rowCount > 0) {
            throw { status: 409, message: "User with this email already exists" };
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        let agent = await client.query(
            `INSERT INTO users (email, phone, password) VALUES ($1, $2, $3) RETURNING id, email, phone`,
            [email, phone, hashedPassword]
        );
        const agent_profile = await client.query(
            `INSERT INTO user_profile (first_name, last_name, user_id) VALUES ($1, $2, $3) RETURNING first_name, last_name`,
            [first_name, last_name, agent.rows[0].id]
        );
        await client.query(
            `INSERT INTO user_roles (user_id, role_id) VALUES ($1, (SELECT id FROM roles WHERE name='agent'))`,
            [agent.rows[0].id]
        );
        await client.query(`INSERT INTO merchant_agents (merchant_id, agent_user_id) VALUES ($1, $2)`, [merchant_id, agent.rows[0].id]);
        await client.query(
            `UPDATE merchant_agent_invites SET status=3,agent_user_id=$2 WHERE token=$1`,
            [token, agent.rows[0].id]
        );
        agent = { ...agent.rows[0], ...agent_profile.rows[0] };
        await client.query('COMMIT');

        return agent;

    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: 500, message: error.message || "Internal Server Error" };
    } finally {
        client.release();
    }
};

exports.getRequoteQuestions = async () => {
    const client = await pool.connect();
    try {
        return await getQuestions({ context: "inspection" });
    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: 500, message: error.message || "Internal Server Error" };
    } finally {
        client.release();
    }
};

exports.getMerchantAgents = async ({ userId, roles }) => {
    if (!userId || !Array.isArray(roles) || !roles.includes('merchant')) {
        throw { status: 403, message: 'Access denied' };
    }

    const result = await pool.query(
        `
        SELECT ma.agent_user_id id,
               u.email,
               u.phone,
               up.first_name,
               up.last_name,
               up.avatar_url,
               ma.is_active,
               ma.joined_at
        FROM merchant_agents ma
        JOIN users u ON u.id=ma.agent_user_id
        LEFT JOIN user_profile up ON up.user_id=u.id
        WHERE ma.merchant_id=$1
        ORDER BY ma.joined_at DESC
        `,
        [userId],
    );
    return result.rows;
};

const resolveMerchantIdFromAuth = async ({ userId, roles }) => {
    if (!userId) throw { status: 401, message: 'Invalid session' };
    if (!Array.isArray(roles)) throw { status: 401, message: 'Invalid session' };

    if (roles.includes('merchant')) return userId;
    if (!roles.includes('agent')) throw { status: 403, message: 'Access denied' };

    const res = await pool.query(
        `SELECT merchant_id
         FROM merchant_agents
         WHERE agent_user_id=$1 AND is_active=true
         ORDER BY joined_at DESC
         LIMIT 1`,
        [userId],
    );
    if (res.rowCount === 0) throw { status: 403, message: 'Agent is not linked to a merchant' };
    return res.rows[0].merchant_id;
};

const resolveQuestionContextIds = async (contextSlug) => {
    const normalized = contextSlug ? String(contextSlug).trim().toLowerCase() : null;
    if (!normalized) throw { status: 400, message: 'context is required' };

    const [ctxRes, bothRes] = await Promise.all([
        pool.query(
            `SELECT id FROM enum_master WHERE master_name='question_context' AND option_name=$1`,
            [normalized],
        ),
        pool.query(
            `SELECT id FROM enum_master WHERE master_name='question_context' AND option_name='both'`,
        ),
    ]);
    if (ctxRes.rowCount === 0) throw { status: 400, message: 'Invalid context' };
    if (bothRes.rowCount === 0) throw { status: 500, message: 'Missing question_context=both in enum_master' };
    return { contextId: ctxRes.rows[0].id, bothId: bothRes.rows[0].id };
};

const insertImageFromUpload = async (client, { file, alt_text, uploaded_by } = {}) => {
    if (!file?.filename) throw { status: 400, message: 'Image file is required' };
    const res = await client.query(
        `INSERT INTO images(url, alt_text, uploaded_by)
         VALUES ($1,$2,$3)
         RETURNING id, url, alt_text`,
        [file.filename, alt_text || null, uploaded_by || null],
    );
    return res.rows[0];
};

exports.submitRequoteAnswers = async ({ user, context, listing_id, answers, filesByField } = {}) => {
    if (!listing_id) throw { status: 400, message: 'listing_id is required' };
    if (!Array.isArray(answers) || answers.length === 0) throw { status: 400, message: 'answers must be a non-empty array' };
    if (!filesByField || typeof filesByField.get !== 'function') filesByField = new Map();

    const merchant_id = await resolveMerchantIdFromAuth(user);
    const { contextId, bothId } = await resolveQuestionContextIds(context);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const listingRes = await client.query(
            `SELECT id, base_price, assigned_merchant_id
             FROM sell_listings
             WHERE id=$1
             LIMIT 1`,
            [listing_id],
        );
        if (listingRes.rowCount === 0) throw { status: 404, message: 'Listing not found' };
        if (String(listingRes.rows[0].assigned_merchant_id || '') !== String(merchant_id)) {
            throw { status: 403, message: 'Listing is not assigned to this merchant' };
        }

        const questionIds = [...new Set(
            answers
                .map(a => a?.question_id ?? a?.questionId)
                .filter(v => v != null)
                .map(v => Number(v))
                .filter(n => Number.isFinite(n))
        )];
        if (questionIds.length === 0) throw { status: 400, message: 'answers[].question_id is required' };

        const questionsRes = await client.query(
            `SELECT id, context
             FROM sell_questions
             WHERE id = ANY($1::bigint[])`,
            [questionIds],
        );
        if (questionsRes.rowCount !== questionIds.length) {
            throw { status: 400, message: 'One or more question_id values are invalid' };
        }
        const ctxByQuestionId = new Map(questionsRes.rows.map(r => [String(r.id), String(r.context)]));
        for (const qid of questionIds) {
            const qctx = ctxByQuestionId.get(String(qid));
            if (qctx !== String(contextId) && qctx !== String(bothId)) {
                throw { status: 400, message: `Question ${qid} not allowed for context=${context}` };
            }
        }

        // Upsert answers + optional proof images.
        // Legacy path: when inspection sessions are not used, keep answers under inspection_id=NULL.
        const inspection_id = null;
        for (const ans of answers) {
            const question_id = ans?.question_id ?? ans?.questionId;
            if (!question_id) throw { status: 400, message: 'Each answer requires question_id' };

            const options = ans?.options;
            if (!Array.isArray(options) || options.length === 0) {
                throw { status: 400, message: `Answer for question_id=${question_id} must include options[]` };
            }

            for (const opt of options) {
                const option_id = (opt && typeof opt === 'object')
                    ? (opt.option_id ?? opt.optionId ?? opt.id)
                    : opt;
                if (!option_id) {
                    throw { status: 400, message: `Missing option_id for question_id=${question_id}` };
                }

                let answer_image_id = null;
                const existingImageId = (opt && typeof opt === 'object')
                    ? (opt.answer_image_id ?? opt.answerImageId ?? null)
                    : null;
                if (existingImageId != null) {
                    answer_image_id = existingImageId;
                }

                const field = (opt && typeof opt === 'object')
                    ? (opt.file_field ?? opt.fileField)
                    : null;

                // Default convention: answer_image_<questionId>_<optionId>
                const fieldCandidates = [
                    field,
                    `answer_image_${question_id}_${option_id}`,
                    `answer_image_${option_id}`,
                ].filter(Boolean);

                const file = fieldCandidates
                    .map(k => filesByField.get(String(k)))
                    .find(Boolean);
                if (file) {
                    const uploaded = await insertImageFromUpload(client, { file, alt_text: `Listing ${listing_id} proof`, uploaded_by: user?.userId || null });
                    answer_image_id = uploaded.id;
                }

                // With inspection_id NULL we cannot rely on a unique constraint for upsert.
                await client.query(
                    `DELETE FROM sell_listing_answers
                     WHERE listing_id=$1 AND inspection_id IS NULL AND question_id=$2 AND option_id=$3`,
                    [listing_id, question_id, option_id],
                );
                await client.query(
                    `INSERT INTO sell_listing_answers(listing_id, inspection_id, question_id, option_id, answer_image_id)
                     VALUES ($1,$2,$3,$4,$5)`,
                    [listing_id, inspection_id, question_id, option_id, answer_image_id],
                );
            }
        }

        // Recalculate quoted price from inspection context answers
        const base_price = parseFloat(listingRes.rows[0].base_price || 0);
        const dedRes = await client.query(
            `
            SELECT COALESCE(SUM(sqo.price_deduction), 0) total_deduction
            FROM sell_listing_answers sla
            JOIN sell_questions sq ON sq.id=sla.question_id
            JOIN sell_question_options sqo ON sqo.id=sla.option_id
            WHERE sla.listing_id=$1
                            AND sla.inspection_id IS NULL
              AND (sq.context=$2 OR sq.context=$3)
            `,
            [listing_id, contextId, bothId],
        );
        const totalDeduction = parseFloat(dedRes.rows[0]?.total_deduction || 0);
        let quoted_price = base_price - (base_price * totalDeduction) / 100;
        if (quoted_price < 0) quoted_price = 0;

        await client.query(
            `UPDATE sell_listings
             SET quoted_price=$2, updated_at=NOW()
             WHERE id=$1`,
            [listing_id, quoted_price],
        );

        await client.query('COMMIT');
        return {
            listing_id,
            merchant_id,
            context,
            base_price,
            quoted_price,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: error.status || 500, message: error.message || 'Internal Server Error' };
    } finally {
        client.release();
    }
};

const LISTING_TRANSITIONS = {
    assigned: ['out_for_delivery'],
    out_for_delivery: ['inspection_started'],
    inspection_started: ['inspection_complete', 'cancelled'],
    inspection_complete: ['completed', 'cancelled', 'renegotiating'],
    renegotiating: ['completed', 'cancelled', 'inspection_complete'],
};

const assertRole = (user, role) => {
    if (!user || !Array.isArray(user.roles) || !user.roles.includes(role)) {
        throw { status: 403, message: 'Access denied' };
    }
};

const getListingForMerchantTx = async (client, { listing_id, merchant_id, lock } = {}) => {
    const res = await client.query(
        `SELECT sl.id,
                sl.user_id,
                sl.base_price,
                sl.quoted_price,
                sl.expected_price,
                sl.assigned_merchant_id,
                sl.status,
                em.option_name status_slug
         FROM sell_listings sl
         JOIN enum_master em ON sl.status=em.id AND em.master_name='listing_status'
         WHERE sl.id=$1
         ${lock ? 'FOR UPDATE' : ''}
         LIMIT 1`,
        [listing_id],
    );
    if (res.rowCount === 0) throw { status: 404, message: 'Listing not found' };
    const row = res.rows[0];
    if (String(row.assigned_merchant_id || '') !== String(merchant_id)) {
        throw { status: 403, message: 'Listing is not assigned to this merchant' };
    }
    if (!row.status_slug) throw { status: 500, message: 'Listing status is not mapped in enum_master' };
    return row;
};

const getLatestInspectionTx = async (client, { listing_id } = {}) => {
    const res = await client.query(
        `SELECT i.id,
                i.listing_id,
                i.agent_id,
                i.otp_verified_at,
                i.created_at,
                i.updated_at,
                em.option_name status_slug
         FROM inspections i
         LEFT JOIN enum_master em ON i.status=em.id AND em.master_name='inspection_status'
         WHERE i.listing_id=$1
         ORDER BY i.created_at DESC
         LIMIT 1`,
        [listing_id],
    );
    return res.rowCount ? res.rows[0] : null;
};

const getPendingOfferTx = async (client, { listing_id } = {}) => {
    const pendingId = await resolveEnumId(client, OFFER_STATUS_MASTER, 'pending');
    const res = await client.query(
        `SELECT lo.id,
                lo.listing_id,
                lo.inspection_id,
                lo.offered_by,
                lo.amount,
                lo.status,
                lo.created_at,
                em.option_name status_slug
         FROM listing_offers lo
         LEFT JOIN enum_master em ON lo.status=em.id AND em.master_name='offer_status'
         WHERE lo.listing_id=$1 AND lo.status=$2
         ORDER BY lo.created_at DESC
         LIMIT 1`,
        [listing_id, pendingId],
    );
    return res.rowCount ? res.rows[0] : null;
};

const getLatestCancellationTx = async (client, { listing_id, inspection_id } = {}) => {
    const res = await client.query(
        `SELECT id, listing_id, inspection_id, cancelled_by, reason,
                final_offered_price, customer_expected_price, created_at
         FROM listing_cancellations
         WHERE listing_id=$1
           AND ($2::bigint IS NULL OR inspection_id=$2)
         ORDER BY created_at DESC
         LIMIT 1`,
        [listing_id, inspection_id ?? null],
    );
    return res.rowCount ? res.rows[0] : null;
};

const transitionListingStatusTx = async (client, { listing_id, from, to } = {}) => {
    const allowed = LISTING_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
        throw {
            status: 409,
            code: 'INVALID_STATUS_TRANSITION',
            message: `Can't move this lead to ${toTitle(to)} because its current status is ${toTitle(from)}.`,
            details: { from, to },
            next_actions: ['Use GET /api/merchant/leads/:id/resume to see the next step'],
        };
    }
    const toId = await resolveEnumId(client, LISTING_STATUS_MASTER, to);
    await client.query(
        `UPDATE sell_listings SET status=$2, updated_at=NOW() WHERE id=$1`,
        [listing_id, toId],
    );
};

exports.getLeadResume = async ({ user, listing_id } = {}) => {
    if (!listing_id) throw { status: 400, message: 'listing_id is required' };
    const merchant_id = await resolveMerchantIdFromAuth(user);

    const client = await pool.connect();
    try {
        const listing = await getListingForMerchantTx(client, { listing_id, merchant_id, lock: false });
        const inspection = await getLatestInspectionTx(client, { listing_id });
        const pendingOffer = await getPendingOfferTx(client, { listing_id });
        const cancellation = await getLatestCancellationTx(client, { listing_id, inspection_id: inspection?.id ?? null });

        let answers_count = 0;
        if (inspection?.id) {
            const ansRes = await client.query(
                `SELECT COUNT(*)::int cnt FROM sell_listing_answers WHERE inspection_id=$1`,
                [inspection.id],
            );
            answers_count = ansRes.rows[0]?.cnt || 0;
        }

        const status = listing.status_slug;

        const next_actions = [];
        if (status === 'assigned') next_actions.push('PUT /api/merchant/leads/:id/status { status: "out_for_delivery" }');
        if (status === 'out_for_delivery') next_actions.push('POST /api/merchant/leads/:id/inspection');
        if (status === 'inspection_started') {
            next_actions.push('POST /api/merchant/requestOTP { listing_id, email? }');
            next_actions.push('POST /api/merchant/verifyOTP { id, otp, inspection_id }');
            next_actions.push('POST /api/merchant/leads/:id/answers (multipart) { inspection_id, answers }');
            next_actions.push('PUT /api/merchant/leads/:id/complete { inspection_id }');
        }
        if (status === 'inspection_complete') {
            next_actions.push('PUT /api/merchant/leads/:id/accept { inspection_id, final_amount? }');
            next_actions.push('POST /api/merchant/leads/:id/offer { inspection_id, amount }');
            next_actions.push('POST /api/merchant/leads/:id/cancel { inspection_id, reason, final_offered_price?, customer_expected_price? }');
        }
        if (status === 'renegotiating') {
            next_actions.push('Customer: PUT /api/merchant/leads/:id/offer/:offer_id { action: "accept"|"reject" }');
        }

        return {
            listing_id: listing.id,
            listing_status: listing.status_slug,
            listing_status_label: toTitle(listing.status_slug),
            inspection: inspection
                ? {
                    id: inspection.id,
                    agent_id: inspection.agent_id,
                    status: inspection.status_slug,
                    status_label: toTitle(inspection.status_slug),
                    otp_verified_at: inspection.otp_verified_at,
                    answers_count,
                }
                : null,
            pending_offer: pendingOffer
                ? {
                    id: pendingOffer.id,
                    amount: pendingOffer.amount,
                    status: pendingOffer.status_slug || 'pending',
                    status_label: toTitle(pendingOffer.status_slug || 'pending'),
                    inspection_id: pendingOffer.inspection_id,
                    created_at: pendingOffer.created_at,
                }
                : null,
            cancellation,
            next_actions,
        };
    } catch (error) {
        throw { status: error.status || 500, message: error.message, code: error.code, details: error.details, next_actions: error.next_actions };
    } finally {
        client.release();
    }
};

exports.updateLeadStatus = async ({ user, listing_id, status } = {}) => {
    if (!listing_id) throw { status: 400, message: 'listing_id is required' };
    if (!status) throw { status: 400, message: 'status is required' };

    const to = String(status).trim().toLowerCase();
    if (to !== 'out_for_delivery') {
        throw { status: 400, message: "Only status='out_for_delivery' is supported on this endpoint" };
    }
    const merchant_id = await resolveMerchantIdFromAuth(user);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const listing = await getListingForMerchantTx(client, { listing_id, merchant_id, lock: true });

        if (listing.status_slug === 'out_for_delivery') {
            await client.query('COMMIT');
            return {
                listing_id,
                from: 'out_for_delivery',
                to: 'out_for_delivery',
                message: 'Lead is already marked as Out For Delivery.',
            };
        }

        if (listing.status_slug !== 'assigned') {
            throw {
                status: 409,
                code: 'CANNOT_MARK_OUT_FOR_DELIVERY',
                message: `Can't mark this lead as Out For Delivery because its current status is ${toTitle(listing.status_slug)}.`,
                next_actions: ['Use GET /api/merchant/leads/:id/resume to see the next step'],
                details: { current_status: listing.status_slug },
            };
        }

        await transitionListingStatusTx(client, { listing_id, from: listing.status_slug, to });
        await client.query('COMMIT');
        return { listing_id, from: listing.status_slug, to };
    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: error.status || 500, message: error.message, code: error.code, details: error.details, next_actions: error.next_actions };
    } finally {
        client.release();
    }
};

exports.startInspection = async ({ user, listing_id } = {}) => {
    assertRole(user, 'agent');
    if (!listing_id) throw { status: 400, message: 'listing_id is required' };
    // console.log(user,listing_id);

    const merchant_id = await resolveMerchantIdFromAuth(user);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const listing = await getListingForMerchantTx(client, { listing_id, merchant_id, lock: true });

        // Idempotency: if inspection already started, return the existing active inspection.
        if (listing.status_slug === 'inspection_started') {
            const latest = await getLatestInspectionTx(client, { listing_id });
            if (latest && latest.status_slug === 'started') {
                await client.query('COMMIT');
                return {
                    already_started: true,
                    message: 'Inspection already started. Resuming the existing inspection.',
                    id: latest.id,
                    listing_id: latest.listing_id,
                    agent_id: latest.agent_id,
                    otp_verified_at: latest.otp_verified_at,
                    status: latest.status_slug,
                    created_at: latest.created_at,
                };
            }
            // If listing says inspection_started but we can't find a started inspection, create one.
        }

        if (listing.status_slug !== 'out_for_delivery' && listing.status_slug !== 'inspection_started') {
            throw {
                status: 409,
                code: 'INSPECTION_NOT_ALLOWED',
                message: `Can't start inspection right now because this lead is ${toTitle(listing.status_slug)}.`,
                next_actions: ['Use GET /api/merchant/leads/:id/resume to continue from the correct step'],
                details: { current_status: listing.status_slug },
            };
        }

        const startedStatusId = await resolveEnumId(client, INSPECTION_STATUS_MASTER, 'started');
        const insRes = await client.query(
            `INSERT INTO inspections(listing_id, agent_id, status)
             VALUES ($1,$2,$3)
             RETURNING id, listing_id, agent_id, otp_verified_at, status, created_at`,
            [listing_id, user.userId, startedStatusId],
        );

        if (listing.status_slug === 'out_for_delivery') {
            await transitionListingStatusTx(client, { listing_id, from: 'out_for_delivery', to: 'inspection_started' });
        }

        await client.query('COMMIT');
        return insRes.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: error.status || 500, message: error.message, code: error.code, details: error.details, next_actions: error.next_actions };
    } finally {
        client.release();
    }
};

exports.submitInspectionAnswers = async ({ user, listing_id, inspection_id, answers } = {}) => {
    // console.log('submitInspectionAnswers', { userId: user?.userId, listing_id, inspection_id, answers_count: Array.isArray(answers) ? answers.length : null });

    assertRole(user, 'agent');
    if (!listing_id) throw { status: 400, message: 'listing_id is required' };
    if (!inspection_id) throw { status: 400, message: 'inspection_id is required' };
    if (!Array.isArray(answers) || answers.length === 0) throw { status: 400, message: 'answers must be a non-empty array' };
    // if (!filesByField || typeof filesByField.get !== 'function') filesByField = new Map();

    const merchant_id = await resolveMerchantIdFromAuth(user);
    const { contextId, bothId } = await resolveQuestionContextIds('inspection');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const listing = await getListingForMerchantTx(client, { listing_id, merchant_id, lock: true });
        console.log('lier deva');
        if (listing.status_slug !== 'inspection_started') {
            throw {
                status: 409,
                code: 'ANSWERS_NOT_ALLOWED',
                message: `Can't submit inspection answers because this lead is ${toTitle(listing.status_slug)}.`,
                next_actions: ['Use GET /api/merchant/leads/:id/resume to continue from the correct step'],
                details: { current_status: listing.status_slug },
            };
        }

        const insRes = await client.query(
            `SELECT id, listing_id, agent_id, otp_verified_at
             FROM inspections
             WHERE id=$1 AND listing_id=$2
             FOR UPDATE`,
            [inspection_id, listing_id],
        );
        if (insRes.rowCount === 0) throw { status: 404, message: 'Inspection not found' };
        const inspection = insRes.rows[0];
        if (String(inspection.agent_id || '') !== String(user.userId)) throw { status: 403, message: 'Only the assigned agent can submit inspection answers' };
        if (!inspection.otp_verified_at) throw { status: 409, message: 'OTP must be verified before submitting answers' };

        const questionIds = [...new Set(
            answers
                .map(a => a?.question_id ?? a?.questionId)
                .filter(v => v != null)
                .map(v => Number(v))
                .filter(n => Number.isFinite(n))
        )];
        if (questionIds.length === 0) throw { status: 400, message: 'answers[].question_id is required' };

        const questionsRes = await client.query(
            `SELECT id, context
             FROM sell_questions
             WHERE id = ANY($1::bigint[])`,
            [questionIds],
        );
        if (questionsRes.rowCount !== questionIds.length) {
            throw { status: 400, message: 'One or more question_id values are invalid' };
        }
        const ctxByQuestionId = new Map(questionsRes.rows.map(r => [String(r.id), String(r.context)]));
        for (const qid of questionIds) {
            const qctx = ctxByQuestionId.get(String(qid));
            if (qctx !== String(contextId) && qctx !== String(bothId)) {
                throw { status: 400, message: `Question ${qid} not allowed for context=${'inspection'}` };
            }
        }

        for (const ans of answers) {
            const question_id = ans?.question_id ?? ans?.questionId;
            if (!question_id) throw { status: 400, message: 'Each answer requires question_id' };

            const options = ans?.options;
            if (!Array.isArray(options) || options.length === 0) {
                throw { status: 400, message: `Answer for question_id=${question_id} must include options[]` };
            }

            for (const opt of options) {
                const option_id = (opt && typeof opt === 'object')
                    ? (opt.option_id ?? opt.optionId ?? opt.id)
                    : opt;
                if (!option_id) throw { status: 400, message: `Missing option_id for question_id=${question_id}` };

                let answer_image_id = opt && typeof opt === 'object' && (opt.answer_image_id ?? opt.answerImageId) ? (opt.answer_image_id ?? opt.answerImageId)
                    : null;
                // const existingImageId = (opt && typeof opt === 'object')
                //     ? (opt.answer_image_id ?? opt.answerImageId ?? null)
                //     : null;
                // if (existingImageId != null) answer_image_id = existingImageId;

                // const field = (opt && typeof opt === 'object')
                //     ? (opt.file_field ?? opt.)
                //     : null;
                // const fieldCandidates = [
                //     field,
                //     `answer_image_${question_id}_${option_id}`,
                //     `answer_image_${option_id}`,
                // ].filter(Boolean);

                // const file = fieldCandidates
                //     .map(k => filesByField.get(String(k)))
                //     .find(Boolean);
                // if (file) {
                //     const uploaded = await insertImageFromUpload(client, { file, alt_text: `Inspection ${inspection_id} proof`, uploaded_by: user?.userId || null });
                //     answer_image_id = uploaded.id;
                // }

                await client.query(
                    `INSERT INTO sell_listing_answers(listing_id, inspection_id, question_id, option_id, answer_image_id)
                     VALUES ($1,$2,$3,$4,$5)
                     ON CONFLICT(inspection_id, question_id, option_id)
                     DO UPDATE SET answer_image_id=EXCLUDED.answer_image_id`,
                    [listing_id, inspection_id, question_id, option_id, answer_image_id],
                );
            }
        }

        // Recalculate quoted price from this inspection only
        const base_price = parseFloat(listing.base_price || 0);
        const dedRes = await client.query(
            `
            SELECT COALESCE(SUM(sqo.price_deduction), 0) total_deduction
            FROM sell_listing_answers sla
            JOIN sell_questions sq ON sq.id=sla.question_id
            JOIN sell_question_options sqo ON sqo.id=sla.option_id
            WHERE sla.listing_id=$1
              AND sla.inspection_id=$2
              AND (sq.context=$3 OR sq.context=$4)
            `,
            [listing_id, inspection_id, contextId, bothId],
        );
        const totalDeduction = parseFloat(dedRes.rows[0]?.total_deduction || 0);
        let quoted_price = base_price - (base_price * totalDeduction) / 100;
        if (quoted_price < 0) quoted_price = 0;

        await client.query(
            `UPDATE sell_listings
             SET quoted_price=$2, updated_at=NOW()
             WHERE id=$1`,
            [listing_id, quoted_price],
        );

        await client.query('COMMIT');
        return { listing_id, inspection_id, base_price, quoted_price };
    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: error.status || 500, message: error.message || 'Internal Server Error', code: error.code, details: error.details, next_actions: error.next_actions };
    } finally {
        client.release();
    }
};

exports.completeInspection = async ({ user, listing_id, inspection_id } = {}) => {
    assertRole(user, 'agent');
    if (!listing_id) throw { status: 400, message: 'listing_id is required' };
    if (!inspection_id) throw { status: 400, message: 'inspection_id is required' };

    const merchant_id = await resolveMerchantIdFromAuth(user);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const listing = await getListingForMerchantTx(client, { listing_id, merchant_id, lock: true });

        const insRes = await client.query(
            `SELECT i.id, i.agent_id, i.otp_verified_at, em.option_name status_slug
             FROM inspections i
             JOIN enum_master em ON i.status=em.id AND em.master_name='inspection_status'
             WHERE i.id=$1 AND listing_id=$2
             FOR UPDATE`,
            [inspection_id, listing_id],
        );
        if (insRes.rowCount === 0) throw { status: 404, message: 'Inspection not found' };
        if (String(insRes.rows[0].agent_id || '') !== String(user.userId)) throw { status: 403, message: 'Only the assigned agent can complete this inspection' };
        if (!insRes.rows[0].otp_verified_at) throw { status: 409, message: 'OTP must be verified before completing inspection' };

        // Idempotency: allow safe retries.
        if (listing.status_slug === 'inspection_complete' || insRes.rows[0].status_slug === 'completed') {
            const inspectionCompleteListingId = await resolveEnumId(client, LISTING_STATUS_MASTER, 'inspection_complete');
            await client.query(
                `UPDATE sell_listings SET status=$2, updated_at=NOW() WHERE id=$1`,
                [listing_id, inspectionCompleteListingId],
            );
            const completedStatusId = await resolveEnumId(client, INSPECTION_STATUS_MASTER, 'completed');
            await client.query(
                `UPDATE inspections SET status=$2, updated_at=NOW() WHERE id=$1`,
                [inspection_id, completedStatusId],
            );
            await client.query('COMMIT');
            return { listing_id, inspection_id, status: 'inspection_complete', message: 'Inspection is already completed.' };
        }

        if (listing.status_slug !== 'inspection_started') {
            throw {
                status: 409,
                code: 'COMPLETE_NOT_ALLOWED',
                message: `Can't complete inspection because this lead is ${toTitle(listing.status_slug)}.`,
                next_actions: ['Use GET /api/merchant/leads/:id/resume to continue from the correct step'],
                details: { current_status: listing.status_slug },
            };
        }

        const completedStatusId = await resolveEnumId(client, INSPECTION_STATUS_MASTER, 'completed');
        await client.query(
            `UPDATE inspections
             SET status=$2, updated_at=NOW()
             WHERE id=$1`,
            [inspection_id, completedStatusId],
        );

        await transitionListingStatusTx(client, { listing_id, from: 'inspection_started', to: 'inspection_complete' });
        await client.query('COMMIT');
        return { listing_id, inspection_id, status: 'inspection_complete' };
    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: error.status || 500, message: error.message, code: error.code, details: error.details, next_actions: error.next_actions };
    } finally {
        client.release();
    }
};

exports.cancelLead = async ({ user, listing_id, inspection_id, reason, final_offered_price, customer_expected_price } = {}) => {
    assertRole(user, 'agent');
    if (!listing_id) throw { status: 400, message: 'listing_id is required' };
    if (!inspection_id) throw { status: 400, message: 'inspection_id is required' };
    if (!reason) throw { status: 400, message: 'reason is required' };

    const merchant_id = await resolveMerchantIdFromAuth(user);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const listing = await getListingForMerchantTx(client, { listing_id, merchant_id, lock: true });

        if (listing.status_slug === 'cancelled') {
            const existing = await getLatestCancellationTx(client, { listing_id, inspection_id });
            await client.query('COMMIT');
            return { listing_id, inspection_id, status: 'cancelled', message: 'Lead is already cancelled.', cancellation: existing };
        }
        if (!['inspection_started', 'inspection_complete', 'renegotiating'].includes(listing.status_slug)) {
            throw {
                status: 409,
                code: 'CANCEL_NOT_ALLOWED',
                message: `Can't cancel this lead right now because it is ${toTitle(listing.status_slug)}.`,
                next_actions: ['Use GET /api/merchant/leads/:id/resume to see the next step'],
                details: { current_status: listing.status_slug },
            };
        }

        const insRes = await client.query(
            `SELECT id, agent_id
             FROM inspections
             WHERE id=$1 AND listing_id=$2
             FOR UPDATE`,
            [inspection_id, listing_id],
        );
        if (insRes.rowCount === 0) throw { status: 404, message: 'Inspection not found' };
        if (String(insRes.rows[0].agent_id || '') !== String(user.userId)) throw { status: 403, message: 'Only the assigned agent can cancel this lead' };

        // Idempotency: if a cancellation was already recorded for this inspection, return it.
        const existingCancellation = await client.query(
            `SELECT id
             FROM listing_cancellations
             WHERE listing_id=$1 AND inspection_id=$2
             ORDER BY created_at DESC
             LIMIT 1`,
            [listing_id, inspection_id],
        );
        if (existingCancellation.rowCount > 0) {
            const cancelledStatusId = await resolveEnumId(client, INSPECTION_STATUS_MASTER, 'cancelled');
            await client.query(`UPDATE inspections SET status=$2, updated_at=NOW() WHERE id=$1`, [inspection_id, cancelledStatusId]);
            const cancelledListingId = await resolveEnumId(client, LISTING_STATUS_MASTER, 'cancelled');
            await client.query(`UPDATE sell_listings SET status=$2, updated_at=NOW() WHERE id=$1`, [listing_id, cancelledListingId]);
            const existing = await getLatestCancellationTx(client, { listing_id, inspection_id });
            await client.query('COMMIT');
            return { listing_id, inspection_id, status: 'cancelled', message: 'Lead is already cancelled.', cancellation: existing };
        }

        await client.query(
            `INSERT INTO listing_cancellations(listing_id, inspection_id, cancelled_by, reason, final_offered_price, customer_expected_price)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
                listing_id,
                inspection_id,
                user.userId,
                String(reason),
                final_offered_price != null ? final_offered_price : null,
                customer_expected_price != null ? customer_expected_price : null,
            ],
        );

        const cancelledStatusId = await resolveEnumId(client, INSPECTION_STATUS_MASTER, 'cancelled');
        await client.query(
            `UPDATE inspections SET status=$2, updated_at=NOW() WHERE id=$1`,
            [inspection_id, cancelledStatusId],
        );

        const cancelledListingId = await resolveEnumId(client, LISTING_STATUS_MASTER, 'cancelled');
        await client.query(
            `UPDATE sell_listings SET status=$2, updated_at=NOW() WHERE id=$1`,
            [listing_id, cancelledListingId],
        );

        await client.query('COMMIT');
        return { listing_id, inspection_id, status: 'cancelled' };
    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: error.status || 500, message: error.message, code: error.code, details: error.details, next_actions: error.next_actions };
    } finally {
        client.release();
    }
};

exports.createOffer = async ({ user, listing_id, inspection_id, amount } = {}) => {
    assertRole(user, 'agent');
    if (!listing_id) throw { status: 400, message: 'listing_id is required' };
    if (!inspection_id) throw { status: 400, message: 'inspection_id is required' };
    if (amount == null) throw { status: 400, message: 'amount is required' };

    const merchant_id = await resolveMerchantIdFromAuth(user);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const listing = await getListingForMerchantTx(client, { listing_id, merchant_id, lock: true });

        // Idempotency: if an offer is already pending, return it.
        if (listing.status_slug === 'renegotiating') {
            const existing = await getPendingOfferTx(client, { listing_id });
            if (existing) {
                await client.query('COMMIT');
                return {
                    already_pending: true,
                    message: 'An offer is already pending for this lead.',
                    ...existing,
                };
            }
        }

        if (listing.status_slug !== 'inspection_complete') {
            throw {
                status: 409,
                code: 'OFFER_NOT_ALLOWED',
                message: `Can't create an offer because this lead is ${toTitle(listing.status_slug)}.`,
                next_actions: ['Use GET /api/merchant/leads/:id/resume to see the next step'],
                details: { current_status: listing.status_slug },
            };
        }

        const insRes = await client.query(
            `SELECT id, agent_id
             FROM inspections
             WHERE id=$1 AND listing_id=$2
             FOR UPDATE`,
            [inspection_id, listing_id],
        );
        if (insRes.rowCount === 0) throw { status: 404, message: 'Inspection not found' };
        if (String(insRes.rows[0].agent_id || '') !== String(user.userId)) throw { status: 403, message: 'Only the assigned agent can create an offer' };

        const pendingOfferStatusId = await resolveEnumId(client, OFFER_STATUS_MASTER, 'pending');
        const offerRes = await client.query(
            `INSERT INTO listing_offers(listing_id, inspection_id, offered_by, amount, status)
             VALUES ($1,$2,$3,$4,$5)
             RETURNING id, listing_id, inspection_id, offered_by, amount, status, created_at`,
            [listing_id, inspection_id, user.userId, amount, pendingOfferStatusId],
        );

        await transitionListingStatusTx(client, { listing_id, from: 'inspection_complete', to: 'renegotiating' });

        await client.query('COMMIT');
        return offerRes.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: error.status || 500, message: error.message, code: error.code, details: error.details, next_actions: error.next_actions };
    } finally {
        client.release();
    }
};

exports.respondToOffer = async ({ user, listing_id, offer_id, action } = {}) => {
    if (!user?.userId) throw { status: 401, message: 'Invalid session' };
    if (!listing_id) throw { status: 400, message: 'listing_id is required' };
    if (!offer_id) throw { status: 400, message: 'offer_id is required' };
    const normalized = String(action || '').trim().toLowerCase();
    if (!['accept', 'reject'].includes(normalized)) throw { status: 400, message: "action must be 'accept' or 'reject'" };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const listingRes = await client.query(
            `SELECT id, user_id, status, em.option_name status_slug
             FROM sell_listings sl
             LEFT JOIN enum_master em ON sl.status=em.id AND em.master_name='listing_status'
             WHERE sl.id=$1
             LIMIT 1
             FOR UPDATE`,
            [listing_id],
        );
        if (listingRes.rowCount === 0) throw { status: 404, message: 'Listing not found' };
        if (String(listingRes.rows[0].user_id || '') !== String(user.userId)) {
            throw { status: 403, message: 'Only the listing owner can accept/reject an offer' };
        }

        const offerRes = await client.query(
            `SELECT id, listing_id, amount, status
             FROM listing_offers
             WHERE id=$1 AND listing_id=$2
             FOR UPDATE`,
            [offer_id, listing_id],
        );
        if (offerRes.rowCount === 0) throw { status: 404, message: 'Offer not found' };

        const pendingOfferStatusId = await resolveEnumId(client, OFFER_STATUS_MASTER, 'pending');
        const acceptedOfferStatusId = await resolveEnumId(client, OFFER_STATUS_MASTER, 'accepted');
        const rejectedOfferStatusId = await resolveEnumId(client, OFFER_STATUS_MASTER, 'rejected');

        // Idempotency: safe retries for accept/reject.
        if (Number(offerRes.rows[0].status) === Number(acceptedOfferStatusId)) {
            await client.query('COMMIT');
            if (normalized === 'accept') return { listing_id, offer_id, action: 'accepted', status: 'completed', message: 'Offer already accepted.' };
            throw { status: 409, message: 'Offer was already accepted and cannot be rejected now.' };
        }
        if (Number(offerRes.rows[0].status) === Number(rejectedOfferStatusId)) {
            await client.query('COMMIT');
            if (normalized === 'reject') return { listing_id, offer_id, action: 'rejected', status: 'inspection_complete', message: 'Offer already rejected.' };
            throw { status: 409, message: 'Offer was already rejected. Ask the agent to create a new offer.' };
        }

        if (Number(offerRes.rows[0].status) !== Number(pendingOfferStatusId)) {
            throw { status: 409, message: 'Offer is not pending' };
        }

        if (normalized === 'accept') {
            await client.query(
                `UPDATE listing_offers SET status=$2, updated_at=NOW() WHERE id=$1`,
                [offer_id, acceptedOfferStatusId],
            );

            const completedListingId = await resolveEnumId(client, LISTING_STATUS_MASTER, 'completed');
            await client.query(
                `UPDATE sell_listings
                 SET quoted_price=$2, status=$3, updated_at=NOW()
                 WHERE id=$1`,
                [listing_id, offerRes.rows[0].amount, completedListingId],
            );

            await client.query('COMMIT');
            return { listing_id, offer_id, action: 'accepted', status: 'completed' };
        }

        // reject
        await client.query(
            `UPDATE listing_offers SET status=$2, updated_at=NOW() WHERE id=$1`,
            [offer_id, rejectedOfferStatusId],
        );

        const inspectionCompleteListingId = await resolveEnumId(client, LISTING_STATUS_MASTER, 'inspection_complete');
        await client.query(
            `UPDATE sell_listings SET status=$2, updated_at=NOW() WHERE id=$1`,
            [listing_id, inspectionCompleteListingId],
        );

        await client.query('COMMIT');
        return { listing_id, offer_id, action: 'rejected', status: 'inspection_complete' };
    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: error.status || 500, message: error.message, code: error.code, details: error.details, next_actions: error.next_actions };
    } finally {
        client.release();
    }
};

exports.acceptLeadAfterInspection = async ({ user, listing_id, inspection_id, final_amount } = {}) => {
    assertRole(user, 'agent');
    if (!listing_id) throw { status: 400, message: 'listing_id is required' };
    if (!inspection_id) throw { status: 400, message: 'inspection_id is required' };

    const merchant_id = await resolveMerchantIdFromAuth(user);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const listing = await getListingForMerchantTx(client, { listing_id, merchant_id, lock: true });

        if (listing.status_slug === 'completed') {
            await client.query('COMMIT');
            return { listing_id, inspection_id, status: 'completed', quoted_price: listing.quoted_price, message: 'Lead is already completed.' };
        }

        if (listing.status_slug !== 'inspection_complete') {
            throw {
                status: 409,
                code: 'ACCEPT_NOT_ALLOWED',
                message: `Can't accept this lead because it is ${toTitle(listing.status_slug)}.`,
                next_actions: ['Use GET /api/merchant/leads/:id/resume to see the next step'],
                details: { current_status: listing.status_slug },
            };
        }

        const insRes = await client.query(
            `SELECT id, agent_id
             FROM inspections
             WHERE id=$1 AND listing_id=$2
             FOR UPDATE`,
            [inspection_id, listing_id],
        );
        if (insRes.rowCount === 0) throw { status: 404, message: 'Inspection not found' };
        if (String(insRes.rows[0].agent_id || '') !== String(user.userId)) throw { status: 403, message: 'Only the assigned agent can accept this lead' };

        const completedListingId = await resolveEnumId(client, LISTING_STATUS_MASTER, 'completed');
        const qp = final_amount != null ? final_amount : listing.quoted_price;
        await client.query(
            `UPDATE sell_listings SET quoted_price=COALESCE($2, quoted_price), status=$3, updated_at=NOW() WHERE id=$1`,
            [listing_id, qp != null ? qp : null, completedListingId],
        );

        await client.query('COMMIT');
        return { listing_id, inspection_id, status: 'completed', quoted_price: qp };
    } catch (error) {
        await client.query('ROLLBACK');
        throw { status: error.status || 500, message: error.message, code: error.code, details: error.details, next_actions: error.next_actions };
    } finally {
        client.release();
    }
};

exports.postRequote = async ({ listing_id, answers, context } = {}) => {
    // Backwards-compat shim: allow old callers to submit via query-string JSON.
    let parsedAnswers = answers;
    if (typeof parsedAnswers === 'string') {
        try {
            parsedAnswers = JSON.parse(parsedAnswers);
        } catch {
            throw { status: 400, message: 'Invalid JSON in answers' };
        }
    }
    return {
        message: 'Use POST /api/merchant/requote/questions for submitting answers',
        listing_id: listing_id ?? null,
        context: context ?? null,
        answers: Array.isArray(parsedAnswers) ? parsedAnswers.length : null,
    };
}

exports.sendEmailOTP = async ({ link, email }) => {
    await sendEmail(
        email,
        "Verification Link from Resello",
        `Click this link to verify your account: ${link}. It expires in 48 hours.`,
        `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
    <h2 style="color: #333;">Registration Link</h2>
    <p>Use the following Link to verify your account. It expires in <b>48 hours</b>.</p>
    <h1 style="text-align: center; letter-spacing: 4px; color: #1a73e8;"> <a href="${link}" style="display:block;text-align:center;background:#1d4ed8;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-size:13px;font-weight:700;">Verify Agent →</a>
</h1>
    <p>If you did not request this, please ignore this email.</p>
    <hr>
    <p style="font-size: 12px; color: #888;">© 2026 Recello. All rights reserved.</p>
  </div>
  `
    );
}