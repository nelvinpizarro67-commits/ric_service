// Reglas del sistema RIC SERVICE: validaciones, permisos, precios base, motor de datos y sesiones.
// Este archivo lo usan DOS lugares con las MISMAS reglas:
//   1) el servidor (server.js)  y  2) el modo demostración de la página (sin servidor).
// No depende de Express ni de la base de datos: solo contiene lógica.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(typeof require === "function" ? require : null);
  else root.RIC_REGLAS = factory(null);
})(this, function (req) {
const crypto = req ? req("crypto") : null;   // solo existe en el servidor
// Reglas del sistema RIC SERVICE: validaciones, permisos, precios base y sesiones.
// Este archivo NO depende de Express ni de la base de datos: solo contiene lógica.

const ESTADOS = ["Recibido", "En diagnóstico", "En reparación", "Listo para entrega", "Entregado"];
const COLECCIONES = ["clientes", "vehiculos", "mecanicos", "diagnosticos", "ordenes", "servicios", "repuestos", "usuarios"];
// Qué colecciones puede crear/editar el empleado (el jefe puede todas)
const ESCRIBE_EMPLEADO = ["clientes", "vehiculos", "diagnosticos", "ordenes"];

const L = "A-Za-zÁÉÍÓÚÜÑáéíóúüñ";
const RE_LETRAS = new RegExp("^[" + L + "]+(?: [" + L + "]+)*$");
const RE_TEXTO = new RegExp("^[" + L + "0-9]+(?:[ .\\-/][" + L + "0-9]+)*$");
const RE_LETRAS_GUION = new RegExp("^[" + L + "]+(?:[ \\-][" + L + "]+)*$");
const RE_CEL = /^[0-9]{7,10}$/;
const RE_CI = /^[0-9]{5,10}$/;   // cédula de identidad (solo números)
const RE_PLACA = /^[0-9]{4}[A-Z]{3}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const limpiar = (s) => String(s == null ? "" : s).trim().replace(/\s+/g, " ");
const titulo = (s) => s.toLocaleUpperCase("es");          // todo el texto se guarda en MAYÚSCULA
const esPlaca = (s) => RE_PLACA.test(String(s || ""));
const falla = (error) => ({ ok: false, error });

// Reparaciones con su MANO DE OBRA de ejemplo: un precio fijo (el jefe lo cambia en "Precios")
const SERVICIOS_BASE = [
  ["Cambio de aceite y filtros de motor", 60], ["Cambio de filtro de aire y aire acondicionado", 40],
  ["Cambio de filtro de combustible", 50], ["Mantenimiento preventivo general", 150],
  ["Mantenimiento correctivo", 200], ["Revisión general para viajes", 100],
  ["Cambio de pastillas de freno", 100], ["Cambio de zapatas y bandas de freno", 120],
  ["Rectificación de discos y tambores de freno", 150], ["Cambio de líquido de frenos y purgado", 60],
  ["Reparación de bomba y sistema ABS", 350], ["Reparación y ajuste de motor (Overhaul)", 1800],
  ["Rectificación de motor", 1500], ["Cambio de correa o cadena de distribución", 450],
  ["Afinación de motor (Tune-up)", 200], ["Limpieza de inyectores por ultrasonido", 250],
  ["Reparación y diagnóstico del sistema de inyección", 300], ["Cambio de bujías y cables", 80],
  ["Diagnóstico computarizado por escáner", 100], ["Regulación de válvulas", 200],
  ["Cambio de kit de embrague (Disco, prensa y collarín)", 600], ["Reparación de caja de cambios manual", 900],
  ["Mantenimiento y reparación de caja automática", 1200], ["Cambio de aceite de transmisión y diferenciales", 120],
  ["Reparación de juntas homocinéticas y semiejes", 350], ["Cambio de amortiguadores y resortes", 400],
  ["Reparación de suspensión y bandejas", 350], ["Cambio de terminales de dirección y rótulas", 150],
  ["Alineación y balanceo computarizado", 100], ["Reparación de cremallera o caja de dirección", 500],
  ["Reparación y baqueteo de radiador", 250], ["Cambio de líquido refrigerante (Coolant)", 50],
  ["Cambio de bomba de agua", 200], ["Cambio de termostato y mangueras", 120],
  ["Reparación del sistema de aire acondicionado y calefacción", 300],
  ["Reparación y soldadura de tubo de escape y silenciador", 150], ["Cambio de catalizador", 250],
  ["Otros", 0],
].map(([nombre, normal], i) => {
  // Precio fijo de ejemplo (el jefe lo cambia en "Precios")
  return { id: "srv" + String(i + 1).padStart(3, "0"), nombre: nombre.toUpperCase(), precio: normal };
});
// Precio fijo de mano de obra de una reparación (las antiguas con 3 niveles usan su precio «normal»)
const precioNivel = (s) => Number(s.precio != null ? s.precio : s.precioNormal) || 0;

// Repuestos de ejemplo: nombre, precio de cada uno (Bs), cantidad disponible, avisar cuando queden (o menos)
const REPUESTOS_BASE = [
  ["Filtro de aceite", 45, 20, 5], ["Filtro de aire", 60, 12, 4], ["Filtro de combustible", 80, 8, 3],
  ["Aceite de motor 1 litro", 70, 30, 6], ["Pastillas de freno delanteras", 180, 6, 3], ["Disco de freno", 320, 2, 3],
  ["Bujía", 35, 16, 4], ["Correa de distribución", 350, 3, 2], ["Amortiguador delantero", 420, 0, 2],
  ["Batería 12V", 650, 4, 2], ["Líquido de frenos", 40, 15, 4], ["Refrigerante galón", 90, 9, 3],
].map(([nombre, precio, stock, minimo], i) => ({ id: "rep" + String(i + 1).padStart(3, "0"), nombre: nombre.toUpperCase(), precio, stock, minimo }));

// ---------- Sesiones (token firmado, sin guardar nada en el servidor) ----------
function firmar(payload, secreto) {
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const firma = crypto.createHmac("sha256", secreto).update(cuerpo).digest("base64url");
  return cuerpo + "." + firma;
}
function verificar(token, secreto) {
  if (!token || typeof token !== "string") return null;
  const [cuerpo, firma] = token.split(".");
  if (!cuerpo || !firma) return null;
  const esperada = crypto.createHmac("sha256", secreto).update(cuerpo).digest("base64url");
  const a = Buffer.from(firma), b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(cuerpo, "base64url").toString());
    return p && p.exp && Date.now() < p.exp ? p : null;
  } catch (e) { return null; }
}
// Contraseñas de usuarios: en el servidor se guardan cifradas (scrypt); en el modo demostración solo se marcan
function hashClave(clave) {
  if (!crypto) return "demo:" + clave;
  const sal = crypto.randomBytes(16);
  return "scrypt$" + sal.toString("hex") + "$" + crypto.scryptSync(String(clave), sal, 32).toString("hex");
}
function verificarClave(clave, guardada) {
  if (!guardada) return false;
  if (guardada.indexOf("demo:") === 0) return guardada === "demo:" + clave;
  if (!crypto) return false;
  const p = String(guardada).split("$");
  if (p[0] !== "scrypt" || p.length !== 3) return false;
  const a = crypto.scryptSync(String(clave), Buffer.from(p[1], "hex"), 32), b = Buffer.from(p[2], "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function igualSeguro(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------- Validación de cada tipo de registro ----------
// ctx = { todos: {coleccion: [registros]}, previo: registro anterior o null }
function validarRegistro(col, d, ctx) {
  const id = d.id, T = ctx.todos, previo = ctx.previo;
  const existe = (lista, x) => (T[lista] || []).find((r) => r.id === x);

  if (col === "clientes") {
    const nombre = limpiar(d.nombre), celular = String(d.celular || "").trim();
    if (nombre.length < 3 || nombre.length > 80 || !RE_LETRAS.test(nombre)) return falla("El nombre solo puede tener letras (mínimo 3).");
    const ci = String(d.ci || "").trim();
    if (!RE_CI.test(ci)) return falla("La cédula de identidad solo puede tener números (de 5 a 10 dígitos).");
    if ((T.clientes || []).some((c) => c.id !== id && c.ci === ci)) return falla("Ya existe un cliente con esa cédula de identidad.");
    if (!RE_CEL.test(celular)) return falla("El celular solo puede tener números (de 7 a 10 dígitos).");
    return { ok: true, data: { id, nombre: titulo(nombre), ci, celular, creado: previo ? previo.creado : new Date().toISOString() } };
  }

  if (col === "vehiculos") {
    const placa = limpiar(d.placa).toUpperCase(), marca = limpiar(d.marca), modelo = limpiar(d.modelo), color = limpiar(d.color);
    if (!esPlaca(placa)) return falla("La placa debe tener 4 números y 3 letras en mayúscula (ejemplo: 1234ABC).");
    if ((T.vehiculos || []).some((v) => v.id !== id && v.placa === placa)) return falla("Ya existe un vehículo registrado con esa placa.");
    if (!RE_LETRAS_GUION.test(marca) || marca.length > 40) return falla("La marca solo puede tener letras.");
    if (!/^[0-9]{4}$/.test(modelo) || Number(modelo) < 1950 || Number(modelo) > new Date().getFullYear() + 1) return falla("El modelo es el año del vehículo: 4 números (ejemplo: 2015).");
    if (!RE_LETRAS_GUION.test(color) || color.length > 30) return falla("El color solo puede tener letras.");
    if (!existe("clientes", d.clienteId)) return falla("Elige al dueño del vehículo (cliente registrado).");
    return { ok: true, data: { id, placa, marca: titulo(marca), modelo, color: titulo(color), clienteId: d.clienteId, creado: previo ? previo.creado : new Date().toISOString() } };
  }

  if (col === "mecanicos") {
    const nombre = limpiar(d.nombre), profesion = limpiar(d.profesion), celular = String(d.celular || "").trim();
    if (nombre.length < 3 || nombre.length > 80 || !RE_LETRAS.test(nombre)) return falla("El nombre solo puede tener letras (mínimo 3).");
    if (profesion.length < 3 || profesion.length > 60 || !RE_LETRAS.test(profesion)) return falla("La profesión solo puede tener letras.");
    const ci = String(d.ci || "").trim();
    if (!RE_CI.test(ci)) return falla("La cédula de identidad solo puede tener números (de 5 a 10 dígitos).");
    if ((T.mecanicos || []).some((m) => m.id !== id && m.ci === ci)) return falla("Ya existe un mecánico con esa cédula de identidad.");
    if (!RE_CEL.test(celular)) return falla("El celular solo puede tener números (de 7 a 10 dígitos).");
    const fechaContrato = String(d.fechaContrato || "").trim();
    if (!RE_FECHA.test(fechaContrato)) return falla("Elige la fecha de inicio del contrato.");
    return { ok: true, data: { id, nombre: titulo(nombre), profesion: titulo(profesion), ci, celular, fechaContrato, creado: previo ? previo.creado : new Date().toISOString() } };
  }

  if (col === "repuestos") {
    const nombre = limpiar(d.nombre), precio = Number(d.precio), stock = Number(d.stock);
    const minimo = d.minimo === undefined || d.minimo === "" ? 3 : Number(d.minimo);
    if (nombre.length < 3 || nombre.length > 80 || /[<>]/.test(nombre)) return falla("Escribe el nombre del repuesto (mínimo 3 letras).");
    if (!isFinite(precio) || precio < 0 || precio > 1000000) return falla("El precio debe ser un número mayor o igual a 0.");
    if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return falla("La cantidad disponible debe ser un número entero (0 o más).");
    if (!Number.isInteger(minimo) || minimo < 0 || minimo > 1000) return falla("El aviso de pocas unidades debe ser un número entero.");
    if ((T.repuestos || []).some((r) => r.id !== id && r.nombre.toLowerCase() === nombre.toLowerCase())) return falla("Ya existe un repuesto con ese nombre.");
    return { ok: true, data: { id, nombre: titulo(nombre), precio: Math.round(precio * 100) / 100, stock, minimo, creado: previo ? previo.creado : new Date().toISOString() } };
  }

  if (col === "usuarios") {
    const nombre = limpiar(d.nombre), usuario = String(d.usuario || "").trim().toLowerCase(), clave = String(d.clave || "");
    const rol = d.rol === "jefe" ? "jefe" : d.rol === "empleado" ? "empleado" : null;
    if (nombre.length < 3 || nombre.length > 80 || !RE_LETRAS.test(nombre)) return falla("El nombre solo puede tener letras (mínimo 3).");
    if (!/^[a-z0-9_.]{3,20}$/.test(usuario)) return falla("El usuario debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo, sin espacios.");
    if ((ctx.reservados || ["admin", "empleado"]).includes(usuario) || (T.usuarios || []).some((u) => u.id !== id && u.usuario === usuario)) return falla("Ese nombre de usuario ya está en uso.");
    if (!rol) return falla("Elige el tipo de usuario: administrador o empleado.");
    if (d.mecanicoId && !existe("mecanicos", d.mecanicoId)) return falla("El mecánico elegido ya no existe.");
    let claveHash = previo ? previo.claveHash : null;
    if (clave) {
      if (clave.length < 6 || clave.length > 40) return falla("La contraseña debe tener de 6 a 40 caracteres.");
      claveHash = hashClave(clave);
    } else if (!previo) return falla("Escribe una contraseña (mínimo 6 caracteres).");
    return { ok: true, data: { id, nombre: titulo(nombre), usuario, rol, mecanicoId: d.mecanicoId || "", claveHash, creado: previo ? previo.creado : new Date().toISOString() } };
  }

  if (col === "servicios") {
    const nombre = limpiar(d.nombre);
    const precio = Number(d.precio !== undefined ? d.precio : d.precioNormal);
    if (nombre.length < 3 || nombre.length > 120 || /[<>]/.test(nombre)) return falla("Escribe el nombre de la reparación (mínimo 3 letras).");
    if (!isFinite(precio) || precio < 0 || precio > 1000000) return falla("El precio debe ser un número mayor o igual a 0.");
    if ((T.servicios || []).some((s) => s.id !== id && s.nombre.toLowerCase() === nombre.toLowerCase())) return falla("Ya existe una reparación con ese nombre.");
    const r2 = (n) => Math.round(n * 100) / 100;
    return { ok: true, data: { id, nombre: titulo(nombre), precio: r2(precio), creado: previo ? previo.creado : new Date().toISOString() } };
  }

  // Diagnósticos y órdenes comparten la validación de cliente, vehículo, mecánico y servicios
  if (col === "diagnosticos" || col === "ordenes") {
    if (!existe("clientes", d.clienteId)) return falla("Elige un cliente registrado.");
    const veh = existe("vehiculos", d.vehiculoId);
    if (!veh) return falla("Elige un vehículo registrado.");
    if (veh.clienteId !== d.clienteId) return falla("Ese vehículo no pertenece al cliente elegido.");
    if (!existe("mecanicos", d.mecanicoId)) return falla("Elige un mecánico registrado.");
    const ids = Array.isArray(d.servicios) ? [...new Set(d.servicios.map(String))] : [];
    if (!ids.length) return falla(col === "diagnosticos" ? "Elige al menos un tipo de reparación." : "Elige al menos una reparación.");
    const cat = ids.map((x) => existe("servicios", x));
    if (cat.some((s) => !s)) return falla("Alguno de los servicios elegidos ya no existe. Actualiza la página.");
    const ahora = new Date().toISOString();

    if (col === "diagnosticos") {
      const descripcion = titulo(String(d.descripcion || "").trim().slice(0, 600));
      // Repuestos que se usarían (solo una indicación para la orden: NO descuenta el inventario)
      const repuestos = [], vistos = new Set();
      for (const x of Array.isArray(d.repuestos) ? d.repuestos : []) {
        const rid = String((x && x.id) || ""), cant = Number(x && x.cantidad);
        if (!rid || vistos.has(rid)) continue;
        vistos.add(rid);
        const rep = existe("repuestos", rid);
        if (!rep) return falla("Un repuesto elegido ya no existe. Actualiza la página.");
        if (!Number.isInteger(cant) || cant < 1 || cant > 1000) return falla("La cantidad de «" + rep.nombre + "» debe ser un número entero desde 1.");
        repuestos.push({ id: rep.id, cantidad: cant });
      }
      return { ok: true, data: { id, clienteId: d.clienteId, vehiculoId: d.vehiculoId, mecanicoId: d.mecanicoId, servicios: ids, repuestos, descripcion, creado: previo ? previo.creado : ahora } };
    }

    const estado = String(d.estado || "");
    if (!ESTADOS.includes(estado)) return falla("Elige un estado válido.");
    const fechaEstimada = String(d.fechaEstimada || "").trim();
    if (fechaEstimada && !RE_FECHA.test(fechaEstimada)) return falla("La fecha estimada de entrega no es válida.");
    const modalidad = d.modalidad === "mano" ? "mano" : "completa";

    // Mano de obra: precio fijo de cada reparación.
    // El precio se "congela" al agregarla: no cambia aunque después el jefe cambie la lista.
    const items = [];
    for (const x of ids) {
      const viejo = previo && (previo.items || []).find((i) => i.id === x);
      if (viejo) { items.push(viejo); continue; }
      const sv = existe("servicios", x);
      items.push({ id: sv.id, nombre: sv.nombre, precio: precioNivel(sv) });
    }

    // Repuestos (solo si es reparación completa)
    const pedidos = [];
    if (modalidad === "completa") {
      const vistos = new Set();
      for (const x of Array.isArray(d.repuestos) ? d.repuestos : []) {
        const rid = String((x && x.id) || ""), cant = Number(x && x.cantidad);
        if (!rid || vistos.has(rid)) continue;
        vistos.add(rid);
        const rep = existe("repuestos", rid);
        if (!rep) return falla("Un repuesto elegido ya no existe. Actualiza la página.");
        if (!Number.isInteger(cant) || cant < 1 || cant > 1000) return falla("La cantidad de «" + rep.nombre + "» debe ser un número entero desde 1.");
        pedidos.push({ rep, cant });
      }
    }
    // Lo que esta misma orden ya tenía reservado se devuelve antes de calcular lo disponible
    const antes = {};
    if (previo && previo.modalidad !== "mano") (previo.repuestos || []).forEach((x) => { antes[x.id] = (antes[x.id] || 0) + Number(x.cantidad || 0); });
    for (const { rep, cant } of pedidos) {
      const disp = rep.stock + (antes[rep.id] || 0);
      if (disp <= 0) return falla("«" + rep.nombre + "» está AGOTADO: ya no hay este repuesto.");
      if (cant > disp) return falla("No hay suficientes «" + rep.nombre + "»: solo quedan " + disp + ".");
    }
    const repuestos = pedidos.map(({ rep, cant }) => {
      const viejo = previo && (previo.repuestos || []).find((i) => i.id === rep.id);
      return { id: rep.id, nombre: viejo ? viejo.nombre : rep.nombre, precio: viejo ? viejo.precio : rep.precio, cantidad: cant };
    });
    // Descuento automático del inventario (solo cambia la diferencia respecto a lo anterior)
    const extras = [];
    new Set([...Object.keys(antes), ...pedidos.map((p) => p.rep.id)]).forEach((rid) => {
      const rep = existe("repuestos", rid);
      if (!rep) return;
      const nuevo = pedidos.find((p) => p.rep.id === rid);
      const stock = rep.stock + (antes[rid] || 0) - (nuevo ? nuevo.cant : 0);
      if (stock !== rep.stock) extras.push({ col: "repuestos", id: rid, data: Object.assign({}, rep, { stock }) });
    });

    const r2 = (n) => Math.round(n * 100) / 100;
    const manoObra = r2(items.reduce((a, i) => a + Number(i.precio || 0), 0));
    const totalRepuestos = r2(repuestos.reduce((a, i) => a + Number(i.precio || 0) * Number(i.cantidad || 0), 0));
    const movimientos = previo ? (previo.movimientos || []).slice() : [];
    if (!previo || previo.estado !== estado) movimientos.push({ estado, fecha: ahora, usuario: ctx.usuario || "" });
    return {
      ok: true,
      extras,
      data: {
        id, clienteId: d.clienteId, vehiculoId: d.vehiculoId, mecanicoId: d.mecanicoId, servicios: ids, items,
        modalidad, repuestos, manoObra, totalRepuestos, total: r2(manoObra + totalRepuestos),
        estado, fechaEstimada, movimientos,
        ingreso: previo ? previo.ingreso : ahora,
        fechaEntrega: estado === "Entregado" ? (previo && previo.fechaEntrega) || ahora : "",
        creado: previo ? previo.creado : ahora,
      },
    };
  }
  return falla("Colección no válida.");
}

// Impide borrar algo que otros registros están usando
function referencias(col, id, T) {
  const usa = (lista, campo) => (T[lista] || []).some((r) => r[campo] === id);
  if (col === "clientes" && (usa("vehiculos", "clienteId") || usa("ordenes", "clienteId"))) return "No se puede eliminar: el cliente tiene vehículos u órdenes registradas.";
  if (col === "vehiculos" && (usa("ordenes", "vehiculoId") || usa("diagnosticos", "vehiculoId"))) return "No se puede eliminar: el vehículo tiene órdenes o diagnósticos registrados.";
  if (col === "mecanicos" && (usa("ordenes", "mecanicoId") || usa("diagnosticos", "mecanicoId"))) return "No se puede eliminar: el mecánico tiene órdenes o diagnósticos registrados.";
  if (col === "mecanicos" && usa("usuarios", "mecanicoId")) return "No se puede eliminar: el mecánico tiene un usuario. Elimina primero su usuario.";
  return null;
}


// ---------- Motor de datos (sin base de datos ni Express) ----------
const USUARIOS_DEMO = [
  { usuario: "admin", clave: "ric2026", rol: "jefe" },
  { usuario: "empleado", clave: "taller2026", rol: "empleado" },
];
const res = (status, json, extra) => Object.assign({ status, json }, extra || {});

// Datos que puede ver cada perfil (las órdenes entregadas solo las ve el jefe)
function listar(rol, T) {
  const out = {};
  COLECCIONES.forEach((c) => (out[c] = (T[c] || []).slice()));
  if (rol !== "jefe") out.ordenes = out.ordenes.filter((o) => o.estado !== "Entregado");
  // Las contraseñas (cifradas) nunca salen del servidor; los usuarios solo los ve el administrador
  out.usuarios = rol === "jefe" ? out.usuarios.map(({ claveHash, ...u }) => u) : [];
  out._rol = rol;
  return out;
}
// Crear o corregir un registro. Devuelve {status, json, guardar:[{col,id,data}]}
// (la orden y, si cambió el inventario, también los repuestos descontados)
function ponerRegistro(rol, usuario, T, col, id, body, opts) {
  if (!COLECCIONES.includes(col)) return res(400, { error: "Colección no válida." });
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(id))) return res(400, { error: "Identificador no válido." });
  if (rol !== "jefe" && !ESCRIBE_EMPLEADO.includes(col)) return res(403, { error: "No tienes permiso para esta sección." });
  const previo = (T[col] || []).find((r) => r.id === id) || null;
  if (col === "ordenes" && previo && previo.estado === "Entregado" && rol !== "jefe")
    return res(403, { error: "Esta orden ya fue entregada: solo el jefe puede verla en el historial." });
  const v = validarRegistro(col, Object.assign({}, body || {}, { id }), { todos: T, previo, usuario, reservados: opts && opts.reservados });
  if (!v.ok) return res(400, { error: v.error });
  return res(200, { ok: true, registro: col === "usuarios" ? (({ claveHash, ...u }) => u)(v.data) : v.data }, { guardar: [{ col, id, data: v.data }].concat(v.extras || []) });
}
function borrarRegistro(rol, T, col, id) {
  if (!COLECCIONES.includes(col)) return res(400, { error: "Colección no válida." });
  if (rol !== "jefe") return res(403, { error: "Solo el jefe puede eliminar registros." });
  const msg = referencias(col, id, T);
  if (msg) return res(409, { error: msg });
  // Si se elimina una orden que aún no se entregó, sus repuestos vuelven al inventario
  const guardar = [];
  const ord = col === "ordenes" ? (T.ordenes || []).find((o) => o.id === id) : null;
  if (ord && ord.estado !== "Entregado" && ord.modalidad !== "mano") {
    (ord.repuestos || []).forEach((x) => {
      const rep = (T.repuestos || []).find((r) => r.id === x.id);
      if (rep) guardar.push({ col: "repuestos", id: rep.id, data: Object.assign({}, rep, { stock: rep.stock + Number(x.cantidad || 0) }) });
    });
  }
  return res(200, { ok: true }, { borrar: { col, id }, guardar });
}
// Consulta pública: solo con la placa, sin datos personales del cliente
function consultar(T, placaTxt) {
  const placa = String(placaTxt || "").toUpperCase();
  if (!esPlaca(placa)) return res(400, { error: "La placa debe tener 4 números y 3 letras en mayúscula (ejemplo: 1234ABC)." });
  const veh = (T.vehiculos || []).find((v) => v.placa === placa);
  const ordenes = veh ? (T.ordenes || []).filter((o) => o.vehiculoId === veh.id)
    .sort((a, b) => (b.ingreso || "").localeCompare(a.ingreso || "")).slice(0, 3) : [];
  if (!ordenes.length) return res(404, { error: "No encontramos órdenes de trabajo para esa placa. Revisa que esté bien escrita o comunícate con el taller." });
  const diag = (T.diagnosticos || []).filter((d) => d.vehiculoId === veh.id).sort((a, b) => (b.creado || "").localeCompare(a.creado || ""))[0];
  return res(200, ordenes.map((o) => {
    const mec = (T.mecanicos || []).find((m) => m.id === o.mecanicoId);
    return {
      vehiculo: veh.marca + " " + veh.modelo, placa: veh.placa, estado: o.estado,
      diagnostico: diag ? diag.descripcion : "", servicios: (o.items || []).map((i) => i.nombre),
      mecanico: mec ? mec.nombre : "", total: o.total, modalidad: o.modalidad || "completa", ingreso: o.ingreso,
      fechaEstimada: o.fechaEstimada || "", fechaEntrega: o.fechaEntrega || "",
    };
  }));
}

// Acceso con usuarios creados en "Gestión de usuarios"
function buscarUsuario(T, usuario, clave) {
  const u = (T.usuarios || []).find((x) => x.usuario === String(usuario || "").trim().toLowerCase());
  return u && verificarClave(String(clave || ""), u.claveHash) ? u : null;
}

// Datos iniciales (solo en una instalación nueva): mano de obra y repuestos de ejemplo
function sembrar(T) {
  const out = [], ahora = new Date().toISOString();
  if ((T.servicios || []).length) return out;
  SERVICIOS_BASE.forEach((x) => out.push({ col: "servicios", id: x.id, data: Object.assign({}, x, { creado: ahora }) }));
  if (!(T.repuestos || []).length) REPUESTOS_BASE.forEach((x) => out.push({ col: "repuestos", id: x.id, data: Object.assign({}, x, { creado: ahora }) }));
  return out;
}

return { ESTADOS, COLECCIONES, ESCRIBE_EMPLEADO, SERVICIOS_BASE, REPUESTOS_BASE, precioNivel, sembrar, hashClave, verificarClave, buscarUsuario, USUARIOS_DEMO, RE_PLACA, esPlaca,
  firmar, verificar, igualSeguro, validarRegistro, referencias, listar, ponerRegistro, borrarRegistro, consultar };
});
