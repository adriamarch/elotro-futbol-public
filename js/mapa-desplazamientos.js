/* Mapa de desplazamientos (Fase 1)
   El lector elige su equipo, marca los estadios que ha visitado y obtiene un mapa de España con
   sus rutas, los km y una imagen descargable/compartible con la marca de agua del medio.
   Depende de: js/mapa-estadios-datos.js (window.MAPA_ES), clubs.js, config.js, lector-auth.js. */
(function () {
  "use strict";
  var M = window.MAPA_ES;
  if (!M) return;

  var LS_BASE = "eof_mapa_desplazamientos_v1";
  var LS_OPC = "eof_mapa_desplazamientos_opc";
  var NS = "http://www.w3.org/2000/svg";

  var porId = new Map(M.estadios.map(function (e) { return [e.id, e]; }));
  var porClub = new Map();
  M.estadios.forEach(function (e) { e.c.forEach(function (c) { porClub.set(c, e); }); });

  var estado = { equipo: null, visitados: new Set(), nombres: true, rutas: true };
  var vb = { x: 0, y: 0, w: M.W, h: M.H };
  var temporizadorGuardado = null;
  var arrastrado = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(msg, tipo) { if (window.EOF && EOF.toast) EOF.toast(msg, tipo || "info"); }
  function normalizar(s) { return typeof normalizarTextoBusquedaClub === "function" ? normalizarTextoBusquedaClub(s) : String(s || "").toLowerCase(); }

  /* ---------- geometría ---------- */
  function km(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function curva(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    var nx = -dy / d, ny = dx / d;
    if (ny > 0) { nx = -nx; ny = -ny; } // la curva se abomba hacia el norte
    var cx = (a.x + b.x) / 2 + nx * d * 0.18, cy = (a.y + b.y) / 2 + ny * d * 0.18;
    return "M" + a.x + "," + a.y + "Q" + cx.toFixed(1) + "," + cy.toFixed(1) + " " + b.x + "," + b.y;
  }
  function casa() { return estado.equipo ? porClub.get(estado.equipo) || null : null; }
  function visitadosLista() {
    var h = casa();
    return Array.from(estado.visitados).map(function (id) { return porId.get(id); })
      .filter(function (e) { return e && e !== h; });
  }
  function estadisticas() {
    var h = casa(), lista = visitadosLista(), total = 0, lejano = null, dl = 0;
    if (h) lista.forEach(function (e) {
      var d = km(h, e); total += 2 * d;
      if (d > dl) { dl = d; lejano = e; }
    });
    return { n: lista.length, km: Math.round(total), lejano: lejano, kmLejano: Math.round(dl) };
  }
  function fmt(n) { return Number(n).toLocaleString("es-ES", { useGrouping: "always" }); }
  function corto(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }

  /* ---------- persistencia ---------- */
  function claveLocal() {
    var s = typeof sesionLectorActual === "function" ? sesionLectorActual() : null;
    return LS_BASE + ":" + (s && (s.id || s.email || s.nombre) || "anon");
  }
  function guardarLocal() {
    try { localStorage.setItem(claveLocal(), JSON.stringify({ equipo: estado.equipo, estadios: Array.from(estado.visitados) })); } catch (e) { /* sin almacenamiento */ }
  }
  function cargarLocal() {
    try {
      var d = JSON.parse(localStorage.getItem(claveLocal()) || "null");
      if (d) aplicarDatos(d);
      var o = JSON.parse(localStorage.getItem(LS_OPC) || "null");
      if (o) { estado.nombres = o.nombres !== false; estado.rutas = o.rutas !== false; }
    } catch (e) { /* ignorar */ }
  }
  function aplicarDatos(d) {
    estado.equipo = d.equipo && porClub.has(d.equipo) ? d.equipo : null;
    estado.visitados = new Set((d.estadios || []).filter(function (id) { return porId.has(id); }));
  }
  function mostrarGuardado(t, error) {
    var el = $("mapadGuardado");
    if (!el) return;
    el.textContent = t;
    el.classList.toggle("mapad-guardado-error", !!error);
  }
  function guardarDiferido() {
    guardarLocal();
    mostrarGuardado("Guardando…");
    clearTimeout(temporizadorGuardado);
    temporizadorGuardado = setTimeout(enviar, 700);
  }
  async function enviar() {
    try {
      var r = await apiFetchLector("/api/mapa-desplazamientos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipo: estado.equipo, estadios: Array.from(estado.visitados) })
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      mostrarGuardado("Guardado en tu cuenta");
    } catch (e) {
      mostrarGuardado("No se ha podido guardar en tu cuenta; se conserva en este dispositivo.", true);
    }
  }
  async function cargarServidor() {
    try {
      var r = await apiFetchLector("/api/mapa-desplazamientos");
      if (!r.ok) return;
      var d = await r.json();
      if (d.updated_at) { aplicarDatos(d); guardarLocal(); mostrarGuardado("Guardado en tu cuenta"); }
      else if (estado.equipo || estado.visitados.size) { enviar(); }
    } catch (e) { /* se queda con lo local */ }
  }

  /* ---------- selector de equipo ---------- */
  function rellenarEquipos() {
    var sel = $("mapadEquipo");
    var html = '<option value="">Elige tu equipo…</option>';
    Object.keys(CLUBS_BY_CATEGORY).forEach(function (cat) {
      var clubs = CLUBS_BY_CATEGORY[cat].filter(function (c) { return porClub.has(c); }).sort(function (a, b) { return a.localeCompare(b, "es"); });
      if (!clubs.length) return;
      var etq = typeof categoriaLabel === "function" ? categoriaLabel(cat) : cat;
      html += '<optgroup label="' + esc(etq) + '">' + clubs.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("") + "</optgroup>";
    });
    sel.innerHTML = html;
    sel.value = estado.equipo || "";
  }
  function pintarEscudo() {
    var cont = $("mapadEscudo");
    if (!estado.equipo) { cont.innerHTML = ""; return; }
    cont.innerHTML = '<img src="' + esc(getEscudoUrl(estado.equipo)) + '" alt="" width="44" height="44" data-equipo="' + esc(estado.equipo) + '" onerror="manejarErrorEscudo(this)">';
  }

  /* ---------- lista de estadios ---------- */
  function construirLista() {
    var orden = M.estadios.slice().sort(function (a, b) { return a.n.localeCompare(b.n, "es"); });
    $("mapadLista").innerHTML = orden.map(function (e) {
      return '<li class="mapad-item" data-id="' + e.id + '" data-q="' + esc(normalizar(e.n + " " + e.c.join(" "))) + '">' +
        '<label><input type="checkbox" value="' + e.id + '"><span class="mapad-item-txt"><strong>' + esc(e.n) + "</strong><small>" + esc(e.c.join(" · ")) + "</small></span></label></li>";
    }).join("");
  }
  function sincronizarLista() {
    var h = casa();
    document.querySelectorAll("#mapadLista .mapad-item").forEach(function (li) {
      var id = li.dataset.id, cb = li.querySelector("input");
      cb.checked = estado.visitados.has(id);
      var esCasa = h && h.id === id;
      li.classList.toggle("mapad-item-casa", !!esCasa);
      cb.disabled = !!esCasa;
    });
  }
  function filtrarLista() {
    var q = normalizar($("mapadBuscar").value);
    document.querySelectorAll("#mapadLista .mapad-item").forEach(function (li) { li.hidden = !!q && li.dataset.q.indexOf(q) < 0; });
  }

  /* ---------- mapa interactivo (SVG) ---------- */
  function el(tag, attrs, padre) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (padre) padre.appendChild(n);
    return n;
  }
  function construirMapa() {
    var svg = $("mapadSvg");
    svg.innerHTML = "";
    var g = el("g", { "class": "mapad-tierra" }, svg);
    M.tierra.forEach(function (d) { el("path", { d: d }, g); });
    el("path", { d: M.marco, "class": "mapad-marco" }, svg);
    el("g", { id: "mapadRutas", "class": "mapad-rutas" }, svg);
    el("g", { id: "mapadPuntos" }, svg);
    el("g", { id: "mapadNombres", "class": "mapad-nombres", "aria-hidden": "true" }, svg);
    var gp = $("mapadPuntos");
    M.estadios.forEach(function (e) {
      var c = el("g", { "class": "mapad-punto", "data-id": e.id, tabindex: "0", role: "button", "aria-pressed": "false",
        "aria-label": e.n + " (" + e.c.join(", ") + ")" }, gp);
      var t = el("title", {}, c); t.textContent = e.n + " · " + e.c.join(" · ");
      el("circle", { cx: e.x, cy: e.y, r: 11, "class": "mapad-hit" }, c);
      el("circle", { cx: e.x, cy: e.y, r: 4.2, "class": "mapad-dot" }, c);
    });
    gp.addEventListener("click", function (ev) {
      if (arrastrado) return;
      var p = ev.target.closest(".mapad-punto");
      if (p) alternar(p.dataset.id);
    });
    gp.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      var p = ev.target.closest(".mapad-punto");
      if (p) { ev.preventDefault(); alternar(p.dataset.id); }
    });
    activarZoomYArrastre(svg);
    aplicarVb();
  }
  function aplicarVb() { $("mapadSvg").setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h); pintarNombres(); }

  function pintarMapa() {
    var h = casa();
    document.querySelectorAll("#mapadPuntos .mapad-punto").forEach(function (p) {
      var id = p.dataset.id, on = estado.visitados.has(id), esCasa = h && h.id === id;
      p.classList.toggle("on", on && !esCasa);
      p.classList.toggle("casa", !!esCasa);
      p.setAttribute("aria-pressed", on || esCasa ? "true" : "false");
      var dot = p.querySelector(".mapad-dot");
      dot.setAttribute("r", esCasa ? 7.5 : on ? 5.6 : 4.2);
    });
    var rutas = $("mapadRutas");
    rutas.innerHTML = "";
    if (h && estado.rutas) visitadosLista().forEach(function (e) { el("path", { d: curva(h, e) }, rutas); });
    pintarNombres();
  }
  function pintarNombres() {
    var g = $("mapadNombres");
    if (!g) return;
    g.innerHTML = "";
    if (!estado.nombres) return;
    var fs = 12 * (vb.w / M.W), colocados = [];
    var lista = visitadosLista(), h = casa();
    if (h) lista.unshift(h);
    lista.forEach(function (e) {
      var txt = corto(e.n, 22), w = txt.length * fs * 0.56 + 4, x = e.x + 8 * (vb.w / M.W), y = e.y + fs * 0.35;
      var r = { x: x, y: y - fs, w: w, h: fs * 1.2 };
      if (colocados.some(function (o) { return r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y; })) return;
      colocados.push(r);
      var t = el("text", { x: x, y: y, "font-size": fs.toFixed(1) }, g);
      t.textContent = txt;
    });
  }

  /* zoom con botones/rueda y arrastre para mover */
  function limitarVb() {
    vb.w = Math.min(M.W, Math.max(M.W / 8, vb.w));
    vb.h = vb.w * (M.H / M.W);
    vb.x = Math.min(M.W - vb.w, Math.max(0, vb.x));
    vb.y = Math.min(M.H - vb.h, Math.max(0, vb.y));
  }
  function zoom(factor, cx, cy) {
    var nx = cx == null ? vb.x + vb.w / 2 : cx, ny = cy == null ? vb.y + vb.h / 2 : cy;
    var nw = vb.w / factor, k = nw / vb.w;
    vb.x = nx - (nx - vb.x) * k; vb.y = ny - (ny - vb.y) * k; vb.w = nw;
    limitarVb(); aplicarVb();
  }
  function activarZoomYArrastre(svg) {
    $("mapadZoomMas").onclick = function () { zoom(1.6); };
    $("mapadZoomMenos").onclick = function () { zoom(1 / 1.6); };
    $("mapadZoomReset").onclick = function () { vb = { x: 0, y: 0, w: M.W, h: M.H }; aplicarVb(); };
    function aPunto(ev) {
      var r = svg.getBoundingClientRect();
      return { x: vb.x + (ev.clientX - r.left) / r.width * vb.w, y: vb.y + (ev.clientY - r.top) / r.height * vb.h };
    }
    svg.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      var p = aPunto(ev); zoom(ev.deltaY < 0 ? 1.25 : 1 / 1.25, p.x, p.y);
    }, { passive: false });
    var inicio = null;
    svg.addEventListener("pointerdown", function (ev) {
      if (vb.w >= M.W) return; // sin zoom no hay nada que mover
      inicio = { cx: ev.clientX, cy: ev.clientY, x: vb.x, y: vb.y, mov: false };
    });
    svg.addEventListener("pointermove", function (ev) {
      if (!inicio) return;
      var dx = ev.clientX - inicio.cx, dy = ev.clientY - inicio.cy;
      if (!inicio.mov && Math.hypot(dx, dy) < 6) return;
      inicio.mov = true; arrastrado = true;
      var r = svg.getBoundingClientRect();
      vb.x = inicio.x - dx / r.width * vb.w; vb.y = inicio.y - dy / r.height * vb.h;
      limitarVb(); aplicarVb();
    });
    function fin() { inicio = null; setTimeout(function () { arrastrado = false; }, 0); }
    svg.addEventListener("pointerup", fin);
    svg.addEventListener("pointercancel", fin);
    svg.addEventListener("pointerleave", fin);
  }

  /* ---------- interacción ---------- */
  function alternar(id) {
    var h = casa();
    if (h && h.id === id) return;
    if (!estado.equipo) { toast("Elige primero tu equipo.", "info"); $("mapadEquipo").focus(); return; }
    if (estado.visitados.has(id)) estado.visitados.delete(id); else estado.visitados.add(id);
    refrescar(); guardarDiferido();
  }
  function refrescar() {
    sincronizarLista(); pintarMapa(); pintarEscudo();
    var s = estadisticas();
    $("mapadN").textContent = fmt(s.n);
    $("mapadKm").textContent = fmt(s.km);
    $("mapadLejano").textContent = s.lejano ? s.lejano.n + " · " + fmt(s.kmLejano) + " km" : "—";
    var hay = !!estado.equipo;
    $("btnMapaDescargar").disabled = !hay || !s.n;
    $("btnMapaCompartir").disabled = !hay || !s.n;
    $("btnMapaLimpiar").disabled = !s.n;
    $("mapadVacio").hidden = hay;
  }

  /* ---------- imagen para descargar/compartir ---------- */
  function cargarImg(url) {
    return new Promise(function (ok) {
      if (!url) return ok(null);
      var i = new Image();
      var propio = false;
      try { propio = new URL(url, location.href).origin === location.origin; } catch (e) { propio = true; }
      if (!propio) i.crossOrigin = "anonymous";
      i.onload = function () { ok(i); }; i.onerror = function () { ok(null); };
      i.src = url;
    });
  }
  function fuente(v, f) { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || f; } catch (e) { return f; } }
  function contener(ctx, img, x, y, lado) {
    var r = Math.min(lado / img.naturalWidth, lado / img.naturalHeight), w = img.naturalWidth * r, h = img.naturalHeight * r;
    ctx.drawImage(img, x + (lado - w) / 2, y + (lado - h) / 2, w, h);
  }
  async function generarCanvas() {
    var W = 1080, P = 48, k = (W - P * 2) / M.W, mapH = M.H * k, T = fuente("--font-tit", "Oswald, Arial Narrow, sans-serif"), X = fuente("--font-text", "Inter, Arial, sans-serif");
    var cabecera = 200, mapaY = cabecera + 24, statsY = mapaY + mapH + 16 + 24, statsH = 140, barra = 64;
    var H = Math.round(statsY + statsH + 40 + barra);
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var x = c.getContext("2d");
    var h = casa(), lista = visitadosLista(), s = estadisticas();
    var ses = typeof sesionLectorActual === "function" ? sesionLectorActual() : null;
    var imgs = await Promise.all([cargarImg(getEscudoUrl(estado.equipo)), cargarImg(SITE.logo)]);

    x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#0c1b2e"; x.fillRect(0, 0, W, cabecera);
    x.fillStyle = "#ffffff"; x.textBaseline = "alphabetic";
    x.font = "700 34px " + T; x.fillText("MI MAPA DE DESPLAZAMIENTOS", P, 78);
    x.font = "600 30px " + X; x.fillStyle = "#5bb8e8"; x.fillText(corto(estado.equipo, 30), P, 128);
    x.font = "500 20px " + X; x.fillStyle = "rgba(255,255,255,0.85)";
    if (ses && ses.nombre) x.fillText("Mapa de " + corto(ses.nombre, 32), P, 166);
    if (imgs[0]) { x.fillStyle = "#fff"; x.beginPath(); x.arc(W - P - 52, cabecera / 2, 56, 0, Math.PI * 2); x.fill(); contener(x, imgs[0], W - P - 52 - 40, cabecera / 2 - 40, 80); }

    // marco del mapa
    x.fillStyle = "#f1f6fb"; x.beginPath();
    if (x.roundRect) x.roundRect(P - 8, mapaY - 8, W - (P - 8) * 2, mapH + 16, 18); else x.rect(P - 8, mapaY - 8, W - (P - 8) * 2, mapH + 16);
    x.fill();
    x.save(); x.translate(P, mapaY); x.scale(k, k);
    x.fillStyle = "#dbe5f0"; x.strokeStyle = "#ffffff"; x.lineWidth = 1.1; x.lineJoin = "round";
    M.tierra.forEach(function (d) { var p = new Path2D(d); x.fill(p); x.stroke(p); });
    x.strokeStyle = "#9fb0c3"; x.lineWidth = 1.4; x.stroke(new Path2D(M.marco));
    x.fillStyle = "#b5c3d3";
    M.estadios.forEach(function (e) { x.beginPath(); x.arc(e.x, e.y, 2.6, 0, Math.PI * 2); x.fill(); });
    if (h) {
      x.lineCap = "round"; x.strokeStyle = "rgba(209,19,46,0.55)"; x.lineWidth = 2.2;
      lista.forEach(function (e) { x.stroke(new Path2D(curva(h, e))); });
    }
    lista.forEach(function (e) {
      x.fillStyle = "#d1132e"; x.strokeStyle = "#ffffff"; x.lineWidth = 2;
      x.beginPath(); x.arc(e.x, e.y, 6.2, 0, Math.PI * 2); x.fill(); x.stroke();
    });
    if (h) {
      x.fillStyle = "#0c1b2e"; x.strokeStyle = "#5bb8e8"; x.lineWidth = 3.2;
      x.beginPath(); x.arc(h.x, h.y, 9.5, 0, Math.PI * 2); x.fill(); x.stroke();
    }
    if (estado.nombres) {
      var fs = 14.5, colocados = [];
      x.font = "700 " + fs + "px " + X; x.textBaseline = "alphabetic"; x.lineJoin = "round";
      (h ? [h].concat(lista) : lista).forEach(function (e) {
        var t = corto(e.n, 22), w = x.measureText(t).width, tx = e.x + 10, ty = e.y + 5;
        if (tx + w > M.W - 4) tx = e.x - 10 - w;
        var r = { x: tx, y: ty - fs, w: w, h: fs * 1.25 };
        if (colocados.some(function (o) { return r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y; })) return;
        colocados.push(r);
        x.strokeStyle = "rgba(255,255,255,0.95)"; x.lineWidth = 4; x.strokeText(t, tx, ty);
        x.fillStyle = "#0c1b2e"; x.fillText(t, tx, ty);
      });
    }
    x.restore();

    // cifras
    var cajas = [
      { v: fmt(s.n), e: s.n === 1 ? "ESTADIO VISITADO" : "ESTADIOS VISITADOS" },
      { v: fmt(s.km), e: "KM EN TOTAL (IDA Y VUELTA)" },
      { v: s.lejano ? fmt(s.kmLejano) + " km" : "—", e: s.lejano ? "MÁS LEJANO: " + corto(s.lejano.n, 20).toUpperCase() : "MÁS LEJANO" }
    ];
    var cw = (W - P * 2 - 24 * 2) / 3;
    cajas.forEach(function (b, i) {
      var bx = P + i * (cw + 24);
      x.fillStyle = "#f7f8fa"; x.strokeStyle = "#e7e9ee"; x.lineWidth = 1.5; x.beginPath();
      if (x.roundRect) x.roundRect(bx, statsY, cw, statsH, 16); else x.rect(bx, statsY, cw, statsH);
      x.fill(); x.stroke();
      x.textAlign = "center"; x.fillStyle = "#0c1b2e"; x.font = "700 52px " + T; x.fillText(b.v, bx + cw / 2, statsY + 72);
      x.fillStyle = "#5a6270"; x.font = "600 13px " + X; x.fillText(b.e, bx + cw / 2, statsY + 108);
      x.textAlign = "left";
    });

    // marca de agua del medio (misma que las porras)
    var by = H - barra;
    x.fillStyle = "rgba(12,27,46,0.88)"; x.fillRect(0, by, W, barra);
    var d = 40, ox = 20, oy = by + (barra - d) / 2;
    if (imgs[1]) { x.save(); x.beginPath(); x.arc(ox + d / 2, oy + d / 2, d / 2, 0, Math.PI * 2); x.clip(); contener(x, imgs[1], ox, oy, d); x.restore(); }
    x.textBaseline = "middle"; x.fillStyle = "#ffffff"; x.font = "700 22px " + T; x.fillText("ELOTROFÚTBOLTV", ox + d + 14, by + barra / 2 - 9);
    x.font = "500 15px " + X; x.fillStyle = "rgba(255,255,255,0.75)"; x.fillText("elotrofutbol.media", ox + d + 14, by + barra / 2 + 12);
    return c;
  }
  function nombreArchivo() {
    var s = typeof slugEquipo === "function" ? slugEquipo(estado.equipo) : "equipo";
    return "mi-mapa-desplazamientos-" + s + ".png";
  }
  async function blobMapa() {
    var c = await generarCanvas();
    var b = await new Promise(function (ok) { c.toBlob(ok, "image/png"); });
    if (!b) throw new Error("No se ha podido generar la imagen");
    return b;
  }
  function ocupado(btn, texto, fn) {
    var html = btn.innerHTML; btn.disabled = true; btn.innerHTML = "<span>" + texto + "</span>";
    return fn().finally(function () { btn.disabled = false; btn.innerHTML = html; refrescar(); });
  }
  function bajar(blob, nombre) {
    var u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }
  function descargar() {
    return ocupado($("btnMapaDescargar"), "Generando…", async function () {
      try { bajar(await blobMapa(), nombreArchivo()); }
      catch (e) { toast("No se ha podido descargar tu mapa. Inténtalo de nuevo.", "error"); }
    });
  }
  function compartir() {
    return ocupado($("btnMapaCompartir"), "Generando…", async function () {
      try {
        var b = await blobMapa(), n = nombreArchivo(), f = new File([b], n, { type: "image/png" }), s = estadisticas();
        if (navigator.canShare && navigator.canShare({ files: [f] })) {
          await navigator.share({ files: [f], title: "Mi mapa de desplazamientos — ELOTROFÚTBOLTV",
            text: "Mi mapa de desplazamientos con " + estado.equipo + ": " + s.n + " estadios y " + fmt(s.km) + " km. Haz el tuyo en " + location.origin + location.pathname });
        } else bajar(b, n);
      } catch (e) {
        if (e && e.name === "AbortError") return;
        toast("No se ha podido generar tu mapa. Inténtalo de nuevo.", "error");
      }
    });
  }

  /* ---------- arranque ---------- */
  function iniciar() {
    var ses = typeof sesionLectorActual === "function" ? sesionLectorActual() : null;
    var aviso = $("mapadAviso"), app = $("mapadApp");
    if (!ses) {
      aviso.hidden = false; app.hidden = true;
      $("mapadAcceso").href = "acceso.html?volver=" + encodeURIComponent(location.pathname + location.search);
      return;
    }
    aviso.hidden = true; app.hidden = false;
    cargarLocal();
    rellenarEquipos(); construirLista(); construirMapa();
    $("mapadOptNombres").checked = estado.nombres;
    $("mapadOptRutas").checked = estado.rutas;
    refrescar();

    $("mapadEquipo").addEventListener("change", function (ev) {
      estado.equipo = ev.target.value || null;
      var h = casa(); if (h) estado.visitados.delete(h.id);
      refrescar(); guardarDiferido();
    });
    $("mapadLista").addEventListener("change", function (ev) {
      var cb = ev.target.closest("input[type=checkbox]"); if (!cb) return;
      if (!estado.equipo) { cb.checked = false; toast("Elige primero tu equipo.", "info"); $("mapadEquipo").focus(); return; }
      if (cb.checked) estado.visitados.add(cb.value); else estado.visitados.delete(cb.value);
      refrescar(); guardarDiferido();
    });
    $("mapadBuscar").addEventListener("input", filtrarLista);
    function opciones() { try { localStorage.setItem(LS_OPC, JSON.stringify({ nombres: estado.nombres, rutas: estado.rutas })); } catch (e) { /* ok */ } }
    $("mapadOptNombres").addEventListener("change", function (ev) { estado.nombres = ev.target.checked; opciones(); pintarNombres(); });
    $("mapadOptRutas").addEventListener("change", function (ev) { estado.rutas = ev.target.checked; opciones(); pintarMapa(); });
    $("btnMapaLimpiar").addEventListener("click", function () {
      if (!confirm("¿Quitar todos los estadios marcados?")) return;
      estado.visitados.clear(); refrescar(); guardarDiferido();
    });
    $("btnMapaDescargar").addEventListener("click", descargar);
    $("btnMapaCompartir").addEventListener("click", compartir);
    cargarServidor().then(function () { rellenarEquipos(); refrescar(); });
  }
  window.iniciarMapaDesplazamientos = iniciar;
})();
