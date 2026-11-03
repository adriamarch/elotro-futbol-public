// Plantilla de un club: SOLO la plantilla completa con los datos de Flashscore
// (js/plantilla-lp.js). Las estadísticas de la redacción ya no se muestran aquí;
// /api/stats/club solo se usa para la cabecera (club, escudo, competición, grupo)
// y el selector de clubes.
const COMPETICIONES_PLANTILLA = {
  hypermotion: "LaLiga Hypermotion",
  primera_federacion: "Primera Federación",
  segunda_federacion: "Segunda Federación",
};
const PARAMS_PL = new URLSearchParams(location.search);
const COMP_PL = COMPETICIONES_PLANTILLA[PARAMS_PL.get("c")] ? PARAMS_PL.get("c") : "hypermotion";
let clubPl = (PARAMS_PL.get("club") || "").slice(0, 120);
const temporadaPl = ""; // sin histórico: la plantilla de Flashscore es la de la temporada en curso
let DATOS_PL = null;
let LP_DOC = null; // plantilla completa de Flashscore (opcional, ver plantilla-lp.js)
let peticionPl = 0;
const REFRESCO_PL_MS = 120000;

const contPl = document.getElementById("plantillaCont");
const notaPl = document.getElementById("plantillaNota");
const selClubPl = document.getElementById("plantillaClub");
document.getElementById("plantillaVolver").href = `${baseHref()}estadisticas?c=${encodeURIComponent(COMP_PL)}${clubPl ? "&club=" + encodeURIComponent(clubPl) : ""}${temporadaPl ? "&temp=todas" : ""}`;

fijarSeoBasico({
  titulo: `${clubPl || "Plantilla"} — plantilla — ELOTROFÚTBOLTV`,
  descripcion: `Plantilla completa de ${clubPl || "cada club"}: jugadores, edades, partidos, minutos, goles y tarjetas.`,
  urlPath: rutaCanonicaPl(),
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

function pintarPlantilla() {
  const d = DATOS_PL;
  if (!d) return;
  const compNombre = COMPETICIONES_PLANTILLA[d.competicion] || "";
  fijarSeoBasico({
    titulo: `${d.club} — plantilla — ELOTROFÚTBOLTV`,
    descripcion: `Plantilla completa de ${d.club}${compNombre ? " en " + compNombre : ""}: jugadores, edades, partidos, minutos, goles y tarjetas.`,
    urlPath: rutaCanonicaPl(),
  });
  // Por si una versión anterior de la página dejó un noindex puesto.
  const metaRobotsPl = document.querySelector('meta[name="robots"]');
  if (metaRobotsPl && /noindex/.test(metaRobotsPl.content)) metaRobotsPl.remove();
  if (!LP_DOC) {
    contPl.innerHTML = estadoHTML({
      titulo: "Plantilla no disponible",
      texto: "Todavía no tenemos la plantilla de este club.",
    });
    notaPl.hidden = true;
    return;
  }
  contPl.innerHTML = `
    <header class="plantilla-cabecera">
      <img class="plantilla-escudo" src="${getEscudoUrl(d.club, d.escudo_url)}" alt="Escudo de ${escapeHtml(d.club)}" onerror="manejarErrorEscudo(this);">
      <div>
        <h1>${escapeHtml(d.club)}</h1>
        <p class="plantilla-sub">${[compNombre, d.grupo, LP_DOC.temporada].filter(Boolean).map(escapeHtml).join(" · ")} · <a href="${enlaceEquipoHref(d.club, d.competicion)}">Ver noticias del club</a></p>
      </div>
    </header>
    ${lpHtmlPlantilla(LP_DOC, [], fichaHref, { sinTitulo: false })}`;
  notaPl.hidden = true;
}

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
// Buscador de jugadores y clubes (Fase 3): busca en la competición y temporada de esta plantilla.
const buscadorJugadores = iniciarBuscadorJugadores({
  contenedor: document.getElementById("buscadorJugadores"),
  competicion: () => COMP_PL,
  temporada: () => temporadaPl,
});

cargarPlantilla();
setInterval(() => { if (document.visibilityState === "visible") cargarPlantilla(true); }, REFRESCO_PL_MS);
