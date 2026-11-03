// ---------- Resumen automático de respuestas de un formulario personalizado ----------
// Se pinta en Solicitudes > Formularios > (un formulario) > "Resumen y gráficos", encima de la
// lista de respuestas. Es genérico: lee FORM_ACTUAL.campos y FORM_RESP (de admin.js), así que
// funciona con cualquier formulario y se actualiza solo cada vez que llegan o cambian respuestas.
// Solo agrega recuentos: no muestra correos ni textos libres.
// Lo llama pintarRespuestasFormulario() (admin.js). No hay backend nuevo.
let FORM_RESUMEN_ABIERTO = true;
let FORM_RESUMEN_REF = null; // última lista de respuestas pintada (para no repintar sin necesidad)
let FORM_RESUMEN_FORM = null;

const FRS_TIPOS_GRAFICO = ["opcion", "desplegable", "casillas"];

function frsPct(n, t) { return t ? Math.round((n / t) * 100) : 0; }
function frsNum(x) { return (Math.round(x * 10) / 10).toFixed(1).replace(".", ","); }
function frsVals(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = v == null ? "" : String(v).trim();
  return s ? [s] : [];
}

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

const FRS_N_COLORES = 8;
function frsColor(i) { return `var(--frs-c${i % FRS_N_COLORES})`; }

// Barras horizontales con degradado: para preguntas de varias opciones o con muchos valores.
function frsBarras(filas, n, limite) {
  const top = filas.slice(0, limite);
  const mx = top.length ? top[0][1] : 1;
  const resto = filas.length - top.length;
  return `<div class="frs-barras">${top.map(([v, k], i) => `<div class="frs-fila"><span class="frs-et" title="${escapeHtml(v)}">${escapeHtml(v)}</span><span class="frs-pista"><span class="frs-barra" style="--w:${(k / mx) * 100}%;--i:${i}"></span></span><span class="frs-val"><b>${k}</b><small>${frsPct(k, n)} %</small></span></div>`).join("")}</div>`
    + (resto > 0 ? `<p class="frs-mas">+ ${resto} opciones más con menos respuestas</p>` : "");
}

// Donut para preguntas de opción única con pocas opciones (los tramos suman el 100 %).
function frsDonut(filas, n) {
  let acc = 0;
  const tramos = filas.map(([, k], i) => { const ini = acc; acc += k; return `${frsColor(i)} ${(ini / n) * 100}% ${(acc / n) * 100}%`; });
  const [v0, k0] = filas[0];
  const leyenda = filas.map(([v, k], i) => `<li><span class="frs-punto" style="background:${frsColor(i)}"></span><span class="frs-ley-et" title="${escapeHtml(v)}">${escapeHtml(v)}</span><span class="frs-val"><b>${k}</b><small>${frsPct(k, n)} %</small></span></li>`).join("");
  return `<div class="frs-donut-wrap">
    <div class="frs-donut" style="background:conic-gradient(${tramos.join(",")})" role="img" aria-label="${escapeHtml(v0)}: ${frsPct(k0, n)} %">
      <div class="frs-donut-centro"><b>${frsPct(k0, n)} %</b><small>${escapeHtml(v0)}</small></div>
    </div>
    <ul class="frs-leyenda">${leyenda}</ul>
  </div>`;
}

function frsTarjeta(d, limite) {
  const casillas = d.c.tipo === "casillas";
  const t = casillas ? "Varias opciones: los % suman más de 100" : "Opción única";
  const cuerpo = !casillas && d.filas.length <= 5 ? frsDonut(d.filas, d.n) : frsBarras(d.filas, d.n, limite);
  return `<section class="frs-card"><h5>${escapeHtml(d.c.etiqueta)}</h5><p class="frs-n">${d.n} de ${FORM_RESP.length} respuestas · ${t}</p>${cuerpo}</section>`;
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

function pintarResumenFormulario() {
  const caja = document.getElementById("formResumenCaja");
  if (!caja || !FORM_ACTUAL) return;
  if (FORM_RESUMEN_REF === FORM_RESP && FORM_RESUMEN_FORM === FORM_ACTUAL.id && caja.firstChild) return;
  FORM_RESUMEN_REF = FORM_RESP;
  FORM_RESUMEN_FORM = FORM_ACTUAL.id;
  if (!FORM_RESP.length) { caja.innerHTML = ""; return; }

  const resp = frsInferir(FORM_ACTUAL.campos || [], FORM_RESP);
  const todos = (FORM_ACTUAL.campos || []).filter((c) => FRS_TIPOS_GRAFICO.includes(c.tipo) && !c.unica && !c.alta_usuario).map((c) => frsCampo(c, resp));
  // Fuera lo que no aporta: sin respuestas o casi todo valores distintos (nombres, etc.)
  const utiles = todos.filter((d) => d.n > 0 && !(d.n >= 6 && d.filas.length / d.n > 0.8));
  const escalas = utiles.filter((d) => d.esEscala);
  const normales = utiles.filter((d) => !d.esEscala);
  const evo = frsTarjetaEvolucion(FORM_RESP);
  const lectura = frsLectura(normales, escalas, evo.pico);
  const nuevas = FORM_RESP.filter((r) => r.estado === "nueva").length;

  const kpis = [
    frsKpi(FORM_RESP.length, "Respuestas", "", "azul"),
    frsKpi(nuevas, "Sin revisar", nuevas ? "pendientes" : "todo al día", nuevas ? "rojo" : "verde"),
    frsKpi(utiles.length, "Preguntas con gráfico", "", "turquesa"),
    evo.pico ? frsKpi(evo.pico.n, evo.pico.porMes ? "Mes con más" : "Día con más", escapeHtml(evo.pico.nombre), "ambar") : "",
  ].join("");

  caja.innerHTML = `
  <details class="frs" ${FORM_RESUMEN_ABIERTO ? "open" : ""} ontoggle="FORM_RESUMEN_ABIERTO = this.open">
    <summary><span>Resumen y gráficos</span><small>${FORM_RESP.length} respuestas · se actualiza solo</small></summary>
    <div class="frs-kpis">${kpis}</div>
    ${lectura.length ? `<div class="frs-lectura"><h4>Lectura automática</h4><ul>${lectura.map((l) => `<li>${l}</li>`).join("")}</ul><p class="frs-nota">Generada a partir de los recuentos; los porcentajes se calculan sobre quien contestó cada pregunta.</p></div>` : ""}
    <div class="frs-grid">
      ${evo.html}
      ${escalas.length ? frsTarjetaEscalas(escalas) : ""}
      ${normales.map((d) => frsTarjeta(d, d.c.tipo === "casillas" ? 12 : 8)).join("")}
    </div>
  </details>`;
}
