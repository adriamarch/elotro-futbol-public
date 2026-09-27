// ---------- Fotógrafo: pestañas ocultas y "Contenido" activa de
// entrada, SIN parpadeo ----------
// Este script va en <head>, ANTES de admin.css y de cualquier otro
// script (mismo motivo que ../js/tema.js con el tema oscuro): si el
// ocultamiento de pestañas y la activación de "Contenido" > "Subir
// contenido" se hace en admin.js, ese código solo se ejecuta después de
// que el navegador ya ha pintado el HTML de panel.html con "Noticias"
// como pestaña activa por defecto (ver panel.html), así que durante un
// instante se ven Noticias/Resultados/Solicitudes/Funcionalidades y la
// pestaña equivocada activa, antes de que admin.js las oculte y
// cambie la activa. Aquí se hace con CSS puro, inyectado antes de que
// el <body> se pinte, para que ese instante no llegue a existir.
//
// Solo actúa sobre el ROL (que no cambia entre sesiones salvo que un
// admin lo edite, en cuyo caso la sesión ya se refresca en el próximo
// login): el resto de personalización dependiente de datos del servidor
// (nivel de redactor, badges de pendientes, etc.) sigue haciéndose en
// admin.js como hasta ahora, porque esa sí necesita datos que aún no
// están disponibles en este punto tan temprano.
(function () {
  try {
    const user = JSON.parse(localStorage.getItem("eof_user") || "null");
    if (!user || user.rol !== "fotografo") return;

    const estilo = document.createElement("style");
    estilo.textContent = `
      /* Pestañas principales que un fotógrafo no usa (ver admin.js,
         mismo bloque "USER.rol === fotografo", que las oculta también
         por si este script no llegara a ejecutarse por algún motivo,
         p. ej. localStorage bloqueado). */
      .tabs button[data-tab="noticias"],
      .tabs button[data-tab="resultados"],
      #tabSolicitudes,
      #tabFuncionalidades{
        display:none !important;
      }
      /* "Noticias" viene marcada como activa en el HTML por defecto:
         se le quita el estilo de "activo" (mismo aspecto que admin.js
         deja luego al quitarle la clase) y se lo damos a "Contenido"
         en su lugar, con el mismo CSS que ya usa .tabs button.activo
         (ver admin.css) para que no haya un segundo salto de color
         cuando admin.js haga el cambio de clases "de verdad". */
      .tabs button[data-tab="noticias"].activo{
        color:inherit !important;border-color:transparent !important;background:transparent !important;
      }
      .tabs button[data-tab="noticias"].activo svg{ opacity:.75 !important; }
      /* OJO: el rojo de "activo" en el botón de Contenido, igual que el
         display:block del panel más abajo, tiene que depender de la
         clase "activo" del propio botón (".activo", no el selector
         suelto "#tabContenido") -- si no, el botón se queda pintado en
         rojo para siempre pase lo que pase, incluso después de cambiar a
         otra pestaña, porque !important sobre un selector sin condición
         no hay classList.remove() que lo gane. Como con "Contenido" pasa
         igual que con su panel (no trae la clase "activo" de fábrica en
         panel.html), se le añade aquí mismo en JS (ver más abajo), y
         cuando el usuario cambia de pestaña admin.js se la quita del
         botón (ver admin.js, bloque de tabs) con lo que este estilo deja
         de aplicar con total normalidad. */
      #tabContenido.activo{
        border-color:var(--rojo) !important;background:rgba(209,19,46,.06) !important;
      }
      #tabContenido.activo svg{ opacity:1 !important; }
      #panel-noticias.activo{ display:none !important; }
      /* "Contenido" (a diferencia de "Noticias") no trae la clase
         "activo" de fábrica en panel.html: se la añadimos aquí mismo, en
         el propio HTML, con un pequeño script inline colocado justo
         después de <body> (ver más abajo) -- NO con display:block
         !important fijo por CSS, que es lo que causaba el bug real: ese
         !important seguía pisando el panel de "Tienda" (o cualquier
         otro) incluso después de que admin.js le quitara la clase
         "activo" a "Contenido" al cambiar de pestaña, porque un
         !important en CSS gana siempre a un classList.remove() en JS,
         sin importar el orden ni el momento en que se ejecute cada uno.
         Añadiendo la clase "activo" en vez de forzar el display, el
         panel se comporta exactamente igual que cualquier otro panel
         normal (mismo CSS de admin.css, sin !important de por medio), y
         admin.js puede quitársela sin que nada se lo impida cuando el
         usuario cambia de pestaña de verdad. */
      #panel-contenido{ display:none; }
      #panel-contenido.activo{ display:block; }
      /* "Subir contenido" ya viene activa por defecto dentro de
         "Contenido" en el propio HTML (ver panel.html), así que ahí no
         hace falta nada más: con activar el panel "Contenido" de arriba
         ya se ve la pantalla correcta de entrada. */
    `;
    document.head.appendChild(estilo);

    // La clase "activo" de "#tabContenido" y "#panel-contenido" se añade
    // lo antes posible, en el propio <head>, en cuanto el <body> existe
    // -- sin esperar a DOMContentLoaded (que dispara demasiado tarde y
    // deja, aunque sea un instante, ambos sin ninguna clase "activo" y
    // por tanto sin el estilo de arriba). Como este script corre antes
    // que el resto de <body>, se reintenta con un observer hasta que los
    // nodos existan.
    const marcarActivo = () => {
      const boton = document.getElementById("tabContenido");
      const panel = document.getElementById("panel-contenido");
      if (boton) boton.classList.add("activo");
      if (panel) panel.classList.add("activo");
      return !!(boton && panel);
    };
    if (!marcarActivo()) {
      const observer = new MutationObserver(() => {
        if (marcarActivo()) observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  } catch (e) {
    // Sin localStorage disponible (modo privado estricto, etc.): se deja
    // el HTML tal cual viene por defecto, igual que hasta ahora.
  }
})();
