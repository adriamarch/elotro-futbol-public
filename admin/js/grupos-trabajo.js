// ---------- Grupos de trabajo (solo para organizarse; NO dan ni quitan permisos) ----------
// FASE 1 · además: cada grupo puede tener un Sub-Responsable (su líder; PUT /api/grupos-trabajo/lider) y
// cada Responsable (rol admin) hasta 2 funciones (GET /api/responsables, PUT /api/responsables/funciones).
// Backend: GET/PUT /api/grupos-trabajo y PUT /api/grupos-trabajo/asignar (worker y
// worker-secondary); se guarda en `settings` bajo la clave 'grupos_trabajo'.
//
//  - SOLO redactores y Responsables pueden tener grupo: los fotógrafos no (ni ven la sección).
//  - Funcionalidades > Información: redactores y admins ven los grupos y sus miembros (y cuál es el suyo).
//    Los admins pueden mandar un anuncio por correo a un grupo con un clic (Funcionalidades > Anuncios
//    también permite elegir grupos de trabajo como destinatarios).
//  - Usuarios > Colaboradores (solo admin): barra de grupos (filtro con un clic y botón para crear,
//    renombrar, cambiar de color o borrar grupos) y un selector de grupo en cada fila (solo redactores/admins).
//
// Depende de globales de admin.js / ui-alertas.js:
//   apiFetch(path, options), USER, USUARIOS_LISTA, renderTablaUsuarios(), usuariosEnRespaldo(),
//   window.EOF.toast / window.EOF.confirmar
(function () {
  "use strict";

  const COLORES = ["#d1132e", "#1d6fd1", "#1c9c5b", "#e08a00", "#7a4fd6", "#0e8fa6", "#c2358a", "#5b6672"];
  const MAX_GRUPOS = 30;
  const estado = { grupos: [], mio: null, cargado: false, enCurso: null, error: null, responsables: [], respCargado: false, respError: null };
  let borrador = [];   // copia de trabajo del gestor
  let gestorEl = null;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m, t) => { try { window.EOF.toast(m, t || "info"); } catch { /* sin avisos */ } };
  const soyAdmin = () => typeof USER !== "undefined" && !!USER && USER.rol === "admin";
  // Solo redactores y Responsables tienen grupo de trabajo (los fotógrafos, no).
  const puedeTenerGrupo = (rol) => rol === "admin" || rol === "redactor";
  const veoGrupos = () => typeof USER === "undefined" || !USER || puedeTenerGrupo(USER.rol);
  const soloRedactoresYAdmins = "Los grupos de trabajo son solo para redactores y Responsables";
  const buscar = (id) => estado.grupos.find((g) => g.id === id) || null;
  const nombreDe = (id) => { const g = id ? buscar(id) : null; return g ? g.nombre : ""; };
  const colorSeguro = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : "#5b6672");
  const rolEtiqueta = (r) => (r === "fotografo" ? "Fotógrafo" : r === "admin" ? "Responsable" : "Redactor");
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const urlAvatar = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : "");
  // Iniciales para insignias y avatares: «Previas» -> PR, «Ana Pérez» -> AP.
  const iniciales = (txt) => {
    const p = String(txt || "?").trim().split(/\s+/).filter(Boolean);
    const a = p[0] || "?";
    return (a[0] + (p.length > 1 ? p[1][0] : (a[1] || ""))).toUpperCase();
  };
  const avatarHTML = (m, extra) => {
    const src = urlAvatar(m.avatar);
    return `<span class="gt-av${extra ? " " + extra : ""}" title="${esc(m.nombre)}">${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(iniciales(m.nombre))}</span>`;
  };
  const pilaAvatares = (miembros, max) => {
    const ver = miembros.slice(0, max);
    return `<span class="gt-pila" aria-hidden="true">${ver.map((m) => avatarHTML(m)).join("")}${miembros.length > max ? `<span class="gt-av gt-av-mas">+${miembros.length - max}</span>` : ""}</span>`;
  };

  // ---------- carga ----------
  // cargar()      -> solo si aún no se había cargado (la tabla de Usuarios la llama cada vez).
  // cargar(true)  -> siempre (al abrir Información).
  function cargar(forzar) {
    if (!veoGrupos()) { pintarResponsables(); pintarInformacion(); return Promise.resolve(); }
    if (estado.enCurso) return estado.enCurso;
    if (estado.cargado && !forzar) return Promise.resolve();
    estado.enCurso = (async () => {
      try {
        const r = await apiFetch("/api/grupos-trabajo");
        if (r && Array.isArray(r.grupos)) {
          estado.grupos = r.grupos;
          estado.mio = r.mio || null;
          estado.cargado = true;
          estado.error = null;
        } else {
          estado.error = "Respuesta no válida";
        }
      } catch (err) {
        estado.error = (err && err.message) || "No se han podido cargar los grupos";
      } finally {
        estado.enCurso = null;
      }
      await cargarResponsables();
      refrescarTodo();
    })();
    return estado.enCurso;
  }

  function refrescarTodo() {
    pintarResponsables();
    pintarInformacion();
    rellenarFiltro();
    try { if (window.EOFCargos) window.EOFCargos.pintarEquipo(); } catch (e) { console.warn("[cargos] equipo", e); }
    try {
      if (document.getElementById("tablaUsuarios") && typeof renderTablaUsuarios === "function") renderTablaUsuarios();
    } catch (e) { console.warn("[grupos] no se pudo repintar Usuarios", e); }
  }

  // ---------- Funcionalidades > Información ----------
  const ICO_MAS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const ICO_AJUSTES = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>';
  const ICO_CORREO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7.5 12 13l8.5-5.5"/></svg>';
  const ICO_EQUIPO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M15.5 14.2c3 0 5.5 1.8 5.5 4.8"/></svg>';

  function pintarInformacion() {
    const cont = document.getElementById("gruposTrabajo");
    if (!cont) return;
    const seccion = document.getElementById("infoGrupos");
    if (seccion) seccion.hidden = !veoGrupos();
    if (!veoGrupos()) { cont.innerHTML = ""; return; }
    if (estado.error && !estado.cargado) {
      cont.innerHTML = `<div class="gt-vacio"><span class="gt-vacio-ico">${ICO_EQUIPO}</span><p>No se han podido cargar los grupos de trabajo (${esc(estado.error)}).</p><button type="button" class="gt-btn" data-gt="reintentar">Reintentar</button></div>`;
      return;
    }
    if (!estado.cargado) {
      cont.innerHTML = `<div class="gt-esqueleto" aria-busy="true" aria-label="Cargando grupos de trabajo"><span></span><span></span><span></span></div>`;
      return;
    }
    const admin = soyAdmin();
    if (!estado.grupos.length) {
      cont.innerHTML = `<div class="gt-vacio"><span class="gt-vacio-ico">${ICO_EQUIPO}</span>
        <h5>Todavía no hay grupos de trabajo</h5>
        <p>${admin ? "Crea el primero y asigna a cada persona del equipo desde Usuarios." : "Cuando un Responsable los cree, aquí verás con quién trabajas."}</p>
        ${admin ? `<button type="button" class="gt-btn gt-btn-pri" data-gt="gestionar">${ICO_MAS}Crear grupos</button>` : ""}</div>`;
      return;
    }
    const totalPersonas = estado.grupos.reduce((a, g) => a + (g.miembros || []).length, 0);
    const resumen = `<div class="gt-resumen">
      <div class="gt-stats">
        <span class="gt-stat"><b>${estado.grupos.length}</b>${estado.grupos.length === 1 ? "grupo" : "grupos"}</span>
        <span class="gt-stat"><b>${totalPersonas}</b>${totalPersonas === 1 ? "persona" : "personas"} en grupos</span>
      </div>
      ${admin ? `<button type="button" class="gt-btn" data-gt="gestionar">${ICO_AJUSTES}Gestionar grupos</button>` : ""}
    </div>`;
    const tuyo = estado.mio ? buscar(estado.mio) : null;
    const aviso = tuyo
      ? `<div class="gt-tuyo" style="--gt:${colorSeguro(tuyo.color)}"><span class="gt-insignia gt-insignia-g">${esc(iniciales(tuyo.nombre))}</span>
          <div><strong>Tu grupo de trabajo es ${esc(tuyo.nombre)}${tuyo.lider && tuyo.lider.id === miId() ? " · eres su Sub-Responsable" : ""}</strong><small>${(tuyo.miembros || []).length > 1 ? `Trabajas con ${plural((tuyo.miembros || []).length - 1, "compañero", "compañeros")}.` : "Por ahora eres la única persona del grupo."}</small></div></div>`
      : (admin ? "" : `<div class="gt-tuyo gt-tuyo-sin"><span class="gt-insignia gt-insignia-g">?</span><div><strong>Todavía no tienes grupo de trabajo</strong><small>Un Responsable te asignará uno cuando toque.</small></div></div>`);
    const yoId = typeof USER !== "undefined" && USER ? USER.id : -1;
    cont.innerHTML = resumen + aviso + `<div class="gt-rejilla">` + estado.grupos.map((g) => {
      const miembros = g.miembros || [];
      const mio = g.id === estado.mio;
      return `<article class="gt-tarjeta${mio ? " gt-mio" : ""}" style="--gt:${colorSeguro(g.color)}">
        <header class="gt-tarjeta-cab">
          <span class="gt-insignia">${esc(iniciales(g.nombre))}</span>
          <div class="gt-tarjeta-tit">
            <h5 class="gt-nombre">${esc(g.nombre)}</h5>
            <span class="gt-sub">${miembros.length ? plural(miembros.length, "persona", "personas") : "Sin personas"}${mio ? ` · <em>tu grupo</em>` : ""}</span>
          </div>
          ${miembros.length ? pilaAvatares(miembros, 4) : ""}
        </header>
        ${g.descripcion ? `<p class="gt-desc">${esc(g.descripcion)}</p>` : ""}
        ${liderBloqueHTML(g, admin)}
        ${miembros.length
          ? `<ul class="gt-miembros">${ordenarMiembros(g).map((m) => `<li${m.id === yoId ? ' class="gt-yo"' : ""}>${avatarHTML(m)}<span class="gt-mn">${esc(m.nombre)}${m.id === yoId ? " <em>(tú)</em>" : ""}</span>${g.lider && g.lider.id === m.id ? `<small class="gt-rol gt-rol-sub" title="Sub-Responsable del grupo">★ Sub-Responsable</small>` : ""}<small class="gt-rol" data-rol="${esc(m.rol)}">${rolEtiqueta(m.rol)}</small></li>`).join("")}</ul>`
          : `<p class="gt-sin-miembros">Nadie en este grupo todavía.</p>`}
        ${admin ? `<footer class="gt-tarjeta-pie"><button type="button" class="gt-btn gt-btn-peq" data-gt="anuncio" data-gt-id="${esc(g.id)}"${miembros.length ? "" : " disabled"} title="${miembros.length ? "Escribir un anuncio por correo solo para este grupo" : "El grupo no tiene personas"}">${ICO_CORREO}Enviar anuncio al grupo</button></footer>` : ""}
      </article>`;
    }).join("") + `</div>`;
  }

  // ---------- Usuarios: barra de grupos, selector por fila y menú ----------
  const ICO_CARET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const ICO_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const ICO_NINGUNO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/></svg>';
  const ICO_PERSONA_MAS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="8" r="3.3"/><path d="M3.5 19.5c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6M19 8v6M16 11h6"/></svg>';

  const listaUsuarios = () => { try { return USUARIOS_LISTA || []; } catch { return []; } };
  const enRespaldo = () => (typeof usuariosEnRespaldo === "function" && usuariosEnRespaldo()) ||
    (typeof USUARIOS_ORIGEN !== "undefined" && USUARIOS_ORIGEN && USUARIOS_ORIGEN.cache);

  // Celda "Grupo de trabajo" de cada fila de Usuarios.
  function selectorHTML(u) {
    if (!soyAdmin()) return "";
    if (!puedeTenerGrupo(u.rol)) {
      return `<div class="gt-celda gt-celda-na"><span class="gt-na" title="${esc(soloRedactoresYAdmins)}">${ICO_NINGUNO}Sin grupos para fotógrafos</span></div>`;
    }
    if (!estado.grupos.length) {
      return `<div class="gt-celda"><button type="button" class="gt-chip gt-chip-crear" data-gt="gestionar">${estado.cargado ? ICO_PERSONA_MAS + "Crear grupos de trabajo" : "…"}</button></div>`;
    }
    const actual = u.grupo_trabajo && buscar(u.grupo_trabajo) ? u.grupo_trabajo : "";
    const g = actual ? buscar(actual) : null;
    const bloqueado = enRespaldo();
    return `<div class="gt-celda"${g ? ` style="--gt:${colorSeguro(g.color)}"` : ""}>
      <button type="button" class="gt-chip${g ? " gt-chip-on" : ""}" data-gt="chip" data-gt-user="${Number(u.id)}" aria-haspopup="listbox" aria-expanded="false"
        ${bloqueado ? 'disabled title="No se puede cambiar mientras la lista no esté actualizada"' : 'title="Cambiar el grupo de trabajo"'}>
        <span class="gt-chip-ins">${g ? esc(iniciales(g.nombre)) : ICO_PERSONA_MAS}</span>
        <span class="gt-chip-txt"><small>Grupo de trabajo</small><b>${g ? esc(g.nombre) : "Sin grupo"}</b></span>
        <span class="gt-chip-caret">${ICO_CARET}</span>
      </button>
    </div>`;
  }

  // Barra sobre la tabla: filtra con un clic por grupo y abre el gestor.
  // (Se llama rellenarFiltro por compatibilidad con admin.js, que la invoca al cargar y limpiar filtros.)
  function rellenarFiltro() {
    const cont = document.getElementById("usuariosGruposBarra");
    if (!cont) return;
    if (!soyAdmin()) { cont.hidden = true; return; }
    cont.hidden = false;
    const etq = `<span class="usuarios-fila-etq" title="${esc(soloRedactoresYAdmins)}">Grupo</span>`;
    if (!estado.cargado) {
      cont.innerHTML = estado.error
        ? `<div class="gt-barra gt-barra-vacia">${etq}<span class="gt-barra-nota">No se han podido cargar los grupos (${esc(estado.error)}).</span><button type="button" class="gt-btn gt-btn-peq" data-gt="reintentar">Reintentar</button></div>`
        : `<div class="gt-barra gt-barra-carga" aria-busy="true">${etq}<span></span><span></span><span></span></div>`;
      return;
    }
    if (!estado.grupos.length) {
      cont.innerHTML = `<div class="gt-barra gt-barra-vacia">${etq}<span class="gt-barra-nota">Organiza a redactores y Responsables por tareas (Previas, Crónicas, Redes…). Solo sirven para organizarse: no cambian permisos.</span><button type="button" class="gt-btn gt-btn-peq gt-btn-pri" data-gt="gestionar">${ICO_MAS}Crear grupos</button></div>`;
      if (typeof USUARIOS_FILTRO !== "undefined") USUARIOS_FILTRO.grupo = "todos";
      return;
    }
    const cuentas = new Map();
    let sin = 0;
    let elegibles = 0;
    listaUsuarios().forEach((u) => {
      if (!puedeTenerGrupo(u.rol)) return;
      elegibles++;
      if (u.grupo_trabajo && buscar(u.grupo_trabajo)) cuentas.set(u.grupo_trabajo, (cuentas.get(u.grupo_trabajo) || 0) + 1);
      else sin++;
    });
    let actual = (typeof USUARIOS_FILTRO !== "undefined" && USUARIOS_FILTRO.grupo) || "todos";
    if (actual !== "todos" && actual !== "ninguno" && !buscar(actual)) {
      actual = "todos";
      if (typeof USUARIOS_FILTRO !== "undefined") USUARIOS_FILTRO.grupo = "todos";
    }
    const chip = (val, html, n, extra, estilo) => `<button type="button" class="gt-fchip${actual === val ? " activo" : ""}${extra || ""}" data-gt="filtro" data-gt-val="${esc(val)}"${estilo ? ` style="--gt:${estilo}"` : ""} aria-pressed="${actual === val}">${html}<b>${n}</b></button>`;
    cont.innerHTML = `<div class="gt-barra">
      ${etq}
      <div class="gt-barra-chips" role="group" aria-label="Filtrar por grupo de trabajo">
        ${chip("todos", "Todos", elegibles, " gt-fchip-todos")}
        ${estado.grupos.map((g) => chip(g.id, `<span class="gt-insignia gt-insignia-mini" aria-hidden="true">${esc(iniciales(g.nombre))}</span><span class="gt-fchip-n">${esc(g.nombre)}</span>`, cuentas.get(g.id) || 0, "", colorSeguro(g.color))).join("")}
        ${chip("ninguno", `<span class="gt-punto" aria-hidden="true"></span>Sin grupo`, sin, " gt-fchip-sin")}
      </div>
      <button type="button" class="gt-btn gt-btn-peq gt-barra-gestionar" data-gt="gestionar" title="Crear, renombrar, recolorear o borrar grupos (solo sirven para organizarse)">${ICO_AJUSTES}Gestionar</button>
    </div>`;
  }

  function filtrarPorGrupo(val) {
    if (typeof USUARIOS_FILTRO === "undefined") return;
    USUARIOS_FILTRO.grupo = (USUARIOS_FILTRO.grupo === val && val !== "todos") ? "todos" : val;
    rellenarFiltro();
    try { if (typeof renderTablaUsuarios === "function") renderTablaUsuarios(); } catch (e) { console.warn("[grupos] no se pudo repintar Usuarios", e); }
  }

  // Menú desplegable para elegir grupo (en móvil sale como hoja desde abajo).
  let menuEl = null;
  let menuFondo = null;
  let menuBtn = null;
  const enMovil = () => window.matchMedia && window.matchMedia("(max-width: 560px)").matches;

  function cerrarMenu(devolverFoco) {
    window.removeEventListener("scroll", alScroll, true);
    window.removeEventListener("resize", alRedimensionar);
    if (menuEl) { menuEl.remove(); menuEl = null; }
    if (menuFondo) { menuFondo.remove(); menuFondo = null; }
    if (menuBtn) {
      menuBtn.setAttribute("aria-expanded", "false");
      if (devolverFoco && document.body.contains(menuBtn)) menuBtn.focus();
      menuBtn = null;
    }
  }
  function alScroll(e) { if (menuEl && !menuEl.contains(e.target) && !enMovil()) cerrarMenu(false); }
  function alRedimensionar() { cerrarMenu(false); }

  function colocarMenu() {
    if (!menuEl || !menuBtn || enMovil()) return;
    const r = menuBtn.getBoundingClientRect();
    const ancho = Math.min(Math.max(r.width, 270), window.innerWidth - 16);
    menuEl.style.width = ancho + "px";
    let izq = Math.min(Math.max(8, r.left), window.innerWidth - ancho - 8);
    menuEl.style.left = izq + "px";
    const alto = menuEl.offsetHeight;
    const abajo = window.innerHeight - r.bottom - 10;
    const arriba = r.top - 10;
    if (alto > abajo && arriba > abajo) {
      menuEl.style.top = Math.max(8, r.top - alto - 6) + "px";
      menuEl.classList.add("gt-menu-arriba");
    } else {
      menuEl.style.top = (r.bottom + 6) + "px";
      menuEl.classList.remove("gt-menu-arriba");
    }
    menuEl.style.maxHeight = Math.max(180, Math.max(abajo, arriba) - 6) + "px";
  }

  function abrirMenu(btn) {
    if (btn.disabled) return;
    const uid = Number(btn.dataset.gtUser);
    const u = listaUsuarios().find((x) => Number(x.id) === uid);
    if (!u || !puedeTenerGrupo(u.rol)) return;
    const abierto = menuBtn === btn;
    cerrarMenu(false);
    if (abierto) return;
    const actual = u.grupo_trabajo && buscar(u.grupo_trabajo) ? u.grupo_trabajo : "";
    menuBtn = btn;
    btn.setAttribute("aria-expanded", "true");
    menuFondo = document.createElement("div");
    menuFondo.className = "gt-menu-fondo";
    menuFondo.addEventListener("click", () => cerrarMenu(true));
    menuEl = document.createElement("div");
    menuEl.className = "gt-menu";
    menuEl.setAttribute("role", "listbox");
    menuEl.setAttribute("aria-label", "Grupo de trabajo de " + (u.nombre || u.username || ""));
    const opcion = (val, ins, nombre, sub, color) => `<button type="button" role="option" class="gt-op${val === actual ? " sel" : ""}" aria-selected="${val === actual}" data-gt-val="${esc(val)}"${color ? ` style="--gt:${color}"` : ""}>${ins}<span class="gt-op-n">${nombre}${sub ? `<small>${sub}</small>` : ""}</span><span class="gt-op-ok">${val === actual ? ICO_CHECK : ""}</span></button>`;
    menuEl.innerHTML = `<div class="gt-menu-cab"><span>Grupo de trabajo</span><b>${esc(u.nombre || u.username || "")}</b></div>
      <div class="gt-menu-lista">
        ${opcion("", `<span class="gt-insignia gt-insignia-mini gt-insignia-nada" aria-hidden="true">${ICO_NINGUNO}</span>`, "Sin grupo", "No pertenece a ninguno", "")}
        ${estado.grupos.map((g) => { const n = (g.miembros || []).length; return opcion(g.id, `<span class="gt-insignia gt-insignia-mini" aria-hidden="true">${esc(iniciales(g.nombre))}</span>`, esc(g.nombre), n ? plural(n, "persona", "personas") : "Sin personas todavía", colorSeguro(g.color)); }).join("")}
      </div>
      ${liderMenuHTML(u, actual)}
      <button type="button" class="gt-menu-gestionar" data-gt="gestionar">${ICO_AJUSTES}Gestionar grupos</button>`;
    menuEl.addEventListener("click", (e) => {
      const l = e.target.closest(".gt-menu-lider");
      if (l) { const gid = l.dataset.gtLider; const quien = l.dataset.gtLiderUser ? Number(l.dataset.gtLiderUser) : null; cerrarMenu(true); fijarLider(gid, quien); return; }
      const o = e.target.closest(".gt-op");
      if (!o) return;
      const nuevo = o.dataset.gtVal || "";
      cerrarMenu(true);
      if (nuevo !== actual) asignar(uid, nuevo);
    });
    menuEl.addEventListener("keydown", (e) => {
      const ops = [...menuEl.querySelectorAll(".gt-op, .gt-menu-lider, .gt-menu-gestionar")];
      const i = ops.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); (ops[i + 1] || ops[0]).focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); (ops[i - 1] || ops[ops.length - 1]).focus(); }
      else if (e.key === "Home") { e.preventDefault(); ops[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); ops[ops.length - 1].focus(); }
      else if (e.key === "Tab") cerrarMenu(true);
    });
    document.body.appendChild(menuFondo);
    document.body.appendChild(menuEl);
    colocarMenu();
    window.addEventListener("scroll", alScroll, true);
    window.addEventListener("resize", alRedimensionar);
    const sel = menuEl.querySelector(".gt-op.sel") || menuEl.querySelector(".gt-op");
    if (sel) sel.focus({ preventScroll: true });
  }

  async function asignar(userId, grupoId) {
    if (typeof usuariosPuedeEscribir === "function" && !usuariosPuedeEscribir()) { refrescarTodo(); return; }
    try {
      const r = await apiFetch("/api/grupos-trabajo/asignar", { method: "PUT", body: JSON.stringify({ user_id: userId, grupo_id: grupoId || null }) });
      if (r && Array.isArray(r.grupos)) { estado.grupos = r.grupos; estado.mio = r.mio || null; estado.cargado = true; }
      try {
        const u = USUARIOS_LISTA.find((x) => Number(x.id) === Number(userId));
        if (u) u.grupo_trabajo = grupoId || null;
        // Grupo «Redacción nivel N»: el servidor ha subido/bajado el nivel de redactor; se refleja en la lista local.
        if (r && Array.isArray(r.niveles_cambiados)) {
          for (const c of r.niveles_cambiados) {
            const x = USUARIOS_LISTA.find((y) => Number(y.id) === Number(c.id));
            if (x) { x.nivel = c.nivel; x.nivel_nota = null; }
          }
        }
        if (typeof usuariosGuardarCache === "function") usuariosGuardarCache(USUARIOS_LISTA);
      } catch { /* sin lista en memoria */ }
      sincronizarCargos();
      toast(grupoId ? `Grupo asignado: ${nombreDe(grupoId)}` : "Se ha quitado el grupo de trabajo", "success");
    } catch (err) {
      toast((err && err.message) || "No se ha podido cambiar el grupo", "error");
    }
    refrescarTodo();
  }

  // ---------- Gestor de grupos (modal, solo admin) ----------
  function abrirGestor() {
    if (!soyAdmin()) return;
    if (typeof usuariosPuedeEscribir === "function" && !usuariosPuedeEscribir()) return;
    borrador = estado.grupos.map((g) => ({ id: g.id, nombre: g.nombre, color: g.color, descripcion: g.descripcion || "", miembros: (g.miembros || []).length, personas: g.miembros || [] }));
    if (!gestorEl) {
      gestorEl = document.createElement("div");
      gestorEl.className = "modal-overlay gt-modal";
      gestorEl.id = "modalGruposTrabajo";
      gestorEl.addEventListener("click", (e) => {
        if (e.target === gestorEl) { cerrarGestor(); return; }
        const b = e.target.closest("[data-gt-accion]");
        if (!b) return;
        const i = Number(b.dataset.i);
        const a = b.dataset.gtAccion;
        if (a === "cerrar") cerrarGestor();
        else if (a === "anadir") anadirFila();
        else if (a === "idea") anadirFila(b.dataset.nombre);
        else if (a === "borrar") borrarFila(i);
        else if (a === "subir") moverFila(i, -1);
        else if (a === "bajar") moverFila(i, 1);
        else if (a === "color") { leerCampos(); if (borrador[i]) { borrador[i].color = b.dataset.color; pintarGestor(); } }
        else if (a === "guardar") guardarGestor();
      });
      // Vista previa en vivo: la insignia y la barra cambian de nombre/color mientras se escribe.
      gestorEl.addEventListener("input", (e) => {
        const fila = e.target.closest && e.target.closest(".gt-fila");
        if (!fila) return;
        const i = Number(fila.dataset.i);
        if (!borrador[i]) return;
        if (e.target.classList.contains("gt-in-nombre")) {
          borrador[i].nombre = e.target.value;
          fila.querySelector(".gt-insignia").textContent = iniciales(e.target.value || "?");
        } else if (e.target.classList.contains("gt-in-color")) {
          borrador[i].color = e.target.value;
          fila.style.setProperty("--gt", colorSeguro(e.target.value));
          fila.querySelectorAll(".gt-color.sel").forEach((x) => x.classList.remove("sel"));
        }
      });
      document.body.appendChild(gestorEl);
    }
    pintarGestor();
    gestorEl.classList.add("abierto");
  }

  function cerrarGestor() { if (gestorEl) gestorEl.classList.remove("abierto"); }

  function leerCampos() {
    if (!gestorEl) return;
    gestorEl.querySelectorAll(".gt-fila").forEach((fila) => {
      const i = Number(fila.dataset.i);
      if (!borrador[i]) return;
      borrador[i].nombre = fila.querySelector(".gt-in-nombre").value;
      borrador[i].descripcion = fila.querySelector(".gt-in-desc").value;
    });
  }

  function anadirFila(nombre) {
    leerCampos();
    if (borrador.length >= MAX_GRUPOS) { toast(`Como máximo ${MAX_GRUPOS} grupos.`, "error"); return; }
    borrador.push({ id: "", nombre: typeof nombre === "string" ? nombre : "", color: COLORES[borrador.length % COLORES.length], descripcion: "", miembros: 0, personas: [] });
    pintarGestor();
    const nuevos = gestorEl.querySelectorAll(".gt-in-nombre");
    if (nuevos.length) { nuevos[nuevos.length - 1].focus(); if (nuevos[nuevos.length - 1].scrollIntoView) nuevos[nuevos.length - 1].scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }

  function moverFila(i, d) {
    leerCampos();
    const j = i + d;
    if (!borrador[i] || !borrador[j]) return;
    [borrador[i], borrador[j]] = [borrador[j], borrador[i]];
    pintarGestor();
  }

  async function borrarFila(i) {
    leerCampos();
    const g = borrador[i];
    if (!g) return;
    if (g.id && g.miembros > 0) {
      let ok = true;
      try {
        ok = await window.EOF.confirmar(`«${g.nombre || "Este grupo"}» tiene ${g.miembros} ${g.miembros === 1 ? "persona" : "personas"}. Si lo borras se quedarán sin grupo de trabajo (no pierden ningún permiso). ¿Borrarlo?`, { peligroso: true, textoConfirmar: "Borrar grupo" });
      } catch { ok = true; }
      if (!ok) return;
    }
    borrador.splice(i, 1);
    pintarGestor();
  }

  const ICO_SUBIR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg>';
  const ICO_BAJAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg>';
  const ICO_BASURA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>';

  const IDEAS = ["Previas", "Crónicas", "Redes sociales", "Directos", "Resultados", "Entrevistas"];

  function pintarGestor() {
    if (!gestorEl) return;
    const usados = new Set(borrador.map((g) => String(g.nombre || "").trim().toLowerCase()));
    const ideas = IDEAS.filter((n) => !usados.has(n.toLowerCase())).slice(0, borrador.length ? 4 : 6);
    const ideasHTML = ideas.length && borrador.length < MAX_GRUPOS
      ? `<div class="gt-ideas"><span>${borrador.length ? "Más ideas" : "Ideas para empezar"}</span>${ideas.map((n) => `<button type="button" class="gt-idea" data-gt-accion="idea" data-nombre="${esc(n)}">${ICO_MAS}${esc(n)}</button>`).join("")}</div>`
      : "";
    const totalPersonas = borrador.reduce((a, g) => a + (g.miembros || 0), 0);
    gestorEl.innerHTML = `<div class="modal-caja gt-caja" role="dialog" aria-modal="true" aria-labelledby="gtTitulo">
      <button type="button" class="modal-cerrar" data-gt-accion="cerrar" aria-label="Cerrar">&times;</button>
      <header class="gt-gestor-cab">
        <span class="gt-gestor-ico">${ICO_EQUIPO}</span>
        <div>
          <h3 class="titulo-subseccion" id="gtTitulo">Grupos de trabajo</h3>
          <p class="gt-gestor-sub">${borrador.length ? plural(borrador.length, "grupo", "grupos") + " · " + plural(totalPersonas, "persona", "personas") + " · máximo " + MAX_GRUPOS : "Organiza al equipo por tareas o secciones"}</p>
        </div>
      </header>
      <p class="gt-ayuda-caja"><span class="gt-ayuda-ico">${ICO_EQUIPO}</span><span>Etiquetas para organizar al equipo (p. ej. «Previas», «Crónicas», «Redes»). <strong>Solo redactores y Responsables</strong> pueden estar en un grupo, y cada persona en uno solo, que se elige desde la tabla de Usuarios. <strong>No dan ni quitan permisos</strong>: no cambian el rol ni lo que cada persona puede publicar. Excepción: un grupo llamado «Redacción nivel 1», «Redacción nivel 2», «Redacción nivel 3» o «Redacción nivel 4» pone automáticamente a sus redactores en ese nivel. También puedes mandar anuncios por correo a un grupo entero desde Anuncios.</span></p>
      <div class="gt-lista">
        ${borrador.length ? borrador.map((g, i) => `<div class="gt-fila" data-i="${i}" style="--gt:${colorSeguro(g.color)}">
          <span class="gt-insignia gt-insignia-g" aria-hidden="true">${esc(iniciales(g.nombre || "?"))}</span>
          <div class="gt-fila-campos">
            <input type="text" class="gt-in-nombre" maxlength="40" placeholder="Nombre del grupo" value="${esc(g.nombre)}" aria-label="Nombre del grupo ${i + 1}">
            <input type="text" class="gt-in-desc" maxlength="120" placeholder="Para qué sirve (opcional)" value="${esc(g.descripcion)}" aria-label="Descripción del grupo ${i + 1}">
            <div class="gt-colores" role="group" aria-label="Color del grupo ${i + 1}">
              ${COLORES.map((c) => `<button type="button" class="gt-color${c.toLowerCase() === String(g.color).toLowerCase() ? " sel" : ""}" style="background:${c}" data-gt-accion="color" data-i="${i}" data-color="${c}" aria-label="Color ${c}" aria-pressed="${c.toLowerCase() === String(g.color).toLowerCase()}"></button>`).join("")}
              <label class="gt-color-libre" title="Elegir otro color"><input type="color" class="gt-in-color" value="${colorSeguro(g.color)}" aria-label="Color personalizado del grupo ${i + 1}"><span>＋</span></label>
            </div>
          </div>
          <div class="gt-fila-lado">
            <div class="gt-cuenta" title="Personas activas en el grupo">${(g.personas || []).length ? pilaAvatares(g.personas, 4) : ""}<span>${plural(g.miembros || 0, "persona", "personas")}</span></div>
            <div class="gt-acciones">
              <button type="button" class="gt-icono" data-gt-accion="subir" data-i="${i}" aria-label="Subir"${i === 0 ? " disabled" : ""}>${ICO_SUBIR}</button>
              <button type="button" class="gt-icono" data-gt-accion="bajar" data-i="${i}" aria-label="Bajar"${i === borrador.length - 1 ? " disabled" : ""}>${ICO_BAJAR}</button>
              <button type="button" class="gt-icono gt-icono-peligro" data-gt-accion="borrar" data-i="${i}" aria-label="Borrar grupo" title="Borrar grupo">${ICO_BASURA}</button>
            </div>
          </div>
        </div>`).join("") : `<div class="gt-vacio"><span class="gt-vacio-ico">${ICO_EQUIPO}</span><h5>Todavía no hay grupos</h5><p>Añade el primero o empieza con una de las ideas de abajo.</p></div>`}
      </div>
      ${ideasHTML}
      <div class="gt-pie">
        <button type="button" class="gt-btn" data-gt-accion="anadir"${borrador.length >= MAX_GRUPOS ? " disabled" : ""}>${ICO_MAS}Añadir grupo</button>
        <span class="gt-pie-der">
          <button type="button" class="gt-btn gt-btn-sec" data-gt-accion="cerrar">Cancelar</button>
          <button type="button" class="gt-btn gt-btn-pri" data-gt-accion="guardar">Guardar grupos</button>
        </span>
      </div>
      <p class="gt-error" id="gtError" role="alert" hidden></p>
    </div>`;
  }

  async function guardarGestor() {
    leerCampos();
    const err = document.getElementById("gtError");
    const fallo = (m) => { if (err) { err.textContent = m; err.hidden = false; } };
    if (err) err.hidden = true;
    const vistos = new Set();
    for (const g of borrador) {
      const n = String(g.nombre || "").replace(/\s+/g, " ").trim();
      if (!n) return fallo("Todos los grupos necesitan un nombre (o bórralos).");
      if (vistos.has(n.toLowerCase())) return fallo(`Hay dos grupos llamados «${n}».`);
      vistos.add(n.toLowerCase());
    }
    try {
      const r = await apiFetch("/api/grupos-trabajo", {
        method: "PUT",
        body: JSON.stringify({ grupos: borrador.map((g) => ({ id: g.id || undefined, nombre: g.nombre, color: g.color, descripcion: g.descripcion })) }),
      });
      if (r && Array.isArray(r.grupos)) { estado.grupos = r.grupos; estado.mio = r.mio || null; estado.cargado = true; }
      // Los grupos borrados dejan de existir: se sueltan también en la lista en memoria.
      try { USUARIOS_LISTA.forEach((u) => { if (u.grupo_trabajo && !buscar(u.grupo_trabajo)) u.grupo_trabajo = null; }); } catch { /* nada */ }
      sincronizarCargos();
      cerrarGestor();
      toast("Grupos de trabajo guardados.", "success");
      refrescarTodo();
    } catch (e) {
      fallo((e && e.message) || "No se han podido guardar los grupos.");
    }
  }

  // Anuncios: abre Funcionalidades > Anuncios con este grupo ya elegido como único destinatario.
  function enviarAnuncio(grupoId) {
    if (!soyAdmin() || !buscar(grupoId)) return;
    try { if (typeof window.eofPreseleccionarAnuncio === "function") window.eofPreseleccionarAnuncio("grupo:" + grupoId); } catch { /* sin anuncios */ }
    if (typeof eofIrASeccion === "function") eofIrASeccion("anuncios", new URLSearchParams());
    else toast("Abre Funcionalidades > Anuncios para escribirlo.", "info");
  }

  // ---------- Responsables, Sub-Responsables y cargos ----------
  // "Responsable" es el nombre público del rol admin; cada uno puede llevar 1-2 FUNCIONES escritas con
  // artículo ("el Sitio Web", "los Recursos Humanos"). El título lo compone tituloCargo (igual que el
  // servidor). Un Sub-Responsable es el líder de un grupo de trabajo (PUT /api/grupos-trabajo/lider).
  const ICO_ESTRELLA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/></svg>';
  const ICO_LAPIZ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
  const SUGERENCIAS_FUNCION = ["el Sitio Web", "los Recursos Humanos", "las acreditaciones", "el Diseño", "las Redes Sociales", "la Tienda", "las relaciones institucionales"];
  const MAX_FUNCIONES = 2;
  const MAX_LARGO_FUNCION = 40;
  const miId = () => (typeof USER !== "undefined" && USER ? Number(USER.id) : -1);
  const mayuscula = (t) => { const s = String(t || ""); return s.charAt(0).toUpperCase() + s.slice(1); };

  function funcionConDe(f) {
    const t = String(f || "").trim();
    if (!t) return "";
    return /^el\s/i.test(t) ? "del " + t.replace(/^el\s+/i, "") : "de " + t;
  }
  function tituloCargo(prefijo, funciones) {
    const fs = (Array.isArray(funciones) ? funciones : []).filter((x) => typeof x === "string" && x.trim());
    if (!fs.length) return prefijo;
    return `${prefijo} ${funcionConDe(fs[0])}${fs.slice(1).map((x) => " y " + x.trim()).join("")}`;
  }
  // Cargo de una persona con lo que hay en memoria (lo mismo que calcula GET /api/users).
  function cargoLocal(u) {
    if (u.rol === "admin") return tituloCargo("Responsable", u.funciones || []);
    const g = estado.grupos.find((x) => x.lider && Number(x.lider.id) === Number(u.id));
    const titulos = [];
    if (g) titulos.push(tituloCargo("Sub-Responsable", [g.nombre]));
    (u.sub_responsable_areas || []).forEach((a) => { if (a && a.titulo) titulos.push(a.titulo); }); // Fase 2: áreas
    return titulos.length ? titulos.join(" · ") : null;
  }
  // Tras cualquier cambio de grupos/líderes, la lista de Usuarios en memoria se pone al día.
  function sincronizarCargos() {
    try {
      listaUsuarios().forEach((u) => {
        const g = estado.grupos.find((x) => x.lider && Number(x.lider.id) === Number(u.id));
        u.sub_responsable_de = g ? g.id : null;
        u.cargo = cargoLocal(u);
      });
      if (typeof usuariosGuardarCache === "function") usuariosGuardarCache(USUARIOS_LISTA);
    } catch { /* sin lista en memoria */ }
  }

  // Insignias bajo el nombre en la tabla de Usuarios. Solo informativas: el cargo, el grupo y las funciones
  // se cambian en el modal «Gestionar» (botón de la fila), así que aquí no hay botones.
  // Los cargos ya no van bajo el nombre: salen en la columna Rol (ver rolHTML).
  function cargoHTML() { return ""; }

  // Columna Rol de la lista de Colaboradores. El rol va siempre como chip normal («Redactor», «Fotógrafo»,
  // «Responsable»); si hay cargo, se pinta como insignia en dos tramos: [ rol | función ].
  const sinArticulo = (t) => {
    const x = String(t || "").trim().replace(/^(?:de\s+)?(?:el|la|los|las)\s+/i, "").replace(/^de\s+/i, "");
    return x.charAt(0).toUpperCase() + x.slice(1);
  };
  function insigniaRol(rol, detalle, titulo, opts) {
    const o = opts || {};
    return `<span class="gc-seg ${o.clase || ""}"${o.estilo ? ` style="${o.estilo}"` : ""} title="${esc(titulo)}"><span class="gc-seg-rol">${o.icono || ""}${esc(rol)}</span><span class="gc-seg-fn">${esc(detalle)}</span></span>`;
  }
  function rolHTML(u) {
    if (!u) return "";
    const etiqueta = rolEtiqueta(u.rol);
    const chip = `<span class="gc-rol-etq gc-rol-${esc(u.rol)}">${esc(etiqueta)}</span>`;
    const piezas = [];
    if (u.rol === "admin") {
      const fs = (Array.isArray(u.funciones) ? u.funciones : []).filter((x) => typeof x === "string" && x.trim());
      let detalle = fs.map(sinArticulo).join(" · ");
      if (!detalle && u.cargo && String(u.cargo).indexOf("Responsable") === 0) detalle = sinArticulo(String(u.cargo).slice("Responsable".length));
      if (!detalle) return chip;
      return `<span class="gc-rol-pila">${insigniaRol("Responsable", detalle, u.cargo || tituloCargo("Responsable", fs))}</span>`;
    }
    const g = u.sub_responsable_de ? buscar(u.sub_responsable_de) : null;
    const areas = Array.isArray(u.sub_responsable_areas) ? u.sub_responsable_areas : [];
    if (g) piezas.push(insigniaRol("Sub-Responsable", g.nombre, tituloCargo("Sub-Responsable", [g.nombre]), { clase: "gc-seg-sub", estilo: `--gt:${colorSeguro(g.color)}`, icono: ICO_ESTRELLA }));
    areas.forEach((a) => {
      const det = String(a.titulo || "").indexOf("Sub-Responsable") === 0 ? sinArticulo(String(a.titulo).slice("Sub-Responsable".length)) : sinArticulo(a.titulo);
      piezas.push(insigniaRol("Sub-Responsable", det, a.titulo || "Sub-Responsable de área", { clase: "gc-seg-sub gc-seg-area", icono: ICO_ESTRELLA }));
    });
    return piezas.length ? `<span class="gc-rol-pila">${chip}${piezas.join("")}</span>` : chip;
  }

  // Grupo de trabajo de una persona, como etiqueta informativa en la fila de Usuarios.
  function grupoInfoHTML(u) {
    if (!soyAdmin() || !u || !puedeTenerGrupo(u.rol)) return "";
    const g = u.grupo_trabajo ? buscar(u.grupo_trabajo) : null;
    if (!g) return `<span class="gc-grupo gc-grupo-vacio">Sin grupo</span>`;
    return `<span class="gc-grupo" style="--gt:${colorSeguro(g.color)}" title="Grupo de trabajo"><i aria-hidden="true"></i>${esc(g.nombre)}</span>`;
  }

  // Quién es el Sub-Responsable de cada grupo, dentro de su tarjeta de Información.
  function ordenarMiembros(g) {
    const m = (g.miembros || []).slice();
    if (g.lider) m.sort((a, b) => (Number(b.id === g.lider.id)) - (Number(a.id === g.lider.id)));
    return m;
  }
  function liderBloqueHTML(g, admin) {
    const miembros = g.miembros || [];
    const l = g.lider;
    if (!l && !admin) return "";
    const quien = l
      ? `${avatarHTML(l)}<span class="gt-lider-txt"><small>${esc(g.titulo_lider || "Sub-Responsable")}</small><b>${esc(l.nombre)}${l.id === miId() ? " <em>(tú)</em>" : ""}</b></span>`
      : `<span class="gt-lider-txt"><small>Sub-Responsable</small><b>Sin nombrar</b></span>`;
    const selector = admin && miembros.length
      ? `<label class="gt-lider-sel"><span class="gt-sr">Sub-Responsable de ${esc(g.nombre)}</span><select data-gt-lider-sel="${esc(g.id)}" aria-label="Sub-Responsable de ${esc(g.nombre)}"><option value="">Sin Sub-Responsable</option>${miembros.map((m) => `<option value="${Number(m.id)}"${l && l.id === m.id ? " selected" : ""}>${esc(m.nombre)}</option>`).join("")}</select></label>`
      : (admin ? `<span class="gt-lider-nota">Añade personas al grupo para nombrar a su Sub-Responsable.</span>` : "");
    return `<div class="gt-lider${l ? "" : " gt-lider-vacio"}">${quien}${selector}</div>`;
  }
  // Opción extra del menú de grupo de la tabla de Usuarios: nombrar / quitar Sub-Responsable.
  function liderMenuHTML(u, grupoId) {
    const g = grupoId ? buscar(grupoId) : null;
    if (!g) return "";
    const es = g.lider && Number(g.lider.id) === Number(u.id);
    return `<button type="button" class="gt-menu-lider${es ? " activo" : ""}" data-gt-lider="${esc(g.id)}" data-gt-lider-user="${es ? "" : Number(u.id)}">${ICO_ESTRELLA}${es ? "Quitar como " : "Nombrar "}Sub-Responsable de ${esc(g.nombre)}</button>`;
  }

  async function fijarLider(grupoId, userId) {
    if (!soyAdmin()) return;
    if (typeof usuariosPuedeEscribir === "function" && !usuariosPuedeEscribir()) { refrescarTodo(); return; }
    try {
      const r = await apiFetch("/api/grupos-trabajo/lider", { method: "PUT", body: JSON.stringify({ grupo_id: grupoId, user_id: userId || null }) });
      if (r && Array.isArray(r.grupos)) { estado.grupos = r.grupos; estado.mio = r.mio || null; estado.cargado = true; }
      sincronizarCargos();
      const g = buscar(grupoId);
      toast(userId && g && g.lider ? `${g.lider.nombre} es ahora ${g.titulo_lider || "Sub-Responsable"}` : "El grupo se ha quedado sin Sub-Responsable", "success");
    } catch (err) {
      toast((err && err.message) || "No se ha podido cambiar el Sub-Responsable", "error");
    }
    refrescarTodo();
  }

  // ---------- Responsables (sección de Información) ----------
  async function cargarResponsables() {
    if (!veoGrupos()) return;
    try {
      const r = await apiFetch("/api/responsables");
      if (r && Array.isArray(r.responsables)) { estado.responsables = r.responsables; estado.respCargado = true; estado.respError = null; }
      else estado.respError = "Respuesta no válida";
    } catch (err) {
      estado.respError = (err && err.message) || "No se han podido cargar los Responsables";
    }
  }

  function pintarResponsables() {
    const cont = document.getElementById("responsablesEquipo");
    if (!cont) return;
    const seccion = document.getElementById("infoResponsables");
    if (seccion) seccion.hidden = !veoGrupos();
    if (!veoGrupos()) { cont.innerHTML = ""; return; }
    if (!estado.respCargado) {
      cont.innerHTML = estado.respError
        ? `<div class="gt-vacio"><p>No se han podido cargar los Responsables (${esc(estado.respError)}).</p><button type="button" class="gt-btn" data-gt="reintentar">Reintentar</button></div>`
        : `<div class="gt-esqueleto" aria-busy="true" aria-label="Cargando Responsables"><span></span><span></span><span></span></div>`;
      return;
    }
    if (!estado.responsables.length) {
      cont.innerHTML = `<div class="gt-vacio"><span class="gt-vacio-ico">${ICO_EQUIPO}</span><h5>No hay Responsables activos</h5></div>`;
      return;
    }
    const admin = soyAdmin();
    cont.innerHTML = `<div class="gt-rejilla gt-resp-rejilla">` + estado.responsables.map((r) => {
      const tiene = (r.funciones || []).length > 0;
      return `<article class="gt-tarjeta gt-resp${r.id === miId() ? " gt-mio" : ""}" style="--gt:#d1132e">
        <header class="gt-tarjeta-cab">
          ${avatarHTML(r, "gt-av-g")}
          <div class="gt-tarjeta-tit">
            <h5 class="gt-nombre">${esc(r.nombre)}${r.id === miId() ? " <em>(tú)</em>" : ""}</h5>
            <span class="gt-sub gt-resp-cargo">${esc(r.cargo || "Responsable")}</span>
          </div>
        </header>
        ${tiene ? "" : `<p class="gt-sin-miembros">Todavía sin funciones asignadas.</p>`}
        ${admin ? `<footer class="gt-tarjeta-pie"><button type="button" class="gt-btn gt-btn-peq" data-gt="funciones" data-gt-user="${Number(r.id)}">${ICO_LAPIZ}${tiene ? "Cambiar funciones" : "Añadir funciones"}</button></footer>` : ""}
      </article>`;
    }).join("") + `</div>`;
  }

  // Editor de funciones (modal, solo Responsables): 1-2 funciones con vista previa del cargo.
  let funcEl = null;
  let funcUser = null;

  function abrirFunciones(userId) {
    if (!soyAdmin()) return;
    if (typeof usuariosPuedeEscribir === "function" && !usuariosPuedeEscribir()) return;
    const id = Number(userId);
    const u = listaUsuarios().find((x) => Number(x.id) === id) || estado.responsables.find((x) => Number(x.id) === id);
    if (!u || (u.rol && u.rol !== "admin")) return;
    funcUser = { id, nombre: u.nombre || u.username || "", funciones: (u.funciones || []).slice(0, MAX_FUNCIONES) };
    if (!funcEl) {
      funcEl = document.createElement("div");
      funcEl.className = "modal-overlay gt-modal";
      funcEl.id = "modalFuncionesResponsable";
      funcEl.addEventListener("click", (e) => {
        if (e.target === funcEl) { cerrarFunciones(); return; }
        const b = e.target.closest("[data-gt-f]");
        if (!b) return;
        if (b.dataset.gtF === "cerrar") cerrarFunciones();
        else if (b.dataset.gtF === "guardar") guardarFunciones();
        else if (b.dataset.gtF === "sug") usarSugerencia(b.dataset.texto || "");
      });
      funcEl.addEventListener("input", (e) => { if (e.target.classList && e.target.classList.contains("gt-func-in")) vistaPreviaFunciones(); });
      document.body.appendChild(funcEl);
    }
    pintarFunciones();
    funcEl.classList.add("abierto");
    const primero = funcEl.querySelector(".gt-func-in");
    if (primero) primero.focus();
  }
  function cerrarFunciones() { if (funcEl) funcEl.classList.remove("abierto"); funcUser = null; }

  function leerFunciones() {
    if (!funcEl) return [];
    return [...funcEl.querySelectorAll(".gt-func-in")].map((i) => i.value.replace(/\s+/g, " ").trim()).filter(Boolean);
  }
  function vistaPreviaFunciones() {
    const p = document.getElementById("gtFuncPrev");
    if (p) p.textContent = tituloCargo("Responsable", leerFunciones());
  }
  function usarSugerencia(texto) {
    const ins = [...funcEl.querySelectorAll(".gt-func-in")];
    if (ins.some((i) => i.value.trim().toLowerCase() === texto.toLowerCase())) return;
    const hueco = ins.find((i) => !i.value.trim());
    if (!hueco) { toast(`Como máximo ${MAX_FUNCIONES} funciones: borra una para añadir otra.`, "info"); return; }
    hueco.value = texto;
    vistaPreviaFunciones();
  }
  function pintarFunciones() {
    if (!funcEl || !funcUser) return;
    const f = funcUser.funciones;
    funcEl.innerHTML = `<div class="modal-caja gt-caja gt-caja-func" role="dialog" aria-modal="true" aria-labelledby="gtFuncTitulo">
      <button type="button" class="modal-cerrar" data-gt-f="cerrar" aria-label="Cerrar">&times;</button>
      <header class="gt-gestor-cab">
        <span class="gt-gestor-ico">${ICO_ESTRELLA}</span>
        <div><h3 class="titulo-subseccion" id="gtFuncTitulo">Funciones de ${esc(funcUser.nombre)}</h3>
        <p class="gt-gestor-sub">Hasta ${MAX_FUNCIONES} funciones por Responsable</p></div>
      </header>
      <p class="gt-ayuda-caja"><span class="gt-ayuda-ico">${ICO_ESTRELLA}</span><span>Escríbelas <strong>con su artículo</strong> para que el cargo suene bien: «el Sitio Web», «los Recursos Humanos», «las acreditaciones». Es el nombre que verá el equipo; <strong>no cambia permisos</strong>.</span></p>
      <div class="gt-func-campos">
        ${[0, 1].map((i) => `<label class="gt-func-campo"><span>Función ${i + 1}${i === 1 ? " (opcional)" : ""}</span><input type="text" class="gt-func-in" maxlength="${MAX_LARGO_FUNCION}" value="${esc(f[i] || "")}" placeholder="${i === 0 ? "p. ej. el Sitio Web" : "p. ej. los Recursos Humanos"}" autocomplete="off"></label>`).join("")}
      </div>
      <div class="gt-ideas"><span>Ideas</span>${SUGERENCIAS_FUNCION.map((s) => `<button type="button" class="gt-idea" data-gt-f="sug" data-texto="${esc(s)}">${ICO_MAS}${esc(mayuscula(s))}</button>`).join("")}</div>
      <p class="gt-func-prevbox">Se verá como: <strong id="gtFuncPrev">${esc(tituloCargo("Responsable", f))}</strong></p>
      <div class="gt-pie">
        <span></span>
        <span class="gt-pie-der">
          <button type="button" class="gt-btn gt-btn-sec" data-gt-f="cerrar">Cancelar</button>
          <button type="button" class="gt-btn gt-btn-pri" data-gt-f="guardar">Guardar</button>
        </span>
      </div>
      <p class="gt-error" id="gtFuncError" role="alert" hidden></p>
    </div>`;
  }

  async function guardarFunciones() {
    if (!funcUser) return;
    const err = document.getElementById("gtFuncError");
    const fallo = (m) => { if (err) { err.textContent = m; err.hidden = false; } };
    if (err) err.hidden = true;
    const funciones = leerFunciones();
    if (funciones.length > MAX_FUNCIONES) return fallo(`Como máximo ${MAX_FUNCIONES} funciones.`);
    const id = funcUser.id;
    try {
      const r = await apiFetch("/api/responsables/funciones", { method: "PUT", body: JSON.stringify({ user_id: id, funciones }) });
      const nuevas = (r && Array.isArray(r.funciones)) ? r.funciones : funciones;
      const cargo = (r && r.cargo) || tituloCargo("Responsable", nuevas);
      const ficha = estado.responsables.find((x) => Number(x.id) === id);
      if (ficha) { ficha.funciones = nuevas; ficha.cargo = cargo; }
      try {
        const u = USUARIOS_LISTA.find((x) => Number(x.id) === id);
        if (u) { u.funciones = nuevas; u.cargo = cargo; }
        if (typeof usuariosGuardarCache === "function") usuariosGuardarCache(USUARIOS_LISTA);
      } catch { /* sin lista en memoria */ }
      cerrarFunciones();
      toast(`Cargo actualizado: ${cargo}`, "success");
      refrescarTodo();
    } catch (e) {
      fallo((e && e.message) || "No se han podido guardar las funciones.");
    }
  }

  // ---------- eventos delegados ----------
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-gt]");
    if (!b) return;
    if (b.dataset.gt === "chip") abrirMenu(b);
    else if (b.dataset.gt === "filtro") filtrarPorGrupo(b.dataset.gtVal);
    else if (b.dataset.gt === "gestionar") { cerrarMenu(false); abrirGestor(); }
    else if (b.dataset.gt === "anuncio") enviarAnuncio(b.dataset.gtId);
    else if (b.dataset.gt === "funciones") abrirFunciones(b.dataset.gtUser);
    else if (b.dataset.gt === "reintentar") { estado.cargado = false; estado.error = null; estado.respCargado = false; estado.respError = null; rellenarFiltro(); cargar(true); }
  });
  document.addEventListener("change", (e) => {
    const s = e.target.closest && e.target.closest("[data-gt-lider-sel]");
    if (s) fijarLider(s.dataset.gtLiderSel, s.value ? Number(s.value) : null);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (funcEl && funcEl.classList.contains("abierto")) { cerrarFunciones(); return; }
    if (menuEl) { cerrarMenu(true); return; }
    if (gestorEl && gestorEl.classList.contains("abierto")) cerrarGestor();
  });

  window.EOFGruposTrabajo = { grupoInfoHTML, datos: () => ({ grupos: estado.grupos, responsables: estado.responsables, mio: estado.mio, cargado: estado.cargado }), asignar, fijarLider, tituloCargo, sincronizarCargos, cargar, selectorHTML, cargoHTML, rolHTML, nombreDe, abrirGestor, abrirFunciones, rellenarFiltro, enviarAnuncio, puedeTenerGrupo };
})();
