// ---------------------------------------------------------------------
// CABECERA COMPARTIDA CON EL PANEL DE ADMINISTRACIÓN
// ---------------------------------------------------------------------
// El HTML de esta cabecera (public/panel-analiticas.html, bloque
// .admin-header) es una copia literal del de public/admin/panel.html,
// y este archivo es la parte de public/admin/js/admin.js que la hace
// funcionar (sesión, avatar, tema, notificaciones y menú de cuenta),
// extraída aparte para no tener que cargar aquí las más de 7000 líneas
// del resto de admin.js (formularios de noticias/resultados, etc. que
// no existen en esta página). Si se cambia algo de la cabecera en un
// sitio, hay que replicarlo en el otro: son el mismo componente en dos
// páginas, no un componente compartido de verdad (el proyecto no tiene
// un sistema de includes), así que conviene revisarlos juntos.
//
// Requiere que la página haya cargado antes, en este orden:
//   js/config.js   (apiFetch de failover, escapeHtml)
//   js/ui-alertas.js (window.EOF.toast/confirmar/alertaModal)
// y que el HTML tenga los mismos ids que public/admin/panel.html.

// ---------- Auth guard ----------
// Misma sesión que el resto del panel: el token/usuario se guardan en
// localStorage bajo el mismo dominio, así que ya están disponibles aquí
// aunque esta página viva fuera de public/admin/.
const TOKEN = localStorage.getItem("eof_token");
const USER = JSON.parse(localStorage.getItem("eof_user") || "null");
const NOTIF_CLAVE = `eof_notif_visto_${USER ? USER.username : ""}`;
let ultimaVisitaNotifServidor = null;

if (!TOKEN || !USER) {
  location.href = "admin/login.html";
}

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
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
  location.href = "admin/login.html";
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
  document.getElementById("cuentaRolEtiqueta").textContent = USER.rol === "admin" ? "Administrador" : "Redactor";

  // El panel de analíticas solo admite administradores en el Worker
  // (ver /api/admin/analiticas/*), así que un redactor ni debería haber
  // llegado hasta aquí (el enlace ya se le oculta en admin/panel.html),
  // pero por si acaso entra con la URL directa se le devuelve al panel.
  if (USER.rol !== "admin") {
    location.href = "admin/panel.html";
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

function irAAjustesCuenta(seccion) {
  // Los "Ajustes de cuenta" viven como pestaña del panel de redacción,
  // no de esta página; se manda allí con el destino en la URL para que
  // admin.js pueda abrir directamente la subpestaña correspondiente.
  location.href = `admin/panel.html?ajustes=${encodeURIComponent(seccion)}`;
}

// ---------- Notificaciones (contenido subido / crónicas publicadas) ----------
// Misma lógica que admin.js: se guarda tanto en localStorage (para
// pintar algo al instante) como en el servidor (para que sobreviva a
// perder la sesión o borrar datos del navegador); el servidor manda.
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
        <a href="javascript:void(0)" class="notif-item ${esNoLeida(n) ? "no-leida" : ""}" onclick='irANotificacionDesdeAnaliticas(${escapeHtml(JSON.stringify(n)).replace(/'/g, "&#39;")})'>
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

// Esta página no tiene las pestañas del panel de redacción, así que
// pulsar una notificación siempre lleva allí (con la noticia publicada
// abierta directamente si aplica), en vez de intentar activar una
// pestaña que no existe aquí.
function irANotificacionDesdeAnaliticas(n) {
  document.getElementById("notifWrap").classList.remove("abierto");
  if (n.slug && n.publicado) {
    window.open(urlNoticia(n.categoria, n.slug), "_blank");
    return;
  }
  location.href = "admin/panel.html";
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
