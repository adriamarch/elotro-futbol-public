// ---------- Fotógrafo: pestañas ocultas desde el primer pintado, SIN parpadeo ----------
// Este script va en <head>, ANTES de admin.css y de cualquier otro script (mismo motivo que
// ../js/tema.js con el tema oscuro): si el ocultamiento de pestañas se hiciera solo en admin.js,
// durante un instante se verían Noticias/Resultados/Solicitudes/Funcionalidades antes de que
// admin.js las oculte. Aquí se hace con CSS puro, inyectado antes de que el <body> se pinte.
//
// Antes este script también activaba «Contenido» > «Subir contenido» para el fotógrafo. Ya no hace
// falta: TODAS las personas del equipo (fotógrafos incluidos) aterrizan en la pestaña «Inicio», un
// resumen con lo importante y sus estadísticas (ver inicio-resumen.js), y desde ahí van a subir fotos.
//
// Solo actúa sobre el ROL (que no cambia entre sesiones salvo que un admin lo edite, en cuyo caso
// la sesión ya se refresca en el próximo login): el resto de personalización dependiente de datos
// del servidor (nivel de redactor, badges de pendientes, etc.) sigue haciéndose en admin.js.
(function () {
  try {
    const user = JSON.parse(localStorage.getItem("eof_user") || "null");
    if (!user || user.rol !== "fotografo") return;
    const estilo = document.createElement("style");
    estilo.textContent = `
      /* Pestañas principales que un fotógrafo no usa (admin.js las oculta también, por si este
         script no llegara a ejecutarse, p. ej. localStorage bloqueado). */
      .tabs button[data-tab="noticias"],
      .tabs button[data-tab="resultados"],
      #tabSolicitudes,
      #tabFuncionalidades{
        display:none !important;
      }
    `;
    document.head.appendChild(estilo);
  } catch (e) {
    // Sin localStorage disponible (modo privado estricto, etc.): se deja el HTML tal cual viene.
  }
})();
