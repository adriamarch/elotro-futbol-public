// Vigilante de sesión del panel.
// Problema: si un admin elimina (o desactiva) la cuenta de un colaborador mientras tiene el panel
// abierto, el servidor ya rechaza sus peticiones (401), pero el panel solo cerraba sesión cuando
// ALGUNA petición propia daba 401 (y no todas las pestañas hacen peticiones solas). Resultado:
// el colaborador seguía viendo el panel "abierto" con todo vacío.
// Esto comprueba la sesión contra la API PRINCIPAL (la que tiene la fila real de la sesión)
// cada 45 s con la pestaña visible, al volver a la pestaña y al recuperar la red, y cierra la
// sesión en cuanto el 401 se confirma. Fallos de red, 5xx o timeouts NUNCA cierran sesión.
(function () {
  "use strict";

  var INTERVALO_MS = 45000;
  var TIMEOUT_MS = 8000;
  var CONFIRMAR_MS = 3000;      // segunda comprobación antes de expulsar (evita falsos positivos)
  var GRACIA_LOGIN_MS = 15000;  // igual que EOF_MARGEN_GRACIA_LOGIN_MS de admin.js
  var comprobando = false;
  var cerrando = false;
  var ultimaComprobacion = 0;

  function token() { try { return localStorage.getItem("eof_token"); } catch (e) { return null; } }

  function dentroDeGraciaLogin() {
    try {
      var en = Number(sessionStorage.getItem("eof_login_en") || 0);
      return en > 0 && (Date.now() - en) < GRACIA_LOGIN_MS;
    } catch (e) { return false; }
  }

  function base() {
    return (typeof PRIMARY_API !== "undefined" && PRIMARY_API) ? PRIMARY_API : "";
  }

  // Devuelve true (401), false (sesión viva) o null (no se pudo saber).
  function sesionRechazada() {
    var t = token();
    if (!t || !base()) return Promise.resolve(null);
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
    return fetch(base() + "/api/me", {
      headers: { Authorization: "Bearer " + t },
      cache: "no-store",
      signal: ctl ? ctl.signal : undefined,
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (res.status === 401) return true;
      if (res.ok) return false;
      return null;
    }).catch(function () {
      if (timer) clearTimeout(timer);
      return null;
    });
  }

  function limpiarYSalir() {
    try {
      localStorage.removeItem("eof_token");
      localStorage.removeItem("eof_user");
    } catch (e) { /* nada */ }
    location.href = "login.html";
  }

  function avisarYCerrar() {
    if (cerrando) return;
    cerrando = true;
    // El token ya no sirve: se borra YA para que ninguna otra petición lo use.
    try { localStorage.removeItem("eof_token"); } catch (e) { /* nada */ }
    document.title = "🔒 Sesión cerrada · ELOTROFÚTBOLTV";
    var el = document.createElement("div");
    el.className = "sesion-cerrada";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "sesionInvalidaTitulo");
    el.innerHTML =
      '<div class="sesion-cerrada-fondo" aria-hidden="true"><span></span><span></span></div>' +
      '<div class="sesion-cerrada-tarjeta">' +
      '<h2 id="sesionInvalidaTitulo">Sesión cerrada</h2>' +
      '<p class="sesion-cerrada-sub">Tu sesión ya no es válida: la cuenta ha sido eliminada o desactivada, ' +
      'se ha cambiado tu rol, o la sesión se cerró desde otro sitio. Vuelve a entrar para continuar.</p>' +
      '<button type="button" class="sesion-cerrada-boton" id="sesionInvalidaBoton">Entendido</button>' +
      '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("visible"); });
    var boton = el.querySelector("#sesionInvalidaBoton");
    boton.addEventListener("click", limpiarYSalir);
    try { boton.focus({ preventScroll: true }); } catch (e) { /* nada */ }
    // Si nadie pulsa, se sale solo: la sesión ya está muerta.
    setTimeout(limpiarYSalir, 8000);
  }

  function comprobar(forzar) {
    if (cerrando || comprobando || !token()) return;
    if (!forzar && document.hidden) return;
    if (dentroDeGraciaLogin()) return;
    if (!forzar && Date.now() - ultimaComprobacion < INTERVALO_MS - 5000) return;
    comprobando = true;
    ultimaComprobacion = Date.now();
    sesionRechazada().then(function (r1) {
      if (r1 !== true) { comprobando = false; return; }
      // Confirmación: un 401 aislado no basta.
      setTimeout(function () {
        sesionRechazada().then(function (r2) {
          comprobando = false;
          if (r2 === true && !dentroDeGraciaLogin()) avisarYCerrar();
        });
      }, CONFIRMAR_MS);
    });
  }

  setInterval(function () { comprobar(false); }, INTERVALO_MS);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) comprobar(true); });
  window.addEventListener("focus", function () { comprobar(false); });
  window.addEventListener("online", function () { comprobar(true); });
})();
