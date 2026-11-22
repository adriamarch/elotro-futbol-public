// ---------- Pestaña "Podcast" del panel ----------
// Backend: /api/podcast* (worker/src/index.js y worker-secondary/src/index.js).
// Depende de globales de admin.js / ui-alertas.js: apiFetch(path, options), window.EOF.toast / confirmar.
(function () {
  "use strict";

  let items = [];
  let editando = null; // id en edición, o "nuevo"
  let cargado = false;
  let filtro = "todos"; // todos | episodio | entrevista | clip | borrador

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const toast = (m, tipo) => { if (window.EOF && window.EOF.toast) window.EOF.toast(m, tipo || "info"); };
  const TIPOS = { episodio: "Episodio", entrevista: "Entrevista", clip: "Clip" };
  const PLAT = { youtube: "YouTube", spotify: "Spotify", ivoox: "iVoox", audio: "Audio" };
  const ICO = {
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.8v3.4M16 2.8v3.4M3 10h18"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    estrella: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.1 6.3 20.3l1.2-6.4-4.7-4.4 6.4-.8z"/></svg>',
    lapiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/></svg>',
    papelera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.2a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L18 7M9 7V4.5h6V7"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 10.5a7 7 0 0 0 14 0M12 17.5v4"/></svg>',
  };
  const fechaCorta = (f) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f || ""));
    if (!m) return esc(f || "Sin fecha");
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return esc(d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }).replace(/\./g, ""));
  };

  function enlaceDe(it) {
    const e = it.embed;
    if (!e) return "";
    if (e.plataforma === "youtube") return "https://www.youtube.com/watch?v=" + e.id;
    if (e.plataforma === "spotify") return "https://open.spotify.com/" + e.id;
    if (e.plataforma === "audio") return e.url;
    return "";
  }

  async function cargar() {
    const cont = $("pcAdminLista");
    if (!cont) return;
    try {
      const r = await apiFetch("/api/podcast/admin");
      items = Array.isArray(r.items) ? r.items : [];
      cargado = true;
      pintarLista();
    } catch (e) {
      cont.innerHTML = '<p class="pca-vacio">No se pudo cargar el podcast: ' + esc(e.message || "error") + "</p>";
    }
  }

  function pintarResumen() {
    const cont = $("pcAdminResumen");
    if (!cont) return;
    if (!items.length) { cont.hidden = true; cont.innerHTML = ""; return; }
    const n = (fn) => items.filter(fn).length;
    const stats = [
      ["Total", items.length, "tot"],
      ["Publicados", n((x) => x.publicado), "pub"],
      ["Borradores", n((x) => !x.publicado), "bor"],
      ["Destacados", n((x) => x.destacado), "des"],
    ];
    const filtros = [
      ["todos", "Todos", items.length],
      ["episodio", "Episodios", n((x) => x.tipo === "episodio")],
      ["entrevista", "Entrevistas", n((x) => x.tipo === "entrevista")],
      ["clip", "Clips", n((x) => x.tipo === "clip")],
      ["borrador", "Borradores", n((x) => !x.publicado)],
    ];
    cont.hidden = false;
    cont.innerHTML =
      '<div class="pca-stats">' + stats.map((s) => '<div class="pca-stat pca-stat-' + s[2] + '"><b>' + s[1] + "</b><span>" + s[0] + "</span></div>").join("") + "</div>" +
      '<div class="pca-filtros" role="tablist" aria-label="Filtrar contenido">' +
      filtros.map((f) => '<button type="button" role="tab" class="pca-filtro' + (filtro === f[0] ? " activo" : "") + '" data-filtro="' + f[0] + '" aria-selected="' + (filtro === f[0]) + '">' + f[1] + " <i>" + f[2] + "</i></button>").join("") + "</div>";
  }

  function visibles() {
    return items.filter((it) => filtro === "todos" ? true : filtro === "borrador" ? !it.publicado : it.tipo === filtro);
  }

  function pintarLista() {
    const cont = $("pcAdminLista");
    pintarResumen();
    if (!items.length) {
      cont.innerHTML = '<div class="pca-vacio pca-vacio-grande"><span class="pca-vacio-ico">' + ICO.mic + '</span><strong>Todavía no hay nada publicado</strong><p>Pulsa <b>Nuevo</b> para añadir el primer episodio, entrevista o clip.</p></div>';
      return;
    }
    const lista = visibles();
    if (!lista.length) {
      cont.innerHTML = '<div class="pca-vacio"><p>No hay contenido en este filtro.</p></div>';
      return;
    }
    cont.innerHTML = lista.map((it) => {
      const img = it.portada ? '<img src="' + esc(it.portada) + '" alt="" loading="lazy">' : (window.EOFPortadaPodcast ? window.EOFPortadaPodcast.html(it) : '<span class="pca-sin">' + ICO.mic + "</span>");
      const plat = it.embed ? PLAT[it.embed.plataforma] || "" : "";
      const meta = [
        '<span class="pca-meta">' + ICO.cal + fechaCorta(it.fecha) + "</span>",
        it.duracion ? '<span class="pca-meta">' + ICO.reloj + esc(it.duracion) + "</span>" : "",
        it.invitado ? '<span class="pca-meta">' + ICO.user + esc(it.invitado) + "</span>" : "",
        '<span class="pca-meta' + (plat ? "" : " pca-meta-aviso") + '">' + ICO.link + esc(plat || "Sin enlace") + "</span>",
        (it.temporada || it.numero) ? '<span class="pca-meta pca-meta-num">' + (it.temporada ? "T" + esc(it.temporada) : "") + (it.temporada && it.numero ? " · " : "") + (it.numero ? "Ep. " + esc(it.numero) : "") + "</span>" : "",
      ].join("");
      return '<article class="pca-fila' + (it.publicado ? "" : " pca-borrador") + (it.destacado ? " pca-destacada" : "") + '" data-id="' + esc(it.id) + '">' +
        '<div class="pca-thumb">' + img + (it.embed ? '<span class="pca-play">' + ICO.play + "</span>" : "") + '<em class="pca-tipo pca-tipo-' + esc(it.tipo) + '">' + esc(TIPOS[it.tipo] || it.tipo) + "</em></div>" +
        '<div class="pca-info"><div class="pca-titulo-fila"><strong title="' + esc(it.titulo) + '">' + esc(it.titulo) + "</strong>" +
        '<span class="pca-chips">' +
        (it.destacado ? '<em class="pca-chip dest">' + ICO.estrella + "Destacado</em>" : "") +
        (it.publicado ? '<em class="pca-chip pub"><i></i>Publicado</em>' : '<em class="pca-chip borr">Borrador</em>') + "</span></div>" +
        (it.descripcion ? '<p class="pca-desc">' + esc(it.descripcion) + "</p>" : "") +
        '<div class="pca-metas">' + meta + "</div></div>" +
        '<div class="pca-acc"><button type="button" class="pca-btn pca-btn-ico" data-act="editar" title="Editar">' + ICO.lapiz + '<span>Editar</span></button>' +
        '<button type="button" class="pca-btn pca-btn-ico pca-peligro" data-act="borrar" title="Borrar">' + ICO.papelera + "<span>Borrar</span></button></div></article>";
    }).join("");
  }

  function campo(id, etiqueta, valor, extra) {
    return '<label class="pca-campo"><span>' + etiqueta + '</span><input id="' + id + '" value="' + esc(valor) + '" ' + (extra || "") + "></label>";
  }

  // Vista previa de la portada dentro del formulario: la propia (URL) o, si no hay, la automática de la marca.
  function pintarPrevia(base) {
    const cont = $("pcPrev"); if (!cont) return;
    const val = (id) => ($(id) ? $(id).value.trim() : "");
    const url = val("pcPortada");
    const enlace = val("pcEnlace");
    const ytOriginal = base.embed && base.embed.plataforma === "youtube" && enlace && enlace === enlaceDe(base) ? (base.portada || "") : "";
    const propia = /^https:\/\//i.test(url) ? url : ytOriginal;
    const datos = { id: base.id || "nuevo", tipo: val("pcTipo") || base.tipo, titulo: val("pcTitulo"), temporada: val("pcTemp"), numero: val("pcNum"), invitado: val("pcInv") };
    cont.innerHTML = propia
      ? '<img src="' + esc(propia) + '" alt="">'
      : (window.EOFPortadaPodcast ? window.EOFPortadaPodcast.html(datos) : '<span class="pca-sin">' + ICO.mic + "</span>");
    const nota = $("pcPrevNota");
    if (nota) nota.textContent = propia ? "Portada propia (la URL que has puesto)." : "Portada automática de ELOTROFÚTBOLTV: se genera con el tipo, el número y el título. Pon una URL arriba para usar otra.";
  }

  function pintarFormulario() {
    const cont = $("pcAdminForm");
    if (editando === null) { cont.innerHTML = ""; cont.hidden = true; return; }
    const it = editando === "nuevo" ? { tipo: "episodio", fecha: new Date().toISOString().slice(0, 10), publicado: true } : items.find((x) => x.id === editando) || {};
    cont.hidden = false;
    cont.innerHTML =
      '<div class="pca-form-cab"><span class="pca-form-ico">' + (editando === "nuevo" ? ICO.mic : ICO.lapiz) + '</span><div><h3>' + (editando === "nuevo" ? "Nuevo contenido" : "Editar contenido") + '</h3><p>Los campos con * son obligatorios.</p></div>' +
      '<button type="button" class="pca-cerrar" data-act="cancelar" aria-label="Cerrar">✕</button></div>' +
      '<div class="pca-seccion">Contenido</div>' +
      '<div class="pca-grid">' +
      '<label class="pca-campo"><span>Tipo</span><select id="pcTipo">' +
      Object.keys(TIPOS).map((k) => '<option value="' + k + '"' + (it.tipo === k ? " selected" : "") + ">" + TIPOS[k] + "</option>").join("") + "</select></label>" +
      campo("pcFecha", "Fecha", it.fecha || "", 'type="date"') +
      '<div class="pca-ancho">' + campo("pcTitulo", "Título *", it.titulo || "", 'maxlength="150"') + "</div>" +
      '<div class="pca-ancho">' + campo("pcEnlace", "Enlace (YouTube, Spotify, iVoox o .mp3)", enlaceDe(it), 'placeholder="https://www.youtube.com/watch?v=..." inputmode="url"') + "</div>" +
      '<label class="pca-campo pca-ancho"><span>Descripción</span><textarea id="pcDesc" rows="4" maxlength="2000">' + esc(it.descripcion || "") + "</textarea></label>" +
      '<div class="pca-seccion pca-ancho">Detalles</div>' +
      campo("pcDur", "Duración (ej. 42:10)", it.duracion || "", 'maxlength="12"') +
      campo("pcInv", "Invitado", it.invitado || "", 'maxlength="100"') +
      campo("pcTemp", "Temporada", it.temporada || "", 'type="number" min="1"') +
      campo("pcNum", "Nº de episodio", it.numero || "", 'type="number" min="1"') +
      '<div class="pca-ancho">' + campo("pcPortada", "Portada (URL https, opcional; en YouTube se usa la del vídeo)", it.embed && it.embed.plataforma === "youtube" && /ytimg\.com/.test(it.portada || "") ? "" : (it.portada || ""), 'placeholder="https://..." inputmode="url"') + "</div>" +
      '<div class="pca-ancho pca-prev"><span class="pca-prev-etq">Así se verá la portada</span><div class="pca-thumb pca-prev-thumb" id="pcPrev"></div><small class="pca-prev-nota" id="pcPrevNota"></small></div>' +
      "</div>" +
      '<div class="pca-seccion">Visibilidad</div>' +
      '<div class="pca-checks"><label class="pca-switch"><input type="checkbox" id="pcDest"' + (it.destacado ? " checked" : "") + '><span class="pca-pista"></span><span class="pca-switch-txt"><strong>Destacado</strong><small>Sale en grande en /podcast</small></span></label>' +
      '<label class="pca-switch"><input type="checkbox" id="pcPub"' + (it.publicado !== false ? " checked" : "") + '><span class="pca-pista"></span><span class="pca-switch-txt"><strong>Publicado</strong><small>Visible para los lectores</small></span></label></div>' +
      '<div class="pca-botones"><button type="button" class="pca-btn pca-primario" data-act="guardar">Guardar</button>' +
      '<button type="button" class="pca-btn" data-act="cancelar">Cancelar</button></div>';
    ['pcTipo', 'pcTitulo', 'pcEnlace', 'pcPortada', 'pcTemp', 'pcNum', 'pcInv'].forEach((id) => {
      const el = $(id); if (el) { el.addEventListener('input', () => pintarPrevia(it)); el.addEventListener('change', () => pintarPrevia(it)); }
    });
    pintarPrevia(it);
    $("pcTitulo").focus();
    cont.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function guardar() {
    const val = (id) => ($(id) ? $(id).value.trim() : "");
    const cuerpo = {
      tipo: val("pcTipo"), fecha: val("pcFecha"), titulo: val("pcTitulo"), enlace: val("pcEnlace"), descripcion: val("pcDesc"),
      duracion: val("pcDur"), invitado: val("pcInv"), temporada: val("pcTemp"), numero: val("pcNum"), portada: val("pcPortada"),
      destacado: $("pcDest").checked, publicado: $("pcPub").checked,
    };
    if (!cuerpo.titulo) { toast("Falta el título", "error"); return; }
    const btn = document.querySelector('#pcAdminForm [data-act="guardar"]');
    btn.disabled = true;
    try {
      if (editando === "nuevo") await apiFetch("/api/podcast", { method: "POST", body: JSON.stringify(cuerpo) });
      else await apiFetch("/api/podcast/" + encodeURIComponent(editando), { method: "PUT", body: JSON.stringify(cuerpo) });
      toast("Guardado", "exito");
      editando = null; pintarFormulario(); await cargar();
    } catch (e) {
      toast(e.message || "No se pudo guardar", "error");
    } finally { btn.disabled = false; }
  }

  async function borrar(id) {
    const it = items.find((x) => x.id === id);
    const ok = await (window.EOF && window.EOF.confirmar
      ? window.EOF.confirmar('¿Borrar "' + (it ? it.titulo : "") + '"? No se puede deshacer.', { tipo: "peligro" })
      : Promise.resolve(window.confirm("¿Borrar este contenido?")));
    if (!ok) return;
    try {
      await apiFetch("/api/podcast/" + encodeURIComponent(id), { method: "DELETE" });
      toast("Borrado", "exito");
      await cargar();
    } catch (e) { toast(e.message || "No se pudo borrar", "error"); }
  }

  function iniciar() {
    const panel = $("panel-podcast");
    if (!panel) return;
    panel.addEventListener("click", (ev) => {
      const f = ev.target.closest("[data-filtro]");
      if (f) { filtro = f.dataset.filtro; pintarLista(); return; }
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      const fila = b.closest("[data-id]");
      const act = b.dataset.act;
      if (act === "nuevo") { editando = "nuevo"; pintarFormulario(); }
      else if (act === "editar" && fila) { editando = fila.dataset.id; pintarFormulario(); }
      else if (act === "borrar" && fila) borrar(fila.dataset.id);
      else if (act === "guardar") guardar();
      else if (act === "cancelar") { editando = null; pintarFormulario(); }
    });
    const tab = $("tabPodcast");
    if (tab) tab.addEventListener("click", () => { if (!cargado) cargar(); });
    if (tab && tab.classList.contains("activo")) cargar();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
