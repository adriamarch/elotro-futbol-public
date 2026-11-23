// ---------- Pestaña "Comunicados oficiales" del panel (solo Responsables) ----------
// Backend: /api/comunicados* (worker/src/index.js y worker-secondary/src/index.js).
// Depende de globales de admin.js / ui-alertas.js: apiFetch(path, options), window.EOF.toast / confirmar.
// El texto es TEXTO PLANO (párrafos separados por una línea en blanco): aquí siempre se escapa, nunca se pinta como HTML.
(function () {
  "use strict";

  let items = [];
  let editando = null; // id en edición, o "nuevo"
  let cargado = false;
  let filtro = "todos"; // todos | publicado | borrador
  let filtroTipo = "todos"; // todos | comunicado | aviso | rectificacion | novedad
  let consulta = ""; // texto de búsqueda (sin tildes, minúsculas)

  const MAX = { titulo: 150, resumen: 280, contenido: 8000, firma: 80 };
  const MIN_CONTENIDO = 20;
  const TIPOS = { comunicado: "Comunicado", aviso: "Aviso", rectificacion: "Rectificación", novedad: "Novedad" };

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const toast = (m, tipo) => { if (window.EOF && window.EOF.toast) window.EOF.toast(m, tipo || "info"); };
  const hoy = () => new Date().toISOString().slice(0, 10);
  const ICO = {
    sello: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 14.5 2 2 4-4.5"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.8v3.4M16 2.8v3.4M3 10h18"/></svg>',
    firma: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13 20h7"/></svg>',
    lapiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/></svg>',
    papelera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.2a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L18 7M9 7V4.5h6V7"/></svg>',
    ojo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    ojoNo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.4-1"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    megafono: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    aviso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.2M12 17h.01"/></svg>',
    rectificacion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14.5 7.5 3 3M13 20h7"/></svg>',
    novedad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>',
    lupa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    lista: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.5 2.5 21.5 9.5l-2.2.7-3.6 3.6.4 4-1.6 1.6-4.2-4.2-5.3 5.3-1.1-1.1 5.3-5.3L5.0 10l1.6-1.6 4 .4 3.6-3.6z"/></svg>',
  };

  const icoTipo = (t) => (t === "comunicado" || !ICO[t]) ? ICO.megafono : ICO[t];
  const quitarTildes = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function baldosa(f) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f || ""));
    if (!m) return '<span class="cmo-baldosa cmo-baldosa-vacia"><b>–</b></span>';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
    return '<span class="cmo-baldosa"><b>' + d.getDate() + "</b><em>" + esc(d.toLocaleDateString("es-ES", { month: "short" }).replace(".", "")) + "</em><i>" + d.getFullYear() + "</i></span>";
  }
  const minLectura = (t) => Math.max(1, Math.round(String(t || "").trim().split(/\s+/).filter(Boolean).length / 200));
  function fechaCorta(f) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f || ""));
    if (!m) return esc(f || "Sin fecha");
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return esc(d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }).replace(/\./g, ""));
  }
  function fechaLarga(f) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f || ""));
    if (!m) return "";
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  }
  // Texto plano -> HTML seguro. Todo se escapa; las URL http(s) se vuelven enlaces y los bloques con "- " / "• " son listas
  // (igual que en la web pública).
  function conEnlaces(raw) {
    const re = /https?:\/\/[^\s<>"]+/g;
    let out = "", ult = 0, m;
    while ((m = re.exec(raw))) {
      let url = m[0], cola = "";
      const f = /[.,;:!?)\]]+$/.exec(url);
      if (f) { cola = f[0]; url = url.slice(0, -cola.length); }
      out += esc(raw.slice(ult, m.index)) + '<span class="cmo-url">' + esc(url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")) + "</span>" + esc(cola);
      ult = m.index + m[0].length;
    }
    return out + esc(raw.slice(ult));
  }
  function parrafos(texto) {
    return String(texto || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => {
      const lin = p.split("\n");
      if (lin.every((l) => /^\s*[-•*]\s+\S/.test(l))) return '<ul class="cmo-prev-lista">' + lin.map((l) => "<li>" + conEnlaces(l.replace(/^\s*[-•*]\s+/, "")) + "</li>").join("") + "</ul>";
      return "<p>" + lin.map(conEnlaces).join("<br>") + "</p>";
    }).join("");
  }

  async function cargar() {
    const cont = $("cmoLista");
    if (!cont) return;
    try {
      const r = await apiFetch("/api/comunicados/admin");
      items = Array.isArray(r.items) ? r.items : [];
      cargado = true;
      pintarLista();
    } catch (e) {
      cont.innerHTML = '<div class="cmo-vacio"><p>No se pudieron cargar los comunicados: ' + esc(e.message || "error") + '</p><button type="button" class="cmo-btn" data-act="reintentar">Reintentar</button></div>';
    }
  }

  function pintarResumen() {
    const cont = $("cmoEstadisticas");
    if (!cont) return;
    if (!items.length) { cont.hidden = true; cont.innerHTML = ""; return; }
    const n = (fn) => items.filter(fn).length;
    const stats = [
      ["Total", items.length, "tot", ICO.sello],
      ["Publicados", n((x) => x.publicado), "pub", ICO.ojo],
      ["Borradores", n((x) => !x.publicado), "bor", ICO.lapiz],
      ["Fijado", n((x) => x.fijado && x.publicado), "fij", ICO.pin],
    ];
    const filtros = [
      ["todos", "Todos", items.length],
      ["publicado", "Publicados", n((x) => x.publicado)],
      ["borrador", "Borradores", n((x) => !x.publicado)],
    ];
    const tipos = Object.keys(TIPOS).filter((t) => items.some((x) => x.tipo === t));
    cont.hidden = false;
    cont.innerHTML =
      '<div class="cmo-stats">' + stats.map((s) => '<div class="cmo-stat cmo-stat-' + s[2] + '"><span class="cmo-stat-ico">' + s[3] + '</span><div><b>' + s[1] + "</b><span>" + s[0] + "</span></div></div>").join("") + "</div>" +
      '<div class="cmo-barra">' +
      '<div class="cmo-filtros" role="tablist" aria-label="Filtrar comunicados">' +
      filtros.map((f) => '<button type="button" role="tab" class="cmo-filtro' + (filtro === f[0] ? " activo" : "") + '" data-filtro="' + f[0] + '" aria-selected="' + (filtro === f[0]) + '">' + f[1] + " <i>" + f[2] + "</i></button>").join("") + "</div>" +
      '<label class="cmo-buscar">' + ICO.lupa + '<input type="search" id="cmoBuscar" placeholder="Buscar por título o texto…" aria-label="Buscar comunicados" value="' + esc(consulta) + '"></label></div>' +
      (tipos.length > 1 ? '<div class="cmo-tipos" aria-label="Filtrar por tipo">' +
        '<button type="button" class="cmo-tipochip' + (filtroTipo === "todos" ? " activo" : "") + '" data-tipo="todos">Todos los tipos</button>' +
        tipos.map((t) => '<button type="button" class="cmo-tipochip cmo-tipo-' + t + (filtroTipo === t ? " activo" : "") + '" data-tipo="' + t + '">' + icoTipo(t) + TIPOS[t] + "</button>").join("") + "</div>" : "");
  }

  function visibles() {
    const lista = items.filter((it) => {
      if (filtro === "publicado" && !it.publicado) return false;
      if (filtro === "borrador" && it.publicado) return false;
      if (filtroTipo !== "todos" && it.tipo !== filtroTipo) return false;
      if (consulta && quitarTildes((it.titulo || "") + " " + (it.resumen || "") + " " + (it.contenido || "")).indexOf(consulta) < 0) return false;
      return true;
    });
    // Fijado publicado primero; luego por fecha (ya vienen ordenados del servidor).
    return lista.slice().sort((a, b) => (Number(b.fijado && b.publicado) - Number(a.fijado && a.publicado)));
  }

  function pintarLista() { pintarResumen(); pintarFilas(); }

  function pintarFilas() {
    const cont = $("cmoLista");
    if (!items.length) {
      cont.innerHTML = '<div class="cmo-vacio cmo-vacio-grande cmo-vacio-inicio"><span class="cmo-vacio-ico cmo-vacio-ico-pulso">' + ICO.megafono + '</span><strong>Todavía no hay comunicados</strong><p>Los comunicados oficiales son mensajes del medio para los lectores. Se guardan como borrador hasta que los publiques.</p>' +
        '<div class="cmo-vacio-tipos">' + Object.keys(TIPOS).map((t) => '<span class="cmo-vacio-tipo cmo-tipo-' + t + '">' + icoTipo(t) + TIPOS[t] + "</span>").join("") + "</div>" +
        '<button type="button" class="cmo-btn cmo-primario" data-act="nuevo">' + ICO.lapiz + "Redactar el primer comunicado</button></div>";
      return;
    }
    const lista = visibles();
    if (!lista.length) { cont.innerHTML = '<div class="cmo-vacio cmo-vacio-grande"><span class="cmo-vacio-ico cmo-vacio-ico-suave">' + ICO.lupa + '</span><strong>Nada con ese filtro</strong><p>Prueba con otro tipo, otro estado u otra búsqueda.</p></div>'; return; }
    cont.innerHTML = lista.map((it) => {
      const extracto = it.resumen || String(it.contenido || "").replace(/\s+/g, " ").slice(0, 200);
      const pubFijado = it.fijado && it.publicado;
      return '<article class="cmo-fila cmo-tipo-' + esc(it.tipo) + (it.publicado ? "" : " cmo-borrador") + (pubFijado ? " cmo-fijada" : "") + '" data-id="' + esc(it.id) + '">' +
        baldosa(it.fecha) +
        '<div class="cmo-info" data-act="editar" title="Editar este comunicado"><div class="cmo-titulo-fila"><em class="cmo-tipo">' + icoTipo(it.tipo) + esc(TIPOS[it.tipo] || it.tipo) + "</em>" +
        '<span class="cmo-chips">' +
        (it.fijado ? '<em class="cmo-chip fij">' + ICO.pin + "Fijado</em>" : "") +
        (it.publicado ? '<em class="cmo-chip pub"><i></i>Publicado</em>' : '<em class="cmo-chip borr">Borrador</em>') + "</span></div>" +
        '<strong title="' + esc(it.titulo) + '">' + esc(it.titulo) + "</strong>" +
        '<p class="cmo-extracto">' + esc(extracto) + "</p>" +
        '<div class="cmo-metas">' +
        '<span class="cmo-meta">' + ICO.firma + esc(it.firma || "Responsable") + (it.autor ? " · " + esc(it.autor) : "") + "</span>" +
        '<span class="cmo-meta">' + ICO.reloj + minLectura(it.contenido) + " min</span>" +
        (it.editado ? '<span class="cmo-meta cmo-meta-sutil">Editado</span>' : "") + "</div></div>" +
        '<div class="cmo-acc">' +
        (it.publicado && it.slug ? '<button type="button" class="cmo-btn cmo-btn-ico" data-act="compartir" title="Compartir en redes">' + ICO.share + "<span>Compartir</span></button>" : "") +
        (it.publicado && it.slug ? '<a class="cmo-btn cmo-btn-ico" href="/comunicados/' + encodeURIComponent(it.slug) + '" target="_blank" rel="noopener" title="Ver en la web">' + ICO.ojo + "<span>Ver en la web</span></a>" : "") +
        (it.publicado ? '<button type="button" class="cmo-btn cmo-btn-ico' + (it.fijado ? " cmo-activo" : "") + '" data-act="fijar" title="' + (it.fijado ? "Quitar de fijado" : "Fijar el primero (desfija el actual)") + '">' + ICO.pin + "<span>" + (it.fijado ? "Desfijar" : "Fijar") + "</span></button>" : "") +
        '<button type="button" class="cmo-btn cmo-btn-ico" data-act="alternar" title="' + (it.publicado ? "Retirar a borrador" : "Publicar") + '">' + (it.publicado ? ICO.ojoNo + "<span>Retirar</span>" : ICO.ojo + "<span>Publicar</span>") + "</button>" +
        '<button type="button" class="cmo-btn cmo-btn-ico" data-act="editar" title="Editar">' + ICO.lapiz + "<span>Editar</span></button>" +
        '<button type="button" class="cmo-btn cmo-btn-ico cmo-peligro" data-act="borrar" title="Borrar">' + ICO.papelera + "<span>Borrar</span></button></div></article>";
    }).join("");
  }

  // ---------- Formulario ----------
  function contador(id, max) {
    const el = $(id);
    const out = $(id + "N");
    if (el && out) {
      const n = el.value.length;
      out.textContent = n + " / " + max;
      out.classList.toggle("cmo-pasado", n > max);
    }
  }

  function pintarPrevia() {
    const cont = $("cmoPrev");
    if (!cont) return;
    const val = (id) => ($(id) ? $(id).value : "");
    const tipo = val("cmoTipo") || "comunicado";
    const titulo = val("cmoTitulo").trim() || "Título del comunicado";
    const resumen = val("cmoResumen").trim();
    const cuerpo = val("cmoContenido").trim();
    const firma = val("cmoFirma").trim() || (editando && editando !== "nuevo" ? ((items.find((x) => x.id === editando) || {}).firma || "Responsable") : "Responsable");
    cont.innerHTML =
      '<span class="cmo-prev-etq">Así se leerá en la web</span>' +
      '<article class="cmo-prev-art cmo-tipo-' + esc(tipo) + '">' +
      '<header class="cmo-prev-cab"><em class="cmo-tipo">' + icoTipo(tipo) + esc(TIPOS[tipo] || tipo) + "</em>" +
      "<h4>" + esc(titulo) + "</h4>" +
      "<small>" + ICO.cal + esc(fechaLarga(val("cmoFecha")) || "Sin fecha") + "<span>" + ICO.reloj + minLectura(cuerpo) + " min de lectura</span></small></header>" +
      '<div class="cmo-prev-txt">' +
      (resumen ? '<p class="cmo-prev-resumen">' + esc(resumen) + "</p>" : "") +
      '<div class="cmo-prev-cuerpo">' + (cuerpo ? parrafos(cuerpo) : '<p class="cmo-prev-vacio">El texto aparecerá aquí.</p>') + "</div>" +
      '<footer><span class="cmo-prev-sello">' + ICO.firma + "</span><span><small>Documento oficial · firmado por</small><b>" + esc(firma) + "</b></span></footer></div></article>";
  }

  function pintarFormulario() {
    const cont = $("cmoForm");
    if (editando === null) { cont.innerHTML = ""; cont.hidden = true; return; }
    const nuevo = editando === "nuevo";
    const it = nuevo ? { tipo: "comunicado", fecha: hoy(), publicado: false, fijado: false } : items.find((x) => x.id === editando) || {};
    cont.hidden = false;
    cont.innerHTML =
      '<div class="cmo-form-cab"><span class="cmo-form-ico">' + (nuevo ? ICO.sello : ICO.lapiz) + '</span><div><h3>' + (nuevo ? "Nuevo comunicado oficial" : "Editar comunicado") + '</h3><p>Los campos con * son obligatorios.</p></div>' +
      '<button type="button" class="cmo-cerrar" data-act="cancelar" aria-label="Cerrar">✕</button></div>' +
      '<div class="cmo-editor"><div class="cmo-editor-col">' +
      '<div class="cmo-seccion">Contenido</div>' +
      '<div class="cmo-grid">' +
      '<label class="cmo-campo"><span>Tipo</span><select id="cmoTipo">' +
      Object.keys(TIPOS).map((k) => '<option value="' + k + '"' + (it.tipo === k ? " selected" : "") + ">" + TIPOS[k] + "</option>").join("") + "</select></label>" +
      '<label class="cmo-campo"><span>Fecha</span><input id="cmoFecha" type="date" value="' + esc(it.fecha || hoy()) + '"></label>' +
      '<label class="cmo-campo cmo-ancho"><span>Título * <i class="cmo-n" id="cmoTituloN"></i></span><input id="cmoTitulo" value="' + esc(it.titulo || "") + '" maxlength="' + MAX.titulo + '" autocomplete="off"></label>' +
      '<label class="cmo-campo cmo-ancho"><span>Resumen (opcional) <i class="cmo-n" id="cmoResumenN"></i></span><textarea id="cmoResumen" rows="2" maxlength="' + MAX.resumen + '" placeholder="Una o dos frases que resuman el comunicado">' + esc(it.resumen || "") + "</textarea></label>" +
      '<label class="cmo-campo cmo-ancho"><span>Texto * <i class="cmo-n" id="cmoContenidoN"></i></span><textarea id="cmoContenido" rows="12" maxlength="' + (MAX.contenido + 500) + '" placeholder="Escribe el comunicado. Deja una línea en blanco entre párrafos.">' + esc(it.contenido || "") + "</textarea><div class=\"cmo-herr\"><button type=\"button\" class=\"cmo-herr-btn\" data-act=\"lista\" title=\"Convertir las líneas seleccionadas en una lista\">" + ICO.lista + "Lista</button><small class=\"cmo-ayuda\">Texto plano. Una línea en blanco separa párrafos; las líneas que empiezan por <b>-</b> forman una lista y las direcciones web (https://…) se convierten en enlaces.</small></div></label>" +
      '<label class="cmo-campo cmo-ancho"><span>Firma (opcional)</span><input id="cmoFirma" value="' + esc(it.firma || "") + '" maxlength="' + MAX.firma + '" placeholder="' + (nuevo ? "Vacío = tu cargo (p. ej. Responsable del Sitio Web)" : "Vacío = se mantiene la firma actual") + '" autocomplete="off"></label>' +
      "</div></div>" +
      '<aside class="cmo-prev" id="cmoPrev" aria-label="Vista previa"></aside></div>' +
      '<div class="cmo-seccion">Visibilidad</div>' +
      '<div class="cmo-checks"><label class="cmo-switch"><input type="checkbox" id="cmoFijado"' + (it.fijado ? " checked" : "") + '><span class="cmo-pista"></span><span class="cmo-switch-txt"><strong>Fijado</strong><small>Va el primero. Solo uno publicado puede estar fijado: al fijar este se desfija el anterior.</small></span></label>' +
      '<label class="cmo-switch"><input type="checkbox" id="cmoPub"' + (it.publicado ? " checked" : "") + '><span class="cmo-pista"></span><span class="cmo-switch-txt"><strong>Publicado</strong><small>Si está desmarcado se queda como borrador y solo lo ven los Responsables.</small></span></label></div>' +
      '<div class="cmo-checks" id="cmoAvisos" hidden><label class="cmo-switch"><input type="checkbox" id="cmoPush"><span class="cmo-pista"></span><span class="cmo-switch-txt"><strong>Avisar por notificación push</strong><small>Se envía a quienes tienen activadas las noticias. Solo al publicar; no se puede deshacer.</small></span></label>' +
      '<label class="cmo-switch"><input type="checkbox" id="cmoCorreo"><span class="cmo-pista"></span><span class="cmo-switch-txt"><strong>Avisar por correo al boletín</strong><small>Se envía a los suscriptores activos. Solo al publicar; no se puede deshacer.</small></span></label></div>' +
      '<div class="cmo-botones"><button type="button" class="cmo-btn cmo-primario" data-act="guardar">' + (nuevo ? "Guardar comunicado" : "Guardar cambios") + '</button>' +
      '<button type="button" class="cmo-btn" data-act="cancelar">Cancelar</button></div>';
    [["cmoTitulo", MAX.titulo], ["cmoResumen", MAX.resumen], ["cmoContenido", MAX.contenido]].forEach(([id, max]) => {
      const el = $(id);
      contador(id, max);
      if (el) el.addEventListener("input", () => { contador(id, max); pintarPrevia(); });
    });
    ["cmoTipo", "cmoFecha", "cmoFirma"].forEach((id) => {
      const el = $(id); if (el) { el.addEventListener("input", pintarPrevia); el.addEventListener("change", pintarPrevia); }
    });
    const yaPublicado = !!it.publicado;
    const actualizarAvisos = () => {
      // Los avisos solo cuentan en el paso de borrador a publicado: si ya estaba publicado, no se ofrecen.
      const ver = !yaPublicado && $("cmoPub").checked;
      $("cmoAvisos").hidden = !ver;
      if (!ver) { $("cmoPush").checked = false; $("cmoCorreo").checked = false; }
    };
    $("cmoPub").addEventListener("change", actualizarAvisos);
    actualizarAvisos();
    pintarPrevia();
    $("cmoTitulo").focus();
    cont.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function cuerpoDe(it, cambios) {
    return Object.assign({
      tipo: it.tipo, fecha: it.fecha, titulo: it.titulo, resumen: it.resumen || "", contenido: it.contenido,
      firma: it.firma || "", fijado: !!it.fijado, publicado: !!it.publicado,
    }, cambios || {});
  }

  async function guardar() {
    const val = (id) => ($(id) ? $(id).value : "");
    const cuerpo = {
      tipo: val("cmoTipo"), fecha: val("cmoFecha"), titulo: val("cmoTitulo").trim(), resumen: val("cmoResumen").trim(),
      contenido: val("cmoContenido").trim(), firma: val("cmoFirma").trim(),
      fijado: $("cmoFijado").checked, publicado: $("cmoPub").checked,
    };
    const avisarPush = !!$("cmoPush") && $("cmoPush").checked;
    const avisarCorreo = !!$("cmoCorreo") && $("cmoCorreo").checked;
    if (!cuerpo.titulo) { toast("Falta el título", "error"); $("cmoTitulo").focus(); return; }
    if (cuerpo.titulo.length > MAX.titulo) { toast("El título es demasiado largo (máximo " + MAX.titulo + ")", "error"); return; }
    if (cuerpo.contenido.length < MIN_CONTENIDO) { toast("El texto es demasiado corto (mínimo " + MIN_CONTENIDO + " caracteres)", "error"); $("cmoContenido").focus(); return; }
    if (cuerpo.contenido.length > MAX.contenido) { toast("El texto es demasiado largo (máximo " + MAX.contenido + ")", "error"); return; }
    if (cuerpo.resumen.length > MAX.resumen) { toast("El resumen es demasiado largo (máximo " + MAX.resumen + ")", "error"); return; }
    const previo = editando === "nuevo" ? null : items.find((x) => x.id === editando);
    // Publicar un comunicado oficial (nuevo o que estaba en borrador) pide confirmación.
    if (cuerpo.publicado && !(previo && previo.publicado)) {
      const envios = (avisarPush ? ' Se enviará una notificación push.' : '') + (avisarCorreo ? ' Se enviará un correo al boletín.' : '');
      const ok = await confirmar('¿Publicar "' + cuerpo.titulo + '"? Quedará marcado como comunicado oficial del medio.' + envios, { textoConfirmar: "Publicar" });
      if (!ok) return;
      if (avisarPush) cuerpo.avisar_push = true;
      if (avisarCorreo) cuerpo.avisar_correo = true;
    }
    const btn = document.querySelector('#cmoForm [data-act="guardar"]');
    btn.disabled = true;
    try {
      if (editando === "nuevo") await apiFetch("/api/comunicados", { method: "POST", body: JSON.stringify(cuerpo) });
      else await apiFetch("/api/comunicados/" + encodeURIComponent(editando), { method: "PUT", body: JSON.stringify(cuerpo) });
      toast(cuerpo.publicado ? "Comunicado publicado" : "Guardado como borrador", "exito");
      editando = null; pintarFormulario(); await cargar();
    } catch (e) {
      toast(e.message || "No se pudo guardar", "error");
    } finally { btn.disabled = false; }
  }

  function confirmar(texto, opciones) {
    return window.EOF && window.EOF.confirmar
      ? window.EOF.confirmar(texto, opciones || {})
      : Promise.resolve(window.confirm(texto));
  }

  async function alternar(id) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const publicar = !it.publicado;
    const ok = await confirmar(
      publicar ? '¿Publicar "' + it.titulo + '"?' : '¿Retirar "' + it.titulo + '"? Volverá a ser un borrador.',
      { textoConfirmar: publicar ? "Publicar" : "Retirar" }
    );
    if (!ok) return;
    try {
      await apiFetch("/api/comunicados/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(cuerpoDe(it, { publicado: publicar })) });
      toast(publicar ? "Comunicado publicado" : "Comunicado retirado (borrador)", "exito");
      await cargar();
    } catch (e) { toast(e.message || "No se pudo cambiar el estado", "error"); }
  }

  async function borrar(id) {
    const it = items.find((x) => x.id === id);
    const ok = await confirmar('¿Borrar "' + (it ? it.titulo : "") + '"? No se puede deshacer. Si solo quieres que deje de verse, usa Retirar.', { tipo: "peligro", peligroso: true, textoConfirmar: "Borrar" });
    if (!ok) return;
    try {
      await apiFetch("/api/comunicados/" + encodeURIComponent(id), { method: "DELETE" });
      toast("Comunicado borrado", "exito");
      if (editando === id) { editando = null; pintarFormulario(); }
      await cargar();
    } catch (e) { toast(e.message || "No se pudo borrar", "error"); }
  }

  async function fijar(id) {
    const it = items.find((x) => x.id === id);
    if (!it || !it.publicado) return;
    const quiere = !it.fijado;
    const otro = quiere ? items.find((x) => x.fijado && x.publicado && x.id !== id) : null;
    const ok = await confirmar(
      quiere ? '¿Fijar "' + it.titulo + '"? Saldrá el primero y como aviso en la portada.' + (otro ? ' Se desfijará "' + otro.titulo + '".' : "") : '¿Quitar "' + it.titulo + '" de fijado?',
      { textoConfirmar: quiere ? "Fijar" : "Desfijar" }
    );
    if (!ok) return;
    try {
      await apiFetch("/api/comunicados/" + encodeURIComponent(id), { method: "PUT", body: JSON.stringify(cuerpoDe(it, { fijado: quiere })) });
      toast(quiere ? "Comunicado fijado" : "Comunicado desfijado", "exito");
      await cargar();
    } catch (e) { toast(e.message || "No se pudo cambiar el fijado", "error"); }
  }

  // Botón "Lista" del editor: pone "- " delante de cada línea seleccionada (o la actual); si ya la tienen, se lo quita.
  function convertirEnLista() {
    const ta = $("cmoContenido");
    if (!ta) return;
    const v = ta.value;
    let ini = v.lastIndexOf("\n", ta.selectionStart - 1) + 1;
    let fin = v.indexOf("\n", ta.selectionEnd);
    if (fin < 0) fin = v.length;
    const lineas = v.slice(ini, fin).split("\n");
    const todas = lineas.every((l) => /^\s*-\s/.test(l) || !l.trim());
    const nuevas = lineas.map((l) => !l.trim() ? l : todas ? l.replace(/^(\s*)-\s/, "$1") : "- " + l.replace(/^\s*[-•*]\s+/, ""));
    ta.value = v.slice(0, ini) + nuevas.join("\n") + v.slice(fin);
    ta.focus();
    ta.setSelectionRange(ini, ini + nuevas.join("\n").length);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ---------- Compartir en redes ----------
  // Mismo formato que "Compartir en redes" de las noticias: cabecera con emoji | ElOtroFútbol, titular,
  // enlace y hashtags. Reutiliza las clases del modal de compartir del panel (admin.css).
  const CABECERA_RED = { comunicado: "📣 COMUNICADO OFICIAL", aviso: "⚠️ AVISO", rectificacion: "✏️ RECTIFICACIÓN", novedad: "🆕 NOVEDAD" };
  const HASHTAG_TIPO = { comunicado: "#Comunicado", aviso: "#Aviso", rectificacion: "#Rectificacion", novedad: "#Novedad" };
  const SITIO = (typeof SITIO_PUBLICO_URL === "string" && SITIO_PUBLICO_URL) || "https://elotrofutbol.media";
  const ICO_COPIAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';

  function textosRedes(it) {
    const cab = CABECERA_RED[it.tipo] || CABECERA_RED.comunicado;
    const link = SITIO + "/comunicados/" + encodeURIComponent(it.slug);
    const tag = HASHTAG_TIPO[it.tipo] || "#Comunicado";
    const x = cab + " | ElOtroFútbol\n\n" + it.titulo + "\n\n🔗 " + link + "\n\n" + tag + " #ElOtroFutbolTV";
    const ig = cab + " | ElOtroFútbol\n\n" + it.titulo + "\n\n" + (it.resumen ? it.resumen + "\n\n" : "") +
      "Comunicado completo en el enlace de nuestra biografía 🔗\n\n" + tag + " #ElOtroFutbolTV #Futbol";
    return { link: link, x: x, ig: ig };
  }

  function asegurarModalCompartir() {
    let m = $("cmoModalCompartir");
    if (m) return m;
    m = document.createElement("div");
    m.className = "modal-overlay";
    m.id = "cmoModalCompartir";
    m.innerHTML =
      '<div class="modal-caja modal-caja-compartir" role="dialog" aria-modal="true" aria-labelledby="cmoCompTitulo">' +
      '<button type="button" class="modal-cerrar" data-cmo-cerrar aria-label="Cerrar">&times;</button>' +
      '<h3 class="titulo-subseccion" id="cmoCompTitulo">📢 Compartir comunicado en redes</h3>' +
      '<div class="compartir-cuerpo">' +
      '<p class="ayuda-editor" style="margin-top:0;">Texto ya preparado para cada red. Cópialo (o ábrelo directamente en X). El comunicado es solo texto: no hay imagen de portada.</p>' +
      '<div class="compartir-link-caja"><input type="text" id="cmoCompLink" readonly><button type="button" class="btn-secundari" data-cmo-copiar="cmoCompLink">Copiar enlace</button></div>' +
      '<div class="compartir-lista">' +
      '<div class="compartir-red"><div class="compartir-red-cabecera"><span class="compartir-red-nombre">X (Twitter)</span></div>' +
      '<textarea id="cmoCompX"></textarea><div class="compartir-red-contador" id="cmoCompContador">0 / 280</div>' +
      '<div class="compartir-red-acciones"><button type="button" data-cmo-copiar="cmoCompX">' + ICO_COPIAR + '<span>Copiar texto</span></button>' +
      '<button type="button" id="cmoCompAbrirX">Abrir en X ya rellenado ↗</button></div></div>' +
      '<div class="compartir-red"><div class="compartir-red-cabecera"><span class="compartir-red-nombre">Instagram</span></div>' +
      '<textarea id="cmoCompIg"></textarea>' +
      '<div class="compartir-red-acciones"><button type="button" data-cmo-copiar="cmoCompIg">' + ICO_COPIAR + '<span>Copiar texto</span></button>' +
      '<button type="button" id="cmoCompAbrirIg">Abrir Instagram ↗</button></div>' +
      '<p class="compartir-ayuda">Instagram no permite prellenar el texto desde fuera de la app: copia el texto y pégalo al crear la publicación.</p></div>' +
      '</div></div></div>';
    document.body.appendChild(m);
    const cerrar = () => m.classList.remove("abierto");
    m.addEventListener("click", (ev) => {
      if (ev.target === m || ev.target.closest("[data-cmo-cerrar]")) { cerrar(); return; }
      const bc = ev.target.closest("[data-cmo-copiar]");
      if (!bc) return;
      const campo = $(bc.dataset.cmoCopiar);
      const span = bc.querySelector("span");
      const txt = span ? span.textContent : bc.textContent;
      const listo = () => {
        if (span) span.textContent = "Copiado ✓"; else bc.textContent = "Copiado ✓";
        setTimeout(() => { if (span) span.textContent = txt; else bc.textContent = txt; }, 2000);
      };
      (navigator.clipboard ? navigator.clipboard.writeText(campo.value) : Promise.reject()).then(listo).catch(() => {
        campo.select(); try { document.execCommand("copy"); listo(); } catch (_) { toast("No se pudo copiar", "error"); }
      });
    });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") cerrar(); });
    $("cmoCompX").addEventListener("input", contadorX);
    $("cmoCompAbrirX").addEventListener("click", () => {
      window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent($("cmoCompX").value), "_blank", "noopener");
    });
    $("cmoCompAbrirIg").addEventListener("click", () => {
      window.open("https://www.instagram.com/elotrofutboltv_/", "_blank", "noopener");
    });
    return m;
  }

  function contadorX() {
    const n = $("cmoCompX").value.length;
    const c = $("cmoCompContador");
    c.textContent = n + " / 280";
    c.classList.toggle("limite", n > 280);
  }

  function compartir(id) {
    const it = items.find((x) => x.id === id);
    if (!it || !it.publicado || !it.slug) { toast("Solo se pueden compartir comunicados publicados", "error"); return; }
    const m = asegurarModalCompartir();
    const t = textosRedes(it);
    $("cmoCompLink").value = t.link;
    $("cmoCompX").value = t.x;
    $("cmoCompIg").value = t.ig;
    contadorX();
    m.classList.add("abierto");
  }

  function iniciar() {
    const panel = $("panel-comunicados");
    if (!panel) return;
    panel.addEventListener("click", (ev) => {
      const f = ev.target.closest("[data-filtro]");
      if (f) { filtro = f.dataset.filtro; pintarLista(); return; }
      const tp = ev.target.closest("[data-tipo]");
      if (tp) { filtroTipo = tp.dataset.tipo; pintarLista(); return; }
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      const fila = b.closest("[data-id]");
      const act = b.dataset.act;
      if (act === "nuevo") { editando = "nuevo"; pintarFormulario(); }
      else if (act === "editar" && fila) { editando = fila.dataset.id; pintarFormulario(); }
      else if (act === "alternar" && fila) alternar(fila.dataset.id);
      else if (act === "borrar" && fila) borrar(fila.dataset.id);
      else if (act === "compartir" && fila) compartir(fila.dataset.id);
      else if (act === "fijar" && fila) fijar(fila.dataset.id);
      else if (act === "lista") convertirEnLista();
      else if (act === "guardar") guardar();
      else if (act === "cancelar") { editando = null; pintarFormulario(); }
      else if (act === "reintentar") cargar();
    });
    panel.addEventListener("input", (ev) => {
      if (ev.target && ev.target.id === "cmoBuscar") { consulta = quitarTildes(ev.target.value.trim()); pintarFilas(); }
    });
    const tab = $("tabComunicados");
    if (tab) tab.addEventListener("click", () => { if (!cargado) cargar(); });
    if (tab && tab.classList.contains("activo")) cargar();
    // Entrada por menú lateral o por URL: el panel se activa sin pasar por el clic del botón.
    if (panel.classList.contains("activo")) cargar();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
