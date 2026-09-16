// ---------- Modo oscuro: aplicación inmediata (evita parpadeo) ----------
// Este script va en <head>, ANTES de style.css y de cualquier otro
// script, para que el atributo data-theme ya esté puesto en <html>
// cuando el navegador empieza a pintar la página: si se aplicara más
// tarde (p. ej. en layout.js, que corre en DOMContentLoaded) se vería
// un parpadeo del tema claro al oscuro nada más cargar, en quien tenga
// el oscuro activado.
//
// El modo por defecto es SIEMPRE claro, sin importar el modo del
// sistema operativo/navegador: el oscuro solo se activa si la persona
// lo elige a propósito con el botón de la cabecera (ver layout.js), y
// esa elección se recuerda en localStorage para las siguientes visitas.
(function () {
  try {
    if (localStorage.getItem("eof_tema") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (e) {
    // Sin localStorage disponible (modo privado estricto, etc.): se
    // queda en claro, que es el valor por defecto de las variables CSS.
  }
})();
