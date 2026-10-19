// ---------- Organigrama interactivo del medio (Funcionalidades > Información) ----------
// Backend: GET/PUT /api/organigrama (worker y worker-secondary), guardado en
// la tabla `settings` bajo la clave 'organigrama'. Cualquier miembro del
// equipo lo ve; solo un administrador puede editarlo.
//
// Vista (todos):  buscar, plegar/desplegar ramas, zoom, cambiar orientación,
//                 pulsar una casilla para ver su detalle y su cadena de mando.
// Edición (admin): añadir/renombrar/borrar casillas, cambiar a quién
//                 reportan (una casilla puede depender de VARIAS: lista de
//                 jefes con desplegable, o arrastrando una casilla sobre otra;
//                 con Mayús al soltar se añade un jefe más en vez de cambiarlo),
//                 reordenar entre hermanas, color, plegada por defecto.
// Datos: cada casilla guarda `padres` (lista de ids; el primero es el jefe
//        principal, bajo el que se dibuja su equipo) y `padre` (= padres[0],
//        por compatibilidad con versiones anteriores).
//                 Nada se guarda hasta pulsar "Guardar cambios".
//
// Depende de globales de admin.js / ui-alertas.js:
//   apiFetch(path, options)  -> JSON o lanza Error con el mensaje del servidor
//   window.EOF.toast / window.EOF.confirmar
(function () {
  "use strict";

  const MAX_NODOS = 300;
  const COLORES = ["azul", "rojo", "verde", "amarillo", "morado", "rosa", "gris", "naranja"];
  const ZOOM_MIN = 0.5, ZOOM_MAX = 1.5, ZOOM_PASO = 0.1;
  const MAX_COPIAS = 1500; // pasado este nº de casillas dibujadas, las copias «enlace» nuevas salen plegadas
  const MAX_JEFES = 10; // máximo de jefes por casilla (igual que en el servidor)
  const ICONO_ENLACE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';

  const estado = {
    nodos: [],
    orientacion: "vertical",
    plegados: new Set(),   // casillas plegadas en la vista actual
    aliasCerrados: new Set(), // copias «enlace» (id@jefe) cuyo equipo se ha plegado (por defecto se ve)
    aliasAbiertos: new Set(), // copias «enlace» abiertas a mano cuando el organigrama es tan grande que se pliegan solas
    sel: null,             // id seleccionado
    editando: false,
    sucio: false,
    cargado: false,
    cargando: false,
    guardando: false,
    zoom: 1,
    busqueda: "",
    arrastrando: null,
    arrastrandoDesde: null, // jefe bajo el que estaba dibujada la casilla arrastrada
    snapshot: null,        // copia de lo último guardado, para descartar
    error: "",
  };

  const $ = (id) => document.getElementById(id);
  let raiz = null; // contenedor #organigrama

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function sinTildes(t) {
    return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }
  function esAdmin() {
    try { return (JSON.parse(localStorage.getItem("eof_user") || "null") || {}).rol === "admin"; } catch { return false; }
  }
  function toast(msg, tipo, ms) {
    try { window.EOF.toast(msg, tipo || "info", ms || 3500); } catch { /* sin toast */ }
  }
  async function confirmar(msg, opciones) {
    if (window.EOF && window.EOF.confirmar) return !!(await window.EOF.confirmar(msg, opciones || {}));
    return window.confirm(msg);
  }

  // ---------- Árbol ----------
  const porId = (id) => estado.nodos.find((n) => n.id === id) || null;
  // Jefes de una casilla (admite datos antiguos con un único `padre`).
  function padresDe(n) {
    if (Array.isArray(n.padres)) return n.padres;
    return n.padre ? [n.padre] : [];
  }
  function fijarPadres(n, lista) {
    const limpia = [];
    (lista || []).forEach((p) => { if (p && p !== n.id && !limpia.includes(p)) limpia.push(p); });
    n.padres = limpia;
    n.padre = limpia[0] || null; // jefe principal (compatibilidad)
    return n;
  }
  const hijos = (id) => estado.nodos.filter((n) => (id ? padresDe(n).includes(id) : padresDe(n).length === 0));
  // Todas las casillas por encima (jefes, jefes de los jefes…), por todos los caminos.
  function ancestros(id) {
    const fuera = new Set();
    const pila = [id];
    while (pila.length) {
      const n = porId(pila.pop());
      if (!n) continue;
      padresDe(n).forEach((p) => { if (!fuera.has(p)) { fuera.add(p); pila.push(p); } });
    }
    return fuera;
  }
  // Rama que desaparece al quitar una casilla "con su equipo": ella y las que SOLO dependen de la rama.
  function ramaExclusiva(id) {
    const rama = new Set([id]);
    let crece = true;
    while (crece) {
      crece = false;
      estado.nodos.forEach((n) => {
        const ps = padresDe(n);
        if (!rama.has(n.id) && ps.length && ps.every((p) => rama.has(p))) { rama.add(n.id); crece = true; }
      });
    }
    return rama;
  }
  function descendientes(id) {
    const fuera = new Set();
    const pila = [id];
    while (pila.length) {
      const actual = pila.pop();
      hijos(actual).forEach((h) => { if (!fuera.has(h.id)) { fuera.add(h.id); pila.push(h.id); } });
    }
    return fuera;
  }
  function ruta(id) {
    const r = [];
    let n = porId(id), guarda = 0;
    while (n && guarda++ < 200) { r.unshift(n); const pp = padresDe(n)[0]; n = pp ? porId(pp) : null; }
    return r;
  }
  function nuevoId() {
    let id;
    do { id = "n" + Math.random().toString(36).slice(2, 9) + (Date.now() % 1296).toString(36); } while (porId(id));
    return id;
  }
  // Casilla sin nombre = puesto vacante: se muestra un texto por defecto.
  const VACANTE = "Buscamos persona";
  const nombreDe = (n) => (String(n && n.nombre || "").trim() || VACANTE);
  const esVacante = (n) => !String(n && n.nombre || "").trim();
  function iniciales(nombre) {
    const p = String(nombre || "").trim().split(/\s+/).filter(Boolean);
    if (!p.length) return "?";
    return (p[0][0] + (p.length > 1 ? p[1][0] : "")).toUpperCase();
  }
  const copiar = (nodos) => nodos.map((n) => fijarPadres({ ...n }, padresDe(n).slice()));

  function marcarSucio() {
    estado.sucio = true;
    pintarBarraEdicion();
  }

  // ---------- Carga y guardado ----------
  async function cargar(forzar) {
    raiz = $("organigrama");
    if (!raiz) return;
    if (!raiz.dataset.listo) construirShell();
    if (estado.cargando) return;
    if (estado.cargado && !forzar) return;
    if (estado.sucio && !forzar) return; // no pisar cambios sin guardar
    estado.cargando = true;
    estado.error = "";
    pintarArbol();
    try {
      const d = await apiFetch("/api/organigrama");
      aplicarDatos(d);
      estado.cargado = true;
    } catch (err) {
      estado.error = err.message || "No se ha podido cargar el organigrama";
    } finally {
      estado.cargando = false;
      pintarTodo();
    }
  }

  function aplicarDatos(d) {
    estado.nodos = Array.isArray(d.nodos) ? copiar(d.nodos) : [];
    estado.orientacion = d.orientacion === "horizontal" ? "horizontal" : "vertical";
    estado.plegados = new Set(estado.nodos.filter((n) => n.colapsado).map((n) => n.id));
    estado.snapshot = JSON.stringify({ o: estado.orientacion, n: estado.nodos });
    estado.sucio = false;
    if (estado.sel && !porId(estado.sel)) estado.sel = null;
  }

  async function guardar() {
    if (estado.guardando) return;
    estado.guardando = true;
    pintarBarraEdicion();
    try {
      const nodos = estado.nodos.map((n) => ({ ...n }));
      const d = await apiFetch("/api/organigrama", {
        method: "PUT",
        body: JSON.stringify({ orientacion: estado.orientacion, nodos }),
      });
      aplicarDatos(d);
      toast("Organigrama guardado.", "success");
    } catch (err) {
      toast("No se ha podido guardar: " + (err.message || "error"), "error", 6000);
    } finally {
      estado.guardando = false;
      pintarTodo();
    }
  }

  async function descartar() {
    if (estado.sucio && !(await confirmar("Se perderán los cambios que no hayas guardado. ¿Descartarlos?", { textoConfirmar: "Descartar", peligroso: true }))) return;
    try {
      const s = JSON.parse(estado.snapshot || "{}");
      estado.nodos = copiar(s.n || []);
      estado.orientacion = s.o === "horizontal" ? "horizontal" : "vertical";
      estado.plegados = new Set(estado.nodos.filter((n) => n.colapsado).map((n) => n.id));
    } catch { /* se mantiene lo que hay */ }
    estado.sucio = false;
    if (estado.sel && !porId(estado.sel)) estado.sel = null;
    pintarTodo();
  }

  async function alternarEdicion() {
    if (estado.editando) {
      if (estado.sucio) {
        const ok = await confirmar("Tienes cambios sin guardar. Si sales del modo edición se perderán.", { textoConfirmar: "Salir sin guardar", peligroso: true });
        if (!ok) return;
        await descartarSilencioso();
      }
      estado.editando = false;
    } else {
      estado.editando = true;
    }
    pintarTodo();
  }
  function descartarSilencioso() {
    try {
      const s = JSON.parse(estado.snapshot || "{}");
      estado.nodos = copiar(s.n || []);
      estado.orientacion = s.o === "horizontal" ? "horizontal" : "vertical";
      estado.plegados = new Set(estado.nodos.filter((n) => n.colapsado).map((n) => n.id));
    } catch { /* nada */ }
    estado.sucio = false;
    if (estado.sel && !porId(estado.sel)) estado.sel = null;
  }

  // ---------- Operaciones de edición ----------
  function anadir(padreId) {
    if (estado.nodos.length >= MAX_NODOS) { toast(`Máximo ${MAX_NODOS} casillas.`, "error"); return; }
    const padre = padreId ? porId(padreId) : null;
    const nodo = { id: nuevoId(), nombre: "Nueva casilla", cargo: "", nota: "", color: padre ? padre.color : "azul", padre: padre ? padre.id : null, padres: padre ? [padre.id] : [], colapsado: false };
    estado.nodos.push(nodo);
    if (padre) estado.plegados.delete(padre.id);
    estado.sel = nodo.id;
    marcarSucio();
    pintarTodo();
    const f = $("orgFNombre");
    if (f) { f.focus(); f.select(); }
    const el = raiz.querySelector(`.org-nodo[data-id="${nodo.id}"]`);
    if (el) el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  // opciones: { anadir: true } añade un jefe más; { desde: idJefe } sustituye solo ese jefe
  // (lo que hace arrastrar una casilla desde bajo un jefe); sin opciones, pasa a depender solo del destino.
  function mover(id, nuevoPadre, opciones) {
    const op = opciones || {};
    const n = porId(id);
    if (!n) return;
    const destino = nuevoPadre || null;
    if (destino && (destino === n.id || descendientes(n.id).has(destino))) {
      toast("Una casilla no puede depender de sí misma ni de una de sus subordinadas.", "error");
      return;
    }
    const actuales = padresDe(n);
    let nuevos;
    if (destino === null) {
      if (!actuales.length) return;
      nuevos = op.desde && actuales.length > 1 ? actuales.filter((p) => p !== op.desde) : [];
    } else if (actuales.includes(destino)) {
      return; // ya depende de ella
    } else if (op.anadir) {
      if (actuales.length >= MAX_JEFES) { toast(`Una casilla puede depender como máximo de ${MAX_JEFES} casillas.`, "error"); return; }
      nuevos = actuales.concat(destino);
    } else if (op.desde && actuales.includes(op.desde)) {
      nuevos = actuales.map((p) => (p === op.desde ? destino : p));
    } else {
      nuevos = [destino];
    }
    fijarPadres(n, nuevos);
    // pasa a ser la última entre sus nuevas hermanas
    estado.nodos.splice(estado.nodos.indexOf(n), 1);
    estado.nodos.push(n);
    if (destino) estado.plegados.delete(destino);
    marcarSucio();
    pintarTodo();
  }

  function quitarJefe(id, jefeId) {
    const n = porId(id);
    if (!n) return;
    fijarPadres(n, padresDe(n).filter((p) => p !== jefeId));
    marcarSucio();
    pintarTodo();
  }
  function hacerPrincipal(id, jefeId) {
    const n = porId(id);
    if (!n || !padresDe(n).includes(jefeId)) return;
    fijarPadres(n, [jefeId].concat(padresDe(n).filter((p) => p !== jefeId)));
    marcarSucio();
    pintarTodo();
  }

  function reordenar(id, delta) {
    const n = porId(id);
    if (!n) return;
    const hermanas = hijos(padresDe(n)[0] || null);
    const i = hermanas.indexOf(n);
    const otra = hermanas[i + delta];
    if (!otra) return;
    const a = estado.nodos.indexOf(n), b = estado.nodos.indexOf(otra);
    [estado.nodos[a], estado.nodos[b]] = [estado.nodos[b], estado.nodos[a]];
    marcarSucio();
    pintarTodo();
  }

  async function quitar(id, conRama) {
    const n = porId(id);
    if (!n) return;
    const rama = ramaExclusiva(id);
    const subordinadas = rama.size - 1;
    const directas = hijos(id).length;
    const jefes = padresDe(n).map(porId).filter(Boolean);
    const destinoTxt = jefes.length ? jefes.map((j) => "«" + nombreDe(j) + "»").join(" y ") : "nadie (serán casillas raíz)";
    const msg = conRama && subordinadas
      ? `Se eliminará «${nombreDe(n)}» y sus ${subordinadas} casilla${subordinadas === 1 ? "" : "s"} subordinada${subordinadas === 1 ? "" : "s"} (las que además dependen de otras casillas se quedan con ellas).`
      : directas
        ? `Se eliminará «${nombreDe(n)}». Sus subordinadas pasarán a depender de ${destinoTxt}.`
        : `Se eliminará «${nombreDe(n)}».`;
    if (!(await confirmar(msg, { textoConfirmar: "Eliminar", peligroso: true }))) return;
    if (conRama) {
      estado.nodos = estado.nodos.filter((x) => !rama.has(x.id));
      estado.nodos.forEach((x) => fijarPadres(x, padresDe(x).filter((p) => !rama.has(p))));
    } else {
      const suyos = padresDe(n);
      estado.nodos.forEach((x) => {
        if (x.id === id) return;
        const ps = padresDe(x);
        if (ps.includes(id)) fijarPadres(x, ps.flatMap((p) => (p === id ? suyos : [p])).slice(0, MAX_JEFES));
      });
      estado.nodos = estado.nodos.filter((x) => x.id !== id);
    }
    estado.sel = suyosSel(n);
    marcarSucio();
    pintarTodo();
  }
  function suyosSel(n) {
    const p = padresDe(n)[0];
    return p && porId(p) ? p : null;
  }

  function plantilla() {
    const mk = (id, nombre, cargo, color, padres) => fijarPadres({ id, nombre, cargo, nota: "", color, colapsado: false }, padres);
    estado.nodos = [
      mk("dir", "Dirección", "Pon aquí el nombre", "rojo", []),
      mk("red", "Redacción", "Responsable de redacción", "azul", ["dir"]),
      mk("soc", "Redes sociales", "Responsable de redes", "morado", ["dir"]),
      mk("fot", "Fotografía", "Responsable de fotografía", "verde", ["dir"]),
      mk("web", "Web y tecnología", "Responsable técnico", "amarillo", ["dir"]),
      mk("tie", "Tienda", "Gestión de la tienda", "naranja", ["dir"]),
      mk("r1", "Redactores", "Equipo de redacción", "azul", ["red"]),
      mk("r2", "Colaboradores", "Equipo externo", "gris", ["red"]),
      mk("cob", "Cobertura de partidos", "Ejemplo: depende de Redacción y de Fotografía", "rosa", ["red", "fot"]),
    ];
    estado.plegados = new Set();
    estado.sel = "dir";
    estado.editando = true;
    marcarSucio();
    pintarTodo();
  }

  // ---------- Búsqueda ----------
  function coincidencias() {
    const q = sinTildes(estado.busqueda.trim());
    if (!q) return null;
    const set = new Set();
    estado.nodos.forEach((n) => {
      if (sinTildes((esVacante(n) ? VACANTE + " vacante " : n.nombre) + " " + n.cargo + " " + n.nota).includes(q)) set.add(n.id);
    });
    return set;
  }

  // ---------- Pintado ----------
  function construirShell() {
    raiz.dataset.listo = "1";
    raiz.className = "org";
    raiz.innerHTML = `
      <div class="org-barra">
        <label class="org-busca"><span class="org-sr">Buscar en el organigrama</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input type="search" id="orgBusca" placeholder="Buscar persona o puesto…" autocomplete="off" maxlength="60">
        </label>
        <div class="org-grupo" role="group" aria-label="Ramas">
          <button type="button" class="org-btn" data-act="expandir" title="Desplegar todas las ramas">Desplegar todo</button>
          <button type="button" class="org-btn" data-act="plegar" title="Plegar todas las ramas">Plegar todo</button>
        </div>
        <div class="org-grupo" role="group" aria-label="Zoom">
          <button type="button" class="org-btn org-btn-ico" data-act="zoom-menos" aria-label="Alejar">−</button>
          <button type="button" class="org-btn org-zoom-val" data-act="zoom-reset" aria-label="Restablecer zoom" id="orgZoomVal">100%</button>
          <button type="button" class="org-btn org-btn-ico" data-act="zoom-mas" aria-label="Acercar">+</button>
        </div>
        <div class="org-grupo" role="group" aria-label="Orientación">
          <button type="button" class="org-btn" data-act="orient-v" id="orgOrV" aria-pressed="true">Vertical</button>
          <button type="button" class="org-btn" data-act="orient-h" id="orgOrH" aria-pressed="false">Horizontal</button>
        </div>
        <div class="org-grupo" role="group" aria-label="Descargar como imagen">
          <button type="button" class="org-btn" data-act="descargar-claro" title="Descargar el organigrama completo como imagen PNG (fondo claro)">Imagen clara</button>
          <button type="button" class="org-btn" data-act="descargar-oscuro" title="Descargar el organigrama completo como imagen PNG (modo oscuro)">Imagen oscura</button>
        </div>
        <button type="button" class="org-btn org-btn-edit" data-act="editar" id="orgBtnEditar" hidden>Editar organigrama</button>
      </div>
      <div class="org-edit-barra" id="orgEditBarra" hidden></div>
      <div class="org-dropraiz" id="orgDropRaiz" hidden>Suelta aquí para quitarle este jefe (si no tiene más, pasa a ser casilla raíz)</div>
      <div class="org-lienzo" id="orgLienzo" tabindex="0" aria-label="Organigrama"><div class="org-zoom" id="orgZoom"></div></div>
      <div class="org-detalle" id="orgDetalle" aria-live="polite"></div>
    `;
    raiz.addEventListener("click", onClick);
    raiz.addEventListener("keydown", onKey);
    raiz.addEventListener("input", onInput);
    raiz.addEventListener("change", onInput);
    raiz.addEventListener("dragstart", onDragStart);
    raiz.addEventListener("dragover", onDragOver);
    raiz.addEventListener("dragleave", onDragLeave);
    raiz.addEventListener("drop", onDrop);
    raiz.addEventListener("dragend", onDragEnd);
    $("orgBusca").addEventListener("input", (e) => { estado.busqueda = e.target.value; pintarArbol(); });
    activarPaneo($("orgLienzo"));
    window.addEventListener("beforeunload", (e) => { if (estado.sucio) { e.preventDefault(); e.returnValue = ""; } });
  }

  function pintarTodo() {
    pintarBarras();
    pintarBarraEdicion();
    pintarArbol();
    pintarDetalle();
  }

  function pintarBarras() {
    const admin = esAdmin();
    const be = $("orgBtnEditar");
    if (be) {
      be.hidden = !admin;
      be.textContent = estado.editando ? "Salir de la edición" : "Editar organigrama";
      be.classList.toggle("org-on", estado.editando);
    }
    $("orgOrV").setAttribute("aria-pressed", String(estado.orientacion === "vertical"));
    $("orgOrH").setAttribute("aria-pressed", String(estado.orientacion === "horizontal"));
    $("orgZoomVal").textContent = Math.round(estado.zoom * 100) + "%";
    raiz.classList.toggle("org-editando", estado.editando);
  }

  function pintarBarraEdicion() {
    const b = $("orgEditBarra");
    if (!b) return;
    if (!estado.editando) { b.hidden = true; return; }
    b.hidden = false;
    const lleno = estado.nodos.length >= MAX_NODOS;
    b.innerHTML = `
      <span class="org-edit-info"><strong>Modo edición.</strong> Pulsa una casilla para editarla. Arrástrala sobre otra para cambiar de jefe; mantén <kbd>Mayús</kbd> al soltar para añadirle un jefe más. ${estado.nodos.length}/${MAX_NODOS} casillas.</span>
      <span class="org-edit-acciones">
        <button type="button" class="org-btn" data-act="anadir-raiz" ${lleno ? "disabled" : ""}>+ Casilla raíz</button>
        <button type="button" class="org-btn" data-act="descartar" ${estado.sucio ? "" : "disabled"}>Descartar</button>
        <button type="button" class="org-btn org-btn-guardar" data-act="guardar" ${estado.sucio && !estado.guardando ? "" : "disabled"}>${estado.guardando ? "Guardando…" : estado.sucio ? "Guardar cambios" : "Sin cambios"}</button>
      </span>`;
  }

  // `desde` = casilla bajo la que se dibuja esta copia. Si la casilla depende de varias, su equipo se
  // dibuja solo bajo su jefe principal (el primero); bajo los demás aparece como "enlace" sin equipo.
  function nodoHTML(n, ctx, desde) {
    const jefes = padresDe(n);
    const enlace = !!desde && jefes[0] !== desde;
    // Una copia «enlace» (la casilla bajo uno de sus otros jefes) muestra su equipo igual que la principal; se puede plegar.
    const claveAlias = enlace ? n.id + "@" + desde : "";
    const kids = hijos(n.id);
    ctx.cuenta++;
    const sobrepasa = enlace && ctx.cuenta > MAX_COPIAS;
    if (sobrepasa) ctx.truncado = true;
    const plegado = enlace
      ? estado.aliasCerrados.has(claveAlias) || (sobrepasa && !estado.aliasAbiertos.has(claveAlias))
      : kids.length > 0 && estado.plegados.has(n.id) && !ctx.forzados.has(n.id);
    const clases = ["org-nodo", "c-" + (COLORES.includes(n.color) ? n.color : "azul")];
    if (enlace) clases.push("org-alias");
    if (esVacante(n)) clases.push("org-vacante");
    if (estado.sel === n.id) clases.push("org-sel");
    if (ctx.ruta.has(n.id)) clases.push("org-ruta");
    if (ctx.coinciden) clases.push(ctx.coinciden.has(n.id) ? "org-match" : "org-tenue");
    const toggle = kids.length
      ? `<button type="button" class="org-toggle" ${enlace ? `data-toggle-alias="${esc(claveAlias)}"` : `data-toggle="${esc(n.id)}"`} aria-expanded="${plegado ? "false" : "true"}" title="${plegado ? "Desplegar" : "Plegar"} ${kids.length} subordinada${kids.length === 1 ? "" : "s"}">${plegado ? "+" + kids.length : "−"}</button>`
      : "";
    let insignia = "";
    if (jefes.length > 1) {
      const nombres = jefes.map((j) => nombreDe(porId(j) || {}));
      const aviso = enlace
        ? `También depende de aquí: es la misma casilla que bajo «${nombres[0]}», y su equipo se repite aquí.`
        : `Depende de varias casillas: ${nombres.join(", ")}.`;
      insignia = `<span class="org-enlace" title="${esc(aviso)}">${ICONO_ENLACE}</span>`;
    }
    const li = `<li><div class="${clases.join(" ")}" data-id="${esc(n.id)}" data-padre="${esc(desde || "")}" role="button" tabindex="0" aria-pressed="${estado.sel === n.id}" ${estado.editando ? 'draggable="true"' : ""}>
        <span class="org-ini">${esc(esVacante(n) ? "?" : iniciales(n.nombre))}</span>
        <span class="org-txt"><span class="org-nombre">${esc(nombreDe(n))}</span>${n.cargo ? `<span class="org-cargo">${esc(n.cargo)}</span>` : ""}</span>
        ${insignia}${toggle}
      </div>`;
    if (!kids.length || plegado) return li + "</li>";
    return li + `<ul>${kids.map((h) => nodoHTML(h, ctx, n.id)).join("")}</ul></li>`;
  }

  function pintarArbol() {
    const zoom = $("orgZoom");
    const lienzo = $("orgLienzo");
    if (!zoom) return;
    zoom.style.zoom = String(estado.zoom);
    if (estado.cargando && !estado.cargado) { zoom.innerHTML = '<p class="org-vacio">Cargando organigrama…</p>'; return; }
    if (estado.error) {
      zoom.innerHTML = `<div class="org-vacio org-error"><p>No se ha podido cargar el organigrama: ${esc(estado.error)}</p><button type="button" class="org-btn" data-act="reintentar">Reintentar</button></div>`;
      return;
    }
    if (!estado.nodos.length) {
      zoom.innerHTML = esAdmin()
        ? `<div class="org-vacio"><p><strong>Todavía no hay organigrama del medio.</strong> Crea la primera casilla o empieza desde una plantilla de ejemplo (dirección, redacción, redes, fotografía, tienda…) y adáptala.</p>
             <div class="org-vacio-acc"><button type="button" class="org-btn org-btn-guardar" data-act="anadir-raiz-vacio">Crear desde cero</button><button type="button" class="org-btn" data-act="plantilla">Usar plantilla de ejemplo</button></div></div>`
        : '<div class="org-vacio"><p>El organigrama aún no se ha configurado.</p></div>';
      return;
    }
    const coinciden = coincidencias();
    // las ramas con coincidencias dentro se muestran abiertas aunque estén plegadas
    const forzados = new Set();
    if (coinciden) coinciden.forEach((id) => ancestros(id).forEach((a) => forzados.add(a)));
    const rutaSel = new Set(estado.sel ? [estado.sel, ...ancestros(estado.sel)] : []);
    const ctx = { coinciden, forzados, ruta: rutaSel, cuenta: 0, truncado: false };
    const scrollX = lienzo.scrollLeft, scrollY = lienzo.scrollTop;
    zoom.innerHTML = `<ul class="org-arbol ${estado.orientacion === "horizontal" ? "org-h" : "org-v"}">${hijos(null).map((n) => nodoHTML(n, ctx, null)).join("")}</ul>`;
    lienzo.scrollLeft = scrollX; lienzo.scrollTop = scrollY;
    if (ctx.truncado) zoom.insertAdjacentHTML("beforeend", '<p class="org-sin-resultados">El organigrama es muy grande: algunas copias «enlace» se muestran plegadas (pulsa su botón +N para verlas).</p>');
    if (coinciden && !coinciden.size) {
      zoom.insertAdjacentHTML("beforeend", '<p class="org-sin-resultados">Ninguna casilla coincide con la búsqueda.</p>');
    }
  }

  // Opciones del desplegable "añadir jefe": todas menos ella, sus subordinadas y los jefes que ya tiene.
  function opcionesPadre(idActual) {
    const prohibidos = descendientes(idActual);
    prohibidos.add(idActual);
    padresDe(porId(idActual)).forEach((p) => prohibidos.add(p));
    const filas = [];
    (function rec(padre, prof, vistos) {
      hijos(padre).forEach((n) => {
        if (vistos.has(n.id)) return; // casillas con varios jefes: solo una vez
        vistos.add(n.id);
        if (!prohibidos.has(n.id)) {
          filas.push(`<option value="${esc(n.id)}">${"\u00a0\u00a0".repeat(prof)}${prof ? "↳ " : ""}${esc(nombreDe(n))}</option>`);
        }
        rec(n.id, prof + 1, vistos);
      });
    })(null, 0, new Set());
    return filas.join("");
  }

  // Casillas que se pueden añadir como subordinadas de `idActual` (aunque ya tengan otros jefes):
  // no ella misma, ni sus jefes (directos o lejanos: haría un bucle), ni las que ya son suyas.
  function opcionesSubordinada(idActual) {
    const prohibidos = ancestros(idActual);
    prohibidos.add(idActual);
    return estado.nodos
      .filter((c) => !prohibidos.has(c.id) && !padresDe(c).includes(idActual) && padresDe(c).length < MAX_JEFES)
      .map((c) => {
        const js = padresDe(c).map(porId).filter(Boolean).map(nombreDe);
        return `<option value="${esc(c.id)}">${esc(nombreDe(c))}${js.length ? " (ya depende de " + esc(js.join(", ")) + ")" : " (sin jefe)"}</option>`;
      }).join("");
  }

  function pintarDetalle() {
    const d = $("orgDetalle");
    if (!d) return;
    const n = estado.sel ? porId(estado.sel) : null;
    if (!n) {
      d.innerHTML = estado.nodos.length
        ? `<p class="org-ayuda">${estado.editando ? "Pulsa una casilla para editarla." : "Pulsa una casilla para ver su detalle y su cadena de mando."}</p>`
        : "";
      return;
    }
    const kids = hijos(n.id);
    if (!estado.editando) {
      const jefes = padresDe(n).map(porId).filter(Boolean);
      const cadenas = jefes.length
        ? jefes.map((j) => ruta(j.id).map((c) => esc(nombreDe(c))).concat(esc(nombreDe(n))).join(" › ")).join("<br>")
        : esc(nombreDe(n));
      d.innerHTML = `
        <div class="org-det c-${esc(n.color)}">
          <div class="org-det-cab"><span class="org-ini org-ini-g">${esc(esVacante(n) ? "?" : iniciales(n.nombre))}</span>
            <div><h4>${esc(nombreDe(n))}</h4>${n.cargo ? `<p class="org-det-cargo">${esc(n.cargo)}</p>` : ""}</div>
            <button type="button" class="org-x" data-act="cerrar" aria-label="Cerrar detalle">✕</button></div>
          ${n.nota ? `<p class="org-det-nota">${esc(n.nota).replace(/\n/g, "<br>")}</p>` : ""}
          <dl class="org-det-datos">
            <div><dt>${jefes.length > 1 ? "Cadenas de mando" : "Cadena de mando"}</dt><dd>${cadenas}</dd></div>
            <div><dt>Reporta a</dt><dd>${jefes.length ? jefes.map((j) => `<button type="button" class="org-chip" data-sel="${esc(j.id)}">${esc(nombreDe(j))}</button>`).join(" ") : "— (casilla raíz)"}</dd></div>
            <div><dt>Equipo directo</dt><dd>${kids.length ? kids.map((k) => `<button type="button" class="org-chip" data-sel="${esc(k.id)}">${esc(nombreDe(k))}</button>`).join(" ") : "Sin subordinadas"}</dd></div>
          </dl>
        </div>`;
      return;
    }
    const hermanas = hijos(padresDe(n)[0] || null);
    const i = hermanas.indexOf(n);
    const jefesN = padresDe(n);
    const chipsJefes = jefesN.length
      ? jefesN.map((j, k) => {
          const p = porId(j);
          const nom = p ? nombreDe(p) : "?";
          return `<span class="org-jefe${k === 0 ? " org-jefe-pri" : ""}"><button type="button" class="org-jefe-n" data-pp="${esc(j)}" ${k === 0 ? "disabled" : ""} title="${k === 0 ? "Jefe principal: su equipo se dibuja bajo esta casilla" : "Hacer principal (dibujar su equipo bajo esta casilla)"}">${k === 0 && jefesN.length > 1 ? "★ " : ""}${esc(nom)}</button><button type="button" class="org-jefe-x" data-pq="${esc(j)}" aria-label="Quitar a ${esc(nom)} como jefe" title="Quitar">✕</button></span>`;
        }).join("")
      : '<span class="org-sin-jefe">Nadie (casilla raíz)</span>';
    const chipsHijos = kids.length
      ? kids.map((k) => `<span class="org-jefe"><button type="button" class="org-jefe-n" data-sel="${esc(k.id)}" title="Ir a esta casilla">${esc(nombreDe(k))}${padresDe(k).length > 1 ? " ·" + padresDe(k).length : ""}</button><button type="button" class="org-jefe-x" data-sq="${esc(k.id)}" aria-label="Quitar a ${esc(nombreDe(k))} de sus subordinadas" title="Quitar de sus subordinadas">✕</button></span>`).join("")
      : '<span class="org-sin-jefe">Sin subordinadas</span>';
    d.innerHTML = `
      <div class="org-det org-det-edit c-${esc(n.color)}">
        <div class="org-det-cab"><h4>Editar casilla</h4><button type="button" class="org-x" data-act="cerrar" aria-label="Cerrar edición">✕</button></div>
        <div class="org-form">
          <label>Nombre<input type="text" id="orgFNombre" maxlength="80" value="${esc(n.nombre)}" placeholder="Persona o área (vacío = «${VACANTE}»)"></label>
          <label>Cargo / puesto<input type="text" id="orgFCargo" maxlength="80" value="${esc(n.cargo)}" placeholder="Ej: Responsable de redes"></label>
          <label class="org-form-ancho">Notas<textarea id="orgFNota" maxlength="400" rows="3" placeholder="Funciones, contacto, horarios…">${esc(n.nota)}</textarea></label>
          <div class="org-form-ancho"><span class="org-lbl">Depende de${jefesN.length > 1 ? ` (${jefesN.length} jefes)` : ""}</span>
            <div class="org-jefes">${chipsJefes}</div>
            <select id="orgFPadreNuevo" aria-label="Añadir otro jefe" ${jefesN.length >= MAX_JEFES ? "disabled" : ""}><option value="">${jefesN.length ? "+ Añadir otro jefe…" : "+ Elegir jefe…"}</option>${opcionesPadre(n.id)}</select>
            <p class="org-mini">Puede depender de varias casillas a la vez. La ★ marca bajo cuál se dibuja su equipo; en las demás aparece como enlace.</p>
          </div>
          <div class="org-form-ancho"><span class="org-lbl">Subordinadas${kids.length ? ` (${kids.length})` : ""}</span>
            <div class="org-jefes">${chipsHijos}</div>
            <select id="orgFHijoNuevo" aria-label="Añadir una casilla existente como subordinada"><option value="">+ Añadir una casilla existente como subordinada…</option>${opcionesSubordinada(n.id)}</select>
            <p class="org-mini">Sirve para casillas que ya existen, aunque ya tengan otros jefes (pasan a tener también a esta). «+ Añadir subordinada» crea una nueva.</p>
          </div>
          <div><span class="org-lbl">Color</span>
            <div class="org-colores" role="radiogroup" aria-label="Color de la casilla">${COLORES.map((c) => `<button type="button" class="org-sw c-${c}${n.color === c ? " org-sw-on" : ""}" role="radio" aria-checked="${n.color === c}" data-color="${c}" title="${c}"></button>`).join("")}</div>
          </div>
          ${kids.length ? `<label class="org-check org-form-ancho"><input type="checkbox" id="orgFPlegada"${n.colapsado ? " checked" : ""}> Mostrarla plegada por defecto (oculta sus ${kids.length} subordinada${kids.length === 1 ? "" : "s"})</label>` : ""}
        </div>
        <div class="org-acciones">
          <button type="button" class="org-btn" data-act="anadir-hijo" ${estado.nodos.length >= MAX_NODOS ? "disabled" : ""}>+ Añadir subordinada</button>
          <button type="button" class="org-btn" data-act="subir" ${i <= 0 ? "disabled" : ""} title="Mover antes entre sus hermanas">↑ Subir</button>
          <button type="button" class="org-btn" data-act="bajar" ${i >= hermanas.length - 1 ? "disabled" : ""} title="Mover después entre sus hermanas">↓ Bajar</button>
          <button type="button" class="org-btn org-peligro" data-act="quitar">Quitar casilla</button>
          ${kids.length ? '<button type="button" class="org-btn org-peligro" data-act="quitar-rama">Quitar con subordinadas</button>' : ""}
        </div>
      </div>`;
  }

  // ---------- Eventos ----------
  function seleccionar(id) {
    estado.sel = estado.sel === id && !estado.editando ? null : id;
    pintarArbol();
    pintarDetalle();
    if (estado.editando && estado.sel) {
      const f = $("orgFNombre");
      if (f && window.matchMedia && window.matchMedia("(min-width: 700px)").matches) f.focus({ preventScroll: true });
    }
  }

  function onClick(e) {
    const sq = e.target.closest("[data-sq]");
    if (sq && estado.sel && estado.editando) { quitarJefe(sq.dataset.sq, estado.sel); return; }
    const pq = e.target.closest("[data-pq]");
    if (pq && estado.sel && estado.editando) { quitarJefe(estado.sel, pq.dataset.pq); return; }
    const pp = e.target.closest("[data-pp]");
    if (pp && estado.sel && estado.editando) { if (!pp.disabled) hacerPrincipal(estado.sel, pp.dataset.pp); return; }
    const tga = e.target.closest("[data-toggle-alias]");
    if (tga) {
      const k = tga.dataset.toggleAlias;
      if (tga.getAttribute("aria-expanded") === "false") { estado.aliasCerrados.delete(k); estado.aliasAbiertos.add(k); }
      else { estado.aliasAbiertos.delete(k); estado.aliasCerrados.add(k); }
      pintarArbol();
      return;
    }
    const tog = e.target.closest("[data-toggle]");
    if (tog) {
      const id = tog.dataset.toggle;
      if (estado.plegados.has(id)) estado.plegados.delete(id); else estado.plegados.add(id);
      pintarArbol();
      return;
    }
    const sw = e.target.closest("[data-color]");
    if (sw && estado.sel && estado.editando) {
      const n = porId(estado.sel);
      if (n && n.color !== sw.dataset.color) { n.color = sw.dataset.color; marcarSucio(); pintarArbol(); pintarDetalle(); }
      return;
    }
    const chip = e.target.closest("[data-sel]");
    if (chip) { estado.sel = chip.dataset.sel; pintarArbol(); pintarDetalle(); return; }
    const nodo = e.target.closest(".org-nodo");
    if (nodo) { seleccionar(nodo.dataset.id); return; }
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    switch (btn.dataset.act) {
      case "expandir": estado.plegados.clear(); estado.aliasCerrados.clear(); pintarArbol(); break;
      case "plegar":
        estado.plegados = new Set(estado.nodos.filter((n) => hijos(n.id).length).map((n) => n.id));
        estado.nodos.forEach((n) => { const ps = padresDe(n); if (hijos(n.id).length) ps.slice(1).forEach((p) => estado.aliasCerrados.add(n.id + "@" + p)); });
        pintarArbol(); break;
      case "zoom-mas": cambiarZoom(estado.zoom + ZOOM_PASO); break;
      case "zoom-menos": cambiarZoom(estado.zoom - ZOOM_PASO); break;
      case "zoom-reset": cambiarZoom(1); break;
      case "orient-v": case "orient-h": {
        const nueva = btn.dataset.act === "orient-h" ? "horizontal" : "vertical";
        if (nueva !== estado.orientacion) { estado.orientacion = nueva; if (estado.editando) marcarSucio(); pintarBarras(); pintarArbol(); }
        break;
      }
      case "editar": alternarEdicion(); break;
      case "guardar": guardar(); break;
      case "descartar": descartar(); break;
      case "anadir-raiz": case "anadir-raiz-vacio":
        if (btn.dataset.act === "anadir-raiz-vacio") estado.editando = true;
        anadir(null); break;
      case "plantilla": plantilla(); break;
      case "anadir-hijo": anadir(estado.sel); break;
      case "subir": reordenar(estado.sel, -1); break;
      case "bajar": reordenar(estado.sel, 1); break;
      case "quitar": quitar(estado.sel, false); break;
      case "quitar-rama": quitar(estado.sel, true); break;
      case "cerrar": estado.sel = null; pintarArbol(); pintarDetalle(); break;
      case "reintentar": estado.cargado = false; cargar(true); break;
      case "descargar-claro": descargarImagen("claro"); break;
      case "descargar-oscuro": descargarImagen("oscuro"); break;
    }
  }

  function onKey(e) {
    const nodo = e.target.closest && e.target.closest(".org-nodo");
    if (nodo && e.target === nodo && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      seleccionar(nodo.dataset.id);
    } else if (e.key === "Escape" && estado.sel && !(e.target.matches && e.target.matches("input, textarea, select"))) {
      estado.sel = null; pintarArbol(); pintarDetalle();
    }
  }

  function onInput(e) {
    if (!estado.editando || !estado.sel) return;
    const n = porId(estado.sel);
    if (!n) return;
    const id = e.target.id;
    if (id === "orgFNombre") n.nombre = e.target.value;
    else if (id === "orgFCargo") n.cargo = e.target.value;
    else if (id === "orgFNota") n.nota = e.target.value;
    else if (id === "orgFHijoNuevo") { if (e.target.value) mover(e.target.value, n.id, { anadir: true }); return; }
    else if (id === "orgFPadreNuevo") { if (e.target.value) mover(n.id, e.target.value, { anadir: true }); return; }
    else if (id === "orgFPlegada") {
      n.colapsado = e.target.checked;
      if (n.colapsado) estado.plegados.add(n.id); else estado.plegados.delete(n.id);
    } else return;
    marcarSucio();
    pintarArbol();
  }

  function cambiarZoom(z) {
    estado.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
    pintarBarras();
    pintarArbol();
  }

  // Arrastrar el fondo del lienzo para desplazarse (con ratón).
  function activarPaneo(lienzo) {
    let activo = false, x0 = 0, y0 = 0, sl = 0, st = 0;
    lienzo.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.target.closest(".org-nodo, button, .org-vacio")) return;
      activo = true; x0 = e.clientX; y0 = e.clientY; sl = lienzo.scrollLeft; st = lienzo.scrollTop;
      lienzo.classList.add("org-paneando");
    });
    window.addEventListener("mousemove", (e) => {
      if (!activo) return;
      lienzo.scrollLeft = sl - (e.clientX - x0);
      lienzo.scrollTop = st - (e.clientY - y0);
    });
    window.addEventListener("mouseup", () => { activo = false; lienzo.classList.remove("org-paneando"); });
  }

  // ---------- Arrastrar y soltar (cambiar de jefe) ----------
  function destinoValido(idDestino) {
    const a = estado.arrastrando;
    if (!a || a === idDestino) return false;
    if (descendientes(a).has(idDestino)) return false;
    const n = porId(a);
    return !!n && !padresDe(n).includes(idDestino);
  }
  function onDragStart(e) {
    const nodo = e.target.closest && e.target.closest(".org-nodo");
    if (!estado.editando || !nodo) return;
    estado.arrastrando = nodo.dataset.id;
    estado.arrastrandoDesde = nodo.dataset.padre || null;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", "org:" + nodo.dataset.id); } catch { /* Safari antiguo */ }
    nodo.classList.add("org-arrastrando");
    const dz = $("orgDropRaiz");
    if (dz && padresDe(porId(nodo.dataset.id)).length) dz.hidden = false;
  }
  function onDragOver(e) {
    if (!estado.arrastrando) return;
    const nodo = e.target.closest(".org-nodo");
    const dz = e.target.closest("#orgDropRaiz");
    if (nodo && destinoValido(nodo.dataset.id)) { e.preventDefault(); nodo.classList.add("org-drop"); }
    else if (dz) { e.preventDefault(); dz.classList.add("org-drop"); }
  }
  function onDragLeave(e) {
    const nodo = e.target.closest && e.target.closest(".org-nodo");
    if (nodo) nodo.classList.remove("org-drop");
    const dz = e.target.closest && e.target.closest("#orgDropRaiz");
    if (dz) dz.classList.remove("org-drop");
  }
  function onDrop(e) {
    if (!estado.arrastrando) return;
    const id = estado.arrastrando;
    const desde = estado.arrastrandoDesde;
    const anadir = !!(e.shiftKey || e.ctrlKey || e.altKey || e.metaKey); // con Mayús: un jefe más
    const nodo = e.target.closest(".org-nodo");
    const dz = e.target.closest("#orgDropRaiz");
    const destino = nodo ? nodo.dataset.id : null;
    const valido = nodo ? destinoValido(destino) : false;
    limpiarArrastre();
    if (nodo && valido) { e.preventDefault(); mover(id, destino, { desde, anadir }); }
    else if (dz) { e.preventDefault(); mover(id, null, { desde }); }
  }
  function onDragEnd() { limpiarArrastre(); }
  function limpiarArrastre() {
    estado.arrastrando = null;
    estado.arrastrandoDesde = null;
    raiz.querySelectorAll(".org-drop, .org-arrastrando").forEach((el) => el.classList.remove("org-drop", "org-arrastrando"));
    const dz = $("orgDropRaiz"); if (dz) dz.hidden = true;
  }

  // ---------- Descargar como imagen (PNG) ----------
  // Se dibuja en un <canvas> propio (sin librerías): siempre el organigrama COMPLETO (con todas las
  // ramas desplegadas) y con la orientación elegida, en tema claro u oscuro. Los textos largos (nombre y
  // cargo) se parten en varias líneas y la casilla crece: nunca se cortan.
  const HEX = { azul: "#2d6cdf", rojo: "#d1132e", verde: "#13a76a", amarillo: "#e0a800", morado: "#7a3fe0", rosa: "#e23d94", gris: "#66718a", naranja: "#f07a1a" };
  const PALETAS = {
    claro:  { fondo: "#ffffff", caja: "#ffffff", borde: "#dde3f0", linea: "#aab5cf", texto: "#16204a", suave: "#5b6478", sombra: "rgba(11,18,87,.18)", col: HEX },
    oscuro: { fondo: "#131925", caja: "#1f2840", borde: "#3a4660", linea: "#4a5878", texto: "#e6ebf7", suave: "#98a3bb", sombra: "rgba(0,0,0,.45)", col: { ...HEX, azul: "#5b9bff", gris: "#8591ab" } },
  };
  const FUENTE = '"Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif';
  const F_NOMBRE = `800 12px ${FUENTE}`, F_CARGO = `600 10.5px ${FUENTE}`;
  const LH_NOMBRE = 14, LH_CARGO = 13;

  // Parte el texto en tantas líneas como hagan falta; una palabra más larga que la línea se parte por letras.
  function envolver(ctx, texto, maxAncho) {
    const cabe = (t) => ctx.measureText(t).width <= maxAncho;
    const lineas = [];
    let actual = "";
    String(texto).split(/\s+/).filter(Boolean).forEach((p) => {
      const prueba = actual ? actual + " " + p : p;
      if (cabe(prueba)) { actual = prueba; return; }
      if (actual) { lineas.push(actual); actual = ""; }
      let resto = p;
      while (!cabe(resto) && resto.length > 1) {
        let i = resto.length - 1;
        while (i > 1 && !cabe(resto.slice(0, i))) i--;
        lineas.push(resto.slice(0, i));
        resto = resto.slice(i);
      }
      actual = resto;
    });
    if (actual) lineas.push(actual);
    return lineas;
  }

  // Posiciona las casillas: cada una bajo su jefe principal; bajo los demás jefes va como enlace (sin equipo).
  function disenoImagen(ctx, horizontal) {
    const W = 200, MINH = 52, GA = 18, GP = 34, anchoT = W - 59; // ancho de casilla, hueco entre hermanas y entre niveles, ancho de texto
    const medir = (n) => {
      ctx.font = F_NOMBRE; const nl = envolver(ctx, nombreDe(n), anchoT);
      ctx.font = F_CARGO; const cl = n.cargo ? envolver(ctx, n.cargo, anchoT) : [];
      return { nl, cl, h: Math.max(MINH, nl.length * LH_NOMBRE + cl.length * LH_CARGO + 18) };
    };
    let cuenta = 0; // tope de casillas dibujadas (1500): pasado el tope, las copias enlace van sin equipo
    const construir = (n, desde, nivel) => {
      const alias = !!desde && padresDe(n)[0] !== desde;
      const m = medir(n);
      cuenta++;
      const kids = nivel > 200 || (alias && cuenta > 1500) ? [] : hijos(n.id).map((h) => construir(h, n.id, nivel + 1));
      const tam = horizontal ? m.h : W;
      const ancho = kids.length ? Math.max(tam, kids.reduce((a, k) => a + k.ancho, 0) + GA * (kids.length - 1)) : tam;
      return { n, alias, kids, ancho, nivel, ...m };
    };
    const raices = hijos(null).map((n) => construir(n, null, 0));
    const items = [];
    const colocar = (it, inicio, padre) => {
      it.c = inicio + it.ancho / 2; it.padre = padre; items.push(it);
      let x = inicio;
      it.kids.forEach((k) => { colocar(k, x, it); x += k.ancho + GA; });
    };
    let x = 0;
    raices.forEach((r) => { colocar(r, x, null); x += r.ancho + GA; });
    const total = Math.max(horizontal ? MINH : W, x - GA);
    const niveles = items.reduce((m, i) => Math.max(m, i.nivel), 0) + 1;
    const M = 28, TOP = 46; // margen y espacio para el título
    const altNivel = Array(niveles).fill(MINH);
    items.forEach((it) => { altNivel[it.nivel] = Math.max(altNivel[it.nivel], it.h); });
    const yNivel = []; let ay = M + TOP;
    altNivel.forEach((a, k) => { yNivel[k] = ay; ay += a + GP; });
    items.forEach((it) => {
      if (horizontal) { it.x = M + it.nivel * (W + GP); it.y = M + TOP + it.c - it.h / 2; }
      else { it.x = M + it.c - W / 2; it.y = yNivel[it.nivel] + (altNivel[it.nivel] - it.h) / 2; }
    });
    const ancho = M * 2 + (horizontal ? niveles * W + (niveles - 1) * GP : total);
    const alto = horizontal ? M * 2 + TOP + total : ay - GP + M;
    return { items, W, ancho: Math.max(ancho, 380), alto };
  }

  function rectRedondo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function dibujarImagen(ctx, d, horizontal, pal) {
    ctx.fillStyle = pal.fondo; ctx.fillRect(0, 0, d.ancho, d.alto);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = pal.texto; ctx.font = `800 17px ${FUENTE}`; ctx.textAlign = "left";
    ctx.fillText("Organigrama de El Otro Fútbol", 28, 40);
    ctx.fillStyle = pal.suave; ctx.font = `600 11px ${FUENTE}`; ctx.textAlign = "right";
    ctx.fillText(new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }), d.ancho - 28, 40);
    ctx.textAlign = "left";
    // conectores
    ctx.strokeStyle = pal.linea; ctx.lineWidth = 2; ctx.lineJoin = "round";
    d.items.forEach((it) => {
      const p = it.padre; if (!p) return;
      ctx.beginPath();
      if (horizontal) {
        const x1 = p.x + d.W, y1 = p.y + p.h / 2, x2 = it.x, y2 = it.y + it.h / 2, xm = (x1 + x2) / 2;
        ctx.moveTo(x1, y1); ctx.lineTo(xm, y1); ctx.lineTo(xm, y2); ctx.lineTo(x2, y2);
      } else {
        const x1 = p.x + d.W / 2, y1 = p.y + p.h, x2 = it.x + d.W / 2, y2 = it.y, ym = (y1 + y2) / 2;
        ctx.moveTo(x1, y1); ctx.lineTo(x1, ym); ctx.lineTo(x2, ym); ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    });
    // casillas
    d.items.forEach((it) => {
      const n = it.n, vac = esVacante(n), col = pal.col[n.color] || pal.col.azul;
      const { x, y, h } = it, w = d.W;
      ctx.save();
      ctx.shadowColor = pal.sombra; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      rectRedondo(ctx, x, y, w, h, 11); ctx.fillStyle = pal.caja; ctx.fill();
      ctx.restore();
      ctx.save();
      rectRedondo(ctx, x, y, w, h, 11); ctx.clip();
      ctx.fillStyle = col; ctx.fillRect(x, y, 5, h);
      ctx.restore();
      rectRedondo(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 11);
      ctx.strokeStyle = pal.borde; ctx.lineWidth = 1.5;
      ctx.setLineDash(it.alias || vac ? [5, 3] : []); ctx.stroke(); ctx.setLineDash([]);
      // avatar
      const ax = x + 5 + 8 + 15, ay = y + h / 2;
      ctx.beginPath(); ctx.arc(ax, ay, 15, 0, Math.PI * 2);
      if (vac) { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]); }
      else { ctx.fillStyle = col; ctx.fill(); }
      ctx.fillStyle = vac ? col : "#ffffff"; ctx.font = `800 11px ${FUENTE}`; ctx.textAlign = "center";
      ctx.fillText(vac ? "?" : iniciales(n.nombre), ax, ay + 4); ctx.textAlign = "left";
      // textos (sin cortar: la casilla ya tiene la altura que necesitan)
      const tx = ax + 15 + 8;
      let ty = y + h / 2 - (it.nl.length * LH_NOMBRE + it.cl.length * LH_CARGO) / 2;
      ctx.font = F_NOMBRE; ctx.fillStyle = vac ? pal.suave : pal.texto;
      it.nl.forEach((l) => { ctx.fillText(l, tx, ty + 11); ty += LH_NOMBRE; });
      ctx.font = F_CARGO; ctx.fillStyle = pal.suave;
      it.cl.forEach((l) => { ctx.fillText(l, tx, ty + 10); ty += LH_CARGO; });
      // insignia de varios jefes
      if (padresDe(n).length > 1) {
        const bx = x + w - 3, by = y + 3;
        ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2); ctx.fillStyle = pal.caja; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = col; ctx.font = `800 9px ${FUENTE}`; ctx.textAlign = "center"; ctx.fillText(String(padresDe(n).length), bx, by + 3.2); ctx.textAlign = "left";
      }
    });
  }

  function descargarImagen(modo) {
    if (!estado.nodos.length) { toast("Todavía no hay nada que descargar.", "error"); return; }
    const oscuro = modo === "oscuro";
    const horizontal = estado.orientacion === "horizontal";
    const medidor = document.createElement("canvas").getContext("2d");
    if (!medidor) { toast("Tu navegador no permite generar la imagen.", "error"); return; }
    const d = disenoImagen(medidor, horizontal);
    const escala = Math.max(0.4, Math.min(2, 15000 / Math.max(d.ancho, d.alto)));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(d.ancho * escala); lienzo.height = Math.round(d.alto * escala);
    const ctx = lienzo.getContext("2d");
    if (!ctx) { toast("Tu navegador no permite generar la imagen.", "error"); return; }
    ctx.scale(escala, escala);
    dibujarImagen(ctx, d, horizontal, oscuro ? PALETAS.oscuro : PALETAS.claro);
    const nombre = "organigrama-elotrofutbol-" + new Date().toISOString().slice(0, 10) + (oscuro ? "-oscuro" : "") + ".png";
    lienzo.toBlob((blob) => {
      if (!blob) { toast("No se ha podido generar la imagen (¿organigrama demasiado grande?).", "error"); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast("Imagen descargada.", "success");
    }, "image/png");
  }

  window.EOFOrganigrama = { cargar };
})();
