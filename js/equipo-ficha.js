/* Ficha de equipo (categoria.html?club=…): cabecera tipo "hero" y barra de
   botones por sección (Resultados, Próximos, Plantilla, Noticias, Comparar).
   No cambia ningún id ni función existente: solo reorganiza nodos ya
   pintados y añade la navegación. Lo llama cargaCategoria() con montarFichaEquipo(). */
(function () {
  "use strict";

  const ICONOS = {
    resultados: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    proximos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>',
    plantilla: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.5a3 3 0 0 1 0 5.8M21 20c0-2.6-1.6-4.8-4-5.6"/></svg>',
    noticias: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h13v14H6a2 2 0 0 1-2-2V5z"/><path d="M17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5"/></svg>',
    comparar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5M4 4l7 7m2 2l7 7"/></svg>',
  };

  function reducirMovimiento() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function visible(el) {
    return !!el && el.getClientRects().length > 0 && !el.hidden;
  }

  window.montarFichaEquipo = function montarFichaEquipo(club) {
    if (document.getElementById("clubHero")) return;
    const main = document.querySelector("main");
    const cabecera = document.getElementById("cabeceraClub");
    const titulo = document.getElementById("tituloCategoria");
    const subtitulo = document.getElementById("subtituloCategoria");
    const info = document.getElementById("infoClub");
    const partidos = document.getElementById("partidosClub");
    const plantilla = document.getElementById("plantillaEquipo");
    const grid = document.getElementById("grid");
    const btnComparar = document.getElementById("btnAbrirComparador");
    if (!main || !cabecera || !titulo || !grid) return;

    document.body.classList.add("ficha-club");

    // ---------- Hero ----------
    const hero = document.createElement("section");
    hero.id = "clubHero";
    hero.className = "club-hero";
    hero.setAttribute("aria-label", "Ficha de " + club);
    main.insertBefore(hero, cabecera);

    const kicker = document.createElement("p");
    kicker.className = "club-hero-kicker";
    kicker.textContent = "Ficha del equipo";

    const texto = document.createElement("div");
    texto.className = "club-hero-texto";
    texto.appendChild(kicker);
    texto.appendChild(titulo);
    if (subtitulo) texto.appendChild(subtitulo);

    const acciones = document.createElement("div");
    acciones.className = "club-hero-acciones";
    if (btnComparar) acciones.appendChild(btnComparar);
    texto.appendChild(acciones);

    hero.appendChild(cabecera);
    hero.appendChild(texto);
    if (info) hero.appendChild(info);

    // ---------- Títulos y anclas de cada sección ----------
    const colRes = document.getElementById("ultimosResultadosClub");
    const colPro = document.getElementById("proximosPartidosClub");
    const secRes = colRes && colRes.closest(".partidos-club-col");
    const secPro = colPro && colPro.closest(".partidos-club-col");
    if (secRes) { secRes.id = "club-resultados"; secRes.tabIndex = -1; }
    if (secPro) { secPro.id = "club-proximos"; secPro.tabIndex = -1; }
    if (plantilla) plantilla.tabIndex = -1;

    const tituloNoticias = document.createElement("h2");
    tituloNoticias.id = "club-noticias";
    tituloNoticias.className = "club-seccion-titulo";
    tituloNoticias.tabIndex = -1;
    tituloNoticias.textContent = "Noticias del equipo";
    grid.parentNode.insertBefore(tituloNoticias, grid);

    // ---------- Barra de botones ----------
    const defs = [
      { id: "club-resultados", etiqueta: "Resultados", icono: "resultados" },
      { id: "club-proximos", etiqueta: "Próximos", icono: "proximos" },
      { id: "plantillaEquipo", etiqueta: "Plantilla", icono: "plantilla" },
      { id: "club-noticias", etiqueta: "Noticias", icono: "noticias" },
    ];
    const nav = document.createElement("nav");
    nav.className = "club-nav";
    nav.setAttribute("aria-label", "Secciones de " + club);
    const lista = document.createElement("div");
    lista.className = "club-nav-lista";
    lista.setAttribute("role", "toolbar");
    lista.setAttribute("aria-label", "Ir a una sección");
    const indicador = document.createElement("span");
    indicador.className = "club-nav-indicador";
    indicador.setAttribute("aria-hidden", "true");
    lista.appendChild(indicador);
    nav.appendChild(lista);

    const botones = defs.map((d) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "club-nav-btn";
      b.dataset.destino = d.id;
      b.innerHTML = ICONOS[d.icono] + "<span>" + d.etiqueta + '</span><small class="club-nav-n" hidden></small>';
      b.addEventListener("click", () => { elegido = b; marcarActivo(b, true); irASeccion(d.id); });
      lista.appendChild(b);
      return b;
    });

    if (btnComparar) {
      const bc = document.createElement("button");
      bc.type = "button";
      bc.className = "club-nav-btn club-nav-btn--accion";
      bc.innerHTML = ICONOS.comparar + "<span>Comparar</span>";
      bc.addEventListener("click", () => btnComparar.click());
      lista.appendChild(bc);
    }
    hero.insertAdjacentElement("afterend", nav);

    // Altura de la cabecera fija del sitio: la barra se pega justo debajo.
    function ajustarTop() {
      const cab = document.querySelector(".main-header");
      // Solo cuenta si la cabecera se queda pegada arriba (en el modo app móvil no lo está).
      const fija = cab && ["sticky", "fixed"].includes(getComputedStyle(cab).position) && getComputedStyle(cab).display !== "none";
      // En el modo app móvil la cabecera se esconde al bajar: se usa su borde inferior real.
      const h = fija ? Math.max(0, Math.round(cab.getBoundingClientRect().bottom)) : 0;
      document.documentElement.style.setProperty("--club-nav-top", h + "px");
    }
    ajustarTop();
    window.addEventListener("resize", ajustarTop);

    function irASeccion(id) {
      const el = document.getElementById(id);
      if (!el) return;
      // La cabecera del sitio se esconde al bajar y reaparece al subir: si se va hacia
      // arriba hay que dejar sitio también para ella.
      const cab = document.querySelector(".main-header");
      const cabFija = cab && ["sticky", "fixed"].includes(getComputedStyle(cab).position);
      const subiendo = el.getBoundingClientRect().top < nav.getBoundingClientRect().bottom;
      document.documentElement.style.setProperty("--club-ancla", (cabFija && subiendo ? Math.round(cab.getBoundingClientRect().height) : 0) + "px");
      bloqueado = true;
      finBloqueo = Date.now() + 900;
      programarLiberacion();
      el.scrollIntoView({ behavior: reducirMovimiento() ? "auto" : "smooth", block: "start" });
      try { el.focus({ preventScroll: true }); } catch (e) { /* sin foco */ }
      if (history.replaceState) history.replaceState(null, "", location.pathname + location.search + "#" + id);
    }

    // Solo se muestran los botones de secciones que existen ahora mismo
    // (la plantilla y los partidos aparecen cuando llegan sus datos).
    function actualizarVisibles() {
      botones.forEach((b) => {
        const el = document.getElementById(b.dataset.destino);
        b.hidden = !visible(el);
      });
    }

    // ---------- Botón activo ----------
    // Al pulsar un botón pasa a activo AL MOMENTO y el scroll-spy se pausa
    // hasta que termine el desplazamiento; si no, el botón "rebotaba" por
    // los que se cruzan por el camino. Al llegar al final de la página se
    // activa el último botón (las secciones cortas nunca llegan arriba).
    let activoActual = null;
    let elegido = null;
    let bloqueado = false;
    let finBloqueo = 0;

    function moverIndicador(b) {
      if (!b || b.hidden) { indicador.style.opacity = "0"; return; }
      indicador.style.opacity = "1";
      indicador.style.width = b.offsetWidth + "px";
      indicador.style.transform = "translateX(" + b.offsetLeft + "px)";
    }

    function marcarActivo(b, centrar) {
      if (b === activoActual) { if (centrar) moverIndicador(b); return; }
      activoActual = b;
      botones.forEach((x) => {
        const on = x === b;
        x.classList.toggle("activo", on);
        if (on) x.setAttribute("aria-current", "true"); else x.removeAttribute("aria-current");
      });
      moverIndicador(b);
      if (b && lista.scrollWidth > lista.clientWidth) {
        const izq = b.offsetLeft - (lista.clientWidth - b.offsetWidth) / 2;
        lista.scrollTo({ left: Math.max(0, izq), behavior: reducirMovimiento() ? "auto" : "smooth" });
      }
    }

    // El bloqueo se libera solo, 180 ms después de que pare el scroll.
    let temporizadorBloqueo = 0;
    function programarLiberacion() {
      clearTimeout(temporizadorBloqueo);
      temporizadorBloqueo = setTimeout(() => {
        if (Date.now() < finBloqueo) { programarLiberacion(); return; }
        bloqueado = false;
        refrescar();
      }, Math.max(60, finBloqueo - Date.now()));
    }

    function actualizarActivo() {
      if (bloqueado) return;
      const visibles = botones.filter((b) => !b.hidden);
      if (!visibles.length) { marcarActivo(null); return; }
      const alFinal = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (alFinal && window.scrollY > 200) { marcarActivo(visibles[visibles.length - 1]); return; }
      const corte = nav.getBoundingClientRect().bottom + 100;
      let activo = null;
      let topActivo = -Infinity;
      visibles.forEach((b) => {
        const el = document.getElementById(b.dataset.destino);
        if (!el) return;
        const t = el.getBoundingClientRect().top;
        // Si dos secciones están a la misma altura (columnas en escritorio) gana la primera.
        if (t <= corte && t > topActivo + 8) { activo = b; topActivo = t; }
      });
      // Resultados y Próximos están a la misma altura en escritorio: si el lector acaba de
      // pulsar uno de ellos, ese se mantiene mientras siga a la altura del ganador.
      if (elegido && !elegido.hidden) {
        const elE = document.getElementById(elegido.dataset.destino);
        if (elE && Math.abs(elE.getBoundingClientRect().top - topActivo) <= 8) activo = elegido;
        else elegido = null;
      }
      marcarActivo(activo);
    }

    // Contadores pequeños en cada botón (partidos, noticias).
    function actualizarContadores() {
      const cuentas = {
        "club-resultados": secRes ? secRes.querySelectorAll("[data-estado]").length : 0,
        "club-proximos": secPro ? secPro.querySelectorAll("[data-estado]").length : 0,
        "club-noticias": grid.querySelectorAll(".card[data-art-id]").length,
      };
      botones.forEach((b) => {
        const n = cuentas[b.dataset.destino];
        const chip = b.querySelector(".club-nav-n");
        if (!chip) return;
        if (n > 0) { chip.textContent = n > 99 ? "99+" : String(n); chip.hidden = false; }
        else chip.hidden = true;
      });
    }

    // Flechas izquierda/derecha, Inicio y Fin entre botones (patrón de barra de herramientas).
    lista.addEventListener("keydown", (e) => {
      const teclas = ["ArrowLeft", "ArrowRight", "Home", "End"];
      if (!teclas.includes(e.key)) return;
      const bs = [...lista.querySelectorAll(".club-nav-btn")].filter((b) => !b.hidden);
      const i = bs.indexOf(document.activeElement);
      if (i < 0) return;
      let j = i;
      if (e.key === "ArrowRight") j = (i + 1) % bs.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + bs.length) % bs.length;
      else if (e.key === "Home") j = 0;
      else j = bs.length - 1;
      e.preventDefault();
      bs[j].focus();
    });

    let pendiente = false;
    function refrescar() {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        ajustarTop();
        actualizarVisibles();
        actualizarContadores();
        actualizarActivo();
        moverIndicador(activoActual);
      });
    }
    new MutationObserver(refrescar).observe(main, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "style"],
    });
    window.addEventListener("scroll", () => {
      if (bloqueado) { finBloqueo = Math.max(finBloqueo, Date.now() + 180); programarLiberacion(); }
      refrescar();
    }, { passive: true });
    window.addEventListener("resize", refrescar);
    refrescar();

    // Enlace directo con #seccion
    const ancla = (location.hash || "").slice(1);
    if (ancla && defs.some((d) => d.id === ancla)) {
      setTimeout(() => irASeccion(ancla), 900);
    }
  };
})();
