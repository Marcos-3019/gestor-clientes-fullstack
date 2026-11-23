require("dotenv").config();

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("Falta DATABASE_URL. Configura la conexión de Neon en el archivo .env.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // La cadena DATABASE_URL de Neon conserva sslmode=require para TLS.
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

function toPostgres(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function execute(input) {
  const sql = typeof input === "string" ? input : input.sql;
  const args = typeof input === "string" ? [] : (input.args || []);
  let statement = toPostgres(sql.trim());
  const isInsert = /^INSERT\s+INTO\b/i.test(statement);
  if (isInsert && !/\bRETURNING\b/i.test(statement)) {
    statement = statement.replace(/;?\s*$/, " RETURNING id");
  }
  const result = await pool.query(statement, args);
  return {
    rows: result.rows,
    rowsAffected: result.rowCount || 0,
    lastInsertRowid: result.rows?.[0]?.id ?? null,
  };
}

const db = { execute, query: (sql, args = []) => pool.query(sql, args), pool };

async function initializeDatabase() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0,1)),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email))");

  await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    id BIGSERIAL PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS clients (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'lead' CHECK(status IN ('lead','prospect','active')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  // Compatibilidad con una tabla clients que ya existiera en Neon.
  await pool.query("ALTER TABLE clients ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)");
}

module.exports = { db, initializeDatabase, pool };
