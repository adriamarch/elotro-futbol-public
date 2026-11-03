// ---------- Modal obligatorio: apellidos de redactores y fotógrafos ----------
// Las cuentas de redactor/fotógrafo creadas antes de pedir "nombre y
// apellidos" pueden tener solo un nombre (una palabra). Mientras sea así,
// al entrar al panel sale este modal, que NO se puede cerrar (ni con Esc, ni
// pinchando fuera, ni con botón ✕) hasta que la persona completa sus
// apellidos. Se guarda como "Nombre Apellidos" en el mismo campo `nombre`
// de la cuenta, así que aparece igual en firmas, perfil y créditos sin
// migración ni cambios de BD.
//
// Se carga DESPUÉS de admin.js (usa apiFetch, USER y escapeHtml globales).
// El servidor lo exige también (PUT /api/me/perfil rechaza un nombre de
// una sola palabra para redactor/fotógrafo), por si alguien se lo salta.
// EXCEPCIÓN: si un admin marca a la persona como "sin apellidos" (Usuarios >
// botón "Sin apellidos"), ni este modal ni el servidor se los piden.
(function () {
  "use strict";

  const ROLES_OBLIGADOS = ["redactor", "fotografo"];
  const MIN_PALABRA = 2;
  const SOLO_LETRAS = /^[\p{L}][\p{L}\p{M}'’.\- ]*$/u;

  const palabras = (txt) => String(txt || "").trim().split(/\s+/).filter(Boolean);
  const limpiar = (txt) => palabras(txt).join(" ");

  // Primera letra de cada palabra en mayúscula ("juan garcía" -> "Juan García"). Solo sube la inicial
  // y deja las partículas de en medio ("de", "del", "la"...) como estén. El servidor hace lo mismo
  // al guardar; aquí se hace también para que la vista previa de la firma ya salga bien.
  const PARTICULAS = new Set(["de", "del", "dels", "la", "las", "los", "el", "y", "e", "i", "da", "das", "do", "dos", "di", "van", "von", "der", "den"]);
  const capitalizar = (txt) => palabras(txt).map((w, i) => {
    if (i > 0 && PARTICULAS.has(w.toLowerCase())) return w;
    return w.replace(/(^|-)(\p{L})/gu, (_, sep, letra) => sep + letra.toLocaleUpperCase("es"));
  }).join(" ");
  const esc = (s) => (typeof escapeHtml === "function" ? escapeHtml(s) : String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));

  // Nombres de pila habituales. Sirven para detectar nombres compuestos que
  // NO llevan apellidos ("Jose Luis", "Manuel Jesús", "Miguel Ángel"): dos
  // palabras, pero las dos son nombre de pila.
  const NOMBRES_DE_PILA = new Set("jose juan luis miguel manuel jesus maria angel carlos antonio francisco javier alberto ramon pedro pablo ana carmen david daniel alejandro fernando rafael sergio adrian ruben ivan oscar victor raul diego jorge andres enrique ignacio mario joaquin eduardo jaime roberto laura lucia marta paula sara cristina elena isabel patricia rosa teresa pilar beatriz nuria irene silvia eva alba".split(" "));
  const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  function faltanApellidos(nombre) {
    const p = palabras(nombre);
    if (p.length < 2) return true;
    return p.length === 2 && p.every((w) => NOMBRES_DE_PILA.has(sinTildes(w)));
  }

  function validar(nombre, apellidos) {
    const n = limpiar(nombre), a = limpiar(apellidos);
    if (n.length < MIN_PALABRA || !SOLO_LETRAS.test(n)) return { campo: "nombre", msg: "Escribe tu nombre (solo letras)." };
    if (a.length < MIN_PALABRA || !SOLO_LETRAS.test(a)) return { campo: "apellidos", msg: "Escribe tus apellidos (solo letras)." };
    if (n.length + a.length > 120) return { campo: "apellidos", msg: "El nombre completo es demasiado largo." };
    return null;
  }

  function montarModal(nombreActual, perfil) {
    const previo = document.getElementById("modalApellidosObligatorios");
    if (previo) return;

    const overlay = document.createElement("div");
    overlay.className = "apo-overlay";
    overlay.id = "modalApellidosObligatorios";
    overlay.innerHTML = `
      <div class="apo-caja" role="dialog" aria-modal="true" aria-labelledby="apoTitulo" aria-describedby="apoSub">
        <div class="apo-formulario">
          <div class="apo-icono" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>
          </div>
          <h2 id="apoTitulo">Completa tu nombre</h2>
          <p class="apo-sub" id="apoSub">Para firmar tus publicaciones y salir en los créditos necesitamos tu <b>nombre y apellidos</b>. Solo te lo pediremos una vez.</p>
          <div class="apo-campo" id="apoCampoNombre">
            <label for="apoNombre">Nombre</label>
            <input id="apoNombre" type="text" autocomplete="given-name" maxlength="60" placeholder="Tu nombre" value="${esc(nombreActual)}">
          </div>
          <div class="apo-campo" id="apoCampoApellidos">
            <label for="apoApellidos">Apellidos</label>
            <input id="apoApellidos" type="text" autocomplete="family-name" maxlength="80" placeholder="Tus apellidos">
          </div>
          <div class="apo-previa">Así aparecerá tu firma<strong id="apoPrevia">—</strong></div>
          <p class="apo-error" id="apoError" role="alert"></p>
          <button type="button" class="apo-boton" id="apoGuardar">Guardar y continuar</button>
          <p class="apo-nota">No podrás usar el panel hasta completar este paso.</p>
        </div>
        <div class="apo-exito" role="status">
          <div class="apo-check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
          <h2>¡Listo!</h2>
          <p class="apo-sub" style="margin-bottom:0">Tus datos se han guardado. Entrando al panel…</p>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.classList.add("apo-abierto");

    const caja = overlay.querySelector(".apo-caja");
    const inNombre = overlay.querySelector("#apoNombre");
    const inApellidos = overlay.querySelector("#apoApellidos");
    const previa = overlay.querySelector("#apoPrevia");
    const errorEl = overlay.querySelector("#apoError");
    const boton = overlay.querySelector("#apoGuardar");

    const actualizarPrevia = () => {
      const t = capitalizar([inNombre.value, inApellidos.value].join(" "));
      previa.textContent = t || "—";
    };
    const mostrarError = (campo, msg) => {
      overlay.querySelectorAll(".apo-campo").forEach((c) => c.classList.remove("apo-invalido"));
      if (campo) overlay.querySelector(campo === "nombre" ? "#apoCampoNombre" : "#apoCampoApellidos").classList.add("apo-invalido");
      errorEl.textContent = msg || "";
      errorEl.classList.remove("apo-visible");
      if (msg) { void errorEl.offsetWidth; errorEl.classList.add("apo-visible"); }
    };

    inNombre.addEventListener("input", actualizarPrevia);
    inApellidos.addEventListener("input", actualizarPrevia);
    actualizarPrevia();

    // Bloqueo: Esc no cierra, y el foco no sale del modal.
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); guardar(); return; }
      if (e.key !== "Tab") return;
      const foco = [inNombre, inApellidos, boton].filter((el) => !el.disabled);
      const primero = foco[0], ultimo = foco[foco.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    });
    document.addEventListener("focusin", (e) => {
      if (document.body.contains(overlay) && !overlay.contains(e.target)) inApellidos.focus();
    });

    let guardando = false;
    async function guardar() {
      if (guardando) return;
      const fallo = validar(inNombre.value, inApellidos.value);
      if (fallo) { mostrarError(fallo.campo, fallo.msg); (fallo.campo === "nombre" ? inNombre : inApellidos).focus(); return; }
      mostrarError(null, "");
      guardando = true; boton.disabled = true; boton.textContent = "Guardando…";
      const nombreCompleto = capitalizar(`${inNombre.value} ${inApellidos.value}`);
      try {
        // El PUT del perfil reemplaza todos los campos, así que se reenvían
        // tal cual los que ya tenía (bio, foto, redes...) y solo cambia el nombre.
        const data = await apiFetch(`/api/me/perfil`, {
          method: "PUT",
          body: JSON.stringify({
            nombre: nombreCompleto,
            email: perfil.email || "",
            avatar_url: perfil.avatar_url || "",
            avatar_foco: perfil.avatar_foco,
            bio: perfil.bio || "",
            experiencia: perfil.experiencia || "",
            redes: perfil.redes || {},
          }),
        });
        if (data && data.token) localStorage.setItem("eof_token", data.token);
        if (data && data.user) {
          const guardado = JSON.parse(localStorage.getItem("eof_user") || "{}");
          localStorage.setItem("eof_user", JSON.stringify({ ...guardado, ...data.user, nombre: nombreCompleto }));
        }
        caja.classList.add("apo-ok");
        setTimeout(() => location.reload(), 1300);
      } catch (err) {
        guardando = false; boton.disabled = false; boton.textContent = "Guardar y continuar";
        mostrarError(null, (err && err.message) || "No se ha podido guardar. Inténtalo de nuevo.");
      }
    }
    boton.addEventListener("click", guardar);
    setTimeout(() => inApellidos.focus(), 60);
  }

  async function comprobar() {
    try {
      if (typeof USER === "undefined" || !USER || !ROLES_OBLIGADOS.includes(USER.rol)) return;
      if (!faltanApellidos(USER.nombre)) return;
      const data = await apiFetch(`/api/me/perfil`);
      const perfil = data && data.user;
      // Se comprueba con el dato real de la BD (el de la sesión puede ir desfasado).
      if (!perfil || !ROLES_OBLIGADOS.includes(perfil.rol) || !faltanApellidos(perfil.nombre)) return;
      // Excepción marcada por un admin: esta persona firma solo con su nombre.
      if (Number(perfil.sin_apellidos) === 1) return;
      montarModal(limpiar(perfil.nombre), perfil);
    } catch (e) {
      // Sin conexión: se vuelve a intentar en la próxima carga del panel.
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", comprobar);
  else comprobar();
})();
