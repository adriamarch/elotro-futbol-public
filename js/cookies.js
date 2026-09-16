// ============================================================================
// ELOTROFÚTBOLTV — Aviso de cookies / plataforma de consentimiento (CMP)
// ============================================================================
// Banner propio de consentimiento de cookies, con tres categorías:
//   - necesarias  -> siempre activas (sesión, preferencias básicas del
//                    sitio como el tema claro/oscuro); no se pueden desactivar.
//   - analiticas  -> medición de audiencia (ver js/analiticas-tracking.js).
//   - publicidad  -> anuncios personalizados vía Google Ad Manager/AdSense
//                    con header bidding (ver js/ads.js).
//
// Se implementa Google Consent Mode v2 (gtag "consent"): se fija el estado
// por defecto ANTES de cargar cualquier script de Google (analítica o
// anuncios) a "denegado", y solo se actualiza a "concedido" cuando la
// persona acepta esa categoría. Esto es lo que exige Google desde marzo de
// 2024 para servir anuncios y analítica a usuarios en el Espacio Económico
// Europeo/Reino Unido sin arriesgarse a perder el servicio.
//
// Enlace con el resto del sistema:
//   - EOF_ADS_CONFIG.esperarConsentimiento (en ads.js) debe ponerse a
//     `true` para que initAds() no dispare nada hasta que
//     window.EOF_CONSENTIMIENTO_PUBLICIDAD sea true.
//   - Este archivo fija window.EOF_CONSENTIMIENTO_PUBLICIDAD y
//     window.EOF_CONSENTIMIENTO_ANALITICA, y dispara los eventos
//     "eof:consentimiento-publicidad" y "eof:consentimiento-analitica"
//     para que ads.js/analiticas-tracking.js puedan reaccionar en caliente
//     si el usuario cambia sus preferencias después de la primera carga.
// ============================================================================

const EOF_COOKIES_STORAGE_KEY = "eof_consentimiento_cookies";
const EOF_COOKIES_VERSION = "1"; // súbelo si cambian las categorías/textos, para volver a pedir consentimiento

window.EOF_CONSENTIMIENTO_ANALITICA = false;
window.EOF_CONSENTIMIENTO_PUBLICIDAD = false;

// ---------- Google Consent Mode v2 ----------
// gtag/dataLayer se inicializan aquí mismo (no hace falta esperar a que
// analiticas-tracking.js o ads.js carguen su propio gtag.js): así el
// estado "denegado por defecto" queda fijado antes de que llegue ninguna
// petición a Google, tal y como exige Consent Mode.
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
window.eofGtagConsentMode = gtag;

gtag("consent", "default", {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
  // "wait_for_update": da hasta 500ms a que se aplique la decisión ya
  // guardada (ver eofCookiesAplicarConsentimiento) antes del primer envío,
  // para no mandar un primer hit ya "denegado" si el usuario ya había
  // aceptado en una visita anterior.
  wait_for_update: 500,
});

function eofCookiesLeerPreferencias() {
  try {
    const guardado = JSON.parse(localStorage.getItem(EOF_COOKIES_STORAGE_KEY) || "null");
    if (!guardado || guardado.version !== EOF_COOKIES_VERSION) return null;
    return guardado;
  } catch {
    return null;
  }
}

function eofCookiesGuardarPreferencias(analiticas, publicidad) {
  const datos = {
    version: EOF_COOKIES_VERSION,
    necesarias: true,
    analiticas: !!analiticas,
    publicidad: !!publicidad,
    fecha: new Date().toISOString(),
  };
  try {
    localStorage.setItem(EOF_COOKIES_STORAGE_KEY, JSON.stringify(datos));
  } catch {
    // Si no se puede persistir, se aplica igualmente para esta carga de
    // página (ver eofCookiesAplicarConsentimiento) aunque se vuelva a
    // preguntar en la siguiente visita.
  }
  return datos;
}

function eofCookiesAplicarConsentimiento(analiticas, publicidad) {
  window.EOF_CONSENTIMIENTO_ANALITICA = !!analiticas;
  window.EOF_CONSENTIMIENTO_PUBLICIDAD = !!publicidad;

  gtag("consent", "update", {
    analytics_storage: analiticas ? "granted" : "denied",
    ad_storage: publicidad ? "granted" : "denied",
    ad_user_data: publicidad ? "granted" : "denied",
    ad_personalization: publicidad ? "granted" : "denied",
  });

  document.dispatchEvent(new CustomEvent("eof:consentimiento-analitica", { detail: { concedido: !!analiticas } }));
  document.dispatchEvent(new CustomEvent("eof:consentimiento-publicidad", { detail: { concedido: !!publicidad } }));

  // Si ads.js ya está cargado y esperando (EOF_ADS_CONFIG.esperarConsentimiento
  // = true), esto es lo que le hace falta para arrancar initAds() de verdad.
  if (publicidad && typeof initAds === "function") initAds();
}

// ---------- Banner y modal de preferencias ----------

function eofCookiesBannerHTML() {
  return `
    <div id="eof-cookies-banner" role="dialog" aria-live="polite" aria-label="Aviso de cookies">
      <p class="eof-cookies-texto">
        Usamos cookies propias y de terceros para el funcionamiento del sitio,
        medir la audiencia y mostrar publicidad (incluida publicidad
        personalizada a través de Google y sus socios de header bidding).
        Puedes aceptarlas todas, rechazar las no necesarias o
        <button type="button" class="eof-cookies-config-link" onclick="eofCookiesAbrirModal()">configurar tus preferencias</button>.
        Más información en nuestra <a href="${eofCookiesBaseHref()}politica-cookies.html">política de cookies</a>.
      </p>
      <div class="eof-cookies-botones">
        <button type="button" class="eof-cookie-preferencias" onclick="eofCookiesAbrirModal()">Configurar</button>
        <button type="button" class="eof-cookie-rechazar" onclick="eofCookiesRechazarTodo()">Rechazar no necesarias</button>
        <button type="button" class="eof-cookie-aceptar" onclick="eofCookiesAceptarTodo()">Aceptar todas</button>
      </div>
    </div>`;
}

function eofCookiesModalHTML(prefsActuales) {
  const analiticas = prefsActuales ? prefsActuales.analiticas : false;
  const publicidad = prefsActuales ? prefsActuales.publicidad : false;
  return `
    <div class="eof-cookies-modal" id="eofCookiesModal">
      <div class="eof-cookies-modal-fondo" onclick="eofCookiesCerrarModal()"></div>
      <div class="eof-cookies-modal-caja" role="dialog" aria-modal="true" aria-labelledby="eofCookiesModalTitulo">
        <button type="button" class="eof-cookies-cerrar" onclick="eofCookiesCerrarModal()" aria-label="Cerrar">✕</button>
        <h3 id="eofCookiesModalTitulo">Preferencias de cookies</h3>
        <p>Elige qué categorías de cookies quieres permitir. Puedes cambiar esta decisión en cualquier momento desde el enlace "Cookies" en el pie de página.</p>

        <div class="eof-cookie-categoria">
          <div class="eof-cookie-categoria-info">
            <h4>Necesarias</h4>
            <p>Imprescindibles para el funcionamiento del sitio (sesión, preferencia de tema claro/oscuro). No se pueden desactivar.</p>
          </div>
          <label class="eof-cookie-switch">
            <input type="checkbox" checked disabled>
            <span class="track"></span>
          </label>
        </div>

        <div class="eof-cookie-categoria">
          <div class="eof-cookie-categoria-info">
            <h4>Analíticas</h4>
            <p>Nos permiten medir el tráfico y el uso del sitio para mejorarlo.</p>
          </div>
          <label class="eof-cookie-switch">
            <input type="checkbox" id="eofCookieToggleAnaliticas" ${analiticas ? "checked" : ""}>
            <span class="track"></span>
          </label>
        </div>

        <div class="eof-cookie-categoria">
          <div class="eof-cookie-categoria-info">
            <h4>Publicidad</h4>
            <p>Permiten mostrar publicidad personalizada a través de Google Ad Manager/AdSense y sus socios de header bidding.</p>
          </div>
          <label class="eof-cookie-switch">
            <input type="checkbox" id="eofCookieTogglePublicidad" ${publicidad ? "checked" : ""}>
            <span class="track"></span>
          </label>
        </div>

        <div class="eof-cookies-modal-acciones">
          <button type="button" onclick="eofCookiesRechazarTodo()">Rechazar no necesarias</button>
          <button type="button" class="eof-cookie-guardar" onclick="eofCookiesGuardarDesdeModal()">Guardar preferencias</button>
        </div>
      </div>
    </div>`;
}

function eofCookiesBaseHref() {
  return "/";
}

function eofCookiesMostrarBanner() {
  if (document.getElementById("eof-cookies-banner")) return;
  document.body.insertAdjacentHTML("beforeend", eofCookiesBannerHTML());
}

function eofCookiesOcultarBanner() {
  const banner = document.getElementById("eof-cookies-banner");
  if (banner) banner.remove();
}

function eofCookiesAbrirModal() {
  let modal = document.getElementById("eofCookiesModal");
  if (!modal) {
    document.body.insertAdjacentHTML("beforeend", eofCookiesModalHTML(eofCookiesLeerPreferencias()));
    modal = document.getElementById("eofCookiesModal");
  }
  modal.classList.add("abierto");
}

function eofCookiesCerrarModal() {
  const modal = document.getElementById("eofCookiesModal");
  if (modal) modal.classList.remove("abierto");
}

function eofCookiesAceptarTodo() {
  eofCookiesGuardarPreferencias(true, true);
  eofCookiesAplicarConsentimiento(true, true);
  eofCookiesOcultarBanner();
  eofCookiesCerrarModal();
}

function eofCookiesRechazarTodo() {
  eofCookiesGuardarPreferencias(false, false);
  eofCookiesAplicarConsentimiento(false, false);
  eofCookiesOcultarBanner();
  eofCookiesCerrarModal();
}

function eofCookiesGuardarDesdeModal() {
  const analiticas = document.getElementById("eofCookieToggleAnaliticas").checked;
  const publicidad = document.getElementById("eofCookieTogglePublicidad").checked;
  eofCookiesGuardarPreferencias(analiticas, publicidad);
  eofCookiesAplicarConsentimiento(analiticas, publicidad);
  eofCookiesOcultarBanner();
  eofCookiesCerrarModal();
}

// Se expone para el enlace "Cookies" del pie de página (ver layout.js):
// permite reabrir el selector de preferencias en cualquier momento, no
// solo la primera vez que se visita el sitio.
window.eofAbrirPreferenciasCookies = eofCookiesAbrirModal;

function eofCookiesInit() {
  const guardado = eofCookiesLeerPreferencias();
  if (guardado) {
    eofCookiesAplicarConsentimiento(guardado.analiticas, guardado.publicidad);
    return;
  }
  eofCookiesMostrarBanner();
}

document.addEventListener("DOMContentLoaded", eofCookiesInit);
