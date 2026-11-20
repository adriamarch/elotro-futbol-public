// ---------- Usuarios: columna «Actividad» (evolución de cada persona de un vistazo) ----------
// Solo Responsables. Añade a la tabla de Usuarios (#tablaUsuarios, la pinta admin.js) una columna con:
// la evolución de publicaciones de los últimos 6 meses (mini gráfico), publicaciones totales, archivos subidos,
// actividad de los últimos 30 días y cuándo fue la última acción. Un clic abre «Gestionar» en la pestaña
// «Estadísticas» (o «Actividad»). No toca admin.js: observa la tabla y decora cada fila cuando se repinta.
// Datos: GET /api/users/estadisticas-resumen (una sola petición para todo el equipo, caché de 2 minutos).
(function () {
  "use strict";
  const num = (n) => Number(n || 0).toLocaleString("es-ES");
  const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const TTL = 2 * 60 * 1000;
  let datos = null;      // { t, d }
  let pidiendo = null;   // promesa en curso
  let observador = null;
  let tabla = null;

  const soyAdmin = () => typeof USER !== "undefined" && !!USER && USER.rol === "admin";
  const hace = (s) => (window.EOFEstadisticas && window.EOFEstadisticas.hace ? window.EOFEstadisticas.hace(s) : "");

  function sparkline(serie, meses) {
    const W = 120, H = 34, p = 3;
    const max = Math.max(1, ...serie);
    const paso = (W - p * 2) / serie.length;
    const ancho = Math.max(6, paso * 0.62);
    const barras = serie.map((v, i) => {
      const h = v > 0 ? Math.max(3, (v / max) * (H - p * 2)) : 2;
      const x = p + paso * i + (paso - ancho) / 2;
      const mes = meses && meses[i] ? `${MES_CORTO[Number(meses[i].slice(5, 7)) - 1]} ${meses[i].slice(0, 4)}` : "";
      return `<rect class="ue-b${v > 0 ? "" : " ue-b-vacia"}${i === serie.length - 1 ? " ue-b-actual" : ""}" x="${x.toFixed(1)}" y="${(H - p - h).toFixed(1)}" width="${ancho.toFixed(1)}" height="${h.toFixed(1)}" rx="2"><title>${mes}: ${num(v)}</title></rect>`;
    }).join("");
    const total = serie.reduce((s, v) => s + v, 0);
    return `<svg class="ue-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Publicaciones de los últimos ${serie.length} meses: ${num(total)}">${barras}</svg>`;
  }

  function celdaHTML(u, id, meses) {
    const serie = u.serie_publicaciones && u.serie_publicaciones.length ? u.serie_publicaciones : meses.map(() => 0);
    const actual = serie[serie.length - 1] || 0;
    const anterior = serie.length > 1 ? serie[serie.length - 2] : 0;
    const tend = actual > anterior ? "ue-sube" : actual < anterior ? "ue-baja" : "ue-igual";
    const flecha = actual > anterior ? "▲" : actual < anterior ? "▼" : "=";
    const ult = u.ultima_actividad ? hace(u.ultima_actividad) : "";
    const estado = u.dias_30d > 0 ? "ue-act" : "ue-sin";
    return `<div class="ue-celda">
      <div class="ue-graf">${sparkline(serie, meses)}<span class="ue-tend ${tend}" title="Publicaciones este mes (en curso): ${num(actual)} · mes anterior: ${num(anterior)}">${flecha} ${num(actual)}</span></div>
      <ul class="ue-datos">
        <li title="Publicaciones firmadas en total (autoría o coautoría)"><b>${num(u.publicaciones)}</b> pub.</li>
        <li title="Fotos y vídeos subidos en total"><b>${num(u.contenido)}</b> archivos</li>
        <li title="Visitas a lo que ha publicado en los últimos ${meses.length} meses"><b>${num(u.visitas_periodo)}</b> visitas</li>
      </ul>
      <p class="ue-act-txt ${estado}" title="Acciones registradas en el panel en los últimos 30 días">${u.dias_30d > 0 ? `<b>${num(u.dias_30d)}</b> ${u.dias_30d === 1 ? "día activo" : "días activos"} en 30 d` : "Sin actividad en 30 d"}${ult ? ` · <span>${ult}</span>` : ""}</p>
      <div class="ue-botones"><button type="button" class="ue-btn" data-ce="cargos" data-ce-user="${id}" data-ce-tab="estadisticas" aria-label="Ver estadísticas y evolución de esta persona">Estadísticas</button><button type="button" class="ue-btn ue-btn-sec" data-ce="cargos" data-ce-user="${id}" data-ce-tab="actividad" aria-label="Ver su actividad en el panel">Actividad</button></div>
    </div>`;
  }

  function idDeFila(tr) {
    const b = tr.querySelector("[data-ce-user]");
    return b ? String(b.dataset.ceUser) : "";
  }

  function asegurarCabecera() {
    const tr = tabla && tabla.querySelector("thead tr");
    if (!tr || tr.querySelector("th.ue-th")) return;
    const th = document.createElement("th");
    th.className = "ue-th";
    th.textContent = "Actividad";
    const ultimo = tr.lastElementChild;
    tr.insertBefore(th, ultimo);
  }

  function decorar() {
    if (!tabla || !soyAdmin()) return;
    asegurarCabecera();
    const cuerpo = tabla.tBodies[0];
    if (!cuerpo) return;
    const filas = [...cuerpo.rows].filter((tr) => !tr.classList.contains("fila-usuario-error") && idDeFila(tr));
    if (!filas.length) return;
    if (observador) observador.disconnect();
    try {
      for (const tr of filas) {
        const id = idDeFila(tr);
        let td = tr.querySelector("td.ue-td");
        if (!td) {
          td = document.createElement("td");
          td.className = "ue-td";
          td.setAttribute("data-label", "Actividad");
          tr.insertBefore(td, tr.lastElementChild);
        }
        const meses = datos && datos.d && datos.d.meses ? datos.d.meses : [];
        const u = datos && datos.d && datos.d.usuarios ? datos.d.usuarios[id] : null;
        if (!datos) td.innerHTML = `<div class="ue-celda ue-cargando" aria-busy="true"><i class="ue-esq"></i><i class="ue-esq ue-esq-corto"></i></div>`;
        else if (datos.error) td.innerHTML = `<div class="ue-celda"><span class="ue-error">Sin datos</span></div>`;
        else td.innerHTML = celdaHTML(u || { publicaciones: 0, serie_publicaciones: meses.map(() => 0), serie_contenido: [], contenido: 0, visitas_periodo: 0, dias_30d: 0, ultima_actividad: null }, id, meses);
      }
    } finally {
      if (observador && tabla.tBodies[0]) observador.observe(tabla.tBodies[0], { childList: true });
    }
  }

  async function cargar(forzar) {
    if (!soyAdmin() || typeof apiFetch !== "function") return;
    if (!forzar && datos && !datos.error && Date.now() - datos.t < TTL) return;
    if (pidiendo) return pidiendo;
    pidiendo = (async () => {
      try {
        const d = await apiFetch("/api/users/estadisticas-resumen");
        datos = { t: Date.now(), d };
      } catch {
        datos = { t: Date.now(), d: null, error: true };
      }
      pidiendo = null;
      decorar();
    })();
    return pidiendo;
  }

  function iniciar() {
    tabla = document.querySelector("table.tabla-usuarios");
    if (!tabla || !soyAdmin()) return;
    const cuerpo = tabla.tBodies[0] || document.getElementById("tablaUsuarios");
    if (!cuerpo) return;
    observador = new MutationObserver(() => {
      decorar();
      // Si la lista se repinta pasado el tiempo de caché (p. ej. tras guardar algo), se refrescan las cifras.
      if (!datos || Date.now() - datos.t >= TTL) cargar(true);
    });
    observador.observe(cuerpo, { childList: true });
    decorar();
    cargar(false);
    // Al volver a la pestaña Usuarios se renueva si la caché ha caducado.
    document.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest('[data-tab="redactores"], [data-subtab="redactores"]')) cargar(false);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
  window.EOFUsuariosEstadisticas = { recargar: () => cargar(true) };
})();
