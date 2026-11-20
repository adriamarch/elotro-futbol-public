/* portada-escenario.js  ·  FASE 1 de la nueva portada
 * Controla el hero "Escenario": cambia la noticia al pulsar un dorsal, autoplay con
 * barra de progreso (se pausa con el ratón/foco y se desactiva al elegir a mano o con
 * movimiento reducido), flechas de teclado y deslizar en móvil.
 * main.js (pintarHero) pinta el marcado y llama a EOF_ESCENA.montar() cada vez.
 */
(function () {
  "use strict";

  var reducir = false;
  try { reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  function cargarImagen(img) {
    if (!img || !img.getAttribute("data-src")) return;
    var ss = img.getAttribute("data-srcset");
    if (ss) img.setAttribute("srcset", ss);
    img.setAttribute("src", img.getAttribute("data-src"));
    img.removeAttribute("data-src");
    img.removeAttribute("data-srcset");
  }

  function montar(raiz) {
    var esc = (raiz || document).querySelector(".hero-escena");
    if (!esc || esc.__montada) return;
    esc.__montada = true;

    var slides = [].slice.call(esc.querySelectorAll(".hero-slide"));
    var tabs = [].slice.call(esc.querySelectorAll(".hero-dorsal"));
    if (slides.length < 2 || tabs.length !== slides.length) {
      esc.classList.add("una");
      return;
    }

    var actual = 0;
    var manual = reducir;
    var pendientesCargadas = false;
    esc.classList.add(manual ? "manual" : "auto");

    function cargarTodas() {
      if (pendientesCargadas) return;
      pendientesCargadas = true;
      slides.forEach(function (s) { cargarImagen(s.querySelector("img[data-src]")); });
    }

    // Las fotos de los demás slides se piden cuando el navegador está libre
    // (la del primero ya va con prioridad alta para no retrasar el LCP).
    function cuandoLibre() {
      var lanzar = function () { cargarTodas(); };
      var tras = function () {
        if ("requestIdleCallback" in window) requestIdleCallback(lanzar, { timeout: 2500 });
        else setTimeout(lanzar, 1200);
      };
      if (document.readyState === "complete") tras();
      else window.addEventListener("load", tras, { once: true });
    }
    cuandoLibre();

    function ir(n, porUsuario) {
      n = (n + slides.length) % slides.length;
      if (porUsuario && !manual) {
        manual = true;
        esc.classList.remove("auto");
        esc.classList.add("manual");
      }
      if (n === actual) return;
      cargarImagen(slides[n].querySelector("img[data-src]"));
      actual = n;
      esc.classList.add("animar");
      slides.forEach(function (s, k) {
        var on = k === actual;
        s.classList.toggle("activa", on);
        s.setAttribute("aria-hidden", on ? "false" : "true");
      });
      tabs.forEach(function (t, k) {
        var on = k === actual;
        t.classList.toggle("activa", on);
        t.setAttribute("aria-pressed", on ? "true" : "false");
      });
      // en el rail móvil, el dorsal activo se mantiene a la vista
      var rail = tabs[actual].parentNode;
      if (rail && rail.scrollWidth > rail.clientWidth + 4) {
        try { rail.scrollTo({ left: tabs[actual].offsetLeft - 8, behavior: reducir ? "auto" : "smooth" }); } catch (e) {}
      }
    }

    // clic / teclado en los dorsales
    tabs.forEach(function (t, k) {
      t.addEventListener("click", function () { cargarTodas(); ir(k, true); });
      t.addEventListener("keydown", function (ev) {
        var d = 0;
        if (ev.key === "ArrowRight" || ev.key === "ArrowDown") d = 1;
        else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") d = -1;
        else if (ev.key === "Home") { ev.preventDefault(); ir(0, true); tabs[0].focus(); return; }
        else if (ev.key === "End") { ev.preventDefault(); ir(slides.length - 1, true); tabs[slides.length - 1].focus(); return; }
        if (!d) return;
        ev.preventDefault();
        ir(actual + d, true);
        tabs[actual].focus();
      });
    });

    // autoplay: cuando termina la barra del dorsal activo, siguiente noticia
    esc.addEventListener("animationend", function (ev) {
      if (manual || !ev.target || !ev.target.classList || !ev.target.classList.contains("prog")) return;
      ir(actual + 1, false);
    });

    // deslizar en el escenario (móvil)
    var escenario = esc.querySelector(".hero-escenario");
    if (escenario) {
      var x0 = null, y0 = null, deslizado = false;
      escenario.addEventListener("pointerdown", function (ev) {
        if (ev.pointerType === "mouse") return;
        x0 = ev.clientX; y0 = ev.clientY; deslizado = false;
      });
      escenario.addEventListener("pointerup", function (ev) {
        if (x0 == null) return;
        var dx = ev.clientX - x0, dy = ev.clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 48 && Math.abs(dy) < 40) {
          deslizado = true;
          cargarTodas();
          ir(actual + (dx < 0 ? 1 : -1), true);
        }
      });
      escenario.addEventListener("pointercancel", function () { x0 = null; });
      // un gesto de deslizar no debe abrir la noticia
      escenario.addEventListener("click", function (ev) {
        if (deslizado) { ev.preventDefault(); ev.stopPropagation(); deslizado = false; }
      }, true);
    }
  }

  window.EOF_ESCENA = { montar: montar };

  // por si el hero ya estuviera pintado cuando carga este script
  function inicial() { montar(document); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicial);
  else inicial();
})();
