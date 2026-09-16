/* ======================================================================
   CORRECTOR Y LIMPIADOR DE FORMATO AUTOMÁTICO — solo reglas regex, sin IA.
   ======================================================================

   Qué hace:
   - Limpia el HTML "sucio" que llega al pegar desde Word/Google Docs/webs
     (spans vacíos, estilos inline, clases de MS Word, comentarios
     condicionales, <o:p>, etiquetas <font>, atributos style="", etc).
   - Corrige errores tipográficos y de formato típicos de una crónica de
     fútbol escrita rápido: espacios dobles, espacios antes de los signos
     de puntuación, comillas rectas -> comillas españolas «», apóstrofos
     rectos -> tipográficos, puntos suspensivos sueltos -> …, guiones
     simples usados como raya -> raya (—), minutos de partido mal
     escritos (90 min, 45+2', min.90) normalizados a "90'", resultados
     tipo "2-1" o "2 - 1" normalizados a "2-1", mayúscula tras punto,
     etc.
   - NO usa IA ni llamadas a servidor: todo son expresiones regulares
     sobre el HTML/texto que ya está en el editor. Es determinista y
     rapidísimo.

   Cómo se usa:
   - corregirFormatoHTML(html) -> devuelve el html corregido (string).
   - aplicarCorrectorAlEditor(elementoEditor) -> aplica las reglas
     directamente sobre un elemento contenteditable, intentando
     conservar la posición del cursor si el editor tiene el foco.

   Se engancha en dos sitios de admin.js:
   1) Un botón nuevo en la barra de herramientas del editor
      (data-accion="corregir-formato") para pasarlo a mano.
   2) Automáticamente justo antes de guardar cuando la noticia se marca
      como "terminada" o se publica (no cuando se guarda "en proceso",
      para no molestar mientras el redactor todavía está escribiendo).
   ====================================================================== */

(function (global) {
  "use strict";

  /* ---------------------------------------------------------------------
     1) LIMPIEZA DE HTML "SUCIO" (pegado desde Word / Docs / webs)
     --------------------------------------------------------------------- */

  function limpiarHTMLPegado(html) {
    let h = html;

    // Comentarios condicionales de Word (<!--[if ...]>...<![endif]-->)
    h = h.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "");
    // Comentarios HTML normales
    h = h.replace(/<!--[\s\S]*?-->/g, "");

    // Bloques <style> y <script> completos (nunca deberían quedar en una noticia)
    h = h.replace(/<style[\s\S]*?<\/style>/gi, "");
    h = h.replace(/<script[\s\S]*?<\/script>/gi, "");

    // Etiquetas propias de Word: <o:p>, <w:...>, <m:...>, <v:...>
    h = h.replace(/<\/?o:p[^>]*>/gi, "");
    h = h.replace(/<\/?[a-z]+:[a-z0-9]+[^>]*>/gi, "");

    // <font ...>texto</font> -> texto (quitamos la etiqueta, dejamos el contenido)
    h = h.replace(/<\/?font[^>]*>/gi, "");

    // Atributos que no queremos conservar en una noticia (estilos inline,
    // clases de Word "MsoNormal" etc., lang, id de Word, fuente y tamaño, etc.)
    // NOTA: quitamos "style" por completo en dos pasadas, con y sin comillas
    // dobles/simples, para que no sobreviva ningún font-family/font-size/
    // color inline pegado desde Word/Docs/Excel.
    h = h.replace(/\sstyle\s*=\s*"[^"]*"/gi, "");
    h = h.replace(/\sstyle\s*=\s*'[^']*'/gi, "");
    h = h.replace(/\sclass="Mso[^"]*"/gi, "");
    h = h.replace(/\slang="[^"]*"/gi, "");
    h = h.replace(/\salign="[^"]*"/gi, "");
    h = h.replace(/\svalign="[^"]*"/gi, "");
    h = h.replace(/\sface="[^"]*"/gi, "");
    h = h.replace(/\ssize="[^"]*"/gi, "");
    h = h.replace(/\scolor="[^"]*"/gi, "");
    h = h.replace(/\sdir="[^"]*"/gi, "");
    h = h.replace(/\sv:shapes="[^"]*"/gi, "");

    // <span> vacíos o que ya no tienen atributos tras la limpieza anterior:
    // los quitamos pero conservando su contenido.
    h = h.replace(/<span[^>]*>(\s*)<\/span>/gi, "$1");
    // Repetimos varias veces porque quitar un span puede dejar a otro vacío alrededor
    for (let i = 0; i < 3; i++) {
      h = h.replace(/<span>([\s\S]*?)<\/span>/gi, "$1");
    }

    // Párrafos y bloques totalmente vacíos (incluye los que solo tienen
    // &nbsp; o <br> dentro), típicos de pegar desde Word.
    h = h.replace(/<p[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "");
    h = h.replace(/<div[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/div>/gi, "");

    // <b><\/b>, <i><\/i>, <u><\/u> vacíos sueltos
    h = h.replace(/<(b|i|u|strong|em)>\s*<\/\1>/gi, "");

    // <br> repetidos varias veces seguidas -> como mucho uno
    h = h.replace(/(<br\s*\/?>\s*){2,}/gi, "<br>");

    // Atributos "class" vacíos (class="")
    h = h.replace(/\sclass=""/gi, "");

    // Etiquetas <div> sueltas de Word -> las convertimos en párrafos
    h = h.replace(/<div([^>]*)>/gi, "<p$1>").replace(/<\/div>/gi, "</p>");

    // Múltiples espacios en blanco entre etiquetas
    h = h.replace(/>\s{2,}</g, "> <");

    return h.trim();
  }

  /* ---------------------------------------------------------------------
     1b) TÍTULOS -> siempre <h3> (sin fuente ni tamaño), y texto suelto
         -> envuelto en <p>
     --------------------------------------------------------------------- */

  // Cualquier encabezado h1, h2, h4, h5, h6 se normaliza a h3, conservando
  // el contenido pero sin arrastrar atributos (ya se limpiaron style/class
  // sueltos, pero por seguridad quitamos cualquier atributo restante).
  function normalizarTitulosAH3(html) {
    let h = html;
    h = h.replace(/<h[1-6][^>]*>/gi, "<h3>");
    h = h.replace(/<\/h[1-6]>/gi, "</h3>");
    return h;
  }

  // Envuelve en <p> cualquier texto (o contenido inline) que quede suelto
  // directamente dentro del editor, fuera de un bloque (p, h3, li, blockquote,
  // ul, ol, table, div contenedor). Esto pasa típicamente cuando se pega
  // texto plano o cuando quedan <br> sueltos entre bloques.
  function envolverTextoSueltoEnParrafos(html) {
    // Trabajamos con un contenedor temporal en el DOM para detectar con
    // fiabilidad qué nodos están "sueltos" a nivel raíz.
    const contenedor = document.createElement("div");
    contenedor.innerHTML = html;

    const ETIQUETAS_BLOQUE = new Set([
      "P", "H1", "H2", "H3", "H4", "H5", "H6",
      "UL", "OL", "LI", "BLOCKQUOTE", "TABLE",
      "FIGURE", "IFRAME", "HR", "PRE",
    ]);

    const nodos = Array.from(contenedor.childNodes);
    let grupoActual = null;

    function esVacio(nodo) {
      return (
        nodo.nodeType === Node.TEXT_NODE && nodo.textContent.trim() === ""
      ) || (nodo.nodeType === Node.ELEMENT_NODE && nodo.tagName === "BR");
    }

    nodos.forEach((nodo) => {
      const esBloque =
        nodo.nodeType === Node.ELEMENT_NODE && ETIQUETAS_BLOQUE.has(nodo.tagName);

      if (esBloque) {
        grupoActual = null;
        return;
      }

      if (esVacio(nodo)) {
        // Un <br> o texto en blanco entre bloques no crea párrafo nuevo,
        // pero si ya hay un grupo abierto lo cierra (se usa como separador).
        if (grupoActual) grupoActual = null;
        nodo.remove();
        return;
      }

      // Es texto o una etiqueta inline (strong, em, a, span, b, i...) suelta
      // a nivel raíz: la metemos dentro de un <p>.
      if (!grupoActual) {
        grupoActual = document.createElement("p");
        contenedor.insertBefore(grupoActual, nodo);
      }
      grupoActual.appendChild(nodo);
    });

    return contenedor.innerHTML;
  }

  /* ---------------------------------------------------------------------
     2) CORRECCIÓN TIPOGRÁFICA Y DE ESTILO (sobre el texto, respetando
        las etiquetas HTML: solo tocamos lo que hay ENTRE etiquetas)
     --------------------------------------------------------------------- */

  // Aplica una función de reemplazo solo sobre los nodos de texto de un
  // fragmento HTML, dejando las etiquetas intactas. Evita, por ejemplo,
  // corromper un href="...".
  function aplicarSoloATexto(html, transformador) {
    // Partimos el HTML en trozos de "etiqueta" y "texto" alternados.
    return html.replace(/(<[^>]+>)|([^<]+)/g, (match, etiqueta, texto) => {
      if (etiqueta) return etiqueta;
      return transformador(texto);
    });
  }

  // URLs, dominios (www.ejemplo.com) y correos electrónicos: los
  // sustituimos por un marcador temporal antes de tocar nada, para que
  // ninguna regla de puntuación (sobre todo la del punto seguido) los
  // rompa en "frases" ni les meta mayúsculas. Se restauran al final.
  function protegerUrlsYCorreos(texto) {
    const protegidos = [];
    const patronUrl = /\b((?:https?:\/\/|www\.)[^\s<>"']+|[a-z0-9.+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
    const t = texto.replace(patronUrl, (m) => {
      protegidos.push(m);
      return `\u0000${protegidos.length - 1}\u0000`;
    });
    return { texto: t, protegidos };
  }

  function restaurarUrlsYCorreos(texto, protegidos) {
    return texto.replace(/\u0000(\d+)\u0000/g, (m, i) => protegidos[Number(i)]);
  }

  function corregirTipografia(texto) {
    const { texto: textoProtegido, protegidos } = protegerUrlsYCorreos(texto);
    let t = textoProtegido;

    // --- Espacios ---
    // Espacios/tabulaciones múltiples -> un solo espacio (pero no tocamos saltos de línea del código fuente)
    t = t.replace(/[ \t]{2,}/g, " ");
    // Espacio antes de , . ; : ! ? -> se quita
    t = t.replace(/\s+([,.;:!?])/g, "$1");
    // Signo de apertura ¿ ¡ pegado a la palabra siguiente sin espacio previo se deja,
    // pero si hay espacio DESPUÉS de ¿ o ¡ (antes de la palabra) se quita
    t = t.replace(/([¿¡])\s+/g, "$1");
    // Falta de espacio después de un signo de puntuación de cierre
    // ( , . ; : ! ? … ) cuando le sigue directamente otro carácter que
    // no es espacio (letra, dígito, otro signo, etc.) -> se añade un
    // espacio. Esto es una regla general: "signo de puntuación, siempre
    // un espacio después". Se excluyen los casos de número.número
    // (decimales tipo 3.5) y las elipsis dobles ya normalizadas.
    t = t.replace(/([,;:!?])(?=\S)/g, "$1 ");
    // El punto es un caso especial: no debe separar decimales (3.5),
    // abreviaturas con más puntos seguidos, ni la propia elipsis "…".
    t = t.replace(/(\.)(?=[^\s\d.…])/g, "$1 ");
    // NOTA: aquí NO se recortan los espacios al principio/final del
    // fragmento. Esta función se aplica por separado a cada trozo de
    // texto entre etiquetas (aplicarSoloATexto): un espacio al borde de
    // un fragmento suele ser el espacio real entre una palabra y una
    // etiqueta inline vecina (<strong>, <em>, <a>...), por ejemplo en
    // "el equipo <strong>ganó</strong> el partido". Quitarlo aquí pegaba
    // las palabras a la negrita/cursiva/enlace. El recorte de espacios
    // en los bordes del documento se hace aparte, una sola vez, sobre el
    // HTML completo ya reconstruido (ver recortarEspaciosDeBloques).

    // --- Puntos suspensivos ---
    // ".." o "...." o más -> "…" (tres puntos exactos, sin espacio antes)
    t = t.replace(/\s*\.{2,}/g, "…");

    // --- Comillas rectas -> comillas españolas « » ---
    // Solo cuando parecen delimitar una cita (par de comillas rectas balanceado).
    // Se hace DESPUÉS de las reglas de espacio tras puntuación (arriba), para
    // que esa regla no añada un espacio entre el punto final de la cita y la
    // comilla de cierre (p.ej. evitar «...resultado. »).
    t = t.replace(/"([^"]*)"/g, "«$1»");
    // Comillas simples usadas como comillas de cita -> tipográficas ‘ ’
    t = t.replace(/'([^']*)'/g, "‘$1’");
    // Quita cualquier espacio que haya quedado justo antes de una comilla
    // de cierre (« », ' ') por culpa de otras reglas.
    t = t.replace(/\s+([»’])/g, "$1");

    // --- Guiones usados como raya en diálogos o incisos ---
    // Un guion simple "-" al principio de línea (diálogo), con o sin espacio
    // tras él, seguido de una letra -> raya "—" + espacio
    t = t.replace(/(^|\n)-[ \t]*(?=[A-ZÁÉÍÓÚÑa-záéíóúñ¿¡])/g, "$1— ");
    // " - " en medio de frase como inciso (con espacios claros a ambos lados
    // y no es un rango numérico ni un resultado) -> raya larga
    t = t.replace(/([a-záéíóúñ,])\s-\s(?=[A-ZÁÉÍÓÚÑa-z])/g, "$1 — ");
    // Guion que cierra un inciso de diálogo, precedido de espacio y
    // pegado directamente a la palabra siguiente en minúscula
    // ("...contento -dijo el entrenador") -> raya "—dijo"
    t = t.replace(/ -(?=[a-záéíóúñ])/g, " —");

    // --- Minutos de partido: normaliza solo las abreviaturas ambiguas
    // "90 min", "min 90", "min.90" -> "90'". Importante: NO tocamos la
    // palabra completa "minuto/minutos" escrita de forma natural (p.ej.
    // "en el minuto 90" o "en los primeros minutos"), porque eso cambia
    // el sentido de la frase en vez de solo corregir el formato; solo
    // normalizamos la abreviatura "min"/"mins".
    t = t.replace(/\bmins?\.?\s*(\d{1,3})(\+\d{1,2})?\b/gi, (m, min, extra) => `${min}${extra || ""}'`);
    t = t.replace(/\b(\d{1,3})(\+\d{1,2})?\s*mins?\.?\b/gi, (m, min, extra) => `${min}${extra || ""}'`);
    // "90 '" con espacio antes de la comilla de minuto -> "90'"
    t = t.replace(/(\d{1,3}(?:\+\d{1,2})?)\s+'/g, "$1'");
    // Comilla recta ' tras un número usada como símbolo de minuto -> se deja tal cual (ya es el signo correcto),
    // pero si se usó el acento agudo ´ o el backtick ` como minuto, se corrige a '
    t = t.replace(/(\d{1,3}(?:\+\d{1,2})?)[´`]/g, "$1'");

    // --- Resultados de partidos: "2 - 1", "2- 1", "2 -1" -> "2-1" ---
    t = t.replace(/\b(\d{1,2})\s*-\s*(\d{1,2})\b/g, "$1-$2");

    // --- Mayúscula después de punto seguido, interrogación o exclamación de cierre ---
    t = t.replace(/([.?!…])\s+([a-záéíóúñ])/g, (m, signo, letra) => `${signo} ${letra.toUpperCase()}`);

    // --- Primera letra de cada bloque de texto en mayúscula si empieza frase ---
    // (se aplica con cuidado más abajo, a nivel de párrafo, no aquí)

    // Restauramos las URLs/correos protegidos al principio, intactos.
    t = restaurarUrlsYCorreos(t, protegidos);

    return t;
  }

  // Pone en mayúscula la primera letra de cada párrafo (si empieza en minúscula),
  // trabajando directamente sobre el HTML para detectar el inicio de <p>, <li>, etc.
  function mayusculaInicialDeParrafos(html) {
    return html.replace(
      /(<(?:p|li|h[1-6]|blockquote)[^>]*>)(\s*)([a-záéíóúñ])/gi,
      (m, apertura, espacio, letra) => apertura + espacio + letra.toUpperCase()
    );
  }

  // Quita espacios en blanco sobrantes justo dentro de las etiquetas de bloque
  function recortarEspaciosDeBloques(html) {
    let h = html;
    h = h.replace(/(<(?:p|li|h[1-6]|blockquote)[^>]*>)\s+/gi, "$1");
    h = h.replace(/\s+(<\/(?:p|li|h[1-6]|blockquote)>)/gi, "$1");
    return h;
  }

  /* ---------------------------------------------------------------------
     3) FUNCIÓN PRINCIPAL: corrige un HTML completo de noticia
     --------------------------------------------------------------------- */

  function corregirFormatoHTML(htmlOriginal) {
    if (!htmlOriginal) return htmlOriginal;

    let html = htmlOriginal;

    // Paso 1: limpiar HTML sucio (Word, spans vacíos, párrafos vacíos,
    // fuente/tamaño/estilos inline...)
    html = limpiarHTMLPegado(html);

    // Paso 2: cualquier título (h1, h2, h4, h5, h6) pasa a ser h3
    html = normalizarTitulosAH3(html);

    // Paso 3: texto o inline suelto fuera de un bloque -> envuelto en <p>
    html = envolverTextoSueltoEnParrafos(html);

    // Paso 4: corregir tipografía solo en los nodos de texto (incluye
    // "signo de puntuación, siempre un espacio después")
    html = aplicarSoloATexto(html, corregirTipografia);

    // Paso 5: mayúscula inicial de cada párrafo/bloque
    html = mayusculaInicialDeParrafos(html);

    // Paso 6: recortar espacios sobrantes pegados a las etiquetas de bloque
    html = recortarEspaciosDeBloques(html);

    // Paso 7: una segunda pasada de limpieza por si los pasos anteriores
    // dejaron algún <b></b> o <p></p> vacío
    html = limpiarHTMLPegado(html);

    return html;
  }

  /* ---------------------------------------------------------------------
     4) APLICAR SOBRE UN ELEMENTO CONTENTEDITABLE, intentando conservar
        el cursor si el editor tenía el foco.
     --------------------------------------------------------------------- */

  function aplicarCorrectorAlEditor(editor) {
    if (!editor) return { cambiado: false };

    const antes = editor.innerHTML;
    const despues = corregirFormatoHTML(antes);

    if (antes === despues) {
      return { cambiado: false };
    }

    editor.innerHTML = despues;

    // Colocamos el cursor al final del contenido (forma simple y segura
    // de no dejar el editor en un estado raro tras reescribir el HTML).
    try {
      const seleccion = window.getSelection();
      const rango = document.createRange();
      rango.selectNodeContents(editor);
      rango.collapse(false);
      seleccion.removeAllRanges();
      seleccion.addRange(rango);
    } catch (e) {
      // Si algo falla al mover el cursor no pasa nada grave: el contenido
      // ya se ha corregido igualmente.
    }

    return { cambiado: true };
  }

  // Exponemos las funciones para usarlas desde admin.js
  global.CorrectorFormato = {
    corregirFormatoHTML,
    aplicarCorrectorAlEditor,
  };
})(window);
