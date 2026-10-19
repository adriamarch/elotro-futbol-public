/* Accesibilidad y móvil — mejoras en tiempo de ejecución, compartidas por la
   web pública y el panel. No depende de otros scripts y no falla si falta algo. */
(function () {
  "use strict";
  if (window.__eofA11y) return;
  window.__eofA11y = true;

  var enPanel = /\/admin\//.test(location.pathname);

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  // 1) Enlace "Saltar al contenido" + landmark principal con destino
  function saltarAlContenido() {
    var main = document.querySelector("main, [role=main]");
    if (!main) {
      // Sin <main>: el primer .wrap que no sea cabecera
      var wrap = Array.prototype.filter.call(document.querySelectorAll(".wrap"), function (w) {
        return !w.closest("header, .admin-header, .main-header, footer");
      })[0];
      if (!wrap) return;
      main = wrap;
      main.setAttribute("role", "main");
    }
    if (!main.id) main.id = "contenido-principal";
    main.setAttribute("data-eof-main", "");
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    if (document.querySelector(".eof-skip")) return;
    var a = document.createElement("a");
    a.className = "eof-skip";
    a.href = "#" + main.id;
    a.textContent = "Saltar al contenido";
    a.addEventListener("click", function (e) {
      e.preventDefault();
      main.focus({ preventScroll: false });
      main.scrollIntoView({ block: "start" });
    });
    document.body.insertBefore(a, document.body.firstChild);
  }

  // 2) Nombre accesible a controles que solo tienen icono, título o placeholder
  function etiquetar(raiz) {
    (raiz || document).querySelectorAll("button, a, input, select, textarea").forEach(function (el) {
      if (el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")) return;
      var tag = el.tagName;
      if (tag === "INPUT" && /^(hidden|submit|button|reset|checkbox|radio)$/.test(el.type)) return;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
        if (el.id && document.querySelector('label[for="' + el.id + '"]')) return;
        if (el.closest("label")) return;
        var nombre = el.getAttribute("title") || el.getAttribute("placeholder");
        if (nombre) el.setAttribute("aria-label", nombre.trim());
        return;
      }
      var texto = (el.textContent || "").replace(/\s+/g, "").replace(/[☰✕×▸▾▴⋮…]/g, "");
      if (texto.length) return;
      if (el.querySelector("img[alt]:not([alt=''])")) return;
      var t = el.getAttribute("title");
      if (t) el.setAttribute("aria-label", t.trim());
    });
  }

  // 3) Botón de menú móvil: estado expandido y relación con la lista
  function menuMovil() {
    var t = document.getElementById("navToggle");
    var l = document.getElementById("navList");
    if (!t || !l || t.hasAttribute("data-eof-a11y")) return;
    t.setAttribute("data-eof-a11y", "");
    t.setAttribute("aria-label", "Abrir menú de navegación");
    t.setAttribute("aria-controls", "navList");
    t.setAttribute("aria-expanded", "false");
    function sync() {
      var abierto = l.classList.contains("abierta");
      t.setAttribute("aria-expanded", abierto ? "true" : "false");
      t.setAttribute("aria-label", abierto ? "Cerrar menú de navegación" : "Abrir menú de navegación");
    }
    new MutationObserver(sync).observe(l, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && l.classList.contains("abierta")) { l.classList.remove("abierta"); t.focus(); }
    });
  }

  // 4) Landmarks de navegación con nombre
  function landmarks() {
    var nav = document.querySelector("nav.main-nav");
    if (nav && !nav.hasAttribute("aria-label")) nav.setAttribute("aria-label", "Principal");
    var h = document.querySelector("header.main-header, #site-header header");
    if (h && !h.hasAttribute("role")) h.setAttribute("role", "banner");
  }

  // 5) Pestañas del panel con roles ARIA, estado seleccionado y flechas
  function pestanasPanel() {
    document.querySelectorAll(".tabs, .subtabs").forEach(function (lista) {
      if (lista.hasAttribute("role")) return;
      lista.setAttribute("role", "tablist");
      if (!lista.hasAttribute("aria-label")) lista.setAttribute("aria-label", lista.classList.contains("tabs") ? "Secciones del panel" : "Subsecciones");
      var botones = function () { return Array.prototype.filter.call(lista.querySelectorAll(":scope > button"), function (b) { return b.offsetParent !== null; }); };
      function sync() {
        lista.querySelectorAll(":scope > button").forEach(function (b) {
          b.setAttribute("role", "tab");
          var on = b.classList.contains("activo");
          b.setAttribute("aria-selected", on ? "true" : "false");
          b.tabIndex = on ? 0 : -1;
        });
      }
      sync();
      new MutationObserver(sync).observe(lista, { attributes: true, subtree: true, attributeFilter: ["class"], childList: true });
      lista.addEventListener("keydown", function (e) {
        if (["ArrowRight", "ArrowLeft", "Home", "End"].indexOf(e.key) < 0) return;
        var bs = botones(); if (!bs.length) return;
        var i = bs.indexOf(document.activeElement); if (i < 0) return;
        e.preventDefault();
        var n = e.key === "Home" ? 0 : e.key === "End" ? bs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + bs.length) % bs.length;
        bs[n].focus();
      });
    });
  }

  // 6) Diálogos: nombre, Escape para cerrar y foco devuelto al origen
  function dialogos() {
    var origen = null;
    function visible(el) { return el && el.offsetParent !== null || (el && getComputedStyle(el).position === "fixed" && getComputedStyle(el).display !== "none"); }
    function abiertos() {
      return Array.prototype.filter.call(document.querySelectorAll('[role="dialog"], .modal-fondo.abierto, .modal-overlay.abierto'), function (d) {
        var cs = getComputedStyle(d); return cs.display !== "none" && cs.visibility !== "hidden";
      });
    }
    document.addEventListener("focusin", function (e) {
      if (!abiertos().length) origen = e.target;
    }, true);
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var ab = abiertos(); if (!ab.length) return;
      var d = ab[ab.length - 1];
      var cerrar = d.querySelector('[aria-label="Cerrar"], .modal-cerrar, .modal-newsletter-cerrar, [data-cerrar], .cerrar');
      if (cerrar) { e.preventDefault(); cerrar.click(); if (origen && document.contains(origen)) setTimeout(function () { try { origen.focus(); } catch (_) {} }, 0); }
    });
    // Los diálogos sin nombre lo toman de su primer encabezado
    function nombrar() {
      document.querySelectorAll('[role="dialog"]').forEach(function (d) {
        if (d.hasAttribute("aria-label") || d.hasAttribute("aria-labelledby")) return;
        var h = d.querySelector("h1,h2,h3,h4");
        if (h) { if (!h.id) h.id = "eof-dlg-" + Math.random().toString(36).slice(2, 8); d.setAttribute("aria-labelledby", h.id); }
      });
    }
    nombrar();
    new MutationObserver(nombrar).observe(document.body, { childList: true, subtree: true });
  }

  // 7) Mensajes dinámicos anunciados por lectores de pantalla
  function avisos() {
    document.querySelectorAll(".modal-msg, .msg-ok, .msg-error, .msg-err, [id$='Msg'], [id$='Error']").forEach(function (m) {
      if (!m.hasAttribute("role") && !m.hasAttribute("aria-live")) m.setAttribute("aria-live", "polite");
    });
  }

  ready(function () {
    saltarAlContenido();
    etiquetar();
    menuMovil();
    landmarks();
    avisos();
    dialogos();
    if (enPanel) pestanasPanel();
    // La cabecera pública se pinta por JS y puede repintarse: se vuelve a aplicar
    var pend = null;
    new MutationObserver(function () {
      if (pend) return;
      pend = setTimeout(function () { pend = null; etiquetar(); menuMovil(); landmarks(); }, 150);
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
