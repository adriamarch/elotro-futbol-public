/* Funcionalidades: desplegable "Más" de la barra de secciones (modo menú superior).
   Los botones de dentro siguen siendo los de siempre (data-subtab): solo se abre/cierra el menú. */
(function () {
  "use strict";
  function iniciar() {
    var caja = document.getElementById("funcMas");
    var btn = document.getElementById("funcMasBtn");
    var menu = document.getElementById("funcMasMenu");
    if (!caja || !btn || !menu) return;
    function poner(abierto) {
      caja.classList.toggle("abierto", abierto);
      btn.setAttribute("aria-expanded", abierto ? "true" : "false");
    }
    btn.addEventListener("click", function (e) { e.stopPropagation(); poner(!caja.classList.contains("abierto")); });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); poner(!caja.classList.contains("abierto")); }
    });
    menu.addEventListener("click", function (e) { if (e.target.closest("button")) poner(false); });
    document.addEventListener("click", function (e) { if (!e.target.closest("#funcMas")) poner(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") poner(false); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
