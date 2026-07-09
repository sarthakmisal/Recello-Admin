const { Pool } = require("pg");

 const pool = new Pool({
   host: process.env.DB_HOST,
   user: process.env.DB_USER,
   password: process.env.DB_PASSWORD,
   database: process.env.DB_NAME,
   port: process.env.DB_PORT || 5432,
 });


pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
