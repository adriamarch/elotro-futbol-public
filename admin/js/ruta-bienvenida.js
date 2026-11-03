// ---------- Ruta de bienvenida (14 días) ----------
// Checklist visible en la parte alta del panel para colaboradores nuevos (redactores y fotógrafos; los
// admins no la ven): 5 hitos pequeños, el último es el ascenso de nivel. Los datos los calcula el backend
// (GET /api/me/ruta-bienvenida); aquí solo se pintan, se lleva a la persona al sitio de cada hito y se
// celebra cada hito nuevo. El tutorial solo existe en el navegador: al verse/cerrarse se avisa con
// POST /api/me/ruta-bienvenida/tutorial.
//   · Visible durante los 14 días desde el primer acceso; si se completa, queda un mensaje final que se
//     puede cerrar. Pasados los 14 días sin completarla, desaparece.
//   · Se puede minimizar (barra con el progreso). El estado se guarda por usuario en localStorage.
//   · Pocas llamadas: al entrar, cada 4 min mientras haya hitos pendientes y al volver a la pestaña (máx. 1 cada 90 s).
// Depende de globales de admin.js: USER, apiFetch, eofIrASeccion, irAAjustesCuenta. Usa EOF_TUTORIAL (tutorial.js) y EOF.toast.
(function () {
  "use strict";
  if (typeof USER === "undefined" || !USER || USER.rol === "admin") return;
  const uid = USER.id || USER.username || "anon";
  const K_MIN = "eof_ruta_min_" + uid;       // minimizada
  const K_FIN = "eof_ruta_fin_" + uid;       // mensaje final cerrado
  const K_VISTOS = "eof_ruta_vistos_" + uid; // hitos ya celebrados
  const RECHEQUEO_MS = 4 * 60 * 1000;
  const MIN_ENTRE_COMPROBACIONES_MS = 90 * 1000;
  const sinMovimiento = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin storage */ } };
  const quitarKey = (k) => { try { localStorage.removeItem(k); } catch { /* sin storage */ } };
  const toast = (m, t) => { try { window.EOF && EOF.toast && EOF.toast(m, t || "info", 5000); } catch { /* sin toast */ } };

  const ICO = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    ruta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>',
    flecha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    min: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  };

  let datos = null;
  let nuevosIds = new Set();   // hitos conseguidos en esta carga (para la animación)
  let ultima = 0;
  let cargando = false;

  function montar() {
    let el = document.getElementById("rutaBienvenida");
    if (el) return el;
    const tabs = document.querySelector(".wrap > .tabs");
    if (!tabs || !tabs.parentNode) return null;
    el = document.createElement("section");
    el.id = "rutaBienvenida";
    el.className = "rb";
    el.setAttribute("aria-label", "Ruta de bienvenida");
    tabs.parentNode.insertBefore(el, tabs);
    el.addEventListener("click", alPulsar);
    return el;
  }

  function visible(d) {
    if (!d || !d.aplica) return false;
    if (d.completa) return leer(K_FIN) !== "1";
    return !d.caducada;
  }

  function pintar() {
    const el = montar();
    if (!el) return;
    if (!visible(datos)) { el.remove(); return; }
    const d = datos;
    const min = leer(K_MIN) === "1" && !d.completa;
    const pct = Math.round((d.hechos / d.total) * 100);
    const titulo = d.completa ? "¡Ruta de bienvenida completada!" : "Tu ruta de bienvenida";
    const sub = d.completa
      ? "Has recorrido todos los pasos. Gracias por sumarte: ahora ya eres parte del equipo."
      : (d.dias_restantes <= 1 ? "Hoy es el último día de la ruta" : `Día ${Math.min(d.dia, d.dias_total)} de ${d.dias_total} · te quedan ${d.dias_restantes} días`);
    const items = d.hitos.map((h, i) => {
      const actual = h.id === d.siguiente;
      const clases = ["rb-item", h.hecho ? "hecho" : "", actual ? "actual" : "", nuevosIds.has(h.id) ? "rb-nuevo" : ""].filter(Boolean).join(" ");
      const cta = !h.hecho && actual
        ? `<button type="button" class="rb-cta" data-rb="ir" data-id="${esc(h.id)}">${h.ir === "tutorial" ? "Ver tutorial" : "Ir ahora"}${ICO.flecha}</button>` : "";
      const accesoLibre = !h.hecho && !actual
        ? `<button type="button" class="rb-link" data-rb="ir" data-id="${esc(h.id)}">Ir</button>` : "";
      return `<li class="${clases}" style="--i:${i}">
        <span class="rb-marca" aria-hidden="true">${h.hecho ? ICO.check : `<b>${i + 1}</b>`}</span>
        <span class="rb-txt"><strong>${esc(h.titulo)}</strong><small>${esc(h.descripcion)}</small></span>
        <span class="rb-acc">${cta}${accesoLibre}${h.hecho ? '<span class="rb-ok">Hecho</span>' : ""}</span>
      </li>`;
    }).join("");
    el.className = "rb" + (d.completa ? " rb-completa" : "") + (min ? " rb-min" : "");
    el.innerHTML = `
      <header class="rb-cab">
        <span class="rb-ico" aria-hidden="true">${ICO.ruta}</span>
        <div class="rb-cab-txt"><h3>${esc(titulo)}</h3><p>${esc(sub)}</p></div>
        <span class="rb-cuenta" aria-label="${d.hechos} de ${d.total} hitos"><b>${d.hechos}</b>/${d.total}</span>
        ${d.completa
          ? `<button type="button" class="rb-btn" data-rb="cerrar" aria-label="Cerrar">${ICO.cerrar}</button>`
          : `<button type="button" class="rb-btn rb-btn-min" data-rb="min" aria-expanded="${min ? "false" : "true"}" aria-label="${min ? "Mostrar la ruta" : "Minimizar la ruta"}">${ICO.min}</button>`}
      </header>
      <div class="rb-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="rb-relleno" style="width:${pct}%"></div></div>
      <ol class="rb-lista"${min ? " hidden" : ""}>${items}</ol>`;
    nuevosIds = new Set(); // la animación solo en este pintado
  }

  function celebrar(d) {
    const vistos = leer(K_VISTOS);
    const hechos = d.hitos.filter((h) => h.hecho).map((h) => h.id);
    if (vistos === null) { guardar(K_VISTOS, JSON.stringify(hechos)); return; } // primera vez: sin toasts por lo ya hecho
    let previos = [];
    try { previos = JSON.parse(vistos) || []; } catch { previos = []; }
    const nuevos = d.hitos.filter((h) => h.hecho && !previos.includes(h.id));
    if (!nuevos.length) return;
    guardar(K_VISTOS, JSON.stringify(hechos));
    nuevos.forEach((h) => nuevosIds.add(h.id));
    if (d.completa) toast("🎉 ¡Has completado tu ruta de bienvenida!", "exito");
    else toast(`✅ ¡Hito conseguido! ${nuevos.map((h) => h.titulo).join(" · ")} (${d.hechos}/${d.total})`, "exito");
    if (!sinMovimiento() && navigator.vibrate) { try { navigator.vibrate(30); } catch { /* nada */ } }
  }

  async function comprobar(forzar) {
    if (cargando) return;
    if (!forzar && Date.now() - ultima < MIN_ENTRE_COMPROBACIONES_MS) return;
    cargando = true;
    try {
      const d = await apiFetch("/api/me/ruta-bienvenida");
      ultima = Date.now();
      if (d && d.aplica) {
        datos = d;
        if (d.completa === false) quitarKey(K_FIN);
        celebrar(d);
      } else datos = d || null;
      pintar();
    } catch { /* la ruta es un extra: si falla, el panel sigue igual */ }
    cargando = false;
  }

  async function avisarTutorial() {
    try {
      await apiFetch("/api/me/ruta-bienvenida/tutorial", { method: "POST", body: JSON.stringify({}) });
      await comprobar(true);
    } catch { /* se reintentará en la siguiente carga */ }
  }

  function ir(id) {
    const h = datos && datos.hitos.find((x) => x.id === id);
    if (!h) return;
    try {
      if (h.ir === "tutorial") { if (window.EOF_TUTORIAL) EOF_TUTORIAL.iniciar(); return; }
      if (h.ir === "ajustes.perfil") { irAAjustesCuenta("perfil"); return; }
      if (h.ir === "ajustes.progreso") { irAAjustesCuenta("progreso"); return; }
      eofIrASeccion(h.ir, new URLSearchParams());
    } catch { /* si el destino no existe, no pasa nada */ }
  }

  function alPulsar(ev) {
    const b = ev.target.closest("[data-rb]");
    if (!b) return;
    const acc = b.dataset.rb;
    if (acc === "ir") ir(b.dataset.id);
    else if (acc === "min") { guardar(K_MIN, leer(K_MIN) === "1" ? "0" : "1"); pintar(); }
    else if (acc === "cerrar") { guardar(K_FIN, "1"); pintar(); }
  }

  function iniciar() {
    // Tutorial: si ya se vio en este navegador (o se cierra ahora), se anota en el servidor.
    document.addEventListener("eof:tutorial-cerrado", () => { avisarTutorial(); });
    setTimeout(async () => {
      await comprobar(true);
      try {
        const t = window.EOF_TUTORIAL;
        if (datos && datos.aplica && t && t.yaVisto && t.yaVisto() && !t.estaActivo() && datos.hitos.some((h) => h.id === "tutorial" && !h.hecho)) avisarTutorial();
      } catch { /* nada */ }
    }, 1800);
    setInterval(() => { if (document.visibilityState === "visible" && datos && datos.aplica && !datos.completa && !datos.caducada) comprobar(false); }, RECHEQUEO_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && datos && datos.aplica && !datos.completa && !datos.caducada) comprobar(false);
    });
    document.addEventListener("eof:ruta-refrescar", () => comprobar(true));
  }
  window.EOF_RUTA = { refrescar: () => comprobar(true) };
  iniciar();
})();
