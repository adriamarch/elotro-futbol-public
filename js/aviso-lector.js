/* Aviso "solo para lectores": un único componente para Porras, Mapa, Ranking y el resto de utilidades.
   Uso:  contenedor.innerHTML = EOFAvisoLector.html("porras");   o   EOFAvisoLector.montar(elemento, "mapa");
   Al pulsar "Inicia sesión o regístrate" se cierra antes la sesión de colaborador (si hay una) y se
   lleva a acceso.html para entrar como lector. Estilos: css/aviso-lector.css. */
(function () {
  "use strict";

  var VISUALES = {
    ruta: '<svg viewBox="0 0 220 200" xmlns="http://www.w3.org/2000/svg" focusable="false"><path class="av-ruta" d="M48 58 C 90 30, 120 80, 150 52 S 186 120, 162 150 S 92 170, 60 140"/><circle class="av-halo" cx="150" cy="52" r="14"/><circle class="av-halo av-halo-2" cx="60" cy="140" r="14"/><circle class="av-punto av-on" cx="48" cy="58" r="6"/><circle class="av-punto av-on" cx="150" cy="52" r="6"/><circle class="av-punto av-on" cx="162" cy="150" r="6"/><circle class="av-punto" cx="60" cy="140" r="6"/><circle class="av-punto" cx="108" cy="104" r="5"/><circle class="av-punto" cx="190" cy="92" r="5"/></svg>'
  };

  var TEXTOS = {
    mapa: {
      titulo: "Inicia sesión para crear tu mapa",
      texto: "Con tu cuenta de lector guardamos tus estadios y puedes retomar el mapa desde cualquier dispositivo.",
      ventajas: ["Tus estadios se guardan solos, sin perder nada", "Calcula los km de tus desplazamientos", "Descarga y comparte tu mapa con tu equipo"]
    },
    porras: {
      titulo: "Inicia sesión para jugar las porras",
      texto: "Con tu cuenta de lector guardamos la porra de cada jornada y sumas puntos en el ranking.",
      ventajas: ["Tu porra se guarda sola en cuanto la escribes", "Suma puntos y compite con el resto de lectores", "Consulta tu resumen de la temporada"]
    },
    ranking: {
      titulo: "Inicia sesión para entrar en el ranking",
      texto: "Marca tus estadios en tu mapa y aparecerás entre los lectores que más han viajado.",
      ventajas: ["Compara tus estadios y tus km con los demás"],
      compacto: true
    },
    general: {
      titulo: "Inicia sesión para usar esta utilidad",
      texto: "Esta herramienta es para lectores con cuenta de ELOTROFÚTBOLTV.",
      ventajas: ["Es gratis", "Tus datos se guardan en tu cuenta"]
    }
  };

  function esc(s) {
    return typeof escapeHtml === "function" ? escapeHtml(String(s == null ? "" : s))
      : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  /* Sesión de colaborador (redactor, fotógrafo, admin) guardada en este navegador, o null. */
  function colaborador() {
    try {
      var t = localStorage.getItem("eof_token"), u = JSON.parse(localStorage.getItem("eof_user") || "null");
      return t && u ? u : null;
    } catch (e) { return null; }
  }

  function cerrarColaborador() {
    try { localStorage.removeItem("eof_token"); localStorage.removeItem("eof_user"); } catch (e) { /* ok */ }
  }

  function urlAcceso() {
    return "acceso.html?volver=" + encodeURIComponent(location.pathname + location.search + location.hash);
  }

  function html(clave, opciones) {
    var d = TEXTOS[clave] || TEXTOS.general, o = opciones || {};
    var compacto = o.compacto != null ? o.compacto : d.compacto;
    var col = colaborador();
    var nota = col
      ? '<span class="aviso-lector-colab" role="note">Ahora mismo tienes abierta tu sesión de colaborador' + (col.nombre || col.username ? " (<b>" + esc(col.nombre || col.username) + "</b>)" : "") + '. Al continuar la cerraremos para que entres como lector.</span>'
      : "";
    return '<section class="aviso-lector' + (compacto ? " aviso-lector-compacto" : "") + '" aria-labelledby="avisoLectorTitulo-' + esc(clave) + '">' +
      '<div class="aviso-lector-visual" aria-hidden="true">' + VISUALES.ruta +
      '<span class="aviso-lector-candado"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="11" width="15" height="9.5" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span></div>' +
      '<div class="aviso-lector-cuerpo">' +
      '<span class="aviso-lector-etq">Solo para lectores</span>' +
      '<h2 id="avisoLectorTitulo-' + esc(clave) + '">' + esc(o.titulo || d.titulo) + '</h2>' +
      '<p>' + esc(o.texto || d.texto) + '</p>' +
      '<ul class="aviso-lector-ventajas">' + (o.ventajas || d.ventajas).map(function (v) { return "<li>" + esc(v) + "</li>"; }).join("") + '</ul>' +
      '<div class="aviso-lector-acciones">' + nota +
      '<a class="aviso-lector-btn" href="' + esc(urlAcceso()) + '" data-aviso-acceso>Inicia sesión o regístrate</a>' +
      '<small>Es gratis y solo te llevará un minuto.</small></div>' +
      '</div></section>';
  }

  function montar(el, clave, opciones) {
    if (!el) return;
    el.innerHTML = html(clave, opciones);
    el.hidden = false;
  }

  /* Un solo manejador para todos los avisos (también los que se pintan más tarde). */
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("[data-aviso-acceso]");
    if (!a) return;
    ev.preventDefault();
    cerrarColaborador();                 // 1) cierra la sesión de colaborador, si la había
    location.href = urlAcceso();         // 2) y lleva a iniciar sesión como lector
  });

  window.EOFAvisoLector = { html: html, montar: montar, colaborador: colaborador, cerrarColaborador: cerrarColaborador };
})();
