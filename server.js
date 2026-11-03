const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");
const R = require("./public/reglas");   // mismas reglas que usa el modo demostración de la página

const app = express();
const PORT = process.env.PORT || 3000;
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
// Bootstrap e iconos desde este mismo servidor (así la página funciona sin internet después de "npm install")
app.use("/vendor/bootstrap", express.static(path.join(__dirname, "node_modules", "bootstrap", "dist")));
app.use("/vendor/bootstrap-icons", express.static(path.join(__dirname, "node_modules", "bootstrap-icons", "font")));

// ---------------- Usuarios (cámbialos con variables de entorno en Render) ----------------
const USUARIOS = [
  { usuario: process.env.JEFE_USUARIO || "admin", clave: process.env.JEFE_CLAVE || "ric2026", rol: "jefe" },
  { usuario: process.env.EMPLEADO_USUARIO || "empleado", clave: process.env.EMPLEADO_CLAVE || "taller2026", rol: "empleado" },
];
const SECRETO = process.env.TOKEN_SECRET ||
  crypto.createHash("sha256").update("ric-service|" + (process.env.DATABASE_URL || "local")).digest("hex");
const DURACION_SESION = 12 * 60 * 60 * 1000; // 12 horas

// ---------------- Limitador simple de intentos ----------------
function limitar(max, ventanaMs) {
  const mapa = new Map();
  setInterval(() => { const n = Date.now(); for (const [k, v] of mapa) if (n > v.fin) mapa.delete(k); }, 10 * 60 * 1000).unref();
  return (req, res, next) => {
    const n = Date.now(); let e = mapa.get(req.ip);
    if (!e || n > e.fin) { e = { c: 0, fin: n + ventanaMs }; mapa.set(req.ip, e); }
    if (++e.c > max) return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." });
    next();
  };
}

// ---------------- Utilidades ----------------
async function cargar() {
  const out = {};
  R.COLECCIONES.forEach((c) => (out[c] = []));
  (await store.todos()).forEach((f) => { if (out[f.coleccion]) out[f.coleccion].push(f.data); });
  return out;
}
const RESERVADOS = USUARIOS.map((x) => x.usuario.toLowerCase());
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const p = R.verificar(h.startsWith("Bearer ") ? h.slice(7) : "", SECRETO);
  if (!p) return res.status(401).json({ error: "Tu sesión venció. Ingresa de nuevo." });
  if (!p.uid) { req.user = p; return next(); }
  // Usuario creado en "Gestión de usuarios": se comprueba que siga existiendo y se toma su tipo actual
  cargar().then((T) => {
    const u = T.usuarios.find((x) => x.id === p.uid);
    if (!u) return res.status(401).json({ error: "Tu usuario ya no existe. Ingresa de nuevo." });
    req.user = Object.assign({}, p, { rol: u.rol, u: u.usuario });
    next();
  }).catch(() => res.status(500).json({ error: "Error del servidor." }));
}
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: "Error del servidor." }); });

// ---------------- Acceso del personal ----------------
app.post("/api/login", limitar(10, 10 * 60 * 1000), wrap(async (req, res) => {
  const u = String((req.body || {}).usuario || "").trim().toLowerCase(), c = String((req.body || {}).clave || "");
  let rol = null, nombre = "", uid = null;
  USUARIOS.forEach((x) => {            // cuentas principales (variables de entorno)
    const okU = R.igualSeguro(x.usuario.toLowerCase(), u), okC = R.igualSeguro(x.clave, c);
    if (okU && okC) { rol = x.rol; nombre = x.usuario; }
  });
  if (!rol) {                           // usuarios creados en "Gestión de usuarios"
    const d = R.buscarUsuario(await cargar(), u, c);
    if (d) { rol = d.rol; nombre = d.usuario; uid = d.id; }
  }
  if (!rol) return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  res.json({ token: R.firmar({ rol, u: nombre, uid, exp: Date.now() + DURACION_SESION }, SECRETO), rol, usuario: nombre });
}));

// ---------------- Comprobación: la página la usa para saber si el servidor existe ----------------
app.get("/api/ping", (req, res) => res.json({ ok: true }));

// ---------------- Datos del panel (requieren sesión) ----------------
// La lógica (permisos, validaciones, precios) está en public/reglas.js
app.get("/api/datos", auth, wrap(async (req, res) => {
  res.json(R.listar(req.user.rol, await cargar()));
}));

app.put("/api/datos/:col/:id", auth, wrap(async (req, res) => {
  const { col, id } = req.params;
  if (col === "usuarios" && id === req.user.uid && (req.body || {}).rol !== "jefe")
    return res.status(409).json({ error: "No puedes quitarte a ti mismo el acceso de administrador." });
  const r = R.ponerRegistro(req.user.rol, req.user.u, await cargar(), col, id, req.body, { reservados: RESERVADOS });
  for (const g of r.guardar || []) await store.guardar(g.col, g.id, g.data);   // la orden + repuestos descontados
  res.status(r.status).json(r.json);
}));

app.delete("/api/datos/:col/:id", auth, wrap(async (req, res) => {
  const { col, id } = req.params;
  if (col === "usuarios" && id === req.user.uid) return res.status(409).json({ error: "No puedes eliminar tu propio usuario." });
  const r = R.borrarRegistro(req.user.rol, await cargar(), col, id);
  if (r.borrar) await store.borrar(r.borrar.col, r.borrar.id);
  for (const g of r.guardar || []) await store.guardar(g.col, g.id, g.data);
  res.status(r.status).json(r.json);
}));

// ---------------- Consulta pública: solo con la placa ----------------
app.get("/api/consulta/:placa", limitar(40, 60 * 1000), wrap(async (req, res) => {
  const r = R.consultar(await cargar(), req.params.placa);
  res.status(r.status).json(r.json);
}));

app.use((err, req, res, next) => res.status(400).json({ error: "Solicitud no válida." }));

async function sembrarPrecios() {
  for (const g of R.sembrar(await cargar())) await store.guardar(g.col, g.id, g.data);
}

store.iniciar()
  .then(sembrarPrecios)
  .then(() => app.listen(PORT, () => console.log("Servidor en puerto " + PORT + " | BD: " + store.tipo)))
  .catch((e) => { console.error("No se pudo iniciar la BD:", e); process.exit(1); });
