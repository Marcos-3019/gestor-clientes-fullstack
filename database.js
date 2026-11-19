const fs = require("fs");
const path = require("path");
const { createClient } = require("@libsql/client");

// En producción se conecta a Turso. En local, sin URL de Turso,
// utiliza un archivo SQLite para facilitar el desarrollo.
const localDbPath = path.resolve(process.env.DB_FILE || "./data/clients.db");
if (!process.env.TURSO_DATABASE_URL) {
  fs.mkdirSync(path.dirname(localDbPath), { recursive: true });
}

const databaseUrl = process.env.TURSO_DATABASE_URL || `file:${localDbPath}`;
const db = createClient({
  url: databaseUrl,
  ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {})
});

async function initializeDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      company TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'lead' CHECK(status IN ('lead','prospect','active')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const countResult = await db.execute("SELECT COUNT(*) AS count FROM clients");
  if (Number(countResult.rows[0].count) === 0) {
    await db.batch([
      { sql: "INSERT INTO clients (name,email,company,phone,status,notes) VALUES (?,?,?,?,?,?)", args: ["Laura Méndez", "laura@novacreativa.es", "Nova Creativa", "600 123 456", "active", "Cliente desde enero. Seguimiento trimestral."] },
      { sql: "INSERT INTO clients (name,email,company,phone,status,notes) VALUES (?,?,?,?,?,?)", args: ["Daniel Ruiz", "daniel@techsur.es", "TechSur", "611 234 567", "prospect", "Enviar propuesta de servicios."] },
      { sql: "INSERT INTO clients (name,email,company,phone,status,notes) VALUES (?,?,?,?,?,?)", args: ["Sofía Martín", "sofia@ejemplo.es", "Independiente", "622 345 678", "lead", "Contacto recibido desde la web."] }
    ], "write");
  }
}

module.exports = { db, initializeDatabase };
