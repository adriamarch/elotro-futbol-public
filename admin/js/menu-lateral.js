// ---------- Menú lateral del panel ----------
// Sustituye visualmente a la barra de pestañas superior y al menú interno de
// "Funcionalidades". NO mueve bloques ni cambia ids: cada entrada del menú
// hace click en el botón de pestaña/subpestaña que ya existía, así que los
// enlaces ?ir=..., el tutorial y los badges siguen funcionando igual.
// Quién ve qué se deduce de lo que admin.js / rol-inicial.js ya oculta en los
// botones originales (no se duplican permisos aquí).
//
// Además:
//  · Cada grupo (Redacción, Equipo, Audiencia, Administración) es un desplegable: se pliega y se
//    despliega, recuerda cómo lo dejaste y, plegado, muestra la suma de sus pendientes.
//  · Los numeritos rojos se mantienen "en vivo" (ver el bloque CONTADORES EN VIVO al final).
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
    papelera: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.2a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L18 7M9 7V4.5h6V7"/>',
    red: '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.6 10.6l6.8-3.2M8.6 13.4l6.8 3.2"/>',
    grafico: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    casa: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>'
  };

  // tab/sub = botón original a pulsar; subs = subpestañas que cuentan como "esta entrada".
  // badge = id del contador original que se refleja en la entrada.
  var GRUPOS = [
    { titulo: "Inicio", items: [
      { t: "Resumen", ic: "casa", tab: "inicio" }
    ]},
    { titulo: "Redacción", items: [
      { t: "Noticias", ic: "noticias", tab: "noticias", sub: "nueva", subs: ["nueva", "lista", "noticiasRapidas"] },
      { t: "Resultados", ic: "resultados", tab: "resultados", sub: "resultado", badge: "badgeResultadosAnulados" },
      { t: "Contenido", ic: "contenido", tab: "contenido", sub: "subir" },
      { t: "Podcast", ic: "podcast", tab: "podcast" },
      { t: "Encuestas", ic: "encuestas", tab: "funcionalidades", sub: "encuestas" },
      { t: "Equipos", ic: "equipos", tab: "funcionalidades", sub: "equipos" },
      { t: "Propuestas de fichas", ic: "equipos", tab: "solicitudes", sub: "propuestasEquipos", badge: "badgeSolPropuestasEquipos" },
      { t: "Jugadores", ic: "jugadores", tab: "funcionalidades", sub: "jugadores" },
      { t: "Papelera", ic: "papelera", tab: "papelera" }
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
      { t: "Reuniones", ic: "calendario", tab: "funcionalidades", sub: "reuniones" },
      { t: "Responsabilidades", ic: "check", tab: "funcionalidades", sub: "responsabilidades" },
      { t: "Redes sociales", ic: "red", tab: "funcionalidades", sub: "redesSociales" },
      { t: "Historial", ic: "reloj", tab: "funcionalidades", sub: "historial" },
      { t: "Analíticas", ic: "grafico", tab: "analiticas" }
    ]}
  ];

  var nav, barra, bar_txt, entradas = [], gruposInfo = [], totalEl, vivoEl, vivo = null, grupoActivoPrevio = "";
  var esAdmin = false;
  try { var u = JSON.parse(localStorage.getItem("eof_user") || "null"); esAdmin = !!u && u.rol === "admin"; } catch (e) {}

  // Grupos plegados por la persona (se guardan en este navegador).
  var CLAVE_CERRADOS = "eof_ml_grupos_cerrados";
  function leerCerrados() {
    try { var a = JSON.parse(localStorage.getItem(CLAVE_CERRADOS) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function guardarCerrados() {
    try { localStorage.setItem(CLAVE_CERRADOS, JSON.stringify(cerrados)); } catch (e) {}
  }
  var cerrados = leerCerrados();

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
    GRUPOS.forEach(function (g, gi) {
      var sec = document.createElement("div");
      sec.className = "ml-grupo";
      // Un grupo con una sola entrada (Inicio) no se pliega: no tendría sentido.
      var plegable = g.items.length > 1;
      var idItems = "mlItems" + gi;
      var h = document.createElement(plegable ? "button" : "div");
      h.className = "ml-titulo" + (plegable ? " ml-titulo-btn" : "");
      h.innerHTML = '<span class="ml-titulo-txt"></span><span class="ml-linea"></span>' +
        (plegable ? '<span class="ml-grupo-badge" style="display:none" aria-hidden="true">0</span>' +
          '<svg class="ml-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' : '');
      h.querySelector(".ml-titulo-txt").textContent = g.titulo;
      sec.appendChild(h);

      var wrap = document.createElement("div");
      wrap.className = "ml-items";
      wrap.id = idItems;
      var dentro = document.createElement("div");
      dentro.className = "ml-items-in";
      wrap.appendChild(dentro);
      sec.appendChild(wrap);

      var info = { sec: sec, h: h, wrap: wrap, titulo: g.titulo, plegable: plegable, suma: 0, badge: h.querySelector(".ml-grupo-badge") };
      gruposInfo.push(info);
      if (plegable) {
        h.type = "button";
        h.setAttribute("aria-controls", idItems);
        h.addEventListener("click", function () { fijarGrupo(info, info.sec.classList.contains("cerrado"), true); });
      }

      g.items.forEach(function (it) {
        var el = document.createElement(it.href ? "a" : "button");
        if (it.href) el.href = it.href; else el.type = "button";
        el.className = "ml-item";
        el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONOS[it.ic] || "") + '</svg><span class="ml-txt"></span><span class="ml-badge tab-badge-pendientes" style="display:none">0</span>';
        el.querySelector(".ml-txt").textContent = it.t;
        if (!it.href) el.addEventListener("click", function () { ir(it); });
        dentro.appendChild(el);
        entradas.push({ it: it, el: el, grupo: sec, titulo: g.titulo, info: info });
      });
      if (plegable) fijarGrupo(info, cerrados.indexOf(g.titulo) < 0, false);
      nav.appendChild(sec);
    });
    var fondo = document.createElement("div");
    fondo.id = "menuLateralFondo";
    fondo.addEventListener("click", cerrar);

    barra = document.createElement("div");
    barra.id = "menuLateralBarra";
    barra.innerHTML = '<button type="button" id="menuLateralAbrir" aria-label="Abrir menú de secciones" aria-expanded="false" aria-controls="menuLateral"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><span id="menuLateralActual"></span>';
    bar_txt = barra.querySelector("#menuLateralActual");
    totalEl = document.createElement("span");
    totalEl.className = "ml-total";
    totalEl.style.display = "none";
    totalEl.setAttribute("aria-hidden", "true");
    barra.querySelector("#menuLateralAbrir").appendChild(totalEl);
    // Aviso para lectores de pantalla cuando llega algo nuevo (no se ve).
    vivoEl = document.createElement("div");
    vivoEl.id = "menuLateralVivo";
    vivoEl.className = "ml-sr";
    vivoEl.setAttribute("role", "status");
    vivoEl.setAttribute("aria-live", "polite");
    nav.appendChild(vivoEl);
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

  // Pliega o despliega un grupo. "persistir" = lo ha hecho la persona (se recuerda); si lo hace el
  // propio menú (abrir el grupo de la sección activa) no se guarda.
  function fijarGrupo(gr, abierto, persistir) {
    gr.sec.classList.toggle("cerrado", !abierto);
    gr.h.setAttribute("aria-expanded", abierto ? "true" : "false");
    // inert: lo plegado no recibe foco con el teclado ni lo lee un lector de pantalla.
    if (abierto) gr.wrap.removeAttribute("inert"); else gr.wrap.setAttribute("inert", "");
    // Durante la animación se recorta el contenido; abierto del todo no (así se ven sombras y la barrita roja).
    gr.sec.classList.add("anim");
    clearTimeout(gr.tAnim);
    gr.tAnim = setTimeout(function () { gr.sec.classList.remove("anim"); }, 280);
    if (persistir) {
      var i = cerrados.indexOf(gr.titulo);
      if (abierto && i >= 0) cerrados.splice(i, 1);
      else if (!abierto && i < 0) cerrados.push(gr.titulo);
      guardarCerrados();
    }
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
    // Al cambiar de sección se ponen al día los numeritos (los que llevan más de unos segundos).
    if (vivo) vivo.pedir();
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

  // Anima el numerito cuando cambia y avisa (sin ruido visual) a los lectores de pantalla si ha subido.
  function animar(el) {
    if (!el) return;
    el.classList.remove("ml-pop");
    void el.offsetWidth; // reinicia la animación aunque ya estuviera puesta
    el.classList.add("ml-pop");
  }
  function anunciar(texto) {
    if (!vivoEl) return;
    vivoEl.textContent = "";
    setTimeout(function () { vivoEl.textContent = texto; }, 60);
  }
  function tope(n) { return n > 99 ? "99+" : String(n); }

  var pendiente = false;
  function refrescar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(function () {
      pendiente = false;
      var actual = "", actualGrupo = "", total = 0;
      gruposInfo.forEach(function (g) { g.nuevaSuma = 0; });
      entradas.forEach(function (x) {
        var vis = visible(x.it);
        var disp = vis ? "" : "none";
        if (x.el.style.display !== disp) x.el.style.display = disp;
        var on = vis && activa(x.it);
        x.el.classList.toggle("activo", on);
        if (on) { x.el.setAttribute("aria-current", "page"); actual = x.it.t; actualGrupo = x.titulo; } else x.el.removeAttribute("aria-current");
        if (x.it.badge) {
          var o = document.getElementById(x.it.badge);
          var b = x.el.querySelector(".ml-badge");
          if (o && b) {
            var t = o.style.display === "none" ? "" : o.textContent.trim();
            if (t === "0") t = "";
            // Solo se toca el DOM si ha cambiado de verdad: antes se reescribía en cada pasada y eso
            // volvía a disparar el observador de abajo sin parar.
            if (x.txtBadge !== t) {
              var antes = x.txtBadge;
              x.txtBadge = t;
              b.textContent = t || "0";
              b.style.display = t ? "" : "none";
              if (antes !== undefined && t) {
                animar(b);
                if ((parseInt(t, 10) || 0) > (parseInt(antes, 10) || 0)) anunciar(x.it.t + ": " + t + (t === "1" ? " pendiente" : " pendientes"));
              }
            }
            if (vis && t) {
              var n = parseInt(t, 10) || 0;
              x.info.nuevaSuma += n;
              total += n;
            }
          }
        }
      });
      // Suma por grupo (se ve cuando el grupo está plegado) y total en el botón del menú (móvil).
      gruposInfo.forEach(function (g) {
        var hay = entradas.some(function (x) { return x.info === g && x.el.style.display !== "none"; });
        var dg = hay ? "" : "none";
        if (g.sec.style.display !== dg) g.sec.style.display = dg;
        if (g.badge && g.suma !== g.nuevaSuma) {
          var sube = g.nuevaSuma > g.suma;
          g.suma = g.nuevaSuma;
          g.badge.textContent = tope(g.suma);
          g.badge.style.display = g.suma > 0 ? "" : "none";
          if (g.suma > 0 && sube) animar(g.badge);
        }
        if (g.plegable) g.sec.classList.toggle("tiene-activo", g.titulo === actualGrupo);
      });
      if (totalEl) {
        var tt = total > 0 ? tope(total) : "";
        if (totalEl.textContent !== tt) {
          totalEl.textContent = tt;
          totalEl.style.display = tt ? "" : "none";
          if (tt) animar(totalEl);
        }
      }
      // Si la sección activa está en un grupo plegado, se abre (sin recordarlo) para que se vea dónde estás.
      if (actualGrupo && actualGrupo !== grupoActivoPrevio) {
        gruposInfo.forEach(function (g) {
          if (g.titulo === actualGrupo && g.plegable && g.sec.classList.contains("cerrado")) fijarGrupo(g, true, false);
        });
      }
      grupoActivoPrevio = actualGrupo;
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
      if (n.classList.contains("ml-badge")) return; // los numeritos del propio menú no se vigilan a sí mismos
      mo.observe(n, { attributes: true, attributeFilter: ["class", "style"], subtree: n.matches(".tabs, .subtabs"), childList: n.matches(".tab-badge-pendientes"), characterData: true });
    });
    iniciarVivo();
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

  // ---------- CONTADORES EN VIVO ----------
  // Los numeritos rojos salían de consultas sueltas que solo se hacían al abrir el panel (el feedback
  // se renovaba cada 2 min y el resto nunca). Aquí se consulta cada uno cada ~30-60 s MIENTRAS el panel
  // está a la vista y hay actividad, y se escribe en el contador original (el menú lateral, el grupo y
  // el botón móvil lo reflejan solos). No se repinta ninguna lista ni se muestran avisos nuevos: solo
  // cambia el número, así que no molesta si estás escribiendo una noticia.
  //  · Pestaña oculta, sin conexión o 10 min sin tocar nada: en pausa. Al volver, se pone al día al instante.
  //  · Cada fuente va a su ritmo, escalonada (no 7 peticiones a la vez) y con espera creciente si falla.
  //  · Reutiliza las funciones de admin.js / feedback-revision.js: los permisos siguen siendo los suyos.
  function iniciarVivo() {
    var INACTIVIDAD_MS = 10 * 60 * 1000;
    var REVISION_MS = 5000;
    var ultimaActividad = Date.now();

    function api(ruta) {
      return typeof apiFetch === "function" ? apiFetch(ruta) : Promise.reject(new Error("sin api"));
    }
    function usuario() {
      try { return JSON.parse(localStorage.getItem("eof_user") || "null"); } catch (e) { return null; }
    }
    // Escribe un contador solo si cambia (cada escritura despierta a los observadores).
    function poner(id, n, visible) {
      var b = document.getElementById(id);
      if (!b) return;
      var t = String(n);
      if (b.textContent !== t) b.textContent = t;
      var d = n > 0 ? visible : "none";
      if (b.style.display !== d) b.style.display = d;
    }
    function lista(r, campo) {
      if (!r || !Array.isArray(r[campo])) throw new Error("sin datos"); // sesión sin confirmar, red caída…
      return r[campo];
    }

    // cada = ms entre consultas; ya = true si el panel ya lo ha cargado al arrancar (no repetir enseguida).
    var FUENTES = [
      { clave: "edicion", cada: 30000, ya: true,
        puede: function (u) { return u.rol !== "fotografo"; },
        run: function () { return typeof actualizarBadgeSolicitudesPendientes === "function" ? actualizarBadgeSolicitudesPendientes() : null; } },
      { clave: "feedback", cada: 30000, ya: true,
        puede: function () { return true; },
        run: function () {
          var f = window.EOFFeedback;
          if (!f || typeof f.refrescarResumen !== "function") return null;
          return Promise.resolve(f.refrescarResumen()).then(function (r) { if (!r) throw new Error("sin datos"); });
        } },
      { clave: "votaciones", cada: 60000, ya: true,
        puede: function () { return true; },
        // Solo el número: NO se repinta la lista ni se dispara la pantalla de voto obligatorio a media tarea.
        run: function () {
          return api("/api/votaciones").then(function (r) {
            var n = lista(r, "votaciones").filter(function (v) { return !v.cerrada && !v.he_votado; }).length;
            poner("badgeVotPendientes", n, "");
          });
        } },
      { clave: "tienda", cada: 45000, ya: true,
        puede: function (u) { return u.rol !== "fotografo"; },
        run: function () { return typeof actualizarBadgeTiendaGestionPendientes === "function" ? actualizarBadgeTiendaGestionPendientes() : null; } },
      { clave: "comentarios", cada: 60000, ya: true,
        puede: function (u) { return u.rol === "admin"; },
        run: function () {
          return api("/api/admin/comments?estado=pendiente").then(function (r) {
            poner("badgeFuncComentarios", lista(r, "comentarios").length, "inline-block");
            if (typeof actualizaBadgeFuncionalidades === "function") actualizaBadgeFuncionalidades();
          });
        } },
      { clave: "propuestas", cada: 60000, ya: false, // este no se cargaba hasta abrir "Equipos": ahora aparece solo
        puede: function () { return typeof puedeVerPropuestasEquipos === "function" && puedeVerPropuestasEquipos(); },
        run: function () {
          return api("/api/admin/club-info/solicitudes").then(function (r) {
            var l = lista(r, "solicitudes");
            if (typeof actualizarBadgePropuestasEquipos === "function") actualizarBadgePropuestasEquipos(r.puede_resolver ? l.length : 0);
          });
        } },
      { clave: "anulados", cada: 60000, ya: true,
        puede: function (u) { return u.rol !== "fotografo"; },
        run: function () {
          return api("/api/results?estado=anulado&limit=0").then(function (r) {
            var n = lista(r, "results").length;
            if (typeof pintarBadgesAnulados === "function") pintarBadgesAnulados(n);
            try { sessionStorage.setItem("eof_anulados_pendientes", JSON.stringify({ n: n, t: Date.now() })); } catch (e) {}
          });
        } }
    ];

    var estado = {};
    FUENTES.forEach(function (f) { estado[f.clave] = { ultima: f.ya ? Date.now() : 0, ocupado: false, fallos: 0 }; });

    // minimo = antigüedad mínima (ms) para volver a consultar una fuente; sin él, su propio ritmo.
    function ciclo(minimo) {
      if (document.hidden || navigator.onLine === false) return;
      if (Date.now() - ultimaActividad > INACTIVIDAD_MS) return;
      var u = usuario();
      if (!u) return;
      var ahora = Date.now(), n = 0;
      FUENTES.forEach(function (f) {
        var s = estado[f.clave];
        // Si falla, espera el doble cada vez (hasta x8) en vez de seguir insistiendo.
        var espera = typeof minimo === "number" ? minimo : f.cada * Math.min(8, Math.pow(2, s.fallos));
        if (s.ocupado || ahora - s.ultima < espera) return;
        var permitido = false;
        try { permitido = !!f.puede(u); } catch (e) {}
        if (!permitido) return;
        s.ocupado = true;
        s.ultima = ahora;
        setTimeout(function () {
          var p;
          try { p = Promise.resolve(f.run()); } catch (e) { p = Promise.reject(e); }
          p.then(function () { s.fallos = 0; }, function () { s.fallos++; }).then(function () { s.ocupado = false; });
        }, n++ * 350);
      });
    }

    setInterval(function () { ciclo(); }, REVISION_MS);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) ciclo(); });
    window.addEventListener("focus", function () { ciclo(); });
    window.addEventListener("online", function () { ciclo(); });
    ["pointerdown", "keydown", "scroll", "touchstart", "wheel"].forEach(function (ev) {
      window.addEventListener(ev, function () {
        var estabaEnPausa = Date.now() - ultimaActividad > INACTIVIDAD_MS;
        ultimaActividad = Date.now();
        if (estabaEnPausa) ciclo();
      }, { passive: true, capture: true });
    });
    // Primera pasada poco después de arrancar (solo lo que el panel no cargaba por sí mismo).
    setTimeout(function () { ciclo(); }, 4000);

    // Para el menú: al navegar, consulta lo que lleve más de 8 s sin actualizarse.
    vivo = { pedir: function () { ciclo(8000); } };
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
