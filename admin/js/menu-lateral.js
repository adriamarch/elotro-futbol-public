// ---------- Menú lateral del panel ----------
// Sustituye visualmente a la barra de pestañas superior y al menú interno de
// "Funcionalidades". NO mueve bloques ni cambia ids: cada entrada del menú
// hace click en el botón de pestaña/subpestaña que ya existía, así que los
// enlaces ?ir=..., el tutorial y los badges siguen funcionando igual.
// Quién ve qué se deduce de lo que admin.js / rol-inicial.js ya oculta en los
// botones originales (no se duplican permisos aquí).
(function () {
  "use strict";

  var ICONOS = {
    noticias: '<path d="M19 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z"/><path d="M8 9h8M8 13h8M8 17h4"/>',
    resultados: '<circle cx="12" cy="12" r="9"/><path d="M12 7.2l3.6 2.6-1.4 4.2h-4.4l-1.4-4.2z"/>',
    contenido: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    encuestas: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
    equipos: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    jugadores: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>',
    check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    feedback: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="m9 10 2 2 4-4"/>',
    podcast: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    voto: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V8l3-5 4 4v4"/><path d="m9 16 2 2 4-4"/>',
    tienda: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    comentarios: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    anuncio: '<path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1z"/><path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13"/>',
    usuarios: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    red: '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.6 10.6l6.8-3.2M8.6 13.4l6.8 3.2"/>',
    grafico: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'
  };

  // tab/sub = botón original a pulsar; subs = subpestañas que cuentan como "esta entrada".
  // badge = id del contador original que se refleja en la entrada.
  var GRUPOS = [
    { titulo: "Redacción", items: [
      { t: "Noticias", ic: "noticias", tab: "noticias", sub: "nueva", subs: ["nueva", "lista", "noticiasRapidas"] },
      { t: "Resultados", ic: "resultados", tab: "resultados", sub: "resultado", badge: "badgeResultadosAnulados" },
      { t: "Contenido", ic: "contenido", tab: "contenido", sub: "subir" },
      { t: "Podcast", ic: "podcast", tab: "podcast" },
      { t: "Encuestas", ic: "encuestas", tab: "funcionalidades", sub: "encuestas" },
      { t: "Equipos", ic: "equipos", tab: "funcionalidades", sub: "equipos" },
      { t: "Propuestas de fichas", ic: "equipos", tab: "solicitudes", sub: "propuestasEquipos", badge: "badgeSolPropuestasEquipos" },
      { t: "Jugadores", ic: "jugadores", tab: "funcionalidades", sub: "jugadores" }
    ]},
    { titulo: "Equipo", items: [
      { t: "Solicitudes de edición", ic: "check", tab: "solicitudes", sub: "solicitudesRecibidas", subs: ["solicitudesRecibidas", "solicitudesMias"], badge: "badgeSolicitudesPendientes" },
      { t: "Feedback", ic: "feedback", tab: "feedback", badge: "badgeFeedbackNoLeidos" },
      { t: "Votaciones", ic: "voto", tab: "votaciones", badge: "badgeVotPendientes" },
      { t: "Tienda", ic: "tienda", tab: "tienda", badge: "badgeTiendaPendientes" },
      { t: "Información y organigrama", ic: "info", tab: "funcionalidades", sub: "informacion" }
    ]},
    { titulo: "Audiencia", items: [
      { t: "Comentarios", ic: "comentarios", tab: "funcionalidades", sub: "comentarios", badge: "badgeFuncComentarios" },
      { t: "Newsletter", ic: "mail", tab: "funcionalidades", sub: "newsletter" },
      { t: "Anuncios", ic: "anuncio", tab: "funcionalidades", sub: "anuncios" },
      { t: "Lectores", ic: "usuarios", tab: "usuarios", sub: "lectores" }
    ]},
    { titulo: "Administración", items: [
      { t: "Colaboradores", ic: "usuarios", tab: "usuarios", sub: "redactores" },
      { t: "Formularios", ic: "check", tab: "solicitudes", sub: "formularios" },
      { t: "Responsabilidades", ic: "check", tab: "funcionalidades", sub: "responsabilidades" },
      { t: "Redes sociales", ic: "red", tab: "funcionalidades", sub: "redesSociales" },
      { t: "Historial", ic: "reloj", tab: "funcionalidades", sub: "historial" },
      { t: "Analíticas", ic: "grafico", tab: "analiticas" }
    ]}
  ];

  var nav, barra, bar_txt, entradas = [];
  var esAdmin = false;
  try { var u = JSON.parse(localStorage.getItem("eof_user") || "null"); esAdmin = !!u && u.rol === "admin"; } catch (e) {}

  function oculto(el) {
    return !el || window.getComputedStyle(el).display === "none";
  }
  function btnTab(tab) { return document.querySelector('.tabs button[data-tab="' + tab + '"]'); }
  function btnSub(tab, sub) { return document.querySelector("#panel-" + tab + ' .subtabs button[data-subtab="' + sub + '"]'); }

  function visible(e) {
    if (e.href) return esAdmin;
    if (oculto(btnTab(e.tab))) return false;
    if (e.sub && oculto(btnSub(e.tab, e.sub))) return false;
    return true;
  }

  function activa(e) {
    if (e.href) return false;
    var b = btnTab(e.tab);
    if (!b || !b.classList.contains("activo")) return false;
    if (!e.sub) return true;
    var lista = e.subs || [e.sub];
    return lista.some(function (s) {
      var sb = btnSub(e.tab, s);
      return sb && sb.classList.contains("activo");
    });
  }

  function construir() {
    nav = document.createElement("nav");
    nav.id = "menuLateral";
    nav.setAttribute("aria-label", "Secciones del panel");
    GRUPOS.forEach(function (g) {
      var sec = document.createElement("div");
      sec.className = "ml-grupo";
      var h = document.createElement("div");
      h.className = "ml-titulo";
      h.textContent = g.titulo;
      sec.appendChild(h);
      g.items.forEach(function (it) {
        var el = document.createElement(it.href ? "a" : "button");
        if (it.href) el.href = it.href; else el.type = "button";
        el.className = "ml-item";
        el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONOS[it.ic] || "") + '</svg><span class="ml-txt"></span><span class="ml-badge tab-badge-pendientes" style="display:none">0</span>';
        el.querySelector(".ml-txt").textContent = it.t;
        if (!it.href) el.addEventListener("click", function () { ir(it); });
        sec.appendChild(el);
        entradas.push({ it: it, el: el, grupo: sec, titulo: g.titulo });
      });
      nav.appendChild(sec);
    });
    var fondo = document.createElement("div");
    fondo.id = "menuLateralFondo";
    fondo.addEventListener("click", cerrar);

    barra = document.createElement("div");
    barra.id = "menuLateralBarra";
    barra.innerHTML = '<button type="button" id="menuLateralAbrir" aria-label="Abrir menú de secciones" aria-expanded="false" aria-controls="menuLateral"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><span id="menuLateralActual"></span>';
    bar_txt = barra.querySelector("#menuLateralActual");
    barra.querySelector("button").addEventListener("click", function () {
      document.body.classList.contains("ml-abierto") ? cerrar() : abrir();
    });

    // Pestañita del borde para ocultar/mostrar el menú en ordenador (en móvil ya es un cajón).
    var alt = document.createElement("button");
    alt.type = "button";
    alt.id = "menuLateralAlternar";
    alt.setAttribute("aria-controls", "menuLateral");
    alt.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
    alt.addEventListener("click", function () {
      if (window.EOFPrefs && window.EOFPrefs.fijar) window.EOFPrefs.fijar("menuVisible", menuOculto());
    });

    var cab = document.querySelector(".admin-header");
    if (cab && cab.parentNode) {
      cab.parentNode.insertBefore(alt, cab.nextSibling);
      cab.parentNode.insertBefore(barra, alt.nextSibling);
      cab.parentNode.insertBefore(nav, barra.nextSibling);
      cab.parentNode.insertBefore(fondo, nav.nextSibling);
    } else {
      document.body.insertBefore(nav, document.body.firstChild);
    }
    var tabs = document.querySelector(".tabs");
    if (tabs) tabs.setAttribute("inert", "");
    var fn = document.getElementById("subtabsFuncionalidades");
    if (fn) fn.setAttribute("inert", "");
    document.body.classList.add("con-menu-lateral");
    // El hueco reservado en panel.html (anti-parpadeo) ya no hace falta: lo ocupa el menú real.
    var reserva = document.getElementById("menuLateralReserva");
    if (reserva && reserva.parentNode) reserva.parentNode.removeChild(reserva);
  }

  // Preferencia "menu" (Ajustes de cuenta > Preferencias): lateral (por defecto) o superior.
  // En modo superior las pestañas originales vuelven a ser interactivas.
  function sincronizarModo() {
    var superior = document.documentElement.getAttribute("data-eof-menu") === "superior";
    var tabs = document.querySelector(".tabs");
    var fn = document.getElementById("subtabsFuncionalidades");
    [tabs, fn].forEach(function (el) {
      if (!el) return;
      if (superior) el.removeAttribute("inert"); else el.setAttribute("inert", "");
    });
    if (superior) cerrar();
  }

  function menuOculto() {
    return document.documentElement.getAttribute("data-eof-menu-oculto") === "on";
  }
  // Mantiene el texto y aria-expanded de la pestañita según el estado actual.
  function sincronizarAlternar() {
    var b = document.getElementById("menuLateralAlternar");
    if (!b) return;
    var oculto = menuOculto();
    b.setAttribute("aria-expanded", oculto ? "false" : "true");
    var txt = oculto ? "Mostrar el menú lateral" : "Ocultar el menú lateral";
    b.setAttribute("aria-label", txt);
    b.title = txt;
  }

  function ir(it) {
    var b = btnTab(it.tab);
    if (b) b.click();
    if (it.sub) {
      var sb = btnSub(it.tab, it.sub);
      if (sb && !sb.classList.contains("activo")) sb.click();
    }
    cerrar();
    window.scrollTo({ top: 0 });
  }

  function abrir() {
    document.body.classList.add("ml-abierto");
    var a = document.getElementById("menuLateralAbrir");
    if (a) a.setAttribute("aria-expanded", "true");
  }
  function cerrar() {
    document.body.classList.remove("ml-abierto");
    var a = document.getElementById("menuLateralAbrir");
    if (a) a.setAttribute("aria-expanded", "false");
  }

  function posicionar() {
    var cab = document.querySelector(".admin-header");
    var top = cab ? Math.max(0, Math.round(cab.getBoundingClientRect().bottom)) : 0;
    document.documentElement.style.setProperty("--ml-top", top + "px");
  }

  var pendiente = false;
  function refrescar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(function () {
      pendiente = false;
      var actual = "", actualGrupo = "";
      entradas.forEach(function (x) {
        var vis = visible(x.it);
        x.el.style.display = vis ? "" : "none";
        var on = vis && activa(x.it);
        x.el.classList.toggle("activo", on);
        if (on) { x.el.setAttribute("aria-current", "page"); actual = x.it.t; actualGrupo = x.titulo; } else x.el.removeAttribute("aria-current");
        if (x.it.badge) {
          var o = document.getElementById(x.it.badge);
          var b = x.el.querySelector(".ml-badge");
          if (o && b) {
            b.textContent = o.textContent;
            b.style.display = (o.style.display === "none" || !o.textContent.trim() || o.textContent.trim() === "0") ? "none" : "";
          }
        }
      });
      var grupos = [];
      entradas.forEach(function (x) { if (grupos.indexOf(x.grupo) < 0) grupos.push(x.grupo); });
      grupos.forEach(function (g) {
        var hay = entradas.some(function (x) { return x.grupo === g && x.el.style.display !== "none"; });
        g.style.display = hay ? "" : "none";
      });
      if (bar_txt) bar_txt.textContent = actual || "Menú";
      // La cabecera dice el mismo grupo que el menú lateral (antes alternaba entre
      // "Redacción" y "Colaboración" sin relación con los grupos del menú).
      var tit = document.getElementById("tituloSeccion");
      if (tit && actualGrupo && document.documentElement.getAttribute("data-eof-menu") !== "superior" && tit.textContent !== actualGrupo) tit.textContent = actualGrupo;
    });
  }

  function iniciar() {
    construir();
    posicionar();
    refrescar();
    window.addEventListener("scroll", posicionar, { passive: true });
    window.addEventListener("resize", posicionar);
    sincronizarModo();
    sincronizarAlternar();
    new MutationObserver(sincronizarAlternar).observe(document.documentElement, { attributes: true, attributeFilter: ["data-eof-menu-oculto"] });
    new MutationObserver(sincronizarModo).observe(document.documentElement, { attributes: true, attributeFilter: ["data-eof-menu"] });
    var mo = new MutationObserver(refrescar);
    var vigilar = document.querySelectorAll(".tabs, .panel, .subtabs, .tab-badge-pendientes");
    vigilar.forEach(function (n) {
      mo.observe(n, { attributes: true, attributeFilter: ["class", "style"], subtree: n.matches(".tabs, .subtabs"), childList: n.matches(".tab-badge-pendientes"), characterData: true });
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrar(); });
    window.addEventListener("resize", function () { if (window.innerWidth >= 900) cerrar(); });
    // Red de seguridad: el rol/nivel llegan async. Cada 1,5 s solo los primeros ~30 s (cuando hace falta);
    // después cada 5 s, y nunca con la pestaña oculta (el MutationObserver de arriba cubre los cambios reales).
    var tickRefresco = 0;
    var temporizadorRefresco = setInterval(function () {
      if (document.hidden) return;
      refrescar();
      if (++tickRefresco >= 20) {
        clearInterval(temporizadorRefresco);
        setInterval(function () { if (!document.hidden) refrescar(); }, 5000);
      }
    }, 1500);
  }

  // Este script va al final del <body>, así que la cabecera, las pestañas y los paneles ya existen
  // aunque el documento siga "cargando". Antes se esperaba a DOMContentLoaded, que no salta hasta
  // que se han descargado y ejecutado TODOS los scripts de después (admin.js pesa >1 MB): durante
  // ese rato se veía la barra de pestañas superior. Arrancamos ya; si por lo que sea faltara la
  // cabecera, se mantiene la espera clásica.
  if (document.readyState === "loading" && !(document.querySelector(".admin-header") && document.querySelector(".tabs"))) {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
