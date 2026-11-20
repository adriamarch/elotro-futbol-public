// Visor de previsualización con marcos de dispositivo (/admin/previsualizar.html?pid=...).
// Incrusta /noticia?preview=1&pid=... en un iframe del tamaño REAL de cada dispositivo, así que
// el diseño responsive reacciona exactamente igual que en un móvil, una tablet o un ordenador.
// Los cambios que se hacen en el editor siguen llegando en vivo (BroadcastChannel, mismo canal
// que usa noticia.html), porque la noticia sigue siendo la misma página, solo que dentro de un marco.
(function () {
  "use strict";

  var PREFIJO = "eof_preview_articulo:";
  var K_DISP = "eof_preview_dispositivo";
  var K_ORI = "eof_preview_orientacion";
  var K_ZOOM = "eof_preview_zoom";

  var pid = new URLSearchParams(location.search).get("pid") || "";
  var escenario = document.getElementById("pvEscenario");
  var pie = document.getElementById("pvPie");
  var vivo = document.getElementById("pvVivo");
  var vivoTxt = document.getElementById("pvVivoTxt");
  var btnGirar = document.getElementById("pvGirar");
  var btnZoom = document.getElementById("pvZoom");
  var btnZoomTxt = document.getElementById("pvZoomTxt");

  // pad = grosor del marco negro alrededor de la pantalla; barra = alto de la barra de estado/navegador.
  var DISP = {
    iphone: { nombre: "iPhone 15 Pro", w: 393,  h: 852,  barra: 54, clase: "pv-iphone", pad: { t: 14, r: 14, b: 14, l: 14 } },
    se:     { nombre: "iPhone SE",     w: 375,  h: 667,  barra: 20, clase: "pv-se",     pad: { t: 78, r: 20, b: 88, l: 20 } },
    ipad:   { nombre: "iPad",          w: 820,  h: 1180, barra: 24, clase: "pv-ipad",   pad: { t: 22, r: 22, b: 22, l: 22 }, girar: true },
    pc:     { nombre: "Ordenador",     w: 1440, h: 900,  barra: 42, clase: "pv-pc",     pad: { t: 16, r: 16, b: 16, l: 16 }, base: 20, margen: 80 }
  };

  function leer(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var dispositivo = leer(K_DISP, "iphone");
  if (!DISP[dispositivo]) dispositivo = "iphone";
  var horizontal = leer(K_ORI, "v") === "h";
  var zoomAjustar = leer(K_ZOOM, "ajustar") !== "real";
  var directo = false;
  var escala = 1;
  var temporizadorVivo = null;
  var temporizadorCarga = null;

  function urlNoticia() { return "/noticia?preview=1&pid=" + encodeURIComponent(pid); }

  function medidas() {
    var d = DISP[dispositivo];
    var w = d.w, h = d.h;
    if (horizontal && d.girar) { var t = w; w = h; h = t; }
    var cw = w + d.pad.l + d.pad.r, ch = h + d.pad.t + d.pad.b;
    var ox = d.margen || 0, extra = d.base || 0;
    return { w: w, h: h, cw: cw, ch: ch, ox: ox, ow: cw + ox * 2, oh: ch + extra };
  }

  /* ---------- Iconos de la barra de estado ---------- */
  var SVG_SENAL = '<svg viewBox="0 0 18 12" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>';
  var SVG_WIFI = '<svg viewBox="0 0 17 12" aria-hidden="true"><path d="M8.5 2.3c2.4 0 4.6.9 6.3 2.5l1.1-1.2A10.6 10.6 0 0 0 8.5.6C5.6.6 3 1.7 1.1 3.6l1.1 1.2a8.9 8.9 0 0 1 6.3-2.5zm0 3.6c1.4 0 2.7.5 3.7 1.4l1.1-1.2a7.2 7.2 0 0 0-9.6 0l1.1 1.2c1-.9 2.3-1.4 3.7-1.4zm0 3.5c.6 0 1.1.2 1.5.6L8.5 12 7 10c.4-.4.9-.6 1.5-.6z"/></svg>';
  var SVG_BATERIA = '<svg viewBox="0 0 27 13" aria-hidden="true"><rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.6"/><path d="M25 4.5v4c.8-.3 1.5-1.2 1.5-2s-.7-1.7-1.5-2z" opacity=".45"/></svg>';
  var SVG_CANDADO = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0a3.2 3.2 0 0 0-3.2 3.2V5H2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-.8V3.2A3.2 3.2 0 0 0 6 0zm-1.8 3.2a1.8 1.8 0 0 1 3.6 0V5H4.2z"/></svg>';

  function hora() {
    var f = new Date();
    return f.getHours() + ":" + String(f.getMinutes()).padStart(2, "0");
  }

  function barraSuperior(d) {
    if (dispositivo === "pc") {
      return '<div class="pv-barra-nav" style="height:' + d.barra + 'px">' +
        '<span class="pv-semaforo"><i></i><i></i><i></i></span>' +
        '<span class="pv-url">' + SVG_CANDADO + 'elotrofutbol.media</span></div>';
    }
    return '<div class="pv-barra-sup" style="height:' + d.barra + 'px">' +
      '<span class="pv-estado-hora" data-hora>' + hora() + '</span>' +
      '<span class="pv-estado-iconos">' + SVG_SENAL + SVG_WIFI + SVG_BATERIA + '</span></div>';
  }

  function adornos(d) {
    var botonesIzq = "", botonesDer = "", dentro = "", fuera = "";
    if (dispositivo === "iphone") {
      botonesIzq = '<i class="pv-bt pv-bt-i" style="top:120px;height:32px"></i><i class="pv-bt pv-bt-i" style="top:182px;height:62px"></i><i class="pv-bt pv-bt-i" style="top:256px;height:62px"></i>';
      botonesDer = '<i class="pv-bt pv-bt-d" style="top:204px;height:100px"></i>';
      dentro = '<i class="pv-isla"></i><i class="pv-inicio-bar"></i>';
    } else if (dispositivo === "se") {
      botonesIzq = '<i class="pv-bt pv-bt-i" style="top:120px;height:26px"></i><i class="pv-bt pv-bt-i" style="top:170px;height:50px"></i><i class="pv-bt pv-bt-i" style="top:232px;height:50px"></i>';
      botonesDer = '<i class="pv-bt pv-bt-d" style="top:160px;height:70px"></i>';
      fuera = '<i class="pv-altavoz"></i><i class="pv-camara"></i><i class="pv-boton-inicio"></i>';
    } else if (dispositivo === "ipad") {
      fuera = '<i class="pv-camara"></i>';
      dentro = '<i class="pv-inicio-bar" style="width:150px;margin-left:-75px;bottom:7px"></i>';
    } else {
      fuera = '<i class="pv-camara"></i>';
    }
    return { botones: botonesIzq + botonesDer, dentro: dentro, fuera: fuera };
  }

  function esqueleto() { return '<div class="pv-carga"><b></b><b></b><b></b><b></b><b></b></div>'; }

  function construirMarco() {
    var d = DISP[dispositivo], m = medidas(), a = adornos(d);
    var cls = "pv-dispositivo " + d.clase + (horizontal && d.girar ? " es-horizontal" : "");
    return '<div class="pv-caja" id="pvCaja">' +
      '<div class="' + cls + '" id="pvDisp" style="width:' + m.ow + 'px;height:' + m.oh + 'px">' +
        '<div class="pv-cuerpo" style="left:' + m.ox + 'px;width:' + m.cw + 'px;height:' + m.ch + 'px">' +
          a.botones +
          '<div class="pv-pantalla" id="pvPantalla" style="left:' + d.pad.l + 'px;top:' + d.pad.t + 'px;width:' + m.w + 'px;height:' + m.h + 'px">' +
            barraSuperior(d) +
            '<iframe id="pvMarco" title="Previsualización de la noticia" src="' + urlNoticia() + '" style="top:' + d.barra + 'px;height:' + (m.h - d.barra) + 'px"></iframe>' +
            '<div class="pv-carga-contenedor" id="pvCargaC">' + esqueleto().replace('class="pv-carga"', 'class="pv-carga" style="top:' + d.barra + 'px"') + '</div>' +
            a.dentro +
          '</div>' +
          a.fuera +
        '</div>' +
        (dispositivo === "pc" ? '<div class="pv-base"></div>' : '') +
      '</div>' +
      '<div class="pv-suelo"></div>' +
    '</div>';
  }

  function construirDirecto() {
    return '<div class="pv-caja" id="pvCaja"><div class="pv-directo" id="pvPantalla">' +
      '<iframe id="pvMarco" title="Previsualización de la noticia" src="' + urlNoticia() + '"></iframe>' +
      '<div class="pv-carga-contenedor" id="pvCargaC">' + esqueleto() + '</div></div></div>';
  }

  /* ---------- Render ---------- */
  function render() {
    clearTimeout(temporizadorCarga);
    if (!pid) {
      escenario.innerHTML = '<div class="pv-vacio"><h1>No hay nada que previsualizar</h1><p>Abre esta vista desde el botón «Previsualizar» del editor de noticias, con algo de contenido escrito.</p></div>';
      pie.textContent = "";
      return;
    }
    directo = window.innerWidth <= 720;
    document.body.classList.toggle("pv-es-directo", directo);
    escenario.innerHTML = directo ? construirDirecto() : construirMarco();

    var marco = document.getElementById("pvMarco");
    var pantalla = document.getElementById("pvPantalla");
    var cargaC = document.getElementById("pvCargaC");
    var listo = false;
    function terminar() {
      if (listo) return;
      listo = true;
      pantalla.classList.add("es-listo");
      if (cargaC) cargaC.classList.add("es-listo");
      afinarTono();
    }
    marco.addEventListener("load", function () { setTimeout(terminar, 150); });
    temporizadorCarga = setTimeout(terminar, 9000);

    actualizarControles();
    ajustar();
  }

  function actualizarControles() {
    document.querySelectorAll(".pv-op").forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-disp") === dispositivo ? "true" : "false");
    });
    btnGirar.hidden = !(DISP[dispositivo].girar) || directo;
    btnZoomTxt.textContent = zoomAjustar ? "Ajustar" : "100 %";
  }

  function ajustar() {
    var caja = document.getElementById("pvCaja");
    if (!caja || directo) { actualizarPie(); return; }
    var disp = document.getElementById("pvDisp");
    var m = medidas();
    var s = 1;
    if (zoomAjustar) {
      var aw = escenario.clientWidth - 64, ah = escenario.clientHeight - 74;
      s = Math.min(1, aw / m.ow, ah / m.oh);
      s = Math.max(0.2, s);
    }
    escala = s;
    caja.style.width = Math.round(m.ow * s) + "px";
    caja.style.height = Math.round(m.oh * s) + "px";
    disp.style.transform = "scale(" + s + ")";
    actualizarPie();
  }

  function titulo() {
    try {
      var raw = localStorage.getItem(PREFIJO + pid);
      if (raw) { var a = JSON.parse(raw); return (a && a.titulo) || ""; }
    } catch (e) {}
    return "";
  }

  function actualizarPie() {
    if (!pid || directo) { pie.textContent = ""; return; }
    var d = DISP[dispositivo], m = medidas();
    var t = titulo();
    pie.innerHTML = (t ? "<strong></strong><span>·</span>" : "") +
      d.nombre + (horizontal && d.girar ? " horizontal" : "") + "<span>·</span>" + m.w + " × " + m.h + " px<span>·</span>" + Math.round(escala * 100) + " %";
    if (t) pie.querySelector("strong").textContent = t.length > 70 ? t.slice(0, 69) + "…" : t;
    if (t) document.title = "Previsualización — " + t;
  }

  /* ---------- Color de la barra de estado = fondo de la noticia ---------- */
  function parsearColor(c) {
    var m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,\/]+([\d.]+))?/.exec(c || "");
    if (!m) return null;
    var a = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (a < 0.5) return null;
    return [+m[1], +m[2], +m[3]];
  }
  function afinarTono() {
    if (dispositivo === "pc" || directo) return;
    try {
      var marco = document.getElementById("pvMarco");
      var doc = marco.contentDocument;
      var rgb = parsearColor(getComputedStyle(doc.body).backgroundColor) || parsearColor(getComputedStyle(doc.documentElement).backgroundColor) || [255, 255, 255];
      var lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
      var pantalla = document.getElementById("pvPantalla");
      pantalla.style.setProperty("--pv-bg", "rgb(" + rgb.join(",") + ")");
      pantalla.style.setProperty("--pv-fg", lum < 0.5 ? "#fff" : "#111");
    } catch (e) { /* mismo origen: no debería fallar; si falla se queda el tono claro */ }
  }

  /* ---------- Acciones ---------- */
  function elegir(clave) {
    if (!DISP[clave] || clave === dispositivo) return;
    dispositivo = clave;
    guardar(K_DISP, clave);
    render();
  }
  function girar() {
    if (!DISP[dispositivo].girar) return;
    horizontal = !horizontal;
    guardar(K_ORI, horizontal ? "h" : "v");
    render();
  }
  function alternarZoom() {
    zoomAjustar = !zoomAjustar;
    guardar(K_ZOOM, zoomAjustar ? "ajustar" : "real");
    actualizarControles();
    ajustar();
  }
  function recargar() { render(); }

  document.querySelectorAll(".pv-op").forEach(function (b) {
    b.addEventListener("click", function () { elegir(b.getAttribute("data-disp")); });
  });
  btnGirar.addEventListener("click", girar);
  btnZoom.addEventListener("click", alternarZoom);
  document.getElementById("pvRecargar").addEventListener("click", recargar);
  document.getElementById("pvCerrar").addEventListener("click", function () {
    window.close();
    // Si el navegador no deja cerrar la pestaña (no la abrió el editor), se avisa en vez de no hacer nada.
    setTimeout(function () { if (!window.closed) pie.textContent = "Cierra esta pestaña desde el navegador."; }, 200);
  });

  document.addEventListener("keydown", function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === "1") elegir("iphone");
    else if (k === "2") elegir("se");
    else if (k === "3") elegir("ipad");
    else if (k === "4") elegir("pc");
    else if (k === "r") girar();
    else if (k === "f") alternarZoom();
  });

  var temporizadorRedim = null;
  window.addEventListener("resize", function () {
    clearTimeout(temporizadorRedim);
    temporizadorRedim = setTimeout(function () {
      var seraDirecto = window.innerWidth <= 720;
      if (seraDirecto !== directo) render(); else ajustar();
    }, 80);
  });

  /* ---------- Indicador "en vivo" ---------- */
  function destello() {
    vivoTxt.textContent = "Actualizado";
    vivo.classList.add("es-actualizado");
    clearTimeout(temporizadorVivo);
    temporizadorVivo = setTimeout(function () {
      vivo.classList.remove("es-actualizado");
      vivoTxt.textContent = "En vivo";
    }, 2200);
    actualizarPie();
  }
  try {
    if ("BroadcastChannel" in window) {
      var canal = new BroadcastChannel("eof_preview_articulo");
      canal.onmessage = function (ev) { if (ev && ev.data && ev.data.id === pid) destello(); };
    }
  } catch (e) {}
  window.addEventListener("storage", function (ev) { if (ev.key === PREFIJO + pid) destello(); });

  // La hora de la barra de estado avanza sola.
  setInterval(function () {
    document.querySelectorAll("[data-hora]").forEach(function (n) { n.textContent = hora(); });
  }, 20000);

  render();
})();
