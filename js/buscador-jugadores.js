// Buscador de jugadores y clubes con autocompletado (estadísticas, Fase 3).
// Datos de GET /api/stats/buscar. Se monta en cualquier página que tenga
// config.js, clubs.js y layout.js cargados (ver estadisticas.html, jugador.html,
// plantilla.html):
//
//   iniciarBuscadorJugadores({
//     contenedor: document.getElementById("buscadorJugadores"),
//     competicion: () => "segunda_federacion",   // función: la página puede cambiar de competición
//     temporada: () => "",                       // "" (en curso) o "todas"
//   });
//
// Accesible como "combobox" de lista: flechas, Inicio/Fin, Enter, Escape y lector
// de pantalla (aria-activedescendant + aviso del número de resultados).
//
// Ámbito de la búsqueda: un selector de dos opciones («esta competición» /
// «Todas») sustituye al antiguo checkbox suelto. El checkbox oculto
// .buscador-jug-todas-check sigue siendo la fuente de verdad (y lo que leen los
// tests); el selector y la línea «Buscando en…» solo lo reflejan.
//
// La página puede avisar de que ha cambiado de competición o de temporada con
// el método devuelto, actualizar(): se repinta el ámbito y, si hay resultados
// abiertos, se repite la búsqueda; si no, se descartan los resultados viejos.
(function () {
  const COMPETICIONES = {
    hypermotion: "LaLiga Hypermotion",
    primera_federacion: "Primera Federación",
    segunda_federacion: "Segunda Federación",
  };
  const CORTOS = {
    hypermotion: "Hypermotion",
    primera_federacion: "1ª Federación",
    segunda_federacion: "2ª Federación",
  };
  const ICONO_LIGA = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>`;
  const ICONO_GLOBO = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 4 5.7 4 9s-1.4 6.4-4 9c-2.6-2.6-4-5.7-4-9s1.4-6.4 4-9Z"/></svg>`;
  const MIN_LETRAS = 2;
  const ESPERA_MS = 250;
  let contadorInstancias = 0;

  function iniciarBuscadorJugadores(opciones) {
    const cont = opciones && opciones.contenedor;
    if (!cont) return null;
    const idBase = "buscadorJug" + (++contadorInstancias);
    const compActual = typeof opciones.competicion === "function" ? opciones.competicion : () => "";
    const tempActual = typeof opciones.temporada === "function" ? opciones.temporada : () => "";

    cont.classList.add("buscador-jug");
    cont.innerHTML = `
      <label class="buscador-jug-etiqueta" for="${idBase}-entrada">Buscar jugador o club</label>
      <div class="buscador-jug-fila">
        <div class="buscador-jug-caja">
          <input id="${idBase}-entrada" class="buscador-jug-entrada" type="search" role="combobox"
                 aria-expanded="false" aria-controls="${idBase}-lista" aria-autocomplete="list" aria-haspopup="listbox"
                 autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="60"
                 placeholder="Escribe un nombre, un apellido o un club…">
          <ul id="${idBase}-lista" class="buscador-jug-lista" role="listbox" aria-label="Resultados de la búsqueda" hidden></ul>
        </div>
        <div class="buscador-jug-ambito" role="radiogroup" aria-label="Dónde buscar" data-valor="aqui">
          <button type="button" class="buscador-jug-ambito-aqui" role="radio" aria-checked="true">${ICONO_LIGA}<span class="buscador-jug-ambito-nombre"></span></button>
          <button type="button" class="buscador-jug-ambito-todas" role="radio" aria-checked="false" tabindex="-1" aria-label="Todas las competiciones" title="Todas las competiciones">${ICONO_GLOBO}<span>Todas</span></button>
        </div>
        <input type="checkbox" class="buscador-jug-todas-check" hidden tabindex="-1" aria-hidden="true">
      </div>
      <p class="buscador-jug-contexto"></p>
      <p class="buscador-jug-sr" role="status" aria-live="polite"></p>`;

    const entrada = cont.querySelector(".buscador-jug-entrada");
    const lista = cont.querySelector(".buscador-jug-lista");
    const check = cont.querySelector(".buscador-jug-todas-check");
    const aviso = cont.querySelector(".buscador-jug-sr");
    const ambito = cont.querySelector(".buscador-jug-ambito");
    const btnAqui = cont.querySelector(".buscador-jug-ambito-aqui");
    const btnTodas = cont.querySelector(".buscador-jug-ambito-todas");
    const nombreAqui = cont.querySelector(".buscador-jug-ambito-nombre");
    const contexto = cont.querySelector(".buscador-jug-contexto");

    let temporizador = null;
    let peticion = 0;
    let activo = -1;
    let opcionesDOM = [];

    function cerrar() {
      lista.hidden = true;
      entrada.setAttribute("aria-expanded", "false");
      entrada.removeAttribute("aria-activedescendant");
      activo = -1;
    }
    function abrir() {
      lista.hidden = false;
      entrada.setAttribute("aria-expanded", "true");
    }
    function marcarActivo(i) {
      opcionesDOM.forEach((li, k) => li.setAttribute("aria-selected", k === i ? "true" : "false"));
      activo = i;
      if (i >= 0 && opcionesDOM[i]) {
        entrada.setAttribute("aria-activedescendant", opcionesDOM[i].id);
        opcionesDOM[i].scrollIntoView({ block: "nearest" });
      } else {
        entrada.removeAttribute("aria-activedescendant");
      }
    }

    // Repinta el selector y la línea «Buscando en…» con lo que se está viendo ahora.
    function refrescarAmbito() {
      const comp = compActual();
      const todas = check.checked || !comp;
      if (ambito) {
        ambito.hidden = !comp; // sin competición de referencia ya se busca en todas: el selector sobra
        ambito.setAttribute("data-valor", todas ? "todas" : "aqui");
      }
      if (btnAqui) {
        btnAqui.setAttribute("aria-checked", todas ? "false" : "true");
        btnAqui.setAttribute("tabindex", todas ? "-1" : "0");
        btnAqui.title = COMPETICIONES[comp] || "";
      }
      if (btnTodas) {
        btnTodas.setAttribute("aria-checked", todas ? "true" : "false");
        btnTodas.setAttribute("tabindex", todas ? "0" : "-1");
      }
      if (nombreAqui) nombreAqui.textContent = CORTOS[comp] || "Esta competición";
      if (contexto) {
        const donde = todas ? "las tres competiciones" : (COMPETICIONES[comp] || "esta competición");
        const cuando = tempActual() === "todas" ? "histórico acumulado" : "temporada en curso";
        contexto.innerHTML = `Buscando en <b>${escapeHtml(donde)}</b> · ${cuando}`;
      }
    }
    // Cambia el ámbito (desde el selector o desde «Probar con Todas…») y repite la búsqueda si hay texto.
    function alCambiarAmbito() {
      refrescarAmbito();
      const q = entrada.value.trim();
      if (q.length >= MIN_LETRAS) { clearTimeout(temporizador); buscar(q); }
    }
    function fijarAmbito(todas) {
      if (check.checked === todas) return;
      check.checked = todas;
      alCambiarAmbito();
    }

    function sufijoTemporada(datos) {
      return datos && datos.temporada === "todas" ? "&temp=todas" : "";
    }
    function hrefJugador(j, datos) {
      return `${baseHref()}jugador?c=${encodeURIComponent(j.competicion)}&j=${encodeURIComponent(j.slug)}${sufijoTemporada(datos)}`;
    }
    function hrefClub(c, datos) {
      return `${baseHref()}plantilla?c=${encodeURIComponent(c.competicion)}&club=${encodeURIComponent(c.club)}${sufijoTemporada(datos)}`;
    }

    function pintar(datos, q) {
      const jugadores = datos.jugadores || [];
      const clubes = datos.clubes || [];
      const variasCompeticiones = new Set([...jugadores.map((j) => j.competicion), ...clubes.map((c) => c.competicion)]).size > 1 || !datos.competicion;
      const etiquetaComp = (c) => (variasCompeticiones && COMPETICIONES[c] ? `<span class="buscador-jug-comp buscador-jug-comp--${escapeHtml(c)}">${escapeHtml(COMPETICIONES[c])}</span>` : "");
      let n = 0;
      const opcion = (href, html) => `<li class="buscador-jug-opcion" role="option" id="${idBase}-op${n++}" aria-selected="false"><a href="${escapeHtml(href)}" tabindex="-1">${html}</a></li>`;

      let html = "";
      if (jugadores.length) {
        html += `<li class="buscador-jug-grupo" role="presentation">Jugadores</li>`;
        html += jugadores.map((j) => opcion(hrefJugador(j, datos), `
          ${j.dorsal !== null && j.dorsal !== undefined ? `<span class="stats-dorsal">${escapeHtml(String(j.dorsal))}</span>` : `<span class="stats-dorsal stats-dorsal-vacio">·</span>`}
          <span class="buscador-jug-texto">
            <span class="buscador-jug-nombre">${escapeHtml(j.jugador)}</span>
            <span class="buscador-jug-detalle"><span class="buscador-jug-club">${escapeHtml(j.club)}</span>${etiquetaComp(j.competicion)}</span>
          </span>
          <span class="buscador-jug-cifras" title="Goles y asistencias"><span class="buscador-jug-cifra"><b>${j.goles}</b> G</span><span class="buscador-jug-cifra"><b>${j.asistencias}</b> A</span></span>`)).join("");
      }
      if (clubes.length) {
        html += `<li class="buscador-jug-grupo" role="presentation">Clubes</li>`;
        html += clubes.map((c) => opcion(hrefClub(c, datos), `
          <img class="buscador-jug-escudo" src="${getEscudoUrl(c.club, null)}" alt="" loading="lazy" onerror="manejarErrorEscudo(this);">
          <span class="buscador-jug-texto">
            <span class="buscador-jug-nombre">${escapeHtml(c.club)}</span>
            <span class="buscador-jug-detalle"><span class="buscador-jug-club">Ver plantilla</span>${etiquetaComp(c.competicion)}</span>
          </span>`)).join("");
      }
      if (!n) {
        const puedeAmpliar = !!datos.competicion && !check.checked;
        const dondeVacio = datos.competicion && COMPETICIONES[datos.competicion] ? ` en ${COMPETICIONES[datos.competicion]}` : "";
        const ampliar = puedeAmpliar ? `<button type="button" class="buscador-jug-ampliar">Probar con «Todas las competiciones»</button>` : "";
        html = `<li class="buscador-jug-vacio" role="presentation"><span class="buscador-jug-vacio-texto">Sin resultados para «${escapeHtml(q)}»${escapeHtml(dondeVacio)}.</span>${ampliar}</li>`;
      }
      lista.innerHTML = html;
      opcionesDOM = [...lista.querySelectorAll(".buscador-jug-opcion")];
      activo = -1;
      abrir();
      aviso.textContent = n ? `${n} resultado${n === 1 ? "" : "s"}. Usa las flechas para moverte.` : "Sin resultados.";
    }

    function pintarError() {
      lista.innerHTML = `<li class="buscador-jug-vacio" role="presentation">No se ha podido buscar ahora mismo. Inténtalo de nuevo en unos segundos.</li>`;
      opcionesDOM = [];
      abrir();
      aviso.textContent = "No se ha podido buscar.";
    }

    async function buscar(q) {
      const id = ++peticion;
      const params = new URLSearchParams({ q });
      const comp = compActual();
      if (!check.checked && comp) params.set("competicion", comp);
      if (tempActual() === "todas") params.set("temporada", "todas");
      try {
        const res = await apiFetch(`/api/stats/buscar?${params.toString()}`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const datos = await res.json();
        if (id !== peticion) return; // llegó tarde: la persona ya ha escrito otra cosa
        pintar(datos, q);
      } catch (err) {
        if (id !== peticion) return;
        pintarError();
      }
    }

    function programar() {
      clearTimeout(temporizador);
      const q = entrada.value.trim();
      if (q.length < MIN_LETRAS) {
        peticion++; // descarta lo que viniera en camino
        cerrar();
        aviso.textContent = "";
        return;
      }
      temporizador = setTimeout(() => buscar(q), ESPERA_MS);
    }

    function ir(i) {
      const a = opcionesDOM[i] && opcionesDOM[i].querySelector("a");
      if (a) window.location.href = a.href;
    }

    entrada.addEventListener("input", programar);
    check.addEventListener("change", alCambiarAmbito);
    if (btnAqui) btnAqui.addEventListener("click", () => fijarAmbito(false));
    if (btnTodas) btnTodas.addEventListener("click", () => fijarAmbito(true));
    if (ambito) {
      // Radiogrupo accesible: las flechas mueven la selección y el foco.
      ambito.addEventListener("keydown", (ev) => {
        const izq = ev.key === "ArrowLeft" || ev.key === "ArrowUp";
        const der = ev.key === "ArrowRight" || ev.key === "ArrowDown";
        if (!izq && !der) return;
        ev.preventDefault();
        fijarAmbito(der);
        const destino = der ? btnTodas : btnAqui;
        if (destino && destino.focus) destino.focus();
      });
    }
    entrada.addEventListener("focus", () => {
      if (opcionesDOM.length || lista.children.length) abrir();
      else if (entrada.value.trim().length >= MIN_LETRAS) buscar(entrada.value.trim()); // resultados descartados por un cambio de competición
    });
    lista.addEventListener("click", (ev) => {
      const t = ev.target;
      if (t && t.closest && t.closest(".buscador-jug-ampliar")) { fijarAmbito(true); entrada.focus(); }
    });
    entrada.addEventListener("keydown", (ev) => {
      const n = opcionesDOM.length;
      if (ev.key === "ArrowDown") {
        if (!n) return;
        ev.preventDefault();
        abrir();
        marcarActivo(activo + 1 >= n ? 0 : activo + 1);
      } else if (ev.key === "ArrowUp") {
        if (!n) return;
        ev.preventDefault();
        abrir();
        marcarActivo(activo <= 0 ? n - 1 : activo - 1);
      } else if (ev.key === "Home" && !lista.hidden && n) {
        ev.preventDefault();
        marcarActivo(0);
      } else if (ev.key === "End" && !lista.hidden && n) {
        ev.preventDefault();
        marcarActivo(n - 1);
      } else if (ev.key === "Enter") {
        if (lista.hidden || !n) return;
        ev.preventDefault();
        ir(activo >= 0 ? activo : 0);
      } else if (ev.key === "Escape") {
        if (!lista.hidden) { ev.preventDefault(); cerrar(); }
        else if (entrada.value) { entrada.value = ""; programar(); }
      } else if (ev.key === "Tab") {
        cerrar();
      }
    });
    lista.addEventListener("mousemove", (ev) => {
      const li = ev.target.closest(".buscador-jug-opcion");
      if (li) { const i = opcionesDOM.indexOf(li); if (i !== activo) marcarActivo(i); }
    });
    // Evita que el clic en un resultado le quite el foco al campo antes de navegar.
    lista.addEventListener("mousedown", (ev) => ev.preventDefault());
    document.addEventListener("click", (ev) => { if (!cont.contains(ev.target)) cerrar(); });

    refrescarAmbito();

    // La página avisa de que ha cambiado la competición o la temporada.
    function actualizar() {
      refrescarAmbito();
      if (entrada.value.trim().length < MIN_LETRAS) return;
      if (!lista.hidden) { clearTimeout(temporizador); buscar(entrada.value.trim()); return; }
      peticion++; // lo que viniera en camino ya es de otra competición
      lista.innerHTML = "";
      opcionesDOM = [];
    }

    return { cerrar, enfocar: () => entrada.focus(), actualizar };
  }

  window.iniciarBuscadorJugadores = iniciarBuscadorJugadores;
})();
