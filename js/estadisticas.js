// Estadísticas de jugadores: goleadores, asistentes, tarjetas, MVP y partidos.
// Los datos salen de GET /api/stats/jugadores, que los calcula con el
// minuto a minuto (match_events), las alineaciones y el MVP de cada partido.
fijarSeoBasico({
  titulo: "Estadísticas de jugadores — ELOTROFÚTBOLTV",
  descripcion: "Máximos goleadores, asistentes, MVP y jugadores más sancionados de LaLiga Hypermotion, Primera y Segunda Federación, calculados con el minuto a minuto.",
  urlPath: "/estadisticas",
});

// ?c=segunda_federacion&t=asistentes&club=...&temp=todas: la ficha del jugador
// vuelve aquí con los mismos filtros con los que se llegó.
const PARAMS_URL = new URLSearchParams(location.search);
const COMPETICIONES_VALIDAS = ["hypermotion", "primera_federacion", "segunda_federacion"];
const TIPOS_VALIDOS = ["goleadores", "asistentes", "participacion", "tarjetas", "mvps", "mas_partidos"];
let competicionActual = COMPETICIONES_VALIDAS.includes(PARAMS_URL.get("c")) ? PARAMS_URL.get("c") : "hypermotion";
let grupoActual = "";
let clubActual = (PARAMS_URL.get("club") || "").slice(0, 120);
let temporadaActual = PARAMS_URL.get("temp") === "todas" ? "todas" : "";
let tipoActual = TIPOS_VALIDOS.includes(PARAMS_URL.get("t")) ? PARAMS_URL.get("t") : "goleadores";
const TOP_MAX = 10;
// Se actualiza solo: cada 2 minutos (lo que tarda en caducar la caché del
// servidor) se vuelven a pedir los datos en silencio si la pestaña está visible.
const REFRESCO_AUTOMATICO_MS = 120000;

let DATOS_ESTADISTICAS = null;
let peticionEnCurso = 0;

const selectGrupo = document.getElementById("filtroGrupo");
const selectClub = document.getElementById("filtroClub");
const selectTemporada = document.getElementById("filtroTemporada");
const enlacePlantilla = document.getElementById("enlacePlantilla");
const contEstadisticas = document.getElementById("estadisticasCont");
const notaEstadisticas = document.getElementById("statsNota");

selectTemporada.value = temporadaActual;
document.querySelectorAll("#filtrosCompeticion button[data-cat]").forEach((b) => b.classList.toggle("activo", b.dataset.cat === competicionActual));
document.querySelectorAll("#filtrosTipo button[data-tipo]").forEach((b) => {
  const activo = b.dataset.tipo === tipoActual;
  b.classList.toggle("activo", activo);
  b.setAttribute("aria-selected", activo ? "true" : "false");
});

// Deja la URL con los filtros actuales (sin recargar) para poder compartirla.
function sincronizarUrl() {
  const p = new URLSearchParams();
  p.set("c", competicionActual);
  if (tipoActual !== "goleadores") p.set("t", tipoActual);
  if (clubActual) p.set("club", clubActual);
  if (temporadaActual) p.set("temp", temporadaActual);
  if (window.history && history.replaceState) history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
}

document.querySelectorAll("#filtrosCompeticion button[data-cat]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#filtrosCompeticion button").forEach((b) => b.classList.remove("activo"));
    btn.classList.add("activo");
    competicionActual = btn.dataset.cat;
    grupoActual = "";
    clubActual = "";
    cargarEstadisticas();
  });
});

document.querySelectorAll("#filtrosTipo button[data-tipo]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#filtrosTipo button").forEach((b) => {
      b.classList.remove("activo");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("activo");
    btn.setAttribute("aria-selected", "true");
    tipoActual = btn.dataset.tipo;
    sincronizarUrl();
    pintarEstadisticas();
  });
});

selectGrupo.addEventListener("change", () => {
  grupoActual = selectGrupo.value;
  clubActual = "";
  cargarEstadisticas();
});
selectClub.addEventListener("change", () => {
  clubActual = selectClub.value;
  cargarEstadisticas();
});
selectTemporada.addEventListener("change", () => {
  temporadaActual = selectTemporada.value;
  cargarEstadisticas();
});

// Los grupos se redibujan con la lista completa que devuelve el servidor
// (que no depende del grupo elegido) conservando la selección.
function poblarGrupos(grupos) {
  const lista = (grupos || []).filter(Boolean).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  if (!lista.length) {
    selectGrupo.hidden = true;
    selectGrupo.innerHTML = "";
    return;
  }
  selectGrupo.innerHTML = `<option value="">Todos los grupos</option>`
    + lista.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
  selectGrupo.value = lista.includes(grupoActual) ? grupoActual : "";
  selectGrupo.hidden = false;
}

function poblarClubes(clubes) {
  const lista = (clubes || []).filter(Boolean);
  // Si el club de la URL no está en la lista (otra competición), se descarta.
  if (clubActual && !lista.includes(clubActual)) clubActual = "";
  selectClub.innerHTML = `<option value="">Todos los clubes</option>`
    + lista.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  selectClub.value = clubActual;
  actualizarEnlacePlantilla();
}

function actualizarEnlacePlantilla() {
  if (!clubActual) { enlacePlantilla.hidden = true; return; }
  const p = new URLSearchParams({ c: competicionActual, club: clubActual });
  if (temporadaActual) p.set("temp", temporadaActual);
  enlacePlantilla.href = `${baseHref()}plantilla?${p.toString()}`;
  enlacePlantilla.hidden = false;
}

async function cargarEstadisticas(silencioso = false) {
  const id = ++peticionEnCurso;
  if (!silencioso) {
    contEstadisticas.innerHTML = esqueletoEstadisticasHTML();
    notaEstadisticas.hidden = true;
  }
  try {
    const params = new URLSearchParams({ competicion: competicionActual, limit: String(TOP_MAX) });
    if (grupoActual) params.set("grupo", grupoActual);
    if (clubActual) params.set("club", clubActual);
    if (temporadaActual) params.set("temporada", temporadaActual);
    const datos = await conReintento(() => apiFetch(`/api/stats/jugadores?${params.toString()}`).then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }));
    if (id !== peticionEnCurso) return; // llegó tarde: ya se pidió otra cosa
    DATOS_ESTADISTICAS = datos;
    if (!silencioso && buscadorJugadores) buscadorJugadores.actualizar();
    poblarGrupos(datos.grupos);
    poblarClubes(datos.clubes);
    sincronizarUrl();
    pintarEstadisticas();
  } catch (err) {
    if (id !== peticionEnCurso) return;
    if (silencioso) return; // un refresco automático fallido no debe tapar lo ya pintado
    contEstadisticas.innerHTML = estadoHTML({
      titulo: "No se ha podido conectar",
      texto: "Ha habido un problema al cargar las estadísticas. Comprueba tu conexión e inténtalo de nuevo.",
      tipo: "error",
      cta: `<a href="javascript:location.reload()" class="btn-volver">Reintentar</a>`,
    });
  }
}

function fichaJugadorHref(f) {
  const p = new URLSearchParams({ c: competicionActual, j: f.slug, t: tipoActual });
  // Con «histórico acumulado» la ficha tiene que abrirse también en histórico, o un jugador de otra temporada daría 404.
  if (temporadaActual) p.set("temp", temporadaActual);
  return `${baseHref()}jugador?${p.toString()}`;
}

function celdaJugador(f) {
  const dorsal = f.dorsal !== null && f.dorsal !== undefined ? `<span class="stats-dorsal">${f.dorsal}</span>` : "";
  return `
    <td class="col-equipo col-jugador">
      <span class="stats-jugador">
        ${dorsal}
        <a class="stats-jugador-nombre${f.sin_nombre ? " stats-sin-nombre" : ""}" href="${fichaJugadorHref(f)}"${f.sin_nombre ? ` title="El redactor solo escribió el dorsal en el minuto a minuto"` : ""}>${escapeHtml(f.jugador)}</a>
      </span>
    </td>
    <td class="col-club">
      <a class="equipo-enlace" title="${escapeHtml(f.club)}" href="${enlaceEquipoHref(f.club, competicionActual)}">
        <img class="clas-escudo" src="${getEscudoUrl(f.club, f.escudo_url)}" alt="" loading="lazy" onerror="manejarErrorEscudo(this);">
        <span>${escapeHtml(f.club)}</span>
      </a>
    </td>`;
}

const CONFIG_TABLAS = {
  goleadores: {
    valor: (f) => f.goles,
    unidad: "goles",
    vacio: "Todavía no hay goles registrados en el minuto a minuto con estos filtros.",
    cabecera: `<th title="Goles">Goles</th><th title="Asistencias">Asist.</th>`,
    celdas: (f) => `<td class="col-puntos">${f.goles}</td><td>${f.asistencias}</td>`,
  },
  asistentes: {
    valor: (f) => f.asistencias,
    unidad: "asistencias",
    vacio: "Todavía no hay asistencias registradas en el minuto a minuto con estos filtros.",
    cabecera: `<th title="Asistencias">Asist.</th><th title="Goles">Goles</th>`,
    celdas: (f) => `<td class="col-puntos">${f.asistencias}</td><td>${f.goles}</td>`,
  },
  participacion: {
    valor: (f) => f.participacion,
    unidad: "G+A",
    vacio: "Todavía no hay goles ni asistencias registrados en el minuto a minuto con estos filtros.",
    cabecera: `<th title="Goles más asistencias">G+A</th><th title="Goles">Goles</th><th title="Asistencias">Asist.</th>`,
    celdas: (f) => `<td class="col-puntos">${f.participacion}</td><td>${f.goles}</td><td>${f.asistencias}</td>`,
  },
  tarjetas: {
    valor: (f) => f.tarjetas,
    unidad: "tarjetas",
    vacio: "Todavía no hay tarjetas registradas en el minuto a minuto con estos filtros.",
    cabecera: `<th title="Tarjetas amarillas">🟨</th><th title="Expulsiones por doble amarilla">🟨🟥</th><th title="Tarjetas rojas directas">🟥</th><th title="Total de tarjetas">Total</th>`,
    celdas: (f) => `<td>${f.amarillas}</td><td>${f.dobles}</td><td>${f.rojas}</td><td class="col-puntos">${f.tarjetas}</td>`,
  },
  mvps: {
    valor: (f) => f.mvps,
    unidad: "MVP",
    vacio: "Todavía no se ha marcado ningún MVP de partido con estos filtros.",
    cabecera: `<th title="Veces elegido MVP del partido">MVP</th><th title="Goles">Goles</th>`,
    celdas: (f) => `<td class="col-puntos">${f.mvps}</td><td>${f.goles}</td>`,
    nota: "El MVP lo elige la redacción en cada partido.",
  },
  mas_partidos: {
    valor: (f) => f.partidos,
    unidad: "partidos",
    vacio: "Todavía no hay alineaciones registradas con estos filtros.",
    cabecera: `<th title="Partidos con alineación registrada">PJ</th><th title="Partidos de titular">Tit.</th><th title="Partidos de suplente">Sup.</th>`,
    celdas: (f) => `<td class="col-puntos">${f.partidos}</td><td>${f.titular}</td><td>${f.suplente}</td>`,
    nota: "Solo cuentan los partidos con alineación registrada por la redacción.",
  },
};

// Esqueleto de carga: mismo aspecto que el podio y la tabla, sin saltos al llegar los datos.
function esqueletoEstadisticasHTML() {
  const podio = [2, 1, 3].map((n) => `<li class="stats-podio-item stats-podio-${n} stats-esq"><span class="stats-esq-bloque"></span></li>`).join("");
  const filas = Array.from({ length: 6 }, () => `<div class="stats-esq-fila"><span></span><span></span><span></span></div>`).join("");
  return `<div class="stats-esqueleto" role="status" aria-label="Cargando estadísticas"><ol class="stats-podio">${podio}</ol><div class="stats-esq-tabla">${filas}</div></div>`;
}

// Podio con los tres primeros (solo si hay al menos tres).
function podioHTML(filas, cfg) {
  if (filas.length < 3) return "";
  const items = filas.slice(0, 3).map((f, i) => {
    const n = i + 1;
    const dorsal = f.dorsal !== null && f.dorsal !== undefined ? `<span class="stats-podio-dorsal">${f.dorsal}</span>` : "";
    return `
      <li class="stats-podio-item stats-podio-${n}">
        <span class="stats-podio-medalla" aria-label="Puesto ${f.pos}">${f.pos}</span>
        <span class="stats-podio-escudo"><img class="clas-escudo" src="${getEscudoUrl(f.club, f.escudo_url)}" alt="" loading="lazy" onerror="manejarErrorEscudo(this);"></span>
        <a class="stats-podio-nombre${f.sin_nombre ? " stats-sin-nombre" : ""}" href="${fichaJugadorHref(f)}">${dorsal}${escapeHtml(f.jugador)}</a>
        <a class="stats-podio-club" href="${enlaceEquipoHref(f.club, competicionActual)}">${escapeHtml(f.club)}</a>
        <span class="stats-podio-valor"><b>${cfg.valor(f)}</b><small>${cfg.unidad}</small></span>
      </li>`;
  }).join("");
  return `<ol class="stats-podio" aria-label="Los tres primeros">${items}</ol>`;
}

function pintarEstadisticas() {
  if (!DATOS_ESTADISTICAS) return;
  const cfg = CONFIG_TABLAS[tipoActual];
  const filas = (DATOS_ESTADISTICAS[tipoActual] || []).slice(0, TOP_MAX); // nunca más de 10
  if (!filas.length) {
    contEstadisticas.innerHTML = estadoHTML({ titulo: "Sin datos todavía", texto: cfg.vacio });
    notaEstadisticas.hidden = true;
    return;
  }
  const maximo = Math.max(...filas.map((f) => Number(cfg.valor(f)) || 0), 0);
  const pct = (f) => (maximo > 0 ? Math.max(6, Math.round(((Number(cfg.valor(f)) || 0) / maximo) * 100)) : 0);
  const cuerpo = filas.map((f) => `
    <tr class="${f.pos <= 3 ? `stats-top-${f.pos}` : ""}" style="--pct:${pct(f)}%">
      <td class="col-pos"><span class="clas-pos">${f.pos}</span></td>
      ${celdaJugador(f)}
      ${cfg.celdas(f)}
    </tr>`).join("");
  contEstadisticas.innerHTML = `
    ${podioHTML(filas, cfg)}
    <div class="clasificacion-tabla-wrap">
      <table class="clasificacion-tabla stats-tabla">
        <thead>
          <tr>
            <th title="Posición">#</th>
            <th class="col-equipo">Jugador</th>
            <th class="col-club">Equipo</th>
            ${cfg.cabecera}
          </tr>
        </thead>
        <tbody>${cuerpo}</tbody>
      </table>
    </div>`;

  const periodo = DATOS_ESTADISTICAS.temporada === "todas" ? "histórico acumulado" : "temporada en curso";
  const partes = [`Top 10 · ${periodo}${clubActual ? " · " + clubActual : ""}, calculado automáticamente con el minuto a minuto de los partidos cubiertos por la redacción.`];
  if (cfg.nota) partes.push(cfg.nota);
  if (DATOS_ESTADISTICAS.sin_resolver > 0) {
    partes.push("Algunos eventos solo llevan el dorsal del jugador y aparecen como «Dorsal N» hasta que se complete el nombre.");
  }
  notaEstadisticas.textContent = partes.join(" ");
  notaEstadisticas.hidden = false;
}

// Buscador de jugadores y clubes (Fase 3): busca en la competición y temporada que se están viendo.
const buscadorJugadores = iniciarBuscadorJugadores({
  contenedor: document.getElementById("buscadorJugadores"),
  competicion: () => competicionActual,
  temporada: () => temporadaActual,
});

cargarEstadisticas();
setInterval(() => { if (document.visibilityState === "visible") cargarEstadisticas(true); }, REFRESCO_AUTOMATICO_MS);
