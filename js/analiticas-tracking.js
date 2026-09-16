// Tracking propio de vistas y tiempo de lectura (Parte 2/3 del panel de
// analíticas). Se incluye solo en noticia.html, después de conocerse el
// slug de la noticia. No usa cookies ni localStorage: cada carga de
// página es una vista nueva, tal y como la ve el Worker.
//
// Uso: <script src="js/analiticas-tracking.js" data-slug="mi-noticia"></script>
// o bien, si el slug se resuelve por JS (como en noticia.html):
//   window.iniciarTrackingLectura(slug)

(function () {
  "use strict";

  function apiBase() {
    // Reutiliza la misma configuración que el resto del sitio (ver
    // public/js/config.js). OJO: config.js NO expone "window.API_BASE"
    // (eso nunca ha existido) -- la constante real es "PRIMARY_API"
    // (=API_URL, https://api.elotrofutbol.media). Como config.js declara
    // PRIMARY_API con "const" en su propio scope de script, no cuelga de
    // window por defecto; hay que leerlo así para verlo desde aquí. Con
    // "window.API_BASE || ''" (como estaba antes) esto devolvía siempre
    // cadena vacía, así que /api/track/view y /api/track/reading se
    // llamaban con ruta relativa contra ESTE dominio (elotrofutbol.media,
    // que no tiene ninguna API en /api/*) en vez de contra
    // api.elotrofutbol.media -- fallaban en silencio (van en un
    // .catch(() => {})) y por eso nunca se guardaba ninguna vista.
    if (typeof PRIMARY_API !== "undefined" && PRIMARY_API) return PRIMARY_API.replace(/\/$/, "");
    return (window.API_BASE || window.PRIMARY_API || "").replace(/\/$/, "");
  }

  function iniciarTrackingLectura(slug, idioma) {
    if (!slug) return;

    let viewId = null;
    let segundosActivos = 0;
    let ultimaMarca = Date.now();
    let visible = document.visibilityState === "visible";
    let scrollMaximo = 0;
    let ultimoEnvioSegundos = 0; // segundos ya reportados en el último envío (heartbeat o cierre)
    let idiomaActual = idioma || "es";

    // Permite que noticia.html avise si el lector cambia de idioma con
    // el selector DESPUÉS de que ya se registró la vista (la vista ya
    // quedó grabada con el idioma inicial; no se manda una segunda
    // vista, solo se recuerda para que quede constancia en consola de
    // depuración si hiciera falta -- la columna idioma de article_views
    // es la del momento de la carga, que es cuando de verdad se "abrió"
    // la noticia).
    window.actualizarIdiomaTrackingLectura = function (nuevoIdioma) {
      idiomaActual = nuevoIdioma || "es";
    };

    // 1) Registrar la vista al cargar. Se manda el idioma que se está
    // mostrando (según el selector de idioma de noticia.html) para la
    // estadística de "idiomas más usados al leer una noticia" del panel
    // -- "es" si no se pasa, igual que hace el propio Worker si el
    // campo falta o no es válido.
    const registroVista = fetch(`${apiBase()}/api/track/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, idioma: idiomaActual }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.view_id) viewId = data.view_id;
      })
      .catch(() => {});

    // 2) Acumular tiempo solo mientras la pestaña está visible (evita
    // contar como "leído" el rato con la pestaña en segundo plano).
    function acumular() {
      const ahora = Date.now();
      if (visible) segundosActivos += (ahora - ultimaMarca) / 1000;
      ultimaMarca = ahora;
    }

    document.addEventListener("visibilitychange", () => {
      acumular();
      visible = document.visibilityState === "visible";
    });

    // 3) Scroll máximo alcanzado, como % de la altura total de la página.
    function actualizarScroll() {
      const alturaTotal = document.documentElement.scrollHeight - window.innerHeight;
      if (alturaTotal <= 0) { scrollMaximo = 100; return; }
      const porcentaje = Math.round((window.scrollY / alturaTotal) * 100);
      scrollMaximo = Math.max(scrollMaximo, Math.min(100, porcentaje));
    }
    window.addEventListener("scroll", actualizarScroll, { passive: true });

    // 4) Envío del tiempo de lectura acumulado hasta ahora. Antes SOLO se
    // llamaba desde enviarCierre() (visibilitychange->hidden / pagehide),
    // y si esos eventos no llegaban a dispararse a tiempo -- por ejemplo,
    // si al momento de salir "viewId" todavía era null porque la
    // respuesta de /api/track/view no había llegado aún, ver el "return"
    // que había aquí antes -- la lectura entera se perdía en silencio: no
    // había ningún reintento ni ningún otro punto que la mandara. Eso
    // producía justo el síntoma visto en el panel: paginas_vistas > 0
    // pero article_reading vacía y "0s" en todas partes.
    //
    // Ahora enviarLectura() es la única función que compone y manda el
    // payload, y se llama desde tres sitios (ver más abajo): 1) un
    // heartbeat periódico mientras la pestaña sigue abierta y visible
    // (así hay datos aunque nunca se llegue a disparar un cierre limpio),
    // 2) al ocultarse la pestaña, y 3) en pagehide. "final" indica si es
    // el envío de cierre (para poder cancelar el heartbeat) o un
    // heartbeat intermedio (que sigue funcionando aunque siga leyendo).
    function enviarLectura(final) {
      acumular();
      const segundosTotales = Math.round(segundosActivos);
      const incremento = segundosTotales - ultimoEnvioSegundos;
      // Menos de 1s de lectura nueva desde el último envío: no aporta
      // nada, se deja para el siguiente heartbeat o el cierre.
      if (incremento < 1) return;

      // Si la vista todavía no se ha registrado (viewId nulo: la
      // respuesta de /api/track/view no ha llegado todavía), no se puede
      // mandar la lectura -- pero, a diferencia de antes, NO se descarta
      // sin más: en cuanto "registroVista" resuelva, se reintenta una
      // vez con el tiempo acumulado hasta ese momento. Cubre el caso
      // real más probable: la persona sale de la noticia (cierra la
      // pestaña, cambia de página) antes de que /api/track/view haya
      // tenido tiempo de responder.
      if (!viewId) {
        registroVista.then(() => {
          if (viewId) enviarLectura(final);
        });
        return;
      }

      ultimoEnvioSegundos = segundosTotales;

      const payload = JSON.stringify({ view_id: viewId, segundos: segundosTotales, scroll_maximo: scrollMaximo });
      const url = `${apiBase()}/api/track/reading`;

      // NOTA sobre el CORS error visto en Network para esta petición:
      // navigator.sendBeacon() manda el body como un POST "simple" (sin
      // preflight), pero por eso mismo el navegador NO expone ningún
      // detalle de la respuesta a la consola más allá de "CORS error" --
      // ni siquiera permite leer el status code desde JS (sendBeacon()
      // solo devuelve true/false sobre si se ENCOLÓ la petición, nunca
      // sobre si el servidor la aceptó). Si el servidor devuelve algo sin
      // cabecera Access-Control-Allow-Origin (una página de error/
      // challenge intermedia de Cloudflare, un 5xx que no pase por nuestro
      // json(), etc.), el navegador lo reporta como fallo de CORS aunque
      // el problema real sea otro. Para poder diagnosticarlo de verdad
      // (ver el status code y el cuerpo real de la respuesta, algo que
      // sendBeacon nunca expone), se usa SIEMPRE fetch(..., {keepalive:true})
      // como primera opción -- funciona igual de bien que sendBeacon para
      // sobrevivir a pagehide/visibilitychange, con la ventaja de que sí
      // deja inspeccionar la respuesta -- y sendBeacon queda como último
      // recurso solo si fetch no está disponible.
      const enviarConFetch = () =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        })
          .then((r) => {
            if (!r.ok) {
              console.warn(`[analiticas] /api/track/reading respondió ${r.status} para view_id=${viewId}`);
            }
          })
          .catch((err) => {
            console.warn(`[analiticas] /api/track/reading falló de red para view_id=${viewId}:`, err);
            // Último recurso: sendBeacon puede colar la petición incluso
            // en el instante exacto de pagehide, cuando el navegador ya
            // ha empezado a descartar conexiones fetch nuevas.
            if (navigator.sendBeacon) {
              navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
            }
          });

      if (typeof fetch === "function") {
        enviarConFetch();
      } else if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
      }

      if (final && heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    }

    // Heartbeat: reenvía el tiempo acumulado cada 15s mientras la pestaña
    // sigue visible, actualizando (no acumulando aparte) la misma fila de
    // article_reading en el servidor -- así una lectura larga que nunca
    // llega a un pagehide "limpio" (el usuario cierra el portátil, mata
    // el proceso del navegador, pierde la conexión) igualmente deja
    // registro parcial, en vez de depender de un único envío final que
    // puede no llegar a producirse nunca.
    let heartbeat = setInterval(() => {
      if (document.visibilityState === "visible") enviarLectura(false);
    }, 15000);

    function enviarCierre() {
      enviarLectura(true);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") enviarCierre();
    });
    window.addEventListener("pagehide", enviarCierre);
  }

  window.iniciarTrackingLectura = iniciarTrackingLectura;

  // Autoarranque si el script se incluye con data-slug directamente.
  const scriptActual = document.currentScript;
  const slugAttr = scriptActual && scriptActual.getAttribute("data-slug");
  if (slugAttr) iniciarTrackingLectura(slugAttr);
})();
