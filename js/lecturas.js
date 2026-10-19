// ---------- Guardadas para leer luego + historial de lectura (punto 5) ----------
// Cargar DESPUÉS de config.js, lector-auth.js y ui-alertas.js.
//
// - Visitante sin cuenta: se guarda en localStorage (solo los ids, lo más
//   reciente primero). Nada sale del navegador.
// - Lector con sesión: manda el servidor (/api/readers/me/guardadas, /historial).
//   No se guarda copia local de la cuenta.
// - Al iniciar sesión (da igual por cuál de los cinco caminos: contraseña,
//   Google, Microsoft, Discord o X) se hace UNA fusión por sesión: lo que había
//   en el navegador se manda a /api/readers/me/lecturas/sincronizar, que solo
//   AÑADE a la cuenta. Si la fusión sale bien se vacía lo local. Si falla, se
//   conserva y se reintenta en la siguiente página.
// - Al cerrar sesión se borra todo lo local (ver cerrarSesionLector en
//   lector-auth.js), para no dejar rastro en un equipo compartido.
// - Si una escritura falla se avisa y se revierte el botón; no hay cola de
//   reintentos.
// - Dónde se ve: botón en la noticia (arriba y al final), marcador en cada
//   tarjeta de los listados (a.card[data-art-id]), icono con contador en la
//   cabecera (.lect-header-btn, lo pinta layout.js) y la página /guardadas.
// - Para no sumar consultas a D1, la lista de ids de un lector se guarda en
//   sessionStorage 5 minutos (y se actualiza al guardar/quitar).
(function () {
  "use strict";
  if (window.EOFLecturas) return;

  const K_GUARDADAS = "eof_lecturas_guardadas";
  const K_HISTORIAL = "eof_lecturas_historial";
  const K_GUARDADAS_T = "eof_lecturas_guardadas_t"; // visitante: { id: ms } cuándo se guardó
  const K_HISTORIAL_T = "eof_lecturas_historial_t"; // visitante: { id: ms } cuándo se leyó por última vez
  const K_FUSION = "eof_lecturas_fusion"; // huella del token con el que ya se fusionó
  const K_CACHE = "eof_lecturas_cache"; // sessionStorage: ids de guardadas del lector { t, h, ids }
  const TTL_CACHE_MS = 5 * 60 * 1000;
  const EVENTO_CAMBIO = "eof-lecturas-cambio";
  const UMBRAL_BARRA = 4; // a partir de cuántas guardadas sale buscador/orden/filtro
  const MAX_GUARDADAS = 200;
  const MAX_HISTORIAL = 100;
  const POR_PAGINA = 12;

  // ---------- almacenamiento local (visitantes) ----------
  function leerLocal(clave) {
    try {
      const bruto = JSON.parse(localStorage.getItem(clave) || "[]");
      if (!Array.isArray(bruto)) return [];
      const vistos = new Set();
      const salida = [];
      for (const v of bruto) {
        const n = Number(v);
        if (Number.isSafeInteger(n) && n > 0 && !vistos.has(n)) {
          vistos.add(n);
          salida.push(n);
        }
      }
      return salida;
    } catch {
      return [];
    }
  }

  function escribirLocal(clave, ids) {
    try {
      localStorage.setItem(clave, JSON.stringify(ids));
      return true;
    } catch {
      return false; // modo privado / almacenamiento lleno
    }
  }

  function leerMapa(clave) {
    try {
      const m = JSON.parse(localStorage.getItem(clave) || "{}");
      return m && typeof m === "object" && !Array.isArray(m) ? m : {};
    } catch {
      return {};
    }
  }

  function marcarFecha(clave, id) {
    const m = leerMapa(clave);
    m[id] = Date.now();
    escribirLocal(clave, m);
  }

  function borrarFecha(clave, id) {
    const m = leerMapa(clave);
    if (id in m) { delete m[id]; escribirLocal(clave, m); }
  }

  // "2026-10-12 09:30:00" (UTC, como lo devuelve D1) -> ms
  function msServidor(s) {
    const t = Date.parse(String(s || "").replace(" ", "T") + "Z");
    return Number.isFinite(t) ? t : 0;
  }

  function limpiarLocal() {
    try {
      localStorage.removeItem(K_GUARDADAS_T);
      localStorage.removeItem(K_HISTORIAL_T);
      localStorage.removeItem(K_GUARDADAS);
      localStorage.removeItem(K_HISTORIAL);
      localStorage.removeItem(K_FUSION);
    } catch { /* nada que hacer */ }
    try { sessionStorage.removeItem(K_CACHE); } catch { /* sin sessionStorage */ }
    estado = null;
    emitirCambio();
  }

  // ---------- sesión y API ----------
  function esLector() {
    return typeof sesionLectorActual === "function" ? !!sesionLectorActual() : false;
  }

  function huellaToken() {
    const t = typeof tokenLectorActual === "function" ? tokenLectorActual() : "";
    return t ? String(t).slice(-24) : "";
  }

  async function api(path, { method = "GET", body } = {}) {
    try {
      const headers = {};
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const res = await apiFetchLector(path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let data = null;
      try { data = await res.json(); } catch { /* sin cuerpo JSON */ }
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: null };
    }
  }

  function mensajeError(r, porDefecto) {
    if (r.status === 401) return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
    if (r.status === 0) return "Sin conexión con el servidor. Inténtalo de nuevo.";
    return (r.data && r.data.error) || porDefecto;
  }

  function aviso(texto, tipo) {
    try {
      if (window.EOF && typeof EOF.toast === "function") EOF.toast(texto, tipo === "ok" ? "exito" : (tipo || "info"), 5000);
    } catch { /* sin avisos */ }
  }

  // ---------- fusión con la cuenta al iniciar sesión ----------
  let fusionPromesa = null;

  function fusionarSiHaceFalta() {
    if (fusionPromesa) return fusionPromesa;
    fusionPromesa = (async () => {
      // Discord y X vuelven con un redirect y guardan el token de forma
      // asíncrona: hay que esperar a que terminen antes de mirar la sesión.
      try { await Promise.all([window.eofRetornoXListo, window.eofRetornoDiscordListo]); } catch { /* ya lo avisan ellos */ }
      if (!esLector()) return { ok: false, motivo: "sin-sesion" };
      const marca = huellaToken();
      let yaFusionado = "";
      try { yaFusionado = localStorage.getItem(K_FUSION) || ""; } catch { /* sigue */ }
      if (marca && yaFusionado === marca) return { ok: true, ya: true };

      const guardadas = leerLocal(K_GUARDADAS);
      const historial = leerLocal(K_HISTORIAL);
      if (guardadas.length || historial.length) {
        const r = await api("/api/readers/me/lecturas/sincronizar", { method: "POST", body: { guardadas, historial } });
        if (!r.ok) return { ok: false, motivo: "error" }; // se conserva lo local y se reintenta en otra página
        try {
          localStorage.removeItem(K_GUARDADAS);
          localStorage.removeItem(K_HISTORIAL);
          localStorage.removeItem(K_GUARDADAS_T);
          localStorage.removeItem(K_HISTORIAL_T);
        } catch { /* sigue */ }
        invalidarEstado();
        const nuevas = Number(r.data && r.data.nuevas_guardadas) || 0;
        if (nuevas > 0) {
          aviso(nuevas === 1 ? "Hemos añadido 1 noticia guardada a tu cuenta." : `Hemos añadido ${nuevas} noticias guardadas a tu cuenta.`, "exito");
        }
      }
      try { localStorage.setItem(K_FUSION, marca); } catch { /* sigue */ }
      return { ok: true };
    })();
    return fusionPromesa;
  }

  // ---------- guardadas: estado compartido ----------
  // estado = { ids: number[] (recientes primero), set: Set } o null si aún no se ha cargado.
  // Visitante: sale de localStorage. Lector: del servidor, con copia en sessionStorage.
  let estado = null;
  let cargaPromesa = null;

  // fechas: Map(id -> ms en que se guardó); solo se rellena al pedir la lista al servidor
  // o con las marcas locales del visitante.
  function nuevoEstado(ids, fechas) {
    return { ids: ids.slice(), set: new Set(ids), fechas: fechas || new Map() };
  }

  function invalidarEstado() {
    estado = null;
    try { sessionStorage.removeItem(K_CACHE); } catch { /* sin sessionStorage */ }
  }

  function guardarCacheSesion() {
    if (!estado || !esLector()) return;
    try { sessionStorage.setItem(K_CACHE, JSON.stringify({ t: Date.now(), h: huellaToken(), ids: estado.ids })); } catch { /* sigue */ }
  }

  function leerCacheSesion() {
    try {
      const c = JSON.parse(sessionStorage.getItem(K_CACHE) || "null");
      if (!c || c.h !== huellaToken() || !Array.isArray(c.ids)) return null;
      if (Date.now() - Number(c.t) > TTL_CACHE_MS) return null;
      return c.ids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);
    } catch {
      return null;
    }
  }

  function emitirCambio() {
    try {
      refrescarMarcas();
      pintarInsignia();
      if (typeof document !== "undefined" && typeof document.dispatchEvent === "function" && typeof CustomEvent === "function") {
        document.dispatchEvent(new CustomEvent(EVENTO_CAMBIO));
      }
    } catch { /* sin DOM (pruebas) */ }
  }

  // forzar = ir al servidor aunque haya copia (la usa la página de guardadas).
  async function asegurarEstado({ forzar = false } = {}) {
    if (!esLector()) {
      const t = leerMapa(K_GUARDADAS_T);
      estado = nuevoEstado(leerLocal(K_GUARDADAS), new Map(Object.entries(t).map(([k, v]) => [Number(k), Number(v) || 0]))); // barato y refleja otras pestañas
      return { ok: true, ids: estado.ids, fechas: estado.fechas };
    }
    if (!forzar && estado) return { ok: true, ids: estado.ids, fechas: estado.fechas };
    if (!cargaPromesa) {
      cargaPromesa = (async () => {
        await fusionarSiHaceFalta().catch(() => {});
        if (!forzar && !estado) {
          const copia = leerCacheSesion();
          if (copia) { estado = nuevoEstado(copia); return { ok: true, ids: estado.ids, fechas: estado.fechas }; }
        }
        const r = await api("/api/readers/me/guardadas");
        if (!r.ok) return { ok: false, ids: [], error: mensajeError(r, "No se han podido cargar tus guardadas.") };
        const filas = (r.data && r.data.guardadas) || [];
        const ids = filas.map((g) => Number(g.article_id));
        estado = nuevoEstado(ids, new Map(filas.map((g) => [Number(g.article_id), msServidor(g.created_at)])));
        guardarCacheSesion();
        return { ok: true, ids, fechas: estado.fechas };
      })().finally(() => { cargaPromesa = null; });
    }
    return cargaPromesa;
  }

  async function listarGuardadas(opciones) {
    return asegurarEstado(opciones);
  }

  async function estaGuardada(id) {
    id = Number(id);
    const r = await asegurarEstado();
    return r.ids.includes(id);
  }

  async function contarGuardadas() {
    const r = await asegurarEstado();
    return r.ok ? r.ids.length : null;
  }

  async function guardar(id) {
    id = Number(id);
    if (!esLector()) {
      const ids = leerLocal(K_GUARDADAS);
      if (ids.includes(id)) return { ok: true, local: true };
      if (ids.length >= MAX_GUARDADAS) {
        return { ok: false, error: `Puedes guardar hasta ${MAX_GUARDADAS} noticias. Quita alguna para guardar más.` };
      }
      if (!escribirLocal(K_GUARDADAS, [id, ...ids])) {
        return { ok: false, error: "No se ha podido guardar en este navegador." };
      }
      marcarFecha(K_GUARDADAS_T, id);
      estado = nuevoEstado([id, ...ids]);
      emitirCambio();
      return { ok: true, local: true };
    }
    const r = await api("/api/readers/me/guardadas", { method: "POST", body: { article_id: id } });
    if (!r.ok) return { ok: false, error: mensajeError(r, "No se ha podido guardar la noticia.") };
    if (estado) {
      if (!estado.set.has(id)) { estado.ids.unshift(id); estado.set.add(id); }
      guardarCacheSesion();
    }
    emitirCambio();
    return { ok: true };
  }

  async function quitar(id) {
    id = Number(id);
    if (!esLector()) {
      const ids = leerLocal(K_GUARDADAS).filter((x) => x !== id);
      escribirLocal(K_GUARDADAS, ids);
      borrarFecha(K_GUARDADAS_T, id);
      estado = nuevoEstado(ids);
      emitirCambio();
      return { ok: true, local: true };
    }
    const r = await api(`/api/readers/me/guardadas/${id}`, { method: "DELETE" });
    if (!r.ok) return { ok: false, error: mensajeError(r, "No se ha podido quitar la noticia.") };
    if (estado) {
      estado.ids = estado.ids.filter((x) => x !== id);
      estado.set.delete(id);
      guardarCacheSesion();
    }
    emitirCambio();
    return { ok: true };
  }

  // ---------- avisos con acción ("Ver guardadas" / "Deshacer") ----------
  let snackEl = null;
  let snackTemporizador = null;

  function quitarSnack() {
    clearTimeout(snackTemporizador);
    if (snackEl && snackEl.remove) snackEl.remove();
    snackEl = null;
  }

  function urlBase() {
    try { return typeof baseHref === "function" ? baseHref() : "/"; } catch { return "/"; }
  }

  // accion: { texto, href } o { texto, fn }
  function snack(texto, accion, duracion) {
    if (typeof document === "undefined" || !document.body || !document.createElement) return;
    quitarSnack();
    const el = document.createElement("div");
    el.className = "lect-snack";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    const t = document.createElement("span");
    t.className = "lect-snack-texto";
    t.textContent = texto;
    el.appendChild(t);
    if (accion) {
      const a = document.createElement(accion.href ? "a" : "button");
      a.className = "lect-snack-accion";
      a.textContent = accion.texto;
      if (accion.href) a.href = accion.href;
      else {
        a.type = "button";
        a.addEventListener("click", () => { quitarSnack(); try { accion.fn(); } catch { /* sigue */ } });
      }
      el.appendChild(a);
    }
    // Si el banner de cookies está a la vista, el aviso se coloca justo encima
    // en vez de taparlo (el banner ya cuenta su propia zona segura inferior).
    try {
      const banner = document.getElementById("eof-cookies-banner");
      if (banner && !banner.hidden && banner.offsetHeight > 0) {
        el.style.bottom = (banner.offsetHeight + 12) + "px";
      }
    } catch { /* se queda en su sitio habitual */ }
    document.body.appendChild(el);
    snackEl = el;
    snackTemporizador = setTimeout(quitarSnack, duracion || 6000);
  }

  // ---------- marcadores (tarjetas, botones de noticia) ----------
  const ICONO_MARCADOR = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
  const ICONO_MARCADOR_GRANDE = `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
  const enCurso = new Set();

  function pintarMarca(b, activa, pendiente) {
    b.classList.toggle("activa", !!activa);
    b.classList.toggle("pendiente", !!pendiente);
    b.setAttribute("aria-pressed", activa ? "true" : "false");
    const txt = activa ? "Quitar de guardadas" : "Guardar para leer luego";
    b.setAttribute("aria-label", txt);
    b.setAttribute("title", txt);
  }

  function pintarBotonNoticia(btn, activa, pendiente) {
    btn.classList.toggle("activa", !!activa);
    btn.classList.toggle("pendiente", !!pendiente);
    btn.setAttribute("aria-pressed", activa ? "true" : "false");
    const texto = btn.querySelector("span");
    if (texto) texto.textContent = activa ? "Guardada" : "Guardar para leer luego";
  }

  // Pinta todos los marcadores de una noticia (tarjetas y botones de la noticia).
  function pintarId(id, activa, pendiente) {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    document.querySelectorAll(`.lect-marca[data-id="${id}"]`).forEach((b) => pintarMarca(b, activa, pendiente));
    document.querySelectorAll(`.lect-btn-guardar[data-id="${id}"]`).forEach((b) => pintarBotonNoticia(b, activa, pendiente));
  }

  function refrescarMarcas() {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    const guardadas = estado ? estado.set : new Set();
    document.querySelectorAll(".lect-marca").forEach((b) => pintarMarca(b, guardadas.has(Number(b.dataset.id)), false));
    document.querySelectorAll(".lect-btn-guardar").forEach((b) => pintarBotonNoticia(b, guardadas.has(Number(b.dataset.id)), false));
  }

  async function alternar(id) {
    id = Number(id);
    if (!Number.isSafeInteger(id) || id <= 0 || enCurso.has(id)) return;
    enCurso.add(id);
    try {
      const e = await asegurarEstado();
      if (!e.ok) { aviso(e.error, "error"); return; }
      const era = estado ? estado.set.has(id) : e.ids.includes(id);
      pintarId(id, !era, true); // al instante; si falla se revierte
      const r = era ? await quitar(id) : await guardar(id);
      if (!r.ok) {
        pintarId(id, era, false);
        aviso(r.error, "error");
        return;
      }
      if (era) {
        snack("Quitada de guardadas", { texto: "Deshacer", fn: () => { guardar(id).then((x) => { if (!x.ok) aviso(x.error, "error"); }); } });
      } else {
        const extra = r.local && !avisoVisitanteMostrado
          ? "Guardada en este navegador. Inicia sesión para tenerla en tu cuenta."
          : "Guardada para leer luego";
        if (r.local) avisoVisitanteMostrado = true;
        snack(extra, { texto: "Ver guardadas", href: urlBase() + "guardadas" }, r.local && extra.length > 30 ? 8000 : 6000);
      }
    } finally {
      enCurso.delete(id);
    }
  }

  // Añade el marcador a cada tarjeta de los listados (a.card[data-art-id]).
  // Se hace aquí, tras pintar, para no tocar la maquetación de cada listado.
  function inyectarMarcas() {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    const tarjetas = document.querySelectorAll("a.card[data-art-id]:not([data-lect])");
    if (!tarjetas.length) return;
    tarjetas.forEach((a) => {
      a.setAttribute("data-lect", "1");
      const id = Number(a.getAttribute("data-art-id"));
      if (!Number.isSafeInteger(id) || id <= 0) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lect-marca";
      b.dataset.id = String(id);
      b.innerHTML = ICONO_MARCADOR;
      pintarMarca(b, estado ? estado.set.has(id) : false, false);
      a.appendChild(b);
    });
    asegurarEstado().then(refrescarMarcas).catch(() => {});
  }

  // ---------- icono de la cabecera (lo crea layout.js) ----------
  async function pintarInsignia() {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    const insignias = document.querySelectorAll(".lect-badge");
    if (!insignias.length) return;
    const n = await contarGuardadas();
    insignias.forEach((el) => {
      el.textContent = n > 99 ? "99+" : String(n || 0);
      el.hidden = !n;
    });
    document.querySelectorAll(".lect-header-btn").forEach((a) => {
      const txt = n ? `Mis guardadas (${n})` : "Mis guardadas";
      a.setAttribute("aria-label", txt);
      a.setAttribute("title", txt);
    });
  }

  // ---------- historial ----------
  async function listarHistorial() {
    if (!esLector()) {
      const t = leerMapa(K_HISTORIAL_T);
      return { ok: true, ids: leerLocal(K_HISTORIAL), fechas: new Map(Object.entries(t).map(([k, v]) => [Number(k), Number(v) || 0])) };
    }
    const r = await api(`/api/readers/me/historial?limit=${MAX_HISTORIAL}`);
    if (!r.ok) return { ok: false, ids: [], error: mensajeError(r, "No se ha podido cargar tu historial.") };
    const filas = (r.data && r.data.historial) || [];
    return { ok: true, ids: filas.map((h) => Number(h.article_id)), fechas: new Map(filas.map((h) => [Number(h.article_id), msServidor(h.created_at)])) };
  }

  function registrarLectura(id) {
    id = Number(id);
    if (!Number.isSafeInteger(id) || id <= 0) return;
    if (!esLector()) {
      const ids = leerLocal(K_HISTORIAL).filter((x) => x !== id);
      ids.unshift(id);
      escribirLocal(K_HISTORIAL, ids.slice(0, MAX_HISTORIAL));
      marcarFecha(K_HISTORIAL_T, id);
      return;
    }
    // Primero la fusión: así lo leído como visitante no queda "por delante" de
    // la noticia que se está leyendo ahora. Si falla, no se avisa (es una comodidad).
    fusionarSiHaceFalta()
      .catch(() => {})
      .then(() => api("/api/readers/me/historial", { method: "POST", body: { article_id: id } }));
  }

  async function quitarDelHistorial(id) {
    id = Number(id);
    if (!esLector()) {
      escribirLocal(K_HISTORIAL, leerLocal(K_HISTORIAL).filter((x) => x !== id));
      borrarFecha(K_HISTORIAL_T, id);
      return { ok: true };
    }
    const r = await api(`/api/readers/me/historial/${id}`, { method: "DELETE" });
    return r.ok ? { ok: true } : { ok: false, error: mensajeError(r, "No se ha podido quitar la noticia del historial.") };
  }

  async function vaciarHistorial() {
    if (!esLector()) {
      try { localStorage.removeItem(K_HISTORIAL); localStorage.removeItem(K_HISTORIAL_T); } catch { /* sigue */ }
      return { ok: true };
    }
    const r = await api("/api/readers/me/historial", { method: "DELETE" });
    return r.ok ? { ok: true } : { ok: false, error: mensajeError(r, "No se ha podido vaciar el historial.") };
  }

  // ---------- tarjetas ----------
  // Devuelve { mapa: Map(id -> noticia), fallidos: Set(id) } con los mismos campos que
  // cualquier listado. Las que ya no están publicadas simplemente no vienen (no
  // están en "mapa" ni en "fallidos"); "fallidos" son las de un trozo que no se pudo pedir.
  async function cargarNoticias(ids) {
    const mapa = new Map();
    const fallidos = new Set();
    for (let i = 0; i < ids.length; i += 60) {
      const trozo = ids.slice(i, i + 60);
      try {
        const res = await apiFetch(`/api/articles?ids=${trozo.join(",")}&limit=60`);
        if (!res || res.ok === false) throw new Error("http");
        const data = await res.json();
        (data.articles || []).forEach((a) => mapa.set(Number(a.id), a));
      } catch {
        trozo.forEach((id) => fallidos.add(id));
      }
    }
    return { mapa, fallidos };
  }

  function normalizarTexto(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  // Pura (se prueba aparte): aplica orden, "sin leer" y búsqueda de texto a una lista de ids.
  function filtrarIds(ids, { texto = "", noticias = new Map(), leidas = new Set(), sinLeer = false, orden = "recientes" } = {}) {
    let r = ids.slice();
    if (orden === "antiguas") r.reverse();
    if (sinLeer) r = r.filter((id) => !leidas.has(id));
    const t = normalizarTexto(texto);
    if (t) {
      r = r.filter((id) => {
        const a = noticias.get(id);
        return a && normalizarTexto(`${a.titulo || ""} ${a.subtitulo || ""} ${a.club || ""}`).includes(t);
      });
    }
    return r;
  }

  function esqueletoHTML() {
    const t = `<div class="lect-esqueleto" aria-hidden="true"><div class="lect-esq-img"></div><div class="lect-esq-l1"></div><div class="lect-esq-l2"></div><div class="lect-esq-l3"></div></div>`;
    return `<div class="lect-grid lect-cargando" role="status" aria-label="Cargando">${t.repeat(6)}</div>`;
  }

  // leida: true = ya abierta, false = sin abrir, null = no se sabe (historial o sin historial)
  function tarjetaHTML(a, textoQuitar, leida) {
    const portada = window.EOF_FOCO && EOF_FOCO.portadaDeArticulo
      ? EOF_FOCO.portadaDeArticulo(a)
      : { url: a.imagen_url, foco: null };
    const src = portada.url ? cloudinaryOptimizada(portada.url, 500) : "img/default.jpg";
    const imagen = window.EOF_FOCO && EOF_FOCO.img
      ? EOF_FOCO.img({ src, alt: a.titulo, foco: portada.foco })
      : `<img src="${escapeHtml(src)}" alt="${escapeHtml(a.titulo)}" loading="lazy">`;
    const autor = a.autor_nombre
      ? " · " + escapeHtml(a.autor_nombre) + (a.coautor_nombre ? " y " + escapeHtml(a.coautor_nombre) : "")
      : "";
    return `
      <div class="lect-item${leida === false ? " lect-sin-leer" : ""}" data-id="${Number(a.id)}">
        <a class="card" href="${urlNoticia(a.categoria, a.slug)}">
          ${imagen}
          <div class="cbody">
            <span class="cat">${categoriaLabel(a.categoria)}</span>
            <h3>${escapeHtml(a.titulo)}</h3>
            <p>${escapeHtml(resumText(a.subtitulo || a.contenido, 110))}</p>
            <span class="meta">${formatFecha(a.fecha_publicacion)}${autor}</span>
          </div>
        </a>
        ${leida === true ? `<span class="lect-leida">Leída</span>` : ""}
        <button type="button" class="lect-quitar" data-id="${Number(a.id)}" aria-label="${escapeHtml(textoQuitar)}" title="${escapeHtml(textoQuitar)}">&times;</button>
      </div>`;
  }

  // Pinta "guardadas" o "historial" dentro de "cont". Pagina de 12 en 12 en el
  // cliente. En guardadas añade: marca de "Leída", filtro "Sin leer", orden,
  // buscador (carga todas las tarjetas la primera vez que se escribe) y aviso de
  // las que ya no están publicadas.
  async function montarLista(cont, tipo) {
    if (!cont) return;
    const esGuardadas = tipo === "guardadas";
    const textoQuitar = esGuardadas ? "Quitar de guardadas" : "Quitar del historial";
    cont.innerHTML = esqueletoHTML();

    await fusionarSiHaceFalta().catch(() => {});
    const lista = esGuardadas ? await listarGuardadas({ forzar: true }) : await listarHistorial();
    if (!lista.ok) {
      cont.innerHTML = `<div class="lect-vacio"><h3>No se ha podido cargar</h3><p>${escapeHtml(lista.error || "Inténtalo de nuevo en unos minutos.")}</p></div>`;
      return;
    }

    // "Leída" = la abriste DESPUÉS de guardarla (si no, guardar desde la propia noticia
    // la marcaría como leída al instante). El historial guarda las últimas 100.
    let leidas = new Set();
    let leidasOk = false;
    if (esGuardadas) {
      const h = await listarHistorial();
      if (h.ok) {
        leidasOk = true;
        const guardadaEn = lista.fechas || new Map();
        leidas = new Set(h.ids.filter((id) => (h.fechas.get(id) || 0) > (guardadaEn.get(id) || 0)));
      }
    }

    let ids = lista.ids.slice();
    let mostrados = 0;
    let texto = "";
    let sinLeer = false;
    let orden = "recientes";
    let hayFallos = false;
    const noticias = new Map();
    const noDisponibles = new Set();

    const nota = !esLector()
      ? `<div class="lect-nota"><span class="lect-nota-texto">${esGuardadas ? "Estas noticias están guardadas solo en este navegador." : "Este historial está solo en este navegador."}
           <a href="acceso?volver=${encodeURIComponent(location.pathname + location.search)}">Inicia sesión</a> para tenerlas también en tu cuenta.</span></div>`
      : "";

    function vacioHTML() {
      return `<div class="lect-vacio">
        <div class="lect-vacio-icono" aria-hidden="true">${ICONO_MARCADOR_GRANDE}</div>
        <h3>${esGuardadas ? "Aún no has guardado ninguna noticia" : "Todavía no has leído ninguna noticia"}</h3>
        <p>${esGuardadas ? "Pulsa el marcador de una noticia («Guardar para leer luego») y la tendrás aquí cuando quieras." : "Las noticias que abras aparecerán aquí."}</p>
        <a class="lect-btn-primario" href="/">Ir a la portada</a>
      </div>`;
    }

    function visibles() {
      return filtrarIds(ids, { texto, noticias, leidas, sinLeer, orden });
    }

    // Pide las tarjetas que faltan; las que el servidor no devuelve se anotan como no disponibles.
    async function completar(lote) {
      const faltan = lote.filter((id) => !noticias.has(id) && !noDisponibles.has(id));
      if (!faltan.length) return;
      const { mapa, fallidos } = await cargarNoticias(faltan);
      faltan.forEach((id) => {
        if (mapa.has(id)) noticias.set(id, mapa.get(id));
        else if (!fallidos.has(id)) noDisponibles.add(id);
      });
      if (fallidos.size) hayFallos = true;
    }

    async function pintar() {
      if (!ids.length) { cont.innerHTML = nota + vacioHTML(); return; }
      const herramientas = esGuardadas && ids.length >= UMBRAL_BARRA
        ? `<div class="lect-herramientas">
             <input type="search" id="lectBuscar" class="lect-buscar" placeholder="Buscar en tus guardadas…" aria-label="Buscar en tus guardadas" autocomplete="off">
             <select id="lectOrden" class="lect-orden" aria-label="Orden">
               <option value="recientes">Más recientes primero</option>
               <option value="antiguas">Más antiguas primero</option>
             </select>
             ${leidasOk ? `<button type="button" class="lect-chip" id="lectSinLeer" aria-pressed="false">Sin leer</button>` : ""}
           </div>`
        : "";
      cont.innerHTML = `${nota}
        <div class="lect-cabecera">
        <div class="lect-barra">
          <span class="lect-contador" id="lectContador" role="status" aria-live="polite"></span>
          ${esGuardadas ? "" : `<button type="button" class="lect-btn-secundario" data-accion="vaciar">Vaciar historial</button>`}
        </div>
        ${herramientas}
        </div>
        <div id="lectAviso"></div>
        <div class="lect-grid" id="lectGrid"></div>
        <p class="lect-sin-resultados" id="lectSinResultados" hidden>Ninguna noticia coincide con lo que buscas.</p>
        <button type="button" class="lect-btn-secundario lect-mas" id="lectMas" hidden>Cargar más</button>`;
      await repintarGrid();
    }

    async function repintarGrid() {
      const grid = cont.querySelector("#lectGrid");
      if (!grid) return;
      grid.innerHTML = "";
      mostrados = 0;
      await pintarMas();
    }

    async function pintarMas() {
      const grid = cont.querySelector("#lectGrid");
      const botonMas = cont.querySelector("#lectMas");
      if (!grid || !botonMas) return;
      botonMas.disabled = true;
      const vis = visibles();
      const trozo = vis.slice(mostrados, mostrados + POR_PAGINA);
      await completar(trozo);
      grid.insertAdjacentHTML("beforeend", trozo.filter((id) => noticias.has(id)).map((id) => tarjetaHTML(noticias.get(id), textoQuitar, leidasOk ? leidas.has(id) : null)).join(""));
      mostrados += trozo.length;
      botonMas.hidden = mostrados >= vis.length;
      botonMas.disabled = false;
      const sinRes = cont.querySelector("#lectSinResultados");
      if (sinRes) sinRes.hidden = vis.length > 0;
      actualizarContador();
      actualizarAviso();
    }

    function actualizarContador() {
      const el = cont.querySelector("#lectContador");
      if (!el) return;
      const n = ids.length - noDisponibles.size;
      let t = esGuardadas
        ? (n === 1 ? "1 noticia guardada" : `${n} noticias guardadas`)
        : (n === 1 ? "1 noticia leída" : `${n} noticias leídas`);
      if (esGuardadas && leidasOk && n > 0) {
        const pendientes = ids.filter((id) => !leidas.has(id) && !noDisponibles.has(id)).length;
        if (pendientes === 0) t += " · todas leídas";
        else if (pendientes < n) t += ` · ${pendientes} sin leer`;
      }
      el.textContent = t;
    }

    function actualizarAviso() {
      const el = cont.querySelector("#lectAviso");
      if (!el) return;
      const partes = [];
      if (noDisponibles.size) {
        const k = noDisponibles.size;
        partes.push(`<div class="lect-nota"><span class="lect-nota-texto">${k === 1 ? "1 noticia ya no está disponible (se ha retirado)." : `${k} noticias ya no están disponibles (se han retirado).`}</span>
          <button type="button" class="lect-btn-secundario" data-accion="limpiar">${k === 1 ? "Quitarla" : "Quitarlas"}</button></div>`);
      }
      if (hayFallos) partes.push(`<div class="lect-nota"><span class="lect-nota-texto">No se han podido cargar algunas noticias. Recarga la página para reintentarlo.</span></div>`);
      el.innerHTML = partes.join("");
    }

    // montarLista puede llamarse varias veces sobre el mismo contenedor (al volver a
    // abrir la pestaña): se sustituyen los listeners anteriores para no duplicarlos.
    if (cont._lectClick) cont.removeEventListener("click", cont._lectClick);
    if (cont._lectInput) cont.removeEventListener("input", cont._lectInput);
    if (cont._lectChange) cont.removeEventListener("change", cont._lectChange);

    cont._lectClick = async (e) => {
      const btnQuitar = e.target.closest(".lect-quitar");
      if (btnQuitar) {
        e.preventDefault();
        const id = Number(btnQuitar.dataset.id);
        btnQuitar.disabled = true;
        const r = esGuardadas ? await quitar(id) : await quitarDelHistorial(id);
        if (!r.ok) { btnQuitar.disabled = false; aviso(r.error, "error"); return; }
        ids = ids.filter((x) => x !== id);
        noDisponibles.delete(id);
        mostrados = Math.max(0, mostrados - 1);
        if (esGuardadas) {
          snack("Quitada de guardadas", {
            texto: "Deshacer",
            fn: () => { guardar(id).then((x) => { if (x.ok) montarLista(cont, tipo); else aviso(x.error, "error"); }); },
          });
        }
        if (!ids.length) { pintar(); return; }
        const item = btnQuitar.closest(".lect-item");
        if (item) item.remove();
        actualizarContador();
        actualizarAviso();
        if (mostrados < Math.min(POR_PAGINA, visibles().length)) pintarMas();
        return;
      }
      if (e.target.closest("#lectMas")) { pintarMas(); return; }
      const chip = e.target.closest("#lectSinLeer");
      if (chip) {
        sinLeer = !sinLeer;
        chip.setAttribute("aria-pressed", sinLeer ? "true" : "false");
        chip.classList.toggle("activo", sinLeer);
        repintarGrid();
        return;
      }
      const limpiar = e.target.closest("[data-accion=\"limpiar\"]");
      if (limpiar) {
        limpiar.disabled = true;
        for (const id of Array.from(noDisponibles)) {
          const r = esGuardadas ? await quitar(id) : await quitarDelHistorial(id);
          if (!r.ok) { aviso(r.error, "error"); break; }
          ids = ids.filter((x) => x !== id);
          noDisponibles.delete(id);
        }
        if (!ids.length) { pintar(); return; }
        actualizarContador();
        actualizarAviso();
        return;
      }
      if (e.target.closest("[data-accion=\"vaciar\"]")) {
        const ok = window.EOF && EOF.confirmar
          ? await EOF.confirmar("¿Vaciar todo tu historial de lectura? Esta acción no se puede deshacer.")
          : window.confirm("¿Vaciar todo tu historial de lectura?");
        if (!ok) return;
        const r = await vaciarHistorial();
        if (!r.ok) { aviso(r.error, "error"); return; }
        ids = [];
        pintar();
      }
    };
    cont.addEventListener("click", cont._lectClick);

    let temporizadorBuscar = null;
    cont._lectInput = (e) => {
      if (!e.target || e.target.id !== "lectBuscar") return;
      clearTimeout(temporizadorBuscar);
      temporizadorBuscar = setTimeout(async () => {
        texto = e.target.value || "";
        if (normalizarTexto(texto)) await completar(ids); // buscar necesita los títulos de todas
        repintarGrid();
      }, 250);
    };
    cont.addEventListener("input", cont._lectInput);

    cont._lectChange = (e) => {
      if (!e.target || e.target.id !== "lectOrden") return;
      orden = e.target.value === "antiguas" ? "antiguas" : "recientes";
      repintarGrid();
    };
    cont.addEventListener("change", cont._lectChange);

    await pintar();
  }

  // ---------- botón "Guardar para leer luego" (noticia.html) ----------
  // Se puede montar más de una vez en la misma noticia (arriba y al final):
  // todos se mantienen sincronizados por data-id (ver pintarId / refrescarMarcas).
  let avisoVisitanteMostrado = false;

  async function montarBotonNoticia(cont, id) {
    id = Number(id);
    if (!cont || !Number.isSafeInteger(id) || id <= 0) return;
    cont.innerHTML = `
      <button type="button" class="lect-btn-guardar" data-id="${id}" aria-pressed="false">
        ${ICONO_MARCADOR}
        <span>Guardar para leer luego</span>
      </button>`;
    const btn = cont.querySelector("button");
    pintarBotonNoticia(btn, false, false);
    // El clic lo gestiona el listener delegado de document (alternar).
    try {
      const guardada = await estaGuardada(id);
      pintarBotonNoticia(btn, guardada, false);
    } catch { /* se queda sin marcar */ }
  }

  // ---------- estilos ----------
  const css = `
  .lect-acciones{margin-top:14px}
  .lect-acciones-final{margin:22px 0 4px}
  .lect-btn-guardar{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border:1.5px solid var(--borde,#d9dee5);border-radius:999px;background:var(--tarjeta,#fff);color:var(--marino-texto,var(--texto,#0c1b2e));font:inherit;font-size:.85rem;font-weight:600;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
  .lect-btn-guardar:hover{border-color:var(--rojo,#d1132e);color:var(--rojo,#d1132e)}
  .lect-btn-guardar.activa{background:var(--rojo,#d1132e);border-color:var(--rojo,#d1132e);color:#fff}
  .lect-btn-guardar.activa svg{fill:currentColor}
  .lect-btn-guardar.pendiente{opacity:.7;cursor:progress}
  a.card[data-lect]{position:relative}
  .lect-marca{position:absolute;top:10px;right:10px;z-index:3;width:36px;height:36px;display:flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:50%;background:rgba(12,27,46,.72);color:#fff;cursor:pointer;transition:background .15s,transform .15s}
  .lect-marca:hover,.lect-marca:focus-visible{background:var(--rojo,#d1132e);transform:scale(1.06)}
  .lect-marca.activa{background:var(--rojo,#d1132e)}
  .lect-marca.activa svg{fill:currentColor}
  .lect-marca.pendiente{opacity:.7;cursor:progress}
  .lect-header-btn{position:relative;text-decoration:none;color:var(--texto,inherit)}
  .lect-badge{position:absolute;top:-5px;right:-5px;min-width:17px;height:17px;padding:0 4px;box-sizing:border-box;border-radius:9px;background:var(--rojo,#d1132e);color:#fff;font-size:.66rem;font-weight:700;line-height:17px;text-align:center}
  .lect-badge[hidden]{display:none}
  /* Aviso inferior (guardar / quitar / deshacer). OJO: con left:50% el ancho
     "natural" de un fixed se limitaba a la mitad de la pantalla y en móvil el
     texto se partía en 3-4 líneas; ahora se ancla con left/right + margin auto. */
  .lect-snack{position:fixed;left:12px;right:12px;margin:0 auto;width:max-content;max-width:min(460px,calc(100vw - 24px));bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:10000;box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:10px 10px 10px 16px;border-radius:14px;background:var(--marino,#0c1b2e);color:#fff;font-size:.9rem;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.38);animation:lectSnack .22s ease-out}
  .lect-snack-texto{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
  .lect-snack-accion{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border:none;border-radius:10px;background:rgba(255,255,255,.16);color:#fff;font:inherit;font-weight:700;font-size:.86rem;white-space:nowrap;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .15s}
  .lect-snack-accion:hover,.lect-snack-accion:focus-visible{background:rgba(255,255,255,.28)}
  .lect-snack-accion:active{background:rgba(255,255,255,.34)}
  [data-theme="dark"] .lect-snack{background:#1d2837;border:1px solid rgba(255,255,255,.14)}
  @media(max-width:480px){
    .lect-snack{left:10px;right:10px;width:auto;max-width:none;font-size:.88rem;padding:9px 9px 9px 14px;border-radius:12px}
  }
  @keyframes lectSnack{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}

  /* ----- listas (guardadas / historial) ----- */
  .lect-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:24px;align-items:stretch}
  .lect-item{position:relative;display:flex;flex-direction:column}
  .lect-item .card{height:100%;border-radius:var(--radio-lg,16px);box-shadow:var(--sombra-sm,0 1px 3px rgba(12,27,46,.08));transition:transform .2s,box-shadow .2s,border-color .2s}
  .lect-item .card:hover{transform:translateY(-5px);box-shadow:var(--sombra-hover,0 12px 28px rgba(12,27,46,.18));border-color:transparent}
  .lect-item .card img{height:178px}
  .lect-item .card h3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .lect-item .card p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .lect-sin-leer .card{box-shadow:inset 0 3px 0 var(--rojo,#d1132e),var(--sombra-sm,0 1px 3px rgba(12,27,46,.08))}
  .lect-sin-leer .card:hover{box-shadow:inset 0 3px 0 var(--rojo,#d1132e),var(--sombra-hover,0 12px 28px rgba(12,27,46,.18))}
  .lect-quitar{position:absolute;top:10px;right:10px;z-index:2;width:34px;height:34px;display:flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:50%;background:rgba(12,27,46,.72);color:#fff;font-size:1.25rem;line-height:1;cursor:pointer;backdrop-filter:blur(4px);transition:background .15s,transform .15s}
  .lect-quitar:hover,.lect-quitar:focus-visible{background:var(--rojo,#d1132e);transform:scale(1.08)}
  .lect-quitar:disabled{opacity:.5;cursor:progress}
  .lect-leida{position:absolute;top:10px;left:10px;z-index:2;display:inline-flex;align-items:center;gap:5px;padding:4px 11px 4px 9px;border-radius:999px;background:rgba(12,27,46,.78);color:#fff;font-size:.7rem;font-weight:700;letter-spacing:.2px;pointer-events:none;backdrop-filter:blur(4px)}
  .lect-leida::before{content:"\\2713";font-size:.78rem;color:var(--celeste-claro,#a8dcf5)}

  .lect-barra{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
  .lect-contador{display:inline-flex;align-items:center;padding:6px 14px;border-radius:999px;background:var(--fondo-alt,#f1f4f8);border:1px solid var(--borde,#e7e9ee);color:var(--marino-texto,var(--texto,#0c1b2e));font-size:.85rem;font-weight:600}
  .lect-herramientas{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:22px;padding:12px;border:1px solid var(--borde,#e7e9ee);border-radius:var(--radio-md,12px);background:var(--tarjeta,#fff);box-shadow:var(--sombra-sm,0 1px 3px rgba(12,27,46,.06))}
  .lect-buscar,.lect-orden{height:42px;box-sizing:border-box;padding:0 14px;border:1.5px solid var(--borde,#d9dee5);border-radius:10px;background:var(--fondo-alt,#f7f8fa);color:var(--marino-texto,var(--texto,#0c1b2e));font:inherit;font-size:.9rem;transition:border-color .15s,box-shadow .15s,background .15s}
  .lect-buscar{flex:1 1 240px;min-width:0;padding-left:40px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239aa0ab' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='M21 21l-4.3-4.3'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:13px center;background-size:18px}
  .lect-buscar:focus,.lect-orden:focus{outline:none;border-color:var(--rojo,#d1132e);background-color:var(--tarjeta,#fff);box-shadow:0 0 0 3px rgba(209,19,46,.15)}
  .lect-orden{cursor:pointer}
  .lect-chip{height:42px;padding:0 18px;border:1.5px solid var(--borde,#d9dee5);border-radius:999px;background:var(--tarjeta,#fff);color:var(--marino-texto,var(--texto,#0c1b2e));font:inherit;font-size:.85rem;font-weight:600;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
  .lect-chip:hover{border-color:var(--rojo,#d1132e);color:var(--rojo,#d1132e)}
  .lect-chip.activo{background:var(--rojo,#d1132e);border-color:var(--rojo,#d1132e);color:#fff}
  .lect-sin-resultados{text-align:center;color:var(--texto-suave,#5b6776);padding:36px 0}

  .lect-btn-secundario{display:inline-block;padding:9px 18px;border:1.5px solid var(--borde,#d9dee5);border-radius:10px;background:var(--tarjeta,#fff);color:var(--marino-texto,var(--texto,#0c1b2e));font:inherit;font-size:.85rem;font-weight:600;text-decoration:none;cursor:pointer;transition:border-color .15s,color .15s}
  .lect-btn-secundario:hover{border-color:var(--rojo,#d1132e);color:var(--rojo,#d1132e)}
  .lect-btn-secundario:disabled{opacity:.6;cursor:progress}
  .lect-btn-primario{display:inline-block;padding:11px 24px;border:none;border-radius:999px;background:linear-gradient(135deg,var(--rojo,#d1132e),var(--rojo-oscuro,#9c0e23));color:#fff;font:inherit;font-size:.9rem;font-weight:700;text-decoration:none;box-shadow:0 4px 14px rgba(209,19,46,.35);transition:transform .15s,box-shadow .15s}
  .lect-btn-primario:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(209,19,46,.45)}
  .lect-mas{display:block;margin:28px auto 0;padding:11px 30px;border-radius:999px}
  .lect-mas[hidden]{display:none}

  .lect-vacio{text-align:center;padding:56px 20px;border:2px dashed var(--borde,#d9dee5);border-radius:var(--radio-lg,16px);background:var(--fondo-alt,#f7f8fa);color:var(--texto-suave,#5b6776)}
  .lect-vacio-icono{width:84px;height:84px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--tarjeta,#fff);color:var(--rojo,#d1132e);box-shadow:var(--sombra-md,0 6px 20px rgba(12,27,46,.12))}
  .lect-vacio h3{margin:0 0 8px;font-size:1.2rem;color:var(--marino-texto,var(--texto,#0c1b2e))}
  .lect-vacio p{margin:0 auto 20px;max-width:420px;line-height:1.55}
  .lect-nota{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px;padding:13px 16px;border:1px solid var(--borde,#e7e9ee);border-left:4px solid var(--celeste,#5bb8e8);border-radius:10px;background:var(--fondo-alt,#f1f4f8);font-size:.88rem;line-height:1.5}
  .lect-nota-texto{flex:1 1 260px;min-width:0}
  .lect-nota a{color:var(--rojo,#d1132e);font-weight:700}

  .lect-esqueleto{border:1px solid var(--borde,#e7e9ee);border-radius:var(--radio-lg,16px);background:var(--tarjeta,#fff);padding-bottom:16px;overflow:hidden}
  .lect-esqueleto>div{background:linear-gradient(90deg,var(--fondo-alt,#eef1f5) 25%,var(--borde,#e3e7ed) 50%,var(--fondo-alt,#eef1f5) 75%);background-size:200% 100%;animation:lectBrillo 1.3s infinite linear;border-radius:6px}
  .lect-esq-img{height:178px;border-radius:0!important;margin-bottom:16px}
  .lect-esq-l1,.lect-esq-l2,.lect-esq-l3{height:14px;margin:10px 16px 0}
  .lect-esq-l1{width:30%}.lect-esq-l2{width:85%}.lect-esq-l3{width:60%}
  @keyframes lectBrillo{from{background-position:200% 0}to{background-position:-200% 0}}

  /* Táctil: sin "saltos" al hover (en móvil se quedaban pegados tras el toque) */
  @media(hover:none){
    .lect-item .card:hover{transform:none;box-shadow:var(--sombra-sm,0 1px 3px rgba(12,27,46,.08))}
    .lect-sin-leer .card:hover{box-shadow:inset 0 3px 0 var(--rojo,#d1132e),var(--sombra-sm,0 1px 3px rgba(12,27,46,.08))}
    .lect-item .card:active{transform:scale(.99)}
    .lect-quitar:hover,.lect-marca:hover{transform:none}
  }

  /* ----- escritorio / tablet (>600px) ----- */
  @media(min-width:601px){
    .lect-grid{grid-template-columns:repeat(auto-fill,minmax(285px,1fr));gap:26px}
    .lect-item .card{border-radius:16px;overflow:hidden}
    .lect-item .card img{height:auto;aspect-ratio:16/10}
    .lect-item .card .cbody{padding:18px 18px 16px;gap:8px}
    .lect-item .card h3{font-size:1.1rem;line-height:1.3;transition:color .15s}
    .lect-item .card:hover h3,.lect-item .card:focus-visible h3{color:var(--rojo,#d1132e)}
    .lect-item .card .meta{margin-top:auto;padding-top:11px;border-top:1px solid var(--borde,#e7e9ee)}
    .lect-sin-leer .card,.lect-sin-leer .card:hover{box-shadow:inset 0 4px 0 var(--rojo,#d1132e),var(--sombra-sm,0 1px 3px rgba(12,27,46,.08))}
    .lect-quitar{top:12px;right:12px;width:38px;height:38px;font-size:1.3rem}
    .lect-leida{top:12px;left:12px}
    .lect-cabecera{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:26px}
    .lect-cabecera .lect-barra{margin:0;flex:0 0 auto}
    .lect-cabecera .lect-herramientas{flex:1 1 520px;max-width:760px;margin:0;padding:8px;gap:8px;flex-wrap:nowrap}
    .lect-cabecera .lect-buscar{flex:1 1 auto;min-width:160px}
    .lect-cabecera .lect-orden{flex:0 0 auto;width:210px}
    .lect-cabecera .lect-chip{flex:0 0 auto}
    .lect-contador{padding:8px 16px}
    .lect-nota{margin-bottom:22px}
    .lect-mas{margin-top:36px;min-width:220px}
    .lect-esq-img{height:auto;aspect-ratio:16/10}
  }
  /* Ratón: «Quitar» solo aparece al pasar por la tarjeta o al enfocarla con teclado */
  @media(min-width:601px) and (hover:hover){
    .lect-quitar{opacity:0;transform:scale(.9)}
    .lect-item:hover .lect-quitar,.lect-item:focus-within .lect-quitar,.lect-quitar:focus-visible{opacity:1;transform:scale(1)}
    .lect-item .lect-quitar:hover{transform:scale(1.08)}
  }
  @media(min-width:1100px){
    .lect-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:30px}
  }

  /* ----- móvil: lista compacta (miniatura a la izquierda, texto a la derecha) ----- */
  @media(max-width:600px){
    .lect-grid{grid-template-columns:1fr;gap:12px}
    .lect-item .card{flex-direction:row;align-items:stretch;min-height:128px;height:auto;border-radius:14px}
    .lect-item .card img{width:116px;min-width:116px;height:auto;min-height:128px;align-self:stretch}
    .lect-item .card .cbody{padding:12px 12px 56px;gap:5px;min-width:0}
    .lect-item .card h3{font-size:1rem;line-height:1.3;-webkit-line-clamp:3}
    .lect-item .card p{display:none}
    .lect-item .card .cat{font-size:.66rem}
    .lect-item .card .meta{font-size:.72rem;padding-top:2px;overflow-wrap:anywhere}
    .lect-sin-leer .card,.lect-sin-leer .card:hover{box-shadow:inset 4px 0 0 var(--rojo,#d1132e),var(--sombra-sm,0 1px 3px rgba(12,27,46,.08))}
    .lect-leida{top:8px;left:8px;padding:3px 9px 3px 7px;font-size:.66rem}
    /* Quitar: botón con texto, en la esquina inferior derecha, objetivo táctil de 44px */
    .lect-quitar{top:auto;right:8px;bottom:8px;width:auto;min-width:44px;height:44px;padding:0 14px;gap:6px;border-radius:999px;background:var(--fondo-alt,#f1f4f8);color:var(--marino-texto,var(--texto,#0c1b2e));border:1px solid var(--borde,#d9dee5);font-size:1.15rem;backdrop-filter:none;-webkit-tap-highlight-color:transparent}
    .lect-quitar::after{content:"Quitar";font-size:.78rem;font-weight:700}
    .lect-quitar:hover,.lect-quitar:focus-visible,.lect-quitar:active{background:var(--rojo,#d1132e);border-color:var(--rojo,#d1132e);color:#fff}
    .lect-marca{width:40px;height:40px}

    .lect-barra{margin-bottom:12px}
    .lect-contador{font-size:.82rem;padding:6px 12px}
    .lect-herramientas{gap:8px;padding:10px;margin-bottom:16px;border-radius:14px}
    .lect-buscar,.lect-orden,.lect-chip{height:46px;font-size:16px}
    .lect-buscar{flex:1 1 100%;background-position:14px center}
    .lect-orden{flex:1 1 0;min-width:0}
    .lect-chip{flex:0 0 auto;padding:0 18px;font-size:.88rem}
    .lect-btn-secundario{min-height:44px}
    .lect-mas{width:100%;min-height:50px;margin-top:20px}
    .lect-nota{padding:12px 14px;font-size:.86rem;gap:10px}
    .lect-nota .lect-btn-secundario{width:100%;text-align:center}
    .lect-vacio{padding:36px 16px}
    .lect-vacio-icono{width:72px;height:72px}
    .lect-btn-primario{min-height:48px;display:inline-flex;align-items:center;padding:0 28px}

    .lect-esqueleto{display:grid;grid-template-columns:116px 1fr;grid-template-rows:auto auto auto;column-gap:12px;align-content:center;min-height:128px;padding:12px 12px 12px 0}
    .lect-esq-img{grid-column:1;grid-row:1/4;height:auto;min-height:104px;margin:-12px 0;align-self:stretch}
    .lect-esq-l1,.lect-esq-l2,.lect-esq-l3{grid-column:2;margin:5px 0}
  }
  @media(prefers-reduced-motion:reduce){
    .lect-item .card,.lect-btn-primario,.lect-snack{transition:none;animation:none}
    .lect-esqueleto>div{animation:none}
  }`;
  const estilo = document.createElement("style");
  estilo.id = "estilosLecturas";
  estilo.textContent = css;
  document.head.appendChild(estilo);

  window.EOFLecturas = {
    MAX_GUARDADAS,
    MAX_HISTORIAL,
    esLector,
    fusionarSiHaceFalta,
    estaGuardada,
    contarGuardadas,
    guardar,
    quitar,
    alternar,
    registrarLectura,
    montarBotonNoticia,
    montarLista,
    filtrarIds,
    pintarInsignia,
    inyectarMarcas,
    limpiarLocal,
  };

  // ---------- arranque ----------
  // En cualquier página que cargue este script: si hay sesión nueva, se fusiona.
  fusionarSiHaceFalta().catch(() => {});

  if (typeof document.addEventListener === "function") {
    // Clic en marcadores y botones de noticia (captura: la tarjeta es un <a> y el
    // marcador vive dentro, así que hay que frenar la navegación).
    document.addEventListener("click", (e) => {
      const t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      const marca = t.closest(".lect-marca");
      if (marca) {
        e.preventDefault();
        e.stopPropagation();
        alternar(marca.dataset.id);
        return;
      }
      const btn = t.closest(".lect-btn-guardar");
      if (btn) alternar(btn.dataset.id);
    }, true);

    const arrancar = () => {
      inyectarMarcas();
      pintarInsignia();
      if (typeof MutationObserver === "function") {
        let pendiente = false;
        const programar = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 50);
        new MutationObserver(() => {
          if (pendiente) return;
          pendiente = true;
          programar(() => { pendiente = false; inyectarMarcas(); });
        }).observe(document.documentElement, { childList: true, subtree: true });
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
    else arrancar();
  }

  // Otra pestaña del mismo navegador guardó/quitó (solo visitantes: localStorage).
  if (typeof window.addEventListener === "function") {
    window.addEventListener("storage", (e) => {
      if (e.key === K_GUARDADAS && !esLector()) { estado = null; asegurarEstado().then(emitirCambio); }
    });
  }
})();
