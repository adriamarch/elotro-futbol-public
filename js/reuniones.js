// Calendario de reuniones (/reuniones), para cualquier motivo.
// ACCESO: solo con cuenta de colaborador (usuario y contraseña, como el formulario de acreditación).
// No hay PIN ni código: el servidor comprueba la sesión en cada petición.
// - Periodista con acceso: escribe su nombre, marca las franjas que le vienen bien y las guarda.
//   Ve quién más ha marcado cada franja (para juntar reuniones en grupo), sus reuniones confirmadas
//   (con enlace de videollamada y descarga a su calendario) y los mejores momentos.
// - Responsable con sesión iniciada (rol admin): se redirige al panel (Funcionalidades > Reuniones), donde
//   está toda la gestión: agenda, franjas, plantilla, respuestas, confirmar reuniones, título y texto.
// Backend: /api/reunions/public/* (sesión de cuenta del equipo) y /api/reunions/admin/* (solo Responsables).
// Todas las horas son hora de Madrid, tal cual (sin conversiones de zona).
(function () {
  "use strict";

  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  const DIAS_C = ["L", "M", "X", "J", "V", "S", "D"];
  const DIAS_3 = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const K_IDENTIDAD = "eof_reuniones_id";
  const K_SESION = "eof_reuniones_token"; // sesión de colaborador iniciada desde esta página (solo esta pestaña)
  const RUTA = "/reuniones";

  // ---------- fechas (todo en UTC "de pega": son horas de Madrid sin zona) ----------
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const leeYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const sumaDias = (d, n) => { const r = new Date(d.getTime()); r.setUTCDate(r.getUTCDate() + n); return r; };
  const dsem = (d) => (d.getUTCDay() + 6) % 7; // 0 = lunes
  const mkClave = (ds, min) => `${ds}T${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const claveMin = (k) => +k.slice(11, 13) * 60 + +k.slice(14, 16);
  const claveFecha = (k) => k.slice(0, 10);
  const horaTxt = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  const fechaLarga = (ds) => { const d = leeYmd(ds); const t = `${DIAS[dsem(d)]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`; return t.charAt(0).toUpperCase() + t.slice(1); };
  function siguiente(k) { let m = claveMin(k) + 30, d = claveFecha(k); if (m >= 1440) { m -= 1440; d = ymd(sumaDias(leeYmd(d), 1)); } return mkClave(d, m); }
  function anterior(k) { let m = claveMin(k) - 30, d = claveFecha(k); if (m < 0) { m += 1440; d = ymd(sumaDias(leeYmd(d), -1)); } return mkClave(d, m); }
  function ahoraMadrid() {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  // Hora de Madrid -> instante UTC real (para el archivo .ics).
  function madridAUtc(ds, min) {
    const [y, m, d] = ds.split("-").map(Number);
    const objetivo = Date.UTC(y, m - 1, d, 0, 0) + min * 60000;
    const desfase = (ts) => {
      const p = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(new Date(ts)).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ts;
    };
    let u = objetivo - desfase(objetivo);
    u = objetivo - desfase(u);
    return new Date(u);
  }
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const COLORES_AV = ["#d1132e", "#152b46", "#1f7fb5", "#9c0e23", "#1b3a5f", "#17719e", "#8a5d00", "#0c1b2e"]; // paleta ElOtroFútbol
  const colorNombre = (nom) => { let h = 0; for (const c of String(nom)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORES_AV[h % COLORES_AV.length]; };
  const iniciales = (nom) => { const p = String(nom || "?").trim().split(/\s+/); return ((p[0] || "?")[0] + (p.length > 1 ? p[1][0] : "")).toUpperCase(); };
  const avatar = (nom) => `<span class="av" style="background:${colorNombre(nom)}" aria-hidden="true">${esc(iniciales(nom))}</span>`;
  const chips = (v, max) => {
    const ver = v.slice(0, max || 8);
    return `<span class="chips">${ver.map((x) => `<span class="chip${x.yo ? " yo" : ""}">${avatar(x.nombre)}${esc(x.nombre)}</span>`).join("")}${v.length > ver.length ? `<span class="chip">+${v.length - ver.length}</span>` : ""}</span>`;
  };

  // ---------- estado ----------
  // Sesión del panel (localStorage, la usa el Responsable) o, si no hay, la que se abre desde esta página
  // con usuario y contraseña (sessionStorage: se pierde al cerrar la pestaña).
  let TOKEN = null, USUARIO = null, TOKEN_PANEL = null, TOKEN_LOCAL = null;
  try { TOKEN_PANEL = localStorage.getItem("eof_token"); USUARIO = JSON.parse(localStorage.getItem("eof_user") || "null"); } catch { /* sin sesión */ }
  try { TOKEN_LOCAL = sessionStorage.getItem(K_SESION); } catch { /* sin sesión */ }
  TOKEN = TOKEN_PANEL || TOKEN_LOCAL || null;
  const S = {
    cfg: { titol: "Reuniones", descripcio: "", obert: true },
    franjas: new Map(),   // clave -> { estado, grupo, nota, enlace }
    personas: new Map(),  // pid -> nombre
    votos: new Map(),     // clave -> [pid]
    ahora: ahoraMadrid(),
    id: null, nombre: "", nombreGuardado: "", mios: new Set(), originales: new Set(), editandoNombre: false,
    conSesion: !!TOKEN, autoNombre: false,
    responsable: !!(TOKEN_PANEL && USUARIO && USUARIO.rol === "admin"),
    modo: "editar", herramienta: "disponible", inicio: null, nDias: 7, maxV: 1, cargado: false, runs: [], resalta: null,
    susp: new Set(),      // "pid|grupo": persona con esa reunión EN PAUSA (ya tiene otra programada antes)
    activa: new Map(),    // pid -> grupo de su reunión vigente
    pend: [], rev: null,
  };
  // La gestión (agenda, franjas, plantilla, confirmar reuniones, participantes, ajustes) vive ahora en el
  // panel: Funcionalidades > Reuniones. Un Responsable con sesión del panel va directo allí.
  if (S.responsable) { location.replace("/admin/panel.html?ir=funcionalidades.reuniones"); return; }
  let ultimaSync = Date.now(), sinRed = false;
  try {
    const g = JSON.parse(localStorage.getItem(K_IDENTIDAD) || "null");
    if (g && g.pid && g.secret) { S.id = { pid: g.pid, secret: g.secret }; S.nombre = g.nombre || ""; S.nombreGuardado = S.nombre; }
    else if (g && g.nombre) S.nombre = g.nombre;
  } catch { /* sin identidad */ }

  // ---------- red ----------
  async function api(ruta, opciones, conSesion) {
    const headers = { "Content-Type": "application/json" };
    if (conSesion && TOKEN) headers.Authorization = "Bearer " + TOKEN;
    const f = window.eofApiFetch || ((p, o) => fetch(p, o));
    const res = await f(ruta, { ...(opciones || {}), headers });
    let data = null; try { data = await res.json(); } catch { /* sin cuerpo */ }
    if (!res.ok) {
      const e = new Error((data && data.error) || "No se ha podido establecer la conexión. Inténtelo de nuevo.");
      e.status = res.status; throw e;
    }
    return data;
  }
  // Llamada de participante: siempre lleva la sesión de la cuenta del equipo.
  const apiPublica = (sub, cuerpo) => api("/api/reunions/public/" + sub, { method: "POST", body: JSON.stringify(cuerpo || {}) }, true);
  let tToast = null;
  function aviso(msg, error) {
    const t = $("#toast"); t.textContent = msg; t.className = "v" + (error ? " err" : "");
    clearTimeout(tToast); tToast = setTimeout(() => { t.className = ""; }, error ? 4800 : 2800);
  }

  // ---------- pantalla de acceso (cuenta de colaborador) ----------
  function muestraAcceso(msg) {
    $("#app").hidden = true; $("#barra").classList.remove("visible");
    $("#acceso").hidden = false;
    $("#accesoError").textContent = msg || "";
    $("#frmAcceso").classList.toggle("error", !!msg);
    $("#lnkLogin").href = "/acceso.html?modo=redactor&volver=" + encodeURIComponent(RUTA);
    $("#loginClave").value = "";
    setTimeout(() => { const u = $("#loginUsuario"); if (!u.value) u.focus(); else $("#loginClave").focus(); }, 30);
  }
  function ocultaAcceso() { $("#acceso").hidden = true; $("#app").hidden = false; }
  async function entrarConLogin(username, password) {
    if (!username || !password) { muestraAcceso("Introduzca su usuario y su contraseña."); return; }
    const b = $("#btnEntrar"); b.disabled = true; b.textContent = "Verificando…";
    try {
      // Si este navegador ya es un dispositivo de confianza (se marcó al iniciar sesión en /acceso),
      // el servidor no pide el 2FA y los Responsables también pueden entrar aquí.
      let dispositivo; try { dispositivo = localStorage.getItem("eof_td_" + encodeURIComponent(username)) || undefined; } catch { /* ignorar */ }
      const data = await api("/api/login", { method: "POST", body: JSON.stringify({ username, password, dispositivo }) });
      if (data.requiere_2fa || data.requiere_configurar_2fa) throw new Error("Las cuentas de Responsable requieren verificación en dos pasos. Inicie sesión primero en el panel de gestión (/acceso) y, a continuación, vuelva a esta página.");
      if (!data.token) throw new Error("Usuario o contraseña incorrectos.");
      TOKEN = data.token; TOKEN_LOCAL = data.token; S.conSesion = true;
      try { sessionStorage.setItem(K_SESION, data.token); } catch { /* ignorar */ }
      if (data.user && data.user.nombre && !S.nombre && !S.id) { S.nombre = data.user.nombre; S.autoNombre = true; }
      $("#loginClave").value = "";
      ocultaAcceso(); await carga(false);
    } catch (e) {
      TOKEN = TOKEN_PANEL || null; TOKEN_LOCAL = null; S.conSesion = !!TOKEN;
      try { sessionStorage.removeItem(K_SESION); } catch { /* ignorar */ }
      muestraAcceso(e.message || "No se ha podido iniciar sesión.");
    } finally { b.disabled = false; b.textContent = "Iniciar sesión"; }
  }
  // Cierra la sesión abierta desde esta página (la del panel se cierra desde el panel).
  function cerrarAcceso() {
    TOKEN_LOCAL = null; TOKEN = TOKEN_PANEL || null; S.conSesion = !!TOKEN;
    try { sessionStorage.removeItem(K_SESION); } catch { /* ignorar */ }
    S.cargado = false; S.responsable = false;
    muestraAcceso("");
  }

  // ---------- sesión del sitio: detección automática ----------
  // Si ya has iniciado sesión como colaborador en el resto de la web (token «eof_token»), esta página entra sola
  // y usa tu nombre. También reacciona si inicias o cierras sesión en otra pestaña, sin recargar.
  let TOKEN_RECHAZADO = null;
  async function nombreDeSesion() {
    if (S.nombre || S.id) return;
    let nom = (USUARIO && (USUARIO.nombre || USUARIO.username)) || "";
    if (!nom) { try { const r = await apiPublica("acceso", {}); nom = (r && r.usuario && r.usuario.nombre) || ""; } catch { /* sin nombre */ } }
    nom = String(nom).replace(/\s+/g, " ").trim().slice(0, 40);
    if (nom.length >= 2 && !S.nombre && !S.id) { S.nombre = nom; S.autoNombre = true; }
  }
  function sincronizaSesion() {
    let t = null, u = null;
    try { t = localStorage.getItem("eof_token"); u = JSON.parse(localStorage.getItem("eof_user") || "null"); } catch { /* sin sesión */ }
    if (t && t !== TOKEN_PANEL && t !== TOKEN_RECHAZADO) {
      TOKEN_PANEL = t; USUARIO = u; TOKEN = t; S.conSesion = true;
      if (u && u.rol === "admin") { location.replace("/admin/panel.html?ir=funcionalidades.reuniones"); return; }
      S.cargado = false; S.nombre = S.id ? S.nombre : ""; S.autoNombre = false;
      ocultaAcceso(); carga(false);
    } else if (!t && TOKEN_PANEL) {
      TOKEN_PANEL = null; USUARIO = null; TOKEN = TOKEN_LOCAL || null; S.conSesion = !!TOKEN;
      if (!TOKEN) { S.cargado = false; S.autoNombre = false; muestraAcceso(""); }
    }
  }

  // ---------- carga ----------
  async function carga(silencio) {
    let d = null;
    if (S.responsable) {
      try { d = await api("/api/reunions/admin", {}, true); }
      catch (e) { if (e.status === 401 || e.status === 403) S.responsable = false; else if (!silencio) aviso(e.message, true); }
    }
    if (!d) {
      try { d = await apiPublica("estado", { pid: S.id && S.id.pid, secret: S.id && S.id.secret }); }
      catch (e) {
        if (e.status === 401) { if (TOKEN_PANEL && TOKEN === TOKEN_PANEL) { TOKEN_RECHAZADO = TOKEN_PANEL; TOKEN_PANEL = null; USUARIO = null; TOKEN = TOKEN_LOCAL || null; } cerrarAcceso(); muestraAcceso(silencio ? "Su sesión ha caducado. Inicie sesión de nuevo." : e.message); return; }
        if (!silencio) aviso(e.message, true);
        if (!S.cargado) { ocultaAcceso(); pintaTodo(); }
        return;
      }
    }
    ocultaAcceso();
    const previas = new Set(S.personas.keys());
    aplica(d);
    await nombreDeSesion();
    ultimaSync = Date.now(); sinRed = false;
    if (silencio && S.cargado && S.responsable) {
      const nuevos = [...S.personas.entries()].filter(([p]) => !previas.has(p)).map(([, n]) => n);
      if (nuevos.length) aviso(nuevos.length === 1 ? `${nuevos[0]} ha enviado su disponibilidad.` : `${nuevos.length} participantes nuevos han respondido.`);
    }
    if (!S.cargado) { S.cargado = true; saltaPrimeraFranja(); }
    pintaTodo();
  }
  function aplica(d) {
    S.cfg = d.config; S.ahora = d.ahora || d.ara || ahoraMadrid();
    S.franjas = new Map((d.franges || []).map((f) => [f.clau, { estado: f.estat, grupo: f.grup, nota: f.nota || "", enlace: f.enllac || "" }]));
    S.personas = new Map((d.persones || []).map((p) => [p.pid, p.nom]));
    S.susp = new Set((d.suspesos || []).map((x) => x.pid + "|" + x.grup));
    S.activa = new Map((d.ocupats || []).map((x) => [x.pid, x.grup]));
    S.rev = d.rev || null;
    S.votos = new Map();
    for (const v of d.vots || []) { if (!S.votos.has(v.clau)) S.votos.set(v.clau, []); S.votos.get(v.clau).push(v.pid); }
    if (S.id && !S.personas.has(S.id.pid) && S.cargado) { /* nos han borrado: se mantiene el nombre, se pierde la identidad */ S.id = null; S.originales = new Set(); guardaId(); }
    if (!hayCambios()) {
      S.mios = new Set(); if (S.id) for (const [k, pids] of S.votos) if (pids.includes(S.id.pid)) S.mios.add(k);
      S.originales = new Set(S.mios);
    }
  }
  function guardaId() {
    try { localStorage.setItem(K_IDENTIDAD, JSON.stringify(S.id ? { ...S.id, nombre: S.nombre } : (S.nombre ? { nombre: S.nombre } : null))); } catch { /* ignorar */ }
  }
  function saltaPrimeraFranja() {
    const claves = [...S.franjas.keys()].filter((k) => k >= S.ahora).sort();
    const hoy = leeYmd(S.ahora.slice(0, 10));
    S.nDias = window.innerWidth < 720 ? 3 : 7;
    S.inicio = S.nDias === 7 ? sumaDias(hoy, -dsem(hoy)) : hoy;
    if (claves.length && !S.responsable) {
      const primera = leeYmd(claveFecha(claves[0]));
      if (primera >= sumaDias(S.inicio, S.nDias)) S.inicio = S.nDias === 7 ? sumaDias(primera, -dsem(primera)) : primera;
    }
  }

  // ---------- votos ----------
  // Regla "una reunión por persona": en una reunión confirmada no cuentan quienes la tienen en pausa (ya tienen otra
  // programada antes) y, en una franja aún abierta, no cuentan quienes ya tienen una reunión vigente. Sus respuestas se
  // conservan: si la otra reunión se cancela, vuelven a contar solas.
  function votantes(k) {
    const f = S.franjas.get(k), conf = !!(f && f.estado === "confirmada");
    const libre = (pid) => (conf ? !S.susp.has(pid + "|" + f.grupo) : !S.activa.has(pid));
    const v = (S.votos.get(k) || []).filter((p) => !(S.id && p === S.id.pid) && libre(p)).map((p) => ({ id: p, nombre: S.personas.get(p) || "?" }));
    if (S.mios.has(k) && (!S.id || libre(S.id.pid))) v.push({ id: S.id ? S.id.pid : "_yo", nombre: S.nombre || "Usted", yo: true });
    return v;
  }
  const enPausa = (g, pid) => S.susp.has(pid + "|" + g.grupo);
  const pausadosDe = (g) => (S.votos.get(g.ini) || []).filter((p) => S.susp.has(p + "|" + g.grupo));
  function recalculaMax() { let m = 1; for (const [k, f] of S.franjas) if (f.estado === "disponible") m = Math.max(m, votantes(k).length); S.maxV = m; }
  function hayCambios() {
    if (S.mios.size !== S.originales.size) return true;
    for (const k of S.mios) if (!S.originales.has(k)) return true;
    return false;
  }

  // ---------- celdas ----------
  const modoEditar = () => S.responsable && S.modo === "editar";
  function infoCelda(k) {
    const f = S.franjas.get(k), m = claveMin(k);
    let cls = "cel" + (m % 60 === 0 ? " entera" : ""), txt = "", inter = false;
    if (k < S.ahora) return { cls: cls + " off pasado", txt, inter, h: 0 };
    const resaltada = S.resalta && (S.votos.get(k) || []).includes(S.resalta) ? " res" : "";
    if (!f) { cls += " off"; if (modoEditar()) { cls += " editable"; inter = true; } return { cls, txt, inter, h: 0 }; }
    const v = votantes(k);
    if (f.estado === "confirmada") {
      const prev = S.franjas.get(anterior(k)), sig = S.franjas.get(siguiente(k));
      const primera = !prev || prev.grupo !== f.grupo, ultima = !sig || sig.grupo !== f.grupo;
      cls += " conf" + (primera ? " primera" : "") + (ultima ? " ultima" : "") + (v.some((x) => x.yo) ? " mio" : "") + resaltada;
      return { cls, txt: primera ? (f.nota || "Reunión") : "", inter: S.responsable && S.modo === "resp", h: 0 };
    }
    if (f.estado === "no_puc") { cls += " nopuc"; if (modoEditar()) { cls += " editable"; inter = true; } return { cls, txt, inter, h: 0 }; }
    cls += " abierto" + (S.mios.has(k) ? " mio" : "") + (modoEditar() ? " editable" : "") + resaltada;
    return { cls, txt: v.length ? String(v.length) : "", inter: true, h: v.length / S.maxV };
  }
  const interactiva = (k) => infoCelda(k).inter;

  // ---------- pintado ----------
  function pintaTodo() { pintaCabecera(); pintaAgenda(); pintaQuien(); pintaHerramientas(); pintaGraella(); pintaLateral(); pintaBarra(); }
  function pintaCabecera() {
    const titulo = S.cfg.titol || "Reuniones";
    $("#titulo").textContent = titulo;
    document.title = titulo + " — ELOTROFÚTBOLTV";
    $("#descripcion").textContent = S.cfg.descripcio || "";
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } })();
    const el = $("#tz");
    if (tz && tz !== "Europe/Madrid" && tz !== "Atlantic/Canary") { el.className = "tz aviso"; el.textContent = `Aviso: su dispositivo está configurado en la zona horaria ${tz}. Todas las horas de esta página corresponden a la hora de Madrid.`; }
    else { el.className = "tz"; el.textContent = "Horario: todas las horas corresponden a la hora de Madrid"; }
    const abiertas = [...S.franjas.entries()].filter(([k, f]) => f.estado === "disponible" && k >= S.ahora).length;
    const reuniones = grupos().filter((g) => g.fin >= S.ahora).length;
    $("#cifras").innerHTML = S.cfg.obert || S.responsable
      ? `<span><b>${S.personas.size}</b> ${S.personas.size === 1 ? "participante" : "participantes"}</span><span><b>${(abiertas / 2).toLocaleString("es")}</b> horas habilitadas</span><span><b>${reuniones}</b> ${reuniones === 1 ? "reunión confirmada" : "reuniones confirmadas"}</span>` : "";
    $("#btnSalir").hidden = !(TOKEN_LOCAL && !TOKEN_PANEL);
  }
  function pintaHerramientas() {
    $("#eines").hidden = !S.responsable;
    if (!S.responsable) return;
    $("#modoEditar").setAttribute("aria-pressed", String(S.modo === "editar"));
    $("#modoResp").setAttribute("aria-pressed", String(S.modo === "resp"));
    $("#pinceles").hidden = S.modo !== "editar"; $("#btnPlantilla").hidden = S.modo !== "editar";
    for (const b of $("#pinceles").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.eina === S.herramienta));
    $("#chkAbierto").checked = !!S.cfg.obert;
  }
  function pintaQuien() {
    const el = $("#quien");
    el.hidden = S.responsable || !S.cfg.obert;
    if (el.hidden) return;
    if (document.activeElement && document.activeElement.id === "inNombre") return; // no interrumpir mientras escribe
    el.classList.toggle("auto", !!(S.autoNombre && !S.id && !S.editandoNombre));
    if (S.autoNombre && !S.id && !S.editandoNombre) {
      el.innerHTML = `${avatar(S.nombre)}<div class=\"hola\">Hola, ${esc(S.nombre)}<small><span class=\"sesion-ok\">Sesión detectada</span>Hemos puesto su nombre automáticamente. Seleccione su disponibilidad y pulse «Guardar respuesta».</small></div>
        <button type=\"button\" class=\"btn sm\" id=\"btnOtroNombre\">Usar otro nombre</button>`;
    } else if (S.id && !S.editandoNombre) {
      el.innerHTML = `${avatar(S.nombre)}<div class="hola">${esc(S.nombre)}<small>${S.activa.has(S.id.pid) ? "Ya tiene una reunión programada. Mientras se mantenga, el resto de franjas que seleccione no se tendrán en cuenta; si se cancela, volverán a contar." : "Seleccione o retire franjas y pulse «Guardar respuesta». Podrá modificar su respuesta cuando lo desee desde este dispositivo."}</small></div>
        <button type="button" class="btn sm" id="btnCambiaNombre">Modificar nombre</button><button type="button" class="btn sm peligro" id="btnBaja">Eliminar mis datos</button>`;
    } else {
      el.innerHTML = `<input type="text" id="inNombre" maxlength="40" autocomplete="name" placeholder="Nombre y apellidos" value="${esc(S.nombre)}" aria-label="Nombre y apellidos">
        ${S.id ? `<span class="mut" style="flex:1 1 200px">Modifique el nombre y guarde los cambios.</span><button type="button" class="btn sm" id="btnNombreOk">Aceptar</button>`
          : `<span class="pasos"><span><b>1</b>Indique su nombre y apellidos</span><span><b>2</b>Seleccione su disponibilidad</span><span><b>3</b>Pulse «Guardar respuesta»</span></span>`}`;
    }
  }

  function rangoHoras() {
    let min = 1440, max = -1;
    for (const k of S.franjas.keys()) { const m = claveMin(k); if (m < min) min = m; if (m > max) max = m; }
    if (S.responsable) { min = Math.min(min, 8 * 60); max = Math.max(max, 23 * 60 + 30); }
    if (max < 0) { min = 9 * 60; max = 20 * 60 + 30; }
    min = Math.floor(min / 60) * 60; max = Math.floor(max / 60) * 60 + 30;
    if (max - min < 150) max = min + 150;
    return [min, Math.min(max, 23 * 60 + 30)];
  }
  function pintaGraella() {
    const cal = $("#cal");
    const cerrado = !S.cfg.obert && !S.responsable;
    $(".fila").style.display = cerrado ? "block" : "";
    $("#cardMejores").hidden = cerrado || S.responsable; $("#cardConf").hidden = cerrado || S.responsable; // el Responsable lo ve en la Agenda
    if (cerrado) {
      $("#graella").innerHTML = `<div class="cerrado" style="grid-column:1/-1"><h2>Calendario cerrado</h2><p class="mut">En este momento no se admiten nuevas respuestas. Consulte esta página de nuevo más adelante.</p></div>`;
      $("#leyenda").innerHTML = ""; $("#rango").textContent = "—"; cal.querySelector(".nav").style.visibility = "hidden"; return;
    }
    cal.querySelector(".nav").style.visibility = "";
    recalculaMax();
    const [min, max] = rangoHoras();
    const g = $("#graella");
    const dias = []; for (let i = 0; i < S.nDias; i++) dias.push(sumaDias(S.inicio, i));
    const hoy = S.ahora.slice(0, 10);
    g.style.gridTemplateColumns = `48px repeat(${S.nDias}, minmax(${S.nDias === 3 ? 92 : 78}px, 1fr))`;
    let h = `<div class="cab-dia"></div>`;
    for (const d of dias) {
      const ds = ymd(d);
      const interior = `<b>${DIAS_3[dsem(d)]}</b><span>${d.getUTCDate()}</span>`;
      const marcable = ds >= hoy && (modoEditar() || (!S.responsable && diaTieneAbiertas(ds)));
      const ayuda = modoEditar() ? "Aplicar la acción seleccionada a todo el día" : "Seleccionar o retirar todo el día";
      h += `<div class="cab-dia${ds === hoy ? " hoy" : ""}">${marcable ? `<button type="button" data-dia="${ds}" title="${ayuda}" aria-label="${ayuda}: ${esc(fechaLarga(ds))}">${interior}<i class="dia-entero">${modoEditar() ? "todo el día" : "todo"}</i></button>` : interior}</div>`;
    }
    for (let m = min; m <= max; m += 30) {
      h += `<div class="hora">${m % 60 === 0 ? horaTxt(m) : ""}</div>`;
      for (const d of dias) {
        const k = mkClave(ymd(d), m), i = infoCelda(k);
        const etq = `${fechaLarga(ymd(d))} a las ${horaTxt(m)}`;
        h += i.inter
          ? `<button type="button" class="${i.cls}" data-k="${k}" style="--h:${i.h.toFixed(2)}" aria-label="${esc(etq)}" aria-pressed="${/\bmio\b/.test(i.cls)}"><span class="n">${esc(i.txt)}</span></button>`
          : `<div class="${i.cls}" data-k="${k}" style="--h:0"><span class="n">${esc(i.txt)}</span></div>`;
      }
    }
    g.innerHTML = h;
    const d1 = dias[0], d2 = dias[dias.length - 1];
    $("#rango").textContent = d1.getUTCMonth() === d2.getUTCMonth()
      ? `${d1.getUTCDate()}–${d2.getUTCDate()} ${MESES[d1.getUTCMonth()]} ${d1.getUTCFullYear()}`
      : `${d1.getUTCDate()} ${MESES_C[d1.getUTCMonth()]} – ${d2.getUTCDate()} ${MESES_C[d2.getUTCMonth()]} ${d2.getUTCFullYear()}`;
    const lim = S.nDias === 7 ? sumaDias(leeYmd(hoy), -dsem(leeYmd(hoy))) : leeYmd(hoy);
    $("#prev").disabled = ymd(S.inicio) <= ymd(lim);
    const hayAbiertas = [...S.franjas.values()].some((f) => f.estado === "disponible");
    if (!hayAbiertas && !S.responsable) g.insertAdjacentHTML("beforeend", `<div class="vacio-msg" style="grid-column:1/-1">Todavía no se han habilitado franjas de disponibilidad.</div>`);
    $("#leyenda").innerHTML = `<span><i class="sw ok"></i>Franja habilitada</span><span><i class="sw mio"></i>${S.responsable ? "Con respuestas" : "Seleccionada por usted"}</span><span><i class="sw conf"></i>Reunión confirmada</span>${S.responsable ? `<span><i class="sw no"></i>Bloqueada</span>` : ""}<span><i class="sw off"></i>Sin habilitar</span>${S.responsable ? "" : `<span>La cifra indica cuántos participantes han seleccionado la franja</span>`}`;
  }
  function diaTieneAbiertas(ds) {
    for (const [k, f] of S.franjas) if (f.estado === "disponible" && k >= S.ahora && claveFecha(k) === ds) return true;
    return false;
  }
  function actualizaCelda(k) {
    const el = $(`[data-k="${k}"]`, $("#graella")); if (!el) return;
    const i = infoCelda(k);
    el.className = i.cls; el.style.setProperty("--h", i.h.toFixed(2));
    const n = el.querySelector(".n"); if (n) n.textContent = i.txt;
    el.setAttribute("aria-pressed", String(/\bmio\b/.test(i.cls)));
  }

  // ---------- panel lateral ----------
  function construyeRuns() {
    const claves = [...S.franjas.entries()].filter(([k, f]) => f.estado === "disponible" && k >= S.ahora).map(([k]) => k).sort();
    const out = []; let cur = null;
    for (const k of claves) {
      const v = votantes(k), sig = v.map((x) => x.id).sort().join(",");
      if (cur && siguiente(cur.fin) === k && cur.sig === sig) { cur.fin = k; cur.n++; }
      else { if (cur) out.push(cur); cur = { ini: k, fin: k, n: 1, sig, v }; }
    }
    if (cur) out.push(cur);
    return out;
  }
  function calculaRuns() {
    const min = S.responsable ? 1 : 2;
    return construyeRuns().filter((r) => r.v.length >= min).sort((a, b) => b.v.length - a.v.length || (a.ini < b.ini ? -1 : 1)).slice(0, 6);
  }
  // Por convocar: franjas con respuestas, de la más próxima a la más lejana.
  function calculaPendientes() {
    return construyeRuns().filter((r) => r.v.length >= 1).sort((a, b) => (a.ini < b.ini ? -1 : 1)).slice(0, 8);
  }

  // ---------- urgencia y cuenta atrás ----------
  const claveAbs = (k) => leeYmd(claveFecha(k)).getTime() / 60000 + claveMin(k);
  const ahoraAbs = () => claveAbs(S.ahora);
  function durTxt(m) {
    m = Math.max(1, Math.round(m));
    if (m < 60) return `${m} min`;
    if (m < 1440) { const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min` : `${h} h`; }
    const d = Math.floor(m / 1440), h = Math.round((m % 1440) / 60);
    return d >= 3 || !h ? plural(d, "día", "días") : `${plural(d, "día", "días")} y ${h} h`;
  }
  // n: 0 en curso · 1 hoy · 2 mañana · 3 esta semana · 4 más adelante · 5 celebrada
  function urgencia(iniK, finK, pendiente) {
    const ahora = ahoraAbs(), ini = claveAbs(iniK) - ahora, fin = claveAbs(finK) + 30 - ahora;
    const dias = Math.round((leeYmd(claveFecha(iniK)) - leeYmd(S.ahora.slice(0, 10))) / 86400000);
    if (!pendiente && fin <= 0) return { n: 5, cls: "u5", etq: "Celebrada", cuenta: "ya ha terminado" };
    if (ini <= 0) return pendiente ? { n: 1, cls: "u1", etq: "Inminente", cuenta: "empieza ya" } : { n: 0, cls: "u0", etq: "En curso", cuenta: `termina en ${durTxt(fin)}` };
    if (dias <= 0) return { n: 1, cls: "u1", etq: ini < 180 ? "Inminente" : "Hoy", cuenta: `empieza en ${durTxt(ini)}` };
    if (dias === 1) return { n: 2, cls: "u2", etq: "Mañana", cuenta: `en ${durTxt(ini)}` };
    if (dias <= 6) return { n: 3, cls: "u3", etq: `En ${dias} días`, cuenta: `en ${durTxt(ini)}` };
    return { n: 4, cls: "u4", etq: `En ${dias} días`, cuenta: `dentro de ${plural(dias, "día", "días")}` };
  }
  const rangoTxt = (ini, fin) => `${horaTxt(claveMin(ini))}–${horaTxt(claveMin(fin) + 30)}`;
  function grupos() {
    const gs = new Map();
    for (const [k, f] of [...S.franjas.entries()].sort()) {
      if (f.estado !== "confirmada" || !f.grupo) continue;
      const g = gs.get(f.grupo) || { grupo: f.grupo, ini: k, fin: k, nota: f.nota, enlace: f.enlace };
      g.fin = k; if (f.enlace) g.enlace = f.enlace; gs.set(f.grupo, g);
    }
    return [...gs.values()].sort((a, b) => (a.ini < b.ini ? -1 : 1));
  }
  const estoyEn = (g) => votantes(g.ini).some((x) => x.yo);
  // Responsable: selector para apuntar a un participante a una reunión ya confirmada (no sale quien ya está).
  function opcionesUnir(g) {
    const dentro = new Set(S.votos.get(g.ini) || []);
    const libres = [...S.personas.entries()].filter(([p]) => !dentro.has(p)).sort((a, b) => a[1].localeCompare(b[1], "es"));
    if (!libres.length || g.fin < S.ahora) return "";
    return `<div class="acc"><select data-sel-unir="${g.grupo}" aria-label="Añadir participante a la reunión"><option value="">Añadir participante…</option>${libres.map(([p, n]) => `<option value="${esc(p)}">${esc(n)}</option>`).join("")}</select><button type="button" class="btn sm" data-anade-grupo="${g.grupo}">Añadir</button></div>`;
  }
  function pintaLateral() {
    S.runs = calculaRuns();
    $("#mejores").innerHTML = S.runs.length ? S.runs.map((r, i) => {
      const yo = r.v.some((x) => x.yo);
      return `<li class="item"><div class="qt"><span>${esc(fechaLarga(claveFecha(r.ini)))} · ${rangoTxt(r.ini, r.fin)}</span><em>${plural(r.v.length, "participante", "participantes")}</em></div>${chips(r.v, 6)}
        <div class="acc">${S.responsable ? `<button type="button" class="btn sm prim" data-run="${i}" data-acc="confirma">Confirmar reunión</button>` : (yo ? `<button type="button" class="btn sm" data-run="${i}" data-acc="quita">Retirar selección</button>` : `<button type="button" class="btn sm prim" data-run="${i}" data-acc="une">Seleccionar franja</button>`)}
        <button type="button" class="btn sm fantasma" data-run="${i}" data-acc="ver">Ver en calendario</button></div></li>`;
    }).join("") : `<li class="mut">${S.responsable ? "Cuando los participantes seleccionen franjas, aquí se mostrarán las de mayor coincidencia." : "Las franjas seleccionadas por más de un participante se mostrarán aquí."}</li>`;

    const gs = grupos().filter((g) => g.fin >= S.ahora || S.responsable);
    $("#confirmadas").innerHTML = gs.length ? gs.map((g) => {
      const v = votantes(g.ini), yo = estoyEn(g);
      return `<li class="item conf${yo ? " mia" : ""}"><div class="qt"><span>${esc(fechaLarga(claveFecha(g.ini)))} · ${rangoTxt(g.ini, g.fin)}</span><em>Confirmada</em></div>
        ${g.nota ? `<div class="mut">${esc(g.nota)}</div>` : ""}${v.length ? chips(v, 8) : `<span class="mut">Sin participantes inscritos</span>`}
        ${S.responsable ? `<div class="acc"><button type="button" class="btn sm" data-copia="${g.grupo}">Copiar convocatoria</button><button type="button" class="btn sm peligro" data-cancela="${g.grupo}">Cancelar reunión</button></div>${opcionesUnir(g)}` : (!yo && S.cfg.obert && g.fin >= S.ahora ? `<div class="acc"><button type="button" class="btn sm prim" data-une-grupo="${g.grupo}">Unirme a esta reunión</button></div>` : "")}</li>`;
    }).join("") : `<li class="mut">Todavía no hay reuniones confirmadas.</li>`;

    // Mis reuniones (periodista): las vigentes (con cuenta atrás, enlace y descarga) y las que están en pausa.
    const mias = S.responsable ? [] : grupos().filter((g) => g.fin >= S.ahora && estoyEn(g));
    const pausadas = S.responsable || !S.id ? [] : grupos().filter((g) => g.fin >= S.ahora && enPausa(g, S.id.pid));
    $("#cardMias").hidden = !mias.length && !pausadas.length;
    $("#mias").innerHTML = [...mias, ...pausadas].map((g) => `<li>${tarjetaReunion(g, false)}</li>`).join("");

    const nVotos = new Map();
    for (const pids of S.votos.values()) for (const p of pids) nVotos.set(p, (nVotos.get(p) || 0) + 1);
    const lista = [...S.personas.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
    $("#nPersonas").textContent = lista.length ? plural(lista.length, "participante", "participantes") : "";
    $("#personas").innerHTML = lista.length ? lista.map(([pid, nom]) => {
      const yo = S.id && S.id.pid === pid;
      return `<div class="persona${S.resalta === pid ? " res" : ""}">${avatar(nom)}<button type="button" class="nom" data-resalta="${pid}" title="Resaltar sus franjas en el calendario">${esc(nom)}${yo ? " <span class='mut'>(usted)</span>" : ""}</button>${S.activa.has(pid) ? `<span class="tag" title="Tiene una reunión programada">Con reunión</span>` : ""}<span class="mut">${plural(nVotos.get(pid) || 0, "franja", "franjas")}</span>${S.responsable ? `<button type="button" class="btn sm peligro fantasma" data-borra="${pid}" aria-label="Eliminar a ${esc(nom)}">Eliminar</button>` : ""}</div>`;
    }).join("") : `<span class="mut">Todavía no ha respondido ningún participante.</span>`;
  }
  // Tarjeta de una reunión: fecha, estado de urgencia con cuenta atrás, asistentes y acciones.
  function tarjetaReunion(g, admin) {
    const u = urgencia(g.ini, g.fin), d = leeYmd(claveFecha(g.ini));
    const act = votantes(g.ini), pau = pausadosDe(g);
    const yoPausa = !admin && S.id && enPausa(g, S.id.pid);
    const pausada = yoPausa || (admin && !act.length && pau.length > 0);
    const etq = pausada ? "En pausa" : u.etq, cls = pausada ? "u6" : u.cls;
    const dur = durTxt(claveAbs(g.fin) + 30 - claveAbs(g.ini));
    let aviso = "";
    if (yoPausa) {
      const otra = grupos().find((x) => x.grupo === S.activa.get(S.id.pid));
      aviso = `<p class="reu-pausa">Ya tiene otra reunión${otra ? ` (${esc(fechaLarga(claveFecha(otra.ini)))} · ${rangoTxt(otra.ini, otra.fin)})` : ""}. Esta se reactivará automáticamente si esa se cancela.</p>`;
    } else if (admin && pausada) {
      aviso = `<p class="reu-pausa">Todas las personas convocadas tienen ya otra reunión. Se reactivará si se cancela alguna de ellas.</p>`;
    } else if (admin && pau.length) {
      aviso = `<p class="reu-pausa">${plural(pau.length, "persona en pausa", "personas en pausa")} (ya ${pau.length === 1 ? "tiene" : "tienen"} otra reunión): ${pau.map((p) => esc(S.personas.get(p) || "?")).join(", ")}. Volverán si se cancela la otra.</p>`;
    }
    const chipsHtml = yoPausa ? "" : (act.length ? chips(act, 8) : `<span class="mut">Sin participantes inscritos</span>`);
    let acc = "";
    if (admin) {
      acc = `<button type="button" class="btn sm" data-copia="${g.grupo}">Copiar convocatoria</button>${g.enlace ? `<a class="btn sm" href="${esc(g.enlace)}" target="_blank" rel="noopener noreferrer">Abrir videollamada</a>` : ""}<button type="button" class="btn sm peligro" data-cancela="${g.grupo}">Cancelar reunión</button>`;
    } else if (!yoPausa) {
      acc = `${g.enlace ? `<a class="btn sm prim" href="${esc(g.enlace)}" target="_blank" rel="noopener noreferrer">Acceder a la videollamada</a>` : `<span class="mut">El enlace de acceso se publicará en este apartado.</span>`}<button type="button" class="btn sm" data-ics="${g.grupo}">Añadir al calendario</button>`;
    }
    return `<article class="reu ${cls}${!admin && !yoPausa ? " mia" : ""}">
      <div class="reu-fecha"><b>${d.getUTCDate()}</b><span>${MESES_C[d.getUTCMonth()]}</span><em>${DIAS_3[dsem(d)]}</em></div>
      <div class="reu-cuerpo">
        <div class="reu-top"><span class="badge ${cls}">${esc(etq)}</span>${pausada || u.n === 5 ? "" : `<span class="reu-cuenta">${esc(u.cuenta)}</span>`}</div>
        <h4>${esc(g.nota || "Reunión")}</h4>
        <p class="reu-hora">${rangoTxt(g.ini, g.fin)} · ${dur}</p>
        ${chipsHtml}${aviso}${acc ? `<div class="acc">${acc}</div>` : ""}
      </div></article>`;
  }
  const ETQ_GRUPO = ["En curso ahora", "Hoy", "Mañana", "Esta semana", "Más adelante", "Celebradas hoy", "En pausa"];
  function pintaAgenda() {
    const el = $("#agenda"); el.hidden = !S.responsable;
    if (el.hidden) return;
    const items = grupos().map((g) => {
      const u = urgencia(g.ini, g.fin), pausa = !votantes(g.ini).length && pausadosDe(g).length > 0;
      return { g, u, n: pausa ? 6 : u.n };
    }).sort((a, b) => a.n - b.n || (a.g.ini < b.g.ini ? -1 : 1));
    const vivas = items.filter((x) => x.n < 5);
    const pend = calculaPendientes(); S.pend = pend;
    const urgentes = pend.filter((r) => urgencia(r.ini, r.fin, true).n <= 2).length;
    const conVoto = new Set();
    for (const [k, pids] of S.votos) { const f = S.franjas.get(k); if (f && f.estado === "disponible" && k >= S.ahora) for (const p of pids) conVoto.add(p); }
    const sin = [...conVoto].filter((p) => !S.activa.has(p)).length;
    const hoyN = vivas.filter((x) => x.n <= 1).length, semN = vivas.filter((x) => x.n <= 3).length;

    const prox = vivas[0];
    $("#agSub").textContent = prox ? `Próxima: ${fechaLarga(claveFecha(prox.g.ini))} · ${horaTxt(claveMin(prox.g.ini))} (${prox.u.cuenta})` : "No hay reuniones confirmadas por ahora.";
    $("#agKpis").innerHTML = [
      [hoyN, "Hoy", hoyN === 1 ? "reunión en curso o por empezar" : "reuniones en curso o por empezar", hoyN > 0],
      [semN, "Esta semana", "reuniones confirmadas", false],
      [pend.length, "Por convocar", urgentes ? `${urgentes} ${urgentes === 1 ? "urgente" : "urgentes"} (hoy o mañana)` : "franjas con respuestas", urgentes > 0],
      [sin, "Sin reunión", sin === 1 ? "participante por asignar" : "participantes por asignar", false],
    ].map(([n, t, s, alerta]) => `<div class="kpi${alerta ? " alerta" : ""}"><b>${n}</b><strong>${t}</strong><span>${s}</span></div>`).join("");

    let ult = -1, html = "";
    for (const it of items) {
      if (it.n !== ult) { html += `<h4 class="ag-grupo ${it.n === 6 ? "u6" : "u" + it.n}">${ETQ_GRUPO[it.n]}</h4>`; ult = it.n; }
      html += tarjetaReunion(it.g, true);
    }
    $("#agLista").innerHTML = html || `<p class="mut">Todavía no hay reuniones confirmadas. Cuando confirme una, aparecerá aquí con su cuenta atrás.</p>`;
    $("#agPend").innerHTML = pend.length ? pend.map((r, i) => {
      const u = urgencia(r.ini, r.fin, true);
      return `<article class="pen ${u.cls}"><div class="pen-top"><b>${esc(fechaLarga(claveFecha(r.ini)))} · ${rangoTxt(r.ini, r.fin)}</b><span class="badge ${u.cls}">${esc(u.etq)}</span></div>
        <div class="mut">${esc(u.cuenta)} · ${plural(r.v.length, "participante", "participantes")}</div>${chips(r.v, 5)}
        <div class="acc"><button type="button" class="btn sm prim" data-pend="${i}" data-acc="confirma">Convocar</button><button type="button" class="btn sm fantasma" data-pend="${i}" data-acc="ver">Ver en calendario</button></div></article>`;
    }).join("") : `<p class="mut">Cuando los participantes marquen franjas, aparecerán aquí ordenadas por urgencia.</p>`;
  }

  // ---------- modo "en vivo" ----------
  function pintaVivo() {
    const s = Math.floor((Date.now() - ultimaSync) / 1000), el = $("#vivo");
    if (!el) return;
    const off = sinRed || s > 25;
    el.classList.toggle("off", off);
    el.querySelector("b").textContent = off ? "Reconectando…" : "En vivo";
    $("#vivoTxt").textContent = off ? "" : (s < 3 ? "ahora mismo" : s < 60 ? `hace ${s} s` : `hace ${Math.floor(s / 60)} min`);
  }
  const mediaHora = (a) => a.slice(0, 13) + (+a.slice(14, 16) >= 30 ? "30" : "00");
  let pulsando = false;
  async function pulso() {
    if (pulsando || document.hidden || !S.cargado || $("#app").hidden || pintando) return;
    pulsando = true;
    try {
      const r = await apiPublica("pulso", {});
      sinRed = false; ultimaSync = Date.now();
      // La hora la manda el servidor (Madrid): la cuenta atrás y las franjas pasadas avanzan solas.
      if (r.ara && r.ara !== S.ahora) {
        const cambioMedia = mediaHora(r.ara) !== mediaHora(S.ahora);
        S.ahora = r.ara;
        if (!document.querySelector("dialog[open]")) { pintaCabecera(); pintaAgenda(); pintaLateral(); if (cambioMedia) pintaGraella(); }
      }
      if (S.rev !== null && r.rev !== S.rev && !document.querySelector("dialog[open]")) await carga(true);
    } catch (e) {
      if (e.status === 401) { await carga(true); } else sinRed = true;
    } finally { pulsando = false; pintaVivo(); }
  }

  function pintaBarra() {
    const b = $("#barra"), cambio = !S.responsable && S.cfg.obert && (hayCambios() || (S.id && S.nombre && S.nombre !== S.nombreGuardado));
    b.classList.toggle("visible", !!cambio);
    $("#barraTxt").textContent = `Cambios pendientes de guardar · ${plural(S.mios.size, "franja seleccionada", "franjas seleccionadas")}`;
  }

  // ---------- aviso flotante ----------
  let tTip = null;
  function muestraTip(el, k) {
    const f = S.franjas.get(k), tip = $("#tip");
    if (!f || k < S.ahora) { ocultaTip(); return; }
    const v = votantes(k), ds = claveFecha(k);
    let cuerpo;
    if (f.estado === "confirmada") cuerpo = `Reunión confirmada${f.nota ? ": " + esc(f.nota) : ""}<br>${v.length ? v.map((x) => esc(x.nombre)).join(", ") : "Sin participantes inscritos"}`;
    else if (f.estado === "no_puc") cuerpo = "Franja bloqueada por el Responsable";
    else cuerpo = v.length ? `${plural(v.length, "participante", "participantes")}:<br>${v.map((x) => esc(x.nombre)).join(", ")}` : "Ningún participante la ha seleccionado todavía";
    tip.innerHTML = `<b>${esc(fechaLarga(ds))} · ${horaTxt(claveMin(k))}</b>${cuerpo}`;
    const r = el.getBoundingClientRect();
    tip.classList.add("v");
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    tip.style.top = (r.bottom + 8 + hh > window.innerHeight ? Math.max(8, r.top - hh - 8) : r.bottom + 8) + "px";
  }
  function ocultaTip() { $("#tip").classList.remove("v"); }

  // ---------- interacción con la cuadrícula ----------
  let pintando = null, ignoraClic = false;
  function empiezaPintar(k) {
    pintando = { valor: S.responsable ? S.herramienta : !S.mios.has(k), claves: new Set() };
    aplicaPintar(k);
  }
  function aplicaPintar(k) {
    if (!pintando || pintando.claves.has(k) || !interactiva(k)) return;
    pintando.claves.add(k);
    if (S.responsable) {
      const f = S.franjas.get(k);
      if (f && f.estado === "confirmada") return;
      if (pintando.valor === "buit") S.franjas.delete(k); else S.franjas.set(k, { estado: pintando.valor, grupo: null, nota: "", enlace: "" });
      if (pintando.valor !== "disponible") S.votos.delete(k);
    } else if (pintando.valor) S.mios.add(k); else S.mios.delete(k);
    actualizaCelda(k);
  }
  async function terminaPintar() {
    if (!pintando) return;
    const p = pintando; pintando = null;
    if (!p.claves.size) return;
    if (!S.responsable) { recalculaMax(); pintaLateral(); pintaBarra(); return; }
    try {
      await api("/api/reunions/admin/franges", { method: "PUT", body: JSON.stringify({ estat: p.valor, claus: [...p.claves] }) }, true);
      await carga(true);
    } catch (e) { aviso(e.message, true); carga(true); }
  }
  async function aplicaDia(ds) {
    if (S.responsable) {
      const [min, max] = rangoHoras(); const claves = [];
      for (let m = min; m <= max; m += 30) { const k = mkClave(ds, m); const f = S.franjas.get(k); if (k >= S.ahora && !(f && f.estado === "confirmada")) claves.push(k); }
      if (!claves.length) return;
      try { await api("/api/reunions/admin/franges", { method: "PUT", body: JSON.stringify({ estat: S.herramienta, claus: claves }) }, true); await carga(true); aviso("Día actualizado correctamente."); }
      catch (e) { aviso(e.message, true); }
      return;
    }
    // Periodista: marca o quita todas las franjas abiertas de ese día.
    const abiertas = [...S.franjas.entries()].filter(([k, f]) => f.estado === "disponible" && k >= S.ahora && claveFecha(k) === ds).map(([k]) => k);
    if (!abiertas.length) return;
    const todas = abiertas.every((k) => S.mios.has(k));
    for (const k of abiertas) { if (todas) S.mios.delete(k); else S.mios.add(k); actualizaCelda(k); }
    recalculaMax(); pintaLateral(); pintaBarra();
  }
  function alternaToque(k) {
    if (S.responsable) { if (S.modo === "resp") abreDetalle(k); else { pintando = { valor: S.herramienta, claves: new Set() }; aplicaPintar(k); terminaPintar(); } return; }
    if (!interactiva(k)) return;
    if (S.mios.has(k)) S.mios.delete(k); else S.mios.add(k);
    actualizaCelda(k); pintaLateral(); pintaBarra();
  }
  function abreDetalle(k) {
    const f = S.franjas.get(k);
    if (!f) return;
    if (f.estado === "confirmada") { muestraTip($(`[data-k="${k}"]`), k); return; }
    if (f.estado === "disponible") abreConfirmar(k, 2);
  }

  // ---------- diálogo de confirmar ----------
  let confirmando = null;
  function abreConfirmar(k, franjas) {
    confirmando = k;
    const v = votantes(k);
    $("#cfInfo").innerHTML = `<p style="margin:0"><b>${esc(fechaLarga(claveFecha(k)))} · ${horaTxt(claveMin(k))}</b></p><p class="mut" style="margin:4px 0 0">${v.length ? (v.length === 1 ? "1 participante ha seleccionado" : v.length + " participantes han seleccionado") + " esta franja:" : "Ningún participante ha seleccionado esta franja todavía."}</p>${v.length ? `<div style="margin-top:8px">${chips(v, 30)}</div>` : ""}${(() => { const oc = (S.votos.get(k) || []).filter((p) => S.activa.has(p)); return oc.length ? `<p class="mut" style="margin:8px 0 0">${plural(oc.length, "persona ha marcado", "personas han marcado")} esta franja pero ya ${oc.length === 1 ? "tiene" : "tienen"} otra reunión (${oc.map((p) => esc(S.personas.get(p) || "?")).join(", ")}): no se ${oc.length === 1 ? "incluirá" : "incluirán"} aquí y volverán a contar si se cancela la otra.</p>` : ""; })()}`;
    $("#cfDuracion").value = String(franjas || 2); if (!$("#cfDuracion").value) $("#cfDuracion").value = "2";
    $("#cfNota").value = ""; $("#cfEnlace").value = "";
    $("#dlgConfirmar").showModal();
  }
  // Texto de la convocatoria que el Responsable copia para enviarlo por correo o mensajería.
  function mensaje(g) {
    const v = votantes(g.ini).map((x) => x.nombre);
    return [
      "CONVOCATORIA · Reunión de ElOtroFútbol",
      "",
      `Fecha: ${fechaLarga(claveFecha(g.ini))}`,
      `Horario: de ${rangoTxt(g.ini, g.fin)} (hora de Madrid)`,
      ...(g.nota ? [`Asunto: ${g.nota}`] : []),
      ...(g.enlace ? [`Acceso a la videollamada: ${g.enlace}`] : []),
      ...(v.length ? [`Convocados: ${v.join(", ")}`] : []),
      "",
      "Se ruega puntualidad. En caso de no poder asistir, se ruega comunicarlo con antelación.",
    ].join("\n");
  }
  async function copia(texto, ok) {
    try { await navigator.clipboard.writeText(texto); aviso(ok || "Copiado al portapapeles."); }
    catch { window.prompt("Copie el texto:", texto); }
  }
  // Descarga de la reunión como evento de calendario (.ics), en UTC para que sirva en cualquier zona horaria.
  function descargaIcs(g) {
    const fmt = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
    const ini = madridAUtc(claveFecha(g.ini), claveMin(g.ini)), fin = madridAUtc(claveFecha(g.fin), claveMin(g.fin) + 30);
    const limpia = (t) => String(t || "").replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\r?\n/g, "\\n");
    const lineas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ElOtroFutbol//Reuniones//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
      `UID:${g.grupo}@elotrofutbol.media`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(ini)}`, `DTEND:${fmt(fin)}`,
      `SUMMARY:${limpia(g.nota ? "ElOtroFútbol — " + g.nota : "ElOtroFútbol — Reunión")}`,
      ...(g.enlace ? [`DESCRIPTION:${limpia("Reunión de ElOtroFútbol. Acceso a la videollamada: " + g.enlace)}`, `URL:${g.enlace}`] : []),
      "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:Recordatorio: reunión de ElOtroFútbol en 15 minutos", "END:VALARM", "END:VEVENT", "END:VCALENDAR"];
    const blob = new Blob([lineas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "reunion-elotrofutbol.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- confirmación (sustituye al confirm() del navegador) ----------
  function confirma(titulo, texto, etiqueta, peligro) {
    return new Promise((resolve) => {
      const d = $("#dlgSeguro"), ok = $("#sgOk"), f = $("#frmSeguro");
      $("#sgTitulo").textContent = titulo; $("#sgTexto").textContent = texto;
      ok.textContent = etiqueta || "Aceptar"; ok.classList.toggle("peligro", !!peligro);
      let aceptado = false;
      const alEnviar = (e) => { e.preventDefault(); aceptado = true; d.close(); };
      const alCerrar = () => { f.removeEventListener("submit", alEnviar); d.removeEventListener("close", alCerrar); resolve(aceptado); };
      f.addEventListener("submit", alEnviar); d.addEventListener("close", alCerrar);
      d.showModal();
    });
  }

  // ---------- acciones ----------
  async function guarda() {
    const nom = ($("#inNombre") ? $("#inNombre").value : S.nombre).replace(/\s+/g, " ").trim();
    if (nom.length < 2) { aviso("Indique su nombre y apellidos antes de guardar.", true); const i = $("#inNombre"); if (i) i.focus(); return; }
    S.nombre = nom;
    const b = $("#btnGuardar"); b.disabled = true;
    try {
      const r = await apiPublica("vots", { pid: S.id && S.id.pid, secret: S.id && S.id.secret, nom, claus: [...S.mios], web: "" });
      S.id = { pid: r.pid, secret: r.secret }; S.editandoNombre = false; S.nombreGuardado = nom; guardaId();
      S.originales = new Set(S.mios);
      await carga(true);
      aviso("Respuesta guardada correctamente.");
    } catch (e) { aviso(e.message, true); } finally { b.disabled = false; }
  }
  function deshacer() { S.mios = new Set(S.originales); pintaTodo(); }
  async function darseDeBaja() {
    if (!(await confirma("Eliminar mis datos", "Se eliminarán su nombre y todas las franjas que ha seleccionado. Esta acción no se puede deshacer.", "Eliminar datos", true))) return;
    try {
      await api("/api/reunions/public/baixa", { method: "POST", body: JSON.stringify({ pid: S.id.pid, secret: S.id.secret }) });
      S.id = null; S.mios = new Set(); S.originales = new Set(); S.nombre = ""; S.nombreGuardado = ""; try { localStorage.removeItem(K_IDENTIDAD); } catch { /* ignorar */ }
      await carga(true); aviso("Sus datos han sido eliminados.");
    } catch (e) { aviso(e.message, true); }
  }
  function mueve(dir) {
    S.inicio = sumaDias(S.inicio, dir * S.nDias);
    const hoy = leeYmd(S.ahora.slice(0, 10)), lim = S.nDias === 7 ? sumaDias(hoy, -dsem(hoy)) : hoy;
    if (S.inicio < lim) S.inicio = lim;
    pintaGraella();
  }
  function iraHoy() { const hoy = leeYmd(S.ahora.slice(0, 10)); S.inicio = S.nDias === 7 ? sumaDias(hoy, -dsem(hoy)) : hoy; pintaGraella(); }

  // ---------- plantilla ----------
  function preparaPlantilla() {
    $("#plDias").innerHTML = DIAS_C.map((d, i) => `<label><input type="checkbox" value="${i}" ${i < 5 ? "checked" : ""}><span title="${DIAS[i]}">${d}</span></label>`).join("");
    const horas = []; for (let m = 6 * 60; m <= 24 * 60; m += 30) horas.push(m);
    $("#plDesde").innerHTML = horas.slice(0, -1).map((m) => `<option value="${m}" ${m === 17 * 60 ? "selected" : ""}>${horaTxt(m)}</option>`).join("");
    $("#plHasta").innerHTML = horas.slice(1).map((m) => `<option value="${m}" ${m === 20 * 60 ? "selected" : ""}>${m === 1440 ? "24:00" : horaTxt(m)}</option>`).join("");
    $("#plSemanas").innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i === 3 ? "selected" : ""}>${plural(i + 1, "semana", "semanas")}</option>`).join("");
    $("#plEstado").value = S.herramienta;
    $("#dlgPlantilla").showModal();
  }
  async function aplicaPlantilla() {
    const dias = [...$("#plDias").querySelectorAll("input:checked")].map((i) => +i.value);
    const desde = +$("#plDesde").value, hasta = +$("#plHasta").value, semanas = +$("#plSemanas").value, estado = $("#plEstado").value;
    if (!dias.length || hasta <= desde) { aviso("Revise los días y el horario seleccionados.", true); return; }
    const hoy = leeYmd(S.ahora.slice(0, 10)), claves = [];
    for (let i = 0; i < semanas * 7; i++) {
      const d = sumaDias(hoy, i); if (!dias.includes(dsem(d))) continue;
      for (let m = desde; m < hasta; m += 30) { const k = mkClave(ymd(d), m); const f = S.franjas.get(k); if (k >= S.ahora && !(f && f.estado === "confirmada")) claves.push(k); }
    }
    if (!claves.length) { aviso("No hay franjas a las que aplicar la plantilla.", true); return; }
    try {
      for (let i = 0; i < claves.length; i += 650) await api("/api/reunions/admin/franges", { method: "PUT", body: JSON.stringify({ estat: estado, claus: claves.slice(i, i + 650) }) }, true);
      await carga(true); aviso(`Plantilla aplicada correctamente (${plural(claves.length, "franja", "franjas")}).`);
    } catch (e) { aviso(e.message, true); }
  }

  // ---------- invitación (Responsable) ----------
  function invitacion() {
    const url = location.origin + RUTA;
    return `Estimado/a colaborador/a:\n\nLe invitamos a indicar su disponibilidad para la reunión de ElOtroFútbol.\n\nAcceso (con su cuenta de colaborador): ${url}\n\nSeleccione las franjas en las que puede asistir y pulse «Guardar respuesta». Todas las horas corresponden a la hora de Madrid.\n\nAtentamente,\nEl equipo de ElOtroFútbol`;
  }

  // ---------- eventos ----------
  function enlaza() {
    const g = $("#graella");
    g.addEventListener("pointerdown", (e) => {
      if (e.target.closest("[data-dia]")) return;
      const c = e.target.closest("[data-k]"); if (!c) return;
      if (e.pointerType !== "mouse" || e.button !== 0) return; // táctil y teclado pasan por "click"
      const k = c.dataset.k;
      if (S.responsable && S.modo === "resp") return;
      if (!interactiva(k)) return;
      e.preventDefault(); ignoraClic = true; empiezaPintar(k);
    });
    g.addEventListener("pointerover", (e) => {
      const c = e.target.closest("[data-k]"); if (!c) return;
      if (pintando) aplicaPintar(c.dataset.k);
      if (e.pointerType === "mouse") muestraTip(c, c.dataset.k);
    });
    g.addEventListener("pointerleave", ocultaTip);
    document.addEventListener("pointerup", () => { terminaPintar(); setTimeout(() => { ignoraClic = false; }, 60); });
    document.addEventListener("pointercancel", () => { pintando = null; });
    g.addEventListener("click", (e) => {
      const dia = e.target.closest("[data-dia]"); if (dia) { aplicaDia(dia.dataset.dia); return; }
      if (ignoraClic) { ignoraClic = false; return; }
      const c = e.target.closest("[data-k]"); if (!c) return;
      const k = c.dataset.k;
      alternaToque(k);
      if (!S.responsable) { muestraTip(c, k); clearTimeout(tTip); tTip = setTimeout(ocultaTip, 2400); }
    });
    // Deslizar a izquierda/derecha para cambiar de semana en el móvil.
    let tx = 0, ty = 0;
    const wrap = $("#graellaWrap");
    wrap.addEventListener("touchstart", (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
    wrap.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 40 && S.nDias === 3) mueve(dx < 0 ? 1 : -1);
    }, { passive: true });

    $("#prev").onclick = () => mueve(-1); $("#next").onclick = () => mueve(1); $("#hoy").onclick = iraHoy;
    $("#btnGuardar").onclick = guarda; $("#btnDeshacer").onclick = deshacer;
    $("#btnSalir").onclick = cerrarAcceso;

    $("#frmAcceso").addEventListener("submit", (e) => { e.preventDefault(); entrarConLogin($("#loginUsuario").value.trim(), $("#loginClave").value); });

    $("#quien").addEventListener("input", (e) => { if (e.target.id === "inNombre") { S.nombre = e.target.value; pintaBarra(); } });
    $("#quien").addEventListener("click", (e) => {
      const id = e.target.id;
      if (id === "btnCambiaNombre") { S.editandoNombre = true; pintaQuien(); const i = $("#inNombre"); if (i) { i.focus(); i.select(); } }
      if (id === "btnNombreOk") { S.nombre = ($("#inNombre").value || "").replace(/\s+/g, " ").trim() || S.nombre; S.editandoNombre = false; pintaQuien(); pintaBarra(); }
      if (id === "btnOtroNombre") { S.autoNombre = false; pintaQuien(); const i = $("#inNombre"); if (i) { i.focus(); i.select(); } }
      if (id === "btnBaja") darseDeBaja();
    });
    $("#quien").addEventListener("keydown", (e) => { if (e.target.id === "inNombre" && e.key === "Enter") { e.preventDefault(); if (S.id) $("#btnNombreOk").click(); else $("#cal").scrollIntoView({ behavior: "smooth", block: "start" }); } });

    const delega = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.run !== undefined || b.dataset.pend !== undefined) {
        const r = b.dataset.run !== undefined ? S.runs[+b.dataset.run] : S.pend[+b.dataset.pend]; if (!r) return;
        const claves = []; for (let k = r.ini; ; k = siguiente(k)) { claves.push(k); if (k === r.fin) break; }
        if (b.dataset.acc === "confirma") abreConfirmar(r.ini, r.n);
        else if (b.dataset.acc === "ver") { const d = leeYmd(claveFecha(r.ini)); S.inicio = S.nDias === 7 ? sumaDias(d, -dsem(d)) : d; pintaGraella(); $("#cal").scrollIntoView({ behavior: "smooth", block: "start" }); }
        else { for (const k of claves) { if (b.dataset.acc === "une") S.mios.add(k); else S.mios.delete(k); } pintaTodo(); if (b.dataset.acc === "une" && S.nombre.trim().length < 2) aviso("Indique su nombre y pulse «Guardar respuesta»."); }
      }
      if (b.dataset.uneGrupo) {
        if (hayCambios()) { aviso("Guarde primero los cambios pendientes y vuelva a intentarlo.", true); return; }
        const nom = (S.nombre || "").replace(/\s+/g, " ").trim();
        if (!S.id && nom.length < 2) { aviso("Indique su nombre y apellidos para unirse.", true); const i = $("#inNombre"); if (i) i.focus(); return; }
        b.disabled = true;
        try {
          const r = await apiPublica("unirse", { pid: S.id && S.id.pid, secret: S.id && S.id.secret, nom, grup: b.dataset.uneGrupo, web: "" });
          S.id = { pid: r.pid, secret: r.secret }; S.nombre = r.nom || nom; S.nombreGuardado = S.nombre; guardaId();
          await carga(true); aviso("Se ha unido a la reunión." + (r.correo && r.correo.enviados ? " Le hemos enviado la convocatoria por correo." : ""));
        } catch (er) { aviso(er.message, true); } finally { b.disabled = false; }
      }
      if (b.dataset.anadeGrupo) {
        const sel = b.parentElement.querySelector("select"), pid = sel && sel.value;
        if (!pid) { aviso("Elija a qué participante quiere añadir.", true); return; }
        try { const r = await api("/api/reunions/admin/unir", { method: "POST", body: JSON.stringify({ grup: b.dataset.anadeGrupo, pid }) }, true); await carga(true); aviso("Participante añadido a la reunión." + (r && r.correo && r.correo.enviados ? " Se le ha enviado la convocatoria por correo." : "")); }
        catch (er) { aviso(er.message, true); }
      }
      if (b.dataset.copia) { const gr = grupos().find((x) => x.grupo === b.dataset.copia); if (gr) copia(mensaje(gr), "Convocatoria copiada al portapapeles."); }
      if (b.dataset.ics) { const gr = grupos().find((x) => x.grupo === b.dataset.ics); if (gr) descargaIcs(gr); }
      if (b.dataset.resalta) { S.resalta = S.resalta === b.dataset.resalta ? null : b.dataset.resalta; pintaGraella(); pintaLateral(); }
      if (b.dataset.cancela && await confirma("Cancelar reunión", "La reunión dejará de figurar como confirmada y sus franjas volverán a quedar disponibles.", "Cancelar reunión", true)) {
        try { await api("/api/reunions/admin/cancelar", { method: "POST", body: JSON.stringify({ grup: b.dataset.cancela }) }, true); await carga(true); aviso("Reunión cancelada."); } catch (er) { aviso(er.message, true); }
      }
      if (b.dataset.borra && await confirma("Eliminar participante", "Se eliminarán el participante y todas sus respuestas. Esta acción no se puede deshacer.", "Eliminar", true)) {
        try { await api("/api/reunions/admin/persona/" + b.dataset.borra, { method: "DELETE" }, true); await carga(true); aviso("Participante eliminado."); } catch (er) { aviso(er.message, true); }
      }
    };
    document.querySelector(".lateral").addEventListener("click", delega);
    $("#agenda").addEventListener("click", delega);

    // Responsable
    $("#modoEditar").onclick = () => { S.modo = "editar"; pintaTodo(); };
    $("#modoResp").onclick = () => { S.modo = "resp"; pintaTodo(); };
    $("#pinceles").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.herramienta = b.dataset.eina; pintaHerramientas(); } });
    $("#btnPlantilla").onclick = preparaPlantilla;
    $("#btnInvitar").onclick = () => copia(invitacion(), "Invitación copiada al portapapeles.");
    $("#chkAbierto").onchange = async (e) => {
      try { const r = await api("/api/reunions/admin/config", { method: "PUT", body: JSON.stringify({ ...S.cfg, obert: e.target.checked }) }, true); S.cfg = r.config; aviso(S.cfg.obert ? "Calendario abierto a nuevas respuestas." : "Calendario cerrado a nuevas respuestas."); pintaTodo(); }
      catch (er) { e.target.checked = !e.target.checked; aviso(er.message, true); }
    };
    $("#btnAjustes").onclick = () => { $("#cgTitulo").value = S.cfg.titol || ""; $("#cgDescripcion").value = S.cfg.descripcio || ""; $("#dlgAjustes").showModal(); };
    for (const d of document.querySelectorAll("dialog")) d.addEventListener("click", (e) => { if (e.target.closest("[data-cierra]") || e.target === d) d.close(); });
    $("#frmConfirmar").addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = $("#cfOk"); b.disabled = true;
      try {
        const ini = confirmando, n = +$("#cfDuracion").value, enlace = $("#cfEnlace").value.trim(), nota = $("#cfNota").value.trim();
        const rc = await api("/api/reunions/admin/confirmar", { method: "POST", body: JSON.stringify({ clau: ini, franges: n, enllac: enlace, nota }) }, true);
        $("#dlgConfirmar").close(); await carga(true);
        const nc = rc && rc.correo && rc.correo.enviados ? rc.correo.enviados : 0;
        const txtCorreo = nc ? ` Se ha enviado un correo a ${nc} ${nc === 1 ? "persona" : "personas"}.` : "";
        const gr = grupos().find((x) => x.ini === ini);
        if (gr) { gr.enlace = enlace; copia(mensaje(gr), "Reunión confirmada." + txtCorreo + " La convocatoria se ha copiado al portapapeles."); } else aviso("Reunión confirmada." + txtCorreo);
      } catch (er) { aviso(er.message, true); } finally { b.disabled = false; }
    });
    $("#frmPlantilla").addEventListener("submit", (e) => { e.preventDefault(); $("#dlgPlantilla").close(); aplicaPlantilla(); });
    $("#frmAjustes").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const r = await api("/api/reunions/admin/config", { method: "PUT", body: JSON.stringify({ titol: $("#cgTitulo").value, descripcio: $("#cgDescripcion").value, obert: S.cfg.obert }) }, true);
        S.cfg = r.config; $("#dlgAjustes").close(); pintaTodo(); aviso("Ajustes guardados correctamente.");
      } catch (er) { aviso(er.message, true); }
    });

    // Modo oscuro: el mismo ajuste que el resto de la web (eof_tema).
    const pintaTema = () => {
      const osc = document.documentElement.getAttribute("data-theme") === "dark";
      for (const b of document.querySelectorAll(".tema-btn")) { b.setAttribute("aria-pressed", String(osc)); b.setAttribute("aria-label", osc ? "Activar modo claro" : "Activar modo oscuro"); b.title = osc ? "Modo claro" : "Modo oscuro"; }
    };
    for (const b of document.querySelectorAll(".tema-btn")) b.addEventListener("click", () => {
      const osc = document.documentElement.getAttribute("data-theme") === "dark";
      if (window.EOFTema) window.EOFTema.fijar(osc ? "light" : "dark");
      else { if (osc) document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", "dark"); try { localStorage.setItem("eof_tema", osc ? "light" : "dark"); } catch { /* ignorar */ } }
      pintaTema();
    });
    new MutationObserver(pintaTema).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    pintaTema();
    window.addEventListener("storage", (e) => { if (e.key === "eof_token" || e.key === "eof_user" || e.key === null) sincronizaSesion(); });

    window.addEventListener("beforeunload", (e) => { if (!S.responsable && hayCambios()) { e.preventDefault(); e.returnValue = ""; } });
    let rt = null;
    window.addEventListener("resize", () => {
      clearTimeout(rt); rt = setTimeout(() => {
        const nd = window.innerWidth < 720 ? 3 : 7;
        if (nd !== S.nDias && S.inicio) { S.nDias = nd; if (nd === 7) S.inicio = sumaDias(S.inicio, -dsem(S.inicio)); pintaGraella(); }
      }, 180);
    });
    // En vivo: pulso cada 5 s (solo si la pestaña está visible); recarga completa únicamente cuando algo ha cambiado.
    setInterval(pulso, 5000);
    setInterval(pintaVivo, 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { sincronizaSesion(); pulso(); } });
    window.addEventListener("online", pulso);
  }

  // ---------- arranque ----------
  enlaza();
  S.inicio = leeYmd(S.ahora.slice(0, 10)); S.nDias = window.innerWidth < 720 ? 3 : 7;
  if (S.nDias === 7) S.inicio = sumaDias(S.inicio, -dsem(S.inicio));
  // Con sesión (panel o abierta antes en esta pestaña) se entra directo; si el servidor la rechaza, se pide el login.
  if (TOKEN) { ocultaAcceso(); pintaTodo(); carga(false); }
  else muestraAcceso("");
})();
