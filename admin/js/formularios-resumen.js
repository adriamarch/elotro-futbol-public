// ---------- Resumen automático de respuestas + explorador de personas de un formulario ----------
// Se pinta en Solicitudes > Formularios > (un formulario), encima de la lista de respuestas.
// Es genérico: lee FORM_ACTUAL.campos y FORM_RESP (de admin.js), así que funciona con cualquier
// formulario y se actualiza solo cada vez que llegan o cambian respuestas.
//
//  · Los gráficos agregan recuentos (no muestran correos ni textos libres).
//  · EXPLORADOR DE PERSONAS: se puede pulsar una opción de cualquier gráfico, o añadir condiciones
//    (edad = 13-17, grabación en estadio = Sí, tipos de contenido = Podcasts…), para ver QUIÉN la
//    marcó. Entre preguntas distintas se exige que se cumplan todas (Y); dentro de una misma pregunta
//    se puede pedir «alguna» de las opciones (O) o «todas». También hay búsqueda por texto libre.
//  · El filtro también recorta la lista de respuestas de abajo (admin.js llama a frsFiltrar) y se
//    puede copiar la lista de nombres o descargar un CSV solo con esas personas.
// Lo llama pintarRespuestasFormulario() (admin.js). No hay backend nuevo.
let FORM_RESUMEN_ABIERTO = true;
let FORM_RESUMEN_REF = null; // última lista de respuestas pintada (para no repintar sin necesidad)
let FORM_RESUMEN_FORM = null;
let FORM_RESUMEN_SIG = "";   // firma de los filtros pintados

const FRS_TIPOS_GRAFICO = ["opcion", "desplegable", "casillas"];
const FRS_TIPOS_FILTRO = ["opcion", "desplegable", "casillas", "confirmacion"];
const FRS_SIN = "(sin responder)";

// Estado del explorador (se reinicia al abrir otro formulario o volver a abrir el mismo)
let FRS_FILTROS = [];   // [{ campo, vals: [..], modo: "alguna" | "todas" }]
let FRS_BUSCA = "";     // texto libre
let FRS_EDIT = null;    // condición que se está creando / editando: { campo, vals, modo }
let FRS_EDIT_IDX = -1;

function frsPct(n, t) { return t ? Math.round((n / t) * 100) : 0; }
function frsNum(x) { return (Math.round(x * 10) / 10).toFixed(1).replace(".", ","); }
function frsVals(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = v == null ? "" : String(v).trim();
  return s ? [s] : [];
}
// Valores de una respuesta para una pregunta (la casilla de confirmación cuenta como Sí / No)
function frsValsCampo(c, datos) {
  const v = datos && datos[c.id];
  if (c.tipo === "confirmacion") return [v === true || v === "true" || v === "Sí" ? "Sí" : "No"];
  return frsVals(v);
}
function frsNorm(t) { return String(t == null ? "" : t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function frsCamposFiltro() {
  return (FORM_ACTUAL && FORM_ACTUAL.campos || []).filter((c) => FRS_TIPOS_FILTRO.includes(c.tipo) && !c.unica && !c.alta_usuario);
}
function frsCampoPorId(id) { return (FORM_ACTUAL && FORM_ACTUAL.campos || []).find((c) => c.id === id) || null; }
function frsSel(campoId) {
  const f = FRS_FILTROS.find((x) => x.campo === campoId);
  return new Set(f ? f.vals : []);
}
function frsHayFiltro() { return FRS_FILTROS.length > 0 || FRS_BUSCA.trim() !== ""; }
function frsFirma() { return JSON.stringify([FRS_FILTROS, FRS_BUSCA, FRS_EDIT, FRS_EDIT_IDX]); }

// Recuentos de un campo: respondieron (n), cuenta por opción y, si es escala numérica, la media.
function frsCampo(c, resp) {
  const cuenta = new Map();
  let n = 0;
  resp.forEach((r) => {
    const vs = frsVals(r.datos && r.datos[c.id]);
    if (!vs.length) return;
    n++;
    vs.forEach((v) => cuenta.set(v, (cuenta.get(v) || 0) + 1));
  });
  const filas = [...cuenta.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "es"));
  const esEscala = c.tipo === "opcion" && (c.opciones || []).length > 1 && (c.opciones || []).every((o) => /^\d+$/.test(String(o).trim()));
  let media = null;
  if (esEscala && n) media = filas.reduce((s, [v, k]) => s + Number(v) * k, 0) / n;
  return { c, n, filas, esEscala, media, max: esEscala ? Math.max(...c.opciones.map(Number)) : 0 };
}

// Respuestas antiguas (p. ej. importadas) pueden no traer el campo que controla otros (como el rol).
// Si falta, se deduce de las preguntas condicionadas que sí contestó (nombre_red => Redactor).
function frsInferir(campos, resp) {
  const cond = campos.filter((c) => c.mostrar_si && c.mostrar_si.campo);
  return resp.map((r) => {
    const datos = { ...(r.datos || {}) };
    cond.forEach((c) => {
      const ctl = c.mostrar_si.campo;
      if (!frsVals(datos[ctl]).length && frsVals(datos[c.id]).length) datos[ctl] = c.mostrar_si.igual;
    });
    return { ...r, datos };
  });
}

// ---------- Filtrado ----------
function frsCumple(r, filtros, busca) {
  for (const f of filtros) {
    const c = frsCampoPorId(f.campo);
    if (!c || !f.vals.length) continue;
    const rv = frsValsCampo(c, r.datos);
    const tiene = (v) => (v === FRS_SIN ? rv.length === 0 : rv.includes(v));
    const ok = f.modo === "todas" ? f.vals.every(tiene) : f.vals.some(tiene);
    if (!ok) return false;
  }
  const q = frsNorm(busca).split(/\s+/).filter(Boolean);
  if (q.length) {
    const txt = frsNorm(Object.entries(r.datos || {}).filter(([k]) => !k.startsWith("_")).map(([, v]) => (Array.isArray(v) ? v.join(" ") : String(v == null ? "" : v))).join(" | "));
    if (!q.every((t) => txt.includes(t))) return false;
  }
  return true;
}
// Devuelve las respuestas (objetos originales de FORM_RESP) que cumplen los filtros activos.
// `sinCampo`: ignora el filtro de esa pregunta (para que sus gráficos sigan mostrando todas las opciones).
function frsFiltrar(lista, sinCampo) {
  const filtros = FRS_FILTROS.filter((f) => f.campo !== sinCampo);
  if (!filtros.length && !FRS_BUSCA.trim()) return lista;
  const inf = new Map(frsInferir(FORM_ACTUAL.campos || [], lista).map((r) => [r.id, r]));
  return lista.filter((r) => frsCumple(inf.get(r.id) || r, filtros, FRS_BUSCA));
}

// ---------- Gráficos ----------
const FRS_N_COLORES = 8;
function frsColor(i) { return `var(--frs-c${i % FRS_N_COLORES})`; }
function frsAtrClick(campoId, v) {
  return campoId ? `data-frs="alt" data-campo="${escapeHtml(campoId)}" data-val="${escapeHtml(v)}" role="button" tabindex="0" title="Ver quién ha marcado «${escapeHtml(v)}»"` : "";
}

// Barras horizontales con degradado: para preguntas de varias opciones o con muchos valores.
function frsBarras(filas, n, limite, campoId) {
  const sel = frsSel(campoId);
  const top = filas.filter(([v], i) => i < limite || sel.has(v));
  const mx = top.length ? Math.max(...top.map((f) => f[1])) : 1;
  const resto = filas.length - top.length;
  return `<div class="frs-barras">${top.map(([v, k], i) => `<div class="frs-fila ${campoId ? "frs-click" : ""} ${sel.has(v) ? "frs-sel" : ""}" ${frsAtrClick(campoId, v)}><span class="frs-et" title="${escapeHtml(v)}">${escapeHtml(v)}</span><span class="frs-pista"><span class="frs-barra" style="--w:${(k / mx) * 100}%;--i:${i}"></span></span><span class="frs-val"><b>${k}</b><small>${frsPct(k, n)} %</small></span></div>`).join("")}</div>`
    + (resto > 0 ? `<p class="frs-mas">+ ${resto} opciones más con menos respuestas (usa «Añadir condición» para elegirlas)</p>` : "");
}

// Donut para preguntas de opción única con pocas opciones (los tramos suman el 100 %).
function frsDonut(filas, n, campoId) {
  const sel = frsSel(campoId);
  let acc = 0;
  const tramos = filas.map(([, k], i) => { const ini = acc; acc += k; return `${frsColor(i)} ${(ini / n) * 100}% ${(acc / n) * 100}%`; });
  const [v0, k0] = filas[0];
  const leyenda = filas.map(([v, k], i) => `<li class="${campoId ? "frs-click" : ""} ${sel.has(v) ? "frs-sel" : ""}" ${frsAtrClick(campoId, v)}><span class="frs-punto" style="background:${frsColor(i)}"></span><span class="frs-ley-et" title="${escapeHtml(v)}">${escapeHtml(v)}</span><span class="frs-val"><b>${k}</b><small>${frsPct(k, n)} %</small></span></li>`).join("");
  return `<div class="frs-donut-wrap">
    <div class="frs-donut" style="background:conic-gradient(${tramos.join(",")})" role="img" aria-label="${escapeHtml(v0)}: ${frsPct(k0, n)} %">
      <div class="frs-donut-centro"><b>${frsPct(k0, n)} %</b><small>${escapeHtml(v0)}</small></div>
    </div>
    <ul class="frs-leyenda">${leyenda}</ul>
  </div>`;
}

function frsTarjeta(d, limite, total) {
  const casillas = d.c.tipo === "casillas";
  const t = casillas ? "Varias opciones: los % suman más de 100" : "Opción única";
  const cuerpo = !casillas && d.filas.length <= 5 ? frsDonut(d.filas, d.n, d.c.id) : frsBarras(d.filas, d.n, limite, d.c.id);
  const activo = FRS_FILTROS.some((f) => f.campo === d.c.id);
  return `<section class="frs-card ${activo ? "frs-card-filtrada" : ""}"><h5>${escapeHtml(d.c.etiqueta)}</h5><p class="frs-n">${d.n} de ${total} respuestas · ${t} · <i>pulsa una opción para ver quién</i></p>${cuerpo}</section>`;
}

function frsTarjetaEscalas(escalas) {
  const filas = escalas.map((d, i) => `<div class="frs-fila frs-fila-escala"><span class="frs-et" title="${escapeHtml(d.c.etiqueta)}">${escapeHtml(d.c.etiqueta)}</span><span class="frs-pista"><span class="frs-barra" style="--w:${(d.media / d.max) * 100}%;--i:${i}"></span></span><span class="frs-val"><b>${frsNum(d.media)}</b><small>de ${d.max}</small></span></div>`).join("");
  return `<section class="frs-card frs-ancha"><h5>Valoraciones medias</h5><p class="frs-n">Media de las preguntas con escala numérica (solo quien contestó)</p><div class="frs-barras">${filas}</div></section>`;
}

// Evolución por mes (o por día si todo cae en un mismo mes): columnas verticales.
function frsTarjetaEvolucion(resp) {
  const fechas = resp.map((r) => String(r.created_at || "").slice(0, 10)).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f));
  if (fechas.length < 2) return { html: "", pico: null };
  const porMes = new Set(fechas.map((f) => f.slice(0, 7))).size > 1;
  const cuenta = new Map();
  fechas.forEach((f) => { const k = porMes ? f.slice(0, 7) : f; cuenta.set(k, (cuenta.get(k) || 0) + 1); });
  const todas = [...cuenta.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const filas = todas.slice(-24); // como mucho las 24 últimas columnas
  const largo = (k) => porMes ? new Date(k + "-01T12:00:00").toLocaleDateString("es-ES", { month: "long", year: "numeric" }) : new Date(k + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const corto = (k) => porMes ? new Date(k + "-01T12:00:00").toLocaleDateString("es-ES", { month: "short", year: "2-digit" }).replace(".", "") : new Date(k + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");
  const mx = Math.max(...filas.map((f) => f[1]));
  const cols = filas.map(([k, v], i) => `<div class="frs-col" title="${escapeHtml(largo(k))}: ${v}"><span class="frs-col-v">${v}</span><span class="frs-col-b" style="--h:${(v / mx).toFixed(3)};--i:${i}"></span><span class="frs-col-e">${escapeHtml(corto(k))}</span></div>`).join("");
  const html = `<section class="frs-card frs-ancha"><h5>Evolución de las respuestas</h5><p class="frs-n">Por ${porMes ? "mes" : "día"} de envío${todas.length > filas.length ? ` · últimos ${filas.length}` : ""}</p><div class="frs-cols">${cols}</div></section>`;
  const pico = todas.slice().sort((a, b) => b[1] - a[1])[0];
  return { html, pico: { nombre: largo(pico[0]), n: pico[1], porMes } };
}

function frsKpi(valor, etiqueta, sub, tono) {
  return `<div class="frs-kpi frs-kpi-${tono}"><span class="frs-kpi-v">${valor}</span><span class="frs-kpi-e">${etiqueta}</span>${sub ? `<span class="frs-kpi-s">${sub}</span>` : ""}</div>`;
}

// Frases de lectura generadas a partir de los números (orientativas).
function frsLectura(datos, escalas, pico) {
  const L = [];
  const q = (s) => `«${escapeHtml(s)}»`;
  datos.forEach((d) => {
    if (d.n < 8 || !d.filas.length) return; // con muestras pequeñas no se sacan conclusiones
    const [v0, k0] = d.filas[0];
    if (d.c.tipo === "casillas") {
      const top = d.filas.slice(0, 3).map(([v, k]) => `${escapeHtml(v)} (${frsPct(k, d.n)} %)`).join(", ");
      const ult = d.filas[d.filas.length - 1];
      L.push(`En ${q(d.c.etiqueta)} lo más elegido es ${top}.${d.filas.length > 5 ? ` Lo menos: ${escapeHtml(ult[0])} (${frsPct(ult[1], d.n)} %).` : ""}`);
    } else if (d.filas.length > 12) {
      L.push(`${q(d.c.etiqueta)} está muy repartida (${d.filas.length} valores distintos); la más repetida es ${escapeHtml(v0)} (${frsPct(k0, d.n)} %).`);
    } else {
      const p = frsPct(k0, d.n);
      L.push(p >= 50 ? `En ${q(d.c.etiqueta)}, la mayoría (${p} %) responde ${q(v0)}.` : `En ${q(d.c.etiqueta)}, lo más habitual es ${q(v0)} (${p} %), sin mayoría clara.`);
    }
  });
  if (escalas.length > 1) {
    const o = escalas.slice().sort((a, b) => b.media - a.media);
    L.push(`En las valoraciones, lo mejor es ${q(o[0].c.etiqueta)} (${frsNum(o[0].media)}) y lo más flojo ${q(o[o.length - 1].c.etiqueta)} (${frsNum(o[o.length - 1].media)}).`);
  }
  if (pico && pico.n > 1) L.push(`${pico.porMes ? "El mes" : "El día"} con más respuestas fue ${escapeHtml(pico.nombre)} (${pico.n}).`);
  return L;
}

// ---------- Explorador de personas ----------
// Nombre y equipo de una respuesta (misma lógica que la cabecera de la lista de abajo)
function frsPersona(r, campos) {
  const lleno = (c) => formValorTexto(r.datos[c.id]).trim();
  const c = campos.find((x) => x.alta_usuario && lleno(x)) || campos.find((x) => /nombre/i.test(x.etiqueta || "") && lleno(x));
  if (c) {
    const [nom, ...eq] = lleno(c).split(/\s+[—–-]\s+/);
    return { nombre: nom.trim(), equipo: eq.join(" — ").trim() };
  }
  const otro = campos.find((x) => !/\brol\b/i.test(x.etiqueta || "") && x.id !== "rol" && lleno(x));
  return { nombre: (otro ? lleno(otro) : "(sin datos)").slice(0, 60), equipo: "" };
}

function frsTextoCondicion(f) {
  const c = frsCampoPorId(f.campo);
  const et = c ? c.etiqueta : f.campo;
  const modo = f.vals.length > 1 ? (f.modo === "todas" ? " · todas a la vez" : " · cualquiera") : "";
  return { et, vals: f.vals.join(" / "), modo };
}

// Valores posibles de una pregunta con cuántas personas encajarían (respetando el resto de filtros)
function frsOpcionesDe(c) {
  const base = frsInferir(FORM_ACTUAL.campos || [], frsFiltrar(FORM_RESP, c.id));
  const cuenta = new Map();
  let sin = 0;
  base.forEach((r) => {
    const vs = frsValsCampo(c, r.datos);
    if (!vs.length) sin++;
    vs.forEach((v) => cuenta.set(v, (cuenta.get(v) || 0) + 1));
  });
  const def = c.tipo === "confirmacion" ? ["Sí", "No"] : (c.opciones || []).map(String);
  const orden = [...def, ...[...cuenta.keys()].filter((v) => !def.includes(v))];
  const out = orden.map((v) => [v, cuenta.get(v) || 0]);
  if (c.tipo !== "confirmacion") out.push([FRS_SIN, sin]);
  return out;
}

function frsHtmlEditor() {
  if (!FRS_EDIT) return "";
  const campos = frsCamposFiltro();
  const c = frsCampoPorId(FRS_EDIT.campo) || campos[0];
  if (!c) return "";
  const opts = frsOpcionesDe(c);
  const filas = opts.map(([v, k]) => `<label class="frf-op ${k ? "" : "frf-op-cero"}" data-t="${escapeHtml(frsNorm(v))}"><input type="checkbox" value="${escapeHtml(v)}" ${FRS_EDIT.vals.includes(v) ? "checked" : ""}><span class="frf-op-t">${escapeHtml(v)}</span><small>${k}</small></label>`).join("");
  return `<div class="frf-editor">
    <div class="frf-editor-fila">
      <label class="frf-lbl" for="frfCampo">Pregunta</label>
      <select id="frfCampo" data-frs="campo">${campos.map((x) => `<option value="${escapeHtml(x.id)}" ${x.id === c.id ? "selected" : ""}>${escapeHtml(x.etiqueta)}</option>`).join("")}</select>
    </div>
    ${opts.length > 10 ? `<input type="search" class="frf-buscaop" data-frs="buscaop" placeholder="Buscar opción…" aria-label="Buscar opción">` : ""}
    <div class="frf-ops" id="frfOps">${filas}</div>
    <div class="frf-editor-pie">
      <div class="frf-modo">
        <span class="frf-lbl">Si marcas varias, la persona debe tener…</span>
        <label><input type="radio" name="frfModo" value="alguna" ${FRS_EDIT.modo !== "todas" ? "checked" : ""}> alguna de ellas</label>
        <label><input type="radio" name="frfModo" value="todas" ${FRS_EDIT.modo === "todas" ? "checked" : ""}> todas a la vez</label>
      </div>
      <div class="frf-acciones">
        <button type="button" class="acred-btn" data-frs="aplicar">${FRS_EDIT_IDX >= 0 ? "Guardar condición" : "Aplicar condición"}</button>
        <button type="button" class="acred-btn acred-btn-sec" data-frs="cancelar">Cancelar</button>
      </div>
    </div>
  </div>`;
}

function frsHtmlCondiciones() {
  const chips = FRS_FILTROS.map((f, i) => {
    const t = frsTextoCondicion(f);
    return `<span class="frf-chip"><button type="button" class="frf-chip-t" data-frs="editar" data-i="${i}" title="Editar esta condición"><b>${escapeHtml(t.et)}:</b> ${escapeHtml(t.vals)}<small>${escapeHtml(t.modo)}</small></button><button type="button" class="frf-chip-x" data-frs="quitar" data-i="${i}" aria-label="Quitar condición ${escapeHtml(t.et)}">×</button></span>`;
  }).join("");
  const hayCampos = frsCamposFiltro().length > 0;
  return `<div class="frf-chips">${chips}${hayCampos && !FRS_EDIT ? `<button type="button" class="frf-add" data-frs="nueva">+ Añadir condición</button>` : ""}${frsHayFiltro() ? `<button type="button" class="frf-limpiar" data-frs="limpiar">Quitar todos los filtros</button>` : ""}</div>${frsHtmlEditor()}`;
}

function frsHtmlResultado(coinciden) {
  if (!frsHayFiltro()) return "";
  const campos = (FORM_ACTUAL.campos || []).filter((c) => !FORM_TIPOS_SIN_RESPUESTA.includes(c.tipo));
  const total = FORM_RESP.length;
  const cab = `<div class="frf-res-cab"><b>${coinciden.length}</b> de ${total} personas cumplen el filtro <span class="frf-res-pct">(${frsPct(coinciden.length, total)} %)</span>
    ${coinciden.length ? `<span class="frf-res-acc"><button type="button" class="acred-btn acred-btn-sec" data-frs="copiar">Copiar nombres</button><button type="button" class="acred-btn acred-btn-sec" data-frs="csv">Descargar CSV</button></span>` : ""}</div>`;
  if (!coinciden.length) return `${cab}<p class="frf-vacio">Nadie cumple todas las condiciones a la vez. Prueba a quitar alguna o a usar «cualquiera» en vez de «todas».</p>`;
  const personas = coinciden.map((r) => {
    const p = frsPersona(r, campos);
    return `<button type="button" class="frf-p" data-frs="ver" data-id="${r.id}" title="Abrir su respuesta completa"><b>${escapeHtml(p.nombre)}</b>${p.equipo ? `<em>${escapeHtml(p.equipo)}</em>` : ""}</button>`;
  }).join("");
  return `${cab}<div class="frf-personas">${personas}</div>`;
}

function frsHtmlPanel() {
  const hay = frsCamposFiltro().length > 0;
  return `<section class="frf ${frsHayFiltro() ? "frf-activo" : ""}">
    <div class="frf-cab">
      <div><h4>Filtrar personas</h4><p>Combina condiciones (edad, grabación en el estadio, tipos de contenido…) para ver quién las cumple. También puedes pulsar una opción en los gráficos de abajo.</p></div>
      <input type="search" class="frf-busca" id="frfBusca" data-frs="busca" placeholder="Buscar por nombre, equipo, texto…" value="${escapeHtml(FRS_BUSCA)}" aria-label="Buscar en todas las respuestas">
    </div>
    <div id="frfCond">${hay ? "" : `<p class="frf-vacio">Este formulario no tiene preguntas de opciones que se puedan filtrar; solo la búsqueda por texto.</p>`}</div>
    <div id="frfRes"></div>
  </section>`;
}

// ---------- Acciones (delegación de eventos) ----------
function frsRepintar() {
  if (typeof pintarRespuestasFormulario === "function") pintarRespuestasFormulario();
}
function frsAlternarValor(campoId, valor) {
  const i = FRS_FILTROS.findIndex((f) => f.campo === campoId);
  if (i < 0) FRS_FILTROS.push({ campo: campoId, vals: [valor], modo: "alguna" });
  else {
    const f = FRS_FILTROS[i];
    f.vals = f.vals.includes(valor) ? f.vals.filter((v) => v !== valor) : [...f.vals, valor];
    if (!f.vals.length) FRS_FILTROS.splice(i, 1);
  }
  FRS_EDIT = null; FRS_EDIT_IDX = -1;
}
function frsLeerEditor() {
  if (!FRS_EDIT) return;
  const caja = document.getElementById("frfOps");
  if (caja) FRS_EDIT.vals = [...caja.querySelectorAll("input[type=checkbox]:checked")].map((x) => x.value);
  const m = document.querySelector("input[name=frfModo]:checked");
  if (m) FRS_EDIT.modo = m.value;
}
function frsNombresFiltrados() {
  const campos = (FORM_ACTUAL.campos || []).filter((c) => !FORM_TIPOS_SIN_RESPUESTA.includes(c.tipo));
  return frsFiltrar(FORM_RESP).map((r) => { const p = frsPersona(r, campos); return p.equipo ? `${p.nombre} — ${p.equipo}` : p.nombre; });
}
function frsAccion(e) {
  const el = e.target.closest && e.target.closest("[data-frs]");
  if (!el || !document.getElementById("formResumenCaja") || !document.getElementById("formResumenCaja").contains(el)) return;
  const acc = el.dataset.frs;
  if (acc === "busca" || acc === "buscaop" || acc === "campo") return; // se gestionan en input/change
  if (e.type === "keydown") {
    if (el.tagName === "BUTTON" || !(e.key === "Enter" || e.key === " ")) return; // los botones ya reaccionan solos
    e.preventDefault();
  }
  if (acc !== "aplicar") frsLeerEditor(); // no perder lo marcado en el editor al hacer otra cosa
  if (acc === "alt") {
    frsAlternarValor(el.dataset.campo, el.dataset.val);
    frsRepintar();
    const panel = document.querySelector(".frf");
    if (panel && panel.getBoundingClientRect().top < 0) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (acc === "nueva") {
    const c = frsCamposFiltro()[0];
    FRS_EDIT = { campo: c.id, vals: [], modo: "alguna" }; FRS_EDIT_IDX = -1;
    frsRepintar();
  } else if (acc === "editar") {
    const i = Number(el.dataset.i), f = FRS_FILTROS[i];
    if (!f) return;
    FRS_EDIT = { campo: f.campo, vals: [...f.vals], modo: f.modo }; FRS_EDIT_IDX = i;
    frsRepintar();
  } else if (acc === "quitar") {
    FRS_FILTROS.splice(Number(el.dataset.i), 1);
    FRS_EDIT = null; FRS_EDIT_IDX = -1;
    frsRepintar();
  } else if (acc === "limpiar") {
    FRS_FILTROS = []; FRS_BUSCA = ""; FRS_EDIT = null; FRS_EDIT_IDX = -1;
    frsRepintar();
  } else if (acc === "cancelar") {
    FRS_EDIT = null; FRS_EDIT_IDX = -1;
    frsRepintar();
  } else if (acc === "aplicar") {
    frsLeerEditor();
    if (!FRS_EDIT.vals.length) { EOF.toast("Marca al menos una opción", "info"); return; }
    const nuevo = { campo: FRS_EDIT.campo, vals: FRS_EDIT.vals, modo: FRS_EDIT.modo };
    const otro = FRS_FILTROS.findIndex((f, i) => f.campo === nuevo.campo && i !== FRS_EDIT_IDX);
    if (FRS_EDIT_IDX >= 0) FRS_FILTROS[FRS_EDIT_IDX] = nuevo;
    else if (otro >= 0) FRS_FILTROS[otro] = nuevo; // una sola condición por pregunta: se sustituye
    else FRS_FILTROS.push(nuevo);
    if (otro >= 0 && FRS_EDIT_IDX >= 0) FRS_FILTROS.splice(otro, 1);
    FRS_EDIT = null; FRS_EDIT_IDX = -1;
    frsRepintar();
  } else if (acc === "ver") {
    const id = Number(el.dataset.id);
    FORM_RESP_FILTRO = "";
    if (!FORM_RESP_ABIERTAS.has(id)) { FORM_RESP_ABIERTAS.clear(); FORM_RESP_ABIERTAS.add(id); }
    frsRepintar();
    const fila = document.getElementById("formResp" + id);
    if (fila) fila.scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (acc === "copiar") {
    const txt = frsNombresFiltrados().join("\n");
    const ok = () => EOF.toast(`${txt.split("\n").length} nombres copiados`, "exito");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, () => EOF.toast("No se pudo copiar", "error"));
    else EOF.toast("Tu navegador no permite copiar", "error");
  } else if (acc === "csv") {
    const lista = frsFiltrar(FORM_RESP);
    const campos = (FORM_ACTUAL.campos || []).filter((c) => !FORM_TIPOS_SIN_RESPUESTA.includes(c.tipo));
    const cab = ["Fecha", ...campos.map((c) => c.etiqueta), "Estado", "Nota interna"];
    const filas = lista.map((r) => [r.created_at, ...campos.map((c) => formValorTexto(r.datos[c.id])), r.estado === "nueva" ? "Nueva" : "Revisada", r.nota_admin || ""]);
    acredDescargar(`${FORM_ACTUAL.slug}-filtrado-${new Date().toISOString().slice(0, 10)}.csv`, [cab, ...filas]);
  }
}
let frsTimerBusca = null;
function frsInput(e) {
  const el = e.target;
  if (!el.dataset || !el.dataset.frs) return;
  if (el.dataset.frs === "busca") {
    clearTimeout(frsTimerBusca);
    frsTimerBusca = setTimeout(() => { frsLeerEditor(); FRS_BUSCA = el.value; frsRepintar(); }, 250);
  } else if (el.dataset.frs === "buscaop") {
    const q = frsNorm(el.value).trim();
    document.querySelectorAll("#frfOps .frf-op").forEach((l) => { l.hidden = q && !l.dataset.t.includes(q); });
  } else if (el.dataset.frs === "campo" && e.type === "change") {
    FRS_EDIT = { campo: el.value, vals: [], modo: FRS_EDIT ? FRS_EDIT.modo : "alguna" };
    frsRepintar();
  }
}

// ---------- Pintado ----------
function pintarResumenFormulario() {
  const caja = document.getElementById("formResumenCaja");
  if (!caja || !FORM_ACTUAL) return;
  const nueva = !caja.firstChild || FORM_RESUMEN_FORM !== FORM_ACTUAL.id;
  if (nueva) { FRS_FILTROS = []; FRS_BUSCA = ""; FRS_EDIT = null; FRS_EDIT_IDX = -1; FORM_RESUMEN_REF = null; }
  const sig = frsFirma();
  if (!nueva && FORM_RESUMEN_REF === FORM_RESP && FORM_RESUMEN_SIG === sig) return;
  FORM_RESUMEN_REF = FORM_RESP;
  FORM_RESUMEN_FORM = FORM_ACTUAL.id;
  FORM_RESUMEN_SIG = sig;
  if (!FORM_RESP.length) { caja.innerHTML = ""; return; }

  // Esqueleto fijo (el cuadro de búsqueda no se vuelve a crear al escribir)
  if (!caja.querySelector(".frf")) {
    caja.innerHTML = `${frsHtmlPanel()}<div id="frsGraficos"></div>`;
  }
  if (!caja.dataset.frsListo) {
    caja.dataset.frsListo = "1";
    caja.addEventListener("click", frsAccion);
    caja.addEventListener("keydown", frsAccion);
    caja.addEventListener("input", frsInput);
    caja.addEventListener("change", frsInput);
  }
  caja.querySelector(".frf").classList.toggle("frf-activo", frsHayFiltro());
  const cond = document.getElementById("frfCond");
  if (frsCamposFiltro().length) cond.innerHTML = frsHtmlCondiciones();
  const coinciden = frsFiltrar(FORM_RESP);
  document.getElementById("frfRes").innerHTML = frsHtmlResultado(coinciden);

  // Gráficos: sobre la gente que cumple el filtro; cada pregunta ignora SU propia condición para seguir
  // mostrando todas sus opciones (así se pueden sumar o quitar opciones pulsándolas).
  const campos = FORM_ACTUAL.campos || [];
  const todasInf = frsInferir(campos, FORM_RESP);
  const graficables = campos.filter((c) => FRS_TIPOS_GRAFICO.includes(c.tipo) && !c.unica && !c.alta_usuario);
  const utilesIds = new Set(graficables.map((c) => frsCampo(c, todasInf)).filter((d) => d.n > 0 && !(d.n >= 6 && d.filas.length / d.n > 0.8)).map((d) => d.c.id));
  const filtrado = frsInferir(campos, coinciden);
  const datos = graficables.filter((c) => utilesIds.has(c.id)).map((c) => {
    const base = FRS_FILTROS.some((f) => f.campo === c.id) ? frsInferir(campos, frsFiltrar(FORM_RESP, c.id)) : filtrado;
    const d = frsCampo(c, base);
    d.total = base.length;
    return d;
  }).filter((d) => d.n > 0 || FRS_FILTROS.some((f) => f.campo === d.c.id));
  const escalas = datos.filter((d) => d.esEscala && d.n > 0);
  const normales = datos.filter((d) => !d.esEscala);
  const evo = frsTarjetaEvolucion(coinciden);
  const lectura = frsHayFiltro() ? [] : frsLectura(normales, escalas, evo.pico);
  const nuevas = coinciden.filter((r) => r.estado === "nueva").length;
  const sub = frsHayFiltro() ? `${coinciden.length} de ${FORM_RESP.length} respuestas · con filtro` : `${FORM_RESP.length} respuestas · se actualiza solo`;

  const kpis = [
    frsKpi(frsHayFiltro() ? `${coinciden.length}<small class="frs-kpi-de"> / ${FORM_RESP.length}</small>` : FORM_RESP.length, frsHayFiltro() ? "Cumplen el filtro" : "Respuestas", frsHayFiltro() ? `${frsPct(coinciden.length, FORM_RESP.length)} % del total` : "", "azul"),
    frsKpi(nuevas, "Sin revisar", nuevas ? "pendientes" : "todo al día", nuevas ? "rojo" : "verde"),
    frsKpi(datos.length, "Preguntas con gráfico", "", "turquesa"),
    evo.pico ? frsKpi(evo.pico.n, evo.pico.porMes ? "Mes con más" : "Día con más", escapeHtml(evo.pico.nombre), "ambar") : "",
  ].join("");

  document.getElementById("frsGraficos").innerHTML = `
  <details class="frs" ${FORM_RESUMEN_ABIERTO ? "open" : ""} ontoggle="FORM_RESUMEN_ABIERTO = this.open">
    <summary><span>Resumen y gráficos</span><small>${sub}</small></summary>
    <div class="frs-kpis">${kpis}</div>
    ${lectura.length ? `<div class="frs-lectura"><h4>Lectura automática</h4><ul>${lectura.map((l) => `<li>${l}</li>`).join("")}</ul><p class="frs-nota">Generada a partir de los recuentos; los porcentajes se calculan sobre quien contestó cada pregunta.</p></div>` : ""}
    <div class="frs-grid">
      ${evo.html}
      ${escalas.length ? frsTarjetaEscalas(escalas) : ""}
      ${normales.map((d) => frsTarjeta(d, d.c.tipo === "casillas" ? 12 : 8, d.total)).join("")}
    </div>
  </details>`;
}
