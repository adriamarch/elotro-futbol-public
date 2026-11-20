// ---------- Funcionalidades > Eliminatorias (solo Responsables) ----------
// Editor de los cuadros públicos de eliminatorias y playoffs de ascenso
// (página pública /eliminatorias). Backend: GET/PUT /api/eliminatorias
// (worker y worker-secondary), guardado en `settings` bajo la clave 'eliminatorias'.
// Cada cuadro tiene rondas y cada ronda cruces; un cruce lleva 1 o 2 partidos
// (goles de A y de B), penaltis opcionales y un ganador opcional «forzado».
// Cada partido puede vincularse a un partido real de Resultados (resultado_id): entonces
// el marcador, la fecha y los penaltis salen de ahí y los campos quedan bloqueados.
// Los equipos vacíos se rellenan solos con los ganadores de la ronda anterior (la web
// los muestra; aquí solo se enseñan como pista y no se guardan).
// Depende de globales de admin.js / clubs.js / ui-alertas.js:
//   apiFetch(path, options) -> JSON o lanza Error con el mensaje del servidor
//   getClubsForCategoria, window.EOF.toast / window.EOF.confirmar
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const toast = (msg, tipo, ms) => { try { window.EOF.toast(msg, tipo || "info", ms || 3500); } catch { /* sin toast */ } };
  async function confirmar(msg, opciones) {
    if (window.EOF && window.EOF.confirmar) return !!(await window.EOF.confirmar(msg, opciones || {}));
    return window.confirm(msg);
  }
  const rnd = () => Math.random().toString(36).slice(2, 8);

  const COMPETICIONES = [
    ["hypermotion", "LaLiga Hypermotion"], ["primera_federacion", "Primera Federación"],
    ["segunda_federacion", "Segunda Federación"], ["tercera_federacion", "Tercera Federación"],
    ["copa_del_rey", "Copa del Rey"], ["copa_federacion", "Copa Federación"],
  ];
  const PLANTILLAS = {
    "4": { etiqueta: "4 equipos: semifinales + final", rondas: [["Semifinales", 2], ["Final", 1]] },
    "8": { etiqueta: "8 equipos: cuartos + semifinales + final", rondas: [["Cuartos de final", 4], ["Semifinales", 2], ["Final", 1]] },
    "2": { etiqueta: "2 equipos: solo la final", rondas: [["Final", 1]] },
    "0": { etiqueta: "Vacío (lo monto yo)", rondas: [] },
  };
  const FORMATOS = {
    ida_vuelta: "Todas las rondas a ida y vuelta",
    unico: "Todas las rondas a partido único",
    final_unica: "Ida y vuelta, salvo la final a partido único",
  };

  const estado = { cuadros: [], sel: "", cargado: false, cargando: false, sucio: false, guardando: false, creando: false, error: "", vinc: null };
  const TXT_ESTADO = { finalizado: "Finalizado", en_juego: "En juego", programado: "Programado", sin_cubrir: "Finalizado sin cubrir" };

  function nuevoCruce(nPartidos) {
    return {
      id: "x" + rnd(), a: "", b: "",
      partidos: Array.from({ length: nPartidos }, () => ({ a: null, b: null, fecha: "", resultado_id: null })),
      penaltis: { a: null, b: null }, ganador: "",
    };
  }
  function nuevaRonda(nombre, nCruces, nPartidos) {
    return { id: "r" + rnd(), nombre, cruces: Array.from({ length: nCruces }, () => nuevoCruce(nPartidos)) };
  }
  function crearCuadro(f) {
    const def = PLANTILLAS[f.plantilla] || PLANTILLAS["0"];
    const rondas = def.rondas.map(([nombre, n], i, arr) => {
      const esFinal = i === arr.length - 1;
      const partidos = f.formato === "unico" ? 1 : (f.formato === "final_unica" && esFinal ? 1 : 2);
      return nuevaRonda(nombre, n, partidos);
    });
    const cuadro = {
      id: "c" + rnd(), nombre: f.nombre, competicion: f.competicion, grupo: f.grupo, temporada: f.temporada,
      tipo: f.tipo, visible: false, clasif: "", nota: "", rondas,
    };
    // LaLiga Hypermotion: el playoff lo juegan del 3.º al 6.º (3.º–6.º y 4.º–5.º), así que se rellena solo.
    if (f.competicion === "hypermotion" && f.tipo === "playoff_ascenso" && f.plantilla === "4" && rondas[0] && rondas[0].cruces.length === 2) {
      cuadro.clasif = "final";
      rondas[0].cruces[0].sa = { g: "", p: 3 }; rondas[0].cruces[0].sb = { g: "", p: 6 };
      rondas[0].cruces[1].sa = { g: "", p: 4 }; rondas[0].cruces[1].sb = { g: "", p: 5 };
    }
    return cuadro;
  }

  const actual = () => estado.cuadros.find((c) => c.id === estado.sel) || null;
  const marcarSucio = () => { estado.sucio = true; pintarBarra(); };
  const valNum = (v) => (v === "" || v == null ? null : Math.max(0, Math.min(99, parseInt(v, 10) || 0)));
  const fechaInput = (f) => (f && f.length === 10 ? f + "T00:00" : f || "");

  const norm = (t) => String(t == null ? "" : t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const fechaCorta = (f) => {
    const m = String(f || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? " " + m[4] + ":" + m[5] : ""}` : "sin fecha";
  };
  const lleno = (v) => v != null && v !== "";

  // Misma orientación que el servidor: true = A es el local, false = A es el visitante, null = no encaja.
  function orientar(res, x, indice) {
    const loc = norm(res.equipo_local), vis = norm(res.equipo_visitante);
    const a = norm(x.a), b = norm(x.b);
    if (a && b) return a === loc && b === vis ? true : a === vis && b === loc ? false : null;
    if (a) return a === loc ? true : a === vis ? false : null;
    if (b) return b === vis ? true : b === loc ? false : null;
    return indice === 0 ? true : null;
  }
  function realDesde(res, x, indice) {
    const directo = orientar(res, x, indice);
    const sinCubrir = Number(res.finalizado_no_cubierto) === 1;
    const est = sinCubrir ? "sin_cubrir" : String(res.estado || "programado");
    const base = { id: res.id, local: res.equipo_local, visitante: res.equipo_visitante, estado: est };
    if (directo === null) return { ...base, desajuste: true, a: null, b: null, pen_a: null, pen_b: null, fecha: "" };
    const jugado = (est === "finalizado" || est === "en_juego") && lleno(res.goles_local) && lleno(res.goles_visitante);
    const hayPen = est === "finalizado" && lleno(res.penaltis_local) && lleno(res.penaltis_visitante);
    const f = (l, v) => (directo ? l : v);
    return {
      ...base, desajuste: false,
      a: jugado ? f(res.goles_local, res.goles_visitante) : null,
      b: jugado ? f(res.goles_visitante, res.goles_local) : null,
      pen_a: hayPen ? f(res.penaltis_local, res.penaltis_visitante) : null,
      pen_b: hayPen ? f(res.penaltis_visitante, res.penaltis_local) : null,
      fecha: String(res.fecha_partido_retrasado || res.fecha_partido || ""),
    };
  }
  const penReal = (x) => {
    const u = x.partidos[x.partidos.length - 1];
    return u && u.real && !u.real.desajuste && u.real.pen_a != null && u.real.pen_b != null ? u.real : null;
  };

  function clubesDe(comp) {
    if (typeof getClubsForCategoria !== "function") return [];
    const comps = comp === "copa_del_rey" || comp === "copa_federacion"
      ? ["hypermotion", "primera_federacion", "segunda_federacion", "tercera_federacion", comp] : [comp];
    const set = new Set();
    comps.forEach((c) => { try { getClubsForCategoria(c).forEach((n) => set.add(n)); } catch { /* sin lista */ } });
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }

  // ---------- Pintado ----------
  function pintarBarra() {
    const b = $("elimAdBarra");
    if (!b) return;
    b.innerHTML = `
      <button type="button" class="btn-primari" data-acc="nuevo">+ Nuevo cuadro</button>
      <button type="button" class="btn-primari" data-acc="guardar" ${estado.sucio && !estado.guardando ? "" : "disabled"}>${estado.guardando ? "Guardando…" : "Guardar cambios"}</button>
      <a class="elim-ad-ver" href="/eliminatorias" target="_blank" rel="noopener">Ver en la web ↗</a>
      <span class="elim-ad-estado">${estado.sucio ? "Cambios sin guardar" : estado.cargado ? "Todo guardado" : ""}</span>`;
  }

  function formNuevo() {
    return `<form class="form-card elim-ad-nuevo" id="elimAdFormNuevo">
      <h4>Nuevo cuadro</h4>
      <div class="elim-ad-rejilla">
        <label>Nombre<input name="nombre" maxlength="80" required placeholder="Playoff de ascenso a Primera"></label>
        <label>Competición<select name="competicion">${COMPETICIONES.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join("")}</select></label>
        <label>Grupo (opcional)<input name="grupo" maxlength="30" placeholder="Grupo 1"></label>
        <label>Temporada<input name="temporada" maxlength="12" placeholder="2025-26"></label>
        <label>Tipo<select name="tipo"><option value="playoff_ascenso">Playoff de ascenso</option><option value="eliminatoria">Eliminatoria</option></select></label>
        <label>Estructura<select name="plantilla">${Object.entries(PLANTILLAS).map(([v, p]) => `<option value="${v}" ${v === "4" ? "selected" : ""}>${esc(p.etiqueta)}</option>`).join("")}</select></label>
        <label>Formato<select name="formato">${Object.entries(FORMATOS).map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join("")}</select></label>
      </div>
      <p class="ayuda-editor">Se crea <strong>oculto</strong>: no sale en la web hasta que marques «Visible». Las rondas, los cruces y el formato se pueden cambiar después.</p>
      <div class="elim-ad-fila-btn"><button type="submit" class="btn-primari">Crear cuadro</button><button type="button" class="btn-sec" data-acc="cancelar-nuevo">Cancelar</button></div>
    </form>`;
  }

  function cruceHTML(x, ri, xi, fmt) {
    const parts = x.partidos.map((p, pi) => {
      const real = p.real || null;
      const vinculado = !!p.resultado_id;
      const bloqueado = vinculado && real && !real.desajuste;
      const ga = bloqueado ? real.a : p.a, gb = bloqueado ? real.b : p.b;
      const fecha = bloqueado && real.fecha ? real.fecha : p.fecha;
      const dis = bloqueado ? "disabled" : "";
      const idx = `data-r="${ri}" data-x="${xi}" data-p="${pi}"`;
      let chip = "";
      if (vinculado) {
        if (!real) chip = `<span class="elim-ad-chip aviso">Partido nº ${esc(p.resultado_id)} (no se ha encontrado en Resultados)</span>`;
        else if (real.desajuste) chip = `<span class="elim-ad-chip aviso">${esc(real.local)} – ${esc(real.visitante)}: no coincide con los equipos A y B, así que no se aplica</span>`;
        else chip = `<span class="elim-ad-chip ok">Vinculado: ${esc(real.local)} – ${esc(real.visitante)} · ${esc(TXT_ESTADO[real.estado] || real.estado)}</span>`;
      }
      const v = estado.vinc;
      const abierto = v && v.r === ri && v.x === xi && v.p === pi;
      let picker = "";
      if (abierto) {
        if (v.cargando) picker = '<p class="ayuda-editor">Buscando partidos…</p>';
        else if (v.error) picker = `<p class="elim-ad-error">${esc(v.error)}</p>`;
        else if (!v.lista.length) picker = '<p class="ayuda-editor">No hay partidos de estos equipos en Resultados. Créalo allí primero y vuelve.</p>';
        else picker = `<select data-f="vincular" ${idx} aria-label="Elegir el partido real"><option value="">Elige el partido…</option>${v.lista.map((q) => `<option value="${q.id}" ${q.id === p.resultado_id ? "selected" : ""}>${esc(fechaCorta(q.fecha_partido))} · ${esc(q.equipo_local)} ${lleno(q.goles_local) ? q.goles_local + "–" + q.goles_visitante : "vs"} ${esc(q.equipo_visitante)}</option>`).join("")}</select>`;
      }
      return `
      <div class="elim-ad-partido${bloqueado ? " vinculado" : ""}">
        <span class="elim-ad-pl">${x.partidos.length > 1 ? (pi === 0 ? "Ida" : "Vuelta") : "Partido"}</span>
        <input type="number" min="0" max="99" inputmode="numeric" data-f="goles-a" ${idx} value="${ga == null ? "" : ga}" aria-label="Goles de A" ${dis}>
        <span>–</span>
        <input type="number" min="0" max="99" inputmode="numeric" data-f="goles-b" ${idx} value="${gb == null ? "" : gb}" aria-label="Goles de B" ${dis}>
        <input type="datetime-local" data-f="fecha" ${idx} value="${esc(fechaInput(fecha))}" aria-label="Fecha" ${dis}>
      </div>
      <div class="elim-ad-vinc">
        ${chip}
        <button type="button" class="btn-sec" data-acc="vincular" ${idx}>${vinculado ? "Cambiar partido" : "Vincular a un partido real"}</button>
        ${vinculado ? `<button type="button" class="btn-sec" data-acc="desvincular" ${idx}>Quitar enlace</button>` : ""}
        ${picker}
      </div>`;
    }).join("");
    const cq = actual();
    const semilla = (lado) => {
      const m = x["s" + lado] || {};
      return `<span class="elim-ad-semilla">${lado.toUpperCase()}: <input data-f="s${lado}-g" data-r="${ri}" data-x="${xi}" value="${esc(m.g || "")}" maxlength="30" placeholder="Grupo" aria-label="Grupo del equipo ${lado.toUpperCase()}" style="width:90px"> <input type="number" min="1" max="40" inputmode="numeric" data-f="s${lado}-p" data-r="${ri}" data-x="${xi}" value="${m.p || ""}" placeholder="Puesto" aria-label="Puesto del equipo ${lado.toUpperCase()}" style="width:70px"></span>`;
    };
    const semillas = ri === 0 && cq && cq.clasif ? `<div class="elim-ad-extra"><span>Desde la clasificación</span>${semilla("a")}${semilla("b")}</div>` : "";
    const pr = penReal(x);
    const penA = pr ? pr.pen_a : x.penaltis.a, penB = pr ? pr.pen_b : x.penaltis.b;
    const penDis = pr ? "disabled" : "";
    return `<div class="elim-ad-cruce">
      <div class="elim-ad-equipos">
        <input list="${fmt}" data-f="a" data-r="${ri}" data-x="${xi}" value="${esc(x.a)}" maxlength="80" placeholder="${esc(x.auto_a ? "Automático: " + x.auto_a : "Equipo A (vacío = por determinar)")}">
        <span class="elim-ad-vs">vs</span>
        <input list="${fmt}" data-f="b" data-r="${ri}" data-x="${xi}" value="${esc(x.b)}" maxlength="80" placeholder="${esc(x.auto_b ? "Automático: " + x.auto_b : "Equipo B")}">
      </div>
      ${semillas}
      ${parts}
      <div class="elim-ad-extra">
        <span>Penaltis</span>
        <input type="number" min="0" max="99" inputmode="numeric" data-f="pen-a" data-r="${ri}" data-x="${xi}" value="${penA == null ? "" : penA}" aria-label="Penaltis de A" ${penDis}>
        <span>–</span>
        <input type="number" min="0" max="99" inputmode="numeric" data-f="pen-b" data-r="${ri}" data-x="${xi}" value="${penB == null ? "" : penB}" aria-label="Penaltis de B" ${penDis}>
        <label class="elim-ad-gan">Pasa
          <select data-f="ganador" data-r="${ri}" data-x="${xi}">
            <option value="" ${x.ganador === "" ? "selected" : ""}>Automático (global/penaltis)</option>
            <option value="a" ${x.ganador === "a" ? "selected" : ""}>Equipo A</option>
            <option value="b" ${x.ganador === "b" ? "selected" : ""}>Equipo B</option>
          </select>
        </label>
        <button type="button" class="btn-sec elim-ad-quitar" data-acc="quitar-cruce" data-r="${ri}" data-x="${xi}" title="Quitar cruce">Quitar</button>
      </div>
    </div>`;
  }

  function cuadroHTML(c) {
    const fmt = "elimClubes-" + c.id;
    const clubes = clubesDe(c.competicion);
    return `<div class="form-card elim-ad-cuadro">
      <datalist id="${fmt}">${clubes.map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
      <div class="elim-ad-rejilla">
        <label>Nombre<input data-f="c-nombre" value="${esc(c.nombre)}" maxlength="80"></label>
        <label>Competición<select data-f="c-competicion">${COMPETICIONES.map(([v, n]) => `<option value="${v}" ${v === c.competicion ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
        <label>Grupo<input data-f="c-grupo" value="${esc(c.grupo)}" maxlength="30"></label>
        <label>Temporada<input data-f="c-temporada" value="${esc(c.temporada)}" maxlength="12"></label>
        <label>Tipo<select data-f="c-tipo"><option value="playoff_ascenso" ${c.tipo === "playoff_ascenso" ? "selected" : ""}>Playoff de ascenso</option><option value="eliminatoria" ${c.tipo === "eliminatoria" ? "selected" : ""}>Eliminatoria</option></select></label>
        <label class="elim-ad-check"><input type="checkbox" data-f="c-visible" ${c.visible ? "checked" : ""}> Visible en la web</label>
        <label>Equipos de la 1.ª ronda<select data-f="c-clasif">
          <option value="" ${!c.clasif ? "selected" : ""}>A mano</option>
          <option value="final" ${c.clasif === "final" ? "selected" : ""}>Solos desde la clasificación (cuando el grupo termine)</option>
          <option value="provisional" ${c.clasif === "provisional" ? "selected" : ""}>Solos desde la clasificación (provisional, ya)</option>
        </select></label>
      </div>
      ${c.clasif ? '<p class="ayuda-editor">En cada cruce de la 1.ª ronda indica el grupo y el puesto de cada equipo (en LaLiga Hypermotion no hace falta grupo). Lo que escribas a mano en A/B manda sobre lo automático.</p>' : ""}
      <label class="elim-ad-nota">Nota (opcional, sale bajo el título)<input data-f="c-nota" value="${esc(c.nota)}" maxlength="200" placeholder="Ej.: el campeón de cada grupo asciende; los demás juegan el playoff"></label>
      ${c.rondas.map((r, ri) => {
        const n = r.cruces.length ? r.cruces[0].partidos.length : 2;
        return `<section class="elim-ad-ronda">
          <header class="elim-ad-ronda-cab">
            <input data-f="r-nombre" data-r="${ri}" value="${esc(r.nombre)}" maxlength="40" aria-label="Nombre de la ronda">
            <select data-f="r-formato" data-r="${ri}" aria-label="Formato"><option value="1" ${n === 1 ? "selected" : ""}>Partido único</option><option value="2" ${n === 2 ? "selected" : ""}>Ida y vuelta</option></select>
            <button type="button" class="btn-sec" data-acc="add-cruce" data-r="${ri}">+ Cruce</button>
            <button type="button" class="btn-sec elim-ad-quitar" data-acc="quitar-ronda" data-r="${ri}">Quitar ronda</button>
          </header>
          ${r.cruces.map((x, xi) => cruceHTML(x, ri, xi, fmt)).join("") || '<p class="ayuda-editor">Sin cruces todavía.</p>'}
        </section>`;
      }).join("")}
      <div class="elim-ad-fila-btn">
        <button type="button" class="btn-sec" data-acc="add-ronda">+ Añadir ronda</button>
        <button type="button" class="btn-sec elim-ad-quitar" data-acc="quitar-cuadro">Eliminar este cuadro</button>
      </div>
    </div>`;
  }

  function pintarTodo() {
    const cont = $("elimAdCont");
    if (!cont) return;
    pintarBarra();
    if (estado.cargando && !estado.cargado) { cont.innerHTML = '<p class="ayuda-editor">Cargando…</p>'; return; }
    if (estado.error && !estado.cargado) { cont.innerHTML = `<p class="elim-ad-error">${esc(estado.error)}</p>`; return; }
    const c = actual();
    const tabs = estado.cuadros.length
      ? `<div class="elim-ad-tabs">${estado.cuadros.map((q) => `<button type="button" data-acc="sel" data-id="${esc(q.id)}" class="${q.id === estado.sel ? "activo" : ""}">${esc(q.nombre)}${q.visible ? "" : ' <small>(oculto)</small>'}</button>`).join("")}</div>`
      : '<p class="ayuda-editor">Todavía no hay ningún cuadro. Crea el primero con «+ Nuevo cuadro».</p>';
    cont.innerHTML = (estado.creando ? formNuevo() : "") + tabs + (c ? cuadroHTML(c) : "");
  }

  // ---------- Eventos ----------
  function onInput(e) {
    const el = e.target;
    const f = el.dataset && el.dataset.f;
    if (!f) return;
    const c = actual();
    if (!c) return;
    const r = c.rondas[+el.dataset.r];
    const x = r && r.cruces[+el.dataset.x];
    const p = x && x.partidos[+el.dataset.p];
    let reponer = false;
    if (f === "vincular") { elegirPartidoReal(el, x, p); return; }
    switch (f) {
      case "c-nombre": c.nombre = el.value; break;
      case "c-grupo": c.grupo = el.value; break;
      case "c-temporada": c.temporada = el.value; break;
      case "c-nota": c.nota = el.value; break;
      case "c-tipo": c.tipo = el.value; break;
      case "c-clasif": c.clasif = el.value; reponer = true; break;
      case "sa-g": case "sb-g": case "sa-p": case "sb-p": if (x) {
        const k = f.slice(0, 2), campo = f.slice(3);
        const m = x[k] || { g: "", p: null };
        if (campo === "g") m.g = el.value.trim();
        else m.p = el.value === "" ? null : Math.max(1, Math.min(40, parseInt(el.value, 10) || 1));
        x[k] = m.p ? m : (m.g ? m : null);
      } break;
      case "c-visible": c.visible = el.checked; reponer = true; break;
      case "c-competicion": c.competicion = el.value; reponer = true; break;
      case "r-nombre": if (r) r.nombre = el.value; break;
      case "r-formato": if (r) {
        const n = +el.value;
        r.cruces.forEach((q) => {
          while (q.partidos.length < n) q.partidos.push({ a: null, b: null, fecha: "", resultado_id: null });
          q.partidos.length = n;
        });
        reponer = true;
      } break;
      case "a": if (x) x.a = el.value.trim(); break;
      case "b": if (x) x.b = el.value.trim(); break;
      case "goles-a": if (p) p.a = valNum(el.value); break;
      case "goles-b": if (p) p.b = valNum(el.value); break;
      case "fecha": if (p) p.fecha = el.value; break;
      case "pen-a": if (x) x.penaltis.a = valNum(el.value); break;
      case "pen-b": if (x) x.penaltis.b = valNum(el.value); break;
      case "ganador": if (x) x.ganador = el.value; break;
      default: return;
    }
    marcarSucio();
    if (reponer) pintarTodo();
    else if (f === "c-nombre") {
      const t = document.querySelector(`.elim-ad-tabs button[data-id="${CSS.escape(c.id)}"]`);
      if (t) t.firstChild.textContent = c.nombre || "(sin nombre)";
    }
  }

  async function abrirVinculo(ri, xi, pi) {
    const c = actual();
    const x = c && c.rondas[ri] && c.rondas[ri].cruces[xi];
    if (!x) return;
    const club = x.a || x.b || x.auto_a || x.auto_b;
    if (!club) { toast("Escribe primero al menos uno de los dos equipos del cruce.", "info", 4500); return; }
    estado.vinc = { r: ri, x: xi, p: pi, cargando: true, lista: [], error: "" };
    pintarTodo();
    try {
      const d = await apiFetch(`/api/results?club=${encodeURIComponent(club)}&limit=200`);
      if (!d || !Array.isArray(d.results)) throw new Error("No se han podido leer los partidos.");
      const otro = norm(x.a ? x.b || x.auto_b : x.b ? x.auto_a : "");
      let lista = d.results;
      if (otro) lista = lista.filter((q) => norm(q.equipo_local) === otro || norm(q.equipo_visitante) === otro);
      lista.sort((m, n) => String(n.fecha_partido || "").localeCompare(String(m.fecha_partido || "")));
      estado.vinc.lista = lista;
    } catch (err) {
      estado.vinc.error = (err && err.message) || "Error de conexión";
    }
    if (estado.vinc) estado.vinc.cargando = false;
    pintarTodo();
  }

  function elegirPartidoReal(el, x, p) {
    const v = estado.vinc;
    const id = +el.value;
    if (!x || !p || !v || !id) return;
    const res = v.lista.find((q) => q.id === id);
    if (!res) return;
    p.resultado_id = id;
    p.real = realDesde(res, x, +el.dataset.p);
    estado.vinc = null;
    if (p.real.desajuste) toast("Ese partido no coincide con los equipos A y B del cruce.", "error", 5000);
    marcarSucio();
    pintarTodo();
  }

  async function onClick(e) {
    const b = e.target.closest("[data-acc]");
    if (!b || !$("subpanel-eliminatorias") || !$("subpanel-eliminatorias").contains(b)) return;
    const acc = b.dataset.acc;
    const c = actual();
    const ri = +b.dataset.r, xi = +b.dataset.x;
    if (acc === "nuevo") { estado.creando = true; pintarTodo(); return; }
    if (acc === "cancelar-nuevo") { estado.creando = false; pintarTodo(); return; }
    if (acc === "guardar") { await guardar(); return; }
    if (acc === "sel") { estado.sel = b.dataset.id; estado.vinc = null; pintarTodo(); return; }
    if (!c) return;
    if (acc === "vincular") { await abrirVinculo(ri, xi, +b.dataset.p); return; }
    if (acc === "desvincular") {
      const q = c.rondas[ri] && c.rondas[ri].cruces[xi] && c.rondas[ri].cruces[xi].partidos[+b.dataset.p];
      if (q) { q.resultado_id = null; q.real = null; }
      estado.vinc = null;
      marcarSucio();
      pintarTodo();
      return;
    }
    if (acc === "add-ronda") {
      const n = c.rondas.length && c.rondas[0].cruces.length ? c.rondas[0].cruces[0].partidos.length : 2;
      c.rondas.push(nuevaRonda("Nueva ronda", 1, n));
    } else if (acc === "quitar-ronda") {
      if (!(await confirmar("¿Quitar esta ronda y todos sus cruces?", { peligro: true }))) return;
      c.rondas.splice(ri, 1);
    } else if (acc === "add-cruce") {
      const r = c.rondas[ri];
      if (r) r.cruces.push(nuevoCruce(r.cruces.length ? r.cruces[0].partidos.length : 2));
    } else if (acc === "quitar-cruce") {
      const r = c.rondas[ri];
      if (r) r.cruces.splice(xi, 1);
    } else if (acc === "quitar-cuadro") {
      if (!(await confirmar(`¿Eliminar el cuadro «${c.nombre}»? Se borra al guardar.`, { peligro: true }))) return;
      estado.cuadros = estado.cuadros.filter((q) => q.id !== c.id);
      estado.sel = estado.cuadros[0] ? estado.cuadros[0].id : "";
    } else return;
    marcarSucio();
    pintarTodo();
  }

  function onSubmit(e) {
    if (e.target.id !== "elimAdFormNuevo") return;
    e.preventDefault();
    const fd = new FormData(e.target);
    const f = Object.fromEntries(fd.entries());
    f.nombre = String(f.nombre || "").trim();
    if (!f.nombre) return;
    const c = crearCuadro(f);
    estado.cuadros.push(c);
    estado.sel = c.id;
    estado.creando = false;
    marcarSucio();
    pintarTodo();
    toast("Cuadro creado (oculto). Rellena los equipos y marca «Visible» cuando quieras publicarlo.", "ok", 5000);
  }

  async function guardar() {
    if (estado.guardando) return;
    estado.guardando = true;
    pintarBarra();
    try {
      const r = await apiFetch("/api/eliminatorias", { method: "PUT", body: JSON.stringify({ cuadros: estado.cuadros }, (k, v) => (k === "real" || k === "auto_a" || k === "auto_b" ? undefined : v)) });
      if (!r || !Array.isArray(r.cuadros)) throw new Error("Respuesta no válida del servidor");
      estado.cuadros = r.cuadros;
      if (!estado.cuadros.some((q) => q.id === estado.sel)) estado.sel = estado.cuadros[0] ? estado.cuadros[0].id : "";
      estado.sucio = false;
      toast("Cuadros guardados", "ok");
    } catch (err) {
      toast("No se ha podido guardar: " + ((err && err.message) || "error"), "error", 6000);
    }
    estado.guardando = false;
    pintarTodo();
  }

  let enlazado = false;
  function enlazar() {
    if (enlazado) return;
    const sp = $("subpanel-eliminatorias");
    if (!sp) return;
    enlazado = true;
    sp.addEventListener("input", onInput);
    sp.addEventListener("change", onInput);
    sp.addEventListener("click", onClick);
    sp.addEventListener("submit", onSubmit);
    window.addEventListener("beforeunload", (e) => { if (estado.sucio) { e.preventDefault(); e.returnValue = ""; } });
  }

  async function cargar() {
    enlazar();
    if (estado.cargando) return;
    // Cambios sin guardar: no se recarga encima, solo se repinta.
    if (estado.cargado && estado.sucio) { pintarTodo(); return; }
    estado.cargando = true;
    estado.error = "";
    pintarTodo();
    try {
      const d = await apiFetch("/api/eliminatorias?admin=1");
      // apiFetch puede devolver {} ante un fallo de sesión/conexión sin lanzar error:
      // en ese caso NO se da por cargado, para no sobrescribir datos reales con vacío.
      if (!d || !Array.isArray(d.cuadros)) throw new Error("No se han podido leer los datos del servidor.");
      estado.cuadros = d.cuadros;
      if (!estado.cuadros.some((q) => q.id === estado.sel)) estado.sel = estado.cuadros[0] ? estado.cuadros[0].id : "";
      estado.cargado = true;
      estado.sucio = false;
    } catch (err) {
      estado.error = (err && err.message) || "Error de conexión";
    }
    estado.cargando = false;
    pintarTodo();
  }

  window.EOFEliminatorias = { cargar };
})();
