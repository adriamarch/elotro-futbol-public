/* ============================================================
   Tutorial guiado del panel de redacción (v3).

   - Se lanza solo la primera vez que alguien entra al panel (se
     recuerda en localStorage, por usuario) y se puede repetir desde
     el menú de cuenta («Ver tutorial») o desde Ajustes > Preferencias.
   - Recorre las pestañas REALES del panel resaltando cada zona. Los
     pasos de pestañas/secciones que la persona no ve por su rol o
     nivel se omiten solos (hay que ver el elemento para que cuente).
   - Dos recorridos: completo y «solo lo esencial».
   - Teclado: ← / → para moverse, Esc para salir, Tab queda atrapado
     en la tarjeta. En móvil la tarjeta es una hoja inferior.

   Depende de USER (admin.js) y de las pestañas reales del panel
   (data-tab / data-subtab). Estilos: css/tutorial.css.
   API: window.EOF_TUTORIAL.iniciar({ modo: "completo" | "esencial" })
   ============================================================ */

(function () {
  "use strict";

  // USER se resuelve al usarlo (no al cargar), para no depender del
  // orden en que se evalúen admin.js y este archivo.
  function usuarioActual() {
    try {
      if (typeof USER !== "undefined" && USER) return USER;
    } catch (e) { /* USER aún sin declarar */ }
    try { return JSON.parse(localStorage.getItem("eof_user") || "null"); } catch (e) { return null; }
  }

  if (!usuarioActual()) return;

  function clave(user) {
    return "eof_tutorial_visto_" + ((user && (user.username || user.id)) || "anon");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  const esMovil = () => window.matchMedia("(max-width: 640px)").matches;
  // Respeta tanto la preferencia del sistema como el ajuste «Desactivar
  // animaciones» del propio panel (preferencias.js pone data-eof-anim="off").
  const reducirMovimiento = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.getAttribute("data-eof-anim") === "off";

  // ---------- Capítulos (la «etiqueta» que sale en cada tarjeta) ----------
  const CAPITULOS = {
    panel:          { emoji: "🧭", nombre: "El panel" },
    noticias:       { emoji: "📰", nombre: "Noticias" },
    resultados:     { emoji: "⚽", nombre: "Resultados" },
    contenido:      { emoji: "🖼️", nombre: "Contenido" },
    equipo:         { emoji: "🤝", nombre: "Trabajo en equipo" },
    administracion: { emoji: "🛠️", nombre: "Administración" },
    cuenta:         { emoji: "👤", nombre: "Tu cuenta" }
  };

  // ---------- Contexto de la persona (rol y nivel) ----------
  function contexto() {
    const user = usuarioActual() || {};
    const esAdmin = user.rol === "admin";
    const esFotografo = user.rol === "fotografo";
    return {
      user: user,
      esAdmin: esAdmin,
      esFotografo: esFotografo,
      nivel: esAdmin ? 4 : (Number(user.nivel) || 1),
      primerNombre: String(user.nombre || "").trim().split(/\s+/)[0] || ""
    };
  }

  function etiquetaRol(ctx) {
    if (ctx.esAdmin) return "Administrador";
    if (ctx.esFotografo) return "Fotógrafo";
    return "Redactor · Nivel " + ctx.nivel;
  }

  // ---------- Definición de los pasos ----------
  // Campos de un paso:
  //  titulo, texto      -> texto puede ser string o function(ctx). Admite
  //                        <strong> y <kbd> (es contenido propio, no del usuario).
  //  consejo            -> recuadro «💡» opcional (string o function(ctx)).
  //  capitulo           -> clave de CAPITULOS.
  //  selector           -> qué resaltar (string o array de alternativas).
  //  subir: n           -> resaltar el ancestro n niveles por encima.
  //  tab / subtab       -> pestaña y subpestaña a abrir antes.
  //  abrirDetalles      -> abre los <details> plegados que contengan el elemento.
  //  lado               -> "abajo" | "arriba" | "der" | "izq" | "centro" (por defecto, auto).
  //  esencial           -> entra en el recorrido corto.
  //  roles              -> ["admin","redactor","fotografo"] (por defecto, todos).
  //  nivelMin           -> nivel mínimo de redactor (admin cuenta como 4).
  //  alEntrar/alSalir   -> ganchos (p. ej. abrir el menú de cuenta).
  //  centrado           -> tarjeta en medio de la pantalla, sin resaltar nada.
  function definirPasos() {
    return [
      // ----- Bienvenida -----
      {
        id: "bienvenida", centrado: true, bienvenida: true, esencial: true,
        emoji: "👋",
        titulo: function (c) { return "¡Hola" + (c.primerNombre ? ", " + c.primerNombre : "") + "!"; },
        texto: function (c) {
          return c.esFotografo
            ? "Esto es la <strong>Redacción</strong> de ELOTROFÚTBOLTV. Como fotógrafo, aquí subes tus fotos y vídeos y los vinculas a la galería de cada partido. Te lo enseñamos sobre el propio panel, en un par de minutos."
            : "Esto es la <strong>Redacción</strong> de ELOTROFÚTBOLTV: desde aquí publicas noticias, cargas resultados y gestionas lo que se ve en la web. Te lo enseñamos sobre el propio panel, y puedes salir cuando quieras.";
        }
      },

      // ----- El panel -----
      {
        id: "menu", capitulo: "panel", esencial: true,
        selector: ".tabs", lado: "abajo",
        titulo: "Tu menú principal",
        texto: function (c) {
          return c.esFotografo
            ? "Cada pestaña es una zona de trabajo. El tuyo es un menú corto, justo con lo que necesitas: <strong>Contenido</strong>, <strong>Votaciones</strong>, la <strong>Tienda</strong> y tu cuenta. Debajo de cada pestaña hay una segunda fila de botones: las <strong>subpestañas</strong>."
            : "Cada pestaña es una zona de trabajo: <strong>Noticias</strong>, <strong>Resultados</strong>, <strong>Contenido</strong>… Debajo de cada una hay una segunda fila de botones, las <strong>subpestañas</strong>. Qué pestañas ves depende de tu rol y de tu nivel, así que el menú de un compañero puede ser distinto al tuyo.";
        },
        consejo: "Si tu pantalla es estrecha, desliza el menú hacia los lados para ver todas las pestañas."
      },

      // ----- Noticias -----
      {
        id: "noticias-menu", capitulo: "noticias", esencial: true, roles: ["admin", "redactor"],
        tab: "noticias", subtab: "nueva", selector: "#subtabsNoticias",
        titulo: "Noticias: tres sitios",
        texto: "<strong>+ Nueva noticia</strong> es donde escribes. <strong>Ver noticias</strong> es el listado para buscar, editar o eliminar. <strong>⚡ Noticias rápidas</strong> sirve para publicar al instante en portada una foto con un titular y un subtitular."
      },
      {
        id: "noticias-titular", capitulo: "noticias", esencial: true, roles: ["admin", "redactor"],
        tab: "noticias", subtab: "nueva", selector: "#nn-sec-titular",
        titulo: "Empieza por el titular",
        texto: "Escribe el <strong>título</strong> (obligatorio) y, si quieres, un <strong>subtítulo</strong> que lo amplíe. Un buen titular es corto, concreto y cuenta lo importante.",
        consejo: "Los campos marcados con <strong>*</strong> son obligatorios."
      },
      {
        id: "noticias-ir-a", capitulo: "noticias", roles: ["admin", "redactor"],
        tab: "noticias", subtab: "nueva", selector: "#nnNav", lado: "abajo",
        titulo: "La barra «Ir a»",
        texto: "El formulario es largo, así que esta barra te lleva directo a cada bloque: <strong>Datos, Imágenes, Redes, Partido y encuesta, Contenido, Traducciones y Publicación</strong>. Se queda fija arriba mientras bajas."
      },
      {
        id: "noticias-datos", capitulo: "noticias", esencial: true, roles: ["admin", "redactor"],
        tab: "noticias", subtab: "nueva", selector: "#nn-sec-datos", abrirDetalles: true,
        titulo: "Datos de la noticia",
        texto: "Aquí eliges el <strong>tipo</strong> de noticia, su <strong>categoría</strong>, el <strong>club</strong> y quién la firma (también puedes añadir un segundo autor). En algunos tipos la categoría o el club se rellenan solos."
      },
      {
        id: "noticias-imagenes", capitulo: "noticias", esencial: true, roles: ["admin", "redactor"],
        tab: "noticias", subtab: "nueva", selector: "#nn-sec-imagenes", abrirDetalles: true,
        titulo: "Imágenes",
        texto: "Sube la foto principal y suma más con <strong>+ Añadir otra foto</strong>. También puedes montar <strong>collages</strong>, y si la noticia va vinculada a un partido con galería, importar sus fotos con un clic.",
        consejo: "Con el selector de foco eliges qué parte de la foto se ve cuando se recorta en portada."
      },
      {
        id: "noticias-redes", capitulo: "noticias", roles: ["admin", "redactor"],
        tab: "noticias", subtab: "nueva", selector: "#nn-sec-redes", abrirDetalles: true,
        titulo: "Tweets y publicaciones",
        texto: "Si la noticia comenta un tweet o una publicación, pégala con <strong>+ Añadir tweet o post</strong> y se incrusta en el artículo."
      },
      {
        id: "noticias-partido", capitulo: "noticias", roles: ["admin", "redactor"],
        tab: "noticias", subtab: "nueva", selector: "#nn-sec-partido", abrirDetalles: true,
        titulo: "Partido y encuesta",
        texto: "Vincula la noticia con un <strong>resultado</strong> (obligatorio en previas y crónicas) y el marcador, la ficha técnica y las alineaciones se mantienen sincronizados. Desde aquí también puedes añadir una <strong>encuesta</strong> para que voten los lectores."
      },
      {
        id: "noticias-editor", capitulo: "noticias", esencial: true, roles: ["admin", "redactor"],
        tab: "noticias", subtab: "nueva", selector: "#nn-sec-contenido",
        titulo: "El cuerpo de la noticia",
        texto: "Este es el editor de texto. Escribe o pega tu texto y usa la <strong>barra de herramientas</strong> para negrita, cursiva, enlaces y más. Debajo tienes el contador de caracteres."
      },
      {
        id: "noticias-traducciones", capitulo: "noticias", roles: ["admin", "redactor"],
        tab: "noticias", subtab: "nueva", selector: "#nn-sec-traducciones", abrirDetalles: true,
        titulo: "Traducciones",
        texto: "Cada idioma tiene su propia pestaña, y una <strong>barra de progreso</strong> te dice cuántas traducciones llevas completadas."
      },
      {
        id: "noticias-publicacion", capitulo: "noticias", esencial: true, roles: ["admin", "redactor"],
        tab: "noticias", subtab: "nueva", selector: "#nn-sec-publicacion",
        titulo: "Cómo se publica",
        texto: "Marca <strong>Noticia destacada</strong> para que salga en portada y decide si queda <strong>publicada</strong> o como <strong>borrador</strong> para terminarla más tarde. Si tu rol lo permite, también puedes marcarla como <strong>última hora</strong>.",
        consejo: function (c) {
          return c.esAdmin || c.nivel >= 2
            ? "Como tienes nivel " + c.nivel + ", puedes publicar sin revisión administrativa."
            : "Con nivel 1 la casilla «Publicada» viene desmarcada: tu noticia queda como borrador para que el equipo la revise.";
        }
      },
      {
        id: "noticias-programar", capitulo: "noticias", roles: ["admin", "redactor"],
        tab: "noticias", subtab: "nueva", selector: "#bloqueProgramarNoticia",
        titulo: "Programar la publicación",
        texto: "Elige día y hora y la noticia <strong>se publicará sola</strong>. La «fecha de preferencia» es distinta: solo sugiere cuándo publicarla, no programa nada."
      },
      {
        id: "noticias-guardar", capitulo: "noticias", esencial: true, roles: ["admin", "redactor"],
        tab: "noticias", subtab: "nueva", selector: "#subpanel-nueva .nn-barra",
        titulo: "Previsualizar y guardar",
        texto: "<strong>Previsualizar</strong> te enseña cómo quedará antes de guardar. El botón principal cambia de texto según lo que vayas a hacer (publicar, guardar borrador…).",
        consejo: "Si ves «Cancelar edición» es porque estás editando una noticia que ya existía."
      },
      {
        id: "noticias-lista", capitulo: "noticias", esencial: true, roles: ["admin", "redactor"],
        tab: "noticias", subtab: "lista", selector: "#subpanel-lista .buscador-lista",
        titulo: "Ver y editar noticias",
        texto: "Busca por <strong>título, categoría o autor</strong>, filtra por estado (en revisión, en proceso…) y edita o elimina lo que necesites. Aquí aparecen las tuyas y, si tienes permiso, las de otros redactores."
      },

      // ----- Resultados -----
      {
        id: "resultados-menu", capitulo: "resultados", esencial: true, roles: ["admin", "redactor"],
        tab: "resultados", subtab: "resultado", selector: "#subtabsResultados",
        titulo: "Resultados de partidos",
        texto: function (c) {
          return "<strong>+ Nuevo resultado</strong> para cargar marcador y datos, <strong>Ver resultados</strong> para revisarlos" +
            (c.nivel >= 3 ? ", <strong>Calendario de jornadas</strong> para las fechas de cada jornada" : "") +
            " e <strong>Importación rápida</strong> para pegar varios partidos de golpe.";
        }
      },
      {
        id: "resultados-form", capitulo: "resultados", roles: ["admin", "redactor"],
        tab: "resultados", subtab: "resultado", selector: "#resultadoCabecera",
        titulo: "Cargar un resultado",
        texto: "Elige local y visitante, escribe el marcador y completa goleadores, alineaciones y ficha técnica. La cabecera te enseña <strong>cómo quedará el partido</strong> según lo vayas rellenando.",
        consejo: "Un resultado se puede vincular a una noticia para que se sincronicen solos."
      },
      {
        id: "resultados-importar", capitulo: "resultados", roles: ["admin", "redactor"],
        tab: "resultados", subtab: "importacionRapida", selector: "#tarjetaImportacionRapida",
        titulo: "Importación rápida",
        texto: "Pega el texto con los resultados de una jornada, pulsa <strong>Analizar</strong>, revisa lo que ha detectado y confirma. Ahorra muchísimo tiempo con jornadas completas."
      },

      // ----- Contenido -----
      {
        id: "contenido-subir", capitulo: "contenido", esencial: true, roles: ["fotografo"],
        tab: "contenido", subtab: "subir", selector: "#subtabsContenido",
        titulo: "Subir contenido",
        texto: "Desde aquí subes tus fotos y vídeos. Puedes <strong>arrastrar varios archivos a la vez</strong> sobre la zona de subida."
      },
      {
        id: "contenido-ver", capitulo: "contenido", roles: ["fotografo"],
        tab: "contenido", subtab: "ver", selector: "#subtabVerContenido",
        titulo: "Tu contenido subido",
        texto: "Aquí ves todo lo que has subido: puedes revisarlo, editar título y descripción o eliminarlo."
      },
      {
        id: "contenido-galeria", capitulo: "contenido", esencial: true, roles: ["fotografo"],
        tab: "contenido", subtab: "galeriaPartido", selector: "#subtabGaleriaPartido",
        titulo: "Galería de partido",
        texto: "El paso clave: elige un partido y marca qué fotos tuyas forman su galería. Así el redactor podrá usarlas al escribir la noticia, con <strong>tu crédito de autor</strong>."
      },
      {
        id: "contenido-redactor", capitulo: "contenido", esencial: true, roles: ["admin", "redactor"],
        tab: "contenido", subtab: "subir", selector: "#subtabsContenido",
        titulo: "Fotos y vídeos",
        texto: function (c) {
          return c.esAdmin
            ? "En <strong>Contenido</strong> subes fotos y vídeos para usarlos en tus noticias sin pasar por el editor. <strong>Ver contenido subido</strong> reúne todo lo del equipo y <strong>Galería de partido</strong> sirve para vincular fotos a cada partido."
            : "En <strong>Contenido</strong> subes fotos y vídeos para usarlos en tus noticias sin pasar por el editor. <strong>Mi contenido subido</strong> muestra solo lo que has subido tú, y lo puedes editar.";
        }
      },

      // ----- Trabajo en equipo -----
      {
        id: "solicitudes", capitulo: "equipo", esencial: true, roles: ["admin", "redactor"],
        tab: "solicitudes", subtab: "solicitudesRecibidas", selector: "#subtabsSolicitudes",
        titulo: "Solicitudes",
        texto: function (c) {
          return "Cuando alguien quiere editar algo tuyo (o tú algo de otra persona) se pide permiso aquí: <strong>Ediciones pendientes de mi respuesta</strong> y <strong>Mis solicitudes de edición</strong>." +
            (c.esAdmin ? " Como administrador, también gestionas las <strong>propuestas de equipos</strong> y los <strong>formularios</strong> (acreditaciones e incorporaciones)." : "");
        },
        consejo: "El número rojo sobre la pestaña indica cuántas tienes pendientes."
      },
      {
        id: "votaciones", capitulo: "equipo",
        tab: "votaciones", subtab: "votActivas", selector: "#subtabsVotaciones",
        titulo: "Votaciones del equipo",
        texto: "Decisiones internas votadas entre todos: en <strong>Activas</strong> puedes votar ahora y en <strong>Cerradas</strong> ves cómo acabaron. Quien tiene permiso ve además el botón para crear una nueva votación."
      },
      {
        id: "tienda", capitulo: "equipo",
        tab: "tienda", subtab: "tiendaCatalogo", selector: "#subtabsTienda",
        titulo: "La tienda",
        texto: "Mira el <strong>Catálogo</strong> y sigue tus pedidos en <strong>Mis pedidos</strong>. Quien gestiona la tienda ve además la gestión de pedidos y de productos."
      },

      // ----- Administración -----
      {
        id: "usuarios", capitulo: "administracion", roles: ["admin"],
        tab: "usuarios", subtab: "redactores", selector: "#subtabsUsuarios",
        titulo: "Usuarios",
        texto: "En <strong>Colaboradores</strong> gestionas a redactores y fotógrafos: altas, roles, niveles y permisos. En <strong>Lectores</strong> ves las cuentas de quienes leen la web."
      },
      {
        id: "funcionalidades", capitulo: "administracion", roles: ["admin", "redactor"],
        tab: "funcionalidades", selector: "#subtabsFuncionalidades",
        titulo: "Funcionalidades",
        texto: function (c) {
          return c.esAdmin
            ? "Aquí se configura lo que ve el público: <strong>comentarios</strong>, <strong>encuestas</strong>, <strong>newsletter</strong>, <strong>anuncios</strong>, historial, <strong>equipos</strong>, información del medio (horarios, organigrama) y <strong>redes sociales</strong>."
            : "Aquí puedes gestionar las <strong>fichas de equipo</strong>. El resto de ajustes del medio son cosa de la administración.";
        }
      },

      // ----- Tu cuenta -----
      {
        id: "campana", capitulo: "cuenta", roles: ["admin", "redactor"],
        selector: "#notifBtn", lado: "abajo",
        titulo: "Avisos de la redacción",
        texto: "Activa las <strong>notificaciones push</strong> en este dispositivo y elige de qué quieres que te avisen (contenido subido, formularios…). Llegan aunque el panel esté cerrado."
      },
      {
        id: "cuenta", capitulo: "cuenta", esencial: true,
        selector: "#cuentaMenu", lado: "abajo",
        alEntrar: function () { const m = document.getElementById("cuentaMenu"); if (m) m.classList.add("abierto"); },
        alSalir: function () { const m = document.getElementById("cuentaMenu"); if (m) m.classList.remove("abierto"); },
        titulo: "Tu menú de cuenta",
        texto: function (c) {
          return "<strong>Editar perfil</strong> es tu página de autor pública; <strong>Seguridad</strong>, tu contraseña y la verificación en dos pasos; <strong>Mi progreso</strong>, tu nivel; <strong>Dispositivos</strong>, dónde tienes la sesión abierta; y <strong>Preferencias</strong>, cómo ves el panel." +
            (c.esAdmin ? " También tienes el acceso a <strong>Analíticas</strong>." : "") +
            " Y aquí mismo puedes volver a abrir este tutorial con <strong>Ver tutorial</strong>.";
        },
        consejo: function (c) {
          return c.esAdmin ? "Como administrador, la verificación en dos pasos es obligatoria." : "Activar la verificación en dos pasos en Seguridad protege tu cuenta.";
        }
      },
      {
        id: "tema", capitulo: "cuenta", esencial: true,
        selector: "#themeToggle", lado: "abajo",
        titulo: "Modo oscuro",
        texto: "Si prefieres trabajar con la pantalla oscura, este botón cambia el tema al instante.",
        consejo: "Se recuerda en este dispositivo."
      },

      // ----- Final -----
      {
        id: "final", centrado: true, final: true, esencial: true,
        emoji: "🎉",
        titulo: "¡Listo para empezar!",
        texto: function (c) {
          return c.esFotografo
            ? "Eso es lo esencial. ¡Mucho ánimo con tu próxima sesión de fotos!"
            : "Eso es lo esencial. ¡Mucho ánimo con tu próxima noticia!";
        },
        lista: [
          ["🔁", "Puedes <strong>repetir este tutorial</strong> cuando quieras desde tu menú de cuenta → <strong>Ver tutorial</strong>."],
          ["⌨️", "Mientras lo ves: <kbd>←</kbd> <kbd>→</kbd> para moverte y <kbd>Esc</kbd> para salir."],
          ["🙋", "¿Dudas? Pregunta a la administración: nadie nace sabiendo."]
        ]
      }
    ];
  }

  function cumpleRol(paso, ctx) {
    if (paso.roles) {
      const rol = ctx.esAdmin ? "admin" : (ctx.esFotografo ? "fotografo" : "redactor");
      if (paso.roles.indexOf(rol) === -1) return false;
    }
    if (paso.nivelMin && ctx.nivel < paso.nivelMin) return false;
    return true;
  }

  function construirPasos(modo) {
    const ctx = contexto();
    return definirPasos().filter(function (p) {
      if (!cumpleRol(p, ctx)) return false;
      if (modo === "esencial" && !p.esencial) return false;
      return true;
    });
  }

  function valor(v, ctx) { return typeof v === "function" ? v(ctx) : v; }

  // ---------- Estado ----------
  let pasos = [];
  let indice = 0;
  let direccion = 1;
  let activo = false;
  let token = 0;               // invalida bucles/temporizadores de un paso anterior
  let timerBusqueda = null;
  let timerAnima = null;
  let objetivoActual = null;
  let pasoActual = null;
  let detallesAbiertos = [];   // <details> que abrimos nosotros (para devolverlos como estaban)
  let focoPrevio = null;
  let tabAlIniciar = null;
  let subtabAlIniciar = null;
  let elOverlay, elBloqueo, elSpotlight, elCard, elCentroWrap, elEstado;

  // ---------- DOM del tutorial (una sola vez) ----------
  function crearDOM() {
    if (document.getElementById("tutOverlay")) {
      elOverlay = document.getElementById("tutOverlay");
      elBloqueo = document.getElementById("tutBloqueo");
      elSpotlight = document.getElementById("tutSpotlight");
      elCentroWrap = document.getElementById("tutCentroWrap");
      elCard = document.getElementById("tutCard");
      elEstado = document.getElementById("tutEstado");
      return;
    }
    elOverlay = document.createElement("div");
    elOverlay.id = "tutOverlay";
    elOverlay.innerHTML =
      '<div id="tutBloqueo"></div>' +
      '<div id="tutSpotlight" class="tut-sin-objetivo"></div>' +
      '<div id="tutEstado" class="tut-sr" role="status" aria-live="polite"></div>';
    document.body.appendChild(elOverlay);
    elBloqueo = document.getElementById("tutBloqueo");
    elSpotlight = document.getElementById("tutSpotlight");
    elEstado = document.getElementById("tutEstado");

    // Un clic fuera de la tarjeta no hace nada, pero se «sacude» la
    // tarjeta para dar a entender que hay que usar sus botones. Se
    // corta la propagación para que el panel no cierre sus menús.
    elBloqueo.addEventListener("click", function (e) {
      e.stopPropagation();
      sacudirTarjeta();
    });

    elCentroWrap = document.createElement("div");
    elCentroWrap.id = "tutCentroWrap";
    document.body.appendChild(elCentroWrap);

    elCard = document.createElement("div");
    elCard.id = "tutCard";
    elCard.setAttribute("role", "dialog");
    elCard.setAttribute("aria-modal", "true");
    elCard.setAttribute("aria-labelledby", "tutTitulo");
    elCard.setAttribute("aria-describedby", "tutTexto");
    elCard.style.display = "none";
    elCard.addEventListener("click", function (e) { e.stopPropagation(); });
    document.body.appendChild(elCard);
  }

  function sacudirTarjeta() {
    if (!elCard || reducirMovimiento()) return;
    elCard.classList.remove("tut-nudge");
    void elCard.offsetWidth;
    elCard.classList.add("tut-nudge");
  }

  // ---------- Navegación por el propio panel ----------
  function esVisible(el) {
    if (!el || !el.getClientRects || el.getClientRects().length === 0) return false;
    const cs = window.getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }

  function irATab(tabId) {
    if (!tabId) return;
    const btn = document.querySelector('.tabs button[data-tab="' + tabId + '"]');
    if (btn && esVisible(btn) && !btn.classList.contains("activo")) btn.click();
  }

  function irASubtab(subtabId) {
    if (!subtabId) return;
    const panel = document.querySelector(".panel.activo") || document;
    const btn = panel.querySelector('.subtabs button[data-subtab="' + subtabId + '"]');
    if (btn && esVisible(btn) && !btn.classList.contains("activo")) btn.click();
  }

  // Devuelve el elemento a resaltar (o null si aún no está / no se ve).
  function buscarObjetivo(paso) {
    const lista = Array.isArray(paso.selector) ? paso.selector : [paso.selector];
    for (let i = 0; i < lista.length; i++) {
      let el = null;
      try { el = document.querySelector(lista[i]); } catch (e) { el = null; }
      if (!el) continue;
      for (let n = paso.subir || 0; n > 0 && el.parentElement; n--) el = el.parentElement;
      if (paso.abrirDetalles) abrirDetallesAncestros(el);
      if (esVisible(el)) return el;
    }
    return null;
  }

  function abrirDetallesAncestros(el) {
    for (let n = el; n; n = n.parentElement) {
      if (n.tagName === "DETAILS" && !n.open) {
        n.open = true;
        detallesAbiertos.push(n);
      }
    }
  }

  function restaurarDetalles() {
    detallesAbiertos.forEach(function (d) { d.open = false; });
    detallesAbiertos = [];
  }

  // ---------- Ciclo de vida de un paso ----------
  function limpiarTimers() {
    if (timerBusqueda) { clearTimeout(timerBusqueda); timerBusqueda = null; }
    if (timerAnima) { clearTimeout(timerAnima); timerAnima = null; }
  }

  function mostrarPaso(i, dir) {
    limpiarTimers();
    const miToken = ++token;
    direccion = dir || 1;

    if (pasoActual && pasoActual.alSalir) { try { pasoActual.alSalir(); } catch (e) {} }
    const paso = pasos[i];
    if (!paso) { finalizar(); return; }
    indice = i;
    pasoActual = paso;
    objetivoActual = null;

    if (paso.centrado) { pintarCentrado(paso, i); return; }

    // La tarjeta anterior se oculta mientras se busca el nuevo elemento,
    // para que no se pueda pulsar dos veces «Siguiente» sobre un paso viejo.
    elCard.classList.add("tut-esperando");
    elCentroWrap.classList.remove("tut-activo");
    elOverlay.classList.remove("tut-centrado");
    if (paso.alEntrar) { try { paso.alEntrar(); } catch (e) {} }
    if (paso.tab) irATab(paso.tab);
    if (paso.subtab) irASubtab(paso.subtab);

    // Algunos paneles pintan su contenido al activarse: se sondea
    // hasta ~0,6 s antes de dar el paso por imposible y saltarlo.
    const limite = Date.now() + ((paso.tab || paso.subtab) ? 600 : 150);
    (function sondear() {
      if (miToken !== token || !activo) return;
      if (paso.tab) irATab(paso.tab);
      if (paso.subtab) irASubtab(paso.subtab);
      const el = buscarObjetivo(paso);
      if (el) { pintarConObjetivo(paso, i, el, miToken); return; }
      if (Date.now() > limite) { saltarPasoNoVisible(i); return; }
      timerBusqueda = setTimeout(sondear, 70);
    })();
  }

  // El elemento no existe o no se ve (rol, nivel, ajustes…): se salta
  // en la misma dirección en la que iba la persona.
  function saltarPasoNoVisible(i) {
    const siguiente = i + direccion;
    if (siguiente >= pasos.length) { finalizar(); return; }
    if (siguiente < 0) { mostrarPaso(0, 1); return; }
    mostrarPaso(siguiente, direccion);
  }

  function botonesHTML(paso, i, esPrimero, esUltimo) {
    if (paso.bienvenida) {
      const ctx = contexto();
      const dosRecorridos = !ctx.esFotografo;
      return '<div class="tut-botones">' +
        '<button type="button" class="tut-btn-siguiente" data-tut="completo">' + (dosRecorridos ? "Recorrido completo" : "Vamos allá →") + '</button>' +
        (dosRecorridos ? '<button type="button" class="tut-btn-secundario" data-tut="esencial">Solo lo esencial</button>' : "") +
        '<button type="button" class="tut-btn-saltar" data-tut="saltar">Ahora no</button>' +
        '</div>';
    }
    if (paso.final) {
      return '<div class="tut-botones">' +
        '<button type="button" class="tut-btn-siguiente" data-tut="terminar">Empezar a trabajar</button>' +
        '<button type="button" class="tut-btn-secundario" data-tut="atras">← Volver a repasar</button>' +
        '</div>';
    }
    return '<div class="tut-botones">' +
      '<button type="button" class="tut-btn-anterior" data-tut="atras"' + (esPrimero ? " disabled" : "") + '>← Atrás</button>' +
      '<div class="tut-botones-derecha">' +
      '<button type="button" class="tut-btn-saltar" data-tut="saltar">Salir</button>' +
      '<button type="button" class="tut-btn-siguiente" data-tut="siguiente">' + (esUltimo ? "Terminar" : "Siguiente →") + '</button>' +
      '</div></div>';
  }

  function pintarCentrado(paso, i) {
    const ctx = contexto();
    const esPrimero = i === 0;
    const esUltimo = i === pasos.length - 1;
    objetivoActual = null;

    elOverlay.classList.add("tut-centrado");
    elCard.removeAttribute("style");
    elCard.removeAttribute("data-lado");
    elCard.classList.remove("tut-hoja", "tut-hoja-arriba", "tut-esperando");
    elCard.classList.add("tut-card-centrada");
    elCentroWrap.appendChild(elCard);
    elCentroWrap.classList.add("tut-activo");
    elCard.style.display = "block";

    ocultarSpotlight();

    let extra = "";
    if (paso.bienvenida) {
      // Los capítulos de la bienvenida reflejan el recorrido completo del
      // rol, aunque ahora mismo esté cargado otro.
      const completos = construirPasos("completo");
      const vistosC = {};
      const chipsC = [];
      completos.forEach(function (p) {
        if (p.capitulo && !vistosC[p.capitulo] && CAPITULOS[p.capitulo] && p.capitulo !== "panel") {
          vistosC[p.capitulo] = true;
          chipsC.push("<li>" + CAPITULOS[p.capitulo].emoji + " " + esc(CAPITULOS[p.capitulo].nombre) + "</li>");
        }
      });
      extra = '<ul class="tut-chips" aria-label="Qué vamos a ver">' + chipsC.join("") + "</ul>";
    }
    if (paso.lista) {
      extra = '<ul class="tut-lista">' + paso.lista.map(function (it) {
        return "<li><span aria-hidden=\"true\">" + it[0] + "</span><span>" + it[1] + "</span></li>";
      }).join("") + "</ul>";
    }

    elCard.innerHTML =
      '<div class="tut-cabecera">' +
        '<button type="button" class="tut-cerrar-x" data-tut="saltar" aria-label="Cerrar tutorial">✕</button>' +
        '<span class="tut-emoji" aria-hidden="true">' + (paso.emoji || "✨") + '</span>' +
        (paso.bienvenida ? '<span class="tut-rol">' + esc(etiquetaRol(ctx)) + '</span>' : "") +
        '<h3 class="tut-titulo" id="tutTitulo">' + esc(valor(paso.titulo, ctx)) + '</h3>' +
      '</div>' +
      '<div class="tut-cuerpo">' +
        '<p class="tut-texto" id="tutTexto">' + valor(paso.texto, ctx) + '</p>' +
        extra +
        botonesHTML(paso, i, esPrimero, esUltimo) +
      '</div>';

    animarEntrada();
    enlazarBotones();
    anunciar(valor(paso.titulo, ctx));
    enfocarPrimario();
  }

  function pintarConObjetivo(paso, i, objetivo, miToken) {
    const ctx = contexto();
    const esPrimero = i === 0;
    const esUltimo = i === pasos.length - 1;
    const cap = CAPITULOS[paso.capitulo];
    const progreso = pasos.length > 1 ? Math.round((i / (pasos.length - 1)) * 100) : 100;
    const consejo = valor(paso.consejo, ctx);

    elOverlay.classList.remove("tut-centrado");
    elCentroWrap.classList.remove("tut-activo");
    elCard.removeAttribute("style");
    elCard.classList.remove("tut-card-centrada");
    document.body.appendChild(elCard);
    elCard.style.display = "block";
    // Mientras la página se desplaza hasta el elemento, la tarjeta
    // espera oculta: así no «baila» de arriba a abajo durante el scroll.
    elCard.classList.add("tut-esperando");

    elCard.innerHTML =
      '<span class="tut-flecha" aria-hidden="true"></span>' +
      '<button type="button" class="tut-cerrar-x" data-tut="saltar" aria-label="Cerrar tutorial">✕</button>' +
      '<div class="tut-meta">' +
        (cap ? '<span class="tut-capitulo"><span aria-hidden="true">' + cap.emoji + '</span>' + esc(cap.nombre) + '</span>' : "<span></span>") +
        '<span class="tut-contador" aria-label="Paso ' + (i + 1) + ' de ' + pasos.length + '">' + (i + 1) + ' / ' + pasos.length + '</span>' +
      '</div>' +
      '<h3 class="tut-titulo" id="tutTitulo">' + esc(valor(paso.titulo, ctx)) + '</h3>' +
      '<p class="tut-texto" id="tutTexto">' + valor(paso.texto, ctx) + '</p>' +
      (consejo ? '<p class="tut-consejo"><span class="tut-consejo-ico" aria-hidden="true">💡</span><span>' + consejo + '</span></p>' : "") +
      '<div class="tut-barra" role="progressbar" aria-label="Progreso del tutorial" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progreso + '"><div class="tut-barra-relleno" style="width:' + progreso + '%"></div></div>' +
      botonesHTML(paso, i, esPrimero, esUltimo) +
      '<p class="tut-atajos"><kbd>←</kbd> <kbd>→</kbd> para moverte · <kbd>Esc</kbd> para salir</p>';

    enlazarBotones();
    anunciar("Paso " + (i + 1) + " de " + pasos.length + ": " + valor(paso.titulo, ctx));

    objetivoActual = objetivo;
    if (!reducirMovimiento()) {
      elSpotlight.classList.add("tut-anima");
      timerAnima = setTimeout(function () { elSpotlight.classList.remove("tut-anima"); }, 420);
    }
    llevarAVista(objetivo);
    seguirObjetivo(miToken, true);
  }

  // ---------- Scroll hasta el elemento ----------
  // Busca que se vean a la vez el elemento Y su tarjeta (centrando el
  // «conjunto»), y solo se mueve la página si hace falta.
  function llevarAVista(objetivo) {
    try { objetivo.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" }); } catch (e) {}
    const r = objetivo.getBoundingClientRect();
    const vh = window.innerHeight;
    const ah = (elCard && elCard.offsetHeight) || 200;
    const gap = 16;
    let deseado;
    let hace;

    if (esMovil()) {
      const zona = vh - Math.min(ah, vh * 0.46) - 28;
      const cabe = r.top >= 8 && r.bottom <= zona;
      if (cabe) return;
      deseado = r.height <= zona - 16 ? (zona - r.height) / 2 + 8 : 12;
    } else {
      const encaja = r.top >= 8 && r.bottom <= vh - 8 &&
        (vh - r.bottom >= ah + gap + 12 || r.top >= ah + gap + 12);
      if (encaja) return;
      const grupo = r.height + gap + ah;
      deseado = grupo <= vh - 32 ? (vh - grupo) / 2 : 72;
    }
    hace = r.top - deseado;
    if (Math.abs(hace) > 2) {
      window.scrollBy({ top: hace, left: 0, behavior: reducirMovimiento() ? "auto" : "smooth" });
    }
  }

  // ---------- Seguimiento del elemento (scroll, resize, reflow) ----------
  function seguirObjetivo(miToken, esperarAQuieto) {
    let anterior = "";
    let quieto = 0;
    let esperando = !!esperarAQuieto;
    const inicio = Date.now();

    function tick() {
      if (miToken !== token || !activo || !objetivoActual) return;
      const r = objetivoActual.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        // Se ha ocultado (p. ej. cambió de pestaña): se espera sin romper nada.
        requestAnimationFrame(tick);
        return;
      }
      const huella = [r.top, r.left, r.width, r.height, window.innerWidth, window.innerHeight].map(Math.round).join("|");
      if (huella !== anterior) {
        anterior = huella;
        quieto = 0;
        pintarSpotlight(r);
        if (!esperando) colocarTarjeta(r);
      } else {
        quieto++;
      }
      if (esperando && (quieto >= 5 || Date.now() - inicio > 1100)) {
        esperando = false;
        colocarTarjeta(r);
        elCard.classList.remove("tut-esperando");
        animarEntrada();
        enfocarPrimario();
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function ocultarSpotlight() {
    elSpotlight.classList.add("tut-sin-objetivo");
    elSpotlight.classList.remove("tut-anima");
    elSpotlight.style.top = "-9999px";
    elSpotlight.style.left = "-9999px";
    elSpotlight.style.width = "0px";
    elSpotlight.style.height = "0px";
  }

  function pintarSpotlight(r) {
    const m = 8;
    // Se recorta a la ventana para que, si el elemento es más grande
    // que la pantalla, el recuadro siga bien formado.
    const top = Math.max(r.top - m, -m);
    const left = Math.max(r.left - m, -m);
    const right = Math.min(r.right + m, window.innerWidth + m);
    const bottom = Math.min(r.bottom + m, window.innerHeight + m);
    elSpotlight.classList.remove("tut-sin-objetivo");
    elSpotlight.style.top = top + "px";
    elSpotlight.style.left = left + "px";
    elSpotlight.style.width = Math.max(right - left, 0) + "px";
    elSpotlight.style.height = Math.max(bottom - top, 0) + "px";
  }

  // ---------- Colocación de la tarjeta (y su flecha) ----------
  function colocarTarjeta(r) {
    if (esMovil()) {
      elCard.classList.add("tut-hoja");
      elCard.removeAttribute("data-lado");
      elCard.style.top = "";
      elCard.style.left = "";
      // Si el elemento está pegado abajo (p. ej. la barra fija de guardar)
      // la hoja taparía justo lo que se explica: pasa a ir arriba.
      const vhm = window.innerHeight;
      const ahm = Math.min(elCard.offsetHeight || 240, vhm * 0.46);
      const tapa = r.bottom > vhm - ahm - 16;
      const enLaParteBaja = r.top + r.height / 2 > vhm * 0.55;
      elCard.classList.toggle("tut-hoja-arriba", tapa && enLaParteBaja && r.top > ahm + 20);
      return;
    }
    elCard.classList.remove("tut-hoja-arriba");
    elCard.classList.remove("tut-hoja");
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const aw = elCard.offsetWidth || 372;
    const ah = elCard.offsetHeight || 220;
    const gap = 18;
    const m = 12;
    const abajoOk = vh - r.bottom >= ah + gap + m;
    const arribaOk = r.top >= ah + gap + m;
    const derOk = vw - r.right >= aw + gap + m;
    const izqOk = r.left >= aw + gap + m;

    let lado = pasoActual && pasoActual.lado;
    const forzadoOk = { abajo: abajoOk, arriba: arribaOk, der: derOk, izq: izqOk, centro: true };
    if (!lado || !forzadoOk[lado]) {
      lado = abajoOk ? "abajo" : arribaOk ? "arriba" : derOk ? "der" : izqOk ? "izq" : "centro";
    }

    let top;
    let left;
    const centroX = r.left + r.width / 2;
    const centroY = r.top + r.height / 2;

    if (lado === "abajo") {
      top = r.bottom + gap;
      left = centroX - aw / 2;
    } else if (lado === "arriba") {
      top = r.top - ah - gap;
      left = centroX - aw / 2;
    } else if (lado === "der") {
      left = r.right + gap;
      top = centroY - ah / 2;
    } else if (lado === "izq") {
      left = r.left - aw - gap;
      top = centroY - ah / 2;
    } else {
      // El elemento ocupa casi toda la pantalla: la tarjeta flota sobre
      // él, pegada abajo y centrada, y no lleva flecha.
      top = vh - ah - m - 8;
      left = (vw - aw) / 2;
    }

    left = Math.max(m, Math.min(left, vw - aw - m));
    top = Math.max(m, Math.min(top, vh - ah - m));

    if (lado === "abajo" || lado === "arriba") {
      elCard.style.setProperty("--tut-flecha", Math.max(22, Math.min(centroX - left, aw - 22)) + "px");
    } else if (lado === "der" || lado === "izq") {
      elCard.style.setProperty("--tut-flecha", Math.max(22, Math.min(centroY - top, ah - 22)) + "px");
    }
    elCard.setAttribute("data-lado", lado);
    elCard.style.top = Math.round(top) + "px";
    elCard.style.left = Math.round(left) + "px";
  }

  // ---------- Detalles de interacción ----------
  function animarEntrada() {
    if (reducirMovimiento()) return;
    elCard.classList.remove("tut-entra");
    void elCard.offsetWidth;
    elCard.classList.add("tut-entra");
  }

  function anunciar(texto) {
    if (elEstado) elEstado.textContent = texto;
  }

  function enfocarPrimario() {
    const btn = elCard.querySelector(".tut-btn-siguiente");
    if (btn) { try { btn.focus({ preventScroll: true }); } catch (e) { btn.focus(); } }
  }

  function enlazarBotones() {
    elCard.querySelectorAll("[data-tut]").forEach(function (b) {
      b.addEventListener("click", function () { accion(b.getAttribute("data-tut")); });
    });
  }

  function accion(nombre) {
    if (!activo) return;
    switch (nombre) {
      case "completo":
        pasos = construirPasos("completo");
        mostrarPaso(1, 1);
        break;
      case "esencial":
        pasos = construirPasos("esencial");
        mostrarPaso(1, 1);
        break;
      case "siguiente":
        if (indice >= pasos.length - 1) finalizar(); else mostrarPaso(indice + 1, 1);
        break;
      case "atras":
        if (indice > 0) mostrarPaso(indice - 1, -1);
        break;
      case "terminar":
        finalizar();
        break;
      case "saltar":
        saltar();
        break;
    }
  }

  // ---------- Fin del tutorial ----------
  function marcarComoVisto() {
    try { localStorage.setItem(clave(usuarioActual()), "1"); } catch (e) {}
  }

  function saltar() { marcarComoVisto(); cerrarUI(); }
  function finalizar() { marcarComoVisto(); cerrarUI(); }

  function cerrarUI() {
    activo = false;
    token++;
    limpiarTimers();
    if (pasoActual && pasoActual.alSalir) { try { pasoActual.alSalir(); } catch (e) {} }
    pasoActual = null;
    objetivoActual = null;
    ocultarSpotlight();
    elOverlay.classList.remove("tut-activo", "tut-centrado");
    elCentroWrap.classList.remove("tut-activo");
    elCard.style.display = "none";
    elCard.classList.remove("tut-card-centrada", "tut-hoja", "tut-hoja-arriba", "tut-esperando");
    anunciar("");
    restaurarDetalles();

    // Se devuelve a la persona a la pantalla donde estaba antes de
    // empezar (los pasos navegan por pestañas y pueden dejarla en una
    // pantalla a medio rellenar).
    if (tabAlIniciar) {
      const tab = tabAlIniciar;
      const sub = subtabAlIniciar;
      const botonTab = document.querySelector('.tabs button[data-tab="' + tab + '"]');
      if (botonTab && !botonTab.classList.contains("activo")) botonTab.click();
      setTimeout(function () {
        if (!sub) return;
        const panel = document.getElementById("panel-" + tab);
        const btn = panel && panel.querySelector('.subtabs button[data-subtab="' + sub + '"]');
        if (btn && !btn.classList.contains("activo")) btn.click();
      }, 160);
    }
    if (focoPrevio && document.contains(focoPrevio)) {
      try { focoPrevio.focus({ preventScroll: true }); } catch (e) {}
    }
    focoPrevio = null;
  }

  function iniciar(opciones) {
    if (activo) return;
    opciones = opciones || {};
    crearDOM();

    const menu = document.getElementById("cuentaMenu");
    if (menu) menu.classList.remove("abierto");

    pasos = construirPasos(opciones.modo === "esencial" ? "esencial" : "completo");
    if (!pasos.length) return;
    // Recuerda dónde estaba la persona para devolverla ahí al terminar.
    const tabActiva = document.querySelector(".tabs button.activo");
    tabAlIniciar = tabActiva ? tabActiva.dataset.tab : null;
    const panelActivo = tabAlIniciar ? document.getElementById("panel-" + tabAlIniciar) : null;
    const subtabActiva = panelActivo ? panelActivo.querySelector(".subtabs button.activo") : null;
    subtabAlIniciar = subtabActiva ? subtabActiva.dataset.subtab : null;

    focoPrevio = document.activeElement;
    indice = 0;
    pasoActual = null;
    activo = true;
    elOverlay.classList.add("tut-activo");
    // Con «esencial» ya elegido (p. ej. desde la API) se salta la bienvenida.
    mostrarPaso(opciones.modo === "esencial" || opciones.modo === "completo" ? 1 : 0, 1);
  }

  // ---------- Teclado ----------
  document.addEventListener("keydown", function (e) {
    if (!activo) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      saltar();
      return;
    }
    if (e.key === "ArrowRight" && indice > 0) {
      e.preventDefault();
      accion(indice >= pasos.length - 1 ? "terminar" : "siguiente");
      return;
    }
    if (e.key === "ArrowLeft" && indice > 0) {
      e.preventDefault();
      accion("atras");
      return;
    }
    if (e.key === "Tab") {
      // La tarjeta atrapa el foco mientras el tutorial está abierto.
      const focos = Array.prototype.filter.call(
        elCard.querySelectorAll("button"),
        function (b) { return !b.disabled && b.offsetParent !== null; }
      );
      if (!focos.length) { e.preventDefault(); return; }
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      const dentro = elCard.contains(document.activeElement);
      if (e.shiftKey && (!dentro || document.activeElement === primero)) {
        e.preventDefault(); ultimo.focus();
      } else if (!e.shiftKey && (!dentro || document.activeElement === ultimo)) {
        e.preventDefault(); primero.focus();
      }
    }
  }, true);

  // ---------- API pública ----------
  window.EOF_TUTORIAL = {
    iniciar: function (opciones) { iniciar(opciones); },
    estaActivo: function () { return activo; },
    yaVisto: function () {
      try { return !!localStorage.getItem(clave(usuarioActual())); } catch (e) { return false; }
    }
  };

  // ---------- Botones «Ver tutorial» (menú de cuenta y Preferencias) ----------
  // Se añaden por JS para que cualquier panel que cargue este archivo los
  // tenga, y quedan fuera de panel.html si algún día se renombran ids.
  function montarEnlaces() {
    const menu = document.getElementById("cuentaMenu");
    if (menu && !menu.querySelector("[data-tut-abrir]")) {
      const a = document.createElement("a");
      a.href = "javascript:void(0)";
      a.setAttribute("data-tut-abrir", "1");
      a.textContent = "Ver tutorial";
      a.addEventListener("click", function () {
        menu.classList.remove("abierto");
        iniciar();
      });
      const ver = menu.querySelector('a[href="/index.html"]');
      if (ver) menu.insertBefore(a, ver); else menu.appendChild(a);
    }
    const prefs = document.getElementById("subpanel-preferencias");
    const tarjeta = prefs && prefs.querySelector(".form-card");
    if (tarjeta && !tarjeta.querySelector(".tut-ajuste")) {
      const caja = document.createElement("div");
      caja.className = "tut-ajuste";
      caja.innerHTML =
        '<div class="tut-ajuste-texto"><strong>Tutorial del panel</strong>' +
        '<span>Repasa para qué sirve cada pestaña. Dura un par de minutos y puedes salir cuando quieras.</span></div>' +
        '<button type="button" class="btn-secundari" data-tut-abrir="1">Ver el tutorial</button>';
      caja.querySelector("button").addEventListener("click", function () { iniciar(); });
      tarjeta.appendChild(caja);
    }
  }

  // ---------- Arranque automático ----------
  function primeraVez() {
    try { return !localStorage.getItem(clave(usuarioActual())); } catch (e) { return false; }
  }

  function alCargar() {
    crearDOM();
    montarEnlaces();
    if (primeraVez()) {
      // Margen para que el resto del panel (avatar, pestañas según rol,
      // niveles) ya esté pintado antes de enseñarlo.
      setTimeout(function () { iniciar(); }, 600);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", alCargar);
  } else {
    alCargar();
  }
})();
