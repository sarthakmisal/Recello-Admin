const { Pool } = require("pg");
const pool = new Pool({
  connectionString: "postgresql://postgres:root@localhost:5432/Resello"
});

async function test() {
  try {
    const cats = await pool.query("SELECT id, name, slug FROM categories");
    console.log("CATEGORIES:");
    console.log(cats.rows);

    const brands = await pool.query("SELECT b.id, b.name, b.slug, count(bc.category_id) as cat_count FROM brands b LEFT JOIN brand_categories bc ON b.id = bc.brand_id GROUP BY b.id");
    console.log("BRANDS:");
    console.log(brands.rows);

    const mappings = await pool.query("SELECT bc.brand_id, bc.category_id, b.name as brand_name, c.name as cat_name FROM brand_categories bc JOIN brands b ON bc.brand_id = b.id JOIN categories c ON bc.category_id = c.id");
    console.log("MAPPINGS:");
    console.log(mappings.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
test();
