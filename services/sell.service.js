const pool = require('../config/database');

const QUESTION_CONTEXT_MASTER = 'question_context';
const LISTING_STATUS_MASTER = 'listing_status';

const resolveEnumId = async (db, masterName, optionName) => {
    const res = await db.query(
        `SELECT id FROM enum_master WHERE master_name=$1 AND option_name=$2`,
        [masterName, optionName],
    );
    if (res.rowCount === 0) throw { status: 500, message: `Missing enum_master(${masterName}:${optionName})` };
    return res.rows[0].id;
};

const parseOptionalInt = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
};

const normalizeContextSlug = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim().toLowerCase();
    return s ? s : null;
};

const normalizeListingStatusSlug = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim().toLowerCase();
    if (!s) return null;
    return s === 'transferred' ? 'completed' : s;
};

const resolveQuestionContextId = async ({ context, context_id, context_slug } = {}) => {
    const explicitId = parseOptionalInt(context_id ?? (typeof context === 'number' ? context : null));
    if (explicitId != null) {
        const ok = await pool.query(
            `SELECT id, option_name FROM enum_master WHERE master_name=$1 AND id=$2`,
            [QUESTION_CONTEXT_MASTER, explicitId],
        );
        if (ok.rowCount === 0) throw { status: 400, message: 'Invalid context_id' };
        return ok.rows[0].id;
    }

    const slug = normalizeContextSlug(context_slug ?? (typeof context === 'string' ? context : null));
    if (!slug) return null;

    const res = await pool.query(
        `SELECT id, option_name FROM enum_master WHERE master_name=$1 AND option_name=$2`,
        [QUESTION_CONTEXT_MASTER, slug],
    );
    if (res.rowCount === 0) throw { status: 400, message: 'Invalid context' };
    return res.rows[0].id;
};

// ── Model Configs ─────────────────────────────────────────

exports.getModelConfigs = async ({ model_slug }) => {
    if (!model_slug) throw { status: 400, message: "Model Slug is required" };
    const result = await pool.query(
        `SELECT smc.id, model_id, smc.name, smc.base_price, smc.is_active
         FROM sell_model_configs smc
        JOIN models m ON smc.model_id=m.id
         WHERE m.slug=$1
         ORDER BY smc.id`,
        [model_slug]
    );
    return result.rows;
};

exports.createModelConfig = async ({ model_slug, name, base_price }) => {
    // const = data;
    if (!model_slug || !name || base_price == null) throw { status: 400, message: "model_slug, name and base_price are required" };

    const exists = await pool.query(
        `SELECT id FROM models WHERE slug=$1`, [model_slug]
    );
    if (exists.rowCount === 0) throw { status: 404, message: "Model not found" };
    const model_id = exists.rows[0].id;

    const dup = await pool.query(
        `SELECT 1 FROM sell_model_configs WHERE model_id=$1 AND name=$2`, [model_id, name]
    );
    if (dup.rowCount > 0) throw { status: 409, message: "Config with this name already exists for this model" };

    const result = await pool.query(
        `INSERT INTO sell_model_configs(model_id, name, base_price)
         VALUES ($1, $2, $3) RETURNING id, model_id, name, base_price, is_active`,
        [model_id, name, base_price]
    );
    return result.rows[0];
};

exports.updateModelConfig = async (id, data) => {
    const { name, base_price, is_active } = data;
    const result = await pool.query(
        `UPDATE sell_model_configs
         SET name=COALESCE($1, name),
             base_price=COALESCE($2, base_price),
             is_active=COALESCE($3, is_active)
         WHERE id=$4
         RETURNING id, model_id, name, base_price, is_active`,
        [name || null, base_price != null ? base_price : null, is_active != null ? is_active : null, id]
    );
    if (result.rowCount === 0) throw { status: 404, message: "Config not found" };
    return result.rows[0];
};

exports.deleteModelConfig = async (id) => {
    const result = await pool.query(
        `DELETE FROM sell_model_configs WHERE id=$1 RETURNING id, name`, [id]
    );
    if (result.rowCount === 0) throw { status: 404, message: "Config not found" };
    return result.rows[0];
};

// ── Sell Questions ────────────────────────────────────────

exports.getQuestions = async (query = {}) => {
    const contextId = await resolveQuestionContextId(query);
    console.log('devaa', contextId);

    // Ensure yes/no questions always have backing options in DB (idempotent backfill)
    await pool.query(
        `WITH missing AS (
            SELECT q.id
            FROM sell_questions q
            WHERE q.input_type = 'yes_no'
              AND q.is_active = true
              ${contextId != null ? 'AND q.context = $1' : ''}
              AND NOT EXISTS (
                SELECT 1 FROM sell_question_options o WHERE o.question_id = q.id
              )
        )
        INSERT INTO sell_question_options (question_id, text, price_deduction, sort_index)
        SELECT id, 'Yes', 0, 1 FROM missing
        UNION ALL
        SELECT id, 'No', 0, 2 FROM missing`,
        contextId != null ? [contextId] : []
    );

    const values = [];
    let where = `WHERE que.is_active=true`;
    if (contextId != null) {
        values.push(contextId);
        where += ` AND que.context=$${values.length}`;
    }

    const questions = await pool.query(
        `
            SELECT  que.id,
                    que.text,
                    que.description,
                    que.sort_index,
                    que.input_type,
                    que.context,
                    qctx.option_name context_label,
                        (
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'id', qo.id,
                                    'text', qo.text,
                                    'deduction', qo.price_deduction,
                                    'option_image_id', qo.option_image_id,
                                    'option_image_url', img.url,
                                    'show',
                                    COALESCE(
                                        (
                                            SELECT jsonb_agg(show_question_id)
                                            FROM sell_question_conditions WHERE trigger_option_id=qo.id
                                        ),'[]'::JSONB
                                    )
                                )
                                ORDER BY qo.id DESC
                            )
                            FROM sell_question_options qo
                            LEFT JOIN images img ON qo.option_image_id=img.id
                            WHERE qo.question_id = que.id
                        ) options,
                        (
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'id', cat.id,
                                    'name', cat.name
                                )
                            )
                            FROM sell_category_questions scq
                            JOIN categories cat ON scq.category_id=cat.id
                            WHERE scq.question_id=que.id
                        ) categories
            FROM sell_questions que
            LEFT JOIN enum_master qctx ON que.context=qctx.id AND qctx.master_name='question_context'
            ${where}
            ORDER BY que.sort_index, que.id
        `,
        values,
    );
    return questions.rows;
};

exports.getQuestionContexts = async () => {
    const result = await pool.query(
        `SELECT id, option_name, sort_index
         FROM enum_master
         WHERE master_name=$1
         ORDER BY sort_index, id`,
        [QUESTION_CONTEXT_MASTER],
    );
    return result.rows;
};

exports.uploadImage = async ({ file, alt_text, uploaded_by } = {}) => {
    if (!file?.filename) throw { status: 400, message: 'Image file is required (field: image)' };
    const res = await pool.query(
        `INSERT INTO images(url, alt_text, uploaded_by)
         VALUES ($1,$2,$3)
         RETURNING id, url, alt_text`,
        [file.filename, alt_text || null, uploaded_by || null],
    );
    return res.rows[0];
};
exports.getQuestionsByModel = async ({ modelSlug }) => {
    if (!modelSlug) throw { status: 400, message: "Model Slug is required" };
    const questions = await pool.query(
        `
            SELECT m.name model,jsonb_agg(
                jsonb_build_object(
                    'id', que.id,
                    'question', que.text,
                    'que_type', que.input_type,
                    'context', que.context,
                    'context_label', qctx.option_name,
                    'options',
                        (
                            SELECT jsonb_agg(
                                jsonb_build_object(
                                    'id', qo.id,
                                    'text', qo.text,
                                    'deduction', qo.price_deduction,
                                    'option_image_id', qo.option_image_id,
                                    'option_image_url', img.url,
                                    'show',
                                    COALESCE(
                                        (
                                            SELECT jsonb_agg(show_question_id)
                                            FROM sell_question_conditions WHERE trigger_option_id=qo.id
                                        ),'[]'::JSONB
                                    )
                                )
                                ORDER BY qo.price_deduction ASC, qo.text desc
                            )
                            FROM sell_question_options qo
                            LEFT JOIN images img ON qo.option_image_id=img.id
                            WHERE qo.question_id = que.id
                    )
                )
            ) questions FROM models m
            JOIN sell_category_questions cq ON cq.category_id=m.category_id
            JOIN sell_questions que ON que.id=cq.question_id
            LEFT JOIN enum_master qctx ON que.context=qctx.id AND qctx.master_name='question_context'
            WHERE m.slug=$1
            GROUP BY m.name
        `,
        [modelSlug]
    );
    return questions.rows;
};

exports.getQuestionsByCategory = async (category_id) => {
    if (!category_id) throw { status: 400, message: "Category ID is required" };
    const questions = await pool.query(
        `SELECT sq.id, sq.text, sq.description, sq.input_type, sq.sort_index, sq.is_active,
                sq.context, qctx.option_name context_label,
                scq.sort_index category_sort
         FROM sell_questions sq
         JOIN sell_category_questions scq ON sq.id=scq.question_id
         LEFT JOIN enum_master qctx ON sq.context=qctx.id AND qctx.master_name='question_context'
         WHERE scq.category_id=$1 AND sq.is_active=true
         ORDER BY scq.sort_index, sq.id`,
        [category_id]
    );

    for (const q of questions.rows) {
        const opts = await pool.query(
            `SELECT sqo.id, sqo.text, sqo.price_deduction, sqo.sort_index,
                    sqo.option_image_id, img.url option_image_url
             FROM sell_question_options sqo
             LEFT JOIN images img ON sqo.option_image_id=img.id
             WHERE question_id=$1
             ORDER BY sort_index, id`,
            [q.id]
        );
        q.options = opts.rows;
    }
    return questions.rows;
};

exports.createQuestion = async (data) => {
    console.log("Creating question with data:", data);
    const { text, description, input_type, sort_index, category_slugs } = data;
    if (!text || !input_type) throw { status: 400, message: "text and input_type are required" };

    const resolvedContextId = (await resolveQuestionContextId(data)) ?? 1;

    const validTypes = ['yes_no', 'single_select', 'multi_select'];
    if (!validTypes.includes(input_type)) throw { status: 400, message: "input_type must be one of: " + validTypes.join(', ') };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO sell_questions(text, description, input_type, context, sort_index)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, text, description, input_type, context, sort_index, is_active`,
            [text, description || null, input_type, resolvedContextId, sort_index || 1]
        );
        const question = result.rows[0];

        // If yes/no type, create the fixed options so deductions/conditions can work end-to-end.
        if (input_type === 'yes_no') {
            await client.query(
                `INSERT INTO sell_question_options(question_id, text, price_deduction, sort_index)
                 VALUES ($1, 'Yes', 0, 1), ($1, 'No', 0, 2)`,
                [question.id]
            );
        }

        let category_ids = [];
        if (category_slugs && category_slugs.length > 0) {
            for (let i = 0; i < category_slugs.length; i++) {
                const cat = await client.query(
                    `SELECT id FROM categories WHERE slug=$1`,
                    [category_slugs[i]]
                );
                if (cat.rowCount === 0) throw { status: 404, message: "Category not found" };
                category_ids.push(cat.rows[0].id);
                await client.query(
                    `INSERT INTO sell_category_questions(category_id, question_id, sort_index)
                     VALUES ($1, $2, $3)`,
                    [category_ids[i], question.id, i + 1]
                );
            }
        }

        await client.query('COMMIT');
        question.categories = category_ids || [];
        return question;
    } catch (e) {
        await client.query('ROLLBACK');
        throw { status: e.status || 500, message: e.message || "Failed to create question" };
    } finally {
        client.release();
    }
};

exports.updateQuestion = async (id, data) => {
    const { text, description, input_type, sort_index, is_active, category_slugs } = data;
    const contextId = await resolveQuestionContextId(data);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `UPDATE sell_questions
             SET text=COALESCE($1, text),
                 description=COALESCE($2, description),
                 input_type=COALESCE($3, input_type),
                 context=COALESCE($4, context),
                 sort_index=COALESCE($5, sort_index),
                 is_active=COALESCE($6, is_active)
             WHERE id=$7
             RETURNING id, text, description, input_type, context, sort_index, is_active`,
            [
                text || null,
                description !== undefined ? description : null,
                input_type || null,
                contextId,
                sort_index || null,
                is_active != null ? is_active : null,
                id,
            ]
        );
        if (result.rowCount === 0) throw { status: 404, message: "Question not found" };

        // Update category mappings if provided.
        if (Array.isArray(category_slugs)) {
            const normalized = category_slugs
                .map(s => String(s || '').trim())
                .filter(Boolean);

            await client.query(`DELETE FROM sell_category_questions WHERE question_id=$1`, [id]);

            for (let i = 0; i < normalized.length; i++) {
                const cat = await client.query(`SELECT id FROM categories WHERE slug=$1`, [normalized[i]]);
                if (cat.rowCount === 0) throw { status: 404, message: `Category not found: ${normalized[i]}` };
                await client.query(
                    `INSERT INTO sell_category_questions(category_id, question_id, sort_index)
                     VALUES ($1, $2, $3)` ,
                    [cat.rows[0].id, id, i + 1]
                );
            }
        }

        // If it is (or became) yes_no, ensure backing options exist.
        if ((result.rows[0].input_type || '').toLowerCase() === 'yes_no') {
            await client.query(
                `WITH missing AS (
                    SELECT $1::BIGINT AS question_id
                    WHERE NOT EXISTS (
                        SELECT 1 FROM sell_question_options o WHERE o.question_id = $1
                    )
                )
                INSERT INTO sell_question_options (question_id, text, price_deduction, sort_index)
                SELECT question_id, 'Yes', 0, 1 FROM missing
                UNION ALL
                SELECT question_id, 'No', 0, 2 FROM missing`,
                [id]
            );
        }

        await client.query('COMMIT');
        return result.rows[0];
    } catch (e) {
        await client.query('ROLLBACK');
        throw { status: e.status || 500, message: e.message || 'Failed to update question' };
    } finally {
        client.release();
    }
};

exports.deleteQuestion = async (id) => {
    const result = await pool.query(
        `delete from sell_questions  WHERE id=$1 RETURNING id, text`, [id]
    );
    // const result = await pool.query(
    //     `UPDATE sell_questions SET is_active=false WHERE id=$1 RETURNING id, text`, [id]
    // );
    if (result.rowCount === 0) throw { status: 404, message: "Question not found" };
    return result.rows[0];
};

// ── Question Options ──────────────────────────────────────

exports.getQuestionOptions = async (question_id) => {
    const result = await pool.query(
        `SELECT sqo.id, sqo.text, sqo.price_deduction, sqo.sort_index,
                sqo.option_image_id, img.url option_image_url
         FROM sell_question_options sqo
         LEFT JOIN images img ON sqo.option_image_id=img.id
         WHERE sqo.question_id=$1
         ORDER BY sqo.sort_index, sqo.id`,
        [question_id]
    );
    return result.rows;
};

exports.createQuestionOption = async (data) => {
    const { question_id, text, price_deduction, sort_index, option_image_id } = data;
    if (!question_id || !text) throw { status: 400, message: "question_id and text are required" };

    const qExists = await pool.query(`SELECT 1 FROM sell_questions WHERE id=$1`, [question_id]);
    if (qExists.rowCount === 0) throw { status: 404, message: "Question not found" };

    const result = await pool.query(
        `INSERT INTO sell_question_options(question_id, text, price_deduction, option_image_id, sort_index)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, text, price_deduction, option_image_id, sort_index`,
        [question_id, text, price_deduction || 0, option_image_id ?? null, sort_index || 1]
    );
    return result.rows[0];
};

exports.updateQuestionOption = async (id, data) => {
    const { text, price_deduction, sort_index, option_image_id } = data;
    const hasOptionImageId = Object.prototype.hasOwnProperty.call(data || {}, 'option_image_id');
    const result = await pool.query(
        `UPDATE sell_question_options
         SET text=COALESCE($1, text),
             price_deduction=COALESCE($2, price_deduction),
             option_image_id=CASE WHEN $3 THEN $4 ELSE option_image_id END,
             sort_index=COALESCE($5, sort_index)
         WHERE id=$6
         RETURNING id, text, price_deduction, option_image_id, sort_index`,
        [
            text || null,
            price_deduction != null ? price_deduction : null,
            hasOptionImageId,
            hasOptionImageId ? (option_image_id ?? null) : null,
            sort_index || null,
            id,
        ]
    );
    if (result.rowCount === 0) throw { status: 404, message: "Option not found" };
    return result.rows[0];
};

exports.deleteQuestionOption = async (id) => {
    const result = await pool.query(
        `DELETE FROM sell_question_options WHERE id=$1 RETURNING id, text`, [id]
    );
    if (result.rowCount === 0) throw { status: 404, message: "Option not found" };
    return result.rows[0];
};

// ── Question Conditions ───────────────────────────────────

exports.getConditions = async (question_id) => {
    const result = await pool.query(
        `SELECT sqc.id, sqc.trigger_option_id, sqo.text trigger_option_text,
                sqc.show_question_id, sq.text show_question_text
         FROM sell_question_conditions sqc
         JOIN sell_question_options sqo ON sqc.trigger_option_id=sqo.id
         JOIN sell_questions sq ON sqc.show_question_id=sq.id
         WHERE sqo.question_id=$1
         ORDER BY sqc.id`,
        [question_id]
    );
    return result.rows;
};

exports.createCondition = async (data) => {
    console.log("Creating condition with data:", data);
    const { trigger_option_id, show_question_id } = data;
    if (!trigger_option_id || !show_question_id) throw { status: 400, message: "trigger_option_id and show_question_id are required" };

    const optExists = await pool.query(`SELECT 1 FROM sell_question_options WHERE id=$1`, [trigger_option_id]);
    if (optExists.rowCount === 0) throw { status: 404, message: "Trigger option not found" };

    const qExists = await pool.query(`SELECT 1 FROM sell_questions WHERE id=$1`, [show_question_id]);
    if (qExists.rowCount === 0) throw { status: 404, message: "Target question not found" };

    const dup = await pool.query(
        `SELECT 1 FROM sell_question_conditions WHERE trigger_option_id=$1 AND show_question_id=$2`,
        [trigger_option_id, show_question_id]
    );
    if (dup.rowCount > 0) throw { status: 409, message: "This condition already exists" };

    const result = await pool.query(
        `INSERT INTO sell_question_conditions(trigger_option_id, show_question_id)
         VALUES ($1, $2)
         RETURNING id, trigger_option_id, show_question_id`,
        [trigger_option_id, show_question_id]
    );
    return result.rows[0];
};

exports.deleteCondition = async (id) => {
    const result = await pool.query(
        `DELETE FROM sell_question_conditions WHERE id=$1 RETURNING id`, [id]
    );
    if (result.rowCount === 0) throw { status: 404, message: "Condition not found" };
    return result.rows[0];
};

// ── Category-Question Mapping ─────────────────────────────

exports.getCategoryQuestions = async (category_id) => {
    const result = await pool.query(
        `SELECT sq.id, sq.text, sq.input_type, sq.sort_index, scq.sort_index category_sort
         FROM sell_category_questions scq
         JOIN sell_questions sq ON scq.question_id=sq.id
         WHERE scq.category_id=$1 AND sq.is_active=true
         ORDER BY scq.sort_index`,
        [category_id]
    );
    return result.rows;
};

exports.mapQuestionToCategory = async (data) => {
    const { category_slug, question_id, sort_index } = data;
    if (!category_slug || !question_id) throw { status: 400, message: "category_slug and question_id are required" };

    const category = await pool.query(
        `SELECT id FROM categories WHERE slug=$1`,
        [category_slug]
    );
    if (category.rowCount === 0) throw { status: 404, message: "Category not found" };
    const category_id = category.rows[0].id;

    const dup = await pool.query(
        `SELECT 1 FROM sell_category_questions WHERE category_id=$1 AND question_id=$2`,
        [category_id, question_id]
    );
    if (dup.rowCount > 0) throw { status: 409, message: "Question already mapped to this category" };

    const result = await pool.query(
        `INSERT INTO sell_category_questions(category_id, question_id, sort_index)
         VALUES ($1, $2, $3) RETURNING category_id, question_id, sort_index`,
        [category_id, question_id, sort_index || 1]
    );
    return result.rows[0];
};

exports.unmapQuestionFromCategory = async (category_id, question_id) => {
    const result = await pool.query(
        `DELETE FROM sell_category_questions WHERE category_id=$1 AND question_id=$2
         RETURNING category_id, question_id`,
        [category_id, question_id]
    );
    if (result.rowCount === 0) throw { status: 404, message: "Mapping not found" };
    return result.rows[0];
};

// ── Sell Flow: Questions with Conditions for a Category ─────

exports.getQuestionsByCategorySlug = async (category_slug, query = {}) => {
    if (!category_slug) throw { status: 400, message: "category_slug is required" };

    const requestedContextId = await resolveQuestionContextId(query);
    let flowContextIds = null; // null => no context filter
    if (requestedContextId != null) {
        const ctxRes = await pool.query(
            `SELECT option_name FROM enum_master WHERE master_name=$1 AND id=$2`,
            [QUESTION_CONTEXT_MASTER, requestedContextId],
        );
        if (ctxRes.rowCount === 0) throw { status: 400, message: 'Invalid context' };
        const ctx = String(ctxRes.rows[0].option_name || '').toLowerCase();
        if (ctx === 'sell' || ctx === 'inspection') {
            const bothRes = await pool.query(
                `SELECT id FROM enum_master WHERE master_name=$1 AND option_name='both'`,
                [QUESTION_CONTEXT_MASTER],
            );
            const bothId = bothRes.rowCount ? bothRes.rows[0].id : null;
            flowContextIds = bothId != null ? [requestedContextId, bothId] : [requestedContextId];
        } else {
            flowContextIds = [requestedContextId];
        }
    }

    const catRes = await pool.query(`SELECT id FROM categories WHERE slug=$1`, [category_slug]);
    if (catRes.rowCount === 0) throw { status: 404, message: "Category not found" };
    const category_id = catRes.rows[0].id;

    // Ensure yes/no questions used in sell flow have options (idempotent backfill)
    {
        const values = [category_id];
        let contextClause = '';
        if (flowContextIds && flowContextIds.length > 0) {
            values.push(flowContextIds);
            contextClause = ` AND sq.context = ANY($${values.length}::INT[])`;
        }

        await pool.query(
            `WITH missing AS (
                SELECT sq.id
                FROM sell_questions sq
                JOIN sell_category_questions scq ON scq.question_id = sq.id
                WHERE scq.category_id = $1
                  AND sq.is_active = true
                  AND sq.input_type = 'yes_no'
                  ${contextClause}
                  AND NOT EXISTS (
                    SELECT 1 FROM sell_question_options o WHERE o.question_id = sq.id
                  )
            )
            INSERT INTO sell_question_options (question_id, text, price_deduction, sort_index)
            SELECT id, 'Yes', 0, 1 FROM missing
            UNION ALL
            SELECT id, 'No', 0, 2 FROM missing`,
            values,
        );
    }

    // Get top-level questions for this category
    {
        const values = [category_id];
        let contextClause = '';
        if (flowContextIds && flowContextIds.length > 0) {
            values.push(flowContextIds);
            contextClause = ` AND sq.context = ANY($${values.length}::INT[])`;
        }

        var questions = await pool.query(
            `SELECT sq.id, sq.text, sq.description, sq.input_type, sq.sort_index,
                    sq.context, qctx.option_name context_label
             FROM sell_questions sq
             JOIN sell_category_questions scq ON sq.id=scq.question_id
             LEFT JOIN enum_master qctx ON sq.context=qctx.id AND qctx.master_name='question_context'
             WHERE scq.category_id=$1 AND sq.is_active=true
             ${contextClause}
             ORDER BY scq.sort_index, sq.id`,
            values,
        );
    }

    // For each question get options + conditions
    for (const q of questions.rows) {
        const opts = await pool.query(
            `SELECT sqo.id, sqo.text, sqo.price_deduction, sqo.sort_index,
                    sqo.option_image_id, img.url option_image_url
             FROM sell_question_options sqo
             LEFT JOIN images img ON sqo.option_image_id=img.id
             WHERE sqo.question_id=$1
             ORDER BY sqo.sort_index, sqo.id`,
            [q.id]
        );
        q.options = opts.rows;

        // For each option, check if it triggers another question
        for (const opt of q.options) {
            const conds = await pool.query(
                `SELECT sqc.show_question_id
                 FROM sell_question_conditions sqc
                 WHERE sqc.trigger_option_id=$1`,
                [opt.id]
            );
            opt.triggers = conds.rows.map(c => c.show_question_id);
        }
    }

    // Also gather all conditionally-shown questions (not in the category mapping but referenced via conditions)
    const condQuestionIds = new Set();
    for (const q of questions.rows) {
        for (const opt of q.options) {
            for (const tId of opt.triggers) {
                condQuestionIds.add(tId);
            }
        }
    }
    // Remove any that are already top-level
    const topIds = new Set(questions.rows.map(q => q.id));
    const extraIds = [...condQuestionIds].filter(id => !topIds.has(id));

    const conditionalQuestions = [];
    for (const qId of extraIds) {
        {
            const values = [qId];
            let contextClause = '';
            if (flowContextIds && flowContextIds.length > 0) {
                values.push(flowContextIds);
                contextClause = ` AND context = ANY($${values.length}::INT[])`;
            }

            var qRes = await pool.query(
                `SELECT sq.id, sq.text, sq.description, sq.input_type, sq.sort_index,
                        sq.context, qctx.option_name context_label
                 FROM sell_questions sq
                 LEFT JOIN enum_master qctx ON sq.context=qctx.id AND qctx.master_name='question_context'
                 WHERE sq.id=$1 AND sq.is_active=true
                 ${contextClause}`,
                values,
            );
        }
        if (qRes.rowCount === 0) continue;
        const cq = qRes.rows[0];
        const opts = await pool.query(
            `SELECT sqo.id, sqo.text, sqo.price_deduction, sqo.sort_index,
                    sqo.option_image_id, img.url option_image_url
             FROM sell_question_options sqo
             LEFT JOIN images img ON sqo.option_image_id=img.id
             WHERE sqo.question_id=$1
             ORDER BY sqo.sort_index, sqo.id`,
            [cq.id]
        );
        cq.options = opts.rows;
        for (const opt of cq.options) {
            const conds = await pool.query(
                `SELECT sqc.show_question_id FROM sell_question_conditions sqc WHERE sqc.trigger_option_id=$1`,
                [opt.id]
            );
            opt.triggers = conds.rows.map(c => c.show_question_id);
        }
        conditionalQuestions.push(cq);
    }

    return {
        category_id,
        questions: questions.rows,           // top-level questions shown by default
        conditional_questions: conditionalQuestions  // shown only when triggered
    };
};

// ── Calculate Sell Price ─────────────────────────────────────

exports.calculateSellPrice = async (data) => {
    const { config_id, answers } = data;
    // answers = [{ question_id, option_id }, ...]

    if (!config_id) throw { status: 400, message: "config_id is required" };
    if (!answers || !Array.isArray(answers) || answers.length === 0)
        throw { status: 400, message: "answers array is required" };

    // Get base price from config
    const configRes = await pool.query(
        `SELECT base_price FROM sell_model_configs WHERE id=$1 AND is_active=true`,
        [config_id]
    );
    if (configRes.rowCount === 0) throw { status: 404, message: "Config not found" };

    const basePrice = parseFloat(configRes.rows[0].base_price);
    let finalPrice = basePrice;

    // Sum up flat deductions from selected options
    for (const ans of answers) {
        const optRes = await pool.query(
            `SELECT price_deduction FROM sell_question_options WHERE id=$1 AND question_id=$2`,
            [ans.option_id, ans.question_id]
        );
        if (optRes.rowCount > 0) {
            finalPrice -= parseFloat(optRes.rows[0].price_deduction);
        }
    }

    if (finalPrice < 0) finalPrice = 0;

    return {
        base_price: basePrice,
        total_deduction: basePrice - finalPrice,
        quoted_price: finalPrice
    };
};

// ── Create Sell Listing ──────────────────────────────────────

exports.createSellListing = async (data) => {
    // console.log("Creating sell listing with data:", data);
    const { user_id, category_slug, brand_slug, model_slug, config_id, answers, expected_price } = data;

    if (!model_slug || !config_id || !answers || !expected_price || answers.length === 0)
        throw { status: 400, message: "model_slug, config_id, answers, and expected_price are required" };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const pendingStatusId = await resolveEnumId(client, LISTING_STATUS_MASTER, 'pending');
        console.log('radha', pendingStatusId)
        // Resolve IDs
        const modelRes = await client.query(
            `SELECT m.id model_id, m.brand_id, m.category_id
             FROM models m WHERE m.slug=$1`,
            [model_slug]
        );
        if (modelRes.rowCount === 0) throw { status: 404, message: "Model not found" };
        const { model_id, brand_id, category_id } = modelRes.rows[0];

        // Calculate quoted price from answers
        const configRes = await client.query(
            `SELECT base_price FROM sell_model_configs WHERE id=$1 AND is_active=true`,
            [config_id]
        );
        if (configRes.rowCount === 0) throw { status: 404, message: "Config not found" };

        let base_price = parseFloat(configRes.rows[0].base_price);
        // console.log("Base price from config:", base_price);
        let quoted_price = base_price;
        // console.log("quoted price", quoted_price)
        // Each price_deduction is a flat amount to subtract
        for (const ans of answers) {
            for (const opt of ans.options) {
                const optionId = (opt && typeof opt === 'object')
                    ? (opt.option_id ?? opt.optionId ?? opt.id)
                    : opt;
                const optRes = await client.query(
                    `SELECT price_deduction FROM sell_question_options WHERE id=$1 AND question_id=$2`,
                    [optionId, ans.question_id]
                );
                // console.log("deva", ans, opt, optRes.rows);
                if (optRes.rowCount > 0) {
                    quoted_price -= (base_price * parseFloat(optRes.rows[0].price_deduction)) / 100;
                }
            }
        }
        // console.log('rizz_quoted_price', quoted_price)
        if (quoted_price < 0) quoted_price = 0;

        // Insert listing
        const listingRes = await client.query(
            `INSERT INTO sell_listings(user_id, category_id, brand_id, model_id, config_id, base_price, quoted_price, expected_price, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [user_id || null, category_id, brand_id, model_id, config_id, base_price, quoted_price, expected_price, pendingStatusId]
        );
        const listing_id = listingRes.rows[0].id;

        // Insert answers
        for (const ans of answers) {
            for (const opt of ans.options) {
                const optionId = (opt && typeof opt === 'object')
                    ? (opt.option_id ?? opt.optionId ?? opt.id)
                    : opt;
                const answerImageId = (opt && typeof opt === 'object')
                    ? (opt.answer_image_id ?? opt.answerImageId ?? null)
                    : null;
                await client.query(
                    `INSERT INTO sell_listing_answers(listing_id, question_id, option_id, answer_image_id)
                     VALUES ($1, $2, $3, $4)`,
                    [listing_id, ans.question_id, optionId, answerImageId]
                );
            }
        }

        await client.query('COMMIT');
        return { id: listing_id, base_price, quoted_price, expected_price, status: 'pending' };
    } catch (e) {
        await client.query('ROLLBACK');
        throw { status: e.status || 500, message: e.message || "Failed to create listing" };
    } finally {
        client.release();
    }
};

// ── Get Sell Listings (Leads) ────────────────────────────────

exports.getListings = async ({ status }) => {
    const client = await pool.connect();
    const values = [];
    let whereClause = "WHERE 1=1";

    try {
        if (status) {
            const normalizedStatus = normalizeListingStatusSlug(status);
            const actualStatus = await resolveEnumId(client, LISTING_STATUS_MASTER, normalizedStatus);
            values.push(actualStatus);
            whereClause += ` AND sl.status=$${values.length}`;
        }
        const result = await client.query(`
        SELECT sl.id, sl.base_price, sl.quoted_price, sl.expected_price,
               sl.created_at, sl.updated_at,
               em.option_name status_label,
               u.email user_email,
               u.phone user_phone,
               up.first_name, up.last_name,
               c.name category, b.name brand, m.name model,
               smc.name config_name,
               mu.email merchant_email,
               mup.first_name merchant_first_name, mup.last_name merchant_last_name
        FROM sell_listings sl
        JOIN enum_master em ON sl.status=em.id AND em.master_name='listing_status'
        LEFT JOIN users u ON sl.user_id=u.id
        LEFT JOIN user_profile up ON u.id=up.user_id
        LEFT JOIN categories c ON sl.category_id=c.id
        LEFT JOIN brands b ON sl.brand_id=b.id
        LEFT JOIN models m ON sl.model_id=m.id
        LEFT JOIN sell_model_configs smc ON sl.config_id=smc.id
        LEFT JOIN users mu ON sl.assigned_merchant_id=mu.id
        LEFT JOIN user_profile mup ON mu.id=mup.user_id
        ${whereClause}
        ORDER BY sl.created_at DESC
    `, values);
        return result.rows;
    } catch (error) {
        throw { status: error.status, message: error.message }
    } finally {
        client.release();
    }

};

// ── Get Sell Listing Details (Lead Details) ─────────────────

exports.getListingDetails = async (listing_id) => {
    if (!listing_id) throw { status: 400, message: 'listing_id is required' };

    const listingRes = await pool.query(
        `
        SELECT sl.id, sl.user_id, sl.category_id, sl.brand_id, sl.model_id, sl.config_id,
               sl.base_price, sl.quoted_price, sl.expected_price,
               sl.status, em.option_name status_label,
               sl.assigned_merchant_id,
               sl.created_at, sl.updated_at,

               u.email user_email, u.phone user_phone,
               up.first_name user_first_name, up.last_name user_last_name, up.avatar_url user_avatar_url,

               c.name category_name, c.slug category_slug,
               b.name brand_name, b.slug brand_slug,
               ms.name series_name, ms.slug series_slug,
               m.name model_name, m.slug model_slug,

               smc.name config_name, smc.base_price config_base_price, smc.is_active config_is_active,

               mu.email merchant_email,
               mup.first_name merchant_first_name, mup.last_name merchant_last_name, mup.avatar_url merchant_avatar_url
        FROM sell_listings sl
        LEFT JOIN enum_master em ON sl.status=em.id AND em.master_name='listing_status'
        LEFT JOIN users u ON sl.user_id=u.id
        LEFT JOIN user_profile up ON u.id=up.user_id
        LEFT JOIN categories c ON sl.category_id=c.id
        LEFT JOIN brands b ON sl.brand_id=b.id
        LEFT JOIN models m ON sl.model_id=m.id
        LEFT JOIN model_series ms ON m.series_id=ms.id
        LEFT JOIN sell_model_configs smc ON sl.config_id=smc.id
        LEFT JOIN users mu ON sl.assigned_merchant_id=mu.id
        LEFT JOIN user_profile mup ON mu.id=mup.user_id
        WHERE sl.id=$1
        LIMIT 1
        `,
        [listing_id],
    );
    if (listingRes.rowCount === 0) throw { status: 404, message: 'Listing not found' };
    const listingRow = listingRes.rows[0];

    const answersRes = await pool.query(
        `
        SELECT sla.question_id,
               sq.text question_text,
               sq.description question_description,
               sq.input_type,
               sq.sort_index,
               sla.option_id,
               sqo.text option_text,
               sqo.price_deduction option_price_deduction,
               sqo.sort_index option_sort_index,
               sqo.option_image_id option_image_id,
               oi.url option_image_url,
               sla.answer_image_id answer_image_id,
               ai.url answer_image_url
        FROM sell_listing_answers sla
        JOIN sell_questions sq ON sq.id=sla.question_id
        JOIN sell_question_options sqo ON sqo.id=sla.option_id
        LEFT JOIN images oi ON sqo.option_image_id=oi.id
        LEFT JOIN images ai ON sla.answer_image_id=ai.id
        WHERE sla.listing_id=$1
          AND sla.inspection_id IS NULL
        ORDER BY sq.sort_index, sq.id, sqo.sort_index, sqo.id
        `,
        [listing_id],
    );

    const pickupRes = await pool.query(
        `
        SELECT sp.id pickup_id,
               sp.pickup_date, sp.pickup_slot_start, sp.pickup_slot_end,
               sp.status pickup_status, pem.option_name pickup_status_label,
               sp.assigned_agent_id, sp.notes,
               sp.created_at pickup_created_at, sp.updated_at pickup_updated_at,

               a.id address_id,
               a.name address_name, a.phone address_phone,
               a.line1, a.line2, a.city, a.state, a.pincode, a.country,
               a.is_default
        FROM sell_pickups sp
        LEFT JOIN enum_master pem ON sp.status=pem.id AND pem.master_name='pickup_status'
        LEFT JOIN addresses a ON sp.address_id=a.id
        WHERE sp.listing_id=$1
        ORDER BY sp.created_at DESC
        LIMIT 1
        `,
        [listing_id],
    );
    const pickupRow = pickupRes.rows[0] || null;

    const answersByQuestion = new Map();
    for (const r of answersRes.rows) {
        const key = String(r.question_id);
        if (!answersByQuestion.has(key)) {
            answersByQuestion.set(key, {
                question_id: r.question_id,
                text: r.question_text,
                description: r.question_description,
                input_type: r.input_type,
                sort_index: r.sort_index,
                options: [],
            });
        }
        answersByQuestion.get(key).options.push({
            option_id: r.option_id,
            text: r.option_text,
            price_deduction: r.option_price_deduction,
            sort_index: r.option_sort_index,
            option_image_id: r.option_image_id,
            option_image_url: r.option_image_url,
            answer_image_id: r.answer_image_id,
            answer_image_url: r.answer_image_url,
        });
    }

    return {
        listing: {
            id: listingRow.id,
            status: listingRow.status,
            status_label: listingRow.status_label,
            base_price: listingRow.base_price,
            quoted_price: listingRow.quoted_price,
            expected_price: listingRow.expected_price,
            created_at: listingRow.created_at,
            updated_at: listingRow.updated_at,
        },
        user: {
            id: listingRow.user_id,
            email: listingRow.user_email,
            phone: listingRow.user_phone,
            first_name: listingRow.user_first_name,
            last_name: listingRow.user_last_name,
            avatar_url: listingRow.user_avatar_url,
        },
        merchant: listingRow.assigned_merchant_id
            ? {
                id: listingRow.assigned_merchant_id,
                email: listingRow.merchant_email,
                first_name: listingRow.merchant_first_name,
                last_name: listingRow.merchant_last_name,
                avatar_url: listingRow.merchant_avatar_url,
            }
            : null,
        category: {
            id: listingRow.category_id,
            name: listingRow.category_name,
            slug: listingRow.category_slug,
        },
        brand: {
            id: listingRow.brand_id,
            name: listingRow.brand_name,
            slug: listingRow.brand_slug,
        },
        series: {
            name: listingRow.series_name,
            slug: listingRow.series_slug,
        },
        model: {
            id: listingRow.model_id,
            name: listingRow.model_name,
            slug: listingRow.model_slug,
        },
        config: listingRow.config_id
            ? {
                id: listingRow.config_id,
                name: listingRow.config_name,
                base_price: listingRow.config_base_price,
                is_active: listingRow.config_is_active,
            }
            : null,
        pickup: pickupRow
            ? {
                id: pickupRow.pickup_id,
                pickup_date: pickupRow.pickup_date,
                pickup_slot_start: pickupRow.pickup_slot_start,
                pickup_slot_end: pickupRow.pickup_slot_end,
                status: pickupRow.pickup_status,
                status_label: pickupRow.pickup_status_label,
                assigned_agent_id: pickupRow.assigned_agent_id,
                notes: pickupRow.notes,
                created_at: pickupRow.pickup_created_at,
                updated_at: pickupRow.pickup_updated_at,
                address: pickupRow.address_id
                    ? {
                        id: pickupRow.address_id,
                        name: pickupRow.address_name,
                        phone: pickupRow.address_phone,
                        line1: pickupRow.line1,
                        line2: pickupRow.line2,
                        city: pickupRow.city,
                        state: pickupRow.state,
                        pincode: pickupRow.pincode,
                        country: pickupRow.country,
                        is_default: pickupRow.is_default,
                    }
                    : null,
            }
            : null,
        answers: Array.from(answersByQuestion.values()),
    };
};

// ── Listing Offers (customer view) ─────────────────────────

exports.getListingOffers = async ({ listing_id, user } = {}) => {
    if (!listing_id) throw { status: 400, message: 'listing_id is required' };
    if (!user?.userId) throw { status: 401, message: 'Invalid session' };

    const own = await pool.query(
        `SELECT user_id FROM sell_listings WHERE id=$1`,
        [listing_id],
    );
    if (own.rowCount === 0) throw { status: 404, message: 'Listing not found' };
    if (String(own.rows[0].user_id || '') !== String(user.userId)) {
        throw { status: 403, message: 'Access denied' };
    }

    const res = await pool.query(
        `
        SELECT lo.id,
               lo.listing_id,
               lo.inspection_id,
               lo.amount,
               lo.status,
               em.option_name status_label,
               lo.created_at,
               lo.updated_at
        FROM listing_offers lo
        LEFT JOIN enum_master em ON lo.status=em.id AND em.master_name='offer_status'
        WHERE lo.listing_id=$1
        ORDER BY lo.created_at DESC, lo.id DESC
        `,
        [listing_id],
    );
    return res.rows;
};

// ── Assign Listing to Merchant ───────────────────────────────

exports.assignListing = async (listing_id, merchant_id) => {
    if (!listing_id || !merchant_id)
        throw { status: 400, message: "listing_id and merchant_id are required" };

    // Verify merchant has merchant role
    const merchantCheck = await pool.query(
        `SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id=r.id
         WHERE ur.user_id=$1 AND r.name='merchant'`,
        [merchant_id]
    );
    if (merchantCheck.rowCount === 0)
        throw { status: 400, message: "User is not a merchant" };

    const result = await pool.query(
        `WITH pending AS (
            SELECT id FROM enum_master WHERE master_name='listing_status' AND option_name='pending'
         ), assigned AS (
            SELECT id FROM enum_master WHERE master_name='listing_status' AND option_name='assigned'
         )
         UPDATE sell_listings
         SET assigned_merchant_id=$1, status=(SELECT id FROM assigned), updated_at=NOW()
         WHERE id=$2 AND status=(SELECT id FROM pending)
         RETURNING id`,
        [merchant_id, listing_id]
    );
    // await pool.query(`UPDATE sell_pickups SET status=2, assigned_agent_id=$2, updated_at=NOW() WHERE listing_id=$1`, [listing_id, merchant_id]);

    if (result.rowCount === 0) throw { status: 404, message: "Listing not found or not in pending status" };
    return result.rows[0];
};

// ── Transfer Listing (mark as completed) ─────────────────────

exports.transferListing = async (listing_id) => {
    if (!listing_id) throw { status: 400, message: "listing_id is required" };
    const result = await pool.query(
        `WITH assigned AS (
            SELECT id FROM enum_master WHERE master_name='listing_status' AND option_name='assigned'
            ), completed AS (
                SELECT id FROM enum_master WHERE master_name='listing_status' AND option_name='completed'
         )
            UPDATE sell_listings SET status=(SELECT id FROM completed), updated_at=NOW()
         WHERE id=$1 AND status=(SELECT id FROM assigned)
         RETURNING id`,
        [listing_id]
    );
    if (result.rowCount === 0) throw { status: 404, message: "Listing not found or not in assigned status" };
    return result.rows[0];
};

// ── Cancel Listing ───────────────────────────────────────────

exports.cancelListing = async (listing_id) => {
    if (!listing_id) throw { status: 400, message: "listing_id is required" };
    const result = await pool.query(
        `WITH pending AS (
            SELECT id FROM enum_master WHERE master_name='listing_status' AND option_name='pending'
         ), assigned AS (
            SELECT id FROM enum_master WHERE master_name='listing_status' AND option_name='assigned'
         ), cancelled AS (
            SELECT id FROM enum_master WHERE master_name='listing_status' AND option_name='cancelled'
         )
         UPDATE sell_listings SET status=(SELECT id FROM cancelled), updated_at=NOW()
         WHERE id=$1 AND (status=(SELECT id FROM pending) OR status=(SELECT id FROM assigned))
         RETURNING id`,
        [listing_id]
    );
    if (result.rowCount === 0) throw { status: 404, message: "Listing not found or not in a cancellable status" };
    return result.rows[0];
};

// PICKUPS
exports.schedulePickup = async ({ user_id, listing_id, address_id, pickup_date, pickup_slot_start, pickup_slot_end, notes }) => {
    if (!listing_id || !address_id || !pickup_date || !pickup_slot_start || !pickup_slot_end) throw { status: 400, message: "Insufficient Parameters" }
    const isValid = await pool.query(`SELECT 1 FROM users u
        JOIN sell_listings sl ON u.id=sl.user_id
        WHERE sl.id=$1 AND u.id=$2`, [listing_id, user_id]);

    if (0 === isValid.rowCount) throw { status: 404, message: "Invalid Sell Listing" }
    const result = await pool.query(`INSERT INTO sell_pickups(listing_id, address_id, pickup_date, pickup_slot_start, pickup_slot_end, notes) VALUES($1, $2, $3, $4, $5, $6)
    RETURNING *`, [listing_id, address_id, pickup_date, pickup_slot_start, pickup_slot_end, notes])
    return result.rows || [];
};

// GET ORDERS
exports.getOrders = async (user) => {
    // user.userId=7;
    console.log(user,'devadiya')
    if (!user?.userId) return [];
    const result = await pool.query(`
    SELECT 
    CONCAT('#KSM-000', sl.id) AS order_id,
    b.name brand,
    m.name model,
    sl.base_price,
    sl.expected_price,
    em.option_name status,
    sl.created_at,
    sl.updated_at
    FROM sell_listings sl
    JOIN brands b ON sl.brand_id=b.id
    JOIN models m ON sl.model_id=m.id
    JOIN enum_master em ON sl.status=em.id AND em.master_name='listing_status' 
    WHERE sl.user_id=$1 ORDER BY sl.created_at DESC`, [user.userId]);
    return result.rows || [];
}

// ── Get Merchants ────────────────────────────────────────────

exports.getMerchants = async () => {
    const result = await pool.query(
        `SELECT u.id, u.email, up.first_name, up.last_name
         FROM users u
         JOIN user_roles ur ON u.id=ur.user_id
         JOIN roles r ON ur.role_id=r.id
         JOIN user_profile up ON u.id=up.user_id
         WHERE r.name='merchant' AND u.status=1
         ORDER BY up.first_name`
    );
    return result.rows;
};
