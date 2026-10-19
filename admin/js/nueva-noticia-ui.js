/* =====================================================================
   Nueva noticia -- navegación por secciones del formulario
   ---------------------------------------------------------------------
   Solo UI: los botones de #nnNav llevan a su sección (abriéndola si el
   usuario la había plegado) y el botón de la sección que se está viendo
   se marca como activo. No toca ningún dato del formulario.
   ===================================================================== */
(function () {
  "use strict";
  var nav = document.getElementById("nnNav");
  if (!nav) return;

  var botones = Array.prototype.slice.call(nav.querySelectorAll("button[data-nn-ir]"));
  var reducir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function seccionDe(boton) { return document.getElementById(boton.getAttribute("data-nn-ir")); }

  function marcar(boton) {
    botones.forEach(function (b) {
      var activo = b === boton;
      b.classList.toggle("activo", activo);
      if (activo) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
    // Mantiene visible el botón activo cuando la barra desborda (móvil)
    if (boton && nav.scrollWidth > nav.clientWidth) {
      var izq = boton.offsetLeft - 12;
      var der = boton.offsetLeft + boton.offsetWidth + 12;
      if (izq < nav.scrollLeft) nav.scrollLeft = izq;
      else if (der > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = der - nav.clientWidth;
    }
  }

  botones.forEach(function (boton) {
    boton.addEventListener("click", function () {
      var sec = seccionDe(boton);
      if (!sec) return;
      if (sec.tagName === "DETAILS") sec.open = true;
      sec.scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "start" });
      marcar(boton);
    });
  });

  // Sección visible -> botón activo
  if ("IntersectionObserver" in window) {
    var visibles = {};
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) { visibles[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0; });
      var mejor = null, mejorRatio = 0;
      botones.forEach(function (b) {
        var r = visibles[b.getAttribute("data-nn-ir")] || 0;
        if (r > mejorRatio) { mejor = b; mejorRatio = r; }
      });
      if (mejor) marcar(mejor);
    }, { rootMargin: "-70px 0px -45% 0px", threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });
    botones.forEach(function (b) { var s = seccionDe(b); if (s) obs.observe(s); });
  }

  // Al llegar al final de la página la última sección (Publicación) es corta y
  // nunca "gana" por visibilidad: se marca a mano.
  window.addEventListener("scroll", function () {
    if (window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 4) {
      marcar(botones[botones.length - 1]);
    }
  }, { passive: true });

  if (botones.length) marcar(botones[0]);
})();
