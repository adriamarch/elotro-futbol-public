// Plantilla de un club: todos sus jugadores con ficha, totales del equipo y
// su top 3. Datos de GET /api/stats/club (mismos cálculos y correcciones
// manuales que los tops de /estadisticas).
const COMPETICIONES_PLANTILLA = {
  hypermotion: "LaLiga Hypermotion",
  primera_federacion: "Primera Federación",
  segunda_federacion: "Segunda Federación",
};
const PARAMS_PL = new URLSearchParams(location.search);
const COMP_PL = COMPETICIONES_PLANTILLA[PARAMS_PL.get("c")] ? PARAMS_PL.get("c") : "hypermotion";
let clubPl = (PARAMS_PL.get("club") || "").slice(0, 120);
let temporadaPl = PARAMS_PL.get("temp") === "todas" ? "todas" : "";
let DATOS_PL = null;
let LP_DOC = null; // plantilla completa de LaPreferente (opcional, ver plantilla-lp.js)
let ordenPl = { col: "dorsal", asc: true };
let peticionPl = 0;
const REFRESCO_PL_MS = 120000;

const contPl = document.getElementById("plantillaCont");
const notaPl = document.getElementById("plantillaNota");
const selClubPl = document.getElementById("plantillaClub");
const selTempPl = document.getElementById("plantillaTemporada");
selTempPl.value = temporadaPl;
document.getElementById("plantillaVolver").href = `${baseHref()}estadisticas?c=${encodeURIComponent(COMP_PL)}${clubPl ? "&club=" + encodeURIComponent(clubPl) : ""}${temporadaPl ? "&temp=todas" : ""}`;

fijarSeoBasico({
  titulo: `${clubPl || "Plantilla"} — plantilla y estadísticas — ELOTROFÚTBOLTV`,
  descripcion: `Plantilla de ${clubPl || "cada club"}: goles, asistencias, tarjetas, MVP y partidos de sus jugadores, calculados con el minuto a minuto.`,
  urlPath: rutaCanonicaPl(),
  noindex: !!temporadaPl, // el histórico acumulado no se indexa: la canónica es la temporada en curso
});

// Dirección canónica de la plantilla: sin parámetros de más (temp, orden...) para no duplicar páginas.
function rutaCanonicaPl() {
  return clubPl ? `/plantilla?c=${encodeURIComponent(COMP_PL)}&club=${encodeURIComponent(clubPl)}` : "/plantilla";
}

function urlPlantilla() {
  const p = new URLSearchParams({ c: COMP_PL, club: clubPl });
  if (temporadaPl) p.set("temp", temporadaPl);
  return `${location.pathname}?${p.toString()}`;
}

function fichaHref(j) {
  return `${baseHref()}jugador?c=${encodeURIComponent(COMP_PL)}&j=${encodeURIComponent(j.slug)}&t=goleadores${temporadaPl ? "&temp=todas" : ""}`;
}

const COLUMNAS_PL = [
  { col: "dorsal", et: "#", titulo: "Dorsal", valor: (j) => j.dorsal, num: true },
  { col: "jugador", et: "Jugador", titulo: "Jugador", valor: (j) => String(j.jugador || "").toLowerCase() },
  { col: "partidos", et: "PJ", titulo: "Partidos con alineación registrada", valor: (j) => j.partidos, num: true },
  { col: "titular", et: "Tit.", titulo: "Partidos de titular", valor: (j) => j.titular, num: true },
  { col: "goles", et: "G", titulo: "Goles", valor: (j) => j.goles, num: true },
  { col: "asistencias", et: "A", titulo: "Asistencias", valor: (j) => j.asistencias, num: true },
  { col: "amarillas", et: "🟨", titulo: "Tarjetas amarillas", valor: (j) => j.amarillas, num: true },
  { col: "rojas", et: "🟥", titulo: "Expulsiones (roja o doble amarilla)", valor: (j) => j.rojas + j.dobles, num: true },
  { col: "mvps", et: "MVP", titulo: "Veces elegido MVP del partido", valor: (j) => j.mvps, num: true },
];

function ordenar(lista) {
  const c = COLUMNAS_PL.find((x) => x.col === ordenPl.col) || COLUMNAS_PL[0];
  const dir = ordenPl.asc ? 1 : -1;
  return [...lista].sort((a, b) => {
    const va = c.valor(a), vb = c.valor(b);
    // Los vacíos (dorsal desconocido) siempre al final.
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return String(a.jugador).localeCompare(String(b.jugador), "es");
  });
}

function topLista(titulo, lista, campo) {
  const filas = (lista || []).filter((f) => f[campo] > 0);
  if (!filas.length) return "";
  return `
    <div class="plantilla-top">
      <h2>${titulo}</h2>
      <ol>${filas.map((f) => `<li>${f.dorsal !== null && f.dorsal !== undefined ? `<span class="stats-dorsal">${f.dorsal}</span>` : ""}<a href="${fichaHref(f)}">${escapeHtml(f.jugador)}</a><b>${f[campo]}</b></li>`).join("")}</ol>
    </div>`;
}

function pintarPlantilla() {
  const d = DATOS_PL;
  if (!d) return;
  const compNombre = COMPETICIONES_PLANTILLA[d.competicion] || "";
  const periodo = d.temporada === "todas" ? "Histórico acumulado" : "Temporada en curso";
  fijarSeoBasico({
    titulo: `${d.club} — plantilla y estadísticas — ELOTROFÚTBOLTV`,
    descripcion: `Plantilla de ${d.club}${compNombre ? " en " + compNombre : ""}: ${d.totales.goles} goles, ${d.totales.asistencias} asistencias y ${d.totales.amarillas} amarillas de sus jugadores.`,
    urlPath: rutaCanonicaPl(),
  noindex: !!temporadaPl, // el histórico acumulado no se indexa: la canónica es la temporada en curso
  });
  // Si se vuelve de «histórico» a «temporada en curso» hay que quitar el noindex que puso la vista anterior.
  const metaRobotsPl = document.querySelector('meta[name="robots"]');
  if (!temporadaPl && metaRobotsPl && /noindex/.test(metaRobotsPl.content)) metaRobotsPl.remove();
  const hayRed = d.jugadores.length > 0;
  if (!hayRed && !LP_DOC) {
    contPl.innerHTML = estadoHTML({
      titulo: "Sin jugadores todavía",
      texto: "Aún no hay goles, tarjetas ni alineaciones registradas de este club con estos filtros.",
    });
    notaPl.hidden = true;
    return;
  }
  const cab = COLUMNAS_PL.map((c) => {
    const activa = ordenPl.col === c.col;
    return `<th class="orden${c.num ? " num" : ""}" data-col="${c.col}" title="${c.titulo}" tabindex="0"${activa ? ` aria-sort="${ordenPl.asc ? "ascending" : "descending"}"` : ""}>${c.et}</th>`;
  }).join("");
  const cuerpo = ordenar(d.jugadores).map((j) => `
    <tr>
      <td class="num">${j.dorsal !== null && j.dorsal !== undefined ? `<span class="stats-dorsal">${j.dorsal}</span>` : "—"}</td>
      <td class="col-jugador"><a class="stats-jugador-nombre${j.sin_nombre ? " stats-sin-nombre" : ""}" href="${fichaHref(j)}">${escapeHtml(j.jugador)}</a></td>
      <td class="num">${j.partidos}</td><td class="num">${j.titular}</td>
      <td class="num col-puntos">${j.goles}</td><td class="num">${j.asistencias}</td>
      <td class="num">${j.amarillas}</td><td class="num">${j.rojas + j.dobles}</td><td class="num">${j.mvps}</td>
    </tr>`).join("");

  contPl.innerHTML = `
    <header class="plantilla-cabecera">
      <img class="plantilla-escudo" src="${getEscudoUrl(d.club, d.escudo_url)}" alt="Escudo de ${escapeHtml(d.club)}" onerror="manejarErrorEscudo(this);">
      <div>
        <h1>${escapeHtml(d.club)}</h1>
        <p class="plantilla-sub">${[compNombre, d.grupo, periodo].filter(Boolean).map(escapeHtml).join(" · ")} · <a href="${enlaceEquipoHref(d.club, d.competicion)}">Ver noticias del club</a></p>
      </div>
    </header>
    ${hayRed ? `<section class="plantilla-resumen" aria-label="Resumen del equipo">
      <div class="plantilla-dato"><strong>${d.partidos_equipo}</strong><span>Partidos</span></div>
      <div class="plantilla-dato"><strong>${d.totales.goles}</strong><span>Goles</span></div>
      <div class="plantilla-dato"><strong>${d.totales.asistencias}</strong><span>Asistencias</span></div>
      <div class="plantilla-dato"><strong>${d.totales.amarillas}</strong><span>Amarillas</span></div>
      <div class="plantilla-dato"><strong>${d.totales.expulsiones}</strong><span>Expulsiones</span></div>
    </section>
    <section class="plantilla-tops">
      ${topLista("⚽ Máximos goleadores", d.goleadores, "goles")}
      ${topLista("🅰️ Máximos asistentes", d.asistentes, "asistencias")}
    </section>
    <div class="clasificacion-tabla-wrap">
      <table class="clasificacion-tabla stats-tabla plantilla-tabla">
        <thead><tr>${cab}</tr></thead>
        <tbody>${cuerpo}</tbody>
      </table>
    </div>` : ""}
    ${lpHtmlPlantilla(LP_DOC, d.jugadores, fichaHref)}`;
  const notaRed = "Calculado automáticamente con el minuto a minuto, las alineaciones y los MVP de los partidos cubiertos por la redacción. Pulsa en una columna para ordenar.";
  const notaLP = "La plantilla completa procede de una fuente externa y no se mezcla con esos cálculos.";
  notaPl.textContent = hayRed ? (LP_DOC ? `${notaRed} ${notaLP}` : notaRed) : "Todavía no hay estadísticas de la redacción para este club. " + notaLP;
  notaPl.hidden = false;
}

contPl.addEventListener("click", (e) => {
  const th = e.target.closest("th[data-col]");
  if (!th) return;
  const col = th.dataset.col;
  ordenPl = { col, asc: ordenPl.col === col ? !ordenPl.asc : (col === "dorsal" || col === "jugador") };
  pintarPlantilla();
});
contPl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const th = e.target.closest("th[data-col]");
  if (th) { e.preventDefault(); th.click(); }
});

function poblarClubesPl(clubes) {
  const lista = (clubes || []).filter(Boolean);
  if (clubPl && !lista.includes(clubPl)) lista.unshift(clubPl);
  selClubPl.innerHTML = lista.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  selClubPl.value = clubPl;
}

async function cargarPlantilla(silencioso = false) {
  if (!clubPl) {
    contPl.innerHTML = estadoHTML({
      titulo: "Elige un club",
      texto: "El enlace no indica ningún club. Elígelo desde las estadísticas.",
      tipo: "error",
      cta: `<a href="${baseHref()}estadisticas" class="btn-volver">Ir a estadísticas</a>`,
    });
    return;
  }
  const id = ++peticionPl;
  if (!silencioso) contPl.innerHTML = spinnerHTML();
  try {
    const params = new URLSearchParams({ competicion: COMP_PL, club: clubPl });
    if (temporadaPl) params.set("temporada", temporadaPl);
    const lpPromesa = lpCargarPlantilla(clubPl); // opcional: nunca lanza, devuelve null si no hay datos
    const datos = await conReintento(() => apiFetch(`/api/stats/club?${params.toString()}`).then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }));
    const lp = await lpPromesa;
    if (id !== peticionPl) return;
    DATOS_PL = datos;
    LP_DOC = lp;
    poblarClubesPl(datos.clubes);
    pintarPlantilla();
  } catch (err) {
    if (id !== peticionPl || silencioso) return;
    contPl.innerHTML = estadoHTML({
      titulo: "No se ha podido conectar",
      texto: "Ha habido un problema al cargar la plantilla. Comprueba tu conexión e inténtalo de nuevo.",
      tipo: "error",
      cta: `<a href="javascript:location.reload()" class="btn-volver">Reintentar</a>`,
    });
  }
}

selClubPl.addEventListener("change", () => {
  clubPl = selClubPl.value;
  history.replaceState(null, "", urlPlantilla());
  cargarPlantilla();
});
selTempPl.addEventListener("change", () => {
  temporadaPl = selTempPl.value;
  history.replaceState(null, "", urlPlantilla());
  cargarPlantilla();
  if (buscadorJugadores) buscadorJugadores.actualizar();
});

// Buscador de jugadores y clubes (Fase 3): busca en la competición y temporada de esta plantilla.
const buscadorJugadores = iniciarBuscadorJugadores({
  contenedor: document.getElementById("buscadorJugadores"),
  competicion: () => COMP_PL,
  temporada: () => temporadaPl,
});

cargarPlantilla();
setInterval(() => { if (document.visibilityState === "visible") cargarPlantilla(true); }, REFRESCO_PL_MS);
