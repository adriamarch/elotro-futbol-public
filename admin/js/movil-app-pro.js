// Panel · refinado app en móvil: añade al cajón un bloque de perfil (arriba) y acciones (abajo).
// No toca permisos ni la lógica del menú: solo inserta nodos y reutiliza logout() y el cierre existente.
(function () {
  "use strict";
  var ROLES = { admin: "Administrador", fotografo: "Fotógrafo", redactor: "Redactor", colaborador: "Colaborador" };
  function usuario() { try { return JSON.parse(localStorage.getItem("eof_user") || "null"); } catch (e) { return null; } }
  function iniciales(n) { return (n || "").trim().split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join("").toUpperCase() || "?"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function cerrar() {
    var abrir = document.getElementById("menuLateralAbrir");
    if (document.body.classList.contains("ml-abierto") && abrir) abrir.click();
    else document.body.classList.remove("ml-abierto");
  }
  function montar() {
    var menu = document.getElementById("menuLateral");
    if (!menu) return false;
    var u = usuario() || {};
    if (!menu.querySelector(".mlp-perfil")) {
      var p = document.createElement("div");
      p.className = "mlp-perfil";
      var nombre = u.nombre || u.username || "Cuenta";
      p.innerHTML = '<span class="mlp-avatar">' + esc(iniciales(nombre)) + '</span>' +
        '<div class="mlp-datos"><strong>' + esc(nombre) + '</strong><span>' + esc(ROLES[u.rol] || "Equipo") + '</span></div>' +
        '<button type="button" class="mlp-cerrar" aria-label="Cerrar menú"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
      p.querySelector(".mlp-cerrar").addEventListener("click", cerrar);
      menu.insertBefore(p, menu.firstChild);
    }
    if (!menu.querySelector(".mlp-pie")) {
      var f = document.createElement("div");
      f.className = "mlp-pie";
      f.innerHTML = '<a href="/">Ver la web</a><button type="button" class="mlp-salir">Cerrar sesión</button>';
      f.querySelector(".mlp-salir").addEventListener("click", function () { if (typeof window.logout === "function") window.logout(); });
      menu.appendChild(f);
    }
    return true;
  }
  function iniciar() {
    var menu = document.getElementById("menuLateral");
    if (!menu) { setTimeout(iniciar, 300); return; }
    montar();
    // menu-lateral.js puede repintar sus entradas: si el perfil o el pie desaparecen, se vuelven a poner.
    var pend = false;
    new MutationObserver(function () {
      if (pend) return; pend = true;
      requestAnimationFrame(function () { pend = false; montar(); });
    }).observe(menu, { childList: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
