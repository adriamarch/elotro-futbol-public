/* =====================================================================
   HISTORIAL DE VERSIONES DE UNA NOTICIA (editor de noticias del panel)
   Botón #btnHistorialVersiones (junto a "Previsualizar") -> modal con las
   versiones guardadas (GET /api/articles/:id/versiones). Al elegir una se ve
   comparada con el texto que hay AHORA en el editor y se puede restaurar:
   restaurar solo carga titular, subtítulo y texto en el editor; no guarda nada
   hasta que se pulsa Guardar (y entonces se crea una versión nueva, así que
   nunca se pierde nada). Estilos: css/historial-versiones.css
   ===================================================================== */
(function () {
  "use strict";

  const MOTIVOS = {
    creacion: "Creada",
    edicion: "Edición",
    revision: "Revisión (Nivel 4)",
    inicial: "Versión anterior al historial",
  };
  // Tope de palabras por texto para la comparación (LCS es O(n·m)).
  const MAX_TOKENS_DIFF = 2500;

  let modal = null;
  let versiones = [];
  let seleccionId = null;
  let versionCargada = null; // versión completa de la seleccionada
  let vista = "cambios"; // "cambios" | "version"
  let peticion = 0;

  const esc = (t) => (typeof escapeHtml === "function" ? escapeHtml(t) : String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));

  function idNoticiaEnEdicion() {
    const v = document.getElementById("articleId")?.value;
    return v ? parseInt(v, 10) : null;
  }

  // Muestra el botón solo mientras se edita una noticia que ya existe.
  window.actualizarBotonHistorialVersiones = function () {
    const btn = document.getElementById("btnHistorialVersiones");
    if (btn) btn.style.display = idNoticiaEnEdicion() ? "inline-block" : "none";
  };

  function fechaLegible(iso) {
    if (!iso) return "";
    const f = new Date(String(iso).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(iso)) ? "" : "Z"));
    if (isNaN(f.getTime())) return String(iso);
    return f.toLocaleString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  }

  // HTML -> texto plano con saltos de línea entre párrafos. DOMParser es inerte:
  // no carga imágenes ni ejecuta nada del contenido.
  function htmlATexto(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    doc.querySelectorAll("br").forEach((e) => e.replaceWith("\n"));
    doc.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,blockquote,div,figure,figcaption").forEach((e) => e.appendChild(doc.createTextNode("\n")));
    return (doc.body.textContent || "").replace(/[ \t\u00a0]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function textoActualEditor() {
    const ed = document.getElementById("contenidoEditor");
    return htmlATexto(ed ? ed.innerHTML : "");
  }

  const tokenizar = (t) => t.match(/\n+|[^\s]+/g) || [];

  // Diff por palabras (LCS). Devuelve [{t:"=", w}, {t:"+", w} (solo en la versión), {t:"-", w} (solo en el editor ahora)].
  function diffPalabras(actual, version) {
    let a = tokenizar(actual);
    let b = tokenizar(version);
    if (a.length > MAX_TOKENS_DIFF || b.length > MAX_TOKENS_DIFF) return null;
    // Recorta prefijo y sufijo comunes (lo normal: se cambia solo una parte).
    let ini = 0;
    while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++;
    let finA = a.length, finB = b.length;
    while (finA > ini && finB > ini && a[finA - 1] === b[finB - 1]) { finA--; finB--; }
    const prefijo = a.slice(0, ini).map((w) => ({ t: "=", w }));
    const sufijo = a.slice(finA).map((w) => ({ t: "=", w }));
    const A = a.slice(ini, finA), B = b.slice(ini, finB);
    const n = A.length, m = B.length;
    const ops = [];
    if (!n || !m) {
      A.forEach((w) => ops.push({ t: "-", w }));
      B.forEach((w) => ops.push({ t: "+", w }));
    } else {
      const ancho = m + 1;
      const L = new Uint16Array((n + 1) * ancho);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          L[i * ancho + j] = A[i] === B[j] ? L[(i + 1) * ancho + j + 1] + 1 : Math.max(L[(i + 1) * ancho + j], L[i * ancho + j + 1]);
        }
      }
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (A[i] === B[j]) { ops.push({ t: "=", w: A[i] }); i++; j++; }
        else if (L[(i + 1) * ancho + j] >= L[i * ancho + j + 1]) { ops.push({ t: "-", w: A[i++] }); }
        else { ops.push({ t: "+", w: B[j++] }); }
      }
      while (i < n) ops.push({ t: "-", w: A[i++] });
      while (j < m) ops.push({ t: "+", w: B[j++] });
    }
    return prefijo.concat(ops, sufijo);
  }

  function pintarDiff(ops) {
    let html = "";
    let nuevas = 0, perdidas = 0;
    for (const op of ops) {
      if (/^\n+$/.test(op.w)) { html += op.w.length > 1 ? "<br><br>" : "<br>"; continue; }
      const w = esc(op.w);
      if (op.t === "+") { html += `<ins>${w}</ins> `; nuevas++; }
      else if (op.t === "-") { html += `<del>${w}</del> `; perdidas++; }
      else html += `${w} `;
    }
    return { html, nuevas, perdidas };
  }

  function crearModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "modal-overlay hv-overlay";
    modal.id = "modalHistorialVersiones";
    modal.innerHTML = `
      <div class="modal-caja hv-caja" role="dialog" aria-modal="true" aria-labelledby="hvTitulo">
        <button type="button" class="modal-cerrar" data-hv-cerrar aria-label="Cerrar">&times;</button>
        <h3 class="titulo-subseccion" id="hvTitulo">🕘 Historial de versiones</h3>
        <p class="ayuda-editor hv-intro" id="hvIntro"></p>
        <div class="hv-cuerpo">
          <ul class="hv-lista" id="hvLista" aria-label="Versiones guardadas"></ul>
          <section class="hv-detalle" id="hvDetalle" aria-live="polite"></section>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest("[data-hv-cerrar]")) cerrar();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("abierto")) cerrar();
    });
    modal.querySelector("#hvLista").addEventListener("click", (e) => {
      const li = e.target.closest("[data-vid]");
      if (li) seleccionar(parseInt(li.dataset.vid, 10));
    });
    modal.querySelector("#hvDetalle").addEventListener("click", (e) => {
      const modoBtn = e.target.closest("[data-hv-vista]");
      if (modoBtn) { vista = modoBtn.dataset.hvVista; pintarDetalle(); return; }
      if (e.target.closest("[data-hv-restaurar]")) restaurar();
    });
    return modal;
  }

  function cerrar() {
    if (modal) modal.classList.remove("abierto");
  }

  function pintarLista() {
    const ul = modal.querySelector("#hvLista");
    if (!versiones.length) { ul.innerHTML = ""; return; }
    ul.innerHTML = versiones.map((v) => {
      const motivo = MOTIVOS[v.motivo] || "Edición";
      const quien = v.editor_nombre ? esc(v.editor_nombre) : "Autor no registrado";
      const activo = v.id === seleccionId ? " activa" : "";
      return `<li class="hv-item${activo}" data-vid="${v.id}" tabindex="0" role="button" aria-pressed="${v.id === seleccionId}">
        <span class="hv-num">v${esc(v.numero)}</span>
        <span class="hv-meta"><strong>${quien}</strong><small>${esc(fechaLegible(v.created_at))}</small><small class="hv-motivo hv-motivo-${esc(v.motivo)}">${esc(motivo)}</small></span>
      </li>`;
    }).join("");
    ul.querySelectorAll(".hv-item").forEach((li) => li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); seleccionar(parseInt(li.dataset.vid, 10)); }
    }));
  }

  function pintarDetalle() {
    const cont = modal.querySelector("#hvDetalle");
    const v = versionCargada;
    if (!v) {
      cont.innerHTML = versiones.length
        ? `<p class="hv-vacio">Elige una versión de la lista para ver qué cambió.</p>`
        : "";
      return;
    }
    const textoVersion = htmlATexto(v.contenido);
    const textoActual = textoActualEditor();
    const ops = vista === "cambios" ? diffPalabras(textoActual, textoVersion) : null;
    let cuerpo, resumen = "";
    if (vista === "cambios" && ops) {
      const r = pintarDiff(ops);
      cuerpo = `<div class="hv-texto hv-diff">${r.html}</div>`;
      resumen = (r.nuevas || r.perdidas)
        ? `<p class="hv-resumen"><ins>${r.nuevas} palabra${r.nuevas === 1 ? "" : "s"}</ins> de esta versión que ahora no están en el editor · <del>${r.perdidas} palabra${r.perdidas === 1 ? "" : "s"}</del> del editor que se perderían al restaurar</p>`
        : `<p class="hv-resumen">El texto de esta versión es igual al que hay ahora en el editor.</p>`;
    } else {
      const aviso = vista === "cambios" ? `<p class="hv-resumen">El texto es demasiado largo para marcar los cambios palabra a palabra; se muestra la versión completa.</p>` : "";
      resumen = aviso;
      cuerpo = `<div class="hv-texto">${esc(textoVersion).replace(/\n/g, "<br>")}</div>`;
    }
    const cambiaTitulo = (document.getElementById("titulo")?.value || "") !== (v.titulo || "");
    const cambiaSub = (document.getElementById("subtitulo")?.value || "") !== (v.subtitulo || "");
    cont.innerHTML = `
      <div class="hv-cabecera-detalle">
        <div>
          <h4 class="hv-titulo-version">${esc(v.titulo || "(sin titular)")}${cambiaTitulo ? ` <span class="hv-chip">titular distinto al actual</span>` : ""}</h4>
          ${v.subtitulo ? `<p class="hv-subtitulo">${esc(v.subtitulo)}${cambiaSub ? ` <span class="hv-chip">subtítulo distinto al actual</span>` : ""}</p>` : (cambiaSub ? `<p class="hv-subtitulo"><span class="hv-chip">sin subtítulo (el actual tiene)</span></p>` : "")}
          <p class="hv-quien">v${esc(v.numero)} · ${v.editor_nombre ? esc(v.editor_nombre) : "autor no registrado"} · ${esc(fechaLegible(v.created_at))}</p>
        </div>
        <div class="hv-modo" role="group" aria-label="Vista">
          <button type="button" class="${vista === "cambios" ? "activo" : ""}" data-hv-vista="cambios">Cambios</button>
          <button type="button" class="${vista === "version" ? "activo" : ""}" data-hv-vista="version">Versión completa</button>
        </div>
      </div>
      ${resumen}
      ${cuerpo}
      <div class="hv-acciones">
        <button type="button" class="btn-primari" data-hv-restaurar>Restaurar en el editor</button>
        <p class="hv-nota">Solo carga el titular, el subtítulo y el texto en el editor. No se guarda nada hasta que pulses Guardar (y entonces se crea una versión nueva: no pierdes nada).</p>
      </div>`;
  }

  async function seleccionar(vid) {
    const id = idNoticiaEnEdicion();
    if (!id) return;
    seleccionId = vid;
    pintarLista();
    const cont = modal.querySelector("#hvDetalle");
    cont.innerHTML = `<p class="hv-vacio">Cargando versión…</p>`;
    const mia = ++peticion;
    try {
      const { version } = await apiFetch(`/api/articles/${id}/versiones/${vid}`);
      if (mia !== peticion) return; // se pidió otra mientras tanto
      versionCargada = version;
      pintarDetalle();
    } catch (err) {
      if (mia !== peticion) return;
      versionCargada = null;
      cont.innerHTML = `<p class="hv-error">No se ha podido cargar la versión: ${esc(err.message || "error")}</p>`;
    }
  }

  async function restaurar() {
    const v = versionCargada;
    if (!v) return;
    const textoNativo = `Se sustituirán el titular, el subtítulo y el texto del editor por los de la versión v${v.numero}. Lo que hay ahora en el editor y no hayas guardado se perderá. ¿Continuar?`;
    const ok = window.EOFModalesPartido && EOFModalesPartido.confirmarAccion
      ? await EOFModalesPartido.confirmarAccion({
          icono: "aviso", titulo: `Restaurar la versión v${v.numero}`,
          sub: "Se carga en el editor; no se guarda hasta que pulses Guardar.",
          cabecera: { etiqueta: `${v.editor_nombre || "Autor no registrado"} · ${fechaLegible(v.created_at)}`, texto: v.titulo || "(sin titular)" },
          items: ["Sustituye el <b>titular</b>, el <b>subtítulo</b> y el <b>texto</b> del editor.", "Lo que hay ahora en el editor y <b>no hayas guardado</b> se perderá.", "Las fotos, categoría y demás datos <b>no cambian</b>."],
          confirmar: "Sí, restaurar en el editor", peligroso: false,
        })
      : (window.EOF && EOF.confirmar ? await EOF.confirmar(textoNativo, { textoConfirmar: "Restaurar" }) : confirm(textoNativo));
    if (!ok) return;
    const titulo = document.getElementById("titulo");
    const subtitulo = document.getElementById("subtitulo");
    const editor = document.getElementById("contenidoEditor");
    if (titulo) { titulo.value = v.titulo || ""; titulo.dispatchEvent(new Event("input", { bubbles: true })); }
    if (subtitulo) { subtitulo.value = v.subtitulo || ""; subtitulo.dispatchEvent(new Event("input", { bubbles: true })); }
    if (editor) {
      editor.innerHTML = typeof sanearHtmlContenido === "function" ? sanearHtmlContenido(v.contenido || "") : (v.contenido || "");
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    cerrar();
    try { EOF.toast(`Versión v${v.numero} cargada en el editor. Revísala y pulsa Guardar para aplicarla.`, "exito"); } catch {}
    document.getElementById("titulo")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function abrir() {
    const id = idNoticiaEnEdicion();
    if (!id) return;
    crearModal();
    versiones = [];
    seleccionId = null;
    versionCargada = null;
    vista = "cambios";
    peticion++;
    modal.querySelector("#hvIntro").textContent = "Cargando historial…";
    modal.querySelector("#hvLista").innerHTML = "";
    modal.querySelector("#hvDetalle").innerHTML = "";
    modal.classList.add("abierto");
    try {
      const r = await apiFetch(`/api/articles/${id}/versiones`);
      versiones = r.versiones || [];
      const intro = modal.querySelector("#hvIntro");
      if (!versiones.length) {
        intro.textContent = r.sin_tabla
          ? "El historial todavía no está activado en el servidor (falta aplicar la migración)."
          : "Esta noticia aún no tiene versiones guardadas. Aparecerán a partir de su próximo guardado.";
        return;
      }
      intro.textContent = `Se guarda una versión cada vez que se guarda la noticia (las últimas ${r.max || 60}). Elige una para ver qué cambió respecto a lo que hay ahora en el editor.`;
      pintarLista();
      pintarDetalle();
    } catch (err) {
      modal.querySelector("#hvIntro").textContent = "No se ha podido cargar el historial: " + (err.message || "error");
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("#btnHistorialVersiones")) abrir();
  });
})();
