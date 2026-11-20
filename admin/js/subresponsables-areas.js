// ---------- Sub-Responsables de ÁREAS (cargos que NO son grupos de trabajo) ----------
// FASE 2. Un Sub-Responsable de área (p. ej. «Sub-Responsable de las acreditaciones») es un redactor con un
// cargo visible y, según el área, un permiso. El área «las acreditaciones» existe siempre y da permiso para
// gestionar las SOLICITUDES de acreditación (no el PIN, el acceso, el formulario, la importación ni borrar).
// Las demás áreas que cree un Responsable son solo cargo.
// Backend: GET /api/subresponsables (cualquier sesión), PUT /api/subresponsables/asignar y
// PUT /api/subresponsables/areas (solo Responsable). Se guarda en `settings`, clave 'subresponsables_areas'.
// Dónde se ve: Funcionalidades > Información (sección «Sub-Responsables de áreas»).
// Depende de globales de admin.js: apiFetch, USER, USUARIOS_LISTA, renderTablaUsuarios, window.EOF.
(function () {
  "use strict";

  const MAX_PERSONAS = 5;
  const estado = { areas: [], cargado: false, error: null, enCurso: false };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m, t) => { try { window.EOF.toast(m, t || "info"); } catch { /* sin avisos */ } };
  const soyAdmin = () => typeof USER !== "undefined" && !!USER && USER.rol === "admin";
  // Los fotógrafos no tienen estas áreas (ni ven la sección).
  const veoAreas = () => typeof USER !== "undefined" && !!USER && USER.rol === "admin"; // solo Responsables; los redactores no ven esta sección
  const miId = () => (typeof USER !== "undefined" && USER ? Number(USER.id) : -1);
  const urlAvatar = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : "");
  const iniciales = (txt) => {
    const p = String(txt || "?").trim().split(/\s+/).filter(Boolean);
    const a = p[0] || "?";
    return (a[0] + (p.length > 1 ? p[1][0] : (a[1] || ""))).toUpperCase();
  };
  const avatarHTML = (m) => {
    const src = urlAvatar(m.avatar);
    return `<span class="gt-av" title="${esc(m.nombre)}">${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(iniciales(m.nombre))}</span>`;
  };
  const ICO_ESTRELLA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/></svg>';
  const ICO_CERRAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ETIQUETA_PERMISO = { acreditaciones: "Gestiona las solicitudes de acreditación" };

  function contenedor() { return document.getElementById("areasSubResponsables"); }

  // Redactores activos que se pueden nombrar (solo los ve un Responsable: viene de GET /api/users).
  async function redactoresActivos() {
    let lista = (typeof USUARIOS_LISTA !== "undefined" && Array.isArray(USUARIOS_LISTA)) ? USUARIOS_LISTA : [];
    if (!lista.length) {
      try { const r = await apiFetch("/api/users"); lista = (r && r.users) || []; } catch { lista = []; }
    }
    return lista.filter((u) => u.rol === "redactor" && Number(u.activo) === 1);
  }
  let candidatos = [];

  async function cargar() {
    const seccion = document.getElementById("infoAreasSub");
    if (seccion) seccion.hidden = !veoAreas();
    if (!veoAreas() || estado.enCurso) return;
    estado.enCurso = true;
    try {
      const r = await apiFetch("/api/subresponsables");
      if (!r || !Array.isArray(r.areas)) throw new Error("Respuesta no válida");
      estado.areas = r.areas; estado.cargado = true; estado.error = null;
      if (soyAdmin()) candidatos = await redactoresActivos();
    } catch (err) {
      estado.error = (err && err.message) || "No se han podido cargar las áreas";
    } finally {
      estado.enCurso = false;
    }
    pintar();
  }

  function selectorHTML(a) {
    const ya = new Set(a.miembros.map((m) => m.id));
    const libres = candidatos.filter((u) => !ya.has(Number(u.id))).sort((x, y) => String(x.nombre).localeCompare(String(y.nombre), "es"));
    if (a.miembros.length >= MAX_PERSONAS) return `<span class="sa-nota">Máximo ${MAX_PERSONAS} personas por área.</span>`;
    if (!libres.length) return `<span class="sa-nota">No quedan redactores por nombrar.</span>`;
    return `<label class="sa-anadir"><span class="sa-sr">Nombrar a alguien Sub-Responsable de ${esc(a.nombre)}</span>
      <select data-sa-anadir="${esc(a.id)}" aria-label="Nombrar Sub-Responsable de ${esc(a.nombre)}">
        <option value="">Nombrar a un redactor…</option>
        ${libres.map((u) => `<option value="${Number(u.id)}">${esc(u.nombre)}</option>`).join("")}
      </select></label>`;
  }

  function tarjetaHTML(a, admin) {
    const miembros = a.miembros.length
      ? `<ul class="sa-miembros">${a.miembros.map((m) => `<li${m.id === miId() ? ' class="sa-yo"' : ""}>${avatarHTML(m)}<span class="sa-mn">${esc(m.nombre)}${m.id === miId() ? " <em>(tú)</em>" : ""}</span>${admin ? `<button type="button" class="sa-quitar" data-sa-quitar="${esc(a.id)}" data-sa-user="${Number(m.id)}" aria-label="Quitar a ${esc(m.nombre)} como ${esc(a.titulo)}" title="Quitar">${ICO_CERRAR}</button>` : ""}</li>`).join("")}</ul>`
      : `<p class="gt-sin-miembros">Todavía no hay ningún Sub-Responsable.</p>`;
    const permiso = a.permiso && ETIQUETA_PERMISO[a.permiso]
      ? `<span class="sa-permiso" title="Este cargo da un permiso en el panel">${esc(ETIQUETA_PERMISO[a.permiso])}</span>`
      : `<span class="sa-permiso sa-permiso-no" title="Solo es un cargo: no cambia permisos">Solo cargo</span>`;
    return `<article class="gt-tarjeta sa-tarjeta" style="--gt:#1d6fd1">
      <header class="gt-tarjeta-cab">
        <span class="sa-ico">${ICO_ESTRELLA}</span>
        <div class="gt-tarjeta-tit"><h5 class="gt-nombre">${esc(a.titulo)}</h5>${permiso}</div>
      </header>
      ${miembros}
      ${admin ? `<footer class="gt-tarjeta-pie sa-pie">${selectorHTML(a)}${a.fija ? "" : `<button type="button" class="gt-btn gt-btn-peq sa-borrar" data-sa-borrar="${esc(a.id)}">Eliminar área</button>`}</footer>` : ""}
    </article>`;
  }

  function pintar() {
    const cont = contenedor();
    if (!cont) return;
    const seccion = document.getElementById("infoAreasSub");
    if (seccion) seccion.hidden = !veoAreas();
    if (!veoAreas()) { cont.innerHTML = ""; return; }
    if (!estado.cargado) {
      cont.innerHTML = estado.error
        ? `<div class="gt-vacio"><p>No se han podido cargar las áreas (${esc(estado.error)}).</p><button type="button" class="gt-btn" data-sa="reintentar">Reintentar</button></div>`
        : `<div class="gt-esqueleto" aria-busy="true" aria-label="Cargando áreas"><span></span><span></span></div>`;
      return;
    }
    const admin = soyAdmin();
    cont.innerHTML = `<div class="gt-rejilla sa-rejilla">${estado.areas.map((a) => tarjetaHTML(a, admin)).join("")}</div>` + (admin
      ? `<form class="sa-nueva" data-sa="nueva" autocomplete="off">
          <label for="saNuevaArea">Nueva área</label>
          <input id="saNuevaArea" type="text" maxlength="40" placeholder="Con artículo: el Diseño, las Redes Sociales…" aria-describedby="saNuevaAyuda">
          <button type="submit" class="gt-btn">Añadir área</button>
          <small id="saNuevaAyuda">Se leerá «Sub-Responsable del Diseño». Las áreas nuevas son solo un cargo; dan permisos «las acreditaciones» y las áreas llamadas «el Contenido» o «el Diseño» (permiso completo en galerías y contenido).</small>
        </form>` : "");
  }

  // Tras un cambio, la lista de Usuarios que hay en memoria se pone al día sin volver a pedirla.
  function sincronizarUsuarios() {
    try {
      if (typeof USUARIOS_LISTA === "undefined" || !Array.isArray(USUARIOS_LISTA)) return;
      USUARIOS_LISTA.forEach((u) => {
        if (u.rol !== "redactor") return;
        u.sub_responsable_areas = estado.areas.filter((a) => a.miembros.some((m) => m.id === Number(u.id)))
          .map((a) => ({ id: a.id, nombre: a.nombre, titulo: a.titulo, permiso: a.permiso || null }));
      });
      if (window.EOFGruposTrabajo && window.EOFGruposTrabajo.sincronizarCargos) window.EOFGruposTrabajo.sincronizarCargos();
      if (typeof renderTablaUsuarios === "function") renderTablaUsuarios();
    } catch { /* sin lista en memoria */ }
  }

  function aplicar(r) {
    if (r && Array.isArray(r.areas)) { estado.areas = r.areas; estado.cargado = true; estado.error = null; }
    pintar();
    sincronizarUsuarios();
    try { if (window.EOFCargos) window.EOFCargos.pintarEquipo(); } catch (e) { console.warn("[cargos] equipo", e); }
  }

  async function llamar(ruta, cuerpo, errorPorDefecto) {
    try {
      const r = await apiFetch(ruta, { method: "PUT", body: JSON.stringify(cuerpo) });
      aplicar(r);
      return r;
    } catch (err) {
      toast((err && err.message) || errorPorDefecto, "error");
      pintar();
      return null;
    }
  }

  async function nombrar(areaId, userId) {
    const r = await llamar("/api/subresponsables/asignar", { area_id: areaId, user_id: userId }, "No se ha podido nombrar al Sub-Responsable");
    if (r) {
      const a = estado.areas.find((x) => x.id === areaId);
      const m = a && a.miembros.find((x) => x.id === userId);
      if (a && m) toast(`${m.nombre} es ahora ${a.titulo}`, "success");
    }
  }
  async function quitar(areaId, userId) {
    const a = estado.areas.find((x) => x.id === areaId);
    const m = a && a.miembros.find((x) => x.id === userId);
    const r = await llamar("/api/subresponsables/asignar", { area_id: areaId, user_id: userId, quitar: true }, "No se ha podido quitar el cargo");
    if (r && a && m) toast(`${m.nombre} ya no es ${a.titulo}`, "success");
  }
  async function borrarArea(areaId) {
    const a = estado.areas.find((x) => x.id === areaId);
    if (!a || a.fija) return;
    const aviso = a.miembros.length ? ` Sus ${a.miembros.length} Sub-Responsable${a.miembros.length === 1 ? "" : "s"} perderán el cargo.` : "";
    let ok = true;
    try { ok = await window.EOF.confirmar(`¿Eliminar el área «${a.nombre}»?${aviso}`, { peligroso: true, textoConfirmar: "Eliminar" }); } catch { ok = window.confirm(`¿Eliminar el área «${a.nombre}»?${aviso}`); }
    if (!ok) return;
    const r = await llamar("/api/subresponsables/areas", { areas: estado.areas.filter((x) => x.id !== areaId).map((x) => ({ id: x.id, nombre: x.nombre })) }, "No se ha podido eliminar el área");
    if (r) toast(`Área «${a.nombre}» eliminada`, "success");
  }
  async function crearArea(nombre) {
    const limpio = String(nombre || "").replace(/\s+/g, " ").trim();
    if (!limpio) { toast("Escribe el nombre del área (con artículo: «el Diseño»)", "error"); return; }
    const r = await llamar("/api/subresponsables/areas", { areas: [...estado.areas.map((x) => ({ id: x.id, nombre: x.nombre })), { nombre: limpio }] }, "No se ha podido crear el área");
    if (r) toast(`Área «${limpio}» creada`, "success");
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-sa-quitar], [data-sa-borrar], [data-sa='reintentar']");
    if (!t || !contenedor() || !contenedor().contains(t)) return;
    if (t.dataset.saQuitar) quitar(t.dataset.saQuitar, Number(t.dataset.saUser));
    else if (t.dataset.saBorrar) borrarArea(t.dataset.saBorrar);
    else if (t.dataset.sa === "reintentar") { estado.error = null; cargar(); }
  });
  document.addEventListener("change", (e) => {
    const s = e.target.closest && e.target.closest("[data-sa-anadir]");
    if (!s || !contenedor() || !contenedor().contains(s)) return;
    const uid = Number(s.value);
    s.value = "";
    if (uid) nombrar(s.dataset.saAnadir, uid);
  });
  document.addEventListener("submit", (e) => {
    const f = e.target.closest && e.target.closest("[data-sa='nueva']");
    if (!f) return;
    e.preventDefault();
    const inp = f.querySelector("input");
    crearArea(inp ? inp.value : "");
  });

  window.EOFAreasSub = { cargar, pintar, areas: () => estado.areas, cargado: () => estado.cargado, nombrar, quitar, crearArea };
})();
