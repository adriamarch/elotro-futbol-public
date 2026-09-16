// ---------- Encuestas (frontend público) ----------
// Solo puede votar un lector con cuenta, con sesión iniciada y con el
// correo verificado (mismo requisito que comentar, ver lector-auth.js
// y requireReaderVerificado en el worker). Este archivo es compartido
// entre noticia.html (encuesta de una noticia) e index.html (encuestas
// destacadas en portada): ambos usan las mismas funciones de render y
// de voto, solo cambia de dónde sacan los datos.

// Pinta el cuerpo de una encuesta (pregunta + opciones o resultados,
// según si el lector puede votar, ya votó, o la encuesta está cerrada).
// "encuesta" es el objeto que devuelve la API (con mi_voto, opciones,
// total_votos...). "estadoLector" es el resultado de
// comprobarAccesoEncuesta() para esta encuesta en concreto.
function encuestaWidgetHTML(encuesta, estadoLector) {
  const cerrada = encuesta.estado !== "abierta";
  const yaVoto = encuesta.mi_voto !== null && encuesta.mi_voto !== undefined;
  // Se muestran los resultados (barras) en vez de las opciones para
  // votar cuando: la encuesta está cerrada, el lector ya votó, o el
  // lector no cumple los 3 requisitos (no se le enseñan opciones para
  // votar, solo un aviso, tal y como se decidió para esta funcionalidad).
  const mostrarResultados = cerrada || yaVoto || !estadoLector.puedeVotar;

  const cuerpoResultados = `
    <div class="encuesta-resultados">
      ${encuesta.opciones.map(o => {
        const pct = encuesta.total_votos ? Math.round((o.votos / encuesta.total_votos) * 100) : 0;
        const esMiVoto = yaVoto && o.id === encuesta.mi_voto;
        return `
          <div class="encuesta-resultado-fila${esMiVoto ? " encuesta-mi-voto" : ""}">
            <div class="encuesta-resultado-cabecera">
              <span>${escapeHtml(o.texto)}${esMiVoto ? " ✓" : ""}</span>
              <span>${pct}%</span>
            </div>
            <div class="encuesta-barra"><div class="encuesta-barra-relleno" style="width:${pct}%"></div></div>
          </div>`;
      }).join("")}
    </div>
    <p class="encuesta-total">${encuesta.total_votos} voto${encuesta.total_votos === 1 ? "" : "s"}${cerrada ? " · Encuesta cerrada" : ""}</p>`;

  const cuerpoVotar = `
    <form class="encuesta-form" data-poll-id="${encuesta.id}">
      ${encuesta.opciones.map(o => `
        <label class="encuesta-opcion">
          <input type="radio" name="opcion_${encuesta.id}" value="${o.id}" required>
          <span>${escapeHtml(o.texto)}</span>
        </label>`).join("")}
      <button type="submit" class="btn-votar-encuesta">Votar</button>
      <p class="encuesta-msg encuesta-msg-error" id="encuestaError_${encuesta.id}"></p>
    </form>`;

  // Aviso cuando no se cumplen los 3 requisitos: solo texto invitando a
  // iniciar sesión o a verificar el correo, sin mostrar las opciones
  // (así se decidió para esta funcionalidad).
  const avisoAcceso = !estadoLector.puedeVotar && !cerrada ? `
    <p class="encuesta-aviso">${estadoLector.mensaje}</p>` : "";

  return `
    <div class="encuesta-widget" data-poll-id="${encuesta.id}">
      <p class="encuesta-pregunta">${escapeHtml(encuesta.pregunta)}</p>
      ${mostrarResultados ? cuerpoResultados : cuerpoVotar}
      ${avisoAcceso}
    </div>`;
}

// Comprueba, con los datos que ya tenemos en localStorage (sesión de
// lector), si puede votar. No es una comprobación de seguridad — el
// worker vuelve a exigir sesión válida y correo verificado al votar —
// solo decide qué mostrar en el frontend sin tener que preguntar antes
// a la API.
function comprobarAccesoEncuesta() {
  const volver = encodeURIComponent(location.pathname + location.search);
  const reader = sesionLectorActual();
  if (!reader) {
    // La cuenta de redactor/admin (panel) es independiente de la de
    // lector: si detectamos que hay una sesión de redactor pero no de
    // lector, avisamos con un mensaje específico en vez del genérico
    // de "inicia sesión", que llevaría a pensar que su cuenta de
    // redactor debería servir para votar.
    const redactor = typeof sesionActual === "function" ? sesionActual() : null;
    if (redactor) {
      return {
        puedeVotar: false,
        mensaje: `Los redactores no pueden votar en las encuestas con su cuenta de redactor. Si quieres votar, hazlo con una cuenta de lector distinta: <a href="acceso.html?volver=${volver}">inicia sesión o regístrate</a>.`,
      };
    }
    return {
      puedeVotar: false,
      mensaje: `<a href="acceso.html?volver=${volver}">Inicia sesión o regístrate</a> para votar en esta encuesta.`,
    };
  }
  if (!reader.email_verificado) {
    return {
      puedeVotar: false,
      mensaje: `Verifica tu correo para poder votar. Revisa el enlace que te enviamos al registrarte, o <a href="acceso.html?volver=${volver}">gestiona tu cuenta aquí</a>.`,
    };
  }
  return { puedeVotar: true, mensaje: "" };
}

// Engancha el envío del formulario de voto de un widget ya insertado en
// el DOM. Se llama tras cada render (el contenedor puede sustituirse
// entero, así que hay que reenganchar cada vez).
function iniciarFormularioEncuesta(contenedor) {
  const form = contenedor.querySelector(".encuesta-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pollId = form.dataset.pollId;
    const opcionMarcada = form.querySelector("input[type=radio]:checked");
    const errEl = document.getElementById(`encuestaError_${pollId}`);
    if (errEl) errEl.textContent = "";
    if (!opcionMarcada) return;

    const btn = form.querySelector(".btn-votar-encuesta");
    btn.disabled = true;
    btn.textContent = "Votando...";
    try {
      const res = await apiFetchLector(`/api/polls/${pollId}/vote`, {
        method: "POST",
        body: JSON.stringify({ option_id: parseInt(opcionMarcada.value) }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 403 con motivo "no_logueado"/"no_verificado": la sesión pudo
        // caducar entre que se cargó la página y que se votó. Se
        // recarga el widget para que muestre el aviso correcto en vez
        // de dejar el formulario ahí sin más.
        if (errEl) errEl.textContent = data.error || "No se ha podido registrar tu voto.";
        if (res.status === 403 && contenedor.dataset.pollRefrescar) {
          window[contenedor.dataset.pollRefrescar]();
        }
        return;
      }
      // Sustituye el widget entero por la versión con resultados y "mi
      // voto" ya marcado, usando la respuesta que ya trae la API (sin
      // tener que volver a pedir la encuesta aparte).
      const estadoLector = comprobarAccesoEncuesta();
      contenedor.outerHTML = encuestaWidgetHTML(data.encuesta, estadoLector);
    } catch (err) {
      if (errEl) errEl.textContent = "No se ha podido conectar. Inténtalo de nuevo.";
    } finally {
      if (btn.isConnected) {
        btn.disabled = false;
        btn.textContent = "Votar";
      }
    }
  });
}

// Pinta una encuesta dentro de "contenedor" (ya en el DOM) y engancha su
// formulario de voto. "refrescarFnName" es el nombre (string) de una
// función global que vuelve a cargar y pintar esta misma encuesta, para
// poder llamarla tras votar si hiciera falta refrescar el estado.
function pintarEncuesta(contenedor, encuesta, refrescarFnName) {
  const estadoLector = comprobarAccesoEncuesta();
  contenedor.dataset.pollRefrescar = refrescarFnName || "";
  contenedor.outerHTML = encuestaWidgetHTML(encuesta, estadoLector);
  // outerHTML sustituye el nodo: hay que volver a buscarlo por selector
  // para engancharle el listener del formulario.
  const nuevo = document.querySelector(`.encuesta-widget[data-poll-id="${encuesta.id}"]`);
  if (nuevo) iniciarFormularioEncuesta(nuevo);
}
