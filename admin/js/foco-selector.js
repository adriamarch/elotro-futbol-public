/* ==========================================================================
   SELECTOR DE FOCO ÚNICO DEL PANEL
   --------------------------------------------------------------------------
   Una sola ventana para elegir el "foco" de cualquier foto del panel (fotos de
   la noticia, foto de perfil, portada de vídeo, mediateca y noticias rápidas).

   El foco es el punto de la foto que NO se debe recortar nunca ("62% 30%").
   La ventana muestra la foto grande con un punto que se arrastra, y UNA sola
   vista previa de cómo queda recortada (con pestañas para cambiar de formato).

   Dos modos:
     - Normal  (botón "Foco"):  se puede cancelar.
     - Forzado (al poner una foto nueva): no se puede cerrar sin elegir. Hay que
       marcar el punto (o pulsar "Centrar") y guardar, o quitar la foto.

   Uso básico (lo que usa admin.js):
     var sel = EOF_FOCO_SELECTOR.montar({
       boton: botonFoco,                   // opcional: abre la ventana
       obtenerUrl: function () { ... },    // URL de la foto
       obtenerValor: function () { ... },  // foco actual ("62% 30%")
       fijarValor: function (v) { ... },   // el llamador lo guarda donde quiera
       alQuitar: function () { ... },      // opcional: "Quitar foto" en modo forzado
       proporciones: ["16x9", "1x1"],      // formatos de la vista previa
       texto: "Explicación corta"          // opcional
     });
     sel.exigirSiNueva();   // forzado si la URL no es la que ya se encuadró
     sel.exigir();          // forzado siempre
     sel.abrir();           // normal (cancelable)

   Uso suelto (fotos que aún no se han subido):
     EOF_FOCO_SELECTOR.pedir({ url, valor, forzado: true, permitirQuitar: true,
                               contador: { n: 2, total: 5 } })
       .then(function (r) { r === null | { valor: "62% 30%" } | { quitar: true } });

   Valida todo con EOF_FOCO (js/foco.js), el mismo motor que usa la web pública.
   ========================================================================== */
(function (global) {
  "use strict";

  var FORMATOS = {
    "16x9":    { etiqueta: "Tarjeta",  ratio: "16 / 9", ancho: 280 },
    "1x1":     { etiqueta: "Cuadrada", ratio: "1 / 1",  ancho: 190 },
    "4x5":     { etiqueta: "Vertical", ratio: "4 / 5",  ancho: 170 },
    "circulo": { etiqueta: "Avatar",   ratio: "1 / 1",  ancho: 150, redondo: true }
  };

  var TEXTO_POR_DEFECTO =
    "La foto se recorta según dónde se muestre (portada, tarjetas, perfil). " +
    "Haz clic o arrastra para marcar lo que no se debe cortar nunca: una cara, el balón, el escudo.";

  var contadorIds = 0;
  var ui = null;
  var cola = Promise.resolve();
  var sesion = null; // sesión abierta ahora mismo (solo hay una)

  function limitar(n) { return Math.min(100, Math.max(0, n)); }

  function normalizar(v) {
    if (global.EOF_FOCO) return global.EOF_FOCO.normalizar(v);
    return { x: 50, y: 50 };
  }

  function comoTexto(p) {
    if (global.EOF_FOCO) return global.EOF_FOCO.texto(p);
    return Math.round(p.x) + "% " + Math.round(p.y) + "%";
  }

  function crear(tag, clase, texto) {
    var el = document.createElement(tag);
    if (clase) el.className = clase;
    if (texto != null) el.textContent = texto;
    return el;
  }

  function anadir(padre) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) padre.appendChild(arguments[i]);
    return padre;
  }

  /* ---------- Construcción de la ventana (una sola vez) ---------- */
  function construir() {
    var idTitulo = "fsel-titulo-" + (++contadorIds);

    var ov = crear("div", "fsel-overlay");
    ov.hidden = true;
    var modal = crear("div", "fsel-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", idTitulo);

    // Cabecera
    var kicker = crear("span", "fsel-kicker");
    var titulo = crear("h2", "fsel-titulo");
    titulo.id = idTitulo;
    var texto = crear("p", "fsel-texto");
    var btnCerrar = crear("button", "fsel-cerrar", "\u00D7");
    btnCerrar.type = "button";
    btnCerrar.setAttribute("aria-label", "Cerrar sin guardar");
    var cab = anadir(crear("header", "fsel-cab"), anadir(crear("div", "fsel-cab-texto"), kicker, titulo, texto), btnCerrar);

    // Foto grande con el punto
    var img = crear("img", "fsel-img");
    img.alt = "";
    img.draggable = false;
    var marcador = crear("span", "fsel-marcador");
    marcador.setAttribute("aria-hidden", "true");
    var marco = anadir(crear("div", "fsel-marco"), img, marcador);
    marco.tabIndex = 0;
    marco.setAttribute("role", "group");
    marco.setAttribute("aria-label", "Foto. Haz clic o arrastra para marcar el punto importante; con el teclado, usa las flechas (Mayús para ir más rápido) o Inicio para centrar.");
    var aviso = crear("div", "fsel-aviso");
    var pista = crear("div", "fsel-pista", "Haz clic o arrastra sobre la foto");
    var escenario = anadir(crear("div", "fsel-escenario"), marco, aviso, pista);

    // Vista previa única con pestañas de formato
    var etiqueta = crear("p", "fsel-etiqueta", "Así se verá");
    var tabs = crear("div", "fsel-tabs");
    tabs.setAttribute("role", "tablist");
    var imgPrevia = crear("img");
    imgPrevia.alt = "";
    var previa = anadir(crear("div", "fsel-previa"), imgPrevia);
    var valor = crear("p", "fsel-valor");
    var lado = anadir(crear("aside", "fsel-lado"), etiqueta, tabs, anadir(crear("div", "fsel-previa-caja"), previa), valor);

    // Pie
    var btnQuitar = crear("button", "fsel-btn fsel-btn-texto", "Quitar foto");
    btnQuitar.type = "button";
    var btnCancelar = crear("button", "fsel-btn fsel-btn-sec", "Cancelar");
    btnCancelar.type = "button";
    var btnCentrar = crear("button", "fsel-btn fsel-btn-sec", "Centrar");
    btnCentrar.type = "button";
    var btnGuardar = crear("button", "fsel-btn fsel-btn-pri", "Guardar encuadre");
    btnGuardar.type = "button";
    var pie = anadir(crear("footer", "fsel-pie"), btnQuitar, crear("span", "fsel-relleno"), btnCancelar, btnCentrar, btnGuardar);

    anadir(modal, cab, anadir(crear("div", "fsel-cuerpo"), escenario, lado), pie);
    ov.appendChild(modal);
    document.body.appendChild(ov);

    return {
      ov: ov, modal: modal, kicker: kicker, titulo: titulo, texto: texto, btnCerrar: btnCerrar,
      img: img, marcador: marcador, marco: marco, aviso: aviso, pista: pista, escenario: escenario,
      tabs: tabs, previa: previa, imgPrevia: imgPrevia, valor: valor,
      btnQuitar: btnQuitar, btnCancelar: btnCancelar, btnCentrar: btnCentrar, btnGuardar: btnGuardar
    };
  }

  /* ---------- Una sesión = una foto que se encuadra ---------- */
  function abrirModal(o) {
    if (!ui) ui = construir();
    var u = ui;

    return new Promise(function (resolver) {
      var url = String(o.url || "").trim();
      var forzado = !!o.forzado;
      var previo = document.activeElement;
      var formatos = (o.proporciones && o.proporciones.length ? o.proporciones : ["16x9", "1x1", "4x5"])
        .filter(function (k) { return FORMATOS[k]; });
      if (!formatos.length) formatos = ["16x9"];
      var formato = formatos[0];
      var pos = normalizar(o.valor);
      var elegido = !forzado; // en modo forzado hay que tocar algo antes de guardar
      var fallo = false;      // la foto no se puede mostrar aquí (p. ej. HEIC)
      var arrastrando = false;

      // Textos
      u.kicker.textContent = o.contador && o.contador.total > 1 ? "Foto " + o.contador.n + " de " + o.contador.total : "";
      u.kicker.hidden = !u.kicker.textContent;
      u.titulo.textContent = o.titulo || (forzado ? "Elige el punto importante de la foto" : "Ajustar el encuadre");
      u.texto.textContent = o.texto || TEXTO_POR_DEFECTO;

      // Botones según el modo
      u.btnCerrar.hidden = forzado;
      u.btnCancelar.hidden = forzado;
      u.btnQuitar.hidden = !o.permitirQuitar;
      u.ov.classList.toggle("fsel-forzado", forzado);

      function pintar() {
        u.marcador.style.left = pos.x + "%";
        u.marcador.style.top = pos.y + "%";
        u.imgPrevia.style.objectPosition = pos.x + "% " + pos.y + "%";
        u.valor.textContent = fallo ? "" : "Punto elegido: " + pos.x + " % \u00B7 " + pos.y + " %";
        u.btnGuardar.disabled = !(elegido || fallo);
        u.escenario.classList.toggle("fsel-sin-elegir", !elegido && !fallo);
        u.pista.hidden = elegido || fallo;
      }

      function fijar(p) {
        pos = { x: Math.round(limitar(p.x)), y: Math.round(limitar(p.y)) };
        elegido = true;
        pintar();
      }

      function aplicarFormato(clave) {
        formato = clave;
        var f = FORMATOS[clave];
        u.previa.style.aspectRatio = f.ratio;
        u.previa.style.width = f.ancho + "px";
        u.previa.classList.toggle("fsel-redonda", !!f.redondo);
        Array.prototype.forEach.call(u.tabs.children, function (b) {
          var activo = b.getAttribute("data-fmt") === clave;
          b.classList.toggle("activo", activo);
          b.setAttribute("aria-selected", activo ? "true" : "false");
          b.tabIndex = activo ? 0 : -1;
        });
      }

      u.tabs.textContent = "";
      formatos.forEach(function (clave) {
        var b = crear("button", "fsel-tab", FORMATOS[clave].etiqueta);
        b.type = "button";
        b.setAttribute("role", "tab");
        b.setAttribute("data-fmt", clave);
        b.onclick = function () { aplicarFormato(clave); };
        u.tabs.appendChild(b);
      });
      u.tabs.hidden = formatos.length < 2;
      aplicarFormato(formato);

      // Foto
      function marcarFallo(msg) {
        fallo = true;
        pos = { x: 50, y: 50 };
        u.aviso.textContent = msg;
        u.escenario.classList.add("fsel-error");
        pintar();
      }
      u.escenario.classList.remove("fsel-error");
      u.aviso.textContent = "";
      u.img.onload = function () { u.escenario.classList.remove("fsel-error"); };
      u.img.onerror = function () {
        marcarFallo("No se puede mostrar la vista previa de esta foto (puede ser un formato como HEIC). Se guardar\u00E1 centrada.");
      };
      u.img.removeAttribute("src");
      u.imgPrevia.removeAttribute("src");
      if (url) {
        u.img.setAttribute("src", url);
        u.imgPrevia.setAttribute("src", url);
      } else {
        marcarFallo("Sin foto");
      }
      pintar();

      /* ---- Cierre ---- */
      function terminar(resultado) {
        u.ov.hidden = true;
        document.documentElement.classList.remove("fsel-abierto");
        u.marco.onpointerdown = u.marco.onpointermove = u.marco.onpointerup = null;
        u.marco.onpointercancel = u.marco.onlostpointercapture = u.marco.onkeydown = null;
        u.ov.onkeydown = u.ov.onmousedown = null;
        u.btnGuardar.onclick = u.btnCentrar.onclick = u.btnQuitar.onclick = null;
        u.btnCancelar.onclick = u.btnCerrar.onclick = null;
        u.img.onload = u.img.onerror = null;
        sesion = null;
        try { if (previo && previo.focus) previo.focus({ preventScroll: true }); } catch (e) { /* nada */ }
        resolver(resultado);
      }
      function cancelar() { if (!forzado) terminar(null); }
      function guardar() {
        if (u.btnGuardar.disabled) return;
        terminar({ valor: fallo ? "50% 50%" : comoTexto(pos) });
      }
      sesion = { cancelar: cancelar, forzado: forzado };

      u.btnGuardar.onclick = guardar;
      u.btnCancelar.onclick = cancelar;
      u.btnCerrar.onclick = cancelar;
      u.btnQuitar.onclick = function () { terminar({ quitar: true }); };
      u.btnCentrar.onclick = function () { fijar({ x: 50, y: 50 }); };
      // Clic en el fondo oscuro: solo cierra si no es obligatorio
      u.ov.onmousedown = function (ev) { if (ev.target === u.ov) cancelar(); };

      /* ---- Interacción con la foto ---- */
      function desdeEvento(ev) {
        var r = u.img.getBoundingClientRect();
        if (!r.width || !r.height) return;
        fijar({
          x: ((ev.clientX - r.left) / r.width) * 100,
          y: ((ev.clientY - r.top) / r.height) * 100
        });
      }
      u.marco.onpointerdown = function (ev) {
        if (fallo || (ev.button != null && ev.button > 0)) return;
        arrastrando = true;
        try { u.marco.setPointerCapture(ev.pointerId); } catch (e) { /* nada */ }
        if (ev.preventDefault) ev.preventDefault();
        desdeEvento(ev);
      };
      u.marco.onpointermove = function (ev) { if (arrastrando) desdeEvento(ev); };
      u.marco.onpointerup = u.marco.onpointercancel = u.marco.onlostpointercapture = function () { arrastrando = false; };

      u.marco.onkeydown = function (ev) {
        if (fallo) return;
        var paso = ev.shiftKey ? 10 : 1;
        var dx = 0, dy = 0;
        switch (ev.key) {
          case "ArrowLeft": dx = -paso; break;
          case "ArrowRight": dx = paso; break;
          case "ArrowUp": dy = -paso; break;
          case "ArrowDown": dy = paso; break;
          case "Home":
          case "0": ev.preventDefault(); fijar({ x: 50, y: 50 }); return;
          case "Enter": ev.preventDefault(); guardar(); return;
          default: return;
        }
        ev.preventDefault();
        fijar({ x: pos.x + dx, y: pos.y + dy });
      };

      // Esc (solo si se puede cancelar) y el foco no se sale de la ventana
      u.ov.onkeydown = function (ev) {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          if (!forzado) { ev.preventDefault(); cancelar(); }
          return;
        }
        if (ev.key !== "Tab") return;
        var enfocables = Array.prototype.filter.call(
          u.modal.querySelectorAll("button, [tabindex]"),
          function (el) { return !el.disabled && !el.hidden && el.tabIndex >= 0 && !el.closest("[hidden]"); }
        );
        if (!enfocables.length) return;
        var primero = enfocables[0], ultimo = enfocables[enfocables.length - 1];
        if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus(); }
        else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
      };

      // Mostrar
      u.ov.hidden = false;
      document.documentElement.classList.add("fsel-abierto");
      try { u.marco.focus({ preventScroll: true }); } catch (e) { /* nada */ }
    });
  }

  // Cola: si se piden varias a la vez (p. ej. 10 fotos), salen una detrás de otra.
  function pedir(o) {
    var tarea = cola.then(function () { return abrirModal(o || {}); });
    cola = tarea.then(function () {}, function () {});
    return tarea;
  }

  /* ---------- Integración con un campo concreto del panel ---------- */
  function montar(o) {
    o = o || {};
    var obtenerUrl = o.obtenerUrl || function () { return ""; };
    var obtenerValor = o.obtenerValor || function () { return ""; };
    var fijarValor = o.fijarValor || function () {};
    var boton = o.boton || null;
    var abierto = false;
    // URL cuyo encuadre ya está decidido: no se vuelve a exigir hasta que cambie.
    var urlEncuadrada = String(obtenerUrl() || "").trim();

    // Compatibilidad: ya no hay panel incrustado; si el llamador aún pasa uno, se oculta.
    if (o.panel) { o.panel.hidden = true; o.panel.classList.add("oculto"); }

    function sincronizarBoton() {
      if (!boton) return;
      boton.classList.toggle("activo", abierto);
      boton.setAttribute("aria-expanded", abierto ? "true" : "false");
    }

    function lanzar(forzado) {
      var url = String(obtenerUrl() || "").trim();
      if (!url) return Promise.resolve(null);
      abierto = true;
      sincronizarBoton();
      return pedir({
        url: url,
        valor: obtenerValor(),
        forzado: forzado,
        permitirQuitar: forzado && !!o.alQuitar,
        proporciones: o.proporciones,
        texto: o.texto,
        titulo: o.titulo
      }).then(function (r) {
        abierto = false;
        sincronizarBoton();
        if (!r) return null;
        if (r.quitar) {
          urlEncuadrada = "";
          if (o.alQuitar) o.alQuitar();
          return r;
        }
        urlEncuadrada = url;
        fijarValor(r.valor);
        if (o.alCambiar) o.alCambiar(r.valor);
        return r;
      });
    }

    if (boton) {
      boton.setAttribute("aria-haspopup", "dialog");
      boton.addEventListener("click", function () { lanzar(false); });
      sincronizarBoton();
    }

    return {
      abrir: function () { return lanzar(false); },
      alternar: function () { return lanzar(false); },
      exigir: function () { return lanzar(true); },
      exigirSiNueva: function () {
        var url = String(obtenerUrl() || "").trim();
        return url && url !== urlEncuadrada ? lanzar(true) : Promise.resolve(null);
      },
      // Para fotos cargadas de datos ya guardados: se da por encuadrada.
      darPorEncuadrada: function () { urlEncuadrada = String(obtenerUrl() || "").trim(); },
      // Al vaciar el campo: la próxima foto (aunque sea la misma URL) vuelve a exigir encuadre.
      reiniciar: function () { urlEncuadrada = ""; },
      cerrar: function () { if (sesion && !sesion.forzado) sesion.cancelar(); },
      estaAbierto: function () { return abierto; },
      pintar: function () { sincronizarBoton(); }
    };
  }

  global.EOF_FOCO_SELECTOR = { montar: montar, pedir: pedir, PROPORCIONES: FORMATOS };
})(window);
