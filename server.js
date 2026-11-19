require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const path = require("path");
const { z } = require("./validation");
const { db, initializeDatabase } = require("./database");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
function normalizeClient(body) {
  return {
    name: String(body.name || "").trim(),
    email: String(body.email || "").trim().toLowerCase(),
    company: String(body.company || "").trim(),
    phone: String(body.phone || "").trim(),
    status: body.status || "lead",
    notes: String(body.notes || "").trim()
  };
}
function isDuplicateEmail(error) { return /UNIQUE|SQLITE_CONSTRAINT/i.test(String(error.message || error)); }

app.get("/api/health", asyncRoute(async (_req, res) => {
  await db.execute("SELECT 1");
  res.json({ status: "ok" });
}));

app.get("/api/stats", asyncRoute(async (_req, res) => {
  const [total, active, leads, prospects] = await Promise.all([
    db.execute("SELECT COUNT(*) AS count FROM clients"),
    db.execute("SELECT COUNT(*) AS count FROM clients WHERE status = 'active'"),
    db.execute("SELECT COUNT(*) AS count FROM clients WHERE status = 'lead'"),
    db.execute("SELECT COUNT(*) AS count FROM clients WHERE status = 'prospect'")
  ]);
  res.json({ total: Number(total.rows[0].count), active: Number(active.rows[0].count), leads: Number(leads.rows[0].count), prospects: Number(prospects.rows[0].count) });
}));

app.get("/api/clients", asyncRoute(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "").trim();
  let sql = "SELECT * FROM clients WHERE 1=1";
  const args = [];
  if (search) {
    sql += " AND (name LIKE ? OR email LIKE ? OR company LIKE ?)";
    const term = `%${search}%`;
    args.push(term, term, term);
  }
  if (["lead", "prospect", "active"].includes(status)) { sql += " AND status = ?"; args.push(status); }
  sql += " ORDER BY created_at DESC";
  const result = await db.execute({ sql, args });
  res.json(result.rows);
}));

app.post("/api/clients", asyncRoute(async (req, res) => {
  const parsed = z.client.safeParse(normalizeClient(req.body));
  if (!parsed.success) return res.status(400).json({ error: parsed.error });
  try {
    const { name, email, company, phone, status, notes } = parsed.data;
    const result = await db.execute({ sql: "INSERT INTO clients (name,email,company,phone,status,notes) VALUES (?,?,?,?,?,?)", args: [name, email, company, phone, status, notes] });
    const created = await db.execute({ sql: "SELECT * FROM clients WHERE id = ?", args: [Number(result.lastInsertRowid)] });
    res.status(201).json(created.rows[0]);
  } catch (error) {
    if (isDuplicateEmail(error)) return res.status(409).json({ message: "Ya existe un cliente con ese correo." });
    throw error;
  }
}));

app.put("/api/clients/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Identificador no válido." });
  const parsed = z.client.safeParse(normalizeClient(req.body));
  if (!parsed.success) return res.status(400).json({ error: parsed.error });
  try {
    const { name, email, company, phone, status, notes } = parsed.data;
    const result = await db.execute({
      sql: "UPDATE clients SET name=?, email=?, company=?, phone=?, status=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
      args: [name, email, company, phone, status, notes, id]
    });
    if (!result.rowsAffected) return res.status(404).json({ message: "Cliente no encontrado." });
    const updated = await db.execute({ sql: "SELECT * FROM clients WHERE id = ?", args: [id] });
    res.json(updated.rows[0]);
  } catch (error) {
    if (isDuplicateEmail(error)) return res.status(409).json({ message: "Ya existe un cliente con ese correo." });
    throw error;
  }
}));

app.delete("/api/clients/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Identificador no válido." });
  const result = await db.execute({ sql: "DELETE FROM clients WHERE id = ?", args: [id] });
  if (!result.rowsAffected) return res.status(404).json({ message: "Cliente no encontrado." });
  res.status(204).end();
}));

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((error, _req, res, _next) => {
  console.error("Error en la aplicación:", error);
  res.status(500).json({ message: "Ha ocurrido un error interno. Inténtalo de nuevo." });
});

initializeDatabase().then(() => {
  app.listen(PORT, "0.0.0.0", () => console.log(`ClientFlow disponible en el puerto ${PORT}`));
}).catch(error => {
  console.error("No se pudo inicializar la base de datos:", error);
  process.exit(1);
});
