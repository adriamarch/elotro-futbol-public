/* ============================================================
   Retos de la semana — partidos sin cubrir que cualquiera puede reclamar.

   Tarjeta plegable bajo las pestañas de Resultados con una lista corta:
     · «Rescatar»: partidos que el cron cerró solo porque nadie pulsó «Fin
       del partido» (FINALIZADO NO CUBIERTO). Botón: confirmar el marcador y
       escribir la crónica. Al guardar, el propio PUT limpia el aviso y el
       reto se marca como cumplido.
     · «Próximo»: partidos de los próximos días que solo existen por el
       relleno automático. Botón: abrir el Minuto a minuto.
   «Lo cubro yo» avisa al resto de la redacción (no es un permiso: cualquiera
   puede editar cualquier partido). Máximo 2 reclamados por persona; caducan solos.

   Backend: GET /api/retos-semana, POST /api/retos-semana/reclamar|soltar
   (worker y worker-secondary). Depende de globales de admin.js: USER, apiFetch,
   RESULTADOS_CACHE, cargaListaResultados, confirmarResultadoSinCubrir,
   abrirPanelMinutoAMinuto. Estilos: css/retos-semana.css
   ============================================================ */
(function () {
  "use strict";

  function usuario() {
    try { if (typeof USER !== "undefined" && USER) return USER; } catch (e) {}
    try { return JSON.parse(localStorage.getItem("eof_user") || "null"); } catch (e) { return null; }
  }
  const u = usuario();
  // Los retos son de redacción: fotógrafos fuera (el servidor también lo impide).
  if (!u || (u.rol !== "redactor" && u.rol !== "admin")) return;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg, tipo) {
    try { if (window.EOF && EOF.toast) { EOF.toast(msg, tipo); return; } } catch (e) {}
  }

  const COMPETICIONES = {
    hypermotion: "Hypermotion", primera_federacion: "Primera Fed.", segunda_federacion: "Segunda Fed.",
    tercera_federacion: "Tercera Fed.", copa_del_rey: "Copa del Rey", copa_federacion: "Copa Federación", amistoso: "Amistoso"
  };
  function cuando(s) {
    const d = new Date(String(s || "").replace(" ", "T"));
    if (isNaN(d.getTime())) return "Fecha por confirmar";
    const dia = d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
    const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return dia.charAt(0).toUpperCase() + dia.slice(1) + (hora === "00:00" ? "" : " · " + hora);
  }

  let datos = null;       // última respuesta del servidor
  let el = null;
  let ocupado = false;

  // ---------- Montaje ----------
  function montar() {
    const panel = document.getElementById("panel-resultados");
    const barra = document.getElementById("subtabsResultados");
    if (!panel || !barra) return false;
    if (el && document.contains(el)) return true;
    el = document.createElement("details");
    el.className = "rs-card";
    el.id = "retosSemana";
    el.hidden = true;
    el.addEventListener("click", alClic);
    barra.insertAdjacentElement("afterend", el);
    return true;
  }

  // ---------- Pintado ----------
  function itemHTML(r) {
    const mio = r.reclamado_por && r.reclamado_por.mio;
    const ajeno = r.reclamado_por && !r.reclamado_por.mio;
    const rescatar = r.tipo === "rescatar";
    const comp = COMPETICIONES[r.competicion] || r.competicion || "";
    let h = '<li class="rs-item' + (mio ? " rs-mio" : "") + (ajeno ? " rs-ajeno" : "") + '" data-id="' + r.resultado_id + '">' +
      '<div class="rs-fila"><span class="rs-tipo ' + (rescatar ? "rs-rescatar" : "rs-proximo") + '">' +
      (rescatar ? "🟠 Rescatar" : "🔜 Próximo") + "</span>" +
      (r.de_tu_club ? '<span class="rs-club">Tu club</span>' : "") + "</div>" +
      '<div class="rs-partido">' + esc(r.equipo_local) + " – " + esc(r.equipo_visitante) + "</div>" +
      '<div class="rs-meta">' + esc([comp, r.jornada ? "J" + r.jornada : "", cuando(r.fecha_partido)].filter(Boolean).join(" · ")) + "</div>";
    if (ajeno) {
      h += '<div class="rs-ayuda">👤 Lo lleva <strong>' + esc(r.reclamado_por.nombre || "otra persona") + "</strong>.</div>";
    } else if (mio) {
      h += '<div class="rs-ayuda">' + (rescatar
        ? "Es tuyo. Confirma el marcador y escribe la crónica."
        : "Es tuyo. Cuando empiece, síguelo en el minuto a minuto.") + "</div>" +
        '<div class="rs-botones">' +
        (rescatar
          ? '<button type="button" class="rs-btn rs-btn-pri" data-rs="confirmar">Confirmar resultado</button>' +
            '<button type="button" class="rs-btn" data-rs="cronica">Escribir crónica</button>'
          : '<button type="button" class="rs-btn rs-btn-pri" data-rs="mam">Minuto a minuto</button>') +
        '<button type="button" class="rs-btn rs-btn-suave" data-rs="soltar">Soltar</button></div>';
    } else {
      h += '<div class="rs-ayuda">' + (rescatar
        ? "Terminó sin que nadie lo cubriera. Aún se puede rescatar."
        : "Nadie lo va a seguir en directo todavía.") + "</div>" +
        '<div class="rs-botones"><button type="button" class="rs-btn rs-btn-pri" data-rs="reclamar">Lo cubro yo</button></div>';
    }
    return h + "</li>";
  }

  function pintar() {
    if (!montar() || !datos) return;
    const retos = datos.retos || [];
    const cumplidos = datos.cumplidos || [];
    if (!retos.length && !cumplidos.length) { el.hidden = true; return; }
    const libres = retos.filter(function (r) { return !r.reclamado_por; }).length;
    const abierto = el.open;
    el.hidden = false;
    el.innerHTML =
      '<summary><span aria-hidden="true">🏁</span> Retos de la semana' +
      '<span class="rs-cuenta">' + (libres ? libres + (libres === 1 ? " libre" : " libres") : "al día") + "</span></summary>" +
      '<p class="rs-intro">Partidos que nadie está cubriendo. Reclama uno y avisas al resto de que lo llevas tú ' +
      "(máximo " + datos.max_reclamos + " a la vez).</p>" +
      (cumplidos.length
        ? '<ul class="rs-cumplidos">' + cumplidos.map(function (c) {
            return "<li>✅ ¡Hecho! " + esc(c.equipo_local) + " – " + esc(c.equipo_visitante) + " ya está cubierto.</li>";
          }).join("") + "</ul>"
        : "") +
      (retos.length ? '<ul class="rs-lista">' + retos.map(itemHTML).join("") + "</ul>"
        : '<p class="rs-vacio">No queda ningún partido sin cubrir. 🎉</p>') +
      '<button type="button" class="rs-enlace" data-rs="ver-todos">Ver todos los sin cubrir en la tabla</button>';
    // La primera vez se abre sola si hay algo libre; después se respeta lo que haga la persona.
    el.open = primeraVez ? (libres > 0 || retos.some(function (r) { return r.reclamado_por && r.reclamado_por.mio; })) : abierto;
    primeraVez = false;
  }
  let primeraVez = true;

  // ---------- Datos ----------
  async function cargar() {
    if (ocupado) return;
    ocupado = true;
    try { datos = await apiFetch("/api/retos-semana"); if (datos && datos.retos) pintar(); }
    catch (e) { /* sin red o sin permiso: la tarjeta simplemente no aparece */ }
    finally { ocupado = false; }
  }

  async function enviar(accion, id) {
    try {
      const d = await apiFetch("/api/retos-semana/" + accion, { method: "POST", body: JSON.stringify({ resultado_id: id }) });
      if (d && d.error) throw new Error(d.error);
      datos = d; pintar();
      if (accion === "reclamar") toast("Reto reclamado. ¡Gracias por cubrirlo!", "exito");
    } catch (err) {
      toast(err.message || "No se pudo completar la acción", "error");
      cargar();
    }
  }

  // ---------- Acciones ----------
  function irA(tab, sub) {
    const b = document.querySelector('.tabs button[data-tab="' + tab + '"]');
    if (b && !b.classList.contains("activo")) b.click();
    if (!sub) return;
    setTimeout(function () {
      const p = document.getElementById("panel-" + tab);
      const s = p && p.querySelector('.subtabs button[data-subtab="' + sub + '"]');
      if (s && !s.classList.contains("activo")) s.click();
    }, 160);
  }

  async function confirmar(id) {
    try {
      if (typeof RESULTADOS_CACHE === "undefined" || !RESULTADOS_CACHE[id]) {
        if (typeof cargaListaResultados === "function") await cargaListaResultados();
      }
      const r = typeof RESULTADOS_CACHE !== "undefined" ? RESULTADOS_CACHE[id] : null;
      if (r && typeof confirmarResultadoSinCubrir === "function") {
        await confirmarResultadoSinCubrir(r);
        cargar();
        return;
      }
    } catch (e) { /* se cae al listado */ }
    verTodos();
  }

  function verTodos() {
    irA("resultados", "listaResultados");
    setTimeout(function () {
      const f = document.getElementById("filtroSoloSinCubrirResultados");
      let activo = false;
      try { activo = typeof filtroSoloSinCubrirResultadosActivo !== "undefined" && filtroSoloSinCubrirResultadosActivo; } catch (e) {}
      if (f && !activo) f.click();
    }, 400);
  }

  function alClic(e) {
    const b = e.target.closest("[data-rs]");
    if (!b) return;
    const li = b.closest(".rs-item");
    const id = li ? Number(li.getAttribute("data-id")) : null;
    switch (b.getAttribute("data-rs")) {
      case "reclamar": enviar("reclamar", id); break;
      case "soltar": enviar("soltar", id); break;
      case "confirmar": confirmar(id); break;
      case "cronica": irA("noticias", "nueva"); break;
      case "mam":
        try { abrirPanelMinutoAMinuto(id); } catch (err) { verTodos(); }
        break;
      case "ver-todos": verTodos(); break;
    }
  }

  // ---------- Arranque ----------
  function arrancar() {
    let intentos = 0;
    const t = setInterval(function () {
      intentos++;
      if (montar() || intentos > 40) { clearInterval(t); if (el) cargar(); }
    }, 250);
    window.addEventListener("focus", cargar);
    setInterval(function () { if (document.visibilityState === "visible") cargar(); }, 90000);
    // Al volver a la pestaña Resultados se refresca (por si alguien ha cubierto algo mientras tanto).
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest('.tabs button[data-tab="resultados"]')) setTimeout(cargar, 200);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();

  window.EOF_RETOS = { recargar: cargar };
})();
