// ============================================================================
// ELOTROFÚTBOLTV — Sistema de espacios publicitarios MULTI-RED
// ============================================================================
// Un único motor para todo el sitio. Las páginas siguen llamando a las mismas
// funciones de siempre (adSlot(), insertarAdsEnGrid(), initAds()), así que
// activar o desactivar redes NO requiere tocar ninguna página: solo este
// archivo (bloque EOF_ADS_CONFIG).
//
// REDES SOPORTADAS (cada una se activa sola cuando tiene sus IDs rellenos):
//   google        Google AdSense o Google Ad Manager (+ Prebid vía GAM)
//   prebid        Header bidding SIN Google: varias SSPs pujan y gana la
//                 mejor oferta (necesita js/prebid.js, ver ANUNCIOS-REDES.md)
//   medianet      Media.net (contextual, Yahoo!/Bing)
//   ezoic         Ezoic (modo standalone: ellos deciden qué anuncio y cuándo)
//   taboola       Taboola (widgets de contenido recomendado/patrocinado)
//   personalizada Cualquier otra red: pegas su código HTML/JS en un hueco
//
// CÓMO SE REPARTEN LOS HUECOS (cascada / "waterfall"):
//   Para cada hueco (cabecera, pie, noticia_final...) se mira la lista
//   EOF_ADS_CONFIG.prioridad (global o por hueco). La primera red que esté
//   configurada para ese hueco lo intenta. Si Google (AdSense/GAM) o Prebid
//   devuelven el hueco VACÍO ("sin relleno"), se pasa automáticamente a la
//   siguiente red de la lista. Si ninguna rellena, el hueco se colapsa (sin
//   caja vacía). Así cada hueco nunca queda sin monetizar mientras alguna red
//   tenga anuncio.
//
// CONSENTIMIENTO (RGPD/TCF): ninguna red carga hasta que haya consentimiento
//   de "publicidad". Dos modos en EOF_ADS_CONFIG.consentimiento:
//     "propio" -> el banner de js/cookies.js (modo histórico del sitio).
//     "tcf"    -> una CMP certificada IAB TCF v2.2 (Google Funding Choices,
//                 Didomi, Cookiebot, Quantcast...). Para servir anuncios a
//                 lectores de España la mayoría de redes exigen esto.
//     "ninguno"-> no se espera a nada (la red gestiona su propio aviso, p.ej.
//                 Ezoic con su CMP). Úsalo solo si estás seguro.
//
// Con todo vacío (estado inicial) NO se pinta ningún hueco ni etiqueta
// "Publicidad". Para verlos en local: window.EOF_ADS_MOSTRAR_HUECOS = true
// ANTES de cargar este archivo.
// ============================================================================

const EOF_ADS_CONFIG = window.EOF_ADS_CONFIG || {
  consentimiento: "propio", // "propio" | "tcf" | "ninguno"

  // Orden en el que se prueban las redes. "porSlot" sobrescribe "global" para
  // huecos concretos (p.ej. Taboola primero al final de la noticia).
  prioridad: {
    global: ["google", "prebid", "medianet", "ezoic", "taboola", "personalizada"],
    porSlot: {
      // noticia_final: ["taboola", "google", "medianet"],
    },
  },

  // ---------- 1) GOOGLE ----------
  // proveedor: "gam" | "adsense" | "none". Mientras AdSense no te apruebe,
  // déjalo en "none" y el resto de redes funcionan igualmente.
  proveedor: "none",
  gam: {
    networkCode: "", // p.ej. "23456789"
    singleRequest: true,
    refreshSegundos: 0, // 0 = sin refresco automático
  },
  adsense: {
    clienteAdsense: "ca-pub-7347856722927942",
    autoAds: false, // true = Google coloca los anuncios; false = huecos manuales (slotId abajo)
  },

  // ---------- 2) PREBID (header bidding) ----------
  // sinGAM:false -> la puja ganadora se manda a GAM como targeting (necesita GAM).
  // sinGAM:true  -> NO hace falta Google: se pinta directamente el anuncio con
  //                 la puja más alta (si supera precioMinimo, en CPM).
  prebid: {
    activo: false,
    sinGAM: true,
    timeoutMs: 1200,
    precioMinimo: 0.3,
    bidders: [
      // { nombre: "appnexus", params: { placementId: "0" } },
      // { nombre: "rubicon", params: { accountId: "0", siteId: "0", zoneId: "0" } },
      // { nombre: "pubmatic", params: { publisherId: "0", adSlot: "0" } },
      // { nombre: "ix", params: { siteId: "0" } },
    ],
  },

  // ---------- 3) OTRAS REDES ----------
  redes: {
    // Media.net: en su panel creas "ad units" por tamaño; cada una tiene un
    // CRID. Una unidad por tamaño (escritorio/móvil) y hueco. "crid" puede ser
    // un texto o una lista (para huecos que se repiten, como entre_noticias).
    medianet: {
      activo: false,
      cid: "", // p.ej. "8CUXXXXXX" (customer id, sale en su código)
      versionId: "", // medianet_versionId, sale en su código (opcional)
      slots: {
        // cabecera: [
        //   { minAncho: 1024, crid: "123456789", tamano: "728x90" },
        //   { minAncho: 0, crid: "123456790", tamano: "320x50" },
        // ],
        // entre_noticias: [{ minAncho: 0, crid: ["111", "112"], tamano: "300x250" }],
      },
    },

    // Ezoic (standalone): los IDs de colocación (placeholders) salen de su
    // panel. Ezoic decide qué anunciantes pujan, así que NO lo combines con
    // AdSense/GAM en el mismo hueco (pon solo uno de los dos por hueco).
    ezoic: {
      activo: false,
      usarCMPEzoic: false, // true = carga la CMP "Gatekeeper" de Ezoic (pon consentimiento:"ninguno")
      slots: {
        // cabecera: [101], entre_noticias: [102, 103], noticia_intext: [104],
        // noticia_final: [105], pie: [106], lateral: [107],
      },
    },

    // Taboola: widgets de recomendación (suelen pagar bien en medios de
    // noticias, pero exigen aprobación y un mínimo de tráfico).
    taboola: {
      activo: false,
      publisherId: "", // p.ej. "elotrofutbol-network" (te lo da Taboola)
      slots: {
        // noticia_final: { modo: "thumbnails-a", placement: "Below Article Thumbnails" },
        // pie: { modo: "thumbnails-a", placement: "Below Homepage Thumbnails" },
      },
    },

    // Cualquier otra red (Amazon, Setupad, AdPlus, ventas directas...).
    // "html" se inserta tal cual (los <script> se ejecutan). "scripts" son
    // librerías que se cargan una sola vez en la página.
    personalizada: {
      activo: false,
      scripts: [],
      slots: {
        // cabecera: { html: '<div id="mi-red-cabecera"></div><script>/* ... */<\/script>' },
      },
    },
  },
};

// ---------- Definición de los huecos publicitarios del sitio ----------
const EOF_AD_SLOTS = {
  cabecera: {
    gamAdUnit: "/0000000/eof_cabecera",
    adsenseSlotId: "",
    formatos: [
      { minAncho: 1024, tamanos: [[970, 250], [728, 90]] },
      { minAncho: 700, tamanos: [[728, 90]] },
      { minAncho: 0, tamanos: [[320, 100], [300, 100]] },
    ],
  },
  entre_noticias: {
    gamAdUnit: "/0000000/eof_entre_noticias",
    adsenseSlotId: "",
    formatos: [
      { minAncho: 1024, tamanos: [[336, 280], [300, 250]] },
      { minAncho: 0, tamanos: [[300, 250]] },
    ],
  },
  lateral: {
    gamAdUnit: "/0000000/eof_lateral",
    adsenseSlotId: "",
    formatos: [
      { minAncho: 1024, tamanos: [[300, 600], [300, 250]] },
      { minAncho: 0, tamanos: [[300, 250]] },
    ],
  },
  noticia_intext: {
    gamAdUnit: "/0000000/eof_noticia_intext",
    adsenseSlotId: "",
    formatos: [
      { minAncho: 700, tamanos: [[728, 90], [300, 250]] },
      { minAncho: 0, tamanos: [[300, 250]] },
    ],
  },
  noticia_final: {
    gamAdUnit: "/0000000/eof_noticia_final",
    adsenseSlotId: "",
    formatos: [
      { minAncho: 1024, tamanos: [[970, 250], [728, 90]] },
      { minAncho: 0, tamanos: [[320, 100], [300, 250]] },
    ],
  },
  pie: {
    gamAdUnit: "/0000000/eof_pie",
    adsenseSlotId: "",
    formatos: [
      { minAncho: 1024, tamanos: [[970, 250], [728, 90]] },
      { minAncho: 0, tamanos: [[320, 100]] },
    ],
  },
};

// Cada cuántas tarjetas se intercala un anuncio "entre_noticias" en un listado.
const EOF_ADS_CADA_N_TARJETAS = 12;
// Dentro de una noticia: después de qué párrafo se inserta "noticia_intext" y
// cuántos párrafos mínimo debe tener el texto para que merezca la pena.
const EOF_ADS_INTEXT_TRAS_PARRAFO = 2;
const EOF_ADS_INTEXT_MIN_PARRAFOS = 5;

// ============================================================================
// Motor interno
// ============================================================================

let _eofAdsGptListo = false;
let _eofAdsPrebidListo = false;
let _eofAdsContador = 0;
const _eofAdsSlotsDefinidosGPT = new Map(); // divId -> googletag slot
const _eofAdsGamCallbacks = new Map(); // divId -> función a llamar si GAM no rellena
const _eofAdsIdsUsados = new Set(); // ids de Ezoic/Media.net ya colocados en esta página

const eofAdsDev = () => window.EOF_ADS_MOSTRAR_HUECOS === true;
if (eofAdsDev()) document.documentElement.classList.add("eof-ads-dev");
const eofAdsRed = (nombre) => (EOF_ADS_CONFIG.redes && EOF_ADS_CONFIG.redes[nombre]) || {};

// ---------- Consentimiento ----------
if (EOF_ADS_CONFIG.consentimiento === "tcf") {
  // Con una CMP externa certificada, desactiva el banner propio de cookies.js
  // (cookies.js comprueba este indicador al arrancar).
  window.EOF_CMP_EXTERNO = true;
}

function eofAdsPuedeCargar() {
  if (EOF_ADS_CONFIG.consentimiento === "ninguno") return true;
  return window.EOF_CONSENTIMIENTO_PUBLICIDAD === true;
}

function eofAdsEscucharTCF() {
  let intentos = 0;
  const conectar = () => {
    if (typeof window.__tcfapi === "function") {
      window.__tcfapi("addEventListener", 2, (tcData, ok) => {
        if (!ok || !tcData) return;
        if (tcData.eventStatus !== "tcloaded" && tcData.eventStatus !== "useractioncomplete") return;
        const consiente =
          tcData.gdprApplies === false ||
          !!(tcData.purpose && tcData.purpose.consents && tcData.purpose.consents[1]);
        window.EOF_CONSENTIMIENTO_PUBLICIDAD = consiente;
        if (consiente) {
          document.dispatchEvent(new CustomEvent("eof:cookies-aceptadas"));
          initAds();
        }
      });
    } else if (++intentos < 75) {
      setTimeout(conectar, 200); // la CMP puede tardar unos segundos en cargar
    }
  };
  conectar();
}
if (EOF_ADS_CONFIG.consentimiento === "tcf") eofAdsEscucharTCF();

// ---------- Utilidades ----------
function eofAdsCargarScript(src, atributos) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    if (atributos) Object.keys(atributos).forEach((k) => s.setAttribute(k, atributos[k]));
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function eofAdsAnchoVentana() {
  return window.innerWidth || document.documentElement.clientWidth || 0;
}

function eofAdsFormatoActual(slotDef) {
  const ancho = eofAdsAnchoVentana();
  const formatos = [...slotDef.formatos].sort((a, b) => b.minAncho - a.minAncho);
  return formatos.find((f) => ancho >= f.minAncho) || formatos[formatos.length - 1];
}

function eofAdsAltoReservado(slotDef) {
  const formato = eofAdsFormatoActual(slotDef);
  if (!formato || !formato.tamanos.length) return 0;
  return Math.max(...formato.tamanos.map((t) => t[1]));
}

// De una lista [{minAncho,...}] devuelve la entrada aplicable al ancho actual.
function eofAdsPorAncho(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const ancho = eofAdsAnchoVentana();
  const orden = [...lista].sort((a, b) => b.minAncho - a.minAncho);
  return orden.find((u) => ancho >= (u.minAncho || 0)) || null;
}

function eofAdsPrimerLibre(valor) {
  const lista = Array.isArray(valor) ? valor : [valor];
  return lista.find((v) => v !== undefined && v !== null && v !== "" && !_eofAdsIdsUsados.has(String(v)));
}

// ============================================================================
// ADAPTADORES (uno por red). Interfaz común:
//   configurado(key, slotDef) -> ¿esta red puede llenar este hueco?
//   alto(key, slotDef)        -> alto a reservar (px) o null para usar el estándar
//   solicitar(divId, key, slotDef, alVaciar) -> pide el anuncio; si no hay
//                               relleno llama a alVaciar() (pasa a la siguiente red)
// ============================================================================
const EOF_ADS_ADAPTADORES = {};

// ---------- GOOGLE (AdSense / GAM) ----------
EOF_ADS_ADAPTADORES.google = {
  configurado(key, slotDef) {
    const proveedor = EOF_ADS_CONFIG.proveedor || "none";
    if (proveedor === "gam") {
      const ad = (slotDef && slotDef.gamAdUnit) || "";
      return !!EOF_ADS_CONFIG.gam.networkCode && !!ad && !ad.startsWith("/0000000/");
    }
    if (proveedor === "adsense") {
      if (EOF_ADS_CONFIG.adsense.autoAds) return false;
      return !!EOF_ADS_CONFIG.adsense.clienteAdsense && !!(slotDef && slotDef.adsenseSlotId);
    }
    return false;
  },
  alto: () => null,
  solicitar(divId, key, slotDef, alVaciar) {
    if (EOF_ADS_CONFIG.proveedor === "gam") eofAdsSolicitarSlotGAM(divId, key, slotDef, alVaciar);
    else eofAdsSolicitarSlotAdsense(divId, key, slotDef, alVaciar);
  },
};

async function eofAdsAsegurarGPT() {
  if (_eofAdsGptListo) return;
  window.googletag = window.googletag || { cmd: [] };
  await eofAdsCargarScript("https://securepubads.g.doubleclick.net/tag/js/gpt.js");
  await new Promise((resolve) => {
    googletag.cmd.push(() => {
      const pubads = googletag.pubads();
      // Los slots se piden uno a uno (cuando se acercan a la pantalla) con
      // refresh(): así no hay doble petición ni se piden huecos que nunca se ven.
      pubads.disableInitialLoad();
      pubads.collapseEmptyDivs();
      pubads.addEventListener("slotRenderEnded", (ev) => {
        const divId = ev.slot.getSlotElementId();
        const cb = _eofAdsGamCallbacks.get(divId);
        if (ev.isEmpty && cb) {
          _eofAdsGamCallbacks.delete(divId);
          googletag.destroySlots([ev.slot]);
          _eofAdsSlotsDefinidosGPT.delete(divId);
          cb();
        }
      });
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
  window.pbjs = window.pbjs || {};
  window.pbjs.que = window.pbjs.que || [];
  // Build propio generado con https://docs.prebid.org/download.html
  // (con los adaptadores de TUS bidders) y colocado en public/js/prebid.js
  await eofAdsCargarScript("/js/prebid.js").catch(() => {
    console.warn("[ads] Prebid.js no encontrado en /js/prebid.js. Genera tu build en https://docs.prebid.org/download.html o desactiva EOF_ADS_CONFIG.prebid.activo.");
  });
  _eofAdsPrebidListo = true;
}

function eofAdsTodosTamanos(slotDef) {
  return [...new Set(slotDef.formatos.flatMap((f) => f.tamanos.map((t) => t.join("x"))))].map((s) => s.split("x").map(Number));
}

function eofAdsDefinirSlotGAM(slotDef, divId) {
  if (_eofAdsSlotsDefinidosGPT.has(divId)) return _eofAdsSlotsDefinidosGPT.get(divId);
  const mapping = googletag.sizeMapping();
  slotDef.formatos
    .slice()
    .sort((a, b) => a.minAncho - b.minAncho)
    .forEach((f) => mapping.addSize([f.minAncho, 0], f.tamanos));
  const gSlot = googletag
    .defineSlot(slotDef.gamAdUnit, eofAdsTodosTamanos(slotDef), divId)
    .defineSizeMapping(mapping.build())
    .addService(googletag.pubads());
  _eofAdsSlotsDefinidosGPT.set(divId, gSlot);
  return gSlot;
}

function eofAdsPujarPrebidGAM(bids) {
  return new Promise((resolve) => {
    if (!EOF_ADS_CONFIG.prebid.activo || !EOF_ADS_CONFIG.prebid.bidders.length || EOF_ADS_CONFIG.prebid.sinGAM) return resolve();
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

async function eofAdsSolicitarSlotGAM(divId, key, slotDef, alVaciar) {
  try {
    await eofAdsAsegurarGPT();
    await eofAdsAsegurarPrebid();
  } catch (e) {
    return alVaciar(); // GPT bloqueado (adblock...): siguiente red
  }
  googletag.cmd.push(async () => {
    const gSlot = eofAdsDefinirSlotGAM(slotDef, divId);
    _eofAdsGamCallbacks.set(divId, alVaciar);
    const bids = [{
      code: divId,
      mediaTypes: { banner: { sizes: eofAdsTodosTamanos(slotDef) } },
      bids: EOF_ADS_CONFIG.prebid.bidders.map((b) => ({ bidder: b.nombre, params: b.params })),
    }];
    await eofAdsPujarPrebidGAM(bids);
    googletag.display(divId);
    googletag.pubads().refresh([gSlot]);
  });
}

let _eofAdsenseScriptCargado = false;
async function eofAdsAsegurarAdsenseScript() {
  if (_eofAdsenseScriptCargado || !EOF_ADS_CONFIG.adsense.clienteAdsense) return;
  await eofAdsCargarScript(
    `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(EOF_ADS_CONFIG.adsense.clienteAdsense)}`,
    { crossorigin: "anonymous" }
  ).catch(() => {});
  window.adsbygoogle = window.adsbygoogle || [];
  _eofAdsenseScriptCargado = true;
}

async function eofAdsSolicitarSlotAdsense(divId, key, slotDef, alVaciar) {
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
  // AdSense marca el <ins> con data-ad-status="unfilled" cuando no hay anuncio.
  if (window.MutationObserver) {
    const obs = new MutationObserver(() => {
      if (ins.getAttribute("data-ad-status") === "unfilled") {
        obs.disconnect();
        ins.remove();
        alVaciar();
      }
    });
    obs.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
  }
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (err) {
    console.warn("[ads] Error al solicitar anuncio de AdSense:", err);
    alVaciar();
  }
}

async function eofAdsActivarAutoAds() {
  if (!eofAdsPuedeCargar() || !EOF_ADS_CONFIG.adsense.clienteAdsense) return;
  await eofAdsCargarScript(
    `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(EOF_ADS_CONFIG.adsense.clienteAdsense)}`,
    { crossorigin: "anonymous" }
  ).catch(() => {});
  window.adsbygoogle = window.adsbygoogle || [];
  try {
    adsbygoogle.push({ google_ad_client: EOF_ADS_CONFIG.adsense.clienteAdsense, enable_page_level_ads: true });
  } catch (err) {
    // Auto ads solo se activa una vez por página.
  }
}

// ---------- PREBID standalone (sin Google) ----------
EOF_ADS_ADAPTADORES.prebid = {
  configurado() {
    const p = EOF_ADS_CONFIG.prebid;
    return !!(p.activo && p.sinGAM && p.bidders && p.bidders.length);
  },
  alto: () => null,
  async solicitar(divId, key, slotDef, alVaciar) {
    await eofAdsAsegurarPrebid();
    if (!window.pbjs || !pbjs.que) return alVaciar();
    const p = EOF_ADS_CONFIG.prebid;
    pbjs.que.push(() => {
      pbjs.addAdUnits([{
        code: divId,
        mediaTypes: { banner: { sizes: eofAdsTodosTamanos(slotDef) } },
        bids: p.bidders.map((b) => ({ bidder: b.nombre, params: b.params })),
      }]);
      pbjs.requestBids({
        adUnitCodes: [divId],
        timeout: p.timeoutMs,
        bidsBackHandler: () => {
          const mejor = (pbjs.getHighestCpmBids(divId) || [])[0];
          const contenedor = document.getElementById(divId);
          if (!mejor || !contenedor || mejor.cpm < (p.precioMinimo || 0)) return alVaciar();
          const iframe = document.createElement("iframe");
          iframe.width = mejor.width;
          iframe.height = mejor.height;
          iframe.style.cssText = "border:0;max-width:100%;";
          iframe.setAttribute("scrolling", "no");
          iframe.setAttribute("title", "Publicidad");
          contenedor.appendChild(iframe);
          pbjs.renderAd(iframe.contentWindow.document, mejor.adId);
        },
      });
    });
  },
};

// ---------- MEDIA.NET ----------
EOF_ADS_ADAPTADORES.medianet = {
  configurado(key) {
    const c = eofAdsRed("medianet");
    if (!c.activo || !c.cid) return false;
    const u = eofAdsPorAncho((c.slots || {})[key]);
    return !!(u && eofAdsPrimerLibre(u.crid));
  },
  alto(key) {
    const u = eofAdsPorAncho((eofAdsRed("medianet").slots || {})[key]);
    const h = u && parseInt(String(u.tamano).split("x")[1], 10);
    return h || null;
  },
  async solicitar(divId, key, slotDef, alVaciar) {
    const c = eofAdsRed("medianet");
    const u = eofAdsPorAncho((c.slots || {})[key]);
    const crid = u && eofAdsPrimerLibre(u.crid);
    const contenedor = document.getElementById(divId);
    if (!crid || !contenedor) return alVaciar();
    _eofAdsIdsUsados.add(String(crid));
    window._mNHandle = window._mNHandle || {};
    window._mNHandle.queue = window._mNHandle.queue || [];
    if (c.versionId) window.medianet_versionId = c.versionId;
    contenedor.innerHTML = `<div id="${crid}"></div>`;
    try {
      await eofAdsCargarScript(`https://contextual.media.net/dmedianet.js?cid=${encodeURIComponent(c.cid)}`);
      window._mNHandle.queue.push(() => {
        window._mNDetails.loadTag(String(crid), u.tamano, String(crid));
      });
    } catch (e) {
      alVaciar();
    }
  },
};

// ---------- EZOIC (standalone) ----------
let _eofAdsEzoicListo = null;
function eofAdsAsegurarEzoic() {
  if (_eofAdsEzoicListo) return _eofAdsEzoicListo;
  const c = eofAdsRed("ezoic");
  _eofAdsEzoicListo = (async () => {
    if (c.usarCMPEzoic) {
      await eofAdsCargarScript("https://cmp.gatekeeperconsent.com/min.js", { "data-cfasync": "false" }).catch(() => {});
      await eofAdsCargarScript("https://the.gatekeeperconsent.com/cmp.min.js", { "data-cfasync": "false" }).catch(() => {});
    }
    window.ezstandalone = window.ezstandalone || {};
    ezstandalone.cmd = ezstandalone.cmd || [];
    await eofAdsCargarScript("https://www.ezojs.com/ezoic/sa.min.js");
  })();
  return _eofAdsEzoicListo;
}

EOF_ADS_ADAPTADORES.ezoic = {
  configurado(key) {
    const c = eofAdsRed("ezoic");
    return !!(c.activo && eofAdsPrimerLibre((c.slots || {})[key]));
  },
  alto: () => null,
  async solicitar(divId, key, slotDef, alVaciar) {
    const c = eofAdsRed("ezoic");
    const id = eofAdsPrimerLibre((c.slots || {})[key]);
    const contenedor = document.getElementById(divId);
    if (id === undefined || !contenedor) return alVaciar();
    _eofAdsIdsUsados.add(String(id));
    contenedor.innerHTML = `<div id="ezoic-pub-ad-placeholder-${id}"></div>`;
    try {
      await eofAdsAsegurarEzoic();
      window.ezstandalone.cmd.push(() => window.ezstandalone.showAds(Number(id)));
    } catch (e) {
      alVaciar();
    }
  },
};

// ---------- TABOOLA ----------
let _eofAdsTaboolaIniciado = false;
let _eofAdsTaboolaFlush = null;
function eofAdsTaboolaTipoPagina() {
  if (window.EOF_TABOOLA_TIPO_PAGINA) return window.EOF_TABOOLA_TIPO_PAGINA;
  const ruta = location.pathname.toLowerCase();
  if (ruta.includes("noticia")) return "article";
  if (ruta === "/" || ruta.endsWith("/index.html")) return "home";
  return "category";
}

EOF_ADS_ADAPTADORES.taboola = {
  configurado(key) {
    const c = eofAdsRed("taboola");
    return !!(c.activo && c.publisherId && (c.slots || {})[key]);
  },
  alto: () => 0, // el widget fija su propio alto
  async solicitar(divId, key, slotDef, alVaciar) {
    const c = eofAdsRed("taboola");
    const cfg = c.slots[key];
    window._taboola = window._taboola || [];
    if (!_eofAdsTaboolaIniciado) {
      _eofAdsTaboolaIniciado = true;
      const tipo = eofAdsTaboolaTipoPagina();
      window._taboola.push({ [tipo]: "auto" });
      eofAdsCargarScript(`https://cdn.taboola.com/libtrc/${encodeURIComponent(c.publisherId)}/loader.js`, { id: "tb_loader_script" }).catch(() => alVaciar());
    }
    window._taboola.push({
      mode: cfg.modo || "thumbnails-a",
      container: divId,
      placement: cfg.placement || key,
      target_type: cfg.tipoContenido || "mix",
    });
    clearTimeout(_eofAdsTaboolaFlush);
    _eofAdsTaboolaFlush = setTimeout(() => window._taboola.push({ flush: true }), 150);
  },
};

// ---------- PERSONALIZADA (cualquier otra red) ----------
EOF_ADS_ADAPTADORES.personalizada = {
  configurado(key) {
    const c = eofAdsRed("personalizada");
    return !!(c.activo && c.slots && c.slots[key] && c.slots[key].html);
  },
  alto: () => null,
  async solicitar(divId, key, slotDef, alVaciar) {
    const c = eofAdsRed("personalizada");
    const contenedor = document.getElementById(divId);
    if (!contenedor) return alVaciar();
    try {
      for (const src of c.scripts || []) await eofAdsCargarScript(src);
      // createContextualFragment ejecuta los <script> del HTML pegado
      contenedor.appendChild(document.createRange().createContextualFragment(c.slots[key].html));
    } catch (e) {
      alVaciar();
    }
  },
};

// ============================================================================
// Cascada de redes por hueco
// ============================================================================
function eofAdsCadena(key) {
  const slotDef = EOF_AD_SLOTS[key];
  if (!slotDef) return [];
  const prio = EOF_ADS_CONFIG.prioridad || {};
  const orden = (prio.porSlot && prio.porSlot[key]) || prio.global || Object.keys(EOF_ADS_ADAPTADORES);
  return orden.filter((n) => EOF_ADS_ADAPTADORES[n] && EOF_ADS_ADAPTADORES[n].configurado(key, slotDef));
}

// ¿Hay alguna red que pueda servir este hueco? (o modo desarrollo)
function eofAdsSlotConfigurado(keyOSlotDef) {
  if (eofAdsDev()) return true;
  const key = typeof keyOSlotDef === "string"
    ? keyOSlotDef
    : Object.keys(EOF_AD_SLOTS).find((k) => EOF_AD_SLOTS[k] === keyOSlotDef);
  if (!key) return false;
  return eofAdsCadena(key).length > 0;
}

function eofAdsAltoHueco(key) {
  const slotDef = EOF_AD_SLOTS[key];
  const cadena = eofAdsCadena(key);
  if (cadena.length) {
    const a = EOF_ADS_ADAPTADORES[cadena[0]].alto(key, slotDef);
    if (a !== null && a !== undefined) return a;
  }
  return eofAdsAltoReservado(slotDef);
}

function eofAdsMarcarVacio(div) {
  const wrap = div.closest("[data-ad-key]");
  if (wrap) wrap.classList.add("eof-ad-vacio");
}

function eofAdsSolicitarSlot(divId, key) {
  const slotDef = EOF_AD_SLOTS[key];
  const div = document.getElementById(divId);
  if (!slotDef || !div || !eofAdsPuedeCargar()) return;

  const cadena = eofAdsCadena(key);
  if (!cadena.length) return; // modo desarrollo: se deja la caja reservada
  const wrap = div.closest("[data-ad-key]");
  let paso = 0;

  const siguiente = () => {
    const nombre = cadena[paso++];
    if (!nombre) {
      div.innerHTML = "";
      return eofAdsMarcarVacio(div);
    }
    div.innerHTML = "";
    div.removeAttribute("data-ad-llena");
    if (wrap) wrap.setAttribute("data-ad-red", nombre);
    let usado = false;
    const alVaciar = () => {
      if (usado) return;
      usado = true;
      siguiente();
    };
    try {
      const r = EOF_ADS_ADAPTADORES[nombre].solicitar(divId, key, slotDef, alVaciar);
      if (r && typeof r.catch === "function") r.catch(alVaciar);
    } catch (e) {
      alVaciar();
    }
  };
  siguiente();
}

// ============================================================================
// API pública (la misma de siempre)
// ============================================================================

// HTML de un hueco publicitario listo para insertar en cualquier plantilla.
function adSlotHTML(key, idUnico) {
  const slotDef = EOF_AD_SLOTS[key];
  if (!slotDef) return "";
  if (!eofAdsSlotConfigurado(key)) return "";
  const id = `eof-ad-${key}-${idUnico || ++_eofAdsContador}`;
  const alto = eofAdsAltoHueco(key);
  return `
    <div class="eof-ad-wrap eof-ad-${key}" data-ad-key="${key}">
      <span class="eof-ad-etiqueta">Publicidad</span>
      <div id="${id}" class="eof-ad-contenedor" style="min-height:${alto}px;"></div>
    </div>`;
}

function adSlot(key, idUnico) {
  return adSlotHTML(key, idUnico);
}

// Pide los anuncios de los contenedores pendientes. Se pide cuando el hueco
// está a punto de entrar en pantalla (mejor visibilidad = mejor CPM, y no se
// gastan peticiones en huecos que nadie llega a ver). Puede llamarse varias
// veces: solo actúa sobre los contenedores aún no solicitados.
let _eofAdsObservador = null;
function eofAdsObservarContenedor(div) {
  const lanzar = () => {
    const wrap = div.closest("[data-ad-key]");
    const key = wrap && wrap.dataset.adKey;
    if (key) eofAdsSolicitarSlot(div.id, key);
  };
  if (!("IntersectionObserver" in window)) return lanzar();
  if (!_eofAdsObservador) {
    _eofAdsObservador = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        _eofAdsObservador.unobserve(e.target);
        const wrap = e.target.closest("[data-ad-key]");
        const key = wrap && wrap.dataset.adKey;
        if (key) eofAdsSolicitarSlot(e.target.id, key);
      });
    }, { rootMargin: "400px 0px" });
  }
  _eofAdsObservador.observe(div);
}

function initAds() {
  if (!eofAdsPuedeCargar()) return;

  if (EOF_ADS_CONFIG.proveedor === "adsense" && EOF_ADS_CONFIG.adsense.autoAds) {
    eofAdsActivarAutoAds();
  }

  document.querySelectorAll(".eof-ad-contenedor:not([data-ad-solicitado])").forEach((div) => {
    div.setAttribute("data-ad-solicitado", "1");
    eofAdsObservarContenedor(div);
  });
}

// Inserta huecos "entre_noticias" en un listado de tarjetas ya pintado.
function insertarAdsEnGrid(selectorGrid) {
  const grid = typeof selectorGrid === "string" ? document.querySelector(selectorGrid) : selectorGrid;
  if (!grid) return;
  if (!eofAdsSlotConfigurado("entre_noticias")) return;
  const tarjetas = [...grid.children].filter((el) => !el.classList.contains("eof-ad-grid-item"));
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

// Inserta un hueco dentro del texto de una noticia (tras el párrafo
// EOF_ADS_INTEXT_TRAS_PARRAFO), solo si el texto es lo bastante largo.
function insertarAdIntext(cuerpo) {
  const el = typeof cuerpo === "string" ? document.querySelector(cuerpo) : cuerpo;
  if (!el || el.querySelector(".eof-ad-noticia_intext")) return;
  if (!eofAdsSlotConfigurado("noticia_intext")) return;
  const parrafos = [...el.children].filter((n) => n.tagName === "P" && n.textContent.trim().length > 40);
  if (parrafos.length < EOF_ADS_INTEXT_MIN_PARRAFOS) return;
  const ref = parrafos[EOF_ADS_INTEXT_TRAS_PARRAFO - 1];
  if (!ref) return;
  const wrapper = document.createElement("div");
  wrapper.className = "eof-ad-intext-item";
  wrapper.innerHTML = adSlot("noticia_intext");
  ref.insertAdjacentElement("afterend", wrapper);
  initAds();
}

document.addEventListener("DOMContentLoaded", () => {
  initAds();
});

// Si cambia el ancho de ventana, se recalcula el alto reservado de los
// contenedores que aún no se hayan solicitado.
let _eofAdsResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(_eofAdsResizeTimer);
  _eofAdsResizeTimer = setTimeout(() => {
    document.querySelectorAll(".eof-ad-contenedor:not([data-ad-solicitado])").forEach((div) => {
      const wrap = div.closest("[data-ad-key]");
      const key = wrap && wrap.dataset.adKey;
      if (key && EOF_AD_SLOTS[key]) div.style.minHeight = `${eofAdsAltoHueco(key)}px`;
    });
  }, 200);
});
