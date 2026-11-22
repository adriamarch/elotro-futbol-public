/* Podcast de ELOTROFÚTBOLTV (/podcast y /podcast?ep=ID)
   Portada: hero con cifras, destacado, secciones por tipo (episodios, entrevistas, clips), buscador,
   filtros con contador y orden. Episodio: reproductor, acciones de compartir, invitado, anterior/siguiente
   y más contenido. Anuncios: usa el sistema de js/ads.js (adSlot + initAds), que respeta consentimiento,
   máximo por página y separación mínima; si un hueco no está configurado simplemente no se pinta. */
(function () {
  "use strict";
  var TIPOS = { episodio: "Episodio", entrevista: "Entrevista", clip: "Clip" };
  var PLURAL = { episodio: "Episodios", entrevista: "Entrevistas", clip: "Clips" };
  var FILTROS = { todo: "Todo", episodio: "Episodios", entrevista: "Entrevistas", clip: "Clips" };
  var PLAT = { spotify: "Spotify", apple: "Apple Podcasts", ivoox: "iVoox", youtube: "YouTube" };
  var IC = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>'
  };
  var root = document.getElementById("pcRoot");
  var S = { programa: {}, items: [], filtro: "todo", q: "", orden: "nuevo", actual: null };

  /* ---------- utilidades ---------- */
  function h(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function icono(cls, svg) { var s = h("span", cls); s.setAttribute("aria-hidden", "true"); s.innerHTML = svg; return s; }
  function fecha(f) {
    var d = new Date(f + "T12:00:00");
    return isNaN(d) ? "" : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }
  function meta(e) {
    var m = [];
    if (e.tipo === "episodio" && e.numero) m.push("T" + (e.temporada || 1) + " · Ep. " + e.numero);
    if (e.invitado) m.push(e.invitado);
    if (e.fecha) m.push(fecha(e.fecha));
    return m.join(" · ");
  }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function porFecha(arr, dir) {
    return arr.slice().sort(function (a, b) {
      var c = (b.fecha || "").localeCompare(a.fecha || "");
      return dir === "viejo" ? -c : c;
    });
  }
  function abrirEnlace(a, fn) {
    a.onclick = function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return;
      ev.preventDefault(); fn();
    };
  }
  function ads() { try { if (typeof initAds === "function") initAds(); } catch (e) { /* sin anuncios */ } }
  function anuncio(slot) {
    if (typeof adSlot !== "function") return null;
    var html = ""; try { html = adSlot(slot); } catch (e) { /* ignorar */ }
    if (!html) return null;
    var d = h("div", "pc-ad"); d.innerHTML = html; return d;
  }
  function poner(padre, slot) { var a = anuncio(slot); if (a) padre.appendChild(a); }

  /* ---------- miniaturas ---------- */
  function cubierta(e, i) {
    return window.EOFPortadaPodcast ? window.EOFPortadaPodcast(e, i) : h("b", null, (TIPOS[e.tipo] || "").toUpperCase());
  }
  function miniatura(e, i) {
    var th = h("div", "pc-th");
    if (/^https:\/\//.test(e.portada || "")) {
      var img = h("img");
      img.src = e.portada; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
      img.onerror = function () { img.replaceWith(cubierta(e, i)); };
      th.appendChild(img);
    } else th.appendChild(cubierta(e, i));
    th.appendChild(h("span", "pc-tag", TIPOS[e.tipo] || e.tipo));
    th.appendChild(icono("pc-play", IC.play));
    if (e.duracion) th.appendChild(h("span", "pc-dur", e.duracion));
    return th;
  }
  function carta(e, i) {
    var a = h("a", "pc-card");
    a.href = "?ep=" + encodeURIComponent(e.id);
    a.setAttribute("aria-label", "Ver: " + e.titulo);
    a.appendChild(miniatura(e, i));
    var info = h("div", "pc-info");
    info.appendChild(h("h3", null, e.titulo));
    info.appendChild(h("p", "pc-meta", (TIPOS[e.tipo] || e.tipo) + (meta(e) ? " · " + meta(e) : "")));
    if (e.destacado) info.appendChild(h("span", "pc-badge", "Destacado"));
    a.appendChild(info);
    abrirEnlace(a, function () { abrir(e.id, true, true); });
    return a;
  }
  function mini(e, i) {
    var a = h("a", "pc-mini");
    a.href = "?ep=" + encodeURIComponent(e.id);
    a.appendChild(miniatura(e, i));
    var info = h("div", "pc-info");
    info.appendChild(h("h3", null, e.titulo));
    info.appendChild(h("p", "pc-meta", meta(e)));
    a.appendChild(info);
    abrirEnlace(a, function () { abrir(e.id, true, true); });
    return a;
  }

  /* ---------- reproductor ---------- */
  function reproductor(e, auto) {
    if (!e || !e.plataforma) return null;
    var id = String(e.id || ""), box = h("div", "pc-player v-" + e.plataforma);
    if (e.plataforma === "audio") {
      if (!/^https:\/\//.test(e.url || "")) return null;
      var au = h("audio"); au.controls = true; au.preload = "none"; au.src = e.url; au.autoplay = !!auto;
      box.appendChild(au); return box;
    }
    var src = {
      youtube: /^[\w-]{6,20}$/.test(id) && "https://www.youtube-nocookie.com/embed/" + id + "?rel=0" + (auto ? "&autoplay=1" : ""),
      spotify: /^(episode|show)\/\w+$/.test(id) && "https://open.spotify.com/embed/" + id,
      ivoox: /^\d+$/.test(id) && "https://www.ivoox.com/player_ej_" + id + "_4_1.html"
    }[e.plataforma];
    if (!src) return null;
    var f = h("iframe"); f.src = src; f.title = "Reproductor";
    f.setAttribute("allowfullscreen", ""); f.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
    f.referrerPolicy = "strict-origin-when-cross-origin";
    box.appendChild(f); return box;
  }

  /* ---------- compartir ---------- */
  function urlEp(e) { return location.origin + location.pathname + "?ep=" + encodeURIComponent(e.id); }
  function aviso(t) { if (window.mostrarAlerta) mostrarAlerta(t); else alert(t); }
  function copiar(e) {
    var u = urlEp(e);
    (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { aviso("Enlace copiado"); }, function () { prompt("Copia el enlace:", u); });
  }
  function compartir(e) {
    if (navigator.share) { navigator.share({ title: e.titulo, url: urlEp(e) }).catch(function () {}); return; }
    copiar(e);
  }

  /* ---------- navegación ---------- */
  function abrir(id, push, auto) {
    var e = S.items.filter(function (x) { return x.id === id; })[0];
    if (!e) { volver(push); return; }
    S.actual = e;
    if (push) history.pushState({ ep: id }, "", "?ep=" + encodeURIComponent(id));
    document.title = e.titulo + " — Podcast | ELOTROFÚTBOLTV";
    episodio(e, auto);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function volver(push) {
    S.actual = null;
    if (push) history.pushState({}, "", location.pathname);
    document.title = "Podcast | ELOTROFÚTBOLTV";
    inicio();
  }

  /* ---------- vista de episodio ---------- */
  function boton(cls, svg, txt, fn) {
    var b = h("button", cls); b.type = "button";
    if (svg) b.appendChild(icono("pc-ico", svg));
    b.appendChild(document.createTextNode(txt)); b.onclick = fn; return b;
  }
  function enlaceExt(txt, href) { var a = h("a", "pc-act", txt); a.href = href; a.target = "_blank"; a.rel = "noopener"; return a; }

  function episodio(e, auto) {
    root.textContent = "";
    var todos = porFecha(S.items, "nuevo"), pos = todos.indexOf(e);
    var sig = todos[pos - 1], ant = todos[pos + 1];
    var resto = todos.filter(function (x) { return x !== e; });
    resto.sort(function (a, b) { return (b.tipo === e.tipo) - (a.tipo === e.tipo); });

    var wrap = h("div", "pc-watch"), main = h("div", "pc-main");
    var back = h("a", "pc-back", "← Todo el podcast"); back.href = location.pathname;
    abrirEnlace(back, function () { volver(true); });
    main.appendChild(back);

    var pl = reproductor(e.embed, auto);
    if (!pl) {
      pl = h("div", "pc-player"); pl.appendChild(cubierta(e, 0));
      var soon = h("div", "pc-soon"); soon.appendChild(h("p", null, "Próximamente disponible")); pl.appendChild(soon);
    }
    main.appendChild(pl);
    main.appendChild(h("h1", "pc-title", e.titulo));

    var fila = h("div", "pc-row");
    fila.appendChild(h("span", "pc-kick", TIPOS[e.tipo] || e.tipo));
    fila.appendChild(h("span", "pc-meta", meta(e) + (e.duracion ? " · " + e.duracion : "")));
    main.appendChild(fila);

    var acc = h("div", "pc-actions");
    acc.appendChild(boton("pc-act pc-act-main", IC.share, "Compartir", function () { compartir(e); }));
    acc.appendChild(boton("pc-act", IC.link, "Copiar enlace", function () { copiar(e); }));
    var u = encodeURIComponent(urlEp(e)), t = encodeURIComponent(e.titulo);
    acc.appendChild(enlaceExt("WhatsApp", "https://wa.me/?text=" + t + "%20" + u));
    acc.appendChild(enlaceExt("X", "https://twitter.com/intent/tweet?text=" + t + "&url=" + u));
    main.appendChild(acc);

    if (e.invitado) {
      var inv = h("div", "pc-guest"), av = h("span", "pc-guest-av", e.invitado.trim().charAt(0).toUpperCase());
      var tx = h("div"); tx.appendChild(h("small", null, "Invitado")); tx.appendChild(h("strong", null, e.invitado));
      inv.appendChild(av); inv.appendChild(tx); main.appendChild(inv);
    }
    if (e.descripcion) {
      var d = h("div", "pc-desc", e.descripcion), largo = e.descripcion.length > 340;
      if (largo) d.classList.add("pc-clamp");
      main.appendChild(d);
      if (largo) {
        var mas = h("button", "pc-leer", "Leer más"); mas.type = "button";
        mas.onclick = function () { var c = d.classList.toggle("pc-clamp"); mas.textContent = c ? "Leer más" : "Leer menos"; };
        main.appendChild(mas);
      }
    }
    if (ant || sig) {
      var nav = h("nav", "pc-nav"); nav.setAttribute("aria-label", "Episodios anterior y siguiente");
      [[ant, "← Anterior"], [sig, "Siguiente →"]].forEach(function (p, i) {
        if (!p[0]) { nav.appendChild(h("span")); return; }
        var a = h("a", "pc-nav-" + (i ? "sig" : "ant"));
        a.href = "?ep=" + encodeURIComponent(p[0].id);
        a.appendChild(h("small", null, p[1])); a.appendChild(h("strong", null, p[0].titulo));
        abrirEnlace(a, function () { abrir(p[0].id, true, true); });
        nav.appendChild(a);
      });
      main.appendChild(nav);
    }
    wrap.appendChild(main);

    var side = h("aside", "pc-side");
    poner(side, "lateral");
    side.appendChild(h("h2", null, "Siguientes"));
    resto.slice(0, 6).forEach(function (x, i) { side.appendChild(mini(x, i)); });
    wrap.appendChild(side);
    root.appendChild(wrap);

    var mas2 = resto.slice(6, 12);
    if (mas2.length) {
      var sec = h("section", "pc-mas");
      poner(sec, "noticia_similares");
      sec.appendChild(cabecera("Más del podcast"));
      var gr = h("div", "pc-grid");
      mas2.forEach(function (x, i) { gr.appendChild(carta(x, i)); });
      sec.appendChild(gr); root.appendChild(sec);
    }
    ads();
  }

  /* ---------- portada del podcast ---------- */
  function cabecera(titulo, n, onMas) {
    var c = h("div", "pc-sec");
    c.appendChild(h("h2", null, titulo));
    if (n != null) c.appendChild(h("small", null, n + (n === 1 ? " publicación" : " publicaciones")));
    if (onMas) { var b = h("button", "pc-more", "Ver todo →"); b.type = "button"; b.onclick = onMas; c.appendChild(b); }
    return c;
  }
  function plataformas(P, cls) {
    var caja = h("div", cls || "pc-plat");
    Object.keys(PLAT).forEach(function (k) {
      var u = (P.plataformas || {})[k];
      if (/^https:\/\//.test(u || "")) { var a = h("a", null, PLAT[k]); a.href = u; a.target = "_blank"; a.rel = "noopener"; caja.appendChild(a); }
    });
    return caja.children.length ? caja : null;
  }
  function hero(P) {
    var hd = h("header", "pc-hero");
    hd.appendChild(icono("pc-hero-ico", IC.mic));
    var eq = h("div", "pc-eq"); eq.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 5; i++) eq.appendChild(h("i"));
    hd.appendChild(eq);
    hd.appendChild(h("span", "pc-hero-kick", "Podcast"));
    hd.appendChild(h("h1", null, P.titulo || "Podcast"));
    if (P.descripcion) hd.appendChild(h("p", null, P.descripcion));
    if (S.items.length) {
      var st = h("div", "pc-stats");
      Object.keys(TIPOS).forEach(function (t) {
        var n = S.items.filter(function (x) { return x.tipo === t; }).length;
        if (!n) return;
        var s = h("div", "pc-stat"); s.appendChild(h("b", null, String(n))); s.appendChild(h("span", null, n === 1 ? TIPOS[t] : PLURAL[t]));
        st.appendChild(s);
      });
      hd.appendChild(st);
      var act = h("div", "pc-hero-act"), ult = porFecha(S.items, "nuevo")[0];
      var b = h("button", "pc-btn-play"); b.type = "button";
      b.appendChild(icono("pc-ico", IC.play)); b.appendChild(document.createTextNode("Escuchar lo último"));
      b.onclick = function () { abrir(ult.id, true, true); };
      act.appendChild(b);
      var pl = plataformas(P); if (pl) act.appendChild(pl);
      hd.appendChild(act);
    } else { var pl2 = plataformas(P); if (pl2) hd.appendChild(pl2); }
    return hd;
  }
  function vacio(P) {
    var v = h("div", "pc-vacio");
    v.appendChild(icono("pc-vacio-ico", IC.mic));
    v.appendChild(h("h2", null, "Muy pronto, el primer episodio"));
    v.appendChild(h("p", null, "Estamos preparando conversaciones, entrevistas y clips del fútbol no profesional. Vuelve en unos días."));
    var pl = plataformas(P, "pc-plat pc-plat-claro"); if (pl) v.appendChild(pl);
    return v;
  }

  function inicio() {
    root.textContent = "";
    var P = S.programa || {};
    root.appendChild(hero(P));
    if (!S.items.length) { root.appendChild(vacio(P)); return; }

    var barra = h("div", "pc-bar"), q = h("input", "pc-q");
    q.type = "search"; q.placeholder = "Buscar episodios, invitados…"; q.value = S.q; q.setAttribute("aria-label", "Buscar en el podcast");
    barra.appendChild(q);
    var chips = h("div", "pc-chips"), refs = {};
    chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Filtrar por tipo");
    Object.keys(FILTROS).forEach(function (k) {
      var n = k === "todo" ? S.items.length : S.items.filter(function (x) { return x.tipo === k; }).length;
      if (k !== "todo" && !n) return;
      var c = h("button", "pc-chip"); c.type = "button";
      c.appendChild(document.createTextNode(FILTROS[k])); c.appendChild(h("em", null, String(n)));
      c.setAttribute("aria-pressed", String(k === S.filtro));
      c.onclick = function () { fijarFiltro(k); };
      refs[k] = c; chips.appendChild(c);
    });
    barra.appendChild(chips);
    var ord = h("select", "pc-sort"); ord.setAttribute("aria-label", "Ordenar");
    [["nuevo", "Más recientes"], ["viejo", "Más antiguos"]].forEach(function (o) {
      var op = h("option", null, o[1]); op.value = o[0]; ord.appendChild(op);
    });
    ord.value = S.orden; barra.appendChild(ord);
    root.appendChild(barra);

    var dest = h("div", "pc-dest"), cont = h("div", "pc-cont");
    root.appendChild(dest); root.appendChild(cont);

    function fijarFiltro(k) {
      S.filtro = k;
      Object.keys(refs).forEach(function (r) { refs[r].setAttribute("aria-pressed", String(r === k)); });
      pintar();
    }
    function pintar() {
      var t = norm(S.q), lista = S.items.filter(function (x) {
        return (S.filtro === "todo" || x.tipo === S.filtro) &&
          (!t || norm(x.titulo + " " + (x.descripcion || "") + " " + (x.invitado || "")).indexOf(t) !== -1);
      });
      dest.textContent = ""; cont.textContent = "";
      var portada = S.filtro === "todo" && !t;
      var d = portada ? porFecha(S.items.filter(function (x) { return x.destacado; }), "nuevo")[0] : null;
      if (d) dest.appendChild(destacado(d));
      if (!lista.length) { cont.appendChild(h("div", "pc-empty", "No hay resultados. Prueba con otra búsqueda.")); ads(); return; }

      if (portada) {
        var n = 0;
        ["episodio", "entrevista", "clip"].forEach(function (tipo) {
          var l = porFecha(lista.filter(function (x) { return x.tipo === tipo && x !== d; }), S.orden);
          if (!l.length) return;
          n++;
          var lim = tipo === "clip" ? 8 : 6, sec = h("section", "pc-seccion");
          sec.appendChild(cabecera(PLURAL[tipo], l.length, l.length > lim ? function () { fijarFiltro(tipo); window.scrollTo({ top: barra.offsetTop - 8, behavior: "smooth" }); } : null));
          var gr = h("div", "pc-grid" + (tipo === "clip" ? " pc-grid-clips" : ""));
          l.slice(0, lim).forEach(function (x, i) { gr.appendChild(carta(x, i)); });
          sec.appendChild(gr); cont.appendChild(sec);
          if (n === 1 || n === 3) poner(cont, "entre_noticias");
        });
      } else {
        cont.appendChild(cabecera(FILTROS[S.filtro] === "Todo" ? "Resultados" : FILTROS[S.filtro], lista.length));
        var gr2 = h("div", "pc-grid" + (S.filtro === "clip" ? " pc-grid-clips" : ""));
        porFecha(lista, S.orden).forEach(function (x, i) {
          gr2.appendChild(carta(x, i));
          if (i === 5 || i === 17) { var a = anuncio("entre_noticias"); if (a) { a.classList.add("pc-ad-grid"); gr2.appendChild(a); } }
        });
        cont.appendChild(gr2);
      }
      ads();
    }
    q.oninput = function () { S.q = q.value; pintar(); };
    ord.onchange = function () { S.orden = ord.value; pintar(); };
    pintar();
  }

  function destacado(d) {
    var a = h("a", "pc-feat");
    a.href = "?ep=" + encodeURIComponent(d.id);
    a.appendChild(miniatura(d, 0));
    var b = h("div", "pc-feat-b");
    b.appendChild(h("span", "pc-kick", "Lo último"));
    b.appendChild(h("h2", null, d.titulo));
    if (d.descripcion) b.appendChild(h("p", "pc-feat-d", d.descripcion));
    b.appendChild(h("p", "pc-meta", meta(d) + (d.duracion ? " · " + d.duracion : "")));
    var cta = h("span", "pc-cta"); cta.appendChild(icono("pc-ico", IC.play)); cta.appendChild(document.createTextNode("Reproducir"));
    b.appendChild(cta); a.appendChild(b);
    abrirEnlace(a, function () { abrir(d.id, true, true); });
    return a;
  }

  /* ---------- arranque ---------- */
  function ruta() {
    var ep = new URLSearchParams(location.search).get("ep");
    if (ep) abrir(ep, false, false); else volver(false);
  }
  window.addEventListener("popstate", ruta);

  function json(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }); }
  var api = typeof apiFetch === "function"
    ? apiFetch("/api/podcast").then(function (r) { if (!r.ok) throw 0; return r.json(); })
    : Promise.reject();
  api.catch(function () { return { items: [] }; })
    .then(function (d) {
      if (d && Array.isArray(d.items) && d.items.length) return d;
      return json("/data/podcast.json").then(function (j) { j.items = (j.items || []).filter(function (x) { return !x.demo; }); return j; }).catch(function () { return { items: [] }; });
    })
    .then(function (d) {
      S.items = Array.isArray(d.items) ? d.items : [];
      return json("/data/podcast.json").then(function (j) { S.programa = j.programa || {}; }, function () {});
    })
    .then(ruta)
    .catch(function () { root.textContent = ""; root.appendChild(h("div", "pc-empty", "No se pudo cargar el podcast. Inténtalo de nuevo en unos minutos.")); });
})();
