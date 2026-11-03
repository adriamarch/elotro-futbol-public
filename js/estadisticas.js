// Estadísticas de jugadores: goleadores, asistentes, tarjetas, minutos y partidos.
// REGLA: todo sale de Flashscore. Los datos son /data/estadisticas/{competicion}.json,
// que agrega herramientas/flashscore/estadisticas.py a partir de las plantillas de
// Flashscore (workflow «Actualizar jugadores»). Los tops se calculan aquí, en el
// navegador, con los filtros de grupo y club. Ya no se usa el minuto a minuto.
fijarSeoBasico({
  titulo: "Estadísticas de jugadores: goleadores y asistentes — ELOTROFÚTBOLTV",
  descripcion: "Top 10 de máximos goleadores, asistentes y jugadores más sancionados de LaLiga Hypermotion, Primera y Segunda Federación, con datos de Flashscore.",
  urlPath: "/estadisticas",
  migas: [{ nombre: "Estadísticas" }],
});

// ?c=segunda_federacion&t=asistentes&club=...&temp=todas: la ficha del jugador
// vuelve aquí con los mismos filtros con los que se llegó.
const PARAMS_URL = new URLSearchParams(location.search);
const COMPETICIONES_VALIDAS = ["hypermotion", "primera_federacion", "segunda_federacion"];
const TIPOS_VALIDOS = ["goleadores", "asistentes", "participacion", "tarjetas", "mas_partidos"];
let competicionActual = COMPETICIONES_VALIDAS.includes(PARAMS_URL.get("c")) ? PARAMS_URL.get("c") : "hypermotion";
let grupoActual = "";
let clubActual = (PARAMS_URL.get("club") || "").slice(0, 120);
let tipoActual = TIPOS_VALIDOS.includes(PARAMS_URL.get("t")) ? PARAMS_URL.get("t") : "goleadores";
const TOP_MAX = 10;
// Flashscore se actualiza lunes y jueves: basta con volver a pedir el fichero cada 30 minutos.
const REFRESCO_AUTOMATICO_MS = 30 * 60 * 1000;
const URL_FLASHSCORE = /^https:\/\/(www\.)?flashscore\.(com|es)\//;
const NOMBRE_COMPETICION = { hypermotion: "LaLiga Hypermotion", primera_federacion: "Primera Federación", segunda_federacion: "Segunda Federación" };
const CACHE_COMPETICION = {};

let DATOS_ESTADISTICAS = null;
let peticionEnCurso = 0;

const selectGrupo = document.getElementById("filtroGrupo");
const selectClub = document.getElementById("filtroClub");
const enlacePlantilla = document.getElementById("enlacePlantilla");
const contEstadisticas = document.getElementById("estadisticasCont");
const notaEstadisticas = document.getElementById("statsNota");

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
  repintarFiltros();
});
selectClub.addEventListener("change", () => {
  clubActual = selectClub.value;
  repintarFiltros();
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
  enlacePlantilla.href = `${baseHref()}plantilla?${p.toString()}`;
  enlacePlantilla.hidden = false;
}

// Pide el fichero de la competición. Devuelve null si no existe (p. ej. aún no se ha generado).
async function pedirCompeticion(competicion) {
  const res = await fetch(`${baseHref()}data/estadisticas/${competicion}.json`);
  if (res.status === 404) return null;
  if (!res.ok || !/json/i.test(res.headers.get("Content-Type") || "")) throw new Error("HTTP " + res.status);
  const d = await res.json();
  if (!d || !Array.isArray(d.jugadores) || !/flashscore/i.test(String(d.fuente || ""))) return null;
  aprenderNombres(d.jugadores);
  return d;
}

async function cargarEstadisticas(silencioso = false) {
  const id = ++peticionEnCurso;
  if (!silencioso) {
    contEstadisticas.innerHTML = esqueletoEstadisticasHTML();
    notaEstadisticas.hidden = true;
  }
  try {
    const doc = await conReintento(() => pedirCompeticion(competicionActual));
    if (id !== peticionEnCurso) return; // llegó tarde: ya se pidió otra cosa
    CACHE_COMPETICION[competicionActual] = doc;
    DATOS_ESTADISTICAS = doc;
    poblarGrupos(doc ? [...new Set(doc.clubes.map((c) => c.g))] : []);
    poblarClubes(clubesVisibles(doc));
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

// Clubes del desplegable: los del grupo elegido (o todos), por orden alfabético.
function clubesVisibles(doc) {
  return ((doc && doc.clubes) || [])
    .filter((c) => !grupoActual || c.g === grupoActual)
    .map((c) => c.c);
}

// Los clubes se vuelven a pintar al cambiar de grupo, sin volver a pedir el fichero.
function repintarFiltros() {
  poblarClubes(clubesVisibles(DATOS_ESTADISTICAS));
  sincronizarUrl();
  pintarEstadisticas();
}

// Ficha propia del jugador (jugador.html), hecha con los datos de Flashscore.
function fichaJugadorHref(f) {
  const p = new URLSearchParams({ c: competicionActual, e: f.s, f: f.id, t: tipoActual });
  return `${baseHref()}jugador?${p.toString()}`;
}

// Flashscore entrega los nombres como "Apellido(s) Nombre" ("López Pedro"). Aquí se muestran como
// "Nombre Apellido(s)". No hay forma exacta de saber dónde acaba el apellido, así que se usa una
// regla: el nombre es la última palabra, o las dos últimas si forman un nombre compuesto conocido
// (José Luis, Juan Carlos...) o si ambas se ven como nombre en el resto de datos. Lo que salga mal
// se corrige añadiéndolo a NOMBRES_EXCEPCIONES ("tal como viene" -> "como debe mostrarse").
const NOMBRES_COMPUESTOS = new Set([
  "jose luis", "jose antonio", "jose manuel", "jose maria", "jose miguel", "jose carlos", "jose angel",
  "jose ramon", "jose javier", "jose david", "jose francisco", "juan carlos", "juan antonio", "juan manuel",
  "juan jose", "juan miguel", "juan luis", "juan francisco", "juan pedro", "juan ramon", "luis miguel",
  "luis alberto", "luis felipe", "miguel angel", "francisco javier", "antonio jesus", "pedro alberto",
  "carlos alberto", "jesus manuel", "angel luis", "manuel jesus", "maria jose", "pedro jose",
]);
const NOMBRES_EXCEPCIONES = {
  "Munir El Haddadi": "Munir El Haddadi",
};
const PARTICULAS_APELLIDO = new Set(["de", "del", "la", "las", "los", "van", "von", "da", "do", "di", "el", "al", "bin", "ben"]);
const quitarTildes = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// Palabras que, en nombres de dos palabras ("Apellido Nombre"), aparecen más veces detrás que delante.
const VECES_COMO_NOMBRE = new Map();
const VECES_COMO_APELLIDO = new Map();
function aprenderNombres(jugadores) {
  VECES_COMO_NOMBRE.clear();
  VECES_COMO_APELLIDO.clear();
  for (const j of jugadores || []) {
    const p = String(j && j.n || "").trim().split(/\s+/);
    if (p.length !== 2) continue;
    const a = quitarTildes(p[0]);
    const b = quitarTildes(p[1]);
    VECES_COMO_APELLIDO.set(a, (VECES_COMO_APELLIDO.get(a) || 0) + 1);
    VECES_COMO_NOMBRE.set(b, (VECES_COMO_NOMBRE.get(b) || 0) + 1);
  }
}
function pareceNombre(palabra) {
  const k = quitarTildes(palabra);
  return (VECES_COMO_NOMBRE.get(k) || 0) > (VECES_COMO_APELLIDO.get(k) || 0);
}
function nombreNombreApellido(original) {
  const txt = String(original || "").trim().replace(/\s+/g, " ");
  if (Object.prototype.hasOwnProperty.call(NOMBRES_EXCEPCIONES, txt)) return NOMBRES_EXCEPCIONES[txt];
  const p = txt.split(" ");
  if (p.length < 2) return txt;
  let k = 1;
  if (p.length >= 3) {
    const a = p[p.length - 2];
    const b = p[p.length - 1];
    const antes = quitarTildes(p[p.length - 3]);
    const compuesto = NOMBRES_COMPUESTOS.has(`${quitarTildes(a)} ${quitarTildes(b)}`) || (pareceNombre(a) && pareceNombre(b));
    // Si lo que queda delante acabaría en partícula ("de", "van"...), el apellido quedaría cortado.
    if (compuesto && !PARTICULAS_APELLIDO.has(antes)) k = 2;
  }
  return p.slice(p.length - k).concat(p.slice(0, p.length - k)).join(" ");
}

function nombreJugadorHTML(f, clase) {
  const nombre = escapeHtml(nombreNombreApellido(f.n) || "—");
  return f.id && f.s ? `<a class="${clase}" href="${fichaJugadorHref(f)}">${nombre}</a>` : `<span class="${clase}">${nombre}</span>`;
}

function celdaJugador(f) {
  const dorsal = f.d !== null && f.d !== undefined ? `<span class="stats-dorsal">${f.d}</span>` : "";
  return `
    <td class="col-equipo col-jugador">
      <span class="stats-jugador">
        ${dorsal}
        ${nombreJugadorHTML(f, "stats-jugador-nombre")}
      </span>
    </td>
    <td class="col-club">
      <a class="equipo-enlace" title="${escapeHtml(f.c)}" href="${enlaceEquipoHref(f.c, competicionActual)}">
        <img class="clas-escudo" src="${getEscudoUrl(f.c)}" alt="" loading="lazy" onerror="manejarErrorEscudo(this);">
        <span>${escapeHtml(f.c)}</span>
      </a>
    </td>`;
}

const fmtNum = (n) => Number(n || 0).toLocaleString("es-ES");

// «valor» decide el orden; «desempate» lo rompe (más goles → menos minutos, etc.).
const CONFIG_TABLAS = {
  goleadores: {
    valor: (f) => f.gol,
    desempate: (a, b) => b.as - a.as || a.min - b.min,
    unidad: "goles",
    vacio: "Todavía no hay goles en Flashscore con estos filtros.",
    cabecera: `<th title="Goles">Goles</th><th title="Asistencias">Asist.</th><th title="Partidos jugados">PJ</th>`,
    celdas: (f) => `<td class="col-puntos">${f.gol}</td><td>${f.as}</td><td>${f.pj}</td>`,
  },
  asistentes: {
    valor: (f) => f.as,
    desempate: (a, b) => b.gol - a.gol || a.min - b.min,
    unidad: "asistencias",
    vacio: "Todavía no hay asistencias en Flashscore con estos filtros.",
    cabecera: `<th title="Asistencias">Asist.</th><th title="Goles">Goles</th><th title="Partidos jugados">PJ</th>`,
    celdas: (f) => `<td class="col-puntos">${f.as}</td><td>${f.gol}</td><td>${f.pj}</td>`,
  },
  participacion: {
    valor: (f) => f.gol + f.as,
    desempate: (a, b) => b.gol - a.gol || a.min - b.min,
    unidad: "G+A",
    vacio: "Todavía no hay goles ni asistencias en Flashscore con estos filtros.",
    cabecera: `<th title="Goles más asistencias">G+A</th><th title="Goles">Goles</th><th title="Asistencias">Asist.</th>`,
    celdas: (f) => `<td class="col-puntos">${f.gol + f.as}</td><td>${f.gol}</td><td>${f.as}</td>`,
  },
  tarjetas: {
    valor: (f) => f.ta + f.tr,
    desempate: (a, b) => b.tr - a.tr || b.ta - a.ta || a.min - b.min,
    unidad: "tarjetas",
    vacio: "Todavía no hay tarjetas en Flashscore con estos filtros.",
    cabecera: `<th title="Tarjetas amarillas">🟨</th><th title="Tarjetas rojas">🟥</th><th title="Total de tarjetas">Total</th>`,
    celdas: (f) => `<td>${f.ta}</td><td>${f.tr}</td><td class="col-puntos">${f.ta + f.tr}</td>`,
  },
  mas_partidos: {
    valor: (f) => f.pj,
    desempate: (a, b) => b.min - a.min,
    unidad: "partidos",
    vacio: "Todavía no hay partidos en Flashscore con estos filtros.",
    cabecera: `<th title="Partidos jugados">PJ</th><th title="Minutos jugados">Min.</th>`,
    celdas: (f) => `<td class="col-puntos">${f.pj}</td><td>${fmtNum(f.min)}</td>`,
    nota: "Partidos y minutos de todas las competiciones del club.",
  },
};

// Aplica los filtros de grupo y club y devuelve el top ordenado, con la posición puesta.
function calcularTop(doc, cfg) {
  const lista = (doc.jugadores || []).filter((j) =>
    (!grupoActual || j.g === grupoActual) && (!clubActual || j.c === clubActual) && cfg.valor(j) > 0);
  lista.sort((a, b) => cfg.valor(b) - cfg.valor(a) || cfg.desempate(a, b) || String(a.n).localeCompare(String(b.n), "es"));
  return lista.slice(0, TOP_MAX).map((j, i) => ({ ...j, pos: i + 1 }));
}

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
    const dorsal = f.d !== null && f.d !== undefined ? `<span class="stats-podio-dorsal">${f.d}</span>` : "";
    const nombre = nombreJugadorHTML(f, "stats-podio-nombre").replace(/(<(?:a|span)[^>]*>)/, `$1${dorsal}`);
    return `
      <li class="stats-podio-item stats-podio-${n}">
        <span class="stats-podio-medalla" aria-label="Puesto ${f.pos}">${f.pos}</span>
        <span class="stats-podio-escudo"><img class="clas-escudo" src="${getEscudoUrl(f.c)}" alt="" loading="lazy" onerror="manejarErrorEscudo(this);"></span>
        ${nombre}
        <a class="stats-podio-club" href="${enlaceEquipoHref(f.c, competicionActual)}">${escapeHtml(f.c)}</a>
        <span class="stats-podio-valor"><b>${cfg.valor(f)}</b><small>${cfg.unidad}</small></span>
      </li>`;
  }).join("");
  return `<ol class="stats-podio" aria-label="Los tres primeros">${items}</ol>`;
}

function textoSinDatos(cfg) {
  // Segunda Federación: Flashscore casi no publica plantillas (README de herramientas/flashscore).
  const sinCobertura = !DATOS_ESTADISTICAS || !DATOS_ESTADISTICAS.clubes.length;
  if (!sinCobertura) return cfg.vacio;
  return `Flashscore no publica las estadísticas de los jugadores de ${NOMBRE_COMPETICION[competicionActual] || "esta competición"}, así que de momento no hay tops.`;
}

// Categorías con cobertura parcial: se avisa de cuántos clubes entran en el top.
function avisoCobertura() {
  const d = DATOS_ESTADISTICAS;
  if (!d || competicionActual !== "segunda_federacion" || !d.clubes.length) return "";
  return ` Flashscore solo publica las plantillas de ${d.clubes.length} club${d.clubes.length === 1 ? "" : "es"} de esta categoría, así que el top no la representa entera.`;
}

function pintarEstadisticas() {
  const cfg = CONFIG_TABLAS[tipoActual];
  const filas = DATOS_ESTADISTICAS ? calcularTop(DATOS_ESTADISTICAS, cfg) : [];
  if (!filas.length) {
    contEstadisticas.innerHTML = estadoHTML({ titulo: "Sin datos todavía", texto: textoSinDatos(cfg) });
    const hayClubes = !!(DATOS_ESTADISTICAS && DATOS_ESTADISTICAS.clubes.length);
    notaEstadisticas.hidden = !hayClubes;
    if (hayClubes) notaEstadisticas.textContent = notaFuente();
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
  notaEstadisticas.textContent = [notaFuente(), cfg.nota].filter(Boolean).join(" ");
  notaEstadisticas.hidden = false;
}

function notaFuente() {
  const d = DATOS_ESTADISTICAS;
  const alcance = clubActual ? ` · ${clubActual}` : (grupoActual ? ` · ${grupoActual}` : "");
  const fecha = d && d.actualizado ? ` Actualizado el ${String(d.actualizado).split("-").reverse().join("/")}.` : "";
  return `Top ${TOP_MAX} · temporada ${(d && d.temporada) || "en curso"}${alcance}. Datos no oficiales de Flashscore (suman todas las competiciones del club).${fecha}${avisoCobertura()}`;
}

cargarEstadisticas();
setInterval(() => { if (document.visibilityState === "visible") cargarEstadisticas(true); }, REFRESCO_AUTOMATICO_MS);
