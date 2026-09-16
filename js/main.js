document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("hero")) cargaPortada();
  if (document.getElementById("grid-categoria-home")) cargaNoticiasRecientes();
  if (document.getElementById("resultados-home")) cargaResultadosHome();
  if (document.getElementById("seccion-encuestas-portada")) cargaEncuestasPortada();
});

// conReintento() (reintento automático de una carga fallida) está
// definido en config.js, junto a apiFetch, para que esté disponible en
// todas las páginas sin duplicarlo en cada script.

// ---------- Noticias recientes (portada) ----------
// Muestra todas las noticias que no están destacadas arriba (en el hero),
// para no repetir las mismas crónicas dos veces en la portada.
async function cargaNoticiasRecientes() {
  const cont = document.getElementById("grid-categoria-home");
  cont.innerHTML = spinnerHTML();
  try {
    // Máximo 4 noticias recientes en portada, siempre las más recientes
    // (el backend ya las devuelve ordenadas por fecha de publicación
    // descendente), sin repetir las que ya salen destacadas arriba. Con
    // reintento automático: si el primer intento falla (timeout, fallo
    // puntual de red...), se prueba una vez más antes de rendirse.
    const { articles = [] } = await conReintento(async () => {
      const res = await apiFetch(`/api/articles?destacado=0&limit=4`);
      return res.json();
    });
    if (!articles.length) {
      cont.innerHTML = estadoHTML({
        titulo: "Todavía no hay más noticias",
        texto: "En cuanto publiquemos nuevas crónicas y noticias, las verás aquí.",
      });
      return;
    }
    cont.innerHTML = `<div class="grid-noticias">${articles.map(cardHTML).join("")}</div>`;
  } catch (err) {
    console.error("Error cargando noticias recientes:", err);
    cont.innerHTML = estadoHTML({
      titulo: "No se ha podido conectar",
      texto: "Ha habido un problema al cargar las noticias. Comprueba tu conexión e inténtalo de nuevo.",
      tipo: "error",
      cta: `<a href="javascript:location.reload()" class="btn-volver">Reintentar</a>`,
    });
  }
}

// ---------- En vivo / Próximos partidos / Últimos resultados (portada) ----------
// La portada separa los partidos en tres secciones independientes, en
// este orden: "Partidos en vivo" (TODOS los que estén "en juego" ahora
// mismo, para que no se pierda ninguno en directo; la sección entera se
// oculta si no hay ninguno), "Próximos partidos" (los siguientes por
// jugar) y "Últimos resultados" (los finalizados más recientes).
const RESULTADOS_HOME_PROGRAMADOS = 6;
const RESULTADOS_HOME_FINALIZADOS = 6;

// La portada solo debe mostrar partidos de competiciones que cubrimos
// al completo (LaLiga Hypermotion y Primera Federación) o, dentro de
// Segunda Federación, solo los partidos que involucran a alguno de los
// 7 equipos que sí tenemos cubiertos editorialmente (ver clubs.js,
// CLUBS_SEGUNDA_FEDERACION_CUBIERTOS_PORTADA: Conquense, Guadalajara,
// Linares, Numancia, Recreativo de Huelva, Talavera y Badajoz). El
// resto de partidos de Segunda Federación (los ~83 equipos restantes de
// los 5 grupos que puedan estar cargados en la base de datos para
// Calendario/Clasificación, aunque no los cubramos con noticias) no
// deben aparecer en portada. Importante: esto usa
// CLUBS_SEGUNDA_FEDERACION_CUBIERTOS_PORTADA y NO
// getClubsForCategoria("segunda_federacion")/CLUBS_BY_CATEGORY, que
// siguen teniendo los 90 equipos completos para no romper los
// desplegables de creación de noticias del panel de admin.
//
// Se compara por un nombre "núcleo" (minúsculas, sin tildes, sin siglas
// de club ni la palabra "de") en vez de por igualdad exacta, porque el
// nombre de equipo guardado en el partido no siempre coincide letra por
// letra con el nombre "oficial" de clubs.js (p.ej. "Numancia" vs "CD
// Numancia", o "Recreativo Huelva" vs "Recreativo de Huelva").
function nucleoNombreClub(nombre) {
  return normalizarTextoBusquedaClub(nombre)
    .replace(/\b(cd|cf|ub|rc|rcd|ud|sd|ca|cp|club deportivo|club de futbol)\b/g, "")
    .replace(/\bde\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const COMPETICIONES_PORTADA = ["hypermotion", "primera_federacion"];

function filtrarParaPortada(results) {
  const nucleosSegundaFederacionCubiertos = new Set(
    CLUBS_SEGUNDA_FEDERACION_CUBIERTOS_PORTADA.map(nucleoNombreClub)
  );
  return results.filter(r => {
    if (COMPETICIONES_PORTADA.includes(r.competicion)) return true;
    if (r.competicion === "segunda_federacion") {
      return nucleosSegundaFederacionCubiertos.has(nucleoNombreClub(r.equipo_local)) ||
        nucleosSegundaFederacionCubiertos.has(nucleoNombreClub(r.equipo_visitante));
    }
    return false; // amistosos u otras competiciones futuras: fuera de portada
  });
}

async function cargaResultadosHome() {
  const seccionEnVivo = document.getElementById("seccion-en-vivo-home");
  const contEnVivo = document.getElementById("en-vivo-home");
  const contProximos = document.getElementById("proximos-home");
  const contResultados = document.getElementById("resultados-home");
  contProximos.innerHTML = spinnerHTML();
  contResultados.innerHTML = spinnerHTML();
  try {
    // Reintento automático conjunto: las 3 peticiones van en paralelo, así
    // que si UNA sola falla (p.ej. coincide con el circuito abriéndose)
    // se repiten las 3 tras una breve espera en vez de dejar la portada a
    // medias o mostrar el estado de error por un fallo puntual.
    // Se piden también los clubes "personalizados" (añadidos desde el
    // panel, no los fijos de clubs.js) en el mismo Promise.all: hace falta
    // esperarlos antes de filtrarParaPortada, o los equipos de Segunda
    // Federación que solo estén en custom_clubs (y no en la lista fija de
    // clubs.js) quedarían fuera de portada aunque sí los cubramos.
    const { enJuego, programados, finalizados } = await conReintento(async () => {
      const [resEnJuego, resProgramados, resFinalizados] = await Promise.all([
        apiFetch(`/api/results?estado=en_juego`),
        apiFetch(`/api/results?estado=programado`),
        apiFetch(`/api/results?estado=finalizado`),
        cargarCustomClubs(),
      ]);
      const { results: enJuego = [] } = await resEnJuego.json();
      const { results: programados = [] } = await resProgramados.json();
      const { results: finalizados = [] } = await resFinalizados.json();
      return { enJuego, programados, finalizados };
    });

    // Cada sección se ordena cronológicamente por separado:
    // ordenarPartidosCronologicamente (partidos.js) ya resuelve tanto
    // "próximo primero" como "más reciente primero" según el estado de
    // cada partido. Antes de ordenar, se filtran fuera los partidos que
    // no deben aparecer en portada (ver filtrarParaPortada más arriba).
    const enJuegoOrdenados = ordenarPartidosCronologicamente(filtrarParaPortada(enJuego));
    const proximosOrdenados = ordenarPartidosCronologicamente(filtrarParaPortada(programados)).slice(0, RESULTADOS_HOME_PROGRAMADOS);
    const finalizadosOrdenados = ordenarPartidosCronologicamente(filtrarParaPortada(finalizados)).slice(0, RESULTADOS_HOME_FINALIZADOS);

    // Guardamos todos los partidos mostrados para poder abrir el modal
    // de detalle al hacer clic, igual que en la página de resultados.
    PARTIDOS_CACHE = {};
    [...enJuegoOrdenados, ...proximosOrdenados, ...finalizadosOrdenados].forEach(r => { PARTIDOS_CACHE[r.id] = r; });

    // "Partidos en vivo": la sección entera se oculta si no hay ninguno,
    // para no dejar un hueco vacío en portada la mayor parte del tiempo.
    if (enJuegoOrdenados.length) {
      seccionEnVivo.hidden = false;
      contEnVivo.innerHTML = `
        <div class="tabla-jornada">
          ${enJuegoOrdenados.map((p) => partidoHTML(p, { mostrarCompeticion: true })).join("")}
        </div>`;
      inicializarClicsPartidos("en-vivo-home");
    } else {
      seccionEnVivo.hidden = true;
      contEnVivo.innerHTML = "";
    }

    // "Próximos partidos"
    if (proximosOrdenados.length) {
      contProximos.innerHTML = `
        <div class="tabla-jornada">
          ${proximosOrdenados.map((p) => partidoHTML(p, { mostrarCompeticion: true })).join("")}
        </div>`;
      inicializarClicsPartidos("proximos-home");
    } else {
      contProximos.innerHTML = estadoHTML({
        titulo: "No hay próximos partidos programados",
        texto: "En cuanto se programen los siguientes encuentros, los verás aquí.",
      });
    }

    // "Últimos resultados"
    if (finalizadosOrdenados.length) {
      contResultados.innerHTML = `
        <div class="tabla-jornada">
          ${finalizadosOrdenados.map((p) => partidoHTML(p, { mostrarCompeticion: true })).join("")}
        </div>`;
      inicializarClicsPartidos("resultados-home");
    } else {
      contResultados.innerHTML = estadoHTML({
        titulo: "Todavía no hay resultados",
        texto: "En cuanto se disputen los primeros partidos, verás aquí los marcadores.",
      });
    }
  } catch (err) {
    console.error("Error cargando resultados de portada:", err);
    seccionEnVivo.hidden = true;
    const errorHTML = estadoHTML({
      titulo: "No se ha podido conectar",
      texto: "Ha habido un problema al cargar los resultados. Comprueba tu conexión e inténtalo de nuevo.",
      tipo: "error",
      cta: `<a href="javascript:location.reload()" class="btn-volver">Reintentar</a>`,
    });
    contProximos.innerHTML = errorHTML;
    contResultados.innerHTML = errorHTML;
  }
}

// ---------- Encuestas destacadas en portada ----------
// Puede haber varias a la vez (ordenadas por orden_portada desde el
// backend); cada una se pinta como un widget independiente reutilizando
// encuestaWidgetHTML/pintarEncuesta (ver js/encuestas.js), igual que la
// encuesta de una noticia concreta.
async function cargaEncuestasPortada() {
  const seccion = document.getElementById("seccion-encuestas-portada");
  try {
    const res = await apiFetchLector(`/api/polls/portada`);
    const { encuestas = [] } = await res.json();
    if (!encuestas.length) { seccion.hidden = true; return; }

    seccion.hidden = false;
    seccion.innerHTML = `
      <h2 class="section-title">Encuestas</h2>
      <div class="encuestas-portada-grid">
        ${encuestas.map(e => `<div id="encuestaPortada_${e.id}"></div>`).join("")}
      </div>`;

    encuestas.forEach(encuesta => {
      const cont = document.getElementById(`encuestaPortada_${encuesta.id}`);
      if (cont) pintarEncuesta(cont, encuesta, "cargaEncuestasPortada");
    });
  } catch (err) {
    console.error("Error cargando encuestas de portada:", err);
    // No es contenido esencial de la portada: si falla, simplemente no
    // se muestra la sección, sin bloquear el resto de la página.
    seccion.hidden = true;
  }
}

// Artículos que solo tienen collage (sin ninguna imagen "normal" marcada
// como portada) pueden llegar aquí con imagen_url vacío: como red de
// seguridad, si pasa eso se usa la primera foto del primer collage
// guardado en "imagenes", para no mostrar el placeholder por defecto
// en portada/tarjetas pudiendo haber fotos reales disponibles.
function imagenPreview(a) {
  if (a.imagen_url) return a.imagen_url;
  try {
    const imagenes = typeof a.imagenes === "string" ? JSON.parse(a.imagenes) : (a.imagenes || []);
    // Cada foto de collage es una entrada suelta dentro del array
    // "imagenes" (no van anidadas), identificable por tener "grupo" sea
    // cual sea su posición (inicio/collage/galería) — ver
    // collagesArticuloAImagenes() en admin.js.
    const fotoCollage = imagenes.find((v) => v && typeof v === "object" && v.grupo && v.url);
    if (fotoCollage) return fotoCollage.url;
  } catch {
    // Si "imagenes" viene mal formado, se ignora y se cae al placeholder.
  }
  return "";
}

function cardHTML(a) {
  const urlImagen = imagenPreview(a);
  const img = urlImagen ? cloudinaryOptimizada(urlImagen, 500) : "img/default.jpg";
  const foco = a.imagen_foco || "50% 50%";
  return `
    <a class="card" href="${urlNoticia(a.categoria, a.slug)}">
      <img src="${img}" alt="${escapeHtml(a.titulo)}" loading="lazy" style="object-position:${foco}" onerror="this.src='img/default.jpg'">
      <div class="cbody">
        <span class="cat">${categoriaLabel(a.categoria)}</span>
        <h3>${escapeHtml(a.titulo)}</h3>
        <p>${escapeHtml(resumText(a.subtitulo || a.contenido, 110))}</p>
        <span class="meta">${formatFecha(a.fecha_publicacion)}${a.autor_nombre ? " · " + escapeHtml(a.autor_nombre) + (a.coautor_nombre ? " y " + escapeHtml(a.coautor_nombre) : "") : ""}</span>
      </div>
    </a>`;
}

async function cargaPortada() {
  try {
    // 5 noticias destacadas en total: 1 grande (principal) + 4 pequeñas
    // a la derecha. Reintento automático conjunto, igual que en las
    // demás cargas de portada.
    const { destacados, ultimas } = await conReintento(async () => {
      const [destacadosRes, ultimasRes] = await Promise.all([
        apiFetch(`/api/articles?destacado=1&limit=5`).then(r => r.json()),
        apiFetch(`/api/articles?limit=5`).then(r => r.json()),
      ]);
      return {
        destacados: destacadosRes.articles || [],
        ultimas: ultimasRes.articles || [],
      };
    });

    const hero = document.getElementById("hero");
    if (destacados.length > 0) {
      const principal = destacados[0];
      // Si no hay suficientes destacadas, se completa con las últimas
      // noticias, pero evitando repetir la que ya es la principal.
      const candidatasExtra = ultimas.filter(a => a.id !== principal.id);
      const secundariasDestacadas = destacados.slice(1, 5);
      const secundarias = secundariasDestacadas.length >= 4
        ? secundariasDestacadas
        : [...secundariasDestacadas, ...candidatasExtra.filter(a => !secundariasDestacadas.some(s => s.id === a.id))].slice(0, 4);
      hero.innerHTML = `
        <a class="hero-principal" href="${urlNoticia(principal.categoria, principal.slug)}">
          <img src="${imagenPreview(principal) ? cloudinaryOptimizada(imagenPreview(principal), 900) : 'img/default.jpg'}" alt="${escapeHtml(principal.titulo)}" style="object-position:${principal.imagen_foco || '50% 50%'}" onerror="this.style.display='none'">
          <div class="overlay">
            <div>
              <span class="badge">${categoriaLabel(principal.categoria)}</span>
              <h1>${escapeHtml(principal.titulo)}</h1>
              <p>${escapeHtml(resumText(principal.subtitulo || principal.contenido, 160))}</p>
            </div>
          </div>
        </a>
        <div class="hero-secundarias">
          ${secundarias.map(s => `
            <a class="mini-card" href="${urlNoticia(s.categoria, s.slug)}">
              <img src="${imagenPreview(s) ? cloudinaryOptimizada(imagenPreview(s), 300) : 'img/default.jpg'}" alt="${escapeHtml(s.titulo)}" loading="lazy" style="object-position:${s.imagen_foco || '50% 50%'}" onerror="this.src='img/default.jpg'">
              <div>
                <span class="cat">${categoriaLabel(s.categoria)}</span>
                <h3>${escapeHtml(s.titulo)}</h3>
              </div>
            </a>`).join("")}
        </div>`;
    } else {
      hero.innerHTML = estadoHTML({
        titulo: "Todavía no hay noticias destacadas",
        texto: "En cuanto publiquemos las primeras crónicas y noticias, las verás destacadas justo aquí.",
      });
    }
  } catch (err) {
    console.error("Error cargando portada:", err);
    document.getElementById("hero").innerHTML = estadoHTML({
      titulo: "No se ha podido conectar",
      texto: "Ha habido un problema al cargar la portada. Comprueba tu conexión e inténtalo de nuevo.",
      tipo: "error",
      cta: `<a href="javascript:location.reload()" class="btn-volver">Reintentar</a>`,
    });
  }
}
