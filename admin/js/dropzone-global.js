// ---------------------------------------------------------------------
// dropzone-global.js
// ---------------------------------------------------------------------
// Convierte AUTOMÁTICAMENTE cualquier zona de subida de imagen del panel
// (portada/galería de noticia, avatar de usuario, foto de encuesta,
// escudo del equipo "otro"...) en una zona donde también se puede
// arrastrar y soltar un archivo, sin tener que tocar cada sitio a mano.
//
// Cómo funciona, a grandes rasgos:
//   1. Un MutationObserver vigila todo el documento. Como estas cajas de
//      imagen se crean dinámicamente (cada foto de una noticia, cada
//      fila de una encuesta...), no basta con mirar el DOM una vez al
//      cargar la página: hay que detectar también las que aparecen
//      después.
//   2. Cada caja encontrada (ver SELECTOR_CAJAS más abajo) recibe los
//      listeners de arrastre (dragenter/dragover/dragleave/drop) una
//      sola vez (se marca con [data-dropzone-lista]).
//   3. Al soltar un archivo de imagen sobre la caja, en vez de reinventar
//      la subida, se le asigna el archivo al <input type="file"> que ya
//      existe dentro de esa caja y se dispara su evento "change": así
//      se reutiliza tal cual la lógica de subida (subirImagenSuelta,
//      validaciones, spinners...) que ya tiene cada sitio.
//
// No hace falta llamar a nada desde fuera: basta con incluir este script
// en la página (después de que exista document.body) para que quede
// activo en todo el panel.
// ---------------------------------------------------------------------

(function () {
  "use strict";

  // Cada caja de imagen del panel tiene una estructura distinta, pero
  // todas comparten un contenedor "visual" (lo que se agranda al
  // arrastrar) y, dentro, un <input type="file"> real al que asignarle
  // el archivo soltado. Aquí se listan todos los casos conocidos.
  //
  //   contenedor: selector del elemento que se convierte en dropzone
  //               (el que recibe el aro/overlay al arrastrar encima).
  //   input:      selector del <input type="file"> dentro de ese
  //               contenedor al que hay que asignar el archivo soltado.
  const CASOS = [
    // Fotos de noticia (portada + galería) y foto de perfil/avatar:
    // ambas usan la misma estructura .imagen-preview-wrap.
    { contenedor: ".imagen-preview-wrap", input: "input[type='file']" },
    // Escudo del equipo "otro" (no está en la lista) en Resultados:
    // el <input type="file"> va envuelto directamente en la etiqueta.
    { contenedor: ".label-escudo-otro", input: "input[type='file']" },
  ];

  const SELECTOR_CAJAS = CASOS.map((c) => c.contenedor).join(", ");

  // Tipos de archivo que tiene sentido soltar en estas cajas: todas son
  // de foto única, así que solo se acepta imagen (igual que el atributo
  // accept="image/*" de sus inputs).
  function esArchivoDeImagen(file) {
    return file && file.type && file.type.startsWith("image/");
  }

  // Contador de dragenter/dragleave por caja: al arrastrar sobre un
  // elemento con hijos (el overlay que se dibuja encima, el botón, la
  // miniatura...), el navegador dispara dragleave al pasar de un hijo a
  // otro aunque el ratón siga dentro de la caja. Contar entradas/salidas
  // evita que el efecto visual parpadee.
  const contadores = new WeakMap();

  function marcarArrastrando(caja, activo) {
    caja.classList.toggle("dropzone-activa", activo);
  }

  function asignarArchivoAInput(input, file) {
    // No se puede escribir directamente en input.files (es de solo
    // lectura), pero sí se puede construir un DataTransfer con el
    // archivo soltado y asignar su .files al input: para el navegador
    // (y para el propio input) es indistinguible de haberlo elegido a
    // mano en el selector de archivos del sistema.
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function conectarCaja(caja, config) {
    if (caja.dataset.dropzoneLista) return;
    caja.dataset.dropzoneLista = "1";
    contadores.set(caja, 0);

    caja.addEventListener("dragenter", (e) => {
      if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
      e.preventDefault();
      contadores.set(caja, (contadores.get(caja) || 0) + 1);
      marcarArrastrando(caja, true);
    });

    caja.addEventListener("dragover", (e) => {
      if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });

    caja.addEventListener("dragleave", (e) => {
      if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
      const restantes = Math.max(0, (contadores.get(caja) || 0) - 1);
      contadores.set(caja, restantes);
      if (restantes === 0) marcarArrastrando(caja, false);
    });

    caja.addEventListener("drop", (e) => {
      e.preventDefault();
      contadores.set(caja, 0);
      marcarArrastrando(caja, false);

      const archivos = Array.from(e.dataTransfer?.files || []);
      const imagen = archivos.find(esArchivoDeImagen);
      if (!imagen) {
        if (archivos.length && window.EOF?.toast) {
          EOF.toast("Solo se pueden soltar aquí archivos de imagen", "error");
        }
        return;
      }
      const input = caja.matches(config.input) ? caja : caja.querySelector(config.input);
      if (input) asignarArchivoAInput(input, imagen);
    });
  }

  function escanear(raiz) {
    if (!raiz.querySelectorAll) return;
    CASOS.forEach((config) => {
      const cajas = raiz.matches?.(config.contenedor) ? [raiz] : [];
      raiz.querySelectorAll(config.contenedor).forEach((c) => cajas.push(c));
      cajas.forEach((caja) => conectarCaja(caja, config));
    });
  }

  function iniciar() {
    escanear(document.body);

    const observador = new MutationObserver((mutaciones) => {
      for (const mut of mutaciones) {
        mut.addedNodes.forEach((nodo) => {
          if (nodo.nodeType === 1) escanear(nodo);
        });
      }
    });
    observador.observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) iniciar();
  else document.addEventListener("DOMContentLoaded", iniciar);
})();
