/* ============================================================
   Tutorial guiado para nuevos redactores.
   Se lanza automáticamente la primera vez que un usuario entra al
   panel (se guarda en localStorage, por usuario, que ya lo vio) y
   se puede saltar en cualquier momento o volver a abrir desde el
   botón flotante "Ver tutorial" / desde el menú de cuenta.
   Depende de que ya exista USER (definido en admin.js) y de las
   pestañas/subpestañas reales del panel (data-tab / data-subtab).
   ============================================================ */

(function () {
  // Se resuelve en el momento de usarse (no al cargar el script), para
  // no depender de en qué orden exacto se han evaluado admin.js y este
  // archivo, ni de si USER tardó un instante en poblarse.
  function usuarioActual() {
    try {
      if (typeof USER !== "undefined" && USER) return USER;
    } catch {}
    try { return JSON.parse(localStorage.getItem("eof_user") || "null"); } catch { return null; }
  }

  const usuarioInicial = usuarioActual();
  if (!usuarioInicial) return;

  function clave(user) {
    return `eof_tutorial_visto_${(user && (user.username || user.id)) || "anon"}`;
  }

  // ---------- Definición de los pasos ----------
  // Cada paso puede:
  //  - centrado:true  -> tarjeta centrada en pantalla, sin resaltar nada
  //    (bienvenida y despedida).
  //  - selector -> qué elemento resaltar.
  //  - tab / subtab -> a qué pestaña/subpestaña cambiar antes de mostrar
  //    el paso, para que el elemento a resaltar esté visible.
  //  - soloAdmin -> el paso solo se incluye si USER.rol === "admin".
  function construirPasos() {
    const user = usuarioActual() || {};
    const esAdmin = user.rol === "admin";
    const pasos = [
      {
        centrado: true,
        emoji: "👋",
        titulo: `¡Bienvenido/a, ${(user.nombre || "").split(" ")[0] || "redactor"}!`,
        texto: "Esto es la Redacción de ELOTROFÚTBOLTV: desde aquí publicas noticias, cargas resultados y gestionas el contenido de la web. Te enseñamos lo básico en un minuto — puedes saltarlo cuando quieras."
      },
      {
        tab: "noticias", subtab: "nueva",
        selector: "#titulo",
        titulo: "Crear una noticia",
        texto: "Aquí empiezas: escribe el titular. Debajo irán el subtítulo, la categoría, las fotos y el cuerpo de la noticia."
      },
      {
        tab: "noticias", subtab: "nueva",
        selector: "#contenidoEditor",
        titulo: "El cuerpo de la noticia",
        texto: "Este es el editor de texto. Selecciona texto para ponerlo en negrita, cursiva, añadir enlaces... La barra de arriba tiene todas las opciones."
      },
      {
        tab: "noticias", subtab: "nueva",
        selector: "label[for=\"publicado\"]",
        titulo: "Publicar o guardar como borrador",
        texto: "Desmarca esta casilla si quieres guardar la noticia como borrador en vez de publicarla directamente. Así puedes terminarla más tarde o que la revise un compañero."
      },
      {
        tab: "noticias", subtab: "nueva",
        selector: "#btnGuardar",
        titulo: "Guardar",
        texto: "Cuando esté lista, pulsa aquí. El botón cambia de texto según si vas a publicar o guardar un borrador."
      },
      {
        tab: "noticias", subtab: "lista",
        selector: "#tablaArticulos",
        titulo: "Ver y editar noticias",
        texto: "Aquí tienes el listado de todas las noticias: las tuyas y, si tienes permiso, las de otros redactores. Puedes filtrarlas, editarlas o eliminarlas."
      },
      {
        tab: "resultados", subtab: "resultado",
        selector: ".tabs button[data-tab='resultados']",
        titulo: "Resultados de partidos",
        texto: "En la pestaña \"Resultados\" cargas marcadores, alineaciones y fichas técnicas de los partidos. Se pueden vincular a una noticia para que se sincronicen solos."
      },
      {
        tab: "contenido",
        selector: "#subtabsContenido",
        titulo: "Fotos y vídeos",
        texto: "Desde \"Contenido\" puedes subir fotos y vídeos que luego usarás en tus noticias, sin tener que hacerlo desde el propio editor."
      },
      {
        tab: "solicitudes",
        selector: "#subtabsSolicitudes",
        titulo: "Solicitudes",
        texto: "Aquí verás peticiones pendientes que te afectan (por ejemplo, revisiones de contenido). El número en la pestaña indica cuántas tienes sin mirar."
      },
      {
        centrado: true, soloAdmin: true,
        emoji: "🛠️",
        titulo: "Como administrador...",
        texto: "Tienes acceso extra a \"Usuarios\" (gestionar redactores y permisos) y a \"Funcionalidades\" (comentarios, encuestas, newsletter y más). Lo iremos viendo con calma."
      },
      {
        selector: "#cuentaBtn",
        titulo: "Tu cuenta",
        texto: "Desde aquí cambias tu contraseña, tu foto de perfil y ves \"Mi progreso\"."
      },
      {
        selector: "#themeToggle",
        titulo: "Modo oscuro",
        texto: "Y si prefieres trabajar con la pantalla en oscuro de noche, este botón cambia el tema al instante."
      },
      {
        centrado: true,
        emoji: "🎉",
        titulo: "¡Listo para empezar!",
        texto: "Eso es todo lo esencial. ¡Mucho ánimo con tu primera noticia!"
      }
    ];
    return pasos.filter((p) => !p.soloAdmin || esAdmin);
  }

  let pasos = [];
  let indice = 0;
  let elOverlay, elSpotlight, elCard, elCentroWrap;
  let reintentoObjetivo = null;
  let reintentoEsFrame = false;
  let objetivoActual = null;
  let datosPasoActual = null; // { paso, i, progresoPct, esUltimo, esPrimero }

  function cancelarReintento() {
    if (reintentoEsFrame) cancelAnimationFrame(reintentoObjetivo);
    else clearTimeout(reintentoObjetivo);
    reintentoObjetivo = null;
  }

  // ---------- Construcción del DOM del tutorial (una sola vez) ----------
  function crearDOM() {
    if (document.getElementById("tutOverlay")) return;

    elOverlay = document.createElement("div");
    elOverlay.id = "tutOverlay";
    elOverlay.innerHTML = `<div id="tutSpotlight" class="tut-sin-objetivo"></div>`;
    document.body.appendChild(elOverlay);

    elSpotlight = document.getElementById("tutSpotlight");

    elCentroWrap = document.createElement("div");
    elCentroWrap.id = "tutCentroWrap";
    document.body.appendChild(elCentroWrap);

    elCard = document.createElement("div");
    elCard.id = "tutCard";
    elCard.style.display = "none";
    document.body.appendChild(elCard);
  }

  // ---------- Utilidades de navegación del propio panel ----------
  function irATab(tabId) {
    if (!tabId) return;
    const btn = document.querySelector(`.tabs button[data-tab="${tabId}"]`);
    if (btn && !btn.classList.contains("activo")) btn.click();
  }

  function irASubtab(subtabId) {
    if (!subtabId) return;
    // Solo dentro del panel activo, por si dos pestañas comparten
    // el mismo nombre de subtab.
    const panelActivo = document.querySelector(".panel.activo");
    const contenedor = panelActivo || document;
    const btn = contenedor.querySelector(`.subtabs button[data-subtab="${subtabId}"]`);
    if (btn && !btn.classList.contains("activo")) btn.click();
  }

  // ---------- Pintado de un paso ----------
  function mostrarPaso(i) {
    cancelarReintento();
    const paso = pasos[i];
    if (!paso) { finalizar(); return; }

    if (paso.tab) irATab(paso.tab);
    if (paso.subtab) irASubtab(paso.subtab);

    // Da tiempo a que el cambio de tab pinte el DOM (algunos paneles
    // generan contenido dinámicamente al activarse) antes de buscar el
    // elemento a resaltar y posicionar la tarjeta.
    reintentoEsFrame = false;
    reintentoObjetivo = setTimeout(() => pintarPaso(paso, i), paso.tab || paso.subtab ? 160 : 0);
  }

  function pintarPaso(paso, i) {
    const progresoPct = Math.round(((i + 1) / pasos.length) * 100);
    const esUltimo = i === pasos.length - 1;
    const esPrimero = i === 0;

    if (paso.centrado) {
      // Deja de seguir cualquier elemento del paso anterior.
      objetivoActual = null;
      datosPasoActual = null;

      // La tarjeta pasa a vivir dentro de #tutCentroWrap, que la centra
      // con flexbox: así no hace falta calcular top/left/transform a
      // mano (eso era lo que a veces dejaba la tarjeta pegada arriba
      // un instante, o mal calculada según el tamaño del contenido).
      elCard.removeAttribute("style");
      elCard.classList.add("tut-card-centrada");
      elCentroWrap.appendChild(elCard);
      elCentroWrap.classList.add("tut-activo");
      elCard.style.display = "block";

      elSpotlight.classList.add("tut-sin-objetivo");
      elSpotlight.style.width = "0px";
      elSpotlight.style.height = "0px";
      elSpotlight.style.top = "-9999px";
      elSpotlight.style.left = "-9999px";

      elCard.innerHTML = `
        <button type="button" class="tut-cerrar-x" aria-label="Cerrar tutorial">✕</button>
        <span class="tut-emoji">${paso.emoji || "✨"}</span>
        <h3 class="tut-titulo">${paso.titulo}</h3>
        <p class="tut-texto">${paso.texto}</p>
        <div class="tut-botones">
          <button type="button" class="tut-btn-siguiente">${esUltimo ? "Empezar a trabajar" : (esPrimero ? "Vamos allá →" : "Siguiente →")}</button>
          ${!esUltimo ? '<button type="button" class="tut-btn-saltar">Saltar tutorial</button>' : ""}
        </div>`;
    } else {
      // Para los pasos con elemento resaltado, la tarjeta vuelve a
      // vivir directamente en <body> con position:fixed (ver
      // posicionarSpotlightYCard), y el wrap de centrado se oculta.
      elCentroWrap.classList.remove("tut-activo");
      elCard.classList.remove("tut-card-centrada");
      elCard.removeAttribute("style");
      document.body.appendChild(elCard);
      elCard.style.display = "block";
      const objetivo = document.querySelector(paso.selector);
      if (!objetivo) {
        // El elemento no está (p. ej. oculto para este rol, o aún no
        // ha pintado): se salta este paso sin bloquear al usuario.
        avanzar(i, 1);
        return;
      }
      posicionarConScroll(objetivo, paso, i, progresoPct, esUltimo, esPrimero);
      return;
    }

    enlazarBotonesPaso(i, esUltimo);
  }

  // Centra el elemento en pantalla y, en vez de fiarse de un tiempo
  // fijo para saber cuándo ha terminado el scroll suave (que variaba
  // según lo lejos que estuviera el elemento y dejaba el recuadro
  // desalineado en distancias largas, p. ej. pasar del titular al
  // cuerpo de la noticia), sigue la posición real del elemento con
  // requestAnimationFrame hasta que varias medidas seguidas coinciden.
  function posicionarConScroll(objetivo, paso, i, progresoPct, esUltimo, esPrimero) {
    pintarContenidoCard(paso, i, progresoPct, esUltimo, esPrimero);
    objetivo.scrollIntoView({ behavior: "smooth", block: "center" });

    let anterior = null;
    let quietoDesde = 0;
    const idPaso = i;

    function tick() {
      // Si mientras tanto se cambió de paso (clic rápido en Siguiente),
      // se aborta este seguimiento para no pisar el paso nuevo.
      if (idPaso !== indice) return;
      const r = objetivo.getBoundingClientRect();
      // Elemento aún sin tamaño real (oculto, o el panel todavía no ha
      // terminado de pintar tras el cambio de pestaña): se reintenta
      // en el siguiente frame en vez de dibujar un spotlight vacío.
      if (r.width === 0 && r.height === 0) {
        reintentoEsFrame = true;
        reintentoObjetivo = requestAnimationFrame(tick);
        return;
      }
      const actual = `${r.top}|${r.left}|${r.width}|${r.height}`;
      if (actual === anterior) {
        quietoDesde++;
      } else {
        quietoDesde = 0;
        anterior = actual;
      }
      posicionarSpotlightYCard(objetivo, r);
      // Un puñado de frames idénticos seguidos = el scroll suave ya ha
      // terminado; se deja de recalcular en bucle (el listener de
      // scroll de más abajo sigue vigilando por si el usuario mueve la
      // rueda del ratón después).
      if (quietoDesde < 6) {
        reintentoEsFrame = true;
        reintentoObjetivo = requestAnimationFrame(tick);
      }
    }
    reintentoEsFrame = true;
    reintentoObjetivo = requestAnimationFrame(tick);
  }

  // Construye el contenido de la tarjeta (título, texto, botones) para
  // el paso actual. Se llama una sola vez por paso, no en cada frame.
  function pintarContenidoCard(paso, i, progresoPct, esUltimo, esPrimero) {
    datosPasoActual = { paso, i, progresoPct, esUltimo, esPrimero };
    elCard.innerHTML = `
      <button type="button" class="tut-cerrar-x" aria-label="Cerrar tutorial">✕</button>
      <p class="tut-paso-contador">Paso ${i + 1} de ${pasos.length}</p>
      <h3 class="tut-titulo">${paso.titulo}</h3>
      <p class="tut-texto">${paso.texto}</p>
      <div class="tut-barra-progreso"><div class="tut-barra-progreso-relleno" style="width:${progresoPct}%"></div></div>
      <div class="tut-botones">
        <button type="button" class="tut-btn-anterior" ${esPrimero ? "disabled" : ""}>← Atrás</button>
        <div class="tut-botones-derecha">
          <button type="button" class="tut-btn-saltar">Saltar</button>
          <button type="button" class="tut-btn-siguiente">${esUltimo ? "Terminar" : "Siguiente →"}</button>
        </div>
      </div>`;
    enlazarBotonesPaso(i, esUltimo);
  }

  // Mueve el spotlight y la tarjeta a la posición del elemento dado.
  // Ligero a propósito: se llama en cada frame mientras se sigue el
  // scroll y también desde el listener de scroll manual, así que no
  // debe reconstruir HTML ni volver a enlazar botones.
  function posicionarSpotlightYCard(objetivo, rectPrevio) {
    objetivoActual = objetivo;
    const r = rectPrevio || objetivo.getBoundingClientRect();
    const margen = 8;

    // Si el elemento a resaltar es más grande que la pantalla (o casi),
    // el "agujero" se sale del viewport y se ve como si el spotlight
    // estuviera roto (sobre todo en móvil). Se recorta a la ventana
    // visible para que el recuadro siempre quede bien formado.
    const spotTop = Math.max(r.top - margen, -margen);
    const spotLeft = Math.max(r.left - margen, -margen);
    const spotRight = Math.min(r.right + margen, window.innerWidth + margen);
    const spotBottom = Math.min(r.bottom + margen, window.innerHeight + margen);

    elSpotlight.classList.remove("tut-sin-objetivo");
    elSpotlight.style.top = `${spotTop}px`;
    elSpotlight.style.left = `${spotLeft}px`;
    elSpotlight.style.width = `${Math.max(spotRight - spotLeft, 0)}px`;
    elSpotlight.style.height = `${Math.max(spotBottom - spotTop, 0)}px`;

    // Posiciona la tarjeta cerca del elemento, con margen para no
    // salirse de la pantalla ni tapar el propio elemento resaltado.
    const cardAncho = elCard.offsetWidth || 340;
    const cardAlto = elCard.offsetHeight || 180;
    const espacio = 18;
    let top, left;

    const hayEspacioAbajo = window.innerHeight - r.bottom > cardAlto + espacio + 20;
    const hayEspacioArriba = r.top > cardAlto + espacio + 20;

    if (hayEspacioAbajo) {
      top = r.bottom + espacio;
    } else if (hayEspacioArriba) {
      top = r.top - cardAlto - espacio;
    } else {
      top = Math.max(16, (window.innerHeight - cardAlto) / 2);
    }

    left = r.left + r.width / 2 - cardAncho / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - cardAncho - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - cardAlto - 16));

    elCard.style.top = `${top}px`;
    elCard.style.left = `${left}px`;
  }

  function enlazarBotonesPaso(i, esUltimo) {
    elCard.querySelector(".tut-cerrar-x")?.addEventListener("click", saltar);
    elCard.querySelector(".tut-btn-saltar")?.addEventListener("click", saltar);
    elCard.querySelector(".tut-btn-anterior")?.addEventListener("click", () => avanzar(i, -1));
    elCard.querySelector(".tut-btn-siguiente")?.addEventListener("click", () => {
      if (esUltimo) finalizar();
      else avanzar(i, 1);
    });
  }

  function avanzar(desde, delta) {
    const siguiente = desde + delta;
    if (siguiente < 0) return;
    if (siguiente >= pasos.length) { finalizar(); return; }
    indice = siguiente;
    mostrarPaso(indice);
  }

  // ---------- Ciclo de vida ----------
  function marcarComoVisto() {
    try { localStorage.setItem(clave(usuarioActual()), "1"); } catch {}
  }

  function saltar() {
    marcarComoVisto();
    cerrarUI();
  }

  function finalizar() {
    marcarComoVisto();
    cerrarUI();
  }

  function cerrarUI() {
    cancelarReintento();
    elOverlay.classList.remove("tut-activo");
    elCentroWrap.classList.remove("tut-activo");
    elCard.style.display = "none";
  }

  function iniciar(forzado) {
    crearDOM();
    pasos = construirPasos();
    indice = 0;
    elOverlay.classList.add("tut-activo");
    mostrarPaso(0);
  }

  // Cierra el tutorial si se pulsa Escape, sin perder el progreso ya
  // completado por quien lo esté viendo (se marca como visto igual).
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elOverlay && elOverlay.classList.contains("tut-activo")) {
      saltar();
    }
  });

  // Si el redactor mueve la rueda del ratón (o hace scroll con el
  // teclado/touch) mientras un paso está mostrado, el spotlight y la
  // tarjeta se mantienen pegados al elemento real en vez de quedarse
  // "flotando" en su posición antigua.
  let scrollFramePendiente = false;
  window.addEventListener("scroll", () => {
    if (!objetivoActual || scrollFramePendiente) return;
    if (!elOverlay || !elOverlay.classList.contains("tut-activo")) return;
    scrollFramePendiente = true;
    requestAnimationFrame(() => {
      scrollFramePendiente = false;
      if (objetivoActual) posicionarSpotlightYCard(objetivoActual);
    });
  }, { passive: true, capture: true });

  // Recalcula la posición si la ventana cambia de tamaño mientras el
  // tutorial está abierto con un paso no centrado.
  window.addEventListener("resize", () => {
    if (elOverlay && elOverlay.classList.contains("tut-activo") && objetivoActual) {
      posicionarSpotlightYCard(objetivoActual);
    }
  });

  // Expuesto globalmente por si se quiere enlazar desde otro sitio del
  // panel (p. ej. un enlace "Ver tutorial" en el menú de cuenta).
  window.EOF_TUTORIAL = { iniciar: () => iniciar(true) };

  // ---------- Arranque automático ----------
  function primeraVez() {
    try { return !localStorage.getItem(clave(usuarioActual())); } catch { return false; }
  }

  document.addEventListener("DOMContentLoaded", () => {
    crearDOM();
    if (primeraVez()) {
      // Pequeño margen para que el resto del panel (avatar, nombre,
      // pestañas visibles según el rol) ya esté pintado.
      setTimeout(() => iniciar(false), 400);
    }
  });
})();
