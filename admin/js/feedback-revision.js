// ---------- Feedback de revisores ----------
// Pestaña "Feedback" del panel: comentarios que dejan los revisores sobre las
// piezas del redactor, y modal "nota del revisor" al aprobar/devolver una pieza
// ajena. Backend: /api/feedback* (worker y worker-secondary; esquema en
// worker/migracion_article_feedback.sql):
//   GET  /api/feedback?limit=&enviados=1   -> { feedback, no_leidos }  (recibidos, o enviados por mí)
//   GET  /api/feedback/resumen             -> { no_leidos, ultimo }
//   POST /api/feedback/leido {ids?}        -> marca esas (máx. 200) o, sin ids, TODAS como leídas
//
// Depende de globales de admin.js: apiFetch(path, options), window.EOF.toast.
// Expone window.EOFFeedback.pedirNota(...) y .pedirNotaAlGuardar(...) para que
// admin.js pida la nota SIN duplicar lógica (devuelve null si se cancela).
//
// Novedades respecto a la versión anterior:
//  - Marcar como leída una a una (y al abrir la pieza), con actualización optimista y marcha atrás si falla.
//  - Vista «Enviados» (lo que he dicho yo al aprobar/programar), agrupando el aviso al autor y al coautor.
//  - Buscador (pieza, persona, nota), contadores en los filtros, y filtros por tipo que solo salen si hay notas de ese tipo.
//  - Lista agrupada por día (Hoy, Ayer, Esta semana...), «Ver más antiguas» y error con «Reintentar».
//  - Se refresca sola al volver a la pestaña o al llegar feedback nuevo (con aviso), y se abre bien desde ?ir=feedback.
//  - Modal: frases rápidas, Ctrl/Cmd+Intro para enviar, bloqueo del scroll de fondo y contador que avisa al llegar al límite.
(function () {
  "use strict";

  const TIPOS = {
    aprobada: { etiqueta: "Aprobada", plural: "Aprobadas", titulo: "Pieza aprobada", icono: '<path d="M20 6 9 17l-5-5"/>' },
    programada: { etiqueta: "Programada", plural: "Programadas", titulo: "Pieza programada", icono: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    cambios: { etiqueta: "Cambios", plural: "Cambios", titulo: "Cambios solicitados", icono: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>' },
    observacion: { etiqueta: "Observación", plural: "Observaciones", titulo: "Nueva observación", icono: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
  };
  const TIPOS_EXTRA = ["cambios", "observacion"];   // sus filtros solo aparecen si hay notas de ese tipo
  const NOTA_MAX = 500;
  const LIMITE_INICIAL = 100, LIMITE_MAX = 300;     // el servidor admite hasta 300
  const MAX_IDS = 200;                              // tope del servidor por petición de /leido
  const REFRESCO_MIN_MS = 10000;                    // no recargar la lista más de una vez cada 10 s al volver a la pestaña
  const FRASES_RAPIDAS = ["Buen titular.", "Muy buen ritmo y datos.", "Gracias por el trabajo.", "Revisa tildes y puntuación."];
  const SUBTITULOS = {
    recibidos: "Notas y observaciones que te dejan quienes revisan tu trabajo.",
    enviados: "Las notas que has dejado al aprobar o programar piezas de otras personas.",
  };

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const svg = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  const toast = (m, t) => { if (window.EOF && window.EOF.toast) window.EOF.toast(m, t || "info"); };
  const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visible = (el) => !!(el && (el.offsetParent || (el.getClientRects && el.getClientRects().length)));
  const esqueleto = '<div class="fbk-esqueleto"></div><div class="fbk-esqueleto"></div><div class="fbk-esqueleto"></div>';

  // ---------- Estado ----------
  let modo = "recibidos";                       // "recibidos" | "enviados"
  let filtro = "todos";                         // todos | sin_leer | <tipo>
  let busqueda = "";                            // ya normalizada
  const datos = { recibidos: [], enviados: [] };
  const cargado = { recibidos: false, enviados: false };
  const limite = { recibidos: LIMITE_INICIAL, enviados: LIMITE_INICIAL };
  const tokens = { recibidos: 0, enviados: 0 }; // descarta respuestas de peticiones antiguas
  const ultimaCarga = { recibidos: 0, enviados: 0 };
  let noLeidosActual = null;                    // contador del servidor (tras operaciones optimistas)
  let temporizadorBuscar = null;

  // ---------- Fechas ----------
  function parseFecha(s) {
    if (!s) return null;
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : String(s).replace(" ", "T") + "Z");
    return isNaN(d.getTime()) ? null : d;
  }
  function fechaLegible(d) {
    if (!d) return "";
    const min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return "ahora mismo";
    if (min < 60) return "hace " + min + " min";
    if (min < 1440) return "hace " + Math.round(min / 60) + " h";
    if (min < 10080) return "hace " + Math.round(min / 1440) + " d";
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }
  function fechaCompleta(d) {
    return d ? d.toLocaleString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  }
  function grupoDe(d) {
    if (!d) return "Sin fecha";
    const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const ahora = new Date();
    const dias = Math.round((dia(ahora) - dia(d)) / 86400000);
    if (dias <= 0) return "Hoy";
    if (dias === 1) return "Ayer";
    if (dias < 7) return "Esta semana";
    if (d.getFullYear() === ahora.getFullYear() && d.getMonth() === ahora.getMonth()) return "Este mes";
    const m = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    return m.charAt(0).toUpperCase() + m.slice(1);
  }

  // ---------- Contador de la pestaña ----------
  function pintarBadge(n) {
    noLeidosActual = n;
    const b = $("badgeFeedbackNoLeidos");
    if (!b) return;
    b.textContent = n > 99 ? "99+" : String(n);
    b.style.display = n > 0 ? "" : "none";
  }

  async function refrescarResumen() {
    try {
      const r = await apiFetch("/api/feedback/resumen");
      if (!r || typeof r.no_leidos !== "number") return null; // p. ej. sesión caducada: no se toca el contador
      const previo = noLeidosActual;
      pintarBadge(r.no_leidos);
      if (previo !== null && r.no_leidos > previo) {
        if (r.ultimo && !document.hidden) {
          const t = TIPOS[r.ultimo.tipo] || TIPOS.observacion;
          toast("Nuevo feedback · " + t.etiqueta + ": " + (r.ultimo.article_titulo || "tu pieza"), "info");
        }
        // Si estás mirando la lista, se actualiza sola con lo nuevo.
        if (cargado.recibidos && visible($("panel-feedback"))) cargar("recibidos", true);
      }
      return r;
    } catch (_) { return null; }
  }

  // ---------- Preparación de datos ----------
  function preparar(f) {
    const t = TIPOS[f.tipo] || TIPOS.observacion;
    f._fecha = parseFecha(f.created_at);
    f._b = norm([f.article_titulo, f.autor_feedback_nombre, f.nota, t.etiqueta].join(" "));
    return f;
  }
  // Al aprobar/programar se crea una fila por destinatario (autor y coautor): en «Enviados» es la misma nota.
  function agruparEnviados(filas) {
    const out = [];
    for (const f of filas) {
      const p = out[out.length - 1];
      const t = parseFecha(f.created_at), tp = p && parseFecha(p.created_at);
      if (p && p.article_id === f.article_id && p.tipo === f.tipo && (p.nota || "") === (f.nota || "") && t && tp && Math.abs(tp - t) <= 120000) p._n++;
      else out.push(Object.assign({}, f, { _n: 1 }));
    }
    return out;
  }

  // ---------- Pintado ----------
  const itemsActuales = () => datos[modo];
  const noLeidosLocal = (arr) => arr.reduce((n, f) => n + (f.leido ? 0 : 1), 0);

  function visibles() {
    return itemsActuales().filter((f) =>
      (filtro === "todos" || (filtro === "sin_leer" ? !f.leido : f.tipo === filtro)) &&
      (!busqueda || f._b.includes(busqueda)));
  }

  function tarjeta(f, i) {
    const t = TIPOS[f.tipo] || TIPOS.observacion;
    const enviada = modo === "enviados";
    const nuevo = !enviada && !f.leido;
    const quien = enviada
      ? esc(t.titulo) + " · enviada por ti" + (f._n > 1 ? " · " + f._n + " destinatarios" : "")
      : esc(t.titulo) + " · de " + esc(f.autor_feedback_nombre || "la redacción");
    const botones = [];
    if (f.article_id) botones.push('<button type="button" class="fbk-btn sec" data-ver="' + esc(f.article_id) + '" data-fid="' + esc(f.id) + '">' + (enviada ? "Ver pieza" : "Ver mi pieza") + "</button>");
    if (nuevo) botones.push('<button type="button" class="fbk-btn ghost" data-leer="' + esc(f.id) + '">Marcar como leída</button>');
    const fecha = f._fecha ? '<time class="fbk-fecha" datetime="' + esc(f._fecha.toISOString()) + '" title="' + esc(fechaCompleta(f._fecha)) + '">' + esc(fechaLegible(f._fecha)) + "</time>" : "";
    return '<article class="fbk-tarjeta' + (nuevo ? " nuevo" : "") + '" data-tipo="' + esc(f.tipo) + '" data-id="' + esc(f.id) + '"' + (i < 12 ? ' style="--i:' + i + '"' : "") + ">" +
      '<div class="fbk-icono">' + svg(t.icono) + "</div><div class=\"fbk-cuerpo\">" +
      '<div class="fbk-fila1"><span class="fbk-etiqueta">' + esc(t.etiqueta) + "</span>" +
      (nuevo ? '<span class="fbk-nuevo"><span class="fbk-punto" aria-hidden="true"></span>Nueva</span>' : "") + fecha + "</div>" +
      '<h4 class="fbk-pieza">' + esc(f.article_titulo || "Pieza sin título") + "</h4>" +
      '<p class="fbk-quien">' + quien + "</p>" +
      (f.nota ? '<blockquote class="fbk-nota">' + esc(f.nota) + "</blockquote>" : "") +
      (botones.length ? '<div class="fbk-acciones">' + botones.join("") + "</div>" : "") +
      "</div></article>";
  }

  function vacioHtml(hayItems) {
    if (hayItems) {
      return '<div class="fbk-vacio"><strong>Nada con estos filtros</strong>Prueba con otra búsqueda o quita los filtros.' +
        '<div><button type="button" class="fbk-btn sec" data-accion="limpiar">Quitar filtros</button></div></div>';
    }
    return modo === "enviados"
      ? '<div class="fbk-vacio"><strong>Todavía no has dejado notas</strong>Cuando apruebes o programes una pieza de otra persona y dejes una nota, aparecerá aquí.</div>'
      : '<div class="fbk-vacio"><strong>Todavía no tienes comentarios</strong>Cuando alguien revise una pieza tuya, su nota aparecerá aquí.</div>';
  }

  // Contadores en los chips; los filtros de tipos poco habituales solo existen si hay notas de ese tipo.
  function pintarFiltros(arr) {
    const cont = $("fbkFiltros");
    if (!cont) return;
    for (const tipo of TIPOS_EXTRA) {
      const hay = arr.some((f) => f.tipo === tipo);
      let chip = cont.querySelector('[data-filtro="' + tipo + '"]');
      if (hay && !chip) {
        chip = document.createElement("button");
        chip.type = "button"; chip.className = "fbk-chip"; chip.dataset.filtro = tipo;
        chip.innerHTML = esc(TIPOS[tipo].plural) + '<span class="fbk-chip-n"></span>';
        cont.appendChild(chip);
      } else if (!hay && chip) { if (filtro === tipo) filtro = "todos"; chip.remove(); }
    }
    for (const chip of cont.querySelectorAll("[data-filtro]")) {
      const k = chip.dataset.filtro;
      const n = k === "todos" ? arr.length : k === "sin_leer" ? noLeidosLocal(arr) : arr.filter((f) => f.tipo === k).length;
      let sp = chip.querySelector(".fbk-chip-n");
      if (!sp) { sp = document.createElement("span"); sp.className = "fbk-chip-n"; chip.appendChild(sp); }
      sp.textContent = n;
      chip.hidden = k === "sin_leer" && modo === "enviados"; // en enviados no hay «leído»
      const activo = k === filtro;
      chip.classList.toggle("activo", activo);
      chip.setAttribute("aria-pressed", activo ? "true" : "false");
    }
  }

  function pintar() {
    const cont = $("fbkLista");
    if (!cont) return;
    const arr = itemsActuales();
    pintarFiltros(arr);
    const lista = visibles();
    if (!lista.length) cont.innerHTML = vacioHtml(arr.length > 0);
    else {
      let grupo = null;
      cont.innerHTML = lista.map((f, i) => {
        const g = grupoDe(f._fecha);
        const cab = g !== grupo ? '<h4 class="fbk-dia">' + esc(g) + "</h4>" : "";
        grupo = g;
        return cab + tarjeta(f, i);
      }).join("");
    }
    const estado = $("fbkEstado");
    if (estado) estado.textContent = !arr.length ? "" : lista.length !== arr.length
      ? "Mostrando " + lista.length + " de " + arr.length : arr.length + (arr.length === 1 ? " nota" : " notas");
    const marcar = $("fbkMarcarTodo");
    if (marcar) { marcar.hidden = modo === "enviados"; marcar.disabled = !arr.some((f) => !f.leido) && !(noLeidosActual > 0); }
    const mas = $("fbkMas");
    if (mas) mas.hidden = !(arr.length >= limite[modo] && limite[modo] < LIMITE_MAX);
    const sub = $("fbkSub");
    if (sub) sub.textContent = SUBTITULOS[modo];
  }

  // ---------- Carga ----------
  async function cargar(m, silencioso) {
    if (typeof m !== "string") m = modo; // compatible con quien lo llame como addEventListener("click", cargar)
    const mi = ++tokens[m];
    const cont = $("fbkLista");
    if (!cargado[m] && m === modo && cont) cont.innerHTML = esqueleto;
    try {
      const r = await apiFetch("/api/feedback?limit=" + limite[m] + (m === "enviados" ? "&enviados=1" : ""));
      if (mi !== tokens[m]) return;
      if (!r || !Array.isArray(r.feedback)) throw new Error("Respuesta no válida");
      datos[m] = (m === "enviados" ? agruparEnviados(r.feedback) : r.feedback).map(preparar);
      cargado[m] = true;
      ultimaCarga[m] = Date.now();
      if (m === "recibidos" && typeof r.no_leidos === "number") pintarBadge(r.no_leidos);
      if (m === modo) {
        if (cont && !cont.dataset.visto) { cont.dataset.visto = "1"; cont.classList.add("anim"); setTimeout(() => cont.classList.remove("anim"), 700); }
        pintar();
      }
    } catch (err) {
      if (mi !== tokens[m]) return;
      if (m === modo && !cargado[m] && cont) {
        cont.innerHTML = '<div class="fbk-vacio"><strong>No se pudo cargar</strong>' + esc(err.message || "Inténtalo de nuevo.") +
          '<div><button type="button" class="fbk-btn sec" data-accion="reintentar">Reintentar</button></div></div>';
      } else if (!silencioso) toast("No se pudo actualizar el feedback: " + (err.message || "error"), "error");
    }
  }

  // Al abrir la pestaña (o llegar por enlace): se ve lo que ya había y se refresca por detrás.
  function alMostrar() {
    if (!cargado[modo]) cargar(modo);
    else if (Date.now() - ultimaCarga[modo] > REFRESCO_MIN_MS) cargar(modo, true);
  }

  // ---------- Marcar como leído ----------
  async function marcarLeidas(ids) {
    const mias = datos.recibidos;
    const pend = [...new Set(ids)].filter((id) => mias.some((f) => f.id === id && !f.leido));
    if (!pend.length) return;
    mias.forEach((f) => { if (pend.includes(f.id)) f.leido = 1; });
    pintarBadge(Math.max(0, (noLeidosActual || 0) - pend.length));
    if (modo === "recibidos") pintar();
    try {
      for (let i = 0; i < pend.length; i += MAX_IDS) {
        await apiFetch("/api/feedback/leido", { method: "POST", body: JSON.stringify({ ids: pend.slice(i, i + MAX_IDS) }) });
      }
    } catch (err) { // marcha atrás: vuelven a salir como nuevas
      mias.forEach((f) => { if (pend.includes(f.id)) f.leido = 0; });
      if (modo === "recibidos") pintar();
      toast("No se pudo marcar como leída: " + err.message, "error");
    }
    refrescarResumen(); // sincroniza el contador con el servidor
  }

  async function marcarTodoLeido() {
    const btn = $("fbkMarcarTodo");
    if (btn) btn.disabled = true;
    try {
      await apiFetch("/api/feedback/leido", { method: "POST", body: JSON.stringify({}) });
      datos.recibidos.forEach((f) => { f.leido = 1; });
      pintarBadge(0);
      pintar();
    } catch (err) { toast("Error: " + err.message, "error"); pintar(); }
  }

  // ---------- Cambios de vista ----------
  function cambiarModo(nuevo) {
    if (nuevo === modo || !datos[nuevo]) return;
    modo = nuevo; filtro = "todos"; busqueda = "";
    const b = $("fbkBuscar"); if (b) b.value = "";
    document.querySelectorAll("#panel-feedback [data-modo]").forEach((x) => {
      const a = x.dataset.modo === modo;
      x.classList.toggle("activo", a);
      x.setAttribute("aria-pressed", a ? "true" : "false");
    });
    if (cargado[modo]) { pintar(); alMostrar(); } else { pintar(); cargar(modo); }
  }

  function limpiarFiltros() {
    filtro = "todos"; busqueda = "";
    const b = $("fbkBuscar"); if (b) b.value = "";
    pintar();
  }

  // ---- Modal de nota ----
  function pedirNota({ tipo, titulo, autorNombre, obligatoria }) {
    return new Promise((resolve) => {
      const previo = document.activeElement;
      const fondo = document.createElement("div");
      fondo.className = "fbk-modal";
      const a = autorNombre ? " a " + esc(autorNombre) : "";
      const textos = {
        aprobada: ["Aprobar y avisar" + a, "Deja una nota breve (opcional): le llegará por correo y la verá en su pestaña Feedback."],
        programada: ["Programar y avisar" + a, "Deja una nota breve (opcional) sobre la programación."],
        cambios: ["Pedir cambios" + a, "Cuéntale qué debe revisar: le llegará por correo y lo verá en su pestaña Feedback."],
      }[tipo] || ["Avisar" + a, "Deja una nota breve (opcional)."];
      const rapidas = FRASES_RAPIDAS.map((f) => '<button type="button" class="fbk-rapida" data-frase="' + esc(f) + '">' + esc(f.replace(/\.$/, "")) + "</button>").join("");
      fondo.innerHTML = '<div class="fbk-caja" data-tipo="' + esc(tipo) + '" role="dialog" aria-modal="true" aria-labelledby="fbkModalT" aria-describedby="fbkModalD">' +
        '<h3 id="fbkModalT">' + textos[0] + '</h3><p id="fbkModalD">' + textos[1] + "</p>" +
        '<div class="fbk-pieza-caja">' + esc(titulo || "") + "</div>" +
        '<textarea maxlength="' + NOTA_MAX + '" placeholder="Ej.: Muy buen ritmo en la crónica, gracias." aria-label="Nota del revisor"></textarea>' +
        '<div class="fbk-rapidas" role="group" aria-label="Frases rápidas">' + rapidas + "</div>" +
        '<div class="fbk-contador"><span class="fbk-atajo">Ctrl+Intro para enviar</span><span class="fbk-cuenta"><b>0</b>/' + NOTA_MAX + "</span></div>" +
        '<div class="fbk-botones"><button type="button" class="fbk-btn sec" data-a="cancelar">Cancelar</button>' +
        (obligatoria ? "" : '<button type="button" class="fbk-btn sec" data-a="sin">Continuar sin nota</button>') +
        '<button type="button" class="fbk-btn" data-a="ok">' + (obligatoria ? "Enviar" : "Continuar con nota") + "</button></div></div>";
      document.body.appendChild(fondo);
      const overflowPrevio = document.body.style.overflow;
      document.body.style.overflow = "hidden"; // el fondo no se desplaza mientras el modal está abierto
      const ta = fondo.querySelector("textarea");
      const cuenta = fondo.querySelector(".fbk-cuenta");
      const num = cuenta.querySelector("b");
      const ok = fondo.querySelector('[data-a="ok"]');
      const sync = () => {
        num.textContent = ta.value.length;
        cuenta.classList.toggle("cerca", ta.value.length >= NOTA_MAX * 0.9);
        if (obligatoria) ok.disabled = !ta.value.trim();
      };
      ta.addEventListener("input", sync);
      sync();
      const cerrar = (valor) => {
        document.removeEventListener("keydown", tecla, true);
        document.body.style.overflow = overflowPrevio;
        fondo.remove();
        if (previo && previo.focus) previo.focus();
        resolve(valor);
      };
      const enviar = () => { if (!ok.disabled) cerrar(ta.value.trim()); };
      const tecla = (e) => {
        if (e.key === "Escape") { e.stopPropagation(); cerrar(null); }
        else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); }
        else if (e.key === "Tab") {
          const f = fondo.querySelectorAll("textarea,button:not([disabled])");
          if (!f.length) return;
          const p = f[0], u = f[f.length - 1];
          if (e.shiftKey && document.activeElement === p) { e.preventDefault(); u.focus(); }
          else if (!e.shiftKey && document.activeElement === u) { e.preventDefault(); p.focus(); }
        }
      };
      document.addEventListener("keydown", tecla, true);
      fondo.addEventListener("click", (e) => {
        if (e.target === fondo) return cerrar(null);
        const fr = e.target.closest("[data-frase]");
        if (fr) { // añade la frase al final sin pasarse del límite
          const base = ta.value.trim();
          ta.value = (base ? base + " " : "") + fr.dataset.frase;
          if (ta.value.length > NOTA_MAX) ta.value = ta.value.slice(0, NOTA_MAX);
          sync(); ta.focus();
          return;
        }
        const b = e.target.closest("[data-a]");
        if (!b) return;
        if (b.dataset.a === "cancelar") cerrar(null);
        else if (b.dataset.a === "sin") cerrar("");
        else enviar();
      });
      setTimeout(() => ta.focus(), 30);
    });
  }

  // Decide si hay que pedir nota al guardar una pieza existente y la pide.
  // "original" = objeto de ARTICULOS_CACHE (estado antes de guardar).
  // Devuelve null (cancelado), "" (sin nota / no aplica) o el texto.
  async function pedirNotaAlGuardar(body, original) {
    try {
      const yo = (window.USER || JSON.parse(localStorage.getItem("eof_user") || "null") || {}).id;
      if (!original || !yo || original.autor_id === yo || original.coautor_id === yo) return "";
      let tipo = null;
      if (body.publicado && !original.publicado) tipo = "aprobada";
      else if (!body.publicado && body.programado_para && !original.programado_para) tipo = "programada";
      if (!tipo) return "";
      return await pedirNota({ tipo, titulo: body.titulo, autorNombre: original.autor_nombre });
    } catch (_) { return ""; }
  }

  // ---------- Arranque ----------
  function iniciar() {
    const panel = $("panel-feedback");
    if (panel) {
      panel.addEventListener("click", (e) => {
        const chip = e.target.closest("[data-filtro]");
        if (chip) { filtro = chip.dataset.filtro; pintar(); return; }
        const m = e.target.closest("[data-modo]");
        if (m) { cambiarModo(m.dataset.modo); return; }
        const leer = e.target.closest("[data-leer]");
        if (leer) { marcarLeidas([Number(leer.dataset.leer)]); return; }
        const ver = e.target.closest("[data-ver]");
        if (ver) {
          if (modo === "recibidos") marcarLeidas([Number(ver.dataset.fid)]); // abrirla cuenta como verla
          if (typeof window.irANoticiaDelPanel === "function") window.irANoticiaDelPanel(ver.dataset.ver);
          else { const t = document.querySelector('.tabs button[data-tab="noticias"]'); if (t) t.click(); }
          return;
        }
        const acc = e.target.closest("[data-accion]");
        if (acc) {
          if (acc.dataset.accion === "limpiar") limpiarFiltros();
          else if (acc.dataset.accion === "reintentar") cargar(modo);
        }
      });
      const marcar = $("fbkMarcarTodo");
      if (marcar) marcar.addEventListener("click", marcarTodoLeido);
      const mas = $("fbkMas");
      if (mas) mas.addEventListener("click", () => { limite[modo] = LIMITE_MAX; mas.hidden = true; cargar(modo); });
      const buscar = $("fbkBuscar");
      if (buscar) {
        buscar.addEventListener("input", () => {
          clearTimeout(temporizadorBuscar);
          temporizadorBuscar = setTimeout(() => { busqueda = norm(buscar.value.trim()); pintar(); }, 150);
        });
        buscar.addEventListener("keydown", (e) => { if (e.key === "Escape" && buscar.value) { buscar.value = ""; busqueda = ""; pintar(); } });
      }
      // Se carga al verse la sección, llegue la persona pulsando la pestaña o por enlace (?ir=feedback).
      if (typeof IntersectionObserver === "function") {
        new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) alMostrar(); }).observe(panel);
      }
    }
    const tab = document.querySelector('.tabs button[data-tab="feedback"]');
    if (tab) tab.addEventListener("click", alMostrar);
    refrescarResumen();
    setInterval(() => { if (!document.hidden) refrescarResumen(); }, 120000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refrescarResumen(); });
  }

  window.EOFFeedback = { pedirNota, pedirNotaAlGuardar, cargar, refrescarResumen };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
