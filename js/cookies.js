const EOF_COOKIES_STORAGE_KEY="eof_consentimiento_cookies",EOF_COOKIES_VERSION="1";window.EOF_CONSENTIMIENTO_ANALITICA=!1,window.EOF_CONSENTIMIENTO_PUBLICIDAD=!1,window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments)}window.eofGtagConsentMode=gtag,gtag("consent","default",{ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied",analytics_storage:"denied",wait_for_update:500});const EOF_CMP_GOOGLE={activo:!1,editorId:"pub-7347856722927942",esperaMs:6e3};(function(){if(!EOF_CMP_GOOGLE.activo)return;let o=!1;try{o=location.pathname.startsWith("/admin")||new URLSearchParams(location.search).get("preview")==="1"}catch{}if(o)return;window.EOF_CMP_EXTERNO=!0;const t=document.createElement("script");t.async=!0,t.src="https://fundingchoicesmessages.google.com/i/"+encodeURIComponent(EOF_CMP_GOOGLE.editorId)+"?ers=1",document.head.appendChild(t),(function i(){if(window.frames.googlefcPresent)return;if(!document.body)return setTimeout(i,0);const a=document.createElement("iframe");a.name="googlefcPresent",a.style.cssText="width:0;height:0;border:none;z-index:-1000;left:-1000px;top:-1000px;display:none;",document.body.appendChild(a)})(),setTimeout(()=>{typeof window.__tcfapi!="function"&&(window.EOF_CMP_EXTERNO=!1,typeof eofCookiesInit=="function"&&eofCookiesInit())},EOF_CMP_GOOGLE.esperaMs)})();function eofCookiesLeerPreferencias(){try{const e=JSON.parse(localStorage.getItem(EOF_COOKIES_STORAGE_KEY)||"null");return!e||e.version!=="1"?null:e}catch{return null}}function eofCookiesGuardarPreferencias(e,o){const t={version:"1",necesarias:!0,analiticas:!!e,publicidad:!!o,fecha:new Date().toISOString()};try{localStorage.setItem(EOF_COOKIES_STORAGE_KEY,JSON.stringify(t))}catch{}return t}function eofCookiesAplicarConsentimiento(e,o){window.EOF_CONSENTIMIENTO_ANALITICA=!!e,window.EOF_CONSENTIMIENTO_PUBLICIDAD=!!o,window.EOF_COOKIES_DECIDIDO=!0,gtag("consent","update",{analytics_storage:e?"granted":"denied",ad_storage:o?"granted":"denied",ad_user_data:o?"granted":"denied",ad_personalization:o?"granted":"denied"}),document.dispatchEvent(new CustomEvent("eof:consentimiento-analitica",{detail:{concedido:!!e}})),document.dispatchEvent(new CustomEvent("eof:consentimiento-publicidad",{detail:{concedido:!!o}})),document.dispatchEvent(new CustomEvent("eof:cookies-decididas")),document.dispatchEvent(new CustomEvent(e||o?"eof:cookies-aceptadas":"eof:cookies-rechazadas")),o&&typeof initAds=="function"&&initAds()}function eofCookiesBannerHTML(){return`
    <div id="eof-cookies-aviso" role="dialog" aria-modal="true" aria-labelledby="eofckTitulo" aria-describedby="eofckTexto">
      <div class="eofck-tarjeta" tabindex="-1">
        <div class="eofck-icono" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5z"/><path d="M8.5 8.5v.01M16 15.5v.01M12 12v.01M11 17v.01M7 14v.01"/></svg>
        </div>
        <div id="eofckTitulo" class="eofck-titulo t-h2">Tu privacidad, tú decides</div>
        <p id="eofckTexto" class="eofck-texto">
          Usamos cookies propias y de terceros para que el sitio funcione, medir
          la audiencia y mostrar publicidad (también personalizada, a través de
          Google y sus socios). Puedes aceptarlas todas, rechazar las no
          necesarias o elegir cuáles permites.
        </p>
        <div class="eofck-botones">
          <button type="button" class="eofck-btn eofck-aceptar" onclick="eofCookiesAceptarTodo()">Aceptar todas</button>
          <button type="button" class="eofck-btn eofck-rechazar" onclick="eofCookiesRechazarTodo()">Rechazar no necesarias</button>
          <button type="button" class="eofck-btn eofck-config" onclick="eofCookiesAbrirModal()">Configurar preferencias</button>
        </div>
        <p class="eofck-legal">Más información en nuestra <a href="${eofCookiesBaseHref()}politica-cookies.html">política de cookies</a>.</p>
      </div>
    </div>`}function eofCookiesInyectarEstilos(){if(document.getElementById("eofck-estilos"))return;const e=document.createElement("style");e.id="eofck-estilos",e.textContent=`
    html.eofck-abierto, html.eofck-abierto body{overflow:hidden !important;}
    #eof-cookies-aviso{
      position:fixed; inset:0; z-index:9999; box-sizing:border-box;
      display:flex; align-items:center; justify-content:center;
      padding:max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
      background:rgba(6,10,18,.66);
      -webkit-backdrop-filter:blur(7px); backdrop-filter:blur(7px);
      overflow-y:auto; -webkit-overflow-scrolling:touch;
      animation:eofckFondo .3s ease both;
    }
    .eofck-tarjeta{
      position:relative; box-sizing:border-box; width:100%; max-width:620px; margin:auto;
      padding:44px 44px 32px; text-align:center; overflow:hidden; outline:none;
      background:var(--tarjeta,#fff); color:var(--texto,#1a1c22);
      border-radius:28px;
      box-shadow:0 34px 90px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.07);
      animation:eofckEntra .5s cubic-bezier(.2,.85,.25,1.08) both;
    }
    .eofck-tarjeta::before{
      content:""; position:absolute; left:0; right:0; top:0; height:7px;
      background:linear-gradient(90deg,var(--rojo,#d1132e),var(--celeste,#5bb8e8));
    }
    .eofck-icono{
      width:78px; height:78px; margin:0 auto 20px; border-radius:50%;
      display:flex; align-items:center; justify-content:center; color:#fff;
      background:linear-gradient(135deg,var(--marino,#0c1b2e),#21436b);
      box-shadow:0 12px 28px rgba(12,27,46,.38);
    }
    .eofck-icono svg{width:38px; height:38px;}
    .eofck-titulo{
      margin:0 0 14px; color:inherit; text-wrap:balance;
      font-family:var(--font-tit,'Oswald','Arial Narrow',sans-serif);
      font-size:clamp(1.65rem,5vw,2.15rem); line-height:1.15; font-weight:700; letter-spacing:.2px;
    }
    .eofck-texto{
      margin:0 auto 28px; max-width:48ch;
      font-family:var(--font-text,Inter,Arial,sans-serif);
      font-size:1.05rem; line-height:1.62; color:var(--texto-suave,#5a6270);
    }
    .eofck-botones{display:grid; grid-template-columns:1fr 1fr; gap:12px;}
    .eofck-btn{
      box-sizing:border-box; min-height:58px; padding:14px 18px; cursor:pointer;
      border-radius:15px; border:2px solid transparent;
      font-family:var(--font-tit,'Oswald','Arial Narrow',sans-serif);
      font-size:.98rem; letter-spacing:.6px; text-transform:uppercase; line-height:1.15;
      transition:transform .15s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease;
    }
    .eofck-btn:hover{transform:translateY(-2px);}
    .eofck-btn:active{transform:translateY(0);}
    .eofck-btn:focus-visible{outline:3px solid var(--celeste,#5bb8e8); outline-offset:3px;}
    .eofck-aceptar{background:var(--rojo,#d1132e); border-color:var(--rojo,#d1132e); color:#fff; box-shadow:0 12px 24px rgba(209,19,46,.32);}
    .eofck-aceptar:hover{box-shadow:0 16px 30px rgba(209,19,46,.4);}
    .eofck-rechazar{background:transparent; color:var(--texto,#1a1c22); border-color:color-mix(in srgb, var(--texto,#1a1c22) 38%, transparent);}
    .eofck-rechazar:hover{background:color-mix(in srgb, var(--texto,#1a1c22) 7%, transparent); border-color:var(--texto,#1a1c22);}
    .eofck-config{
      grid-column:1 / -1; min-height:50px; font-size:.86rem;
      background:var(--fondo-alt,#f3f5f8); color:var(--texto,#1a1c22); border-color:var(--borde,#e7e9ee);
    }
    .eofck-config:hover{border-color:var(--celeste,#5bb8e8);}
    .eofck-legal{margin:20px 0 0; font-family:var(--font-text,Inter,Arial,sans-serif); font-size:.84rem; color:var(--texto-suave,#5a6270);}
    .eofck-legal a{color:var(--celeste,#5bb8e8); text-decoration:underline; text-underline-offset:2px;}
    /* Modo compacto (páginas legales): tarjeta abajo, sin fondo ni bloqueo, para
       poder leer la política antes de decidir. */
    #eof-cookies-aviso.eofck-compacto{
      align-items:flex-end; background:none; -webkit-backdrop-filter:none; backdrop-filter:none;
      pointer-events:none; overflow:visible; animation:none;
      padding-bottom:calc(max(16px, env(safe-area-inset-bottom)) + var(--eof-tab-h, 0px));
    }
    .eofck-compacto .eofck-tarjeta{
      pointer-events:auto; max-width:560px; margin:0 auto; padding:24px 26px 22px;
      box-shadow:0 18px 60px rgba(0,0,0,.45), 0 0 0 1px color-mix(in srgb, var(--texto,#1a1c22) 12%, transparent);
    }
    .eofck-compacto .eofck-icono, .eofck-compacto .eofck-legal{display:none;}
    .eofck-compacto .eofck-titulo{font-size:1.35rem; margin-bottom:8px;}
    .eofck-compacto .eofck-texto{font-size:.92rem; line-height:1.5; margin-bottom:16px;}
    .eofck-compacto .eofck-btn{min-height:48px; font-size:.88rem;}
    .eofck-compacto .eofck-config{min-height:44px;}
    @keyframes eofckFondo{from{opacity:0}to{opacity:1}}
    @keyframes eofckEntra{from{opacity:0; transform:translateY(22px) scale(.94)}to{opacity:1; transform:none}}
    @media (max-width:560px){
      .eofck-tarjeta{padding:36px 22px 26px; border-radius:24px;}
      .eofck-icono{width:64px; height:64px; margin-bottom:16px;}
      .eofck-icono svg{width:32px; height:32px;}
      .eofck-texto{font-size:.98rem; margin-bottom:22px;}
      .eofck-botones{grid-template-columns:1fr;}
    }
    @media (max-height:640px){
      .eofck-icono{display:none;}
      .eofck-tarjeta{padding-top:34px;}
    }
    @media (prefers-reduced-motion:reduce){
      #eof-cookies-aviso, .eofck-tarjeta{animation:none;}
      .eofck-btn{transition:none;}
    }`,document.head.appendChild(e)}function eofCookiesModalHTML(e){const o=e?e.analiticas:!1,t=e?e.publicidad:!1;return`
    <div class="eof-cookies-modal" id="eofCookiesModal">
      <div class="eof-cookies-modal-fondo" onclick="eofCookiesCerrarModal()"></div>
      <div class="eof-cookies-modal-caja" role="dialog" aria-modal="true" aria-labelledby="eofCookiesModalTitulo">
        <button type="button" class="eof-cookies-cerrar" onclick="eofCookiesCerrarModal()" aria-label="Cerrar">✕</button>
        <div id="eofCookiesModalTitulo" class="t-h3">Preferencias de cookies</div>
        <p>Elige qué categorías de cookies quieres permitir. Puedes cambiar esta decisión en cualquier momento desde el enlace "Cookies" en el pie de página.</p>

        <div class="eof-cookie-categoria">
          <div class="eof-cookie-categoria-info">
            <div class="t-h4">Necesarias</div>
            <p>Imprescindibles para el funcionamiento del sitio (sesión, preferencia de tema claro/oscuro). No se pueden desactivar.</p>
          </div>
          <label class="eof-cookie-switch">
            <input type="checkbox" checked disabled>
            <span class="track"></span>
          </label>
        </div>

        <div class="eof-cookie-categoria">
          <div class="eof-cookie-categoria-info">
            <div class="t-h4">Analíticas</div>
            <p>Nos permiten medir el tráfico y el uso del sitio para mejorarlo.</p>
          </div>
          <label class="eof-cookie-switch">
            <input type="checkbox" id="eofCookieToggleAnaliticas" ${o?"checked":""}>
            <span class="track"></span>
          </label>
        </div>

        <div class="eof-cookie-categoria">
          <div class="eof-cookie-categoria-info">
            <div class="t-h4">Publicidad</div>
            <p>Permiten mostrar publicidad personalizada a través de Google Ad Manager/AdSense y sus socios de header bidding.</p>
          </div>
          <label class="eof-cookie-switch">
            <input type="checkbox" id="eofCookieTogglePublicidad" ${t?"checked":""}>
            <span class="track"></span>
          </label>
        </div>

        <div class="eof-cookies-modal-acciones">
          <button type="button" onclick="eofCookiesRechazarTodo()">Rechazar no necesarias</button>
          <button type="button" class="eof-cookie-guardar" onclick="eofCookiesGuardarDesdeModal()">Guardar preferencias</button>
        </div>
      </div>
    </div>`}function eofCookiesBaseHref(){return"/"}function eofCookiesEsPaginaLegal(){try{return/(^|\/)(politica-cookies|politica-privacidad|aviso-legal)(\.html)?\/?$/.test(location.pathname)}catch{return!1}}function eofCookiesMostrarBanner(){if(document.getElementById("eof-cookies-aviso"))return;eofCookiesInyectarEstilos(),document.body.insertAdjacentHTML("beforeend",eofCookiesBannerHTML());const e=document.getElementById("eof-cookies-aviso");if(eofCookiesEsPaginaLegal()){e.classList.add("eofck-compacto"),e.setAttribute("aria-modal","false");return}document.documentElement.classList.add("eofck-abierto");const o=e.querySelector(".eofck-tarjeta");o&&o.focus({preventScroll:!0})}function eofCookiesOcultarBanner(){const e=document.getElementById("eof-cookies-aviso");e&&e.remove(),document.documentElement.classList.remove("eofck-abierto")}function eofCookiesAbrirModal(){if(window.EOF_CMP_EXTERNO===!0&&typeof window.__tcfapi=="function"&&window.googlefc){window.googlefc.callbackQueue=window.googlefc.callbackQueue||[],window.googlefc.callbackQueue.push({CONSENT_DATA_READY:()=>{typeof window.googlefc.showRevocationMessage=="function"&&window.googlefc.showRevocationMessage()}});return}let e=document.getElementById("eofCookiesModal");e||(document.body.insertAdjacentHTML("beforeend",eofCookiesModalHTML(eofCookiesLeerPreferencias())),e=document.getElementById("eofCookiesModal")),e.classList.add("abierto")}function eofCookiesCerrarModal(){const e=document.getElementById("eofCookiesModal");e&&e.classList.remove("abierto")}function eofCookiesAceptarTodo(){eofCookiesGuardarPreferencias(!0,!0),eofCookiesAplicarConsentimiento(!0,!0),eofCookiesOcultarBanner(),eofCookiesCerrarModal()}function eofCookiesRechazarTodo(){eofCookiesGuardarPreferencias(!1,!1),eofCookiesAplicarConsentimiento(!1,!1),eofCookiesOcultarBanner(),eofCookiesCerrarModal()}function eofCookiesGuardarDesdeModal(){const e=document.getElementById("eofCookieToggleAnaliticas").checked,o=document.getElementById("eofCookieTogglePublicidad").checked;eofCookiesGuardarPreferencias(e,o),eofCookiesAplicarConsentimiento(e,o),eofCookiesOcultarBanner(),eofCookiesCerrarModal()}window.eofAbrirPreferenciasCookies=eofCookiesAbrirModal,window.eofCookiesAceptadas=function(){return!!(window.EOF_CONSENTIMIENTO_ANALITICA||window.EOF_CONSENTIMIENTO_PUBLICIDAD)};function eofCookiesInit(){if(window.EOF_CMP_EXTERNO===!0)return;const e=eofCookiesLeerPreferencias();if(e){eofCookiesAplicarConsentimiento(e.analiticas,e.publicidad);return}eofCookiesMostrarBanner()}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",eofCookiesInit):eofCookiesInit();
