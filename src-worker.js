// src-worker.js — Worker de Cloudflare para el sitio (Pages con "main"
// apuntando aquí, ver wrangler.jsonc: "main": "src-worker.js"). Es EL
// ARCHIVO QUE REALMENTE SE DESPLIEGA con "wrangler deploy" desde la raíz
// del proyecto — importante: existe también public/_worker.js con el
// mismo contenido; mantener ambos sincronizados si se vuelve a tocar
// esta lógica (o, mejor, mover uno a ser el único real más adelante).
//
// Pages sirve "public/" como archivos estáticos. Este worker se ejecuta
// ANTES de esa capa de estáticos, con una única función: cuando la ruta
// es /futbol/{categoria}/{slug}, reescribe la petición internamente hacia
// /noticia.html?slug={slug} y sirve ESE archivo (con env.ASSETS.fetch),
// pero sin redirigir el navegador: la barra de direcciones se queda en
// la URL bonita. noticia.html no cambia cómo lee el slug (sigue siendo
// un parámetro de la URL real que le llega), así que no hace falta
// tocarlo aquí.
//
// SIN REDIRECCIONES entre formatos de enlace. Antes este archivo también
// hacía un 301 de /noticia.html?slug=... hacia la URL bonita equivalente,
// para "unificar" el enlace de toda noticia al formato nuevo. Eso causaba
// un bucle infinito: la reescritura interna de arriba genera justo una
// petición a "/noticia.html?slug=...", que volvía a pasar por ESTE MISMO
// worker (Cloudflare Pages lo ejecuta en cada fetch, incluidos los
// internos) y coincidía con la regla del 301, que redirigía de vuelta a
// la URL bonita -> que reentraba en la reescritura de arriba -> bucle
// ("elotrofutbol.media te ha redirigido demasiadas veces").
//
// La solución no es "arreglar" ese 301: es no tenerlo. Cada noticia ya
// decide su propio formato de enlace, para siempre, en el momento de
// crearse (columna usa_url_bonita en la tabla articles, ver
// worker/schema.sql y worker/src/index.js -> urlNoticia()):
//   - Noticias nuevas: enlace bonito /futbol/{categoria}/{slug}.
//   - Noticias que ya existían: conservan su enlace de siempre,
//     /noticia.html?slug={slug}.
// Este worker simplemente SIRVE los dos formatos, sin convertir nunca
// uno en otro ni redirigir entre ellos.
//
// El resto de rutas (todo lo demás: css, js, imágenes, otras páginas)
// no se tocan: caen directas a env.ASSETS.fetch(request), que es
// exactamente lo que Pages hacía antes de que existiera este archivo.
//
// IMPORTANTE sobre el formato: tiene que ser Module syntax
// (export default { fetch(request, env) {...} }), NUNCA Service Worker
// clásico (addEventListener("fetch", ...)). Es un requisito documentado
// de Cloudflare Pages "Advanced Mode": con Service Worker syntax no
// existe "env" ni el binding ASSETS, así que no hay forma de reenviar a
// los estáticos correctamente.
//
// Importante también: este worker corre en el dominio del SITIO (Pages),
// no en el de la API (Cloudflare Workers de worker/). Son proyectos
// Cloudflare distintos y este archivo no substituye a worker/src/index.js.

// Página de mantenimiento temporal para el SITIO (Cloudflare Pages).
// Es la misma plantilla visual que worker/src/index.js usa para la API
// (paginaMantenimiento) -- se duplica aquí porque son dos proyectos
// Cloudflare distintos (Pages y Workers) que no comparten código en
// tiempo de ejecución. Si se cambia el diseño en un sitio, replicarlo
// en el otro para que ambos digan lo mismo.
function escapeHtmlMantenimiento(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function paginaMantenimientoSitio(horaHasta) {
  const fraseHora = horaHasta
    ? `Volvemos sobre las <strong>${escapeHtmlMantenimiento(horaHasta)}</strong>.`
    : "Volvemos en breve.";
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>ELOTROFÚTBOLTV — En mantenimiento</title>
<style>
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-14px); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: .55; }
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }
  body {
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle at 20% 20%, #0f3d5c 0%, #0a2540 45%, #061627 100%);
    color: #eaf2f8;
    overflow: hidden;
    position: relative;
  }
  body::before, body::after {
    content: "";
    position: absolute;
    border-radius: 50%;
    filter: blur(60px);
    opacity: .35;
  }
  body::before {
    width: 420px; height: 420px;
    background: #e63946;
    top: -120px; left: -120px;
  }
  body::after {
    width: 380px; height: 380px;
    background: #1d7a8c;
    bottom: -140px; right: -100px;
  }
  .card {
    position: relative;
    z-index: 1;
    max-width: 480px;
    margin: 24px;
    padding: 48px 36px;
    text-align: center;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 24px;
    backdrop-filter: blur(14px);
    box-shadow: 0 25px 60px rgba(0,0,0,0.45);
  }
  .ball {
    font-size: 56px;
    display: inline-block;
    animation: float 3s ease-in-out infinite;
  }
  h1 {
    margin: 20px 0 8px;
    font-size: 26px;
    letter-spacing: .3px;
    color: #ffffff;
  }
  p {
    margin: 0 0 6px;
    font-size: 15.5px;
    line-height: 1.6;
    color: #c6d6e2;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 22px;
    padding: 8px 16px;
    border-radius: 999px;
    background: rgba(230, 57, 70, 0.15);
    border: 1px solid rgba(230, 57, 70, 0.4);
    color: #ff9aa2;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: .4px;
    text-transform: uppercase;
  }
  .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #ff5a64;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .brand {
    margin-top: 28px;
    font-size: 13px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: rgba(234,242,248,0.45);
  }
  .brand b { color: rgba(234,242,248,0.75); }
</style>
</head>
<body>
  <div class="card">
    <span class="ball">⚽</span>
    <h1>Estamos haciendo un ajuste rápido</h1>
    <p>ELOTROFÚTBOLTV vuelve enseguida, mejor que nunca.</p>
    <p>${fraseHora}</p>
    <div class="badge"><span class="dot"></span>Mantenimiento en curso</div>
    <div class="brand">EL<b>OTRO</b>FÚTBOLTV</div>
  </div>
</body>
</html>`;
}

// ============================================================
// SEO EN SERVIDOR PARA noticia.html
//
// Antes, todos los metadatos (og:*, twitter:*, JSON-LD, canonical,
// hreflang...) los inyectaba public/js/seo.js DESPUÉS de que el
// navegador ejecutara JS y la API respondiera. Eso significa que
// cualquier bot que no ejecute JavaScript (la mayoría de crawlers de
// redes sociales: Facebook/WhatsApp/Twitter-X, y muchos bots de
// mensajería) ve el HTML genérico de la plantilla, no el de la
// noticia real: mala vista previa al compartir el enlace y peor señal
// para SEO.
//
// Estas funciones reescriben el <head> de noticia.html EN EL WORKER,
// antes de servirlo, usando los mismos datos que ya expone
// /api/articles/{slug}. seo.js se deja intacto y sigue actuando en
// cliente (recalcula lo mismo si el usuario cambia de idioma con el
// selector, o simplemente confirma lo que ya se sirvió) — es un
// refuerzo, no una sustitución de esa lógica de cliente.
// ============================================================

const SEO_DOMINIO_WORKER = "https://elotrofutbol.media";
const SEO_NOMBRE_SITIO = "ELOTROFÚTBOLTV";
// Debe coincidir con SEO_IDIOMAS de public/js/seo.js.
const SEO_IDIOMAS_WORKER = {
  es: { html: "es", ogLocale: "es_ES" },
  eu: { html: "eu", ogLocale: "eu_ES" },
  ca: { html: "ca", ogLocale: "ca_ES" },
  gl: { html: "gl", ogLocale: "gl_ES" },
  en: { html: "en", ogLocale: "en_US" },
};
const SEO_IDIOMA_DEFECTO_WORKER = "es";

function escapeHtmlSeo(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// "club" en articles puede ser un unico nombre en texto plano, o un
// array JSON de 2 clubes (previa/cronica vinculada a un resultado, ver
// resolverClubArticulo en worker/src/index.js): se muestra unido por
// " - " en vez del texto crudo del array.
function clubArticuloLegibleSeo(valorClub) {
  if (!valorClub) return "";
  try {
    const parsed = JSON.parse(valorClub);
    if (Array.isArray(parsed)) return parsed.filter((c) => typeof c === "string" && c.trim()).join(" - ");
  } catch {
    // No es JSON: club unico en texto plano.
  }
  return typeof valorClub === "string" ? valorClub : "";
}

function seoUrlAbsolutaWorker(pathConQuery) {
  try {
    return new URL(pathConQuery, SEO_DOMINIO_WORKER).toString();
  } catch {
    return SEO_DOMINIO_WORKER;
  }
}

// Recorta un texto a un número máximo de caracteres sin cortar palabras
// a la mitad, igual de criterio que resumText() en el cliente.
function resumirTextoSeo(texto, maxLen) {
  const limpio = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (limpio.length <= maxLen) return limpio;
  const cortado = limpio.slice(0, maxLen);
  const ultimoEspacio = cortado.lastIndexOf(" ");
  return (ultimoEspacio > 0 ? cortado.slice(0, ultimoEspacio) : cortado).trim() + "…";
}

function urlNoticiaWorker(categoria, slug) {
  return `/futbol/${encodeURIComponent(categoria || "general")}/${encodeURIComponent(slug)}`;
}

// Construye el bloque de etiquetas que sustituye a las genéricas del
// <head> estático de noticia.html: title, description, canonical,
// hreflang, og:*, twitter:* y JSON-LD (NewsArticle + BreadcrumbList).
// idiomaQuery: valor de ?lang= en la URL solicitada, si lo hay.
function construirMetaNoticia(article, idiomaQuery) {
  const disponibles = Array.isArray(article.idiomas_disponibles) ? article.idiomas_disponibles : [];
  const idiomaActual = (idiomaQuery && SEO_IDIOMAS_WORKER[idiomaQuery]) ? idiomaQuery : SEO_IDIOMA_DEFECTO_WORKER;
  const infoIdioma = SEO_IDIOMAS_WORKER[idiomaActual];

  // Textos: si el artículo trae traducciones (article.traducciones[idioma])
  // se usan esas; si no, se cae al castellano, igual que hace noticia.html
  // en cliente al pintar contenido.
  const trad = (article.traducciones && article.traducciones[idiomaActual]) || null;
  const titulo = (trad && trad.titulo) || article.titulo || "";
  const subtitulo = (trad && trad.subtitulo) || article.subtitulo || "";
  const contenidoPlano = String(((trad && trad.contenido) || article.contenido || "")).replace(/<[^>]+>/g, " ");

  const tituloCompleto = titulo ? `${titulo} — ${SEO_NOMBRE_SITIO}` : `Noticia — ${SEO_NOMBRE_SITIO}`;
  const descripcion = resumirTextoSeo(contenidoPlano, 160) || subtitulo || "";

  const slug = article.slug || "";
  const urlBase = urlNoticiaWorker(article.categoria, slug);
  const urlCanonica = seoUrlAbsolutaWorker(urlBase);
  const urlActual = seoUrlAbsolutaWorker(idiomaActual === SEO_IDIOMA_DEFECTO_WORKER ? urlBase : `${urlBase}?lang=${idiomaActual}`);

  const imagenUrl = article.imagen_url
    || (Array.isArray(article.imagenes) && article.imagenes[0] && (article.imagenes[0].url || article.imagenes[0]))
    || "";
  const imagenAbs = imagenUrl ? seoUrlAbsolutaWorker(imagenUrl) : "";

  const idiomasHreflang = Array.from(new Set([SEO_IDIOMA_DEFECTO_WORKER, ...disponibles]));
  const hreflangTags = idiomasHreflang
    .filter((cod) => SEO_IDIOMAS_WORKER[cod])
    .map((cod) => {
      const href = cod === SEO_IDIOMA_DEFECTO_WORKER ? urlCanonica : seoUrlAbsolutaWorker(`${urlBase}?lang=${cod}`);
      return `<link rel="alternate" href="${escapeHtmlSeo(href)}" hreflang="${SEO_IDIOMAS_WORKER[cod].html}">`;
    })
    .join("\n");
  const hreflangXDefault = `<link rel="alternate" href="${escapeHtmlSeo(urlCanonica)}" hreflang="x-default">`;

  const localeAlternates = idiomasHreflang
    .filter((cod) => cod !== idiomaActual && SEO_IDIOMAS_WORKER[cod])
    .map((cod) => `<meta property="og:locale:alternate" content="${SEO_IDIOMAS_WORKER[cod].ogLocale}">`)
    .join("\n");

  const twitterCardTipo = imagenAbs ? "summary_large_image" : "summary";

  const jsonLdArticulo = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": titulo || undefined,
    "description": descripcion || undefined,
    "inLanguage": infoIdioma.html,
    "mainEntityOfPage": { "@type": "WebPage", "@id": urlCanonica },
    "datePublished": article.fecha_publicacion || undefined,
    "dateModified": article.fecha_actualizacion || article.fecha_publicacion || undefined,
    "image": imagenAbs ? [imagenAbs] : undefined,
    "author": article.autor_nombre
      ? (article.coautor_nombre
          ? [{ "@type": "Person", "name": article.autor_nombre }, { "@type": "Person", "name": article.coautor_nombre }]
          : { "@type": "Person", "name": article.autor_nombre })
      : undefined,
    "publisher": {
      "@type": "Organization",
      "name": SEO_NOMBRE_SITIO,
      "logo": { "@type": "ImageObject", "url": seoUrlAbsolutaWorker("img/logo.png") },
    },
  };

  const migas = [{ "@type": "ListItem", "position": 1, "name": "Inicio", "item": seoUrlAbsolutaWorker("index.html") }];
  if (article.categoria) {
    migas.push({
      "@type": "ListItem",
      "position": migas.length + 1,
      "name": article.categoria,
      "item": seoUrlAbsolutaWorker(`categoria.html?cat=${encodeURIComponent(article.categoria)}`),
    });
  }
  migas.push({ "@type": "ListItem", "position": migas.length + 1, "name": titulo || "Noticia" });
  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": migas,
  };

  return `<title id="pageTitle">${escapeHtmlSeo(tituloCompleto)}</title>
<meta name="description" content="${escapeHtmlSeo(descripcion)}">
<link rel="canonical" href="${escapeHtmlSeo(urlCanonica)}">
${hreflangTags}
${hreflangXDefault}
<meta property="og:type" content="article">
<meta property="og:site_name" content="${escapeHtmlSeo(SEO_NOMBRE_SITIO)}">
<meta property="og:url" content="${escapeHtmlSeo(urlActual)}">
<meta property="og:title" content="${escapeHtmlSeo(tituloCompleto)}">
<meta property="og:description" content="${escapeHtmlSeo(descripcion)}">
<meta property="og:locale" content="${infoIdioma.ogLocale}">
${localeAlternates}
${imagenAbs ? `<meta property="og:image" content="${escapeHtmlSeo(imagenAbs)}">` : ""}
<meta name="twitter:card" content="${twitterCardTipo}">
<meta name="twitter:title" content="${escapeHtmlSeo(tituloCompleto)}">
<meta name="twitter:description" content="${escapeHtmlSeo(descripcion)}">
${imagenAbs ? `<meta name="twitter:image" content="${escapeHtmlSeo(imagenAbs)}">` : ""}
<script type="application/ld+json" id="seo-jsonld">${JSON.stringify(jsonLdArticulo)}</script>
<script type="application/ld+json" id="seo-jsonld-breadcrumb">${JSON.stringify(jsonLdBreadcrumb)}</script>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;500;700&family=Playfair+Display:wght@700;800&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">`;
}

// Sustituye, dentro del <head> ya servido por env.ASSETS, el bloque
// estático title+description por el bloque SEO real de la noticia.
// Se hace con un simple string-replace acotado al rango <title>...<link
// rel="stylesheet"...> que ya existe en public/noticia.html, en vez de
// un parser HTML completo (innecesario para un documento que controlamos
// nosotros mismos y cuya estructura conocemos).
function inyectarSeoEnHtml(html, bloqueSeo) {
  const inicio = html.indexOf('<title id="pageTitle">');
  const marcaFin = '<link rel="stylesheet" href="css/style.css';
  const fin = html.indexOf(marcaFin);
  if (inicio === -1 || fin === -1 || fin < inicio) {
    // Estructura inesperada (p. ej. el HTML cambió de plantilla): no
    // arriesgarse a romper la página, se sirve tal cual sin tocar nada.
    return html;
  }
  return html.slice(0, inicio) + bloqueSeo + "\n" + html.slice(fin);
}

// Dado un slug, intenta traer el artículo desde la API pública (mismo
// endpoint que usa el cliente, api.elotrofutbol.media) con un timeout
// corto: si la API tarda o falla, se sirve el HTML sin tocar (fallback
// automático a seo.js en cliente, que sigue estando intacto) en vez de
// retrasar o romper la respuesta al lector real.
async function obtenerArticuloParaSeo(slug) {
  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), 3000);
  try {
    const resp = await fetch(`https://api.elotrofutbol.media/api/articles/${encodeURIComponent(slug)}`, {
      signal: controlador.signal,
      headers: { "Accept": "application/json" },
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    if (!data || !data.article) return null;
    return data.article;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// DETECCIÓN DE BOTS + CONTENIDO PRINCIPAL PRE-PINTADO
//
// El SEO en <head> (título, og:*, JSON-LD) ya se sirve renderizado en
// servidor para cualquiera. Pero el CUERPO visible de la noticia
// (<main id="contenidoArticulo">) seguía dependiendo por completo de
// que el navegador ejecutara JavaScript y llamara a /api/articles: los
// crawlers que no ejecutan JS lo veían vacío ("Cargando...").
//
// Esto afecta sobre todo a:
//  - Bots de vista previa de redes sociales/mensajería (Facebook,
//    Twitter/X, WhatsApp, Telegram, LinkedIn, Discord, Slack): muchos sí
//    leen el <head> pero no ejecutan JS, así que un cuerpo vacío no les
//    afecta para la tarjeta compartida, pero...
//  - Googlebot SÍ ejecuta JS en la mayoría de casos (rendering de dos
//    fases), pero no siempre a tiempo o de forma completa, y otros
//    motores de búsqueda/asistentes (Bingbot en algunos casos, bots de
//    IA que citan contenido) no ejecutan JS en absoluto. Servirles ya el
//    texto principal en el HTML es la única garantía de que lo indexen
//    o lo puedan citar correctamente.
//
// Estrategia: SOLO para peticiones de bots conocidos (por User-Agent),
// se sustituye el placeholder "Cargando..." de #contenidoArticulo por
// un HTML ya pintado con: cabecera (categoría, título, subtítulo,
// fecha, autor), imagen principal y el cuerpo del artículo. Para
// usuarios reales (navegadores normales) el HTML no cambia en nada:
// siguen recibiendo el mismo placeholder de siempre y noticia.html lo
// sustituye por JS exactamente como hacía antes, con todas sus
// funcionalidades (galería, comentarios, encuestas, minuto a minuto...)
// intactas. No tiene sentido -ni es seguro- mandar todo ese HTML
// interactivo a un bot, así que esta versión es deliberadamente una
// versión de solo lectura del contenido, no una copia 1:1 de lo que
// pinta el cliente.
// ============================================================

// Patrones de User-Agent de bots a los que interesa servir HTML
// pre-pintado: crawlers de buscadores y de vista previa de redes
// sociales/mensajería. Se busca por substring en minúsculas, no regex
// exacta, porque las cadenas de user-agent reales llevan mucho más
// texto alrededor (versión, +http://..., etc.).
const BOTS_PARA_PREPINTADO = [
  "googlebot",
  "google-inspectiontool", // Herramienta de inspección de URL de Search Console
  "bingbot",
  "duckduckbot",
  "yandex",
  "facebookexternalhit", // Facebook / Instagram / Messenger
  "twitterbot", // Twitter / X
  "whatsapp",
  "telegrambot",
  "linkedinbot",
  "discordbot",
  "slackbot",
  "slack-imgproxy",
  "applebot",
  "pinterest",
  "redditbot",
  "vkshare",
  "skypeuripreview",
  "google-read-aloud",
];

function esUserAgentBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOTS_PARA_PREPINTADO.some((patron) => ua.includes(patron));
}

// Recorta el HTML del contenido (guardado con etiquetas básicas: <p>,
// <b>, <i>, <a>, saltos de línea...) para que quede razonablemente
// limpio sin necesidad de un parser HTML completo en el Worker. No
// pretende ser idéntico al renderizado enriquecido del cliente
// (fotos intercaladas, tuits incrustados, etc.): es la versión de
// lectura para un bot, y ya es muchísimo mejor que un div vacío.
function cuerpoBasicoParaBot(contenidoHtml) {
  return String(contenidoHtml ?? "");
}

// Construye el HTML que sustituye a "<p>Cargando...</p>" dentro de
// #contenidoArticulo, replicando la estructura esencial que pinta
// renderizaArticulo() en noticia.html (cabecera + imagen + cuerpo),
// simplificada para un lector no interactivo (bot).
function construirCuerpoArticuloParaBot(article, idiomaQuery) {
  const disponibles = Array.isArray(article.idiomas_disponibles) ? article.idiomas_disponibles : [];
  const idiomaActual = (idiomaQuery && SEO_IDIOMAS_WORKER[idiomaQuery]) ? idiomaQuery : SEO_IDIOMA_DEFECTO_WORKER;
  const trad = (article.traducciones && article.traducciones[idiomaActual]) || null;

  const titulo = (trad && trad.titulo) || article.titulo || "";
  const subtitulo = (trad && trad.subtitulo) || article.subtitulo || "";
  const contenidoHtml = (trad && trad.contenido) || article.contenido || "";

  const imagenUrl = article.imagen_url
    || (Array.isArray(article.imagenes) && article.imagenes[0] && (article.imagenes[0].url || article.imagenes[0]))
    || "";

  const autorTexto = article.autor_nombre
    ? ` · Por ${escapeHtmlSeo(article.autor_nombre)}${article.coautor_nombre ? ` y ${escapeHtmlSeo(article.coautor_nombre)}` : ""}`
    : "";
  const fechaTexto = article.fecha_publicacion ? escapeHtmlSeo(article.fecha_publicacion.slice(0, 10)) : "";

  return `<div class="article-header">
  <span class="cat">${escapeHtmlSeo(article.categoria || "")}${clubArticuloLegibleSeo(article.club) ? " · " + escapeHtmlSeo(clubArticuloLegibleSeo(article.club)) : ""}</span>
  <h1>${escapeHtmlSeo(titulo)}</h1>
  ${subtitulo ? `<p class="subtitulo">${escapeHtmlSeo(subtitulo)}</p>` : ""}
  <p class="meta">${fechaTexto}${autorTexto}</p>
</div>
${imagenUrl ? `<div class="article-img"><img src="${escapeHtmlSeo(seoUrlAbsolutaWorker(imagenUrl))}" alt="${escapeHtmlSeo(titulo)}"></div>` : ""}
<div class="article-body">${cuerpoBasicoParaBot(contenidoHtml)}</div>`;
}

// Sustituye el placeholder "<p>Cargando...</p>" dentro de
// <main ... id="contenidoArticulo">...</main> por el HTML ya pintado
// del artículo. Igual que inyectarSeoEnHtml, se usa un string-replace
// acotado a marcas conocidas del propio archivo en vez de un parser
// HTML completo: si la plantilla cambiara de forma inesperada, se
// sirve sin tocar en vez de arriesgarse a corromper el documento.
function inyectarCuerpoEnHtml(html, cuerpoHtml) {
  const marcaPlaceholder = '<main class="wrap" id="contenidoArticulo">\n  <p>Cargando...</p>\n</main>';
  if (!html.includes(marcaPlaceholder)) return html;
  return html.replace(
    marcaPlaceholder,
    `<main class="wrap" id="contenidoArticulo">\n${cuerpoHtml}\n</main>`
  );
}

// Sirve noticia.html con el SEO ya inyectado en servidor para un slug
// dado. request/env/url son los de la petición actual; noticiaRequest es
// la request (ya reescrita a /noticia si venía de la URL bonita) que se
// le pasa a env.ASSETS.fetch().
async function servirNoticiaConSeo(noticiaRequest, env, slug, idiomaQuery, esBot) {
  const [respuestaAssets, article] = await Promise.all([
    env.ASSETS.fetch(noticiaRequest),
    obtenerArticuloParaSeo(slug),
  ]);

  // Sin artículo (no existe, todavía programada, o la API no respondió a
  // tiempo): se sirve el HTML normal, tal cual, para que la lógica de
  // cliente (mensaje de error, cuenta atrás de programada, o el propio
  // seo.js como respaldo) siga funcionando exactamente igual que antes.
  if (!article || respuestaAssets.status !== 200) return respuestaAssets;

  const contentType = respuestaAssets.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) return respuestaAssets;

  const html = await respuestaAssets.text();
  const bloqueSeo = construirMetaNoticia(article, idiomaQuery);
  let htmlFinal = inyectarSeoEnHtml(html, bloqueSeo);

  // El contenido principal pre-pintado SOLO se sirve a bots conocidos:
  // a un lector real le seguimos mandando el placeholder + noticia.html
  // pintándolo por JS, con toda su interactividad (galería, comentarios,
  // encuestas, minuto a minuto en vivo...) intacta.
  if (esBot) {
    const cuerpoHtml = construirCuerpoArticuloParaBot(article, idiomaQuery);
    htmlFinal = inyectarCuerpoEnHtml(htmlFinal, cuerpoHtml);
  }

  const headers = new Headers(respuestaAssets.headers);
  // El HTML ahora es específico de esta noticia (título, descripción,
  // imagen...): no debe servirse desde una caché compartida como si
  // fuera genérico.
  headers.set("Cache-Control", "no-store");
  return new Response(htmlFinal, { status: respuestaAssets.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ============================================================
    // MODO MANTENIMIENTO TEMPORAL (sitio / Pages)
    //
    // Se activa/desactiva con la variable de entorno MAINTENANCE_MODE
    // de ESTE proyecto de Cloudflare Pages (Settings > Environment
    // variables aquí, no en el Worker de la API). Al ponerla en "true"
    // se sirve esta pantalla en vez del sitio para TODAS las rutas,
    // salvo el bypass con el header X-Maintenance-Bypass (para poder
    // seguir probando) y los propios assets/rutas admin si se decide
    // no bloquear el panel.
    // ============================================================
    if (
      env.MAINTENANCE_MODE === "true" &&
      request.headers.get("X-Maintenance-Bypass") !== env.MAINTENANCE_BYPASS_SECRET &&
      // Dejamos pasar los propios recursos estáticos (css, js, imágenes,
      // favicon...) sin bloquearlos: si no, la propia pantalla de
      // mantenimiento no podría cargar su logo ni sus estilos, porque
      // esas peticiones también entrarían por esta rama y recibirían el
      // HTML de mantenimiento en vez del archivo real que piden.
      !/\.(css|js|mjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|json|xml|txt|map)$/i.test(path)
    ) {
      // Servimos el archivo real public/mantenimiento.html (en vez de
      // generar HTML aquí) para que solo haya UNA plantilla de
      // mantenimiento que editar en el sitio, y ademas se pueda ir
      // editando visualmente sin tocar este worker. Pedimos el asset con
      // env.ASSETS.fetch en vez de redirigir, asi la URL que ve la
      // persona en el navegador no cambia (sigue siendo la que pidio).
      const mantenimientoUrl = new URL("/mantenimiento.html", url);
      // Petición GET limpia y nueva (sin heredar método/cabeceras/body de
      // la request original) para evitar que env.ASSETS.fetch se
      // confunda con algo de la petición real (p.ej. si era POST, o
      // llevaba un body ya consumido).
      const respuesta = await env.ASSETS.fetch(mantenimientoUrl.toString());
      let html = await respuesta.text();
      // Inyectamos el instante REAL de inicio del mantenimiento (fijado
      // por set-mantenimiento.sh en MAINTENANCE_DESDE al activar) para
      // que la barra de progreso de mantenimiento.html calcule el %
      // real transcurrido, igual para todo el mundo, en vez de asumir
      // un ciclo fijo -- ver comentarios en mantenimiento.html. Si la
      // variable no está fijada (activación manual desde el dashboard
      // sin pasar por el script), el placeholder se sustituye por
      // cadena vacía y el propio HTML cae a su fallback.
      html = html.replace(
        "__MAINTENANCE_DESDE_ISO__",
        escapeHtmlMantenimiento(env.MAINTENANCE_DESDE || "")
      );
      return new Response(html, {
        status: 503,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Retry-After": "3600",
          "Cache-Control": "no-store",
        },
      });
    }

    // --- URL bonita: /futbol/{categoria}/{slug} -> sirve noticia ---
    // IMPORTANTE: se reescribe hacia "/noticia" (SIN extensión .html).
    // Con html_handling "auto-trailing-slash", la URL canónica de un
    // archivo público/noticia.html es "/noticia" (sin extensión): pedir
    // "/noticia.html" explícitamente hace que Cloudflare Pages devuelva
    // su propio 307 automático hacia "/noticia" en vez de servir el
    // archivo directamente (ver tabla en la documentación de
    // "html_handling"). Ese 307 automático de Cloudflare, sumado a nuestra
    // reescritura interna, es lo que producía el bucle infinito
    // ("elotrofutbol.media te ha redirigido demasiadas veces"), incluso
    // ya sin ningún 301 propio en este archivo. Pidiendo directamente la
    // ruta canónica "/noticia" evitamos que Cloudflare tenga que redirigir
    // nada, ni siquiera internamente.
    const matchBonita = path.match(/^\/futbol\/([^/]+)\/([^/]+)\/?$/);
    if (matchBonita && request.method === "GET") {
      const slug = decodeURIComponent(matchBonita[2]);
      const noticiaUrl = new URL("/noticia", url);
      noticiaUrl.searchParams.set("slug", slug);
      // Conserva otros parámetros que ya podía llevar la noticia bonita
      // (por ejemplo "lang" o "preview"), aparte de "slug".
      for (const [k, v] of url.searchParams) {
        if (k !== "slug") noticiaUrl.searchParams.set(k, v);
      }
      const noticiaRequest = new Request(noticiaUrl.toString(), request);
      const esBot = esUserAgentBot(request.headers.get("User-Agent"));
      return servirNoticiaConSeo(noticiaRequest, env, slug, noticiaUrl.searchParams.get("lang"), esBot);
    }

    // --- Formato antiguo /noticia.html?slug=... o /noticia?slug=...,
    // servido tal cual (SIN redirigir a la URL bonita): igual que en el
    // caso anterior, se le inyecta el SEO en servidor antes de servirlo.
    if ((path === "/noticia" || path === "/noticia.html") && request.method === "GET") {
      const slug = url.searchParams.get("slug");
      if (slug) {
        const esBot = esUserAgentBot(request.headers.get("User-Agent"));
        return servirNoticiaConSeo(request, env, slug, url.searchParams.get("lang"), esBot);
      }
      return env.ASSETS.fetch(request);
    }

    // --- /widgets.html: cabeceras de seguridad puestas A MANO aquí.
    // Cloudflare Pages IGNORA por completo el archivo _headers en
    // cualquier ruta que pase por este _worker.js (documentado: "Custom
    // headers defined in the _headers file are not applied to responses
    // generated by Pages Functions" — y un _worker.js en modo "advanced"
    // cuenta como tal), así que la excepción de CSP que se había escrito
    // en public/_headers para permitir que esta página se auto-embeba en
    // un <iframe> (su vista previa en vivo de los widgets) nunca llegaba
    // a aplicarse: el navegador seguía recibiendo la CSP por defecto sin
    // "elotrofutbol.media" en frame-src y bloqueaba el iframe. La única
    // forma fiable de fijar cabeceras aquí es construir la Response a
    // mano, como se hace ya arriba con /mantenimiento.html.
    //
    // OJO: Cloudflare Pages redirige automáticamente /widgets.html →
    // /widgets (307, "clean URLs") ANTES de que este Worker vea la
    // petición otra vez ya sin extensión -- comprobar solo
    // "/widgets.html" nunca coincidía con la petición real que llegaba
    // al navegador tras seguir la redirección, así que esta rama nunca
    // se ejecutaba y la respuesta acababa saliendo directamente de
    // env.ASSETS.fetch() con el _headers "global" (el que NO tiene
    // api.elotrofutbol.media en frame-src). Por eso hay que cubrir las
    // dos variantes de la ruta.
    if ((path === "/widgets.html" || path === "/widgets") && request.method === "GET") {
      const respuesta = await env.ASSETS.fetch(request);
      const nuevas = new Headers(respuesta.headers);
      // delete() explícito antes de set(): por si env.ASSETS.fetch()
      // devolviera más de un valor para esta cabecera (algo que new
      // Headers().set() normalmente evita, pero que hemos visto
      // ocurrir en curl -D contra el dominio real: dos líneas
      // "content-security-policy" distintas en la misma respuesta).
      // Borrar y volver a poner garantiza que solo quede la nuestra.
      nuevas.delete("Content-Security-Policy");
      nuevas.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://accounts.google.com https://alcdn.msauth.net https://platform.twitter.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.elotrofutbol.media https://elotro-futbol-api-production.up.railway.app https://accounts.google.com https://login.microsoftonline.com; frame-src https://accounts.google.com https://api.elotrofutbol.media https://platform.twitter.com https://syndication.twitter.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
      );
      return new Response(respuesta.body, { status: respuesta.status, headers: nuevas });
    }

    // --- Todo lo demás: comportamiento normal de Pages (archivos
    // estáticos). Si alguien llega con la extensión ".html" explícita en
    // la URL, Cloudflare Pages hará su propio 307 (de una sola vez, no en
    // bucle) hacia la versión sin extensión, que es normal y esperado
    // bajo "auto-trailing-slash": no es cosa nuestra ni hay que evitarlo
    // aquí. ---
    return env.ASSETS.fetch(request);
  },
};
