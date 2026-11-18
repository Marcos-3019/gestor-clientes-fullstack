const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbFile = process.env.DB_FILE || "./data/clients.db";
const absolutePath = path.resolve(dbFile);
fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
const db = new Database(absolutePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initializeDatabase() {
  db.exec(`
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
    );
  `);
  const count = db.prepare("SELECT COUNT(*) AS count FROM clients").get().count;
  if (count === 0) {
    const insert = db.prepare("INSERT INTO clients (name,email,company,phone,status,notes) VALUES (?,?,?,?,?,?)");
    const seed = db.transaction(() => {
      insert.run("Laura Méndez", "laura@novacreativa.es", "Nova Creativa", "600 123 456", "active", "Cliente desde enero. Seguimiento trimestral.");
      insert.run("Daniel Ruiz", "daniel@techsur.es", "TechSur", "611 234 567", "prospect", "Enviar propuesta de servicios.");
      insert.run("Sofía Martín", "sofia@ejemplo.es", "Independiente", "622 345 678", "lead", "Contacto recibido desde la web.");
    });
    seed();
  }
}

module.exports = { db, initializeDatabase };
