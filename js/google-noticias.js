/* Google Noticias · invitación a añadir El Otro Fútbol como fuente preferida.
 * Sale al inicio de cada noticia (noticia.html). El lector puede cerrarla o pulsar el botón y
 * entonces no se vuelve a enseñar durante DIAS_OCULTA días (se guarda solo en su navegador).
 * Para que salga siempre, pon PERMITE_CERRAR = false. */
(function (raiz) {
  "use strict";

  const URL_FUENTE = "https://www.google.com/preferences/source?q=elotrofutbol.media";
  const CLAVE = "eof_gn_oculto_hasta";
  const DIAS_OCULTA = 30;
  const PERMITE_CERRAR = true;

  function oculta() {
    if (!PERMITE_CERRAR) return false;
    try { return Number(localStorage.getItem(CLAVE)) > Date.now(); } catch (_) { return false; }
  }
  function recordar() {
    if (!PERMITE_CERRAR) return;
    try { localStorage.setItem(CLAVE, String(Date.now() + DIAS_OCULTA * 864e5)); } catch (_) {}
  }

  const LOGO_G = `<svg class="gn-g" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
  const ESTRELLA = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.45 6.2 20.5l1.1-6.47L2.6 9.45l6.5-.95L12 2.6z"/></svg>`;

  function html() {
    if (oculta()) return "";
    return `
    <aside class="gn-tarjeta" aria-label="Añade El Otro Fútbol a tus fuentes preferidas de Google">
      <span class="gn-insignia" aria-hidden="true">${LOGO_G}</span>
      <p class="gn-titulo">Añade <strong>El Otro Fútbol</strong> a tus fuentes preferidas de Google</p>
      <a class="gn-boton" href="${URL_FUENTE}" target="_blank" rel="noopener" data-gn-ir>
        <span class="gn-boton-estrella">${ESTRELLA}</span><span>Añadir</span>
      </a>
      ${PERMITE_CERRAR ? `<button type="button" class="gn-cerrar" data-gn-cerrar aria-label="Cerrar este aviso">&times;</button>` : ""}
    </aside>`;
  }

  // Engancha los botones de la tarjeta que haya dentro de `contenedor` (se llama tras pintar la noticia).
  function montar(contenedor) {
    const tarjeta = contenedor && contenedor.querySelector(".gn-tarjeta");
    if (!tarjeta || tarjeta.dataset.gnListo) return;
    tarjeta.dataset.gnListo = "1";
    const cerrar = tarjeta.querySelector("[data-gn-cerrar]");
    if (cerrar) cerrar.addEventListener("click", () => {
      recordar();
      tarjeta.classList.add("gn-saliendo");
      setTimeout(() => tarjeta.remove(), 260);
    });
    const ir = tarjeta.querySelector("[data-gn-ir]");
    if (ir) ir.addEventListener("click", () => {
      recordar();
      // Google se abre en otra pestaña; aquí la tarjeta pasa a un agradecimiento.
      setTimeout(() => {
        if (!tarjeta.isConnected) return;
        tarjeta.classList.add("gn-hecho");
        tarjeta.innerHTML = `<span class="gn-insignia gn-insignia-ok" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
          <p class="gn-titulo" role="status">¡Gracias por apoyarnos! Marca El Otro Fútbol en Google y sigue leyendo.</p>`;
      }, 500);
    });
  }

  raiz.EOFGoogleNoticias = { html, montar, URL_FUENTE };
})(typeof window !== "undefined" ? window : globalThis);
