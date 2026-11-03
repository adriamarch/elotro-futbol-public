/* ==========================================================================
   PORTADA DE GALERÍAS (/galerias)
   Pinta: la mesa de copias de la cabecera, las dos puertas (por partido /
   general) y el listado de partidos con filtros por competición y equipo.
   Datos: GET /api/galerias/partidos (ver worker/src/index.js).
   Depende de config.js (apiFetch, cloudinaryMiniatura, CATEGORIES,
   CATEGORY_LOGOS), clubs.js (getEscudoUrl, manejarErrorEscudo) y foco.js.
   ========================================================================== */
(function () {
  "use strict";

  var ORDEN_COMPETICIONES = ["hypermotion", "primera_federacion", "segunda_federacion", "tercera_federacion", "copa_del_rey", "copa_federacion"];
  var estado = { pagina: 1, hayMas: false, competicion: "", texto: "", cargando: false, peticion: 0, ultimoMes: "", total: 0 };
  var timerBusqueda = null;

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function nf(n) { return Number(n || 0).toLocaleString("es-ES"); }
  function plural(n, uno, varios) { return nf(n) + " " + (Number(n) === 1 ? uno : varios); }

  function etiquetaCompeticion(clave) {
    return (typeof CATEGORIES !== "undefined" && CATEGORIES[clave]) || clave || "";
  }
  function logoCompeticion(clave) {
    return (typeof CATEGORY_LOGOS !== "undefined" && CATEGORY_LOGOS[clave]) || "";
  }

  // ---------- Imágenes ----------
  function miniatura(url, ancho) {
    return typeof cloudinaryMiniatura === "function" ? cloudinaryMiniatura(url, ancho, false) : url;
  }
  function estiloFoco(foco) {
    return foco && typeof EOF_FOCO !== "undefined" ? ' style="' + esc(EOF_FOCO.estilo(foco)) + '"' : "";
  }
  function imgFoto(f, ancho, alt, extra) {
    return '<img src="' + esc(miniatura(f.url, ancho)) + '" alt="' + esc(alt || "") + '" class="foco-img" loading="lazy" decoding="async"' +
      estiloFoco(f.foco) + (extra || "") + ">";
  }
  // Las imágenes del collage aparecen suavemente al decodificar (sin "pop-in").
  function activarFundido(raiz) {
    raiz.querySelectorAll(".gh-collage img:not(.lista)").forEach(function (img) {
      var listo = function () { img.classList.add("lista"); };
      if (img.complete && img.naturalWidth) listo();
      else { img.addEventListener("load", listo, { once: true }); img.addEventListener("error", listo, { once: true }); }
    });
  }

  // ---------- Fechas ----------
  function parsearDia(fecha) {
    var m = String(fecha || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  function claveMes(fecha) {
    var d = parsearDia(fecha);
    return d ? d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") : "sin-fecha";
  }
  function tituloMes(fecha) {
    var d = parsearDia(fecha);
    if (!d) return "Sin fecha";
    var t = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function textoFecha(fecha) {
    var d = parsearDia(fecha);
    return d ? d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) : "";
  }

  // ---------- Cabecera: mosaico de fondo ----------
  // Con las fotos recientes y las de portada de los partidos se llenan 6
  // columnas de 2 fotos. Si hay pocas, se repiten; con menos de 3, no se pinta.
  function pintarFondo(fotos) {
    var cont = el("ghFondo");
    if (!cont || cont.childElementCount) return;
    var vistas = {}, unicas = [];
    (fotos || []).forEach(function (f) { if (f && f.url && !vistas[f.url]) { vistas[f.url] = 1; unicas.push(f); } });
    if (unicas.length < 3) return;
    var html = "";
    for (var c = 0; c < 6; c++) {
      html += '<div class="gh-fondo-col">';
      for (var r = 0; r < 2; r++) html += imgFoto(unicas[(c * 2 + r) % unicas.length], 480, "").replace(' loading="lazy"', "");
      html += "</div>";
    }
    cont.innerHTML = html;
    activarFundidoFondo(cont);
  }
  function activarFundidoFondo(raiz) {
    raiz.querySelectorAll("img").forEach(function (img) {
      var listo = function () { img.classList.add("lista"); };
      if (img.complete && img.naturalWidth) listo();
      else { img.addEventListener("load", listo, { once: true }); img.addEventListener("error", listo, { once: true }); }
    });
  }
  function pintarCifras(datos) {
    var cont = el("ghCifras");
    if (!cont) return;
    var comps = datos.competiciones || [];
    var partidos = comps.reduce(function (n, c) { return n + c.partidos; }, 0);
    var archivos = (datos.general && datos.general.total) || comps.reduce(function (n, c) { return n + c.fotos; }, 0);
    var html = "";
    if (partidos) html += "<li>" + ICONO_BALON + plural(partidos, "partido", "partidos") + "</li>";
    if (archivos) html += "<li>" + ICONO_CAMARA + plural(archivos, "archivo", "archivos") + "</li>";
    cont.innerHTML = html;
  }
  function ponerFotoPuerta(id, foto) {
    var puerta = el(id);
    var capa = puerta && puerta.querySelector(".gh-puerta-foto");
    if (!capa || !foto || capa.style.backgroundImage) return;
    var url = miniatura(foto.url, 900);
    var img = new Image();
    img.onload = function () { capa.style.backgroundImage = 'url("' + url.replace(/"/g, "%22") + '")'; };
    img.src = url;
  }

  // ---------- Puertas ----------
  var ICONO_CAMARA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>';
  var ICONO_FLECHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
  var ICONO_BALON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m12 7.5 4 2.9-1.5 4.7h-5L8 10.4z"/><path d="M12 7.5V3.2M16 10.4l4.2-1.3M14.5 15.1l2.6 3.6M9.5 15.1l-2.6 3.6M8 10.4 3.8 9.1"/></svg>';

  function pintarPuertas(datos) {
    var comps = datos.competiciones || [];
    var partidos = comps.reduce(function (n, c) { return n + c.partidos; }, 0);
    var fotosPartidos = comps.reduce(function (n, c) { return n + c.fotos; }, 0);
    estado.total = partidos;

    var puertaPartido = el("ghPuertaPartido");
    if (puertaPartido) {
      var dato = partidos ? plural(partidos, "partido con galería", "partidos con galería") : "Se completa con cada partido cubierto";
      puertaPartido.querySelector(".gh-puerta-dato").textContent = dato;
    }

    var general = datos.general || {};
    var puertaGeneral = el("ghPuertaGeneral");
    if (puertaGeneral) {
      var total = general.total || fotosPartidos;
      puertaGeneral.querySelector(".gh-puerta-dato").textContent = total ? plural(total, "archivo", "archivos") : "Fotos y vídeos de todos los partidos";
    }
  }

  // ---------- Filtros ----------
  function pintarChips(competiciones) {
    var cont = el("ghChips");
    if (!cont) return;
    var lista = (competiciones || []).slice().sort(function (a, b) {
      var ia = ORDEN_COMPETICIONES.indexOf(a.clave), ib = ORDEN_COMPETICIONES.indexOf(b.clave);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    var total = lista.reduce(function (n, c) { return n + c.partidos; }, 0);
    var html = '<button type="button" class="gh-chip" data-comp="" aria-pressed="' + (estado.competicion === "") + '">Todas <small>' + nf(total) + "</small></button>";
    lista.forEach(function (c) {
      var logo = logoCompeticion(c.clave);
      html += '<button type="button" class="gh-chip" data-comp="' + esc(c.clave) + '" aria-pressed="' + (estado.competicion === c.clave) + '">' +
        (logo ? '<img src="' + esc(logo) + '" alt="" width="17" height="17">' : "") + esc(etiquetaCompeticion(c.clave)) + " <small>" + nf(c.partidos) + "</small></button>";
    });
    cont.innerHTML = html;
  }
  function marcarChips() {
    document.querySelectorAll("#ghChips .gh-chip").forEach(function (b) {
      b.setAttribute("aria-pressed", String((b.dataset.comp || "") === estado.competicion));
    });
  }

  // ---------- Tarjeta de partido ----------

  function marcador(p) {
    if (p.estado === "programado" || p.estado === "anulado") return "vs";
    var t = (p.goles_local == null ? "-" : p.goles_local) + " - " + (p.goles_visitante == null ? "-" : p.goles_visitante);
    if (p.penaltis_local != null && p.penaltis_visitante != null) t += "<small>pen. " + esc(p.penaltis_local) + "-" + esc(p.penaltis_visitante) + "</small>";
    return t;
  }

  function collage(p) {
    var fotos = (p.fotos || []).slice(0, 3);
    var titulo = p.equipo_local + " - " + p.equipo_visitante;
    if (!fotos.length) {
      return '<div class="gh-sinfotos">' + escudo(p.equipo_local, p.escudo_local_url, "") + escudo(p.equipo_visitante, p.escudo_visitante_url, "") + "</div>";
    }
    var ancho = fotos.length === 1 ? 900 : 700;
    return '<div class="gh-collage n' + fotos.length + '">' + fotos.map(function (f, i) {
      return imgFoto(f, i === 0 ? ancho : 360, i === 0 ? "Foto del partido " + titulo : "");
    }).join("") + "</div>";
  }

  function escudo(nombre, url, clase) {
    var src = typeof getEscudoUrl === "function" ? getEscudoUrl(nombre, url) : "";
    return '<img class="' + (clase || "") + '" data-equipo="' + esc(nombre) + '" src="' + esc(src) + '" alt="" width="56" height="56" loading="lazy" onerror="manejarErrorEscudo(this);">';
  }

  function fila(nombre, url, goles, clase, pen) {
    return '<div class="gh-fila' + (clase ? " " + clase : "") + '">' + escudo(nombre, url, "gh-escudo") +
      '<span class="gh-nombre">' + esc(nombre) + "</span>" +
      '<span class="gh-gol">' + esc(goles) + (pen != null ? '<span class="gh-pen">(' + esc(pen) + ")</span>" : "") + "</span></div>";
  }

  function tarjeta(p, destacada) {
    var logo = logoCompeticion(p.competicion);
    var etiqueta = [etiquetaCompeticion(p.competicion), p.jornada ? "J" + p.jornada : ""].filter(Boolean).join(" · ");
    var fecha = textoFecha(p.fecha_partido);
    var etiquetaAria = "Galería del partido " + p.equipo_local + " - " + p.equipo_visitante;
    var jugado = !(p.estado === "programado" || p.estado === "anulado") && p.goles_local != null && p.goles_visitante != null;
    var gl = jugado ? p.goles_local : "–", gv = jugado ? p.goles_visitante : "–";
    var cl = "", cv = "";
    if (jugado && p.goles_local !== p.goles_visitante) { if (p.goles_local > p.goles_visitante) cv = "perdedor"; else cl = "perdedor"; }
    var penL = null, penV = null;
    if (p.penaltis_local != null && p.penaltis_visitante != null) {
      penL = p.penaltis_local; penV = p.penaltis_visitante;
      if (p.goles_local === p.goles_visitante) { if (penL > penV) cv = "perdedor"; else if (penV > penL) cl = "perdedor"; }
    }
    return '<a class="gh-card' + (destacada ? " destacada" : "") + '" href="/galeria/' + encodeURIComponent(p.slug) + '" aria-label="' + esc(etiquetaAria) + '">' +
      '<div class="gh-portada">' + collage(p) +
        (etiqueta ? '<span class="gh-etiqueta">' + (logo ? '<img src="' + esc(logo) + '" alt="" width="14" height="14">' : "") + esc(etiqueta) + "</span>" : "") +
        '<span class="gh-total">' + ICONO_CAMARA + nf(p.total) + "</span>" +
        (fecha ? '<p class="gh-fecha">' + esc(fecha.charAt(0).toUpperCase() + fecha.slice(1)) + "</p>" : "") +
        '<div class="gh-rotulo"><div class="gh-filas">' +
          fila(p.equipo_local, p.escudo_local_url, gl, cl, penL) +
          fila(p.equipo_visitante, p.escudo_visitante_url, gv, cv, penV) +
        '</div><span class="gh-ver">Ver galería ' + ICONO_FLECHA + "</span></div>" +
      "</div></a>";
  }

  // ---------- Listado ----------
  function esqueletos(n) {
    return Array.from({ length: n }, function () { return '<div class="gh-esqueleto"></div>'; }).join("");
  }
  function vacio(titulo, texto, accion) {
    return '<div class="gh-vacio" role="status"><strong>' + esc(titulo) + "</strong>" + esc(texto) + (accion || "") + "</div>";
  }

  function pintarPartidos(partidos, anadir) {
    var grid = el("ghGrid");
    if (!anadir) { grid.innerHTML = ""; estado.ultimoMes = ""; }
    else grid.querySelectorAll(".gh-esqueleto").forEach(function (e) { e.remove(); });
    if (!partidos.length && !anadir) {
      var hayFiltro = estado.competicion || estado.texto;
      grid.innerHTML = hayFiltro
        ? vacio("No hay galerías con ese filtro", "Prueba con otro equipo o quita el filtro de competición.", '<br><button type="button" id="ghQuitarFiltros">Quitar filtros</button>')
        : vacio("Todavía no hay galerías de partidos", "Se van publicando después de cada partido cubierto. Mientras tanto, puedes ver todo el material en la galería general.", '<br><a href="/galeria-general">Ver la galería general</a>');
      return;
    }
    var html = "";
    partidos.forEach(function (p, i) {
      var mes = claveMes(p.fecha_partido);
      if (mes !== estado.ultimoMes) {
        estado.ultimoMes = mes;
        html += '<h3 class="gh-mes" style="grid-column:1 / -1">' + esc(tituloMes(p.fecha_partido)) + "</h3>";
      }
      html += tarjeta(p, !anadir && i === 0);
    });
    grid.insertAdjacentHTML("beforeend", html);
    activarFundido(grid);
  }

  function pintarResumen() {
    var r = el("ghResumen");
    if (!r) return;
    var partes = [];
    if (estado.competicion) partes.push(etiquetaCompeticion(estado.competicion));
    if (estado.texto) partes.push("«" + estado.texto + "»");
    r.textContent = partes.length ? "Mostrando galerías de " + partes.join(" y ") : "Galerías de los últimos partidos, de más reciente a más antiguo.";
  }

  function guardarUrl() {
    var params = new URLSearchParams();
    if (estado.competicion) params.set("competicion", estado.competicion);
    if (estado.texto) params.set("q", estado.texto);
    var q = params.toString();
    try { history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash); } catch (e) { /* sin historial */ }
  }

  async function cargar(anadir) {
    var miPeticion = ++estado.peticion;
    estado.cargando = true;
    var grid = el("ghGrid");
    var botonMas = el("ghMas");
    if (!anadir) {
      estado.pagina = 1;
      grid.innerHTML = esqueletos(6);
      el("ghMasWrap").hidden = true;
    } else {
      grid.insertAdjacentHTML("beforeend", esqueletos(3));
      if (botonMas) { botonMas.disabled = true; botonMas.textContent = "Cargando…"; }
    }
    try {
      var params = new URLSearchParams({ pagina: estado.pagina });
      if (estado.competicion) params.set("competicion", estado.competicion);
      if (estado.texto) params.set("q", estado.texto);
      var res = await apiFetch("/api/galerias/partidos?" + params.toString());
      if (!res.ok) throw new Error("Error de red");
      var datos = await res.json();
      if (miPeticion !== estado.peticion) return; // llegó una respuesta más nueva
      if (!anadir && estado.pagina === 1) {
        // El resumen (chips, puertas, mesa) llega en la primera página.
        if (datos.competiciones && !estado.chipsPintados) { pintarChips(datos.competiciones); pintarPuertas(datos); estado.chipsPintados = true; }
        if (datos.general && !estado.generalPintado) { pintarPuertas(datos); estado.generalPintado = true; }
      }
      estado.hayMas = !!datos.hayMas;
      pintarPartidos(datos.partidos || [], anadir);
      if (!anadir && estado.pagina === 1 && !estado.fondoPintado) {
        var portadas = [];
        (datos.partidos || []).forEach(function (p) { if (p.fotos && p.fotos[0]) portadas.push(p.fotos[0]); });
        var recientes = (datos.general && datos.general.recientes) || [];
        if (portadas.length || recientes.length) {
          estado.fondoPintado = true;
          pintarFondo(recientes.concat(portadas).slice(0, 12));
          if (datos.competiciones) pintarCifras(datos);
          ponerFotoPuerta("ghPuertaPartido", portadas[0] || recientes[0]);
          ponerFotoPuerta("ghPuertaGeneral", recientes[0] || portadas[1] || portadas[0]);
        }
      }
      el("ghMasWrap").hidden = !estado.hayMas;
      pintarResumen();
    } catch (err) {
      if (miPeticion !== estado.peticion) return;
      grid.querySelectorAll(".gh-esqueleto").forEach(function (e) { e.remove(); });
      if (!anadir) grid.innerHTML = vacio("No se han podido cargar las galerías", "Ha habido un problema de conexión.", '<br><button type="button" id="ghReintentar">Volver a intentarlo</button>');
      else { estado.pagina = Math.max(1, estado.pagina - 1); el("ghMasWrap").hidden = false; }
    } finally {
      if (miPeticion === estado.peticion) {
        estado.cargando = false;
        if (botonMas) { botonMas.disabled = false; botonMas.textContent = "Cargar más partidos"; }
      }
    }
  }

  function aplicarFiltros() { guardarUrl(); marcarChips(); cargar(false); }

  function iniciar() {
    var params = new URLSearchParams(location.search);
    estado.competicion = /^[a-z_]{1,40}$/.test(params.get("competicion") || "") ? params.get("competicion") : "";
    estado.texto = String(params.get("q") || "").trim().slice(0, 60);
    var input = el("ghBuscar");
    if (input) {
      input.value = estado.texto;
      input.parentElement.classList.toggle("con-texto", !!estado.texto);
      input.addEventListener("input", function () {
        input.parentElement.classList.toggle("con-texto", !!input.value);
        clearTimeout(timerBusqueda);
        timerBusqueda = setTimeout(function () {
          var nuevo = input.value.trim().slice(0, 60);
          if (nuevo === estado.texto) return;
          estado.texto = nuevo;
          aplicarFiltros();
        }, 350);
      });
      input.parentElement.querySelector("button").addEventListener("click", function () {
        input.value = ""; input.parentElement.classList.remove("con-texto"); estado.texto = ""; input.focus(); aplicarFiltros();
      });
    }
    el("ghChips").addEventListener("click", function (e) {
      var b = e.target.closest(".gh-chip");
      if (!b || (b.dataset.comp || "") === estado.competicion) return;
      estado.competicion = b.dataset.comp || "";
      aplicarFiltros();
    });
    el("ghMas").addEventListener("click", function () {
      if (estado.cargando) return;
      estado.pagina += 1;
      cargar(true);
    });
    el("ghGrid").addEventListener("click", function (e) {
      if (e.target.id === "ghReintentar") cargar(false);
      if (e.target.id === "ghQuitarFiltros") {
        estado.competicion = ""; estado.texto = "";
        if (input) { input.value = ""; input.parentElement.classList.remove("con-texto"); }
        aplicarFiltros();
      }
    });
    var puertaPartido = el("ghPuertaPartido");
    if (puertaPartido) {
      puertaPartido.addEventListener("click", function (e) {
        var destino = el("partidos");
        if (!destino) return;
        e.preventDefault();
        var reducir = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        destino.scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "start" });
        try { history.replaceState(null, "", location.pathname + location.search + "#partidos"); } catch (err) { /* sin historial */ }
        var buscar = el("ghBuscar");
        if (buscar && !estado.texto) setTimeout(function () { buscar.focus({ preventScroll: true }); }, 450);
      });
    }
    pintarResumen();
    cargar(false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
