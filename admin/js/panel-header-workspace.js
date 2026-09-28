// ---------------------------------------------------------------------
// CABECERA COMPARTIDA CON EL PANEL DE ADMINISTRACIÓN (versión workspace)
// ---------------------------------------------------------------------
// Copia adaptada de public/js/panel-header.js para que la cabecera de
// public/admin/workspace.html (bloque .admin-header) sea ID por ID igual
// que la de public/admin/panel.html y se comporte exactamente igual:
// sesión, avatar, tema, notificaciones y menú de cuenta. No se reutiliza
// el mismo archivo tal cual porque panel-header.js fuerza el logout/
// redirección a admin/login.html y admin/panel.html con rutas relativas
// pensadas para vivir en la raíz del sitio (public/panel-analiticas.html),
// mientras que workspace.html ya vive dentro de /admin/, y aquí el
// workspace es la página principal (no hay "volver al panel" al que
// mandar a alguien que no sea admin). Si se cambia algo de la cabecera
// en un sitio, hay que replicarlo en los otros dos.
//
// Requiere que la página haya cargado antes, en este orden:
//   js/config.js     (apiFetch de failover, escapeHtml)
//   js/ui-alertas.js (window.EOF.toast/confirmar/alertaModal)
// y que el HTML tenga los mismos ids que public/admin/panel.html.

// ---------- Auth guard ----------
// El guard "de verdad" (sin sesión -> login.html) ya lo hace el propio
// workspace.html antes de pintar nada; aquí solo se lee lo que ya se
// sabe que existe.
// TOKEN_ACTUAL() en vez de una constante congelada al cargar el script:
// si admin.js renueva el token en localStorage (p.ej. al guardar "Mis
// datos") esta cabecera, cargada aparte, seguía mandando el token viejo
// y acababa recibiendo 401 en cascada. Ver misma corrección en admin.js.
function TOKEN_ACTUAL() {
  return localStorage.getItem("eof_token");
}
const USER = JSON.parse(localStorage.getItem("eof_user") || "null");
// USER se expone también en window (además de como variable local) para
// que otros scripts cargados después, como el bloque de arranque de
// workspace.html, puedan decidir la sección inicial según el rol sin
// tener que volver a leer y parsear localStorage.
window.USER = USER;
const NOTIF_CLAVE = `eof_notif_visto_${USER ? USER.username : ""}`;
let ultimaVisitaNotifServidor = null;

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN_ACTUAL()}` };
}

// Misma apiFetch() de admin.js: usa el motor de failover de config.js
// (window.eofApiFetch) añadiendo la cabecera de autenticación, y cierra
// la sesión sola si el token ha caducado (401).
async function apiFetch(path, options = {}) {
  const res = await window.eofApiFetch(path, { ...options, headers: authHeaders() });
  if (res.status === 401) {
    logout();
    return {};
  }
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Error");
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

function logout() {
  localStorage.removeItem("eof_token");
  localStorage.removeItem("eof_user");
  location.href = "login.html";
}

// Iniciales para el círculo de avatar, p. ej. "Ana Pérez" -> "AP".
function iniciales(nombre) {
  return (nombre || "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

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
  document.getElementById("userNombre").textContent = USER.nombre;
  document.getElementById("cuentaNombreCompleto").textContent = USER.nombre;
  document.getElementById("cuentaRolEtiqueta").textContent =
    USER.rol === "admin" ? "Administrador" : (USER.rol === "fotografo" ? "Fotógrafo" : "Redactor");

  // El enlace "Analíticas" del menú de cuenta, igual que en panel.html,
  // solo tiene sentido para administradores.
  const enlaceAnaliticas = document.getElementById("enlaceAnaliticas");
  if (enlaceAnaliticas && USER.rol !== "admin") {
    enlaceAnaliticas.style.display = "none";
  }

  // ---------- Cierre de sesión por inactividad (15 minutos) ----------
  const INACTIVIDAD_LIMITE_MS = 15 * 60 * 1000;
  let temporizadorInactividad;
  function reiniciarTemporizadorInactividad() {
    clearTimeout(temporizadorInactividad);
    temporizadorInactividad = setTimeout(() => {
      window.EOF?.alertaModal?.("Se ha cerrado la sesión por inactividad.", { tipo: "info" }).then(logout);
    }, INACTIVIDAD_LIMITE_MS);
  }
  ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"].forEach((evento) => {
    document.addEventListener(evento, reiniciarTemporizadorInactividad, { passive: true });
  });
  reiniciarTemporizadorInactividad();

  // ---------- Notificaciones ----------
  inicializarNotificaciones();

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

// Los "Ajustes de cuenta" viven como pestaña dentro del propio panel
// (panel.html?ajustes=perfil|password|progreso|sesiones), así que aquí
// se abren como una pestaña más del workspace en vez de navegar fuera:
// window.abrirPestanaAjustes la define workspace.html (ver ese archivo),
// que sabe pasar la subsección concreta al iframe de panel.html.
function irAAjustesCuenta(seccion) {
  document.getElementById("cuentaMenu")?.classList.remove("abierto");
  if (typeof window.abrirPestanaAjustes === "function") {
    window.abrirPestanaAjustes(seccion);
  } else {
    location.href = `panel.html?ajustes=${encodeURIComponent(seccion)}`;
  }
}

// ---------- Notificaciones (contenido subido / crónicas publicadas) ----------
function ultimaVisitaNotif() {
  return ultimaVisitaNotifServidor || localStorage.getItem(NOTIF_CLAVE) || "1970-01-01T00:00:00";
}

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

async function cargarNotificaciones() {
  const lista = document.getElementById("notifLista");
  const contador = document.getElementById("notifContador");
  if (!lista) return;
  try {
    const [{ media = [] }, { articles = [] }, { results: resultadosPendientes = [] }] = await Promise.all([
      apiFetch(`/api/media`),
      apiFetch(`/api/articles?admin=1&limit=15`),
      apiFetch(`/api/results?limit=200`),
    ]);

    const TIPO_LABEL = { noticia: "Noticia", previa: "Previa", cronica: "Crónica", analisis: "Análisis", opinion: "Opinión", entrevista: "Entrevista" };

    const hoyStr = new Date().toISOString().slice(0, 10);
    const partidosSinActualizar = resultadosPendientes
      .filter((r) => r.estado === "programado" && r.fecha_partido && r.fecha_partido < hoyStr)
      .map((r) => {
        const fechaAviso = new Date(r.fecha_partido + "T00:00:00Z");
        fechaAviso.setUTCDate(fechaAviso.getUTCDate() + 1);
        return {
          tipo: "Resultado pendiente",
          titulo: `${r.equipo_local} - ${r.equipo_visitante}: necesita actualización`,
          autor: "",
          fecha: fechaAviso.toISOString().slice(0, 19).replace("T", " "),
        };
      });

    const novedades = [
      ...media.map((m) => ({ tipo: "Contenido", titulo: m.titulo, autor: m.autor_nombre, fecha: m.created_at })),
      ...articles.map((a) => ({ tipo: TIPO_LABEL[a.tipo] || "Artículo", titulo: a.titulo, autor: a.autor_nombre, fecha: a.created_at, slug: a.slug, categoria: a.categoria, publicado: a.publicado })),
      ...partidosSinActualizar,
    ]
      .filter((n) => n.fecha)
      .sort((a, b) => new Date(b.fecha.replace(" ", "T")) - new Date(a.fecha.replace(" ", "T")))
      .slice(0, 20);

    const vistoStr = ultimaVisitaNotif();
    const visto = new Date(vistoStr.includes("Z") ? vistoStr : vistoStr.replace(" ", "T") + "Z").getTime();
    const esNoLeida = (n) => new Date(n.fecha.replace(" ", "T") + "Z").getTime() > visto;
    const noLeidas = novedades.filter(esNoLeida).length;

    if (contador) {
      contador.textContent = noLeidas > 9 ? "9+" : String(noLeidas);
      contador.style.display = noLeidas > 0 ? "flex" : "none";
    }

    lista.innerHTML = novedades.length
      ? novedades.map((n) => `
        <a href="javascript:void(0)" class="notif-item ${esNoLeida(n) ? "no-leida" : ""}" onclick='irANotificacionDesdeWorkspace(${escapeHtml(JSON.stringify(n)).replace(/'/g, "&#39;")})'>
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
  const d = new Date(fechaStr.replace(" ", "T") + "Z");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}

// Al pulsar una notificación desde el workspace: si es una noticia ya
// publicada se abre la web en una pestaña nueva del navegador (no tiene
// sentido como pestaña de workspace); si no, se abre/activa la pestaña
// de "Ver noticias" del propio workspace para que la persona la encuentre.
function irANotificacionDesdeWorkspace(n) {
  document.getElementById("notifWrap").classList.remove("abierto");
  if (n.slug && n.publicado) {
    window.open(urlNoticia(n.categoria, n.slug), "_blank");
    return;
  }
  if (typeof window.abrirPestanaPorId === "function") {
    window.abrirPestanaPorId("noticias.lista");
  }
}

function marcarNotificacionesVistas() {
  const ahora = new Date().toISOString();
  ultimaVisitaNotifServidor = ahora;
  localStorage.setItem(NOTIF_CLAVE, ahora);
  apiFetch(`/api/me/notif-visto`, { method: "PUT" }).catch(() => {});
  const contador = document.getElementById("notifContador");
  if (contador) contador.style.display = "none";
  document.querySelectorAll("#notifLista .notif-item.no-leida").forEach((el) => el.classList.remove("no-leida"));
}

// ---------- Modo oscuro (misma lógica que admin.js) ----------
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
