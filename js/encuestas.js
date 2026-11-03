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
          <div class="encuesta-resultado-fila${esMiVoto ? " encuesta-mi-voto" : ""}${esLider ? " encuesta-lider" : ""}" data-opcion-id="${o.id}">
            <div class="encuesta-resultado-cabecera">
              <span class="encuesta-resultado-texto">${escapeHtml(o.texto)}${esMiVoto ? `<span class="encuesta-tu-voto">Tu voto</span>` : ""}</span>
              <span class="encuesta-pct">${pct}%</span>
            </div>
            <div class="encuesta-barra"><div class="encuesta-barra-relleno" style="width:${pct}%"></div></div>
          </div>`;
      }).join("")}
    </div>
    <p class="encuesta-total"><span class="encuesta-total-votos">${encuesta.total_votos} voto${encuesta.total_votos === 1 ? "" : "s"}</span>${cerrada ? `<span class="encuesta-cerrada">Encuesta cerrada</span>` : ""}</p>`;

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
    <div class="encuesta-widget${mostrarResultados ? " con-resultados" : ""}" data-poll-id="${encuesta.id}" data-modo="${(cerrada ? "c" : "a") + (yaVoto ? "v" : "n")}" data-cerrada="${cerrada ? "1" : "0"}">
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


// ---------- Resultados en directo ----------
// Mientras el lector tiene la página abierta, los resultados se mantienen
// al día sin recargar (usa el planificador compartido EOF_VIVO, ver
// js/en-vivo.js: solo consulta con la pestaña visible, con backoff si
// falla y desfase aleatorio). Reglas:
//  - Si el widget ya muestra resultados y sigue en el mismo estado, solo
//    se actualizan en el sitio los porcentajes, las barras (animadas) y
//    el total de votos: sin repintar, sin perder el scroll.
//  - Si cambia el estado (se cierra la encuesta, se reabre...), se repinta
//    el widget entero, salvo que el lector esté eligiendo opción: entonces
//    se espera al siguiente ciclo para no quitarle el formulario de debajo.

function _encuestaModo(encuesta) {
  const cerrada = encuesta.estado !== "abierta";
  const yaVoto = encuesta.mi_voto !== null && encuesta.mi_voto !== undefined;
  return (cerrada ? "c" : "a") + (yaVoto ? "v" : "n");
}

// Actualiza en el sitio un widget ya pintado. Devuelve true si el DOM
// cambió (para poder destacarlo), false si no hizo falta tocar nada.
function actualizarEncuestaEnVivo(encuesta) {
  const widget = document.querySelector(`.encuesta-widget[data-poll-id="${encuesta.id}"]`);
  if (!widget) return false;

  const modoNuevo = _encuestaModo(encuesta);
  const mostrandoResultados = widget.classList.contains("con-resultados");
  const deberiaResultados = modoNuevo[0] === "c" || modoNuevo[1] === "v";

  // Cambio de estado (p. ej. se cierra): repintar entero.
  if (mostrandoResultados !== deberiaResultados || widget.dataset.cerrada !== (modoNuevo[0] === "c" ? "1" : "0")) {
    const form = widget.querySelector(".encuesta-form");
    // El lector está eligiendo opción: no se le quita el formulario.
    if (form && (form.contains(document.activeElement) || form.querySelector("input:checked") || form.querySelector(".btn-votar-encuesta:disabled"))) {
      if (!(modoNuevo[0] === "c")) return false;
    }
    const html = document.createElement("div");
    html.innerHTML = encuestaWidgetHTML(encuesta).trim();
    const nuevo = html.firstElementChild;
    widget.replaceWith(nuevo);
    _marcarEstadoWidget(nuevo, modoNuevo);
    iniciarFormularioEncuesta(nuevo);
    if (window.EOF_VIVO) EOF_VIVO.resaltar(nuevo);
    return true;
  }

  // Sin resultados visibles (formulario de voto): nada que actualizar.
  if (!mostrandoResultados) { _marcarEstadoWidget(widget, modoNuevo); return false; }

  // Mismo estado con resultados: actualización en el sitio.
  let cambio = false;
  const maxVotos = Math.max(0, ...encuesta.opciones.map((o) => o.votos || 0));
  const filas = new Map([...widget.querySelectorAll(".encuesta-resultado-fila")].map((f) => [f.dataset.opcionId, f]));

  // Si las opciones han cambiado (editadas desde el panel), repintar entero.
  if (filas.size !== encuesta.opciones.length || encuesta.opciones.some((o) => !filas.has(String(o.id)))) {
    const html = document.createElement("div");
    html.innerHTML = encuestaWidgetHTML(encuesta).trim();
    const nuevo = html.firstElementChild;
    widget.replaceWith(nuevo);
    _marcarEstadoWidget(nuevo, modoNuevo);
    iniciarFormularioEncuesta(nuevo);
    if (window.EOF_VIVO) EOF_VIVO.resaltar(nuevo);
    return true;
  }

  encuesta.opciones.forEach((o) => {
    const fila = filas.get(String(o.id));
    const pct = encuesta.total_votos ? Math.round(((o.votos || 0) / encuesta.total_votos) * 100) : 0;
    const pctEl = fila.querySelector(".encuesta-pct");
    const barra = fila.querySelector(".encuesta-barra-relleno");
    if (pctEl && pctEl.textContent !== pct + "%") { pctEl.textContent = pct + "%"; cambio = true; }
    if (barra) {
      const anterior = barra.style.width;
      if (anterior !== pct + "%") { barra.style.width = pct + "%"; cambio = true; }
    }
    const esLider = maxVotos > 0 && (o.votos || 0) === maxVotos;
    fila.classList.toggle("encuesta-lider", esLider);
  });

  const totalEl = widget.querySelector(".encuesta-total-votos");
  const textoTotal = `${encuesta.total_votos} voto${encuesta.total_votos === 1 ? "" : "s"}`;
  if (totalEl && totalEl.textContent !== textoTotal) {
    totalEl.textContent = textoTotal;
    totalEl.classList.remove("encuesta-total-sube");
    void totalEl.offsetWidth;
    totalEl.classList.add("encuesta-total-sube");
    cambio = true;
  }
  _marcarEstadoWidget(widget, modoNuevo);
  return cambio;
}

function _marcarEstadoWidget(widget, modo) {
  widget.dataset.modo = modo;
  widget.dataset.cerrada = modo[0] === "c" ? "1" : "0";
}

// Registra la tarea en directo de un grupo de encuestas.
//  nombre: id único de la tarea en EOF_VIVO.
//  pedir:  async () => [encuestas]  (lanza error si la respuesta no es válida).
//  alCambiarConjunto: opcional; se llama si aparece/desaparece alguna
//                     encuesta respecto a las pintadas (p. ej. en portada).
//  ms:     intervalo (por defecto 15 s; la API ya cachea 15 s).
function iniciarEncuestasEnVivo({ nombre, pedir, alCambiarConjunto, ms }) {
  if (!window.EOF_VIVO) return;
  let firmaAnterior = null;
  EOF_VIVO.cada(nombre, async () => {
    const encuestas = await pedir();
    if (!Array.isArray(encuestas)) throw new Error("respuesta inesperada");
    const f = EOF_VIVO.firma(encuestas);
    if (f === firmaAnterior) return;
    firmaAnterior = f;

    const idsPintados = [...document.querySelectorAll(".encuesta-widget[data-poll-id]")].map((w) => String(w.dataset.pollId)).sort().join(",");
    const idsNuevos = encuestas.map((e) => String(e.id)).sort().join(",");
    if (alCambiarConjunto && idsPintados !== idsNuevos) { await alCambiarConjunto(encuestas); return; }
    encuestas.forEach((e) => actualizarEncuestaEnVivo(e));
  }, ms || 15000);
}
