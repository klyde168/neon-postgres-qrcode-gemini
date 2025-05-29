// app/utils/db.server.ts
import { Pool } from 'pg';

let pool: Pool;

declare global {
  // eslint-disable-next-line no-var
  var __pool: Pool | undefined;
}

// 檢查環境變數
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  throw new Error('DATABASE_URL environment variable is required');
}

console.log('Initializing database pool...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);

// 資料庫連接配置
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10, // 最大連接數
  idleTimeoutMillis: 30000, // 閒置超時
  connectionTimeoutMillis: 2000, // 連接超時
};

// This is needed because in development we don't want to restart
// the server with every change, but we want to make sure we don't
// create a new connection to the DB with every change either.
// In production, we'll have a single connection to the DB.
if (process.env.NODE_ENV === 'production') {
  pool = new Pool(poolConfig);
  console.log('Production database pool created');
} else {
  if (!global.__pool) {
    global.__pool = new Pool(poolConfig);
    console.log('Development database pool created');
  }
  pool = global.__pool;
}

// 添加連接池事件監聽器
pool.on('connect', (client) => {
  console.log('New client connected to database');
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

// 測試資料庫連接
const testConnection = async () => {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT NOW() as current_time');
      console.log('Database connection test successful:', result.rows[0].current_time);
      
      // 檢查 scanned_data 表是否存在
      const tableCheckResult = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'scanned_data'
        );
      `);
      
      if (tableCheckResult.rows[0].exists) {
        console.log('scanned_data table exists');
        // 獲取表中的記錄數
        const countResult = await client.query('SELECT COUNT(*) FROM scanned_data');
        console.log('scanned_data table has', countResult.rows[0].count, 'records');
      } else {
        console.log('scanned_data table does not exist, creating...');
        await client.query(`
          CREATE TABLE IF NOT EXISTS scanned_data (
            id SERIAL PRIMARY KEY,
            data TEXT NOT NULL,
            scanned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        console.log('scanned_data table created successfully');
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Database connection test failed:', err);
    throw err;
  }
};

// 在模組載入時測試連接
testConnection().catch(console.error);

export { pool };