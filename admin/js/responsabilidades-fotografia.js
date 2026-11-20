// ---------- Funcionalidades > Responsabilidades > Fotografía (solo Responsables) ----------
// Una tarjeta por cada fotógrafo con la acreditación APROBADA, agrupadas por FIN DE SEMANA, con el partido, el
// contacto y —lo más importante— si la galería del partido está PUBLICADA o NO.
//
// Backend: GET /api/responsabilidades/fotografia (worker y worker-secondary). Solo lectura: no guarda nada.
// "Publicada" = el partido tiene al menos un contenido público en su galería (el mismo criterio que /galerias).
//
// Depende de globales de admin.js / clubs.js: apiFetch(path) -> JSON o lanza Error, getEscudoUrl,
// window.EOF.toast. Los escudos que no cargan se sustituyen por la inicial con el manejador de error de
// responsabilidades.js (clase .resp-escudo + data-inicial), que escucha en todo #subpanel-responsabilidades.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const toast = (msg, tipo) => { try { window.EOF.toast(msg, tipo || "info", 3000); } catch { /* sin toast */ } };

  const COMPETICIONES = {
    hypermotion: "LaLiga Hypermotion",
    primera_federacion: "Primera Federación",
    segunda_federacion: "Segunda Federación",
    tercera_federacion: "Tercera Federación",
  };
  const nombreCompeticion = (c) => COMPETICIONES[c] || String(c || "").replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());

  const ICO = {
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>',
    no: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.4v.01"/></svg>',
    espera: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    duda: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.9M12 16.8v.01"/></svg>',
    camara: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    copiar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
    enlace: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    buscar: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    campana: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    refrescar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4M4 4v4h4M4 13a8 8 0 0 0 14.5 4M20 20v-4h-4"/></svg>',
  };

  // Cómo se presenta cada estado de galería. «clase» enlaza con el color de la tarjeta en el CSS.
  const ESTADOS = {
    publicada: { clase: "ok", ico: "ok", titulo: "Galería publicada" },
    sin_publicar: { clase: "warn", ico: "warn", titulo: "Galería NO publicada" },
    no_subida: { clase: "no", ico: "no", titulo: "Galería NO publicada" },
    pendiente: { clase: "espera", ico: "espera", titulo: "Pendiente" },
    sin_partido: { clase: "duda", ico: "duda", titulo: "Partido sin identificar" },
  };

  const estado = { cargando: false, error: "", datos: null, cargadoEn: null, filtros: { q: "", comp: "", soloNo: false }, enviando: new Set() };
  const esNoPublicada = (f) => f.galeria.estado === "no_subida" || f.galeria.estado === "sin_publicar";
  const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Un partido es «reciente» si se jugó hace una semana o menos: solo entonces la galería sin publicar es
  // una pendiente que avisa (aviso, contador y botones de recordar). Pasada la semana ya no se avisa.
  const DIAS_AVISO = 7;
  const hoyMadridMs = () => {
    const l = leerFecha(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date()));
    return l ? l.ms : Date.now();
  };
  const esReciente = (f) => {
    const fe = f.partido ? leerFecha(f.partido.fecha_partido) : null;
    return !!fe && (hoyMadridMs() - fe.ms) / 86400000 <= DIAS_AVISO;
  };
  const esPendienteAviso = (f) => esNoPublicada(f) && esReciente(f);
  const sePuedeRecordar = (f) => f.recordatorio !== null && f.recordatorio !== undefined && !!f.email && esPendienteAviso(f);

  // Fin de semana al que pertenece un partido (clave = sábado, AAAA-MM-DD). Un «fin de semana» abarca de VIERNES
  // a LUNES: vie–lun van a ese fin de semana,
  // el martes al anterior y miércoles–jueves al siguiente (el sábado más cercano).
  function sabadoDe(ms) {
    const dow = new Date(ms).getUTCDay(); // 0 = domingo … 6 = sábado
    const desde = { 0: 1, 1: 2, 2: 3, 3: -3, 4: -2, 5: -1, 6: 0 }[dow]; // días desde el sábado más cercano
    return ms - desde * 86400000;
  }
  const claveFinde = (p) => {
    const fe = p ? leerFecha(p.fecha_partido) : null;
    return fe ? `finde|${new Date(sabadoDe(fe.ms)).toISOString().slice(0, 10)}` : "sin";
  };
  const claveGrupo = (f) => (f.partido ? claveFinde(f.partido) : "sin");
  function textoFinde(clave) {
    const sab = Date.parse(`${clave.split("|")[1]}T00:00:00Z`);
    const fmt = (ms, mes) => new Intl.DateTimeFormat("es-ES", { day: "numeric", ...(mes ? { month: "short" } : {}), timeZone: "UTC" }).format(new Date(ms)).replace(/\./g, "");
    const vie = sab - 86400000, lun = sab + 2 * 86400000; // el fin de semana cubre de viernes a lunes
    const mismoMes = new Date(vie).getUTCMonth() === new Date(lun).getUTCMonth();
    return mismoMes ? `${fmt(vie)}–${fmt(lun, true)}` : `${fmt(vie, true)} – ${fmt(lun, true)}`;
  }

  // ---------- Utilidades ----------
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const iniciales = (nombre) => {
    const p = String(nombre || "?").trim().split(/\s+/).filter(Boolean);
    return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
  };

  // "2026-11-08" o "2026-11-08T18:30" (hora de Madrid, sin zona) -> { ms, hora, texto }
  function leerFecha(f) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(f || ""));
    if (!m) return null;
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const dia = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(ms)).replace(/\./g, "");
    return { ms, hora: m[4] ? `${m[4]}:${m[5]}` : "", texto: m[4] ? `${dia} · ${m[4]}:${m[5]}` : dia };
  }

  function escudoHtml(nombre, url) {
    let u = "";
    try { u = getEscudoUrl(nombre, url || undefined); } catch { u = url || ""; }
    if (u && u.startsWith("img/")) u = "../" + u;
    const inicial = esc(String(nombre || "?").trim().charAt(0).toUpperCase() || "?");
    return u
      ? `<img class="resp-escudo" src="${esc(u)}" alt="" loading="lazy" data-inicial="${inicial}">`
      : `<span class="resp-escudo">${inicial}</span>`;
  }

  // Círculo de la persona: su foto de perfil (si tiene cuenta en la web y la ha subido) o, si no, sus iniciales.
  // La foto va encima de las iniciales: si no carga, se quita y las iniciales quedan a la vista.
  function avatarHtml(f) {
    const ini = esc(iniciales(f.nombre));
    const url = f.cuenta && f.cuenta.avatar_url ? String(f.cuenta.avatar_url).trim() : "";
    if (!url) return `<span class="rf-av" aria-hidden="true">${ini}</span>`;
    let foco = "50% 50%";
    try { foco = EOF_FOCO.texto(f.cuenta.avatar_foco); } catch { /* sin foco.js: centrada */ }
    const src = url.startsWith("img/") ? "../" + url : url;
    return `<span class="rf-av rf-av-foto" aria-hidden="true">${ini}<img class="rf-av-img" src="${esc(src)}" alt="" loading="lazy" style="object-position:${esc(foco)}"></span>`;
  }

  // ---------- Tarjeta ----------
  function bandaEstado(f) {
    const e = ESTADOS[f.galeria.estado] || ESTADOS.sin_partido;
    const g = f.galeria;
    let detalle;
    switch (g.estado) {
      case "publicada": detalle = `${plural(g.publicas, "foto pública", "fotos públicas")} en la galería`; break;
      case "sin_publicar": detalle = `Hay ${plural(g.total, "archivo subido", "archivos subidos")}, pero en privado`; break;
      case "no_subida": detalle = "Aún no se ha subido ninguna foto del partido"; break;
      case "pendiente": detalle = "El partido todavía no se ha jugado"; break;
      default: detalle = "No se sabe a qué partido corresponde";
    }
    return `<div class="rf-estado" role="status">
      <span class="rf-estado-ico">${ICO[e.ico]}</span>
      <div class="rf-estado-txt"><strong>${esc(e.titulo)}</strong><small>${esc(detalle)}</small></div>
    </div>`;
  }

  function bloquePartido(f) {
    const p = f.partido;
    if (!p) {
      return `<div class="rf-partido rf-partido-nd">
        <p class="rf-nd-equipo">${esc(f.equipo)}</p>
        <p class="rf-nd-ayuda">${f.jornada_partido ? `Indicó: «${esc(f.jornada_partido)}». ` : ""}Falta la fecha del partido en la solicitud para poder ubicarlo.</p>
      </div>`;
    }
    const fecha = leerFecha(p.fecha_partido);
    const marcador = p.goles_local != null && p.goles_visitante != null && p.estado !== "programado"
      ? `${esc(p.goles_local)}<i>–</i>${esc(p.goles_visitante)}` : `<i>vs</i>`;
    return `<div class="rf-partido">
      <div class="rf-equipos">
        <span class="rf-eq">${escudoHtml(p.equipo_local, p.escudo_local_url)}<b>${esc(p.equipo_local)}</b></span>
        <span class="rf-marcador">${marcador}</span>
        <span class="rf-eq rf-eq-v">${escudoHtml(p.equipo_visitante, p.escudo_visitante_url)}<b>${esc(p.equipo_visitante)}</b></span>
      </div>
      <p class="rf-meta">${fecha ? esc(fecha.texto) : "Sin fecha"} · ${esc(nombreCompeticion(p.competicion))}</p>
    </div>`;
  }

  function lineaFotos(f) {
    const g = f.galeria;
    if (!f.partido) return "";
    if (!f.cuenta) return `<li class="rf-dato rf-dato-suave">${ICO.camara}<span>Sin cuenta en la web con este correo: no se pueden contar sus fotos.</span></li>`;
    if (g.estado === "pendiente") return "";
    const n = g.mias || 0, pub = g.mias_publicas || 0;
    return `<li class="rf-dato">${ICO.camara}<span>Sus fotos en este partido: <b>${n}</b>${n ? ` (${pub} ${pub === 1 ? "pública" : "públicas"})` : ""}</span></li>`;
  }

  // Recordatorio automático de galería (solo el Worker principal lo conoce; si no, f.recordatorio es null).
  function lineaRecordatorio(f) {
    const r = f.recordatorio, est = f.galeria.estado;
    if (!r || !f.partido || est === "publicada" || est === "pendiente") return "";
    if (r.enviado_at === null && !esReciente(f)) return "";    if (r.enviado_at === null) return `<li class="rf-dato rf-dato-suave">${ICO.campana}<span>Recordatorio automático: aún no ha salido</span></li>`;
    const fecha = r.enviado_at ? leerFecha(r.enviado_at) : null;
    return `<li class="rf-dato">${ICO.campana}<span>Recordatorio automático tramitado${fecha ? ` el <b>${esc(fecha.texto.split(" · ")[0])}</b>` : ""}</span></li>`;
  }

  function tarjeta(f) {
    const e = ESTADOS[f.galeria.estado] || ESTADOS.sin_partido;
    const enlace = f.galeria.url
      ? `<a class="rf-enlace" href="${esc(f.galeria.url)}" target="_blank" rel="noopener noreferrer">${ICO.enlace}<span>Ver galería pública</span></a>`
      : "";
    const enviando = estado.enviando.has(Number(f.id));
    const recordar = sePuedeRecordar(f)
      ? `<button type="button" class="rf-recordar ${f.recordatorio.enviado_at !== null ? "rf-recordar-repetir" : "rf-recordar-primero"}" data-rf="recordar" data-id="${Number(f.id)}" ${enviando ? "disabled" : ""}>${ICO.campana}<span>${enviando ? "Enviando…" : (f.recordatorio.enviado_at !== null ? "Volver a recordar" : "Recordar ahora")}</span></button>`
      : "";
    const pie = enlace || recordar ? `<footer class="rf-pie">${recordar}${enlace}</footer>` : "";
    return `<article class="rf-card rf-${e.clase}" data-id="${Number(f.id)}">
      ${bandaEstado(f)}
      <div class="rf-cuerpo">
        <header class="rf-persona">
          ${avatarHtml(f)}
          <div class="rf-persona-txt">
            <h5>${esc(f.nombre)}</h5>
            <span class="rf-tipo">${esc(f.tipo_acreditacion || "Fotógrafo")} · ${esc(f.equipo)}</span>
          </div>
        </header>
        ${bloquePartido(f)}
        <ul class="rf-datos">
          <li class="rf-dato">${ICO.mail}<a href="mailto:${esc(f.email)}">${esc(f.email)}</a>
            <button type="button" class="rf-copiar" data-rf="copiar" data-valor="${esc(f.email)}" aria-label="Copiar el correo de ${esc(f.nombre)}" title="Copiar correo">${ICO.copiar}</button></li>
          ${lineaFotos(f)}
          ${lineaRecordatorio(f)}
        </ul>
      </div>
      ${pie}
    </article>`;
  }

  // ---------- Agrupar por jornada ----------
  function agrupar(lista) {
    const mapa = new Map();
    for (const f of lista) {
      const p = f.partido;
      const clave = claveGrupo(f);
      if (!mapa.has(clave)) mapa.set(clave, { clave, p, items: [], ultimo: 0 });
      const g = mapa.get(clave);
      g.items.push(f);
      const fecha = p ? leerFecha(p.fecha_partido) : null;
      if (fecha && fecha.ms > g.ultimo) g.ultimo = fecha.ms;
    }
    const grupos = [...mapa.values()];
    for (const g of grupos) {
      g.items.sort((a, b) => {
        const fa = a.partido ? (leerFecha(a.partido.fecha_partido) || { ms: 0 }).ms : 0;
        const fb = b.partido ? (leerFecha(b.partido.fecha_partido) || { ms: 0 }).ms : 0;
        return fa - fb || String((a.partido || {}).competicion || "").localeCompare(String((b.partido || {}).competicion || "")) || String(a.nombre).localeCompare(String(b.nombre), "es");
      });
    }
    // Lo más reciente (y lo que viene) arriba; «sin identificar» siempre al final.
    grupos.sort((a, b) => (a.clave === "sin") - (b.clave === "sin") || b.ultimo - a.ultimo);
    return grupos;
  }

  function cabeceraGrupo(g) {
    if (g.clave === "sin") {
      return `<header class="rf-grupo-cab"><div><h4>Partido sin identificar</h4><p>Acreditaciones aprobadas que no se han podido ligar a un partido.</p></div></header>`;
    }
    const todos = estado.datos.fotografos.filter((f) => claveGrupo(f) === g.clave);
    const total = todos.length;
    const pub = todos.filter((f) => f.galeria.estado === "publicada").length;
    const comps = [...new Set(todos.map((f) => f.partido && f.partido.competicion).filter(Boolean))].map(nombreCompeticion).join(" · ");
    return `<header class="rf-grupo-cab">
      <div><h4>Fin de semana ${esc(textoFinde(g.clave))} <span class="rf-grupo-dias">vie–lun</span></h4><p>${esc(comps)}</p></div>
      <div class="rf-grupo-prog" title="Galerías publicadas este fin de semana">
        <span><b>${pub}</b> de ${total} publicadas</span>
        <span class="rf-barra"><i style="width:${total ? Math.round((pub / total) * 100) : 0}%"></i></span>
      </div>
    </header>`;
  }

  // ---------- Pintado ----------
  function pintarResumen(r) {
    const chip = (clase, n, txt) => `<div class="rf-chip rf-chip-${clase}"><b>${n}</b><span>${txt}</span></div>`;
    return `<div class="rf-resumen" role="group" aria-label="Resumen de galerías">
      ${chip("ok", r.publicada, "publicadas")}
      ${chip("no", r.no_subida + r.sin_publicar, "NO publicadas")}
      ${chip("espera", r.pendiente, "pendientes de jugar")}
      ${r.sin_partido ? chip("duda", r.sin_partido, "sin identificar") : ""}
    </div>`;
  }

  // ---------- Filtros, aviso y contador ----------
  function filtrar(lista) {
    const { q, comp, soloNo } = estado.filtros;
    const k = sinTildes(q).trim();
    return lista.filter((f) => {
      if (soloNo && !esNoPublicada(f)) return false;
      if (comp && !(f.partido && f.partido.competicion === comp)) return false;
      if (k && !sinTildes(`${f.nombre} ${f.email} ${f.equipo}`).includes(k)) return false;
      return true;
    });
  }
  const hayFiltros = () => !!(estado.filtros.q || estado.filtros.comp || estado.filtros.soloNo);

  function pintarFiltros() {
    const cont = $("respFotoFiltros");
    if (!cont) return;
    const lista = estado.datos ? estado.datos.fotografos : [];
    if (!lista.length) { cont.innerHTML = ""; return; }
    const comps = [...new Set(lista.map((f) => f.partido && f.partido.competicion).filter(Boolean))];
    const { q, comp, soloNo } = estado.filtros;
    cont.innerHTML = `<label class="rf-buscador">${ICO.buscar}<input type="search" data-rf-filtro="q" value="${esc(q)}" placeholder="Buscar fotógrafo, correo o equipo" aria-label="Buscar fotógrafo"></label>
      <select data-rf-filtro="comp" aria-label="Filtrar por competición"><option value="">Todas las competiciones</option>${comps.map((c) => `<option value="${esc(c)}"${c === comp ? " selected" : ""}>${esc(nombreCompeticion(c))}</option>`).join("")}</select>
      <button type="button" class="rf-toggle${soloNo ? " on" : ""}" data-rf="solo-no" aria-pressed="${soloNo}">Solo NO publicadas</button>
      ${hayFiltros() ? '<button type="button" class="rf-limpiar" data-rf="limpiar">Quitar filtros</button>' : ""}`;
  }

  function pintarAviso(lista) {
    const pend = lista.filter(esPendienteAviso).length;
    if (!pend) return `<div class="rf-aviso rf-aviso-ok" role="status">${ICO.ok}<span>No hay galerías pendientes de publicar de la última semana.</span></div>`;
    return `<div class="rf-aviso rf-aviso-warn" role="status">${ICO.campana}<span><b>${plural(pend, "galería pendiente", "galerías pendientes")} de publicar</b> en partidos de los últimos 7 días.</span>
      <div class="rf-aviso-botones">
        ${estado.filtros.soloNo ? "" : '<button type="button" data-rf="solo-no">Ver las NO publicadas</button>'}
        ${lista.filter(sePuedeRecordar).length ? `<button type="button" class="rf-aviso-accion" data-rf="recordar-todos" ${estado.enviando.size ? "disabled" : ""}>${ICO.campana}<span>Recordar a todos</span></button>` : ""}
      </div></div>`;
  }

  // Contador sobre la subpestaña, visible aunque aún no se haya abierto Fotografía.
  function pintarContador() {
    const boton = document.querySelector('#subtabsResponsabilidades [data-subtab="respFotografia"]');
    if (!boton) return;
    const n = estado.datos ? estado.datos.fotografos.filter(esPendienteAviso).length : 0;
    let b = boton.querySelector(".rf-contador");
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("span"); b.className = "rf-contador"; boton.appendChild(b); }
    b.textContent = String(n);
    b.setAttribute("title", `${plural(n, "galería sin publicar", "galerías sin publicar")} en la última semana`);
  }

  function pintar() {
    const raiz = $("respFotoLista");
    if (!raiz) return;
    const barra = $("respFotoBarra");
    if (barra) {
      const hora = estado.cargadoEn ? estado.cargadoEn.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "";
      barra.innerHTML = `${estado.datos ? `<span class="rf-act">Actualizado a las ${esc(hora)}</span>` : ""}
        <button type="button" class="resp-btn rf-btn-act" data-rf="recargar" ${estado.cargando ? "disabled" : ""}>${ICO.refrescar}<span>${estado.cargando ? "Cargando…" : "Actualizar"}</span></button>`;
    }
    if (estado.error) {
      raiz.innerHTML = `<div class="resp-aviso error" role="alert"><span>${esc(estado.error)}</span><button type="button" data-rf="recargar">Reintentar</button></div>`;
      return;
    }
    if (!estado.datos) {
      raiz.innerHTML = `<div class="resp-aviso" role="status"><span>Cargando fotógrafos acreditados…</span></div>`;
      return;
    }
    const { fotografos, resumen } = estado.datos;
    if (!fotografos.length) {
      raiz.innerHTML = `<div class="rf-vacio">${ICO.camara}<strong>Todavía no hay fotógrafos acreditados</strong>
        <p>Cuando apruebes una acreditación de fotógrafo aparecerá aquí, con el estado de la galería de su partido.</p></div>`;
      return;
    }
    pintarContador();
    pintarFiltros();
    const visibles = filtrar(fotografos);
    if (!visibles.length) {
      raiz.innerHTML = pintarAviso(fotografos) + pintarResumen(resumen) + `<div class="rf-vacio">${ICO.buscar}<strong>Ningún fotógrafo coincide con los filtros</strong>
        <p>Prueba con otra búsqueda o quita los filtros.</p><button type="button" class="resp-btn" data-rf="limpiar">Quitar filtros</button></div>`;
      return;
    }
    // Todos los fines de semana salen siempre desplegados, con sus tarjetas a la vista.
    raiz.innerHTML = pintarAviso(fotografos) + pintarResumen(resumen) + agrupar(visibles).map((g) => `<section class="rf-grupo" aria-label="${g.clave === "sin" ? "Partido sin identificar" : `Fin de semana ${esc(textoFinde(g.clave))}`}">
        ${cabeceraGrupo(g)}
        <div class="rf-grid">${g.items.map(tarjeta).join("")}</div>
      </section>`).join("");
  }

  async function cargar() {
    if (estado.cargando) return;
    estado.cargando = true; estado.error = "";
    pintar();
    try {
      const d = await apiFetch("/api/responsabilidades/fotografia");
      if (!d || !Array.isArray(d.fotografos)) throw new Error("Respuesta no válida");
      estado.datos = d; estado.cargadoEn = new Date();
    } catch (err) {
      estado.error = (err && err.message) || "No se han podido cargar los fotógrafos acreditados.";
    } finally {
      estado.cargando = false;
      pintar();
    }
  }

  const MOTIVOS = {
    ya_publicada: "ya tiene galería publicada", reciente: "ya se le avisó hace menos de 12 h", pendiente: "su partido aún no se ha jugado",
    sin_partido: "no se identifica su partido", antiguo: "el partido fue hace más de una semana", sin_correo: "no tiene correo", fallo: "no se pudo enviar el correo", no_encontrada: "no se encontró la solicitud",
  };
  async function recordar(ids) {
    ids = ids.filter((id) => !estado.enviando.has(id));
    if (!ids.length) return;
    ids.forEach((id) => estado.enviando.add(id));
    pintar();
    try {
      const d = await apiFetch("/api/responsabilidades/fotografia/recordar", { method: "POST", body: JSON.stringify({ ids }) });
      const ok = (d.resultados || []).filter((r) => r.estado === "enviado");
      const no = (d.resultados || []).filter((r) => r.estado !== "enviado");
      if (ok.length) toast(ok.length === 1 ? `Recordatorio enviado a ${ok[0].nombre}` : `Recordatorio enviado a ${ok.length} fotógrafos`, "ok");
      if (no.length) toast(no.length === 1 ? `${no[0].nombre || "Fotógrafo"}: ${MOTIVOS[no[0].estado] || "no se envió"}` : `${no.length} sin enviar (ya avisados, partido antiguo o sin jugar)`, "info");
    } catch (err) {
      toast((err && err.message) || "No se pudo enviar el recordatorio", "error");
    } finally {
      ids.forEach((id) => estado.enviando.delete(id));
      estado.cargando = false;
      await cargar();
    }
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); toast("Correo copiado", "ok"); }
    catch { toast("No se pudo copiar el correo", "error"); }
  }

  // ---------- Eventos ----------
  function enlazar() {
    const panel = $("subpanel-respFotografia");
    if (!panel || panel.dataset.rfListo) return;
    panel.dataset.rfListo = "1";
    const alFiltrar = (e) => {
      const c = e.target.closest("[data-rf-filtro]");
      if (!c) return;
      estado.filtros[c.dataset.rfFiltro] = c.value;
      // Se repinta solo la lista: así el cuadro de búsqueda no pierde el foco al escribir.
      const hayFoco = document.activeElement === c;
      const pos = hayFoco && c.selectionStart != null ? c.selectionStart : null;
      pintar();
      if (hayFoco) { const n = panel.querySelector(`[data-rf-filtro="${c.dataset.rfFiltro}"]`); if (n) { n.focus(); if (pos != null && n.setSelectionRange) try { n.setSelectionRange(pos, pos); } catch { /* tipo search */ } } }
    };
    // Una foto de perfil que no carga se quita para que se vean las iniciales (el evento «error» no burbujea: captura).
    panel.addEventListener("error", (e) => {
      const i = e.target;
      if (i && i.classList && i.classList.contains("rf-av-img")) i.remove();
    }, true);
    panel.addEventListener("input", alFiltrar);
    panel.addEventListener("change", alFiltrar);
    panel.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rf]");
      if (!b) return;
      if (b.dataset.rf === "recargar") cargar();
      else if (b.dataset.rf === "solo-no") { estado.filtros.soloNo = !estado.filtros.soloNo; pintar(); }
      else if (b.dataset.rf === "limpiar") { estado.filtros = { q: "", comp: "", soloNo: false }; pintar(); }
      else if (b.dataset.rf === "copiar") copiar(b.dataset.valor || "");
      else if (b.dataset.rf === "recordar") recordar([Number(b.dataset.id)]);
      else if (b.dataset.rf === "recordar-todos") {
        const lista = filtrar(estado.datos.fotografos).filter(sePuedeRecordar);
        if (lista.length && window.confirm(`Se enviará el recordatorio de galería a ${plural(lista.length, "fotógrafo", "fotógrafos")} con la galería sin publicar (partidos de los últimos 7 días). ¿Continuar?`)) recordar(lista.map((f) => Number(f.id)));
      }
    });
  }

  function iniciar() {
    enlazar();
    // El manejador genérico de subpestañas (admin.js) enseña el subpanel; aquí solo se cargan los datos.
    const boton = document.querySelector('#subtabsResponsabilidades [data-subtab="respFotografia"]');
    // Carga silenciosa al abrir Responsabilidades para que el contador de la subpestaña ya esté al día.
    const raizResp = document.getElementById("subtabFuncResponsabilidades_btn");
    if (raizResp) raizResp.addEventListener("click", () => { if (!estado.datos && !estado.cargando) cargar(); });
    if (boton) boton.addEventListener("click", () => { if (!estado.datos || Date.now() - (estado.cargadoEn || 0) > 60000) cargar(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();

  window.EOFResponsabilidadesFotografia = { cargar };
})();
