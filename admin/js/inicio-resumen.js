// ---------- Inicio: página de resumen al entrar al panel ----------
// Es lo primero que ve CUALQUIER persona del equipo (Responsable, redactor/a y fotógrafo/a) en vez de caer
// directamente en «Nueva noticia» o «Subir contenido». Reúne lo importante de un vistazo:
//   · saludo, rol, nivel y racha, con el botón de la acción principal de su rol;
//   · 4 tarjetas con cifras del mes (y su evolución frente al mes anterior);
//   · lo que requiere atención (reutiliza los avisos de avisos-entrada.js: window.EOFAvisosEntrada);
//   · gráfico de evolución de los últimos 6 meses;
//   · próximos partidos y partidos en juego;
//   · acciones rápidas, lo más leído, actividad reciente e insignias.
// Los datos salen de:
//   GET /api/me/estadisticas   (personal: totales, evolución mensual, racha, insignias, top, actividad)
//   GET /api/me/resumen-inicio (FASE 2, de toda la redacción: equipo, cola de revisión, ranking, partidos sin
//                               cubrir de tu club, progreso de nivel, fotos, noticias recientes y anuncio fijado)
//   GET /api/results?estado=…  (partidos en juego y próximos)
//   + los avisos que ya calcula avisos-entrada.js (evento «eof:avisos»).
// FASE 3A: inicio-personalizar.js (se carga ANTES que este archivo) añade, sin tocar el resto, la opción de
// ocultar/reordenar tarjetas, las metas del mes y los récords. Se comunican por eventos: este archivo emite
// «eof:inicio-montado», «eof:inicio-pintado» y «eof:inicio-visible», y expone EOFInicio.estado().
// Cada petición falla por separado: si /resumen-inicio cae, la página sigue con lo personal.
//   PUT/DELETE /api/inicio/anuncio  (solo Responsables: fijar o retirar el anuncio de Inicio)
// Depende de globales de admin.js: USER, apiFetch, eofIrASeccion, irAAjustesCuenta y, opcionalmente,
// escudoUrlAdmin, window.EOFEstadisticas.hace y window.EOFAvisosEntrada.
(function () {
  "use strict";
  if (typeof USER === "undefined" || !USER) return;
  const panel = document.getElementById("panel-inicio");
  if (!panel) return;

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => Number(n || 0).toLocaleString("es-ES");
  const REDUCIR = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const FOTO = USER.rol === "fotografo";
  const ADMIN = USER.rol === "admin";
  const REVISA_LOCAL = ADMIN || (!FOTO && typeof nivelUsuarioConectado === "function" && nivelUsuarioConectado() >= 4);
  const TTL_MS = 60 * 1000;
  const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICO = {
    doc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    ojo: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    camara: svg('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
    video: svg('<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m22 8-6 4 6 4z"/>'),
    rayo: svg('<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'),
    llama: svg('<path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4 0-7 1-10z"/>'),
    mas: svg('<path d="M12 5v14M5 12h14"/>'),
    balon: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.2l3.6 2.6-1.4 4.2h-4.4l-1.4-4.2z"/>'),
    subir: svg('<path d="M12 15.5V4M12 4 8 8M12 4l4 4"/><path d="M4.5 16v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V16"/>'),
    imagen: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
    grafico: svg('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
    ok: svg('<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>'),
    lista: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"/>'),
    escudo: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
    flecha: svg('<path d="m9 6 6 6-6 6"/>'),
    mega: svg('<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12"/>'),
    copa: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
    gente: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 15c1.8.5 2.7 2 3 5"/>'),
    lapiz: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    lupa: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    diana: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>'),
  };

  let datos = null;        // /api/me/estadisticas
  let partidos = null;     // { vivo: [], proximos: [] }
  let errorDatos = false;
  let resumen = null;      // /api/me/resumen-inicio (fase 2)
  let errorResumen = false;
  let editandoAnuncio = false;
  let cargadoEn = 0;
  let cargando = null;
  let primeraVez = true;

  // ---------- Utilidades ----------
  const hoyMadrid = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  const horaMadrid = () => Number(new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  function saludo() {
    const h = horaMadrid();
    return h < 6 ? "Buenas noches" : h < 13 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
  }
  const horaTexto = () => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const iniciales = () => { const p = String(USER.nombre || "").trim().split(/\s+/).filter(Boolean); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };
  // Avatar de la cabecera: la foto de perfil real (con su encuadre) o, si no hay o no carga, las iniciales.
  // Lee eof_user porque al guardar el perfil admin.js actualiza ahí los datos, no la constante USER.
  function pintarAvatar() {
    const el = document.getElementById("iniAvatar");
    if (!el) return;
    let u = USER;
    try { u = JSON.parse(localStorage.getItem("eof_user") || "null") || USER; } catch { /* se queda USER */ }
    const url = u && u.avatar_url ? String(u.avatar_url) : "";
    if (el.dataset.src === url) return;
    el.dataset.src = url;
    el.classList.remove("ini-avatar--foto");
    el.textContent = iniciales();
    if (!url) return;
    const img = new Image();
    img.alt = ""; img.decoding = "async"; img.referrerPolicy = "no-referrer";
    img.style.objectPosition = typeof EOF_FOCO !== "undefined" ? EOF_FOCO.texto(u.avatar_foco) : "50% 50%";
    img.addEventListener("load", () => { if (el.dataset.src === url) { el.textContent = ""; el.appendChild(img); el.classList.add("ini-avatar--foto"); } });
    img.src = url;   // si falla la carga se quedan las iniciales
  }
  const primerNombre = () => String(USER.nombre || "").trim().split(/\s+/)[0] || "compañero/a";
  const rolEtiqueta = () => (ADMIN ? "Responsable" : FOTO ? "Fotógrafo/a" : "Redactor/a");
  function fechaLarga() {
    return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  }
  const hace = (s) => (window.EOFEstadisticas && window.EOFEstadisticas.hace ? window.EOFEstadisticas.hace(s) : "");
  function visibleTab(tab, sub) {
    const b = document.querySelector(`.tabs button[data-tab="${tab}"]`);
    if (!b || getComputedStyle(b).display === "none") return false;
    if (sub) {
      const s = document.querySelector(`#panel-${tab} .subtabs button[data-subtab="${sub}"]`);
      if (s && getComputedStyle(s).display === "none") return false;
    }
    return true;
  }
  function ir(destino, extra) {
    if (typeof eofIrASeccion !== "function") return;
    eofIrASeccion(destino, new URLSearchParams(extra || {}));
  }

  // ---------- Esqueleto de la página ----------
  // `mod` = variante de tamaño definida en el CSS (graf, ins…); sin estilos en línea.
  function sk(n, mod) { return Array.from({ length: n }, () => `<div class="ini-sk ini-sk-lin${mod ? ` ini-sk-${mod}` : ""}"></div>`).join(""); }

  // Hueco con esqueleto para una tarjeta de la fase 2 que este rol SIEMPRE va a tener (vacío si no aplica).
  function hostSk(aplica, n) { return aplica ? `<section class="ini-card" aria-busy="true">${sk(n)}</section>` : ""; }
  const tarjeta = (id, titulo, cuerpo, cab) => `<section class="ini-card" aria-labelledby="${id}Tit"><div class="ini-card-cab"><h3 class="ini-card-tit" id="${id}Tit">${titulo}</h3>${cab || ""}</div>${cuerpo}</section>`;
  const tarjetaError = (id, titulo) => tarjeta(id, titulo, `<div class="ini-error">No se han podido cargar estos datos. <button type="button" class="ini-link" data-ini="recargar">Reintentar</button></div>`);
  // Antigüedad de una fecha de la base de datos (UTC, «AAAA-MM-DD HH:MM:SS»).
  function edad(f) {
    const t = Date.parse(String(f || "").replace(" ", "T") + "Z");
    if (!Number.isFinite(t)) return { txt: "", h: 0 };
    const h = Math.max(0, (Date.now() - t) / 3600000);
    return { h, txt: h < 1 ? "hace menos de 1 h" : h < 24 ? `hace ${Math.floor(h)} h` : `hace ${Math.floor(h / 24)} ${Math.floor(h / 24) === 1 ? "día" : "días"}` };
  }
  const TIPO_ETQ = { noticia: "Noticia", cronica: "Crónica", opinion: "Opinión", entrevista: "Entrevista", analisis: "Análisis", previa: "Previa", uno_por_uno: "Uno por uno", rdp_previa: "RDP previa", rdp_post: "RDP post" };
  const TIPO_PLURAL = { noticia: "Noticias", cronica: "Crónicas", opinion: "Opinión", entrevista: "Entrevistas", analisis: "Análisis", previa: "Previas", uno_por_uno: "Uno por uno", rdp_previa: "RDP previas", rdp_post: "RDP post" };

  function montar() {
    panel.innerHTML = `
      <div class="ini${primeraVez ? " ini-anima" : ""}" id="iniRaiz">
        <section class="ini-hero" aria-label="Bienvenida">
          <div class="ini-hero-texto">
            <div class="ini-hero-id">
              <span class="ini-avatar" id="iniAvatar" aria-hidden="true">${esc(iniciales())}</span>
              <div>
                <div class="ini-fecha">${esc(fechaLarga())}</div>
                <h2 class="ini-saludo">${saludo()}, <em>${esc(primerNombre())}</em></h2>
              </div>
            </div>
            <div class="ini-chips" id="iniChips"><span class="ini-chip">${esc(rolEtiqueta())}</span></div>
            <p class="ini-foco" id="iniFoco" aria-live="polite"></p>
          </div>
          <div class="ini-hero-lado">
            <div class="ini-reloj" aria-hidden="true"><b id="iniHora">${esc(horaTexto())}</b><span>hora de Madrid</span></div>
            <div class="ini-hero-acciones"></div>
            <div class="ini-pie" id="iniPie"></div>
          </div>
          <div class="ini-hero-stats" id="iniHeroStats" role="group" aria-label="Estado ahora mismo"></div>
        </section>

        <section class="ini-lanzador" aria-label="Acciones rápidas"><div class="ini-acciones" id="iniAcciones"></div></section>

        <div id="iniAnuncio"></div>

        <section class="ini-kpis" id="iniKpis" aria-label="${ADMIN ? "El mes de la redacción en cifras" : "Tu mes en cifras"}">
          ${Array.from({ length: 4 }, () => `<div class="ini-card ini-kpi" aria-hidden="true"><div class="ini-sk ini-sk-ico"></div><div class="ini-sk ini-sk-num"></div><div class="ini-sk ini-sk-etq"></div></div>`).join("")}
        </section>

        <div class="ini-grid">
          <div class="ini-col">
            ${FOTO ? "" : `<section class="ini-card" id="iniPendCard" aria-labelledby="iniPendTit">
              <div class="ini-card-cab"><h3 class="ini-card-tit" id="iniPendTit">Requiere tu atención</h3><span class="ini-card-sub" id="iniPendSub"></span></div>
              <div id="iniPend">${sk(2)}</div>
            </section>`}
            <div id="iniRevision">${hostSk(REVISA_LOCAL, 3)}</div>
            <section class="ini-card" aria-labelledby="iniEvoTit">
              <div class="ini-card-cab"><h3 class="ini-card-tit" id="iniEvoTit">${FOTO ? "Tus archivos subidos" : ADMIN ? "Publicaciones de la redacción" : "Tus publicaciones"}</h3><span class="ini-card-sub">Últimos 6 meses</span></div>
              <div id="iniEvo">${sk(1, "graf")}</div>
            </section>
            <div id="iniSinCubrir">${hostSk(!FOTO && !ADMIN, 3)}</div>
            <div id="iniSinFotos">${hostSk(FOTO, 3)}</div>
            ${FOTO ? "" : `<section class="ini-card" aria-labelledby="iniTopTit">
                <div class="ini-card-cab"><h3 class="ini-card-tit" id="iniTopTit">Lo más leído tuyo</h3></div>
                <div id="iniTop">${sk(3)}</div>
              </section>`}
              <section class="ini-card" aria-labelledby="iniActTit">
                <div class="ini-card-cab"><h3 class="ini-card-tit" id="iniActTit">Actividad reciente</h3><button type="button" class="ini-link" data-cuenta="estadisticas">Ver todo</button></div>
                <div id="iniAct">${sk(3)}</div>
              </section>
            <div id="iniFotosTop">${hostSk(FOTO, 3)}</div>
            <div id="iniRecientes">${hostSk(true, 4)}</div>
            <div id="iniAtajos"></div>
          </div>
          <div class="ini-col">
            <section class="ini-card" aria-labelledby="iniPartTit">
              <div class="ini-card-cab"><h3 class="ini-card-tit" id="iniPartTit">Partidos</h3>${visibleTab("resultados") ? '<button type="button" class="ini-link" data-ir="resultados.lista">Ver todos</button>' : ""}</div>
              <div id="iniPartidos">${sk(3)}</div>
            </section>
            <div id="iniSemana">${hostSk(true, 2)}</div>
            <div id="iniProgreso">${hostSk(!ADMIN, 1)}</div>
            <div id="iniRanking">${hostSk(!FOTO, 4)}</div>
            <div id="iniEquipo">${hostSk(ADMIN, 4)}</div>
            ${ADMIN ? "" : `<section class="ini-card" aria-labelledby="iniInsTit">
              <div class="ini-card-cab"><h3 class="ini-card-tit" id="iniInsTit">Insignias</h3><button type="button" class="ini-link" data-cuenta="progreso">Mi progreso</button></div>
              <div id="iniIns">${sk(1, "ins")}</div>
            </section>`}
            <div id="iniWeb"></div>
          </div>
        </div>
      </div>`;
    primeraVez = false;
    pintarAvatar();
    pintarAcciones();
    // Lo oye inicio-personalizar.js (envuelve las tarjetas, aplica el orden guardado y añade metas y récords).
    document.dispatchEvent(new CustomEvent("eof:inicio-montado"));
  }

  // ---------- Acciones rápidas ----------
  function pintarAcciones() {
    const el = document.getElementById("iniAcciones");
    if (!el) return;
    const base = FOTO ? [
      { ir: "contenido.subir", t: "Subir fotos", s: "Sube lo de tu partido", ico: ICO.subir, rojo: true, tab: "contenido" },
      { ir: "contenido.galeriaPartido", t: "Galería de partido", s: "Vincula fotos a un partido", ico: ICO.imagen, tab: "contenido" },
      { ir: "contenido.ver", t: "Lo que he subido", s: "Revisa tu contenido", ico: ICO.camara, tab: "contenido" },
      { cuenta: "progreso", t: "Mi progreso", s: "Nivel y criterios", ico: ICO.grafico },
    ] : [
      { ir: "noticias.nueva", t: "Nueva noticia", s: "Redacta y publica", ico: ICO.mas, rojo: true, tab: "noticias" },
      { ir: "noticias.noticiasRapidas", t: "Noticia rápida", s: "Una última hora en segundos", ico: ICO.rayo, tab: "noticias" },
      { ir: "resultados.lista", t: "Cubrir un partido", s: "Marcador y crónica", ico: ICO.balon, tab: "resultados" },
      { ir: "contenido.subir", t: "Subir contenido", s: "Fotos y vídeos", ico: ICO.subir, tab: "contenido" },
      { ir: "noticias.lista", t: "Mis noticias", s: "Revisa y edita", ico: ICO.doc, tab: "noticias" },
      ADMIN ? { ir: "analiticas", t: "Analíticas", s: "Audiencia del sitio", ico: ICO.grafico, tab: "analiticas" }
            : { cuenta: "progreso", t: "Mi progreso", s: "Nivel y criterios", ico: ICO.grafico },
    ];
    el.innerHTML = base.filter((a) => !a.tab || visibleTab(a.tab)).map((a) => `
      <button type="button" class="ini-accion${a.rojo ? " rojo" : ""}" ${a.ir ? `data-ir="${a.ir}"` : `data-cuenta="${a.cuenta}"`}>
        <span class="ini-accion-ico">${a.ico}</span><b>${esc(a.t)}</b><small>${esc(a.s)}</small>
      </button>`).join("");
  }

  // ---------- Cifras del mes ----------
  function kpisEquipo(e) {
    const ev = e.evolucion || [];
    const serie = (f) => ev.slice(-6).map((x) => Number(f(x)) || 0);
    return [
      { etq: "Publicaciones del equipo", valor: e.mes.publicaciones, previo: e.mes.publicaciones_previo, serie: serie((x) => x.publicaciones), color: "rojo", ico: ICO.doc },
      { etq: "Visitas este mes", valor: e.mes.visitas, previo: e.mes.visitas_previo, serie: serie((x) => x.visitas), color: "celeste", ico: ICO.ojo },
      { etq: `Activos en 30 días · de ${num(e.colaboradores_activos_total)}`, valor: e.activos_30d, previo: null, serie: [], color: "verde", ico: ICO.gente },
      { etq: "Nuevos colaboradores", valor: e.nuevos_mes, previo: null, serie: [], color: "violeta", ico: ICO.mas },
    ];
  }
  function kpisDefinicion(ev) {
    const m = (i) => ev[ev.length - 1 - i] || {};
    const serie = (f) => ev.slice(-6).map((x) => Number(f(x)) || 0);
    const def = FOTO ? [
      { etq: "Fotos subidas este mes", f: (x) => x.fotos, color: "rojo", ico: ICO.camara },
      { etq: "Vídeos este mes", f: (x) => x.videos, color: "violeta", ico: ICO.video },
      { etq: "Fotos en galerías", f: (x) => x.fotos_vinculadas, color: "celeste", ico: ICO.imagen },
      { etq: "Días activos este mes", f: (x) => x.dias_activos, color: "verde", ico: ICO.rayo },
    ] : [
      { etq: "Publicaciones este mes", f: (x) => x.publicaciones, color: "rojo", ico: ICO.doc },
      { etq: "Visitas este mes", f: (x) => x.visitas, color: "celeste", ico: ICO.ojo },
      { etq: "Archivos subidos", f: (x) => (x.fotos || 0) + (x.videos || 0), color: "violeta", ico: ICO.camara },
      { etq: "Días activos este mes", f: (x) => x.dias_activos, color: "verde", ico: ICO.rayo },
    ];
    return def.map((d) => ({ ...d, valor: Number(d.f(m(0))) || 0, previo: Number(d.f(m(1))) || 0, serie: serie(d.f) }));
  }
  // Variación frente al mes anterior: flecha en SVG (no glifos de texto) y texto accesible.
  const FLECHA = { sube: '<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M6 2 11 10H1z"/></svg>', baja: '<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M6 10 1 2h10z"/></svg>' };
  function delta(valor, previo) {
    if (previo === 0 && valor === 0) return `<span class="ini-delta" title="Sin cambios respecto al mes anterior">= igual</span>`;
    if (previo === 0) return `<span class="ini-delta sube" title="Mes anterior: 0">${FLECHA.sube}nuevo</span>`;
    const p = Math.round(((valor - previo) / previo) * 100);
    if (p === 0) return `<span class="ini-delta" title="Mes anterior: ${num(previo)}">= igual</span>`;
    return `<span class="ini-delta ${p > 0 ? "sube" : "baja"}" title="Mes anterior: ${num(previo)}">${p > 0 ? FLECHA.sube : FLECHA.baja}${p > 0 ? "+" : ""}${p}%<span class="ini-sr"> respecto al mes anterior</span></span>`;
  }
  function sparkline(serie, uid) {
    if (serie.length < 2) return "";
    const W = 120, H = 34, max = Math.max(...serie, 1);
    const pts = serie.map((v, i) => [(i / (serie.length - 1)) * W, H - 4 - (v / max) * (H - 10)]);
    const lin = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const area = `${lin} L${W} ${H} L0 ${H} Z`;
    const u = pts[pts.length - 1];
    return `<svg class="ini-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${area}"/><path class="l" d="${lin}"/><circle cx="${u[0].toFixed(1)}" cy="${u[1].toFixed(1)}" r="3"/></svg>`;
  }
  function animarNumero(el, hasta) {
    if (!el) return;
    if (REDUCIR() || hasta < 2) { el.textContent = num(hasta); return; }
    const t0 = performance.now(), dur = 800;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = num(Math.round(hasta * e));
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
  function pintarKpis() {
    const el = document.getElementById("iniKpis");
    if (!el) return;
    if (ADMIN && resumen && resumen.equipo) { pintarKpisLista(el, kpisEquipo(resumen.equipo)); return; }
    if (ADMIN && !resumen && !errorResumen && !errorDatos) return;
    if (errorDatos && !datos) {
      el.innerHTML = `<div class="ini-error ini-error--ancho" role="alert">No se han podido cargar tus cifras. <button type="button" class="ini-link" data-ini="recargar">Reintentar</button></div>`;
      return;
    }
    if (!datos) return;
    pintarKpisLista(el, kpisDefinicion(datos.evolucion || []));
  }
  function pintarKpisLista(el, ks) {
    el.innerHTML = ks.map((k, i) => `
      <article class="ini-card ini-kpi ini-kpi--${k.color}">
        <div class="ini-kpi-top"><span class="ini-kpi-ico">${k.ico}</span>${k.previo == null ? "" : delta(k.valor, k.previo)}</div>
        <div class="ini-kpi-valor" data-n="${k.valor}" id="iniKpiV${i}">0</div>
        <div class="ini-kpi-etq">${esc(k.etq)}</div>
        ${sparkline(k.serie, i)}
      </article>`).join("");
    ks.forEach((k, i) => animarNumero(document.getElementById(`iniKpiV${i}`), k.valor));
  }

  // ---------- Cabecera: chips de nivel y racha ----------
  function pintarChips() {
    const el = document.getElementById("iniChips");
    if (!el) return;
    const chips = [`<span class="ini-chip">${esc(rolEtiqueta())}</span>`];
    if (datos && datos.usuario && !ADMIN) chips.push(`<span class="ini-chip">${ICO.escudo}Nivel ${FOTO ? "F" : "N"}${Number(datos.usuario.nivel) || 1}</span>`);
    // La racha ya sale como cifra («Semanas de racha») en la fila de estado de la cabecera: no se repite aquí.
    el.innerHTML = chips.join("");
  }

  // ---------- Gráfico de evolución ----------
  function pintarEvolucion() {
    const el = document.getElementById("iniEvo");
    if (!el) return;
    const deEquipo = ADMIN && resumen && resumen.equipo;
    if (!datos && !deEquipo) { if (errorDatos) el.innerHTML = `<div class="ini-vacio">Sin datos por ahora.</div>`; return; }
    const ev = (deEquipo ? resumen.equipo.evolucion : datos.evolucion || []).slice(-6);
    const f = FOTO ? (x) => (x.fotos || 0) + (x.videos || 0) : (x) => x.publicaciones || 0;
    const valores = ev.map((x) => Number(f(x)) || 0);
    if (!valores.some((v) => v > 0)) {
      el.innerHTML = `<div class="ini-vacio">${FOTO ? "Aún no has subido archivos en estos meses." : deEquipo ? "Todavía no hay publicaciones en estos meses." : "Aún no has publicado en estos meses."}</div>`;
      return;
    }
    const nice = (m) => { const p = Math.pow(10, Math.floor(Math.log10(m))), f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
    const W = 600, H = 220, base = 182, top = 26, L = 36, max = nice(Math.max(...valores, 1));
    const ancho = (W - L) / ev.length, bw = Math.min(54, ancho * 0.56);
    const barras = ev.map((x, i) => {
      const v = valores[i], h = Math.max(v > 0 ? 6 : 2, (v / max) * (base - top));
      const cx = L + ancho * i + ancho / 2, actual = i === ev.length - 1;
      const [anio, mes] = String(x.mes || "").split("-");
      const etq = MES_CORTO[(Number(mes) || 1) - 1] || "";
      return `<g class="col"><title>${esc(etq)} ${esc(anio)}: ${num(v)}</title>
        <rect class="barra${actual ? " actual" : ""}" x="${(cx - bw / 2).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="8" style="animation-delay:${i * 70}ms"/>
        <text class="val" x="${cx.toFixed(1)}" y="${(base - h - 8).toFixed(1)}">${num(v)}</text>
        <text class="mes" x="${cx.toFixed(1)}" y="${base + 22}">${etq}</text></g>`;
    }).join("");
    const marcas = max >= 2 ? [0, 0.5, 1] : [0, 1];
    const lineas = marcas.map((p) => { const y = base - p * (base - top); return `<line class="eje" x1="${L}" x2="${W}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="tick" x="${L - 8}" y="${(y + 3.5).toFixed(1)}">${num(Math.round(p * max))}</text>`; }).join("");
    const descr = ev.map((x, i) => `${MES_CORTO[(Number(String(x.mes || "").split("-")[1]) || 1) - 1] || ""} ${valores[i]}`).join(", ");
    const total = valores.reduce((s, v) => s + v, 0);
    el.innerHTML = `<div class="ini-chart-wrap"><svg class="ini-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de los últimos ${ev.length} meses: ${esc(descr)}">
      ${lineas}${barras}</svg></div>
      <div class="ini-leyenda"><span><i class="act"></i>Este mes</span><span><i></i>Meses anteriores</span><span>Total del periodo: <b>${num(total)}</b></span></div>`;
  }

  // ---------- Pendientes (los calcula avisos-entrada.js) ----------
  // «Noticias en revisión» ya lo muestra la tarjeta «Cola de revisión» (con su urgencia): no se repite aquí.
  const hayCola = () => !!(REVISA_LOCAL && resumen && resumen.revision && resumen.revision.total > 0);
  function itemsAvisos() {
    const api = window.EOFAvisosEntrada;
    const todos = api && api.listo() ? api.items() : [];
    return REVISA_LOCAL && resumen && resumen.revision ? todos.filter((f) => f.id !== "revision") : todos;
  }
  function pintarPendientes() {
    const el = document.getElementById("iniPend");
    if (!el) return;
    const api = window.EOFAvisosEntrada;
    const sub = document.getElementById("iniPendSub");
    if (!api) { el.innerHTML = `<div class="ini-todo-ok">${ICO.ok}<div><b>Todo en orden</b><span>No hay nada pendiente por aquí.</span></div></div>`; return; }
    if (!api.listo()) { el.innerHTML = sk(2); api.pedir(); return; }
    const items = itemsAvisos();
    const urg = items.reduce((s, f) => s + f.urgente, 0);
    const tarjetaPend = document.getElementById("iniPendCard");
    if (tarjetaPend) { tarjetaPend.classList.toggle("ini-card-urg", urg > 0); tarjetaPend.classList.toggle("ini-card-ok", !items.length); }
    if (sub) {
      sub.className = "ini-card-sub" + (items.length ? (urg ? " ini-pill ini-pill-urg" : " ini-pill") : "");
      sub.textContent = items.length ? (urg ? `${urg} ${urg === 1 ? "urgente" : "urgentes"}` : `${items.length} ${items.length === 1 ? "tipo de aviso" : "tipos de aviso"}`) : "";
    }
    if (!items.length) { el.innerHTML = `<div class="ini-todo-ok">${ICO.ok}<div><b>Todo al día</b><span>${hayCola() ? "Salvo la cola de revisión, no hay nada más pendiente." : "No hay avisos pendientes."}</span></div></div>`; return; }
    el.innerHTML = `<ul class="ini-pend">${items.map((f) => `
      <li><button type="button" class="${f.urgente ? "urg" : ""}" data-aviso="${esc(f.id)}">
        <span class="ini-pend-ico">${f.ico}</span>
        <span class="ini-pend-txt"><b>${esc(f.titulo)}</b><small>${esc(f.detalle || f.sub || "")}</small></span>
        <span class="ini-pend-n">${f.n}</span>
      </button></li>`).join("")}</ul>`;
  }

  // ---------- Partidos ----------
  function etiquetaDia(f) {
    const d = String(f || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
    const hoy = hoyMadrid();
    if (d === hoy) return "Hoy";
    const man = new Date(Date.parse(`${hoy}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
    if (d === man) return "Mañana";
    const [a, m, dd] = d.split("-").map(Number);
    return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(new Date(a, m - 1, dd));
  }
  const horaDe = (f) => { const m = String(f || "").match(/T(\d{2}:\d{2})/); return m ? m[1] : "—"; };
  const escudo = (nombre, url) => (typeof escudoUrlAdmin === "function" ? escudoUrlAdmin(nombre, url) : (url || ""));

  async function cargarPartidos() {
    const hoy = hoyMadrid();
    const [vivo, prog] = await Promise.all([
      apiFetch("/api/results?estado=en_juego&limit=10").catch(() => null),
      apiFetch("/api/results?estado=programado&orden=cercania&limit=60").catch(() => null),
    ]);
    if (!vivo && !prog) { partidos = { error: true, vivo: [], proximos: [] }; return; }
    const futuros = ((prog && prog.results) || [])
      .filter((r) => String(r.fecha_partido || "").slice(0, 10) >= hoy)
      .sort((a, b) => String(a.fecha_partido || "9").localeCompare(String(b.fecha_partido || "9")));
    const proximos = futuros.slice(0, 5);
    partidos = { error: false, vivo: ((vivo && vivo.results) || []).slice(0, 5), proximos, semana: futuros };
  }
  function pintarPartidos() {
    const el = document.getElementById("iniPartidos");
    if (!el) return;
    if (!partidos) return;
    if (partidos.error) { el.innerHTML = `<div class="ini-vacio">No se han podido cargar los partidos.</div>`; return; }
    const fila = (r, vivo) => `
      <li><button type="button" class="ini-fila" data-ir="resultados.lista" title="Abrir en Resultados">
        <span class="ini-partido-eq">
          <span class="ini-eq"><img src="${esc(escudo(r.equipo_local, r.escudo_local_url))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span>${esc(r.equipo_local)}</span></span>
          <span class="ini-eq"><img src="${esc(escudo(r.equipo_visitante, r.escudo_visitante_url))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span>${esc(r.equipo_visitante)}</span></span>
        </span>
        <span class="ini-partido-meta">${vivo
          ? `<span class="ini-vivo"><i></i>EN VIVO</span><span class="ini-marc">${Number(r.goles_local) || 0} - ${Number(r.goles_visitante) || 0}</span>`
          : `<span class="ini-hora">${esc(horaDe(r.fecha_partido))}</span><span class="ini-dia">${esc(etiquetaDia(r.fecha_partido))}</span>`}</span>
      </button></li>`;
    const filas = partidos.vivo.map((r) => fila(r, true)).join("") + partidos.proximos.map((r) => fila(r, false)).join("");
    el.innerHTML = filas ? `<ul class="ini-lista">${filas}</ul>` : `<div class="ini-vacio">No hay partidos en juego ni programados próximamente.</div>`;
  }


  // ---------- Cabecera viva: «foco ahora» y cifras clicables ----------
  function pintarHero() {
    const foco = document.getElementById("iniFoco"), stats = document.getElementById("iniHeroStats");
    if (!foco || !stats) return;
    const api = window.EOFAvisosEntrada;
    const sabePend = !!(api && api.listo());
    const pend = (sabePend ? itemsAvisos() : []).reduce((t, f) => t + f.n, 0);
    const hoy = hoyMadrid();
    const vivo = partidos && !partidos.error ? partidos.vivo.length : 0;
    const hoyN = partidos && !partidos.error ? (partidos.semana || []).filter((r) => String(r.fecha_partido || "").slice(0, 10) === hoy).length : 0;
    const racha = datos && datos.racha ? Number(datos.racha.actual) || 0 : 0;
    const pl = (n, a, b) => `${n} ${n === 1 ? a : b}`;
    // Los pendientes NO se repiten aquí: viven solo en la tarjeta «Requiere tu atención».
    let txt = "";
    if (vivo) txt = `${ICO.balon}<span><b>Hay ${pl(vivo, "partido", "partidos")} en juego.</b> Comprueba que alguien lo esté cubriendo.</span>`;
    else if (!sabePend && !FOTO && !hoyN) txt = `${ICO.lista}<span>Comprobando tus avisos…</span>`;
    else if (hoyN) txt = `${ICO.balon}<span><b>Hoy hay ${pl(hoyN, "partido programado", "partidos programados")}.</b></span>`;
    else if (racha > 1) txt = `${ICO.llama}<span><b>${racha} semanas de racha.</b> Publica algo esta semana y la mantienes.</span>`;
    else if (!pend && !hayCola()) txt = `${ICO.ok}<span><b>Todo al día.</b> No hay avisos pendientes.</span>`;
    foco.className = "ini-foco";
    foco.innerHTML = txt;
    const t = (cls, ico, n, etq, attr) => `<button type="button" class="ini-hs ${cls}" ${attr}><span class="ini-hs-ico">${ico}</span><b>${n}</b><span class="ini-hs-etq">${etq}</span></button>`;
    stats.innerHTML = [
      t(vivo ? "vivo" : "", ICO.balon, vivo, "En juego", 'data-ir="resultados.lista"'),
      t("", ICO.diana, hoyN, hoyN === 1 ? "Partido hoy" : "Partidos hoy", 'data-ir="resultados.lista"'),
      t(racha > 0 ? "racha" : "", ICO.llama, racha, "Semanas de racha", 'data-cuenta="progreso"'),
    ].join("");
  }
  let filtroAtajos = "";
  function filtrarAtajos() {
    const q = filtroAtajos.trim().toLowerCase();
    let n = 0;
    document.querySelectorAll("#iniAtajos .ini-atajo").forEach((b) => { const ok = !q || b.textContent.toLowerCase().includes(q); b.hidden = !ok; if (ok) n++; });
    const v = document.getElementById("iniAtajosVacio");
    if (v) v.hidden = n > 0;
  }

  // ---------- Esta semana: los próximos 7 días de un vistazo ----------
  function pintarSemana() {
    const el = document.getElementById("iniSemana");
    if (!el || !partidos) return;
    if (partidos.error) { el.innerHTML = ""; return; }
    const hoy = hoyMadrid();
    const base = Date.parse(`${hoy}T12:00:00Z`);
    const dias = Array.from({ length: 7 }, (_, i) => new Date(base + i * 86400000).toISOString().slice(0, 10));
    const porDia = {};
    for (const r of partidos.semana || []) { const d = String(r.fecha_partido || "").slice(0, 10); if (dias.includes(d)) porDia[d] = (porDia[d] || 0) + 1; }
    const total = dias.reduce((t, d) => t + (porDia[d] || 0), 0);
    const nombre = (d) => new Intl.DateTimeFormat("es-ES", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)).replace(".", "");
    const celdas = dias.map((d) => `<button type="button" class="ini-dia-cel${d === hoy ? " hoy" : ""}${porDia[d] ? " con" : ""}" data-ir="resultados.lista" aria-label="${esc(etiquetaDia(d) || d)}: ${porDia[d] || 0} partidos">
        <span class="ini-dia-n">${esc(nombre(d))}</span><b>${Number(d.slice(8))}</b><span class="ini-dia-c">${porDia[d] || "·"}</span></button>`).join("");
    el.innerHTML = tarjeta("iniSem", "Esta semana", `<div class="ini-semana">${celdas}</div>
      <div class="ini-card-sub ini-semana-pie">${total ? `<b>${total}</b> ${total === 1 ? "partido programado" : "partidos programados"} en los próximos 7 días` : "No hay partidos programados en los próximos 7 días."}</div>`,
      visibleTab("resultados") ? `<button type="button" class="ini-link" data-ir="resultados.lista">Ver partidos</button>` : "");
  }

  // ---------- Ir a…: atajo a cada sección del panel que esta persona puede ver ----------
  function pintarAtajos() {
    const el = document.getElementById("iniAtajos");
    if (!el) return;
    const botones = [...document.querySelectorAll(".tabs button[data-tab]")].filter((b) => b.dataset.tab !== "inicio" && getComputedStyle(b).display !== "none");
    if (!botones.length) { el.innerHTML = ""; return; }
    const items = botones.map((b) => {
      const ico = b.querySelector("svg");
      const c = b.cloneNode(true);
      c.querySelectorAll("svg, [class*='badge']").forEach((n) => n.remove());
      const txt = (c.textContent || "").replace(/\s+/g, " ").trim();
      return `<button type="button" class="ini-atajo" data-tab-ir="${esc(b.dataset.tab)}"><span class="ini-atajo-ico">${ico ? ico.outerHTML : ICO.flecha}</span><span>${esc(txt)}</span></button>`;
    }).join("");
    const buscar = botones.length > 6 ? `<label class="ini-buscar"><span class="ini-sr">Buscar sección</span>${ICO.lupa}<input type="search" id="iniBuscar" placeholder="Buscar sección…" autocomplete="off" value="${esc(filtroAtajos)}"></label>` : "";
    el.innerHTML = tarjeta("iniAtj", "Ir a…", `${buscar}<div class="ini-atajos">${items}</div><p class="ini-vacio" id="iniAtajosVacio" hidden>Ninguna sección coincide.</p>`, `<span class="ini-card-sub">${botones.length} secciones</span>`);
    filtrarAtajos();
  }

  // ---------- La web pública ----------
  function pintarWeb() {
    const el = document.getElementById("iniWeb");
    if (!el) return;
    const enlaces = [
      { h: "/index.html", t: "Portada", s: "Cómo la ve el lector", ico: ICO.ojo },
      { h: "/noticias-rapidas.html", t: "Noticias rápidas", s: "Lo último, al momento", ico: ICO.rayo },
      { h: "/calendario.html", t: "Calendario", s: "Jornadas y partidos", ico: ICO.balon },
      { h: "/clasificacion.html", t: "Clasificación", s: "Tablas por categoría", ico: ICO.copa },
    ];
    el.innerHTML = tarjeta("iniWebT", "La web pública", `<ul class="ini-lista">${enlaces.map((e) => `
      <li><a class="ini-fila" href="${e.h}" target="_blank" rel="noopener"><span class="ini-web-ico">${e.ico}</span><span class="ini-top-txt"><b>${esc(e.t)}</b><small>${esc(e.s)}</small></span><span class="ini-fila-flecha">${ICO.flecha}</span></a></li>`).join("")}</ul>`);
  }

  // ---------- FASE 2: tarjetas con datos de la redacción ----------
  // Anuncio fijado: lo ve todo el equipo; solo el Responsable lo escribe, edita o retira.
  function pintarAnuncio() {
    const el = document.getElementById("iniAnuncio");
    if (!el) return;
    const a = resumen && resumen.anuncio;
    if (ADMIN && editandoAnuncio) {
      el.innerHTML = `<section class="ini-anuncio ini-anuncio-edit" aria-label="Editar anuncio fijado">
        <div class="ini-anuncio-ico">${ICO.mega}</div>
        <div class="ini-anuncio-form">
          <label>Título (opcional)<input type="text" id="iniAnTitulo" maxlength="80" value="${esc(a ? a.titulo : "")}" placeholder="Ej.: Reunión de la redacción"></label>
          <label>Mensaje para todo el equipo<textarea id="iniAnTexto" maxlength="400" rows="3" placeholder="Escribe aquí el anuncio…">${esc(a ? a.texto : "")}</textarea></label>
          <label>Se oculta solo después del (opcional)<input type="date" id="iniAnCaduca" value="${esc(a && a.caduca ? a.caduca : "")}"></label>
          <div class="ini-anuncio-btns">
            <button type="button" class="ini-btn ini-btn-prim" data-ini="anuncio-guardar">Publicar</button>
            ${a ? `<button type="button" class="ini-btn ini-btn-ghost" data-ini="anuncio-retirar">Retirar</button>` : ""}
            <button type="button" class="ini-btn ini-btn-ghost" data-ini="anuncio-cancelar">Cancelar</button>
          </div>
          <div class="ini-anuncio-msg" id="iniAnMsg" role="status"></div>
        </div></section>`;
      return;
    }
    if (a) {
      el.innerHTML = `<section class="ini-anuncio" aria-label="Anuncio fijado">
        <div class="ini-anuncio-ico">${ICO.mega}</div>
        <div class="ini-anuncio-txt">${a.titulo ? `<b>${esc(a.titulo)}</b>` : ""}<p>${esc(a.texto)}</p>
          <small>${a.autor ? `Fijado por ${esc(a.autor)}` : "Anuncio fijado"}${a.caduca ? ` · hasta el ${esc(a.caduca.split("-").reverse().join("/"))}` : ""}</small></div>
        ${ADMIN ? `<button type="button" class="ini-link" data-ini="anuncio-editar">Editar</button>` : ""}
      </section>`;
    } else if (ADMIN && resumen) {
      el.innerHTML = `<button type="button" class="ini-anuncio-vacio" data-ini="anuncio-editar">${ICO.mega}<span><b>Fijar un anuncio para el equipo</b><small>Lo verán todos al entrar al panel.</small></span></button>`;
    } else el.innerHTML = "";
  }
  async function guardarAnuncio() {
    const msg = document.getElementById("iniAnMsg");
    const texto = (document.getElementById("iniAnTexto") || {}).value || "";
    if (!texto.trim()) { if (msg) msg.textContent = "Escribe el mensaje del anuncio (o pulsa Retirar)."; return; }
    try {
      const r = await apiFetch("/api/inicio/anuncio", { method: "PUT", body: JSON.stringify({
        titulo: (document.getElementById("iniAnTitulo") || {}).value || "", texto,
        caduca: (document.getElementById("iniAnCaduca") || {}).value || null,
      }) });
      if (resumen) resumen.anuncio = r && r.anuncio ? r.anuncio : null;
      editandoAnuncio = false; pintarAnuncio();
    } catch (e) { if (msg) msg.textContent = (e && e.message) || "No se ha podido guardar el anuncio."; }
  }
  async function retirarAnuncio() {
    try {
      await apiFetch("/api/inicio/anuncio", { method: "DELETE" });
      if (resumen) resumen.anuncio = null;
      editandoAnuncio = false; pintarAnuncio();
    } catch (e) { const msg = document.getElementById("iniAnMsg"); if (msg) msg.textContent = (e && e.message) || "No se ha podido retirar el anuncio."; }
  }

  // Cola de revisión (Responsable y Nivel 4): las noticias terminadas, la más antigua primero.
  function pintarRevision() {
    const el = document.getElementById("iniRevision");
    if (!el || !REVISA_LOCAL) return;
    if (errorResumen && !resumen) { el.innerHTML = tarjetaError("iniRev", "Cola de revisión"); return; }
    const r = resumen && resumen.revision;
    if (!resumen) return;
    if (!r) { el.innerHTML = ""; return; }
    const api = window.EOFAvisosEntrada;
    const av = api && api.listo() ? api.items().find((f) => f.id === "revision") : null;
    const cuerpo = r.total
      ? `<ul class="ini-lista">${r.items.map((a) => { const e = edad(a.desde); return `
          <li><button type="button" class="ini-fila" data-articulo="${a.id}" title="Abrir para revisar">
            <span class="ini-rev-edad${e.h >= 48 ? " vieja" : e.h >= 24 ? " media" : ""}">${esc(e.txt)}</span>
            <span class="ini-top-txt"><b>${esc(a.titulo || "Sin título")}</b><small>${esc(TIPO_ETQ[a.tipo] || a.tipo)}${a.autor ? ` · ${esc(a.autor)}` : ""}</small></span>
            <span class="ini-fila-flecha">${ICO.flecha}</span>
          </button></li>`; }).join("")}</ul>${r.total > r.items.length ? `<div class="ini-card-sub ini-card-sub--pie">y ${r.total - r.items.length} más en la lista de Noticias.</div>` : ""}`
      : `<div class="ini-todo-ok">${ICO.ok}<div><b>Cola vacía</b><span>No hay noticias esperando revisión.</span></div></div>`;
    el.innerHTML = tarjeta("iniRev", "Cola de revisión", cuerpo,
      r.total ? (av && av.urgente ? `<span class="ini-pill ini-pill-urg">${esc(av.sub)}</span>` : `<span class="ini-card-sub">${r.total} ${r.total === 1 ? "noticia" : "noticias"}${r.mas_antigua ? ` · la más antigua ${esc(edad(r.mas_antigua).txt)}` : ""}</span>`) : "");
  }

  // Partidos del club de la persona que nadie está cubriendo.
  function motivoPartido(m) {
    if (m === "en_juego_sin_responsable") return `<span class="ini-vivo"><i></i>EN VIVO</span><span class="ini-dia">sin responsable</span>`;
    if (m === "cerrado_sin_confirmar") return `<span class="ini-etq-aviso">Cerrado solo</span><span class="ini-dia">confirma el marcador</span>`;
    return "";
  }
  function filaPartido(r, extra, destino) {
    return `<li><button type="button" class="ini-fila" data-ir="${destino}">
      <span class="ini-partido-eq">
        <span class="ini-eq"><img src="${esc(escudo(r.local, r.escudo_local))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span>${esc(r.local)}</span></span>
        <span class="ini-eq"><img src="${esc(escudo(r.visitante, r.escudo_visitante))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span>${esc(r.visitante)}</span></span>
      </span>
      <span class="ini-partido-meta">${extra}</span></button></li>`;
  }
  function pintarSinCubrir() {
    const el = document.getElementById("iniSinCubrir");
    if (!el || FOTO || ADMIN) return;
    if (errorResumen && !resumen) { el.innerHTML = tarjetaError("iniSc", "Partidos sin cubrir de tu club"); return; }
    if (!resumen) return;
    const sc = resumen.sin_cubrir;
    if (!sc) { el.innerHTML = ""; return; }
    if (!sc.equipos.length) { el.innerHTML = tarjeta("iniSc", "Partidos sin cubrir", `<div class="ini-vacio">No tienes un club asignado. Un Responsable puede asignártelo desde Usuarios.</div>`); return; }
    const cuerpo = sc.items.length
      ? `<ul class="ini-lista">${sc.items.map((r) => filaPartido(r, motivoPartido(r.motivo) || `<span class="ini-hora">${esc(horaDe(r.fecha))}</span><span class="ini-dia">${esc(etiquetaDia(r.fecha))}</span>`, "resultados.lista")).join("")}</ul>`
      : `<div class="ini-todo-ok">${ICO.ok}<div><b>Todo cubierto</b><span>${esc(sc.equipos.join(" · "))} no tiene partidos pendientes de cubrir.</span></div></div>`;
    el.innerHTML = tarjeta("iniSc", "Partidos sin cubrir de tu club", cuerpo,
      sc.total ? `<button type="button" class="ini-link" data-aviso="sincubrir">${sc.total > sc.items.length ? `Ver los ${sc.total}` : "Ver en Resultados"}</button>` : `<span class="ini-card-sub">${esc(sc.equipos.join(" · "))}</span>`);
  }

  // Fotógrafos: partidos recientes sin fotos y sus partidos más vistos.
  function pintarSinFotos() {
    const el = document.getElementById("iniSinFotos");
    if (!el || !FOTO) return;
    if (errorResumen && !resumen) { el.innerHTML = tarjetaError("iniSf", "Partidos donde faltan fotos"); return; }
    if (!resumen) return;
    const sf = resumen.partidos_sin_fotos;
    if (!sf) { el.innerHTML = ""; return; }
    const cuerpo = sf.items.length
      ? `<ul class="ini-lista">${sf.items.map((r) => filaPartido(r, `<span class="ini-etq-aviso">Sin fotos</span><span class="ini-dia">${esc(etiquetaDia(r.fecha))}</span>`, "contenido.galeriaPartido")).join("")}</ul>`
      : `<div class="ini-todo-ok">${ICO.ok}<div><b>Galerías al día</b><span>${sf.solo_club ? "Los partidos recientes de tu club ya tienen fotos." : "Los partidos recientes ya tienen fotos."}</span></div></div>`;
    el.innerHTML = tarjeta("iniSf", "Partidos donde faltan fotos", cuerpo,
      `<span class="ini-card-sub">${sf.solo_club ? esc(sf.equipos.join(" · ")) : "Toda la redacción"} · últimos 14 días</span>`);
  }
  function pintarFotosTop() {
    const el = document.getElementById("iniFotosTop");
    if (!el || !FOTO) return;
    if (errorResumen && !resumen) { el.innerHTML = tarjetaError("iniFt", "Tus partidos más vistos"); return; }
    if (!resumen) return;
    const ft = resumen.fotos_top;
    if (!ft) { el.innerHTML = ""; return; }
    const cuerpo = ft.length
      ? `<ul class="ini-lista">${ft.map((r, i) => `<li><button type="button" class="ini-fila" data-ir="contenido.galeriaPartido">
          <span class="ini-rank">${i + 1}</span>
          <span class="ini-top-txt"><b>${esc(r.local)} - ${esc(r.visitante)}</b><small>${num(r.fotos)} ${r.fotos === 1 ? "foto tuya" : "fotos tuyas"} · ${esc(etiquetaDia(r.fecha))}</small></span>
          <span class="ini-top-n">${num(r.visitas)}<small>visitas</small></span></button></li>`).join("")}</ul>`
      : `<div class="ini-vacio">Aquí aparecerán los partidos con más visitas cuando vincules fotos.</div>`;
    el.innerHTML = tarjeta("iniFt", "Tus partidos más vistos", cuerpo, `<span class="ini-card-sub">Visitas del partido</span>`);
  }

  // Ranking del mes (redactores y Responsable).
  function pintarRanking() {
    const el = document.getElementById("iniRanking");
    if (!el || FOTO) return;
    if (errorResumen && !resumen) { el.innerHTML = tarjetaError("iniRk", "Ranking del mes"); return; }
    if (!resumen) return;
    const rk = resumen.ranking;
    if (!rk) { el.innerHTML = ""; return; }
    const sub = `<span class="ini-card-sub">${rk.participantes} ${rk.participantes === 1 ? "redactor/a" : "redactores"} · ${num(rk.total_publicaciones)} publicaciones</span>`;
    if (!rk.top.length) { el.innerHTML = tarjeta("iniRk", "Ranking del mes", `<div class="ini-vacio">Aún no hay publicaciones este mes.</div>`, sub); return; }
    const max = Math.max(...rk.top.map((x) => x.publicaciones), 1);
    const filas = rk.top.map((x) => `<li><div class="ini-fila est ini-rk${x.yo ? " yo" : ""}">
        <span class="ini-rank">${x.pos}</span>
        <span class="ini-rk-cuerpo"><b>${esc(x.nombre)}${x.yo ? " (tú)" : ""}</b><span class="ini-rk-barra"><i style="width:${Math.max(6, Math.round((x.publicaciones / max) * 100))}%"></i></span></span>
        <span class="ini-top-n">${num(x.publicaciones)}</span></div></li>`).join("");
    const fuera = rk.yo && !rk.top.some((x) => x.yo)
      ? `<li><div class="ini-fila est ini-rk yo ini-rk-fuera"><span class="ini-rank">${rk.yo.pos}</span><span class="ini-rk-cuerpo"><b>Tú</b></span><span class="ini-top-n">${num(rk.yo.publicaciones)}</span></div></li>` : "";
    const pie = !rk.yo && !ADMIN ? `<div class="ini-card-sub ini-card-sub--pie">Aún no has publicado este mes.</div>` : "";
    el.innerHTML = tarjeta("iniRk", "Ranking del mes", `<ul class="ini-lista">${filas}${fuera}</ul>${pie}`, sub);
  }

  // Progreso hacia el siguiente nivel.
  function pintarProgreso() {
    const el = document.getElementById("iniProgreso");
    if (!el || ADMIN) return;
    if (errorResumen && !resumen) { el.innerHTML = tarjetaError("iniPr", "Tu nivel"); return; }
    if (!resumen) return;
    const p = resumen.progreso_nivel;
    if (!p) { el.innerHTML = ""; return; }
    const prefijo = FOTO ? "F" : "N";
    const enlace = `<button type="button" class="ini-link" data-cuenta="progreso">Mi progreso</button>`;
    if (p.maximo) { el.innerHTML = tarjeta("iniPr", "Tu nivel", `<div class="ini-todo-ok">${ICO.copa}<div><b>${esc(p.emoji)} ${esc(p.nombre)}</b><span>Has alcanzado el nivel máximo.</span></div></div>`, enlace); return; }
    if (p.pct == null) { el.innerHTML = tarjeta("iniPr", "Tu nivel", `<div class="ini-nivel"><span class="ini-nivel-ico">${ICO.diana}</span><div><b>${esc(p.emoji)} ${esc(p.nombre)}</b><small>${p.siguiente_nombre ? `Siguiente: ${prefijo}${p.siguiente} · ${esc(p.siguiente_nombre)}` : ""}</small></div></div><div class="ini-card-sub ini-card-sub--pie">En fotografía el ascenso lo decide el equipo según tus criterios.</div>`, enlace); return; }
    el.innerHTML = tarjeta("iniPr", "Tu nivel", `
      <div class="ini-nivel"><span class="ini-nivel-ico">${ICO.diana}</span><div><b>${esc(p.emoji)} ${esc(p.nombre)} → ${esc(p.siguiente_nombre || "")}</b><small>${p.cumple ? "Cumples los requisitos: un Responsable puede evaluarte." : `Vas al ${p.pct} % del camino a ${prefijo}${p.siguiente}`}</small></div></div>
      <div class="ini-barra ini-barra--sep" role="progressbar" aria-label="Progreso hacia el siguiente nivel" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}"><i style="width:${REDUCIR() ? p.pct : 0}%" data-w="${p.pct}"></i></div>
      <div class="ini-reqs">${p.requisitos.map((r) => `<span class="ini-req${r.cumple ? " ok" : ""}">${esc(TIPO_PLURAL[r.tipo] || r.tipo)} <b>${Math.min(r.actual, r.necesarios)}/${r.necesarios}</b></span>`).join("")}</div>`, enlace);
    requestAnimationFrame(() => requestAnimationFrame(() => { const b = el.querySelector(".ini-barra i"); if (b) b.style.width = b.dataset.w + "%"; }));
  }

  // Responsable: quién ha estado activo y quién se ha unido.
  function pintarEquipo() {
    const el = document.getElementById("iniEquipo");
    if (!el || !ADMIN) return;
    if (errorResumen && !resumen) { el.innerHTML = tarjetaError("iniEq", "El equipo"); return; }
    if (!resumen) return;
    const e = resumen.equipo;
    if (!e) { el.innerHTML = ""; return; }
    const rolEtq = { admin: "Responsable", redactor: "Redactor/a", fotografo: "Fotógrafo/a" };
    const activos = e.activos_recientes.length
      ? `<ul class="ini-lista">${e.activos_recientes.map((u) => `<li><div class="ini-fila est"><span class="ini-act-punto"></span><span class="ini-top-txt"><b>${esc(u.nombre)}</b><small>${esc(rolEtq[u.rol] || u.rol)}</small></span><span class="ini-act-t">${esc(hace(u.ultima))}</span></div></li>`).join("")}</ul>`
      : `<div class="ini-vacio">Nadie ha usado el panel en los últimos 30 días.</div>`;
    const nuevos = e.nuevos.length
      ? `<div class="ini-sub-tit">Nuevos este mes</div><div class="ini-chips-fila">${e.nuevos.map((u) => `<span class="ini-chip-btn est">${esc(u.nombre)}<small>${esc(rolEtq[u.rol] || u.rol)}</small></span>`).join("")}</div>` : "";
    el.innerHTML = tarjeta("iniEq", "El equipo", `${activos}${nuevos}`,
      `${visibleTab("usuarios") ? `<button type="button" class="ini-link" data-ir="usuarios">Ver usuarios</button>` : ""}`);
  }

  // Últimas noticias publicadas por la redacción (todos).
  function pintarRecientes() {
    const el = document.getElementById("iniRecientes");
    if (!el) return;
    if (errorResumen && !resumen) { el.innerHTML = tarjetaError("iniRc", "Últimas noticias de la redacción"); return; }
    if (!resumen) return;
    const lista = resumen.noticias_recientes || [];
    const cuerpo = lista.length
      ? `<ul class="ini-lista">${lista.map((a) => {
          const dentro = `<span class="ini-top-txt"><b>${esc(a.titulo || "Sin título")}</b><small>${esc(TIPO_ETQ[a.tipo] || a.tipo)}${a.autor ? ` · ${esc(a.autor)}` : ""} · ${esc(edad(a.fecha).txt)}</small></span><span class="ini-top-n">${num(a.visitas)}<small>visitas</small></span>`;
          return REVISA_LOCAL
            ? `<li><button type="button" class="ini-fila" data-articulo="${a.id}">${dentro}</button></li>`
            : `<li><div class="ini-fila est">${dentro}</div></li>`; }).join("")}</ul>`
      : `<div class="ini-vacio">Todavía no hay noticias publicadas.</div>`;
    el.innerHTML = tarjeta("iniRc", "Últimas noticias de la redacción", cuerpo);
  }

  // ---------- Lo más leído, actividad e insignias ----------
  function pintarTop() {
    const el = document.getElementById("iniTop");
    if (!el || !datos) return;
    const top = (datos.top_articulos || []).slice(0, 4);
    if (!top.length) { el.innerHTML = `<div class="ini-vacio">Cuando tus noticias reciban visitas, las más leídas aparecerán aquí.</div>`; return; }
    el.innerHTML = `<ul class="ini-lista">${top.map((a, i) => `
      <li><button type="button" class="ini-fila" data-articulo="${a.id}">
        <span class="ini-rank">${i + 1}</span>
        <span class="ini-top-txt"><b>${esc(a.titulo || "Sin título")}</b><small>${esc(a.fecha || "")}</small></span>
        <span class="ini-top-n">${num(a.visitas)}<small>visitas</small></span>
      </button></li>`).join("")}</ul>`;
  }
  function pintarActividad() {
    const el = document.getElementById("iniAct");
    if (!el || !datos) return;
    const act = (datos.actividad_reciente || []).slice(0, 5);
    if (!act.length) { el.innerHTML = `<div class="ini-vacio">Tu actividad reciente aparecerá aquí.</div>`; return; }
    el.innerHTML = `<ul class="ini-lista">${act.map((a) => `
      <li><div class="ini-fila est"><span class="ini-act-punto"></span><span class="ini-act-txt">${esc(a.descripcion || a.accion)}</span><span class="ini-act-t">${esc(hace(a.fecha))}</span></div></li>`).join("")}</ul>`;
  }
  function pintarInsignias() {
    const el = document.getElementById("iniIns");
    if (!el || !datos) return;
    const ins = datos.insignias;
    if (!Array.isArray(ins) || !ins.length) { el.innerHTML = `<div class="ini-vacio">Las insignias se desbloquean al cumplir hitos.</div>`; return; }
    const ok = ins.filter((i) => i.conseguida).length;
    const pct = Math.round((ok / ins.length) * 100);
    const orden = [...ins].sort((a, b) => Number(b.conseguida) - Number(a.conseguida)).slice(0, 6);
    el.innerHTML = `<div class="ini-card-sub ini-card-sub--cab"><b>${ok}</b> de ${ins.length} conseguidas</div>
      <div class="ini-barra" role="progressbar" aria-label="Insignias conseguidas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${REDUCIR() ? pct : 0}%" data-w="${pct}"></i></div>
      <div class="ini-insignias">${orden.map((i) => `<span class="ini-ins${i.conseguida ? "" : " off"}" title="${esc(i.nombre)}"><span>${esc(i.emoji || "🏅")}</span>${esc(i.nombre)}</span>`).join("")}</div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => { const b = el.querySelector(".ini-barra i"); if (b) b.style.width = b.dataset.w + "%"; }));
  }
  function pintarPie() {
    const el = document.getElementById("iniPie");
    if (!el || !cargadoEn) return;
    const h = new Date(cargadoEn).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    el.innerHTML = `<span>Actualizado a las ${h}</span><button type="button" class="ini-link ini-link-claro" data-ini="recargar" aria-label="Actualizar el resumen">Actualizar</button>`;
  }
  function pintarTodo() {
    pintarChips(); pintarKpis(); pintarEvolucion(); pintarPendientes(); pintarPartidos(); pintarSemana(); pintarAtajos(); pintarWeb(); pintarHero();
    pintarTop(); pintarActividad(); pintarInsignias(); pintarPie();
    pintarAnuncio(); pintarRevision(); pintarSinCubrir(); pintarSinFotos(); pintarFotosTop();
    pintarRanking(); pintarProgreso(); pintarEquipo(); pintarRecientes();
    document.dispatchEvent(new CustomEvent("eof:inicio-pintado"));
  }

  // ---------- Carga ----------
  async function cargar() {
    if (cargando) return cargando;
    cargando = (async () => {
      errorDatos = false; errorResumen = false;
      const pEst = apiFetch("/api/me/estadisticas").then((d) => { datos = d; }).catch(() => { errorDatos = true; });
      const pRes = apiFetch("/api/me/resumen-inicio").then((d) => { resumen = d; }).catch(() => { errorResumen = true; });
      const pPart = cargarPartidos().catch(() => { partidos = { error: true, vivo: [], proximos: [] }; });
      await Promise.all([pEst, pRes, pPart]);
      cargadoEn = Date.now();
      pintarTodo();
    })().finally(() => { cargando = null; });
    return cargando;
  }
  function abrir(forzar) {
    if (!document.getElementById("iniRaiz")) montar();
    pintarAvatar();
    document.dispatchEvent(new CustomEvent("eof:inicio-visible"));
    if (forzar || !cargadoEn || Date.now() - cargadoEn > TTL_MS) cargar();
    else { pintarPendientes(); pintarHero(); pintarSemana(); pintarAtajos(); }
  }

  // ---------- Eventos ----------
  panel.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-ir],[data-tab-ir],[data-cuenta],[data-aviso],[data-articulo],[data-ini]");
    if (!b) return;
    if (b.dataset.tabIr) { const t = document.querySelector(`.tabs button[data-tab="${b.dataset.tabIr}"]`); if (t) t.click(); return; }
    if (b.dataset.ir) return ir(b.dataset.ir);
    if (b.dataset.cuenta) return typeof irAAjustesCuenta === "function" && irAAjustesCuenta(b.dataset.cuenta);
    if (b.dataset.aviso) return window.EOFAvisosEntrada && window.EOFAvisosEntrada.ir(b.dataset.aviso);
    if (b.dataset.articulo) return ir("noticias.nueva", { articulo: b.dataset.articulo });
    if (b.dataset.ini === "ver-pend") { const c = document.getElementById("iniPendCard"); if (c) c.scrollIntoView({ behavior: REDUCIR() ? "auto" : "smooth", block: "center" }); }
    else if (b.dataset.ini === "recargar") abrir(true);
    else if (b.dataset.ini === "anuncio-editar") { editandoAnuncio = true; pintarAnuncio(); const t = document.getElementById("iniAnTexto"); if (t) t.focus(); }
    else if (b.dataset.ini === "anuncio-cancelar") { editandoAnuncio = false; pintarAnuncio(); }
    else if (b.dataset.ini === "anuncio-guardar") guardarAnuncio();
    else if (b.dataset.ini === "anuncio-retirar") retirarAnuncio();
  });
  document.addEventListener("eof:avisos", () => { pintarPendientes(); pintarHero(); pintarRevision(); });
  panel.addEventListener("input", (ev) => { if (ev.target && ev.target.id === "iniBuscar") { filtroAtajos = ev.target.value; filtrarAtajos(); } });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && panel.classList.contains("activo")) abrir(false);
  });

  setInterval(() => { const h = document.getElementById("iniHora"); if (h && panel.classList.contains("activo")) h.textContent = horaTexto(); }, 20000);
  setInterval(() => {
    const raiz = document.getElementById("iniRaiz");
    if (!raiz || !panel.classList.contains("activo") || document.visibilityState !== "visible") return;
    if (editandoAnuncio || raiz.classList.contains("ini-edicion") || panel.querySelector("input:focus, textarea:focus")) return;
    abrir(true);
  }, 5 * 60 * 1000);
  window.EOFInicio = { abrir, recargar: () => abrir(true), estado: () => ({ datos, resumen, errorDatos, errorResumen, cargadoEn }) };
  montar();
  abrir(true);
})();
