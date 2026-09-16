// ---------- Sistema de Porras ----------
// Reutiliza exactamente el mismo patrón de filtros (categoría -> grupo)
// que clasificacion.html, y añade un tercer eje (jornada) como fila de
// pestañas propia. Los partidos de la jornada elegida salen de
// /api/results (igual endpoint que ya usa toda la web); las predicciones
// del lector salen de /api/porras (ver Fase 1) y se cruzan en el
// cliente por resultado_id.

let PORRAS_COMPETICION_ACTUAL = "hypermotion";
let PORRAS_GRUPO_ACTUAL = "";
let PORRAS_JORNADA_ACTUAL = null;

// Todos los partidos (todas las jornadas) de la categoría/grupo elegidos,
// cargados una vez para poder construir la fila de jornadas y saber cuál
// es "la próxima por jugar" sin tener que pedirlo aparte.
let PORRAS_PARTIDOS_CATEGORIA = [];
// Solo los partidos de la jornada actualmente seleccionada.
let PORRAS_PARTIDOS_JORNADA = [];
// Mapa resultado_id -> porra del lector para la jornada actual.
let PORRAS_MIAS = {};

// Guardado con "debounce": se espera un momento tras la última tecla
// antes de mandar la petición, para no disparar un POST por cada dígito
// si alguien teclea "2" y luego "1" para poner "21" en el input.
const PORRAS_DEBOUNCE_MS = 600;
const porrasTemporizadores = {};

function porrasFiltroGrupo() {
  return document.getElementById("filtroGrupo");
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".filtros button[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filtros button[data-cat]").forEach((b) => b.classList.remove("activo"));
      btn.classList.add("activo");
      PORRAS_COMPETICION_ACTUAL = btn.dataset.cat;
      PORRAS_GRUPO_ACTUAL = "";
      PORRAS_JORNADA_ACTUAL = null;
      cargarCategoriaPorras();
      cargarResumenTemporada();
      if (PORRAS_TAB_ACTUAL === "ranking") cargarRanking();
    });
  });
  const selectGrupo = porrasFiltroGrupo();
  if (selectGrupo) {
    selectGrupo.addEventListener("change", () => {
      PORRAS_GRUPO_ACTUAL = selectGrupo.value;
      PORRAS_JORNADA_ACTUAL = null;
      cargarCategoriaPorras();
    });
  }
  document.querySelectorAll(".porras-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".porras-tab").forEach((t) => {
        t.classList.remove("activo");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("activo");
      tab.setAttribute("aria-selected", "true");
      PORRAS_TAB_ACTUAL = tab.dataset.tab;
      document.getElementById("porrasCont").hidden = PORRAS_TAB_ACTUAL !== "jornada";
      document.getElementById("porrasRankingCont").hidden = PORRAS_TAB_ACTUAL !== "ranking";
      document.getElementById("porrasRankingAyuda").hidden = PORRAS_TAB_ACTUAL !== "ranking";
      // La fila de jornadas se muestra en ambas pestañas: en "Mi
      // jornada" para elegir qué predecir, y en "Ranking" para elegir de
      // qué jornada ya jugada quiere verse la clasificación.
      if (PORRAS_TAB_ACTUAL === "ranking") cargarRanking();
    });
  });
});

let PORRAS_TAB_ACTUAL = "jornada";

function iniciarPaginaPorras() {
  cargarCategoriaPorras();
  cargarResumenTemporada();
}

// ---------- Resumen de temporada (persistente, no depende de la
// jornada abierta) ----------
async function cargarResumenTemporada() {
  const cont = document.getElementById("porrasTemporadaCont");
  const lector = sesionLectorActual();
  if (!lector) {
    cont.innerHTML = "";
    return;
  }
  try {
    const params = new URLSearchParams({ competicion: PORRAS_COMPETICION_ACTUAL });
    const res = await apiFetchLector(`/api/porras/resumen?${params.toString()}`);
    if (!res.ok) { cont.innerHTML = ""; return; }
    const r = await res.json();
    if (!r.porras_resueltas) {
      cont.innerHTML = "";
      return;
    }
    cont.innerHTML = `
      <div class="porras-temporada">
        <div class="porras-temporada-item">
          <span class="porras-temporada-valor">${r.puntos_totales}</span>
          <span class="porras-temporada-etiqueta">Puntos esta temporada</span>
        </div>
        <div class="porras-temporada-item">
          <span class="porras-temporada-valor">${r.exactos}</span>
          <span class="porras-temporada-etiqueta">Resultados exactos</span>
        </div>
        <div class="porras-temporada-item">
          <span class="porras-temporada-valor">${r.porras_resueltas}</span>
          <span class="porras-temporada-etiqueta">Porras jugadas</span>
        </div>
      </div>`;
  } catch (err) {
    cont.innerHTML = "";
  }
}

// ---------- Ranking (por jornada terminada, no acumulado de temporada) ----------
async function cargarRanking() {
  const cont = document.getElementById("porrasRankingCont");
  if (PORRAS_JORNADA_ACTUAL === null) {
    cont.innerHTML = estadoHTML({
      titulo: "Todavía no hay ranking",
      texto: "En cuanto haya alguna jornada con partidos programados, podrás elegirla arriba para ver su ranking.",
    });
    return;
  }
  cont.innerHTML = spinnerHTML("Cargando ranking...");
  try {
    // Se manda también el grupo: en Primera y Segunda Federación la
    // jornada N de cada grupo son partidos distintos, y sin este filtro
    // el ranking mezclaba a porristas de grupos diferentes.
    const params = new URLSearchParams({ competicion: PORRAS_COMPETICION_ACTUAL, jornada: String(PORRAS_JORNADA_ACTUAL) });
    if (PORRAS_GRUPO_ACTUAL) params.set("grupo", PORRAS_GRUPO_ACTUAL);
    const lector = sesionLectorActual();
    const res = lector ? await apiFetchLector(`/api/porras/ranking?${params.toString()}`) : await apiFetch(`/api/porras/ranking?${params.toString()}`);
    const { ranking, mi_posicion, jornada_terminada, total_participantes, partidos_totales, partidos_resueltos } = await res.json();

    // Una jornada sin terminar YA muestra clasificación: la de quienes
    // han participado hasta ahora, con sus puntos provisionales. Antes
    // se devolvía un cartel de "todavía no ha terminado" y no había
    // forma de ver quién había echado su porra.
    if (!ranking || !ranking.length) {
      cont.innerHTML = estadoHTML({
        titulo: jornada_terminada ? "Todavía no hay ranking" : "Nadie ha jugado todavía",
        texto: jornada_terminada
          ? `Nadie hizo su porra en la jornada ${PORRAS_JORNADA_ACTUAL} de esta competición.`
          : `Aún no hay porras guardadas en la jornada ${PORRAS_JORNADA_ACTUAL}. En cuanto alguien haga la suya aparecerá aquí.`,
      });
      return;
    }
    // Copia local para poder leerla dentro del map de filas sin
    // depender del orden de declaración de las plantillas de abajo.
    const jornadaTerminadaTabla = jornada_terminada !== false;
    // La posición la manda el servidor (f.posicion), no el índice de la
    // fila: así los empates comparten puesto (1, 1, 3...) en vez de
    // repartirse un orden arbitrario.
    const filas = ranking.map((f) => {
      const esMio = lector && f.reader_id === Number(lector.id);
      return `
        <tr${esMio ? ' class="porras-ranking-fila-propia"' : ""}>
          <td class="col-pos">${f.posicion}</td>
          <td class="col-nombre">${escapeHtml(f.nombre)}${esMio ? " (tú)" : ""}</td>
          <td>${f.exactos}</td>
          <td>${f.aciertos}</td>
          <td>${f.fallos}</td>
          <td>${f.porras_jugadas}</td>
          ${jornadaTerminadaTabla ? "" : `<td>${f.porras_pendientes}</td>`}
          <td class="col-puntos">${f.puntos_totales}</td>
        </tr>`;
    }).join("");

    // Si el lector tiene sesión pero no aparece entre los primeros 20,
    // se añade su posición real debajo de la tabla, separada, para que
    // siempre pueda saber "dónde estoy" aunque no salga en el top.
    const fueraDelTop = mi_posicion && !ranking.some((f) => lector && f.reader_id === Number(lector.id));
    const filaPropiaFuera = fueraDelTop ? `
      <div class="porras-ranking-fuera-top">
        Vas el <strong>puesto ${mi_posicion.posicion}</strong> con <strong>${mi_posicion.puntos_totales} puntos</strong> esta jornada
        (${mi_posicion.exactos} exactos, ${mi_posicion.aciertos} aciertos, ${mi_posicion.fallos} fallos)${jornada_terminada ? "" : ", provisional"}.
      </div>` : "";

    cont.innerHTML = `
      <p class="porras-ranking-jornada-titulo">${jornada_terminada ? "Ranking" : "Clasificación provisional"} de la jornada ${PORRAS_JORNADA_ACTUAL}${PORRAS_GRUPO_ACTUAL ? " · " + escapeHtml(PORRAS_GRUPO_ACTUAL) : ""}</p>
      ${jornada_terminada ? "" : `
      <p class="porras-ranking-provisional">
        Jornada en curso: clasificación <strong>provisional</strong>${partidos_totales ? ` · ${partidos_resueltos} de ${partidos_totales} partidos resueltos` : ""}.
        Los puntos se van sumando conforme terminan los partidos.
      </p>`}
      <p class="porras-ranking-participantes">${total_participantes || ranking.length} ${(total_participantes || ranking.length) === 1 ? "participante" : "participantes"} · 3 puntos por resultado exacto, 1 por acertar el signo.</p>
      <div class="porras-ranking-tabla-wrap">
        <table class="porras-ranking-tabla">
          <thead>
            <tr>
              <th title="Posición">#</th>
              <th class="col-nombre">Porrista</th>
              <th title="Marcador exacto acertado (3 puntos)">Exactos</th>
              <th title="Signo acertado sin marcador exacto (1 punto)">Aciertos</th>
              <th title="Porras falladas (0 puntos)">Fallos</th>
              <th title="Porras jugadas">Jugadas</th>
              ${jornada_terminada ? "" : '<th title="Partidos jugados pendientes de resolver">Pend.</th>'}
              <th title="Puntos">Pts</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      ${filaPropiaFuera}`;
  } catch (err) {
    cont.innerHTML = estadoHTML({
      titulo: "No se ha podido cargar el ranking",
      texto: "Ha habido un problema de conexión. Inténtalo de nuevo en un momento.",
      tipo: "error",
    });
  }
}

// Misma regla que clasificacion.html: la temporada de fútbol europea
// arranca el 1 de julio, así se acota qué partidos son "de la temporada
// en curso" sin depender de un campo "temporada" que no existe en BD.
function porrasInicioTemporada() {
  const ahora = new Date();
  const mes = ahora.getMonth();
  const anioInicio = mes >= 6 ? ahora.getFullYear() : ahora.getFullYear() - 1;
  return `${anioInicio}-07-01`;
}

function porrasPoblarFiltroGrupo(partidos) {
  const selectGrupo = porrasFiltroGrupo();
  const grupos = [...new Set(partidos.map((p) => p.grupo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  if (!grupos.length) {
    selectGrupo.hidden = true;
    selectGrupo.innerHTML = "";
    PORRAS_GRUPO_ACTUAL = "";
    return;
  }
  selectGrupo.innerHTML = grupos.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
  if (!PORRAS_GRUPO_ACTUAL || !grupos.includes(PORRAS_GRUPO_ACTUAL)) PORRAS_GRUPO_ACTUAL = grupos[0];
  selectGrupo.value = PORRAS_GRUPO_ACTUAL;
  selectGrupo.hidden = false;
}

// ---------- Carga ----------
async function cargarCategoriaPorras() {
  const cont = document.getElementById("porrasCont");
  const nav = document.getElementById("jornadasNav");
  cont.innerHTML = spinnerHTML("Cargando partidos...");
  nav.innerHTML = "";
  try {
    const desdeFecha = porrasInicioTemporada();
    // Igual que clasificación: primero sin filtrar por grupo, para poder
    // poblar el desplegable con todos los grupos que existan.
    const paramsSinGrupo = new URLSearchParams({ competicion: PORRAS_COMPETICION_ACTUAL, desde_fecha: desdeFecha, limit: "500" });
    const { results: paraDescubrirGrupos } = await conReintento(() =>
      apiFetch(`/api/results?${paramsSinGrupo.toString()}`).then((r) => r.json())
    );
    porrasPoblarFiltroGrupo(paraDescubrirGrupos);

    if (PORRAS_GRUPO_ACTUAL) {
      const paramsConGrupo = new URLSearchParams({ competicion: PORRAS_COMPETICION_ACTUAL, grupo: PORRAS_GRUPO_ACTUAL, desde_fecha: desdeFecha, limit: "500" });
      const { results: delGrupo } = await conReintento(() =>
        apiFetch(`/api/results?${paramsConGrupo.toString()}`).then((r) => r.json())
      );
      PORRAS_PARTIDOS_CATEGORIA = delGrupo;
    } else {
      PORRAS_PARTIDOS_CATEGORIA = paraDescubrirGrupos;
    }

    pintarNavJornadas();
  } catch (err) {
    cont.innerHTML = estadoHTML({
      titulo: "No se ha podido conectar",
      texto: "Ha habido un problema al cargar los partidos. Comprueba tu conexión e inténtalo de nuevo.",
      tipo: "error",
      cta: `<a href="javascript:location.reload()" class="btn-volver">Reintentar</a>`,
    });
  }
}

// ---------- Fila de jornadas ----------
// Una jornada se considera "bloqueada del todo" (disabled) si TODOS sus
// partidos ya han empezado o terminado (en_juego/finalizado/retrasado/
// anulado) Y ninguno sigue programado: no tiene sentido dejar entrar a
// una jornada donde no queda nada por predecir. Si ya se jugó pero el
// lector quiere ver cómo le fue, sigue siendo clicable (solo cambia de
// aspecto, con borde discontinuo, ver .porras-jornada-btn.jugada).
function estadoJornada(partidosDeJornada) {
  const hayAlgunoProgramado = partidosDeJornada.some((p) => p.estado === "programado");
  // "Jugada" tiene que significar lo mismo aquí que en el Worker al
  // publicar el ranking: todos los partidos finalizados o anulados. Con
  // el criterio anterior (cualquier estado distinto de "programado")
  // una jornada con partidos en juego o retrasados salía como jugada,
  // la pestaña Ranking la elegía por defecto y el servidor respondía
  // "todavía no ha terminado".
  const todosResueltos = partidosDeJornada.length > 0
    && partidosDeJornada.every((p) => p.estado === "finalizado" || p.estado === "anulado");
  return { bloqueadaParaPredecir: !hayAlgunoProgramado, jugada: todosResueltos };
}

function pintarNavJornadas() {
  const nav = document.getElementById("jornadasNav");
  const jornadas = [...new Set(PORRAS_PARTIDOS_CATEGORIA.map((p) => p.jornada))]
    .filter((j) => j !== null && j !== undefined)
    .sort((a, b) => a - b);

  if (!jornadas.length) {
    nav.innerHTML = "";
    document.getElementById("porrasCont").innerHTML = estadoHTML({
      titulo: "Todavía no hay partidos programados",
      texto: "En cuanto se publique el calendario de esta competición podrás hacer tu porra aquí.",
    });
    return;
  }

  // Si no hay jornada elegida todavía (o la que había ya no existe en
  // esta categoría/grupo), se elige una por defecto según la pestaña
  // activa: en "Mi jornada" interesa la PRIMERA que todavía admita
  // predicción; en "Ranking" no tiene sentido ofrecer una jornada sin
  // terminar (no hay ranking que mostrar), así que se ofrece la ÚLTIMA
  // jornada ya jugada por defecto.
  if (PORRAS_JORNADA_ACTUAL === null || !jornadas.includes(PORRAS_JORNADA_ACTUAL)) {
    if (PORRAS_TAB_ACTUAL === "ranking") {
      const jornadasJugadas = jornadas.filter((j) => {
        const { jugada } = estadoJornada(PORRAS_PARTIDOS_CATEGORIA.filter((p) => p.jornada === j));
        return jugada;
      });
      PORRAS_JORNADA_ACTUAL = jornadasJugadas.length ? jornadasJugadas[jornadasJugadas.length - 1] : jornadas[jornadas.length - 1];
    } else {
      const primeraAbierta = jornadas.find((j) => {
        const { bloqueadaParaPredecir } = estadoJornada(PORRAS_PARTIDOS_CATEGORIA.filter((p) => p.jornada === j));
        return !bloqueadaParaPredecir;
      });
      PORRAS_JORNADA_ACTUAL = primeraAbierta !== undefined ? primeraAbierta : jornadas[jornadas.length - 1];
    }
  }

  nav.innerHTML = jornadas.map((j) => {
    const partidosDeJornada = PORRAS_PARTIDOS_CATEGORIA.filter((p) => p.jornada === j);
    const { bloqueadaParaPredecir, jugada } = estadoJornada(partidosDeJornada);
    const activa = j === PORRAS_JORNADA_ACTUAL;
    return `
      <button type="button" class="porras-jornada-btn${activa ? " activo" : ""}${jugada ? " jugada" : ""}"
        data-jornada="${j}" role="tab" aria-selected="${activa}"
        title="${jugada ? "Jornada finalizada: consulta tu porra" : bloqueadaParaPredecir ? "Jornada no disponible todavía" : "Jornada " + j}">
        ${jugada ? iconoCandadoAbierto() : ""}${j}
      </button>`;
  }).join("");

  nav.querySelectorAll(".porras-jornada-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      PORRAS_JORNADA_ACTUAL = parseInt(btn.dataset.jornada, 10);
      nav.querySelectorAll(".porras-jornada-btn").forEach((b) => b.classList.remove("activo"));
      btn.classList.add("activo");
      if (PORRAS_TAB_ACTUAL === "ranking") {
        cargarRanking();
      } else {
        cargarJornadaPorras();
      }
    });
  });

  if (PORRAS_TAB_ACTUAL === "ranking") {
    cargarRanking();
  } else {
    cargarJornadaPorras();
  }
}

function iconoCandadoAbierto() {
  return `<svg class="pj-candado" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.2-2.4"/></svg>`;
}
function iconoCandadoCerrado() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
}
function iconoCheck() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
}
function iconoCruz() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
}

// ---------- Partidos + porras de la jornada elegida ----------
async function cargarJornadaPorras() {
  const cont = document.getElementById("porrasCont");
  cont.innerHTML = spinnerHTML("Cargando la jornada...");

  PORRAS_PARTIDOS_JORNADA = PORRAS_PARTIDOS_CATEGORIA
    .filter((p) => p.jornada === PORRAS_JORNADA_ACTUAL)
    .sort((a, b) => (a.fecha_partido || "").localeCompare(b.fecha_partido || ""));

  const lector = sesionLectorActual();
  if (!lector) {
    PORRAS_MIAS = {};
    pintarJornadaPorras();
    return;
  }

  try {
    const params = new URLSearchParams({ competicion: PORRAS_COMPETICION_ACTUAL, jornada: String(PORRAS_JORNADA_ACTUAL) });
    if (PORRAS_GRUPO_ACTUAL) params.set("grupo", PORRAS_GRUPO_ACTUAL);
    const res = await apiFetchLector(`/api/porras?${params.toString()}`);
    if (res.status === 401) {
      // El token guardado ya no es válido (sesión cerrada en el
      // servidor, expirado...): se trata como "sin sesión" en vez de
      // dejar la página colgada con un fallo de red.
      PORRAS_MIAS = {};
      pintarJornadaPorras();
      return;
    }
    const { porras } = await res.json();
    PORRAS_MIAS = {};
    (porras || []).forEach((p) => { PORRAS_MIAS[p.resultado_id] = p; });
  } catch (err) {
    PORRAS_MIAS = {};
  }
  pintarJornadaPorras();
}

// Estado visual de la tarjeta según el estado real del partido y si ya
// hay una porra resuelta guardada.
function estadoVisualPorra(partido, miPorra) {
  if (partido.estado === "en_juego") return "en_vivo";
  if (partido.estado !== "finalizado") {
    return partido.estado === "programado" ? "abierto" : "bloqueado";
  }
  if (miPorra && miPorra.resultado_acierto && miPorra.resultado_acierto !== "pendiente") {
    return miPorra.resultado_acierto; // 'exacto' | 'acierto' | 'fallo'
  }
  return "bloqueado";
}

function pintarJornadaPorras() {
  const cont = document.getElementById("porrasCont");
  const lector = sesionLectorActual();

  if (!PORRAS_PARTIDOS_JORNADA.length) {
    cont.innerHTML = estadoHTML({
      titulo: "No hay partidos en esta jornada",
      texto: "Prueba con otra jornada del selector de arriba.",
    });
    return;
  }

  const redactorActivo = (typeof sesionActual === "function") ? sesionActual() : null;
  const avisoAcceso = !lector ? (
    redactorActivo ? `
    <div class="porras-acceso-aviso">
      <p>Como redactor, no puedes guardar tu porra cada jornada. Crea tu cuenta de lector para guardarla, ver tu resumen de temporada, aparecer en el ranking, comentar, votar en encuestas y mucho más. <strong>Es gratis y tarda un minuto.</strong></p>
      <a href="#" id="porrasIrAccesoDesdeRedactor">Inicia sesión o regístrate</a>
    </div>` : `
    <div class="porras-acceso-aviso">
      <p>Crea tu cuenta de lector para guardar tu porra de cada jornada, comentar, votar en encuestas, entrar en el ranking y mucho más. <strong>Es gratis y tarda un minuto.</strong></p>
      <a href="acceso.html?volver=${encodeURIComponent(location.pathname + location.search)}">Inicia sesión o regístrate</a>
    </div>`
  ) : "";

  const jugada = PORRAS_PARTIDOS_JORNADA.every((p) => p.estado !== "programado");
  const resumen = (lector && jugada) ? pintarResumenJornada() : "";
  const botonCompartir = (lector && PORRAS_PARTIDOS_JORNADA.some((p) => PORRAS_MIAS[p.id])) ? `
    <div class="porras-btns-imagen">
      <button type="button" class="porras-btn-compartir porras-btn-descargar" id="btnDescargarPorra">
        ${iconoDescargarPorra()}
        <span>Descargar</span>
      </button>
      <button type="button" class="porras-btn-compartir porras-btn-compartir-solo" id="btnCompartirPorra">
        ${iconoCompartirPorra()}
        <span>Compartir</span>
      </button>
    </div>` : "";

  const filas = PORRAS_PARTIDOS_JORNADA.map((partido) => tarjetaPorraHTML(partido, lector)).join("");

  // Marca de agua visible EN PANTALLA (no solo en la imagen que se
  // descarga o se comparte): no existe ninguna forma fiable de
  // interceptar una captura de pantalla del sistema operativo desde una
  // web, así que la alternativa es que la marca ya forme parte de lo
  // que se ve -- cualquier captura que alguien haga de la jornada la
  // incluye sin más. Se muestra SIEMPRE que haya partidos en la
  // jornada, con o sin predicciones hechas (no depende del lector).
  const marcaDeAguaPantalla = PORRAS_PARTIDOS_JORNADA.length ? `
    <div class="porras-marca-agua-pantalla">
      <img src="${SITE.logo}" alt="">
      <div class="porras-marca-agua-textos">
        <strong>ELOTROFÚTBOLTV</strong>
        <span>elotrofutbol.media</span>
      </div>
    </div>` : "";

  cont.innerHTML = `
    ${avisoAcceso}
    ${resumen}
    ${botonCompartir}
    <div class="porras-lista">${filas}</div>
    ${marcaDeAguaPantalla}`;

  if (lector) {
    cont.querySelectorAll(".porra-input-gol").forEach((input) => {
      input.addEventListener("input", onCambioInputPorra);
    });
    const btnDescargar = document.getElementById("btnDescargarPorra");
    if (btnDescargar) btnDescargar.addEventListener("click", () => descargarImagenPorra(lector));
    const btnCompartir = document.getElementById("btnCompartirPorra");
    if (btnCompartir) btnCompartir.addEventListener("click", () => compartirImagenPorra(lector));
  }

  // Un redactor logueado en el panel (sesión eof_token/eof_user) no
  // puede además guardar porras: son cuentas distintas a propósito (ver
  // lector-auth.js). Si pulsa "Inicia sesión o regístrate" desde el
  // aviso especial para redactores, primero se cierra su sesión de
  // redactor (localStorage.eof_token / eof_user) y luego se le lleva a
  // acceso.html a iniciar sesión o registrarse como lector -- nunca se
  // le deja avanzar con las dos sesiones mezcladas.
  const linkAccesoDesdeRedactor = document.getElementById("porrasIrAccesoDesdeRedactor");
  if (linkAccesoDesdeRedactor) {
    linkAccesoDesdeRedactor.addEventListener("click", (ev) => {
      ev.preventDefault();
      localStorage.removeItem("eof_token");
      localStorage.removeItem("eof_user");
      location.href = `acceso.html?volver=${encodeURIComponent(location.pathname + location.search)}`;
    });
  }
}

function iconoCompartirPorra() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.7l7.4-4.2M8.3 13.3l7.4 4.2"/></svg>`;
}

function iconoDescargarPorra() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M12 3v13"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/></svg>`;
}

function pintarResumenJornada() {
  const misPorrasDeLaJornada = PORRAS_PARTIDOS_JORNADA
    .map((p) => PORRAS_MIAS[p.id])
    .filter((p) => p && p.resultado_acierto && p.resultado_acierto !== "pendiente");
  if (!misPorrasDeLaJornada.length) return "";
  const puntos = misPorrasDeLaJornada.reduce((acc, p) => acc + (p.puntos_obtenidos || 0), 0);
  const exactos = misPorrasDeLaJornada.filter((p) => p.resultado_acierto === "exacto").length;
  const aciertos = misPorrasDeLaJornada.filter((p) => p.resultado_acierto === "acierto").length;
  const fallos = misPorrasDeLaJornada.filter((p) => p.resultado_acierto === "fallo").length;
  return `
    <div class="porras-resumen">
      <div class="porras-resumen-item"><span class="porras-resumen-valor">${puntos}</span><span class="porras-resumen-etiqueta">Puntos</span></div>
      <div class="porras-resumen-item"><span class="porras-resumen-valor">${exactos}</span><span class="porras-resumen-etiqueta">Resultados exactos</span></div>
      <div class="porras-resumen-item"><span class="porras-resumen-valor">${aciertos}</span><span class="porras-resumen-etiqueta">Aciertos de signo</span></div>
      <div class="porras-resumen-item"><span class="porras-resumen-valor">${fallos}</span><span class="porras-resumen-etiqueta">Fallos</span></div>
    </div>`;
}

function tarjetaPorraHTML(partido, lector) {
  const miPorra = PORRAS_MIAS[partido.id];
  const estadoVisual = estadoVisualPorra(partido, miPorra);
  const puedeEditar = partido.estado === "programado" && !!lector;
  const golesLocalValor = miPorra ? miPorra.goles_local_predicho : "";
  const golesVisitanteValor = miPorra ? miPorra.goles_visitante_predicho : "";

  const marcadorHTML = (partido.estado === "programado")
    ? `
      <input type="number" min="0" max="20" inputmode="numeric" class="porra-input-gol" data-resultado-id="${partido.id}" data-lado="local"
        value="${golesLocalValor}" ${puedeEditar ? "" : "disabled"} aria-label="Goles predichos ${escapeHtml(partido.equipo_local)}">
      <span class="porra-marcador-separador">–</span>
      <input type="number" min="0" max="20" inputmode="numeric" class="porra-input-gol" data-resultado-id="${partido.id}" data-lado="visitante"
        value="${golesVisitanteValor}" ${puedeEditar ? "" : "disabled"} aria-label="Goles predichos ${escapeHtml(partido.equipo_visitante)}">`
    : `<span class="porra-marcador-real${estadoVisual === "en_vivo" ? " porra-marcador-real-en-vivo" : ""}">${partido.goles_local ?? "–"} : ${partido.goles_visitante ?? "–"}</span>`;

  let iconoEstado = "";
  if (estadoVisual === "en_vivo") {
    // Mismo componente que .en-vivo-punto en clasificación/resultados:
    // sin candado (el partido SÍ se puede seguir, solo no se puede
    // editar la porra), con el punto rojo parpadeante como único aviso
    // de que el marcador de arriba puede cambiar en cualquier momento.
    iconoEstado = `<span class="porra-estado-icono" title="Partido en juego: ya no se puede predecir"><span class="en-vivo-punto"></span></span>`;
  } else if (estadoVisual === "bloqueado" && partido.estado !== "programado" && partido.estado !== "finalizado") {
    iconoEstado = `<span class="porra-estado-icono" title="Ya no se puede predecir">${iconoCandadoCerrado()}</span>`;
  } else if (estadoVisual === "exacto" || estadoVisual === "acierto") {
    iconoEstado = `<span class="porra-estado-icono" style="color:${estadoVisual === "exacto" ? "#2e9e57" : "#2a80ab"}" title="Predicción acertada">${iconoCheck()}</span>`;
  } else if (estadoVisual === "fallo") {
    iconoEstado = `<span class="porra-estado-icono" style="color:var(--rojo)" title="Predicción fallada">${iconoCruz()}</span>`;
  }

  const puntosBadge = (miPorra && miPorra.resultado_acierto && miPorra.resultado_acierto !== "pendiente")
    ? `<span class="porra-puntos-badge" data-tipo="${miPorra.resultado_acierto}">+${miPorra.puntos_obtenidos} pts</span>`
    : "";

  const tienePuntosAttr = puntosBadge ? " data-tiene-puntos" : "";

  return `
    <div class="porra-partido" data-estado-porra="${estadoVisual}" data-resultado-id="${partido.id}"${tienePuntosAttr}>
      <span class="porra-partido-fecha">${partido.fecha_partido ? formatFecha(partido.fecha_partido) : "Fecha por confirmar"}</span>
      <div class="porra-equipo">
        <img class="porra-escudo" src="${getEscudoUrl(partido.equipo_local, partido.escudo_local_url)}" alt="" loading="lazy" data-equipo="${escapeHtml(partido.equipo_local)}" onerror="manejarErrorEscudo(this);">
        <span class="porra-nombre-equipo">${escapeHtml(partido.equipo_local)}</span>
      </div>
      <div class="porra-marcador">${marcadorHTML}</div>
      <div class="porra-equipo porra-equipo--visitante">
        <img class="porra-escudo" src="${getEscudoUrl(partido.equipo_visitante, partido.escudo_visitante_url)}" alt="" loading="lazy" data-equipo="${escapeHtml(partido.equipo_visitante)}" onerror="manejarErrorEscudo(this);">
        <span class="porra-nombre-equipo">${escapeHtml(partido.equipo_visitante)}</span>
      </div>
      ${iconoEstado}
      ${puntosBadge}
    </div>`;
}

// ---------- Guardado automático ----------
function onCambioInputPorra(ev) {
  const input = ev.target;
  const resultadoId = input.dataset.resultadoId;
  const tarjeta = input.closest(".porra-partido");
  const inputLocal = tarjeta.querySelector('.porra-input-gol[data-lado="local"]');
  const inputVisitante = tarjeta.querySelector('.porra-input-gol[data-lado="visitante"]');

  // Solo se guarda cuando AMBOS campos tienen ya un número válido: una
  // porra a medio rellenar (solo el gol local, por ejemplo) todavía no
  // es un resultado predicho completo, así que no se manda al servidor
  // hasta que lo sea.
  const golesLocal = inputLocal.value === "" ? null : parseInt(inputLocal.value, 10);
  const golesVisitante = inputVisitante.value === "" ? null : parseInt(inputVisitante.value, 10);

  clearTimeout(porrasTemporizadores[resultadoId]);
  if (golesLocal === null || golesVisitante === null || isNaN(golesLocal) || isNaN(golesVisitante)) return;
  if (golesLocal < 0 || golesVisitante < 0) return;

  porrasTemporizadores[resultadoId] = setTimeout(async () => {
    marcarTarjetaGuardando(tarjeta, true);
    try {
      const res = await apiFetchLector("/api/porras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resultado_id: parseInt(resultadoId, 10),
          goles_local_predicho: golesLocal,
          goles_visitante_predicho: golesVisitante,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        marcarTarjetaGuardando(tarjeta, false, data.error || "No se ha podido guardar tu porra.");
        return;
      }
      PORRAS_MIAS[resultadoId] = {
        ...(PORRAS_MIAS[resultadoId] || {}),
        resultado_id: parseInt(resultadoId, 10),
        goles_local_predicho: golesLocal,
        goles_visitante_predicho: golesVisitante,
      };
      marcarTarjetaGuardando(tarjeta, false);
    } catch (err) {
      marcarTarjetaGuardando(tarjeta, false, "Sin conexión: tu porra no se ha guardado todavía.");
    }
  }, PORRAS_DEBOUNCE_MS);
}

// Pequeño indicador de guardado en la propia tarjeta (evita necesitar un
// toast global por cada partido de la jornada, que sería muy ruidoso si
// alguien rellena 10 partidos seguidos).
function marcarTarjetaGuardando(tarjeta, guardando, errorTexto) {
  tarjeta.classList.toggle("porra-guardando", guardando);
  let aviso = tarjeta.querySelector(".porra-aviso-guardado");
  if (errorTexto) {
    if (!aviso) {
      aviso = document.createElement("span");
      aviso.className = "porra-aviso-guardado";
      aviso.style.cssText = "position:absolute;bottom:-8px;left:16px;font-size:.7rem;color:var(--rojo);background:var(--fondo);padding:0 6px;";
      tarjeta.appendChild(aviso);
    }
    aviso.textContent = errorTexto;
  } else if (aviso) {
    aviso.remove();
  }
}

// ============================================================
// ---------- Fase 4: imagen de la porra + marca de agua ----------
// ============================================================
// Todo se genera en el propio navegador con <canvas>: nunca se sube la
// imagen a ningún servidor, así que no hace falta almacenamiento ni
// endpoint nuevo para esto. La marca de agua (logo + nombre del medio +
// URL) se dibuja SIEMPRE como parte del propio canvas, no como una capa
// que se pueda quitar recortando por fuera: es lo que hace que, cuando
// esto se comparta o se guarde, la imagen siga llevando la marca del
// medio la reenvíe quien la reenvíe.

const PORRAS_IMG = {
  ancho: 1080, // formato cuadrado: cómodo tanto para Instagram/X como para WhatsApp
  padding: 48,
  colorFondo: "#ffffff",
  colorFondoAlt: "#f7f8fa",
  colorMarino: "#0c1b2e",
  colorRojo: "#d1132e",
  colorCeleste: "#5bb8e8",
  colorBorde: "#e7e9ee",
  colorTextoSuave: "#5a6270",
};

// Carga una imagen (escudo/logo) tolerando fallos: si no carga (CORS,
// 404...), se resuelve igualmente con null en vez de rechazar la
// promesa entera, para que un escudo roto no tire abajo la generación
// de toda la imagen -- ese partido simplemente se dibuja sin escudo.
//
// Mismo origen (escudos locales en img/escudos/, logo del medio): se
// cargan con un <img> normal, SIN crossOrigin. Es lo más compatible y,
// al ser mismo origen, nunca "mancha" (taint) el canvas -- no hace
// falta ni tiene sentido pasar por fetch()/CORS para esto.
//
// Dominios externos (por ejemplo un escudo subido a Cloudinary desde el
// panel de admin): se intenta primero con <img crossOrigin="anonymous">
// directo; si esa carga falla (típicamente porque el servidor externo
// no manda cabeceras CORS), se reintenta vía fetch()->blob() como
// último recurso antes de rendirse y dibujar el partido sin escudo.
function cargarImagenSegura(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);

    const cargarImgDirecta = (conCrossOrigin) => new Promise((res) => {
      const img = new Image();
      if (conCrossOrigin) img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = src;
    });

    const esMismoOrigen = (() => {
      try {
        return new URL(src, location.href).origin === location.origin;
      } catch {
        return true;
      }
    })();

    if (esMismoOrigen) {
      cargarImgDirecta(false).then(resolve);
      return;
    }

    cargarImgDirecta(true).then((img) => {
      if (img) return resolve(img);
      // Reintento vía fetch()->blob(): sirve cuando el fallo fue por
      // CORS pero el servidor sí permite la petición en modo "cors"
      // explícito (o cuando el navegador tenía cacheada una versión sin
      // CORS de esa misma URL de una carga anterior no relacionada).
      fetch(src, { mode: "cors" })
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); })
        .then((blob) => {
          const objectUrl = URL.createObjectURL(blob);
          const img2 = new Image();
          img2.onload = () => { resolve(img2); };
          img2.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
          img2.src = objectUrl;
        })
        .catch(() => resolve(null));
    });
  });
}

function porrasCanvasTextoAjustado(ctx, texto, maxAncho) {
  let t = texto;
  while (ctx.measureText(t).width > maxAncho && t.length > 1) {
    t = t.slice(0, -1);
  }
  return t.length < texto.length ? t.slice(0, -1).trimEnd() + "…" : t;
}

// Dibuja una imagen encajada dentro de una caja cuadrada de "tam" px,
// SIN deformarla: escala manteniendo su proporción original (igual que
// "object-fit: contain" en CSS) y la centra en la caja. Sin esto,
// escudos que no son cuadrados (la mayoría no lo son -- muchos son más
// altos que anchos, con la corona o el borde ovalado del club) salían
// estirados/aplastados al forzarlos a 40x40 con drawImage directo.
function dibujarImagenContenida(ctx, img, cajaX, cajaY, tam) {
  const escala = Math.min(tam / img.naturalWidth, tam / img.naturalHeight);
  const anchoDibujo = img.naturalWidth * escala;
  const altoDibujo = img.naturalHeight * escala;
  const x = cajaX + (tam - anchoDibujo) / 2;
  const y = cajaY + (tam - altoDibujo) / 2;
  ctx.drawImage(img, x, y, anchoDibujo, altoDibujo);
}

// Dibuja la marca de agua en la esquina inferior derecha: logo pequeño +
// nombre del medio + URL, sobre una franja semitransparente para que se
// lea igual de bien encima de un fondo claro que de uno oscuro (por si
// más adelante se genera también en modo oscuro). Discreta pero
// siempre visible: no se pone al 100% de opacidad para no "gritar",
// pero tampoco por debajo de un umbral que la haga desaparecer al
// comprimir la imagen al compartirla por WhatsApp.
function dibujarMarcaDeAgua(ctx, ancho, alto, logoImg) {
  const alturaFranja = 64;
  const y = alto - alturaFranja;
  ctx.save();
  ctx.fillStyle = "rgba(12,27,46,0.88)";
  ctx.fillRect(0, y, ancho, alturaFranja);

  const logoTam = 40;
  const logoX = 20;
  const logoY = y + (alturaFranja - logoTam) / 2;
  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(logoX + logoTam / 2, logoY + logoTam / 2, logoTam / 2, 0, Math.PI * 2);
    ctx.clip();
    dibujarImagenContenida(ctx, logoImg, logoX, logoY, logoTam);
    ctx.restore();
  }

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.font = "700 22px Oswald, Arial Narrow, sans-serif";
  ctx.fillText("ELOTROFÚTBOLTV", logoX + logoTam + 14, y + alturaFranja / 2 - 9);
  ctx.font = "500 15px Inter, Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("elotrofutbol.media", logoX + logoTam + 14, y + alturaFranja / 2 + 12);
  ctx.restore();
}

async function generarCanvasPorra(lector) {
  const partidos = PORRAS_PARTIDOS_JORNADA;
  const filaAlto = 92;
  const cabeceraAlto = 190;
  const marcaAguaAlto = 64;
  const alto = cabeceraAlto + partidos.length * filaAlto + PORRAS_IMG.padding + marcaAguaAlto;
  const ancho = PORRAS_IMG.ancho;

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");

  // Fondo
  ctx.fillStyle = PORRAS_IMG.colorFondo;
  ctx.fillRect(0, 0, ancho, alto);

  // Cabecera: nombre de la competición/jornada + nombre del lector.
  ctx.fillStyle = PORRAS_IMG.colorMarino;
  ctx.fillRect(0, 0, ancho, cabeceraAlto);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  ctx.font = "700 30px Oswald, Arial Narrow, sans-serif";
  ctx.fillText("MI PORRA", PORRAS_IMG.padding, 70);
  ctx.font = "500 22px Inter, Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const nombreCompeticion = (typeof categoriaLabel === "function" ? categoriaLabel(PORRAS_COMPETICION_ACTUAL) : PORRAS_COMPETICION_ACTUAL);
  const lineaCompeticion = `${nombreCompeticion}${PORRAS_GRUPO_ACTUAL ? " · " + PORRAS_GRUPO_ACTUAL : ""} · Jornada ${PORRAS_JORNADA_ACTUAL}`;
  ctx.fillText(lineaCompeticion, PORRAS_IMG.padding, 104);
  ctx.font = "700 20px Inter, Arial, sans-serif";
  ctx.fillStyle = PORRAS_IMG.colorCeleste;
  ctx.fillText(`Predicción de ${lector.nombre}`, PORRAS_IMG.padding, 148);

  // Precarga de escudos + logo en paralelo.
  const escudos = await Promise.all(
    partidos.map((p) => Promise.all([
      cargarImagenSegura(getEscudoUrl(p.equipo_local, p.escudo_local_url)),
      cargarImagenSegura(getEscudoUrl(p.equipo_visitante, p.escudo_visitante_url)),
    ]))
  );
  const logoImg = await cargarImagenSegura(SITE.logo);

  // Filas de partidos.
  let y = cabeceraAlto;
  partidos.forEach((p, i) => {
    const miPorra = PORRAS_MIAS[p.id];
    const [escudoLocal, escudoVisitante] = escudos[i];
    const filaY = y + i * filaAlto;

    ctx.fillStyle = i % 2 === 0 ? PORRAS_IMG.colorFondo : PORRAS_IMG.colorFondoAlt;
    ctx.fillRect(0, filaY, ancho, filaAlto);
    ctx.strokeStyle = PORRAS_IMG.colorBorde;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, filaY + filaAlto);
    ctx.lineTo(ancho, filaY + filaAlto);
    ctx.stroke();

    const centroY = filaY + filaAlto / 2;
    const escudoTam = 40;

    // Equipo local (alineado a la izquierda del bloque de nombres).
    const zonaEquipoAncho = 330;
    if (escudoLocal) dibujarImagenContenida(ctx, escudoLocal, PORRAS_IMG.padding, centroY - escudoTam / 2, escudoTam);
    ctx.fillStyle = PORRAS_IMG.colorMarino;
    ctx.font = "600 21px Inter, Arial, sans-serif";
    ctx.textBaseline = "middle";
    const nombreLocal = porrasCanvasTextoAjustado(ctx, p.equipo_local, zonaEquipoAncho - escudoTam - 16);
    ctx.fillText(nombreLocal, PORRAS_IMG.padding + escudoTam + 14, centroY);

    // Marcador predicho, centrado.
    const centroX = ancho / 2;
    ctx.textAlign = "center";
    ctx.font = "700 34px Oswald, Arial Narrow, sans-serif";
    ctx.fillStyle = PORRAS_IMG.colorMarino;
    const texto = miPorra
      ? `${miPorra.goles_local_predicho} - ${miPorra.goles_visitante_predicho}`
      : "? - ?";
    ctx.fillText(texto, centroX, centroY + 2);
    ctx.textAlign = "left";

    // Equipo visitante (alineado a la derecha).
    ctx.textAlign = "right";
    ctx.font = "600 21px Inter, Arial, sans-serif";
    const nombreVisitante = porrasCanvasTextoAjustado(ctx, p.equipo_visitante, zonaEquipoAncho - escudoTam - 16);
    ctx.fillText(nombreVisitante, ancho - PORRAS_IMG.padding - escudoTam - 14, centroY);
    ctx.textAlign = "left";
    if (escudoVisitante) dibujarImagenContenida(ctx, escudoVisitante, ancho - PORRAS_IMG.padding - escudoTam, centroY - escudoTam / 2, escudoTam);

    // Si el partido ya está resuelto, una pequeña etiqueta de acierto.
    if (miPorra && miPorra.resultado_acierto && miPorra.resultado_acierto !== "pendiente") {
      const etiquetas = { exacto: ["¡EXACTO!", "#2e9e57"], acierto: ["ACIERTO", "#2a80ab"], fallo: ["FALLO", PORRAS_IMG.colorRojo] };
      const [texto2, color] = etiquetas[miPorra.resultado_acierto];
      ctx.textAlign = "center";
      ctx.font = "700 12px Inter, Arial, sans-serif";
      ctx.fillStyle = color;
      ctx.fillText(texto2, centroX, centroY + 24);
      ctx.textAlign = "left";
    }
  });

  dibujarMarcaDeAgua(ctx, ancho, alto, logoImg);
  return canvas;
}

function porrasNombreArchivo() {
  const jornada = PORRAS_JORNADA_ACTUAL;
  return `mi-porra-${PORRAS_COMPETICION_ACTUAL}-jornada-${jornada}.png`;
}

// Genera el blob PNG de la porra (canvas -> blob), reutilizado tanto
// por el botón de descarga directa como por el de compartir.
async function generarBlobPorra(lector) {
  const canvas = await generarCanvasPorra(lector);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("No se ha podido generar la imagen");
  return blob;
}

function porrasConBotonOcupado(boton, textoCargando, fn) {
  const textoOriginal = boton ? boton.innerHTML : "";
  if (boton) {
    boton.disabled = true;
    boton.innerHTML = `<span>${textoCargando}</span>`;
  }
  return fn().finally(() => {
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = textoOriginal;
    }
  });
}

// Botón "Descargar": genera la imagen (con marca de agua, ver más abajo)
// y la descarga directamente, sin pasar por la hoja de compartir del
// sistema operativo.
async function descargarImagenPorra(lector) {
  const boton = document.getElementById("btnDescargarPorra");
  await porrasConBotonOcupado(boton, "Generando…", async () => {
    try {
      const blob = await generarBlobPorra(lector);
      const nombreArchivo = porrasNombreArchivo();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      if (window.EOF && EOF.toast) {
        EOF.toast("No se ha podido descargar la imagen de tu porra. Inténtalo de nuevo.", "error");
      }
    }
  });
}

// Botón "Compartir": si el navegador soporta compartir ARCHIVOS (no
// solo texto/URL, a diferencia de compartirNativo() de config.js), abre
// directamente la hoja de compartir nativa con la imagen ya adjunta. Si
// no lo soporta (típicamente escritorio), se cae a la descarga normal.
function porrasMensajeCompartir() {
  const nombreCompeticion = (typeof categoriaLabel === "function" ? categoriaLabel(PORRAS_COMPETICION_ACTUAL) : PORRAS_COMPETICION_ACTUAL);
  return `Así va mi porra de la jornada ${PORRAS_JORNADA_ACTUAL} de ${nombreCompeticion} en ELOTROFÚTBOLTV. ¿Te atreves a superarla? ${location.origin}${location.pathname}`;
}

async function compartirImagenPorra(lector) {
  const boton = document.getElementById("btnCompartirPorra");
  await porrasConBotonOcupado(boton, "Generando…", async () => {
    try {
      const blob = await generarBlobPorra(lector);
      const nombreArchivo = porrasNombreArchivo();
      const archivo = new File([blob], nombreArchivo, { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({
          files: [archivo],
          title: "Mi porra — ELOTROFÚTBOLTV",
          text: porrasMensajeCompartir(),
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombreArchivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch (err) {
      if (err && err.name === "AbortError") return; // el usuario cerró la hoja de compartir: no es un error
      if (window.EOF && EOF.toast) {
        EOF.toast("No se ha podido generar la imagen de tu porra. Inténtalo de nuevo.", "error");
      }
    }
  });
}

