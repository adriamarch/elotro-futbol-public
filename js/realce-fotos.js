/* ==========================================================================
   REALCE FOTOGRÁFICO — interruptor opcional para las galerías
   --------------------------------------------------------------------------
   Pinta un interruptor "Realce" y, al cambiarlo, vuelve a pedir a Cloudinary las
   miniaturas con (o sin) mejora de contraste, color y nitidez. Es solo visual:
   el original no se modifica ni se altera la descarga.

   Uso: poner  <div data-eof-realce></div>  donde deba aparecer el interruptor.
   El estado vive en VisorMedia (js/visor-media.js): el mismo ajuste sirve para la
   cuadrícula y para el visor a pantalla completa, y se recuerda en el dispositivo.
   Depende de: VisorMedia, cloudinaryMiniatura y cloudinarySrcset (js/config.js).
   ========================================================================== */
(function () {
  "use strict";

  var CSS = [
    ".eof-realce{appearance:none;display:inline-flex;align-items:center;gap:9px;cursor:pointer;",
    "  padding:5px 7px 5px 12px;border-radius:12px;border:1px solid var(--borde,#d9e0ea);",
    "  background:var(--fondo-alt,#f2f5f9);color:var(--texto-suave,#5b6b80);",
    "  font:600 .82rem var(--font-text,system-ui,sans-serif);",
    "  transition:color .2s ease,background .25s ease,border-color .25s ease,box-shadow .25s ease;}",
    ".eof-realce:hover{color:var(--marino-texto,#0c1b2e);background:var(--tarjeta,#fff);}",
    ".eof-realce:focus-visible{outline:2px solid var(--celeste,#5bb8e8);outline-offset:2px;}",
    ".eof-realce-ico{display:flex;width:16px;height:16px;transition:transform .4s cubic-bezier(.2,.8,.2,1),filter .3s ease;}",
    ".eof-realce-ico svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}",
    ".eof-realce-sw{position:relative;width:34px;height:20px;border-radius:999px;flex-shrink:0;",
    "  background:var(--borde,#cfd8e3);transition:background .25s ease;}",
    ".eof-realce-sw i{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;",
    "  background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .25s cubic-bezier(.2,.8,.2,1);}",
    ".eof-realce[aria-pressed=\"true\"]{color:#fff;border-color:transparent;",
    "  background:linear-gradient(135deg,var(--marino,#12325a),var(--marino2,#1d4f8c));",
    "  box-shadow:0 3px 12px rgba(12,27,46,.32);}",
    ".eof-realce[aria-pressed=\"true\"] .eof-realce-ico{color:#ffd76a;transform:rotate(18deg) scale(1.12);",
    "  filter:drop-shadow(0 0 5px rgba(255,215,106,.85));}",
    ".eof-realce[aria-pressed=\"true\"] .eof-realce-sw{background:var(--celeste,#5bb8e8);}",
    ".eof-realce[aria-pressed=\"true\"] .eof-realce-sw i{transform:translateX(14px);}",
    "img.eof-realzando{opacity:.45 !important;transition:opacity .3s ease !important;}",
    "@media (max-width:420px){.eof-realce{padding:5px 6px 5px 10px;gap:7px;}}",
    "@media (prefers-reduced-motion:reduce){.eof-realce,.eof-realce *{transition:none !important;}}"
  ].join("\n");

  var SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>' +
            '<path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';

  function estado() {
    return typeof VisorMedia !== "undefined" && VisorMedia.getRealce ? VisorMedia.getRealce() : false;
  }

  function inyectarCss() {
    if (document.getElementById("eofRealceCss")) return;
    var st = document.createElement("style");
    st.id = "eofRealceCss";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function pintarBotones() {
    var on = estado();
    document.querySelectorAll(".eof-realce").forEach(function (b) {
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.title = on
        ? "Realce activado: más contraste, color y nitidez. El original no se modifica. Pulsa para desactivarlo."
        : "Activar realce fotográfico: más contraste, color y nitidez. Solo afecta a cómo se ve en tu pantalla.";
    });
  }

  // Vuelve a pedir las miniaturas ya pintadas con/sin realce (las aún no cargadas
  // solo actualizan su data-src/data-srcset). Las fotos llevan su URL original en data-raw.
  function aplicar(raiz) {
    if (typeof cloudinaryMiniatura !== "function") return;
    (raiz || document).querySelectorAll("img[data-raw]").forEach(function (img) {
      var raw = img.getAttribute("data-raw");
      if (!raw || raw.indexOf("/upload/") === -1) return;
      var recortar = !img.classList.contains("foco-manual");
      var src = cloudinaryMiniatura(raw, 640, recortar);
      var srcset = cloudinarySrcset(raw, recortar);
      if (img.hasAttribute("data-src")) { // todavía en cola de carga perezosa
        img.setAttribute("data-src", src);
        if (img.hasAttribute("data-srcset")) img.setAttribute("data-srcset", srcset);
        return;
      }
      var quitar = function () { img.classList.remove("eof-realzando"); };
      img.classList.add("eof-realzando");
      img.addEventListener("load", quitar, { once: true });
      img.addEventListener("error", quitar, { once: true });
      if (img.hasAttribute("srcset")) img.setAttribute("srcset", srcset);
      img.src = src;
    });
  }

  function montar(contenedor) {
    if (!contenedor || contenedor.querySelector(".eof-realce")) return;
    inyectarCss();
    var b = document.createElement("button");
    b.type = "button";
    b.className = "eof-realce";
    b.innerHTML = '<span class="eof-realce-ico">' + SVG + '</span><span>Realce</span>' +
                  '<span class="eof-realce-sw" aria-hidden="true"><i></i></span>';
    b.addEventListener("click", function () {
      if (typeof VisorMedia !== "undefined" && VisorMedia.setRealce) VisorMedia.setRealce(!estado());
    });
    contenedor.appendChild(b);
    pintarBotones();
  }

  window.addEventListener("eof-realce", function () { pintarBotones(); aplicar(document); });

  function iniciar() { document.querySelectorAll("[data-eof-realce]").forEach(montar); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();

  window.EOFRealce = { montar: montar, aplicar: aplicar, activo: estado };
})();
