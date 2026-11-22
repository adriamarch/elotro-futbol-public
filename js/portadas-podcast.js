/* Portadas automáticas del podcast.
   Si un episodio/entrevista/clip no tiene portada propia, se dibuja una en SVG con la marca de
   ELOTROFÚTBOLTV. Es determinista: el mismo id da siempre la misma portada, pero cada episodio
   tiene su propia combinación de colores y dibujo de fondo (campo, focos, ondas, círculos, diagonales).
   Uso: EOFPortadaPodcast(item) -> <svg>   |   EOFPortadaPodcast.html(item) -> string */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg", uid = 0;
  var TEMAS = [ /* fondo 1, fondo 2, acento */
    ["#0c1b2e", "#152b46", "#d1132e"], ["#152b46", "#0c1b2e", "#5bb8e8"], ["#9c0e23", "#0c1b2e", "#5bb8e8"],
    ["#0c1b2e", "#b30f27", "#ffffff"], ["#0b3a5c", "#0c1b2e", "#d1132e"], ["#0c1b2e", "#1d4f7a", "#5bb8e8"]
  ];
  var TIPOS = { episodio: "EPISODIO", entrevista: "ENTREVISTA", clip: "CLIP" };
  var ICONOS = {
    episodio: '<rect x="-10" y="-24" width="20" height="30" rx="10"/><path d="M-18 -4a18 18 0 0 0 36 0M0 14v12M-10 26h20"/>',
    entrevista: '<path d="M-24 6v-8a24 24 0 0 1 48 0v8"/><rect x="-29" y="4" width="11" height="20" rx="5"/><rect x="18" y="4" width="11" height="20" rx="5"/>',
    clip: '<circle r="26"/><path d="M-8 -12l20 12-20 12z" fill="currentColor"/>'
  };

  function hash(s) { var h = 2166136261; s = String(s || ""); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function azar(sem) { var s = sem; return function () { s = Math.imul(s ^ (s >>> 15), 2246822507) + 1 >>> 0; return (s & 0xffff) / 65535; }; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function lineas(txt, max, n) {
    var pal = String(txt || "").trim().split(/\s+/), out = [], cur = "";
    for (var i = 0; i < pal.length; i++) {
      if ((cur + " " + pal[i]).trim().length > max && cur) { out.push(cur); cur = pal[i]; } else cur = (cur + " " + pal[i]).trim();
    }
    if (cur) out.push(cur);
    if (out.length > n) { out = out.slice(0, n); out[n - 1] = out[n - 1].replace(/[\s.,;:]*$/, "") + "…"; }
    return out;
  }

  function fondo(p, a, h) {
    var r = azar(h), s = "", i, w = 'fill="none" stroke="#fff" stroke-opacity=".11" stroke-width="2"';
    if (p === 0) { /* campo de fútbol */
      s = '<g ' + w + '><rect x="22" y="22" width="596" height="316" rx="6"/><path d="M320 22v316"/><circle cx="320" cy="180" r="56"/><rect x="22" y="104" width="100" height="152"/><rect x="518" y="104" width="100" height="152"/><rect x="22" y="142" width="40" height="76"/><rect x="578" y="142" width="40" height="76"/></g>';
    } else if (p === 1) { /* focos de estadio */
      s = '<polygon points="0,0 210,0 470,360 90,360" fill="#fff" fill-opacity=".06"/><polygon points="640,0 430,0 170,360 550,360" fill="#fff" fill-opacity=".05"/>';
    } else if (p === 2) { /* ondas de audio */
      for (i = 0; i < 46; i++) { var hh = 14 + r() * 120 * (0.45 + 0.55 * Math.sin(i / 7 + 1)) ** 2; s += '<rect x="' + (i * 14 + 4) + '" y="' + (360 - hh).toFixed(1) + '" width="8" height="' + hh.toFixed(1) + '" rx="4" fill="' + a + '" fill-opacity=".28"/>'; }
    } else if (p === 3) { /* círculos concéntricos */
      for (i = 1; i < 8; i++) s += '<circle cx="' + (r() > .5 ? 600 : 40) + '" cy="40" r="' + i * 62 + '" ' + w + '/>';
      s = s.replace(/cx="40"/g, 'cx="40"');
    } else { /* diagonales */
      for (i = -4; i < 22; i++) s += '<path d="M' + (i * 34) + ' 360L' + (i * 34 + 220) + ' 0" stroke="#fff" stroke-opacity="' + (i % 3 ? ".05" : ".1") + '" stroke-width="' + (i % 3 ? 10 : 3) + '"/>';
    }
    return s;
  }

  function construir(it, idx) {
    it = it || {};
    var h = hash(it.id || it.titulo), tipo = TIPOS[it.tipo] ? it.tipo : "episodio";
    var tm = TEMAS[(h >>> 4) % TEMAS.length], pat = h % 5, g = "pcg" + (++uid);
    var gx = [90, 560, 320][(h >>> 9) % 3], gy = [60, 300][(h >>> 12) % 2];
    var etq = TIPOS[tipo], grande = "", sub = "", cuerpo = "", y;

    if (tipo === "episodio" && it.numero) { etq = "EPISODIO · T" + (it.temporada || 1); grande = "#" + it.numero; }
    else if (tipo === "entrevista" && it.invitado) { sub = "CON"; cuerpo = lineas(it.invitado, 17, 2); }
    else cuerpo = lineas(it.titulo, 20, 3);

    var txt = "";
    if (grande) txt += '<text class="det2" x="34" y="316" font-size="168" font-weight="700" fill="#fff" font-family="Oswald,\'Arial Narrow\',Impact,sans-serif" letter-spacing="-2">' + esc(grande) + '</text>';
    else {
      y = 330 - (cuerpo.length - 1) * 50;
      txt += cuerpo.map(function (l, i) { return '<text class="det2" x="34" y="' + (y + i * 50) + '" font-size="46" font-weight="700" fill="#fff" font-family="Oswald,\'Arial Narrow\',Impact,sans-serif" text-transform="uppercase">' + esc(l.toUpperCase()) + '</text>'; }).join("");
      if (sub) txt += '<text class="det2" x="34" y="' + (y - 52) + '" font-size="18" font-weight="600" fill="' + tm[2] + '" font-family="Inter,Arial,sans-serif" letter-spacing="4">' + sub + '</text>';
    }

    var svg =
      '<svg xmlns="' + NS + '" class="pc-cover" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Portada: ' + esc(it.titulo || "Podcast") + '" style="position:absolute;inset:0;width:100%;height:100%;display:block">' +
      '<defs><linearGradient id="' + g + 'a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + tm[0] + '"/><stop offset="1" stop-color="' + tm[1] + '"/></linearGradient>' +
      '<radialGradient id="' + g + 'b" cx="' + gx + '" cy="' + gy + '" r="330" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="' + tm[2] + '" stop-opacity=".55"/><stop offset="1" stop-color="' + tm[2] + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + g + 'c" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>' +
      '<rect width="640" height="360" fill="url(#' + g + 'a)"/><rect width="640" height="360" fill="url(#' + g + 'b)"/>' +
      fondo(pat, tm[2], h) +
      '<rect width="640" height="360" fill="url(#' + g + 'c)"/>' +
      '<g class="det" font-family="Inter,Arial,sans-serif"><rect x="34" y="34" width="34" height="5" rx="2.5" fill="' + tm[2] + '"/>' +
      '<text x="34" y="66" font-size="15" font-weight="700" fill="#fff" fill-opacity=".92" letter-spacing="3.2">ELOTROFÚTBOLTV</text>' +
      '<text x="34" y="88" font-size="13" font-weight="600" fill="' + tm[2] + '" letter-spacing="2.4">' + esc(etq) + '</text></g>' +
      '<g transform="translate(548 92)"><circle r="54" fill="#fff" fill-opacity=".1" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>' +
      '<g color="#fff" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">' + ICONOS[tipo] + '</g></g>' +
      txt + '</svg>';
    return svg;
  }

  function EOFPortadaPodcast(it, idx) {
    var d = document.createElement("div"); d.innerHTML = construir(it, idx);
    return d.firstChild;
  }
  EOFPortadaPodcast.html = construir;
  window.EOFPortadaPodcast = EOFPortadaPodcast;
})();
