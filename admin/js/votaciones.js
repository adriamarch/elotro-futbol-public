// ---------- Votaciones internas del equipo ----------
// Pestaña "Votaciones" del panel de redacción. Backend: rutas
// /api/votaciones* en worker/src/index.js (esquema en
// worker/migracion_votaciones_internas.sql).
//
// Depende de globales ya definidos por admin.js / ui-alertas.js:
//   apiFetch(path, options)  -> JSON o lanza Error con el mensaje del servidor
//   window.EOF.toast / window.EOF.confirmar
(function () {
  "use strict";

  const MAX_OPCIONES = 10;
  const MIN_OPCIONES = 2;

  let votaciones = [];
  let puedeCrear = false;
  let cargadoUnaVez = false;
  // Selección en curso por votación (aún sin enviar): { [id]: Set<opcionId> }.
  // Se conserva entre repintados para no perderla al refrescar la cuenta atrás.
  const seleccion = {};
  let enviando = false;
  let ultimaCarga = 0;

  const $ = (id) => document.getElementById(id);

  function esc(texto) {
    return String(texto == null ? "" : texto)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function toast(mensaje, tipo) {
    if (window.EOF && window.EOF.toast) window.EOF.toast(mensaje, tipo || "info");
  }

  const ICONO = {
    reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    candado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    ojoOculto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/></svg>',
    corona: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    multi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="m15 17.5 2 2 4-4"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    reabrir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    papelera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    quitar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    escudo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2.2 2.2L15.5 10"/></svg>',
    persona: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
    urna: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V8l3-5 4 4v4"/><path d="m9 16 2 2 4-4"/></svg>',
  };

  // ---------- Utilidades de presentación ----------

  function iniciales(nombre) {
    const partes = String(nombre || "?").trim().split(/\s+/).filter(Boolean);
    const letras = (partes[0] ? partes[0][0] : "?") + (partes[1] ? partes[1][0] : "");
    return letras.toUpperCase();
  }

  // Color estable por nombre para los avatares de quienes han votado.
  function colorAvatar(nombre) {
    let h = 0;
    const s = String(nombre || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return `hsl(${h} 55% 42%)`;
  }

  function tiempoRestante(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    if (!isFinite(ms)) return "";
    if (ms <= 0) return "Cierra en instantes";
    const min = Math.floor(ms / 60000);
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = min % 60;
    if (d >= 1) return `Cierra en ${d} d ${h} h`;
    if (h >= 1) return `Cierra en ${h} h ${m} min`;
    return `Cierra en ${Math.max(1, m)} min`;
  }

  function fechaCorta(iso) {
    if (!iso) return "";
    const d = new Date(String(iso).includes("T") ? iso : String(iso).replace(" ", "T") + "Z");
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  const TEXTO_VISIBILIDAD = {
    siempre: "Resultados visibles para todos",
    tras_votar: "Resultados al votar",
    al_cerrar: "Resultados al cerrar",
  };

  // ---------- Tarjeta de una votación ----------
  // opciones: { preview: true } pinta la tarjeta sin interacción (vista
  // previa del formulario de creación).

  function tarjetaHTML(v, { preview = false, bloqueo = false } = {}) {
    const abierta = !v.cerrada;
    const secreta = !!v.anonima;
    // En voto secreto el voto es definitivo: tras votar ya no se puede tocar.
    const puedeVotar = abierta && !preview && !(secreta && v.he_votado);
    // Si ya votó (voto nominal), se parte de su voto para que se vea marcado.
    const sel = seleccion[v.id] || new Set(v.mis_opciones || []);
    const mostrarBarras = v.ver_resultados;
    const tipo = v.multiple ? "checkbox" : "radio";

    const maxVotos = mostrarBarras ? Math.max(0, ...v.opciones.map((o) => o.votos || 0)) : 0;
    const base = mostrarBarras ? (v.total_votantes || 0) : 0;

    const opcionesHTML = v.opciones.map((o) => {
      const marcada = puedeVotar ? sel.has(o.id) : (v.mis_opciones || []).includes(o.id);
      const votos = mostrarBarras ? (o.votos || 0) : 0;
      const pct = base > 0 ? Math.round((votos / base) * 100) : 0;
      const lider = mostrarBarras && maxVotos > 0 && votos === maxVotos;

      const etiquetas = [];
      if (lider && v.cerrada) etiquetas.push(`<span class="vot-etiqueta vot-etiqueta-ganadora">${ICONO.corona}Ganadora</span>`);
      if (!puedeVotar && marcada) etiquetas.push(`<span class="vot-etiqueta vot-etiqueta-tuvoto">Tu voto</span>`);

      const cifras = mostrarBarras
        ? `<span class="vot-opcion-cifras"><strong>${pct}%</strong><small>${votos} ${votos === 1 ? "voto" : "votos"}</small></span>`
        : "";
      const pista = mostrarBarras
        ? `<span class="vot-pista"><span class="vot-pista-relleno" style="width:${pct}%"></span></span>`
        : "";
      const votantes = o.votantes && o.votantes.length
        ? `<span class="vot-votantes">${o.votantes.slice(0, 6).map((n) =>
            `<span class="vot-avatar" style="background:${colorAvatar(n)}" title="${esc(n)}">${esc(iniciales(n))}</span>`).join("")}${
            o.votantes.length > 6 ? `<span class="vot-avatar vot-avatar-mas">+${o.votantes.length - 6}</span>` : ""}</span>`
        : "";

      return `
        <button type="button" class="vot-opcion ${marcada ? "vot-opcion-marcada" : ""} ${lider ? "vot-opcion-lider" : ""} ${puedeVotar ? "" : "vot-opcion-fija"}"
                role="${tipo}" aria-checked="${marcada}" ${puedeVotar ? "" : "tabindex=\"-1\""}
                data-accion="elegir" data-votacion="${v.id}" data-opcion="${o.id}">
          <span class="vot-opcion-linea">
            ${puedeVotar ? `<span class="vot-indicador vot-indicador-${tipo}">${ICONO.check}</span>` : ""}
            <span class="vot-opcion-texto">${esc(o.texto)}${etiquetas.join("")}</span>
            ${cifras}
          </span>
          ${pista}
          ${votantes}
        </button>`;
    }).join("");

    // Estado + privacidad (+ pendiente). Máximo tres chips.
    let chipEstado;
    if (v.cerrada) chipEstado = `<span class="vot-chip vot-chip-cerrada">${ICONO.candado}Cerrada</span>`;
    else if (v.cierra_en) chipEstado = `<span class="vot-chip vot-chip-reloj">${ICONO.reloj}${esc(tiempoRestante(v.cierra_en))}</span>`;
    else chipEstado = `<span class="vot-chip vot-chip-abierta"><span class="vot-punto"></span>Abierta</span>`;

    const chips = [chipEstado];
    chips.push(secreta
      ? `<span class="vot-chip vot-chip-secreto">${ICONO.escudo}Voto secreto</span>`
      : `<span class="vot-chip vot-chip-nominal">${ICONO.persona}Voto nominal</span>`);
    if (v.obligatoria && abierta) chips.push(`<span class="vot-chip vot-chip-obligatoria">Obligatoria</span>`);
    if (!v.he_votado && abierta && !preview && !bloqueo) chips.push(`<span class="vot-chip vot-chip-pendiente">Pendiente de tu voto</span>`);

    // Aviso de privacidad en una línea (solo mientras se puede votar)
    const aviso = (abierta && !preview)
      ? (secreta
        ? `<div class="vot-privacidad vot-privacidad-secreta" role="note">${ICONO.escudo}<p><strong>Nadie sabrá qué votas</strong>, ni los administradores. Es definitivo.</p></div>`
        : `<div class="vot-privacidad" role="note">${ICONO.persona}<p><strong>Tu nombre se verá</strong> junto a tu opción. Puedes cambiar el voto mientras siga abierta.</p></div>`)
      : "";

    // Ayuda sobre cuántas opciones se pueden marcar
    const ayuda = puedeVotar
      ? `<p class="vot-pista-texto">${v.multiple ? "Elige todas las que quieras" : "Elige una opción"}</p>`
      : "";

    // Participación (siempre visible: no revela qué se ha votado)
    let participacion = "";
    if (v.total_votantes != null && v.equipo_total > 0) {
      const p = Math.min(100, Math.round((v.total_votantes / v.equipo_total) * 100));
      participacion += `
        <div class="vot-part" title="${v.total_votantes} de ${v.equipo_total} personas del equipo">
          <div class="vot-part-texto"><strong>${v.total_votantes}</strong> de ${v.equipo_total} han votado<span class="vot-part-pct">${p}%</span></div>
          <div class="vot-part-pista"><span style="width:${p}%"></span></div>
        </div>`;
    }
    if (!v.ver_resultados && !preview) {
      let motivo;
      if (secreta) motivo = "La urna se abre al cerrar la votación";
      else if (v.resultados_visibles === "al_cerrar") motivo = "Los resultados se verán al cerrar la votación";
      else motivo = "Vota para ver los resultados";
      participacion += `<div class="vot-oculto">${ICONO.candado}<span>${motivo}</span></div>`;
    }

    // Acciones
    let acciones = "";
    if (puedeVotar) {
      const hayCambio = sel.size > 0 && !mismaSeleccion(sel, v.mis_opciones || []);
      acciones += `<button type="button" class="vot-btn vot-btn-primario" data-accion="votar" data-votacion="${v.id}" ${hayCambio ? "" : "disabled"}>${v.he_votado ? "Cambiar mi voto" : (secreta ? "Emitir voto secreto" : "Votar")}</button>`;
    } else if (v.he_votado && !preview) {
      acciones += `<span class="vot-tu-voto">${ICONO.check}${secreta ? "Voto secreto registrado" : "Has votado"}</span>`;
    } else if (!preview) {
      acciones += `<span class="vot-tu-voto vot-tu-voto-no">No has votado</span>`;
    }
    if (puedeCrear && !preview) {
      acciones += `<span class="vot-acciones-admin">${
        v.cerrada_a_mano
          ? `<button type="button" class="vot-icono-btn" data-accion="reabrir" data-votacion="${v.id}" title="Reabrir">${ICONO.reabrir}</button>`
          : (!v.cerrada ? `<button type="button" class="vot-icono-btn" data-accion="cerrar" data-votacion="${v.id}" title="Cerrar votación">${ICONO.cerrar}</button>` : "")
      }<button type="button" class="vot-icono-btn vot-icono-peligro" data-accion="borrar" data-votacion="${v.id}" title="Borrar">${ICONO.papelera}</button></span>`;
    }

    const meta = [];
    if (v.creado_por_nombre) meta.push(`Creada por ${esc(v.creado_por_nombre)}`);
    if (v.created_at && !preview) meta.push(esc(fechaCorta(v.created_at)));
    if (!secreta) meta.push(TEXTO_VISIBILIDAD[v.resultados_visibles] || "");

    return `
      <article class="vot-tarjeta ${v.cerrada ? "vot-tarjeta-cerrada" : ""} ${secreta ? "vot-tarjeta-secreta" : ""}" data-id="${v.id}">
        <div class="vot-tarjeta-cab">
          <div class="vot-chips">${chips.join("")}</div>
          <h3 class="vot-pregunta">${esc(v.titulo) || '<span class="vot-placeholder">Tu pregunta aparecerá aquí</span>'}</h3>
          ${v.descripcion ? `<p class="vot-descripcion">${esc(v.descripcion)}</p>` : ""}
        </div>
        ${aviso}
        <div class="vot-opciones-zona">
          ${ayuda}
          <div class="vot-opciones" role="${v.multiple ? "group" : "radiogroup"}">${opcionesHTML}</div>
        </div>
        ${participacion}
        <div class="vot-tarjeta-pie">
          <div class="vot-acciones">${acciones}</div>
          <div class="vot-meta">${meta.filter(Boolean).join(" · ")}</div>
        </div>
      </article>`;
  }

  function mismaSeleccion(set, array) {
    if (set.size !== array.length) return false;
    return array.every((id) => set.has(id));
  }

  // ---------- Listado ----------

  function estadoVacio(titulo, texto) {
    return `<div class="vot-vacio">
      <div class="vot-vacio-icono">${ICONO.urna}</div>
      <h4>${esc(titulo)}</h4>
      <p>${esc(texto)}</p>
      ${puedeCrear ? '<button type="button" class="vot-btn vot-btn-primario" data-accion="ir-nueva">+ Nueva votación</button>' : ""}
    </div>`;
  }

  function pintar() {
    const activas = votaciones.filter((v) => !v.cerrada);
    const cerradas = votaciones.filter((v) => v.cerrada);

    const contA = $("votListaActivas");
    const contC = $("votListaCerradas");
    if (contA) {
      contA.innerHTML = activas.length
        ? activas.map((v) => tarjetaHTML(v)).join("")
        : estadoVacio("No hay votaciones abiertas", puedeCrear ? "Crea la primera para consultar al equipo." : "Cuando se abra una nueva, la verás aquí.");
    }
    if (contC) {
      contC.innerHTML = cerradas.length
        ? cerradas.map((v) => tarjetaHTML(v)).join("")
        : '<div class="vot-vacio"><div class="vot-vacio-icono">' + ICONO.candado + '</div><h4>Todavía no hay votaciones cerradas</h4><p>Aquí quedará el historial con sus resultados.</p></div>';
    }

    const pendientes = activas.filter((v) => !v.he_votado).length;
    const badge = $("badgeVotPendientes");
    if (badge) {
      badge.textContent = pendientes;
      badge.style.display = pendientes > 0 ? "" : "none";
    }
    const btnNueva = $("subtabVotNueva");
    if (btnNueva) btnNueva.style.display = puedeCrear ? "" : "none";
    pintarBloqueo();
  }

  async function cargar({ silencioso = false } = {}) {
    const cont = $("votListaActivas");
    if (!silencioso && cont && !cargadoUnaVez) {
      cont.innerHTML = '<div class="vot-skeleton"></div><div class="vot-skeleton"></div>';
    }
    try {
      const r = await apiFetch("/api/votaciones");
      if (!r || !Array.isArray(r.votaciones)) {
        // Respuesta vacía por sesión aún sin confirmar: no se pisa lo que hubiera.
        if (!cargadoUnaVez && !silencioso && cont) cont.innerHTML = estadoVacio("Sin datos todavía", "Pulsa de nuevo en Votaciones en unos segundos.");
        return;
      }
      votaciones = r.votaciones;
      puedeCrear = !!r.puede_crear;
      cargadoUnaVez = true;
      ultimaCarga = Date.now();
      // Limpia selecciones de votaciones que ya no existen o se han cerrado.
      Object.keys(seleccion).forEach((id) => {
        const v = votaciones.find((x) => String(x.id) === id);
        if (!v || v.cerrada) delete seleccion[id];
      });
      pintar();
    } catch (err) {
      if (silencioso) return;
      if (cont) {
        cont.innerHTML = `<div class="vot-vacio vot-vacio-error"><h4>No se han podido cargar las votaciones</h4><p>${esc(err.message || "Inténtalo de nuevo en unos segundos.")}</p><button type="button" class="vot-btn vot-btn-primario" data-accion="reintentar">Reintentar</button></div>`;
      }
    }
  }

  // ---------- Acciones sobre tarjetas (delegación de eventos) ----------

  function elegirOpcion(votacionId, opcionId) {
    const v = votaciones.find((x) => x.id === votacionId);
    if (!v || v.cerrada) return;
    let sel = seleccion[votacionId];
    if (!sel) {
      // Si ya había votado, se parte de su voto para poder modificarlo.
      sel = seleccion[votacionId] = new Set(v.mis_opciones);
    }
    if (v.multiple) {
      if (sel.has(opcionId)) sel.delete(opcionId); else sel.add(opcionId);
    } else {
      sel.clear();
      sel.add(opcionId);
    }
    pintar();
  }

  async function votar(votacionId) {
    if (enviando) return;
    const sel = seleccion[votacionId];
    if (!sel || sel.size === 0) return;
    const v = votaciones.find((x) => x.id === votacionId);
    if (v && v.anonima) {
      const ok = await (window.EOF && window.EOF.confirmar
        ? window.EOF.confirmar("Vas a emitir un voto secreto. Nadie podrá saber qué has votado y, una vez enviado, no se puede cambiar. ¿Confirmas tu voto?", { textoConfirmar: "Emitir voto secreto" })
        : Promise.resolve(window.confirm("Vas a emitir un voto secreto y no se podrá cambiar. ¿Confirmas?")));
      if (!ok) return;
    }
    enviando = true;
    try {
      await apiFetch(`/api/votaciones/${votacionId}/votar`, { method: "POST", body: JSON.stringify({ opciones: [...sel] }) });
      delete seleccion[votacionId];
      toast(v && v.anonima ? "Voto secreto registrado" : "¡Voto registrado!", "exito");
      await cargar({ silencioso: true });
    } catch (err) {
      toast(err.message || "No se ha podido registrar el voto", "error");
      await cargar({ silencioso: true });
    } finally {
      enviando = false;
    }
  }

  async function accionAdmin(accion, votacionId) {
    const v = votaciones.find((x) => x.id === votacionId);
    if (!v) return;
    const confirmar = (msg, op) => (window.EOF && window.EOF.confirmar ? window.EOF.confirmar(msg, op) : Promise.resolve(window.confirm(msg)));
    try {
      if (accion === "cerrar") {
        if (!(await confirmar(`¿Cerrar la votación "${v.titulo}"? Nadie podrá votar ya y los resultados quedarán a la vista.`, { textoConfirmar: "Cerrar votación" }))) return;
        await apiFetch(`/api/votaciones/${votacionId}/cerrar`, { method: "POST" });
        toast("Votación cerrada", "exito");
      } else if (accion === "reabrir") {
        if (!(await confirmar(`¿Reabrir la votación "${v.titulo}"?`, { textoConfirmar: "Reabrir" }))) return;
        await apiFetch(`/api/votaciones/${votacionId}/reabrir`, { method: "POST" });
        toast("Votación reabierta", "exito");
      } else if (accion === "borrar") {
        if (!(await confirmar(`¿Borrar "${v.titulo}" con todos sus votos? No se puede deshacer.`, { textoConfirmar: "Borrar", peligroso: true }))) return;
        await apiFetch(`/api/votaciones/${votacionId}`, { method: "DELETE" });
        toast("Votación borrada", "exito");
      }
      await cargar({ silencioso: true });
    } catch (err) {
      toast(err.message || "No se ha podido completar la acción", "error");
    }
  }

  function irASubtab(nombre) {
    const btn = document.querySelector(`#subtabsVotaciones button[data-subtab="${nombre}"]`);
    if (btn) btn.click();
  }

  const panel = $("panel-votaciones");
  if (!panel) return;

  function manejarClick(e, contenedor) {
    const el = e.target.closest("[data-accion]");
    if (!el || !contenedor.contains(el)) return;
    const accion = el.dataset.accion;
    const id = el.dataset.votacion ? parseInt(el.dataset.votacion, 10) : null;
    if (accion === "elegir") {
      if (el.closest("#votPreview")) return;
      elegirOpcion(id, parseInt(el.dataset.opcion, 10));
    } else if (accion === "votar") votar(id);
    else if (accion === "cerrar" || accion === "reabrir" || accion === "borrar") accionAdmin(accion, id);
    else if (accion === "ir-nueva") irASubtab("votNueva");
    else if (accion === "reintentar") { if (bloqueoEl && bloqueoEl.contains(el)) arranque(0); else cargar(); }
    else if (accion === "salir" && typeof window.logout === "function") window.logout();
  }

  panel.addEventListener("click", (e) => manejarClick(e, panel));

  // ---------- Formulario de creación ----------

  const TEXTOS_EJEMPLO = ["Opción A", "Opción B"];

  function opcionesDelFormulario() {
    return [...document.querySelectorAll("#votOpcionesLista .vot-opcion-input")].map((i) => i.value);
  }

  function filaOpcionHTML(valor, indice) {
    return `<div class="vot-opcion-fila">
      <span class="vot-opcion-num">${indice + 1}</span>
      <input type="text" class="vot-opcion-input" maxlength="150" placeholder="Opción ${indice + 1}" value="${esc(valor)}">
      <button type="button" class="vot-icono-btn vot-icono-peligro vot-quitar" title="Quitar opción" aria-label="Quitar opción">${ICONO.quitar}</button>
    </div>`;
  }

  function pintarOpcionesEditor(valores) {
    const cont = $("votOpcionesLista");
    cont.innerHTML = valores.map((v, i) => filaOpcionHTML(v, i)).join("");
    actualizarEstadoEditor();
  }

  function actualizarEstadoEditor() {
    const filas = document.querySelectorAll("#votOpcionesLista .vot-opcion-fila");
    filas.forEach((f, i) => {
      f.querySelector(".vot-opcion-num").textContent = i + 1;
      f.querySelector(".vot-opcion-input").placeholder = `Opción ${i + 1}`;
      f.querySelector(".vot-quitar").disabled = filas.length <= MIN_OPCIONES;
    });
    $("votAddOpcion").disabled = filas.length >= MAX_OPCIONES;
    pintarPreview();
  }

  function leerFormulario() {
    return {
      titulo: $("votTitulo").value.trim(),
      descripcion: $("votDescripcion").value.trim(),
      opciones: opcionesDelFormulario().map((t) => t.trim()),
      multiple: $("votMultiple").checked,
      anonima: $("votAnonima").checked,
      obligatoria: $("votObligatoria").checked,
      resultados_visibles: (document.querySelector('input[name="votVis"]:checked') || {}).value || "tras_votar",
      cierra_en: $("votCierraEn").value ? new Date($("votCierraEn").value).toISOString() : null,
    };
  }

  function pintarPreview() {
    const cont = $("votPreview");
    if (!cont) return;
    const f = leerFormulario();
    const textos = f.opciones.length ? f.opciones : TEXTOS_EJEMPLO;
    const falso = {
      id: 0,
      titulo: f.titulo,
      descripcion: f.descripcion,
      multiple: f.multiple,
      anonima: f.anonima,
      obligatoria: f.obligatoria,
      resultados_visibles: f.anonima ? "al_cerrar" : f.resultados_visibles,
      cierra_en: f.cierra_en,
      cerrada: false,
      cerrada_a_mano: false,
      creado_por_nombre: (typeof USER !== "undefined" && USER && USER.nombre) || "",
      created_at: null,
      he_votado: false,
      mis_opciones: [],
      ver_resultados: false,
      total_votantes: null,
      equipo_total: 0,
      opciones: textos.map((t, i) => ({ id: i + 1, texto: t || `Opción ${i + 1}`, votos: null, votantes: null })),
    };
    cont.innerHTML = tarjetaHTML(falso, { preview: true });
  }

  // Una votación secreta solo enseña resultados al cerrar: se fuerza esa
  // opción y se bloquean las otras (el servidor lo impone igualmente).
  function sincronizarPrivacidad() {
    const secreta = $("votAnonima").checked;
    const radios = document.querySelectorAll('input[name="votVis"]');
    radios.forEach((r) => {
      if (secreta) r.checked = r.value === "al_cerrar";
      r.disabled = secreta && r.value !== "al_cerrar";
    });
    const ayuda = $("votAyudaVis");
    if (ayuda) {
      ayuda.textContent = secreta
        ? "En voto secreto los resultados se abren para todos a la vez al cerrar; si no, el contador delataría a quien acaba de votar."
        : "Los administradores ven siempre los resultados, salvo en «Al cerrar».";
    }
    const aviso = $("votAvisoSecreto");
    if (aviso) aviso.hidden = !secreta;
  }

  function limpiarFormulario() {
    $("votTitulo").value = "";
    $("votDescripcion").value = "";
    $("votMultiple").checked = false;
    $("votAnonima").checked = false;
    $("votObligatoria").checked = false;
    $("votCierraEn").value = "";
    const radio = document.querySelector('input[name="votVis"][value="tras_votar"]');
    if (radio) radio.checked = true;
    sincronizarPrivacidad();
    pintarOpcionesEditor(["", ""]);
  }

  async function publicar() {
    if (enviando) return;
    const f = leerFormulario();
    const opciones = f.opciones.filter(Boolean);
    if (!f.titulo) return toast("Escribe la pregunta de la votación", "error");
    if (opciones.length < MIN_OPCIONES) return toast("Hacen falta al menos 2 opciones con texto", "error");
    const btn = $("votPublicar");
    enviando = true;
    btn.disabled = true;
    btn.textContent = "Publicando...";
    try {
      await apiFetch("/api/votaciones", { method: "POST", body: JSON.stringify({ ...f, opciones }) });
      toast(f.obligatoria ? "Votación obligatoria publicada: el equipo no podrá usar el panel hasta votar" : "Votación publicada", "exito");
      limpiarFormulario();
      irASubtab("votActivas");
      await cargar({ silencioso: true });
    } catch (err) {
      toast(err.message || "No se ha podido publicar la votación", "error");
    } finally {
      enviando = false;
      btn.disabled = false;
      btn.textContent = "Publicar votación";
    }
  }

  $("votOpcionesLista").addEventListener("input", pintarPreview);
  $("votOpcionesLista").addEventListener("click", (e) => {
    const quitar = e.target.closest(".vot-quitar");
    if (!quitar || quitar.disabled) return;
    quitar.closest(".vot-opcion-fila").remove();
    actualizarEstadoEditor();
  });
  $("votAddOpcion").addEventListener("click", () => {
    const filas = document.querySelectorAll("#votOpcionesLista .vot-opcion-fila");
    if (filas.length >= MAX_OPCIONES) return;
    $("votOpcionesLista").insertAdjacentHTML("beforeend", filaOpcionHTML("", filas.length));
    actualizarEstadoEditor();
    const inputs = document.querySelectorAll("#votOpcionesLista .vot-opcion-input");
    inputs[inputs.length - 1].focus();
  });
  ["votTitulo", "votDescripcion", "votMultiple", "votAnonima", "votObligatoria", "votCierraEn"].forEach((id) => {
    $(id).addEventListener("input", pintarPreview);
    $(id).addEventListener("change", pintarPreview);
  });
  document.querySelectorAll('input[name="votVis"]').forEach((r) => r.addEventListener("change", pintarPreview));
  $("votAnonima").addEventListener("change", sincronizarPrivacidad);
  $("votPublicar").addEventListener("click", publicar);
  $("votLimpiar").addEventListener("click", limpiarFormulario);

  // ---------- Votaciones obligatorias (bloquean el panel) ----------
  // Una votación marcada como "obligatoria" (columna obligatoria, ver
  // worker/migracion_votaciones_obligatorias.sql) tapa el panel con una
  // pantalla a pantalla completa en cuanto se abre, y no se puede hacer
  // nada más hasta votar en todas las que estén abiertas.
  //
  //  - Para que salga "nada más abrir", se guarda en localStorage que la
  //    última vez había votaciones pendientes: en la siguiente apertura la
  //    pantalla se pinta al instante (en estado "cargando") mientras llega
  //    la respuesta del servidor, que decide si se queda o se quita.
  //  - El fondo se marca como `inert` (no se puede clicar ni tabular).
  //  - Los admins ven en la tarjeta los botones de cerrar/borrar, por si
  //    una votación obligatoria se ha creado por error.
  //  - OJO: es un bloqueo de la interfaz, no del servidor; la API no
  //    rechaza peticiones de quien no ha votado.
  const CLAVE_PENDIENTE = "eof_vot_pend";
  let bloqueoEl = null;
  let bloqueoConDatos = false;
  let fondoInerte = [];

  function identidadUsuario() {
    try { return String((typeof USER !== "undefined" && USER && (USER.id != null ? USER.id : USER.email)) || ""); } catch { return ""; }
  }

  function marcarPendiente(hay) {
    try {
      if (hay) localStorage.setItem(CLAVE_PENDIENTE, identidadUsuario());
      else localStorage.removeItem(CLAVE_PENDIENTE);
    } catch {}
  }

  function habiaPendiente() {
    try {
      const guardado = localStorage.getItem(CLAVE_PENDIENTE);
      return guardado !== null && guardado === identidadUsuario();
    } catch { return false; }
  }

  function obligatoriasPendientes() {
    return votaciones.filter((v) => !v.cerrada && v.obligatoria && !v.he_votado);
  }

  // Marca como inert todo lo que cuelga de <body> salvo la propia pantalla,
  // los scripts y los avisos/confirmaciones de ui-alertas.js. Se repite en
  // cada repintado para atrapar elementos añadidos después (p. ej. el
  // tutorial).
  function bloquearFondo() {
    document.documentElement.classList.add("vot-bloqueado");
    [...document.body.children].forEach((el) => {
      if (el === bloqueoEl || el.inert) return;
      if (el.matches("script, style, link, .eof-toast-contenedor, .eof-modal-overlay")) return;
      el.inert = true;
      fondoInerte.push(el);
    });
  }

  function liberarFondo() {
    fondoInerte.forEach((el) => { el.inert = false; });
    fondoInerte = [];
    document.documentElement.classList.remove("vot-bloqueado");
  }

  function asegurarBloqueo() {
    if (bloqueoEl && bloqueoEl.isConnected) return bloqueoEl;
    bloqueoEl = document.createElement("div");
    bloqueoEl.id = "votBloqueo";
    bloqueoEl.className = "vot-bloq";
    bloqueoEl.setAttribute("role", "dialog");
    bloqueoEl.setAttribute("aria-modal", "true");
    bloqueoEl.setAttribute("aria-labelledby", "votBloqTitulo");
    bloqueoEl.innerHTML = `
      <div class="vot-bloq-caja" tabindex="-1">
        <div class="vot-bloq-cab">
          <span class="vot-bloq-icono">${ICONO.urna}</span>
          <h2 id="votBloqTitulo"></h2>
          <p id="votBloqTexto"></p>
        </div>
        <div class="vot-bloq-lista" id="votBloqLista"></div>
        <div class="vot-bloq-pie"><button type="button" class="vot-bloq-salir" data-accion="salir">Cerrar sesión</button></div>
      </div>`;
    bloqueoEl.addEventListener("click", (e) => manejarClick(e, bloqueoEl));
    // Escape no cierra nada: la pantalla solo se quita votando.
    bloqueoEl.addEventListener("keydown", (e) => { if (e.key === "Escape") e.stopPropagation(); });
    document.body.appendChild(bloqueoEl);
    return bloqueoEl;
  }

  function ponerFoco(el) {
    const caja = el.querySelector(".vot-bloq-caja");
    if (caja && !el.contains(document.activeElement)) caja.focus({ preventScroll: true });
  }

  // Estado inicial instantáneo mientras llega la respuesta del servidor.
  function mostrarBloqueoCargando() {
    const el = asegurarBloqueo();
    el.querySelector("#votBloqTitulo").textContent = "Tienes una votación obligatoria";
    el.querySelector("#votBloqTexto").textContent = "Comprobando las votaciones del equipo…";
    el.querySelector("#votBloqLista").innerHTML = '<div class="vot-skeleton"></div>';
    bloquearFondo();
    ponerFoco(el);
  }

  function mostrarErrorBloqueo() {
    if (!bloqueoEl || !bloqueoEl.isConnected || bloqueoConDatos) return;
    bloqueoEl.querySelector("#votBloqTexto").textContent = "No se han podido cargar las votaciones.";
    bloqueoEl.querySelector("#votBloqLista").innerHTML =
      '<div class="vot-bloq-estado"><p>Comprueba tu conexión e inténtalo de nuevo.</p><button type="button" class="vot-btn vot-btn-primario" data-accion="reintentar">Reintentar</button></div>';
  }

  function ocultarBloqueo(conAviso) {
    const estabaVisible = !!(bloqueoEl && bloqueoEl.isConnected);
    if (estabaVisible) { bloqueoEl.remove(); bloqueoEl = null; }
    liberarFondo();
    if (estabaVisible && conAviso && bloqueoConDatos) toast("Gracias por votar. Ya puedes seguir con el panel.", "exito");
    bloqueoConDatos = false;
  }

  function pintarBloqueo() {
    if (!cargadoUnaVez) return;
    const pendientes = obligatoriasPendientes();
    marcarPendiente(pendientes.length > 0);
    if (!pendientes.length) { ocultarBloqueo(true); return; }

    const el = asegurarBloqueo();
    const n = pendientes.length;
    el.querySelector("#votBloqTitulo").textContent = n === 1 ? "Votación obligatoria" : `${n} votaciones obligatorias`;
    el.querySelector("#votBloqTexto").textContent = (n === 1
      ? "Tienes que votar para poder seguir usando el panel."
      : "Tienes que votar en todas para poder seguir usando el panel.")
      + (puedeCrear ? " Como administrador puedes cerrar o borrar una votación si se creó por error." : "");

    const caja = el.querySelector(".vot-bloq-caja");
    const scroll = el.scrollTop;
    el.querySelector("#votBloqLista").innerHTML = pendientes.map((v) => tarjetaHTML(v, { bloqueo: true })).join("");
    el.scrollTop = scroll;
    bloqueoConDatos = true;
    bloquearFondo();
    if (caja) ponerFoco(el);
  }

  // ---------- Navegación y arranque ----------

  $("tabVotaciones").addEventListener("click", () => cargar());
  document.querySelectorAll("#subtabsVotaciones button").forEach((b) => {
    b.addEventListener("click", () => {
      if (b.dataset.subtab === "votActivas" || b.dataset.subtab === "votCerradas") cargar({ silencioso: cargadoUnaVez });
      if (b.dataset.subtab === "votNueva") pintarPreview();
    });
  });

  // Refresca la cuenta atrás de las votaciones con fecha límite mientras
  // se está viendo la pestaña (sin pedir nada a la API: solo repinta).
  setInterval(() => {
    if (!cargadoUnaVez || !panel.classList.contains("activo")) return;
    if (votaciones.some((v) => !v.cerrada && v.cierra_en)) pintar();
  }, 60000);

  limpiarFormulario();

  // Carga inicial INMEDIATA (antes esperaba 1,8 s): sirve para el contador
  // de "pendientes de votar" de la pestaña y, sobre todo, para que la
  // pantalla de votación obligatoria salga nada más abrir el panel. Si la
  // sesión aún no está confirmada, apiFetch devuelve {} y se reintenta.
  if (habiaPendiente()) mostrarBloqueoCargando();
  const ESPERAS_REINTENTO = [700, 1500, 3000, 6000];
  async function arranque(intento) {
    await cargar({ silencioso: true });
    if (cargadoUnaVez) return;
    if (intento < ESPERAS_REINTENTO.length) setTimeout(() => arranque(intento + 1), ESPERAS_REINTENTO[intento]);
    else mostrarErrorBloqueo();
  }
  arranque(0);

  // Una votación obligatoria nueva (o una que vence) tiene que aparecer sin
  // recargar: cada minuto mientras la pantalla está puesta y cada 2 min el
  // resto del tiempo, además de al volver a la pestaña del navegador.
  function refrescarSiToca(minimoMs) {
    if (document.visibilityState !== "visible" || !cargadoUnaVez || enviando) return;
    if (Date.now() - ultimaCarga >= minimoMs) cargar({ silencioso: true });
  }
  setInterval(() => refrescarSiToca(bloqueoEl ? 55000 : 115000), 60000);
  document.addEventListener("visibilitychange", () => refrescarSiToca(30000));
})();
