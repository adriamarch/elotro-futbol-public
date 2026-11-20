// ---------- Cargos y equipo: un solo modal y un solo directorio ----------
// Reúne en UN sitio lo que antes estaba repartido:
//   · Modal «Cargos de <persona>» (solo Responsables): grupo de trabajo, Sub-Responsable del grupo y
//     Sub-Responsable de ÁREAS (acreditaciones u otras) con un interruptor cada una. Un área NO necesita ser un
//     grupo de trabajo: «las acreditaciones» existe siempre y se puede crear cualquier otra desde el mismo modal.
//   · Directorio «Equipo» en Funcionalidades > Información: todas las personas con su rol, grupo y cargos.
// No añade endpoints: reutiliza EOFGruposTrabajo (grupos, líder, funciones) y EOFAreasSub (áreas).
// Se abre desde: botón «Gestionar» de cada fila de Usuarios, tarjetas del directorio y tarjetas de áreas.
(function () {
  "use strict";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const soyAdmin = () => typeof USER !== "undefined" && !!USER && USER.rol === "admin";
  const veoEquipo = () => typeof USER === "undefined" || !USER || USER.rol === "admin" || USER.rol === "redactor";
  const miId = () => (typeof USER !== "undefined" && USER ? Number(USER.id) : -1);
  const GT = () => window.EOFGruposTrabajo || null;
  const AS = () => window.EOFAreasSub || null;
  const toast = (m, t) => { try { window.EOF.toast(m, t || "info"); } catch { /* sin avisos */ } };
  const urlAvatar = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : "");
  const colorSeguro = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : "#5b6672");
  const rolEtiqueta = (r) => (r === "fotografo" ? "Fotógrafo" : r === "admin" ? "Responsable" : "Redactor");
  const iniciales = (txt) => {
    const p = String(txt || "?").trim().split(/\s+/).filter(Boolean);
    const a = p[0] || "?";
    return (a[0] + (p.length > 1 ? p[1][0] : (a[1] || ""))).toUpperCase();
  };
  const avatar = (p, extra) => {
    const src = urlAvatar(p.avatar || p.avatar_url);
    return `<span class="ce-av${extra ? " " + extra : ""}" aria-hidden="true">${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(iniciales(p.nombre || p.username))}</span>`;
  };

  const ICO = {
    estrella: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/></svg>',
    grupo: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M15.5 14.2c3 0 5.5 1.8 5.5 4.8"/></svg>',
    llave: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/></svg>',
    lapiz: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
    mas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    buscar: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    grafico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M7 15v3M12 9v9M17 5v13"/></svg>',
  };

  // ---------- datos ----------
  let usuariosPropios = [];      // /api/users cargado por este módulo si Usuarios aún no se ha abierto
  let pidiendoUsuarios = false;

  function listaUsuarios() {
    if (typeof USUARIOS_LISTA !== "undefined" && Array.isArray(USUARIOS_LISTA) && USUARIOS_LISTA.length) return USUARIOS_LISTA;
    return usuariosPropios;
  }
  async function asegurarUsuarios() {
    if (!soyAdmin() || pidiendoUsuarios) return;
    if (typeof USUARIOS_LISTA !== "undefined" && Array.isArray(USUARIOS_LISTA) && USUARIOS_LISTA.length) return;
    if (usuariosPropios.length) return;
    pidiendoUsuarios = true;
    try {
      const r = await apiFetch("/api/users");
      usuariosPropios = (r && Array.isArray(r.users)) ? r.users : [];
    } catch { usuariosPropios = []; }
    pidiendoUsuarios = false;
    pintarEquipo();
  }

  // Une todas las fuentes en una lista de personas con sus cargos ya calculados.
  function construirPersonas() {
    const g = GT() ? GT().datos() : { grupos: [], responsables: [], cargado: false };
    const areas = AS() && AS().cargado() ? AS().areas() : [];
    const mapa = new Map();
    const tomar = (id, base) => {
      id = Number(id);
      const p = mapa.get(id) || { id, nombre: "", rol: "", avatar: "", cargos: [], grupo: null, esLider: false, areasIds: [], funciones: [] };
      Object.keys(base || {}).forEach((k) => { if (base[k] != null && base[k] !== "" && !(Array.isArray(base[k]) && !base[k].length)) p[k] = base[k]; });
      mapa.set(id, p);
      return p;
    };
    if (soyAdmin()) {
      listaUsuarios().forEach((u) => {
        if (Number(u.activo) !== 1 && u.activo !== true) return;
        if (u.rol === "fotografo" || u.rol === "redactor" || u.rol === "admin") {
          tomar(u.id, { nombre: u.nombre || u.username, rol: u.rol, avatar: u.avatar_url, funciones: u.funciones || [] });
        }
      });
    }
    (g.responsables || []).forEach((r) => tomar(r.id, { nombre: r.nombre, rol: "admin", avatar: r.avatar, funciones: r.funciones || [] }));
    (g.grupos || []).forEach((gr) => (gr.miembros || []).forEach((m) => {
      const p = tomar(m.id, { nombre: m.nombre, rol: m.rol, avatar: m.avatar });
      p.grupo = { id: gr.id, nombre: gr.nombre, color: colorSeguro(gr.color) };
      if (gr.lider && Number(gr.lider.id) === Number(m.id)) p.esLider = true;
    }));
    areas.forEach((a) => (a.miembros || []).forEach((m) => {
      const p = tomar(m.id, { nombre: m.nombre, rol: "redactor", avatar: m.avatar });
      if (!p.rol) p.rol = "redactor";
      p.areasIds.push(a.id);
    }));
    const tit = GT() ? GT().tituloCargo : (a, b) => a;
    mapa.forEach((p) => {
      if (p.rol === "admin") p.cargos.push({ tipo: "resp", texto: tit("Responsable", p.funciones) });
      if (p.esLider && p.grupo) p.cargos.push({ tipo: "sub", texto: tit("Sub-Responsable", [p.grupo.nombre]), color: p.grupo.color });
      p.areasIds.forEach((id) => { const a = areas.find((x) => x.id === id); if (a) p.cargos.push({ tipo: "area", texto: a.titulo, permiso: !!a.permiso }); });
    });
    return [...mapa.values()].filter((p) => p.nombre).sort((a, b) => {
      const peso = (p) => (p.rol === "admin" ? 0 : (p.cargos.length ? 1 : (p.rol === "redactor" ? 2 : 3)));
      return peso(a) - peso(b) || String(a.nombre).localeCompare(String(b.nombre), "es");
    });
  }

  // ---------- directorio «Equipo» ----------
  const filtro = { texto: "", vista: "todos" };
  let listaEl = null;

  function pintarEquipo() {
    const cont = document.getElementById("equipoCargos");
    const seccion = document.getElementById("infoEquipo");
    if (seccion) seccion.hidden = !veoEquipo();
    if (!cont || !veoEquipo()) return;
    const cargado = GT() && GT().datos().cargado;
    if (!cargado) {
      cont.innerHTML = `<div class="ce-esqueleto" aria-busy="true" aria-label="Cargando el equipo"><span></span><span></span><span></span></div>`;
      listaEl = null;
      return;
    }
    if (!document.getElementById("ceListaEquipo")) montarEsqueletoEquipo(cont);
    pintarLista();
    if (soyAdmin()) asegurarUsuarios();
  }

  function montarEsqueletoEquipo(cont) {
    const vistas = [["todos", "Todos"], ["resp", "Responsables"], ["sub", "Con cargo"], ["redactor", "Redactores"]];
    if (soyAdmin()) vistas.push(["fotografo", "Fotógrafos"]);
    cont.innerHTML = `<div class="ce-barra">
        <label class="ce-buscar">${ICO.buscar}<span class="ce-sr">Buscar en el equipo</span><input type="search" id="ceBuscar" placeholder="Buscar por nombre, cargo o grupo…" autocomplete="off" value="${esc(filtro.texto)}"></label>
        <div class="ce-chips" role="group" aria-label="Filtrar el equipo">${vistas.map(([k, t]) => `<button type="button" class="ce-chip${filtro.vista === k ? " activo" : ""}" data-ce-vista="${k}">${t}<b></b></button>`).join("")}</div>
      </div>
      <p class="ce-resumen" id="ceResumen" aria-live="polite"></p>
      <div class="ce-rejilla" id="ceListaEquipo"></div>`;
  }

  function coincide(p, q) {
    if (!q) return true;
    const base = [p.nombre, rolEtiqueta(p.rol), p.grupo && p.grupo.nombre].concat(p.cargos.map((c) => c.texto)).join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => base.includes(t));
  }
  const enVista = (p, v) => v === "todos" || (v === "resp" && p.rol === "admin") || (v === "sub" && p.cargos.length > 0 && p.rol !== "admin")
    || (v === "redactor" && p.rol === "redactor") || (v === "fotografo" && p.rol === "fotografo");

  function tarjetaPersona(p) {
    const gr = p.grupo ? `<span class="ce-grupo" style="--gt:${esc(p.grupo.color)}"><i></i>${esc(p.grupo.nombre)}</span>` : (p.rol === "fotografo" ? "" : `<span class="ce-grupo ce-grupo-no">Sin grupo</span>`);
    const cargos = p.cargos.length
      ? p.cargos.map((c) => `<span class="ce-cargo ce-cargo-${c.tipo}"${c.color ? ` style="--gt:${esc(c.color)}"` : ""}${c.permiso ? ' title="Este cargo da un permiso en el panel"' : ""}>${c.tipo === "resp" ? "" : ICO.estrella}${esc(c.texto)}</span>`).join("")
      : `<span class="ce-cargo ce-cargo-vacio">${p.rol === "fotografo" ? "Fotografía" : "Sin cargo"}</span>`;
    const puedeEditar = soyAdmin() && p.rol !== "fotografo";
    return `<article class="ce-persona${p.id === miId() ? " ce-yo" : ""}" data-ce-persona="${p.id}">
      <header>${avatar(p, "ce-av-g")}<div class="ce-quien"><h5>${esc(p.nombre)}${p.id === miId() ? " <em>(tú)</em>" : ""}</h5><span class="ce-rol" data-rol="${esc(p.rol)}">${esc(rolEtiqueta(p.rol))}</span></div></header>
      <div class="ce-cargos">${cargos}</div>
      ${gr || puedeEditar ? `<footer>${gr}${puedeEditar ? `<button type="button" class="ce-btn ce-btn-peq" data-ce="cargos" data-ce-user="${p.id}">${ICO.lapiz}Gestionar</button>` : ""}</footer>` : ""}
    </article>`;
  }

  function pintarLista() {
    const lista = document.getElementById("ceListaEquipo");
    if (!lista) return;
    const todas = construirPersonas();
    const q = filtro.texto.trim();
    const visibles = todas.filter((p) => enVista(p, filtro.vista) && coincide(p, q));
    document.querySelectorAll("#equipoCargos [data-ce-vista]").forEach((b) => {
      const k = b.dataset.ceVista;
      b.classList.toggle("activo", filtro.vista === k);
      const n = b.querySelector("b"); if (n) n.textContent = todas.filter((p) => enVista(p, k) && coincide(p, q)).length;
    });
    const res = document.getElementById("ceResumen");
    if (res) res.textContent = `${visibles.length} ${visibles.length === 1 ? "persona" : "personas"}${q || filtro.vista !== "todos" ? ` de ${todas.length}` : ""}`;
    lista.innerHTML = visibles.length ? visibles.map(tarjetaPersona).join("")
      : `<div class="ce-vacio">${ICO.grupo}<p>Nadie coincide con ese filtro.</p></div>`;
  }

  document.addEventListener("input", (e) => {
    if (e.target && e.target.id === "ceBuscar") { filtro.texto = e.target.value; pintarLista(); }
  });

  // ---------- modal «Gestionar colaborador» ----------
  // Un solo modal con tres pestañas que sustituye a los antiguos modales sueltos (Cargos, Equipo y categoría,
  // Nivel) y a los botones de la fila de Usuarios:
  //   · Rol y cargos   → rol, grupo, Sub-Responsable de grupo y de áreas, funciones. Se guarda al instante.
  //   · Equipo y nivel → equipos, categoría complementaria, nivel y nota. Un único «Guardar cambios».
  //   · Cuenta         → nueva contraseña, 2FA, firma sin apellidos, activa/inactiva, avisos y Eliminar.
  // Reutiliza los endpoints actuales (PUT /api/users/:id, /nivel, reset-password, reset-2fa, DELETE): sin migraciones.
  let modal = null;
  let personaId = null;
  let ocupado = false;
  let focoPrevio = null;
  let pestana = "cargos";
  let eq = null; // estado de la pestaña «Equipo y nivel» (pickers, nivel inicial…)

  function datosPersona(id) {
    const u = listaUsuarios().find((x) => Number(x.id) === Number(id));
    const p = construirPersonas().find((x) => x.id === Number(id));
    if (!u && !p) return null;
    return {
      id: Number(id),
      nombre: (u && (u.nombre || u.username)) || (p && p.nombre) || "",
      rol: (u && u.rol) || (p && p.rol) || "redactor",
      avatar: (u && u.avatar_url) || (p && p.avatar) || "",
      funciones: (u && u.funciones) || (p && p.funciones) || [],
      activo: u ? (Number(u.activo) === 1 || u.activo === true) : true,
    };
  }
  const usuarioDe = (id) => listaUsuarios().find((x) => Number(x.id) === Number(id)) || null;
  const soyYo = (id) => Number(id) === miId();

  // Pide la lista fresca al servidor (la tabla de Usuarios se repinta sola) y devuelve la persona actualizada.
  async function recargar() {
    try { if (typeof cargaUsuarios === "function") await cargaUsuarios({ silencioso: true }); } catch { /* se mantiene la lista en memoria */ }
  }

  async function abrir(userId, tab) {
    if (!soyAdmin()) return;
    if (typeof usuariosPuedeEscribir === "function" && !usuariosPuedeEscribir()) {
      toast("La lista no está actualizada todavía: espera un momento y vuelve a intentarlo", "error");
      return;
    }
    if (!usuarioDe(userId)) await asegurarUsuarios();
    const d = datosPersona(userId);
    if (!d || !usuarioDe(userId)) { toast("No se ha encontrado a esa persona", "error"); return; }
    personaId = Number(userId);
    focoPrevio = document.activeElement;
    pestana = ["cargos", "equipo", "actividad", "estadisticas", "cuenta"].includes(tab) && !bloqueada(tab, d) ? tab : (d.rol === "fotografo" ? "equipo" : "cargos");
    if (!modal) {
      modal = document.createElement("div");
      modal.className = "modal-overlay ce-modal gc-modal";
      modal.id = "modalCargosEquipo";
      modal.addEventListener("click", alClickModal);
      modal.addEventListener("change", alCambioModal);
      modal.addEventListener("submit", alEnviarModal);
      modal.addEventListener("keydown", alTeclaModal);
      document.body.appendChild(modal);
    }
    pintarShell();
    modal.classList.add("abierto", "ce-anima");
    setTimeout(() => { if (modal) modal.classList.remove("ce-anima"); }, 320);
    const t = modal.querySelector(".gc-tab[aria-selected='true']") || modal.querySelector("[data-ce='cerrar']");
    if (t) t.focus();
    cargarNivel(personaId);
    // Asegura datos frescos de grupos y áreas por si otro Responsable los cambió.
    Promise.all([GT() && GT().cargar(true), AS() && AS().cargar()]).then(() => { if (modal && modal.classList.contains("abierto")) pintarDinamicos(); });
  }
  function cerrar() {
    if (!modal) return;
    modal.classList.remove("abierto");
    personaId = null;
    eq = null;
    if (focoPrevio && focoPrevio.focus && document.contains(focoPrevio)) { try { focoPrevio.focus(); } catch { /* sin foco */ } }
  }

  function interruptor(attrs, activo, titulo, ayuda, extraClase) {
    return `<div class="ce-fila${activo ? " ce-fila-on" : ""}${extraClase ? " " + extraClase : ""}">
      <div class="ce-fila-txt"><b>${titulo}</b>${ayuda ? `<small>${ayuda}</small>` : ""}</div>
      <button type="button" class="ce-switch" role="switch" aria-checked="${activo ? "true" : "false"}" aria-label="${esc(String(titulo).replace(/<[^>]+>/g, ""))}" ${attrs}${ocupado ? " disabled" : ""}><i></i></button>
    </div>`;
  }

  function seccionGrupo(d, grupos) {
    if (!grupos.length) {
      return `<section class="ce-sec"><h4><span>${ICO.grupo}</span>Grupo de trabajo</h4>
        <p class="ce-nota">Todavía no hay grupos de trabajo. Puedes crearlos desde Usuarios; mientras tanto sigues pudiendo dar cargos de área abajo.</p></section>`;
    }
    const g = grupos.find((x) => (x.miembros || []).some((m) => Number(m.id) === d.id)) || null;
    const esLider = !!(g && g.lider && Number(g.lider.id) === d.id);
    return `<section class="ce-sec"><h4><span>${ICO.grupo}</span>Grupo de trabajo</h4>
      <label class="ce-campo"><span class="ce-sr">Grupo de trabajo de ${esc(d.nombre)}</span>
        <select data-ce-grupo${ocupado ? " disabled" : ""}>
          <option value="">Sin grupo</option>
          ${grupos.map((x) => `<option value="${esc(x.id)}"${g && g.id === x.id ? " selected" : ""}>${esc(x.nombre)}</option>`).join("")}
        </select></label>
      ${g ? interruptor(`data-ce-lider="${esc(g.id)}" data-ce-quitar="${esveces(esLider)}"`, esLider, `Sub-Responsable de ${esc(g.nombre)}`, esLider ? "Es quien lidera este grupo." : (g.lider ? `Ahora lo es ${esc(g.lider.nombre)}; si lo activas, pasará a serlo ${esc(d.nombre)}.` : "El grupo no tiene Sub-Responsable todavía.")) : `<p class="ce-nota">Elige un grupo para poder nombrarle Sub-Responsable del mismo.</p>`}
    </section>`;
  }
  const esveces = (b) => (b ? "1" : "0");

  function seccionAreas(d, areas) {
    if (d.rol === "admin") {
      return `<section class="ce-sec"><h4><span>${ICO.llave}</span>Sub-Responsable de áreas</h4>
        <p class="ce-nota">Un Responsable ya tiene acceso a todo, incluidas las acreditaciones. Los cargos de área son para redactores.</p></section>`;
    }
    if (!d.activo) {
      return `<section class="ce-sec"><h4><span>${ICO.llave}</span>Sub-Responsable de áreas</h4>
        <p class="ce-nota">Esta cuenta está desactivada. Actívala para poder darle un cargo de área.</p></section>`;
    }
    const filas = areas.map((a) => {
      const es = (a.miembros || []).some((m) => Number(m.id) === d.id);
      const lleno = !es && (a.miembros || []).length >= 5;
      const permiso = a.permiso
        ? `<span class="ce-perm ce-perm-si">Puede gestionar las solicitudes de acreditación</span>`
        : `<span class="ce-perm">Solo cargo, no cambia permisos</span>`;
      return interruptor(`data-ce-area="${esc(a.id)}" data-ce-quitar="${esveces(es)}"${lleno ? " disabled title=\"Máximo 5 personas por área\"" : ""}`, es, esc(a.titulo), permiso, a.fija ? "ce-fila-destacada" : "");
    }).join("");
    return `<section class="ce-sec"><h4><span>${ICO.llave}</span>Sub-Responsable de áreas</h4>
      <p class="ce-nota">Las áreas no son grupos de trabajo: una persona puede tener las que quieras, estén o no en un grupo.</p>
      <div class="ce-filas">${filas || `<p class="ce-nota">Todavía no hay áreas.</p>`}</div>
      <form class="ce-nueva" data-ce-form="area" autocomplete="off">
        <label for="ceNuevaArea" class="ce-sr">Nueva área</label>
        <input id="ceNuevaArea" type="text" maxlength="40" placeholder="Nueva área con artículo: el Diseño, las Redes…"${ocupado ? " disabled" : ""}>
        <button type="submit" class="ce-btn ce-btn-peq"${ocupado ? " disabled" : ""}>${ICO.mas}Crear y nombrar</button>
      </form>
    </section>`;
  }

  function seccionFunciones(d) {
    if (d.rol !== "admin") return "";
    const f = (d.funciones || []).filter(Boolean);
    const cargo = GT() ? GT().tituloCargo("Responsable", f) : "Responsable";
    return `<section class="ce-sec"><h4><span>${ICO.estrella}</span>Funciones del Responsable</h4>
      <p class="ce-cargo-vista">${esc(cargo)}</p>
      <button type="button" class="ce-btn ce-btn-peq" data-ce="funciones">${ICO.lapiz}${f.length ? "Cambiar funciones" : "Añadir funciones"}</button>
    </section>`;
  }


  Object.assign(ICO, {
    persona: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg>',
    nivel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20v-7M12 20V5M19 20v-10"/></svg>',
    candado: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    ojo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
    papelera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    sobre: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>',
  });

  const PESTANAS = [["cargos", "Rol y cargos", "estrella"], ["equipo", "Equipo y nivel", "nivel"], ["actividad", "Actividad", "reloj"], ["estadisticas", "Estadísticas", "grafico"], ["cuenta", "Cuenta", "candado"]];
  // Los Responsables se dedican solo a serlo: no tienen equipo ni categoría y su nivel es siempre el máximo.
  // La pestaña «Equipo y nivel» se ve, pero bloqueada (no se puede abrir).
  const pestanasDe = () => PESTANAS;
  const bloqueada = (k, d) => k === "equipo" && !!d && d.rol === "admin";

  function pintarShell() {
    const d = datosPersona(personaId);
    if (!d) { cerrar(); return; }
    modal.innerHTML = `<div class="modal-caja ce-caja gc-caja" role="dialog" aria-modal="true" aria-labelledby="ceTitulo">
      <button type="button" class="modal-cerrar" data-ce="cerrar" aria-label="Cerrar">&times;</button>
      <header class="ce-cab" id="gcCab"></header>
      <div class="gc-tabs" role="tablist" aria-label="Qué quieres gestionar">${pestanasDe(d).map(([k, t, i]) => bloqueada(k, d)
        ? `<button type="button" class="gc-tab gc-tab-bloqueada" role="tab" id="gcTab-${k}" data-gc-tab="${k}" aria-controls="gcPan-${k}" aria-selected="false" aria-disabled="true" disabled tabindex="-1" title="Los Responsables no tienen equipo ni nivel: se dedican solo a serlo">${ICO[i]}<span>${t}</span>${ICO.candado}</button>`
        : `<button type="button" class="gc-tab" role="tab" id="gcTab-${k}" data-gc-tab="${k}" aria-controls="gcPan-${k}" aria-selected="false" tabindex="-1">${ICO[i]}<span>${t}</span></button>`).join("")}</div>
      <div class="ce-cuerpo gc-cuerpo">
        ${pestanasDe(d).map(([k]) => `<div class="gc-panel" role="tabpanel" id="gcPan-${k}" aria-labelledby="gcTab-${k}" hidden>${k === "actividad" ? `<div id="gcActAvisos"></div><div class="gc-act-est" id="gcActEst"></div><div id="gcActExc"></div>` : ""}</div>`).join("")}
      </div>
      <p class="gc-msg" id="gcMsg" role="alert" hidden></p>
      <footer class="ce-pie" id="gcPie"></footer>
    </div>`;
    pintarDinamicos();
    pintarPanelEq();
    if (bloqueada(pestana, d)) pestana = "cargos"; // p. ej. al pasar a Responsable desde «Equipo y nivel»
    mostrarPestana(pestana);
  }

  function mostrarPestana(k) {
    if (!modal) return;
    if (bloqueada(k, datosPersona(personaId))) k = "cargos";
    pestana = k;
    pestanasDe().forEach(([clave]) => {
      const t = modal.querySelector(`#gcTab-${clave}`);
      const p = modal.querySelector(`#gcPan-${clave}`);
      const on = clave === k;
      if (t) { t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1; }
      if (p) p.hidden = !on;
    });
    aviso("");
    pintarPie();
    if (k === "actividad") { pintarAvisosActividad(); cargarEstadisticas(); cargarActividad(); }
    if (k === "estadisticas") cargarEstadisticas();
  }

  function aviso(texto, tipo) {
    const m = modal && modal.querySelector("#gcMsg");
    if (!m) return;
    m.textContent = texto || "";
    m.hidden = !texto;
    m.className = "gc-msg" + (tipo === "ok" ? " gc-msg-ok" : tipo ? " gc-msg-err" : "");
  }

  function claveFoco(el) {
    if (!el || !el.closest || !el.closest("#gcPan-cargos,#gcPan-cuenta")) return "";
    if (el.dataset.ceArea) return `[data-ce-area="${CSS.escape(el.dataset.ceArea)}"]`;
    if (el.dataset.ceLider) return `[data-ce-lider="${CSS.escape(el.dataset.ceLider)}"]`;
    if (el.dataset.gcSw) return `[data-gc-sw="${CSS.escape(el.dataset.gcSw)}"]`;
    if (el.dataset.gc) return `[data-gc="${CSS.escape(el.dataset.gc)}"]`;
    if (el.hasAttribute("data-ce-grupo")) return "[data-ce-grupo]";
    if (el.hasAttribute("data-gc-rol")) return "[data-gc-rol]";
    return "";
  }

  // Repinta lo que cambia solo (cabecera, cargos, cuenta, pie) SIN tocar la pestaña «Equipo y nivel»,
  // para no perder lo que se esté editando en ella.
  function pintarDinamicos() {
    if (!modal || personaId == null) return;
    if (!datosPersona(personaId)) { cerrar(); return; }
    // En escritorio el que hace scroll es el cuerpo de la pestaña; en móvil, la caja entera.
    const caja0 = modal.querySelector(".ce-caja");
    const cuerpo0 = modal.querySelector(".gc-cuerpo");
    const scroll0 = caja0 ? caja0.scrollTop : 0;
    const scrollC0 = cuerpo0 ? cuerpo0.scrollTop : 0;
    const enfoque = modal.contains(document.activeElement) ? document.activeElement : null;
    const clave = claveFoco(enfoque);
    pintarCab();
    pintarCargos();
    pintarCuenta();
    pintarAvisosActividad();
    pintarPie();
    const caja1 = modal.querySelector(".ce-caja");
    if (caja1 && scroll0) caja1.scrollTop = scroll0;
    const cuerpo1 = modal.querySelector(".gc-cuerpo");
    if (cuerpo1 && scrollC0) cuerpo1.scrollTop = scrollC0;
    if (clave) { const n = modal.querySelector(clave); if (n && !n.disabled) n.focus(); }
  }

  function pintarCab() {
    const cab = modal.querySelector("#gcCab");
    const d = datosPersona(personaId);
    if (!cab || !d) return;
    const u = usuarioDe(personaId) || {};
    const p = construirPersonas().find((x) => x.id === d.id);
    const cargos = p && p.cargos.length ? p.cargos.map((c) => `<span class="ce-cargo ce-cargo-${c.tipo}"${c.color ? ` style="--gt:${esc(c.color)}"` : ""}>${c.tipo === "resp" ? "" : ICO.estrella}${esc(c.texto)}</span>`).join("") : "";
    const sub = [u.username ? "@" + esc(u.username) : "", u.email ? esc(u.email) : ""].filter(Boolean).join(" · ");
    cab.innerHTML = `${avatar(d, "ce-av-xl")}
      <div class="ce-cab-txt"><span class="ce-eyebrow">Gestionar colaborador</span><h3 id="ceTitulo">${esc(d.nombre)}${soyYo(d.id) ? " <em>(tú)</em>" : ""}</h3>
        ${sub ? `<span class="gc-sub">${sub}</span>` : ""}
        <div class="ce-cargos"><span class="gc-chip gc-rol-${esc(d.rol)}">${esc(rolEtiqueta(d.rol))}</span><span class="gc-chip ${d.activo ? "gc-chip-ok" : "gc-chip-off"}">${d.activo ? "Activo" : "Inactivo"}</span>${cargos}</div>
        <a class="gc-perfil" href="../autor.html?id=${Number(d.id)}" target="_blank" rel="noopener">${ICO.ojo}Ver perfil público</a></div>`;
  }

  function pintarPie() {
    const pie = modal && modal.querySelector("#gcPie");
    if (!pie) return;
    if (pestana === "equipo") {
      pie.innerHTML = `<span class="ce-pie-nota">${ICO.ok}Equipos, categoría y nivel se guardan juntos</span><button type="button" class="ce-btn ce-btn-pri" data-gc="guardar"${ocupado ? " disabled" : ""}>Guardar cambios</button>`;
    } else {
      pie.innerHTML = `<span class="ce-pie-nota">${ICO.ok}Los cambios se guardan al instante</span><button type="button" class="ce-btn ce-btn-pri" data-ce="cerrar">Listo</button>`;
    }
  }

  // ---------- pestaña «Rol y cargos» ----------
  function seccionRol(d) {
    const yo = soyYo(d.id);
    const opt = (v, t) => `<option value="${v}"${d.rol === v ? " selected" : ""}>${t}</option>`;
    return `<section class="ce-sec"><h4><span>${ICO.persona}</span>Rol</h4>
      <label class="ce-campo"><span class="ce-sr">Rol de ${esc(d.nombre)}</span>
        <select data-gc-rol${yo || ocupado ? " disabled" : ""}${yo ? ' title="No puedes cambiar tu propio rol"' : ""}>${opt("redactor", "Redactor")}${opt("fotografo", "Fotógrafo")}${opt("admin", "Responsable")}</select></label>
      ${yo ? `<p class="ce-nota">No puedes cambiar tu propio rol.</p>` : ""}
    </section>`;
  }

  function pintarCargos() {
    const cont = modal.querySelector("#gcPan-cargos");
    const d = datosPersona(personaId);
    if (!cont || !d) return;
    const grupos = GT() ? GT().datos().grupos : [];
    const areas = AS() && AS().cargado() ? AS().areas() : [];
    if (d.rol === "fotografo") {
      cont.innerHTML = seccionRol(d) + `<section class="ce-sec"><h4><span>${ICO.grupo}</span>Grupo y cargos</h4>
        <p class="ce-nota">Los fotógrafos no tienen grupo de trabajo ni cargos de área.</p></section>`;
      return;
    }
    cont.innerHTML = seccionRol(d) + seccionGrupo(d, grupos) + seccionAreas(d, areas) + seccionFunciones(d);
  }


  // ---------- pestaña «Actividad»: excepcionalidades de actividad ----------
  // Un Responsable concede a un redactor 3 días o 1 semana de margen extra de inactividad por una causa
  // justificable (estudios, fallecimiento de un familiar, salud…). Mientras dura no recibe avisos de inactividad,
  // esos días no cuentan como tiempo sin subir nada y se le manda un correo automático. Endpoints (solo
  // Responsables): GET/POST /api/users/:id/excepcionalidades y DELETE /api/users/:id/excepcionalidades/:eid.
  let act = { id: null, cargando: false, error: "", datos: null };

  const fechaExc = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(iso || ""); };
  const ESTADO_EXC = { vigente: ["En vigor", "gc-exc-vigente"], programada: ["Programada", "gc-exc-programada"], finalizada: ["Finalizada", "gc-exc-fin"], cancelada: ["Cancelada", "gc-exc-cancelada"] };

  // Desplegable propio para «Causa» (el <select> nativo no admite iconos ni descripciones y en móvil queda pobre).
  // Mantiene un <input type="hidden" data-gc-exc="causa"> para que el resto del código siga leyendo .value, y lanza
  // un evento «change» al elegir para que alCambioModal siga mostrando u ocultando «Indefinida».
  const CAUSA_VISUAL = {
    estudios: ["🎓", "Exámenes, trabajos o entregas"],
    fallecimiento_familiar: ["🕊️", "Admite duración indefinida"],
    salud: ["🩺", "Enfermedad o lesión"],
    familiar: ["👨‍👩‍👧", "Asuntos de familia"],
    laboral: ["💼", "Carga de trabajo"],
    viaje: ["✈️", "Viaje o vacaciones"],
    otra: ["✍️", "Obliga a escribir el motivo"],
  };
  const ICO_CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  function desplegableCausa(causas, valor) {
    const vis = (id) => CAUSA_VISUAL[id] || ["•", ""];
    const act = causas.find((c) => c.id === valor) || causas[0] || { id: "", etiqueta: "" };
    const fila = (c) => `<li role="option" class="gc-dd-op" id="gcDdOp-${esc(c.id)}" data-gc-dd-val="${esc(c.id)}" aria-selected="${c.id === act.id ? "true" : "false"}"><span class="gc-dd-ico">${vis(c.id)[0]}</span><span class="gc-dd-txt"><b>${esc(c.etiqueta)}</b>${vis(c.id)[1] ? `<small>${esc(vis(c.id)[1])}</small>` : ""}</span><span class="gc-dd-ok">${ICO.ok}</span></li>`;
    return `<div class="gc-dd" data-gc-dd>
      <input type="hidden" data-gc-exc="causa" value="${esc(act.id)}">
      <button type="button" class="gc-dd-btn" data-gc-dd-btn aria-haspopup="listbox" aria-expanded="false" aria-controls="gcDdLista" aria-label="Causa"><span class="gc-dd-ico">${vis(act.id)[0]}</span><span class="gc-dd-txt"><b>${esc(act.etiqueta)}</b></span><span class="gc-dd-chev">${ICO_CHEVRON}</span></button>
      <ul class="gc-dd-lista" id="gcDdLista" role="listbox" tabindex="-1" hidden>${causas.map(fila).join("")}</ul>
    </div>`;
  }
  function cerrarDesplegables(salvo) {
    if (!modal) return false;
    let hubo = false;
    modal.querySelectorAll("[data-gc-dd]").forEach((dd) => {
      if (dd === salvo) return;
      const l = dd.querySelector(".gc-dd-lista");
      if (l && !l.hidden) { l.hidden = true; hubo = true; }
      const b = dd.querySelector("[data-gc-dd-btn]"); if (b) b.setAttribute("aria-expanded", "false");
    });
    return hubo;
  }
  function abrirDesplegable(dd) {
    const l = dd.querySelector(".gc-dd-lista"); const b = dd.querySelector("[data-gc-dd-btn]");
    if (!l || !b || b.disabled) return;
    cerrarDesplegables(dd);
    l.hidden = false; b.setAttribute("aria-expanded", "true");
    const sel = l.querySelector('[aria-selected="true"]') || l.querySelector(".gc-dd-op");
    marcarOpcion(l, sel);
    try { l.scrollIntoView({ block: "nearest" }); } catch { /* sin scroll */ }
  }
  function marcarOpcion(l, op) {
    l.querySelectorAll(".gc-dd-op.gc-dd-foco").forEach((n) => n.classList.remove("gc-dd-foco"));
    if (!op) return;
    op.classList.add("gc-dd-foco"); l.setAttribute("aria-activedescendant", op.id);
    try { op.scrollIntoView({ block: "nearest" }); } catch { /* sin scroll */ }
  }
  function elegirCausa(dd, op) {
    const val = op.dataset.gcDdVal;
    const inp = dd.querySelector('[data-gc-exc="causa"]'); const b = dd.querySelector("[data-gc-dd-btn]");
    if (!inp || !b) return;
    inp.value = val;
    dd.querySelectorAll(".gc-dd-op").forEach((n) => n.setAttribute("aria-selected", n === op ? "true" : "false"));
    b.querySelector(".gc-dd-ico").innerHTML = op.querySelector(".gc-dd-ico").innerHTML;
    b.querySelector(".gc-dd-txt").innerHTML = `<b>${op.querySelector("b").innerHTML}</b>`;
    cerrarDesplegables(); b.focus();
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  }
  // Atajos de fecha (hoy, mañana, próximo lunes), siempre dentro de [hoy, hoy + antelación máxima].
  function atajosFecha(hoy, maxDias) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoy || ""); if (!m) return "";
    const base = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
    const dow = new Date(base).getUTCDay(); // 0 = domingo
    const aLunes = ((8 - dow) % 7) || 7;
    const opts = [["Hoy", 0], ["Mañana", 1], ["Próximo lunes", aLunes]].filter(([, n], i, a) => n <= (maxDias || 30) && a.findIndex((x) => x[1] === n) === i);
    return `<div class="gc-exc-atajos" role="group" aria-label="Atajos de fecha">${opts.map(([t, n]) => `<button type="button" class="gc-exc-atajo" data-gc-fecha="${iso(base + n * 86400000)}">${t}</button>`).join("")}</div>`;
  }

  async function cargarActividad(forzar) {
    const d = datosPersona(personaId);
    if (!d || !modal) return;
    if (!forzar && act.id === personaId && (act.datos || act.cargando)) { pintarActividad(); return; }
    act = { id: personaId, cargando: true, error: "", datos: null };
    pintarActividad();
    const id = personaId;
    try {
      const r = await apiFetch(`/api/users/${id}/excepcionalidades`);
      if (act.id !== id) return;
      act.datos = r;
    } catch (err) {
      if (act.id !== id) return;
      act.error = (err && err.message) || "No se han podido cargar las excepcionalidades";
    }
    act.cargando = false;
    if (modal && personaId === id) pintarActividad();
  }

  function pintarActividad() {
    const cont = modal && (modal.querySelector("#gcActExc") || modal.querySelector("#gcPan-actividad"));
    const d = datosPersona(personaId);
    if (!cont || !d) return;
    if (d.rol !== "redactor" && d.rol !== "fotografo") {
      cont.innerHTML = `<section class="ce-sec"><h4><span>${ICO.reloj}</span>Excepcionalidades de actividad</h4>
        <p class="ce-nota">Los avisos de inactividad solo se envían a redactores y fotógrafos, así que un Responsable no necesita excepcionalidades.</p></section>`;
      return;
    }
    if (act.cargando && !act.datos) { cont.innerHTML = `<section class="ce-sec"><p class="ce-nota">Cargando…</p></section>`; return; }
    if (act.error && !act.datos) {
      cont.innerHTML = `<section class="ce-sec"><h4><span>${ICO.reloj}</span>Excepcionalidades de actividad</h4><p class="ce-nota gc-exc-err">${esc(act.error)}</p>
        <button type="button" class="ce-btn ce-btn-peq" data-gc-act="recargar">Reintentar</button></section>`;
      return;
    }
    const x = act.datos || { causas: [], duraciones: [3, 7], items: [], hoy: "", max_antelacion_dias: 30 };
    const sinCorreo = x.tiene_correo === false;
    const vigente = (x.items || []).find((i) => i.estado === "vigente");
    const indefOk = (x.indefinida_causas || []).length > 0;
    const optDias = x.duraciones.map((n, i) => `<label class="gc-exc-dur"><input type="radio" name="gcExcDias" value="${Number(n)}"${i === 0 ? " checked" : ""}><span>${n === 7 ? "1 semana" : n + " días"}</span></label>`).join("") + (indefOk ? `<label class="gc-exc-dur" data-gc-exc-indef hidden><input type="radio" name="gcExcDias" value="indefinida"><span>Indefinida</span></label>` : "");
    const lista = (x.items || []).length
      ? `<ul class="gc-exc-lista">${x.items.map((i) => {
          const [txt, cls] = ESTADO_EXC[i.estado] || [i.estado, ""];
          const puedeCancelar = i.estado === "vigente" || i.estado === "programada";
          return `<li class="gc-exc-item ${cls}"><div class="gc-exc-item-cab"><b>${esc(i.causa_etiqueta)}</b><span class="gc-exc-estado">${esc(txt)}</span></div>
            <div class="gc-exc-item-det">${i.indefinida ? `desde el ${fechaExc(i.desde)} · sin fecha de fin` : `${fechaExc(i.desde)} – ${fechaExc(i.hasta)} · ${i.dias === 7 ? "1 semana" : i.dias + " días"}`}${i.concedida_por ? ` · concedida por ${esc(i.concedida_por)}` : ""}</div>
            ${i.nota ? `<div class="gc-exc-item-nota">«${esc(i.nota)}»</div>` : ""}
            <div class="gc-exc-item-pie"><span>${i.correo_enviado ? "Correo enviado al colaborador" : "Correo no enviado"}</span>${puedeCancelar ? `<button type="button" class="ce-btn ce-btn-peq" data-gc-act="cancelar" data-exc-id="${Number(i.id)}"${ocupado ? " disabled" : ""}>${i.indefinida && i.estado === "vigente" ? "Finalizar" : "Cancelar"}</button>` : ""}</div></li>`;
        }).join("")}</ul>`
      : `<p class="ce-nota">Todavía no se le ha concedido ninguna excepcionalidad.</p>`;
    cont.innerHTML = `<section class="ce-sec"><h4><span>${ICO.reloj}</span>Conceder una excepcionalidad de actividad</h4>
        <p class="ce-nota">Tiempo extra de inactividad por una causa justificable. Mientras dure no recibirá avisos de inactividad y esos días no cuentan como tiempo sin colaborar. Se le avisa por correo.</p>
        ${act.ultima ? `<p class="ce-nota gc-exc-aviso gc-exc-ok">${act.ultima.sin_correo ? "Excepcionalidad concedida. La cuenta no tiene correo, así que no se ha podido avisar." : (act.ultima.correo_enviado ? "Excepcionalidad concedida y correo enviado ahora mismo. No hace falta volver a enviarla." : "Excepcionalidad concedida, pero el correo no ha salido.")}</p>` : (vigente ? `<p class="ce-nota gc-exc-aviso">${vigente.indefinida ? "Ya tiene una indefinida en vigor: finalízala antes de conceder otra." : `Ya tiene una en vigor hasta el ${fechaExc(vigente.hasta)}: solo puedes programar otra que no se solape.`}</p>` : "")}
        ${sinCorreo ? `<p class="ce-nota gc-exc-aviso">Esta cuenta no tiene correo: se concederá, pero no se le podrá avisar.</p>` : ""}
        <div class="gc-exc-form">
          <div class="ce-campo"><span class="gc-exc-lbl">Causa</span>${desplegableCausa(x.causas, (x.causas[0] || {}).id)}</div>
          <div class="ce-campo"><span class="gc-exc-lbl">Duración</span><div class="gc-exc-durs">${optDias}</div></div>
          <label class="ce-campo"><span class="gc-exc-lbl">Empieza el</span><input type="date" data-gc-exc="desde" value="${esc(x.hoy)}" min="${esc(x.hoy)}"></label>
          ${atajosFecha(x.hoy, x.max_antelacion_dias)}
          <label class="ce-campo"><span class="gc-exc-lbl">Mensaje opcional (saldrá en el correo)</span><textarea data-gc-exc="nota" rows="2" maxlength="300" placeholder="Obligatorio si eliges «Otra causa justificada»"></textarea></label>
          <button type="button" class="ce-btn ce-btn-pri" data-gc-act="conceder"${ocupado || (vigente && vigente.indefinida) ? " disabled" : ""}>${vigente && vigente.indefinida ? "Ya concedida (indefinida en vigor)" : "Conceder y avisar por correo"}</button>
        </div>
      </section>
      <section class="ce-sec"><h4><span>${ICO.reloj}</span>Historial de excepcionalidades</h4>${lista}</section>`;
  }

  async function accionActividad(btn) {
    const que = btn.dataset.gcAct;
    if (que === "recargar") { cargarActividad(true); return; }
    if (ocupado) return;
    const id = personaId;
    const d = datosPersona(id);
    if (!d) return;
    try {
      if (que === "conceder") {
        const q = (sel) => modal.querySelector(`#gcPan-actividad ${sel}`);
        const causa = q('[data-gc-exc="causa"]').value;
        const dv = (q('input[name="gcExcDias"]:checked') || {}).value;
        const dias = dv === "indefinida" ? "indefinida" : Number(dv);
        const desde = q('[data-gc-exc="desde"]').value;
        const nota = q('[data-gc-exc="nota"]').value.trim();
        if (!causa || !dias) { aviso("Elige una causa y una duración", "err"); return; }
        if (causa === "otra" && !nota) { aviso("Con «Otra causa justificada» escribe el motivo en el mensaje", "err"); return; }
        btn.disabled = true; // un segundo clic no puede lanzar otra petición mientras la primera está en curso
        ocupado = true; pintarActividad();
        const r = await apiFetch(`/api/users/${id}/excepcionalidades`, { method: "POST", body: JSON.stringify({ causa, dias, desde, nota }) });
        act.datos = Object.assign({}, act.datos, { items: r.items || [] });
        act.ultima = { correo_enviado: !!r.correo_enviado, sin_correo: !!r.sin_correo };
        toast(r.sin_correo ? "Excepcionalidad concedida (la cuenta no tiene correo: no se ha podido avisar)." : (r.correo_enviado ? "Excepcionalidad concedida y correo enviado." : "Excepcionalidad concedida, pero el correo no ha salido."), r.correo_enviado ? "exito" : "info");
      } else if (que === "cancelar") {
        const ok = window.EOF && window.EOF.confirmar ? await window.EOF.confirmar(btn.textContent.trim() === "Finalizar" ? "¿Finalizar esta excepcionalidad indefinida? Se cerrará hoy y los avisos de inactividad volverán a contar con normalidad." : "¿Cancelar esta excepcionalidad? Los avisos de inactividad volverán a contar con normalidad.", { textoConfirmar: btn.textContent.trim() === "Finalizar" ? "Finalizar excepcionalidad" : "Cancelar excepcionalidad" }) : true;
        if (!ok) return;
        ocupado = true; pintarActividad();
        const r = await apiFetch(`/api/users/${id}/excepcionalidades/${Number(btn.dataset.excId)}`, { method: "DELETE" });
        act.datos = Object.assign({}, act.datos, { items: r.items || [] });
        act.ultima = null;
        toast(btn.textContent.trim() === "Finalizar" ? "Excepcionalidad finalizada." : "Excepcionalidad cancelada.", "exito");
      }
      aviso("");
    } catch (err) {
      aviso((err && err.message) || "No se ha podido completar la acción", "err");
    } finally {
      ocupado = false;
      if (modal && personaId === id) { pintarActividad(); }
      recargar();
    }
  }

  // ---------- pestaña «Estadísticas» ----------
  // Solo lectura: GET /api/users/:id/estadisticas (Responsables). Se pinta con estadisticas-cuenta.js.
  let est = { id: null, cargando: false, error: "", datos: null };
  async function cargarEstadisticas(forzar) {
    if (!modal || !modal.querySelector("#gcPan-estadisticas")) return;
    if (!forzar && est.id === personaId && (est.datos || est.cargando)) { pintarEstadisticas(); return; }
    est = { id: personaId, cargando: true, error: "", datos: null };
    pintarEstadisticas();
    const id = personaId;
    try {
      const r = await apiFetch(`/api/users/${id}/estadisticas`);
      if (est.id !== id) return;
      est.datos = r;
    } catch (err) {
      if (est.id !== id) return;
      est.error = (err && err.message) || "No se han podido cargar las estadísticas";
    }
    est.cargando = false;
    if (modal && personaId === id) pintarEstadisticas();
  }
  // Los mismos datos se pintan en dos sitios: pestaña «Estadísticas» (completa) y arriba de «Actividad» (compacta).
  function pintarEstadisticas() {
    if (!modal) return;
    const destinos = [["#gcPan-estadisticas", "responsable"], ["#gcActEst", "actividad"]]
      .map(([sel, vista]) => [modal.querySelector(sel), vista]).filter(([c]) => c);
    destinos.forEach(([cont, vista]) => {
      if (est.cargando && !est.datos) { cont.innerHTML = `<div class="ec-est ec-cargando" aria-busy="true"><div class="ec-esq ec-esq-cab"></div><div class="ec-esq-kpis"><i class="ec-esq"></i><i class="ec-esq"></i><i class="ec-esq"></i><i class="ec-esq"></i></div></div>`; return; }
      if (est.error && !est.datos) {
        cont.innerHTML = `<section class="ce-sec"><p class="ce-nota gc-exc-err">${esc(est.error)}</p><button type="button" class="ce-btn ce-btn-peq" data-gc-est="recargar">Reintentar</button></section>`;
        return;
      }
      if (window.EOFEstadisticas && est.datos) window.EOFEstadisticas.pintar(cont, est.datos, { vista });
    });
  }

  // ---------- pestaña «Equipo y nivel» ----------
  const NIVELES_OPC = [["1", "🟢 Nivel 1 — Principiante"], ["2", "🔵 Nivel 2 — Aprendiz"], ["3", "🟣 Nivel 3 — Maestro"], ["4", "🟠 Nivel 4 — Experto"]];
  const NIVELES_OPC_FOTO = [["1", "📷 F1 — Fotógrafo colaborador"], ["2", "🌟 F2 — Fotógrafo de referencia"]];
  const AYUDA_NIVEL = "Cumplir las cifras mínimas no sube el nivel solo: valora también la calidad del trabajo, la puntualidad y el cumplimiento de las normas antes de decidir el ascenso.";
  const AYUDA_NIVEL_FOTO = "En fotografía no hay mínimo de partidos ni de fotografías: valora de forma global la calidad técnica, el criterio periodístico, la variedad, la fiabilidad, la autonomía, la profesionalidad y la evolución. La pérdida de nivel solo ante problemas reiterados, y de forma proporcional.";

  function htmlProgreso(pr) {
    if (!pr) return `<p class="sesiones-vacio">Sin datos de progreso.</p>`;
    try {
      if (pr.es_fotografo) {
        const info = pr.nivel_info || NIVELES_FOTO_ETIQUETA[pr.nivel_actual] || NIVELES_FOTO_ETIQUETA[1];
        const crit = Array.isArray(pr.criterios) && pr.criterios.length ? pr.criterios : NIVELES_FOTO_CRITERIOS_RESPALDO;
        return `<p class="ce-nota"><strong>${esc(info.etiqueta || "")} — ${esc(info.nombre)}.</strong> ${pr.nivel_maximo ? "Es el nivel más alto de fotografía." : "Criterios de la valoración global para subir de nivel:"}</p>
          <ul class="foto-criterios foto-criterios-compacta">${crit.map((c) => `<li class="foto-criterio"><strong>${esc(c.nombre)}</strong><span>${esc(c.descripcion || "")}</span></li>`).join("")}</ul>`;
      }
      const filas = Object.entries(NIVELES_TIPO_LABEL).map(([tipo, label]) => `<div class="nivel-stat nivel-stat-compacta"><div class="nivel-stat-icono">${NIVELES_TIPO_ICONO[tipo] || ""}</div><div class="nivel-stat-num">${(pr.publicaciones && pr.publicaciones[tipo]) || 0}</div><div class="nivel-stat-label">${esc(label)}</div></div>`).join("");
      let sig = "";
      if (!pr.nivel_maximo && pr.progreso) {
        sig = `<p class="ce-nota">${pr.progreso.cumple_requisitos ? "✅ Ya cumple las cifras mínimas para el siguiente nivel." : `Todavía no cumple todas las cifras para ${esc(pr.siguiente_nivel_info.emoji)} Nivel ${esc(pr.siguiente_nivel)} — ${esc(pr.siguiente_nivel_info.nombre)}.`}</p>`;
      }
      return `<div class="nivel-stats-grid nivel-stats-grid-compacta">${filas}</div>${sig}`;
    } catch { return `<p class="sesiones-vacio">No se ha podido mostrar el progreso.</p>`; }
  }

  function fechaCorta(s) {
    try { if (typeof formatearFechaSesion === "function") return formatearFechaSesion(s); } catch { /* respaldo */ }
    const f = new Date(String(s || "").replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s || "")) ? "" : "Z"));
    return isNaN(f) ? "" : f.toLocaleDateString("es-ES");
  }
  function htmlHistorial(hist, esFoto) {
    if (!hist.length) return `<p class="sesiones-vacio">Todavía no ha tenido ningún cambio de nivel.</p>`;
    return hist.map((h) => `<div class="fila-sesion"><div class="datos-sesion">
      <div class="dispositivo-nombre">${esFoto ? `F${esc(h.nivel_anterior)} → F${esc(h.nivel_nuevo)}` : `Nivel ${esc(h.nivel_anterior)} → Nivel ${esc(h.nivel_nuevo)}`}</div>
      <div class="detalle-sesion">${esc(fechaCorta(h.created_at))} · por ${esc(h.cambiado_por_nombre)}${h.motivo ? ` · ${esc(h.motivo)}` : ""}</div></div></div>`).join("");
  }

  async function cargarNivel(id) {
    try {
      const r = await apiFetch(`/api/users/${id}/nivel-historial`);
      const cont = modal && modal.querySelector("#gcNivelHist");
      if (cont && personaId === Number(id) && eq) cont.innerHTML = htmlHistorial((r && r.historial) || [], eq.esFoto);
    } catch {
      const cont = modal && modal.querySelector("#gcNivelHist");
      if (cont) cont.innerHTML = `<p class="sesiones-vacio">No se ha podido cargar el historial.</p>`;
    }
  }

  function pintarPanelEq() {
    const cont = modal && modal.querySelector("#gcPan-equipo");
    const u = usuarioDe(personaId);
    const d = datosPersona(personaId);
    if (!cont) return;
    if (!u || !d) { cont.innerHTML = ""; return; }
    const esAdmin = d.rol === "admin";
    const esFoto = d.rol === "fotografo";
    const equipos = Array.isArray(u.equipo) ? u.equipo.slice() : (u.equipo ? [u.equipo] : []);
    const cats = Array.isArray(u.categorias_fijas) ? u.categorias_fijas.slice() : [];
    const nivel0 = esAdmin ? 4 : (esFoto ? Math.min(Math.max(u.nivel || 1, 1), 2) : (u.nivel || 1));
    eq = { equipos0: equipos, cats0: cats, nivel0, esAdmin, esFoto, pickerEq: null, pickerCat: null };
    const opciones = (esFoto ? NIVELES_OPC_FOTO : NIVELES_OPC).map(([v, t]) => `<option value="${v}"${String(nivel0) === v ? " selected" : ""}>${t}</option>`).join("");
    cont.innerHTML = `
      <section class="ce-sec"><h4><span>${ICO.grupo}</span>Equipos</h4>
        <p class="ce-nota">Opcional. Puedes dejarlo sin especificar o elegir hasta 3 equipos.</p>
        <div class="equipos-picker">
          <div class="equipos-picker-cabecera"><span class="equipos-picker-contador" id="gcEqContador">0 seleccionados</span></div>
          <input type="text" class="equipos-picker-buscador" id="gcEqBuscador" placeholder="Buscar equipo…" aria-label="Buscar equipo">
          <div class="equipos-picker-lista" id="gcEqLista"></div>
          <p class="equipos-picker-ayuda" id="gcEqAyuda">Puedes elegir hasta 3 equipos (o ninguno).</p>
        </div>
      </section>
      <section class="ce-sec"><h4><span>${ICO.estrella}</span>Categoría complementaria</h4>
        <p class="ce-nota">Opcional. Añade una categoría (p. ej. «Arbitraje» o «Jurisdicción deportiva») como complemento de sus equipos. No limita lo que puede publicar.</p>
        <div class="equipos-picker">
          <div class="equipos-picker-cabecera"><span class="equipos-picker-contador" id="gcCatContador">0 seleccionadas</span></div>
          <input type="text" class="equipos-picker-buscador" id="gcCatBuscador" placeholder="Buscar categoría…" aria-label="Buscar categoría">
          <div class="equipos-picker-lista" id="gcCatLista"></div>
          <p class="equipos-picker-ayuda" id="gcCatAyuda">Puedes dejarlo sin especificar.</p>
        </div>
      </section>
      <section class="ce-sec"><h4><span>${ICO.nivel}</span>Nivel</h4>
        <div class="gc-nivel-prog">${htmlProgreso(u.progreso_nivel)}</div>
        ${esAdmin ? `<p class="ce-nota">Los Responsables están siempre en el nivel máximo y no se puede editar.</p>` : ""}
        <label class="ce-campo"><span class="ce-sr">Nivel de ${esc(d.nombre)}</span><select id="gcNivelSel"${esAdmin ? " disabled" : ""}>${opciones}</select></label>
        ${esAdmin ? "" : `<p class="ce-nota">${esFoto ? AYUDA_NIVEL_FOTO : AYUDA_NIVEL}</p>
        <label class="ce-campo"><span class="gc-lbl">Nota (opcional)</span>
          <textarea id="gcNivelNota" rows="2" maxlength="500" placeholder="${u.nivel_nota ? esc("Nota actual: " + u.nivel_nota) : "Motivo del cambio, algo a mejorar, por qué todavía no sube aunque cumpla las cifras…"}"></textarea></label>`}
        <details class="gc-hist"><summary>Historial de niveles</summary><div id="gcNivelHist" class="lista-sesiones"><p class="sesiones-vacio">Cargando…</p></div></details>
      </section>`;
    try {
      eq.pickerEq = iniciarEquiposPicker({ contadorEl: cont.querySelector("#gcEqContador"), buscadorEl: cont.querySelector("#gcEqBuscador"), listaEl: cont.querySelector("#gcEqLista"), ayudaEl: cont.querySelector("#gcEqAyuda") }, equipos);
      eq.pickerCat = iniciarCategoriasFijasPicker({ contadorEl: cont.querySelector("#gcCatContador"), buscadorEl: cont.querySelector("#gcCatBuscador"), listaEl: cont.querySelector("#gcCatLista"), ayudaEl: cont.querySelector("#gcCatAyuda") }, cats);
    } catch (err) { console.warn("[gestionar] pickers", err); }
    if (personaId != null) cargarNivel(personaId);
  }

  async function guardarEquipo() {
    if (ocupado || !eq || personaId == null) return;
    if (typeof usuariosPuedeEscribir === "function" && !usuariosPuedeEscribir()) return;
    if (!eq.pickerEq || !eq.pickerCat) { aviso("No se ha podido cargar la lista de equipos. Cierra y vuelve a abrir.", "err"); return; }
    if (!eq.pickerEq.esValido()) { aviso("Puedes dejarlo sin especificar o elegir hasta 3 equipos.", "err"); return; }
    const equipos = eq.pickerEq.obtenerSeleccion();
    const cats = eq.pickerCat.obtenerSeleccion();
    const mismo = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    const cambiaEq = !mismo(equipos, eq.equipos0) || !mismo(cats, eq.cats0);
    const sel = modal.querySelector("#gcNivelSel");
    const notaEl = modal.querySelector("#gcNivelNota");
    const nivel = sel ? parseInt(sel.value, 10) : eq.nivel0;
    const nota = notaEl ? notaEl.value.trim() : "";
    const cambiaNivel = !eq.esAdmin && (nivel !== eq.nivel0 || !!nota);
    if (!cambiaEq && !cambiaNivel) { aviso("No hay cambios que guardar.", "ok"); return; }
    const id = personaId;
    ocupado = true; aviso(""); pintarPie();
    let error = "";
    try {
      if (cambiaEq) {
        await apiFetch(`/api/users/${id}`, { method: "PUT", body: JSON.stringify({ categorias_fijas: cats, equipo: equipos }) });
        eq.equipos0 = equipos.slice(); eq.cats0 = cats.slice();
      }
      if (cambiaNivel) {
        await apiFetch(`/api/users/${id}/nivel`, { method: "PUT", body: JSON.stringify({ nivel, nota: nota || undefined }) });
        eq.nivel0 = nivel;
        if (notaEl) notaEl.value = "";
      }
    } catch (err) { error = (err && err.message) || "No se ha podido guardar"; }
    await recargar();
    ocupado = false;
    if (personaId !== id || !modal) return;
    if (error) aviso(error, "err"); else { aviso("Guardado correctamente.", "ok"); cargarNivel(id); }
    pintarDinamicos();
  }

  // Avisos de inactividad en la pestaña «Actividad»: el estado es clicable y abre el mismo modal de detalle
  // (avisos y correos enviados) que «Ver detalle» en la pestaña «Cuenta».
  function pintarAvisosActividad() {
    const cont = modal && modal.querySelector("#gcActAvisos");
    if (!cont) return;
    cont.innerHTML = "";
    try {
      const u = usuarioDe(personaId);
      const est = u && typeof estadoInactividadUsuario === "function" ? estadoInactividadUsuario(u) : null;
      const hay = u && typeof USUARIOS_INACTIVIDAD !== "undefined" && USUARIOS_INACTIVIDAD && USUARIOS_INACTIVIDAD.has && USUARIOS_INACTIVIDAD.has(Number(u.id));
      if (!est || !hay || !u.inactividad) return;
      const n = Number(u.inactividad.avisos_enviados) || 0;
      cont.innerHTML = `<section class="ce-sec"><h4><span>${ICO.sobre}</span>Avisos de inactividad</h4>
        <div class="ce-filas"><div class="ce-fila gc-fila"><div class="ce-fila-txt"><b>${n === 1 ? "1 aviso enviado" : n + " avisos enviados"}</b><small>Toca para ver el detalle de los avisos y de los correos enviados.</small></div>
        <button type="button" class="ce-btn ce-btn-peq gc-av-abrir gc-av-${esc(est.clase)}" data-gc="avisos" title="${esc(est.titulo || "")} · clic para ver el detalle">${ICO.sobre}${esc(est.texto)}</button></div></div></section>`;
    } catch { cont.innerHTML = ""; }
  }

  // ---------- pestaña «Cuenta» ----------
  function pintarCuenta() {
    const cont = modal.querySelector("#gcPan-cuenta");
    const u = usuarioDe(personaId);
    if (!cont || !u) return;
    const yo = soyYo(u.id);
    const esAdmin = u.rol === "admin";
    const activo = Number(u.activo) === 1 || u.activo === true;
    const sinAp = Number(u.sin_apellidos) === 1;
    const fila = (titulo, ayuda, control) => `<div class="ce-fila gc-fila"><div class="ce-fila-txt"><b>${titulo}</b>${ayuda ? `<small>${ayuda}</small>` : ""}</div>${control}</div>`;
    const boton = (attrs, txt, extra) => `<button type="button" class="ce-btn ce-btn-peq${extra ? " " + extra : ""}" ${attrs}${ocupado ? " disabled" : ""}>${txt}</button>`;

    let dos = "";
    if (u.totp_activo) {
      dos = yo
        ? fila("Verificación en dos pasos", "Activa. Es tu cuenta: gestiónala en Ajustes de cuenta > Seguridad.", `<span class="gc-estado gc-ok">Activa</span>`)
        : fila("Verificación en dos pasos", esAdmin ? "Activa. Si ha perdido el móvil y los códigos, restablécela: la configurará de nuevo en su próximo acceso." : "Activa. Si ha perdido el móvil y los códigos, quítala: volverá a entrar solo con contraseña.", boton('data-gc="dos-pasos"', esAdmin ? "Restablecer 2FA" : "Quitar 2FA"));
    } else if (esAdmin) {
      dos = fila("Verificación en dos pasos", "Pendiente: la configurará en su próximo acceso.", `<span class="gc-estado gc-pend">Pendiente</span>`);
    }

    let avisos = "";
    try {
      const est = typeof estadoInactividadUsuario === "function" ? estadoInactividadUsuario(u) : null;
      if (est) {
        const hay = typeof USUARIOS_INACTIVIDAD !== "undefined" && USUARIOS_INACTIVIDAD && USUARIOS_INACTIVIDAD.has && USUARIOS_INACTIVIDAD.has(Number(u.id));
        avisos = fila("Avisos de inactividad", `<span class="gc-estado gc-av-${esc(est.clase)}">${esc(est.texto)}</span>`, hay && u.inactividad ? boton('data-gc="avisos"', ICO.sobre + "Ver detalle") : "");
      }
    } catch { avisos = ""; }

    const sinApFila = esAdmin ? "" : interruptor(`data-gc-sw="sinap" data-gc-val="${sinAp ? 0 : 1}"`, sinAp, "Firma solo con su nombre", sinAp ? "No se le piden apellidos. Desactívalo para volver a exigirlos." : "Actívalo para que no se le pidan apellidos al firmar.");
    const anon = Number(u.anonimo) === 1;
    const anonFila = esAdmin ? "" : interruptor(`data-gc-sw="anonimo" data-gc-val="${anon ? 0 : 1}"`, anon, "Colaborador anónimo", anon ? "Lo que publica sale sin su nombre (solo los Responsables saben quién es). Desactívalo para que vuelva a firmar." : "Actívalo para que nadie vea quién escribe lo suyo: saldrá como «Colaborador anónimo».");
    const activoFila = interruptor(`data-gc-sw="activo" data-gc-val="${activo ? 0 : 1}"${yo ? ' disabled title="No puedes desactivar tu propia cuenta"' : ""}`, activo, "Cuenta activa", activo ? "Puede entrar y publicar." : "Desactivada: no puede entrar al panel.");

    cont.innerHTML = `
      <section class="ce-sec"><h4><span>${ICO.candado}</span>Acceso y seguridad</h4>
        <div class="ce-filas">
          ${fila("Contraseña", "Genera una contraseña nueva para pasársela.", boton('data-gc="password"', ICO.candado + "Nueva contraseña"))}
          ${dos}
        </div>
      </section>
      <section class="ce-sec"><h4><span>${ICO.persona}</span>Estado y firma</h4>
        <div class="ce-filas">${activoFila}${sinApFila}${anonFila}${avisos}</div>
      </section>
      <section class="ce-sec gc-peligro"><h4><span>${ICO.papelera}</span>Zona de peligro</h4>
        <div class="ce-filas">${fila("Eliminar colaborador", "Borra la cuenta de forma definitiva. Si solo quieres que deje de entrar, desactívala arriba.", boton(`data-gc="eliminar"${yo ? ' disabled title="No puedes eliminar tu propia cuenta"' : ""}`, ICO.papelera + "Eliminar", "ce-btn-peligro"))}</div>
      </section>`;
  }

  async function hacer(fn, opciones) {
    if (ocupado) return;
    ocupado = true; pintarDinamicos();
    try { await fn(); } catch (err) { toast((err && err.message) || "No se ha podido guardar el cambio", "error"); }
    ocupado = false;
    if (!modal || personaId == null) return;
    if (opciones && opciones.eq) pintarPanelEq();
    pintarDinamicos();
  }

  async function ponerUsuario(campos) {
    await apiFetch(`/api/users/${personaId}`, { method: "PUT", body: JSON.stringify(campos) });
    await recargar();
  }

  function alClickModal(e) {
    if (e.target === modal) { cerrar(); return; }
    const sw = e.target.closest && e.target.closest(".ce-switch");
    if (sw && !sw.disabled) {
      const quitar = sw.dataset.ceQuitar === "1";
      if (sw.dataset.ceArea) {
        const area = sw.dataset.ceArea;
        hacer(() => (quitar ? AS().quitar(area, personaId) : AS().nombrar(area, personaId)));
      } else if (sw.dataset.ceLider) {
        const gid = sw.dataset.ceLider;
        hacer(() => GT().fijarLider(gid, quitar ? null : personaId));
      } else if (sw.dataset.gcSw === "sinap") {
        const valor = sw.dataset.gcVal === "1";
        hacer(async () => { await ponerUsuario({ sin_apellidos: valor }); toast(valor ? "Listo: ya puede firmar solo con su nombre." : "Se le volverán a pedir nombre y apellidos.", "exito"); });
      } else if (sw.dataset.gcSw === "anonimo") {
        const valor = sw.dataset.gcVal === "1";
        hacer(async () => { await ponerUsuario({ anonimo: valor }); toast(valor ? "Listo: lo que publique saldrá como «Colaborador anónimo»." : "Volverá a firmar con su nombre.", "exito"); });
      } else if (sw.dataset.gcSw === "activo") {
        const valor = sw.dataset.gcVal === "1";
        hacer(async () => { await ponerUsuario({ activo: valor }); toast(valor ? "Cuenta activada." : "Cuenta desactivada.", "exito"); });
      }
      return;
    }
    const ddb = e.target.closest && e.target.closest("[data-gc-dd-btn]");
    if (ddb) { const dd = ddb.closest("[data-gc-dd]"); const l = dd.querySelector(".gc-dd-lista"); if (l.hidden) abrirDesplegable(dd); else cerrarDesplegables(); return; }
    const ddo = e.target.closest && e.target.closest(".gc-dd-op");
    if (ddo) { elegirCausa(ddo.closest("[data-gc-dd]"), ddo); return; }
    cerrarDesplegables();
    const fch = e.target.closest && e.target.closest("[data-gc-fecha]");
    if (fch) { const inp = modal.querySelector('#gcPan-actividad [data-gc-exc="desde"]'); if (inp) { inp.value = fch.dataset.gcFecha; inp.dispatchEvent(new Event("input", { bubbles: true })); } return; }
    const tab = e.target.closest && e.target.closest("[data-gc-tab]");
    if (tab) { mostrarPestana(tab.dataset.gcTab); return; }
    const re = e.target.closest && e.target.closest("[data-gc-est]");
    if (re) { cargarEstadisticas(true); return; }
    const ac = e.target.closest && e.target.closest("[data-gc-act]");
    if (ac && !ac.disabled) { accionActividad(ac); return; }
    const g = e.target.closest && e.target.closest("[data-gc]");
    if (g && !g.disabled) { accion(g.dataset.gc); return; }
    const b = e.target.closest && e.target.closest("[data-ce]");
    if (!b) return;
    if (b.dataset.ce === "cerrar") cerrar();
    else if (b.dataset.ce === "funciones") { const id = personaId; cerrar(); if (GT()) GT().abrirFunciones(id); }
  }

  async function accion(que) {
    const u = usuarioDe(personaId);
    if (!u) return;
    if (que === "guardar") { guardarEquipo(); return; }
    if (typeof usuariosPuedeEscribir === "function" && que !== "avisos" && !usuariosPuedeEscribir()) return;
    const id = personaId;
    if (que === "password") { if (typeof restablecerPasswordUsuario === "function") restablecerPasswordUsuario(u.id, u.username, u.nombre); return; }
    if (que === "avisos") { if (typeof abrirModalAvisosUsuario === "function") abrirModalAvisosUsuario(u.id); return; }
    if (que === "dos-pasos") {
      await restablecerDosPasosUsuario(u.id, u.username, u.rol);
      await recargar();
      if (modal && personaId === id) pintarDinamicos();
      return;
    }
    if (que === "eliminar") {
      await eliminarUsuario(u.id, u.username);
      await recargar();
      if (!modal || personaId !== id) return;
      if (!usuarioDe(id)) cerrar(); else pintarDinamicos();
    }
  }

  function alCambioModal(e) {
    const causaSel = e.target.closest && e.target.closest('[data-gc-exc="causa"]');
    if (causaSel) {
      // «Indefinida» solo existe para el fallecimiento de un familiar.
      const ind = modal.querySelector("[data-gc-exc-indef]");
      if (ind) {
        const ok = ((act.datos && act.datos.indefinida_causas) || []).includes(causaSel.value);
        ind.hidden = !ok;
        if (!ok) { const r = ind.querySelector("input"); if (r && r.checked) { const primero = modal.querySelector('input[name="gcExcDias"]'); if (primero) primero.checked = true; } }
      }
      return;
    }
    const r = e.target.closest && e.target.closest("[data-gc-rol]");
    if (r) {
      const rol = r.value;
      hacer(async () => {
        await ponerUsuario({ rol });
        try { if (GT()) await GT().cargar(true); } catch { /* se actualizará solo */ }
      }, { eq: true });
      return;
    }
    const s = e.target.closest && e.target.closest("[data-ce-grupo]");
    if (s) { const gid = s.value || null; hacer(() => GT().asignar(personaId, gid)); }
  }

  function alEnviarModal(e) {
    const f = e.target.closest && e.target.closest("[data-ce-form='area']");
    if (!f) return;
    e.preventDefault();
    const inp = f.querySelector("input");
    const nombre = inp ? inp.value.replace(/\s+/g, " ").trim() : "";
    if (!nombre) { toast("Escribe el nombre del área (con artículo: «el Diseño»)", "error"); return; }
    const antes = new Set(AS().areas().map((a) => a.id));
    hacer(async () => {
      await AS().crearArea(nombre);
      const nueva = AS().areas().find((a) => !antes.has(a.id));
      if (nueva) await AS().nombrar(nueva.id, personaId);
    });
  }

  // Flechas / Inicio / Fin entre pestañas (patrón WAI-ARIA).
  function alTeclaModal(e) {
    const dd = e.target.closest && e.target.closest("[data-gc-dd]");
    if (dd) {
      const l = dd.querySelector(".gc-dd-lista");
      const ops = [...l.querySelectorAll(".gc-dd-op")];
      const i = ops.findIndex((n) => n.classList.contains("gc-dd-foco"));
      if (l.hidden) {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); abrirDesplegable(dd); }
        return;
      }
      if (e.key === "ArrowDown") { e.preventDefault(); marcarOpcion(l, ops[Math.min(ops.length - 1, i + 1)]); }
      else if (e.key === "ArrowUp") { e.preventDefault(); marcarOpcion(l, ops[Math.max(0, i - 1)]); }
      else if (e.key === "Home") { e.preventDefault(); marcarOpcion(l, ops[0]); }
      else if (e.key === "End") { e.preventDefault(); marcarOpcion(l, ops[ops.length - 1]); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (ops[i]) elegirCausa(dd, ops[i]); }
      else if (e.key === "Tab") cerrarDesplegables();
      return;
    }
    const t = e.target.closest && e.target.closest(".gc-tab");
    if (!t) return;
    const dp = datosPersona(personaId);
    const claves = pestanasDe().map((p) => p[0]).filter((k) => !bloqueada(k, dp));
    let i = claves.indexOf(t.dataset.gcTab);
    if (e.key === "ArrowRight") i = (i + 1) % claves.length;
    else if (e.key === "ArrowLeft") i = (i - 1 + claves.length) % claves.length;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = claves.length - 1;
    else return;
    e.preventDefault();
    mostrarPestana(claves[i]);
    const n = modal.querySelector(`#gcTab-${claves[i]}`);
    if (n) n.focus();
  }

  // ---------- eventos globales ----------
  document.addEventListener("click", (e) => {
    const v = e.target.closest && e.target.closest("[data-ce-vista]");
    if (v) { filtro.vista = v.dataset.ceVista; pintarLista(); return; }
    const b = e.target.closest && e.target.closest("[data-ce='cargos']");
    if (b) { e.preventDefault(); abrir(b.dataset.ceUser, b.dataset.ceTab); }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.classList.contains("abierto")) {
      if (document.querySelector("#modalAvisosUsuario.abierto,#modalPasswordGenerada.abierto")) return; // hay otro modal encima: Escape cierra ese
      if (cerrarDesplegables()) { e.stopPropagation(); e.preventDefault(); return; } // primero se cierra el desplegable abierto
      e.stopPropagation(); cerrar();
    }
  }, true);
  document.addEventListener("DOMContentLoaded", () => { pintarEquipo(); });

  window.EOFCargos = { abrir, cerrar, pintarEquipo };
})();
