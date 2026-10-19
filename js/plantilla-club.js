// Plantilla del equipo en su propia página (categoria?cat=…&club=…).
//
// Pinta a todos los jugadores que tenemos del club como tarjetas, agrupados por
// posición, con un resumen del equipo y filtros por posición. Fuentes (las dos
// opcionales, con la misma regla de siempre: no se mezclan cifras):
//   - /data/jugadores/{club}.json (LaPreferente): plantilla completa con PJ,
//     titularidades, minutos, goles y tarjetas de toda la temporada.
//   - /api/stats/club (redacción): dorsal, goles/asistencias/MVP calculados con
//     el minuto a minuto. Si un jugador de la redacción se reconoce sin dudas en
//     la plantilla, su tarjeta enlaza a su ficha y enseña esas cifras aparte.
// Si no hay ninguna de las dos, la sección se queda oculta y la página se ve
// como siempre.
//
// Depende de plantilla-lp.js (lpCargarPlantilla, lpEmparejar), config.js,
// clubs.js y layout.js.
(function () {
  const COMPETICIONES = ["hypermotion", "primera_federacion", "segunda_federacion"];
  const POSICIONES = {
    Portero: { plural: "Porteros", clase: "por" },
    Defensa: { plural: "Defensas", clase: "def" },
    Centrocampista: { plural: "Centrocampistas", clase: "med" },
    Delantero: { plural: "Delanteros", clase: "del" },
  };
  const ORDEN = ["Portero", "Defensa", "Centrocampista", "Delantero"];
  const SIN_POSICION = "otros";

  const num = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("es-ES"));
  const esNum = (v) => v !== null && v !== undefined && !Number.isNaN(Number(v));

  // Dos letras para el avatar: inicial del nombre + inicial del último apellido; o las dos primeras del alias.
  function iniciales(p) {
    const partes = String(p.nombre || "").trim().split(/\s+/).filter(Boolean);
    if (partes.length >= 2) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
    const base = String(p.alias || p.nombre || "?").trim();
    return base.slice(0, 2).charAt(0).toUpperCase() + base.slice(1, 2).toLowerCase();
  }

  function claveGrupo(p) {
    return POSICIONES[p.posicion] ? p.posicion : SIN_POSICION;
  }
  function claseGrupo(p) {
    return POSICIONES[p.posicion] ? POSICIONES[p.posicion].clase : "otros";
  }

  // Unifica las dos fuentes en una sola lista de jugadores para pintar.
  function construirJugadores(doc, datosRed) {
    const red = (datosRed && datosRed.jugadores) || [];
    if (doc) {
      const emparejados = typeof lpEmparejar === "function" ? lpEmparejar(doc.jugadores, red) : new Map();
      return doc.jugadores.map((p) => ({ ...p, red: emparejados.get(p.id) || null, origen: "lp" }));
    }
    // Sin plantilla externa: se enseñan los jugadores que ha registrado la redacción.
    return red.filter((j) => j && j.jugador).map((j) => ({
      id: "red-" + j.slug, alias: j.jugador, nombre: "", demarcacion: "", posicion: null, edad: null,
      red: j, origen: "red",
    }));
  }

  function tiles(p) {
    if (p.origen === "red") {
      const r = p.red;
      return [
        ["PJ", num(r.partidos), "Partidos con alineación registrada"],
        ["G", num(r.goles), "Goles"],
        ["A", num(r.asistencias), "Asistencias"],
        ["🟨", num(r.amarillas), "Tarjetas amarillas"],
        ["🟥", num(r.rojas + r.dobles), "Expulsiones"],
        ["MVP", num(r.mvps), "Veces elegido MVP del partido"],
      ];
    }
    const portero = p.posicion === "Portero";
    return [
      ["PJ", num(p.pj), "Partidos jugados"],
      ["Tit.", num(p.pt), "Partidos de titular"],
      ["Min.", num(p.min), "Minutos jugados"],
      portero ? ["Enc.", num(p.encajados), "Goles encajados"] : ["G", num(p.goles), "Goles"],
      ["🟨", num(p.ta), "Tarjetas amarillas"],
      ["🟥", num(p.tr), "Tarjetas rojas"],
    ];
  }

  function tarjetaHTML(p, i, fichaHref) {
    const nombre = escapeHtml(p.alias || p.nombre || "—");
    const real = p.nombre && p.alias && p.nombre !== p.alias ? escapeHtml(p.nombre) : "";
    const dorsal = p.red && p.red.dorsal !== null && p.red.dorsal !== undefined ? `<span class="pc-dorsal" title="Dorsal">${escapeHtml(String(p.red.dorsal))}</span>` : "";
    const demarcacion = p.demarcacion || (POSICIONES[p.posicion] ? p.posicion : "");
    const meta = [
      demarcacion ? `<span class="pc-pos">${escapeHtml(demarcacion)}</span>` : "",
      esNum(p.edad) && Number(p.edad) > 0 ? `<span class="pc-edad">${Number(p.edad)} años</span>` : "",
    ].filter(Boolean).join("");
    const celdas = tiles(p).map(([et, v, titulo]) => `<div title="${escapeHtml(titulo)}"><dt>${et}</dt><dd>${v}</dd></div>`).join("");
    // Cifras de la redacción, aparte de las de la fuente externa y solo si el jugador se reconoce sin dudas.
    let pie = "";
    if (p.origen === "lp" && p.red) {
      const r = p.red;
      const extra = [`<b>${r.goles}</b> G`, `<b>${r.asistencias}</b> A`, r.mvps ? `<b>${r.mvps}</b> MVP` : ""].filter(Boolean).join(" · ");
      pie = `<p class="pc-red"><span class="pc-red-et">Redacción</span><span>${extra}</span><span class="pc-red-ir">Ficha ›</span></p>`;
    } else if (p.origen === "red") {
      pie = `<p class="pc-red"><span class="pc-red-et">Redacción</span><span>Ver ficha</span><span class="pc-red-ir">›</span></p>`;
    }
    const cuerpo = `
      <div class="pc-top">
        <span class="pc-avatar" aria-hidden="true">${escapeHtml(iniciales(p))}${dorsal}</span>
        <div class="pc-id">
          <h3 class="pc-nombre">${nombre}</h3>
          ${real ? `<p class="pc-real">${real}</p>` : ""}
        </div>
      </div>
      ${meta ? `<p class="pc-meta">${meta}</p>` : ""}
      <dl class="pc-stats">${celdas}</dl>
      ${pie}`;
    const href = p.red && fichaHref ? fichaHref(p.red) : "";
    const interior = href
      ? `<a class="pc-card-in pc-card-enlace" href="${escapeHtml(href)}" aria-label="Ver la ficha de ${nombre}">${cuerpo}</a>`
      : `<div class="pc-card-in">${cuerpo}</div>`;
    return `<li class="pc-card pc-pos-${claseGrupo(p)}" style="--i:${Math.min(i, 14)}">${interior}</li>`;
  }

  function ordenar(lista) {
    return lista.slice().sort((a, b) =>
      (b.pj || 0) - (a.pj || 0) || (b.min || 0) - (a.min || 0) ||
      (a.origen === "red" ? (b.red.partidos - a.red.partidos) : 0) ||
      String(a.alias || a.nombre).localeCompare(String(b.alias || b.nombre), "es"));
  }

  function resumen(jugadores) {
    const edades = jugadores.filter((p) => esNum(p.edad) && Number(p.edad) > 0).map((p) => Number(p.edad));
    const edadMedia = edades.length ? edades.reduce((a, b) => a + b, 0) / edades.length : null;
    const conGoles = jugadores.filter((p) => p.origen === "lp" && esNum(p.goles));
    const golesTotal = conGoles.reduce((a, p) => a + Number(p.goles), 0);
    const max = conGoles.slice().sort((a, b) => b.goles - a.goles)[0];
    return { edadMedia, golesTotal, hayGoles: conGoles.length > 0, max: max && max.goles > 0 ? max : null };
  }

  function kpiHTML(valor, etiqueta, detalle) {
    return `<div class="pc-kpi"><span class="pc-kpi-valor">${valor}</span><span class="pc-kpi-et">${etiqueta}</span>${detalle ? `<span class="pc-kpi-det">${detalle}</span>` : ""}</div>`;
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

    const r = resumen(jugadores);
    const kpis = [
      kpiHTML(String(jugadores.length), "Jugadores"),
      r.edadMedia !== null ? kpiHTML(r.edadMedia.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }), "Edad media") : "",
      r.hayGoles ? kpiHTML(num(r.golesTotal), "Goles de la plantilla") : "",
      r.max ? kpiHTML(`${num(r.max.goles)}`, "Máximo goleador", escapeHtml(r.max.alias || r.max.nombre)) : "",
    ].join("");

    const pestanas = claves.length > 1
      ? `<div class="pc-tabs" role="tablist" aria-label="Filtrar por posición">
          <button type="button" role="tab" class="pc-tab activo" aria-selected="true" data-k="todos">Todos <span>${jugadores.length}</span></button>
          ${claves.map((k) => `<button type="button" role="tab" class="pc-tab" aria-selected="false" data-k="${k}">${tituloGrupo(k)} <span>${grupos.get(k).length}</span></button>`).join("")}
        </div>`
      : "";

    const enlaceCompleta = comp ? `<a class="pc-enlace" href="${baseHref()}plantilla?c=${encodeURIComponent(comp)}&club=${encodeURIComponent(club)}">Estadísticas completas <span aria-hidden="true">→</span></a>` : "";
    const temporada = doc && doc.temporada ? `<span class="pc-temp">${escapeHtml(doc.temporada)}</span>` : "";
    const urlOk = doc && typeof doc.fuente_url === "string" && doc.fuente_url.startsWith("https://www.lapreferente.com/");
    const fecha = doc && doc.actualizado ? ` Actualizado el ${escapeHtml(String(doc.actualizado).split("-").reverse().join("/"))}.` : "";
    const nota = doc
      ? `Datos no oficiales de ${escapeHtml(doc.fuente || "una fuente externa")}; suman todas las competiciones del club y pueden diferir de las cifras de la redacción.${fecha}${urlOk ? ` <a href="${escapeHtml(doc.fuente_url)}" target="_blank" rel="noopener nofollow">Ver en LaPreferente ↗</a>` : ""}`
      : "Jugadores registrados por la redacción en el minuto a minuto. Todavía no tenemos la plantilla completa de este club.";

    cont.innerHTML = `
      <header class="pc-cab">
        <div>
          <h2 class="pc-titulo">Plantilla ${temporada}</h2>
          <p class="pc-sub">Los jugadores de ${escapeHtml(club)}${doc ? "" : " que tenemos registrados"}.</p>
        </div>
        ${enlaceCompleta}
      </header>
      <div class="pc-kpis">${kpis}</div>
      ${pestanas}
      <div class="pc-lista" id="pcLista"></div>
      <p class="pc-nota">${nota}</p>`;

    const lista = cont.querySelector("#pcLista");
    let activo = "todos";
    const pintarLista = () => {
      let n = 0;
      const ks = activo === "todos" ? claves : [activo];
      lista.innerHTML = ks.map((k) => {
        const cab = activo === "todos" && claves.length > 1
          ? `<h3 class="pc-grupo pc-grupo--${k === SIN_POSICION ? "otros" : POSICIONES[k].clase}">${tituloGrupo(k)} <span>${grupos.get(k).length}</span></h3>`
          : "";
        return `<section class="pc-grupo-bloque">${cab}<ul class="pc-grid">${ordenar(grupos.get(k)).map((p) => tarjetaHTML(p, n++, fichaHref)).join("")}</ul></section>`;
      }).join("");
    };
    pintarLista();
    cont.querySelectorAll(".pc-tab").forEach((btn) => btn.addEventListener("click", () => {
      activo = btn.dataset.k;
      cont.querySelectorAll(".pc-tab").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("activo", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      pintarLista();
    }));
  }

  window.cargarPlantillaEquipo = cargarPlantillaEquipo;
})();
