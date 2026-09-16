// Dominio propio del Worker, en vez del workers.dev subdomain de la
// cuenta (elotrofutbol-api.adriamarch2010.workers.dev): ese subdominio se
// ha desactivado solo más de una vez sin que nadie lo tocara, dejando la
// API entera inalcanzable hasta reactivarlo a mano en el dashboard de
// Cloudflare. api.elotrofutbol.media es una ruta ([[routes]] en
// worker/wrangler.toml) sobre un dominio que gestionamos nosotros, así
// que no depende de esa configuración de cuenta.
const API_URL = "https://api.elotrofutbol.media";

// URL de la API secundaria (Railway), usada como respaldo por apiFetch()
// cuando la primaria no responde. Se puede sobrescribir definiendo
// window.EOF_SECONDARY_API_URL en un <script> ANTES de cargar este
// archivo (por ejemplo, para apuntar a un entorno de pruebas distinto),
// pero por defecto ya viene puesta aquí para que el failover funcione
// nada más desplegar, sin tener que tocar cada HTML uno a uno.
const API_URL_SECUNDARIA_POR_DEFECTO = "https://elotro-futbol-api-production.up.railway.app";
const PRIMARY_API = API_URL;
const SECONDARY_API = (typeof window !== "undefined" && window.EOF_SECONDARY_API_URL) || API_URL_SECUNDARIA_POR_DEFECTO;

// ---------- apiFetch(): failover PRIMARY -> SECONDARY para el sitio público ----------
// Mismo diseño certificado para el panel de administración (ver FASE5-resultado.md):
//   - Timeout de 8s por intento.
//   - Failover en GET/HEAD ante error de red, timeout o 502/503/504.
//   - 400/401/403/404 (y otros 4xx) NO provocan failover: son respuestas
//     válidas del servidor, no una caída.
//   - Las escrituras (POST/PUT/DELETE/PATCH) NO se reintentan automáticamente
//     en la secundaria: un timeout no permite saber si la escritura ya se
//     aplicó en la primaria, así que reintentar podría duplicar datos.
//   - Circuit breaker: 3 fallos consecutivos de primaria abren el circuito
//     (todas las lecturas van directas a secundaria durante 30s, sin ni
//     siquiera intentar primaria); tras esos 30s se vuelve a probar, y se
//     necesitan 2 respuestas OK seguidas de primaria para cerrar el circuito
//     y confiar de nuevo en ella. Esto evita el parpadeo PRIMARY/SECONDARY/
//     PRIMARY/SECONDARY si la primaria está inestable en vez de caída.
const EOF_API_TIMEOUT_MS = 8000;
const EOF_CIRCUIT_FAILS_TO_OPEN = 3;
const EOF_CIRCUIT_OPEN_MS = 30000;
const EOF_CIRCUIT_OKS_TO_CLOSE = 2;

const eofApiState = {
  activa: "PRIMARY", // solo informativo/diagnóstico, no gobierna el circuito
  fallosConsecutivos: 0,
  circuitoAbierto: false,
  circuitoAbiertoDesde: 0,
  oksConsecutivosPrimaria: 0,
  ultimoFallo: null,
  ultimaRecuperacion: null,
};

function eofEsErrorDeTransporteOServidorCaido(status) {
  // Errores de transporte (fetch rechaza la promesa: red caída, DNS, CORS,
  // timeout vía AbortController) se tratan aparte, en el catch. Aquí solo
  // clasificamos respuestas HTTP recibidas: 502/503/504 = servidor/gateway
  // caído o saturado -> failover. El resto de códigos (incluidos 4xx) son
  // respuestas legítimas del servidor -> no failover.
  return status === 502 || status === 503 || status === 504;
}

function eofRegistrarFalloPrimaria(esFalloDeTransporte) {
  eofApiState.fallosConsecutivos += 1;
  eofApiState.oksConsecutivosPrimaria = 0;
  eofApiState.ultimoFallo = new Date().toISOString();
  // Un fallo de TRANSPORTE (red caída, DNS, IP inalcanzable, timeout) abre
  // el circuito de inmediato, sin esperar a acumular 3. Varias peticiones
  // en paralelo (portada, header, resultados...) se disparan juntas al
  // cargar la página; si esperamos a 3 fallos consecutivos, todas esas
  // peticiones paralelas llegan a intentar la primaria caída antes de que
  // el circuito se abra, generando una fila de errores de red en la
  // consola. Un 502/503/504 (servidor SÍ responde, pero con error) sigue
  // exigiendo 3 fallos, porque ahí es más probable que sea un problema
  // puntual/transitorio y no una caída total.
  const debeAbrir = esFalloDeTransporte || eofApiState.fallosConsecutivos >= EOF_CIRCUIT_FAILS_TO_OPEN;
  if (!eofApiState.circuitoAbierto && debeAbrir) {
    eofApiState.circuitoAbierto = true;
    eofApiState.circuitoAbiertoDesde = Date.now();
    console.warn("[FAILOVER] PRIMARY unavailable - SECONDARY activated (circuit breaker OPEN)");
  }
}

function eofRegistrarExitoPrimaria() {
  if (eofApiState.circuitoAbierto) {
    eofApiState.oksConsecutivosPrimaria += 1;
    if (eofApiState.oksConsecutivosPrimaria >= EOF_CIRCUIT_OKS_TO_CLOSE) {
      eofApiState.circuitoAbierto = false;
      eofApiState.fallosConsecutivos = 0;
      eofApiState.oksConsecutivosPrimaria = 0;
      eofApiState.ultimaRecuperacion = new Date().toISOString();
      console.info("[RECOVERY] PRIMARY healthy - PRIMARY reactivated");
    }
  } else {
    eofApiState.fallosConsecutivos = 0;
  }
}

function eofCircuitoDebeProbarPrimariaOtraVez() {
  return Date.now() - eofApiState.circuitoAbiertoDesde >= EOF_CIRCUIT_OPEN_MS;
}

async function eofFetchConTimeout(url, options, timeoutMs) {
  const controlador = new AbortController();
  const combinado = { ...options, signal: controlador.signal };
  // Si el llamante ya pasó su propia señal (p.ej. búsqueda cancelable en
  // layout.js), se respeta también: cualquiera de las dos aborta la petición.
  if (options.signal) {
    options.signal.addEventListener("abort", () => controlador.abort());
  }
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    return await fetch(url, combinado);
  } finally {
    clearTimeout(temporizador);
  }
}

// Endpoints de autenticación: son técnicamente POST, pero no crean ni
// modifican ningún dato de negocio (artículo, comentario, resultado...),
// solo verifican credenciales o disparan un correo de recuperación. Repetir
// la petición en la secundaria si la primaria cae no puede duplicar nada,
// así que para estos SÍ se hace failover como si fueran lecturas. Sin esto,
// una caída de la primaria dejaría a todo el mundo fuera del panel.
const EOF_ESCRITURAS_SEGURAS_PARA_FAILOVER = new Set([
  "/api/login",
  "/api/forgot-password",
  "/api/forgot-password/confirmar",
  // Login/recuperación de lectores: mismo motivo que las de arriba (solo
  // verifican credenciales o disparan un correo, repetirlas en la
  // secundaria no puede duplicar ningún dato de negocio).
  "/api/readers/login",
  "/api/readers/forgot-password",
  "/api/readers/forgot-password/confirmar",
]);

function eofEscrituraSeguraParaFailover(path) {
  // path puede traer querystring; se compara solo la ruta.
  const ruta = path.split("?")[0];
  return EOF_ESCRITURAS_SEGURAS_PARA_FAILOVER.has(ruta);
}

// apiFetch(path, options): igual que fetch(path, options) pero con la URL
// base ya resuelta y failover automático. Devuelve un Response (igual que
// fetch nativo), así que las llamadas existentes que hacían
// `await fetch(...).then(r => r.json())` solo necesitan cambiar `fetch` por
// `apiFetch` sin tocar el resto.
async function apiFetch(path, options = {}) {
  const metodo = (options.method || "GET").toUpperCase();
  const esEscritura = metodo !== "GET" && metodo !== "HEAD" && !eofEscrituraSeguraParaFailover(path);

  // Lecturas (GET/HEAD) sin "cache" explícito: se fuerza "no-store" para
  // que, si se va recargando la página (portada, categoría, buscador...),
  // se vean siempre los últimos cambios publicados desde el panel. El
  // servidor ya manda "Cache-Control: no-store" (ver json() en el
  // Worker), pero eso no evita que el propio navegador sirva la petición
  // desde su caché en memoria (bfcache / disk cache) si el fetch no lo
  // pide explícitamente; esto lo cubre también en el cliente.
  if (!esEscritura && !options.cache) {
    options = { ...options, cache: "no-store" };
  }

  const debeIntentarPrimariaPrimero = !eofApiState.circuitoAbierto || eofCircuitoDebeProbarPrimariaOtraVez();

  if (debeIntentarPrimariaPrimero) {
    try {
      const res = await eofFetchConTimeout(`${PRIMARY_API}${path}`, options, EOF_API_TIMEOUT_MS);
      if (eofEsErrorDeTransporteOServidorCaido(res.status)) {
        eofRegistrarFalloPrimaria(false);
        // Las escrituras no se repiten automáticamente en la secundaria:
        // se devuelve la respuesta (probablemente un error 502/503/504) tal
        // cual para que quien llame decida, en vez de arriesgarse a duplicar.
        if (esEscritura) {
          eofApiState.activa = "PRIMARY";
          return res;
        }
        // Lectura: sí se reintenta en la secundaria si existe.
      } else {
        eofRegistrarExitoPrimaria();
        // El propio Worker primario tiene SU PROPIO mecanismo de
        // failover server-side (ver fetchRailway en worker/src/index.js):
        // ante FAILOVER_TEST=1, o cuando D1 fallara, puede reenviar la
        // petición a Railway internamente y devolver esa respuesta con
        // status 200 -- indistinguible, a nivel de código HTTP, de una
        // respuesta normal de la propia primaria. Sin leer la cabecera
        // X-Failover-Backend que ese mecanismo añade, este apiFetch (el
        // failover del lado del navegador) se quedaría creyendo que todo
        // vino de PRIMARY aunque el servidor ya hubiera hecho el cambio
        // por debajo. Se refleja aquí para que EOF_API_DEBUG() y los
        // logs sean honestos sobre qué backend respondió de verdad.
        const backendReal = res.headers.get("X-Failover-Backend");
        eofApiState.activa = backendReal === "RAILWAY" ? "SECONDARY" : "PRIMARY";
        return res;
      }
    } catch (err) {
      // Error de transporte (red caída, DNS, timeout por AbortController).
      eofRegistrarFalloPrimaria(true);
      if (esEscritura) {
        // No hay respuesta que devolver: se propaga el error tal cual.
        // Quien llame debe tratarlo como "no se sabe si se guardó".
        eofApiState.activa = "PRIMARY";
        throw err;
      }
    }
  }

  if (!SECONDARY_API) {
    // Sin secundaria configurada: no hay a dónde hacer failover. Se
    // propaga el fallo de primaria tal cual (comportamiento previo).
    throw new Error("PRIMARY unavailable and no SECONDARY_API configured");
  }

  eofApiState.activa = "SECONDARY";
  return eofFetchConTimeout(`${SECONDARY_API}${path}`, options, EOF_API_TIMEOUT_MS);
}

// Se expone también como window.eofApiFetch (además de la función global
// apiFetch de arriba) para que otros scripts que definan su PROPIA función
// llamada "apiFetch" en su mismo ámbito (p. ej. admin.js, que le añade
// cabeceras de autenticación) puedan seguir llamando al motor de failover
// por un nombre que no quede sombreado por su propia declaración.
if (typeof window !== "undefined") {
  window.eofApiFetch = apiFetch;
}

// ---------- conReintento(): reintento automático para cargas de página ----------
// apiFetch ya tiene su propio timeout (8s) y su propio failover a la
// secundaria, así que cuando AÚN ASÍ una carga falla, casi siempre es un
// fallo puntual de milisegundos (una petición que coincide justo con el
// circuito abriéndose, un timeout aislado en una red inestable...).
// conReintento(fn) ejecuta `fn` (una función async sin argumentos) y, si
// lanza, espera un momento y la reintenta UNA vez antes de propagar el
// error al llamante -- así la persona no tiene que recargar a mano la
// página por un fallo que se habría resuelto solo un segundo después.
// Pensado para las cargas iniciales de cada página (portada, categoría,
// noticia, resultados...), no para acciones puntuales del usuario como
// enviar un comentario o una búsqueda en vivo, donde reintentar solo
// añadiría demora o podría duplicar la acción.
const EOF_REINTENTO_AUTOMATICO_MS = 1200;
function eofEsperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function conReintento(fn) {
  try {
    return await fn();
  } catch (err) {
    console.warn("Primer intento fallido, reintentando en " + EOF_REINTENTO_AUTOMATICO_MS + "ms:", err);
    await eofEsperar(EOF_REINTENTO_AUTOMATICO_MS);
    return await fn();
  }
}

// Diagnóstico manual desde la consola del navegador: window.EOF_API_DEBUG()
if (typeof window !== "undefined") {
  window.EOF_API_DEBUG = function () {
    return {
      apiActiva: eofApiState.activa,
      primaria: PRIMARY_API,
      secundaria: SECONDARY_API,
      circuitoAbierto: eofApiState.circuitoAbierto,
      fallosConsecutivos: eofApiState.fallosConsecutivos,
      ultimoFallo: eofApiState.ultimoFallo,
      ultimaRecuperacion: eofApiState.ultimaRecuperacion,
    };
  };
}

const SITE = {
  nombre: "ELOTROFÚTBOLTV",
  logo: "img/logo.png",
  // Estos valores son solo el "de reserva" por si falla la conexión con
  // la API. Las redes sociales reales se editan desde un único sitio:
  // el panel de administración → pestaña "Redes sociales" (guardadas en
  // el servidor y cargadas automáticamente por js/layout.js).
  redes: {
    twitter: "https://twitter.com/elotrofutbol",
    instagram: "https://instagram.com/elotrofutbol",
    tiktok: "https://tiktok.com/@elotrofutbol",
    youtube: "https://youtube.com/@elotrofutbol",
  },
};

// ---------- Patrocinadores ----------
// Lista manual (de momento) de patrocinadores/colaboradores del medio.
// Se pintan tanto en la sección grande de la portada como en la franja
// compacta del pie de página en TODAS las páginas (ver renderPatrocinadoresHomeHTML
// y renderPatrocinadoresFooterHTML en layout.js).
//
// Cada entrada admite:
//   nombre     -> texto alternativo del logo y tooltip al pasar el ratón
//   logo       -> ruta al logo (preferible SVG o PNG con fondo transparente)
//   url        -> web del patrocinador (se abre en pestaña nueva)
//   destacado  -> true para el/los patrocinador(es) principal(es) (se pintan
//                 más grandes en la portada, en su propia fila superior)
const PATROCINADORES = [
  // ---- EJEMPLOS DE PRUEBA: sustituye por los patrocinadores reales ----
  // (borra estas líneas y añade las tuyas con el mismo formato; los
  // logos de ejemplo están en img/patrocinadores/*.svg). Cuantos más
  // patrocinadores normales (sin destacado) haya, más lleno y vistoso
  // se ve el carrusel — no hay límite de cuántos puedes poner.
  { nombre: "TarrakoStore", logo: "img/patrocinadores/TarrakoStore.webp", url: "https://tarrako.store", destacado: true },
  { nombre: "NàsticExpress", logo: "img/patrocinadores/NasticExpress.webp", url: "https://www.instagram.com/nastic.express/" },
];

const CATEGORIES = {
  hypermotion: "LaLiga Hypermotion",
  primera_federacion: "Primera Federación",
  segunda_federacion: "Segunda Federación",
  general: "General",
  amistoso: "Amistoso",
  arbitraje: "Arbitraje",
  jurisdiccion: "Jurisdicción deportiva",
};

function categoriaLabel(cat) {
  return CATEGORIES[cat] || cat;
}

// "club" de un artículo (columna "club" en articles) puede ser un único
// nombre de club en texto plano (caso normal: noticia/análisis/opinión/
// entrevista), o un array JSON de 2 clubes en texto (previa/crónica
// vinculada a un resultado, p. ej. '["Real Madrid","FC Barcelona"]"),
// ver resolverClubArticulo() en worker/src/index.js. Estas dos funciones
// son el equivalente en el frontend público de parsearClubArticulo() /
// clubArticuloLegible() del backend, para pintar y enlazar bien ese
// campo en las páginas públicas (noticia.html, seo.js...).
function parsearClubArticulo(valorClub) {
  if (!valorClub) return [];
  try {
    const parsed = JSON.parse(valorClub);
    if (Array.isArray(parsed)) return parsed.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim());
  } catch {
    // No es JSON: es el caso normal de club único en texto plano.
  }
  return typeof valorClub === "string" && valorClub.trim() ? [valorClub.trim()] : [];
}
function clubArticuloLegible(valorClub) {
  return parsearClubArticulo(valorClub).join(" - ");
}

// Convierte el valor interno de "categoria" (algunos con guion bajo, como
// "primera_federacion") en el segmento de URL bonita (con guion normal,
// "primera-federacion"). Debe coincidir exactamente con categoriaUrlSlug()
// de worker/src/index.js y worker-secondary/src/index.js, y con
// public/_worker.js: los cuatro sitios donde se genera o resuelve una URL
// de noticia tienen que normalizar igual, o un mismo artículo acabaría
// con URLs "bonitas" distintas según dónde se enlace.
function categoriaUrlSlug(cat) {
  const normalizada = (cat || "").toString().trim().toLowerCase().replace(/_/g, "-");
  return normalizada || "general";
}

// Construye la URL "bonita" (/futbol/categoria/slug) de una noticia, en
// ruta absoluta desde la raíz del sitio (funciona igual se enlace desde
// una página de la raíz o desde admin/). Único punto donde se arma este
// formato en el frontend: si el formato de URL cambia otra vez en el
// futuro, solo hay que tocar esta función.
function urlNoticia(categoria, slug) {
  return `/futbol/${categoriaUrlSlug(categoria)}/${encodeURIComponent(slug)}`;
}

// ---------- Optimización de imágenes de Cloudinary ----------
// Las fotos de noticias/collages/avatares se suben a Cloudinary tal
// cual llegan del redactor (sin recomprimir ni recodificar, ver
// subirACloudinary en el Worker: así no se pierde calidad si luego se
// necesita el archivo original). Eso significa que, servidas "en
// crudo", pueden pesar varios MB y tardar mucho en cargar en el sitio
// público. Cloudinary permite pedir una versión ya optimizada de esa
// misma imagen simplemente insertando parámetros de transformación en
// la URL (sin tocar el archivo guardado): f_auto elige el formato más
// ligero que soporte el navegador (WebP/AVIF en vez de JPEG/PNG),
// q_auto ajusta la calidad de compresión automáticamente, y c_limit +
// w_/dpr_auto evita mandar una imagen a una resolución mucho mayor de
// la que realmente se va a mostrar en pantalla.
// Se aplica solo si la URL es realmente de Cloudinary (contiene
// "/upload/"): los escudos locales (img/escudos/...) y el logo del
// sitio no pasan por aquí, así que se devuelven tal cual.
function cloudinaryOptimizada(url, anchoMax) {
  if (!url || typeof url !== "string") return url;
  const marca = "/upload/";
  const i = url.indexOf(marca);
  if (i === -1) return url;
  const transformacion = `f_auto,q_auto,c_limit,dpr_auto${anchoMax ? `,w_${anchoMax}` : ""}`;
  return url.slice(0, i + marca.length) + transformacion + "/" + url.slice(i + marca.length);
}

// Logo de cada competición. Los ficheros se guardan en img/competiciones/
// con estos nombres; si una categoría no tiene logo propio (general,
// amistoso...) no se muestra ninguno.
const CATEGORY_LOGOS = {
  hypermotion: "img/competiciones/hypermotion.png",
  primera_federacion: "img/competiciones/primera-federacion.png",
  segunda_federacion: "img/competiciones/segunda-federacion.png",
};

function categoriaLogo(cat) {
  return CATEGORY_LOGOS[cat] || "";
}

function formatFecha(fechaStr) {
  if (!fechaStr) return "";
  fechaStr = String(fechaStr).trim();

  // Los resultados guardan solo el día ("YYYY-MM-DD", partidos antiguos
  // guardados antes de poder elegir hora, o el <input type="date"> viejo
  // del panel), sin hora. Ese formato hay que tratarlo aparte: si se le
  // añade una "Z" queda "YYYY-MM-DDZ", que algunos navegadores (Safari)
  // no consiguen parsear y devuelven "Invalid Date". Como no lleva hora,
  // no hace falta pasarlo por ninguna zona horaria: se construye la fecha
  // directamente a partir de los números.
  const soloFecha = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soloFecha) {
    const [, anyo, mes, dia] = soloFecha;
    const d = new Date(Number(anyo), Number(mes) - 1, Number(dia));
    if (isNaN(d)) return "";
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
  }

  // Partidos guardados con el <input type="datetime-local"> del panel
  // ("YYYY-MM-DDTHH:MM"): esa hora ya es la hora de España tal y como la
  // escribió quien gestiona el partido, así que se muestra tal cual, sin
  // pasarla por ninguna zona horaria (evita que se desplace si quien lee
  // está en otro huso horario del navegador).
  const fechaConHora = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (fechaConHora) {
    const [, anyo, mes, dia, hora, minuto] = fechaConHora;
    const d = new Date(Number(anyo), Number(mes) - 1, Number(dia));
    if (isNaN(d)) return "";
    const fechaTexto = d.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
    return `${fechaTexto}, ${hora}:${minuto}h`;
  }

  // El resto de fechas (noticias, etc.) llegan en UTC desde la BD sin
  // indicar zona ("YYYY-MM-DD HH:MM:SS" o ISO con "Z"); se marca como UTC
  // ("Z") y se pide la hora de España al mostrarla, para que no se
  // desplace de día cerca de medianoche.
  const conT = fechaStr.replace(" ", "T");
  const d = new Date(/Z$|[+-]\d\d:\d\d$/.test(conT) ? conT : conT + "Z");
  if (isNaN(d)) return "";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
}

// Igual que formatFecha, pero además incluye la hora. Se usa para la
// fecha/hora de una noticia programada (necesitas saber a qué hora
// exacta se va a publicar sola, no solo el día).
function formatFechaConHora(fechaStr) {
  if (!fechaStr) return "";
  fechaStr = String(fechaStr).trim();
  const conT = fechaStr.replace(" ", "T");
  const d = new Date(/Z$|[+-]\d\d:\d\d$/.test(conT) ? conT : conT + "Z");
  if (isNaN(d)) return "";
  const fechaTexto = d.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
  const horaTexto = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  return `${fechaTexto}, ${horaTexto}h`;
}

// ---------- Goles y tarjetas de un partido (compartido entre el modal de
// resultados.html/index.html y el marcador dentro de una noticia) ----------
const ETIQUETAS_EVENTO_PUBLICO = {
  gol: "Gol",
  gol_var: "Gol anulado (VAR)",
  gol_pp: "Gol en propia puerta",
  amarilla: "Tarjeta amarilla",
  doble_amarilla: "Doble amarilla",
  roja: "Tarjeta roja",
  cambio: "Cambio",
  penalti_fallado: "Penalti fallado",
  var: "Revisión VAR",
  inicio_partido: "Comienza el partido",
  descanso: "Descanso",
  fin_descanso: "Comienza la segunda parte",
  pausa_hidratacion: "Pausa de hidratación",
  fin_pausa_hidratacion: "Se reanuda el partido",
  partido_retrasado: "Partido retrasado",
  partido_anulado: "Partido anulado",
  penalti_marcado: "Penalti (tanda)",
  penalti_fallado_tanda: "Penalti fallado (tanda)",
  fin_partido: "Final del partido",
  otro: "Incidencia",
  nota: "Nota",
};

// Eventos que son un hito del propio partido (no de un equipo/jugador
// concreto): se pintan sin escudo/etiqueta de equipo.
const TIPOS_EVENTO_SIN_EQUIPO_PUBLICO = [
  "inicio_partido", "descanso", "fin_descanso",
  "pausa_hidratacion", "fin_pausa_hidratacion",
  "partido_retrasado", "partido_anulado",
  "fin_partido", "otro", "nota",
];

// Eventos de la tanda de penaltis: se pintan aparte, en su propio bloque
// del timeline (ver renderEventosModal en partidos.js), porque su
// "minuto" en realidad es el número de orden del lanzamiento (1º, 2º...)
// y no tiene sentido intercalarlos con el resto de eventos por minuto.
const TIPOS_EVENTO_TANDA_PENALTIS = ["penalti_marcado", "penalti_fallado_tanda"];

function iconoEventoPublico(tipo) {
  if (tipo === "gol" || tipo === "gol_var" || tipo === "gol_pp") {
    const tachado = tipo === "gol_var" ? `<line x1="4" y1="20" x2="20" y2="4" stroke="#d1132e" stroke-width="2"/>` : "";
    return `<svg class="mev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 6.5l4 3-1.5 4.5h-5L8 9.5z"/>${tachado}</svg>`;
  }
  if (tipo === "penalti_marcado" || tipo === "penalti_fallado_tanda") {
    const fallado = tipo === "penalti_fallado_tanda";
    const marca = fallado
      ? `<path d="M8 8l8 8M16 8l-8 8" stroke="#d1132e"/>`
      : `<path d="M9 12.5l2 2 4-4.5" stroke="#1a9e4f"/>`;
    return `<svg class="mev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/>${marca}</svg>`;
  }
  if (tipo === "amarilla" || tipo === "doble_amarilla" || tipo === "roja") {
    const color = tipo === "roja" ? "#d1132e" : "#e8b923";
    const doble = tipo === "doble_amarilla";
    return `<svg class="mev-icono" viewBox="0 0 24 24">
      ${doble ? `<rect x="3" y="4" width="8" height="12" rx="1.5" fill="#e8b923" transform="rotate(-8 7 10)"/>` : ""}
      <rect x="${doble ? 11 : 7}" y="4" width="8" height="12" rx="1.5" fill="${color}" transform="rotate(8 ${doble ? 15 : 11} 10)"/>
    </svg>`;
  }
  if (tipo === "cambio") {
    return `<svg class="mev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>`;
  }
  if (tipo === "var") {
    return `<svg class="mev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 10v4M12 10v4M16 10l0 4"/></svg>`;
  }
  if (tipo === "penalti_fallado") {
    return `<svg class="mev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/></svg>`;
  }
  if (tipo === "pausa_hidratacion" || tipo === "fin_pausa_hidratacion") {
    return `<svg class="mev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z"/></svg>`;
  }
  if (tipo === "partido_retrasado") {
    return `<svg class="mev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`;
  }
  if (tipo === "partido_anulado") {
    return `<svg class="mev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/></svg>`;
  }
  if (tipo === "descanso" || tipo === "fin_partido") {
    return `<svg class="mev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`;
  }
  if (tipo === "nota") {
    return `<svg class="mev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h9l3 3v13H6z"/><path d="M9 9h7M9 13h7M9 17h4"/></svg>`;
  }
  return `<svg class="mev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>`;
}

function formatMinutoEventoPublico(ev) {
  // Los lanzamientos de la tanda de penaltis no llevan un minuto de
  // partido real: "minuto" guarda el número de orden del lanzamiento
  // (1º, 2º...), así que se muestra como "1º", "2º"... en vez de "1'".
  if (TIPOS_EVENTO_TANDA_PENALTIS.includes(ev.tipo)) return `${ev.minuto}º`;
  return ev.minuto_extra ? `${ev.minuto}+${ev.minuto_extra}'` : `${ev.minuto}'`;
}

// Texto adicional tras la etiqueta del evento: para un cambio muestra
// "sale X, entra Y"; para un gol (o gol anulado por VAR, o en propia
// puerta), el jugador y, si la hay, la asistencia; para el resto, el
// jugador si lo hay.
function detalleJugadorEventoPublico(ev) {
  if (ev.tipo === "nota") return "";
  if (ev.tipo === "cambio") {
    const entra = ev.jugador ? escapeHtml(ev.jugador) : "";
    const sale = ev.jugador_sale ? escapeHtml(ev.jugador_sale) : "";
    if (entra && sale) return ` · Entra ${entra}, sale ${sale}`;
    if (entra) return ` · Entra ${entra}`;
    if (sale) return ` · Sale ${sale}`;
    return "";
  }
  if (ev.tipo === "gol" || ev.tipo === "gol_var") {
    const marcador = ev.jugador ? escapeHtml(ev.jugador) : "";
    const asistencia = ev.jugador_asistencia ? ` (asist. ${escapeHtml(ev.jugador_asistencia)})` : "";
    return marcador ? ` · ${marcador}${asistencia}` : "";
  }
  if (ev.tipo === "gol_pp") {
    const marcador = ev.jugador ? escapeHtml(ev.jugador) : "";
    return marcador ? ` · ${marcador} (p.p.)` : "";
  }
  return ev.jugador ? " · " + escapeHtml(ev.jugador) : "";
}

// ---------- Marcador con tanda de penaltis ----------
// Genera el HTML del marcador de un partido: el resultado del tiempo
// reglamentario en grande y, si el partido se decidió en la tanda de
// penaltis (penaltis_local/penaltis_visitante no son NULL), el
// resultado de la tanda más pequeño y entre paréntesis justo debajo.
// claseGrande/claseChica permiten reutilizar este bloque tanto en las
// tarjetas de partido (marcador compacto) como en el modal de detalle
// (marcador más grande).
function marcadorConPenaltisHTML(r, { claseGrande = "", claseChica = "penaltis-marcador" } = {}) {
  const golesTexto = r.estado === "programado" ? "vs" : `${r.goles_local ?? 0} : ${r.goles_visitante ?? 0}`;
  const hayPenaltis = r.penaltis_local !== null && r.penaltis_local !== undefined && r.penaltis_visitante !== null && r.penaltis_visitante !== undefined;
  const penaltisTexto = hayPenaltis ? `<span class="${claseChica}">(${r.penaltis_local} - ${r.penaltis_visitante} p.)</span>` : "";
  return `<span class="${claseGrande}">${golesTexto}</span>${penaltisTexto}`;
}

// Pinta el marcador de un partido dentro de una noticia/crónica, cuando
// esa noticia se ha vinculado a un resultado de "Resultados". Incluye,
// además del marcador, los escudos de los equipos, el estadio (si se
// indicó) y el detalle de goles y tarjetas del partido (si ya se han
// cargado en r.eventos).
function marcadorArticuloHTML(r) {
  const estados = { programado: "Por jugar", en_juego: "En juego", finalizado: "Finalizado" };
  const hayMarcador = r.goles_local !== null && r.goles_local !== undefined && r.goles_visitante !== null && r.goles_visitante !== undefined;
  const ubicacionExtra = ((r.estado === "programado" || r.estado === "finalizado") && r.ubicacion) ? " · " + escapeHtml(r.ubicacion) : "";
  return `
    <div class="marcador-articulo">
      <div class="comp">${categoriaLabel(r.competicion)}${r.grupo ? " · " + escapeHtml(r.grupo) : ""}${r.jornada ? " · Jornada " + r.jornada : ""}</div>
      <div class="equipos">
        <span class="equipo">
          <img class="escudo-articulo" src="${getEscudoUrl(r.equipo_local, r.escudo_local_url)}" alt="" loading="lazy" data-equipo="${escapeHtml(r.equipo_local)}" onerror="manejarErrorEscudo(this);">
          <span class="nombre-equipo-articulo">${escapeHtml(r.equipo_local)}</span>
        </span>
        <span class="goles">${hayMarcador ? marcadorConPenaltisHTML(r, { claseChica: "penaltis-marcador penaltis-marcador-articulo" }) : "vs"}</span>
        <span class="equipo">
          <img class="escudo-articulo" src="${getEscudoUrl(r.equipo_visitante, r.escudo_visitante_url)}" alt="" loading="lazy" data-equipo="${escapeHtml(r.equipo_visitante)}" onerror="manejarErrorEscudo(this);">
          <span class="nombre-equipo-articulo">${escapeHtml(r.equipo_visitante)}</span>
        </span>
      </div>
      <div class="estado-badge">${estados[r.estado] || r.estado}${r.fecha_partido ? " · " + formatFecha(r.fecha_partido) : ""}${ubicacionExtra}</div>
      ${togglesArticuloHTML(r)}
    </div>`;
}

// Pinta la "Ficha técnica" de una crónica: un bloque con los datos del
// partido que el redactor ha rellenado a mano desde el panel (ver
// admin.js, obtenerFichaTecnicaFormulario), pensado para ir al final del
// cuerpo del artículo (ver noticia.html, renderizaArticulo). Es
// independiente del "Resultado vinculado" que pinta marcadorArticuloHTML
// más arriba: puede aparecer sola, junto a un marcador, o ninguna de las
// dos, según lo que el redactor haya rellenado en cada crónica.
// Devuelve "" (nada) si no hay ficha técnica o está completamente vacía,
// para no dejar un hueco en blanco en el artículo.
function fichaTecnicaArticuloHTML(ficha) {
  if (!ficha || typeof ficha !== "object") return "";

  const ETIQUETAS_FICHA = {
    competicion: "Competición",
    jornada: "Jornada",
    fecha_hora: "Fecha y hora",
    estadio: "Estadio",
    ciudad: "Ciudad",
    asistencia: "Asistencia",
    arbitro: "Árbitro",
    mvp: "MVP del partido",
  };
  const datosHTML = Object.entries(ETIQUETAS_FICHA)
    .filter(([clave]) => ficha[clave])
    .map(([clave, etiqueta]) => `
      <div class="ficha-dato">
        <span class="ficha-dato-etiqueta">${etiqueta}</span>
        <span class="ficha-dato-valor">${escapeHtml(ficha[clave])}</span>
      </div>`)
    .join("");

  const listaHTML = (titulo, items) => {
    if (!Array.isArray(items) || items.length === 0) return "";
    return `
      <div>
        <p class="ficha-lista-titulo">${titulo}</p>
        <ul class="ficha-lista-items">
          ${items.map((linea) => `<li>${escapeHtml(linea)}</li>`).join("")}
        </ul>
      </div>`;
  };
  const listasHTML = listaHTML("Goleadores", ficha.goleadores) + listaHTML("Tarjetas", ficha.tarjetas);

  const notasHTML = ficha.notas ? `<div class="ficha-tecnica-notas">${escapeHtml(ficha.notas)}</div>` : "";

  // Si no hay ni datos sueltos, ni goleadores/tarjetas, ni notas, no
  // tiene sentido pintar la tarjeta (estaría vacía salvo la cabecera).
  if (!datosHTML && !listasHTML && !notasHTML) return "";

  return `
    <div class="ficha-tecnica-articulo">
      <div class="ficha-tecnica-cabecera">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span class="ficha-tecnica-titulo">Ficha técnica</span>
      </div>
      <div class="ficha-tecnica-cuerpo">
        ${datosHTML ? `<div class="ficha-tecnica-datos">${datosHTML}</div>` : ""}
        ${listasHTML ? `<div class="ficha-tecnica-listas">${listasHTML}</div>` : ""}
        ${notasHTML}
      </div>
    </div>`;
}

// Agrupa "Ver alineaciones" y "Ver goles y tarjetas" en una sola fila de
// pestañas (en vez de dos botones sueltos, uno debajo del otro) y hace
// que abrir una cierre la otra si estaba abierta (ver toggleEventosArticulo).
// La alineación va primero/arriba porque es lo que más se suele mirar de
// un vistazo (quién jugó) antes que el detalle de goles y tarjetas.
// El botón muestra la alineación INICIAL con los cambios de la tabla de
// eventos ya aplicados (ver alineacionesConCambiosAplicados): así, en un
// partido en juego, quien esté jugando ahora mismo aparece como titular
// aunque haya entrado de cambio a mitad del segundo tiempo. En la
// noticia esto solo importa mientras el partido puede seguir cambiando
// (en_juego); una vez "finalizado" el resultado ya no cambia, así que
// también se aplican para dejar fijado el once final.
function togglesArticuloHTML(r) {
  const alineaciones = alineacionesConCambiosAplicados(r.alineaciones, r.eventos, r.estado);
  const { boton: botonAlineaciones, panel: panelAlineaciones } = alineacionesBotonYPanelHTML(alineaciones);
  const { boton: botonEventos, panel: panelEventos } = eventosArticuloBotonYPanelHTML(r);
  if (!botonAlineaciones && !botonEventos) return "";
  return `
    <div class="toggles-articulo-fila">${botonAlineaciones}${botonEventos}</div>
    ${panelAlineaciones}
    ${panelEventos}`;
}

// Wrapper simple para sitios que solo necesitan el bloque de
// alineaciones aislado (el modal de resultados lo agrupa junto al de
// eventos por su cuenta, ver resultados.html/partidos.js).
function alineacionesHTML(alineaciones) {
  const { boton, panel } = alineacionesBotonYPanelHTML(alineaciones);
  return boton ? `${boton}${panel}` : "";
}

// ---------- Alineación inicial + cambios = alineación "en vivo" ----------
// La alineación que se guarda en el admin (alineacionesHTML/alineacionHTML
// más abajo) es siempre la INICIAL: el once que salió de titular. Para
// que en un partido "en_juego" (o ya "finalizado") se vea quién ha ido
// entrando realmente, se recalcula un once "en vivo" a partir de esa
// alineación inicial más los eventos de tipo "cambio" ya registrados:
// - "jugador" en el evento de cambio es quien ENTRA.
// - "jugador_asistencia" en el evento de cambio es quien SALE.
// El que entra hereda la posición (x/y) del que sale en el campo, para
// no tener que guardar coordenadas nuevas a mano en cada cambio; si no
// se pudo identificar al que sale (nombre no coincide con nadie de la
// alineación guardada), el cambio se ignora en el dibujo del campo -pero
// sigue apareciendo igualmente en "Ver goles y tarjetas"-, para no
// arriesgarse a mostrar algo incorrecto.
// Un partido "programado" nunca tiene eventos todavía, así que ahí esto
// no hace nada; se deja fuera explícitamente para no gastar ciclos.
function alineacionesConCambiosAplicados(alineaciones, eventos, estado) {
  if (!Array.isArray(alineaciones) || !alineaciones.length) return alineaciones;
  if (estado !== "en_juego" && estado !== "finalizado") return alineaciones;
  const cambios = (Array.isArray(eventos) ? eventos : []).filter((ev) => ev.tipo === "cambio");
  if (!cambios.length) return alineaciones;

  // Los cambios se aplican en orden de minuto, por si el mismo jugador
  // vuelve a salir en un cambio posterior (poco común pero posible).
  const cambiosOrdenados = [...cambios].sort((a, b) => (a.minuto ?? 0) - (b.minuto ?? 0));

  return alineaciones.map((a) => {
    const jugadores = (a.jugadores || []).map((j) => ({ ...j }));
    cambiosOrdenados.forEach((ev) => {
      const { dorsal: dorsalSale, nombre: nombreSale } = separarDorsalYJugadorPublico(ev.jugador_asistencia);
      const { dorsal: dorsalEntra, nombre: nombreEntra } = separarDorsalYJugadorPublico(ev.jugador);
      if (!nombreSale && !dorsalSale) return; // sin jugador identificado que sale, no se puede saber a quién sustituye en el campo
      const sale = jugadores.find((j) =>
        j.titular !== false &&
        ((nombreSale && j.nombre && j.nombre.trim().toLowerCase() === nombreSale.trim().toLowerCase()) ||
         (dorsalSale && String(j.dorsal ?? "") === dorsalSale))
      );
      if (!sale) return; // el que sale no pertenece a este equipo (o ya salió antes): se ignora aquí, se prueba con el otro equipo
      sale.titular = false;
      sale.salioDeCambio = true;
      if (nombreEntra || dorsalEntra) {
        jugadores.push({
          x: sale.x, y: sale.y, dorsal: dorsalEntra || undefined,
          nombre: nombreEntra || `Dorsal ${dorsalEntra}`, titular: true, entradoDeCambio: true,
        });
      }
    });
    return { ...a, jugadores };
  });
}

// Separa el texto "dorsal · nombre" guardado en un evento (ver
// combinarDorsalYJugador en el admin) en sus dos partes, para poder
// cruzarlo con los jugadores de la alineación. Versión pública y
// tolerante: si solo hay un trozo, decide si es dorsal (todo dígitos) o
// nombre igual que hace el admin al repoblar su formulario.
function separarDorsalYJugadorPublico(texto) {
  if (!texto) return { dorsal: "", nombre: "" };
  const partes = texto.split(" · ");
  if (partes.length === 2) return { dorsal: partes[0].trim(), nombre: partes[1].trim() };
  const t = texto.trim();
  return /^\d+$/.test(t) ? { dorsal: t, nombre: "" } : { dorsal: "", nombre: t };
}

// ---------- Alineaciones ----------
// Pinta el campo de fútbol con el once titular colocado por posición
// (x/y en %) y, debajo, la lista de suplentes. Se usa tanto en la
// noticia (marcadorArticuloHTML la puede incluir) como en el modal de
// detalle de un partido en resultados.html.
function alineacionHTML(a) {
  const titulares = (a.jugadores || []).filter((j) => j.titular !== false);
  const suplentes = (a.jugadores || []).filter((j) => j.titular === false);
  const escudo = getEscudoUrl(a.equipo, a.escudo_url);
  return `
    <div class="alineacion-bloque">
      <div class="alineacion-cabecera">
        <img class="alineacion-escudo" src="${escudo}" alt="" loading="lazy" data-equipo="${escapeHtml(a.equipo)}" onerror="manejarErrorEscudo(this);">
        <span class="alineacion-equipo">${escapeHtml(a.equipo)}</span>
        <span class="alineacion-formacion">${escapeHtml(a.formacion || "")}</span>
      </div>
      <div class="alineacion-campo">
        <div class="alineacion-campo-lineas"></div>
        <div class="area-pequena-arriba"></div>
        <div class="area-pequena-abajo"></div>
        <div class="punto-penalti-arriba"></div>
        <div class="punto-penalti-abajo"></div>
        <div class="semicirculo-area-arriba"></div>
        <div class="semicirculo-area-abajo"></div>
        <div class="corner-arco corner-arco--tl"></div>
        <div class="corner-arco corner-arco--tr"></div>
        <div class="corner-arco corner-arco--bl"></div>
        <div class="corner-arco corner-arco--br"></div>
        ${titulares.map((j) => `
          <div class="alineacion-jugador${j.entradoDeCambio ? " alineacion-jugador-cambio" : ""}" style="left:${j.x}%;top:${j.y}%;">
            <span class="alineacion-dorsal">${j.dorsal ?? ""}</span>
            <span class="alineacion-nombre">${escapeHtml(j.nombre)}${j.capitan ? ' <span class="alineacion-capitan-marca" title="Capitán">(C)</span>' : ""}</span>
          </div>`).join("")}
      </div>
      ${suplentes.length ? `
        <div class="alineacion-suplentes">
          <p class="alineacion-suplentes-titulo">Suplentes</p>
          <ul>${suplentes.map((j) => `<li><span class="alineacion-dorsal">${j.dorsal ?? ""}</span> ${escapeHtml(j.nombre)}${j.capitan ? ' <span class="alineacion-capitan-marca" title="Capitán">(C)</span>' : ""}${j.titular === false && j.salioDeCambio ? ` <span class="alineacion-sale-tag">Sustituido</span>` : ""}</li>`).join("")}</ul>
        </div>` : ""}
    </div>`;
}

// Envuelve una o dos alineaciones (local/visitante) en un bloque
// Envuelve una o dos alineaciones (local/visitante) en un bloque
// desplegable, agrupado junto al de "Ver goles y tarjetas" en la misma
// fila de pestañas (ver marcadorArticuloHTML/toggleEventosArticulo):
// solo puede haber un panel abierto a la vez.
let CONTADOR_ALINEACIONES = 0;
function alineacionesBotonYPanelHTML(alineaciones) {
  if (!Array.isArray(alineaciones) || !alineaciones.length) return { boton: "", panel: "" };
  const idBloque = `alineaciones-${++CONTADOR_ALINEACIONES}`;
  const boton = `
    <button type="button" class="toggle-eventos-articulo" aria-expanded="false" aria-controls="${idBloque}" onclick="toggleEventosArticulo(this, event)">
      <span>Ver ${alineaciones.length > 1 ? "alineaciones" : "alineación"}</span>
      <svg class="toggle-eventos-flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
    </button>`;
  const panel = `
    <div class="alineaciones-wrap" id="${idBloque}" hidden>
      ${alineaciones.map(alineacionHTML).join("")}
    </div>`;
  return { boton, panel };
}

// Bloque de goles y tarjetas dentro del marcador de la noticia. No se
// muestra nada si el partido todavía no se ha jugado o no tiene eventos
// registrados, para no añadir ruido a los partidos "Por jugar". Cada
// evento es una fila propia (minuto, tipo, jugador y equipo), en vez
// del grid a 3 columnas del modal de detalle: dentro del cuerpo de una
// noticia el ancho disponible es mucho menor, así que una lista vertical
// simple se lee mejor que comprimir el texto a un lado u otro.
//
// Los eventos van colapsados por defecto detrás de un botón "Ver goles y
// tarjetas" con una flechita, agrupado junto al de alineaciones (ver
// marcadorArticuloHTML): si no, una noticia sobre un partido con muchos
// eventos (goles, amarillas...) puede ocupar más que el propio texto de
// la noticia. idBloque identifica cada bloque para poder tener varios en
// la misma página (varias tarjetas de preview) sin que se pisen entre sí.
let CONTADOR_EVENTOS_ARTICULO = 0;
function eventosArticuloBotonYPanelHTML(r) {
  if (r.estado === "programado") return { boton: "", panel: "" };
  const eventos = Array.isArray(r.eventos) ? r.eventos : [];
  // Un partido finalizado sin cobertura en directo puede tener guardado
  // igualmente el evento automático "inicio_partido" (y a veces
  // "fin_partido"), sin que nadie haya llegado a anotar ningún gol,
  // tarjeta u otro evento real. En ese caso no tiene sentido mostrar el
  // botón "Ver goles y tarjetas", porque al abrirlo no habría nada que
  // enseñar de verdad: solo se cuenta si hay al menos un evento que no
  // sea puramente estructural (inicio/fin de partido, descansos...).
  const TIPOS_SOLO_ESTRUCTURALES = [
    "inicio_partido", "descanso", "fin_descanso",
    "pausa_hidratacion", "fin_pausa_hidratacion",
    "partido_retrasado", "fin_partido",
  ];
  const hayEventosReales = eventos.some((ev) => !TIPOS_SOLO_ESTRUCTURALES.includes(ev.tipo));
  if (!hayEventosReales) return { boton: "", panel: "" };
  const idBloque = `eventos-articulo-${++CONTADOR_EVENTOS_ARTICULO}`;
  const boton = `
    <button type="button" class="toggle-eventos-articulo" aria-expanded="false" aria-controls="${idBloque}" onclick="toggleEventosArticulo(this, event)">
      <span>Ver goles y tarjetas (${eventos.length})</span>
      <svg class="toggle-eventos-flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
    </button>`;
  const panel = `
    <div class="eventos-articulo" id="${idBloque}" hidden>
      ${eventos.map(ev => `
        <div class="evento-articulo-item">
          ${iconoEventoPublico(ev.tipo)}
          <span class="mev-minuto">${formatMinutoEventoPublico(ev)}</span>
          <span>${ev.tipo === "nota" ? escapeHtml(ev.jugador || "") : escapeHtml(ETIQUETAS_EVENTO_PUBLICO[ev.tipo] || ev.tipo) + detalleJugadorEventoPublico(ev)}</span>
          ${TIPOS_EVENTO_SIN_EQUIPO_PUBLICO.includes(ev.tipo) ? "" : `<span class="ea-equipo-tag">${ev.equipo === "local" ? escapeHtml(r.equipo_local) : escapeHtml(r.equipo_visitante)}</span>`}
        </div>`).join("")}
    </div>`;
  return { boton, panel };
}

// Abre/cierra el bloque de goles y tarjetas de un marcador (dentro de una
// noticia o de su preview en una tarjeta). En la preview el marcador
// vive dentro de una tarjeta que es un enlace entero (<a class="card">),
// así que hay que frenar tanto la acción por defecto del clic como su
// propagación hacia ese <a>, o si no la tarjeta navegaría a la noticia
// en vez de (o además de) desplegar los eventos.
function toggleEventosArticulo(btn, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const bloque = document.getElementById(btn.getAttribute("aria-controls"));
  if (!bloque) return;
  const abierto = btn.getAttribute("aria-expanded") === "true";
  // Si este botón vive junto a otro en la misma fila de pestañas
  // (.toggles-articulo-fila, ver togglesArticuloHTML), se cierra
  // primero cualquier otro que estuviera abierto: solo un panel visible
  // a la vez, igual que unas pestañas normales.
  const fila = btn.closest(".toggles-articulo-fila");
  if (fila) {
    fila.querySelectorAll(".toggle-eventos-articulo").forEach((otro) => {
      if (otro === btn) return;
      otro.setAttribute("aria-expanded", "false");
      otro.classList.remove("toggle-eventos-abierto");
      const otroBloque = document.getElementById(otro.getAttribute("aria-controls"));
      if (otroBloque) otroBloque.hidden = true;
    });
  }
  btn.setAttribute("aria-expanded", abierto ? "false" : "true");
  bloque.hidden = abierto;
  btn.classList.toggle("toggle-eventos-abierto", !abierto);
}

function resumText(html, n = 140) {
  if (!html) return "";
  // Quita etiquetas y decodifica entidades (&amp;, &quot;, &#39;...) antes
  // de recortar: si no se decodifican aquí, el resumen mostraría códigos
  // de entidad en crudo (p. ej. "Barça &amp; Real Madrid") porque luego
  // vuelve a pasar por escapeHtml() al insertarse en la tarjeta, que
  // escapa el "&" literal en vez de reconocer una entidad ya existente.
  const text = html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
  return text.length > n ? text.slice(0, n) + "…" : text;
}

// ---------- Estados vacíos / carga / error reutilizables ----------
// Se usan en portada, categoría, búsqueda, resultados, etc. para que
// nunca se vea un simple "<p>texto</p>" suelto y descuidado.

function iconoBalon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7.2l3.6 2.6-1.4 4.2h-4.4l-1.4-4.2z"/><path d="M12 3v4.2M4.5 8.6l3 2.1M19.5 8.6l-3 2.1M6.3 18.4l2.3-3.9M17.7 18.4l-2.3-3.9M4.3 12h2.4M17.3 12h2.4"/></svg>`;
}
function iconoLupa() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.3-4.3"/></svg>`;
}
function iconoAviso() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l9.5 16.5H2.5z"/><path d="M12 9.5v4.2"/><path d="M12 16.8h.01"/></svg>`;
}
function iconoCompartir() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="5.5" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.7l7.5-4.1M8.2 13.3l7.5 4.1"/></svg>`;
}

// tipo: "vacio" | "busqueda" | "error" | "compartir"
function estadoHTML({ titulo, texto, tipo = "vacio", cta = "" }) {
  const iconos = { vacio: iconoBalon(), busqueda: iconoLupa(), error: iconoAviso(), compartir: iconoCompartir() };
  const clase = tipo === "error" ? "estado-info estado-error" : "estado-info";
  return `
    <div class="${clase}">
      ${iconos[tipo] || iconos.vacio}
      <h3>${escapeHtml(titulo)}</h3>
      <p>${escapeHtml(texto)}</p>
      ${cta}
    </div>`;
}

function spinnerHTML(texto = "Cargando...") {
  return `<div class="estado-info"><div class="spinner"></div><p>${escapeHtml(texto)}</p></div>`;
}

// Escapa texto antes de insertarlo en HTML (títulos, nombres de club, etc.)
// para que comillas, < o > no rompan el marcado ni los atributos.
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- Bloque "Compártela" al final de cada noticia/crónica ----------

const TIPOS_CONTENIDO = {
  noticia: "noticia",
  previa: "previa",
  cronica: "crónica",
  analisis: "análisis",
  opinion: "opinión",
  entrevista: "entrevista",
};
function tipoContenidoLabel(tipo) {
  return TIPOS_CONTENIDO[tipo] || "noticia";
}

function iconoWhatsApp() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m0 1.67c2.23 0 4.32.87 5.89 2.44a8.26 8.26 0 0 1 2.43 5.8c0 4.55-3.7 8.25-8.26 8.25a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.56 3.7-8.25 8.19-8.25M8.5 6.9c-.17 0-.44.06-.67.31s-.88.86-.88 2.1.9 2.44 1.03 2.6c.13.19 1.75 2.67 4.25 3.74.6.26 1.06.41 1.42.53.6.19 1.14.16 1.57.1.48-.08 1.47-.6 1.68-1.18s.21-1.08.15-1.18-.24-.16-.5-.29-1.48-.73-1.71-.81-.4-.13-.56.13-.64.81-.79.97-.29.19-.55.06a6.87 6.87 0 0 1-2.02-1.25 7.6 7.6 0 0 1-1.4-1.75c-.15-.25 0-.38.11-.51.13-.14.28-.34.42-.51s.19-.29.28-.48.05-.36-.02-.5-.55-1.34-.76-1.83c-.2-.48-.4-.4-.56-.41h-.47z"/></svg>`;
}
function iconoX() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.9 10.5 21.3 2h-1.9l-6.4 7.4L7.9 2H2l7.8 11.3L2 22h1.9l6.8-7.8L16.3 22h5.9l-8.3-11.5Zm-2.4 2.8-.8-1.1L4.4 3.4h2.8l5.1 7.2.8 1.1 6.6 9.3h-2.8l-5.4-7.6Z"/></svg>`;
}
function iconoFacebook() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.9h2.65l.4-3.08H13.5V8.05c0-.89.25-1.5 1.52-1.5h1.63V3.8A21.7 21.7 0 0 0 14.24 3.7c-2.36 0-3.98 1.44-3.98 4.08v2.24H7.6v3.08h2.66V21z"/></svg>`;
}
function iconoTelegram() {
  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.6 18.7 20c-.24 1.06-.87 1.32-1.76.82l-4.85-3.58-2.34 2.25c-.26.26-.48.48-.97.48l.35-4.94 9-8.13c.39-.35-.08-.54-.6-.2L6.4 12.9 1.62 11.4c-1.04-.32-1.06-1.04.22-1.55L20.6 3c.87-.32 1.63.2 1.3 1.6z"/></svg>`;
}
function iconoInstagram() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.3"/><circle cx="17.35" cy="6.65" r="1.05" fill="currentColor" stroke="none"/></svg>`;
}
function iconoEnlace() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 14.5l5-5"/><path d="M11 8.3l1-1a3.2 3.2 0 0 1 4.5 4.5l-1.4 1.4"/><path d="M13 15.7l-1 1a3.2 3.2 0 0 1-4.5-4.5l1.4-1.4"/></svg>`;
}
function iconoCompartirNativo() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.7l7.4-4.2M8.3 13.3l7.4 4.2"/></svg>`;
}

// Genera la fila de botones para compartir en redes/WhatsApp y copiar enlace.
// En móvil (donde suele haber navigator.share) se antepone un botón que
// abre el menú de compartir nativo del sistema operativo -- el mismo
// gesto al que ya está acostumbrado el usuario en cualquier otra app --
// dejando los botones concretos de cada red como alternativa siempre
// visible debajo, tanto por si el share nativo falla/se cancela como
// para quien esté en escritorio (donde navigator.share no suele existir,
// y ahí directamente no se pinta el botón nativo).
function botonesCompartirHTML(url, titulo) {
  const texto = encodeURIComponent(titulo || "");
  const enlace = encodeURIComponent(url || "");
  const urlAttr = escapeHtml(url || "");
  const tituloAttr = escapeHtml(titulo || "");
  // navigator.share existe sobre todo en navegadores móviles; se pinta el
  // botón solo si el propio navegador lo soporta (comprobado en tiempo de
  // ejecución más abajo, ver compartirNativo), así que aquí simplemente
  // se incluye siempre en el HTML y se oculta con JS si no aplica -- así
  // no hay que duplicar esta función para servidor/cliente.
  return `
    <div class="compartir-botones">
      <button type="button" class="btn-compartir btn-compartir-nativo" data-url="${urlAttr}" data-titulo="${tituloAttr}" onclick="compartirNativo(this)" aria-label="Compartir" hidden><span class="btn-compartir-icono">${iconoCompartirNativo()}</span><span>Compartir</span></button>
      <a class="btn-compartir btn-whatsapp" href="https://api.whatsapp.com/send?text=${texto}%20${enlace}" target="_blank" rel="noopener noreferrer" aria-label="Compartir por WhatsApp"><span class="btn-compartir-icono">${iconoWhatsApp()}</span><span>WhatsApp</span></a>
      <a class="btn-compartir btn-x" href="https://twitter.com/intent/tweet?text=${texto}&url=${enlace}" target="_blank" rel="noopener noreferrer" aria-label="Compartir en X"><span class="btn-compartir-icono">${iconoX()}</span><span>X</span></a>
      <a class="btn-compartir btn-facebook" href="https://www.facebook.com/sharer/sharer.php?u=${enlace}" target="_blank" rel="noopener noreferrer" aria-label="Compartir en Facebook"><span class="btn-compartir-icono">${iconoFacebook()}</span><span>Facebook</span></a>
      <a class="btn-compartir btn-telegram" href="https://t.me/share/url?url=${enlace}&text=${texto}" target="_blank" rel="noopener noreferrer" aria-label="Compartir en Telegram"><span class="btn-compartir-icono">${iconoTelegram()}</span><span>Telegram</span></a>
      <a class="btn-compartir btn-instagram" href="${SITE.redes.instagram}" target="_blank" rel="noopener noreferrer" aria-label="Síguenos en Instagram"><span class="btn-compartir-icono">${iconoInstagram()}</span><span>Instagram</span></a>
      <button type="button" class="btn-compartir btn-copiar" data-url="${urlAttr}" onclick="copiarEnlaceCompartir(this)" aria-label="Copiar enlace"><span class="btn-compartir-icono">${iconoEnlace()}</span><span>Copiar enlace</span></button>
    </div>`;
}

// Revela el/los botón(es) de compartir nativo si el navegador soporta
// navigator.share. OJO: este bloque se pinta mediante innerHTML (ver
// compartirArticuloHTML más arriba), y los <script> insertados así NO se
// ejecutan nunca -- por eso esto vive aquí como función normal, para
// llamarla explícitamente en JS "de verdad" justo después de insertar el
// bloque en el DOM (p. ej. al final de renderNoticia en noticia.html).
function revelarBotonCompartirNativo() {
  if (!navigator.share) return;
  document.querySelectorAll(".btn-compartir-nativo[hidden]").forEach((b) => { b.hidden = false; });
}

// Abre el menú nativo de compartir del sistema (hoja de compartir de
// iOS/Android). Si el usuario cancela el diálogo, el navegador rechaza la
// promesa con AbortError: eso no es un fallo real, así que no se muestra
// ningún error en ese caso, solo si share() falla por otro motivo (poco
// habitual), en cuyo caso se cae a los botones de siempre, que ya están
// justo debajo.
function compartirNativo(btn) {
  const url = btn.dataset.url;
  const titulo = btn.dataset.titulo;
  navigator.share({ title: titulo, url }).catch((err) => {
    if (err && err.name === "AbortError") return;
  });
}

// Bloque completo (mismo formato que estadoHTML) para poner al final de
// cada noticia/crónica/opinión/entrevista, invitando a compartirla.
function compartirArticuloHTML(article, url = location.href) {
  const etiqueta = tipoContenidoLabel(article && article.tipo);
  return estadoHTML({
    titulo: "¿Te ha gustado?",
    texto: `Si te ha gustado esta ${etiqueta}, ¡compártela!`,
    tipo: "compartir",
    cta: botonesCompartirHTML(url, article && article.titulo),
  });
}

// Copia el enlace al portapapeles y da feedback visual en el propio botón.
function copiarEnlaceCompartir(btn) {
  const url = btn.dataset.url;
  // OJO: el botón tiene DOS <span> (el icono ".btn-compartir-icono" y el
  // texto). querySelector("span") cogía el primero (el del icono) y al
  // sustituir su contenido por "¡Copiado!" se perdía el SVG y se rompía
  // el círculo del icono. Hay que coger el span de texto, que es el
  // último de los dos.
  const spans = btn.querySelectorAll("span");
  const span = spans[spans.length - 1];
  const original = span.textContent;
  const marcarCopiado = () => {
    span.textContent = "¡Copiado!";
    btn.classList.add("copiado");
    setTimeout(() => {
      span.textContent = original;
      btn.classList.remove("copiado");
    }, 1800);
  };
  const mostrarEnlaceManual = () => {
    if (window.EOF && EOF.preguntar) {
      EOF.preguntar("Copia el enlace manualmente:", url, { soloLectura: true, textoConfirmar: "Cerrar" });
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(marcarCopiado).catch(mostrarEnlaceManual);
  } else {
    mostrarEnlaceManual();
  }
}