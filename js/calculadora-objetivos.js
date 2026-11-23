/* Calculadora de objetivos: puntos que faltan, victorias/empates necesarios y ritmo.
   Sin dependencias ni red. Estado en la URL (?tot=38&pj=20&pts=22&meta=45) para poder compartirlo. */
(function () {
  "use strict";
  var DEF = { tot: 38, pj: 20, pts: 22, meta: 45 };
  var MAX_COMBOS = 6;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    tot: $("cobjTot"), pj: $("cobjPJ"), pts: $("cobjPts"), meta: $("cobjMeta"),
    chips: $("cobjChips"),
    estado: $("cobjEstado"), ico: $("cobjIco"), tit: $("cobjTit"), txt: $("cobjTxt"),
    barAct: $("cobjBarAct"), barProy: $("cobjBarProy"), marca: $("cobjMarca"),
    lAct: $("cobjLAct"), lProy: $("cobjLProy"), lMeta: $("cobjLMeta"),
    dFaltan: $("cobjDFaltan"), dResto: $("cobjDResto"), dJuego: $("cobjDJuego"), dRitmo: $("cobjDRitmo"),
    combosWrap: $("cobjCombosWrap"), combos: $("cobjCombos"), copiar: $("cobjCopiar")
  };
  if (!el.tot || !el.estado) return;

  function entero(v, min, max, def) {
    var x = parseInt(v, 10);
    if (!isFinite(x)) return def;
    return Math.min(max, Math.max(min, x));
  }
  function num(n, dec) {
    return Number(n).toLocaleString("es-ES", { maximumFractionDigits: dec == null ? 0 : dec });
  }
  function plural(n, uno, varios) { return num(n) + " " + (n === 1 ? uno : varios); }
  function limites(input) {
    return { min: parseInt(input.min, 10), max: parseInt(input.max, 10) };
  }

  /* Núcleo del cálculo (sin DOM), por si se quiere probar aparte. */
  function calcular(tot, pj, pts, meta) {
    var resto = Math.max(0, tot - pj);
    var enJuego = resto * 3;
    var faltan = meta - pts;
    var ritmoActual = pj > 0 ? pts / pj : 0;
    var proyeccion = Math.round(pts + ritmoActual * resto);
    var r = {
      tot: tot, pj: pj, pts: pts, meta: meta,
      resto: resto, enJuego: enJuego, faltan: faltan,
      ritmoActual: ritmoActual, proyeccion: proyeccion,
      ritmoNecesario: resto > 0 ? Math.max(0, faltan) / resto : 0,
      cumplido: faltan <= 0,
      imposible: faltan > enJuego,
      combos: []
    };
    if (!r.cumplido && !r.imposible) {
      for (var v = 0; v <= resto; v++) {
        var e = Math.max(0, faltan - 3 * v);
        if (v + e <= resto) {
          r.combos.push({ v: v, e: e, pts: 3 * v + e, libres: resto - v - e });
          if (e === 0) break;
        }
      }
    }
    return r;
  }
  window.eofCalcularObjetivo = calcular;

  function muestra(combos) {
    if (combos.length <= MAX_COMBOS) return combos;
    var out = [], ult = combos.length - 1;
    for (var i = 0; i < MAX_COMBOS; i++) out.push(combos[Math.round(i * ult / (MAX_COMBOS - 1))]);
    return out;
  }

  function pintarEstado(r) {
    var tono, ico, tit, txt, pct;
    if (r.cumplido) {
      tono = "ok"; ico = "✓";
      tit = "¡Objetivo conseguido!";
      txt = "Ya tienes " + plural(r.pts, "punto", "puntos") + (r.pts > r.meta ? ", " + plural(r.pts - r.meta, "más", "más") + " de los " + num(r.meta) + " que te marcabas." : ", justo los que te marcabas.");
    } else if (r.imposible) {
      tono = "danger"; ico = "✕";
      tit = "Con estos datos no llegas";
      txt = "Te faltan " + plural(r.faltan, "punto", "puntos") + " y solo quedan " + num(r.enJuego) + " en juego (" + plural(r.resto, "partido", "partidos") + "). Revisa los números o baja el objetivo.";
    } else {
      pct = r.faltan / r.enJuego;
      if (pct <= 0.4) {
        tono = "ok"; ico = "↗";
        tit = "Vas bien encaminado";
        txt = "Necesitas el " + num(Math.round(pct * 100)) + " % de los puntos que quedan en juego.";
      } else if (pct <= 0.7) {
        tono = "warn"; ico = "!";
        tit = "Toca apretar";
        txt = "Necesitas el " + num(Math.round(pct * 100)) + " % de los puntos que quedan: " + num(r.ritmoNecesario, 2) + " por partido de media.";
      } else {
        tono = "danger"; ico = "!";
        tit = "Muy difícil, pero posible";
        txt = "Necesitas el " + num(Math.round(pct * 100)) + " % de los puntos que quedan: casi todo victorias.";
      }
      if (r.pj > 0) txt += " Hasta ahora llevas " + num(r.ritmoActual, 2) + " por partido.";
    }
    el.estado.setAttribute("data-tono", tono);
    el.ico.textContent = ico;
    el.tit.textContent = tit;
    el.txt.textContent = txt;
  }

  function pintarBarra(r) {
    var escala = Math.max(r.meta, r.proyeccion, r.pts, 1) * 1.12;
    var p = function (x) { return Math.min(100, Math.max(0, x / escala * 100)).toFixed(2) + "%"; };
    el.barAct.style.width = p(r.pts);
    el.barProy.style.width = p(r.proyeccion);
    el.marca.style.left = p(r.meta);
    el.lAct.textContent = num(r.pts);
    el.lProy.textContent = num(r.proyeccion);
    el.lMeta.textContent = num(r.meta);
  }

  function pintarCombos(r) {
    var lista = muestra(r.combos);
    if (!lista.length) { el.combosWrap.hidden = true; el.combos.innerHTML = ""; return; }
    el.combosWrap.hidden = false;
    el.combos.innerHTML = lista.map(function (c) {
      var partes = [];
      if (c.v) partes.push("<b>" + plural(c.v, "victoria", "victorias") + "</b>");
      if (c.e) partes.push("<b>" + plural(c.e, "empate", "empates") + "</b>");
      var margen = c.libres > 0
        ? "Puedes no puntuar en " + plural(c.libres, "partido", "partidos") + "."
        : "No puedes fallar ninguno.";
      return "<li><span class=\"cobj-combo-ico\" aria-hidden=\"true\">" + num(c.pts) + "</span>" +
        "<span class=\"cobj-combo-txt\">" + partes.join(" + ") + "<small>" + margen + "</small></span></li>";
    }).join("");
  }

  function leer() {
    var tot = entero(el.tot.value, limites(el.tot).min, limites(el.tot).max, DEF.tot);
    var pj = Math.min(tot, entero(el.pj.value, limites(el.pj).min, limites(el.pj).max, DEF.pj));
    var pts = Math.min(pj * 3, entero(el.pts.value, limites(el.pts).min, limites(el.pts).max, DEF.pts));
    var meta = entero(el.meta.value, limites(el.meta).min, limites(el.meta).max, DEF.meta);
    return { tot: tot, pj: pj, pts: pts, meta: meta };
  }

  function normalizarCampos() {
    var d = leer();
    el.tot.value = d.tot; el.pj.value = d.pj; el.pts.value = d.pts; el.meta.value = d.meta;
  }

  function pintar() {
    var d = leer();
    var r = calcular(d.tot, d.pj, d.pts, d.meta);

    pintarEstado(r);
    pintarBarra(r);
    pintarCombos(r);

    el.dFaltan.textContent = r.cumplido ? "0" : num(r.faltan);
    el.dResto.textContent = num(r.resto);
    el.dJuego.textContent = num(r.enJuego);
    el.dRitmo.textContent = r.cumplido ? "—" : r.imposible ? "Imposible" : num(r.ritmoNecesario, 2);

    Array.prototype.forEach.call(el.chips.querySelectorAll("[data-tot]"), function (b) {
      b.setAttribute("aria-pressed", String(parseInt(b.getAttribute("data-tot"), 10) === d.tot));
    });
    Array.prototype.forEach.call(document.querySelectorAll(".cobj-stepper button"), function (b) {
      var inp = $(b.getAttribute("data-para")), l = limites(inp);
      var v = entero(inp.value, l.min, l.max, l.min), paso = parseInt(b.getAttribute("data-paso"), 10);
      var tope = l.max;
      if (inp === el.pj) tope = Math.min(l.max, d.tot);
      if (inp === el.pts) tope = Math.min(l.max, d.pj * 3);
      b.disabled = paso < 0 ? v <= l.min : v >= tope;
    });

    guardarUrl(d);
  }

  function guardarUrl(d) {
    try {
      var q = new URLSearchParams();
      ["tot", "pj", "pts", "meta"].forEach(function (k) { if (d[k] !== DEF[k]) q.set(k, String(d[k])); });
      var s = q.toString();
      history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
    } catch (e) { /* sin historial: no pasa nada */ }
  }

  function leerUrl() {
    try {
      var q = new URLSearchParams(location.search);
      ["tot", "pj", "pts", "meta"].forEach(function (k) {
        if (q.get(k) !== null && el[k]) el[k].value = q.get(k);
      });
    } catch (e) { /* URL rara: se usan los valores por defecto */ }
    normalizarCampos();
  }

  /* Steppers */
  Array.prototype.forEach.call(document.querySelectorAll(".cobj-stepper button"), function (b) {
    b.addEventListener("click", function () {
      var inp = $(b.getAttribute("data-para")), l = limites(inp);
      inp.value = entero(entero(inp.value, l.min, l.max, l.min) + parseInt(b.getAttribute("data-paso"), 10), l.min, l.max, l.min);
      normalizarCampos();
      pintar();
    });
  });
  [el.tot, el.pj, el.pts, el.meta].forEach(function (inp) {
    inp.addEventListener("input", pintar);
    inp.addEventListener("change", function () { normalizarCampos(); pintar(); });
  });

  /* Atajos de tamaño de liga */
  el.chips.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-tot]");
    if (!b) return;
    el.tot.value = b.getAttribute("data-tot");
    normalizarCampos();
    pintar();
  });

  /* Copiar enlace */
  var tCopiar;
  el.copiar.addEventListener("click", function () {
    var url = location.href, etiqueta = "Copiar enlace con mis datos";
    var listo = function (ok) {
      el.copiar.textContent = ok ? "¡Enlace copiado!" : "Copia el enlace de la barra de direcciones";
      clearTimeout(tCopiar);
      tCopiar = setTimeout(function () { el.copiar.textContent = etiqueta; }, 2200);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { listo(true); }, function () { listo(false); });
      } else { listo(false); }
    } catch (e) { listo(false); }
  });

  leerUrl();
  pintar();
})();
