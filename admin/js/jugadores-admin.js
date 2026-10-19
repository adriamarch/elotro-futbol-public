// ---------- Funcionalidades > Jugadores (solo administradores) ----------
// Corrección manual de las fichas de jugador que calcula el servidor a partir
// del minuto a minuto. Backend: /api/admin/jugadores (worker y worker-secondary).
//   GET  /api/admin/jugadores?competicion=&grupo=&club=&q=  -> fichas automáticas + corregidos
//   POST /api/admin/jugadores/fusionar {club, claves, nombre, dorsal}
//   PUT  /api/admin/jugadores/:id {nombre, dorsal, oculto}
//   DELETE /api/admin/jugadores/:id            (deshacer del todo)
//   DELETE /api/admin/jugadores/alias/:aliasId (separar una ficha)
// Depende de globales de admin.js: apiFetch(path, options), window.EOF.toast / confirmar.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m, t) => (window.EOF && window.EOF.toast ? window.EOF.toast(m, t || "success") : console.log(m));

  // Escudo del club (el panel vive en /admin/, así que las rutas relativas llevan "../").
  function escudo(club) {
    try {
      let u = getEscudoUrl(club);
      if (u && u.startsWith("img/")) u = "../" + u;
      return u ? `<img class="jug-escudo" src="${esc(u)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="jug-escudo"></span>`;
    } catch { return `<span class="jug-escudo"></span>`; }
  }
  const inicial = (t) => esc(String(t || "?").trim().charAt(0).toUpperCase() || "?");
  const icoVacio = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>`;

  let datos = null;            // última respuesta del servidor
  let seleccion = new Map();   // clave -> fila (todas del mismo club)
  let editando = null;         // id de jugador corregido que se edita (null = fusionar)
  let peticion = 0;
  let temporizadorBuscar = null;

  function params() {
    const p = new URLSearchParams({ competicion: $("jugComp").value });
    if ($("jugGrupo").value) p.set("grupo", $("jugGrupo").value);
    if ($("jugClub").value) p.set("club", $("jugClub").value);
    const q = $("jugBuscar").value.trim();
    if (q) p.set("q", q);
    return p.toString();
  }

  async function cargar() {
    const id = ++peticion;
    $("jugLista").innerHTML = `<div class="jug-esq" role="status" aria-label="Cargando"><span></span><span></span><span></span><span></span></div>`;
    try {
      const d = await apiFetch("/api/admin/jugadores?" + params());
      if (id !== peticion) return;
      datos = d;
      poblarFiltros(d);
      pintarStats();
      pintarLista();
      pintarCorregidos();
    } catch (err) {
      if (id !== peticion) return;
      $("jugLista").innerHTML = `<div class="jug-vacio jug-vacio-error">${icoVacio}<strong>No se ha podido cargar</strong><span>${esc(err.message)}</span><button type="button" class="jug-btn" data-accion="reintentar">Reintentar</button></div>`;
    }
  }

  function pintarStats() {
    const filas = datos.jugadores || [];
    const sinNombre = filas.filter((f) => f.sin_nombre && !f.jugador_id).length;
    const fundidas = filas.filter((f) => f.jugador_id).length;
    const corr = datos.corregidos || [];
    const ocultos = corr.filter((j) => j.oculto).length;
    const tarjeta = (cls, n, et, tip) => `<div class="jug-stat ${cls}" title="${esc(tip)}"><b>${n}</b><span>${et}</span></div>`;
    $("jugStats").innerHTML =
      tarjeta("azul", datos.total ?? filas.length, "Fichas", "Fichas automáticas con estos filtros")
      + tarjeta(sinNombre ? "ambar" : "verde", sinNombre, "Sin nombre", "Fichas que solo llevan el dorsal")
      + tarjeta("verde", fundidas, "Fundidas", "Fichas ya unidas a un jugador corregido")
      + tarjeta("violeta", corr.length, "Corregidos", "Jugadores corregidos a mano")
      + tarjeta("gris", ocultos, "Ocultos", "Jugadores ocultos en la web");
  }

  function poblarFiltros(d) {
    const g = $("jugGrupo");
    const grupos = (d.grupos || []).filter(Boolean).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    if (grupos.length) {
      const actual = g.value;
      g.innerHTML = `<option value="">Todos los grupos</option>` + grupos.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
      g.value = grupos.includes(actual) ? actual : "";
      g.hidden = false;
    } else { g.hidden = true; g.innerHTML = ""; }
    const c = $("jugClub");
    const actualC = c.value;
    // Con un club elegido, la respuesta solo trae los clubes de sus partidos: no se pisa el desplegable.
    if (!actualC) {
      c.innerHTML = `<option value="">Todos los clubes</option>` + (d.clubes || []).map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
    }
  }

  function pintarLista() {
    const filas = datos.jugadores || [];
    $("jugTotal").textContent = datos.total ? `(${datos.total}${datos.truncado ? ", se muestran 300: filtra por club" : ""})` : "";
    if (!filas.length) { $("jugLista").innerHTML = `<div class="jug-vacio">${icoVacio}<strong>No hay fichas con estos filtros</strong><span>Prueba con otro club o borra la búsqueda.</span></div>`; return; }
    const cuerpo = filas.map((f) => {
      const marcada = seleccion.has(f.clave) && seleccion.get(f.clave).club === f.club;
      const estado = f.jugador_id ? `<span class="jug-badge ok" title="Fundida en un jugador corregido">→ ${esc(f.corregido_como)}</span>`
        : f.sin_nombre ? `<span class="jug-badge">Sin nombre</span>` : "";
      const dorsal = f.dorsal !== null && f.dorsal !== undefined ? `<span class="jug-dorsal">${f.dorsal}</span>` : `<span class="jug-dorsal vacio">—</span>`;
      const cifra = (n) => `<td class="num"><span class="jug-cifra${Number(n) ? "" : " cero"}">${n}</span></td>`;
      return `<tr class="${marcada ? "sel" : ""}${f.sin_nombre && !f.jugador_id ? " sin-nombre" : ""}" data-clave="${esc(f.clave)}" data-club="${esc(f.club)}">
        <td class="sel-celda"><input type="checkbox" ${marcada ? "checked" : ""} aria-label="Seleccionar ${esc(f.nombre)}"></td>
        <td class="num">${dorsal}</td>
        <td class="jug-nombre-celda"><span class="jug-nombre">${esc(f.nombre)}</span>${estado}</td>
        <td><span class="jug-club">${escudo(f.club)}<span>${esc(f.club)}</span></span></td>
        ${cifra(f.goles)}${cifra(f.asistencias)}${cifra(f.tarjetas)}${cifra(f.partidos)}
        <td class="acc"><button type="button" class="jug-btn jug-btn-mini" data-accion="editar">Editar</button></td>
      </tr>`;
    }).join("");
    $("jugLista").innerHTML = `<div class="jug-tabla-wrap"><table class="jug-tabla">
      <thead><tr><th></th><th class="num">Dorsal</th><th>Ficha</th><th>Club</th><th class="num" title="Goles">G</th><th class="num" title="Asistencias">A</th><th class="num" title="Tarjetas">T</th><th class="num" title="Partidos con alineación">PJ</th><th></th></tr></thead>
      <tbody>${cuerpo}</tbody></table></div>`;
  }

  function pintarCorregidos() {
    const lista = datos.corregidos || [];
    $("jugCorregidosN").textContent = lista.length ? `(${lista.length})` : "";
    if (!lista.length) { $("jugCorregidos").innerHTML = `<div class="jug-vacio">${icoVacio}<strong>Todavía no has corregido a ningún jugador</strong><span>Cuando fusiones o renombres una ficha aparecerá aquí.</span></div>`; return; }
    $("jugCorregidos").innerHTML = lista.map((j) => `
      <div class="jug-corr ${j.oculto ? "oculto" : ""}" data-id="${j.id}">
        <span class="jug-avatar" aria-hidden="true">${inicial(j.nombre)}</span>
        <div class="jug-corr-id">
          <span class="jug-corr-nombre">${esc(j.nombre)}${j.dorsal !== null && j.dorsal !== undefined ? `<span class="jug-dorsal">${j.dorsal}</span>` : ""}${j.oculto ? `<span class="jug-badge oculto">Oculto</span>` : ""}</span>
          <span class="jug-corr-club jug-club">${escudo(j.club)}<span>${esc(j.club)}</span></span>
        </div>
        <div class="jug-corr-acc">
          <button type="button" class="jug-btn jug-btn-mini" data-accion="renombrar">Editar</button>
          <button type="button" class="jug-btn jug-btn-mini" data-accion="ocultar">${j.oculto ? "Mostrar" : "Ocultar"}</button>
          <button type="button" class="jug-btn jug-btn-mini jug-btn-peligro" data-accion="deshacer">Deshacer</button>
        </div>
        <div class="jug-corr-claves">${j.claves.map((c) => `<span class="jug-chip" title="Ficha automática fundida">${esc(c.clave)}<button type="button" data-accion="separar" data-alias="${c.alias_id}" aria-label="Separar ${esc(c.clave)}">✕</button></span>`).join("")}</div>
      </div>`).join("");
  }

  function mostrarEditor() {
    const ed = $("jugEditor");
    if (editando === null && !seleccion.size) { ed.hidden = true; return; }
    ed.hidden = false;
    if (editando !== null) {
      const j = (datos.corregidos || []).find((x) => x.id === editando);
      $("jugEditorTxt").innerHTML = `Editando al jugador corregido <strong>${esc(j ? j.nombre : "")}</strong>. El enlace de su ficha no cambia.`;
      $("jugNombre").value = j ? j.nombre : "";
      $("jugDorsal").value = j && j.dorsal !== null && j.dorsal !== undefined ? j.dorsal : "";
      $("jugGuardar").textContent = "Guardar cambios";
      return;
    }
    const filas = [...seleccion.values()];
    const club = filas[0].club;
    $("jugEditorTxt").innerHTML = filas.length === 1
      ? `Ficha seleccionada de <strong>${esc(club)}</strong>: ${esc(filas[0].nombre)}. Ponle el nombre correcto o el dorsal.`
      : `<strong>${filas.length} fichas</strong> de ${esc(club)} se fundirán en un solo jugador: ${filas.map((f) => esc(f.nombre)).join(", ")}.`;
    const mejor = filas.filter((f) => !f.sin_nombre).sort((a, b) => b.nombre.length - a.nombre.length)[0];
    const yaCorregida = filas.find((f) => f.corregido_como);
    $("jugNombre").value = yaCorregida ? yaCorregida.corregido_como : (mejor ? mejor.nombre : "");
    const conDorsal = filas.find((f) => f.dorsal !== null && f.dorsal !== undefined);
    $("jugDorsal").value = conDorsal ? conDorsal.dorsal : "";
    $("jugGuardar").textContent = filas.length === 1 ? "Guardar" : "Fusionar";
    $("jugNombre").focus();
  }

  function cerrarEditor() {
    editando = null;
    seleccion.clear();
    $("jugEditor").hidden = true;
    if (datos) pintarLista();
  }

  async function guardar() {
    const nombre = $("jugNombre").value.trim();
    const dorsal = $("jugDorsal").value.trim();
    if (nombre.length < 2) return toast("Escribe el nombre del jugador (mínimo 2 letras)", "error");
    const btn = $("jugGuardar");
    btn.disabled = true;
    try {
      if (editando !== null) {
        await apiFetch(`/api/admin/jugadores/${editando}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, dorsal: dorsal === "" ? null : Number(dorsal) }) });
        toast("Jugador actualizado");
      } else {
        const filas = [...seleccion.values()];
        await apiFetch("/api/admin/jugadores/fusionar", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ club: filas[0].club, claves: filas.map((f) => f.clave), nombre, dorsal: dorsal === "" ? null : Number(dorsal) }) });
        toast(filas.length > 1 ? "Fichas fusionadas" : "Ficha guardada");
      }
      editando = null; seleccion.clear(); $("jugEditor").hidden = true;
      await cargar();
    } catch (err) {
      toast("No se ha podido guardar: " + err.message, "error");
    } finally { btn.disabled = false; }
  }

  async function confirmar(msg) {
    if (window.EOF && window.EOF.confirmar) return !!(await window.EOF.confirmar(msg, {}));
    return window.confirm(msg);
  }

  function alternarFila(tr, marcar) {
    const clave = tr.dataset.clave, club = tr.dataset.club;
    const fila = (datos.jugadores || []).find((f) => f.clave === clave && f.club === club);
    if (!fila) return;
    if (marcar) {
      if (seleccion.size && [...seleccion.values()][0].club !== club) {
        seleccion.clear();
        toast("Solo se pueden fusionar fichas del mismo club: he empezado una selección nueva", "info");
      }
      seleccion.set(clave, fila);
    } else seleccion.delete(clave);
    editando = null;
    pintarLista();
    mostrarEditor();
  }

  function enlazar() {
    ["jugComp", "jugGrupo", "jugClub"].forEach((id) => $(id).addEventListener("change", () => {
      if (id === "jugComp") { $("jugGrupo").value = ""; $("jugClub").value = ""; $("jugClub").innerHTML = `<option value="">Todos los clubes</option>`; }
      if (id === "jugGrupo") { $("jugClub").value = ""; $("jugClub").innerHTML = `<option value="">Todos los clubes</option>`; }
      seleccion.clear(); editando = null; $("jugEditor").hidden = true;
      cargar();
    }));
    $("jugBuscar").addEventListener("input", () => { clearTimeout(temporizadorBuscar); temporizadorBuscar = setTimeout(cargar, 350); });
    $("jugGuardar").addEventListener("click", guardar);
    $("jugCancelar").addEventListener("click", cerrarEditor);
    $("jugNombre").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); guardar(); } });

    $("jugLista").addEventListener("click", (e) => {
      if (e.target.closest('[data-accion="reintentar"]')) { cargar(); return; }
      const tr = e.target.closest("tr[data-clave]");
      if (!tr) return;
      // Pulsar en cualquier parte de la fila (menos botones y la propia casilla) marca/desmarca.
      if (!e.target.closest("button, input, a")) {
        const caja = tr.querySelector('input[type="checkbox"]');
        if (caja) alternarFila(tr, !caja.checked);
        return;
      }
      if (e.target.closest('[data-accion="editar"]')) {
        seleccion.clear(); alternarFila(tr, true); return;
      }
      if (e.target.matches('input[type="checkbox"]')) alternarFila(tr, e.target.checked);
    });

    $("jugCorregidos").addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-accion]");
      const caja = e.target.closest(".jug-corr");
      if (!btn || !caja) return;
      const id = Number(caja.dataset.id);
      const j = (datos.corregidos || []).find((x) => x.id === id);
      try {
        if (btn.dataset.accion === "renombrar") { seleccion.clear(); editando = id; pintarLista(); mostrarEditor(); $("jugNombre").focus(); }
        else if (btn.dataset.accion === "ocultar") {
          await apiFetch(`/api/admin/jugadores/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oculto: !j.oculto }) });
          toast(j.oculto ? "Jugador visible de nuevo" : "Jugador oculto en la web"); await cargar();
        } else if (btn.dataset.accion === "deshacer") {
          if (!(await confirmar(`¿Deshacer la corrección de «${j.nombre}»? Sus fichas volverán a salir tal y como las calcula el sistema.`))) return;
          await apiFetch(`/api/admin/jugadores/${id}`, { method: "DELETE" });
          toast("Corrección deshecha"); await cargar();
        } else if (btn.dataset.accion === "separar") {
          await apiFetch(`/api/admin/jugadores/alias/${btn.dataset.alias}`, { method: "DELETE" });
          toast("Ficha separada"); await cargar();
        }
      } catch (err) { toast("No se ha podido completar: " + err.message, "error"); }
    });
  }

  let enlazado = false;
  window.EOFJugadores = {
    cargar() {
      if (!enlazado && $("jugAdm")) { enlazar(); enlazado = true; }
      if ($("jugAdm")) cargar();
    },
  };
})();
