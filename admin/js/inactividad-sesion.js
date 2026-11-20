// Ajuste «Cierre de sesión por inactividad» (Ajustes de cuenta > Seguridad).
// Por defecto el panel cierra la sesión tras 30 minutos sin actividad (la lógica del reloj está
// en admin.js). Aquí cada persona puede DESACTIVARLO en el dispositivo que está usando, pero solo
// aceptando expresamente el riesgo. Se guarda solo en este navegador (localStorage), no en el
// servidor, porque el riesgo es del dispositivo; la sesión sigue caducando a las 12 h igualmente.
(function () {
  "use strict";
  if (typeof USER === "undefined" || !USER) return;

  var CLAVE = "eof_inact_off_" + USER.username;

  function leer() { try { return localStorage.getItem(CLAVE); } catch (e) { return null; } }
  function guardar(v) { try { if (v) localStorage.setItem(CLAVE, v); else localStorage.removeItem(CLAVE); } catch (e) { /* nada */ } }
  function avisar(texto, tipo) { if (window.EOF && typeof EOF.toast === "function") EOF.toast(texto, tipo || "exito", 5000); }
  function cambio() { window.dispatchEvent(new CustomEvent("eof:inactividad-cambio")); }

  function fechaCorta(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }

  var tarjeta = null, check = null, nota = null, estado = null;

  function pintarEstado() {
    var apagado = leer();
    check.checked = !apagado;
    tarjeta.classList.toggle("inact-apagado", !!apagado);
    estado.textContent = apagado ? "Desactivado" : "Activado";
    nota.hidden = !apagado;
    if (apagado) {
      var f = fechaCorta(apagado);
      nota.textContent = "Desactivado en este dispositivo" + (f ? " desde el " + f : "") +
        ". Tu sesión no se cerrará sola aunque te alejes; caducará a las 12 horas de haber iniciado sesión.";
    }
  }

  // Modal de aceptación de riesgo (mismo aspecto que los avisos del sitio).
  function pedirAceptacion() {
    return new Promise(function (resolve) {
      // Los estilos base del modal (overlay fijo, caja, botones) los inyecta ui-alertas.js
      // la primera vez que se usa un aviso; los pedimos ya por si aún no se ha usado ninguno.
      if (window.EOF && typeof EOF._inyectarCss === "function") EOF._inyectarCss();
      var overlay = document.createElement("div");
      overlay.className = "eof-modal-overlay";
      var caja = document.createElement("div");
      caja.className = "eof-modal-caja inact-modal";
      caja.setAttribute("role", "alertdialog");
      caja.setAttribute("aria-modal", "true");
      caja.setAttribute("aria-labelledby", "inactModalTitulo");
      caja.innerHTML =
        '<div class="eof-modal-icono eof-modal-icono-error" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>' +
        '<h3 class="inact-modal-titulo" id="inactModalTitulo">Desactivar el cierre por inactividad</h3>' +
        '<p class="inact-modal-texto">Tu sesión <strong>no se cerrará sola</strong> aunque te alejes del ordenador.</p>' +
        '<ul class="inact-modal-lista">' +
        '<li><span class="inact-modal-punto" aria-hidden="true"></span><span>Cualquier persona con acceso a este dispositivo podría usar tu cuenta (publicar, editar o borrar contenido a tu nombre).</span></li>' +
        '<li><span class="inact-modal-punto" aria-hidden="true"></span><span>La sesión solo caducará por sí misma a las <strong>12 horas</strong> de haber iniciado sesión.</span></li>' +
        '<li><span class="inact-modal-punto inact-modal-punto-ok" aria-hidden="true"></span><span>Hazlo solo en un dispositivo personal y protegido, <strong>nunca</strong> en uno compartido o público. Podrás volver a activarlo cuando quieras.</span></li>' +
        '</ul>' +
        '<label class="inact-modal-acepto"><input type="checkbox" id="inactAcepto"><span>Entiendo el riesgo y lo acepto bajo mi responsabilidad.</span></label>' +
        '<div class="eof-modal-botones inact-modal-botones">' +
        '<button type="button" class="eof-btn eof-btn-secundario" id="inactCancelar">Cancelar</button>' +
        '<button type="button" class="eof-btn eof-btn-peligro" id="inactConfirmar" disabled>Desactivar</button>' +
        '</div>';
      overlay.appendChild(caja);
      document.body.appendChild(overlay);
      requestAnimationFrame(function () { overlay.classList.add("eof-modal-visible"); });

      var acepto = caja.querySelector("#inactAcepto");
      var ok = caja.querySelector("#inactConfirmar");
      var no = caja.querySelector("#inactCancelar");
      var cerrado = false;
      function cerrar(v) {
        if (cerrado) return;
        cerrado = true;
        document.removeEventListener("keydown", tecla, true);
        overlay.classList.remove("eof-modal-visible");
        setTimeout(function () { overlay.remove(); }, 200);
        resolve(v);
      }
      function tecla(e) {
        if (e.key === "Escape") { e.preventDefault(); cerrar(false); return; }
        if (e.key !== "Tab") return;
        // Mantiene el foco dentro del diálogo mientras está abierto.
        var f = Array.prototype.filter.call(caja.querySelectorAll("input, button"), function (n) { return !n.disabled; });
        if (!f.length) return;
        var primero = f[0], ultimo = f[f.length - 1];
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
        else if (!caja.contains(document.activeElement)) { e.preventDefault(); primero.focus(); }
      }
      document.addEventListener("keydown", tecla, true);
      acepto.addEventListener("change", function () { ok.disabled = !acepto.checked; });
      no.addEventListener("click", function () { cerrar(false); });
      ok.addEventListener("click", function () { if (acepto.checked) cerrar(true); });
      overlay.addEventListener("click", function (e) { if (e.target === overlay) cerrar(false); });
      setTimeout(function () { acepto.focus(); }, 60);
    });
  }

  function montar() {
    var sub = document.getElementById("subpanel-seguridad");
    if (!sub || document.getElementById("seguridadInactividadCont")) return;
    tarjeta = document.createElement("div");
    tarjeta.className = "form-card";
    tarjeta.id = "seguridadInactividadCont";
    tarjeta.innerHTML =
      '<header class="inact-cab">' +
      '<span class="inact-icono" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.1 7.5 9.5 4.4-1.4 7.5-5.1 7.5-9.5V6L12 3z"/><path d="M12 8.5V12l2.4 1.6"/></svg></span>' +
      '<div class="inact-cab-texto">' +
      '<h3 class="titulo-subseccion inact-titulo">Cierre de sesión por inactividad</h3>' +
      '<p class="ayuda-editor inact-lead">Por seguridad, el panel cierra tu sesión tras <strong>30 minutos sin actividad</strong> (te avisa 2 minutos antes). Protege tu cuenta si te alejas del ordenador sin cerrarla.</p>' +
      '</div>' +
      '<span class="inact-estado" id="inactividadEstado">Activado</span>' +
      '</header>' +
      '<label class="inact-interruptor" for="inactividadActiva">' +
      '<span class="inact-interruptor-texto"><span class="inact-interruptor-titulo">Cerrar la sesión tras 30 minutos sin actividad</span>' +
      '<span class="inact-interruptor-sub">Recomendado. El ajuste vale solo para este dispositivo.</span></span>' +
      '<input type="checkbox" role="switch" id="inactividadActiva" checked>' +
      '<span class="inact-pista" aria-hidden="true"><span class="inact-pulgar"></span></span>' +
      '</label>' +
      '<ol class="inact-pasos" aria-label="Qué ocurre si dejas de usar el panel">' +
      '<li class="inact-paso"><span class="inact-paso-min">0 min</span><span class="inact-paso-txt">Trabajas con normalidad; cada acción reinicia el reloj.</span></li>' +
      '<li class="inact-paso inact-paso-aviso"><span class="inact-paso-min">28 min</span><span class="inact-paso-txt">Aparece un aviso con cuenta atrás de 2 minutos.</span></li>' +
      '<li class="inact-paso inact-paso-fin"><span class="inact-paso-min">30 min</span><span class="inact-paso-txt">Se cierra la sesión y guardamos un borrador si estabas escribiendo.</span></li>' +
      '</ol>' +
      '<p class="inact-nota-riesgo" id="inactividadNota" role="status" hidden></p>';
    sub.appendChild(tarjeta);
    check = tarjeta.querySelector("#inactividadActiva");
    nota = tarjeta.querySelector("#inactividadNota");
    estado = tarjeta.querySelector("#inactividadEstado");

    check.addEventListener("change", function () {
      if (check.checked) {
        // Volver a activarlo no tiene riesgo: sin confirmación.
        guardar(null);
        cambio();
        pintarEstado();
        avisar("Cierre por inactividad activado: tu sesión se cerrará tras 30 minutos sin actividad.");
        return;
      }
      // Apagarlo sí: se deja el interruptor como estaba hasta que se acepte el riesgo.
      check.checked = true;
      pedirAceptacion().then(function (acepta) {
        if (!acepta) { pintarEstado(); return; }
        guardar(new Date().toISOString());
        cambio();
        pintarEstado();
        avisar("Cierre por inactividad desactivado en este dispositivo. Puedes volver a activarlo cuando quieras.", "info");
      });
    });
    pintarEstado();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
})();
