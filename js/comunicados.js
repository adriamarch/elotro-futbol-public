/* Comunicados oficiales de ELOTROFÚTBOLTV (/comunicados y /comunicados/<slug>)
   Lee /api/comunicados (listado) y /api/comunicados/<slug> (detalle). El texto es PLANO: se pinta siempre
   con nodos de texto (nunca como HTML). Los párrafos se separan por línea en blanco; un bloque cuyas líneas
   empiezan por "- " o "• " se pinta como lista; las URL http(s) se convierten en enlaces. */
(function () {
  "use strict";
  var TIPOS = { comunicado: "Comunicado", aviso: "Aviso", rectificacion: "Rectificación", novedad: "Novedad" };
  var TIPOS_PLURAL = { comunicado: "Comunicados", aviso: "Avisos", rectificacion: "Rectificaciones", novedad: "Novedades" };
  var SVG = function (p, extra) {
    return '<svg class="cm-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (extra || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  };
  var IC = {
    sello: SVG('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    megafono: SVG('<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
    aviso: SVG('<path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.2M12 17h.01"/>'),
    rectificacion: SVG('<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14.5 7.5 3 3M13 20h7"/>'),
    novedad: SVG('<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>'),
    cal: SVG('<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 3v3M16 3v3"/>'),
    reloj: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    pin: '<svg class="cm-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.5 2.5 21.5 9.5l-2.2.7-3.6 3.6.4 4-1.6 1.6-4.2-4.2-5.3 5.3-1.1-1.1 5.3-5.3L5 10l1.6-1.6 4 .4 3.6-3.6z"/></svg>',
    flecha: SVG('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.4),
    atras: SVG('<path d="M19 12H5M11 6l-6 6 6 6"/>', 2.4),
    enlace: SVG('<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
    x: '<svg class="cm-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 3h3.1l-6.8 7.7L21.8 21h-6.3l-4.9-6.4L5 21H1.9l7.3-8.3L1.5 3h6.4l4.4 5.9zm-1.1 16.2h1.7L7 4.7H5.2z"/></svg>',
    whatsapp: SVG('<path d="M3 21l1.6-4.8A8.5 8.5 0 1 1 8 19.5z"/><path d="M9 9.5c.3 2.5 2.7 4.8 5.5 5.5l1.2-1.3-2-1-.9.7c-.8-.3-1.7-1.2-2-2l.7-.9-1-2z"/>'),
    compartir: SVG('<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.3 10.7 7.4-4.4M8.3 13.3l7.4 4.4"/>'),
    imprimir: SVG('<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="7" rx="1"/>'),
    lupa: SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    firma: SVG('<path d="M12 3l2.4 2 3.1-.2.9 3 2.6 1.7-1 3 1 3-2.6 1.7-.9 3-3.1-.2L12 21l-2.4-2-3.1.2-.9-3L3 14.5l1-3-1-3L5.6 6.8l.9-3 3.1.2z"/><path d="m8.7 12.2 2.2 2.2 4.4-4.6"/>')
  };
  var root = document.getElementById("cmRoot");
  if (!root) return;
  var reducir = false;
  try { reducir = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { /* sin matchMedia */ }

  function h(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function tipoOk(c) { return TIPOS[c.tipo] ? c.tipo : "comunicado"; }
  function icoTipo(c) { var t = tipoOk(c); return t === "comunicado" ? IC.megafono : IC[t]; }
  function fechaObj(f) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f || ""));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
  }
  function fecha(f) {
    var d = fechaObj(f);
    return d ? d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "";
  }
  function baldosaFecha(f) {
    var d = fechaObj(f);
    var b = h("span", "cm-baldosa");
    if (!d) return b;
    b.appendChild(h("span", "cm-baldosa-dia", String(d.getDate())));
    b.appendChild(h("span", "cm-baldosa-mes", d.toLocaleDateString("es-ES", { month: "short" }).replace(".", "")));
    b.appendChild(h("span", "cm-baldosa-anio", String(d.getFullYear())));
    return b;
  }
  function slugDeLaUrl() {
    var m = location.pathname.match(/^\/comunicados\/([^/]+)\/?$/);
    var s = m ? m[1] : (new URLSearchParams(location.search).get("c") || "");
    try { s = decodeURIComponent(s); } catch (_) { /* se deja tal cual */ }
    return s.trim();
  }
  function estado(titulo, texto, tipo) {
    root.innerHTML = estadoHTML({
      titulo: titulo, texto: texto, tipo: tipo || "error",
      cta: '<a href="/comunicados" class="btn-volver">Ver todos los comunicados</a>'
    });
  }
  function claseTipo(c) { return "cm-t-" + tipoOk(c); }
  function conIcono(cls, svg, txt) {
    var n = h("span", cls);
    n.innerHTML = svg;
    n.appendChild(document.createTextNode(txt));
    return n;
  }
  function chipTipo(c) { return conIcono("cm-tipo", icoTipo(c), TIPOS[tipoOk(c)]); }
  function filaMeta(c, conFecha) {
    var m = h("div", "cm-meta");
    m.appendChild(chipTipo(c));
    if (c.fijado) m.appendChild(conIcono("cm-pin", IC.pin, "Fijado"));
    if (conFecha) m.appendChild(conIcono("cm-fecha", IC.cal, fecha(c.fecha)));
    return m;
  }
  function minutosLectura(txt) {
    var palabras = String(txt || "").trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(palabras / 200));
  }
  async function pedir(ruta) {
    var res = await apiFetch(ruta);
    if (res.status === 404) return { noExiste: true };
    if (!res.ok) throw new Error("Error " + res.status);
    return res.json();
  }
  function quitar(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

  /* ---------- sin comunicados ---------- */
  function vacioBonito() {
    var v = h("section", "cm-vacio-bonito");
    var ilu = h("div", "cm-vacio-ilu");
    ilu.setAttribute("aria-hidden", "true");
    ilu.innerHTML = '<span class="cm-anillo cm-anillo-1"></span><span class="cm-anillo cm-anillo-2"></span><span class="cm-anillo cm-anillo-3"></span>' +
      '<span class="cm-vacio-sello">' + IC.megafono + '</span>' +
      '<span class="cm-chispa cm-chispa-a"></span><span class="cm-chispa cm-chispa-b"></span><span class="cm-chispa cm-chispa-c"></span>';
    v.appendChild(ilu);
    v.appendChild(h("h2", "cm-vacio-tit", "Todo tranquilo por aquí"));
    v.appendChild(h("p", "cm-vacio-txt", "Ahora mismo no hay ningún comunicado oficial. Cuando ELOTROFÚTBOLTV tenga algo importante que contar, lo publicaremos en esta página."));
    var tipos = h("ul", "cm-vacio-tipos");
    [["comunicado", "Comunicados", "Posturas y decisiones del medio"], ["aviso", "Avisos", "Cambios y cosas a tener en cuenta"], ["rectificacion", "Rectificaciones", "Correcciones a lo publicado"], ["novedad", "Novedades", "Lo nuevo de la web"]].forEach(function (t) {
      var li = h("li", "cm-vacio-tipo cm-t-" + t[0]);
      var ic = h("span", "cm-vacio-tipo-ico"); ic.innerHTML = t[0] === "comunicado" ? IC.megafono : IC[t[0]]; li.appendChild(ic);
      var tx = h("span", "cm-vacio-tipo-txt"); tx.appendChild(h("strong", "", t[1])); tx.appendChild(h("small", "", t[2])); li.appendChild(tx);
      tipos.appendChild(li);
    });
    v.appendChild(tipos);
    var acc = h("div", "cm-vacio-acc");
    var a1 = h("a", "cm-vacio-btn cm-vacio-btn-p", "Ir a la portada"); a1.href = "/";
    a1.insertAdjacentHTML("beforeend", IC.flecha);
    var a2 = h("a", "cm-vacio-btn", "Escríbenos"); a2.href = "/contacto";
    acc.appendChild(a1); acc.appendChild(a2);
    v.appendChild(acc);
    return v;
  }

  /* ---------- listado ---------- */
  function tarjeta(c, i) {
    var a = h("a", "cm-tarjeta " + claseTipo(c) + (c.fijado ? " cm-fijado" : ""));
    a.href = "/comunicados/" + encodeURIComponent(c.slug);
    a.style.setProperty("--i", String(Math.min(i, 12)));
    a.appendChild(baldosaFecha(c.fecha));
    var cuerpo = h("div", "cm-tarjeta-cuerpo");
    cuerpo.appendChild(filaMeta(c, false));
    cuerpo.appendChild(h("h2", "cm-tarjeta-tit", c.titulo));
    if (c.resumen) cuerpo.appendChild(h("p", "cm-tarjeta-res", c.resumen));
    var leer = h("span", "cm-leer", "Leer comunicado");
    leer.insertAdjacentHTML("beforeend", IC.flecha);
    cuerpo.appendChild(leer);
    a.appendChild(cuerpo);
    return a;
  }
  function destacado(c) {
    var a = h("a", "cm-destacado " + claseTipo(c));
    a.href = "/comunicados/" + encodeURIComponent(c.slug);
    var fondo = h("span", "cm-destacado-fondo"); fondo.innerHTML = icoTipo(c); a.appendChild(fondo);
    var meta = h("div", "cm-meta");
    meta.appendChild(conIcono("cm-tipo cm-tipo-claro", icoTipo(c), TIPOS[tipoOk(c)]));
    meta.appendChild(conIcono("cm-pin cm-pin-claro", IC.pin, "Fijado"));
    meta.appendChild(conIcono("cm-fecha cm-fecha-claro", IC.cal, fecha(c.fecha)));
    a.appendChild(meta);
    a.appendChild(h("h2", "cm-destacado-tit", c.titulo));
    if (c.resumen) a.appendChild(h("p", "cm-destacado-res", c.resumen));
    var leer = h("span", "cm-destacado-btn", "Leer comunicado");
    leer.insertAdjacentHTML("beforeend", IC.flecha);
    a.appendChild(leer);
    return a;
  }
  async function listado() {
    fijarSeoBasico({
      titulo: "Comunicados oficiales — ELOTROFÚTBOLTV",
      descripcion: "Comunicados, avisos, rectificaciones y novedades oficiales de ELOTROFÚTBOLTV.",
      urlPath: "/comunicados",
      migas: [{ nombre: "Comunicados" }]
    });
    var datos;
    try { datos = await conReintento(function () { return pedir("/api/comunicados"); }); }
    catch (_) { return estado("No se han podido cargar los comunicados", "Hay un problema de conexión. Inténtalo de nuevo en unos minutos."); }
    var items = (datos && datos.items) || [];
    root.textContent = "";

    var hero = h("header", "cm-hero");
    var deco = h("span", "cm-hero-deco"); deco.innerHTML = IC.megafono; hero.appendChild(deco);
    hero.appendChild(conIcono("cm-eyebrow", IC.sello, "Sala de prensa"));
    hero.appendChild(h("h1", "", "Comunicados oficiales"));
    hero.appendChild(h("p", "", "Lo que ELOTROFÚTBOLTV comunica como medio: avisos, rectificaciones y novedades, siempre firmados por la Responsabilidad."));
    if (items.length) {
      var stats = h("div", "cm-stats");
      stats.appendChild(h("span", "cm-stat cm-stat-total", items.length + (items.length === 1 ? " publicado" : " publicados")));
      var ult = items.slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); })[0];
      if (ult && fecha(ult.fecha)) stats.appendChild(conIcono("cm-stat", IC.reloj, "Último: " + fecha(ult.fecha)));
      hero.appendChild(stats);
    }
    root.appendChild(hero);

    if (!items.length) {
      root.appendChild(vacioBonito());
      return;
    }
    items.sort(function (a, b) { return (b.fijado ? 1 : 0) - (a.fijado ? 1 : 0); });

    var cuentas = {};
    items.forEach(function (c) { var t = tipoOk(c); cuentas[t] = (cuentas[t] || 0) + 1; });
    var tiposPresentes = Object.keys(TIPOS).filter(function (t) { return cuentas[t]; });
    var filtro = "todos", consulta = "";

    var barra = h("div", "cm-barra");
    var chips = h("div", "cm-chips");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "Filtrar por tipo");
    function chip(clave, texto, n) {
      var b = h("button", "cm-chip" + (clave === "todos" ? " activo" : "") + (clave !== "todos" ? " cm-t-" + clave : ""));
      b.type = "button";
      b.dataset.t = clave;
      b.setAttribute("aria-pressed", clave === "todos" ? "true" : "false");
      b.appendChild(document.createTextNode(texto));
      b.appendChild(h("span", "cm-chip-n", String(n)));
      b.onclick = function () {
        filtro = clave;
        Array.prototype.forEach.call(chips.children, function (x) {
          var on = x.dataset.t === clave;
          x.classList.toggle("activo", on);
          x.setAttribute("aria-pressed", on ? "true" : "false");
        });
        pintar();
      };
      return b;
    }
    if (tiposPresentes.length > 1) {
      chips.appendChild(chip("todos", "Todos", items.length));
      tiposPresentes.forEach(function (t) { chips.appendChild(chip(t, TIPOS_PLURAL[t], cuentas[t])); });
      barra.appendChild(chips);
    }
    if (items.length > 5) {
      var caja = h("label", "cm-buscar");
      caja.innerHTML = IC.lupa;
      var inp = h("input");
      inp.type = "search";
      inp.placeholder = "Buscar un comunicado…";
      inp.setAttribute("aria-label", "Buscar un comunicado");
      inp.oninput = function () { consulta = quitar(inp.value.trim()); pintar(); };
      caja.appendChild(inp);
      barra.appendChild(caja);
    }
    if (barra.children.length) root.appendChild(barra);

    var zona = h("div", "cm-zona");
    zona.setAttribute("aria-live", "polite");
    root.appendChild(zona);

    function pintar() {
      var lista = items.filter(function (c) {
        if (filtro !== "todos" && tipoOk(c) !== filtro) return false;
        if (consulta && quitar(c.titulo + " " + (c.resumen || "")).indexOf(consulta) < 0) return false;
        return true;
      });
      zona.textContent = "";
      if (!lista.length) {
        var vacio = h("div", "cm-sin-resultados");
        vacio.innerHTML = IC.lupa;
        vacio.appendChild(h("strong", "", "No hay comunicados con ese filtro"));
        vacio.appendChild(h("span", "", "Prueba con otro tipo o con otra búsqueda."));
        zona.appendChild(vacio);
        return;
      }
      var inicio = 0;
      if (filtro === "todos" && !consulta && lista[0].fijado) { zona.appendChild(destacado(lista[0])); inicio = 1; }
      if (lista.length > inicio) {
        if (inicio) zona.appendChild(h("h2", "cm-subtitulo", "Más comunicados"));
        var grid = h("div", "cm-lista");
        lista.slice(inicio).forEach(function (c, i) { grid.appendChild(tarjeta(c, i)); });
        zona.appendChild(grid);
      }
    }
    pintar();
  }

  /* ---------- texto plano -> nodos (lista, párrafos, enlaces) ---------- */
  function conEnlaces(el, texto) {
    var re = /https?:\/\/[^\s<>"]+/g, ultimo = 0, m;
    while ((m = re.exec(texto))) {
      var url = m[0], cola = "";
      var f = /[.,;:!?)\]]+$/.exec(url);
      if (f) { cola = f[0]; url = url.slice(0, -cola.length); }
      var ok = false;
      try { var u = new URL(url); ok = u.protocol === "https:" || u.protocol === "http:"; } catch (_) { ok = false; }
      if (!ok) continue;
      if (m.index > ultimo) el.appendChild(document.createTextNode(texto.slice(ultimo, m.index)));
      var a = h("a", "cm-enlace", url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""));
      a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer nofollow";
      el.appendChild(a);
      if (cola) el.appendChild(document.createTextNode(cola));
      ultimo = m.index + m[0].length;
    }
    if (ultimo < texto.length) el.appendChild(document.createTextNode(texto.slice(ultimo)));
  }
  function pintarCuerpo(contenido) {
    var cuerpo = h("div", "cm-cuerpo");
    String(contenido || "").split(/\n{2,}/).forEach(function (bloque) {
      bloque = bloque.trim();
      if (!bloque) return;
      var lineas = bloque.split("\n");
      var esLista = lineas.every(function (l) { return /^\s*[-•*]\s+\S/.test(l); });
      if (esLista) {
        var ul = h("ul", "cm-lista-txt");
        lineas.forEach(function (l) { var li = h("li"); conEnlaces(li, l.replace(/^\s*[-•*]\s+/, "")); ul.appendChild(li); });
        cuerpo.appendChild(ul);
        return;
      }
      var p = h("p");
      lineas.forEach(function (l, i) {
        if (i) p.appendChild(document.createElement("br"));
        conEnlaces(p, l);
      });
      cuerpo.appendChild(p);
    });
    return cuerpo;
  }

  /* ---------- barra de progreso de lectura ---------- */
  function progresoLectura(art) {
    var barra = h("div", "cm-progreso");
    barra.setAttribute("aria-hidden", "true");
    var rel = h("span"); barra.appendChild(rel);
    document.body.appendChild(barra);
    var pendiente = false;
    function medir() {
      pendiente = false;
      var r = art.getBoundingClientRect();
      var total = r.height - window.innerHeight * 0.6;
      var p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
      rel.style.transform = "scaleX(" + p.toFixed(3) + ")";
    }
    function pedirMedida() { if (!pendiente) { pendiente = true; requestAnimationFrame(medir); } }
    window.addEventListener("scroll", pedirMedida, { passive: true });
    window.addEventListener("resize", pedirMedida);
    medir();
  }

  /* ---------- detalle ---------- */
  async function detalle(slug) {
    var datos;
    try { datos = await conReintento(function () { return pedir("/api/comunicados/" + encodeURIComponent(slug)); }); }
    catch (_) { return estado("No se ha podido cargar el comunicado", "Hay un problema de conexión. Inténtalo de nuevo en unos minutos."); }
    if (datos.noExiste || !datos.item) {
      fijarSeoBasico({ titulo: "Comunicado no encontrado — ELOTROFÚTBOLTV", urlPath: "/comunicados", noindex: true });
      return estado("Comunicado no encontrado", "Puede que el enlace sea antiguo o que el comunicado se haya retirado.");
    }
    var c = datos.item;
    fijarSeoBasico({
      titulo: c.titulo + " — Comunicados de ELOTROFÚTBOLTV",
      descripcion: c.resumen || (c.contenido || "").replace(/\s+/g, " ").slice(0, 155),
      urlPath: "/comunicados/" + encodeURIComponent(c.slug),
      tipo: "article",
      migas: [{ nombre: "Comunicados", url: "/comunicados" }, { nombre: c.titulo }]
    });
    root.textContent = "";
    var det = h("div", "cm-det");
    var volver = h("a", "cm-volver");
    volver.href = "/comunicados";
    volver.innerHTML = IC.atras;
    volver.appendChild(document.createTextNode("Todos los comunicados"));
    det.appendChild(volver);

    var art = h("article", "cm-art " + claseTipo(c));
    var cab = h("header", "cm-cab");
    var deco = h("span", "cm-cab-deco"); deco.innerHTML = icoTipo(c); cab.appendChild(deco);
    var meta = h("div", "cm-meta");
    meta.appendChild(conIcono("cm-tipo cm-tipo-claro", icoTipo(c), TIPOS[tipoOk(c)]));
    if (c.fijado) meta.appendChild(conIcono("cm-pin cm-pin-claro", IC.pin, "Fijado"));
    cab.appendChild(meta);
    cab.appendChild(h("h1", "cm-art-tit", c.titulo));
    var datosFila = h("div", "cm-cab-datos");
    datosFila.appendChild(conIcono("cm-dato", IC.cal, fecha(c.fecha)));
    datosFila.appendChild(conIcono("cm-dato", IC.reloj, minutosLectura(c.contenido) + " min de lectura"));
    cab.appendChild(datosFila);
    art.appendChild(cab);

    var cajaTxt = h("div", "cm-art-cuerpo");
    if (c.resumen) cajaTxt.appendChild(h("p", "cm-art-res", c.resumen));
    cajaTxt.appendChild(pintarCuerpo(c.contenido));

    var pie = h("footer", "cm-pie");
    var sello = h("div", "cm-sello");
    var ico = h("span", "cm-sello-ico"); ico.innerHTML = IC.firma; sello.appendChild(ico);
    var quien = h("div", "cm-sello-txt");
    quien.appendChild(h("span", "cm-sello-etq", "Documento oficial · firmado por"));
    quien.appendChild(h("strong", "cm-firma", c.firma || "Responsable"));
    quien.appendChild(h("span", "cm-medio", "ELOTROFÚTBOLTV"));
    sello.appendChild(quien);
    pie.appendChild(sello);
    var fechas = h("div", "cm-fechas");
    fechas.appendChild(h("span", "", "Publicado el " + fecha(c.fecha)));
    if (c.actualizado && fecha(String(c.actualizado).slice(0, 10)) !== fecha(c.fecha)) fechas.appendChild(h("span", "cm-actualizado", "Actualizado el " + fecha(String(c.actualizado).slice(0, 10))));
    pie.appendChild(fechas);
    cajaTxt.appendChild(pie);
    art.appendChild(cajaTxt);
    det.appendChild(art);
    det.appendChild(compartir(c));
    root.appendChild(det);
    progresoLectura(art);
    otros(c, det);
  }

  /* ---------- compartir ---------- */
  function boton(cls, svg, txt) {
    var b = h(cls.indexOf("<") === 0 ? "span" : "button", "cm-btn");
    b.innerHTML = svg;
    var tx = document.createTextNode(txt);
    b.appendChild(tx);
    b._tx = tx;
    return b;
  }
  function compartir(c) {
    var url = location.origin + "/comunicados/" + encodeURIComponent(c.slug);
    var caja = h("div", "cm-compartir");
    caja.appendChild(h("span", "cm-compartir-tit", "Compartir"));
    var copiar = boton("button", IC.enlace, "Copiar enlace");
    copiar.type = "button";
    copiar.onclick = function () {
      var listo = function () { copiar._tx.nodeValue = "Enlace copiado ✓"; copiar.classList.add("ok"); setTimeout(function () { copiar._tx.nodeValue = "Copiar enlace"; copiar.classList.remove("ok"); }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(listo, function () { prompt("Copia el enlace:", url); });
      else prompt("Copia el enlace:", url);
    };
    caja.appendChild(copiar);
    if (navigator.share) {
      var nat = boton("button", IC.compartir, "Compartir…");
      nat.type = "button";
      nat.onclick = function () { navigator.share({ title: c.titulo, url: url }).catch(function () { /* cancelado */ }); };
      caja.appendChild(nat);
    }
    var x = h("a", "cm-btn"); x.innerHTML = IC.x; x.appendChild(document.createTextNode("X"));
    x.href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(c.titulo) + "&url=" + encodeURIComponent(url);
    x.target = "_blank"; x.rel = "noopener noreferrer";
    var wa = h("a", "cm-btn"); wa.innerHTML = IC.whatsapp; wa.appendChild(document.createTextNode("WhatsApp"));
    wa.href = "https://wa.me/?text=" + encodeURIComponent(c.titulo + " " + url);
    wa.target = "_blank"; wa.rel = "noopener noreferrer";
    var imp = boton("button", IC.imprimir, "Imprimir");
    imp.type = "button";
    imp.onclick = function () { window.print(); };
    caja.appendChild(x); caja.appendChild(wa); caja.appendChild(imp);
    return caja;
  }

  /* ---------- otros comunicados (al final de la lectura) ---------- */
  async function otros(actual, det) {
    var datos;
    try { datos = await pedir("/api/comunicados"); } catch (_) { return; }
    var lista = ((datos && datos.items) || []).filter(function (x) { return x.slug !== actual.slug; }).slice(0, 3);
    if (!lista.length) return;
    var sec = h("section", "cm-otros");
    sec.appendChild(h("h2", "cm-subtitulo", "Sigue leyendo"));
    var grid = h("div", "cm-otros-grid");
    lista.forEach(function (c, i) {
      var a = h("a", "cm-mini " + claseTipo(c));
      a.href = "/comunicados/" + encodeURIComponent(c.slug);
      a.style.setProperty("--i", String(i));
      a.appendChild(conIcono("cm-mini-tipo", icoTipo(c), TIPOS[tipoOk(c)]));
      a.appendChild(h("strong", "cm-mini-tit", c.titulo));
      a.appendChild(h("span", "cm-mini-fecha", fecha(c.fecha)));
      grid.appendChild(a);
    });
    sec.appendChild(grid);
    var todos = h("a", "cm-todos");
    todos.href = "/comunicados";
    todos.appendChild(document.createTextNode("Ver todos los comunicados"));
    todos.insertAdjacentHTML("beforeend", IC.flecha);
    sec.appendChild(todos);
    det.appendChild(sec);
  }

  var slug = slugDeLaUrl();
  (slug ? detalle(slug) : listado());
})();
