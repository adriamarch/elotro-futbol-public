/* =====================================================================
   VISOR DE FOTOS Y VÍDEOS (compartido)
   Uso:
     VisorMedia.abrir(items, indice, opciones)
       items   = [{ tipo:"foto"|"video", url, thumb?, titulo?, credito?,
                    enlace?:{href,texto}, compartirUrl? }]
       opciones= { titulo?, compartirUrl?(item), onCambio?(i), onCerrar?() }
     VisorMedia.cerrar()
     VisorMedia.urlBase / conAncho / urlDescarga / posterVideo  (utilidades Cloudinary)

   Incluye: zoom (rueda, doble clic/toque, pellizco, botones, teclado),
   arrastrar para mover, deslizar para cambiar o cerrar, tira de
   miniaturas, pase de diapositivas, pantalla completa, descargar,
   compartir (nativo o menú), copiar enlace, abrir original, vídeo con
   velocidad/bucle/PiP, atajos de teclado, botón "atrás" del móvil,
   enfoque atrapado y accesibilidad (ARIA).
   ===================================================================== */
(function () {
  "use strict";
  if (window.VisorMedia) return;

  var ZOOM_MAX = 5;
  var PASE_MS = 4500;
  var VELOCIDADES = [1, 1.25, 1.5, 2, 0.5];

  /* ---------- Utilidades Cloudinary ---------- */
  function urlBase(url) {
    if (!url || typeof url !== "string") return url || "";
    var m = "/upload/", k = url.indexOf(m);
    if (k < 0) return url;
    var resto = url.slice(k + m.length);
    var seg = resto.split("/")[0];
    if (/(^|,)(f_|q_|w_|h_|c_|dpr_|so_|fl_)/.test(seg)) return url.slice(0, k + m.length) + resto.slice(seg.length + 1);
    return url;
  }
  function conAncho(url, w) {
    var b = urlBase(url), m = "/upload/", k = b.indexOf(m);
    if (k < 0) return b;
    return b.slice(0, k + m.length) + "f_auto,q_auto,c_limit,dpr_auto,w_" + w + "/" + b.slice(k + m.length);
  }
  function urlDescarga(url) {
    var b = urlBase(url), m = "/upload/", k = b.indexOf(m);
    if (k < 0) return b;
    return b.slice(0, k + m.length) + "fl_attachment/" + b.slice(k + m.length);
  }
  function posterVideo(url, w) {
    var b = urlBase(url), m = "/upload/", k = b.indexOf(m);
    if (k < 0) return "";
    var jpg = b.replace(/\.[a-z0-9]{2,4}(\?.*)?$/i, ".jpg");
    k = jpg.indexOf(m);
    return jpg.slice(0, k + m.length) + "so_0,q_auto,c_limit,w_" + (w || 800) + "/" + jpg.slice(k + m.length);
  }

  /* ---------- Iconos ---------- */
  function ico(d, extra) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (extra || "") + ">" + d + "</svg>";
  }
  var I = {
    cerrar: ico('<path d="M18 6 6 18M6 6l12 12"/>'),
    prev: ico('<path d="m15 18-6-6 6-6"/>'),
    next: ico('<path d="m9 18 6-6-6-6"/>'),
    zoomMas: ico('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>'),
    zoomMenos: ico('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6"/>'),
    pantalla: ico('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
    pantallaSalir: ico('<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>'),
    pase: ico('<path d="M7 4.5v15l12-7.5z"/>'),
    pausa: ico('<path d="M8 5v14M16 5v14"/>'),
    info: ico('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    ayuda: ico('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>'),
    descargar: ico('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
    compartir: ico('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-3.9M8.6 13.5l6.8 3.9"/>'),
    enlace: ico('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
    externo: ico('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
    velocidad: ico('<path d="m12 14 4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>'),
    bucle: ico('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
    pip: ico('<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor"/>'),
    correo: ico('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
    whatsapp: ico('<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3L3 21z"/>'),
    telegram: ico('<path d="M21 4 3 11l6 2 2 6 3-4 4 3z"/><path d="m9 13 12-9"/>'),
    x: ico('<path d="M4 4l16 16M20 4 4 20"/>'),
    facebook: ico('<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>'),
    imgError: ico('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 15 5-5 4 4M14 12l3-3 4 4M9 8.5h.01"/>', ""),
    playMini: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>'
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

  /* ---------- Estado ---------- */
  var root = null, S = null;
  var el = {};
  var ptrs = new Map(), g = null, ultimoTap = null;
  var tIdle = null, tPase = null, tToast = null;
  var listenersGlobales = false;

  function cur() { return S && S.items[S.i]; }
  function esFoto() { var it = cur(); return !!it && it.tipo !== "video"; }
  function coarse() { return window.matchMedia && window.matchMedia("(pointer:coarse)").matches; }

  function norm(it) {
    var tipo = it.tipo === "video" ? "video" : "foto";
    return {
      tipo: tipo,
      url: it.url || it.cloudinary_url || "",
      thumb: it.thumb || "",
      titulo: it.titulo || "",
      credito: it.credito || "",
      enlace: it.enlace || null,
      compartirUrl: it.compartirUrl || ""
    };
  }

  /* ---------- Construcción del DOM ---------- */
  function construir() {
    root = document.createElement("div");
    root.className = "vm";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Visor de fotos y vídeos");
    root.innerHTML =
      '<div class="vm-fondo"></div>' +
      '<div class="vm-progreso" aria-hidden="true"><i></i></div>' +
      '<header class="vm-top">' +
        '<div class="vm-contador" aria-live="polite"><span data-vm="pos"></span><small data-vm="tipo"></small></div>' +
        '<div class="vm-top-acciones">' +
          '<button type="button" class="vm-btn vm-redondo" data-vm="pase" title="Pase de diapositivas (P)" aria-label="Pase de diapositivas">' + I.pase + '</button>' +
          '<span class="vm-sep" aria-hidden="true"></span>' +
          '<button type="button" class="vm-btn vm-redondo" data-vm="zoom-menos" title="Alejar (−)" aria-label="Alejar">' + I.zoomMenos + '</button>' +
          '<button type="button" class="vm-btn vm-zoom-etiqueta" data-vm="zoom-reset" title="Tamaño real / ajustar (0)" aria-label="Restablecer zoom">100%</button>' +
          '<button type="button" class="vm-btn vm-redondo" data-vm="zoom-mas" title="Acercar (+)" aria-label="Acercar">' + I.zoomMas + '</button>' +
          '<span class="vm-sep" aria-hidden="true"></span>' +
          '<button type="button" class="vm-btn vm-redondo" data-vm="info" title="Mostrar u ocultar información (I)" aria-label="Información">' + I.info + '</button>' +
          '<button type="button" class="vm-btn vm-redondo" data-vm="ayuda" title="Atajos de teclado (?)" aria-label="Atajos de teclado">' + I.ayuda + '</button>' +
          '<button type="button" class="vm-btn vm-redondo" data-vm="pantalla" title="Pantalla completa (F)" aria-label="Pantalla completa">' + I.pantalla + '</button>' +
          '<button type="button" class="vm-btn vm-redondo" data-vm="cerrar" title="Cerrar (Esc)" aria-label="Cerrar">' + I.cerrar + '</button>' +
        '</div>' +
      '</header>' +
      '<div class="vm-escena" data-vm="escena">' +
        '<button type="button" class="vm-btn vm-nav vm-prev" data-vm="prev" title="Anterior (←)" aria-label="Anterior">' + I.prev + '</button>' +
        '<button type="button" class="vm-btn vm-nav vm-next" data-vm="next" title="Siguiente (→)" aria-label="Siguiente">' + I.next + '</button>' +
        '<div class="vm-pista" data-vm="pista"></div>' +
        '<div class="vm-spinner" data-vm="spinner" hidden></div>' +
        '<div class="vm-error" data-vm="error" hidden>' + I.imgError +
          '<strong>No se ha podido cargar</strong><span>Comprueba tu conexión e inténtalo de nuevo.</span>' +
          '<button type="button" class="vm-btn vm-pildora" data-vm="reintentar">Reintentar</button></div>' +
      '</div>' +
      '<footer class="vm-pie">' +
        '<div class="vm-pie-fila">' +
          '<div class="vm-info" data-vm="infoTexto"></div>' +
          '<div class="vm-acciones">' +
            '<button type="button" class="vm-btn vm-pildora vm-solo-video" data-vm="velocidad" title="Velocidad (&lt; &gt;)">' + I.velocidad + '<span class="vm-txt">1×</span></button>' +
            '<button type="button" class="vm-btn vm-pildora vm-solo-video" data-vm="bucle" title="Repetir vídeo (L)">' + I.bucle + '<span class="vm-txt">Bucle</span></button>' +
            '<button type="button" class="vm-btn vm-pildora vm-solo-video" data-vm="pip" title="Imagen en imagen">' + I.pip + '<span class="vm-txt">Flotante</span></button>' +
            '<button type="button" class="vm-btn vm-pildora" data-vm="descargar" title="Descargar (D)">' + I.descargar + '<span class="vm-txt">Descargar</span></button>' +
            '<button type="button" class="vm-btn vm-pildora" data-vm="compartir" title="Compartir (S)" aria-haspopup="true" aria-expanded="false">' + I.compartir + '<span class="vm-txt">Compartir</span></button>' +
            '<button type="button" class="vm-btn vm-pildora" data-vm="copiar" title="Copiar enlace (C)">' + I.enlace + '<span class="vm-txt">Copiar enlace</span></button>' +
            '<a class="vm-btn vm-pildora" data-vm="original" target="_blank" rel="noopener" title="Abrir original en una pestaña nueva">' + I.externo + '<span class="vm-txt">Original</span></a>' +
            '<div class="vm-menu" data-vm="menu" role="menu" hidden></div>' +
          '</div>' +
        '</div>' +
        '<div class="vm-tira" data-vm="tira" role="tablist" aria-label="Miniaturas"></div>' +
      '</footer>' +
      '<div class="vm-ayuda" data-vm="panelAyuda" hidden><div class="vm-ayuda-caja" role="document">' +
        '<h2>Atajos de teclado</h2><dl>' +
          '<dt><kbd>←</kbd><kbd>→</kbd></dt><dd>Anterior / siguiente</dd>' +
          '<dt><kbd>Inicio</kbd><kbd>Fin</kbd></dt><dd>Primera / última</dd>' +
          '<dt><kbd>+</kbd><kbd>−</kbd><kbd>0</kbd></dt><dd>Acercar, alejar, ajustar</dd>' +
          '<dt><kbd>P</kbd></dt><dd>Pase de diapositivas</dd>' +
          '<dt><kbd>F</kbd></dt><dd>Pantalla completa</dd>' +
          '<dt><kbd>I</kbd></dt><dd>Mostrar / ocultar información</dd>' +
          '<dt><kbd>D</kbd><kbd>S</kbd><kbd>C</kbd></dt><dd>Descargar, compartir, copiar enlace</dd>' +
          '<dt><kbd>Espacio</kbd><kbd>M</kbd></dt><dd>Vídeo: reproducir/pausar, silenciar</dd>' +
          '<dt><kbd>⇧</kbd>+<kbd>←</kbd><kbd>→</kbd></dt><dd>Vídeo: retroceder / avanzar 5 s</dd>' +
          '<dt><kbd>Esc</kbd></dt><dd>Cerrar</dd>' +
        '</dl>' +
        '<p style="margin:16px 0 0;font-size:.78rem;color:#9aa8ba">En el móvil: desliza para cambiar, pellizca o toca dos veces para hacer zoom, y desliza hacia abajo para cerrar.</p>' +
        '<button type="button" class="vm-btn vm-pildora vm-ayuda-cerrar" data-vm="ayudaCerrar">Entendido</button>' +
      '</div></div>';

    document.body.appendChild(root);
    root.querySelectorAll("[data-vm]").forEach(function (n) { el[n.getAttribute("data-vm")] = n; });

    if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) el.pantalla.hidden = true;
    if (!(document.pictureInPictureEnabled)) el.pip.hidden = true;
    if (coarse()) el.ayuda.hidden = true;

    ligarEventos();
  }

  /* ---------- Eventos ---------- */
  function ligarEventos() {
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-vm]");
      if (!b || !root.contains(b)) return;
      var a = b.getAttribute("data-vm");
      switch (a) {
        case "cerrar": cerrar(); break;
        case "prev": ir(-1); break;
        case "next": ir(1); break;
        case "zoom-mas": zoomBoton(1.5); break;
        case "zoom-menos": zoomBoton(1 / 1.5); break;
        case "zoom-reset": restablecerZoom(true); break;
        case "pase": alternarPase(); break;
        case "pantalla": alternarPantallaCompleta(); break;
        case "info": alternarInfo(); break;
        case "ayuda": alternarAyuda(); break;
        case "ayudaCerrar": alternarAyuda(false); break;
        case "descargar": descargar(); break;
        case "compartir": compartir(); break;
        case "copiar": copiarEnlace(); break;
        case "velocidad": ciclarVelocidad(); break;
        case "bucle": alternarBucle(); break;
        case "pip": alternarPip(); break;
        case "reintentar": pintar(0); break;
        case "tira-mini": break;
      }
    });
    el.tira.addEventListener("click", function (e) {
      var m = e.target.closest(".vm-mini");
      if (!m) return;
      var n = Number(m.dataset.i);
      if (n !== S.i) { var dir = n > S.i ? 1 : -1; S.i = n; pintar(dir); }
    });
    el.panelAyuda.addEventListener("click", function (e) { if (e.target === el.panelAyuda) alternarAyuda(false); });

    /* Gestos sobre la escena */
    var esc = el.escena;
    esc.addEventListener("pointerdown", alBajar);
    esc.addEventListener("pointermove", alMover);
    esc.addEventListener("pointerup", alSoltar);
    esc.addEventListener("pointercancel", alSoltar);
    esc.addEventListener("wheel", function (e) {
      if (!S || !esFoto()) return;
      e.preventDefault();
      zoomEn(S.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX, e.clientY);
    }, { passive: false });

    /* Ocultar controles si el ratón se queda quieto */
    root.addEventListener("pointermove", despertar);
    root.addEventListener("pointerdown", despertar);

    /* Cerrar menú de compartir al pulsar fuera */
    root.addEventListener("pointerdown", function (e) {
      if (!el.menu.hidden && !e.target.closest('[data-vm="menu"],[data-vm="compartir"]')) cerrarMenu();
    });

    if (!listenersGlobales) {
      listenersGlobales = true;
      document.addEventListener("keydown", alTeclear, true);
      window.addEventListener("popstate", function () { if (S) { S.empujado = false; limpiar(); } });
      document.addEventListener("fullscreenchange", actualizarPantalla);
      document.addEventListener("webkitfullscreenchange", actualizarPantalla);
    }
  }

  function despertar() {
    if (!S) return;
    root.classList.remove("vm-quieto");
    clearTimeout(tIdle);
    if (coarse()) return;
    tIdle = setTimeout(function () {
      if (!S || !el.menu.hidden || !el.panelAyuda.hidden) return;
      if (root.querySelector(".vm-pie:hover, .vm-top:hover")) { despertar(); return; }
      root.classList.add("vm-quieto");
    }, 3200);
  }

  /* ---------- Apertura / cierre ---------- */
  function abrir(items, indice, opciones) {
    if (!items || !items.length) return;
    if (!root) construir();
    if (S) limpiar(true);
    S = {
      items: items.map(norm),
      i: clamp(indice | 0, 0, items.length - 1),
      opts: opciones || {},
      zoom: 1, x: 0, y: 0,
      pase: false, empujado: false,
      foco: document.activeElement,
      hires: false, velocidad: 1, bucle: false
    };
    try { S.sinInfo = localStorage.getItem("vm_sin_info") === "1"; } catch (e) { S.sinInfo = false; }
    root.classList.toggle("vm-sin-info", S.sinInfo);
    root.classList.toggle("vm-solo", S.items.length < 2);
    root.hidden = false;
    document.documentElement.classList.add("vm-abierto");
    construirTira();
    try { history.pushState({ vm: 1 }, ""); S.empujado = true; } catch (e) { /* sin historial */ }
    pintar(0);
    despertar();
    setTimeout(function () { if (S) el.cerrar.focus({ preventScroll: true }); }, 30);
  }

  function cerrar() {
    if (!S) return;
    if (S.empujado) {
      S.empujado = false;
      var antes = S;
      history.back();
      // Si el navegador no dispara popstate, nos aseguramos de limpiar.
      setTimeout(function () { if (S === antes) limpiar(); }, 350);
    } else {
      limpiar();
    }
  }

  function limpiar(silencioso) {
    if (!S) return;
    pararPase();
    pararVideo();
    cerrarMenu();
    clearTimeout(tIdle); clearTimeout(tToast);
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* nada */ }
    }
    var foco = S.foco, onCerrar = S.opts.onCerrar;
    S = null; g = null; ptrs.clear();
    el.pista.innerHTML = "";
    root.hidden = true;
    root.classList.remove("vm-quieto", "vm-es-video");
    alternarAyuda(false);
    document.documentElement.classList.remove("vm-abierto");
    if (!silencioso) {
      if (foco && foco.focus) { try { foco.focus({ preventScroll: true }); } catch (e) { /* nada */ } }
      if (typeof onCerrar === "function") onCerrar();
    }
  }

  /* ---------- Pintado del elemento actual ---------- */
  function construirTira() {
    if (S.items.length < 2) { el.tira.innerHTML = ""; return; }
    el.tira.innerHTML = S.items.map(function (it, n) {
      var src = it.thumb || (it.tipo === "video" ? posterVideo(it.url, 160) : conAncho(it.url, 160));
      return '<button type="button" class="vm-mini" role="tab" data-i="' + n + '" aria-label="Ir al elemento ' + (n + 1) + '">' +
        (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' : "") +
        (it.tipo === "video" ? '<span class="vm-mini-play">' + I.playMini + "</span>" : "") + "</button>";
    }).join("");
  }

  function pintar(dir) {
    if (!S) return;
    var it = cur();
    pararVideo();
    restablecerZoom(false);
    S.hires = false;
    el.pista.className = "vm-pista " + (dir > 0 ? "vm-entra-der" : dir < 0 ? "vm-entra-izq" : "vm-entra-fade");
    el.pista.style.transform = ""; el.pista.style.opacity = "";
    el.pista.innerHTML = "";
    el.error.hidden = true;
    el.spinner.hidden = false;
    root.classList.toggle("vm-es-video", it.tipo === "video");
    el.escena.classList.remove("vm-zoomeada");

    var nodo;
    if (it.tipo === "video") {
      nodo = document.createElement("video");
      nodo.className = "vm-media";
      nodo.controls = true;
      nodo.playsInline = true;
      nodo.preload = "auto";
      nodo.loop = S.bucle;
      nodo.playbackRate = S.velocidad;
      nodo.setAttribute("controlslist", "nodownload");
      var poster = posterVideo(it.url, 1200);
      if (poster) nodo.poster = poster;
      nodo.addEventListener("loadeddata", function () { el.spinner.hidden = true; });
      nodo.addEventListener("playing", function () { el.spinner.hidden = true; });
      nodo.addEventListener("waiting", function () { if (!nodo.paused) el.spinner.hidden = false; });
      nodo.addEventListener("error", function () { el.spinner.hidden = true; el.error.hidden = false; });
      nodo.addEventListener("ended", function () { if (S && S.pase && !S.bucle) ir(1); });
      nodo.src = urlBase(it.url);
      el.pista.appendChild(nodo);
      var p = nodo.play();
      if (p && p.catch) p.catch(function () { nodo.muted = true; var q = nodo.play(); if (q && q.catch) q.catch(function () {}); });
      el.velocidad.querySelector(".vm-txt").textContent = S.velocidad + "×";
      el.bucle.classList.toggle("vm-activo", S.bucle);
      el.pip.classList.remove("vm-activo");
    } else {
      nodo = document.createElement("img");
      nodo.className = "vm-media";
      nodo.alt = it.titulo || "";
      nodo.decoding = "async";
      nodo.draggable = false;
      var grande = conAncho(it.url, 2000);
      if (it.thumb && it.thumb !== grande) {
        nodo.src = it.thumb;
        nodo.classList.add("vm-borroso");
      }
      var pre = new Image();
      pre.onload = function () {
        if (!S || nodo !== el.pista.firstChild) return;
        nodo.src = grande;
        nodo.classList.remove("vm-borroso");
        el.escena.scrollTop = 0; el.escena.scrollLeft = 0; el.pista.scrollTop = 0; el.pista.scrollLeft = 0;
        el.spinner.hidden = true;
      };
      pre.onerror = function () {
        if (!S || nodo !== el.pista.firstChild) return;
        el.spinner.hidden = true;
        if (!nodo.getAttribute("src")) el.error.hidden = false;
      };
      pre.src = grande;
      if (!nodo.getAttribute("src")) { /* sin miniatura: solo spinner hasta que cargue */ }
      el.pista.appendChild(nodo);
      precargarVecinos();
    }
    el.original.href = urlBase(it.url);
    actualizarCromo();
    if (typeof S.opts.onCambio === "function") S.opts.onCambio(S.i);
    if (S.pase) programarPase();
  }

  function actualizarCromo() {
    var it = cur(), n = S.items.length;
    el.pos.textContent = n > 1 ? (S.i + 1) + " / " + n : "";
    el.tipo.textContent = it.tipo === "video" ? "Vídeo" : "Foto";
    var partes = "";
    if (it.titulo) partes += '<p class="vm-titulo">' + esc(it.titulo) + "</p>";
    if (it.credito) partes += '<p class="vm-credito">' + esc(it.credito) + "</p>";
    if (it.enlace && it.enlace.href) partes += '<a class="vm-enlace" href="' + esc(it.enlace.href) + '">' + esc(it.enlace.texto || "Ver más") + "</a>";
    el.infoTexto.innerHTML = partes;
    el.tira.querySelectorAll(".vm-mini").forEach(function (m) {
      var act = Number(m.dataset.i) === S.i;
      m.classList.toggle("vm-actual", act);
      m.setAttribute("aria-selected", act ? "true" : "false");
      if (act) m.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    });
    el.info.classList.toggle("vm-activo", !S.sinInfo);
    el.compartir.hidden = false;
    actualizarZoomUI();
  }

  function precargarVecinos() {
    var n = S.items.length;
    if (n < 2) return;
    [1, -1, 2].forEach(function (d) {
      var v = S.items[(S.i + d + n) % n];
      if (v && v.tipo !== "video") { var im = new Image(); im.src = conAncho(v.url, 2000); }
    });
  }

  function ir(delta) {
    if (!S || S.items.length < 2) return;
    var n = S.items.length;
    S.i = (S.i + delta + n) % n;
    pintar(delta);
  }
  function irA(n) {
    if (!S) return;
    var dir = n > S.i ? 1 : -1;
    S.i = clamp(n, 0, S.items.length - 1);
    pintar(dir);
  }

  /* ---------- Zoom y desplazamiento ---------- */
  function mediaEl() { return el.pista.firstChild; }

  function restablecerZoom(animar) {
    if (!S) return;
    S.zoom = 1; S.x = 0; S.y = 0;
    var m = mediaEl();
    if (m && m.tagName === "IMG") {
      if (!animar) m.style.transition = "none";
      m.style.transform = "";
      if (!animar) { void m.offsetWidth; m.style.transition = ""; }
    }
    el.escena.classList.remove("vm-zoomeada");
    actualizarZoomUI();
  }

  function limitarDesplazamiento() {
    var m = mediaEl();
    if (!m) return;
    // Tamaño real con el que se dibuja la foto dentro de su caja (object-fit:contain)
    var bw = m.offsetWidth, bh = m.offsetHeight;
    var nw = m.naturalWidth || bw, nh = m.naturalHeight || bh;
    var k = Math.min(bw / nw, bh / nh);
    var iw = nw * k * S.zoom, ih = nh * k * S.zoom;
    var mx = Math.max(0, (iw - el.escena.clientWidth) / 2);
    var my = Math.max(0, (ih - el.escena.clientHeight) / 2);
    S.x = clamp(S.x, -mx, mx);
    S.y = clamp(S.y, -my, my);
  }

  function aplicarTransformacion() {
    var m = mediaEl();
    if (!m || m.tagName !== "IMG") return;
    m.style.transform = "translate3d(" + S.x + "px," + S.y + "px,0) scale(" + S.zoom + ")";
    el.escena.classList.toggle("vm-zoomeada", S.zoom > 1.01);
    actualizarZoomUI();
    if (S.zoom > 1.25 && !S.hires) cargarAltaResolucion();
    if (S.zoom > 1.01 && S.pase) pararPase();
  }

  function zoomEn(nuevo, cx, cy) {
    if (!S || !esFoto()) return;
    nuevo = clamp(nuevo, 1, ZOOM_MAX);
    var r = el.escena.getBoundingClientRect();
    var px = cx - (r.left + r.width / 2), py = cy - (r.top + r.height / 2);
    var f = nuevo / S.zoom;
    S.x = px - (px - S.x) * f;
    S.y = py - (py - S.y) * f;
    S.zoom = nuevo;
    if (nuevo <= 1.001) { S.zoom = 1; S.x = 0; S.y = 0; }
    limitarDesplazamiento();
    aplicarTransformacion();
  }
  function zoomBoton(f) {
    var r = el.escena.getBoundingClientRect();
    zoomEn(S.zoom * f, r.left + r.width / 2, r.top + r.height / 2);
  }
  function alternarZoomEn(cx, cy) {
    if (S.zoom > 1.05) { S.zoom = 1; S.x = 0; S.y = 0; aplicarTransformacion(); }
    else zoomEn(2.6, cx, cy);
  }
  function actualizarZoomUI() {
    if (!S) return;
    el["zoom-reset"].textContent = Math.round(S.zoom * 100) + "%";
    el["zoom-menos"].disabled = S.zoom <= 1.001;
    el["zoom-mas"].disabled = S.zoom >= ZOOM_MAX - 0.001;
  }
  function cargarAltaResolucion() {
    var it = cur(), m = mediaEl();
    if (!it || !m || m.tagName !== "IMG") return;
    S.hires = true;
    var alta = conAncho(it.url, 3600);
    if (alta === m.src) return;
    var pre = new Image();
    pre.onload = function () { if (S && mediaEl() === m) m.src = alta; };
    pre.src = alta;
  }

  /* ---------- Gestos (arrastrar, deslizar, pellizcar, doble toque) ---------- */
  function dist(a) { var dx = a[0].x - a[1].x, dy = a[0].y - a[1].y; return Math.sqrt(dx * dx + dy * dy); }
  function medio(a) { return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }
  function centroEscena() {
    var r = el.escena.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function alBajar(e) {
    if (!S || e.button > 0) return;
    if (e.target.closest("button,a")) return;
    var esVideo = !esFoto();
    var enMedia = !!e.target.closest(".vm-media");
    if (esVideo && enMedia) return; // controles nativos del vídeo
    try { el.escena.setPointerCapture(e.pointerId); } catch (x) { /* nada */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    var lista = Array.from(ptrs.values());
    if (lista.length === 1) {
      g = { modo: S.zoom > 1.01 ? "pan" : "swipe", sx: e.clientX, sy: e.clientY, ox: S.x, oy: S.y,
            moved: false, dx: 0, dy: 0, eje: "", enMedia: enMedia, tipo: e.pointerType };
    } else if (lista.length === 2 && !esVideo) {
      var m = medio(lista), c = centroEscena();
      g = { modo: "pinch", d0: dist(lista), s0: S.zoom, x0: S.x, y0: S.y, cx: m.x - c.x, cy: m.y - c.y, moved: true };
    }
    el.pista.classList.add("vm-arrastrando");
    el.escena.classList.toggle("vm-arrastrando", S.zoom > 1.01);
  }

  function alMover(e) {
    if (!S || !g || !ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    var lista = Array.from(ptrs.values());
    if (g.modo === "pinch" && lista.length >= 2) {
      var m = medio(lista), c = centroEscena();
      var ns = clamp(g.s0 * dist(lista) / g.d0, 1, ZOOM_MAX);
      var f = ns / g.s0;
      S.x = (m.x - c.x) - (g.cx - g.x0) * f;
      S.y = (m.y - c.y) - (g.cy - g.y0) * f;
      S.zoom = ns;
      if (ns <= 1.001) { S.x = 0; S.y = 0; }
      limitarDesplazamiento();
      aplicarTransformacion();
      return;
    }
    var dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (!g.moved && Math.abs(dx) + Math.abs(dy) > 7) g.moved = true;
    if (!g.moved) return;
    if (g.modo === "pan") {
      S.x = g.ox + dx; S.y = g.oy + dy;
      limitarDesplazamiento();
      aplicarTransformacion();
    } else if (g.modo === "swipe") {
      g.dx = dx; g.dy = dy;
      if (!g.eje) g.eje = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (g.eje === "x" && S.items.length > 1) {
        el.pista.style.transform = "translate3d(" + dx * 0.9 + "px,0,0)";
        el.pista.style.opacity = String(1 - Math.min(Math.abs(dx) / 700, 0.4));
      } else if (g.eje === "y") {
        el.pista.style.transform = "translate3d(0," + Math.max(0, dy) * 0.8 + "px,0) scale(" + (1 - Math.min(Math.max(0, dy) / 1200, 0.15)) + ")";
        el.pista.style.opacity = String(1 - Math.min(Math.max(0, dy) / 420, 0.6));
      }
    }
  }

  function alSoltar(e) {
    if (!S) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size > 0) {
      if (g && g.modo === "pinch") {
        var r = Array.from(ptrs.values())[0];
        g = { modo: "pan", sx: r.x, sy: r.y, ox: S.x, oy: S.y, moved: true, dx: 0, dy: 0, eje: "" };
      }
      return;
    }
    el.pista.classList.remove("vm-arrastrando");
    el.escena.classList.remove("vm-arrastrando");
    if (!g) return;
    var gg = g; g = null;

    if (gg.modo === "swipe") {
      el.pista.style.transform = ""; el.pista.style.opacity = "";
      if (gg.moved) {
        if (gg.eje === "x" && Math.abs(gg.dx) > 60 && S.items.length > 1) ir(gg.dx < 0 ? 1 : -1);
        else if (gg.eje === "y" && gg.dy > 100) cerrar();
        return;
      }
    }
    if (gg.moved) return;

    /* Toque/clic sin movimiento */
    if (!gg.enMedia) { cerrar(); return; }
    var ahora = Date.now();
    if (ultimoTap && ahora - ultimoTap.t < 300 && Math.abs(e.clientX - ultimoTap.x) < 30 && Math.abs(e.clientY - ultimoTap.y) < 30) {
      ultimoTap = null;
      alternarZoomEn(e.clientX, e.clientY);
      return;
    }
    ultimoTap = { t: ahora, x: e.clientX, y: e.clientY };
    if (gg.tipo !== "mouse") {
      setTimeout(function () {
        if (ultimoTap && Date.now() - ultimoTap.t >= 290) {
          ultimoTap = null;
          if (S) root.classList.toggle("vm-quieto");
        }
      }, 310);
    }
  }

  /* ---------- Teclado ---------- */
  function alTeclear(e) {
    if (!S) return;
    var k = e.key, t = e.target;
    var enBoton = t && t.closest && t.closest("button,a");
    if (k === "Tab") { atraparTab(e); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var video = mediaEl() && mediaEl().tagName === "VIDEO" ? mediaEl() : null;

    switch (k) {
      case "Escape":
        e.preventDefault(); e.stopPropagation();
        if (!el.panelAyuda.hidden) alternarAyuda(false);
        else if (!el.menu.hidden) cerrarMenu();
        else cerrar();
        return;
      case "ArrowLeft":
        if (video && e.shiftKey) { video.currentTime = Math.max(0, video.currentTime - 5); }
        else ir(-1);
        break;
      case "ArrowRight":
        if (video && e.shiftKey) { video.currentTime = Math.min(video.duration || 1e9, video.currentTime + 5); }
        else ir(1);
        break;
      case "Home": irA(0); break;
      case "End": irA(S.items.length - 1); break;
      case "+": case "=": if (!video) zoomBoton(1.4); break;
      case "-": case "_": if (!video) zoomBoton(1 / 1.4); break;
      case "0": if (!video) restablecerZoom(true); break;
      case "f": case "F": alternarPantallaCompleta(); break;
      case "i": case "I": alternarInfo(); break;
      case "p": case "P": alternarPase(); break;
      case "d": case "D": descargar(); break;
      case "s": case "S": compartir(); break;
      case "c": case "C": copiarEnlace(); break;
      case "l": case "L": if (video) alternarBucle(); break;
      case "m": case "M": if (video) video.muted = !video.muted; break;
      case "<": if (video) ciclarVelocidad(-1); break;
      case ">": if (video) ciclarVelocidad(1); break;
      case "?": alternarAyuda(); break;
      case " ":
        if (enBoton) return;
        if (video) { video.paused ? video.play() : video.pause(); }
        else alternarPase();
        break;
      default: return;
    }
    e.preventDefault(); e.stopPropagation();
    despertar();
  }

  function atraparTab(e) {
    var foc = Array.from(root.querySelectorAll("button:not([disabled]),a[href],video[controls]"))
      .filter(function (n) { return !n.hidden && n.offsetParent !== null; });
    if (!foc.length) return;
    var prim = foc[0], ult = foc[foc.length - 1], act = document.activeElement;
    if (e.shiftKey && (act === prim || !root.contains(act))) { e.preventDefault(); ult.focus(); }
    else if (!e.shiftKey && (act === ult || !root.contains(act))) { e.preventDefault(); prim.focus(); }
  }

  /* ---------- Pase de diapositivas ---------- */
  function alternarPase() {
    if (!S || S.items.length < 2) return;
    if (S.pase) { pararPase(); aviso("Pase detenido"); }
    else {
      S.pase = true;
      restablecerZoom(true);
      el.pase.innerHTML = I.pausa;
      el.pase.classList.add("vm-activo");
      aviso("Pase de diapositivas");
      programarPase();
    }
  }
  function programarPase() {
    clearTimeout(tPase);
    var barra = root.querySelector(".vm-progreso");
    barra.classList.remove("vm-corre"); void barra.offsetWidth;
    if (!S || !S.pase || !esFoto()) return; // los vídeos avanzan al terminar
    barra.style.setProperty("--vm-duracion", PASE_MS + "ms");
    barra.classList.add("vm-corre");
    tPase = setTimeout(function () { ir(1); }, PASE_MS);
  }
  function pararPase() {
    clearTimeout(tPase);
    if (S) S.pase = false;
    if (!root) return;
    var barra = root.querySelector(".vm-progreso");
    if (barra) barra.classList.remove("vm-corre");
    if (el.pase) { el.pase.innerHTML = I.pase; el.pase.classList.remove("vm-activo"); }
  }

  /* ---------- Pantalla completa / info / ayuda ---------- */
  function alternarPantallaCompleta() {
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (fs) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
    } catch (e) { /* no soportado */ }
  }
  function actualizarPantalla() {
    if (!root || !el.pantalla) return;
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    el.pantalla.innerHTML = fs ? I.pantallaSalir : I.pantalla;
    el.pantalla.classList.toggle("vm-activo", !!fs);
  }
  function alternarInfo() {
    if (!S) return;
    S.sinInfo = !S.sinInfo;
    root.classList.toggle("vm-sin-info", S.sinInfo);
    el.info.classList.toggle("vm-activo", !S.sinInfo);
    try { localStorage.setItem("vm_sin_info", S.sinInfo ? "1" : "0"); } catch (e) { /* nada */ }
  }
  function alternarAyuda(forzar) {
    var mostrar = typeof forzar === "boolean" ? forzar : el.panelAyuda.hidden;
    el.panelAyuda.hidden = !mostrar;
    if (mostrar) el.ayudaCerrar.focus();
  }

  /* ---------- Acciones: descargar, compartir, copiar ---------- */
  function nombreArchivo(it) {
    var base = (it.titulo || "elotrofutbol-" + (it.tipo === "video" ? "video" : "foto")).toString()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    return base || "elotrofutbol";
  }
  function descargar() {
    var it = cur(); if (!it) return;
    var a = document.createElement("a");
    a.href = urlDescarga(it.url);
    a.download = nombreArchivo(it);
    a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    marcarOk(el.descargar);
    aviso("Descargando…");
  }
  function urlParaCompartir() {
    var it = cur();
    var u = (S.opts.compartirUrl && S.opts.compartirUrl(it)) || it.compartirUrl || (location.origin + location.pathname + location.search);
    return u;
  }
  function compartir() {
    var it = cur(); if (!it) return;
    var url = urlParaCompartir();
    var titulo = it.titulo || S.opts.titulo || document.title;
    if (navigator.share && coarse()) {
      navigator.share({ title: titulo, text: titulo, url: url }).catch(function () { /* cancelado */ });
      return;
    }
    if (!el.menu.hidden) { cerrarMenu(); return; }
    var u = encodeURIComponent(url), t = encodeURIComponent(titulo);
    el.menu.innerHTML =
      '<a role="menuitem" target="_blank" rel="noopener" href="https://wa.me/?text=' + t + "%20" + u + '">' + I.whatsapp + "WhatsApp</a>" +
      '<a role="menuitem" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + u + "&text=" + t + '">' + I.telegram + "Telegram</a>" +
      '<a role="menuitem" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=' + u + "&text=" + t + '">' + I.x + "X (Twitter)</a>" +
      '<a role="menuitem" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=' + u + '">' + I.facebook + "Facebook</a>" +
      '<a role="menuitem" href="mailto:?subject=' + t + "&body=" + u + '">' + I.correo + "Correo electrónico</a>" +
      '<button type="button" role="menuitem" data-vm-copiar>' + I.enlace + "Copiar enlace</button>";
    el.menu.hidden = false;
    el.compartir.setAttribute("aria-expanded", "true");
    el.menu.querySelector("[data-vm-copiar]").onclick = function () { copiarEnlace(); cerrarMenu(); };
    var primero = el.menu.querySelector("a"); if (primero) primero.focus();
  }
  function cerrarMenu() {
    if (!el.menu) return;
    el.menu.hidden = true;
    if (el.compartir) el.compartir.setAttribute("aria-expanded", "false");
  }
  function copiarEnlace() {
    var url = urlParaCompartir();
    var hecho = function () { marcarOk(el.copiar); aviso("Enlace copiado"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(hecho, function () { copiarRespaldo(url) && hecho(); });
    } else if (copiarRespaldo(url)) hecho();
  }
  function copiarRespaldo(texto) {
    try {
      var ta = document.createElement("textarea");
      ta.value = texto; ta.style.cssText = "position:fixed;opacity:0;";
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  function marcarOk(btn) {
    if (!btn) return;
    btn.classList.add("vm-ok");
    setTimeout(function () { btn.classList.remove("vm-ok"); }, 1300);
  }
  function aviso(texto) {
    if (!root) return;
    var t = root.querySelector(".vm-toast");
    if (t) t.remove();
    t = document.createElement("div");
    t.className = "vm-toast"; t.setAttribute("role", "status");
    t.textContent = texto;
    root.appendChild(t);
    clearTimeout(tToast);
    tToast = setTimeout(function () { t.remove(); }, 1600);
  }

  /* ---------- Vídeo ---------- */
  function videoEl() { var m = mediaEl(); return m && m.tagName === "VIDEO" ? m : null; }
  function pararVideo() {
    var v = videoEl();
    if (v) {
      try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) { /* nada */ }
      if (document.pictureInPictureElement === v) { try { document.exitPictureInPicture(); } catch (e) { /* nada */ } }
    }
  }
  function ciclarVelocidad(dir) {
    var v = videoEl(); if (!v) return;
    var i = VELOCIDADES.indexOf(S.velocidad);
    if (typeof dir === "number") {
      var orden = [0.5, 1, 1.25, 1.5, 2];
      var j = clamp(orden.indexOf(S.velocidad) + dir, 0, orden.length - 1);
      S.velocidad = orden[j];
    } else S.velocidad = VELOCIDADES[(i + 1) % VELOCIDADES.length];
    v.playbackRate = S.velocidad;
    el.velocidad.querySelector(".vm-txt").textContent = S.velocidad + "×";
    aviso("Velocidad " + S.velocidad + "×");
  }
  function alternarBucle() {
    var v = videoEl(); if (!v) return;
    S.bucle = !S.bucle;
    v.loop = S.bucle;
    el.bucle.classList.toggle("vm-activo", S.bucle);
    aviso(S.bucle ? "Bucle activado" : "Bucle desactivado");
  }
  function alternarPip() {
    var v = videoEl(); if (!v) return;
    try {
      if (document.pictureInPictureElement) document.exitPictureInPicture();
      else if (v.requestPictureInPicture) v.requestPictureInPicture();
    } catch (e) { /* nada */ }
  }

  window.VisorMedia = {
    abrir: abrir,
    cerrar: cerrar,
    estaAbierto: function () { return !!S; },
    urlBase: urlBase,
    conAncho: conAncho,
    urlDescarga: urlDescarga,
    posterVideo: posterVideo
  };
})();
