const pool = require('../config/database');

exports.getAllContactUs = async () => {
    const result = await pool.query('SELECT * FROM contact_us');
    return result.rows;
};

exports.getContactUsById = async (id) => {
    const result = await pool.query('SELECT * FROM contact_us WHERE id = $1', [id]);
    return result.rows;
};

exports.createContactUs = async (contactData) => {
    const result = await pool.query(`INSERT INTO contact_us(first_name, last_name, email, phone, subject, message) VALUES ($1, $2, $3, $4, $5, $6)     RETURNING id`, [
        contactData.first_name,
        contactData.last_name,
        contactData.email,
        contactData.phone,
        contactData.subject,
        contactData.message
    ]);
    return { id: result.rows[0].id, ...contactData };
};

// Only columns actually present on contact_us — guards against stray body fields
// being passed straight into the query, and lets callers send a partial update
// (e.g. the admin "Manage Reviews" screen only sends first_name/last_name/message/status)
// without nulling out the columns they didn't send.
const UPDATABLE_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'subject', 'message', 'status'];

exports.updateContactUs = async (id, contactData = {}) => {
    const fields = UPDATABLE_FIELDS.filter((f) => contactData[f] !== undefined);

    if (fields.length === 0) {
        const existing = await pool.query('SELECT * FROM contact_us WHERE id = $1', [id]);
        return existing.rows[0];
    }

    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = fields.map((f) => contactData[f]);

    const result = await pool.query(
        `UPDATE contact_us SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1} RETURNING *`,
        [...values, id]
    );
    return result.rows[0];
};

exports.deleteContactUs = async (id) => {
    await pool.query('DELETE FROM contact_us WHERE id = $1', [id]);
};