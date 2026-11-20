/* ==========================================================================
   Aviso de «noticia actualizada» (noticia.html).

   Mientras el lector tiene una noticia abierta, se consulta cada poco una
   «huella» ligera (GET /api/articles/:slug/version: id + slug + updated_at,
   una sola fila, sin cuerpo). Si la huella cambia, es que la redacción ha
   editado la noticia: se muestra un aviso discreto con el botón «Actualizar».
   Nunca se cambia el texto por debajo del lector sin que él lo decida.

   Uso desde noticia.html:
     EOFAvisoActualizacion.vigilar(article, { alActualizar: async () => {...} });
   ========================================================================== */
(function () {
  "use strict";

  const INTERVALO_MS = 45000;       // consulta periódica con la pestaña a la vista
  const MIN_ENTRE_CONSULTAS_MS = 10000; // al volver a la pestaña no se consulta más de una vez cada 10 s
  const TIMEOUT_MS = 6000;

  let estado = null;

  function huellaDeArticulo(article) {
    return article && article.id != null && article.slug
      ? `${article.id}|${article.slug}|${article.updated_at || ""}`
      : "";
  }

  async function consultarHuella(clave) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    try {
      const res = await apiFetch(`/api/articles/${encodeURIComponent(clave)}/version`, ctrl ? { signal: ctrl.signal } : {});
      if (!res.ok) return null; // 404 (despublicada), 5xx o corte de red: se ignora y se reintenta
      const data = await res.json().catch(() => null);
      return data && typeof data.huella === "string" ? data.huella : null;
    } catch (_) {
      return null;
    } finally {
      if (t) clearTimeout(t);
    }
  }

  function quitarAviso() {
    const el = document.getElementById("eofAvisoActualizacion");
    if (el) el.remove();
  }

  function mostrarAviso(texto, { accion = true } = {}) {
    quitarAviso();
    const el = document.createElement("div");
    el.id = "eofAvisoActualizacion";
    el.className = "eof-aviso-act" + (accion ? "" : " eof-aviso-act--ok");
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    const msg = document.createElement("span");
    msg.className = "eof-aviso-act__texto";
    msg.textContent = texto;
    el.appendChild(msg);
    if (accion) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "eof-aviso-act__btn";
      btn.textContent = "Actualizar";
      btn.addEventListener("click", aplicarActualizacion);
      const cerrar = document.createElement("button");
      cerrar.type = "button";
      cerrar.className = "eof-aviso-act__cerrar";
      cerrar.setAttribute("aria-label", "Cerrar aviso");
      cerrar.textContent = "×";
      cerrar.addEventListener("click", () => {
        // Se recuerda la huella descartada: solo vuelve a avisar si hay OTRO cambio posterior.
        if (estado) estado.descartada = estado.pendiente;
        quitarAviso();
      });
      el.appendChild(btn);
      el.appendChild(cerrar);
    } else {
      setTimeout(quitarAviso, 3500);
    }
    document.body.appendChild(el);
  }

  async function aplicarActualizacion() {
    if (!estado) return;
    const btn = document.querySelector("#eofAvisoActualizacion .eof-aviso-act__btn");
    if (btn) { btn.disabled = true; btn.textContent = "Actualizando…"; }
    const nueva = estado.pendiente;
    try {
      if (typeof estado.alActualizar !== "function") throw new Error("sin callback");
      await estado.alActualizar();
      estado.base = nueva;
      estado.pendiente = null;
      estado.descartada = null;
      mostrarAviso("Noticia actualizada", { accion: false });
    } catch (_) {
      location.reload(); // si el refresco en caliente falla, la recarga completa siempre sirve
    }
  }

  async function comprobar() {
    if (!estado || estado.comprobando) return;
    if (document.visibilityState === "hidden") return;
    estado.comprobando = true;
    estado.ultima = Date.now();
    try {
      const huella = await consultarHuella(estado.clave);
      if (!huella) return;
      if (estado.base === null) {
        // Primera consulta: es la referencia. Si lo que hay publicado ya difiere del artículo que se
        // pintó (se editó entre la carga y ahora), se avisa directamente.
        estado.base = huella;
        if (estado.huellaOriginal && huella !== estado.huellaOriginal) {
          estado.pendiente = huella;
          mostrarAviso("Esta noticia se ha actualizado.");
        }
        return;
      }
      if (huella !== estado.base && huella !== estado.descartada) {
        estado.pendiente = huella;
        mostrarAviso("Esta noticia se ha actualizado.");
      }
    } finally {
      estado.comprobando = false;
    }
  }

  function alCambiarVisibilidad() {
    if (!estado || document.visibilityState !== "visible") return;
    if (Date.now() - estado.ultima >= MIN_ENTRE_CONSULTAS_MS) comprobar();
  }

  function detener() {
    if (!estado) return;
    clearInterval(estado.timer);
    document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    quitarAviso();
    estado = null;
  }

  function vigilar(article, opciones) {
    detener();
    if (!article || !article.slug || article.id == null) return;
    estado = {
      clave: article.slug,
      base: null,
      pendiente: null,
      descartada: null,
      ultima: 0,
      comprobando: false,
      huellaOriginal: huellaDeArticulo(article),
      alActualizar: opciones && opciones.alActualizar,
      timer: setInterval(comprobar, INTERVALO_MS),
    };
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    // Primera consulta algo después de pintar, para no competir con la carga de la noticia.
    setTimeout(comprobar, 8000);
  }

  window.EOFAvisoActualizacion = { vigilar, detener };
})();
