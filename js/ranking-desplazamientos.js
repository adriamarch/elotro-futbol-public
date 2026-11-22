/* Ranking de desplazamientos: dos clasificaciones (más estadios / más km).
   Datos de GET /api/mapa-desplazamientos/ranking (público; con sesión añade "mi_posicion").
   Depende de: config.js (apiFetch, escapeHtml), clubs.js (getEscudoUrl), lector-auth.js. */
(function () {
  "use strict";
  var datos = null, tipo = "estadios";

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return Number(n || 0).toLocaleString("es-ES", { useGrouping: "always" }); }
  function esc(s) { return typeof escapeHtml === "function" ? escapeHtml(String(s == null ? "" : s)) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function sesion() { return typeof sesionLectorActual === "function" ? sesionLectorActual() : null; }
  function escudo(equipo, cls) {
    if (!equipo || typeof getEscudoUrl !== "function") return '<span class="' + cls + '"></span>';
    return '<img class="' + cls + '" src="' + esc(getEscudoUrl(equipo)) + '" alt="" loading="lazy" data-equipo="' + esc(equipo) + '" onerror="manejarErrorEscudo(this)">';
  }
  function valor(f) { return tipo === "km" ? fmt(f.km) : fmt(f.n); }
  function unidad(f) {
    if (tipo === "km") return "km";
    return f.n === 1 ? "estadio" : "estadios";
  }
  function secundario(f) { return tipo === "km" ? fmt(f.n) + (f.n === 1 ? " estadio" : " estadios") : fmt(f.km) + " km"; }
  function esMio(f) { var s = sesion(); return !!s && Number(s.id) === Number(f.reader_id); }

  function pintarMi() {
    var cont = $("rkdMi"), m = datos && datos.mi_posicion, s = sesion();
    if (!s) {
      if (window.EOFAvisoLector) cont.innerHTML = EOFAvisoLector.html("ranking");
      return;
    }
    if (!m) {
      cont.innerHTML = '<div class="rkd-mi"><div class="rkd-mi-txt"><strong>Todavía no estás en el ranking</strong><span>Elige tu equipo y marca los estadios que has visitado.</span></div><button type="button" class="mapad-btn mapad-btn-principal" data-ir-mapa>Ir a mi mapa</button></div>';
      return;
    }
    var pos = tipo === "km" ? m.posicion_km : m.posicion_estadios;
    cont.innerHTML = '<div class="rkd-mi"><div class="rkd-mi-pos" aria-label="Tu posición">#' + fmt(pos) + '</div><div class="rkd-mi-txt"><strong>Tu posición ' + (tipo === "km" ? "en kilómetros" : "en desplazamientos") + '</strong><span>' +
      fmt(m.n) + (m.n === 1 ? " estadio" : " estadios") + " · " + fmt(m.km) + " km" + (m.equipo ? " · " + esc(m.equipo) : "") + '</span></div><button type="button" class="mapad-btn" data-ir-mapa>Mi mapa</button></div>';
  }

  function pintarLista() {
    var cont = $("rkdCont"), filas = datos ? datos[tipo] || [] : [];
    if (!filas.length) {
      cont.innerHTML = '<div class="rkd-vacio"><strong>Todavía no hay nadie en el ranking</strong><p>Sé el primero: elige tu equipo en <a href="#mapa" data-ir-mapa>tu mapa</a> y marca los estadios que has visitado.</p></div>';
      return;
    }
    var podio = filas.filter(function (f) { return f.posicion <= 3; }).slice(0, 3);
    // El podio solo se pinta cuando hay 3 puestos distintos que mostrar; si hay empates se sigue con la lista normal.
    var usarPodio = podio.length === 3 && podio[0].posicion === 1 && podio[1].posicion === 2 && podio[2].posicion === 3;
    var html = "";
    if (usarPodio) {
      html += '<div class="rkd-podio">' + podio.map(function (f) {
        return '<div class="rkd-pod rkd-pod-' + f.posicion + (esMio(f) ? " rkd-yo" : "") + '"><span class="rkd-medalla" aria-label="Puesto ' + f.posicion + '">' + f.posicion + '</span>' + escudo(f.equipo, "rkd-escudo") +
          '<span class="rkd-nombre">' + esc(f.nombre) + '</span><span class="rkd-equipo">' + esc(f.equipo || "") + '</span><span class="rkd-cifra">' + valor(f) + '<small>' + unidad(f) + '</small></span></div>';
      }).join("") + "</div>";
    }
    var resto = usarPodio ? filas.slice(3) : filas;
    if (resto.length) {
      html += '<ol class="rkd-lista" start="' + (usarPodio ? 4 : 1) + '">' + resto.map(function (f) {
        return '<li class="rkd-fila' + (esMio(f) ? " rkd-yo" : "") + '"><span class="rkd-pos">' + f.posicion + '</span>' + escudo(f.equipo, "rkd-escudo") +
          '<span class="rkd-quien"><strong>' + esc(f.nombre) + (esMio(f) ? " (tú)" : "") + '</strong><span>' + esc(f.equipo || "") + ' · ' + secundario(f) + '</span></span>' +
          '<span class="rkd-valor">' + valor(f) + '<small>' + unidad(f) + '</small></span></li>';
      }).join("") + "</ol>";
    }
    cont.innerHTML = html;
  }

  function pintar() { pintarMi(); pintarLista(); }

  function cambiarTab(t) {
    tipo = t;
    document.querySelectorAll(".rkd-tab").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tipo === t)); });
    pintar();
  }

  async function cargar() {
    $("rkdCont").innerHTML = '<div class="rkd-vacio">Cargando ranking…</div>';
    try {
      var r = sesion() && typeof apiFetchLector === "function" ? await apiFetchLector("/api/mapa-desplazamientos/ranking") : await apiFetch("/api/mapa-desplazamientos/ranking");
      if (!r.ok) throw new Error("HTTP " + r.status);
      datos = await r.json();
      pintar();
    } catch (e) {
      $("rkdCont").innerHTML = '<div class="rkd-vacio"><strong>No se ha podido cargar el ranking</strong><p>Inténtalo de nuevo en unos minutos.</p><button type="button" class="mapad-btn" data-rkd-reintentar>Reintentar</button></div>';
    }
  }

  var enlazado = false;
  /* Se llama cada vez que se abre la pestaña "Ranking" (así se ve siempre el dato más reciente). */
  window.iniciarRankingDesplazamientos = function () {
    if (!enlazado) {
      enlazado = true;
      document.querySelectorAll(".rkd-tab").forEach(function (b) { b.addEventListener("click", function () { cambiarTab(b.dataset.tipo); }); });
      /* Dentro de /mapa-desplazamientos existe el panel; en /ranking-desplazamientos no, así que se escucha en todo el documento. */
      (document.getElementById("mapadPanelRanking") || document).addEventListener("click", function (ev) {
        var ir = ev.target.closest("[data-ir-mapa]");
        if (ir) {
          ev.preventDefault();
          if (window.mapadAbrirPestana) window.mapadAbrirPestana("mapa");
          else location.href = "/mapa-desplazamientos";
        }
        if (ev.target.closest("[data-rkd-reintentar]")) { ev.preventDefault(); cargar(); }
      });
    }
    cargar();
  };
})();
