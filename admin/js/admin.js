// Caché en memoria de los resultados cargados en el listado (id -> resultado).
// Declarada aquí arriba, antes de cualquier uso, para evitar el error de
// "temporal dead zone" de `let` (ReferenceError: Cannot access
// 'RESULTADOS_CACHE' before initialization) si algún código la consulta
// antes de que se ejecute la línea donde antes se declaraba, más abajo.
let RESULTADOS_CACHE = {};

// Los collages ya guardados se mantienen aparte de "imagenesLista"
// mientras se edita la noticia (no son filas normales de foto): cada
// collage es { grupo, plantilla, trasParrafo, fotos: [{url, foco, credito}, ...] }.
// Declaradas aquí arriba por el mismo motivo que RESULTADOS_CACHE:
// pintarListaCollages() se llama muy pronto durante la carga del panel
// (antes de llegar a donde antes se declaraban, mucho más abajo), lo
// que provocaba "Cannot access 'COLLAGES_ARTICULO' before initialization".
let COLLAGES_ARTICULO = [];
let COLLAGE_EDITOR = { grupo: null, plantilla: "2-horizontal", posicion: "collage", trasParrafo: 1, fotos: [] };

// ---------- Declaraciones adelantadas ----------
// Estas variables se referencian dentro de funciones que se ejecutan
// muy pronto durante la carga del panel (antes de llegar a la linea
// original mas abajo donde se definian), lo que provocaba un
// ReferenceError de "temporal dead zone" (Cannot access '...' before
// initialization) con let/const. Se declaran aqui arriba para que ya
// esten disponibles desde el primer momento.
const checkProgramarNoticia = document.getElementById("programarNoticia");
const contenidoEditor = document.getElementById("contenidoEditor");
const CLAVE_BORRADOR_EMERGENCIA = "eof_borrador_emergencia";
const formArticle = document.getElementById("formArticle");
const pinInputs = ["pin_d1", "pin_d2", "pin_d3", "pin_d4"].map((id) => document.getElementById(id));
const rCompeticion = document.getElementById("r_competicion");
// true si, al abrir "Editar" un partido, su fecha guardada solo tenía
// día y no hora (ver editarResultado). Se usa al guardar para no dar por
// buena una hora "00:00" que el navegador ha tenido que inventarse para
// poder pintarla en el <input type="datetime-local">, si el redactor no
// ha tocado ese campo.
let fechaOriginalSinHora = false;
const rGrupo = document.getElementById("r_grupo");
const rGrupoLabel = document.getElementById("r_grupo_label");
const rJornada = document.getElementById("r_jornada");
const rJornadaLabel = document.getElementById("r_jornada_label");
const COMPETICIONES_CON_FLASHSCORE = ["hypermotion", "primera_federacion", "segunda_federacion"];
// Movidas aquí arriba (antes estaban junto a su uso, más abajo en el
// archivo) para evitar errores de "Cannot access before initialization"
// cuando alguna función que las usa se invoca antes de que el resto del
// script termine de ejecutarse línea a línea.
const CATEGORIAS_FIJAS_DISPONIBLES = ["arbitraje", "jurisdiccion"];
const IDS_SUBPANEL_COMENTARIOS = {
  pendiente: "listaComentariosPendientes",
  aprobado: "listaComentariosAprobados",
  rechazado: "listaComentariosRechazados",
};
const rFlashscoreWrap = document.getElementById("r_flashscore_wrap");
const rFlashscore = document.getElementById("r_flashscore");
const rUbicacion = document.getElementById("r_ubicacion");
const rPorJugarExtraWrap = document.getElementById("r_porjugar_extra_wrap");
const rLocalOtroWrap = document.getElementById("r_local_otro_wrap");
const rVisitanteOtroWrap = document.getElementById("r_visitante_otro_wrap");
const rEstado = document.getElementById("r_estado");
const formResultado = document.getElementById("formResultado");
const MARGEN_ACCESO_MINUTO_A_MINUTO_HORAS = 3;
let EVENTOS_PARTIDO_RESULTADO_ID = null;
let modalEquiposPicker = null;
let pgNombrePersona = "";
const VALOR_OTRO_EQUIPO = "__otro__";
const ESCUDO_GENERICO_ADMIN = "../" + ESCUDO_GENERICO;
const rLocalPicker = crearTeamPicker(document.getElementById("r_local_picker"), {
  onChange: () => {
    actualizarVisibilidadOtro(rLocalPicker, rLocalOtroWrap);
    autorellenarUbicacionPorLocal();
    actualizarPreviewResultado();
  },
});
const rVisitantePicker = crearTeamPicker(document.getElementById("r_visitante_picker"), {
  onChange: () => {
    actualizarVisibilidadOtro(rVisitantePicker, rVisitanteOtroWrap);
    actualizarPreviewResultado();
  },
});

// ---------- Cabecera + marcador en vivo del formulario de resultados ----------
// Refresca la cabecera (logo + nombre de la competición + estado) y la
// tarjeta de marcador en vivo mientras el redactor rellena el
// formulario, para que se vea de un vistazo lo que se está guardando
// en lugar de un simple formulario de campos sueltos. Se llama tras
// cualquier cambio relevante: competición, estado, jornada, equipos o
// goles.
const ESTADO_LABELS_RESULTADO = {
  programado: "Por jugar",
  en_juego: "En juego",
  retrasado: "Retrasado",
  anulado: "Anulado",
  finalizado: "Finalizado",
};

function actualizarPreviewResultado() {
  const cabecera = document.getElementById("resultadoCabecera");
  if (!cabecera) return; // por si este JS se reutiliza en alguna página sin el formulario

  const competicion = rCompeticion.value;
  const estado = rEstado.value;
  const jornadaTexto = rJornada.value ? `Jornada ${rJornada.value}` : (competicion === "amistoso" ? "Amistoso" : "Jornada —");

  // Cabecera: logo + nombre de la competición.
  const logoEl = document.getElementById("resultadoCabeceraLogo");
  const logoSrc = typeof categoriaLogo === "function" ? categoriaLogo(competicion) : "";
  if (logoSrc) {
    logoEl.src = "../" + logoSrc;
    logoEl.style.display = "";
    // El logo de LaLiga Hypermotion es un PNG con trazos negros pensado
    // para fondo claro: en modo oscuro se pinta de blanco con esta clase
    // (ver CSS en admin.css) en vez de depender del parche de fondo
    // blanco forzado. Los de Primera/Segunda Federación se dejan tal
    // cual, igual que en el resto del sitio (ver categoria.html).
    logoEl.classList.toggle("resultado-cabecera-logo-hypermotion", competicion === "hypermotion");
  } else {
    logoEl.style.display = "none";
  }
  document.getElementById("resultadoCabeceraTitulo").textContent =
    (typeof categoriaLabel === "function" ? categoriaLabel(competicion) : competicion);
  document.getElementById("resultadoCabeceraEyebrow").textContent =
    document.getElementById("resultadoId").value ? "Editando partido" : "Nuevo partido";

  const estadoEl = document.getElementById("resultadoCabeceraEstado");
  estadoEl.textContent = ESTADO_LABELS_RESULTADO[estado] || estado;
  estadoEl.className = "resultado-cabecera-estado estado-" + estado;

  // Marcador: escudos, nombres y goles.
  document.getElementById("marcadorPreviewJornada").textContent = jornadaTexto;

  const nombreLocal = rLocalPicker.obtenerValor ? rLocalPicker.obtenerValor() : "";
  const nombreVisitante = rVisitantePicker.obtenerValor ? rVisitantePicker.obtenerValor() : "";
  const nombreLocalMostrado = nombreLocal === VALOR_OTRO_EQUIPO ? (rLocalOtroNombre.value || "Otro equipo") : nombreLocal;
  const nombreVisitanteMostrado = nombreVisitante === VALOR_OTRO_EQUIPO ? (rVisitanteOtroNombre.value || "Otro equipo") : nombreVisitante;
  document.getElementById("marcadorPreviewNombreLocal").textContent = nombreLocalMostrado || "Equipo local";
  document.getElementById("marcadorPreviewNombreVisitante").textContent = nombreVisitanteMostrado || "Equipo visitante";

  const escudoLocalWrap = document.getElementById("marcadorPreviewEscudoLocal");
  const escudoVisitanteWrap = document.getElementById("marcadorPreviewEscudoVisitante");
  const escudoLocalUrl = nombreLocal && nombreLocal !== VALOR_OTRO_EQUIPO ? escudoUrlAdmin(nombreLocal) : (escudoLocalOtroUrl || "");
  const escudoVisitanteUrl = nombreVisitante && nombreVisitante !== VALOR_OTRO_EQUIPO ? escudoUrlAdmin(nombreVisitante) : (escudoVisitanteOtroUrl || "");
  escudoLocalWrap.innerHTML = escudoLocalUrl ? `<img src="${escudoLocalUrl}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='🛡️'">` : "🛡️";
  escudoVisitanteWrap.innerHTML = escudoVisitanteUrl ? `<img src="${escudoVisitanteUrl}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='🛡️'">` : "🛡️";

  const mostrarGoles = estado !== "programado";
  document.getElementById("marcadorPreviewGolesLocal").textContent =
    mostrarGoles && rGolesLocal.value !== "" ? rGolesLocal.value : "–";
  document.getElementById("marcadorPreviewGolesVisitante").textContent =
    mostrarGoles && rGolesVisitante.value !== "" ? rGolesVisitante.value : "–";
}



// ---------- Auth guard ----------
const TOKEN = localStorage.getItem("eof_token");
const USER = JSON.parse(localStorage.getItem("eof_user") || "null");
const NOTIF_CLAVE = `eof_notif_visto_${USER ? USER.username : ""}`;
let ultimaVisitaNotifServidor = null;
const selectClub = document.getElementById("club");

// Mismo emoji/nombre que NIVELES_INFO en el Worker, para pintar la
// etiqueta de nivel en la tabla de Usuarios sin tener que esperar a la
// llamada de progreso (basta con el número de nivel que ya trae
// GET /api/users). Declarado aquí arriba (y no junto al resto de "Mi
// progreso") porque cargaUsuarios() lo necesita y se puede llamar en
// cuanto se pinta el panel, antes de llegar a esa sección del script.
const NIVELES_ETIQUETA = {
  1: { emoji: "🟢", nombre: "Principiante" },
  2: { emoji: "🔵", nombre: "Aprendiz" },
  3: { emoji: "🟣", nombre: "Maestro" },
  4: { emoji: "🟠", nombre: "Experto" },
};
if (!TOKEN || !USER) {
  // Si se llegó sin sesión a una URL con querystring propio (p. ej.
  // panel.html?minuto_a_minuto=<id>, abierto en pestaña nueva desde el
  // enlace "Abrir en pestaña independiente" cuando esa pestaña todavía
  // no tenía sesión), se conserva esa URL en "?volver=" para volver
  // directos ahí tras hacer login, en vez de aterrizar siempre en el
  // dashboard general y perder de vista qué partido se quería abrir.
  const destino = location.pathname + location.search;
  const volver = destino !== "/admin/panel.html" && destino !== "admin/panel.html"
    ? `?volver=${encodeURIComponent(destino)}`
    : "";
  location.href = `login.html${volver}`;
}

// El nivel (y el rol) se guardaron en USER al iniciar sesión, pero un
// admin puede cambiarlos en cualquier momento sin que el redactor tenga
// que volver a iniciar sesión. Se comprueban en cuanto arranca el panel
// (para que decisiones como "¿hace falta pedir el PIN de Última hora al
// publicar?" usen siempre el valor real) y también de forma periódica
// mientras la persona sigue con el panel abierto (ver
// vigilarCambioNivelORol más abajo): si un admin le cambia el nivel o el
// rol a alguien que está conectado en ese momento, se le avisa y se le
// recarga la página automáticamente para que no pueda seguir haciendo
// nada con permisos que ya no tiene (o para que aproveche los nuevos sin
// tener que volver a entrar).
async function refrescarNivelUsuario() {
  if (!USER) return;
  try {
    const data = await apiFetch(`/api/me/nivel`);
    if (!data || typeof data.nivel_actual !== "number") return false;
    const rolCambiado = typeof data.es_admin === "boolean" && data.es_admin !== (USER.rol === "admin");
    const nivelCambiado = !rolCambiado && data.nivel_actual !== USER.nivel;
    if (rolCambiado || nivelCambiado) {
      USER.nivel = data.nivel_actual;
      if (rolCambiado) USER.rol = data.es_admin ? "admin" : "redactor";
      localStorage.setItem("eof_user", JSON.stringify(USER));
      // Un ascenso/descenso de nivel recién llegado puede cambiar si toca
      // mostrar el bloque de "Programar publicación" (ver más abajo).
      if (typeof bloqueProgramarNoticia !== "undefined" && bloqueProgramarNoticia) {
        bloqueProgramarNoticia.style.display = puedeProgramarNoticia() ? "" : "none";
      }
      return rolCambiado ? "rol" : "nivel";
    }
    return false;
  } catch (err) {
    // Sin conexión con la API: se sigue con el nivel/rol que ya había.
    return false;
  }
}
refrescarNivelUsuario();

// Cada cuánto se comprueba si el nivel/rol propio ha cambiado mientras el
// panel sigue abierto (ver comentario de refrescarNivelUsuario). No hace
// falta que sea instantáneo -no es una alarma de seguridad crítica, es
// para que alguien no siga un rato de más con permisos que ya no tiene-,
// así que cada 20s es suficiente sin machacar la API a lo tonto.
const INTERVALO_VIGILANCIA_NIVEL_MS = 20000;
async function vigilarCambioNivelORol() {
  const cambio = await refrescarNivelUsuario();
  if (!cambio) return;
  // Se avisa con un toast antes de recargar, para que a la persona le dé
  // tiempo a leer qué ha pasado y no le parezca que la página se ha
  // recargado sola sin motivo; la recarga es la que de verdad corta
  // cualquier acción que se pudiera seguir haciendo con el rol/nivel
  // antiguo (formularios ya abiertos, botones ya pintados, etc.).
  const mensaje = cambio === "rol"
    ? "Un administrador te ha cambiado el rol. La página se va a recargar para aplicar el cambio…"
    : "Un administrador te ha cambiado de nivel. La página se va a recargar para aplicar el cambio…";
  try { EOF.toast(mensaje, "info", 3000); } catch {}
  setTimeout(() => location.reload(), 2500);
}
setInterval(vigilarCambioNivelORol, INTERVALO_VIGILANCIA_NIVEL_MS);

// Clubes "personalizados" (añadidos a mano desde "Otro equipo") cargados
// del servidor; se piden en cuanto arranca el panel para que estén
// disponibles cuanto antes. getClubsForCategoria/getEscudoUrl (clubs.js)
// ya los combinan automáticamente con los fijos una vez han llegado; aquí
// solo hace falta volver a pintar los desplegables que ya se hubieran
// poblado con la lista fija antes de que la petición terminase.
const CUSTOM_CLUBS_LISTOS = cargarCustomClubs().then(() => {
  if (typeof poblarClubs === "function" && typeof selectCategoria !== "undefined") {
    poblarClubs(selectCategoria.value, selectClub.value);
  }
  if (typeof poblarSelectsEquipo === "function" && typeof rLocalPicker !== "undefined") {
    poblarSelectsEquipo(rLocalPicker.obtenerValor(), rVisitantePicker.obtenerValor());
  }
});

// Iniciales para el círculo de avatar (misma lógica que en la cabecera
// pública, js/layout.js), p. ej. "Ana Pérez" -> "AP".
function iniciales(nombre) {
  return (nombre || "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

// Si no hay sesión, no seguimos ejecutando código que asume que USER
// existe (evita un error en consola justo antes de la redirección).
// Pinta el círculo de avatar de la cabecera (y el del menú desplegable):
// la foto real si el usuario tiene una guardada, o sus iniciales si no
// (nunca deja el círculo vacío).
function pintarCuentaAvatar(user) {
  ["cuentaAvatar", "cuentaAvatarGrande"].forEach((idEl) => {
    const el = document.getElementById(idEl);
    if (!el) return;
    if (user && user.avatar_url) {
      el.textContent = "";
      el.style.backgroundImage = `url('${user.avatar_url}')`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = user.avatar_foco || "50% 50%";
      el.classList.add("user-avatar-foto");
    } else {
      el.style.backgroundImage = "none";
      el.classList.remove("user-avatar-foto");
      el.textContent = iniciales(user && user.nombre) || "?";
    }
  });
}

if (USER) {
  pintarCuentaAvatar(USER);
  // El checkbox "Publicada" del formulario de noticias viene sin marcar
  // en el HTML (ver panel.html): aquí se fija su valor real por defecto
  // según el nivel, una sola vez al cargar el panel, para que quede bien
  // tanto si se abre "Nueva noticia" directamente como si se pasa antes
  // por cancelarEdicion() (que ya hace lo mismo, ver esa función, pero
  // no todos los caminos hasta el formulario pasan por ahí — p. ej. el
  // primer click en la subtab "nueva"). Un admin, o un redactor de Nivel
  // 2+, publica sin revisión, así que arranca marcado; Nivel 1 arranca
  // desmarcado porque sin el PIN de "Última hora" se guardaría como
  // borrador de todos modos.
  const checkPublicadoInicial = document.getElementById("publicado");
  if (checkPublicadoInicial) {
    checkPublicadoInicial.checked = USER.rol === "admin" || (USER.nivel || 1) >= 2;
  }
  document.getElementById("userNombre").textContent = USER.nombre;
  document.getElementById("cuentaNombreCompleto").textContent = USER.nombre;
  document.getElementById("cuentaRolEtiqueta").textContent = USER.rol === "admin" ? "Administrador" : "Redactor";
  // El panel de analíticas (public/panel-analiticas.html) solo admite
  // administradores en el Worker (ver /api/admin/analiticas/*), así que
  // ni se muestra el enlace a quien no lo sea.
  if (document.getElementById("enlaceAnaliticas") && USER.rol !== "admin") {
    document.getElementById("enlaceAnaliticas").remove();
  }
  if (document.getElementById("ajustesNombre")) {
    document.getElementById("ajustesNombre").textContent = USER.nombre;
    document.getElementById("ajustesUsername").textContent = USER.username;
    document.getElementById("ajustesRol").textContent = USER.rol;
  }
  if (document.getElementById("perfil_nombre")) {
    document.getElementById("perfil_nombre").value = USER.nombre || "";
    document.getElementById("perfil_email").value = USER.email || "";
    const linkPerfil = document.getElementById("linkPerfilPublico");
    if (linkPerfil) linkPerfil.href = `../autor.html?id=${USER.id}`;
    const btnPreview = document.getElementById("btnPrevisualizarPerfil");
    if (btnPreview) {
      btnPreview.addEventListener("click", () => {
        window.open(`../autor.html?id=${USER.id}`, "_blank", "noopener");
      });
    }
    cargarMiPerfilCompleto();
  }
  // Las redes sociales del medio y la gestión de usuarios solo las puede
  // tocar un administrador. La pestaña "Contenido" la ve todo el mundo
  // (para poder subir fotos/vídeos), pero la galería de gestión de dentro
  // solo la ve un administrador (se oculta más abajo).
  if (USER.rol !== "admin") {
    // Un redactor sí puede entrar en "Ajustes del medio", pero solo para
    // gestionar las fichas de equipo: las redes sociales del medio siguen
    // siendo cosa exclusiva de un administrador.
    const subtabRedesSociales = document.getElementById("subtabRedesSociales_btn");
    if (subtabRedesSociales) subtabRedesSociales.style.display = "none";
    const tabUsuarios = document.getElementById("tabUsuarios");
    if (tabUsuarios) tabUsuarios.style.display = "none";
    const subtabFuncNewsletter = document.getElementById("subtabFuncNewsletter_btn");
    if (subtabFuncNewsletter) subtabFuncNewsletter.style.display = "none";
    const subtabFuncHistorial = document.getElementById("subtabFuncHistorial_btn");
    if (subtabFuncHistorial) subtabFuncHistorial.style.display = "none";
    const subtabFuncComentarios = document.getElementById("subtabFuncComentarios_btn");
    if (subtabFuncComentarios) subtabFuncComentarios.style.display = "none";
    // Un redactor normal también puede ver esta pestaña, pero solo le
    // muestra (y le deja editar) lo que ha subido él mismo.
    const subtabVerContenido = document.getElementById("subtabVerContenido");
    if (subtabVerContenido) subtabVerContenido.textContent = "Mi contenido subido";
    // Le recordamos que publicar directamente le va a pedir el PIN de
    // "Última hora" (si no, se le guarda como borrador) — solo aplica a
    // Nivel 1. A partir de Nivel 2 el redactor ya publica sin revisión
    // administrativa, así que se le muestra un aviso distinto con su
    // nivel actual.
    const nivelActualRedactor = USER.nivel || 1;
    // El checkbox "Publicada" del formulario de noticias viene sin
    // marcar en el HTML (ver panel.html): aquí se fija su valor real
    // según el nivel, una sola vez al cargar el panel, para que quede
    // bien tanto si se abre "Nueva noticia" directamente como si se
    // pasa antes por cancelarEdicion() (que ya hace lo mismo, ver esa
    // función, pero no todos los caminos hasta el formulario pasan por
    // ahí — p. ej. el primer click en la subtab "nueva").
    // El calendario de jornadas (fechas de inicio/fin de cada jornada
    // para el resto del sitio) solo lo puede tocar un redactor a partir
    // de Nivel 3: para Nivel 1 y 2 la subtab ni se muestra.
    if (nivelActualRedactor < 3) {
      const subtabCalendarioJornadas = document.getElementById("subtabCalendarioJornadas_btn");
      if (subtabCalendarioJornadas) subtabCalendarioJornadas.style.display = "none";
    }
    const avisoPublicadoRedactorNivel2 = document.getElementById("avisoPublicadoRedactorNivel2");
    if (nivelActualRedactor >= 2) {
      if (avisoPublicadoRedactorNivel2) {
        avisoPublicadoRedactorNivel2.textContent = `Como redactor de nivel ${nivelActualRedactor}, tienes la capacidad de publicar sin necesidad de revisión administrativa.`;
        avisoPublicadoRedactorNivel2.style.display = "block";
      }
    }
    // Nivel 1: el checkbox "Publicada" ya arranca desmarcado (ver el
    // bloque de inicialización al principio de este script) y el propio
    // label ya explica que desmarcado se guarda como borrador, así que
    // no hace falta además un párrafo aparte repitiéndolo.
  }

  // ---------- Cierre de sesión por inactividad (15 minutos) ----------
  const INACTIVIDAD_LIMITE_MS = 15 * 60 * 1000;
  let temporizadorInactividad;
  function reiniciarTemporizadorInactividad() {
    clearTimeout(temporizadorInactividad);
    temporizadorInactividad = setTimeout(() => {
      // Antes de cerrar la sesión, forzamos el guardado del borrador que
      // se estuviera escribiendo (aunque no cumpla los requisitos mínimos
      // de longitud), para no perder el trabajo. Se guarda solo en este
      // navegador (localStorage), no en el servidor, precisamente porque
      // puede no cumplir las validaciones del backend.
      guardarBorradorLocalDeEmergencia();
      EOF.alertaModal("Se ha cerrado la sesión por inactividad.", { tipo: "info" }).then(logout);
    }, INACTIVIDAD_LIMITE_MS);
  }
  ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"].forEach((evento) => {
    document.addEventListener(evento, reiniciarTemporizadorInactividad, { passive: true });
  });
  reiniciarTemporizadorInactividad();

  // ---------- Notificaciones (contenido subido / crónicas publicadas /
  // pedidos de la tienda) ----------
  // Antes solo se activaba para admin, porque solo ellos tenían novedades
  // que ver aquí. Ahora cualquier redactor puede recibir un aviso de "tu
  // pedido en la tienda ha cambiado de estado" (ver cargarNotificaciones),
  // así que se activa para todo el mundo; para quien no sea admin ni
  // gestor de tienda, simplemente esa será la única fuente de novedades
  // que pueda llegar a ver.
  inicializarNotificaciones();

  // ---------- Aviso de solicitudes de edición pendientes de mi respuesta ----------
  actualizarBadgeSolicitudesPendientes();

  // ---------- Desplegable de cuenta ----------
  const cuentaWrap = document.getElementById("cuentaWrap");
  const cuentaBtn = document.getElementById("cuentaBtn");
  const cuentaMenu = document.getElementById("cuentaMenu");
  if (cuentaWrap && cuentaBtn && cuentaMenu) {
    cuentaBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      cuentaMenu.classList.toggle("abierto");
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#cuentaWrap")) cuentaMenu.classList.remove("abierto");
    });
  }
}

function irAAjustesCuenta(seccion) {
  const menu = document.getElementById("cuentaMenu");
  if (menu) menu.classList.remove("abierto");
  document.getElementById("tabAjustesOculto").click();
  const subtab = seccion === "password" ? "password" : (seccion === "sesiones" ? "sesiones" : (seccion === "progreso" ? "progreso" : "perfil"));
  const btnSubtab = document.querySelector(`#subtabsAjustes button[data-subtab="${subtab}"]`);
  if (btnSubtab) btnSubtab.click();
}


// Se guarda tanto en localStorage (para pintar algo al instante, sin
// esperar a la API) como en el servidor (para que sobreviva a perder la
// sesión o borrar las cookies/datos del navegador). El servidor manda:
// en cuanto responde, se usa su valor y se sincroniza localStorage con él.

function inicializarNotificaciones() {
  const wrap = document.getElementById("notifWrap");
  const btn = document.getElementById("notifBtn");
  if (!wrap || !btn) return;
  wrap.style.display = "block";

  apiFetch(`/api/me/notif-visto`).then((data) => {
    if (data && data.visto) {
      ultimaVisitaNotifServidor = data.visto;
      localStorage.setItem(NOTIF_CLAVE, data.visto);
    }
    cargarNotificaciones();
  }).catch(() => cargarNotificaciones());
  setInterval(cargarNotificaciones, 60000);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const abriendo = !wrap.classList.contains("abierto");
    wrap.classList.toggle("abierto");
    if (abriendo) marcarNotificacionesVistas();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#notifWrap")) wrap.classList.remove("abierto");
  });
  const notifOverlay = document.getElementById("notifOverlay");
  if (notifOverlay) {
    notifOverlay.addEventListener("click", () => wrap.classList.remove("abierto"));
  }
}

function ultimaVisitaNotif() {
  return ultimaVisitaNotifServidor || localStorage.getItem(NOTIF_CLAVE) || "1970-01-01T00:00:00";
}

async function cargarNotificaciones() {
  const lista = document.getElementById("notifLista");
  const contador = document.getElementById("notifContador");
  if (!lista) return;
  try {
    const [{ media = [] }, { articles = [] }, { results: resultadosPendientes = [] }, misPedidosTienda, pedidosTiendaGestion] = await Promise.all([
      apiFetch(`/api/media`),
      apiFetch(`/api/articles?admin=1&limit=15`),
      apiFetch(`/api/results?limit=200`),
      apiFetch(`/api/tienda/mis-pedidos`).catch(() => ({ pedidos: [] })),
      // Solo quien gestiona la tienda puede ver todos los pedidos; para
      // el resto esta petición devolvería 403, así que directamente no
      // se intenta si ya sabemos que no tiene permiso (evita un error en
      // consola en cada usuario normal, cada 60s).
      (TIENDA_PUEDE_GESTIONAR ? apiFetch(`/api/tienda/pedidos?estado=pendiente_pago`) : Promise.resolve({ pedidos: [] })).catch(() => ({ pedidos: [] })),
    ]);

    const TIPO_LABEL = { noticia: "Noticia", previa: "Previa", cronica: "Crónica", analisis: "Análisis", opinion: "Opinión", entrevista: "Entrevista" };

    // Partidos que se marcaron como "Por jugar" (programado) pero cuya
    // fecha ya ha pasado: hace falta que un admin entre y actualice el
    // resultado (marcador, o pasarlo a "En juego"/"Finalizado"). La
    // notificación "nace" justo al empezar el día siguiente a la fecha
    // del partido (p. ej. partido el 8 de agosto -> avisa desde las 00:00
    // del 9 de agosto), usando esa medianoche como fecha de la novedad
    // para que encaje con el mismo criterio de "leída/no leída" que el
    // resto y no aparezca antes de tiempo.
    const hoyStr = new Date().toISOString().slice(0, 10);
    const partidosSinActualizar = resultadosPendientes
      .filter(r => r.estado === "programado" && r.fecha_partido && r.fecha_partido < hoyStr)
      .map(r => {
        const fechaAviso = new Date(r.fecha_partido + "T00:00:00Z");
        fechaAviso.setUTCDate(fechaAviso.getUTCDate() + 1);
        return {
          tipo: "Resultado pendiente",
          titulo: `${r.equipo_local} - ${r.equipo_visitante}: necesita actualización`,
          autor: "",
          fecha: fechaAviso.toISOString().slice(0, 19).replace("T", " "),
          tab: "resultados",
          resultadoId: r.id,
        };
      });

    // Pedidos nuevos de la tienda (pendientes de pago), solo para quien
    // puede gestionarla: aviso de que hay que confirmar un Bizum.
    const TIENDA_ETIQUETAS_ESTADO_NOTIF = { pendiente_pago: "Pendiente de pago", pagado: "Pagado", enviado: "Enviado", cancelado: "Cancelado" };
    const pedidosNuevosTienda = (pedidosTiendaGestion.pedidos || []).map(p => ({
      tipo: "Pedido en la tienda",
      titulo: `${p.redactor_nombre || "Alguien"} ha pedido "${p.producto_nombre}"${p.variante ? " (" + p.variante + ")" : ""}`,
      autor: "",
      fecha: p.created_at,
      tab: "tienda",
      subtab: "tiendaGestion",
    }));

    // Cambios de estado en MIS propios pedidos de la tienda (p.ej. "tu
    // pedido ha pasado a Pagado"). Solo se avisa de pedidos que ya han
    // sido gestionados (gestionado_en no nulo) y no están en su estado
    // inicial, para no repetir el aviso de "lo acabas de pedir tú mismo".
    const cambiosMisPedidosTienda = (misPedidosTienda.pedidos || [])
      .filter(p => p.gestionado_en && p.estado !== "pendiente_pago")
      .map(p => ({
        tipo: "Tu pedido en la tienda",
        titulo: `"${p.producto_nombre}"${p.variante ? " (" + p.variante + ")" : ""}: ${TIENDA_ETIQUETAS_ESTADO_NOTIF[p.estado] || p.estado}`,
        autor: "",
        fecha: p.gestionado_en,
        tab: "tienda",
        subtab: "tiendaMisPedidos",
      }));

    const novedades = [
      ...media.map(m => ({
        tipo: "Contenido",
        titulo: m.titulo,
        autor: m.autor_nombre,
        fecha: m.created_at,
        tab: "contenido",
      })),
      ...articles.map(a => ({
        tipo: TIPO_LABEL[a.tipo] || "Artículo",
        titulo: a.titulo,
        autor: a.autor_nombre,
        fecha: a.created_at,
        tab: "lista",
        slug: a.slug,
        categoria: a.categoria,
        publicado: a.publicado,
      })),
      ...partidosSinActualizar,
      ...pedidosNuevosTienda,
      ...cambiosMisPedidosTienda,
    ]
      .filter(n => n.fecha)
      .sort((a, b) => new Date(b.fecha.replace(" ", "T")) - new Date(a.fecha.replace(" ", "T")))
      .slice(0, 20);

    // Las fechas de la BD vienen como "YYYY-MM-DD HH:MM:SS" en UTC sin
    // zona horaria, y "visto" es un ISO string con milisegundos y "Z"
    // (de toISOString()). Comparar esos dos formatos como texto es
    // incorrecto (p. ej. "12:32:48" resulta "menor" que "12:32:48.100Z"
    // aunque el primer instante sea posterior), así que se comparan como
    // fechas reales para que ninguna notificación se marque como vista
    // por error.
    const vistoStr = ultimaVisitaNotif();
    const visto = new Date(vistoStr.includes("Z") ? vistoStr : vistoStr.replace(" ", "T") + "Z").getTime();
    const esNoLeida = (n) => new Date(n.fecha.replace(" ", "T") + "Z").getTime() > visto;
    const noLeidas = novedades.filter(esNoLeida).length;

    if (contador) {
      contador.textContent = noLeidas > 9 ? "9+" : String(noLeidas);
      contador.style.display = noLeidas > 0 ? "flex" : "none";
    }

    lista.innerHTML = novedades.length
      ? novedades.map(n => `
        <a href="javascript:void(0)" class="notif-item ${esNoLeida(n) ? "no-leida" : ""}" onclick='irANotificacion(${escapeHtml(JSON.stringify(n)).replace(/'/g, "&#39;")})'>
          <div class="notif-tipo">${n.tipo}</div>
          <div class="notif-titulo">${escapeHtml(n.titulo)}</div>
          <div class="notif-meta">${escapeHtml(n.autor || "")} · ${formatFechaNotif(n.fecha)}</div>
        </a>`).join("")
      : `<p class="notif-vacio">Todavía no hay novedades.</p>`;
  } catch (err) {
    lista.innerHTML = `<p class="notif-vacio">No se han podido cargar las novedades.</p>`;
  }
}

function formatFechaNotif(fechaStr) {
  // La fecha viene de la BD en UTC (formato "YYYY-MM-DD HH:MM:SS" sin
  // zona horaria); hay que decirle a Date que es UTC (añadiendo "Z") y
  // luego pedirle que la muestre en la hora de España, si no, el
  // navegador la interpreta como si ya fuera hora local y sale mal.
  const d = new Date(fechaStr.replace(" ", "T") + "Z");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}

function irANotificacion(n) {
  document.getElementById("notifWrap").classList.remove("abierto");

  // Las noticias/crónicas/etc. publicadas se abren directamente como las
  // vería cualquier lector, en una pestaña nueva, en vez de llevar al
  // listado del panel. Los borradores (no publicados) no existen todavía
  // en la web pública, así que para esos sí se cae al listado del admin.
  if (n.tab === "lista" && n.slug && n.publicado) {
    window.open(urlNoticia(n.categoria, n.slug), "_blank");
    return;
  }

  // "lista" y "contenido" ya no son pestañas principales por sí solas:
  // hay que activar la pestaña principal y luego su subpestaña. Comentarios,
  // Encuestas, Newsletter, Historial y Redes sociales tampoco: ahora viven
  // como subpestañas de "Funcionalidades".
  const destinos = {
    lista: { tab: "noticias", subtab: "lista" },
    contenido: { tab: "contenido", subtab: "ver" },
    resultados: { tab: "resultados", subtab: "resultado" },
    comentarios: { tab: "funcionalidades", subtab: "comentarios" },
    encuestas: { tab: "funcionalidades", subtab: "encuestas" },
    newsletter: { tab: "funcionalidades", subtab: "newsletter" },
    historial: { tab: "funcionalidades", subtab: "historial" },
    redes: { tab: "funcionalidades", subtab: "redesSociales" },
  };
  const destino = destinos[n.tab] || { tab: n.tab, subtab: n.subtab };
  const btnTab = document.querySelector(`.tabs button[data-tab="${destino.tab}"]`);
  if (btnTab) btnTab.click();
  if (destino.subtab) {
    const btnSubtab = document.querySelector(`#panel-${destino.tab} .subtabs button[data-subtab="${destino.subtab}"]`);
    if (btnSubtab) btnSubtab.click();
  }

  // Para "resultado pendiente" se abre directamente ese partido en el
  // formulario de edición, igual que si se pulsara "Editar" en la lista.
  if (n.tab === "resultados" && n.resultadoId) {
    apiFetch(`/api/results?limit=200`).then(({ results = [] }) => {
      const r = results.find(res => String(res.id) === String(n.resultadoId));
      if (r) editarResultado(r);
    }).catch(() => {});
  }
}

function marcarNotificacionesVistas() {
  const ahora = new Date().toISOString();
  ultimaVisitaNotifServidor = ahora;
  localStorage.setItem(NOTIF_CLAVE, ahora);
  apiFetch(`/api/me/notif-visto`, { method: "PUT" }).catch(() => {});
  const contador = document.getElementById("notifContador");
  if (contador) contador.style.display = "none";
  document.querySelectorAll("#notifLista .notif-item.no-leida").forEach(el => el.classList.remove("no-leida"));
}

function logout() {
  localStorage.removeItem("eof_token");
  localStorage.removeItem("eof_user");
  location.href = "login.html";
}

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
}

// Esta función se llama igual que la apiFetch() de failover definida en
// js/config.js (cargado antes que este archivo en panel.html), pero es una
// función distinta con más responsabilidad: añade cabeceras de
// autenticación y gestiona el cierre de sesión en 401. Como una function
// declaration con el mismo nombre en este mismo script quedaría hoisteada
// y se sombrearía a sí misma (capturar "apiFetch" en una constante aquí
// dentro apuntaría a esta misma función, no a la de config.js, causando
// recursión infinita), se llama explícitamente a window.eofApiFetch — el
// motor de failover expuesto aparte en config.js para este caso.
async function apiFetch(path, options = {}) {
  const res = await window.eofApiFetch(path, { ...options, headers: authHeaders() });
  if (res.status === 401) {
    logout();
    // logout() ya redirige a login.html; devolvemos un objeto vacío para
    // que el código que llama (p.ej. "const { articles } = await ...")
    // no falle con un TypeError mientras la página termina de navegar.
    return {};
  }
  // Las ESCRITURAS (POST/PUT/DELETE) no se reintentan automáticamente en
  // la secundaria si la primaria falla (ver apiFetch en config.js: evita
  // duplicar datos cuando no se sabe si la escritura ya se aplicó). En
  // ese caso, lo que llega aquí es la respuesta de error TAL CUAL de la
  // primaria caída -y con una plataforma como Cloudflare delante, eso
  // suele ser una página HTML de error (empieza por "<!DOCTYPE ..."), no
  // el JSON que genera nuestro propio Worker. Antes esto se intentaba
  // parsear igualmente con res.json() y reventaba con "Unexpected token
  // '<'... is not valid JSON", un mensaje que no dice nada del problema
  // real al usuario (ver caso real: importación de partidos con la
  // primaria caída). Se detecta ANTES de parsear, comprobando el
  // Content-Type, y se lanza un error legible en su lugar.
  const contentType = res.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    const err = new Error(
      "La API principal no está respondiendo ahora mismo. Esta acción no se reintenta " +
      "automáticamente en la secundaria para no duplicar datos: espera a que la principal " +
      "se recupere y vuelve a intentarlo."
    );
    err.status = res.status;
    err.data = null;
    throw err;
  }
  const data = await res.json();
  if (!res.ok) {
    // Se cuelga el JSON completo del error (no solo el mensaje) para que
    // quien llame pueda leer campos extra como "posible_duplicado" /
    // "partido_existente" (ver POST /api/results) sin tener que volver a
    // parsear la respuesta. El resto del código que solo hace
    // "catch (err) { ... err.message ... }" sigue funcionando igual.
    // Antes, si el JSON de error no traía campo "error" (p. ej. un 502/503
    // real del servidor, o una respuesta inesperada de la secundaria de
    // Railway sin ese campo), se caía en el literal "Error" a secas, y como
    // casi todos los sitios que capturan esto hacen
    // EOF.toast("Error: " + err.message, ...), el aviso que veía el
    // redactor era literalmente "Error: Error" -sin ninguna pista de qué
    // había fallado de verdad-. Se incluye ahora el código de estado HTTP
    // para que, aunque el backend no traiga un mensaje legible, quede
    // claro que fue un fallo del servidor y con qué código, en vez de un
    // mensaje vacío de contenido.
    const err = new Error(data.error || `Error del servidor (${res.status})`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

// Sube una única imagen suelta (foto de perfil, una foto de una noticia,
// etc.) y devuelve su URL en Cloudinary ya lista para pegar en el campo
// correspondiente. A diferencia de la mediateca de "Subir contenido",
// esta subida no queda guardada en ningún listado del panel: solo sirve
// para conseguir la URL de la imagen.
// Contador global de subidas de foto en curso (portada/galería/collage de
// la noticia). Antes no existía nada parecido: si se pulsaba "Guardar"
// mientras una subida todavía estaba en marcha (subirImagenSuelta tarda
// un par de segundos), el campo oculto de esa foto seguía vacío en ese
// instante y obtenerImagenesFormulario() la descartaba sin más
// (.filter(img => img.url !== "")); la noticia se guardaba solo con la
// portada (u otras fotos ya subidas antes) y sin ningún error visible,
// porque a nivel de red no fallaba nada: la petición de guardado
// terminaba en "Ok" igual, solo que con una foto de menos en el body. Ver
// guardarArticulo(), que ahora comprueba este contador antes de guardar.
let SUBIDAS_IMAGEN_EN_CURSO = 0;

async function subirImagenSuelta(file) {
  SUBIDAS_IMAGEN_EN_CURSO++;
  try {
    const formData = new FormData();
    formData.append("imagen", file, file.name);
    let res;
    try {
      res = await fetch(`${API_URL}/api/subir-imagen`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}` },
        body: formData,
      });
    } catch (err) {
      // fetch() solo lanza si la petición ni siquiera ha llegado a tener
      // respuesta (sin conexión, DNS caído, CORS...); se distingue de un
      // error del servidor para no decir "no se pudo subir la imagen" a
      // secas cuando en realidad es un problema de conexión del navegador.
      throw new Error("No se ha podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.");
    }
    let data = {};
    try {
      data = await res.json();
    } catch {
      // Respuesta no-JSON: normalmente un 413 (archivo demasiado grande
      // para el servidor) o una caída a medio subir, casos en los que el
      // cuerpo de la respuesta no es JSON parseable.
      if (res.status === 413) throw new Error("El archivo es demasiado grande para el servidor");
      if (res.status >= 500) throw new Error("Error del servidor. Inténtalo de nuevo en unos minutos");
      throw new Error(`No se pudo subir la imagen (error ${res.status})`);
    }
    if (!res.ok) throw new Error(data.error || `No se pudo subir la imagen (error ${res.status})`);
    return data.url;
  } finally {
    SUBIDAS_IMAGEN_EN_CURSO--;
  }
}

// Icono de "subir imagen" (flecha hacia una bandeja) usado en los
// botones de subida de foto de perfil y fotos de noticia/crónica.
function iconoSubirImagen() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.5V4M12 4l-4 4M12 4l4 4"/><path d="M4.5 16v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V16"/></svg>`;
}

// Icono de "punto de mira" (elegir qué parte de la foto no se recorta)
// usado en el botón que abre el panel de foco de cada imagen.
function iconoFoco() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>`;
}

// ---------- Tabs ----------
const tituloSeccion = document.getElementById("tituloSeccion");
document.querySelectorAll(".tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("activo"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("activo"));
    btn.classList.add("activo");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("activo");
    if (btn.dataset.tab === "noticias" && document.getElementById("subpanel-lista").classList.contains("activo")) cargaListaArticulos();
    if (btn.dataset.tab === "resultados" && document.getElementById("subpanel-listaResultados").classList.contains("activo")) cargaListaResultados();
    if (btn.dataset.tab === "funcionalidades") {
      const subtabActivo = document.querySelector("#subtabsFuncionalidades button.activo");
      if (subtabActivo) cargaSubtabFuncionalidades(subtabActivo.dataset.subtab);
    }
    if (btn.dataset.tab === "contenido" && document.getElementById("subpanel-ver").classList.contains("activo")) cargaContenido();
    if (btn.dataset.tab === "usuarios") cargaUsuarios();
    if (btn.dataset.tab === "solicitudes") cargaSolicitudesEdicion();
    if (btn.dataset.tab === "tienda") {
      const subtabActivo = document.querySelector("#subtabsTienda button.activo");
      if (subtabActivo) cargaSubtabTienda(subtabActivo.dataset.subtab);
    }
    // "Funcionalidades" y "Usuarios" son exclusivas (o casi) de
    // administrador, así que la cabecera pasa a decir "Administración".
    // Para un redactor, "Funcionalidades" solo da acceso a Equipos, así
    // que se queda como "Redacción".
    const esFuncionalidadesSoloAdmin = btn.dataset.tab === "funcionalidades" && USER.rol === "admin";
    if (tituloSeccion) tituloSeccion.textContent = (esFuncionalidadesSoloAdmin || btn.dataset.tab === "usuarios") ? "Administración" : (btn.dataset.tab === "ajustes" ? "Ajustes de cuenta" : "Redacción");
  });
});

// Carga los datos correspondientes al abrir cada subtab de nivel 2 dentro
// de "Funcionalidades" (Comentarios, Encuestas, Newsletter, Historial,
// Redes sociales, Equipos), igual que antes hacía cada tab de primer nivel.
function cargaSubtabFuncionalidades(subtab) {
  if (subtab === "comentarios") cargaComentarios("pendiente");
  if (subtab === "encuestas") cargaEncuestas();
  if (subtab === "newsletter") cargaNewsletter();
  if (subtab === "historial") cargaHistorial();
  if (subtab === "redesSociales") cargaRedesSociales();
  if (subtab === "equipos") cargaEquiposInfo();
}

// Un redactor no tiene el subtab "Redes sociales" (ni Comentarios,
// Newsletter, Historial), así que al entrar en "Funcionalidades" le
// mostramos directamente Equipos.
document.getElementById("tabFuncionalidades")?.addEventListener("click", () => {
  if (USER.rol === "admin") return;
  document.querySelectorAll("#subtabsFuncionalidades button").forEach(b => b.classList.remove("activo"));
  document.querySelectorAll("#panel-funcionalidades > .subpanel").forEach(p => p.classList.remove("activo"));
  document.getElementById("subtabsFuncionalidades").querySelector('[data-subtab="equipos"]').classList.add("activo");
  document.getElementById("subpanel-equipos").classList.add("activo");
  cargaEquiposInfo();
});

// ---------- SUBPESTAÑAS: Noticias, Resultados y Contenido ----------
// Un único manejador genérico para cualquier bloque de subpestañas
// (antes solo existía para "Contenido", por lo que "Ver noticias" y
// "Ver resultados" no reaccionaban al hacer clic).
document.querySelectorAll(".subtabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    // El contenedor directo de este bloque de subtabs: puede ser un
    // ".panel" (nivel 2, ej. Noticias, Usuarios) o un ".subpanel" (nivel 3,
    // ej. Comentarios dentro de Funcionalidades). Usamos el padre inmediato
    // del bloque ".subtabs" en vez de ".closest('.panel')" para no
    // "escaparnos" al nivel de arriba cuando hay subtabs anidados.
    const contenedor = btn.closest(".subtabs").parentElement;
    contenedor.querySelectorAll(":scope > .subtabs button").forEach(b => b.classList.remove("activo"));
    contenedor.querySelectorAll(":scope > .subpanel").forEach(p => p.classList.remove("activo"));
    btn.classList.add("activo");
    document.getElementById("subpanel-" + btn.dataset.subtab).classList.add("activo");
    if (btn.dataset.subtab === "ver") cargaContenido();
    if (btn.dataset.subtab === "lista") cargaListaArticulos();
    if (btn.dataset.subtab === "listaResultados") cargaListaResultados();
    if (btn.dataset.subtab === "sesiones") cargaSesiones();
    if (btn.dataset.subtab === "progreso") cargaMiProgreso();
    if (btn.dataset.subtab === "solicitudesRecibidas") cargaSolicitudesEdicion();
    if (btn.dataset.subtab === "solicitudesMias") cargaSolicitudesEdicion();
    if (btn.dataset.subtab === "lectores") cargaLectores();
    if (["tiendaCatalogo", "tiendaMisPedidos", "tiendaGestion", "tiendaProductos"].includes(btn.dataset.subtab)) cargaSubtabTienda(btn.dataset.subtab);
    // Subtabs de nivel 2 dentro de "Funcionalidades" (Comentarios,
    // Encuestas, Newsletter, Historial, Redes sociales, Equipos)
    if (contenedor.id === "panel-funcionalidades") cargaSubtabFuncionalidades(btn.dataset.subtab);
    // Subtabs de nivel 3, dentro de "Comentarios"
    if (btn.dataset.subtab === "comentariosPendientes") cargaComentarios("pendiente");
    if (btn.dataset.subtab === "comentariosAprobados") cargaComentarios("aprobado");
    if (btn.dataset.subtab === "comentariosRechazados") cargaComentarios("rechazado");
    if (btn.dataset.subtab === "comentariosDenunciados") cargaComentariosDenunciados();
  });
});

// ---------- ARTÍCULOS: club según categoría ----------
const selectCategoria = document.getElementById("categoria");

// Todos los clubes de todas las categorías federativas, para los casos en
// los que un club no está atado a una sola liga (amistosos, contenido
// subido sin categoría concreta, etc.).
function listaTodosLosClubesFederativos() {
  return [
    ...(typeof getClubsForCategoria === "function" ? getClubsForCategoria("hypermotion") : []),
    ...(typeof getClubsForCategoria === "function" ? getClubsForCategoria("primera_federacion") : []),
    ...(typeof getClubsForCategoria === "function" ? getClubsForCategoria("segunda_federacion") : []),
  ];
}

function poblarClubs(categoria, clubSeleccionado) {
  selectClub.innerHTML = '<option value="">General</option>';

  if (categoria === "arbitraje" || categoria === "jurisdiccion") {
    // Una noticia de "Arbitraje" o "Jurisdicción deportiva" no está atada
    // a un club concreto, sino a una competición completa (puede hablar
    // en general o de una liga específica), así que el desplegable
    // ofrece únicamente las tres competiciones federativas, además de
    // "General".
    const competiciones = ["LaLiga Hypermotion", "Primera Federación", "Segunda Federación"];
    competiciones.forEach((nombre) => {
      const opt = document.createElement("option");
      opt.value = nombre;
      opt.textContent = nombre;
      selectClub.appendChild(opt);
    });
    // Si el valor guardado no es "General" ni ninguna de las tres
    // competiciones (p. ej. venía de un club concreto de cuando el
    // desplegable listaba clubes), se añade suelto para no perder el dato
    // al editar.
    if (clubSeleccionado && !competiciones.includes(clubSeleccionado)) {
      const opt = document.createElement("option");
      opt.value = clubSeleccionado;
      opt.textContent = clubSeleccionado + " (no está en la lista actual)";
      selectClub.appendChild(opt);
    }
    selectClub.value = clubSeleccionado || "";
    selectClub.disabled = false;
    return;
  }

  // Un amistoso no pertenece a ninguna competición concreta, así que en
  // vez de dejar el desplegable de club vacío/bloqueado (como pasaba
  // antes, sin sentido para una crónica de amistoso) se ofrecen los
  // clubes de todas las categorías para poder elegir cualquiera de ellos.
  const clubes = categoria === "amistoso"
    ? listaTodosLosClubesFederativos().sort((a, b) => a.localeCompare(b))
    : (typeof getClubsForCategoria === "function" ? getClubsForCategoria(categoria) : []);
  clubes.forEach((club) => {
    const opt = document.createElement("option");
    opt.value = club;
    opt.textContent = club;
    selectClub.appendChild(opt);
  });
  // Si el artículo ya tenía un club guardado que ya no está en la lista
  // (nombre antiguo, club descendido de categoría, etc.) lo añadimos
  // igualmente para no perder el dato al editar.
  if (clubSeleccionado && !clubes.includes(clubSeleccionado)) {
    const opt = document.createElement("option");
    opt.value = clubSeleccionado;
    opt.textContent = clubSeleccionado + " (no está en la lista actual)";
    selectClub.appendChild(opt);
  }
  selectClub.value = clubSeleccionado || "";

  // La categoría "General" (y cualquier otra sin clubes propios) no tiene
  // clubes entre los que elegir: el club se fija automáticamente en
  // "General" y el desplegable se bloquea. Las categorías con clubes
  // (Hypermotion, Primera/Segunda Federación...) obligan a elegir uno.
  selectClub.disabled = clubes.length === 0;
}

selectCategoria.addEventListener("change", () => poblarClubs(selectCategoria.value, ""));
selectCategoria.addEventListener("change", () => {
  if (categoriasAdicionalesPicker) {
    categoriasAdicionalesPicker.actualizarOpciones(
      categoriasFijasDeAutor(selectAutor ? selectAutor.value : USER.id).length
        ? categoriasFijasDeAutor(selectAutor ? selectAutor.value : USER.id)
        : Object.keys(CATEGORIES),
      selectCategoria.value
    );
  }
});
poblarClubs(selectCategoria.value, "");

// ---------- ARTÍCULOS: categoría según categoría(s) fija(s) del autor ----------
// Un redactor "sin equipo, con categoría fija" (p. ej. de Arbitraje) solo
// puede firmar noticias de esa categoría. Si el autor elegido en el
// formulario (él mismo, o quien elija un admin en "autor_id") tiene
// alguna categoría fija, el desplegable de Categoría se repuebla solo con
// esas opciones; si no tiene ninguna, se muestra la lista completa de
// siempre. Con una sola categoría fija queda fija de facto (desplegable
// bloqueado); con varias, el redactor elige entre ellas.
function categoriasFijasDeAutor(autorId) {
  const idNum = parseInt(autorId, 10);
  if (idNum === USER.id) return USER.categorias_fijas || [];
  const autor = AUTORES_CACHE[idNum];
  return (autor && autor.categorias_fijas) || [];
}
function poblarCategoriaSegunAutor(autorId, categoriaSeleccionada) {
  const fijas = categoriasFijasDeAutor(autorId);
  const valorPrevio = categoriaSeleccionada !== undefined ? categoriaSeleccionada : selectCategoria.value;
  if (!fijas.length) {
    // Redactor normal: se restaura la lista completa de categorías (por
    // si antes se había repoblado con las fijas de otro autor).
    selectCategoria.innerHTML = Object.entries(CATEGORIES).map(([valor, etiqueta]) =>
      `<option value="${valor}">${escapeHtml(etiqueta)}</option>`
    ).join("");
    selectCategoria.disabled = false;
    selectCategoria.value = valorPrevio || "hypermotion";
    if (selectCategoria.value !== (valorPrevio || "hypermotion")) selectCategoria.value = "hypermotion";
  } else {
    selectCategoria.innerHTML = fijas.map((valor) =>
      `<option value="${valor}">${escapeHtml(categoriaLabel(valor))}</option>`
    ).join("");
    selectCategoria.value = fijas.includes(valorPrevio) ? valorPrevio : fijas[0];
    // Con una única categoría fija no tiene sentido dejar elegir: se
    // bloquea el desplegable (mismo criterio que con Club en "General").
    selectCategoria.disabled = fijas.length === 1;
  }
  // Se conserva el club que ya estuviera seleccionado (p. ej. el que
  // acaba de rellenar editarArticulo() al cargar una noticia existente):
  // esta función solo tiene que ajustar la lista de categorías según el
  // autor, no debe borrar el club ya elegido.
  poblarClubs(selectCategoria.value, selectClub.value);
  // Las categorías adicionales también quedan restringidas a las fijas
  // del autor (si tiene), igual que la principal, y nunca pueden repetir
  // la que acabe de quedar seleccionada como principal.
  if (categoriasAdicionalesPicker) {
    categoriasAdicionalesPicker.actualizarOpciones(fijas.length ? fijas : Object.keys(CATEGORIES), selectCategoria.value);
  }
}

// ---------- DESTACADA depende de PUBLICADA (excepto si está programada) ----------
// Una noticia en borrador (ni publicada ni programada) no puede marcarse
// como destacada: no tiene sentido, todavía no va a aparecer en ningún
// sitio. Pero una noticia PROGRAMADA sí puede marcarse como destacada de
// antemano, para que en cuanto se publique sola (el cron la marca
// publicado=1 sin tocar destacado, ver publicarArticulosProgramados en
// el Worker) aparezca ya destacada en portada sin tener que volver a
// entrar a editarla en el momento exacto de la publicación.
const checkDestacado = document.getElementById("destacado");
const checkPublicado = document.getElementById("publicado");
const checkBannerUrgente = document.getElementById("bannerUrgente");

// Pinta, junto al checkbox de "Última hora", cuánto tiempo le queda
// activo (dato que solo llega al cargar una noticia ya guardada con el
// banner encendido: banner_urgente_hasta lo calcula siempre el
// servidor, nunca se manda desde aquí). Si ya ha caducado en el
// intervalo entre que se cargó el listado y se abrió el formulario, se
// desmarca solo y no se muestra ningún tiempo.
function actualizarEstadoBannerUrgente(articulo) {
  const span = document.getElementById("bannerUrgenteEstado");
  if (!checkBannerUrgente || !span) return;
  if (!articulo || !articulo.banner_urgente || !articulo.banner_urgente_hasta) {
    span.style.display = "none";
    span.textContent = "";
    return;
  }
  const restanteMs = new Date(articulo.banner_urgente_hasta).getTime() - Date.now();
  if (restanteMs <= 0) {
    checkBannerUrgente.checked = false;
    span.style.display = "none";
    span.textContent = "";
    return;
  }
  const minutosTotales = Math.round(restanteMs / 60000);
  const horas = Math.floor(minutosTotales / 60);
  const minutos = minutosTotales % 60;
  const restanteLabel = horas > 0 ? `${horas}h ${minutos}min` : `${minutos}min`;
  span.style.display = "";
  span.textContent = `🔴 Activo — quedan ${restanteLabel}`;
}
function sincronizarDestacadoConPublicado() {
  const programada = Boolean(checkProgramarNoticia?.checked);
  if (!checkPublicado.checked && !programada) {
    checkDestacado.checked = false;
    checkDestacado.disabled = true;
  } else {
    checkDestacado.disabled = false;
  }
}
checkPublicado.addEventListener("change", sincronizarDestacadoConPublicado);
sincronizarDestacadoConPublicado();

// ---------- PROGRAMAR PUBLICACIÓN (admin o redactor Nivel 2+) ----------
// Un administrador siempre puede dejar una noticia programada. A partir
// de Nivel 2 un redactor ya publica directo sin PIN de "Última hora", así
// que también tiene sentido que pueda programar (a Nivel 1 no: como ni
// siquiera puede publicar directo, tampoco tiene sentido que programe).
const bloqueProgramarNoticia = document.getElementById("bloqueProgramarNoticia");
const campoFechaProgramada = document.getElementById("campoFechaProgramada");
const inputProgramadoPara = document.getElementById("programadoPara");
const ayudaProgramarNoticia = document.getElementById("ayudaProgramarNoticia");

// USER.nivel se refresca al arrancar el panel (ver refrescarNivelUsuario),
// así que un ascenso reciente ya se refleja aquí sin volver a iniciar sesión.
function puedeProgramarNoticia() {
  return USER.rol === "admin" || (USER.nivel || 1) >= 2;
}

if (puedeProgramarNoticia() && bloqueProgramarNoticia) {
  bloqueProgramarNoticia.style.display = "";
}

// Mismo umbral de permiso que activarBanner en el backend (admin o
// Nivel 2+, ver worker/src/index.js): si el redactor no llega, ni
// siquiera se le muestra el checkbox, en vez de dejarle marcarlo y que
// el servidor lo ignore en silencio.
const bloqueBannerUrgente = document.getElementById("bloqueBannerUrgente");
if (!puedeProgramarNoticia()) {
  if (bloqueBannerUrgente) bloqueBannerUrgente.style.display = "none";
  const avisoBannerUrgentePermiso = document.getElementById("avisoBannerUrgentePermiso");
  if (avisoBannerUrgentePermiso) avisoBannerUrgentePermiso.style.display = "none";
}

function sincronizarProgramarConPublicado() {
  if (!bloqueProgramarNoticia || !puedeProgramarNoticia()) return;
  // Programar solo tiene sentido si la noticia se va a guardar como NO
  // publicada ahora mismo (se publicará sola más adelante); si se marca
  // "Publicada" no tiene sentido programar, así que se desmarca sola
  // (no se deshabilita: así, si el redactor la marca de nuevo, el
  // listener de "publicado" vuelve a pasar por aquí y la desmarca otra
  // vez, en vez de quedarse deshabilitada para siempre sin poder usarla).
  if (checkPublicado.checked && checkProgramarNoticia.checked) {
    checkProgramarNoticia.checked = false;
    campoFechaProgramada.style.display = "none";
    ayudaProgramarNoticia.style.display = "none";
  }
}
checkPublicado?.addEventListener("change", sincronizarProgramarConPublicado);

// Al marcar "Programar publicación" se desmarca "Publicada" (no tiene
// sentido tener las dos a la vez: o se publica ya, o se publica sola más
// adelante).
checkProgramarNoticia?.addEventListener("change", () => {
  if (checkProgramarNoticia.checked && checkPublicado.checked) {
    checkPublicado.checked = false;
    sincronizarDestacadoConPublicado();
  }
});

function sincronizarCampoFechaProgramada() {
  if (!checkProgramarNoticia) return;
  const activo = checkProgramarNoticia.checked;
  campoFechaProgramada.style.display = activo ? "" : "none";
  ayudaProgramarNoticia.style.display = activo ? "" : "none";
  if (!activo) inputProgramadoPara.value = "";
}
checkProgramarNoticia?.addEventListener("change", () => { sincronizarCampoFechaProgramada(); actualizarTextoBotonGuardar(); sincronizarDestacadoConPublicado(); });
inputProgramadoPara?.addEventListener("change", actualizarTextoBotonGuardar);
sincronizarProgramarConPublicado();
sincronizarCampoFechaProgramada();

// Convierte el valor del <input type="datetime-local"> a un ISO string en
// UTC para mandarlo al backend. El valor del input ("YYYY-MM-DDTHH:MM") es
// SIEMPRE la hora de Madrid tal y como la escribe quien programa la
// noticia (así se le pide en la etiqueta del campo), pero `new Date(...)`
// sin zona horaria lo interpreta con el huso horario del propio
// dispositivo/navegador, no necesariamente el de Madrid: si quien
// administra tiene el sistema en otra zona (o mal detectada), la hora
// programada se guardaba desplazada -típicamente 1-2h, según la época
// del año-, aunque el texto que veía en el campo fuese el correcto. Se
// calcula el offset real de Madrid en ese instante con Intl (mismo
// mecanismo que offsetMadridEnMinutos en el Worker para fecha_partido)
// en vez de fiarse del huso horario del navegador.
function offsetMadridEnMinutos(instante) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instante).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  const comoSiFueraUTC = Date.UTC(
    partes.year, partes.month - 1, partes.day, partes.hour, partes.minute, partes.second
  );
  return Math.round((comoSiFueraUTC - instante.getTime()) / 60000);
}

function programadoParaISO() {
  if (!checkProgramarNoticia?.checked || !inputProgramadoPara.value) return null;
  // Se interpreta primero el texto del input como si fuese UTC (para
  // tener un instante de referencia con el que preguntarle a Intl el
  // offset de Madrid vigente en esa fecha), y luego se le resta ese
  // offset para obtener el instante UTC real equivalente a esa hora en
  // Madrid.
  const comoSiFueraUTC = new Date(`${inputProgramadoPara.value}:00Z`);
  if (isNaN(comoSiFueraUTC.getTime())) return null;
  const offset = offsetMadridEnMinutos(comoSiFueraUTC);
  const fecha = new Date(comoSiFueraUTC.getTime() - offset * 60000);
  // El input <datetime-local> solo tiene granularidad de minuto, así que
  // comparamos por minuto en vez de por milisegundo exacto: si el usuario
  // elige "dentro de 1 minuto" no debe rechazarse solo porque, para cuando
  // se valida, ya han pasado unos segundos y el reloj exacto lo supera.
  // Solo se rechaza si el minuto elegido ya quedó atrás.
  const inicioMinutoActual = Math.floor(Date.now() / 60000) * 60000;
  if (fecha.getTime() < inicioMinutoActual) return null;
  return fecha.toISOString();
}

// Convierte un ISO string (UTC) guardado en el backend al formato que
// espera el <input type="datetime-local"> (hora local del navegador).
// Conversión inversa a programadoParaISO: a partir del ISO en UTC que
// devuelve el backend, reconstruye el texto "YYYY-MM-DDTHH:MM" que hay
// que ponerle al <input type="datetime-local"> para que muestre esa
// hora EN MADRID (no la hora local del dispositivo que esté editando,
// que puede no coincidir). Se usa Intl con timeZone:"Europe/Madrid" en
// vez de los getters locales del objeto Date (getHours/getMinutes),
// que devuelven la hora del huso horario del propio navegador.
function isoAProgramadoParaInput(iso) {
  if (!iso) return "";
  // "iso" puede venir tal cual lo guarda SQLite ("YYYY-MM-DD HH:MM:SS",
  // UTC pero SIN "T"/"Z"), no solo como ISO string completo. Sin forzar
  // aquí que se interprete como UTC, "new Date(...)" lo toma como hora
  // LOCAL del navegador (no UTC), así que en Madrid (UTC+1/+2) la hora
  // quedaba adelantada/atrasada respecto a la real, y al reformatearla
  // "en Madrid" más abajo se aplicaba el offset una segunda vez sobre
  // una base ya incorrecta: el input mostraba, y por tanto al guardar
  // reprogramaba, 1-2h antes de la hora original.
  const fecha = new Date(iso.includes("T") || iso.endsWith("Z") ? iso : `${iso.replace(" ", "T")}Z`);
  if (isNaN(fecha.getTime())) return "";
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(fecha).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

// ---------- EQUIPOS DE UN USUARIO (perfil propio / crear usuario / tabla) ----------
// A diferencia del club de una noticia (ligado a la categoría elegida),
// los equipos de una persona pueden ser cualquier club de cualquier
// categoría, así que la lista siempre ofrece todos. Cada persona puede
// tener hasta 3 equipos asignados, o ninguno.
//
// iniciarEquiposPicker() monta el widget de chips seleccionables dentro
// de un contenedor con la estructura:
//   <div class="equipos-picker">
//     <span class="equipos-picker-contador"></span>          (cabecera)
//     <input class="equipos-picker-buscador">                (buscador)
//     <div class="equipos-picker-lista"></div>                (chips)
//     <p class="equipos-picker-ayuda"></p>                    (aviso)
//   </div>
// Se usa en "Crear nuevo usuario" y en el modal de "Editar equipos" de
// la tabla de usuarios. Devuelve funciones para leer/fijar la selección
// y para saber si es válida (0 a 3 equipos).
function iniciarEquiposPicker({ contadorEl, buscadorEl, listaEl, ayudaEl }, equiposIniciales = []) {
  const todos = listaTodosLosClubesFederativos().sort((a, b) => a.localeCompare(b));
  // Por si algún equipo guardado ya no está en la lista actual de clubes,
  // se añade igualmente al final para no perder el dato.
  const extra = (equiposIniciales || []).filter((e) => !todos.includes(e));
  const clubes = [...todos, ...extra];
  let seleccionados = new Set(equiposIniciales || []);

  function actualizarAyudaYContador() {
    const n = seleccionados.size;
    contadorEl.textContent = `${n} seleccionado${n === 1 ? "" : "s"}`;
    contadorEl.classList.remove("completo", "excedido");
    if (n === 3) contadorEl.classList.add("completo");
    if (n > 3) contadorEl.classList.add("excedido");
    if (n > 3) {
      ayudaEl.textContent = "Como máximo se pueden elegir 3 equipos: quita alguno.";
      ayudaEl.classList.add("aviso");
    } else {
      ayudaEl.textContent = "Puedes elegir hasta 3 equipos (o ninguno).";
      ayudaEl.classList.remove("aviso");
    }
  }

  function render(filtro = "") {
    const filtroNorm = normalizarBusquedaPanel(filtro);
    listaEl.innerHTML = "";
    clubes
      .filter((club) => !filtroNorm || normalizarBusquedaPanel(club).includes(filtroNorm))
      .forEach((club) => {
        const marcado = seleccionados.has(club);
        const label = document.createElement("label");
        label.className = "equipos-picker-chip" + (marcado ? " seleccionado" : "");
        label.innerHTML = `<input type="checkbox" ${marcado ? "checked" : ""}> ${escapeHtml(club)}`;
        label.querySelector("input").addEventListener("change", (e) => {
          if (e.target.checked) {
            if (seleccionados.size >= 3) {
              e.target.checked = false;
              return; // No se deja marcar un 4º: hay que desmarcar antes otro.
            }
            seleccionados.add(club);
          } else {
            seleccionados.delete(club);
          }
          label.classList.toggle("seleccionado", e.target.checked);
          actualizarAyudaYContador();
        });
        listaEl.appendChild(label);
      });
  }

  render();
  actualizarAyudaYContador();
  buscadorEl.value = "";
  buscadorEl.oninput = () => render(buscadorEl.value);

  return {
    obtenerSeleccion: () => [...seleccionados],
    // Válido mientras no se pasen de 3.
    esValido: () => seleccionados.size <= 3,
  };
}

// ---------- ARTÍCULOS: categoría(s) adicional(es) ----------
// Mismo widget de chips con buscador que iniciarCategoriasFijasPicker(),
// pero para las categorías adicionales de una noticia (ver
// worker/schema.sql, columna "categorias_adicionales"): simples
// etiquetas informativas aparte de la principal, con un máximo de 4 y
// sin poder repetir la que esté elegida como principal. Si el autor de
// la noticia tiene categoría(s) fija(s) asignada(s), las opciones
// disponibles se restringen a esas mismas (igual que ya pasa con la
// categoría principal, ver poblarCategoriaSegunAutor), en vez de a la
// lista completa.
const MAX_CATEGORIAS_ADICIONALES = 4;
let categoriasAdicionalesPicker = null;
function iniciarCategoriasAdicionalesPicker({ contadorEl, buscadorEl, listaEl, ayudaEl }, categoriasIniciales = [], opcionesDisponibles, categoriaPrincipal) {
  let seleccionados = new Set((categoriasIniciales || []).filter((c) => c !== categoriaPrincipal));

  function opcionesActuales() {
    // Por si alguna categoría ya guardada no estuviera entre las
    // opciones actuales (p. ej. cambió la categoría fija del autor
    // después de guardarla), se añade igualmente para no perder el dato.
    const extra = [...seleccionados].filter((c) => !opcionesDisponibles.includes(c));
    return [...opcionesDisponibles, ...extra].filter((c) => c !== categoriaPrincipal);
  }

  function actualizarAyudaYContador() {
    const n = seleccionados.size;
    contadorEl.textContent = `${n} seleccionada${n === 1 ? "" : "s"}`;
    ayudaEl.textContent = n >= MAX_CATEGORIAS_ADICIONALES
      ? `Máximo ${MAX_CATEGORIAS_ADICIONALES} categorías adicionales.`
      : "Puedes dejarlo sin especificar.";
  }

  function render(filtro = "") {
    const filtroNorm = normalizarBusquedaPanel(filtro);
    listaEl.innerHTML = "";
    opcionesActuales()
      .filter((cat) => !filtroNorm || normalizarBusquedaPanel(categoriaLabel(cat)).includes(filtroNorm))
      .forEach((cat) => {
        const marcado = seleccionados.has(cat);
        const label = document.createElement("label");
        label.className = "equipos-picker-chip" + (marcado ? " seleccionado" : "");
        label.innerHTML = `<input type="checkbox" ${marcado ? "checked" : ""}> ${escapeHtml(categoriaLabel(cat))}`;
        label.querySelector("input").addEventListener("change", (e) => {
          if (e.target.checked) {
            if (seleccionados.size >= MAX_CATEGORIAS_ADICIONALES) {
              e.target.checked = false;
              EOF.toast(`Puedes seleccionar como máximo ${MAX_CATEGORIAS_ADICIONALES} categorías adicionales.`, "error");
              return;
            }
            seleccionados.add(cat);
          } else {
            seleccionados.delete(cat);
          }
          label.classList.toggle("seleccionado", e.target.checked);
          actualizarAyudaYContador();
        });
        listaEl.appendChild(label);
      });
  }

  render();
  actualizarAyudaYContador();
  buscadorEl.value = "";
  buscadorEl.oninput = () => render(buscadorEl.value);

  return {
    obtenerSeleccion: () => [...seleccionados],
    // Se llama al cambiar la categoría principal o el autor (y por tanto
    // sus categorías fijas): repuebla las opciones disponibles y quita de
    // la selección lo que ya no sea válido (la nueva principal, o una
    // categoría fuera de las fijas del nuevo autor).
    actualizarOpciones: (nuevasOpciones, nuevaCategoriaPrincipal) => {
      opcionesDisponibles = nuevasOpciones;
      categoriaPrincipal = nuevaCategoriaPrincipal;
      seleccionados = new Set([...seleccionados].filter((c) => c !== categoriaPrincipal && opcionesActuales().includes(c)));
      render(buscadorEl.value);
      actualizarAyudaYContador();
    },
    // Marca de golpe la selección inicial al cargar una noticia existente
    // en el formulario (ver editarArticulo). Se filtra igual que en
    // actualizarOpciones: nunca puede quedar marcada la categoría
    // principal ni una fuera de las opciones disponibles.
    establecerSeleccion: (categorias) => {
      seleccionados = new Set((categorias || []).filter((c) => c !== categoriaPrincipal));
      render(buscadorEl.value);
      actualizarAyudaYContador();
    },
  };
}
categoriasAdicionalesPicker = iniciarCategoriasAdicionalesPicker({
  contadorEl: document.getElementById("categorias_adicionales_contador"),
  buscadorEl: document.getElementById("categorias_adicionales_buscador"),
  listaEl: document.getElementById("categorias_adicionales_lista"),
  ayudaEl: document.getElementById("categorias_adicionales_ayuda"),
}, [], Object.keys(CATEGORIES), selectCategoria.value);

// ---------- CATEGORÍA(S) FIJA(S) DE UN USUARIO (crear usuario / tabla) ----------
// Mismo widget de chips con buscador que iniciarEquiposPicker(), pero
// sobre la lista de categorías fijas disponibles (hoy solo "Arbitraje";
// añadir más en el futuro es cosa del Worker, ver CATEGORIAS_FIJAS_VALIDAS
// -aquí solo hace falta añadir la etiqueta a CATEGORIES en config.js si
// no la tuviera ya-). A diferencia de Equipo, no hay límite de cantidad.
function iniciarCategoriasFijasPicker({ contadorEl, buscadorEl, listaEl, ayudaEl }, categoriasIniciales = []) {
  // Por si alguna categoría guardada ya no estuviera en la lista actual
  // de categorías fijas disponibles, se añade igualmente para no perder
  // el dato (mismo criterio que con un equipo descendido de categoría).
  const extra = (categoriasIniciales || []).filter((c) => !CATEGORIAS_FIJAS_DISPONIBLES.includes(c));
  const categorias = [...CATEGORIAS_FIJAS_DISPONIBLES, ...extra];
  let seleccionados = new Set(categoriasIniciales || []);

  function actualizarAyudaYContador() {
    const n = seleccionados.size;
    contadorEl.textContent = `${n} seleccionada${n === 1 ? "" : "s"}`;
    ayudaEl.textContent = n
      ? "Este redactor no tendrá equipo y solo podrá publicar en la(s) categoría(s) elegida(s)."
      : "Puedes dejarlo sin especificar.";
  }

  function render(filtro = "") {
    const filtroNorm = normalizarBusquedaPanel(filtro);
    listaEl.innerHTML = "";
    categorias
      .filter((cat) => !filtroNorm || normalizarBusquedaPanel(categoriaLabel(cat)).includes(filtroNorm))
      .forEach((cat) => {
        const marcado = seleccionados.has(cat);
        const label = document.createElement("label");
        label.className = "equipos-picker-chip" + (marcado ? " seleccionado" : "");
        label.innerHTML = `<input type="checkbox" ${marcado ? "checked" : ""}> ${escapeHtml(categoriaLabel(cat))}`;
        label.querySelector("input").addEventListener("change", (e) => {
          if (e.target.checked) seleccionados.add(cat);
          else seleccionados.delete(cat);
          label.classList.toggle("seleccionado", e.target.checked);
          actualizarAyudaYContador();
        });
        listaEl.appendChild(label);
      });
  }

  render();
  actualizarAyudaYContador();
  buscadorEl.value = "";
  buscadorEl.oninput = () => render(buscadorEl.value);

  return {
    obtenerSeleccion: () => [...seleccionados],
  };
}

// ---------- ARTÍCULOS: autor de la noticia ----------
// Cualquiera que suba una noticia puede firmarla con su propio nombre
// (por defecto) o elegir a otra persona que la haya escrito realmente.
const selectAutor = document.getElementById("autor_id");
if (selectAutor) {
  selectAutor.addEventListener("change", () => poblarCategoriaSegunAutor(selectAutor.value, ""));
}
// Segundo autor opcional (noticia firmada por dos personas). Comparte la
// misma lista de autores disponibles que el principal, con una opción
// extra de "sin segundo autor".
const selectCoautor = document.getElementById("coautor_id");
// Caché de autores (id -> datos, incluidas sus redes) para poder
// consultar su cuenta de X al compartir una noticia sin volver a pedir
// /api/autores cada vez. Se rellena en cargarAutoresSelect.
let AUTORES_CACHE = {};
async function cargarAutoresSelect(autorSeleccionado, coautorSeleccionado) {
  if (!selectAutor) return;
  const valorPrevio = autorSeleccionado !== undefined ? String(autorSeleccionado) : selectAutor.value;
  const valorCoautorPrevio = coautorSeleccionado !== undefined ? String(coautorSeleccionado || "") : (selectCoautor ? selectCoautor.value : "");
  try {
    const { autores = [] } = await apiFetch(`/api/autores`);
    AUTORES_CACHE = {};
    autores.forEach((a) => { AUTORES_CACHE[a.id] = a; });
    const opcionesAutores = autores.map(a => {
      const equipos = Array.isArray(a.equipo) ? a.equipo : (a.equipo ? [a.equipo] : []);
      const etiquetaEquipo = equipos.length ? ` — ${escapeHtml(equipos.join(" / "))}` : "";
      return { id: a.id, html: `${escapeHtml(a.nombre)}${etiquetaEquipo}${a.id === USER.id ? " (tú)" : ""}` };
    });
    selectAutor.innerHTML = opcionesAutores.map(o => `<option value="${o.id}">${o.html}</option>`).join("");
    selectAutor.value = valorPrevio || String(USER.id);
    // Si el valor guardado ya no está en la lista (usuario desactivado o
    // eliminado desde entonces), se añade igualmente para no perder de
    // quién era la noticia.
    if (selectAutor.value !== (valorPrevio || String(USER.id))) {
      const opt = document.createElement("option");
      opt.value = valorPrevio;
      opt.textContent = "Autor ya no disponible";
      selectAutor.appendChild(opt);
      selectAutor.value = valorPrevio;
    }
    if (selectCoautor) {
      selectCoautor.innerHTML = `<option value="">— Sin segundo autor —</option>` + opcionesAutores.map(o => `<option value="${o.id}">${o.html}</option>`).join("");
      selectCoautor.value = valorCoautorPrevio || "";
      if (valorCoautorPrevio && selectCoautor.value !== valorCoautorPrevio) {
        const opt = document.createElement("option");
        opt.value = valorCoautorPrevio;
        opt.textContent = "Autor ya no disponible";
        selectCoautor.appendChild(opt);
        selectCoautor.value = valorCoautorPrevio;
      }
    }
  } catch (err) {
    selectAutor.innerHTML = `<option value="${USER.id}">${escapeHtml(USER.nombre)} (tú)</option>`;
    if (selectCoautor) selectCoautor.innerHTML = `<option value="">— Sin segundo autor —</option>`;
  }
}
cargarAutoresSelect(USER.id);

// ---------- ARTÍCULOS: varias fotos ----------
// Cada noticia/crónica puede llevar varias fotos: la primera es la
// portada (la que se ve en las tarjetas) y el resto forman una pequeña
// galería dentro de la propia noticia.
const imagenesLista = document.getElementById("imagenesLista");
const btnAddImagen = document.getElementById("btnAddImagen");

// Posiciones donde puede aparecer, dentro de la noticia, cada foto que NO
// sea la portada (la portada se muestra siempre arriba del todo, como
// foto principal). El resto puede ir a la galería final o intercalarse
// dentro del propio texto.
const POSICIONES_IMAGEN = [
  { value: "galeria", label: "Galería al final", corta: "Galería" },
  { value: "inicio", label: "Dentro del texto: al principio", corta: "Al principio" },
  { value: "personalizada", label: "Dentro del texto: posición personalizada", corta: "Posición X" },
];

function crearFilaImagen(valor = "", esPortada = false, posicion = "galeria", foco = "50% 50%", trasParrafo = 1, credito = "") {
  const grupo = document.createElement("div");
  grupo.className = "fila-imagen-grupo";
  const fila = document.createElement("div");
  fila.className = "fila-imagen";
  fila.dataset.foco = foco || "50% 50%";
  fila.innerHTML = `
    <div class="imagen-preview-wrap">
      <label class="radio-portada" title="Usar esta foto como portada (tarjetas, hero y foto principal de la noticia)">
        <input type="radio" name="portadaImagen" ${esPortada ? "checked" : ""}>
        <span>Portada</span>
      </label>
      <img class="preview-imagen-fila" alt="" loading="lazy" ${valor ? `src="${escapeHtml(valor)}"` : "hidden"}>
      <input type="url" class="imagen-url-input" value="${valor ? escapeHtml(valor) : ""}" hidden>
      <button type="button" class="btn-subir-imagen" title="Subir foto desde el dispositivo" aria-label="Subir foto desde el dispositivo">${iconoSubirImagen()}</button>
      <input type="file" class="input-imagen-archivo" accept="image/*" hidden>
    </div>
    <div class="fila-imagen-controles">
      <div class="fila-imagen-controles-fila">
        <div class="imagen-posicion-chips" role="group" aria-label="Dónde aparece esta foto dentro de la noticia">
          ${POSICIONES_IMAGEN.map((p) => `<button type="button" class="imagen-posicion-chip ${p.value === posicion ? "activo" : ""}" data-posicion="${p.value}" title="${p.label}">${p.corta}</button>`).join("")}
        </div>
      </div>
      <button type="button" class="btn-elegir-parrafo" ${posicion === "personalizada" ? "" : "hidden"} title="Elegir en el texto dónde va esta foto">
        <span class="btn-elegir-parrafo-marca">✕</span>
        <span class="btn-elegir-parrafo-texto">tras párrafo ${trasParrafo || 1}</span>
      </button>
      <div class="fila-imagen-controles-fila fila-acciones">
        <button type="button" class="btn-foco" title="Elegir qué parte de la foto no se debe recortar nunca">${iconoFoco()}<span class="btn-foco-texto">Foco</span></button>
        <button type="button" class="quitar-imagen" title="Quitar esta foto">✕ Quitar</button>
      </div>
    </div>
    <div class="fila-imagen-credito">
      <input type="text" class="imagen-credito-input" placeholder="Crédito de la foto (ej. © Nombre Apellido / ELOTROFÚTBOLTV)" value="${credito ? escapeHtml(credito) : ""}">
    </div>
  `;
  fila.dataset.trasParrafo = trasParrafo || 1;
  fila.dataset.posicion = posicion;

  const chipsPosicion = [...fila.querySelectorAll(".imagen-posicion-chip")];
  const btnElegirParrafo = fila.querySelector(".btn-elegir-parrafo");
  chipsPosicion.forEach((chip) => {
    chip.addEventListener("click", () => {
      chipsPosicion.forEach((c) => c.classList.remove("activo"));
      chip.classList.add("activo");
      fila.dataset.posicion = chip.dataset.posicion;
      btnElegirParrafo.hidden = chip.dataset.posicion !== "personalizada";
      if (chip.dataset.posicion === "personalizada") abrirSelectorParrafo(fila);
    });
  });
  btnElegirParrafo.addEventListener("click", () => abrirSelectorParrafo(fila));

  const focoPanel = document.createElement("div");
  focoPanel.className = "foco-panel oculto";
  focoPanel.innerHTML = `
    <div class="foco-preview"><div class="foco-marcador"></div></div>
    <div class="foco-texto">
      <p>Esta foto se muestra siempre con la misma proporción que el ancho del texto; si hace falta recortarla, haz clic en el punto de la imagen que quieres que se vea siempre.</p>
      <button type="button" class="foco-reset">Centrar de nuevo</button>
    </div>
  `;

  const preview = focoPanel.querySelector(".foco-preview");
  const marcador = focoPanel.querySelector(".foco-marcador");
  const miniatura = fila.querySelector(".preview-imagen-fila");
  const urlInput = fila.querySelector(".imagen-url-input");

  function pintarFoco() {
    const [fx, fy] = fila.dataset.foco.split(" ");
    marcador.style.left = fx;
    marcador.style.top = fy;
    const urlActual = urlInput.value.trim();
    preview.style.backgroundImage = urlActual ? `url("${urlActual}")` : "none";
  }

  // Mantiene la miniatura pequeña de la fila sincronizada con la URL
  // guardada (venga de una foto ya existente o de una recién subida).
  function actualizarMiniatura() {
    const urlActual = urlInput.value.trim();
    if (urlActual) {
      miniatura.src = urlActual;
      miniatura.hidden = false;
    } else {
      miniatura.hidden = true;
      miniatura.removeAttribute("src");
    }
  }

  preview.addEventListener("click", (e) => {
    const rect = preview.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    fila.dataset.foco = `${Math.round(x)}% ${Math.round(y)}%`;
    pintarFoco();
  });
  focoPanel.querySelector(".foco-reset").addEventListener("click", () => {
    fila.dataset.foco = "50% 50%";
    pintarFoco();
  });

  urlInput.addEventListener("input", () => {
    pintarFoco();
    actualizarMiniatura();
  });
  fila.querySelector(".btn-foco").addEventListener("click", (btn) => {
    focoPanel.classList.toggle("oculto");
    fila.querySelector(".btn-foco").classList.toggle("activo");
    if (!focoPanel.classList.contains("oculto")) pintarFoco();
  });

  // Permite elegir una foto directamente del dispositivo: se sube a
  // Cloudinary y la URL resultante se guarda sola (en un campo oculto),
  // como si se hubiera escrito a mano.
  const btnSubirImagen = fila.querySelector(".btn-subir-imagen");
  const inputImagenArchivo = fila.querySelector(".input-imagen-archivo");
  btnSubirImagen.addEventListener("click", () => inputImagenArchivo.click());
  inputImagenArchivo.addEventListener("change", async () => {
    const file = inputImagenArchivo.files[0];
    inputImagenArchivo.value = "";
    if (!file) return;
    btnSubirImagen.disabled = true;
    btnSubirImagen.classList.add("subiendo");
    try {
      const url = await subirImagenSuelta(file);
      urlInput.value = url;
      urlInput.dispatchEvent(new Event("input"));
    } catch (err) {
      EOF.toast(err.message || "No se pudo subir la foto", "error");
    } finally {
      btnSubirImagen.disabled = false;
      btnSubirImagen.classList.remove("subiendo");
    }
  });

  fila.querySelector(".quitar-imagen").addEventListener("click", () => {
    const eraPortada = fila.querySelector('input[type="radio"]').checked;
    if (imagenesLista.children.length > 1) {
      grupo.remove();
      // Si se quita la fila que estaba marcada como portada, se marca
      // automáticamente la primera que quede para no dejarlo sin elegir.
      if (eraPortada) {
        const primera = imagenesLista.querySelector('input[type="radio"]');
        if (primera) primera.checked = true;
      }
    } else {
      urlInput.value = "";
      fila.dataset.foco = "50% 50%";
      actualizarMiniatura();
    }
  });

  actualizarMiniatura();
  pintarFoco();
  grupo.appendChild(fila);
  grupo.appendChild(focoPanel);
  imagenesLista.appendChild(grupo);
  return fila;
}

// ---------- Selector visual de "tras qué párrafo" va una foto ----------
// En vez de escribir un número a ciegas, se muestra el texto real de la
// noticia (tal y como está en el editor en ese momento) partido en sus
// bloques, y la persona hace clic justo en el hueco entre dos párrafos
// donde quiere la foto. Ese hueco se marca con una X roja.
let FILA_SELECTOR_PARRAFO_ACTUAL = null;

function abrirSelectorParrafo(fila) {
  const lista = document.getElementById("selectorParrafoLista");
  const actualTexto = document.getElementById("selectorParrafoActualTexto");
  const editor = document.getElementById("contenidoEditor");
  const bloques = editor ? [...editor.children] : [];

  FILA_SELECTOR_PARRAFO_ACTUAL = fila;
  let elegido = Math.max(1, parseInt(fila.dataset.trasParrafo, 10) || 1);

  if (bloques.length === 0) {
    lista.innerHTML = `<p class="selector-parrafo-vacio">Escribe primero el texto de la noticia para poder elegir dónde va la foto.</p>`;
    actualTexto.textContent = "Tras el párrafo 1";
  } else {
    elegido = Math.min(elegido, bloques.length);
    const partes = [];
    bloques.forEach((bloque, i) => {
      const n = i + 1;
      partes.push(`<div class="selector-parrafo-bloque">${bloque.outerHTML}</div>`);
      partes.push(
        `<div class="selector-parrafo-hueco ${elegido === n ? "elegido" : ""}" data-parrafo="${n}"><span class="selector-parrafo-hueco-marca">✕</span></div>`
      );
    });
    lista.innerHTML = partes.join("");
    actualizarTextoParrafoElegido(elegido);
    lista.querySelectorAll(".selector-parrafo-hueco").forEach((hueco) => {
      hueco.addEventListener("click", () => {
        lista.querySelectorAll(".selector-parrafo-hueco").forEach((h) => h.classList.remove("elegido"));
        hueco.classList.add("elegido");
        actualizarTextoParrafoElegido(parseInt(hueco.dataset.parrafo, 10));
      });
    });
  }

  document.getElementById("modalSelectorParrafo").classList.add("abierto");
}

function actualizarTextoParrafoElegido(n) {
  document.getElementById("selectorParrafoActualTexto").textContent = `Tras el párrafo ${n}`;
  document.getElementById("selectorParrafoActual").dataset.parrafo = n;
}

function cerrarModalSelectorParrafo() {
  document.getElementById("modalSelectorParrafo").classList.remove("abierto");
  FILA_SELECTOR_PARRAFO_ACTUAL = null;
}

document.getElementById("btnConfirmarParrafo").addEventListener("click", () => {
  if (!FILA_SELECTOR_PARRAFO_ACTUAL) return;
  const n = parseInt(document.getElementById("selectorParrafoActual").dataset.parrafo, 10) || 1;
  FILA_SELECTOR_PARRAFO_ACTUAL.dataset.trasParrafo = n;
  const btnTexto = FILA_SELECTOR_PARRAFO_ACTUAL.querySelector(".btn-elegir-parrafo-texto");
  if (btnTexto) btnTexto.textContent = `tras párrafo ${n}`;
  cerrarModalSelectorParrafo();
});

// ---------- Tweets y posts de Instagram incrustados ----------
// Un mismo botón ("+ Añadir tweet o post") y una misma lista sirven para
// las dos redes: al pegar la URL se detecta sola la plataforma
// (plataformaEmbedDesdeUrl) y se guarda en dataset.plataforma de cada
// fila, para pintar el blockquote que corresponda y cargar el widget
// oficial adecuado (widgets.js de X o embed.js de Instagram).
// Mismo esquema de posición que las fotos (ver POSICIONES_IMAGEN /
// crearFilaImagen más arriba), salvo que aquí "galería" significa "al
// final del cuerpo de la noticia" (no hay carrusel de fotos para un
// tweet o post). Cada fila vive en #tweetsLista, aparte de
// #imagenesLista, para no mezclar fotos y tweets/posts en la misma lista.
const tweetsLista = document.getElementById("tweetsLista");
const btnAddTweet = document.getElementById("btnAddTweet");
const POSICIONES_TWEET = [
  { value: "galeria", label: "Al final del artículo", corta: "Al final" },
  { value: "inicio", label: "Dentro del texto: al principio", corta: "Al principio" },
  { value: "personalizada", label: "Dentro del texto: posición personalizada", corta: "Posición X" },
];

// Carga (una sola vez cada uno) los scripts oficiales de X/Twitter y de
// Instagram para que los tweets y posts se vean aquí mismo, en el panel,
// exactamente igual que en la noticia ya publicada, en vez de un
// blockquote pelado sin estilo. Se piden por separado (cada plataforma
// solo si hace falta) para no cargar de más cuando la crónica solo lleva
// tweets, o solo posts de Instagram.
let SCRIPT_TWITTER_WIDGETS_ADMIN_CARGANDO = null;
let SCRIPT_INSTAGRAM_EMBED_ADMIN_CARGANDO = null;
function cargarWidgetsTwitterEnAdmin(contenedor) {
  if (!contenedor) return;
  if (window.twttr && window.twttr.widgets) {
    window.twttr.widgets.load(contenedor);
    return;
  }
  if (!SCRIPT_TWITTER_WIDGETS_ADMIN_CARGANDO) {
    SCRIPT_TWITTER_WIDGETS_ADMIN_CARGANDO = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      script.charset = "utf-8";
      script.onload = resolve;
      script.onerror = resolve; // sin red o bloqueado: se queda el enlace de respaldo
      document.body.appendChild(script);
    });
  }
  SCRIPT_TWITTER_WIDGETS_ADMIN_CARGANDO.then(() => window.twttr?.widgets?.load(contenedor));
}

function cargarWidgetsInstagramEnAdmin(contenedor) {
  if (!contenedor) return;
  if (window.instgrm && window.instgrm.Embeds) {
    window.instgrm.Embeds.process(contenedor);
    return;
  }
  if (!SCRIPT_INSTAGRAM_EMBED_ADMIN_CARGANDO) {
    SCRIPT_INSTAGRAM_EMBED_ADMIN_CARGANDO = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://www.instagram.com/embed.js";
      script.async = true;
      script.onload = resolve;
      script.onerror = resolve; // sin red o bloqueado: se queda el enlace de respaldo
      document.body.appendChild(script);
    });
  }
  SCRIPT_INSTAGRAM_EMBED_ADMIN_CARGANDO.then(() => window.instgrm?.Embeds?.process(contenedor));
}

// Detecta la plataforma de una URL pegada en "Añadir tweet o post" y
// carga el widget que corresponda. Un único botón sirve para las dos
// redes: se decide aquí, no en la interfaz.
function cargarWidgetEmbedEnAdmin(contenedor, plataforma) {
  if (plataforma === "instagram") cargarWidgetsInstagramEnAdmin(contenedor);
  else cargarWidgetsTwitterEnAdmin(contenedor);
}

function crearFilaTweet(url = "", posicion = "galeria", trasParrafo = 1) {
  const grupo = document.createElement("div");
  grupo.className = "fila-imagen-grupo";
  const fila = document.createElement("div");
  fila.className = "fila-imagen fila-tweet";
  fila.dataset.posicion = posicion;
  fila.dataset.trasParrafo = trasParrafo || 1;
  fila.dataset.url = url;
  const plataforma = plataformaEmbedDesdeUrl(url) || "twitter";
  fila.dataset.plataforma = plataforma;
  const urlEscapada = escapeHtml(url);
  const embedHTML = plataforma === "instagram"
    ? `<blockquote class="instagram-media" data-instgrm-permalink="${urlEscapada}" data-instgrm-version="14"></blockquote>`
    : `<blockquote class="twitter-tweet"><a href="${urlEscapada}">${urlEscapada}</a></blockquote>`;
  fila.innerHTML = `
    <div class="fila-tweet-preview">
      <div class="fila-tweet-embed">
        ${embedHTML}
      </div>
    </div>
    <div class="fila-imagen-controles">
      <div class="fila-imagen-controles-fila">
        <div class="imagen-posicion-chips" role="group" aria-label="Dónde aparece este tweet o post dentro de la noticia">
          ${POSICIONES_TWEET.map((p) => `<button type="button" class="imagen-posicion-chip ${p.value === posicion ? "activo" : ""}" data-posicion="${p.value}" title="${p.label}">${p.corta}</button>`).join("")}
        </div>
      </div>
      <button type="button" class="btn-elegir-parrafo" ${posicion === "personalizada" ? "" : "hidden"} title="Elegir en el texto dónde va este tweet">
        <span class="btn-elegir-parrafo-marca">✕</span>
        <span class="btn-elegir-parrafo-texto">tras párrafo ${trasParrafo || 1}</span>
      </button>
      <div class="fila-imagen-controles-fila fila-acciones">
        <button type="button" class="quitar-imagen" title="Quitar este tweet o post">✕ Quitar</button>
      </div>
    </div>
  `;

  const chipsPosicion = [...fila.querySelectorAll(".imagen-posicion-chip")];
  const btnElegirParrafo = fila.querySelector(".btn-elegir-parrafo");
  chipsPosicion.forEach((chip) => {
    chip.addEventListener("click", () => {
      chipsPosicion.forEach((c) => c.classList.remove("activo"));
      chip.classList.add("activo");
      fila.dataset.posicion = chip.dataset.posicion;
      btnElegirParrafo.hidden = chip.dataset.posicion !== "personalizada";
      if (chip.dataset.posicion === "personalizada") abrirSelectorParrafo(fila);
    });
  });
  btnElegirParrafo.addEventListener("click", () => abrirSelectorParrafo(fila));

  fila.querySelector(".quitar-imagen").addEventListener("click", () => grupo.remove());

  grupo.appendChild(fila);
  tweetsLista.appendChild(grupo);
  cargarWidgetEmbedEnAdmin(fila.querySelector(".fila-tweet-embed"), plataforma);
  return fila;
}

function resetTweets(valores = []) {
  tweetsLista.innerHTML = "";
  valores.forEach((v) => {
    const posicion = POSICIONES_TWEET.some((p) => p.value === v.posicion) ? v.posicion : "galeria";
    crearFilaTweet(v.url, posicion, v.trasParrafo || 1);
  });
}

// La URL queda guardada en dataset.url (no en el propio embed: el
// blockquote de Instagram no lleva ningún <a> con el enlace, a
// diferencia del de X/Twitter) para poder leerla de vuelta sin volver a
// depender del marcado interno de cada plataforma.
function obtenerTweetsFormulario() {
  return [...tweetsLista.querySelectorAll(".fila-tweet")]
    .map((fila) => {
      const posicion = fila.dataset.posicion || "galeria";
      const url = fila.dataset.url || "";
      const tweet = { tipo: "tweet", url, plataforma: fila.dataset.plataforma || "twitter", posicion };
      if (posicion === "personalizada") {
        tweet.trasParrafo = Math.max(1, parseInt(fila.dataset.trasParrafo, 10) || 1);
      }
      return tweet;
    })
    .filter((t) => t.url && plataformaEmbedDesdeUrl(t.url));
}

btnAddTweet.addEventListener("click", async () => {
  const url = await EOF.preguntar(
    "Pega la URL del tweet o post a incrustar (de x.com, twitter.com o instagram.com)",
    "",
    { placeholder: "https://x.com/usuario/status/1234567890 o https://www.instagram.com/p/AbCdEfGh" }
  );
  if (url === null) return; // cancelado
  if (!url) return;
  const plataforma = plataformaEmbedDesdeUrl(url);
  if (!plataforma) {
    EOF.toast("Esa URL no parece un enlace a un tweet o un post de Instagram concretos (debe incluir /status/... o /p/.../reel/...).", "error");
    return;
  }
  const urlLimpia = url.trim().replace(/^http:/i, "https:");
  crearFilaTweet(urlLimpia, "galeria");
});

function resetImagenes(valores = [], portadaUrl = "") {
  imagenesLista.innerHTML = "";
  if (valores.length === 0) {
    crearFilaImagen("", true, "inicio");
    return;
  }
  valores.forEach((v, i) => {
    // Admite tanto el formato antiguo (string con la URL) como el nuevo
    // (objeto con url, posición, foco de recorte y crédito).
    const esObjeto = v && typeof v === "object";
    const url = esObjeto ? v.url : v;
    // Las noticias antiguas guardadas con "medio" o "final" se muestran
    // ahora como posición personalizada, respetando su lugar aproximado
    // dentro del texto.
    let posicion = esObjeto && v.posicion ? v.posicion : "galeria";
    let trasParrafo = esObjeto && v.trasParrafo ? v.trasParrafo : 1;
    if (posicion === "medio" || posicion === "final") {
      posicion = "personalizada";
    }
    const foco = esObjeto && v.foco ? v.foco : "50% 50%";
    const credito = esObjeto && v.credito ? v.credito : "";
    crearFilaImagen(url, portadaUrl ? url === portadaUrl : i === 0, posicion, foco, trasParrafo, credito);
  });
  // Si la portada guardada no coincide con ninguna foto de la lista (caso
  // raro, p. ej. datos antiguos), se marca la primera para no dejarlo sin
  // ninguna seleccionada.
  if (!imagenesLista.querySelector('input[type="radio"]:checked')) {
    const primero = imagenesLista.querySelector('input[type="radio"]');
    if (primero) primero.checked = true;
  }
}

function obtenerImagenesFormulario() {
  return [...imagenesLista.querySelectorAll(".fila-imagen")]
    .map((fila) => {
      const posicion = fila.dataset.posicion || "galeria";
      const creditoInput = fila.querySelector(".imagen-credito-input");
      const img = {
        url: fila.querySelector(".imagen-url-input").value.trim(),
        posicion,
        foco: fila.dataset.foco || "50% 50%",
      };
      if (posicion === "personalizada") {
        img.trasParrafo = Math.max(1, parseInt(fila.dataset.trasParrafo, 10) || 1);
      }
      const credito = creditoInput ? creditoInput.value.trim() : "";
      if (credito) img.credito = credito;
      return img;
    })
    .filter((img) => img.url !== "");
}

// Foto marcada como "Portada": la que se usará como imagen_url (tarjetas,
// hero y foto principal de la noticia). No tiene por qué ser la primera.
function obtenerPortadaSeleccionada() {
  const filas = [...imagenesLista.querySelectorAll(".fila-imagen")];
  const filaMarcada = filas.find((f) => f.querySelector('input[type="radio"]').checked);
  const url = filaMarcada ? filaMarcada.querySelector(".imagen-url-input").value.trim() : "";
  // Si no hay ninguna imagen "normal" marcada como portada (ni ninguna
  // disponible), se usa la primera foto del primer collage como
  // fallback. Si no, artículos con solo collage se quedan sin
  // imagen_url y las previews (portada, tarjetas, categorías) muestran
  // el placeholder por defecto en lugar de una foto real.
  const primeraFotoCollage = (COLLAGES_ARTICULO[0]?.fotos || []).find((f) => f && f.url)?.url || "";
  return url || (obtenerImagenesFormulario()[0] || {}).url || primeraFotoCollage || "";
}

// Posición por defecto para una foto nueva, según cuántas fotos haya ya
// en la lista (la portada, que siempre es la primera, cuenta como la
// posición 1): la portada va al principio del texto y el resto, por
// defecto, a la galería final (el usuario puede elegir una posición
// personalizada dentro del texto si lo prefiere).
function posicionPorDefecto(indiceTotal) {
  if (indiceTotal === 0) return "inicio";
  return "galeria";
}

btnAddImagen.addEventListener("click", () => {
  const totalActual = imagenesLista.querySelectorAll(".fila-imagen").length;
  crearFilaImagen("", false, posicionPorDefecto(totalActual));
});
resetImagenes([]);
resetTweets([]);
pintarListaCollages();

// ---------- FICHA TÉCNICA DE LA CRÓNICA ----------
// Bloque de datos estructurados (competición, estadio, árbitro,
// goleadores, tarjetas, MVP...) editable a mano desde el formulario,
// solo visible para el tipo "cronica". Se guarda como JSON en el campo
// "ficha_tecnica" del artículo (ver worker/src/index.js,
// normalizarFichaTecnica) y se pinta en una tarjeta al final de la
// crónica en la web (ver public/js/config.js, fichaTecnicaArticuloHTML).
const bloqueFichaTecnica = document.getElementById("bloqueFichaTecnica");
const selectTipoArticulo = document.getElementById("tipo");
const listaFichaGoleadores = document.getElementById("listaFichaGoleadores");
const listaFichaTarjetas = document.getElementById("listaFichaTarjetas");
const btnAnadirGoleador = document.getElementById("btnAnadirGoleador");
const btnAnadirTarjeta = document.getElementById("btnAnadirTarjeta");

// Muestra/oculta el bloque entero según el tipo elegido. No se limpian
// los campos al ocultarlo (si el redactor cambia de "cronica" a
// "noticia" por error y vuelve a "cronica", no pierde lo que ya había
// escrito); solo se descartan de verdad al guardar (ver guardarArticulo,
// que solo manda ficha_tecnica al backend si tipo === "cronica").
function actualizarVisibilidadFichaTecnica() {
  if (!bloqueFichaTecnica || !selectTipoArticulo) return;
  bloqueFichaTecnica.style.display = selectTipoArticulo.value === "cronica" ? "" : "none";
}
selectTipoArticulo?.addEventListener("change", actualizarVisibilidadFichaTecnica);

// ---------- CLUB Y CATEGORÍA AUTOMÁTICOS PARA PREVIA/CRÓNICA ----------
// Para los tipos "previa" y "cronica" ya no se eligen el club ni la
// categoría a mano: se ocultan los desplegables normales y se sustituyen
// por un texto informativo, y ambos (los dos equipos del partido, y su
// competición) se calculan siempre a partir del resultado vinculado (ver
// fijarResultadoArticulo más abajo, y resolverClubArticulo en el
// backend, que es quien de verdad decide qué se guarda).
// CLUB_AUTOMATICO_ACTUAL y CATEGORIA_AUTOMATICA_ACTUAL guardan esos
// valores calculados (null si no hay resultado vinculado todavía, o si
// le falta el dato) para poder mandarlos en el body al guardar (ver
// guardarArticulo) sin depender de ningún <select>.
const clubWrapNormal = document.getElementById("clubWrapNormal");
const clubWrapAutomatico = document.getElementById("clubWrapAutomatico");
const clubAutomaticoTexto = document.getElementById("clubAutomaticoTexto");
const categoriaWrapNormal = document.getElementById("categoriaWrapNormal");
const categoriaWrapAutomatico = document.getElementById("categoriaWrapAutomatico");
const categoriaAutomaticoTexto = document.getElementById("categoriaAutomaticoTexto");
let CLUB_AUTOMATICO_ACTUAL = null;
let CATEGORIA_AUTOMATICA_ACTUAL = null;

function esTipoConClubAutomatico(tipo) {
  return tipo === "previa" || tipo === "cronica";
}

// Comprueba que el estado del partido vinculado sea coherente con el
// tipo de noticia: una crónica solo tiene sentido de un partido ya
// terminado, y una previa solo de uno que todavía no se ha jugado.
// Devuelve null si es compatible, o el tipo correcto ("previa" /
// "cronica") si no lo es y se puede corregir automáticamente. Un
// partido "en_juego" o "anulado" no vale para ninguno de los dos
// (mientras se está jugando no es ni previa ni crónica todavía, y uno
// anulado no llega a tener ni previa ni crónica con sentido): para esos
// casos se devuelve "noticia", que es el tipo neutro sin club/categoría
// automáticos.
function tipoCorregidoSegunEstadoResultado(tipo, resultado) {
  if (!resultado || (tipo !== "previa" && tipo !== "cronica")) return null;
  if (resultado.estado === "finalizado") {
    return tipo === "previa" ? "cronica" : null;
  }
  if (resultado.estado === "programado" || resultado.estado === "retrasado") {
    return tipo === "cronica" ? "previa" : null;
  }
  // "en_juego" o "anulado": ninguno de los dos tipos automáticos vale.
  return "noticia";
}

// Recalcula CLUB_AUTOMATICO_ACTUAL y CATEGORIA_AUTOMATICA_ACTUAL a
// partir del resultado actualmente vinculado (RESULTADOS_ARTICULO_TODOS
// + selectResultadoArticulo, ver más abajo) y actualiza los textos
// informativos. Se llama tanto al cambiar de tipo como al (des)vincular
// un resultado. Si el tipo elegido ("previa"/"cronica") no encaja con el
// estado del partido vinculado, no se deja elegido: el propio
// desplegable "Tipo" se corrige solo (a la opción contraria, o a
// "noticia" si ninguna de las dos encaja) en vez de mostrar un error,
// así el redactor nunca ve una previa/crónica inconsistente con su
// resultado vinculado.
function actualizarClubAutomatico() {
  if (!clubWrapNormal || !clubWrapAutomatico) return;
  const idResultado = typeof selectResultadoArticulo !== "undefined" ? selectResultadoArticulo.value : "";
  const resultado = idResultado && idResultado !== "__nuevo__"
    ? RESULTADOS_ARTICULO_TODOS.find((x) => String(x.id) === String(idResultado))
    : null;
  const tipoCorregido = tipoCorregidoSegunEstadoResultado(selectTipoArticulo?.value, resultado);
  if (tipoCorregido && selectTipoArticulo) {
    selectTipoArticulo.value = tipoCorregido;
    // La corrección puede cambiar si hace falta la ficha técnica
    // (visible solo para "cronica"); se actualiza aquí, ya que este
    // cambio de valor no dispara el "change" del desplegable a mano.
    actualizarVisibilidadFichaTecnica();
  }
  const esAutomatico = esTipoConClubAutomatico(selectTipoArticulo?.value);
  clubWrapNormal.style.display = esAutomatico ? "none" : "";
  clubWrapAutomatico.style.display = esAutomatico ? "" : "none";
  if (categoriaWrapNormal && categoriaWrapAutomatico) {
    categoriaWrapNormal.style.display = esAutomatico ? "none" : "";
    categoriaWrapAutomatico.style.display = esAutomatico ? "" : "none";
  }
  if (!esAutomatico) {
    CLUB_AUTOMATICO_ACTUAL = null;
    CATEGORIA_AUTOMATICA_ACTUAL = null;
    return;
  }
  if (resultado && resultado.equipo_local && resultado.equipo_visitante) {
    CLUB_AUTOMATICO_ACTUAL = [resultado.equipo_local, resultado.equipo_visitante];
    if (clubAutomaticoTexto) {
      clubAutomaticoTexto.textContent = `${resultado.equipo_local} y ${resultado.equipo_visitante} (según el resultado vinculado)`;
    }
  } else {
    CLUB_AUTOMATICO_ACTUAL = null;
    if (clubAutomaticoTexto) {
      clubAutomaticoTexto.textContent = "Vincula un resultado más abajo para fijar automáticamente los dos clubes de esta noticia.";
    }
  }
  if (resultado && resultado.competicion) {
    CATEGORIA_AUTOMATICA_ACTUAL = resultado.competicion;
    if (categoriaAutomaticoTexto) {
      const etiqueta = typeof categoriaLabel === "function" ? categoriaLabel(resultado.competicion) : resultado.competicion;
      categoriaAutomaticoTexto.textContent = `${etiqueta} (según el resultado vinculado)`;
    }
  } else {
    CATEGORIA_AUTOMATICA_ACTUAL = null;
    if (categoriaAutomaticoTexto) {
      categoriaAutomaticoTexto.textContent = "Vincula un resultado más abajo para fijar automáticamente la categoría de esta noticia.";
    }
  }
}
selectTipoArticulo?.addEventListener("change", actualizarClubAutomatico);

// Crea una fila con un input de texto y un botón para quitarla, usada
// tanto para goleadores como para tarjetas (misma estructura, solo
// cambia el placeholder).
function crearFilaFichaLista(contenedor, valor, placeholder) {
  const fila = document.createElement("div");
  fila.className = "fila-ficha-lista";
  fila.innerHTML = `
    <input type="text" class="ficha-lista-input" placeholder="${placeholder}">
    <button type="button" class="quitar-fila-ficha" title="Quitar">✕</button>`;
  fila.querySelector(".ficha-lista-input").value = valor || "";
  fila.querySelector(".quitar-fila-ficha").addEventListener("click", () => fila.remove());
  contenedor.appendChild(fila);
}

btnAnadirGoleador?.addEventListener("click", () => {
  crearFilaFichaLista(listaFichaGoleadores, "", "Ej. 78' Iñaki Williams");
});
btnAnadirTarjeta?.addEventListener("click", () => {
  crearFilaFichaLista(listaFichaTarjetas, "", "Ej. 34' Amarilla - Vencedor");
});

// Lee todas las filas de un contenedor (goleadores o tarjetas) y
// devuelve solo las que tengan texto, ya recortado.
function obtenerFichaListaFormulario(contenedor) {
  return [...contenedor.querySelectorAll(".ficha-lista-input")]
    .map((input) => input.value.trim())
    .filter((v) => v !== "");
}

// Construye el objeto ficha_tecnica a partir del formulario, o null si
// no se ha rellenado ningún campo (para no mandar un objeto vacío).
function obtenerFichaTecnicaFormulario() {
  const campos = {
    competicion: document.getElementById("fichaCompeticion")?.value.trim() || "",
    jornada: document.getElementById("fichaJornada")?.value.trim() || "",
    fecha_hora: document.getElementById("fichaFechaHora")?.value.trim() || "",
    estadio: document.getElementById("fichaEstadio")?.value.trim() || "",
    ciudad: document.getElementById("fichaCiudad")?.value.trim() || "",
    asistencia: document.getElementById("fichaAsistencia")?.value.trim() || "",
    arbitro: document.getElementById("fichaArbitro")?.value.trim() || "",
    mvp: document.getElementById("fichaMvp")?.value.trim() || "",
    notas: document.getElementById("fichaNotas")?.value.trim() || "",
  };
  const goleadores = listaFichaGoleadores ? obtenerFichaListaFormulario(listaFichaGoleadores) : [];
  const tarjetas = listaFichaTarjetas ? obtenerFichaListaFormulario(listaFichaTarjetas) : [];
  const ficha = {};
  Object.entries(campos).forEach(([clave, valor]) => { if (valor) ficha[clave] = valor; });
  if (goleadores.length) ficha.goleadores = goleadores;
  if (tarjetas.length) ficha.tarjetas = tarjetas;
  return Object.keys(ficha).length ? ficha : null;
}

// Rellena el formulario a partir de la ficha técnica guardada (al
// editar una crónica existente), o lo deja vacío si no tiene ninguna.
function cargarFichaTecnicaFormulario(ficha) {
  const f = ficha || {};
  document.getElementById("fichaCompeticion").value = f.competicion || "";
  document.getElementById("fichaJornada").value = f.jornada || "";
  document.getElementById("fichaFechaHora").value = f.fecha_hora || "";
  document.getElementById("fichaEstadio").value = f.estadio || "";
  document.getElementById("fichaCiudad").value = f.ciudad || "";
  document.getElementById("fichaAsistencia").value = f.asistencia || "";
  document.getElementById("fichaArbitro").value = f.arbitro || "";
  document.getElementById("fichaMvp").value = f.mvp || "";
  document.getElementById("fichaNotas").value = f.notas || "";
  listaFichaGoleadores.innerHTML = "";
  (f.goleadores || []).forEach((g) => crearFilaFichaLista(listaFichaGoleadores, g, "Ej. 78' Iñaki Williams"));
  listaFichaTarjetas.innerHTML = "";
  (f.tarjetas || []).forEach((t) => crearFilaFichaLista(listaFichaTarjetas, t, "Ej. 34' Amarilla - Vencedor"));
  actualizarVisibilidadFichaTecnica();
}

// Permite, al escribir una noticia o crónica, enlazarla con un partido ya
// registrado en "Resultados" para mostrar su marcador dentro de la noticia.
// El <select id="resultado_id"> sigue existiendo pero oculto: es el único
// sitio que guarda el valor real (resultado_id) que se manda al backend,
// para no tener que tocar el resto del código que ya lee/escribe su
// .value. Lo que ve y usa el redactor es el buscador de más arriba
// (#resultado_id_buscador) con su lista de sugerencias propia.
const selectResultadoArticulo = document.getElementById("resultado_id");
const buscadorResultadoArticulo = document.getElementById("resultado_id_buscador");
const sugerenciasResultadoArticulo = document.getElementById("resultado_id_sugerencias");
// Lista completa (sin filtrar) de resultados traída del servidor.
let RESULTADOS_ARTICULO_TODOS = [];
let resultadoArticuloIndiceActivo = -1;

function etiquetaResultado(r) {
  const hayMarcador = r.goles_local !== null && r.goles_local !== undefined && r.goles_visitante !== null && r.goles_visitante !== undefined;
  const marcador = hayMarcador ? `${r.goles_local}-${r.goles_visitante}` : "vs";
  const estados = { programado: "Por jugar", en_juego: "En juego", retrasado: "Retrasado", anulado: "Anulado", finalizado: "Finalizado" };
  const jornada = r.jornada ? `J${r.jornada} · ` : "";
  return `${categoriaLabel(r.competicion)} · ${jornada}${r.equipo_local} ${marcador} ${r.equipo_visitante} (${estados[r.estado] || r.estado})`;
}

// Fija el resultado vinculado: actualiza el <select> oculto (que es lo que
// de verdad se manda al guardar la noticia) y refleja su etiqueta en el
// buscador, disparando "change" para que siga funcionando todo lo que ya
// escuchaba ese evento (p.ej. abrir el modal de "+ Nuevo resultado…").
// autorrellenar=false se usa al CARGAR un artículo ya existente (o al
// abrir el formulario en blanco) desde cargarResultadosSelect: en ese
// caso la ficha técnica ya viene de a.ficha_tecnica y la carga
// cargarFichaTecnicaFormulario más abajo en abrirArticuloParaEditar, así
// que no hay que tocarla aquí. Si se llamara igualmente (como pasaba
// antes), ambas cargas se ejecutaban en paralelo -ésta es async por la
// llamada a la API- y competían por escribir los mismos campos: según
// cuál tardara más, la ficha guardada del artículo podía acabar mezclada
// con la autorrellenada del resultado, o pisada por completo. Solo se
// autorrellena de verdad cuando el propio redactor cambia el resultado
// vinculado a mano desde el buscador o el modal de "+ Nuevo resultado".
function fijarResultadoArticulo(valor, etiqueta, autorrellenar = true) {
  selectResultadoArticulo.innerHTML = '<option value="">— Ninguno —</option>' +
    '<option value="__nuevo__">+ Nuevo resultado…</option>' +
    (valor && valor !== "__nuevo__" ? `<option value="${valor}">${escapeHtml(etiqueta || "")}</option>` : "");
  selectResultadoArticulo.value = valor || "";
  buscadorResultadoArticulo.value = valor === "__nuevo__" ? "" : (etiqueta || "");
  selectResultadoArticulo.dispatchEvent(new Event("change"));
  if (autorrellenar && valor && valor !== "__nuevo__") {
    const r = RESULTADOS_ARTICULO_TODOS.find((x) => String(x.id) === String(valor));
    if (r) autorrellenarFichaTecnicaDesdeResultado(r);
  }
  // Para previa/crónica, cada cambio de resultado vinculado (elegirlo,
  // cambiarlo o quitarlo) recalcula también el club automático (ver
  // actualizarClubAutomatico más arriba).
  actualizarClubAutomatico();
}

// Etiqueta legible de un minuto de evento, con el "+N" de descuento si
// aplica (igual criterio que minuto-a-minuto.js: minuto + minuto_extra).
function etiquetaMinutoFichaTecnica(ev) {
  return ev.minuto_extra ? `${ev.minuto}+${ev.minuto_extra}'` : `${ev.minuto}'`;
}

// Autorrellena, al vincular un partido, los datos de la ficha técnica que
// ya se conocen a través del resultado (competición, jornada, fecha y
// hora, estadio/ciudad, MVP) y, si el partido se cubrió con el panel de
// Minuto a Minuto, también sus goleadores y tarjetas ya registrados.
// Antes de rellenar nada, se borra POR COMPLETO la ficha técnica actual
// (incluido Árbitro, que luego no se vuelve a rellenar aquí) para que no
// queden mezclados datos del partido anterior con los del recién
// vinculado. Es "best effort": si algo falla (p.ej. no hay ficha de
// club_info para ese equipo, o el partido no tiene eventos), el resto de
// campos se rellenan igual.
async function autorrellenarFichaTecnicaDesdeResultado(r) {
  const campoCompeticion = document.getElementById("fichaCompeticion");
  const campoJornada = document.getElementById("fichaJornada");
  const campoFechaHora = document.getElementById("fichaFechaHora");
  const campoEstadio = document.getElementById("fichaEstadio");
  const campoCiudad = document.getElementById("fichaCiudad");
  const campoAsistencia = document.getElementById("fichaAsistencia");
  const campoArbitro = document.getElementById("fichaArbitro");
  const campoMvp = document.getElementById("fichaMvp");
  const campoNotas = document.getElementById("fichaNotas");
  if (!campoCompeticion) return; // el bloque de ficha técnica no está en esta vista

  // Primero se borra TODA la ficha técnica (campos de texto, incluido
  // Árbitro aunque no se rellene después, y las listas de goleadores/
  // tarjetas) y luego se reconstruye desde cero con los datos del
  // resultado recién vinculado. Antes se rellenaba campo a campo dejando
  // lo que ya hubiera escrito de un partido distinto si el nuevo
  // resultado no traía ese dato, lo que acababa mezclando datos de dos
  // partidos distintos en la misma ficha.
  if (campoCompeticion) campoCompeticion.value = "";
  if (campoJornada) campoJornada.value = "";
  if (campoFechaHora) campoFechaHora.value = "";
  if (campoEstadio) campoEstadio.value = "";
  if (campoCiudad) campoCiudad.value = "";
  if (campoAsistencia) campoAsistencia.value = "";
  if (campoArbitro) campoArbitro.value = "";
  if (campoMvp) campoMvp.value = "";
  if (campoNotas) campoNotas.value = "";
  if (listaFichaGoleadores) listaFichaGoleadores.innerHTML = "";
  if (listaFichaTarjetas) listaFichaTarjetas.innerHTML = "";

  // A partir de aquí, todos los campos de la ficha técnica se
  // sobrescriben siempre con el dato del resultado/club vinculado, aunque
  // el redactor ya hubiera escrito algo a mano (antes solo se rellenaban
  // si estaban vacíos, así que cambiar el resultado vinculado a otro
  // partido, o corregir un dato en la ficha del club/resultado después de
  // haberlo vinculado una vez, no se reflejaba aquí).
  if (campoCompeticion) {
    campoCompeticion.value = categoriaLabel(r.competicion) || "";
  }
  if (campoJornada) {
    campoJornada.value = r.jornada ? `Jornada ${r.jornada}` : "";
  }
  if (campoFechaHora) {
    const fecha = r.fecha_partido
      ? new Date(r.fecha_partido.length === 10 ? `${r.fecha_partido}T00:00` : r.fecha_partido)
      : null;
    if (fecha && !isNaN(fecha)) {
      const tieneHora = r.fecha_partido.length > 10;
      campoFechaHora.value = fecha.toLocaleString("es-ES", {
        day: "2-digit", month: "2-digit", year: "numeric",
        ...(tieneHora ? { hour: "2-digit", minute: "2-digit" } : {}),
        timeZone: "Europe/Madrid",
      });
    } else {
      campoFechaHora.value = "";
    }
  }
  // MVP: guardado directamente en el resultado (mvp_jugador/mvp_equipo)
  // si se marcó desde el panel de Minuto a Minuto o desde "Resultados".
  if (campoMvp) {
    if (r.mvp_jugador) {
      const equipoMvp = r.mvp_equipo === "visitante" ? r.equipo_visitante : r.equipo_local;
      campoMvp.value = equipoMvp ? `${r.mvp_jugador} (${equipoMvp})` : r.mvp_jugador;
    } else {
      campoMvp.value = "";
    }
  }
  // Estadio y ciudad: si el partido tiene "ubicacion" (texto libre tipo
  // "Nuevo Mirandilla, Cádiz"), se usa tal cual para el campo Estadio ya
  // que no viene separado en el backend. Si no, se intenta rellenar
  // Estadio y Ciudad por separado desde la ficha del club local
  // (/api/club-info), que sí guarda ambos datos de forma independiente.
  if (r.ubicacion) {
    if (campoEstadio) campoEstadio.value = r.ubicacion;
  } else if (r.equipo_local) {
    try {
      const { info } = await apiFetch(`/api/club-info?club=${encodeURIComponent(r.equipo_local)}`);
      if (campoEstadio) campoEstadio.value = info?.estadio || "";
      if (campoCiudad) campoCiudad.value = info?.ciudad || "";
    } catch (err) {
      // sin ficha de club para ese equipo: se deja en blanco
      if (campoEstadio) campoEstadio.value = "";
      if (campoCiudad) campoCiudad.value = "";
    }
  } else {
    if (campoEstadio) campoEstadio.value = "";
    if (campoCiudad) campoCiudad.value = "";
  }

  // Goleadores y tarjetas: si el partido se cubrió con el Minuto a Minuto
  // (tabla match_events), se listan aquí igual que si el redactor los
  // hubiera escrito a mano. Árbitro no se guarda en ningún sitio del
  // backend todavía, así que ese campo se deja tal cual.
  //
  // A diferencia del resto de campos de esta función, estas dos listas
  // SIEMPRE se sobrescriben con lo que haya en match_events al (re)vincular
  // un resultado, aunque ya tuvieran filas. Antes solo se rellenaban si
  // estaban completamente vacías, así que cambiar el resultado vinculado
  // (o corregir un evento en Minuto a Minuto después de haberlo vinculado
  // una vez) no se reflejaba aquí; con el borrador guardado a medias esto
  // dejaba goleadores/tarjetas obsoletos o, como pasó con un fallo del
  // parser de importación, directamente mal escritos. Si el redactor había
  // escrito algo a mano sin que hubiera match_events para ese resultado,
  // no se toca (ver "eventos.length" más abajo): solo se pisa cuando sí
  // hay datos frescos con los que reemplazarlo.
  if (!listaFichaGoleadores && !listaFichaTarjetas) return;
  try {
    const { eventos = [] } = await apiFetch(`/api/results/${r.id}/eventos`);
    if (!eventos.length) return;
    const nombreEquipo = (ev) => ev.equipo === "visitante" ? r.equipo_visitante : r.equipo_local;
    if (listaFichaGoleadores) {
      const goleadores = eventos
        .filter((ev) => ["gol", "gol_var", "gol_pp"].includes(ev.tipo) && ev.jugador)
        .map((ev) => {
          const asistencia = ev.jugador_asistencia ? ` (asist. ${ev.jugador_asistencia})` : "";
          return `${etiquetaMinutoFichaTecnica(ev)} ${ev.jugador} - ${nombreEquipo(ev)}${asistencia}`;
        });
      if (goleadores.length) {
        listaFichaGoleadores.innerHTML = "";
        goleadores.forEach((g) => crearFilaFichaLista(listaFichaGoleadores, g, "Ej. 78' Iñaki Williams"));
      }
    }
    if (listaFichaTarjetas) {
      const etiquetasTarjeta = { amarilla: "Amarilla", doble_amarilla: "Doble amarilla", roja: "Roja" };
      const tarjetas = eventos
        .filter((ev) => ["amarilla", "doble_amarilla", "roja"].includes(ev.tipo))
        .map((ev) => `${etiquetaMinutoFichaTecnica(ev)} ${etiquetasTarjeta[ev.tipo]}${ev.jugador ? ` - ${ev.jugador}` : ""} (${nombreEquipo(ev)})`);
      if (tarjetas.length) {
        listaFichaTarjetas.innerHTML = "";
        tarjetas.forEach((t) => crearFilaFichaLista(listaFichaTarjetas, t, "Ej. 34' Amarilla - Vencedor"));
      }
    }
  } catch (err) {
    // sin eventos disponibles (partido no cubierto en Minuto a Minuto):
    // no pasa nada, esos campos quedan como estaban.
  }
}

function cerrarSugerenciasResultadoArticulo() {
  sugerenciasResultadoArticulo.style.display = "none";
  sugerenciasResultadoArticulo.innerHTML = "";
  resultadoArticuloIndiceActivo = -1;
}

// Pinta la lista de sugerencias (div propio, no el <select>) a partir del
// texto escrito en el buscador. Al no tocar nunca un <select> nativo
// mientras el usuario interactúa, el clic o el Enter sobre una opción
// funcionan siempre, sin que el propio filtrado "se coma" el clic.
function pintarSugerenciasResultadoArticulo() {
  const texto = normalizarBusquedaPanel(buscadorResultadoArticulo.value);
  const filtrados = (texto
    ? RESULTADOS_ARTICULO_TODOS.filter((r) => {
        const jornada = r.jornada ? `j${r.jornada}` : "";
        const haystack = normalizarBusquedaPanel(`${categoriaLabel(r.competicion) || ""} ${jornada} ${r.equipo_local || ""} ${r.equipo_visitante || ""}`);
        return haystack.includes(texto);
      })
    : RESULTADOS_ARTICULO_TODOS
  ).slice(0, 50); // limitado a 50 para no pintar cientos de filas de golpe

  resultadoArticuloIndiceActivo = -1;
  const opcionNuevo = '<div class="autocompletar-resultado-item" data-id="__nuevo__">+ Nuevo resultado…</div>';
  if (!filtrados.length) {
    sugerenciasResultadoArticulo.innerHTML = opcionNuevo +
      '<div class="autocompletar-resultado-vacio">Ningún partido coincide con esa búsqueda.</div>';
    sugerenciasResultadoArticulo.style.display = "block";
    return;
  }
  sugerenciasResultadoArticulo.innerHTML = opcionNuevo + filtrados.map((r) =>
    `<div class="autocompletar-resultado-item" data-id="${r.id}">${escapeHtml(etiquetaResultado(r))}</div>`
  ).join("");
  sugerenciasResultadoArticulo.style.display = "block";
}

buscadorResultadoArticulo?.addEventListener("input", () => {
  // Si se borra el texto a mano, se desvincula (igual que elegir "— Ninguno —").
  if (!buscadorResultadoArticulo.value.trim() && selectResultadoArticulo.value) {
    selectResultadoArticulo.value = "";
    selectResultadoArticulo.dispatchEvent(new Event("change"));
  }
  pintarSugerenciasResultadoArticulo();
});
buscadorResultadoArticulo?.addEventListener("focus", () => pintarSugerenciasResultadoArticulo());
buscadorResultadoArticulo?.addEventListener("keydown", (e) => {
  const items = sugerenciasResultadoArticulo.querySelectorAll(".autocompletar-resultado-item");
  if (!items.length) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    resultadoArticuloIndiceActivo = Math.min(resultadoArticuloIndiceActivo + 1, items.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    resultadoArticuloIndiceActivo = Math.max(resultadoArticuloIndiceActivo - 1, 0);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const elegido = items[resultadoArticuloIndiceActivo] || items[0];
    if (elegido) elegido.click();
    return;
  } else if (e.key === "Escape") {
    cerrarSugerenciasResultadoArticulo();
    return;
  } else {
    return;
  }
  items.forEach((it, i) => it.classList.toggle("activo", i === resultadoArticuloIndiceActivo));
  items[resultadoArticuloIndiceActivo]?.scrollIntoView({ block: "nearest" });
});
sugerenciasResultadoArticulo?.addEventListener("mousedown", (e) => {
  // mousedown (no click) para que dispare ANTES del blur del input y no
  // se cierre la lista justo antes de registrar la selección.
  const item = e.target.closest(".autocompletar-resultado-item");
  if (!item) return;
  e.preventDefault();
  if (item.dataset.id === "__nuevo__") {
    fijarResultadoArticulo("__nuevo__", "");
  } else {
    const r = RESULTADOS_ARTICULO_TODOS.find((x) => String(x.id) === item.dataset.id);
    if (r) fijarResultadoArticulo(String(r.id), etiquetaResultado(r));
  }
  cerrarSugerenciasResultadoArticulo();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocompletar-resultado")) cerrarSugerenciasResultadoArticulo();
});

async function cargarResultadosSelect(seleccionado) {
  if (!selectResultadoArticulo) return;
  try {
    // El límite era 100 y la consulta mezcla TODAS las competiciones
    // ordenadas por fecha_partido DESC: si entre todas suman más de 100
    // partidos "recientes", los de jornadas más bajas de una competición
    // concreta (p.ej. J1 de Primera RFEF) quedaban fuera del recorte y
    // desaparecían de este desplegable, aunque siguieran existiendo en
    // la base de datos y se vieran bien en la web pública. Se pedía
    // "limit=2000" pensando que era el máximo del backend, pero éste
    // bajó su tope real a 500 (ver worker/src/index.js: cualquier valor
    // por encima de 500 se ignora y cae en el default de 100), así que
    // en la práctica esta llamada se estaba quedando en 100 igualmente.
    // Se ajusta a 500, que es el máximo que el backend admite de verdad.
    const { results = [] } = await apiFetch(`/api/results?limit=500`);
    RESULTADOS_ARTICULO_TODOS = results;
    const actual = seleccionado ? results.find((r) => String(r.id) === String(seleccionado)) : null;
    fijarResultadoArticulo(seleccionado || "", actual ? etiquetaResultado(actual) : "", false);
    return;
  } catch (err) {
    selectResultadoArticulo.innerHTML = '<option value="">— Ninguno —</option><option value="__nuevo__">+ Nuevo resultado…</option>';
  }
}
cargarResultadosSelect("");
document.querySelector('#panel-noticias .subtabs button[data-subtab="nueva"]').addEventListener("click", () => cargarResultadosSelect(selectResultadoArticulo.value));
// Al ir a "Ver resultados" se sale del formulario de edición, así que se
// limpia (formulario + bloque de goles/tarjetas) para que la próxima vez
// que se pulse "+ Nuevo resultado" empiece en blanco y no arrastre el
// partido que se estaba editando antes.
document.querySelector('#panel-resultados .subtabs button[data-subtab="listaResultados"]').addEventListener("click", () => {
  if (document.getElementById("resultadoId").value) cancelarEdicionResultado();
});

// ---------- ARTÍCULOS: crear un resultado nuevo sin salir del editor ----------
// El formulario de "+ Nuevo resultado" (todo el contenido de
// #formCardResultado, con su mismo id de siempre) vive físicamente en el
// HTML dentro de un contenedor "aparcado" (.subpanel-resultado-oculto).
// Según desde dónde se necesite, se traslada (moveChild real, no clona)
// al ancla correspondiente: #anclaFormResultado en la pestaña
// "Resultados", o #anclaFormResultadoModal dentro del modal que se abre
// desde el editor de noticias. Como es el mismo nodo del DOM, toda la
// lógica ya existente (formResultado, rLocalPicker, listeners de
// r_estado, etc.) sigue funcionando igual sin tener que duplicar nada.
const formCardResultadoEl = document.getElementById("formCardResultado");
function moverFormularioResultadoAqui(idAncla) {
  const ancla = document.getElementById(idAncla);
  if (ancla && formCardResultadoEl) ancla.appendChild(formCardResultadoEl);
}
// Por defecto (carga del panel) el formulario ya está en su sitio de
// siempre (la pestaña "Resultados" está activa al entrar), así que se
// coloca ahí desde el principio.
moverFormularioResultadoAqui("anclaFormResultado");
document.querySelector('#panel-resultados .subtabs button[data-subtab="resultado"]')?.addEventListener("click", () => {
  moverFormularioResultadoAqui("anclaFormResultado");
});

// Se marca a fuego si el resultado que se está creando/editando ahora
// mismo en el formulario se abrió desde el modal del editor de noticias
// (en vez de desde la pestaña "Resultados" normal), para que al
// guardarlo con éxito se vincule solo a esa noticia y se cierre el modal
// en vez de comportarse como en la pestaña normal.
let creandoResultadoDesdeNoticia = false;

function abrirModalNuevoResultado() {
  creandoResultadoDesdeNoticia = true;
  // Si había un resultado a medio editar en la pestaña "Resultados", no
  // se toca (sigue esperando allí); el modal siempre arranca en blanco,
  // como un "+ Nuevo resultado" de verdad.
  if (!document.getElementById("resultadoId").value) {
    cancelarEdicionResultado();
  } else {
    formResultado.reset();
    document.getElementById("resultadoId").value = "";
    document.getElementById("btnCancelarResultado").style.display = "none";
    actualizarCampoGrupo();
    actualizarCampoJornada();
    actualizarBloqueoGoles();
    actualizarCampoFlashscoreYUbicacion();
    actualizarCampoRetrasado();
    resetearBloqueOtroEquipo();
    poblarSelectsEquipo();
    document.getElementById("bloqueEventosPartido").style.display = "none";
    document.getElementById("bloqueTandaPenaltis").style.display = "none";
    document.getElementById("bloqueAlineacionesResultado").style.display = "none";
    document.getElementById("btnAbrirMinutoAMinutoDesdeForm").style.display = "none";
    // La importación rápida de eventos solo tiene sentido con un
    // partido ya guardado (necesita su id): al preparar el formulario
    // para un partido nuevo se oculta y se olvida cuál era el partido
    // que se estaba editando antes.
    const bloqueImportEventos = document.getElementById("bloqueImportacionRapidaEventos");
    if (bloqueImportEventos) bloqueImportEventos.style.display = "none";
    if (typeof fijarResultadoImportacionRapidaEventos === "function") fijarResultadoImportacionRapidaEventos(null);
    cancelarEdicionEvento();
    cancelarEdicionTandaPenaltis();
  }
  moverFormularioResultadoAqui("anclaFormResultadoModal");
  document.getElementById("modalNuevoResultado").classList.add("abierto");
}
function cerrarModalNuevoResultado() {
  document.getElementById("modalNuevoResultado").classList.remove("abierto");
  creandoResultadoDesdeNoticia = false;
  // El formulario vuelve a "casa" (la pestaña Resultados) para que, si
  // se había dejado algo a medias ahí, se recupere tal cual al volver.
  moverFormularioResultadoAqui("anclaFormResultado");
  // Si se cerró sin guardar (o tras guardar ya se ha corregido el valor
  // a otra cosa), no debe quedarse seleccionada la opción "+ Nuevo
  // resultado…" en el desplegable de la noticia.
  if (selectResultadoArticulo.value === "__nuevo__") selectResultadoArticulo.value = "";
}
const modalNuevoResultadoEl = document.getElementById("modalNuevoResultado");
if (modalNuevoResultadoEl) {
  modalNuevoResultadoEl.addEventListener("click", (e) => {
    if (e.target === modalNuevoResultadoEl) cerrarModalNuevoResultado();
  });
}
// Al elegir "+ Nuevo resultado…" en el desplegable, se abre el modal en
// vez de dejar esa opción "fantasma" seleccionada (no es un resultado
// real, así que nunca debe guardarse tal cual en la noticia).
selectResultadoArticulo?.addEventListener("change", () => {
  if (selectResultadoArticulo.value === "__nuevo__") abrirModalNuevoResultado();
});


// ---------- ARTÍCULOS: editor de contenido (WYSIWYG) ----------

// ---------- Guardado de emergencia del borrador (cierre por inactividad) ----------
// No se manda al servidor (el backend exige un mínimo de caracteres para
// guardar cualquier noticia, incluso como borrador), así que se guarda
// tal cual en este navegador para poder recuperarlo al volver a entrar.

// Normaliza HTML para comparar contenido "de verdad" (ignora espacios en
// blanco, saltos de línea y diferencias de mayúsculas/minúsculas en las
// etiquetas, que no cambian lo que se ve).
function normalizarHTMLParaComparar(html) {
  return (html || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Solo se considera que había "trabajo real" en la noticia si hay un
// título escrito o si el contenido no está vacío Y es distinto de la
// plantilla estándar tal cual se inserta sola en una noticia nueva. Así
// no se ofrece "recuperar" cuando lo único que había era el formulario
// recién abierto sin tocar.
function hayTrabajoRealEnFormulario(titulo, contenidoHTML) {
  if ((titulo || "").trim()) return true;
  const contenidoVacio = !contenidoHTML || contenidoHTML.replace(/<[^>]*>/g, "").trim() === "";
  if (!contenidoVacio && normalizarHTMLParaComparar(contenidoHTML) !== normalizarHTMLParaComparar(PLANTILLA_ESTANDAR)) {
    return true;
  }
  // Aunque el título/contenido en castellano estén vacíos (o intactos con
  // la plantilla), puede que el redactor ya lleve un rato rellenando
  // alguna traducción: eso también cuenta como trabajo real que no
  // conviene perder.
  if (traduccionPaneles) {
    const traducciones = obtenerTraduccionesFormulario();
    if (Object.values(traducciones).some((t) => t.titulo || t.subtitulo || t.contenido)) return true;
  }
  return false;
}

function guardarBorradorLocalDeEmergencia() {
  try {
    const formVisible = document.getElementById("formArticle");
    // Solo tiene sentido si el formulario de la noticia está abierto y
    // hay algo escrito (título o contenido); si no, no guardamos nada.
    if (!formVisible || formVisible.style.display === "none") return;
    const titulo = document.getElementById("titulo")?.value || "";
    const contenidoHTML = contenidoEditor ? contenidoEditor.innerHTML : "";
    // Si no hay título y el contenido está vacío o es tal cual la
    // plantilla estándar sin tocar, no hay ninguna noticia real en marcha:
    // no se guarda nada (y así luego tampoco se ofrecerá "recuperar" en
    // falso solo por haber abierto el formulario).
    if (!hayTrabajoRealEnFormulario(titulo, contenidoHTML)) {
      localStorage.removeItem(CLAVE_BORRADOR_EMERGENCIA);
      return;
    }
    // Si la noticia ya está programada (fecha futura elegida), no es un
    // borrador a medias: ya está lista y se publicará sola. No tiene
    // sentido ofrecer "recuperar borrador" al volver a entrar.
    if (checkProgramarNoticia?.checked && programadoParaISO()) {
      localStorage.removeItem(CLAVE_BORRADOR_EMERGENCIA);
      return;
    }

    const borrador = {
      guardado_en: new Date().toISOString(),
      articleId: document.getElementById("articleId")?.value || "",
      titulo,
      subtitulo: document.getElementById("subtitulo")?.value || "",
      tipo: document.getElementById("tipo")?.value || "",
      categoria: document.getElementById("categoria")?.value || "",
      club: document.getElementById("club")?.value || "",
      contenido: contenidoHTML,
      destacado: document.getElementById("destacado")?.checked || false,
      publicado: document.getElementById("publicado")?.checked || false,
      // Las traducciones (eu/ca/gl/en) también se guardan aquí: antes se
      // perdían al recuperar el borrador porque no se incluían en el
      // objeto guardado, aunque el redactor llevara un buen rato
      // rellenándolas en sus pestañas.
      traducciones: traduccionPaneles ? obtenerTraduccionesFormulario() : null,
      // Fotos y ficha técnica: antes tampoco se incluían aquí, así que al
      // recuperar el borrador (o al recargar editarArticulo() por encima,
      // si era una noticia ya existente) se perdía cualquier cambio de
      // imágenes/collages/ficha técnica que el redactor tuviera hecho en
      // el formulario pero sin guardar todavía en el servidor. Se
      // guardan en el mismo formato que espera resetImagenes()/
      // cargarFichaTecnicaFormulario() al restaurarlos.
      imagenes: obtenerImagenesFormulario(),
      imagenPortada: obtenerPortadaSeleccionada(),
      collages: COLLAGES_ARTICULO,
      fichaTecnica: obtenerFichaTecnicaFormulario(),
    };
    localStorage.setItem(CLAVE_BORRADOR_EMERGENCIA, JSON.stringify(borrador));
  } catch (err) {
    console.error("No se ha podido autoguardar el borrador:", err);
  }
}

// Guardado periódico mientras el formulario de la noticia está en
// pantalla, igual que ya hace el de resultados: no hace falta esperar a
// que salte el cierre de sesión por inactividad para tener algo que
// recuperar si el navegador se cierra de golpe (se pierde la luz, se
// fuerza el cierre de la pestaña, etc.), incluidas las traducciones.
setInterval(guardarBorradorLocalDeEmergencia, 8000);
window.addEventListener("beforeunload", guardarBorradorLocalDeEmergencia);

// Al entrar en el formulario de noticias, si hay un borrador de emergencia
// guardado, se avisa y se ofrece recuperarlo (o descartarlo).
function comprobarBorradorLocalDeEmergencia() {
  let borrador;
  try {
    const bruto = localStorage.getItem(CLAVE_BORRADOR_EMERGENCIA);
    if (!bruto) return;
    borrador = JSON.parse(bruto);
  } catch {
    localStorage.removeItem(CLAVE_BORRADOR_EMERGENCIA);
    return;
  }
  if (!borrador) return;
  const fecha = borrador.guardado_en ? new Date(borrador.guardado_en) : null;
  const fechaTexto = fecha ? fecha.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  EOF.confirmar(
    `Se cerró tu sesión por inactividad mientras escribías "${borrador.titulo || "(sin título)"}" (${fechaTexto}). ¿Quieres recuperar ese borrador?`,
    { textoConfirmar: "Recuperar", textoCancelar: "Descartar" }
  ).then(async (recuperar) => {
    if (recuperar) {
      try {
        if (borrador.articleId) {
          // Era una noticia que ya existía en el servidor (se estaba
          // editando): la volvemos a cargar entera con editarArticulo()
          // para que el resto del formulario (clubs, autor, imágenes...)
          // quede bien poblado, y luego pisamos encima con lo que había
          // en el borrador local. Se busca en la caché de la lista de
          // noticias (incluye borradores no publicados); si no está
          // cargada todavía, se pide la lista primero.
          let articuloServidor = ARTICULOS_CACHE[borrador.articleId];
          if (!articuloServidor) {
            const { articles } = await apiFetch(`/api/articles?admin=1&limit=200`);
            (articles || []).forEach((a) => { ARTICULOS_CACHE[a.id] = a; });
            articuloServidor = ARTICULOS_CACHE[borrador.articleId];
          }
          if (articuloServidor) await editarArticulo(articuloServidor);
          else {
            cancelarEdicion();
            document.querySelector('#panel-noticias .subtabs button[data-subtab="nueva"]').click();
          }
        } else {
          cancelarEdicion();
          document.querySelector('#panel-noticias .subtabs button[data-subtab="nueva"]').click();
        }
      } catch {
        cancelarEdicion();
        document.querySelector('#panel-noticias .subtabs button[data-subtab="nueva"]').click();
      }
      document.getElementById("titulo").value = borrador.titulo || "";
      document.getElementById("subtitulo").value = borrador.subtitulo || "";
      if (borrador.tipo) document.getElementById("tipo").value = borrador.tipo;
      // categoria/club se ponen DESPUÉS de restaurar imágenes/ficha
      // técnica (más abajo), no aquí: cuando el borrador venía de una
      // noticia ya existente, editarArticulo() de arriba ya ha lanzado
      // poblarClubs()/poblarCategoriaSegunAutor(), que repueblan estos
      // mismos <select> de forma asíncrona; si se escribía el valor
      // justo aquí, esa repoblación posterior podía llegar después y
      // dejar la categoría/club tal cual los había cargado el servidor,
      // no lo que había en el borrador local (de ahí que se perdiera
      // "a veces": dependía de qué llegara antes).
      contenidoEditor.innerHTML = borrador.contenido || "";
      document.getElementById("destacado").checked = !!borrador.destacado;
      document.getElementById("publicado").checked = !!borrador.publicado;
      // Restaura también las traducciones que se estuvieran escribiendo,
      // si las había: antes se perdían al recuperar el borrador.
      restaurarTraduccionesDesdeBorrador(borrador.traducciones);
      // Fotos, collages y ficha técnica: si no se restauran aquí, se
      // quedan con lo que tuviera guardado el servidor (o vacíos, en una
      // noticia nueva) y se pierde cualquier cambio que el redactor
      // tuviera hecho en el formulario cuando saltó el cierre de sesión
      // por inactividad. Se restauran DESPUÉS de editarArticulo() (que
      // ya ha rellenado imágenes/ficha con lo del servidor) para que lo
      // del borrador local sea siempre lo que prevalezca.
      if (Array.isArray(borrador.imagenes)) {
        resetImagenes(borrador.imagenes, borrador.imagenPortada || "");
      }
      if (Array.isArray(borrador.collages)) {
        COLLAGES_ARTICULO = borrador.collages;
        pintarListaCollages();
      }
      if (borrador.tipo === "cronica") {
        cargarFichaTecnicaFormulario(borrador.fichaTecnica || null);
      }
      if (borrador.categoria) {
        document.getElementById("categoria").value = borrador.categoria;
        poblarClubs(borrador.categoria, borrador.club || "");
      }
      if (borrador.club) document.getElementById("club").value = borrador.club;
      sincronizarDestacadoConPublicado();
      actualizarContadorCaracteres();
    }
    localStorage.removeItem(CLAVE_BORRADOR_EMERGENCIA);
  });
}

// Contador de caracteres del contenido: el texto tiene que tener entre
// 2000 y 8000 caracteres (se cuenta el texto "de verdad", sin las
// etiquetas HTML del editor), igual que valida el worker al guardar.
const CONTENIDO_MIN = 2000;
const CONTENIDO_MAX = 8000;
const contadorCaracteres = document.getElementById("contadorCaracteres");

function longitudContenidoActual() {
  return contenidoEditor.innerText.replace(/\s+/g, " ").trim().length;
}

function actualizarContadorCaracteres() {
  if (!contadorCaracteres) return;
  const n = longitudContenidoActual();
  contadorCaracteres.textContent = `${n} caracteres (mínimo ${CONTENIDO_MIN}, máximo ${CONTENIDO_MAX})`;
  contadorCaracteres.classList.remove("aviso", "error", "ok");
  if (n === 0) {
    // sin marcar, para no mostrar error nada más abrir el formulario
  } else if (n < CONTENIDO_MIN || n > CONTENIDO_MAX) {
    contadorCaracteres.classList.add("error");
  } else {
    contadorCaracteres.classList.add("ok");
  }
}
contenidoEditor.addEventListener("input", actualizarContadorCaracteres);
contenidoEditor.addEventListener("paste", () => setTimeout(actualizarContadorCaracteres, 0));
contenidoEditor.addEventListener("keyup", actualizarContadorCaracteres);
contenidoEditor.addEventListener("blur", actualizarContadorCaracteres);
// Además de "input" (que no siempre salta cuando el contenido cambia por
// programación: botones de la barra de herramientas, insertar plantilla,
// pegar HTML, cargar una noticia para editarla...), se observa el propio
// contenido del editor para que el contador nunca se quede desactualizado.
new MutationObserver(actualizarContadorCaracteres).observe(contenidoEditor, {
  childList: true, subtree: true, characterData: true,
});

// Estructura estándar de una noticia: entradilla en negrita + cuerpo,
// para que todas las noticias salgan con un formato bonito y homogéneo.
const PLANTILLA_ESTANDAR = `
  <p class="entradilla">Escribe aquí la <b>entradilla</b>: dos o tres líneas que resuman lo más importante de la noticia.</p>
  <p>Continúa aquí con el desarrollo de la información: qué ha pasado, cuándo y por qué es relevante.</p>
  <p>Añade las declaraciones, el contexto o los datos que hagan falta. Puedes crear tantos párrafos como quieras.</p>
`.trim();

async function insertarPlantilla(forzar) {
  if (!forzar && contenidoEditor.innerText.trim() !== "") {
    const ok = await EOF.confirmar("Esto sustituirá el contenido actual del editor por la plantilla estándar. ¿Continuar?", { peligroso: true });
    if (!ok) return;
  }
  contenidoEditor.innerHTML = PLANTILLA_ESTANDAR;
}

// El editor empieza siempre con la plantilla estándar en una noticia nueva.
insertarPlantilla(true);

function editorEsBloqueValido(el) {
  // Encuentra el párrafo/bloque contenedor de la selección actual dentro
  // del editor. Se usa el nodo donde está el cursor (focusNode) y no
  // commonAncestorContainer: si la selección abarca varios párrafos,
  // commonAncestorContainer sube al ancestro común (a veces el propio
  // editor), y closest() podía devolver un bloque que envolvía toda la
  // noticia en vez de solo el párrafo pulsado -- eso es lo que hacía que
  // "Entradilla" pusiera en negrita el artículo entero.
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.focusNode;
  if (!node) return null;
  if (node.nodeType === 3) node = node.parentElement;
  if (!node) return null;
  const bloque = node.closest("p, h2, h3, blockquote, li");
  return bloque && el.contains(bloque) ? bloque : null;
}

// Aplica/quita la clase "entradilla" de forma segura: solo actúa si la
// selección cae dentro de un único párrafo -- si el usuario tiene
// seleccionados varios párrafos a la vez, formatBlock("p") puede
// fusionarlos en uno solo y, sin esta comprobación, ese párrafo fusionado
// (con toda la noticia dentro) se quedaba marcado como entradilla. Además,
// como solo debe haber una entradilla por noticia, al marcar una nueva se
// quita la clase de cualquier otro párrafo que la tuviera.
function toggleEntradillaSegura(editor) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) {
    const range = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (range && range.startContainer !== range.endContainer) {
      const inicioNode = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
      const finNode = range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer;
      const bloqueInicio = inicioNode && inicioNode.closest("p, h2, h3, blockquote, li");
      const bloqueFin = finNode && finNode.closest("p, h2, h3, blockquote, li");
      if (bloqueInicio !== bloqueFin) {
        EOF.toast("Selecciona solo el párrafo que quieres marcar como entradilla, no varios a la vez.", "error");
        return;
      }
    }
  }
  document.execCommand("formatBlock", false, "p");
  const bloque = editorEsBloqueValido(editor);
  if (!bloque) return;
  const activar = !bloque.classList.contains("entradilla");
  editor.querySelectorAll("p.entradilla").forEach((p) => p.classList.remove("entradilla"));
  if (activar) bloque.classList.add("entradilla");
}

// Copia el contenido de un editor (HTML con negrita, enlaces, párrafos...)
// al portapapeles como HTML real (no solo texto), para que al pegarlo en
// un chat de IA de traducción esta reciba las etiquetas y pueda mantener
// el mismo formato en la traducción que devuelva. Se copian dos versiones
// a la vez -- "text/html" (para pegar en sitios que entienden HTML, como
// la mayoría de chats de IA) y texto plano de reserva (por si el destino
// no soporta HTML) -- y el propio editor de traducción, al ser
// contenteditable, entiende el HTML pegado de vuelta sin más pasos.
// Copia el contenido de un editor como código HTML en texto plano (las
// etiquetas <b>, <p>, <a href="...">... visibles como texto, no como
// formato de portapapeles enriquecido). Es lo que hace falta para
// pegarlo en un chat de IA de traducción: un chat es una caja de texto
// normal, así que si se copiara como "formato enriquecido" (HTML real
// de portapapeles) el navegador lo convertiría a texto SIN etiquetas al
// pegarlo ahí y la IA nunca vería el formato. Copiando el HTML como
// texto, la IA puede leer las etiquetas y devolverlas traducidas, y
// luego ese texto se puede pegar de vuelta en "Pegar HTML traducido".
async function copiarConFormato(editor) {
  const html = editor.innerHTML.trim();
  if (!html) {
    EOF.toast("No hay contenido que copiar.", "error");
    return;
  }
  try {
    await navigator.clipboard.writeText(html);
    EOF.toast("Código HTML copiado. Pégalo en tu IA de traducción y pídele que traduzca manteniendo las etiquetas.", "exito");
  } catch (err) {
    EOF.toast("No se ha podido copiar. Selecciona el texto manualmente.", "error");
  }
}

// Antepone https:// a las URLs que se pegan sin protocolo (p. ej.
// "marca.com" o "www.marca.com"), para que el enlace no acabe apuntando
// por error a una ruta relativa dentro de la propia web (elotrofutbol.com/marca.com).
// Los enlaces internos con "/" o los que ya llevan esquema (http, https,
// mailto, tel...) se dejan tal cual.
function normalizarUrlEnlace(url) {
  const limpia = (url || "").trim();
  if (!limpia) return limpia;
  if (/^[a-z][a-z0-9+.-]*:/i.test(limpia)) return limpia; // ya tiene esquema (https:, mailto:, tel:...)
  if (limpia.startsWith("/") || limpia.startsWith("#")) return limpia; // ruta interna
  return `https://${limpia}`;
}

// Botón "Enlace" del editor: pide texto visible + URL en un solo diálogo y
// convierte ese texto en un enlace que lleva a la URL indicada al hacer
// clic. Si el usuario ya tenía texto seleccionado en el editor, ese texto
// se usa como valor por defecto del campo "texto" y, al confirmar, la
// selección se sustituye por el enlace (para no duplicar el texto).
async function insertarEnlaceEnEditor(editor) {
  editor.focus();
  const selection = window.getSelection();
  const textoSeleccionado = selection && selection.rangeCount ? selection.toString() : "";
  const rangoSeleccionado = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;

  const resultado = await EOF.preguntarEnlace("Texto y URL del enlace", { texto: textoSeleccionado });
  if (!resultado) return;
  const url = normalizarUrlEnlace(resultado.url);
  const texto = resultado.texto || resultado.url;

  editor.focus();
  // Restaura la selección original (el diálogo modal se la ha quitado al
  // foco) para poder sustituirla por el nuevo enlace en el mismo sitio.
  if (rangoSeleccionado) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(rangoSeleccionado);
  }

  const a = document.createElement("a");
  a.href = url;
  a.textContent = texto;
  document.execCommand("insertHTML", false, a.outerHTML);
}

// Extrae el ID numérico del tweet a partir de cualquier URL habitual de
// X/Twitter (twitter.com o x.com, con o sin "www", con parámetros de
// tracking al final, etc.). Devuelve null si la URL no tiene pinta de
// ser un enlace a un tweet concreto, para poder avisar en vez de
// insertar un embed roto. Usada tanto al añadir un tweet (ver
// crearFilaTweet/btnAddTweet más arriba) como al leer la lista de vuelta
// al guardar (obtenerTweetsFormulario).
function idTweetDesdeUrl(url) {
  const match = String(url || "").match(/(?:twitter\.com|x\.com)\/[^/]+\/status(?:es)?\/(\d+)/i);
  return match ? match[1] : null;
}

// Análogo a idTweetDesdeUrl pero para posts (o reels) de Instagram:
// devuelve el código corto (p.ej. "AbCdEfGh") a partir de una URL del
// tipo instagram.com/p/<codigo>/ o instagram.com/reel/<codigo>/, o null
// si no tiene esa pinta.
function idInstagramDesdeUrl(url) {
  const match = String(url || "").match(/instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/i);
  return match ? match[1] : null;
}

// Punto único que decide, a partir de la URL pegada en "Añadir tweet o
// post", si se trata de un tweet de X/Twitter o un post/reel de
// Instagram. Devuelve "twitter", "instagram" o null si no es ninguna de
// las dos cosas. Con esto un solo botón y un solo campo sirven para las
// dos redes: la plataforma se detecta sola, no hay que elegirla aparte.
function plataformaEmbedDesdeUrl(url) {
  if (idTweetDesdeUrl(url)) return "twitter";
  if (idInstagramDesdeUrl(url)) return "instagram";
  return null;
}

document.getElementById("editorToolbar").addEventListener("mousedown", (e) => {
  // Evita que el editor pierda la selección de texto al pulsar un botón.
  if (e.target.closest("button")) e.preventDefault();
});

document.getElementById("editorToolbar").addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  contenidoEditor.focus();

  if (btn.dataset.cmd) {
    document.execCommand(btn.dataset.cmd, false, null);
  } else if (btn.dataset.block) {
    document.execCommand("formatBlock", false, btn.dataset.block);
    // Un párrafo "normal" nuevo no debe arrastrar la clase entradilla.
    if (btn.dataset.block === "p") {
      const bloque = editorEsBloqueValido(contenidoEditor);
      if (bloque) bloque.classList.remove("entradilla");
    }
  } else if (btn.dataset.accion === "entradilla") {
    toggleEntradillaSegura(contenidoEditor);
  } else if (btn.dataset.accion === "enlace") {
    await insertarEnlaceEnEditor(contenidoEditor);
  } else if (btn.dataset.accion === "plantilla") {
    insertarPlantilla(false);
  } else if (btn.dataset.accion === "copiar-formato") {
    copiarConFormato(contenidoEditor);
  } else if (btn.dataset.accion === "pegar-html") {
    const htmlPegado = await EOF.preguntarHTML(
      "Pega aquí el código HTML (la respuesta de tu IA). Sustituirá el contenido actual en castellano.",
      contenidoEditor.innerHTML,
      { textoConfirmar: "Aplicar" }
    );
    if (htmlPegado !== null) contenidoEditor.innerHTML = htmlPegado;
  } else if (btn.dataset.accion === "corregir-formato") {
    const resultado = window.CorrectorFormato?.aplicarCorrectorAlEditor(contenidoEditor);
    if (resultado?.cambiado) {
      actualizarContadorCaracteres();
      EOF.toast("Formato corregido: espacios, comillas, guiones, minutos y mayúsculas revisados.", "exito");
    } else {
      EOF.toast("No se ha encontrado nada que corregir.", "info");
    }
  }
});

// ---------- ARTÍCULOS: traducciones opcionales (eu/ca/gl/en) ----------
// Solo afecta al contenido de la noticia (título, subtítulo, cuerpo); la
// interfaz del panel y de la web sigue siempre en castellano. Cada idioma
// es independiente y opcional: si se deja en blanco, no se traduce y en
// la web se avisa de que esa noticia no está disponible en ese idioma.
const IDIOMAS_TRADUCCION = [
  { cod: "eu", nombre: "Euskera" },
  { cod: "ca", nombre: "Català" },
  { cod: "gl", nombre: "Galego" },
  { cod: "en", nombre: "English" },
];
// Mismo criterio de "traducción completa" que el backend (título + contenido).
// Se centraliza aquí para que el indicador de progreso, el punto de estado
// de cada pestaña y el aviso de hueco usen siempre la misma regla.
function traduccionIdiomaCompleta(campos) {
  return Boolean(campos.titulo && campos.contenido);
}
// "Parcial": hay algo escrito en el idioma pero no llega a ser una
// traducción completa (esto es justo lo que el backend descartaría y
// avisaría en avisos_traduccion al guardar).
function traduccionIdiomaParcial(campos) {
  return Boolean((campos.titulo || campos.subtitulo || campos.contenido) && !traduccionIdiomaCompleta(campos));
}

const traduccionPaneles = document.getElementById("traduccionPaneles");
if (traduccionPaneles) {
  traduccionPaneles.innerHTML = IDIOMAS_TRADUCCION.map((idioma, i) => `
    <div class="panel-traduccion" data-lang-panel="${idioma.cod}" style="display:${i === 0 ? "block" : "none"};">
      <p class="aviso-hueco" data-aviso-lang="${idioma.cod}" style="display:none;"></p>
      <label>Título (${idioma.nombre})</label>
      <input type="text" data-trad="titulo" data-lang="${idioma.cod}">
      <label>Subtítulo (${idioma.nombre})</label>
      <input type="text" data-trad="subtitulo" data-lang="${idioma.cod}">
      <label>Contenido (${idioma.nombre})</label>
      <div class="editor-wrap">
        <div class="editor-toolbar editor-toolbar-trad" data-toolbar-lang="${idioma.cod}">
          <button type="button" class="b" data-cmd="bold" title="Negrita">N</button>
          <button type="button" class="i" data-cmd="italic" title="Cursiva">C</button>
          <button type="button" class="u" data-cmd="underline" title="Subrayado">S</button>
          <span class="sep"></span>
          <button type="button" data-block="p" title="Párrafo normal">Párrafo</button>
          <button type="button" data-accion="entradilla" title="Marca el párrafo como entradilla (arranque en negrita destacada)">Entradilla</button>
          <button type="button" data-block="h3" title="Subtítulo (H3)">H3</button>
          <button type="button" data-block="blockquote" title="Cita destacada">Cita</button>
          <span class="sep"></span>
          <button type="button" data-cmd="insertUnorderedList" title="Lista con viñetas">• Lista</button>
          <button type="button" data-cmd="insertOrderedList" title="Lista numerada">1. Lista</button>
          <button type="button" data-accion="enlace" title="Insertar enlace">Enlace</button>
          <span class="sep"></span>
          <button type="button" data-cmd="undo" title="Deshacer">↺</button>
          <button type="button" data-cmd="redo" title="Rehacer">↻</button>
          <button type="button" data-cmd="removeFormat" title="Quitar formato del texto seleccionado">Limpiar</button>
          <button type="button" class="copiar-formato-btn" data-accion="pegar-html" title="Pega aquí el código HTML que te haya devuelto la IA de traducción, aplicando su formato (no como texto suelto)">⧉ Pegar HTML traducido</button>
        </div>
        <div data-trad="contenido" data-lang="${idioma.cod}" class="article-body editor-contenido-trad" contenteditable="true" data-placeholder="Deja en blanco si no vas a traducir esta noticia a este idioma."></div>
      </div>
      <p class="ayuda-editor">Pega aquí el texto en ${idioma.nombre} con el formato ya traducido (por ejemplo, la respuesta de una IA de traducción a la que le hayas pasado el botón "Copiar con formato" del contenido en castellano). El formato (negrita, enlaces, párrafos...) se conserva al pegar.</p>
    </div>
  `).join("");
}
const traduccionTabs = document.getElementById("traduccionTabs");
const traduccionProgresoTexto = document.getElementById("traduccionProgresoTexto");
const traduccionProgresoRelleno = document.getElementById("traduccionProgresoRelleno");
const traduccionProgreso = document.getElementById("traduccionProgreso");
const avisosTraduccionGuardado = document.getElementById("avisosTraduccionGuardado");

if (traduccionTabs) {
  traduccionTabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-lang]");
    if (!btn) return;
    traduccionTabs.querySelectorAll("button").forEach((b) => b.classList.toggle("activo", b === btn));
    traduccionPaneles.querySelectorAll("[data-lang-panel]").forEach((p) => {
      p.style.display = p.dataset.langPanel === btn.dataset.lang ? "block" : "none";
    });
  });
}

function obtenerTraduccionesFormulario() {
  const traducciones = {};
  for (const { cod } of IDIOMAS_TRADUCCION) {
    traducciones[cod] = {
      titulo: traduccionPaneles.querySelector(`[data-trad="titulo"][data-lang="${cod}"]`).value.trim(),
      subtitulo: traduccionPaneles.querySelector(`[data-trad="subtitulo"][data-lang="${cod}"]`).value.trim(),
      contenido: traduccionPaneles.querySelector(`[data-trad="contenido"][data-lang="${cod}"]`).innerHTML.trim(),
    };
  }
  return traducciones;
}

// Recalcula, para un idioma concreto: el contador de caracteres del
// contenido, el aviso de "falta título/contenido" y el punto de estado
// de su pestaña. Se llama en cada tecleo y también al cargar un artículo.
function actualizarEstadoIdioma(cod) {
  const campos = {
    titulo: traduccionPaneles.querySelector(`[data-trad="titulo"][data-lang="${cod}"]`).value.trim(),
    subtitulo: traduccionPaneles.querySelector(`[data-trad="subtitulo"][data-lang="${cod}"]`).value.trim(),
    contenido: traduccionPaneles.querySelector(`[data-trad="contenido"][data-lang="${cod}"]`).innerText.trim(),
  };

  // Aviso de hueco: mismo criterio que el backend usa para descartar el
  // idioma y avisar en avisos_traduccion, pero mostrado ya en el propio
  // formulario para que el redactor lo vea antes de guardar.
  const aviso = traduccionPaneles.querySelector(`[data-aviso-lang="${cod}"]`);
  const completa = traduccionIdiomaCompleta(campos);
  const parcial = traduccionIdiomaParcial(campos);
  if (aviso) {
    if (parcial) {
      const faltaTitulo = !campos.titulo;
      const faltaContenido = !campos.contenido;
      const partes = [faltaTitulo ? "título" : null, faltaContenido ? "contenido" : null].filter(Boolean);
      aviso.textContent = `Falta ${partes.join(" y ")}: esta traducción no se guardará hasta que completes ambos campos.`;
      aviso.style.display = "flex";
    } else {
      aviso.style.display = "none";
    }
  }

  // Punto de estado en la pestaña correspondiente.
  const estado = traduccionTabs && traduccionTabs.querySelector(`[data-estado-lang="${cod}"]`);
  if (estado) {
    estado.classList.remove("completo", "parcial");
    if (completa) estado.classList.add("completo");
    else if (parcial) estado.classList.add("parcial");
  }

  return completa;
}

// Recalcula el indicador de progreso global ("N de 4 idiomas completos").
function actualizarProgresoTraducciones() {
  if (!traduccionProgresoTexto) return;
  const total = IDIOMAS_TRADUCCION.length;
  const completos = IDIOMAS_TRADUCCION.filter(({ cod }) => actualizarEstadoIdioma(cod)).length;
  traduccionProgresoTexto.textContent = `${completos} de ${total} idiomas completos`;
  if (traduccionProgresoRelleno) traduccionProgresoRelleno.style.width = `${(completos / total) * 100}%`;
  if (traduccionProgreso) traduccionProgreso.classList.toggle("vacio", completos === 0);
}

if (traduccionPaneles) {
  traduccionPaneles.addEventListener("input", (e) => {
    const lang = e.target.closest("[data-lang]") && e.target.closest("[data-lang]").dataset.lang;
    if (lang) actualizarProgresoTraducciones();
  });
  // Barra de herramientas de cada panel de traducción (eu/ca/gl/en): misma
  // lógica que el editor de castellano, para que el formato (negrita,
  // cursiva, enlaces, párrafos, entradilla, listas...) no se pierda al
  // traducir.
  traduccionPaneles.addEventListener("mousedown", (e) => {
    if (e.target.closest(".editor-toolbar-trad button")) e.preventDefault();
  });
  traduccionPaneles.addEventListener("click", async (e) => {
    const btn = e.target.closest(".editor-toolbar-trad button");
    if (!btn) return;
    const toolbar = btn.closest(".editor-toolbar-trad");
    const cod = toolbar.dataset.toolbarLang;
    const editor = traduccionPaneles.querySelector(`[data-trad="contenido"][data-lang="${cod}"]`);
    editor.focus();

    if (btn.dataset.cmd) {
      document.execCommand(btn.dataset.cmd, false, null);
    } else if (btn.dataset.block) {
      document.execCommand("formatBlock", false, btn.dataset.block);
      if (btn.dataset.block === "p") {
        const bloque = editorEsBloqueValido(editor);
        if (bloque) bloque.classList.remove("entradilla");
      }
    } else if (btn.dataset.accion === "entradilla") {
      toggleEntradillaSegura(editor);
    } else if (btn.dataset.accion === "enlace") {
      await insertarEnlaceEnEditor(editor);
    } else if (btn.dataset.accion === "pegar-html") {
      const htmlPegado = await EOF.preguntarHTML(
        `Pega aquí el código HTML traducido a ${toolbar.dataset.toolbarLang ? IDIOMAS_TRADUCCION.find((i) => i.cod === toolbar.dataset.toolbarLang).nombre : ""} (la respuesta de tu IA de traducción). Sustituirá el contenido actual de este idioma.`,
        editor.innerHTML,
        { textoConfirmar: "Aplicar" }
      );
      if (htmlPegado !== null) editor.innerHTML = htmlPegado;
    }
    actualizarProgresoTraducciones();
  });
}

// Muestra (o limpia) los avisos_traduccion que devuelve el backend tras
// guardar: idiomas con texto a medias que se han descartado por no llegar
// a ser una traducción completa. No sustituye a los avisos por-idioma de
// arriba (que se ven ANTES de guardar); esto confirma qué se ha descartado
// realmente en el guardado que se acaba de hacer.
function mostrarAvisosTraduccionGuardado(avisos) {
  if (!avisosTraduccionGuardado) return;
  if (!avisos || avisos.length === 0) {
    avisosTraduccionGuardado.style.display = "none";
    avisosTraduccionGuardado.innerHTML = "";
    return;
  }
  avisosTraduccionGuardado.className = "avisos-traduccion-guardado";
  avisosTraduccionGuardado.style.display = "block";
  avisosTraduccionGuardado.innerHTML = `
    No se han guardado algunas traducciones por estar incompletas:
    <ul>${avisos.map((a) => `<li>${a}</li>`).join("")}</ul>
  `;
}

function resetTraducciones(articulo) {
  for (const { cod } of IDIOMAS_TRADUCCION) {
    traduccionPaneles.querySelector(`[data-trad="titulo"][data-lang="${cod}"]`).value = (articulo && articulo[`titulo_${cod}`]) || "";
    traduccionPaneles.querySelector(`[data-trad="subtitulo"][data-lang="${cod}"]`).value = (articulo && articulo[`subtitulo_${cod}`]) || "";
    traduccionPaneles.querySelector(`[data-trad="contenido"][data-lang="${cod}"]`).innerHTML = (articulo && articulo[`contenido_${cod}`]) || "";
  }
  // Vuelve siempre a mostrar la primera pestaña (euskera) al abrir el formulario.
  if (traduccionTabs) traduccionTabs.querySelector("button").click();
  actualizarProgresoTraducciones();
  mostrarAvisosTraduccionGuardado(null);
}
resetTraducciones(null);

// Rellena los paneles de traducción a partir del objeto que devuelve
// obtenerTraduccionesFormulario() ({cod: {titulo, subtitulo, contenido}}),
// usado al recuperar un borrador autoguardado en este navegador (a
// diferencia de resetTraducciones, que espera un artículo del servidor
// con claves tipo titulo_eu, titulo_ca...).
function restaurarTraduccionesDesdeBorrador(traducciones) {
  if (!traduccionPaneles || !traducciones) return;
  for (const { cod } of IDIOMAS_TRADUCCION) {
    const t = traducciones[cod] || {};
    traduccionPaneles.querySelector(`[data-trad="titulo"][data-lang="${cod}"]`).value = t.titulo || "";
    traduccionPaneles.querySelector(`[data-trad="subtitulo"][data-lang="${cod}"]`).value = t.subtitulo || "";
    traduccionPaneles.querySelector(`[data-trad="contenido"][data-lang="${cod}"]`).innerHTML = t.contenido || "";
    actualizarEstadoIdioma(cod);
  }
  actualizarProgresoTraducciones();
}

// Snapshot de todos los campos del formulario que importan para el
// contenido final de la noticia (no de los de solo-UI, como qué pestaña
// de traducción está abierta). Se usa para saber, al pulsar
// "Previsualizar", si ha habido algún cambio real desde que se cargó la
// noticia: si no lo hay, no tiene sentido abrir una vista previa aparte y
// se lleva directamente a la noticia ya publicada (ver más abajo).
function snapshotFormularioArticulo() {
  return JSON.stringify({
    titulo: document.getElementById("titulo").value,
    subtitulo: document.getElementById("subtitulo").value,
    tipo: document.getElementById("tipo").value,
    // Igual que en guardarArticulo: para previa/crónica la categoría y el
    // club "reales" son CATEGORIA_AUTOMATICA_ACTUAL y
    // CLUB_AUTOMATICO_ACTUAL, no los <select> ocultos.
    categoria: esTipoConClubAutomatico(document.getElementById("tipo").value)
      ? CATEGORIA_AUTOMATICA_ACTUAL
      : document.getElementById("categoria").value,
    categorias_adicionales: categoriasAdicionalesPicker ? categoriasAdicionalesPicker.obtenerSeleccion().slice().sort() : [],
    club: esTipoConClubAutomatico(document.getElementById("tipo").value)
      ? CLUB_AUTOMATICO_ACTUAL
      : document.getElementById("club").value,
    autor_id: selectAutor ? selectAutor.value : "",
    coautor_id: selectCoautor ? selectCoautor.value : "",
    imagen_url: obtenerPortadaSeleccionada(),
    imagenes: obtenerImagenesFormulario().concat(collagesArticuloAImagenes()).concat(obtenerTweetsFormulario()),
    resultado_id: selectResultadoArticulo.value || "",
    contenido: contenidoEditor.innerHTML,
    destacado: document.getElementById("destacado").checked,
    publicado: document.getElementById("publicado").checked,
    banner_urgente: checkBannerUrgente ? checkBannerUrgente.checked : false,
    traducciones: obtenerTraduccionesFormulario(),
  });
}
// Snapshot tomado en el momento de cargar la noticia en el formulario
// (o de crear una nueva), para comparar contra el estado actual.
let SNAPSHOT_ARTICULO_ORIGINAL = null;

// ---------- ARTÍCULOS: crear / editar ----------

// Valida el formulario y, si es correcto, guarda la noticia. Si se pasa
// un PIN de "Última hora" (redactor publicando directamente), se manda
// junto al resto de campos para que el backend lo compruebe.
async function guardarArticulo(ultimaHoraPin, estadoBorrador) {
  // Si se pulsa "Guardar" mientras alguna foto todavía se está subiendo a
  // Cloudinary (el botón de subir queda con la clase "subiendo" hasta que
  // termina), esa foto en concreto todavía no tiene URL en su campo
  // oculto y obtenerImagenesFormulario() la descartaría en silencio: la
  // noticia se guardaría sin avisar de nada, con esa foto de menos. Se
  // bloquea aquí en vez de deshabilitar el botón de Guardar durante la
  // subida para no complicar el resto de flujos (autoguardado de
  // borrador, etc.) que también llaman a esta función.
  if (SUBIDAS_IMAGEN_EN_CURSO > 0) {
    EOF.toast("Espera a que termine de subirse la foto antes de guardar.", "error");
    return false;
  }
  if (checkProgramarNoticia?.checked) {
    if (!inputProgramadoPara.value) {
      EOF.toast("Elige la fecha y hora en la que quieres que se publique la noticia.", "error");
      return false;
    }
    if (!programadoParaISO()) {
      EOF.toast("La fecha de publicación programada debe ser futura.", "error");
      return false;
    }
  }
  if (contenidoEditor.innerText.trim() === "") {
    EOF.toast("El contenido de la noticia no puede estar vacío.", "error");
    return false;
  }
  // Al marcar la noticia como terminada (o publicarla directamente) se
  // pasa automáticamente el corrector de formato por reglas regex:
  // limpia el HTML pegado desde Word/webs y corrige espacios, comillas,
  // guiones, minutos de partido, resultados y mayúsculas. No se aplica
  // en "en_proceso" para no interferir mientras se sigue escribiendo.
  if (estadoBorrador !== "en_proceso") {
    window.CorrectorFormato?.aplicarCorrectorAlEditor(contenidoEditor);
  }
  // Un borrador guardado como "en proceso" (todavía se está escribiendo)
  // no tiene por qué cumplir los límites de longitud de una noticia
  // terminada: esos límites solo tienen sentido para lo que se va a
  // publicar/marcar como terminado.
  if (estadoBorrador !== "en_proceso") {
    const longitudContenido = longitudContenidoActual();
    if (longitudContenido < CONTENIDO_MIN) {
      EOF.toast(`El contenido debe tener al menos ${CONTENIDO_MIN} caracteres (tiene ${longitudContenido}).`, "error");
      contenidoEditor.focus();
      return false;
    }
    if (longitudContenido > CONTENIDO_MAX) {
      EOF.toast(`El contenido no puede superar los ${CONTENIDO_MAX} caracteres (tiene ${longitudContenido}).`, "error");
      contenidoEditor.focus();
      return false;
    }
  }
  if (selectAutor && selectCoautor && selectCoautor.value && selectCoautor.value === selectAutor.value) {
    EOF.toast("El segundo autor no puede ser la misma persona que el autor principal.", "error");
    return false;
  }
  // Es obligatorio poner al menos una imagen de portada por noticia,
  // salvo en un borrador "en proceso" (mismo criterio que el backend,
  // ver worker/src/index.js).
  if (estadoBorrador !== "en_proceso" && !obtenerPortadaSeleccionada()) {
    EOF.toast("Debes añadir al menos una imagen de portada a la noticia.", "error");
    return false;
  }
  // Para previa/crónica el club ya no lo elige el redactor: se exige
  // tener un resultado vinculado (con sus dos equipos y competición)
  // ANTES de mandar nada al backend, para dar un aviso claro en vez de
  // un error genérico de la API (el backend igualmente lo revalida por
  // su cuenta, ver resolverClubArticulo en worker/src/index.js). El caso
  // de un tipo incompatible con el estado del resultado (crónica sin
  // terminar, previa ya jugada) ya no puede darse aquí: el propio
  // desplegable "Tipo" se autocorrige en cuanto ocurre (ver
  // actualizarClubAutomatico), así que si sigue en "previa"/"cronica" es
  // porque encaja con el resultado vinculado o porque no hay ninguno.
  if (esTipoConClubAutomatico(document.getElementById("tipo").value) && (!CLUB_AUTOMATICO_ACTUAL || CLUB_AUTOMATICO_ACTUAL.length < 2 || !CATEGORIA_AUTOMATICA_ACTUAL)) {
    EOF.toast("Una previa o crónica debe tener un resultado vinculado (con sus dos equipos y su competición) para poder guardarse. Vincúlalo en \"Resultado vinculado\" más abajo.", "error");
    return false;
  }
  const id = document.getElementById("articleId").value;
  const imagenes = obtenerImagenesFormulario().concat(collagesArticuloAImagenes()).concat(obtenerTweetsFormulario());
  const body = {
    titulo: document.getElementById("titulo").value,
    subtitulo: document.getElementById("subtitulo").value,
    tipo: document.getElementById("tipo").value,
    // Para previa/crónica se manda la categoría calculada en
    // CATEGORIA_AUTOMATICA_ACTUAL (ver actualizarClubAutomatico); para el
    // resto de tipos, la que haya elegido el redactor en el desplegable
    // normal, igual que siempre. El backend vuelve a recalcularla de
    // todas formas para previa/crónica (nunca se fía de lo que mande el
    // panel para ese caso), esto es solo para que quien vea el JSON de
    // la petición ya lleve el valor correcto.
    categoria: esTipoConClubAutomatico(document.getElementById("tipo").value)
      ? CATEGORIA_AUTOMATICA_ACTUAL
      : document.getElementById("categoria").value,
    categorias_adicionales: categoriasAdicionalesPicker ? categoriasAdicionalesPicker.obtenerSeleccion() : [],
    // Para previa/crónica se manda el array de los dos clubes calculado
    // en CLUB_AUTOMATICO_ACTUAL (ver actualizarClubAutomatico); para el
    // resto de tipos, el club que haya elegido el redactor en el
    // desplegable normal, igual que siempre. El backend vuelve a
    // recalcularlo de todas formas para previa/crónica (nunca se fía de
    // lo que mande el panel para ese caso), esto es solo para que quien
    // vea el JSON de la petición ya lleve el valor correcto.
    club: esTipoConClubAutomatico(document.getElementById("tipo").value)
      ? CLUB_AUTOMATICO_ACTUAL
      : document.getElementById("club").value,
    autor_id: selectAutor ? selectAutor.value : undefined,
    coautor_id: selectCoautor ? (selectCoautor.value || null) : undefined,
    imagen_url: obtenerPortadaSeleccionada(),
    imagenes,
    resultado_id: selectResultadoArticulo.value || null,
    contenido: contenidoEditor.innerHTML,
    destacado: document.getElementById("destacado").checked,
    publicado: document.getElementById("publicado").checked,
    // El servidor recalcula banner_urgente_hasta siempre desde cero
    // (duración fija de 2h) en cuanto ve este campo en el body; nunca
    // se manda una fecha de caducidad desde el panel.
    banner_urgente: checkBannerUrgente ? checkBannerUrgente.checked : false,
    traducciones: obtenerTraduccionesFormulario(),
  };
  // La ficha técnica solo tiene sentido para crónicas; si el tipo es
  // otro no se manda el campo (el backend conserva lo que hubiera, y
  // si nunca lo hubo no se crea de más).
  if (document.getElementById("tipo").value === "cronica") {
    body.ficha_tecnica = obtenerFichaTecnicaFormulario();
  }
  const programadoParaValor = programadoParaISO();
  if (programadoParaValor) body.programado_para = programadoParaValor;
  if (ultimaHoraPin) body.ultima_hora_pin = ultimaHoraPin;
  // Si se guarda como borrador, se manda si el redactor ha dicho que está
  // terminada o que la sigue escribiendo (respondido en la notificación
  // que se le muestra justo antes de llamar a esta función). El backend
  // solo avisa por email a la redacción cuando es "terminado".
  if (!body.publicado && estadoBorrador) body.estado_borrador = estadoBorrador;
  try {
    let slugResultado = null;
    let avisosTraduccion = [];
    let publicadoFinal = body.publicado;
    if (id) {
      const resp = await apiFetch(`/api/articles/${id}`, { method: "PUT", body: JSON.stringify(body) }).catch((err) => {
        err.message = `${err.message} (editando noticia id=${id})`;
        throw err;
      });
      avisosTraduccion = (resp && resp.avisos_traduccion) || [];
      if (resp && typeof resp.publicado !== "undefined") publicadoFinal = !!resp.publicado;
    } else {
      const resp = await apiFetch(`/api/articles`, { method: "POST", body: JSON.stringify(body) });
      slugResultado = resp && resp.slug;
      avisosTraduccion = (resp && resp.avisos_traduccion) || [];
      if (resp && typeof resp.publicado !== "undefined") publicadoFinal = !!resp.publicado;
    }
    // Si se ha pedido publicar con un PIN de "Última hora" pero el
    // backend ha terminado guardándolo como borrador, es que el PIN era
    // incorrecto: se avisa como fallo para que el modal lo muestre y deje
    // reintentar, en vez de darlo como guardado con éxito.
    if (ultimaHoraPin && body.publicado && !publicadoFinal) {
      return false;
    }
    // Si el backend ha descartado alguna traducción por estar incompleta,
    // se avisa con un toast persistente (además del aviso visual que ya
    // se veía en el propio idioma antes de guardar).
    if (avisosTraduccion.length > 0) {
      EOF.toast(
        `Aviso: ${avisosTraduccion.length} traducción(es) no se han guardado por estar incompletas.`,
        "error"
      );
    }
    cancelarEdicion();
    // Al guardar (crear o editar) se sale al listado de noticias, en vez
    // de quedarse en el formulario, para ver de un vistazo que ha quedado
    // bien guardada junto con el resto.
    document.querySelector('#panel-noticias .subtabs button[data-subtab="lista"]').click();
    // Si es una noticia nueva y se ha publicado (no un borrador), se ofrece
    // directamente el texto para compartirla en redes. Si se ha programado,
    // también se ofrece: el texto se puede preparar ya, aunque el enlace no
    // funcionará hasta que la noticia se publique sola a su hora (ver
    // abrirModalCompartir).
    if (!id && (publicadoFinal || programadoParaValor) && slugResultado) {
      abrirModalCompartir({ slug: slugResultado, titulo: body.titulo, subtitulo: body.subtitulo, categoria: body.categoria, tipo: body.tipo, programado_para: programadoParaValor });
    }
    return true;
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
    return false;
  }
}

// Cambia el texto del botón de guardar según si se está programando la
// publicación o no, para que quede claro qué va a pasar al pulsarlo.
function actualizarTextoBotonGuardar() {
  const btn = document.getElementById("btnGuardar");
  if (!btn) return;
  const editando = !!document.getElementById("articleId").value;
  if (checkProgramarNoticia?.checked && programadoParaISO()) {
    btn.textContent = "Programar publicación";
  } else {
    btn.textContent = editando ? "Guardar cambios" : "Publicar noticia";
  }
}

formArticle.addEventListener("submit", async (e) => {
  e.preventDefault();
  // Un redactor de Nivel 1 no puede publicar directamente: si ha dejado
  // marcada "Publicada", primero hay que pedirle el PIN de "Última
  // hora" (o que elija guardar como borrador). A partir de Nivel 2 ya
  // publica directo sin PIN, igual que un admin (que siempre está al
  // nivel máximo). USER.nivel se refresca al arrancar el panel (ver
  // refrescarNivelUsuario) para que un ascenso reciente tenga efecto
  // sin tener que volver a iniciar sesión.
  const quierePublicar = document.getElementById("publicado").checked;
  const nivelUsuarioActual = USER.rol === "admin" ? 4 : (USER.nivel || 1);
  if (USER.rol !== "admin" && nivelUsuarioActual < 2 && quierePublicar) {
    abrirModalPinUltimaHora("articulo");
    return;
  }
  // Si se está programando la publicación (solo admin), se guarda
  // directamente: no tiene sentido preguntar "¿está terminada?" como con
  // un borrador normal, porque esto no es un borrador a la espera de
  // revisión, es una noticia ya lista que se publicará sola a su hora.
  if (checkProgramarNoticia?.checked) {
    // Si la programación es inválida (sin fecha o fecha ya pasada), se
    // deja que guardarArticulo() haga la validación y muestre el error
    // correspondiente directamente, en vez de caer al flujo de borrador
    // normal y preguntar "¿está terminada?" (que no tiene sentido aquí:
    // el usuario ha marcado "Programar", no "Guardar como borrador").
    await guardarArticulo(null);
    return;
  }
  // Se va a guardar como borrador (no publicado): antes de guardar, se
  // pregunta con una notificación si la noticia está terminada o si se
  // sigue escribiendo, para guardarla con ese estado y para que el
  // backend decida si avisa por correo a la redacción o no.
  // Excepción: si la noticia YA estaba marcada como "terminada" (ya se
  // avisó por correo en su momento) y se sigue guardando sin publicar
  // -normalmente un admin tocando algo antes de subirla-, no tiene
  // sentido volver a preguntar cada vez: se mantiene "terminada" sin
  // mostrar el modal de nuevo.
  const estadoBorradorOriginal = document.getElementById("articleEstadoBorradorOriginal").value;
  const programadoParaOriginal = document.getElementById("articleProgramadoParaOriginal").value === "1";
  if (!quierePublicar) {
    // Igual que con un borrador que ya estaba "terminado": si la noticia
    // estaba programada (en revisión, lista para publicarse sola) y ahora
    // se quita esa programación sin marcar "Publicada", no tiene sentido
    // volver a preguntar "¿está terminada?" -ya lo estaba, solo se ha
    // cancelado la fecha de publicación automática- así que se manda
    // directamente a "en revisión" sin abrir el modal.
    if (estadoBorradorOriginal === "terminado" || programadoParaOriginal) {
      await guardarArticulo(null, "terminado");
      return;
    }
    abrirModalEstadoBorrador();
    return;
  }
  await guardarArticulo(null);
});

// ---------- Notificación "¿Está terminada la noticia?" al guardar como borrador ----------
function abrirModalEstadoBorrador() {
  document.getElementById("modalEstadoBorrador").classList.add("abierto");
}
function cerrarModalEstadoBorrador() {
  document.getElementById("modalEstadoBorrador").classList.remove("abierto");
}
const modalEstadoBorradorEl = document.getElementById("modalEstadoBorrador");
if (modalEstadoBorradorEl) {
  modalEstadoBorradorEl.addEventListener("click", (e) => {
    if (e.target === modalEstadoBorradorEl) cerrarModalEstadoBorrador();
  });
}
document.getElementById("btnBorradorTerminado")?.addEventListener("click", async () => {
  cerrarModalEstadoBorrador();
  await guardarArticulo(null, "terminado");
});
document.getElementById("btnBorradorEnProceso")?.addEventListener("click", async () => {
  cerrarModalEstadoBorrador();
  await guardarArticulo(null, "en_proceso");
});

// ---------- ARTÍCULOS: previsualizar antes de publicar ----------
// Arma el mismo objeto "article" que devolvería la API a partir de lo que
// hay ahora mismo en el formulario (sin guardar nada todavía). Se usa
// tanto para abrir la pestaña de previsualización la primera vez como
// para reenviar los cambios en vivo a esa misma pestaña mientras sigue
// abierta (ver CANAL_PREVIEW más abajo), sin que haga falta volver a
// pulsar el botón "Previsualizar" cada vez.
async function construirArticleParaPreview() {
  const autorId = selectAutor ? selectAutor.value : "";
  const autorNombre = (selectAutor && autorId && selectAutor.selectedOptions[0])
    ? selectAutor.selectedOptions[0].textContent.trim()
    : (USER ? USER.nombre || USER.username : "");
  const coautorId = selectCoautor ? selectCoautor.value : "";
  const coautorNombre = (selectCoautor && coautorId && selectCoautor.selectedOptions[0])
    ? selectCoautor.selectedOptions[0].textContent.trim()
    : "";

  let resultado = null;
  const resultadoId = selectResultadoArticulo.value;
  if (resultadoId && resultadoId !== "__nuevo__") {
    try {
      // Antes solo se pedía /api/results (la lista), que no trae los
      // eventos (goles/tarjetas) de cada partido -esos solo van en el
      // detalle-, así que en la previsualización el marcador salía sin
      // el botón de "Ver goles y tarjetas". Además, buscar el id dentro
      // de esa lista dependía de su límite y orden propios (por fecha,
      // sin filtrar por competición): con un partido antiguo o fuera de
      // ese recorte, "resultado" se quedaba en null aunque el id fuera
      // válido. Se pide directamente /api/results/:id (el mismo
      // endpoint de detalle que ya usan partidos.js y minuto-a-minuto.js
      // para esto mismo), junto con sus eventos, en paralelo.
      const [{ resultado: encontrado = null }, { eventos = [] }] = await Promise.all([
        apiFetch(`/api/results/${resultadoId}`).catch(() => ({ resultado: null })),
        apiFetch(`/api/results/${resultadoId}/eventos`).catch(() => ({ eventos: [] })),
      ]);
      resultado = encontrado;
      if (resultado) resultado = { ...resultado, eventos };
    } catch { resultado = null; }
  }

  // Se incluyen también las traducciones tal y como están ahora mismo en
  // el formulario (aunque no se hayan guardado todavía), aplanadas igual
  // que las devolvería la API, y "idiomas_disponibles" calculado con la
  // misma regla que el backend (idiomaCompleto: título + contenido no
  // vacíos), para que el selector de idioma de la previsualización
  // funcione exactamente igual que en la noticia ya publicada.
  const traduccionesForm = obtenerTraduccionesFormulario();
  const camposTraduccion = {};
  const idiomasDisponibles = ["es"];
  for (const { cod } of IDIOMAS_TRADUCCION) {
    const t = traduccionesForm[cod] || {};
    const titulo = (t.titulo || "").trim();
    const contenido = (t.contenido || "").trim();
    const completo = titulo !== "" && contenido !== "";
    camposTraduccion[`titulo_${cod}`] = completo ? t.titulo : null;
    camposTraduccion[`subtitulo_${cod}`] = completo ? t.subtitulo : null;
    camposTraduccion[`contenido_${cod}`] = completo ? t.contenido : null;
    if (completo) idiomasDisponibles.push(cod);
  }

  const article = {
    titulo: document.getElementById("titulo").value || "(Sin título)",
    subtitulo: document.getElementById("subtitulo").value,
    // Igual que al guardar: para previa/crónica se usan la categoría y
    // el club calculados automáticamente (CATEGORIA_AUTOMATICA_ACTUAL y
    // CLUB_AUTOMATICO_ACTUAL), no los <select> ocultos.
    categoria: esTipoConClubAutomatico(document.getElementById("tipo").value)
      ? CATEGORIA_AUTOMATICA_ACTUAL
      : document.getElementById("categoria").value,
    club: esTipoConClubAutomatico(document.getElementById("tipo").value)
      ? CLUB_AUTOMATICO_ACTUAL
      : document.getElementById("club").value,
    tipo: selectTipoArticulo ? selectTipoArticulo.value : undefined,
    autor_id: autorId || null,
    autor_nombre: autorNombre,
    coautor_id: coautorId || null,
    coautor_nombre: coautorNombre || null,
    imagen_url: obtenerPortadaSeleccionada(),
    imagenes: obtenerImagenesFormulario().concat(collagesArticuloAImagenes()).concat(obtenerTweetsFormulario()),
    contenido: contenidoEditor.innerHTML,
    fecha_publicacion: new Date().toISOString(),
    resultado,
    // Igual que al guardar (ver más abajo, body.ficha_tecnica): solo tiene
    // sentido para crónicas, y así noticia.html la pinta también en la
    // pestaña de previsualización (antes no se incluía aquí y la ficha
    // técnica nunca se veía al previsualizar).
    ficha_tecnica: (selectTipoArticulo && selectTipoArticulo.value === "cronica")
      ? obtenerFichaTecnicaFormulario()
      : null,
    ...camposTraduccion,
    idiomas_disponibles: idiomasDisponibles,
  };

  return article;
}

// Canal para avisar a una pestaña de previsualización ya abierta de que
// hay cambios nuevos en el formulario, sin volver a pulsar "Previsualizar".
const CANAL_PREVIEW = ("BroadcastChannel" in window) ? new BroadcastChannel("eof_preview_articulo") : null;
let previewAbierta = false; // solo se activa el envío en vivo tras abrir la preview al menos una vez
let timeoutPreviewEnVivo = null;

function enviarPreviewEnVivo() {
  if (!previewAbierta || !CANAL_PREVIEW) return;
  clearTimeout(timeoutPreviewEnVivo);
  // Pequeño debounce: mientras se está escribiendo no tiene sentido
  // reconstruir y emitir el artículo en cada pulsación de tecla.
  timeoutPreviewEnVivo = setTimeout(async () => {
    if (contenidoEditor.innerText.trim() === "") return;
    try {
      const article = await construirArticleParaPreview();
      sessionStorage.setItem("eof_preview_articulo", JSON.stringify(article));
      CANAL_PREVIEW.postMessage(article);
    } catch { /* si algo falla al armar el preview en vivo, no interrumpe la edición */ }
  }, 500);
}
// Cualquier cambio dentro del formulario de la noticia (texto, checkboxes,
// selects, imágenes...) dispara el reenvío en vivo a la pestaña de preview.
document.getElementById("formArticle")?.addEventListener("input", enviarPreviewEnVivo);
document.getElementById("formArticle")?.addEventListener("change", enviarPreviewEnVivo);
contenidoEditor?.addEventListener("input", enviarPreviewEnVivo);

document.getElementById("btnPrevisualizar").addEventListener("click", async () => {
  // Si la noticia que se está editando ya está publicada Y no se ha
  // tocado nada desde que se cargó en el formulario, no tiene sentido
  // abrir una vista previa aparte: se abre directamente la noticia ya
  // publicada (con su slug real), que es exactamente lo que el autor va a
  // ver. En cuanto hay al menos un cambio sin guardar (aunque sea uno
  // solo), se abre la previsualización de verdad, para no enseñar una
  // versión desactualizada de la noticia.
  const slugExistente = document.getElementById("articleSlug").value;
  const categoriaExistente = document.getElementById("categoria").value;
  const publicadoOriginal = document.getElementById("articlePublicadoOriginal").value === "1";
  const hayCambiosSinGuardar = snapshotFormularioArticulo() !== SNAPSHOT_ARTICULO_ORIGINAL;
  if (slugExistente && publicadoOriginal && !hayCambiosSinGuardar) {
    window.open(urlNoticia(categoriaExistente, slugExistente), "_blank");
    return;
  }

  if (contenidoEditor.innerText.trim() === "") {
    EOF.toast("Escribe algo de contenido antes de previsualizar.", "error");
    return;
  }

  const article = await construirArticleParaPreview();
  sessionStorage.setItem("eof_preview_articulo", JSON.stringify(article));
  previewAbierta = true;
  window.open("../noticia.html?preview=1", "_blank");
});

// ---------- Modal PIN "Última hora" ----------
function limpiarPinUltimaHoraInputs() {
  pinInputs.forEach((inp) => { if (inp) inp.value = ""; });
  document.getElementById("errPinUltimaHora").style.display = "none";
}
function leerPinUltimaHoraInputs() {
  return pinInputs.map((inp) => inp.value).join("");
}
pinInputs.forEach((inp, i) => {
  if (!inp) return;
  inp.addEventListener("input", () => {
    inp.value = inp.value.replace(/[^0-9]/g, "").slice(0, 1);
    if (inp.value && pinInputs[i + 1]) pinInputs[i + 1].focus();
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !inp.value && pinInputs[i - 1]) pinInputs[i - 1].focus();
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("btnConfirmarPinUltimaHora").click(); }
  });
});

function abrirModalPinUltimaHora() {
  limpiarPinUltimaHoraInputs();
  document.getElementById("modalPinUltimaHora").classList.add("abierto");
  setTimeout(() => pinInputs[0] && pinInputs[0].focus(), 50);
}
function cerrarModalPinUltimaHora() {
  document.getElementById("modalPinUltimaHora").classList.remove("abierto");
}
const modalPinUltimaHoraEl = document.getElementById("modalPinUltimaHora");
if (modalPinUltimaHoraEl) {
  modalPinUltimaHoraEl.addEventListener("click", (e) => {
    if (e.target === modalPinUltimaHoraEl) cerrarModalPinUltimaHora();
  });
}
document.getElementById("btnConfirmarPinUltimaHora")?.addEventListener("click", async () => {
  const pin = leerPinUltimaHoraInputs();
  const errEl = document.getElementById("errPinUltimaHora");
  if (!/^[0-9]{4}$/.test(pin)) {
    errEl.textContent = "Introduce los 4 dígitos de tu PIN.";
    errEl.style.display = "block";
    return;
  }
  const ok = await guardarArticulo(pin);
  if (ok) {
    cerrarModalPinUltimaHora();
  } else {
    errEl.textContent = "PIN incorrecto o la noticia se ha guardado como borrador. Revisa el PIN e inténtalo de nuevo.";
    errEl.style.display = "block";
    limpiarPinUltimaHoraInputs();
    setTimeout(() => pinInputs[0] && pinInputs[0].focus(), 50);
  }
});
document.getElementById("btnGuardarComoBorradorPin")?.addEventListener("click", async () => {
  document.getElementById("publicado").checked = false;
  sincronizarDestacadoConPublicado();
  cerrarModalPinUltimaHora();
  abrirModalEstadoBorrador();
});

function cancelarEdicion() {
  formArticle.reset();
  document.getElementById("articleId").value = "";
  document.getElementById("articleSlug").value = "";
  document.getElementById("articlePublicadoOriginal").value = "";
  document.getElementById("articleEstadoBorradorOriginal").value = "";
  document.getElementById("articleProgramadoParaOriginal").value = "";
  // Un redactor de Nivel 1 no puede publicar directamente (el backend lo
  // guardaría como borrador salvo que use el PIN de "Última hora"): se le
  // deja el checkbox "Publicada" desmarcado por defecto al abrir una
  // noticia nueva, en vez de marcado, para que el formulario no sugiera
  // algo que en realidad no va a pasar sin ese PIN. A partir de Nivel 2 y
  // para un admin, se mantiene marcado como hasta ahora.
  const nivelParaPublicadoPorDefecto = USER.rol === "admin" ? 4 : (USER.nivel || 1);
  document.getElementById("publicado").checked = nivelParaPublicadoPorDefecto >= 2;
  sincronizarDestacadoConPublicado();
  sincronizarProgramarConPublicado();
  sincronizarCampoFechaProgramada();
  actualizarTextoBotonGuardar();
  document.getElementById("btnCancelar").style.display = "none";
  poblarCategoriaSegunAutor(USER.id, "");
  if (categoriasAdicionalesPicker) categoriasAdicionalesPicker.establecerSeleccion([]);
  cargarAutoresSelect(USER.id, "");
  resetImagenes([]);
  resetTweets([]);
  COLLAGES_ARTICULO = [];
  pintarListaCollages();
  cargarResultadosSelect("");
  insertarPlantilla(true);
  actualizarContadorCaracteres();
  resetTraducciones(null);
  cargarFichaTecnicaFormulario(null);
  SNAPSHOT_ARTICULO_ORIGINAL = snapshotFormularioArticulo();
  actualizarBloqueAlineacionesArticulo("");
  previewAbierta = false; // se deja de reenviar en vivo a la pestaña de preview: era de otra noticia
}

// Cache en memoria de los artículos listados, para no tener que volcar el
// JSON de cada uno dentro de un atributo onclick (eso rompía con
// "Unexpected identifier" en cuanto el título/subtítulo traía comillas
// dobles, ya que el navegador ejecuta ese atributo como código JS literal).
// Ahora los botones solo pasan el id y aquí se busca el objeto completo.
let ARTICULOS_CACHE = {};

// IDs de artículos/resultados sobre los que el usuario tiene ahora mismo
// un permiso temporal vigente (solicitud aprobada), para poder mostrar
// "Editar"/"Eliminar" en vez de "Solicitar edición" también en esos casos.
let PERMISOS_TEMPORALES_ARTICULO = new Set();
let PERMISOS_TEMPORALES_RESULTADO = new Set();

async function cargarPermisosTemporalesVigentes() {
  if (USER.rol === "admin") return; // un admin siempre puede, no hace falta consultarlo
  try {
    const { solicitudes = [] } = await apiFetch(`/api/edit-requests?estado=aprobada`);
    const ahora = Date.now();
    PERMISOS_TEMPORALES_ARTICULO = new Set();
    PERMISOS_TEMPORALES_RESULTADO = new Set();
    solicitudes.forEach((s) => {
      if (s.solicitante_id !== USER.id) return;
      if (!s.permiso_expira_at) return;
      if (new Date(s.permiso_expira_at.replace(" ", "T") + "Z").getTime() <= ahora) return;
      if (s.tipo_entidad === "resultado") PERMISOS_TEMPORALES_RESULTADO.add(s.entidad_id);
      else PERMISOS_TEMPORALES_ARTICULO.add(s.entidad_id);
    });
  } catch {
    // Si falla, simplemente se tratan como "no tiene permiso temporal"; no
    // bloquea el resto del listado.
  }
}

// Nivel real del usuario conectado: 4 (máximo) fijo para admins, o el
// nivel guardado en USER (refrescado al arrancar, ver
// refrescarNivelUsuario) para el resto.
function nivelUsuarioConectado() {
  return USER.rol === "admin" ? 4 : (USER.nivel || 1);
}

// Un borrador "terminado" (ya avisado por email a la redacción) queda
// bloqueado para todo el mundo salvo un admin, hasta que se publique.
function articuloBloqueadoPorTerminado(a) {
  return !a.publicado && a.estado_borrador === "terminado";
}

function puedeGestionarArticulo(a) {
  if (USER.rol === "admin") return true;
  // Nivel 4 ("Experto"): puede revisar y corregir el contenido de
  // cualquier compañero sin tener que pedir permiso -incluidas las
  // noticias "en espera de publicación"-, igual que ya contempla el
  // Worker en puedeEditar(). Por eso este atajo va ANTES del bloqueo por
  // "terminado": para un Nivel 4 ese bloqueo no aplica.
  if (nivelUsuarioConectado() >= 4) return true;
  if (articuloBloqueadoPorTerminado(a)) return false;
  return a.autor_id === USER.id || a.coautor_id === USER.id || PERMISOS_TEMPORALES_ARTICULO.has(a.id);
}
// El borrado NO se abre al atajo de Nivel 4: revisar/corregir contenido
// ajeno no incluye poder eliminarlo (igual que en el Worker, ver DELETE
// /api/articles/:id). Sin el nivel, esto coincide con puedeGestionarArticulo.
function puedeBorrarArticulo(a) {
  if (USER.rol === "admin") return true;
  if (articuloBloqueadoPorTerminado(a)) return false;
  return a.autor_id === USER.id || a.coautor_id === USER.id || PERMISOS_TEMPORALES_ARTICULO.has(a.id);
}
function puedeGestionarResultado(r) {
  // Los resultados son contenido compartido del equipo: el Worker
  // (puedeEditar) deja que cualquier redactor autenticado edite/borre el
  // resultado de cualquier otro, no solo el suyo (a diferencia de los
  // artículos). Por eso aquí no se restringe por autoría ni hace falta
  // mirar PERMISOS_TEMPORALES_RESULTADO: si se restringiera, al redactor
  // le saldría "Solicitar edición" y, al enviarla, el Worker respondería
  // "Ya puedes editar este elemento, no hace falta solicitarlo".
  return true;
}

// Lista completa (sin filtrar) de artículos tal y como la devolvió la
// API la última vez, y página actual del listado. Se guardan aparte de
// ARTICULOS_CACHE (que es un diccionario por id, usado para Editar/
// Compartir/Eliminar) porque aquí hace falta conservar el orden y poder
// re-filtrar/re-paginar sin volver a pedir nada al servidor.
let ARTICULOS_LISTA_COMPLETA = [];
let ARTICULOS_PAGINA_ACTUAL = 1;
const ARTICULOS_POR_PAGINA = 20;

// Pinta los controles «Anterior / números / Siguiente» dentro del
// contenedor indicado, y engancha el click de cada botón a onCambioPagina.
// Reutilizable entre cualquier listado paginado del panel (noticias,
// resultados...), para no repetir la misma maquetación en cada uno.
function pintarPaginacion(idContenedor, paginaActual, totalPaginas, onCambioPagina) {
  const cont = document.getElementById(idContenedor);
  if (!cont) return;
  if (totalPaginas <= 1) { cont.innerHTML = ""; return; }

  const botones = [];
  botones.push(`<button type="button" class="pagina-btn" data-pagina="${paginaActual - 1}" ${paginaActual === 1 ? "disabled" : ""}>‹ Anterior</button>`);

  // Con muchas páginas no se listan todas: solo la actual, un par a cada
  // lado, y siempre la primera/última, con "…" para el hueco.
  const paginas = new Set([1, totalPaginas, paginaActual, paginaActual - 1, paginaActual + 1]);
  let anterior = 0;
  for (let p = 1; p <= totalPaginas; p++) {
    if (!paginas.has(p)) continue;
    if (p - anterior > 1) botones.push(`<span class="pagina-puntos">…</span>`);
    botones.push(`<button type="button" class="pagina-btn${p === paginaActual ? " activa" : ""}" data-pagina="${p}">${p}</button>`);
    anterior = p;
  }

  botones.push(`<button type="button" class="pagina-btn" data-pagina="${paginaActual + 1}" ${paginaActual === totalPaginas ? "disabled" : ""}>Siguiente ›</button>`);
  cont.innerHTML = botones.join("");
  cont.querySelectorAll("[data-pagina]").forEach((btn) => {
    btn.addEventListener("click", () => onCambioPagina(parseInt(btn.dataset.pagina, 10)));
  });
}

// Quita tildes/diacríticos y pasa a minúsculas para comparar texto de
// forma más permisiva (reutiliza normalizarTextoBusquedaClub de clubs.js,
// que ya hace exactamente esto; con fallback por si este archivo se
// cargara alguna vez sin clubs.js). Sin esto, buscar "martinez" no
// encontraba una noticia titulada "Martínez" ni un partido con un
// "Martínez" en el nombre del equipo, porque .toLowerCase() por sí solo
// no quita los acentos.
function normalizarBusquedaPanel(texto) {
  if (typeof normalizarTextoBusquedaClub === "function") return normalizarTextoBusquedaClub(texto);
  return (texto || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function articuloCoincideBusqueda(a, textoBusqueda) {
  if (!textoBusqueda) return true;
  const firma = a.coautor_nombre ? `${a.autor_nombre || ""} ${a.coautor_nombre}` : (a.autor_nombre || "");
  const categoriasAdicionalesTexto = (a.categorias_adicionales || []).map(categoriaLabel).join(" ");
  // clubArticuloLegible (config.js) admite tanto club único en texto
  // plano como el array JSON de 2 clubes de una previa/crónica vinculada
  // a un resultado, así que el buscador encuentra la noticia buscando
  // cualquiera de los dos equipos.
  const clubTexto = typeof clubArticuloLegible === "function" ? clubArticuloLegible(a.club) : (a.club || "");
  const haystack = normalizarBusquedaPanel(`${a.titulo || ""} ${(a.categoria ? categoriaLabel(a.categoria) : "") || ""} ${categoriasAdicionalesTexto} ${clubTexto} ${firma}`);
  return haystack.includes(normalizarBusquedaPanel(textoBusqueda));
}

async function cargaListaArticulos() {
  const cos = document.getElementById("tablaArticulos");
  cos.innerHTML = "<tr><td colspan='5'>Cargando...</td></tr>";
  try {
    await cargarPermisosTemporalesVigentes();
    // Antes se pedían solo las últimas 200 noticias: con más de 200 en
    // total, cualquier noticia más antigua quedaba fuera del panel de
    // Redacción > Noticias (el buscador de esta lista solo filtra en
    // texto DENTRO de lo ya traído, así que ni siquiera aparecía
    // buscándola por título), aunque siguiera existiendo en la base de
    // datos. Se sube el límite para traer todo el histórico de golpe
    // (mismo criterio ya aplicado al listado de Resultados).
    const { articles = [] } = await apiFetch(`/api/articles?admin=1&limit=2000`);
    ARTICULOS_CACHE = {};
    articles.forEach((a) => { ARTICULOS_CACHE[a.id] = a; });
    ARTICULOS_LISTA_COMPLETA = articles;
    ARTICULOS_PAGINA_ACTUAL = 1;
    pintarListaArticulos();
  } catch (err) {
    cos.innerHTML = `<tr><td colspan="5">Error cargando: ${err.message}</td></tr>`;
  }
}

// Repinta la tabla de noticias a partir de ARTICULOS_LISTA_COMPLETA,
// aplicando el texto del buscador y recortando a la página actual. No
// vuelve a pedir nada a la API: se llama tanto al cargar como al
// escribir en el buscador o cambiar de página.
// Etiqueta roja "🔴 ÚLTIMA HORA — quedan Xh Ymin" en el listado del
// panel, junto al badge de estado normal (Publicada/Borrador/etc). Se
// recalcula el tiempo restante a partir de banner_urgente_hasta cada
// vez que se repinta la tabla, así que basta con volver a llamar a
// cargaListaArticulos() (o dejar que la próxima recarga del listado lo
// haga) para que el minutaje se vaya actualizando.
function badgeBannerUrgente(a) {
  if (!a.banner_urgente || !a.banner_urgente_hasta) return "";
  const restanteMs = new Date(a.banner_urgente_hasta).getTime() - Date.now();
  if (restanteMs <= 0) return "";
  const minutosTotales = Math.round(restanteMs / 60000);
  const horas = Math.floor(minutosTotales / 60);
  const minutos = minutosTotales % 60;
  const restanteLabel = horas > 0 ? `${horas}h ${minutos}min` : `${minutos}min`;
  return ` <span class="badge-estado" style="background:#d1132e;color:#fff;" title="Banner activo en toda la web">🔴 ÚLTIMA HORA — quedan ${restanteLabel}</span>`;
}

async function quitarBannerUrgente(a) {
  if (!a || !a.id) {
    EOF.toast("No se ha podido identificar la noticia. Recarga el listado e inténtalo de nuevo.", "error");
    return;
  }
  if (!confirm(`¿Quitar el banner de "Última hora" de "${a.titulo}"? Dejará de verse en la web al momento.`)) return;
  try {
    await apiFetch(`/api/articles/${a.id}/banner-urgente`, { method: "DELETE" });
    EOF.toast("Banner de última hora retirado.", "exito");
    await cargaListaArticulos();
  } catch (err) {
    EOF.toast(
      err.status === 404
        ? "Esta noticia ya no existe o el listado está desactualizado. Se va a recargar."
        : "Error: " + err.message,
      "error"
    );
    if (err.status === 404) await cargaListaArticulos();
  }
}

function pintarListaArticulos() {
  const cos = document.getElementById("tablaArticulos");
  const inputBuscador = document.getElementById("buscadorArticulos");
  const textoBusqueda = (inputBuscador?.value || "").trim().toLowerCase();
  const articulosFiltrados = ARTICULOS_LISTA_COMPLETA.filter(a => articuloCoincideBusqueda(a, textoBusqueda));

  const totalPaginas = Math.max(1, Math.ceil(articulosFiltrados.length / ARTICULOS_POR_PAGINA));
  if (ARTICULOS_PAGINA_ACTUAL > totalPaginas) ARTICULOS_PAGINA_ACTUAL = totalPaginas;
  const inicio = (ARTICULOS_PAGINA_ACTUAL - 1) * ARTICULOS_POR_PAGINA;
  const articles = articulosFiltrados.slice(inicio, inicio + ARTICULOS_POR_PAGINA);

  const contador = document.getElementById("contadorArticulos");
  if (contador) {
    contador.textContent = textoBusqueda
      ? `${articulosFiltrados.length} de ${ARTICULOS_LISTA_COMPLETA.length} noticias`
      : `${ARTICULOS_LISTA_COMPLETA.length} noticias`;
  }

  try {
    cos.innerHTML = articles.map(a => {
      const esMio = a.autor_id === USER.id || a.coautor_id === USER.id;
      const puedeGestionar = puedeGestionarArticulo(a);
      const bloqueadoPorTerminado = articuloBloqueadoPorTerminado(a);
      const firmaCompleta = a.coautor_nombre ? `${a.autor_nombre || "—"} y ${a.coautor_nombre}` : (a.autor_nombre || "—");
      const badgeAutoria = USER.rol === "admin"
        ? (a.coautor_nombre ? `<span class="badge-autoria otro" title="Firmada por dos autores">${escapeHtml(firmaCompleta)}</span>` : "")
        : `<span class="badge-autoria ${esMio ? "mio" : "otro"}">${esMio ? (a.coautor_nombre ? escapeHtml(firmaCompleta) : "Mía") : escapeHtml(firmaCompleta)}</span>`;
      // Un borrador "terminado" ya ha avisado por email a la redacción de
      // que está listo para publicar. Si un admin (o Nivel 4 revisando)
      // decide que en realidad todavía le falta trabajo, puede devolverlo
      // a "en proceso" con este botón, en vez de tener que abrirlo,
      // editarlo y guardarlo de nuevo solo para bajarle el estado.
      const puedeDevolverAEnProceso = !a.publicado && a.estado_borrador === "terminado"
        && (USER.rol === "admin" || nivelUsuarioConectado() >= 4);
      let botonesAccion;
      if (puedeGestionar) {
        botonesAccion = `<button class="editar" data-accion="editar" data-id="${a.id}">Editar</button>
           ${(a.publicado || a.programado_para) ? `<button class="editar" data-accion="compartir" data-id="${a.id}">Compartir</button>` : ""}
           ${puedeDevolverAEnProceso ? `<button class="editar" data-accion="devolver-en-proceso" data-id="${a.id}" title="Devuelve el borrador a &quot;en proceso&quot; para que el redactor lo siga trabajando">Devolver a borrador</button>` : ""}
           ${puedeBorrarArticulo(a) ? `<button class="eliminar" data-accion="eliminar" data-id="${a.id}">Eliminar</button>` : ""}`;
      } else if (bloqueadoPorTerminado && USER.rol !== "admin") {
        botonesAccion = `<span class="aviso-bloqueado" title="Terminada y en espera de que un administrador la publique">🔒 En espera de publicación</span>`;
      } else {
        botonesAccion = `<button class="solicitar" data-accion="solicitar" data-id="${a.id}">Solicitar edición</button>`;
      }
      return `
      <tr class="${!esMio && USER.rol !== "admin" ? "fila-de-otro" : ""}">
        <td data-label="Título">${escapeHtml(a.titulo)} ${badgeAutoria}</td>
        <td data-label="Categoría">${categoriaLabel(a.categoria)}${(a.categorias_adicionales && a.categorias_adicionales.length) ? ` <span class="badge-cats-adicionales" title="${escapeHtml(a.categorias_adicionales.map(categoriaLabel).join(', '))}">+${a.categorias_adicionales.length}</span>` : ""}</td>
        <td data-label="Fecha">${formatFecha(a.fecha_publicacion)}</td>
        <td data-label="Estado">${a.programado_para
            ? `<span class="badge-estado programado" title="Se publicará sola el ${formatFechaConHora(a.programado_para)}">Programada · ${formatFechaConHora(a.programado_para)}</span>`
            : `<span class="badge-estado ${a.publicado ? "publicado" : (a.estado_borrador === "terminado" ? "borrador-terminado" : "borrador-proceso")}">${a.publicado ? "Publicada" : (a.estado_borrador === "terminado" ? "En revisión" : "Borrador (en proceso)")}</span>`
          }${badgeBannerUrgente(a)}</td>
        <td class="acciones" data-label="">${botonesAccion}${(a.banner_urgente && puedeGestionar) ? `<button class="btn-quitar-uh" data-accion="quitar-banner-urgente" data-id="${a.id}" title="Quita el banner de última hora antes de que expire por sí solo">✕ Última hora</button>` : ""}</td>
      </tr>`;
    }).join("") || `<tr><td colspan='5'>${textoBusqueda ? "Ninguna noticia coincide con la búsqueda." : "Todavía no hay noticias."}</td></tr>`;
  } catch (err) {
    cos.innerHTML = `<tr><td colspan="5">Error mostrando el listado: ${err.message}</td></tr>`;
  }

  pintarPaginacion("paginacionArticulos", ARTICULOS_PAGINA_ACTUAL, totalPaginas, (pagina) => {
    ARTICULOS_PAGINA_ACTUAL = pagina;
    pintarListaArticulos();
  });
}

document.getElementById("buscadorArticulos")?.addEventListener("input", () => {
  ARTICULOS_PAGINA_ACTUAL = 1;
  pintarListaArticulos();
});

// Delegación de eventos para Editar/Compartir/Eliminar/Solicitar: al usar
// data-id en vez de JSON inline en onclick, cualquier comilla, salto de
// línea o carácter especial en el título/subtítulo deja de poder romper
// el HTML/JS.
document.getElementById("tablaArticulos")?.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-accion]");
  if (!btn) return;
  const a = ARTICULOS_CACHE[btn.dataset.id];
  if (!a) return;
  if (btn.dataset.accion === "editar") editarArticulo(a);
  else if (btn.dataset.accion === "compartir") abrirModalCompartir(a);
  else if (btn.dataset.accion === "eliminar") eliminarArticulo(a.id);
  else if (btn.dataset.accion === "solicitar") abrirModalSolicitarEdicion("articulo", a.id);
  else if (btn.dataset.accion === "devolver-en-proceso") devolverArticuloAEnProceso(a);
  else if (btn.dataset.accion === "quitar-banner-urgente") quitarBannerUrgente(a);
});

// Devuelve un borrador marcado como "terminado" a "en proceso", sin abrir
// el formulario completo: solo cambia el estado del borrador (el resto
// del contenido se manda tal cual está guardado) para que el redactor
// vea que todavía tiene que seguir trabajándolo y no quede a la espera
// de que un admin lo publique.
async function devolverArticuloAEnProceso(a) {
  if (!confirm(`¿Devolver "${a.titulo}" a borrador "en proceso"? El redactor podrá seguir editándolo antes de volver a marcarlo como terminado.`)) return;
  try {
    await apiFetch(`/api/articles/${a.id}`, {
      method: "PUT",
      body: JSON.stringify({
        titulo: a.titulo,
        subtitulo: a.subtitulo,
        tipo: a.tipo,
        categoria: a.categoria,
        club: a.club,
        autor_id: a.autor_id,
        coautor_id: a.coautor_id || null,
        imagen_url: a.imagen_url,
        imagenes: a.imagenes ? (typeof a.imagenes === "string" ? JSON.parse(a.imagenes) : a.imagenes) : [],
        resultado_id: a.resultado_id || null,
        contenido: a.contenido,
        destacado: !!a.destacado,
        publicado: false,
        estado_borrador: "en_proceso",
      }),
    });
    EOF.toast("Borrador devuelto a \"en proceso\".", "exito");
    await cargaListaArticulos();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

async function editarArticulo(a) {
  // "a" viene normalmente de ARTICULOS_CACHE, que se rellena con el listado
  // optimizado (/api/articles?admin=1): esa consulta, para no cargar el
  // HTML entero de las 4 traducciones en cada noticia del listado, NO trae
  // subtitulo_eu/ca/gl/en y sustituye contenido_eu/ca/gl/en por la cadena
  // "x" (ver GET /api/articles en el worker, articulosParaIdiomas). Usar
  // ese objeto recortado directamente para rellenar el formulario hacía
  // que al guardar se perdiera el subtítulo traducido (llegaba vacío) y el
  // contenido traducido se sobrescribiera literalmente con "x". Por eso
  // aquí se pide siempre el artículo completo (SELECT * en
  // GET /api/articles/:id) antes de pintar el formulario, y solo se cae
  // de vuelta al objeto recortado si esa petición fallara por lo que sea.
  try {
    const { article: articuloCompleto } = await apiFetch(`/api/articles/${a.id}`);
    if (articuloCompleto) {
      a = articuloCompleto;
      ARTICULOS_CACHE[a.id] = a;
    }
  } catch (err) {
    console.error("No se pudo cargar el artículo completo para editar, se usa la versión de la lista:", err);
  }
  document.querySelector('.tabs button[data-tab="noticias"]').click();
  document.querySelector('#panel-noticias .subtabs button[data-subtab="nueva"]').click();
  document.getElementById("articleId").value = a.id;
  document.getElementById("articleSlug").value = a.slug || "";
  document.getElementById("articlePublicadoOriginal").value = a.publicado ? "1" : "0";
  document.getElementById("articleEstadoBorradorOriginal").value = a.estado_borrador || "";
  // Se guarda también si la noticia estaba programada al abrir el
  // formulario (con "programado_para" pendiente, no publicada): al
  // programar, el backend limpia "estado_borrador" a null (ver worker),
  // así que si luego se quita la programación sin publicar hay que saber
  // que venía de una noticia ya terminada (en revisión), y no de un
  // borrador "en proceso" a medio escribir, para no preguntar de nuevo
  // "¿está terminada?" (ver submit del formulario más abajo).
  document.getElementById("articleProgramadoParaOriginal").value = (!a.publicado && a.programado_para) ? "1" : "";
  document.getElementById("titulo").value = a.titulo;
  document.getElementById("subtitulo").value = a.subtitulo || "";
  document.getElementById("tipo").value = a.tipo;
  document.getElementById("categoria").value = a.categoria;
  // Para previa/crónica, el club real vive en CLUB_AUTOMATICO_ACTUAL (se
  // recalcula justo debajo, al cargar el resultado vinculado con
  // cargarResultadosSelect -> fijarResultadoArticulo ->
  // actualizarClubAutomatico), así que aquí solo se puebla el <select>
  // normal con el primer club guardado por si se cambiara a un tipo sin
  // club automático; para el resto de tipos, "a.club" sigue siendo un
  // único nombre de texto plano como siempre.
  const clubesGuardados = typeof parsearClubArticulo === "function" ? parsearClubArticulo(a.club) : (a.club ? [a.club] : []);
  poblarClubs(a.categoria, clubesGuardados[0] || "");
  actualizarVisibilidadFichaTecnica();
  actualizarClubAutomatico();
  await cargarAutoresSelect(a.autor_id || USER.id, a.coautor_id || "");
  poblarCategoriaSegunAutor(a.autor_id || USER.id, a.categoria);
  // poblarCategoriaSegunAutor ya deja las opciones del picker acordes al
  // autor y a la categoría principal (ver arriba); aquí solo falta
  // marcar qué categorías adicionales tenía ya guardadas la noticia.
  if (categoriasAdicionalesPicker) {
    categoriasAdicionalesPicker.establecerSeleccion(a.categorias_adicionales || []);
  }
  let imagenesGuardadas = [];
  try {
    // "a.imagenes" puede llegar en dos formatos distintos según de dónde
    // venga "a": el listado optimizado (/api/articles?admin=1, ver
    // ARTICULOS_CACHE) lo trae tal cual está en la columna de la base de
    // datos, como texto JSON sin parsear; pero el artículo COMPLETO que se
    // acaba de pedir arriba (GET /api/articles/:id) ya llega con
    // "imagenes" convertido a array de objetos por el propio backend (ver
    // normalizarImagenes en worker/src/index.js). Antes aquí se llamaba
    // siempre a JSON.parse(a.imagenes) asumiendo que era texto: cuando "a"
    // era el artículo completo (el caso normal, ya que unas líneas más
    // arriba se sobrescribe "a" con él), JSON.parse recibía un array de
    // verdad, lo convertía primero a texto ("[object Object],[object
    // Object]") y luego fallaba al parsearlo -caía al catch de abajo y
    // "imagenesGuardadas" se quedaba vacía-, así que CUALQUIER foto que no
    // fuera la portada (rescatada aparte more abajo por el fallback de
    // a.imagen_url) desaparecía del formulario al reabrir la noticia para
    // editarla, aunque siguiera perfectamente guardada en el servidor.
    imagenesGuardadas = Array.isArray(a.imagenes) ? a.imagenes : (a.imagenes ? JSON.parse(a.imagenes) : []);
  } catch {
    imagenesGuardadas = [];
  }
  // Si por lo que sea no hay array de "imagenes" pero sí una "imagen_url"
  // suelta (noticias creadas antes de esta función), se muestra igualmente.
  if (imagenesGuardadas.length === 0 && a.imagen_url) imagenesGuardadas = [a.imagen_url];
  // Las fotos de collage se gestionan aparte (ver COLLAGES_ARTICULO):
  // se sacan de la lista normal de fotos antes de pintarla, para no
  // duplicarlas como filas sueltas.
  COLLAGES_ARTICULO = collagesDesdeImagenes(imagenesGuardadas);
  pintarListaCollages();
  const tweetsGuardados = imagenesGuardadas.filter((v) => v && typeof v === "object" && v.tipo === "tweet");
  resetTweets(tweetsGuardados);
  const imagenesSinCollage = imagenesGuardadas.filter((v) => !(v && typeof v === "object" && (v.tipo === "tweet" || (v.grupo && ["collage", "inicio", "galeria"].includes(v.posicion)))));
  resetImagenes(imagenesSinCollage, a.imagen_url || "");
  cargarResultadosSelect(a.resultado_id || "");
  contenidoEditor.innerHTML = a.contenido || "";
  actualizarContadorCaracteres();
  resetTraducciones(a);
  let fichaTecnicaGuardada = null;
  try {
    fichaTecnicaGuardada = a.ficha_tecnica
      ? (typeof a.ficha_tecnica === "string" ? JSON.parse(a.ficha_tecnica) : a.ficha_tecnica)
      : null;
  } catch {
    fichaTecnicaGuardada = null;
  }
  cargarFichaTecnicaFormulario(fichaTecnicaGuardada);
  document.getElementById("destacado").checked = !!a.destacado;
  document.getElementById("publicado").checked = !!a.publicado;
  if (checkBannerUrgente) {
    checkBannerUrgente.checked = !!a.banner_urgente;
    actualizarEstadoBannerUrgente(a);
  }
  if (checkProgramarNoticia) {
    // Una noticia ya publicada puede conservar en la base de datos un
    // "programado_para" residual (de cuando estaba programada, o incluso
    // un valor mal calculado por una versión antigua del backend antes
    // del ajuste de zona horaria de Madrid). Una vez publicada, ese campo
    // ya no tiene efecto real -- publicarArticulosProgramados() solo
    // actúa sobre noticias con publicado = 0 -- así que no debe mostrarse
    // ni marcarse el checkbox, o el formulario sugeriría una hora de
    // publicación falsa para una noticia que ya está publicada.
    const programadaPendiente = !a.publicado && !!a.programado_para;
    checkProgramarNoticia.checked = programadaPendiente;
    if (programadaPendiente) inputProgramadoPara.value = isoAProgramadoParaInput(a.programado_para);
    else inputProgramadoPara.value = "";
  }
  sincronizarDestacadoConPublicado();
  sincronizarProgramarConPublicado();
  sincronizarCampoFechaProgramada();
  actualizarTextoBotonGuardar();
  document.getElementById("btnCancelar").style.display = "inline-block";
  window.scrollTo(0, 0);
  SNAPSHOT_ARTICULO_ORIGINAL = snapshotFormularioArticulo();
  actualizarBloqueAlineacionesArticulo(a.id);
  previewAbierta = false; // se deja de reenviar en vivo a la pestaña de preview: era de otra noticia
}

async function eliminarArticulo(id) {
  if (!(await EOF.confirmar("¿Seguro que quieres eliminar esta noticia?", { peligroso: true, textoConfirmar: "Eliminar" }))) return;
  try {
    await apiFetch(`/api/articles/${id}`, { method: "DELETE" });
    cargaListaArticulos();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

// ---------- RESULTADOS: el campo "Grupo" solo tiene sentido en Primera y
// Segunda Federación (varias ligas/grupos regionales); en el resto de
// competiciones se bloquea. La "Jornada" no aplica a los amistosos.
const GRUPOS_POR_COMPETICION = {
  primera_federacion: ["Grupo 1", "Grupo 2"],
  segunda_federacion: ["Grupo 1", "Grupo 2", "Grupo 3", "Grupo 4", "Grupo 5"],
};

function actualizarCampoGrupo(valorPrevio) {
  const grupos = GRUPOS_POR_COMPETICION[rCompeticion.value] || [];
  rGrupo.innerHTML = `<option value="">— Sin grupo —</option>` +
    grupos.map(g => `<option value="${g}">${g}</option>`).join("");
  const tieneGrupos = grupos.length > 0;
  rGrupo.disabled = !tieneGrupos;
  if (tieneGrupos && valorPrevio && grupos.includes(valorPrevio)) rGrupo.value = valorPrevio;
  rGrupoLabel.textContent = tieneGrupos ? "Grupo *" : "Grupo (no aplica en esta competición)";
}

function actualizarCampoJornada() {
  const esAmistoso = rCompeticion.value === "amistoso";
  rJornada.disabled = esAmistoso;
  rJornada.required = !esAmistoso;
  if (esAmistoso) rJornada.value = "";
  rJornadaLabel.textContent = esAmistoso ? "Jornada (no aplica en amistosos)" : "Jornada *";
}

// El enlace a Flashscore solo tiene sentido para partidos ya finalizados
// de estas 3 competiciones (Primera Federación, Segunda Federación y
// LaLiga Hypermotion, que es la LaLiga2 actual); en el resto de casos el
// campo se oculta y no se envía al guardar.

function actualizarCampoFlashscoreYUbicacion() {
  const aplicaFlashscore = COMPETICIONES_CON_FLASHSCORE.includes(rCompeticion.value) && rEstado.value === "finalizado";
  rFlashscoreWrap.style.display = aplicaFlashscore ? "" : "none";
  if (!aplicaFlashscore) rFlashscore.value = "";
  // La ubicación es útil sobre todo mientras el partido está "por jugar"
  // (es lo que se le muestra a quien lee para que sepa dónde ir a verlo),
  // pero se deja siempre visible por si se quiere anotar igualmente en
  // partidos ya en juego o finalizados.
  rPorJugarExtraWrap.style.display = "";
}

rCompeticion.addEventListener("change", () => {
  actualizarCampoGrupo();
  actualizarCampoJornada();
  poblarSelectsEquipo();
  actualizarCampoFlashscoreYUbicacion();
  actualizarPreviewResultado();
});
// Al elegir (o quitar) el grupo dentro de una competición con grupos
// (Primera/Segunda Federación), se recalcula la lista de equipos para
// acotarla a ese grupo (ver poblarSelectsEquipo). Si el equipo local o
// visitante ya elegido no pertenece al nuevo grupo, se pierde la
// selección (igual que ya pasaba al cambiar de competición): es lo
// esperado, ya que ese equipo no encaja en el grupo recién elegido.
rGrupo.addEventListener("change", () => {
  poblarSelectsEquipo(rLocalPicker.obtenerValor(), rVisitantePicker.obtenerValor());
  actualizarCampoFlashscoreYUbicacion();
  actualizarPreviewResultado();
});
actualizarCampoGrupo();
actualizarCampoJornada();

// ---------- RESULTADOS: selección de equipo con escudo / equipo "otro" ----------
// Valor especial usado en los pickers de equipo para la opción "Otro
// equipo (no está en la lista)".

const rLocalOtroNombre = document.getElementById("r_local_otro_nombre");
const rVisitanteOtroNombre = document.getElementById("r_visitante_otro_nombre");
const rLocalOtroEscudo = document.getElementById("r_local_otro_escudo");
const rVisitanteOtroEscudo = document.getElementById("r_visitante_otro_escudo");
const rLocalOtroPreview = document.getElementById("r_local_otro_preview");
const rVisitanteOtroPreview = document.getElementById("r_visitante_otro_preview");

// URL ya subida a Cloudinary del escudo del equipo "otro" (local y
// visitante por separado). Se rellena al elegir un archivo y se manda
// en el body del POST/PUT junto con el resto de campos del resultado.
let escudoLocalOtroUrl = null;
let escudoVisitanteOtroUrl = null;

// ---------- Team picker: combo con buscador + escudo ----------
// Sustituye al <select> nativo por un desplegable propio que muestra el
// escudo de cada equipo (tirando de getEscudoUrl/clubs.js, que ya
// resuelve el escudo del primer equipo para los filiales) y permite
// buscar por nombre. Se monta una vez por cada uno de los dos campos
// (local/visitante) sobre el contenedor <div class="team-picker">; cada
// instancia se puede repoblar (poblar()) cuando cambia la competición
// sin tener que reconstruir el DOM entero.
// getEscudoUrl() (definida en clubs.js) devuelve rutas relativas del
// tipo "img/escudos/...", pensadas para páginas que viven en la raíz de
// public/. El panel vive en public/admin/, así que aquí hace falta
// anteponer "../" para que apunten al mismo sitio.
function escudoUrlAdmin(nombreEquipo, escudoUrlPersonalizado) {
  const url = getEscudoUrl(nombreEquipo, escudoUrlPersonalizado);
  return url.startsWith("img/") ? "../" + url : url;
}

function crearTeamPicker(contenedor, { onChange } = {}) {
  contenedor.innerHTML = `
    <button type="button" class="team-picker-btn">
      <span class="escudo-mini vacio"></span>
      <span class="team-picker-texto placeholder">— Selecciona un equipo —</span>
      <span class="team-picker-caret"></span>
    </button>
    <div class="team-picker-panel">
      <input type="text" class="team-picker-buscador" placeholder="Buscar equipo...">
      <div class="team-picker-lista"></div>
    </div>`;

  const btn = contenedor.querySelector(".team-picker-btn");
  const btnTexto = contenedor.querySelector(".team-picker-texto");
  const buscador = contenedor.querySelector(".team-picker-buscador");
  const lista = contenedor.querySelector(".team-picker-lista");

  let clubes = [];
  let valor = "";
  let resaltada = -1;
  // "Otro equipo" solo tiene sentido en amistosos: en las ligas fijas la
  // lista de clubes ya es la oficial de esa competición, así que no se
  // debe poder colar un equipo fuera de ella. poblarSelectsEquipo() fija
  // este flag cada vez que cambia la competición seleccionada.
  let permitirOtro = true;

  function nombreMostrado(v) {
    return v === VALOR_OTRO_EQUIPO ? "Otro equipo (no está en la lista)" : v;
  }

  function actualizarBoton() {
    if (valor === VALOR_OTRO_EQUIPO) {
      btn.querySelector(".escudo-mini")?.remove();
      btn.insertAdjacentHTML("afterbegin", `<span class="escudo-mini vacio">＋</span>`);
      btnTexto.textContent = "Otro equipo (no está en la lista)";
      btnTexto.classList.remove("placeholder");
    } else if (valor) {
      btn.querySelector(".escudo-mini")?.remove();
      btn.insertAdjacentHTML("afterbegin", `<img class="escudo-mini" src="${escudoUrlAdmin(valor)}" alt="" loading="lazy" onerror="this.src='${ESCUDO_GENERICO_ADMIN}'">`);
      btnTexto.textContent = valor;
      btnTexto.classList.remove("placeholder");
    } else {
      btn.querySelector(".escudo-mini")?.remove();
      btn.insertAdjacentHTML("afterbegin", `<span class="escudo-mini vacio"></span>`);
      btnTexto.textContent = "— Selecciona un equipo —";
      btnTexto.classList.add("placeholder");
    }
  }

  function cerrar() {
    contenedor.classList.remove("abierto");
    document.removeEventListener("click", cerrarSiFuera, true);
  }
  function cerrarSiFuera(e) {
    if (!contenedor.contains(e.target)) cerrar();
  }
  function abrir() {
    contenedor.classList.add("abierto");
    buscador.value = "";
    render("");
    buscador.focus();
    document.addEventListener("click", cerrarSiFuera, true);
  }

  function render(filtro) {
    const filtroNorm = normalizarBusquedaPanel(filtro);
    const filtrados = clubes.filter(c => !filtroNorm || normalizarBusquedaPanel(c).includes(filtroNorm));
    resaltada = -1;
    if (!filtrados.length && filtroNorm) {
      lista.innerHTML = `<div class="team-picker-vacio">Ningún equipo coincide con "${escapeHtml(filtro)}"</div>`;
    } else {
      lista.innerHTML = filtrados.map(c => `
        <div class="team-picker-opcion${c === valor ? " seleccionada" : ""}" data-valor="${escapeHtml(c)}">
          <img src="${escudoUrlAdmin(c)}" alt="" loading="lazy" onerror="this.src='${ESCUDO_GENERICO_ADMIN}'">
          <span>${escapeHtml(c)}</span>
        </div>`).join("");
    }
    // La opción "Otro equipo" está visible al final (filtro o no), pero
    // solo si la competición actual la permite (amistosos).
    if (permitirOtro && (!filtroNorm || "otro equipo".includes(filtroNorm))) {
      lista.innerHTML += `
        <div class="team-picker-opcion otro-equipo${valor === VALOR_OTRO_EQUIPO ? " seleccionada" : ""}" data-valor="${VALOR_OTRO_EQUIPO}">
          <span class="oe-icono">＋</span>
          <span>Otro equipo (no está en la lista)</span>
        </div>`;
    }
  }

  function seleccionar(v) {
    valor = v;
    actualizarBoton();
    cerrar();
    if (onChange) onChange(valor);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    contenedor.classList.contains("abierto") ? cerrar() : abrir();
  });
  buscador.addEventListener("input", () => render(buscador.value));
  buscador.addEventListener("keydown", (e) => {
    const opciones = [...lista.querySelectorAll(".team-picker-opcion")];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      resaltada = Math.min(resaltada + 1, opciones.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      resaltada = Math.max(resaltada - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const el = opciones[resaltada] || opciones[0];
      if (el) seleccionar(el.dataset.valor);
      return;
    } else if (e.key === "Escape") {
      cerrar();
      return;
    } else {
      return;
    }
    opciones.forEach((el, i) => el.classList.toggle("resaltada", i === resaltada));
    opciones[resaltada]?.scrollIntoView({ block: "nearest" });
  });
  lista.addEventListener("click", (e) => {
    const opt = e.target.closest(".team-picker-opcion");
    if (opt) seleccionar(opt.dataset.valor);
  });

  return {
    // Repuebla la lista de clubes (p.ej. al cambiar de competición) y
    // fija el valor previo si sigue siendo válido; si no, lo limpia.
    // permiteOtro controla si la opción "Otro equipo (no está en la
    // lista)" se ofrece para esta competición (solo amistosos).
    poblar(nuevosClubes, valorPrevio, permiteOtro = true) {
      clubes = nuevosClubes;
      permitirOtro = permiteOtro;
      if (valorPrevio && clubes.includes(valorPrevio)) {
        valor = valorPrevio;
      } else if (valorPrevio && permitirOtro) {
        valor = VALOR_OTRO_EQUIPO; // nombre guardado que no está en la lista actual
      } else {
        // O no había valor previo, o lo había pero no está en la lista
        // de esta competición y "Otro equipo" no está permitido aquí
        // (liga fija): se limpia en vez de dejar un valor inválido
        // seleccionado.
        valor = "";
      }
      actualizarBoton();
    },
    obtenerValor: () => valor,
  };
}


// Autorellena "Ubicación del partido" con el estadio habitual del
// equipo local elegido (base de datos ESTADIO_POR_CLUB en clubs.js).
// Siempre sobrescribe lo que hubiera en el campo, incluso si se había
// escrito algo a mano: cada cambio de equipo local fija de nuevo la
// ubicación al estadio de ese equipo (o la vacía si no hay estadio
// conocido, p.ej. "Otro equipo" o un club sin datos en la base).
function autorellenarUbicacionPorLocal() {
  const nombreLocal = rLocalPicker.obtenerValor();
  if (!nombreLocal || nombreLocal === VALOR_OTRO_EQUIPO) {
    rUbicacion.value = "";
    return;
  }
  rUbicacion.value = getEstadioClub(nombreLocal);
}

function poblarSelectsEquipo(valorLocalPrevio, valorVisitantePrevio) {
  // En un amistoso el partido no pertenece a ninguna competición
  // concreta, así que se ofrecen los clubes de todas las categorías
  // (los 69) en vez de limitar a los de una sola liga.
  const esAmistoso = rCompeticion.value === "amistoso";
  let clubes = esAmistoso
    ? listaTodosLosClubesFederativos().sort((a, b) => a.localeCompare(b))
    : getClubsForCategoria(rCompeticion.value);
  // Si la competición tiene grupos (Primera/Segunda Federación) y ya hay
  // uno elegido en "Grupo", se acota la lista de equipos a los de ese
  // grupo (usando GRUPO_POR_CLUB, clubs.js): así, por ejemplo, al crear
  // un resultado de Segunda Federación · Grupo 3 solo aparecen los
  // equipos de ese grupo, en vez de los 90 de toda la competición. Sin
  // grupo elegido ("— Sin grupo —") se mantiene la lista completa de la
  // competición, igual que antes.
  if (!esAmistoso && rGrupo.value && !rGrupo.disabled) {
    clubes = clubes.filter(c => getGrupoClub(c) === rGrupo.value);
  }
  // "Otro equipo (no está en la lista)" solo se ofrece en amistosos: en
  // las ligas fijas la lista de clubes es la oficial de esa competición
  // y no debe poder saltarse.
  rLocalPicker.poblar(clubes, valorLocalPrevio, esAmistoso);
  rVisitantePicker.poblar(clubes, valorVisitantePrevio, esAmistoso);
  actualizarVisibilidadOtro(rLocalPicker, rLocalOtroWrap);
  actualizarVisibilidadOtro(rVisitantePicker, rVisitanteOtroWrap);
}

function actualizarVisibilidadOtro(picker, wrap) {
  wrap.style.display = picker.obtenerValor() === VALOR_OTRO_EQUIPO ? "flex" : "none";
}

// ---------- Escudos personalizados: recorte ajustado + fondo transparente ----------
// Antes de subir el escudo de un club "otro" (no está en el listado) se
// comprueban dos cosas y, si falta alguna, se arregla aquí mismo en el
// navegador con un <canvas> antes de mandarlo a Cloudinary:
//   1. Que la imagen no tenga márgenes vacíos: se recorta al bounding box
//      real del escudo y se reescala para ocupar el lienzo entero.
//   2. Que el fondo sea transparente: si se detecta un color de fondo
//      sólido (el que domina el borde de la imagen), se hace transparente.
// Así el escudo llega a Cloudinary ya limpio, sin depender de que quien
// suba la imagen se haya acordado de recortarla o quitarle el fondo.

// Distancia entre dos colores RGB (0-255 cada canal). Se usa tanto para
// decidir si un píxel del borde "pertenece" al fondo detectado como para
// decidir, al quitar el fondo, qué píxeles volver transparentes.
function distanciaColor(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// Analiza el borde exterior (contorno de N píxeles de grosor) de la
// imagen y devuelve el color dominante de fondo si al menos el 70% de
// esos píxeles son de un color muy parecido entre sí; si el borde es
// heterogéneo (ya es transparente, o hay dibujo pegado al borde) o ya
// hay transparencia real, devuelve null (no hay fondo sólido que quitar).
function detectarColorFondo(imageData) {
  const { data, width, height } = imageData;
  const grosor = Math.max(2, Math.round(Math.min(width, height) * 0.03));
  const muestras = [];
  const push = (x, y) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 10) return; // ya transparente: no cuenta como "color de fondo"
    muestras.push([data[i], data[i + 1], data[i + 2]]);
  };
  for (let x = 0; x < width; x++) {
    for (let g = 0; g < grosor; g++) { push(x, g); push(x, height - 1 - g); }
  }
  for (let y = 0; y < height; y++) {
    for (let g = 0; g < grosor; g++) { push(g, y); push(width - 1 - g, y); }
  }
  if (muestras.length < 10) return null; // borde casi todo ya transparente

  // Color de referencia: la esquina superior izquierda (el punto más
  // típico de fondo en escudos con forma no rectangular).
  const [r0, g0, b0] = muestras[0];
  let coincidencias = 0;
  let sr = 0, sg = 0, sb = 0;
  for (const [r, g, b] of muestras) {
    if (distanciaColor(r, g, b, r0, g0, b0) < 30) {
      coincidencias++;
      sr += r; sg += g; sb += b;
    }
  }
  if (coincidencias / muestras.length < 0.7) return null;
  return { r: Math.round(sr / coincidencias), g: Math.round(sg / coincidencias), b: Math.round(sb / coincidencias) };
}

// Vuelve transparentes los píxeles de fondo, pero SOLO los que están
// "conectados" con el exterior del escudo (flood fill desde el borde del
// lienzo). Antes se comparaba cada píxel de la imagen contra el color de
// fondo sin mirar su posición, así que cualquier zona interior del
// escudo del mismo color (un blanco de un detalle, un círculo central,
// letras claras, etc.) también se volvía transparente, agujereando el
// dibujo. Al limitar el borrado a la región contigua al borde evitamos
// tocar el interior del escudo aunque comparta color con el fondo.
function quitarFondo(imageData, fondo) {
  const { data, width, height } = imageData;
  const UMBRAL = 40;
  const SUAVIZADO = 25;

  // visitado: -1 sin explorar, 0 no es fondo, 1 es fondo (a transparentar)
  const visitado = new Int8Array(width * height).fill(-1);
  const pila = [];

  const esFondo = (idx) => {
    const i = idx * 4;
    return distanciaColor(data[i], data[i + 1], data[i + 2], fondo.r, fondo.g, fondo.b) < UMBRAL;
  };

  // Semillas: todo el contorno del lienzo que sea del color de fondo.
  for (let x = 0; x < width; x++) {
    pila.push(x); // fila 0
    pila.push((height - 1) * width + x); // última fila
  }
  for (let y = 0; y < height; y++) {
    pila.push(y * width); // columna 0
    pila.push(y * width + (width - 1)); // última columna
  }

  while (pila.length) {
    const idx = pila.pop();
    if (visitado[idx] !== -1) continue;
    if (!esFondo(idx)) { visitado[idx] = 0; continue; }
    visitado[idx] = 1;
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x > 0) { const n = idx - 1; if (visitado[n] === -1) pila.push(n); }
    if (x < width - 1) { const n = idx + 1; if (visitado[n] === -1) pila.push(n); }
    if (y > 0) { const n = idx - width; if (visitado[n] === -1) pila.push(n); }
    if (y < height - 1) { const n = idx + width; if (visitado[n] === -1) pila.push(n); }
  }

  // Segunda pasada: además de los píxeles ya marcados como fondo (1),
  // suaviza el halo de antialiasing alrededor de esa región (píxeles no
  // marcados como fondo puro pero vecinos de uno que sí lo es y de color
  // parecido, dentro del margen de SUAVIZADO), igual que antes pero
  // restringido a los vecinos de la región de fondo detectada.
  for (let idx = 0; idx < visitado.length; idx++) {
    const i = idx * 4;
    if (visitado[idx] === 1) {
      data[i + 3] = 0;
      continue;
    }
    // ¿Tiene algún vecino que sea fondo puro? Si no, no se toca (evita
    // colarse hacia el interior del escudo).
    const x = idx % width;
    const y = (idx / width) | 0;
    let vecinoFondo = false;
    if (x > 0 && visitado[idx - 1] === 1) vecinoFondo = true;
    else if (x < width - 1 && visitado[idx + 1] === 1) vecinoFondo = true;
    else if (y > 0 && visitado[idx - width] === 1) vecinoFondo = true;
    else if (y < height - 1 && visitado[idx + width] === 1) vecinoFondo = true;
    if (!vecinoFondo) continue;

    const d = distanciaColor(data[i], data[i + 1], data[i + 2], fondo.r, fondo.g, fondo.b);
    if (d < UMBRAL + SUAVIZADO) {
      const factor = (d - UMBRAL) / SUAVIZADO;
      data[i + 3] = Math.round(data[i + 3] * Math.max(0, Math.min(1, factor)));
    }
  }
  return imageData;
}

// Calcula el bounding box de los píxeles "con contenido" (alpha por
// encima de un mínimo) y devuelve null si no encuentra ninguno (imagen
// vacía) o si el bounding box ya ocupa prácticamente todo el lienzo (no
// merece la pena recortar).
function calcularBoundingBox(imageData) {
  const { data, width, height } = imageData;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

// Punto de entrada: recibe un File de imagen y devuelve
// { file, seRecorto, seQuitoFondo } — el archivo ya recortado al
// contenido real y con el fondo transparente si hacía falta, más dos
// banderas que dicen qué se ha corregido (para poder avisar en el
// preview). Si ambas cosas ya estaban bien, devuelve el archivo intacto
// (no se reprocesa una imagen que ya cumple, para no perder calidad de más).
async function limpiarEscudo(file) {
  const bitmap = await createImageBitmap(file);
  const MARGEN_SOBRA = 0.03; // el bbox ya ocupa >=97% del lienzo: no merece recortar

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const fondo = detectarColorFondo(imageData);
  const seQuitoFondo = !!fondo;
  if (fondo) imageData = quitarFondo(imageData, fondo);

  const bbox = calcularBoundingBox(imageData);
  if (!bbox) return { file, seRecorto: false, seQuitoFondo: false }; // no se detectó contenido; no tocar el archivo original

  const anchoContenido = bbox.maxX - bbox.minX + 1;
  const altoContenido = bbox.maxY - bbox.minY + 1;
  const yaAjustada =
    bbox.minX <= canvas.width * MARGEN_SOBRA &&
    bbox.minY <= canvas.height * MARGEN_SOBRA &&
    canvas.width - bbox.maxX - 1 <= canvas.width * MARGEN_SOBRA &&
    canvas.height - bbox.maxY - 1 <= canvas.height * MARGEN_SOBRA;
  const seRecorto = !yaAjustada;

  if (!seQuitoFondo && !seRecorto) return { file, seRecorto: false, seQuitoFondo: false }; // las dos cosas ya estaban bien

  // Lienzo final: el tamaño del contenido recortado (si ya estaba
  // ajustado, coincide con el original salvo por el fondo quitado).
  const final = document.createElement("canvas");
  final.width = anchoContenido;
  final.height = altoContenido;
  const ctxFinal = final.getContext("2d");
  ctx.putImageData(imageData, 0, 0); // vuelca a "canvas" el resultado de quitar el fondo
  ctxFinal.drawImage(canvas, bbox.minX, bbox.minY, anchoContenido, altoContenido, 0, 0, anchoContenido, altoContenido);

  const blob = await new Promise((resolve) => final.toBlob(resolve, "image/png"));
  const archivoLimpio = new File([blob], (file.name || "escudo").replace(/\.[^.]+$/, "") + ".png", { type: "image/png" });
  return { file: archivoLimpio, seRecorto, seQuitoFondo };
}

// Mensaje corto que resume qué se ha corregido automáticamente en el
// escudo, para mostrarlo junto al preview. Devuelve null si no hizo
// falta corregir nada (la imagen ya venía bien).
function mensajeCorreccionEscudo(seRecorto, seQuitoFondo) {
  if (seRecorto && seQuitoFondo) return "Ajustado el recorte y eliminado el fondo automáticamente";
  if (seRecorto) return "Ajustado el recorte automáticamente (había espacio vacío alrededor)";
  if (seQuitoFondo) return "Fondo eliminado automáticamente";
  return null;
}

// Sube el escudo elegido en cuanto se selecciona el archivo (no se espera
// a guardar el resultado), igual que el resto de subidas sueltas del
// panel. Antes de subirlo se comprueba que esté bien recortado (sin
// márgenes vacíos) y sin fondo; si falta algo, se arregla aquí mismo y se
// avisa en el preview de qué se ha corregido. Mientras sube se muestra
// un aviso; si falla, se explica el error y se deja reintentar sin
// perder el resto del formulario.
async function manejarSubidaEscudoOtro(file, preview, guardarUrl) {
  if (!file) return;
  preview.className = "preview-escudo-otro subiendo";
  preview.textContent = "Subiendo escudo...";
  try {
    const { file: archivoLimpio, seRecorto, seQuitoFondo } = await limpiarEscudo(file);
    const url = await subirImagenSuelta(archivoLimpio);
    guardarUrl(url);
    preview.className = "preview-escudo-otro";
    const aviso = mensajeCorreccionEscudo(seRecorto, seQuitoFondo);
    preview.innerHTML = `<img src="${url}" alt="" loading="lazy"> Escudo subido correctamente`
      + (aviso ? `<span class="preview-escudo-aviso">${aviso}</span>` : "");
  } catch (err) {
    guardarUrl(null);
    preview.className = "preview-escudo-otro error";
    preview.textContent = "Error al subir el escudo: " + err.message;
  }
}

rLocalOtroEscudo.addEventListener("change", () => {
  manejarSubidaEscudoOtro(rLocalOtroEscudo.files[0], rLocalOtroPreview, (url) => { escudoLocalOtroUrl = url; });
});
rVisitanteOtroEscudo.addEventListener("change", () => {
  manejarSubidaEscudoOtro(rVisitanteOtroEscudo.files[0], rVisitanteOtroPreview, (url) => { escudoVisitanteOtroUrl = url; });
});

// Devuelve { nombre, escudo_url } listos para mandar al backend a partir
// del estado actual del picker + (si aplica) el bloque "otro equipo".
function leerEquipoDelFormulario(picker, nombreOtroInput, escudoOtroUrl) {
  if (picker.obtenerValor() === VALOR_OTRO_EQUIPO) {
    return { nombre: nombreOtroInput.value.trim(), escudo_url: escudoOtroUrl };
  }
  return { nombre: picker.obtenerValor(), escudo_url: null };
}

// Competiciones que tienen su propia lista de clubes en clubs.js (y por
// tanto tiene sentido guardarles ahí un club "personalizado" nuevo). Un
// amistoso no pertenece a ninguna de ellas, así que no aparece aquí.
const CATEGORIAS_CON_LISTA_CLUBES = ["hypermotion", "primera_federacion", "segunda_federacion"];

// Si el equipo se ha introducido mediante "Otro equipo (no está en la
// lista)", lo guarda en el servidor (tabla custom_clubs) para que a
// partir de ahora salga ya en el desplegable normal de esa competición,
// con el escudo que se haya subido (si se ha subido alguno). No hace
// nada si el equipo venía ya del desplegable (no es "otro equipo") o si
// no se ha escrito ningún nombre.
async function guardarClubPersonalizadoSiAplica(picker, equipo, categoria) {
  if (picker.obtenerValor() !== VALOR_OTRO_EQUIPO || !equipo.nombre) return;
  try {
    await apiFetch(`/api/custom-clubs`, {
      method: "POST",
      body: JSON.stringify({ nombre: equipo.nombre, categoria, escudo_url: equipo.escudo_url || null }),
    });
    // Refresca la lista en memoria para que, sin recargar la página, el
    // equipo recién añadido ya aparezca en los desplegables (incluido el
    // que se acaba de usar, que pasará a mostrarse como "seleccionado de
    // la lista" en vez de como "otro equipo" la próxima vez que se abra).
    await cargarCustomClubs();
  } catch (err) {
    // No se interrumpe el guardado del resultado/noticia por esto: el
    // club simplemente no quedará memorizado para la próxima vez.
    EOF.toast(`El resultado se ha guardado, pero no se ha podido añadir "${equipo.nombre}" a la lista de equipos: ${err.message}`, "error");
  }
}

function resetearBloqueOtroEquipo() {
  rLocalOtroNombre.value = "";
  rVisitanteOtroNombre.value = "";
  rLocalOtroEscudo.value = "";
  rVisitanteOtroEscudo.value = "";
  rLocalOtroPreview.innerHTML = "";
  rLocalOtroPreview.className = "preview-escudo-otro";
  rVisitanteOtroPreview.innerHTML = "";
  rVisitanteOtroPreview.className = "preview-escudo-otro";
  escudoLocalOtroUrl = null;
  escudoVisitanteOtroUrl = null;
}

poblarSelectsEquipo();


// Mientras el partido está "Por jugar" todavía no hay marcador posible,
// así que los campos de goles se bloquean (y se vacían) para no dejar
// guardar un resultado incoherente con el estado. Se reactivan en cuanto
// se pasa a "En juego" o "Finalizado".
const rGolesLocal = document.getElementById("r_goles_local");
const rGolesVisitante = document.getElementById("r_goles_visitante");
function actualizarBloqueoGoles() {
  const porJugar = rEstado.value === "programado";
  [rGolesLocal, rGolesVisitante].forEach((input) => {
    input.disabled = porJugar;
    if (porJugar) input.value = "";
    input.placeholder = porJugar ? "Por jugar" : "";
  });
}
function actualizarCampoRetrasado() {
  document.getElementById("r_retrasado_wrap").style.display = rEstado.value === "retrasado" ? "block" : "none";
}
rEstado.addEventListener("change", () => {
  actualizarBloqueoGoles();
  actualizarCampoFlashscoreYUbicacion();
  actualizarCampoRetrasado();
  actualizarPreviewResultado();
});

// Mantiene la tarjeta de marcador y la cabecera de competición
// sincronizadas con el resto de campos que también pueden cambiarla:
// jornada, goles y nombre del equipo "otro".
rJornada.addEventListener("input", actualizarPreviewResultado);
rGolesLocal.addEventListener("input", actualizarPreviewResultado);
rGolesVisitante.addEventListener("input", actualizarPreviewResultado);
rLocalOtroNombre.addEventListener("input", actualizarPreviewResultado);
rVisitanteOtroNombre.addEventListener("input", actualizarPreviewResultado);
actualizarPreviewResultado();
actualizarBloqueoGoles();
actualizarCampoFlashscoreYUbicacion();
actualizarCampoRetrasado();

// ---------- AUTOGUARDADO del formulario "Nuevo resultado" ----------
// A diferencia del borrador de noticias (que solo se guarda en caso de
// cierre de sesión por inactividad), este autoguardado del formulario de
// resultados es continuo: guarda en este navegador (localStorage) cada
// pocos segundos mientras se está rellenando el formulario, y también
// justo antes de salir de la página (recarga, cierre de pestaña,
// navegar a otra URL), para no perder el partido a medio meter si algo
// interrumpe. Solo se guarda si hay contenido real (no vacío); si el
// formulario está vacío, no se guarda nada y no se muestra ningún aviso
// al volver. No se aplica cuando se está EDITANDO un resultado ya
// existente (resultadoId con valor): ese caso ya vive en el servidor, no
// tiene sentido "recuperar" nada.
const CLAVE_AUTOGUARDADO_RESULTADO = "eof_autoguardado_resultado";

// Solo se considera que hay algo que guardar si al menos uno de los
// campos que identifican el partido tiene contenido: equipo local o
// visitante (ya sea de la lista o "Otro equipo"), o la jornada. Un
// formulario recién abierto con únicamente los valores por defecto de
// los desplegables (competición/estado) no cuenta como "trabajo real".
function hayTrabajoRealEnFormularioResultado() {
  const nombreLocal = rLocalPicker.obtenerValor() === VALOR_OTRO_EQUIPO
    ? rLocalOtroNombre.value.trim() : (rLocalPicker.obtenerValor() || "");
  const nombreVisitante = rVisitantePicker.obtenerValor() === VALOR_OTRO_EQUIPO
    ? rVisitanteOtroNombre.value.trim() : (rVisitantePicker.obtenerValor() || "");
  const jornada = document.getElementById("r_jornada").value.trim();
  return Boolean(nombreLocal || nombreVisitante || jornada);
}

function guardarAutoguardadoResultado() {
  try {
    // Si se está editando un resultado ya existente, no autoguardamos:
    // los cambios en modo edición ya se confirman con el propio botón
    // "Guardar resultado" de toda la vida, y "recuperar" aquí solo
    // confundiría (podría pisar ediciones ya guardadas en el servidor).
    if (document.getElementById("resultadoId").value) {
      localStorage.removeItem(CLAVE_AUTOGUARDADO_RESULTADO);
      return;
    }
    if (!hayTrabajoRealEnFormularioResultado()) {
      localStorage.removeItem(CLAVE_AUTOGUARDADO_RESULTADO);
      return;
    }
    // Se guarda el NOMBRE real del equipo (no el valor interno del
    // picker), igual que hace editarResultado: al recuperar, se le pasa
    // a poblarSelectsEquipo(nombreLocal, nombreVisitante) y el propio
    // picker decide solo si ese nombre está en la lista de la
    // competición o si hay que caer en "Otro equipo".
    const nombreLocal = rLocalPicker.obtenerValor() === VALOR_OTRO_EQUIPO
      ? rLocalOtroNombre.value.trim() : (rLocalPicker.obtenerValor() || "");
    const nombreVisitante = rVisitantePicker.obtenerValor() === VALOR_OTRO_EQUIPO
      ? rVisitanteOtroNombre.value.trim() : (rVisitantePicker.obtenerValor() || "");
    const datos = {
      guardado_en: new Date().toISOString(),
      competicion: document.getElementById("r_competicion").value,
      grupo: document.getElementById("r_grupo").value,
      jornada: document.getElementById("r_jornada").value,
      fecha: document.getElementById("r_fecha").value,
      estado: document.getElementById("r_estado").value,
      ubicacion: rUbicacion.value,
      fecha_retrasado: document.getElementById("r_fecha_retrasado").value,
      flashscore: rFlashscore.value,
      nombre_local: nombreLocal,
      nombre_visitante: nombreVisitante,
      goles_local: rGolesLocal.value,
      goles_visitante: rGolesVisitante.value,
    };
    localStorage.setItem(CLAVE_AUTOGUARDADO_RESULTADO, JSON.stringify(datos));
  } catch (err) {
    console.error("No se ha podido autoguardar el resultado:", err);
  }
}

// Guardado periódico mientras el formulario de resultados está en
// pantalla (cubre el caso de que el navegador se cierre de golpe sin
// disparar beforeunload, p.ej. al perder la luz o forzar el cierre).
setInterval(guardarAutoguardadoResultado, 8000);
// Guardado inmediato justo antes de salir de la página, por si acaso
// (recarga, cerrar pestaña, navegar a otra URL): así el autoguardado
// periódico de 8s no deja una ventana en la que se pierda lo último
// escrito.
window.addEventListener("beforeunload", guardarAutoguardadoResultado);

// Al entrar en "+ Nuevo resultado", si hay algo autoguardado se ofrece
// recuperarlo.
function comprobarAutoguardadoResultado() {
  let datos;
  try {
    const bruto = localStorage.getItem(CLAVE_AUTOGUARDADO_RESULTADO);
    if (!bruto) return;
    datos = JSON.parse(bruto);
  } catch {
    localStorage.removeItem(CLAVE_AUTOGUARDADO_RESULTADO);
    return;
  }
  if (!datos) return;
  const fecha = datos.guardado_en ? new Date(datos.guardado_en) : null;
  const fechaTexto = fecha ? fecha.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const descPartido = [datos.nombre_local, datos.nombre_visitante].filter(Boolean).join(" - ") || "(partido sin equipos escritos aún)";
  EOF.confirmar(
    `Había un resultado a medio crear que no llegaste a guardar: "${descPartido}" (${fechaTexto}). ¿Quieres recuperarlo?`,
    { textoConfirmar: "Recuperar", textoCancelar: "Descartar" }
  ).then((recuperar) => {
    if (recuperar) {
      document.getElementById("r_competicion").value = datos.competicion || "hypermotion";
      actualizarCampoGrupo();
      if (datos.grupo) document.getElementById("r_grupo").value = datos.grupo;
      actualizarCampoJornada();
      if (datos.jornada) document.getElementById("r_jornada").value = datos.jornada;
      if (datos.fecha) document.getElementById("r_fecha").value = datos.fecha;
      document.getElementById("r_estado").value = datos.estado || "programado";
      actualizarBloqueoGoles();
      actualizarCampoFlashscoreYUbicacion();
      actualizarCampoRetrasado();
      if (datos.ubicacion) rUbicacion.value = datos.ubicacion;
      if (datos.fecha_retrasado) document.getElementById("r_fecha_retrasado").value = datos.fecha_retrasado;
      if (datos.flashscore) rFlashscore.value = datos.flashscore;
      // Igual que hace editarResultado: se pasan los NOMBRES a
      // poblarSelectsEquipo y es el propio picker el que decide si cada
      // nombre está en la lista de la competición elegida o si hay que
      // caer en "Otro equipo (no está en la lista)".
      resetearBloqueOtroEquipo();
      poblarSelectsEquipo(datos.nombre_local || "", datos.nombre_visitante || "");
      if (rLocalPicker.obtenerValor() === VALOR_OTRO_EQUIPO) rLocalOtroNombre.value = datos.nombre_local || "";
      if (rVisitantePicker.obtenerValor() === VALOR_OTRO_EQUIPO) rVisitanteOtroNombre.value = datos.nombre_visitante || "";
      if (!rGolesLocal.disabled && datos.goles_local) rGolesLocal.value = datos.goles_local;
      if (!rGolesVisitante.disabled && datos.goles_visitante) rGolesVisitante.value = datos.goles_visitante;
    }
    localStorage.removeItem(CLAVE_AUTOGUARDADO_RESULTADO);
  });
}
// Se comprueba ya mismo (la subtab "+ Nuevo resultado" está activa por
// defecto al entrar al panel) y también cada vez que se vuelve a pulsar
// el botón "+ Nuevo resultado" desde otra subtab.
comprobarAutoguardadoResultado();
document.querySelector('#panel-resultados .subtabs button[data-subtab="resultado"]')?.addEventListener("click", () => {
  if (!document.getElementById("resultadoId").value) comprobarAutoguardadoResultado();
});

formResultado.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("resultadoId").value;

  const local = leerEquipoDelFormulario(rLocalPicker, rLocalOtroNombre, escudoLocalOtroUrl);
  const visitante = leerEquipoDelFormulario(rVisitantePicker, rVisitanteOtroNombre, escudoVisitanteOtroUrl);
  if (!local.nombre) return EOF.toast("Falta el equipo local", "error");
  if (!visitante.nombre) return EOF.toast("Falta el equipo visitante", "error");
  if (rLocalPicker.obtenerValor() === VALOR_OTRO_EQUIPO && rLocalOtroEscudo.files[0] && !local.escudo_url) {
    return EOF.toast("Espera a que termine de subirse el escudo del equipo local (o quítalo)", "error");
  }
  if (rVisitantePicker.obtenerValor() === VALOR_OTRO_EQUIPO && rVisitanteOtroEscudo.files[0] && !visitante.escudo_url) {
    return EOF.toast("Espera a que termine de subirse el escudo del equipo visitante (o quítalo)", "error");
  }

  // No se deja crear/guardar un resultado si falta algún dato básico:
  // sin esto, se podían quedar partidos "fantasma" sin competición, sin
  // fecha o con la jornada vacía, que luego aparecían mal ordenados o
  // ni siquiera aparecían en Resultados (que filtra por competición).
  const competicionElegida = document.getElementById("r_competicion").value;
  if (!competicionElegida) return EOF.toast("Falta la competición", "error");
  if (local.nombre.trim().toLowerCase() === visitante.nombre.trim().toLowerCase()) {
    return EOF.toast("El equipo local y el visitante no pueden ser el mismo", "error");
  }
  // La jornada solo se exige cuando el campo está habilitado: en
  // "amistoso" se deshabilita a propósito (rJornada.disabled) y su valor
  // se ignora más abajo, así que ahí no tiene sentido pedirla.
  if (!rJornada.disabled) {
    const jornadaTexto = document.getElementById("r_jornada").value;
    if (jornadaTexto === "" || isNaN(parseInt(jornadaTexto, 10))) {
      return EOF.toast("Falta la jornada", "error");
    }
  }
  let fechaPartidoTexto = document.getElementById("r_fecha").value;
  if (!fechaPartidoTexto) return EOF.toast("Falta la fecha del partido", "error");
  // Si el partido ya tenía fecha pero sin hora (ver editarResultado), el
  // campo se rellenó con "T00:00" solo para poder mostrarlo en el
  // <input type="datetime-local">. Si el redactor no ha tocado esa hora,
  // se guarda de nuevo solo con el día, tal y como estaba, en vez de
  // fijar sin querer las 00:00 como si fuera la hora real del partido.
  if (fechaOriginalSinHora && fechaPartidoTexto.endsWith("T00:00")) {
    fechaPartidoTexto = fechaPartidoTexto.slice(0, 10);
  }
  const estadoElegido = document.getElementById("r_estado").value;
  if (!estadoElegido) return EOF.toast("Falta el estado del partido", "error");
  if (estadoElegido === "retrasado" && !document.getElementById("r_fecha_retrasado").value) {
    return EOF.toast("Falta la nueva fecha/hora del partido retrasado", "error");
  }

  const body = {
    competicion: competicionElegida,
    grupo: document.getElementById("r_grupo").value,
    jornada: rJornada.disabled ? 0 : parseInt(document.getElementById("r_jornada").value, 10),
    fecha_partido: fechaPartidoTexto,
    estado: estadoElegido,
    fecha_partido_retrasado: estadoElegido === "retrasado"
      ? (document.getElementById("r_fecha_retrasado").value || null)
      : null,
    ubicacion: rUbicacion.value.trim() || null,
    flashscore_url: (COMPETICIONES_CON_FLASHSCORE.includes(competicionElegida) && estadoElegido === "finalizado")
      ? (rFlashscore.value.trim() || null)
      : null,
    equipo_local: local.nombre,
    goles_local: document.getElementById("r_goles_local").value === "" ? null : parseInt(document.getElementById("r_goles_local").value, 10),
    equipo_visitante: visitante.nombre,
    goles_visitante: document.getElementById("r_goles_visitante").value === "" ? null : parseInt(document.getElementById("r_goles_visitante").value, 10),
    escudo_local_url: local.escudo_url,
    escudo_visitante_url: visitante.escudo_url,
  };
  // Si el partido ya se ha jugado o se está jugando, el marcador ya no es
  // opcional: sin esto se podían guardar partidos "en juego" o
  // "finalizados" con casillas de goles vacías, que se pintaban en la
  // web pública con un guion o un marcador incompleto.
  if ((estadoElegido === "en_juego" || estadoElegido === "finalizado") && (body.goles_local === null || body.goles_visitante === null)) {
    return EOF.toast("Falta el marcador (goles de ambos equipos)", "error");
  }
  try {
    let resultadoId = id;
    if (id) {
      try {
        await apiFetch(`/api/results/${id}`, { method: "PUT", body: JSON.stringify(body) });
      } catch (err) {
        // La edición también comprueba duplicados: si los cambios dejan
        // este partido idéntico a otro ya existente, el backend responde
        // 409. Bloqueante (mismo enfrentamiento en la misma jornada) no
        // se puede confirmar; el resto sí, tras avisar al redactor.
        if (err.status === 409 && err.data?.duplicado_bloqueante) {
          return EOF.toast(err.data.mensaje || err.data.error, "error");
        }
        if (err.status === 409 && err.data?.posible_duplicado) {
          const confirmar = await EOF.confirmar(
            `${err.data.mensaje || err.data.error}\n\n¿Guardar los cambios de todas formas?`,
            { textoConfirmar: "Guardar igualmente", textoCancelar: "Cancelar" }
          );
          if (!confirmar) return;
          await apiFetch(`/api/results/${id}`, { method: "PUT", body: JSON.stringify({ ...body, confirmar_duplicado: true }) });
        } else {
          throw err;
        }
      }
    } else {
      let creado;
      try {
        creado = await apiFetch(`/api/results`, { method: "POST", body: JSON.stringify(body) });
      } catch (err) {
        // El backend responde 409 (no un error normal) cuando ya existe
        // un partido con los mismos equipos, competición y fecha/hora:
        // no es necesariamente un error del redactor (puede ser un
        // amistoso que de verdad se repite, o una entrada real
        // duplicada por despiste), así que se le enseña el partido ya
        // existente y se le deja decidir si quiere crearlo igualmente.
        // Duplicado bloqueante: el mismo enfrentamiento ya existe en
        // esa jornada. No se ofrece "crear igualmente" porque no hay
        // ningún caso en que sea correcto: lo que toca es editar el
        // partido que ya está.
        if (err.status === 409 && err.data?.duplicado_bloqueante) {
          return EOF.toast(err.data.mensaje || err.data.error, "error");
        }
        if (err.status === 409 && err.data?.posible_duplicado) {
          // El texto del aviso lo redacta el backend según el motivo
          // detectado (mismo día, equipo ocupado a esa hora, fechas
          // cercanas...), en vez de repetir aquí una descripción fija.
          const confirmar = await EOF.confirmar(
            `${err.data.mensaje || err.data.error}\n\n¿Seguro que quieres crear este partido de todas formas?`,
            { textoConfirmar: "Crear igualmente", textoCancelar: "Cancelar" }
          );
          if (!confirmar) return;
          creado = await apiFetch(`/api/results`, { method: "POST", body: JSON.stringify({ ...body, confirmar_duplicado: true }) });
        } else {
          throw err;
        }
      }
      resultadoId = creado?.id;
      // Red de seguridad: si el Worker desplegado todavía es una versión
      // antigua que no devuelve el id del resultado recién creado (p.ej.
      // porque falta hacer "wrangler deploy" tras esta actualización),
      // lo buscamos en la lista de resultados por sus datos, para que la
      // función de "goles y tarjetas justo al crear" no se quede muda.
      if (!resultadoId) {
        try {
          const { results: listaReciente = [] } = await apiFetch(`/api/results?limit=200`);
          const encontrado = listaReciente.find(r =>
            r.competicion === body.competicion &&
            r.equipo_local === body.equipo_local &&
            r.equipo_visitante === body.equipo_visitante &&
            (r.jornada || 0) === (body.jornada || 0)
          );
          resultadoId = encontrado?.id || null;
        } catch { /* si esto falla, seguimos sin id y se vacía el formulario como antes */ }
      }
    }
    // Si se ha usado "Otro equipo (no está en la lista)" para el local
    // y/o el visitante, se guarda ese club en el servidor (tabla
    // custom_clubs) para que a partir de ahora aparezca ya en el
    // desplegable normal de esa competición. Solo tiene sentido para las
    // 3 competiciones federativas (un amistoso no tiene lista propia de
    // clubes en clubs.js, así que no hay dónde guardarlo).
    if (CATEGORIAS_CON_LISTA_CLUBES.includes(body.competicion)) {
      await guardarClubPersonalizadoSiAplica(rLocalPicker, local, body.competicion);
      await guardarClubPersonalizadoSiAplica(rVisitantePicker, visitante, body.competicion);
    }
    const msg = document.getElementById("msgOkResultado");
    msg.style.display = "block";
    setTimeout(() => (msg.style.display = "none"), 2500);
    // Ya se ha guardado bien en el servidor: se descarta el autoguardado
    // local, si no la próxima vez que se abra "+ Nuevo resultado" se
    // ofrecería "recuperar" un partido que ya está guardado.
    localStorage.removeItem(CLAVE_AUTOGUARDADO_RESULTADO);

    // Si el resultado se ha creado/editado desde el modal abierto desde
    // el editor de noticias (opción "+ Nuevo resultado…" del
    // desplegable), no se sigue el flujo normal de la pestaña
    // "Resultados" (dejar el formulario abierto para añadir goles y
    // tarjetas, etc.): se vincula directamente a la noticia que se
    // estaba editando y se cierra el modal, para no sacar a quien
    // redacta de su noticia a medio escribir.
    if (creandoResultadoDesdeNoticia && resultadoId) {
      await cargarResultadosSelect(resultadoId);
      cerrarModalNuevoResultado();
      EOF.toast("Resultado creado y vinculado a la noticia", "exito");
      return;
    }

    // Si el partido ya tiene marcador (estado "en juego" o "finalizado"),
    // se deja el formulario en modo edición de ese mismo resultado (en
    // vez de vaciarlo) para poder añadir a continuación, sin pasos
    // extra, los goles y tarjetas del partido. Si sigue "Por jugar" se
    // vacía el formulario como antes, ya que todavía no tiene sentido
    // añadir eventos.
    if (resultadoId && body.estado !== "programado") {
      document.getElementById("resultadoId").value = resultadoId;
      document.getElementById("btnCancelarResultado").style.display = "inline-block";
      document.getElementById("bloqueEventosPartido").style.display = "block";
      document.getElementById("bloqueTandaPenaltis").style.display = "block";
      cancelarEdicionEvento();
      cancelarEdicionTandaPenaltis();
      await cargarEventosPartido(resultadoId);
      await cargarTandaPenaltis(resultadoId);
      await cargaListaResultados();
      document.getElementById("bloqueEventosPartido").scrollIntoView({ behavior: "smooth", block: "start" });
      // El botón para abrir el panel de Minuto a Minuto desde aquí solo
      // tiene sentido si el partido no está ya finalizado ni anulado y
      // es el día del partido (mismo criterio que en el listado).
      const btnMaM = document.getElementById("btnAbrirMinutoAMinutoDesdeForm");
      const rActual = RESULTADOS_CACHE[resultadoId];
      const puedeAbrirMaM = body.estado !== "finalizado" && body.estado !== "anulado" && dentroDelDiaDelPartidoFrontend(body.fecha_partido);
      btnMaM.style.display = puedeAbrirMaM ? "inline-block" : "none";
      btnMaM.onclick = () => abrirPanelMinutoAMinuto(resultadoId);
    } else {
      cancelarEdicionResultado();
    }
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
});

function cancelarEdicionResultado() {
  formResultado.reset();
  document.getElementById("resultadoId").value = "";
  fechaOriginalSinHora = false;
  document.getElementById("btnCancelarResultado").style.display = "none";
  actualizarCampoGrupo();
  actualizarCampoJornada();
  actualizarBloqueoGoles();
  actualizarCampoFlashscoreYUbicacion();
  actualizarCampoRetrasado();
  resetearBloqueOtroEquipo();
  poblarSelectsEquipo();
  actualizarPreviewResultado();
  document.getElementById("bloqueEventosPartido").style.display = "none";
  document.getElementById("bloqueTandaPenaltis").style.display = "none";
  document.getElementById("bloqueAlineacionesResultado").style.display = "none";
  document.getElementById("btnAbrirMinutoAMinutoDesdeForm").style.display = "none";
  EVENTOS_PARTIDO_RESULTADO_ID = null;
  cancelarEdicionEvento();
  cancelarEdicionTandaPenaltis();
}

// ---------- PANEL MINUTO A MINUTO: acceso ----------
// Mismo criterio que el backend (ver dentroDelDiaDelPartido en el
// Worker): el día natural del partido, con un margen de unas horas
// antes y después para no bloquear a quien llega un poco pronto o el
// partido se alarga. Se comprueba aquí solo para decidir si se muestra
// el botón; el backend vuelve a comprobarlo igualmente en cada petición.
function dentroDelDiaDelPartidoFrontend(fechaPartido) {
  if (!fechaPartido) return false;
  const inicio = new Date(fechaPartido.length === 10 ? `${fechaPartido}T00:00:00Z` : `${fechaPartido}:00Z`);
  if (isNaN(inicio.getTime())) return false;
  const ahora = Date.now();
  const desde = inicio.getTime() - MARGEN_ACCESO_MINUTO_A_MINUTO_HORAS * 3600 * 1000;
  const finDelDia = new Date(inicio);
  finDelDia.setUTCHours(23, 59, 59, 999);
  const hasta = finDelDia.getTime() + MARGEN_ACCESO_MINUTO_A_MINUTO_HORAS * 3600 * 1000;
  return ahora >= desde && ahora <= hasta;
}

// Misma idea que ARTICULOS_LISTA_COMPLETA/ARTICULOS_PAGINA_ACTUAL, para
// el listado de resultados: se guarda ya ordenado (en_juego/programado
// primero) para no tener que reordenar en cada repintado.
let RESULTADOS_LISTA_COMPLETA = [];
let RESULTADOS_PAGINA_ACTUAL = 1;
const RESULTADOS_POR_PAGINA = 20;

function resultadoCoincideBusqueda(r, textoBusqueda) {
  if (!textoBusqueda) return true;
  const haystack = normalizarBusquedaPanel(`${(r.competicion ? categoriaLabel(r.competicion) : "") || ""} ${r.jornada ?? ""} ${r.equipo_local || ""} ${r.equipo_visitante || ""}`);
  return haystack.includes(normalizarBusquedaPanel(textoBusqueda));
}

// ---------- Filtros de Competición y Equipo del listado de Resultados ----------
// Se guardan en localStorage (mismo mecanismo que el tema o los
// borradores de emergencia) para que, si el redactor sale del panel de
// Redacción > Resultados y vuelve más tarde (o recarga la página), siga
// viendo la misma competición/equipo que tenía puestos, sin tener que
// volver a elegirlos.
const CLAVE_FILTRO_COMPETICION_RESULTADOS = "eof_filtro_competicion_resultados";
const CLAVE_FILTRO_EQUIPO_RESULTADOS = "eof_filtro_equipo_resultados";

function competicionFiltroResultadosGuardada() {
  return localStorage.getItem(CLAVE_FILTRO_COMPETICION_RESULTADOS) || "";
}
function equipoFiltroResultadosGuardado() {
  return localStorage.getItem(CLAVE_FILTRO_EQUIPO_RESULTADOS) || "";
}

// Rellena el desplegable de competiciones (una vez; las opciones son
// fijas, vienen de CATEGORIES en config.js) y restaura la selección
// guardada.
function poblarFiltroCompeticionResultados() {
  const select = document.getElementById("filtroCompeticionResultados");
  if (!select || select.dataset.poblado) return;
  Object.keys(CATEGORIES).forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = categoriaLabel(cat);
    select.appendChild(opt);
  });
  select.dataset.poblado = "1";
  select.value = competicionFiltroResultadosGuardada();
}

// Rellena el desplegable de equipos a partir de los equipos que
// realmente aparecen en RESULTADOS_LISTA_COMPLETA (local o visitante),
// limitados a la competición elegida si hay alguna seleccionada. Se
// recalcula cada vez que cambia la competición o se recarga la lista,
// para no ofrecer equipos que no juegan en la competición filtrada.
function poblarFiltroEquipoResultados() {
  const selectEquipo = document.getElementById("filtroEquipoResultados");
  const selectCompeticion = document.getElementById("filtroCompeticionResultados");
  if (!selectEquipo) return;
  const competicionElegida = selectCompeticion?.value || "";
  const equipoPrevio = selectEquipo.value || equipoFiltroResultadosGuardado();

  const equipos = new Set();
  RESULTADOS_LISTA_COMPLETA.forEach((r) => {
    if (competicionElegida && r.competicion !== competicionElegida) return;
    if (r.equipo_local) equipos.add(r.equipo_local);
    if (r.equipo_visitante) equipos.add(r.equipo_visitante);
  });
  const equiposOrdenados = [...equipos].sort((a, b) => a.localeCompare(b, "es"));

  selectEquipo.innerHTML = '<option value="">Todos los equipos</option>' +
    equiposOrdenados.map((eq) => `<option value="${escapeHtml(eq)}">${escapeHtml(eq)}</option>`).join("");
  // Si el equipo que tenía seleccionado ya no está entre los disponibles
  // (p.ej. tras cambiar de competición), se vuelve a "Todos los equipos"
  // en vez de dejar el desplegable en un valor que ya no existe.
  selectEquipo.value = equiposOrdenados.includes(equipoPrevio) ? equipoPrevio : "";
}

function resultadoCoincideFiltros(r, competicionElegida, equipoElegido) {
  if (competicionElegida && r.competicion !== competicionElegida) return false;
  if (equipoElegido && r.equipo_local !== equipoElegido && r.equipo_visitante !== equipoElegido) return false;
  return true;
}

// Un resultado cuenta como "sin cubrir" a efectos de este filtro si es
// alguno de los dos avisos que ya se pintan en la fila: el partido en
// juego desatendido (🔴 Sin cubrir, ver avisoPartidoDesatendidoHTML) o el
// finalizado que el cron cerró solo porque nadie pulsó "Fin del partido"
// (🟠 FINALIZADO NO CUBIERTO, ver avisoFinalizadoNoCubiertoHTML). Se
// reutilizan esas mismas condiciones para que el filtro y los avisos
// nunca se desincronicen.
function resultadoEstaSinCubrir(r) {
  return !!avisoPartidoDesatendido(r) || (r.estado === "finalizado" && !!r.finalizado_no_cubierto);
}

let filtroSoloSinCubrirResultadosActivo = false;

// Copia local de timestampFechaPartido (ver public/js/partidos.js): este
// panel no carga ese script, así que se replica aquí solo para poder
// ordenar por fecha_partido al aplicar el filtro "Solo sin cubrir".
// Devuelve NaN si no hay fecha o no se puede parsear, para que el
// resultado caiga al final en vez de romper la ordenación.
function timestampFechaPartidoAdmin(r) {
  if (!r.fecha_partido) return NaN;
  let raw = String(r.fecha_partido).trim();
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(raw)) {
    raw = raw.includes("T") ? raw + "Z" : raw.replace(" ", "T") + "Z";
  }
  const t = new Date(raw).getTime();
  return isNaN(t) ? NaN : t;
}

async function cargaListaResultados() {
  const cos = document.getElementById("tablaResultados");
  cos.innerHTML = "<tr><td colspan='6'>Cargando...</td></tr>";
  try {
    await cargarPermisosTemporalesVigentes();
    // Antes se pedían solo los últimos 200 resultados (ordenados por
    // jornada/fecha en el backend). Con varias competiciones mezcladas,
    // eso dejaba fuera jornadas bajas (p.ej. la Jornada 1 de Primera
    // Federación) en cuanto había suficientes partidos más "altos" o más
    // recientes de otras competiciones ocupando el límite: el buscador de
    // este listado solo filtra en texto DENTRO de lo ya traído, así que
    // esos partidos ni siquiera llegaban a estar disponibles para
    // encontrarlos, aunque sí existieran en la base de datos (por eso
    // fuera del panel, en la web pública, que filtra por competición
    // directamente en el backend, sí aparecían con normalidad). Se subió
    // el límite a 2000 pensando en traer todo el histórico de golpe, pero
    // el backend bajó su tope real a 500 (ver worker/src/index.js:
    // cualquier "limit" por encima de 500 se ignora y cae en el default
    // de 100), así que "2000" se estaba quedando, en la práctica, en 100.
    // Se ajusta a 500, el máximo real que el backend admite.
    const { results = [] } = await apiFetch(`/api/results?limit=500`);
    RESULTADOS_CACHE = {};
    results.forEach((r) => { RESULTADOS_CACHE[r.id] = r; });
    // Los partidos en juego o por jugar (programado) son los que más
    // atención necesitan del redactor (eventar en vivo, revisar datos
    // antes de que empiecen...), así que se muestran arriba del todo.
    // Dentro de cada grupo se conserva el orden que ya traía la API.
    const ordenEstadoTabla = { en_juego: 0, programado: 1 };
    RESULTADOS_LISTA_COMPLETA = results
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const pa = ordenEstadoTabla[a.r.estado] ?? 2;
        const pb = ordenEstadoTabla[b.r.estado] ?? 2;
        if (pa !== pb) return pa - pb;
        return a.i - b.i;
      })
      .map(({ r }) => r);
    RESULTADOS_PAGINA_ACTUAL = 1;
    poblarFiltroCompeticionResultados();
    poblarFiltroEquipoResultados();
    pintarListaResultados();
  } catch (err) {
    cos.innerHTML = `<tr><td colspan="6">Error cargando: ${err.message}</td></tr>`;
  }
}

// Repinta la tabla de resultados a partir de RESULTADOS_LISTA_COMPLETA,
// aplicando el texto del buscador y recortando a la página actual.
function pintarListaResultados() {
  const cos = document.getElementById("tablaResultados");
  const inputBuscador = document.getElementById("buscadorResultados");
  const textoBusqueda = (inputBuscador?.value || "").trim().toLowerCase();
  const competicionElegida = document.getElementById("filtroCompeticionResultados")?.value || "";
  const equipoElegido = document.getElementById("filtroEquipoResultados")?.value || "";
  let resultadosFiltrados = RESULTADOS_LISTA_COMPLETA
    .filter(r => resultadoCoincideFiltros(r, competicionElegida, equipoElegido))
    .filter(r => resultadoCoincideBusqueda(r, textoBusqueda));

  if (filtroSoloSinCubrirResultadosActivo) {
    // Con el filtro activo se abandona el orden habitual (en juego /
    // programado primero) y se ordena solo por fecha del partido, del
    // más reciente al más antiguo, que es lo útil para revisar de un
    // vistazo qué se ha quedado sin cubrir más recientemente. Los que no
    // tienen fecha se van al final en vez de romper el orden.
    resultadosFiltrados = resultadosFiltrados
      .filter(resultadoEstaSinCubrir)
      .sort((a, b) => {
        const ta = timestampFechaPartidoAdmin(a);
        const tb = timestampFechaPartidoAdmin(b);
        if (isNaN(ta) && isNaN(tb)) return 0;
        if (isNaN(ta)) return 1;
        if (isNaN(tb)) return -1;
        return tb - ta;
      });
  }

  const totalPaginas = Math.max(1, Math.ceil(resultadosFiltrados.length / RESULTADOS_POR_PAGINA));
  if (RESULTADOS_PAGINA_ACTUAL > totalPaginas) RESULTADOS_PAGINA_ACTUAL = totalPaginas;
  const inicio = (RESULTADOS_PAGINA_ACTUAL - 1) * RESULTADOS_POR_PAGINA;
  const resultsOrdenados = resultadosFiltrados.slice(inicio, inicio + RESULTADOS_POR_PAGINA);

  const contador = document.getElementById("contadorResultados");
  if (contador) {
    contador.textContent = (textoBusqueda || filtroSoloSinCubrirResultadosActivo)
      ? `${resultadosFiltrados.length} de ${RESULTADOS_LISTA_COMPLETA.length} resultados`
      : `${RESULTADOS_LISTA_COMPLETA.length} resultados`;
  }

  try {
    cos.innerHTML = resultsOrdenados.map(r => {
      const esMio = r.autor_id === USER.id;
      const puedeGestionar = puedeGestionarResultado(r);
      const badgeAutoria = USER.rol === "admin" ? "" :
        `<span class="badge-autoria ${esMio ? "mio" : "otro"}">${esMio ? "Mío" : escapeHtml(r.autor_nombre || "De otro/a")}</span>`;
      // El botón de Minuto a Minuto solo se muestra si además de poder
      // gestionar el partido, es el día del partido (con margen) y no
      // está ya finalizado (una vez finalizado, los eventos se retocan
      // desde el formulario normal de "Editar", no desde el panel en vivo)
      // ni anulado (un partido anulado no se juega, así que no tiene
      // sentido abrir el panel en vivo para eventarlo).
      const puedeAccederMinutoAMinuto = puedeGestionar && r.estado !== "finalizado" && r.estado !== "anulado" && dentroDelDiaDelPartidoFrontend(r.fecha_partido);
      const botonMinutoAMinuto = puedeAccederMinutoAMinuto
        ? `<button class="btn-minuto-a-minuto" data-accion="minuto-a-minuto" data-id="${r.id}">⚽ Minuto a minuto</button>`
        : "";
      const botonesAccion = puedeGestionar
        ? `<button class="editar" data-accion="editar" data-id="${r.id}">Editar</button>
           <button class="eliminar" data-accion="eliminar" data-id="${r.id}">Eliminar</button>`
        : `<button class="solicitar" data-accion="solicitar" data-id="${r.id}">Solicitar edición</button>`;
      // Retrasar/anular un partido ya no depende de entrar al panel de
      // Minuto a Minuto (pensado para ir eventando en directo): son
      // cambios de estado puntuales, así que también se pueden hacer
      // directamente desde esta fila. Solo tienen sentido si el partido
      // no ha acabado ni está ya anulado.
      const puedeRetrasarOAnular = puedeGestionar && r.estado !== "finalizado" && r.estado !== "anulado";
      const botonesEstadoPartido = puedeRetrasarOAnular
        ? `<button class="btn-retrasar-partido" data-accion="retrasar-partido" data-id="${r.id}" title="Marcar como retrasado">🕒 Retrasar</button>
           <button class="btn-anular-partido" data-accion="anular-partido" data-id="${r.id}" title="Anular partido">🚫 Anular</button>`
        : "";
      return `
      <tr class="${!esMio && USER.rol !== "admin" ? "fila-de-otro" : ""}" data-resultado-id="${r.id}">
        <td data-label="Competición"><span class="competicion-celda">${categoriaLogo(r.competicion) ? `<img class="competicion-celda-logo${r.competicion === "hypermotion" ? " competicion-celda-logo-hypermotion" : ""}" src="../${categoriaLogo(r.competicion)}" alt="" loading="lazy">` : ""}${categoriaLabel(r.competicion)}</span> ${badgeAutoria}</td>
        <td data-label="Jornada">${r.jornada}</td>
        <td data-label="Partido">${escapeHtml(r.equipo_local)} - ${escapeHtml(r.equipo_visitante)} ${avisoDatosFaltantesResultadoHTML(r)}${avisoPartidoDesatendidoHTML(r)}</td>
        <td data-label="Resultado">${r.estado === "programado" ? "vs" : `${r.goles_local ?? 0} : ${r.goles_visitante ?? 0}`}${(r.penaltis_local !== null && r.penaltis_local !== undefined && r.penaltis_visitante !== null && r.penaltis_visitante !== undefined) ? `<br><small class="penaltis-tag-admin">(${r.penaltis_local} - ${r.penaltis_visitante} pen.)</small>` : ""}</td>
        <td data-label="Estado">${r.estado} ${avisoFinalizadoNoCubiertoHTML(r)}</td>
        <td class="acciones" data-label="">${botonMinutoAMinuto}${botonesEstadoPartido}${botonesAccion}</td>
      </tr>`;
    }).join("") || `<tr><td colspan='6'>${
      filtroSoloSinCubrirResultadosActivo
        ? "No hay ningún partido sin cubrir ahora mismo."
        : (textoBusqueda ? "Ningún resultado coincide con la búsqueda." : "Todavía no hay resultados.")
    }</td></tr>`;
  } catch (err) {
    cos.innerHTML = `<tr><td colspan="6">Error mostrando el listado: ${err.message}</td></tr>`;
  }

  pintarPaginacion("paginacionResultados", RESULTADOS_PAGINA_ACTUAL, totalPaginas, (pagina) => {
    RESULTADOS_PAGINA_ACTUAL = pagina;
    pintarListaResultados();
  });
}

document.getElementById("buscadorResultados")?.addEventListener("input", () => {
  RESULTADOS_PAGINA_ACTUAL = 1;
  pintarListaResultados();
});

document.getElementById("filtroCompeticionResultados")?.addEventListener("change", (ev) => {
  localStorage.setItem(CLAVE_FILTRO_COMPETICION_RESULTADOS, ev.target.value);
  // Cambiar de competición puede dejar seleccionado un equipo que no
  // juega en ella, así que se recalcula la lista de equipos disponibles
  // antes de repintar.
  poblarFiltroEquipoResultados();
  localStorage.setItem(CLAVE_FILTRO_EQUIPO_RESULTADOS, document.getElementById("filtroEquipoResultados")?.value || "");
  RESULTADOS_PAGINA_ACTUAL = 1;
  pintarListaResultados();
});

document.getElementById("filtroSoloSinCubrirResultados")?.addEventListener("click", (ev) => {
  filtroSoloSinCubrirResultadosActivo = !filtroSoloSinCubrirResultadosActivo;
  ev.currentTarget.classList.toggle("activo", filtroSoloSinCubrirResultadosActivo);
  ev.currentTarget.setAttribute("aria-pressed", String(filtroSoloSinCubrirResultadosActivo));
  RESULTADOS_PAGINA_ACTUAL = 1;
  pintarListaResultados();
});

document.getElementById("filtroEquipoResultados")?.addEventListener("change", (ev) => {
  localStorage.setItem(CLAVE_FILTRO_EQUIPO_RESULTADOS, ev.target.value);
  RESULTADOS_PAGINA_ACTUAL = 1;
  pintarListaResultados();
});

// Detecta datos que faltan en un partido, para el redactor: si falta la
// hora (solo hay fecha, sin "T"), la ubicación, algún escudo... Solo
// tiene sentido avisar de la hora/ubicación en partidos que ya tienen
// fecha puesta y no están anulados/retrasados (esos casos ya se avisan
// de otra forma en el propio formulario). No se avisa de "faltan
// equipos" porque el backend no deja crear un resultado sin ellos.
// Detecta datos que faltan en un partido, para el redactor: solo los
// campos que de verdad pueden quedar vacíos en la base de datos y que
// el redactor puede rellenar desde el formulario (fecha, hora,
// ubicación). NO se avisa de escudos ni de jornada:
// - El escudo casi nunca falta "de verdad" en la BD (escudo_local_url/
//   escudo_visitante_url solo se rellenan para equipos "personalizados"
//   subidos a mano); para el resto de equipos, el escudo se resuelve en
//   el navegador a partir del nombre y un fichero local en
//   img/escudos/, así que ese campo sale vacío en prácticamente TODOS
//   los partidos sin que sea ningún problema real. Avisar de esto daba
//   una alerta en todos los partidos, no un dato faltante de verdad.
// - La jornada es NOT NULL en el backend (el propio formulario obliga
//   a rellenarla, o la manda como 0 en amistosos), así que nunca falta
//   de verdad.
function datosFaltantesResultado(r) {
  const faltan = [];
  if (r.estado === "anulado") return faltan; // partido anulado: no tiene sentido pedir hora/ubicación
  if (!r.fecha_partido) {
    faltan.push("Falta la fecha");
  } else if (!String(r.fecha_partido).includes("T")) {
    // fecha_partido guarda "YYYY-MM-DD" si solo se conoce el día, o
    // "YYYY-MM-DDTHH:MM" si también se conoce la hora.
    faltan.push("Falta la hora");
  }
  if ((r.estado === "programado" || r.estado === "finalizado") && !r.ubicacion) {
    faltan.push("Falta la ubicación");
  }
  return faltan;
}

// Pequeño icono de aviso ⚠ junto al nombre del partido en la lista de
// resultados del panel, con el detalle de lo que falta al pasar el
// ratón/dedo por encima. No bloquea nada, es solo un chivato visual
// para que el redactor sepa qué le queda por rellenar.
function avisoDatosFaltantesResultadoHTML(r) {
  const faltan = datosFaltantesResultado(r);
  if (!faltan.length) return "";
  return `<span class="resultado-aviso-datos" tabindex="0" data-detalle="${escapeHtml(faltan.join(" · "))}">⚠ ${faltan.length}</span>`;
}

// ---------- Aviso visual de partido posiblemente sin cubrir ----------
// Misma idea y mismos umbrales que revisarPartidosDesatendidos() en el
// backend (que es quien manda el email), pero calculado aquí al vuelo
// para que la lista de resultados del panel muestre el aviso en vivo
// sin tener que esperar al email ni recargar. Si el backend cambia sus
// umbrales, conviene mantener estos en línea con los de
// worker/src/index.js.
const MAM_UMBRAL_PRIMERA_PARTE_SIN_DESCANSO = 55;
const MAM_UMBRAL_SEGUNDA_PARTE_SIN_FINAL = 100;
const MAM_UMBRAL_DESCANSO_SIN_REANUDAR = 25;

function minutoEnVivoResultado(r) {
  if (r.cronometro_pausado_en !== null && r.cronometro_pausado_en !== undefined) {
    return r.cronometro_pausado_en;
  }
  if (!r.inicio_cronometro_at) return 0;
  let raw = String(r.inicio_cronometro_at).trim();
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(raw)) {
    raw = raw.includes("T") ? raw + "Z" : raw.replace(" ", "T") + "Z";
  }
  const inicio = new Date(raw).getTime();
  if (isNaN(inicio)) return 0;
  const ajuste = Number.isInteger(r.ajuste_cronometro_minutos) ? r.ajuste_cronometro_minutos : 0;
  return Math.max(0, Math.floor((Date.now() - inicio) / 60000) + ajuste);
}

// Un partido no se considera desatendido si se ha registrado un evento
// (gol, tarjeta, cambio...) hace poco: aunque el cronómetro lleve mucho
// corriendo sin pitar descanso/final, si el redactor sigue metiendo
// eventos en el minuto a minuto es que sí lo está cubriendo, así que no
// tiene sentido mostrarle "Sin cubrir". Mismo margen que el intervalo de
// refresco de este aviso en el panel (ver setInterval más abajo).
const MAM_MINUTOS_ACTIVIDAD_RECIENTE = 5;

function tieneActividadRecienteResultado(r) {
  if (!r.ultimo_evento_at) return false;
  let raw = String(r.ultimo_evento_at).trim();
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(raw)) {
    raw = raw.includes("T") ? raw + "Z" : raw.replace(" ", "T") + "Z";
  }
  const ultimo = new Date(raw).getTime();
  if (isNaN(ultimo)) return false;
  return (Date.now() - ultimo) / 60000 < MAM_MINUTOS_ACTIVIDAD_RECIENTE;
}

// Solo puede evaluar el caso "lleva parado en el descanso demasiado
// tiempo" de forma aproximada (no tiene a mano el timestamp del evento
// "descanso", solo lo que ya sabe por el cronómetro), así que ese caso
// concreto se deja al aviso por email del backend, que sí consulta
// match_events. Aquí se cubren los otros dos: cronómetro corriendo
// mucho más allá de lo normal.
function avisoPartidoDesatendido(r) {
  if (r.estado !== "en_juego") return null;
  const corriendo = r.cronometro_pausado_en === null || r.cronometro_pausado_en === undefined;
  if (!corriendo) return null;
  if (tieneActividadRecienteResultado(r)) return null;
  const minuto = minutoEnVivoResultado(r);
  if (minuto >= MAM_UMBRAL_SEGUNDA_PARTE_SIN_FINAL) {
    return `El cronómetro sigue corriendo y va por el minuto ${minuto} sin que se haya registrado el final del partido. Revisa si sigue en juego de verdad.`;
  }
  if (minuto >= MAM_UMBRAL_PRIMERA_PARTE_SIN_DESCANSO) {
    return `El cronómetro sigue corriendo y va por el minuto ${minuto} sin que se haya pitado el descanso. Puede que nadie esté cubriendo el partido.`;
  }
  return null;
}

function avisoPartidoDesatendidoHTML(r) {
  const motivo = avisoPartidoDesatendido(r);
  if (!motivo) return "";
  return `<span class="resultado-aviso-desatendido" tabindex="0" data-detalle="${escapeHtml(motivo)}">🔴 Sin cubrir</span>`;
}

// Aviso distinto al de arriba: ese avisa de un partido que TODAVÍA está
// en juego y lleva mucho tiempo sin que nadie lo cubra. Este otro es
// para cuando el cron YA ha cerrado el partido solo, al llegar al minuto
// MINUTO_FIN_PARTIDO_AUTOMATICO (ver worker/src/index.js), porque nadie
// pulsó "Fin del partido" a tiempo -- se pinta junto al estado
// "finalizado" en la tabla para que el redactor sepa que ese resultado
// puede necesitar revisión (marcador, eventos del tramo final...) aunque
// ya conste como acabado. Desaparece solo en cuanto alguien edita el
// partido o pulsa "Fin del partido" a mano (ver finalizado_no_cubierto
// en el backend).
function avisoFinalizadoNoCubiertoHTML(r) {
  if (r.estado !== "finalizado" || !r.finalizado_no_cubierto) return "";
  return `<span class="resultado-aviso-finalizado-no-cubierto" tabindex="0" data-detalle="Nadie pulsó &quot;Fin del partido&quot; a tiempo: el cron lo ha cerrado solo. Revisa el marcador y los últimos eventos.">🟠 FINALIZADO NO CUBIERTO</span>`;
}

// El minuto en vivo avanza con el reloj aunque nadie toque nada en el
// panel, así que un partido que estaba bien al cargar la lista puede
// entrar en "sin cubrir" mientras el redactor sigue viendo la tabla sin
// recargar. Cada minuto se recalcula solo el aviso (⚠ datos + 🔴 sin
// cubrir) de cada fila ya pintada, sin reconstruir toda la tabla (para
// no perder tooltips abiertos ni recargar del servidor de más).
//
// OJO: esto por sí solo NO bastaba para que la etiqueta desapareciera
// cuando el partido sí se estaba cubriendo. "r" venía de
// RESULTADOS_CACHE, que solo se rellena en cargaListaResultados() (al
// cargar la pestaña o pulsar "Actualizar") y no se tocaba aquí: si el
// redactor metía un evento nuevo (gol, tarjeta...) sin recargar la
// lista, ese evento actualizaba ultimo_evento_at en el servidor pero
// RESULTADOS_CACHE se quedaba con el valor viejo (o sin ninguno) para
// siempre, así que tieneActividadRecienteResultado() nunca lo veía y
// "🔴 Sin cubrir" se quedaba pegado aunque sí se estuviera cubriendo.
// Por eso ahora, cada minuto, primero se refresca RESULTADOS_CACHE con
// los datos reales del servidor (mismo endpoint y mismo límite que ya
// usa la carga inicial -ver cargaListaResultados()-, para no pisar la
// caché con un subconjunto más pequeño y hacer "desaparecer" de ella
// partidos que la carga inicial sí había traído) y luego se repinta el
// aviso sobre esos datos frescos.
setInterval(async () => {
  const tabla = document.getElementById("tablaResultados");
  if (!tabla || !tabla.querySelector("tr[data-resultado-id]")) return;
  try {
    const { results = [] } = await apiFetch(`/api/results?limit=500`);
    results.forEach((r) => { RESULTADOS_CACHE[r.id] = r; });
  } catch (err) {
    // Si falla el refresco (red, etc.) se sigue con los datos que ya
    // había en caché en vez de romper el repintado del resto del panel.
  }
  tabla.querySelectorAll("tr[data-resultado-id]").forEach((fila) => {
    const r = RESULTADOS_CACHE[fila.dataset.resultadoId];
    if (!r) return;
    const celda = fila.querySelector("td[data-label='Partido']");
    if (celda) celda.innerHTML = `${escapeHtml(r.equipo_local)} - ${escapeHtml(r.equipo_visitante)} ${avisoDatosFaltantesResultadoHTML(r)}${avisoPartidoDesatendidoHTML(r)}`;
    // Mismo refresco de fondo que ya hacía esta función para "🔴 Sin
    // cubrir": ahora también repinta la celda de Estado, para que
    // "🟠 FINALIZADO NO CUBIERTO" aparezca solo (sin recargar la pestaña
    // entera) en cuanto el cron cierra un partido mientras la lista sigue
    // abierta, y para que un partido que pasa de "programado"/"en_juego"
    // a "finalizado" (o al revés) también actualice su texto de estado
    // sin que el redactor tenga que volver a entrar en la pestaña.
    const celdaEstado = fila.querySelector("td[data-label='Estado']");
    if (celdaEstado) celdaEstado.innerHTML = `${r.estado} ${avisoFinalizadoNoCubiertoHTML(r)}`;
  });
}, 60000);



// El aviso ⚠ de datos faltantes muestra su detalle en un tooltip propio
// (no el title nativo del navegador, que tarda en aparecer y no
// funciona bien al tocar en móvil): con el ratón encima se ve solo con
// CSS (:hover), y con un toque/clic (móvil o escritorio) se alterna con
// esta clase, para que también se pueda consultar tocando.
document.getElementById("tablaResultados")?.addEventListener("click", (ev) => {
  const aviso = ev.target.closest(".resultado-aviso-datos");
  if (aviso) {
    ev.stopPropagation();
    const yaAbierto = aviso.classList.contains("aviso-abierto");
    document.querySelectorAll(".resultado-aviso-datos.aviso-abierto").forEach((el) => el.classList.remove("aviso-abierto"));
    if (!yaAbierto) aviso.classList.add("aviso-abierto");
    return;
  }
  const avisoDesatendido = ev.target.closest(".resultado-aviso-desatendido");
  if (avisoDesatendido) {
    ev.stopPropagation();
    const yaAbierto = avisoDesatendido.classList.contains("aviso-abierto");
    document.querySelectorAll(".resultado-aviso-desatendido.aviso-abierto").forEach((el) => el.classList.remove("aviso-abierto"));
    if (!yaAbierto) avisoDesatendido.classList.add("aviso-abierto");
    return;
  }
  const avisoFinalizadoNoCubierto = ev.target.closest(".resultado-aviso-finalizado-no-cubierto");
  if (avisoFinalizadoNoCubierto) {
    ev.stopPropagation();
    const yaAbierto = avisoFinalizadoNoCubierto.classList.contains("aviso-abierto");
    document.querySelectorAll(".resultado-aviso-finalizado-no-cubierto.aviso-abierto").forEach((el) => el.classList.remove("aviso-abierto"));
    if (!yaAbierto) avisoFinalizadoNoCubierto.classList.add("aviso-abierto");
    return;
  }
  document.querySelectorAll(".resultado-aviso-datos.aviso-abierto").forEach((el) => el.classList.remove("aviso-abierto"));
  document.querySelectorAll(".resultado-aviso-desatendido.aviso-abierto").forEach((el) => el.classList.remove("aviso-abierto"));
  document.querySelectorAll(".resultado-aviso-finalizado-no-cubierto.aviso-abierto").forEach((el) => el.classList.remove("aviso-abierto"));


  const btn = ev.target.closest("[data-accion]");
  if (!btn) return;
  const r = RESULTADOS_CACHE[btn.dataset.id];
  if (!r) return;
  if (btn.dataset.accion === "editar") editarResultado(r);
  else if (btn.dataset.accion === "eliminar") eliminarResultado(r.id);
  else if (btn.dataset.accion === "solicitar") abrirModalSolicitarEdicion("resultado", r.id);
  else if (btn.dataset.accion === "minuto-a-minuto") abrirPanelMinutoAMinuto(r.id);
  else if (btn.dataset.accion === "retrasar-partido") retrasarPartidoDesdeLista(r);
  else if (btn.dataset.accion === "anular-partido") anularPartidoDesdeLista(r);
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".resultado-aviso-datos")) {
    document.querySelectorAll(".resultado-aviso-datos.aviso-abierto").forEach((el) => el.classList.remove("aviso-abierto"));
  }
});

function editarResultado(r) {
  // Se guarda el resultado completo (estado, cronómetro...) para poder
  // reutilizar aquí, desde fuera del panel de Minuto a Minuto, las
  // mismas acciones que tocan el cronómetro/estado del partido al
  // registrar ciertos tipos de evento (inicio, descanso, retrasado...).
  // Ver actualizarEstadoCronometroDesdeEventoResultado().
  EVENTOS_PARTIDO_RESULTADO_OBJ = r;
  document.querySelector('.tabs button[data-tab="resultados"]').click();
  document.querySelector('#panel-resultados .subtabs button[data-subtab="resultado"]').click();
  document.getElementById("resultadoId").value = r.id;
  document.getElementById("r_competicion").value = r.competicion;
  actualizarCampoGrupo(r.grupo || "");
  actualizarCampoJornada();
  document.getElementById("r_jornada").value = r.jornada || "";
  // "r_fecha" es un <input type="datetime-local">, que exige el formato
  // exacto "YYYY-MM-DDTHH:MM": si fecha_partido solo tiene el día (sin
  // hora todavía, formato "YYYY-MM-DD", como pasa a veces en amistosos
  // programados con fecha pero sin hora fijada), el navegador rechaza el
  // valor en silencio y el campo se queda vacío, borrando la fecha de la
  // vista aunque siga guardada en la base de datos. Se completa con
  // "T00:00" para que el campo la muestre igualmente; guardarResultado()
  // usa fechaOriginalSinHora para no dar por hecho que el redactor ha
  // fijado esa hora si no ha tocado el campo.
  fechaOriginalSinHora = !!(r.fecha_partido && !String(r.fecha_partido).includes("T"));
  document.getElementById("r_fecha").value = fechaOriginalSinHora ? `${r.fecha_partido}T00:00` : (r.fecha_partido || "");
  document.getElementById("r_estado").value = r.estado;
  document.getElementById("r_fecha_retrasado").value = r.fecha_partido_retrasado || "";
  rUbicacion.value = r.ubicacion || "";
  rFlashscore.value = r.flashscore_url || "";
  actualizarCampoFlashscoreYUbicacion();
  actualizarCampoRetrasado();

  resetearBloqueOtroEquipo();
  poblarSelectsEquipo(r.equipo_local, r.equipo_visitante);

  if (rLocalPicker.obtenerValor() === VALOR_OTRO_EQUIPO) {
    rLocalOtroNombre.value = r.equipo_local;
    if (r.escudo_local_url) {
      escudoLocalOtroUrl = r.escudo_local_url;
      rLocalOtroPreview.innerHTML = `<img src="${r.escudo_local_url}" alt="" loading="lazy"> Escudo ya subido`;
    }
  }
  if (rVisitantePicker.obtenerValor() === VALOR_OTRO_EQUIPO) {
    rVisitanteOtroNombre.value = r.equipo_visitante;
    if (r.escudo_visitante_url) {
      escudoVisitanteOtroUrl = r.escudo_visitante_url;
      rVisitanteOtroPreview.innerHTML = `<img src="${r.escudo_visitante_url}" alt="" loading="lazy"> Escudo ya subido`;
    }
  }

  document.getElementById("r_goles_local").value = r.goles_local ?? "";
  document.getElementById("r_goles_visitante").value = r.goles_visitante ?? "";
  actualizarBloqueoGoles();
  actualizarPreviewResultado();
  document.getElementById("btnCancelarResultado").style.display = "inline-block";

  document.getElementById("bloqueEventosPartido").style.display = "block";
  cargarEventosPartido(r.id);
  cancelarEdicionEvento();

  document.getElementById("bloqueTandaPenaltis").style.display = "block";
  cargarTandaPenaltis(r.id);
  cancelarEdicionTandaPenaltis();

  document.getElementById("bloqueAlineacionesResultado").style.display = "block";
  cargarAlineacionesResultado(r.id);

  // La importación rápida de eventos (alineaciones + goles + tarjetas
  // pegados de una crónica, o el minuto a minuto de Flashscore) solo
  // se muestra aquí, dentro de la ficha de este partido ya guardado:
  // para importarle eventos hay que entrar primero en él desde "Ver
  // resultados", así el partido de destino ya se conoce y no hace
  // falta "encontrarlo" a partir del texto pegado.
  const bloqueImportEventos = document.getElementById("bloqueImportacionRapidaEventos");
  if (bloqueImportEventos) bloqueImportEventos.style.display = "block";
  if (typeof fijarResultadoImportacionRapidaEventos === "function") fijarResultadoImportacionRapidaEventos(r);
  document.getElementById("importEventosResultadoAnalisis")?.style && (document.getElementById("importEventosResultadoAnalisis").style.display = "none");
  document.getElementById("importEventosResultadoFinal")?.style && (document.getElementById("importEventosResultadoFinal").style.display = "none");
  const importEventosTextarea = document.getElementById("importEventosTexto");
  if (importEventosTextarea) importEventosTextarea.value = "";
  const importEventosContador = document.getElementById("importEventosContador");
  if (importEventosContador) importEventosContador.textContent = "";

  document.getElementById("bloqueMvpResultado").style.display = "block";
  cargarMvpResultado(r);

  // El botón para abrir el panel de Minuto a Minuto desde el propio
  // formulario de edición: antes solo se configuraba justo después de
  // GUARDAR el formulario, así que si se entraba a "Editar" un partido
  // ya existente desde la lista (el caso normal), el botón se quedaba
  // oculto (o sin el onclick actualizado) y parecía que el clic no
  // hacía nada. Mismo criterio que en la lista de resultados: solo
  // tiene sentido si el partido no está finalizado y es el día del
  // partido (con margen).
  const btnMaM = document.getElementById("btnAbrirMinutoAMinutoDesdeForm");
  const puedeAbrirMaM = r.estado !== "finalizado" && dentroDelDiaDelPartidoFrontend(r.fecha_partido);
  btnMaM.style.display = puedeAbrirMaM ? "inline-block" : "none";
  btnMaM.onclick = () => abrirPanelMinutoAMinuto(r.id);

  window.scrollTo(0, 0);
}

// ---------- RESULTADOS: goles y tarjetas del partido ----------
const ETIQUETAS_EVENTO = {
  gol: "Gol",
  gol_pp: "Gol en propia puerta",
  gol_var: "Gol anulado (VAR)",
  amarilla: "Tarjeta amarilla",
  doble_amarilla: "Doble amarilla",
  roja: "Tarjeta roja",
  cambio: "Cambio",
  penalti_fallado: "Penalti fallado",
  var: "Revisión VAR",
  nota: "Nota",
  pausa_hidratacion: "Pausa de hidratación",
  inicio_partido: "Comienza el partido",
  descanso: "Descanso",
  fin_descanso: "Comienza la segunda parte",
  fin_pausa_hidratacion: "Se reanuda el partido",
  partido_retrasado: "Partido retrasado",
  partido_anulado: "Partido anulado",
  fin_partido: "Final del partido",
  otro: "Otra incidencia",
};

function iconoEvento(tipo) {
  if (tipo === "gol" || tipo === "gol_var" || tipo === "gol_pp") {
    const tachado = tipo === "gol_var" ? `<line x1="4" y1="20" x2="20" y2="4" stroke="var(--rojo)" stroke-width="2"/>` : "";
    return `<svg class="ev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 6.5l4 3-1.5 4.5h-5L8 9.5z"/>${tachado}</svg>`;
  }
  if (tipo === "cambio") {
    return `<svg class="ev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 7h11l-3-3M7 7l3 3" stroke="#1a9e4f"/>
      <path d="M17 17H6l3 3M17 17l-3-3" stroke="var(--rojo)"/>
    </svg>`;
  }
  if (tipo === "nota") {
    return `<svg class="ev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 4h9l3 3v13H6z"/><path d="M9 9h7M9 13h7M9 17h4"/>
    </svg>`;
  }
  // Silbato: arranque del partido y reanudaciones (segunda parte y
  // vuelta de la pausa de hidratación) -- el árbitro pita para que se
  // vuelva a jugar.
  if (tipo === "inicio_partido" || tipo === "fin_descanso" || tipo === "fin_pausa_hidratacion") {
    return `<svg class="ev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 10h6.5a3 3 0 1 1 0 6H9a4 4 0 1 1 0-8h1"/>
      <circle cx="9" cy="13" r="1.4" fill="currentColor" stroke="none"/>
      <path d="M4.5 8.5l2 2.5"/>
    </svg>`;
  }
  // Reloj de arena: paradas del juego (descanso y final del partido) --
  // el tiempo se detiene.
  if (tipo === "descanso" || tipo === "fin_partido") {
    return `<svg class="ev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 3h10M7 21h10"/>
      <path d="M7 3c0 4 3.5 5 5 6-1.5 1-5 2-5 6M17 3c0 4-3.5 5-5 6 1.5 1 5 2 5 6"/>
    </svg>`;
  }
  // Gota de agua: pausa de hidratación.
  if (tipo === "pausa_hidratacion") {
    return `<svg class="ev-icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0C6.5 10 9 7 12 3z"/>
    </svg>`;
  }
  const color = tipo === "roja" ? "var(--rojo)" : "#e8b923";
  const doble = tipo === "doble_amarilla";
  return `<svg class="ev-icono" viewBox="0 0 24 24">
    ${doble ? `<rect x="3" y="4" width="8" height="12" rx="1.5" fill="#e8b923" transform="rotate(-8 7 10)"/>` : ""}
    <rect x="${doble ? 11 : 7}" y="4" width="8" height="12" rx="1.5" fill="${color}" transform="rotate(8 ${doble ? 15 : 11} 10)"/>
  </svg>`;
}

function formatMinutoEvento(ev) {
  return ev.minuto_extra ? `${ev.minuto}+${ev.minuto_extra}'` : `${ev.minuto}'`;
}

// resultado_id del partido cuyos eventos se están gestionando ahora
// mismo (null si no se ha abierto ninguna edición de resultado todavía).
let EVENTOS_PARTIDO_CACHE = {};

// Orden original del evento que se está editando ahora mismo en el
// formulario (0 si se está creando uno nuevo o si el evento no lo
// llevaba). Se guarda aparte porque el formulario no tiene un input
// visible para ello: solo sirve para que, al guardar los cambios, el
// evento no pierda el desempate que tuviera dentro de su mismo minuto
// (p.ej. "Comienza la 2ª parte" debe seguir quedando después de
// "Descanso" aunque se corrija el nombre del jugador o el minuto).
let EVENTO_PARTIDO_EDITANDO_ORDEN = 0;

// Alineaciones (local/visitante) del partido cuyos eventos se están
// gestionando, con los cambios ya registrados aplicados encima -mismo
// cálculo que en la web pública, ver alineacionesConCambiosAplicados en
// config.js-, para poder ofrecer en el desplegable de "Sale" solo a
// quien esté AHORA MISMO en el campo (no a alguien que ya salió antes).
let EVENTOS_PARTIDO_ALINEACIONES = [];

// Resultado (partido) completo cuyos eventos se están gestionando ahora
// mismo desde el panel de Resultados (estado, cronómetro...). Se
// mantiene sincronizado tras cada acción que toque el cronómetro/estado
// (inicio, descanso, retrasado, anulado...) para poder encadenar varias
// acciones seguidas sin tener que recargar la página. Ver
// actualizarEstadoCronometroDesdeEventoResultado().
let EVENTOS_PARTIDO_RESULTADO_OBJ = null;

async function cargarEventosPartido(resultadoId) {
  EVENTOS_PARTIDO_RESULTADO_ID = resultadoId;
  const cont = document.getElementById("listaEventosPartido");
  cont.innerHTML = "<p class='sin-eventos-partido'>Cargando...</p>";
  try {
    const { eventos = [] } = await apiFetch(`/api/results/${resultadoId}/eventos`);
    EVENTOS_PARTIDO_CACHE = {};
    eventos.forEach((ev) => { EVENTOS_PARTIDO_CACHE[ev.id] = ev; });
    renderEventosPartido(eventos);
    await cargarAlineacionesParaSelectorCambio(resultadoId, eventos);
  } catch (err) {
    cont.innerHTML = `<p class="sin-eventos-partido">Error cargando eventos: ${err.message}</p>`;
  }
}

// Refresca EVENTOS_PARTIDO_RESULTADO_OBJ pidiendo el resultado actual al
// backend, para no operar con datos de cronómetro/estado desfasados si
// ha pasado tiempo entre que se abrió la ficha y que se registra un
// evento especial (inicio, descanso...). Si falla, se sigue con lo que
// ya hubiera en memoria.
async function refrescarResultadoParaEventosPartido() {
  if (!EVENTOS_PARTIDO_RESULTADO_ID) return;
  try {
    const { resultado } = await apiFetch(`/api/results/${EVENTOS_PARTIDO_RESULTADO_ID}`);
    if (resultado) EVENTOS_PARTIDO_RESULTADO_OBJ = resultado;
  } catch { /* seguimos con los datos que ya teníamos */ }
}

// Carga la alineación guardada del partido y calcula quién está
// actualmente en el campo (titulares menos quien ya salió por un
// cambio anterior, más quien ya entró), para sugerirlos como opciones
// en el campo "Sale" del formulario de eventos (datalist). Si el
// partido no tiene ninguna alineación guardada todavía, no hay
// sugerencias, pero el campo sigue siendo de texto libre y se puede
// escribir el nombre igualmente.
async function cargarAlineacionesParaSelectorCambio(resultadoId, eventos) {
  try {
    const { resultado } = await apiFetch(`/api/results/${resultadoId}`);
    const alineaciones = (resultado && resultado.alineaciones) || [];
    EVENTOS_PARTIDO_ALINEACIONES = alineacionesConCambiosAplicados(alineaciones, eventos, resultado?.estado || "en_juego");
  } catch (err) {
    EVENTOS_PARTIDO_ALINEACIONES = [];
  }
  try {
    actualizarSelectorSaleCambio();
  } catch (err) {
    // No dejamos que un fallo aquí (p.ej. datos de alineación con forma
    // inesperada) tire abajo todo el panel de eventos: en el peor caso
    // el desplegable "Sale" queda vacío, pero se puede seguir editando
    // eventos con los campos de texto libre.
    console.error("Error rellenando el selector de 'Sale' para cambios:", err);
  }
}

// Rellena <datalist id="ev_sale_lista"> con los titulares en el campo
// AHORA MISMO del equipo elegido arriba (local/visitante), como
// sugerencias para el campo de texto libre "ev_sale". Se reconstruye
// cada vez que cambia el equipo o el tipo de evento seleccionados, y
// también justo después de guardar un cambio (para reflejar la nueva
// alineación en las propias sugerencias sin tener que reabrir el
// modal). El campo sigue siendo de texto libre en todo momento: si el
// partido no tiene ninguna alineación guardada, o el jugador que sale
// no está en ella, se puede escribir su nombre a mano igualmente.
function actualizarSelectorSaleCambio() {
  const datalist = document.getElementById("ev_sale_lista");
  if (!datalist) return;
  const equipo = document.getElementById("ev_equipo").value;
  const alineacion = EVENTOS_PARTIDO_ALINEACIONES[equipo === "local" ? 0 : 1];
  const titulares = alineacion ? (alineacion.jugadores || []).filter((j) => j.titular !== false) : [];
  datalist.innerHTML = titulares.map((j) => {
    const valor = combinarDorsalYJugador(j.dorsal ?? "", j.nombre || "");
    return `<option value="${escapeHtml(valor)}">${j.dorsal ? j.dorsal + " · " : ""}${escapeHtml(j.nombre || "(sin nombre)")}</option>`;
  }).join("");
}
document.getElementById("ev_equipo")?.addEventListener("change", actualizarSelectorSaleCambio);

function renderEventosPartido(eventos) {
  const cont = document.getElementById("listaEventosPartido");
  if (!eventos.length) {
    cont.innerHTML = `<p class="sin-eventos-partido">Todavía no se ha añadido ningún gol ni tarjeta.</p>`;
    return;
  }
  cont.innerHTML = eventos.map(ev => `
    <div class="evento-partido-item">
      ${iconoEvento(ev.tipo)}
      <span class="ev-minuto">${formatMinutoEvento(ev)}</span>
      <span class="ev-detalle">
        ${ev.tipo === "nota"
          ? escapeHtml(ev.jugador || "")
          : `${escapeHtml(ETIQUETAS_EVENTO[ev.tipo] || ev.tipo)}${ev.tipo === "cambio"
              ? `${ev.jugador ? " — Entra: " + escapeHtml(ev.jugador) : ""}${ev.jugador_asistencia ? " · Sale: " + escapeHtml(ev.jugador_asistencia) : ""}`
              : `${ev.jugador ? " — " + escapeHtml(ev.jugador) : ""}${ev.jugador_asistencia ? " (asist. " + escapeHtml(ev.jugador_asistencia) + ")" : ""}`}`}
        ${ev.tipo !== "nota" && (ev.equipo === "local" || ev.equipo === "visitante")
          ? `<span class="ev-equipo-tag">${ev.equipo === "local" ? "Local" : "Visitante"}${ev.tipo === "gol_pp" ? " (gol para el rival)" : ""}</span>`
          : ""}
      </span>
      <span class="ev-acciones">
        <button type="button" data-accion="editar-evento" data-id="${ev.id}">Editar</button>
        <button type="button" class="ev-eliminar" data-accion="eliminar-evento" data-id="${ev.id}">Eliminar</button>
      </span>
    </div>`).join("");
}

document.getElementById("listaEventosPartido").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-accion]");
  if (!btn) return;
  const evento = EVENTOS_PARTIDO_CACHE[btn.dataset.id];
  if (!evento) return;
  if (btn.dataset.accion === "editar-evento") cargarEventoEnFormulario(evento);
  else if (btn.dataset.accion === "eliminar-evento") eliminarEventoPartido(evento.id);
});

// El campo "jugador" que guarda el backend es un único TEXT; aquí lo
// combinamos a partir de dos inputs separados (dorsal y nombre) para
// que se pueda rellenar solo uno de los dos o ambos. Formato guardado:
// "9 · Rodrigo" (los dos), "9" (solo dorsal) o "Rodrigo" (solo nombre).
function combinarDorsalYJugador(dorsal, nombre) {
  const d = String(dorsal ?? "").trim();
  const n = String(nombre ?? "").trim();
  if (d && n) return `${d} · ${n}`;
  return d || n || null;
}

// Inverso de combinarDorsalYJugador: separa el texto guardado en
// {dorsal, nombre} para repoblar los dos inputs al editar un evento. Si
// no hay separador " · ", asume que es solo dorsal (si es numérico) o
// solo nombre.
function separarDorsalYJugador(jugador) {
  if (!jugador) return { dorsal: "", nombre: "" };
  const partes = jugador.split(" · ");
  if (partes.length === 2) return { dorsal: partes[0], nombre: partes[1] };
  return /^\d+$/.test(jugador.trim()) ? { dorsal: jugador.trim(), nombre: "" } : { dorsal: "", nombre: jugador };
}

// El campo de asistencia solo tiene sentido para goles a favor (normales
// o anulados por VAR), no para un gol en propia puerta (no hay
// asistencia posible ahí). El aviso de "el gol sumará al rival" solo se
// muestra para "gol_pp". Para "cambio" se reutiliza el mismo hueco del
// formulario pero con otro input de texto libre (ev_sale, en vez de
// ev_asistencia) con sugerencias (datalist) de los titulares en el
// campo si hay alineación guardada: así, cuando el nombre coincide con
// el de la alineación, el once "en vivo" se actualiza bien (ver
// alineacionesConCambiosAplicados en config.js), pero si el partido no
// tiene alineación guardada, o el jugador que sale no aparece en ella,
// se puede escribir su nombre igualmente a mano. "Jugador" pasa a
// significar "quien entra" y las etiquetas de los inputs cambian para
// dejarlo claro.
// Tipos que no llevan equipo ni jugador (igual que MAM_TIPOS_SIN_EQUIPO
// en minuto-a-minuto.js): son eventos "de partido", no de un jugador
// concreto. "otro" se etiqueta con texto libre (como "nota"); el resto
// son eventos fijos sin texto propio.
// Nota: "var" (revisión VAR) SÍ lleva equipo para el backend (ver
// TIPOS_EVENTO_SIN_EQUIPO en worker/src/index.js, que no lo incluye),
// aunque el botón "VAR" de Minuto a Minuto lo dispara sin selector de
// equipo visible; se deja aquí con equipo, como el resto de eventos de
// jugador, para no heredar ese caso sin cubrir.
const TIPOS_EVENTO_SIN_EQUIPO = [
  "inicio_partido", "descanso", "fin_descanso",
  "pausa_hidratacion", "fin_pausa_hidratacion",
  "partido_retrasado", "partido_anulado",
  "fin_partido", "otro",
];

// De los anteriores, los que además arrancan/pausan/reanudan el
// cronómetro o cambian el estado del partido (mismo comportamiento que
// sus botones equivalentes en el panel de Minuto a Minuto), en vez de
// ser un simple apunte en el timeline. Para estos, el minuto no lo
// elige el redactor: se calcula solo (ver
// actualizarEstadoCronometroDesdeEventoResultado).
const TIPOS_EVENTO_SIN_EQUIPO_QUE_TOCAN_CRONOMETRO = [
  "inicio_partido", "descanso", "fin_descanso",
  "pausa_hidratacion", "fin_pausa_hidratacion",
  "partido_retrasado", "partido_anulado", "fin_partido",
];

const AVISOS_CRONOMETRO_EVENTO = {
  inicio_partido: "Arranca el cronómetro del partido (minuto 0) y lo pone \"En juego\", igual que en Minuto a Minuto.",
  descanso: "Pausa el cronómetro en el minuto 45 (+ el añadido que indiques abajo).",
  fin_descanso: "Reanuda el cronómetro desde donde se pausó en el descanso.",
  pausa_hidratacion: "Pausa el cronómetro en el minuto en vivo actual.",
  fin_pausa_hidratacion: "Reanuda el cronómetro desde donde se pausó la hidratación.",
  partido_retrasado: "Marca el partido como \"Retrasado\" a la nueva hora que indiques abajo. El cronómetro no se toca.",
  partido_anulado: "Pausa el cronómetro (si estaba en marcha) y marca el partido como \"Anulado\".",
  fin_partido: "Pausa el cronómetro y marca el partido como \"Finalizado\".",
};

function actualizarVisibilidadAsistencia() {
  const tipo = document.getElementById("ev_tipo").value;
  const esGol = tipo === "gol" || tipo === "gol_var";
  const esGolPP = tipo === "gol_pp";
  const esGolVar = tipo === "gol_var";
  const esCambio = tipo === "cambio";
  const esNota = tipo === "nota";
  const esOtro = tipo === "otro";
  const esTextoLibre = esNota || esOtro;
  const esSinEquipoNiJugador = TIPOS_EVENTO_SIN_EQUIPO.includes(tipo);
  const esDescansoOFinal = tipo === "descanso" || tipo === "fin_partido";
  const esRetrasado = tipo === "partido_retrasado";
  document.getElementById("ev_asistencia_wrap").style.display = (esGol || esCambio) ? "flex" : "none";
  document.getElementById("ev_asistencia").style.display = esCambio ? "none" : "block";
  document.getElementById("ev_sale").style.display = esCambio ? "block" : "none";
  if (!esGol) document.getElementById("ev_asistencia").value = "";
  if (!esCambio) document.getElementById("ev_sale").value = "";
  document.getElementById("ev_ayuda_pp").style.display = esGolPP ? "block" : "none";
  document.getElementById("ev_ayuda_cambio").style.display = esCambio ? "block" : "none";
  document.getElementById("ev_dorsal_label").textContent = "Dorsal";
  document.getElementById("ev_jugador_label").textContent = esCambio ? "Entra" : "Jugador";
  document.getElementById("ev_asistencia_label").textContent = esCambio ? "Sale" : "Asistencia";
  // Una nota (o "Otra incidencia") es un apunte libre sin equipo ni
  // jugador asociado: se oculta todo eso y se muestra solo el textarea
  // de texto. El resto de tipos "sin equipo" (inicio, descanso,
  // retrasado...) son eventos fijos sin texto propio.
  document.getElementById("ev_equipo_wrap").style.display = esSinEquipoNiJugador ? "none" : "block";
  document.getElementById("ev_dorsal_wrap").style.display = esSinEquipoNiJugador ? "none" : "block";
  document.getElementById("ev_jugador_wrap").style.display = esSinEquipoNiJugador ? "none" : "block";
  document.getElementById("ev_nota_wrap").style.display = esTextoLibre ? "block" : "none";
  document.getElementById("ev_nota_label").textContent = esOtro ? "Descripción de la incidencia" : "Nota";
  document.getElementById("ev_nota").placeholder = esOtro
    ? "Ej. Cambio de árbitro, incidencia en la grada..."
    : "Comentario o apunte sobre el minuto (no suma gol ni tarjeta)";
  document.getElementById("ev_ayuda_nota").style.display = esNota ? "block" : "none";
  // Solo en "Gol anulado (VAR)" se ofrece la opción de bajar el
  // marcador, igual que en el modal de Minuto a Minuto.
  document.getElementById("ev_bajar_gol_wrap").style.display = esGolVar ? "flex" : "none";
  if (!esGolVar) document.getElementById("ev_bajar_gol").checked = false;
  // El tiempo añadido solo se pide para "Descanso" y "Final del
  // partido": son los dos momentos en los que el cronómetro se pausa
  // pero el minuto que se guarda en el timeline es el reglamentario
  // (45' o el minuto de pitido final) más ese añadido, no el minuto
  // real del cronómetro en ese instante (ver mamPitarDescanso /
  // mamPitarFinal en minuto-a-minuto.js).
  document.getElementById("ev_anadido_wrap").style.display = esDescansoOFinal ? "block" : "none";
  if (!esDescansoOFinal) document.getElementById("ev_anadido").value = "";
  // "Partido retrasado" pide la nueva hora prevista de inicio.
  document.getElementById("ev_nueva_hora_wrap").style.display = esRetrasado ? "block" : "none";
  if (!esRetrasado) document.getElementById("ev_nueva_hora").value = "";
  // El minuto se calcula automáticamente (minuto en vivo real, o 0/45
  // según el tipo) para todos los eventos "sin equipo" que tocan el
  // cronómetro, igual que en Minuto a Minuto: se oculta el campo para
  // no dar a entender que aquí se puede elegir un minuto arbitrario.
  const tocaCronometro = TIPOS_EVENTO_SIN_EQUIPO_QUE_TOCAN_CRONOMETRO.includes(tipo);
  const evMinuto = document.getElementById("ev_minuto");
  evMinuto.closest(".row-evento > div").style.display = tocaCronometro ? "none" : "block";
  // El campo lleva "required" en el HTML; si se oculta para un tipo que
  // calcula el minuto solo, hay que quitarle el "required" o el propio
  // navegador bloquearía el submit del formulario al estar vacío pero
  // no visible.
  evMinuto.required = !tocaCronometro;
  // El campo "Descuento" (ev_minuto_extra) es el minuto_extra que el
  // redactor teclea a mano para un evento normal (gol, tarjeta...). Para
  // los tipos que tocan el cronómetro ("Descanso" y "Final del
  // partido") el añadido NO se pide aquí, sino en el campo específico
  // "Minutos de tiempo añadido" (ev_anadido, ver ev_anadido_wrap más
  // abajo): si no se ocultaba también este, se veían los dos campos de
  // añadido a la vez (uno con la etiqueta "Descuento" y otro con
  // "Minutos de tiempo añadido"), duplicados y confusos.
  const evMinutoExtra = document.getElementById("ev_minuto_extra");
  evMinutoExtra.closest(".row-evento > div").style.display = tocaCronometro ? "none" : "block";
  if (tocaCronometro) evMinutoExtra.value = "";
  const avisoCron = document.getElementById("ev_ayuda_cronometro");
  avisoCron.style.display = tocaCronometro ? "block" : "none";
  avisoCron.textContent = AVISOS_CRONOMETRO_EVENTO[tipo] || "";
  if (esSinEquipoNiJugador) {
    document.getElementById("ev_dorsal").value = "";
    document.getElementById("ev_jugador").value = "";
  }
  if (!esTextoLibre) {
    document.getElementById("ev_nota").value = "";
  }
  if (esCambio) actualizarSelectorSaleCambio();
}
document.getElementById("ev_tipo").addEventListener("change", actualizarVisibilidadAsistencia);

function cargarEventoEnFormulario(ev) {
  document.getElementById("ev_id").value = ev.id;
  EVENTO_PARTIDO_EDITANDO_ORDEN = ev.orden ?? 0;
  document.getElementById("ev_equipo").value = ev.equipo;
  document.getElementById("ev_tipo").value = ev.tipo;
  document.getElementById("ev_minuto").value = ev.minuto;
  document.getElementById("ev_minuto_extra").value = ev.minuto_extra ?? "";
  if (ev.tipo === "nota" || ev.tipo === "otro") {
    document.getElementById("ev_nota").value = ev.jugador || "";
    document.getElementById("ev_dorsal").value = "";
    document.getElementById("ev_jugador").value = "";
  } else {
    const { dorsal, nombre } = separarDorsalYJugador(ev.jugador);
    document.getElementById("ev_dorsal").value = dorsal;
    document.getElementById("ev_jugador").value = nombre;
  }
  document.getElementById("ev_asistencia").value = ev.jugador_asistencia || "";
  actualizarVisibilidadAsistencia();
  if (ev.tipo === "cambio") document.getElementById("ev_sale").value = ev.jugador_asistencia || "";
  document.querySelector("#formEventoPartido .btn-anadir-evento").textContent = "Guardar cambios del evento";
  document.getElementById("btnCancelarEvento").style.display = "inline-block";
}

function cancelarEdicionEvento() {
  document.getElementById("formEventoPartido").reset();
  document.getElementById("ev_id").value = "";
  EVENTO_PARTIDO_EDITANDO_ORDEN = 0;
  document.getElementById("ev_equipo").value = "local";
  document.getElementById("ev_tipo").value = "gol";
  actualizarVisibilidadAsistencia();
  document.querySelector("#formEventoPartido .btn-anadir-evento").textContent = "Añadir evento";
  document.getElementById("btnCancelarEvento").style.display = "none";
}
document.getElementById("btnCancelarEvento").addEventListener("click", cancelarEdicionEvento);

document.getElementById("formEventoPartido").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!EVENTOS_PARTIDO_RESULTADO_ID) return;
  const id = document.getElementById("ev_id").value;
  const tipoEvento = document.getElementById("ev_tipo").value;
  const esNota = tipoEvento === "nota";
  const esOtro = tipoEvento === "otro";
  const esTextoLibre = esNota || esOtro;
  const esSinEquipoNiJugador = TIPOS_EVENTO_SIN_EQUIPO.includes(tipoEvento);
  // Los tipos que tocan el cronómetro/estado (ver
  // TIPOS_EVENTO_SIN_EQUIPO_QUE_TOCAN_CRONOMETRO) calculan ellos mismos
  // el minuto (0, 45, el minuto en vivo real...), igual que sus botones
  // equivalentes en Minuto a Minuto: el campo "Minuto" del formulario
  // queda oculto para esos tipos y no se usa. Esto solo aplica al CREAR
  // el evento (id vacío): al editar uno ya existente se respeta el
  // minuto que tenga, sin volver a tocar el cronómetro.
  const tocaCronometro = !id && TIPOS_EVENTO_SIN_EQUIPO_QUE_TOCAN_CRONOMETRO.includes(tipoEvento);

  let minutoForzado = null;
  let minutoExtraForzado = null;
  let ordenForzado = null;
  if (tocaCronometro) {
    const resultadoAccion = await actualizarEstadoCronometroDesdeEventoResultado(tipoEvento);
    if (!resultadoAccion.ok) return; // abortado o error ya avisado
    minutoForzado = resultadoAccion.minutoForzado ?? 0;
    minutoExtraForzado = resultadoAccion.minutoExtraForzado ?? null;
    ordenForzado = resultadoAccion.orden ?? null;
  }

  const minutoStr = document.getElementById("ev_minuto").value;
  if (!tocaCronometro && minutoStr === "") return EOF.toast("Falta el minuto del evento", "error");
  if (esTextoLibre && !document.getElementById("ev_nota").value.trim()) {
    return EOF.toast(esOtro ? "Escribe la descripción de la incidencia" : "Escribe el texto de la nota", "error");
  }
  const body = {
    equipo: esSinEquipoNiJugador ? "ninguno" : document.getElementById("ev_equipo").value,
    tipo: tipoEvento,
    minuto: tocaCronometro ? minutoForzado : parseInt(minutoStr, 10),
    minuto_extra: tocaCronometro
      ? minutoExtraForzado
      : (document.getElementById("ev_minuto_extra").value === "" ? null : parseInt(document.getElementById("ev_minuto_extra").value, 10)),
    jugador: esTextoLibre
      ? document.getElementById("ev_nota").value.trim()
      : (esSinEquipoNiJugador ? null : combinarDorsalYJugador(document.getElementById("ev_dorsal").value, document.getElementById("ev_jugador").value)),
    jugador_asistencia: tipoEvento === "cambio"
      ? (document.getElementById("ev_sale").value || null)
      : (["gol", "gol_var"].includes(tipoEvento) ? (document.getElementById("ev_asistencia").value.trim() || null) : null),
    // Solo aplica a "gol_var": si el gol ya se había sumado al marcador
    // antes de la revisión, el backend resta un gol al equipo del evento.
    bajar_gol: tipoEvento === "gol_var" ? document.getElementById("ev_bajar_gol").checked : false,
    // Al editar se conserva el "orden" que ya tuviera el evento (ver
    // EVENTO_PARTIDO_EDITANDO_ORDEN); al crear uno nuevo se deja en 0
    // salvo que la acción de cronómetro haya forzado otro (p.ej.
    // "Comienza la 2ª parte" siempre por detrás de "Descanso").
    orden: id ? EVENTO_PARTIDO_EDITANDO_ORDEN : (ordenForzado ?? 0),
  };
  try {
    if (id) {
      await apiFetch(`/api/results/${EVENTOS_PARTIDO_RESULTADO_ID}/eventos/${id}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      await apiFetch(`/api/results/${EVENTOS_PARTIDO_RESULTADO_ID}/eventos`, { method: "POST", body: JSON.stringify(body) });
    }
    cancelarEdicionEvento();
    await cargarEventosPartido(EVENTOS_PARTIDO_RESULTADO_ID);
    // Refresca el objeto de resultado (marcador, estado, cronómetro...)
    // por si la cabecera del formulario de arriba muestra alguno de
    // esos datos, para que quede coherente con lo que se acaba de hacer.
    await refrescarResultadoParaEventosPartido();
    if (typeof actualizarPreviewResultado === "function") actualizarPreviewResultado();
    EOF.toast(`${ETIQUETAS_EVENTO[tipoEvento] || tipoEvento} registrado${tocaCronometro ? ` (${formatMinutoEvento({ minuto: minutoForzado, minuto_extra: minutoExtraForzado })})` : ""}`, "exito");
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
});

async function eliminarEventoPartido(eventoId) {
  if (!EVENTOS_PARTIDO_RESULTADO_ID) return;
  if (!(await EOF.confirmar("¿Seguro que quieres eliminar este evento?", { peligroso: true, textoConfirmar: "Eliminar" }))) return;
  try {
    await apiFetch(`/api/results/${EVENTOS_PARTIDO_RESULTADO_ID}/eventos/${eventoId}`, { method: "DELETE" });
    await cargarEventosPartido(EVENTOS_PARTIDO_RESULTADO_ID);
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

// ---------- RESULTADOS: tanda de penaltis ----------
// Reutiliza la misma tabla match_events, con los tipos "penalti_marcado"
// y "penalti_fallado_tanda". A diferencia del resto de eventos, aquí
// "minuto" es el número de orden del lanzamiento (1º, 2º, 3º...), no un
// minuto real de partido, y no hace falta elegir jugador/dorsal para
// visualizarlo salvo que se quiera. El backend recalcula solo
// penaltis_local/penaltis_visitante a partir de estos eventos (ver
// recalcularPenaltisDesdeEventos en el Worker), igual que hace con el
// marcador normal a partir de los goles.
let TANDA_PENALTIS_CACHE = {};

async function cargarTandaPenaltis(resultadoId) {
  const cont = document.getElementById("listaTandaPenaltis");
  cont.innerHTML = "<p class='sin-eventos-partido'>Cargando...</p>";
  try {
    const { eventos = [] } = await apiFetch(`/api/results/${resultadoId}/eventos`);
    const lanzamientos = eventos.filter(ev => ev.tipo === "penalti_marcado" || ev.tipo === "penalti_fallado_tanda");
    TANDA_PENALTIS_CACHE = {};
    lanzamientos.forEach((ev) => { TANDA_PENALTIS_CACHE[ev.id] = ev; });
    renderTandaPenaltis(lanzamientos);
  } catch (err) {
    cont.innerHTML = `<p class="sin-eventos-partido">Error cargando la tanda: ${err.message}</p>`;
  }
}

function renderTandaPenaltis(lanzamientos) {
  const cont = document.getElementById("listaTandaPenaltis");
  if (!lanzamientos.length) {
    cont.innerHTML = `<p class="sin-eventos-partido">Todavía no se ha añadido ningún lanzamiento.</p>`;
    return;
  }
  const ordenados = [...lanzamientos].sort((a, b) => a.minuto - b.minuto);
  cont.innerHTML = ordenados.map(ev => {
    const marcado = ev.tipo === "penalti_marcado";
    return `
    <div class="evento-partido-item">
      <span class="ev-icono-penalti ${marcado ? "ev-penalti-marcado" : "ev-penalti-fallado"}">${marcado ? "✓" : "✕"}</span>
      <span class="ev-minuto">${ev.minuto}º</span>
      <span class="ev-detalle">
        ${marcado ? "Marcado" : "Fallado / parado"}${ev.jugador ? " — " + escapeHtml(ev.jugador) : ""}
        <span class="ev-equipo-tag">${ev.equipo === "local" ? "Local" : "Visitante"}</span>
      </span>
      <span class="ev-acciones">
        <button type="button" data-accion="editar-penalti" data-id="${ev.id}">Editar</button>
        <button type="button" class="ev-eliminar" data-accion="eliminar-penalti" data-id="${ev.id}">Eliminar</button>
      </span>
    </div>`;
  }).join("");
}

document.getElementById("listaTandaPenaltis").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-accion]");
  if (!btn) return;
  const lanzamiento = TANDA_PENALTIS_CACHE[btn.dataset.id];
  if (!lanzamiento) return;
  if (btn.dataset.accion === "editar-penalti") cargarTandaPenaltiEnFormulario(lanzamiento);
  else if (btn.dataset.accion === "eliminar-penalti") eliminarTandaPenalti(lanzamiento.id);
});

function cargarTandaPenaltiEnFormulario(ev) {
  document.getElementById("pen_id").value = ev.id;
  document.getElementById("pen_equipo").value = ev.equipo;
  document.getElementById("pen_resultado").value = ev.tipo;
  document.getElementById("pen_orden").value = ev.minuto;
  const { dorsal, nombre } = separarDorsalYJugador(ev.jugador);
  document.getElementById("pen_dorsal").value = dorsal;
  document.getElementById("pen_jugador").value = nombre;
  document.querySelector("#formTandaPenaltis .btn-anadir-evento").textContent = "Guardar cambios del lanzamiento";
  document.getElementById("btnCancelarTandaPenaltis").style.display = "inline-block";
}

function cancelarEdicionTandaPenaltis() {
  const form = document.getElementById("formTandaPenaltis");
  if (!form) return;
  form.reset();
  document.getElementById("pen_id").value = "";
  document.getElementById("pen_equipo").value = "local";
  document.getElementById("pen_resultado").value = "penalti_marcado";
  document.querySelector("#formTandaPenaltis .btn-anadir-evento").textContent = "Añadir lanzamiento";
  document.getElementById("btnCancelarTandaPenaltis").style.display = "none";
}
document.getElementById("btnCancelarTandaPenaltis").addEventListener("click", cancelarEdicionTandaPenaltis);

document.getElementById("formTandaPenaltis").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!EVENTOS_PARTIDO_RESULTADO_ID) return;
  const id = document.getElementById("pen_id").value;
  const ordenStr = document.getElementById("pen_orden").value;
  if (ordenStr === "") return EOF.toast("Falta el número de lanzamiento", "error");
  const body = {
    equipo: document.getElementById("pen_equipo").value,
    tipo: document.getElementById("pen_resultado").value,
    minuto: parseInt(ordenStr, 10),
    jugador: combinarDorsalYJugador(document.getElementById("pen_dorsal").value, document.getElementById("pen_jugador").value),
  };
  try {
    if (id) {
      await apiFetch(`/api/results/${EVENTOS_PARTIDO_RESULTADO_ID}/eventos/${id}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      await apiFetch(`/api/results/${EVENTOS_PARTIDO_RESULTADO_ID}/eventos`, { method: "POST", body: JSON.stringify(body) });
    }
    cancelarEdicionTandaPenaltis();
    await cargarTandaPenaltis(EVENTOS_PARTIDO_RESULTADO_ID);
    // El marcador de la tanda (penaltis_local/visitante) se recalcula
    // en el backend, pero el input de "Goles local/visitante" de arriba
    // no lo refleja (son campos distintos): no hace falta tocar nada
    // más aquí, solo refrescar la lista de resultados de fondo para que
    // se vea actualizado en la tabla.
    await cargaListaResultados();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
});

async function eliminarTandaPenalti(eventoId) {
  if (!EVENTOS_PARTIDO_RESULTADO_ID) return;
  if (!(await EOF.confirmar("¿Seguro que quieres eliminar este lanzamiento?", { peligroso: true, textoConfirmar: "Eliminar" }))) return;
  try {
    await apiFetch(`/api/results/${EVENTOS_PARTIDO_RESULTADO_ID}/eventos/${eventoId}`, { method: "DELETE" });
    await cargarTandaPenaltis(EVENTOS_PARTIDO_RESULTADO_ID);
    await cargaListaResultados();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

async function eliminarResultado(id) {
  if (!(await EOF.confirmar("¿Seguro que quieres eliminar este resultado?", { peligroso: true, textoConfirmar: "Eliminar" }))) return;
  try {
    await apiFetch(`/api/results/${id}`, { method: "DELETE" });
    cargaListaResultados();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

// Reconstruye el cuerpo mínimo que espera PUT /api/results/:id a partir
// del resultado tal y como está en RESULTADOS_CACHE, para no perder el
// resto de campos (equipos, competición...) al mandar solo el cambio de
// estado. Igual que cuerpoResultadoActualParaPut() en minuto-a-minuto.js,
// pero partiendo de la fila del listado en vez del panel MAM.
function cuerpoResultadoParaPutDesdeLista(r) {
  return {
    competicion: r.competicion, grupo: r.grupo || null, jornada: r.jornada,
    equipo_local: r.equipo_local, equipo_visitante: r.equipo_visitante,
    goles_local: r.goles_local, goles_visitante: r.goles_visitante,
    penaltis_local: r.penaltis_local, penaltis_visitante: r.penaltis_visitante,
    fecha_partido: r.fecha_partido, ubicacion: r.ubicacion,
    flashscore_url: r.flashscore_url,
    escudo_local_url: r.escudo_local_url, escudo_visitante_url: r.escudo_visitante_url,
  };
}

// Marca un partido como "retrasado" directamente desde el panel de
// Resultados, sin tener que entrar al panel de Minuto a Minuto (pensado
// para ir eventando en directo, no para este cambio puntual de estado).
async function retrasarPartidoDesdeLista(r) {
  const actual = r.fecha_partido ? r.fecha_partido.slice(11, 16) : "";
  const nuevaHora = await EOF.preguntar("Nueva hora prevista de inicio (HH:MM):", actual, { placeholder: "Ej. 17:30" });
  if (nuevaHora === null) return; // cancelado
  if (!/^\d{1,2}:\d{2}$/.test(nuevaHora.trim())) {
    return EOF.toast("Formato de hora no válido. Usa HH:MM (ej. 17:30).", "error");
  }
  const fecha = r.fecha_partido ? r.fecha_partido.slice(0, 10) : "";
  const fechaPartidoRetrasado = fecha ? `${fecha}T${nuevaHora.trim().padStart(5, "0")}` : null;
  try {
    await apiFetch(`/api/results/${r.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...cuerpoResultadoParaPutDesdeLista(r), estado: "retrasado", fecha_partido_retrasado: fechaPartidoRetrasado }),
    });
    EOF.toast(`Partido marcado como retrasado a las ${nuevaHora.trim()}`, "exito");
    cargaListaResultados();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

// Calcula el minuto en vivo de un resultado cualquiera (no solo el que
// tenga abierto el panel de Minuto a Minuto), para poder pasarlo al
// pausar el cronómetro al anular un partido desde el listado. panel.html
// no carga partidos.js (con minutoEnVivoPublico), así que se reimplementa
// aquí con la misma lógica que minutoEnVivo() en minuto-a-minuto.js.
function minutoEnVivoDeResultado(r) {
  if (!r) return 0;
  if (r.cronometro_pausado_en !== null && r.cronometro_pausado_en !== undefined) {
    return r.cronometro_pausado_en;
  }
  if (!r.inicio_cronometro_at) return 0;
  let raw = String(r.inicio_cronometro_at).trim();
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(raw)) {
    raw = raw.includes("T") ? raw + "Z" : raw.replace(" ", "T") + "Z";
  }
  const inicio = new Date(raw).getTime();
  if (isNaN(inicio)) return 0;
  const ajuste = Number.isInteger(r.ajuste_cronometro_minutos) ? r.ajuste_cronometro_minutos : 0;
  return Math.max(0, Math.floor((Date.now() - inicio) / 60000) + ajuste);
}

// Ejecuta, para los tipos de evento "sin equipo que tocan el
// cronómetro" (ver TIPOS_EVENTO_SIN_EQUIPO_QUE_TOCAN_CRONOMETRO), la
// misma llamada a POST /api/results/:id/cronometro (y, si aplica, el
// mismo cambio de estado del partido) que su botón equivalente en el
// panel de Minuto a Minuto (mamIniciarPartido, mamPitarDescanso,
// mamComenzarSegundaParte, mamPitarPausaHidratacion,
// mamReanudarTrasHidratacion, mamMarcarRetrasado, mamMarcarAnulado,
// mamPitarFinal), para que el resultado quede exactamente igual se
// registre el evento desde donde se registre.
//
// Devuelve { ok, minutoForzado, minutoExtraForzado, orden } si todo ha
// ido bien (los tres últimos ya listos para pasárselos al body del
// POST /eventos), o { ok: false } si hay que abortar sin crear el
// evento (p.ej. si el cronómetro no se ha podido pausar en el
// servidor, o si el redactor cancela un dato que se le pide).
async function actualizarEstadoCronometroDesdeEventoResultado(tipo) {
  const r = EVENTOS_PARTIDO_RESULTADO_OBJ;
  if (!r) return { ok: false };
  const id = EVENTOS_PARTIDO_RESULTADO_ID;

  const pausar = async (minuto) => {
    try {
      const { resultado } = await apiFetch(`/api/results/${id}/cronometro`, { method: "POST", body: JSON.stringify({ accion: "pausar", minuto }) });
      if (resultado) EVENTOS_PARTIDO_RESULTADO_OBJ = resultado;
      return true;
    } catch (err) {
      EOF.toast("Error al pausar el cronómetro: " + err.message, "error");
      return false;
    }
  };
  const reanudar = async (minutoInicial) => {
    try {
      const { resultado } = await apiFetch(`/api/results/${id}/cronometro`, { method: "POST", body: JSON.stringify({ accion: "iniciar", minuto_inicial: minutoInicial }) });
      if (resultado) EVENTOS_PARTIDO_RESULTADO_OBJ = resultado;
      return true;
    } catch (err) {
      EOF.toast("Error al reanudar el cronómetro: " + err.message, "error");
      return false;
    }
  };
  const cambiarEstado = async (estado, extra = {}) => {
    await apiFetch(`/api/results/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...cuerpoResultadoParaPutDesdeLista(EVENTOS_PARTIDO_RESULTADO_OBJ), estado, ...extra }),
    });
    EVENTOS_PARTIDO_RESULTADO_OBJ.estado = estado;
  };

  if (tipo === "inicio_partido") {
    const yaEstabaEnMarcha = Boolean(r.inicio_cronometro_at);
    try {
      const { resultado } = await apiFetch(`/api/results/${id}/cronometro`, { method: "POST", body: JSON.stringify({ accion: "iniciar" }) });
      if (resultado) EVENTOS_PARTIDO_RESULTADO_OBJ = resultado;
    } catch (err) {
      EOF.toast("Error: " + err.message, "error");
      return { ok: false };
    }
    if (yaEstabaEnMarcha) {
      // El cronómetro ya estaba en marcha (lo arrancó el cron por
      // hora programada): no hay nada que registrar, igual que en MAM.
      EOF.toast("El cronómetro de este partido ya estaba en marcha.", "info");
      return { ok: false };
    }
    return { ok: true, minutoForzado: 0 };
  }

  if (tipo === "descanso") {
    const añadidoTexto = document.getElementById("ev_anadido").value;
    const añadido = añadidoTexto.trim() === "" ? 0 : parseInt(añadidoTexto, 10);
    if (isNaN(añadido) || añadido < 0 || añadido > 15) {
      EOF.toast("El tiempo añadido debe ser un número entre 0 y 15.", "error");
      return { ok: false };
    }
    const ok = await pausar(45 + añadido);
    if (!ok) return { ok: false };
    return { ok: true, minutoForzado: 45, minutoExtraForzado: añadido > 0 ? añadido : null };
  }

  if (tipo === "fin_descanso") {
    const minutoPausado = EVENTOS_PARTIDO_RESULTADO_OBJ.cronometro_pausado_en ?? 45;
    const ok = await reanudar(minutoPausado);
    if (!ok) return { ok: false };
    const añadido = Math.max(0, minutoPausado - 45);
    // "orden: 1" para quedar siempre después de "Descanso" en el
    // timeline si comparten minuto/minuto_extra, igual que en MAM.
    return { ok: true, minutoForzado: 45, minutoExtraForzado: añadido > 0 ? añadido : null, orden: 1 };
  }

  if (tipo === "pausa_hidratacion") {
    const minuto = minutoEnVivoDeResultado(EVENTOS_PARTIDO_RESULTADO_OBJ);
    const ok = await pausar(minuto);
    if (!ok) return { ok: false };
    return { ok: true, minutoForzado: minuto };
  }

  if (tipo === "fin_pausa_hidratacion") {
    const minutoPausado = EVENTOS_PARTIDO_RESULTADO_OBJ.cronometro_pausado_en ?? minutoEnVivoDeResultado(EVENTOS_PARTIDO_RESULTADO_OBJ);
    const ok = await reanudar(minutoPausado);
    if (!ok) return { ok: false };
    return { ok: true, minutoForzado: minutoPausado };
  }

  if (tipo === "partido_retrasado") {
    const nuevaHora = document.getElementById("ev_nueva_hora").value.trim();
    if (!/^\d{1,2}:\d{2}$/.test(nuevaHora)) {
      EOF.toast("Formato de hora no válido. Usa HH:MM (ej. 17:30).", "error");
      return { ok: false };
    }
    const fecha = r.fecha_partido ? r.fecha_partido.slice(0, 10) : "";
    const fechaPartidoRetrasado = fecha ? `${fecha}T${nuevaHora.padStart(5, "0")}` : null;
    try {
      await cambiarEstado("retrasado", { fecha_partido_retrasado: fechaPartidoRetrasado });
    } catch (err) {
      EOF.toast("Error: " + err.message, "error");
      return { ok: false };
    }
    return { ok: true, minutoForzado: 0 };
  }

  if (tipo === "partido_anulado") {
    if (!(await EOF.confirmar("¿Anular este partido? Se marcará como \"Anulado\" y el cronómetro se detendrá.", { peligroso: true, textoConfirmar: "Anular" }))) {
      return { ok: false };
    }
    const minuto = minutoEnVivoDeResultado(EVENTOS_PARTIDO_RESULTADO_OBJ);
    try {
      if (r.estado === "en_juego") await pausar(minuto);
      await cambiarEstado("anulado");
    } catch (err) {
      EOF.toast("Error: " + err.message, "error");
      return { ok: false };
    }
    return { ok: true, minutoForzado: minuto };
  }

  if (tipo === "fin_partido") {
    const añadidoTexto = document.getElementById("ev_anadido").value;
    const añadido = añadidoTexto.trim() === "" ? 0 : parseInt(añadidoTexto, 10);
    if (isNaN(añadido) || añadido < 0 || añadido > 15) {
      EOF.toast("El tiempo añadido debe ser un número entre 0 y 15.", "error");
      return { ok: false };
    }
    if (!(await EOF.confirmar("¿Dar el partido por finalizado? El resultado pasará a estado \"Finalizado\".", { textoConfirmar: "Finalizar" }))) {
      return { ok: false };
    }
    const minuto = minutoEnVivoDeResultado(EVENTOS_PARTIDO_RESULTADO_OBJ);
    const ok = await pausar(minuto);
    if (!ok) return { ok: false };
    try {
      await cambiarEstado("finalizado");
    } catch (err) {
      EOF.toast("Error: " + err.message, "error");
      return { ok: false };
    }
    return { ok: true, minutoForzado: minuto, minutoExtraForzado: añadido > 0 ? añadido : null };
  }

  return { ok: true };
}

// Anula un partido directamente desde el panel de Resultados. Si el
// partido estaba "en_juego", además detiene el cronómetro (mismo
// endpoint y misma acción que usa mamMarcarAnulado() en el panel Minuto
// a Minuto) para que no se quede corriendo de fondo aunque el partido ya
// no cuente.
async function anularPartidoDesdeLista(r) {
  if (!(await EOF.confirmar("¿Anular este partido? Se marcará como \"Anulado\".", { peligroso: true, textoConfirmar: "Anular" }))) return;
  try {
    if (r.estado === "en_juego") {
      await apiFetch(`/api/results/${r.id}/cronometro`, {
        method: "POST",
        body: JSON.stringify({ accion: "pausar", minuto: minutoEnVivoDeResultado(r) }),
      });
    }
    await apiFetch(`/api/results/${r.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...cuerpoResultadoParaPutDesdeLista(r), estado: "anulado" }),
    });
    EOF.toast("Partido marcado como anulado", "exito");
    cargaListaResultados();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

// ---------- REDES SOCIALES: único sitio desde donde se editan ----------
// Estos mismos enlaces se usan en toda la web (cabecera, pie y portada),
// así que basta con cambiarlos aquí para que se actualicen en todas partes.
const CAMPOS_REDES = ["twitter", "instagram", "tiktok", "youtube"];
let redesCargadasUnaVez = false;

async function cargaRedesSociales() {
  if (redesCargadasUnaVez) return; // ya están cargadas en el formulario
  try {
    const { redes = {} } = await apiFetch(`/api/settings`);
    CAMPOS_REDES.forEach((key) => {
      const input = document.getElementById(`red_${key}`);
      if (input) input.value = redes[key] || "";
    });
    redesCargadasUnaVez = true;
  } catch (err) {
    document.getElementById("errRedes").textContent = "No se han podido cargar las redes sociales: " + err.message;
    document.getElementById("errRedes").style.display = "block";
  }
}

const formRedes = document.getElementById("formRedes");
if (formRedes) {
  formRedes.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgOk = document.getElementById("msgOkRedes");
    const errMsg = document.getElementById("errRedes");
    msgOk.style.display = "none";
    errMsg.style.display = "none";

    const redes = {};
    CAMPOS_REDES.forEach((key) => {
      const input = document.getElementById(`red_${key}`);
      if (input && input.value.trim()) redes[key] = input.value.trim();
    });

    try {
      await apiFetch(`/api/settings`, { method: "PUT", body: JSON.stringify({ redes }) });
      msgOk.style.display = "block";
      setTimeout(() => (msgOk.style.display = "none"), 3000);
    } catch (err) {
      errMsg.textContent = err.message;
      errMsg.style.display = "block";
    }
  });
}
// ---------- EQUIPOS: ficha informativa (entrenador, estadio...) ----------
let equiposInfoCargadosUnaVez = false;
let EQUIPO_INFO_SELECCIONADO = null; // club actualmente cargado en el formulario, para poder borrarlo

async function poblarSelectEquiposInfo() {
  const select = document.getElementById("equipoInfoClub");
  if (!select || select.dataset.poblado) return;
  await cargarCustomClubs();
  const todos = [
    ...getClubsForCategoria("hypermotion"),
    ...getClubsForCategoria("primera_federacion"),
    ...getClubsForCategoria("segunda_federacion"),
  ];
  const unicos = [...new Set(todos)].sort((a, b) => a.localeCompare(b, "es"));
  select.innerHTML = '<option value="">— Selecciona un club —</option>' +
    unicos.map(c => `<option value="${c.replace(/"/g, "&quot;")}">${c}</option>`).join("");
  select.dataset.poblado = "1";
}

function pintarFormularioEquipoInfo(info) {
  EQUIPO_INFO_SELECCIONADO = info ? info.club : document.getElementById("equipoInfoClub").value;
  document.getElementById("equipoInfoEntrenador").value = info?.entrenador || "";
  document.getElementById("equipoInfoEstadio").value = info?.estadio || "";
  document.getElementById("equipoInfoFundacion").value = info?.fundacion || "";
  document.getElementById("equipoInfoCiudad").value = info?.ciudad || "";
  document.getElementById("btnBorrarEquipoInfo").style.display = info ? "inline-block" : "none";
}

async function cargaEquiposInfo() {
  await poblarSelectEquiposInfo();
  const lista = document.getElementById("listaEquiposInfo");
  try {
    const { fichas = [] } = await apiFetch(`/api/admin/club-info`);
    lista.innerHTML = fichas.length
      ? fichas.map(f => `
          <div class="solicitud-card">
            <div class="solicitud-card-cabecera">
              <p class="solicitud-card-titulo">${escapeHtml(f.club)}</p>
              <button class="editar" data-editar-equipo="${f.club.replace(/"/g, "&quot;")}">Editar</button>
            </div>
            <div class="solicitud-card-detalle">
              <div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Entrenador</span><span>${f.entrenador ? escapeHtml(f.entrenador) : "—"}</span></div>
              <div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Estadio</span><span>${f.estadio ? escapeHtml(f.estadio) : "—"}</span></div>
              <div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Fundación</span><span>${f.fundacion || "—"}</span></div>
              <div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Ciudad</span><span>${f.ciudad ? escapeHtml(f.ciudad) : "—"}</span></div>
            </div>
          </div>`).join("")
      : `<p class="solicitudes-vacio">Todavía no hay ninguna ficha de equipo guardada.</p>`;
  } catch (err) {
    lista.innerHTML = `<p class="solicitudes-vacio">No se han podido cargar los equipos.</p>`;
  }
  cargaEquiposInfoPendientes();
}

// ---------- EQUIPOS: propuestas pendientes de aprobación (Nivel 1) ----------
// Solo las ve/resuelve un admin o un redactor de Nivel 4.
let EQUIPOS_INFO_PENDIENTES_CACHE = {};

async function cargaEquiposInfoPendientes() {
  const bloqueMias = document.getElementById("bloqueEquiposInfoMisPendientes");
  const listaMias = document.getElementById("listaEquiposInfoMisPendientes");
  const bloque = document.getElementById("bloqueEquiposInfoPendientes");
  const lista = document.getElementById("listaEquiposInfoPendientes");
  if (!bloque || !lista) return;
  try {
    const { solicitudes = [], puede_resolver } = await apiFetch(`/api/admin/club-info/solicitudes`);
    EQUIPOS_INFO_PENDIENTES_CACHE = {};
    solicitudes.forEach((s) => { EQUIPOS_INFO_PENDIENTES_CACHE[s.id] = s; });

    if (puede_resolver) {
      if (bloqueMias) bloqueMias.style.display = "none";
      bloque.style.display = "block";
      lista.innerHTML = solicitudes.length
        ? solicitudes.map(s => pintarTarjetaEquipoInfoPendiente(s, { conBotones: true })).join("")
        : `<p class="solicitudes-vacio">No hay propuestas pendientes.</p>`;
    } else {
      bloque.style.display = "none";
      if (bloqueMias) {
        bloqueMias.style.display = solicitudes.length ? "block" : "none";
        if (listaMias) listaMias.innerHTML = solicitudes.map(s => pintarTarjetaEquipoInfoPendiente(s, { conBotones: false })).join("");
      }
    }
  } catch (err) {
    lista.innerHTML = `<p class="solicitudes-vacio">No se han podido cargar las propuestas.</p>`;
  }
}

function pintarTarjetaEquipoInfoPendiente(s, { conBotones }) {
  const botones = conBotones
    ? `<div class="solicitud-card-botones">
         <button class="aprobar" data-accion-equipo-info="aprobar" data-id="${s.id}">Aprobar</button>
         <button class="rechazar" data-accion-equipo-info="rechazar" data-id="${s.id}">Rechazar</button>
       </div>`
    : "";
  return `
    <div class="solicitud-card">
      <div class="solicitud-card-cabecera">
        <div>
          <p class="solicitud-card-titulo">${escapeHtml(s.club)}</p>
          <p class="solicitud-card-meta">${conBotones ? `Propuesta por ${escapeHtml(s.solicitante_nombre || "—")} · ` : ""}${formatFechaSolicitud(s.created_at)}</p>
        </div>
      </div>
      <div class="solicitud-card-detalle">
        <div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Entrenador</span><span>${s.entrenador ? escapeHtml(s.entrenador) : "—"}</span></div>
        <div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Estadio</span><span>${s.estadio ? escapeHtml(s.estadio) : "—"}</span></div>
        <div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Fundación</span><span>${s.fundacion || "—"}</span></div>
        <div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Ciudad</span><span>${s.ciudad ? escapeHtml(s.ciudad) : "—"}</span></div>
      </div>
      ${botones}
    </div>`;
}

document.getElementById("listaEquiposInfoPendientes")?.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-accion-equipo-info]");
  if (!btn) return;
  const id = btn.dataset.id;
  const accion = btn.dataset.accionEquipoInfo;
  if (accion === "rechazar") {
    if (!(await EOF.confirmar("¿Rechazar esta propuesta de ficha de equipo?", { textoConfirmar: "Rechazar" }))) return;
  }
  try {
    await apiFetch(`/api/admin/club-info/solicitudes/${id}`, { method: "POST", body: JSON.stringify({ accion }) });
    EOF.toast(accion === "aprobar" ? "Propuesta aprobada." : "Propuesta rechazada.", "exito");
    cargaEquiposInfo();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
});


document.getElementById("listaEquiposInfo")?.addEventListener("click", (e) => {
  const club = e.target.dataset.editarEquipo;
  if (!club) return;
  const select = document.getElementById("equipoInfoClub");
  select.value = club;
  apiFetch(`/api/club-info?club=${encodeURIComponent(club)}`)
    .then(({ info }) => pintarFormularioEquipoInfo(info || { club }))
    .catch(() => {});
  document.getElementById("subpanel-equipos").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.getElementById("equipoInfoClub")?.addEventListener("change", async (e) => {
  const club = e.target.value;
  if (!club) { pintarFormularioEquipoInfo(null); return; }
  try {
    const { info } = await apiFetch(`/api/club-info?club=${encodeURIComponent(club)}`);
    pintarFormularioEquipoInfo(info || { club });
  } catch (err) {
    pintarFormularioEquipoInfo({ club });
  }
});

const formEquipoInfo = document.getElementById("formEquipoInfo");
if (formEquipoInfo) {
  formEquipoInfo.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgOk = document.getElementById("msgOkEquipoInfo");
    const errMsg = document.getElementById("errEquipoInfo");
    msgOk.style.display = "none";
    errMsg.style.display = "none";

    const club = document.getElementById("equipoInfoClub").value;
    if (!club) { errMsg.textContent = "Selecciona un club"; errMsg.style.display = "block"; return; }

    try {
      const resultado = await apiFetch(`/api/club-info`, {
        method: "PUT",
        body: JSON.stringify({
          club,
          entrenador: document.getElementById("equipoInfoEntrenador").value.trim(),
          estadio: document.getElementById("equipoInfoEstadio").value.trim(),
          fundacion: document.getElementById("equipoInfoFundacion").value || null,
          ciudad: document.getElementById("equipoInfoCiudad").value.trim(),
        }),
      });
      // Un redactor de Nivel 1 no aplica el cambio directo: el Worker lo
      // guarda como propuesta pendiente de aprobación, así que se lo
      // avisamos con un mensaje distinto al de "Guardado correctamente".
      msgOk.textContent = resultado.pendiente
        ? "Enviado para revisión. Se aplicará cuando un administrador o un redactor de Nivel 4 lo apruebe."
        : "Guardado correctamente.";
      msgOk.style.display = "block";
      setTimeout(() => (msgOk.style.display = "none"), 4000);
      if (!resultado.pendiente) document.getElementById("btnBorrarEquipoInfo").style.display = "inline-block";
      cargaEquiposInfo();
    } catch (err) {
      errMsg.textContent = err.message;
      errMsg.style.display = "block";
    }
  });
}

document.getElementById("btnBorrarEquipoInfo")?.addEventListener("click", async () => {
  const club = document.getElementById("equipoInfoClub").value;
  if (!club) return;
  if (!confirm(`¿Borrar la ficha del ${club}? Dejará de mostrarse el recuadro en su página.`)) return;
  try {
    await apiFetch(`/api/club-info?club=${encodeURIComponent(club)}`, { method: "DELETE" });
    document.getElementById("formEquipoInfo").reset();
    pintarFormularioEquipoInfo(null);
    cargaEquiposInfo();
  } catch (err) {
    alert("No se ha podido borrar: " + err.message);
  }
});

// ---------- COMENTARIOS de lectores (moderación) ----------
function comentarioAdminItemHTML(c) {
  const fecha = new Date(c.created_at.replace(" ", "T") + "Z").toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  const botones = [];
  if (c.estado !== "aprobado") botones.push(`<button class="aprobar" data-comentario-accion="aprobado" data-id="${c.id}">Aprobar</button>`);
  if (c.estado !== "rechazado") botones.push(`<button class="rechazar" data-comentario-accion="rechazado" data-id="${c.id}">Rechazar</button>`);
  botones.push(`<button class="rechazar" data-comentario-borrar="${c.id}">Borrar</button>`);

  return `
    <div class="solicitud-card">
      <div class="solicitud-card-cabecera">
        <div>
          <p class="solicitud-card-titulo">${escapeHtml(c.nombre)}</p>
          <p class="solicitud-card-meta">En <a href="${urlNoticia(c.articulo_categoria, c.articulo_slug)}" target="_blank">${escapeHtml(c.articulo_titulo)}</a> · ${formatFechaSolicitud(c.created_at)}</p>
        </div>
      </div>
      <div class="solicitud-card-detalle">
        <div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Comentario</span><span>${escapeHtml(c.texto)}</span></div>
        <div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Email</span><span>${escapeHtml(c.email)}</span></div>
      </div>
      <div class="solicitud-card-botones">${botones.join("")}</div>
    </div>`;
}

async function cargaComentarios(estado) {
  const contId = IDS_SUBPANEL_COMENTARIOS[estado];
  const cont = document.getElementById(contId);
  if (!cont) return;
  cont.innerHTML = `<p class="solicitudes-vacio">Cargando...</p>`;
  try {
    const { comentarios = [] } = await apiFetch(`/api/admin/comments?estado=${estado}`);
    cont.innerHTML = comentarios.length
      ? comentarios.map(comentarioAdminItemHTML).join("")
      : `<p class="solicitudes-vacio">No hay comentarios ${estado === "pendiente" ? "pendientes" : estado + "s"}.</p>`;

    if (estado === "pendiente") {
      const badge = document.getElementById("badgeFuncComentarios");
      if (badge) {
        badge.textContent = comentarios.length;
        badge.style.display = comentarios.length ? "inline-block" : "none";
      }
      actualizaBadgeFuncionalidades();
    }
  } catch (err) {
    cont.innerHTML = `<p class="solicitudes-vacio">No se han podido cargar los comentarios.</p>`;
  }
}

document.getElementById("subpanel-comentarios")?.addEventListener("click", async (e) => {
  const idAccion = e.target.dataset.comentarioAccion;
  const idBorrar = e.target.dataset.comentarioBorrar;

  if (idAccion && e.target.dataset.id) {
    try {
      await apiFetch(`/api/admin/comments/${e.target.dataset.id}`, {
        method: "PUT",
        body: JSON.stringify({ estado: idAccion }),
      });
      const subtabActivo = document.querySelector("#subpanel-comentarios .subtabs button.activo");
      if (subtabActivo) {
        const estado = subtabActivo.dataset.subtab === "comentariosPendientes" ? "pendiente" : subtabActivo.dataset.subtab === "comentariosAprobados" ? "aprobado" : "rechazado";
        cargaComentarios(estado);
      }
    } catch (err) {
      alert("No se ha podido actualizar: " + err.message);
    }
    return;
  }

  if (idBorrar) {
    if (!confirm("¿Borrar este comentario? No se puede deshacer.")) return;
    try {
      await apiFetch(`/api/admin/comments/${idBorrar}`, { method: "DELETE" });
      const subtabActivo = document.querySelector("#subpanel-comentarios .subtabs button.activo");
      if (subtabActivo) {
        const estado = subtabActivo.dataset.subtab === "comentariosPendientes" ? "pendiente" : subtabActivo.dataset.subtab === "comentariosAprobados" ? "aprobado" : subtabActivo.dataset.subtab === "comentariosRechazados" ? "rechazado" : null;
        if (estado) cargaComentarios(estado);
        else cargaComentariosDenunciados();
      }
    } catch (err) {
      alert("No se ha podido borrar: " + err.message);
    }
  }
});

// ---------- Comentarios denunciados ----------
function comentarioDenunciadoItemHTML(c) {
  const botones = [
    c.oculto_por_denuncia
      ? `<button class="aprobar" data-comentario-mostrar="${c.id}">Volver a mostrar</button>`
      : "",
    `<button class="rechazar" data-comentario-borrar="${c.id}">Borrar</button>`,
  ].filter(Boolean);

  return `
    <div class="solicitud-card">
      <div class="solicitud-card-cabecera">
        <div>
          <p class="solicitud-card-titulo">${escapeHtml(c.nombre)}
            ${c.oculto_por_denuncia ? '<span style="color:#991b1b;font-weight:600;font-size:.78rem;margin-left:8px;">Oculto en la web</span>' : ""}
          </p>
          <p class="solicitud-card-meta">En <a href="${urlNoticia(c.articulo_categoria, c.articulo_slug)}" target="_blank">${escapeHtml(c.articulo_titulo)}</a> · ${formatFechaSolicitud(c.created_at)} · ${c.denuncias} denuncia${c.denuncias === 1 ? "" : "s"}</p>
        </div>
      </div>
      <div class="solicitud-card-detalle">
        <div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Comentario</span><span>${escapeHtml(c.texto)}</span></div>
        <div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Estado</span><span>${escapeHtml(c.estado)}</span></div>
      </div>
      <div class="solicitud-card-botones">${botones.join("")}</div>
    </div>`;
}

async function cargaComentariosDenunciados() {
  const cont = document.getElementById("listaComentariosDenunciados");
  if (!cont) return;
  cont.innerHTML = `<p class="solicitudes-vacio">Cargando...</p>`;
  try {
    const { comentarios = [] } = await apiFetch(`/api/admin/comments/reported`);
    cont.innerHTML = comentarios.length
      ? comentarios.map(comentarioDenunciadoItemHTML).join("")
      : `<p class="solicitudes-vacio">No hay comentarios denunciados.</p>`;

    const ocultos = comentarios.filter(c => c.oculto_por_denuncia).length;
    const badge = document.getElementById("badgeComentariosDenunciados");
    if (badge) {
      badge.textContent = ocultos;
      badge.style.display = ocultos ? "inline-block" : "none";
    }
    actualizaBadgeFuncionalidades();
  } catch (err) {
    cont.innerHTML = `<p class="solicitudes-vacio">No se han podido cargar los comentarios denunciados.</p>`;
  }
}

// El badge del tab padre "Funcionalidades" resume en un único número los
// avisos pendientes de sus subpestañas: comentarios por moderar y
// comentarios denunciados y ocultos. Se recalcula cada vez que cualquiera
// de esos dos badges internos cambia.
function actualizaBadgeFuncionalidades() {
  const badgePadre = document.getElementById("badgeFuncionalidadesPendientes");
  if (!badgePadre) return;
  const pendientes = parseInt(document.getElementById("badgeFuncComentarios")?.textContent, 10) || 0;
  const denunciados = parseInt(document.getElementById("badgeComentariosDenunciados")?.textContent, 10) || 0;
  const total = pendientes + denunciados;
  badgePadre.textContent = total;
  badgePadre.style.display = total ? "inline-block" : "none";
}

document.getElementById("subpanel-comentariosDenunciados")?.addEventListener("click", async (e) => {
  const idMostrar = e.target.dataset.comentarioMostrar;
  if (!idMostrar) return;
  try {
    await apiFetch(`/api/admin/comments/${idMostrar}/unhide`, { method: "PUT" });
    cargaComentariosDenunciados();
  } catch (err) {
    alert("No se ha podido actualizar: " + err.message);
  }
});

// Comprobamos si hay comentarios pendientes o denunciados/ocultos al
// cargar el panel, para que el aviso (badge) del subtab "Comentarios" y el
// del tab padre "Funcionalidades" aparezcan aunque no se haya abierto esa
// pestaña todavía. Solo aplica a administradores: un redactor no tiene
// acceso a la moderación de comentarios.
if (USER.rol === "admin" && document.getElementById("badgeFuncComentarios")) {
  cargaComentarios("pendiente");
}
if (USER.rol === "admin" && document.getElementById("badgeComentariosDenunciados")) {
  cargaComentariosDenunciados();
}

const formPassword = document.getElementById("formPassword");
if (formPassword) {
  formPassword.addEventListener("submit", async (e) => {
    e.preventDefault();
    const actual = document.getElementById("passActual").value;
    const nueva = document.getElementById("passNueva").value;
    const nueva2 = document.getElementById("passNueva2").value;
    const msgOk = document.getElementById("msgOkPassword");
    const errMsg = document.getElementById("errPassword");
    msgOk.style.display = "none";
    errMsg.style.display = "none";

    if (nueva !== nueva2) {
      errMsg.textContent = "Las contraseñas nuevas no coinciden.";
      errMsg.style.display = "block";
      return;
    }
    if (nueva.length < 8) {
      errMsg.textContent = "La nueva contraseña debe tener al menos 8 caracteres.";
      errMsg.style.display = "block";
      return;
    }

    try {
      await apiFetch(`/api/me/password`, {
        method: "PUT",
        body: JSON.stringify({ actual, nueva }),
      });
      msgOk.textContent = "Contraseña actualizada correctamente. Se han cerrado el resto de tus sesiones abiertas.";
      msgOk.style.display = "block";
      formPassword.reset();
      setTimeout(() => (msgOk.style.display = "none"), 4000);
    } catch (err) {
      errMsg.textContent = err.message;
      errMsg.style.display = "block";
    }
  });
}

// ---------- MIS SESIONES ----------
// Icono genérico de dispositivo (ordenador/móvil) para cada fila; no
// distinguimos el icono por tipo de dispositivo, solo el texto.
function iconoDispositivoSesion() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>`;
}

// Convierte una fecha ISO del servidor en texto relativo/legible
// sencillo, sin depender de ninguna librería externa.
function formatearFechaSesion(iso) {
  if (!iso) return "";
  const fecha = new Date(iso.replace(" ", "T") + "Z");
  if (isNaN(fecha.getTime())) return iso;
  const ahora = new Date();
  const diffMin = Math.round((ahora - fecha) / 60000);
  if (diffMin < 1) return "Hace un momento";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHoras = Math.round(diffMin / 60);
  if (diffHoras < 24) return `Hace ${diffHoras} h`;
  return fecha.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ---------- MI PROGRESO (sistema de niveles) ----------
// Nombres de cada tipo de contenido tal y como se muestran en el
// desglose de progreso (coinciden con articles.tipo en el Worker).
const NIVELES_TIPO_LABEL = { noticia: "Noticias", previa: "Previas", cronica: "Crónicas", analisis: "Análisis", opinion: "Artículos de opinión", entrevista: "Entrevistas" };

// Iconos (SVG, en vez de emoji de tipo de contenido) para el desglose
// de publicaciones de "Mi progreso".
const NIVELES_TIPO_ICONO = {
  noticia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  // Previa: reloj/calendario -contenido publicado ANTES del partido-,
  // para distinguirla de un vistazo del icono de crónica (posterior).
  previa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/></svg>',
  cronica: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>',
  // Análisis: gráfico de barras, para diferenciarlo de opinión (bocadillo).
  analisis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16v-4M12 16V8M17 16v-7"/></svg>',
  opinion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/></svg>',
  entrevista: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></svg>',
};

// Construye el bloque de la insignia de nivel (icono + número + nombre
// + descripción) reutilizado tanto en "Mi progreso" como en el modal
// de administración de usuarios.
function nivelInsigniaHTML(nivel, info, extra = "") {
  return `
    <div class="nivel-insignia nivel-insignia-${nivel}">
      <div class="nivel-insignia-icono">${NIVEL_ICONO_SVG[nivel] || NIVEL_ICONO_SVG[1]}</div>
      <div class="nivel-insignia-texto">
        <span class="nivel-insignia-eyebrow">Nivel ${nivel}</span>
        <strong>${info.nombre}</strong>
        <p>${info.descripcion}</p>
        ${extra}
      </div>
    </div>`;
}

// Iconos SVG por nivel (en vez de emoji) para que la insignia se vea
// igual de nítida en cualquier dispositivo/fuente del sistema.
const NIVEL_ICONO_SVG = {
  1: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
  2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 15 8.5-4.9L12 2 3.5 10.1 12 15Z"/><path d="M12 15v7"/><path d="m4 12.5-1.5 4L12 22l9.5-5.5-1.5-4"/></svg>',
  3: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 9.3 8.6 2 9.3l5.5 4.8L5.8 21 12 17.3 18.2 21l-1.7-6.9L22 9.3l-7.3-.7L12 2Z"/></svg>',
  4: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/></svg>',
};

function pintarProgresoNivel(cont, data) {
  const { nivel_actual, nivel_info, nivel_nota, publicaciones, nivel_maximo, siguiente_nivel, siguiente_nivel_info, progreso, es_admin } = data;

  let bloquePublicaciones = "";
  let bloqueSiguiente = "";

  if (es_admin) {
    // Nivel fijo: no tiene sentido mostrar conteo de publicaciones ni
    // barras de progreso, porque el nivel de un admin no depende de
    // cifras y no puede cambiar mientras conserve el rol.
    bloqueSiguiente = `
      <div class="nivel-maximo-aviso">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/></svg>
        <div>
          <strong>Nivel fijo de administrador</strong>
          <p>Como administrador siempre estás al nivel máximo y no hace falta que lo demuestres con cifras: publicas directamente y revisas el contenido de todo el equipo.</p>
        </div>
      </div>`;
  } else {
    const filasPublicaciones = Object.entries(NIVELES_TIPO_LABEL).map(([tipo, label]) => `
      <div class="nivel-stat">
        <div class="nivel-stat-icono">${NIVELES_TIPO_ICONO[tipo] || ""}</div>
        <div class="nivel-stat-num">${publicaciones[tipo] || 0}</div>
        <div class="nivel-stat-label">${label}</div>
      </div>`
    ).join("");
    bloquePublicaciones = `
      <h3 class="titulo-subseccion">Mis publicaciones</h3>
      <div class="nivel-stats-grid">${filasPublicaciones}</div>`;

    if (nivel_maximo) {
      bloqueSiguiente = `
        <div class="nivel-maximo-aviso">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/></svg>
          <div>
            <strong>¡Nivel máximo alcanzado!</strong>
            <p>Has llegado a la cima del sistema de niveles y recompensas. 🎉</p>
          </div>
        </div>`;
    } else if (progreso) {
      const barras = progreso.detalle.map((d) => {
        const pct = Math.min(100, Math.round((d.actual / d.necesarios) * 100));
        return `
          <div class="nivel-barra-fila ${d.cumple ? "cumple" : ""}">
            <div class="nivel-barra-cabecera">
              <span class="nivel-barra-tipo">${NIVELES_TIPO_ICONO[d.tipo] || ""}${NIVELES_TIPO_LABEL[d.tipo] || d.tipo}</span>
              <span class="nivel-barra-cifra">${d.actual} / ${d.necesarios}</span>
            </div>
            <div class="nivel-barra-pista"><div class="nivel-barra-relleno" style="width:${pct}%;"></div></div>
          </div>`;
      }).join("");
      bloqueSiguiente = `
        <div class="nivel-siguiente-cabecera">
          <h3 class="titulo-subseccion" style="margin:0;">Progreso hacia el siguiente nivel</h3>
          ${nivelInsigniaHTML(siguiente_nivel, siguiente_nivel_info).replace('class="nivel-insignia', 'class="nivel-insignia nivel-insignia-mini')}
        </div>
        <div class="nivel-barras">${barras}</div>
        <p class="ayuda-editor nivel-ayuda">
          ${progreso.cumple_requisitos
            ? "✅ Ya cumples las cifras mínimas para este nivel. El ascenso lo decide un administrador evaluando también la calidad y el cumplimiento de las normas, no es automático."
            : "Estas cifras son solo el mínimo para poder optar al ascenso: subir de nivel no es automático, lo decide un administrador evaluando también la calidad del trabajo y el cumplimiento de las normas."}
        </p>`;
    }
  }

  cont.innerHTML = `
    <h3 class="titulo-subseccion nivel-titulo-principal" style="margin-top:0;">Mi progreso</h3>
    ${nivelInsigniaHTML(nivel_actual, nivel_info, nivel_nota ? `<div class="nivel-nota">📝 Nota del administrador: ${escapeHtml(nivel_nota)}</div>` : "")}
    ${bloquePublicaciones}
    ${bloqueSiguiente}
  `;
}

let progresoNivelCargando = false;
async function cargaMiProgreso() {
  const cont = document.getElementById("progresoNivelCont");
  if (!cont || progresoNivelCargando) return;
  progresoNivelCargando = true;
  try {
    const data = await apiFetch(`/api/me/nivel`);
    pintarProgresoNivel(cont, data);
  } catch (err) {
    cont.innerHTML = `<p class="sesiones-vacio">No se ha podido cargar tu progreso.</p>`;
  } finally {
    progresoNivelCargando = false;
  }
}

// Se refresca solo mientras la persona tiene abierta esa subpestaña,
// para que si publica una noticia y vuelve a "Mi progreso" vea las
// cifras actualizadas sin tener que recargar la página entera.
setInterval(() => {
  const subpanel = document.getElementById("subpanel-progreso");
  if (subpanel && subpanel.classList.contains("activo")) cargaMiProgreso();
}, 30000);

async function cargaSesiones() {
  const cont = document.getElementById("listaSesiones");
  if (!cont) return;
  cont.innerHTML = `<p class="sesiones-vacio">Cargando dispositivos…</p>`;
  try {
    const { sesiones } = await apiFetch(`/api/me/sesiones`);
    if (!sesiones || !sesiones.length) {
      cont.innerHTML = `<p class="sesiones-vacio">No hay dispositivos conectados.</p>`;
      return;
    }
    cont.innerHTML = sesiones.map((s) => `
      <div class="fila-sesion ${s.actual ? "es-actual" : ""}" data-id="${s.id}">
        <div class="icono-dispositivo">${iconoDispositivoSesion()}</div>
        <div class="datos-sesion">
          <div class="dispositivo-nombre">
            ${s.dispositivo}
            ${s.actual ? `<span class="etiqueta-actual">Este dispositivo</span>` : ""}
          </div>
          <div class="detalle-sesion">
            ${s.ip ? `IP ${s.ip} · ` : ""}Iniciada ${formatearFechaSesion(s.created_at)} · Última actividad: ${formatearFechaSesion(s.last_seen_at)}
          </div>
        </div>
        <button type="button" class="btn-cerrar-sesion" data-id="${s.id}" data-actual="${s.actual ? "1" : "0"}">
          ${s.actual ? "Cerrar este dispositivo" : "Cerrar dispositivo"}
        </button>
      </div>
    `).join("");

    cont.querySelectorAll(".btn-cerrar-sesion").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const esActual = btn.dataset.actual === "1";
        const mensaje = esActual
          ? "Esto cerrará este dispositivo y volverás a la pantalla de inicio de sesión. ¿Continuar?"
          : "¿Cerrar este dispositivo? Tendrá que volver a iniciar sesión.";
        if (!(await EOF.confirmar(mensaje, { peligroso: true, textoConfirmar: "Cerrar dispositivo" }))) return;
        try {
          await apiFetch(`/api/me/sesiones/${id}`, { method: "DELETE" });
          if (esActual) {
            logout();
            return;
          }
          EOF.toast("Dispositivo cerrado correctamente.", "exito");
          cargaSesiones();
        } catch (err) {
          EOF.toast(err.message || "No se pudo cerrar el dispositivo", "error");
        }
      });
    });
  } catch (err) {
    cont.innerHTML = `<p class="sesiones-vacio">No se han podido cargar los dispositivos.</p>`;
  }
}

const btnCerrarOtrasSesiones = document.getElementById("btnCerrarOtrasSesiones");
if (btnCerrarOtrasSesiones) {
  btnCerrarOtrasSesiones.addEventListener("click", async () => {
    if (!(await EOF.confirmar("¿Cerrar todos los demás dispositivos? Tendrán que volver a iniciar sesión.", { peligroso: true, textoConfirmar: "Cerrar dispositivos" }))) return;
    try {
      await apiFetch(`/api/me/sesiones/otras`, { method: "DELETE" });
      EOF.toast("Se han cerrado los demás dispositivos.", "exito");
      cargaSesiones();
    } catch (err) {
      EOF.toast(err.message || "No se pudieron cerrar los dispositivos", "error");
    }
  });
}

// Rellena el formulario "Mis datos" con la biografía, foto y redes que
// ya tuviera guardadas (el JWT no las lleva, solo lo básico, así que se
// piden aparte).
async function cargarMiPerfilCompleto() {
  try {
    const { user } = await apiFetch(`/api/me/perfil`);
    if (!user) return;
    document.getElementById("perfil_avatar").value = user.avatar_url || "";
    document.getElementById("perfil_avatar_foco").value = user.avatar_foco || "50% 50%";
    actualizarPreviewAvatar(user.avatar_url || "");
    document.getElementById("perfil_bio").value = user.bio || "";
    document.getElementById("perfil_experiencia").value = user.experiencia || "";
    // El equipo se muestra en modo solo-lectura: chips fijos, sin ningún
    // control editable. Solo un admin puede cambiarlo desde "Usuarios".
    pintarEquipoBloqueado(document.getElementById("perfil_equipo"), user.equipo || []);
    const redes = user.redes || {};
    document.getElementById("perfil_twitter").value = redes.twitter || "";
    document.getElementById("perfil_instagram").value = redes.instagram || "";
    document.getElementById("perfil_tiktok").value = redes.tiktok || "";
    document.getElementById("perfil_youtube").value = redes.youtube || "";
  } catch (err) {
    // Si falla, el formulario se queda con nombre/correo del inicio de
    // sesión y el resto de campos en blanco; la persona puede rellenarlos
    // igualmente sin perder nada.
  }
}

// Foto de perfil: mismo sistema de subida y foco que las fotos de
// noticias (crearFilaImagen), pero para una única imagen circular.
const wrapAvatar = document.getElementById("wrapAvatar");
const btnSubirAvatar = document.getElementById("btnSubirAvatar");
const inputAvatarArchivo = document.getElementById("inputAvatarArchivo");
const inputAvatarUrl = document.getElementById("perfil_avatar");
const inputAvatarFoco = document.getElementById("perfil_avatar_foco");
const btnQuitarAvatar = document.getElementById("btnQuitarAvatar");
const btnFocoAvatar = document.getElementById("btnFocoAvatar");
const focoPanelAvatar = document.getElementById("focoPanelAvatar");
const focoPreviewAvatar = document.getElementById("focoPreviewAvatar");
const focoMarcadorAvatar = document.getElementById("focoMarcadorAvatar");

function actualizarPreviewAvatar(url) {
  const preview = document.getElementById("previewAvatar");
  if (!preview) return;
  if (url) {
    preview.src = url;
    preview.hidden = false;
  } else {
    preview.hidden = true;
    preview.removeAttribute("src");
  }
  pintarFocoAvatar();
}

function pintarFocoAvatar() {
  if (!focoPreviewAvatar) return;
  const [fx, fy] = (inputAvatarFoco.value || "50% 50%").split(" ");
  focoMarcadorAvatar.style.left = fx;
  focoMarcadorAvatar.style.top = fy;
  const urlActual = inputAvatarUrl.value.trim();
  focoPreviewAvatar.style.backgroundImage = urlActual ? `url("${urlActual}")` : "none";
}

if (btnSubirAvatar && inputAvatarArchivo) {
  btnSubirAvatar.innerHTML = iconoSubirImagen();

  btnSubirAvatar.addEventListener("click", () => inputAvatarArchivo.click());

  inputAvatarArchivo.addEventListener("change", async () => {
    const file = inputAvatarArchivo.files[0];
    inputAvatarArchivo.value = "";
    if (!file) return;
    btnSubirAvatar.disabled = true;
    btnSubirAvatar.classList.add("subiendo");
    try {
      const url = await subirImagenSuelta(file);
      inputAvatarUrl.value = url;
      actualizarPreviewAvatar(url);
    } catch (err) {
      EOF.toast(err.message || "No se pudo subir la foto", "error");
    } finally {
      btnSubirAvatar.disabled = false;
      btnSubirAvatar.classList.remove("subiendo");
    }
  });

  if (btnQuitarAvatar) {
    btnQuitarAvatar.addEventListener("click", () => {
      inputAvatarUrl.value = "";
      inputAvatarFoco.value = "50% 50%";
      actualizarPreviewAvatar("");
      if (focoPanelAvatar) focoPanelAvatar.classList.add("oculto");
      if (btnFocoAvatar) btnFocoAvatar.classList.remove("activo");
    });
  }

  if (btnFocoAvatar && focoPanelAvatar) {
    btnFocoAvatar.addEventListener("click", () => {
      focoPanelAvatar.classList.toggle("oculto");
      btnFocoAvatar.classList.toggle("activo");
      if (!focoPanelAvatar.classList.contains("oculto")) pintarFocoAvatar();
    });
  }

  if (focoPreviewAvatar) {
    focoPreviewAvatar.addEventListener("click", (e) => {
      const rect = focoPreviewAvatar.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      inputAvatarFoco.value = `${Math.round(x)}% ${Math.round(y)}%`;
      pintarFocoAvatar();
    });
  }

  const btnFocoResetAvatar = document.getElementById("btnFocoResetAvatar");
  if (btnFocoResetAvatar) {
    btnFocoResetAvatar.addEventListener("click", () => {
      inputAvatarFoco.value = "50% 50%";
      pintarFocoAvatar();
    });
  }
}

// Pinta el bloque de "Mis datos" > Equipo como una lista de chips fijos
// (o el aviso de "sin especificar" si no tiene ninguno). No añade ningún
// input ni checkbox: es puramente informativo, sin posibilidad de editar.
function pintarEquipoBloqueado(contenedor, equipos) {
  if (!contenedor) return;
  const lista = Array.isArray(equipos) ? equipos : (equipos ? [equipos] : []);
  const candado = `
    <span class="equipo-candado">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
      Solo un administrador puede cambiarlo
    </span>`;
  if (!lista.length) {
    contenedor.innerHTML = `<span class="equipo-vacio">— Sin especificar —</span>${candado}`;
    return;
  }
  contenedor.innerHTML = lista.map((e) => `<span class="equipo-chip-fijo">${escapeHtml(e)}</span>`).join("") + candado;
}

const formPerfil = document.getElementById("formPerfil");
if (formPerfil) {
  formPerfil.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgOk = document.getElementById("msgOkPerfil");
    const errMsg = document.getElementById("errPerfil");
    msgOk.style.display = "none";
    errMsg.style.display = "none";

const nombre = document.getElementById("perfil_nombre").value.trim();
    const email = document.getElementById("perfil_email").value.trim();
    const avatar_url = document.getElementById("perfil_avatar").value.trim();
    const avatar_foco = document.getElementById("perfil_avatar_foco").value.trim() || "50% 50%";
    const bio = document.getElementById("perfil_bio").value.trim();
    const experiencia = document.getElementById("perfil_experiencia").value.trim();
    // El equipo NO se envía desde aquí: es de solo lectura en "Mis datos"
    // (se muestra en un bloque bloqueado, sin control editable) y solo
    // un administrador puede cambiarlo, desde "Usuarios".
    const redes = {
      twitter: document.getElementById("perfil_twitter").value.trim(),
      instagram: document.getElementById("perfil_instagram").value.trim(),
      tiktok: document.getElementById("perfil_tiktok").value.trim(),
      youtube: document.getElementById("perfil_youtube").value.trim(),
    };

    try {
const data = await apiFetch(`/api/me/perfil`, {
        method: "PUT",
        body: JSON.stringify({ nombre, email, avatar_url, avatar_foco, bio, experiencia, redes }),
      });
      // Se actualiza la sesión guardada (nombre/correo/token) para que el
      // cambio se refleje al momento en toda la página sin tener que
      // volver a iniciar sesión.
      if (data.token) localStorage.setItem("eof_token", data.token);
      if (data.user) {
        localStorage.setItem("eof_user", JSON.stringify(data.user));
        document.getElementById("userNombre").textContent = `${data.user.nombre} (${data.user.rol})`;
        document.getElementById("ajustesNombre").textContent = data.user.nombre;
        pintarCuentaAvatar(data.user);
      }
      msgOk.style.display = "block";
      setTimeout(() => (msgOk.style.display = "none"), 3000);
      // Refresca el desplegable de autores por si el nombre mostrado ahí
      // también ha cambiado.
      if (typeof cargarAutoresSelect === "function") cargarAutoresSelect();
    } catch (err) {
      errMsg.textContent = err.message;
      errMsg.style.display = "block";
    }
  });
}

// ---------- SUBIR CONTENIDO (fotos/vídeos, cualquier redactor logueado) ----------
(function iniciarSubidaContenido() {
  const form = document.getElementById("formSubidaContenido");
  if (!form) return;

  // Rellena el desplegable de clubes con todos los clubes de todas las
  // categorías, ya que el contenido subido no está atado a una sola liga.
  const selectClub = document.getElementById("clubSubida");
  const todosLosClubes = listaTodosLosClubesFederativos().sort((a, b) => a.localeCompare(b));
  todosLosClubes.forEach((club) => {
    const opt = document.createElement("option");
    opt.value = club;
    opt.textContent = club;
    selectClub.appendChild(opt);
  });

  const dropzone = document.getElementById("dropzone");
  const inputArchivos = document.getElementById("inputArchivos");
  const listaArchivos = document.getElementById("listaArchivos");
  const btnSubir = document.getElementById("btnSubir");
  const msgOk = document.getElementById("msgOkSubida");
  const errMsg = document.getElementById("errSubida");

  function iconoTipoArchivoSubida(esFoto) {
    return esFoto
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5" width="14" height="14" rx="2"/><path d="M16.5 10.5l5-3v9l-5-3z"/></svg>';
  }

  function formatoTamanoSubida(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }

  // Cada archivo seleccionado se guarda con un id propio para poder
  // encontrar su fila en la lista y actualizar su barra de progreso.
  let archivos = []; // [{ id, file }]
  let idSeq = 0;

  const resumenSubida = document.getElementById("resumenSubida");
  const resumenCantidad = document.getElementById("resumenCantidad");
  const resumenPeso = document.getElementById("resumenPeso");
  const resumenTipo = document.getElementById("resumenTipo");

  function actualizarBotonSubir() {
    btnSubir.disabled = archivos.length === 0;
  }

  function actualizarResumen() {
    if (!archivos.length) {
      resumenSubida.classList.remove("visible");
      return;
    }
    resumenSubida.classList.add("visible");
    resumenCantidad.textContent = archivos.length;
    const pesoTotal = archivos.reduce((acc, { file }) => acc + file.size, 0);
    resumenPeso.textContent = formatoTamanoSubida(pesoTotal);
    const hayFotos = archivos.some(({ file }) => file.type.startsWith("image/"));
    const hayVideos = archivos.some(({ file }) => file.type.startsWith("video/"));
    resumenTipo.textContent = hayFotos && hayVideos ? "Fotos y vídeos" : hayVideos ? "Vídeos" : "Fotos";
  }

  function pintarLista() {
    listaArchivos.innerHTML = archivos.map(({ id, file }) => {
      const esFoto = file.type.startsWith("image/");
      return `
        <div class="item-archivo${esFoto ? "" : " es-video"}" data-id="${id}">
          <div class="icono-tipo">${iconoTipoArchivoSubida(esFoto)}</div>
          <div class="info">
            <div class="nombre">${file.name}</div>
            <div class="peso">${formatoTamanoSubida(file.size)}</div>
            <div class="barra-progreso"><i style="width:0%"></i></div>
            <div class="estado-txt">Pendiente de subir</div>
          </div>
          <button type="button" class="quitar" data-quitar="${id}" title="Quitar">✕</button>
        </div>`;
    }).join("");
    actualizarResumen();
  }

  // Límite de tamaño para vídeos en el propio navegador: evita que el
  // usuario espere a que suba un vídeo pesado entero para enterarse en
  // el último segundo de que el servidor lo va a rechazar (ver
  // LIMITE_VIDEO_BYTES en worker/src/index.js; se mantiene el mismo
  // valor aquí a propósito).
  const LIMITE_VIDEO_MB = 90;
  const LIMITE_VIDEO_BYTES_CLIENTE = LIMITE_VIDEO_MB * 1024 * 1024;

  // Compara dos "File" del navegador para saber si son, con toda
  // probabilidad, el mismo archivo: mismo nombre, mismo peso exacto en
  // bytes, mismo tipo y misma fecha de última modificación. No es un
  // hash de contenido (eso solo se calcula en el servidor, que es quien
  // de verdad decide si se puede subir o no), pero es suficiente para
  // avisar al momento si alguien arrastra el mismo archivo dos veces a
  // la cola antes incluso de enviarlo.
  function mismoArchivo(a, b) {
    return a.name === b.name
      && a.size === b.size
      && a.type === b.type
      && a.lastModified === b.lastModified;
  }

  function mostrarAvisoDuplicado(nombres) {
    if (!nombres.length) return;
    errMsg.textContent = nombres.length === 1
      ? `"${nombres[0]}" ya está en la lista: no se ha añadido dos veces.`
      : `Estos archivos ya estaban en la lista y no se han añadido dos veces: ${nombres.join(", ")}.`;
    errMsg.style.display = "block";
  }

  // Mismos formatos que admite el servidor (ver TIPOS_IMAGEN_PERMITIDOS y
  // TIPOS_VIDEO_PERMITIDOS en worker/src/index.js), para poder avisar de
  // un formato no admitido al momento en vez de que el archivo desaparezca
  // sin más al arrastrarlo o seleccionarlo.
  const TIPOS_IMAGEN_PERMITIDOS_CLIENTE = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"];
  const TIPOS_VIDEO_PERMITIDOS_CLIENTE = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/mpeg"];
  const EXTENSIONES_IMAGEN_CLIENTE = ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"];
  const EXTENSIONES_VIDEO_CLIENTE = ["mp4", "mov", "webm", "mkv", "mpeg", "mpg"];

  function extensionDe(nombre) {
    return nombre.includes(".") ? nombre.split(".").pop().toLowerCase() : "";
  }

  function agregarArchivos(fileList) {
    errMsg.style.display = "none";
    const duplicadosEnCola = [];
    const demasiadoPesados = [];
    const formatoNoAdmitido = [];
    const vacios = [];

    [...fileList].forEach((file) => {
      const ext = extensionDe(file.name);
      // El navegador no siempre rellena file.type de forma fiable: en
      // vídeos MOV grabados con iPhone y subidos desde Safari/iOS, o en
      // fotos HEIC, a veces llega vacío o como "application/octet-stream"
      // aunque el archivo sea perfectamente válido. Antes, al depender
      // solo de file.type, esos archivos se rechazaban aquí mismo sin
      // llegar siquiera a intentarse subir. Ahora, si el tipo MIME no es
      // reconocible, se admite igualmente si la extensión es una de las
      // permitidas -- igual que ya hace la validación del servidor.
      const tipoNoFiable = !file.type || file.type === "application/octet-stream";
      const esImagenAdmitida = TIPOS_IMAGEN_PERMITIDOS_CLIENTE.includes(file.type)
        || (tipoNoFiable && EXTENSIONES_IMAGEN_CLIENTE.includes(ext));
      const esVideoAdmitido = TIPOS_VIDEO_PERMITIDOS_CLIENTE.includes(file.type)
        || (tipoNoFiable && EXTENSIONES_VIDEO_CLIENTE.includes(ext));

      // 1) Formato no admitido: se avisa con el nombre del archivo y su
      // extensión/tipo tal cual la ha detectado el navegador, en vez de
      // descartarlo en silencio (antes no se avisaba de nada aquí y el
      // archivo simplemente no aparecía en la lista).
      if (!esImagenAdmitida && !esVideoAdmitido) {
        const extension = file.name.includes(".") ? file.name.split(".").pop().toUpperCase() : (file.type || "desconocido");
        formatoNoAdmitido.push(`${file.name} (${extension})`);
        return;
      }

      // 2) Archivo vacío (0 bytes): el servidor también lo rechaza, pero
      // avisar aquí evita una subida entera para nada.
      if (file.size === 0) {
        vacios.push(file.name);
        return;
      }

      // 3) ¿Ya está exactamente este archivo en la cola pendiente?
      if (archivos.some(({ file: existente }) => mismoArchivo(existente, file))) {
        duplicadosEnCola.push(file.name);
        return;
      }

      // 4) Aviso temprano de vídeos que el servidor rechazaría igualmente
      // por peso, para no hacer esperar la subida en vano.
      if (esVideoAdmitido && file.size > LIMITE_VIDEO_BYTES_CLIENTE) {
        demasiadoPesados.push(`${file.name} (${formatoTamanoSubida(file.size)})`);
        return;
      }

      archivos.push({ id: ++idSeq, file });
    });

    pintarLista();
    actualizarBotonSubir();

    // Se muestran todos los avisos que apliquen (formato, peso, vacíos,
    // duplicados) en vez de solo el primero que se encuentre, para que
    // quien sube varios archivos a la vez no tenga que ir descubriendo
    // los problemas de uno en uno arrastrando otra vez la misma carpeta.
    const partesAviso = [];
    if (formatoNoAdmitido.length) {
      partesAviso.push(
        formatoNoAdmitido.length === 1
          ? `Formato no admitido: ${formatoNoAdmitido[0]}. Solo se admiten fotos (JPG, PNG, WEBP, GIF, AVIF, HEIC/HEIF) o vídeos (MP4, MOV, WEBM, MKV, MPEG).`
          : `Formato no admitido en estos archivos: ${formatoNoAdmitido.join(", ")}. Solo se admiten fotos (JPG, PNG, WEBP, GIF, AVIF, HEIC/HEIF) o vídeos (MP4, MOV, WEBM, MKV, MPEG).`
      );
    }
    if (vacios.length) {
      partesAviso.push(
        vacios.length === 1
          ? `"${vacios[0]}" está vacío (0 bytes) y no se ha añadido.`
          : `Estos archivos están vacíos (0 bytes) y no se han añadido: ${vacios.join(", ")}.`
      );
    }
    if (demasiadoPesados.length) {
      partesAviso.push(
        demasiadoPesados.length === 1
          ? `El vídeo "${demasiadoPesados[0]}" no puede superar los ${LIMITE_VIDEO_MB} MB.`
          : `Estos vídeos superan los ${LIMITE_VIDEO_MB} MB permitidos: ${demasiadoPesados.join(", ")}.`
      );
    }
    if (duplicadosEnCola.length) {
      partesAviso.push(
        duplicadosEnCola.length === 1
          ? `"${duplicadosEnCola[0]}" ya está en la lista: no se ha añadido dos veces.`
          : `Estos archivos ya estaban en la lista y no se han añadido dos veces: ${duplicadosEnCola.join(", ")}.`
      );
    }
    if (partesAviso.length) {
      errMsg.textContent = partesAviso.join(" ");
      errMsg.style.display = "block";
    }
  }

  dropzone.addEventListener("click", () => inputArchivos.click());
  inputArchivos.addEventListener("change", () => {
    agregarArchivos(inputArchivos.files);
    inputArchivos.value = "";
  });

  ["dragenter", "dragover"].forEach((evento) => {
    dropzone.addEventListener(evento, (e) => {
      e.preventDefault();
      dropzone.classList.add("arrastrando");
    });
  });
  ["dragleave", "drop"].forEach((evento) => {
    dropzone.addEventListener(evento, (e) => {
      e.preventDefault();
      dropzone.classList.remove("arrastrando");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    if (e.dataTransfer.files.length) agregarArchivos(e.dataTransfer.files);
  });

  listaArchivos.addEventListener("click", (e) => {
    const id = e.target.dataset.quitar;
    if (!id) return;
    archivos = archivos.filter((a) => a.id != id);
    pintarLista();
    actualizarBotonSubir();
  });

  // Sube un único archivo con XMLHttpRequest (en vez de fetch) porque es
  // lo único que permite mostrar el progreso real de la subida, algo
  // importante para vídeos pesados en su calidad original.
  function subirArchivo({ id, file }, titulo, descripcion, club) {
    return new Promise((resolve, reject) => {
      const fila = listaArchivos.querySelector(`.item-archivo[data-id="${id}"]`);
      const barra = fila.querySelector(".barra-progreso i");
      const estadoTxt = fila.querySelector(".estado-txt");

      const formData = new FormData();
      formData.append("archivo", file, file.name);
      formData.append("titulo", titulo);
      formData.append("descripcion", descripcion);
      formData.append("club", club);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}/api/media`);
      xhr.setRequestHeader("Authorization", `Bearer ${TOKEN}`);

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          barra.style.width = pct + "%";
          estadoTxt.textContent = pct < 100 ? `Subiendo... ${pct}%` : "Procesando...";
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          fila.classList.add("completado");
          estadoTxt.textContent = "Subido correctamente";
          resolve();
        } else {
          let mensaje = "Error al subir";
          let esDuplicado = false;
          try {
            const cuerpo = JSON.parse(xhr.responseText);
            mensaje = cuerpo.error || mensaje;
            // "detail" trae el mensaje técnico real (p. ej. la respuesta
            // exacta de Cloudinary cuando la subida falla ahí), útil para
            // diagnosticar un 502 que si no se queda en un genérico "no
            // se pudo subir el archivo" sin más pista de la causa real.
            if (cuerpo.detail) mensaje += ` (${cuerpo.detail})`;
            esDuplicado = !!cuerpo.duplicado;
          } catch {
            // Respuesta no-JSON (p. ej. el servidor ha caído a medio
            // subir): se deja el mensaje genérico en vez de romper aquí.
            if (xhr.status === 413) mensaje = "El archivo es demasiado grande para el servidor";
            else if (xhr.status === 0) mensaje = "Se ha perdido la conexión durante la subida";
            else if (xhr.status >= 500) mensaje = "Error del servidor. Inténtalo de nuevo en unos minutos";
          }
          fila.classList.add(esDuplicado ? "duplicado" : "error");
          estadoTxt.textContent = esDuplicado ? `Ya subido antes: ${mensaje}` : mensaje;
          const error = new Error(mensaje);
          error.esDuplicado = esDuplicado;
          reject(error);
        }
      });
      xhr.addEventListener("error", () => {
        fila.classList.add("error");
        estadoTxt.textContent = "No se ha podido conectar con el servidor";
        reject(new Error("Error de red: no se ha podido conectar con el servidor"));
      });
      xhr.addEventListener("timeout", () => {
        fila.classList.add("error");
        estadoTxt.textContent = "La subida ha tardado demasiado y se ha cancelado";
        reject(new Error("Tiempo de espera agotado"));
      });
      xhr.addEventListener("abort", () => {
        fila.classList.add("error");
        estadoTxt.textContent = "Subida cancelada";
        reject(new Error("Subida cancelada"));
      });

      // Sin timeout, un corte de red a mitad de un vídeo pesado deja la
      // barra congelada indefinidamente sin avisar a quien está subiendo.
      xhr.timeout = 15 * 60 * 1000; // 15 minutos, margen amplio para vídeos grandes

      xhr.send(formData);
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgOk.style.display = "none";
    errMsg.style.display = "none";

    if (!archivos.length) {
      errMsg.textContent = "Añade al menos un archivo antes de subir.";
      errMsg.style.display = "block";
      return;
    }

    const titulo = document.getElementById("tituloSubida").value.trim();
    if (!titulo) {
      errMsg.textContent = "Escribe un título antes de subir.";
      errMsg.style.display = "block";
      document.getElementById("tituloSubida").focus();
      return;
    }
    const descripcion = document.getElementById("descripcionSubida").value.trim();
    const club = selectClub.value;

    // Aviso extra por si, a pesar del filtro al añadirlos, dos archivos
    // idénticos han llegado a convivir en la cola (p. ej. arrastrando la
    // misma carpeta dos veces con el explorador de archivos abierto).
    const vistos = [];
    const duplicadosDetectados = [];
    for (const { file } of archivos) {
      if (vistos.some((v) => mismoArchivo(v, file))) duplicadosDetectados.push(file.name);
      else vistos.push(file);
    }
    if (duplicadosDetectados.length) {
      mostrarAvisoDuplicado(duplicadosDetectados);
      return;
    }

    btnSubir.disabled = true;
    btnSubir.textContent = "Subiendo...";

    // Se suben de uno en uno (no en paralelo) para no saturar la subida
    // cuando hay varios vídeos pesados a la vez.
    let subidos = 0;
    const fallidos = []; // [{ id, file, mensaje, esDuplicado }]
    let totalIntentado = 0;
    for (const item of archivos) {
      totalIntentado++;
      try {
        // Si hay varios archivos, se numera el título para diferenciarlos
        // sin que el redactor tenga que repetirlo campo a campo.
        const tituloArchivo = archivos.length > 1 ? `${titulo} (${totalIntentado}/${archivos.length})` : titulo;
        await subirArchivo(item, tituloArchivo, descripcion, club);
        subidos++;
      } catch (err) {
        fallidos.push({ ...item, mensaje: err.message, esDuplicado: !!err.esDuplicado });
      }
    }

    btnSubir.textContent = "Subir contenido";

    if (fallidos.length === 0) {
      msgOk.textContent = `Se ${subidos === 1 ? "ha" : "han"} subido ${subidos} archivo${subidos === 1 ? "" : "s"} correctamente. Gracias por la aportación.`;
      msgOk.style.display = "block";
      form.reset();
      archivos = [];
      pintarLista();
      // Si quien sube tiene la galería de abajo cargada (la suya propia,
      // o la de todos si es admin), la refrescamos para que aparezca sin
      // recargar la página.
      if (document.getElementById("subpanel-ver").classList.contains("activo")) {
        cargaContenido();
      }
    } else {
      // Se dejan en la lista SOLO los archivos que han fallado (los que
      // se subieron bien desaparecen), para poder corregir el problema
      // y pulsar "Subir contenido" otra vez sin tener que volver a
      // seleccionar todo desde cero.
      archivos = fallidos.map(({ id, file }) => ({ id, file }));
      pintarLista();

      const duplicados = fallidos.filter((f) => f.esDuplicado);
      const otros = fallidos.filter((f) => !f.esDuplicado);
      const partes = [];
      if (subidos) partes.push(`${subidos} archivo${subidos === 1 ? "" : "s"} subido${subidos === 1 ? "" : "s"} correctamente`);
      if (duplicados.length) partes.push(`${duplicados.length} ya existía${duplicados.length === 1 ? "" : "n"} (contenido duplicado)`);
      if (otros.length) partes.push(`${otros.length} con error`);
      // Además del resumen, se detalla nombre + motivo de cada fallo (el
      // mensaje real que ha dado el servidor o la conexión, ya guardado en
      // "mensaje" al capturar el error en el bucle de subida de arriba):
      // antes solo se sabía CUÁNTOS habían fallado, no cuáles ni por qué,
      // y había que ir pasando el ratón por cada fila para enterarse.
      const detalle = fallidos.map((f) => `"${f.file.name}": ${f.mensaje}`).join(" · ");
      errMsg.textContent = partes.join(", ") + `. ${detalle}. Puedes quitar los que no quieras reintentar y volver a pulsar "Subir contenido".`;
      errMsg.style.display = "block";
    }
    actualizarBotonSubir();
  });
})();

// ---------- CONTENIDO SUBIDO POR REDACTORES (solo admins) ----------
let mediaActual = [];
let filtroMediaActivo = "todos";

const iconoFotoAdmin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 15l-5-5-9 9"/></svg>';
const iconoVideoAdmin = '<svg viewBox="0 0 24 24" class="icono-video" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="5" width="14" height="14" rx="2"/><path d="M16.5 10.5l5-3v9l-5-3z"/></svg>';
const iconoPlayAdmin = '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4z"/></svg>';

// A partir de la URL de Cloudinary genera una miniatura ligera y recortada:
// para fotos, la propia imagen redimensionada; para vídeos, un fotograma
// real (Cloudinary lo extrae solo, sin necesidad de guardar nada aparte).
function miniaturaCloudinary(url, tipo) {
  if (!url) return null;
  const marcador = tipo === "video" ? "/video/upload/" : "/image/upload/";
  const idx = url.indexOf(marcador);
  if (idx === -1) return null;
  const transform = "c_fill,w_400,h_344,q_auto,f_auto" + (tipo === "video" ? ",so_1" : "");
  const base = url.slice(0, idx + marcador.length) + transform + "/" + url.slice(idx + marcador.length);
  return tipo === "video" ? base.replace(/\.[a-zA-Z0-9]+$/, ".jpg") : base;
}

function formatoTamanoAdmin(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

async function cargaContenido() {
  const cont = document.getElementById("galeriaContenido");
  if (!cont) return;
  cont.innerHTML = "<p>Cargando...</p>";
  const ayuda = document.getElementById("ayudaGaleriaContenido");
  if (ayuda) {
    ayuda.textContent = USER.rol === "admin"
      ? "Fotos y vídeos subidos por el equipo de redacción. Se guardan en su calidad original: al descargarlos obtienes el archivo exacto que se subió, sin ninguna compresión. Cada persona solo puede editar lo que ha subido ella misma."
      : "Aquí ves las fotos y vídeos que has subido tú. Puedes editar el título, el club y la descripción cuando quieras.";
  }
  try {
    const { media = [] } = await apiFetch(`/api/media`);
    mediaActual = media;
    pintarGaleriaContenido();
  } catch (err) {
    cont.innerHTML = `<p>Error cargando el contenido: ${err.message}</p>`;
  }
}

function pintarGaleriaContenido() {
  const cont = document.getElementById("galeriaContenido");
  const lista = mediaActual.filter((m) => filtroMediaActivo === "todos" || m.tipo === filtroMediaActivo);

  if (!lista.length) {
    cont.innerHTML = USER.rol === "admin"
      ? "<p>Todavía no hay contenido subido por los redactores.</p>"
      : "<p>Todavía no has subido ningún contenido.</p>";
    return;
  }

  cont.innerHTML = lista.map((m) => {
    const esFoto = m.tipo === "foto";
    const urlDescarga = `${API_URL}/api/media/${m.id}/descargar?token=${encodeURIComponent(TOKEN)}`;
    const urlMiniatura = miniaturaCloudinary(m.cloudinary_url, esFoto ? "image" : "video");
    const iconoRespaldo = esFoto ? iconoFotoAdmin : iconoVideoAdmin;
    // Solo la persona que subió el archivo puede editarlo, sea admin o no.
    const esMio = m.autor_id === USER.id;
    const botones = [];
    if (esMio) botones.push(`<button class="btn-editar-media" onclick="editarMedia(${m.id})">Editar</button>`);
    if (USER.rol === "admin") {
      botones.push(`<a href="${urlDescarga}" class="btn-descargar" download="${escapeHtml(m.nombre_archivo)}">Descargar</a>`);
      botones.push(`<button class="btn-eliminar-media" onclick="eliminarMedia(${m.id})">Eliminar</button>`);
    }
    return `
      <div class="tarjeta-media">
        <div class="preview">
          <span class="badge-tipo">${esFoto ? "Foto" : "Vídeo"}</span>
          ${esMio ? `<span class="badge-mia">Tuyo</span>` : ""}
          ${
            urlMiniatura
              ? `<img src="${urlMiniatura}" alt="" loading="lazy" onerror="const p=this.parentElement;this.remove();p.querySelector('.icono-generico')?.classList.remove('oculto');">`
              : ""
          }
          <span class="icono-generico ${urlMiniatura ? "oculto" : ""}">${iconoRespaldo}</span>
          ${!esFoto ? `<span class="play-overlay">${iconoPlayAdmin}</span>` : ""}
        </div>
        <div class="cuerpo">
          <div class="titulo-media">${escapeHtml(m.titulo)}</div>
          ${m.descripcion ? `<div class="desc-media">${escapeHtml(m.descripcion)}</div>` : ""}
          <div class="meta-media">
            ${escapeHtml(m.autor_nombre || "—")}${m.club ? " · " + escapeHtml(m.club) : ""}<br>
            ${formatoTamanoAdmin(m.tamano_bytes)} · ${formatFecha(m.created_at)}
          </div>
        </div>
        ${botones.length ? `<div class="acciones-media">${botones.join("")}</div>` : ""}
      </div>`;
  }).join("");
}

// ---------- Editar contenido subido (modal, solo el autor) ----------
const modalEditarMedia = document.getElementById("modalEditarMedia");
const formEditarMedia = document.getElementById("formEditarMedia");
let emClubPoblado = false;

function poblarSelectClubEdicion() {
  const selectClub = document.getElementById("em_club");
  if (!selectClub || emClubPoblado) return;
  const todosLosClubes = listaTodosLosClubesFederativos().sort((a, b) => a.localeCompare(b));
  todosLosClubes.forEach((club) => {
    const opt = document.createElement("option");
    opt.value = club;
    opt.textContent = club;
    selectClub.appendChild(opt);
  });
  emClubPoblado = true;
}

function editarMedia(id) {
  const m = mediaActual.find((x) => x.id === id);
  if (!m) return;
  poblarSelectClubEdicion();
  document.getElementById("em_id").value = m.id;
  document.getElementById("em_titulo").value = m.titulo || "";
  document.getElementById("em_club").value = m.club || "";
  document.getElementById("em_descripcion").value = m.descripcion || "";
  document.getElementById("msgOkEditarMedia").style.display = "none";
  document.getElementById("errEditarMedia").style.display = "none";
  if (modalEditarMedia) modalEditarMedia.classList.add("abierto");
}

function cerrarModalEditarMedia() {
  if (modalEditarMedia) modalEditarMedia.classList.remove("abierto");
}

if (modalEditarMedia) {
  modalEditarMedia.addEventListener("click", (e) => {
    if (e.target === modalEditarMedia) cerrarModalEditarMedia();
  });
}

if (formEditarMedia) {
  formEditarMedia.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgOk = document.getElementById("msgOkEditarMedia");
    const errMsg = document.getElementById("errEditarMedia");
    msgOk.style.display = "none";
    errMsg.style.display = "none";

    const id = document.getElementById("em_id").value;
    const body = {
      titulo: document.getElementById("em_titulo").value.trim(),
      club: document.getElementById("em_club").value,
      descripcion: document.getElementById("em_descripcion").value.trim(),
    };

    try {
      await apiFetch(`/api/media/${id}`, { method: "PUT", body: JSON.stringify(body) });
      msgOk.style.display = "block";
      await cargaContenido();
      setTimeout(cerrarModalEditarMedia, 700);
    } catch (err) {
      errMsg.textContent = err.message;
      errMsg.style.display = "block";
    }
  });
}

document.querySelectorAll(".filtros-contenido button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filtros-contenido button").forEach((b) => b.classList.remove("activo"));
    btn.classList.add("activo");
    filtroMediaActivo = btn.dataset.filtroMedia;
    pintarGaleriaContenido();
  });
});

async function eliminarMedia(id) {
  if (!(await EOF.confirmar("¿Eliminar este archivo? Esta acción no se puede deshacer.", { peligroso: true, textoConfirmar: "Eliminar" }))) return;
  try {
    await apiFetch(`/api/media/${id}`, { method: "DELETE" });
    cargaContenido();
  } catch (err) {
    EOF.toast("Error al eliminar: " + err.message, "error");
  }
}

// ---------- USUARIOS (solo admins) ----------
async function cargaUsuarios() {
  const cos = document.getElementById("tablaUsuarios");
  if (!cos) return;
  cos.innerHTML = "<tr><td colspan='8'>Cargando...</td></tr>";
  try {
    const { users = [] } = await apiFetch(`/api/users`);

    // Contador bonito: "usuarios que ya han iniciado sesión (los que
    // tienen correo electrónico puesto) / usuarios registrados en total".
    const contadorEl = document.getElementById("contadorUsuarios");
    const contadorNumeroEl = document.getElementById("contadorUsuariosNumero");
    if (contadorEl && contadorNumeroEl) {
      const conSesionIniciada = users.filter(u => u.email && String(u.email).trim() !== "").length;
      contadorNumeroEl.textContent = `${conSesionIniciada} / ${users.length}`;
      contadorEl.style.display = users.length ? "flex" : "none";
    }

    cos.innerHTML = users.map(u => {
      const equipos = Array.isArray(u.equipo) ? u.equipo : (u.equipo ? [u.equipo] : []);
      const etiquetaBoton = (u.categorias_fijas && u.categorias_fijas.length)
        ? `Categoría fija: ${escapeHtml(u.categorias_fijas.map(categoriaLabel).join(" / "))}`
        : (equipos.length ? escapeHtml(equipos.join(" / ")) : "— Sin especificar —");
      const nivelEsAdmin = u.rol === "admin";
      const nivelMostrado = nivelEsAdmin ? 4 : (u.nivel || 1);
      const nivelInfo = NIVELES_ETIQUETA[nivelMostrado] || NIVELES_ETIQUETA[1];
      // Igual que en la cabecera del panel: si no tiene foto, mostramos
      // sus iniciales en un círculo en lugar de un hueco vacío.
      const avatarHTML = u.avatar_url
        ? `<span class="avatar-usuario" style="background-image:url('${escapeHtml(u.avatar_url)}')"></span>`
        : `<span class="avatar-usuario avatar-usuario-iniciales">${escapeHtml(iniciales(u.nombre) || "?")}</span>`;
      return `
      <tr>
        <td data-label="Usuario">${avatarHTML}${escapeHtml(u.username)} <span class="id-usuario-panel" title="ID de usuario (para la ficha de cuentas de X)">#${u.id}</span></td>
        <td data-label="Nombre">${escapeHtml(u.nombre)}</td>
        <td data-label="Rol">
          <select class="select-rol rol-${u.rol}" onchange="this.className='select-rol rol-'+this.value; cambiarRolUsuario(${u.id}, this.value)" ${u.id === USER.id ? "disabled title='No puedes cambiar tu propio rol'" : ""}>
            <option value="redactor" ${u.rol === "redactor" ? "selected" : ""}>Redactor</option>
            <option value="admin" ${u.rol === "admin" ? "selected" : ""}>Administrador</option>
          </select>
        </td>
        <td data-label="Correo">${escapeHtml(u.email || "—")}</td>
        <td data-label="Equipo / Categoría">
          <button type="button" class="editar btn-equipos-usuario" onclick='abrirModalEquiposUsuario(${u.id}, ${JSON.stringify(u.nombre)}, ${JSON.stringify(equipos)}, ${JSON.stringify(u.categorias_fijas || [])})'>${etiquetaBoton}</button>
        </td>
        <td data-label="Nivel">
          <button type="button" class="editar btn-nivel-usuario nivel-badge nivel-badge-${nivelMostrado}" ${nivelEsAdmin ? `disabled title="Los administradores están siempre en el nivel máximo y no se puede editar"` : `onclick='abrirModalNivelUsuario(${u.id}, ${JSON.stringify(u.nombre)})'`}>${nivelInfo.emoji} Nivel ${nivelMostrado} — ${nivelInfo.nombre}</button>
        </td>
        <td data-label="Estado"><span class="badge-estado ${u.activo ? "publicado" : "borrador"}">${u.activo ? "Activo" : "Inactivo"}</span></td>
        <td class="acciones acciones-usuario" data-label="">
          <button class="editar" onclick="window.open('../autor.html?id=${u.id}', '_blank')">Previsualizar perfil</button>
          <button class="editar" onclick='restablecerPasswordUsuario(${u.id}, ${JSON.stringify(u.username)}, ${JSON.stringify(u.nombre)})'>Restablecer contraseña</button>
          <button onclick="alternarActivoUsuario(${u.id}, ${u.activo ? 0 : 1})" ${u.id === USER.id ? "disabled title='No puedes desactivar tu propia cuenta'" : ""}>${u.activo ? "Desactivar" : "Activar"}</button>
          <button class="eliminar" onclick="eliminarUsuario(${u.id}, '${escapeHtml(u.username)}')" ${u.id === USER.id ? "disabled title='No puedes eliminar tu propia cuenta'" : ""}>Eliminar</button>
        </td>
      </tr>`;
    }).join("") || "<tr><td colspan='8'>Todavía no hay usuarios.</td></tr>";
  } catch (err) {
    cos.innerHTML = `<tr><td colspan="8">Error cargando: ${err.message}</td></tr>`;
  }
}

// Cuentas públicas de lectores (registradas desde "Acceso" para poder
// comentar con su nombre). Solo lectura desde el panel: se gestionan
// solas desde la web pública (registro, verificación de correo,
// contraseña), así que aquí no hay ni crear ni editar ni borrar.
async function cargaLectores() {
  const cos = document.getElementById("tablaLectores");
  if (!cos) return;
  cos.innerHTML = "<tr><td colspan='4'>Cargando...</td></tr>";
  try {
    const { readers = [] } = await apiFetch(`/api/readers`);

    const contadorEl = document.getElementById("contadorLectores");
    const contadorNumeroEl = document.getElementById("contadorLectoresNumero");
    if (contadorEl && contadorNumeroEl) {
      const verificados = readers.filter(r => r.email_verificado).length;
      contadorNumeroEl.textContent = `${verificados} / ${readers.length}`;
      contadorEl.style.display = readers.length ? "flex" : "none";
    }

    cos.innerHTML = readers.map(r => {
      const fecha = r.created_at ? new Date(r.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";
      const estadoTexto = !r.activo ? "Inactivo" : (r.email_verificado ? "Verificado" : "Sin verificar");
      const estadoClase = !r.activo ? "borrador" : (r.email_verificado ? "publicado" : "borrador");
      return `
      <tr>
        <td data-label="Nombre">${escapeHtml(r.nombre)}</td>
        <td data-label="Correo">${escapeHtml(r.email)}</td>
        <td data-label="Estado"><span class="badge-estado ${estadoClase}">${estadoTexto}</span></td>
        <td data-label="Registrado">${fecha}</td>
      </tr>`;
    }).join("") || "<tr><td colspan='4'>Todavía no hay lectores registrados.</td></tr>";
  } catch (err) {
    cos.innerHTML = `<tr><td colspan="4">Error cargando: ${err.message}</td></tr>`;
  }
}

// Picker de equipos del formulario "Crear nuevo usuario": se monta una
// vez al cargar la página (no hace falta re-montarlo salvo al resetear
// el formulario tras crear un usuario).
let nuEquipoPicker = iniciarEquiposPicker({
  contadorEl: document.getElementById("nu_equipo_contador"),
  buscadorEl: document.getElementById("nu_equipo_buscador"),
  listaEl: document.getElementById("nu_equipo_lista"),
  ayudaEl: document.getElementById("nu_equipo_ayuda"),
}, []);

// Picker de categoría(s) fija(s), mismo widget que el de Equipo. Al
// añadir alguna se oculta el bloque de Equipo (este tipo de redactor no
// tiene equipo, ver worker/schema.sql): se comprueba en cada guardado,
// no hace falta un listener aparte, porque el picker no dispara ningún
// evento propio al cambiar la selección salvo el que gestiona sus chips.
let nuCategoriaFijaPicker = iniciarCategoriasFijasPicker({
  contadorEl: document.getElementById("nu_categoria_fija_contador"),
  buscadorEl: document.getElementById("nu_categoria_fija_buscador"),
  listaEl: document.getElementById("nu_categoria_fija_lista"),
  ayudaEl: document.getElementById("nu_categoria_fija_ayuda"),
}, []);
const nuEquipoBloque = document.getElementById("nu_equipo_bloque");
// El picker de categoría no avisa por evento al cambiar; como el bloque
// de Equipo solo hay que ocultarlo/mostrarlo justo antes de leer la
// selección (al enviar el formulario), basta con recalcularlo ahí. Para
// que también se oculte en caliente mientras se marca/desmarca (mejor
// experiencia visual), se engancha un listener a los propios chips una
// vez creados: como el picker los recrea en cada render() (al buscar),
// se usa delegación de eventos sobre el contenedor de la lista.
document.getElementById("nu_categoria_fija_lista")?.addEventListener("change", () => {
  nuEquipoBloque.style.display = nuCategoriaFijaPicker.obtenerSeleccion().length ? "none" : "";
});

const formNuevoUsuario = document.getElementById("formNuevoUsuario");
if (formNuevoUsuario) {
  formNuevoUsuario.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgOk = document.getElementById("msgOkUsuario");
    const errMsg = document.getElementById("errUsuario");
    msgOk.style.display = "none";
    errMsg.style.display = "none";

    const password = document.getElementById("nu_password").value;
    if (password && password.length < 8) {
      errMsg.textContent = "La contraseña debe tener al menos 8 caracteres (o déjala en blanco para generar una automáticamente).";
      errMsg.style.display = "block";
      return;
    }

    const categoriasFijas = nuCategoriaFijaPicker.obtenerSeleccion();

    // El picker de equipos solo se valida/envía si el redactor NO tiene
    // ninguna categoría fija marcada (ese tipo de redactor no tiene equipo).
    if (!categoriasFijas.length && !nuEquipoPicker.esValido()) {
      errMsg.textContent = "Puedes dejarlo sin especificar o elegir hasta 3 equipos.";
      errMsg.style.display = "block";
      return;
    }

    const body = {
      username: document.getElementById("nu_username").value.trim(),
      nombre: document.getElementById("nu_nombre").value.trim(),
      rol: document.getElementById("nu_rol").value,
      email: document.getElementById("nu_email").value.trim(),
      categorias_fijas: categoriasFijas,
      equipo: categoriasFijas.length ? [] : nuEquipoPicker.obtenerSeleccion(),
      password,
    };

    try {
      const data = await apiFetch(`/api/users`, { method: "POST", body: JSON.stringify(body) });
      msgOk.textContent = `Usuario "${data.username}" creado correctamente.`;
      msgOk.style.display = "block";
      const nombreCreado = body.nombre;
      formNuevoUsuario.reset();
      nuEquipoBloque.style.display = "";
      nuEquipoPicker = iniciarEquiposPicker({
        contadorEl: document.getElementById("nu_equipo_contador"),
        buscadorEl: document.getElementById("nu_equipo_buscador"),
        listaEl: document.getElementById("nu_equipo_lista"),
        ayudaEl: document.getElementById("nu_equipo_ayuda"),
      }, []);
      nuCategoriaFijaPicker = iniciarCategoriasFijasPicker({
        contadorEl: document.getElementById("nu_categoria_fija_contador"),
        buscadorEl: document.getElementById("nu_categoria_fija_buscador"),
        listaEl: document.getElementById("nu_categoria_fija_lista"),
        ayudaEl: document.getElementById("nu_categoria_fija_ayuda"),
      }, []);
      cargaUsuarios();
      abrirModalPasswordGenerada(data.username, data.password, nombreCreado);
    } catch (err) {
      errMsg.textContent = err.message;
      errMsg.style.display = "block";
    }
  });
}

async function cambiarRolUsuario(id, rol) {
  try {
    await apiFetch(`/api/users/${id}`, { method: "PUT", body: JSON.stringify({ rol }) });
    cargaUsuarios();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
    cargaUsuarios();
  }
}

// ---------- Modal "Editar equipos" (tabla de Usuarios, solo admins) ----------
const equiposUsuarioEquipoBloque = document.getElementById("equiposUsuario_equipo_bloque");
let equiposUsuarioCategoriaFijaPicker = null;
document.getElementById("equiposUsuarioCategoriaFijaLista")?.addEventListener("change", () => {
  if (!equiposUsuarioCategoriaFijaPicker || !equiposUsuarioEquipoBloque) return;
  equiposUsuarioEquipoBloque.style.display = equiposUsuarioCategoriaFijaPicker.obtenerSeleccion().length ? "none" : "";
});
function abrirModalEquiposUsuario(id, nombre, equiposActuales, categoriasFijasActuales) {
  document.getElementById("equiposUsuarioId").value = id;
  document.getElementById("equiposUsuarioNombre").textContent = nombre;
  document.getElementById("msgOkEquiposUsuario").style.display = "none";
  document.getElementById("errEquiposUsuario").style.display = "none";
  const actuales = categoriasFijasActuales || [];
  equiposUsuarioCategoriaFijaPicker = iniciarCategoriasFijasPicker({
    contadorEl: document.getElementById("equiposUsuarioCategoriaFijaContador"),
    buscadorEl: document.getElementById("equiposUsuarioCategoriaFijaBuscador"),
    listaEl: document.getElementById("equiposUsuarioCategoriaFijaLista"),
    ayudaEl: document.getElementById("equiposUsuarioCategoriaFijaAyuda"),
  }, actuales);
  if (equiposUsuarioEquipoBloque) {
    equiposUsuarioEquipoBloque.style.display = actuales.length ? "none" : "";
  }
  modalEquiposPicker = iniciarEquiposPicker({
    contadorEl: document.getElementById("equiposUsuarioContador"),
    buscadorEl: document.getElementById("equiposUsuarioBuscador"),
    listaEl: document.getElementById("equiposUsuarioLista"),
    ayudaEl: document.getElementById("equiposUsuarioAyuda"),
  }, equiposActuales || []);
  document.getElementById("modalEquiposUsuario").classList.add("abierto");
}
function cerrarModalEquiposUsuario() {
  document.getElementById("modalEquiposUsuario").classList.remove("abierto");
}
const modalEquiposUsuarioEl = document.getElementById("modalEquiposUsuario");
if (modalEquiposUsuarioEl) {
  modalEquiposUsuarioEl.addEventListener("click", (e) => {
    if (e.target === modalEquiposUsuarioEl) cerrarModalEquiposUsuario();
  });
}
const btnGuardarEquiposUsuario = document.getElementById("btnGuardarEquiposUsuario");
if (btnGuardarEquiposUsuario) {
  btnGuardarEquiposUsuario.addEventListener("click", async () => {
    const errMsg = document.getElementById("errEquiposUsuario");
    const msgOk = document.getElementById("msgOkEquiposUsuario");
    errMsg.style.display = "none";
    msgOk.style.display = "none";
    const categoriasFijas = equiposUsuarioCategoriaFijaPicker ? equiposUsuarioCategoriaFijaPicker.obtenerSeleccion() : [];
    if (!categoriasFijas.length && (!modalEquiposPicker || !modalEquiposPicker.esValido())) {
      errMsg.textContent = "Puedes dejarlo sin especificar o elegir hasta 3 equipos.";
      errMsg.style.display = "block";
      return;
    }
    const id = document.getElementById("equiposUsuarioId").value;
    try {
      await apiFetch(`/api/users/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          categorias_fijas: categoriasFijas,
          equipo: categoriasFijas.length ? [] : modalEquiposPicker.obtenerSeleccion(),
        }),
      });
      msgOk.style.display = "block";
      cargaUsuarios();
      setTimeout(cerrarModalEquiposUsuario, 700);
    } catch (err) {
      errMsg.textContent = err.message;
      errMsg.style.display = "block";
    }
  });
}

// ---------- Modal "Nivel" (tabla de Usuarios, solo admins) ----------
// Al abrirse pide en paralelo el progreso (mismo cálculo que "Mi
// progreso", vía /api/users que ya lo trae, así que se reutiliza) y el
// historial de cambios de nivel de esa persona.
async function abrirModalNivelUsuario(id, nombre) {
  document.getElementById("nivelUsuarioId").value = id;
  document.getElementById("nivelUsuarioNombre").textContent = nombre;
  document.getElementById("msgOkNivelUsuario").style.display = "none";
  document.getElementById("errNivelUsuario").style.display = "none";
  document.getElementById("nu_nivel_nota").value = "";
  document.getElementById("nivelUsuarioProgreso").innerHTML = `<p class="sesiones-vacio">Cargando…</p>`;
  document.getElementById("nivelUsuarioHistorial").innerHTML = `<p class="sesiones-vacio">Cargando…</p>`;
  document.getElementById("modalNivelUsuario").classList.add("abierto");

  try {
    // Se relee de /api/users (no hay un GET individual) porque ya trae
    // nivel + progreso_nivel calculado; para una tabla con pocos
    // colaboradores esto es más simple que crear un endpoint solo para
    // este modal.
    const { users = [] } = await apiFetch(`/api/users`);
    const user = users.find((u) => u.id === id);
    const esAdmin = user && user.rol === "admin";
    const selectNivel = document.getElementById("nu_nivel_select");
    const notaNivel = document.getElementById("nu_nivel_nota");
    const btnGuardar = document.getElementById("btnGuardarNivelUsuario");
    selectNivel.value = String((esAdmin ? 4 : (user && user.nivel)) || 1);
    selectNivel.disabled = Boolean(esAdmin);
    notaNivel.disabled = Boolean(esAdmin);
    if (btnGuardar) btnGuardar.disabled = Boolean(esAdmin);
    if (user && user.nivel_nota) notaNivel.placeholder = `Nota actual: ${user.nivel_nota}`;
    pintarProgresoModalNivel(user ? user.progreso_nivel : null);
  } catch (err) {
    document.getElementById("nivelUsuarioProgreso").innerHTML = `<p class="sesiones-vacio">No se ha podido cargar el progreso.</p>`;
  }

  try {
    const { historial = [] } = await apiFetch(`/api/users/${id}/nivel-historial`);
    pintarHistorialNivel(historial);
  } catch (err) {
    document.getElementById("nivelUsuarioHistorial").innerHTML = `<p class="sesiones-vacio">No se ha podido cargar el historial.</p>`;
  }
}

function pintarProgresoModalNivel(progresoData) {
  const cont = document.getElementById("nivelUsuarioProgreso");
  if (!progresoData) {
    cont.innerHTML = `<p class="sesiones-vacio">Sin datos de progreso.</p>`;
    return;
  }
  const filas = Object.entries(NIVELES_TIPO_LABEL).map(([tipo, label]) => `
    <div class="nivel-stat nivel-stat-compacta">
      <div class="nivel-stat-icono">${NIVELES_TIPO_ICONO[tipo] || ""}</div>
      <div class="nivel-stat-num">${progresoData.publicaciones[tipo] || 0}</div>
      <div class="nivel-stat-label">${label}</div>
    </div>`
  ).join("");
  let siguiente = "";
  if (!progresoData.nivel_maximo && progresoData.progreso) {
    const cumple = progresoData.progreso.cumple_requisitos;
    siguiente = `<p class="ayuda-editor nivel-ayuda" style="margin-top:8px;">
      ${cumple ? "✅ Ya cumple las cifras mínimas para el siguiente nivel." : `Todavía no cumple todas las cifras para ${progresoData.siguiente_nivel_info.emoji} Nivel ${progresoData.siguiente_nivel} — ${progresoData.siguiente_nivel_info.nombre}.`}
    </p>`;
  }
  cont.innerHTML = `<div class="nivel-stats-grid nivel-stats-grid-compacta">${filas}</div>${siguiente}`;
}

function pintarHistorialNivel(historial) {
  const cont = document.getElementById("nivelUsuarioHistorial");
  if (!historial.length) {
    cont.innerHTML = `<p class="sesiones-vacio">Todavía no ha tenido ningún cambio de nivel.</p>`;
    return;
  }
  cont.innerHTML = historial.map((h) => `
    <div class="fila-sesion">
      <div class="datos-sesion">
        <div class="dispositivo-nombre">Nivel ${h.nivel_anterior} → Nivel ${h.nivel_nuevo}</div>
        <div class="detalle-sesion">
          ${formatearFechaSesion(h.created_at)} · por ${escapeHtml(h.cambiado_por_nombre)}
          ${h.motivo ? ` · ${escapeHtml(h.motivo)}` : ""}
        </div>
      </div>
    </div>
  `).join("");
}

function cerrarModalNivelUsuario() {
  document.getElementById("modalNivelUsuario").classList.remove("abierto");
}
const modalNivelUsuarioEl = document.getElementById("modalNivelUsuario");
if (modalNivelUsuarioEl) {
  modalNivelUsuarioEl.addEventListener("click", (e) => {
    if (e.target === modalNivelUsuarioEl) cerrarModalNivelUsuario();
  });
}
const btnGuardarNivelUsuario = document.getElementById("btnGuardarNivelUsuario");
if (btnGuardarNivelUsuario) {
  btnGuardarNivelUsuario.addEventListener("click", async () => {
    const errMsg = document.getElementById("errNivelUsuario");
    const msgOk = document.getElementById("msgOkNivelUsuario");
    errMsg.style.display = "none";
    msgOk.style.display = "none";
    const id = document.getElementById("nivelUsuarioId").value;
    const nivel = parseInt(document.getElementById("nu_nivel_select").value, 10);
    const nota = document.getElementById("nu_nivel_nota").value.trim();
    try {
      await apiFetch(`/api/users/${id}/nivel`, {
        method: "PUT",
        body: JSON.stringify({ nivel, nota: nota || undefined }),
      });
      msgOk.style.display = "block";
      cargaUsuarios();
      // Se cierra solo tras guardar: se deja un instante corto para que
      // dé tiempo a ver el mensaje de éxito antes de que el modal
      // desaparezca, en vez de tener que cerrarlo a mano cada vez.
      setTimeout(cerrarModalNivelUsuario, 900);
    } catch (err) {
      errMsg.textContent = err.message;
      errMsg.style.display = "block";
    }
  });
}

async function alternarActivoUsuario(id, activo) {
  try {
    await apiFetch(`/api/users/${id}`, { method: "PUT", body: JSON.stringify({ activo: !!activo }) });
    cargaUsuarios();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

async function restablecerPasswordUsuario(id, username, nombre) {
  if (!(await EOF.confirmar(`¿Restablecer la contraseña de "${username}"? Se generará una nueva contraseña.`, { textoConfirmar: "Restablecer" }))) return;
  try {
    const data = await apiFetch(`/api/users/${id}/reset-password`, { method: "PUT", body: JSON.stringify({}) });
    abrirModalPasswordGenerada(data.username, data.password, nombre);
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

// ---------- Modal de contraseña generada (restablecer / crear usuario) ----------
// Guarda el nombre de la persona para poder rellenar el mensaje de
// WhatsApp con "Buenas noches, [nombre]." en vez del username técnico.
// Si no se pasa (p.ej. al restablecer contraseña, donde solo tenemos el
// username) se usa el username como alternativa.

function abrirModalPasswordGenerada(username, password, nombre) {
  document.getElementById("pg_username").textContent = username;
  document.getElementById("pg_password").value = password;
  pgNombrePersona = (nombre || "").trim() || username;
  const btnCopiar = document.getElementById("btnCopiarPasswordGenerada");
  btnCopiar.classList.remove("copiado");
  btnCopiar.querySelector("span").textContent = "Copiar";
  document.getElementById("pg_copiado").classList.remove("visible");
  document.getElementById("modalPasswordGenerada").classList.add("abierto");
}

function cerrarModalPasswordGenerada() {
  document.getElementById("modalPasswordGenerada").classList.remove("abierto");
}

// Construye el mensaje de bienvenida con las credenciales ya rellenadas
// para mandarlo por WhatsApp a la persona recién dada de alta.

// Saludo según la hora local del dispositivo en el momento de crear el
// usuario o restablecer la contraseña:
//   05:00 - 14:00  -> Buenos días
//   14:01 - 20:59  -> Buenas tardes
//   21:00 - 04:59  -> Buenas noches
function saludoSegunHora() {
  const hora = new Date().getHours();
  const minutos = new Date().getMinutes();
  const minutosDelDia = hora * 60 + minutos;
  if (minutosDelDia >= 5 * 60 && minutosDelDia <= 14 * 60) return "Buenos días";
  if (minutosDelDia >= 14 * 60 + 1 && minutosDelDia <= 20 * 60 + 59) return "Buenas tardes";
  return "Buenas noches";
}

function mensajeCredencialesWhatsapp() {
  const username = document.getElementById("pg_username").textContent;
  const password = document.getElementById("pg_password").value;
  return `${saludoSegunHora()}, ${pgNombrePersona}.

Ya tienes disponibles tus credenciales de acceso al portal web del medio para que puedas entrar y subir noticias, crónicas, opiniones, entrevistas o cualquier otro tipo de contenido, incluyendo material visual grabado en el estadio.

A partir de ahora, todo el contenido se publicará directamente en la web. Si quieres, puedes acceder y cambiar tu contraseña para establecer una que recuerdes fácilmente.

La primera vez que inicies sesión, el sistema te solicitará añadir un correo electrónico de recuperación por si en algún momento olvidas tus credenciales. En caso excepcional, podrás solicitar un restablecimiento de acceso.

*Usuario:* ${username}

*Contraseña:* ${password}

¡Muchas gracias por tu colaboración! 👌

https://elotrofutbol.media/admin/login`;
}

document.getElementById("btnEnviarMensajePasswordGenerada")?.addEventListener("click", async () => {
  const mensaje = mensajeCredencialesWhatsapp();
  // Copia el mensaje al portapapeles (por si hay que pegarlo a mano) y
  // además abre WhatsApp con el texto ya listo para elegir el chat y
  // enviarlo. wa.me sin número abre el selector de contacto/chat.
  try {
    await navigator.clipboard.writeText(mensaje);
  } catch {
    // Si el navegador bloquea el portapapeles, seguimos igualmente:
    // WhatsApp Web/app se abre con el texto precargado de todos modos.
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener");
});

document.getElementById("btnCopiarMensajePasswordGenerada")?.addEventListener("click", async () => {
  const mensaje = mensajeCredencialesWhatsapp();
  const btn = document.getElementById("btnCopiarMensajePasswordGenerada");
  try {
    await navigator.clipboard.writeText(mensaje);
  } catch {
    // Si el navegador bloquea el portapapeles, se avisa igualmente del
    // "copiado" (es el mismo texto que ya se intenta copiar al enviar
    // por WhatsApp) para no romper el flujo visual del botón.
  }
  btn.classList.add("copiado");
  btn.querySelector("span").textContent = "Mensaje copiado";
  setTimeout(() => {
    btn.classList.remove("copiado");
    btn.querySelector("span").textContent = "Copiar mensaje";
  }, 2500);
});

document.getElementById("btnCopiarPasswordGenerada")?.addEventListener("click", async () => {
  const input = document.getElementById("pg_password");
  const btn = document.getElementById("btnCopiarPasswordGenerada");
  const aviso = document.getElementById("pg_copiado");
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    // Si el navegador bloquea el portapapeles (p. ej. sin HTTPS), se
    // recurre al método clásico de seleccionar + copiar.
    input.select();
    document.execCommand("copy");
  }
  btn.classList.add("copiado");
  btn.querySelector("span").textContent = "Copiada";
  aviso.classList.add("visible");
  setTimeout(() => {
    btn.classList.remove("copiado");
    btn.querySelector("span").textContent = "Copiar";
    aviso.classList.remove("visible");
  }, 2500);
});

async function eliminarUsuario(id, username) {
  if (!(await EOF.confirmar(`¿Seguro que quieres eliminar al usuario "${username}"? Esta acción no se puede deshacer.`, { peligroso: true, textoConfirmar: "Eliminar" }))) return;
  try {
    await apiFetch(`/api/users/${id}`, { method: "DELETE" });
    cargaUsuarios();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

// Muestra fecha + hora (a diferencia de formatFecha(), que solo da el día)
// para los datos de "próximo/último envío del boletín", donde la hora sí
// importa (saber si el envío automático de hoy ya ha pasado o no).
function formatFechaHoraNewsletter(fechaStr) {
  if (!fechaStr) return null;
  // Las fechas de newsletter_envios llegan en SQL datetime ("YYYY-MM-DD
  // HH:MM:SS", hora UTC sin sufijo) o ya en ISO con "Z" (la calculada en
  // el propio worker para "próximo envío"): se normaliza a ISO con "Z"
  // antes de parsear para no depender de cómo la interprete cada navegador.
  let raw = String(fechaStr).trim();
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(raw)) {
    raw = (raw.includes("T") ? raw : raw.replace(" ", "T")) + "Z";
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("es-ES", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------- NEWSLETTER: suscriptores al boletín semanal (solo admins) ----------
// Solo lectura + eliminar: la suscripción y la baja las gestiona la propia
// persona desde el sitio público (formulario del pie de página / enlace de
// baja del email); aquí un admin solo puede consultar la lista y quitar a
// alguien a mano si hiciera falta (p. ej. una petición por otra vía).
async function cargaNewsletter() {
  const cos = document.getElementById("tablaNewsletter");
  if (!cos) return;
  cos.innerHTML = "<tr><td colspan='4'>Cargando...</td></tr>";
  try {
    const { suscriptores = [], ultimo_envio_at, proximo_envio_at } = await apiFetch(`/api/newsletter/suscriptores`);

    const contadorEl = document.getElementById("contadorNewsletter");
    const contadorNumeroEl = document.getElementById("contadorNewsletterNumero");
    if (contadorEl && contadorNumeroEl) {
      const activos = suscriptores.filter(s => s.activo).length;
      contadorNumeroEl.textContent = `${activos} / ${suscriptores.length}`;
      contadorEl.style.display = suscriptores.length ? "flex" : "none";
    }

    // El próximo envío automático es siempre "dentro de X días" (o "hoy",
    // calculado por el propio backend); el último puede no haber ocurrido
    // nunca todavía (proyecto recién desplegado), caso que se rotula
    // aparte en vez de dejarlo en blanco.
    const infoEl = document.getElementById("newsletterEnvioInfo");
    const proximoEl = document.getElementById("newsletterProximoEnvio");
    const ultimoEl = document.getElementById("newsletterUltimoEnvio");
    if (infoEl && proximoEl && ultimoEl) {
      infoEl.style.display = "flex";
      proximoEl.textContent = formatFechaHoraNewsletter(proximo_envio_at) || "Por calcular";
      ultimoEl.textContent = formatFechaHoraNewsletter(ultimo_envio_at) || "Todavía no se ha enviado ninguno";
    }

    cos.innerHTML = suscriptores.map(s => `
      <tr>
        <td data-label="Email">${escapeHtml(s.email)}</td>
        <td data-label="Estado"><span class="badge-estado ${s.activo ? "publicado" : "borrador"}">${s.activo ? "Activo" : "De baja"}</span></td>
        <td data-label="Suscrito desde">${formatFecha(s.created_at)}</td>
        <td class="acciones" data-label="">
          <button class="eliminar" onclick="eliminarSuscriptorNewsletter(${s.id}, this.dataset.email)" data-email="${escapeHtml(s.email)}">Eliminar</button>
        </td>
      </tr>`).join("") || "<tr><td colspan='4'>Todavía no hay nadie suscrito.</td></tr>";
  } catch (err) {
    cos.innerHTML = `<tr><td colspan="4">Error cargando: ${err.message}</td></tr>`;
  }
}


async function eliminarSuscriptorNewsletter(id, email) {
  if (!(await EOF.confirmar(`¿Seguro que quieres eliminar a "${email}" de la lista del boletín? Esta acción no se puede deshacer.`, { peligroso: true, textoConfirmar: "Eliminar" }))) return;
  try {
    await apiFetch(`/api/newsletter/suscriptores/${id}`, { method: "DELETE" });
    cargaNewsletter();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
}

// ---------- NEWSLETTER: envío manual (solo admins) ----------
// Reutiliza /api/newsletter/suscriptores (la misma lista que ya se ve en
// la tabla) para el picker de destinatarios, así no hay que duplicar
// datos ni mantener dos fuentes distintas sincronizadas. Solo se listan
// los activos: no tiene sentido ofrecer seleccionar a alguien de baja.
let NEWSLETTER_SUSCRIPTORES_ACTIVOS = [];
let NEWSLETTER_SELECCION = new Set();

async function abrirModalEnviarNewsletter() {
  ocultarMensajesNewsletter();
  document.getElementById("enviarNewsletterTodos").checked = true;
  document.getElementById("enviarNewsletterListaWrap").style.display = "none";
  document.getElementById("enviarNewsletterBuscador").value = "";
  NEWSLETTER_SELECCION = new Set();
  document.getElementById("modalEnviarNewsletter").classList.add("abierto");
  try {
    const { suscriptores = [] } = await apiFetch(`/api/newsletter/suscriptores`);
    NEWSLETTER_SUSCRIPTORES_ACTIVOS = suscriptores.filter(s => s.activo);
    pintarListaEnviarNewsletter();
  } catch (err) {
    mostrarErrorNewsletter("No se pudo cargar la lista de suscriptores: " + err.message);
  }
}

function cerrarModalEnviarNewsletter() {
  document.getElementById("modalEnviarNewsletter").classList.remove("abierto");
}
const modalEnviarNewsletterEl = document.getElementById("modalEnviarNewsletter");
if (modalEnviarNewsletterEl) {
  modalEnviarNewsletterEl.addEventListener("click", (e) => {
    if (e.target === modalEnviarNewsletterEl) cerrarModalEnviarNewsletter();
  });
}

function ocultarMensajesNewsletter() {
  document.getElementById("msgOkEnviarNewsletter").classList.remove("visible");
  document.getElementById("errEnviarNewsletter").classList.remove("visible");
}
function mostrarErrorNewsletter(texto) {
  const err = document.getElementById("errEnviarNewsletter");
  document.getElementById("msgOkEnviarNewsletter").classList.remove("visible");
  err.textContent = texto;
  err.classList.add("visible");
}
function mostrarOkNewsletter(texto) {
  const ok = document.getElementById("msgOkEnviarNewsletter");
  document.getElementById("errEnviarNewsletter").classList.remove("visible");
  ok.textContent = texto;
  ok.classList.add("visible");
}

function alternarSeleccionTodosNewsletter() {
  const todos = document.getElementById("enviarNewsletterTodos").checked;
  document.getElementById("enviarNewsletterListaWrap").style.display = todos ? "none" : "block";
}

function filtrarListaEnviarNewsletter() {
  pintarListaEnviarNewsletter();
}

function pintarListaEnviarNewsletter() {
  const cont = document.getElementById("enviarNewsletterLista");
  const filtro = (document.getElementById("enviarNewsletterBuscador").value || "").trim().toLowerCase();
  const filtrados = NEWSLETTER_SUSCRIPTORES_ACTIVOS.filter(s => !filtro || s.email.toLowerCase().includes(filtro));
  if (!filtrados.length) {
    cont.innerHTML = `<p class="newsletter-picker-vacio">${NEWSLETTER_SUSCRIPTORES_ACTIVOS.length ? "Ningún suscriptor coincide con la búsqueda." : "No hay suscriptores activos."}</p>`;
  } else {
    cont.innerHTML = filtrados.map(s => `
      <label class="newsletter-picker-item">
        <input type="checkbox" class="newsletter-check-input" data-newsletter-id="${s.id}" ${NEWSLETTER_SELECCION.has(s.id) ? "checked" : ""} onchange="alternarSuscriptorSeleccionado(${s.id}, this.checked)">
        <span class="newsletter-check" aria-hidden="true"></span>
        <span class="newsletter-picker-item-email">${escapeHtml(s.email)}</span>
      </label>`).join("");
  }
  actualizarContadorSeleccionNewsletter();
}

function alternarSuscriptorSeleccionado(id, marcado) {
  if (marcado) NEWSLETTER_SELECCION.add(id);
  else NEWSLETTER_SELECCION.delete(id);
  actualizarContadorSeleccionNewsletter();
}

function actualizarContadorSeleccionNewsletter() {
  const el = document.getElementById("enviarNewsletterContadorSeleccion");
  if (el) el.textContent = `${NEWSLETTER_SELECCION.size} seleccionados`;
}

async function confirmarEnvioNewsletter() {
  ocultarMensajesNewsletter();

  const todos = document.getElementById("enviarNewsletterTodos").checked;
  const body = {};
  if (!todos) {
    if (!NEWSLETTER_SELECCION.size) {
      mostrarErrorNewsletter("Selecciona al menos un suscriptor, o marca \"Enviar a todos\".");
      return;
    }
    body.suscriptor_ids = Array.from(NEWSLETTER_SELECCION);
  }

  const totalDestino = todos ? NEWSLETTER_SUSCRIPTORES_ACTIVOS.length : NEWSLETTER_SELECCION.size;
  if (!(await EOF.confirmar(`Vas a enviar el boletín a ${totalDestino} suscriptor(es) ahora mismo. ¿Continuar?`, { textoConfirmar: "Enviar" }))) return;

  const btn = document.getElementById("btnConfirmarEnviarNewsletter");
  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = "Enviando...";
  try {
    const resp = await apiFetch(`/api/newsletter/enviar`, { method: "POST", body: JSON.stringify(body) });
    mostrarOkNewsletter(`Boletín enviado a ${resp.enviados} suscriptor(es).`);
    cargaNewsletter(); // refresca la tabla y el bloque de fechas por si acaba de cambiar algo
    setTimeout(cerrarModalEnviarNewsletter, 1200);
  } catch (err) {
    mostrarErrorNewsletter(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

// ---------- PIN de "Última hora": único, compartido, solo admin lo ve ----------
// Se guarda en settings (no por redactor) y se regenera solo cada vez que
// se usa para publicar; aquí solo se consulta o se fuerza a regenerar.
function pintarPinUltimaHora(pin) {
  const digitos = (pin && /^\d{4}$/.test(pin)) ? pin.split("") : ["•", "•", "•", "•"];
  ["pr_pin_d1", "pr_pin_d2", "pr_pin_d3", "pr_pin_d4"].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = digitos[i];
  });
}
function abrirModalPinRedactor() {
  document.getElementById("errPinRedactor").style.display = "none";
  document.getElementById("msgOkPinRedactor").style.display = "none";
  pintarPinUltimaHora(null);
  document.getElementById("modalPinRedactor").classList.add("abierto");
  cargarPinUltimaHora();
}
function cerrarModalPinRedactor() {
  document.getElementById("modalPinRedactor").classList.remove("abierto");
}
const modalPinRedactorEl = document.getElementById("modalPinRedactor");
if (modalPinRedactorEl) {
  modalPinRedactorEl.addEventListener("click", (e) => {
    if (e.target === modalPinRedactorEl) cerrarModalPinRedactor();
  });
}
async function cargarPinUltimaHora() {
  const errEl = document.getElementById("errPinRedactor");
  errEl.style.display = "none";
  try {
    const { pin } = await apiFetch(`/api/settings/ultima-hora-pin`);
    pintarPinUltimaHora(pin);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  }
}
document.getElementById("btnVerPinUltimaHora")?.addEventListener("click", abrirModalPinRedactor);
document.getElementById("btnGuardarPinRedactor")?.addEventListener("click", async () => {
  const errEl = document.getElementById("errPinRedactor");
  const okEl = document.getElementById("msgOkPinRedactor");
  errEl.style.display = "none";
  okEl.style.display = "none";
  if (!(await EOF.confirmar("¿Regenerar el PIN de \"Última hora\" ahora? El PIN actual dejará de funcionar de inmediato.", { textoConfirmar: "Regenerar" }))) return;
  try {
    const { pin } = await apiFetch(`/api/settings/ultima-hora-pin/regenerar`, { method: "POST" });
    pintarPinUltimaHora(pin);
    okEl.style.display = "block";
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  }
});

// ---------- SOLICITUDES DE EDICIÓN ----------
let SOLICITUDES_CACHE = {};

function etiquetaTipoSolicitud(tipo) {
  return tipo === "resultado" ? "un resultado" : "una noticia/crónica";
}

function formatFechaSolicitud(fechaStr) {
  if (!fechaStr) return "—";
  const d = new Date(fechaStr.replace(" ", "T") + "Z");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}

// Busca el título de la entidad afectada (para mostrarlo en la tarjeta).
// El backend ya manda "entidad_titulo" resuelto; si por lo que sea no
// llega (entidad borrada mientras tanto), se cae a la caché local de
// noticias como respaldo.
function tituloEntidadSolicitud(s) {
  if (s.entidad_titulo) return s.entidad_titulo;
  if (s.tipo_entidad === "articulo" && ARTICULOS_CACHE[s.entidad_id]) {
    return ARTICULOS_CACHE[s.entidad_id].titulo;
  }
  return null;
}

function pintarTarjetaSolicitud(s, { mostrarBotonesRespuesta }) {
  const titulo = tituloEntidadSolicitud(s);
  const descripcionTipo = etiquetaTipoSolicitud(s.tipo_entidad);
  const etiquetaEstado = { pendiente: "Pendiente", aprobada: "Aprobada", rechazada: "Rechazada", caducada: "Caducada" }[s.estado] || s.estado;
  const botones = (mostrarBotonesRespuesta && s.estado === "pendiente")
    ? `<div class="solicitud-card-botones">
         <button class="aprobar" data-accion="aprobar" data-id="${s.id}">Aprobar</button>
         <button class="rechazar" data-accion="rechazar" data-id="${s.id}">Rechazar</button>
       </div>`
    : "";

  // Detalle ampliado (visible sobre todo para admins, que son quienes
  // gestionan la mayoría de solicitudes): qué es exactamente, quién la
  // pide (con usuario y correo) y de quién es originalmente.
  const tipoLabel = { noticia: "Noticia", previa: "Previa", cronica: "Crónica", analisis: "Análisis", opinion: "Opinión", entrevista: "Entrevista" }[s.entidad_tipo] || (s.tipo_entidad === "resultado" ? "Resultado" : "Artículo");
  const estadoEntidad = !s.entidad_existe
    ? "Ya no existe"
    : s.entidad_publicado
      ? "Publicada"
      : (s.entidad_estado_borrador === "terminado" ? "En revisión" : "Borrador (en proceso)");

  const filasDetalle = [
    `<div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Qué es</span><span>${escapeHtml(tipoLabel)}${s.entidad_categoria ? ` · ${escapeHtml(categoriaLabel ? categoriaLabel(s.entidad_categoria) : s.entidad_categoria)}` : ""} · ${escapeHtml(estadoEntidad)}</span></div>`,
    `<div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Lo pide</span><span>${escapeHtml(s.solicitante_nombre || "—")}${s.solicitante_username ? ` (@${escapeHtml(s.solicitante_username)})` : ""}${s.solicitante_email ? ` · ${escapeHtml(s.solicitante_email)}` : ""}</span></div>`,
    `<div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Autor original</span><span>${s.autor_nombre ? escapeHtml(s.autor_nombre) + (s.autor_username ? ` (@${escapeHtml(s.autor_username)})` : "") : "— Sin autor asignado —"}</span></div>`,
    s.estado !== "pendiente" && s.resuelta_por_nombre
      ? `<div class="solicitud-card-fila"><span class="solicitud-card-fila-etiqueta">Resuelta por</span><span>${escapeHtml(s.resuelta_por_nombre)} · ${formatFechaSolicitud(s.resuelta_at)}</span></div>`
      : "",
  ].filter(Boolean).join("");

  return `
    <div class="solicitud-card">
      <div class="solicitud-card-cabecera">
        <div>
          <p class="solicitud-card-titulo">${titulo ? escapeHtml(titulo) : `Solicitud sobre ${descripcionTipo} (id ${s.entidad_id})`}</p>
          <p class="solicitud-card-meta">Quiere editar ${descripcionTipo} que no es suya · Pedida el ${formatFechaSolicitud(s.created_at)}</p>
        </div>
        <span class="solicitud-card-estado ${s.estado}">${etiquetaEstado}</span>
      </div>
      <div class="solicitud-card-detalle">${filasDetalle}</div>
      ${s.motivo ? `<p class="solicitud-card-motivo">"${escapeHtml(s.motivo)}"</p>` : ""}
      ${botones}
    </div>`;
}

async function cargaSolicitudesEdicion() {
  const contRecibidas = document.getElementById("listaSolicitudesRecibidas");
  const contMias = document.getElementById("listaSolicitudesMias");
  if (!contRecibidas || !contMias) return;
  contRecibidas.innerHTML = "<p class='solicitudes-vacio'>Cargando...</p>";
  contMias.innerHTML = "<p class='solicitudes-vacio'>Cargando...</p>";
  try {
    const { solicitudes = [] } = await apiFetch(`/api/edit-requests`);
    SOLICITUDES_CACHE = {};
    solicitudes.forEach((s) => { SOLICITUDES_CACHE[s.id] = s; });

    // "Pendientes de mi respuesta": las que yo puedo aprobar/rechazar (soy
    // admin, o soy el autor original de lo que se está pidiendo), sin
    // contar las que yo mismo he solicitado.
    const recibidas = solicitudes.filter((s) => s.solicitante_id !== USER.id && (USER.rol === "admin" || s.autor_id === USER.id));
    // "Mis solicitudes": las que yo he enviado.
    const mias = solicitudes.filter((s) => s.solicitante_id === USER.id);

    contRecibidas.innerHTML = recibidas.length
      ? recibidas.map((s) => pintarTarjetaSolicitud(s, { mostrarBotonesRespuesta: true })).join("")
      : "<p class='solicitudes-vacio'>No hay solicitudes pendientes de tu respuesta.</p>";

    contMias.innerHTML = mias.length
      ? mias.map((s) => pintarTarjetaSolicitud(s, { mostrarBotonesRespuesta: false })).join("")
      : "<p class='solicitudes-vacio'>Todavía no has solicitado editar nada de otra persona.</p>";

    actualizarBadgeSolicitudesPendientes(recibidas.filter((s) => s.estado === "pendiente").length);
  } catch (err) {
    contRecibidas.innerHTML = `<p class='solicitudes-vacio'>Error cargando: ${err.message}</p>`;
    contMias.innerHTML = "";
  }
}

// Consulta rápida (sin pintar las tarjetas) para mostrar el numerito rojo
// en la pestaña nada más entrar al panel, sin esperar a que se abra.
async function actualizarBadgeSolicitudesPendientes(numeroConocido) {
  const badge = document.getElementById("badgeSolicitudesPendientes");
  if (!badge) return;
  let numero = numeroConocido;
  if (typeof numero !== "number") {
    try {
      const { solicitudes = [] } = await apiFetch(`/api/edit-requests?estado=pendiente`);
      numero = solicitudes.filter((s) => s.solicitante_id !== USER.id && (USER.rol === "admin" || s.autor_id === USER.id)).length;
    } catch {
      return;
    }
  }
  if (numero > 0) {
    badge.textContent = String(numero);
    badge.style.display = "inline-flex";
  } else {
    badge.style.display = "none";
  }
}

document.getElementById("listaSolicitudesRecibidas")?.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-accion]");
  if (!btn) return;
  const id = btn.dataset.id;
  const accion = btn.dataset.accion;
  const s = SOLICITUDES_CACHE[id];
  if (accion === "rechazar") {
    if (!(await EOF.confirmar("¿Rechazar esta solicitud de edición?", { textoConfirmar: "Rechazar" }))) return;
  }
  try {
    await apiFetch(`/api/edit-requests/${id}`, { method: "PUT", body: JSON.stringify({ accion }) });
    EOF.toast(accion === "aprobar" ? "Solicitud aprobada." : "Solicitud rechazada.", "exito");
    cargaSolicitudesEdicion();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
});

// ---------- Modal "Solicitar edición" (desde los listados de noticias/resultados) ----------
function abrirModalSolicitarEdicion(tipoEntidad, entidadId) {
  document.getElementById("se_tipo").value = tipoEntidad;
  document.getElementById("se_id").value = entidadId;
  document.getElementById("se_motivo").value = "";
  document.getElementById("errSolicitarEdicion").style.display = "none";
  document.getElementById("modalSolicitarEdicion").classList.add("abierto");
}
function cerrarModalSolicitarEdicion() {
  document.getElementById("modalSolicitarEdicion").classList.remove("abierto");
}
const modalSolicitarEdicionEl = document.getElementById("modalSolicitarEdicion");
if (modalSolicitarEdicionEl) {
  modalSolicitarEdicionEl.addEventListener("click", (e) => {
    if (e.target === modalSolicitarEdicionEl) cerrarModalSolicitarEdicion();
  });
}
document.getElementById("btnEnviarSolicitudEdicion")?.addEventListener("click", async () => {
  const errEl = document.getElementById("errSolicitarEdicion");
  errEl.style.display = "none";
  const tipo_entidad = document.getElementById("se_tipo").value;
  const entidad_id = document.getElementById("se_id").value;
  const motivo = document.getElementById("se_motivo").value.trim();
  try {
    await apiFetch(`/api/edit-requests`, { method: "POST", body: JSON.stringify({ tipo_entidad, entidad_id, motivo: motivo || undefined }) });
    cerrarModalSolicitarEdicion();
    EOF.toast("Solicitud enviada. Te avisaremos cuando la respondan.", "exito");
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = "block";
  }
});

// ---------- HISTORIAL DE ACCIONES (solo admins) ----------
const ETIQUETAS_ACCION = {
  login: "Inicio de sesión",
  crear_usuario: "Crear usuario",
  editar_usuario: "Editar usuario",
  eliminar_usuario: "Eliminar usuario",
  restablecer_password: "Restablecer contraseña",
  cambiar_password_propia: "Cambiar contraseña propia",
  recuperar_password: "Recuperar contraseña olvidada",
  editar_email_propio: "Guardar correo propio",
  editar_perfil_propio: "Editar perfil propio",
  subir_media: "Subir contenido",
  editar_media: "Editar contenido",
  eliminar_media: "Eliminar contenido",
  descargar_media: "Descargar contenido",
  crear_articulo: "Publicar noticia/crónica",
  guardar_borrador: "Guardar borrador",
  editar_articulo: "Editar noticia/crónica",
  eliminar_articulo: "Eliminar noticia/crónica",
  crear_resultado: "Crear resultado",
  editar_resultado: "Editar resultado",
  eliminar_resultado: "Eliminar resultado",
  crear_evento_partido: "Evento de minuto a minuto",
  aviso_partido_desatendido: "Aviso: partido desatendido",
  partido_colgado_ocultado: "Partido colgado (ocultado)",
  editar_settings: "Editar ajustes del medio",
};

function etiquetaAccion(accion) {
  return ETIQUETAS_ACCION[accion] || accion;
}

function formatFechaHistorial(fechaStr) {
  // Mismo problema que formatFechaNotif: la fecha en BD está en UTC,
  // hay que marcarla como tal y pedir la hora de España al mostrarla.
  const d = new Date(fechaStr.replace(" ", "T") + "Z");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}

let historialPagina = 0;
const HISTORIAL_POR_PAGINA = 50;
let historialFiltrosSelectsListos = false;

function leerFiltrosHistorial() {
  return {
    q: document.getElementById("hist_q").value.trim(),
    usuario_id: document.getElementById("hist_usuario").value,
    accion: document.getElementById("hist_accion").value,
    entidad: document.getElementById("hist_entidad").value,
    desde: document.getElementById("hist_desde").value,
    hasta: document.getElementById("hist_hasta").value,
  };
}

async function cargaHistorial(irAPrimeraPagina = true) {
  const tabla = document.getElementById("tablaHistorial");
  if (!tabla) return;
  if (irAPrimeraPagina) historialPagina = 0;
  tabla.innerHTML = `<tr><td colspan="5">Cargando...</td></tr>`;

  const filtros = leerFiltrosHistorial();
  const params = new URLSearchParams();
  if (filtros.q) params.set("q", filtros.q);
  if (filtros.usuario_id) params.set("usuario_id", filtros.usuario_id);
  if (filtros.accion) params.set("accion", filtros.accion);
  if (filtros.entidad) params.set("entidad", filtros.entidad);
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  params.set("limit", HISTORIAL_POR_PAGINA);
  params.set("offset", historialPagina * HISTORIAL_POR_PAGINA);

  try {
    const { actividad = [], total = 0, acciones = [], usuarios = [] } = await apiFetch(`/api/activity?${params.toString()}`);

    // Rellena los desplegables de filtro una sola vez con los valores
    // que existan en el historial (usuarios y tipos de acción).
    if (!historialFiltrosSelectsListos) {
      const selUsuario = document.getElementById("hist_usuario");
      usuarios.forEach((u) => {
        const opt = document.createElement("option");
        opt.value = u.usuario_id;
        const equipos = Array.isArray(u.usuario_equipo) ? u.usuario_equipo : (u.usuario_equipo ? [u.usuario_equipo] : []);
        const etiquetaEquipo = equipos.length ? ` — ${equipos.join(" / ")}` : "";
        opt.textContent = `${u.usuario_nombre}${etiquetaEquipo}`;
        selUsuario.appendChild(opt);
      });
      const selAccion = document.getElementById("hist_accion");
      acciones.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a;
        opt.textContent = etiquetaAccion(a);
        selAccion.appendChild(opt);
      });
      historialFiltrosSelectsListos = true;
    }

    tabla.innerHTML = actividad.length
      ? actividad.map((a) => `
        <tr>
          <td data-label="Fecha">${formatFechaHistorial(a.created_at)}</td>
          <td data-label="Usuario">${escapeHtml(a.usuario_nombre)} <span class="etiqueta-rol">(${a.usuario_rol})</span></td>
          <td data-label="Acción">${etiquetaAccion(a.accion)}</td>
          <td data-label="Descripción">${escapeHtml(a.descripcion)}</td>
          <td data-label="IP">${a.ip ? escapeHtml(a.ip) : "—"}</td>
        </tr>`).join("")
      : `<tr><td colspan="5">No hay acciones que coincidan con los filtros.</td></tr>`;

    const desde = total === 0 ? 0 : historialPagina * HISTORIAL_POR_PAGINA + 1;
    const hasta = Math.min(total, (historialPagina + 1) * HISTORIAL_POR_PAGINA);
    document.getElementById("historialResumen").textContent = `Mostrando ${desde}–${hasta} de ${total}`;
    document.getElementById("btnHistorialAnterior").disabled = historialPagina === 0;
    document.getElementById("btnHistorialSiguiente").disabled = hasta >= total;
  } catch (err) {
    tabla.innerHTML = `<tr><td colspan="5">Error al cargar el historial: ${escapeHtml(err.message)}</td></tr>`;
  }
}

document.getElementById("btnFiltrarHistorial")?.addEventListener("click", () => cargaHistorial(true));
document.getElementById("btnLimpiarHistorial")?.addEventListener("click", () => {
  document.getElementById("hist_q").value = "";
  document.getElementById("hist_usuario").value = "";
  document.getElementById("hist_accion").value = "";
  document.getElementById("hist_entidad").value = "";
  document.getElementById("hist_desde").value = "";
  document.getElementById("hist_hasta").value = "";
  cargaHistorial(true);
});
document.getElementById("hist_q")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") cargaHistorial(true);
});
document.getElementById("btnHistorialAnterior")?.addEventListener("click", () => {
  if (historialPagina > 0) { historialPagina--; cargaHistorial(false); }
});
document.getElementById("btnHistorialSiguiente")?.addEventListener("click", () => {
  historialPagina++;
  cargaHistorial(false);
});

// ---------- COMPARTIR EN REDES ----------
// Genera un texto ya redactado para cada red a partir de la noticia recién
// publicada (o de cualquiera de la lista) y ofrece copiarlo o, en el caso
// de X, abrir directamente el compositor con el texto prellenado (única
// red cuya API de intents lo permite sin pasar por su App Review).
const SITIO_PUBLICO_URL = "https://elotrofutbol.media";

function quitarEtiquetasHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html || "";
  return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
}

// Hashtag de la competición para el texto de X/Instagram. Los amistosos
// no pertenecen a ninguna liga real, así que no se les pone ningún
// hashtag de competición (ni el de liga ni un "#Futbol" genérico que
// tampoco tendría sentido ahí); las 3 competiciones federativas sí
// llevan el suyo.
function hashtagCategoria(categoria) {
  const mapa = {
    hypermotion: "#LaLigaHypermotion",
    primera_federacion: "#PrimeraFederacion",
    segunda_federacion: "#SegundaFederacion",
    arbitraje: "#Arbitraje",
    jurisdiccion: "#JurisdiccionDeportiva",
  };
  return mapa[categoria] || "";
}

// Etiqueta con emoji que encabeza el tuit según el tipo de artículo, para
// que se distinga de un vistazo si es una noticia, previa, crónica,
// análisis, opinión o entrevista.
function etiquetaTipoX(tipo) {
  const mapa = {
    noticia: "📰 NOTICIA",
    previa: "🔮 PREVIA",
    cronica: "🎙️ CRÓNICA",
    analisis: "📊 ANÁLISIS",
    opinion: "📝 OPINIÓN",
    entrevista: "🎤 ENTREVISTA",
  };
  return mapa[tipo] || "📰 NOTICIA";
}

// Pinta, dentro del modal de compartir, únicamente la imagen principal
// (portada) de la noticia: es la única que se sube a redes, así que no
// tiene sentido ofrecer el resto de fotos de la galería aquí. Se marca
// siempre como seleccionada de forma automática.
function pintarImagenesCompartir(a) {
  const cont = document.getElementById("cp_imagenes_lista");
  const wrap = document.getElementById("cp_imagenes_wrap");
  if (!cont || !wrap) return;

  const urlPortada = a.imagen_url || null;

  if (!urlPortada) {
    wrap.style.display = "none";
    cont.innerHTML = "";
    return;
  }
  wrap.style.display = "";

  cont.innerHTML = `
    <div class="compartir-imagen-item">
      <span class="compartir-imagen-etiqueta-portada">Portada</span>
      <img src="${escapeHtml(urlPortada)}" alt="" loading="lazy">
      <label>
        <input type="checkbox" class="cp-imagen-check" value="${escapeHtml(urlPortada)}" checked>
        Usar
      </label>
    </div>`;
}

// Descarga cada imagen marcada (una petición fetch + enlace temporal por
// foto), para que el autor las tenga ya en su carpeta de descargas listas
// para arrastrar al compositor de cada red social.
document.getElementById("btnDescargarImagenesCompartir")?.addEventListener("click", async () => {
  const marcadas = [...document.querySelectorAll(".cp-imagen-check:checked")].map((c) => c.value);
  if (marcadas.length === 0) {
    EOF.toast("Marca al menos una imagen para descargar.", "error");
    return;
  }
  for (let i = 0; i < marcadas.length; i++) {
    const url = marcadas[i];
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const ext = (blob.type && blob.type.split("/")[1]) || "jpg";
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `noticia-imagen-${i + 1}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Si la imagen viene de otro dominio sin CORS, el fetch puede fallar;
      // como alternativa se abre en una pestaña para poder guardarla a mano.
      window.open(url, "_blank");
    }
  }
  EOF.toast(`${marcadas.length} imagen(es) descargada(s).`, "exito");
});

// ---------- COMPARTIR EN REDES: cuentas de X de autor/coautor ----------
// Cuenta de X (Twitter) de un autor (o coautor) de la noticia, para
// mencionarla automáticamente al final del texto de X ("✍️ @suCuenta").
// Se lee directamente de la cuenta de X que esa persona tenga puesta en
// su perfil (Mi perfil > Redes sociales > X/Twitter): si no la ha
// rellenado, simplemente no se añade su mención.
function cuentaXDeAutorId(autorId) {
  if (!autorId) return null;
  const autor = AUTORES_CACHE[autorId];
  const url = autor && autor.redes && autor.redes.twitter;
  if (!url) return null;
  // El campo guarda una URL completa (https://twitter.com/usuario o
  // https://x.com/usuario); extraemos el usuario de ahí. Si por lo que
  // sea se guardó solo el @usuario suelto, también lo admitimos.
  const match = String(url).match(/(?:twitter\.com|x\.com)\/@?([^/?#]+)/i);
  const usuario = match ? match[1] : String(url).replace(/^@/, "").trim();
  return usuario ? `@${usuario}` : null;
}

async function abrirModalCompartir(a) {
  // Por si el modal se abre antes de que /api/autores haya respondido
  // (justo al cargar la página), nos aseguramos de tener la caché de
  // autores lista para poder resolver su cuenta de X.
  if (Object.keys(AUTORES_CACHE).length === 0) {
    await cargarAutoresSelect();
  }
  const link = `${SITIO_PUBLICO_URL}${urlNoticia(a.categoria, a.slug)}`;
  const titulo = a.titulo || "";
  const subtitulo = quitarEtiquetasHtml(a.subtitulo || "");
  const hashtag = hashtagCategoria(a.categoria);
  // En un amistoso no hay hashtag de competición (ver hashtagCategoria),
  // así que esa línea se omite entera en vez de dejar un hueco vacío.
  const lineaHashtag = hashtag ? `\n\n${hashtag}` : "";

  document.getElementById("cp_link").value = link;
  pintarImagenesCompartir(a);

  // Si la noticia todavía está programada (no publicada), el enlace ya se
  // puede compartir con antelación: quien lo abra antes de tiempo verá una
  // cuenta atrás en la propia web (en vez de un error), así que se avisa
  // aquí solo para que quien comparte sepa qué se va a encontrar el lector
  // mientras tanto.
  const avisoProgramada = document.getElementById("cp_aviso_programada");
  const avisoProgramadaTexto = document.getElementById("cp_aviso_programada_texto");
  if (avisoProgramada) {
    if (a.programado_para) {
      avisoProgramadaTexto.textContent = `Se publicará sola el ${formatFechaConHora(a.programado_para)}. Hasta entonces, quien abra el enlace verá una cuenta atrás en vez de la noticia.`;
      avisoProgramada.style.display = "";
    } else {
      avisoProgramada.style.display = "none";
    }
  }

  // Formato fijo para X: etiqueta con emoji + medio, título, enlace,
  // hashtag de la categoría (si lo hay) y, si el autor y/o el coautor
  // tienen cuenta de X registrada en su perfil, una línea de firma al
  // final mencionando a los dos ("✍️ @autor y @coautor").
  const firmaAutor = cuentaXDeAutorId(a.autor_id);
  const firmaCoautor = cuentaXDeAutorId(a.coautor_id);
  const firmas = [firmaAutor, firmaCoautor].filter(Boolean);
  const lineaFirma = firmas.length ? `\n\n✍️ ${firmas.join(" y ")}` : "";
  const textoX = `${etiquetaTipoX(a.tipo)} | ElOtroFútbol\n\n${titulo}\n\n🔗 ${link}${lineaHashtag}${lineaFirma}`;
  document.getElementById("cp_texto_x").value = textoX;
  actualizarContadorX();

  const hashtagsInstagram = [hashtag, "#ElOtroFutbolTV", "#Futbol"].filter(Boolean).join(" ");
  const textoInstagram = `${etiquetaTipoX(a.tipo)} | ElOtroFútbol\n\n${titulo}\n\n${subtitulo ? subtitulo + "\n\n" : ""}Noticia completa en el enlace de nuestra biografía 🔗\n\n${hashtagsInstagram}`;
  document.getElementById("cp_texto_instagram").value = textoInstagram;

  // WhatsApp sí permite prellenar un enlace clicable (a diferencia de
  // Instagram, donde el link de la bio no puede ir en el texto): mismo
  // formato que el texto de X, con el enlace real de la noticia.
  const textoWhatsapp = `${etiquetaTipoX(a.tipo)} | ElOtroFútbol\n\n${titulo}\n\n🔗 ${link}${lineaHashtag}`;
  document.getElementById("cp_texto_whatsapp").value = textoWhatsapp;

  document.getElementById("modalCompartir").classList.add("abierto");
}

function cerrarModalCompartir() {
  document.getElementById("modalCompartir").classList.remove("abierto");
}

function actualizarContadorX() {
  const texto = document.getElementById("cp_texto_x").value;
  const contador = document.getElementById("cp_contador_x");
  contador.textContent = `${texto.length} / 280`;
  contador.classList.toggle("limite", texto.length > 280);
}
document.getElementById("cp_texto_x")?.addEventListener("input", actualizarContadorX);

// Copiar el texto de cualquiera de las cajas (mismo patrón que el resto
// del panel: intenta la API del portapapeles y, si falla, cae al método
// clásico de seleccionar + copiar).
document.querySelectorAll("[data-copiar]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const campo = document.getElementById(btn.dataset.copiar);
    try {
      await navigator.clipboard.writeText(campo.value);
    } catch {
      campo.select();
      document.execCommand("copy");
    }
    const span = btn.querySelector("span");
    const textoOriginal = span.textContent;
    btn.classList.add("copiado");
    span.textContent = "Copiado ✓";
    setTimeout(() => {
      btn.classList.remove("copiado");
      span.textContent = textoOriginal;
    }, 2000);
  });
});

document.getElementById("btnCopiarLinkCompartir")?.addEventListener("click", async () => {
  const campo = document.getElementById("cp_link");
  try {
    await navigator.clipboard.writeText(campo.value);
  } catch {
    campo.select();
    document.execCommand("copy");
  }
  EOF.toast("Enlace copiado.", "exito");
});

// X sí permite prellenar el compositor mediante su URL de "intent" pública.
document.getElementById("btnAbrirX")?.addEventListener("click", () => {
  const texto = document.getElementById("cp_texto_x").value;
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(texto)}`, "_blank");
});

// Instagram no ofrece una URL pública para prellenar el texto de una
// publicación (solo se puede desde su app móvil), así que este botón se
// limita a abrir la red: el texto ya se ha copiado al portapapeles con el
// botón de arriba, listo para pegar al crear el post.
document.getElementById("btnAbrirInstagram")?.addEventListener("click", () => {
  window.open("https://www.instagram.com/elotrofutboltv_/", "_blank");
});

// WhatsApp sí permite prellenar el mensaje mediante la URL pública de
// wa.me/api.whatsapp.com; se abre sin número de destino para que el autor
// elija el chat o grupo al que enviarlo desde WhatsApp Web/app.
document.getElementById("btnAbrirWhatsapp")?.addEventListener("click", () => {
  const texto = document.getElementById("cp_texto_whatsapp").value;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, "_blank");
});

// Permite llegar directamente a una sección de "Ajustes de cuenta" desde
// fuera del panel (p. ej. el menú de usuario de las páginas públicas),
// usando panel.html?ajustes=perfil|password|sesiones. Se ejecuta al final
// del archivo porque irAAjustesCuenta() depende de los listeners de
// pestañas/subpestañas, que se registran más arriba.
(function abrirAjustesDesdeUrl() {
  const seccion = new URLSearchParams(location.search).get("ajustes");
  if (!seccion) return;
  irAAjustesCuenta(seccion);
})();

// Permite entrar directo al panel de Minuto a Minuto de un partido como
// si fuera una página independiente, con panel.html?minuto_a_minuto=<id>
// (ver botón "Abrir en pestaña nueva" en la tabla de Resultados y en el
// propio panel MAM). Antes solo se podía abrir el panel desde dentro del
// desplegable de gestión de un partido, dentro del dashboard completo:
// no había forma de tener el minuto a minuto en su propia pestaña del
// navegador, cómodo para dejarlo abierto aparte mientras se hace otra
// cosa en el panel principal en otra pestaña.
// Se activa body.mam-standalone ANTES de llamar a abrirPanelMinutoAMinuto
// (ver admin.css) para que la cabecera y las pestañas del panel se
// oculten desde el primer instante, sin llegar a verse un parpadeo del
// dashboard completo detrás mientras carga el partido.
(function abrirMinutoAMinutoDesdeUrl() {
  const idParam = new URLSearchParams(location.search).get("minuto_a_minuto");
  if (!idParam) return;
  const id = parseInt(idParam, 10);
  if (!Number.isInteger(id) || id <= 0) return;
  document.body.classList.add("mam-standalone");
  abrirPanelMinutoAMinuto(id);
})();

// Snapshot inicial del formulario de noticia en blanco, por si se pulsa
// "Previsualizar" antes de tocar nada (sin haber pasado por
// cancelarEdicion/editarArticulo, que ya lo actualizan en su momento).
SNAPSHOT_ARTICULO_ORIGINAL = snapshotFormularioArticulo();

// Si la sesión anterior se cerró por inactividad mientras se escribía
// una noticia, se ofrece recuperar ese borrador guardado en local.
comprobarBorradorLocalDeEmergencia();

// ---------- ALINEACIONES ----------
// Editor visual de un once inicial sobre un campo de fútbol, reutilizado
// tanto desde el formulario de noticia (ligado a un article_id) como
// desde el de resultado (ligado a un result_id). El modal físico
// (#modalAlineacion) es único: se rellena de nuevo cada vez que se abre.

// Coordenadas [x%, y%] por defecto para cada línea de una formación,
// pensadas para el campo del editor tal y como se ve en el panel: y=8
// es la línea más cercana a la portería propia (arriba del todo) e
// y=92 la más adelantada (ataque, abajo del todo). El portero (pos.
// fija) se añade aparte en generarPosicionesFormacion().
//
// Las "y" de cada línea reparten el campo en tramos iguales según el
// número de líneas de campo (sin contar portero), en vez de valores
// sueltos a ojo: así la defensa, el centro del campo y el ataque quedan
// siempre a la misma distancia entre sí, sin líneas que se amontonen
// (antes, p.ej. en 4-3-3, defensa y centrocampo casi se pisaban a 20%
// de distancia y luego había un salto enorme hasta el ataque).
const LINEAS_FORMACION = {
  "4-3-3":   [4, 3, 3],
  "4-4-2":   [4, 4, 2],
  "4-2-3-1": [4, 2, 3, 1],
  "4-5-1":   [4, 5, 1],
  "3-4-3":   [3, 4, 3],
  "3-5-2":   [3, 5, 2],
  "5-3-2":   [5, 3, 2],
  "5-4-1":   [5, 4, 1],
};

// Reparte "n" líneas de campo (sin el portero) a alturas equiespaciadas
// entre justo delante de la portería propia (Y_PRIMERA_LINEA) y justo
// delante de la portería rival (Y_ULTIMA_LINEA).
const Y_PRIMERA_LINEA = 24;
const Y_ULTIMA_LINEA = 90;
function alturasDeLineas(numLineas) {
  if (numLineas === 1) return [Y_PRIMERA_LINEA];
  const paso = (Y_ULTIMA_LINEA - Y_PRIMERA_LINEA) / (numLineas - 1);
  return Array.from({ length: numLineas }, (_, i) => Math.round(Y_PRIMERA_LINEA + paso * i));
}

// Reparte "n" jugadores en horizontal dentro de una línea, equiespaciados
// y con un margen lateral que se adapta al número de jugadores: una
// línea de 5 (defensa de 5, centro del campo de 5) necesita ocupar casi
// todo el ancho para no amontonarse, mientras que una línea de 1 o 2
// (delantero centro, pareja de ataque) se ve más natural más recogida
// hacia el centro que pegada a las bandas.
function repartirEnLinea(n, y) {
  if (n === 1) return [[50, y]];
  const margen = n >= 5 ? 10 : n === 4 ? 14 : n === 3 ? 22 : 30;
  const paso = (100 - margen * 2) / (n - 1);
  return Array.from({ length: n }, (_, i) => [Math.round(margen + paso * i), y]);
}

function generarPosicionesFormacion(formacion) {
  const numJugadoresPorLinea = LINEAS_FORMACION[formacion] || LINEAS_FORMACION["4-3-3"];
  const alturas = alturasDeLineas(numJugadoresPorLinea.length);
  const posiciones = [[50, 6]]; // portero
  numJugadoresPorLinea.forEach((n, i) => posiciones.push(...repartirEnLinea(n, alturas[i])));
  return posiciones;
}

// Estado del editor mientras el modal está abierto.
let ALINEACION_EDITOR = {
  contexto: null,       // "articulo" | "resultado"
  jugadores: [],         // titulares con {x,y,dorsal,nombre,capitan}
  suplentes: [],          // {dorsal,nombre,capitan}
  jugadorSeleccionado: null,
};

// Marca como capitán al jugador indicado (por índice dentro de
// "jugadores" o "suplentes", solo uno de los dos) y desmarca a
// cualquier otro que lo estuviera, para que nunca haya más de un
// capitán en la alineación.
function marcarCapitanAlineacion(lista, indice, valor) {
  ALINEACION_EDITOR.jugadores.forEach((j) => { j.capitan = false; });
  ALINEACION_EDITOR.suplentes.forEach((j) => { j.capitan = false; });
  if (valor) lista[indice].capitan = true;
}

const alTeamPicker = crearTeamPicker(document.getElementById("al_equipo_picker"), {
  onChange: () => {
    document.getElementById("al_equipo_otro_wrap").style.display =
      alTeamPicker.obtenerValor() === VALOR_OTRO_EQUIPO ? "flex" : "none";
    cargarUltimasAlineacionesEquipo();
  },
});

// Pide y pinta hasta 3 botones con las últimas alineaciones guardadas
// del equipo actualmente elegido en el picker, para poder copiar
// cualquiera de ellas al editor de un solo clic (ver
// obtenerUltimasAlineacionesEquipo en el backend). Se llama al abrir el
// modal y cada vez que cambia el equipo elegido.
async function cargarUltimasAlineacionesEquipo() {
  const wrap = document.getElementById("al_ultimas_wrap");
  const lista = document.getElementById("al_ultimas_lista");
  const equipo = alTeamPicker.obtenerValor();
  if (!equipo || equipo === VALOR_OTRO_EQUIPO) {
    wrap.style.display = "none";
    lista.innerHTML = "";
    return;
  }
  const resultIdActual = document.getElementById("al_result_id").value || "";
  try {
    const params = new URLSearchParams({ equipo });
    if (resultIdActual) params.set("excluir_result_id", resultIdActual);
    const { alineaciones } = await apiFetch(`/api/alineaciones/ultimas?${params.toString()}`);
    if (!alineaciones || !alineaciones.length) {
      wrap.style.display = "none";
      lista.innerHTML = "";
      return;
    }
    lista.innerHTML = "";
    alineaciones.forEach((a) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-secundari btn-copiar-alineacion";
      const fecha = a.fecha_partido ? String(a.fecha_partido).slice(0, 10) : "";
      btn.textContent = `vs ${a.rival} (J${a.jornada}${fecha ? ", " + fecha : ""}) — ${a.formacion}`;
      btn.addEventListener("click", () => aplicarAlineacionCopiada(a));
      lista.appendChild(btn);
    });
    wrap.style.display = "block";
  } catch (err) {
    // Si falla el listado no bloqueamos el editor por algo accesorio;
    // simplemente no se muestran botones de copiar.
    wrap.style.display = "none";
    lista.innerHTML = "";
  }
}

// Vuelca en el editor visual (campo + suplentes) el once de una de las
// últimas alineaciones del equipo, tal cual devuelve el backend
// (mismo formato {x,y,dorsal,nombre,titular} que ya usa
// abrirEditorAlineacion al cargar una alineación existente).
function aplicarAlineacionCopiada(alineacionCopiada) {
  const jugadoresGuardados = Array.isArray(alineacionCopiada.jugadores) ? alineacionCopiada.jugadores : [];
  document.getElementById("al_formacion").value = alineacionCopiada.formacion || "4-3-3";
  ALINEACION_EDITOR.jugadores = jugadoresGuardados.filter((j) => j.titular !== false)
    .map((j) => ({ x: j.x ?? 50, y: j.y ?? 50, dorsal: j.dorsal ?? null, nombre: j.nombre || "", capitan: j.capitan === true }));
  ALINEACION_EDITOR.suplentes = jugadoresGuardados.filter((j) => j.titular === false)
    .map((j) => ({ dorsal: j.dorsal ?? null, nombre: j.nombre || "", capitan: j.capitan === true }));
  if (!ALINEACION_EDITOR.jugadores.length) {
    const formacion = document.getElementById("al_formacion").value;
    ALINEACION_EDITOR.jugadores = generarPosicionesFormacion(formacion).map(([x, y]) => ({ x, y, dorsal: null, nombre: "", capitan: false }));
  }
  ALINEACION_EDITOR.jugadorSeleccionado = null;
  document.getElementById("alineacionEditorDatos").style.display = "none";
  pintarCampoAlineacion();
  pintarSuplentesAlineacion();
  EOF.toast(`Alineación copiada del partido vs ${alineacionCopiada.rival}.`);
}

function pintarCampoAlineacion() {
  const campo = document.getElementById("alineacionEditorCampo");
  // Se conserva el div de líneas del campo y se repintan solo los
  // jugadores encima.
  campo.querySelectorAll(".alineacion-jugador-editor").forEach((el) => el.remove());
  ALINEACION_EDITOR.jugadores.forEach((j, i) => {
    const el = document.createElement("div");
    el.className = "alineacion-jugador alineacion-jugador-editor" + (ALINEACION_EDITOR.jugadorSeleccionado === i ? " seleccionado" : "");
    el.style.left = `${j.x}%`;
    el.style.top = `${j.y}%`;
    el.innerHTML = `<span class="alineacion-dorsal">${j.dorsal ?? (i + 1)}</span><span class="alineacion-nombre">${j.nombre ? escapeHtml(j.nombre) : "Sin nombre"}${j.capitan ? ' <span class="alineacion-capitan-marca" title="Capitán">(C)</span>' : ""}</span>`;
    el.addEventListener("pointerdown", (e) => iniciarArrastreJugador(e, i));
    el.addEventListener("click", (e) => {
      // El click se dispara también tras un arrastre corto; solo abre el
      // panel de datos si no se ha movido apenas el puntero.
      if (el.dataset.arrastrado === "1") { el.dataset.arrastrado = "0"; return; }
      seleccionarJugadorAlineacion(i);
    });
    campo.appendChild(el);
  });
}

function seleccionarJugadorAlineacion(i) {
  ALINEACION_EDITOR.jugadorSeleccionado = i;
  const datosWrap = document.getElementById("alineacionEditorDatos");
  const j = ALINEACION_EDITOR.jugadores[i];
  datosWrap.style.display = "block";
  document.getElementById("alineacionEditorDatosTitulo").textContent = `Jugador (posición ${i + 1})`;
  document.getElementById("al_jug_dorsal").value = j.dorsal ?? "";
  document.getElementById("al_jug_nombre").value = j.nombre || "";
  const capitanCheck = document.getElementById("al_jug_capitan");
  if (capitanCheck) capitanCheck.checked = j.capitan === true;
  pintarCampoAlineacion();
}

document.getElementById("al_jug_dorsal").addEventListener("input", (e) => {
  const j = ALINEACION_EDITOR.jugadores[ALINEACION_EDITOR.jugadorSeleccionado];
  if (!j) return;
  const n = parseInt(e.target.value, 10);
  j.dorsal = Number.isFinite(n) ? n : null;
  pintarCampoAlineacion();
});
document.getElementById("al_jug_nombre").addEventListener("input", (e) => {
  const j = ALINEACION_EDITOR.jugadores[ALINEACION_EDITOR.jugadorSeleccionado];
  if (!j) return;
  j.nombre = e.target.value;
  pintarCampoAlineacion();
});
document.getElementById("al_jug_capitan")?.addEventListener("change", (e) => {
  const i = ALINEACION_EDITOR.jugadorSeleccionado;
  if (i === null || i === undefined || !ALINEACION_EDITOR.jugadores[i]) return;
  marcarCapitanAlineacion(ALINEACION_EDITOR.jugadores, i, e.target.checked);
  pintarCampoAlineacion();
  pintarSuplentesAlineacion();
});

// Arrastrar un jugador con el ratón/dedo para ajustar su posición exacta
// sobre el campo (además de la posición automática que da la formación).
function iniciarArrastreJugador(e, indice) {
  e.preventDefault();
  const campo = document.getElementById("alineacionEditorCampo");
  const el = e.currentTarget;
  const rect = campo.getBoundingClientRect();
  let movido = false;
  function mover(ev) {
    const x = Math.max(2, Math.min(98, ((ev.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(2, Math.min(98, ((ev.clientY - rect.top) / rect.height) * 100));
    ALINEACION_EDITOR.jugadores[indice].x = Math.round(x);
    ALINEACION_EDITOR.jugadores[indice].y = Math.round(y);
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    movido = true;
  }
  function soltar() {
    document.removeEventListener("pointermove", mover);
    document.removeEventListener("pointerup", soltar);
    if (movido) el.dataset.arrastrado = "1";
  }
  document.addEventListener("pointermove", mover);
  document.addEventListener("pointerup", soltar);
}

document.getElementById("al_formacion").addEventListener("change", (e) => {
  const posiciones = generarPosicionesFormacion(e.target.value);
  // Se conservan dorsal/nombre ya escritos, emparejando por índice; si la
  // nueva formación tiene menos huecos que jugadores ya rellenados, los
  // sobrantes pasan a suplentes en vez de perderse.
  const anteriores = ALINEACION_EDITOR.jugadores;
  ALINEACION_EDITOR.jugadores = posiciones.map(([x, y], i) => ({
    x, y,
    dorsal: anteriores[i]?.dorsal ?? null,
    nombre: anteriores[i]?.nombre ?? "",
    capitan: anteriores[i]?.capitan === true,
  }));
  if (anteriores.length > posiciones.length) {
    anteriores.slice(posiciones.length).forEach((j) => {
      if (j.nombre) ALINEACION_EDITOR.suplentes.push({ dorsal: j.dorsal, nombre: j.nombre, capitan: j.capitan === true });
    });
    pintarSuplentesAlineacion();
  }
  ALINEACION_EDITOR.jugadorSeleccionado = null;
  document.getElementById("alineacionEditorDatos").style.display = "none";
  pintarCampoAlineacion();
});

// ---------- Suplentes ----------
function pintarSuplentesAlineacion() {
  const cont = document.getElementById("alineacionEditorSuplentesLista");
  cont.innerHTML = ALINEACION_EDITOR.suplentes.map((s, i) => `
    <div class="fila-suplente-alineacion" data-i="${i}">
      <input type="text" class="sup-dorsal" placeholder="Dorsal" inputmode="numeric" value="${s.dorsal ?? ""}">
      <input type="text" class="sup-nombre" placeholder="Nombre del jugador" value="${s.nombre ? escapeHtml(s.nombre) : ""}">
      <label class="sup-capitan-label" title="Capitán">
        <input type="checkbox" class="sup-capitan" ${s.capitan ? "checked" : ""}> C
      </label>
      <button type="button" class="quitar-suplente" title="Quitar suplente">✕</button>
    </div>`).join("");
  cont.querySelectorAll(".fila-suplente-alineacion").forEach((fila) => {
    const i = parseInt(fila.dataset.i, 10);
    fila.querySelector(".sup-dorsal").addEventListener("input", (e) => {
      const n = parseInt(e.target.value, 10);
      ALINEACION_EDITOR.suplentes[i].dorsal = Number.isFinite(n) ? n : null;
    });
    fila.querySelector(".sup-nombre").addEventListener("input", (e) => {
      ALINEACION_EDITOR.suplentes[i].nombre = e.target.value;
    });
    fila.querySelector(".sup-capitan").addEventListener("change", (e) => {
      marcarCapitanAlineacion(ALINEACION_EDITOR.suplentes, i, e.target.checked);
      pintarCampoAlineacion();
      pintarSuplentesAlineacion();
    });
    fila.querySelector(".quitar-suplente").addEventListener("click", () => {
      ALINEACION_EDITOR.suplentes.splice(i, 1);
      pintarSuplentesAlineacion();
    });
  });
}
document.getElementById("btnAnadirSuplenteAlineacion").addEventListener("click", () => {
  ALINEACION_EDITOR.suplentes.push({ dorsal: null, nombre: "", capitan: false });
  pintarSuplentesAlineacion();
});

// ---------- Abrir/cerrar el modal ----------
// contexto: { articleId } o { resultId }. alineacionExistente: fila de
// la tabla "alineaciones" tal cual la devuelve la API, o null para crear
// una nueva.
function abrirEditorAlineacion(contexto, alineacionExistente) {
  const modal = document.getElementById("modalAlineacion");
  document.getElementById("al_id").value = alineacionExistente?.id || "";
  document.getElementById("al_article_id").value = contexto.articleId || "";
  document.getElementById("al_result_id").value = contexto.resultId || "";
  document.getElementById("alineacionModalTitulo").textContent = alineacionExistente ? "Editar alineación" : "Nueva alineación";
  document.getElementById("msgErrorAlineacion").style.display = "none";
  document.getElementById("btnEliminarAlineacion").style.display = alineacionExistente ? "inline-block" : "none";

  const todosLosClubes = listaTodosLosClubesFederativos().sort((a, b) => a.localeCompare(b));
  alTeamPicker.poblar(todosLosClubes, alineacionExistente?.equipo || "", true);
  document.getElementById("al_equipo_otro_wrap").style.display = alTeamPicker.obtenerValor() === VALOR_OTRO_EQUIPO ? "flex" : "none";
  document.getElementById("al_equipo_otro_nombre").value =
    (alTeamPicker.obtenerValor() === VALOR_OTRO_EQUIPO && alineacionExistente) ? alineacionExistente.equipo : "";

  const formacion = alineacionExistente?.formacion || "4-3-3";
  document.getElementById("al_formacion").value = formacion;

  if (alineacionExistente) {
    const jugadoresGuardados = Array.isArray(alineacionExistente.jugadores) ? alineacionExistente.jugadores : [];
    ALINEACION_EDITOR.jugadores = jugadoresGuardados.filter((j) => j.titular !== false)
      .map((j) => ({ x: j.x ?? 50, y: j.y ?? 50, dorsal: j.dorsal ?? null, nombre: j.nombre || "", capitan: j.capitan === true }));
    ALINEACION_EDITOR.suplentes = jugadoresGuardados.filter((j) => j.titular === false)
      .map((j) => ({ dorsal: j.dorsal ?? null, nombre: j.nombre || "", capitan: j.capitan === true }));
    // Si por lo que sea no hay titulares guardados, se genera la
    // formación por defecto para no dejar el campo vacío.
    if (!ALINEACION_EDITOR.jugadores.length) {
      ALINEACION_EDITOR.jugadores = generarPosicionesFormacion(formacion).map(([x, y]) => ({ x, y, dorsal: null, nombre: "", capitan: false }));
    }
  } else {
    ALINEACION_EDITOR.jugadores = generarPosicionesFormacion(formacion).map(([x, y]) => ({ x, y, dorsal: null, nombre: "", capitan: false }));
    ALINEACION_EDITOR.suplentes = [];
  }
  ALINEACION_EDITOR.jugadorSeleccionado = null;
  document.getElementById("alineacionEditorDatos").style.display = "none";
  pintarCampoAlineacion();
  pintarSuplentesAlineacion();
  cargarUltimasAlineacionesEquipo();

  modal.classList.add("abierto");
}

function cerrarModalAlineacion() {
  document.getElementById("modalAlineacion").classList.remove("abierto");
}

function nombreEquipoAlineacionElegido() {
  return alTeamPicker.obtenerValor() === VALOR_OTRO_EQUIPO
    ? document.getElementById("al_equipo_otro_nombre").value.trim()
    : alTeamPicker.obtenerValor();
}

document.getElementById("btnGuardarAlineacion").addEventListener("click", async () => {
  const equipo = nombreEquipoAlineacionElegido();
  const msgError = document.getElementById("msgErrorAlineacion");
  msgError.style.display = "none";
  if (!equipo) {
    msgError.textContent = "Elige el equipo de la alineación.";
    msgError.style.display = "block";
    return;
  }
  const jugadores = [
    ...ALINEACION_EDITOR.jugadores
      .filter((j) => j.nombre && j.nombre.trim())
      .map((j) => ({ x: j.x, y: j.y, dorsal: j.dorsal, nombre: j.nombre.trim(), titular: true, capitan: j.capitan === true })),
    ...ALINEACION_EDITOR.suplentes
      .filter((j) => j.nombre && j.nombre.trim())
      .map((j) => ({ dorsal: j.dorsal, nombre: j.nombre.trim(), titular: false, capitan: j.capitan === true })),
  ];
  if (!jugadores.some((j) => j.titular)) {
    msgError.textContent = "Añade al menos un jugador titular con nombre.";
    msgError.style.display = "block";
    return;
  }
  const id = document.getElementById("al_id").value;
  const body = {
    article_id: document.getElementById("al_article_id").value || null,
    result_id: document.getElementById("al_result_id").value || null,
    equipo,
    formacion: document.getElementById("al_formacion").value,
    jugadores,
  };
  try {
    if (id) {
      await apiFetch(`/api/alineaciones/${id}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      await apiFetch(`/api/alineaciones`, { method: "POST", body: JSON.stringify(body) });
    }
    cerrarModalAlineacion();
    if (body.article_id) cargarAlineacionesArticulo(body.article_id);
    if (body.result_id) cargarAlineacionesResultado(body.result_id);
    // Si el modal se abrió desde una noticia vinculada a este mismo
    // partido, la alineación cuelga de result_id pero el bloque que hay
    // que refrescar es el de la noticia (ver cargarAlineacionesArticulo).
    const articleIdAbierto = document.getElementById("articleId").value;
    if (body.result_id && articleIdAbierto && String(ARTICULO_ALINEACION_RESULTADO_ID) === String(body.result_id)) {
      cargarAlineacionesArticulo(articleIdAbierto);
    }
    EOF.toast("Alineación guardada correctamente.");
  } catch (err) {
    msgError.textContent = "Error: " + err.message;
    msgError.style.display = "block";
  }
});

document.getElementById("btnEliminarAlineacion").addEventListener("click", async () => {
  const id = document.getElementById("al_id").value;
  if (!id) return;
  if (!(await EOF.confirmar("¿Seguro que quieres eliminar esta alineación?", { peligroso: true, textoConfirmar: "Eliminar" }))) return;
  const articleId = document.getElementById("al_article_id").value;
  const resultId = document.getElementById("al_result_id").value;
  try {
    await apiFetch(`/api/alineaciones/${id}`, { method: "DELETE" });
    cerrarModalAlineacion();
    if (articleId) cargarAlineacionesArticulo(articleId);
    if (resultId) cargarAlineacionesResultado(resultId);
    const articleIdAbiertoDel = document.getElementById("articleId").value;
    if (resultId && articleIdAbiertoDel && String(ARTICULO_ALINEACION_RESULTADO_ID) === String(resultId)) {
      cargarAlineacionesArticulo(articleIdAbiertoDel);
    }
    EOF.toast("Alineación eliminada.");
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
});

// ---------- Listas de alineaciones ya guardadas (tarjetas resumen) ----------
function tarjetaAlineacionHTML(a) {
  const titulares = (a.jugadores || []).filter((j) => j.titular !== false).length;
  return `
    <div class="tarjeta-alineacion" data-id="${a.id}">
      <img class="escudo-mini" src="${escudoUrlAdmin(a.equipo, a.escudo_url)}" alt="" loading="lazy" onerror="this.src='${ESCUDO_GENERICO_ADMIN}'">
      <span class="tarjeta-alineacion-equipo">${escapeHtml(a.equipo)}</span>
      <span class="tarjeta-alineacion-info">${escapeHtml(a.formacion || "")} · ${titulares} jugadores</span>
      <button type="button" class="btn-secundari btn-editar-alineacion">Editar</button>
    </div>`;
}

// Guarda si la noticia cargada actualmente está vinculada a un partido,
// para que el botón "+ Añadir alineación" sepa si debe colgar la nueva
// alineación de la noticia o del partido (ver más abajo). Se actualiza
// cada vez que se recarga la lista.
let ARTICULO_ALINEACION_RESULTADO_ID = null;

async function cargarAlineacionesArticulo(articleId) {
  const cont = document.getElementById("listaAlineacionesArticulo");
  const btnAnadir = document.getElementById("btnAnadirAlineacionArticulo");
  const ayudaVinculo = document.getElementById("ayudaAlineacionArticuloVinculada");
  if (!articleId) { cont.innerHTML = ""; ARTICULO_ALINEACION_RESULTADO_ID = null; return; }
  try {
    const { article } = await apiFetch(`/api/articles/${articleId}`);
    // Si la noticia está vinculada a un partido, la(s) alineación(es) que
    // devuelve la API ya son las del partido (result_id), compartidas y
    // sincronizadas entre ambos: no existe una versión "propia" de la
    // noticia en ese caso (ver GET /api/articles/:slug en el worker).
    ARTICULO_ALINEACION_RESULTADO_ID = article?.resultado_id || null;
    if (ayudaVinculo) ayudaVinculo.style.display = ARTICULO_ALINEACION_RESULTADO_ID ? "block" : "none";
    const alineaciones = (article && article.alineaciones) || [];
    cont.innerHTML = alineaciones.length
      ? alineaciones.map(tarjetaAlineacionHTML).join("")
      : `<p class="ayuda-editor" style="margin:0;">Todavía no hay ninguna alineación añadida.</p>`;
    cont.querySelectorAll(".btn-editar-alineacion").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.closest(".tarjeta-alineacion").dataset.id, 10);
        const a = alineaciones.find((x) => x.id === id);
        if (!a) return;
        // Al editar, cuelga del mismo sitio del que ya cuelga realmente
        // la fila (del partido si hay vínculo, de la noticia si no).
        if (ARTICULO_ALINEACION_RESULTADO_ID) abrirEditorAlineacion({ resultId: ARTICULO_ALINEACION_RESULTADO_ID }, a);
        else abrirEditorAlineacion({ articleId }, a);
      });
    });
  } catch (err) {
    cont.innerHTML = `<p class="ayuda-editor" style="margin:0;">No se han podido cargar las alineaciones.</p>`;
  }
}

async function cargarAlineacionesResultado(resultId) {
  const cont = document.getElementById("listaAlineacionesResultado");
  if (!resultId) { cont.innerHTML = ""; return; }
  try {
    const { resultado } = await apiFetch(`/api/results/${resultId}`);
    const alineaciones = (resultado && resultado.alineaciones) || [];
    cont.innerHTML = alineaciones.length
      ? alineaciones.map(tarjetaAlineacionHTML).join("")
      : `<p class="ayuda-editor" style="margin:0;">Todavía no hay ninguna alineación añadida.</p>`;
    cont.querySelectorAll(".btn-editar-alineacion").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = parseInt(btn.closest(".tarjeta-alineacion").dataset.id, 10);
        const a = alineaciones.find((x) => x.id === id);
        if (a) abrirEditorAlineacion({ resultId }, a);
      });
    });
  } catch (err) {
    cont.innerHTML = `<p class="ayuda-editor" style="margin:0;">No se han podido cargar las alineaciones.</p>`;
  }
}

// ---------- RESULTADOS: MVP (jugador destacado) del partido ----------
// Igual que las alineaciones, cuelga directamente del resultado (no
// hace falta que el partido esté finalizado para poder marcarlo, por
// si un redactor lo prefiere decidir antes; en el panel de Minuto a
// Minuto sí solo se ofrece una vez finalizado, ver minuto-a-minuto.js).
function cargarMvpResultado(r) {
  const form = document.getElementById("formMvpResultado");
  if (!form) return;
  document.getElementById("mvp_equipo").value = r.mvp_equipo || "local";
  const { dorsal, nombre } = separarDorsalYJugador(r.mvp_jugador);
  document.getElementById("mvp_dorsal").value = dorsal;
  document.getElementById("mvp_jugador").value = nombre;
  document.getElementById("btnQuitarMvpResultado").style.display = r.mvp_jugador ? "inline-block" : "none";
}

document.getElementById("formMvpResultado").addEventListener("submit", async (e) => {
  e.preventDefault();
  const resultId = document.getElementById("resultadoId").value;
  if (!resultId) return;
  const jugador = combinarDorsalYJugador(document.getElementById("mvp_dorsal").value, document.getElementById("mvp_jugador").value);
  if (!jugador) return EOF.toast("Escribe el dorsal y/o el nombre del jugador", "error");
  const body = { mvp_jugador: jugador, mvp_equipo: document.getElementById("mvp_equipo").value };
  try {
    await apiFetch(`/api/results/${resultId}/mvp`, { method: "PUT", body: JSON.stringify(body) });
    cargarMvpResultado({ mvp_jugador: body.mvp_jugador, mvp_equipo: body.mvp_equipo });
    EOF.toast("MVP guardado", "exito");
    await cargaListaResultados();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
});

document.getElementById("btnQuitarMvpResultado").addEventListener("click", async () => {
  const resultId = document.getElementById("resultadoId").value;
  if (!resultId) return;
  if (!(await EOF.confirmar("¿Quitar el MVP de este partido?", { textoConfirmar: "Quitar" }))) return;
  try {
    await apiFetch(`/api/results/${resultId}/mvp`, { method: "PUT", body: JSON.stringify({ mvp_jugador: null, mvp_equipo: null }) });
    cargarMvpResultado({ mvp_jugador: null, mvp_equipo: null });
    EOF.toast("MVP eliminado", "exito");
    await cargaListaResultados();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
  }
});

document.getElementById("btnAnadirAlineacionArticulo").addEventListener("click", () => {
  const articleId = document.getElementById("articleId").value;
  if (!articleId) return;
  // Si la noticia está vinculada a un partido, la nueva alineación
  // cuelga directamente del partido (result_id) para que quede
  // compartida y sincronizada desde el primer momento, en vez de
  // colgar de la noticia y arriesgarse a duplicarla más tarde.
  if (ARTICULO_ALINEACION_RESULTADO_ID) {
    abrirEditorAlineacion({ resultId: ARTICULO_ALINEACION_RESULTADO_ID }, null);
  } else {
    abrirEditorAlineacion({ articleId }, null);
  }
});
document.getElementById("btnAnadirAlineacionResultado").addEventListener("click", () => {
  const resultId = document.getElementById("resultadoId").value;
  if (!resultId) return;
  abrirEditorAlineacion({ resultId }, null);
});

// Habilita/deshabilita el botón de "+ Añadir alineación" de la noticia
// según si ya tiene id (hace falta guardarla al menos una vez antes de
// poder colgarle una alineación).
function actualizarBloqueAlineacionesArticulo(articleId) {
  const btn = document.getElementById("btnAnadirAlineacionArticulo");
  const ayuda = document.getElementById("ayudaAlineacionArticulo");
  btn.disabled = !articleId;
  ayuda.style.display = articleId ? "none" : "block";
  cargarAlineacionesArticulo(articleId || null);
}

// Se llama explícitamente desde cancelarEdicion() y editarArticulo() (ver
// arriba), justo después de fijar/limpiar articleId, ya que asignar
// articleId.value por JS no dispara el evento "change" del input.
const inputArticleIdAlineacion = document.getElementById("articleId");
actualizarBloqueAlineacionesArticulo(inputArticleIdAlineacion.value);

// ---------- Encuesta de la noticia (dentro del propio editor) ----------
// Igual que las alineaciones: hace falta guardar la noticia al menos
// una vez (como borrador) para tener un article_id al que vincular la
// encuesta. Reutiliza el mismo modal de creación/edición del panel de
// "Encuestas", solo que aquí ya viene con la noticia preseleccionada.
async function cargarEncuestaArticulo(articleId) {
  const cont = document.getElementById("bloqueEncuestaArticulo");
  const ayuda = document.getElementById("ayudaEncuestaArticulo");
  if (!cont) return;
  if (!articleId) {
    cont.innerHTML = "";
    if (ayuda) ayuda.style.display = "block";
    return;
  }
  if (ayuda) ayuda.style.display = "none";
  cont.innerHTML = `<p class="ayuda-editor">Cargando...</p>`;
  try {
    const { encuesta } = await apiFetch(`/api/articles/${articleId}/poll`);
    if (!encuesta) {
      cont.innerHTML = `<button type="button" class="btn-secundari" id="btnCrearEncuestaArticulo">+ Añadir encuesta a esta noticia</button>`;
      document.getElementById("btnCrearEncuestaArticulo").addEventListener("click", () => {
        abrirModalEncuesta();
        // Preselecciona esta noticia en cuanto el <select> termine de
        // rellenarse (aseguraSelectArticulosEncuesta es async).
        aseguraSelectArticulosEncuesta().then(() => {
          document.getElementById("enc_articulo").value = articleId;
        });
      });
      return;
    }
    cont.innerHTML = encuestaItemHTML({ ...encuesta, articulo_titulo: null });
  } catch (err) {
    cont.innerHTML = `<p class="ayuda-editor">No se ha podido cargar la encuesta de esta noticia.</p>`;
  }
}

// Amplía el mismo hook que ya usan las alineaciones para no depender de
// un segundo listener sobre el input oculto #articleId.
const _actualizarBloqueAlineacionesArticuloOriginal = actualizarBloqueAlineacionesArticulo;
actualizarBloqueAlineacionesArticulo = function (articleId) {
  _actualizarBloqueAlineacionesArticuloOriginal(articleId);
  cargarEncuestaArticulo(articleId || null);
};
cargarEncuestaArticulo(inputArticleIdAlineacion.value || null);

// ---------- COLLAGES DE FOTOS ----------
// Combina 2-4 fotos en una sola cuadrícula dentro del texto de la
// noticia. Se guarda reutilizando el mismo sistema de "imagenes" del
// artículo (posición "collage", con "grupo" y "plantilla"), pero se
// gestiona con su propio editor porque agrupa varias fotos a la vez en
// vez de una fila = una foto como el resto de la lista.
const FOTOS_POR_PLANTILLA_COLLAGE_ADMIN = { "2-horizontal": 2, "2-vertical": 2, "3-una-grande": 3, "3-fila": 3, "4-cuadricula": 4 };
const NOMBRE_PLANTILLA_COLLAGE = {
  "2-horizontal": "2 fotos · lado a lado",
  "2-vertical": "2 fotos · una encima de otra",
  "3-una-grande": "3 fotos · una grande + 2",
  "3-fila": "3 fotos · en fila",
  "4-cuadricula": "4 fotos · cuadrícula",
};

// Los collages ya guardados se mantienen aparte de "imagenesLista"
// mientras se edita la noticia (no son filas normales de foto): cada
// collage es { grupo, plantilla, trasParrafo, fotos: [{url, foco, credito}, ...] }.
// (COLLAGES_ARTICULO y COLLAGE_EDITOR ya están declaradas arriba del
// todo del archivo, junto a RESULTADOS_CACHE — ver comentario allí.)

function etiquetaPosicionCollage(c) {
  if (c.posicion === "inicio") return "al inicio del artículo";
  if (c.posicion === "galeria") return "en la galería final";
  return `tras párrafo ${c.trasParrafo}`;
}

function pintarListaCollages() {
  const cont = document.getElementById("listaCollages");
  cont.innerHTML = COLLAGES_ARTICULO.length
    ? COLLAGES_ARTICULO.map((c, i) => `
      <div class="tarjeta-collage" data-i="${i}">
        <div class="tarjeta-collage-miniaturas">
          ${c.fotos.slice(0, 4).map((f) => `<img src="${f.url}" alt="" loading="lazy">`).join("")}
        </div>
        <span class="tarjeta-collage-info">${NOMBRE_PLANTILLA_COLLAGE[c.plantilla] || c.plantilla} · ${etiquetaPosicionCollage(c)}</span>
        <button type="button" class="btn-secundari btn-editar-collage">Editar</button>
      </div>`).join("")
    : `<p class="ayuda-editor" style="margin:0;">Todavía no hay ningún collage añadido.</p>`;
  cont.querySelectorAll(".btn-editar-collage").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.closest(".tarjeta-collage").dataset.i, 10);
      abrirEditorCollage(COLLAGES_ARTICULO[i], i);
    });
  });
}

function pintarFotosCollageEditor() {
  const cont = document.getElementById("collageFotosLista");
  const maxFotos = FOTOS_POR_PLANTILLA_COLLAGE_ADMIN[COLLAGE_EDITOR.plantilla] || 2;
  const ayuda = document.getElementById("collageAyudaFotos");
  ayuda.textContent = `Esta plantilla necesita ${maxFotos} foto${maxFotos > 1 ? "s" : ""}.`;

  cont.innerHTML = Array.from({ length: maxFotos }, (_, i) => {
    const f = COLLAGE_EDITOR.fotos[i] || { url: "" };
    return `
      <div class="fila-imagen-grupo fila-collage-foto" data-i="${i}">
        <div class="fila-imagen">
          <div class="imagen-preview-wrap">
            <img class="preview-imagen-fila" alt="" loading="lazy" ${f.url ? `src="${escapeHtml(f.url)}"` : "hidden"}>
            <input type="url" class="imagen-url-input" value="${f.url ? escapeHtml(f.url) : ""}" hidden>
            <button type="button" class="btn-subir-imagen" title="Subir foto desde el dispositivo" aria-label="Subir foto desde el dispositivo">${iconoSubirImagen()}</button>
            <input type="file" class="input-imagen-archivo" accept="image/*" hidden>
          </div>
          <div class="fila-imagen-credito">
            <input type="text" class="imagen-credito-input" placeholder="Crédito de la foto (opcional)" value="${f.credito ? escapeHtml(f.credito) : ""}">
          </div>
        </div>
      </div>`;
  }).join("");

  cont.querySelectorAll(".fila-collage-foto").forEach((fila) => {
    const i = parseInt(fila.dataset.i, 10);
    const urlInput = fila.querySelector(".imagen-url-input");
    const miniatura = fila.querySelector(".preview-imagen-fila");
    const creditoInput = fila.querySelector(".imagen-credito-input");
    const btnSubir = fila.querySelector(".btn-subir-imagen");
    const inputArchivo = fila.querySelector(".input-imagen-archivo");

    function guardarFoto() {
      COLLAGE_EDITOR.fotos[i] = {
        url: urlInput.value.trim(),
        foco: "50% 50%",
        credito: creditoInput.value.trim() || undefined,
      };
    }
    urlInput.addEventListener("input", () => {
      const url = urlInput.value.trim();
      miniatura.hidden = !url;
      if (url) miniatura.src = url;
      guardarFoto();
    });
    creditoInput.addEventListener("input", guardarFoto);
    btnSubir.addEventListener("click", () => inputArchivo.click());
    inputArchivo.addEventListener("change", async () => {
      const file = inputArchivo.files[0];
      inputArchivo.value = "";
      if (!file) return;
      btnSubir.disabled = true;
      btnSubir.classList.add("subiendo");
      try {
        const url = await subirImagenSuelta(file);
        urlInput.value = url;
        urlInput.dispatchEvent(new Event("input"));
      } catch (err) {
        EOF.toast(err.message || "No se pudo subir la foto", "error");
      } finally {
        btnSubir.disabled = false;
        btnSubir.classList.remove("subiendo");
      }
    });
  });
}

function abrirEditorCollage(collageExistente, indice) {
  document.getElementById("collageModalTitulo").textContent = collageExistente ? "Editar collage" : "Nuevo collage";
  document.getElementById("btnEliminarCollage").style.display = collageExistente ? "inline-block" : "none";
  document.getElementById("msgErrorCollage").style.display = "none";

  COLLAGE_EDITOR = collageExistente
    ? { ...collageExistente, fotos: collageExistente.fotos.map((f) => ({ ...f })), _indiceEdicion: indice }
    : { grupo: `collage-${Date.now()}`, plantilla: "2-horizontal", posicion: "collage", trasParrafo: 1, fotos: [], _indiceEdicion: null };
  if (!COLLAGE_EDITOR.posicion) COLLAGE_EDITOR.posicion = "collage"; // collages antiguos, sin posición guardada

  document.getElementById("cl_grupo").value = COLLAGE_EDITOR.grupo;
  document.getElementById("collageTrasParrafoTexto").textContent = `tras párrafo ${COLLAGE_EDITOR.trasParrafo}`;

  const chips = [...document.querySelectorAll("#collagePlantillaChips button")];
  function marcarChip() {
    chips.forEach((c) => c.classList.toggle("activo", c.dataset.plantilla === COLLAGE_EDITOR.plantilla));
  }
  chips.forEach((chip) => {
    chip.onclick = () => {
      COLLAGE_EDITOR.plantilla = chip.dataset.plantilla;
      marcarChip();
      pintarFotosCollageEditor();
    };
  });
  marcarChip();
  pintarFotosCollageEditor();

  // Selector de posición: al inicio del artículo, dentro del texto
  // (tras un párrafo concreto, como antes) o en la galería final. Solo
  // tiene sentido mostrar el selector de párrafo cuando la posición
  // elegida es "collage" (dentro del texto).
  const chipsPosicion = [...document.querySelectorAll("#collagePosicionChips button")];
  function marcarChipPosicion() {
    chipsPosicion.forEach((c) => c.classList.toggle("activo", c.dataset.posicion === COLLAGE_EDITOR.posicion));
    document.getElementById("collageTrasParrafoWrap").style.display = COLLAGE_EDITOR.posicion === "collage" ? "block" : "none";
  }
  chipsPosicion.forEach((chip) => {
    chip.onclick = () => {
      COLLAGE_EDITOR.posicion = chip.dataset.posicion;
      marcarChipPosicion();
    };
  });
  marcarChipPosicion();

  document.getElementById("modalCollage").classList.add("abierto");
}

function cerrarModalCollage() {
  document.getElementById("modalCollage").classList.remove("abierto");
}

// Reutiliza el selector visual de "tras qué párrafo" que ya usan las
// fotos sueltas (ver abrirSelectorParrafo más arriba): le basta con un
// elemento que tenga dataset.trasParrafo y un ".btn-elegir-parrafo-texto"
// dentro, así que el propio botón del modal de collage sirve tal cual.
document.getElementById("btnElegirParrafoCollage").addEventListener("click", (e) => {
  const btn = e.currentTarget;
  btn.dataset.trasParrafo = COLLAGE_EDITOR.trasParrafo;
  abrirSelectorParrafo(btn);
});
// Al confirmar el párrafo elegido, btnConfirmarParrafo actualiza el
// dataset y el texto del botón directamente; aquí solo hace falta leer
// ese resultado de vuelta hacia COLLAGE_EDITOR.
document.getElementById("btnConfirmarParrafo").addEventListener("click", () => {
  const btn = document.getElementById("btnElegirParrafoCollage");
  if (FILA_SELECTOR_PARRAFO_ACTUAL === btn) {
    COLLAGE_EDITOR.trasParrafo = parseInt(btn.dataset.trasParrafo, 10) || 1;
  }
});

document.getElementById("btnGuardarCollage").addEventListener("click", () => {
  const maxFotos = FOTOS_POR_PLANTILLA_COLLAGE_ADMIN[COLLAGE_EDITOR.plantilla] || 2;
  const fotosValidas = COLLAGE_EDITOR.fotos.filter((f) => f && f.url);
  const msgError = document.getElementById("msgErrorCollage");
  if (fotosValidas.length !== maxFotos) {
    msgError.textContent = `Esta plantilla necesita exactamente ${maxFotos} fotos.`;
    msgError.style.display = "block";
    return;
  }
  const collageGuardado = {
    grupo: COLLAGE_EDITOR.grupo,
    plantilla: COLLAGE_EDITOR.plantilla,
    posicion: COLLAGE_EDITOR.posicion || "collage",
    trasParrafo: COLLAGE_EDITOR.trasParrafo,
    fotos: fotosValidas,
  };
  if (COLLAGE_EDITOR._indiceEdicion !== null && COLLAGE_EDITOR._indiceEdicion !== undefined) {
    COLLAGES_ARTICULO[COLLAGE_EDITOR._indiceEdicion] = collageGuardado;
  } else {
    COLLAGES_ARTICULO.push(collageGuardado);
  }
  pintarListaCollages();
  cerrarModalCollage();
});

document.getElementById("btnEliminarCollage").addEventListener("click", () => {
  if (COLLAGE_EDITOR._indiceEdicion !== null && COLLAGE_EDITOR._indiceEdicion !== undefined) {
    COLLAGES_ARTICULO.splice(COLLAGE_EDITOR._indiceEdicion, 1);
    pintarListaCollages();
  }
  cerrarModalCollage();
});

document.getElementById("btnAnadirCollage").addEventListener("click", () => abrirEditorCollage(null, null));

// Convierte COLLAGES_ARTICULO al formato plano que espera el backend
// (una fila por foto, todas con posicion:"collage") para añadirlo al
// array de "imagenes" al guardar la noticia.
function collagesArticuloAImagenes() {
  const filas = [];
  COLLAGES_ARTICULO.forEach((c) => {
    const posicion = c.posicion || "collage";
    c.fotos.forEach((f) => {
      const fila = {
        url: f.url,
        posicion,
        foco: f.foco || "50% 50%",
        grupo: c.grupo,
        plantilla: c.plantilla,
        credito: f.credito || undefined,
      };
      // "trasParrafo" solo tiene sentido cuando el collage va dentro
      // del texto; al inicio o en la galería no se usa.
      if (posicion === "collage") fila.trasParrafo = c.trasParrafo;
      filas.push(fila);
    });
  });
  return filas;
}

// Reconstruye COLLAGES_ARTICULO a partir del array "imagenes" guardado
// en un artículo (al entrar en modo edición): agrupa las filas de
// posición "collage"/"inicio"/"galeria" que tengan "grupo" (así se
// distinguen de fotos sueltas normales, que no llevan grupo) por su
// "grupo".
function collagesDesdeImagenes(imagenes) {
  const grupos = new Map();
  const orden = [];
  (imagenes || []).filter((f) => f && f.grupo && ["collage", "inicio", "galeria"].includes(f.posicion)).forEach((f) => {
    const clave = f.grupo;
    if (!grupos.has(clave)) { grupos.set(clave, []); orden.push(clave); }
    grupos.get(clave).push(f);
  });
  return orden.map((clave) => {
    const fotos = grupos.get(clave);
    return {
      grupo: clave,
      plantilla: fotos[0].plantilla || "2-horizontal",
      posicion: fotos[0].posicion || "collage",
      trasParrafo: fotos[0].trasParrafo || 1,
      fotos: fotos.map((f) => ({ url: f.url, foco: f.foco, credito: f.credito })),
    };
  });
}

// ---------- Modo oscuro (cabecera del panel) ----------
// Mismo comportamiento que en el sitio público (ver js/layout.js): por
// defecto claro (fijado antes de pintar por tema.js, cargado en el
// <head> de panel.html), y este botón es la única forma de cambiarlo,
// recordando la elección en localStorage para las siguientes visitas
// (compartido con el resto del sitio, incluida la pantalla de acceso).
(function inicializarToggleTemaAdmin() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const esOscuroAhora = document.documentElement.getAttribute("data-theme") === "dark";
    const nuevo = esOscuroAhora ? "light" : "dark";
    if (nuevo === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("eof_tema", nuevo);
    } catch {}
  });
})();

// ---------- ENCUESTAS ----------
// Solo puede votar en el frontend un lector con cuenta, logueado y con
// el correo verificado (ver requireReaderVerificado en el worker); en
// el panel, crear/editar/cerrar solo pueden hacerlo redactores/admin,
// igual que cualquier otro contenido.

function encuestaEstadoBadgeHTML(encuesta) {
  if (encuesta.estado === "cerrada") return `<span class="badge-estado badge-rechazado">Cerrada</span>`;
  if (encuesta.cierra_en) return `<span class="badge-estado badge-aprobado">Abierta · cierra ${new Date(encuesta.cierra_en.replace(" ", "T")).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>`;
  return `<span class="badge-estado badge-aprobado">Abierta</span>`;
}

function encuestaItemHTML(encuesta) {
  const opciones = encuesta.opciones.map(o => {
    const pct = encuesta.total_votos ? Math.round((o.votos / encuesta.total_votos) * 100) : 0;
    return `<div style="margin:4px 0;">
      <div style="display:flex; justify-content:space-between; font-size:0.9em;">
        <span>${escapeHtml(o.texto)}</span>
        <span>${o.votos} voto${o.votos === 1 ? "" : "s"} (${pct}%)</span>
      </div>
      <div style="background:var(--borde,#ddd); border-radius:4px; height:6px; overflow:hidden;">
        <div style="background:var(--celeste,#0a7); height:100%; width:${pct}%;"></div>
      </div>
    </div>`;
  }).join("");

  const dondeAparece = [
    encuesta.articulo_titulo ? `en la noticia "${escapeHtml(encuesta.articulo_titulo)}"` : null,
    encuesta.en_portada ? "en portada" : null,
  ].filter(Boolean).join(" y ") || "en ningún sitio del frontend todavía";

  return `<div class="form-card" style="margin-bottom:14px;" data-encuesta-id="${encuesta.id}">
    <div style="display:flex; justify-content:space-between; align-items:start; gap:10px;">
      <strong>${escapeHtml(encuesta.pregunta)}</strong>
      ${encuestaEstadoBadgeHTML(encuesta)}
    </div>
    <p class="ayuda-editor" style="margin:6px 0 10px;">Aparece ${dondeAparece} · ${encuesta.total_votos} voto${encuesta.total_votos === 1 ? "" : "s"} en total</p>
    ${opciones}
    <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
      <button type="button" class="btn-secundari" data-encuesta-editar="${encuesta.id}">Editar</button>
      ${encuesta.estado === "abierta"
        ? `<button type="button" class="btn-secundari" data-encuesta-cerrar="${encuesta.id}">Cerrar</button>`
        : `<button type="button" class="btn-secundari" data-encuesta-reabrir="${encuesta.id}">Reabrir</button>`}
      <button type="button" class="btn-secundari" data-encuesta-borrar="${encuesta.id}">Borrar</button>
    </div>
  </div>`;
}

async function cargaEncuestas() {
  const cont = document.getElementById("listaEncuestas");
  if (!cont) return;
  cont.innerHTML = `<p class="solicitudes-vacio">Cargando...</p>`;
  try {
    const { encuestas = [] } = await apiFetch("/api/admin/polls");
    cont.innerHTML = encuestas.length
      ? encuestas.map(encuestaItemHTML).join("")
      : `<p class="solicitudes-vacio">Todavía no hay ninguna encuesta.</p>`;
  } catch (err) {
    cont.innerHTML = `<p class="solicitudes-vacio">No se han podido cargar las encuestas.</p>`;
  }
}

// Rellena el <select> de noticias del modal la primera vez que hace
// falta (reutiliza /api/articles, ya usado en otras partes del panel
// para listar noticias propias/todas según el rol).
let encuestaArticulosCargados = false;
async function aseguraSelectArticulosEncuesta() {
  if (encuestaArticulosCargados) return;
  const sel = document.getElementById("enc_articulo");
  if (!sel) return;
  try {
    const { articles = [] } = await apiFetch("/api/articles?admin=1&limit=500");
    for (const a of articles) {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.titulo;
      sel.appendChild(opt);
    }
    encuestaArticulosCargados = true;
  } catch (err) {
    // Si falla, se puede seguir creando/editando la encuesta sin
    // vincularla a ninguna noticia (o eligiéndola más tarde editando).
  }
}

const ENCUESTA_MAX_OPCIONES = 10;

function encuestaOpcionInputHTML(valor = "") {
  return `<div style="display:flex; gap:6px; margin-bottom:6px;" class="enc-opcion-fila">
    <input type="text" class="enc-opcion-input" maxlength="100" value="${escapeHtml(valor)}" placeholder="Opción">
    <button type="button" class="btn-secundari" onclick="this.closest('.enc-opcion-fila').remove(); actualizarBotonAnadirOpcionEncuesta();">✕</button>
  </div>`;
}

function anadirOpcionEncuesta(valor = "") {
  const lista = document.getElementById("encOpcionesLista");
  if (!lista) return;
  if (lista.querySelectorAll(".enc-opcion-fila").length >= ENCUESTA_MAX_OPCIONES) return;
  lista.insertAdjacentHTML("beforeend", encuestaOpcionInputHTML(valor));
  actualizarBotonAnadirOpcionEncuesta();
}

// Deshabilita el botón de "+ Añadir opción" en cuanto se llega al máximo,
// para que no se puedan escribir 15 opciones y encontrarse el error solo
// al final: el límite se ve y se respeta desde el propio formulario.
function actualizarBotonAnadirOpcionEncuesta() {
  const lista = document.getElementById("encOpcionesLista");
  const btn = document.getElementById("btnAnadirOpcionEncuesta");
  if (!lista || !btn) return;
  const n = lista.querySelectorAll(".enc-opcion-fila").length;
  btn.disabled = n >= ENCUESTA_MAX_OPCIONES;
  btn.textContent = n >= ENCUESTA_MAX_OPCIONES ? `Máximo ${ENCUESTA_MAX_OPCIONES} opciones` : "+ Añadir opción";
}

document.getElementById("btnAnadirOpcionEncuesta")?.addEventListener("click", () => anadirOpcionEncuesta());

document.getElementById("enc_en_portada")?.addEventListener("change", (e) => {
  document.getElementById("encOrdenPortadaWrap").style.display = e.target.checked ? "block" : "none";
});

function abrirModalEncuesta(encuesta = null) {
  aseguraSelectArticulosEncuesta();
  document.getElementById("msgOkEncuesta").style.display = "none";
  document.getElementById("errEncuesta").style.display = "none";
  document.getElementById("encuestaModalTitulo").textContent = encuesta ? "Editar encuesta" : "Nueva encuesta";
  document.getElementById("enc_id").value = encuesta?.id || "";
  document.getElementById("enc_pregunta").value = encuesta?.pregunta || "";

  // Las opciones solo se pueden tocar mientras la encuesta no tenga
  // ningún voto: en cuanto hay un voto, cambiar texto/añadir/quitar
  // opciones desbarataría los resultados (el backend las ignora igual
  // a partir de ahí, pero aquí se bloquea el formulario para que se
  // vea claro por qué no se guardan los cambios).
  const opcionesBloqueadas = !!encuesta && encuesta.total_votos > 0;

  const lista = document.getElementById("encOpcionesLista");
  lista.innerHTML = "";
  if (encuesta?.opciones?.length) {
    // Precarga sin aplicar el tope: si una encuesta ya tenía más de 10
    // opciones (creada antes de este límite, o por API), deben verse
    // todas para poder editarlas o borrar las que sobren, no perderse
    // silenciosamente al abrir el formulario.
    encuesta.opciones.forEach(o => lista.insertAdjacentHTML("beforeend", encuestaOpcionInputHTML(o.texto)));
  } else {
    anadirOpcionEncuesta();
    anadirOpcionEncuesta();
  }
  actualizarBotonAnadirOpcionEncuesta();

  lista.querySelectorAll(".enc-opcion-input").forEach(i => i.disabled = opcionesBloqueadas);
  lista.querySelectorAll(".enc-opcion-fila button").forEach(b => b.disabled = opcionesBloqueadas);
  const btnAnadirOpcion = document.getElementById("btnAnadirOpcionEncuesta");
  if (btnAnadirOpcion) btnAnadirOpcion.disabled = opcionesBloqueadas || btnAnadirOpcion.disabled;

  let avisoOpcionesBloqueadas = document.getElementById("encAvisoOpcionesBloqueadas");
  if (!avisoOpcionesBloqueadas) {
    avisoOpcionesBloqueadas = document.createElement("p");
    avisoOpcionesBloqueadas.id = "encAvisoOpcionesBloqueadas";
    avisoOpcionesBloqueadas.className = "ayuda-editor";
    lista.insertAdjacentElement("afterend", avisoOpcionesBloqueadas);
  }
  avisoOpcionesBloqueadas.textContent = opcionesBloqueadas
    ? `Esta encuesta ya tiene ${encuesta.total_votos} voto${encuesta.total_votos === 1 ? "" : "s"}: las opciones no se pueden modificar (cambiarlas invalidaría los resultados).`
    : "";
  avisoOpcionesBloqueadas.style.display = opcionesBloqueadas ? "block" : "none";

  const selArticulo = document.getElementById("enc_articulo");
  selArticulo.value = encuesta?.article_id || "";

  const chkPortada = document.getElementById("enc_en_portada");
  chkPortada.checked = !!encuesta?.en_portada;
  document.getElementById("encOrdenPortadaWrap").style.display = chkPortada.checked ? "block" : "none";
  document.getElementById("enc_orden_portada").value = encuesta?.orden_portada || 0;

  const inputCierra = document.getElementById("enc_cierra_en");
  if (encuesta?.cierra_en) {
    // "YYYY-MM-DD HH:MM:SS" (SQLite) -> valor que acepta datetime-local
    inputCierra.value = encuesta.cierra_en.replace(" ", "T").slice(0, 16);
  } else {
    inputCierra.value = "";
  }

  document.getElementById("modalEncuesta").classList.add("abierto");
}

function cerrarModalEncuesta() {
  document.getElementById("modalEncuesta").classList.remove("abierto");
}

document.getElementById("btnNuevaEncuesta")?.addEventListener("click", () => abrirModalEncuesta());

document.getElementById("btnGuardarEncuesta")?.addEventListener("click", async () => {
  const errEl = document.getElementById("errEncuesta");
  const okEl = document.getElementById("msgOkEncuesta");
  errEl.style.display = "none";
  okEl.style.display = "none";

  const id = document.getElementById("enc_id").value;
  const pregunta = document.getElementById("enc_pregunta").value.trim();
  const opciones = Array.from(document.querySelectorAll(".enc-opcion-input"))
    .map(i => i.value.trim())
    .filter(Boolean);
  // Si los inputs de opciones están deshabilitados (encuesta con votos),
  // no se mandan al backend: se conservan las que ya tenía.
  const opcionesBloqueadas = document.querySelector(".enc-opcion-input")?.disabled || false;
  const articleId = document.getElementById("enc_articulo").value || null;
  const enPortada = document.getElementById("enc_en_portada").checked;
  const ordenPortada = parseInt(document.getElementById("enc_orden_portada").value) || 0;
  const cierraEnInput = document.getElementById("enc_cierra_en").value;
  const cierraEn = cierraEnInput ? cierraEnInput.replace("T", " ") + ":00" : null;

  // Validaciones específicas antes de mandar la petición, en el mismo
  // orden y con los mismos límites que comprueba el backend, para que el
  // error se vea al momento y diga exactamente qué está mal (en vez de
  // un mensaje genérico tras el rechazo del servidor).
  if (!pregunta) { errEl.textContent = "Falta la pregunta."; errEl.style.display = "block"; return; }
  if (pregunta.length > 200) { errEl.textContent = `La pregunta es demasiado larga (máximo 200 caracteres, tiene ${pregunta.length}).`; errEl.style.display = "block"; return; }
  if (!opcionesBloqueadas) {
    if (opciones.length < 2) { errEl.textContent = "Añade al menos 2 opciones."; errEl.style.display = "block"; return; }
    if (opciones.length > 10) { errEl.textContent = `Máximo 10 opciones (tienes ${opciones.length}).`; errEl.style.display = "block"; return; }
    const opcionLarga = opciones.find(o => o.length > 100);
    if (opcionLarga) { errEl.textContent = `Una opción es demasiado larga (máximo 100 caracteres): "${opcionLarga.slice(0, 40)}...".`; errEl.style.display = "block"; return; }
    const opcionesUnicas = new Set(opciones.map(o => o.toLowerCase()));
    if (opcionesUnicas.size !== opciones.length) { errEl.textContent = "Hay opciones repetidas: cada opción debe ser distinta."; errEl.style.display = "block"; return; }
  }
  if (cierraEn) {
    const fechaCierre = new Date(cierraEnInput);
    if (isNaN(fechaCierre.getTime())) { errEl.textContent = "La fecha de cierre no es válida."; errEl.style.display = "block"; return; }
    if (!id && fechaCierre.getTime() <= Date.now()) { errEl.textContent = "La fecha de cierre debe ser futura."; errEl.style.display = "block"; return; }
  }

  const body = { pregunta, article_id: articleId, en_portada: enPortada, orden_portada: ordenPortada, cierra_en: cierraEn };
  // Al crear siempre se mandan; al editar solo si no están bloqueadas
  // por tener ya votos (si están bloqueadas, no se tocan en el backend).
  if (!id || !opcionesBloqueadas) body.opciones = opciones;

  try {
    if (id) {
      await apiFetch(`/api/admin/polls/${id}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      await apiFetch("/api/admin/polls", { method: "POST", body: JSON.stringify(body) });
    }
    okEl.style.display = "block";
    await cargaEncuestas();
    setTimeout(() => cerrarModalEncuesta(), 700);
  } catch (err) {
    errEl.textContent = err.message || "No se ha podido guardar la encuesta.";
    errEl.style.display = "block";
  }
});

document.getElementById("listaEncuestas")?.addEventListener("click", async (e) => {
  const idEditar = e.target.dataset.encuestaEditar;
  const idCerrar = e.target.dataset.encuestaCerrar;
  const idReabrir = e.target.dataset.encuestaReabrir;
  const idBorrar = e.target.dataset.encuestaBorrar;

  if (idEditar) {
    try {
      const { encuestas = [] } = await apiFetch("/api/admin/polls");
      const encuesta = encuestas.find(p => String(p.id) === idEditar);
      if (encuesta) abrirModalEncuesta(encuesta);
    } catch (err) {
      alert("No se ha podido cargar la encuesta: " + err.message);
    }
  }

  if (idCerrar) {
    try {
      await apiFetch(`/api/admin/polls/${idCerrar}/cerrar`, { method: "POST" });
      cargaEncuestas();
    } catch (err) {
      alert("No se ha podido cerrar: " + err.message);
    }
  }

  if (idReabrir) {
    try {
      await apiFetch(`/api/admin/polls/${idReabrir}/reabrir`, { method: "POST" });
      cargaEncuestas();
    } catch (err) {
      alert("No se ha podido reabrir: " + err.message);
    }
  }

  if (idBorrar) {
    if (!confirm("¿Borrar esta encuesta? Se perderán también sus votos. Esta acción no se puede deshacer.")) return;
    try {
      await apiFetch(`/api/admin/polls/${idBorrar}`, { method: "DELETE" });
      cargaEncuestas();
    } catch (err) {
      alert("No se ha podido borrar: " + err.message);
    }
  }
});
// ============================================================
// Calendario de jornadas (pestaña Resultados > Calendario de
// jornadas): sobre-escritura manual del número de jornada
// (intRound) que da TheSportsDB para el relleno automático de
// partidos, porque a menudo se equivoca -sobre todo en
// Primera/Segunda RFEF-. Ver /api/jornadas-calendario en
// worker/src/index.js.
// ============================================================
let calJornadasTodas = [];

function calJornadasGrupoRequerido(competicion) {
  return competicion === "primera_federacion" || competicion === "segunda_federacion";
}

function calJornadasActualizarVisibilidadGrupo() {
  const competicion = document.getElementById("calJornadasCompeticion").value;
  const requiereGrupo = calJornadasGrupoRequerido(competicion);
  const selectGrupo = document.getElementById("calJornadasGrupo");
  const checkTodos = document.getElementById("calJornadasTodosGrupos");
  const opcionesGrupo = competicion === "primera_federacion"
    ? ["Grupo 1", "Grupo 2"]
    : competicion === "segunda_federacion"
      ? ["Grupo 1", "Grupo 2", "Grupo 3", "Grupo 4", "Grupo 5"]
      : [];
  selectGrupo.innerHTML = opcionesGrupo.map(g => `<option value="${g}">${g}</option>`).join("");
  selectGrupo.style.display = requiereGrupo && !checkTodos.checked ? "" : "none";
  checkTodos.closest(".cal-jornadas-check").style.display = requiereGrupo ? "" : "none";
}

async function calJornadasCargar() {
  const contenedor = document.getElementById("calJornadasLista");
  contenedor.innerHTML = `<p class="cal-jornadas-vacio">Cargando...</p>`;
  try {
    const { jornadas } = await apiFetch("/api/jornadas-calendario");
    calJornadasTodas = jornadas || [];
    calJornadasPintar();
  } catch (err) {
    contenedor.innerHTML = `<p class="cal-jornadas-vacio">No se ha podido cargar: ${err.message}</p>`;
  }
}

function calJornadasFechaHoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function calJornadasPintar() {
  const competicion = document.getElementById("calJornadasCompeticion").value;
  const contenedor = document.getElementById("calJornadasLista");
  const filas = calJornadasTodas
    .filter(j => j.competicion === competicion)
    .sort((a, b) => (a.grupo || "").localeCompare(b.grupo || "") || a.fecha_inicio.localeCompare(b.fecha_inicio));

  if (!filas.length) {
    contenedor.innerHTML = `<p class="cal-jornadas-vacio">Todavía no hay ningún rango definido para esta competición.</p>`;
    return;
  }

  const hoy = calJornadasFechaHoyISO();
  const plantilla = document.getElementById("plantillaRangoJornada");
  contenedor.innerHTML = "";
  for (const fila of filas) {
    const nodo = plantilla.content.cloneNode(true);
    const filaEl = nodo.querySelector(".cal-jornada-fila");
    filaEl.dataset.id = fila.id;
    if (fila.fecha_inicio <= hoy && fila.fecha_fin >= hoy) filaEl.classList.add("cal-jornada-vigente");
    nodo.querySelector(".cal-jornada-numero-valor").textContent = fila.jornada;
    nodo.querySelector(".cal-jornada-input-jornada").value = fila.jornada;
    nodo.querySelector(".cal-jornada-input-inicio").value = fila.fecha_inicio;
    nodo.querySelector(".cal-jornada-input-fin").value = fila.fecha_fin;
    nodo.querySelector(".cal-jornada-grupo-etiqueta").textContent = fila.grupo || "";
    contenedor.appendChild(nodo);
  }
}

async function calJornadasGuardarFila(filaEl) {
  const id = filaEl.dataset.id;
  const competicion = document.getElementById("calJornadasCompeticion").value;
  const grupoActual = calJornadasTodas.find(j => String(j.id) === String(id))?.grupo || null;
  const jornada = parseInt(filaEl.querySelector(".cal-jornada-input-jornada").value, 10);
  const fecha_inicio = filaEl.querySelector(".cal-jornada-input-inicio").value;
  const fecha_fin = filaEl.querySelector(".cal-jornada-input-fin").value;
  if (!Number.isInteger(jornada) || jornada < 1) return window.EOF.toast("La jornada debe ser un número válido", "error");
  if (!fecha_inicio || !fecha_fin) return window.EOF.toast("Faltan fechas", "error");
  if (fecha_fin < fecha_inicio) return window.EOF.toast("La fecha fin no puede ser anterior a la de inicio", "error");

  filaEl.classList.add("cal-jornada-guardando");
  try {
    await apiFetch(`/api/jornadas-calendario/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competicion, grupo: grupoActual, jornada, fecha_inicio, fecha_fin }),
    });
    window.EOF.toast("Rango actualizado", "exito");
    await calJornadasCargar();
  } catch (err) {
    window.EOF.toast("No se ha podido guardar: " + err.message, "error");
  } finally {
    filaEl.classList.remove("cal-jornada-guardando");
  }
}

async function calJornadasBorrarFila(filaEl) {
  const ok = await window.EOF.confirmar("¿Eliminar este rango de jornada? Los próximos syncs volverán a usar la jornada que dé la API para estas fechas.");
  if (!ok) return;
  const id = filaEl.dataset.id;
  try {
    await apiFetch(`/api/jornadas-calendario/${id}`, { method: "DELETE" });
    window.EOF.toast("Rango eliminado", "exito");
    await calJornadasCargar();
  } catch (err) {
    window.EOF.toast("No se ha podido eliminar: " + err.message, "error");
  }
}

async function calJornadasAnadirRango() {
  const competicion = document.getElementById("calJornadasCompeticion").value;
  const requiereGrupo = calJornadasGrupoRequerido(competicion);
  const todosGrupos = document.getElementById("calJornadasTodosGrupos").checked;
  const grupoUnico = document.getElementById("calJornadasGrupo").value;

  const filasCompeticion = calJornadasTodas.filter(j => j.competicion === competicion);
  const ultimaJornada = filasCompeticion.reduce((max, j) => Math.max(max, j.jornada), 0);
  const jornada = ultimaJornada + 1;
  const hoy = calJornadasFechaHoyISO();

  const grupos = !requiereGrupo
    ? [null]
    : todosGrupos
      ? (competicion === "primera_federacion" ? ["Grupo 1", "Grupo 2"] : ["Grupo 1", "Grupo 2", "Grupo 3", "Grupo 4", "Grupo 5"])
      : [grupoUnico];

  try {
    for (const grupo of grupos) {
      await apiFetch("/api/jornadas-calendario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competicion, grupo, jornada, fecha_inicio: hoy, fecha_fin: hoy }),
      });
    }
    window.EOF.toast(`Jornada ${jornada} añadida — ajusta las fechas`, "exito");
    await calJornadasCargar();
  } catch (err) {
    window.EOF.toast("No se ha podido añadir: " + err.message, "error");
  }
}

async function calJornadasRecalcular() {
  const ok = await window.EOF.confirmar("Esto revisa todos los partidos automáticos ya guardados y les aplica la jornada del calendario donde corresponda. ¿Continuar?");
  if (!ok) return;
  const boton = document.getElementById("btnRecalcularJornadas");
  boton.disabled = true;
  boton.textContent = "Recalculando...";
  try {
    const resultado = await apiFetch("/api/jornadas-calendario/recalcular", { method: "POST" });
    window.EOF.toast(`Revisados ${resultado.revisados}, corregidos ${resultado.actualizados}`, "exito");
  } catch (err) {
    window.EOF.toast("No se ha podido recalcular: " + err.message, "error");
  } finally {
    boton.disabled = false;
    boton.textContent = "↻ Recalcular partidos ya guardados";
  }
}

document.getElementById("calJornadasCompeticion")?.addEventListener("change", () => {
  calJornadasActualizarVisibilidadGrupo();
  calJornadasPintar();
});
document.getElementById("calJornadasTodosGrupos")?.addEventListener("change", calJornadasActualizarVisibilidadGrupo);
document.getElementById("btnAnadirRangoJornada")?.addEventListener("click", calJornadasAnadirRango);
document.getElementById("btnRecalcularJornadas")?.addEventListener("click", calJornadasRecalcular);
document.getElementById("calJornadasLista")?.addEventListener("click", (e) => {
  const filaEl = e.target.closest(".cal-jornada-fila");
  if (!filaEl) return;
  if (e.target.closest(".cal-jornada-guardar")) calJornadasGuardarFila(filaEl);
  if (e.target.closest(".cal-jornada-borrar")) calJornadasBorrarFila(filaEl);
});
document.querySelector('#panel-resultados .subtabs button[data-subtab="calendarioJornadas"]')?.addEventListener("click", () => {
  calJornadasActualizarVisibilidadGrupo();
  calJornadasCargar();
});

// ---------- TIENDA DE ACREDITACIÓN ----------
// Catálogo fijo (gorra, camiseta, micro personalizado...) + pago manual
// por Bizum: el redactor pide, indica la referencia de su Bizum, y un
// admin/gestor de tienda confirma el pago desde la subtab "Gestión de
// pedidos" (solo visible para quien tenga permiso). Ver worker/src/index.js
// (rutas /api/tienda/...) y worker/migracion_tienda.sql.

let TIENDA_PRODUCTOS_CACHE = {};
let TIENDA_PRODUCTOS_LISTA = []; // para poder filtrar por el buscador sin recargar
let TIENDA_PRODUCTO_ELEGIDO = null;
let TIENDA_PUEDE_GESTIONAR = null; // null = todavía no comprobado
let TIENDA_FILTRO_ESTADO_GESTION = "";
let TIENDA_GESTION_LISTA = []; // pedidos de la última carga de gestión, para filtrar por texto
let TIENDA_GESTION_BUSQUEDA = "";

const TIENDA_ETIQUETAS_ESTADO = {
  pendiente_pago: "Pendiente de pago",
  pagado: "Pagado",
  enviado: "Enviado",
  cancelado: "Cancelado",
};

// Orden de la línea de tiempo (cancelado se pinta aparte, no en la línea)
const TIENDA_PASOS_TIMELINE = ["pendiente_pago", "pagado", "enviado"];

function tiendaFormatPrecio(centimos) {
  return (centimos / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function tiendaIconoProducto() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
}

// Carga los datos correspondientes al abrir cada subtab de "Tienda".
// La subtab "Gestión de pedidos" solo se muestra/carga si el usuario
// puede gestionar la tienda (se comprueba una vez y se cachea).
async function cargaSubtabTienda(subtab) {
  await tiendaComprobarPermisoGestion();
  if (subtab === "tiendaCatalogo") cargaTiendaCatalogo();
  if (subtab === "tiendaMisPedidos") cargaTiendaMisPedidos();
  if (subtab === "tiendaGestion" && TIENDA_PUEDE_GESTIONAR) cargaTiendaGestion();
  if (subtab === "tiendaProductos" && TIENDA_PUEDE_GESTIONAR) cargaTiendaProductosGestion();
}

// Los admin siempre pueden gestionar la tienda; para el resto se
// comprueba pidiendo la lista de pedidos (403 si no tiene permiso), sin
// necesidad de un endpoint aparte solo para esta comprobación.
async function tiendaComprobarPermisoGestion() {
  if (TIENDA_PUEDE_GESTIONAR !== null) return;
  if (USER.rol === "admin") {
    TIENDA_PUEDE_GESTIONAR = true;
  } else {
    try {
      await apiFetch(`/api/tienda/pedidos`);
      TIENDA_PUEDE_GESTIONAR = true;
    } catch {
      TIENDA_PUEDE_GESTIONAR = false;
    }
  }
  const subtabBtn = document.getElementById("subtabTiendaGestion");
  const subtabProductosBtn = document.getElementById("subtabTiendaProductos");
  if (subtabBtn) subtabBtn.style.display = TIENDA_PUEDE_GESTIONAR ? "" : "none";
  if (subtabProductosBtn) subtabProductosBtn.style.display = TIENDA_PUEDE_GESTIONAR ? "" : "none";
  if (TIENDA_PUEDE_GESTIONAR) actualizarBadgeTiendaGestionPendientes();
}

// ---------- Catálogo ----------
async function cargaTiendaCatalogo() {
  const cont = document.getElementById("tiendaGrid");
  if (!cont) return;
  cont.innerHTML = "<div class='tienda-skeleton'></div><div class='tienda-skeleton'></div><div class='tienda-skeleton'></div>";
  try {
    const { productos = [] } = await apiFetch(`/api/tienda/productos`);
    TIENDA_PRODUCTOS_CACHE = {};
    productos.forEach((p) => { TIENDA_PRODUCTOS_CACHE[p.id] = p; });
    TIENDA_PRODUCTOS_LISTA = productos;
    pintarTiendaCatalogoFiltrado();
  } catch (err) {
    cont.innerHTML = `<p class='solicitudes-vacio'>Error cargando el catálogo: ${err.message}</p>`;
  }
}

// Repinta el grid a partir de TIENDA_PRODUCTOS_LISTA aplicando el texto
// escrito en el buscador, sin volver a pedir nada a la API.
function pintarTiendaCatalogoFiltrado() {
  const cont = document.getElementById("tiendaGrid");
  if (!cont) return;
  const texto = normalizarBusquedaPanel(document.getElementById("tiendaBuscador")?.value || "");
  const productos = texto
    ? TIENDA_PRODUCTOS_LISTA.filter((p) =>
        normalizarBusquedaPanel(p.nombre || "").includes(texto) || normalizarBusquedaPanel(p.descripcion || "").includes(texto))
    : TIENDA_PRODUCTOS_LISTA;

  if (!TIENDA_PRODUCTOS_LISTA.length) {
    cont.innerHTML = "<p class='solicitudes-vacio'>De momento no hay productos disponibles en la tienda.</p>";
  } else if (!productos.length) {
    cont.innerHTML = "<p class='tienda-vacio-busqueda'>Ningún producto coincide con tu búsqueda.</p>";
  } else {
    cont.innerHTML = productos.map(pintarTarjetaProductoTienda).join("");
  }
}

document.getElementById("tiendaBuscador")?.addEventListener("input", pintarTiendaCatalogoFiltrado);

function pintarTarjetaProductoTienda(p) {
  const imagenHTML = p.imagen_url
    ? `<div class="tienda-tarjeta-imagen" style="background-image:url('${escapeHtml(p.imagen_url)}')"></div>`
    : `<div class="tienda-tarjeta-imagen">${tiendaIconoProducto()}</div>`;
  return `
    <div class="tienda-tarjeta" data-id="${p.id}">
      <div class="tienda-tarjeta-clic" data-id="${p.id}">
        ${imagenHTML}
        <div class="tienda-tarjeta-cuerpo">
          <p class="tienda-tarjeta-nombre">${escapeHtml(p.nombre)}</p>
          ${p.descripcion ? `<p class="tienda-tarjeta-descripcion">${escapeHtml(p.descripcion)}</p>` : ""}
          <p class="tienda-tarjeta-precio">${tiendaFormatPrecio(p.precio_centimos)}</p>
        </div>
      </div>
      <div class="tienda-tarjeta-pie">
        <button type="button" class="tienda-tarjeta-ver" data-id="${p.id}">Ver detalles</button>
        <button type="button" class="tienda-tarjeta-boton" data-id="${p.id}">Pedir</button>
      </div>
    </div>`;
}

document.getElementById("tiendaGrid")?.addEventListener("click", (ev) => {
  const btnPedir = ev.target.closest(".tienda-tarjeta-boton");
  if (btnPedir) {
    abrirModalTiendaCheckout(Number(btnPedir.dataset.id));
    return;
  }
  const btnVer = ev.target.closest(".tienda-tarjeta-ver") || ev.target.closest(".tienda-tarjeta-clic");
  if (btnVer) {
    mostrarTiendaFicha(Number(btnVer.dataset.id));
  }
});

// ---------- Ficha de producto (página de detalle, estilo "tienda profesional") ----------
// No es una subtab con botón propio: se abre programáticamente al
// pulsar una tarjeta del catálogo, activando el subpanel a mano con el
// mismo mecanismo (clases "activo") que usa el resto del panel.
function mostrarTiendaFicha(productoId) {
  const producto = TIENDA_PRODUCTOS_CACHE[productoId];
  const cont = document.getElementById("tiendaFichaContenido");
  if (!producto || !cont) return;

  const panelTienda = document.getElementById("panel-tienda");
  panelTienda.querySelectorAll(":scope > .subtabs button").forEach((b) => b.classList.remove("activo"));
  panelTienda.querySelectorAll(":scope > .subpanel").forEach((p) => p.classList.remove("activo"));
  document.getElementById("subpanel-tiendaFicha").classList.add("activo");

  const tieneVariantes = Array.isArray(producto.variantes) && producto.variantes.length > 0;
  const imagenHTML = producto.imagen_url
    ? `<div class="tienda-ficha-imagen" style="background-image:url('${escapeHtml(producto.imagen_url)}')"></div>`
    : `<div class="tienda-ficha-imagen">${tiendaIconoProducto()}</div>`;
  const variantesHTML = tieneVariantes ? `
      <div class="tienda-ficha-variantes">
        <span class="tienda-ficha-variantes-label">Talla</span>
        <div class="tienda-ficha-chips" id="tiendaFichaChips">
          ${producto.variantes.map((v, i) => `<button type="button" class="tienda-ficha-chip ${i === 0 ? "activo" : ""}" data-variante="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join("")}
        </div>
      </div>` : "";

  cont.innerHTML = `
    <div class="tienda-ficha">
      ${imagenHTML}
      <div class="tienda-ficha-info">
        <h2 class="tienda-ficha-nombre">${escapeHtml(producto.nombre)}</h2>
        <p class="tienda-ficha-precio">${tiendaFormatPrecio(producto.precio_centimos)}</p>
        ${producto.descripcion ? `<p class="tienda-ficha-descripcion">${escapeHtml(producto.descripcion)}</p>` : ""}
        ${variantesHTML}
        <button type="button" class="tienda-tarjeta-boton tienda-ficha-boton" id="tiendaFichaPedir" data-id="${producto.id}">Pedir ahora</button>
        <div class="tienda-ficha-garantias">
          <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>Pago seguro por Bizum</span>
          <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>Confirmación manual del equipo</span>
        </div>
      </div>
    </div>`;
}

document.getElementById("tiendaFichaVolver")?.addEventListener("click", () => {
  document.querySelector('#panel-tienda .subtabs button[data-subtab="tiendaCatalogo"]').click();
});

document.getElementById("tiendaFichaContenido")?.addEventListener("click", (ev) => {
  const chip = ev.target.closest(".tienda-ficha-chip");
  if (chip) {
    chip.closest("#tiendaFichaChips").querySelectorAll(".tienda-ficha-chip").forEach((c) => c.classList.remove("activo"));
    chip.classList.add("activo");
    return;
  }
  const btnPedir = ev.target.closest("#tiendaFichaPedir");
  if (btnPedir) {
    const chipActivo = document.querySelector("#tiendaFichaChips .tienda-ficha-chip.activo");
    abrirModalTiendaCheckout(Number(btnPedir.dataset.id), chipActivo?.dataset.variante);
  }
});

// ---------- Modal de checkout ----------
// varianteInicial: cuando se pide desde la ficha de producto con una
// talla ya elegida (chips), se preselecciona en el <select> en vez de
// dejar la primera opción por defecto.
function abrirModalTiendaCheckout(productoId, varianteInicial) {
  const producto = TIENDA_PRODUCTOS_CACHE[productoId];
  if (!producto) return;
  TIENDA_PRODUCTO_ELEGIDO = producto;

  document.getElementById("tcNombre").textContent = producto.nombre;
  document.getElementById("tcPrecio").textContent = tiendaFormatPrecio(producto.precio_centimos);
  document.getElementById("tcPrecioBizum").textContent = tiendaFormatPrecio(producto.precio_centimos);

  const imagen = document.getElementById("tcImagen");
  if (producto.imagen_url) {
    imagen.src = producto.imagen_url;
    imagen.hidden = false;
  } else {
    imagen.hidden = true;
  }

  const grupoVariante = document.getElementById("tcVarianteGrupo");
  const selectVariante = document.getElementById("tcVariante");
  if (Array.isArray(producto.variantes) && producto.variantes.length) {
    selectVariante.innerHTML = producto.variantes.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    if (varianteInicial && producto.variantes.includes(varianteInicial)) selectVariante.value = varianteInicial;
    grupoVariante.style.display = "";
  } else {
    selectVariante.innerHTML = "";
    grupoVariante.style.display = "none";
  }

  document.getElementById("tcReferencia").value = "";
  document.getElementById("tcError").style.display = "none";
  document.getElementById("tcConfirmar").disabled = false;
  document.getElementById("tcConfirmar").textContent = "He pagado, confirmar pedido";
  document.getElementById("modalTiendaCheckout").classList.add("abierto");
}

function cerrarModalTiendaCheckout() {
  document.getElementById("modalTiendaCheckout").classList.remove("abierto");
  TIENDA_PRODUCTO_ELEGIDO = null;
}

async function confirmarPedidoTienda() {
  if (!TIENDA_PRODUCTO_ELEGIDO) return;
  const errEl = document.getElementById("tcError");
  errEl.style.display = "none";
  const btn = document.getElementById("tcConfirmar");
  const variante = document.getElementById("tcVarianteGrupo").style.display !== "none"
    ? document.getElementById("tcVariante").value
    : undefined;
  const referencia = document.getElementById("tcReferencia").value.trim();

  btn.disabled = true;
  btn.textContent = "Enviando...";
  try {
    await apiFetch(`/api/tienda/pedidos`, {
      method: "POST",
      body: JSON.stringify({
        producto_id: TIENDA_PRODUCTO_ELEGIDO.id,
        variante,
        referencia_pago: referencia,
      }),
    });
    EOF.toast("Pedido registrado. Te avisaremos en cuanto confirmemos el pago.", "exito");
    cerrarModalTiendaCheckout();
    cargaTiendaMisPedidos();
  } catch (err) {
    errEl.textContent = err.message || "No se ha podido registrar el pedido.";
    errEl.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "He pagado, confirmar pedido";
  }
}

// ---------- Mis pedidos ----------
async function cargaTiendaMisPedidos() {
  const cont = document.getElementById("tiendaMisPedidosLista");
  if (!cont) return;
  cont.innerHTML = "<p class='solicitudes-vacio'>Cargando...</p>";
  try {
    const { pedidos = [] } = await apiFetch(`/api/tienda/mis-pedidos`);
    cont.innerHTML = pedidos.length
      ? pedidos.map(pintarMiPedidoTiendaHTML).join("")
      : "<p class='solicitudes-vacio'>Todavía no has pedido nada en la tienda.</p>";
  } catch (err) {
    cont.innerHTML = `<p class='solicitudes-vacio'>Error cargando tus pedidos: ${err.message}</p>`;
  }
}

// Pinta la línea de tiempo pendiente → pagado → enviado. Si el pedido
// está cancelado se muestra aparte, en rojo, sin línea de progreso.
function tiendaPintarTimeline(estado) {
  if (estado === "cancelado") {
    return `<div class="tienda-pedido-timeline cancelado"><div class="paso actual"><span class="punto"></span>Cancelado</div></div>`;
  }
  const posicionActual = TIENDA_PASOS_TIMELINE.indexOf(estado);
  return `<div class="tienda-pedido-timeline">${TIENDA_PASOS_TIMELINE.map((paso, i) => {
    const clase = i < posicionActual ? "hecho" : i === posicionActual ? "actual" : "";
    const separador = i < TIENDA_PASOS_TIMELINE.length - 1 ? `<span class="linea"></span>` : "";
    return `<div class="paso ${clase}"><span class="punto"></span>${TIENDA_ETIQUETAS_ESTADO[paso]}</div>${separador}`;
  }).join("")}</div>`;
}

function pintarMiPedidoTiendaHTML(p) {
  const fecha = formatFecha(p.created_at) || p.created_at;
  const metaTexto = [p.variante ? `Talla ${escapeHtml(p.variante)}` : "", fecha].filter(Boolean).join(" · ");
  const referenciaHTML = p.referencia_pago
    ? `<p class="tienda-pedido-referencia">Referencia: <strong>${escapeHtml(p.referencia_pago)}</strong></p>`
    : "";
  const cancelarHTML = p.estado === "pendiente_pago"
    ? `<button type="button" class="tienda-pedido-cancelar" data-id="${p.id}">Cancelar pedido</button>`
    : "";
  // Borrar (quitar de la lista para siempre) solo tiene sentido una vez
  // el pedido ya está "cerrado" (cancelado o enviado): mientras sigue
  // pendiente de pago o pagado-sin-enviar, lo correcto es cancelarlo
  // primero o esperar a que se gestione.
  const borrarHTML = ["cancelado", "enviado"].includes(p.estado)
    ? `<button type="button" class="tienda-pedido-borrar" data-id="${p.id}" data-nombre="${escapeHtml(p.producto_nombre)}">Borrar del historial</button>`
    : "";

  return `
    <div class="tienda-pedido-item" data-id="${p.id}">
      <div class="tienda-pedido-info">
        <span class="tienda-pedido-nombre">${escapeHtml(p.producto_nombre)}</span>
        <span class="tienda-pedido-meta">${metaTexto}</span>
        ${referenciaHTML}
        ${tiendaPintarTimeline(p.estado)}
        <div class="tienda-pedido-acciones-fila">${cancelarHTML}${borrarHTML}</div>
      </div>
      <div class="tienda-pedido-derecha">
        <span class="tienda-pedido-precio">${tiendaFormatPrecio(p.precio_centimos)}</span>
      </div>
    </div>`;
}

document.getElementById("tiendaMisPedidosLista")?.addEventListener("click", async (ev) => {
  const btnCancelar = ev.target.closest(".tienda-pedido-cancelar");
  if (btnCancelar) {
    if (!(await EOF.confirmar("¿Seguro que quieres cancelar este pedido?", { peligroso: true, textoConfirmar: "Cancelar pedido" }))) return;
    const id = btnCancelar.dataset.id;
    btnCancelar.disabled = true;
    btnCancelar.textContent = "Cancelando...";
    try {
      await apiFetch(`/api/tienda/mis-pedidos/${id}/cancelar`, { method: "PUT" });
      EOF.toast("Pedido cancelado.", "exito");
      cargaTiendaMisPedidos();
    } catch (err) {
      EOF.toast("Error: " + (err.message || "no se ha podido cancelar"), "error");
      btnCancelar.disabled = false;
      btnCancelar.textContent = "Cancelar pedido";
    }
    return;
  }

  const btnBorrar = ev.target.closest(".tienda-pedido-borrar");
  if (btnBorrar) {
    const nombre = btnBorrar.dataset.nombre;
    if (!(await EOF.confirmar(`¿Seguro que quieres borrar tu pedido "${nombre}" del historial? Esta acción no se puede deshacer.`, { peligroso: true, textoConfirmar: "Borrar" }))) return;
    const id = btnBorrar.dataset.id;
    btnBorrar.disabled = true;
    btnBorrar.textContent = "Borrando...";
    try {
      await apiFetch(`/api/tienda/mis-pedidos/${id}`, { method: "DELETE" });
      EOF.toast("Pedido borrado del historial.", "exito");
      cargaTiendaMisPedidos();
    } catch (err) {
      EOF.toast("Error: " + (err.message || "no se ha podido borrar"), "error");
      btnBorrar.disabled = false;
      btnBorrar.textContent = "Borrar del historial";
    }
  }
});

// ---------- Vista de gestión (comparte estructura con "Mis pedidos" pero con más datos y acciones) ----------
function pintarPedidoTiendaGestionHTML(p) {
  const fecha = formatFecha(p.created_at) || p.created_at;
  const metaTexto = [p.variante ? `Talla ${escapeHtml(p.variante)}` : "", fecha].filter(Boolean).join(" · ");
  const referenciaHTML = p.referencia_pago
    ? `<p class="tienda-pedido-referencia">Referencia: <strong>${escapeHtml(p.referencia_pago)}</strong></p>`
    : "";
  const redactorHTML = `<p class="tienda-pedido-meta">${escapeHtml(p.redactor_nombre || "")}${p.redactor_email ? " · " + escapeHtml(p.redactor_email) : ""}</p>`;
  const selectHTML = `<select class="tienda-pedido-select" data-id="${p.id}">
        ${Object.entries(TIENDA_ETIQUETAS_ESTADO).map(([valor, etiqueta]) => `<option value="${valor}" ${valor === p.estado ? "selected" : ""}>${etiqueta}</option>`).join("")}
      </select>`;
  const borrarHTML = `<button type="button" class="tienda-pedido-borrar" data-id="${p.id}" data-nombre="${escapeHtml(p.producto_nombre)}" title="Borrar este pedido">Borrar</button>`;

  return `
    <div class="tienda-pedido-item" data-id="${p.id}">
      <div class="tienda-pedido-info">
        <span class="tienda-pedido-nombre">${escapeHtml(p.producto_nombre)}</span>
        <span class="tienda-pedido-meta">${metaTexto}</span>
        ${redactorHTML}
        ${referenciaHTML}
        <textarea class="tienda-pedido-nota" data-id="${p.id}" placeholder="Nota interna (opcional)...">${escapeHtml(p.nota_gestion || "")}</textarea>
        <span class="tienda-pedido-nota-guardado" data-guardado-id="${p.id}">Guardado</span>
      </div>
      <div class="tienda-pedido-derecha">
        <span class="tienda-pedido-precio">${tiendaFormatPrecio(p.precio_centimos)}</span>
        ${selectHTML}
        ${borrarHTML}
      </div>
    </div>`;
}

// ---------- Gestión de pedidos (admin / gestor de tienda) ----------
async function cargaTiendaGestion() {
  const cont = document.getElementById("tiendaGestionLista");
  if (!cont) return;
  cont.innerHTML = "<p class='solicitudes-vacio'>Cargando...</p>";
  try {
    const query = TIENDA_FILTRO_ESTADO_GESTION ? `?estado=${encodeURIComponent(TIENDA_FILTRO_ESTADO_GESTION)}` : "";
    const { pedidos = [] } = await apiFetch(`/api/tienda/pedidos${query}`);
    TIENDA_GESTION_LISTA = pedidos;
    pintarTiendaGestionContadores(pedidos);
    pintarTiendaGestionFiltrada();
    actualizarBadgeTiendaGestionPendientes(pedidos.filter((p) => p.estado === "pendiente_pago").length);
  } catch (err) {
    cont.innerHTML = `<p class='solicitudes-vacio'>Error cargando los pedidos: ${err.message}</p>`;
  }
}

// Resumen rápido con el número de pedidos en cada estado, calculado
// sobre el filtro de estado actual (si hay uno) para que cuadre con
// lo que se ve debajo.
function pintarTiendaGestionContadores(pedidos) {
  const cont = document.getElementById("tiendaGestionContadores");
  if (!cont) return;
  const conteos = { pendiente_pago: 0, pagado: 0, enviado: 0, cancelado: 0 };
  pedidos.forEach((p) => { if (conteos[p.estado] !== undefined) conteos[p.estado]++; });
  cont.innerHTML = `
    <div class="tienda-gestion-contador"><strong>${pedidos.length}</strong><span>Total</span></div>
    <div class="tienda-gestion-contador"><strong>${conteos.pendiente_pago}</strong><span>Pend. pago</span></div>
    <div class="tienda-gestion-contador"><strong>${conteos.pagado}</strong><span>Pagados</span></div>
    <div class="tienda-gestion-contador"><strong>${conteos.enviado}</strong><span>Enviados</span></div>
  `;
}

// Repinta la lista de gestión aplicando el buscador de texto (por
// nombre de redactor, email o producto) sobre TIENDA_GESTION_LISTA,
// sin volver a pedir nada a la API.
function pintarTiendaGestionFiltrada() {
  const cont = document.getElementById("tiendaGestionLista");
  if (!cont) return;
  const texto = normalizarBusquedaPanel(TIENDA_GESTION_BUSQUEDA);
  const pedidos = texto
    ? TIENDA_GESTION_LISTA.filter((p) =>
        normalizarBusquedaPanel(p.redactor_nombre || "").includes(texto) ||
        normalizarBusquedaPanel(p.redactor_email || "").includes(texto) ||
        normalizarBusquedaPanel(p.producto_nombre || "").includes(texto))
    : TIENDA_GESTION_LISTA;

  if (!pedidos.length) {
    cont.innerHTML = texto
      ? "<p class='tienda-vacio-busqueda'>Ningún pedido coincide con tu búsqueda.</p>"
      : "<p class='solicitudes-vacio'>No hay pedidos con este filtro.</p>";
  } else {
    cont.innerHTML = pedidos.map(pintarPedidoTiendaGestionHTML).join("");
  }
}

document.getElementById("tiendaGestionBuscador")?.addEventListener("input", (ev) => {
  TIENDA_GESTION_BUSQUEDA = ev.target.value;
  pintarTiendaGestionFiltrada();
});

document.getElementById("tiendaGestionFiltros")?.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button[data-estado]");
  if (!btn) return;
  document.querySelectorAll("#tiendaGestionFiltros button").forEach((b) => b.classList.remove("activo"));
  btn.classList.add("activo");
  TIENDA_FILTRO_ESTADO_GESTION = btn.dataset.estado;
  cargaTiendaGestion();
});

document.getElementById("tiendaGestionLista")?.addEventListener("change", async (ev) => {
  const select = ev.target.closest(".tienda-pedido-select");
  if (!select) return;
  const id = select.dataset.id;
  const nuevoEstado = select.value;
  select.disabled = true;
  try {
    await apiFetch(`/api/tienda/pedidos/${id}`, { method: "PUT", body: JSON.stringify({ estado: nuevoEstado }) });
    EOF.toast("Pedido actualizado.", "exito");
    cargaTiendaGestion();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
    select.disabled = false;
  }
});

document.getElementById("tiendaGestionLista")?.addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".tienda-pedido-borrar");
  if (!btn) return;
  const nombre = btn.dataset.nombre;
  if (!(await EOF.confirmar(`¿Seguro que quieres borrar el pedido "${nombre}"? Esta acción no se puede deshacer.`, { peligroso: true, textoConfirmar: "Borrar" }))) return;
  const id = btn.dataset.id;
  btn.disabled = true;
  btn.textContent = "Borrando...";
  try {
    await apiFetch(`/api/tienda/pedidos/${id}`, { method: "DELETE" });
    EOF.toast("Pedido borrado.", "exito");
    cargaTiendaGestion();
  } catch (err) {
    EOF.toast("Error: " + err.message, "error");
    btn.disabled = false;
    btn.textContent = "Borrar";
  }
});

// Guarda la nota interna al dejar de escribir (blur), sin bloquear la
// edición del resto de la lista mientras se guarda.
document.getElementById("tiendaGestionLista")?.addEventListener("focusout", async (ev) => {
  const textarea = ev.target.closest(".tienda-pedido-nota");
  if (!textarea) return;
  const id = textarea.dataset.id;
  const pedidoOriginal = TIENDA_GESTION_LISTA.find((p) => String(p.id) === String(id));
  const notaActual = textarea.value.trim();
  if (pedidoOriginal && (pedidoOriginal.nota_gestion || "") === notaActual) return; // sin cambios
  try {
    await apiFetch(`/api/tienda/pedidos/${id}`, {
      method: "PUT",
      body: JSON.stringify({ estado: pedidoOriginal.estado, nota_gestion: notaActual }),
    });
    if (pedidoOriginal) pedidoOriginal.nota_gestion = notaActual;
    const aviso = document.querySelector(`.tienda-pedido-nota-guardado[data-guardado-id="${id}"]`);
    if (aviso) {
      aviso.classList.add("visible");
      setTimeout(() => aviso.classList.remove("visible"), 1500);
    }
  } catch (err) {
    EOF.toast("No se ha podido guardar la nota: " + err.message, "error");
  }
});

// ---------- Gestión de productos del catálogo (admin / gestor de tienda) ----------
let TIENDA_PRODUCTOS_GESTION_CACHE = {};
let TIENDA_PRODUCTOS_GESTION_LISTA = [];
let TIENDA_PRODUCTOS_BUSQUEDA = "";
let TIENDA_PRODUCTO_EDITANDO_ID = null; // null = se está creando uno nuevo

async function cargaTiendaProductosGestion() {
  const cont = document.getElementById("tiendaProductosLista");
  if (!cont) return;
  cont.innerHTML = "<p class='solicitudes-vacio'>Cargando...</p>";
  try {
    const { productos = [] } = await apiFetch(`/api/tienda/productos/todos`);
    TIENDA_PRODUCTOS_GESTION_CACHE = {};
    productos.forEach((p) => { TIENDA_PRODUCTOS_GESTION_CACHE[p.id] = p; });
    TIENDA_PRODUCTOS_GESTION_LISTA = productos;
    pintarTiendaProductosContadores(productos);
    pintarTiendaProductosFiltrados();
  } catch (err) {
    cont.innerHTML = `<p class='solicitudes-vacio'>Error cargando los productos: ${err.message}</p>`;
  }
}

// Resumen rápido: total, visibles y ocultos, igual que el bloque de
// contadores ya usado en "Gestión de pedidos".
function pintarTiendaProductosContadores(productos) {
  const cont = document.getElementById("tiendaProductosContadores");
  if (!cont) return;
  const visibles = productos.filter((p) => p.activo).length;
  cont.innerHTML = `
    <div class="tienda-gestion-contador"><strong>${productos.length}</strong><span>Total</span></div>
    <div class="tienda-gestion-contador"><strong>${visibles}</strong><span>Visibles</span></div>
    <div class="tienda-gestion-contador"><strong>${productos.length - visibles}</strong><span>Ocultos</span></div>
  `;
}

// Repinta la lista de productos aplicando el buscador de texto (nombre
// o descripción) sobre TIENDA_PRODUCTOS_GESTION_LISTA, sin volver a
// pedir nada a la API.
function pintarTiendaProductosFiltrados() {
  const cont = document.getElementById("tiendaProductosLista");
  if (!cont) return;
  const texto = normalizarBusquedaPanel(TIENDA_PRODUCTOS_BUSQUEDA);
  const productos = texto
    ? TIENDA_PRODUCTOS_GESTION_LISTA.filter((p) =>
        normalizarBusquedaPanel(p.nombre || "").includes(texto) || normalizarBusquedaPanel(p.descripcion || "").includes(texto))
    : TIENDA_PRODUCTOS_GESTION_LISTA;

  if (!TIENDA_PRODUCTOS_GESTION_LISTA.length) {
    cont.innerHTML = "<p class='solicitudes-vacio'>Todavía no hay productos en el catálogo.</p>";
  } else if (!productos.length) {
    cont.innerHTML = "<p class='tienda-vacio-busqueda'>Ningún producto coincide con tu búsqueda.</p>";
  } else {
    cont.innerHTML = `<div class="tienda-productos-lista">${productos.map(pintarFilaTiendaProducto).join("")}</div>`;
  }
}

document.getElementById("tiendaProductosBuscador")?.addEventListener("input", (ev) => {
  TIENDA_PRODUCTOS_BUSQUEDA = ev.target.value;
  pintarTiendaProductosFiltrados();
});

// Contador de pedidos por producto: se calcula sobre lo que ya haya en
// caché de "Gestión de pedidos" si esa pestaña se ha cargado alguna vez
// en esta sesión (evita otra llamada a la API solo para un dato
// informativo). Si no hay nada cargado, sencillamente no se muestra.
function tiendaContarPedidosProducto(nombreProducto) {
  if (!Array.isArray(TIENDA_GESTION_LISTA) || !TIENDA_GESTION_LISTA.length) return null;
  return TIENDA_GESTION_LISTA.filter((p) => p.producto_nombre === nombreProducto).length;
}

function pintarFilaTiendaProducto(p) {
  const imagenHTML = p.imagen_url
    ? `<div class="tienda-producto-fila-imagen" style="background-image:url('${escapeHtml(p.imagen_url)}')"></div>`
    : `<div class="tienda-producto-fila-imagen">${tiendaIconoProducto()}</div>`;
  const variantesTexto = Array.isArray(p.variantes) && p.variantes.length ? p.variantes.join(", ") : "Talla única";
  const numPedidos = tiendaContarPedidosProducto(p.nombre);
  const pedidosHTML = numPedidos !== null
    ? `<span class="tienda-producto-fila-pedidos">${numPedidos} pedido${numPedidos === 1 ? "" : "s"}</span>`
    : "";
  return `
    <div class="tienda-producto-fila ${p.activo ? "" : "inactivo"}" data-id="${p.id}">
      ${imagenHTML}
      <div class="tienda-producto-fila-info">
        <div class="tienda-producto-fila-titulo">
          <span class="tienda-producto-fila-nombre">${escapeHtml(p.nombre)}</span>
          <span class="tienda-producto-fila-estado ${p.activo ? "activo" : "oculto"}">${p.activo ? "Visible" : "Oculto"}</span>
        </div>
        ${p.descripcion ? `<span class="tienda-producto-fila-descripcion">${escapeHtml(p.descripcion)}</span>` : ""}
        <span class="tienda-producto-fila-meta">
          <strong>${tiendaFormatPrecio(p.precio_centimos)}</strong> · ${escapeHtml(variantesTexto)}${pedidosHTML ? " · " + pedidosHTML : ""}
        </span>
      </div>
      <div class="tienda-producto-fila-acciones">
        <label class="tienda-producto-switch" title="${p.activo ? "Visible en el catálogo" : "Oculto del catálogo"}">
          <input type="checkbox" class="tienda-producto-switch-input" data-id="${p.id}" ${p.activo ? "checked" : ""}>
          <span></span>
        </label>
        <button type="button" class="tienda-producto-editar" data-id="${p.id}">Editar</button>
      </div>
    </div>`;
}

document.getElementById("tiendaProductosLista")?.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".tienda-producto-editar");
  if (!btn) return;
  abrirModalTiendaProducto(Number(btn.dataset.id));
});

document.getElementById("tiendaProductosLista")?.addEventListener("change", async (ev) => {
  const switchInput = ev.target.closest(".tienda-producto-switch-input");
  if (!switchInput) return;
  const id = switchInput.dataset.id;
  switchInput.disabled = true;
  try {
    await apiFetch(`/api/tienda/productos/${id}`, { method: "PUT", body: JSON.stringify({ activo: switchInput.checked }) });
    if (TIENDA_PRODUCTOS_GESTION_CACHE[id]) TIENDA_PRODUCTOS_GESTION_CACHE[id].activo = switchInput.checked ? 1 : 0;
    const enLista = TIENDA_PRODUCTOS_GESTION_LISTA.find((p) => String(p.id) === String(id));
    if (enLista) enLista.activo = switchInput.checked ? 1 : 0;
    pintarTiendaProductosContadores(TIENDA_PRODUCTOS_GESTION_LISTA);
    pintarTiendaProductosFiltrados();
    EOF.toast(switchInput.checked ? "Producto activado." : "Producto desactivado.", "exito");
  } catch (err) {
    switchInput.checked = !switchInput.checked;
    EOF.toast("Error: " + err.message, "error");
  } finally {
    switchInput.disabled = false;
  }
});

// Abre el modal en modo creación (sin id) o edición (con id, precarga
// los datos del producto desde la caché ya cargada).
function abrirModalTiendaProducto(productoId) {
  TIENDA_PRODUCTO_EDITANDO_ID = productoId || null;
  const producto = productoId ? TIENDA_PRODUCTOS_GESTION_CACHE[productoId] : null;

  document.getElementById("tpTitulo").textContent = producto ? "Editar producto" : "Nuevo producto";
  document.getElementById("tpNombre").value = producto?.nombre || "";
  document.getElementById("tpDescripcion").value = producto?.descripcion || "";
  document.getElementById("tpPrecio").value = producto ? (producto.precio_centimos / 100).toFixed(2) : "";
  document.getElementById("tpImagen").value = producto?.imagen_url || "";
  document.getElementById("tpVariantes").value = Array.isArray(producto?.variantes) ? producto.variantes.join(", ") : "";
  document.getElementById("tpOrden").value = producto ? String(producto.orden || 0) : "0";
  document.getElementById("tpActivo").checked = producto ? !!producto.activo : true;
  document.getElementById("tpError").style.display = "none";
  document.getElementById("tpGuardar").disabled = false;
  document.getElementById("tpGuardar").textContent = "Guardar producto";
  document.getElementById("modalTiendaProducto").classList.add("abierto");
}

function cerrarModalTiendaProducto() {
  document.getElementById("modalTiendaProducto").classList.remove("abierto");
  TIENDA_PRODUCTO_EDITANDO_ID = null;
}

async function guardarTiendaProducto() {
  const errEl = document.getElementById("tpError");
  errEl.style.display = "none";
  const btn = document.getElementById("tpGuardar");

  const nombre = document.getElementById("tpNombre").value.trim();
  if (!nombre) {
    errEl.textContent = "Ponle un nombre al producto.";
    errEl.style.display = "block";
    return;
  }
  const precioEuros = parseFloat(document.getElementById("tpPrecio").value);
  if (!precioEuros || precioEuros <= 0) {
    errEl.textContent = "Indica un precio válido, mayor que 0.";
    errEl.style.display = "block";
    return;
  }
  const variantes = document.getElementById("tpVariantes").value
    .split(",").map((v) => v.trim()).filter(Boolean);

  const body = {
    nombre,
    descripcion: document.getElementById("tpDescripcion").value.trim(),
    precio_centimos: Math.round(precioEuros * 100),
    imagen_url: document.getElementById("tpImagen").value.trim(),
    variantes,
    orden: parseInt(document.getElementById("tpOrden").value, 10) || 0,
    activo: document.getElementById("tpActivo").checked,
  };

  btn.disabled = true;
  btn.textContent = "Guardando...";
  try {
    if (TIENDA_PRODUCTO_EDITANDO_ID) {
      await apiFetch(`/api/tienda/productos/${TIENDA_PRODUCTO_EDITANDO_ID}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      await apiFetch(`/api/tienda/productos`, { method: "POST", body: JSON.stringify(body) });
    }
    EOF.toast("Producto guardado.", "exito");
    cerrarModalTiendaProducto();
    cargaTiendaProductosGestion();
  } catch (err) {
    errEl.textContent = err.message || "No se ha podido guardar el producto.";
    errEl.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar producto";
  }
}
async function actualizarBadgeTiendaGestionPendientes(numeroConocido) {
  const badgeTab = document.getElementById("badgeTiendaPendientes");
  const badgeSubtab = document.getElementById("badgeTiendaGestionPendientes");
  if (!TIENDA_PUEDE_GESTIONAR || (!badgeTab && !badgeSubtab)) return;
  let numero = numeroConocido;
  if (typeof numero !== "number") {
    try {
      const { pedidos = [] } = await apiFetch(`/api/tienda/pedidos?estado=pendiente_pago`);
      numero = pedidos.length;
    } catch {
      return;
    }
  }
  [badgeTab, badgeSubtab].forEach((badge) => {
    if (!badge) return;
    if (numero > 0) {
      badge.textContent = String(numero);
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }
  });
}
