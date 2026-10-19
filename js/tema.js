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
// lo elige a propósito (botón de la cabecera o panel de Preferencias),
// y esa elección se recuerda en localStorage ("eof_tema") para las
// siguientes visitas. Valores guardados: "light" | "dark" | "auto".
// "auto" (solo desde Preferencias) sigue el modo del dispositivo y se
// actualiza sola si este cambia.
//
// Expone window.EOFTema { leer, fijar, aplicar, efectivo }, que usa
// js/preferencias.js para dibujar la fila "Tema" y para restablecer.
//
// Fijamos explícitamente el "color-scheme" del documento ("light" o
// "dark"). Sin esto, algunos navegadores móviles (el "forzar tema
// oscuro" de Chrome/Android, Samsung Internet, etc.) detectan que la
// web no declara su esquema de color y reescriben ellos mismos fondos
// y textos para oscurecerla "a la fuerza" -- lo que puede dejar fondo
// y texto casi del mismo tono oscuro (todo se ve negro/ilegible).
(function () {
  "use strict";

  var CLAVE = "eof_tema";
  var mq = null;
  try {
    mq = window.matchMedia("(prefers-color-scheme: dark)");
  } catch (e) {
    // Sin matchMedia: "auto" se comporta como claro.
  }

  function leer() {
    try {
      var v = localStorage.getItem(CLAVE);
      if (v === "dark" || v === "auto") return v;
    } catch (e) {
      // Sin localStorage (modo privado estricto, etc.): se queda en
      // claro, que es el valor por defecto de las variables CSS.
    }
    return "light";
  }

  // Tema que realmente se ve ("light" | "dark"), resolviendo "auto".
  function efectivo(modo) {
    if (modo === "auto") return mq && mq.matches ? "dark" : "light";
    return modo === "dark" ? "dark" : "light";
  }

  function aplicar(modo) {
    var h = document.documentElement;
    if (efectivo(modo) === "dark") {
      h.setAttribute("data-theme", "dark");
      h.style.colorScheme = "dark";
    } else {
      h.removeAttribute("data-theme");
      h.style.colorScheme = "light";
    }
  }

  // Guarda y aplica. Cualquier valor desconocido cuenta como "light".
  function fijar(modo) {
    if (modo !== "dark" && modo !== "auto") modo = "light";
    try {
      localStorage.setItem(CLAVE, modo);
    } catch (e) {
      // Se aplica en esta página aunque no se pueda recordar.
    }
    aplicar(modo);
  }

  aplicar(leer());

  // "Automático": si el dispositivo cambia de claro a oscuro (o al
  // revés) con la página abierta, la web lo sigue.
  if (mq) {
    var alCambiar = function () {
      if (leer() === "auto") aplicar("auto");
    };
    if (mq.addEventListener) mq.addEventListener("change", alCambiar);
    else if (mq.addListener) mq.addListener(alCambiar);
  }

  // Si el tema se cambia en otra pestaña, esta se actualiza sola.
  window.addEventListener("storage", function (e) {
    if (e.key === CLAVE || e.key === null) aplicar(leer());
  });

  window.EOFTema = { leer: leer, fijar: fijar, aplicar: aplicar, efectivo: efectivo };
})();
