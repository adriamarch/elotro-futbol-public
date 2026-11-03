// ---------- Liquid Glass · versión ligera ----------
// Lo carga js/preferencias.js cuando el cristal líquido está activo.
//
// Optimizado para que no pese ni dé tirones:
//   - SIN refracción SVG (feDisplacementMap + mapas canvas): era lo más caro,
//     se recalculaba en cada fotograma y provocaba los bugs en móvil.
//   - La barra conserva su cristal (CSS de preferencias.js, desde el primer pintado); la lente NO
//     lleva backdrop-filter: solo tinte + sombra + brillo. Sin cambio de aspecto al cargar.
//   - Sin bucle de luz continuo, sin giroscopio, sin muestreo de color de
//     fondo (elementsFromPoint/getComputedStyle), sin barra que se contrae.
//   - El requestAnimationFrame solo corre mientras la lente se mueve.
//   - Cabecera, hoja "Más", chips y modales usan CSS simple y barato.
// Respeta: interruptor "Cristal líquido", alto contraste, "reducir
// transparencias" y "sin animaciones".
(function () {
  "use strict";
  if (window.EOFLiquidGlass) return;

  var H = document.documentElement;
  var SOPORTA_BF = !!(window.CSS && CSS.supports &&
    (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)")));
  var MQ = window.matchMedia("(max-width:900px)");
  var MQ_REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)");

  var activo = false;
  var instancias = [];

  var OBJETIVOS = [
    { id: "eofTabbar", tipo: "web", tab: ".eof-tab", inset: 4, vert: 3 },
    { id: "navApp", tipo: "panel", tab: ".bn-item", inset: 3, vert: 2 }
  ];

  function permitido() {
    return SOPORTA_BF && MQ.matches &&
      H.getAttribute("data-eof-cristal") !== "off" &&
      H.getAttribute("data-eof-contraste") !== "alto" &&
      H.getAttribute("data-eof-transp") !== "reduce";
  }
  function sinMovimiento() {
    return H.getAttribute("data-eof-anim") === "off" || MQ_REDUCE.matches;
  }

  // ---------- Pagina ocupada ----------
  // js/preferencias.js pone data-eof-lg-ocupado mientras la pagina esta cargando o repintando mucho
  // (tablas, calendario...). Durante ese rato NO se mide nada (cada medicion fuerza un layout de toda
  // la pagina a medio construir), NO se evalua la fluidez (daria falsos "va a tirones") y el
  // desenfoque de la barra esta apagado (CSS). Al calmarse se lanza "eof-lg-libre" y se mide una vez.
  function ocupado() { return H.getAttribute("data-eof-lg-ocupado") === "on"; }
  var esperando = [], esperaT = 0;
  function alLibre(fn) {
    esperando.push(fn);
    if (esperaT) return;
    esperaT = setTimeout(vaciar, 3000);   // tope: nunca se queda esperando para siempre
  }
  function vaciar() {
    clearTimeout(esperaT); esperaT = 0;
    var l = esperando; esperando = [];
    l.forEach(function (f) { try { f(); } catch (e) {} });
  }
  document.addEventListener("eof-lg-libre", vaciar);

  // ---------- CSS (estático, sin variables que cambien por fotograma) ----------
  function inyectarCSS() {
    if (document.getElementById("eof-lg-css")) return;
    var on = "html.eof-lg-on ";
    var css = [
      "html{--lg-ik:1;--lg-lente:rgb(110 128 158 / calc(.18 * var(--lg-ik)));",
      "  --lg-sombra-lente:0 4px 12px rgba(12,27,46,.14);",
      "  --lg-int:inset 0 1px 1px rgba(255,255,255,.9),inset 0 -1px 1px rgba(255,255,255,.4),inset 0 0 0 .5px rgba(12,27,46,.10);}",
      "html[data-theme=\"dark\"]{--lg-lente:rgb(255 255 255 / calc(.14 * var(--lg-ik)));",
      "  --lg-sombra-lente:0 4px 12px rgba(0,0,0,.45);",
      "  --lg-int:inset 0 1px 1px rgba(255,255,255,.28),inset 0 -1px 1px rgba(255,255,255,.07),inset 0 0 0 .5px rgba(255,255,255,.08);}",
      "html[data-eof-cristal-int=\"suave\"]{--lg-ik:1.5;}",
      "html[data-eof-cristal-int=\"intenso\"]{--lg-ik:.7;}",
      "html:not(.eof-lg-on) .eof-lg-lente{display:none!important;}",

      // La barra NO cambia de aspecto al llegar el motor: solo gana la lente
      on + ".eof-lg-ready{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}",
      on + ".eof-lg-ready a,html.eof-lg-on .eof-lg-ready img{-webkit-user-drag:none;user-drag:none;}",
      on + ".eof-lg-ready > .eof-tab,html.eof-lg-on .eof-lg-ready > .bn-item{position:relative;z-index:2;}",
      // El fondo de la pestaña activa lo sustituye la lente (solo cuando ya esta visible)
      on + ".eof-lg-ready.eof-lg-con-lente > .eof-tab,html.eof-lg-on .eof-lg-ready.eof-lg-con-lente > .bn-item{background:transparent!important;box-shadow:none!important;}",
      on + ".eof-lg-ready.eof-lg-con-lente .eof-tab.activo::before{display:none;}",
      on + ".eof-lg-ready.eof-lg-con-lente .bn-item.activo .bn-ico{background:transparent!important;}",

      // Lente: sin backdrop-filter
      ".eof-lg-lente{position:absolute;left:0;top:0;z-index:1;pointer-events:none;box-sizing:border-box;",
      "  border-radius:999px;background:var(--lg-lente);box-shadow:var(--lg-sombra-lente),var(--lg-int);",
      "  opacity:0;transition:opacity .2s,background-color .2s;}",
      ".eof-lg-lente.visible{opacity:1;}",
      ".eof-lg-lente::after{content:\"\";position:absolute;inset:0;border-radius:inherit;pointer-events:none;",
      "  background:linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,0) 45%);}",
      ".eof-lg-ready[data-pulsado] .eof-lg-lente{background:rgba(255,255,255,.34);}",
      "html[data-theme=\"dark\"] .eof-lg-ready[data-pulsado] .eof-lg-lente{background:rgba(255,255,255,.2);}",

      "html[data-eof-anim=\"off\"] .eof-lg-lente{transition:none;}",
      "@media (prefers-reduced-motion:reduce){.eof-lg-lente{transition:none;}}"
    ];
    var st = document.createElement("style");
    st.id = "eof-lg-css";
    st.textContent = css.join("\n");
    document.head.appendChild(st);
  }

  // ---------- Instancia (una por barra) ----------
  function crearInstancia(cfg, el) {
    var inst = {
      cfg: cfg, el: el,
      lente: document.createElement("span"),
      tabs: [], rects: [], act: -1, sig: "",
      x: 0, vx: 0, tx: 0, colocada: false,
      lw: 0, lh: 0, lt: 0, anchoBarra: 0,
      down: null, vivo: false, visible: false, medirPend: false, mo: null, ro: null, moviendo: false
    };
    inst.lente.className = "eof-lg-lente";
    inst.lente.setAttribute("aria-hidden", "true");
    return inst;
  }

  function montarCapas(inst) {
    var el = inst.el;
    if (inst.lente.parentNode !== el) el.insertBefore(inst.lente, el.firstChild);
  }

  function posicionPestana(inst, i) {
    if (i < 0 || !inst.rects[i]) return null;
    return Math.round(inst.rects[i].l + inst.cfg.inset);
  }

  // Mide la barra y las pestañas (solo cuando cambia algo, nunca por fotograma)
  function medir(inst) {
    var el = inst.el;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) { inst.visible = false; inst.lente.classList.remove("visible"); el.classList.remove("eof-lg-con-lente"); return; }
    inst.visible = true;
    var tabs = [].slice.call(el.querySelectorAll(inst.cfg.tab));
    inst.tabs = tabs;
    var bx = el.clientLeft || 0, by = el.clientTop || 0;
    inst.rects = tabs.map(function (t) {
      var q = t.getBoundingClientRect();
      return { l: q.left - r.left - bx, w: q.width, t: q.top - r.top - by, h: q.height };
    });
    inst.act = -1;
    tabs.forEach(function (t, i) {
      if (inst.act < 0 && (t.classList.contains("activo") || t.getAttribute("aria-current") === "page")) inst.act = i;
    });
    inst.anchoBarra = r.width;

    var ref = inst.rects[inst.act >= 0 ? inst.act : 0];
    if (ref) {
      var ins = inst.cfg.inset, vt = inst.cfg.vert;
      inst.lw = Math.round(ref.w - ins * 2);
      inst.lh = Math.round(ref.h - vt * 2);
      inst.lt = Math.round(ref.t + vt);
      var L = inst.lente.style;
      L.width = inst.lw + "px"; L.height = inst.lh + "px"; L.top = inst.lt + "px";
    }

    var objetivo = posicionPestana(inst, inst.act);
    if (objetivo === null) { inst.lente.classList.remove("visible"); el.classList.remove("eof-lg-con-lente"); inst.colocada = false; return; }
    var primera = !inst.colocada;
    if (primera) {
      inst.x = objetivo; inst.vx = 0; inst.colocada = true;
      inst.lente.style.transition = "none";
      inst.lente.style.transform = "translate3d(" + objetivo + "px,0,0)";
    }
    if (!inst.down) inst.tx = objetivo;
    inst.lente.classList.add("visible");
    el.classList.add("eof-lg-con-lente");
    if (primera) {
      void inst.lente.offsetWidth;
      requestAnimationFrame(function () { inst.lente.style.transition = ""; });
    }
    ir(inst);
  }

  // ---------- Deslizamiento por CSS (toques) ----------
  // Un toque ya no usa el muelle de JavaScript: la lente se desliza con una transicion CSS de
  // transform, que la anima el compositor del navegador aunque el hilo principal este ocupado
  // cargando una pagina pesada. El muelle JS queda solo para ARRASTRAR (ahi hay que seguir al dedo).
  function transformLente(x, esc) {
    return "translate3d(" + x.toFixed(1) + "px,0,0)" + (esc !== 1 ? " scale(" + esc + "," + esc + ")" : "");
  }
  function deslizarCss(inst, esc) {
    esc = esc || 1;
    var L = inst.lente.style;
    if (Math.abs(inst.tx - inst.x) < 0.5 && esc === (inst.esc || 1)) return;
    inst.esc = esc;
    inst.moviendo = false;
    if (sinMovimiento()) {
      inst.x = inst.tx; inst.vx = 0; inst.css = false;
      L.transform = transformLente(inst.x, esc);
      return;
    }
    inst.css = true;
    L.willChange = "transform";
    L.transition = "transform .4s cubic-bezier(.3,1.2,.4,1),opacity .2s,background-color .2s";
    L.transform = transformLente(inst.tx, esc);
    inst.x = inst.tx; inst.vx = 0;
    clearTimeout(inst.cssT);
    inst.cssT = setTimeout(function () {
      inst.css = false;
      L.transition = "";
      L.willChange = "";
    }, 460);
  }
  // Si empieza un arrastre en mitad de un deslizamiento CSS, se lee donde esta la lente ahora mismo
  function cancelarCss(inst) {
    if (!inst.css) return;
    var L = inst.lente.style, x = inst.x, esc = 1;
    try {
      var m = getComputedStyle(inst.lente).transform;
      if (m && m !== "none") {
        var v = m.match(/matrix(3d)?\(([^)]+)\)/);
        if (v) {
          var q = v[2].split(",");
          x = parseFloat(v[1] ? q[12] : q[4]);
          esc = parseFloat(q[0]) || 1;
        }
      }
    } catch (e) {}
    clearTimeout(inst.cssT);
    inst.css = false;
    inst.x = x; inst.vx = 0; inst.esc = 1;
    L.transition = "";
    L.transform = transformLente(x, esc);
  }
  // Mueve la lente al objetivo: muelle JS si se esta arrastrando, CSS en cualquier otro caso
  function ir(inst) {
    if (inst.down && inst.down.movido) pedirFotograma();
    else deslizarCss(inst, inst.down ? 1.1 : 1);
  }

  // ---------- Animación (solo mientras la lente se mueve) ----------
  var raf = 0, ultimo = 0;
  function pedirFotograma() {
    if (raf) return;
    ultimo = performance.now();
    raf = requestAnimationFrame(fotograma);
  }
  var anim = { frames: 0, largos: 0 };
  function fotograma(t) {
    raf = 0;
    var crudo = t - ultimo;
    var dt = Math.min(0.032, Math.max(0.001, crudo / 1000));
    ultimo = t;
    var seguir = false;
    for (var i = 0; i < instancias.length; i++) {
      var inst = instancias[i];
      if (inst.vivo && inst.visible && paso(inst, dt)) seguir = true;
    }
    medirAnim(crudo, seguir);
    if (seguir) raf = requestAnimationFrame(fotograma);
  }
  // Vigila tambien la propia animacion de la lente: si va a tirones, cuenta para activar el ahorro
  function medirAnim(crudo, sigue) {
    if (crudo > 0 && crudo < 500) { anim.frames++; if (crudo > 45) anim.largos++; }
    if (sigue) return;
    var f = anim.frames, l = anim.largos;
    anim.frames = 0; anim.largos = 0;
    if (f >= 8 && activo && !ahorroActivo() && !document.hidden && !ocupado() && Date.now() - t0 > 3000) valorar(f, l, 0.3);
  }

  function paso(inst, dt) {
    if (inst.css) return false;   // la anima el navegador por CSS
    var K = 520, C = 2 * 0.74 * Math.sqrt(K);
    if (sinMovimiento()) {
      inst.x = inst.tx; inst.vx = 0;
    } else {
      inst.vx += (K * (inst.tx - inst.x) - C * inst.vx) * dt;
      inst.x += inst.vx * dt;
    }
    var v = Math.abs(inst.vx);
    if (!inst.moviendo) { inst.moviendo = true; inst.lente.style.willChange = "transform"; }
    var sx = 1 + Math.min(v / 2600, 0.18);
    var pulsado = inst.down ? 1.1 : 1;
    inst.lente.style.transform = "translate3d(" + inst.x.toFixed(1) + "px,0,0) scale(" + (sx * pulsado).toFixed(3) + "," + pulsado + ")";
    if (Math.abs(inst.tx - inst.x) > 0.1 || v > 2) return true;
    // Reposo: se coloca exacta en el pixel y se libera la capa de GPU
    inst.x = inst.tx; inst.vx = 0;
    inst.lente.style.transform = "translate3d(" + inst.x.toFixed(1) + "px,0,0)" + (inst.down ? " scale(" + pulsado + "," + pulsado + ")" : "");
    inst.lente.style.willChange = "";
    inst.moviendo = false;
    return false;
  }

  // ---------- Interacción: pulsar y arrastrar la lente ----------
  function pestanaCercana(inst, centroX) {
    var mejor = -1, dMejor = 1e9;
    inst.rects.forEach(function (r, i) {
      var d = Math.abs(r.l + r.w / 2 - centroX);
      if (d < dMejor) { dMejor = d; mejor = i; }
    });
    return mejor;
  }

  function enlazarInteraccion(inst) {
    var el = inst.el;
    el.addEventListener("dragstart", function (e) { e.preventDefault(); });

    el.addEventListener("pointerdown", function (e) {
      if (!inst.vivo || !inst.visible || (e.pointerType === "mouse" && e.button !== 0)) return;
      var tab = e.target.closest ? e.target.closest(inst.cfg.tab) : null;
      if (!tab || !el.contains(tab)) return;
      var idx = inst.tabs.indexOf(tab);
      if (idx < 0) return;
      inst.down = { id: e.pointerId, x0: e.clientX, idx: idx, movido: false, offset: 0 };
      el.setAttribute("data-pulsado", "");
      var p = posicionPestana(inst, idx);
      if (p !== null) inst.tx = p;
      ir(inst);
    }, { passive: true });

    el.addEventListener("pointermove", function (e) {
      var d = inst.down;
      if (!d || d.id !== e.pointerId) return;
      if (!d.movido && Math.abs(e.clientX - d.x0) > 7) {
        d.movido = true;
        cancelarCss(inst);
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        var r = el.getBoundingClientRect();
        d.offset = (inst.x + inst.lw / 2) - (e.clientX - r.left - el.clientLeft);
      }
      if (d.movido) {
        var r2 = el.getBoundingClientRect();
        var primero = inst.rects[0], ultimoR = inst.rects[inst.rects.length - 1];
        var min = primero.l + inst.cfg.inset, max = ultimoR.l + inst.cfg.inset;
        var centro = (e.clientX - r2.left - el.clientLeft) + d.offset;
        inst.tx = Math.max(min - 6, Math.min(max + 6, centro - inst.lw / 2));
        pedirFotograma();
      }
    }, { passive: true });

    function soltar(e, cancelado) {
      var d = inst.down;
      if (!d || d.id !== e.pointerId) return;
      inst.down = null;
      el.removeAttribute("data-pulsado");
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}
      var vuelta = posicionPestana(inst, inst.act);
      if (cancelado) {
        if (vuelta !== null) inst.tx = vuelta;
      } else if (d.movido) {
        var destino = pestanaCercana(inst, inst.tx + inst.lw / 2 + inst.vx * 0.08);
        var p = posicionPestana(inst, destino);
        if (p !== null) inst.tx = p;
        var frenar = function (ev) { ev.preventDefault(); ev.stopPropagation(); };
        el.addEventListener("click", frenar, { capture: true, once: true });
        setTimeout(function () { el.removeEventListener("click", frenar, true); }, 350);
        if (destino >= 0 && destino !== inst.act && inst.tabs[destino]) {
          var t = inst.tabs[destino];
          setTimeout(function () {
            el.removeEventListener("click", frenar, true);
            if (t.tagName === "A" && t.href) window.location.href = t.href;
            else t.click();
          }, sinMovimiento() ? 0 : 120);
        }
      } else {
        // Toque. En enlaces (web) y en las secciones del panel (botones que
        // cambian de seccion) la lente se queda en la pestana tocada: antes
        // volvia atras y luego iba a la nueva (vaiven). "Mas" y similares
        // (aria-label) abren un cajon: la lente vuelve a la activa.
        var tab = inst.tabs[d.idx];
        var queda = tab && (tab.tagName === "A" || (inst.cfg.tipo === "panel" && !tab.getAttribute("aria-label")));
        if (queda) {
          var pp = posicionPestana(inst, d.idx);
          if (pp !== null) inst.tx = pp;
          // Si la seccion no llega a cambiar, la lente regresa a la activa
          if (tab.tagName !== "A") setTimeout(function () { programarMedida(inst); }, 500);
        } else if (vuelta !== null) inst.tx = vuelta;
      }
      if (d.movido) pedirFotograma(); else deslizarCss(inst, 1);
    }
    el.addEventListener("pointerup", function (e) { soltar(e, false); }, { passive: true });
    el.addEventListener("pointercancel", function (e) { soltar(e, true); }, { passive: true });
  }

  // ---------- Ahorro automatico ----------
  // Mide la fluidez REAL del movil mientras se hace scroll (que es cuando el desenfoque se recalcula
  // en cada fotograma). Si dos scrolls seguidos van a tirones, se apaga el desenfoque (data-eof-lg-ahorro)
  // y se recuerda 14 dias. Cabecera y hoja ya no desenfocan; esto es la red de seguridad para moviles justos.
  var CLAVE_AHORRO = "eof-lg-ahorro";
  var medidor = { midiendo: false, frames: 0, largos: 0, ultimo: 0, raf: 0, idle: 0, strikes: 0 };
  var t0 = Date.now();

  function ahorroActivo() { return H.getAttribute("data-eof-lg-ahorro") === "on"; }
  function fijarAhorro(on, recordar) {
    if (on) H.setAttribute("data-eof-lg-ahorro", "on"); else H.removeAttribute("data-eof-lg-ahorro");
    try {
      if (on && recordar) localStorage.setItem(CLAVE_AHORRO, String(Date.now()));
      if (!on) localStorage.removeItem(CLAVE_AHORRO);
    } catch (e) {}
  }
  function muestra(t) {
    medidor.raf = 0;
    if (medidor.ultimo) {
      var dt = t - medidor.ultimo;
      if (dt < 500) { medidor.frames++; if (dt > 45) medidor.largos++; }   // >45 ms = menos de ~22 fps
    }
    medidor.ultimo = t;
    if (medidor.midiendo) medidor.raf = requestAnimationFrame(muestra);
  }
  function finScroll() {
    medidor.midiendo = false;
    if (medidor.raf) { cancelAnimationFrame(medidor.raf); medidor.raf = 0; }
    if (medidor.frames < 20) return;                       // scroll corto: no concluyente
    valorar(medidor.frames, medidor.largos, 0.25);
  }
  // Dos mediciones malas seguidas (scroll o animacion) = ahorro; una buena descuenta una mala
  function valorar(frames, largos, umbral) {
    if (largos / frames > umbral) {
      medidor.strikes++;
      if (medidor.strikes >= 2) fijarAhorro(true, true);
    } else medidor.strikes = Math.max(0, medidor.strikes - 1);
  }
  function alScroll() {
    if (!activo || ahorroActivo() || document.hidden || ocupado() || Date.now() - t0 < 3000) return;  // ignora la carga inicial y las paginas ocupadas
    if (!medidor.midiendo) {
      medidor.midiendo = true; medidor.frames = 0; medidor.largos = 0; medidor.ultimo = 0;
      medidor.raf = requestAnimationFrame(muestra);
    }
    clearTimeout(medidor.idle);
    medidor.idle = setTimeout(finScroll, 200);
  }

  // ---------- Ciclo de vida ----------
  function programarMedida(inst) {
    if (inst.medirPend) return;
    inst.medirPend = true;
    var hacer = function () {
      requestAnimationFrame(function () {
        inst.medirPend = false;
        if (!inst.vivo) return;
        montarCapas(inst);
        medir(inst);
      });
    };
    // Con la pagina ocupada no se mide (forzaria un layout de toda la pagina a medio pintar).
    // Mientras tanto la pestana activa conserva su fondo normal, asi que no se nota nada.
    if (ocupado()) alLibre(hacer); else hacer();
  }

  function firma(inst) {
    var tabs = inst.el.querySelectorAll(inst.cfg.tab);
    var a = -1;
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].classList.contains("activo") || tabs[i].getAttribute("aria-current") === "page") { a = i; break; }
    }
    return tabs.length + "|" + a + "|" + Math.round(inst.el.offsetWidth);
  }

  function engancharBarra(cfg, el) {
    for (var i = 0; i < instancias.length; i++) {
      if (instancias[i].el === el) { if (!instancias[i].vivo) reactivar(instancias[i]); return; }
    }
    var inst = crearInstancia(cfg, el);
    instancias.push(inst);
    inst.vivo = true;
    el.classList.add("eof-lg", "eof-lg-ready");
    montarCapas(inst);
    enlazarInteraccion(inst);

    // La barra del panel reconstruye sus botones con innerHTML
    inst.mo = new MutationObserver(function () {
      if (!inst.vivo) return;
      if (inst.lente.parentNode !== el) { montarCapas(inst); programarMedida(inst); return; }
      var f = firma(inst);
      if (f !== inst.sig) { inst.sig = f; programarMedida(inst); }
    });
    inst.mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-current"] });
    if (window.ResizeObserver) {
      inst.ro = new ResizeObserver(function () { programarMedida(inst); });
      inst.ro.observe(el);
    }
    inst.sig = firma(inst);
    programarMedida(inst);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { programarMedida(inst); });
  }

  function reactivar(inst) {
    inst.vivo = true;
    inst.colocada = false;
    inst.el.classList.add("eof-lg", "eof-lg-ready");
    montarCapas(inst);
    programarMedida(inst);
  }

  function desmontar(inst) {
    inst.vivo = false;
    inst.down = null;
    inst.el.classList.remove("eof-lg-ready", "eof-lg-con-lente");
    inst.el.removeAttribute("data-pulsado");
    if (inst.lente.parentNode) inst.lente.parentNode.removeChild(inst.lente);
  }

  function buscarBarras() {
    OBJETIVOS.forEach(function (cfg) {
      var el = document.getElementById(cfg.id);
      if (el) engancharBarra(cfg, el);
    });
  }

  function evaluar() {
    var ok = permitido();
    if (ok === activo) {
      if (ok) { buscarBarras(); instancias.forEach(function (i) { if (i.vivo) programarMedida(i); }); }
      return;
    }
    activo = ok;
    H.classList.toggle("eof-lg-on", ok);
    if (ok) { inyectarCSS(); buscarBarras(); }
    else instancias.forEach(desmontar);
  }

  function iniciar() {
    if (!SOPORTA_BF || window.__eofLgIni) return;
    window.__eofLgIni = true;
    inyectarCSS();
    new MutationObserver(evaluar).observe(H, {
      attributes: true,
      attributeFilter: ["data-eof-cristal", "data-eof-contraste", "data-eof-transp", "data-eof-anim", "data-theme", "data-eof-cristal-int"]
    });
    var cambio = function () { evaluar(); instancias.forEach(function (i) { if (i.vivo) programarMedida(i); }); };
    if (MQ.addEventListener) MQ.addEventListener("change", cambio); else if (MQ.addListener) MQ.addListener(cambio);
    window.addEventListener("orientationchange", function () { setTimeout(cambio, 250); }, { passive: true });
    // Las barras se crean un instante después de DOMContentLoaded
    new MutationObserver(function () { if (activo) buscarBarras(); }).observe(document.body, { childList: true });
    window.addEventListener("scroll", alScroll, { passive: true, capture: true });
    evaluar();
  }

  window.EOFLiquidGlass = {
    ahorro: function (on) { fijarAhorro(!!on, !!on); },   // ahorro(false) vuelve a activar el desenfoque
    refrescar: function () { instancias.forEach(function (i) { if (i.vivo) programarMedida(i); }); },
    refraccion: false,
    activo: function () { return activo; }
  };

  // Arranca en cuanto existe <body> (no espera a que acaben los ~15 scripts de la
  // pagina): asi la lente esta lista casi a la vez que la barra.
  if (document.body) iniciar();
  else {
    var espera = new MutationObserver(function () {
      if (document.body) { espera.disconnect(); iniciar(); }
    });
    espera.observe(H, { childList: true });
    document.addEventListener("DOMContentLoaded", function () { espera.disconnect(); if (!window.__eofLgIni) iniciar(); });
  }
})();
