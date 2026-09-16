// ---------- Sesión de lector (cuenta pública del lector) ----------
// Completamente independiente de la sesión de redactor/admin
// (eof_token/eof_user, ver layout.js): un lector nunca ve el panel ni
// puede colarse en rutas de /admin, y viceversa, un redactor logueado
// en el panel no necesita registrarse como lector para comentar (puede,
// si quiere, pero son cuentas distintas a propósito).
//
// La cuenta de lector no es solo "para comentar": es la cuenta pública
// general del lector en el medio. Ya da acceso a comentar con nombre
// firmado, votar en las encuestas y guardar la porra de cada jornada
// (con resumen de temporada y ranking), y con el tiempo irá sumando
// muchas más funciones.

const EOF_LECTOR_TOKEN_KEY = "eof_lector_token";
const EOF_LECTOR_DATA_KEY = "eof_lector_data";

function sesionLectorActual() {
  try {
    const token = localStorage.getItem(EOF_LECTOR_TOKEN_KEY);
    const reader = JSON.parse(localStorage.getItem(EOF_LECTOR_DATA_KEY) || "null");
    if (!token || !reader) return null;
    return reader;
  } catch {
    return null;
  }
}

function tokenLectorActual() {
  return localStorage.getItem(EOF_LECTOR_TOKEN_KEY) || null;
}

function guardarSesionLector(token, reader) {
  localStorage.setItem(EOF_LECTOR_TOKEN_KEY, token);
  localStorage.setItem(EOF_LECTOR_DATA_KEY, JSON.stringify(reader));
}

// Muestra un error de login/registro de lector de forma consistente en
// TODA la web, no solo en acceso.html. Antes cada flujo (Google,
// Microsoft, Discord, X) repetía el mismo "getElementById('loginMsg')
// || getElementById('registroMsg'), si no existe alert()": eso
// funcionaba bien dentro de acceso.html, pero Discord y X vuelven con
// un redirect completo del navegador a la página "volver" (que puede
// ser cualquier página del sitio: index.html, noticia.html...), y esas
// páginas no tienen "loginMsg"/"registroMsg". Si algo fallaba en ese
// momento (el usuario cancelaba la autorización, el token había
// caducado, etc.), el lector se encontraba con un alert() feo y en
// inglés/genérico del navegador en medio de una página cualquiera, en
// vez de un aviso propio del sitio.
// Con EOF.toast (ver ui-alertas.js, cargado en todas las páginas que
// también cargan este script) hay un aviso con la misma estética en
// cualquier página; el alert() queda solo como último recurso si por
// lo que sea ui-alertas.js no se ha cargado.
function mostrarErrorAccesoLector(texto) {
  const msg = document.getElementById("loginMsg") || document.getElementById("registroMsg");
  if (msg) {
    msg.textContent = texto;
    msg.className = "acceso-msg acceso-msg-error";
    msg.style.display = "";
  } else if (window.EOF && EOF.toast) {
    EOF.toast(texto, "error", 7000);
  } else {
    alert(texto);
  }
}

async function cerrarSesionLector() {
  const token = tokenLectorActual();
  localStorage.removeItem(EOF_LECTOR_TOKEN_KEY);
  localStorage.removeItem(EOF_LECTOR_DATA_KEY);
  if (token) {
    try {
      await apiFetch("/api/readers/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Sin conexión: la sesión local ya se ha borrado igualmente, y el
      // JWT caducará solo aunque la fila en el servidor no se revoque
      // al momento.
    }
  }
}

// Petición autenticada con el token de LECTOR (no confundir con
// apiFetch normal, que no añade ninguna cabecera de sesión por su
// cuenta: cada llamador decide qué Authorization le corresponde).
function apiFetchLector(path, options = {}) {
  const token = tokenLectorActual();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return apiFetch(path, { ...options, headers });
}

// Pequeño botón/menú de cuenta de lector, pensado para insertarse en la
// cabecera de la sección de comentarios (ver noticia.html): si no hay
// sesión, invita a iniciarla; si la hay, muestra el nombre y un enlace
// para cerrar sesión.
function accesoLectorHTML() {
  const reader = sesionLectorActual();
  const volver = encodeURIComponent(location.pathname + location.search);
  if (!reader) {
    return `
      <div class="acceso-lector">
        <span>Crea tu cuenta de lector: comenta con tu nombre, vota en las encuestas, guarda tu porra, entra en el ranking y accede a todas las funciones que iremos añadiendo.</span>
        <a href="acceso.html?volver=${volver}" class="acceso-lector-link">Inicia sesión o regístrate</a>
      </div>`;
  }
  const avatar = reader.avatar_url
    ? `<img src="${escapeHtml(reader.avatar_url)}" alt="" class="acceso-lector-avatar">`
    : "";
  return `
    <div class="acceso-lector acceso-lector-activo">
      ${avatar}
      <span>Sesión iniciada como <strong>${escapeHtml(reader.nombre)}</strong></span>
      <button type="button" class="acceso-lector-link" id="btnCerrarSesionLector">Cerrar sesión</button>
    </div>`;
}

function iniciarBotonCerrarSesionLector() {
  const btn = document.getElementById("btnCerrarSesionLector");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    await cerrarSesionLector();
    location.reload();
  });
}

// ---------- Acceso con cuenta de Google (lectores) ----------
// Usa Google Identity Services (el script <script src="https://accounts.google.com/gsi/client">
// se carga aparte en cada página que use esto): pinta el botón oficial
// de Google en los contenedores indicados y, cuando el usuario elige su
// cuenta, Google llama a nuestro callback con un id_token ya firmado
// por ellos. Ese token se manda tal cual a /api/readers/google, que lo
// verifica en el servidor (nunca nos fiamos de nada calculado solo en
// el navegador) y, si todo cuadra, responde exactamente igual que
// /api/readers/login: un token de sesión propio + los datos del lector.
//
// EOF_GOOGLE_CLIENT_ID: sustituir por el Client ID real obtenido en
// Google Cloud Console (ver README/instrucciones de despliegue). Es un
// dato público, no un secreto: puede ir tal cual en el HTML/JS servido
// al navegador.
const EOF_GOOGLE_CLIENT_ID = "129689993263-2dtd5uu2r2bgo9vooohkjc4ia4gu7mkb.apps.googleusercontent.com";

async function alTerminarLoginGoogle(response) {
  const botones = document.querySelectorAll(".btn-google.cargando");
  try {
    const res = await apiFetch("/api/readers/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: response.credential }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se ha podido iniciar sesión con Google");
    guardarSesionLector(data.token, data.reader);
    const volver = new URLSearchParams(location.search).get("volver");
    location.href = volver || "index.html";
  } catch (err) {
    botones.forEach((b) => b.classList.remove("cargando"));
    // Mismo patrón que los formularios normales de acceso.html: si hay
    // un elemento de mensaje de error visible en la pantalla activa, se
    // usa; si no (p. ej. este botón se pinta en otra página distinta a
    // acceso.html en el futuro), como último recurso un alert simple.
    mostrarErrorAccesoLector(err.message);
  }
}

// Pinta el botón de Google en cada contenedor de "ids" que exista en la
// página (p. ej. acceso.html tiene uno en la pestaña de iniciar sesión
// y otro en la de crear cuenta: es el mismo flujo, solo cambia dónde se
// ve el botón). Si el script de Google todavía no ha cargado, reintenta
// un par de veces: es un script async y puede tardar un instante más
// que el resto de la página.
//
// A diferencia de una versión anterior, aquí NO se usa
// google.accounts.id.renderButton() (el widget oficial de Google): ese
// botón tiene un ancho fijo en píxeles y casi no se puede personalizar,
// así que en su lugar el HTML de acceso.html ya trae un botón propio
// (con nuestra tipografía, colores y modo oscuro, y de verdad
// responsive al 100% del ancho) y aquí solo se le engancha el clic para
// disparar el flujo real de Google. Sigue siendo la misma API oficial
// de Identity Services por debajo: el id_token que llega en
// alTerminarLoginGoogle es idéntico al que daría el botón de Google, y
// se verifica igual en el servidor.
// A diferencia de la versión anterior (que usaba google.accounts.id.prompt()
// para abrir el aviso flotante "One Tap" al pulsar nuestro botón propio),
// aquí se usa google.accounts.id.renderButton(): es el flujo que Google
// recomienda para FedCM, porque se abre directamente como respuesta a un
// clic real del usuario (gesto directo), en vez de depender de que el
// navegador decida mostrar un prompt automático. prompt() bajo FedCM está
// sujeto a heurísticas de "cooldown" del propio navegador (isNotDisplayed/
// isSkippedMoment, ya deprecados) que pueden bloquearlo de forma opaca e
// intermitente incluso sin ningún problema real de configuración -- que es
// justo lo que causaba el "suppressed_by_user" persistente. renderButton()
// no pasa por esa lógica.
//
// Como nuestro botón ya tiene su propio diseño (ver comentario más abajo,
// no queremos el ancho fijo del botón oficial de Google), el botón real
// de Google se renderiza oculto/superpuesto encima del nuestro y se le
// redirige el clic con .click() sintético: el usuario ve nuestro botón,
// pero quien recibe el evento de clic real (necesario para que el
// navegador lo cuente como gesto directo) es el de Google.
function iniciarBotonesGoogleLector(ids, intento = 0) {
  if (typeof google === "undefined" || !google.accounts || !google.accounts.id) {
    if (intento < 20) setTimeout(() => iniciarBotonesGoogleLector(ids, intento + 1), 150);
    return;
  }
  google.accounts.id.initialize({
    client_id: EOF_GOOGLE_CLIENT_ID,
    callback: alTerminarLoginGoogle,
    use_fedcm_for_button: true,
  });

  ids.forEach((id) => {
    const boton = document.getElementById(id);
    if (!boton) return;

    // Contenedor donde Google pinta su botón real, fuera de la pantalla
    // pero con un tamaño explícito y fijo en píxeles (300x44, el tamaño
    // por defecto de un botón "large" de Google): la vez anterior este
    // contenedor heredaba su tamaño de un padre (.google-btn-wrap) sin
    // altura propia, así que acababa en 0x0px y Google nunca llegaba a
    // pintar nada dentro, sin ningún error visible en ningún sitio. Con
    // un tamaño fijo en el propio contenedor, ese problema no puede
    // repetirse pase lo que pase con el CSS de alrededor. "Fuera de la
    // pantalla" (position:fixed + left muy negativo) en vez de
    // display:none/visibility:hidden porque Google necesita que el
    // botón esté realmente pintado y con layout real para poder
    // hacerle .click() por debajo.
    const contenedorGoogle = document.createElement("div");
    contenedorGoogle.style.position = "fixed";
    contenedorGoogle.style.left = "-9999px";
    contenedorGoogle.style.top = "0";
    contenedorGoogle.style.width = "300px";
    contenedorGoogle.style.height = "44px";
    document.body.appendChild(contenedorGoogle);

    google.accounts.id.renderButton(contenedorGoogle, {
      type: "standard",
      size: "large",
      width: 300,
    });

    // renderButton() no es síncrono: el <div role="button"> real de
    // Google aparece un instante después de llamarlo, no en el mismo
    // tick. Se espera activamente a que exista antes de enganchar el
    // clic de nuestro botón, en vez de asumir que ya está listo.
    let botonGoogleReal = null;
    const esperarBotonReal = (intentos = 0) => {
      botonGoogleReal = contenedorGoogle.querySelector("div[role=button]");
      if (botonGoogleReal) return;
      if (intentos < 40) {
        setTimeout(() => esperarBotonReal(intentos + 1), 100);
      } else {
        // Pasados 4s el botón real de Google sigue sin existir: algo va
        // mal de verdad (origin no autorizado, Client ID incorrecto...)
        // y no solo una carga lenta. Se avisa en vez de dejar el botón
        // sin ningún listener enganchado para siempre.
        console.error("Google no ha pintado su botón real tras varios intentos.");
      }
    };
    esperarBotonReal();

    boton.addEventListener("click", () => {
      if (boton.classList.contains("cargando")) return;
      if (!botonGoogleReal) {
        mostrarErrorAccesoLector("El acceso con Google todavía se está cargando. Espera un segundo e inténtalo de nuevo.");
        return;
      }
      boton.classList.add("cargando");
      botonGoogleReal.click();
      // A diferencia de Microsoft (loginPopup de MSAL sí devuelve un
      // error rechazando la promesa si el usuario cierra el popup) y de
      // Discord/X (redirect completo, el propio servidor manda de
      // vuelta ?errorX=...), la librería de Google Identity Services no
      // tiene ningún callback de error para "el usuario cerró el popup
      // sin completar el login": alTerminarLoginGoogle (el callback que
      // sí existe) solo se llama si el login termina bien. Si se
      // cerraba el popup, antes esto se quedaba en silencio -el botón
      // dejaba de estar "cargando" tras 15s pero sin avisar de nada, así
      // que parecía que el sitio simplemente no había hecho nada-.
      // Como no hay forma de distinguir "cerrado por el usuario" de
      // "tardando en cargar" con esta API, se usa el mismo margen de 15s
      // como señal de que no ha llegado ninguna respuesta y se avisa,
      // igual que ya se hace con Microsoft/Discord/X cuando fallan.
      const idTemporizadorGoogle = setTimeout(() => {
        boton.classList.remove("cargando");
        mostrarErrorAccesoLector("No se ha completado el acceso con Google. Si has cerrado la ventana de Google, inténtalo de nuevo.");
      }, 15000);
      // Si el login SÍ termina bien (o con un error real ya reportado
      // por alTerminarLoginGoogle) antes de esos 15s, hay que cancelar
      // este aviso: si no, saltaría igualmente más tarde con la sesión
      // ya iniciada. Se detecta con un MutationObserver sobre la propia
      // clase "cargando" del botón, que alTerminarLoginGoogle ya quita
      // en su try/catch al terminar (con éxito redirige antes de que dé
      // tiempo a que llegue el timeout; con error la quita al momento).
      const observerGoogle = new MutationObserver(() => {
        if (!boton.classList.contains("cargando")) {
          clearTimeout(idTemporizadorGoogle);
          observerGoogle.disconnect();
        }
      });
      observerGoogle.observe(boton, { attributes: true, attributeFilter: ["class"] });
    });
  });
}

// ---------- Acceso con cuenta de Microsoft (lectores) ----------
// Mismo patrón que el bloque de Google de arriba, pero con MSAL.js (la
// librería oficial de Microsoft Identity Platform, cargada aparte en
// cada página que use esto: <script src=".../msal-browser.min.js">).
// Al pulsar el botón se abre un popup de Microsoft; si el usuario
// inicia sesión, MSAL nos da un id_token ya firmado por Microsoft. Ese
// token se manda tal cual a /api/readers/microsoft, que lo verifica en
// el servidor (igual que con Google: nunca nos fiamos de nada
// calculado solo en el navegador) y responde exactamente igual que
// /api/readers/login: un token de sesión propio + los datos del lector.
//
// EOF_MICROSOFT_CLIENT_ID: sustituir por el Application (client) ID
// real obtenido en Azure Portal (ver README/instrucciones de
// despliegue, y el comentario de MICROSOFT_CLIENT_ID en
// worker/wrangler.toml). Tampoco es un secreto: puede ir tal cual en
// el HTML/JS servido al navegador.
const EOF_MICROSOFT_CLIENT_ID = "b277667e-e92d-49d2-821b-d7c36bf9a1cb";

let eofMsalApp = null;
function getMsalApp() {
  if (!eofMsalApp) {
    eofMsalApp = new msal.PublicClientApplication({
      auth: {
        clientId: EOF_MICROSOFT_CLIENT_ID,
        authority: "https://login.microsoftonline.com/common",
        redirectUri: location.origin + "/acceso.html",
      },
      cache: { cacheLocation: "sessionStorage" },
    });
  }
  return eofMsalApp;
}

async function alTerminarLoginMicrosoft(idToken, boton) {
  try {
    const res = await apiFetch("/api/readers/microsoft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: idToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se ha podido iniciar sesión con Microsoft");
    guardarSesionLector(data.token, data.reader);
    const volver = new URLSearchParams(location.search).get("volver");
    location.href = volver || "index.html";
  } catch (err) {
    // Mismo patrón que con Google: si hay un elemento de mensaje de
    // error visible en la pantalla activa, se usa; si no, un alert.
    mostrarErrorAccesoLector(err.message);
  } finally {
    if (boton) boton.classList.remove("cargando");
  }
}

// Engancha el clic de cada botón de "ids" que exista en la página (igual
// que iniciarBotonesGoogleLector: acceso.html tiene uno en la pestaña
// de iniciar sesión y otro en la de crear cuenta, mismo flujo, solo
// cambia dónde se ve el botón). Si la librería MSAL todavía no ha
// cargado (se carga con "defer"), reintenta un par de veces.
function iniciarBotonesMicrosoftLector(ids, intento = 0) {
  if (typeof msal === "undefined") {
    if (intento < 20) {
      setTimeout(() => iniciarBotonesMicrosoftLector(ids, intento + 1), 150);
      return;
    }
    // Se ha agotado el margen de espera (3s) y la librería MSAL.js
    // sigue sin cargar (script bloqueado, CDN caído, red muy lenta...).
    // Sin este aviso, los botones se quedaban sin ningún listener
    // enganchado para siempre y parecía que "no hacían nada" al
    // pulsarlos, sin ningún error visible en ningún sitio.
    console.error("MSAL.js no ha cargado tras varios intentos: los botones de Microsoft no van a funcionar.");
    ids.forEach((id) => {
      const boton = document.getElementById(id);
      if (!boton) return;
      boton.addEventListener("click", () => {
        mostrarErrorAccesoLector("No se ha podido cargar el acceso con Microsoft. Comprueba tu conexión o desactiva bloqueadores de scripts para este sitio, o usa el correo electrónico.");
      });
    });
    return;
  }

  ids.forEach((id) => {
    const boton = document.getElementById(id);
    if (!boton) return;
    boton.addEventListener("click", async () => {
      if (boton.classList.contains("cargando")) return;
      boton.classList.add("cargando");
      try {
        const resultado = await getMsalApp().loginPopup({
          scopes: ["openid", "profile", "email"],
        });
        await alTerminarLoginMicrosoft(resultado.idToken, boton);
      } catch (err) {
        boton.classList.remove("cargando");
        // Igual que con el bloqueo del prompt de Google: si el popup
        // se cierra o el navegador lo bloquea, se avisa en vez de
        // dejar el botón "cargando" para siempre.
        mostrarErrorAccesoLector("No se ha podido abrir la ventana de Microsoft. Prueba a desactivar el bloqueador de ventanas emergentes para este sitio, o usa el correo electrónico.");
      }
    });
  });
}

// ---------- Acceso con cuenta de Discord (lectores) ----------
// A diferencia de Google/Microsoft (popup + id_token que se manda con
// fetch() a nuestro servidor), Discord usa un redirect completo: el
// botón manda al navegador entero a /api/readers/discord/iniciar, que
// a su vez redirige a discord.com; el usuario autoriza allí, y Discord
// devuelve al navegador a /api/readers/discord/callback (en el
// servidor, ver src/index.js), que finalmente redirige de vuelta AQUÍ
// (a la página que corresponda) con el token de sesión en la URL, ya
// que no hay ningún fetch() esperando la respuesta al otro lado de un
// redirect real de navegador.
//
// procesarRetornoDiscord() se llama al cargar cualquier página que
// tenga el botón de Discord (o a la que pueda volver el callback): si
// la URL trae "?sesionDiscord=...", recoge el token, pide los datos
// del lector a /api/readers/me y completa el login exactamente igual
// que si hubiera entrado por Google/Microsoft. Si en vez de eso trae
// "?errorDiscord=...", muestra el mismo mensaje de error que usan los
// demás flujos.
function iniciarBotonesDiscordLector(ids) {
  ids.forEach((id) => {
    const boton = document.getElementById(id);
    if (!boton) return;
    boton.addEventListener("click", () => {
      if (boton.classList.contains("cargando")) return;
      boton.classList.add("cargando");
      const volver = new URLSearchParams(location.search).get("volver") || "";
      location.href = `${API_URL}/api/readers/discord/iniciar?volver=${encodeURIComponent(volver)}`;
    });
  });
}

async function procesarRetornoDiscord() {
  const params = new URLSearchParams(location.search);
  const errorDiscord = params.get("errorDiscord");
  const sesionDiscord = params.get("sesionDiscord");
  if (!errorDiscord && !sesionDiscord) return;

  // Limpia la URL (quita el token/error de la barra de direcciones)
  // sin recargar la página ni perder el resto de la query string.
  params.delete("errorDiscord");
  params.delete("sesionDiscord");
  const urlLimpia = location.pathname + (params.toString() ? `?${params}` : "") + location.hash;
  history.replaceState(null, "", urlLimpia);

  const mostrarError = mostrarErrorAccesoLector;

  if (errorDiscord) {
    mostrarError(errorDiscord);
    return;
  }

  try {
    const res = await apiFetch("/api/readers/me", {
      headers: { Authorization: `Bearer ${sesionDiscord}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se ha podido completar el inicio de sesión con Discord");
    guardarSesionLector(sesionDiscord, data.reader);
    const volver = params.get("volver");
    location.href = volver || "index.html";
  } catch (err) {
    mostrarError(err.message);
  }
}

// ---------- Acceso con cuenta de X (lectores) ----------
// Mismo patrón que Discord (ver comentario justo arriba): X tampoco da
// un id_token verificable en el navegador como Google/Microsoft, así
// que se usa OAuth 2.0 "de toda la vida" con redirect completo. El
// botón manda al navegador entero a /api/readers/x/iniciar, que
// redirige a x.com; el usuario autoriza allí, y X devuelve al
// navegador a /api/readers/x/callback (en el servidor, ver
// src/index.js), que redirige de vuelta AQUÍ con el token de sesión en
// la URL, igual que Discord.
//
// procesarRetornoX() se llama al cargar cualquier página que tenga el
// botón de X (o a la que pueda volver el callback): si la URL trae
// "?sesionX=...", recoge el token, pide los datos del lector a
// /api/readers/me y completa el login exactamente igual que con
// Google/Microsoft/Discord. Si en vez de eso trae "?errorX=...",
// muestra el mismo mensaje de error que usan los demás flujos.
function iniciarBotonesXLector(ids) {
  ids.forEach((id) => {
    const boton = document.getElementById(id);
    if (!boton) return;
    boton.addEventListener("click", () => {
      if (boton.classList.contains("cargando")) return;
      boton.classList.add("cargando");
      const volver = new URLSearchParams(location.search).get("volver") || "";
      location.href = `${API_URL}/api/readers/x/iniciar?volver=${encodeURIComponent(volver)}`;
    });
  });
}

async function procesarRetornoX() {
  const params = new URLSearchParams(location.search);
  const errorX = params.get("errorX");
  const sesionX = params.get("sesionX");
  if (!errorX && !sesionX) return;

  // Limpia la URL (quita el token/error de la barra de direcciones)
  // sin recargar la página ni perder el resto de la query string.
  params.delete("errorX");
  params.delete("sesionX");
  const urlLimpia = location.pathname + (params.toString() ? `?${params}` : "") + location.hash;
  history.replaceState(null, "", urlLimpia);

  const mostrarError = mostrarErrorAccesoLector;

  if (errorX) {
    mostrarError(errorX);
    return;
  }

  try {
    const res = await apiFetch("/api/readers/me", {
      headers: { Authorization: `Bearer ${sesionX}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se ha podido completar el inicio de sesión con X");
    guardarSesionLector(sesionX, data.reader);
    await pedirCorreoSiEsSinteticoX(data.reader);
    const volver = params.get("volver");
    location.href = volver || "index.html";
  } catch (err) {
    mostrarError(err.message);
  }
}

// X no da un email real al hacer login (ver comentario largo sobre
// /api/readers/x/callback en src/index.js), así que el servidor guarda
// uno sintético (x-<id>@x.elotrofutbol.media) para poder crear la
// cuenta igualmente. Antes esto solo se pedía si el lector entraba en
// "Mi cuenta" y veía la tarjeta correspondiente (ver comprobarEmailPendienteX
// en cuenta.html); muchos no llegaban nunca a esa pantalla y se
// quedaban sin forma de recuperar la contraseña ni recibir avisos. Aquí
// se pide justo al volver del login con X, con EOF.preguntarEmail (ver
// ui-alertas.js): a diferencia de EOF.preguntar (genérico, sin validar
// nada), preguntarEmail valida el formato en el propio campo y, si el
// servidor rechaza el correo (duplicado, sintético, lo que sea),
// muestra ese error dentro del modal y deja corregir sin cerrarlo ni
// darlo por guardado.
async function pedirCorreoSiEsSinteticoX(reader) {
  const email = reader && reader.email;
  const esSintetico = typeof email === "string" && email.toLowerCase().endsWith("@x.elotrofutbol.media");
  if (!esSintetico || !window.EOF || !EOF.preguntarEmail) return;

  const guardado = await EOF.preguntarEmail(
    "Has entrado con tu cuenta de X, que no comparte tu correo real. Añade uno para poder recuperar tu contraseña y recibir avisos por email.",
    {
      placeholder: "tu@correo.com",
      textoConfirmar: "Guardar correo",
      onEnviar: async (nuevoEmail) => {
        const res = await apiFetchLector("/api/readers/me/email", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: nuevoEmail }),
        });
        const data = await res.json().catch(() => ({}));
        // Antes no se comprobaba res.ok: cualquier error del servidor
        // (correo duplicado, formato inválido según el backend...) se
        // trataba igual que un éxito y el modal se cerraba dándolo por
        // guardado sin más. Lanzando aquí, preguntarEmail lo muestra en
        // el propio campo y deja corregir.
        if (!res.ok) throw new Error(data.error || "No se ha podido guardar el correo.");
        if (data.token && data.reader) guardarSesionLector(data.token, data.reader);
      },
    }
  );
  // false = pulsó "Cancelar"/Escape/fuera del modal: respeta su decisión
  // y no insiste, podrá añadirlo luego desde "Mi cuenta" igualmente.
  if (guardado && window.EOF && EOF.toast) {
    EOF.toast("Correo guardado. Revisa tu bandeja de entrada para confirmarlo.", "exito");
  }
}

// Se ejecuta solo al cargar este script, en cualquier página (igual
// que procesarRetornoDiscord): el callback de X puede devolver
// directamente a "index.html" o a la página en la que el lector pulsó
// el botón (ver "volver" en iniciarBotonesXLector).
// Se guarda la promesa (no solo se invoca) para que páginas con un guard
// de "hace falta sesión de lector" que se ejecuta justo al cargar (ver
// guardLector() en cuenta.html) puedan esperar a que termine antes de
// decidir si redirigen a acceso.html. Sin esto había una carrera: el
// guard comprobaba sesionLectorActual() de forma síncrona mientras este
// await apiFetch(...) todavía no había terminado, así que el token nunca
// llegaba a guardarse en localStorage a tiempo y el guard mandaba de
// vuelta a acceso.html como si no se hubiera iniciado sesión -- pasaba
// siempre que se entraba a una página protegida (p. ej. "Dispositivos"
// en Mi cuenta) sin sesión previa y se completaba el login con X o
// Discord desde ahí, sobre todo en cuentas de X con correo aún
// sintético (más lentas por el aviso de "añade tu correo real").
window.eofRetornoXListo = procesarRetornoX();

// Se ejecuta solo al cargar este script, en cualquier página (no solo
// acceso.html): el callback de Discord puede devolver directamente a
// "index.html" o a la página en la que el lector pulsó el botón (ver
// "volver" en iniciarBotonesDiscordLector), así que este chequeo tiene
// que correr en todas partes, no solo en el formulario de login.
// Ver el comentario largo justo encima de eofRetornoXListo: mismo motivo,
// mismo arreglo, para el redirect completo de Discord.
window.eofRetornoDiscordListo = procesarRetornoDiscord();

// ---------- Banner de "verifica tu correo" ----------
// Antes, si un lector tenía el correo sin verificar (recién registrado
// sin confirmar, o recién entrado con X y con el correo real todavía
// sin confirmar tras pedirlo, ver pedirCorreoSiEsSinteticoX), lo único
// que existía en TODO el sitio era una frase suelta dentro del bloqueo
// de las encuestas (ver comprobarAccesoEncuesta en encuestas.js): si no
// intentaba votar, nunca se enteraba de que le faltaba ese paso, ni
// tenía ninguna forma sencilla de reenviarse el correo sin ir a buscar
// "¿no te llegó el correo?" en el formulario de login.
//
// Este banner (mismo patrón visual que #banner-ultima-hora de
// layout.js: franja fija arriba, cerrable, empuja la cabecera) se
// comprueba en CUALQUIER página con sesión de lector iniciada, no solo
// en Mi cuenta. Se cierra por esta pestaña/sesión (sessionStorage,
// mismo criterio que el banner de última hora) para no insistir en
// cada clic mientras se navega, pero vuelve a aparecer en una visita
// nueva mientras el correo siga sin confirmar.
async function comprobarBannerVerificarEmail() {
  const reader = sesionLectorActual();
  if (!reader) return;
  // Se refresca contra el servidor (no basta con lo que haya en
  // localStorage): si el lector confirma el correo en otra pestaña o
  // dispositivo, la sesión guardada aquí seguiría diciendo
  // email_verificado:false hasta que se actualizara por otro motivo.
  let readerFresco = reader;
  try {
    const res = await apiFetchLector("/api/readers/me");
    if (res.ok) {
      const data = await res.json();
      if (data.reader) {
        readerFresco = data.reader;
        localStorage.setItem(EOF_LECTOR_DATA_KEY, JSON.stringify({ ...reader, ...data.reader }));
      }
    }
  } catch {
    // Sin conexión o servidor caído: se sigue con lo que hubiera en
    // local en vez de no mostrar nada ni romper el resto de la página.
  }
  if (readerFresco.email_verificado) {
    quitarBannerVerificarEmailDelDOM();
    return;
  }
  if (sessionStorage.getItem("bannerVerificarEmailCerrado") === "1") return;
  pintarBannerVerificarEmail(readerFresco);
}

function quitarBannerVerificarEmailDelDOM() {
  const banner = document.getElementById("banner-verificar-email");
  if (!banner) return;
  banner.remove();
  document.body.classList.remove("con-banner-verificar-email");
}

function pintarBannerVerificarEmail(reader) {
  if (document.getElementById("banner-verificar-email")) return;

  const banner = document.createElement("div");
  banner.id = "banner-verificar-email";
  banner.innerHTML = `
    <div class="bve-franja">
      <span class="bve-icono" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="m4 6 8 7 8-7"/></svg>
      </span>
      <span class="bve-texto">Verifica tu correo <strong>${escapeHtml(reader.email || "")}</strong> para poder comentar, votar en encuestas y recuperar tu contraseña.</span>
      <button type="button" class="bve-reenviar" id="btnReenviarVerificacionBanner">Reenviar correo</button>
      <button type="button" class="bve-cerrar" aria-label="Cerrar aviso">&times;</button>
    </div>`;

  document.body.prepend(banner);
  document.body.classList.add("con-banner-verificar-email");
  // Altura real del banner (varía según si el texto ocupa una o dos
  // líneas, sobre todo en móvil con "flex-wrap"): se mide y se aplica
  // como variable CSS en vez de asumir un valor fijo, para que el resto
  // de la página (cabecera incluida) quede siempre justo debajo, sin
  // hueco ni solape.
  const ajustarAltoBanner = () => {
    document.documentElement.style.setProperty("--bve-alto", `${banner.offsetHeight}px`);
  };
  requestAnimationFrame(ajustarAltoBanner);
  window.addEventListener("resize", ajustarAltoBanner);

  banner.querySelector(".bve-cerrar").addEventListener("click", () => {
    quitarBannerVerificarEmailDelDOM();
    sessionStorage.setItem("bannerVerificarEmailCerrado", "1");
  });

  banner.querySelector("#btnReenviarVerificacionBanner").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = "Enviando…";
    try {
      // /api/readers/reenviar-verificacion no exige sesión (mismo
      // endpoint que usa el formulario de login para "¿no te llegó el
      // correo?"), basta con el email; siempre responde "ok" exista o
      // no la cuenta (para no filtrar qué correos están registrados),
      // así que aquí no hay un "error real" que mostrar salvo caída de
      // red, solo confirmar que se ha mandado.
      await apiFetch("/api/readers/reenviar-verificacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: reader.email }),
      });
      btn.textContent = "Correo enviado";
      if (window.EOF && EOF.toast) {
        EOF.toast("Te hemos enviado un nuevo enlace de verificación. Revisa tu bandeja de entrada (y spam).", "exito");
      }
      setTimeout(() => { btn.textContent = textoOriginal; btn.disabled = false; }, 20000);
    } catch {
      btn.textContent = textoOriginal;
      btn.disabled = false;
      if (window.EOF && EOF.toast) {
        EOF.toast("No se ha podido reenviar el correo. Comprueba tu conexión e inténtalo de nuevo.", "error");
      }
    }
  });
}

comprobarBannerVerificarEmail();
