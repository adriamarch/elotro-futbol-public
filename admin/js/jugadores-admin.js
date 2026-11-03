// ---------- Funcionalidades > Jugadores (solo administradores) ----------
// Corrección manual de las fichas de jugador que calcula el servidor a partir
// del minuto a minuto. Backend: /api/admin/jugadores (worker y worker-secondary).
//   GET  /api/admin/jugadores?competicion=&grupo=&club=&q=  -> fichas automáticas + corregidos
//   POST /api/admin/jugadores/fusionar {club, claves, nombre, dorsal}
//   PUT  /api/admin/jugadores/:id {nombre, dorsal, oculto}
//   DELETE /api/admin/jugadores/:id            (deshacer del todo)
//   DELETE /api/admin/jugadores/alias/:aliasId (separar una ficha)
// Depende de globales de admin.js: apiFetch(path, options), window.EOF.toast / confirmar.
//
// Rendimiento (resumen de las decisiones):
//  - Marcar/desmarcar una fila NO reconstruye la tabla: solo cambia la clase y la casilla de las filas
//    afectadas (antes se regeneraban hasta 300 filas en cada clic).
//  - El HTML del escudo de cada club se calcula una sola vez (caché) y no usa onerror inline.
//  - Las filas llevan data-i (índice en el array) en vez de buscar por clave con find() en cada clic.
//  - No se repite una petición si los filtros no han cambiado, y al recargar la lista anterior se queda
//    visible (atenuada) en lugar de parpadear con el esqueleto; así tampoco se pierde el scroll.
//  - Los desplegables y la lista de «corregidos» solo se repintan cuando su contenido cambia de verdad.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  const hay = (v) => v !== null && v !== undefined;
  const toast = (m, t) => (window.EOF && window.EOF.toast ? window.EOF.toast(m, t || "success") : console.log(m));

  const RETARDO_BUSCAR = 300;
  const DORSAL_MAX = 999;
  const JSON_HDR = { "Content-Type": "application/json" };
  const icoVacio = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>`;
  const esqueleto = `<div class="jug-esq" role="status" aria-label="Cargando"><span></span><span></span><span></span><span></span></div>`;
  const CABECERA = `<thead><tr><th class="sel-celda"></th><th class="num">Dorsal</th><th>Ficha</th><th>Club</th><th class="num" title="Goles">G</th><th class="num" title="Asistencias">A</th><th class="num" title="Tarjetas">T</th><th class="num" title="Partidos con alineación">PJ</th><th></th></tr></thead>`;

  // ---------- Escudos (con caché: un club sale en muchas filas) ----------
  // El panel vive en /admin/, así que las rutas relativas llevan "../".
  const cacheEscudos = new Map();
  const escudoVacio = `<span class="jug-escudo"></span>`;
  function escudo(club) {
    let html = cacheEscudos.get(club);
    if (html !== undefined) return html;
    try {
      let u = getEscudoUrl(club);
      if (u && u.startsWith("img/")) u = "../" + u;
      html = u ? `<img class="jug-escudo" src="${esc(u)}" alt="" width="22" height="22" loading="lazy" decoding="async">` : escudoVacio;
      cacheEscudos.set(club, html); // solo se cachea si getEscudoUrl respondió (puede no estar cargado aún)
    } catch { html = escudoVacio; }
    return html;
  }
  const inicial = (t) => esc(String(t || "?").trim().charAt(0).toUpperCase() || "?");
  // Escudo roto -> se oculta. Un único listener en fase de captura (los errores de <img> no burbujean).
  const ocultarEscudoRoto = (e) => { if (e.target.classList && e.target.classList.contains("jug-escudo")) e.target.style.visibility = "hidden"; };

  // ---------- Estado ----------
  let datos = null;              // última respuesta del servidor
  let filas = [];                // datos.jugadores (acceso por índice desde data-i)
  let corrPorId = new Map();     // id -> jugador corregido
  const seleccion = new Map();   // clave compuesta -> fila (todas del mismo club)
  let editando = null;           // id de jugador corregido que se edita (null = fusionar)
  let camposTocados = false;     // la persona ya ha escrito en nombre/dorsal: no se le pisa
  let peticion = 0;
  let paramsActuales = null;     // parámetros de la última carga correcta
  let firmaCorr = null;          // para no repintar «corregidos» si no ha cambiado
  let temporizadorBuscar = null;
  let enlazado = false;

  const clave = (f) => f.club + "\u0001" + f.clave;

  function params() {
    const p = new URLSearchParams({ competicion: $("jugComp").value });
    if ($("jugGrupo").value) p.set("grupo", $("jugGrupo").value);
    if ($("jugClub").value) p.set("club", $("jugClub").value);
    const q = $("jugBuscar").value.trim();
    if (q) p.set("q", q);
    return p.toString();
  }

  // ---------- Carga ----------
  async function cargar(forzar) {
    const p = params();
    if (!forzar && datos && p === paramsActuales) return; // mismos filtros: nada que pedir
    const id = ++peticion;
    const lista = $("jugLista");
    if (!datos) lista.innerHTML = esqueleto;   // solo la primera vez; después se atenúa lo que hay
    lista.setAttribute("aria-busy", "true");
    try {
      const d = await apiFetch("/api/admin/jugadores?" + p);
      if (id !== peticion) return;
      datos = d;
      filas = d.jugadores || [];
      paramsActuales = p;
      poblarFiltros(d);
      pintarStats();
      pintarLista();
      pintarCorregidos();
      if (!$("jugEditor").hidden) mostrarEditor(false); // refresca el texto si la selección ya no está en la lista
    } catch (err) {
      if (id !== peticion) return;
      paramsActuales = null;
      lista.innerHTML = `<div class="jug-vacio jug-vacio-error">${icoVacio}<strong>No se ha podido cargar</strong><span>${esc(err.message)}</span><button type="button" class="jug-btn" data-accion="reintentar">Reintentar</button></div>`;
    } finally {
      if (id === peticion) lista.removeAttribute("aria-busy");
    }
  }

  // ---------- Pintado ----------
  function pintarStats() {
    let sinNombre = 0, fundidas = 0;
    for (const f of filas) {
      if (f.jugador_id) fundidas++;
      else if (f.sin_nombre) sinNombre++;
    }
    const corr = datos.corregidos || [];
    let ocultos = 0;
    for (const j of corr) if (j.oculto) ocultos++;
    const tarjeta = (cls, n, et, tip) => `<div class="jug-stat ${cls}" title="${esc(tip)}"><b>${n}</b><span>${et}</span></div>`;
    $("jugStats").innerHTML =
      tarjeta("azul", datos.total ?? filas.length, "Fichas", "Fichas automáticas con estos filtros")
      + tarjeta(sinNombre ? "ambar" : "verde", sinNombre, "Sin nombre", "Fichas que solo llevan el dorsal")
      + tarjeta("verde", fundidas, "Fundidas", "Fichas ya unidas a un jugador corregido")
      + tarjeta("violeta", corr.length, "Corregidos", "Jugadores corregidos a mano")
      + tarjeta("gris", ocultos, "Ocultos", "Jugadores ocultos en la web");
  }

  // Rellena un <select> solo si sus opciones han cambiado (evita perder el estado del desplegable abierto).
  function rellenarSelect(sel, valores, textoTodos) {
    const firma = valores.join("\u0001");
    if (sel.dataset.firma === firma && sel.options.length) return;
    const actual = sel.value;
    sel.innerHTML = `<option value="">${textoTodos}</option>` + valores.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
    sel.dataset.firma = firma;
    sel.value = valores.includes(actual) ? actual : "";
  }

  function poblarFiltros(d) {
    const g = $("jugGrupo");
    const grupos = (d.grupos || []).filter(Boolean).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    if (grupos.length) { rellenarSelect(g, grupos, "Todos los grupos"); g.hidden = false; }
    else { g.hidden = true; g.innerHTML = ""; delete g.dataset.firma; }
    // Con un club elegido, la respuesta solo trae los clubes de sus partidos: no se pisa el desplegable.
    const c = $("jugClub");
    if (!c.value) rellenarSelect(c, d.clubes || [], "Todos los clubes");
  }

  function filaHtml(f, i) {
    const marcada = seleccion.has(clave(f));
    const sinN = f.sin_nombre && !f.jugador_id;
    const estado = f.jugador_id ? `<span class="jug-badge ok" title="Fundida en un jugador corregido">→ ${esc(f.corregido_como)}</span>`
      : f.sin_nombre ? `<span class="jug-badge">Sin nombre</span>` : "";
    const dorsal = hay(f.dorsal) ? `<span class="jug-dorsal">${esc(f.dorsal)}</span>` : `<span class="jug-dorsal vacio">—</span>`;
    const cifra = (n, c) => { n = n ?? 0; return `<td class="num"><span class="jug-cifra ${c}${Number(n) ? "" : " cero"}">${esc(n)}</span></td>`; };
    // En móvil se ocultan Club, A y T como columnas: esta línea los recoge bajo el nombre.
    const meta = `<span class="jug-meta-mov">${esc(f.club)} · A ${esc(f.asistencias ?? 0)} · T ${esc(f.tarjetas ?? 0)}</span>`;
    return `<tr class="${marcada ? "sel" : ""}${sinN ? " sin-nombre" : ""}" data-i="${i}">
      <td class="sel-celda"><input type="checkbox" ${marcada ? "checked" : ""} aria-label="Seleccionar ${esc(f.nombre)}"></td>
      <td class="num">${dorsal}</td>
      <td class="jug-nombre-celda"><span class="jug-nombre">${esc(f.nombre)}</span>${estado}${meta}</td>
      <td><span class="jug-club">${escudo(f.club)}<span>${esc(f.club)}</span></span></td>
      ${cifra(f.goles, "g")}${cifra(f.asistencias, "a")}${cifra(f.tarjetas, "t")}${cifra(f.partidos, "pj")}
      <td class="acc"><button type="button" class="jug-btn jug-btn-mini" data-accion="editar">Editar</button></td>
    </tr>`;
  }

  function pintarLista() {
    $("jugTotal").textContent = datos.total ? `(${datos.total}${datos.truncado ? ", se muestran 300: filtra por club" : ""})` : "";
    if (!filas.length) {
      $("jugLista").innerHTML = `<div class="jug-vacio">${icoVacio}<strong>No hay fichas con estos filtros</strong><span>Prueba con otro club o borra la búsqueda.</span></div>`;
      return;
    }
    $("jugLista").innerHTML = `<div class="jug-tabla-wrap"><table class="jug-tabla">${CABECERA}<tbody>${filas.map(filaHtml).join("")}</tbody></table></div>`;
  }

  // Pone al día la marca visual de las filas sin reconstruir la tabla.
  function sincronizarFilas() {
    const tb = $("jugLista").querySelector("tbody");
    if (!tb) return;
    for (const tr of tb.rows) {
      const f = filas[+tr.dataset.i];
      if (!f) continue;
      const m = seleccion.has(clave(f));
      if (tr.classList.contains("sel") !== m) {
        tr.classList.toggle("sel", m);
        tr.querySelector('input[type="checkbox"]').checked = m;
      }
    }
  }

  function pintarCorregidos() {
    const lista = datos.corregidos || [];
    corrPorId = new Map(lista.map((j) => [j.id, j]));
    $("jugCorregidosN").textContent = lista.length ? `(${lista.length})` : "";
    const firma = JSON.stringify(lista);
    if (firma === firmaCorr) return; // nada ha cambiado: no se toca el DOM
    firmaCorr = firma;
    if (!lista.length) { $("jugCorregidos").innerHTML = `<div class="jug-vacio">${icoVacio}<strong>Todavía no has corregido a ningún jugador</strong><span>Cuando fusiones o renombres una ficha aparecerá aquí.</span></div>`; return; }
    $("jugCorregidos").innerHTML = lista.map((j) => `
      <div class="jug-corr ${j.oculto ? "oculto" : ""}" data-id="${j.id}">
        <span class="jug-avatar" aria-hidden="true">${inicial(j.nombre)}</span>
        <div class="jug-corr-id">
          <span class="jug-corr-nombre"><span class="jug-corr-txt">${esc(j.nombre)}</span>${hay(j.dorsal) ? `<span class="jug-dorsal">${esc(j.dorsal)}</span>` : ""}${j.oculto ? `<span class="jug-badge oculto">Oculto</span>` : ""}</span>
          <span class="jug-corr-club jug-club">${escudo(j.club)}<span>${esc(j.club)}</span></span>
        </div>
        <div class="jug-corr-acc">
          <button type="button" class="jug-btn jug-btn-mini" data-accion="renombrar">Editar</button>
          <button type="button" class="jug-btn jug-btn-mini" data-accion="ocultar">${j.oculto ? "Mostrar" : "Ocultar"}</button>
          <button type="button" class="jug-btn jug-btn-mini jug-btn-peligro" data-accion="deshacer">Deshacer</button>
        </div>
        <div class="jug-corr-claves">${(j.claves || []).map((c) => `<span class="jug-chip" title="Ficha automática fundida">${esc(c.clave)}<button type="button" data-accion="separar" data-alias="${c.alias_id}" aria-label="Separar ${esc(c.clave)}">✕</button></span>`).join("")}</div>
      </div>`).join("");
  }

  // ---------- Editor ----------
  function mostrarEditor(enfocar) {
    const ed = $("jugEditor");
    if (editando === null && !seleccion.size) { ed.hidden = true; camposTocados = false; return; }
    ed.hidden = false;
    if (editando !== null) {
      const j = corrPorId.get(editando);
      $("jugEditorTxt").innerHTML = `Editando al jugador corregido <strong>${esc(j ? j.nombre : "")}</strong>. El enlace de su ficha no cambia.`;
      if (!camposTocados) {
        $("jugNombre").value = j ? j.nombre : "";
        $("jugDorsal").value = j && hay(j.dorsal) ? j.dorsal : "";
      }
      $("jugGuardar").textContent = "Guardar cambios";
    } else {
      const sel = [...seleccion.values()];
      const club = sel[0].club;
      $("jugEditorTxt").innerHTML = sel.length === 1
        ? `Ficha seleccionada de <strong>${esc(club)}</strong>: ${esc(sel[0].nombre)}. Ponle el nombre correcto o el dorsal.`
        : `<strong>${sel.length} fichas</strong> de ${esc(club)} se fundirán en un solo jugador: ${sel.map((f) => esc(f.nombre)).join(", ")}.`;
      if (!camposTocados) { // si ya está escribiendo, no se le pisa lo que lleva
        const mejor = sel.filter((f) => !f.sin_nombre).sort((a, b) => b.nombre.length - a.nombre.length)[0];
        const yaCorregida = sel.find((f) => f.corregido_como);
        $("jugNombre").value = yaCorregida ? yaCorregida.corregido_como : (mejor ? mejor.nombre : "");
        const conDorsal = sel.find((f) => hay(f.dorsal));
        $("jugDorsal").value = conDorsal ? conDorsal.dorsal : "";
      }
      $("jugGuardar").textContent = sel.length === 1 ? "Guardar" : `Fusionar ${sel.length} fichas`;
    }
    // El foco solo se mueve cuando la persona pide editar; al marcar casillas se respeta donde esté.
    if (enfocar) { $("jugNombre").focus(); $("jugNombre").select(); }
  }

  function limpiarSeleccion() {
    editando = null;
    camposTocados = false;
    seleccion.clear();
    $("jugEditor").hidden = true;
    sincronizarFilas();
  }

  function leerDorsal() {
    const t = $("jugDorsal").value.trim();
    if (t === "") return { ok: true, v: null };
    const n = Number(t);
    return Number.isInteger(n) && n >= 0 && n <= DORSAL_MAX ? { ok: true, v: n } : { ok: false };
  }

  async function guardar() {
    const nombre = $("jugNombre").value.trim();
    const dorsal = leerDorsal();
    if (nombre.length < 2) { $("jugNombre").focus(); return toast("Escribe el nombre del jugador (mínimo 2 letras)", "error"); }
    if (!dorsal.ok) { $("jugDorsal").focus(); return toast(`El dorsal debe ser un número entero entre 0 y ${DORSAL_MAX}`, "error"); }
    const btn = $("jugGuardar");
    if (btn.disabled) return; // doble clic / Intro repetido
    btn.disabled = true;
    try {
      if (editando !== null) {
        await apiFetch(`/api/admin/jugadores/${editando}`, { method: "PUT", headers: JSON_HDR, body: JSON.stringify({ nombre, dorsal: dorsal.v }) });
        toast("Jugador actualizado");
      } else {
        const sel = [...seleccion.values()];
        await apiFetch("/api/admin/jugadores/fusionar", { method: "POST", headers: JSON_HDR,
          body: JSON.stringify({ club: sel[0].club, claves: sel.map((f) => f.clave), nombre, dorsal: dorsal.v }) });
        toast(sel.length > 1 ? "Fichas fusionadas" : "Ficha guardada");
      }
      limpiarSeleccion();
      await cargar(true);
    } catch (err) {
      toast("No se ha podido guardar: " + err.message, "error");
    } finally { btn.disabled = false; }
  }

  async function confirmar(msg) {
    if (window.EOF && window.EOF.confirmar) return !!(await window.EOF.confirmar(msg, {}));
    return window.confirm(msg);
  }

  function marcar(f, on, enfocar) {
    if (on) {
      const primera = seleccion.values().next().value;
      if (primera && primera.club !== f.club) {
        seleccion.clear();
        toast("Solo se pueden fusionar fichas del mismo club: he empezado una selección nueva", "info");
      }
      seleccion.set(clave(f), f);
    } else seleccion.delete(clave(f));
    if (editando !== null) { editando = null; camposTocados = false; } // se pasa de editar un corregido a la selección
    sincronizarFilas();
    mostrarEditor(enfocar);
  }

  // ---------- Eventos ----------
  function enlazar() {
    for (const id of ["jugComp", "jugGrupo", "jugClub"]) {
      $(id).addEventListener("change", () => {
        if (id === "jugComp") { $("jugGrupo").value = ""; $("jugClub").value = ""; $("jugClub").innerHTML = `<option value="">Todos los clubes</option>`; delete $("jugClub").dataset.firma; }
        if (id === "jugGrupo") { $("jugClub").value = ""; $("jugClub").innerHTML = `<option value="">Todos los clubes</option>`; delete $("jugClub").dataset.firma; }
        seleccion.clear(); editando = null; camposTocados = false; $("jugEditor").hidden = true;
        cargar();
      });
    }
    $("jugBuscar").addEventListener("input", () => { clearTimeout(temporizadorBuscar); temporizadorBuscar = setTimeout(() => cargar(), RETARDO_BUSCAR); });
    $("jugGuardar").addEventListener("click", guardar);
    $("jugCancelar").addEventListener("click", limpiarSeleccion);
    $("jugNombre").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); guardar(); } });
    $("jugDorsal").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); guardar(); } });
    $("jugNombre").addEventListener("input", () => { camposTocados = true; });
    $("jugDorsal").addEventListener("input", () => { camposTocados = true; });
    $("jugEditor").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); limpiarSeleccion(); } });

    $("jugLista").addEventListener("error", ocultarEscudoRoto, true);
    $("jugCorregidos").addEventListener("error", ocultarEscudoRoto, true);

    $("jugLista").addEventListener("click", (e) => {
      if (e.target.closest('[data-accion="reintentar"]')) { cargar(true); return; }
      const tr = e.target.closest("tr[data-i]");
      if (!tr) return;
      const f = filas[+tr.dataset.i];
      if (!f) return;
      if (e.target.closest('[data-accion="editar"]')) { seleccion.clear(); camposTocados = false; marcar(f, true, true); return; }
      if (e.target.matches('input[type="checkbox"]')) { marcar(f, e.target.checked); return; }
      if (e.target.closest("button, input, a")) return;
      // Pulsar en cualquier otra parte de la fila marca/desmarca.
      marcar(f, !seleccion.has(clave(f)));
    });

    $("jugCorregidos").addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-accion]");
      const caja = e.target.closest(".jug-corr");
      if (!btn || !caja || btn.disabled) return;
      const id = Number(caja.dataset.id);
      const j = corrPorId.get(id);
      if (!j) return;
      const accion = btn.dataset.accion;
      if (accion === "renombrar") {
        seleccion.clear(); editando = id; camposTocados = false;
        sincronizarFilas(); mostrarEditor(true);
        return;
      }
      if (accion === "deshacer" && !(await confirmar(`¿Deshacer la corrección de «${j.nombre}»? Sus fichas volverán a salir tal y como las calcula el sistema.`))) return;
      btn.disabled = true;
      try {
        if (accion === "ocultar") {
          await apiFetch(`/api/admin/jugadores/${id}`, { method: "PUT", headers: JSON_HDR, body: JSON.stringify({ oculto: !j.oculto }) });
          toast(j.oculto ? "Jugador visible de nuevo" : "Jugador oculto en la web");
        } else if (accion === "deshacer") {
          await apiFetch(`/api/admin/jugadores/${id}`, { method: "DELETE" });
          if (editando === id) limpiarSeleccion();
          toast("Corrección deshecha");
        } else if (accion === "separar") {
          await apiFetch(`/api/admin/jugadores/alias/${btn.dataset.alias}`, { method: "DELETE" });
          toast("Ficha separada");
        } else return;
        await cargar(true);
      } catch (err) {
        toast("No se ha podido completar: " + err.message, "error");
      } finally { btn.disabled = false; }
    });
  }

  window.EOFJugadores = {
    // Se llama cada vez que se abre la pestaña: si ya hay datos se ven al instante y se refrescan detrás.
    cargar() {
      if (!$("jugAdm")) return;
      if (!enlazado) { enlazar(); enlazado = true; }
      cargar(true);
    },
  };
})();
