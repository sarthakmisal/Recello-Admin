const pool = require("../config/database");


// CREATE BANNER
exports.createBanner = async (req, res) => {
  try {
    const { title, redirect_url, position, sort_order, is_active } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "Image is required" });
    }

    const image_url = `/uploads/banners/${req.file.filename}`;

    const activeStatus =
      is_active === true ||
      is_active === "true" ||
      is_active === 1 ||
      is_active === "1";

    const result = await pool.query(
      `INSERT INTO banners
      (title, image_url, redirect_url, position, sort_order, is_active)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *`,
      [
        title || null,
        image_url,
        redirect_url || null,
        position || "home",
        sort_order ? Number(sort_order) : 0,
        activeStatus,
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });

  } catch (error) {
    console.error("CREATE BANNER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// GET ALL BANNERS
exports.getAllBanners = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT * FROM banners
      ORDER BY sort_order ASC, created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows,
    });

  } catch (error) {
    console.error("GET BANNERS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// GET SINGLE BANNER
exports.getBannerById = async (req, res) => {
  try {

    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM banners WHERE id=$1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Banner not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });

  } catch (error) {
    console.error("GET BANNER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// UPDATE BANNER (FULL EDIT)
exports.updateBanner = async (req, res) => {
  try {

    const { id } = req.params;
    const { title, redirect_url, position, sort_order, is_active } = req.body;

    const activeStatus =
      is_active === true ||
      is_active === "true" ||
      is_active === 1 ||
      is_active === "1";

    let query;
    let values;

    if (req.file) {

      query = `
        UPDATE banners
        SET
          title=$1,
          redirect_url=$2,
          position=$3,
          sort_order=$4,
          is_active=$5,
          image_url=$6,
          updated_at=NOW()
        WHERE id=$7
        RETURNING *
      `;

      values = [
        title || null,
        redirect_url || null,
        position || "home",
        sort_order ? Number(sort_order) : 0,
        activeStatus,
        `/uploads/banners/${req.file.filename}`,
        id,
      ];

    } else {

      query = `
        UPDATE banners
        SET
          title=$1,
          redirect_url=$2,
          position=$3,
          sort_order=$4,
          is_active=$5,
          updated_at=NOW()
        WHERE id=$6
        RETURNING *
      `;

      values = [
        title || null,
        redirect_url || null,
        position || "home",
        sort_order ? Number(sort_order) : 0,
        activeStatus,
        id,
      ];
    }

    const result = await pool.query(query, values);

    res.json({
      success: true,
      data: result.rows[0],
    });

  } catch (error) {
    console.error("UPDATE BANNER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// TOGGLE STATUS ONLY (NEW API)
exports.toggleBannerStatus = async (req, res) => {
  try {

    const { id } = req.params;
    const { is_active } = req.body;

    const result = await pool.query(
      `UPDATE banners
       SET is_active=$1, updated_at=NOW()
       WHERE id=$2
       RETURNING *`,
      [is_active === true || is_active === "true", id]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });

  } catch (error) {
    console.error("TOGGLE STATUS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// DELETE BANNER
exports.deleteBanner = async (req, res) => {
  try {

    await pool.query(
      `DELETE FROM banners WHERE id=$1`,
      [req.params.id]
    );

    res.json({ success: true });

  } catch (error) {
    console.error("DELETE BANNER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// GET ACTIVE BANNERS (PUBLIC)
exports.getActiveBanners = async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT * FROM banners
      WHERE is_active=true
      ORDER BY sort_order ASC
    `);

    res.json({
      success: true,
      data: result.rows,
    });

  } catch (error) {
    console.error("GET ACTIVE BANNERS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};