const pool = require("../config/database");

// CREATE FAQ
exports.createFaq = async (req, res) => {
  try {
    const { question, answer, status } = req.body;

    const result = await pool.query(
      `INSERT INTO faqs (question, answer, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [question, answer, status],
    );

    res.json({
      message: "FAQ created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET ALL FAQS
exports.getAllFaqs = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, question, answer, status, created_at, updated_at
      FROM faqs
      ORDER BY id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET ACTIVE FAQS (PUBLIC)
exports.getActiveFaqs = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM faqs
       WHERE status = true
       ORDER BY id DESC`,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET FAQ BY ID
exports.getFaqById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, question, answer, status, created_at, updated_at
       FROM faqs
       WHERE id = $1`,
      [id],
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// UPDATE FAQ
exports.updateFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, status } = req.body;

    const result = await pool.query(
      `UPDATE faqs
       SET question=$1, answer=$2, status=$3, updated_at=CURRENT_TIMESTAMP
       WHERE id=$4
       RETURNING *`,
      [question, answer, status, id],
    );

    res.json({
      message: "FAQ updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE FAQ
exports.deleteFaq = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(`DELETE FROM faqs WHERE id = $1`, [id]);

    res.json({
      message: "FAQ deleted successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// TOGGLE STATUS
exports.updateFaqStatus = async (req, res) => {
  try {
    const { id } = req.params;
    let { status } = req.body;

    // Ensure boolean value
    status = status === true || status === "true";

    const result = await pool.query(
      `UPDATE faqs
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, id],
    );

    res.json({
      message: "FAQ status updated",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
