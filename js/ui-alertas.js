// ---------- Alertas bonitas (sustituyen a alert/confirm/prompt del navegador) ----------
// Expone window.EOF con: toast(), confirmar(), preguntar(), alertaModal().
// Se apoya en las variables de color/tipografía ya definidas en css/style.css
// para que encaje con el resto del sitio (portada y panel de administración).
(function () {
  if (window.EOF && window.EOF._alertasCargadas) return;

  const ICONOS = {
    exito: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16v-4M12 8h.01"/><circle cx="12" cy="12" r="9"/></svg>',
    pregunta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 9a2.5 2.5 0 0 1 4.9.75c0 1.5-2.15 2.1-2.4 3.4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>',
  };

  function inyectarEstilos() {
    if (document.getElementById("eof-alertas-css")) return;
    const style = document.createElement("style");
    style.id = "eof-alertas-css";
    style.textContent = `
.eof-toast-contenedor{position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column-reverse;gap:10px;max-width:360px;width:calc(100% - 40px);pointer-events:none;}
.eof-toast{pointer-events:auto;background:var(--tarjeta,#fff);border-radius:var(--radio,8px);box-shadow:var(--sombra,0 4px 18px rgba(12,27,46,.18));padding:13px 14px;display:flex;align-items:flex-start;gap:10px;border-left:4px solid var(--celeste,#5bb8e8);font-family:var(--font-text,Arial,sans-serif);font-size:.87rem;color:var(--texto,#1a1c22);transform:translateX(120%);opacity:0;transition:transform .3s ease,opacity .3s ease;}
.eof-toast-visible{transform:translateX(0);opacity:1;}
.eof-toast-saliendo{opacity:0;transform:translateX(30px);}
.eof-toast-exito{border-left-color:#1c8a4b;}
.eof-toast-error{border-left-color:var(--rojo,#d1132e);}
.eof-toast-info{border-left-color:var(--celeste,#5bb8e8);}
.eof-toast-icono{width:19px;height:19px;flex-shrink:0;margin-top:1px;}
.eof-toast-icono svg{width:100%;height:100%;}
.eof-toast-exito .eof-toast-icono{color:#1c8a4b;}
.eof-toast-error .eof-toast-icono{color:var(--rojo,#d1132e);}
.eof-toast-info .eof-toast-icono{color:var(--celeste,#5bb8e8);}
.eof-toast-texto{flex:1;line-height:1.42;padding-top:1px;}
.eof-toast-cerrar{background:none;border:none;font-size:1.15rem;line-height:.8;color:#9aa0ab;cursor:pointer;padding:0 0 0 4px;}
.eof-toast-cerrar:hover{color:var(--marino,#0c1b2e);}
.eof-modal-overlay{position:fixed;inset:0;background:rgba(12,27,46,.55);display:flex;align-items:center;justify-content:center;z-index:100000;padding:20px;opacity:0;transition:opacity .18s ease;}
.eof-modal-overlay.eof-modal-visible{opacity:1;}
.eof-modal-caja{background:var(--tarjeta,#fff);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.35);max-width:400px;width:100%;padding:28px 26px;text-align:center;transform:scale(.94);transition:transform .18s ease;font-family:var(--font-text,Arial,sans-serif);}
.eof-modal-overlay.eof-modal-visible .eof-modal-caja{transform:scale(1);}
.eof-modal-icono{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;}
.eof-modal-icono svg{width:23px;height:23px;}
.eof-modal-icono-info,.eof-modal-icono-pregunta{background:#e6f4fb;color:var(--celeste,#5bb8e8);}
.eof-modal-icono-error{background:#fbe7ea;color:var(--rojo,#d1132e);}
.eof-modal-icono-exito{background:#e5f5ec;color:#1c8a4b;}
.eof-modal-mensaje{font-size:.95rem;color:var(--texto,#0c1b2e);line-height:1.5;margin-bottom:20px;white-space:pre-line;}
.eof-modal-input{width:100%;padding:11px;border:1px solid var(--borde,#ccc);border-radius:6px;font-size:.9rem;margin-bottom:20px;font-family:inherit;background:var(--fondo,#fff);color:var(--texto,#1a1c22);}
.eof-modal-input:focus{outline:none;border-color:var(--celeste,#5bb8e8);}
.eof-modal-email .eof-modal-input{margin-bottom:6px;}
.eof-modal-input-error{border-color:var(--rojo,#d1132e)!important;}
.eof-modal-email-error{display:none;color:var(--rojo,#d1132e);font-size:.8rem;text-align:left;margin:0 0 14px;line-height:1.4;}
.eof-modal-preguntar-html{max-width:640px;text-align:left;}
.eof-modal-preguntar-html .eof-modal-mensaje{text-align:left;}
.eof-modal-textarea{resize:vertical;min-height:200px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem;line-height:1.45;}
.eof-modal-botones{display:flex;gap:10px;justify-content:center;}
.eof-btn{flex:1;padding:11px 14px;border-radius:8px;border:none;font-size:.87rem;font-weight:600;cursor:pointer;font-family:var(--font-text,Arial,sans-serif);transition:background .15s;}
.eof-btn-secundario{background:var(--gris-claro,#eef1f5);color:var(--texto-suave,#5a6270);}
.eof-btn-secundario:hover{background:var(--borde,#e2e6eb);}
.eof-btn-primario{background:var(--marino,#0c1b2e);color:#fff;}
.eof-btn-primario:hover{background:var(--marino2,#152b46);}
.eof-btn-peligro{background:var(--rojo,#d1132e);color:#fff;}
.eof-btn-peligro:hover{background:var(--rojo-oscuro,#9c0e23);}
@media(max-width:480px){
  .eof-toast-contenedor{left:12px;right:12px;bottom:12px;max-width:none;}
  .eof-modal-caja{padding:22px 18px;}
}
`;
    document.head.appendChild(style);
  }

  function contenedorToasts() {
    let cont = document.getElementById("eof-toast-contenedor");
    if (!cont) {
      cont = document.createElement("div");
      cont.id = "eof-toast-contenedor";
      cont.className = "eof-toast-contenedor";
      document.body.appendChild(cont);
    }
    return cont;
  }

  // Notificación breve, no bloqueante. tipo: "exito" | "error" | "info".
  function toast(mensaje, tipo = "info", duracion = 4500) {
    inyectarEstilos();
    const cont = contenedorToasts();
    const el = document.createElement("div");
    el.className = `eof-toast eof-toast-${tipo}`;
    el.innerHTML = `<span class="eof-toast-icono">${ICONOS[tipo] || ICONOS.info}</span><span class="eof-toast-texto"></span><button type="button" class="eof-toast-cerrar" aria-label="Cerrar">&times;</button>`;
    el.querySelector(".eof-toast-texto").textContent = mensaje;
    cont.appendChild(el);
    requestAnimationFrame(() => el.classList.add("eof-toast-visible"));
    let temporizador;
    const cerrar = () => {
      clearTimeout(temporizador);
      el.classList.remove("eof-toast-visible");
      el.classList.add("eof-toast-saliendo");
      setTimeout(() => el.remove(), 250);
    };
    el.querySelector(".eof-toast-cerrar").addEventListener("click", cerrar);
    temporizador = setTimeout(cerrar, duracion);
    return cerrar;
  }

  function crearModalBase(claseExtra) {
    inyectarEstilos();
    const overlay = document.createElement("div");
    overlay.className = "eof-modal-overlay";
    const caja = document.createElement("div");
    caja.className = `eof-modal-caja ${claseExtra || ""}`;
    overlay.appendChild(caja);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("eof-modal-visible"));
    return { overlay, caja };
  }

  function cerrarModal(overlay) {
    overlay.classList.remove("eof-modal-visible");
    setTimeout(() => overlay.remove(), 200);
  }

  // Modal informativo con un único botón de confirmación (sustituye a
  // los alert() que necesitan que el usuario los reconozca antes de
  // continuar, como el aviso de cierre de sesión por inactividad).
  function alertaModal(mensaje, opciones = {}) {
    return new Promise((resolve) => {
      const { overlay, caja } = crearModalBase("eof-modal-alerta");
      const tipo = opciones.tipo || "info";
      caja.innerHTML = `
        <div class="eof-modal-icono eof-modal-icono-${tipo}">${ICONOS[tipo] || ICONOS.info}</div>
        <p class="eof-modal-mensaje"></p>
        <div class="eof-modal-botones">
          <button type="button" class="eof-btn eof-btn-primario"></button>
        </div>`;
      caja.querySelector(".eof-modal-mensaje").textContent = mensaje;
      const btn = caja.querySelector(".eof-btn-primario");
      btn.textContent = opciones.textoBoton || "Entendido";
      const cerrar = () => { cerrarModal(overlay); resolve(); };
      btn.addEventListener("click", cerrar);
      setTimeout(() => btn.focus(), 50);
    });
  }

  // Sustituye a confirm(). Devuelve una Promise<boolean>.
  function confirmar(mensaje, opciones = {}) {
    return new Promise((resolve) => {
      const { overlay, caja } = crearModalBase("eof-modal-confirmar");
      const tipo = opciones.tipo || "pregunta";
      caja.innerHTML = `
        <div class="eof-modal-icono eof-modal-icono-${tipo}">${ICONOS[tipo] || ICONOS.pregunta}</div>
        <p class="eof-modal-mensaje"></p>
        <div class="eof-modal-botones">
          <button type="button" class="eof-btn eof-btn-secundario"></button>
          <button type="button" class="eof-btn ${opciones.peligroso ? "eof-btn-peligro" : "eof-btn-primario"}"></button>
        </div>`;
      caja.querySelector(".eof-modal-mensaje").textContent = mensaje;
      const [btnCancelar, btnConfirmar] = caja.querySelectorAll(".eof-btn");
      btnCancelar.textContent = opciones.textoCancelar || "Cancelar";
      btnConfirmar.textContent = opciones.textoConfirmar || "Confirmar";
      const resolver = (valor) => { cerrarModal(overlay); document.removeEventListener("keydown", tecla); resolve(valor); };
      btnCancelar.addEventListener("click", () => resolver(false));
      btnConfirmar.addEventListener("click", () => resolver(true));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) resolver(false); });
      function tecla(e) { if (e.key === "Escape") resolver(false); }
      document.addEventListener("keydown", tecla);
      setTimeout(() => btnConfirmar.focus(), 50);
    });
  }

  // Sustituye a prompt(). Devuelve una Promise<string|null>: null solo si
  // se cancela (botón Cancelar, Escape o clic fuera); si se confirma con
  // el campo vacío, se devuelve "" (cadena vacía), NO null, para que
  // quien llama pueda distinguir "canceló" de "confirmó sin escribir
  // nada" (p.ej. un campo opcional como los minutos de tiempo añadido).
  // Si opciones.soloLectura es true, el campo se muestra de solo lectura
  // y seleccionado (útil para "copia este enlace a mano").
  function preguntar(mensaje, valorPorDefecto = "", opciones = {}) {
    return new Promise((resolve) => {
      const { overlay, caja } = crearModalBase("eof-modal-preguntar");
      caja.innerHTML = `
        <p class="eof-modal-mensaje"></p>
        <input type="text" class="eof-modal-input" autocomplete="off" />
        <div class="eof-modal-botones">
          <button type="button" class="eof-btn eof-btn-secundario">Cancelar</button>
          <button type="button" class="eof-btn eof-btn-primario"></button>
        </div>`;
      caja.querySelector(".eof-modal-mensaje").textContent = mensaje;
      const input = caja.querySelector(".eof-modal-input");
      input.value = valorPorDefecto || "";
      if (opciones.placeholder) input.placeholder = opciones.placeholder;
      if (opciones.soloLectura) input.readOnly = true;
      const btnConfirmar = caja.querySelector(".eof-btn-primario");
      btnConfirmar.textContent = opciones.textoConfirmar || "Aceptar";
      const resolver = (valor) => { cerrarModal(overlay); document.removeEventListener("keydown", tecla); resolve(valor); };
      caja.querySelector(".eof-btn-secundario").addEventListener("click", () => resolver(null));
      btnConfirmar.addEventListener("click", () => resolver(input.value.trim()));
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); resolver(input.value.trim()); } });
      function tecla(e) { if (e.key === "Escape") resolver(null); }
      document.addEventListener("keydown", tecla);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) resolver(null); });
      setTimeout(() => { input.focus(); if (opciones.soloLectura) input.select(); }, 50);
    });
  }

  // Como preguntar(), pero con un <textarea> grande en vez de un campo de
  // una línea: para pegar bloques largos de código HTML (p. ej. la
  // traducción devuelta por una IA) sin que se corte la vista.
  function preguntarHTML(mensaje, valorPorDefecto = "", opciones = {}) {
    return new Promise((resolve) => {
      const { overlay, caja } = crearModalBase("eof-modal-preguntar eof-modal-preguntar-html");
      caja.innerHTML = `
        <p class="eof-modal-mensaje"></p>
        <textarea class="eof-modal-input eof-modal-textarea" autocomplete="off" rows="12"></textarea>
        <div class="eof-modal-botones">
          <button type="button" class="eof-btn eof-btn-secundario">Cancelar</button>
          <button type="button" class="eof-btn eof-btn-primario"></button>
        </div>`;
      caja.querySelector(".eof-modal-mensaje").textContent = mensaje;
      const input = caja.querySelector(".eof-modal-textarea");
      input.value = valorPorDefecto || "";
      const btnConfirmar = caja.querySelector(".eof-btn-primario");
      btnConfirmar.textContent = opciones.textoConfirmar || "Aceptar";
      const resolver = (valor) => { cerrarModal(overlay); document.removeEventListener("keydown", tecla); resolve(valor); };
      caja.querySelector(".eof-btn-secundario").addEventListener("click", () => resolver(null));
      // Igual que preguntar(): null SOLO significa "se canceló". Si se
      // confirma con el campo vacío hay que devolver "" (no null), o
      // quien llama no puede distinguir "canceló" de "confirmó en
      // blanco" (p. ej. querer borrar una traducción existente).
      btnConfirmar.addEventListener("click", () => resolver(input.value.trim()));
      function tecla(e) { if (e.key === "Escape") resolver(null); }
      document.addEventListener("keydown", tecla);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) resolver(null); });
      setTimeout(() => { input.focus(); }, 50);
    });
  }

  // Como preguntar(), pero pensada específicamente para insertar un enlace
  // con texto propio: pide el texto visible y la URL de destino en dos
  // campos separados. Devuelve {texto, url} o null si se cancela. Si el
  // texto se deja en blanco, se usa la propia URL como texto visible.
  function preguntarEnlace(mensaje, valoresPorDefecto = {}) {
    return new Promise((resolve) => {
      const { overlay, caja } = crearModalBase("eof-modal-preguntar");
      caja.innerHTML = `
        <p class="eof-modal-mensaje"></p>
        <input type="text" class="eof-modal-input eof-modal-input-texto" autocomplete="off" placeholder="Texto del enlace" />
        <input type="text" class="eof-modal-input eof-modal-input-url" autocomplete="off" placeholder="URL (https://...)" />
        <div class="eof-modal-botones">
          <button type="button" class="eof-btn eof-btn-secundario">Cancelar</button>
          <button type="button" class="eof-btn eof-btn-primario"></button>
        </div>`;
      caja.querySelector(".eof-modal-mensaje").textContent = mensaje;
      const inputTexto = caja.querySelector(".eof-modal-input-texto");
      const inputUrl = caja.querySelector(".eof-modal-input-url");
      inputTexto.value = valoresPorDefecto.texto || "";
      inputUrl.value = valoresPorDefecto.url || "";
      const btnConfirmar = caja.querySelector(".eof-btn-primario");
      btnConfirmar.textContent = "Aceptar";
      const resolver = (valor) => { cerrarModal(overlay); document.removeEventListener("keydown", tecla); resolve(valor); };
      const confirmarSiHayUrl = () => {
        const url = inputUrl.value.trim();
        if (!url) { inputUrl.focus(); return; }
        resolver({ texto: inputTexto.value.trim(), url });
      };
      caja.querySelector(".eof-btn-secundario").addEventListener("click", () => resolver(null));
      btnConfirmar.addEventListener("click", confirmarSiHayUrl);
      [inputTexto, inputUrl].forEach((input) => {
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); confirmarSiHayUrl(); } });
      });
      function tecla(e) { if (e.key === "Escape") resolver(null); }
      document.addEventListener("keydown", tecla);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) resolver(null); });
      setTimeout(() => { (inputTexto.value ? inputUrl : inputTexto).focus(); }, 50);
    });
  }

  // Modal específico para pedir un correo electrónico con guardado en el
  // servidor (a diferencia de preguntar(), que solo devuelve el texto
  // tal cual y no sabe nada de si el envío tuvo éxito). Pensado para
  // flujos como "añade tu correo real" tras entrar con X: valida el
  // formato en el propio campo (type="email" + comprobación básica) y,
  // si el servidor rechaza el valor (correo duplicado, formato inválido
  // según el backend, etc.), muestra ese error DENTRO del modal y deja
  // reintentar sin cerrarlo, en vez de darlo por bueno silenciosamente o
  // cerrarse igualmente.
  //
  // opciones.onEnviar(email) debe ser una función async que intenta
  // guardar el correo y:
  //   - o bien devuelve normalmente (éxito: el modal se cierra), 
  //   - o bien lanza un Error con un mensaje legible (el modal muestra
  //     ese mensaje y deja corregir el campo).
  // Devuelve una Promise<boolean>: true si se guardó, false si se canceló.
  function preguntarEmail(mensaje, opciones = {}) {
    return new Promise((resolve) => {
      const { overlay, caja } = crearModalBase("eof-modal-preguntar eof-modal-email");
      caja.innerHTML = `
        <p class="eof-modal-mensaje"></p>
        <input type="email" class="eof-modal-input" autocomplete="email" inputmode="email" />
        <p class="eof-modal-email-error" role="alert"></p>
        <div class="eof-modal-botones">
          <button type="button" class="eof-btn eof-btn-secundario">Cancelar</button>
          <button type="button" class="eof-btn eof-btn-primario"></button>
        </div>`;
      caja.querySelector(".eof-modal-mensaje").textContent = mensaje;
      const input = caja.querySelector(".eof-modal-input");
      const elError = caja.querySelector(".eof-modal-email-error");
      if (opciones.placeholder) input.placeholder = opciones.placeholder;
      const btnConfirmar = caja.querySelector(".eof-btn-primario");
      const btnCancelar = caja.querySelector(".eof-btn-secundario");
      btnConfirmar.textContent = opciones.textoConfirmar || "Guardar";
      btnCancelar.textContent = opciones.textoCancelar || "Cancelar";

      const mostrarErrorCampo = (texto) => {
        elError.textContent = texto;
        elError.style.display = texto ? "block" : "none";
        input.classList.toggle("eof-modal-input-error", !!texto);
      };

      let enviando = false;
      const resolverCancelar = () => { cerrarModal(overlay); document.removeEventListener("keydown", tecla); resolve(false); };
      const intentarEnviar = async () => {
        if (enviando) return;
        const valor = input.value.trim();
        if (!valor || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
          mostrarErrorCampo("Introduce un correo electrónico válido.");
          input.focus();
          return;
        }
        mostrarErrorCampo("");
        enviando = true;
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = "Guardando…";
        try {
          if (opciones.onEnviar) await opciones.onEnviar(valor);
          cerrarModal(overlay);
          document.removeEventListener("keydown", tecla);
          resolve(true);
        } catch (err) {
          mostrarErrorCampo(err.message || "No se ha podido guardar el correo.");
          input.focus();
        } finally {
          enviando = false;
          btnConfirmar.disabled = false;
          btnConfirmar.textContent = opciones.textoConfirmar || "Guardar";
        }
      };
      btnCancelar.addEventListener("click", resolverCancelar);
      btnConfirmar.addEventListener("click", intentarEnviar);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); intentarEnviar(); } });
      input.addEventListener("input", () => mostrarErrorCampo(""));
      function tecla(e) { if (e.key === "Escape") resolverCancelar(); }
      document.addEventListener("keydown", tecla);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) resolverCancelar(); });
      setTimeout(() => input.focus(), 50);
    });
  }

  window.EOF = window.EOF || {};
  Object.assign(window.EOF, { toast, confirmar, preguntar, preguntarEnlace, preguntarHTML, preguntarEmail, alertaModal, _alertasCargadas: true });
})();
