const NAV_ITEMS = [
  { key: "inicio", label: "Portada", href: "index.html" },
  { key: "hypermotion", label: "LaLiga Hypermotion", href: "categoria.html?cat=hypermotion" },
  { key: "primera_federacion", label: "Primera Federación", href: "categoria.html?cat=primera_federacion" },
  { key: "segunda_federacion", label: "Segunda Federación", href: "categoria.html?cat=segunda_federacion" },
  { key: "arbitraje", label: "Arbitraje", href: "categoria.html?cat=arbitraje" },
  { key: "jurisdiccion", label: "Jurisdicción deportiva", href: "categoria.html?cat=jurisdiccion" },
  { key: "calendario", label: "Calendario", href: "calendario.html" },
  { key: "clasificacion", label: "Clasificación", href: "clasificacion.html" },
  { key: "predicciones", label: "Porras", href: "predicciones.html" },
];

const ICONOS_REDES = {
  twitter: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.3"/><circle cx="17.35" cy="6.65" r="1.05" fill="currentColor" stroke="none"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16.5 2h-3.2v13.6a3 3 0 1 1-2.4-2.94V9.3a6.2 6.2 0 1 0 5.6 6.17V8.9a7.6 7.6 0 0 0 4.6 1.55V7.2A4.4 4.4 0 0 1 16.5 2z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" fill-rule="evenodd" d="M23 12s0-3.4-.44-4.9a2.9 2.9 0 0 0-2-2C18.9 4.6 12 4.6 12 4.6s-6.9 0-8.56.5a2.9 2.9 0 0 0-2 2C1 8.6 1 12 1 12s0 3.4.44 4.9a2.9 2.9 0 0 0 2 2c1.66.5 8.56.5 8.56.5s6.9 0 8.56-.5a2.9 2.9 0 0 0 2-2C23 15.4 23 12 23 12zM9.8 15.6V8.4l6.4 3.6z"/></svg>',
};

const NOMBRES_REDES = { twitter: "X (Twitter)", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };

function baseHref() {
  // Todas las páginas del sitio viven bajo la raíz del dominio (nunca
  // hay subcarpetas reales como public/categoria/ dentro de las que se
  // navegue), EXCEPTO admin/, que sí es una carpeta real. Antes esto
  // devolvía siempre "" (ruta relativa), asumiendo que layout.js solo
  // se cargaba desde páginas en la raíz -- pero eso rompe el header/
  // pie en cualquier situación donde la URL del navegador no sea la
  // raíz aunque el contenido servido sí lo sea: el caso más claro es
  // la página de error 404 (Cloudflare Pages sirve 404.html pero deja
  // la URL tal cual, así que un enlace inventado dentro de admin/, p.
  // ej. admin/lo-que-sea, servía el 404 con las rutas relativas del
  // header resolviéndose contra admin/, un 404 dentro de un 404).
  // Con "/" siempre, los enlaces y el logo apuntan a la raíz del sitio
  // sin importar desde qué URL se haya cargado esta página.
  return "/";
}

function clubSubmenuHTML(cat, clubes) {
  const items = clubes
    .map((club) => `<li><a href="${baseHref()}categoria.html?cat=${encodeURIComponent(cat)}&club=${encodeURIComponent(club)}">${club}</a></li>`)
    .join("");
  return `<ul class="submenu">${items}</ul>`;
}

function iconosRedesHTML() {
  return Object.entries(SITE.redes)
    .map(([key, url]) => `<a href="${url}" target="_blank" rel="noopener" title="${NOMBRES_REDES[key] || key}">${ICONOS_REDES[key] || ""}</a>`)
    .join("");
}

// Vuelve a pintar los iconos de redes sociales allá donde aparezcan
// (cabecera, pie y, si existe, la portada) usando el SITE.redes actual.
function refrescarIconosRedes() {
  document.querySelectorAll(".redes-mini, .redes-footer").forEach((el) => {
    el.innerHTML = iconosRedesHTML();
  });
  const redesPortada = document.getElementById("redes-icons-portada");
  if (redesPortada) redesPortada.innerHTML = iconosRedesHTML();
}

// Las redes sociales se gestionan desde un único sitio: el panel de
// administración (pestaña "Redes sociales"), guardadas en el servidor.
// Aquí las cargamos y sustituimos el valor de reserva de config.js por
// el real, sin recargar el resto de la cabecera/pie para evitar parpadeos.
async function cargarRedesSociales() {
  try {
    const res = await apiFetch(`/api/settings`);
    if (!res.ok) return;
    const { redes } = await res.json();
    if (redes && Object.keys(redes).length) {
      SITE.redes = redes;
      refrescarIconosRedes();
    }
  } catch (err) {
    // Sin conexión con la API: nos quedamos con el valor de reserva de config.js.
  }
}

function sesionActual() {
  try {
    const token = localStorage.getItem("eof_token");
    const user = JSON.parse(localStorage.getItem("eof_user") || "null");
    if (!token || !user) return null;
    return user;
  } catch {
    return null;
  }
}

function cerrarSesionGlobal() {
  localStorage.removeItem("eof_token");
  localStorage.removeItem("eof_user");
  location.reload();
}

function iniciales(nombre) {
  return (nombre || "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function avatarHTML(user, clase = "user-avatar") {
  if (user && user.avatar_url) {
    const foco = user.avatar_foco || "50% 50%";
    return `<span class="${clase} user-avatar-foto" style="background-image:url('${user.avatar_url}');background-size:cover;background-position:${foco}"></span>`;
  }
  return `<span class="${clase}">${iniciales(user && user.nombre) || "?"}</span>`;
}

function accesoHeaderHTML() {
  const user = sesionActual();
  if (!user) {
    // Sin sesión de redactor: el botón de acceso único lo pinta
    // accesoLectorHeaderHTML() (lleva a acceso.html, con la pestaña de
    // Redactor disponible ahí dentro), así que aquí no se pinta nada.
    return "";
  }
  return `
    <div class="user-menu" id="userMenu">
      <button type="button" class="btn-usuario" id="userMenuToggle" aria-label="Cuenta">
        ${avatarHTML(user)}
        <span class="user-nombre">${escapeHtml(user.nombre || user.username)}</span>
      </button>
      <div class="user-dropdown" id="userDropdown">
        <div class="user-dropdown-info">
          ${avatarHTML(user, "user-avatar user-avatar-grande")}
          <div class="user-dropdown-textos">
            <strong>${escapeHtml(user.nombre || user.username)}</strong>
            <span>${user.rol === "admin" ? "Administrador" : "Redactor"}</span>
          </div>
        </div>
        <a href="${baseHref()}admin/panel.html?ajustes=perfil">Editar perfil</a>
        <a href="${baseHref()}admin/panel.html?ajustes=password">Cambiar contraseña</a>
        <a href="${baseHref()}admin/panel.html?ajustes=progreso">Mi progreso</a>
        <a href="${baseHref()}admin/panel.html?ajustes=sesiones">Dispositivos</a>
        <a href="${baseHref()}admin/panel.html">Ir al panel</a>
        <button type="button" id="btnCerrarSesion">Cerrar sesión</button>
      </div>
    </div>`;
}

function accesoLectorHeaderHTML() {
  // Si ya hay sesión de redactor/admin abierta en este navegador, no se
  // muestra el icono de lector aparte: el menú de usuario del panel ya
  // cubre "quién eres" en el header, y mostrar los dos a la vez confunde
  // más de lo que ayuda. Fuera de ese caso, se ve siempre (con o sin
  // sesión de lector) como EL ÚNICO botón de acceso del sitio: lleva al
  // hub unificado (acceso.html), donde la pestaña "Redactor" sigue
  // disponible para quien la necesite.
  if (sesionActual()) return "";
  const reader = sesionLectorActual();
  const volver = encodeURIComponent(location.pathname + location.search);
  if (!reader) {
    return `<a href="${baseHref()}acceso.html?volver=${volver}" class="btn-login" aria-label="Acceso" title="Iniciar sesión o registrarte"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></a>`;
  }
  return `
    <div class="user-menu" id="lectorMenu">
      <button type="button" class="btn-usuario" id="lectorMenuToggle" aria-label="Mi cuenta">
        ${avatarHTML(reader)}
        <span class="user-nombre">${escapeHtml(reader.nombre)}</span>
      </button>
      <div class="user-dropdown" id="lectorDropdown">
        <div class="user-dropdown-info">
          ${avatarHTML(reader, "user-avatar user-avatar-grande")}
          <div class="user-dropdown-textos">
            <strong>${escapeHtml(reader.nombre)}</strong>
            <span>Lector</span>
          </div>
        </div>
        <a href="${baseHref()}cuenta.html">Editar perfil</a>
        <a href="${baseHref()}acceso.html?cuenta=password">Cambiar contraseña</a>
        <a href="${baseHref()}cuenta.html?tab=sesiones">Dispositivos</a>
        <button type="button" id="btnCerrarSesionLectorHeader">Cerrar sesión</button>
      </div>
    </div>`;
}

function renderHeader() {
  const activePage = document.body.dataset.page || "";
  const navHTML = NAV_ITEMS.map((item) => {
    const activo = item.key === activePage ? "activo" : "";
    const clubes = typeof getClubsForCategoria === "function" ? getClubsForCategoria(item.key) : [];
    if (clubes.length) {
      return `
        <li class="tiene-submenu">
          <a href="${baseHref()}${item.href}" class="${activo}">${item.label}</a>
          <button type="button" class="submenu-toggle" aria-label="Ver clubes de ${item.label}">▾</button>
          ${clubSubmenuHTML(item.key, clubes)}
        </li>`;
    }
    return `<li><a href="${baseHref()}${item.href}" class="${activo}">${item.label}</a></li>`;
  }).join("");

  const redesMini = iconosRedesHTML();

  return `
    <div class="top-bar">
      <div class="wrap">
        <span id="fecha-hoy"></span>
        <div class="redes-mini">${redesMini}</div>
      </div>
    </div>

    <header class="main-header">
      <div class="wrap">
        <a href="${baseHref()}index.html" class="brand">
          <img src="${baseHref()}img/logo.png" alt="ELOTROFÚTBOLTV - logo oficial">
          <span class="brand-text">EL<span class="brand-rojo">OTROFÚTBOL</span>TV</span>
        </a>
        <div class="search-box" id="searchBox">
          <input type="text" id="searchInput" autocomplete="off" placeholder="Buscar noticias, crónicas...">
          <div class="search-resultados" id="searchResultados"></div>
        </div>
        <div class="header-right">
          <button type="button" class="theme-toggle" id="themeToggle" aria-label="Cambiar a modo oscuro" title="Modo oscuro/claro">
            <svg class="theme-icon-luna" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
            <svg class="theme-icon-sol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/></svg>
          </button>
          ${accesoHeaderHTML()}
          ${accesoLectorHeaderHTML()}
          <button class="nav-toggle" id="navToggle">☰</button>
        </div>
      </div>
    </header>

    <nav class="main-nav">
      <ul id="navList">${navHTML}</ul>
    </nav>
  `;
}

function renderBloqueNewsletter() {
  const yaSuscrito = estadoModalNewsletter().suscrito;
  return yaSuscrito
    ? `
        <div class="newsletter-bloque newsletter-bloque-suscrito">
          <div class="newsletter-texto">
            <h4>¡Ya estás dentro del boletín! 📬</h4>
            <p>Gracias por suscribirte. Cada semana te llega a tu correo un resumen con lo más destacado.</p>
            <button type="button" class="newsletter-olvidar-suscripcion" id="btnOlvidarSuscripcionNewsletter">¿Ya no recibes el boletín? Pulsa aquí</button>
          </div>
        </div>`
    : `
        <div class="newsletter-bloque">
          <div class="newsletter-texto">
            <h4>Boletín semanal</h4>
            <p>Recibe cada semana un resumen con lo más destacado, directo a tu correo.</p>
          </div>
          <form class="newsletter-form" id="newsletterForm">
            <input type="email" id="newsletterEmail" placeholder="Tu correo electrónico" required autocomplete="email">
            <button type="submit">Suscribirme</button>
          </form>
        </div>`;
}

// Vuelve a pintar SOLO el bloque de newsletter del pie (no todo el
// footer, que perdería otros listeners ya enganchados como los de
// redes sociales) y reengancha sus propios listeners. Se llama tras
// suscribirse o tras pulsar "¿Ya no recibes el boletín?", para que el
// pie refleje el nuevo estado sin esperar a recargar la página.
function renderFooter_actualizarBloqueNewsletter() {
  const contenedor = document.querySelector("#site-footer .newsletter-bloque, #site-footer .newsletter-bloque-suscrito");
  if (!contenedor) return;
  contenedor.outerHTML = renderBloqueNewsletter();
  inicializarFormularioNewsletter();
}

// Franja compacta de patrocinadores dentro del pie de página, visible en
// TODAS las páginas del sitio (a diferencia del carrusel grande, que solo
// vive en la portada — ver pintarPatrocinadoresHome). Es también un
// carrusel de scroll infinito, más pequeño y en una única fila.
// Si no hay ningún patrocinador cargado en PATROCINADORES (config.js), no
// se pinta nada.
//
// OJO con el número de copias: la animación CSS desplaza la tira un -50%,
// así que necesitamos que UNA MITAD del track ya llene (o sobrepase) el
// ancho visible del carrusel; si no, con pocos patrocinadores queda un
// hueco vacío a la derecha y, además, ese -50% equivale a muy pocos
// píxeles reales, así que a duración fija (segundos) el desplazamiento se
// ve larguísimo y lentísimo. Por eso el número de copias y la duración de
// la animación se recalculan en inicializarCarruselPatrocinadoresFooter()
// una vez el track ya está en el DOM y conocemos su ancho real.
function renderPatrocinadoresFooterHTML() {
  if (!PATROCINADORES || !PATROCINADORES.length) return "";
  const logoHTML = (p) => `<a href="${p.url || "#"}" target="_blank" rel="noopener sponsored" title="${escapeHtml(p.nombre)}">
        <img src="${baseHref()}${p.logo}" alt="${escapeHtml(p.nombre)}" loading="lazy">
      </a>`;
  // Arrancamos con 2 copias (el mínimo para que el bucle del -50% no se
  // note); si hacen falta más para llenar el ancho visible, se añaden en
  // inicializarCarruselPatrocinadoresFooter() tras medir el DOM real.
  const logos = [...PATROCINADORES, ...PATROCINADORES].map(logoHTML).join("");
  return `
    <div class="patrocinadores-footer">
      <span class="patrocinadores-footer-label">Con el apoyo de</span>
      <div class="patrocinadores-footer-carrusel">
        <div class="patrocinadores-footer-track">${logos}</div>
      </div>
    </div>`;
}

// Velocidad constante del carrusel, en píxeles por segundo. Al fijar la
// velocidad (en vez de una duración fija en segundos para toda la tira),
// el desplazamiento se percibe igual de "rápido" tanto si hay 2
// patrocinadores como si hay 20, en vez de ralentizarse cuando el track es
// corto (que es lo que pasaba con una duración fija tipo "34s" sobre un
// -50% que, con pocos logos, son pocos píxeles).
const PATROCINADORES_FOOTER_VELOCIDAD_PXS = 18;

// Tras insertar el footer en el DOM, ajusta el carrusel de patrocinadores
// para que: 1) la tira tenga las copias necesarias para llenar (o
// sobrepasar) el ancho visible del carrusel, y 2) la animación se mueva a
// velocidad constante en vez de a duración fija, para que no se vea lenta
// cuando hay pocos logos. Se llama una vez tras pintar el footer y de
// nuevo si la ventana cambia de tamaño (un logo más o menos por fila puede
// cambiar cuántas copias hacen falta).
function inicializarCarruselPatrocinadoresFooter() {
  const carrusel = document.querySelector(".patrocinadores-footer-carrusel");
  const track = document.querySelector(".patrocinadores-footer-track");
  if (!carrusel || !track || !PATROCINADORES || !PATROCINADORES.length) return;

  const logoHTML = (p) => `<a href="${p.url || "#"}" target="_blank" rel="noopener sponsored" title="${escapeHtml(p.nombre)}">
        <img src="${baseHref()}${p.logo}" alt="${escapeHtml(p.nombre)}" loading="lazy">
      </a>`;

  // Reconstruimos el track con exactamente 1 tanda de patrocinadores para
  // medir su ancho "natural" (el de una sola pasada), y a partir de ahí
  // calculamos cuántas copias hacen falta para llenar el carrusel.
  track.innerHTML = PATROCINADORES.map(logoHTML).join("");
  const anchoUnaTanda = track.scrollWidth || 1;
  const anchoVisible = carrusel.clientWidth || 0;

  // Necesitamos al menos 2 copias (para el bucle del -50%) y, además, que
  // esas 2 copias sobrepasen el ancho visible; si con pocos logos el
  // carrusel es más ancho que 2 tandas, añadimos las copias que falten.
  const copias = Math.max(2, Math.ceil((anchoVisible * 2) / anchoUnaTanda));
  track.innerHTML = Array(copias).fill(PATROCINADORES.map(logoHTML).join("")).join("");

  // Con "copias" tandas en el track, la animación recorre un -50%, es
  // decir, la mitad del track: copias/2 tandas de ancho anchoUnaTanda.
  const distanciaRecorrida = (copias / 2) * anchoUnaTanda;
  const duracionSegundos = distanciaRecorrida / PATROCINADORES_FOOTER_VELOCIDAD_PXS;
  track.style.animationDuration = `${duracionSegundos}s`;
}

function renderFooter() {
  const redesFooter = iconosRedesHTML();
  const bloqueNewsletter = renderBloqueNewsletter();
  const bloquePatrocinadoresFooter = renderPatrocinadoresFooterHTML();

  return `
    <footer>
      <div class="wrap">
        ${bloqueNewsletter}
        ${bloquePatrocinadoresFooter}
        <div id="modalNewsletter" class="modal-newsletter" aria-hidden="true">
          <div class="modal-newsletter-fondo" onclick="cerrarModalNewsletter()"></div>
          <div class="modal-newsletter-caja" role="dialog" aria-modal="true" aria-labelledby="modalNewsletterTitulo">
            <button type="button" class="modal-newsletter-cerrar" onclick="cerrarModalNewsletter()" aria-label="Cerrar">✕</button>
            <div class="modal-newsletter-icono">⚽📬</div>
            <h3 id="modalNewsletterTitulo">No te pierdas nada</h3>
            <p>Cada semana, un resumen con lo más destacado de LaLiga Hypermotion, Primera y Segunda Federación directo a tu correo. Sin spam, cancelas cuando quieras.</p>
            <form class="newsletter-form modal-newsletter-form" id="modalNewsletterForm">
              <input type="email" id="modalNewsletterEmail" placeholder="Tu correo electrónico" required autocomplete="email">
              <button type="submit">Quiero suscribirme</button>
            </form>
            <button type="button" class="modal-newsletter-omitir" onclick="cerrarModalNewsletter()">Ahora no, gracias</button>
          </div>
        </div>
        <div class="footer-grid">
          <div class="footer-col-brand">
            <div class="footer-brand">
              <img src="${baseHref()}img/logo.png" alt="ELOTROFÚTBOLTV - logo oficial">
              <span>EL<span class="brand-rojo">OTROFÚTBOL</span>TV</span>
            </div>
            <p>Crónicas, noticias y resultados del fútbol no profesional español: LaLiga Hypermotion, Primera y Segunda Federación.</p>
            <div class="redes-footer">${redesFooter}</div>
          </div>
          <div>
            <h4>Secciones</h4>
            <ul>
              <li><a href="${baseHref()}categoria.html?cat=hypermotion">LaLiga Hypermotion</a></li>
              <li><a href="${baseHref()}categoria.html?cat=primera_federacion">Primera Federación</a></li>
              <li><a href="${baseHref()}categoria.html?cat=segunda_federacion">Segunda Federación</a></li>
              <li><a href="${baseHref()}categoria.html?cat=arbitraje">Arbitraje</a></li>
              <li><a href="${baseHref()}categoria.html?cat=jurisdiccion">Jurisdicción deportiva</a></li>
            </ul>
          </div>
          <div>
            <h4>Resultados</h4>
            <ul>
              <li><a href="${baseHref()}calendario.html">Calendario</a></li>
              <li><a href="${baseHref()}clasificacion.html">Clasificación</a></li>
              <li><a href="${baseHref()}predicciones.html">Porras</a></li>
              <li><a href="${baseHref()}buscar.html">Buscar noticias</a></li>
            </ul>
          </div>
          <div>
            <h4>El medio</h4>
            <ul>
              <li><a href="${baseHref()}index.html">Portada</a></li>
              <li><a href="${baseHref()}quienes-somos.html">Quiénes somos</a></li>
              <li><a href="${baseHref()}linea-editorial.html">Línea editorial</a></li>
              <li><a href="${baseHref()}contacto.html">Contacto de prensa</a></li>
              <li><a href="${baseHref()}widgets.html">Widgets para tu web</a></li>
              <li><a href="${baseHref()}transparencia.html">Portal de transparencia</a></li>
              <li><a href="${baseHref()}estado.html">Estado del servicio</a></li>
              <li><a href="${baseHref()}acceso.html">Acceso</a></li>
            </ul>
          </div>
          <div>
            <h4>Legal</h4>
            <ul>
              <li><a href="${baseHref()}politica-privacidad.html">Política de privacidad</a></li>
              <li><a href="${baseHref()}politica-cookies.html">Política de cookies</a></li>
              <li><button type="button" class="footer-link-boton" onclick="if(window.eofAbrirPreferenciasCookies)eofAbrirPreferenciasCookies();">Configurar cookies</button></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <div class="copy">© ${new Date().getFullYear()} ELOTROFÚTBOLTV · Medio de comunicación deportivo independiente</div>
          <button type="button" class="footer-arriba" onclick="window.scrollTo({top:0,behavior:'smooth'})">
            Volver arriba
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
          </button>
        </div>
      </div>
    </footer>
  `;
}

// Pinta la fecha de hoy en el <span id="fecha-hoy"> de la barra
// superior. Aparte del arranque inicial, hay que volver a llamarla cada
// vez que se repinta la cabecera con renderHeader() (p. ej. al llegar
// los clubes personalizados), porque eso sustituye el <span> por uno
// vacío y, si no se repinta la fecha, se queda en blanco.
function pintarFechaHoy() {
  const fechaHoy = document.getElementById("fecha-hoy");
  if (fechaHoy) {
    fechaHoy.textContent = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
  }
}

// ---------- Banner flotante de "Última hora" ----------
// Se consulta desde CUALQUIER página del sitio (una sola llamada
// ligera, ver /api/articles/banner-urgente en el worker). El propio
// backend ya resuelve la expiración con el WHERE de su consulta, así
// que aquí basta con pintar o no según lo que responda; no hace falta
// ningún temporizador que lo desactive por su cuenta en el cliente.
//
// Además de la comprobación inicial al cargar la página, se repite
// cada minuto en segundo plano: así, si un redactor activa el banner
// mientras alguien ya está leyendo el sitio, aparece solo, sin que el
// lector tenga que recargar. Por el mismo motivo, si el banner se
// desactiva (o caduca) estando la página abierta, se retira solo en la
// siguiente comprobación.
const UH_INTERVALO_COMPROBACION_MS = 60000; // 1 minuto

async function cargarBannerUrgente() {
  try {
    const res = await apiFetch("/api/articles/banner-urgente");
    // apiFetch (config.js) devuelve un Response crudo, igual que fetch
    // nativo, NO el JSON ya parseado (a diferencia del apiFetch de
    // admin.js, que sí lo parsea): hay que llamar a .json() aquí.
    if (!res || !res.ok) return;
    const data = await res.json();
    const bannerActual = document.getElementById("banner-ultima-hora");

    if (!data || !data.activo) {
      // Si había un banner pintado y ya no hay nada activo (se quitó
      // desde el panel, o expiraron las 2h), se retira solo.
      if (bannerActual) quitarBannerUrgenteDelDOM();
      return;
    }

    // Respeta el cierre manual del banner para esta pestaña/sesión: si
    // el lector lo cerró, no debe reaparecer hasta la próxima visita
    // aunque siga activo en el servidor, SALVO que sea una noticia
    // distinta a la que cerró (nueva última hora), en cuyo caso sí
    // tiene sentido volver a mostrarla.
    const urlCerrada = sessionStorage.getItem("bannerUrgenteCerradoUrl");
    if (urlCerrada === data.url) return;

    if (bannerActual) {
      // Ya había un banner (p. ej. de una comprobación anterior): si es
      // la misma noticia no hace falta rehacer nada; si ha cambiado el
      // título/URL, se sustituye por el nuevo sin duplicar.
      if (bannerActual.dataset.uhUrl === data.url) return;
      quitarBannerUrgenteDelDOM();
    }

    pintarBannerUrgente(data);
  } catch (e) {
    // Un fallo aquí (red, failover agotado, etc.) no debe romper el
    // resto de la página: simplemente no se muestra el banner.
    console.error("Error cargando banner de última hora:", e);
  }
}

function quitarBannerUrgenteDelDOM() {
  const banner = document.getElementById("banner-ultima-hora");
  if (!banner) return;
  banner.remove();
  document.body.classList.remove("con-banner-ultima-hora");
}

function pintarBannerUrgente(datos) {
  if (document.getElementById("banner-ultima-hora")) return;

  const banner = document.createElement("div");
  banner.id = "banner-ultima-hora";
  banner.dataset.uhUrl = datos.url;
  banner.innerHTML = `
    <div class="uh-franja">
      <span class="uh-live">
        <span class="uh-live-punto" aria-hidden="true"></span>
        ÚLTIMA HORA
      </span>
      <div class="uh-texto-wrap">
        <a class="uh-texto" href="${datos.url}">${escaparHtmlBasico(datos.titulo)}</a>
      </div>
      <a class="uh-ver" href="${datos.url}">Leer <span aria-hidden="true">→</span></a>
      <button type="button" class="uh-cerrar" aria-label="Cerrar aviso de última hora">✕</button>
    </div>
  `;

  document.body.prepend(banner);
  document.body.classList.add("con-banner-ultima-hora");

  // El desplazamiento tipo marquee solo se activa si el título no cabe
  // entero en el hueco disponible; con un título corto se queda fijo y
  // centrado, sin animación de scroll.
  const textoWrap = banner.querySelector(".uh-texto-wrap");
  const textoEl = banner.querySelector(".uh-texto");
  requestAnimationFrame(() => {
    if (textoEl.scrollWidth > textoWrap.clientWidth) {
      banner.classList.add("uh-marquee");
    }
  });

  banner.querySelector(".uh-cerrar").addEventListener("click", () => {
    quitarBannerUrgenteDelDOM();
    sessionStorage.setItem("bannerUrgenteCerradoUrl", datos.url);
  });
}

// Escapado mínimo para el título de la noticia dentro del banner (no se
// reutiliza escapeHtml de admin.js porque ese archivo no se carga en
// las páginas públicas).
function escaparHtmlBasico(texto) {
  const div = document.createElement("div");
  div.textContent = texto || "";
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  const headerEl = document.getElementById("site-header");
  const footerEl = document.getElementById("site-footer");
  if (headerEl) headerEl.innerHTML = renderHeader();
  if (footerEl) footerEl.innerHTML = renderFooter();
  // Ajusta el carrusel de "Con el apoyo de" (nº de copias de logos y
  // velocidad de la animación) una vez el footer ya está en el DOM y se
  // puede medir su ancho real; ver inicializarCarruselPatrocinadoresFooter().
  inicializarCarruselPatrocinadoresFooter();
  let patrocinadoresFooterResizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(patrocinadoresFooterResizeTimeout);
    patrocinadoresFooterResizeTimeout = setTimeout(inicializarCarruselPatrocinadoresFooter, 200);
  });
  pintarFechaHoy();
  // El banner de "última hora" no tiene sentido en la pantalla de acceso
  // (login/registro): no hay nada de contenido debajo que "interrumpir"
  // y solo distrae de un formulario que el usuario necesita completar.
  const esPaginaAcceso = /(^|\/)acceso(\.html)?(\/)?$/.test(location.pathname);
  if (!esPaginaAcceso) {
    cargarBannerUrgente();
    // Comprobación periódica: así, si se activa (o se quita) el banner
    // mientras alguien ya tiene la página abierta, se refleja solo, sin
    // que tenga que recargar. Se limpia si la pestaña se cierra o
    // navega, aunque en la práctica no supone un problema real dejarlo
    // corriendo hasta entonces (una llamada ligera por minuto).
    setInterval(cargarBannerUrgente, UH_INTERVALO_COMPROBACION_MS);
  }

  // Los clubes "personalizados" (añadidos desde "Otro equipo" en el
  // panel) se cargan aparte, sin bloquear la primera pintura del menú;
  // en cuanto llegan, si añaden algún club nuevo al submenú de alguna
  // liga, se vuelve a pintar la cabecera para incluirlos. OJO: al
  // volver a pintar con innerHTML se sustituye también el <input> del
  // buscador (y el <span> de la fecha) por unos nuevos sin contenido,
  // así que hay que reenganchar la búsqueda en vivo y volver a pintar
  // la fecha aquí también (antes solo se llamaba una vez al final de
  // este DOMContentLoaded, y como esta llamada de red casi siempre
  // tarda más que el resto del arranque, el buscador se quedaba
  // "muerto" y la fecha se quedaba en blanco en cuanto llegaba la
  // respuesta).
  if (headerEl && typeof cargarCustomClubs === "function") {
    cargarCustomClubs().then(() => {
      headerEl.innerHTML = renderHeader();
      pintarFechaHoy();
      reengancharMenu();
      inicializarBusquedaEnVivo();
    });
  }

  // Escritorio: la lista de clubes solo se ve mientras el ratón está
  // encima de la liga; en cuanto sale, se cierra al momento.
  // Móvil: como no hay hover, el botón "▾" abre/cierra la lista al tocarlo.
  reengancharMenu();

  const redesPortada = document.getElementById("redes-icons-portada");
  if (redesPortada) redesPortada.innerHTML = iconosRedesHTML();

  cargarRedesSociales();
  inicializarBusquedaEnVivo();
  inicializarMenuUsuario();
  inicializarMenuLector();
  inicializarToggleTema();
  inicializarFormularioNewsletter();
  inicializarModalNewsletter();
});

// ---------- Modal de suscripción al boletín (lectores) ----------
// Se muestra hasta dos veces por persona, pensado para captar
// suscripciones sin resultar cargante: la primera vez nada más entrar en
// la web (con un pequeño respiro para no interrumpir la carga), y la
// segunda pasado un rato de lectura en una visita posterior. Si en
// cualquiera de las dos ya se ha suscrito, o si ya se ha mostrado dos
// veces, no se vuelve a insistir. Todo se recuerda en localStorage, así
// que es por navegador, no por sesión.
const NEWSLETTER_MODAL_CLAVE = "eof_newsletter_modal";
const NEWSLETTER_MODAL_RETRASO_PRIMERA_VEZ_MS = 4000; // pequeño respiro tras cargar
const NEWSLETTER_MODAL_RETRASO_SEGUNDA_VEZ_MS = 45000; // "pasado un tiempo" en una visita posterior

function estadoModalNewsletter() {
  try {
    return JSON.parse(localStorage.getItem(NEWSLETTER_MODAL_CLAVE)) || { veces: 0, suscrito: false };
  } catch (e) {
    return { veces: 0, suscrito: false };
  }
}

function guardarEstadoModalNewsletter(estado) {
  try {
    localStorage.setItem(NEWSLETTER_MODAL_CLAVE, JSON.stringify(estado));
  } catch (e) {
    // Sin localStorage disponible (modo privado estricto, etc.): el modal
    // podría repetirse más de la cuenta, pero no es motivo para romper
    // nada más de la página.
  }
}

function abrirModalNewsletter() {
  const modal = document.getElementById("modalNewsletter");
  if (!modal) return;
  // Si ya hay otro modal (p. ej. el de detalle de partido) abierto encima,
  // no se superpone el de newsletter: se deja para la próxima ocasión.
  if (document.querySelector(".modal-partido.abierto")) return;
  modal.classList.add("abierto");
  modal.setAttribute("aria-hidden", "false");
}

function cerrarModalNewsletter() {
  const modal = document.getElementById("modalNewsletter");
  if (!modal) return;
  modal.classList.remove("abierto");
  modal.setAttribute("aria-hidden", "true");
}

function inicializarModalNewsletter() {
  const modal = document.getElementById("modalNewsletter");
  const form = document.getElementById("modalNewsletterForm");
  if (!modal || !form) return;

  const estado = estadoModalNewsletter();
  if (!estado.suscrito && estado.veces < 2) {
    const retraso = estado.veces === 0 ? NEWSLETTER_MODAL_RETRASO_PRIMERA_VEZ_MS : NEWSLETTER_MODAL_RETRASO_SEGUNDA_VEZ_MS;
    setTimeout(() => {
      // Se vuelve a comprobar el estado al saltar el timeout (no solo al
      // programarlo): si mientras tanto la persona ya se ha suscrito
      // desde el formulario del pie de página, no tiene sentido interrumpirle.
      const estadoActual = estadoModalNewsletter();
      if (estadoActual.suscrito || estadoActual.veces >= 2) return;
      abrirModalNewsletter();
      guardarEstadoModalNewsletter({ ...estadoActual, veces: estadoActual.veces + 1 });
    }, retraso);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("abierto")) cerrarModalNewsletter();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("modalNewsletterEmail");
    const email = (input.value || "").trim();
    if (!email) return;
    const boton = form.querySelector("button");
    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = "Enviando...";
    try {
      const res = await apiFetch("/api/newsletter/suscribir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo completar la suscripción");
      }
      guardarEstadoModalNewsletter({ ...estadoModalNewsletter(), suscrito: true });
      if (window.EOF && EOF.toast) {
        EOF.toast("¡Suscripción realizada! Revisa tu correo cada semana.", "exito");
      }
      cerrarModalNewsletter();
      renderFooter_actualizarBloqueNewsletter();
    } catch (err) {
      if (window.EOF && EOF.toast) {
        EOF.toast(err.message || "No se pudo completar la suscripción", "error");
      }
    } finally {
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  });
}

// ---------- Modo oscuro ----------
// El modo por defecto es siempre claro (ver tema.js); este botón es la
// ÚNICA forma de pasar a oscuro, y la elección se recuerda en
// localStorage para las siguientes visitas.
//
// Se engancha con delegación de eventos en document en vez de buscar
// el botón una sola vez: la cabecera se vuelve a pintar por completo
// (innerHTML) en cuanto llegan los clubes personalizados (ver más
// arriba, cargarCustomClubs().then(...)), lo que sustituye el botón
// original por uno nuevo y se llevaba por delante cualquier listener
// enganchado directamente a él. Delegar en document sobrevive a
// cualquier repintado futuro de la cabecera sin tener que acordarse de
// reengancharlo cada vez.
function inicializarToggleTema() {
  if (document.body.dataset.temaDelegado) return; // no engancharlo dos veces
  document.body.dataset.temaDelegado = "1";
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#themeToggle");
    if (!btn) return;
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
}

// ---------- Formulario de suscripción al boletín (pie de página) ----------
function inicializarFormularioNewsletter() {
  const form = document.getElementById("newsletterForm");
  // Enlace "¿Ya no recibes el boletín?" que aparece en el bloque de "ya
  // suscrito": no llama a ningún endpoint de baja (aquí no hay forma de
  // saber el baja_token del suscriptor, solo se guardó en el correo),
  // así que solo "olvida" el estado local (eof_newsletter_modal) para
  // que este navegador vuelva a mostrar el formulario normal de
  // suscripción. Pensado para cuando la persona ya se dio de baja desde
  // el enlace del correo pero en OTRO dispositivo/navegador, donde ese
  // aviso de "ya estás dentro" no se pudo limpiar solo.
  const btnOlvidar = document.getElementById("btnOlvidarSuscripcionNewsletter");
  if (btnOlvidar) {
    btnOlvidar.addEventListener("click", () => {
      guardarEstadoModalNewsletter({ veces: estadoModalNewsletter().veces, suscrito: false });
      if (window.EOF && EOF.toast) {
        EOF.toast("Listo. Ya puedes volver a suscribirte cuando quieras.", "exito");
      }
      renderFooter_actualizarBloqueNewsletter();
    });
  }
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("newsletterEmail");
    const email = (input.value || "").trim();
    if (!email) return;
    const boton = form.querySelector("button");
    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = "Enviando...";
    try {
      const res = await apiFetch("/api/newsletter/suscribir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo completar la suscripción");
      }
      input.value = "";
      guardarEstadoModalNewsletter({ ...estadoModalNewsletter(), suscrito: true });
      if (window.EOF && EOF.toast) {
        EOF.toast("¡Suscripción realizada! Revisa tu correo cada semana.", "exito");
      }
      renderFooter_actualizarBloqueNewsletter();
    } catch (err) {
      if (window.EOF && EOF.toast) {
        EOF.toast(err.message || "No se pudo completar la suscripción", "error");
      }
    } finally {
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  });
}

// Engancha los listeners de apertura/cierre del submenú de clubes de
// cada liga. Se llama al arrancar y también cada vez que se vuelve a
// pintar la cabecera (p. ej. al llegar los clubes personalizados), ya
// que renderHeader() sustituye el HTML entero y los listeners viejos se
// pierden con los elementos a los que estaban enganchados.
function reengancharMenu() {
  const toggle = document.getElementById("navToggle");
  const navList = document.getElementById("navList");
  if (toggle && navList) {
    toggle.addEventListener("click", () => navList.classList.toggle("abierta"));
  }
  document.querySelectorAll("li.tiene-submenu").forEach((li) => {
    li.addEventListener("mouseenter", () => {
      if (window.innerWidth > 900) li.classList.add("abierto");
    });
    li.addEventListener("mouseleave", () => {
      if (window.innerWidth > 900) li.classList.remove("abierto");
    });
  });
  document.querySelectorAll(".submenu-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const li = btn.closest("li");
      const yaAbierto = li.classList.contains("abierto");
      document.querySelectorAll("li.tiene-submenu.abierto").forEach((otro) => otro.classList.remove("abierto"));
      if (!yaAbierto) li.classList.add("abierto");
    });
  });
}
document.addEventListener("click", (e) => {
  if (window.innerWidth <= 900 && !e.target.closest("li.tiene-submenu")) {
    document.querySelectorAll("li.tiene-submenu.abierto").forEach((li) => li.classList.remove("abierto"));
  }
});

// Desplegable del nombre de usuario en la cabecera (sesión iniciada
// desde el panel, visible en cualquier página pública sin tener que
// volver a iniciar sesión).
function inicializarMenuUsuario() {
  if (!document.getElementById("userMenu")) return;
  // Delegación en document: sobrevive a que renderHeader() vuelva a
  // pintar la cabecera (p. ej. al llegar los clubes personalizados) y
  // sustituya estos elementos por otros nuevos con los mismos ids.
  if (window.__menuUsuarioListenersListos) return;
  window.__menuUsuarioListenersListos = true;

  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("#userMenuToggle");
    const dropdown = document.getElementById("userDropdown");
    if (!dropdown) return;
    if (toggle) {
      e.stopPropagation();
      dropdown.classList.toggle("abierto");
      return;
    }
    if (e.target.closest("#btnCerrarSesion")) {
      cerrarSesionGlobal();
      return;
    }
    const menu = document.getElementById("userMenu");
    if (menu && !menu.contains(e.target)) dropdown.classList.remove("abierto");
  });
}

// Mismo patrón que inicializarMenuUsuario(), pero para el desplegable
// de cuenta de lector (#lectorMenu) que aparece en el header cuando hay
// sesión de lector iniciada. Independiente a propósito: los dos menús
// pueden coexistir en el DOM aunque solo uno se muestre a la vez (ver
// accesoLectorHeaderHTML), y no comparten ids ni lógica de cierre.
function inicializarMenuLector() {
  if (window.__menuLectorListenersListos) return;
  window.__menuLectorListenersListos = true;

  document.addEventListener("click", async (e) => {
    const toggle = e.target.closest("#lectorMenuToggle");
    const dropdown = document.getElementById("lectorDropdown");
    if (!dropdown) return;
    if (toggle) {
      e.stopPropagation();
      dropdown.classList.toggle("abierto");
      return;
    }
    if (e.target.closest("#btnCerrarSesionLectorHeader")) {
      await cerrarSesionLector();
      location.reload();
      return;
    }
    const menu = document.getElementById("lectorMenu");
    if (menu && !menu.contains(e.target)) dropdown.classList.remove("abierto");
  });
}

// ---------- Búsqueda en vivo: resultados automáticos conforme se escribe,
// sin necesidad de pulsar ningún botón/lupa. Se muestra un desplegable
// con las coincidencias bajo el propio cuadro de búsqueda de la cabecera.
// Se puede llamar más de una vez en la misma página (p. ej. cuando
// cargarCustomClubs() vuelve a pintar la cabecera y sustituye el
// <input> por uno nuevo): cada llamada reengancha los listeners propios
// del input actual, pero el cierre del desplegable al hacer clic fuera
// se engancha una sola vez en document (con __busquedaClickFueraListo)
// para no ir acumulando listeners duplicados en cada repintado.
let __busquedaClickFueraListo = false;
function inicializarBusquedaEnVivo() {
  const input = document.getElementById("searchInput");
  const resultadosEl = document.getElementById("searchResultados");
  if (!input || !resultadosEl) return;

  let temporizador;
  let controlador;

  input.addEventListener("input", () => {
    clearTimeout(temporizador);
    const q = input.value.trim();
    if (!q) {
      resultadosEl.classList.remove("visible");
      resultadosEl.innerHTML = "";
      return;
    }
    temporizador = setTimeout(() => buscarEnVivo(q), 250);
  });

  async function buscarEnVivo(q) {
    if (controlador) controlador.abort();
    controlador = new AbortController();
    resultadosEl.classList.add("visible");
    resultadosEl.innerHTML = `<div class="search-cargando">Buscando...</div>`;

    // Si lo que se ha escrito coincide con el nombre de uno o varios
    // equipos (con o sin sigla, con o sin tildes), se ofrece primero un
    // acceso directo a la ficha de CADA club que encaje -- no solo el
    // primero -- además de las noticias que encajen con el texto tal
    // cual. Por ejemplo, buscar "nas" debe ofrecer todos los equipos
    // que contengan esas letras (p.ej. "Arenas Club"), no quedarse solo
    // con el primero que se encuentre y ocultar el resto.
    const MAX_CLUBES_EN_BUSCADOR = 5;
    const clubes = (typeof buscarClubesPorTexto === "function") ? buscarClubesPorTexto(q) : [];
    const clubesAMostrar = clubes.slice(0, MAX_CLUBES_EN_BUSCADOR);
    const itemClubHTML = clubesAMostrar.map(club => `
      <a class="search-item search-item-club" href="${baseHref()}categoria.html?cat=${encodeURIComponent(club.categoria)}&club=${encodeURIComponent(club.nombre)}">
        <span class="search-item-cat">Ficha del equipo</span>
        <span class="search-item-titulo">${escapeHtml(club.nombre)}</span>
      </a>`).join("");

    try {
      const res = await apiFetch(`/api/articles?q=${encodeURIComponent(q)}&limit=6`, { signal: controlador.signal });
      const { articles = [] } = await res.json();
      if (!articles.length && !clubesAMostrar.length) {
        resultadosEl.innerHTML = `<div class="search-vacio">Sin resultados para "${escapeHtml(q)}"</div>`;
        return;
      }
      resultadosEl.innerHTML = itemClubHTML + articles.map(a => `
        <a class="search-item" href="${urlNoticia(a.categoria, a.slug)}">
          <span class="search-item-cat">${categoriaLabel(a.categoria)}</span>
          <span class="search-item-titulo">${escapeHtml(a.titulo)}</span>
        </a>`).join("") +
        `<a class="search-vermas" href="${baseHref()}buscar.html?q=${encodeURIComponent(q)}">Ver todos los resultados →</a>`;
    } catch (err) {
      if (err.name === "AbortError") return;
      resultadosEl.innerHTML = itemClubHTML || `<div class="search-vacio">No se ha podido buscar. Inténtalo de nuevo.</div>`;
    }
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      // Si el texto escrito coincide con el nombre de un equipo, "Intro"
      // lleva directamente a la ficha de ese club en vez de a los
      // resultados de búsqueda de artículos.
      const club = (typeof buscarClubPorTexto === "function") ? buscarClubPorTexto(input.value.trim()) : null;
      if (club) {
        location.href = `${baseHref()}categoria.html?cat=${encodeURIComponent(club.categoria)}&club=${encodeURIComponent(club.nombre)}`;
      } else {
        location.href = `${baseHref()}buscar.html?q=${encodeURIComponent(input.value.trim())}`;
      }
    }
    if (e.key === "Escape") {
      resultadosEl.classList.remove("visible");
      input.blur();
    }
  });

  if (!__busquedaClickFueraListo) {
    __busquedaClickFueraListo = true;
    // Delegado en document (no en la variable local searchBox, que
    // podría quedar obsoleta si la cabecera se repinta): busca el
    // #searchBox y el #searchResultados actuales en cada clic, así que
    // sigue funcionando bien pase lo que pase con los repintados.
    document.addEventListener("click", (e) => {
      const searchBoxActual = document.getElementById("searchBox");
      const resultadosActual = document.getElementById("searchResultados");
      if (searchBoxActual && resultadosActual && !searchBoxActual.contains(e.target)) {
        resultadosActual.classList.remove("visible");
      }
    });
  }
}
