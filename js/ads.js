// ============================================================================
// ELOTROFÚTBOLTV — Sistema de espacios publicitarios
// ============================================================================
// Un único motor de anuncios para todo el sitio, pensado para poder activar
// progresivamente: hoy mismo puede funcionar solo con AdSense (auto ads o
// anuncios manuales), y el día que se dé de alta una cuenta de Google Ad
// Manager (GAM) con header bidding (Prebid.js), basta con rellenar
// EOF_ADS_CONFIG más abajo -- no hay que tocar ninguna página, porque todas
// llaman a las mismas funciones de este archivo (adSlot()/insertarAdsEnGrid()).
//
// Modos soportados (se elige automáticamente según la configuración):
//   1) "gam"     -> Google Publisher Tag (GPT) + Prebid.js (header bidding).
//                   Es el modo recomendado para un medio con volumen: permite
//                   pujar varias redes (AdSense/AdX vía GAM y SSPs de terceros)
//                   por cada hueco antes de pedir el anuncio a GAM.
//   2) "adsense" -> Google AdSense "clásico" (anuncios manuales por unidad),
//                   sin pasar por GAM. Más simple de dar de alta, sirve como
//                   modo intermedio o de respaldo mientras se aprueba GAM.
//   3) "none"    -> sin proveedor configurado: se pintan los huecos vacíos
//                   con su alto reservado (útil en local/desarrollo, evita
//                   saltos de maquetación -- "layout shift" -- cuando se
//                   activen los anuncios de verdad).
//
// ---------- CÓMO ACTIVAR LA PUBLICIDAD DE VERDAD ----------
// 1. Rellenar los datos en EOF_ADS_CONFIG (más abajo en este mismo archivo,
//    o sobrescribiendo window.EOF_ADS_CONFIG desde un <script> ANTES de
//    cargar este archivo, igual que ya se hace con EOF_SECONDARY_API_URL en
//    config.js).
// 2. Elegir "proveedor": "gam", "adsense" o "none".
// 3. Si es "gam": rellenar networkCode y, para cada adUnit de "slots", su
//    ruta completa de GAM (p.ej. "/1234567/eof_home_leaderboard"). Si además
//    se quiere header bidding, activar prebid.activo y añadir los bidders en
//    prebid.bidders (cada uno con su placementId/zoneId real, que da el SSP
//    al darte de alta).
// 4. Si es "adsense": rellenar clienteAdsense ("ca-pub-XXXXXXXXXXXXXXXX") y,
//    para cada slot, su slotId de AdSense (el "data-ad-slot" que da AdSense
//    al crear la unidad de anuncio).
// ============================================================================

const EOF_ADS_CONFIG = window.EOF_ADS_CONFIG || {
  // "gam" | "adsense" | "none"
  proveedor: "none",

  // ---------- Google Ad Manager (GPT) ----------
  gam: {
    // Código de red de GAM, ej: "23456789"
    networkCode: "",
    // Habilita el "single request" de GPT (todos los slots de la página se
    // piden en una sola petición a GAM, más eficiente que uno a uno).
    singleRequest: true,
    // Refresco automático de slots que llevan tiempo visibles sin
    // interacción (0 = desactivado). En segundos.
    refreshSegundos: 0,
  },

  // ---------- Header bidding (Prebid.js) ----------
  // Solo se usa si proveedor === "gam". Prebid puja con varios SSPs antes
  // de pedir el anuncio a GAM, y el resultado se envía a GPT como
  // "targeting" (hb_pb, hb_bidder...) para que GAM pueda competir esa puja
  // frente a sus propias campañas/AdX.
  prebid: {
    activo: false,
    timeoutMs: 1200,
    // Cada bidder real se añade aquí con sus IDs (los da cada SSP al darte
    // de alta). Ejemplo ya preparado para un par de proveedores habituales;
    // se pueden borrar/añadir los que se contraten.
    bidders: [
      // { nombre: "appnexus", params: { placementId: "0" } },
      // { nombre: "rubicon", params: { accountId: "0", siteId: "0", zoneId: "0" } },
    ],
  },

  // ---------- Google AdSense (modo simple, sin GAM) ----------
  adsense: {
    // "ca-pub-XXXXXXXXXXXXXXXX"
    clienteAdsense: "",
    // Si se activan los "Auto ads" de AdSense (el propio Google decide
    // dónde insertar anuncios en la página), no hace falta rellenar los
    // slotId de cada hueco individual: basta con este script suelto y
    // AdSense coloca sus propios anuncios. Si se prefiere control manual
    // (los huecos concretos definidos más abajo en EOF_AD_SLOTS), se deja
    // en false y se rellena cada slotId.
    autoAds: false,
  },

  // GDPR/CCPA: gestionado por el CMP propio del sitio (ver js/cookies.js),
  // que fija window.EOF_CONSENTIMIENTO_PUBLICIDAD y llama a initAds() en
  // cuanto el usuario acepta la categoría "publicidad". Con esto en true,
  // este archivo espera antes de cargar cualquier script de publicidad a
  // que exista window.EOF_CONSENTIMIENTO_PUBLICIDAD === true.
  esperarConsentimiento: true,
};

// ---------- Definición de los huecos publicitarios del sitio ----------
// Cada slot define su tamaño "responsive" mediante varios formatos
// admitidos por tamaño de pantalla (GPT los llama "size mapping"; en modo
// AdSense simple se usa igualmente para reservar el alto y elegir el
// formato más adecuado). Los nombres (key) son los que se usan al llamar
// a adSlot("key") desde las páginas.
const EOF_AD_SLOTS = {
  // Cabecera de portada/categoría: banner grande en escritorio, banner
  // mediano en tablet, banner pequeño en móvil.
  cabecera: {
    gamAdUnit: "/0000000/eof_cabecera",
    adsenseSlotId: "",
    formatos: [
      { minAncho: 1024, tamanos: [[970, 250], [728, 90]] },
      { minAncho: 700, tamanos: [[728, 90]] },
      { minAncho: 0, tamanos: [[320, 100], [300, 100]] },
    ],
  },
  // Intercalado en medio de los listados de noticias (portada, categoría):
  // formato cuadrado/rectángulo, se repite cada N tarjetas.
  entre_noticias: {
    gamAdUnit: "/0000000/eof_entre_noticias",
    adsenseSlotId: "",
    formatos: [
      { minAncho: 1024, tamanos: [[336, 280], [300, 250]] },
      { minAncho: 0, tamanos: [[300, 250]] },
    ],
  },
  // Barra lateral (si el layout la usa) o, en su ausencia, bloque tras el
  // hero de portada.
  lateral: {
    gamAdUnit: "/0000000/eof_lateral",
    adsenseSlotId: "",
    formatos: [
      { minAncho: 1024, tamanos: [[300, 600], [300, 250]] },
      { minAncho: 0, tamanos: [[300, 250]] },
    ],
  },
  // Dentro del cuerpo de una noticia, tras el primer bloque de texto.
  noticia_intext: {
    gamAdUnit: "/0000000/eof_noticia_intext",
    adsenseSlotId: "",
    formatos: [
      { minAncho: 700, tamanos: [[728, 90], [300, 250]] },
      { minAncho: 0, tamanos: [[300, 250]] },
    ],
  },
  // Al final de la noticia, antes de "Noticias similares".
  noticia_final: {
    gamAdUnit: "/0000000/eof_noticia_final",
    adsenseSlotId: "",
    formatos: [
      { minAncho: 1024, tamanos: [[970, 250], [728, 90]] },
      { minAncho: 0, tamanos: [[320, 100], [300, 250]] },
    ],
  },
  // Pie de página, antes del footer.
  pie: {
    gamAdUnit: "/0000000/eof_pie",
    adsenseSlotId: "",
    formatos: [
      { minAncho: 1024, tamanos: [[970, 250], [728, 90]] },
      { minAncho: 0, tamanos: [[320, 100]] },
    ],
  },
};

// Cada cuántas tarjetas se intercala un anuncio "entre_noticias" en un
// listado (categoría, búsqueda...). Se deja un espaciado amplio a
// propósito: la idea es un único anuncio discreto en listados normales,
// y como mucho un segundo en listados muy largos, nunca una fila de
// anuncios verticales seguidos rompiendo la lectura.
const EOF_ADS_CADA_N_TARJETAS = 12;

// ============================================================================
// Motor interno: no hace falta tocar nada de aquí abajo para configurar el
// sitio (eso se hace arriba, en EOF_ADS_CONFIG/EOF_AD_SLOTS).
// ============================================================================

let _eofAdsGptListo = false;
let _eofAdsPrebidListo = false;
let _eofAdsContador = 0;
const _eofAdsSlotsDefinidosGPT = new Map(); // key del slot -> googletag slot

function eofAdsProveedorActivo() {
  return EOF_ADS_CONFIG.proveedor || "none";
}

function eofAdsPuedeCargar() {
  // El consentimiento de cookies (categoría "publicidad" del CMP propio,
  // ver js/cookies.js) es la única condición para servir anuncios, salvo
  // que EOF_ADS_CONFIG.esperarConsentimiento esté a false (por ejemplo,
  // en un entorno sin CMP activo todavía).
  if (!EOF_ADS_CONFIG.esperarConsentimiento) return true;
  return window.EOF_CONSENTIMIENTO_PUBLICIDAD === true;
}

// Alto reservado (el mayor de los tamaños del formato aplicable al ancho
// actual de ventana) para que el contenedor nunca haga saltar el resto del
// contenido al cargar el anuncio de verdad (evita Cumulative Layout Shift).
function eofAdsFormatoActual(slotDef) {
  const ancho = window.innerWidth || document.documentElement.clientWidth || 0;
  const formatos = [...slotDef.formatos].sort((a, b) => b.minAncho - a.minAncho);
  return formatos.find((f) => ancho >= f.minAncho) || formatos[formatos.length - 1];
}

function eofAdsAltoReservado(slotDef) {
  const formato = eofAdsFormatoActual(slotDef);
  if (!formato || !formato.tamanos.length) return 0;
  return Math.max(...formato.tamanos.map((t) => t[1]));
}

// Construye el HTML del contenedor de un slot: una caja responsive con
// alto mínimo reservado, una etiqueta "Publicidad" (transparencia hacia el
// lector, y habitual/recomendado por las políticas de los propios
// proveedores) y un div interno donde se inserta el anuncio real.
//
// key: identificador del slot (debe existir en EOF_AD_SLOTS).
// idUnico: opcional, para poder repetir el mismo slot varias veces en la
// misma página (p.ej. "entre_noticias" repetido en un listado largo) sin
// que los ids choquen entre sí.
function adSlotHTML(key, idUnico) {
  const slotDef = EOF_AD_SLOTS[key];
  if (!slotDef) return "";
  const id = `eof-ad-${key}-${idUnico || ++_eofAdsContador}`;
  const alto = eofAdsAltoReservado(slotDef);
  return `
    <div class="eof-ad-wrap eof-ad-${key}" data-ad-key="${key}">
      <span class="eof-ad-etiqueta">Publicidad</span>
      <div id="${id}" class="eof-ad-contenedor" style="min-height:${alto}px;"></div>
    </div>`;
}

// Inserta y "dispara" un slot en un contenedor ya existente en el DOM
// (por ejemplo tras hacer innerHTML con adSlotHTML en algún punto de la
// página). Se puede llamar a mano justo después de insertar el HTML, o
// dejar que initAds() lo haga automáticamente al cargar la página con
// document.querySelectorAll(".eof-ad-contenedor").
function eofAdsSolicitarSlot(divId, key) {
  const slotDef = EOF_AD_SLOTS[key];
  if (!slotDef || !eofAdsPuedeCargar()) return;

  const proveedor = eofAdsProveedorActivo();

  if (proveedor === "gam") {
    eofAdsSolicitarSlotGAM(divId, key, slotDef);
  } else if (proveedor === "adsense") {
    eofAdsSolicitarSlotAdsense(divId, key, slotDef);
  }
  // proveedor === "none": se deja el contenedor vacío (con su alto
  // reservado ya puesto por adSlotHTML), sin pedir nada a ningún proveedor.
}

// ---------- Modo Google Ad Manager (GPT) + Prebid ----------
function eofAdsCargarScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function eofAdsAsegurarGPT() {
  if (_eofAdsGptListo) return;
  window.googletag = window.googletag || { cmd: [] };
  await eofAdsCargarScript("https://securepubads.g.doubleclick.net/tag/js/gpt.js");
  await new Promise((resolve) => {
    googletag.cmd.push(() => {
      googletag.pubads().enableSingleRequest && EOF_ADS_CONFIG.gam.singleRequest && googletag.pubads().enableSingleRequest();
      googletag.pubads().collapseEmptyDivs();
      if (EOF_ADS_CONFIG.gam.refreshSegundos > 0) {
        setInterval(() => {
          const slots = googletag.pubads().getSlots();
          if (slots.length) googletag.pubads().refresh(slots);
        }, EOF_ADS_CONFIG.gam.refreshSegundos * 1000);
      }
      googletag.enableServices();
      resolve();
    });
  });
  _eofAdsGptListo = true;
}

async function eofAdsAsegurarPrebid() {
  if (!EOF_ADS_CONFIG.prebid.activo || _eofAdsPrebidListo) return;
  window.pbjs = window.pbjs || { que: [] };
  // Prebid se autoaloja o se sirve desde un CDN propio del proyecto en un
  // caso real (el build de Prebid depende de qué adaptadores de bidders se
  // incluyan); aquí se deja la carga preparada apuntando a un archivo local
  // que se generaría con el "Prebid.js download builder" oficial y se
  // colocaría en public/js/prebid.js.
  await eofAdsCargarScript("js/prebid.js").catch(() => {
    console.warn("[ads] Prebid.js no encontrado en js/prebid.js. Genera tu build en https://docs.prebid.org/download.html y colócalo ahí, o desactiva EOF_ADS_CONFIG.prebid.activo.");
  });
  _eofAdsPrebidListo = true;
}

function eofAdsDefinirSlotGAM(key, slotDef, divId) {
  if (_eofAdsSlotsDefinidosGPT.has(divId)) return _eofAdsSlotsDefinidosGPT.get(divId);
  const formato = eofAdsFormatoActual(slotDef);
  const todosTamanos = [...new Set(slotDef.formatos.flatMap((f) => f.tamanos))];
  const mapping = googletag.sizeMapping();
  slotDef.formatos
    .slice()
    .sort((a, b) => a.minAncho - b.minAncho)
    .forEach((f) => mapping.addSize([f.minAncho, 0], f.tamanos));
  const gSlot = googletag
    .defineSlot(slotDef.gamAdUnit, todosTamanos, divId)
    .defineSizeMapping(mapping.build())
    .addService(googletag.pubads());
  _eofAdsSlotsDefinidosGPT.set(divId, gSlot);
  return gSlot;
}

function eofAdsPujarPrebid(bids) {
  return new Promise((resolve) => {
    if (!EOF_ADS_CONFIG.prebid.activo || !EOF_ADS_CONFIG.prebid.bidders.length) return resolve();
    pbjs.que.push(() => {
      pbjs.addAdUnits(bids);
      pbjs.requestBids({
        timeout: EOF_ADS_CONFIG.prebid.timeoutMs,
        bidsBackHandler: () => {
          pbjs.setTargetingForGPTAsync();
          resolve();
        },
      });
    });
  });
}

async function eofAdsSolicitarSlotGAM(divId, key, slotDef) {
  await eofAdsAsegurarGPT();
  await eofAdsAsegurarPrebid();

  googletag.cmd.push(async () => {
    const gSlot = eofAdsDefinirSlotGAM(key, slotDef, divId);

    if (EOF_ADS_CONFIG.prebid.activo && EOF_ADS_CONFIG.prebid.bidders.length) {
      const bids = [{
        code: divId,
        mediaTypes: { banner: { sizes: [...new Set(slotDef.formatos.flatMap((f) => f.tamanos))] } },
        bids: EOF_ADS_CONFIG.prebid.bidders.map((b) => ({ bidder: b.nombre, params: b.params })),
      }];
      await eofAdsPujarPrebid(bids);
    }

    googletag.display(divId);
    googletag.pubads().refresh([gSlot]);
  });
}

// ---------- Modo AdSense (sin GAM) ----------
let _eofAdsenseScriptCargado = false;
async function eofAdsAsegurarAdsenseScript() {
  if (_eofAdsenseScriptCargado || !EOF_ADS_CONFIG.adsense.clienteAdsense) return;
  await eofAdsCargarScript(
    `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(EOF_ADS_CONFIG.adsense.clienteAdsense)}`
  ).catch(() => {});
  window.adsbygoogle = window.adsbygoogle || [];
  _eofAdsenseScriptCargado = true;
}

async function eofAdsSolicitarSlotAdsense(divId, key, slotDef) {
  if (!slotDef.adsenseSlotId || !EOF_ADS_CONFIG.adsense.clienteAdsense) return;
  await eofAdsAsegurarAdsenseScript();
  const contenedor = document.getElementById(divId);
  if (!contenedor) return;
  const ins = document.createElement("ins");
  ins.className = "adsbygoogle";
  ins.style.display = "block";
  ins.setAttribute("data-ad-client", EOF_ADS_CONFIG.adsense.clienteAdsense);
  ins.setAttribute("data-ad-slot", slotDef.adsenseSlotId);
  ins.setAttribute("data-ad-format", "auto");
  ins.setAttribute("data-full-width-responsive", "true");
  contenedor.appendChild(ins);
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (err) {
    console.warn("[ads] Error al solicitar anuncio de AdSense:", err);
  }
}

// Modo "Auto ads" de AdSense: un único script suelto en la página basta,
// Google decide dónde colocar los anuncios sin necesidad de los
// contenedores manuales de arriba.
async function eofAdsActivarAutoAds() {
  if (!eofAdsPuedeCargar() || !EOF_ADS_CONFIG.adsense.clienteAdsense) return;
  await eofAdsCargarScript(
    `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(EOF_ADS_CONFIG.adsense.clienteAdsense)}`
  ).catch(() => {});
  window.adsbygoogle = window.adsbygoogle || [];
  try {
    adsbygoogle.push({ google_ad_client: EOF_ADS_CONFIG.adsense.clienteAdsense, enable_page_level_ads: true });
  } catch (err) {
    // Auto ads solo se puede activar una vez por página; un segundo intento
    // (p.ej. si initAds() se llamara dos veces) lanza, se ignora.
  }
}

// ---------- API pública ----------

// Devuelve el HTML de un hueco publicitario listo para insertar en
// cualquier plantilla (portada, categoría, noticia...). Uso típico:
//   contenedor.innerHTML += adSlot("cabecera");
// Tras insertarlo en el DOM, hay que llamar a initAds() (o dejar que la
// llamada automática en DOMContentLoaded lo recoja) para que se solicite
// el anuncio de verdad.
function adSlot(key, idUnico) {
  return adSlotHTML(key, idUnico);
}

// Recorre el DOM buscando contenedores de anuncio pendientes de solicitar
// (los que tiene adSlotHTML) y dispara la petición a GAM/AdSense según el
// proveedor configurado. Se puede llamar tantas veces como haga falta
// (p.ej. tras insertar más tarjetas de noticias por scroll infinito): solo
// actúa sobre los contenedores que todavía no se han solicitado.
function initAds() {
  if (!eofAdsPuedeCargar()) return;

  if (eofAdsProveedorActivo() === "adsense" && EOF_ADS_CONFIG.adsense.autoAds) {
    eofAdsActivarAutoAds();
    return; // con Auto ads no se solicitan los contenedores manuales
  }

  document.querySelectorAll(".eof-ad-contenedor:not([data-ad-solicitado])").forEach((div) => {
    const wrap = div.closest("[data-ad-key]");
    const key = wrap && wrap.dataset.adKey;
    if (!key) return;
    div.setAttribute("data-ad-solicitado", "1");
    eofAdsSolicitarSlot(div.id, key);
  });
}

// Inserta huecos "entre_noticias" dentro de un listado de tarjetas ya
// pintado, cada EOF_ADS_CADA_N_TARJETAS tarjetas. Pensado para llamarse
// justo después de pintar un grid de noticias (portada, categoría,
// búsqueda...): selectorGrid es el contenedor que ya tiene las tarjetas
// (p.ej. ".grid-noticias") como hijos directos.
function insertarAdsEnGrid(selectorGrid) {
  const grid = typeof selectorGrid === "string" ? document.querySelector(selectorGrid) : selectorGrid;
  if (!grid) return;
  const tarjetas = [...grid.children].filter((el) => !el.classList.contains("eof-ad-wrap"));
  if (tarjetas.length < EOF_ADS_CADA_N_TARJETAS) return;

  for (let i = EOF_ADS_CADA_N_TARJETAS; i < tarjetas.length; i += EOF_ADS_CADA_N_TARJETAS) {
    const referencia = tarjetas[i];
    if (!referencia || !referencia.parentNode) continue;
    const wrapper = document.createElement("div");
    wrapper.className = "eof-ad-grid-item";
    wrapper.innerHTML = adSlot("entre_noticias");
    referencia.parentNode.insertBefore(wrapper, referencia);
  }
  initAds();
}

// Se dispara sola al cargar cualquier página que incluya este script,
// para recoger los slots ya presentes en el HTML estático (cabecera, pie,
// noticia_final...) sin que cada página tenga que acordarse de llamar a
// initAds() a mano. Los que se insertan dinámicamente después (listados
// paginados, entre_noticias...) sí necesitan su propia llamada a
// initAds()/insertarAdsEnGrid() justo después de pintarse.
document.addEventListener("DOMContentLoaded", () => {
  initAds();
});

// Si cambia el ancho de ventana de forma relevante (p.ej. girar el móvil),
// se recalcula el alto reservado de los contenedores que aún no se hayan
// solicitado, para que la reserva de espacio siga siendo correcta al
// nuevo tamaño. No se vuelve a pedir el anuncio ya servido (para eso está
// el refresco opcional de GPT, EOF_ADS_CONFIG.gam.refreshSegundos).
let _eofAdsResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(_eofAdsResizeTimer);
  _eofAdsResizeTimer = setTimeout(() => {
    document.querySelectorAll(".eof-ad-contenedor:not([data-ad-solicitado])").forEach((div) => {
      const wrap = div.closest("[data-ad-key]");
      const key = wrap && wrap.dataset.adKey;
      const slotDef = key && EOF_AD_SLOTS[key];
      if (slotDef) div.style.minHeight = `${eofAdsAltoReservado(slotDef)}px`;
    });
  }, 200);
});
