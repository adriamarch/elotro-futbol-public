// Protección anticopia de los textos de las noticias.
// Importante: ninguna protección en el navegador es infalible (ver captura
// de pantalla, "ver código fuente", etc.); esto es un freno serio para el
// copia-pega, el arrastrar, el clic derecho y el imprimir, con un aviso
// amable. No afecta a lectores de pantalla ni a formularios/comentarios.
(function () {
  "use strict";

  var PROTEGIDO = ".article-header, .article-body, .article-galeria, .article-galeria-collages, .nr-card, [data-proteger]";
  var LIBRE = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-copiable]";
  var AVISO_MS = 3400;
  var MENSAJE_PORTAPAPELES = "Contenido protegido © ELOTROFÚTBOLTV. Lee la noticia completa en " + location.origin + location.pathname;

  function dentroDeProtegido(nodo) {
    var el = nodo && nodo.nodeType === 1 ? nodo : nodo && nodo.parentElement;
    if (!el || !el.closest) return false;
    if (el.closest(LIBRE)) return false;
    return !!el.closest(PROTEGIDO);
  }

  // Fotos, vídeos y lienzos (también las que son fondo CSS): se protegen en
  // TODA página que cargue este script, no solo dentro de PROTEGIDO.
  var MEDIA = "img, picture, video, canvas, [data-proteger-img]";
  function esMediaProtegido(nodo) {
    var el = nodo && nodo.nodeType === 1 ? nodo : nodo && nodo.parentElement;
    if (!el || !el.closest) return false;
    if (el.closest(LIBRE) || el.closest("[data-sin-proteccion]")) return false;
    if (el.closest(MEDIA)) return true;
    // Foto puesta como background-image del propio elemento o de su padre
    for (var i = 0, n = el; n && n.nodeType === 1 && i < 2; i++, n = n.parentElement) {
      try {
        var bg = window.getComputedStyle(n).backgroundImage;
        if (bg && bg !== "none" && bg.indexOf("url(") !== -1) return true;
      } catch (e) { /* sin estilos */ }
    }
    return false;
  }

  // Las imágenes no se pueden arrastrar al escritorio ni a otra pestaña
  function endurecerImagenes(raiz) {
    var imgs = (raiz || document).querySelectorAll ? (raiz || document).querySelectorAll("img:not([data-sin-proteccion])") : [];
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].getAttribute("draggable") !== "false") imgs[i].setAttribute("draggable", "false");
    }
  }
  var pendienteEndurecer = false;
  function programarEndurecer() {
    if (pendienteEndurecer) return;
    pendienteEndurecer = true;
    (window.requestAnimationFrame || setTimeout)(function () {
      pendienteEndurecer = false;
      endurecerImagenes(document);
    });
  }
  document.documentElement.classList.add("eof-proteccion-img");
  endurecerImagenes(document);
  // Fotos que aparecen después (carga perezosa, "cargar más", visor...)
  if (window.MutationObserver) {
    new MutationObserver(programarEndurecer).observe(document.documentElement, { childList: true, subtree: true });
  }

  function seleccionToca() {
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    var cont = document.querySelectorAll(PROTEGIDO);
    for (var i = 0; i < sel.rangeCount; i++) {
      var r = sel.getRangeAt(i);
      for (var j = 0; j < cont.length; j++) {
        try { if (r.intersectsNode(cont[j])) return true; } catch (e) { /* nodo desconectado */ }
      }
    }
    return false;
  }

  var aviso = null, tAviso = 0, ultimo = 0;

  function crearAviso() {
    aviso = document.createElement("div");
    aviso.className = "eof-copia-aviso";
    aviso.setAttribute("role", "status");
    aviso.setAttribute("aria-live", "polite");
    aviso.style.setProperty("--eof-copia-ms", AVISO_MS + "ms");
    aviso.innerHTML =
      '<span class="eof-copia-icono" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12 3l7 3v5c0 4.6-3 8.3-7 10-4-1.7-7-5.4-7-10V6l7-3z"/><path d="M9.2 12.2l2 2 3.8-4"/>' +
        "</svg></span>" +
      '<span class="eof-copia-texto">' +
        '<span class="eof-copia-titulo">Contenido protegido</span>' +
        '<span class="eof-copia-sub">Los textos y fotos son de ELOTROFÚTBOLTV. Si te ha gustado, comparte el enlace de la noticia.</span>' +
      "</span>" +
      '<span class="eof-copia-barra" aria-hidden="true"></span>';
    document.body.appendChild(aviso);
  }

  function mostrarAviso() {
    var ahora = Date.now();
    if (ahora - ultimo < 700) return; // sin parpadeos si insisten
    ultimo = ahora;
    if (!aviso) crearAviso();
    aviso.classList.remove("visible");
    void aviso.offsetWidth; // reinicia la barra de tiempo
    aviso.classList.add("visible");
    clearTimeout(tAviso);
    tAviso = setTimeout(function () { aviso.classList.remove("visible"); }, AVISO_MS);
  }

  function bloquear(e) { e.preventDefault(); mostrarAviso(); }

  document.addEventListener("copy", function (e) {
    if (!seleccionToca()) return;
    e.preventDefault();
    try { if (e.clipboardData) e.clipboardData.setData("text/plain", MENSAJE_PORTAPAPELES); } catch (err) { /* sin portapapeles */ }
    mostrarAviso();
  }, true);

  document.addEventListener("cut", function (e) {
    if (seleccionToca()) bloquear(e);
  }, true);

  document.addEventListener("contextmenu", function (e) {
    if (dentroDeProtegido(e.target) || esMediaProtegido(e.target)) bloquear(e);
  }, true);

  document.addEventListener("dragstart", function (e) {
    if (dentroDeProtegido(e.target) || esMediaProtegido(e.target)) bloquear(e);
  }, true);

  // Pulsación larga en el móvil (menú "Guardar imagen"): Android lanza
  // contextmenu (ya bloqueado arriba); en iOS lo evita el CSS
  // -webkit-touch-callout. Esto cubre navegadores que ni una cosa ni la otra.
  var tLargo = 0;
  document.addEventListener("touchstart", function (e) {
    clearTimeout(tLargo);
    if (!esMediaProtegido(e.target)) return;
    tLargo = setTimeout(mostrarAviso, 550);
  }, { capture: true, passive: true });
  ["touchend", "touchmove", "touchcancel"].forEach(function (nombre) {
    document.addEventListener(nombre, function () { clearTimeout(tLargo); }, { capture: true, passive: true });
  });

  // Ctrl/Cmd + S ("Guardar página como...", que baja también las fotos)
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if ((e.key || "").toLowerCase() !== "s") return;
    var activo = document.activeElement;
    if (activo && activo.closest && activo.closest(LIBRE)) return;
    e.preventDefault();
    mostrarAviso();
  }, true);

  // Tecla Impr Pant: no impide la captura, pero avisa y deja un mensaje en
  // el portapapeles en lugar de nada.
  document.addEventListener("keyup", function (e) {
    if (e.key !== "PrintScreen") return;
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(MENSAJE_PORTAPAPELES); } catch (err) { /* sin permiso */ }
    mostrarAviso();
  }, true);

  document.addEventListener("selectstart", function (e) {
    if (dentroDeProtegido(e.target)) e.preventDefault();
  }, true);

  // Ctrl/Cmd + C, X o A con el foco fuera de un campo de texto
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    var k = (e.key || "").toLowerCase();
    if (k !== "c" && k !== "x" && k !== "a") return;
    var activo = document.activeElement;
    if (activo && activo.closest && activo.closest(LIBRE)) return;
    if (!document.querySelector(PROTEGIDO)) return;
    if (k === "a") { e.preventDefault(); mostrarAviso(); return; }
    if (seleccionToca()) bloquear(e);
  }, true);
})();
