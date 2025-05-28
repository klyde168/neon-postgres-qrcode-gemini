// app/utils/db.server.ts
import { Pool } from 'pg';

let pool: Pool;

declare global {
  // eslint-disable-next-line no-var
  var __pool: Pool | undefined;
}

// This is needed because in development we don't want to restart
// the server with every change, but we want to make sure we don't
// create a new connection to the DB with every change either.
// In production, we'll have a single connection to the DB.
if (process.env.NODE_ENV === 'production') {
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
} else {
  if (!global.__pool) {
    global.__pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  }
  pool = global.__pool;
}

export { pool };