// ---------- PANEL DE MINUTO A MINUTO ----------
// Panel a pantalla completa, con botones cuadrados grandes para ir
// registrando en vivo todo lo que pasa en un partido (goles, tarjetas,
// cambios, descanso, inicio/fin...). Cada botón dispara inmediatamente
// una llamada a la API (POST /api/results/:id/eventos) usando el minuto
// que marca el cronómetro en ese instante, así que lo que ve el redactor
// en pantalla y lo que ya está guardado (y visible en la web pública)
// van prácticamente a la vez.
//
// Solo se puede entrar el día del partido (con margen de unas horas
// antes/después): el backend ya lo exige en /api/results/:id/cronometro
// y en la creación de eventos vía puedeEditar + la comprobación de fecha,
// así que aquí solo replicamos la comprobación para no mostrar el botón
// de entrada si no toca (ver dentroDelDiaDelPartidoFrontend en admin.js).

let MAM_RESULTADO = null; // resultado (partido) que se está gestionando ahora mismo
let MAM_EVENTOS = [];     // caché de sus eventos, más recientes al final
let MAM_TICK_INTERVAL = null;
let MAM_EQUIPO_SELECCIONADO = null; // 'local' | 'visitante' | null, para los tipos que necesitan elegir equipo antes (tarjetas, cambios...)

// La cruz de cerrar se regenera cada vez que se pinta el panel (con
// innerHTML), así que un onclick inline en el propio botón puede quedar
// "muerto" si algo en el HTML generado dinámicamente (nombre de equipo o
// URL de escudo con caracteres especiales, etc.) llega a corromper el
// parseo de ese trozo de HTML. Para que cerrar el panel sea a prueba de
// bombas, el cierre no depende de un único mecanismo: además del
// onclick que se añade directamente al botón al pintarlo (ver
// renderPanelMinutoAMinuto), hay este listener delegado en el propio
// documento, en fase de captura (antes que cualquier otro overlay pueda
// interceptar o detener el evento), que también busca el botón por su
// id. Con dos vías independientes, si una falla por lo que sea, la otra
// sigue funcionando.
document.addEventListener("click", (e) => {
  try {
    if (e.target.closest("#mamBotonCerrar")) cerrarPanelMinutoAMinuto();
  } catch (err) {
    console.error("Listener delegado de cierre del panel MAM:", err);
  }
}, true);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.getElementById("panelMinutoAMinuto")?.classList.contains("mam-abierto")) {
    cerrarPanelMinutoAMinuto();
  }
});

// Con el panel abierto, recargar o cerrar la pestaña por accidente (F5,
// Ctrl+R, cerrar el navegador...) tira todo el registro en curso del
// partido. Se avisa con el diálogo nativo de "salir de la página" para
// que la única salida "de verdad" sea la cruz (que sí limpia el estado
// correctamente vía cerrarPanelMinutoAMinuto). El propio navegador
// decide el texto del aviso; el que se pone aquí es el estándar que
// algunos navegadores todavía muestran.
window.addEventListener("beforeunload", (e) => {
  if (document.getElementById("panelMinutoAMinuto")?.classList.contains("mam-abierto")) {
    e.preventDefault();
    e.returnValue = "";
    return "";
  }
});

const MAM_ETIQUETAS = {
  gol: "Gol",
  gol_pp: "Gol en propia puerta",
  gol_var: "Gol anulado (VAR)",
  amarilla: "Tarjeta amarilla",
  doble_amarilla: "Doble amarilla",
  roja: "Tarjeta roja",
  cambio: "Cambio",
  penalti_fallado: "Penalti fallado",
  var: "Revisión VAR",
  inicio_partido: "Comienza el partido",
  descanso: "Descanso",
  fin_descanso: "Comienza la 2ª parte",
  pausa_hidratacion: "Pausa de hidratación",
  fin_pausa_hidratacion: "Se reanuda el partido",
  partido_retrasado: "Partido retrasado",
  partido_anulado: "Partido anulado",
  penalti_marcado: "Penalti (tanda)",
  penalti_fallado_tanda: "Penalti fallado (tanda)",
  fin_partido: "Final del partido",
  otro: "Otra incidencia",
};

const MAM_TIPOS_SIN_EQUIPO = [
  "inicio_partido", "descanso", "fin_descanso",
  "pausa_hidratacion", "fin_pausa_hidratacion",
  "partido_retrasado", "partido_anulado",
  "fin_partido", "otro",
];

// Tipos de la tanda de penaltis: se registran con su propio botón/modal
// (mamAbrirTandaPenaltis), no con el mini-formulario normal de eventos,
// porque piden un número de lanzamiento en vez de un minuto y no
// dependen del cronómetro del partido (se tiran con el partido ya
// "Final").
const MAM_TIPOS_TANDA_PENALTIS = ["penalti_marcado", "penalti_fallado_tanda"];

// Clave de localStorage donde se guarda qué partido tiene abierto el
// panel de Minuto a Minuto. Sirve para volver a abrirlo automáticamente
// si se recarga la página (F5, Ctrl+R...) mientras se está gestionando
// un partido en vivo: sin esto, un recargar accidental hacía perder de
// vista el partido en curso y había que buscarlo de nuevo en la tabla.
const MAM_STORAGE_KEY = "mam_resultado_abierto";

async function abrirPanelMinutoAMinuto(resultadoId) {
  // Si algo impide abrir el panel (partido no encontrado, sin permiso,
  // fuera del día del partido, error de red...) y se había entrado en
  // modo "página independiente" (ver abrirMinutoAMinutoDesdeUrl en
  // admin.js), hay que deshacer ese modo: si no, body.mam-standalone se
  // queda puesto con la cabecera y las pestañas ocultas (ver admin.css)
  // pero sin ningún overlay que mostrar, dejando una pantalla en blanco
  // sin forma de volver al panel.
  const salirDelModoStandaloneSiFalla = () => {
    if (!document.body.classList.contains("mam-standalone")) return;
    document.body.classList.remove("mam-standalone");
    const historyUrl = new URL(location.href);
    historyUrl.searchParams.delete("minuto_a_minuto");
    history.replaceState(null, "", historyUrl.pathname + historyUrl.search);
  };
  try {
    const { resultado: r } = await apiFetch(`/api/results/${resultadoId}`);
    if (!r) { salirDelModoStandaloneSiFalla(); return EOF.toast("No se ha encontrado ese partido", "error"); }
    MAM_RESULTADO = r;
    await cargarPermisosTemporalesVigentes();
    if (!puedeGestionarResultado(r)) {
      salirDelModoStandaloneSiFalla();
      return EOF.toast("No puedes gestionar el minuto a minuto de este partido porque no es tuyo.", "error");
    }
    if (!dentroDelDiaDelPartidoFrontend(r.fecha_partido)) {
      salirDelModoStandaloneSiFalla();
      return EOF.toast("Solo puedes acceder al panel de Minuto a Minuto el día del partido.", "error");
    }
    renderPanelMinutoAMinuto();
    await recargarEventosMinutoAMinuto();
    document.getElementById("panelMinutoAMinuto").classList.add("mam-abierto");
    document.body.style.overflow = "hidden";
    iniciarTickCronometro();
    try { localStorage.setItem(MAM_STORAGE_KEY, String(resultadoId)); } catch {}
  } catch (err) {
    EOF.toast("Error abriendo el panel: " + err.message, "error");
    salirDelModoStandaloneSiFalla();
    // Si el partido guardado ya no se puede abrir (borrado, finalizado,
    // permisos cambiados...), se limpia para no quedar reintentando
    // abrirlo en cada recarga.
    try { localStorage.removeItem(MAM_STORAGE_KEY); } catch {}
  }
}

function cerrarPanelMinutoAMinuto() {
  // Lo primero de todo, pase lo que pase después: quitar la clase que
  // mantiene el panel visible Y vaciar su contenido. Esto último es
  // crítico: .mam-overlay tiene position:fixed;inset:0 en su propia
  // clase CSS, así que si se dejaba dentro del DOM (aunque el
  // contenedor padre perdiera "mam-abierto") seguía cubriendo TODA la
  // pantalla y bloqueando cualquier clic posterior, incluida la propia
  // cruz la siguiente vez que se abriera el panel. Vaciar el innerHTML
  // elimina ese overlay fantasma por completo.
  const panel = document.getElementById("panelMinutoAMinuto");
  panel?.classList.remove("mam-abierto");
  if (panel) panel.innerHTML = "";
  document.body.style.overflow = "";
  try { localStorage.removeItem(MAM_STORAGE_KEY); } catch {}
  try {
    // Si el modal rápido de evento (gol/tarjeta/cambio) estaba abierto
    // por encima, se limpia también (aunque al vaciar el innerHTML de
    // arriba ya desaparece con todo lo demás).
    mamCerrarFormularioEvento();
    if (MAM_TICK_INTERVAL) clearInterval(MAM_TICK_INTERVAL);
    MAM_TICK_INTERVAL = null;
    document.removeEventListener("visibilitychange", mamAlCambiarVisibilidad);
    MAM_RESULTADO = null;
    MAM_EVENTOS = [];
    // Si se llegó aquí como página independiente (panel.html?minuto_a_minuto=
    // ...), no tiene sentido dejar el dashboard completo oculto detrás
    // (ver body.mam-standalone en admin.css): se vuelve al panel normal,
    // ya en la pestaña de Resultados y con su listado recién cargado, en
    // vez de dejar una pantalla en blanco.
    if (document.body.classList.contains("mam-standalone")) {
      document.body.classList.remove("mam-standalone");
      const historyUrl = new URL(location.href);
      historyUrl.searchParams.delete("minuto_a_minuto");
      history.replaceState(null, "", historyUrl.pathname + historyUrl.search);
      document.querySelector('.tabs button[data-tab="resultados"]')?.click();
      return;
    }
    // Refresca la tabla de resultados de fondo para reflejar el marcador y
    // el estado (en juego/finalizado) que se hayan podido cambiar.
    if (document.getElementById("subpanel-listaResultados")?.classList.contains("activo")) {
      cargaListaResultados();
    }
  } catch (err) {
    console.error("cerrarPanelMinutoAMinuto: error en la limpieza (el panel ya se ha cerrado igualmente):", err);
  }
}

// ---------- Cronómetro ----------
// El minuto "en vivo" se calcula en el propio navegador a partir de
// inicio_cronometro_at (instante UTC en que se pulsó "Iniciar partido"),
// para no tener que preguntar al servidor cada segundo. Si el cronómetro
// está pausado (descanso o final), se queda fijo en
// cronometro_pausado_en.
function minutoEnVivo() {
  const r = MAM_RESULTADO;
  if (!r) return 0;
  if (r.cronometro_pausado_en !== null && r.cronometro_pausado_en !== undefined) {
    return r.cronometro_pausado_en;
  }
  if (!r.inicio_cronometro_at) return 0;
  // Normaliza el formato antes de parsear: el backend manda
  // "YYYY-MM-DD HH:MM:SS" (sin T ni Z), pero por robustez aceptamos
  // también variantes que ya traigan "T" y/o zona horaria, en vez de
  // limitarnos a un único patrón y devolver silenciosamente 0 si no
  // encaja exactamente (que es lo que hacía que el reloj se quedase
  // pillado en el minuto 0 sin ningún aviso de error).
  let raw = String(r.inicio_cronometro_at).trim();
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(raw)) {
    raw = raw.includes("T") ? raw + "Z" : raw.replace(" ", "T") + "Z";
  }
  const inicio = new Date(raw).getTime();
  if (isNaN(inicio)) {
    console.error("minutoEnVivo: no se ha podido parsear inicio_cronometro_at =", r.inicio_cronometro_at);
    return 0;
  }
  // Si se ha corregido a mano el minuto mientras el cronómetro estaba
  // corriendo (ver mamEditarMinuto/ajustar_minuto en el backend), el
  // desplazamiento queda guardado en ajuste_cronometro_minutos y hay
  // que sumarlo aquí; si no, el reloj seguía mostrando el minuto de
  // antes de la corrección hasta que se reiniciaba el cronómetro.
  const ajuste = Number.isInteger(r.ajuste_cronometro_minutos) ? r.ajuste_cronometro_minutos : 0;
  const minutos = Math.floor((Date.now() - inicio) / 60000) + ajuste;
  return Math.max(0, minutos);
}

// Los navegadores limitan (throttle) los setInterval de las pestañas en
// segundo plano —normalmente a 1 vez por minuto, o incluso los pausan
// del todo—, para ahorrar batería/CPU. El cálculo de minutoEnVivo() en
// sí siempre es correcto porque se basa en Date.now() y no en contar
// ticks, así que el cronómetro real nunca se "para"; lo que sí ocurre es
// que la pantalla deja de refrescarse mientras la pestaña está en
// segundo plano, dando la sensación de que el minutero se ha quedado
// congelado. Para evitarlo: además del intervalo normal, escuchamos
// "visibilitychange" para repintar inmediatamente en cuanto la pestaña
// vuelve a primer plano (sin esperar al siguiente tick, que podría
// tardar hasta un minuto), y usamos requestAnimationFrame como apoyo
// para refrescar tan pronto el navegador vuelva a pintar con fluidez.
function iniciarTickCronometro() {
  if (MAM_TICK_INTERVAL) clearInterval(MAM_TICK_INTERVAL);
  actualizarRelojEnPantalla();
  MAM_TICK_INTERVAL = setInterval(actualizarRelojEnPantalla, 1000);
  document.addEventListener("visibilitychange", mamAlCambiarVisibilidad);
}

function mamAlCambiarVisibilidad() {
  if (document.visibilityState === "visible" && MAM_TICK_INTERVAL) {
    // Repinta al instante (no hace falta esperar al siguiente tick del
    // setInterval) y reinicia el intervalo para que vuelva a marcar cada
    // segundo con normalidad ahora que la pestaña está en primer plano.
    actualizarRelojEnPantalla();
    clearInterval(MAM_TICK_INTERVAL);
    MAM_TICK_INTERVAL = setInterval(actualizarRelojEnPantalla, 1000);
  }
}

const MAM_MINUTO_DESCANSO_DISPONIBLE = 40;

function actualizarRelojEnPantalla() {
  const el = document.getElementById("mamReloj");
  if (!el || !MAM_RESULTADO) return;
  const corriendo = MAM_RESULTADO.inicio_cronometro_at && (MAM_RESULTADO.cronometro_pausado_en === null || MAM_RESULTADO.cronometro_pausado_en === undefined);
  const minuto = minutoEnVivo();
  el.textContent = `${minuto}'`;
  el.classList.toggle("mam-reloj-corriendo", Boolean(corriendo));
  // El botón de "Descanso" pasa de deshabilitado a habilitado justo al
  // llegar al minuto 40, sin esperar a que se repinte la botonera por
  // otro motivo (p.ej. al registrar un evento).
  const btnDescanso = document.querySelector(".mam-boton-descanso");
  if (btnDescanso && corriendo) {
    const yaDisponible = minuto >= MAM_MINUTO_DESCANSO_DISPONIBLE;
    if (yaDisponible === btnDescanso.disabled) renderBotoneraMinutoAMinuto();
  }
}

async function mamIniciarPartido() {
  try {
    // Si el cron ya había arrancado el partido solo al llegar su hora
    // (inicio_cronometro_at ya venía relleno), no hace falta volver a
    // registrar el evento "Comienza el partido": ya existe. El backend
    // también está protegido contra el duplicado (ver POST /eventos),
    // pero se evita aquí además la llamada de red innecesaria.
    const yaEstabaEnMarcha = Boolean(MAM_RESULTADO?.inicio_cronometro_at);
    const { resultado } = await apiFetch(`/api/results/${MAM_RESULTADO.id}/cronometro`, { method: "POST", body: JSON.stringify({ accion: "iniciar" }) });
    if (resultado) MAM_RESULTADO = resultado;
    if (!yaEstabaEnMarcha) {
      await registrarEventoMinutoAMinuto("inicio_partido", null, { minutoForzado: 0 });
    } else {
      await recargarResultadoYEventos();
      renderBotoneraMinutoAMinuto();
    }
    actualizarCabeceraMinutoAMinuto();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

// Devuelven true/false según si la llamada al backend ha tenido éxito,
// para que quien las llama (mamPitarDescanso, mamComenzarSegundaParte,
// mamPitarFinal) pueda abortar y no registrar un evento "descanso" /
// "fin_descanso" / "fin_partido" si el cronómetro no se ha podido
// pausar o reanudar de verdad en el servidor (si no, el panel y la
// base de datos quedarían desincronizados: el evento se vería en el
// timeline pero el cronómetro seguiría corriendo, o viceversa).
async function mamPausarCronometro(minuto) {
  // Defensa: si el panel se ha cerrado (MAM_RESULTADO a null) entre que
  // se pulsó el botón y que se ejecuta esto (p.ej. tras esperar a un
  // EOF.confirmar()), no tiene sentido seguir ni tiene sentido el error
  // técnico "Cannot read properties of null" en el toast.
  if (!MAM_RESULTADO) {
    EOF.toast("El panel de Minuto a Minuto se ha cerrado. Ábrelo de nuevo para continuar.", "error");
    return false;
  }
  try {
    const { resultado } = await apiFetch(`/api/results/${MAM_RESULTADO.id}/cronometro`, { method: "POST", body: JSON.stringify({ accion: "pausar", minuto }) });
    if (resultado) MAM_RESULTADO = resultado;
    actualizarRelojEnPantalla();
    return true;
  } catch (err) {
    EOF.toast("Error al pausar el cronómetro: " + err.message, "error");
    return false;
  }
}

// "Reanudar" (p.ej. tras el descanso) retoma el cronómetro desde el
// minuto en que estaba pausado, en vez de reiniciar a 0: se le pasa al
// backend cuántos minutos ya jugados hay que respetar.
async function mamReanudarCronometro(minutoInicial) {
  if (!MAM_RESULTADO) {
    EOF.toast("El panel de Minuto a Minuto se ha cerrado. Ábrelo de nuevo para continuar.", "error");
    return false;
  }
  try {
    const { resultado } = await apiFetch(`/api/results/${MAM_RESULTADO.id}/cronometro`, { method: "POST", body: JSON.stringify({ accion: "iniciar", minuto_inicial: minutoInicial }) });
    if (resultado) MAM_RESULTADO = resultado;
    actualizarRelojEnPantalla();
    return true;
  } catch (err) {
    EOF.toast("Error al reanudar el cronómetro: " + err.message, "error");
    return false;
  }
}

// Permite corregir a mano el minuto que marca el cronómetro AHORA MISMO
// (no el minuto de un evento concreto, que ya era editable en su propio
// mini-formulario). Útil si el reloj se ha desviado de la realidad del
// partido. Se pide confirmación con el minuto actual precargado.
async function mamEditarMinuto() {
  if (!MAM_RESULTADO) return;
  if (!MAM_RESULTADO.inicio_cronometro_at) {
    return EOF.toast("El cronómetro todavía no se ha iniciado.", "error");
  }
  const actual = minutoEnVivo();
  const texto = await EOF.preguntar("Corregir el minuto del cronómetro a:", String(actual), { placeholder: "Ej. 23" });
  if (texto === null) return; // cancelado
  const minuto = parseInt(texto, 10);
  if (isNaN(minuto) || minuto < 0 || minuto > 130) {
    return EOF.toast("El minuto debe ser un número entre 0 y 130.", "error");
  }
  try {
    const { resultado } = await apiFetch(`/api/results/${MAM_RESULTADO.id}/cronometro`, {
      method: "POST",
      // "referencia_at" es el instante (ISO) en que efectivamente
      // corre "minutoEnVivo()" pedido arriba, no el momento en que se
      // envía la petición: entre precargar el prompt y que el usuario
      // confirme (piensa el minuto, escribe, revisa...) pueden pasar
      // varios segundos, y sin esto el servidor recalculaba
      // "minutosTranscurridos" con la hora de llegada de la petición,
      // ya más tardía, restando de más el ajuste (el típico "-2" al
      // corregir). Al mandar el instante real de referencia, el
      // servidor calcula el desplazamiento sobre ESE momento exacto.
      body: JSON.stringify({ accion: "ajustar_minuto", minuto, referencia_at: new Date().toISOString() }),
    });
    if (resultado) MAM_RESULTADO = resultado;
    actualizarRelojEnPantalla();
    EOF.toast(`Minuto corregido a ${minuto}'`, "exito");
  } catch (err) {
    EOF.toast("Error al corregir el minuto: " + err.message, "error");
  }
}

// ---------- Pausa de hidratación ----------
// Reutiliza el mismo mecanismo que el descanso (pausar/reanudar el
// cronómetro), pero con su propio tipo de evento para distinguirla en
// el timeline de un descanso real. El minuto que se guarda es el minuto
// en vivo real (a diferencia del descanso, que siempre fuerza el 45,
// una pausa de hidratación puede pitarse en cualquier momento del
// partido).
async function mamPitarPausaHidratacion() {
  if (!MAM_RESULTADO) return;
  const minuto = minutoEnVivo();
  const ok = await mamPausarCronometro(minuto);
  if (!ok) return;
  await registrarEventoMinutoAMinuto("pausa_hidratacion", null, { minutoForzado: minuto });
  renderBotoneraMinutoAMinuto();
}

async function mamReanudarTrasHidratacion() {
  const minutoPausado = MAM_RESULTADO.cronometro_pausado_en ?? minutoEnVivo();
  const ok = await mamReanudarCronometro(minutoPausado);
  if (!ok) return;
  await registrarEventoMinutoAMinuto("fin_pausa_hidratacion", null, { minutoForzado: minutoPausado });
  renderBotoneraMinutoAMinuto();
}

// ---------- Partido retrasado / anulado ----------
// "Retrasado": pide la nueva hora y la manda junto con el evento; el
// backend cambia el estado a "retrasado" (el cronómetro NO arranca:
// sigue "programado" a todos los efectos hasta la nueva hora, y el cron
// que arranca partidos por hora programada solo mira fecha_partido, así
// que si aquí se quisiera que arrancase solo a la nueva hora habría que
// editar el partido con esa fecha desde "Editar" — este botón dentro
// del panel MAM se limita a avisar/registrar el retraso).
async function mamMarcarRetrasado() {
  if (!MAM_RESULTADO) return;
  const actual = MAM_RESULTADO.fecha_partido ? MAM_RESULTADO.fecha_partido.slice(11, 16) : "";
  const nuevaHora = await EOF.preguntar("Nueva hora prevista de inicio (HH:MM):", actual, { placeholder: "Ej. 17:30" });
  if (nuevaHora === null) return; // cancelado
  if (!/^\d{1,2}:\d{2}$/.test(nuevaHora.trim())) {
    return EOF.toast("Formato de hora no válido. Usa HH:MM (ej. 17:30).", "error");
  }
  const fecha = MAM_RESULTADO.fecha_partido ? MAM_RESULTADO.fecha_partido.slice(0, 10) : "";
  const fechaPartidoRetrasado = fecha ? `${fecha}T${nuevaHora.trim().padStart(5, "0")}` : null;
  try {
    await apiFetch(`/api/results/${MAM_RESULTADO.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...cuerpoResultadoActualParaPut(), estado: "retrasado", fecha_partido_retrasado: fechaPartidoRetrasado }),
    });
    await registrarEventoMinutoAMinuto("partido_retrasado", null, { minutoForzado: 0 });
    if (MAM_RESULTADO) MAM_RESULTADO.estado = "retrasado";
    renderBotoneraMinutoAMinuto();
    EOF.toast(`Partido marcado como retrasado a las ${nuevaHora.trim()}`, "exito");
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

async function mamMarcarAnulado() {
  if (!MAM_RESULTADO) return;
  if (!(await EOF.confirmar("¿Anular este partido? Se marcará como \"Anulado\" y el cronómetro se detendrá.", { peligroso: true, textoConfirmar: "Anular" }))) return;
  const minuto = minutoEnVivo();
  try {
    await mamPausarCronometro(minuto);
    await registrarEventoMinutoAMinuto("partido_anulado", null, { minutoForzado: minuto });
    if (MAM_RESULTADO) MAM_RESULTADO.estado = "anulado";
    renderBotoneraMinutoAMinuto();
    EOF.toast("Partido marcado como anulado", "exito");
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

// Reconstruye el cuerpo mínimo que espera PUT /api/results/:id a partir
// del resultado que ya tenemos en memoria, para no perder el resto de
// campos (equipos, competición...) al mandar solo el cambio de estado
// desde el panel MAM.
function cuerpoResultadoActualParaPut() {
  const r = MAM_RESULTADO;
  return {
    competicion: r.competicion, grupo: r.grupo, jornada: r.jornada,
    equipo_local: r.equipo_local, equipo_visitante: r.equipo_visitante,
    goles_local: r.goles_local, goles_visitante: r.goles_visitante,
    penaltis_local: r.penaltis_local, penaltis_visitante: r.penaltis_visitante,
    fecha_partido: r.fecha_partido, ubicacion: r.ubicacion,
    flashscore_url: r.flashscore_url,
    escudo_local_url: r.escudo_local_url, escudo_visitante_url: r.escudo_visitante_url,
  };
}

// ---------- Eventos ----------
async function recargarEventosMinutoAMinuto() {
  const cont = document.getElementById("mamTimeline");
  try {
    const { eventos = [] } = await apiFetch(`/api/results/${MAM_RESULTADO.id}/eventos`);
    MAM_EVENTOS = eventos;
    renderTimelineMinutoAMinuto();
    actualizarCabeceraMinutoAMinuto();
    if (document.getElementById("mamModalTanda")?.classList.contains("mam-abierto")) {
      renderTandaPenaltisMAM();
    }
  } catch (err) {
    if (cont) cont.innerHTML = `<p class="mam-sin-eventos">Error cargando eventos: ${err.message}</p>`;
  }
}

// Registra un evento con el minuto actual del cronómetro (o el forzado,
// para "inicio_partido" que siempre es el minuto 0). Tras guardarlo,
// recarga el marcador (el backend ya recalcula goles_local/visitante
// automáticamente si el tipo es "gol") y el timeline.
async function registrarEventoMinutoAMinuto(tipo, equipo, opciones = {}) {
  if (!MAM_RESULTADO) return;
  const minuto = opciones.minutoForzado ?? minutoEnVivo();
  const body = {
    tipo,
    equipo: MAM_TIPOS_SIN_EQUIPO.includes(tipo) ? "local" /* ignorado por el backend para estos tipos */ : equipo,
    minuto,
    minuto_extra: opciones.minutoExtraForzado ?? null,
    jugador: opciones.jugador || null,
    jugador_sale: opciones.jugadorSale || null,
    jugador_asistencia: opciones.jugadorAsistencia || null,
    // Solo aplica a "gol_var": si el redactor marcó "Bajar 1 gol al
    // marcador", el backend resta un gol al equipo de este evento. Si
    // no, el gol anulado se registra en el timeline sin tocar el
    // marcador (porque nunca llegó a sumar).
    bajar_gol: opciones.bajarGol === true,
    // Permite forzar el desempate dentro de un mismo minuto/minuto_extra
    // (ver ORDER BY minuto, minuto_extra, orden en el backend). Se usa,
    // por ejemplo, para que "Comienza la 2ª parte" quede siempre después
    // de "Descanso" aunque ambos compartan el mismo "45+X'".
    orden: opciones.orden ?? 0,
  };
  try {
    await apiFetch(`/api/results/${MAM_RESULTADO.id}/eventos`, { method: "POST", body: JSON.stringify(body) });
    await recargarResultadoYEventos();
    renderBotoneraMinutoAMinuto();
    EOF.toast(`${MAM_ETIQUETAS[tipo] || tipo} registrado (${minuto}')`, "exito");
  } catch (err) {
    EOF.toast("Error registrando el evento: " + err.message, "error");
  }
}

async function recargarResultadoYEventos() {
  try {
    // Se pide el resultado directamente por id (en vez de buscarlo dentro
    // de la lista general con "?limit=200"): esa lista tiene su propio
    // orden/límite en el backend y, si el partido quedaba fuera, aquí se
    // silenciaba el fallo y el panel se quedaba con los datos ANTERIORES
    // en memoria (por ejemplo sin inicio_cronometro_at recién guardado),
    // así que el cronómetro no arrancaba a contar aunque el backend ya
    // tuviera el cronómetro corriendo.
    const { resultado } = await apiFetch(`/api/results/${MAM_RESULTADO.id}`);
    if (resultado) MAM_RESULTADO = resultado;
  } catch { /* si falla, seguimos con los datos que ya teníamos en memoria */ }
  await recargarEventosMinutoAMinuto();
}

async function mamEliminarEvento(eventoId) {
  if (!(await EOF.confirmar("¿Eliminar este evento del minuto a minuto?", { peligroso: true, textoConfirmar: "Eliminar" }))) return;
  try {
    await apiFetch(`/api/results/${MAM_RESULTADO.id}/eventos/${eventoId}`, { method: "DELETE" });
    await recargarResultadoYEventos();
    renderBotoneraMinutoAMinuto();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

// ---------- Botones que necesitan un pequeño formulario (gol con
// jugador, tarjeta con jugador, cambio con quién entra/sale) ----------
// Id del evento que se está editando (null si el formulario se abrió
// para crear uno nuevo). Cuando hay un id, mamGuardarFormularioEvento
// hace PUT contra el evento existente en vez de crear uno nuevo, para
// poder corregir minuto/jugador/etc. de eventos que ya se registraron
// (por ejemplo si al pulsar el botón se picó algo mal), sin tener que
// borrar el evento y volver a crearlo desde cero.
let MAM_EVENTO_EDITANDO_ID = null;
// Orden original del evento que se está editando (0 si no se está
// editando ninguno o si el evento no lo llevaba). Se guarda aparte del
// formulario visible porque no tiene un input propio: solo se usa para
// que corregir un evento no le haga perder su posición de desempate
// dentro del mismo minuto (ver mamComenzarSegundaParte).
let MAM_EVENTO_EDITANDO_ORDEN = 0;

function mamAbrirFormularioEvento(tipo, equipo) {
  MAM_EVENTO_EDITANDO_ID = null;
  MAM_EVENTO_EDITANDO_ORDEN = 0;
  const esCambio = tipo === "cambio";
  const esGol = tipo === "gol" || tipo === "gol_var" || tipo === "gol_pp";
  const esGolVar = tipo === "gol_var";
  const esGolPP = tipo === "gol_pp";
  // La asistencia solo tiene sentido para un gol a favor; en propia
  // puerta no hay asistencia posible.
  const esGolConAsistencia = tipo === "gol" || tipo === "gol_var";
  document.getElementById("mamFormTipo").value = tipo;
  document.getElementById("mamFormEquipo").value = equipo || "";
  document.getElementById("mamFormTitulo").textContent = `${MAM_ETIQUETAS[tipo] || tipo}${equipo ? " — " + (equipo === "local" ? MAM_RESULTADO.equipo_local : MAM_RESULTADO.equipo_visitante) : ""}`;
  document.getElementById("mamFormMinuto").value = minutoEnVivo();
  document.getElementById("mamFormMinutoExtra").value = "";
  document.getElementById("mamFormDorsal").value = "";
  document.getElementById("mamFormJugador").value = "";
  document.getElementById("mamFormDorsalSale").value = "";
  document.getElementById("mamFormJugadorSale").value = "";
  document.getElementById("mamFormAsistencia").value = "";
  document.getElementById("mamFilaJugadorSale").style.display = esCambio ? "flex" : "none";
  document.getElementById("mamFilaAsistencia").style.display = esGolConAsistencia ? "flex" : "none";
  document.getElementById("mamFormJugador").placeholder = esCambio ? "Jugador que entra (opcional)" : "Nombre del jugador (opcional)";
  // En "Gol en propia puerta" el jugador que se elige es el del equipo
  // que se lo mete en su propia portería: se aclara con una nota, para
  // que no se confunda con un gol a favor de ese equipo (el marcador
  // sumará al rival).
  document.getElementById("mamFilaAyudaGolPP").style.display = esGolPP ? "block" : "none";
  // Solo en "Gol anulado (VAR)" se ofrece la opción de bajar el
  // marcador: si el gol ya se había pitado y sumado antes de que el VAR
  // lo revisara, hay que restarlo; si se registra directamente sin que
  // llegara a sumar (p.ej. el árbitro ni lo da por bueno hasta que pasa
  // la revisión), no hay nada que bajar. Se deja sin marcar por
  // defecto: el redactor decide caso por caso.
  document.getElementById("mamFilaBajarGol").style.display = esGolVar ? "flex" : "none";
  document.getElementById("mamFormBajarGol").checked = false;
  document.querySelector("#mamFormEvento .btn-primari").textContent = "Guardar";
  document.getElementById("mamModalEvento").classList.add("mam-abierto");
}

// Abre el mismo modal que mamAbrirFormularioEvento pero precargado con
// los datos de un evento ya existente (ev, tal cual llega de la API),
// para poder corregirlo. Se usa tanto desde el botón "editar" del
// timeline normal como desde el de la tanda de penaltis.
function mamAbrirFormularioEdicionEvento(ev) {
  if (!ev) return;
  MAM_EVENTO_EDITANDO_ID = ev.id;
  MAM_EVENTO_EDITANDO_ORDEN = ev.orden ?? 0;
  const tipo = ev.tipo;
  const esCambio = tipo === "cambio";
  const esGol = tipo === "gol" || tipo === "gol_var" || tipo === "gol_pp";
  const esGolVar = tipo === "gol_var";
  const esGolPP = tipo === "gol_pp";
  const esGolConAsistencia = tipo === "gol" || tipo === "gol_var";
  const sinEquipo = MAM_TIPOS_SIN_EQUIPO.includes(tipo);
  document.getElementById("mamFormTipo").value = tipo;
  document.getElementById("mamFormEquipo").value = sinEquipo ? "" : (ev.equipo || "");
  document.getElementById("mamFormTitulo").textContent = `Editar: ${MAM_ETIQUETAS[tipo] || tipo}${!sinEquipo && ev.equipo ? " — " + (ev.equipo === "local" ? MAM_RESULTADO.equipo_local : MAM_RESULTADO.equipo_visitante) : ""}`;
  document.getElementById("mamFormMinuto").value = ev.minuto ?? 0;
  document.getElementById("mamFormMinutoExtra").value = ev.minuto_extra ?? "";
  const { dorsal, nombre } = separarDorsalYJugadorMAM(esCambio ? null : ev.jugador);
  document.getElementById("mamFormDorsal").value = esCambio ? "" : dorsal;
  document.getElementById("mamFormJugador").value = esCambio ? (ev.jugador || "") : nombre;
  const { dorsal: dorsalSale, nombre: nombreSale } = separarDorsalYJugadorMAM(esCambio ? ev.jugador_sale : null);
  document.getElementById("mamFormDorsalSale").value = dorsalSale;
  document.getElementById("mamFormJugadorSale").value = esCambio ? (ev.jugador_sale || "") : nombreSale;
  document.getElementById("mamFormAsistencia").value = ev.jugador_asistencia || "";
  document.getElementById("mamFilaJugadorSale").style.display = esCambio ? "flex" : "none";
  document.getElementById("mamFilaAsistencia").style.display = esGolConAsistencia ? "flex" : "none";
  document.getElementById("mamFormJugador").placeholder = esCambio ? "Jugador que entra (opcional)" : "Nombre del jugador (opcional)";
  document.getElementById("mamFilaAyudaGolPP").style.display = esGolPP ? "block" : "none";
  document.getElementById("mamFilaBajarGol").style.display = esGolVar ? "flex" : "none";
  document.getElementById("mamFormBajarGol").checked = !!ev.bajar_gol;
  document.querySelector("#mamFormEvento .btn-primari").textContent = "Guardar cambios";
  document.getElementById("mamModalEvento").classList.add("mam-abierto");
}

// Busca el evento por id dentro de MAM_EVENTOS (la caché ya cargada del
// timeline) y abre el formulario de edición con sus datos. Se usa desde
// el botón "✎" de cada fila del timeline en vez de pasar el evento
// entero por el atributo onclick, para no tener que escapar comillas ni
// HTML dentro de un atributo inline.
function mamAbrirFormularioEdicionEventoPorId(eventoId) {
  const ev = MAM_EVENTOS.find((e) => e.id === eventoId);
  if (!ev) return EOF.toast("No se ha encontrado el evento", "error");
  mamAbrirFormularioEdicionEvento(ev);
}

// Igual que separarDorsalYJugador (admin.js), duplicada aquí en pequeño
// para no depender de que admin.js esté cargado antes que este fichero:
// separa el texto guardado en "jugador" en {dorsal, nombre} para poder
// repoblar los dos inputs del formulario al editar.
function separarDorsalYJugadorMAM(jugador) {
  if (!jugador) return { dorsal: "", nombre: "" };
  const partes = jugador.split(" · ");
  if (partes.length === 2) return { dorsal: partes[0], nombre: partes[1] };
  return /^\d+$/.test(jugador.trim()) ? { dorsal: jugador.trim(), nombre: "" } : { dorsal: "", nombre: jugador };
}

function mamCerrarFormularioEvento() {
  MAM_EVENTO_EDITANDO_ID = null;
  MAM_EVENTO_EDITANDO_ORDEN = 0;
  document.getElementById("mamModalEvento")?.classList.remove("mam-abierto");
}

async function mamGuardarFormularioEvento(e) {
  e.preventDefault();
  const tipo = document.getElementById("mamFormTipo").value;
  const equipo = document.getElementById("mamFormEquipo").value || null;
  const minuto = parseInt(document.getElementById("mamFormMinuto").value, 10);
  if (isNaN(minuto)) return EOF.toast("Falta el minuto", "error");
  const minutoExtraTexto = document.getElementById("mamFormMinutoExtra").value;
  const minutoExtra = minutoExtraTexto.trim() === "" ? null : parseInt(minutoExtraTexto, 10);
  const jugador = combinarDorsalYJugador(document.getElementById("mamFormDorsal").value, document.getElementById("mamFormJugador").value);
  const jugadorSale = tipo === "cambio"
    ? combinarDorsalYJugador(document.getElementById("mamFormDorsalSale").value, document.getElementById("mamFormJugadorSale").value)
    : null;
  const jugadorAsistencia = (tipo === "gol" || tipo === "gol_var")
    ? (document.getElementById("mamFormAsistencia").value.trim() || null)
    : null;
  // Solo relevante para "gol_var": si estaba marcado, el backend resta 1
  // gol al marcador del equipo; si no, el evento se registra sin tocar
  // el marcador (ver recalcularMarcadorDesdeEventos en el worker).
  const bajarGol = tipo === "gol_var" ? document.getElementById("mamFormBajarGol").checked : false;
  const eventoIdEditando = MAM_EVENTO_EDITANDO_ID;
  const ordenEditando = MAM_EVENTO_EDITANDO_ORDEN;
  mamCerrarFormularioEvento();
  if (eventoIdEditando) {
    await mamActualizarEvento(eventoIdEditando, tipo, equipo, {
      minutoForzado: minuto, minutoExtraForzado: minutoExtra, jugador, jugadorSale, jugadorAsistencia, bajarGol, orden: ordenEditando,
    });
  } else {
    await registrarEventoMinutoAMinuto(tipo, equipo, { minutoForzado: minuto, minutoExtraForzado: minutoExtra, jugador, jugadorSale, jugadorAsistencia, bajarGol });
  }
}

// Igual que registrarEventoMinutoAMinuto pero hace PUT sobre un evento
// que ya existe, para poder corregirlo (minuto, jugador, tipo...) sin
// tener que borrarlo y crear uno nuevo, que perdería su posición
// original en el timeline.
async function mamActualizarEvento(eventoId, tipo, equipo, opciones = {}) {
  if (!MAM_RESULTADO) return;
  const minuto = opciones.minutoForzado ?? minutoEnVivo();
  const body = {
    tipo,
    equipo: MAM_TIPOS_SIN_EQUIPO.includes(tipo) ? "local" : equipo,
    minuto,
    minuto_extra: opciones.minutoExtraForzado ?? null,
    jugador: opciones.jugador || null,
    jugador_sale: opciones.jugadorSale || null,
    jugador_asistencia: opciones.jugadorAsistencia || null,
    bajar_gol: opciones.bajarGol === true,
    // Se conserva el "orden" que ya tuviera el evento (p.ej. el 1 que
    // fuerza "fin_descanso" para quedar detrás de "descanso" en el
    // timeline), para que corregir un evento no le haga perder su
    // posición relativa dentro del mismo minuto.
    orden: opciones.orden ?? 0,
  };
  try {
    await apiFetch(`/api/results/${MAM_RESULTADO.id}/eventos/${eventoId}`, { method: "PUT", body: JSON.stringify(body) });
    await recargarResultadoYEventos();
    renderBotoneraMinutoAMinuto();
    EOF.toast(`${MAM_ETIQUETAS[tipo] || tipo} actualizado (${minuto}')`, "exito");
  } catch (err) {
    EOF.toast("Error actualizando el evento: " + err.message, "error");
  }
}

// ---------- Pintado del panel ----------
function renderPanelMinutoAMinuto() {
  const r = MAM_RESULTADO;
  const cont = document.getElementById("panelMinutoAMinuto");
  cont.innerHTML = `
    <div class="mam-overlay">
      <div class="mam-cabecera">
        <button type="button" class="mam-cerrar" id="mamBotonCerrar" onclick="cerrarPanelMinutoAMinuto()" aria-label="Cerrar panel">✕</button>
        <div class="mam-cabecera-partido">
          <div class="mam-equipo">
            <img src="${escudoUrlAdmin(r.equipo_local, r.escudo_local_url)}" alt="" onerror="this.src='${ESCUDO_GENERICO_ADMIN}';this.onerror=null;">
            <span>${escapeHtml(r.equipo_local)}</span>
          </div>
          <div class="mam-marcador-central">
            <span id="mamMarcador">${r.goles_local ?? 0} - ${r.goles_visitante ?? 0}</span>
            <span id="mamReloj" class="mam-reloj" title="Toca para corregir el minuto" onclick="mamEditarMinuto()">0'</span>
          </div>
          <div class="mam-equipo">
            <img src="${escudoUrlAdmin(r.equipo_visitante, r.escudo_visitante_url)}" alt="" onerror="this.src='${ESCUDO_GENERICO_ADMIN}';this.onerror=null;">
            <span>${escapeHtml(r.equipo_visitante)}</span>
          </div>
        </div>
        <div class="mam-cabecera-controles" id="mamControlesCronometro"></div>
      </div>

      <div class="mam-cuerpo">
        <div class="mam-botonera" id="mamBotonera"></div>
        <div class="mam-timeline-wrap">
          <h4>Minuto a minuto</h4>
          <div class="mam-timeline" id="mamTimeline"><p class="mam-sin-eventos">Cargando...</p></div>
        </div>
      </div>

      <div class="mam-modal-overlay" id="mamModalEvento" onclick="if(event.target===this) mamCerrarFormularioEvento()">
      <div class="mam-modal-caja">
        <h4 id="mamFormTitulo">Evento</h4>
        <form id="mamFormEvento" onsubmit="mamGuardarFormularioEvento(event)">
          <input type="hidden" id="mamFormTipo">
          <input type="hidden" id="mamFormEquipo">
          <div class="mam-fila-jugador">
            <div>
              <label>Minuto *</label>
              <input type="number" id="mamFormMinuto" min="0" max="130" required>
            </div>
            <div>
              <label>Añadido</label>
              <input type="number" id="mamFormMinutoExtra" min="0" max="15" placeholder="Ej. 2">
            </div>
          </div>
          <div class="mam-fila-jugador">
            <div>
              <label>Dorsal</label>
              <input type="text" id="mamFormDorsal" inputmode="numeric" placeholder="9">
            </div>
            <div>
              <label id="mamFormLabelJugador">Jugador</label>
              <input type="text" id="mamFormJugador" placeholder="Nombre (opcional)">
            </div>
          </div>
          <div class="mam-fila-jugador" id="mamFilaJugadorSale" style="display:none">
            <div>
              <label>Dorsal (sale)</label>
              <input type="text" id="mamFormDorsalSale" inputmode="numeric" placeholder="14">
            </div>
            <div>
              <label>Jugador que sale</label>
              <input type="text" id="mamFormJugadorSale" placeholder="Nombre (opcional)">
            </div>
          </div>
          <div class="mam-fila-jugador" id="mamFilaAsistencia" style="display:none">
            <div style="flex:1">
              <label>Asistencia</label>
              <input type="text" id="mamFormAsistencia" placeholder="Jugador que da la asistencia (opcional)">
            </div>
          </div>
          <p class="mam-ayuda-golpp" id="mamFilaAyudaGolPP" style="display:none">El jugador indicado arriba es el de este equipo que se lo mete en su propia portería: el gol sumará en el marcador al equipo contrario.</p>
          <div class="mam-fila-checkbox" id="mamFilaBajarGol" style="display:none">
            <label class="mam-checkbox-label">
              <input type="checkbox" id="mamFormBajarGol">
              Bajar 1 gol al marcador (el gol ya se había contado antes de anularse)
            </label>
          </div>
          <div class="mam-form-acciones">
            <button type="submit" class="btn-primari">Guardar</button>
            <button type="button" class="btn-secundari" onclick="mamCerrarFormularioEvento()">Cancelar</button>
          </div>
        </form>
      </div>
    </div>

      <div class="mam-modal-overlay" id="mamModalTanda" onclick="if(event.target===this) mamCerrarTandaPenaltis()">
      <div class="mam-modal-caja">
        <div class="mam-tanda-cabecera">
          <h4>🥅⚽ Tanda de penaltis</h4>
          <span id="mamTandaMarcador" class="mam-tanda-marcador-titulo">0 - 0</span>
        </div>
        <div class="mam-tanda-cuerpo">
          <div class="mam-timeline" id="mamListaTanda"><p class="mam-sin-eventos">Cargando...</p></div>
          <form id="mamFormTanda" onsubmit="mamGuardarTanda(event)">
            <input type="hidden" id="mamTandaId">
            <div class="mam-tanda-form-caja">
              <div class="mam-fila-jugador">
                <div>
                  <label>Equipo que tira</label>
                  <select id="mamTandaEquipo">
                    <option value="local">Local</option>
                    <option value="visitante">Visitante</option>
                  </select>
                </div>
                <div>
                  <label>Resultado</label>
                  <select id="mamTandaResultado">
                    <option value="penalti_marcado">Marcado</option>
                    <option value="penalti_fallado_tanda">Fallado / parado</option>
                  </select>
                </div>
              </div>
              <div class="mam-fila-jugador">
                <div>
                  <label>Nº de lanzamiento *</label>
                  <input type="number" id="mamTandaOrden" min="1" max="30" required>
                </div>
              </div>
              <div class="mam-fila-jugador">
                <div>
                  <label>Dorsal</label>
                  <input type="text" id="mamTandaDorsal" inputmode="numeric" placeholder="9">
                </div>
                <div>
                  <label>Jugador</label>
                  <input type="text" id="mamTandaJugador" placeholder="Nombre (opcional)">
                </div>
              </div>
            </div>
            <div class="mam-form-acciones">
              <button type="submit" class="btn-primari">Añadir lanzamiento</button>
              <button type="button" class="btn-secundari" onclick="mamCerrarTandaPenaltis()">Cerrar</button>
            </div>
          </form>
        </div>
      </div>
    </div>
    </div>`;
  renderBotoneraMinutoAMinuto();
  actualizarCabeceraMinutoAMinuto();
}

// La botonera cambia según el estado del partido/cronómetro:
//  - Anulado: panel de solo lectura, con aviso (no se puede reanudar).
//  - Finalizado: panel de solo lectura (sin botones), con aviso.
//  - Todavía no iniciado (programado o retrasado): "Iniciar partido" +
//    (si no está ya retrasado) el botón de marcarlo como tal.
//  - En descanso: solo "Comienza la 2ª parte".
//  - En pausa de hidratación: solo "Se reanuda el partido".
//  - En juego: todos los botones de eventos + Descanso/Hidratación/
//    Retrasado(no aplica)/Anulado/Final.
function renderBotoneraMinutoAMinuto() {
  const cont = document.getElementById("mamBotonera");
  const r = MAM_RESULTADO;
  const finalizado = r.estado === "finalizado" || MAM_EVENTOS.some((ev) => ev.tipo === "fin_partido");
  const anulado = r.estado === "anulado";
  // Se usa el cronómetro (fuente de verdad en el servidor) para saber si
  // estamos en una pausa, en vez de mirar el último evento del array:
  // los eventos se ordenan por minuto (no por orden de inserción), así
  // que si se corrige a mano un evento con un minuto anterior al de la
  // pausa, "el último evento" dejaría de ser esa pausa aunque el
  // partido siga parado, y la botonera mostraría por error los botones
  // de "en juego" en pleno descanso/hidratación.
  const enPausa = !finalizado && !anulado && (r.cronometro_pausado_en !== null && r.cronometro_pausado_en !== undefined);
  // Para saber si la pausa activa es un descanso o una pausa de
  // hidratación, se mira cuál de los dos eventos de inicio de pausa es
  // el más reciente sin su correspondiente evento de reanudación —más
  // fiable que comparar contra el minuto fijo 45, ya que la pausa de
  // hidratación puede pitarse en cualquier minuto.
  const ultimaPausaDescanso = [...MAM_EVENTOS].reverse().find((ev) => ev.tipo === "descanso" || ev.tipo === "fin_descanso");
  const esPausaHidratacion = enPausa && !(ultimaPausaDescanso && ultimaPausaDescanso.tipo === "descanso");

  if (anulado) {
    cont.innerHTML = `<p class="mam-finalizado-aviso">Este partido está marcado como anulado.</p>`;
    return;
  }

  if (finalizado) {
    const mvpTexto = r.mvp_jugador
      ? `MVP actual: <b>${escapeHtml(r.mvp_jugador)}</b> (${r.mvp_equipo === "local" ? escapeHtml(r.equipo_local) : escapeHtml(r.equipo_visitante)})`
      : "Todavía no se ha marcado ningún MVP.";
    cont.innerHTML = `
      <p class="mam-finalizado-aviso">Este partido ya está marcado como finalizado. Si necesitas corregir algún gol o tarjeta, hazlo desde "Editar" en la lista de resultados.</p>
      <button type="button" class="mam-boton mam-boton-grande mam-boton-tanda-penaltis" onclick="mamAbrirTandaPenaltis()">🥅⚽<br>Tanda de penaltis</button>
      <p class="mam-finalizado-aviso" id="mamMvpTexto">${mvpTexto}</p>
      <button type="button" class="mam-boton mam-boton-grande mam-boton-mvp" onclick="mamMarcarMvp()">🏅<br>${r.mvp_jugador ? "Cambiar MVP" : "Marcar MVP"}</button>
      ${r.mvp_jugador ? `<button type="button" class="mam-boton mam-boton-anulado" onclick="mamQuitarMvp()">✕<br>Quitar MVP</button>` : ""}`;
    return;
  }

  if (!r.inicio_cronometro_at) {
    cont.innerHTML = `
      <button type="button" class="mam-boton mam-boton-grande mam-boton-iniciar" onclick="mamIniciarPartido()">▶<br>Iniciar partido</button>
      <button type="button" class="mam-boton mam-boton-retrasado" onclick="mamMarcarRetrasado()">🕒<br>Partido retrasado</button>
      <button type="button" class="mam-boton mam-boton-anulado" onclick="mamMarcarAnulado()">🚫<br>Anular partido</button>`;
    return;
  }

  if (enPausa) {
    cont.innerHTML = esPausaHidratacion
      ? `<button type="button" class="mam-boton mam-boton-grande mam-boton-iniciar" onclick="mamReanudarTrasHidratacion()">▶<br>Se reanuda el partido</button>`
      : `<button type="button" class="mam-boton mam-boton-grande mam-boton-iniciar" onclick="mamComenzarSegundaParte()">▶<br>Comienza la 2ª parte</button>`;
    return;
  }

  const local = escapeHtml(r.equipo_local);
  const visitante = escapeHtml(r.equipo_visitante);
  // El botón de "Descanso" solo tiene sentido a partir de que se acerca
  // el final de la 1ª parte: se habilita desde el minuto 40 en adelante,
  // para no permitir pitarlo por error a los 10 minutos de partido. La
  // pausa de hidratación, en cambio, puede pitarse en cualquier minuto.
  const puedeDescanso = minutoEnVivo() >= MAM_MINUTO_DESCANSO_DISPONIBLE;
  const botonDescanso = puedeDescanso
    ? `<button type="button" class="mam-boton mam-boton-descanso" onclick="mamPitarDescanso()">⏸<br>Descanso</button>`
    : `<button type="button" class="mam-boton mam-boton-descanso" disabled title="Disponible a partir del minuto ${MAM_MINUTO_DESCANSO_DISPONIBLE}">⏸<br>Descanso<br><small>(desde ${MAM_MINUTO_DESCANSO_DISPONIBLE}')</small></button>`;
  cont.innerHTML = `
    <div class="mam-columna-equipo">
      <h5>${local}</h5>
      <div class="mam-grid-botones">
        <button type="button" class="mam-boton mam-boton-gol" onclick="mamAbrirFormularioEvento('gol','local')">⚽<br>Gol</button>
        <button type="button" class="mam-boton mam-boton-golpp" onclick="mamAbrirFormularioEvento('gol_pp','local')">🥅<br>Gol en propia puerta</button>
        <button type="button" class="mam-boton mam-boton-amarilla" onclick="mamAbrirFormularioEvento('amarilla','local')">🟨<br>Amarilla</button>
        <button type="button" class="mam-boton mam-boton-doble" onclick="mamAbrirFormularioEvento('doble_amarilla','local')">🟨🟥<br>2ª amarilla</button>
        <button type="button" class="mam-boton mam-boton-roja" onclick="mamAbrirFormularioEvento('roja','local')">🟥<br>Roja</button>
        <button type="button" class="mam-boton mam-boton-cambio" onclick="mamAbrirFormularioEvento('cambio','local')">🔄<br>Cambio</button>
        <button type="button" class="mam-boton mam-boton-fallado" onclick="mamAbrirFormularioEvento('penalti_fallado','local')">❌<br>Penalti fallado</button>
        <button type="button" class="mam-boton mam-boton-golvar" onclick="mamAbrirFormularioEvento('gol_var','local')">🚫⚽<br>Gol anulado (VAR)</button>
      </div>
    </div>

    <div class="mam-columna-central">
      <button type="button" class="mam-boton mam-boton-var" onclick="mamAbrirFormularioEvento('var', null)">📺<br>VAR</button>
      <button type="button" class="mam-boton mam-boton-otro" onclick="mamAbrirFormularioEvento('otro', null)">✏️<br>Otra incidencia</button>
      ${botonDescanso}
      <button type="button" class="mam-boton mam-boton-hidratacion" onclick="mamPitarPausaHidratacion()">💧<br>Pausa de hidratación</button>
      <button type="button" class="mam-boton mam-boton-tanda-penaltis" onclick="mamAbrirTandaPenaltis()">🥅⚽<br>Tanda de penaltis</button>
      <button type="button" class="mam-boton mam-boton-anulado" onclick="mamMarcarAnulado()">🚫<br>Anular partido</button>
      <button type="button" class="mam-boton mam-boton-final" onclick="mamPitarFinal()">⏹<br>Final del partido</button>
    </div>

    <div class="mam-columna-equipo">
      <h5>${visitante}</h5>
      <div class="mam-grid-botones">
        <button type="button" class="mam-boton mam-boton-gol" onclick="mamAbrirFormularioEvento('gol','visitante')">⚽<br>Gol</button>
        <button type="button" class="mam-boton mam-boton-golpp" onclick="mamAbrirFormularioEvento('gol_pp','visitante')">🥅<br>Gol en propia puerta</button>
        <button type="button" class="mam-boton mam-boton-amarilla" onclick="mamAbrirFormularioEvento('amarilla','visitante')">🟨<br>Amarilla</button>
        <button type="button" class="mam-boton mam-boton-doble" onclick="mamAbrirFormularioEvento('doble_amarilla','visitante')">🟨🟥<br>2ª amarilla</button>
        <button type="button" class="mam-boton mam-boton-roja" onclick="mamAbrirFormularioEvento('roja','visitante')">🟥<br>Roja</button>
        <button type="button" class="mam-boton mam-boton-cambio" onclick="mamAbrirFormularioEvento('cambio','visitante')">🔄<br>Cambio</button>
        <button type="button" class="mam-boton mam-boton-fallado" onclick="mamAbrirFormularioEvento('penalti_fallado','visitante')">❌<br>Penalti fallado</button>
        <button type="button" class="mam-boton mam-boton-golvar" onclick="mamAbrirFormularioEvento('gol_var','visitante')">🚫⚽<br>Gol anulado (VAR)</button>
      </div>
    </div>`;
}

// Al pitar el descanso se pide (opcionalmente) el tiempo de añadido de
// la 1ª parte. El evento del timeline se sigue etiquetando SIEMPRE con
// el minuto reglamentario 45 (más el añadido si lo hay, como "45+2'"),
// independientemente del minuto real que marque el cronómetro en ese
// instante, para que se lea bien en el timeline. PERO el cronómetro en
// sí se pausa en 45+añadido (no siempre en 45 a secas): si no, un
// descanso con "+2" pausaba el reloj en el minuto 45 y la 2ª parte
// arrancaba también desde el 45, "pisando" el propio descanso -de ahí
// que "Se reanuda el partido" pareciera aparecer siempre en el 45,
// coincidiendo con el propio descanso en vez de con lo que de verdad se
// jugó de más-.
async function mamPitarDescanso() {
  const añadidoTexto = await EOF.preguntar("Minutos de tiempo añadido en la 1ª parte (déjalo en blanco si no hay):", "", { placeholder: "Ej. 2" });
  if (añadidoTexto === null) return; // cancelado
  const añadido = añadidoTexto.trim() === "" ? 0 : parseInt(añadidoTexto, 10);
  if (isNaN(añadido) || añadido < 0 || añadido > 15) {
    return EOF.toast("El tiempo añadido debe ser un número entre 0 y 15.", "error");
  }
  const minutoPausa = 45 + añadido;
  const ok = await mamPausarCronometro(minutoPausa);
  if (!ok) return; // si no se ha podido pausar en el servidor, no se registra el evento
  await registrarEventoMinutoAMinuto("descanso", null, {
    minutoForzado: 45,
    minutoExtraForzado: añadido > 0 ? añadido : null,
  });
  renderBotoneraMinutoAMinuto();
}

async function mamComenzarSegundaParte() {
  const minutoPausado = MAM_RESULTADO.cronometro_pausado_en ?? 45;
  const ok = await mamReanudarCronometro(minutoPausado);
  if (!ok) return;
  // El evento se etiqueta igual que el de "Descanso": minuto reglamentario
  // 45 + el tiempo añadido de la 1ª parte (si lo hubo), como "45+2'", en
  // vez del minuto real del cronómetro (p.ej. 47'), para que se lea bien
  // en el timeline y para que quede claro que la 2ª parte arranca justo
  // donde terminó el añadido de la 1ª. Se calcula restando 45 al minuto
  // en el que se pausó el cronómetro (que ya incluye ese añadido).
  const añadido = Math.max(0, minutoPausado - 45);
  // "orden" se fuerza a 1 (por encima del 0 por defecto que llevan el
  // resto de eventos, incluido "Descanso") para que, si por lo que sea
  // ambos comparten minuto y minuto_extra (caso normal: los dos llevan
  // "45+añadido"), el ORDER BY del backend (minuto, minuto_extra, orden)
  // deje siempre "Comienza la 2ª parte" después de "Descanso" en el
  // timeline, nunca antes ni mezclado.
  await registrarEventoMinutoAMinuto("fin_descanso", null, {
    minutoForzado: 45,
    minutoExtraForzado: añadido > 0 ? añadido : null,
    orden: 1,
  });
  renderBotoneraMinutoAMinuto();
}

async function mamPitarFinal() {
  const añadidoTexto = await EOF.preguntar("Minutos de tiempo añadido en la 2ª parte (déjalo en blanco si no hay):", "", { placeholder: "Ej. 4" });
  if (añadidoTexto === null) return; // cancelado
  const añadido = añadidoTexto.trim() === "" ? 0 : parseInt(añadidoTexto, 10);
  if (isNaN(añadido) || añadido < 0 || añadido > 15) {
    return EOF.toast("El tiempo añadido debe ser un número entre 0 y 15.", "error");
  }
  if (!(await EOF.confirmar("¿Dar el partido por finalizado? El resultado pasará a estado \"Finalizado\".", { textoConfirmar: "Finalizar" }))) return;
  if (!MAM_RESULTADO) {
    return EOF.toast("El panel de Minuto a Minuto se ha cerrado. Ábrelo de nuevo para continuar.", "error");
  }
  const minuto = minutoEnVivo();
  const ok = await mamPausarCronometro(minuto);
  if (!ok) return;
  await registrarEventoMinutoAMinuto("fin_partido", null, {
    minutoForzado: minuto,
    minutoExtraForzado: añadido > 0 ? añadido : null,
  });
  if (MAM_RESULTADO) MAM_RESULTADO.estado = "finalizado";
  renderBotoneraMinutoAMinuto();
}

// Marcar/cambiar el MVP (jugador destacado) directamente desde el panel
// de Minuto a Minuto, sin tener que salir a "Editar" el resultado. Solo
// se ofrece una vez el partido está finalizado (ver renderBotoneraMinutoAMinuto),
// aunque el endpoint del backend no lo exige. Usa el mismo endpoint
// ligero PUT /api/results/:id/mvp que el panel normal de edición.
async function mamMarcarMvp() {
  if (!MAM_RESULTADO) return;
  const equipo = await EOF.preguntar(
    `¿De qué equipo es el MVP? Escribe "local" (${MAM_RESULTADO.equipo_local}) o "visitante" (${MAM_RESULTADO.equipo_visitante}):`,
    MAM_RESULTADO.mvp_equipo || "local",
    { placeholder: "local o visitante" }
  );
  if (equipo === null) return; // cancelado
  const equipoNormalizado = equipo.trim().toLowerCase();
  if (!["local", "visitante"].includes(equipoNormalizado)) {
    return EOF.toast("El equipo debe ser \"local\" o \"visitante\"", "error");
  }
  const { dorsal, nombre } = separarDorsalYJugadorMAM(MAM_RESULTADO.mvp_jugador);
  const valorPrevio = combinarDorsalYJugador(dorsal, nombre) || "";
  const jugadorTexto = await EOF.preguntar("Dorsal y/o nombre del jugador MVP:", valorPrevio, { placeholder: "Ej. 9 · Rodrigo" });
  if (jugadorTexto === null) return; // cancelado
  const jugador = jugadorTexto.trim();
  if (!jugador) return EOF.toast("Falta el dorsal y/o el nombre del jugador", "error");
  try {
    await apiFetch(`/api/results/${MAM_RESULTADO.id}/mvp`, {
      method: "PUT",
      body: JSON.stringify({ mvp_jugador: jugador, mvp_equipo: equipoNormalizado }),
    });
    MAM_RESULTADO.mvp_jugador = jugador;
    MAM_RESULTADO.mvp_equipo = equipoNormalizado;
    EOF.toast("MVP guardado", "exito");
    renderBotoneraMinutoAMinuto();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

async function mamQuitarMvp() {
  if (!MAM_RESULTADO) return;
  if (!(await EOF.confirmar("¿Quitar el MVP de este partido?", { textoConfirmar: "Quitar" }))) return;
  try {
    await apiFetch(`/api/results/${MAM_RESULTADO.id}/mvp`, {
      method: "PUT",
      body: JSON.stringify({ mvp_jugador: null, mvp_equipo: null }),
    });
    MAM_RESULTADO.mvp_jugador = null;
    MAM_RESULTADO.mvp_equipo = null;
    EOF.toast("MVP eliminado", "exito");
    renderBotoneraMinutoAMinuto();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

function actualizarCabeceraMinutoAMinuto() {
  const r = MAM_RESULTADO;
  const marcador = document.getElementById("mamMarcador");
  if (marcador) {
    const hayPenaltis = r.penaltis_local !== null && r.penaltis_local !== undefined && r.penaltis_visitante !== null && r.penaltis_visitante !== undefined;
    marcador.innerHTML = `${r.goles_local ?? 0} - ${r.goles_visitante ?? 0}${hayPenaltis ? `<span class="mam-penaltis-marcador">(${r.penaltis_local} - ${r.penaltis_visitante} pen.)</span>` : ""}`;
  }
  actualizarRelojEnPantalla();
}

function renderTimelineMinutoAMinuto() {
  const cont = document.getElementById("mamTimeline");
  if (!cont) return;
  // La tanda de penaltis se gestiona y se muestra en su propio bloque
  // (ver mamAbrirTandaPenaltis / renderTandaPenaltisMAM), no aquí: su
  // "minuto" es el número de lanzamiento, no un minuto real de partido.
  const eventosTimeline = MAM_EVENTOS.filter((ev) => !MAM_TIPOS_TANDA_PENALTIS.includes(ev.tipo));
  if (!eventosTimeline.length) {
    cont.innerHTML = `<p class="mam-sin-eventos">Todavía no se ha registrado ningún evento.</p>`;
    return;
  }
  // Más recientes primero, para ver de un vistazo lo último que ha pasado.
  const eventos = [...eventosTimeline].reverse();
  cont.innerHTML = eventos.map((ev) => {
    const sinEquipo = MAM_TIPOS_SIN_EQUIPO.includes(ev.tipo);
    const nombreEquipo = ev.equipo === "local" ? MAM_RESULTADO.equipo_local : MAM_RESULTADO.equipo_visitante;
    let detalle = "";
    if (ev.tipo === "cambio") {
      const entra = ev.jugador ? escapeHtml(ev.jugador) : "";
      const sale = ev.jugador_sale ? escapeHtml(ev.jugador_sale) : "";
      detalle = [entra && `Entra ${entra}`, sale && `Sale ${sale}`].filter(Boolean).join(" · ");
    } else if (ev.tipo === "gol" || ev.tipo === "gol_var") {
      const marcador = ev.jugador ? escapeHtml(ev.jugador) : "";
      const asistencia = ev.jugador_asistencia ? `Asistencia: ${escapeHtml(ev.jugador_asistencia)}` : "";
      // En "gol_var" se aclara si ha bajado el marcador o no, para que
      // quede claro en el timeline si ese gol anulado llegó a restar un
      // gol o solo se registró como incidencia.
      const notaBajarGol = ev.tipo === "gol_var" ? (ev.bajar_gol ? "Ha bajado 1 gol del marcador" : "No ha modificado el marcador") : "";
      detalle = [marcador, asistencia, notaBajarGol].filter(Boolean).join(" · ");
    } else if (ev.tipo === "gol_pp") {
      const marcador = ev.jugador ? escapeHtml(ev.jugador) : "";
      detalle = [marcador, "Gol para el rival"].filter(Boolean).join(" · ");
    } else if (ev.jugador) {
      detalle = escapeHtml(ev.jugador);
    }
    return `
      <div class="mam-evento-item mam-evento-${ev.tipo}">
        <span class="mam-evento-minuto">${ev.minuto_extra ? `${ev.minuto}+${ev.minuto_extra}'` : `${ev.minuto}'`}</span>
        <span class="mam-evento-texto">
          <b>${escapeHtml(MAM_ETIQUETAS[ev.tipo] || ev.tipo)}</b>
          ${sinEquipo ? "" : ` · ${escapeHtml(nombreEquipo)}`}
          ${detalle ? ` · ${detalle}` : ""}
        </span>
        <button type="button" class="mam-evento-editar" title="Corregir" onclick="mamAbrirFormularioEdicionEventoPorId(${ev.id})">✎</button>
        <button type="button" class="mam-evento-eliminar" title="Eliminar" onclick="mamEliminarEvento(${ev.id})">✕</button>
      </div>`;
  }).join("");
}

// ---------- Tanda de penaltis ----------
// Se abre con su propio botón/modal en la botonera (normalmente tras
// "Final del partido" en un partido eliminatorio que acaba empatado,
// aunque no se obliga a que el partido esté ya finalizado, por si se
// quiere ir registrando la tanda a la vez). Cada lanzamiento se guarda
// como un evento con "minuto" = número de orden (1º, 2º, 3º...), y el
// backend recalcula penaltis_local/penaltis_visitante solo a partir de
// los marcados (ver recalcularPenaltisDesdeEventos en el Worker).
function mamAbrirTandaPenaltis() {
  if (!MAM_RESULTADO) return;
  document.getElementById("mamModalTanda").classList.add("mam-abierto");
  renderTandaPenaltisMAM();
  mamPrepararSiguienteLanzamiento();
}

function mamCerrarTandaPenaltis() {
  document.getElementById("mamModalTanda")?.classList.remove("mam-abierto");
}

// Precarga el formulario con el siguiente número de lanzamiento (uno más
// que el último registrado) y alterna el equipo propuesto (local,
// visitante, local...), ya que en una tanda real se van alternando los
// lanzamientos.
function mamPrepararSiguienteLanzamiento() {
  const lanzamientos = MAM_EVENTOS.filter((ev) => MAM_TIPOS_TANDA_PENALTIS.includes(ev.tipo));
  const siguienteOrden = lanzamientos.length + 1;
  const ultimoEquipo = lanzamientos.length ? [...lanzamientos].sort((a, b) => a.minuto - b.minuto).pop().equipo : "visitante";
  document.getElementById("mamTandaId").value = "";
  document.getElementById("mamTandaOrden").value = siguienteOrden;
  document.getElementById("mamTandaEquipo").value = ultimoEquipo === "local" ? "visitante" : "local";
  document.getElementById("mamTandaResultado").value = "penalti_marcado";
  document.getElementById("mamTandaDorsal").value = "";
  document.getElementById("mamTandaJugador").value = "";
  document.querySelector("#mamFormTanda .btn-primari").textContent = "Añadir lanzamiento";
}

async function mamGuardarTanda(e) {
  e.preventDefault();
  if (!MAM_RESULTADO) return;
  const id = document.getElementById("mamTandaId").value;
  const orden = parseInt(document.getElementById("mamTandaOrden").value, 10);
  if (isNaN(orden) || orden < 1) return EOF.toast("Falta el número de lanzamiento", "error");
  const body = {
    equipo: document.getElementById("mamTandaEquipo").value,
    tipo: document.getElementById("mamTandaResultado").value,
    minuto: orden,
    jugador: combinarDorsalYJugador(document.getElementById("mamTandaDorsal").value, document.getElementById("mamTandaJugador").value),
  };
  try {
    if (id) {
      await apiFetch(`/api/results/${MAM_RESULTADO.id}/eventos/${id}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      await apiFetch(`/api/results/${MAM_RESULTADO.id}/eventos`, { method: "POST", body: JSON.stringify(body) });
    }
    await recargarResultadoYEventos();
    renderTandaPenaltisMAM();
    mamPrepararSiguienteLanzamiento();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

function mamEditarLanzamientoTanda(eventoId) {
  const ev = MAM_EVENTOS.find((e) => e.id === eventoId);
  if (!ev) return;
  document.getElementById("mamTandaId").value = ev.id;
  document.getElementById("mamTandaOrden").value = ev.minuto;
  document.getElementById("mamTandaEquipo").value = ev.equipo;
  document.getElementById("mamTandaResultado").value = ev.tipo;
  // Usar la copia local (separarDorsalYJugadorMAM), no la de admin.js: es
  // la que se usa en el resto de este archivo precisamente para no
  // depender de su orden de carga (ver comentario junto a su definición).
  const { dorsal, nombre } = separarDorsalYJugadorMAM(ev.jugador);
  document.getElementById("mamTandaDorsal").value = dorsal;
  document.getElementById("mamTandaJugador").value = nombre;
  document.querySelector("#mamFormTanda .btn-primari").textContent = "Guardar cambios";
}

async function mamEliminarLanzamientoTanda(eventoId) {
  if (!MAM_RESULTADO) return;
  if (!(await EOF.confirmar("¿Eliminar este lanzamiento de la tanda?", { peligroso: true, textoConfirmar: "Eliminar" }))) return;
  try {
    await apiFetch(`/api/results/${MAM_RESULTADO.id}/eventos/${eventoId}`, { method: "DELETE" });
    await recargarResultadoYEventos();
    renderTandaPenaltisMAM();
    mamPrepararSiguienteLanzamiento();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

function renderTandaPenaltisMAM() {
  const cont = document.getElementById("mamListaTanda");
  if (!cont) return;
  const r = MAM_RESULTADO;
  const lanzamientos = [...MAM_EVENTOS].filter((ev) => MAM_TIPOS_TANDA_PENALTIS.includes(ev.tipo)).sort((a, b) => a.minuto - b.minuto);
  const marcadorTanda = document.getElementById("mamTandaMarcador");
  if (marcadorTanda) {
    const hayPenaltis = r.penaltis_local !== null && r.penaltis_local !== undefined && r.penaltis_visitante !== null && r.penaltis_visitante !== undefined;
    marcadorTanda.textContent = hayPenaltis ? `${r.penaltis_local} - ${r.penaltis_visitante}` : "0 - 0";
  }
  if (!lanzamientos.length) {
    cont.innerHTML = `<p class="mam-sin-eventos">Todavía no se ha registrado ningún lanzamiento.</p>`;
    return;
  }
  cont.innerHTML = lanzamientos.map((ev) => {
    const marcado = ev.tipo === "penalti_marcado";
    const nombreEquipo = ev.equipo === "local" ? r.equipo_local : r.equipo_visitante;
    return `
      <div class="mam-evento-item mam-evento-tanda ${marcado ? "mam-tanda-marcado" : "mam-tanda-fallado"}">
        <span class="mam-evento-minuto">${ev.minuto}º</span>
        <span class="mam-evento-texto">
          <b>${marcado ? "Marcado" : "Fallado / parado"}</b> · ${escapeHtml(nombreEquipo)}
          ${ev.jugador ? ` · ${escapeHtml(ev.jugador)}` : ""}
        </span>
        <button type="button" class="mam-evento-editar" title="Editar" onclick="mamEditarLanzamientoTanda(${ev.id})">✎</button>
        <button type="button" class="mam-evento-eliminar" title="Eliminar" onclick="mamEliminarLanzamientoTanda(${ev.id})">✕</button>
      </div>`;
  }).join("");
}

// ---------- Reapertura automática tras recargar ----------
// Si al recargar la página había un panel de Minuto a Minuto abierto
// para un partido concreto, se reabre solo, en vez de dejar al redactor
// de vuelta en la tabla de resultados sin más (que era muy fácil perder
// de vista el partido en curso con un F5 sin querer). Se lanza en un
// pequeño timeout porque admin.js necesita terminar primero de
// comprobar la sesión y cargar la tabla de resultados: abrirPanelMinutoAMinuto
// depende de apiFetch, cargarPermisosTemporalesVigentes y
// puedeGestionarResultado, todo ello inicializado en ese arranque.
(function reabrirPanelMinutoAMinutoTrasRecarga() {
  // Si se ha entrado con panel.html?minuto_a_minuto=<id> (ver
  // abrirMinutoAMinutoDesdeUrl en admin.js, que ya se ha ejecutado antes
  // que este bloque porque admin.js se carga primero), ese id manda: no
  // hay que competir con lo último que hubiera en localStorage de una
  // sesión anterior en OTRA pestaña, que podría ser un partido distinto.
  if (new URLSearchParams(location.search).get("minuto_a_minuto")) return;
  let resultadoId;
  try { resultadoId = localStorage.getItem(MAM_STORAGE_KEY); } catch { return; }
  if (!resultadoId) return;
  const intentarAbrir = () => {
    if (typeof apiFetch !== "function" || !document.getElementById("panelMinutoAMinuto")) {
      return setTimeout(intentarAbrir, 200);
    }
    abrirPanelMinutoAMinuto(resultadoId);
  };
  setTimeout(intentarAbrir, 300);
})();
