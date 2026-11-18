# ClientFlow — CRM Full Stack

Aplicación web para gestionar una cartera de clientes desde un panel de control. Proyecto de portfolio que demuestra desarrollo frontend, backend y persistencia de datos.

## Funcionalidades

- Dashboard con métricas de clientes, clientes activos, prospectos y nuevos contactos.
- Alta, edición y eliminación de clientes (CRUD).
- Búsqueda por nombre, correo electrónico o empresa.
- Filtro por estado: nuevo contacto, prospecto y activo.
- Validación de datos en el servidor y control de correo duplicado.
- Persistencia local con SQLite.
- Interfaz responsive para escritorio, tablet y móvil.
- API REST propia.

## Tecnologías

- **Frontend:** HTML5, CSS3 y JavaScript (Fetch API).
- **Backend:** Node.js y Express.
- **Base de datos:** SQLite mediante better-sqlite3.
- **Seguridad básica:** Helmet y validación de entradas.

## Requisitos

- Node.js 20 o superior.
- npm.

## Instalación y ejecución

```bash
git clone https://github.com/Marcos-3019/gestor-clientes-fullstack.git
cd gestor-clientes-fullstack
npm install
cp .env.example .env
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

En Windows PowerShell, si `cp` no está disponible:

```powershell
Copy-Item .env.example .env
```

Para iniciar en modo normal:

```bash
npm start
```

La base de datos se crea automáticamente en `data/clients.db` y se carga con tres registros de ejemplo la primera vez.

## API REST

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del servicio |
| GET | `/api/stats` | Métricas del dashboard |
| GET | `/api/clients` | Listado de clientes |
| GET | `/api/clients?search=ana` | Búsqueda |
| GET | `/api/clients?status=active` | Filtro por estado |
| POST | `/api/clients` | Crear cliente |
| PUT | `/api/clients/:id` | Actualizar cliente |
| DELETE | `/api/clients/:id` | Eliminar cliente |

### Ejemplo de creación

```json
{
  "name": "Ana García",
  "email": "ana@empresa.com",
  "company": "Empresa Demo",
  "phone": "600 000 000",
  "status": "lead",
  "notes": "Contactar la próxima semana"
}
```

## Estructura

```text
gestor-clientes-fullstack/
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── data/                 # Se crea automáticamente
├── .env.example
├── .gitignore
├── database.js
├── package.json
├── README.md
├── server.js
└── validation.js
```

## Próximas mejoras

- Autenticación y roles de usuario.
- Tests automatizados de API.
- Exportación de clientes a CSV.
- Despliegue con base de datos persistente.

## Autor

**Marcos Santos** · [GitHub @Marcos-3019](https://github.com/Marcos-3019)

---

> Proyecto demostrativo. Los datos iniciales son ficticios; no introduzcas información personal real en una demo pública.
