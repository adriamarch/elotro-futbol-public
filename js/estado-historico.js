/* estado-historico.js
 * Histórico de incidencias de /estado: disponibilidad de los últimos 90 días (barras por
 * componente) y lista de incidencias. Lee /data/estado/incidencias.json, que escribe el
 * monitor automático (.github/workflows/monitor-estado.yml). */
(function () {
  "use strict";
  var cont = document.getElementById("estadoHistorico");
  if (!cont) return;

  var URL_DATOS = "/data/estado/incidencias.json";
  var DIAS = 90, MAX_LISTA = 12, DIA_MS = 86400000;
  var COMPONENTES = [["web", "Web"], ["api", "API"], ["db", "Base de datos"]];
  var NOMBRES = { web: "Web", api: "API", db: "Base de datos" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ms(iso) { if (!iso) return null; var t = new Date(iso).getTime(); return isNaN(t) ? null : t; }
  function pct(n) { return (Math.round(n * 100) / 100).toLocaleString("es-ES", { minimumFractionDigits: n >= 100 ? 0 : 2, maximumFractionDigits: 2 }) + " %"; }
  function durTxt(min) {
    min = Math.max(1, Math.round(min));
    if (min < 60) return min + " min";
    var h = Math.floor(min / 60), m = min % 60;
    if (h < 48) return h + " h" + (m ? " " + m + " min" : "");
    return Math.round(h / 24) + " días";
  }
  function fechaCorta(t) { return new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short" }); }
  function fechaLarga(t) { return new Date(t).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  function solape(a, b, i, f) { return Math.max(0, Math.min(b, f) - Math.max(a, i)) / 60000; }

  function calcular(datos, ahora) {
    var desde = ms(datos.desde);
    var hoy0 = new Date(ahora); hoy0.setHours(0, 0, 0, 0);
    var res = {};
    COMPONENTES.forEach(function (par) {
      var comp = par[0];
      var incs = (datos.incidencias || []).filter(function (i) { return i.componente === comp; }).map(function (i) {
        return { tipo: i.tipo, ini: ms(i.inicio), fin: i.fin ? ms(i.fin) : ahora };
      }).filter(function (i) { return i.ini != null && i.fin != null; });
      var dias = [], downTot = 0, baseTot = 0;
      for (var k = DIAS - 1; k >= 0; k--) {
        var d0 = new Date(hoy0); d0.setDate(d0.getDate() - k);
        var d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
        var a = d0.getTime(), b = d1.getTime();
        var cIni = Math.max(a, desde == null ? Infinity : desde), cFin = Math.min(b, ahora);
        if (desde == null || cFin <= cIni) { dias.push({ t: a, clase: "eh-nd", texto: "sin datos" }); continue; }
        var cubierto = (cFin - cIni) / 60000, down = 0, mant = 0;
        incs.forEach(function (i) {
          var m = solape(cIni, cFin, i.ini, i.fin);
          if (i.tipo === "mantenimiento") mant += m; else down += m;
        });
        var base = Math.max(1, cubierto - mant);
        downTot += down; baseTot += base;
        var clase, texto;
        if (down > 0) { clase = down >= 60 ? "eh-mal" : "eh-warn"; texto = durTxt(down) + " con incidencia"; }
        else if (mant > 0) { clase = "eh-mant"; texto = "mantenimiento (" + durTxt(mant) + ")"; }
        else { clase = "eh-ok"; texto = "sin incidencias"; }
        dias.push({ t: a, clase: clase, texto: texto });
      }
      res[comp] = { dias: dias, disp: baseTot > 0 ? Math.max(0, (1 - downTot / baseTot) * 100) : null };
    });
    return res;
  }

  function pintarBarras(res) {
    return COMPONENTES.map(function (par) {
      var r = res[par[0]];
      var etiqueta = par[1] + ": " + (r.disp == null ? "sin datos" : pct(r.disp) + " de disponibilidad en " + DIAS + " días");
      return '<div class="eh-fila"><div class="eh-cab"><span class="eh-nombre">' + esc(par[1]) + '</span>' +
        '<span class="eh-disp">' + (r.disp == null ? "—" : esc(pct(r.disp))) + '</span></div>' +
        '<div class="eh-barras" role="img" aria-label="' + esc(etiqueta) + '">' +
        r.dias.map(function (d) { return '<span class="eh-dia ' + d.clase + '" title="' + esc(fechaCorta(d.t) + " · " + d.texto) + '"></span>'; }).join("") +
        '</div></div>';
    }).join("") +
      '<div class="eh-escala" aria-hidden="true"><span>hace ' + DIAS + ' días</span><span>hoy</span></div>' +
      '<ul class="eh-leyenda"><li><i class="eh-dia eh-ok"></i>Sin incidencias</li><li><i class="eh-dia eh-warn"></i>Menos de 1 h con incidencia</li>' +
      '<li><i class="eh-dia eh-mal"></i>1 h o más con incidencia</li><li><i class="eh-dia eh-mant"></i>Mantenimiento</li><li><i class="eh-dia eh-nd"></i>Sin datos</li></ul>';
  }

  function itemLista(i, ahora) {
    var ini = ms(i.inicio), fin = i.fin ? ms(i.fin) : null, mant = i.tipo === "mantenimiento";
    var estado = fin == null
      ? '<span class="eh-badge eh-badge-curso">' + (mant ? "En curso" : "En curso") + ' · desde hace ' + durTxt((ahora - ini) / 60000) + '</span>'
      : '<span class="eh-badge eh-badge-ok">' + (mant ? "Finalizado" : "Resuelta") + ' · ' + durTxt((fin - ini) / 60000) + '</span>';
    return '<li class="eh-inc' + (mant ? " eh-inc-mant" : "") + (fin == null ? " eh-inc-curso" : "") + '">' +
      '<span class="estado-punto ' + (mant ? "eh-punto-mant" : fin == null ? "estado-mal" : "eh-punto-resuelta") + '"></span>' +
      '<div class="eh-inc-texto"><div class="eh-inc-titulo"><strong>' + esc(NOMBRES[i.componente] || i.componente) + ' · ' + (mant ? "Mantenimiento" : "Incidencia") + '</strong> ' + estado + '</div>' +
      '<div class="eh-inc-meta">' + esc(fechaLarga(ini)) + (i.detalle && !mant ? ' · ' + esc(i.detalle) : "") + '</div></div></li>';
  }

  function pintar(datos) {
    var ahora = Date.now();
    var desde = ms(datos.desde);
    var cuerpo = cont.querySelector("[data-eh-cuerpo]");
    if (desde == null) {
      cuerpo.innerHTML = '<p class="estado-historial-vacio">Todavía no hay datos: el monitor automático registrará aquí su primera comprobación en unos minutos.</p>';
      return;
    }
    var html = pintarBarras(calcular(datos, ahora));
    var lista = (datos.incidencias || []).slice().sort(function (a, b) { return (ms(b.inicio) || 0) - (ms(a.inicio) || 0); });
    html += '<h4 class="eh-subtitulo">Incidencias recientes</h4>';
    if (!lista.length) {
      html += '<p class="eh-vacio">No se ha registrado ninguna incidencia desde el ' + esc(fechaLarga(desde)) + '.</p>';
    } else {
      html += '<ul class="eh-lista">' + lista.slice(0, MAX_LISTA).map(function (i) { return itemLista(i, ahora); }).join("") + '</ul>';
      if (lista.length > MAX_LISTA) {
        html += '<ul class="eh-lista eh-lista-resto" hidden>' + lista.slice(MAX_LISTA).map(function (i) { return itemLista(i, ahora); }).join("") + '</ul>' +
          '<button type="button" class="eh-mas" data-eh-mas>Mostrar las ' + (lista.length - MAX_LISTA) + ' anteriores</button>';
      }
    }
    var act = ms(datos.actualizado);
    if (act != null && ahora - act > 48 * 3600000) {
      html += '<p class="eh-aviso">El monitor automático no ha enviado datos en las últimas 48 h, así que este histórico puede estar incompleto.</p>';
    }
    cuerpo.innerHTML = html;
    var mas = cuerpo.querySelector("[data-eh-mas]");
    if (mas) mas.addEventListener("click", function () {
      cuerpo.querySelector(".eh-lista-resto").hidden = false;
      mas.remove();
    });
  }

  fetch(URL_DATOS, { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(pintar)
    .catch(function () {
      cont.querySelector("[data-eh-cuerpo]").innerHTML = '<p class="estado-historial-vacio">No se ha podido cargar el histórico en este momento.</p>';
    });
})();
