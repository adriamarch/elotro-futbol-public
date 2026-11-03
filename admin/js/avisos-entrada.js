// ---------- Avisos al entrar al panel ----------
// Al abrir el panel se resume lo que está pendiente según el rol, en una tarjeta y con un contador en la
// cabecera que permite volver a abrirla:
//   · Nivel 4 / admin: noticias EN REVISIÓN (con las URGENTES destacadas: preferencia de fechas caducada
//     o a menos de 10 h), noticias publicadas sin revisión por subir a redes, acreditaciones pendientes.
//   · Cualquier redactor (no fotógrafo): solicitudes de edición pendientes de su respuesta, partidos
//     SIN CUBRIR (en juego sin nadie detrás o cerrados por el sistema sin confirmar; los primeros cuentan
//     como urgentes) y partidos anulados por reprogramar. Además, al entrar en la pestaña Resultados sale
//     un aviso breve (toast) con esos dos pendientes, una vez por sesión y mientras no cambien.
// Solo frontend: reutiliza los criterios y endpoints que ya usa el panel (no hay endpoint nuevo).
// Depende de globales de admin.js: USER, apiFetch, eofIrASeccion, nivelUsuarioConectado, articuloEnRevision,
// articuloPorSubirARedes, faseDePreferenciaFechas, msRestantesPreferenciaFechas, instanteDePreferencia.
(function () {
  "use strict";
  if (typeof USER === "undefined" || !USER || USER.rol === "fotografo") return;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const CLAVE_VISTO = "eof_avisos_entrada_visto";   // sessionStorage: firma de lo ya mostrado en esta sesión
  const CLAVE_APAGADO = "eof_avisos_entrada_off";   // localStorage: no abrir la tarjeta sola al entrar
  const RECHEQUEO_MS = 15 * 60 * 1000;

  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICO = {
    lista: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"/>'),
    revision: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 15 2 2 4-4"/>'),
    redes: svg('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>'),
    ediciones: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    acreditacion: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 17c.6-1.7 2-2.5 3.5-2.5s2.9.8 3.5 2.5M15 9h3M15 13h3"/>'),
    feedback: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="m9 10 2 2 4-4"/>'),
    anulado: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M10 14l4 4M14 14l-4 4"/>'),
    sincubrir: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    cerrar: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    flecha: svg('<path d="m9 6 6 6-6 6"/>'),
  };

  let items = [];          // filas calculadas, ya ordenadas
  let ultimaFirma = "";
  let ultimaUrgentes = 0;
  let ultimaComprobacion = 0;
  let calculando = false;

  // ---------- Cálculo ----------
  function dur(ms) {
    const m = Math.max(1, Math.round(Math.abs(ms) / 60000));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} h${m % 60 ? ` ${m % 60} min` : ""}`;
    const d = Math.floor(h / 24);
    return plural(d, "día", "días");
  }
  function urgenciaArticulo(a) {
    const fase = faseDePreferenciaFechas(a);
    if (fase === "caducada") return { ms: instanteDePreferencia(a.fecha_preferencia_hasta, false) - Date.now(), caducada: true };
    const rest = msRestantesPreferenciaFechas(a, fase);
    return rest != null ? { ms: rest, caducada: false } : null;
  }
  async function listaArticulos() {
    // Si la pestaña Noticias ya cargó la lista completa se reutiliza; si no, una petición acotada.
    if (typeof ARTICULOS_LISTA_COMPLETA !== "undefined" && Array.isArray(ARTICULOS_LISTA_COMPLETA) && ARTICULOS_LISTA_COMPLETA.length) return ARTICULOS_LISTA_COMPLETA;
    const { articles = [] } = await apiFetch("/api/articles?admin=1&limit=300");
    return articles;
  }
  async function calcular() {
    const filas = [];
    const nivel4 = typeof nivelUsuarioConectado === "function" ? nivelUsuarioConectado() >= 4 : USER.rol === "admin";
    const tareas = [];

    if (nivel4) {
      tareas.push((async () => {
        const arts = await listaArticulos();
        const rev = arts.filter(articuloEnRevision);
        if (rev.length) {
          const urg = rev.map((a) => ({ a, u: urgenciaArticulo(a) })).filter((x) => x.u)
            .sort((x, y) => x.u.ms - y.u.ms);
          let sub = "Terminadas, esperando a que alguien las suba.";
          let detalle = "";
          if (urg.length) {
            const p = urg[0];
            const tit = String(p.a.titulo || "Sin título");
            sub = `${plural(urg.length, "urgente", "urgentes")} · ${p.u.caducada ? `la más antigua caducó hace ${dur(p.u.ms)}` : `la primera caduca en ${dur(p.u.ms)}`}`;
            detalle = tit.length > 70 ? tit.slice(0, 69) + "…" : tit;
          }
          filas.push({ id: "revision", n: rev.length, urgente: urg.length, ico: ICO.revision, titulo: `${plural(rev.length, "noticia", "noticias")} en revisión`, sub, detalle });
        }
        const redes = arts.filter(articuloPorSubirARedes);
        if (redes.length) filas.push({ id: "redes", n: redes.length, urgente: 0, ico: ICO.redes, titulo: `${plural(redes.length, "noticia", "noticias")} por subir a redes`, sub: "Publicadas sin revisión de Nivel 4 en las últimas 48 h." });
      })());
      tareas.push((async () => {
        const { acreditaciones = [] } = await apiFetch("/api/acreditaciones");
        const n = acreditaciones.filter((a) => a.estado === "pendiente").length;
        if (n) filas.push({ id: "acreditaciones", n, urgente: 0, ico: ICO.acreditacion, titulo: `${plural(n, "acreditación pendiente", "acreditaciones pendientes")}`, sub: "Solicitudes que llegan por el formulario." });
      })());
    }

    // Partidos sin cubrir y anulados: se recalculan también por separado y a menudo (ver refrescarResultados).
    tareas.push(filasResultados(false).then((fs) => { fs.forEach((f) => filas.push(f)); }));

    tareas.push((async () => {
      const { solicitudes = [] } = await apiFetch("/api/edit-requests?estado=pendiente");
      const n = solicitudes.filter((s) => s.solicitante_id !== USER.id && (USER.rol === "admin" || s.autor_id === USER.id)).length;
      if (n) filas.push({ id: "ediciones", n, urgente: 0, ico: ICO.ediciones, titulo: `${plural(n, "solicitud de edición", "solicitudes de edición")}`, sub: "Esperan tu respuesta." });
    })());

    // Comentarios de revisores sin leer (todos los roles): ver js/feedback-revision.js.
    tareas.push((async () => {
      const r = await apiFetch("/api/feedback/resumen");
      const n = Number(r && r.no_leidos) || 0;
      if (n) filas.push({ id: "feedback", n, urgente: 0, ico: ICO.feedback, titulo: `${plural(n, "comentario nuevo", "comentarios nuevos")} de revisión`, sub: r.ultimo ? `Último sobre «${String(r.ultimo.article_titulo || "tu pieza").slice(0, 60)}»` : "Mira qué te han dicho sobre tus piezas.", detalle: "" });
    })());

    // Cada consulta falla por separado: un endpoint caído no tapa el resto de avisos.
    await Promise.all(tareas.map((t) => t.catch(() => {})));
    return ordenar(filas);
  }

  const ORDEN = { revision: 0, redes: 1, sincubrir: 1.5, ediciones: 2, feedback: 2.5, acreditaciones: 3, anulados: 4 };
  const ordenar = (filas) => filas.sort((a, b) => (b.urgente > 0) - (a.urgente > 0) || ORDEN[a.id] - ORDEN[b.id]);

  // Filas de Resultados: «sin cubrir» (los mismos criterios que el filtro «Solo sin cubrir»: avisoPartidoDesatendido
  // de admin.js + finalizados que cerró el cron, finalizado_no_cubierto) y «anulados» por reprogramar.
  // Si la lista de Resultados del panel ya está cargada se usa (sin red); si no, 3 consultas acotadas.
  async function filasResultados(forzar) {
    const nom = (r) => `${r.equipo_local} - ${r.equipo_visitante}`;
    let lista = (typeof RESULTADOS_LISTA_COMPLETA !== "undefined" && Array.isArray(RESULTADOS_LISTA_COMPLETA)) ? RESULTADOS_LISTA_COMPLETA : [];
    let anuladosLista = null;
    if (lista.length) anuladosLista = lista.filter((r) => r.estado === "anulado");
    else {
      const desde = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
      const [fin, vivo, anu] = await Promise.all([
        apiFetch(`/api/results?estado=finalizado&desde_fecha=${desde}&limit=0`).catch(() => null),
        apiFetch("/api/results?estado=en_juego&limit=0").catch(() => null),
        apiFetch("/api/results?estado=anulado&limit=0").catch(() => null),
      ]);
      lista = [...((fin && fin.results) || []), ...((vivo && vivo.results) || [])];
      anuladosLista = anu ? (anu.results || []) : null;
    }
    const filas = [];
    const cerrados = lista.filter((r) => r.estado === "finalizado" && Number(r.finalizado_no_cubierto) === 1);
    const enVivo = typeof avisoPartidoDesatendido === "function" ? lista.filter((r) => avisoPartidoDesatendido(r)) : [];
    const n = cerrados.length + enVivo.length;
    if (n) {
      const partes = [];
      if (enVivo.length) partes.push("en juego sin nadie detrás" + (enVivo.length > 1 ? ` (${enVivo.length})` : ""));
      if (cerrados.length) partes.push(plural(cerrados.length, "cerrado por el sistema", "cerrados por el sistema"));
      const primero = enVivo[0] || cerrados[0];
      filas.push({ id: "sincubrir", n, urgente: enVivo.length, ico: ICO.sincubrir, titulo: plural(n, "partido sin cubrir", "partidos sin cubrir"), sub: `${partes.join(" · ")} — revisa el marcador y los eventos.`, detalle: primero ? nom(primero) : "" });
    }
    if (anuladosLista) {
      const na = anuladosLista.length;
      try { sessionStorage.setItem("eof_anulados_pendientes", JSON.stringify({ n: na, t: Date.now() })); } catch { /* nada */ }
      try { if (typeof pintarBadgesAnulados === "function") pintarBadgesAnulados(na); } catch { /* nada */ }
      if (na) filas.push({ id: "anulados", n: na, urgente: 0, ico: ICO.anulado, titulo: plural(na, "partido anulado", "partidos anulados"), sub: "Pendientes de reprogramar.", detalle: nom(anuladosLista[0]) });
    }
    return filas;
  }

  // ---------- Contador en la cabecera ----------
  function pintarChip() {
    let chip = $("aeChip");
    const total = items.reduce((s, f) => s + f.n, 0);
    const urg = items.reduce((s, f) => s + f.urgente, 0);
    if (!total) { if (chip) chip.remove(); return; }
    if (!chip) {
      const ancla = $("notifWrap") || $("cuentaWrap");
      if (!ancla || !ancla.parentNode) return;
      chip = document.createElement("span");
      chip.id = "aeChip";
      chip.className = "ae-chip";
      chip.tabIndex = 0;
      chip.setAttribute("role", "button");
      chip.setAttribute("aria-haspopup", "dialog");
      const alternar = () => ($("aeCard") ? cerrarTarjeta() : abrirTarjeta());
      chip.addEventListener("click", (e) => { e.stopPropagation(); alternar(); });
      chip.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(); } });
      ancla.parentNode.insertBefore(chip, ancla);
    }
    chip.classList.toggle("ae-chip-urgente", urg > 0);
    chip.setAttribute("aria-label", `${plural(total, "aviso pendiente", "avisos pendientes")}${urg ? `, ${plural(urg, "urgente", "urgentes")}` : ""}. Abrir resumen`);
    const cifra = urg || total;
    chip.innerHTML = `${ICO.lista}<b>${cifra > 99 ? "99+" : cifra}</b><span class="ae-chip-txt">${urg ? (urg === 1 ? "Urgente" : "Urgentes") : (total === 1 ? "Pendiente" : "Pendientes")}</span>`;
  }

  // ---------- Tarjeta ----------
  function cerrarTarjeta() {
    const t = $("aeCard");
    if (!t) return;
    t.id = "aeCardSaliendo";
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { t.remove(); return; }
    t.classList.add("ae-sale");
    t.addEventListener("animationend", () => t.remove(), { once: true });
    setTimeout(() => t.remove(), 400);
  }
  const apagado = () => { try { return localStorage.getItem(CLAVE_APAGADO) === "1"; } catch { return false; } };
  const marcarVisto = () => { try { sessionStorage.setItem(CLAVE_VISTO, ultimaFirma); } catch { /* nada */ } };

  function abrirTarjeta() {
    if ($("aeCard") || !items.length) return;
    const urg = items.reduce((s, f) => s + f.urgente, 0);
    const el = document.createElement("section");
    el.id = "aeCard";
    el.className = "ae-card" + (urg ? " ae-card-urgente" : "");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Pendiente en el panel");
    el.innerHTML = `
      <div class="ae-cab">
        <span class="ae-cab-ico">${ICO.lista}</span>
        <div class="ae-cab-txt">
          <strong>Pendiente en el panel</strong>
          <span>${urg ? "Hay cosas que no pueden esperar." : "Un repaso rápido de lo que necesita tu atención."}</span>
        </div>
        <button type="button" class="ae-cerrar" data-ae="cerrar" aria-label="Cerrar">${ICO.cerrar}</button>
        <div class="ae-stats">
          ${urg ? `<span class="ae-stat ae-stat-urg"><i></i>${plural(urg, "urgente", "urgentes")}</span>` : ""}
          <span class="ae-stat"><i></i>${plural(items.length, "tipo de aviso", "tipos de aviso")}</span>
        </div>
      </div>
      <ul class="ae-lista">${items.map((f) => `
        <li><button type="button" class="ae-fila${f.urgente ? " ae-fila-urgente" : ""}" data-ae="ir" data-id="${esc(f.id)}">
          <span class="ae-ico">${f.ico}</span>
          <span class="ae-txt"><span class="ae-tit"><b>${esc(f.titulo)}</b>${f.urgente ? '<span class="ae-tag">Urgente</span>' : ""}</span><small>${esc(f.sub)}</small>${f.detalle ? `<small class="ae-det">${esc(f.detalle)}</small>` : ""}</span>
          <span class="ae-n">${f.n}</span>
          <span class="ae-flecha">${ICO.flecha}</span>
        </button></li>`).join("")}
      </ul>
      <div class="ae-pie">
        <button type="button" class="ae-link" data-ae="apagar">${apagado() ? "Volver a mostrar al entrar" : "No abrir al entrar"}</button>
        <button type="button" class="ae-ok" data-ae="cerrar">Entendido</button>
      </div>`;
    el.addEventListener("keydown", (e) => { if (e.key === "Escape") { cerrarTarjeta(); marcarVisto(); } });
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-ae]");
      if (!b) return;
      const acc = b.dataset.ae;
      if (acc === "cerrar") { marcarVisto(); cerrarTarjeta(); return; }
      if (acc === "apagar") {
        const nuevo = !apagado();
        try { nuevo ? localStorage.setItem(CLAVE_APAGADO, "1") : localStorage.removeItem(CLAVE_APAGADO); } catch { /* nada */ }
        b.textContent = nuevo ? "Volver a mostrar al entrar" : "No abrir al entrar";
        if (window.EOF && window.EOF.toast) window.EOF.toast(nuevo ? "No se abrirá sola al entrar. El contador de la cabecera sigue ahí." : "Se abrirá al entrar cuando haya algo pendiente.", "info");
        return;
      }
      if (acc === "ir") { marcarVisto(); cerrarTarjeta(); irA(b.dataset.id); }
    });
    document.body.appendChild(el);
  }

  // ---------- Navegación ----------
  // Tras cambiar de pestaña, el filtro (chip) puede tardar en existir: se reintenta unos instantes.
  function pulsarCuando(selector, intentos) {
    const b = document.querySelector(selector);
    if (b) { if (b.getAttribute("aria-pressed") !== "true") b.click(); return; }
    if (intentos > 0) setTimeout(() => pulsarCuando(selector, intentos - 1), 150);
  }
  function irA(id) {
    const vacio = new URLSearchParams();
    if (id === "revision" || id === "redes") { eofIrASeccion("noticias.lista", vacio); pulsarCuando(`#filtrosNoticias [data-filtro-noticias="${id}"]`, 24); }
    else if (id === "ediciones") eofIrASeccion("ediciones", vacio);
    else if (id === "feedback") eofIrASeccion("feedback", vacio);
    else if (id === "acreditaciones") eofIrASeccion("acreditaciones", vacio);
    else if (id === "sincubrir") { eofIrASeccion("resultados.lista", vacio); pulsarCuando("#filtroSoloSinCubrirResultados", 24); }
    else if (id === "anulados") { eofIrASeccion("resultados.lista", vacio); pulsarCuando('#filtrosEstadoResultados [data-filtro-estado="anulados"]', 24); }
  }

  // ---------- Ciclo ----------
  async function comprobar(inicial) {
    if (calculando) return;
    calculando = true;
    try {
      items = await calcular();
      ultimaComprobacion = Date.now();
      ultimoRefresco = Date.now();
      pintarChip();
      const urg = items.reduce((s, f) => s + f.urgente, 0);
      ultimaFirma = items.map((f) => `${f.id}:${f.n}:${f.urgente}`).join("|");
      let visto = "";
      try { visto = sessionStorage.getItem(CLAVE_VISTO) || ""; } catch { /* nada */ }
      // Al entrar: se abre si hay algo nuevo respecto a lo ya visto en esta sesión. En rechequeos
      // posteriores solo vuelve a abrirse si han aparecido urgencias nuevas.
      const abrir = items.length && !apagado() && ultimaFirma !== visto && (inicial || urg > ultimaUrgentes);
      ultimaUrgentes = urg;
      if (abrir) {
        // Si la celebración de racha está en pantalla (o a punto de salir), la tarjeta espera a que se cierre.
        if (window.EOF && EOF.esperarRacha) EOF.esperarRacha().then(abrirTarjeta); else abrirTarjeta();
      }
      else if (!items.length) cerrarTarjeta();
    } catch { /* los avisos son un extra: si falla, el panel sigue igual */ }
    calculando = false;
  }

  // ---------- Refresco en vivo de lo de Resultados ----------
  // Cada 2 min (pestaña visible) y cada vez que la lista de Resultados del panel se recarga se recalculan
  // «sin cubrir» y «anulados», se actualiza el contador de la cabecera y la tarjeta si está abierta. Si
  // aparece algo nuevo: una urgencia (partido en juego sin nadie) abre la tarjeta; un anulado nuevo o un
  // cerrado por el sistema avisan con un toast.
  const REFRESCO_RESULTADOS_MS = 2 * 60 * 1000;
  let refrescando = false;
  let ultimoRefresco = 0;
  async function refrescarResultados() {
    if (refrescando || calculando || !ultimaComprobacion) return;   // antes del primer cálculo no hay con qué comparar
    refrescando = true;
    try {
      const antes = (id) => items.find((f) => f.id === id);
      const sc0 = antes("sincubrir"), an0 = antes("anulados");
      const nuevas = await filasResultados(true);
      ultimoRefresco = Date.now();
      items = ordenar([...items.filter((f) => f.id !== "sincubrir" && f.id !== "anulados"), ...nuevas]);
      const sc1 = antes("sincubrir"), an1 = antes("anulados");
      pintarChip();
      const urg = items.reduce((t, f) => t + f.urgente, 0);
      const firmaNueva = items.map((f) => `${f.id}:${f.n}:${f.urgente}`).join("|");
      const cambio = firmaNueva !== ultimaFirma;
      ultimaFirma = firmaNueva;
      const urgNueva = urg > ultimaUrgentes;
      ultimaUrgentes = urg;
      if (!cambio) return;
      const nuevosAnulados = (an1 ? an1.n : 0) - (an0 ? an0.n : 0);
      const nuevosSin = (sc1 ? sc1.n : 0) - (sc0 ? sc0.n : 0);
      const abierta = !!$("aeCard");
      if (abierta) { const t = $("aeCard"); t.remove(); abrirTarjeta(); }
      else if (urgNueva && !apagado()) abrirTarjeta();
      else if (nuevosAnulados > 0 || nuevosSin > 0) {
        const partes = [];
        if (nuevosSin > 0) partes.push(plural(nuevosSin, "partido sin cubrir", "partidos sin cubrir"));
        if (nuevosAnulados > 0) partes.push(plural(nuevosAnulados, "partido anulado por reprogramar", "partidos anulados por reprogramar"));
        try { if (window.EOF && EOF.toast) EOF.toast(`Nuevo pendiente: ${partes.join(" · ")}.`, "info", 6000); } catch { /* sin toast */ }
      }
      if (!items.length) cerrarTarjeta();
    } catch { /* un fallo de red no molesta: se reintenta en el siguiente ciclo */ }
    refrescando = false;
  }

  // ---------- Aviso breve al entrar en la pestaña Resultados ----------
  const CLAVE_TOAST = "eof_avisos_resultados_toast";
  function avisarAlEntrarEnResultados() {
    if ($("aeCard")) return;   // la tarjeta ya lo está contando
    const sc = items.find((f) => f.id === "sincubrir");
    const an = items.find((f) => f.id === "anulados");
    if (!sc && !an) return;
    const firma = `${sc ? sc.n : 0}:${sc ? sc.urgente : 0}:${an ? an.n : 0}`;
    try { if (sessionStorage.getItem(CLAVE_TOAST) === firma) return; sessionStorage.setItem(CLAVE_TOAST, firma); } catch { /* nada */ }
    const partes = [];
    if (sc) partes.push(`${plural(sc.n, "partido sin cubrir", "partidos sin cubrir")}${sc.urgente ? ` (${sc.urgente} en juego sin nadie)` : ""}`);
    if (an) partes.push(`${plural(an.n, "anulado por reprogramar", "anulados por reprogramar")}`);
    try { if (window.EOF && EOF.toast) EOF.toast(`Pendiente en Resultados: ${partes.join(" · ")}.`, sc && sc.urgente ? "error" : "info", 7000); } catch { /* sin toast */ }
  }
  function vigilarPestanaResultados() {
    const panel = $("panel-resultados");
    if (!panel || typeof MutationObserver === "undefined") return;
    let activo = panel.classList.contains("activo");
    new MutationObserver(() => {
      const ahora = panel.classList.contains("activo");
      if (ahora && !activo) avisarAlEntrarEnResultados();
      activo = ahora;
    }).observe(panel, { attributes: true, attributeFilter: ["class"] });
  }

  function iniciar() {
    vigilarPestanaResultados();
    setInterval(() => { if (document.visibilityState === "visible" && ultimaComprobacion > 0 && Date.now() - ultimoRefresco > REFRESCO_RESULTADOS_MS - 5000) refrescarResultados(); }, 30000);
    // Cuando admin.js recarga la lista de Resultados (lo hace solo cada minuto, y tras reprogramar/anular/confirmar)
    // se aprovecha esa lista, sin pedir nada al servidor.
    if (typeof window.actualizarAvisoAnuladosResultados === "function") {
      const original = window.actualizarAvisoAnuladosResultados;
      let t = null;
      window.actualizarAvisoAnuladosResultados = function () {
        const r = original.apply(this, arguments);
        clearTimeout(t); t = setTimeout(refrescarResultados, 600);
        return r;
      };
    }
    // Un poco después de arrancar, para no competir con la carga del panel (el aviso del resumen mensual va a los 3,5 s).
    setTimeout(() => comprobar(true), 5000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && Date.now() - ultimoRefresco > REFRESCO_RESULTADOS_MS) refrescarResultados();
      if (document.visibilityState === "visible" && Date.now() - ultimaComprobacion > RECHEQUEO_MS) comprobar(false);
    });
    // Si hay un solo documento abierto mucho rato, también se refresca el contador.
    setInterval(() => { if (document.visibilityState === "visible" && Date.now() - ultimaComprobacion > RECHEQUEO_MS) comprobar(false); }, RECHEQUEO_MS);
  }
  iniciar();
})();
