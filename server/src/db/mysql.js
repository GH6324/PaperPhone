const mysql = require('mysql2/promise');

let pool;

async function connectDb({ retries = 10, delay = 3000 } = {}) {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'root',
    database: process.env.DB_NAME || 'paperphone',
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: '+00:00',
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await pool.getConnection();
      console.log('✅ MySQL connected');
      conn.release();
      return pool;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`⏳ MySQL not ready (attempt ${attempt}/${retries}), retrying in ${delay / 1000}s… [${err.code || err.message}]`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function getDb() {
  if (!pool) throw new Error('DB not initialized. Call connectDb() first.');
  return pool;
}

module.exports = { connectDb, getDb };
