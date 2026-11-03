// ---------- Resumen mensual de colaboradores ----------
// Vista "Ajustes de cuenta > Resumen del mes": lo que ha hecho cada persona en un mes, consultable SOLO
// a final de mes (el servidor lo impone: desde el último día del mes), más un aviso flotante el día en
// que está disponible, que cada persona puede desactivar. Backend (worker y worker-secondary):
//   GET /api/me/resumen-mensual/estado        -> meses consultables, aviso pendiente, preferencias
//   GET /api/me/resumen-mensual?mes=AAAA-MM    -> el resumen (o {disponible:false, disponible_desde})
//   PUT /api/me/resumen-mensual/prefs          -> {aviso:boolean, visto:"AAAA-MM"}
// Reconocimiento del mes ("Redactor/a del mes" y "Foto del mes"), mismo backend:
//   GET /api/reconocimientos                   -> último reconocimiento confirmado (público)
//   GET /api/reconocimientos/gestion?mes=      -> (solo admin) candidatos del mes y lo ya confirmado. Cada redactor/a trae
//        pct_publicaciones, pct_visitas, puntuacion (0-100 %), pct_del_mejor, posicion, es_mejor y empate_en_cabeza;
//        candidatos.equipo trae los totales y los pesos con los que se calcula la puntuación.
//   PUT /api/reconocimientos/gestion           -> (solo admin) {mes, redactor_id, media_id, avisar}; ambos null = quitar
// Depende de globales de admin.js: apiFetch, USER, irAAjustesCuenta y window.EOF.toast.
(function () {
  "use strict";
  if (typeof USER === "undefined" || !USER) return;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (m, t) => (window.EOF && window.EOF.toast ? window.EOF.toast(m, t || "success") : console.log(m));
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const TIPOS = { noticia: "Noticias", previa: "Previas", cronica: "Crónicas", analisis: "Análisis", opinion: "Opinión", entrevista: "Entrevistas", uno_por_uno: "Uno por uno", rdp_previa: "Ruedas de prensa previas", rdp_post: "Ruedas de prensa posteriores" };
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const nombreMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
  const fechaLarga = (iso) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;
  const num = (n) => Number(n || 0).toLocaleString("es-ES");
  const peso = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${Math.round(b / 1048576)} MB` : `${Math.round(b / 1024)} KB`);
  const CLAVE_OCULTO = "eof_resumen_aviso_oculto";
  // Iconos de trazo (Lucide-like) para no depender de ninguna librería.
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICO = {
    grafico: svg('<path d="M3 3v18h18"/><path d="M7 15v3"/><path d="M12 9v9"/><path d="M17 5v13"/>'),
    doc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>'),
    ojo: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    subida: svg('<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>'),
    calendario: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
    candado: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    cerrar: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    flecha: svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
    trofeo: svg('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
    camara: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    vacio: svg('<circle cx="12" cy="12" r="9"/><path d="M8 15s1.5-2 4-2 4 2 4 2"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  };
  // Las anchuras de las barras se aplican por CSSOM (no con style="" en el HTML) y en el siguiente
  // fotograma, para que la transición de CSS las anime y no choque con una CSP estricta.
  function animarBarras(raiz) {
    if (!raiz) return;
    requestAnimationFrame(() => raiz.querySelectorAll("[data-pct]").forEach((el) => el.style.setProperty("--w", `${el.dataset.pct}%`)));
  }
  const pct = (n, max) => (max > 0 ? Math.max(4, Math.round((n / max) * 100)) : 0);
  const pc = (n) => `${Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;

  // Rendimiento: lo que ya se ha pedido no se vuelve a pedir al cambiar de mes en el selector, al volver a
  // abrir la pestaña o al desplegar el gestor. Un mes cerrado casi no cambia, así que unos minutos de caché
  // bastan; al guardar un reconocimiento se vacía lo que depende de él.
  const TTL_ESTADO = 2 * 60 * 1000;
  const TTL_RESUMEN = 5 * 60 * 1000;
  const TTL_RECO = 60 * 1000;
  const cacheResumen = new Map(); // mes -> { t, d }
  const cacheGestion = new Map(); // mes -> { t, d }
  let cacheReco = null;           // { t, d }
  const fresco = (e, ttl) => !!e && Date.now() - e.t < ttl;

  let estado = null;
  let mesVisto = "";
  let peticion = 0;
  let ultimaComprobacion = 0;

  async function pedirEstado(forzar) {
    if (!forzar && estado && Date.now() - ultimaComprobacion < TTL_ESTADO) return estado;
    const e = await apiFetch("/api/me/resumen-mensual/estado");
    if (!e || !e.ultimo_mes_disponible) return null;
    estado = e;
    ultimaComprobacion = Date.now();
    return e;
  }
  async function guardarPrefs(cambios) {
    const r = await apiFetch("/api/me/resumen-mensual/prefs", { method: "PUT", body: JSON.stringify(cambios) });
    if (r && r.prefs && estado) {
      estado.prefs = r.prefs;
      estado.aviso_pendiente = r.prefs.aviso && estado.meses_disponibles.length > 0 && r.prefs.visto < estado.ultimo_mes_disponible;
    }
    actualizarPunto();
    return r;
  }

  // ---- Punto rojo en la pestaña / menú mientras haya un resumen sin abrir ----
  function actualizarPunto() {
    const pendiente = !!(estado && estado.aviso_pendiente);
    document.querySelectorAll(".rm-punto").forEach((p) => { p.hidden = !pendiente; });
  }

  // ---- Aviso flotante ----
  function cerrarAviso() {
    const t = $("rmToast");
    if (!t) return;
    t.id = "rmToastSaliendo"; // libera el id: si llega otro aviso mientras sale, puede crearse sin chocar
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { t.remove(); return; }
    t.classList.add("rm-sale");
    t.addEventListener("animationend", () => t.remove(), { once: true });
    setTimeout(() => t.remove(), 400);
  }
  function mostrarAviso() {
    if (!estado || !estado.aviso_pendiente || $("rmToast")) return;
    const mes = estado.ultimo_mes_disponible;
    try { if (sessionStorage.getItem(CLAVE_OCULTO) === mes) return; } catch { /* sin sessionStorage */ }
    const el = document.createElement("div");
    el.className = "rm-toast";
    el.id = "rmToast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML = `<div class="rm-toast-cab">
        <span class="rm-toast-ico">${ICO.grafico}</span>
        <div class="rm-toast-txt">
          <span class="rm-toast-mes">Nuevo resumen</span>
          <strong>Tu resumen de ${esc(nombreMes(mes))} ya está disponible</strong>
          <p>Consulta todo lo que has hecho este mes: publicaciones, visitas, contenido subido y más.</p>
        </div>
        <button type="button" class="rm-toast-cerrar" data-rm="luego" aria-label="Cerrar aviso">${ICO.cerrar}</button>
      </div>
      <div class="rm-toast-acc">
        <button type="button" class="rm-pri" data-rm="ver">Ver mi resumen ${ICO.flecha}</button>
        <button type="button" data-rm="luego">Ahora no</button>
        <button type="button" class="rm-nunca" data-rm="nunca">No avisarme más</button>
      </div>`;
    el.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { cerrarAviso(); try { sessionStorage.setItem(CLAVE_OCULTO, mes); } catch { /* nada */ } } });
    el.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-rm]");
      if (!b) return;
      const acc = b.dataset.rm;
      cerrarAviso();
      if (acc === "ver") { irAAjustesCuenta("resumenMes"); return; }
      if (acc === "luego") { try { sessionStorage.setItem(CLAVE_OCULTO, mes); } catch { /* nada */ } return; }
      try {
        await guardarPrefs({ aviso: false });
        toast("Aviso desactivado. Puedes volver a activarlo en Ajustes de cuenta > Resumen del mes.", "info");
      } catch { toast("No se pudo guardar la preferencia. Inténtalo de nuevo.", "error"); }
    });
    document.body.appendChild(el);
  }

  // ---- Vista ----
  function bloqueado(mes, desde) {
    const faltan = Math.max(0, Math.round((new Date(desde + "T00:00:00") - new Date(new Date().toDateString())) / 86400000));
    return `<div class="rm-bloqueado">
      <span class="rm-bloqueado-ico">${ICO.candado}</span>
      <h4>El resumen de ${esc(nombreMes(mes))} aún no está disponible</h4>
      <p>Se abre a final de mes${faltan > 0 ? ` (${faltan === 1 ? "mañana" : `dentro de ${faltan} días`})` : ""}. Ese día te avisaremos${estado && estado.prefs && !estado.prefs.aviso ? " (ahora tienes el aviso desactivado)" : ""}.</p>
      <span class="rm-fecha-pildora">${ICO.calendario} ${esc(fechaLarga(desde))}</span>
    </div>`;
  }
  function fila(t, v) { return `<div class="rm-fila"><span>${esc(t)}</span><b>${esc(v)}</b></div>`; }

  function pintarResumen(d) {
    const p = d.publicaciones, c = d.contenido, a = d.actividad, g = d.galerias;
    const esFoto = USER.rol === "fotografo";
    if (!d.hay_actividad) {
      return `<div class="rm-seccion rm-vacio">${ICO.vacio}<span>No hay actividad registrada en ${esc(nombreMes(d.mes))}.</span></div>`;
    }
    const kpis = [];
    if (!esFoto || p.total) kpis.push([p.total, "Publicaciones", ICO.doc], [d.visitas.total, "Visitas a tus artículos", ICO.ojo]);
    kpis.push([c.fotos + c.videos, "Archivos subidos", ICO.subida], [a.dias_activos, "Días con actividad", ICO.calendario]);
    let h = `<div class="rm-hero">${kpis.map(([n, l, ico], i) => `<div class="rm-kpi rm-kpi-${i + 1}"><span class="rm-kpi-ico">${ico}</span><b>${num(n)}</b><small>${esc(l)}</small></div>`).join("")}</div>`;
    if (p.total) {
      const tipos = Object.entries(TIPOS).filter(([t]) => p.por_tipo[t]);
      const maxTipo = Math.max(...tipos.map(([t]) => p.por_tipo[t]));
      h += `<section class="rm-seccion"><h4>Publicaciones por tipo</h4><div class="rm-tipos">${
        tipos.map(([t, l]) => `<div class="rm-tipo"><span class="rm-tipo-n">${esc(l)}</span><span class="rm-pista"><i data-pct="${pct(p.por_tipo[t], maxTipo)}"></i></span><b>${num(p.por_tipo[t])}</b></div>`).join("")
      }</div>${p.como_coautor ? `<p class="rm-nota">${num(p.como_coautor)} de ellas como coautor/a.</p>` : ""}</section>`;
      if (d.visitas.top.length) {
        const maxVis = Math.max(...d.visitas.top.map((x) => Number(x.visitas) || 0));
        h += `<section class="rm-seccion"><h4>Lo más leído del mes</h4><ol class="rm-lista rm-top">${
          d.visitas.top.map((x) => `<li data-pct="${pct(Number(x.visitas) || 0, maxVis)}"><span class="rm-t">${esc(x.titulo)}</span><strong>${num(x.visitas)} visitas</strong></li>`).join("")
        }</ol></section>`;
      }
      h += `<section class="rm-seccion"><details><summary>Ver las ${num(p.total)} publicaciones del mes</summary><ul class="rm-lista">${
        d.articulos.map((x) => `<li><span class="rm-t">${esc(x.titulo)}</span><em>${esc(TIPOS[x.tipo] || x.tipo)} · ${esc(fechaLarga(x.fecha))}</em></li>`).join("")
      }</ul>${p.total > d.articulos.length ? `<p class="rm-nota">Se muestran las ${d.articulos.length} primeras.</p>` : ""}</details></section>`;
    }
    const filas = [];
    if (c.fotos || c.videos) filas.push(fila("Fotos subidas", num(c.fotos)), fila("Vídeos subidos", num(c.videos)), fila("Peso total", peso(c.bytes)));
    if (g.fotos_vinculadas) filas.push(fila("Fotos en galerías de partido", num(g.fotos_vinculadas)), fila("Partidos con galería", num(g.partidos)));
    if (d.resultados_creados) filas.push(fila("Partidos creados", num(d.resultados_creados)));
    if (filas.length) h += `<section class="rm-seccion"><h4>Contenido y partidos</h4><div class="rm-filas">${filas.join("")}</div></section>`;
    h += `<section class="rm-seccion"><h4>Actividad en el panel</h4><div class="rm-filas">${fila("Acciones registradas", num(a.acciones))}${fila("Días con actividad", num(a.dias_activos))}</div></section>`;
    if (d.cambios_nivel.length) {
      h += `<section class="rm-seccion"><h4>Cambios de nivel</h4><ul class="rm-lista">${
        d.cambios_nivel.map((x) => `<li><span class="rm-t">${d.usuario && d.usuario.rol === "fotografo" ? `F${x.de} → F${x.a}` : `Nivel ${x.de} → nivel ${x.a}`}</span><em>${esc(fechaLarga(x.fecha))}</em></li>`).join("")
      }</ul></section>`;
    }
    return h + `<p class="rm-nota">Resumen calculado con los datos registrados hasta ahora. Si consultas el último día del mes, lo que hagas después de abrirlo no aparecerá hasta que vuelvas a entrar.</p>`;
  }

  async function cargarMes(mes) {
    const cont = $("rmContenido");
    if (!cont) return;
    const mia = ++peticion;
    let d = null;
    const guardado = cacheResumen.get(mes);
    if (fresco(guardado, TTL_RESUMEN)) {
      d = guardado.d; // ya lo teníamos: se pinta al instante, sin esqueleto ni petición
    } else {
      cont.setAttribute("aria-busy", "true");
      cont.innerHTML = `<div class="rm-esqueleto" role="status" aria-label="Cargando tu resumen"><span></span><span></span><span></span><span></span></div>`;
      try {
        d = await apiFetch(`/api/me/resumen-mensual?mes=${encodeURIComponent(mes)}`);
      } catch (err) {
        if (mia === peticion) { cont.removeAttribute("aria-busy"); cont.innerHTML = `<p class="sesiones-vacio">No se ha podido cargar el resumen.</p>`; }
        return;
      }
      if (mia !== peticion) return;
      if (d && d.mes && d.disponible !== false) cacheResumen.set(mes, { t: Date.now(), d });
    }
    cont.removeAttribute("aria-busy");
    if (d && d.disponible === false) { cont.innerHTML = bloqueado(d.mes, d.disponible_desde); return; }
    if (!d || !d.mes) { cont.innerHTML = `<p class="sesiones-vacio">No se ha podido cargar el resumen.</p>`; return; }
    cont.innerHTML = pintarResumen(d);
    animarBarras(cont);
    mesVisto = mes;
    // Abrir el último mes disponible cuenta como "visto": desaparecen el aviso y el punto.
    if (estado && estado.prefs && mes === estado.ultimo_mes_disponible && estado.prefs.visto < mes) {
      cerrarAviso();
      guardarPrefs({ visto: mes }).catch(() => {});
    }
  }

  // ---- Reconocimiento del mes ----
  // Tarjeta para todo el equipo con lo último confirmado. Si la persona es la reconocida, se le felicita.
  // Los admins, además, ven el gestor para proponer/confirmar a quién se reconoce cada mes.
  async function pintarReconocimiento(forzar) {
    const cont = $("rmReco");
    if (!cont) return;
    let d = null;
    if (!forzar && fresco(cacheReco, TTL_RECO)) d = cacheReco.d;
    else {
      try { d = await apiFetch("/api/reconocimientos"); } catch { d = null; }
      if (d) cacheReco = { t: Date.now(), d };
    }
    if (!$("rmReco")) return; // la vista se cerró mientras llegaba la respuesta
    const partes = [];
    if (d && d.mes && (d.redactor || d.foto)) {
      const soyYo = d.redactor && Number(d.redactor.id) === Number(USER.id);
      const hayFoto = d.foto && Number(d.foto.autor_id) === Number(USER.id);
      if (soyYo || hayFoto) {
        partes.push(`<div class="rm-reco-felicita" role="status">${ICO.trofeo}<span><b>¡Enhorabuena!</b> ${
          soyYo && hayFoto ? `Has sido Redactor/a del mes y tu foto ha sido la Foto del mes de ${esc(nombreMes(d.mes))}.`
            : soyYo ? `Eres Redactor/a del mes de ${esc(nombreMes(d.mes))}.` : `Tu foto ha sido la Foto del mes de ${esc(nombreMes(d.mes))}.`}</span></div>`);
      }
      partes.push(`<section class="rm-seccion rm-reco"><h4>Reconocimiento de ${esc(nombreMes(d.mes))}</h4><div class="rm-reco-grid">${
        d.redactor ? `<div class="rm-reco-item"><span class="rm-reco-ico">${ICO.trofeo}</span><div><small>Redactor/a del mes</small><b>${esc(d.redactor.nombre)}</b><em>${num(d.redactor.publicaciones)} publicaciones</em></div></div>` : ""}${
        d.foto ? `<div class="rm-reco-item"><span class="rm-reco-miniatura"><img src="${esc(d.foto.url)}" alt="" loading="lazy" decoding="async"></span><div><small>Foto del mes</small><b>${esc(d.foto.titulo || "Sin título")}</b>${d.foto.autor_nombre ? `<em>de ${esc(d.foto.autor_nombre)}</em>` : ""}</div></div>` : ""}</div>
        <p class="rm-nota">Se muestra también en la portada de la web.</p></section>`);
    }
    if (USER.rol === "admin") partes.push(`<details class="rm-seccion rm-gestion" id="rmGestion"><summary>${ICO.trofeo} Gestionar el reconocimiento del mes</summary><div id="rmGestionCuerpo" class="rm-gestion-cuerpo"></div></details>`);
    cont.innerHTML = partes.join("");
    const det = $("rmGestion");
    if (det) det.addEventListener("toggle", () => { if (det.open && !det.dataset.listo) { det.dataset.listo = "1"; cargarGestion(estado && estado.ultimo_mes_disponible); } });
  }

  // Tarjeta "propuesta del sistema" con quién es el mejor del mes y cómo se ha calculado.
  function propuestaSistema(red, eq, mes) {
    if (!red.length) return "";
    const mejor = red[0];
    const empatados = red.filter((r) => r.empate_en_cabeza);
    const titulo = empatados.length > 1
      ? `Empate en cabeza: ${empatados.map((r) => esc(r.nombre)).join(" y ")}`
      : esc(mejor.nombre);
    const etiqueta = empatados.length > 1 ? "Propuesta del sistema · decide la dirección" : "Propuesta del sistema · el mejor del mes";
    const sinVisitas = !(eq && eq.visitas > 0);
    const pesoP = Math.round(((eq && eq.peso_publicaciones) || 1) * 100), pesoV = 100 - pesoP;
    return `<div class="rm-propuesta" role="status">
        <span class="rm-propuesta-ico">${ICO.trofeo}</span>
        <div class="rm-propuesta-txt"><small>${etiqueta}</small><b>${titulo}</b>
          <em>${pc(mejor.puntuacion)} de puntuación · ${pc(mejor.pct_publicaciones)} de las publicaciones y ${pc(mejor.pct_visitas)} de las visitas del equipo</em></div>
      </div>
      <p class="rm-nota">La puntuación es la parte de las publicaciones del equipo (${pesoP} %)${sinVisitas ? "" : ` más la parte de las visitas (${pesoV} %)`} que ha conseguido cada persona en ${esc(nombreMes(mes))}${sinVisitas ? "; ese mes no hay visitas registradas, así que cuentan solo las publicaciones" : ""}.
        Equipo: ${num(eq.redactores)} ${eq.redactores === 1 ? "redactor/a" : "redactores"} · ${num(eq.publicaciones)} publicaciones · ${num(eq.visitas)} visitas.${red.length < eq.redactores ? ` Se muestran los ${red.length} primeros de ${num(eq.redactores)}.` : ""}</p>`;
  }

  function filaCandidato(r, actualR, mejor) {
    const textoInsignia = r.empate_en_cabeza ? "Empate en cabeza" : r.es_mejor ? "Mejor del mes" : "";
    const insignia = textoInsignia ? `<span class="rm-cand-insignia">${ICO.trofeo}${textoInsignia}</span>` : "";
    return `<label class="rm-opcion rm-cand${r.es_mejor ? " rm-cand-mejor" : ""}">
      <input type="radio" name="rmgRedactor" value="${r.id}"${r.id === actualR ? " checked" : ""}>
      <span class="rm-cand-cuerpo">
        <span class="rm-cand-linea"><span class="rm-cand-pos" title="Puesto ${r.posicion}"><span class="rm-solo-lector">Puesto </span>${r.posicion}</span><b>${esc(r.nombre)}</b>${insignia}<strong class="rm-cand-pct" title="Puntuación global">${pc(r.puntuacion)}</strong></span>
        <span class="rm-pista rm-cand-pista" aria-hidden="true"><i data-pct="${pct(r.puntuacion, mejor.puntuacion)}"></i></span>
        <span class="rm-cand-datos"><em>${pc(r.pct_publicaciones)} de las publicaciones (${num(r.publicaciones)})</em><em>${pc(r.pct_visitas)} de las visitas (${num(r.visitas)})</em>${r.es_mejor ? "" : `<em>${pc(r.pct_del_mejor)} de la puntuación del mejor</em>`}</span>
      </span>
    </label>`;
  }

  // Detalle de la persona elegida en el selector, comparada con la propuesta del sistema.
  function detalleElegido(red, id) {
    if (id == null) return `<p class="rm-detalle-vacio">Sin redactor/a del mes: no se reconocerá a nadie este mes.</p>`;
    const r = red.find((x) => x.id === id);
    if (!r) return "";
    const mejor = red[0];
    let comparacion;
    if (r.empate_en_cabeza) {
      comparacion = `<p class="rm-detalle-ok">Va en cabeza${red.filter((x) => x.empate_en_cabeza).length > 1 ? " junto con " + red.filter((x) => x.empate_en_cabeza && x.id !== r.id).map((x) => esc(x.nombre)).join(" y ") : ""}: coincide con la propuesta del sistema.</p>`;
    } else if (r.es_mejor) {
      comparacion = `<p class="rm-detalle-ok">Es la propuesta del sistema: la mejor puntuación del mes.</p>`;
    } else {
      const dif = Math.round((mejor.puntuacion - r.puntuacion) * 10) / 10;
      comparacion = `<p class="rm-detalle-aviso">No es la propuesta del sistema: alcanza el <b>${pc(r.pct_del_mejor)}</b> de la puntuación de <b>${esc(mejor.nombre)}</b> (${pc(mejor.puntuacion)}), ${dif.toLocaleString("es-ES", { maximumFractionDigits: 1 })} puntos menos.
        <button type="button" class="rm-detalle-btn" data-rmg-elegir="${mejor.id}">Elegir a ${esc(mejor.nombre)}</button></p>`;
    }
    return `<div class="rm-detalle-cab"><b>${esc(r.nombre)}</b><span>Puesto ${r.posicion} de ${red.length}</span></div>
      <div class="rm-detalle-datos">
        <div><small>Puntuación</small><b>${pc(r.puntuacion)}</b></div>
        <div><small>Publicaciones</small><b>${pc(r.pct_publicaciones)}</b><em>${num(r.publicaciones)} del equipo</em></div>
        <div><small>Visitas</small><b>${pc(r.pct_visitas)}</b><em>${num(r.visitas)} del equipo</em></div>
      </div>${comparacion}`;
  }

  // Candidatos del mes que se está mostrando en el gestor, y pintado del detalle de quien esté elegido.
  let candidatosMostrados = [];
  function idRedactorElegido() {
    const r = document.querySelector('#rmGestionCuerpo input[name="rmgRedactor"]:checked');
    return r && r.value ? Number(r.value) : null;
  }
  function pintarDetalle() {
    const el = $("rmgDetalle");
    if (el) el.innerHTML = detalleElegido(candidatosMostrados, idRedactorElegido());
  }
  // El contenedor del gestor es el mismo al cambiar de mes (solo se reescribe su contenido), así que sus
  // listeners se enlazan UNA vez: si se añadieran en cada render se acumularían.
  function enlazarGestion(cuerpo) {
    if (cuerpo.dataset.enlazado) return;
    cuerpo.dataset.enlazado = "1";
    cuerpo.addEventListener("change", (ev) => { if (ev.target && ev.target.name === "rmgRedactor") pintarDetalle(); });
    cuerpo.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-rmg-elegir]");
      if (!b) return;
      const radio = cuerpo.querySelector(`input[name="rmgRedactor"][value="${b.dataset.rmgElegir}"]`);
      if (radio) { radio.checked = true; pintarDetalle(); radio.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    });
  }

  async function datosGestion(mes) {
    const guardado = cacheGestion.get(mes || "");
    if (fresco(guardado, TTL_RECO)) return guardado.d;
    let d = null;
    try { d = await apiFetch(`/api/reconocimientos/gestion?mes=${encodeURIComponent(mes || "")}`); } catch { d = null; }
    // Se cachea también bajo el mes que devuelve el servidor (cuando se pide "el último" sin indicarlo).
    if (d && d.mes && !d.error) { const e = { t: Date.now(), d }; cacheGestion.set(mes || "", e); cacheGestion.set(d.mes, e); }
    return d;
  }

  async function cargarGestion(mes) {
    const cuerpo = $("rmGestionCuerpo");
    if (!cuerpo) return;
    if (!fresco(cacheGestion.get(mes || ""), TTL_RECO)) cuerpo.innerHTML = `<p class="sesiones-vacio">Cargando candidatos…</p>`;
    const d = await datosGestion(mes);
    if (!$("rmGestionCuerpo")) return;
    if (!d || d.error || !d.mes) { cuerpo.innerHTML = `<p class="sesiones-vacio">${esc((d && d.error) || "No se han podido cargar los candidatos.")}</p>`; return; }
    if (d.disponible === false) { cuerpo.innerHTML = `<p class="sesiones-vacio">Ese mes aún no ha terminado.</p>`; return; }
    const red = d.candidatos.redactores, fotos = d.candidatos.fotos, eq = d.candidatos.equipo || { redactores: red.length, publicaciones: 0, visitas: 0 };
    const actualR = d.confirmado && d.confirmado.redactor ? d.confirmado.redactor.id : null;
    const actualF = d.confirmado && d.confirmado.foto ? d.confirmado.foto.media_id : null;
    cuerpo.innerHTML = `
      ${d.confirmado && d.confirmado.auto && d.confirmado.redactor ? `<p class="rm-nota rm-auto" role="status"><b>Redactor/a del mes elegido automáticamente</b> por el sistema (mejor puntuación del mes). Ya se muestra en la portada; puedes cambiarlo o quitarlo aquí cuando quieras.</p>` : `<p class="rm-nota">El Redactor/a del mes se elige solo al cerrar el mes (mejor puntuación); lo que guardes aquí tiene prioridad. La Foto del mes la eliges tú entre fotos públicas vinculadas a una galería de partido ese mes.</p>`}
      <label class="rm-selector rm-gestion-mes">Mes <select id="rmgMes">${(d.meses || [d.mes]).map((m) => `<option value="${m}"${m === d.mes ? " selected" : ""}>${esc(cap(nombreMes(m)))}</option>`).join("")}</select></label>
      <fieldset class="rm-gestion-grupo"><legend>Redactor/a del mes</legend>
        ${propuestaSistema(red, eq, d.mes)}
        <label class="rm-opcion"><input type="radio" name="rmgRedactor" value=""${actualR == null ? " checked" : ""}><span>Ninguno</span></label>
        ${red.length ? red.map((r) => filaCandidato(r, actualR, red[0])).join("") : `<p class="rm-nota">Nadie con publicaciones ese mes.</p>`}
        <div class="rm-detalle" id="rmgDetalle" aria-live="polite"></div>
      </fieldset>
      <fieldset class="rm-gestion-grupo"><legend>Foto del mes</legend>
        <label class="rm-opcion"><input type="radio" name="rmgFoto" value=""${actualF == null ? " checked" : ""}><span>Ninguna</span></label>
        ${fotos.length ? `<div class="rm-fotos">${fotos.map((f) => `<label class="rm-foto-opcion" title="${esc(f.titulo || "Sin título")}${f.autor_nombre ? ` · ${esc(f.autor_nombre)}` : ""}"><input type="radio" name="rmgFoto" value="${f.media_id}"${f.media_id === actualF ? " checked" : ""}><img src="${esc(f.url)}" alt="${esc(f.titulo || "Foto candidata")}" loading="lazy" decoding="async"></label>`).join("")}</div>` : `<p class="rm-nota">Ninguna foto pública se vinculó a una galería de partido ese mes.</p>`}
      </fieldset>
      <div class="rm-gestion-acc"><button type="button" class="rm-pri" id="rmgGuardar">Guardar reconocimiento</button><label class="rm-opcion"><input type="checkbox" id="rmgAvisar" checked><span>Avisar por correo a quien se reconoce (solo si aún no se le ha avisado)</span></label></div>
      <p class="rm-nota" id="rmgNota">Si no eliges a nadie, se quita el reconocimiento de ese mes y el sistema no volverá a elegir a nadie en él.</p>`;
    animarBarras(cuerpo);
    const idElegido = () => { const r = cuerpo.querySelector('input[name="rmgRedactor"]:checked'); return r && r.value ? Number(r.value) : null; };
    candidatosMostrados = red; // los listeners delegados (se enlazan una sola vez) leen siempre el mes que se está viendo
    enlazarGestion(cuerpo);
    pintarDetalle();
    $("rmgMes").addEventListener("change", (ev) => cargarGestion(ev.target.value));
    $("rmgGuardar").addEventListener("click", async (ev) => {
      const b = ev.currentTarget;
      const f = cuerpo.querySelector('input[name="rmgFoto"]:checked');
      b.disabled = true;
      try {
        const res = await apiFetch("/api/reconocimientos/gestion", { method: "PUT", body: JSON.stringify({
          mes: d.mes, redactor_id: idElegido(), media_id: f && f.value ? Number(f.value) : null, avisar: !!$("rmgAvisar").checked }) });
        if (res && res.error) throw new Error(res.error);
        cacheGestion.clear(); cacheReco = null; // lo confirmado ha cambiado: que se vuelva a pedir
        toast(res && res.correos ? `Reconocimiento guardado. Aviso enviado por correo a ${res.correos} ${res.correos === 1 ? "persona" : "personas"}.` : "Reconocimiento guardado.");
        pintarReconocimiento(true);
      } catch (err) { toast((err && err.message) || "No se pudo guardar el reconocimiento.", "error"); }
      b.disabled = false;
    });
  }

  async function abrirVista() {
    const cont = $("resumenMesCont");
    if (!cont) return;
    cont.innerHTML = `<p class="sesiones-vacio">Cargando…</p>`;
    try { await pedirEstado(); } catch { estado = null; }
    if (!estado) { cont.innerHTML = `<p class="sesiones-vacio">No se ha podido cargar el resumen mensual.</p>`; return; }
    const meses = estado.meses_disponibles;
    const mesInicial = meses.includes(mesVisto) ? mesVisto : (meses[0] || estado.ultimo_mes_disponible);
    const aviso = estado.prefs.aviso;
    cont.innerHTML = `
      <div class="rm-cab">
        <div class="rm-cab-texto">
          <p class="rm-cab-etiqueta">${ICO.grafico} Resumen mensual</p>
          <h3 id="rmTitulo">${esc(cap(nombreMes(meses.length ? mesInicial : estado.mes_actual)))}</h3>
        </div>
        ${meses.length > 1 ? `<label class="rm-selector">Mes <select id="rmMes">${meses.map((m) => `<option value="${m}"${m === mesInicial ? " selected" : ""}>${esc(cap(nombreMes(m)))}</option>`).join("")}</select></label>` : ""}
      </div>
      <label class="rm-aviso-opcion"><input type="checkbox" id="rmAviso"${aviso ? " checked" : ""}><span class="rm-interruptor" aria-hidden="true"></span>
        <span><b>Avisarme cuando mi resumen esté disponible</b>Te saldrá un aviso en el panel el último día de cada mes. Puedes desactivarlo cuando quieras.</span></label>
      <div id="rmReco"></div>
      <div id="rmContenido" aria-live="polite"></div>`;
    pintarReconocimiento();
    $("rmAviso").addEventListener("change", async (ev) => {
      const on = ev.target.checked;
      try {
        await guardarPrefs({ aviso: on });
        toast(on ? "Aviso activado." : "Aviso desactivado.", on ? "success" : "info");
        if (!on) cerrarAviso();
      } catch { ev.target.checked = !on; toast("No se pudo guardar la preferencia.", "error"); }
    });
    const sel = $("rmMes");
    if (sel) sel.addEventListener("change", () => { $("rmTitulo").textContent = cap(nombreMes(sel.value)); cargarMes(sel.value); });
    if (!meses.length) {
      $("rmContenido").innerHTML = bloqueado(estado.mes_actual, estado.mes_actual_disponible_desde);
    } else {
      cargarMes(mesInicial);
      // Si el mes en curso aún no se puede abrir, se explica cuándo estará.
      if (!estado.mes_actual_disponible) {
        const nota = document.createElement("p");
        nota.className = "rm-nota";
        nota.textContent = `El resumen de ${nombreMes(estado.mes_actual)} se abrirá el ${fechaLarga(estado.mes_actual_disponible_desde)}.`;
        cont.appendChild(nota);
      }
    }
  }

  function iniciar() {
    const boton = document.querySelector('#subtabsAjustes button[data-subtab="resumenMes"]');
    if (boton) boton.addEventListener("click", abrirVista);
    const comprobar = async () => {
      try {
        await pedirEstado(true);
        actualizarPunto();
        if (window.EOF && EOF.esperarRacha) await EOF.esperarRacha(); // tras la celebración de racha, si la hay
        mostrarAviso();
      } catch { /* sin aviso si falla */ }
    };
    // Se pide un poco después de arrancar para no competir con la carga inicial del panel.
    setTimeout(comprobar, 3500);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && Date.now() - ultimaComprobacion > 30 * 60 * 1000) comprobar();
    });
  }
  iniciar();
})();
