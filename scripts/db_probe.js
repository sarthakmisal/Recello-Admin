require('dotenv').config();

const pool = require('../config/database');

async function main() {
  const tables = ['faqs', 'banners'];
  for (const tableName of tables) {
    const res = await pool.query(
      "select column_name, data_type from information_schema.columns where table_name=$1 order by ordinal_position",
      [tableName],
    );
    console.log(`\n== ${tableName} columns ==`);
    console.table(res.rows);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('DB probe failed:', e);
  process.exit(1);
});
