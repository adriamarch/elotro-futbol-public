/* luto.js — Luto en la web: lazo negro sobre el logo (+ franja de texto opcional).
   ---------------------------------------------------------------------------------------------------
   YA NO SE EDITA AQUÍ. Se activa y se desactiva desde el panel:
       Funcionalidades > Más > Luto web   (solo Responsables)
   Allí también se elige el mensaje y, si se quiere, cuándo se apaga solo.

   Cómo funciona: lee GET /api/luto y guarda la última respuesta en localStorage para pintar el luto al
   instante en las siguientes visitas (sin parpadeo de color). Si la API falla, se mantiene lo último que
   se supo; si nunca se supo nada, la web se ve normal.

   Previsualizar sin tocar nada (solo en tu navegador):  ?luto=1 (fuerza on)  ·  ?luto=0 (fuerza off). */
(function () {
  "use strict";

  var CLAVE = "eof_luto_v2";
  var doc = document.documentElement;

  /* --- interruptor de prueba por URL --- */
  var forzar = null;
  try { var m = /[?&]luto=([01])(&|$)/.exec(location.search); if (m) forzar = m[1] === "1"; } catch (e) {}

  var cfg = null;      // { activo, mensaje, grises, hasta }
  var aplicado = false;

  function leerCache() {
    try { var c = JSON.parse(localStorage.getItem(CLAVE) || "null"); return c && typeof c === "object" ? c : null; } catch (e) { return null; }
  }
  function guardarCache(c) { try { localStorage.setItem(CLAVE, JSON.stringify(c)); } catch (e) {} }

  function vigente(c) {
    if (forzar !== null) return forzar;
    if (!c || c.activo !== true) return false;
    if (c.hasta) { var t = Date.parse(c.hasta); if (isFinite(t) && Date.now() > t) return false; }
    return true;
  }

  /* ---------- aspecto ---------- */
  var LAZO_SVG =
    '<span class="eof-luto-lazo" role="button" tabindex="0" aria-haspopup="dialog" aria-expanded="false" aria-label="Lazo negro de luto. Más información">' +
    '<svg viewBox="0 0 32 46" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="eofLutoG" x1="0" y1="0" x2=".4" y2="1">' +
        '<stop offset="0" stop-color="#4a4a52"/><stop offset=".45" stop-color="#17171b"/><stop offset="1" stop-color="#050506"/>' +
      '</linearGradient></defs>' +
      '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<g stroke="#fff" stroke-width="5.6">' +
          '<path d="M16 21C6 13 4.5 5 10 2.6 13.6 1.2 16 4.2 16 7.6 16 4.2 18.4 1.2 22 2.6 27.5 5 26 13 16 21Z"/>' +
          '<path d="M16 21C14 28 11.6 35 8.6 42.5"/><path d="M16 21C18 28 20.4 35 23.4 42.5"/>' +
        '</g>' +
        '<g stroke="url(#eofLutoG)" stroke-width="3.5">' +
          '<path d="M16 21C6 13 4.5 5 10 2.6 13.6 1.2 16 4.2 16 7.6 16 4.2 18.4 1.2 22 2.6 27.5 5 26 13 16 21Z"/>' +
          '<path d="M16 21C14 28 11.6 35 8.6 42.5"/><path d="M16 21C18 28 20.4 35 23.4 42.5"/>' +
        '</g>' +
        '<path d="M9.3 4.6C7.6 7 8.2 11.4 12.2 15.4" stroke="#fff" stroke-opacity=".34" stroke-width=".8"/>' +
        '<path d="M14.7 26.5C13.5 30.5 12.2 34 10.6 37.8" stroke="#fff" stroke-opacity=".2" stroke-width=".7"/>' +
      '</g>' +
      '<ellipse cx="16" cy="21" rx="2.2" ry="2.1" fill="url(#eofLutoG)" stroke="#fff" stroke-width=".9"/>' +
    '</svg></span>';

  var CSS =
    ".eof-luto-logo{position:relative;display:inline-flex;align-items:center;flex:none}" +
    ".eof-luto-lazo{position:absolute;left:-8%;bottom:-14%;width:36%;min-width:15px;max-width:26px;height:auto;z-index:2;" +
      "transform:rotate(13deg);transform-origin:50% 25%;cursor:pointer;-webkit-tap-highlight-color:transparent;" +
      "animation:eofLutoEntra .8s cubic-bezier(.2,.9,.3,1.15) both}" +
    ".eof-luto-lazo svg{display:block;width:100%;height:auto;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.38));transition:transform .25s cubic-bezier(.2,.9,.3,1.3),filter .25s}" +
    ".eof-luto-lazo::before{content:'';position:absolute;inset:-8px}" +
    ".eof-luto-lazo:hover svg,.eof-luto-lazo[aria-expanded=true] svg{transform:scale(1.14) rotate(-4deg);filter:drop-shadow(0 3px 5px rgba(0,0,0,.45))}" +
    ".eof-luto-lazo:focus-visible{outline:2px solid #5bb8e8;outline-offset:3px;border-radius:6px}" +
    "#eof-luto-tarjeta{position:fixed;z-index:2147483000;width:min(330px,calc(100vw - 24px));box-sizing:border-box;padding:20px 20px 16px;border-radius:18px;" +
      "background:radial-gradient(120% 90% at 0 0,#26262c 0,#121216 55%,#0a0a0c 100%);color:#f4f4f6;font:400 .88rem/1.55 Inter,Arial,sans-serif;" +
      "border:1px solid rgba(255,255,255,.14);box-shadow:0 18px 44px rgba(0,0,0,.5),0 2px 0 rgba(255,255,255,.06) inset;" +
      "opacity:0;transform:translateY(-8px) scale(.97);transform-origin:var(--eof-flecha,24px) -8px;visibility:hidden;" +
      "transition:opacity .22s ease,transform .26s cubic-bezier(.2,.9,.3,1.2),visibility 0s .26s}" +
    "#eof-luto-tarjeta.abierta{opacity:1;transform:none;visibility:visible;transition:opacity .22s ease,transform .26s cubic-bezier(.2,.9,.3,1.2)}" +
    "#eof-luto-tarjeta::before{content:'';position:absolute;top:-7px;left:calc(var(--eof-flecha,24px) - 7px);width:14px;height:14px;transform:rotate(45deg);" +
      "background:#26262c;border-left:1px solid rgba(255,255,255,.14);border-top:1px solid rgba(255,255,255,.14);border-radius:3px 0 0 0}" +
    "#eof-luto-tarjeta .eof-t-cab{display:flex;align-items:center;gap:12px;margin-bottom:12px}" +
    "#eof-luto-tarjeta .eof-t-ico{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.08);" +
      "box-shadow:0 0 0 1px rgba(255,255,255,.16) inset}" +
    "#eof-luto-tarjeta .eof-t-ico svg{width:20px;height:auto}" +
    "#eof-luto-tarjeta .eof-t-pre{display:block;font-size:.66rem;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:rgba(255,255,255,.55)}" +
    "#eof-luto-tarjeta .eof-t-tit{display:block;margin-top:2px;font:600 1.08rem/1.25 Oswald,Inter,Arial,sans-serif;letter-spacing:.2px;color:#fff}" +
    "#eof-luto-tarjeta .eof-t-sep{height:1px;margin:2px 0 12px;background:linear-gradient(90deg,rgba(255,255,255,.28),rgba(255,255,255,0))}" +
    "#eof-luto-tarjeta .eof-t-txt{margin:0;color:rgba(255,255,255,.86);white-space:pre-line}" +
    "#eof-luto-tarjeta .eof-t-pie{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;font-size:.72rem;color:rgba(255,255,255,.5)}" +
    "#eof-luto-tarjeta .eof-t-cerrar{appearance:none;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06);color:#fff;font:600 .72rem Inter,Arial,sans-serif;" +
      "padding:6px 12px;border-radius:999px;cursor:pointer;transition:background .18s}" +
    "#eof-luto-tarjeta .eof-t-cerrar:hover{background:rgba(255,255,255,.16)}" +
    "@keyframes eofLutoEntra{from{opacity:0;transform:rotate(13deg) translateY(-7px) scale(.55)}to{opacity:1;transform:rotate(13deg) translateY(0) scale(1)}}" +
    "#eof-luto-franja{display:block;background:#0b0b0d;color:#f4f4f6;text-align:center;border-bottom:1px solid rgba(255,255,255,.14);" +
      "font:500 .8rem/1.35 Inter,Arial,sans-serif;letter-spacing:.25px;padding:7px 16px}" +
    "@media(max-width:600px){#eof-luto-franja{font-size:.74rem;padding:6px 12px}}" +
    "@media(prefers-reduced-motion:reduce){.eof-luto-lazo{animation:none}.eof-luto-lazo svg,#eof-luto-tarjeta,#eof-luto-tarjeta.abierta{transition:none}}" +
    "@media print{#eof-luto-franja,#eof-luto-tarjeta{display:none}.eof-luto-lazo{display:none}}";

  var observador = null;
  var themeOriginal; // undefined = aún no tocado

  function asegurarCss() {
    if (document.getElementById("eof-luto-css") || !document.head) return;
    var st = document.createElement("style");
    st.id = "eof-luto-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function colocarLazo() {
    var marca = document.querySelector(".main-header .brand");
    if (!marca) return false;
    if (marca.querySelector(".eof-luto-lazo")) return true;
    var logos = marca.querySelectorAll("img.brand-logo");
    if (!logos.length) return false;
    var envoltorio = marca.querySelector(".eof-luto-logo");
    if (!envoltorio) {
      envoltorio = document.createElement("span");
      envoltorio.className = "eof-luto-logo";
      logos[0].parentNode.insertBefore(envoltorio, logos[0]);
      for (var i = 0; i < logos.length; i++) envoltorio.appendChild(logos[i]);
    }
    envoltorio.insertAdjacentHTML("beforeend", LAZO_SVG);
    return true;
  }

  function quitarLazo() {
    var l = document.querySelectorAll(".eof-luto-lazo");
    for (var i = 0; i < l.length; i++) l[i].parentNode.removeChild(l[i]);
    var e = document.querySelectorAll(".eof-luto-logo");
    for (var j = 0; j < e.length; j++) {
      var w = e[j], p = w.parentNode;
      while (w.firstChild) p.insertBefore(w.firstChild, w);
      p.removeChild(w);
    }
  }

  function franja() {
    var f = document.getElementById("eof-luto-franja");
    var texto = cfg && cfg.mensaje;
    if (!texto) { if (f) f.parentNode.removeChild(f); return; }
    if (!document.body) return;
    if (!f) {
      f = document.createElement("div");
      f.id = "eof-luto-franja";
      f.setAttribute("role", "note");
      document.body.insertBefore(f, document.body.firstChild);
    }
    if (f.textContent !== texto) f.textContent = texto;
  }

  function barraNavegador(on) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (on) {
      if (!meta && document.head) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
      if (!meta) return;
      if (themeOriginal === undefined) themeOriginal = meta.getAttribute("content");
      meta.setAttribute("content", "#000000");
    } else if (meta && themeOriginal !== undefined) {
      if (themeOriginal === null) meta.removeAttribute("content"); else meta.setAttribute("content", themeOriginal);
      themeOriginal = undefined;
    }
  }

  /* ---------- tarjeta de información (al pasar el ratón / pulsar / teclado) ---------- */
  var tarjeta = null, lazoAbierto = null, tCierre = null, tAbre = null;
  var TIT_DEF = "Hoy estamos de luto";
  var TXT_DEF = "ELOTROFÚTBOLTV se suma al luto. Gracias por acompañarnos en estos momentos.";

  function icoTarjeta() {
    return '<svg viewBox="0 0 32 46" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
      '<g stroke="#fff" stroke-width="3.4"><path d="M16 21C6 13 4.5 5 10 2.6 13.6 1.2 16 4.2 16 7.6 16 4.2 18.4 1.2 22 2.6 27.5 5 26 13 16 21Z"/><path d="M16 21C14 28 11.6 35 8.6 42.5"/><path d="M16 21C18 28 20.4 35 23.4 42.5"/></g></g></svg>';
  }
  function crearTarjeta() {
    if (tarjeta) return tarjeta;
    tarjeta = document.createElement("div");
    tarjeta.id = "eof-luto-tarjeta";
    tarjeta.setAttribute("role", "dialog");
    tarjeta.setAttribute("aria-label", "Información sobre el luto");
    tarjeta.innerHTML =
      '<div class="eof-t-cab"><span class="eof-t-ico">' + icoTarjeta() + '</span><span><span class="eof-t-pre">En memoria</span><span class="eof-t-tit"></span></span></div>' +
      '<div class="eof-t-sep"></div><p class="eof-t-txt"></p>' +
      '<div class="eof-t-pie"><span>ELOTROFÚTBOLTV</span><button type="button" class="eof-t-cerrar">Cerrar</button></div>';
    tarjeta.addEventListener("mouseenter", function () { clearTimeout(tCierre); });
    tarjeta.addEventListener("mouseleave", function () { programarCierre(); });
    tarjeta.querySelector(".eof-t-cerrar").addEventListener("click", cerrarTarjeta);
    document.body.appendChild(tarjeta);
    return tarjeta;
  }
  function abrirTarjeta(lazo) {
    if (!document.body || !lazo) return;
    clearTimeout(tCierre);
    var t = crearTarjeta();
    t.querySelector(".eof-t-tit").textContent = (cfg && cfg.mensaje) || TIT_DEF;
    t.querySelector(".eof-t-txt").textContent = (cfg && cfg.detalle) || TXT_DEF;
    t.classList.add("abierta");
    if (lazoAbierto && lazoAbierto !== lazo) lazoAbierto.setAttribute("aria-expanded", "false");
    lazoAbierto = lazo;
    lazo.setAttribute("aria-expanded", "true");
    posicionarTarjeta();
  }
  function posicionarTarjeta() {
    if (!tarjeta || !lazoAbierto) return;
    var r = lazoAbierto.getBoundingClientRect();
    var ancho = tarjeta.offsetWidth, margen = 12;
    var centro = r.left + r.width / 2;
    var izq = Math.max(margen, Math.min(centro - 24, window.innerWidth - ancho - margen));
    tarjeta.style.left = izq + "px";
    tarjeta.style.top = (r.bottom + 12) + "px";
    tarjeta.style.setProperty("--eof-flecha", Math.max(16, Math.min(ancho - 16, centro - izq)) + "px");
  }
  function cerrarTarjeta() {
    clearTimeout(tCierre); clearTimeout(tAbre);
    if (tarjeta) tarjeta.classList.remove("abierta");
    if (lazoAbierto) { lazoAbierto.setAttribute("aria-expanded", "false"); lazoAbierto = null; }
  }
  function programarCierre() { clearTimeout(tCierre); tCierre = setTimeout(cerrarTarjeta, 260); }
  function esAbierta() { return !!(tarjeta && tarjeta.classList.contains("abierta")); }
  function lazoDe(n) { return n && n.closest ? n.closest(".eof-luto-lazo") : null; }
  var conRaton = false;
  try { conRaton = window.matchMedia("(hover:hover) and (pointer:fine)").matches; } catch (e) {}

  var escuchando = false;
  function escuchar() {
    if (escuchando) return;
    escuchando = true;
    // Está dentro del enlace del logo: se evita que el clic lleve a la portada.
    document.addEventListener("click", function (e) {
      var l = lazoDe(e.target);
      if (l) {
        e.preventDefault(); e.stopPropagation();
        if (esAbierta() && lazoAbierto === l) cerrarTarjeta(); else abrirTarjeta(l);
      } else if (esAbierta() && !(tarjeta && tarjeta.contains(e.target))) cerrarTarjeta();
    }, true);
    document.addEventListener("keydown", function (e) {
      var l = lazoDe(e.target);
      if (l && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); if (esAbierta() && lazoAbierto === l) cerrarTarjeta(); else abrirTarjeta(l); }
      else if (e.key === "Escape" && esAbierta()) cerrarTarjeta();
    }, true);
    if (conRaton) {
      document.addEventListener("mouseover", function (e) {
        var l = lazoDe(e.target);
        if (l && !(esAbierta() && lazoAbierto === l)) { clearTimeout(tAbre); tAbre = setTimeout(function () { abrirTarjeta(l); }, 120); }
        else if (l) clearTimeout(tCierre);
      });
      document.addEventListener("mouseout", function (e) {
        var l = lazoDe(e.target);
        if (l && !lazoDe(e.relatedTarget)) { clearTimeout(tAbre); programarCierre(); }
      });
    }
    window.addEventListener("resize", posicionarTarjeta);
    window.addEventListener("scroll", function () { if (esAbierta()) posicionarTarjeta(); }, { passive: true });
  }

  /* La cabecera la pinta layout.js un momento después, y puede repintarla (sesión, idioma...):
     vigilamos solo hasta que el lazo esté puesto y lo recolocamos si desaparece. */
  function vigilar() {
    if (observador || !window.MutationObserver) return;
    var pendiente = false;
    observador = new MutationObserver(function () {
      if (pendiente) return;
      pendiente = true;
      (window.requestAnimationFrame || setTimeout)(function () {
        pendiente = false;
        if (aplicado && !document.querySelector(".eof-luto-lazo")) colocarLazo();
      });
    });
    observador.observe(document.body || doc, { childList: true, subtree: true });
  }

  function encender() {
    asegurarCss();
    aplicado = true;
    var listo = function () {
      colocarLazo();
      franja();
      barraNavegador(true);
      escuchar();
      vigilar();
    };
    if (document.body) listo(); else document.addEventListener("DOMContentLoaded", listo);
  }

  function apagar() {
    aplicado = false;
    cerrarTarjeta();
    if (observador) { observador.disconnect(); observador = null; }
    quitarLazo();
    var f = document.getElementById("eof-luto-franja");
    if (f) f.parentNode.removeChild(f);
    barraNavegador(false);
  }

  function aplicar() {
    if (vigente(cfg)) encender(); else if (aplicado) apagar();
  }

  /* 1) al instante con lo último que se sabía; 2) se confirma con la API */
  cfg = leerCache();
  if (forzar === true && !cfg) cfg = { activo: true, mensaje: "", grises: true, hasta: null };
  aplicar();

  if (forzar === null) {
    try {
      /* Mismo motor que el resto de la web (dominio de la API + failover) si config.js ya cargó. */
      var pedir = typeof window.eofApiFetch === "function"
        ? window.eofApiFetch("/api/luto")
        : fetch("https://api.elotrofutbol.media/api/luto", { headers: { Accept: "application/json" } });
      pedir
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || typeof d !== "object") return;
          cfg = { activo: d.activo === true, mensaje: typeof d.mensaje === "string" ? d.mensaje : "", detalle: typeof d.detalle === "string" ? d.detalle : "", hasta: d.hasta || null };
          guardarCache(cfg);
          if (aplicado) { // si ya estaba puesto, refresca mensaje/grises sin repintar todo
            franja();
          }
          aplicar();
        })
        .catch(function () { /* sin red: se queda como estaba */ });
    } catch (e) {}
  }
})();
