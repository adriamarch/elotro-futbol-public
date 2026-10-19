// ---------- Preferencias de visualización (lectores y redactores) ----------
// Este script va en <head>, justo DESPUÉS de tema.js y ANTES de cualquier
// hoja de estilos o script de página, por el mismo motivo que tema.js:
// los atributos data-eof-* tienen que estar ya puestos en <html> cuando
// el navegador empieza a pintar, para que no haya parpadeo (p. ej. ver
// un instante la página con animaciones o con el texto pequeño y luego
// cambiarla).
//
// Hace dos cosas:
//   1) Aplica al instante lo guardado en localStorage ("eof_prefs").
//   2) Expone window.EOFPrefs.montarPanel(contenedor), que dibuja el
//      panel de opciones. Lo usan tanto cuenta.html (lectores, pestaña
//      "Preferencias") como admin/panel.html (redactores, Ajustes >
//      "Preferencias"), así que hay UN solo sitio donde tocar si se
//      añade o cambia una opción.
//
// Las preferencias se guardan por navegador/dispositivo (localStorage),
// igual que el modo oscuro: no dependen de la sesión ni de la API. Para
// llevarlas a otro dispositivo, el panel ofrece copiar/pegar un código.
//
// Opciones disponibles (todas opcionales; sin tocar nada la web se ve
// exactamente igual que siempre):
//   Apariencia ........ tema (claro/oscuro/automático, vía tema.js),
//                       color de acento, alto contraste
//   Texto ............. tamaño, tipo de letra, interlineado, espaciado
//                       de letras, ancho de las noticias, enlaces
//   Movimiento ........ desactivar animaciones
//   Ayudas ............ guía de lectura (solo en noticias y páginas de
//                       texto), barra de progreso de las noticias (la
//                       que ya trae noticia.html; aquí solo se
//                       muestra u oculta), marco de teclado visible,
//                       botones y campos más grandes
//   Perfiles rápidos .. combinaciones listas para usar
(function () {
  "use strict";

  var CLAVE = "eof_prefs";

  // sinAnimaciones: true/false, o null = "no ha elegido nada" (entonces
  // mandan las reglas prefers-reduced-motion que ya tiene el CSS, si el
  // dispositivo lo pide).
  var POR_DEFECTO = {
    sinAnimaciones: null,
    texto: "normal",        // pequeno | normal | grande | muygrande
    fuente: "normal",       // normal | legible | serif
    interlineado: "normal", // normal | amplio | muyamplio
    letras: "normal",       // normal | amplio | muyamplio
    enlaces: "normal",      // normal | subrayados
    ancho: "normal",        // estrecho | normal | ancho
    acento: "celeste",      // celeste | verde | naranja | violeta | rosa | dorado
    contraste: "normal",    // normal | alto
    guia: "no",             // no | banda | foco
    barra: true,            // barra de progreso de las noticias (ya existe en noticia.html)
    foco: false,            // marco de teclado bien visible
    tactil: false           // botones y campos más grandes
  };

  var VALORES_VALIDOS = {
    texto: ["pequeno", "normal", "grande", "muygrande"],
    fuente: ["normal", "legible", "serif"],
    interlineado: ["normal", "amplio", "muyamplio"],
    letras: ["normal", "amplio", "muyamplio"],
    enlaces: ["normal", "subrayados"],
    ancho: ["estrecho", "normal", "ancho"],
    acento: ["celeste", "verde", "naranja", "violeta", "rosa", "dorado"],
    contraste: ["normal", "alto"],
    guia: ["no", "banda", "foco"]
  };

  var BOOLEANOS = ["barra", "foco", "tactil"];

  // ---------- Lectura / escritura ----------
  // Devuelve SIEMPRE un objeto completo y válido: lo que falte o no sea
  // un valor conocido se sustituye por el de POR_DEFECTO. Sirve tanto
  // para lo guardado como para los códigos que se pegan en el panel.
  function normalizar(origen) {
    var prefs = {};
    Object.keys(POR_DEFECTO).forEach(function (k) {
      prefs[k] = POR_DEFECTO[k];
    });
    if (!origen || typeof origen !== "object") return prefs;
    if (typeof origen.sinAnimaciones === "boolean") prefs.sinAnimaciones = origen.sinAnimaciones;
    BOOLEANOS.forEach(function (k) {
      if (typeof origen[k] === "boolean") prefs[k] = origen[k];
    });
    Object.keys(VALORES_VALIDOS).forEach(function (k) {
      if (VALORES_VALIDOS[k].indexOf(origen[k]) !== -1) prefs[k] = origen[k];
    });
    return prefs;
  }

  function leer() {
    var guardado = {};
    try {
      guardado = JSON.parse(localStorage.getItem(CLAVE) || "{}") || {};
    } catch (e) {
      guardado = {};
    }
    return normalizar(guardado);
  }

  function guardar(prefs) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(prefs));
    } catch (e) {
      // Sin localStorage (modo privado estricto, etc.): la preferencia
      // sigue aplicándose en esta página, pero no se recuerda.
    }
  }

  // ---------- Aplicación sobre <html> ----------
  function aplicar(prefs) {
    var h = document.documentElement;
    function poner(attr, activo, valor) {
      if (activo) h.setAttribute(attr, valor);
      else h.removeAttribute(attr);
    }
    poner("data-eof-anim", prefs.sinAnimaciones === true, "off");
    poner("data-eof-texto", prefs.texto !== "normal", prefs.texto);
    poner("data-eof-fuente", prefs.fuente !== "normal", prefs.fuente);
    poner("data-eof-lineas", prefs.interlineado !== "normal", prefs.interlineado);
    poner("data-eof-letras", prefs.letras !== "normal", prefs.letras);
    poner("data-eof-enlaces", prefs.enlaces !== "normal", prefs.enlaces);
    poner("data-eof-ancho", prefs.ancho !== "normal", prefs.ancho);
    poner("data-eof-acento", prefs.acento !== "celeste", prefs.acento);
    poner("data-eof-contraste", prefs.contraste !== "normal", prefs.contraste);
    poner("data-eof-barra", prefs.barra === false, "off");
    poner("data-eof-foco", prefs.foco === true, "on");
    poner("data-eof-tactil", prefs.tactil === true, "on");
    aplicarAyudas(prefs);
  }

  // ---------- CSS ----------
  // Se inyecta desde aquí (en vez de tocar style.css y admin.css) para
  // que las opciones funcionen igual en la web pública y en el panel con
  // un único archivo.

  // Genera "html[attr="valor"] etiqueta, html[attr="valor"] etiqueta2, ..."
  function selectores(attr, valor, etiquetas) {
    return etiquetas.map(function (t) {
      return 'html[' + attr + '="' + valor + '"] ' + t;
    }).join(",");
  }

  var ETIQUETAS_TIPOGRAFIA = [
    "body", "h1", "h2", "h3", "h4", "p", "li", "a", "label",
    "td", "th", "input", "select", "textarea", "button"
  ];
  var ETIQUETAS_LECTURA = ["p", "li", "td", "th", "dd", "dt", "blockquote", "figcaption", "label"];

  var ACENTOS = {
    // [principal, claro, nombre visible]
    celeste: ["#5bb8e8", "#a8dcf5", "Celeste"],
    verde: ["#3fbf8a", "#b4ead3", "Verde"],
    naranja: ["#f29b38", "#fbd8a8", "Naranja"],
    violeta: ["#9b7ff0", "#d3c7fa", "Violeta"],
    rosa: ["#ec6fa6", "#f8c4dc", "Rosa"],
    dorado: ["#e0b12f", "#f4e0a0", "Dorado"]
  };

  function construirCSS() {
    var c = [];

    // --- Desactivar animaciones ---
    // Se acortan a ~0 en vez de usar "animation:none" a secas: así las
    // animaciones de entrada que terminan en su estado final (fade-in,
    // trazos de los checks, etc.) llegan directamente a ese estado y no
    // dejan elementos invisibles o a medio dibujar. Las que son bucles
    // infinitos (parpadeos de "en vivo", spinners) se quedan estáticas.
    c.push(
      'html[data-eof-anim="off"] *,',
      'html[data-eof-anim="off"] *::before,',
      'html[data-eof-anim="off"] *::after{',
      '  animation-duration:.001ms!important;animation-delay:0s!important;',
      '  animation-iteration-count:1!important;',
      '  transition-duration:.001ms!important;transition-delay:0s!important;',
      '  scroll-behavior:auto!important;',
      '}',
      // Cinta de patrocinadores: acabaría en su posición final (fuera de
      // pantalla), así que se deja quieta de verdad.
      'html[data-eof-anim="off"] .patrocinadores-footer-track{animation:none!important;}',
      // Banner de última hora: el título deslizante empuja el texto fuera
      // con padding-left:100%; sin animación se muestra fijo y recortado.
      'html[data-eof-anim="off"] #banner-ultima-hora.uh-marquee .uh-texto{',
      '  animation:none!important;padding-left:0!important;display:block;',
      '  overflow:hidden;text-overflow:ellipsis;',
      '}'
    );

    // --- Tamaño del texto (el CSS del sitio va casi todo en rem) ---
    c.push(
      'html[data-eof-texto="pequeno"]{font-size:93.75%;}',
      'html[data-eof-texto="grande"]{font-size:112.5%;}',
      'html[data-eof-texto="muygrande"]{font-size:125%;}'
    );

    // --- Tipo de letra (sin cargar nada externo) ---
    c.push(
      selectores("data-eof-fuente", "legible", ETIQUETAS_TIPOGRAFIA) + '{',
      '  font-family:Verdana,Tahoma,"Trebuchet MS",system-ui,sans-serif!important;',
      '  letter-spacing:.01em;',
      '}',
      selectores("data-eof-fuente", "serif", ETIQUETAS_TIPOGRAFIA) + '{',
      '  font-family:Georgia,"Iowan Old Style","Times New Roman",serif!important;',
      '}'
    );

    // --- Interlineado ---
    c.push(
      selectores("data-eof-lineas", "amplio", ["body", "p", "li", "blockquote", "figcaption"]) +
        '{line-height:1.85!important;}',
      selectores("data-eof-lineas", "muyamplio", ["body", "p", "li", "blockquote", "figcaption"]) +
        '{line-height:2.15!important;}'
    );

    // --- Espaciado de letras y palabras (solo en textos de lectura: los
    // títulos y botones con su propio tracking de marca no se tocan) ---
    c.push(
      selectores("data-eof-letras", "amplio", ETIQUETAS_LECTURA) +
        '{letter-spacing:.035em!important;word-spacing:.1em!important;}',
      selectores("data-eof-letras", "muyamplio", ETIQUETAS_LECTURA) +
        '{letter-spacing:.07em!important;word-spacing:.2em!important;}'
    );

    // --- Enlaces subrayados (sin tocar los botones) ---
    c.push(
      'html[data-eof-enlaces="subrayados"] a:not([class*="btn"]):not([class*="boton"]){',
      '  text-decoration:underline!important;text-underline-offset:3px;',
      '}'
    );

    // --- Ancho de la columna de lectura en las noticias. Las fotos se
    // mantienen alineadas con el texto, como en el diseño original. ---
    var ANCHO_COLUMNA = [
      ".article-header", ".article-body", ".article-img",
      ".article-body .foto-articulo", ".article-galeria-collages"
    ];
    function colAncho(valor, px) {
      return selectores("data-eof-ancho", valor, ANCHO_COLUMNA) +
        '{max-width:' + px + 'px!important;}';
    }
    c.push(colAncho("estrecho", 620), colAncho("ancho", 980));

    // --- Color de acento: sustituye el celeste de marca (botones activos,
    // interruptores, subrayados, insignias...) por el elegido. ---
    Object.keys(ACENTOS).forEach(function (k) {
      if (k === "celeste") return;
      c.push('html[data-eof-acento="' + k + '"]{--celeste:' + ACENTOS[k][0] +
        ';--celeste-claro:' + ACENTOS[k][1] + ';}');
    });

    // --- Alto contraste ---
    c.push(
      'html[data-eof-contraste="alto"]{',
      '  --texto:#000;--texto-suave:#1c232d;--gris-texto:#1c232d;--marino-texto:#000;',
      '  --borde:#57606d;',
      '}',
      // El selector doble gana en especificidad a [data-theme="dark"].
      'html[data-eof-contraste="alto"][data-theme="dark"]{',
      '  --fondo:#000;--fondo-alt:#0a0e14;--tarjeta:#0a0e14;',
      '  --texto:#fff;--texto-suave:#eef1f6;--gris-texto:#eef1f6;--marino-texto:#fff;',
      '  --borde:#b3bccd;',
      '}'
    );

    // --- Foco de teclado reforzado (doble anillo: se ve sobre cualquier
    // fondo, claro u oscuro; el panel de admin quita los contornos por
    // defecto, por eso va con !important). ---
    c.push(
      'html[data-eof-foco="on"] :focus-visible{',
      '  outline:3px solid #ffb300!important;outline-offset:2px!important;',
      '  box-shadow:0 0 0 6px rgba(0,0,0,.85)!important;',
      '}'
    );

    // --- Botones y campos más grandes (zona de pulsación cómoda) ---
    c.push(
      'html[data-eof-tactil="on"] button,',
      'html[data-eof-tactil="on"] select,',
      'html[data-eof-tactil="on"] [role="button"],',
      'html[data-eof-tactil="on"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="hidden"]):not([type="file"]){',
      '  min-height:46px;',
      '}',
      'html[data-eof-tactil="on"] button{min-width:46px;}'
    );

    // --- Barra de progreso de las noticias ---
    // La dibuja noticia.html (.barra-progreso-lectura); aquí solo se
    // oculta si la persona la ha desactivado. Así nunca hay dos barras.
    c.push('html[data-eof-barra="off"] .barra-progreso-lectura{display:none!important;}');

    // --- Guía de lectura ---
    // La crea el JS, pero solo se ve donde hay algo que leer: el cuerpo
    // de una noticia y las páginas de texto marcadas con
    // data-eof-lectura en <body>. En portada, calendario, clasificación,
    // panel de admin... no aparece aunque esté activada.
    c.push(
      '#eof-guia{display:none;position:fixed;left:0;right:0;top:0;height:3.4rem;',
      '  pointer-events:none;z-index:90;will-change:transform;}',
      'body:has(#contenidoArticulo .article-body) #eof-guia,',
      'body[data-eof-lectura] #eof-guia{display:block;}',
      '#eof-guia[data-modo="banda"]{background:rgba(255,214,64,.22);',
      '  border-top:2px solid rgba(214,158,0,.75);border-bottom:2px solid rgba(214,158,0,.75);}',
      '#eof-guia[data-modo="foco"]{box-shadow:0 0 0 100vmax rgba(8,14,24,.62);}',
      '@media print{#eof-guia{display:none!important;}}'
    );

    // --- Estilos del propio panel de preferencias ---
    // Todo cuelga de .eof-pref-panel y usa !important en lo que los
    // estilos genéricos de formularios de cuenta.html / admin.css (label y
    // input a todo ancho, márgenes, bordes...) podrían pisar.
    c.push(
      '.eof-pref-panel{display:block;}',
      '.eof-pref-subtitulo{margin:0 0 8px!important;font-size:.72rem;font-weight:700;',
      '  letter-spacing:.09em;text-transform:uppercase;color:var(--texto-suave,inherit);opacity:.9;}',

      // Perfiles rápidos
      '.eof-perfiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:0 0 18px;}',
      '.eof-perfil{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;',
      '  padding:12px 14px;border:1.5px solid var(--borde,rgba(128,128,128,.3));border-radius:12px;',
      '  background:var(--tarjeta,transparent);color:var(--texto,inherit);cursor:pointer;font:inherit;',
      '  transition:border-color .15s,box-shadow .15s,transform .15s;}',
      '.eof-perfil:hover{border-color:var(--celeste,#5bb8e8);transform:translateY(-1px);}',
      '.eof-perfil[aria-pressed="true"]{border-color:var(--celeste,#5bb8e8);',
      '  box-shadow:0 0 0 3px rgba(91,184,232,.28);}',
      '.eof-perfil-icono{font-size:1.35rem;line-height:1;}',
      '.eof-perfil-nombre{font-weight:700;font-size:.88rem;}',
      '.eof-perfil-ayuda{font-size:.76rem;line-height:1.35;opacity:.8;}',

      // Vista previa
      '.eof-pref-preview{border:1px solid var(--borde,rgba(128,128,128,.3));border-radius:12px;',
      '  padding:16px 18px;margin:0 0 6px;background:var(--fondo-alt,rgba(128,128,128,.08));}',
      '.eof-pref-preview-etiqueta{display:inline-block;font-size:.66rem;font-weight:700;',
      '  letter-spacing:.1em;text-transform:uppercase;color:var(--texto-suave,inherit);margin-bottom:8px;}',
      '.eof-pref-preview h4{font-family:var(--font-headline,Georgia,serif);font-size:1.2rem;',
      '  line-height:1.25;margin:0 0 8px!important;color:var(--marino-texto,inherit);}',
      '.eof-pref-preview p{font-family:var(--font-body,Georgia,serif);font-size:1rem;',
      '  line-height:1.7;margin:0 0 12px!important;color:var(--texto,inherit);}',
      '.eof-pref-preview p a{color:var(--celeste,#5bb8e8);text-decoration:underline;text-underline-offset:2px;}',
      '.eof-pref-preview-pie{display:flex;flex-wrap:wrap;align-items:center;gap:12px;}',
      '.eof-pref-chip{display:inline-block;padding:3px 11px;border-radius:999px;',
      '  background:var(--celeste,#5bb8e8);color:#0c1b2e;font-size:.72rem;font-weight:700;}',
      '.eof-pref-preview-btn{display:inline-block;padding:6px 14px;border-radius:8px;',
      '  border:1.5px solid var(--celeste,#5bb8e8);font-size:.8rem;font-weight:600;color:var(--texto,inherit);}',
      '.eof-pref-preview-pie a{font-size:.82rem;font-weight:600;color:var(--texto,inherit);}',

      // Grupos y filas
      '.eof-pref-grupo{margin:0;}',
      '.eof-pref-grupo-titulo{display:flex;align-items:center;gap:8px;margin:24px 0 2px!important;',
      '  padding:0 0 9px!important;font-family:var(--font-tit,inherit);font-size:.78rem!important;',
      '  font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--marino-texto,inherit);',
      '  border-bottom:2px solid var(--celeste,#5bb8e8);}',
      '.eof-pref-lista{display:flex;flex-direction:column;gap:2px;}',
      '.eof-pref-fila{display:flex;align-items:center;justify-content:space-between;',
      '  gap:16px;padding:14px 0;border-bottom:1px solid var(--borde,rgba(128,128,128,.25));}',
      '.eof-pref-fila:last-child{border-bottom:none;}',
      '.eof-pref-fila--bloque{flex-direction:column;align-items:stretch;gap:10px;}',
      '.eof-pref-texto{flex:1;min-width:0;}',
      '.eof-pref-titulo{display:block;font-weight:600;font-size:.92rem;',
      '  color:var(--marino-texto,inherit);margin:0 0 2px!important;}',
      '.eof-pref-ayuda{display:block;font-size:.8rem;line-height:1.4;',
      '  color:var(--texto-suave,inherit);opacity:.85;}',

      // Selector segmentado (botones de radio con aspecto de píldoras)
      '.eof-seg{display:flex;flex-wrap:wrap;gap:6px;}',
      '.eof-seg-op{position:relative;display:block!important;flex:1 1 auto;min-width:0;margin:0!important;}',
      '.eof-seg-op input,.eof-acento input{position:absolute!important;inset:0;',
      '  width:100%!important;height:100%!important;margin:0!important;padding:0!important;',
      '  border:0!important;opacity:0;cursor:pointer;z-index:1;}',
      '.eof-seg-op span{display:block;text-align:center;padding:9px 14px;',
      '  border:1.5px solid var(--borde,rgba(128,128,128,.35));border-radius:10px;',
      '  font-size:.85rem;font-weight:600;line-height:1.25;color:var(--texto,inherit);',
      '  background:var(--tarjeta,transparent);transition:background .15s,border-color .15s;user-select:none;}',
      '.eof-seg-op:hover span{border-color:var(--celeste,#5bb8e8);}',
      '.eof-seg-op input:checked + span{background:var(--celeste,#5bb8e8);',
      '  border-color:var(--celeste,#5bb8e8);color:#0c1b2e;}',
      '.eof-seg-op input:focus-visible + span,.eof-acento input:focus-visible + span{',
      '  outline:2px solid var(--celeste,#5bb8e8);outline-offset:2px;}',

      // Muestras de color de acento
      '.eof-acentos{display:flex;flex-wrap:wrap;gap:12px;}',
      '.eof-acento{position:relative;display:block!important;width:38px;height:38px;margin:0!important;}',
      '.eof-acento span{display:flex;align-items:center;justify-content:center;width:100%;height:100%;',
      '  border-radius:50%;background:var(--muestra);border:3px solid transparent;',
      '  box-shadow:inset 0 0 0 2px rgba(255,255,255,.55);color:#0c1b2e;font-weight:800;font-size:.95rem;',
      '  transition:transform .15s;}',
      '.eof-acento:hover span{transform:scale(1.08);}',
      '.eof-acento input:checked + span{border-color:var(--texto,#000);}',
      '.eof-acento input:checked + span::after{content:"\\2713";}',

      // Interruptor
      '.eof-pref-interruptor{position:relative;display:block;width:46px;height:26px;flex-shrink:0;margin:0!important;}',
      '.eof-pref-interruptor input{opacity:0;width:100%!important;height:100%!important;margin:0!important;',
      '  padding:0!important;border:0!important;position:absolute;inset:0;cursor:pointer;z-index:1;}',
      '.eof-pref-interruptor span{position:absolute;inset:0;border-radius:26px;',
      '  background:#b9c0c9;transition:background .2s;}',
      '.eof-pref-interruptor span::after{content:"";position:absolute;top:3px;left:3px;',
      '  width:20px;height:20px;border-radius:50%;background:#fff;',
      '  transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.3);}',
      '.eof-pref-interruptor input:checked + span{background:var(--celeste,#5bb8e8);}',
      '.eof-pref-interruptor input:checked + span::after{transform:translateX(20px);}',
      '.eof-pref-interruptor input:focus-visible + span{',
      '  outline:2px solid var(--celeste,#5bb8e8);outline-offset:2px;}',

      // Pie: botones y estado
      '.eof-pref-pie{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:20px;}',
      '.eof-pref-btn,.eof-pref-reset{background:none;border:1px solid var(--borde,rgba(128,128,128,.4));',
      '  color:inherit;border-radius:8px;padding:8px 14px;font-size:.85rem;cursor:pointer;font-family:inherit;}',
      '.eof-pref-btn:hover,.eof-pref-reset:hover{border-color:var(--celeste,#5bb8e8);}',
      '.eof-pref-estado{flex:1 1 220px;font-size:.82rem;opacity:.75;}',
      '.eof-pref-importar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}',
      '.eof-pref-importar[hidden]{display:none!important;}',
      '.eof-pref-importar input{flex:1 1 220px;min-width:0;width:auto!important;margin:0!important;',
      '  padding:8px 12px!important;font-size:.85rem!important;}',

      '@media (max-width:560px){',
      '  .eof-pref-fila:not(.eof-pref-fila--bloque){gap:12px;}',
      '  .eof-pref-pie .eof-pref-btn,.eof-pref-pie .eof-pref-reset{flex:1 1 auto;}',
      '}'
    );

    return c.join("\n");
  }

  function inyectarCSS() {
    if (document.getElementById("eof-prefs-css")) return;
    var st = document.createElement("style");
    st.id = "eof-prefs-css";
    st.textContent = construirCSS();
    (document.head || document.documentElement).appendChild(st);
  }

  // ---------- Ayudas de lectura creadas por JS ----------
  // Guía de lectura (franja que sigue al puntero o al dedo). Necesita <body>, que aún no existe cuando este script
  // corre en <head>; si hace falta, se montan al terminar de cargar.
  var ayudas = { guia: null, y: null, esperando: false };
  var PASIVO = { passive: true };

  function crearAyuda(id) {
    var el = document.createElement("div");
    el.id = id;
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    return el;
  }

  function quitarAyuda(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function moverGuia(y) {
    ayudas.y = y;
    var el = ayudas.guia;
    if (!el) return;
    var alto = el.offsetHeight || 54;
    el.style.transform = "translateY(" + Math.round(y - alto / 2) + "px)";
  }

  function alPuntero(e) {
    if (typeof e.clientY === "number") moverGuia(e.clientY);
  }

  function alToque(e) {
    var t = e.touches && e.touches[0];
    if (t) moverGuia(t.clientY);
  }

  function aplicarAyudas(prefs) {
    if (!document.body) {
      if (!ayudas.esperando) {
        ayudas.esperando = true;
        document.addEventListener("DOMContentLoaded", function () {
          ayudas.esperando = false;
          aplicarAyudas(leer());
        });
      }
      return;
    }

    // Guía de lectura
    if (prefs.guia !== "no") {
      if (!ayudas.guia) {
        ayudas.guia = crearAyuda("eof-guia");
        window.addEventListener("pointermove", alPuntero, PASIVO);
        window.addEventListener("touchstart", alToque, PASIVO);
        window.addEventListener("touchmove", alToque, PASIVO);
        // Hasta que se mueva el puntero (p. ej. con teclado), queda a
        // la altura de la zona de lectura habitual.
        if (ayudas.y === null) ayudas.y = window.innerHeight * 0.4;
      }
      ayudas.guia.setAttribute("data-modo", prefs.guia);
      moverGuia(ayudas.y);
    } else if (ayudas.guia) {
      window.removeEventListener("pointermove", alPuntero, false);
      window.removeEventListener("touchstart", alToque, false);
      window.removeEventListener("touchmove", alToque, false);
      quitarAyuda(ayudas.guia);
      ayudas.guia = null;
    }
  }

  // ---------- Scroll suave desde JS ----------
  // "scroll-behavior:auto" no anula las llamadas que piden
  // behavior:"smooth" explícitamente (scrollIntoView, scrollTo, como las
  // del botón "volver arriba" o del tutorial del panel). Se interceptan
  // y, con las animaciones desactivadas, se fuerzan a salto directo.
  function sinScrollSuave() {
    return document.documentElement.getAttribute("data-eof-anim") === "off";
  }

  function forzarBehaviorAuto(args) {
    var o = args[0];
    if (o && typeof o === "object" && o.behavior === "smooth") {
      var copia = {};
      for (var k in o) copia[k] = o[k];
      copia.behavior = "auto";
      args[0] = copia;
    }
    return args;
  }

  function envolver(proto, nombre) {
    var original = proto && proto[nombre];
    if (typeof original !== "function" || original._eofEnvuelto) return;
    var nueva = function () {
      var args = Array.prototype.slice.call(arguments);
      if (sinScrollSuave()) args = forzarBehaviorAuto(args);
      return original.apply(this, args);
    };
    nueva._eofEnvuelto = true;
    proto[nombre] = nueva;
  }

  try {
    envolver(Element.prototype, "scrollIntoView");
    envolver(Element.prototype, "scrollTo");
    envolver(Element.prototype, "scroll");
    envolver(window, "scrollTo");
    envolver(window, "scroll");
  } catch (e) {
    // Si algún navegador no deja sobrescribirlos, solo se pierde el
    // ajuste del scroll suave por JS; el resto de opciones funciona.
  }

  // ---------- Aplicación inmediata ----------
  inyectarCSS();
  aplicar(leer());

  // Si se cambia la preferencia en otra pestaña, esta se actualiza sola.
  window.addEventListener("storage", function (e) {
    if (e.key === CLAVE || e.key === null) aplicar(leer());
  });

  // ---------- Definición del panel ----------
  // Todo el panel sale de estas listas: para añadir una opción basta con
  // (1) añadir su clave en POR_DEFECTO / VALORES_VALIDOS, (2) su regla CSS
  // arriba y su atributo en aplicar(), y (3) una fila aquí.
  //   tipo "seg" -> selector segmentado con varias opciones
  //   tipo "sw"  -> interruptor (si/no = valores guardados al activar/desactivar)
  var GRUPOS = [
    {
      titulo: "Apariencia",
      filas: [
        { tipo: "tema" },
        { tipo: "acento" },
        {
          tipo: "sw", clave: "contraste", si: "alto", no: "normal",
          titulo: "Alto contraste",
          ayuda: "Textos más oscuros (o más claros en modo oscuro) y bordes más marcados para distinguir mejor cada elemento."
        }
      ]
    },
    {
      titulo: "Texto",
      filas: [
        {
          tipo: "seg", clave: "texto", titulo: "Tamaño del texto",
          ayuda: "Agranda o reduce todo el texto de la web.",
          opciones: [["pequeno", "Pequeño"], ["normal", "Normal"], ["grande", "Grande"], ["muygrande", "Muy grande"]]
        },
        {
          tipo: "seg", clave: "fuente", titulo: "Tipo de letra",
          ayuda: "La fuente legible es más abierta y sencilla; la de serifa recuerda a la prensa clásica.",
          opciones: [["normal", "La del sitio"], ["legible", "Más legible"], ["serif", "Con serifa"]],
          estilos: {
            legible: "font-family:Verdana,Tahoma,sans-serif;",
            serif: "font-family:Georgia,'Times New Roman',serif;"
          }
        },
        {
          tipo: "seg", clave: "interlineado", titulo: "Espaciado entre líneas",
          ayuda: "Separa más las líneas de los textos largos.",
          opciones: [["normal", "Normal"], ["amplio", "Amplio"], ["muyamplio", "Muy amplio"]]
        },
        {
          tipo: "seg", clave: "letras", titulo: "Espaciado entre letras y palabras",
          ayuda: "Más aire entre letras y palabras en los textos de lectura; ayuda a quien se cansa o se pierde al leer.",
          opciones: [["normal", "Normal"], ["amplio", "Amplio"], ["muyamplio", "Muy amplio"]]
        },
        {
          tipo: "seg", clave: "ancho", titulo: "Ancho de las noticias",
          ayuda: "Una columna más estrecha da líneas más cortas y fáciles de seguir; una más ancha aprovecha mejor pantallas grandes.",
          opciones: [["estrecho", "Estrecho"], ["normal", "Normal"], ["ancho", "Ancho"]]
        },
        {
          tipo: "sw", clave: "enlaces", si: "subrayados", no: "normal",
          titulo: "Subrayar todos los enlaces",
          ayuda: "Distingue los enlaces sin depender del color."
        }
      ]
    },
    {
      titulo: "Movimiento",
      filas: [{ tipo: "anim" }]
    },
    {
      titulo: "Ayudas de lectura y accesibilidad",
      filas: [
        {
          tipo: "seg", clave: "guia", titulo: "Guía de lectura",
          ayuda: "Una franja que sigue al ratón o al dedo para no perder la línea. «Foco» oscurece el resto de la pantalla. Solo aparece al leer noticias y páginas de texto (línea editorial, privacidad, etc.).",
          opciones: [["no", "Desactivada"], ["banda", "Franja"], ["foco", "Foco"]]
        },
        {
          tipo: "sw", clave: "barra", bool: true,
          titulo: "Barra de progreso en las noticias",
          ayuda: "La línea roja bajo la cabecera que avanza mientras lees una noticia. Desactívala si te distrae."
        },
        {
          tipo: "sw", clave: "foco", bool: true,
          titulo: "Marco visible al moverte con el teclado",
          ayuda: "Si navegas con la tecla Tab, rodea con un marco amarillo grueso el botón, enlace o campo en el que estás, para que nunca pierdas de vista dónde te encuentras. Pruébalo: actívalo y pulsa Tab."
        },
        {
          tipo: "sw", clave: "tactil", bool: true,
          titulo: "Botones y campos más grandes",
          ayuda: "Agranda la zona de pulsación de botones y formularios; útil en móvil o si te cuesta acertar."
        }
      ]
    }
  ];

  var PERFILES = [
    {
      id: "lectura", icono: "📖", nombre: "Lectura cómoda",
      ayuda: "Letra legible y más grande, con más aire entre líneas.",
      prefs: { texto: "grande", fuente: "legible", interlineado: "amplio", ancho: "estrecho" }
    },
    {
      id: "claridad", icono: "🔆", nombre: "Máxima claridad",
      ayuda: "Alto contraste, texto muy grande y enlaces subrayados.",
      prefs: { contraste: "alto", texto: "muygrande", enlaces: "subrayados", foco: true }
    },
    {
      id: "concentracion", icono: "🎯", nombre: "Concentración",
      ayuda: "Sin animaciones y con una franja que guía la lectura.",
      prefs: { sinAnimaciones: true, guia: "banda" }
    }
  ];

  var TEMAS = [["light", "Claro"], ["dark", "Oscuro"], ["auto", "Automático"]];

  function dispositivoPideMenosMovimiento() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      return false;
    }
  }

  function escapar(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---------- HTML del panel ----------
  function htmlTexto(idTitulo, titulo, ayuda, etiquetaPara) {
    var tag = etiquetaPara ? "label" : "span";
    var para = etiquetaPara ? ' for="' + etiquetaPara + '"' : "";
    return '<div class="eof-pref-texto">' +
      '<' + tag + ' class="eof-pref-titulo" id="' + idTitulo + '"' + para + '>' + escapar(titulo) + '</' + tag + '>' +
      '<span class="eof-pref-ayuda">' + escapar(ayuda) + '</span>' +
    '</div>';
  }

  function htmlSegmentado(nombre, opciones, estilos, extraInput) {
    return '<div class="eof-seg" role="radiogroup">' +
      opciones.map(function (o) {
        var estilo = estilos && estilos[o[0]] ? ' style="' + estilos[o[0]] + '"' : "";
        return '<label class="eof-seg-op">' +
          '<input type="radio" name="' + nombre + '" value="' + o[0] + '"' + extraInput + '>' +
          '<span' + estilo + '>' + escapar(o[1]) + '</span>' +
        '</label>';
      }).join("") +
    '</div>';
  }

  function htmlFila(f, idBase, conTema) {
    var id = idBase + "-" + (f.clave || f.tipo);

    if (f.tipo === "tema") {
      if (!conTema) return "";
      return '<div class="eof-pref-fila eof-pref-fila--bloque" role="group" aria-labelledby="' + id + '-t">' +
        htmlTexto(id + "-t", "Tema",
          "«Automático» sigue el modo claro u oscuro de tu dispositivo. También puedes cambiarlo con el botón de la cabecera.") +
        htmlSegmentado(id, TEMAS, null, ' data-tema="1"') +
      '</div>';
    }

    if (f.tipo === "acento") {
      var muestras = Object.keys(ACENTOS).map(function (k) {
        return '<label class="eof-acento" title="' + ACENTOS[k][2] + '">' +
          '<input type="radio" name="' + id + '" value="' + k + '" data-clave="acento" aria-label="' + ACENTOS[k][2] + '">' +
          '<span style="--muestra:' + ACENTOS[k][0] + '"></span>' +
        '</label>';
      }).join("");
      return '<div class="eof-pref-fila eof-pref-fila--bloque" role="group" aria-labelledby="' + id + '-t">' +
        htmlTexto(id + "-t", "Color de acento",
          "Cambia el color de botones activos, interruptores, subrayados e insignias.") +
        '<div class="eof-acentos" role="radiogroup">' + muestras + '</div>' +
      '</div>';
    }

    if (f.tipo === "anim") {
      return '<div class="eof-pref-fila">' +
        htmlTexto(id + "-t", "Desactivar animaciones",
          "Quita transiciones, parpadeos, textos que se desplazan y el desplazamiento suave. " +
          "Si tu dispositivo ya pide reducir el movimiento, se respeta siempre.", id) +
        '<span class="eof-pref-interruptor">' +
          '<input type="checkbox" id="' + id + '" role="switch" data-anim="1">' +
          '<span aria-hidden="true"></span>' +
        '</span>' +
      '</div>';
    }

    if (f.tipo === "seg") {
      return '<div class="eof-pref-fila eof-pref-fila--bloque" role="group" aria-labelledby="' + id + '-t">' +
        htmlTexto(id + "-t", f.titulo, f.ayuda) +
        htmlSegmentado(id, f.opciones, f.estilos, ' data-clave="' + f.clave + '"') +
      '</div>';
    }

    // tipo "sw"
    var datos = f.bool
      ? ' data-clave="' + f.clave + '" data-bool="1"'
      : ' data-clave="' + f.clave + '" data-si="' + f.si + '" data-no="' + f.no + '"';
    return '<div class="eof-pref-fila">' +
      htmlTexto(id + "-t", f.titulo, f.ayuda, id) +
      '<span class="eof-pref-interruptor">' +
        '<input type="checkbox" id="' + id + '" role="switch"' + datos + '>' +
        '<span aria-hidden="true"></span>' +
      '</span>' +
    '</div>';
  }

  function htmlPerfiles() {
    return '<p class="eof-pref-subtitulo">Perfiles rápidos</p>' +
      '<div class="eof-perfiles">' +
        PERFILES.map(function (p) {
          return '<button type="button" class="eof-perfil" data-perfil="' + p.id + '" aria-pressed="false">' +
            '<span class="eof-perfil-icono" aria-hidden="true">' + p.icono + '</span>' +
            '<span class="eof-perfil-nombre">' + escapar(p.nombre) + '</span>' +
            '<span class="eof-perfil-ayuda">' + escapar(p.ayuda) + '</span>' +
          '</button>';
        }).join("") +
      '</div>';
  }

  function htmlVistaPrevia() {
    return '<p class="eof-pref-subtitulo">Vista previa</p>' +
      '<div class="eof-pref-preview" aria-hidden="true">' +
        '<span class="eof-pref-preview-etiqueta">Así se verá</span>' +
        '<h4>El derbi se decide en el último minuto</h4>' +
        '<p>Un gol tardío desató la euforia en la grada y dejó al equipo a un punto del liderato. ' +
          '<a>Leer la crónica completa</a>.</p>' +
        '<div class="eof-pref-preview-pie">' +
          '<span class="eof-pref-chip">Segunda Federación</span>' +
          '<span class="eof-pref-preview-btn">Botón de ejemplo</span>' +
          '<a>Ver clasificación</a>' +
        '</div>' +
      '</div>';
  }

  // ---------- Códigos para llevar la configuración a otro dispositivo ----------
  var PREFIJO_CODIGO = "EOF1.";

  function crearCodigo(tema) {
    var o = leer();
    o.tema = tema ? tema.leer() : "light";
    return PREFIJO_CODIGO + btoa(JSON.stringify(o));
  }

  function leerCodigo(texto) {
    texto = String(texto || "").trim();
    if (texto.indexOf(PREFIJO_CODIGO) !== 0) return null;
    try {
      var o = JSON.parse(atob(texto.slice(PREFIJO_CODIGO.length)));
      return o && typeof o === "object" ? o : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- Montaje del panel ----------
  function montarPanel(contenedor) {
    if (!contenedor) return;
    var tema = window.EOFTema || null;
    var idBase = "eofPref" + Math.random().toString(36).slice(2, 7);

    var html = htmlPerfiles() + htmlVistaPrevia();
    GRUPOS.forEach(function (g) {
      var filas = g.filas.map(function (f) { return htmlFila(f, idBase, !!tema); }).join("");
      if (!filas) return;
      html += '<section class="eof-pref-grupo">' +
        '<h4 class="eof-pref-grupo-titulo">' + escapar(g.titulo) + '</h4>' +
        '<div class="eof-pref-lista">' + filas + '</div>' +
      '</section>';
    });
    html +=
      '<div class="eof-pref-pie">' +
        '<button type="button" class="eof-pref-btn" data-accion="reset">Restablecer todo</button>' +
        '<button type="button" class="eof-pref-btn" data-accion="copiar">Copiar mi configuración</button>' +
        '<button type="button" class="eof-pref-btn" data-accion="pegar">Usar un código</button>' +
        '<span class="eof-pref-estado" role="status" aria-live="polite" data-estado="1">' +
          'Los cambios se aplican al momento y se guardan en este dispositivo.' +
        '</span>' +
      '</div>' +
      '<div class="eof-pref-importar" hidden>' +
        '<input type="text" data-codigo="1" placeholder="Pega aquí tu código (EOF1…)" aria-label="Código de configuración" autocomplete="off" spellcheck="false">' +
        '<button type="button" class="eof-pref-btn" data-accion="aplicar-codigo">Aplicar</button>' +
      '</div>';

    // Los listeners cuelgan de un nodo propio: si el panel se monta dos
    // veces en el mismo contenedor, el anterior desaparece con los suyos.
    var raiz = document.createElement("div");
    raiz.className = "eof-pref-panel";
    raiz.innerHTML = html;
    contenedor.innerHTML = "";
    contenedor.appendChild(raiz);

    var estado = raiz.querySelector("[data-estado]");
    var textoEstadoInicial = estado.textContent;
    var zonaCodigo = raiz.querySelector(".eof-pref-importar");
    var campoCodigo = raiz.querySelector("[data-codigo]");
    var temporizador;

    function avisar(mensaje) {
      estado.textContent = mensaje;
      clearTimeout(temporizador);
      temporizador = setTimeout(function () {
        estado.textContent = textoEstadoInicial;
      }, 2600);
    }

    function coincidePerfil(p, perfil) {
      var base = normalizar({});
      return Object.keys(POR_DEFECTO).every(function (k) {
        if (k === "acento") return true; // el color es cosa de gustos, no del perfil
        var esperado = perfil.prefs.hasOwnProperty(k) ? perfil.prefs[k] : base[k];
        return p[k] === esperado;
      });
    }

    function pintarValores() {
      if (!raiz.isConnected) return; // panel ya sustituido o retirado
      var p = leer();

      raiz.querySelectorAll("input[data-clave]").forEach(function (inp) {
        var clave = inp.getAttribute("data-clave");
        if (inp.type === "radio") {
          inp.checked = String(p[clave]) === inp.value;
        } else if (inp.hasAttribute("data-bool")) {
          inp.checked = p[clave] === true;
        } else {
          inp.checked = p[clave] === inp.getAttribute("data-si");
        }
      });

      var chkAnim = raiz.querySelector("input[data-anim]");
      if (chkAnim) {
        // Si el dispositivo ya pide menos movimiento, el CSS del sitio
        // lo aplica siempre: el interruptor se muestra activado y
        // bloqueado para no dar a entender que se puede revertir.
        var forzado = dispositivoPideMenosMovimiento();
        chkAnim.checked = forzado || p.sinAnimaciones === true;
        chkAnim.disabled = forzado;
      }

      if (tema) {
        var t = tema.leer();
        raiz.querySelectorAll("input[data-tema]").forEach(function (inp) {
          inp.checked = inp.value === t;
        });
      }

      raiz.querySelectorAll("[data-perfil]").forEach(function (b) {
        var perfil = PERFILES.filter(function (x) { return x.id === b.getAttribute("data-perfil"); })[0];
        b.setAttribute("aria-pressed", perfil && coincidePerfil(p, perfil) ? "true" : "false");
      });
    }

    function cambiar(modificar) {
      var p = leer();
      modificar(p);
      guardar(p);
      aplicar(p);
      pintarValores();
      avisar("Guardado ✓");
    }

    // Un solo listener para todos los controles (radios e interruptores).
    raiz.addEventListener("change", function (e) {
      var inp = e.target;
      if (!inp || inp.tagName !== "INPUT") return;

      if (inp.hasAttribute("data-tema")) {
        if (tema) tema.fijar(inp.value);
        pintarValores();
        avisar("Guardado ✓");
        return;
      }
      if (inp.hasAttribute("data-anim")) {
        cambiar(function (p) { p.sinAnimaciones = inp.checked; });
        return;
      }
      var clave = inp.getAttribute("data-clave");
      if (!clave) return;
      if (inp.type === "radio") {
        cambiar(function (p) { p[clave] = inp.value; });
      } else if (inp.hasAttribute("data-bool")) {
        cambiar(function (p) { p[clave] = inp.checked; });
      } else {
        cambiar(function (p) {
          p[clave] = inp.checked ? inp.getAttribute("data-si") : inp.getAttribute("data-no");
        });
      }
    });

    raiz.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (!btn || !raiz.contains(btn)) return;

      // Perfiles rápidos: pulsar otra vez el activo lo quita.
      var idPerfil = btn.getAttribute("data-perfil");
      if (idPerfil) {
        var perfil = PERFILES.filter(function (x) { return x.id === idPerfil; })[0];
        if (!perfil) return;
        cambiar(function (p) {
          var activo = coincidePerfil(p, perfil);
          var nuevo = normalizar({});
          nuevo.acento = p.acento;
          if (!activo) {
            Object.keys(perfil.prefs).forEach(function (k) { nuevo[k] = perfil.prefs[k]; });
          }
          Object.keys(nuevo).forEach(function (k) { p[k] = nuevo[k]; });
        });
        return;
      }

      var accion = btn.getAttribute("data-accion");
      if (accion === "reset") {
        var p0 = normalizar({});
        guardar(p0);
        aplicar(p0);
        if (tema) tema.fijar("light");
        pintarValores();
        avisar("Valores restablecidos ✓");
      } else if (accion === "copiar") {
        var codigo = crearCodigo(tema);
        var alFallar = function () {
          // Sin permiso de portapapeles: se muestra el código para copiarlo a mano.
          zonaCodigo.hidden = false;
          campoCodigo.value = codigo;
          campoCodigo.focus();
          campoCodigo.select();
          avisar("Copia este código con Ctrl+C y pégalo en el otro dispositivo.");
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(codigo).then(function () {
            avisar("Código copiado ✓ Pégalo en «Usar un código» en tu otro dispositivo.");
          }, alFallar);
        } else {
          alFallar();
        }
      } else if (accion === "pegar") {
        zonaCodigo.hidden = !zonaCodigo.hidden;
        if (!zonaCodigo.hidden) {
          campoCodigo.value = "";
          campoCodigo.focus();
        }
      } else if (accion === "aplicar-codigo") {
        var datos = leerCodigo(campoCodigo.value);
        if (!datos) {
          avisar("Ese código no es válido. Cópialo de nuevo desde «Copiar mi configuración».");
          return;
        }
        var importadas = normalizar(datos);
        guardar(importadas);
        aplicar(importadas);
        if (tema && (datos.tema === "light" || datos.tema === "dark" || datos.tema === "auto")) {
          tema.fijar(datos.tema);
        }
        zonaCodigo.hidden = true;
        campoCodigo.value = "";
        pintarValores();
        avisar("Configuración aplicada ✓");
      }
    });

    campoCodigo.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        raiz.querySelector('[data-accion="aplicar-codigo"]').click();
      }
    });

    // Mantiene el panel sincronizado si cambia desde otra pestaña...
    window.addEventListener("storage", function (e) {
      if (e.key === CLAVE || e.key === "eof_tema" || e.key === null) pintarValores();
    });
    // ...o si se cambia el tema con el botón de la cabecera.
    if (window.MutationObserver) {
      var observador = new MutationObserver(function () {
        if (!raiz.isConnected) { observador.disconnect(); return; }
        pintarValores();
      });
      observador.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"]
      });
    }

    pintarValores();
  }

  window.EOFPrefs = {
    leer: leer,
    aplicar: aplicar,
    montarPanel: montarPanel
  };
})();