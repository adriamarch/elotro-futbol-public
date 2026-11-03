// Plantilla del equipo en su propia página (categoria?cat=…&club=…).
//
// Pinta a todos los jugadores del club agrupados por posición, con un marcador del
// equipo, los jugadores que más destacan, filtros por posición, orden y dos vistas
// (tarjetas o tabla). Fuentes (las dos opcionales, sin mezclar cifras):
//   - /data/jugadores/{club}.json (Flashscore): plantilla completa con dorsal, PJ,
//     minutos, goles, asistencias y tarjetas de toda la temporada. Solo se admiten
//     datos de Flashscore (lo comprueba plantilla-lp.js).
//   - /api/stats/club (redacción): dorsal, goles/asistencias/MVP calculados con el
//     minuto a minuto. Si un jugador de la redacción se reconoce sin dudas en la
//     plantilla, su tarjeta enlaza a su ficha y enseña esas cifras aparte.
// Si no hay ninguna de las dos, la sección se queda oculta y la página se ve como siempre.
//
// Depende de plantilla-lp.js (lpCargarPlantilla, lpEmparejar), config.js, clubs.js y layout.js.
(function () {
  const COMPETICIONES = ["hypermotion", "primera_federacion", "segunda_federacion"];
  const POSICIONES = {
    Portero: { plural: "Porteros", corto: "POR", clase: "por" },
    Defensa: { plural: "Defensas", corto: "DEF", clase: "def" },
    Centrocampista: { plural: "Centrocampistas", corto: "MED", clase: "med" },
    Delantero: { plural: "Delanteros", corto: "DEL", clase: "del" },
  };
  const ORDEN = ["Portero", "Defensa", "Centrocampista", "Delantero"];
  const SIN_POSICION = "otros";
  const CLAVE_VISTA = "otrofutbol:plantilla:vista";

  // Orden disponible: etiqueta del selector y sentido por defecto (-1 = de más a menos).
  const ORDENES = {
    pj: { et: "Partidos", dir: -1 },
    min: { et: "Minutos", dir: -1 },
    goles: { et: "Goles", dir: -1 },
    asist: { et: "Asistencias", dir: -1 },
    dorsal: { et: "Dorsal", dir: 1 },
    edad: { et: "Edad", dir: 1 },
    nombre: { et: "Nombre (A-Z)", dir: 1 },
  };

  const num = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("es-ES"));
  const esNum = (v) => v !== null && v !== undefined && !Number.isNaN(Number(v));
  const n0 = (v) => (esNum(v) ? Number(v) : 0);
  const dec1 = (v) => v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function claveGrupo(p) { return POSICIONES[p.posicion] ? p.posicion : SIN_POSICION; }
  function claseGrupo(p) { return POSICIONES[p.posicion] ? POSICIONES[p.posicion].clase : "otros"; }
  function nombreJugador(p) { return p.alias || p.nombre || "—"; }

  function leerVista() {
    try { return localStorage.getItem(CLAVE_VISTA) === "tabla" ? "tabla" : "tarjetas"; } catch (e) { return "tarjetas"; }
  }
  function guardarVista(v) { try { localStorage.setItem(CLAVE_VISTA, v); } catch (e) { /* sin almacenamiento */ } }

  // Unifica las dos fuentes en una sola lista de jugadores para pintar.
  function construirJugadores(doc, datosRed) {
    const red = (datosRed && datosRed.jugadores) || [];
    if (doc) {
      const emparejados = typeof lpEmparejar === "function" ? lpEmparejar(doc.jugadores, red) : new Map();
      return doc.jugadores.map((p) => ({ ...p, red: emparejados.get(p.id) || null, origen: "ext" }));
    }
    // Sin plantilla externa: se enseñan los jugadores que ha registrado la redacción.
    return red.filter((j) => j && j.jugador).map((j) => ({
      id: "red-" + j.slug, alias: j.jugador, nombre: "", demarcacion: "", posicion: null, edad: null,
      red: j, origen: "red",
    }));
  }

  // Cifras normalizadas de un jugador, vengan de la fuente que vengan.
  function cifras(p) {
    if (p.origen === "red") {
      const r = p.red;
      return { pj: r.partidos, min: null, g: r.goles, a: r.asistencias, ta: r.amarillas, tr: n0(r.rojas) + n0(r.dobles), mvp: r.mvps };
    }
    return { pj: p.pj, min: p.min, g: p.goles, a: p.asistencias, ta: p.ta, tr: p.tr, mvp: null };
  }
  function dorsalDe(p) {
    if (p.red && esNum(p.red.dorsal)) return p.red.dorsal;
    return esNum(p.dorsal) ? p.dorsal : null;
  }

  function comparador(orden) {
    const { k, dir } = orden;
    const valor = (p) => {
      const c = cifras(p);
      switch (k) {
        case "min": return c.min;
        case "goles": return c.g;
        case "asist": return c.a;
        case "dorsal": return dorsalDe(p);
        case "edad": return esNum(p.edad) && Number(p.edad) > 0 ? Number(p.edad) : null;
        case "nombre": return nombreJugador(p).toLocaleLowerCase("es");
        default: return c.pj;
      }
    };
    return (a, b) => {
      const va = valor(a), vb = valor(b);
      // Los vacíos van siempre al final, sea cual sea el sentido.
      if (va === null || va === undefined) return (vb === null || vb === undefined) ? 0 : 1;
      if (vb === null || vb === undefined) return -1;
      let r = typeof va === "string" ? va.localeCompare(vb, "es") : va - vb;
      if (r) return r * dir;
      // Desempates estables: partidos, minutos y nombre.
      const ca = cifras(a), cb = cifras(b);
      return (n0(cb.pj) - n0(ca.pj)) || (n0(cb.min) - n0(ca.min)) || nombreJugador(a).localeCompare(nombreJugador(b), "es");
    };
  }

  // ---------- Resumen del equipo ----------
  function resumen(jugadores) {
    const edades = jugadores.filter((p) => esNum(p.edad) && Number(p.edad) > 0).map((p) => Number(p.edad));
    const suma = (f) => jugadores.reduce((t, p) => t + n0(f(cifras(p))), 0);
    const hay = (f) => jugadores.some((p) => esNum(f(cifras(p))));
    const mejor = (f, minimo = 1) => {
      const orden = jugadores.slice().sort((a, b) => f(cifras(b)) - f(cifras(a)) || n0(cifras(b).min) - n0(cifras(a).min));
      return orden[0] && f(cifras(orden[0])) >= minimo ? orden[0] : null;
    };
    const comp = ORDEN.map((k) => ({ k, n: jugadores.filter((p) => p.posicion === k).length })).filter((x) => x.n);
    const otros = jugadores.filter((p) => !POSICIONES[p.posicion]).length;
    return {
      edadMedia: edades.length ? edades.reduce((a, b) => a + b, 0) / edades.length : null,
      goles: suma((c) => c.g), hayGoles: hay((c) => c.g),
      asist: suma((c) => c.a), hayAsist: hay((c) => c.a),
      ta: suma((c) => c.ta), hayTa: hay((c) => c.ta),
      tr: suma((c) => c.tr), hayTr: hay((c) => c.tr),
      comp: otros ? comp.concat([{ k: SIN_POSICION, n: otros }]) : comp,
      goleador: mejor((c) => n0(c.g)),
      asistente: mejor((c) => n0(c.a)),
      pilar: mejor((c) => n0(c.min)),
      amonestado: mejor((c) => n0(c.ta) + 2 * n0(c.tr)),
    };
  }

  function marcadorHTML(jugadores, r) {
    const celdas = [
      [String(jugadores.length), "Jugadores", ""],
      r.edadMedia !== null ? [dec1(r.edadMedia), "Edad media", ""] : null,
      r.hayGoles ? [num(r.goles), "Goles", ""] : null,
      r.hayAsist ? [num(r.asist), "Asistencias", ""] : null,
      r.hayTa ? [num(r.ta), "Amarillas", "ta"] : null,
      r.hayTr ? [num(r.tr), "Rojas", "tr"] : null,
    ].filter(Boolean);
    return `<div class="pc-marcador" data-n="${celdas.length}" style="--n:${celdas.length}">${celdas.map(([v, et, c]) =>
      `<div class="pc-marc${c ? " pc-marc--" + c : ""}"><b>${v}</b><span>${et}</span></div>`).join("")}</div>`;
  }

  function liderHTML(etiqueta, p, valor, detalle) {
    if (!p) return "";
    const d = dorsalDe(p);
    return `<div class="pc-lider pc-pos-${claseGrupo(p)}">
      <span class="pc-lider-et">${etiqueta}</span>
      <span class="pc-lider-valor">${num(valor)}</span>
      <span class="pc-lider-nombre" title="${escapeHtml(nombreJugador(p))}">${escapeHtml(nombreJugador(p))}</span>
      <span class="pc-lider-sub">${[d !== null ? "#" + d : "", detalle].filter(Boolean).map(escapeHtml).join(" · ")}</span>
    </div>`;
  }

  function lideresHTML(r) {
    const g = r.goleador && cifras(r.goleador), a = r.asistente && cifras(r.asistente);
    const m = r.pilar && cifras(r.pilar), t = r.amonestado && cifras(r.amonestado);
    const html = [
      liderHTML("Máximo goleador", r.goleador, g && g.g, g ? `${num(g.pj)} PJ` : ""),
      liderHTML("Más asistencias", r.asistente, a && a.a, a ? `${num(a.pj)} PJ` : ""),
      liderHTML("Más minutos", r.pilar, m && m.min, m ? `${num(m.pj)} PJ` : ""),
      liderHTML("Más tarjetas", r.amonestado, t && n0(t.ta) + n0(t.tr), t ? `${num(t.ta)} amarillas · ${num(t.tr)} rojas` : ""),
    ].join("");
    return html ? `<div class="pc-lideres">${html}</div>` : "";
  }

  // ---------- Vista de tarjetas ----------
  function pctMinutos(p, maxMin) {
    const c = cifras(p);
    return esNum(c.min) && maxMin > 0 ? Math.max(0, Math.min(100, Math.round((Number(c.min) / maxMin) * 100))) : null;
  }

  function celdaCifra(et, valor, titulo, destacar) {
    const cero = esNum(valor) && Number(valor) === 0;
    return `<div class="${[cero ? "cero" : "", destacar && !cero && esNum(valor) ? "pc-dest" : ""].filter(Boolean).join(" ")}" title="${escapeHtml(titulo)}"><dt>${et}</dt><dd>${num(valor)}</dd></div>`;
  }

  function tarjetaHTML(p, i, fichaHref, maxMin) {
    const c = cifras(p);
    const nombre = escapeHtml(nombreJugador(p));
    const real = p.nombre && p.alias && p.nombre !== p.alias ? escapeHtml(p.nombre) : "";
    const d = dorsalDe(p);
    const pos = POSICIONES[p.posicion] ? p.posicion : "";
    const meta = [
      p.demarcacion || pos ? `<span class="pc-pos">${escapeHtml(p.demarcacion || pos)}</span>` : "",
      esNum(p.edad) && Number(p.edad) > 0 ? `<span class="pc-edad">${Number(p.edad)} años</span>` : "",
    ].filter(Boolean).join("");
    const placa = d !== null
      ? `<span class="pc-num" title="Dorsal ${escapeHtml(String(d))}">${escapeHtml(String(d))}</span>`
      : `<span class="pc-num pc-num--sin" title="Sin dorsal">${POSICIONES[p.posicion] ? POSICIONES[p.posicion].corto : "—"}</span>`;
    const celdas = p.origen === "red"
      ? [
        celdaCifra("PJ", c.pj, "Partidos con alineación registrada"),
        celdaCifra("G", c.g, "Goles", true),
        celdaCifra("A", c.a, "Asistencias", true),
        celdaCifra("MVP", c.mvp, "Veces elegido MVP del partido"),
      ]
      : [
        celdaCifra("PJ", c.pj, "Partidos jugados"),
        celdaCifra("Min", c.min, "Minutos jugados"),
        celdaCifra("G", c.g, "Goles", true),
        celdaCifra("A", c.a, "Asistencias", true),
      ];
    const pct = pctMinutos(p, maxMin);
    const barra = pct !== null
      ? `<span class="pc-bar" title="${pct} % de los minutos del jugador con más minutos de la plantilla"><i style="--w:${pct}%"></i></span>`
      : `<span class="pc-bar pc-bar--vacia"></span>`;
    const tarj = `<span class="pc-tarj">
        <span class="pc-ta${n0(c.ta) ? "" : " cero"}" title="Tarjetas amarillas">${num(c.ta)}</span>
        <span class="pc-tr${n0(c.tr) ? "" : " cero"}" title="Tarjetas rojas">${num(c.tr)}</span>
      </span>`;
    // Cifras de la redacción, aparte de las de la fuente externa y solo si el jugador se reconoce sin dudas.
    let pie = "";
    if (p.origen === "ext" && p.red) {
      const r = p.red;
      const extra = [`<b>${r.goles}</b> G`, `<b>${r.asistencias}</b> A`, r.mvps ? `<b>${r.mvps}</b> MVP` : ""].filter(Boolean).join(" · ");
      pie = `<p class="pc-red"><span class="pc-red-et">Redacción</span><span class="pc-red-cifras">${extra}</span><span class="pc-red-ir">Ficha ›</span></p>`;
    } else if (p.origen === "red") {
      pie = `<p class="pc-red"><span class="pc-red-et">Redacción</span><span class="pc-red-cifras">Ver ficha</span><span class="pc-red-ir">›</span></p>`;
    }
    const cuerpo = `
      <div class="pc-top">
        ${placa}
        <div class="pc-id">
          <h3 class="pc-nombre">${nombre}</h3>
          ${real ? `<p class="pc-real">${real}</p>` : ""}
          ${meta ? `<p class="pc-meta">${meta}</p>` : ""}
        </div>
      </div>
      <dl class="pc-cifras">${celdas.join("")}</dl>
      <div class="pc-fila">${barra}${tarj}</div>
      ${pie}`;
    const href = p.red && fichaHref ? fichaHref(p.red) : "";
    const interior = href
      ? `<a class="pc-card-in pc-card-enlace" href="${escapeHtml(href)}" aria-label="Ver la ficha de ${nombre}">${cuerpo}</a>`
      : `<div class="pc-card-in">${cuerpo}</div>`;
    const sin = p.origen === "ext" && n0(c.pj) === 0 ? " pc-card--sin" : "";
    return `<li class="pc-card pc-pos-${claseGrupo(p)}${sin}" style="--i:${Math.min(i, 14)}">${interior}</li>`;
  }

  // ---------- Vista de tabla ----------
  function columnasTabla(hayMin) {
    return [
      { k: "dorsal", et: "#", titulo: "Dorsal" },
      { k: "nombre", et: "Jugador", titulo: "Nombre" },
      { k: "edad", et: "Edad", titulo: "Edad" },
      { k: "pj", et: "PJ", titulo: "Partidos jugados" },
      hayMin ? { k: "min", et: "Min.", titulo: "Minutos jugados" } : null,
      { k: "goles", et: "G", titulo: "Goles" },
      { k: "asist", et: "A", titulo: "Asistencias" },
      { k: null, et: "TA", titulo: "Tarjetas amarillas", clase: "pc-t-ta" },
      { k: null, et: "TR", titulo: "Tarjetas rojas", clase: "pc-t-tr" },
    ].filter(Boolean);
  }

  function filaTabla(p, fichaHref, hayMin) {
    const c = cifras(p);
    const d = dorsalDe(p);
    const nombre = escapeHtml(nombreJugador(p));
    const href = p.red && fichaHref ? fichaHref(p.red) : "";
    const pos = p.demarcacion || (POSICIONES[p.posicion] ? p.posicion : "");
    const celda = (v) => `<td${esNum(v) && Number(v) === 0 ? ' class="cero"' : ""}>${num(v)}</td>`;
    return `<tr class="pc-pos-${claseGrupo(p)}">
      <td class="pc-t-num">${d !== null ? escapeHtml(String(d)) : "—"}</td>
      <td class="pc-t-jug">${href ? `<a href="${escapeHtml(href)}" title="Ver su ficha con las estadísticas de la redacción">${nombre}</a>` : `<span>${nombre}</span>`}${pos ? `<small>${escapeHtml(pos)}</small>` : ""}</td>
      <td>${esNum(p.edad) && Number(p.edad) > 0 ? Number(p.edad) : "—"}</td>
      ${celda(c.pj)}${hayMin ? celda(c.min) : ""}${celda(c.g)}${celda(c.a)}${celda(c.ta)}${celda(c.tr)}
    </tr>`;
  }

  function esqueleto() {
    return `<div class="pc-esqueleto" role="status" aria-label="Cargando la plantilla">${Array.from({ length: 6 }, () => `<span class="pc-esq-card"></span>`).join("")}</div>`;
  }

  async function cargarPlantillaEquipo(club, cat) {
    const cont = document.getElementById("plantillaEquipo");
    if (!cont || !club) return;
    cont.hidden = false;
    cont.innerHTML = esqueleto();
    try {
      const compPagina = COMPETICIONES.includes(cat) ? cat : null;
      const lpPromesa = typeof lpCargarPlantilla === "function" ? lpCargarPlantilla(club) : Promise.resolve(null);
      const doc = await lpPromesa;
      const comp = compPagina || (doc && COMPETICIONES.includes(doc.competicion) ? doc.competicion : null);
      let datosRed = null;
      if (comp) {
        try {
          const res = await apiFetch(`/api/stats/club?${new URLSearchParams({ competicion: comp, club }).toString()}`);
          if (res.ok) datosRed = await res.json();
        } catch (e) { /* opcional */ }
      }
      const jugadores = construirJugadores(doc, datosRed);
      if (!jugadores.length) { cont.hidden = true; cont.innerHTML = ""; return; }
      pintar(cont, { club, comp, doc, jugadores });
    } catch (e) {
      cont.hidden = true;
      cont.innerHTML = "";
    }
  }

  const ICONO_TARJETAS = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="2" y="2" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="11" y="2" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="2" y="11" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="11" y="11" width="7" height="7" rx="1.5" fill="currentColor"/></svg>';
  const ICONO_TABLA = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="2" y="3" width="16" height="2.6" rx="1" fill="currentColor"/><rect x="2" y="8.7" width="16" height="2.6" rx="1" fill="currentColor"/><rect x="2" y="14.4" width="16" height="2.6" rx="1" fill="currentColor"/></svg>';

  function pintar(cont, { club, comp, doc, jugadores }) {
    const fichaHref = comp ? (r) => `${baseHref()}jugador?c=${encodeURIComponent(comp)}&j=${encodeURIComponent(r.slug)}&t=goleadores` : null;
    const grupos = new Map();
    jugadores.forEach((p) => {
      const k = claveGrupo(p);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(p);
    });
    const claves = [...ORDEN.filter((k) => grupos.has(k)), ...(grupos.has(SIN_POSICION) ? [SIN_POSICION] : [])];
    const tituloGrupo = (k) => (k === SIN_POSICION ? (claves.length === 1 ? "Jugadores" : "Otros") : POSICIONES[k].plural);
    const claseDe = (k) => (k === SIN_POSICION ? "otros" : POSICIONES[k].clase);

    const r = resumen(jugadores);
    const hayMin = jugadores.some((p) => esNum(cifras(p).min));
    const maxMin = jugadores.reduce((m, p) => Math.max(m, n0(cifras(p).min)), 0);
    const ordenesOk = Object.keys(ORDENES).filter((k) => (k !== "min" || hayMin) && (k !== "dorsal" || jugadores.some((p) => dorsalDe(p) !== null)));

    const est = { tab: "todos", vista: leerVista(), orden: { k: "pj", dir: -1 } };

    const pestanas = claves.length > 1
      ? `<div class="pc-tabs" role="tablist" aria-label="Filtrar por posición">
          <button type="button" role="tab" class="pc-tab activo" aria-selected="true" data-k="todos">Todos <span>${jugadores.length}</span></button>
          ${claves.map((k) => `<button type="button" role="tab" class="pc-tab pc-tab--${claseDe(k)}" aria-selected="false" data-k="${k}">${tituloGrupo(k)} <span>${grupos.get(k).length}</span></button>`).join("")}
        </div>`
      : `<div class="pc-tabs pc-tabs--solo"></div>`;

    const herramientas = `
      <div class="pc-herr">
        <label class="pc-orden-et" for="pcOrden">Ordenar por</label>
        <select class="pc-orden" id="pcOrden">${ordenesOk.map((k) => `<option value="${k}"${k === est.orden.k ? " selected" : ""}>${ORDENES[k].et}</option>`).join("")}</select>
        <div class="pc-vista" role="group" aria-label="Forma de ver la plantilla">
          <button type="button" data-v="tarjetas" aria-pressed="${est.vista === "tarjetas"}" title="Ver como tarjetas" aria-label="Tarjetas">${ICONO_TARJETAS}</button>
          <button type="button" data-v="tabla" aria-pressed="${est.vista === "tabla"}" title="Ver como tabla" aria-label="Tabla">${ICONO_TABLA}</button>
        </div>
      </div>`;

    const enlaceCompleta = comp ? `<a class="pc-enlace" href="${baseHref()}plantilla?c=${encodeURIComponent(comp)}&club=${encodeURIComponent(club)}">Estadísticas completas <span aria-hidden="true">→</span></a>` : "";
    const temporada = doc && doc.temporada ? `<span class="pc-temp">${escapeHtml(doc.temporada)}</span>` : "";
    const urlOk = doc && typeof doc.fuente_url === "string" && /^https:\/\/(www\.)?flashscore\.(com|es)\//.test(doc.fuente_url);
    const fecha = doc && doc.actualizado ? ` Actualizado el ${escapeHtml(String(doc.actualizado).split("-").reverse().join("/"))}.` : "";
    const fuenteNombre = doc ? escapeHtml(String(doc.fuente || "Flashscore").replace(/\.(es|com)$/i, "")) : "";
    const nota = doc
      ? `<span class="pc-fuente">${fuenteNombre}</span><span>Datos no oficiales; suman todas las competiciones del club y pueden diferir de las cifras de la redacción.${fecha}${urlOk ? ` <a href="${escapeHtml(doc.fuente_url)}" target="_blank" rel="noopener nofollow">Ver en ${fuenteNombre} ↗</a>` : ""}</span>`
      : `<span>Jugadores registrados por la redacción en el minuto a minuto. Todavía no tenemos la plantilla completa de este club.</span>`;

    // Cabecera plegable: al principio solo se ve un resumen (nº de jugadores, edad media y la
    // composición por líneas); al pulsar se despliega el detalle.
    const resumenCorto = [
      `${jugadores.length} jugadores`,
      r.edadMedia !== null ? `${dec1(r.edadMedia)} años de media` : "",
    ].filter(Boolean).join(" · ");
    const composicion = r.comp.length > 1
      ? `<span class="pc-comp" aria-hidden="true">${r.comp.map((x) => `<i class="pc-pos-${x.k === SIN_POSICION ? "otros" : POSICIONES[x.k].clase}" style="flex-grow:${x.n}"></i>`).join("")}</span>
         <span class="pc-comp-leyenda">${r.comp.map((x) => `<span class="pc-pos-${x.k === SIN_POSICION ? "otros" : POSICIONES[x.k].clase}"><b>${x.n}</b> ${x.k === SIN_POSICION ? "OTR" : POSICIONES[x.k].corto}</span>`).join("")}</span>`
      : "";
    const abiertoInicial = location.hash === "#plantilla";

    cont.innerHTML = `
      <button type="button" class="pc-toggle" id="pcToggle" aria-expanded="${abiertoInicial}" aria-controls="pcPanel">
        <span class="pc-toggle-txt">
          <span class="pc-titulo">Plantilla ${temporada}</span>
          <span class="pc-toggle-sub">${escapeHtml(resumenCorto)}</span>
          ${composicion}
        </span>
        <span class="pc-toggle-accion">
          <span class="pc-toggle-et" data-abrir="Ver plantilla" data-cerrar="Ocultar">${abiertoInicial ? "Ocultar" : "Ver plantilla"}</span>
          <span class="pc-chevron" aria-hidden="true"></span>
        </span>
      </button>
      <div class="pc-panel${abiertoInicial ? " abierto" : ""}" id="pcPanel" role="region" aria-label="Plantilla de ${escapeHtml(club)}"${abiertoInicial ? "" : " inert"}>
        <div class="pc-panel-in">
          <div class="pc-panel-cont">
            <header class="pc-cab">
              <p class="pc-sub">Los jugadores de ${escapeHtml(club)}${doc ? "" : " que tenemos registrados"}.</p>
              ${enlaceCompleta}
            </header>
            ${marcadorHTML(jugadores, r)}
            ${lideresHTML(r)}
            <div class="pc-barra">${pestanas}${herramientas}</div>
            <div class="pc-lista" id="pcLista"></div>
            <p class="pc-nota">${nota}</p>
          </div>
        </div>
      </div>`;

    const toggle = cont.querySelector("#pcToggle");
    const panel = cont.querySelector("#pcPanel");
    const etiqueta = toggle.querySelector(".pc-toggle-et");
    toggle.addEventListener("click", () => {
      const abrir = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", abrir ? "true" : "false");
      panel.classList.toggle("abierto", abrir);
      if (abrir) panel.removeAttribute("inert"); else panel.setAttribute("inert", "");
      etiqueta.textContent = abrir ? etiqueta.dataset.cerrar : etiqueta.dataset.abrir;
    });

    const lista = cont.querySelector("#pcLista");
    const selOrden = cont.querySelector("#pcOrden");

    function pintarLista() {
      const cmp = comparador(est.orden);
      const ks = est.tab === "todos" ? claves : [est.tab];
      const conCabecera = est.tab === "todos" && claves.length > 1;
      if (est.vista === "tabla") {
        const cols = columnasTabla(hayMin);
        const cab = cols.map((c) => {
          if (!c.k) return `<th scope="col" class="${c.clase || ""}" title="${c.titulo}">${c.et}</th>`;
          const activa = est.orden.k === c.k;
          return `<th scope="col" class="${c.k === "nombre" ? "pc-t-jug " : ""}${activa ? "orden-activo" : ""}" title="${c.titulo}"${activa ? ` aria-sort="${est.orden.dir > 0 ? "ascending" : "descending"}"` : ""}><button type="button" data-ord="${c.k}">${c.et}</button></th>`;
        }).join("");
        const filas = ks.map((k) => {
          const cabG = conCabecera ? `<tr class="pc-t-grupo pc-pos-${claseDe(k)}"><td colspan="${cols.length}">${tituloGrupo(k)} <span>${grupos.get(k).length}</span></td></tr>` : "";
          return cabG + grupos.get(k).slice().sort(cmp).map((p) => filaTabla(p, fichaHref, hayMin)).join("");
        }).join("");
        lista.innerHTML = `<div class="pc-tabla-wrap"><table class="pc-tabla"><thead><tr>${cab}</tr></thead><tbody>${filas}</tbody></table></div>`;
        return;
      }
      let n = 0;
      lista.innerHTML = ks.map((k) => {
        const cab = conCabecera
          ? `<h3 class="pc-grupo pc-grupo--${claseDe(k)}">${tituloGrupo(k)} <span>${grupos.get(k).length}</span></h3>`
          : "";
        return `<section class="pc-grupo-bloque">${cab}<ul class="pc-grid">${grupos.get(k).slice().sort(cmp).map((p) => tarjetaHTML(p, n++, fichaHref, maxMin)).join("")}</ul></section>`;
      }).join("");
    }
    pintarLista();

    cont.querySelectorAll(".pc-tab").forEach((btn) => btn.addEventListener("click", () => {
      est.tab = btn.dataset.k;
      cont.querySelectorAll(".pc-tab").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("activo", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      pintarLista();
    }));
    selOrden.addEventListener("change", () => {
      est.orden = { k: selOrden.value, dir: ORDENES[selOrden.value].dir };
      pintarLista();
    });
    cont.querySelectorAll(".pc-vista button").forEach((btn) => btn.addEventListener("click", () => {
      est.vista = btn.dataset.v;
      guardarVista(est.vista);
      cont.querySelectorAll(".pc-vista button").forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
      pintarLista();
    }));
    // Cabeceras de la tabla: pulsar ordena; pulsar otra vez la misma invierte el sentido.
    lista.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-ord]");
      if (!b) return;
      const k = b.dataset.ord;
      est.orden = est.orden.k === k ? { k, dir: -est.orden.dir } : { k, dir: ORDENES[k].dir };
      if (ordenesOk.includes(k)) selOrden.value = k;
      pintarLista();
      const nuevo = lista.querySelector(`button[data-ord="${k}"]`);
      if (nuevo) nuevo.focus();
    });
  }

  window.cargarPlantillaEquipo = cargarPlantillaEquipo;
})();
