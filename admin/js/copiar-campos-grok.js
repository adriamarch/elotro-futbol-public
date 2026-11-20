/* =====================================================================
   COPIAR CAMPOS GROK (editor de noticias del panel)
   Botón #btnCopiarGrok (junto a "Previsualizar"), solo para redactores de
   Nivel 4 y admins mientras revisan una noticia que ya existe. Copia al
   portapapeles, en HTML, el titular (<h1>), el subtítulo (<h2>) y el cuerpo
   tal y como están AHORA en el editor. Estilos: css/copiar-campos-grok.css
   ===================================================================== */
(function () {
  "use strict";

  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function nivelActual() {
    try {
      if (typeof nivelUsuarioConectado === "function") return nivelUsuarioConectado();
    } catch {}
    try {
      const u = JSON.parse(localStorage.getItem("eof_user") || "null");
      return u && u.rol === "admin" ? 4 : (u && u.nivel) || 1;
    } catch { return 1; }
  }

  function idNoticiaEnEdicion() {
    const v = document.getElementById("articleId")?.value;
    return v ? parseInt(v, 10) : null;
  }

  // Solo Nivel 4 (los admins cuentan como 4) y solo con una noticia ya existente abierta.
  function actualizarBoton() {
    const btn = document.getElementById("btnCopiarGrok");
    if (!btn) return;
    btn.style.display = idNoticiaEnEdicion() && nivelActual() >= 4 ? "inline-flex" : "none";
  }

  function construirHtml() {
    const titulo = (document.getElementById("titulo")?.value || "").trim();
    const subtitulo = (document.getElementById("subtitulo")?.value || "").trim();
    const editor = document.getElementById("contenidoEditor");
    let cuerpo = editor ? editor.innerHTML : "";
    if (typeof sanearHtmlContenido === "function") cuerpo = sanearHtmlContenido(cuerpo);
    cuerpo = String(cuerpo || "").trim();
    return [
      `<h1>${esc(titulo)}</h1>`,
      subtitulo ? `<h2>${esc(subtitulo)}</h2>` : "",
      cuerpo,
    ].filter(Boolean).join("\n");
  }

  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Respaldo para navegadores/contextos sin la API moderna del portapapeles.
      try {
        const ta = document.createElement("textarea");
        ta.value = texto;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:-1000px;opacity:0;";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch { return false; }
    }
  }

  const avisar = (m, tipo) => { try { EOF.toast(m, tipo); } catch {} };
  let temporizador = null;

  async function copiar(btn) {
    const html = construirHtml();
    const etiqueta = btn.querySelector(".cg-texto");
    const ok = await copiarTexto(html);
    clearTimeout(temporizador);
    btn.classList.toggle("cg-ok", ok);
    btn.classList.toggle("cg-error", !ok);
    if (etiqueta) etiqueta.textContent = ok ? "¡Copiado!" : "No se pudo copiar";
    avisar(ok ? "Título, subtítulo y cuerpo copiados en HTML." : "No se ha podido copiar al portapapeles.", ok ? "exito" : "error");
    temporizador = setTimeout(() => {
      btn.classList.remove("cg-ok", "cg-error");
      if (etiqueta) etiqueta.textContent = "Copiar campos grok";
    }, 2200);
  }

  // Se engancha a la función que el panel ya llama al abrir/cerrar la edición de una noticia.
  const previa = window.actualizarBotonHistorialVersiones;
  window.actualizarBotonHistorialVersiones = function () {
    if (typeof previa === "function") previa.apply(this, arguments);
    actualizarBoton();
  };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#btnCopiarGrok");
    if (btn) copiar(btn);
  });
  document.addEventListener("DOMContentLoaded", actualizarBoton);
})();
