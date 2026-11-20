// ---------- Estadísticas personales de la cuenta (con su evolución) ----------
// Una sola vista que se usa en tres sitios:
//   · «Ajustes de cuenta > Estadísticas»  -> la propia persona.   GET /api/me/estadisticas
//   · Modal «Gestionar colaborador» > «Estadísticas» (solo Responsables, ver cargos-equipo.js).
//                                         GET /api/users/:id/estadisticas
//                                         Vista "responsable": lo que PRODUCE la cuenta (publicaciones, visitas,
//                                         fotos y vídeos, tipos, lo más leído, nivel, insignias).
//   · Modal «Gestionar colaborador» > «Actividad» (vista "actividad"): cómo USA el panel (días activos, acciones,
//                                         racha, mapa de calor, últimas acciones). Nada se repite entre las dos.
//   · «Ajustes de cuenta > Estadísticas» (vista "propia") sigue mostrándolo todo junto.
// Backend (worker y worker-secondary): construirEstadisticasCuenta(). Solo lectura.
// API pública:  window.EOFEstadisticas.pintar(contenedor, datos, { vista: "propia" | "responsable" | "actividad" })
//               window.EOFEstadisticas.cargarPropias()  (pinta en #estadisticasCuentaCont)
// Depende de globales de admin.js: apiFetch y USER. Los gráficos son SVG con atributos (sin style="")
// y los colores salen de clases CSS (estadisticas-cuenta.css), así que siguen el modo claro/oscuro.
(function () {
  "use strict";
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const TIPOS = { noticia: "Noticias", previa: "Previas", cronica: "Crónicas", analisis: "Análisis", opinion: "Opinión", entrevista: "Entrevistas", uno_por_uno: "Uno por uno", rdp_previa: "Ruedas de prensa (previa)", rdp_post: "Ruedas de prensa (post)" };
  const num = (n) => Number(n || 0).toLocaleString("es-ES");
  const dec = (n) => Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 1 });
  const peso = (b) => (b >= 1073741824 ? `${dec(b / 1073741824)} GB` : b >= 1048576 ? `${Math.round(b / 1048576)} MB` : `${Math.round(b / 1024)} KB`);
  const nombreMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const fechaLarga = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || "") ? `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}` : "");
  const fechaCorta = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || "") ? `${Number(iso.slice(8, 10))} ${MES_CORTO[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "");
  const nivelTxt = (rol, n) => (rol === "fotografo" ? `F${n}` : `Nivel ${n}`);
  const rolTxt = (r) => (r === "admin" ? "Responsable" : r === "fotografo" ? "Fotógrafo" : "Redactor");
  const iniciales = (txt) => {
    const p = String(txt || "?").trim().split(/\s+/).filter(Boolean);
    const a = p[0] || "?";
    return (a[0] + (p.length > 1 ? p[1][0] : (a[1] || ""))).toUpperCase();
  };
  // «2026-11-07 14:30:00» (UTC, como lo guarda la base de datos) -> Date
  const aFecha = (s) => {
    if (!s) return null;
    const d = new Date(String(s).length <= 10 ? `${s}T00:00:00Z` : `${String(s).replace(" ", "T")}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  function hace(s) {
    const d = aFecha(s);
    if (!d) return "";
    const min = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
    if (min < 2) return "ahora mismo";
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    const dias = Math.round(h / 24);
    if (dias < 31) return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
    const meses = Math.round(dias / 30.4);
    if (meses < 12) return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
    const anios = Math.round(meses / 12);
    return `hace ${anios} ${anios === 1 ? "año" : "años"}`;
  }
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICO = {
    doc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>'),
    ojo: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    camara: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    calendario: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    llama: svg('<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.2 1 2 2 2 0-3-.5-5 1-8z"/>'),
    rayo: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    grafico: svg('<path d="M3 3v18h18"/><path d="M7 15v3"/><path d="M12 9v9"/><path d="M17 5v13"/>'),
    reloj: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    puerta: svg('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>'),
    estrella: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/>'),
  };
  const ICO_ENTIDAD = { articulo: ICO.doc, media: ICO.camara, resultado: ICO.rayo, usuario: ICO.estrella, sesion: ICO.puerta };

  // Estado por contenedor: métrica elegida, modo (mensual/acumulado) y últimos datos (para repintar solo el gráfico).
  const estados = new WeakMap();

  const METRICAS = [
    { id: "publicaciones", titulo: "Publicaciones", unidad: "publicaciones", valor: (x) => x.publicaciones },
    { id: "visitas", titulo: "Visitas", unidad: "visitas", valor: (x) => x.visitas },
    { id: "contenido", titulo: "Fotos y vídeos", unidad: "archivos subidos", valor: (x) => x.fotos + x.videos },
    { id: "actividad", titulo: "Días activos", unidad: "días con actividad en el panel", valor: (x) => x.dias_activos },
    { id: "acciones", titulo: "Acciones", unidad: "acciones en el panel", valor: (x) => x.acciones },
  ];

  // Cada vista solo ofrece sus métricas: así «Actividad» y «Estadísticas» del modal no repiten gráficos.
  const METRICAS_ACTIVIDAD = ["actividad", "acciones"];
  const METRICAS_PRODUCCION = ["publicaciones", "visitas", "contenido"];
  const metricasDe = (vista) => {
    const ids = vista === "actividad" ? METRICAS_ACTIVIDAD : vista === "responsable" ? METRICAS_PRODUCCION : null;
    return ids ? METRICAS.filter((m) => ids.includes(m.id)) : METRICAS;
  };

  const mqCompacto = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(max-width: 560px)") : null;
  const esCompacto = () => !!(mqCompacto && mqCompacto.matches);

  // Máximo "redondo" para el eje (1, 2, 5 × 10^n) y al menos 4 para que las barras pequeñas no parezcan llenas.
  function techo(max) {
    if (max <= 4) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    for (const k of [1, 2, 5, 10]) if (k * p >= max) return k * p;
    return max;
  }

  // En pantallas estrechas solo se dibujan los últimos 6 meses: así los números del gráfico se siguen leyendo.
  const mesesVisibles = (ev) => (esCompacto() && ev.length > 6 ? ev.slice(-6) : ev);

  function graficoBarras(evolucionTotal, metrica) {
    const evolucion = mesesVisibles(evolucionTotal);
    const compacto = esCompacto();
    const W = compacto ? 340 : 640, H = compacto ? 220 : 240, mIzq = compacto ? 30 : 38, mDer = 8, mSup = 20, mInf = 32;
    const n = evolucion.length;
    const valores = evolucion.map(metrica.valor);
    const top = techo(Math.max(0, ...valores));
    const util = H - mSup - mInf;
    const paso = (W - mIzq - mDer) / n;
    const ancho = Math.min(40, paso * 0.62);
    const lineas = [0, 0.5, 1].map((f) => {
      const y = mSup + util * (1 - f);
      return `<line class="ec-rejilla" x1="${mIzq}" x2="${W - mDer}" y1="${y}" y2="${y}"/><text class="ec-eje" x="${mIzq - 6}" y="${y + 4}" text-anchor="end">${num(Math.round(top * f))}</text>`;
    }).join("");
    const barras = evolucion.map((x, i) => {
      const v = valores[i];
      const h = v > 0 ? Math.max(3, (v / top) * util) : 0;
      const cx = mIzq + paso * i + paso / 2;
      const actual = i === n - 1;
      const etq = MES_CORTO[Number(x.mes.slice(5, 7)) - 1];
      const anio = x.mes.slice(5, 7) === "01" || i === 0 ? `<text class="ec-eje ec-eje-anio" x="${cx}" y="${H - 2}" text-anchor="middle">${x.mes.slice(0, 4)}</text>` : "";
      return `<g><title>${esc(cap(nombreMes(x.mes)))}: ${num(v)} ${esc(metrica.unidad)}${actual ? " (mes en curso)" : ""}</title>
        ${h ? `<rect class="ec-barra${actual ? " ec-barra-actual" : ""}" x="${cx - ancho / 2}" y="${mSup + util - h}" width="${ancho}" height="${h}" rx="5"/>` : `<rect class="ec-barra-vacia" x="${cx - ancho / 2}" y="${mSup + util - 2}" width="${ancho}" height="2" rx="1"/>`}
        ${v > 0 ? `<text class="ec-valor" x="${cx}" y="${mSup + util - h - 6}" text-anchor="middle">${num(v)}</text>` : ""}
        <text class="ec-eje" x="${cx}" y="${H - mInf + 16}" text-anchor="middle">${etq}</text>${anio}</g>`;
    }).join("");
    const total = valores.reduce((s, v) => s + v, 0);
    return `<svg class="ec-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(metrica.titulo)} por mes: ${num(total)} en los últimos ${n} meses">${lineas}${barras}</svg>`;
  }

  // Línea con área: total acumulado mes a mes (cuánto ha sumado la cuenta hasta cada mes del periodo).
  function graficoAcumulado(evolucionTotal, metrica) {
    const evolucion = mesesVisibles(evolucionTotal);
    const compacto = esCompacto();
    const W = compacto ? 340 : 640, H = compacto ? 220 : 240, mIzq = compacto ? 30 : 38, mDer = 14, mSup = 20, mInf = 32;
    const n = evolucion.length;
    let acc = 0;
    const valores = evolucion.map((x) => (acc += metrica.valor(x)));
    const top = techo(Math.max(0, ...valores));
    const util = H - mSup - mInf;
    const paso = n > 1 ? (W - mIzq - mDer) / (n - 1) : 0;
    const px = (i) => (n > 1 ? mIzq + paso * i : (mIzq + W - mDer) / 2);
    const py = (v) => mSup + util - (v / top) * util;
    const lineas = [0, 0.5, 1].map((f) => {
      const y = mSup + util * (1 - f);
      return `<line class="ec-rejilla" x1="${mIzq}" x2="${W - mDer}" y1="${y}" y2="${y}"/><text class="ec-eje" x="${mIzq - 6}" y="${y + 4}" text-anchor="end">${num(Math.round(top * f))}</text>`;
    }).join("");
    const puntos = valores.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`);
    const trazo = `M${puntos.join(" L")}`;
    const area = `${trazo} L${px(n - 1).toFixed(1)},${mSup + util} L${px(0).toFixed(1)},${mSup + util} Z`;
    const marcas = evolucion.map((x, i) => {
      const etq = MES_CORTO[Number(x.mes.slice(5, 7)) - 1];
      const anio = x.mes.slice(5, 7) === "01" || i === 0 ? `<text class="ec-eje ec-eje-anio" x="${px(i)}" y="${H - 2}" text-anchor="middle">${x.mes.slice(0, 4)}</text>` : "";
      const ultimo = i === n - 1;
      return `<g><title>${esc(cap(nombreMes(x.mes)))}: ${num(valores[i])} ${esc(metrica.unidad)} acumulados</title>
        <circle class="ec-punto${ultimo ? " ec-punto-actual" : ""}" cx="${px(i)}" cy="${py(valores[i])}" r="${ultimo ? 5 : 3.6}"/>
        <text class="ec-eje" x="${px(i)}" y="${H - mInf + 16}" text-anchor="middle">${etq}</text>${anio}</g>`;
    }).join("");
    const rotuloFinal = `<text class="ec-valor" x="${px(n - 1)}" y="${py(valores[n - 1]) - 10}" text-anchor="end">${num(valores[n - 1])}</text>`;
    return `<svg class="ec-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(metrica.titulo)} acumuladas: ${num(valores[n - 1])} en los últimos ${n} meses">${lineas}<path class="ec-linea-area" d="${area}"/><path class="ec-linea-trazo" d="${trazo}"/>${marcas}${rotuloFinal}</svg>`;
  }

  function tablaAccesible(evolucion, vista) {
    const cols = {
      actividad: [["Días activos", (x) => x.dias_activos], ["Acciones", (x) => x.acciones]],
      responsable: [["Publicaciones", (x) => x.publicaciones], ["Visitas", (x) => x.visitas], ["Fotos", (x) => x.fotos], ["Vídeos", (x) => x.videos]],
    }[vista] || [["Publicaciones", (x) => x.publicaciones], ["Visitas", (x) => x.visitas], ["Fotos", (x) => x.fotos], ["Vídeos", (x) => x.videos], ["Días activos", (x) => x.dias_activos], ["Acciones", (x) => x.acciones]];
    return `<details class="ec-tabla-det"><summary>Ver como tabla</summary><div class="ec-tabla-scroll"><table class="ec-tabla">
      <thead><tr><th scope="col">Mes</th>${cols.map(([t]) => `<th scope="col">${t}</th>`).join("")}</tr></thead>
      <tbody>${[...evolucion].reverse().map((x) => `<tr><th scope="row">${esc(cap(nombreMes(x.mes)))}</th>${cols.map(([, f]) => `<td>${num(f(x))}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div></details>`;
  }

  // Tendencia: este mes (en curso) frente al mes anterior completo.
  function tendencia(evolucion, valor) {
    if (!evolucion || evolucion.length < 2) return "";
    const act = valor(evolucion[evolucion.length - 1]);
    const ant = valor(evolucion[evolucion.length - 2]);
    if (!act && !ant) return "";
    const dif = act - ant;
    if (!dif) return `<span class="ec-delta ec-igual" title="Este mes: ${num(act)} · mes anterior: ${num(ant)}">= que el mes anterior</span>`;
    const pct = ant > 0 ? ` (${dif > 0 ? "+" : ""}${Math.round((dif / ant) * 100)} %)` : "";
    return `<span class="ec-delta ${dif > 0 ? "ec-sube" : "ec-baja"}" title="Este mes (en curso): ${num(act)} · mes anterior: ${num(ant)}">${dif > 0 ? "▲" : "▼"} ${dif > 0 ? "+" : ""}${num(dif)}${pct} <small>vs mes anterior</small></span>`;
  }

  function kpi(ico, valor, etiqueta, nota, delta, tono) {
    return `<div class="ec-kpi${tono ? " ec-kpi-" + tono : ""}"><span class="ec-kpi-ico">${ico}</span><b class="ec-kpi-num">${valor}</b><span class="ec-kpi-et">${etiqueta}</span>${delta || ""}${nota ? `<small class="ec-kpi-nota">${nota}</small>` : ""}</div>`;
  }

  function seccionTipos(t) {
    const filas = Object.entries(t.por_tipo).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (!filas.length) return "";
    const max = filas[0][1];
    const total = filas.reduce((s, [, n]) => s + n, 0);
    return `<section class="ec-sec"><h4>Qué publica</h4><ul class="ec-tipos">${filas.map(([tipo, n]) =>
      `<li><span class="ec-tipo-nom">${esc(TIPOS[tipo] || tipo)}</span><span class="ec-tipo-barra" aria-hidden="true"><i data-pct="${Math.max(4, Math.round((n / max) * 100))}"></i></span><b>${num(n)}</b><small>${Math.round((n / total) * 100)} %</small></li>`).join("")}</ul></section>`;
  }

  function seccionNivel(d) {
    const c = d.cambios_nivel || [];
    const rol = d.usuario.rol;
    if (rol === "admin") return "";
    const items = c.length
      ? `<ol class="ec-linea">${c.map((x) => `<li class="${x.a > x.de ? "ec-sube" : "ec-baja"}"><b>${esc(nivelTxt(rol, x.de))} → ${esc(nivelTxt(rol, x.a))}</b><span>${esc(fechaLarga(x.fecha))}</span></li>`).join("")}</ol>`
      : `<p class="ec-nota">Todavía no ha cambiado de nivel desde que se registran los cambios.</p>`;
    return `<section class="ec-sec"><h4>Evolución de nivel</h4><p class="ec-nota">Ahora: <b>${esc(nivelTxt(rol, d.usuario.nivel))}</b></p>${items}</section>`;
  }

  function seccionRacha(d) {
    const r = d.racha;
    if (!r) return "";
    const semanas = (r.semanas || []).map((s) => `<span class="ec-sem${s.activa ? " ec-sem-on" : ""}${s.actual ? " ec-sem-actual" : ""}" title="Semana del ${esc(fechaCorta(s.inicio))}: ${num(s.publicaciones)} publicaciones, ${num(s.fotos)} fotos${s.actual ? " (esta semana)" : ""}"></span>`).join("");
    return `<section class="ec-sec"><h4>Racha semanal</h4>
      <div class="ec-racha"><div class="ec-racha-num">${ICO.llama}<b>${num(r.actual)}</b><span>${r.actual === 1 ? "semana seguida" : "semanas seguidas"}</span></div>
      <p class="ec-nota">Mejor racha: <b>${num(r.mejor)}</b> · Semanas con actividad en total: <b>${num(r.semanas_activas_total)}</b></p></div>
      ${semanas ? `<div class="ec-semanas" role="img" aria-label="Últimas semanas: las coloreadas tuvieron actividad">${semanas}</div>` : ""}</section>`;
  }

  function seccionInsignias(d) {
    const ins = d.insignias;
    if (!ins || !ins.length) return "";
    const ok = ins.filter((i) => i.conseguida).length;
    return `<section class="ec-sec"><h4>Insignias <span class="ec-contador">${ok}/${ins.length}</span></h4><ul class="ec-insignias">${ins.map((i) =>
      `<li class="${i.conseguida ? "ec-ins-on" : "ec-ins-off"}"><span class="ec-ins-emoji" aria-hidden="true">${esc(i.emoji)}</span><span><b>${esc(i.nombre)}</b><small>${i.conseguida ? `Conseguida${i.fecha ? " · " + esc(fechaCorta(i.fecha)) : ""}` : "Pendiente"}</small></span></li>`).join("")}</ul></section>`;
  }

  // Mapa de calor: acciones por día en las últimas 12 semanas (columnas = semanas, filas = lunes a domingo).
  function seccionMapaCalor(d) {
    const dias = d.actividad_diaria;
    if (!Array.isArray(dias) || !d.generado) return "";
    const porDia = new Map(dias.map((x) => [x.fecha, x.n]));
    const hoy = new Date(`${d.generado}T00:00:00Z`);
    const dow = (hoy.getUTCDay() + 6) % 7; // 0 = lunes
    const inicio = new Date(hoy.getTime() - (dow + 11 * 7) * 86400000);
    const nivelDe = (n) => (n <= 0 ? 0 : n <= 2 ? 1 : n <= 6 ? 2 : n <= 14 ? 3 : 4);
    let celdas = "", total = 0, activos = 0;
    for (let s = 0; s < 12; s++) {
      for (let k = 0; k < 7; k++) {
        const f = new Date(inicio.getTime() + (s * 7 + k) * 86400000);
        if (f > hoy) { celdas += `<span class="ec-h ec-h-fuera" aria-hidden="true"></span>`; continue; }
        const iso = f.toISOString().slice(0, 10);
        const n = porDia.get(iso) || 0;
        total += n;
        if (n) activos++;
        celdas += `<span class="ec-h ec-h${nivelDe(n)}${iso === d.generado ? " ec-h-hoy" : ""}" title="${esc(fechaLarga(iso))}: ${n ? num(n) + (n === 1 ? " acción" : " acciones") : "sin actividad"}"></span>`;
      }
    }
    return `<section class="ec-sec"><div class="ec-sec-cab"><h4>Actividad de las últimas 12 semanas</h4><span class="ec-contador">${num(activos)} ${activos === 1 ? "día activo" : "días activos"} · ${num(total)} acciones</span></div>
      <div class="ec-mapa-scroll"><div class="ec-mapa" role="img" aria-label="Mapa de actividad diaria de las últimas 12 semanas: ${num(activos)} días con actividad y ${num(total)} acciones">${celdas}</div></div>
      <div class="ec-leyenda" aria-hidden="true"><span>Menos</span><i class="ec-h ec-h0"></i><i class="ec-h ec-h1"></i><i class="ec-h ec-h2"></i><i class="ec-h ec-h3"></i><i class="ec-h ec-h4"></i><span>Más</span></div></section>`;
  }

  function seccionActividadReciente(d) {
    const r = d.actividad_reciente;
    if (!Array.isArray(r) || !r.length) return "";
    return `<section class="ec-sec"><h4>Últimas acciones en el panel</h4><ol class="ec-reciente">${r.map((x) =>
      `<li><span class="ec-rec-ico" aria-hidden="true">${ICO_ENTIDAD[x.entidad] || ICO.rayo}</span><span class="ec-rec-txt">${esc(x.descripcion || x.accion.replace(/_/g, " "))}</span><time class="ec-rec-t" datetime="${esc(x.fecha.replace(" ", "T"))}Z" title="${esc(x.fecha)} (UTC)">${esc(hace(x.fecha))}</time></li>`).join("")}</ol></section>`;
  }

  function seccionTopArticulos(d) {
    const t = d.top_articulos;
    if (!Array.isArray(t) || !t.length) return "";
    const max = Math.max(1, ...t.map((x) => x.visitas));
    return `<section class="ec-sec"><h4>Lo más leído</h4><ol class="ec-top">${t.map((x, i) =>
      `<li><span class="ec-top-pos">${i + 1}</span><span class="ec-top-cuerpo"><b>${esc(x.titulo || "(sin título)")}</b><small>${esc(TIPOS[x.tipo] || x.tipo || "")}${x.fecha ? " · " + esc(fechaCorta(x.fecha)) : ""}</small><span class="ec-tipo-barra" aria-hidden="true"><i data-pct="${Math.max(4, Math.round((x.visitas / max) * 100))}"></i></span></span><b class="ec-top-n">${num(x.visitas)}<small> visitas</small></b></li>`).join("")}</ol></section>`;
  }

  function cabecera(d, vista) {
    const propia = vista === "propia";
    const u = d.usuario;
    // Dentro del modal «Gestionar colaborador» ya se ve quién es (avatar, nombre, rol y estado arriba del todo):
    // no se repite la cabecera. En «Actividad» solo se deja la última actividad y el último acceso.
    if (vista === "responsable") return "";
    if (vista === "actividad") {
      const ult0 = d.ultima_actividad ? hace(d.ultima_actividad) : "";
      const acc0 = d.ultimo_acceso ? hace(d.ultimo_acceso) : "";
      const e0 = [
        ult0 ? `<span class="ec-estado">${ICO.reloj}<span>Última actividad <b>${esc(ult0)}</b></span></span>` : "",
        acc0 ? `<span class="ec-estado">${ICO.puerta}<span>Último acceso <b>${esc(acc0)}</b></span></span>` : "",
      ].join("");
      return e0 ? `<div class="ec-estados ec-estados-solo">${e0}</div>` : "";
    }
    const ult = d.ultima_actividad ? hace(d.ultima_actividad) : "";
    const acc = d.ultimo_acceso ? hace(d.ultimo_acceso) : "";
    const chips = [
      `<span class="ec-chip ec-chip-rol ec-rol-${esc(u.rol)}">${esc(rolTxt(u.rol))}</span>`,
      u.rol === "admin" ? "" : `<span class="ec-chip">${esc(nivelTxt(u.rol, u.nivel))}</span>`,
      u.alta ? `<span class="ec-chip ec-chip-suave">Desde ${esc(fechaCorta(u.alta))}</span>` : "",
    ].join("");
    const estado = [
      ult ? `<span class="ec-estado">${ICO.reloj}<span>Última actividad <b>${esc(ult)}</b></span></span>` : "",
      acc ? `<span class="ec-estado">${ICO.puerta}<span>Último acceso <b>${esc(acc)}</b></span></span>` : "",
    ].join("");
    return `<header class="ec-cab"><span class="ec-avatar" aria-hidden="true">${esc(iniciales(u.nombre))}</span>
      <div class="ec-cab-txt"><p class="ec-etiqueta">${ICO.grafico} ${propia ? "Tus estadísticas" : vista === "actividad" ? "Actividad y evolución" : "Estadísticas de la cuenta"}</p>
      <h3>${propia ? "Tu actividad en El Otro Fútbol" : esc(u.nombre)}</h3>
      <div class="ec-chips">${chips}</div>${estado ? `<div class="ec-estados">${estado}</div>` : ""}</div></header>`;
  }

  function pintarGrafico(cont) {
    const est = estados.get(cont);
    const caja = cont.querySelector("[data-ec-grafico]");
    if (!est || !caja) return;
    const lista = metricasDe(est.vista);
    const metrica = lista.find((m) => m.id === est.metrica) || lista[0];
    const ev = est.datos.evolucion;
    caja.innerHTML = est.modo === "acumulado" ? graficoAcumulado(ev, metrica) : graficoBarras(ev, metrica);
    cont.querySelectorAll("[data-ec-metrica]").forEach((b) => {
      const on = b.dataset.ecMetrica === metrica.id;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
    cont.querySelectorAll("[data-ec-modo]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.ecModo === est.modo ? "true" : "false"));
    const visibles = mesesVisibles(ev);
    const mejor = visibles.reduce((m, x) => (metrica.valor(x) > (m ? metrica.valor(m) : 0) ? x : m), null);
    const pie = cont.querySelector("[data-ec-pie]");
    if (pie) pie.textContent = mejor && metrica.valor(mejor) > 0 ? `Mejor mes: ${cap(nombreMes(mejor.mes))} (${num(metrica.valor(mejor))}). El último mes es el actual, aún en curso.${visibles.length < ev.length ? " En pantallas estrechas se ven los últimos 6 meses." : ""}` : "Todavía sin datos en este periodo.";
  }

  function animarBarras(cont) {
    requestAnimationFrame(() => cont.querySelectorAll("[data-pct]").forEach((el) => el.style.setProperty("--w", `${el.dataset.pct}%`)));
  }

  function pintar(cont, d, opciones) {
    if (!cont || !d || !d.totales) return;
    const vista = opciones && opciones.vista ? opciones.vista : "propia";
    const compacta = vista === "actividad";
    const t = d.totales;
    const ev = d.evolucion || [];
    const previo = estados.get(cont) || {};
    const hayAlgo = t.publicaciones > 0 || t.contenido.fotos > 0 || t.contenido.videos > 0 || t.galerias.fotos_vinculadas > 0 || t.resultados_creados > 0 || t.acciones > 0;
    const lista = metricasDe(vista);
    estados.set(cont, { datos: d, vista, metrica: lista.some((m) => m.id === previo.metrica) ? previo.metrica : lista[0].id, modo: previo.modo || "mensual" });
    const cab = cabecera(d, vista);
    if (!hayAlgo) {
      cont.innerHTML = `<div class="ec-est ec-vista-${vista}">${cab}<p class="ec-vacio">${vista === "propia" ? "Todavía no hay actividad que mostrar. En cuanto publiques, subas fotos o trabajes en el panel, aquí verás tu evolución." : "Esta cuenta todavía no tiene actividad registrada."}</p></div>`;
      return;
    }
    const sinPublicar = t.publicaciones === 0;
    const racha = d.racha ? kpi(ICO.llama, num(d.racha.actual), d.racha.actual === 1 ? "Semana de racha" : "Semanas de racha", `Mejor: ${num(d.racha.mejor)}`, "", "llama") : "";
    const kpis = compacta
      ? [
        kpi(ICO.calendario, num(t.dias_activos), "Días activos en el panel", `${num(ev.length ? ev[ev.length - 1].dias_activos : 0)} este mes`, tendencia(ev, (x) => x.dias_activos), "acento"),
        kpi(ICO.rayo, num(t.acciones), "Acciones registradas", `${dec(t.dias_activos ? t.acciones / t.dias_activos : 0)} por día activo`, tendencia(ev, (x) => x.acciones)),
        racha,
      ].join("")
      : vista === "responsable"
        ? [
          kpi(ICO.doc, num(t.publicaciones), "Publicaciones", t.primera_publicacion ? `Desde el ${esc(fechaCorta(t.primera_publicacion))}` : "", tendencia(ev, (x) => x.publicaciones), "acento"),
          kpi(ICO.ojo, num(t.visitas), "Visitas a lo publicado", sinPublicar ? "" : `${dec(t.visitas_por_publicacion)} por publicación`, tendencia(ev, (x) => x.visitas)),
          kpi(ICO.camara, num(t.contenido.fotos + t.contenido.videos), "Fotos y vídeos subidos", `${num(t.contenido.fotos)} fotos · ${num(t.contenido.videos)} vídeos · ${peso(t.contenido.bytes)}`, tendencia(ev, (x) => x.fotos + x.videos)),
          kpi(ICO.rayo, num(t.resultados_creados), "Partidos creados", `${num(t.galerias.fotos_vinculadas)} fotos vinculadas a galerías de ${num(t.galerias.partidos)} partidos`),
        ].join("")
        : [
          kpi(ICO.doc, num(t.publicaciones), "Publicaciones", t.primera_publicacion ? `Desde el ${esc(fechaCorta(t.primera_publicacion))}` : "", tendencia(ev, (x) => x.publicaciones), "acento"),
          kpi(ICO.ojo, num(t.visitas), "Visitas a lo publicado", sinPublicar ? "" : `${dec(t.visitas_por_publicacion)} por publicación`, tendencia(ev, (x) => x.visitas)),
          kpi(ICO.camara, num(t.contenido.fotos + t.contenido.videos), "Fotos y vídeos subidos", `${num(t.contenido.fotos)} fotos · ${num(t.contenido.videos)} vídeos · ${peso(t.contenido.bytes)}`, tendencia(ev, (x) => x.fotos + x.videos)),
          kpi(ICO.calendario, num(t.dias_activos), "Días activos en el panel", `${num(t.acciones)} acciones en total`, tendencia(ev, (x) => x.dias_activos)),
          d.racha ? racha : kpi(ICO.rayo, num(t.resultados_creados), "Partidos creados", `${num(t.galerias.fotos_vinculadas)} fotos vinculadas a galerías`),
        ].join("");
    const extra = [];
    if (vista === "propia" && d.racha && (t.resultados_creados || t.galerias.fotos_vinculadas)) extra.push(`${num(t.resultados_creados)} partidos creados`, `${num(t.galerias.fotos_vinculadas)} fotos vinculadas a galerías de ${num(t.galerias.partidos)} partidos`);
    const rp = d.resumen_periodo;
    const resumen = rp && vista !== "actividad" ? `<div class="ec-resumen"><span><b>${num(rp.publicaciones)}</b> publicaciones</span><span><b>${num(rp.visitas)}</b> visitas</span><span><b>${num(rp.meses_con_actividad)}</b> ${rp.meses_con_actividad === 1 ? "mes" : "meses"} con actividad</span>${rp.mejor_mes ? `<span>Mejor mes: <b>${esc(cap(nombreMes(rp.mejor_mes.mes)))}</b> (${num(rp.mejor_mes.publicaciones)})</span>` : ""}<small>en los últimos ${ev.length} meses</small></div>` : "";
    cont.innerHTML = `<div class="ec-est ec-vista-${vista}">${cab}
      <div class="ec-kpis">${kpis}</div>
      <section class="ec-sec ec-sec-grafico"><div class="ec-grafico-cab"><h4>Evolución mes a mes</h4>
        <div class="ec-controles"><div class="ec-tabs" role="tablist" aria-label="Qué medir">${lista.map((m) => `<button type="button" role="tab" class="ec-tab" data-ec-metrica="${m.id}" aria-selected="false" tabindex="-1">${esc(m.titulo)}</button>`).join("")}</div>
        <div class="ec-modo" role="group" aria-label="Tipo de gráfico"><button type="button" data-ec-modo="mensual" aria-pressed="true">Mensual</button><button type="button" data-ec-modo="acumulado" aria-pressed="false">Acumulado</button></div></div></div>
        <div class="ec-grafico" data-ec-grafico></div>
        <p class="ec-nota" data-ec-pie></p>
        ${resumen}
        ${tablaAccesible(ev, vista)}
      </section>
      ${vista === "responsable" ? "" : seccionMapaCalor(d)}
      ${compacta ? "" : seccionTipos(t)}${compacta ? "" : seccionTopArticulos(d)}${vista === "responsable" ? "" : seccionActividadReciente(d)}${compacta ? "" : seccionNivel(d)}${vista === "responsable" ? "" : seccionRacha(d)}${compacta ? "" : seccionInsignias(d)}
      ${extra.length ? `<p class="ec-nota">${esc(extra.join(" · "))}.</p>` : ""}
      <p class="ec-nota ec-aviso">${compacta ? "Las cifras se cuentan en el mes en que se registran." : "Las visitas se cuentan en el mes en que se producen (no en el de publicación) y el resto de cifras en el mes en que se registran."} Se muestran los últimos ${ev.length} meses${d.usuario.alta ? ", sin contar los anteriores al alta de la cuenta" : ""}. Las horas se guardan en UTC.</p></div>`;
    pintarGrafico(cont);
    animarBarras(cont);
  }

  // Cambio de métrica o de modo (clic o flechas) por delegación: vale tanto en el panel como dentro del modal.
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-ec-metrica], [data-ec-modo]");
    if (!b) return;
    const cont = b.closest(".ec-est") && b.closest(".ec-est").parentElement;
    const est = cont && estados.get(cont);
    if (!est) return;
    if (b.dataset.ecMetrica) est.metrica = b.dataset.ecMetrica;
    if (b.dataset.ecModo) est.modo = b.dataset.ecModo;
    pintarGrafico(cont);
  });
  document.addEventListener("keydown", (e) => {
    const b = e.target.closest && e.target.closest("[data-ec-metrica]");
    if (!b || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = [...b.closest(".ec-tabs").querySelectorAll("[data-ec-metrica]")];
    let i = tabs.indexOf(b);
    if (e.key === "ArrowRight") i = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") i = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") i = 0;
    else i = tabs.length - 1;
    e.preventDefault();
    e.stopPropagation();
    tabs[i].focus();
    tabs[i].click();
  });
  // Al pasar de móvil a escritorio (o al girar el teléfono) se redibuja el gráfico con el tamaño que toca.
  if (mqCompacto) {
    const repintar = () => document.querySelectorAll(".ec-est").forEach((el) => { const c = el.parentElement; if (c && estados.has(c)) pintarGrafico(c); });
    if (mqCompacto.addEventListener) mqCompacto.addEventListener("change", repintar); else if (mqCompacto.addListener) mqCompacto.addListener(repintar);
  }

  // ---------- Ajustes de cuenta > Estadísticas (la propia persona) ----------
  const TTL = 2 * 60 * 1000;
  let cache = null; // { t, d }
  let peticion = 0;
  async function cargarPropias(forzar) {
    const cont = document.getElementById("estadisticasCuentaCont");
    if (!cont) return;
    if (!forzar && cache && Date.now() - cache.t < TTL) { pintar(cont, cache.d, { vista: "propia" }); return; }
    const mia = ++peticion;
    if (!cont.querySelector(".ec-est")) cont.innerHTML = `<div class="ec-est ec-cargando" aria-busy="true"><div class="ec-esq ec-esq-cab"></div><div class="ec-esq-kpis"><i class="ec-esq"></i><i class="ec-esq"></i><i class="ec-esq"></i><i class="ec-esq"></i></div><div class="ec-esq ec-esq-grafico"></div></div>`;
    try {
      const d = await apiFetch("/api/me/estadisticas");
      if (mia !== peticion) return;
      cache = { t: Date.now(), d };
      pintar(cont, d, { vista: "propia" });
    } catch {
      if (mia !== peticion) return;
      cont.innerHTML = `<p class="sesiones-vacio">No se han podido cargar tus estadísticas. <button type="button" class="ce-btn ce-btn-peq" data-ec-reintentar>Reintentar</button></p>`;
    }
  }

  window.EOFEstadisticas = { pintar, cargarPropias, hace };

  function iniciar() {
    if (typeof USER === "undefined" || !USER) return;
    const boton = document.querySelector('#subtabsAjustes button[data-subtab="estadisticas"]');
    if (boton) boton.addEventListener("click", () => cargarPropias());
    document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("[data-ec-reintentar]")) cargarPropias(true); });
  }
  iniciar();
})();
