/* Calculadora de sanciones: tarjetas amarillas acumuladas y ciclo de amonestaciones.
   Sin dependencias ni red. Estado en la URL (?comp=liga|elim|otro&n=4&ciclo=5) para poder compartirlo. */
(function () {
  "use strict";
  var CICLOS = { liga: 5, elim: 3 };
  var MAX_N = 99, MIN_CICLO = 2, MAX_CICLO = 20;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    n: $("csanN"), menos: $("csanMenos"), mas: $("csanMas"),
    cicloWrap: $("csanCicloWrap"), ciclo: $("csanCiclo"), cMenos: $("csanCicloMenos"), cMas: $("csanCicloMas"),
    estado: $("csanEstado"), ico: $("csanIco"), tit: $("csanTit"), txt: $("csanTxt"),
    puntos: $("csanPuntos"), progNum: $("csanProgNum"),
    dCiclo: $("csanDCiclo"), dActual: $("csanDActual"), dFaltan: $("csanDFaltan"), dSanc: $("csanDSanc")
  };
  if (!el.n || !el.estado) return;

  function entero(v, min, max, def) {
    var x = parseInt(v, 10);
    if (!isFinite(x)) return def;
    return Math.min(max, Math.max(min, x));
  }
  function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }
  function comp() {
    var r = document.querySelector('input[name="csanComp"]:checked');
    return r ? r.value : "liga";
  }
  function cicloActual() {
    var c = comp();
    return c === "otro" ? entero(el.ciclo.value, MIN_CICLO, MAX_CICLO, 5) : CICLOS[c];
  }

  /* Núcleo del cálculo (sin DOM), por si se quiere probar aparte. */
  function calcular(n, ciclo) {
    var enCiclo = n % ciclo;
    var completados = Math.floor(n / ciclo);
    var faltan = ciclo - enCiclo;
    return {
      n: n, ciclo: ciclo, enCiclo: enCiclo, completados: completados, faltan: faltan,
      cierraCiclo: n > 0 && enCiclo === 0
    };
  }
  window.eofCalcularSancion = calcular;

  function pintarPuntos(r) {
    var html = "";
    var llenos = r.cierraCiclo ? r.ciclo : r.enCiclo;
    for (var i = 0; i < r.ciclo; i++) {
      html += '<span class="csan-punto' + (i < llenos ? " on" : "") + (r.cierraCiclo ? " cierre" : "") + '"></span>';
    }
    el.puntos.innerHTML = html;
    el.progNum.textContent = llenos + " / " + r.ciclo;
  }

  function pintar() {
    var n = entero(el.n.value, 0, MAX_N, 0);
    var ciclo = cicloActual();
    var r = calcular(n, ciclo);

    var tono, ico, tit, txt;
    if (r.cierraCiclo) {
      tono = "danger"; ico = "!";
      tit = "Sanción por acumulación: 1 partido";
      txt = "La amarilla " + n + " cierra el ciclo " + r.completados + ". Se pierde el siguiente partido de la competición y el contador de ciclo vuelve a cero.";
    } else if (r.faltan === 1) {
      tono = "warn"; ico = "!";
      tit = "Apercibido: una más y se pierde un partido";
      txt = "Lleva " + plural(r.enCiclo, "amarilla", "amarillas") + " en este ciclo. La próxima amarilla cierra el ciclo.";
    } else if (n === 0) {
      tono = "ok"; ico = "✓";
      tit = "Sin amarillas";
      txt = "Le faltan " + r.faltan + " para cerrar el primer ciclo.";
    } else {
      tono = "ok"; ico = "✓";
      tit = "Sin riesgo inmediato";
      txt = "Lleva " + plural(r.enCiclo, "amarilla", "amarillas") + " en este ciclo y le faltan " + r.faltan + " para el partido de suspensión.";
    }
    el.estado.setAttribute("data-tono", tono);
    el.ico.textContent = ico;
    el.tit.textContent = tit;
    el.txt.textContent = txt;

    pintarPuntos(r);
    el.dCiclo.textContent = plural(ciclo, "tarjeta", "tarjetas");
    el.dActual.textContent = (r.cierraCiclo ? ciclo : r.enCiclo) + " de " + ciclo;
    el.dFaltan.textContent = r.cierraCiclo ? ciclo + " (ciclo nuevo)" : String(r.faltan);
    el.dSanc.textContent = String(r.completados);

    el.menos.disabled = n <= 0;
    el.mas.disabled = n >= MAX_N;
    el.cMenos.disabled = ciclo <= MIN_CICLO;
    el.cMas.disabled = ciclo >= MAX_CICLO;
    el.cicloWrap.hidden = comp() !== "otro";

    guardarUrl(n, ciclo);
  }

  function guardarUrl(n, ciclo) {
    try {
      var q = new URLSearchParams();
      var c = comp();
      if (c !== "liga") q.set("comp", c);
      if (c === "otro") q.set("ciclo", String(ciclo));
      if (n > 0) q.set("n", String(n));
      var s = q.toString();
      history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
    } catch (e) { /* sin historial: no pasa nada */ }
  }

  function leerUrl() {
    try {
      var q = new URLSearchParams(location.search);
      var c = q.get("comp");
      if (c === "elim" || c === "otro") {
        var r = document.querySelector('input[name="csanComp"][value="' + c + '"]');
        if (r) r.checked = true;
      }
      if (q.get("ciclo")) el.ciclo.value = entero(q.get("ciclo"), MIN_CICLO, MAX_CICLO, 5);
      if (q.get("n")) el.n.value = entero(q.get("n"), 0, MAX_N, 0);
    } catch (e) { /* URL rara: se usan los valores por defecto */ }
  }

  function mover(input, delta, min, max) {
    input.value = entero(entero(input.value, min, max, min) + delta, min, max, min);
    pintar();
  }

  el.menos.addEventListener("click", function () { mover(el.n, -1, 0, MAX_N); });
  el.mas.addEventListener("click", function () { mover(el.n, 1, 0, MAX_N); });
  el.cMenos.addEventListener("click", function () { mover(el.ciclo, -1, MIN_CICLO, MAX_CICLO); });
  el.cMas.addEventListener("click", function () { mover(el.ciclo, 1, MIN_CICLO, MAX_CICLO); });
  el.n.addEventListener("input", pintar);
  el.ciclo.addEventListener("input", pintar);
  el.n.addEventListener("change", function () { el.n.value = entero(el.n.value, 0, MAX_N, 0); pintar(); });
  el.ciclo.addEventListener("change", function () { el.ciclo.value = entero(el.ciclo.value, MIN_CICLO, MAX_CICLO, 5); pintar(); });
  Array.prototype.forEach.call(document.querySelectorAll('input[name="csanComp"]'), function (r) {
    r.addEventListener("change", pintar);
  });

  leerUrl();
  pintar();
})();
