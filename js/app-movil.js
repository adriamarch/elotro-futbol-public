/* ELOTROFÚTBOLTV · Modo APP en móvil. Construye barra inferior, hoja "Más",
   buscador a pantalla completa y chips. Solo actúa visualmente en ≤900px
   (el CSS oculta todo lo demás). Cargar con defer al final del <head>. */
(function () {
  "use strict";
  var MQ = window.matchMedia("(max-width:900px)");
  var B = "/";
  var ic = function (d) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + "</svg>";
  };
  var ICON = {
    inicio: ic('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
    partidos: ic('<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
    tablas: ic('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    buscar: ic('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    mas: ic('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
    guardadas: ic('<path d="M6 3h12v18l-6-4-6 4z"/>'),
    cuenta: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6 8-6s7 1.5 8 6"/>'),
    stats: ic('<path d="M5 20V12M12 20V5M19 20v-5"/>'),
    porras: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    rapidas: ic('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
    galeria: ic('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>'),
    podcast: ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>')
  };
  var CATS = [
    ["Todo", "", "inicio"],
    ["Hypermotion", "categoria?cat=hypermotion", "hypermotion"],
    ["1ª Federación", "categoria?cat=primera_federacion", "primera_federacion"],
    ["2ª Federación", "categoria?cat=segunda_federacion", "segunda_federacion"],
    ["3ª Federación", "categoria?cat=tercera_federacion", "tercera_federacion"],
    ["Copa del Rey", "categoria?cat=copa_del_rey", "copa_del_rey"],
    ["Copa Federación", "categoria?cat=copa_federacion", "copa_federacion"],
    ["Arbitraje", "categoria?cat=arbitraje", "arbitraje"],
    ["Jurisdicción", "categoria?cat=jurisdiccion", "jurisdiccion"]
  ];
  var TABS = [
    ["inicio", "Inicio", "", ["inicio", "categoria", "noticia"]],
    ["partidos", "Partidos", "calendario", ["calendario", "minuto-a-minuto"]],
    ["tablas", "Tablas", "clasificacion", ["clasificacion", "estadisticas"]]
  ];

  /* Páginas de acceso (login) y de formularios: sin barra inferior, para que nada
     tape los campos ni los botones de enviar. */
  var SIN_BARRA = ["acceso", "recuperar-cuenta", "verificar-cuenta", "formulario", "acreditacion"];
  function sinBarra() {
    var path = location.pathname.replace(/\.html$/, "").replace(/^\//, "").replace(/\/$/, "");
    for (var i = 0; i < SIN_BARRA.length; i++) {
      if (path === SIN_BARRA[i] || path.indexOf(SIN_BARRA[i] + "/") === 0) return true;
    }
    return false;
  }
  /* La clase se pone ya, sin esperar al DOM, para que el CSS quite el hueco de la barra desde el primer pintado. */
  if (sinBarra()) document.documentElement.classList.add("eof-sin-barra");

  function pagina() { return (document.body && document.body.dataset.page) || ""; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function paginaActiva(claves) {
    var p = pagina();
    var path = location.pathname.replace(/\.html$/, "").replace(/^\//, "");
    // Las noticias se sirven en /futbol/{categoria}/{slug} (el worker las reescribe a noticia.html) y
    // noticia.html pone data-page = categoria del articulo (p. ej. "hypermotion") cuando llega la API,
    // asi que ni la ruta ni data-page coincidian con "noticia" y NINGUNA pestana quedaba activa:
    // liquid-glass.js no tenia pestana donde colocar la lente y la ocultaba. Leer una noticia = Inicio.
    var leyendoNoticia = /^futbol\//.test(path) || path === "noticia";
    return claves.indexOf(p) > -1 || claves.indexOf(path) > -1 ||
      (claves.indexOf("inicio") > -1 && (path === "" || leyendoNoticia));
  }

  function temaOscuro() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function sincronizarThemeColor() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
    m.content = temaOscuro() ? "#11161f" : "#ffffff";
  }
  function alternarTema() {
    var b = document.getElementById("themeToggle");
    if (b) b.click();
    else if (window.EOFTema && EOFTema.fijar) EOFTema.fijar(temaOscuro() ? "light" : "dark");
    setTimeout(sincronizarThemeColor, 50);
  }

  /* ---------- Hoja "Más" ---------- */
  function sheetHTML() {
    var items = (typeof NAV_MENU !== "undefined" ? NAV_MENU : []);
    var grupos = items.filter(function (e) { return e.tipo === "grupo"; }).map(function (g) {
      return "<h3>" + esc(g.label) + '</h3><ul class="eof-lista">' + g.items.map(function (it) {
        var act = pagina() === it.key ? "activo" : "";
        return '<li><a class="' + act + '" href="' + B + it.href + '">' + esc(it.label) + "<span>›</span></a></li>";
      }).join("") + "</ul>";
    }).join("");
    var at = function (href, icono, txt) { return '<a class="eof-atajo" href="' + B + href + '">' + ICON[icono] + txt + "</a>"; };
    var lector = null;
    try { lector = typeof sesionLectorActual === "function" ? sesionLectorActual() : null; } catch (e) {}
    return '<div class="eof-sheet-asa"></div><div class="eof-sheet-cuerpo">' +
      '<div class="eof-atajos">' +
      at("guardadas", "guardadas", "Guardadas") +
      at(lector ? "cuenta" : "acceso", "cuenta", lector ? "Mi cuenta" : "Acceso") +
      at("estadisticas", "stats", "Estadísticas") +
      at("predicciones", "porras", "Porras") +
      at("noticias-rapidas", "rapidas", "Rápidas") +
      at("galerias", "galeria", "Galerías") +
      at("podcast", "podcast", "Podcast") +
      '</div>' + grupos +
      '<h3>Apariencia</h3><ul class="eof-lista"><li><button type="button" data-eof="tema">Modo oscuro<span class="eof-interruptor"></span></button></li></ul>' +
      '<div class="eof-legal"><a href="' + B + 'quienes-somos">Quiénes somos</a><a href="' + B + 'contacto">Contacto</a>' +
      '<a href="' + B + 'politica-privacidad">Privacidad</a><a href="' + B + 'politica-cookies">Cookies</a>' +
      '<button type="button" data-eof="cookies">Configurar cookies</button></div></div>';
  }
  function abrirSheet() { cerrarBuscar(); document.body.classList.add("eof-sheet-abierta"); }
  function cerrarSheet() { document.body.classList.remove("eof-sheet-abierta"); }

  /* ---------- Buscador ---------- */
  function abrirBuscar() {
    var box = document.getElementById("searchBox");
    var input = document.getElementById("searchInput");
    if (!box || !input) { location.href = B + "buscar"; return; }
    cerrarSheet();
    if (!box.querySelector(".eof-buscar-cerrar")) {
      var c = document.createElement("button");
      c.type = "button"; c.className = "eof-buscar-cerrar"; c.textContent = "Cancelar";
      c.addEventListener("click", cerrarBuscar);
      box.insertBefore(c, input.nextSibling);
    }
    document.body.classList.add("eof-buscar-abierto");
    setTimeout(function () { input.focus(); }, 60);
  }
  function cerrarBuscar() { document.body.classList.remove("eof-buscar-abierto"); }

  function construirChips() {
    var p = pagina();
    var cat = /^(hypermotion|primera_federacion|segunda_federacion|tercera_federacion|copa_del_rey|copa_federacion|arbitraje|jurisdiccion)$/.test(p);
    if (!(p === "inicio" || cat)) return;
    var intentos = 0;
    (function intentar() {
      var header = document.querySelector("body > main, main");
      if (!header) { if (intentos++ < 40) setTimeout(intentar, 100); return; }
      if (document.querySelector(".eof-chips")) return;
      var c = document.createElement("div");
      c.className = "eof-chips"; c.setAttribute("role", "navigation"); c.setAttribute("aria-label", "Categorías");
      c.innerHTML = CATS.map(function (k) {
        var act = k[2] === p || (k[2] === "inicio" && p === "inicio");
        return '<a class="eof-chip' + (act ? " activo" : "") + '" href="' + B + k[1] + '">' + esc(k[0]) + "</a>";
      }).join("");
      header.insertAdjacentElement("beforebegin", c);
      var ac = c.querySelector(".activo");
      if (ac) c.scrollLeft = Math.max(0, ac.offsetLeft - 24);
    })();
  }

  /* ---------- Construcción ---------- */
  function construir() {
    if (sinBarra()) return; /* login y formularios: ni barra, ni hoja "Más", ni buscador */
    if (document.getElementById("eofTabbar")) return;
    var nav = document.createElement("nav");
    nav.className = "eof-tabbar"; nav.id = "eofTabbar"; nav.setAttribute("aria-label", "Navegación principal");
    nav.innerHTML = TABS.map(function (t) {
      var act = paginaActiva(t[3]);
      return '<a class="eof-tab' + (act ? " activo" : "") + '" href="' + B + t[2] + '"' + (act ? ' aria-current="page"' : "") + ">" + ICON[t[0]] + t[1] + "</a>";
    }).join("") +
      '<button type="button" class="eof-tab" data-eof="buscar">' + ICON.buscar + "Buscar</button>" +
      '<button type="button" class="eof-tab" data-eof="mas" aria-haspopup="dialog">' + ICON.mas + "Más</button>";
    document.body.appendChild(nav);

    var fondo = document.createElement("div");
    fondo.className = "eof-sheet-fondo"; fondo.addEventListener("click", cerrarSheet);
    var sheet = document.createElement("div");
    sheet.className = "eof-sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-label", "Más opciones");
    sheet.innerHTML = sheetHTML();
    document.body.appendChild(fondo); document.body.appendChild(sheet);

    document.addEventListener("click", function (e) {
      var t = e.target.closest("[data-eof]");
      if (!t) { if (e.target.closest(".eof-sheet a")) cerrarSheet(); return; }
      var a = t.getAttribute("data-eof");
      if (a === "buscar") abrirBuscar();
      else if (a === "mas") (document.body.classList.contains("eof-sheet-abierta") ? cerrarSheet : abrirSheet)();
      else if (a === "tema") alternarTema();
      else if (a === "cookies") { cerrarSheet(); if (window.eofAbrirPreferenciasCookies) window.eofAbrirPreferenciasCookies(); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { cerrarSheet(); cerrarBuscar(); } });

    /* Deslizar hacia abajo la hoja para cerrarla */
    var y0 = null;
    sheet.addEventListener("touchstart", function (e) { if (sheet.querySelector(".eof-sheet-cuerpo").scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener("touchend", function (e) {
      if (y0 !== null && e.changedTouches[0].clientY - y0 > 80) cerrarSheet(); y0 = null;
    }, { passive: true });

    /* Con el teclado abierto la barra inferior estorba: se aparta mientras hay un campo enfocado */
    var esCampo = function (el) { return el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(checkbox|radio|button|submit|file|range|color)$/.test(el.type || ""); };
    document.addEventListener("focusin", function (e) { if (esCampo(e.target) && MQ.matches && !document.body.classList.contains("eof-buscar-abierto")) document.body.classList.add("eof-teclado"); });
    document.addEventListener("focusout", function () { setTimeout(function () { if (!esCampo(document.activeElement)) document.body.classList.remove("eof-teclado"); }, 120); });

    construirChips();
    sincronizarThemeColor();
  }


  /* ---------- Pulido de producto ---------- */
  function metasApp() {
    var add = function (n, v) { if (!document.querySelector('meta[name="' + n + '"]')) { var m = document.createElement("meta"); m.name = n; m.content = v; document.head.appendChild(m); } };
    add("mobile-web-app-capable", "yes");
    add("apple-mobile-web-app-capable", "yes");
    add("apple-mobile-web-app-title", "ElOtroFútbol");
    add("apple-mobile-web-app-status-bar-style", "default");
    add("format-detection", "telephone=no");
  }
  /* Cabecera: se oculta al bajar y reaparece al subir (como en una app nativa) */
  function cabeceraInteligente() {
    var ultimo = window.scrollY, tick = false;
    window.addEventListener("scroll", function () {
      if (tick) return; tick = true;
      requestAnimationFrame(function () {
        tick = false;
        if (!MQ.matches) { document.body.classList.remove("eof-header-oculto"); return; }
        var y = window.scrollY, d = y - ultimo;
        if (Math.abs(d) < 8) return;
        document.body.classList.toggle("eof-header-oculto", d > 0 && y > 90);
        ultimo = y;
      });
    }, { passive: true });
  }
  /* Progreso de lectura en la página de noticia */
  function progresoLectura() {
    if (!/noticia|\/futbol\//.test(location.pathname)) return;
    var b = document.createElement("div"); b.className = "eof-progreso"; b.setAttribute("aria-hidden", "true");
    document.body.appendChild(b);
    var tick = false;
    var calc = function () {
      tick = false;
      var h = document.documentElement.scrollHeight - innerHeight;
      b.style.transform = "scaleX(" + (h > 0 ? Math.min(1, Math.max(0, scrollY / h)) : 0) + ")";
    };
    window.addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(calc); } }, { passive: true });
  }

  function iniciar() {
    metasApp(); cabeceraInteligente(); progresoLectura();
    /* layout.js pinta cabecera y NAV_MENU en DOMContentLoaded; esperamos un tick */
    setTimeout(construir, 0);
    new MutationObserver(sincronizarThemeColor).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    MQ.addEventListener && MQ.addEventListener("change", function () { cerrarSheet(); cerrarBuscar(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
