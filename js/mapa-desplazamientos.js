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

  var estado = { equipo: null, visitados: new Set(), nombres: true, rutas: true, filtro: "t" };
  var vb = { x: 0, y: 0, w: M.W, h: M.H };
  var temporizadorGuardado = null;
  var arrastrado = false;

  /* Modo ligero (móvil, pantalla táctil, equipos modestos o ahorro de datos): sin filtros SVG ni animaciones
     infinitas. Esos efectos obligan al navegador a repintar todo el mapa en cada frame y es lo que lo ponía lento. */
  var LITE = (function () {
    try {
      var cn = navigator.connection || {};
      return !!((window.matchMedia && matchMedia("(max-width: 860px), (pointer: coarse)").matches) ||
        (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
        (navigator.deviceMemory && navigator.deviceMemory <= 4) || cn.saveData);
    } catch (e) { return false; }
  })();
  var SIN_ANIM = (function () { try { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } })();
  /* Parejas de estadios a menos de 20 unidades (posiciones fijas): se calculan una sola vez. */
  var PARES_CERCA = (function () {
    var E = M.estadios, r = [], i, j, d;
    for (i = 0; i < E.length; i++) for (j = i + 1; j < E.length; j++) {
      d = Math.hypot(E[i].x - E[j].x, E[i].y - E[j].y);
      if (d < 20) r.push([i, j, d]);
    }
    return r;
  })();
  function rejilla(puntos, celda) {
    var g = new Map();
    puntos.forEach(function (p, i) {
      var c = Math.floor(p.x / celda) + "," + Math.floor(p.y / celda), a = g.get(c);
      if (a) a.push(i); else g.set(c, [i]);
    });
    return g;
  }
  function cercanos(g, celda, p, fn) {
    var cx = Math.floor(p.x / celda), cy = Math.floor(p.y / celda), dx, dy, a, t;
    for (dx = -1; dx <= 1; dx++) for (dy = -1; dy <= 1; dy++) {
      a = g.get((cx + dx) + "," + (cy + dy));
      if (a) for (t = 0; t < a.length; t++) fn(a[t]);
    }
  }

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
  /* Nombre oficial del estadio (campo "o" de los datos; si falta, el nombre corto). */
  function nom(e) { return e.o || e.n; }

  /* ---------- colocación sin solapes ----------
     1) Abanico: estadios que caen casi en el mismo punto (o bajo el escudo del equipo) se reparten en círculo,
        con un tamaño constante en pantalla, para poder pulsar cada uno.
     2) Etiquetas: cada nombre se prueba en varias posiciones alrededor de su punto; si ninguna cercana está libre
        se aleja con una línea guía. Ninguna etiqueta se descarta. */
  function abanico(k, h) {
    var E = M.estadios, n = E.length, umbral = 10 * k, esp = 12 * k, rEsc = 24 * k, res = new Map(), i, j;
    var pa = E.map(function (_, i) { return i; });
    function raiz(a) { while (pa[a] !== a) { pa[a] = pa[pa[a]]; a = pa[a]; } return a; }
    var ih = h ? E.indexOf(h) : -1;
    PARES_CERCA.forEach(function (q) {
      var lim = (q[0] === ih || q[1] === ih) ? 20 * k : umbral;
      if (q[2] < lim) pa[raiz(q[0])] = raiz(q[1]);
    });
    var grupos = new Map();
    E.forEach(function (e, i) { var r = raiz(i); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(e); });
    grupos.forEach(function (g) {
      if (g.length === 1) { res.set(g[0].id, { x: g[0].x, y: g[0].y, abanico: false }); return; }
      var cx = 0, cy = 0; g.forEach(function (e) { cx += e.x; cy += e.y; }); cx /= g.length; cy /= g.length;
      var conCasa = h && g.indexOf(h) >= 0, resto = g.filter(function (e) { return e !== h; }).sort(function (a, b) { return a.n.localeCompare(b.n, "es"); });
      if (conCasa) res.set(h.id, { x: cx, y: cy, abanico: true, cx: cx, cy: cy });
      var m = resto.length, r = m === 1 ? esp / 2 : esp / (2 * Math.sin(Math.PI / m));
      if (conCasa) r = Math.max(r, rEsc); else r = Math.max(r, esp * 0.6);
      resto.forEach(function (e, t) {
        var a = -Math.PI / 2 + (2 * Math.PI * t) / m + (conCasa ? 0.35 : 0);
        res.set(e.id, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), abanico: true, cx: cx, cy: cy });
      });
    });
    /* relajación: los puntos repartidos en abanico se apartan de cualquier otro punto cercano (también de otros grupos).
       Solo se recorren los puntos móviles y sus vecinos de una rejilla (antes eran todas las parejas, 40 veces). */
    var ps = E.map(function (e) { return { id: e.id, d: res.get(e.id), fijo: !res.get(e.id).abanico || (h && e === h) }; });
    var moviles = [];
    ps.forEach(function (p, idx) { if (!p.fijo) moviles.push(idx); });
    var sep = esp * 0.95, celda = Math.max(sep, 1), it, a, b, dx, dy, dd, f;
    if (moviles.length) for (it = 0; it < 40; it++) {
      var movido = false, gr = rejilla(ps.map(function (p) { return p.d; }), celda);
      moviles.forEach(function (ia) {
        a = ps[ia];
        cercanos(gr, celda, a.d, function (ib) {
          if (ib === ia) return;
          b = ps[ib];
          if (!b.fijo && ib < ia) return; // cada pareja de móviles se trata una sola vez
          dx = b.d.x - a.d.x; dy = b.d.y - a.d.y; dd = Math.hypot(dx, dy);
          if (dd >= sep) return;
          if (dd < 1e-6) { dx = Math.cos(ia + ib); dy = Math.sin(ia + ib); dd = 1; }
          f = (sep - dd) / dd * (b.fijo ? 1 : 0.5); movido = true;
          a.d.x -= dx * f; a.d.y -= dy * f;
          if (!b.fijo) { b.d.x += dx * f; b.d.y += dy * f; }
        });
      });
      if (!movido) break;
    }
    return res;
  }
  var cacheAncho = new Map(), ctxMedir = null;
  function anchoLinea(t, fs, fam) {
    if (!ctxMedir) ctxMedir = document.createElement("canvas").getContext("2d");
    var clave = fam + "|" + t, w = cacheAncho.get(clave);
    if (w == null) { ctxMedir.font = "700 100px " + fam; w = ctxMedir.measureText(t).width / 100; cacheAncho.set(clave, w); }
    return w * fs;
  }
  function partir(txt, max) {
    if (txt.length <= max) return [txt];
    var pal = txt.split(" "), lineas = [], act = "";
    pal.forEach(function (p) {
      if (act && (act + " " + p).length > max) { lineas.push(act); act = p; } else act = act ? act + " " + p : p;
    });
    if (act) lineas.push(act);
    return lineas;
  }
  /* items: [{e, p:{x,y}, rad, lineas, ancho}] -> añade .r (rectángulo) y .guia (línea desde el punto).
     bloqueos: rectángulos que no se pueden tapar (p. ej. la leyenda). */
  function colocarEtiquetas(items, fs, W, H, bloqueos) {
    var pad = fs * 0.4, alto = function (it) { return it.lineas.length * fs * 1.12 + pad; };
    var grados = [0, 180, -45, 45, -135, 135, -90, 90, -22.5, 22.5, 157.5, -157.5, -67.5, 67.5, -112.5, 112.5];
    var dirs = grados.map(function (g) { return [Math.cos(g * Math.PI / 180), Math.sin(g * Math.PI / 180)]; });
    var puestos = [], duros = items.map(function (it) { return { x: it.p.x - it.rad, y: it.p.y - it.rad, w: it.rad * 2, h: it.rad * 2 }; });
    (bloqueos || []).forEach(function (b) { duros.push(b); });
    function area(a, b) { var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }
    function rectPara(it, d, v) {
      var w = it.ancho + pad * 2, h = alto(it), ext = Math.abs(v[0]) * w / 2 + Math.abs(v[1]) * h / 2;
      return { x: it.p.x + v[0] * (d + ext) - w / 2, y: it.p.y + v[1] * (d + ext) - h / 2, w: w, h: h };
    }
    function dentro(r) { return r.x >= 2 && r.y >= 2 && r.x + r.w <= W - 2 && r.y + r.h <= H - 2; }
    function coste(r, yo) {
      var c = 0;
      puestos.forEach(function (o) { c += area(r, o); });
      duros.forEach(function (o, i) { if (i !== yo) c += area(r, o); });
      return c;
    }
    // primero el equipo y los puntos más apretados: son los que menos opciones tienen
    var orden = items.map(function (it, i) {
      var vec = 0; items.forEach(function (o) { if (o !== it && Math.hypot(o.p.x - it.p.x, o.p.y - it.p.y) < fs * 8) vec++; });
      return { it: it, i: i, vec: vec, casa: it.rad > fs * 1.2 * 1 && it.esCasa ? 1 : 0 };
    }).sort(function (a, b) { return b.casa - a.casa || b.vec - a.vec; });
    orden.forEach(function (o) {
      var it = o.it, yo = o.i, mejor = null, ok = false, anillo, di;
      for (anillo = 0; anillo < 16 && !ok; anillo++) {
        var d = it.rad + fs * 0.5 + anillo * fs * 1.25;
        for (di = 0; di < dirs.length; di++) {
          var r = rectPara(it, d, dirs[di]);
          if (!dentro(r)) continue;
          var c = coste(r, yo);
          if (c === 0) { mejor = { r: r, anillo: anillo }; ok = true; break; }
          if (!mejor || c + anillo * 2 < mejor.c) mejor = { r: r, anillo: anillo, c: c + anillo * 2 };
        }
      }
      if (!mejor) { // sin hueco dentro del mapa: se encaja en el borde, pero se muestra
        var r0 = rectPara(it, it.rad + fs * 0.5, dirs[0]);
        r0.x = Math.min(W - r0.w - 2, Math.max(2, r0.x)); r0.y = Math.min(H - r0.h - 2, Math.max(2, r0.y));
        mejor = { r: r0, anillo: 0 };
      }
      it.r = mejor.r; puestos.push(it.r);
      var rr = it.r, gx = Math.min(rr.x + rr.w, Math.max(rr.x, it.p.x)), gy = Math.min(rr.y + rr.h, Math.max(rr.y, it.p.y));
      it.guia = Math.hypot(gx - it.p.x, gy - it.p.y) > it.rad + fs * 0.9 ? { x1: it.p.x, y1: it.p.y, x2: gx, y2: gy } : null;
    });
    return items;
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
    var orden = M.estadios.slice().sort(function (a, b) { return nom(a).localeCompare(nom(b), "es"); });
    $("mapadLista").innerHTML = orden.map(function (e) {
      return '<li class="mapad-item" data-id="' + e.id + '" data-q="' + esc(normalizar(nom(e) + " " + e.n + " " + e.c.join(" "))) + '">' +
        '<label><input type="checkbox" value="' + e.id + '"><span class="mapad-item-txt"><strong>' + esc(nom(e)) + "</strong><small>" + esc(e.c.join(" · ")) + "</small></span></label></li>";
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
    document.querySelectorAll("#mapadLista .mapad-item").forEach(function (li) { var on = estado.visitados.has(li.dataset.id);
      li.hidden = (!!q && li.dataset.q.indexOf(q) < 0) || (estado.filtro === "v" && !on) || (estado.filtro === "p" && on); });
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
    var raiz = document.createDocumentFragment(), lienzo = svg.parentNode;
    if (lienzo && lienzo.classList) lienzo.classList.toggle("mapad-lite", LITE);
    var df = el("defs", {}, raiz), i;
    var lt = el("linearGradient", { id: "mdTierra", x1: 0, y1: 0, x2: 0, y2: 1 }, df);
    el("stop", { offset: 0, "stop-color": "#31598c" }, lt); el("stop", { offset: 1, "stop-color": "#1a3556" }, lt);
    var lm = el("radialGradient", { id: "mdMar", cx: "32%", cy: "22%", r: "90%" }, df);
    el("stop", { offset: 0, "stop-color": "#1a3656" }, lm); el("stop", { offset: 1, "stop-color": "#07111d" }, lm);
    if (!LITE) {
      el("feGaussianBlur", { stdDeviation: 6 }, el("filter", { id: "mdBlur", x: "-10%", y: "-10%", width: "120%", height: "120%" }, df));
      el("rect", { width: 1.3, height: 8, fill: "#fff", "fill-opacity": 0.06 }, el("pattern", { id: "mdRayas", width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, df));
    }
    el("rect", { width: M.W, height: M.H, fill: "url(#mdMar)" }, raiz);
    var gr = el("g", { "class": "mapad-grat" }, raiz);
    for (i = 1; i < 20; i++) el("path", { d: "M" + i * 50 + ",0V" + M.H }, gr);
    for (i = 1; i < 15; i++) el("path", { d: "M0," + i * 50 + "H" + M.W }, gr);
    el("path", { d: "M0,572H369V" + M.H + "H0Z", "class": "mapad-panelcan" }, raiz);
    /* Modo ligero: la tierra se dibuja una sola vez (antes 3: halo desenfocado + relleno + trama) */
    if (!LITE) {
      var ha = el("g", { "class": "mapad-halo", filter: "url(#mdBlur)" }, raiz);
      M.tierra.forEach(function (d) { el("path", { d: d }, ha); });
    }
    var g = el("g", { "class": "mapad-tierra" }, raiz);
    M.tierra.forEach(function (d) { el("path", { d: d }, g); });
    if (!LITE) {
      var gy = el("g", { "class": "mapad-rayas" }, raiz);
      M.tierra.forEach(function (d) { el("path", { d: d }, gy); });
    }
    el("path", { d: M.marco, "class": "mapad-marco" }, raiz);
    el("text", { x: 14, y: 592, "class": "mapad-rotulo" }, svg).textContent = "ISLAS CANARIAS";
    var br = el("g", { transform: "translate(940 655)", "class": "mapad-brujula", "aria-hidden": "true" }, raiz);
    el("circle", { r: 26 }, br); el("path", { d: "M0,-20L6,2L0,-3L-6,2Z", "class": "mapad-norte" }, br); el("path", { d: "M0,20L4,4L0,8L-4,4Z" }, br);
    el("text", { y: -30, "text-anchor": "middle" }, br).textContent = "N";
    el("g", { id: "mapadRutas", "class": "mapad-rutas" }, raiz);
    el("g", { id: "mapadAbanico", "class": "mapad-abanico", "aria-hidden": "true" }, raiz);
    el("g", { id: "mapadPuntos" }, raiz);
    el("g", { id: "mapadEscudoMapa", "class": "mapad-escudo-mapa", "aria-hidden": "true" }, raiz);
    el("g", { id: "mapadNombres", "class": "mapad-nombres", "aria-hidden": "true" }, raiz);
    svg.appendChild(raiz);
    puntosEls = null;
    var gp = $("mapadPuntos");
    M.estadios.forEach(function (e) {
      var c = el("g", { "class": "mapad-punto", "data-id": e.id, tabindex: "0", role: "button", "aria-pressed": "false",
        "aria-label": nom(e) + " (" + e.c.join(", ") + ")" }, gp);
      var t = el("title", {}, c); t.textContent = nom(e) + " · " + e.c.join(" · ");
      el("circle", { cx: 0, cy: 0, r: 9, "class": "mapad-hit" }, c);
      el("circle", { cx: 0, cy: 0, r: 8, "class": "mapad-ring" }, c);
      el("circle", { cx: 0, cy: 0, r: 4.2, "class": "mapad-dot" }, c);
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
    var tip = $("mapadTip");
    gp.addEventListener("pointerover", function (ev) {
      var p = ev.target.closest(".mapad-punto");
      if (!p || ev.pointerType === "touch") return;
      var e = porId.get(p.dataset.id), h = casa();
      var d = h && h !== e ? fmt(Math.round(km(h, e))) + " km en línea recta" : (h === e ? "Tu estadio" : "");
      tip.innerHTML = "<strong>" + esc(nom(e)) + "</strong><span>" + esc(e.c.join(" · ")) + "</span>" + (d ? "<em>" + d + "</em>" : "");
      var r = p.getBoundingClientRect(), L = svg.parentNode.getBoundingClientRect();
      tip.style.left = Math.min(L.width - 90, Math.max(90, r.left + r.width / 2 - L.left)) + "px"; tip.style.top = (r.top - L.top) + "px"; tip.hidden = false;
    });
    gp.addEventListener("pointerout", function () { tip.hidden = true; });
    activarZoomYArrastre(svg);
    aplicarVb();
  }
  var kPintado = null, tRecol = null, ultimaRecol = 0, tMov = null, puntosEls = null;
  /* Mientras se arrastra o se hace zoom se pausan las animaciones (el mapa se repinta menos y va más fluido). */
  function marcarMovimiento() {
    var svg = $("mapadSvg"), lz = svg && svg.parentNode;
    if (!lz) return;
    if (!lz.classList.contains("mapad-moviendo")) {
      lz.classList.add("mapad-moviendo");
      try { svg.pauseAnimations(); } catch (e) { /* sin SMIL */ }
    }
    clearTimeout(tMov);
    tMov = setTimeout(function () {
      lz.classList.remove("mapad-moviendo");
      try { svg.unpauseAnimations(); } catch (e) { /* sin SMIL */ }
    }, 220);
  }
  function aplicarVb(inmediato) {
    var svg = $("mapadSvg"), k = vb.w / M.W;
    svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h);
    var zoomed = vb.w < M.W - 0.01;
    if (zoomed !== svg.classList.contains("mapad-zoomed")) svg.classList.toggle("mapad-zoomed", zoomed);
    if (kPintado === null || Math.abs(k - kPintado) > 1e-6) {
      if (inmediato === true || kPintado === null) { clearTimeout(tRecol); tRecol = null; recolocar(); }
      else programarRecolocar();
    }
    if (kPintado !== null) marcarMovimiento();
  }
  /* El recolocado completo (abanico, rutas, escudo y nombres) es lo caro: durante un zoom animado se hace
     como mucho cada ~110 ms y siempre una última vez al terminar. */
  function programarRecolocar() {
    if (tRecol) return;
    var espera = Math.max(0, 110 - (performance.now() - ultimaRecol));
    tRecol = setTimeout(function () {
      tRecol = null;
      if (Math.abs(vb.w / M.W - kPintado) > 1e-6) recolocar();
    }, espera);
  }

  function pos(e) { return disp.get(e.id) || { x: e.x, y: e.y }; }
  var disp = new Map();
  /* Todo lo que depende de la posición (puntos en abanico, rutas, escudo y nombres) se recalcula junto
     cuando cambia el zoom o el estado, para que nada quede desfasado ni tapado. */
  function recolocar() {
    var k = vb.w / M.W, h = casa();
    kPintado = k; ultimaRecol = performance.now();
    var svgK = $("mapadSvg"); if (svgK) svgK.style.setProperty("--k", k.toFixed(5));
    disp = abanico(k, h);
    var gAb = $("mapadAbanico"); if (gAb) gAb.innerHTML = "";
    var fAb = document.createDocumentFragment();
    /* radio de pulsación de cada punto: nunca llega al punto vecino, así ninguno tapa a otro.
       Con 24 unidades de rejilla basta: más allá de ~19k el radio ya está en su tope (9k). */
    var ptsD = M.estadios.map(function (e) { return disp.get(e.id); }), radioHit = new Map(), CELDA = 24;
    var gr = rejilla(ptsD, CELDA);
    M.estadios.forEach(function (e, i) {
      var mind = Infinity, a = ptsD[i];
      cercanos(gr, CELDA, a, function (j) { if (j !== i) { var dd = Math.hypot(a.x - ptsD[j].x, a.y - ptsD[j].y); if (dd < mind) mind = dd; } });
      radioHit.set(e.id, Math.min(9 * k, Math.max(0.5 * mind * 0.96, 0.6 * k)));
    });
    if (!puntosEls) puntosEls = Array.prototype.slice.call(document.querySelectorAll("#mapadPuntos .mapad-punto"));
    puntosEls.forEach(function (p) {
      var e = porId.get(p.dataset.id), d = disp.get(e.id), on = estado.visitados.has(e.id), esCasa = h && h.id === e.id;
      p.setAttribute("transform", "translate(" + d.x.toFixed(2) + " " + d.y.toFixed(2) + ")");
      var c = p.children; // title, hit, ring, dot
      c[1].setAttribute("r", radioHit.get(e.id).toFixed(3)); c[2].setAttribute("r", 8 * k);
      c[3].setAttribute("r", ((esCasa ? 7.5 : on ? 5.6 : 4.2) * k).toFixed(3));
      if (d.abanico && gAb && !(h && h.id === e.id)) el("line", { x1: d.cx, y1: d.cy, x2: d.x.toFixed(2), y2: d.y.toFixed(2) }, fAb);
    });
    if (gAb) gAb.appendChild(fAb);
    pintarRutas(); pintarEscudoMapa(); pintarNombres();
  }
  function pintarMapa() {
    var h = casa();
    if (!puntosEls) puntosEls = Array.prototype.slice.call(document.querySelectorAll("#mapadPuntos .mapad-punto"));
    puntosEls.forEach(function (p) {
      var id = p.dataset.id, on = estado.visitados.has(id), esCasa = h && h.id === id;
      p.classList.toggle("on", on && !esCasa);
      p.classList.toggle("casa", !!esCasa);
      p.setAttribute("aria-pressed", on || esCasa ? "true" : "false");
    });
    recolocar();
  }
  function pintarRutas() {
    var h = casa(), rutas = $("mapadRutas");
    rutas.innerHTML = "";
    if (!h || !estado.rutas) return;
    var lista = visitadosLista(), f = document.createDocumentFragment();
    /* Los puntos que viajan por la ruta (animateMotion) mantienen el mapa repintándose sin parar:
       solo en modo completo y con pocas rutas. */
    var animar = !LITE && !SIN_ANIM && lista.length <= 30;
    lista.forEach(function (e, i) {
      var d = curva(pos(h), pos(e));
      el("path", { d: d, "class": "mapad-r-glow" }, f); el("path", { d: d, "class": "mapad-r-linea" }, f);
      if (animar) {
        var c = el("circle", { r: 2.6 * (vb.w / M.W), "class": "mapad-r-dot" }, f);
        el("animateMotion", { dur: (3 + (i % 5) * 0.4) + "s", begin: (i % 7) * 0.45 + "s", repeatCount: "indefinite", path: d }, c);
      }
    });
    rutas.appendChild(f);
  }
  /* Escudo del equipo sobre su estadio en el mapa. Su tamaño sigue al zoom para verse siempre igual. */
  function pintarEscudoMapa() {
    var g = $("mapadEscudoMapa");
    if (!g) return;
    g.innerHTML = "";
    var h = casa();
    if (!h || typeof getEscudoUrl !== "function") return;
    var url = getEscudoUrl(estado.equipo);
    if (!url) return;
    var k = vb.w / M.W, r = 17 * k, ph = pos(h);
    el("circle", { cx: ph.x, cy: ph.y, r: r.toFixed(2), "class": "mapad-escudo-fondo", "stroke-width": (2.6 * k).toFixed(2) }, g);
    var im = el("image", { x: (ph.x - r * 0.66).toFixed(2), y: (ph.y - r * 0.66).toFixed(2), width: (r * 1.32).toFixed(2), height: (r * 1.32).toFixed(2), preserveAspectRatio: "xMidYMid meet", href: url }, g);
    im.addEventListener("error", function () { g.innerHTML = ""; });
  }
  function pintarNombres() {
    var g = $("mapadNombres");
    if (!g) return;
    g.innerHTML = "";
    if (!estado.nombres) return;
    var k = vb.w / M.W, fs = 12 * k, h = casa(), fam = fuente("--font-text", "Inter, Arial, sans-serif");
    var lista = visitadosLista(); if (h) lista.unshift(h);
    var items = lista.map(function (e) {
      var ls = partir(nom(e), 26), p = pos(e);
      return { e: e, p: p, esCasa: !!(h && e === h), rad: (h && e === h ? 19 : 7) * k, lineas: ls, ancho: Math.max.apply(null, ls.map(function (l) { return anchoLinea(l, fs, fam); })) };
    });
    colocarEtiquetas(items, fs, M.W, M.H);
    var gf = document.createDocumentFragment();
    items.forEach(function (it) { if (it.guia) el("line", { x1: it.guia.x1.toFixed(1), y1: it.guia.y1.toFixed(1), x2: it.guia.x2.toFixed(1), y2: it.guia.y2.toFixed(1), "class": "mapad-guia", "stroke-width": (0.9 * k).toFixed(2) }, gf); });
    items.forEach(function (it) {
      var r = it.r;
      el("rect", { x: r.x.toFixed(1), y: r.y.toFixed(1), width: r.w.toFixed(1), height: r.h.toFixed(1), rx: (fs * 0.4).toFixed(1), "class": "mapad-pill" + (h && it.e === h ? " mapad-pill-casa" : ""), "stroke-width": (0.8 * k).toFixed(2) }, gf);
      var t = el("text", { x: (r.x + fs * 0.4).toFixed(1), "font-size": fs.toFixed(2) }, gf);
      it.lineas.forEach(function (l, i) {
        var ts = el("tspan", { x: (r.x + fs * 0.4).toFixed(1), y: (r.y + fs * 0.2 + fs * 1.12 * (i + 0.82)).toFixed(2) }, t); ts.textContent = l;
      });
    });
    g.appendChild(gf);
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
    function animarVb(t) {
      var a = { x: vb.x, y: vb.y, w: vb.w }, t0 = performance.now();
      (function paso(n) {
        var k = Math.min(1, (n - t0) / 280); k = 1 - Math.pow(1 - k, 3);
        vb.x = a.x + (t.x - a.x) * k; vb.y = a.y + (t.y - a.y) * k; vb.w = a.w + (t.w - a.w) * k;
        limitarVb(); aplicarVb(k >= 1); if (k < 1) requestAnimationFrame(paso);
      })(t0);
    }
    function zoomA(f) {
      var nw = Math.min(M.W, Math.max(M.W / 8, vb.w / f)), nh = nw * M.H / M.W, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
      animarVb({ x: cx - nw / 2, y: cy - nh / 2, w: nw });
    }
    $("mapadZoomMas").onclick = function () { zoomA(1.6); };
    $("mapadZoomMenos").onclick = function () { zoomA(1 / 1.6); };
    $("mapadZoomReset").onclick = function () { animarVb({ x: 0, y: 0, w: M.W }); };
    /* Pantalla completa: capa fija (vale en todos los navegadores) + API nativa cuando existe. */
    (function () {
      var lienzo = document.querySelector(".mapad-lienzo"), btn = $("mapadPantalla");
      if (!lienzo || !btn) return;
      function nativa() { return document.fullscreenElement || document.webkitFullscreenElement; }
      function aplicar(on) {
        lienzo.classList.toggle("mapad-fs", on);
        document.documentElement.classList.toggle("mapad-fs-on", on);
        btn.setAttribute("aria-pressed", String(on));
        btn.setAttribute("aria-label", on ? "Salir de pantalla completa" : "Pantalla completa");
        btn.title = on ? "Salir de pantalla completa" : "Pantalla completa";
      }
      function entrar() {
        aplicar(true);
        try {
          var r = lienzo.requestFullscreen ? lienzo.requestFullscreen() : (lienzo.webkitRequestFullscreen ? lienzo.webkitRequestFullscreen() : null);
          if (r && r.catch) r.catch(function () { /* se queda la capa fija */ });
        } catch (e) { /* se queda la capa fija */ }
      }
      function salir() {
        aplicar(false);
        try {
          if (nativa()) { var r = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen(); if (r && r.catch) r.catch(function () {}); }
        } catch (e) { /* ok */ }
      }
      btn.onclick = function () { if (lienzo.classList.contains("mapad-fs")) salir(); else entrar(); };
      function alCambiarNativa() { if (!nativa() && lienzo.classList.contains("mapad-fs") && window.__mapadFsNativo) { window.__mapadFsNativo = false; aplicar(false); } else if (nativa()) window.__mapadFsNativo = true; }
      document.addEventListener("fullscreenchange", alCambiarNativa);
      document.addEventListener("webkitfullscreenchange", alCambiarNativa);
      document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && lienzo.classList.contains("mapad-fs")) salir(); });
    })();
    function aPunto(ev) {
      var r = svg.getBoundingClientRect();
      return { x: vb.x + (ev.clientX - r.left) / r.width * vb.w, y: vb.y + (ev.clientY - r.top) / r.height * vb.h };
    }
    svg.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      var p = aPunto(ev); zoom(ev.deltaY < 0 ? 1.25 : 1 / 1.25, p.x, p.y);
    }, { passive: false });
    var inicio = null, rafPan = 0;
    svg.addEventListener("pointerdown", function (ev) {
      if (vb.w >= M.W) return; // sin zoom no hay nada que mover
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      inicio = { id: ev.pointerId, cx: ev.clientX, cy: ev.clientY, x: vb.x, y: vb.y, mov: false, r: svg.getBoundingClientRect() };
    });
    svg.addEventListener("pointermove", function (ev) {
      if (!inicio || ev.pointerId !== inicio.id) return;
      if (ev.pointerType === "mouse" && ev.buttons === 0) { fin(ev); return; }
      var dx = ev.clientX - inicio.cx, dy = ev.clientY - inicio.cy;
      if (!inicio.mov) {
        if (Math.hypot(dx, dy) < 6) return;
        inicio.mov = true; arrastrado = true;
        /* con el puntero capturado el arrastre sigue aunque el dedo/ratón se salga del mapa */
        try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
      }
      vb.x = inicio.x - dx / inicio.r.width * vb.w; vb.y = inicio.y - dy / inicio.r.height * vb.h;
      limitarVb();
      /* como mucho un repintado por frame, aunque el móvil mande muchos eventos de movimiento */
      if (!rafPan) rafPan = requestAnimationFrame(function () { rafPan = 0; aplicarVb(); });
    });
    function fin(ev) {
      if (ev && inicio && ev.pointerId !== inicio.id) return;
      if (inicio && inicio.mov) { try { svg.releasePointerCapture(inicio.id); } catch (e) { /* ok */ } }
      inicio = null; setTimeout(function () { arrastrado = false; }, 0);
    }
    svg.addEventListener("pointerup", fin);
    svg.addEventListener("pointercancel", fin);
    svg.addEventListener("pointerleave", function (ev) { if (ev.pointerType === "mouse" && inicio && !inicio.mov) fin(ev); });
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
    $("mapadLejano").textContent = s.lejano ? nom(s.lejano) + " · " + fmt(s.kmLejano) + " km" : "—";
    var hay = !!estado.equipo;
    $("btnMapaDescargar").disabled = !hay || !s.n;
    $("btnMapaCompartir").disabled = !hay || !s.n;
    $("btnMapaLimpiar").disabled = !s.n;
    $("mapadVacio").hidden = hay;
    var tot = M.estadios.length - (casa() ? 1 : 0);
    $("mapadProgTxt").textContent = fmt(s.n) + " de " + fmt(tot) + " estadios";
    $("mapadProgBar").style.width = (tot ? Math.round(s.n / tot * 100) : 0) + "%";
    filtrarLista();
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

    var fg = x.createLinearGradient(0, 0, W, H); fg.addColorStop(0, "#0c1b2e"); fg.addColorStop(1, "#152b46"); x.fillStyle = fg; x.fillRect(0, 0, W, H);
    var gc = x.createLinearGradient(0, 0, W, cabecera); gc.addColorStop(0, "#0c1b2e"); gc.addColorStop(1, "#9c0e23"); x.fillStyle = gc; x.fillRect(0, 0, W, cabecera);
    x.fillStyle = "#5bb8e8"; x.fillRect(0, cabecera - 5, W, 5);
    x.fillStyle = "#ffffff"; x.textBaseline = "alphabetic";
    x.font = "700 34px " + T; x.fillText("MI MAPA DE DESPLAZAMIENTOS", P, 78);
    x.font = "600 30px " + X; x.fillStyle = "#5bb8e8"; x.fillText(corto(estado.equipo, 30), P, 128);
    x.font = "500 20px " + X; x.fillStyle = "rgba(255,255,255,0.85)";
    if (ses && ses.nombre) x.fillText("Mapa de " + corto(ses.nombre, 32), P, 166);
    if (imgs[0]) { x.fillStyle = "#fff"; x.beginPath(); x.arc(W - P - 52, cabecera / 2, 56, 0, Math.PI * 2); x.fill(); contener(x, imgs[0], W - P - 52 - 40, cabecera / 2 - 40, 80); }

    // marco del mapa
    x.fillStyle = "#0a1626"; x.beginPath();
    if (x.roundRect) x.roundRect(P - 8, mapaY - 8, W - (P - 8) * 2, mapH + 16, 18); else x.rect(P - 8, mapaY - 8, W - (P - 8) * 2, mapH + 16);
    x.fill();
    x.save(); x.translate(P, mapaY); x.scale(k, k);
    x.strokeStyle = "rgba(255,255,255,0.05)"; x.lineWidth = 1;
    for (var gi = 1; gi < 20; gi++) { x.beginPath(); x.moveTo(gi * 50, 0); x.lineTo(gi * 50, M.H); x.stroke(); }
    for (gi = 1; gi < 15; gi++) { x.beginPath(); x.moveTo(0, gi * 50); x.lineTo(M.W, gi * 50); x.stroke(); }
    var lgT = x.createLinearGradient(0, 0, 0, M.H); lgT.addColorStop(0, "#31598c"); lgT.addColorStop(1, "#1a3556");
    x.save(); x.shadowColor = "rgba(91,184,232,0.6)"; x.shadowBlur = 16; x.fillStyle = lgT; M.tierra.forEach(function (d) { x.fill(new Path2D(d)); }); x.restore();
    x.fillStyle = lgT; x.strokeStyle = "#4a77ab"; x.lineWidth = 1; x.lineJoin = "round";
    M.tierra.forEach(function (d) { var p = new Path2D(d); x.fill(p); x.stroke(p); });
    x.strokeStyle = "rgba(91,184,232,0.5)"; x.lineWidth = 1.4; x.stroke(new Path2D(M.marco));
    var dp = abanico(1.15, h), pp = function (e) { return dp.get(e.id) || e; };
    x.fillStyle = "#6f8aad";
    M.estadios.forEach(function (e) { var q = pp(e); x.beginPath(); x.arc(q.x, q.y, 2.6, 0, Math.PI * 2); x.fill(); });
    if (h) {
      x.lineCap = "round"; x.strokeStyle = "rgba(255,90,112,0.8)"; x.lineWidth = 2.2; x.setLineDash([7, 6]); x.shadowColor = "rgba(255,90,112,0.8)"; x.shadowBlur = 6;
      lista.forEach(function (e) { x.stroke(new Path2D(curva(pp(h), pp(e)))); });
      x.setLineDash([]); x.shadowBlur = 0;
    }
    lista.forEach(function (e) {
      var q = pp(e);
      x.fillStyle = "#ff3b55"; x.strokeStyle = "#ffffff"; x.lineWidth = 2; x.shadowColor = "rgba(255,59,85,0.95)"; x.shadowBlur = 12;
      x.beginPath(); x.arc(q.x, q.y, 6.2, 0, Math.PI * 2); x.fill(); x.stroke();
    });
    x.shadowBlur = 0;
    if (h) {
      var qh = pp(h);
      x.fillStyle = "#0c1b2e"; x.strokeStyle = "#5bb8e8"; x.lineWidth = 3.2; x.shadowColor = "rgba(91,184,232,0.95)"; x.shadowBlur = 14;
      x.beginPath(); x.arc(qh.x, qh.y, 9.5, 0, Math.PI * 2); x.fill(); x.stroke(); x.shadowBlur = 0;
      if (imgs[0]) {
        x.fillStyle = "#ffffff"; x.strokeStyle = "#5bb8e8"; x.lineWidth = 3; x.shadowColor = "rgba(91,184,232,0.95)"; x.shadowBlur = 14;
        x.beginPath(); x.arc(qh.x, qh.y, 17, 0, Math.PI * 2); x.fill(); x.stroke(); x.shadowBlur = 0;
        contener(x, imgs[0], qh.x - 11.5, qh.y - 11.5, 23);
      }
    }
    if (estado.nombres) {
      var fs = 14.5;
      x.font = "700 " + fs + "px " + X; x.textBaseline = "alphabetic"; x.lineJoin = "round";
      var its = (h ? [h].concat(lista) : lista).map(function (e) {
        var ls = partir(nom(e), 26);
        return { e: e, p: pp(e), esCasa: !!(h && e === h), rad: (h && e === h && imgs[0] ? 19 : 8), lineas: ls, ancho: Math.max.apply(null, ls.map(function (l) { return x.measureText(l).width; })) };
      });
      colocarEtiquetas(its, fs, M.W, M.H);
      its.forEach(function (it) {
        if (!it.guia) return;
        x.strokeStyle = "rgba(255,255,255,0.55)"; x.lineWidth = 1.2; x.beginPath(); x.moveTo(it.guia.x1, it.guia.y1); x.lineTo(it.guia.x2, it.guia.y2); x.stroke();
      });
      its.forEach(function (it) {
        var r = it.r;
        x.fillStyle = "rgba(7,17,29,0.86)"; x.strokeStyle = h && it.e === h ? "rgba(91,184,232,0.9)" : "rgba(91,184,232,0.35)"; x.lineWidth = 1; x.beginPath();
        if (x.roundRect) x.roundRect(r.x, r.y, r.w, r.h, fs * 0.4); else x.rect(r.x, r.y, r.w, r.h);
        x.fill(); x.stroke();
        x.fillStyle = "#ffffff";
        it.lineas.forEach(function (l, i) { x.fillText(l, r.x + fs * 0.4, r.y + fs * 0.2 + fs * 1.12 * (i + 0.82)); });
      });
    }
    x.restore();

    // cifras
    var cajas = [
      { v: fmt(s.n), e: s.n === 1 ? "ESTADIO VISITADO" : "ESTADIOS VISITADOS" },
      { v: fmt(s.km), e: "KM EN TOTAL (IDA Y VUELTA)" },
      { v: s.lejano ? fmt(s.kmLejano) + " km" : "—", e: s.lejano ? "MÁS LEJANO: " + corto(nom(s.lejano), 26).toUpperCase() : "MÁS LEJANO" }
    ];
    var cw = (W - P * 2 - 24 * 2) / 3;
    cajas.forEach(function (b, i) {
      var bx = P + i * (cw + 24);
      x.fillStyle = "rgba(255,255,255,0.07)"; x.strokeStyle = "rgba(255,255,255,0.16)"; x.lineWidth = 1.5; x.beginPath();
      if (x.roundRect) x.roundRect(bx, statsY, cw, statsH, 16); else x.rect(bx, statsY, cw, statsH);
      x.fill(); x.stroke();
      x.textAlign = "center"; x.fillStyle = "#ffffff"; x.font = "700 52px " + T; x.fillText(b.v, bx + cw / 2, statsY + 72);
      x.fillStyle = "#5bb8e8"; x.font = "600 13px " + X; x.fillText(b.e, bx + cw / 2, statsY + 108);
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
          await navigator.share({ files: [f], title: "Mi mapa de desplazamientos | ELOTROFÚTBOLTV",
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
      if (window.EOFAvisoLector) EOFAvisoLector.montar(aviso, "mapa"); else aviso.hidden = false;
      app.hidden = true;
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
    document.querySelectorAll(".mapad-filtro").forEach(function (b) {
      b.addEventListener("click", function () {
        estado.filtro = b.dataset.f;
        document.querySelectorAll(".mapad-filtro").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
        filtrarLista();
      });
    });
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
  /* Pestañas "Mi mapa" / "Ranking" (como en Porras). El ranking es público; el mapa requiere sesión. */
  function abrirPestana(t, cambiarHash) {
    var rk = t === "ranking";
    $("mapadPanelMapa").hidden = rk; $("mapadPanelRanking").hidden = !rk;
    document.querySelectorAll(".mapad-tab").forEach(function (b) {
      var on = b.dataset.tab === t; b.classList.toggle("activo", on); b.setAttribute("aria-selected", String(on));
    });
    if (cambiarHash !== false) { try { history.replaceState(null, "", location.pathname + location.search + (rk ? "#ranking" : "")); } catch (e) { /* ok */ } }
    if (rk && window.iniciarRankingDesplazamientos) window.iniciarRankingDesplazamientos();
  }
  window.mapadAbrirPestana = abrirPestana;
  function iniciarTodo() {
    document.querySelectorAll(".mapad-tab").forEach(function (b) { b.addEventListener("click", function () { abrirPestana(b.dataset.tab); }); });
    iniciar();
    if (location.hash === "#ranking") abrirPestana("ranking", false);
    window.addEventListener("hashchange", function () { abrirPestana(location.hash === "#ranking" ? "ranking" : "mapa", false); });
  }
  window.iniciarMapaDesplazamientos = iniciarTodo;
})();
