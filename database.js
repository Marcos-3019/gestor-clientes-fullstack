const fs = require("fs");
const path = require("path");
const { createClient } = require("@libsql/client");

const localDbPath = path.resolve(process.env.DB_FILE || "./data/clients.db");
if (!process.env.TURSO_DATABASE_URL) fs.mkdirSync(path.dirname(localDbPath), { recursive: true });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${localDbPath}`,
  ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {})
});

async function initializeDatabase() {
  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_admin IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migración compatible para usuarios creados antes de este cambio.
  const userColumns = await db.execute("PRAGMA table_info(users)");
  if (!userColumns.rows.some(c => c.name === "is_admin")) {
    await db.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE,
    company TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'lead' CHECK(status IN ('lead','prospect','active')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const columns = await db.execute("PRAGMA table_info(clients)");
  if (!columns.rows.some(c => c.name === "user_id")) {
    await db.execute("ALTER TABLE clients ADD COLUMN user_id INTEGER REFERENCES users(id)");
  }
  await db.execute("CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id)");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)");
}
module.exports = { db, initializeDatabase };
