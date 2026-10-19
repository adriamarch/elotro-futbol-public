// ---------- SEO compartido (Fase 3) ----------
// Módulo único para que todas las páginas públicas mantengan de forma
// consistente: <html lang>, <title>, meta description, canonical,
// hreflang (incluyendo el caso especial de noticia.html con selector de
// idioma), Open Graph / og:locale, Twitter Card y JSON-LD.
//
// Nada de esto depende de la API: son solo funciones de ayuda que cada
// página llama con los datos que ya tiene (o va obteniendo).

const SEO_DOMINIO = "https://elotrofutbol.media";

// Códigos de idioma que soporta el sitio para el contenido de una noticia
// (deben coincidir con IDIOMAS_NOTICIA en noticia.html) y su equivalente
// en formato "locale" para og:locale / hreflang.
const SEO_IDIOMAS = {
  es: { html: "es", ogLocale: "es_ES", nombre: "Castellano" },
  eu: { html: "eu", ogLocale: "eu_ES", nombre: "Euskera" },
  ca: { html: "ca", ogLocale: "ca_ES", nombre: "Català" },
  gl: { html: "gl", ogLocale: "gl_ES", nombre: "Galego" },
  en: { html: "en", ogLocale: "en_US", nombre: "English" },
};
const SEO_IDIOMA_POR_DEFECTO = "es";

// Crea (si no existe) o reutiliza una etiqueta <meta> localizada por un
// atributo dado (name o property) y le fija el "content". Evita duplicar
// etiquetas si esta función se llama varias veces (p. ej. al cambiar de
// idioma dentro de la misma noticia).
function _seoMeta(attr, valor, content) {
  let el = document.head.querySelector(`meta[${attr}="${valor}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, valor);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content ?? "");
  return el;
}

function _seoLink(rel, href, extraAttrs) {
  // Para "alternate" puede haber varias etiquetas (una por idioma), así
  // que además del rel se distingue por hreflang/href para no pisarlas
  // entre sí ni duplicarlas al re-ejecutar.
  const hreflang = extraAttrs && extraAttrs.hreflang;
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  if (extraAttrs) {
    Object.entries(extraAttrs).forEach(([k, v]) => el.setAttribute(k, v));
  }
  return el;
}

// Quita todas las etiquetas <link rel="alternate" hreflang="..."> puestas
// previamente por este módulo, para reconstruirlas limpias (útil cuando
// una noticia cambia sus idiomas disponibles al recargar).
function _seoLimpiarHreflang() {
  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
}

// Fecha de la BD ("2026-10-04 18:30:00", UTC) o ISO -> ISO 8601 con zona
// horaria explícita. Google la exige en datePublished/dateModified; sin ella
// puede interpretar mal la hora de una noticia de última hora. Mismo criterio
// que aFechaIsoSeo() de public/src-worker.js.
function _seoFechaIso(valor) {
  if (!valor) return undefined;
  const txt = String(valor);
  const conZona = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(txt);
  const d = new Date(txt.includes("T") || conZona ? txt : `${txt.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function _seoLimpiarJsonLd() {
  const previo = document.getElementById("seo-jsonld");
  if (previo) previo.remove();
}

// El BreadcrumbList y el SportsEvent/LiveBlogPosting van en bloques
// <script type="application/ld+json"> aparte del NewsArticle/página
// principal (Google acepta varios JSON-LD por página, no hace falta ni
// es buena idea fundirlos en un único objeto), así que se limpian por
// su cuenta con sus propios id para poder reconstruirlos sin duplicar.
function _seoLimpiarJsonLdExtra(id) {
  const previo = document.getElementById(id);
  if (previo) previo.remove();
}

function _seoInsertarJsonLd(id, datos) {
  _seoLimpiarJsonLdExtra(id);
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = id;
  script.textContent = JSON.stringify(datos);
  document.head.appendChild(script);
}

// Imagen de previsualización por defecto (WhatsApp, Telegram, X, Facebook...)
// para páginas y noticias sin imagen propia: logo NEGRO sobre fondo BLANCO,
// opaca (los previews no soportan bien la transparencia: el logo blanco
// de img/logo.png desaparece sobre las tarjetas claras). Ver img/og-default.png.
const SEO_IMAGEN_POR_DEFECTO = "img/og-default.png";

function _seoUrlAbsoluta(pathConQuery) {
  try {
    const u = new URL(pathConQuery, SEO_DOMINIO);
    // Cloudflare redirige /pagina.html -> /pagina (307): el canonical, las
    // migas y og:url deben apuntar siempre a la URL final, sin extensión.
    u.pathname = u.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
    return u.toString();
  } catch {
    return SEO_DOMINIO;
  }
}

// Handle de X/Twitter del sitio (twitter:site). Igual que en src-worker.js.
const SEO_TWITTER_SITE = "@elotrofutbol";

// Recorte de una foto de Cloudinary en JPG (c_fill, g_auto) para redes y
// Google Discover. Misma lógica que seoImagenSocialWorker en src-worker.js.
function seoImagenSocial(url, ancho, alto) {
  if (!url || typeof url !== "string") return { url: url || "", ancho: 0, alto: 0 };
  const marca = "/upload/";
  const i = url.indexOf(marca);
  if (i === -1 || !/res\.cloudinary\.com/.test(url)) return { url, ancho: 0, alto: 0 };
  const t = `f_jpg,q_auto:good,c_fill,g_auto,w_${ancho},h_${alto}`;
  return { url: url.slice(0, i + marca.length) + t + "/" + url.slice(i + marca.length), ancho, alto };
}

// Persona autora para JSON-LD, con enlace a su perfil si hay id.
function _seoPersonaAutor(nombre, id) {
  const persona = { "@type": "Person", "name": nombre };
  if (id) persona.url = _seoUrlAbsoluta(`/autor?id=${encodeURIComponent(id)}`);
  return persona;
}

/**
 * Fija los metadatos básicos de una página estática (sin selector de
 * idioma de contenido): título, description, canonical, og:*, twitter:card
 * y opcionalmente un hreflang "x-default" simple hacia sí misma (para que
 * los buscadores no la traten como duplicado de nada).
 *
 * opciones:
 *  - titulo: string (obligatorio) — se usa tal cual en <title> y og:title
 *  - descripcion: string
 *  - urlPath: ruta relativa (p. ej. "categoria.html?cat=hypermotion"); si
 *    se omite se usa location.pathname + location.search
 *  - tipo: "website" | "article" (og:type, por defecto "website")
 *  - imagen: URL absoluta o relativa de la imagen og:image
 *  - noindex: boolean — añade <meta name="robots" content="noindex">
 */
/**
 * Inserta (o sustituye) el JSON-LD de tipo BreadcrumbList: la miguita
 * de pan que Google puede mostrar en resultados de búsqueda debajo del
 * título, en vez de la URL a pelo. Se usa tanto en categoría/portada de
 * club como en noticia.html.
 *
 * migas: array de { nombre, urlPath } en orden desde el inicio (Inicio
 * siempre se añade automáticamente como primer elemento si no se pasa
 * ya explícito) hasta la página actual. El último elemento no necesita
 * urlPath: si se omite, se usa la URL actual (item omitido, tal como
 * indica la documentación de Google para el último nivel).
 */
function fijarBreadcrumbs(migas) {
  if (!Array.isArray(migas) || !migas.length) {
    _seoLimpiarJsonLdExtra("seo-jsonld-breadcrumb");
    return;
  }
  const conInicio = migas[0] && migas[0].urlPath === "index.html"
    ? migas
    : [{ nombre: "Inicio", urlPath: "index.html" }, ...migas];

  const itemListElement = conInicio.map((miga, i) => {
    const esUltima = i === conInicio.length - 1;
    const item = {
      "@type": "ListItem",
      "position": i + 1,
      "name": miga.nombre,
    };
    // El último nivel (la página actual) puede omitir "item": es lo que
    // recomienda Google cuando esa miga no tiene una URL distinta a la
    // que ya se está viendo.
    if (!esUltima || miga.urlPath) {
      item.item = _seoUrlAbsoluta(miga.urlPath ?? (location.pathname + location.search));
    }
    return item;
  });

  _seoInsertarJsonLd("seo-jsonld-breadcrumb", {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  });
}

// ============================================================
// SEO DE PREVIAS Y CRÓNICAS (búsquedas tipo "equipo1-equipo2")
//
// Una previa/crónica está vinculada a un partido (article.resultado). Con
// ese dato se garantiza que el <title>, la description y el JSON-LD lleven
// SIEMPRE los dos equipos juntos ("Local - Visitante"), la jornada, la
// competición y, en crónicas, el marcador: es lo que la gente escribe en
// Google ("valladolid lugo", "valladolid - lugo crónica").
//
// IMPORTANTE: este bloque está duplicado en public/js/seo.js (cliente) y en
// public/src-worker.js + public/_worker.js (servidor). Mantenerlos iguales:
// si cliente y servidor generan <title>/description distintos, Google ve
// señales contradictorias según renderice o no el JavaScript.
// ============================================================
const SEO_CLUB_PREFIJOS = new Set(["cf", "cd", "ud", "sd", "fc", "ad", "ce", "rcd", "rc", "cp", "ue"]);
const SEO_CLUB_SUFIJOS = new Set(["cf", "fc", "cd", "ud", "sd", "sad"]);
const SEO_COMPETICIONES_CON_JORNADA = new Set(["hypermotion", "primera_federacion", "segunda_federacion"]);
const SEO_MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function seoNormalizar(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// "Real Valladolid CF" -> "Real Valladolid", "CD Lugo" -> "Lugo": nombre
// corto para el <title>, donde cada carácter cuenta (Google corta hacia 60).
// En description y JSON-LD se usa el nombre completo.
function seoNombreCortoEquipo(nombre) {
  const original = String(nombre ?? "").trim();
  const partes = original.split(/\s+/).filter(Boolean);
  if (partes.length > 1 && SEO_CLUB_PREFIJOS.has(seoNormalizar(partes[0]))) partes.shift();
  if (partes.length > 1 && SEO_CLUB_SUFIJOS.has(seoNormalizar(partes[partes.length - 1]))) partes.pop();
  return partes.join(" ") || original;
}

function seoPartesFecha(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(valor ?? ""));
  return m ? { y: m[1], mo: m[2], d: m[3], h: m[4] || null, mi: m[5] || null } : null;
}

// fecha_partido es hora local de España sin zona ("2026-10-04T18:30"):
// para el JSON-LD se le añade el desplazamiento real de Europe/Madrid
// (+01:00 / +02:00 según la fecha). Solo fecha -> se deja solo la fecha.
function seoFechaPartidoIso(valor) {
  const f = seoPartesFecha(valor);
  if (!f) return undefined;
  if (!f.h) return `${f.y}-${f.mo}-${f.d}`;
  let offset = "+01:00";
  try {
    const ref = new Date(Date.UTC(+f.y, +f.mo - 1, +f.d, +f.h, +f.mi));
    const parte = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", timeZoneName: "longOffset" })
      .formatToParts(ref).find((x) => x.type === "timeZoneName");
    const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(parte ? parte.value : "");
    if (m) offset = `${m[1]}${m[2].padStart(2, "0")}:${m[3] || "00"}`;
  } catch {
    // Sin Intl con zonas horarias: se queda el +01:00 por defecto.
  }
  return `${f.y}-${f.mo}-${f.d}T${f.h}:${f.mi}:00${offset}`;
}

// Datos normalizados de la previa/crónica para construir título,
// descripción y JSON-LD. null si no es previa/crónica o no tiene los dos
// equipos. etiquetaCompeticion: función clave -> nombre legible.
function seoDatosPartido(article, etiquetaCompeticion) {
  const tipo = article && article.tipo;
  const r = article && article.resultado;
  if ((tipo !== "previa" && tipo !== "cronica") || !r || !r.equipo_local || !r.equipo_visitante) return null;
  const clave = r.competicion || article.categoria || "";
  const base = etiquetaCompeticion(clave) || "";
  const grupoCrudo = r.grupo ? String(r.grupo).trim() : "";
  const grupo = grupoCrudo ? (/^grupo/i.test(grupoCrudo) ? grupoCrudo : `Grupo ${grupoCrudo}`) : "";
  const finalizado = r.estado === "finalizado" && r.goles_local != null && r.goles_visitante != null;
  const f = seoPartesFecha(r.fecha_partido);
  const mes = f ? SEO_MESES[parseInt(f.mo, 10) - 1] : "";
  const jornadaNum = parseInt(r.jornada, 10);
  return {
    tipo,
    etiqueta: tipo === "cronica" ? "Crónica" : "Previa",
    local: String(r.equipo_local).trim(),
    visitante: String(r.equipo_visitante).trim(),
    localCorto: seoNombreCortoEquipo(r.equipo_local),
    visitanteCorto: seoNombreCortoEquipo(r.equipo_visitante),
    marcador: tipo === "cronica" && finalizado ? `${r.goles_local}-${r.goles_visitante}` : "",
    competicion: grupo ? `${base} ${grupo}`.trim() : base,
    jornada: SEO_COMPETICIONES_CON_JORNADA.has(clave) && jornadaNum > 0 ? jornadaNum : 0,
    fechaTxt: f && mes ? `${parseInt(f.d, 10)} de ${mes}` : "",
    hora: f && f.h && `${f.h}:${f.mi}` !== "00:00" ? `${f.h}:${f.mi}` : "",
    ubicacion: r.ubicacion ? String(r.ubicacion).trim() : "",
    resultado: r,
  };
}

// <title>: si el titular del redactor ya nombra a los dos equipos se deja
// tal cual; si no, se antepone "Crónica Local - Visitante (2-1): ". Nunca
// pasa de ~66 caracteres (se descartan primero el titular y luego la marca).
function seoTituloPartido(p, titulo, marca) {
  const t = String(titulo ?? "").trim();
  const MAX = 66;
  const norm = ` ${seoNormalizar(t)} `;
  const nombra = (nombre) => {
    const corto = seoNormalizar(seoNombreCortoEquipo(nombre));
    if (corto && norm.includes(` ${corto} `)) return true;
    const palabra = corto.split(" ").sort((a, b) => b.length - a.length)[0] || "";
    return palabra.length >= 4 && norm.includes(` ${palabra} `);
  };
  if (t && nombra(p.local) && nombra(p.visitante)) {
    const conMarca = marca ? `${t} — ${marca}` : t;
    return conMarca.length <= MAX ? conMarca : t;
  }
  const cab = `${p.etiqueta} ${p.localCorto} - ${p.visitanteCorto}${p.marcador ? ` (${p.marcador})` : ""}`;
  const candidatos = [];
  if (t) candidatos.push(`${cab}: ${t}`);
  if (p.jornada && p.competicion) candidatos.push(`${cab} — ${p.competicion}, jornada ${p.jornada}`);
  if (p.competicion) candidatos.push(`${cab} — ${p.competicion}`);
  return candidatos.find((c) => c.length <= MAX) || cab;
}

// Description: empieza SIEMPRE por "Crónica/Previa Local - Visitante ..."
// (la parte que Google resalta cuando se busca el cruce) y sigue con el
// subtítulo del redactor o, si no hay, con el arranque del texto.
function seoDescripcionPartido(p, subtitulo, contenidoPlano, resumir) {
  const par = `${p.local} - ${p.visitante}`;
  const jor = p.jornada ? `${p.jornada}ª jornada de ` : "";
  let cab;
  if (p.tipo === "cronica") {
    cab = `Crónica ${par}${p.marcador ? ` (${p.marcador})` : ""}, ${jor}${p.competicion}.`;
  } else {
    const cuando = p.fechaTxt ? `, el ${p.fechaTxt}${p.hora ? ` a las ${p.hora}` : ""}` : "";
    const donde = p.ubicacion ? ` en ${p.ubicacion}` : "";
    cab = `Previa ${par}: ${jor}${p.competicion}${cuando}${donde}.`;
  }
  const sub = resumir(subtitulo, 160);
  const resto = sub.length >= 30 ? sub : resumir(contenidoPlano, 160);
  return resumir(`${cab} ${resto}`.trim(), 160);
}

function seoKeywordsPartido(p) {
  const claves = [
    `${p.local} - ${p.visitante}`,
    `${p.localCorto} - ${p.visitanteCorto}`,
    `${p.localCorto} vs ${p.visitanteCorto}`,
    `${p.etiqueta} ${p.localCorto} ${p.visitanteCorto}`,
    p.competicion,
    p.jornada ? `jornada ${p.jornada}` : "",
  ].filter(Boolean);
  return Array.from(new Set(claves)).join(", ");
}

// JSON-LD SportsEvent del partido. OJO: schema.org NO tiene
// "EventCompleted" (el marcado anterior lo usaba y era inválido): un
// partido ya jugado sigue siendo EventScheduled.
function seoSportsEventJsonLd(p, urlCanonica, urlAbs) {
  const r = p.resultado;
  const estadoSchema = {
    retrasado: "https://schema.org/EventPostponed",
    suspendido: "https://schema.org/EventCancelled",
    anulado: "https://schema.org/EventCancelled",
  };
  const equipo = (nombre, escudo) => ({ "@type": "SportsTeam", "name": nombre, "logo": escudo ? urlAbs(escudo) : undefined });
  const local = equipo(p.local, r.escudo_local_url);
  const visitante = equipo(p.visitante, r.escudo_visitante_url);
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "name": `${p.local} - ${p.visitante}`,
    "description": `${p.competicion}${p.jornada ? `, jornada ${p.jornada}` : ""}`,
    "sport": "Fútbol",
    "startDate": seoFechaPartidoIso(r.fecha_partido),
    "eventStatus": estadoSchema[r.estado] || "https://schema.org/EventScheduled",
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "location": p.ubicacion ? { "@type": "Place", "name": p.ubicacion, "address": p.ubicacion } : undefined,
    "homeTeam": local,
    "awayTeam": visitante,
    "competitor": [local, visitante],
    "superEvent": p.competicion ? { "@type": "SportsEvent", "name": `${p.competicion}${p.jornada ? ` - Jornada ${p.jornada}` : ""}` } : undefined,
    "url": urlCanonica,
  };
}

/**
 * Inserta el JSON-LD de SportsEvent para un partido vinculado a una
 * noticia (article.resultado, el mismo objeto que pinta
 * marcadorArticuloHTML), y si la noticia lleva minuto a minuto (eventos
 * de partido en curso) añade también LiveBlogPosting, tal como hacen
 * Marca/AS en sus crónicas en directo: mejora el posicionamiento en
 * Google News/Discover mientras el partido se está jugando.
 *
 * article: el objeto de la noticia (para datePublished/dateModified,
 * autor y URL canónica del liveblog).
 * resultado: article.resultado (marcador + equipos + estado + fecha).
 * urlCanonica: URL absoluta ya calculada por fijarSeoNoticia (para no
 * recalcularla dos veces).
 */
function fijarSportsEventNoticia({ article, resultado, urlCanonica, titulo }) {
  if (!resultado || !resultado.equipo_local || !resultado.equipo_visitante) {
    _seoLimpiarJsonLdExtra("seo-jsonld-sportsevent");
    _seoLimpiarJsonLdExtra("seo-jsonld-liveblog");
    return;
  }

  const estadoASchema = {
    programado: "https://schema.org/EventScheduled",
    en_juego: "https://schema.org/EventScheduled",
    finalizado: "https://schema.org/EventScheduled", // EventCompleted no existe en schema.org
  };

  const equipo = (nombre, escudoUrl) => ({
    "@type": "SportsTeam",
    "name": nombre,
    "logo": escudoUrl ? _seoUrlAbsoluta(escudoUrl) : undefined,
  });

  const sportsEventBase = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "name": `${resultado.equipo_local} vs ${resultado.equipo_visitante}`,
    "sport": "Fútbol",
    "startDate": resultado.fecha_partido || article.fecha_publicacion || undefined,
    "eventStatus": estadoASchema[resultado.estado] || undefined,
    "location": resultado.ubicacion
      ? { "@type": "Place", "name": resultado.ubicacion }
      : undefined,
    "homeTeam": equipo(resultado.equipo_local, resultado.escudo_local_url),
    "awayTeam": equipo(resultado.equipo_visitante, resultado.escudo_visitante_url),
    "url": urlCanonica,
  };
  // Previa/crónica: mismo SportsEvent enriquecido que genera el servidor
  // (src-worker.js), para que cliente y servidor no se contradigan.
  const partidoSeo = seoDatosPartido({ ...article, resultado }, typeof categoriaLabel === "function" ? categoriaLabel : (k) => k);
  const sportsEvent = partidoSeo ? seoSportsEventJsonLd(partidoSeo, urlCanonica, _seoUrlAbsoluta) : sportsEventBase;
  _seoInsertarJsonLd("seo-jsonld-sportsevent", sportsEvent);

  // LiveBlogPosting solo tiene sentido mientras el partido está EN
  // JUEGO: es el marcado pensado para crónicas que se van actualizando
  // minuto a minuto durante el propio evento (Google lo usa como señal
  // de contenido "en directo" para Google News/Discover). Una vez el
  // partido termina, la noticia deja de ser un liveblog activo y basta
  // con el NewsArticle + SportsEvent normales, así que aquí se retira.
  if (resultado.estado !== "en_juego") {
    _seoLimpiarJsonLdExtra("seo-jsonld-liveblog");
    return;
  }

  const eventos = Array.isArray(resultado.eventos) ? resultado.eventos : [];
  const liveBlogUpdate = eventos.map((ev) => ({
    "@type": "BlogPosting",
    "headline": `Minuto ${ev.minuto ?? ""}${ev.minuto_extra ? "+" + ev.minuto_extra : ""}: ${ev.tipo}${ev.jugador ? " — " + ev.jugador : ""}`,
    "datePublished": article.fecha_publicacion || undefined,
  }));

  _seoInsertarJsonLd("seo-jsonld-liveblog", {
    "@context": "https://schema.org",
    "@type": "LiveBlogPosting",
    "headline": titulo,
    "url": urlCanonica,
    "coverageStartTime": resultado.fecha_partido || article.fecha_publicacion || undefined,
    "datePublished": article.fecha_publicacion || undefined,
    "dateModified": article.updated_at || article.fecha_publicacion || undefined,
    "about": {
      "@type": "SportsEvent",
      "name": `${resultado.equipo_local} vs ${resultado.equipo_visitante}`,
    },
    "liveBlogUpdate": liveBlogUpdate.length ? liveBlogUpdate : undefined,
  });
}

function fijarSeoBasico({ titulo, descripcion = "", urlPath, tipo = "website", imagen, noindex = false, migas } = {}) {
  document.documentElement.setAttribute("lang", SEO_IDIOMAS[SEO_IDIOMA_POR_DEFECTO].html);

  if (titulo) {
    const tEl = document.getElementById("pageTitle") || document.querySelector("title");
    if (tEl) tEl.textContent = titulo;
    else document.title = titulo;
  }

  if (descripcion) _seoMeta("name", "description", descripcion);

  const url = _seoUrlAbsoluta(urlPath ?? (location.pathname + location.search));
  _seoLink("canonical", url);

  _seoMeta("property", "og:type", tipo);
  _seoMeta("property", "og:site_name", (typeof SITE !== "undefined" && SITE.nombre) || "ELOTROFÚTBOLTV");
  _seoMeta("property", "og:url", url);
  if (titulo) _seoMeta("property", "og:title", titulo);
  if (descripcion) _seoMeta("property", "og:description", descripcion);
  _seoMeta("property", "og:locale", SEO_IDIOMAS[SEO_IDIOMA_POR_DEFECTO].ogLocale);
  imagen = imagen || SEO_IMAGEN_POR_DEFECTO;
  _seoMeta("property", "og:image", _seoUrlAbsoluta(imagen));

  _seoMeta("name", "twitter:card", "summary_large_image");
  _seoMeta("name", "twitter:site", SEO_TWITTER_SITE);
  if (titulo) _seoMeta("name", "twitter:title", titulo);
  if (descripcion) _seoMeta("name", "twitter:description", descripcion);
  _seoMeta("name", "twitter:image", _seoUrlAbsoluta(imagen));

  if (noindex) {
    _seoMeta("name", "robots", "noindex");
  }

  fijarBreadcrumbs(migas);
}

/**
 * SEO dinámico para noticia.html: se llama cada vez que se pinta o se
 * cambia el idioma mostrado. Actualiza <html lang>, título, description,
 * canonical (siempre a la URL "canónica" del artículo, sin ?lang, en
 * castellano), hreflang por cada idioma disponible + x-default, og:*,
 * og:locale del idioma actual y JSON-LD (NewsArticle).
 *
 * article: el objeto de la noticia tal como lo devuelve la API
 * idiomaActual: código del idioma que se está mostrando ahora ("es", "en"...)
 * disponibles: array de códigos de idioma con contenido real (sin fallback)
 * textos: { titulo, subtitulo, contenido } ya resueltos para idiomaActual
 */
function fijarSeoNoticia({ article, idiomaActual, disponibles, textos, migas }) {
  const infoIdioma = SEO_IDIOMAS[idiomaActual] || SEO_IDIOMAS[SEO_IDIOMA_POR_DEFECTO];
  document.documentElement.setAttribute("lang", infoIdioma.html);

  const slug = article.slug || new URLSearchParams(location.search).get("slug") || "";
  const urlBase = urlNoticia(article.categoria, slug);
  const urlCanonica = _seoUrlAbsoluta(urlBase);
  const urlActual = _seoUrlAbsoluta(idiomaActual === SEO_IDIOMA_POR_DEFECTO ? urlBase : `${urlBase}?lang=${idiomaActual}`);

  const marcaSitio = (typeof SITE !== "undefined" && SITE.nombre) || "ELOTROFÚTBOLTV";
  const titulo = `${textos.titulo} — ${marcaSitio}`;
  // Misma regla que el servidor (construirMetaNoticia en src-worker.js): el
  // subtítulo del redactor si tiene cuerpo suficiente; si no, el arranque
  // del texto. Antes el cliente pisaba la description del servidor con el
  // arranque del texto (a veces una cabecera tipo "MADRID, 4 oct.").
  const subtituloLimpio = resumText(textos.subtitulo || "", 160);
  let descripcion = (subtituloLimpio.length >= 50 ? subtituloLimpio : "")
    || resumText(textos.contenido || "", 160) || subtituloLimpio || "";

  // Previa/crónica de un partido: título y descripción con los dos equipos.
  const partidoSeo = idiomaActual === SEO_IDIOMA_POR_DEFECTO
    ? seoDatosPartido(article, typeof categoriaLabel === "function" ? categoriaLabel : (k) => k)
    : null;
  let tituloPagina = titulo;
  if (partidoSeo) {
    tituloPagina = seoTituloPartido(partidoSeo, textos.titulo, marcaSitio);
    descripcion = seoDescripcionPartido(partidoSeo, textos.subtitulo || "", String(textos.contenido || "").replace(/<[^>]+>/g, " "), resumText);
  }

  const tEl = document.getElementById("pageTitle") || document.querySelector("title");
  if (tEl) tEl.textContent = tituloPagina;
  if (descripcion) _seoMeta("name", "description", descripcion);

  // El canonical apunta siempre a la versión por defecto (castellano) del
  // artículo: es la práctica recomendada cuando el resto de idiomas se
  // sirven bajo la misma URL base con un parámetro, para no repartir la
  // señal de "página principal" entre varias URLs equivalentes.
  _seoLink("canonical", urlCanonica);

  // hreflang: una etiqueta por cada idioma realmente disponible (más
  // castellano, que siempre lo está de facto) apuntando a
  // /futbol/categoria/slug?lang=xx, y un x-default hacia la versión sin
  // parámetro (castellano), tal como recomienda Google para variantes de
  // idioma servidas bajo una misma URL base.
  _seoLimpiarHreflang();
  const idiomasParaHreflang = Array.from(new Set([SEO_IDIOMA_POR_DEFECTO, ...(disponibles || [])]));
  idiomasParaHreflang.forEach((cod) => {
    const info = SEO_IDIOMAS[cod];
    if (!info) return;
    const href = cod === SEO_IDIOMA_POR_DEFECTO ? urlCanonica : _seoUrlAbsoluta(`${urlBase}?lang=${cod}`);
    _seoLink("alternate", href, { hreflang: info.html });
  });
  _seoLink("alternate", urlCanonica, { hreflang: "x-default" });

  _seoMeta("property", "og:type", "article");
  _seoMeta("property", "og:site_name", (typeof SITE !== "undefined" && SITE.nombre) || "ELOTROFÚTBOLTV");
  _seoMeta("property", "og:url", urlActual);
  _seoMeta("property", "og:title", titulo);
  if (descripcion) _seoMeta("property", "og:description", descripcion);
  _seoMeta("property", "og:locale", infoIdioma.ogLocale);
  // Los demás idiomas disponibles se anuncian como locales alternativos
  // del mismo og:object, tal como especifica Open Graph.
  document.head.querySelectorAll('meta[property="og:locale:alternate"]').forEach((el) => el.remove());
  idiomasParaHreflang
    .filter((cod) => cod !== idiomaActual)
    .forEach((cod) => {
      const el = document.createElement("meta");
      el.setAttribute("property", "og:locale:alternate");
      el.setAttribute("content", SEO_IDIOMAS[cod].ogLocale);
      document.head.appendChild(el);
    });

  const imagenUrl = article.imagen_url || (Array.isArray(article.imagenes) && article.imagenes[0] && (article.imagenes[0].url || article.imagenes[0])) || "";
  // Mismo recorte 1200x630 que sirve el worker (src-worker.js): si cliente y
  // servidor generan imágenes distintas, redes y buscadores ven señales mixtas.
  const imgSocial = imagenUrl ? seoImagenSocial(_seoUrlAbsoluta(imagenUrl), 1200, 630) : { url: "", ancho: 0, alto: 0 };
  const imagenOgAbs = imgSocial.url || _seoUrlAbsoluta(imagenUrl || SEO_IMAGEN_POR_DEFECTO);
  const ogAncho = imgSocial.ancho || (imagenUrl ? 0 : 1200);
  const ogAlto = imgSocial.alto || (imagenUrl ? 0 : 630);
  _seoMeta("property", "og:image", imagenOgAbs);
  if (ogAncho) {
    _seoMeta("property", "og:image:width", String(ogAncho));
    _seoMeta("property", "og:image:height", String(ogAlto));
  } else {
    document.head.querySelectorAll('meta[property="og:image:width"],meta[property="og:image:height"]').forEach((el) => el.remove());
  }
  _seoMeta("name", "twitter:card", "summary_large_image");
  _seoMeta("name", "twitter:site", SEO_TWITTER_SITE);
  _seoMeta("name", "twitter:image", imagenOgAbs);
  _seoMeta("name", "twitter:title", titulo);
  if (descripcion) _seoMeta("name", "twitter:description", descripcion);

  _seoLimpiarJsonLd();
  const contenidoPlanoSeo = String(textos.contenido || "").replace(/<[^>]+>/g, " ").trim();
  const etiquetaCatSeo = article.categoria
    ? (typeof categoriaLabel === "function" ? categoriaLabel(article.categoria) : article.categoria)
    : "";
  const clubsSeo = typeof parsearClubArticulo === "function" ? parsearClubArticulo(article.club).filter((c) => !c.startsWith("[")) : [];
  const palabrasClaveSeo = Array.from(new Set([...clubsSeo, etiquetaCatSeo].filter(Boolean)));
  const ld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": textos.titulo,
    "description": descripcion || undefined,
    "inLanguage": infoIdioma.html,
    "isAccessibleForFree": true,
    "articleSection": etiquetaCatSeo || undefined,
    "wordCount": contenidoPlanoSeo ? contenidoPlanoSeo.split(/\s+/).length : undefined,
    "mainEntityOfPage": { "@type": "WebPage", "@id": urlCanonica },
    "datePublished": _seoFechaIso(article.fecha_publicacion),
    "dateModified": _seoFechaIso(article.fecha_actualizacion || article.updated_at || article.fecha_publicacion),
    "image": imagenUrl
      ? [[1200, 675], [1200, 900], [1200, 1200]].map(([w, h]) => seoImagenSocial(_seoUrlAbsoluta(imagenUrl), w, h).url)
      : undefined,
    "thumbnailUrl": imagenUrl ? imagenOgAbs : undefined,
    "isPartOf": { "@type": "WebSite", "@id": SEO_DOMINIO + "/#sitio" },
    "author": article.autor_nombre
      ? (article.coautor_nombre
          ? [_seoPersonaAutor(article.autor_nombre, article.autor_id), _seoPersonaAutor(article.coautor_nombre, article.coautor_id)]
          : _seoPersonaAutor(article.autor_nombre, article.autor_id))
      : { "@type": "Organization", "@id": SEO_DOMINIO + "/#organizacion", "name": (typeof SITE !== "undefined" && SITE.nombre) || "ELOTROFÚTBOLTV" },
    "publisher": {
      "@type": "Organization",
      "@id": SEO_DOMINIO + "/#organizacion",
      "name": (typeof SITE !== "undefined" && SITE.nombre) || "ELOTROFÚTBOLTV",
      "logo": { "@type": "ImageObject", "url": _seoUrlAbsoluta((typeof SITE !== "undefined" && SITE.logo) || "img/logo.png") },
    },
  };
  if (!partidoSeo && palabrasClaveSeo.length) {
    ld.keywords = palabrasClaveSeo.join(", ");
    if (clubsSeo.length) ld.mentions = clubsSeo.map((nombre) => ({ "@type": "SportsTeam", "name": nombre }));
  }
  if (partidoSeo) {
    ld.keywords = seoKeywordsPartido(partidoSeo);
    ld.about = { "@type": "SportsEvent", "name": `${partidoSeo.local} - ${partidoSeo.visitante}` };
    ld.mentions = [{ "@type": "SportsTeam", "name": partidoSeo.local }, { "@type": "SportsTeam", "name": partidoSeo.visitante }];
  }
  // JSON.stringify omite las claves con valor undefined automáticamente,
  // así que no hace falta limpiar el objeto a mano.
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = "seo-jsonld";
  script.textContent = JSON.stringify(ld);
  document.head.appendChild(script);

  // BreadcrumbList: Inicio > Categoría (> Club, si la noticia tiene uno
  // asignado) > título de la noticia. Si la propia página no ha pasado
  // "migas" explícitas (categoria.html/autor.html sí lo harán a mano),
  // se construyen aquí a partir de los datos que ya trae el artículo.
  fijarBreadcrumbs(migas || migasNoticiaPorDefecto(article, textos));

  // SportsEvent (+ LiveBlogPosting si el partido está en_juego): solo
  // si la noticia está vinculada a un resultado, igual que
  // marcadorArticuloHTML.
  fijarSportsEventNoticia({
    article,
    resultado: article.resultado,
    urlCanonica,
    titulo: textos.titulo,
  });
}

// Construye las migas por defecto de una noticia: Inicio > Categoría
// [> Club] > Título. categoriaLabel()/CATEGORIES viven en config.js, que
// siempre se carga antes que este módulo en las páginas públicas.
function migasNoticiaPorDefecto(article, textos) {
  const migas = [];
  if (article.categoria) {
    migas.push({
      nombre: typeof categoriaLabel === "function" ? categoriaLabel(article.categoria) : article.categoria,
      urlPath: `/categoria?cat=${encodeURIComponent(article.categoria)}`,
    });
  }
  // "club" puede traer 1 o 2 nombres (previa/crónica vinculada a un
  // resultado, ver parsearClubArticulo en config.js): se añade una miga
  // por cada uno, cada una enlazando a la página de ESE club, en vez de
  // una sola miga combinada que no podría enlazar a los dos a la vez.
  parsearClubArticulo(article.club).forEach((club) => {
    migas.push({
      nombre: club,
      urlPath: `/categoria?cat=${encodeURIComponent(article.categoria || "general")}&club=${encodeURIComponent(club)}`,
    });
  });
  migas.push({ nombre: textos.titulo });
  return migas;
}
