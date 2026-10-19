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
const SEO_TWITTER_SITE = "@elotrofutbol";

// Imagen para redes y Google Discover: las fotos de Cloudinary se sirven en un
// recorte JPG del tamaño pedido (WhatsApp/Facebook/X piden ~1,91:1 y pesos
// bajos; algunos no soportan webp/avif, por eso f_jpg y no f_auto). Si la URL no
// es de Cloudinary se devuelve igual y sin dimensiones conocidas.
function seoImagenSocialWorker(url, ancho, alto, foco) {
  if (!url || typeof url !== "string") return { url: url || "", ancho: 0, alto: 0 };
  const marca = "/upload/";
  const i = url.indexOf(marca);
  if (i === -1 || !/res\.cloudinary\.com/.test(url)) return { url, ancho: 0, alto: 0 };
  // Recorte alrededor del FOCO que el redactor eligió para la portada (el mismo
  // que respeta la web: "62% 30%"). Sin foco elegido (vacío o el centro por
  // defecto "50% 50%") se mantiene g_auto, como siempre.
  const pf = seoFocoCloudinary(foco);
  const gravedad = pf ? `g_xy_center,x_${pf.x},y_${pf.y}` : "g_auto";
  const t = `f_jpg,q_auto:good,c_fill,${gravedad},w_${ancho},h_${alto}`;
  return { url: url.slice(0, i + marca.length) + t + "/" + url.slice(i + marca.length), ancho, alto };
}

// "62% 30%" -> { x: "0.62", y: "0.3" } (fracciones 0-1 de Cloudinary). null si
// no hay foco válido o es el centro por defecto.
function seoFocoCloudinary(foco) {
  const m = /^\s*(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%\s*$/.exec(typeof foco === "string" ? foco : "");
  if (!m) return null;
  const x = Math.min(100, parseFloat(m[1])), y = Math.min(100, parseFloat(m[2]));
  if (x === 50 && y === 50) return null;
  // Cloudinary solo toma x/y como fracción si llevan decimales ("1" = 1 píxel):
  // 0 y 1 se escriben "0.0" y "1.0".
  const f = (n) => { const v = Math.round(n * 10) / 1000; return Number.isInteger(v) ? v.toFixed(1) : String(v); };
  return { x: f(x), y: f(y) };
}

// SEGURIDAD: JSON-LD dentro de <script>: un "</script>" (o "<!--") en un titulo/
// subtitulo cerraria el bloque y permitiria inyectar HTML/JS en la pagina.
// Escapar "<", ">" y "&" lo impide sin cambiar el significado del JSON.
function jsonLdSeguro(objeto) {
  return JSON.stringify(objeto)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

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

// Lista de clubes de una noticia (1 o 2) como array de nombres. Mismo
// criterio que parsearClubArticulo() de public/js/config.js. Se usa para las
// palabras clave y las menciones (SportsTeam) del JSON-LD.
function listaClubsSeo(valorClub) {
  if (!valorClub) return [];
  try {
    const parsed = JSON.parse(valorClub);
    if (Array.isArray(parsed)) return parsed.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim());
  } catch {
    // No es JSON: club único en texto plano.
  }
  const txt = typeof valorClub === "string" ? valorClub.trim() : "";
  return txt && !txt.startsWith("[") ? [txt] : [];
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

// Misma normalización que categoriaUrlSlug() en js/config.js y en
// worker/src/index.js (minúsculas y "_" -> "-"): la URL que se enlaza, la
// del sitemap y la que declara el <link rel="canonical"> TIENEN que ser
// idénticas. Antes aquí no se normalizaba, así que para primera_federacion
// y segunda_federacion el canonical apuntaba a /futbol/primera_federacion/...
// mientras todo lo demás usaba /futbol/primera-federacion/...: dos URLs
// distintas para el mismo contenido y señales contradictorias a Google.
function categoriaUrlSlugWorker(categoria) {
  const normalizada = (categoria || "").toString().trim().toLowerCase().replace(/_/g, "-");
  return normalizada || "general";
}

function urlNoticiaWorker(categoria, slug) {
  return `/futbol/${encodeURIComponent(categoriaUrlSlugWorker(categoria))}/${encodeURIComponent(slug)}`;
}

// Construye el bloque de etiquetas que sustituye a las genéricas del
// <head> estático de noticia.html: title, description, canonical,
// hreflang, og:*, twitter:* y JSON-LD (NewsArticle + BreadcrumbList).
// idiomaQuery: valor de ?lang= en la URL solicitada, si lo hay.
// Convierte la fecha de la base de datos ("2026-10-04 18:30:00" en UTC, o
// ya ISO) a ISO 8601 con zona horaria explícita. Google exige zona horaria
// en datePublished/dateModified; sin ella puede interpretar mal la hora de
// una noticia de última hora.
function aFechaIsoSeo(valor) {
  if (!valor) return undefined;
  const txt = String(valor);
  const conZona = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(txt);
  const d = new Date(txt.includes("T") || conZona ? txt : `${txt.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
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

// Autor para JSON-LD: con enlace a su perfil (/autor?id=) cuando hay id, para
// que Google asocie las noticias a la persona (E-E-A-T).
function personaAutorLd(nombre, id) {
  const persona = { "@type": "Person", "name": nombre };
  if (id) persona.url = seoUrlAbsolutaWorker(`/autor?id=${encodeURIComponent(id)}`);
  return persona;
}

// Variante "?v=" para rastreadores de REDES (no buscadores). Facebook/X/WhatsApp
// identifican la tarjeta por la URL que ven en og:url / canonical. Como esas dos
// apuntaban siempre a la URL limpia, compartir el enlace con "?v=2" para
// refrescar una tarjeta mala cacheada NO servía de nada: el rastreador lo
// trataba como el mismo enlace y reutilizaba la tarjeta vieja. Ahora, si la
// petición lleva ?v= y quien la hace es un rastreador de redes, esas dos URLs
// conservan el ?v=. A Google y demás buscadores se les sigue dando la limpia.
function varianteSocialDeRequest(request, esBot) {
  if (!esBot) return null;
  try {
    if (esUserAgentBuscador(request.headers.get("User-Agent"))) return null;
    const v = new URL(request.url).searchParams.get("v");
    return v && /^[A-Za-z0-9_.-]{1,32}$/.test(v) ? v : null;
  } catch { return null; }
}
function conVarianteSocial(url, v) {
  if (!v) return url;
  return url + (url.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(v);
}

function construirMetaNoticia(article, idiomaQuery, imagenSocial = null, varianteSocial = null) {
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

  // Google recorta el <title> hacia los 60 caracteres: si con la marca se
  // pasa de 65, se deja el titular solo (la marca ya sale como site name).
  const tituloConMarca = titulo ? `${titulo} — ${SEO_NOMBRE_SITIO}` : `Noticia — ${SEO_NOMBRE_SITIO}`;
  const tituloCompleto = (titulo && tituloConMarca.length > 65) ? titulo : tituloConMarca;
  // Descripción: el subtítulo (resumen escrito por el redactor) si tiene
  // cuerpo suficiente; si no, el arranque del texto. Evita que la snippet
  // de Google empiece por una cabecera tipo "MADRID, 4 oct.".
  const subtituloLimpio = resumirTextoSeo(subtitulo, 160);
  let descripcion = (subtituloLimpio.length >= 50 ? subtituloLimpio : "")
    || resumirTextoSeo(contenidoPlano, 160) || subtituloLimpio || "";

  // Previa/crónica vinculada a un partido: título y descripción con los dos
  // equipos (búsquedas "equipo1-equipo2"). Solo en castellano: en otros
  // idiomas el titular traducido ya es lo que se quiere posicionar.
  const partido = idiomaActual === SEO_IDIOMA_DEFECTO_WORKER ? seoDatosPartido(article, etiquetaCategoriaWorker) : null;
  let tituloPagina = tituloCompleto;
  if (partido) {
    tituloPagina = seoTituloPartido(partido, titulo, SEO_NOMBRE_SITIO);
    descripcion = seoDescripcionPartido(partido, subtitulo, contenidoPlano, resumirTextoSeo);
  }

  const slug = article.slug || "";
  const urlBase = urlNoticiaWorker(article.categoria, slug);
  const urlCanonica = seoUrlAbsolutaWorker(urlBase);
  const urlActual = seoUrlAbsolutaWorker(idiomaActual === SEO_IDIOMA_DEFECTO_WORKER ? urlBase : `${urlBase}?lang=${idiomaActual}`);

  const imagenUrl = article.imagen_url || primeraFotoArticuloSeo(article.imagenes) || "";
  const imagenAbs = imagenUrl ? seoUrlAbsolutaWorker(imagenUrl) : "";
  // Recortes 16:9, 4:3 y 1:1 (lo que recomienda Google para NewsArticle) y el
  // 1200x630 de Open Graph.
  const imgOg = imagenAbs ? seoImagenSocialWorker(imagenAbs, 1200, 630, article.imagen_foco) : { url: "", ancho: 0, alto: 0 };
  const imagenesLd = imagenAbs
    ? [seoImagenSocialWorker(imagenAbs, 1200, 675, article.imagen_foco), seoImagenSocialWorker(imagenAbs, 1200, 900, article.imagen_foco), seoImagenSocialWorker(imagenAbs, 1200, 1200, article.imagen_foco)].map((x) => x.url)
    : [];

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

  // Sin imagen propia, preview por defecto: logo negro sobre fondo blanco.
  // imagenSocial: imagen YA COMPROBADA por resolverImagenSocial (solo se pasa a
  // los rastreadores). Sin ella se anuncia la derivada de Cloudinary de siempre.
  const imagenOgAbs = imagenSocial ? imagenSocial.url : (imgOg.url || imagenAbs || seoUrlAbsolutaWorker("img/og-default.png"));
  const ogDims = imagenSocial
    ? (imagenSocial.ancho ? { ancho: imagenSocial.ancho, alto: imagenSocial.alto } : null)
    : (imgOg.ancho
      ? { ancho: imgOg.ancho, alto: imgOg.alto }
      : (imagenAbs ? null : { ancho: 1200, alto: 630 }));
  const twitterCardTipo = "summary_large_image";

  const fechaPublicadaIso = aFechaIsoSeo(article.fecha_publicacion);
  const fechaModificadaIso = aFechaIsoSeo(article.fecha_actualizacion || article.updated_at || article.fecha_publicacion);

  // Palabras clave reales de la noticia (clubes + competición), sin relleno.
  // Para previas/crónicas de partido se mantienen las de seoKeywordsPartido().
  const clubsNoticia = listaClubsSeo(article.club);
  const etiquetaCatSeo = article.categoria ? etiquetaCategoriaWorker(article.categoria) : "";
  const palabrasClave = Array.from(new Set([...clubsNoticia, etiquetaCatSeo].filter(Boolean)));

  const jsonLdArticulo = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": titulo || undefined,
    "description": descripcion || undefined,
    "inLanguage": infoIdioma.html,
    "isAccessibleForFree": true,
    "articleSection": article.categoria ? etiquetaCategoriaWorker(article.categoria) : undefined,
    "wordCount": contenidoPlano.trim() ? contenidoPlano.trim().split(/\s+/).length : undefined,
    "mainEntityOfPage": { "@type": "WebPage", "@id": urlCanonica },
    "datePublished": aFechaIsoSeo(article.fecha_publicacion),
    "dateModified": aFechaIsoSeo(article.fecha_actualizacion || article.updated_at || article.fecha_publicacion),
    "image": imagenesLd.length ? imagenesLd : (imagenAbs ? [imagenAbs] : undefined),
    "thumbnailUrl": imgOg.url || imagenAbs || undefined,
    "isPartOf": { "@type": "WebSite", "@id": SEO_DOMINIO_WORKER + "/#sitio" },
    "author": article.autor_nombre
      ? (article.coautor_nombre
          ? [personaAutorLd(article.autor_nombre, article.autor_id), personaAutorLd(article.coautor_nombre, article.coautor_id)]
          : personaAutorLd(article.autor_nombre, article.autor_id))
      // Sin firma personal, el autor es el propio medio: Google recomienda
      // siempre una propiedad "author" en NewsArticle.
      : { "@type": "Organization", "@id": SEO_DOMINIO_WORKER + "/#organizacion", "name": SEO_NOMBRE_SITIO },
    "publisher": {
      "@type": "Organization",
      "@id": SEO_DOMINIO_WORKER + "/#organizacion",
      "name": SEO_NOMBRE_SITIO,
      "logo": { "@type": "ImageObject", "url": seoUrlAbsolutaWorker("img/logo.png") },
    },
  };

  if (!partido && palabrasClave.length) {
    jsonLdArticulo.keywords = palabrasClave.join(", ");
    if (clubsNoticia.length) {
      jsonLdArticulo.mentions = clubsNoticia.map((nombre) => ({ "@type": "SportsTeam", "name": nombre }));
    }
  }

  if (partido) {
    jsonLdArticulo.keywords = seoKeywordsPartido(partido);
    jsonLdArticulo.about = { "@type": "SportsEvent", "name": `${partido.local} - ${partido.visitante}` };
    jsonLdArticulo.mentions = [
      { "@type": "SportsTeam", "name": partido.local },
      { "@type": "SportsTeam", "name": partido.visitante },
    ];
  }
  const jsonLdPartido = partido ? seoSportsEventJsonLd(partido, urlCanonica, seoUrlAbsolutaWorker) : null;

  const migas = [{ "@type": "ListItem", "position": 1, "name": "Inicio", "item": seoUrlAbsolutaWorker("/") }];
  if (article.categoria) {
    migas.push({
      "@type": "ListItem",
      "position": migas.length + 1,
      "name": etiquetaCategoriaWorker(article.categoria),
      // Misma URL que el sitemap y el canonical de la categoría (sin .html).
      "item": seoUrlAbsolutaWorker(`/categoria?cat=${encodeURIComponent(article.categoria)}`),
    });
  }
  migas.push({ "@type": "ListItem", "position": migas.length + 1, "name": titulo || "Noticia" });
  const jsonLdBreadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": migas,
  };

  return `<title id="pageTitle">${escapeHtmlSeo(tituloPagina)}</title>
<meta name="description" content="${escapeHtmlSeo(descripcion)}">
<link rel="canonical" href="${escapeHtmlSeo(conVarianteSocial(urlCanonica, varianteSocial))}">
${hreflangTags}
${hreflangXDefault}
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta property="og:type" content="article">
${fechaPublicadaIso ? `<meta property="article:published_time" content="${fechaPublicadaIso}">` : ""}
${fechaModificadaIso ? `<meta property="article:modified_time" content="${fechaModificadaIso}">` : ""}
${article.categoria ? `<meta property="article:section" content="${escapeHtmlSeo(etiquetaCategoriaWorker(article.categoria))}">` : ""}
${article.autor_nombre ? `<meta name="author" content="${escapeHtmlSeo(article.autor_nombre)}">` : ""}
${palabrasClave.map((k) => `<meta property="article:tag" content="${escapeHtmlSeo(k)}">`).join("\n")}
<link rel="alternate" type="application/rss+xml" title="${escapeHtmlSeo(SEO_NOMBRE_SITIO)}" href="${SEO_DOMINIO_WORKER}/rss.xml">
<meta property="og:site_name" content="${escapeHtmlSeo(SEO_NOMBRE_SITIO)}">
<meta property="og:url" content="${escapeHtmlSeo(conVarianteSocial(urlActual, varianteSocial))}">
<meta property="og:title" content="${escapeHtmlSeo(tituloCompleto)}">
<meta property="og:description" content="${escapeHtmlSeo(descripcion)}">
<meta property="og:locale" content="${infoIdioma.ogLocale}">
${localeAlternates}
<meta property="og:image" content="${escapeHtmlSeo(imagenOgAbs)}">
${ogDims ? `<meta property="og:image:width" content="${ogDims.ancho}">\n<meta property="og:image:height" content="${ogDims.alto}">` : ""}
<meta property="og:image:alt" content="${escapeHtmlSeo(titulo)}">
<meta name="twitter:site" content="${SEO_TWITTER_SITE}">
<meta name="twitter:card" content="${twitterCardTipo}">
<meta name="twitter:title" content="${escapeHtmlSeo(tituloCompleto)}">
<meta name="twitter:description" content="${escapeHtmlSeo(descripcion)}">
<meta name="twitter:image" content="${escapeHtmlSeo(imagenOgAbs)}">
<meta name="twitter:image:alt" content="${escapeHtmlSeo(titulo)}">
<script type="application/ld+json" id="seo-jsonld">${jsonLdSeguro(jsonLdArticulo)}</script>
<script type="application/ld+json" id="seo-jsonld-breadcrumb">${jsonLdSeguro(jsonLdBreadcrumb)}</script>
${jsonLdPartido ? `<script type="application/ld+json" id="seo-jsonld-sportsevent">${jsonLdSeguro(jsonLdPartido)}</script>` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;500;700&family=Playfair+Display:wght@700;800&family=Lora:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">`;
}

// Buscadores (no las vistas previas de redes): a estos SÍ se les pide no
// indexar la página provisional de una noticia programada. A X/Facebook/
// WhatsApp... no se les manda ningún "robots" para que nada impida la tarjeta.
const BUSCADORES_NO_INDEXAR = [
  "googlebot", "google-inspectiontool", "bingbot", "duckduckbot", "yandex",
  "baiduspider", "seznambot", "applebot",
];
function esUserAgentBuscador(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BUSCADORES_NO_INDEXAR.some((patron) => ua.includes(patron));
}

// <head> de una noticia PROGRAMADA: mismo titular ("titular — ELOTROFÚTBOLTV"),
// descripción (subtítulo) e imagen 1200x630 que tendrá la noticia al
// publicarse, para que la tarjeta que cachean X/Facebook/WhatsApp sea
// idéntica y completa. Sin JSON-LD ni fechas de publicación (todavía no es
// una noticia publicada).
function construirMetaNoticiaProgramada(prog, esBuscador, paraBot = false, imagenSocial = null, varianteSocial = null) {
  const titulo = String(prog.titulo || "");
  const tituloConMarca = titulo ? `${titulo} — ${SEO_NOMBRE_SITIO}` : `Noticia — ${SEO_NOMBRE_SITIO}`;
  const tituloCompleto = (titulo && tituloConMarca.length > 65) ? titulo : tituloConMarca;
  const etiquetasTipo = { noticia: "Noticia", previa: "Previa", cronica: "Crónica", analisis: "Análisis", opinion: "Opinión", entrevista: "Entrevista", uno_por_uno: "1x1 de jugadores" };
  const etiquetaTipo = etiquetasTipo[prog.tipo] || "Noticia";
  const descripcion = resumirTextoSeo(prog.subtitulo || "", 160) || `${etiquetaTipo} de ${SEO_NOMBRE_SITIO}`;

  const urlCanonica = seoUrlAbsolutaWorker(urlNoticiaWorker(prog.categoria, prog.slug || ""));
  const imagenAbs = prog.imagen_url ? seoUrlAbsolutaWorker(prog.imagen_url) : "";
  const imgOg = imagenAbs ? seoImagenSocialWorker(imagenAbs, 1200, 630, prog.imagen_foco) : { url: "", ancho: 0, alto: 0 };
  const imagenOgAbs = imagenSocial ? imagenSocial.url : (imgOg.url || imagenAbs || seoUrlAbsolutaWorker("img/og-default.png"));
  const ogDims = imagenSocial
    ? (imagenSocial.ancho ? { ancho: imagenSocial.ancho, alto: imagenSocial.alto } : null)
    : (imgOg.ancho
      ? { ancho: imgOg.ancho, alto: imgOg.alto }
      : (imagenAbs ? null : { ancho: 1200, alto: 630 }));
  const e = escapeHtmlSeo;

  return [
    `<title id="pageTitle">${e(tituloCompleto)}</title>`,
    `<meta name="description" content="${e(descripcion)}">`,
    `<link rel="canonical" href="${e(conVarianteSocial(urlCanonica, varianteSocial))}">`,
    esBuscador ? `<meta name="robots" content="noindex, nofollow">` : "",
    `<meta property="og:type" content="article">`,
    prog.categoria ? `<meta property="article:section" content="${e(etiquetaCategoriaWorker(prog.categoria))}">` : "",
    `<meta property="og:site_name" content="${e(SEO_NOMBRE_SITIO)}">`,
    `<meta property="og:url" content="${e(conVarianteSocial(urlCanonica, varianteSocial))}">`,
    `<meta property="og:title" content="${e(tituloCompleto)}">`,
    `<meta property="og:description" content="${e(descripcion)}">`,
    `<meta property="og:locale" content="${SEO_IDIOMAS_WORKER[SEO_IDIOMA_DEFECTO_WORKER].ogLocale}">`,
    `<meta property="og:image" content="${e(imagenOgAbs)}">`,
    ogDims ? `<meta property="og:image:width" content="${ogDims.ancho}">\n<meta property="og:image:height" content="${ogDims.alto}">` : "",
    `<meta property="og:image:alt" content="${e(titulo)}">`,
    `<meta name="twitter:site" content="${SEO_TWITTER_SITE}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${e(tituloCompleto)}">`,
    `<meta name="twitter:description" content="${e(descripcion)}">`,
    `<meta name="twitter:image" content="${e(imagenOgAbs)}">`,
    `<meta name="twitter:image:alt" content="${e(titulo)}">`,
    // Lo que noticia.html tenía entre <title> y los CSS (inyectarSeoEnHtml lo
    // sustituye todo): iconos y carga de fuentes sin bloquear el render.
    `<link rel="icon" href="/favicon.ico?v=3" sizes="any">`,
    `<link rel="icon" type="image/x-icon" href="/img/favicon.ico?v=3">`,
    `<link rel="apple-touch-icon" href="/img/apple-touch-icon.png?v=2">`,
    // Un rastreador no pinta la página: se le ahorran las fuentes.
    paraBot ? "" : `<link rel="preload" as="style" href="${FUENTES_NOTICIA_URL}" onload="this.onload=null;this.rel='stylesheet'"><noscript><link href="${FUENTES_NOTICIA_URL}" rel="stylesheet"></noscript>`,
  ].filter(Boolean).join("\n");
}
const FUENTES_NOTICIA_URL = "https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;500;700&family=Playfair+Display:wght@700;800&family=Lora:ital,wght@0,400;0,600;1,400&display=swap";

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
    // Estructura inesperada (alguien tocó la cabecera de noticia.html y se
    // perdió la marca <title id="pageTitle"> o el <link ...css/style.css).
    // ANTES se servía el HTML tal cual y la noticia se quedaba SIN og:image
    // ni titular en silencio: justo lo que rompía las tarjetas de las redes
    // sin que nadie se enterase. AHORA se aplica un plan B: se quitan las
    // etiquetas de SEO sueltas y se inserta el bloque completo antes de
    // </head>. Además queda constancia en los logs del worker.
    console.error("[SEO] noticia.html ya no tiene las marcas de inyección (title#pageTitle / css/style.css): se usa la inserción de emergencia antes de </head>");
    const cierre = html.search(/<\/head>/i);
    if (cierre === -1) return html;
    const limpio = html
      .replace(/<title\b[^>]*>[\s\S]*?<\/title>\s*/i, "")
      .replace(/<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*|description)"[^>]*>\s*/gi, "")
      .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "");
    const cierreLimpio = limpio.search(/<\/head>/i);
    return limpio.slice(0, cierreLimpio) + bloqueSeo + "\n" + limpio.slice(cierreLimpio);
  }
  return html.slice(0, inicio) + bloqueSeo + "\n" + html.slice(fin);
}

// Dado un slug, intenta traer el artículo desde la API pública (mismo
// endpoint que usa el cliente, api.elotrofutbol.media) con un timeout
// corto: si la API tarda o falla, se sirve el HTML sin tocar (fallback
// automático a seo.js en cliente, que sigue estando intacto) en vez de
// retrasar o romper la respuesta al lector real.
async function obtenerArticuloParaSeo(slug, timeoutMs = 3000) {
  const principal = await obtenerArticuloDesdeApi("https://api.elotrofutbol.media", slug, timeoutMs);
  // null = la app respondió con su 404 JSON (no existe): se respeta.
  if (principal === null || (principal && !principal.errorTransitorio)) return principal;
  // Principal caída o con error: la API secundaria (Railway) está
  // desactivada, así que se sirve el HTML sin tocar (fallback a seo.js en
  // cliente), igual que ante cualquier otro fallo transitorio.
  return { errorTransitorio: true };
}

async function obtenerArticuloDesdeApi(base, slug, timeoutMs = 3000) {
  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const resp = await fetch(`${base}/api/articles/${encodeURIComponent(slug)}`, {
      signal: controlador.signal,
      headers: { "Accept": "application/json" },
    });
    // Solo 404/410 significa "no existe". 5xx, 429 y timeouts son fallos
    // transitorios: antes devolvían null y se servía un 404 REAL (y
    // noindex) para una noticia válida si la API tardaba >3 s.
    if (resp.status === 404 || resp.status === 410) {
      // Un 404 de la app es JSON; el de Cloudflare (worker caído) es HTML/texto.
      const esJson404 = /application\/json/i.test(resp.headers.get("Content-Type") || "");
      return (esJson404 || resp.status === 410) ? null : { errorTransitorio: true };
    }
    if (!resp.ok) return { errorTransitorio: true };
    const data = await resp.json().catch(() => null);
    if (!data) return { errorTransitorio: true };
    // Previa/crónica que se muestra fusionada con otra del mismo partido:
    // la API contesta con la noticia fusionada (slug + categoría) en vez de
    // con el artículo. Se devuelve tal cual para que servirNoticiaConSeo
    // redirija a ella; antes esto caía en "null" y el enlace de la que ya
    // no tiene página propia daba 404 (también a los bots de redes).
    if (data && data.redirect && data.categoria) {
      return { redirigirA: { slug: data.redirect, categoria: data.categoria } };
    }
    // Noticia PROGRAMADA que aún no ha llegado a su hora: la API devuelve
    // { programado: { slug, titulo, subtitulo, tipo, categoria, imagen_url,
    // programado_para } } (nunca el cuerpo). Antes esto caía en "null" y se
    // servía un 404 real: X, Facebook, WhatsApp... pedían el enlace al
    // programar el tuit/post, recibían 404 y cacheaban la tarjeta SIN titular
    // ni imagen (y no la refrescan al publicarse la noticia).
    if (data && data.programado && data.programado.titulo) {
      return { programada: data.programado };
    }
    if (!data || !data.article) return null;
    return data.article;
  } catch {
    return { errorTransitorio: true };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// VISTA PREVIA RÁPIDA DE NOTICIAS PROGRAMADAS (X, Facebook, WhatsApp...)
//
// Antes, CADA petición de un rastreador a una noticia programada hacía tres
// cosas lentas: bajar noticia.html entero (~100 KB), preguntar a la API (hasta
// 4 consultas D1 en serie) y, aparte, el rastreador pedía la imagen, que
// Cloudinary tenía que recortar en ese momento (g_auto es lento la primera
// vez). Si la API tardaba más de 3 s el rastreador recibía un 503 y la tarjeta
// salía sin foto o sin título.
//
// Ahora, para rastreadores:
//  1) Los datos de la programada se guardan en caché (memoria del isolate +
//     Cache API de Cloudflare). Mientras estén "frescos" (60 s) se responde
//     al instante, sin API ni noticia.html.
//  2) Se responde con un HTML mínimo (solo <head> con og:/twitter: y titular),
//     unos 1-2 KB en vez de ~100 KB.
//  3) Si la API falla o tarda, se sirve la copia guardada aunque esté vieja
//     (stale-if-error) en vez de un 503.
//  4) La primera vez (y si cambia la foto) se precalienta en segundo plano la
//     imagen recortada de Cloudinary, para que cuando el rastreador la pida
//     ya esté generada y cacheada.
// Los lectores reales no usan esta caché: ven siempre datos en vivo.
// ============================================================
const PROG_FRESCA_MS = 60 * 1000; // dentro de este margen se responde sin tocar la API
const PROG_CACHE_TTL_S = 24 * 60 * 60; // cuánto se conserva la copia para stale-if-error
const PROG_TIMEOUT_CON_COPIA_MS = 2000; // con copia de respaldo no merece la pena esperar más
const PROG_MEM = new Map(); // slug -> { prog, t } (por isolate; la Cache API cubre el resto)
const PROG_MEM_MAX = 200;

function claveCacheProgramada(slug) {
  return new Request(`https://cache.elotrofutbol.media/__prog/${encodeURIComponent(slug)}`);
}

// Hora programada (SQLite UTC "YYYY-MM-DD HH:MM:SS") -> ms. NaN si no se entiende.
function msProgramadaWorker(prog) {
  const v = prog && prog.programado_para;
  if (!v) return NaN;
  const iso = String(v).includes("T") ? String(v) : String(v).replace(" ", "T");
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
}

// Una copia es "fresca" si es reciente Y la hora programada aún no ha llegado:
// llegada la hora, el cron publica en <60 s y hay que volver a preguntar a la
// API para pasar a la noticia real.
function progFresca(entrada) {
  if (!entrada) return false;
  if (Date.now() - entrada.t >= PROG_FRESCA_MS) return false;
  const ms = msProgramadaWorker(entrada.prog);
  return Number.isNaN(ms) || Date.now() < ms;
}

async function leerProgramadaCache(slug) {
  const enMemoria = PROG_MEM.get(slug);
  if (enMemoria) return enMemoria;
  try {
    const r = await caches.default.match(claveCacheProgramada(slug));
    if (!r) return null;
    const t = Number(r.headers.get("X-Guardado-Ms")) || 0;
    const prog = await r.json();
    if (!prog || !prog.titulo) return null;
    const entrada = { prog, t };
    PROG_MEM.set(slug, entrada);
    return entrada;
  } catch {
    return null;
  }
}

function guardarProgramadaCache(slug, prog, ctx) {
  const entrada = { prog, t: Date.now() };
  if (PROG_MEM.size >= PROG_MEM_MAX) PROG_MEM.delete(PROG_MEM.keys().next().value);
  PROG_MEM.set(slug, entrada);
  const tarea = (async () => {
    try {
      await caches.default.put(claveCacheProgramada(slug), new Response(JSON.stringify(prog), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${PROG_CACHE_TTL_S}`,
          "X-Guardado-Ms": String(entrada.t),
        },
      }));
    } catch { /* sin caché compartida: queda la de memoria */ }
  })();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(tarea);
}

// URL de la imagen 1200x630 que se anuncia en og:image (la misma que
// construirMetaNoticiaProgramada). "" si la noticia no tiene foto.
function urlImagenSocialProgramada(prog) {
  const abs = prog && prog.imagen_url ? seoUrlAbsolutaWorker(prog.imagen_url) : "";
  if (!abs) return "";
  return seoImagenSocialWorker(abs, 1200, 630, prog.imagen_foco).url || abs;
}

// ============================================================
// IMAGEN SOCIAL VERIFICADA (og:image / twitter:image)
//
// Causa de las tarjetas "sin foto" (X, Facebook, WhatsApp...): el worker
// anunciaba SIEMPRE la derivada 1200x630 de Cloudinary (f_jpg, q_auto:good,
// c_fill, g_auto) sin comprobar que existiera. Si Cloudinary la rechazaba o
// tardaba (fotos muy pesadas, cuota de transformaciones, la primera
// generación lenta), el rastreador recibía un error o se rendía por timeout y
// la tarjeta se quedaba cacheada SIN imagen durante días.
//
// Ahora, SOLO para rastreadores, antes de contestar se COMPRUEBA que la imagen
// anunciada responde 200, es image/* y pesa <= 4 MB (X admite 5 MB), probando
// en orden:
//   1) recorte 1200x630 con foco (el de siempre)
//   2) recorte 1200x630 simple (sin g_auto ni q_auto, que es lo que más falla)
//   3) versión reducida (c_limit) manteniendo la proporción original
//   4) la imagen original tal cual
//   5) el logo por defecto (img/og-default.png) como último recurso
// El resultado bueno se recuerda 6 h (memoria + Cache API); si todo falla se
// recuerda solo 60 s para reintentar enseguida. La cabecera X-OG-Imagen de la
// respuesta dice cuál se usó (recorte | recorte-simple | reducida | original |
// original-sin-verificar | default), para diagnosticar con curl -A Twitterbot.
// ============================================================
const OG_IMG_MAX_BYTES = 4 * 1024 * 1024;
const OG_IMG_MIN_BYTES = 200;
const OG_IMG_OK_TTL_MS = 6 * 3600 * 1000;
const OG_IMG_KO_TTL_MS = 60 * 1000;
const OG_IMG_PRESUPUESTO_MS = 7000; // tope total por noticia (los rastreadores esperan ~10 s)
const OG_IMG_MEM = new Map(); // clave -> { res, t, ttl }
const OG_IMG_EN_CURSO = new Map(); // clave -> Promise (varios rastreadores a la vez comparten la comprobación)

function claveImagenSocial(origenAbs, foco) {
  return `${origenAbs}|${foco || ""}`;
}
function claveCacheImagenSocial(clave) {
  return new Request(`https://cache.elotrofutbol.media/__ogimg/${encodeURIComponent(clave)}`);
}

// Lista ordenada de candidatas (sin repetir). Solo Cloudinary admite recortes.
function candidatosImagenSocial(origenAbs, foco) {
  const lista = [];
  const ver = new Set();
  const anadir = (url, ancho, alto, via) => {
    if (!url || ver.has(url)) return;
    ver.add(url);
    lista.push({ url, ancho, alto, via });
  };
  const marca = "/upload/";
  const i = origenAbs.indexOf(marca);
  if (i !== -1 && /res\.cloudinary\.com/.test(origenAbs)) {
    const prefijo = origenAbs.slice(0, i + marca.length);
    const resto = origenAbs.slice(i + marca.length);
    anadir(seoImagenSocialWorker(origenAbs, 1200, 630, foco).url, 1200, 630, "recorte");
    // El respaldo sigue recortando alrededor del foco elegido (si lo hay); lo
    // único que pierde respecto al primero es g_auto/q_auto, que es lo que falla.
    const pfSimple = seoFocoCloudinary(foco);
    const gravedadSimple = pfSimple ? `g_xy_center,x_${pfSimple.x},y_${pfSimple.y},` : "";
    anadir(`${prefijo}f_jpg,q_80,c_fill,${gravedadSimple}w_1200,h_630/${resto}`, 1200, 630, "recorte-simple");
    anadir(`${prefijo}f_jpg,q_75,c_limit,w_1600,h_1600/${resto}`, 0, 0, "reducida");
  }
  anadir(origenAbs, 0, 0, "original");
  return lista;
}

// Devuelve "ok" | "permanente" (4xx / no es imagen / tamaño absurdo) | "transitorio" (timeout, red, 5xx, 429).
async function comprobarImagenSocial(url, maxMs) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), maxMs);
  try {
    const r = await fetch(url, {
      signal: controlador.signal,
      cf: { cacheEverything: true, cacheTtl: 86400 },
      headers: { "Accept": "image/jpeg,image/*;q=0.8" },
    });
    if (!r.ok) return (r.status >= 500 || r.status === 429 || r.status === 408) ? "transitorio" : "permanente";
    const tipo = (r.headers.get("Content-Type") || "").toLowerCase();
    if (!tipo.startsWith("image/")) return "permanente";
    const bytes = (await r.arrayBuffer()).byteLength;
    if (bytes < OG_IMG_MIN_BYTES || bytes > OG_IMG_MAX_BYTES) return "permanente";
    return "ok";
  } catch {
    return "transitorio";
  } finally {
    clearTimeout(temporizador);
  }
}

function imagenSocialPorDefecto(via = "default") {
  return { url: seoUrlAbsolutaWorker("img/og-default.png"), ancho: 1200, alto: 630, via };
}

async function resolverImagenSocialSinCache(origenAbs, foco) {
  const candidatas = candidatosImagenSocial(origenAbs, foco);
  const limite = Date.now() + OG_IMG_PRESUPUESTO_MS;
  let hubo503 = false;
  for (let n = 0; n < candidatas.length; n++) {
    const restante = limite - Date.now();
    if (restante < 500) { hubo503 = true; break; }
    const c = candidatas[n];
    const veredicto = await comprobarImagenSocial(c.url, Math.min(n === 0 ? 3500 : 2500, restante));
    if (veredicto === "ok") return { res: { url: c.url, ancho: c.ancho, alto: c.alto, via: c.via }, ttl: OG_IMG_OK_TTL_MS };
    if (veredicto === "transitorio") hubo503 = true;
  }
  // Nada verificable. Si fue por timeouts/5xx (Cloudinary lento o caído) lo más
  // probable es que la original SÍ cargue: se anuncia sin verificar. Si fue
  // permanente (404, no es imagen, pesa demasiado), se usa el logo.
  if (hubo503) {
    const original = candidatas[candidatas.length - 1];
    return { res: { url: original.url, ancho: 0, alto: 0, via: "original-sin-verificar" }, ttl: OG_IMG_KO_TTL_MS };
  }
  return { res: imagenSocialPorDefecto("default"), ttl: OG_IMG_KO_TTL_MS };
}

// origen: URL de la foto de la noticia ("" si no tiene). Nunca lanza.
async function resolverImagenSocial(origen, foco, ctx) {
  try {
    const origenAbs = origen ? seoUrlAbsolutaWorker(origen) : "";
    if (!origenAbs) return imagenSocialPorDefecto("default");
    const clave = claveImagenSocial(origenAbs, foco);
    const enMemoria = OG_IMG_MEM.get(clave);
    if (enMemoria && Date.now() - enMemoria.t < enMemoria.ttl) return enMemoria.res;
    try {
      const r = await caches.default.match(claveCacheImagenSocial(clave));
      if (r) {
        const res = await r.json();
        if (res && res.url) {
          OG_IMG_MEM.set(clave, { res, t: Date.now(), ttl: OG_IMG_OK_TTL_MS });
          return res;
        }
      }
    } catch { /* sin caché compartida: se comprueba */ }
    let enCurso = OG_IMG_EN_CURSO.get(clave);
    if (!enCurso) {
      enCurso = resolverImagenSocialSinCache(origenAbs, foco).finally(() => OG_IMG_EN_CURSO.delete(clave));
      OG_IMG_EN_CURSO.set(clave, enCurso);
    }
    const { res, ttl } = await enCurso;
    if (OG_IMG_MEM.size >= 500) OG_IMG_MEM.delete(OG_IMG_MEM.keys().next().value);
    OG_IMG_MEM.set(clave, { res, t: Date.now(), ttl });
    if (ttl === OG_IMG_OK_TTL_MS && ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil((async () => {
        try {
          await caches.default.put(claveCacheImagenSocial(clave), new Response(JSON.stringify(res), {
            headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${OG_IMG_OK_TTL_MS / 1000}` },
          }));
        } catch { /* solo es una optimización */ }
      })());
    }
    return res;
  } catch {
    return imagenSocialPorDefecto("default");
  }
}

// Primera foto real de una noticia (ignora los tuits/posts incrustados, que
// viven en "imagenes" pero no son imagen).
function primeraFotoArticuloSeo(imagenes) {
  if (!Array.isArray(imagenes)) return "";
  for (const x of imagenes) {
    if (!x) continue;
    if (typeof x === "string") return x;
    if (x.tipo === "tweet") continue;
    if (x.url) return x.url;
  }
  return "";
}

// Foto de la que sale la imagen social de una noticia publicada ("" si no hay).
function origenImagenArticulo(article) {
  return (article && (article.imagen_url || primeraFotoArticuloSeo(article.imagenes))) || "";
}

// Comprueba la imagen en segundo plano (y la deja cacheada) para que cuando el
// rastreador llegue ya esté decidida y generada en Cloudinary.
function precalentarImagenProgramada(prog, ctx) {
  if (!prog || !prog.imagen_url || !ctx || typeof ctx.waitUntil !== "function") return;
  ctx.waitUntil(resolverImagenSocial(prog.imagen_url, prog.imagen_foco, ctx).catch(() => {}));
}

// Memoriza la programada y precalienta la imagen si es nueva o ha cambiado.
function registrarProgramada(slug, prog, previa, ctx) {
  guardarProgramadaCache(slug, prog, ctx);
  if (!previa || urlImagenSocialProgramada(previa.prog) !== urlImagenSocialProgramada(prog)) {
    precalentarImagenProgramada(prog, ctx);
  }
}

// HTML mínimo para el rastreador: solo lo que lee para pintar la tarjeta.
function respuestaBotProgramada(prog, request, estadoCache, imagenSocial = null) {
  const varianteSocial = varianteSocialDeRequest(request, true);
  const esBuscador = esUserAgentBuscador(request.headers.get("User-Agent"));
  const e = escapeHtmlSeo;
  const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${construirMetaNoticiaProgramada(prog, esBuscador, true, imagenSocial, varianteSocial)}
</head><body>
<h1>${e(prog.titulo || "")}</h1>
${prog.subtitulo ? `<p>${e(prog.subtitulo)}</p>` : ""}
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Vary": "User-Agent",
      "X-Preview-Cache": estadoCache,
      "X-OG-Imagen": imagenSocial ? imagenSocial.via : "sin-resolver",
    },
  });
}

// ============================================================
// CACHÉ DE NOTICIAS PUBLICADAS EN EL SITIO (stale-while-revalidate)
//
// Cada visita a una noticia hacía que el worker esperase a la API (varias
// consultas a D1: artículo, fusión previa/crónica, partido, eventos, media...)
// ANTES de enviar el primer byte de HTML, y después el navegador volvía a pedir
// lo mismo desde el JS de la página. Con la cuota diaria de lecturas de D1
// agotada ya una vez (sep-2026), eso es tiempo y dinero.
//
// Ahora el worker guarda la noticia publicada (memoria del isolate + Cache API
// de Cloudflare):
//  - < 60 s: se usa la copia, sin tocar la API.
//  - 60 s a 5 min: se usa la copia AL INSTANTE y se refresca en segundo plano.
//  - API caída o lenta: se usa la copia aunque sea más vieja (24 h) en vez de
//    mandar a un rastreador un 503.
// Solo se guardan noticias publicadas reales (no redirecciones, programadas ni
// errores). Si la API dice que ya no existe, la copia se borra. El cuerpo que
// ve el lector sigue viniendo en vivo de la API desde el navegador: esta caché
// solo afecta al <head> (SEO/vista previa) y al texto pre-pintado de los
// rastreadores, así que una edición tarda como mucho ~1-5 min en reflejarse ahí.
// ============================================================
const ART_FRESCO_MS = 60 * 1000;
const ART_SWR_MS = 5 * 60 * 1000;
const ART_CACHE_TTL_S = 24 * 60 * 60;
const ART_TIMEOUT_CON_COPIA_MS = 2000;
const ART_MEM = new Map(); // slug -> { article, t }
const ART_MEM_MAX = 60;
const ART_REFRESCANDO = new Set(); // evita que 50 visitas simultáneas lancen 50 refrescos

function claveCacheArticulo(slug) {
  return new Request(`https://cache.elotrofutbol.media/__art/${encodeURIComponent(slug)}`);
}

async function leerArticuloCache(slug) {
  const enMemoria = ART_MEM.get(slug);
  if (enMemoria) return enMemoria;
  try {
    const r = await caches.default.match(claveCacheArticulo(slug));
    if (!r) return null;
    const t = Number(r.headers.get("X-Guardado-Ms")) || 0;
    const article = await r.json();
    if (!article || !article.titulo) return null;
    const entrada = { article, t };
    ART_MEM.set(slug, entrada);
    return entrada;
  } catch {
    return null;
  }
}

function guardarArticuloCache(slug, article, ctx) {
  const entrada = { article, t: Date.now() };
  if (ART_MEM.size >= ART_MEM_MAX && !ART_MEM.has(slug)) ART_MEM.delete(ART_MEM.keys().next().value);
  ART_MEM.set(slug, entrada);
  const tarea = (async () => {
    try {
      await caches.default.put(claveCacheArticulo(slug), new Response(JSON.stringify(article), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ART_CACHE_TTL_S}`,
          "X-Guardado-Ms": String(entrada.t),
        },
      }));
    } catch { /* sin caché compartida: queda la de memoria */ }
  })();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(tarea);
}

function borrarArticuloCache(slug, ctx) {
  ART_MEM.delete(slug);
  const tarea = (async () => { try { await caches.default.delete(claveCacheArticulo(slug)); } catch { /* sin caché compartida */ } })();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(tarea);
}

// Es una noticia publicada "de verdad" (la única clase que se guarda).
function esArticuloPublicadoCacheable(r) {
  return !!(r && typeof r === "object" && !r.errorTransitorio && !r.redirigirA && !r.programada && r.titulo);
}

// Pregunta a la API y actualiza la copia. Devuelve lo mismo que
// obtenerArticuloParaSeo (artículo, null = no existe, {errorTransitorio}...).
async function consultarYGuardarArticulo(slug, ctx, timeoutMs) {
  const r = await obtenerArticuloParaSeo(slug, timeoutMs);
  if (esArticuloPublicadoCacheable(r)) guardarArticuloCache(slug, r, ctx);
  else if (r === null || (r && (r.redirigirA || r.programada))) borrarArticuloCache(slug, ctx); // borrada, despublicada, fusionada o reprogramada
  return r;
}

// Devuelve { articulo, estado } con estado HIT | SWR | MISS | STALE.
async function obtenerArticuloConCache(slug, ctx, timeoutMs = 3000) {
  const copia = await leerArticuloCache(slug);
  const edad = copia ? Date.now() - copia.t : Infinity;
  if (copia && edad < ART_FRESCO_MS) return { articulo: copia.article, estado: "HIT" };
  if (copia && edad < ART_SWR_MS) {
    if (!ART_REFRESCANDO.has(slug) && ctx && typeof ctx.waitUntil === "function") {
      ART_REFRESCANDO.add(slug);
      ctx.waitUntil(consultarYGuardarArticulo(slug, ctx, 3000).catch(() => {}).finally(() => ART_REFRESCANDO.delete(slug)));
    }
    return { articulo: copia.article, estado: "SWR" };
  }
  const r = await consultarYGuardarArticulo(slug, ctx, copia ? ART_TIMEOUT_CON_COPIA_MS : timeoutMs);
  // API caída o lenta pero hay una copia: mejor la noticia (algo vieja) que un error.
  if (r && r.errorTransitorio && copia) return { articulo: copia.article, estado: "STALE" };
  return { articulo: r, estado: "MISS" };
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
  // Buscadores/asistentes de IA y vistas previas de enlaces: reciben el mismo
  // HTML prepintado que Googlebot (titulares, enlaces y metadatos sin JS).
  "oai-searchbot",
  "chatgpt-user",
  "gptbot",
  "perplexitybot",
  "perplexity-user",
  "claudebot",
  "claude-searchbot",
  "claude-user",
  "bingpreview",
  "baiduspider",
  "seznambot",
  "cardyb", // Bluesky
  "mastodon",
  "iframely",
  "embedly",
  "flipboard",
  "feedly",
  // Rastreadores de vista previa que NO estaban (y por tanto no recibían el
  // refuerzo de bot): Meta cambió de facebookexternalhit a meta-externalagent
  // (Threads, Instagram, Messenger), Facebot, y mensajería/redes menores.
  "meta-externalagent",
  "meta-externalfetcher",
  "meta-webindexer",
  "facebot",
  "bluesky",
  "signal",
  "viber",
  "kakaotalk",
  "snapchat",
  "tumblr",
  "bitlybot",
  "quora link preview",
  "mattermost",
  "rocketchat",
  "micromessenger",
  "zalo",
  "xing-contenttabreceiver",
  "outbrain",
  "nuzzel",
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
// ---------- Saneado del HTML de artículos (anti XSS almacenado) ----------
// Lista blanca de etiquetas/atributos. Todo lo demás se elimina (la etiqueta,
// no su texto). Se aplica al GUARDAR un artículo; el frontend y el worker de
// SEO vuelven a sanear al pintar (defensa en profundidad, y cubre contenido
// ya guardado antes de este cambio).
const SAN_ETIQUETAS = new Set([
  "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "strike", "del", "ins", "mark", "small",
  "sub", "sup", "span", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
  "a", "img", "figure", "figcaption", "pre", "code", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
]);
const SAN_ATRIBUTOS_GLOBALES = new Set(["class", "title", "lang", "dir", "style"]);
const SAN_ATRIBUTOS_POR_ETIQUETA = {
  a: ["href", "target", "rel"],
  img: ["src", "alt", "width", "height", "loading"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan", "scope"],
  ol: ["start", "type"],
};
const SAN_ETIQUETAS_VACIAS = new Set(["br", "hr", "img"]);

function sanDecodificarEntidades(valor) {
  const nombradas = { colon: ":", tab: "\t", newline: "\n", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(valor)
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => { const c = parseInt(h, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; })
    .replace(/&#(\d+);?/g, (_, d) => { const c = parseInt(d, 10); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; })
    .replace(/&([a-z]+);/gi, (m, n) => (Object.prototype.hasOwnProperty.call(nombradas, n.toLowerCase()) ? nombradas[n.toLowerCase()] : m));
}
function sanEscaparAtributo(valor) {
  return String(valor).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function sanUrlSegura(valorDecodificado, { permitirDataImagen = false } = {}) {
  const limpio = String(valorDecodificado).replace(/[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]+/g, "");
  if (!limpio) return "";
  if (/^(https?:|mailto:|tel:)/i.test(limpio)) return limpio;
  if (permitirDataImagen && /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+\/=]+$/i.test(limpio)) return limpio;
  if (/^[a-z][a-z0-9+.\-]*:/i.test(limpio)) return ""; // cualquier otro esquema (javascript:, data:, vbscript:...)
  return limpio; // ruta relativa, "#ancla", "/ruta"...
}
function sanEstiloSeguro(valorDecodificado) {
  const v = String(valorDecodificado);
  if (/expression|javascript:|vbscript:|behavior|@import|url\s*\(|\\|<|>|-moz-binding/i.test(v)) return "";
  return v;
}
function sanTextoSuelto(texto) {
  // Texto entre etiquetas: un "<" suelto (etiqueta mal formada) se escapa; las
  // entidades existentes (&amp;, &nbsp;...) se respetan.
  return texto.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanearHtmlArticulo(html) {
  if (typeof html !== "string" || html === "") return html;
  let entrada = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math|form|textarea|select|option|button|link|meta|base|frame|frameset|applet|title)\b[\s\S]*?<\/\1\s*>/gi, "");
  const reEtiqueta = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'<>\/=`]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
  const reAtributo = /([^\s"'<>\/=`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let salida = "";
  let ultimo = 0;
  let m;
  while ((m = reEtiqueta.exec(entrada)) !== null) {
    salida += sanTextoSuelto(entrada.slice(ultimo, m.index));
    ultimo = reEtiqueta.lastIndex;
    const cierre = m[1] === "/";
    const etiqueta = m[2].toLowerCase();
    if (!SAN_ETIQUETAS.has(etiqueta)) continue;
    if (cierre) {
      if (!SAN_ETIQUETAS_VACIAS.has(etiqueta)) salida += `</${etiqueta}>`;
      continue;
    }
    const permitidosEtiqueta = SAN_ATRIBUTOS_POR_ETIQUETA[etiqueta] || [];
    const atributos = [];
    let abreEnNuevaPestana = false;
    let a;
    reAtributo.lastIndex = 0;
    while ((a = reAtributo.exec(m[3] || "")) !== null) {
      const nombre = a[1].toLowerCase();
      if (nombre.startsWith("on")) continue;
      if (!SAN_ATRIBUTOS_GLOBALES.has(nombre) && !permitidosEtiqueta.includes(nombre)) continue;
      const valor = sanDecodificarEntidades(a[2] ?? a[3] ?? a[4] ?? "");
      let valorFinal = valor;
      if (nombre === "href") valorFinal = sanUrlSegura(valor);
      else if (nombre === "src") valorFinal = sanUrlSegura(valor, { permitirDataImagen: true });
      else if (nombre === "style") valorFinal = sanEstiloSeguro(valor);
      else if (nombre === "target") { if (valor.toLowerCase() === "_blank") abreEnNuevaPestana = true; continue; }
      else if (nombre === "rel") continue;
      if ((nombre === "href" || nombre === "src" || nombre === "style") && !valorFinal) continue;
      atributos.push(` ${nombre}="${sanEscaparAtributo(valorFinal)}"`);
    }
    if (etiqueta === "a" && abreEnNuevaPestana) atributos.push(' target="_blank" rel="noopener noreferrer"');
    salida += `<${etiqueta}${atributos.join("")}${SAN_ETIQUETAS_VACIAS.has(etiqueta) ? " /" : ""}>`;
  }
  salida += sanTextoSuelto(entrada.slice(ultimo));
  return salida;
}

// SEGURIDAD: el cuerpo se sirve ya pintado a los bots; se sanea con lista blanca
// para que un titulo/cuerpo malicioso no se inyecte en el HTML del servidor.
function cuerpoBasicoParaBot(contenidoHtml) {
  return sanearHtmlArticulo(String(contenidoHtml ?? ""));
}

// Construye el HTML que sustituye a "<p>Cargando...</p>" dentro de
// #contenidoArticulo, replicando la estructura esencial que pinta
// renderizaArticulo() en noticia.html (cabecera + imagen + cuerpo),
// simplificada para un lector no interactivo (bot).
function construirCuerpoArticuloParaBot(article, idiomaQuery, recientes = []) {
  const disponibles = Array.isArray(article.idiomas_disponibles) ? article.idiomas_disponibles : [];
  const idiomaActual = (idiomaQuery && SEO_IDIOMAS_WORKER[idiomaQuery]) ? idiomaQuery : SEO_IDIOMA_DEFECTO_WORKER;
  const trad = (article.traducciones && article.traducciones[idiomaActual]) || null;

  const titulo = (trad && trad.titulo) || article.titulo || "";
  const subtitulo = (trad && trad.subtitulo) || article.subtitulo || "";
  const contenidoHtml = (trad && trad.contenido) || article.contenido || "";

  const imagenUrl = article.imagen_url || primeraFotoArticuloSeo(article.imagenes) || "";

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
<div class="article-body">${cuerpoBasicoParaBot(contenidoHtml)}</div>
${construirFichaPartidoParaBot(article)}
${construirEnlacesInternosParaBot(article, recientes)}`;
}

// Ficha del partido (solo versión para bots): texto con los dos equipos,
// competición, jornada, fecha, estadio y marcador, más enlaces internos a
// los dos clubes, a la previa/crónica "hermana" del mismo partido, al minuto
// a minuto y a la galería. Es lo que convierte la crónica en la página
// de referencia del cruce "Local - Visitante" para el rastreador.
function construirFichaPartidoParaBot(article) {
  const p = seoDatosPartido(article, etiquetaCategoriaWorker);
  if (!p) return "";
  const r = p.resultado;
  const cat = article.categoria || r.competicion || "";
  const esc = escapeHtmlSeo;
  const enlace = (href, texto) => `<a href="${esc(seoUrlAbsolutaWorker(href))}">${esc(texto)}</a>`;
  const club = (nombre) => cat ? enlace(`/categoria?cat=${encodeURIComponent(cat)}&club=${encodeURIComponent(nombre)}`, nombre) : esc(nombre);
  const filas = [`<li>Partido: ${club(p.local)} - ${club(p.visitante)}</li>`];
  if (p.competicion) filas.push(`<li>Competición: ${esc(p.competicion)}${p.jornada ? ` · Jornada ${p.jornada}` : ""}</li>`);
  if (p.marcador) filas.push(`<li>Resultado final: ${esc(`${p.local} ${p.marcador} ${p.visitante}`)}</li>`);
  if (p.fechaTxt) filas.push(`<li>Fecha: ${esc(p.fechaTxt)}${p.hora ? ` · ${esc(p.hora)} h` : ""}</li>`);
  if (p.ubicacion) filas.push(`<li>Estadio: ${esc(p.ubicacion)}</li>`);
  const relacionados = Array.isArray(article.relacionados_partido) ? article.relacionados_partido : [];
  relacionados.filter((x) => x && x.slug && x.titulo).forEach((x) => {
    const nombre = x.tipo === "cronica" ? "Crónica" : "Previa";
    filas.push(`<li>${nombre} del partido: ${enlace(urlNoticiaWorker(x.categoria || cat, x.slug), x.titulo)}</li>`);
  });
  if (r.id) filas.push(`<li>${enlace(`/minuto-a-minuto.html?id=${encodeURIComponent(r.id)}`, `Minuto a minuto ${p.local} - ${p.visitante}`)}</li>`);
  if (r.url_galeria && r.galeria_disponible) filas.push(`<li>${enlace(r.url_galeria, `Galería de fotos ${p.local} - ${p.visitante}`)}</li>`);
  return `<section class="ficha-partido-bot"><h2>${esc(p.etiqueta)} ${esc(p.local)} - ${esc(p.visitante)}: datos del partido</h2><ul>${filas.join("")}</ul></section>`;
}

// Enlaces internos al final de la noticia (solo versión para bots): hacia
// la categoría, la ficha del club y otras noticias recientes (primero las
// de la misma categoría). Sin ellos, una noticia era un callejón sin salida
// para el rastreador: ningún enlace a otras noticias ni a los índices.
function construirEnlacesInternosParaBot(article, recientes) {
  const cat = article.categoria || "";
  const enlaces = [];
  if (cat) {
    enlaces.push(`<a href="${escapeHtmlSeo(seoUrlAbsolutaWorker(`/categoria?cat=${encodeURIComponent(cat)}`))}">Más noticias de ${escapeHtmlSeo(etiquetaCategoriaWorker(cat))}</a>`);
    const club = clubArticuloLegibleSeo(article.club);
    if (club && !club.includes(" - ")) {
      enlaces.push(`<a href="${escapeHtmlSeo(seoUrlAbsolutaWorker(`/categoria?cat=${encodeURIComponent(cat)}&club=${encodeURIComponent(club)}`))}">Todas las noticias del ${escapeHtmlSeo(club)}</a>`);
    }
  }
  enlaces.push(`<a href="${escapeHtmlSeo(seoUrlAbsolutaWorker("/"))}">Portada de ${escapeHtmlSeo(SEO_NOMBRE_SITIO)}</a>`);

  const otras = (Array.isArray(recientes) ? recientes : []).filter((a) => a && a.slug && a.slug !== article.slug && a.titulo);
  const mismas = otras.filter((a) => a.categoria === article.categoria);
  const resto = otras.filter((a) => a.categoria !== article.categoria);
  const elegidas = [...mismas, ...resto].slice(0, 6);
  const listaRecientes = elegidas.length
    ? `<h2>Últimas noticias</h2><ul>${elegidas.map((a) => `<li><a href="${escapeHtmlSeo(seoUrlAbsolutaWorker(urlNoticiaWorker(a.categoria, a.slug)))}">${escapeHtmlSeo(a.titulo)}</a></li>`).join("")}</ul>`
    : "";
  return `<nav class="enlaces-internos-bot" aria-label="Seguir leyendo">${listaRecientes}<p>${enlaces.join(" · ")}</p></nav>`;
}

// Sustituye el placeholder "<p>Cargando...</p>" dentro de
// <main ... id="contenidoArticulo">...</main> por el HTML ya pintado
// del artículo. Igual que inyectarSeoEnHtml, se usa un string-replace
// acotado a marcas conocidas del propio archivo en vez de un parser
// HTML completo: si la plantilla cambiara de forma inesperada, se
// sirve sin tocar en vez de arriesgarse a corromper el documento.
function inyectarCuerpoEnHtml(html, cuerpoHtml) {
  // Regex tolerante a los saltos de línea (\n o \r\n): noticia.html puede
  // desplegarse con CRLF y, con una cadena exacta, el marcador no coincidía
  // y el cuerpo prepintado para bots NO se inyectaba, sin dar ningún error.
  const patron = /<main class="wrap" id="contenidoArticulo">\s*<p>Cargando\.\.\.<\/p>\s*<\/main>/;
  if (!patron.test(html)) return html;
  // Reemplazo con función: un "$&" o "$1" dentro del texto de la noticia no
  // debe interpretarse como patrón especial de String.replace.
  return html.replace(
    patron,
    () => `<main class="wrap" id="contenidoArticulo" data-prepintado="1">\n${cuerpoHtml}\n</main>`
  );
}

// Sirve noticia.html con el SEO ya inyectado en servidor para un slug
// dado. request/env/url son los de la petición actual; noticiaRequest es
// la request (ya reescrita a /noticia si venía de la URL bonita) que se
// le pasa a env.ASSETS.fetch().
async function servirNoticiaConSeo(noticiaRequest, env, slug, idiomaQuery, esBot, ctx) {
  // Rastreadores: si ya tenemos fresca la programada, respuesta inmediata
  // (sin API ni noticia.html). Ver "VISTA PREVIA RÁPIDA" más arriba.
  let copiaProg = null;
  if (esBot) {
    copiaProg = await leerProgramadaCache(slug);
    if (progFresca(copiaProg)) {
      const imgHit = await resolverImagenSocial(copiaProg.prog.imagen_url, copiaProg.prog.imagen_foco, ctx);
      return respuestaBotProgramada(copiaProg.prog, noticiaRequest, "HIT", imgHit);
    }
  }
  const [respuestaAssets, { articulo: article, estado: estadoArticulo }] = await Promise.all([
    env.ASSETS.fetch(noticiaRequest),
    // Con copia de respaldo no se espera los 3 s completos a la API. Las
    // noticias publicadas salen de la caché (ver "CACHÉ DE NOTICIAS PUBLICADAS").
    obtenerArticuloConCache(slug, ctx, copiaProg ? PROG_TIMEOUT_CON_COPIA_MS : 3000),
  ]);

  // Sin artículo: puede ser que no exista, que la API no haya respondido
  // a tiempo (timeout de 3s en obtenerArticuloParaSeo), o que esté
  // programada para publicarse más tarde. Antes, en TODOS estos casos se
  // servía noticia.html tal cual con status 200 -- incluyendo el caso de
  // slug inexistente, donde el HTML quedaba con el placeholder
  // "Cargando..." sin datos, sin JS del lado servidor que lo rellenara,
  // ni un status 404 real. Eso hacía que Google, otros bots, y cualquier
  // comprobación automática de enlaces rotos vieran un 200 "vacío" en
  // vez de un 404, y que el 404.html personalizado del sitio NUNCA se
  // sirviera para noticias inexistentes.
  //
  // No se puede distinguir aquí "no existe" de "timeout de la API" (la
  // función obtenerArticuloParaSeo colapsa ambos casos a `null` a
  // propósito, ver su comentario), así que en caso de duda se deja pasar
  // sin togar SOLO si la respuesta de assets ya no fue 200 (por ejemplo
  // si noticia.html no existiera). Si assets sí dio 200 pero no hay
  // artículo, se entiende que el slug no es válido y se sirve el 404
  // real del sitio en vez de la plantilla vacía.
  if (respuestaAssets.status !== 200) return respuestaAssets;
  // El enlace es de una noticia que está fusionada con otra: se lleva al
  // lector (y al bot de redes) a la URL de la noticia fusionada. 302 y no
  // 301 porque la fusión es al leer: si una se despublica, deja de aplicar.
  if (article && article.redirigirA && article.redirigirA.slug !== slug) {
    const destino = new URL(urlNoticiaWorker(article.redirigirA.categoria, article.redirigirA.slug), noticiaRequest.url);
    if (idiomaQuery) destino.searchParams.set("lang", idiomaQuery);
    return Response.redirect(destino.toString(), 302);
  }
  if (article && article.errorTransitorio) {
    // La API no respondió bien. A un rastreador se le pide volver más
    // tarde (503 + Retry-After) en vez de darle un 404 definitivo; a un
    // lector se le sirve la plantilla y noticia.html carga la noticia por JS.
    if (esBot) {
      // Había una copia de la programada (aunque vieja): mejor tarjeta
      // completa que un 503 que deja el enlace sin título ni foto.
      if (copiaProg) {
        const imgStale = await resolverImagenSocial(copiaProg.prog.imagen_url, copiaProg.prog.imagen_foco, ctx);
        return respuestaBotProgramada(copiaProg.prog, noticiaRequest, "STALE", imgStale);
      }
      return new Response("Servicio temporalmente no disponible", {
        status: 503,
        headers: { "Retry-After": "120", "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return respuestaAssets;
  }
  if (!article) {
    return servir404Real(env, noticiaRequest.url);
  }

  // Noticia programada (aún sin publicar): se sirve noticia.html con las
  // etiquetas Open Graph / Twitter Card REALES (titular, subtítulo e imagen),
  // para que la vista previa del enlace salga completa aunque el tuit/post se
  // programe antes de la hora de publicación. El cuerpo no se expone: el
  // lector ve la cuenta atrás (noticia.html la pinta por JS con la misma API).
  if (article.programada) {
    // Rastreador: la imagen anunciada se COMPRUEBA antes de contestar (ver
    // "IMAGEN SOCIAL VERIFICADA"); a un lector no le hace falta.
    const imgProg = esBot ? await resolverImagenSocial(article.programada.imagen_url, article.programada.imagen_foco, ctx) : null;
    registrarProgramada(slug, article.programada, copiaProg, ctx);
    if (esBot) {
      return respuestaBotProgramada(article.programada, noticiaRequest, copiaProg ? "REFRESH" : "MISS", imgProg);
    }
    const contentTypeProg = respuestaAssets.headers.get("Content-Type") || "";
    if (!contentTypeProg.includes("text/html")) return respuestaAssets;
    const htmlProg = await respuestaAssets.text();
    const esBuscador = esUserAgentBuscador(noticiaRequest.headers.get("User-Agent"));
    const htmlFinalProg = inyectarSeoEnHtml(htmlProg, construirMetaNoticiaProgramada(article.programada, esBuscador));
    const headersProg = new Headers(respuestaAssets.headers);
    headersProg.delete("Content-Length");
    headersProg.delete("ETag");
    headersProg.set("Cache-Control", "no-store");
    headersProg.set("Vary", "User-Agent");
    return new Response(htmlFinalProg, { status: 200, headers: headersProg });
  }

  const contentType = respuestaAssets.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) return respuestaAssets;

  const html = await respuestaAssets.text();
  // Rastreadores: la imagen anunciada se COMPRUEBA antes (ver "IMAGEN SOCIAL
  // VERIFICADA"); si la derivada de Cloudinary falla se cae a otra que cargue.
  const imagenSocial = esBot ? await resolverImagenSocial(origenImagenArticulo(article), article.imagen_foco, ctx) : null;
  const bloqueSeo = construirMetaNoticia(article, idiomaQuery, imagenSocial, varianteSocialDeRequest(noticiaRequest, esBot));
  let htmlFinal = inyectarSeoEnHtml(html, bloqueSeo);

  // El contenido principal pre-pintado SOLO se sirve a bots conocidos:
  // a un lector real le seguimos mandando el placeholder + noticia.html
  // pintándolo por JS, con toda su interactividad (galería, comentarios,
  // encuestas, minuto a minuto en vivo...) intacta.
  if (esBot) {
    // Reutiliza la caché de 60 s de la portada: sin lecturas extra de D1.
    const recientes = await obtenerUltimasNoticiasParaBot();
    const cuerpoHtml = construirCuerpoArticuloParaBot(article, idiomaQuery, recientes);
    htmlFinal = inyectarCuerpoEnHtml(htmlFinal, cuerpoHtml);
  }

  const headers = new Headers(respuestaAssets.headers);
  // El HTML ahora es específico de esta noticia (título, descripción,
  // imagen...): no debe servirse desde una caché compartida como si
  // fuera genérico.
  headers.set("Cache-Control", "no-store");
  headers.set("Vary", "User-Agent");
  headers.set("X-Article-Cache", estadoArticulo);
  if (imagenSocial) headers.set("X-OG-Imagen", imagenSocial.via);
  return new Response(htmlFinal, { status: respuestaAssets.status, headers });
}

// Sirve la plantilla real 404.html con status 404 real, de forma
// robusta ante los dos fallos observados en producción al pedirla vía
// env.ASSETS.fetch() desde DENTRO de un worker con run_worker_first:
//   1) A veces env.ASSETS.fetch() no lanza excepción, pero devuelve un
//      body VACÍO (0 bytes) con status 404 y una cabecera "Location"
//      colgada (redirección interna de Cloudflare a la ruta canónica
//      "/404" que nunca llega a resolverse en contenido real). Un 404
//      con body vacío es justo lo que hace que el navegador muestre SU
//      PROPIA pantalla de error genérica en vez de nuestra página.
//   2) A veces env.ASSETS.fetch() lanza directamente (promesa
//      rechazada), lo que sin captura reventaría el propio Worker.
// Por eso aquí se lee el body como texto y se comprueba que tenga
// contenido real antes de darlo por bueno; si está vacío o falla, se
// genera un 404 de emergencia en el propio worker (mismo patrón que
// paginaMantenimientoSitio) para no depender en absoluto de que
// ASSETS.fetch se comporte bien con la ruta /404.html.
async function servir404Real(env, baseUrlComoTexto) {
  try {
    const notFoundUrl = new URL("/404.html", baseUrlComoTexto);
    // Petición GET limpia y nueva, sin heredar cabeceras/método de la
    // request original (mismo motivo que en el modo mantenimiento: no
    // arriesgarse a que ASSETS.fetch se confunda con algo de la
    // petición real, p.ej. condicionales If-None-Match que devuelvan
    // un 304 sin body).
    const respuesta404 = await env.ASSETS.fetch(notFoundUrl.toString());
    const texto = await respuesta404.text();
    if (texto && texto.trim().length > 0) {
      const headers = new Headers(respuesta404.headers);
      // Quitamos cualquier "Location" que ASSETS.fetch pudiera haber
      // colado (visto en producción: 404 con Location: /404 colgada) —
      // en una respuesta 404 esa cabecera no pinta nada y algunos
      // clientes/proxies pueden comportarse de forma rara con ella.
      headers.delete("Location");
      headers.set("Content-Type", "text/html; charset=utf-8");
      headers.set("Cache-Control", "no-store");
      return new Response(texto, { status: 404, headers });
    }
  } catch {
    // Sigue abajo al fallback de emergencia.
  }
  // Fallback de emergencia: si ni siquiera se pudo leer un 404.html con
  // contenido real, se genera aquí mismo un HTML mínimo pero con marca
  // del sitio, en vez de dejar que el navegador muestre su propia
  // pantalla de error genérica sobre un body vacío.
  return new Response(
    `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Página no encontrada — ELOTROFÚTBOLTV</title>
<meta name="robots" content="noindex"></head>
<body style="font-family:sans-serif;text-align:center;padding:60px 20px">
<h1>404 — Fuera de juego</h1>
<p>La página que buscas no existe, se ha movido o el enlace es incorrecto.</p>
<p><a href="/index.html">Ir a portada</a></p>
</body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

// ============================================================
// PORTADA PREPINTADA PARA BOTS
//
// index.html es una cáscara vacía ("Cargando lo último...") que se rellena
// por JS desde la API. Un rastreador que no ejecuta JS (o que lo ejecuta
// tarde, en la segunda fase de renderizado de Google) llega a la portada
// -la página que más a menudo vuelve a visitar- sin ver NI UN enlace a las
// noticias nuevas. Aquí, SOLO para bots conocidos, se rellena el bloque
// "Noticias recientes" con los enlaces reales a las últimas noticias, el
// mismo contenido que luego pinta el cliente. Los lectores reales reciben
// el HTML exactamente igual que antes.
//
// Si la API no responde (timeout corto) se sirve la portada sin tocar. Hay
// una caché mínima en memoria (60 s) por isolate para que una ráfaga de
// bots no se traduzca en una ráfaga de lecturas de D1.
// ============================================================
let _cachePortadaBot = { t: 0, articulos: [] };

async function obtenerUltimasNoticiasParaBot() {
  const ahora = Date.now();
  if (_cachePortadaBot.articulos.length && ahora - _cachePortadaBot.t < 60000) {
    return _cachePortadaBot.articulos;
  }
  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), 3000);
  try {
    const resp = await fetch("https://api.elotrofutbol.media/api/articles?limit=15", {
      signal: controlador.signal,
      headers: { "Accept": "application/json" },
    });
    // Si la API falla se usa la última lista conocida (aunque sea vieja): antes
    // la portada salía sin ningún enlace a noticias para los rastreadores.
    if (!resp.ok) return _cachePortadaBot.articulos;
    const data = await resp.json().catch(() => null);
    const articulos = (data && Array.isArray(data.articles)) ? data.articles.filter((a) => a && a.slug && a.titulo) : [];
    if (articulos.length) _cachePortadaBot = { t: ahora, articulos };
    return articulos.length ? articulos : _cachePortadaBot.articulos;
  } catch {
    return _cachePortadaBot.articulos;
  } finally {
    clearTimeout(timeoutId);
  }
}

function construirListaPortadaParaBot(articulos) {
  const items = articulos.map((a) => {
    const href = seoUrlAbsolutaWorker(urlNoticiaWorker(a.categoria, a.slug));
    const fechaIso = aFechaIsoSeo(a.fecha_publicacion);
    const resumen = resumirTextoSeo(String(a.subtitulo || a.contenido || "").replace(/<[^>]+>/g, " "), 160);
    return `<li><a href="${escapeHtmlSeo(href)}">${escapeHtmlSeo(a.titulo)}</a>`
      + (fechaIso ? ` <time datetime="${fechaIso}">${fechaIso.slice(0, 10)}</time>` : "")
      + (resumen ? `<p>${escapeHtmlSeo(resumen)}</p>` : "")
      + `</li>`;
  }).join("\n");
  return `<nav aria-label="Últimas noticias"><ul class="lista-ultimas-bot">\n${items}\n</ul></nav>`;
}

function inyectarPortadaParaBot(html, articulos) {
  const marca = '<div id="grid-categoria-home"></div>';
  if (!articulos.length || !html.includes(marca)) return html;
  // Los lectores y Googlebot (que ejecuta JS) reciben el <h1> del titular
  // destacado que pinta main.js; un rastreador sin JS no lo tendría, así
  // que aquí se añade un <h1> de marca oculto visualmente solo para bots.
  const h1Bot = '<h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap">ELOTROFÚTBOLTV — Noticias del fútbol no profesional</h1>';
  return html.replace(marca, () => `${h1Bot}<div id="grid-categoria-home">${construirListaPortadaParaBot(articulos)}</div>`);
}

// ============================================================
// CATEGORÍAS Y FICHAS DE CLUB PREPINTADAS PARA BOTS
//
// categoria.html (/categoria?cat=hypermotion, /categoria?cat=...&club=...)
// tiene título genérico ("Categoría") y la lista de noticias vacía hasta
// que corre el JS. Estas páginas son los "índices" que Google vuelve a
// visitar a menudo para descubrir noticias nuevas de cada competición y
// de cada club, así que para bots conocidos se sirven ya con título,
// descripción, canonical, encabezado y los enlaces reales a las noticias
// (el mismo contenido que luego pinta el cliente). Lectores reales: HTML
// idéntico al de siempre. Si la API falla o no hay noticias, sin tocar.
// ============================================================
const CATEGORIAS_ETIQUETA_WORKER = {
  hypermotion: "LaLiga Hypermotion",
  primera_federacion: "Primera Federación",
  segunda_federacion: "Segunda Federación",
  copa_del_rey: "Copa del Rey",
  copa_federacion: "Copa Federación",
  general: "General",
  amistoso: "Amistoso",
  arbitraje: "Arbitraje",
  jurisdiccion: "Jurisdicción deportiva",
};

function etiquetaCategoriaWorker(cat) {
  return CATEGORIAS_ETIQUETA_WORKER[cat] || cat;
}

const _cacheCategoriaBot = new Map();

async function obtenerNoticiasCategoriaParaBot(cat, club) {
  const clave = club ? `club:${club}` : `cat:${cat}`;
  const ahora = Date.now();
  const previo = _cacheCategoriaBot.get(clave);
  if (previo && ahora - previo.t < 60000) return previo.articulos;
  const consulta = club
    ? `club=${encodeURIComponent(club)}`
    : `categoria=${encodeURIComponent(cat)}`;
  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), 3000);
  try {
    const resp = await fetch(`https://api.elotrofutbol.media/api/articles?${consulta}&limit=40`, {
      signal: controlador.signal,
      headers: { "Accept": "application/json" },
    });
    if (!resp.ok) return previo ? previo.articulos : [];
    const data = await resp.json().catch(() => null);
    const articulos = (data && Array.isArray(data.articles)) ? data.articles.filter((a) => a && a.slug && a.titulo) : [];
    if (articulos.length) {
      if (_cacheCategoriaBot.size >= 60) _cacheCategoriaBot.clear();
      _cacheCategoriaBot.set(clave, { t: ahora, articulos });
    }
    return articulos.length ? articulos : (previo ? previo.articulos : []);
  } catch {
    return previo ? previo.articulos : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function inyectarCategoriaParaBot(html, cat, club, articulos) {
  if (!articulos.length) return html;
  const etiqueta = etiquetaCategoriaWorker(cat);
  const titulo = club || etiqueta;
  const tituloCompleto = `${titulo} — ${SEO_NOMBRE_SITIO}`;
  const descripcion = club
    ? `Noticias, crónicas y resultados del ${club} en ${SEO_NOMBRE_SITIO}.`
    : `Noticias y crónicas de ${etiqueta} en ${SEO_NOMBRE_SITIO}.`;
  // Misma URL que fija js/seo.js en cliente (pathname sin ".html" + query).
  const canonica = seoUrlAbsolutaWorker(`/categoria?cat=${encodeURIComponent(cat)}${club ? `&club=${encodeURIComponent(club)}` : ""}`);

  const lista = `<nav aria-label="Noticias de ${escapeHtmlSeo(titulo)}"><ul class="lista-ultimas-bot">\n${articulos.map((a) => {
    const href = seoUrlAbsolutaWorker(urlNoticiaWorker(a.categoria, a.slug));
    const fechaIso = aFechaIsoSeo(a.fecha_publicacion);
    const resumen = resumirTextoSeo(String(a.subtitulo || a.contenido || "").replace(/<[^>]+>/g, " "), 160);
    return `<li><a href="${escapeHtmlSeo(href)}">${escapeHtmlSeo(a.titulo)}</a>`
      + (fechaIso ? ` <time datetime="${fechaIso}">${fechaIso.slice(0, 10)}</time>` : "")
      + (resumen ? `<p>${escapeHtmlSeo(resumen)}</p>` : "")
      + `</li>`;
  }).join("\n")}\n</ul></nav>`;

  // JSON-LD: CollectionPage + ItemList con las noticias listadas, y miga de
  // pan Inicio > Categoría (> Club). Ayuda a Google a entender la página
  // como índice temático y a mostrar la ruta en los resultados.
  const jsonLdColeccion = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": tituloCompleto,
    "description": descripcion,
    "url": canonica,
    "inLanguage": "es",
    "isPartOf": { "@type": "WebSite", "name": SEO_NOMBRE_SITIO, "url": SEO_DOMINIO_WORKER + "/" },
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": articulos.slice(0, 40).map((a, i) => ({
        "@type": "ListItem",
        "position": i + 1,
        "url": seoUrlAbsolutaWorker(urlNoticiaWorker(a.categoria, a.slug)),
        "name": a.titulo,
      })),
    },
  };
  const migasCat = [
    { "@type": "ListItem", "position": 1, "name": "Inicio", "item": seoUrlAbsolutaWorker("/") },
    { "@type": "ListItem", "position": 2, "name": etiqueta, "item": seoUrlAbsolutaWorker(`/categoria?cat=${encodeURIComponent(cat)}`) },
  ];
  if (club) migasCat.push({ "@type": "ListItem", "position": 3, "name": club });
  const jsonLdMigasCat = { "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": migasCat };
  // "<" escapado para que un título con "</script>" no pueda cerrar el bloque.
  const ldSeguro = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

  let salida = html;
  salida = salida.replace(/<title id="pageTitle">[\s\S]*?<\/title>/, () =>
    `<title id="pageTitle">${escapeHtmlSeo(tituloCompleto)}</title>\n<meta name="description" content="${escapeHtmlSeo(descripcion)}">\n<link rel="canonical" href="${escapeHtmlSeo(canonica)}">\n<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="${escapeHtmlSeo(SEO_NOMBRE_SITIO)}">\n<meta property="og:locale" content="es_ES">\n<meta property="og:title" content="${escapeHtmlSeo(tituloCompleto)}">\n<meta property="og:description" content="${escapeHtmlSeo(descripcion)}">\n<meta property="og:url" content="${escapeHtmlSeo(canonica)}">\n<meta name="twitter:title" content="${escapeHtmlSeo(tituloCompleto)}">\n<meta name="twitter:description" content="${escapeHtmlSeo(descripcion)}">\n<meta name="twitter:site" content="${SEO_TWITTER_SITE}">\n<script type="application/ld+json" id="seo-jsonld-coleccion">${ldSeguro(jsonLdColeccion)}</script>\n<script type="application/ld+json" id="seo-jsonld-breadcrumb">${ldSeguro(jsonLdMigasCat)}</script>`);
  salida = salida.replace(/<h[12] class="section-title" id="tituloCategoria">Categoría<\/h[12]>/, () =>
    `<h1 class="section-title" id="tituloCategoria">${escapeHtmlSeo(titulo)}</h1>`);
  salida = salida.replace('<div class="grid-noticias" id="grid"></div>', () =>
    `<div class="grid-noticias" id="grid">${lista}</div>`);
  return salida;
}

// ============================================================
// AUTOR Y GALERÍA PREPINTADOS PARA BOTS
//
// autor.html y galeria.html pintan su contenido y su <head> por JS, así que
// WhatsApp/Telegram/X/Facebook (que no ejecutan JS) veían una tarjeta genérica
// y los buscadores/IA que no renderizan no veían nada. A los bots conocidos se
// les sirve el <head> y un cuerpo de lectura ya con los datos reales.
// ============================================================
async function obtenerJsonApiParaBot(ruta) {
  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), 3000);
  try {
    const resp = await fetch(`https://api.elotrofutbol.media${ruta}`, {
      signal: controlador.signal,
      headers: { "Accept": "application/json" },
    });
    if (resp.status === 404) return { noExiste: true };
    if (!resp.ok) return null;
    return await resp.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function ldSeguroBot(objeto) {
  return JSON.stringify(objeto).replace(/</g, "\\u003c");
}

// Bloque de metadatos común (title + description + canonical + og + twitter).
function bloqueMetaPaginaBot({ titulo, descripcion, canonica, imagen, ancho, alto, tipoOg = "website", extra = "" }) {
  const e = escapeHtmlSeo;
  return `<title id="pageTitle">${e(titulo)}</title>
<meta name="description" content="${e(descripcion)}">
<link rel="canonical" href="${e(canonica)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta property="og:type" content="${tipoOg}">
<meta property="og:site_name" content="${e(SEO_NOMBRE_SITIO)}">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="${e(titulo)}">
<meta property="og:description" content="${e(descripcion)}">
<meta property="og:url" content="${e(canonica)}">
<meta property="og:image" content="${e(imagen)}">
${ancho ? `<meta property="og:image:width" content="${ancho}">\n<meta property="og:image:height" content="${alto}">` : ""}
<meta property="og:image:alt" content="${e(titulo)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="${SEO_TWITTER_SITE}">
<meta name="twitter:title" content="${e(titulo)}">
<meta name="twitter:description" content="${e(descripcion)}">
<meta name="twitter:image" content="${e(imagen)}">
${extra}`;
}

// Quita las etiquetas de imagen genéricas de la plantilla para no duplicarlas.
function quitarMetaImagenGenerica(html) {
  return html
    .replace(/<meta property="og:image" content="[^"]*">\r?\n?/g, "")
    .replace(/<meta name="twitter:image" content="[^"]*">\r?\n?/g, "")
    .replace(/<meta name="twitter:card" content="[^"]*">\r?\n?/g, "");
}

function inyectarAutorParaBot(html, id, autor, articulos) {
  const nombre = String(autor.nombre || "").trim();
  if (!nombre) return html;
  const e = escapeHtmlSeo;
  const titulo = `${nombre} — ${SEO_NOMBRE_SITIO}`;
  const equipos = Array.isArray(autor.equipo) ? autor.equipo : (autor.equipo ? [autor.equipo] : []);
  const bio = String(autor.bio || "").trim();
  const descripcion = resumirTextoSeo(bio, 160)
    || `Perfil de ${nombre}${equipos.length ? `, redactor de ${equipos.join(" y ")}` : ", autor"} en ${SEO_NOMBRE_SITIO}.`;
  const canonica = seoUrlAbsolutaWorker(`/autor?id=${encodeURIComponent(id)}`);
  const avatar = autor.avatar_url ? seoUrlAbsolutaWorker(autor.avatar_url) : "";
  const img = avatar ? seoImagenSocialWorker(avatar, 1200, 630, autor.avatar_foco) : { url: "", ancho: 0, alto: 0 };
  const imagen = img.url || avatar || seoUrlAbsolutaWorker("img/og-default.png");
  const ancho = img.ancho || (avatar ? 0 : 1200);
  const alto = img.alto || (avatar ? 0 : 630);

  const sameAs = Object.values(autor.redes || {})
    .filter((u) => typeof u === "string" && /^https?:\/\//i.test(u))
    .slice(0, 8);
  const jsonLdPerfil = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "url": canonica,
    "name": titulo,
    "inLanguage": "es",
    "isPartOf": { "@type": "WebSite", "@id": SEO_DOMINIO_WORKER + "/#sitio" },
    "mainEntity": {
      "@type": "Person",
      "@id": canonica + "#persona",
      "name": nombre,
      "description": bio || undefined,
      "image": avatar || undefined,
      "jobTitle": "Redactor",
      "worksFor": { "@type": "Organization", "@id": SEO_DOMINIO_WORKER + "/#organizacion", "name": SEO_NOMBRE_SITIO },
      "sameAs": sameAs.length ? sameAs : undefined,
    },
  };
  const jsonLdMigas = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Inicio", "item": seoUrlAbsolutaWorker("/") },
      { "@type": "ListItem", "position": 2, "name": nombre },
    ],
  };
  const extra = `<script type="application/ld+json" id="seo-jsonld-perfil">${ldSeguroBot(jsonLdPerfil)}</script>\n<script type="application/ld+json" id="seo-jsonld-breadcrumb">${ldSeguroBot(jsonLdMigas)}</script>`;

  const lista = (articulos || []).filter((a) => a && a.slug && a.titulo).slice(0, 30).map((a) =>
    `<li><a href="${e(seoUrlAbsolutaWorker(urlNoticiaWorker(a.categoria, a.slug)))}">${e(a.titulo)}</a></li>`).join("\n");
  const cuerpo = `<article class="perfil-autor-cabecera"><h1>${e(nombre)}</h1>`
    + (equipos.length ? `<p>${e(equipos.join(" · "))}</p>` : "")
    + (bio ? `<p>${e(bio)}</p>` : "")
    + `</article>`
    + (lista ? `<nav aria-label="Noticias de ${e(nombre)}"><h2>Sus últimas noticias</h2><ul class="lista-ultimas-bot">\n${lista}\n</ul></nav>` : "");

  let salida = quitarMetaImagenGenerica(html);
  salida = salida.replace(/<title id="pageTitle">[\s\S]*?<\/title>/, () =>
    bloqueMetaPaginaBot({ titulo, descripcion, canonica, imagen, ancho, alto, tipoOg: "profile", extra }));
  salida = salida.replace('<div class="estado-info"><div class="spinner"></div><p>Cargando...</p></div>', () => cuerpo);
  return salida;
}

function primeraFotoGaleriaConFoco(grupos) {
  for (const valor of Object.values(grupos || {})) {
    const lista = Array.isArray(valor) ? valor : (valor && Array.isArray(valor.fotos) ? valor.fotos : []);
    for (const f of lista) {
      const u = typeof f === "string" ? f : (f && (f.url || f.cloudinary_url || f.imagen_url || f.src || f.secure_url));
      if (typeof u === "string" && /^https?:\/\//i.test(u) && !/\.(mp4|webm|mov)(\?|$)/i.test(u)) {
        return { url: u, foco: f && typeof f === "object" ? (f.portada_foco || f.foco || "") : "" };
      }
    }
  }
  return { url: "", foco: "" };
}
function primeraFotoGaleria(grupos) {
  return primeraFotoGaleriaConFoco(grupos).url;
}

function inyectarGaleriaParaBot(html, slug, partido, grupos) {
  const e = escapeHtmlSeo;
  const local = String(partido.equipo_local || "").trim();
  const visitante = String(partido.equipo_visitante || "").trim();
  if (!local || !visitante) return html;
  const tieneMarcador = partido.goles_local != null && partido.goles_visitante != null;
  const marcador = tieneMarcador ? `${partido.goles_local}-${partido.goles_visitante}` : "";
  const titulo = `Galería de contenido: ${local} ${marcador ? marcador + " " : ""}${visitante} — ${SEO_NOMBRE_SITIO}`;
  const fecha = aFechaIsoSeo(partido.fecha_partido);
  const fechaTxt = fecha ? new Date(fecha).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }) : "";
  const competicion = partido.competicion ? etiquetaCategoriaWorker(partido.competicion) : "";
  const descripcion = resumirTextoSeo(
    `Fotos del partido ${local} - ${visitante}${marcador ? ` (${marcador})` : ""}${competicion ? `, ${competicion}` : ""}${partido.jornada ? `, jornada ${partido.jornada}` : ""}${fechaTxt ? `, ${fechaTxt}` : ""}. Galería organizada por equipo.`,
    160);
  const canonica = seoUrlAbsolutaWorker(`/galeria/${encodeURIComponent(slug)}`);
  const { url: foto, foco: focoFoto } = primeraFotoGaleriaConFoco(grupos);
  const img = foto ? seoImagenSocialWorker(foto, 1200, 630, focoFoto) : { url: "", ancho: 0, alto: 0 };
  const imagen = img.url || foto || seoUrlAbsolutaWorker("img/og-default.png");
  const ancho = img.ancho || (foto ? 0 : 1200);
  const alto = img.alto || (foto ? 0 : 630);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    "name": titulo,
    "description": descripcion,
    "url": canonica,
    "inLanguage": "es",
    "image": foto ? imagen : undefined,
    "isPartOf": { "@type": "WebSite", "@id": SEO_DOMINIO_WORKER + "/#sitio" },
    "about": {
      "@type": "SportsEvent",
      "name": `${local} - ${visitante}`,
      "startDate": fecha || undefined,
      "sport": "Fútbol",
    },
  };
  const jsonLdMigas = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Inicio", "item": seoUrlAbsolutaWorker("/") },
      { "@type": "ListItem", "position": 2, "name": "Galerías", "item": seoUrlAbsolutaWorker("/galerias") },
      { "@type": "ListItem", "position": 3, "name": `${local} - ${visitante}` },
    ],
  };
  const extra = `<script type="application/ld+json" id="seo-jsonld-galeria">${ldSeguroBot(jsonLd)}</script>\n<script type="application/ld+json" id="seo-jsonld-breadcrumb">${ldSeguroBot(jsonLdMigas)}</script>`;

  let salida = quitarMetaImagenGenerica(html);
  salida = salida.replace(/<meta name="description" content="[^"]*">\r?\n?/, "");
  salida = salida.replace(/<link rel="canonical"[^>]*>\r?\n?/, "");
  salida = salida.replace(/<title id="pageTitle">[\s\S]*?<\/title>/, () =>
    bloqueMetaPaginaBot({ titulo, descripcion, canonica, imagen, ancho, alto, extra }));
  return salida;
}

// ============================================================
// MINUTO A MINUTO: METADATOS REALES PARA BOTS Y REDES SOCIALES
//
// /minuto-a-minuto?id=N es una página que se pinta por JS: sin esto, al
// compartir el enlace en X, Facebook, Telegram o Bluesky salía siempre la
// tarjeta genérica de la plantilla ("Minuto a minuto — ELOTROFÚTBOLTV", sin
// partido). Aquí, solo para bots conocidos, se pide el partido a la API
// (?ligero=1: una sola fila, con caché corta en la API) y se reescriben
// título, descripción, canonical, og:* y twitter:*.
// ============================================================
function inyectarMinutoAMinutoParaBot(html, id, partido) {
  const local = String(partido.equipo_local || "").trim();
  const visitante = String(partido.equipo_visitante || "").trim();
  if (!local || !visitante) return html;
  const tieneMarcador = partido.goles_local != null && partido.goles_visitante != null;
  const marcador = tieneMarcador ? `${partido.goles_local}-${partido.goles_visitante}` : "";
  const estado = String(partido.estado || "");
  const prefijo = estado === "en_juego" ? "EN DIRECTO: " : "";
  const sufijoEstado = estado === "finalizado" ? " (final)" : "";
  const titulo = `${prefijo}${local} ${marcador ? marcador + " " : ""}${visitante}${sufijoEstado} — Minuto a minuto — ${SEO_NOMBRE_SITIO}`;
  const fecha = aFechaIsoSeo(partido.fecha_partido);
  const fechaTxt = fecha ? new Date(fecha).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" }) : "";
  const competicion = partido.competicion ? etiquetaCategoriaWorker(partido.competicion) : "";
  const verbo = estado === "finalizado" ? "Revive" : "Sigue";
  const descripcion = resumirTextoSeo(
    `${verbo} el ${local} - ${visitante}${competicion ? ` de ${competicion}` : ""}${partido.jornada ? `, jornada ${partido.jornada}` : ""}${fechaTxt ? `, ${fechaTxt}` : ""}, minuto a minuto: goles, tarjetas, cambios y todos los eventos.`,
    160);
  const canonica = seoUrlAbsolutaWorker(`/minuto-a-minuto?id=${encodeURIComponent(id)}`);
  const imagen = seoUrlAbsolutaWorker("img/og-default.png");

  let salida = quitarMetaImagenGenerica(html);
  // La plantilla repite og:title/og:description/og:url/twitter:title/twitter:description
  // con el texto genérico: se quitan para no duplicarlos con los del bloque nuevo.
  salida = salida
    .replace(/<meta property="og:(title|description|url|type|site_name|locale|image:width|image:height|image:alt)" content="[^"]*">\r?\n?/g, "")
    .replace(/<meta name="twitter:(title|description|site)" content="[^"]*">\r?\n?/g, "");
  salida = salida.replace(/<meta name="description" content="[^"]*">\r?\n?/, "");
  salida = salida.replace(/<link rel="canonical"[^>]*>\r?\n?/, "");
  if (!/<title id="pageTitle">/.test(salida)) return html;
  salida = salida.replace(/<title id="pageTitle">[\s\S]*?<\/title>/, () =>
    bloqueMetaPaginaBot({ titulo, descripcion, canonica, imagen, ancho: 1200, alto: 630 }));
  return salida;
}

// ============================================================
// FICHAS DE JUGADOR Y PLANTILLAS: METADATOS REALES PARA BOTS
//
// /jugador?c=...&j=... y /plantilla?c=...&club=... se pintan por JS, así que
// sin esto un buscador o una red social veían siempre el título genérico
// («Ficha de jugador — ELOTROFÚTBOLTV») y ninguna cifra. Aquí, solo para
// bots conocidos, se piden los datos a la API pública (los mismos que usa la
// página, con su caché de 2 minutos) y se reescriben título, descripción,
// canonical, og:* y twitter:*, se añade JSON-LD (Person / SportsTeam) y se
// deja dentro de la página un resumen con enlaces a las fichas de cada
// jugador (el JS lo sustituye al cargar): así hay camino de rastreo
// plantilla → ficha aunque el bot no ejecute JavaScript.
// Las vistas de «histórico acumulado» (temp=todas) se sirven con noindex y
// canonical a la versión de la temporada en curso para no duplicar fichas.
// ============================================================
const COMPETICIONES_STATS_BOT = {
  hypermotion: "LaLiga Hypermotion",
  primera_federacion: "Primera Federación",
  segunda_federacion: "Segunda Federación",
};

function quitarMetaPaginaParaBot(html) {
  return quitarMetaImagenGenerica(html)
    .replace(/<meta property="og:(title|description|url|type|site_name|locale|image:width|image:height|image:alt)" content="[^"]*">\r?\n?/g, "")
    .replace(/<meta name="twitter:(title|description|site)" content="[^"]*">\r?\n?/g, "")
    .replace(/<meta name="description" content="[^"]*">\r?\n?/, "")
    .replace(/<meta name="robots" content="[^"]*">\r?\n?/, "")
    .replace(/<link rel="canonical"[^>]*>\r?\n?/, "");
}

function pluralStatsBot(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function inyectarFichaJugadorParaBot(html, competicion, ficha, historico = false) {
  const j = ficha && ficha.jugador;
  const t = ficha && ficha.totales;
  if (!j || !t || !j.club || !j.slug || !/<title id="pageTitle">/.test(html)) return html;
  const e = escapeHtmlSeo;
  const sinNombre = !!j.sin_nombre || !j.nombre;
  const nombre = sinNombre ? `Dorsal ${j.dorsal ?? "?"}` : String(j.nombre);
  const compNombre = COMPETICIONES_STATS_BOT[competicion] || "";
  const titulo = `${nombre} (${j.club}) — estadísticas y ficha — ${SEO_NOMBRE_SITIO}`;
  const descripcion = resumirTextoSeo(
    `${nombre}, ${j.club}: ${pluralStatsBot(t.goles, "gol", "goles")}, ${pluralStatsBot(t.asistencias, "asistencia", "asistencias")} y ${pluralStatsBot(t.tarjetas, "tarjeta", "tarjetas")} esta temporada${compNombre ? " en " + compNombre : ""}.`,
    160);
  const canonica = seoUrlAbsolutaWorker(`/jugador?c=${encodeURIComponent(competicion)}&j=${encodeURIComponent(j.slug)}`);
  const imagen = seoUrlAbsolutaWorker("img/og-default.png");
  const noIndexar = sinNombre || historico;

  const ld = sinNombre ? "" : `<script type="application/ld+json">${ldSeguroBot({
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${canonica}#jugador`,
    "name": nombre,
    "url": canonica,
    "jobTitle": "Futbolista",
    "description": descripcion,
    "memberOf": { "@type": "SportsTeam", "name": j.club, "sport": "Fútbol" },
  })}</script>`;

  let salida = quitarMetaPaginaParaBot(html);
  salida = salida.replace(/<title id="pageTitle">[\s\S]*?<\/title>/, () =>
    bloqueMetaPaginaBot({ titulo, descripcion, canonica, imagen, ancho: 1200, alto: 630, extra: ld }));
  if (noIndexar) salida = salida.replace('content="index, follow, max-image-preview:large, max-snippet:-1"', 'content="noindex, follow"');

  const enlacePlantilla = seoUrlAbsolutaWorker(`/plantilla?c=${encodeURIComponent(competicion)}&club=${encodeURIComponent(j.club)}`);
  const companeros = (Array.isArray(ficha.companeros) ? ficha.companeros : []).filter((c) => c && c.slug && c.jugador).slice(0, 12);
  const resumen = `<div id="fichaCont"><h1>${e(nombre)} — ${e(j.club)}</h1><p>${e(descripcion)}</p>`
    + `<p><a href="${e(enlacePlantilla)}">Plantilla de ${e(j.club)}</a></p>`
    + (companeros.length
      ? `<h2>Más jugadores de ${e(j.club)}</h2><ul>${companeros.map((c) => `<li><a href="${e(seoUrlAbsolutaWorker(`/jugador?c=${encodeURIComponent(competicion)}&j=${encodeURIComponent(c.slug)}`))}">${e(c.jugador)}</a></li>`).join("")}</ul>`
      : "")
    + `</div>`;
  return salida.replace('<div id="fichaCont"></div>', () => resumen);
}

function inyectarPlantillaParaBot(html, competicion, datos, historico = false) {
  const club = datos && String(datos.club || "").trim();
  if (!club || !/<title id="pageTitle">/.test(html)) return html;
  const e = escapeHtmlSeo;
  const jugadores = (Array.isArray(datos.jugadores) ? datos.jugadores : []).filter((p) => p && p.slug && p.jugador && !p.sin_nombre);
  const compNombre = COMPETICIONES_STATS_BOT[competicion] || "";
  // Sin jugadores con nombre no hay nada que indexar: se sirve la plantilla con noindex.
  if (!jugadores.length) {
    return html.replace('<title id="pageTitle">', '<meta name="robots" content="noindex, follow">\n<title id="pageTitle">');
  }
  const tot = datos.totales || { goles: 0, asistencias: 0 };
  const titulo = `${club} — plantilla y estadísticas — ${SEO_NOMBRE_SITIO}`;
  const descripcion = resumirTextoSeo(
    `Plantilla de ${club}${compNombre ? " en " + compNombre : ""}: ${pluralStatsBot(jugadores.length, "jugador", "jugadores")}, ${pluralStatsBot(tot.goles || 0, "gol", "goles")} y ${pluralStatsBot(tot.asistencias || 0, "asistencia", "asistencias")} registrados con el minuto a minuto.`,
    160);
  const canonica = seoUrlAbsolutaWorker(`/plantilla?c=${encodeURIComponent(competicion)}&club=${encodeURIComponent(club)}`);
  const imagen = seoUrlAbsolutaWorker("img/og-default.png");
  const urlFicha = (p) => seoUrlAbsolutaWorker(`/jugador?c=${encodeURIComponent(competicion)}&j=${encodeURIComponent(p.slug)}`);
  const ld = `<script type="application/ld+json">${ldSeguroBot({
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    "@id": `${canonica}#equipo`,
    "name": club,
    "sport": "Fútbol",
    "url": canonica,
    ...(compNombre ? { "memberOf": { "@type": "SportsOrganization", "name": compNombre } } : {}),
    "athlete": jugadores.slice(0, 60).map((p) => ({ "@type": "Person", "name": p.jugador, "url": urlFicha(p) })),
  })}</script>`;

  let salida = quitarMetaPaginaParaBot(html);
  salida = salida.replace(/<title id="pageTitle">[\s\S]*?<\/title>/, () =>
    bloqueMetaPaginaBot({ titulo, descripcion, canonica, imagen, ancho: 1200, alto: 630, extra: ld }));
  if (historico) salida = salida.replace('content="index, follow, max-image-preview:large, max-snippet:-1"', 'content="noindex, follow"');
  const resumen = `<div id="plantillaCont"><h1>${e(club)}</h1><p>${e(descripcion)}</p>`
    + `<h2>Jugadores</h2><ul>${jugadores.slice(0, 80).map((p) => `<li><a href="${e(urlFicha(p))}">${e(p.jugador)}</a>${p.dorsal !== null && p.dorsal !== undefined ? ` (${e(String(p.dorsal))})` : ""}</li>`).join("")}</ul></div>`;
  return salida.replace('<div id="plantillaCont"></div>', () => resumen);
}

// ============================================================
// SITEMAPS Y RSS EN EL DOMINIO DEL SITIO
//
// robots.txt anuncia /sitemap-noticias.xml, /sitemap-news.xml,
// /sitemap-clubes.xml y /rss.xml en elotrofutbol.media, pero esos
// documentos los genera la API (api.elotrofutbol.media). Solo
// /sitemap-noticias.xml tenía ruta propia en el worker de la API; los
// demás devolvían 404 en el dominio del sitio (Google exige que un
// sitemap viva en el mismo host que robots.txt). Aquí se piden a la API
// y se sirven tal cual, sin redirigir, con caché corta en el borde.
// ============================================================
const FEEDS_API = {
  "/sitemap-noticias.xml": { tipo: "application/xml; charset=UTF-8", ttl: 3600 },
  "/sitemap-news.xml": { tipo: "application/xml; charset=UTF-8", ttl: 600 },
  "/sitemap-clubes.xml": { tipo: "application/xml; charset=UTF-8", ttl: 3600 },
  "/sitemap-jugadores.xml": { tipo: "application/xml; charset=UTF-8", ttl: 3600 },
  "/rss.xml": { tipo: "application/rss+xml; charset=UTF-8", ttl: 900 },
};

// Los sitemaps y el RSS se guardan (memoria del isolate + Cache API) para:
//  - responder al instante mientras la copia es reciente (la API construye
//    estos XML con consultas pesadas a D1);
//  - refrescar en segundo plano una copia algo vieja (stale-while-revalidate);
//  - seguir sirviendo la última copia buena (hasta 7 días) si la API falla o
//    tarda, en vez de un 503. Antes, una caída de la API de unos minutos hacía
//    que Google/Bing recibieran un 503 en los sitemaps y reduce el rastreo.
// Solo se guarda un cuerpo que parezca XML real.
const FEED_SWR_MS = 60 * 60 * 1000; // hasta 1 h se sirve la copia al instante y se refresca detrás
const FEED_STALE_MAX_S = 7 * 24 * 60 * 60;
const FEED_MEM = new Map(); // path -> { cuerpo, t }
const FEED_REFRESCANDO = new Set();

function claveCacheFeed(path) {
  return new Request(`https://cache.elotrofutbol.media/__feed${path}`);
}

async function leerFeedCache(path) {
  const enMemoria = FEED_MEM.get(path);
  if (enMemoria) return enMemoria;
  try {
    const r = await caches.default.match(claveCacheFeed(path));
    if (!r) return null;
    const entrada = { cuerpo: await r.text(), t: Number(r.headers.get("X-Guardado-Ms")) || 0 };
    if (!entrada.cuerpo) return null;
    FEED_MEM.set(path, entrada);
    return entrada;
  } catch {
    return null;
  }
}

function guardarFeedCache(path, cuerpo, ctx) {
  const entrada = { cuerpo, t: Date.now() };
  FEED_MEM.set(path, entrada);
  const tarea = (async () => {
    try {
      await caches.default.put(claveCacheFeed(path), new Response(cuerpo, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": `public, max-age=${FEED_STALE_MAX_S}`, "X-Guardado-Ms": String(entrada.t) },
      }));
    } catch { /* sin caché compartida: queda la de memoria */ }
  })();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(tarea);
}

// Pide el XML a la API. Devuelve el texto o null si falla / no parece XML.
async function pedirFeedAApi(path, cfg, timeoutMs) {
  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const resp = await fetch(`https://api.elotrofutbol.media${path}`, {
      signal: controlador.signal,
      headers: { "Accept": "application/xml, text/xml, */*" },
    });
    if (!resp.ok) return null;
    const cuerpo = await resp.text();
    return (cuerpo && cuerpo.trimStart().startsWith("<")) ? cuerpo : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function respuestaFeed(cfg, cuerpo, estado) {
  return new Response(cuerpo, {
    status: 200,
    headers: {
      "Content-Type": cfg.tipo,
      "Cache-Control": `public, max-age=${cfg.ttl}`,
      "X-Content-Type-Options": "nosniff",
      "X-Feed-Cache": estado,
    },
  });
}

async function servirFeedDesdeApi(path, ctx) {
  const cfg = FEEDS_API[path];
  const copia = await leerFeedCache(path);
  const edad = copia ? Date.now() - copia.t : Infinity;
  const frescoMs = Math.min(cfg.ttl, 600) * 1000;
  if (copia && edad < frescoMs) return respuestaFeed(cfg, copia.cuerpo, "HIT");
  if (copia && edad < FEED_SWR_MS) {
    if (!FEED_REFRESCANDO.has(path) && ctx && typeof ctx.waitUntil === "function") {
      FEED_REFRESCANDO.add(path);
      ctx.waitUntil(
        pedirFeedAApi(path, cfg, 8000)
          .then((c) => { if (c) guardarFeedCache(path, c, ctx); })
          .catch(() => {})
          .finally(() => FEED_REFRESCANDO.delete(path))
      );
    }
    return respuestaFeed(cfg, copia.cuerpo, "SWR");
  }
  const cuerpo = await pedirFeedAApi(path, cfg, copia ? 4000 : 8000);
  if (cuerpo) {
    guardarFeedCache(path, cuerpo, ctx);
    return respuestaFeed(cfg, cuerpo, "MISS");
  }
  // API caída o lenta: la última copia buena (aunque sea vieja) antes que un 503.
  if (copia) return respuestaFeed(cfg, copia.cuerpo, "STALE");
  // Sin copia: 503 + Retry-After (los buscadores reintentan; un sitemap vacío
  // con 200 podría hacerles creer que se han borrado todas las URLs).
  return new Response("Servicio temporalmente no disponible", {
    status: 503,
    headers: { "Retry-After": "300", "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// ---------- /formulario?f=<slug>: previsualización al compartir el enlace ----------
// formulario.html es una sola página para TODOS los formularios y no llevaba ninguna etiqueta Open
// Graph/Twitter, así que WhatsApp, Telegram, X, Facebook... mostraban el enlace pelado, sin foto.
// Esos rastreadores no ejecutan JavaScript: las etiquetas tienen que venir ya en el HTML. Aquí se
// inyectan (título, descripción y foto) según el ?f= de la URL. El formulario de incorporación tiene
// su propia foto y textos fijos (así sale bien aunque la API tarde o el formulario esté pausado); el
// resto de formularios usan su título/descripción reales de la API pública (con PIN no hay
// descripción: la API ya la oculta) y la foto por defecto. Si algo falla, se sirve la página tal cual.
const FORMULARIO_PREVIEW_FIJO = {
  "formulario-de-incorporacion-elotrofutbol": {
    titulo: "Formulario de incorporación | ElOtroFútbol",
    descripcion: "Cuéntanos tu perfil y tu experiencia para unirte como redactor o fotógrafo a ElOtroFútbol.",
    imagen: "/img/og-incorporacion.jpg?v=1",
    imagenAlt: "ElOtroFútbol: formulario de incorporación",
    imagenTipo: "image/jpeg", ancho: 1200, alto: 630,
  },
};

async function obtenerFormularioPublicoParaPreview(slug) {
  for (const base of ["https://api.elotrofutbol.media"]) {
    const controlador = new AbortController();
    const timeoutId = setTimeout(() => controlador.abort(), 2500);
    try {
      const resp = await fetch(`${base}/api/formularios-publicos/${encodeURIComponent(slug)}`, {
        signal: controlador.signal,
        headers: { "Accept": "application/json" },
      });
      if (resp.status === 404) return null; // no existe o está pausado
      if (!resp.ok) continue;               // principal con problemas: se sirve la página tal cual
      const datos = await resp.json().catch(() => null);
      if (datos && typeof datos.titulo === "string") return datos;
    } catch (e) {
      /* timeout o red: siguiente */
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return null;
}

function bloqueMetaFormulario({ titulo, descripcion, imagen, imagenAlt, imagenTipo, ancho, alto, urlCanonica }) {
  const e = escapeHtmlSeo;
  return [
    `<title>${e(titulo)}</title>`,
    `<meta name="description" content="${e(descripcion)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="ElOtroFútbol">`,
    `<meta property="og:locale" content="es_ES">`,
    `<meta property="og:title" content="${e(titulo)}">`,
    `<meta property="og:description" content="${e(descripcion)}">`,
    `<meta property="og:url" content="${e(urlCanonica)}">`,
    `<meta property="og:image" content="${e(imagen)}">`,
    imagenTipo ? `<meta property="og:image:type" content="${e(imagenTipo)}">` : "",
    ancho ? `<meta property="og:image:width" content="${ancho}">` : "",
    alto ? `<meta property="og:image:height" content="${alto}">` : "",
    `<meta property="og:image:alt" content="${e(imagenAlt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${e(titulo)}">`,
    `<meta name="twitter:description" content="${e(descripcion)}">`,
    `<meta name="twitter:image" content="${e(imagen)}">`,
    `<meta name="twitter:image:alt" content="${e(imagenAlt)}">`,
  ].filter(Boolean).join("\n");
}

async function servirFormularioConPreview(request, env, url) {
  const respuesta = await env.ASSETS.fetch(request);
  const slug = (url.searchParams.get("f") || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return respuesta;
  if (respuesta.status !== 200 || !(respuesta.headers.get("Content-Type") || "").includes("text/html")) return respuesta;
  try {
    const origen = "https://elotrofutbol.media";
    const fijo = FORMULARIO_PREVIEW_FIJO[slug];
    let datos = fijo || null;
    if (!datos) {
      const api = await obtenerFormularioPublicoParaPreview(slug);
      if (!api) return respuesta;
      datos = {
        titulo: api.titulo,
        descripcion: api.descripcion || "Formulario de ElOtroFútbol.",
        imagen: "/img/og-default.png",
        imagenAlt: api.titulo,
      };
    }
    const bloque = bloqueMetaFormulario({
      ...datos,
      imagen: datos.imagen.startsWith("http") ? datos.imagen : origen + datos.imagen,
      urlCanonica: `${origen}/formulario?f=${encodeURIComponent(slug)}`,
    });
    let html = await respuesta.text();
    // Se sustituyen el <title> y la meta description genéricos y se añade el resto justo antes de </head>.
    html = html
      .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
      .replace(/<meta\s+name="description"[^>]*>\s*/i, "");
    const finHead = html.search(/<\/head>/i);
    if (finHead === -1) return respuesta;
    html = html.slice(0, finHead) + bloque + "\n" + html.slice(finHead);
    const cabeceras = new Headers(respuesta.headers);
    cabeceras.delete("Content-Length");
    cabeceras.delete("ETag");
    return new Response(html, { status: 200, headers: cabeceras });
  } catch (e) {
    return respuesta; // ante cualquier fallo, la página de siempre
  }
}

const manejadorPrincipal = {
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

    // --- Sitemaps y RSS: se piden a la API y se sirven en este dominio ---
    if (request.method === "GET" && FEEDS_API[path]) {
      return servirFeedDesdeApi(path, ctx);
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
      // Consolida en una sola URL las variantes con "_" o mayúsculas
      // (/futbol/segunda_federacion/x -> /futbol/segunda-federacion/x):
      // con el canonical antiguo Google pudo indexar la versión con "_".
      // 301 permanente; la forma normalizada es estable, así que no puede
      // formar bucle con esta misma regla.
      let categoriaSegmento = matchBonita[1];
      try { categoriaSegmento = decodeURIComponent(categoriaSegmento); } catch { /* se deja tal cual */ }
      const categoriaNormalizada = categoriaUrlSlugWorker(categoriaSegmento);
      if (categoriaNormalizada !== categoriaSegmento) {
        const destino = new URL(url);
        destino.pathname = `/futbol/${encodeURIComponent(categoriaNormalizada)}/${matchBonita[2]}`;
        return Response.redirect(destino.toString(), 301);
      }
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
      return servirNoticiaConSeo(noticiaRequest, env, slug, noticiaUrl.searchParams.get("lang"), esBot, ctx);
    }

    // --- URL bonita: /galeria/{slug} -> sirve galeria.html ---
    // Mismo patrón que /futbol/{categoria}/{slug} de arriba: se reescribe
    // internamente hacia "/galeria" (sin extensión, mismo motivo de la
    // ruta canónica de Pages explicado arriba) con el slug como query
    // param, sin redirigir el navegador. galeria.html lee el slug de la
    // URL real que le llega (searchParams o, si faltara, del propio
    // pathname) así que no hace falta tocarlo aquí. A diferencia de la
    // noticia, esta ruta no lleva SEO renderizado en servidor (Fase 2 no
    // lo pedía): el título/descripción se fijan por JS con fijarSeoBasico
    // una vez cargados los datos del partido, igual que en resultados.html.
    const matchGaleria = path.match(/^\/galeria\/([^/]+)\/?$/);
    if (matchGaleria && request.method === "GET") {
      let slug = matchGaleria[1];
      try { slug = decodeURIComponent(slug); } catch { /* se deja tal cual */ }
      const galeriaUrl = new URL("/galeria", url);
      galeriaUrl.searchParams.set("slug", slug);
      const galeriaRequest = new Request(galeriaUrl.toString(), request);
      const respuestaGaleria = await env.ASSETS.fetch(galeriaRequest);
      // Bots conocidos: <head> y metadatos reales de la galería (y 404 real si
      // no existe, en vez de un 200 vacío).
      if (esUserAgentBot(request.headers.get("User-Agent")) && slug.length <= 160
          && respuestaGaleria.status === 200 && (respuestaGaleria.headers.get("Content-Type") || "").includes("text/html")) {
        const datosGaleria = await obtenerJsonApiParaBot(`/api/results/galeria/${encodeURIComponent(slug)}`);
        if (datosGaleria && datosGaleria.noExiste) return servir404Real(env, url.toString());
        if (datosGaleria && datosGaleria.partido) {
          const htmlGaleria = inyectarGaleriaParaBot(await respuestaGaleria.text(), slug, datosGaleria.partido, datosGaleria.grupos);
          const headersGaleria = new Headers(respuestaGaleria.headers);
          headersGaleria.delete("Content-Length");
          headersGaleria.set("Vary", "User-Agent");
          return new Response(htmlGaleria, { status: 200, headers: headersGaleria });
        }
      }
      return respuestaGaleria;
    }

    // --- /autor?id=...: perfil del autor con metadatos y noticias para bots.
    if (path === "/autor" && request.method === "GET" && esUserAgentBot(request.headers.get("User-Agent"))) {
      const idAutor = (url.searchParams.get("id") || "").trim();
      if (/^[A-Za-z0-9_-]{1,64}$/.test(idAutor)) {
        const respuestaAutor = await env.ASSETS.fetch(request);
        if (respuestaAutor.status === 200 && (respuestaAutor.headers.get("Content-Type") || "").includes("text/html")) {
          const datosAutor = await obtenerJsonApiParaBot(`/api/autores/${encodeURIComponent(idAutor)}`);
          if (datosAutor && datosAutor.noExiste) return servir404Real(env, url.toString());
          if (datosAutor && datosAutor.autor) {
            const htmlAutor = inyectarAutorParaBot(await respuestaAutor.text(), idAutor, datosAutor.autor, datosAutor.articulos);
            const headersAutor = new Headers(respuestaAutor.headers);
            headersAutor.delete("Content-Length");
            headersAutor.set("Vary", "User-Agent");
            return new Response(htmlAutor, { status: 200, headers: headersAutor });
          }
        }
        return respuestaAutor;
      }
    }

    // --- /minuto-a-minuto?id=N: para bots y redes sociales, metadatos reales del
    // partido (ver "MINUTO A MINUTO: METADATOS REALES PARA BOTS"). El resto
    // de peticiones pasan igual que antes.
    if ((path === "/minuto-a-minuto" || path === "/minuto-a-minuto.html") && request.method === "GET"
        && esUserAgentBot(request.headers.get("User-Agent"))) {
      const idMam = (url.searchParams.get("id") || "").trim();
      if (/^\d{1,9}$/.test(idMam)) {
        const respuestaMam = await env.ASSETS.fetch(request);
        if (respuestaMam.status === 200 && (respuestaMam.headers.get("Content-Type") || "").includes("text/html")) {
          const datosMam = await obtenerJsonApiParaBot(`/api/results/${idMam}?ligero=1`);
          if (datosMam && datosMam.noExiste) return servir404Real(env, url.toString());
          if (datosMam && datosMam.resultado) {
            const htmlMam = inyectarMinutoAMinutoParaBot(await respuestaMam.text(), idMam, datosMam.resultado);
            const headersMam = new Headers(respuestaMam.headers);
            headersMam.delete("Content-Length");
            headersMam.set("Vary", "User-Agent");
            return new Response(htmlMam, { status: 200, headers: headersMam });
          }
        }
        return respuestaMam;
      }
    }

    // --- /jugador?c=...&j=... y /plantilla?c=...&club=...: para bots, metadatos reales,
    // JSON-LD y enlaces a las fichas (ver "FICHAS DE JUGADOR Y PLANTILLAS: METADATOS REALES
    // PARA BOTS"). Un jugador que la API da por inexistente (oculto por un admin o de una
    // temporada pasada) devuelve el 404 real. El resto de peticiones pasan igual que antes.
    if ((path === "/jugador" || path === "/jugador.html") && request.method === "GET"
        && esUserAgentBot(request.headers.get("User-Agent"))) {
      const compJug = (url.searchParams.get("c") || "").trim();
      const slugJug = (url.searchParams.get("j") || "").trim();
      if (COMPETICIONES_STATS_BOT[compJug] && /^[a-z0-9~-]{1,160}$/.test(slugJug)) {
        const historicoJug = url.searchParams.get("temp") === "todas";
        const respuestaJug = await env.ASSETS.fetch(request);
        if (respuestaJug.status === 200 && (respuestaJug.headers.get("Content-Type") || "").includes("text/html")) {
          const datosJug = await obtenerJsonApiParaBot(`/api/stats/jugador?competicion=${encodeURIComponent(compJug)}&j=${encodeURIComponent(slugJug)}${historicoJug ? "&temporada=todas" : ""}`);
          if (datosJug && datosJug.noExiste) return servir404Real(env, url.toString());
          if (datosJug && datosJug.jugador) {
            const htmlJug = inyectarFichaJugadorParaBot(await respuestaJug.text(), compJug, datosJug, historicoJug);
            const headersJug = new Headers(respuestaJug.headers);
            headersJug.delete("Content-Length");
            headersJug.set("Vary", "User-Agent");
            return new Response(htmlJug, { status: 200, headers: headersJug });
          }
        }
        return respuestaJug;
      }
    }
    if ((path === "/plantilla" || path === "/plantilla.html") && request.method === "GET"
        && esUserAgentBot(request.headers.get("User-Agent"))) {
      const compPl = (url.searchParams.get("c") || "").trim();
      const clubPl = (url.searchParams.get("club") || "").trim().slice(0, 120);
      if (COMPETICIONES_STATS_BOT[compPl] && clubPl) {
        const historicoPl = url.searchParams.get("temp") === "todas";
        const respuestaPl = await env.ASSETS.fetch(request);
        if (respuestaPl.status === 200 && (respuestaPl.headers.get("Content-Type") || "").includes("text/html")) {
          const datosPl = await obtenerJsonApiParaBot(`/api/stats/club?competicion=${encodeURIComponent(compPl)}&club=${encodeURIComponent(clubPl)}${historicoPl ? "&temporada=todas" : ""}`);
          if (datosPl && datosPl.club) {
            const htmlPl = inyectarPlantillaParaBot(await respuestaPl.text(), compPl, datosPl, historicoPl);
            const headersPl = new Headers(respuestaPl.headers);
            headersPl.delete("Content-Length");
            headersPl.set("Vary", "User-Agent");
            return new Response(htmlPl, { status: 200, headers: headersPl });
          }
        }
        return respuestaPl;
      }
    }

    // --- Formato antiguo /noticia.html?slug=... o /noticia?slug=...,
    // servido tal cual (SIN redirigir a la URL bonita): igual que en el
    // caso anterior, se le inyecta el SEO en servidor antes de servirlo.
    if ((path === "/noticia" || path === "/noticia.html") && request.method === "GET") {
      // La previsualización del editor no tiene slug porque el artículo
      // todavía no está publicado. Debe servirse la plantilla noticia.html
      // para que ella lea el contenido temporal de sessionStorage/localStorage.
      // Antes este caso caía en el 404 real de abajo.
      if (url.searchParams.get("preview") === "1") {
        return env.ASSETS.fetch(request);
      }
      const slug = url.searchParams.get("slug");
      if (slug) {
        const esBot = esUserAgentBot(request.headers.get("User-Agent"));
        return servirNoticiaConSeo(request, env, slug, url.searchParams.get("lang"), esBot, ctx);
      }
      // /noticia sin ?slug= no es una página: 404 real en vez de un 200 vacío (soft 404).
      return servir404Real(env, url.toString());
    }

    // --- /formulario?f=<slug>: igual que antes, pero con etiquetas Open Graph/Twitter para que el
    // enlace salga con foto y texto al compartirlo (ver "previsualización al compartir el enlace").
    if (path === "/formulario" && request.method === "GET" && url.searchParams.get("f")) {
      return servirFormularioConPreview(request, env, url);
    }

    // --- /categoria?cat=...[&club=...]: para bots conocidos se sirve con
    // título, canonical y enlaces a las noticias ya pintados (ver
    // "CATEGORÍAS Y FICHAS DE CLUB PREPINTADAS PARA BOTS"). El resto de
    // peticiones (lectores, o sin parámetro "cat") pasan igual que antes.
    if (path === "/categoria" && request.method === "GET" && esUserAgentBot(request.headers.get("User-Agent"))) {
      const cat = (url.searchParams.get("cat") || "").trim();
      const clubParam = (url.searchParams.get("club") || "").trim();
      if (/^[a-z0-9_-]{1,40}$/i.test(cat) && clubParam.length <= 80) {
        const respuestaCat = await env.ASSETS.fetch(request);
        if (respuestaCat.status === 200 && (respuestaCat.headers.get("Content-Type") || "").includes("text/html")) {
          const articulosCat = await obtenerNoticiasCategoriaParaBot(cat.toLowerCase(), clubParam);
          if (articulosCat.length) {
            const htmlCat = inyectarCategoriaParaBot(await respuestaCat.text(), cat.toLowerCase(), clubParam, articulosCat);
            const headersCat = new Headers(respuestaCat.headers);
            headersCat.delete("Content-Length");
            headersCat.set("Vary", "User-Agent");
            return new Response(htmlCat, { status: 200, headers: headersCat });
          }
        }
        return respuestaCat;
      }
    }

    // --- "/" (portada): igual tratamiento que /widgets.html
    // y /admin/panel.html de aquí abajo, y por el mismo motivo -- Cloudflare
    // Pages ignora _headers en cualquier ruta que pase por este Worker, así
    // que la CSP global de _headers (frame-ancestors 'none') es la que
    // siempre llegaba al navegador para la portada, JAMÁS la excepción.
    // widgets.html embebe la portada en vivo dentro de un <iframe> como
    // vista previa de los widgets (ver más abajo, frame-src ya incluye
    // "elotrofutbol.media"), pero frame-src solo gobierna lo que la página
    // que EMBEBE tiene permitido cargar en su iframe -- quien decide si esa
    // página puede SER embebida es su propia cabecera frame-ancestors. Con
    // "none" en la portada, el navegador bloqueaba el framing igualmente
    // (ERR_BLOCKED_BY_RESPONSE / "violates ... frame-ancestors 'none'"), sin
    // importar lo permisivo que fuera widgets.html. Aquí se relaja SOLO
    // para la portada, a 'self' (se deja embeber por el propio dominio,
    // nunca por terceros), igual que ya se hace con /admin/panel.html.
    if ((path === "/" || path === "/index.html") && request.method === "GET") {
      const respuesta = await env.ASSETS.fetch(request);
      const nuevas = new Headers(respuesta.headers);
      nuevas.delete("Content-Security-Policy");
      nuevas.delete("X-Frame-Options");
      nuevas.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://accounts.google.com https://alcdn.msauth.net https://platform.twitter.com https://*.googlesyndication.com https://*.doubleclick.net https://www.googletagservices.com https://*.googleadservices.com https://*.adtrafficquality.google https://fundingchoicesmessages.google.com https://contextual.media.net https://*.media.net https://www.ezojs.com https://*.ezoic.net https://*.ezodn.com https://*.gatekeeperconsent.com https://cdn.taboola.com https://*.taboola.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' https://res.cloudinary.com; connect-src 'self' https://api.elotrofutbol.media https://elotro-futbol-api-production.up.railway.app https://accounts.google.com https://login.microsoftonline.com https://es.wikipedia.org https://*.googlesyndication.com https://*.doubleclick.net https://*.adtrafficquality.google https://fundingchoicesmessages.google.com https://*.media.net https://*.ezoic.net https://*.ezoic.com https://*.ezodn.com https://*.gatekeeperconsent.com https://*.taboola.com https://*.taboolasyndication.com; frame-src https://challenges.cloudflare.com https://accounts.google.com https://platform.twitter.com https://syndication.twitter.com https://*.googlesyndication.com https://*.doubleclick.net https://www.google.com https://*.adtrafficquality.google https://*.media.net https://*.ezoic.net https://*.ezodn.com https://*.taboola.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests"
      );
      nuevas.set("X-Frame-Options", "SAMEORIGIN");
      // Solo para bots conocidos: se pintan en el HTML los enlaces a las
      // últimas noticias (ver "PORTADA PREPINTADA PARA BOTS").
      let cuerpoPortada = respuesta.body;
      if (esUserAgentBot(request.headers.get("User-Agent")) && (respuesta.headers.get("Content-Type") || "").includes("text/html")) {
        const articulos = await obtenerUltimasNoticiasParaBot();
        if (articulos.length) {
          cuerpoPortada = inyectarPortadaParaBot(await respuesta.text(), articulos);
          nuevas.delete("Content-Length");
        }
      }
      nuevas.set("Vary", "User-Agent");
      return new Response(cuerpoPortada, { status: respuesta.status, headers: nuevas });
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
    //
    // OJO 2: widgets.html ya no auto-embebe el sitio: la vista previa
    // carga /widgets/* desde el worker de la API (ORIGEN_WIDGETS =
    // "https://api.elotrofutbol.media" en widgets.html), que SÍ sirve
    // HTML embebible. Por eso frame-src tiene que incluir
    // "api.elotrofutbol.media"; sin él el navegador bloquea las cuatro
    // vistas previas con ERR_BLOCKED_BY_CSP. "elotrofutbol.media" se
    // mantiene por compatibilidad con la vista previa anterior.
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
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://accounts.google.com https://alcdn.msauth.net https://platform.twitter.com https://*.googlesyndication.com https://*.doubleclick.net https://www.googletagservices.com https://*.googleadservices.com https://*.adtrafficquality.google https://fundingchoicesmessages.google.com https://contextual.media.net https://*.media.net https://www.ezojs.com https://*.ezoic.net https://*.ezodn.com https://*.gatekeeperconsent.com https://cdn.taboola.com https://*.taboola.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' https://res.cloudinary.com; connect-src 'self' https://api.elotrofutbol.media https://elotro-futbol-api-production.up.railway.app https://accounts.google.com https://login.microsoftonline.com https://*.googlesyndication.com https://*.doubleclick.net https://*.adtrafficquality.google https://fundingchoicesmessages.google.com https://*.media.net https://*.ezoic.net https://*.ezoic.com https://*.ezodn.com https://*.gatekeeperconsent.com https://*.taboola.com https://*.taboolasyndication.com; frame-src https://challenges.cloudflare.com https://accounts.google.com https://elotrofutbol.media https://api.elotrofutbol.media https://platform.twitter.com https://syndication.twitter.com https://*.googlesyndication.com https://*.doubleclick.net https://www.google.com https://*.adtrafficquality.google https://*.media.net https://*.ezoic.net https://*.ezodn.com https://*.taboola.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
      );
      return new Response(respuesta.body, { status: respuesta.status, headers: nuevas });
    }

    // --- /admin/panel.html: su CSP/X-Frame-Options se fijan aquí a mano
    // porque Cloudflare Pages ignora _headers en rutas que pasan por este
    // Worker (ver /widgets.html más arriba).
    if ((path === "/admin/panel.html" || path === "/admin/panel") && request.method === "GET") {
      const respuesta = await env.ASSETS.fetch(request);
      const nuevas = new Headers(respuesta.headers);
      nuevas.delete("Content-Security-Policy");
      nuevas.delete("X-Frame-Options");
      nuevas.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://accounts.google.com https://alcdn.msauth.net https://platform.twitter.com https://*.googlesyndication.com https://*.doubleclick.net https://www.googletagservices.com https://*.googleadservices.com https://*.adtrafficquality.google https://fundingchoicesmessages.google.com https://contextual.media.net https://*.media.net https://www.ezojs.com https://*.ezoic.net https://*.ezodn.com https://*.gatekeeperconsent.com https://cdn.taboola.com https://*.taboola.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' https://res.cloudinary.com; connect-src 'self' https://api.elotrofutbol.media https://elotro-futbol-api-production.up.railway.app https://accounts.google.com https://login.microsoftonline.com https://*.googlesyndication.com https://*.doubleclick.net https://*.adtrafficquality.google https://fundingchoicesmessages.google.com https://*.media.net https://*.ezoic.net https://*.ezoic.com https://*.ezodn.com https://*.gatekeeperconsent.com https://*.taboola.com https://*.taboolasyndication.com; frame-src https://challenges.cloudflare.com https://accounts.google.com https://platform.twitter.com https://syndication.twitter.com https://*.googlesyndication.com https://*.doubleclick.net https://www.google.com https://*.adtrafficquality.google https://*.media.net https://*.ezoic.net https://*.ezodn.com https://*.taboola.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests"
      );
      nuevas.set("X-Frame-Options", "SAMEORIGIN");
      return new Response(respuesta.body, { status: respuesta.status, headers: nuevas });
    }

    // --- Todo lo demás: comportamiento normal de Pages (archivos
    // estáticos). Si alguien llega con la extensión ".html" explícita en
    // la URL, Cloudflare Pages hará su propio 307 (de una sola vez, no en
    // bucle) hacia la versión sin extensión, que es normal y esperado
    // bajo "auto-trailing-slash": no es cosa nuestra ni hay que evitarlo
    // aquí. ---
    // IMPORTANTE: env.ASSETS.fetch() puede LANZAR (rechazar la promesa)
    // o devolver un 404 con body VACÍO (0 bytes) en vez de servir
    // realmente 404.html -- ambos comportamientos han sido observados
    // en producción con run_worker_first + not_found_handling:
    // "404-page" llamado desde dentro del propio Worker. Un 404 con
    // body vacío es indistinguible para el navegador de "no hay
    // contenido", y ahí es donde Chrome/el navegador mete su PROPIA
    // pantalla de error genérica en vez de la nuestra -- eso era
    // exactamente lo que se estaba viendo. Por eso ya no se confía en
    // que este fetch, si da 404, traiga ya el body bueno: se comprueba
    // explícitamente y, si no, se fuerza servir404Real() (que sí lee el
    // body y tiene su propio fallback de emergencia).
    let respuestaFinal;
    try {
      respuestaFinal = await env.ASSETS.fetch(request);
    } catch {
      respuestaFinal = new Response(null, { status: 404 });
    }

    if (respuestaFinal.status === 404) {
      return servir404Real(env, url.toString());
    }

    // Caché de estáticos públicos (Cloudflare ignora _headers en rutas que
    // pasan por este worker, así que se fija aquí). Solo GET 200:
    //  - /css y /js CON "?v=N": la URL cambia en cada versión -> 7 días.
    //    IMPORTANTE: si se edita un JS/CSS hay que subir su ?v=, como ya
    //    se hace; sin cambio de ?v= el navegador no lo vuelve a pedir.
    //  - /img: 1 día + stale-while-revalidate 7 días.
    //  - /admin, sw.js, manifest, HTML y el resto: sin tocar.
    if (request.method === "GET" && respuestaFinal.status === 200 && !path.startsWith("/admin/")) {
      let cacheControl = null;
      if (/^\/(css|js)\//.test(path) && url.searchParams.has("v")) {
        cacheControl = "public, max-age=604800, immutable";
      } else if (/^\/img\//.test(path)) {
        cacheControl = "public, max-age=86400, stale-while-revalidate=604800";
      }
      if (cacheControl) {
        const conCache = new Headers(respuestaFinal.headers);
        conCache.set("Cache-Control", cacheControl);
        return new Response(respuestaFinal.body, { status: respuestaFinal.status, headers: conCache });
      }
    }

    return respuestaFinal;
  },
};

// ============================================================
// X-Robots-Tag EN RUTAS NO INDEXABLES
//
// Las páginas privadas/utilitarias ya llevan <meta robots noindex>, pero esa
// etiqueta solo la ve un bot que descargue y lea el HTML. La cabecera
// X-Robots-Tag vale para cualquier respuesta (también si cambia la plantilla,
// o se pide una variante con ?preview=) y es la señal más fiable.
// ============================================================
const RUTAS_NOINDEX = [
  /^\/admin(\/|$)/,
  /^\/panel(\/|\.html$|$)/,
  /^\/panel-analiticas(\.html)?$/,
  /^\/acceso(\.html)?$/,
  /^\/cuenta(\.html)?$/,
  /^\/guardadas(\.html)?$/,
  /^\/recuperar-cuenta(\.html)?$/,
  /^\/verificar-cuenta(\.html)?$/,
  /^\/contenido(\.html)?$/,
  /^\/buscar(\.html)?$/,
  /^\/estado(\.html)?$/,
  /^\/mantenimiento(\.html)?$/,
  /^\/newsletter_preview(\.html)?$/,
  /^\/formulario(\.html)?$/,
  /^\/acreditacion(\.html)?$/,
];

function esRutaNoIndexable(url) {
  if (url.searchParams.has("preview")) return true;
  return RUTAS_NOINDEX.some((patron) => patron.test(url.pathname));
}

export default {
  async fetch(request, env, ctx) {
    const respuesta = await manejadorPrincipal.fetch(request, env, ctx);
    try {
      if (respuesta.status === 101 || respuesta.headers.has("X-Robots-Tag")) return respuesta;
      if (!esRutaNoIndexable(new URL(request.url))) return respuesta;
      // Response.redirect() y otras respuestas tienen cabeceras inmutables.
      const conCabecera = new Response(respuesta.body, respuesta);
      conCabecera.headers.set("X-Robots-Tag", "noindex, nofollow");
      return conCabecera;
    } catch {
      return respuesta;
    }
  },
};
