require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const { z } = require("./validation");
const { db, initializeDatabase } = require("./database");

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const secureCookie = process.env.NODE_ENV === "production";
const COOKIE = "clientflow_session";
const scrypt = promisify(crypto.scrypt);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");

const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const cookieOptions = () => ({
  httpOnly: true,
  secure: secureCookie,
  sameSite: "strict",
  path: "/",
});

function cookie(req) {
  const entry = (req.headers.cookie || "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE + "="));

  return entry ? decodeURIComponent(entry.slice(COOKIE.length + 1)) : null;
}

async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);

  return `scrypt$${salt}$${key.toString("hex")}`;
}

async function passwordMatches(password, stored) {
  const [algo, salt, hex] = String(stored).split("$");

  if (algo !== "scrypt" || !salt || !hex) return false;

  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, "hex");

  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}

async function newSession(userId, res) {
  const token = crypto.randomBytes(32).toString("hex");

  const expiry = new Date(Date.now() + 7 * 86400000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  await db.execute({
    sql: "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    args: [sha(token), userId, expiry],
  });

  res.cookie(COOKIE, token, {
    ...cookieOptions(),
    maxAge: 7 * 86400000,
  });
}

const attempts = new Map();

function limitAuth(req, res, next) {
  const key = req.ip + req.path;
  const now = Date.now();

  const list = (attempts.get(key) || []).filter((t) => now - t < 600000);

  if (list.length >= 12) {
    return res.status(429).json({
      message: "Demasiados intentos. Espera unos minutos.",
    });
  }

  list.push(now);
  attempts.set(key, list);

  next();
}

function auth(req, res, next) {
  const token = cookie(req);

  if (!token) {
    return res.status(401).json({
      message: "Inicia sesión para continuar.",
    });
  }

  db.execute({
    sql: `SELECT users.id,users.name,users.email,users.is_admin
          FROM sessions
          JOIN users ON users.id=sessions.user_id
          WHERE sessions.token_hash=?
          AND sessions.expires_at>CURRENT_TIMESTAMP`,
    args: [sha(token)],
  })
    .then((result) => {
      if (!result.rows.length) {
        res.clearCookie(COOKIE, cookieOptions());

        return res.status(401).json({
          message: "La sesión ha caducado.",
        });
      }

      req.user = result.rows[0];
      next();
    })
    .catch(next);
}

function normalizeClient(body) {
  return {
    name: String(body.name || "").trim(),
    email: String(body.email || "")
      .trim()
      .toLowerCase(),
    company: String(body.company || "").trim(),
    phone: String(body.phone || "").trim(),
    status: body.status || "lead",
    notes: String(body.notes || "").trim(),
  };
}

// Comprobar el estado del servidor y la base de datos.
app.get(
  "/api/health",
  asyncRoute(async (_req, res) => {
    await db.execute("SELECT 1");
    res.json({ status: "ok" });
  }),
);

// Consultar la sesión actual.
app.get("/api/auth/me", auth, (req, res) => {
  res.json({ user: req.user });
});

// Registro de usuarios.
app.post(
  "/api/auth/register",
  limitAuth,
  asyncRoute(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({
        message: "El nombre debe tener entre 2 y 80 caracteres.",
      });
    }

    if (!validEmail(email)) {
      return res.status(400).json({
        message: "Introduce un correo válido.",
      });
    }

    if (password.length < 10) {
      return res.status(400).json({
        message: "La contraseña debe tener al menos 10 caracteres.",
      });
    }

    try {
      const result = await db.execute({
        sql: "INSERT INTO users(name,email,password_hash) VALUES(?,?,?)",
        args: [name, email, await passwordHash(password)],
      });

      const id = Number(result.lastInsertRowid);

      await newSession(id, res);

      res.status(201).json({
        user: { id, name, email, is_admin: 0 },
      });
    } catch (e) {
      if (/UNIQUE|CONSTRAINT/i.test(e.message)) {
        return res.status(409).json({
          message: "Ya existe una cuenta con ese correo.",
        });
      }

      throw e;
    }
  }),
);

// Inicio de sesión.
app.post(
  "/api/auth/login",
  limitAuth,
  asyncRoute(async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");

    const result = await db.execute({
      sql: "SELECT id,name,email,password_hash,is_admin FROM users WHERE email=?",
      args: [email],
    });

    if (
      !result.rows.length ||
      !(await passwordMatches(password, result.rows[0].password_hash))
    ) {
      return res.status(401).json({
        message: "Correo o contraseña incorrectos.",
      });
    }

    const u = result.rows[0];

    await newSession(u.id, res);

    res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        is_admin: Number(u.is_admin) === 1,
      },
    });
  }),
);

// Cerrar sesión.
app.post(
  "/api/auth/logout",
  asyncRoute(async (req, res) => {
    const token = cookie(req);

    if (token) {
      await db.execute({
        sql: "DELETE FROM sessions WHERE token_hash=?",
        args: [sha(token)],
      });
    }

    res.clearCookie(COOKIE, cookieOptions());
    res.status(204).end();
  }),
);

// Crear el administrador inicial con ADMIN_BOOTSTRAP_TOKEN.
app.post(
  "/api/auth/bootstrap-admin",
  limitAuth,
  asyncRoute(async (req, res) => {
    const secret = process.env.ADMIN_BOOTSTRAP_TOKEN || "";
    const supplied = String(req.body.bootstrapToken || "");

    const a = Buffer.from(secret);
    const b = Buffer.from(supplied);

    if (!secret || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({
        message: "Código de configuración no válido.",
      });
    }

    const adminExists = await db.execute(
      "SELECT id FROM users WHERE is_admin=1 LIMIT 1",
    );

    if (adminExists.rows.length) {
      return res.status(409).json({
        message:
          "Ya existe una cuenta administradora. La configuración inicial está cerrada.",
      });
    }

    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");

    if (
      name.length < 2 ||
      name.length > 80 ||
      !validEmail(email) ||
      password.length < 10
    ) {
      return res.status(400).json({
        message: "Revisa nombre, correo y contraseña (mínimo 10 caracteres).",
      });
    }

    const existing = await db.execute({
      sql: "SELECT id,name,email,password_hash FROM users WHERE email=?",
      args: [email],
    });

    let id;
    let adminName;
    let adminEmail;

    if (existing.rows.length) {
      const user = existing.rows[0];

      if (!(await passwordMatches(password, user.password_hash))) {
        return res.status(401).json({
          message: "La contraseña actual de esa cuenta no es correcta.",
        });
      }

      id = Number(user.id);
      adminName = user.name;
      adminEmail = user.email;
    } else {
      const result = await db.execute({
        sql: "INSERT INTO users(name,email,password_hash,is_admin) VALUES(?,?,?,1)",
        args: [name, email, await passwordHash(password)],
      });

      id = Number(result.lastInsertRowid);
      adminName = name;
      adminEmail = email;
    }

    await db.execute({
      sql: "UPDATE users SET is_admin=1 WHERE id=?",
      args: [id],
    });

    await db.execute({
      sql: "UPDATE clients SET user_id=? WHERE user_id IS NULL",
      args: [id],
    });

    await newSession(id, res);

    process.env.ADMIN_BOOTSTRAP_TOKEN = "";

    res.status(200).json({
      user: {
        id,
        name: adminName,
        email: adminEmail,
        is_admin: true,
      },
    });
  }),
);

// Estadísticas del usuario conectado.
app.get(
  "/api/stats",
  auth,
  asyncRoute(async (req, res) => {
    const r = await db.execute({
      sql: `SELECT COUNT(*) total,
        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active,
        SUM(CASE WHEN status='lead' THEN 1 ELSE 0 END) leads,
        SUM(CASE WHEN status='prospect' THEN 1 ELSE 0 END) prospects
        FROM clients
        WHERE user_id=?`,
      args: [req.user.id],
    });

    const x = r.rows[0];

    res.json({
      total: Number(x.total || 0),
      active: Number(x.active || 0),
      leads: Number(x.leads || 0),
      prospects: Number(x.prospects || 0),
    });
  }),
);

// Listado, búsqueda, filtros, ordenación y paginación.
app.get(
  "/api/clients",
  auth,
  asyncRoute(async (req, res) => {
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim();

    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();

    const sort = String(req.query.sort || "newest");

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

    const limit = Math.max(
      5,
      Math.min(100, Number.parseInt(req.query.limit, 10) || 10),
    );

    const where = ["user_id=?"];
    const args = [req.user.id];

    if (search) {
      where.push(
        "(name LIKE ? OR email LIKE ? OR company LIKE ? OR phone LIKE ?)",
      );

      const q = "%" + search + "%";
      args.push(q, q, q, q);
    }

    if (["lead", "prospect", "active"].includes(status)) {
      where.push("status=?");
      args.push(status);
    }

    // Validación corregida de la fecha inicial.
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      where.push("date(created_at)>=date(?)");
      args.push(from);
    }

    // Validación corregida de la fecha final.
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      where.push("date(created_at)<=date(?)");
      args.push(to);
    }

    const clause = where.join(" AND ");

    const count = await db.execute({
      sql: `SELECT COUNT(*) AS total FROM clients WHERE ${clause}`,
      args,
    });

    const order =
      sort === "oldest"
        ? "created_at ASC, id ASC"
        : sort === "name_asc"
          ? "name COLLATE NOCASE ASC, id ASC"
          : sort === "name_desc"
            ? "name COLLATE NOCASE DESC, id DESC"
            : "created_at DESC, id DESC";

    const total = Number(count.rows[0].total || 0);

    const pages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, pages);

    const result = await db.execute({
      sql: `SELECT * FROM clients
            WHERE ${clause}
            ORDER BY ${order}
            LIMIT ? OFFSET ?`,
      args: [...args, limit, (safePage - 1) * limit],
    });

    res.json({
      items: result.rows,
      total,
      page: safePage,
      limit,
      pages,
    });
  }),
);

// Crear cliente.
app.post(
  "/api/clients",
  auth,
  asyncRoute(async (req, res) => {
    const p = z.client.safeParse(normalizeClient(req.body));

    if (!p.success) {
      return res.status(400).json({
        message: p.error.map((x) => x.message).join(" "),
      });
    }

    const x = p.data;

    const r = await db.execute({
      sql: "INSERT INTO clients(user_id,name,email,company,phone,status,notes) VALUES(?,?,?,?,?,?,?)",
      args: [
        req.user.id,
        x.name,
        x.email,
        x.company,
        x.phone,
        x.status,
        x.notes,
      ],
    });

    const created = await db.execute({
      sql: "SELECT * FROM clients WHERE id=? AND user_id=?",
      args: [Number(r.lastInsertRowid), req.user.id],
    });

    res.status(201).json(created.rows[0]);
  }),
);

// Actualizar cliente.
app.put(
  "/api/clients/:id",
  auth,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        message: "Identificador no válido.",
      });
    }

    const p = z.client.safeParse(normalizeClient(req.body));

    if (!p.success) {
      return res.status(400).json({
        message: p.error.map((x) => x.message).join(" "),
      });
    }

    const x = p.data;

    const r = await db.execute({
      sql: `UPDATE clients
            SET name=?,email=?,company=?,phone=?,status=?,notes=?,
                updated_at=CURRENT_TIMESTAMP
            WHERE id=? AND user_id=?`,
      args: [
        x.name,
        x.email,
        x.company,
        x.phone,
        x.status,
        x.notes,
        id,
        req.user.id,
      ],
    });

    if (!r.rowsAffected) {
      return res.status(404).json({
        message: "Cliente no encontrado.",
      });
    }

    const updated = await db.execute({
      sql: "SELECT * FROM clients WHERE id=? AND user_id=?",
      args: [id, req.user.id],
    });

    res.json(updated.rows[0]);
  }),
);

// Eliminar cliente.
app.delete(
  "/api/clients/:id",
  auth,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        message: "Identificador no válido.",
      });
    }

    const r = await db.execute({
      sql: "DELETE FROM clients WHERE id=? AND user_id=?",
      args: [id, req.user.id],
    });

    if (!r.rowsAffected) {
      return res.status(404).json({
        message: "Cliente no encontrado.",
      });
    }

    res.status(204).end();
  }),
);

// Servir la aplicación.
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Gestión de errores.
app.use((err, _req, res, _next) => {
  console.error("Error en la aplicación:", err);

  res.status(500).json({
    message: "Error interno. Inténtalo de nuevo.",
  });
});

// Iniciar servidor después de inicializar la base de datos.
initializeDatabase()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`ClientFlow en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Error al iniciar:", err);
    process.exit(1);
  });
