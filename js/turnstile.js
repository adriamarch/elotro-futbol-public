// Antispam con Cloudflare Turnstile para los formularios públicos
// (comentarios de visitantes, registro de lectores y contacto).
//
// ACTIVACIÓN (2 pasos, hasta entonces no hace nada y todo funciona como antes):
//   1) En el panel de Cloudflare > Turnstile crea un widget para elotrofutbol.media
//      y pega aquí la "Site key" (es pública).
//   2) Guarda la "Secret key" en los dos workers (principal y secundario):
//        wrangler secret put TURNSTILE_SECRET_KEY
//      (en Railway, como variable de entorno TURNSTILE_SECRET_KEY).
//   IMPORTANTE: el servidor ya NO deja pasar los envíos si falta el secreto
//   (falla cerrado). El secreto debe estar en los dos workers antes de desplegar.
(function () {
  var SITE_KEY = "0x4AAAAAAFT8cS2fVI01QV_i"; // <- pega aquí la Site key de Turnstile

  var scriptCargando = null;
  try {
    if (SITE_KEY && document.head && !document.querySelector("link[data-eof-ts]")) {
      var l = document.createElement("link");
      l.rel = "preconnect"; l.href = "https://challenges.cloudflare.com"; l.setAttribute("data-eof-ts", "");
      document.head.appendChild(l);
    }
  } catch (e) {}
  var widgets = new WeakMap(); // contenedor -> id del widget

  function cargarScript() {
    if (scriptCargando) return scriptCargando;
    scriptCargando = new Promise(function (ok, ko) {
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.onload = ok;
      s.onerror = ko;
      document.head.appendChild(s);
    });
    return scriptCargando;
  }

  // Dibuja el widget en un contenedor. "interaction-only": el visitante solo
  // ve algo si Cloudflare necesita que haga una comprobación; lo normal es
  // que sea invisible.
  function montar(cont) {
    trampa(cont); // campo señuelo anti-bots dentro del formulario
    if (!SITE_KEY || !cont || widgets.has(cont)) return;
    cargarScript().then(function () {
      if (!window.turnstile || widgets.has(cont)) return;
      widgets.set(cont, window.turnstile.render(cont, {
        sitekey: SITE_KEY,
        appearance: "interaction-only",
        size: "flexible",
        theme: "auto",
        language: "es",
        retry: "auto",
        "refresh-expired": "auto",
        "refresh-timeout": "auto",
        // Si el widget falla o caduca se vuelve a pedir un token solo.
        "error-callback": function () { setTimeout(function () { reiniciar(cont); }, 1500); },
        "expired-callback": function () { reiniciar(cont); }
      }));
    }).catch(function () { /* sin red: el servidor decidirá */ });
  }

  function token(cont) {
    try {
      if (!SITE_KEY || !cont || !widgets.has(cont)) return "";
      return window.turnstile.getResponse(widgets.get(cont)) || "";
    } catch (e) { return ""; }
  }

  // Espera (hasta 12 s) a que el widget tenga token; si aún no estaba montado lo
  // monta (formularios que se abren después, como el modal de newsletter). Sin
  // Site key devuelve "" al instante.
  function esperarToken(cont) {
    if (!SITE_KEY || !cont) return Promise.resolve("");
    montar(cont);
    return new Promise(function (resolver) {
      var intentos = 0, reiniciado = false;
      (function sondear() {
        var t = token(cont);
        if (t) return resolver(t);
        intentos++;
        // A los 8 s sin token se pide uno nuevo (el primero pudo atascarse).
        if (intentos === 80 && !reiniciado) { reiniciado = true; reiniciar(cont); }
        if (intentos > 200) return resolver("");
        setTimeout(sondear, 100);
      })();
    });
  }

  // Precalienta el widget (carga el script y resuelve el reto) para que el
  // token ya esté listo cuando la persona pulse "Enviar".
  function precalentar(cont) { if (cont) montar(cont); }

  // Campo trampa (honeypot): invisible para personas; los bots que rellenan todo
  // lo que ven en el DOM lo completan y el servidor descarta el envío.
  function trampa(cont) {
    try {
      var f = cont && cont.closest ? cont.closest("form") : null;
      if (!f) return "";
      var i = f.querySelector("input[data-eof-trampa]");
      if (!i) {
        i = document.createElement("input");
        i.type = "text"; i.name = "web"; i.tabIndex = -1; i.autocomplete = "off";
        i.setAttribute("aria-hidden", "true"); i.setAttribute("data-eof-trampa", "");
        i.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
        f.appendChild(i);
      }
      return i.value || "";
    } catch (e) { return ""; }
  }

  // Cada token es de un solo uso: tras enviar el formulario hay que pedir otro.
  function reiniciar(cont) {
    try { if (cont && widgets.has(cont)) window.turnstile.reset(widgets.get(cont)); } catch (e) {}
  }

  function iniciar() {
    var conts = document.querySelectorAll("[data-eof-turnstile]");
    for (var i = 0; i < conts.length; i++) montar(conts[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();

  window.EOFTurnstile = { activo: !!SITE_KEY, montar: montar, token: token, esperarToken: esperarToken, reiniciar: reiniciar, trampa: trampa, precalentar: precalentar };
})();
