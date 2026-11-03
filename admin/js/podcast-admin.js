// ---------- Pestaña "Podcast" del panel ----------
// Backend: /api/podcast* (worker/src/index.js y worker-secondary/src/index.js).
// Depende de globales de admin.js / ui-alertas.js: apiFetch(path, options), window.EOF.toast / confirmar.
(function () {
  "use strict";

  let items = [];
  let editando = null; // id en edición, o "nuevo"
  let cargado = false;

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const toast = (m, tipo) => { if (window.EOF && window.EOF.toast) window.EOF.toast(m, tipo || "info"); };
  const TIPOS = { episodio: "Episodio", entrevista: "Entrevista", clip: "Clip" };
  const PLAT = { youtube: "YouTube", spotify: "Spotify", ivoox: "iVoox", audio: "Audio" };

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

  function pintarLista() {
    const cont = $("pcAdminLista");
    if (!items.length) {
      cont.innerHTML = '<p class="pca-vacio">Todavía no hay nada publicado. Pulsa <b>+ Nuevo</b> para añadir el primer episodio, entrevista o clip.</p>';
      return;
    }
    cont.innerHTML = items.map((it) => {
      const img = it.portada ? '<img src="' + esc(it.portada) + '" alt="" loading="lazy">' : '<span class="pca-sin">' + esc((TIPOS[it.tipo] || "")[0] || "·") + "</span>";
      const plat = it.embed ? PLAT[it.embed.plataforma] || "" : "Sin enlace";
      return '<div class="pca-fila" data-id="' + esc(it.id) + '">' +
        '<div class="pca-thumb">' + img + "</div>" +
        '<div class="pca-info"><strong>' + esc(it.titulo) + "</strong>" +
        '<span>' + esc(TIPOS[it.tipo] || it.tipo) + " · " + esc(it.fecha) + " · " + esc(plat) + "</span>" +
        '<span class="pca-chips">' +
        (it.destacado ? '<em class="pca-chip dest">Destacado</em>' : "") +
        (it.publicado ? "" : '<em class="pca-chip borr">Borrador</em>') + "</span></div>" +
        '<div class="pca-acc"><button type="button" class="pca-btn" data-act="editar">Editar</button>' +
        '<button type="button" class="pca-btn pca-peligro" data-act="borrar">Borrar</button></div></div>';
    }).join("");
  }

  function campo(id, etiqueta, valor, extra) {
    return '<label class="pca-campo"><span>' + etiqueta + '</span><input id="' + id + '" value="' + esc(valor) + '" ' + (extra || "") + "></label>";
  }

  function pintarFormulario() {
    const cont = $("pcAdminForm");
    if (editando === null) { cont.innerHTML = ""; cont.hidden = true; return; }
    const it = editando === "nuevo" ? { tipo: "episodio", fecha: new Date().toISOString().slice(0, 10), publicado: true } : items.find((x) => x.id === editando) || {};
    cont.hidden = false;
    cont.innerHTML =
      '<h3>' + (editando === "nuevo" ? "Nuevo contenido" : "Editar contenido") + "</h3>" +
      '<div class="pca-grid">' +
      '<label class="pca-campo"><span>Tipo</span><select id="pcTipo">' +
      Object.keys(TIPOS).map((k) => '<option value="' + k + '"' + (it.tipo === k ? " selected" : "") + ">" + TIPOS[k] + "</option>").join("") + "</select></label>" +
      campo("pcFecha", "Fecha", it.fecha || "", 'type="date"') +
      '<div class="pca-ancho">' + campo("pcTitulo", "Título *", it.titulo || "", 'maxlength="150"') + "</div>" +
      '<div class="pca-ancho">' + campo("pcEnlace", "Enlace (YouTube, Spotify, iVoox o .mp3)", enlaceDe(it), 'placeholder="https://www.youtube.com/watch?v=..." inputmode="url"') + "</div>" +
      '<label class="pca-campo pca-ancho"><span>Descripción</span><textarea id="pcDesc" rows="4" maxlength="2000">' + esc(it.descripcion || "") + "</textarea></label>" +
      campo("pcDur", "Duración (ej. 42:10)", it.duracion || "", 'maxlength="12"') +
      campo("pcInv", "Invitado", it.invitado || "", 'maxlength="100"') +
      campo("pcTemp", "Temporada", it.temporada || "", 'type="number" min="1"') +
      campo("pcNum", "Nº de episodio", it.numero || "", 'type="number" min="1"') +
      '<div class="pca-ancho">' + campo("pcPortada", "Portada (URL https, opcional; en YouTube se usa la del vídeo)", it.embed && it.embed.plataforma === "youtube" && /ytimg\.com/.test(it.portada || "") ? "" : (it.portada || ""), 'placeholder="https://..." inputmode="url"') + "</div>" +
      "</div>" +
      '<div class="pca-checks"><label><input type="checkbox" id="pcDest"' + (it.destacado ? " checked" : "") + "> Destacado (sale en grande)</label>" +
      '<label><input type="checkbox" id="pcPub"' + (it.publicado !== false ? " checked" : "") + "> Publicado</label></div>" +
      '<div class="pca-botones"><button type="button" class="pca-btn pca-primario" data-act="guardar">Guardar</button>' +
      '<button type="button" class="pca-btn" data-act="cancelar">Cancelar</button></div>';
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
