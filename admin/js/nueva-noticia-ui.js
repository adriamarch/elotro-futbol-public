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


/* =====================================================================
   Ayuda SEO (solo orientativa, nunca bloquea)
   ---------------------------------------------------------------------
   El SEO de la noticia es AUTOMÁTICO (título, description, canonical,
   JSON-LD...). Lo único que decide la persona que escribe es el titular y
   el subtítulo, así que estos contadores avisan de lo que Google hará:
   - Título: hacia los 60 caracteres lo recorta en los resultados.
   - Subtítulo: se usa como descripción bajo el titular si tiene entre 50 y
     160 caracteres; si es más corto se ignora y se usa el arranque del texto.
   ===================================================================== */
(function () {
  "use strict";
  var titulo = document.getElementById("titulo");
  var subtitulo = document.getElementById("subtitulo");
  var cTitulo = document.getElementById("nnContTitulo");
  var cSub = document.getElementById("nnContSubtitulo");
  if (!titulo || !subtitulo || !cTitulo || !cSub) return;

  function pintar(el, texto, aviso) {
    el.textContent = texto;
    el.classList.toggle("cerca", !!aviso);
  }
  function actualizar() {
    var t = titulo.value.trim().length;
    pintar(cTitulo, t ? t + "/60" : "", t > 60);
    var s = subtitulo.value.trim().length;
    if (!s) pintar(cSub, "Google: 50-160", true);
    else pintar(cSub, s + (s < 50 ? " · corto" : s > 160 ? " · se recorta" : ""), s < 50 || s > 160);
  }
  titulo.addEventListener("input", actualizar);
  subtitulo.addEventListener("input", actualizar);
  // Al abrir una noticia existente el formulario se rellena por código (sin
  // evento "input"): se revisa también tras cargar y al volver a la pestaña.
  window.addEventListener("load", function () { setTimeout(actualizar, 400); });
  document.addEventListener("click", function () { setTimeout(actualizar, 250); });
  actualizar();
})();
