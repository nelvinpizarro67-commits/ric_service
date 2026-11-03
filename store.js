// Si existe DATABASE_URL usa PostgreSQL (los datos NO se pierden en Render).
// Si no existe, usa un archivo SQLite local (solo para probar en tu PC).
const url = process.env.DATABASE_URL;

if (url) {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  module.exports = {
    tipo: "PostgreSQL",
    iniciar: () => pool.query(
      `CREATE TABLE IF NOT EXISTS registros (
         coleccion TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL,
         creado TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (coleccion, id))`),
    todos: async () => (await pool.query("SELECT coleccion, data FROM registros ORDER BY creado, id")).rows,
    guardar: (c, id, d) => pool.query(
      `INSERT INTO registros (coleccion, id, data) VALUES ($1,$2,$3)
       ON CONFLICT (coleccion, id) DO UPDATE SET data = EXCLUDED.data`, [c, id, d]),
    borrar: (c, id) => pool.query("DELETE FROM registros WHERE coleccion=$1 AND id=$2", [c, id]),
  };
} else {
  let sqlite3 = null;
  try { sqlite3 = require("sqlite3"); } catch (e) { /* sin sqlite3: se usa memoria (solo pruebas) */ }
  if (sqlite3) {
    const path = require("path");
    const db = new sqlite3.Database(path.join(__dirname, "datos.sqlite"));
    const run = (s, p = []) => new Promise((ok, no) => db.run(s, p, (e) => (e ? no(e) : ok())));
    const all = (s, p = []) => new Promise((ok, no) => db.all(s, p, (e, r) => (e ? no(e) : ok(r))));
    module.exports = {
      tipo: "SQLite local",
      iniciar: () => run(
        `CREATE TABLE IF NOT EXISTS registros (
           coleccion TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
           creado INTEGER DEFAULT (strftime('%s','now')), PRIMARY KEY (coleccion, id))`),
      todos: async () => (await all("SELECT rowid, coleccion, data FROM registros ORDER BY rowid"))
        .map((r) => ({ coleccion: r.coleccion, data: JSON.parse(r.data) })),
      guardar: (c, id, d) => run(
        "INSERT INTO registros (coleccion,id,data) VALUES (?,?,?) ON CONFLICT(coleccion,id) DO UPDATE SET data=excluded.data",
        [c, id, JSON.stringify(d)]),
      borrar: (c, id) => run("DELETE FROM registros WHERE coleccion=? AND id=?", [c, id]),
    };
  } else {
    const mem = new Map();
    module.exports = {
      tipo: "Memoria (solo pruebas, se borra al apagar)",
      iniciar: async () => {},
      todos: async () => [...mem.values()].map((r) => ({ coleccion: r.c, data: JSON.parse(r.d) })),
      guardar: async (c, id, d) => { mem.set(c + "/" + id, { c, d: JSON.stringify(d) }); },
      borrar: async (c, id) => { mem.delete(c + "/" + id); },
    };
  }
}
