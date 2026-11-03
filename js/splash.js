// ---------- Pantalla de carga estilo app (splash) ----------
// Se carga en <head>, lo primero de todo, para que aparezca ANTES de que la
// página pinte nada (en vez de la pantalla negra/en blanco).
//
// Solo sale cuando la web está abierta como app (añadida a la pantalla de
// inicio: display-mode standalone, o navigator.standalone en iOS) y una vez
// por sesión de la app: al navegar entre páginas no vuelve a aparecer.
// Para probarla en el navegador: añade ?splash=1 a cualquier URL.
//
// Además registra las imágenes de arranque de iOS (apple-touch-startup-image),
// que son las que Safari enseña mientras abre la app, antes de que corra
// ningún JS (hay que volver a añadir la app al inicio para que iOS las coja).
(function () {
  "use strict";

  var d = document, de = d.documentElement;
  var CLAVE = "eof_splash_visto";
  var MIN_MS = 1100;   // tiempo mínimo en pantalla (que no parpadee)
  var MAX_MS = 7000;   // tope de seguridad si la carga se eterniza

  // ---------- Imágenes de arranque de iOS ----------
  try {
    var iosSizes = [
      [430, 932, 3, "1290x2796"], [393, 852, 3, "1179x2556"], [428, 926, 3, "1284x2778"],
      [390, 844, 3, "1170x2532"], [375, 812, 3, "1125x2436"], [414, 896, 3, "1242x2688"],
      [414, 896, 2, "828x1792"], [414, 736, 3, "1242x2208"], [375, 667, 2, "750x1334"],
      [402, 874, 3, "1206x2622"], [440, 956, 3, "1320x2868"]
    ];
    iosSizes.forEach(function (s) {
      var l = d.createElement("link");
      l.rel = "apple-touch-startup-image";
      l.href = "/img/splash/splash-" + s[3] + ".png";
      l.media = "(device-width: " + s[0] + "px) and (device-height: " + s[1] +
        "px) and (-webkit-device-pixel-ratio: " + s[2] + ") and (orientation: portrait)";
      d.head.appendChild(l);
    });
  } catch (e) {}

  // ---------- ¿Abierta como app? ----------
  var comoApp = false;
  try {
    comoApp =
      (window.matchMedia && (matchMedia("(display-mode: standalone)").matches ||
        matchMedia("(display-mode: fullscreen)").matches ||
        matchMedia("(display-mode: minimal-ui)").matches)) ||
      window.navigator.standalone === true;
  } catch (e) {}
  var forzada = /[?&]splash=1(&|$)/.test(location.search);
  if (!comoApp && !forzada) return;

  try {
    if (!forzada && sessionStorage.getItem(CLAVE)) return;
    sessionStorage.setItem(CLAVE, "1");
  } catch (e) {}

  var esPanel = location.pathname.indexOf("/admin/") === 0;
  var lema = esPanel ? "Redacci\u00f3n" : "El f\u00fatbol que<br>nadie m\u00e1s te cuenta";

  // ---------- Estilos ----------
  var css =
    "#eof-splash{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;" +
    "align-items:center;justify-content:center;overflow:hidden;" +
    "padding:env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0);" +
    "background:radial-gradient(120% 90% at 50% 42%,#1b3a5f 0%,#0c1b2e 52%,#07101d 100%);" +
    "color:#fff;font-family:Oswald,'Arial Narrow',Arial,sans-serif;" +
    "opacity:1;transition:opacity .55s ease,transform .55s ease;will-change:opacity}" +
    "#eof-splash.eof-sp-fuera{opacity:0;transform:scale(1.04);pointer-events:none}" +
    // campo de fútbol muy sutil de fondo
    "#eof-splash .sp-campo{position:absolute;inset:0;opacity:.07;pointer-events:none;" +
    "background:" +
    "radial-gradient(circle at 50% 42%,transparent 0,transparent 118px,rgba(255,255,255,.9) 119px,rgba(255,255,255,.9) 121px,transparent 122px)," +
    "linear-gradient(rgba(255,255,255,.9),rgba(255,255,255,.9)) 50% 42%/100% 2px no-repeat}" +
    "#eof-splash .sp-foco{position:absolute;width:140vmin;height:140vmin;left:50%;top:42%;" +
    "transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;" +
    "background:radial-gradient(circle,rgba(255,255,255,.10) 0%,rgba(255,255,255,0) 60%);" +
    "animation:eofSpFoco 3.2s ease-in-out infinite}" +
    "#eof-splash .sp-centro{position:relative;display:flex;flex-direction:column;align-items:center;" +
    "margin-top:-8vh;text-align:center}" +
    "#eof-splash .sp-logo-wrap{position:relative;width:min(58vw,260px);aspect-ratio:390/367;" +
    "animation:eofSpEntra .9s cubic-bezier(.2,.8,.2,1) both}" +
    "#eof-splash .sp-logo{display:block;width:100%;height:100%;object-fit:contain;" +
    "filter:drop-shadow(0 10px 30px rgba(0,0,0,.45));animation:eofSpRespira 2.6s ease-in-out .9s infinite}" +
    // destello que cruza el logo
    "#eof-splash .sp-brillo{position:absolute;inset:0;overflow:hidden;" +
    "-webkit-mask:url(/img/splash-logo.png) center/contain no-repeat;mask:url(/img/splash-logo.png) center/contain no-repeat}" +
    "#eof-splash .sp-brillo::after{content:'';position:absolute;top:-20%;bottom:-20%;width:38%;left:-50%;" +
    "background:linear-gradient(100deg,transparent,rgba(120,180,255,.75),transparent);" +
    "transform:skewX(-18deg);animation:eofSpBrillo 2.2s ease-in-out 1s infinite}" +
    "#eof-splash .sp-lema{margin-top:22px;font-size:12px;font-weight:500;letter-spacing:.22em;max-width:82vw;line-height:1.6;text-align:center;" +
    "text-transform:uppercase;color:rgba(255,255,255,.72);animation:eofSpFundido .9s ease .5s both;" +
    "padding-left:.22em}" +
    "#eof-splash .sp-barra{position:relative;margin-top:30px;width:min(46vw,190px);height:3px;" +
    "border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden;animation:eofSpFundido .9s ease .7s both}" +
    "#eof-splash .sp-barra::after{content:'';position:absolute;top:0;bottom:0;width:42%;border-radius:3px;" +
    "background:linear-gradient(90deg,rgba(255,255,255,0),#fff 50%,rgba(255,255,255,0));" +
    "animation:eofSpCarga 1.25s cubic-bezier(.45,0,.25,1) infinite}" +
    "#eof-splash .sp-pie{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 26px);" +
    "text-align:center;font:500 11px/1 Oswald,'Arial Narrow',Arial,sans-serif;letter-spacing:.28em;" +
    "color:rgba(255,255,255,.38);text-transform:uppercase;animation:eofSpFundido 1s ease 1s both}" +
    "html.eof-splash-on,html.eof-splash-on body{overflow:hidden!important}" +
    "@keyframes eofSpEntra{from{opacity:0;transform:scale(.82) translateY(14px)}to{opacity:1;transform:none}}" +
    "@keyframes eofSpFundido{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}" +
    "@keyframes eofSpRespira{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}" +
    "@keyframes eofSpFoco{0%,100%{opacity:.7;transform:translate(-50%,-50%) scale(1)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}}" +
    "@keyframes eofSpBrillo{0%{left:-50%}55%,100%{left:130%}}" +
    "@keyframes eofSpCarga{0%{left:-45%}100%{left:105%}}" +
    "@media (prefers-reduced-motion:reduce){#eof-splash *{animation:none!important}" +
    "#eof-splash{transition:opacity .2s ease}}";

  var st = d.createElement("style");
  st.id = "eof-splash-css";
  st.appendChild(d.createTextNode(css));
  (d.head || de).appendChild(st);

  // ---------- Marcado ----------
  var el = d.createElement("div");
  el.id = "eof-splash";
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", "Cargando ELOTROF\u00daTBOLTV");
  el.innerHTML =
    '<div class="sp-campo"></div><div class="sp-foco"></div>' +
    '<div class="sp-centro">' +
      '<div class="sp-logo-wrap">' +
        '<img class="sp-logo" src="/img/splash-logo.png" alt="" width="390" height="367" decoding="async">' +
        '<div class="sp-brillo"></div>' +
      '</div>' +
      '<div class="sp-lema">' + lema + '</div>' +
      '<div class="sp-barra"></div>' +
    '</div>' +
    '<div class="sp-pie">elotrofutbol.media</div>';

  de.classList.add("eof-splash-on");
  de.appendChild(el);

  // ---------- Cierre ----------
  var inicio = Date.now();
  var cerrado = false;

  function cerrar() {
    if (cerrado) return;
    cerrado = true;
    el.classList.add("eof-sp-fuera");
    setTimeout(function () {
      de.classList.remove("eof-splash-on");
      if (el.parentNode) el.parentNode.removeChild(el);
      if (st.parentNode) st.parentNode.removeChild(st);
    }, 650);
  }

  function cuandoListo() {
    var resto = MIN_MS - (Date.now() - inicio);
    setTimeout(cerrar, resto > 0 ? resto : 0);
  }

  if (d.readyState === "complete") cuandoListo();
  else window.addEventListener("load", cuandoListo, { once: true });
  setTimeout(cerrar, MAX_MS);
})();
