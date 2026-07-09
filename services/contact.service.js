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

exports.updateContactUs = async (id) => {
    const result = await pool.query('UPDATE contact_us SET status=status%2+1 WHERE id = $1 RETURNING *', [id]);
    return { id, ...result.rows[0] };
};

// exports.updateContactUs = async (id, contactData) => {
//     const result = await pool.query('UPDATE contact_us SET $1 WHERE id = $2 RETURNING *', [contactData, id]);
//     return { id, ...result.rows[0] };
// };

exports.deleteContactUs = async (id) => {
    await pool.query('DELETE FROM contact_us WHERE id = $1', [id]);
};