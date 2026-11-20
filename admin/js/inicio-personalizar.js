// ---------- Inicio · Fase 3A: personalización, metas del mes y récords ----------
// Se carga ANTES que inicio-resumen.js y se comunica con él por eventos, sin tocar su lógica:
//   «eof:inicio-montado»  → la página acaba de montarse: aquí se envuelven las tarjetas, se aplica el orden
//                           guardado y se añaden las tarjetas «Metas del mes» y «Tu mejor mes».
//   «eof:inicio-pintado»  → llegaron datos nuevos: se repintan metas y récords.
//   «eof:inicio-visible»  → se ha abierto la pestaña Inicio: es el momento de celebrar lo pendiente.
// Los datos (evolución mensual, racha) salen de EOFInicio.estado(); no hay ninguna petición nueva.
//
// Qué hace:
//   · «Personalizar» (botón de la cabecera): cada tarjeta se puede subir, bajar, pasar a la otra columna y
//     ocultar. Con botones (no hace falta arrastrar), así funciona con teclado y lector de pantalla.
//     «Requiere tu atención» y «Cola de revisión» se pueden mover pero no ocultar: son avisos de trabajo.
//   · Metas del mes: dos metas por rol con barra de progreso y ritmo esperado.
//   · Tu mejor mes: compara este mes con el mejor de los meses anteriores (y la racha).
//   · Al cumplir una meta o batir un récord sale un aviso con confeti (una sola vez por mes y cifra; sin
//     confeti si el sistema pide reducir movimiento).
// Todo se guarda en ESTE navegador (localStorage, por usuario): no necesita backend ni migración.
// Depende de globales de admin.js: USER y, opcionalmente, nivelUsuarioConectado.
(function () {
  "use strict";
  if (typeof USER === "undefined" || !USER) return;

  const FOTO = USER.rol === "fotografo";
  const ADMIN = USER.rol === "admin";
  const ROL = ADMIN ? "admin" : FOTO ? "fotografo" : "redactor";
  const REVISA_LOCAL = ADMIN || (!FOTO && typeof nivelUsuarioConectado === "function" && nivelUsuarioConectado() >= 4);
  const CLAVE = `eof_inicio_v1_${USER.id != null ? USER.id : USER.username}`;

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => Number(n || 0).toLocaleString("es-ES");
  const REDUCIR = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const UNA_COLUMNA = () => !!(window.matchMedia && window.matchMedia("(max-width: 900px)").matches);

  // ======================= LÓGICA PURA (se prueba en worker/tests/inicio-personalizar.test.mjs) =======================

  // Tarjetas movibles. `col` es la columna por defecto; `fijo` = no se puede ocultar. El orden de este array es el
  // orden por defecto dentro de cada columna. `host` = id del elemento que ya es la tarjeta; `dentro` = id de un
  // elemento que está DENTRO de la tarjeta (se usa su <section> más cercana).
  const WIDGETS = [
    { id: "pendientes", t: "Requiere tu atención", col: "izq", host: "iniPendCard", fijo: true, aplica: () => !FOTO },
    { id: "revision", t: "Cola de revisión", col: "izq", host: "iniRevision", fijo: true, aplica: () => REVISA_LOCAL },
    { id: "metas", t: "Metas del mes", col: "izq", host: "iniMetas", aplica: () => true },
    { id: "records", t: ADMIN ? "Récords de la redacción" : "Tu mejor mes", col: "izq", host: "iniRecords", aplica: () => true },
    { id: "evolucion", t: "Gráfico de 6 meses", col: "izq", dentro: "iniEvo", aplica: () => true },
    { id: "sincubrir", t: "Partidos sin cubrir", col: "izq", host: "iniSinCubrir", aplica: () => !FOTO && !ADMIN },
    { id: "sinfotos", t: "Partidos sin fotos", col: "izq", host: "iniSinFotos", aplica: () => FOTO },
    { id: "top", t: "Lo más leído tuyo", col: "izq", dentro: "iniTop", aplica: () => !FOTO },
    { id: "actividad", t: "Actividad reciente", col: "izq", dentro: "iniAct", aplica: () => true },
    { id: "fotostop", t: "Tus partidos más vistos", col: "izq", host: "iniFotosTop", aplica: () => FOTO },
    { id: "recientes", t: "Últimas noticias de la redacción", col: "izq", host: "iniRecientes", aplica: () => true },
    { id: "atajos", t: "Ir a…", col: "izq", host: "iniAtajos", aplica: () => true },
    { id: "partidos", t: "Partidos", col: "der", dentro: "iniPartidos", aplica: () => true },
    { id: "semana", t: "Esta semana", col: "der", host: "iniSemana", aplica: () => true },
    { id: "progreso", t: "Progreso de nivel", col: "der", host: "iniProgreso", aplica: () => !ADMIN },
    { id: "ranking", t: "Ranking del mes", col: "der", host: "iniRanking", aplica: () => !FOTO },
    { id: "equipo", t: "El equipo", col: "der", host: "iniEquipo", aplica: () => ADMIN },
    { id: "insignias", t: "Insignias", col: "der", dentro: "iniIns", aplica: () => !ADMIN },
    { id: "web", t: "La web pública", col: "der", host: "iniWeb", aplica: () => true },
  ];

  // Orden completo por columna a partir de lo guardado (puede ser null, venir de una versión anterior con otras
  // tarjetas, o tener ids repetidos). Lo conocido va primero en el orden guardado; las tarjetas nuevas o sin
  // guardar se añaden al final de su columna por defecto.
  function normalizarOrden(guardado, defs) {
    const ids = new Set(defs.map((d) => d.id));
    const puestos = new Set();
    const res = { izq: [], der: [] };
    for (const col of ["izq", "der"]) {
      const l = guardado && Array.isArray(guardado[col]) ? guardado[col] : [];
      for (const id of l) if (ids.has(id) && !puestos.has(id)) { res[col].push(id); puestos.add(id); }
    }
    for (const d of defs) if (!puestos.has(d.id)) { res[d.col].push(d.id); puestos.add(d.id); }
    return res;
  }

  // Mueve una tarjeta `delta` (-1 / +1) saltándose las ocultas. En pantalla de una columna, al llegar al borde
  // cruza a la otra columna (las columnas se ven una detrás de otra). Devuelve el orden nuevo o null si no se puede.
  function moverTarjeta(orden, ocultos, id, delta, unaColumna) {
    const o = { izq: orden.izq.slice(), der: orden.der.slice() };
    const col = o.izq.includes(id) ? "izq" : o.der.includes(id) ? "der" : null;
    if (!col) return null;
    const l = o[col];
    const i = l.indexOf(id);
    let j = i + delta;
    while (l[j] !== undefined && ocultos.includes(l[j])) j += delta;
    if (l[j] !== undefined) { l.splice(i, 1); l.splice(j, 0, id); return o; }
    if (!unaColumna) return null;
    if (delta < 0 && col === "der") { l.splice(i, 1); o.izq.push(id); return o; }
    if (delta > 0 && col === "izq") { l.splice(i, 1); o.der.unshift(id); return o; }
    return null;
  }
  function cambiarColumna(orden, id) {
    const o = { izq: orden.izq.filter((x) => x !== id), der: orden.der.filter((x) => x !== id) };
    (orden.izq.includes(id) ? o.der : o.izq).push(id);
    return o;
  }

  // Metas: dos por rol. `f` saca la cifra de una fila de la evolución mensual.
  function defsMetas(rol) {
    if (rol === "admin") return [
      { k: "pub", etq: "Publicaciones del equipo", ud: "publicaciones", sug: 40, f: (x) => x.publicaciones },
      { k: "vis", etq: "Visitas de la redacción", ud: "visitas", sug: 5000, f: (x) => x.visitas },
    ];
    if (rol === "fotografo") return [
      { k: "fotos", etq: "Fotos subidas", ud: "fotos", sug: 30, f: (x) => x.fotos },
      { k: "dias", etq: "Días activos", ud: "días", sug: 10, f: (x) => x.dias_activos },
    ];
    return [
      { k: "pub", etq: "Publicaciones", ud: "publicaciones", sug: 6, f: (x) => x.publicaciones },
      { k: "vis", etq: "Visitas a tus noticias", ud: "visitas", sug: 500, f: (x) => x.visitas },
    ];
  }
  function defsRecords(rol) {
    if (rol === "fotografo") return [
      { k: "fotos", etq: "Fotos subidas", f: (x) => x.fotos },
      { k: "gal", etq: "Fotos en galerías", f: (x) => x.fotos_vinculadas },
    ];
    return [
      { k: "pub", etq: rol === "admin" ? "Publicaciones del equipo" : "Publicaciones", f: (x) => x.publicaciones },
      { k: "vis", etq: rol === "admin" ? "Visitas de la redacción" : "Visitas", f: (x) => x.visitas },
    ];
  }
  const diasDelMes = (mes) => { const [a, m] = String(mes).split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };

  // Fila del mes en curso y la anterior, aunque la evolución no traiga todavía el mes actual (cuenta como 0).
  function filasMes(evolucion, mesActual) {
    const ev = Array.isArray(evolucion) ? evolucion : [];
    return { actual: ev.find((x) => x && x.mes === mesActual) || null, previas: ev.filter((x) => x && x.mes !== mesActual) };
  }
  function progresoMeta(valor, meta, dia, diasMes) {
    valor = Number(valor) || 0;
    const pct = meta > 0 ? Math.min(100, Math.round((valor / meta) * 100)) : 0;
    const esperado = Math.min(100, Math.round((dia / diasMes) * 100));
    const estado = valor >= meta ? "hecha" : (dia <= 3 || valor >= meta * (dia / diasMes) * 0.85) ? "ritmo" : "atras";
    return { pct, esperado, estado, faltan: Math.max(0, meta - valor), quedan: Math.max(0, diasMes - dia) };
  }
  // Meta propuesta al fijarla: algo más que el mes pasado (o la sugerida si no hay referencia).
  const metaSugerida = (previo, sug) => (previo > 0 ? Math.max(previo + 1, Math.ceil((previo * 11) / 10)) : sug);
  function recordMes(evolucion, mesActual, f) {
    const { actual, previas } = filasMes(evolucion, mesActual);
    let mejor = 0, mesMejor = null;
    for (const x of previas) { const v = Number(f(x)) || 0; if (v > mejor) { mejor = v; mesMejor = x.mes; } }
    const valor = actual ? Number(f(actual)) || 0 : 0;
    return {
      mejor, mesMejor, valor,
      pct: mejor > 0 ? Math.min(100, Math.round((valor / mejor) * 100)) : null,
      esRecord: mejor > 0 && valor > mejor && valor >= 3,
    };
  }

  window.EOFInicioLogica = { WIDGETS, normalizarOrden, moverTarjeta, cambiarColumna, defsMetas, defsRecords, diasDelMes, progresoMeta, metaSugerida, recordMes, filasMes };

  // ======================= PÁGINA =======================
  const panel = document.getElementById("panel-inicio");
  if (!panel) return;

  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICO = {
    sube: svg('<path d="m6 15 6-6 6 6"/>'),
    baja: svg('<path d="m6 9 6 6 6-6"/>'),
    col: svg('<path d="M7 7h13M7 7l3-3M7 7l3 3M17 17H4M17 17l-3-3M17 17l-3 3"/>'),
    oculta: svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10.6 10.6 0 0 0 4.4-.9"/>'),
    ajustes: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    diana: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>'),
    copa: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
    llama: svg('<path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4 0-7 1-10z"/>'),
    cerrar: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  };

  const hoyMadrid = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  const mesLargo = (mes, conAnio) => {
    const t = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", month: "long", ...(conAnio ? { year: "numeric" } : {}) }).format(new Date(`${mes}-01T12:00:00Z`));
    return t;
  };

  // ---------- Estado guardado ----------
  let est = null;
  function leer() {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(CLAVE) || "null"); } catch (_) { /* sin almacenamiento o dato roto */ }
    est = {
      ocultos: o && Array.isArray(o.ocultos) ? o.ocultos.filter((x) => typeof x === "string") : [],
      orden: o && o.orden && typeof o.orden === "object" ? o.orden : null,
      metas: o && o.metas && typeof o.metas === "object" ? o.metas : {},
      hechos: o && o.hechos && typeof o.hechos === "object" ? o.hechos : {},
    };
  }
  function guardar() {
    const mes = hoyMadrid().slice(0, 7);
    est.hechos = Object.fromEntries(Object.entries(est.hechos).filter(([k]) => k.startsWith(mes)));   // solo se recuerda el mes en curso
    try { localStorage.setItem(CLAVE, JSON.stringify(est)); } catch (_) { /* modo privado o cuota: se sigue sin guardar */ }
  }
  leer();

  // ---------- Tarjetas movibles ----------
  let regs = [];            // { def, wrap }
  let editando = false;
  const porId = (id) => regs.find((r) => r.def.id === id);
  const ordenActual = () => normalizarOrden(est.orden, regs.map((r) => r.def));
  const cols = () => { const c = panel.querySelectorAll(".ini-grid > .ini-col"); return { izq: c[0], der: c[1] }; };
  const anunciar = (txt) => {
    const l = document.getElementById("iniLive");
    if (!l) return;
    l.textContent = "";
    setTimeout(() => { l.textContent = txt; }, 30);
  };

  function crearHosts() {
    const raiz = document.getElementById("iniEvo");
    const seccion = raiz && raiz.closest("section");
    if (!seccion) return;
    for (const id of ["iniMetas", "iniRecords"]) {
      if (document.getElementById(id)) continue;
      const d = document.createElement("div");
      d.id = id;
      d.innerHTML = `<section class="ini-card" aria-busy="true"><div class="ini-sk ini-sk-lin"></div><div class="ini-sk ini-sk-lin"></div></section>`;
      seccion.parentNode.insertBefore(d, seccion);
    }
  }

  function cabecera(def) {
    const b = (acc, ico, etiqueta) => `<button type="button" class="ini-w-btn" data-pw="${acc}" data-w="${def.id}" aria-label="${esc(etiqueta)} «${esc(def.t)}»" title="${esc(etiqueta)}">${ico}</button>`;
    return `<div class="ini-w-cab" role="group" aria-label="Opciones de «${esc(def.t)}»">
      <span class="ini-w-tit">${esc(def.t)}</span>
      <span class="ini-w-btns">
        ${b("sube", ICO.sube, "Subir")}${b("baja", ICO.baja, "Bajar")}${b("col", ICO.col, "Pasar a la otra columna")}
        ${def.fijo ? `<span class="ini-w-fijo" title="Estos avisos son de trabajo y no se pueden ocultar">Siempre visible</span>` : b("oculta", ICO.oculta, "Ocultar")}
      </span></div>`;
  }

  function envolver() {
    regs = [];
    for (const def of WIDGETS) {
      const el = def.host ? document.getElementById(def.host) : (document.getElementById(def.dentro) || {}).closest && document.getElementById(def.dentro).closest("section");
      if (!el) continue;
      if (!def.aplica()) { if (def.host && !el.children.length) el.remove(); continue; }   // hueco vacío de otro rol: fuera
      if (el.parentNode && el.parentNode.classList && el.parentNode.classList.contains("ini-w-cuerpo")) { regs.push({ def, wrap: el.parentNode.parentNode }); continue; }
      const wrap = document.createElement("div");
      wrap.className = "ini-w";
      wrap.dataset.w = def.id;
      wrap.innerHTML = `${cabecera(def)}<div class="ini-w-cuerpo"></div>`;
      el.parentNode.insertBefore(wrap, el);
      wrap.querySelector(".ini-w-cuerpo").appendChild(el);
      regs.push({ def, wrap });
    }
  }

  function aplicarLayout() {
    const c = cols();
    if (!c.izq || !c.der) return;
    const o = ordenActual();
    for (const col of ["izq", "der"]) for (const id of o[col]) { const r = porId(id); if (r) c[col].appendChild(r.wrap); }
    for (const r of regs) r.wrap.hidden = est.ocultos.includes(r.def.id) && !r.def.fijo;
    refrescarBotones();
  }

  function refrescarBotones() {
    const o = ordenActual();
    const uno = UNA_COLUMNA();
    for (const col of ["izq", "der"]) {
      const vis = o[col].filter((id) => !est.ocultos.includes(id) || porId(id).def.fijo);
      vis.forEach((id, i) => {
        const w = porId(id).wrap;
        const sube = w.querySelector('[data-pw="sube"]'), baja = w.querySelector('[data-pw="baja"]'), cc = w.querySelector('[data-pw="col"]');
        sube.disabled = i === 0 && !(uno && col === "der");
        baja.disabled = i === vis.length - 1 && !(uno && col === "izq");
        const alOtro = col === "izq" ? "derecha" : "izquierda";
        const t = porId(id).def.t;
        cc.setAttribute("aria-label", `Pasar «${t}» a la columna ${alOtro}`);
        cc.title = `Pasar a la columna ${alOtro}`;
      });
    }
    pintarBanner();
  }

  function enfocar(id, acc) {
    const w = porId(id) && porId(id).wrap;
    if (!w) return;
    let b = w.querySelector(`[data-pw="${acc}"]`);
    if (!b || b.disabled) b = [...w.querySelectorAll(".ini-w-btn")].find((x) => !x.disabled);
    if (b) { b.focus({ preventScroll: true }); if (b.scrollIntoView) b.scrollIntoView({ block: "nearest", behavior: REDUCIR() ? "auto" : "smooth" }); }
  }

  function mover(id, delta) {
    const nuevo = moverTarjeta(ordenActual(), est.ocultos, id, delta, UNA_COLUMNA());
    if (!nuevo) return;
    est.orden = nuevo; guardar(); aplicarLayout();
    const col = nuevo.izq.includes(id) ? nuevo.izq : nuevo.der;
    anunciar(`«${porId(id).def.t}» movida a la posición ${col.filter((x) => !est.ocultos.includes(x)).indexOf(id) + 1} de ${col.filter((x) => !est.ocultos.includes(x)).length}.`);
    enfocar(id, delta < 0 ? "sube" : "baja");
  }
  function pasarDeColumna(id) {
    est.orden = cambiarColumna(ordenActual(), id); guardar(); aplicarLayout();
    anunciar(`«${porId(id).def.t}» pasada a la columna ${est.orden.izq.includes(id) ? "izquierda" : "derecha"}.`);
    enfocar(id, "col");
  }
  function ocultar(id) {
    const r = porId(id);
    if (!r || r.def.fijo || est.ocultos.includes(id)) return;
    est.ocultos.push(id); guardar(); aplicarLayout();
    anunciar(`«${r.def.t}» ocultada. Puedes volver a mostrarla desde la barra de personalización.`);
    const chip = document.querySelector(`#iniEditBanner [data-pw="mostrar"][data-w="${id}"]`);
    if (chip) chip.focus({ preventScroll: true });
  }
  function mostrar(id) {
    est.ocultos = est.ocultos.filter((x) => x !== id); guardar(); aplicarLayout();
    anunciar(`«${porId(id).def.t}» visible otra vez.`);
    enfocar(id, "sube");
  }
  function restablecer() {
    est.ocultos = []; est.orden = null; guardar(); aplicarLayout();
    anunciar("Inicio restablecido a su diseño original.");
    const b = document.querySelector('#iniEditBanner [data-pw="hecho"]'); if (b) b.focus({ preventScroll: true });
  }

  // ---------- Modo «Personalizar» ----------
  function pintarBanner() {
    const el = document.getElementById("iniEditBanner");
    if (!el) return;
    el.hidden = !editando;
    if (!editando) { el.innerHTML = ""; return; }
    const ocultas = est.ocultos.map((id) => porId(id)).filter((r) => r && !r.def.fijo);
    const hayCambios = !!est.orden || ocultas.length > 0;
    el.innerHTML = `
      <div class="ini-edit-cab">
        <div>
          <h3 class="ini-edit-tit">Personaliza tu Inicio</h3>
          <p class="ini-edit-txt">Sube, baja, cambia de columna u oculta las tarjetas con los botones de cada una. Se guarda solo, en este navegador.</p>
        </div>
        <div class="ini-edit-acc">
          <button type="button" class="ini-btn ini-btn-mini" data-pw="restablecer"${hayCambios ? "" : " disabled"}>Restablecer</button>
          <button type="button" class="ini-btn ini-btn-mini ini-btn-hecho" data-pw="hecho">Hecho</button>
        </div>
      </div>
      <div class="ini-edit-ocultas">${ocultas.length
        ? `<span class="ini-edit-lbl">Ocultas:</span>${ocultas.map((r) => `<button type="button" class="ini-chip-ocu" data-pw="mostrar" data-w="${r.def.id}" aria-label="Mostrar «${esc(r.def.t)}»">+ ${esc(r.def.t)}</button>`).join("")}`
        : `<span class="ini-edit-lbl">No hay tarjetas ocultas.</span>`}</div>`;
  }

  function alternarEdicion(si) {
    editando = typeof si === "boolean" ? si : !editando;
    const raiz = document.getElementById("iniRaiz");
    if (!raiz) return;
    raiz.classList.toggle("ini-edicion", editando);
    for (const r of regs) { const c = r.wrap.querySelector(".ini-w-cuerpo"); if (editando) c.setAttribute("inert", ""); else c.removeAttribute("inert"); }
    const b = document.querySelector('[data-pw="editar"]');
    if (b) { b.setAttribute("aria-pressed", String(editando)); b.querySelector(".ini-btn-txt").textContent = editando ? "Terminar" : "Personalizar"; }
    refrescarBotones();
    if (editando) { anunciar("Modo personalizar activado. Cada tarjeta tiene sus botones para moverla u ocultarla."); const h = document.querySelector("#iniEditBanner .ini-edit-tit"); if (h) { h.tabIndex = -1; h.focus({ preventScroll: false }); } }
    else { anunciar("Personalización terminada."); if (b) b.focus({ preventScroll: true }); }
  }

  function montarControles() {
    const acc = panel.querySelector(".ini-hero-acciones");
    if (acc && !acc.querySelector('[data-pw="editar"]')) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ini-btn ini-btn-fantasma"; b.dataset.pw = "editar"; b.setAttribute("aria-pressed", "false");
      b.innerHTML = `${ICO.ajustes}<span class="ini-btn-txt">Personalizar</span>`;
      acc.appendChild(b);
    }
    const grid = panel.querySelector(".ini-grid");
    if (grid && !document.getElementById("iniEditBanner")) {
      const s = document.createElement("section");
      s.id = "iniEditBanner"; s.className = "ini-edit"; s.hidden = true; s.setAttribute("aria-label", "Personalizar Inicio");
      grid.parentNode.insertBefore(s, grid);
      const live = document.createElement("div");
      live.id = "iniLive"; live.className = "ini-sr"; live.setAttribute("role", "status"); live.setAttribute("aria-live", "polite");
      grid.parentNode.insertBefore(live, grid);
    }
  }

  // ======================= METAS Y RÉCORDS =======================
  const mesActual = () => hoyMadrid().slice(0, 7);
  // Evolución mensual que corresponde al rol: la del equipo (Responsable) o la personal.
  function evolucion() {
    const e = window.EOFInicio && window.EOFInicio.estado ? window.EOFInicio.estado() : {};
    if (ADMIN) return e.resumen && e.resumen.equipo && Array.isArray(e.resumen.equipo.evolucion) ? e.resumen.equipo.evolucion : null;
    return e.datos && Array.isArray(e.datos.evolucion) ? e.datos.evolucion : null;
  }
  const hayError = () => { const e = window.EOFInicio && window.EOFInicio.estado ? window.EOFInicio.estado() : {}; return ADMIN ? (e.errorResumen && !e.resumen) : (e.errorDatos && !e.datos); };
  const errorTarjeta = (titulo) => `<section class="ini-card"><div class="ini-card-cab"><h3 class="ini-card-tit">${esc(titulo)}</h3></div><div class="ini-error">No se han podido cargar estos datos. <button type="button" class="ini-link" data-ini="recargar">Reintentar</button></div></section>`;

  let editandoMeta = null;       // clave de la meta que se está editando
  let celebrar = [];             // celebraciones pendientes de enseñar: { clave, txt }

  function pintarMetas(animar) {
    const el = document.getElementById("iniMetas");
    if (!el) return;
    const ev = evolucion();
    if (!ev) { if (hayError()) el.innerHTML = errorTarjeta("Metas del mes"); return; }
    const mes = mesActual(), dias = diasDelMes(mes), dia = Number(hoyMadrid().slice(8, 10));
    const { actual, previas } = filasMes(ev, mes);
    const previo = previas.length ? previas[previas.length - 1] : null;
    const filas = defsMetas(ROL).map((d) => {
      const valor = actual ? Number(d.f(actual)) || 0 : 0;
      const meta = Number(est.metas[d.k]) || 0;
      const ant = previo && previo.mes === prevMes(mes) ? Number(d.f(previo)) || 0 : 0;
      if (editandoMeta === d.k) {
        const pre = meta || metaSugerida(ant, d.sug);
        return `<div class="ini-meta editando">
          <label class="ini-meta-etq" for="iniMetaIn">${esc(d.etq)} · meta de ${esc(mesLargo(mes))}</label>
          <div class="ini-meta-edit">
            <input type="number" id="iniMetaIn" inputmode="numeric" min="1" max="99999" step="1" value="${pre}" data-k="${d.k}" aria-describedby="iniMetaAyuda">
            <button type="button" class="ini-btn ini-btn-mini ini-btn-hecho" data-pw="meta-guardar" data-k="${d.k}">Guardar</button>
            <button type="button" class="ini-btn ini-btn-mini" data-pw="meta-cancelar">Cancelar</button>
          </div>
          <div class="ini-meta-pie" id="iniMetaAyuda"><span>Llevas ${num(valor)} ${esc(d.ud)} este mes${ant ? ` · el mes pasado ${num(ant)}` : ""}.</span>${meta ? `<button type="button" class="ini-link" data-pw="meta-quitar" data-k="${d.k}">Quitar meta</button>` : ""}</div>
        </div>`;
      }
      if (!meta) {
        return `<div class="ini-meta vacia">
          <div class="ini-meta-cab"><span class="ini-meta-etq">${esc(d.etq)}</span><span class="ini-meta-cifra"><b>${num(valor)}</b> este mes</span></div>
          <div class="ini-meta-pie"><span>Sin meta para este mes.</span><button type="button" class="ini-link" data-pw="meta-editar" data-k="${d.k}">Fijar meta</button></div>
        </div>`;
      }
      const p = progresoMeta(valor, meta, dia, dias);
      const estado = { hecha: ["hecha", "¡Meta conseguida!"], ritmo: ["ritmo", "En ritmo"], atras: ["atras", "Por detrás del ritmo"] }[p.estado];
      if (p.estado === "hecha") celebrar.push({ clave: `${mes}:meta:${d.k}`, txt: `🎯 ¡Meta cumplida! ${d.etq}: ${num(valor)} de ${num(meta)}` });
      return `<div class="ini-meta ${estado[0]}">
        <div class="ini-meta-cab"><span class="ini-meta-etq">${esc(d.etq)}</span><span class="ini-meta-cifra"><b>${num(valor)}</b> / ${num(meta)}</span></div>
        <div class="ini-meta-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${meta}" aria-valuenow="${Math.min(valor, meta)}" aria-valuetext="${num(valor)} de ${num(meta)} ${esc(d.ud)}, ${p.pct} por ciento" aria-label="${esc(d.etq)}">
          <i style="width:${animar && !REDUCIR() ? 0 : p.pct}%" data-w="${p.pct}"></i>${p.estado === "hecha" ? "" : `<u style="left:${p.esperado}%" title="Dónde deberías ir hoy"></u>`}
        </div>
        <div class="ini-meta-pie"><span class="ini-meta-estado">${estado[1]}</span><span>${p.estado === "hecha" ? `${num(valor - meta)} de más · ${p.quedan === 1 ? "queda 1 día" : `quedan ${p.quedan} días`}` : `Faltan ${num(p.faltan)} · ${p.quedan === 1 ? "queda 1 día" : `quedan ${p.quedan} días`}`}</span><button type="button" class="ini-link" data-pw="meta-editar" data-k="${d.k}">Cambiar</button></div>
      </div>`;
    }).join("");
    el.innerHTML = `<section class="ini-card" aria-labelledby="iniMetasTit">
      <div class="ini-card-cab"><h3 class="ini-card-tit" id="iniMetasTit">Metas de ${esc(mesLargo(mes))}</h3><span class="ini-card-sub">${ICO.diana}Día ${dia} de ${dias}</span></div>
      <div class="ini-metas">${filas}</div></section>`;
    if (animar && !REDUCIR()) requestAnimationFrame(() => requestAnimationFrame(() => { el.querySelectorAll(".ini-meta-barra i").forEach((b) => { b.style.width = b.dataset.w + "%"; }); }));
    if (editandoMeta) { const i = document.getElementById("iniMetaIn"); if (i && document.activeElement !== i) { i.focus(); i.select(); } }
  }
  const prevMes = (mes) => { const [a, m] = mes.split("-").map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; };

  function pintarRecords(animar) {
    const el = document.getElementById("iniRecords");
    if (!el) return;
    const ev = evolucion();
    const titulo = ADMIN ? "Récords de la redacción" : "Tu mejor mes";
    if (!ev) { if (hayError()) el.innerHTML = errorTarjeta(titulo); return; }
    const mes = mesActual();
    const defs = defsRecords(ROL).map((d) => ({ d, r: recordMes(ev, mes, d.f) }));
    const e = window.EOFInicio && window.EOFInicio.estado ? window.EOFInicio.estado() : {};
    const racha = !ADMIN && e.datos && e.datos.racha ? e.datos.racha : null;
    const conReferencia = defs.some((x) => x.r.mejor > 0);
    const anio = mes.slice(0, 4);
    const filas = defs.map(({ d, r }) => {
      if (r.esRecord) celebrar.push({ clave: `${mes}:rec:${d.k}`, txt: `🏆 ¡Nuevo récord! ${d.etq}: ${num(r.valor)} (antes ${num(r.mejor)})` });
      if (r.mejor <= 0) return `<div class="ini-rec"><div class="ini-rec-cab"><span class="ini-rec-etq">${esc(d.etq)}</span><span class="ini-rec-val"><b>${num(r.valor)}</b> este mes</span></div><div class="ini-rec-pie">Todavía no hay un mes anterior con el que compararte.</div></div>`;
      const cuando = mesLargo(r.mesMejor, r.mesMejor.slice(0, 4) !== anio);
      return `<div class="ini-rec${r.esRecord ? " nuevo" : ""}">
        <div class="ini-rec-cab"><span class="ini-rec-etq">${esc(d.etq)}</span>${r.esRecord ? `<span class="ini-rec-badge">${ICO.copa}¡Nuevo récord!</span>` : `<span class="ini-rec-val"><b>${num(r.valor)}</b> este mes</span>`}</div>
        <div class="ini-meta-barra ini-rec-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${r.mejor}" aria-valuenow="${Math.min(r.valor, r.mejor)}" aria-valuetext="${num(r.valor)} frente a ${num(r.mejor)} de tu mejor mes" aria-label="${esc(d.etq)} frente al mejor mes"><i style="width:${animar && !REDUCIR() ? 0 : r.pct}%" data-w="${r.pct}"></i></div>
        <div class="ini-rec-pie">${r.esRecord ? `Superas los ${num(r.mejor)} de ${esc(cuando)}.` : `Mejor mes: <b>${num(r.mejor)}</b> en ${esc(cuando)} · ${r.valor >= r.mejor ? "igualas tu récord" : `te faltan ${num(r.mejor - r.valor + 1)} para batirlo`}`}</div>
      </div>`;
    }).join("");
    const lineaRacha = racha && racha.mejor > 0
      ? `<div class="ini-rec-racha">${ICO.llama}<span>Racha: <b>${num(racha.actual)}</b> ${racha.actual === 1 ? "semana" : "semanas"} · mejor <b>${num(racha.mejor)}</b>${racha.actual >= racha.mejor && racha.actual >= 2 ? " — ¡estás en tu mejor racha!" : ""}</span></div>` : "";
    el.innerHTML = `<section class="ini-card" aria-labelledby="iniRecordsTit">
      <div class="ini-card-cab"><h3 class="ini-card-tit" id="iniRecordsTit">${esc(titulo)}</h3><span class="ini-card-sub">Últimos ${ev.length} meses</span></div>
      ${conReferencia || ev.length ? `<div class="ini-recs">${filas}</div>` : `<div class="ini-vacio">Cuando acumules unos meses de actividad verás aquí tu mejor mes.</div>`}
      ${lineaRacha}</section>`;
    if (animar && !REDUCIR()) requestAnimationFrame(() => requestAnimationFrame(() => { el.querySelectorAll(".ini-rec-barra i").forEach((b) => { b.style.width = b.dataset.w + "%"; }); }));
  }

  function pintarMetasYRecords(animar) {
    celebrar = [];
    pintarMetas(animar);
    pintarRecords(animar);
    celebrarPendientes();
  }

  // ---------- Aviso de celebración ----------
  function confeti() {
    if (REDUCIR()) return;
    const c = document.createElement("div");
    c.className = "ini-confeti"; c.setAttribute("aria-hidden", "true");
    const col = ["#d1132e", "#5bb8e8", "#f5c542", "#1b8a4a", "#8e5bd9", "#ffffff"];
    for (let i = 0; i < 42; i++) {
      const s = document.createElement("i");
      s.style.cssText = `left:${Math.random() * 100}%;background:${col[i % col.length]};--dx:${(Math.random() * 160 - 80).toFixed(0)}px;--giro:${(Math.random() * 720 - 360).toFixed(0)}deg;animation-delay:${(Math.random() * 0.35).toFixed(2)}s;animation-duration:${(1.9 + Math.random() * 1.2).toFixed(2)}s`;
      c.appendChild(s);
    }
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3600);
  }
  function toast(lineas) {
    const viejo = document.getElementById("iniToast"); if (viejo) viejo.remove();
    const t = document.createElement("div");
    t.id = "iniToast"; t.className = "ini-toast"; t.setAttribute("role", "status");
    t.innerHTML = `<div class="ini-toast-txt">${lineas.map((l) => `<div>${esc(l)}</div>`).join("")}</div><button type="button" class="ini-toast-x" aria-label="Cerrar aviso">${ICO.cerrar}</button>`;
    t.querySelector("button").addEventListener("click", () => t.remove());
    document.body.appendChild(t);
    setTimeout(() => { if (t.isConnected) t.remove(); }, 9000);
  }
  // Un diálogo a la vista (recorrido de bienvenida, celebración de racha, avisos de entrada…) tapa el aviso.
  const hayDialogoAbierto = () => [...document.querySelectorAll('[aria-modal="true"]')].some((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden");
  const T0 = Date.now();
  let reintentos = 0, temporizador = null;
  // Solo se celebra con Inicio a la vista, la pestaña del navegador activa y ningún diálogo delante; si no, se
  // espera (se reintenta cada 2,5 s un máximo de 24 veces) o queda pendiente hasta la próxima visita a Inicio.
  function celebrarPendientes() {
    if (!celebrar.length) return;
    if (!panel.classList.contains("activo") || document.visibilityState !== "visible") return;
    // Recién cargado el panel aún pueden abrirse el recorrido de bienvenida o la celebración de racha (con retraso): se espera.
    const desdeCarga = Date.now() - T0;
    if (desdeCarga < 3500) { if (!temporizador) temporizador = setTimeout(() => { temporizador = null; celebrarPendientes(); }, 3600 - desdeCarga); return; }
    if (hayDialogoAbierto()) {
      if (!temporizador && reintentos < 24) { reintentos++; temporizador = setTimeout(() => { temporizador = null; celebrarPendientes(); }, 2500); }
      return;
    }
    reintentos = 0;
    const nuevas = celebrar.filter((c) => !est.hechos[c.clave]);
    celebrar = [];
    if (!nuevas.length) return;
    nuevas.forEach((c) => { est.hechos[c.clave] = 1; });
    guardar();
    confeti();
    toast(nuevas.map((c) => c.txt));
  }

  // ---------- Eventos ----------
  function guardarMeta(k) {
    const i = document.getElementById("iniMetaIn");
    const n = Math.floor(Number(i && i.value));
    if (!Number.isFinite(n) || n < 1 || n > 99999) { if (i) { i.setAttribute("aria-invalid", "true"); i.focus(); } anunciar("Escribe una meta entre 1 y 99.999."); return; }
    est.metas[k] = n;
    // Si ya la has cumplido al fijarla, no hace falta celebrarla.
    const d = defsMetas(ROL).find((x) => x.k === k), ev = evolucion();
    if (d && ev) { const { actual } = filasMes(ev, mesActual()); if (actual && (Number(d.f(actual)) || 0) >= n) est.hechos[`${mesActual()}:meta:${k}`] = 1; }
    guardar(); editandoMeta = null; pintarMetasYRecords(false);
    anunciar(`Meta fijada en ${num(n)}.`);
    const b = document.querySelector(`#iniMetas [data-pw="meta-editar"][data-k="${k}"]`); if (b) b.focus();
  }
  panel.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-pw]");
    if (!b) return;
    const a = b.dataset.pw, id = b.dataset.w, k = b.dataset.k;
    if (a === "editar") alternarEdicion();
    else if (a === "hecho") alternarEdicion(false);
    else if (a === "restablecer") restablecer();
    else if (a === "sube") mover(id, -1);
    else if (a === "baja") mover(id, 1);
    else if (a === "col") pasarDeColumna(id);
    else if (a === "oculta") ocultar(id);
    else if (a === "mostrar") mostrar(id);
    else if (a === "meta-editar") { editandoMeta = k; pintarMetas(false); }
    else if (a === "meta-cancelar") { const k0 = editandoMeta; editandoMeta = null; pintarMetas(false); const x = document.querySelector(`#iniMetas [data-pw="meta-editar"][data-k="${k0}"]`); if (x) x.focus(); }
    else if (a === "meta-guardar") guardarMeta(k);
    else if (a === "meta-quitar") { delete est.metas[k]; delete est.hechos[`${mesActual()}:meta:${k}`]; guardar(); editandoMeta = null; pintarMetasYRecords(false); anunciar("Meta quitada."); }
  });
  panel.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target.id === "iniMetaIn") { ev.preventDefault(); guardarMeta(ev.target.dataset.k); }
    else if (ev.key === "Escape") {
      if (editandoMeta) { ev.preventDefault(); const k0 = editandoMeta; editandoMeta = null; pintarMetas(false); const x = document.querySelector(`#iniMetas [data-pw="meta-editar"][data-k="${k0}"]`); if (x) x.focus(); }
      else if (editando) { ev.preventDefault(); alternarEdicion(false); }
    }
  });
  window.addEventListener("resize", () => { if (regs.length) refrescarBotones(); });

  document.addEventListener("eof:inicio-montado", () => {
    leer();
    editando = false; editandoMeta = null;
    crearHosts();
    envolver();
    montarControles();
    aplicarLayout();
  });
  document.addEventListener("eof:inicio-pintado", () => pintarMetasYRecords(true));
  document.addEventListener("eof:inicio-visible", () => { celebrarPendientes(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !editandoMeta) pintarMetasYRecords(false); });

  window.EOFInicioPersonal = {
    editar: alternarEdicion,
    restablecer,
    // Para revisar el aviso sin tener que cumplir una meta: EOFInicioPersonal.probarCelebracion()
    probarCelebracion: () => { confeti(); toast(["🎯 ¡Meta cumplida! Publicaciones: 6 de 6", "🏆 ¡Nuevo récord! Visitas: 812 (antes 640)"]); },
  };
})();
