// ---------- Funcionalidades > Responsabilidades: organización (solo Responsables) ----------
// Tres cosas, todas del lado del navegador y sin tocar datos:
//   1. Pestaña «Resumen» (la primera): qué necesita atención ahora mismo en las cuatro áreas y una
//      tarjeta por área con sus cifras y un botón para abrirla.
//   2. Cada sección se puede plegar (se recuerda en este navegador) desde su cabecera.
//   3. Índice «Ir a» arriba de cada área con varias secciones, para saltar a una sin hacer scroll.
// Cifras: window.EOFResponsabilidades.resumen() (relaciones, RRHH) + dos lecturas ligeras de
// /api/responsabilidades/niveles?area=redaccion y /api/responsabilidades/fotografia (cada 60 s como mucho).
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const CLAVE_PLEGADAS = "eof_resp_plegadas";
  const CACHE_MS = 60000;

  const ICO = {
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    flecha: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    aviso: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>',
    relaciones: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
    rrhh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    redaccion: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    fotografia: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>',
  };

  // ---------- Lecturas ligeras de Redacción y Fotografía ----------
  const externos = {
    redaccion: { datos: null, en: 0, cargando: false, error: false },
    fotografia: { datos: null, en: 0, cargando: false, error: false },
  };

  async function leer(clave, ruta, valido) {
    const x = externos[clave];
    if (x.cargando || (x.datos && Date.now() - x.en < CACHE_MS)) return;
    if (typeof apiFetch !== "function") return;
    x.cargando = true;
    try {
      const d = await apiFetch(ruta);
      if (!valido(d)) throw new Error("Respuesta no válida");
      x.datos = d; x.en = Date.now(); x.error = false;
    } catch { x.error = true; }
    x.cargando = false;
    pintarResumen();
    pintarContadoresPestanas();
  }
  const leerRedaccion = () => leer("redaccion", "/api/responsabilidades/niveles?area=redaccion", (d) => d && d.resumen && Array.isArray(d.personas));
  const leerFotografia = () => leer("fotografia", "/api/responsabilidades/fotografia", (d) => d && Array.isArray(d.fotografos));

  function cifrasRedaccion() {
    const d = externos.redaccion.datos;
    return d ? { listos: Number(d.resumen.listos) || 0, enCamino: Math.max(0, d.personas.length - (Number(d.resumen.listos) || 0)), enMaximo: Number(d.resumen.en_maximo) || 0 } : null;
  }
  function cifrasFotografia() {
    const d = externos.fotografia.datos;
    if (!d) return null;
    const por = (e) => d.fotografos.filter((f) => f.galeria && f.galeria.estado === e).length;
    // Solo cuentan como pendientes las galerías sin publicar de partidos de los últimos 7 días.
    const hoy = Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date()) + "T00:00:00Z");
    const reciente = (f) => { const m = f.partido && /^(\d{4}-\d{2}-\d{2})/.exec(String(f.partido.fecha_partido || "")); return !!m && (hoy - Date.parse(m[1] + "T00:00:00Z")) / 86400000 <= 7; };
    const sinPub = d.fotografos.filter((f) => f.galeria && (f.galeria.estado === "sin_publicar" || f.galeria.estado === "no_subida") && reciente(f)).length;
    return { total: d.fotografos.length, sinPublicar: sinPub, publicadas: por("publicada"), pendientes: por("pendiente"), sinPartido: por("sin_partido") };
  }

  // ---------- Resumen ----------
  function irA(subtab, seccionId) {
    const b = document.querySelector(`#subtabsResponsabilidades [data-subtab="${subtab}"]`);
    if (b) b.click();
    if (seccionId) setTimeout(() => abrirSeccion(seccionId), 60);
  }

  const AREAS_NOMBRE = { respRelaciones: "relaciones", respRrhh: "rrhh", respRedaccion: "redaccion", respFotografia: "fotografia" };

  function barra(hechos, total) {
    const pc = total > 0 ? Math.round((hechos / total) * 100) : 0;
    return `<span class="ro-barra" role="img" aria-label="${pc}%"><i style="width:${pc}%"></i></span>`;
  }
  function fila(texto, valor, extra) {
    return `<li class="ro-fila"><span class="ro-fila-t">${texto}</span><span class="ro-fila-v">${valor}</span>${extra || ""}</li>`;
  }
  const pct = (h, t) => (t > 0 ? Math.round((h / t) * 100) : 0);

  function atencion(r, red, fot) {
    const a = [];
    if (r && r.contactoDebido) a.push({ n: "!", txt: "Toca contactar con los colaboradores activos.", sub: "Recursos humanos", ir: ["respRrhh", "respSecRrhhContacto"] });
    if (red && red.listos) a.push({ n: red.listos, txt: `${plural(red.listos, "redactor cumple", "redactores cumplen")} los requisitos y espera${red.listos === 1 ? "" : "n"} tu decisión.`, sub: "Redacción", ir: ["respRedaccion", "respSecRedaccion"] });
    if (fot && fot.sinPublicar) a.push({ n: fot.sinPublicar, txt: `${plural(fot.sinPublicar, "partido con la galería", "partidos con la galería")} sin publicar.`, sub: "Fotografía", ir: ["respFotografia", "respSecFotografia"] });
    if (r && r.clubesTotal && r.redactores < r.clubesTotal) a.push({ n: r.clubesTotal - r.redactores, txt: `${plural(r.clubesTotal - r.redactores, "club", "clubes")} sin redactor asignado.`, sub: "Recursos humanos", ir: ["respRrhh", "respSecRrhhClubes"] });
    if (r && r.fichajesPorContactar) a.push({ n: r.fichajesPorContactar, txt: `${plural(r.fichajesPorContactar, "persona", "personas")} de tu lista de fichajes por contactar.`, sub: "Fichajes", ir: ["respRrhh", "respSecRrhhFichajes"] });
    return a;
  }

  // opciones: { ring: {pct, texto}, big: {n, texto}, avisos: número de cosas pendientes del área }
  function tarjeta(clave, titulo, desc, filas, destino, o) {
    o = o || {};
    const medidor = o.ring
      ? `<div class="ro-medidor"><span class="ro-anillo" style="--p:${o.ring.pct}" role="img" aria-label="${o.ring.pct}%"><b>${o.ring.pct}<small>%</small></b></span><span class="ro-medidor-t">${esc(o.ring.texto)}</span></div>`
      : (o.big ? `<div class="ro-medidor"><span class="ro-gran${o.big.n ? " ro-gran-alerta" : ""}"><b>${esc(o.big.n)}</b></span><span class="ro-medidor-t">${esc(o.big.texto)}</span></div>` : "");
    const pastilla = o.avisos ? `<span class="ro-pastilla ro-pastilla-aviso">${o.avisos} pendiente${o.avisos === 1 ? "" : "s"}</span>` : `<span class="ro-pastilla ro-pastilla-ok">Sin pendientes</span>`;
    return `<article class="ro-card ro-${clave}">
      <header class="ro-card-cab"><span class="ro-ico">${ICO[clave]}</span><div class="ro-card-tit"><h4>${esc(titulo)}</h4><p>${esc(desc)}</p></div>${o.cargando ? "" : pastilla}</header>
      ${medidor}
      <ul class="ro-filas">${filas || '<li class="ro-fila ro-fila-vacia">Cargando…</li>'}</ul>
      <button type="button" class="ro-abrir" data-ro-ir="${destino}">Abrir ${ICO.flecha}</button>
    </article>`;
  }

  function pintarResumen() {
    const raiz = $("respResumen");
    if (!raiz) return;
    const api = window.EOFResponsabilidades;
    const r = api && api.resumen ? api.resumen() : null;
    const red = cifrasRedaccion();
    const fot = cifrasFotografia();

    if (!r) {
      raiz.innerHTML = '<div class="ro-cargando"><span class="ro-spin" aria-hidden="true"></span>Cargando el resumen…</div>';
      return;
    }

    const lista = atencion(r, red, fot);
    const porArea = { relaciones: 0, rrhh: 0, redaccion: 0, fotografia: 0 };
    lista.forEach((x) => { porArea[AREAS_NOMBRE[x.ir[0]]]++; });
    const faltan = (externos.redaccion.error || externos.fotografia.error) && (!red || !fot);

    const hero = lista.length
      ? `<div class="ro-hero ro-hero-aviso"><span class="ro-hero-ico">${ICO.aviso}</span><div><strong>${plural(lista.length, "cosa requiere", "cosas requieren")} tu atención</strong><span>Empieza por la primera de la lista: lleva directamente a donde se resuelve.</span></div></div>`
      : `<div class="ro-hero ro-hero-ok"><span class="ro-hero-ico">${ICO.ok}</span><div><strong>Todo al día</strong><span>Ahora mismo no hay nada que requiera tu atención.</span></div></div>`;
    const cabAtencion = lista.length
      ? `<ul class="ro-atencion">${lista.map((x, i) => `<li><button type="button" class="ro-att ro-att-${AREAS_NOMBRE[x.ir[0]]}" data-ro-att="${i}"><b class="ro-att-n">${esc(x.n)}</b><span class="ro-att-t">${esc(x.txt)}<small>${esc(x.sub)}</small></span><i>${ICO.flecha}</i></button></li>`).join("")}</ul>`
      : "";

    const cRel = [
      fila("Contactos en la base de datos", r.contactos),
      fila("Clubes sin relación", Math.max(0, r.clubesTotal - r.relaciones)),
    ].join("");
    const cRrhh = [
      fila("Contacto con colaboradores", r.contactoDebido ? '<b class="ro-mal">Toca ahora</b>' : (r.contactoHecho ? `Al día${r.contactoProximo ? " · próximo en " + esc(r.contactoProximo) : ""}` : "—")),
      fila("Clubes con fotógrafo", `${r.fotografos} / ${r.clubesTotal}`, barra(r.fotografos, r.clubesTotal)),
      fila("Fichajes en curso", r.fichajesAbiertos),
    ].join("");
    const cRed = red ? [
      fila("En camino", red.enCamino),
      fila("En el nivel máximo", red.enMaximo),
    ].join("") : (externos.redaccion.error ? fila("No se han podido cargar los niveles", "—") : "");
    const cFot = fot ? [
      fila("Fotógrafos acreditados", fot.total),
      fila("Galerías publicadas", fot.publicadas),
      fila("Partidos por jugar", fot.pendientes),
    ].join("") : (externos.fotografia.error ? fila("No se han podido cargar los fotógrafos", "—") : "");

    raiz.innerHTML = `
      ${hero}
      ${cabAtencion ? `<section class="ro-bloque" aria-labelledby="roAtTitulo"><h4 class="ro-titulo" id="roAtTitulo">Qué necesita tu atención</h4>${cabAtencion}</section>` : ""}
      ${faltan ? '<p class="ro-nota">Algunos datos de Redacción o Fotografía no se han podido cargar; el resumen puede estar incompleto.</p>' : ""}
      <section class="ro-bloque" aria-labelledby="roAreasTitulo">
        <h4 class="ro-titulo" id="roAreasTitulo">Tus áreas</h4>
        <div class="ro-grid">
          ${tarjeta("relaciones", "Relaciones institucionales", "Clubes, contactos y plantillas.", cRel, "respRelaciones", { ring: { pct: pct(r.relaciones, r.clubesTotal), texto: `${r.relaciones} de ${r.clubesTotal} clubes con relación` }, avisos: porArea.relaciones })}
          ${tarjeta("rrhh", "Recursos humanos", "Colaboradores, cobertura y fichajes.", cRrhh, "respRrhh", { ring: { pct: pct(r.redactores, r.clubesTotal), texto: `${r.redactores} de ${r.clubesTotal} clubes con redactor` }, avisos: porArea.rrhh })}
          ${tarjeta("redaccion", "Redacción", "Niveles y ascensos de redactores.", cRed, "respRedaccion", red ? { big: { n: red.listos, texto: red.listos === 1 ? "redactor espera tu decisión" : "redactores esperan tu decisión" }, avisos: porArea.redaccion } : { cargando: true })}
          ${tarjeta("fotografia", "Fotografía", "Acreditados, galerías y niveles.", cFot, "respFotografia", fot ? { big: { n: fot.sinPublicar, texto: fot.sinPublicar === 1 ? "galería sin publicar" : "galerías sin publicar" }, avisos: porArea.fotografia } : { cargando: true })}
        </div>
      </section>`;
    raiz._atencion = lista;
  }

  // ---------- Contadores en las pestañas ----------
  function ponerContador(subtab, n) {
    const b = document.querySelector(`#subtabsResponsabilidades [data-subtab="${subtab}"]`);
    if (!b) return;
    let s = b.querySelector(".ro-tab-n");
    if (!n) { if (s) s.remove(); return; }
    if (!s) { s = document.createElement("span"); s.className = "ro-tab-n"; b.appendChild(s); }
    s.textContent = n > 99 ? "99+" : String(n);
    s.title = "Esperan tu decisión de nivel";
  }
  function pintarContadoresPestanas() {
    const red = cifrasRedaccion(); const fot = cifrasFotografia();
    // Fotografía ya pinta su propio contador (.rf-contador, en responsabilidades-fotografia.js): aquí solo Redacción.
    if (red) ponerContador("respRedaccion", red.listos);
  }

  // ---------- Secciones plegables ----------
  function leerPlegadas() {
    try { const a = JSON.parse(localStorage.getItem(CLAVE_PLEGADAS) || "[]"); return new Set(Array.isArray(a) ? a : []); } catch { return new Set(); }
  }
  function guardarPlegadas(set) { try { localStorage.setItem(CLAVE_PLEGADAS, JSON.stringify([...set])); } catch { /* sin storage */ } }

  function fijarPlegada(sec, plegada, persistir) {
    sec.classList.toggle("ro-plegada", plegada);
    const cab = sec.querySelector(":scope > .info-cab");
    const btn = cab && cab.querySelector(".ro-plegar");
    if (btn) { btn.setAttribute("aria-expanded", plegada ? "false" : "true"); btn.title = plegada ? "Desplegar la sección" : "Plegar la sección"; }
    if (persistir && sec.id) { const set = leerPlegadas(); if (plegada) set.add(sec.id); else set.delete(sec.id); guardarPlegadas(set); }
  }
  function abrirSeccion(id) {
    const sec = $(id);
    if (!sec) return;
    if (sec.classList.contains("ro-plegada")) fijarPlegada(sec, false, true);
    sec.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function prepararSecciones() {
    const plegadas = leerPlegadas();
    document.querySelectorAll("#subpanel-responsabilidades .info-seccion").forEach((sec) => {
      const cab = sec.querySelector(":scope > .info-cab");
      if (!cab || cab.querySelector(".ro-plegar")) return;
      const b = document.createElement("button");
      b.type = "button"; b.className = "ro-plegar"; b.setAttribute("aria-expanded", "true"); b.setAttribute("aria-controls", sec.id);
      b.innerHTML = ICO.chev;
      cab.appendChild(b);
      cab.classList.add("ro-cab-plegable");
      fijarPlegada(sec, plegadas.has(sec.id), false);
    });
  }

  // ---------- Índice «Ir a» ----------
  function prepararIndices() {
    ["respRelaciones", "respRrhh", "respFotografia"].forEach((sp) => {
      const panel = $("subpanel-" + sp);
      if (!panel || panel.querySelector(":scope > .ro-indice")) return;
      const secs = [...panel.querySelectorAll(":scope > .info-seccion")];
      if (secs.length < 2) return;
      const nav = document.createElement("nav");
      nav.className = "ro-indice";
      nav.setAttribute("aria-label", "Secciones de esta área");
      nav.innerHTML = `<span class="ro-indice-t">Ir a</span>` + secs.map((s) => {
        const t = s.querySelector(".info-titulo");
        return `<button type="button" class="ro-indice-b" data-ro-sec="${esc(s.id)}">${esc(t ? t.textContent.trim() : s.id)}</button>`;
      }).join("") + `<span class="ro-indice-acc"><button type="button" data-ro-todas="plegar">Plegar todo</button><button type="button" data-ro-todas="desplegar">Desplegar todo</button></span>`;
      panel.insertBefore(nav, panel.firstChild);
    });
  }

  // ---------- Eventos ----------
  function alClic(e) {
    const ir = e.target.closest("[data-ro-ir]");
    if (ir) { irA(ir.dataset.roIr, ir.dataset.roSec); return; }
    const att = e.target.closest("[data-ro-att]");
    if (att) {
      const lista = ($("respResumen") || {})._atencion || [];
      const x = lista[Number(att.dataset.roAtt)];
      if (x) irA(x.ir[0], x.ir[1]);
      return;
    }
    const sec = e.target.closest("[data-ro-sec]");
    if (sec && sec.classList.contains("ro-indice-b")) { abrirSeccion(sec.dataset.roSec); return; }
    const todas = e.target.closest("[data-ro-todas]");
    if (todas) {
      const panel = todas.closest(".subpanel");
      const plegar = todas.dataset.roTodas === "plegar";
      const set = leerPlegadas();
      panel.querySelectorAll(":scope > .info-seccion").forEach((s) => { fijarPlegada(s, plegar, false); if (plegar) set.add(s.id); else set.delete(s.id); });
      guardarPlegadas(set);
      return;
    }
    const plegarBtn = e.target.closest(".ro-plegar");
    const cab = e.target.closest(".ro-cab-plegable");
    if (plegarBtn || (cab && !e.target.closest("a, input, select, textarea, button"))) {
      const s = (plegarBtn || cab).closest(".info-seccion");
      if (s) fijarPlegada(s, !s.classList.contains("ro-plegada"), true);
    }
  }

  function refrescar() { pintarResumen(); leerRedaccion(); leerFotografia(); }

  function iniciar() {
    const panel = $("subpanel-responsabilidades");
    if (!panel) return;
    prepararSecciones();
    prepararIndices();
    panel.addEventListener("click", alClic);
    window.addEventListener("eof-resp-pintado", pintarResumen);
    const raizResp = $("subtabFuncResponsabilidades_btn");
    if (raizResp) raizResp.addEventListener("click", refrescar);
    const bResumen = document.querySelector('#subtabsResponsabilidades [data-subtab="respResumen"]');
    if (bResumen) bResumen.addEventListener("click", refrescar);
    pintarResumen();
    // Si el panel ya está abierto al cargar este archivo (enlace directo), se leen las cifras ya.
    if (panel.classList.contains("activo")) refrescar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();

  window.EOFResponsabilidadesOrganizacion = { refrescar };
})();
