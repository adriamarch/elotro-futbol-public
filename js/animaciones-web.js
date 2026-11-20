/* animaciones-web.js
 * Animaciones del resto de páginas públicas (equivalente a animaciones-portada.js):
 *  1) Aparecer al hacer scroll (fade + slide con escalonado) en tarjetas,
 *     partidos, filas de clasificación, títulos, etc.
 *  2) Marcadores: cuenta de 0 al valor y "pop" cuando cambia un gol en directo.
 *  3) Subrayado de títulos de sección que se dibuja.
 *  4) Barra de progreso de scroll.
 *  5) Foco de luz que sigue al ratón sobre tarjetas (solo con ratón).
 * Se recuerdan las claves ya animadas para no repetir la animación cuando la
 * página se repinta (filtros, refrescos en vivo). Con "reducir movimiento" no
 * hace nada. Para excluir una zona: añade data-sin-anim a su contenedor.
 */
(function () {
  "use strict";
  if (!document.body || !("IntersectionObserver" in window)) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var main = document.querySelector("main") || document.body;
  document.documentElement.classList.add("eof-web");

  var OBJETIVOS = [
    { sel: ".section-title", tipo: "left" },
    { sel: ".card, .card-galeria, .pa-gal-card, .pa-gal-suelta", tipo: "up" },
    { sel: ".fila-noticia", tipo: "left" },
    { sel: ".partido", tipo: "pop" },
    { sel: ".clasificacion-tabla tbody tr", tipo: "left" },
    { sel: ".stats-podio-item, .elim-ronda, .porras-resumen-item, .porras-temporada-item, .transp-equipo-card, .estado-item", tipo: "up" }
  ];
  var SEL_TODO = OBJETIVOS.map(function (o) { return o.sel; }).join(",");
  var EXCLUIR = '[role="dialog"],[aria-modal="true"],[class*="modal"],header,footer,nav,[hidden],[data-sin-anim]';

  var yaAnimados = new Set();
  var marcadoresVistos = new Map();

  function clave(el) {
    var d = el.dataset || {};
    if (d.artId) return "a" + d.artId;
    if (d.id) {
      var sec = el.closest("section");
      return "p" + (sec ? sec.id : "") + ":" + d.id;
    }
    if (el.id) return "i" + el.id;
    var href = el.getAttribute && el.getAttribute("href");
    if (href) return "h" + href;
    return null;
  }

  function tipoDe(el) {
    for (var i = 0; i < OBJETIVOS.length; i++) {
      if (el.matches(OBJETIVOS[i].sel)) return OBJETIVOS[i].tipo;
    }
    return "up";
  }

  /* ---------- 1) Reveal al hacer scroll ---------- */
  var ioReveal = new IntersectionObserver(function (entradas) {
    var visibles = entradas.filter(function (e) { return e.isIntersecting; });
    visibles.sort(function (a, b) {
      return a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    visibles.forEach(function (e, i) {
      var el = e.target;
      ioReveal.unobserve(el);
      var retraso = Math.min(i * 70, 280);
      el.style.setProperty("--rv-d", retraso + "ms");
      requestAnimationFrame(function () {
        el.classList.add("rv-in");
        setTimeout(function () {
          el.classList.remove("rv", "rv-in");
          el.style.removeProperty("--rv-d");
          el.removeAttribute("data-rv");
        }, 1500 + retraso);
      });
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });

  /* Dos fases para no provocar layout repetido: primero se leen todas las
     posiciones, después se escriben las clases. */
  function decidir(el) {
    if (el.closest(EXCLUIR)) return null;
    var k = clave(el);
    if (k && yaAnimados.has(k)) return null;      // repintado: sin animación
    if (k) yaAnimados.add(k);
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;                  // oculto
    if (r.bottom <= 0 || r.top < window.innerHeight * 0.92) return null; // ya en pantalla
    return el;
  }
  function aplicar(el) {
    el.setAttribute("data-rv", tipoDe(el));
    el.classList.add("rv");
    ioReveal.observe(el);
  }

  /* ---------- 2) Marcadores ---------- */
  var RE_MARCADOR = /^\s*(\d+)\s*:\s*(\d+)\s*$/;

  var ioMarcador = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      if (!e.isIntersecting) return;
      ioMarcador.unobserve(e.target);
      contar(e.target);
    });
  }, { threshold: 0.6 });

  function contar(span) {
    var texto = span.textContent;
    var m = RE_MARCADOR.exec(texto);
    if (!m) return;
    var A = +m[1], B = +m[2];
    if (A + B === 0) return;
    var dur = 750, t0 = null;
    span.__eofContando = true;
    function paso(t) {
      if (!span.isConnected) return;
      if (t0 === null) t0 = t;
      var p = Math.min((t - t0) / dur, 1);
      var f = 1 - Math.pow(1 - p, 3);
      span.textContent = Math.round(A * f) + " : " + Math.round(B * f);
      if (p < 1) requestAnimationFrame(paso);
      else { span.textContent = texto; span.__eofContando = false; }
    }
    span.textContent = "0 : 0";
    requestAnimationFrame(paso);
  }

  function revisarMarcadores() {
    main.querySelectorAll(".partido[data-id]").forEach(function (p) {
      if (p.closest(EXCLUIR)) return;
      var span = p.querySelector(".marcador > span:first-child");
      if (!span || span.__eofContando) return;
      var txt = span.textContent.trim();
      if (!RE_MARCADOR.test(txt)) return;
      var sec = p.closest("section");
      var k = (sec ? sec.id : "") + ":" + p.dataset.id;
      var antes = marcadoresVistos.get(k);
      if (antes === undefined) {
        marcadoresVistos.set(k, txt);
        if (!span.__eofCuenta) { span.__eofCuenta = true; ioMarcador.observe(span); }
      } else if (antes !== txt) {
        marcadoresVistos.set(k, txt);
        var cont = p.querySelector(".marcador");
        if (cont) {
          cont.classList.remove("marcador-gol");
          void cont.offsetWidth;
          cont.classList.add("marcador-gol");
          setTimeout(function () { cont.classList.remove("marcador-gol"); }, 1200);
        }
      }
    });
  }

  /* ---------- 3) Subrayado de títulos ---------- */
  var ioLinea = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (e) {
      if (!e.isIntersecting) return;
      ioLinea.unobserve(e.target);
      e.target.classList.add("eof-linea-in");
    });
  }, { threshold: 0.6 });

  function prepararTitulos() {
    main.querySelectorAll(".section-title:not([data-eof-l])").forEach(function (t) {
      t.setAttribute("data-eof-l", "1");
      if (t.closest(EXCLUIR)) return;
      t.classList.add("eof-linea-pre");
      ioLinea.observe(t);
    });
  }

  /* ---------- 4) Barra de progreso ---------- */
  var barra = document.createElement("div");
  barra.className = "eof-progreso";
  barra.setAttribute("aria-hidden", "true");
  document.body.appendChild(barra);

  var tickScroll = false, total = -1;
  function alScroll() {
    tickScroll = false;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (total < 0) total = document.documentElement.scrollHeight - window.innerHeight;
    var p = total > 0 ? Math.min(Math.max(y / total, 0), 1) : 0;
    barra.style.setProperty("--p", p.toFixed(4));
    barra.classList.toggle("on", y > 24 && total > 120);
  }
  window.addEventListener("scroll", function () {
    if (tickScroll) return;
    tickScroll = true;
    requestAnimationFrame(alScroll);
  }, { passive: true });
  window.addEventListener("resize", function () { total = -1; alScroll(); }, { passive: true });
  alScroll();

  /* ---------- 5) Foco de luz que sigue al ratón ---------- */
  if (window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    var tickPuntero = false, ultimo = null;
    document.addEventListener("pointermove", function (ev) {
      if (ev.pointerType && ev.pointerType !== "mouse") return;
      ultimo = ev;
      if (tickPuntero) return;
      tickPuntero = true;
      requestAnimationFrame(function () {
        tickPuntero = false;
        var t = ultimo && ultimo.target && ultimo.target.closest
          ? ultimo.target.closest(".card,.mini-card,.fila-noticia") : null;
        if (!t) return;
        var r = t.getBoundingClientRect();
        t.style.setProperty("--mx", (ultimo.clientX - r.left) + "px");
        t.style.setProperty("--my", (ultimo.clientY - r.top) + "px");
      });
    }, { passive: true });
  }

  /* ---------- Escaneo ---------- */
  var pendiente = false;
  function escanear() {
    pendiente = false;
    var nuevos = [];
    main.querySelectorAll(SEL_TODO).forEach(function (el) {
      if (el.__eofRv) return;
      el.__eofRv = true;
      nuevos.push(el);
    });
    var aAnimar = nuevos.map(decidir).filter(Boolean);  // fase de lectura
    aAnimar.forEach(aplicar);                           // fase de escritura
    prepararTitulos();
    revisarMarcadores();
    total = -1;                                          // el alto de la página pudo cambiar
  }
  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(escanear);
  }

  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i], t = m.target;
      // cambios de texto del propio conteo no cuentan; un cambio real de marcador sí
      if (t.nodeType === 1 && t.closest && t.closest(".marcador") && !t.__eofContando) { programar(); return; }
      for (var j = 0; j < m.addedNodes.length; j++) {
        if (m.addedNodes[j].nodeType === 1) { programar(); return; }
      }
    }
  }).observe(main, { childList: true, subtree: true });
  programar();
})();
