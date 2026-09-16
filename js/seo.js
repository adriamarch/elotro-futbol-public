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

function _seoUrlAbsoluta(pathConQuery) {
  try {
    return new URL(pathConQuery, SEO_DOMINIO).toString();
  } catch {
    return SEO_DOMINIO;
  }
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
    finalizado: "https://schema.org/EventCompleted",
  };

  const equipo = (nombre, escudoUrl) => ({
    "@type": "SportsTeam",
    "name": nombre,
    "logo": escudoUrl ? _seoUrlAbsoluta(escudoUrl) : undefined,
  });

  const sportsEvent = {
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
  if (imagen) _seoMeta("property", "og:image", _seoUrlAbsoluta(imagen));

  _seoMeta("name", "twitter:card", imagen ? "summary_large_image" : "summary");
  if (titulo) _seoMeta("name", "twitter:title", titulo);
  if (descripcion) _seoMeta("name", "twitter:description", descripcion);
  if (imagen) _seoMeta("name", "twitter:image", _seoUrlAbsoluta(imagen));

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

  const titulo = `${textos.titulo} — ELOTROFUTBOLTV`;
  const descripcion = resumText(textos.contenido || "", 160) || textos.subtitulo || "";

  const tEl = document.getElementById("pageTitle") || document.querySelector("title");
  if (tEl) tEl.textContent = titulo;
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
  if (imagenUrl) {
    _seoMeta("property", "og:image", _seoUrlAbsoluta(imagenUrl));
    _seoMeta("name", "twitter:card", "summary_large_image");
    _seoMeta("name", "twitter:image", _seoUrlAbsoluta(imagenUrl));
  } else {
    _seoMeta("name", "twitter:card", "summary");
  }
  _seoMeta("name", "twitter:title", titulo);
  if (descripcion) _seoMeta("name", "twitter:description", descripcion);

  _seoLimpiarJsonLd();
  const ld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": textos.titulo,
    "description": descripcion || undefined,
    "inLanguage": infoIdioma.html,
    "mainEntityOfPage": { "@type": "WebPage", "@id": urlCanonica },
    "datePublished": article.fecha_publicacion || undefined,
    "dateModified": article.fecha_actualizacion || article.fecha_publicacion || undefined,
    "image": imagenUrl ? [_seoUrlAbsoluta(imagenUrl)] : undefined,
    "author": article.autor_nombre
      ? (article.coautor_nombre
          ? [{ "@type": "Person", "name": article.autor_nombre }, { "@type": "Person", "name": article.coautor_nombre }]
          : { "@type": "Person", "name": article.autor_nombre })
      : undefined,
    "publisher": {
      "@type": "Organization",
      "name": (typeof SITE !== "undefined" && SITE.nombre) || "ELOTROFÚTBOLTV",
      "logo": { "@type": "ImageObject", "url": _seoUrlAbsoluta((typeof SITE !== "undefined" && SITE.logo) || "img/logo.png") },
    },
  };
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
      urlPath: `categoria.html?cat=${encodeURIComponent(article.categoria)}`,
    });
  }
  // "club" puede traer 1 o 2 nombres (previa/crónica vinculada a un
  // resultado, ver parsearClubArticulo en config.js): se añade una miga
  // por cada uno, cada una enlazando a la página de ESE club, en vez de
  // una sola miga combinada que no podría enlazar a los dos a la vez.
  parsearClubArticulo(article.club).forEach((club) => {
    migas.push({
      nombre: club,
      urlPath: `categoria.html?cat=${encodeURIComponent(article.categoria || "general")}&club=${encodeURIComponent(club)}`,
    });
  });
  migas.push({ nombre: textos.titulo });
  return migas;
}
