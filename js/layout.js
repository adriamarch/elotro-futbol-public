function eofCargarTurnstile(){return window.EOFTurnstile?Promise.resolve():(window.__eofTurnstileCarga||(window.__eofTurnstileCarga=new Promise(e=>{const t=document.createElement("script");t.src="/js/turnstile.js?v=c9b660c4",t.async=!0,t.onload=()=>e(),t.onerror=()=>e(),document.head.appendChild(t)})),window.__eofTurnstileCarga)}function eofPrecalentarNewsletter(e){if(!e||e.__eofPre)return;e.__eofPre=!0;const t=async()=>{await eofCargarTurnstile();const a=e.querySelector("[data-eof-turnstile]");window.EOFTurnstile&&a&&window.EOFTurnstile.precalentar(a)};if(e.addEventListener("focusin",t,{once:!0}),"IntersectionObserver"in window){const a=new IntersectionObserver(n=>{n.some(r=>r.isIntersecting)&&(a.disconnect(),t())},{rootMargin:"300px"});a.observe(e)}}async function eofTokenNewsletter(e){await eofCargarTurnstile();const t=e&&e.querySelector("[data-eof-turnstile]");if(!window.EOFTurnstile||!t)return{cont:t,token:"",web:""};const a=await window.EOFTurnstile.esperarToken(t);return{cont:t,token:a,web:window.EOFTurnstile.trampa(t)}}const NAV_MENU=[{tipo:"enlace",key:"inicio",label:"Portada",href:""},{tipo:"grupo",id:"ligas",label:"Ligas",items:[{key:"hypermotion",label:"LaLiga Hypermotion",href:"categoria?cat=hypermotion",clubes:!0},{key:"primera_federacion",label:"Primera Federación",href:"categoria?cat=primera_federacion",clubes:!0},{key:"segunda_federacion",label:"Segunda Federación",href:"categoria?cat=segunda_federacion",clubes:!0},{key:"tercera_federacion",label:"Tercera Federación",href:"categoria?cat=tercera_federacion",clubes:!0}]},{tipo:"grupo",id:"campeonatos",label:"Campeonatos",items:[{key:"copa_del_rey",label:"Copa del Rey",href:"categoria?cat=copa_del_rey"},{key:"copa_federacion",label:"Copa Federación",href:"categoria?cat=copa_federacion"}]},{tipo:"grupo",id:"secciones",label:"Secciones específicas",items:[{key:"arbitraje",label:"Arbitraje",href:"categoria?cat=arbitraje"},{key:"jurisdiccion",label:"Jurisdicción deportiva",href:"categoria?cat=jurisdiccion"}]},{tipo:"enlace",key:"calendario",label:"Calendario",href:"calendario"},{tipo:"enlace",key:"galerias",label:"Galerías",href:"galerias"},{tipo:"enlace",key:"podcast",label:"Podcast",href:"podcast"},{tipo:"enlace",key:"clasificacion",label:"Clasificación",href:"clasificacion"},{tipo:"enlace",key:"estadisticas",label:"Estadísticas",href:"estadisticas"},{tipo:"enlace",key:"predicciones",label:"Porras",href:"predicciones"},{tipo:"enlace",key:"mapa-desplazamientos",label:"Mi mapa",href:"mapa-desplazamientos"}],ICONOS_REDES={twitter:'<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',instagram:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.3"/><circle cx="17.35" cy="6.65" r="1.05" fill="currentColor" stroke="none"/></svg>',tiktok:'<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16.5 2h-3.2v13.6a3 3 0 1 1-2.4-2.94V9.3a6.2 6.2 0 1 0 5.6 6.17V8.9a7.6 7.6 0 0 0 4.6 1.55V7.2A4.4 4.4 0 0 1 16.5 2z"/></svg>',youtube:'<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" fill-rule="evenodd" d="M23 12s0-3.4-.44-4.9a2.9 2.9 0 0 0-2-2C18.9 4.6 12 4.6 12 4.6s-6.9 0-8.56.5a2.9 2.9 0 0 0-2 2C1 8.6 1 12 1 12s0 3.4.44 4.9a2.9 2.9 0 0 0 2 2c1.66.5 8.56.5 8.56.5s6.9 0 8.56-.5a2.9 2.9 0 0 0 2-2C23 15.4 23 12 23 12zM9.8 15.6V8.4l6.4 3.6z"/></svg>'},NOMBRES_REDES={twitter:"X (Twitter)",instagram:"Instagram",tiktok:"TikTok",youtube:"YouTube"};function baseHref(){return"/"}function clubSubmenuHTML(e,t){return`<ul class="nav-flyout">${t.map(n=>`<li><a href="${baseHref()}categoria?cat=${encodeURIComponent(e)}&club=${encodeURIComponent(n)}">${n}</a></li>`).join("")}</ul>`}function clubesParaMenu(e){return e==="segunda_federacion"&&typeof CLUBS_SEGUNDA_FEDERACION_CUBIERTOS_PORTADA<"u"?CLUBS_SEGUNDA_FEDERACION_CUBIERTOS_PORTADA.slice().sort((t,a)=>t.localeCompare(a,"es")):typeof getClubsForCategoria=="function"?getClubsForCategoria(e):[]}function navMenuHTML(e){return NAV_MENU.map(t=>{if(t.tipo==="enlace"){const r=t.key===e?"activo":"";return`<li><a href="${baseHref()}${t.href}" class="${r}">${t.label}</a></li>`}const a=t.items.some(r=>r.key===e),n=t.items.map(r=>{const o=r.key===e?"activo":"",c=r.clubes?clubesParaMenu(r.key):[];return c.length?`
          <li class="nav-liga">
            <a href="${baseHref()}${r.href}" class="${o}">${r.label}</a>
            <button type="button" class="nav-liga-toggle" aria-label="Ver clubes de ${r.label}">▸</button>
            ${clubSubmenuHTML(r.key,c)}
          </li>`:`<li><a href="${baseHref()}${r.href}" class="${o}">${r.label}</a></li>`}).join("");return`
      <li class="nav-grupo">
        <button type="button" class="nav-grupo-btn ${a?"activo":""}" aria-haspopup="true" aria-expanded="false">${t.label}<span class="nav-caret" aria-hidden="true">▾</span></button>
        <ul class="nav-drop">${n}</ul>
      </li>`}).join("")}function iconosRedesHTML(){return Object.entries(SITE.redes).filter(([,e])=>urlExternaSegura(e)).map(([e,t])=>`<a href="${urlExternaSegura(t)}" target="_blank" rel="noopener" title="${escapeHtml(NOMBRES_REDES[e]||e)}">${ICONOS_REDES[e]||""}</a>`).join("")}function refrescarIconosRedes(){document.querySelectorAll(".redes-mini, .redes-footer").forEach(t=>{t.innerHTML=iconosRedesHTML()});const e=document.getElementById("redes-icons-portada");e&&(e.innerHTML=iconosRedesHTML())}async function cargarRedesSociales(){try{const e=await apiFetch("/api/settings");if(!e.ok)return;const{redes:t}=await e.json();t&&Object.keys(t).length&&(SITE.redes=t,refrescarIconosRedes())}catch{}}function sesionActual(){try{const e=localStorage.getItem("eof_token"),t=JSON.parse(localStorage.getItem("eof_user")||"null");return!e||!t?null:t}catch{return null}}function cerrarSesionGlobal(){localStorage.removeItem("eof_token"),localStorage.removeItem("eof_user"),location.reload()}function iniciales(e){return(e||"").trim().split(/\s+/).slice(0,2).map(t=>t[0]).join("").toUpperCase()}function avatarHTML(e,t="user-avatar"){if(e&&e.avatar_url){const a=urlSeguraParaCss(e.avatar_url);if(a)return`<span class="${t} user-avatar-foto foco-bg" style="background-image:url('${a}');${EOF_FOCO.estilo(e.avatar_foco)}"></span>`}return`<span class="${t}">${escapeHtml(iniciales(e&&e.nombre))||"?"}</span>`}const ICONOS_CUENTA={usuario:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',ajustes:'<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',panel:'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',guardadas:'<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',historial:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',seguridad:'<path d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/>',progreso:'<circle cx="12" cy="8" r="6"/><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5"/>',estadisticas:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',resumenMes:'<path d="M3 3v18h18"/><path d="M7 15v3"/><path d="M12 9v9"/><path d="M17 5v13"/>',sesiones:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',salir:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'};const SECCIONES_CUENTA=[["perfil","Editar perfil","usuario"],["seguridad","Seguridad","seguridad"],["progreso","Mi progreso","progreso"],["estadisticas","Estadísticas","estadisticas"],["resumenMes","Resumen del mes","resumenMes"],["sesiones","Dispositivos","sesiones"],["preferencias","Preferencias","ajustes"]];function iconoCuentaHTML(e){return`<span class="ud-ico" aria-hidden="true"><svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONOS_CUENTA[e]||""}</svg></span>`}function accesoHeaderHTML(){const e=sesionActual();return e?`
    <div class="user-menu" id="userMenu">
      <button type="button" class="btn-usuario" id="userMenuToggle" aria-label="Cuenta" aria-haspopup="true" aria-expanded="false">
        ${avatarHTML(e)}
        <span class="user-nombre">${escapeHtml(e.nombre||e.username)}</span>
      </button>
      <div class="user-dropdown" id="userDropdown">
        <div class="user-dropdown-info">
          ${avatarHTML(e,"user-avatar user-avatar-grande")}
          <div class="user-dropdown-textos">
            <strong>${escapeHtml(e.nombre||e.username)}</strong>
            <span>${e.rol==="admin"?"Responsable":e.rol==="fotografo"?"Fotógrafo":"Colaborador"}</span>
          </div>
        </div>
        <div class="ud-grupo">Mi cuenta</div>
        <div class="ud-secciones">${SECCIONES_CUENTA.map(([i,t,c])=>`<a href="${baseHref()}admin/panel.html?ajustes=${i}" class="ud-seccion">${iconoCuentaHTML(c)}${t}</a>`).join("")}</div>
        <div class="ud-sep" role="separator"></div>
        <a href="${baseHref()}admin/panel.html">${iconoCuentaHTML("panel")}Ir al panel</a>
        <div class="ud-sep" role="separator"></div>
        <button type="button" id="btnCerrarSesion">${iconoCuentaHTML("salir")}Cerrar sesión</button>
      </div>
    </div>`:""}function guardadasHeaderHTML(){return`<a href="${baseHref()}guardadas" class="theme-toggle lect-header-btn" aria-label="Mis guardadas" title="Mis guardadas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><span class="lect-badge" hidden></span></a>`}function pintarInsigniaGuardadas(){window.EOFLecturas&&typeof EOFLecturas.pintarInsignia=="function"&&EOFLecturas.pintarInsignia()}function accesoLectorHeaderHTML(){if(sesionActual())return"";const e=sesionLectorActual(),t=encodeURIComponent(location.pathname+location.search);return e?`
    <div class="user-menu" id="lectorMenu">
      <button type="button" class="btn-usuario" id="lectorMenuToggle" aria-label="Mi cuenta" aria-haspopup="true" aria-expanded="false">
        ${avatarHTML(e)}
        <span class="user-nombre">${escapeHtml(e.nombre)}</span>
      </button>
      <div class="user-dropdown" id="lectorDropdown">
        <div class="user-dropdown-info">
          ${avatarHTML(e,"user-avatar user-avatar-grande")}
          <div class="user-dropdown-textos">
            <strong>${escapeHtml(e.nombre)}</strong>
            <span>Lector</span>
          </div>
        </div>
        <a href="${baseHref()}cuenta">${iconoCuentaHTML("usuario")}Ajustes de cuenta</a>
        <a href="${baseHref()}cuenta?tab=guardadas">${iconoCuentaHTML("guardadas")}Guardadas</a>
        <a href="${baseHref()}cuenta?tab=historial">${iconoCuentaHTML("historial")}Historial</a>
        <a href="${baseHref()}cuenta?tab=preferencias">${iconoCuentaHTML("ajustes")}Preferencias</a>
        <div class="ud-sep" role="separator"></div>
        <button type="button" id="btnCerrarSesionLectorHeader">${iconoCuentaHTML("salir")}Cerrar sesión</button>
      </div>
    </div>`:`<a href="${baseHref()}acceso?volver=${t}" class="btn-login" aria-label="Acceso" title="Iniciar sesión o registrarte"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></a>`}function renderHeader(){const e=document.body.dataset.page||"",t=navMenuHTML(e);return`
    <div class="top-bar">
      <div class="wrap">
        <span id="fecha-hoy"></span>
        <div class="redes-mini">${iconosRedesHTML()}</div>
      </div>
    </div>

    <header class="main-header">
      <div class="wrap">
        <a href="${baseHref()}" class="brand">
          <img class="brand-logo brand-logo-claro" src="${baseHref()}img/logo-blanco.png" alt="ELOTROFÚTBOLTV - logo oficial">
          <img class="brand-logo brand-logo-oscuro" src="${baseHref()}img/logo.png" alt="" aria-hidden="true">
          <span class="brand-text">EL<span class="brand-rojo">OTROFÚTBOL</span>TV</span>
        </a>
        <div class="search-box" id="searchBox">
          <input type="search" id="searchInput" autocomplete="off" enterkeyhint="search" aria-label="Buscar noticias y crónicas" placeholder="Buscar noticias, crónicas...">
          <div class="search-resultados" id="searchResultados"></div>
        </div>
        <div class="header-right">
          <button type="button" class="theme-toggle" id="themeToggle" aria-label="Cambiar a modo oscuro" title="Modo oscuro/claro">
            <svg class="theme-icon-luna" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
            <svg class="theme-icon-sol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/></svg>
          </button>
          <a class="btn-instalar-app" href="${baseHref()}instalar" title="Instalar la app en tu móvil u ordenador"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7.5 10.5L12 15l4.5-4.5M5 20h14"/></svg><span>Instalar app</span></a>
          ${guardadasHeaderHTML()}
          ${accesoHeaderHTML()}
          ${accesoLectorHeaderHTML()}
          <button type="button" class="nav-toggle" id="navToggle" aria-label="Abrir menú de navegación" aria-controls="navList" aria-expanded="false">☰</button>
        </div>
      </div>
    </header>

    <nav class="main-nav">
      <ul id="navList">${t}</ul>
    </nav>
  `}function renderBloqueNewsletter(){return estadoModalNewsletter().suscrito?`
        <div class="newsletter-bloque newsletter-bloque-suscrito">
          <div class="newsletter-texto">
            <p class="footer-titulo">¡Ya estás dentro del boletín! 📬</p>
            <p>Gracias por suscribirte. Cada semana te llega a tu correo un resumen con lo más destacado.</p>
            <button type="button" class="newsletter-olvidar-suscripcion" id="btnOlvidarSuscripcionNewsletter">¿Ya no recibes el boletín? Pulsa aquí</button>
          </div>
        </div>`:`
        <div class="newsletter-bloque">
          <div class="newsletter-texto">
            <p class="footer-titulo">Boletín semanal</p>
            <p>Recibe cada semana un resumen con lo más destacado, directo a tu correo.</p>
          </div>
          <form class="newsletter-form" id="newsletterForm">
            <input type="email" id="newsletterEmail" placeholder="Tu correo electrónico" required autocomplete="email">
            <div data-eof-turnstile style="margin:.4rem 0 0"></div>
            <button type="submit">Suscribirme</button>
          </form>
        </div>`}function renderFooter_actualizarBloqueNewsletter(){const e=document.querySelector("#site-footer .newsletter-bloque, #site-footer .newsletter-bloque-suscrito");e&&(e.outerHTML=renderBloqueNewsletter(),inicializarFormularioNewsletter())}function renderPatrocinadoresFooterHTML(){if(!PATROCINADORES||!PATROCINADORES.length)return"";const e=a=>`<a href="${a.url||"#"}" target="_blank" rel="noopener sponsored" title="${escapeHtml(a.nombre)}">
        <img src="${baseHref()}${a.logo}" alt="${escapeHtml(a.nombre)}" loading="lazy">
      </a>`;return`
    <div class="patrocinadores-footer" id="patrocinadores">
      <span class="patrocinadores-footer-label">Con el apoyo de</span>
      <div class="patrocinadores-footer-carrusel">
        <div class="patrocinadores-footer-track">${[...PATROCINADORES,...PATROCINADORES].map(e).join("")}</div>
      </div>
    </div>`}const PATROCINADORES_FOOTER_VELOCIDAD_PXS=18;function inicializarCarruselPatrocinadoresFooter(){const e=document.querySelector(".patrocinadores-footer-carrusel"),t=document.querySelector(".patrocinadores-footer-track");if(!e||!t||!PATROCINADORES||!PATROCINADORES.length)return;const a=s=>`<a href="${s.url||"#"}" target="_blank" rel="noopener sponsored" title="${escapeHtml(s.nombre)}">
        <img src="${baseHref()}${s.logo}" alt="${escapeHtml(s.nombre)}" loading="lazy">
      </a>`;t.innerHTML=PATROCINADORES.map(a).join("");const n=t.scrollWidth||1,r=e.clientWidth||0,o=Math.max(2,Math.ceil(r*2/n));t.innerHTML=Array(o).fill(PATROCINADORES.map(a).join("")).join("");const i=o/2*n/PATROCINADORES_FOOTER_VELOCIDAD_PXS;t.style.animationDuration=`${i}s`}function renderFooter(){const e=iconosRedesHTML(),t=renderBloqueNewsletter(),a=renderPatrocinadoresFooterHTML();return`
    <footer>
      <div class="wrap">
        ${t}
        ${a}
        <div id="modalNewsletter" class="modal-newsletter" aria-hidden="true">
          <div class="modal-newsletter-fondo" onclick="cerrarModalNewsletter()"></div>
          <div class="modal-newsletter-caja" role="dialog" aria-modal="true" aria-labelledby="modalNewsletterTitulo" aria-describedby="modalNewsletterDesc" tabindex="-1">
            <button type="button" class="modal-newsletter-cerrar" onclick="cerrarModalNewsletter()" aria-label="Cerrar">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>

            <div class="modal-newsletter-cabecera">
              <svg class="modal-newsletter-campo" viewBox="0 0 460 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
                <g fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="230" y1="-4" x2="230" y2="244"/>
                  <circle cx="230" cy="120" r="64"/>
                  <rect x="-4" y="52" width="86" height="136"/>
                  <rect x="-4" y="88" width="32" height="64"/>
                  <rect x="378" y="52" width="86" height="136"/>
                  <rect x="432" y="88" width="32" height="64"/>
                </g>
                <circle cx="230" cy="120" r="4" fill="currentColor"/>
              </svg>
              <div class="modal-newsletter-sello">
                <svg class="modal-newsletter-sobre" viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7.2l8.5 6.3 8.5-6.3"/></svg>
                <svg class="modal-newsletter-balon" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#0c1b2e" stroke-width="1.5"/><path d="M12 7.2l3.6 2.6-1.4 4.2H9.8L8.4 9.8z" fill="#0c1b2e"/><path d="M12 7.2V2M15.6 9.8L20.6 8M14.2 14l3 4.2M9.8 14l-3 4.2M8.4 9.8L3.4 8" stroke="#0c1b2e" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>
              </div>
              <div id="modalNewsletterTitulo" class="t-h3">No te pierdas nada</div>
              <p id="modalNewsletterDesc" class="modal-newsletter-sub">Tu jornada de fútbol no profesional, cada semana en tu correo.</p>
            </div>

            <div class="modal-newsletter-cuerpo">
              <ul class="modal-newsletter-ventajas">
                <li>
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="currentColor" opacity=".14"/><path d="M7.5 12.4l3 3 6-6.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span><strong>Lo más destacado</strong> de LaLiga Hypermotion, Primera y Segunda Federación.</span>
                </li>
                <li>
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="currentColor" opacity=".14"/><path d="M7.5 12.4l3 3 6-6.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span><strong>Un solo correo</strong> a la semana con el resumen de resultados y crónicas.</span>
                </li>
                <li>
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="currentColor" opacity=".14"/><path d="M7.5 12.4l3 3 6-6.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span><strong>Sin spam.</strong> Te das de baja cuando quieras.</span>
                </li>
              </ul>

              <form class="newsletter-form modal-newsletter-form" id="modalNewsletterForm">
                <label class="modal-newsletter-etiqueta" for="modalNewsletterEmail">Correo electrónico</label>
                <div class="modal-newsletter-campo-email">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7.2l8.5 6.3 8.5-6.3"/></svg>
                  <input type="email" id="modalNewsletterEmail" placeholder="tucorreo@ejemplo.com" required autocomplete="email" inputmode="email">
                </div>
                <p class="modal-newsletter-error" id="modalNewsletterError" role="alert" hidden></p>
                <div data-eof-turnstile style="margin:.4rem 0"></div>
                <button type="submit">Quiero suscribirme</button>
              </form>
              <button type="button" class="modal-newsletter-omitir" onclick="cerrarModalNewsletter()">Ahora no, gracias</button>
              <p class="modal-newsletter-legal">Al suscribirte aceptas nuestra <a href="${baseHref()}politica-privacidad">política de privacidad</a>.</p>
            </div>

            <div class="modal-newsletter-exito" role="status" hidden>
              <div class="modal-newsletter-exito-icono">
                <svg viewBox="0 0 52 52" width="52" height="52" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="nl-check" d="M14 27.5l8.5 8.5L38.5 18"/></svg>
              </div>
              <div class="t-h3">¡Ya estás dentro!</div>
              <p>Cada semana recibirás el resumen en tu correo.</p>
            </div>
          </div>
        </div>
        <div class="footer-grid">
          <div class="footer-col-brand">
            <a class="footer-brand" href="${baseHref()}" aria-label="ELOTROFÚTBOLTV - ir a la portada">
              <span class="footer-brand-logo"><img src="${baseHref()}img/logo.png" alt="" width="46" height="46"></span>
              <span class="footer-brand-nombre">EL<span class="brand-rojo">OTROFÚTBOL</span><span class="footer-brand-tv">TV</span></span>
            </a>
            <p>Crónicas, noticias y resultados del fútbol no profesional español: LaLiga Hypermotion, Primera y Segunda Federación.</p>
            <div class="redes-footer">${e}</div>
          </div>
          <div>
            <p class="footer-titulo">Secciones</p>
            <ul>
              <li><a href="${baseHref()}categoria?cat=hypermotion">LaLiga Hypermotion</a></li>
              <li><a href="${baseHref()}categoria?cat=primera_federacion">Primera Federación</a></li>
              <li><a href="${baseHref()}categoria?cat=segunda_federacion">Segunda Federación</a></li>
              <li><a href="${baseHref()}categoria?cat=tercera_federacion">Tercera Federación</a></li>
              <li><a href="${baseHref()}categoria?cat=copa_del_rey">Copa del Rey</a></li>
              <li><a href="${baseHref()}categoria?cat=copa_federacion">Copa Federación</a></li>
              <li><a href="${baseHref()}categoria?cat=arbitraje">Arbitraje</a></li>
              <li><a href="${baseHref()}categoria?cat=jurisdiccion">Jurisdicción deportiva</a></li>
            </ul>
          </div>
          <div>
            <p class="footer-titulo">Resultados</p>
            <ul>
              <li><a href="${baseHref()}calendario">Calendario</a></li>
              <li><a href="${baseHref()}clasificacion">Clasificación</a></li>
              <li><a href="${baseHref()}estadisticas">Estadísticas</a></li>
              <li><a href="${baseHref()}predicciones">Porras</a></li>
              <li><a href="${baseHref()}noticias-rapidas">Noticias rápidas</a></li>
              <li><a href="${baseHref()}galerias">Galería de contenido</a></li>
              <li><a href="${baseHref()}resumenes">Resúmenes y vídeos</a></li>
              <li><a href="${baseHref()}podcast">Podcast</a></li>
              <li><a href="${baseHref()}buscar">Buscar noticias</a></li>
              <li><a href="${baseHref()}guardadas">Mis guardadas</a></li>
            </ul>
          </div>
          <div>
            <p class="footer-titulo">El medio</p>
            <ul>
              <li><a href="${baseHref()}">Portada</a></li>
              <li><a href="${baseHref()}quienes-somos">Quiénes somos</a></li>
              <li><a href="${baseHref()}linea-editorial">Línea editorial</a></li>
              <li><a href="${baseHref()}contacto">Contacto de prensa</a></li>
              <li><a href="${baseHref()}widgets">Widgets para tu web</a></li>
              <li><a href="${baseHref()}instalar">Instalar la app</a></li>
              <li><a href="${baseHref()}transparencia">Portal de transparencia</a></li>
              <li><a href="${baseHref()}estado">Estado del servicio</a></li>
              <li><a href="${baseHref()}mapa-del-sitio">Mapa del sitio</a></li>
              <li><a href="${baseHref()}acceso">Acceso</a></li>
            </ul>
          </div>
          <div>
            <p class="footer-titulo">Legal</p>
            <ul>
              <li><a href="${baseHref()}aviso-legal">Aviso legal</a></li>
              <li><a href="${baseHref()}politica-privacidad">Política de privacidad</a></li>
              <li><a href="${baseHref()}politica-cookies">Política de cookies</a></li>
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
  `}function pintarFechaHoy(){const e=document.getElementById("fecha-hoy");e&&(e.textContent=new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Madrid"}))}const UH_INTERVALO_COMPROBACION_MS=6e4;async function cargarBannerUrgente(){if(!eofCookiesAceptadasAhora()){quitarBannerUrgenteDelDOM();return}try{const e=await apiFetch("/api/articles/banner-urgente");if(!e||!e.ok)return;const t=await e.json(),a=document.getElementById("banner-ultima-hora");if(!t||!t.activo){a&&quitarBannerUrgenteDelDOM();return}if(sessionStorage.getItem("bannerUrgenteCerradoUrl")===t.url)return;if(a){if(a.dataset.uhUrl===t.url)return;quitarBannerUrgenteDelDOM()}pintarBannerUrgente(t)}catch(e){console.error("Error cargando banner de última hora:",e)}}function quitarBannerUrgenteDelDOM(){const e=document.getElementById("banner-ultima-hora");e&&(e.remove(),document.body.classList.remove("con-banner-ultima-hora"))}function pintarBannerUrgente(e){if(document.getElementById("banner-ultima-hora"))return;const t=document.createElement("div");t.id="banner-ultima-hora";const a=(()=>{const o=String(e.url==null?"":e.url).trim();return/^(\/(?!\/)|https?:\/\/)/i.test(o)?o:"#"})();t.dataset.uhUrl=a,t.innerHTML=`
    <div class="uh-franja">
      <span class="uh-live">
        <span class="uh-live-punto" aria-hidden="true"></span>
        ÚLTIMA HORA
      </span>
      <div class="uh-texto-wrap">
        <a class="uh-texto" href="${escaparHtmlBasico(a)}">${escaparHtmlBasico(e.titulo)}</a>
      </div>
      <a class="uh-ver" href="${escaparHtmlBasico(a)}">Leer <span aria-hidden="true">→</span></a>
      <button type="button" class="uh-cerrar" aria-label="Cerrar aviso de última hora">✕</button>
    </div>
  `,document.body.prepend(t),document.body.classList.add("con-banner-ultima-hora");const n=t.querySelector(".uh-texto-wrap"),r=t.querySelector(".uh-texto");requestAnimationFrame(()=>{r.scrollWidth>n.clientWidth&&t.classList.add("uh-marquee")}),t.querySelector(".uh-cerrar").addEventListener("click",()=>{quitarBannerUrgenteDelDOM(),sessionStorage.setItem("bannerUrgenteCerradoUrl",e.url)})}function escaparHtmlBasico(e){const t=document.createElement("div");return t.textContent=e||"",t.innerHTML}function montarEnlaceSaltarContenido(){if(document.getElementById("eof-saltar-contenido"))return;const e=document.querySelector("main");if(!e)return;e.id||(e.id="contenido-principal"),e.hasAttribute("tabindex")||e.setAttribute("tabindex","-1");const t=document.createElement("style");t.textContent="#eof-saltar-contenido{position:fixed;top:8px;left:8px;z-index:100000;padding:10px 16px;background:#111;color:#fff;font:600 14px/1.2 system-ui,sans-serif;border-radius:8px;text-decoration:none;transform:translateY(-200%);transition:transform .15s}#eof-saltar-contenido:focus{transform:translateY(0);outline:3px solid #ffbf47;outline-offset:2px}main:focus{outline:none}",document.head.appendChild(t);const a=document.createElement("a");a.id="eof-saltar-contenido",a.href="#"+e.id,a.textContent="Saltar al contenido",a.addEventListener("click",()=>{setTimeout(()=>e.focus({preventScroll:!1}),0)}),document.body.insertBefore(a,document.body.firstChild)}document.addEventListener("DOMContentLoaded",()=>{montarEnlaceSaltarContenido();const e=document.getElementById("site-header"),t=document.getElementById("site-footer");if(e&&(e.innerHTML=renderHeader()),pintarInsigniaGuardadas(),t&&(t.innerHTML=renderFooter()),!document.querySelector('script[src*="js/offline.js"]')){const o=document.createElement("script");o.src="/js/offline.js?v=c9fa79be",o.defer=!0,document.head.appendChild(o)}if(!document.querySelector('script[src*="js/push.js"]')){const o=document.createElement("script");o.src="/js/push.js?v=ab6a3bae",o.defer=!0,document.head.appendChild(o)}inicializarCarruselPatrocinadoresFooter();let a;window.addEventListener("resize",()=>{clearTimeout(a),a=setTimeout(inicializarCarruselPatrocinadoresFooter,200)}),pintarFechaHoy(),/(^|\/)acceso(\.html)?(\/)?$/.test(location.pathname)||(eofAlAceptarCookies(cargarBannerUrgente),setInterval(cargarBannerUrgente,UH_INTERVALO_COMPROBACION_MS)),document.addEventListener("eof:cookies-rechazadas",()=>{quitarBannerUrgenteDelDOM()}),e&&typeof cargarCustomClubs=="function"&&cargarCustomClubs().then(()=>{e.innerHTML=renderHeader(),pintarInsigniaGuardadas(),pintarFechaHoy(),reengancharMenu(),inicializarBusquedaEnVivo()}),reengancharMenu();const r=document.getElementById("redes-icons-portada");r&&(r.innerHTML=iconosRedesHTML()),cargarRedesSociales(),inicializarBusquedaEnVivo(),inicializarMenuUsuario(),inicializarMenuLector(),inicializarToggleTema(),inicializarFormularioNewsletter(),inicializarModalNewsletter()});function eofCookiesAceptadasAhora(){return!!(window.EOF_CONSENTIMIENTO_ANALITICA||window.EOF_CONSENTIMIENTO_PUBLICIDAD)}function eofCookiesDecididasAhora(){return!!window.EOF_COOKIES_DECIDIDO||eofCookiesAceptadasAhora()}function eofAlDecidirCookies(e){eofCookiesDecididasAhora()&&e(),document.addEventListener("eof:cookies-decididas",e),document.addEventListener("eof:cookies-aceptadas",e)}function eofAlAceptarCookies(e){eofCookiesAceptadasAhora()&&e(),document.addEventListener("eof:cookies-aceptadas",e)}const NEWSLETTER_MODAL_CLAVE="eof_newsletter_modal",NEWSLETTER_MODAL_RETRASO_PRIMERA_VEZ_MS=700,NEWSLETTER_MODAL_RETRASO_SEGUNDA_VEZ_MS=45e3,NEWSLETTER_MODAL_EXITO_MS=2600;function estadoModalNewsletter(){try{return JSON.parse(localStorage.getItem(NEWSLETTER_MODAL_CLAVE))||{veces:0,suscrito:!1}}catch{return{veces:0,suscrito:!1}}}function guardarEstadoModalNewsletter(e){try{localStorage.setItem(NEWSLETTER_MODAL_CLAVE,JSON.stringify(e))}catch{}}function abrirModalNewsletter(){const e=document.getElementById("modalNewsletter");if(!e||!eofCookiesDecididasAhora()||(e.parentElement!==document.body&&document.body.appendChild(e),document.querySelector(".modal-partido.abierto, #eof-cookies-aviso")))return!1;e.classList.add("abierto"),e.setAttribute("aria-hidden","false");const t=e.querySelector(".modal-newsletter-caja");return t&&t.focus({preventScroll:!0}),!0}function cerrarModalNewsletter(){const e=document.getElementById("modalNewsletter");e&&(e.classList.remove("abierto"),e.setAttribute("aria-hidden","true"))}function mostrarExitoModalNewsletter(){const e=document.querySelector("#modalNewsletter .modal-newsletter-caja");if(!e)return;e.classList.add("modal-newsletter-caja--exito");const t=e.querySelector(".modal-newsletter-cabecera"),a=e.querySelector(".modal-newsletter-cuerpo"),n=e.querySelector(".modal-newsletter-exito");t&&(t.hidden=!0),a&&(a.hidden=!0),n&&(n.hidden=!1)}function inicializarModalNewsletter(){const e=document.getElementById("modalNewsletter"),t=document.getElementById("modalNewsletterForm");if(!e||!t)return;e.parentElement!==document.body&&document.body.appendChild(e),eofPrecalentarNewsletter(t);const a=estadoModalNewsletter();if(!a.suscrito&&a.veces<2){let n=!1;eofAlDecidirCookies(()=>{if(n)return;const r=estadoModalNewsletter();if(r.suscrito||r.veces>=2)return;n=!0;const o=r.veces===0?NEWSLETTER_MODAL_RETRASO_PRIMERA_VEZ_MS:NEWSLETTER_MODAL_RETRASO_SEGUNDA_VEZ_MS;setTimeout(()=>{const c=estadoModalNewsletter();if(!(c.suscrito||c.veces>=2)){if(!eofCookiesDecididasAhora()){n=!1;return}abrirModalNewsletter()&&guardarEstadoModalNewsletter({...c,veces:c.veces+1})}},o)})}document.addEventListener("keydown",n=>{n.key==="Escape"&&e.classList.contains("abierto")&&cerrarModalNewsletter()}),t.addEventListener("submit",async n=>{n.preventDefault();const r=document.getElementById("modalNewsletterEmail"),o=document.getElementById("modalNewsletterError"),c=(r.value||"").trim();if(o&&(o.hidden=!0,o.textContent=""),!c){o&&(o.textContent="Escribe tu correo electrónico.",o.hidden=!1),r.focus();return}const i=t.querySelector('button[type="submit"]'),s=i.textContent;i.disabled=!0,i.textContent="Enviando...";try{const l=await eofTokenNewsletter(t),d=await apiFetch("/api/newsletter/suscribir",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:c,turnstileToken:l.token,web:l.web})});if(window.EOFTurnstile&&window.EOFTurnstile.reiniciar(l.cont),!d.ok){const m=await d.json().catch(()=>({}));throw new Error(m.error||"No se pudo completar la suscripción")}guardarEstadoModalNewsletter({...estadoModalNewsletter(),suscrito:!0}),mostrarExitoModalNewsletter(),renderFooter_actualizarBloqueNewsletter(),setTimeout(cerrarModalNewsletter,NEWSLETTER_MODAL_EXITO_MS)}catch(l){o?(o.textContent=l.message||"No se pudo completar la suscripción",o.hidden=!1):window.EOF&&EOF.toast&&EOF.toast(l.message||"No se pudo completar la suscripción","error")}finally{i.disabled=!1,i.textContent=s}})}function inicializarToggleTema(){document.body.dataset.temaDelegado||(document.body.dataset.temaDelegado="1",document.addEventListener("click",e=>{if(!e.target.closest("#themeToggle"))return;const n=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";if(window.EOFTema){window.EOFTema.fijar(n);return}n==="dark"?document.documentElement.setAttribute("data-theme","dark"):document.documentElement.removeAttribute("data-theme");try{localStorage.setItem("eof_tema",n)}catch{}}))}function inicializarFormularioNewsletter(){const e=document.getElementById("newsletterForm"),t=document.getElementById("btnOlvidarSuscripcionNewsletter");t&&t.addEventListener("click",()=>{guardarEstadoModalNewsletter({veces:estadoModalNewsletter().veces,suscrito:!1}),window.EOF&&EOF.toast&&EOF.toast("Listo. Ya puedes volver a suscribirte cuando quieras.","exito"),renderFooter_actualizarBloqueNewsletter()}),e&&(eofPrecalentarNewsletter(e),e.addEventListener("submit",async a=>{a.preventDefault();const n=document.getElementById("newsletterEmail"),r=(n.value||"").trim();if(!r)return;const o=e.querySelector("button"),c=o.textContent;o.disabled=!0,o.textContent="Enviando...";try{const i=await eofTokenNewsletter(e),s=await apiFetch("/api/newsletter/suscribir",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:r,turnstileToken:i.token,web:i.web})});if(window.EOFTurnstile&&window.EOFTurnstile.reiniciar(i.cont),!s.ok){const l=await s.json().catch(()=>({}));throw new Error(l.error||"No se pudo completar la suscripción")}n.value="",guardarEstadoModalNewsletter({...estadoModalNewsletter(),suscrito:!0}),window.EOF&&EOF.toast&&EOF.toast("¡Suscripción realizada! Revisa tu correo cada semana.","exito"),renderFooter_actualizarBloqueNewsletter()}catch(i){window.EOF&&EOF.toast&&EOF.toast(i.message||"No se pudo completar la suscripción","error")}finally{o.disabled=!1,o.textContent=c}}))}function reengancharMenu(){const e=document.getElementById("navToggle"),t=document.getElementById("navList");e&&t&&e.addEventListener("click",()=>t.classList.toggle("abierta"));const a=()=>window.innerWidth>900&&window.matchMedia("(hover: hover)").matches,n=r=>{document.querySelectorAll("nav.main-nav .abierto").forEach(o=>{if(r&&(o===r||o.contains(r)||r.contains(o)))return;o.classList.remove("abierto");const c=o.querySelector(":scope > .nav-grupo-btn");c&&c.setAttribute("aria-expanded","false")})};document.querySelectorAll(".nav-grupo-btn").forEach(r=>{r.addEventListener("click",o=>{if(o.preventDefault(),o.stopPropagation(),a())return;const c=r.closest("li"),i=c.classList.contains("abierto");n(),i||(c.classList.add("abierto"),r.setAttribute("aria-expanded","true"))})}),document.querySelectorAll(".nav-liga-toggle").forEach(r=>{r.addEventListener("click",o=>{if(o.preventDefault(),o.stopPropagation(),a())return;const c=r.closest("li"),i=c.classList.contains("abierto");c.parentElement.querySelectorAll(":scope > li.nav-liga.abierto").forEach(s=>s.classList.remove("abierto")),i||c.classList.add("abierto")})})}document.addEventListener("click",e=>{e.target.closest(".nav-grupo")||(document.querySelectorAll("nav.main-nav .abierto").forEach(t=>t.classList.remove("abierto")),document.querySelectorAll(".nav-grupo-btn[aria-expanded=true]").forEach(t=>t.setAttribute("aria-expanded","false")))});function inicializarMenuUsuario(){document.getElementById("userMenu")&&(window.__menuUsuarioListenersListos||(window.__menuUsuarioListenersListos=!0,document.addEventListener("click",e=>{const t=e.target.closest("#userMenuToggle"),a=document.getElementById("userDropdown");if(!a)return;if(t){e.stopPropagation(),a.classList.toggle("abierto"),t.setAttribute("aria-expanded",String(a.classList.contains("abierto")));return}if(e.target.closest("#btnCerrarSesion")){cerrarSesionGlobal();return}const n=document.getElementById("userMenu");if(n&&!n.contains(e.target)){a.classList.remove("abierto");const r=document.getElementById("userMenuToggle");r&&r.setAttribute("aria-expanded","false")}}),document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;const t=document.getElementById("userDropdown");if(!t||!t.classList.contains("abierto"))return;t.classList.remove("abierto");const a=document.getElementById("userMenuToggle");a&&(a.setAttribute("aria-expanded","false"),a.focus())})))}function inicializarMenuLector(){window.__menuLectorListenersListos||(window.__menuLectorListenersListos=!0,document.addEventListener("click",async e=>{const t=e.target.closest("#lectorMenuToggle"),a=document.getElementById("lectorDropdown");if(!a)return;if(t){e.stopPropagation(),a.classList.toggle("abierto"),t.setAttribute("aria-expanded",String(a.classList.contains("abierto")));return}if(e.target.closest("#btnCerrarSesionLectorHeader")){await cerrarSesionLector(),location.reload();return}const n=document.getElementById("lectorMenu");if(n&&!n.contains(e.target)){a.classList.remove("abierto");const r=document.getElementById("lectorMenuToggle");r&&r.setAttribute("aria-expanded","false")}}),document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;const t=document.getElementById("lectorDropdown");if(!t||!t.classList.contains("abierto"))return;t.classList.remove("abierto");const a=document.getElementById("lectorMenuToggle");a&&(a.setAttribute("aria-expanded","false"),a.focus())}))}let __busquedaClickFueraListo=!1;function inicializarBusquedaEnVivo(){const e=document.getElementById("searchInput"),t=document.getElementById("searchResultados");if(!e||!t)return;let a,n;if(!e.value&&/\/buscar(\.html)?$/.test(location.pathname)){const i=new URLSearchParams(location.search).get("q");i&&(e.value=i)}e.addEventListener("input",()=>{clearTimeout(a);const i=e.value.trim();if(!i){n&&n.abort(),t.classList.remove("visible"),t.innerHTML="";return}a=setTimeout(()=>r(i),250)});async function r(i){n&&n.abort(),n=new AbortController,t.classList.add("visible"),t.innerHTML='<div class="search-cargando">Buscando...</div>';const d=(typeof buscarClubesPorTexto=="function"?buscarClubesPorTexto(i):[]).slice(0,5),m=d.map(u=>`
      <a class="search-item search-item-club" href="${baseHref()}categoria?cat=${encodeURIComponent(u.categoria)}&club=${encodeURIComponent(u.nombre)}">
        <span class="search-item-cat">Ficha del equipo</span>
        <span class="search-item-titulo">${escapeHtml(u.nombre)}</span>
      </a>`).join("");try{const u=await apiFetch(`/api/articles?q=${encodeURIComponent(i)}&limit=6`,{signal:n.signal}),{articles:h=[],busqueda:p=null}=await u.json();if(e.value.trim()!==i)return;if(!h.length&&!d.length){t.innerHTML=`<div class="search-vacio">Sin resultados para "${escapeHtml(i)}"</div>`;return}const g=p&&p.corregido?`<div class="search-vacio">Mostrando resultados para <strong>${escapeHtml(p.corregido)}</strong></div>`:"";t.innerHTML=g+m+h.map(f=>`
        <a class="search-item" href="${urlNoticia(f.categoria,f.slug)}">
          <span class="search-item-cat">${categoriaLabel(f.categoria)}</span>
          <span class="search-item-titulo">${escapeHtml(f.titulo)}</span>
        </a>`).join("")+`<a class="search-vermas" href="${baseHref()}buscar?q=${encodeURIComponent(i)}&todos=1">Ver todos los resultados →</a>`}catch(u){if(u.name==="AbortError")return;t.innerHTML=m||'<div class="search-vacio">No se ha podido buscar. Inténtalo de nuevo.</div>'}}const o=()=>[...t.querySelectorAll("a.search-item, a.search-vermas")],c=(i,s)=>{i.forEach((l,d)=>l.classList.toggle("search-activo",d===s)),i[s]&&i[s].scrollIntoView({block:"nearest"})};e.addEventListener("keydown",i=>{const s=t.classList.contains("visible")?o():[],l=s.findIndex(d=>d.classList.contains("search-activo"));if(i.key==="ArrowDown"&&s.length){i.preventDefault(),c(s,l+1>=s.length?0:l+1);return}if(i.key==="ArrowUp"&&s.length){i.preventDefault(),c(s,l<=0?s.length-1:l-1);return}if(i.key==="Enter"&&l>=0){i.preventDefault(),s[l].click();return}if(i.key==="Enter"&&e.value.trim()){const d=typeof buscarClubesPorTexto=="function"?buscarClubesPorTexto(e.value.trim()):[];d.length===1?location.href=`${baseHref()}categoria?cat=${encodeURIComponent(d[0].categoria)}&club=${encodeURIComponent(d[0].nombre)}`:location.href=`${baseHref()}buscar?q=${encodeURIComponent(e.value.trim())}&todos=1`}i.key==="Escape"&&(t.classList.remove("visible"),e.blur())}),__busquedaClickFueraListo||(__busquedaClickFueraListo=!0,document.addEventListener("click",i=>{const s=document.getElementById("searchBox"),l=document.getElementById("searchResultados");s&&l&&!s.contains(i.target)&&l.classList.remove("visible")}))}
