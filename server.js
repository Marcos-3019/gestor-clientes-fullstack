require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const path = require("path");
const { z } = require("./validation");
const { db, initializeDatabase } = require("./database");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

initializeDatabase();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

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

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.get("/api/stats", (_req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS count FROM clients").get().count;
  const active = db.prepare("SELECT COUNT(*) AS count FROM clients WHERE status = 'active'").get().count;
  const leads = db.prepare("SELECT COUNT(*) AS count FROM clients WHERE status = 'lead'").get().count;
  const prospects = db.prepare("SELECT COUNT(*) AS count FROM clients WHERE status = 'prospect'").get().count;
  res.json({ total, active, leads, prospects });
});

app.get("/api/clients", (req, res) => {
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "").trim();
  let sql = "SELECT * FROM clients WHERE 1=1";
  const params = [];
  if (search) {
    sql += " AND (name LIKE ? OR email LIKE ? OR company LIKE ?)";
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  if (["lead", "prospect", "active"].includes(status)) {
    sql += " AND status = ?";
    params.push(status);
  }
  sql += " ORDER BY created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

app.post("/api/clients", (req, res) => {
  const parsed = z.client.safeParse(normalizeClient(req.body));
  if (!parsed.success) return res.status(400).json({ error: parsed.error });
  try {
    const result = db.prepare(`
      INSERT INTO clients (name, email, company, phone, status, notes)
      VALUES (@name, @email, @company, @phone, @status, @notes)
    `).run(parsed.data);
    res.status(201).json(db.prepare("SELECT * FROM clients WHERE id = ?").get(result.lastInsertRowid));
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return res.status(409).json({ message: "Ya existe un cliente con ese correo." });
    res.status(500).json({ message: "No se pudo guardar el cliente." });
  }
});

app.put("/api/clients/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Identificador no válido." });
  const parsed = z.client.safeParse(normalizeClient(req.body));
  if (!parsed.success) return res.status(400).json({ error: parsed.error });
  const result = db.prepare(`
    UPDATE clients SET name=@name, email=@email, company=@company, phone=@phone,
    status=@status, notes=@notes, updated_at=CURRENT_TIMESTAMP WHERE id=@id
  `).run({ ...parsed.data, id });
  if (!result.changes) return res.status(404).json({ message: "Cliente no encontrado." });
  res.json(db.prepare("SELECT * FROM clients WHERE id = ?").get(id));
});

app.delete("/api/clients/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Identificador no válido." });
  const result = db.prepare("DELETE FROM clients WHERE id = ?").run(id);
  if (!result.changes) return res.status(404).json({ message: "Cliente no encontrado." });
  res.status(204).end();
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`CRM disponible en http://localhost:${PORT}`));
