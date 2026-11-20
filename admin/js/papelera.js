// ---------- Papelera (borrado recuperable) ----------
// Pestaña "Papelera" del panel: noticias y archivos eliminados, recuperables
// durante unos días. Backend: /api/papelera* (worker y worker-secondary; esquema en
// worker/migracion_papelera.sql):
//   GET    /api/papelera                -> { items, dias, es_admin }  (admin: todo; el resto: lo que borró)
//   POST   /api/papelera/:id/restaurar  -> noticia vuelve como BORRADOR; archivo, a la mediateca
//   DELETE /api/papelera/:id            -> borrado definitivo (solo admin)
// Depende de globales de admin.js: apiFetch(path, options), window.EOF.toast / EOF.confirmar.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const toast = (m, t) => { if (window.EOF && window.EOF.toast) window.EOF.toast(m, t || "info"); };
  const ICONO = {
    articulo: '<path d="M19 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z"/><path d="M8 9h8M8 13h8M8 17h4"/>',
    media: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
  };
  const svg = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";

  let items = [];
  let esAdmin = false;
  let filtro = "todos"; // todos | articulo | media
  let ocupado = new Set();

  // SQLite guarda "YYYY-MM-DD HH:MM:SS" en UTC; purgar_despues ya viene en ISO.
  const aFecha = (s) => new Date(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : String(s).replace(" ", "T") + "Z");
  function hace(s) {
    const min = Math.max(0, Math.round((Date.now() - aFecha(s).getTime()) / 60000));
    if (min < 1) return "hace un momento";
    if (min < 60) return "hace " + min + " min";
    const h = Math.round(min / 60);
    if (h < 24) return "hace " + h + (h === 1 ? " hora" : " horas");
    const d = Math.round(h / 24);
    return "hace " + d + (d === 1 ? " día" : " días");
  }
  function quedan(s) {
    const d = Math.ceil((aFecha(s).getTime() - Date.now()) / 86400000);
    if (d <= 0) return { texto: "Se borrará hoy", urgente: true };
    return { texto: "Se borra definitivamente en " + d + (d === 1 ? " día" : " días"), urgente: d <= 3 };
  }

  function tarjeta(it) {
    const q = quedan(it.purgar_despues);
    const esNoticia = it.tipo === "articulo";
    const icono = esNoticia ? ICONO.articulo : (it.subtipo === "video" ? ICONO.video : ICONO.media);
    const mini = it.miniatura
      ? '<img src="' + esc(it.miniatura) + '" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'pap-mini-vacia\'}))">'
      : '<span class="pap-mini-vacia">' + svg(icono) + "</span>";
    const quien = it.eliminado_por_nombre ? " por " + esc(it.eliminado_por_nombre) : "";
    const bloqueado = ocupado.has(it.id) ? " disabled" : "";
    return '<li class="pap-item" data-id="' + it.id + '">' +
      '<div class="pap-mini">' + mini + "</div>" +
      '<div class="pap-cuerpo">' +
        '<div class="pap-tipo">' + svg(icono) + (esNoticia ? "Noticia" : (it.subtipo === "video" ? "Vídeo" : "Foto")) + "</div>" +
        '<div class="pap-titulo">' + esc(it.titulo || "(sin título)") + "</div>" +
        '<div class="pap-meta">Eliminada ' + hace(it.created_at) + quien + ' · <span class="' + (q.urgente ? "pap-urgente" : "") + '">' + q.texto + "</span></div>" +
      "</div>" +
      '<div class="pap-acciones">' +
        '<button type="button" class="pap-btn pap-restaurar" data-act="restaurar"' + bloqueado + ">Restaurar</button>" +
        (esAdmin ? '<button type="button" class="pap-btn pap-borrar" data-act="borrar"' + bloqueado + ">Borrar ya</button>" : "") +
      "</div></li>";
  }

  function pintar() {
    const lista = $("papLista");
    if (!lista) return;
    const visibles = items.filter((i) => filtro === "todos" || i.tipo === filtro);
    const n = (t) => items.filter((i) => t === "todos" || i.tipo === t).length;
    document.querySelectorAll("#papFiltros button").forEach((b) => {
      b.classList.toggle("activo", b.dataset.filtro === filtro);
      b.setAttribute("aria-pressed", String(b.dataset.filtro === filtro));
      const c = b.querySelector(".pap-n");
      if (c) c.textContent = n(b.dataset.filtro);
    });
    lista.innerHTML = visibles.length
      ? visibles.map(tarjeta).join("")
      : '<li class="pap-vacio">' + svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.2a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L18 7M9 7V4.5h6V7"/>') +
        "<p>" + (items.length ? "No hay nada de este tipo en la papelera." : "La papelera está vacía.") + "</p></li>";
  }

  async function cargar() {
    const lista = $("papLista");
    if (lista && !items.length) lista.innerHTML = '<li class="pap-vacio"><p>Cargando…</p></li>';
    try {
      const r = await apiFetch("/api/papelera");
      items = r.items || [];
      esAdmin = !!r.es_admin;
      const dias = $("papDias");
      if (dias) dias.textContent = r.dias || 30;
      const aviso = $("papAvisoAdmin");
      if (aviso) aviso.hidden = !esAdmin;
      pintar();
    } catch (err) {
      if (lista) lista.innerHTML = '<li class="pap-vacio"><p>No se pudo cargar la papelera: ' + esc(err.message) + '</p><button type="button" class="pap-btn" data-act="reintentar">Reintentar</button></li>';
    }
  }

  async function restaurar(it) {
    ocupado.add(it.id); pintar();
    try {
      const r = await apiFetch("/api/papelera/" + it.id + "/restaurar", { method: "POST" });
      items = items.filter((x) => x.id !== it.id);
      if (it.tipo === "articulo") {
        // Si su enlace antiguo lo había ocupado otra noticia, vuelve con uno nuevo (lo avisa el servidor en r.slug).
        toast("Noticia restaurada como borrador.", "exito");
        if (typeof cargaListaArticulos === "function") cargaListaArticulos();
      } else {
        toast("Archivo restaurado en Contenido.", "exito");
        if (typeof cargaContenido === "function") cargaContenido();
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      ocupado.delete(it.id); pintar();
    }
  }

  async function borrarYa(it) {
    const ok = await EOF.confirmar(
      "¿Borrar «" + (it.titulo || "este elemento") + "» definitivamente? " + (it.tipo === "media" ? "El archivo se destruye también en Cloudinary. " : "") + "No se podrá recuperar.",
      { peligroso: true, textoConfirmar: "Borrar definitivamente" }
    );
    if (!ok) return;
    ocupado.add(it.id); pintar();
    try {
      await apiFetch("/api/papelera/" + it.id, { method: "DELETE" });
      items = items.filter((x) => x.id !== it.id);
      toast("Borrado definitivamente.", "exito");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      ocupado.delete(it.id); pintar();
    }
  }

  document.addEventListener("click", (e) => {
    const f = e.target.closest("#papFiltros button");
    if (f) { filtro = f.dataset.filtro; pintar(); return; }
    const b = e.target.closest("#panel-papelera [data-act]");
    if (!b) return;
    if (b.dataset.act === "reintentar") { cargar(); return; }
    const li = b.closest(".pap-item");
    const it = li && items.find((x) => x.id === Number(li.dataset.id));
    if (!it) return;
    if (b.dataset.act === "restaurar") restaurar(it);
    if (b.dataset.act === "borrar") borrarYa(it);
  });

  const pestana = $("tabPapelera");
  if (pestana) pestana.addEventListener("click", cargar);
})();
