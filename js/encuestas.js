// ---------- Encuestas (frontend público) ----------
// Votar es libre: cualquier lector puede votar, sin cuenta y sin iniciar
// sesión. El worker evita contar dos veces a la misma persona con un hash
// anónimo de IP + User-Agent por encuesta (ver hashVotanteEncuesta en el
// worker), así que aquí no se guarda nada en el navegador: si ya votó,
// la propia API devuelve mi_voto y se pintan los resultados.
// Este archivo es compartido entre noticia.html (encuesta de una noticia)
// e index.html (encuestas destacadas en portada): ambos usan las mismas
// funciones de render y de voto, solo cambia de dónde sacan los datos.

// Pinta el cuerpo de una encuesta (pregunta + opciones o resultados,
// según si ya votó o la encuesta está cerrada). "encuesta" es el objeto
// que devuelve la API (con mi_voto, opciones, total_votos...).
function encuestaWidgetHTML(encuesta) {
  const cerrada = encuesta.estado !== "abierta";
  const yaVoto = encuesta.mi_voto !== null && encuesta.mi_voto !== undefined;
  // Se muestran los resultados (barras) en vez de las opciones para
  // votar cuando la encuesta está cerrada o el lector ya votó.
  const mostrarResultados = cerrada || yaVoto;
  const maxVotos = Math.max(0, ...encuesta.opciones.map(o => o.votos || 0));

  const cuerpoResultados = `
    <div class="encuesta-resultados">
      ${encuesta.opciones.map(o => {
        const pct = encuesta.total_votos ? Math.round((o.votos / encuesta.total_votos) * 100) : 0;
        const esMiVoto = yaVoto && o.id === encuesta.mi_voto;
        const esLider = maxVotos > 0 && o.votos === maxVotos;
        return `
          <div class="encuesta-resultado-fila${esMiVoto ? " encuesta-mi-voto" : ""}${esLider ? " encuesta-lider" : ""}">
            <div class="encuesta-resultado-cabecera">
              <span class="encuesta-resultado-texto">${escapeHtml(o.texto)}${esMiVoto ? `<span class="encuesta-tu-voto">Tu voto</span>` : ""}</span>
              <span class="encuesta-pct">${pct}%</span>
            </div>
            <div class="encuesta-barra"><div class="encuesta-barra-relleno" style="width:${pct}%"></div></div>
          </div>`;
      }).join("")}
    </div>
    <p class="encuesta-total"><span>${encuesta.total_votos} voto${encuesta.total_votos === 1 ? "" : "s"}</span>${cerrada ? `<span class="encuesta-cerrada">Encuesta cerrada</span>` : ""}</p>`;

  const cuerpoVotar = `
    <form class="encuesta-form" data-poll-id="${encuesta.id}">
      ${encuesta.opciones.map(o => `
        <label class="encuesta-opcion">
          <input type="radio" name="opcion_${encuesta.id}" value="${o.id}" required>
          <span class="encuesta-opcion-texto">${escapeHtml(o.texto)}</span>
        </label>`).join("")}
      <button type="submit" class="btn-votar-encuesta">Votar</button>
      <p class="encuesta-msg encuesta-msg-error" id="encuestaError_${encuesta.id}" role="alert"></p>
    </form>`;

  return `
    <div class="encuesta-widget${mostrarResultados ? " con-resultados" : ""}" data-poll-id="${encuesta.id}">
      <span class="encuesta-etiqueta${cerrada ? " cerrada" : ""}">${cerrada ? "Encuesta cerrada" : (yaVoto ? "Gracias por votar" : "Encuesta")}</span>
      <p class="encuesta-pregunta">${escapeHtml(encuesta.pregunta)}</p>
      ${mostrarResultados ? cuerpoResultados : cuerpoVotar}
    </div>`;
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
        if (errEl) errEl.textContent = data.error || "No se ha podido registrar tu voto.";
        return;
      }
      // Sustituye el widget entero por la versión con resultados y "mi
      // voto" ya marcado, usando la respuesta que ya trae la API (sin
      // tener que volver a pedir la encuesta aparte).
      contenedor.outerHTML = encuestaWidgetHTML(data.encuesta);
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
// formulario de voto. "refrescarFnName" se conserva por compatibilidad con
// los llamadores (portada y noticia); ya no hace falta refrescar tras
// votar, porque votar no depende de ninguna sesión que pueda caducar.
function pintarEncuesta(contenedor, encuesta, refrescarFnName) {
  contenedor.outerHTML = encuestaWidgetHTML(encuesta);
  // outerHTML sustituye el nodo: hay que volver a buscarlo por selector
  // para engancharle el listener del formulario.
  const nuevo = document.querySelector(`.encuesta-widget[data-poll-id="${encuesta.id}"]`);
  if (nuevo) iniciarFormularioEncuesta(nuevo);
}
