/* ==========================================================================
   FOCO DE IMAGEN — motor único para toda la web
   --------------------------------------------------------------------------
   El "foco" es el punto de una foto que NO se debe recortar nunca cuando la
   imagen se muestra dentro de un marco con otra proporción (tarjeta, hero,
   avatar redondo...). Se guarda como "X% Y%" (p. ej. "62% 30%").

   Antes cada página lo pintaba a su manera (object-position en línea, regex
   copiadas, valores sin validar dentro del atributo style...). Ahora todo pasa
   por aquí:

     EOF_FOCO.normalizar(v)     -> { x, y }       (siempre válido, 0-100)
     EOF_FOCO.texto(v)          -> "62% 30%"
     EOF_FOCO.estilo(v)         -> "--foco-x:62%;--foco-y:30%"  (seguro en style="")
     EOF_FOCO.attrs(v, clases)  -> ' class="foco-img ..." style="--foco-x:..."'
     EOF_FOCO.img({...})        -> <img> completo con foco, fallback y lazy
     EOF_FOCO.bg(v, clases)     -> atributos para fondos (avatares redondos)
     EOF_FOCO.deArticulo(a)     -> foco de la portada REAL del artículo
     EOF_FOCO.aplicar(el, v)    -> fija el foco en un elemento ya existente
     EOF_FOCO.alFallar(img)     -> restablece el foco al caer a default.jpg

   El CSS correspondiente está en css/foco.css (usa --foco-x / --foco-y).
   No depende de ningún otro script: se puede cargar el primero.
   ========================================================================== */
(function (global) {
  "use strict";

  var CENTRO = { x: 50, y: 50 };

  // Palabras clave CSS que se aceptan (las guardadas a mano o por herramientas
  // antiguas): "center", "top left"...
  var PALABRAS_X = { left: 0, center: 50, right: 100 };
  var PALABRAS_Y = { top: 0, center: 50, bottom: 100 };

  function limitar(n) {
    if (!isFinite(n)) return null;
    return Math.min(100, Math.max(0, n));
  }

  // Un decimal como máximo: suficiente precisión y valores cortos.
  function redondear(n) {
    return Math.round(n * 10) / 10;
  }

  function aNumero(token, palabras) {
    if (token == null) return null;
    var t = String(token).trim().toLowerCase();
    if (!t) return null;
    if (Object.prototype.hasOwnProperty.call(palabras, t)) return palabras[t];
    var m = t.match(/^(-?\d{1,3}(?:\.\d+)?)%?$/);
    if (!m) return null;
    return limitar(parseFloat(m[1]));
  }

  /**
   * Convierte cualquier cosa razonable en un foco válido {x, y}.
   * Acepta: "62% 30%", "62 30", "62.5% 30%", "center top", {x, y},
   * [x, y]. Cualquier valor raro o malicioso devuelve el centro.
   */
  function normalizar(valor, defecto) {
    var base = defecto || CENTRO;
    if (valor == null || valor === "") return { x: base.x, y: base.y };

    var x = null, y = null;

    if (typeof valor === "object") {
      if (Array.isArray(valor)) {
        x = aNumero(valor[0], PALABRAS_X);
        y = aNumero(valor[1], PALABRAS_Y);
      } else {
        x = aNumero(valor.x, PALABRAS_X);
        y = aNumero(valor.y, PALABRAS_Y);
      }
    } else {
      var partes = String(valor).trim().split(/\s+/);
      if (partes.length === 1) {
        // Un solo valor: solo "top"/"bottom" afectan a Y, el resto a X.
        var unico = partes[0].toLowerCase();
        if (unico === "top" || unico === "bottom") { x = 50; y = PALABRAS_Y[unico]; }
        else { x = aNumero(unico, PALABRAS_X); y = 50; }
      } else if (partes.length === 2) {
        var a = partes[0].toLowerCase(), b = partes[1].toLowerCase();
        // "top left" / "bottom right": el orden de las palabras clave puede venir invertido.
        if ((a === "top" || a === "bottom") && (b === "left" || b === "right" || b === "center")) {
          x = aNumero(b, PALABRAS_X); y = aNumero(a, PALABRAS_Y);
        } else {
          x = aNumero(a, PALABRAS_X); y = aNumero(b, PALABRAS_Y);
        }
      }
    }

    if (x == null || y == null) return { x: base.x, y: base.y };
    return { x: redondear(x), y: redondear(y) };
  }

  function texto(valor, defecto) {
    var f = normalizar(valor, defecto);
    return f.x + "% " + f.y + "%";
  }

  // Siempre numérico => es seguro dentro de un atributo style="".
  function estilo(valor, defecto) {
    var f = normalizar(valor, defecto);
    return "--foco-x:" + f.x + "%;--foco-y:" + f.y + "%";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function claseSegura(c) {
    return String(c || "").replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
  }

  /**
   * Atributos listos para insertar en una etiqueta HTML (<img>, <div>...).
   * El foco se omite si es el centro: así el HTML queda más corto y el CSS
   * aplica su valor por defecto.
   */
  function attrs(valor, clases) {
    var f = normalizar(valor);
    var cl = ("foco-img " + claseSegura(clases)).trim();
    var st = (f.x === 50 && f.y === 50) ? "" : ' style="' + estilo(f) + '"';
    return ' class="' + cl + '"' + st;
  }

  /**
   * Para elementos con background-image (avatares redondos, etc.).
   * Devuelve class + style con el foco; la URL va aparte porque la
   * valida cada página con su propio saneador (urlSeguraParaCss).
   */
  function bg(valor, clases, estiloExtra) {
    var f = normalizar(valor);
    var cl = ("foco-bg " + claseSegura(clases)).trim();
    var st = estilo(f) + (estiloExtra ? ";" + estiloExtra : "");
    return ' class="' + cl + '" style="' + st + '"';
  }

  /**
   * <img> completo con foco, carga diferida y fallback.
   * opciones: { src, alt, foco, clases, lazy, eager, fallback, ancho, alto, extra }
   *  - fallback: URL a la que caer si falla la carga (por defecto img/default.jpg);
   *    "oculto" => se oculta la imagen; "" => sin gestión de error.
   */
  function img(o) {
    o = o || {};
    var lazy = o.eager ? "" : ' loading="lazy"';
    var prio = o.eager ? ' fetchpriority="high"' : "";
    var fb = o.fallback == null ? "img/default.jpg" : o.fallback;
    var onerror = "";
    if (fb === "oculto") onerror = ' onerror="this.style.display=\'none\'"';
    else if (fb) onerror = ' onerror="EOF_FOCO.alFallar(this,\'' + esc(fb).replace(/'/g, "") + '\')"';
    return "<img src=\"" + esc(o.src) + "\" alt=\"" + esc(o.alt) + "\"" +
      attrs(o.foco, o.clases) + lazy + prio + ' decoding="async"' +
      (o.ancho ? ' width="' + (parseInt(o.ancho, 10) || 0) + '"' : "") +
      (o.alto ? ' height="' + (parseInt(o.alto, 10) || 0) + '"' : "") +
      onerror + (o.extra ? " " + o.extra : "") + ">";
  }

  // Fija el foco sobre un elemento ya existente (por ejemplo al cambiar de
  // foto en la galería). Usa las mismas variables que el CSS.
  function aplicar(el, valor) {
    if (!el || !el.style) return;
    var f = normalizar(valor);
    el.style.setProperty("--foco-x", f.x + "%");
    el.style.setProperty("--foco-y", f.y + "%");
  }

  // Si la foto falla y se sustituye por la imagen por defecto, el foco de la
  // foto rota no tiene sentido para la nueva: se vuelve al centro.
  function alFallar(imagen, alternativa) {
    if (!imagen) return;
    imagen.onerror = null; // evita bucles si la alternativa también falla
    aplicar(imagen, null);
    imagen.src = alternativa || "img/default.jpg";
  }

  function mismaImagen(a, b) {
    function n(u) {
      if (typeof u !== "string") return "";
      var s = u.trim();
      try { s = decodeURIComponent(s); } catch (e) { /* se deja como está */ }
      return s.toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    }
    return !!a && !!b && n(a) === n(b);
  }

  function leerImagenes(a) {
    if (!a || !a.imagenes) return [];
    try {
      var arr = typeof a.imagenes === "string" ? JSON.parse(a.imagenes) : a.imagenes;
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Foco de la portada REAL de un artículo.
   * El servidor ya manda "imagen_foco" cuando la portada es imagen_url, pero
   * cuando la portada sale de un collage (imagen_url vacío) ese valor describe
   * otra foto distinta. Aquí se busca la foto que realmente se está mostrando.
   * Devuelve { url, foco }.
   */
  function portadaDeArticulo(a) {
    if (!a) return { url: "", foco: "50% 50%" };
    if (a.imagen_url) return { url: a.imagen_url, foco: texto(a.imagen_foco) };

    var fotos = leerImagenes(a);
    var delCollage = null;
    for (var i = 0; i < fotos.length; i++) {
      var f = fotos[i];
      if (f && typeof f === "object" && f.grupo && f.url) { delCollage = f; break; }
    }
    if (delCollage) return { url: delCollage.url, foco: texto(delCollage.foco) };
    return { url: "", foco: "50% 50%" };
  }

  function deArticulo(a) {
    return portadaDeArticulo(a).foco;
  }

  global.EOF_FOCO = {
    CENTRO: CENTRO,
    normalizar: normalizar,
    texto: texto,
    estilo: estilo,
    attrs: attrs,
    bg: bg,
    img: img,
    aplicar: aplicar,
    alFallar: alFallar,
    mismaImagen: mismaImagen,
    portadaDeArticulo: portadaDeArticulo,
    deArticulo: deArticulo
  };
})(typeof window !== "undefined" ? window : globalThis);
