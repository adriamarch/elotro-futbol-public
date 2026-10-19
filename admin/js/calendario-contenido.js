// Calendario de contenido (Funcionalidades > Información > Horario).
// Rejilla semanal interactiva: días en columnas, franjas en filas.
//  - Chips de la leyenda: filtran por tipo de contenido (se pueden combinar).
//  - Cabecera de día: selecciona el día y muestra su agenda.
//  - Tarea: muestra el detalle, QUIÉN LA HACE y en qué otros días toca ese tipo.
//  - Marca "Ahora" en la franja actual del día de hoy (hora de Madrid).
//  - Administradores: botón "Editar calendario" para añadir, cambiar, mover o
//    borrar tareas y asignarles personas. Nada se guarda hasta pulsar
//    "Guardar cambios".
//
// Backend: GET/PUT /api/calendario-contenido (worker y worker-secondary), guardado en
// `settings` bajo la clave 'calendario_contenido'. Si nunca se ha guardado se
// muestra el calendario de DEFECTO de este archivo. Al guardar, el worker
// deriva de él las reglas de "fuera de calendario" (noticias, previas, crónicas).
//
// Depende de globales de admin.js / ui-alertas.js:
//   apiFetch(path, options) -> JSON o lanza Error con el mensaje del servidor
//   window.EOF.toast / window.EOF.confirmar
(function () {
  "use strict";

  const DIAS = [
    ["lunes", "Lunes"], ["martes", "Martes"], ["miercoles", "Miércoles"],
    ["jueves", "Jueves"], ["viernes", "Viernes"], ["sabado", "Sábado"], ["domingo", "Domingo"],
  ];
  const FRANJAS = ["08:00 - 10:30", "10:30 - 12:30", "12:30 - 15:00", "15:00 - 18:45", "18:45 - 22:00"];
  const LIMITES = [8 * 60, 10.5 * 60, 12.5 * 60, 15 * 60, 18.75 * 60, 22 * 60]; // minutos
  const TIPOS = {
    clasificacion: "Clasificación", noticias: "Noticias", matchday: "Match day", resultados: "Resultados",
    previas: "Previas", cronicas: "Crónicas", data: "Posts data", reel: "Reel", disc: "Com. disc.",
  };
  const MAX_POR_CELDA = 6;
  const NOMBRE = Object.fromEntries(DIAS);

  const nuevoId = () => "b" + Math.random().toString(36).slice(2, 9) + (Date.now() % 1296).toString(36);
  const b = (tipo, texto, nota) => ({ id: nuevoId(), tipo, texto, nota: nota || "", personas: [] });

  // Calendario de DEFECTO (el de siempre). Se usa mientras ningún admin lo haya guardado.
  function calendarioPorDefecto() {
    return {
      dias: {
        lunes: [
          [b("noticias", "Noticias mañana", "Liga Hypermotion"), b("noticias", "Noticias mañana", "Primera Federación")],
          [b("cronicas", "Crónicas")],
          [],
          [b("clasificacion", "Clasificación", "si no hay partido ese día"), b("noticias", "Noticias tarde", "si hay"), b("resultados", "Resultados", "en caso de haber")],
          [b("data", "Gol más rápido", "si no hay partido ese día")],
        ],
        martes: [
          [b("noticias", "Noticias mañana", "Liga Hypermotion"), b("noticias", "Noticias mañana", "Primera Federación")],
          [b("cronicas", "Crónicas", "en caso de partido el día anterior")],
          [],
          [b("clasificacion", "Clasificación", "si hubo partido el día anterior"), b("reel", "Reel", "TikTok - Instagram")],
          [b("data", "XI ideal de la jornada")],
        ],
        miercoles: [
          [],
          [b("noticias", "Noticias mañana", "Segunda Federación")],
          [],
          [b("disc", "Comité disciplinario")],
          [],
        ],
        jueves: [
          [],
          [],
          [b("data", "Datos partidazos")],
          [b("previas", "Previas", "partidos viernes")],
          [b("reel", "Reel", "TikTok - Instagram")],
        ],
        viernes: [
          [b("previas", "Previas carrusel")],
          [b("previas", "Previas", "sábado")],
          [b("matchday", "Matchdays")],
          [b("previas", "Previas", "partidos domingo")],
          [b("resultados", "Resultados")],
        ],
        sabado: [
          [b("noticias", "Noticias mañana", "Segunda Federación")],
          [b("matchday", "Matchdays")],
          [],
          [b("cronicas", "Crónicas")],
          [b("noticias", "Noticias randoms", "o sobre los partidos")],
        ],
        domingo: [
          [],
          [b("matchday", "Matchdays")],
          [b("cronicas", "Crónicas")],
          [b("noticias", "Noticias randoms", "o sobre los partidos")],
          [b("reel", "Reel", "TikTok - Instagram")],
        ],
      },
      todo: {
        lunes: [], martes: [], miercoles: [], jueves: [], viernes: [],
        sabado: [b("resultados", "Cubrir resultados", "a lo largo del día")],
        domingo: [b("resultados", "Cubrir resultados", "a lo largo del día")],
      },
    };
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clonar = (x) => JSON.parse(JSON.stringify(x));

  // Garantiza la forma {dias:{día:[5 franjas]}, todo:{día:[]}} con bloques completos.
  function normalizar(d) {
    const out = { dias: {}, todo: {} };
    DIAS.forEach(([id]) => {
      const fr = d && d.dias && Array.isArray(d.dias[id]) ? d.dias[id] : [];
      out.dias[id] = FRANJAS.map((_, f) => (Array.isArray(fr[f]) ? fr[f] : []).map(limpiarBloque).filter(Boolean));
      out.todo[id] = (d && d.todo && Array.isArray(d.todo[id]) ? d.todo[id] : []).map(limpiarBloque).filter(Boolean);
    });
    return out;
  }
  function limpiarBloque(x) {
    if (!x || !TIPOS[x.tipo]) return null;
    return {
      id: typeof x.id === "string" && x.id ? x.id : nuevoId(),
      tipo: x.tipo,
      texto: String(x.texto || "").slice(0, 60),
      nota: String(x.nota || "").slice(0, 80),
      personas: Array.isArray(x.personas) ? x.personas.map((p) => String(p || "").trim()).filter(Boolean) : [],
    };
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
  function iniciales(nombre) {
    const p = String(nombre || "").trim().split(/\s+/).filter(Boolean);
    if (!p.length) return "?";
    return (p[0][0] + (p.length > 1 ? p[1][0] : "")).toUpperCase();
  }

  function ahoraMadrid() {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const g = (t) => (p.find((x) => x.type === t) || {}).value;
    const dia = { Mon: "lunes", Tue: "martes", Wed: "miercoles", Thu: "jueves", Fri: "viernes", Sat: "sabado", Sun: "domingo" }[g("weekday")];
    const min = (parseInt(g("hour"), 10) % 24) * 60 + parseInt(g("minute"), 10);
    let franja = -1;
    for (let i = 0; i < FRANJAS.length; i++) if (min >= LIMITES[i] && min < LIMITES[i + 1]) franja = i;
    return { dia, franja };
  }

  // sel: { dia, f: número de franja | "todo", i }
  const estado = {
    cal: normalizar(calendarioPorDefecto()),
    filtros: new Set(), dia: null, sel: null,
    editando: false, sucio: false, guardando: false,
    cargado: false, cargando: false, personalizado: false,
    snapshot: null, autores: null, error: "",
  };
  estado.snapshot = JSON.stringify(estado.cal);
  let cont = null;
  let ahora = ahoraMadrid();

  const celdaDe = (dia, f) => (f === "todo" ? estado.cal.todo[dia] : estado.cal.dias[dia][f]);
  const bloqueDe = (s) => (s ? (celdaDe(s.dia, s.f) || [])[s.i] || null : null);
  const horaDe = (f) => (f === "todo" ? "Todo el día" : FRANJAS[f]);
  const mismaSel = (s, dia, f, i) => !!s && s.dia === dia && String(s.f) === String(f) && String(s.i) === String(i);

  // ---------- HTML ----------
  function avataresHTML(personas) {
    if (!personas.length) return "";
    const vis = personas.slice(0, 3).map((p) => `<span class="cc-av" title="${esc(p)}">${esc(iniciales(p))}</span>`).join("");
    const mas = personas.length > 3 ? `<span class="cc-av cc-av-mas">+${personas.length - 3}</span>` : "";
    return `<span class="cc-av-fila">${vis}${mas}</span>`;
  }

  function bloqueHTML(x, dia, f, i) {
    return `<button type="button" class="cc-bloque cc-t-${x.tipo}" data-tipo="${x.tipo}" data-dia="${dia}" data-f="${f}" data-i="${i}"><span class="cc-txt">${esc(x.texto)}</span>${x.nota ? `<span class="cc-nota">${esc(x.nota)}</span>` : ""}${avataresHTML(x.personas)}</button>`;
  }
  const botonAnadir = (dia, f) => (estado.editando ? `<button type="button" class="cc-add" data-add-dia="${dia}" data-add-f="${f}" aria-label="Añadir tarea el ${esc(NOMBRE[dia])}, ${esc(horaDe(f))}" title="Añadir tarea">+</button>` : "");

  function celdaBloques(dia, f) {
    return celdaDe(dia, f).map((x, i) => bloqueHTML(x, dia, f, i)).join("");
  }

  function rejillaHTML() {
    let grid = '<div class="cc-grid">';
    grid += '<div class="cc-corner"></div>';
    DIAS.forEach(([id, n]) => {
      grid += `<button type="button" class="cc-dia${id === ahora.dia ? " cc-hoy" : ""}" data-dia-btn="${id}" aria-pressed="false">${n}${id === ahora.dia ? "<small>Hoy</small>" : ""}</button>`;
    });
    FRANJAS.forEach((fr, f) => {
      grid += `<div class="cc-franja">${fr}</div>`;
      DIAS.forEach(([id]) => {
        const items = celdaDe(id, f);
        const esAhora = id === ahora.dia && f === ahora.franja;
        grid += `<div class="cc-celda${items.length ? "" : " cc-vacia"}${esAhora ? " cc-ahora" : ""}" data-col="${id}">${esAhora ? '<span class="cc-pill-ahora"><i></i>Ahora</span>' : ""}${celdaBloques(id, f)}${items.length < MAX_POR_CELDA ? botonAnadir(id, f) : ""}</div>`;
      });
    });
    grid += '<div class="cc-franja cc-franja-dia">Todo el día</div>';
    DIAS.forEach(([id]) => {
      const items = estado.cal.todo[id];
      if (items.length || estado.editando) {
        grid += `<div class="cc-celda cc-todo${items.length ? "" : " cc-vacia"}" data-col="${id}">${celdaBloques(id, "todo")}${items.length < MAX_POR_CELDA ? botonAnadir(id, "todo") : ""}</div>`;
      } else {
        grid += `<div class="cc-celda cc-hueco" data-col="${id}"></div>`;
      }
    });
    grid += "</div>";

    let lista = '<div class="cc-lista">';
    DIAS.forEach(([id, n]) => {
      let filas = "";
      FRANJAS.forEach((fr, f) => {
        const items = celdaDe(id, f);
        if (items.length || estado.editando) {
          const esAhora = id === ahora.dia && f === ahora.franja;
          filas += `<div class="cc-fila${esAhora ? " cc-ahora" : ""}"><span class="cc-hora">${fr}${esAhora ? '<em class="cc-pill-ahora"><i></i>Ahora</em>' : ""}</span><div class="cc-fila-items">${celdaBloques(id, f)}${items.length < MAX_POR_CELDA ? botonAnadir(id, f) : ""}</div></div>`;
        }
      });
      const todo = estado.cal.todo[id];
      if (todo.length || estado.editando) filas += `<div class="cc-fila"><span class="cc-hora">Todo el día</span><div class="cc-fila-items">${celdaBloques(id, "todo")}${todo.length < MAX_POR_CELDA ? botonAnadir(id, "todo") : ""}</div></div>`;
      lista += `<section class="cc-card${id === ahora.dia ? " cc-hoy-card" : ""}" data-col="${id}"><h4><button type="button" data-dia-btn="${id}" aria-pressed="false">${n}${id === ahora.dia ? '<span class="cc-badge">Hoy</span>' : ""}</button></h4>${filas || '<p class="cc-libre">Sin contenido fijo</p>'}</section>`;
    });
    lista += "</div>";
    return `<div class="cc-scroll">${grid}</div>${lista}`;
  }

  function construir() {
    const chips = Object.keys(TIPOS).map((k) => `<button type="button" class="cc-chip cc-t-${k}" data-filtro="${k}" aria-pressed="false"><i></i>${esc(TIPOS[k])}</button>`).join("");
    cont.innerHTML = `
      <div class="cc-barra">
        <div class="cc-leyenda" role="group" aria-label="Filtrar por tipo de contenido">${chips}</div>
        <button type="button" class="cc-reset" hidden>Quitar filtros</button>
        <button type="button" class="cc-btn-editar" data-act="editar" hidden></button>
      </div>
      <div class="cc-editbar" hidden></div>
      <div class="cc-detalle" aria-live="polite"></div>
      <div class="cc-rej"></div>`;
    pintarRejilla();
  }

  function pintarRejilla() {
    const rej = cont.querySelector(".cc-rej");
    if (rej) rej.innerHTML = rejillaHTML();
  }

  function agendaDia(dia) {
    const filas = [];
    FRANJAS.forEach((fr, f) => {
      estado.cal.dias[dia][f].forEach((x) => filas.push({ hora: fr, x, ahora: dia === ahora.dia && f === ahora.franja }));
    });
    estado.cal.todo[dia].forEach((x) => filas.push({ hora: "Todo el día", x, ahora: false }));
    return filas;
  }

  function personasHTML(personas) {
    return personas.map((p) => `<span class="cc-persona"><span class="cc-av">${esc(iniciales(p))}</span>${esc(p)}</span>`).join("");
  }

  // ---------- Detalle (vista normal) ----------
  function detalleVistaHTML(s, x) {
    const dias = DIAS.filter(([id]) => estado.cal.dias[id].some((fr) => fr.some((y) => y.tipo === x.tipo)) || estado.cal.todo[id].some((y) => y.tipo === x.tipo));
    const quien = x.personas.length
      ? `<span class="cc-quien-lista">${personasHTML(x.personas)}</span>`
      : `<span class="cc-quien-vacio">Aún no hay nadie asignado${esAdmin() ? " · pulsa «Editar calendario» para asignar personas" : ""}</span>`;
    return `
      <span class="cc-det-punto"></span>
      <span class="cc-det-main"><b>${esc(x.texto)}</b>${x.nota ? ` <em>${esc(x.nota)}</em>` : ""}</span>
      <span class="cc-det-meta">${esc(NOMBRE[s.dia])} · ${horaDe(s.f)}</span>
      <span class="cc-det-dias">${dias.map(([id, n]) => `<button type="button" data-dia-btn="${id}" class="cc-mini${id === s.dia ? " cc-mini-on" : ""}">${n.slice(0, 3)}</button>`).join("")}</span>
      <button type="button" class="cc-cerrar" aria-label="Cerrar detalle">×</button>
      <div class="cc-det-quien"><span class="cc-quien-tit"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14c2.6 0 4.5 1.7 4.5 4.2"/></svg>Quién lo hace</span>${quien}</div>`;
  }

  // ---------- Detalle (modo edición) ----------
  function detalleEdicionHTML(s, x) {
    const optsTipo = Object.keys(TIPOS).map((k) => `<option value="${k}"${k === x.tipo ? " selected" : ""}>${esc(TIPOS[k])}</option>`).join("");
    const optsDia = DIAS.map(([id, n]) => `<option value="${id}"${id === s.dia ? " selected" : ""}>${n}</option>`).join("");
    const optsFranja = FRANJAS.map((fr, f) => `<option value="${f}"${String(s.f) === String(f) ? " selected" : ""}>${fr}</option>`).join("") + `<option value="todo"${s.f === "todo" ? " selected" : ""}>Todo el día</option>`;
    const chips = x.personas.map((p, k) => `<span class="cc-persona cc-persona-ed"><span class="cc-av">${esc(iniciales(p))}</span>${esc(p)}<button type="button" class="cc-persona-x" data-quitar-persona="${k}" aria-label="Quitar a ${esc(p)}">×</button></span>`).join("");
    const sugerencias = opcionesAutoresHTML();
    return `
      <div class="cc-ed-cab"><b>Editando tarea</b><button type="button" class="cc-cerrar" aria-label="Cerrar edición">×</button></div>
      <div class="cc-ed-grid">
        <label class="cc-ed-campo cc-ed-ancho"><span>Nombre de la tarea</span><input type="text" data-campo="texto" maxlength="60" value="${esc(x.texto)}" autocomplete="off"></label>
        <label class="cc-ed-campo cc-ed-ancho"><span>Nota <small>(opcional)</small></span><input type="text" data-campo="nota" maxlength="80" value="${esc(x.nota)}" placeholder="Ej: si hay partido ese día" autocomplete="off"></label>
        <label class="cc-ed-campo"><span>Tipo de contenido</span><select data-campo="tipo">${optsTipo}</select></label>
        <label class="cc-ed-campo"><span>Día</span><select data-campo="dia">${optsDia}</select></label>
        <label class="cc-ed-campo"><span>Franja</span><select data-campo="franja">${optsFranja}</select></label>
        <div class="cc-ed-campo cc-ed-ancho"><span>Personas que hacen esta tarea</span>
          <div class="cc-personas-ed">${chips}<input type="text" class="cc-persona-input" data-persona-input list="ccSugerencias" maxlength="60" placeholder="${x.personas.length ? "Añadir otra persona…" : "Escribe un nombre y pulsa Intro"}" autocomplete="off"><datalist id="ccSugerencias">${sugerencias}</datalist></div>
        </div>
      </div>
      <div class="cc-ed-pie"><button type="button" class="cc-btn cc-btn-peligro" data-act="borrar">Eliminar tarea</button><button type="button" class="cc-btn" data-act="hecho">Listo</button></div>`;
  }

  function pintarDetalle() {
    const det = cont.querySelector(".cc-detalle");
    const s = estado.sel;
    const x = bloqueDe(s);
    if (s && x) {
      if (estado.editando) {
        det.className = `cc-detalle cc-det-edit cc-t-${x.tipo}`;
        det.innerHTML = detalleEdicionHTML(s, x);
      } else {
        det.className = `cc-detalle cc-det-sel cc-t-${x.tipo}`;
        det.innerHTML = detalleVistaHTML(s, x);
      }
      return;
    }
    const dia = estado.dia || ahora.dia;
    const esHoy = dia === ahora.dia;
    const filas = agendaDia(dia);
    det.className = "cc-detalle cc-det-dia";
    det.innerHTML = `
      <span class="cc-det-etiqueta">${esHoy ? "Hoy" : esc(NOMBRE[dia])}${esHoy ? `<i>${esc(NOMBRE[dia])}</i>` : ""}</span>
      ${filas.length
        ? `<div class="cc-agenda">${filas.map((r) => `<span class="cc-ag cc-t-${r.x.tipo}${r.ahora ? " cc-ag-ahora" : ""}"><small>${r.hora === "Todo el día" ? "Todo el día" : r.hora.slice(0, 5)}</small>${esc(r.x.texto)}</span>`).join("")}</div>`
        : '<span class="cc-det-meta">Sin contenido fijo</span>'}`;
  }

  function pintarBarraEdicion() {
    const be = cont.querySelector(".cc-btn-editar");
    if (be) {
      be.hidden = !esAdmin();
      be.textContent = estado.editando ? "Salir de la edición" : "Editar calendario";
      be.classList.toggle("cc-on", estado.editando);
    }
    const bar = cont.querySelector(".cc-editbar");
    if (!bar) return;
    if (!estado.editando) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = `
      <span class="cc-ed-aviso">Modo edición: pulsa una tarea para cambiarla o el <b>+</b> de una franja para añadir otra.</span>
      <span class="cc-ed-sucio" ${estado.sucio ? "" : "hidden"}>Cambios sin guardar</span>
      <span class="cc-ed-acciones">
        <button type="button" class="cc-btn" data-act="restablecer"${estado.guardando ? " disabled" : ""}>Valores originales</button>
        <button type="button" class="cc-btn" data-act="descartar"${estado.sucio && !estado.guardando ? "" : " disabled"}>Descartar</button>
        <button type="button" class="cc-btn cc-btn-primario" data-act="guardar"${estado.sucio && !estado.guardando ? "" : " disabled"}>${estado.guardando ? "Guardando…" : "Guardar cambios"}</button>
      </span>`;
  }

  // ---------- Estado visual (filtros, seleccionados…) ----------
  function aplicar(sinDetalle) {
    const hay = estado.filtros.size > 0;
    cont.querySelectorAll(".cc-bloque").forEach((el) => {
      const ok = !hay || estado.filtros.has(el.dataset.tipo);
      el.classList.toggle("cc-apagado", !ok);
      el.classList.toggle("cc-elegido", mismaSel(estado.sel, el.dataset.dia, el.dataset.f, el.dataset.i));
    });
    cont.querySelectorAll("[data-filtro]").forEach((el) => {
      const on = estado.filtros.has(el.dataset.filtro);
      el.classList.toggle("cc-on", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
    cont.querySelectorAll("[data-dia-btn]").forEach((el) => {
      const on = estado.dia === el.dataset.diaBtn;
      el.classList.toggle("cc-on", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
    cont.querySelectorAll("[data-col]").forEach((el) => {
      el.classList.toggle("cc-col-apagada", !!estado.dia && el.dataset.col !== estado.dia);
    });
    const reset = cont.querySelector(".cc-reset");
    if (reset) reset.hidden = !(hay || estado.dia || estado.sel);
    cont.classList.toggle("cc-editando", estado.editando);
    pintarBarraEdicion();
    if (!sinDetalle) pintarDetalle();
  }
  function todo() { pintarRejilla(); aplicar(); }

  // ---------- Operaciones de edición ----------
  function marcarSucio() {
    estado.sucio = true;
    pintarBarraEdicion();
  }

  function anadir(dia, f) {
    const celda = celdaDe(dia, f);
    if (celda.length >= MAX_POR_CELDA) { toast(`Máximo ${MAX_POR_CELDA} tareas por franja.`, "error"); return; }
    const unico = estado.filtros.size === 1 ? [...estado.filtros][0] : "noticias";
    celda.push({ id: nuevoId(), tipo: unico, texto: "Nueva tarea", nota: "", personas: [] });
    estado.sel = { dia, f, i: celda.length - 1 };
    estado.dia = dia;
    marcarSucio();
    todo();
    const inp = cont.querySelector('[data-campo="texto"]');
    if (inp) { inp.focus(); inp.select(); }
  }

  function borrar() {
    const s = estado.sel;
    if (!s) return;
    celdaDe(s.dia, s.f).splice(s.i, 1);
    estado.sel = null;
    marcarSucio();
    todo();
  }

  function mover(nuevoDia, nuevaF) {
    const s = estado.sel;
    const x = bloqueDe(s);
    if (!x) return;
    const destino = celdaDe(nuevoDia, nuevaF);
    const mismo = nuevoDia === s.dia && String(nuevaF) === String(s.f);
    if (mismo) return;
    if (destino.length >= MAX_POR_CELDA) {
      toast(`Esa franja ya tiene ${MAX_POR_CELDA} tareas.`, "error");
      todo();
      return;
    }
    celdaDe(s.dia, s.f).splice(s.i, 1);
    destino.push(x);
    estado.sel = { dia: nuevoDia, f: nuevaF, i: destino.length - 1 };
    estado.dia = nuevoDia;
    marcarSucio();
    todo();
  }

  function anadirPersona(valor) {
    const x = bloqueDe(estado.sel);
    const nombre = String(valor || "").replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!x || !nombre) return false;
    if (x.personas.some((p) => p.toLowerCase() === nombre.toLowerCase())) return true;
    if (x.personas.length >= 12) { toast("Máximo 12 personas por tarea.", "error"); return false; }
    x.personas.push(nombre);
    marcarSucio();
    pintarRejilla();
    aplicar();
    const inp = cont.querySelector("[data-persona-input]");
    if (inp) inp.focus();
    return true;
  }

  function quitarPersona(k) {
    const x = bloqueDe(estado.sel);
    if (!x) return;
    x.personas.splice(k, 1);
    marcarSucio();
    pintarRejilla();
    aplicar();
  }

  async function alternarEdicion() {
    if (estado.editando) {
      if (estado.sucio) {
        const ok = await confirmar("Tienes cambios sin guardar. Si sales del modo edición se perderán.", { textoConfirmar: "Salir sin guardar", peligroso: true });
        if (!ok) return;
        descartarSilencioso();
      }
      estado.editando = false;
    } else {
      estado.editando = true;
      cargarAutores();
    }
    estado.sel = null;
    todo();
  }

  function descartarSilencioso() {
    try { estado.cal = normalizar(JSON.parse(estado.snapshot)); } catch { /* se mantiene */ }
    estado.sucio = false;
    if (!bloqueDe(estado.sel)) estado.sel = null;
  }
  async function descartar() {
    if (estado.sucio && !(await confirmar("Se perderán los cambios que no hayas guardado. ¿Descartarlos?", { textoConfirmar: "Descartar", peligroso: true }))) return;
    descartarSilencioso();
    todo();
  }
  async function restablecer() {
    if (!(await confirmar("Se cargará el calendario original (sin personas asignadas) para que lo revises. No se guarda hasta que pulses «Guardar cambios».", { textoConfirmar: "Cargar original" }))) return;
    estado.cal = normalizar(calendarioPorDefecto());
    estado.sel = null;
    marcarSucio();
    todo();
  }

  // ---------- Carga y guardado ----------
  async function cargar(forzar) {
    if (typeof apiFetch !== "function") return;
    if (estado.cargando) return;
    if (estado.cargado && !forzar) return;
    if (estado.sucio) return; // no pisar cambios sin guardar
    estado.cargando = true;
    try {
      const d = await apiFetch("/api/calendario-contenido");
      if (d && d.personalizado && d.dias) {
        estado.cal = normalizar(d);
        estado.personalizado = true;
      } else {
        estado.cal = normalizar(calendarioPorDefecto());
        estado.personalizado = false;
      }
      estado.snapshot = JSON.stringify(estado.cal);
      estado.cargado = true;
      if (!bloqueDe(estado.sel)) estado.sel = null;
      if (cont) todo();
    } catch (err) {
      estado.error = (err && err.message) || "";
      // Sin conexión o sin sesión: se queda el calendario de defecto (solo lectura efectiva).
    } finally {
      estado.cargando = false;
    }
  }

  // Sugerencias de personas: el valor que se guarda es solo el nombre, y el
  // equipo sale como etiqueta secundaria en el desplegable ("Aimar — Real Unión").
  function opcionesAutoresHTML() {
    return (estado.autores || []).map((a) => `<option value="${esc(a.nombre)}"${a.equipo ? ` label="${esc(a.nombre + " — " + a.equipo)}"` : ""}>${a.equipo ? esc(a.equipo) : ""}</option>`).join("");
  }

  async function cargarAutores() {
    if (estado.autores || typeof apiFetch !== "function") return;
    try {
      const d = await apiFetch("/api/autores");
      const lista = Array.isArray(d) ? d : (d && (d.autores || d.users)) || [];
      estado.autores = lista.filter((a) => a && a.nombre).map((a) => ({
        nombre: a.nombre,
        equipo: (Array.isArray(a.equipo) ? a.equipo : (a.equipo ? [a.equipo] : [])).join(" / "),
      }));
      const dl = cont && cont.querySelector("#ccSugerencias");
      if (dl) dl.innerHTML = opcionesAutoresHTML();
    } catch { estado.autores = []; }
  }

  async function guardar() {
    if (estado.guardando) return;
    const vacia = Object.values(estado.cal.dias).every((fr) => fr.every((c) => !c.length)) && Object.values(estado.cal.todo).every((c) => !c.length);
    if (vacia && !(await confirmar("El calendario está vacío: ninguna noticia, previa o crónica se podrá compartir en redes. ¿Guardar así?", { textoConfirmar: "Guardar vacío", peligroso: true }))) return;
    const sinNombre = DIAS.some(([id]) => [...estado.cal.dias[id], estado.cal.todo[id]].some((c) => c.some((x) => !String(x.texto).trim())));
    if (sinNombre) { toast("Todas las tareas necesitan un nombre.", "error"); return; }
    estado.guardando = true;
    pintarBarraEdicion();
    try {
      const d = await apiFetch("/api/calendario-contenido", {
        method: "PUT",
        body: JSON.stringify({ dias: estado.cal.dias, todo: estado.cal.todo }),
      });
      estado.cal = normalizar(d);
      estado.snapshot = JSON.stringify(estado.cal);
      estado.sucio = false;
      estado.personalizado = true;
      if (!bloqueDe(estado.sel)) estado.sel = null;
      toast("Calendario guardado.", "success");
    } catch (err) {
      toast("No se ha podido guardar: " + ((err && err.message) || "error"), "error", 6000);
    } finally {
      estado.guardando = false;
      todo();
    }
  }

  // ---------- Eventos ----------
  function alClick(e) {
    const chip = e.target.closest("[data-filtro]");
    if (chip) {
      const k = chip.dataset.filtro;
      if (estado.filtros.has(k)) estado.filtros.delete(k); else estado.filtros.add(k);
      return aplicar();
    }
    const act = e.target.closest("[data-act]");
    if (act) {
      const a = act.dataset.act;
      if (a === "editar") return alternarEdicion();
      if (a === "guardar") return guardar();
      if (a === "descartar") return descartar();
      if (a === "restablecer") return restablecer();
      if (a === "borrar") return borrar();
      if (a === "hecho") { estado.sel = null; return todo(); }
    }
    const add = e.target.closest("[data-add-dia]");
    if (add) return anadir(add.dataset.addDia, add.dataset.addF === "todo" ? "todo" : +add.dataset.addF);
    const qp = e.target.closest("[data-quitar-persona]");
    if (qp) return quitarPersona(+qp.dataset.quitarPersona);
    const dbtn = e.target.closest("[data-dia-btn]");
    if (dbtn) {
      const id = dbtn.dataset.diaBtn;
      estado.dia = estado.dia === id && !estado.sel ? null : id;
      estado.sel = null;
      return aplicar();
    }
    const bl = e.target.closest(".cc-bloque");
    if (bl) {
      const f = bl.dataset.f === "todo" ? "todo" : +bl.dataset.f;
      const mismo = mismaSel(estado.sel, bl.dataset.dia, f, bl.dataset.i);
      estado.sel = mismo ? null : { dia: bl.dataset.dia, f, i: +bl.dataset.i };
      estado.dia = mismo ? estado.dia : bl.dataset.dia;
      aplicar();
      if (!mismo) cont.querySelector(".cc-detalle").scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    if (e.target.closest(".cc-cerrar")) { estado.sel = null; return aplicar(); }
    if (e.target.closest(".cc-reset")) { estado.filtros.clear(); estado.dia = null; estado.sel = null; return aplicar(); }
  }

  function alEscribir(e) {
    const campo = e.target.dataset && e.target.dataset.campo;
    if (!campo || !estado.editando) return;
    const x = bloqueDe(estado.sel);
    if (!x) return;
    if (campo === "texto" || campo === "nota") {
      x[campo] = e.target.value;
      marcarSucio();
      pintarRejilla();
      aplicar(true); // sin repintar el detalle: no se pierde el foco del campo
    }
  }

  function alCambiar(e) {
    const t = e.target;
    if (t.matches && t.matches("[data-persona-input]")) {
      if (anadirPersona(t.value)) t.value = "";
      return;
    }
    const campo = t.dataset && t.dataset.campo;
    if (!campo || !estado.editando) return;
    const x = bloqueDe(estado.sel);
    if (!x) return;
    if (campo === "tipo") {
      x.tipo = t.value;
      marcarSucio();
      return todo();
    }
    if (campo === "dia") return mover(t.value, estado.sel.f);
    if (campo === "franja") return mover(estado.sel.dia, t.value === "todo" ? "todo" : +t.value);
  }

  function alTeclear(e) {
    const t = e.target;
    if (t.matches && t.matches("[data-persona-input]")) {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        if (anadirPersona(t.value)) t.value = "";
      } else if (e.key === "Backspace" && !t.value) {
        const x = bloqueDe(estado.sel);
        if (x && x.personas.length) quitarPersona(x.personas.length - 1);
      }
    } else if (e.key === "Escape" && estado.sel && !(t.matches && t.matches("select"))) {
      estado.sel = null;
      aplicar();
    }
  }

  function pintar() {
    cont = document.getElementById("calContenido");
    if (!cont) return;
    ahora = ahoraMadrid();
    if (!cont.dataset.listo) {
      cont.dataset.listo = "1";
      cont.addEventListener("click", alClick);
      cont.addEventListener("input", alEscribir);
      cont.addEventListener("change", alCambiar);
      cont.addEventListener("keydown", alTeclear);
      window.addEventListener("beforeunload", (e) => { if (estado.sucio) { e.preventDefault(); e.returnValue = ""; } });
      // Al abrir la pestaña Información se vuelve a consultar el calendario guardado.
      document.querySelectorAll('[data-subtab="informacion"]').forEach((btn) => {
        btn.addEventListener("click", () => { ahora = ahoraMadrid(); cargar(true); });
      });
    }
    construir();
    aplicar();
    cargar(false);
  }

  window.pintarCalendarioContenido = pintar;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pintar);
  else pintar();
})();
