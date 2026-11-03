// Barra de navegación inferior del panel en móvil (estilo app).
// No duplica permisos ni lógica: lee las entradas que ya construye menu-lateral.js
// (#menuLateral .ml-item; las que el rol no puede ver quedan con display:none) y, al tocar
// una, hace click en ella. Muestra las 4 primeras visibles según PRIORIDAD y un botón
// "Más" que abre el cajón completo. Solo se ve por debajo de 900 px (ver movil-app.css).
(function () {
  "use strict";

  var PRIORIDAD = ["Noticias", "Resultados", "Contenido", "Solicitudes de edición", "Comentarios", "Votaciones", "Tienda"];
  var MAX = 4;
  var barra, huella = "", pendiente = false;

  var ICONO_MAS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>';

  function entradas() {
    return Array.prototype.slice.call(document.querySelectorAll("#menuLateral .ml-item"))
      .filter(function (el) { return el.style.display !== "none"; });
  }
  function texto(el) { var t = el.querySelector(".ml-txt"); return t ? t.textContent.trim() : ""; }

  function vibrar() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }

  function pintar() {
    pendiente = false;
    if (!barra) return;
    var todas = entradas();
    var elegidas = [];
    PRIORIDAD.forEach(function (t) {
      if (elegidas.length >= MAX) return;
      var el = todas.filter(function (x) { return texto(x) === t; })[0];
      if (el) elegidas.push(el);
    });
    // Si el rol casi no tiene entradas prioritarias, se completa con las primeras visibles.
    todas.forEach(function (el) { if (elegidas.length < MAX && elegidas.indexOf(el) < 0) elegidas.push(el); });

    var hayActivaFuera = todas.some(function (el) { return el.classList.contains("activo") && elegidas.indexOf(el) < 0; });
    var sig = elegidas.map(function (el) {
      var b = el.querySelector(".ml-badge");
      return texto(el) + (el.classList.contains("activo") ? "*" : "") + (b && b.style.display !== "none" ? b.textContent : "");
    }).join("|") + "|" + hayActivaFuera;
    if (sig === huella) return;
    huella = sig;

    // Solo se quitan los botones: las capas de cristal (.eof-lg-base/.eof-lg-lente) se quedan
    [].slice.call(barra.children).forEach(function (n) { if (n.classList.contains("bn-item")) barra.removeChild(n); });
    elegidas.forEach(function (el) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "bn-item" + (el.classList.contains("activo") ? " activo" : "");
      var svg = el.querySelector("svg");
      var ins = el.querySelector(".ml-badge");
      var hayBadge = ins && ins.style.display !== "none" && ins.textContent.trim() && ins.textContent.trim() !== "0";
      b.innerHTML = '<span class="bn-ico">' + (svg ? svg.outerHTML : "") + (hayBadge ? '<span class="bn-badge"></span>' : "") + '</span><span class="bn-txt"></span>';
      b.querySelector(".bn-txt").textContent = texto(el).replace("Solicitudes de edición", "Solicitudes");
      if (el.classList.contains("activo")) b.setAttribute("aria-current", "page");
      b.addEventListener("click", function () {
        vibrar();
        if (el.classList.contains("activo")) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
        el.click();
      });
      barra.appendChild(b);
    });
    var mas = document.createElement("button");
    mas.type = "button";
    mas.className = "bn-item" + (hayActivaFuera ? " activo" : "");
    mas.setAttribute("aria-label", "Más secciones");
    mas.innerHTML = '<span class="bn-ico">' + ICONO_MAS + '</span><span class="bn-txt">Más</span>';
    mas.addEventListener("click", function () {
      vibrar();
      var a = document.getElementById("menuLateralAbrir");
      if (a) a.click();
    });
    barra.appendChild(mas);
  }

  function programar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(pintar);
  }

  function iniciar() {
    var menu = document.getElementById("menuLateral");
    if (!menu) { setTimeout(iniciar, 300); return; }
    barra = document.createElement("nav");
    barra.id = "navApp";
    barra.setAttribute("aria-label", "Navegación rápida");
    document.body.appendChild(barra);
    document.body.classList.add("con-nav-app");
    new MutationObserver(programar).observe(menu, { attributes: true, attributeFilter: ["class", "style"], subtree: true, childList: true, characterData: true });
    pintar();

    // Con el teclado abierto la barra estorba: se oculta mientras hay un campo de texto enfocado.
    var esCampo = function (el) {
      return el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(checkbox|radio|button|submit|file|range|color)$/.test(el.type || "");
    };
    document.addEventListener("focusin", function (e) { if (esCampo(e.target)) document.body.classList.add("bn-teclado"); });
    document.addEventListener("focusout", function () { setTimeout(function () { if (!esCampo(document.activeElement)) document.body.classList.remove("bn-teclado"); }, 120); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
