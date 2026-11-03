// ---------- Recordar dónde estabas en el panel al recargar ----------
// Guarda la pestaña principal y la subpestaña activa de cada bloque (Noticias > Lista,
// Funcionalidades > Comentarios > Aprobados, Ajustes > Resumen del mes…) en sessionStorage
// y, al cargar el panel, vuelve a pulsar esos mismos botones. No toca ningún manejador de
// admin.js: reutiliza los clics de siempre, así que cada pestaña carga sus datos como
// si la hubieras abierto tú.
//   · Es por usuario y por pestaña del navegador (sessionStorage): al cerrar la pestaña, se olvida.
//   · Si el enlace trae "?ir=" (avisos, emails, notificaciones push) manda el enlace, no lo guardado.
//   · Si la persona ya ha pulsado algo antes de restaurar, no se le cambia de pantalla.
//   · Una pestaña que su rol no puede ver (oculta con display:none) se ignora.
// Depende de globales de admin.js: USER. Va el último en panel.html.
(function () {
  "use strict";
  if (typeof USER === "undefined" || !USER) return;

  const CLAVE = "eof_panel_ubicacion_v1:" + (USER.id != null ? USER.id : USER.username || "");
  const leer = () => {
    try {
      const d = JSON.parse(sessionStorage.getItem(CLAVE) || "null");
      return d && typeof d === "object" ? d : null;
    } catch { return null; }
  };
  const guardar = (d) => { try { sessionStorage.setItem(CLAVE, JSON.stringify(d)); } catch { /* sin sessionStorage */ } };

  // Foto de lo guardado ANTES de registrar nada: otros scripts del panel pulsan pestañas al arrancar
  // (p. ej. el fotógrafo entra en "Contenido") y no deben pisar lo que la persona tenía abierto.
  const previo = leer();
  const actual = { tab: previo && previo.tab ? String(previo.tab) : "", subs: Object.assign({}, previo && previo.subs) };
  let interactuado = false;

  document.addEventListener("click", (ev) => {
    const el = ev.target && ev.target.closest ? ev.target : null;
    if (!el) return;
    const btnTab = el.closest(".tabs button[data-tab]");
    const btnSub = btnTab ? null : el.closest(".subtabs button[data-subtab]");
    if (!btnTab && !btnSub) return;
    if (ev.isTrusted) interactuado = true;
    if (btnTab) {
      actual.tab = btnTab.dataset.tab;
    } else {
      const bloque = btnSub.closest(".subtabs");
      if (!bloque || !bloque.id) return;
      actual.subs[bloque.id] = btnSub.dataset.subtab;
    }
    guardar(actual);
  }, true);

  if (new URLSearchParams(location.search).get("ir")) return;
  if (!previo || !previo.tab) return;

  const visible = (b) => !!b && b.style.display !== "none";
  // "Ajustes de cuenta" es una pestaña oculta a propósito (se abre desde el menú de cuenta).
  const abrible = (b, tab) => !!b && (tab === "ajustes" || visible(b));

  function restaurar() {
    if (interactuado) return true; // la persona ya se ha movido: no se le cambia nada
    const tab = previo.tab;
    const btnTab = document.querySelector('.tabs button[data-tab="' + tab + '"]');
    if (!abrible(btnTab, tab)) return false;
    if (!btnTab.classList.contains("activo")) btnTab.click();
    const panel = document.getElementById("panel-" + tab);
    if (panel && previo.subs) {
      // Orden del DOM: primero el bloque de subpestañas de este nivel y luego los anidados.
      panel.querySelectorAll(".subtabs[id]").forEach((bloque) => {
        const sub = previo.subs[bloque.id];
        if (!sub) return;
        const btn = bloque.querySelector('button[data-subtab="' + sub + '"]');
        if (btn && btn.style.display !== "none" && !btn.classList.contains("activo")) btn.click();
      });
    }
    return true;
  }

  // El rol/nivel puede llegar de forma asíncrona y ocultar o mostrar pestañas: se reintenta un rato.
  let intentos = 0;
  const arrancar = () => {
    if (restaurar()) return;
    const t = setInterval(() => {
      intentos++;
      if (restaurar() || intentos >= 20) clearInterval(t);
    }, 150);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar, { once: true });
  else arrancar();
})();
