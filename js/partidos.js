// ---------- Lógica compartida de partidos (usada en index.html y resultados.html) ----------

function estadoLabel(e) {
  return { programado: "Por jugar", en_juego: "En juego", retrasado: "Retrasado", anulado: "Anulado", finalizado: "Finalizado" }[e] || e;
}

// Un partido "no cubierto" es uno ya finalizado del que nunca se hizo
// minuto a minuto: no tiene ningún evento salvo, como mucho, los hitos
// que no dependen de que el redactor esté eventando de verdad -
// "inicio_partido" lo crea solo un cron en cuanto llega la hora del
// partido (ver iniciarCronometroPartido en el Worker), "descanso" y
// "fin_descanso" marcan el paso a la segunda parte sin que se haya
// registrado ninguna jugada, y "fin_partido" puede ser lo único que se
// pulse si alguien cierra el partido sin haber registrado nada más-.
// Si solo hay esos, o ninguno, se considera sin cubrir; cualquier otro
// evento (gol, tarjeta, cambio...) ya cuenta como cobertura real.
const TIPOS_EVENTO_HITO_SIN_COBERTURA = ["inicio_partido", "descanso", "fin_descanso", "fin_partido"];
function partidoNoCubierto(estado, eventos) {
  if (estado !== "finalizado") return false;
  const lista = eventos || [];
  return lista.every(ev => TIPOS_EVENTO_HITO_SIN_COBERTURA.includes(ev.tipo));
}

// ---------- Orden cronológico de partidos ----------
// Convierte fecha_partido (que puede venir con o sin "Z"/offset, o con
// espacio en vez de "T", según de dónde se haya guardado) a timestamp,
// igual que ya hace minutoEnVivoPublico más abajo con
// inicio_cronometro_at. Devuelve NaN si no hay fecha o no se puede
// parsear, para que el partido caiga al final del todo en vez de
// romper la ordenación.
function timestampFechaPartido(p) {
  if (!p.fecha_partido) return NaN;
  let raw = String(p.fecha_partido).trim();
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(raw)) {
    raw = raw.includes("T") ? raw + "Z" : raw.replace(" ", "T") + "Z";
  }
  const t = new Date(raw).getTime();
  return isNaN(t) ? NaN : t;
}

// Orden cronológico único para pintar partidos en index y resultados:
// arriba los más recientes (en juego primero, luego finalizados del más
// reciente al más antiguo) y abajo los que quedan por jugar. Un partido
// "en juego" siempre va antes que uno ya "finalizado" aunque su fecha
// sea anterior (p.ej. un partido de ayer que se retrasó y se está
// jugando ahora mismo debe seguir destacando arriba), y cualquier
// partido ya jugado/en juego siempre va antes que cualquiera "por
// jugar".
// Rango de prioridad: 0 en juego, 1 finalizado/anulado/retrasado ya
// disputado, 2 programado amistoso (por jugar, destacado arriba del
// resto de programados), 3 programado del resto de competiciones (por
// jugar, del más próximo al más lejano).
function prioridadOrdenPartido(p) {
  if (p.estado === "en_juego") return 0;
  if (p.estado === "programado") return p.competicion === "amistoso" ? 2 : 3;
  return 1; // finalizado, anulado, retrasado (ya con fecha pasada o resultado)
}

function ordenarPartidosCronologicamente(partidos) {
  return [...partidos].sort((a, b) => {
    const prioA = prioridadOrdenPartido(a);
    const prioB = prioridadOrdenPartido(b);
    if (prioA !== prioB) return prioA - prioB;
    const ta = timestampFechaPartido(a);
    const tb = timestampFechaPartido(b);
    // Partidos por jugar (prioridad 2 amistosos y 3 el resto): el más
    // próximo primero -> orden ascendente de fecha. El resto (en juego /
    // ya disputados): el más reciente primero -> orden descendente de
    // fecha.
    if (isNaN(ta) && isNaN(tb)) return 0;
    if (isNaN(ta)) return 1; // sin fecha, al final de su grupo
    if (isNaN(tb)) return -1;
    return (prioA === 2 || prioA === 3) ? (ta - tb) : (tb - ta);
  });
}

// Calcula el minuto en vivo de un partido en el propio navegador, igual
// que hace el panel de administración: a partir de inicio_cronometro_at
// (instante UTC en que se pulsó "Iniciar partido") y, si el cronómetro
// está pausado (descanso), se queda fijo en cronometro_pausado_en. Si el
// partido no trae esos campos (por ejemplo si la API pública todavía no
// los expone), devuelve null y quien llame simplemente no muestra el
// minuto, sin romper nada.
function minutoEnVivoPublico(p) {
  if (p.cronometro_pausado_en !== null && p.cronometro_pausado_en !== undefined) {
    return p.cronometro_pausado_en;
  }
  if (!p.inicio_cronometro_at) return null;
  let raw = String(p.inicio_cronometro_at).trim();
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(raw)) {
    raw = raw.includes("T") ? raw + "Z" : raw.replace(" ", "T") + "Z";
  }
  const inicio = new Date(raw).getTime();
  if (isNaN(inicio)) return null;
  // Igual que en el panel de administración: si se ha corregido a mano
  // el minuto mientras el cronómetro corría, el desplazamiento viaja en
  // ajuste_cronometro_minutos y hay que sumarlo, o la web pública se
  // quedaría mostrando el minuto antiguo tras la corrección.
  const ajuste = Number.isInteger(p.ajuste_cronometro_minutos) ? p.ajuste_cronometro_minutos : 0;
  return Math.max(0, Math.floor((Date.now() - inicio) / 60000) + ajuste);
}

// Texto del minuto a mostrar junto a "EN JUEGO" (p.ej. "· 63'"), o cadena
// vacía si no tenemos datos de cronómetro todavía.
function minutoEnVivoTexto(p) {
  const minuto = minutoEnVivoPublico(p);
  return minuto === null ? "" : `· ${minuto}'`;
}

// Refresca cada 20s el minuto mostrado en todas las tarjetas "en juego"
// ya pintadas en la página, sin volver a pedir nada al servidor (el
// minuto se calcula en el cliente a partir de inicio_cronometro_at, así
// que no hace falta red para mantenerlo al día). Se apoya en
// PARTIDOS_CACHE, que cada página (portada, resultados) ya rellena al
// cargar los partidos.
let INTERVALO_MINUTOS_EN_VIVO = null;
function iniciarRefrescoMinutosEnVivo() {
  if (INTERVALO_MINUTOS_EN_VIVO) return; // ya en marcha, no duplicar
  INTERVALO_MINUTOS_EN_VIVO = setInterval(refrescarMinutosEnVivoEnPantalla, 20000);
}
function refrescarMinutosEnVivoEnPantalla() {
  document.querySelectorAll("[data-minuto-en-vivo]").forEach((el) => {
    const id = String(el.dataset.minutoEnVivo).replace(/^modal-/, "");
    const p = PARTIDOS_CACHE[id];
    if (p) el.textContent = minutoEnVivoTexto(p);
  });
}
// Se relanza también al volver de segundo plano (por si el navegador
// hubiera limitado el setInterval mientras la pestaña no era visible),
// para que el minuto no se quede desactualizado al volver a mirarla.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refrescarMinutosEnVivoEnPantalla();
});
iniciarRefrescoMinutosEnVivo();

// ---------- AUTO-REFRESCO EN VIVO (estado, goles y eventos) ----------
// Además del minuto (arriba, que no necesita red), cada pocos segundos se
// vuelve a pedir al servidor el estado real de los partidos que puedan
// cambiar en cualquier momento: "programado" (puede pasar a "en_juego" en
// cuanto llega la hora) y "en_juego" (pueden marcar un gol, sacar una
// tarjeta o acabar el partido). Los "finalizado"/"anulado" ya no cambian,
// así que no merece la pena seguir pidiéndolos.
// Además del resultado (marcador/estado/cronómetro) también se vigilan
// los EVENTOS del partido (goles, tarjetas, cambios...): una tarjeta
// amarilla, por ejemplo, no cambia ni el marcador ni el estado, así que
// si solo se comparara el resultado no se detectaría y el modal se
// quedaría sin la tarjeta hasta cerrarlo y reabrirlo.
// Si hay cambios, se repinta tanto la tarjeta de la lista como -si está
// abierto mostrando ese partido- el modal de detalle, sin que quien esté
// leyendo tenga que recargar la página ni volver a abrir el modal.
const ESTADOS_SUSCEPTIBLES_DE_CAMBIO = ["programado", "en_juego"];
let INTERVALO_AUTOREFRESCO_PARTIDOS = null;

// Firma corta de una lista de eventos, para poder detectar "algo ha
// cambiado" sin tener que comparar campo a campo cada evento. Incluye no
// solo el id de cada evento sino también sus campos editables (minuto,
// tipo, jugador, equipo...), así que un gol, tarjeta o cambio nuevo
// cambia la firma, y también lo hace la CORRECCIÓN de un evento ya
// existente (p.ej. si el redactor corrige el minuto de un gol o lo pasa
// a "en propia puerta"), que antes no se detectaba porque solo se
// comparaban los ids.
function firmaEventos(eventos) {
  if (!eventos || !eventos.length) return "0";
  return eventos.length + ":" + eventos
    .map(e => [e.id, e.minuto, e.minuto_extra, e.tipo, e.equipo, e.jugador, e.jugador_sale, e.jugador_asistencia, e.bajar_gol, e.orden].join("|"))
    .join(",");
}

// Cache de la firma de eventos ya vista por partido, para comparar en el
// siguiente ciclo de refresco.
let EVENTOS_FIRMA_CACHE = {};

function idsPartidosAVigilar() {
  return Object.values(PARTIDOS_CACHE)
    .filter(p => ESTADOS_SUSCEPTIBLES_DE_CAMBIO.includes(p.estado))
    .map(p => p.id);
}

async function refrescarPartidosEnVivo() {
  const ids = idsPartidosAVigilar();
  if (!ids.length) return;
  try {
    await Promise.all(ids.map(async (id) => {
      const res = await apiFetch(`/api/results/${id}`, { cache: "no-store" });
      if (!res.ok) return;
      const { resultado } = await res.json();
      if (!resultado) return;

      // Solo los partidos "en_juego" (o que ACABAN de pasar a estarlo)
      // tienen eventos que puedan cambiar; un "programado" que sigue
      // programado no necesita esta segunda petición.
      let eventos = null;
      if (resultado.estado === "en_juego") {
        try {
          const resEventos = await apiFetch(`/api/results/${id}/eventos`, { cache: "no-store" });
          if (resEventos.ok) {
            const data = await resEventos.json();
            eventos = data.eventos || [];
          }
        } catch (err) {
          // Sin eventos frescos, se sigue comparando solo el resultado.
        }
      }
      actualizarPartidoEnPantalla(resultado, eventos);
    }));
  } catch (err) {
    // Sin conexión puntual, etc.: se reintenta en el siguiente ciclo, sin
    // avisar (el minuto/estado que ya se ve en pantalla se mantiene).
  }
}

// Aplica un resultado fresco recibido del servidor: si hay algo distinto a
// lo que ya teníamos en caché -en el resultado o en sus eventos-,
// actualiza la caché y repinta la tarjeta correspondiente (si está en el
// DOM) y el modal (si está abierto mostrando justo ese partido).
function actualizarPartidoEnPantalla(resultado, eventos) {
  const anterior = PARTIDOS_CACHE[resultado.id];
  let cambioRelevante = !anterior
    || anterior.estado !== resultado.estado
    || anterior.goles_local !== resultado.goles_local
    || anterior.goles_visitante !== resultado.goles_visitante
    || anterior.penaltis_local !== resultado.penaltis_local
    || anterior.penaltis_visitante !== resultado.penaltis_visitante
    || anterior.inicio_cronometro_at !== resultado.inicio_cronometro_at
    || anterior.cronometro_pausado_en !== resultado.cronometro_pausado_en
    || anterior.ajuste_cronometro_minutos !== resultado.ajuste_cronometro_minutos;

  if (eventos !== null) {
    const firmaNueva = firmaEventos(eventos);
    if (EVENTOS_FIRMA_CACHE[resultado.id] !== firmaNueva) {
      cambioRelevante = true;
      EVENTOS_FIRMA_CACHE[resultado.id] = firmaNueva;
    }
  }

  PARTIDOS_CACHE[resultado.id] = { ...anterior, ...resultado };
  if (!cambioRelevante) return;

  // Repinta la tarjeta de la lista, si existe en esta página.
  const tarjeta = document.querySelector(`.partido[data-id="${resultado.id}"]`);
  if (tarjeta) {
    const mostrarCompeticion = tarjeta.dataset.mostrarCompeticion === "1";
    tarjeta.outerHTML = partidoHTML(PARTIDOS_CACHE[resultado.id], { mostrarCompeticion });
  }

  // Si el modal de detalle está abierto y es justo el de este partido, se
  // vuelve a pintar entero (incluidos los eventos, por si hay un gol o
  // tarjeta nueva) para que quien lo esté viendo no tenga que cerrarlo y
  // volver a abrirlo.
  const modal = document.getElementById("modalPartido");
  if (modal && modal.classList.contains("abierto") && modal.dataset.partidoIdAbierto === String(resultado.id)) {
    abrirModalPartido(resultado.id, { forzarRefrescoRed: false });
  }
}

function iniciarAutoRefrescoPartidos() {
  if (INTERVALO_AUTOREFRESCO_PARTIDOS) return; // ya en marcha, no duplicar
  INTERVALO_AUTOREFRESCO_PARTIDOS = setInterval(refrescarPartidosEnVivo, 15000);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refrescarPartidosEnVivo();
});
iniciarAutoRefrescoPartidos();

// (manejarErrorEscudo vive ahora en clubs.js, junto a getEscudoUrl, para
// que páginas que no cargan partidos.js -como noticia.html- también
// puedan usarlo)

// Competiciones para las que tiene sentido enlazar el partido finalizado
// con su ficha en Flashscore (Primera Federación, Segunda Federación y
// LaLiga Hypermotion, que es la LaLiga2 actual).
const COMPETICIONES_CON_FLASHSCORE_PUBLICO = ["hypermotion", "primera_federacion", "segunda_federacion"];

// Genera el HTML de una fila de partido (reutilizable en portada y en la
// página de resultados). "clicable" añade role/tabindex para poder abrir
// el modal de detalle.
function partidoHTML(p, { mostrarCompeticion = false } = {}) {
  // La "Jornada" no aplica a los amistosos (el campo se deshabilita al
  // crearlos en el panel, pero si el partido trae igualmente un valor
  // guardado -p. ej. un 1 heredado- no debe mostrarse "Jornada 1").
  const jornadaMostrar = p.competicion === "amistoso" ? null : (p.jornada_mostrar ?? p.jornada);
  const metaExtra = mostrarCompeticion
    ? `${categoriaLabel(p.competicion)}${jornadaMostrar ? " · Jornada " + jornadaMostrar : ""}`
    : (jornadaMostrar ? "Jornada " + jornadaMostrar : "");
  // A los partidos "por jugar" y a los "finalizados" se les muestra, junto
  // a la fecha/hora, la ubicación donde se disputan/disputaron (si se ha
  // indicado), para que quien lee sepa dónde ir a verlo o dónde se jugó.
  const ubicacionExtra = ((p.estado === "programado" || p.estado === "finalizado") && p.ubicacion) ? " · " + escapeHtml(p.ubicacion) : "";
  // El enlace "Ver en Flashscore" solo se muestra dentro del modal de
  // detalle del partido (ver mostrarModalPartido más abajo), no aquí en
  // la tarjeta de la lista.
  const enJuego = p.estado === "en_juego";
  const enDescanso = enJuego && p.cronometro_pausado_en !== null && p.cronometro_pausado_en !== undefined;
  const anulado = p.estado === "anulado";
  // El badge de "en juego" lleva un punto animado en vez del texto plano,
  // para que destaque de un vistazo entre partidos por jugar/finalizados.
  // El minuto va en su propio <span data-minuto-en-vivo> para poder
  // refrescarlo cada pocos segundos sin repintar toda la tarjeta (ver
  // iniciarRefrescoMinutosEnVivo más abajo). Si el cronómetro está
  // pausado (p. ej. en el descanso entre 1ª y 2ª parte) se muestra
  // "DESCANSO" en vez de "EN JUEGO", aunque el estado del partido en BD
  // siga siendo "en_juego".
  const estadoTexto = enJuego
    ? (enDescanso
        ? `<span class="en-vivo-punto"></span>DESCANSO <span data-minuto-en-vivo="${p.id}">${minutoEnVivoTexto(p)}</span>`
        : `<span class="en-vivo-punto"></span>EN JUEGO <span data-minuto-en-vivo="${p.id}">${minutoEnVivoTexto(p)}</span>`)
    : estadoLabel(p.estado);
  // Un partido anulado se destaca con una cinta grande encima de toda la
  // tarjeta (no solo el texto pequeño del badge de estado, que pasaba
  // desapercibido para algo tan importante como "esto no ha valido").
  const cintaAnulado = anulado
    ? `<div class="partido-anulado-cinta">ANULADO</div>`
    : "";
  // Partidos que nadie de redacción cubre se rellenan automáticamente a
  // partir de una fuente externa (ver worker: sincronizarPartidosAutomaticosSiToca)
  // para que no falten de la clasificación ni del calendario. No llevan
  // ninguna etiqueta visible: de cara al usuario se muestran igual que
  // cualquier otro partido.
  const etiquetaAutomatico = "";
  return `
    <div class="partido${enJuego ? " partido-en-vivo" : ""}${anulado ? " partido-anulado" : ""}" data-id="${p.id}" data-mostrar-competicion="${mostrarCompeticion ? "1" : "0"}" role="button" tabindex="0">
      ${cintaAnulado}
      <span class="equipo equipo-local">
        <span class="nombre-equipo">${escapeHtml(p.equipo_local)}</span>
        <img class="escudo" src="${getEscudoUrl(p.equipo_local, p.escudo_local_url)}" alt="" loading="lazy" data-equipo="${escapeHtml(p.equipo_local)}" onerror="manejarErrorEscudo(this);">
      </span>
      <span class="marcador${enJuego ? " marcador-en-vivo" : ""}">${marcadorConPenaltisHTML(p)}</span>
      <span class="equipo equipo-visitante">
        <img class="escudo" src="${getEscudoUrl(p.equipo_visitante, p.escudo_visitante_url)}" alt="" loading="lazy" data-equipo="${escapeHtml(p.equipo_visitante)}" onerror="manejarErrorEscudo(this);">
        <span class="nombre-equipo">${escapeHtml(p.equipo_visitante)}</span>
      </span>
      <span class="estado-badge${enJuego ? " estado-badge-en-vivo" : ""}">${estadoTexto}${metaExtra ? " · " + metaExtra : ""}${p.fecha_partido ? " · " + formatFecha(p.fecha_partido) : ""}${ubicacionExtra}</span>
      ${etiquetaAutomatico}
    </div>`;
}

// ---------- MODAL DE DETALLE DEL PARTIDO ----------
// (ETIQUETAS_EVENTO_PUBLICO, iconoEventoPublico y formatMinutoEventoPublico
// viven ahora en config.js, compartidas con el marcador de noticia.html)

// Cache de partidos ya cargados en la página actual, para poder abrir el
// modal de detalle sin volver a pedirlos. Cada página que use este módulo
// debe rellenar PARTIDOS_CACHE con los resultados que haya obtenido.
let PARTIDOS_CACHE = {};

// Pinta el nombre de un equipo dentro del modal de detalle como enlace
// a su ficha (categoria.html), a diferencia de la tarjeta de la lista
// donde el nombre no es clicable. El elemento con ese id ya existe en
// el HTML como <span id="modalNombreLocal"/"modalNombreVisitante"
// class="modal-partido-nombre">; aquí se le mete dentro un <a> que
// hereda la misma clase para no tener que tocar el CSS. El clic en el
// enlace no debe cerrar/reaccionar como clic en el resto del modal.
function pintarNombreEquipoModal(elId, nombreEquipo, competicion) {
  const el = document.getElementById(elId);
  if (!el) return;
  const href = enlaceEquipoHref(nombreEquipo, competicion);
  if (!href) { el.textContent = nombreEquipo || ""; return; }
  el.innerHTML = "";
  const a = document.createElement("a");
  a.href = href;
  a.className = "modal-partido-nombre-link";
  a.textContent = nombreEquipo;
  a.addEventListener("click", (e) => e.stopPropagation());
  el.appendChild(a);
}

async function abrirModalPartido(id, { forzarRefrescoRed = true } = {}) {
  let p = PARTIDOS_CACHE[id];
  if (!p) return;

  // Antes de pintar el modal se refresca el partido contra la API: si la
  // página lleva un rato abierta (lista cargada al entrar) el marcador, el
  // estado o el minuto en vivo guardados en PARTIDOS_CACHE pueden estar
  // desactualizados. Si el refresco falla (sin red, etc.) se sigue
  // mostrando el dato que ya había en caché en vez de dejar el modal vacío.
  // Cuando esta función se llama desde el auto-refresco en vivo (ver más
  // abajo) el dato ya viene fresco de fuera, así que se salta este fetch
  // extra para no duplicar la petición.
  if (forzarRefrescoRed) {
    try {
      const resPartido = await apiFetch(`/api/results/${id}`, { cache: "no-store" });
      if (resPartido.ok) {
        const { resultado } = await resPartido.json();
        if (resultado) {
          p = { ...p, ...resultado };
          PARTIDOS_CACHE[id] = p;
        }
      }
    } catch (err) {
      // Se ignora: se sigue usando el dato en caché.
    }
  }

  document.getElementById("modalEscudoLocal").dataset.equipo = p.equipo_local;
  document.getElementById("modalEscudoLocal").removeAttribute("data-intento-filial");
  document.getElementById("modalEscudoLocal").onerror = function(){ manejarErrorEscudo(this); };
  document.getElementById("modalEscudoLocal").src = getEscudoUrl(p.equipo_local, p.escudo_local_url);
  document.getElementById("modalEscudoVisitante").dataset.equipo = p.equipo_visitante;
  document.getElementById("modalEscudoVisitante").removeAttribute("data-intento-filial");
  document.getElementById("modalEscudoVisitante").onerror = function(){ manejarErrorEscudo(this); };
  document.getElementById("modalEscudoVisitante").src = getEscudoUrl(p.equipo_visitante, p.escudo_visitante_url);
  // A diferencia de la tarjeta de la lista (donde el nombre del equipo
  // ya NO es clicable, ver partidoHTML más arriba), dentro del modal de
  // detalle sí se quiere poder ir a la ficha del equipo (categoria.html)
  // haciendo clic en su nombre. modalNombreLocal/Visitante son <span>
  // en el HTML de cada página, así que se les mete aquí un <a> dentro.
  pintarNombreEquipoModal("modalNombreLocal", p.equipo_local, p.competicion);
  pintarNombreEquipoModal("modalNombreVisitante", p.equipo_visitante, p.competicion);
  document.getElementById("modalMarcador").innerHTML = marcadorConPenaltisHTML(p, { claseChica: "penaltis-marcador penaltis-marcador-modal" });
  const enJuego = p.estado === "en_juego";
  const enDescanso = enJuego && p.cronometro_pausado_en !== null && p.cronometro_pausado_en !== undefined;
  const modalEstadoEl = document.getElementById("modalEstado");
  modalEstadoEl.classList.toggle("modal-estado-en-vivo", enJuego);
  modalEstadoEl.innerHTML = enJuego
    ? `<span class="en-vivo-punto"></span>${enDescanso ? "DESCANSO" : "EN JUEGO"} <span data-minuto-en-vivo="modal-${p.id}">${minutoEnVivoTexto(p)}</span>`
    : estadoLabel(p.estado);
  document.getElementById("modalMarcador").classList.toggle("marcador-en-vivo", enJuego);
  document.querySelector(".modal-partido-caja")?.classList.toggle("modal-partido-caja-en-vivo", enJuego);
  document.getElementById("modalPartidoTitulo").textContent =
    (p.competicion === "amistoso" ? "Amistoso" : (p.jornada ? "Jornada " + (p.jornada_mostrar ?? p.jornada) : categoriaLabel(p.competicion))) +
    (p.grupo ? " · " + p.grupo : "") +
    (p.fecha_partido ? " · " + formatFecha(p.fecha_partido) : "") +
    ((p.estado === "programado" || p.estado === "finalizado") && p.ubicacion ? " · " + p.ubicacion : "");

  // MVP (jugador destacado) del partido, si el redactor lo ha marcado
  // (desde el panel de edición o desde el propio panel de Minuto a
  // Minuto una vez finalizado). Se pinta con el escudo del equipo al
  // que pertenece para que se identifique de un vistazo.
  const contMvp = document.getElementById("modalPartidoMvp");
  if (contMvp) {
    if (p.mvp_jugador) {
      const equipoMvp = p.mvp_equipo === "local" ? p.equipo_local : p.equipo_visitante;
      const escudoMvp = p.mvp_equipo === "local"
        ? getEscudoUrl(p.equipo_local, p.escudo_local_url)
        : getEscudoUrl(p.equipo_visitante, p.escudo_visitante_url);
      contMvp.hidden = false;
      contMvp.innerHTML = `
        <img class="modal-partido-mvp-escudo" src="${escudoMvp}" alt="" loading="lazy" onerror="manejarErrorEscudo(this);" data-equipo="${escapeHtml(equipoMvp)}">
        <span class="modal-partido-mvp-etiqueta">MVP</span>
        <span class="modal-partido-mvp-nombre">${escapeHtml(p.mvp_jugador)}</span>`;
    } else {
      contMvp.hidden = true;
      contMvp.innerHTML = "";
    }
  }

  const enlaceFlashscore = document.getElementById("modalEnlaceFlashscore");
  if (enlaceFlashscore) {
    const puedeFlashscore = p.estado === "finalizado" && p.flashscore_url && COMPETICIONES_CON_FLASHSCORE_PUBLICO.includes(p.competicion);
    enlaceFlashscore.hidden = !puedeFlashscore;
    if (puedeFlashscore) enlaceFlashscore.href = p.flashscore_url;
  }

  // Enlace a la página pública de minuto a minuto (minuto-a-minuto.html):
  // solo tiene sentido ofrecerlo si el partido ya ha arrancado o ha
  // terminado, es decir, si puede haber (o va a haber) algún evento que
  // seguir. Con el partido todavía "programado" no hay nada que ver ahí.
  const enlaceMinutoAMinuto = document.getElementById("modalEnlaceMinutoAMinuto");
  if (enlaceMinutoAMinuto) {
    const puedeMinutoAMinuto = p.estado === "en_juego" || p.estado === "finalizado";
    enlaceMinutoAMinuto.hidden = !puedeMinutoAMinuto;
    if (puedeMinutoAMinuto) enlaceMinutoAMinuto.href = `minuto-a-minuto.html?id=${p.id}`;
  }

  // Si el partido tiene una (o varias) noticia ya publicada vinculada
  // -crónica, previa, entrevista...- (ver noticias_vinculadas, adjuntado
  // por el backend en /api/results/:id), se enlaza aquí para poder
  // entrar directamente a leerla desde el propio modal de resultado, sin
  // tener que ir a buscarla aparte por la web.
  const contNoticiasVinculadas = document.getElementById("modalNoticiasVinculadas");
  if (contNoticiasVinculadas) {
    const noticias = Array.isArray(p.noticias_vinculadas) ? p.noticias_vinculadas : [];
    contNoticiasVinculadas.hidden = !noticias.length;
    contNoticiasVinculadas.innerHTML = noticias.length
      ? noticias.map((n) => `
          <a class="modal-noticia-vinculada" href="${urlNoticia(n.categoria, n.slug)}">
            <span class="modal-noticia-vinculada-tipo">${escapeHtml(tipoContenidoLabel(n.tipo))}</span>
            <span class="modal-noticia-vinculada-titulo">${escapeHtml(n.titulo)}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </a>`).join("")
      : "";
  }

  const modal = document.getElementById("modalPartido");
  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
  modal.dataset.partidoIdAbierto = String(p.id);
  document.body.style.overflow = "hidden";

  const cont = document.getElementById("modalPartidoEventos");

  // Si el partido todavía no se ha disputado, no tiene sentido pedir
  // eventos al backend: se avisa directamente.
  if (p.estado === "programado") {
    cont.innerHTML = `<p class="modal-partido-sin-eventos">Todavía no se ha disputado este encuentro.</p>`;
    return;
  }

  cont.innerHTML = spinnerHTML();
  try {
    const res = await apiFetch(`/api/results/${id}/eventos`, { cache: "no-store" });
    const { eventos } = await res.json();
    renderEventosModal(eventos || []);
    // El enlace a la página pública de minuto a minuto solo tiene
    // sentido si de verdad hay algo que ver ahí: un partido finalizado
    // sin ni un solo evento nunca se cubrió al minuto, así que llevar a
    // esa página solo daría un liveblog vacío. Se corrige aquí, con los
    // eventos ya en mano, la visibilidad calculada más arriba solo por
    // estado.
    if (enlaceMinutoAMinuto) {
      const hayAlgoQueVer = p.estado === "en_juego" || (p.estado === "finalizado" && !partidoNoCubierto(p.estado, eventos));
      enlaceMinutoAMinuto.hidden = !hayAlgoQueVer;
    }
    // La alineación se pinta aparte, debajo del bloque de eventos: se usa
    // la que ya llegó junto al partido (adjuntada por /api/results/:id
    // más arriba, en el refresco de red del principio de esta función),
    // con los cambios ya registrados en "eventos" aplicados encima (ver
    // alineacionesConCambiosAplicados en config.js): así el modal
    // muestra el once que está en el campo AHORA MISMO, no el inicial.
    const contAlineaciones = document.getElementById("modalPartidoAlineaciones");
    if (contAlineaciones) {
      const alineaciones = alineacionesConCambiosAplicados(p.alineaciones, eventos, p.estado);
      contAlineaciones.innerHTML = (alineaciones && alineaciones.length) ? alineacionesHTML(alineaciones) : "";
    }
  } catch (err) {
    cont.innerHTML = `<p class="modal-partido-sin-eventos">No se ha podido cargar el detalle del partido.</p>`;
  }
}

function renderEventosModal(eventos) {
  const cont = document.getElementById("modalPartidoEventos");
  const idAbierto = document.getElementById("modalPartido")?.dataset.partidoIdAbierto;
  const p = idAbierto ? PARTIDOS_CACHE[idAbierto] : null;
  if (p && partidoNoCubierto(p.estado, eventos)) {
    cont.innerHTML = `<p class="modal-partido-sin-eventos">Este partido no ha sido cubierto minuto a minuto.</p>`;
    return;
  }
  if (!eventos.length) {
    cont.innerHTML = `<p class="modal-partido-sin-eventos">Todavía no hay goles ni tarjetas registrados para este partido.</p>`;
    return;
  }
  // La tanda de penaltis se pinta aparte, ordenada por lanzamiento (no
  // por minuto: "minuto" en estos eventos es el número de orden), y no
  // se intercala con el resto del timeline del partido.
  const eventosTanda = eventos.filter(ev => TIPOS_EVENTO_TANDA_PENALTIS.includes(ev.tipo));
  const eventosPartido = eventos.filter(ev => !TIPOS_EVENTO_TANDA_PENALTIS.includes(ev.tipo));
  cont.innerHTML = renderEventosModalPartido(eventosPartido) + renderTandaPenaltisModal(eventosTanda);
}

function renderEventosModalPartido(eventos) {
  if (!eventos.length) return "";
  return eventos.map(ev => {
    // Los hitos del partido (inicio, descanso, final...) no pertenecen a
    // ningún equipo: se pintan centrados en vez de a un lado.
    if (ev.equipo === "ninguno") {
      return `
        <div class="modal-evento modal-evento-centro">
          <div class="modal-evento-contenido">
            ${iconoEventoPublico(ev.tipo)}
            <span class="mev-texto">
              <span class="mev-minuto">${formatMinutoEventoPublico(ev)}</span>
              ${ev.tipo === "nota" ? escapeHtml(ev.jugador || "") : escapeHtml(ETIQUETAS_EVENTO_PUBLICO[ev.tipo] || ev.tipo)}
            </span>
          </div>
        </div>`;
    }
    return `
    <div class="modal-evento modal-evento-${ev.equipo}">
      ${ev.equipo === "visitante" ? `<span class="mev-hueco"></span>` : ""}
      <div class="modal-evento-contenido">
        ${iconoEventoPublico(ev.tipo)}
        <span class="mev-texto">
          <span class="mev-minuto">${formatMinutoEventoPublico(ev)}</span>
          ${escapeHtml(ETIQUETAS_EVENTO_PUBLICO[ev.tipo] || ev.tipo)}${detalleJugadorEventoPublico(ev)}
        </span>
      </div>
      ${ev.equipo === "local" ? `<span class="mev-hueco"></span>` : ""}
    </div>`;
  }).join("");
}

// Bloque de la tanda de penaltis dentro del modal de detalle: un
// encabezado propio y cada lanzamiento en su orden (1º, 2º, 3º...),
// marcado en verde si se anotó y en rojo si se falló/paró.
function renderTandaPenaltisModal(eventosTanda) {
  if (!eventosTanda.length) return "";
  const ordenados = [...eventosTanda].sort((a, b) => a.minuto - b.minuto);
  return `
    <div class="modal-tanda-penaltis">
      <h5 class="modal-tanda-titulo">Tanda de penaltis</h5>
      ${ordenados.map(ev => {
        const marcado = ev.tipo === "penalti_marcado";
        return `
          <div class="modal-evento modal-evento-${ev.equipo} modal-evento-tanda${marcado ? " modal-evento-tanda-marcado" : " modal-evento-tanda-fallado"}">
            ${ev.equipo === "visitante" ? `<span class="mev-hueco"></span>` : ""}
            <div class="modal-evento-contenido">
              ${iconoEventoPublico(ev.tipo)}
              <span class="mev-texto">
                <span class="mev-minuto">${formatMinutoEventoPublico(ev)}</span>
                ${escapeHtml(ETIQUETAS_EVENTO_PUBLICO[ev.tipo] || ev.tipo)}${detalleJugadorEventoPublico(ev)}
              </span>
            </div>
            ${ev.equipo === "local" ? `<span class="mev-hueco"></span>` : ""}
          </div>`;
      }).join("")}
    </div>`;
}

function cerrarModalPartido() {
  const modal = document.getElementById("modalPartido");
  modal.classList.remove("abierto");
  modal.setAttribute("aria-hidden", "true");
  delete modal.dataset.partidoIdAbierto;
  document.body.style.overflow = "";
}

// Engancha los listeners de clic/teclado del modal a un contenedor que
// contenga elementos ".partido". Debe llamarse una vez que el contenedor
// exista en el DOM.
function inicializarClicsPartidos(contenedorId) {
  const cont = document.getElementById(contenedorId);
  if (!cont || cont.dataset.partidosInit) return;
  cont.dataset.partidosInit = "1";
  cont.addEventListener("click", (e) => {
    const partido = e.target.closest(".partido");
    if (!partido) return;
    abrirModalPartido(parseInt(partido.dataset.id, 10));
  });
  cont.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const partido = e.target.closest(".partido");
    if (!partido) return;
    e.preventDefault();
    abrirModalPartido(parseInt(partido.dataset.id, 10));
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cerrarModalPartido();
});
