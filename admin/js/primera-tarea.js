/* ============================================================
   «Tu primera tarea» — encargo guiado tras el tutorial.

   Problema que resuelve: al cerrar el tutorial la persona se queda
   ante un panel enorme sin saber qué hacer, y se va. Este módulo le
   pone delante UNA tarea concreta, con un botón que la lleva a la
   pantalla correcta y que se marca sola al hacerla.

   - Fotógrafo: «Sube 10 fotos de [próximo partido de tu club]».
   - Redactor : «Cubre [partido]»: previa -> resultado -> crónica.
   - Sin club o sin partido próximo: tarea alternativa
     (3 primeras fotos / primera noticia).
   - Se genera sola (club de la cuenta + calendario de partidos),
     firmada por «La redacción». No necesita backend nuevo.
   - Al completarla ofrece la siguiente (otro partido del club).

   Usa lo que ya existe: USER / apiFetch (admin.js), GET /api/results,
   GET /api/media, GET /api/articles y EOF_TUTORIAL (tutorial.js, que
   avisa con el evento «eof:tutorial-cerrado»).
   Estado: localStorage por usuario («eof_primera_tarea_<usuario>»).
   Estilos: css/primera-tarea.css
   ============================================================ */
(function () {
  "use strict";

  function usuario() {
    try { if (typeof USER !== "undefined" && USER) return USER; } catch (e) {}
    try { return JSON.parse(localStorage.getItem("eof_user") || "null"); } catch (e) { return null; }
  }
  const u = usuario();
  // Los administradores no necesitan encargo de bienvenida.
  if (!u || u.rol === "admin") return;

  const esFotografo = u.rol === "fotografo";
  const OBJETIVO_FOTOS = 10;
  const OBJETIVO_FOTOS_ALT = 3;
  const KEY = "eof_primera_tarea_" + (u.username || u.id || "anon");

  // ---------- Estado persistente ----------
  let estado = { partido: null, alt: false, completadas: [], hecha: false, oculta: false, min: false };
  function cargar() {
    try { Object.assign(estado, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
  }
  function guardar() {
    try { localStorage.setItem(KEY, JSON.stringify(estado)); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  const esMovil = function () { return window.matchMedia("(max-width: 640px)").matches; };

  // ---------- Fechas ----------
  function aFecha(s) {
    if (!s) return null;
    const d = new Date(String(s).replace(" ", "T"));
    return isNaN(d.getTime()) ? null : d;
  }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function cuandoTexto(p) {
    const d = aFecha(p.fecha);
    if (!d) return "Fecha por confirmar";
    const dia = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const cap = dia.charAt(0).toUpperCase() + dia.slice(1);
    return /^00:00/.test(hora) ? cap : cap + " · " + hora;
  }

  // ---------- Buscar el partido ----------
  async function buscarPartido() {
    const clubes = Array.isArray(u.equipo) ? u.equipo.filter(Boolean).slice(0, 3) : [];
    const ahora = Date.now();
    const candidatos = [];
    for (const club of clubes) {
      try {
        const d = await apiFetch("/api/results?club=" + encodeURIComponent(club) +
          "&desde_fecha=" + iso(ahora - 2 * 864e5) + "&limit=60");
        (d.results || []).forEach(function (r) {
          const f = aFecha(r.fecha_partido);
          if (!f || r.estado === "anulado") return;
          if (estado.completadas.indexOf(r.id) !== -1) return;
          if (f.getTime() < ahora - 2 * 864e5) return;
          candidatos.push({ id: r.id, local: r.equipo_local, visitante: r.equipo_visitante,
            fecha: r.fecha_partido, competicion: r.competicion || "", club: club, estado: r.estado, ms: f.getTime() });
        });
      } catch (e) { /* sin red: se cae a la tarea alternativa */ }
    }
    candidatos.sort(function (a, b) { return a.ms - b.ms; });
    // Primero lo que aún no ha terminado; si no hay, lo más reciente ya jugado.
    return candidatos.find(function (c) { return c.estado !== "finalizado"; }) || candidatos[0] || null;
  }

  // ---------- Progreso (datos reales del panel) ----------
  async function fotosDelPartido(id) {
    const d = await apiFetch("/api/media");
    const lista = (d && (d.media || d.items || d.archivos)) || [];
    const mias = Array.isArray(lista) ? lista : [];
    return id == null
      ? mias.length
      : mias.filter(function (m) { return Number(m.resultado_id) === Number(id); }).length;
  }
  async function misArticulos() {
    const d = await apiFetch("/api/articles?admin=1&autor_id=" + encodeURIComponent(u.id) + "&limit=500");
    return (d && d.articles) || [];
  }
  async function partidoActual(p) {
    try {
      const d = await apiFetch("/api/results?club=" + encodeURIComponent(p.club) + "&desde_fecha=" + iso(Date.now() - 3 * 864e5) + "&limit=60");
      return (d.results || []).find(function (r) { return r.id === p.id; }) || null;
    } catch (e) { return null; }
  }

  // Devuelve { titulo, sub, pasos:[{texto, hecho, accion, boton, detalle}], hecha }
  async function calcular() {
    const p = estado.partido;
    if (esFotografo) {
      if (!p) {
        const n = await fotosDelPartido(null);
        return {
          titulo: "Sube tus " + OBJETIVO_FOTOS_ALT + " primeras fotos",
          sub: "Aún no hay un partido próximo de tu club en el calendario, así que empezamos por lo básico: sube tres fotos tuyas.",
          progreso: { n: Math.min(n, OBJETIVO_FOTOS_ALT), total: OBJETIVO_FOTOS_ALT, unidad: "fotos" },
          pasos: [{ texto: "Sube " + OBJETIVO_FOTOS_ALT + " fotos en Contenido", hecho: n >= OBJETIVO_FOTOS_ALT, accion: "subir", boton: "Ir a subir fotos" }],
          hecha: n >= OBJETIVO_FOTOS_ALT
        };
      }
      const n = await fotosDelPartido(p.id);
      const empezado = (aFecha(p.fecha) || new Date(8.64e15)).getTime() <= Date.now();
      return {
        titulo: "Sube " + OBJETIVO_FOTOS + " fotos de " + p.local + " – " + p.visitante,
        sub: cuandoTexto(p) + (p.competicion ? " · " + p.competicion : ""),
        progreso: { n: Math.min(n, OBJETIVO_FOTOS), total: OBJETIVO_FOTOS, unidad: "fotos" },
        pasos: [
          { texto: "Haz las fotos durante el partido", hecho: empezado || n > 0, detalle: empezado ? "" : "Aún falta para el partido." },
          { texto: "Sube " + OBJETIVO_FOTOS + " fotos y vincúlalas a este partido", hecho: n >= OBJETIVO_FOTOS, accion: "subir", boton: "Ir a subir fotos",
            detalle: "En «Subir contenido», elige el partido al vincularlas." }
        ],
        hecha: n >= OBJETIVO_FOTOS
      };
    }
    // Redactor
    const arts = await misArticulos();
    if (!p) {
      const hay = arts.length > 0;
      return {
        titulo: "Escribe tu primera noticia",
        sub: "Aún no hay un partido próximo de tu club en el calendario, así que empezamos por una noticia: tendrás tu nombre en la web.",
        pasos: [{ texto: "Escribe y guarda tu primera noticia", hecho: hay, accion: "nueva-noticia", boton: "Escribir noticia" }],
        hecha: hay
      };
    }
    const delPartido = function (tipo) {
      return arts.some(function (a) { return Number(a.resultado_id) === Number(p.id) && a.tipo === tipo; });
    };
    const cur = await partidoActual(p);
    const terminado = (cur ? cur.estado : p.estado) === "finalizado";
    const pasos = [];
    if (!terminado) pasos.push({ texto: "Escribe la previa", hecho: delPartido("previa"), accion: "nueva-noticia", boton: "Escribir la previa",
      detalle: "Elige este partido y el tipo «Previa»." });
    pasos.push({ texto: "Pon el resultado cuando acabe", hecho: terminado, accion: "resultados", boton: "Abrir Resultados",
      detalle: terminado ? "" : "Lo verás aquí en cuanto termine el partido." });
    pasos.push({ texto: "Publica la crónica", hecho: delPartido("cronica"), accion: "nueva-noticia", boton: "Escribir la crónica",
      detalle: "Elige este partido y el tipo «Crónica»." });
    return {
      titulo: "Cubre " + p.local + " – " + p.visitante,
      sub: cuandoTexto(p) + (p.competicion ? " · " + p.competicion : ""),
      pasos: pasos,
      hecha: pasos.every(function (s) { return s.hecho; })
    };
  }

  // ---------- Navegación por el panel ----------
  function irA(accion) {
    const mapa = { "subir": ["contenido", "subir"], "nueva-noticia": ["noticias", "nueva"], "resultados": ["resultados", null] };
    const destino = mapa[accion];
    if (!destino) return;
    const tab = document.querySelector('.tabs button[data-tab="' + destino[0] + '"]');
    if (tab && !tab.classList.contains("activo")) tab.click();
    if (destino[1]) {
      setTimeout(function () {
        const panel = document.getElementById("panel-" + destino[0]);
        const sub = panel && panel.querySelector('.subtabs button[data-subtab="' + destino[1] + '"]');
        if (sub && !sub.classList.contains("activo")) sub.click();
      }, 160);
    }
    // En móvil la tarjeta taparía el formulario: se pliega (sin perder el progreso).
    if (esMovil()) { estado.min = true; guardar(); pintar(); }
  }

  // ---------- DOM ----------
  let el = null;
  let ultimo = null;
  let ocupado = false;

  function crear() {
    if (el) return;
    el = document.createElement("aside");
    el.className = "pt-tarjeta";
    el.setAttribute("aria-label", "Tu primera tarea");
    el.hidden = true;
    el.addEventListener("click", function (e) {
      const b = e.target.closest("[data-pt]");
      if (!b) return;
      const a = b.getAttribute("data-pt");
      if (a === "min") { estado.min = true; guardar(); pintar(); }
      else if (a === "abrir") { estado.min = false; guardar(); pintar(); }
      else if (a === "comprobar") { comprobar(true); }
      else if (a === "ocultar") { estado.oculta = true; guardar(); pintar(); }
      else if (a === "siguiente") { siguiente(); }
      else if (a === "cerrar") { estado.oculta = true; guardar(); pintar(); }
      else if (a.indexOf("ir:") === 0) { irA(a.slice(3)); }
    });
    document.body.appendChild(el);
  }

  function pintar() {
    if (!el) return;
    if (estado.oculta || !ultimo) { el.hidden = true; return; }
    el.hidden = false;
    const r = ultimo;
    const hechos = r.pasos.filter(function (s) { return s.hecho; }).length;

    if (estado.min && !r.hecha) {
      el.className = "pt-tarjeta pt-chip";
      el.innerHTML = '<button type="button" class="pt-chip-btn" data-pt="abrir" aria-label="Abrir Tu primera tarea">' +
        '<span aria-hidden="true">🎯</span> Tu primera tarea <strong>' + hechos + "/" + r.pasos.length + "</strong></button>";
      return;
    }

    el.className = "pt-tarjeta" + (r.hecha ? " pt-hecha" : "");
    if (r.hecha) {
      el.innerHTML =
        '<div class="pt-cab"><span class="pt-etq">🎉 Tarea completada</span></div>' +
        '<h3 class="pt-titulo">¡Primera tarea hecha!</h3>' +
        '<p class="pt-sub">Gracias: lo que acabas de hacer ya forma parte de ELOTROFÚTBOLTV. — La redacción</p>' +
        '<div class="pt-botones">' +
        '<button type="button" class="pt-btn pt-btn-pri" data-pt="siguiente">Ver mi siguiente tarea</button>' +
        '<button type="button" class="pt-btn" data-pt="cerrar">Cerrar</button></div>';
      return;
    }

    // Siguiente paso pendiente = el que lleva el botón principal.
    const pendiente = r.pasos.find(function (s) { return !s.hecho && s.accion; });
    let html =
      '<div class="pt-cab"><span class="pt-etq">🎯 Tu primera tarea</span>' +
      '<button type="button" class="pt-x" data-pt="min" aria-label="Plegar">–</button></div>' +
      '<p class="pt-de">La redacción te encarga</p>' +
      '<h3 class="pt-titulo">' + esc(r.titulo) + '</h3>' +
      '<p class="pt-sub">' + esc(r.sub) + '</p>';
    if (r.progreso) {
      const pct = Math.round(100 * r.progreso.n / r.progreso.total);
      html += '<div class="pt-prog" role="progressbar" aria-valuemin="0" aria-valuemax="' + r.progreso.total +
        '" aria-valuenow="' + r.progreso.n + '"><span style="width:' + pct + '%"></span></div>' +
        '<p class="pt-prog-txt">' + r.progreso.n + " de " + r.progreso.total + " " + r.progreso.unidad + "</p>";
    }
    html += '<ol class="pt-pasos">';
    r.pasos.forEach(function (s) {
      html += '<li class="' + (s.hecho ? "pt-ok" : "") + '"><span class="pt-marca" aria-hidden="true">' + (s.hecho ? "✓" : "") +
        '</span><span>' + esc(s.texto) + (s.detalle && !s.hecho ? '<small>' + esc(s.detalle) + "</small>" : "") + "</span></li>";
    });
    html += "</ol>";
    html += '<div class="pt-botones">';
    if (pendiente) html += '<button type="button" class="pt-btn pt-btn-pri" data-pt="ir:' + esc(pendiente.accion) + '">' + esc(pendiente.boton) + " →</button>";
    html += '<button type="button" class="pt-btn" data-pt="comprobar">Comprobar</button></div>' +
      '<button type="button" class="pt-enlace" data-pt="ocultar">No mostrar más</button>';
    el.innerHTML = html;
  }

  // ---------- Ciclo ----------
  async function comprobar(manual) {
    if (ocupado) return;
    ocupado = true;
    try {
      if (!estado.partido && !estado.alt) {
        estado.partido = await buscarPartido();
        estado.alt = !estado.partido;
        guardar();
      }
      ultimo = await calcular();
      if (ultimo.hecha && !estado.hecha) {
        estado.hecha = true;
        estado.min = false;
        if (estado.partido) estado.completadas.push(estado.partido.id);
        guardar();
      }
    } catch (e) {
      if (manual) console.warn("Primera tarea: no se pudo comprobar", e);
    } finally {
      ocupado = false;
    }
    pintar();
  }

  async function siguiente() {
    estado.hecha = false;
    estado.partido = null;
    estado.alt = false;
    estado.min = false;
    // Si la anterior era la alternativa, no se repite: se busca partido de verdad.
    guardar();
    await comprobar(true);
    if (ultimo && ultimo.hecha) { // sin partido nuevo y alternativa ya cumplida
      estado.oculta = true; guardar(); pintar();
    }
  }

  function arrancar() {
    cargar();
    if (estado.oculta) return;
    crear();
    comprobar(false);
    window.addEventListener("focus", function () { if (!estado.oculta && !estado.hecha) comprobar(false); });
    setInterval(function () {
      if (document.visibilityState === "visible" && !estado.oculta && !estado.hecha) comprobar(false);
    }, 60000);
  }

  // ---------- Arranque: solo cuando el tutorial ya se ha visto o cerrado ----------
  let arrancado = false;
  function intentar() {
    if (arrancado) return;
    const tut = window.EOF_TUTORIAL;
    if (tut && tut.estaActivo && tut.estaActivo()) return; // se espera al evento
    if (tut && tut.yaVisto && !tut.yaVisto()) return;
    arrancado = true;
    arrancar();
  }
  document.addEventListener("eof:tutorial-cerrado", function () { setTimeout(intentar, 300); });
  function alCargar() { setTimeout(intentar, 1500); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", alCargar);
  else alCargar();

  window.EOF_PRIMERA_TAREA = {
    mostrar: function () { estado.oculta = false; estado.min = false; guardar(); arrancado = true; crear(); comprobar(true); }
  };
})();
