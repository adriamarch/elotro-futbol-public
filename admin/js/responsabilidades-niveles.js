// ---------- Funcionalidades > Responsabilidades > Redacción y Fotografía: control de niveles (solo Responsables) ----------
// Una tarjeta por persona con su progreso hacia el SIGUIENTE nivel. Las que ya cumplen los requisitos esperan la
// decisión del Responsable («Subir de nivel» o «Ahora no», con nota opcional); debajo, «los más cerca» y el resto.
//
// Backend: GET /api/responsabilidades/niveles?area=redaccion|fotografia
//          POST /api/responsabilidades/niveles/decision { usuario_id, decision: "subir" | "aplazar", nota }
// Usa apiFetch (admin.js) y window.EOF.toast. Estilos: css/responsabilidades-niveles.css (variables --r-* de responsabilidades.css).
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const toast = (msg, tipo) => { try { window.EOF.toast(msg, tipo || "info", 3200); } catch { /* sin toast */ } };

  // [singular, plural, etiqueta corta de la barra]
  const REQ = {
    noticia: ["noticia", "noticias", "Noticias"],
    cronica: ["crónica", "crónicas", "Crónicas"],
    opinion: ["artículo de opinión", "artículos de opinión", "Opinión"],
    entrevista: ["entrevista", "entrevistas", "Entrevistas"],
    partidos: ["partido con galería", "partidos con galería", "Partidos con galería"],
    fotos: ["foto en galerías", "fotos en galerías", "Fotos en galerías"],
  };
  // Nombre de la persona como enlace a su perfil público (autor.html?id=...), en pestaña nueva.
  const perfilLink = (p) => (p && Number(p.id) > 0
    ? `<a class="rn-perfil" href="../autor.html?id=${Number(p.id)}" target="_blank" rel="noopener" title="Ver perfil público de ${esc(p.nombre)}">${esc(p.nombre)}</a>`
    : esc(p && p.nombre));
  const etiquetaReq = (t) => (REQ[t] ? REQ[t][2] : t);
  const textoCantidad = (t, n) => (REQ[t] ? `${n} ${n === 1 ? REQ[t][0] : REQ[t][1]}` : `${n} ${t}`);

  const AREAS = {
    redaccion: {
      contenedor: "respNivRedaccion", subtab: "respRedaccion",
      vacio: "No hay redactores activos por debajo del nivel máximo.",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    },
    fotografia: {
      contenedor: "respNivFotografia", subtab: "respFotografia",
      vacio: "No hay fotógrafos activos en F1.",
      ico: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>',
    },
  };
  const ICO = {
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    vacio: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>',
    refrescar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/></svg>',
    flecha: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    buscar: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  };

  const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const iniciales = (nombre) => {
    const p = String(nombre || "?").trim().split(/\s+/).filter(Boolean);
    return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
  };
  const fechaCorta = (f) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f || ""));
    if (!m) return "";
    return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))).replace(/\./g, "");
  };

  // Preferencia del aviso por correo (compartida por las dos áreas). null = aún sin cargar.
  const avisos = { email: null, guardando: false };
  const estados = {};
  Object.keys(AREAS).forEach((a) => { estados[a] = { cargando: false, error: "", datos: null, cargadoEn: 0, q: "", abierta: null, enviando: false }; });

  function faltaTexto(p) {
    const f = p.requisitos.filter((r) => !r.cumple).map((r) => textoCantidad(r.tipo, r.necesarios - r.actual));
    if (!f.length) return "";
    return f.length === 1 ? f[0] : f.slice(0, -1).join(", ") + " y " + f[f.length - 1];
  }

  function requisitosHtml(p) {
    return `<ul class="rn-reqs">${p.requisitos.map((r) => {
      const pc = r.necesarios > 0 ? Math.min(100, Math.round((r.actual / r.necesarios) * 100)) : 100;
      return `<li class="rn-req${r.cumple ? " rn-req-ok" : ""}">
        <span class="rn-req-n">${r.cumple ? `<i class="rn-tic">${ICO.ok}</i>` : ""}${esc(etiquetaReq(r.tipo))}</span>
        <span class="rn-req-v"><b>${r.actual}</b> / ${r.necesarios}</span>
        <span class="rn-barra"><i style="width:${pc}%"></i></span>
      </li>`;
    }).join("")}</ul>`;
  }

  function valoracionHtml(p) {
    const v = p.valoracion;
    if (!v) return "";
    const cuando = fechaCorta(v.fecha);
    return `<div class="rn-valorada"><strong>Valorado: ahora no</strong><span>${esc(v.por || "")}${cuando ? ` · ${esc(cuando)}` : ""}</span>${v.nota ? `<em>${esc(v.nota)}</em>` : ""}</div>`;
  }

  function decisionHtml(a, p) {
    const st = estados[a];
    if (st.abierta && st.abierta.id === p.id) {
      const sube = st.abierta.decision === "subir";
      return `<div class="rn-decide" data-rn-id="${p.id}">
        <label class="rn-nota-lbl" for="rnNota-${a}-${p.id}">${sube ? `Nota para ${esc(p.nombre)} (opcional, la verá en «Mi progreso»)` : "Motivo (opcional, solo lo ven los Responsables)"}</label>
        <textarea class="rn-nota" id="rnNota-${a}-${p.id}" maxlength="500" rows="2" placeholder="${sube ? "Ej.: gran evolución este trimestre" : "Ej.: esperar a ver la próxima jornada"}"></textarea>
        <div class="rn-acciones">
          <button type="button" class="rn-btn ${sube ? "rn-btn-pri" : "rn-btn-sec"}" data-rn="confirmar" data-area="${a}" ${st.enviando ? "disabled" : ""}>${sube ? `Confirmar: subir a ${esc(p.siguiente.etiqueta)}` : "Confirmar: ahora no"}</button>
          <button type="button" class="rn-btn rn-btn-txt" data-rn="cancelar" data-area="${a}" ${st.enviando ? "disabled" : ""}>Cancelar</button>
        </div>
      </div>`;
    }
    return `<div class="rn-acciones">
      <button type="button" class="rn-btn rn-btn-pri" data-rn="subir" data-area="${a}" data-id="${p.id}">Subir a ${esc(p.siguiente.etiqueta)} ${ICO.flecha}</button>
      <button type="button" class="rn-btn rn-btn-sec" data-rn="aplazar" data-area="${a}" data-id="${p.id}">Ahora no</button>
    </div>`;
  }

  function tarjetaHtml(a, p) {
    const listo = p.cumple;
    const falta = faltaTexto(p);
    return `<article class="rn-card${listo ? " rn-listo" : ""}${p.valoracion ? " rn-valorado" : ""}">
      <header class="rn-cab">
        <span class="rn-avatar" aria-hidden="true">${esc(iniciales(p.nombre))}</span>
        <div class="rn-quien">
          <h5>${perfilLink(p)}</h5>
          <p class="rn-nivel"><span class="rn-pill">${esc(p.actual.etiqueta)}</span><i class="rn-flecha">${ICO.flecha}</i><span class="rn-pill rn-pill-sig">${esc(p.siguiente.etiqueta)} · ${esc(p.siguiente.nombre)}</span></p>
        </div>
        <span class="rn-anillo" style="--p:${p.porcentaje}" role="img" aria-label="${p.porcentaje}% completado"><b>${p.porcentaje}<small>%</small></b></span>
      </header>
      <div class="rn-estado ${listo ? "rn-estado-ok" : "rn-estado-no"}">${listo ? `<i>${ICO.ok}</i> Cumple los requisitos para ${esc(p.siguiente.etiqueta)}` : `Falta: ${esc(falta)}`}</div>
      <div class="rn-cuerpo">
        ${requisitosHtml(p)}
        ${valoracionHtml(p)}
        ${p.en_nivel_desde ? `<p class="rn-meta">En ${esc(p.actual.etiqueta)} desde ${esc(fechaCorta(p.en_nivel_desde))}</p>` : ""}
        ${listo ? decisionHtml(a, p) : ""}
      </div>
    </article>`;
  }

  function cercanosHtml(d) {
    const por = new Map(d.personas.map((p) => [p.id, p]));
    const lista = d.cercanos.map((id) => por.get(id)).filter(Boolean);
    if (!lista.length) return "";
    return `<section class="rn-bloque rn-cercanos" aria-label="Los que más cerca están">
      <h4 class="rn-tit">Los que más cerca están <span class="rn-tit-n">${lista.length}</span></h4>
      <ol class="rn-rank">${lista.map((p, i) => `<li>
        <span class="rn-pos">${i + 1}</span>
        <span class="rn-rank-quien"><b>${perfilLink(p)}</b><small>${esc(p.actual.etiqueta)} → ${esc(p.siguiente.etiqueta)} · ${esc(faltaTexto(p))}</small></span>
        <span class="rn-rank-pc"><span class="rn-barra"><i style="width:${p.porcentaje}%"></i></span><b>${p.porcentaje}%</b></span>
      </li>`).join("")}</ol>
    </section>`;
  }

  function filtrar(d, q) {
    const n = sinTildes(q).trim();
    return n ? d.personas.filter((p) => sinTildes(p.nombre).includes(n)) : d.personas;
  }

  function pintar(a) {
    const cont = $(AREAS[a].contenedor);
    if (!cont) return;
    const st = estados[a];
    const aviso = avisos.email === null ? "" : `<label class="rn-aviso" title="El aviso push se activa en la campanita del panel (categoría «Niveles»)">
        <input type="checkbox" data-rn="correo" ${avisos.email ? "checked" : ""} ${avisos.guardando ? "disabled" : ""}>
        <span class="rn-aviso-sw" aria-hidden="true"></span>
        <span class="rn-aviso-txt">Avisarme por correo cuando alguien cumpla los requisitos</span>
      </label>`;
    const barra = `<div class="rn-barra-acc">
      ${aviso}
      <span class="rn-act">${st.cargadoEn ? "Actualizado " + new Date(st.cargadoEn).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
      <button type="button" class="resp-btn rn-btn-act" data-rn="recargar" data-area="${a}" ${st.cargando ? "disabled" : ""}>${ICO.refrescar} Actualizar</button>
    </div>`;
    if (st.error && !st.datos) { cont.innerHTML = barra + `<p class="rn-error" role="alert">${esc(st.error)}</p>`; return; }
    if (!st.datos) { cont.innerHTML = barra + `<p class="solicitudes-vacio">${st.cargando ? "Cargando…" : "Abre esta pestaña para cargar los niveles."}</p>`; return; }
    const d = st.datos;
    const visibles = filtrar(d, st.q);
    const listos = visibles.filter((p) => p.cumple);
    const resto = visibles.filter((p) => !p.cumple);
    const chips = `<div class="rn-resumen">
      <div class="rn-chip${d.resumen.listos ? " rn-chip-ok" : ""}"><b>${d.resumen.listos}</b><span>Listos para decidir</span></div>
      <div class="rn-chip"><b>${d.personas.length - d.resumen.listos}</b><span>En camino</span></div>
      <div class="rn-chip"><b>${d.resumen.en_maximo}</b><span>En el nivel máximo</span></div>
    </div>`;
    const buscador = d.personas.length > 6
      ? `<label class="rn-busca"><i>${ICO.buscar}</i><input type="search" data-rn-q="${a}" value="${esc(st.q)}" placeholder="Buscar por nombre" autocomplete="off" aria-label="Buscar por nombre"></label>` : "";
    let html = barra + chips;
    if (!d.personas.length) {
      html += `<p class="solicitudes-vacio">${esc(AREAS[a].vacio)}</p>`;
    } else {
      html += cercanosHtml(d) + buscador;
      if (listos.length) html += `<section class="rn-bloque"><h4 class="rn-tit">Listos para decidir <span class="rn-tit-n">${listos.length}</span></h4><div class="rn-grid">${listos.map((p) => tarjetaHtml(a, p)).join("")}</div></section>`;
      if (resto.length) html += `<section class="rn-bloque"><h4 class="rn-tit">En camino <span class="rn-tit-n">${resto.length}</span></h4><div class="rn-grid">${resto.map((p) => tarjetaHtml(a, p)).join("")}</div></section>`;
      if (!visibles.length) html += `<p class="solicitudes-vacio">Nadie coincide con «${esc(st.q)}».</p>`;
    }
    if (d.en_maximo.length) html += `<p class="rn-maximo"><b>Nivel máximo (${esc(d.en_maximo[0].etiqueta)}):</b> ${d.en_maximo.map(perfilLink).join(", ")}</p>`;
    // Se conserva el foco del buscador y lo escrito en la nota mientras se repinta.
    const nota = cont.querySelector(".rn-nota");
    const notaTxt = nota ? nota.value : "";
    const enfocado = document.activeElement && document.activeElement.matches && document.activeElement.matches("[data-rn-q]");
    const pos = enfocado ? document.activeElement.selectionStart : null;
    cont.innerHTML = html;
    const notaNueva = cont.querySelector(".rn-nota");
    if (notaNueva) { notaNueva.value = notaTxt; if (st.abierta && !st.recienAbierta) notaNueva.focus(); }
    if (notaNueva && st.recienAbierta) { notaNueva.focus(); st.recienAbierta = false; }
    if (enfocado) { const i = cont.querySelector("[data-rn-q]"); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch { /* tipo search */ } } }
  }

  async function cargarAvisos() {
    try { avisos.email = !!(await apiFetch("/api/responsabilidades/niveles/avisos")).email; }
    catch { avisos.email = null; }
    Object.keys(AREAS).forEach(pintar);
  }

  async function guardarCorreo(activo) {
    avisos.guardando = true; avisos.email = activo;
    Object.keys(AREAS).forEach(pintar);
    try {
      avisos.email = !!(await apiFetch("/api/responsabilidades/niveles/avisos", { method: "PUT", body: JSON.stringify({ email: activo }) })).email;
      toast(avisos.email ? "Te avisaremos por correo" : "Aviso por correo desactivado", "ok");
    } catch (err) {
      avisos.email = !activo;
      toast((err && err.message) || "No se pudo guardar", "error");
    } finally {
      avisos.guardando = false;
      Object.keys(AREAS).forEach(pintar);
    }
  }

  async function cargar(a) {
    const st = estados[a];
    if (st.cargando) return;
    st.cargando = true; st.error = "";
    pintar(a);
    if (avisos.email === null) cargarAvisos();
    try {
      st.datos = await apiFetch(`/api/responsabilidades/niveles?area=${encodeURIComponent(a)}`);
      st.cargadoEn = Date.now();
    } catch (err) {
      st.error = (err && err.message) || "No se pudieron cargar los niveles";
      if (st.datos) toast(st.error, "error");
    } finally {
      st.cargando = false;
      pintar(a);
    }
  }

  async function confirmar(a) {
    const st = estados[a];
    if (!st.abierta || st.enviando) return;
    const cont = $(AREAS[a].contenedor);
    const nota = cont && cont.querySelector(".rn-nota") ? cont.querySelector(".rn-nota").value.trim() : "";
    const { id, decision } = st.abierta;
    const p = st.datos && st.datos.personas.find((x) => x.id === id);
    st.enviando = true; pintar(a);
    try {
      const r = await apiFetch("/api/responsabilidades/niveles/decision", { method: "POST", body: JSON.stringify({ usuario_id: id, decision, nota }) });
      const et = /^\d$/.test(String(r.etiqueta)) ? "N" + r.etiqueta : r.etiqueta;
      toast(r.decision === "subido" ? `${p ? p.nombre : "La persona"} sube a ${et}` : "Anotado: de momento no sube", "ok");
      st.abierta = null;
    } catch (err) {
      toast((err && err.message) || "No se pudo guardar la decisión", "error");
    } finally {
      st.enviando = false;
      st.cargando = false;
      await cargar(a);
    }
  }

  function enlazar(a) {
    const cont = $(AREAS[a].contenedor);
    if (!cont || cont.dataset.rnListo) return;
    cont.dataset.rnListo = "1";
    cont.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rn]");
      if (!b) return;
      const st = estados[a];
      const acc = b.dataset.rn;
      if (acc === "correo") guardarCorreo(!!b.checked);
      else if (acc === "recargar") cargar(a);
      else if (acc === "subir" || acc === "aplazar") { st.abierta = { id: Number(b.dataset.id), decision: acc === "subir" ? "subir" : "aplazar" }; st.recienAbierta = true; pintar(a); }
      else if (acc === "cancelar") { st.abierta = null; pintar(a); }
      else if (acc === "confirmar") confirmar(a);
    });
    cont.addEventListener("input", (e) => {
      const i = e.target.closest("[data-rn-q]");
      if (!i) return;
      estados[a].q = i.value;
      pintar(a);
    });
  }

  function iniciar() {
    Object.keys(AREAS).forEach((a) => {
      enlazar(a);
      pintar(a);
      const boton = document.querySelector(`#subtabsResponsabilidades [data-subtab="${AREAS[a].subtab}"]`);
      if (boton) boton.addEventListener("click", () => {
        const st = estados[a];
        if (!st.datos || Date.now() - st.cargadoEn > 60000) cargar(a);
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();

  window.EOFResponsabilidadesNiveles = { cargar: (a) => cargar(a || "redaccion") };
})();
