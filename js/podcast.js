/* Podcast público: "mini YouTube". Rejilla de vídeos + vista de reproducción con lista lateral.
   Datos: GET /api/podcast (los gestiona el panel de admin). Si la API no responde o está
   vacía, se usa /data/podcast.json como plan B. */
(function () {
  "use strict";
  var TIPOS = { todo: "Todo", episodio: "Episodios", entrevista: "Entrevistas", clip: "Clips" };
  var ETIQ = { episodio: "Episodio", entrevista: "Entrevista", clip: "Clip" };
  var PAL = [["#0c1b2e", "#d1132e"], ["#152b46", "#5bb8e8"], ["#9c0e23", "#0c1b2e"], ["#0c1b2e", "#5bb8e8"]];
  var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var root = document.getElementById("pcRoot");
  var data = { programa: {}, items: [] }, filtro = "todo", busqueda = "", actual = null;

  function h(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function fecha(s) {
    var d = new Date(s + "T12:00:00");
    return isNaN(d) ? "" : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }
  function meta(it) {
    var p = [];
    if (it.tipo === "episodio" && it.numero) p.push("T" + (it.temporada || 1) + " · Ep. " + it.numero);
    if (it.invitado) p.push(it.invitado);
    if (it.fecha) p.push(fecha(it.fecha));
    return p.join(" · ");
  }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function ordenados() {
    return data.items.slice().sort(function (a, b) {
      return (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0) || (b.fecha || "").localeCompare(a.fecha || "");
    });
  }

  function miniatura(it, i) {
    var c = h("div", "pc-th"), pal = PAL[i % PAL.length];
    c.style.setProperty("--c1", pal[0]); c.style.setProperty("--c2", pal[1]);
    if (/^https:\/\//.test(it.portada || "")) {
      var im = h("img"); im.src = it.portada; im.alt = ""; im.loading = "lazy"; im.decoding = "async";
      im.onerror = function () { im.remove(); };
      c.appendChild(im);
    } else {
      c.appendChild(h("b", null, it.tipo === "episodio" && it.numero ? "#" + it.numero : (ETIQ[it.tipo] || "").toUpperCase()));
    }
    c.appendChild(h("span", "pc-tag", ETIQ[it.tipo] || it.tipo));
    var pl = h("span", "pc-play"); pl.setAttribute("aria-hidden", "true"); pl.innerHTML = PLAY; c.appendChild(pl);
    if (it.duracion) c.appendChild(h("span", "pc-dur", it.duracion));
    return c;
  }

  function tarjeta(it, i) {
    var a = h("a", "pc-card"); a.href = "?ep=" + encodeURIComponent(it.id);
    a.setAttribute("aria-label", "Ver: " + it.titulo);
    a.appendChild(miniatura(it, i));
    var b = h("div", "pc-info");
    b.appendChild(h("h3", null, it.titulo));
    var m = h("p", "pc-meta", (ETIQ[it.tipo] || it.tipo) + (meta(it) ? " · " + meta(it) : ""));
    b.appendChild(m);
    if (it.destacado) b.appendChild(h("span", "pc-badge", "Destacado"));
    a.appendChild(b);
    a.onclick = function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); ver(it.id, true, true);
    };
    return a;
  }

  /* Reproductor: solo plataformas conocidas y con ids saneados. */
  function reproductor(em, auto) {
    if (!em || !em.plataforma) return null;
    var id = String(em.id || ""), box = h("div", "pc-player v-" + em.plataforma);
    if (em.plataforma === "audio") {
      if (!/^https:\/\//.test(em.url || "")) return null;
      var a = h("audio"); a.controls = true; a.preload = "none"; a.src = em.url; a.autoplay = !!auto;
      box.appendChild(a); return box;
    }
    var src = {
      youtube: /^[\w-]{6,20}$/.test(id) && "https://www.youtube-nocookie.com/embed/" + id + "?rel=0" + (auto ? "&autoplay=1" : ""),
      spotify: /^(episode|show)\/\w+$/.test(id) && "https://open.spotify.com/embed/" + id,
      ivoox: /^\d+$/.test(id) && "https://www.ivoox.com/player_ej_" + id + "_4_1.html"
    }[em.plataforma];
    if (!src) return null;
    var f = h("iframe"); f.src = src; f.title = "Reproductor"; f.setAttribute("allowfullscreen", "");
    f.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
    f.referrerPolicy = "strict-origin-when-cross-origin";
    box.appendChild(f); return box;
  }

  function compartir(it) {
    var u = location.origin + location.pathname + "?ep=" + encodeURIComponent(it.id);
    if (navigator.share) { navigator.share({ title: it.titulo, url: u }).catch(function () {}); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () {
      if (window.mostrarAlerta) mostrarAlerta("Enlace copiado"); else alert("Enlace copiado");
    }, function () { prompt("Copia el enlace:", u); });
  }

  function ver(id, push, auto) {
    var it = data.items.filter(function (x) { return x.id === id; })[0];
    if (!it) { inicio(push); return; }
    actual = it;
    if (push) history.pushState({ ep: id }, "", "?ep=" + encodeURIComponent(id));
    document.title = it.titulo + " — Podcast — ELOTROFÚTBOLTV";
    pintarVer(it, auto);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function inicio(push) {
    actual = null;
    if (push) history.pushState({}, "", location.pathname);
    document.title = "Podcast — ELOTROFÚTBOLTV";
    pintarInicio();
  }

  function pintarVer(it, auto) {
    root.textContent = "";
    var wrap = h("div", "pc-watch");
    var main = h("div", "pc-main");
    var back = h("a", "pc-back", "← Todos los vídeos"); back.href = location.pathname;
    back.onclick = function (e) { e.preventDefault(); inicio(true); };
    main.appendChild(back);
    var pl = reproductor(it.embed, auto);
    if (!pl) { pl = h("div", "pc-player"); var s = h("div", "pc-soon"); s.appendChild(h("p", null, "Próximamente disponible")); pl.appendChild(s); }
    main.appendChild(pl);
    main.appendChild(h("h1", "pc-title", it.titulo));
    var row = h("div", "pc-row");
    row.appendChild(h("span", "pc-kick", ETIQ[it.tipo] || it.tipo));
    row.appendChild(h("span", "pc-meta", meta(it)));
    var sh = h("button", "pc-share", "Compartir"); sh.type = "button"; sh.onclick = function () { compartir(it); };
    row.appendChild(sh);
    main.appendChild(row);
    if (it.descripcion) main.appendChild(h("div", "pc-desc", it.descripcion));
    wrap.appendChild(main);

    var side = h("aside", "pc-side"); side.appendChild(h("h2", null, "Siguientes"));
    ordenados().filter(function (x) { return x.id !== it.id; }).slice(0, 12).forEach(function (x, i) {
      var a = h("a", "pc-mini"); a.href = "?ep=" + encodeURIComponent(x.id);
      a.appendChild(miniatura(x, i));
      var b = h("div", "pc-info"); b.appendChild(h("h3", null, x.titulo)); b.appendChild(h("p", "pc-meta", meta(x)));
      a.appendChild(b);
      a.onclick = function (e) { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); ver(x.id, true, true); };
      side.appendChild(a);
    });
    wrap.appendChild(side);
    root.appendChild(wrap);
  }

  function pintarInicio() {
    root.textContent = "";
    var pr = data.programa || {};
    var cab = h("header", "pc-hero");
    var eq = h("div", "pc-eq"); eq.setAttribute("aria-hidden", "true");
    for (var k = 0; k < 5; k++) eq.appendChild(h("i"));
    cab.appendChild(eq);
    cab.appendChild(h("h1", null, pr.titulo || "Podcast"));
    if (pr.descripcion) cab.appendChild(h("p", null, pr.descripcion));
    var NP = { spotify: "Spotify", apple: "Apple Podcasts", ivoox: "iVoox", youtube: "YouTube" }, plat = h("div", "pc-plat");
    Object.keys(NP).forEach(function (n) {
      var u = (pr.plataformas || {})[n];
      if (/^https:\/\//.test(u || "")) { var a = h("a", null, NP[n]); a.href = u; a.target = "_blank"; a.rel = "noopener"; plat.appendChild(a); }
    });
    if (plat.children.length) cab.appendChild(plat);
    root.appendChild(cab);

    var items = ordenados();
    var bar = h("div", "pc-bar");
    var q = h("input", "pc-q"); q.type = "search"; q.placeholder = "Buscar en el podcast…"; q.value = busqueda;
    q.setAttribute("aria-label", "Buscar en el podcast");
    bar.appendChild(q);
    var chips = h("div", "pc-chips"); chips.setAttribute("role", "group");
    Object.keys(TIPOS).forEach(function (k) {
      if (k !== "todo" && !items.some(function (x) { return x.tipo === k; })) return;
      var c = h("button", "pc-chip", TIPOS[k]); c.type = "button"; c.setAttribute("aria-pressed", String(k === filtro));
      c.onclick = function () { filtro = k; pintarInicio(); };
      chips.appendChild(c);
    });
    bar.appendChild(chips);
    root.appendChild(bar);

    var dest = filtro === "todo" ? items.filter(function (x) { return x.destacado; })[0] : null;
    var cajaDest = h("div", "pc-dest"); root.appendChild(cajaDest);
    var grid = h("div", "pc-grid"); root.appendChild(grid);
    function lista() {
      var nq = norm(busqueda);
      var l = items.filter(function (x) {
        return (filtro === "todo" || x.tipo === filtro) && (!nq || norm(x.titulo + " " + (x.descripcion || "") + " " + (x.invitado || "")).indexOf(nq) !== -1);
      });
      cajaDest.textContent = "";
      if (dest && !nq) {
        l = l.filter(function (x) { return x !== dest; });
        var ft = h("a", "pc-feat"); ft.href = "?ep=" + encodeURIComponent(dest.id);
        ft.appendChild(miniatura(dest, 0));
        var fb = h("div", "pc-feat-b");
        fb.appendChild(h("span", "pc-kick", "Lo último"));
        fb.appendChild(h("h2", null, dest.titulo));
        if (dest.descripcion) fb.appendChild(h("p", "pc-feat-d", dest.descripcion));
        fb.appendChild(h("p", "pc-meta", meta(dest)));
        fb.appendChild(h("span", "pc-cta", "▶ Reproducir"));
        ft.appendChild(fb);
        ft.onclick = function (e) { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); ver(dest.id, true, true); };
        cajaDest.appendChild(ft);
      }
      grid.textContent = "";
      if (!l.length && !(dest && !nq)) { grid.appendChild(h("div", "pc-empty", items.length ? "No hay resultados." : "Aún no hay nada por aquí. ¡Vuelve pronto!")); return; }
      l.forEach(function (x, i) { grid.appendChild(tarjeta(x, i)); });
    }
    q.oninput = function () { busqueda = q.value; lista(); };
    lista();
  }

  function enrutar() {
    var ep = new URLSearchParams(location.search).get("ep");
    if (ep) ver(ep, false, false); else inicio(false);
  }
  window.addEventListener("popstate", enrutar);

  function cargarJson(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw 0; return r.json(); });
  }
  var api = (typeof apiFetch === "function")
    ? apiFetch("/api/podcast").then(function (r) { if (!r.ok) throw 0; return r.json(); })
    : Promise.reject();
  api.catch(function () { return { items: [] }; })
    .then(function (j) {
      if (j && Array.isArray(j.items) && j.items.length) return j;
      return cargarJson("/data/podcast.json").then(function (est) {
        est.items = (est.items || []).filter(function (x) { return !x.demo; });
        return est;
      }).catch(function () { return { items: [] }; });
    })
    .then(function (j) {
      data.items = Array.isArray(j.items) ? j.items : [];
      return cargarJson("/data/podcast.json").then(function (est) { data.programa = est.programa || {}; }, function () {});
    })
    .then(enrutar)
    .catch(function () {
      root.textContent = ""; root.appendChild(h("div", "pc-empty", "No se pudo cargar el podcast. Inténtalo de nuevo en unos minutos."));
    });
})();
