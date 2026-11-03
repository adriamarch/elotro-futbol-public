// ---------- Funcionalidades > Responsabilidades (solo administradores) ----------
// Dos bloques:
//   · RELACIONES INSTITUCIONALES: checklist de todos los clubes + base de datos
//     de contactos (clubes, federaciones, departamentos de prensa y responsables
//     de comunicación) + plantillas de comunicación (responsabilidades-plantillas.js).
//   · RECURSOS HUMANOS: recordatorio de contacto con los colaboradores activos
//     (habitualmente cada dos meses, con la ficha de cada persona) + dos checklists de clubes (con redactor asignado y con
//     fotógrafo asignado) + lista de personas que al medio le gustaría fichar.
// Backend: GET/PUT /api/responsabilidades (worker y worker-secondary), guardado
// en la tabla `settings` bajo la clave 'responsabilidades'. Solo admin.
// Los clubes salen de clubs.js (getClubsForCategoria), así que si se añade uno
// allí (o uno personalizado) aparece solo. Cada club se guarda por su slug.
// El guardado es automático (con una pequeña espera tras el último cambio).
//
// Depende de globales de admin.js / clubs.js / ui-alertas.js:
//   apiFetch(path, options) -> JSON o lanza Error con el mensaje del servidor
//   getClubsForCategoria, slugEquipo, getEscudoUrl, getGrupoClub
//   window.EOF.toast / window.EOF.confirmar
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const toast = (msg, tipo, ms) => { try { window.EOF.toast(msg, tipo || "info", ms || 3500); } catch { /* sin toast */ } };
  async function confirmar(msg, opciones) {
    if (window.EOF && window.EOF.confirmar) return !!(await window.EOF.confirmar(msg, opciones || {}));
    return window.confirm(msg);
  }

  const ESPERA_GUARDADO_MS = 700;

  const COMPETICIONES = [
    { id: "hypermotion", nombre: "LaLiga Hypermotion", color: "#e11d48" },
    { id: "primera_federacion", nombre: "Primera Federación", color: "#2563eb" },
    { id: "segunda_federacion", nombre: "Segunda Federación", color: "#16a34a" },
    { id: "tercera_federacion", nombre: "Tercera Federación", color: "#d97706" },
  ];

  const LISTAS = {
    relaciones: {
      raiz: "respRelClubes",
      resumen: "Clubes con los que ya hay relación institucional establecida.",
      etiquetaHecho: "Con relación",
    },
    rrhhRedactores: {
      raiz: "respRrhhRedactores",
      resumen: "Clubes que ya tienen un redactor asignado. Se marcan solos cuando una cuenta de redactor tiene ese club en «Usuarios».",
      etiquetaHecho: "Cubiertos",
    },
    rrhhFotografos: {
      raiz: "respRrhhFotografos",
      resumen: "Clubes que ya tienen un fotógrafo asignado. Se marcan solos cuando una cuenta de fotógrafo tiene ese club en «Usuarios».",
      etiquetaHecho: "Cubiertos",
    },
  };
  const CLAVES_CHECKLIST = Object.keys(LISTAS);
  const ROLES_RRHH = { redactores: "rrhhRedactores", fotografos: "rrhhFotografos" };

  const PUESTOS = {
    redactor: { nombre: "Redacción", color: "#2563eb" },
    fotografo: { nombre: "Fotografía", color: "#7c3aed" },
    community: { nombre: "Redes sociales", color: "#e23d94" },
    diseno: { nombre: "Diseño gráfico", color: "#f07a1a" },
    video: { nombre: "Vídeo", color: "#dc2626" },
    narracion: { nombre: "Narración / comentarios", color: "#0ea5b7" },
    web: { nombre: "Web / programación", color: "#475569" },
    otro: { nombre: "Otro", color: "#64748b" },
  };
  const ESTADOS = {
    pendiente: "Por contactar",
    contactado: "Contactado",
    conversando: "En conversación",
    fichado: "Fichado",
    descartado: "Descartado",
  };
  const PRIORIDADES = { alta: "Alta", media: "Media", baja: "Baja" };

  // Base de datos de contactos institucionales.
  const TIPOS_CONTACTO = {
    club: { nombre: "Club", color: "#2563eb" },
    federacion: { nombre: "Federación", color: "#7c3aed" },
    otro: { nombre: "Otro organismo", color: "#64748b" },
  };
  const AREAS_CONTACTO = {
    prensa: "Departamento de prensa",
    comunicacion: "Responsable de comunicación",
    general: "Contacto general",
    otro: "Otro",
  };
  // Solo son sugerencias del desplegable al escribir la entidad (no son datos de contacto).
  const SUGERENCIAS_ENTIDAD = [
    "Real Federación Española de Fútbol (RFEF)", "LaLiga",
    "Federación Andaluza de Fútbol", "Federación Aragonesa de Fútbol", "Federación de Fútbol del Principado de Asturias",
    "Federación Balear de Fútbol", "Federación Canaria de Fútbol", "Federación Cántabra de Fútbol",
    "Federación de Fútbol de Castilla-La Mancha", "Federación de Fútbol de Castilla y León", "Federació Catalana de Futbol",
    "Federación de Fútbol de Ceuta", "Federación Extremeña de Fútbol", "Real Federación Gallega de Fútbol",
    "Real Federación de Fútbol de Madrid", "Federación Melillense de Fútbol", "Federación de Fútbol de la Región de Murcia",
    "Federación Navarra de Fútbol", "Federación Riojana de Fútbol", "Federación de Fútbol de la Comunitat Valenciana",
    "Federación Vasca de Fútbol",
  ];
  const MAX_CONTACTOS = 1500;
  const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const ICO = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    lupa: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    chev: '<svg class="resp-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    lapiz: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    papelera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    escudo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
    gente: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    persona: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    tel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    web: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    copiar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
  };

  // ---------- Estado ----------
  const estado = {
    cargado: false,
    cargando: false,
    errorCarga: "",
    clubes: { relaciones: new Set(), rrhhRedactores: new Set(), rrhhFotografos: new Set() },
    // Clubes con alguien asignado según las cuentas de la web (users.equipo): slug -> [nombres].
    // Lo calcula el servidor en cada lectura; en RRHH se marcan solos y no se pueden quitar a mano.
    auto: { rrhhRedactores: new Map(), rrhhFotografos: new Map() }, // slugs marcados (se conservan también los que ya no existan en clubs.js)
    fichajes: [],
    contactos: [], // base de datos de contactos institucionales
    contacto: { dia: 1, historial: [], marcados: { mes: "", ids: [] } }, // recordatorio de contacto (cada dos meses): desde qué día avisa y contactos ya hechos
    activos: [],   // colaboradores con la cuenta activa [{ nombre, rol, email }] (los calcula el servidor)
    guardado: "ok", // ok | pendiente | guardando | error
    errorGuardado: "",
  };
  const vista = {
    relaciones: { busqueda: "", filtro: "todos", plegados: new Set(), montada: false },
    rrhhRedactores: { busqueda: "", filtro: "todos", plegados: new Set(), montada: false },
    rrhhFotografos: { busqueda: "", filtro: "todos", plegados: new Set(), montada: false },
    rolRrhh: "redactores", // checklist de RRHH visible: redactores | fotografos
    fichajes: { busqueda: "", estado: "todos", montada: false, editando: undefined }, // editando: undefined = form cerrado, null = nueva, string = id
    contactos: { busqueda: "", tipo: "todos", area: "todas", montada: false, editando: undefined, imp: null }, // editando: igual que fichajes
    contactoNota: "",
    cm: { busqueda: "", filtro: "todos", rol: "todos", orden: "nombre", abiertos: new Set() }, // contacto con colaboradores: filtros y fichas abiertas
  };
  let temporizador = null;
  let enlazado = false;
  let cambios = 0;     // sube con cada cambio del usuario
  let enVuelo = false; // hay un PUT en curso

  // ---------- Clubes (desde clubs.js) ----------
  // [{ comp, slug, nombre, grupo }] sin repetidos entre competiciones.
  function listaClubes() {
    const vistos = new Set();
    const out = [];
    for (const comp of COMPETICIONES) {
      let nombres = [];
      try { nombres = getClubsForCategoria(comp.id) || []; } catch { nombres = []; }
      for (const nombre of nombres) {
        const slug = slugEquipo(nombre);
        if (!slug || vistos.has(slug)) continue;
        vistos.add(slug);
        let grupo = "";
        try { grupo = getGrupoClub(nombre) || ""; } catch { grupo = ""; }
        out.push({ comp: comp.id, slug, nombre, grupo });
      }
    }
    return out;
  }
  function escudoHtml(nombre) {
    let u = "";
    try { u = getEscudoUrl(nombre); } catch { u = ""; }
    if (u && u.startsWith("img/")) u = "../" + u;
    const inicial = esc(String(nombre || "?").trim().charAt(0).toUpperCase() || "?");
    return u
      ? `<img class="resp-escudo" src="${esc(u)}" alt="" loading="lazy" data-inicial="${inicial}">`
      : `<span class="resp-escudo">${inicial}</span>`;
  }

  // Convierte { "Club": ["Nombre", …] } (como lo devuelve el servidor) en Map slug -> nombres,
  // usando el mismo slug que las tarjetas; si el nombre llega con otra grafía se prueba el alias de escudos.
  function mapaAuto(objeto) {
    const mapa = new Map();
    if (!objeto || typeof objeto !== "object") return mapa;
    const validos = new Set(listaClubes().map((c) => c.slug));
    for (const club of Object.keys(objeto)) {
      let slug = slugEquipo(club);
      if (!validos.has(slug) && typeof ALIAS_ESCUDOS !== "undefined" && ALIAS_ESCUDOS[slug] && validos.has(ALIAS_ESCUDOS[slug])) slug = ALIAS_ESCUDOS[slug];
      const nombres = (Array.isArray(objeto[club]) ? objeto[club] : []).filter((n) => typeof n === "string" && n);
      if (!slug || !nombres.length) continue;
      mapa.set(slug, [...new Set([...(mapa.get(slug) || []), ...nombres])]);
    }
    return mapa;
  }
  const autoDe = (clave, slug) => (estado.auto[clave] && estado.auto[clave].get(slug)) || null;
  // Marcados a mano + asignados automáticamente por las cuentas.
  function marcadosEf(clave) {
    const base = estado.clubes[clave];
    const auto = estado.auto[clave];
    if (!auto || !auto.size) return base;
    const todos = new Set(base);
    auto.forEach((_, slug) => todos.add(slug));
    return todos;
  }

  // ---------- Carga y guardado ----------
  async function cargar() {
    enlazar();
    if (estado.cargando) return;
    // Cambios sin guardar: no se recarga encima, solo se repinta.
    if (estado.cargado && (estado.guardado === "pendiente" || estado.guardado === "guardando")) { pintarTodo(); return; }
    estado.cargando = true;
    estado.errorCarga = "";
    pintarTodo();
    try {
      const d = await apiFetch("/api/responsabilidades");
      // apiFetch puede devolver {} ante un fallo de sesión/conexión sin lanzar error:
      // en ese caso NO se da por cargado, para no sobrescribir datos reales con vacío.
      if (!d || !d.relaciones || !d.rrhh) throw new Error("No se han podido leer los datos del servidor.");
      estado.clubes.relaciones = new Set(Array.isArray(d.relaciones.clubes) ? d.relaciones.clubes : []);
      // Compatibilidad: antes había una sola lista `rrhh.clubes`, que pasa a ser la de redactores.
      const heredados = Array.isArray(d.rrhh.clubes) ? d.rrhh.clubes : [];
      estado.clubes.rrhhRedactores = new Set(Array.isArray(d.rrhh.redactores) ? d.rrhh.redactores : heredados);
      estado.clubes.rrhhFotografos = new Set(Array.isArray(d.rrhh.fotografos) ? d.rrhh.fotografos : []);
      estado.auto.rrhhRedactores = mapaAuto(d.auto && d.auto.redactores);
      estado.auto.rrhhFotografos = mapaAuto(d.auto && d.auto.fotografos);
      estado.fichajes = Array.isArray(d.rrhh.fichajes) ? d.rrhh.fichajes : [];
      estado.contactos = Array.isArray(d.relaciones.contactos) ? d.relaciones.contactos : [];
      const cm = d.rrhh.contacto_mensual || {};
      estado.contacto = {
        dia: Number.isInteger(cm.dia) && cm.dia >= 1 && cm.dia <= 28 ? cm.dia : 1,
        historial: Array.isArray(cm.historial) ? cm.historial.filter((h) => h && /^\d{4}-\d{2}$/.test(h.mes)) : [],
        marcados: {
          mes: cm.marcados && /^\d{4}-\d{2}$/.test(cm.marcados.mes || "") ? cm.marcados.mes : "",
          ids: cm.marcados && Array.isArray(cm.marcados.ids) ? cm.marcados.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [],
        },
      };
      estado.activos = Array.isArray(d.activos) ? d.activos : [];
      estado.cargado = true;
      estado.guardado = "ok";
    } catch (err) {
      estado.cargado = false;
      estado.errorCarga = (err && err.message) || "No se han podido cargar los datos.";
    } finally {
      estado.cargando = false;
    }
    CLAVES_CHECKLIST.forEach((c) => { vista[c].montada = false; });
    vista.fichajes.montada = false;
    vista.contactos.montada = false;
    pintarTodo();
  }

  function programarGuardado() {
    cambios++;
    estado.guardado = enVuelo ? "guardando" : "pendiente";
    estado.errorGuardado = "";
    pintarEstado();
    clearTimeout(temporizador);
    temporizador = setTimeout(guardar, ESPERA_GUARDADO_MS);
  }

  async function guardar() {
    if (!estado.cargado) return;
    clearTimeout(temporizador);
    if (enVuelo) return; // al terminar se comprueba si hubo cambios nuevos
    enVuelo = true;
    const miVersion = cambios;
    estado.guardado = "guardando";
    pintarEstado();
    let fallo = false;
    try {
      await apiFetch("/api/responsabilidades", {
        method: "PUT",
        body: JSON.stringify({
          relaciones: { clubes: [...estado.clubes.relaciones], contactos: estado.contactos },
          rrhh: { redactores: [...estado.clubes.rrhhRedactores], fotografos: [...estado.clubes.rrhhFotografos], fichajes: estado.fichajes, contacto_mensual: estado.contacto },
        }),
      });
    } catch (err) {
      fallo = true;
      estado.guardado = "error";
      estado.errorGuardado = (err && err.message) || "error";
      toast("No se ha podido guardar: " + estado.errorGuardado, "error", 6000);
    }
    enVuelo = false;
    if (!fallo) {
      if (cambios !== miVersion) return guardar(); // hubo cambios mientras se guardaba
      estado.guardado = "ok";
    }
    pintarEstado();
  }

  function pintarEstado() {
    const el = $("respEstado");
    if (!el) return;
    el.className = "resp-estado " + estado.guardado;
    if (!estado.cargado) { el.className = "resp-estado"; el.innerHTML = ""; return; }
    if (estado.guardado === "ok") el.textContent = "Guardado";
    else if (estado.guardado === "pendiente") el.textContent = "Cambios sin guardar…";
    else if (estado.guardado === "guardando") el.textContent = "Guardando…";
    else el.innerHTML = `Error al guardar <button type="button" data-resp="reintentar-guardado">Reintentar</button>`;
  }

  // ---------- Pintado general ----------
  function pintarTodo() {
    pintarEstado();
    // Las plantillas no dependen del servidor: se montan aunque falle la carga.
    if (window.EOFRespPlantillas) window.EOFRespPlantillas.montar();
    if (!estado.cargado) {
      const html = estado.cargando
        ? '<div class="resp-aviso">Cargando…</div>'
        : `<div class="resp-aviso error"><span>${esc(estado.errorCarga || "No se han podido cargar los datos.")}</span><button type="button" data-resp="reintentar-carga">Reintentar</button></div>`;
      for (const clave of CLAVES_CHECKLIST) { const r = $(LISTAS[clave].raiz); if (r) r.innerHTML = html; }
      const f = $("respRrhhFichajes"); if (f) f.innerHTML = html;
      const cm = $("respRrhhContacto"); if (cm) cm.innerHTML = html;
      const k = $("respRelContactos"); if (k) k.innerHTML = html;
      return;
    }
    montarContactoMensual();
    CLAVES_CHECKLIST.forEach(montarChecklist);
    pintarRolRrhh();
    montarFichajes();
    montarContactos();
  }

  // Selector Redactores / Fotógrafos de la checklist de RRHH: enseña una sola
  // lista a la vez y el avance de cada una en el propio botón.
  function pintarRolRrhh() {
    const panel = $("respRrhhRoles");
    if (!panel) return;
    for (const rol in ROLES_RRHH) {
      const clave = ROLES_RRHH[rol];
      const caja = $(LISTAS[clave].raiz);
      if (caja) caja.hidden = vista.rolRrhh !== rol;
      const b = panel.querySelector(`[data-valor="${rol}"]`);
      if (!b) continue;
      b.setAttribute("aria-pressed", String(vista.rolRrhh === rol));
      const n = b.querySelector("[data-zona='n']");
      if (n && estado.cargado) {
        const por = contarPorComp(clave);
        let h = 0, t = 0;
        for (const id in por) { h += por[id].hechos; t += por[id].total; }
        n.textContent = `${h}/${t}`;
      }
    }
  }

  // ======================================================================
  //  CONTACTO PERIÓDICO CON LOS COLABORADORES ACTIVOS (CADA DOS MESES)
  //  Habitualmente cada dos meses hay que escribir a los colaboradores activos.
  //  El ciclo cuenta desde el último contacto hecho: si ese contacto fue hace
  //  menos de dos meses, no toca; si fue hace dos o más (o nunca), toca a partir
  //  del día elegido. Se anota y se guarda el historial (un registro por mes, así
  //  que el formato guardado no cambia). Si toca y no está hecho, se avisa también
  //  fuera de esta pestaña (recordatorioMensual: punto rojo en el menú y aviso una
  //  vez al día).
  // ======================================================================
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const pad2 = (n) => String(n).padStart(2, "0");
  const claveMes = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1);
  const fechaIso = (d) => claveMes(d) + "-" + pad2(d.getDate());
  const MESES_ENTRE_CONTACTOS = 2; // cada cuántos meses se contacta con los colaboradores
  const indiceMes = (clave) => { const [a, m] = String(clave).split("-").map((x) => parseInt(x, 10)); return a * 12 + (m - 1); };
  function claveDeIndice(i) { return Math.floor(i / 12) + "-" + pad2((i % 12) + 1); }
  function nombreMes(clave) {
    const [a, m] = String(clave).split("-");
    return (MESES[parseInt(m, 10) - 1] || clave) + " de " + a;
  }
  function fechaCorta(iso) {
    const [a, m, d] = String(iso || "").split("-").map((x) => parseInt(x, 10));
    return a && m && d ? d + " " + (MESES[m - 1] || "").slice(0, 3) + (MESES[m - 1] && MESES[m - 1].length > 3 ? "." : "") : "";
  }
  // { mes, hecho (último registro si aún está vigente, o null), proximo (mes en que vuelve a tocar),
  //   debido (ya toca avisar) } para una fecha dada. El contacto hecho cubre este mes y el siguiente.
  function situacionContacto(ahora) {
    const hoy = ahora || new Date();
    const mes = claveMes(hoy);
    const ultimo = estado.contacto.historial.reduce((a, h) => (!a || h.mes > a.mes ? h : a), null);
    const vigente = ultimo && indiceMes(mes) - indiceMes(ultimo.mes) < MESES_ENTRE_CONTACTOS;
    const hecho = vigente ? ultimo : null;
    const proximo = ultimo ? claveDeIndice(indiceMes(ultimo.mes) + MESES_ENTRE_CONTACTOS) : mes;
    return { mes, hecho, proximo, debido: !hecho && hoy.getDate() >= estado.contacto.dia };
  }

  function mensajeMensualColaboradores() {
    const firma = (typeof USER !== "undefined" && USER && USER.nombre) ? USER.nombre : "";
    return [
      "Asunto: ¿Qué tal todo por El Otro Fútbol?",
      "",
      "Hola a todos y a todas:",
      "",
      "Os escribo, como cada dos meses, para saber cómo estáis y cómo lleváis la colaboración con El Otro Fútbol. Sois voluntarios y todo lo que aportáis es de agradecer, así que sin ninguna presión.",
      "",
      "Si necesitáis algo (ayuda con el panel, cambiar de equipo, un respiro por exámenes o trabajo, o simplemente comentar cómo os va), decídmelo y lo vemos. Y si por el motivo que sea ya no podéis seguir colaborando, también me lo podéis decir con total tranquilidad.",
      "",
      "Este es un mensaje enviado por el equipo de El Otro Fútbol; podéis responder a este correo directamente.",
      "",
      "Un abrazo,",
      firma,
      "El Otro Fútbol",
    ].filter((l, i, a) => !(l === "" && a[i - 1] === "") ).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // Colaboradores ya contactados en este ciclo (la marca se reinicia sola a los dos meses).
  function idsContactados() {
    const m = estado.contacto.marcados;
    const vigente = m && m.mes && indiceMes(claveMes(new Date())) - indiceMes(m.mes) < MESES_ENTRE_CONTACTOS;
    return new Set(vigente ? m.ids : []);
  }

  // ---- Ficha de cada colaborador (foto, equipos, actividad, noticias…) ----
  const DIA_MS = 86400000;
  const DIAS_INACTIVO = 60; // dos meses sin acceso ni noticias = conviene escribirle primero
  const CICLO_DIAS = 61;    // duración aproximada del ciclo de contacto (dos meses)
  const ICOCM = {
    reloj: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pluma: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M13 8l3 3"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>',
    puerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>',
    estrella: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18.2v.1"/></svg>',
  };
  function fechaDeBD(s) {
    let t = String(s || "").trim();
    if (!t) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) t += "T00:00:00Z";
    else if (!/[zZ]$|[+-]\d\d:?\d\d$/.test(t)) t = t.replace(" ", "T") + "Z";
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }
  function diasDesde(s) {
    const d = fechaDeBD(s);
    return d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / DIA_MS)) : null;
  }
  function haceTexto(dias) {
    if (dias === null || dias === undefined) return "nunca";
    if (dias === 0) return "hoy";
    if (dias === 1) return "ayer";
    if (dias < 30) return `hace ${dias} días`;
    if (dias < 365) { const m = Math.floor(dias / 30); return `hace ${m} ${m === 1 ? "mes" : "meses"}`; }
    const a = Math.floor(dias / 365);
    return `hace ${a} ${a === 1 ? "año" : "años"}`;
  }
  function fechaLarga(s) {
    const d = fechaDeBD(s);
    return d ? d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "";
  }
  const tieneFicha = (a) => !!a && Object.prototype.hasOwnProperty.call(a, "ultimo_acceso");
  // Días desde lo más reciente entre su último acceso y su última noticia (null = sin datos).
  function diasSinActividad(a) {
    const ds = [diasDesde(a.ultimo_acceso), diasDesde(a.ultima_noticia)].filter((x) => x !== null);
    return ds.length ? Math.min(...ds) : null;
  }
  function situacionActividad(a) {
    if (!tieneFicha(a)) return { tipo: "sin-datos", dias: null };
    if (!a.primer_acceso && !a.ultimo_acceso) return { tipo: "nuevo", dias: null };
    const dias = diasSinActividad(a);
    if (dias === null) return { tipo: "inactivo", dias: null };
    return { tipo: dias >= DIAS_INACTIVO ? "inactivo" : "activo", dias };
  }
  function etiquetaNivel(a) {
    const n = Number(a.nivel);
    if (!Number.isInteger(n) || n < 1) return "";
    try {
      if (a.rol === "fotografo") {
        const e = typeof NIVELES_FOTO_ETIQUETA !== "undefined" && NIVELES_FOTO_ETIQUETA[n];
        return e ? `${e.emoji || ""} ${e.etiqueta || ""} · ${e.nombre || ""}`.replace(/\s+/g, " ").trim() : "F" + n;
      }
      const e = typeof NIVELES_ETIQUETA !== "undefined" && NIVELES_ETIQUETA[n];
      return e ? `${e.emoji || ""} ${e.nombre || ""}`.trim() : "Nivel " + n;
    } catch { return "Nivel " + n; }
  }
  function avatarHtml(a) {
    const ini = String(a.nombre || "?").trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join("").toUpperCase() || "?";
    const url = /^(https?:\/\/|\/)[^\s'"()\\]+$/.test(a.avatar_url || "") ? a.avatar_url : "";
    let pos = "";
    try {
      const f = url && a.avatar_foco && typeof EOF_FOCO !== "undefined" ? String(EOF_FOCO.texto(a.avatar_foco) || "") : "";
      if (/^\d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/.test(f)) pos = `background-position:${f};`;
    } catch { /* sin foco */ }
    return `<span class="resp-cm-av${a.rol === "fotografo" ? " foto" : ""}"${url ? ` style="background-image:url('${esc(url)}');${pos}"` : ""}>${url ? "" : esc(ini)}</span>`;
  }
  function insigniaActividad(a) {
    const s = situacionActividad(a);
    if (s.tipo === "sin-datos") return "";
    if (s.tipo === "nuevo") return `<span class="resp-cm-badge aviso" title="Todavía no ha entrado nunca al panel">${ICOCM.alerta}Sin primer acceso</span>`;
    if (s.tipo === "inactivo") return `<span class="resp-cm-badge aviso" title="Sin acceso ni noticias desde hace dos meses o más">${ICOCM.alerta}${s.dias === null ? "Sin actividad" : "Sin actividad " + haceTexto(s.dias).replace("hace ", "· ")}</span>`;
    return `<span class="resp-cm-badge ok" title="Última actividad ${esc(haceTexto(s.dias))}"><i></i>Activo ${esc(haceTexto(s.dias))}</span>`;
  }
  function tesela(ico, titulo, valor, sub) {
    return `<div class="resp-cm-tes"><span class="resp-cm-tes-ico">${ico}</span><div><small>${esc(titulo)}</small><b>${valor}</b>${sub ? `<em>${sub}</em>` : ""}</div></div>`;
  }
  function detalleColaborador(a, hecho) {
    const esFoto = a.rol === "fotografo";
    let teselas = "";
    if (tieneFicha(a)) {
      const dAcc = diasDesde(a.ultimo_acceso);
      teselas += tesela(ICOCM.puerta, "Último acceso", a.ultimo_acceso ? esc(haceTexto(dAcc)) : "Sin registro", a.ultimo_acceso ? esc(fechaLarga(a.ultimo_acceso)) : "");
      if (!esFoto) {
        const dNot = diasDesde(a.ultima_noticia);
        teselas += tesela(ICOCM.pluma, "Última noticia", a.ultima_noticia ? esc(haceTexto(dNot)) : "Ninguna aún", a.ultima_noticia ? esc(fechaLarga(a.ultima_noticia)) : "");
        teselas += tesela(ICOCM.estrella, "Noticias publicadas", String(a.noticias || 0), `${a.noticias_2m || 0} en los últimos 2 meses`);
      }
      const alta = a.alta || a.primer_acceso;
      teselas += tesela(ICOCM.cal, "Con nosotros desde", alta ? esc(fechaLarga(alta)) : "—", alta ? esc(haceTexto(diasDesde(alta))) : "");
      const niv = etiquetaNivel(a);
      if (niv) teselas += tesela(ICOCM.estrella, esFoto ? "Nivel de fotografía" : "Nivel", esc(niv), "");
    }
    const equipos = (a.equipos || []).length
      ? `<div class="resp-cm-equipos">${a.equipos.map((e) => `<span class="resp-cm-equipo">${escudoHtml(e)}${esc(e)}</span>`).join("")}</div>`
      : "";
    const bio = a.bio ? `<p class="resp-cm-bio">“${esc(a.bio)}”</p>` : "";
    const correo = a.email
      ? `<a class="resp-btn" href="mailto:${esc(a.email)}?subject=${encodeURIComponent("¿Qué tal todo por El Otro Fútbol?")}">${ICO.mail} Escribir</a>
         <button type="button" class="resp-btn" data-resp="cm-copiar-uno" data-email="${esc(a.email)}">${ICO.copiar} Copiar correo</button>`
      : '<span class="resp-cm-sincorreo">Sin correo registrado</span>';
    return `<div class="resp-cm-det"><div>
      ${bio}${equipos}
      ${teselas ? `<div class="resp-cm-teselas">${teselas}</div>` : ""}
      <div class="resp-cm-acciones">
        ${correo}
        <button type="button" class="resp-btn${hecho ? "" : " resp-btn-principal"}" data-resp="cm-marcar-uno" data-id="${esc(a.id)}">${hecho ? "Quitar marca de contactado" : "Marcar como contactado"}</button>
      </div>
    </div></div>`;
  }
  function filaColaborador(a, hecho) {
    const abierto = vista.cm.abiertos.has(a.id);
    const esFoto = a.rol === "fotografo";
    const equiposTxt = (a.equipos || []).length ? ` · ${esc(a.equipos.join(", "))}` : "";
    return `<li class="resp-cm-card${hecho ? " hecho" : ""}${abierto ? " abierto" : ""}" data-id="${esc(a.id)}">
      <div class="resp-cm-cab">
        <label class="resp-cm-chk" title="Marcar como contactado">
          <input type="checkbox" class="resp-check" data-resp="cm-colab" data-id="${esc(a.id)}"${hecho ? " checked" : ""} aria-label="Contactado: ${esc(a.nombre)}">
          <span class="resp-marca">${ICO.check}</span>
        </label>
        <button type="button" class="resp-cm-main" data-resp="cm-expandir" data-id="${esc(a.id)}" aria-expanded="${abierto}">
          ${avatarHtml(a)}
          <span class="resp-cm-persona"><b>${esc(a.nombre)}</b><small><span class="resp-cm-rol${esFoto ? " foto" : ""}">${esFoto ? "Fotógrafo" : "Redactor"}</span>${equiposTxt}</small></span>
          ${insigniaActividad(a)}
          ${ICO.chev}
        </button>
      </div>
      ${detalleColaborador(a, hecho)}
    </li>`;
  }

  // Lista filtrada y ordenada según la vista (búsqueda, filtro, rol, orden).
  function colaboradoresVisibles() {
    const v = vista.cm, marcados = idsContactados();
    const q = sinTildes(v.busqueda).trim();
    let lista = estado.activos.filter((a) => {
      if (v.rol !== "todos" && (a.rol === "fotografo" ? "fotografos" : "redactores") !== v.rol) return false;
      const hecho = marcados.has(a.id);
      if (v.filtro === "pendientes" && hecho) return false;
      if (v.filtro === "contactados" && !hecho) return false;
      if (v.filtro === "inactivos" && situacionActividad(a).tipo !== "inactivo" && situacionActividad(a).tipo !== "nuevo") return false;
      if (q && !sinTildes(`${a.nombre} ${a.email} ${(a.equipos || []).join(" ")}`).includes(q)) return false;
      return true;
    });
    const porNombre = (x, y) => x.nombre.localeCompare(y.nombre, "es");
    if (v.orden === "inactividad") {
      const d = (a) => { const x = diasSinActividad(a); return x === null ? Infinity : x; };
      lista = lista.sort((x, y) => (d(y) - d(x)) || porNombre(x, y));
    } else if (v.orden === "pendientes") {
      lista = lista.sort((x, y) => (marcados.has(x.id) - marcados.has(y.id)) || porNombre(x, y));
    } else {
      lista = lista.sort(porNombre);
    }
    return lista;
  }

  // Anima el porcentaje (anillo, cifra y barra) desde el valor anterior hasta el nuevo.
  let animPct = null;
  function animarPorcentaje(desde, hasta) {
    const raiz = $("respRrhhContacto");
    if (!raiz) return;
    const anillo = raiz.querySelector(".resp-cm-anillo"), cifra = anillo && anillo.querySelector("span");
    const barra = raiz.querySelector('[data-zona="cm-pbar-i"]'), txt = raiz.querySelector('[data-zona="cm-pbar-pct"]');
    const pinta = (v) => {
      const n = Math.round(v);
      if (anillo) { anillo.style.setProperty("--p", v); anillo.setAttribute("aria-valuenow", String(n)); }
      if (cifra) cifra.textContent = n + "%";
      if (barra) barra.style.width = v + "%";
      if (txt) txt.textContent = n + "%";
    };
    if (animPct) cancelAnimationFrame(animPct);
    if (desde === hasta || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { pinta(hasta); return; }
    const t0 = performance.now(), dur = 600;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      pinta(desde + (hasta - desde) * e);
      animPct = k < 1 ? requestAnimationFrame(paso) : null;
    };
    animPct = requestAnimationFrame(paso);
  }

  function pintarResumenColab() {
    const zona = document.querySelector('#respRrhhContacto [data-zona="cm-resumen"]');
    if (!zona) return;
    const total = estado.activos.length, marcados = idsContactados();
    const hechos = estado.activos.filter((a) => marcados.has(a.id)).length;
    const pct = total ? Math.round((hechos / total) * 100) : 0;
    const inactivos = estado.activos.filter((a) => { const t = situacionActividad(a).tipo; return t === "inactivo" || t === "nuevo"; }).length;
    const sinCorreo = estado.activos.filter((a) => !a.email).length;
    const noticias2m = estado.activos.reduce((s, a) => s + (Number(a.noticias_2m) || 0), 0);
    const ficha = estado.activos.some(tieneFicha);
    const previo = zona.dataset.pct === undefined ? 0 : Number(zona.dataset.pct);
    zona.dataset.pct = String(pct);
    zona.innerHTML = `
      <div class="resp-anillo resp-cm-anillo" style="--p:${previo}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${previo}" aria-label="Colaboradores contactados"><span>${previo}%</span></div>
      <div class="resp-cm-kpis">
        <div class="resp-cm-kpi"><b>${hechos}/${total}</b><small>${hechos === total && total > 0 ? "¡todos contactados!" : "contactados en este ciclo"}</small>
          <div class="resp-cm-pbar" aria-hidden="true"><i data-zona="cm-pbar-i" style="width:${previo}%"></i></div>
          <small class="resp-cm-pbar-txt"><b data-zona="cm-pbar-pct">${previo}%</b> de la plantilla de colaboradores</small></div>
        ${ficha ? `<button type="button" class="resp-cm-kpi${inactivos ? " alerta" : ""}" data-resp="cm-ir-inactivos" title="Ver quién lleva dos meses o más sin actividad"><b>${inactivos}</b><small>sin actividad (2+ meses)</small></button>
        <div class="resp-cm-kpi"><b>${noticias2m}</b><small>noticias en 2 meses</small></div>` : ""}
        ${sinCorreo ? `<div class="resp-cm-kpi"><b>${sinCorreo}</b><small>sin correo</small></div>` : ""}
      </div>`;
    animarPorcentaje(previo, pct);
  }

  function pintarListaColab() {
    const ul = document.querySelector('#respRrhhContacto [data-zona="cm-lista"]');
    if (!ul) return;
    const lista = colaboradoresVisibles(), marcados = idsContactados();
    const cont = document.querySelector('#respRrhhContacto [data-zona="cm-cuenta"]');
    if (cont) cont.textContent = lista.length === estado.activos.length ? `${lista.length} personas` : `${lista.length} de ${estado.activos.length}`;
    ul.innerHTML = lista.length
      ? lista.map((a) => filaColaborador(a, marcados.has(a.id))).join("")
      : '<li class="resp-cm-vacio">Nadie coincide con ese filtro.</li>';
    document.querySelectorAll('#respRrhhContacto [data-resp="cm-filtro"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.valor === vista.cm.filtro)));
    document.querySelectorAll('#respRrhhContacto [data-resp="cm-rol"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.valor === vista.cm.rol)));
  }

  function guardarMarcados(ids) {
    estado.contacto.marcados = { mes: claveMes(new Date()), ids: [...ids] };
    programarGuardado();
  }
  function marcarColaborador(id, valor) {
    const ids = idsContactados();
    if (valor) ids.add(id); else ids.delete(id);
    guardarMarcados(ids);
    const tarjeta = document.querySelector(`#respRrhhContacto .resp-cm-card[data-id="${CSS.escape(String(id))}"]`);
    if (tarjeta) {
      tarjeta.classList.toggle("hecho", valor);
      const chk = tarjeta.querySelector('[data-resp="cm-colab"]'); if (chk) chk.checked = valor;
      const btn = tarjeta.querySelector('[data-resp="cm-marcar-uno"]');
      if (btn) { btn.textContent = valor ? "Quitar marca de contactado" : "Marcar como contactado"; btn.classList.toggle("resp-btn-principal", !valor); }
    }
    pintarResumenColab();
  }
  function marcarTodosColaboradores(valor) {
    guardarMarcados(valor ? new Set(estado.activos.map((a) => a.id)) : new Set());
    pintarResumenColab();
    pintarListaColab();
  }
  function alternarColaborador(id) {
    const tarjeta = document.querySelector(`#respRrhhContacto .resp-cm-card[data-id="${CSS.escape(String(id))}"]`);
    if (!tarjeta) return;
    const abrir = !tarjeta.classList.contains("abierto");
    tarjeta.classList.toggle("abierto", abrir);
    const b = tarjeta.querySelector('[data-resp="cm-expandir"]'); if (b) b.setAttribute("aria-expanded", String(abrir));
    if (abrir) vista.cm.abiertos.add(Number(id)); else vista.cm.abiertos.delete(Number(id));
  }
  // Ciclo actual: días desde el último contacto hecho sobre los ~61 de dos meses.
  function cicloInfo() {
    const ultimo = estado.contacto.historial.reduce((a, h) => (!a || h.mes > a.mes ? h : a), null);
    if (!ultimo) return null;
    const dias = diasDesde(ultimo.fecha);
    if (dias === null) return null;
    return { dias, pct: Math.max(2, Math.min(100, Math.round((dias / CICLO_DIAS) * 100))), vencido: dias >= CICLO_DIAS };
  }

  function montarContactoMensual() {
    const raiz = $("respRrhhContacto");
    if (!raiz) return;
    const { mes, hecho, proximo, debido } = situacionContacto();
    const activos = estado.activos;
    const nRed = activos.filter((a) => a.rol !== "fotografo").length;
    const nFot = activos.length - nRed;
    const conCorreo = activos.filter((a) => a.email).length;
    const tipo = hecho ? "hecho" : (debido ? "toca" : "aun");
    const ico = hecho ? ICO.check : ICO.mail;
    const titulo = hecho
      ? `Contacto de ${esc(nombreMes(hecho.mes))} hecho`
      : (debido ? `Toca contactar con los colaboradores activos (${esc(nombreMes(mes))})` : `Aún no toca (${esc(nombreMes(mes))})`);
    const sub = hecho
      ? `Marcado el ${esc(fechaCorta(hecho.fecha))}${hecho.nota ? " · " + esc(hecho.nota) : ""} · Próximo contacto: ${esc(nombreMes(proximo))}`
      : (debido ? "Escribe a todos y marca aquí que ya lo has hecho para que desaparezca el aviso." : `El aviso empieza el día ${estado.contacto.dia} del mes que toca (habitualmente cada dos meses).`);
    const ciclo = cicloInfo();
    const barra = ciclo
      ? `<div class="resp-cm-ciclo${ciclo.vencido ? " vencido" : ""}" title="Tiempo desde el último contacto"><i style="width:${ciclo.pct}%"></i></div>
         <small class="resp-cm-ciclo-txt">${ciclo.vencido ? "Han pasado más de dos meses desde el último contacto" : `Día ${ciclo.dias} de ~${CICLO_DIAS} desde el último contacto · ${esc(haceTexto(ciclo.dias))}`}</small>`
      : "";
    const accion = hecho
      ? '<button type="button" class="resp-btn" data-resp="cm-deshacer">Deshacer</button>'
      : '<button type="button" class="resp-btn resp-btn-principal" data-resp="cm-hecho">Marcar como hecho</button>';
    const nota = hecho ? "" : `<input type="text" class="resp-cm-nota" data-resp="cm-nota" maxlength="300" placeholder="Nota opcional (p. ej. «escrito por correo, 2 sin respuesta»)" value="${esc(vista.contactoNota)}">`;
    const v = vista.cm;
    const seg = (acc, valor, etiqueta, activo) => `<button type="button" class="resp-btn" data-resp="${acc}" data-valor="${valor}" aria-pressed="${activo}">${etiqueta}</button>`;
    const lista = activos.length
      ? `<div class="resp-cm-checklist">
          <div class="resp-cm-resumen" data-zona="cm-resumen"></div>
          <div class="resp-cm-barra">
            <label class="resp-busca">${ICO.lupa}<input type="search" data-resp="cm-buscar" placeholder="Buscar por nombre, correo o equipo…" autocomplete="off" aria-label="Buscar colaborador" value="${esc(v.busqueda)}"></label>
            <div class="resp-seg" role="group" aria-label="Filtrar colaboradores">
              ${seg("cm-filtro", "todos", "Todos", v.filtro === "todos")}${seg("cm-filtro", "pendientes", "Pendientes", v.filtro === "pendientes")}${seg("cm-filtro", "contactados", "Contactados", v.filtro === "contactados")}${seg("cm-filtro", "inactivos", "Sin actividad", v.filtro === "inactivos")}
            </div>
            <div class="resp-seg" role="group" aria-label="Filtrar por rol">
              ${seg("cm-rol", "todos", "Todos", v.rol === "todos")}${seg("cm-rol", "redactores", "Redactores", v.rol === "redactores")}${seg("cm-rol", "fotografos", "Fotógrafos", v.rol === "fotografos")}
            </div>
            <select class="resp-cm-orden" data-resp="cm-orden" aria-label="Ordenar colaboradores">
              <option value="nombre"${v.orden === "nombre" ? " selected" : ""}>Orden: nombre</option>
              <option value="inactividad"${v.orden === "inactividad" ? " selected" : ""}>Orden: más tiempo sin actividad</option>
              <option value="pendientes"${v.orden === "pendientes" ? " selected" : ""}>Orden: pendientes primero</option>
            </select>
          </div>
          <div class="resp-cm-checkcab">
            <span class="resp-cm-cuenta" data-zona="cm-cuenta"></span>
            <div class="resp-cm-botones">
              <button type="button" class="resp-btn" data-resp="cm-marcar-todos">Marcar todos</button>
              <button type="button" class="resp-btn" data-resp="cm-quitar-todos">Quitar todos</button>
            </div>
          </div>
          <ul class="resp-cm-checks" data-zona="cm-lista"></ul>
        </div>`
      : '<div class="resp-aviso">No hay colaboradores activos todavía.</div>';
    const dias = Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}"${i + 1 === estado.contacto.dia ? " selected" : ""}>${i + 1}</option>`).join("");
    const hist = estado.contacto.historial.slice(0, 6).map((h) => `<span class="resp-cm-chip" title="${esc(h.nota || "")}">${ICO.check}${esc(nombreMes(h.mes))} · ${esc(fechaCorta(h.fecha))}</span>`).join("");
    raiz.innerHTML = `
      <div class="resp-cm resp-cm-${tipo}">
        <div class="resp-cm-estado">
          <span class="resp-cm-ico">${ico}</span>
          <div class="resp-cm-txt"><b>${titulo}</b><small>${sub}</small>${barra}</div>
          ${accion}
        </div>
        ${nota}
        <div class="resp-cm-activos">
          <div class="resp-cm-cifra"><b>${activos.length}</b> colaborador${activos.length === 1 ? "" : "es"} activo${activos.length === 1 ? "" : "s"}
            <small>${nRed} redactor${nRed === 1 ? "" : "es"} · ${nFot} fotógrafo${nFot === 1 ? "" : "s"}${activos.length !== conCorreo ? ` · ${activos.length - conCorreo} sin correo` : ""}</small></div>
          <div class="resp-cm-botones">
            <button type="button" class="resp-btn" data-resp="cm-copiar-correos"${conCorreo ? "" : " disabled"}>${ICO.copiar} Copiar correos</button>
            <button type="button" class="resp-btn" data-resp="cm-copiar-mensaje">${ICO.mail} Copiar mensaje</button>
          </div>
        </div>
        ${lista}
        <div class="resp-cm-pie">
          <label>Avisarme a partir del día
            <select data-resp="cm-dia" aria-label="Día del mes desde el que se avisa">${dias}</select> del mes que toca (habitualmente cada dos meses)</label>
          <div class="resp-cm-hist">${hist || '<small>Aún no hay contactos registrados.</small>'}</div>
        </div>
      </div>`;
    if (activos.length) { pintarResumenColab(); pintarListaColab(); }
    actualizarAvisoMensual();
  }

  function marcarContactoMes(hecho) {
    const mes = claveMes(new Date());
    // Al deshacer se quita el contacto vigente (puede ser del mes pasado); al marcar, se registra el de este mes.
    const vigente = situacionContacto().hecho;
    const quitar = hecho ? mes : (vigente ? vigente.mes : mes);
    estado.contacto.historial = estado.contacto.historial.filter((h) => h.mes !== quitar);
    if (hecho) {
      estado.contacto.historial.unshift({ mes, fecha: fechaIso(new Date()), nota: (vista.contactoNota || "").trim().slice(0, 300) });
      estado.contacto.historial.sort((a, b) => (a.mes < b.mes ? 1 : -1));
      vista.contactoNota = "";
      toast("Contacto de " + nombreMes(mes) + " marcado como hecho.", "success", 2600);
    }
    montarContactoMensual();
    programarGuardado();
  }

  // Punto rojo en el menú (Funcionalidades, Responsabilidades y Recursos humanos)
  // mientras toque contactar (cada dos meses) y no esté hecho.
  function actualizarAvisoMensual() {
    const pendiente = estado.cargado && situacionContacto().debido;
    ["tabFuncionalidades", "subtabFuncResponsabilidades_btn"].forEach((id) => { const b = $(id); if (b) b.classList.toggle("resp-punto-aviso", pendiente); });
    const sub = document.querySelector('#subtabsResponsabilidades [data-subtab="respRrhh"]');
    if (sub) sub.classList.toggle("resp-punto-aviso", pendiente);
  }

  // Al abrir el panel un administrador: si toca contactar y no está hecho, punto
  // rojo y, una vez al día, un aviso con acceso directo. No toca nada si falla.
  async function recordatorioMensual() {
    let u = null;
    try { u = JSON.parse(localStorage.getItem("eof_user") || "null"); } catch { u = null; }
    if (!u || u.rol !== "admin" || typeof apiFetch !== "function") return;
    try {
      if (!estado.cargado) await cargar();
    } catch { return; }
    if (!estado.cargado) return;
    const { debido, mes } = situacionContacto();
    actualizarAvisoMensual();
    if (!debido) return;
    const hoy = fechaIso(new Date());
    let visto = "";
    try { visto = localStorage.getItem("eof_resp_cm_avisado") || ""; } catch { /* sin storage */ }
    if (visto === hoy) return;
    if (window.EOF && EOF.esperarRacha) await EOF.esperarRacha(); // tras la celebración de racha, si la hay
    try { localStorage.setItem("eof_resp_cm_avisado", hoy); } catch { /* sin storage */ }
    const ir = await confirmar(`Recordatorio: toca contactar con los colaboradores activos (${nombreMes(mes)}).`, {
      textoConfirmar: "Ir a Recursos humanos", textoCancelar: "Más tarde",
    });
    if (!ir) return;
    const clic = (sel) => { const el = typeof sel === "string" ? document.querySelector(sel) : sel; if (el) el.click(); };
    clic("#tabFuncionalidades");
    clic("#subtabFuncResponsabilidades_btn");
    clic('#subtabsResponsabilidades [data-subtab="respRrhh"]');
  }

  // ======================================================================
  //  CHECKLIST DE CLUBES
  // ======================================================================
  function montarChecklist(clave) {
    const cfg = LISTAS[clave], v = vista[clave], raiz = $(cfg.raiz);
    if (!raiz) return;
    if (!v.montada) {
      raiz.innerHTML = `
        <div class="resp-resumen" data-zona="resumen"></div>
        <div class="resp-barra">
          <label class="resp-busca">${ICO.lupa}<input type="search" data-resp="buscar" placeholder="Buscar club…" autocomplete="off" aria-label="Buscar club" value="${esc(v.busqueda)}"></label>
          <div class="resp-seg" role="group" aria-label="Filtrar clubes">
            <button type="button" class="resp-btn" data-resp="filtro" data-valor="todos">Todos</button>
            <button type="button" class="resp-btn" data-resp="filtro" data-valor="pendientes">Pendientes</button>
            <button type="button" class="resp-btn" data-resp="filtro" data-valor="hechos">${esc(cfg.etiquetaHecho)}</button>
          </div>
          <button type="button" class="resp-btn" data-resp="plegar-todo">Plegar todo</button>
          <button type="button" class="resp-btn" data-resp="desplegar-todo">Desplegar todo</button>
        </div>
        <div class="resp-grupos" data-zona="grupos"></div>`;
      v.montada = true;
    }
    pintarFiltros(clave);
    pintarResumen(clave);
    pintarGrupos(clave);
  }

  function raizDe(clave) { return $(LISTAS[clave].raiz); }

  function pintarFiltros(clave) {
    const raiz = raizDe(clave);
    raiz.querySelectorAll('[data-resp="filtro"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.valor === vista[clave].filtro)));
  }

  function contarPorComp(clave) {
    const marcados = marcadosEf(clave);
    const res = {};
    for (const c of COMPETICIONES) res[c.id] = { hechos: 0, total: 0 };
    for (const club of listaClubes()) {
      res[club.comp].total++;
      if (marcados.has(club.slug)) res[club.comp].hechos++;
    }
    return res;
  }

  function pintarResumen(clave) {
    const cfg = LISTAS[clave];
    const zona = raizDe(clave).querySelector('[data-zona="resumen"]');
    if (!zona) return;
    const por = contarPorComp(clave);
    let hechos = 0, total = 0;
    for (const id in por) { hechos += por[id].hechos; total += por[id].total; }
    const pct = total ? Math.round((hechos / total) * 100) : 0;
    const chips = COMPETICIONES.filter((c) => por[c.id].total > 0).map((c) => {
      const p = por[c.id];
      const w = p.total ? Math.round((p.hechos / p.total) * 100) : 0;
      return `<button type="button" class="resp-comp" data-resp="ir-comp" data-comp="${c.id}" style="--gc:${c.color}" title="Ir a ${esc(c.nombre)}">
        <span class="resp-comp-n"><b>${esc(c.nombre.replace("LaLiga ", ""))}</b><em>${p.hechos}/${p.total}</em></span>
        <span class="resp-mini"><i style="width:${w}%"></i></span></button>`;
    }).join("");
    zona.innerHTML = `
      <div class="resp-anillo" style="--p:${pct}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progreso total"><span>${pct}%</span></div>
      <div class="resp-resumen-txt">
        <strong>${hechos} de ${total} clubes</strong>
        <p>${esc(cfg.resumen)}</p>
        <div class="resp-comps">${chips}</div>
      </div>`;
  }

  function pintarGrupos(clave) {
    const v = vista[clave], marcados = marcadosEf(clave);
    const zona = raizDe(clave).querySelector('[data-zona="grupos"]');
    if (!zona) return;
    const q = sinTildes(v.busqueda).trim();
    const todos = listaClubes();
    const html = [];
    for (const comp of COMPETICIONES) {
      const deComp = todos.filter((c) => c.comp === comp.id);
      if (!deComp.length) continue;
      const hechos = deComp.filter((c) => marcados.has(c.slug)).length;
      const visibles = deComp.filter((c) => {
        if (q && !sinTildes(c.nombre).includes(q)) return false;
        const h = marcados.has(c.slug);
        return v.filtro === "todos" || (v.filtro === "hechos" ? h : !h);
      });
      if (!visibles.length && (q || v.filtro !== "todos")) continue;
      html.push(grupoHtml(clave, comp, deComp.length, hechos, visibles, marcados, !!q));
    }
    zona.innerHTML = html.join("") || '<p class="resp-vacio-busqueda">Ningún club coincide con lo que buscas.</p>';
  }

  function grupoHtml(clave, comp, total, hechos, visibles, marcados, buscando) {
    const v = vista[clave];
    const pct = total ? Math.round((hechos / total) * 100) : 0;
    const completo = total > 0 && hechos === total;
    const plegado = v.plegados.has(comp.id) && !buscando;
    // Subgrupos por «Grupo N» (Primera/Segunda Federación); sin grupos = lista única.
    const porGrupo = new Map();
    for (const c of visibles) {
      const g = c.grupo || "";
      if (!porGrupo.has(g)) porGrupo.set(g, []);
      porGrupo.get(g).push(c);
    }
    const hayGrupos = [...porGrupo.keys()].some((g) => g);
    const claves = [...porGrupo.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "es", { numeric: true })));
    const cuerpo = claves.map((g) => {
      const cab = hayGrupos ? `<h5 class="resp-subgrupo">${esc(g || "Sin grupo")}</h5>` : "";
      const tarjetas = porGrupo.get(g).map((c) => tarjetaClub(clave, c, marcados.has(c.slug), hayGrupos ? "" : c.grupo)).join("");
      return `${cab}<div class="resp-clubes">${tarjetas}</div>`;
    }).join("");
    return `<section class="resp-grupo${completo ? " completo" : ""}${plegado ? " plegado" : ""}" data-comp="${comp.id}" style="--gc:${comp.color}">
      <header class="resp-grupo-cab">
        <button type="button" class="resp-grupo-toggle" data-resp="plegar" aria-expanded="${!plegado}">
          ${ICO.chev}<span class="resp-grupo-nombre">${esc(comp.nombre)}</span><span class="resp-grupo-n" data-zona="n">${hechos}/${total}</span>
        </button>
        <div class="resp-grupo-barra" aria-hidden="true"><i style="width:${pct}%"></i></div>
        <div class="resp-grupo-acc">
          <button type="button" class="resp-btn" data-resp="marcar-grupo" title="Marcar los clubes que se ven en este grupo">Marcar todos</button>
          <button type="button" class="resp-btn" data-resp="quitar-grupo" title="Quitar la marca a los clubes que se ven en este grupo">Quitar todos</button>
        </div>
      </header>
      <div class="resp-grupo-cuerpo">${cuerpo || '<p class="resp-vacio-busqueda">Ningún club en esta vista.</p>'}</div>
    </section>`;
  }

  function tarjetaClub(clave, c, hecho, grupoTxt) {
    const auto = autoDe(clave, c.slug);
    const titulo = auto ? ` title="${esc("Asignado automáticamente a: " + auto.join(", "))}"` : "";
    const sub = auto
      ? `<small class="resp-club-auto">${esc(auto.length > 2 ? auto.slice(0, 2).join(", ") + " +" + (auto.length - 2) : auto.join(", "))}</small>`
      : (grupoTxt ? `<small class="resp-club-grupo">${esc(grupoTxt)}</small>` : "");
    return `<label class="resp-club${hecho ? " hecho" : ""}${auto ? " auto" : ""}" data-slug="${esc(c.slug)}"${titulo}>
      <input type="checkbox" class="resp-check" data-resp="club" data-slug="${esc(c.slug)}"${hecho ? " checked" : ""}${auto ? " disabled" : ""}>
      <span class="resp-marca">${ICO.check}</span>
      ${escudoHtml(c.nombre)}
      <span class="resp-club-txt"><span class="resp-club-nombre">${esc(c.nombre)}</span>${sub}</span>
      ${auto ? '<span class="resp-auto-tag">Auto</span>' : ""}
    </label>`;
  }

  // Actualiza contadores y barras sin repintar las tarjetas (no se pierde el foco).
  function actualizarContadores(clave) {
    pintarResumen(clave);
    if (clave.startsWith("rrhh")) pintarRolRrhh();
    const marcados = marcadosEf(clave);
    const todos = listaClubes();
    raizDe(clave).querySelectorAll(".resp-grupo").forEach((sec) => {
      const delGrupo = todos.filter((c) => c.comp === sec.dataset.comp);
      const hechos = delGrupo.filter((c) => marcados.has(c.slug)).length;
      const total = delGrupo.length;
      const n = sec.querySelector('[data-zona="n"]'); if (n) n.textContent = `${hechos}/${total}`;
      const barra = sec.querySelector(".resp-grupo-barra i"); if (barra) barra.style.width = (total ? Math.round((hechos / total) * 100) : 0) + "%";
      sec.classList.toggle("completo", total > 0 && hechos === total);
    });
  }

  function marcarClub(clave, slug, valor) {
    if (valor) estado.clubes[clave].add(slug); else estado.clubes[clave].delete(slug);
    const card = raizDe(clave).querySelector(`.resp-club[data-slug="${CSS.escape(slug)}"]`);
    if (card) {
      card.classList.toggle("hecho", valor);
      const cb = card.querySelector(".resp-check"); if (cb) cb.checked = valor;
    }
  }

  function accionGrupo(clave, sec, valor) {
    const slugs = [...sec.querySelectorAll(".resp-check:not(:disabled)")].map((cb) => cb.dataset.slug);
    if (!slugs.length) return;
    slugs.forEach((s) => marcarClub(clave, s, valor));
    actualizarContadores(clave);
    programarGuardado();
  }

  // ======================================================================
  //  PERSONAS A FICHAR
  // ======================================================================
  function nuevoId() { return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function montarFichajes() {
    const raiz = $("respRrhhFichajes");
    if (!raiz) return;
    const v = vista.fichajes;
    if (!v.montada) {
      const opcionesPuesto = Object.entries(PUESTOS).map(([k, p]) => `<option value="${k}">${esc(p.nombre)}</option>`).join("");
      const opcionesEstado = Object.entries(ESTADOS).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("");
      const datalist = listaClubes().map((c) => `<option value="${esc(c.nombre)}"></option>`).join("");
      raiz.innerHTML = `
        <div class="resp-fich-top">
          <label class="resp-busca">${ICO.lupa}<input type="search" data-resp="fich-buscar" placeholder="Buscar persona, contacto, club…" autocomplete="off" aria-label="Buscar persona" value="${esc(v.busqueda)}"></label>
          <button type="button" class="resp-btn resp-btn-pri" data-resp="fich-nueva">+ Añadir persona</button>
        </div>
        <div class="resp-chips" data-zona="chips" role="group" aria-label="Filtrar por estado"></div>
        <form class="resp-form" data-zona="form" hidden novalidate>
          <h5 data-zona="form-titulo">Nueva persona</h5>
          <div class="resp-form-grid">
            <label>Nombre *<input type="text" name="nombre" maxlength="80" autocomplete="off" required></label>
            <label>Puesto que cubriría<select name="puesto">${opcionesPuesto}</select></label>
            <label>Contacto (Instagram, correo, teléfono…)<input type="text" name="contacto" maxlength="120" autocomplete="off"></label>
            <label>Club o zona (opcional)<input type="text" name="club" maxlength="80" list="respDatalistClubes" autocomplete="off"></label>
            <label>Prioridad
              <span class="resp-prio" role="group" aria-label="Prioridad">
                <button type="button" data-resp="prio" data-prio="alta" aria-pressed="false">Alta</button>
                <button type="button" data-resp="prio" data-prio="media" aria-pressed="true">Media</button>
                <button type="button" data-resp="prio" data-prio="baja" aria-pressed="false">Baja</button>
              </span>
            </label>
            <label>Estado<select name="estado">${opcionesEstado}</select></label>
            <label class="ancho">Notas<textarea name="notas" maxlength="600" placeholder="Por qué te interesa, qué aporta, cómo contactar, qué os une…"></textarea></label>
          </div>
          <datalist id="respDatalistClubes">${datalist}</datalist>
          <p class="resp-form-err" data-zona="form-err" role="alert"></p>
          <div class="resp-form-acc">
            <button type="button" class="resp-btn" data-resp="fich-cancelar">Cancelar</button>
            <button type="submit" class="resp-btn resp-btn-pri">Guardar</button>
          </div>
        </form>
        <div data-zona="lista"></div>`;
      v.montada = true;
    }
    pintarChips();
    pintarListaFichajes();
    pintarFormFichaje();
  }

  function coincideFichaje(f, q) {
    if (!q) return true;
    return [f.nombre, f.contacto, f.club, f.notas, (PUESTOS[f.puesto] || {}).nombre].some((t) => sinTildes(t).includes(q));
  }

  function pintarChips() {
    const zona = $("respRrhhFichajes").querySelector('[data-zona="chips"]');
    if (!zona) return;
    const cuenta = { todos: estado.fichajes.length };
    for (const k in ESTADOS) cuenta[k] = estado.fichajes.filter((f) => f.estado === k).length;
    const mk = (k, n) => `<button type="button" class="resp-chip" data-resp="fich-estado" data-valor="${k}" aria-pressed="${vista.fichajes.estado === k}">${esc(n)} <b>${cuenta[k]}</b></button>`;
    zona.innerHTML = mk("todos", "Todos") + Object.entries(ESTADOS).map(([k, n]) => mk(k, n)).join("");
  }

  function contactoHtml(t) {
    const txt = String(t || "").trim();
    if (!txt) return "";
    let cuerpo, ico = ICO.chat;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt)) { cuerpo = `<a href="mailto:${esc(txt)}">${esc(txt)}</a>`; ico = ICO.mail; }
    else if (/^https?:\/\//i.test(txt)) cuerpo = `<a href="${esc(txt)}" target="_blank" rel="noopener noreferrer">${esc(txt)}</a>`;
    else cuerpo = `<span>${esc(txt)}</span>`;
    return `<div>${ico}${cuerpo}</div>`;
  }

  function tarjetaPersona(f) {
    const p = PUESTOS[f.puesto] || PUESTOS.otro;
    const cerrada = f.estado === "fichado" || f.estado === "descartado";
    const opciones = Object.entries(ESTADOS).map(([k, n]) => `<option value="${k}"${k === f.estado ? " selected" : ""}>${esc(n)}</option>`).join("");
    const club = f.club ? `<div>${escudoHtml(f.club)}<span>${esc(f.club)}</span></div>` : "";
    return `<article class="resp-persona estado-${esc(f.estado)}${f.estado === "descartado" ? " cerrada" : ""}" data-id="${esc(f.id)}" style="--pc:${p.color}">
      <div class="resp-persona-cab">
        <span class="resp-avatar" aria-hidden="true">${esc(String(f.nombre).trim().charAt(0).toUpperCase() || "?")}</span>
        <div class="resp-persona-id"><h5 class="resp-persona-nombre" title="${esc(f.nombre)}">${esc(f.nombre)}</h5><p class="resp-persona-puesto">${esc(p.nombre)}</p></div>
        <span class="resp-prio-punto ${esc(f.prioridad)}" title="Prioridad ${esc(PRIORIDADES[f.prioridad] || "")}">${esc(PRIORIDADES[f.prioridad] || "")}</span>
      </div>
      ${(f.contacto || f.club) ? `<div class="resp-persona-datos">${contactoHtml(f.contacto)}${club}</div>` : ""}
      ${f.notas ? `<p class="resp-persona-notas">${esc(f.notas)}</p>` : ""}
      <div class="resp-persona-pie">
        <select data-resp="fich-cambiar-estado" aria-label="Estado de ${esc(f.nombre)}">${opciones}</select>
        <button type="button" class="resp-icono" data-resp="fich-editar" title="Editar" aria-label="Editar ${esc(f.nombre)}">${ICO.lapiz}</button>
        <button type="button" class="resp-icono peligro" data-resp="fich-borrar" title="Quitar de la lista" aria-label="Quitar a ${esc(f.nombre)}">${ICO.papelera}</button>
      </div>
    </article>`;
  }

  function pintarListaFichajes() {
    const zona = $("respRrhhFichajes").querySelector('[data-zona="lista"]');
    if (!zona) return;
    const v = vista.fichajes;
    const q = sinTildes(v.busqueda).trim();
    const orden = { alta: 0, media: 1, baja: 2 };
    const lista = estado.fichajes
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => (v.estado === "todos" || f.estado === v.estado) && coincideFichaje(f, q))
      .sort((a, b) => {
        const ca = (a.f.estado === "fichado" || a.f.estado === "descartado") ? 1 : 0;
        const cb = (b.f.estado === "fichado" || b.f.estado === "descartado") ? 1 : 0;
        return ca - cb || (orden[a.f.prioridad] ?? 1) - (orden[b.f.prioridad] ?? 1) || a.i - b.i;
      })
      .map(({ f }) => f);
    if (!lista.length) {
      zona.innerHTML = estado.fichajes.length
        ? '<p class="resp-vacio-busqueda">Nadie coincide con ese filtro.</p>'
        : `<div class="resp-fich-vacio">${ICO.gente}<strong>Todavía no hay nadie en tu lista</strong><p>Apunta aquí a la gente que te gustaría fichar para el medio: su puesto, cómo contactarla y en qué punto está la conversación.</p><button type="button" class="resp-btn resp-btn-pri" data-resp="fich-nueva">+ Añadir la primera persona</button></div>`;
      return;
    }
    zona.innerHTML = `<div class="resp-personas">${lista.map(tarjetaPersona).join("")}</div>`;
  }

  function formFichaje() { return $("respRrhhFichajes") && $("respRrhhFichajes").querySelector('[data-zona="form"]'); }

  function fijarPrioridad(form, prio) {
    form.querySelectorAll('[data-resp="prio"]').forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.prio === prio)));
  }
  function prioridadForm(form) {
    const b = form.querySelector('[data-resp="prio"][aria-pressed="true"]');
    return b ? b.dataset.prio : "media";
  }

  function pintarFormFichaje() {
    const form = formFichaje();
    if (!form) return;
    const ed = vista.fichajes.editando;
    if (ed === undefined) { form.hidden = true; return; }
    const f = ed ? estado.fichajes.find((x) => x.id === ed) : null;
    form.hidden = false;
    form.querySelector('[data-zona="form-titulo"]').textContent = f ? "Editar persona" : "Nueva persona";
    form.elements.nombre.value = f ? f.nombre : "";
    form.elements.puesto.value = f ? f.puesto : "redactor";
    form.elements.contacto.value = f ? f.contacto : "";
    form.elements.club.value = f ? f.club : "";
    form.elements.estado.value = f ? f.estado : "pendiente";
    form.elements.notas.value = f ? f.notas : "";
    fijarPrioridad(form, f ? f.prioridad : "media");
    form.querySelector('[data-zona="form-err"]').textContent = "";
  }

  function abrirForm(id) {
    vista.fichajes.editando = id === undefined ? null : id;
    pintarFormFichaje();
    const form = formFichaje();
    if (form) { form.scrollIntoView({ behavior: "smooth", block: "nearest" }); setTimeout(() => form.elements.nombre.focus(), 60); }
  }
  function cerrarForm() { vista.fichajes.editando = undefined; pintarFormFichaje(); }

  function enviarForm(form) {
    const nombre = form.elements.nombre.value.trim();
    const err = form.querySelector('[data-zona="form-err"]');
    if (!nombre) { err.textContent = "Escribe al menos el nombre de la persona."; form.elements.nombre.focus(); return; }
    const datos = {
      nombre: nombre.slice(0, 80),
      puesto: form.elements.puesto.value,
      contacto: form.elements.contacto.value.trim().slice(0, 120),
      club: form.elements.club.value.trim().slice(0, 80),
      prioridad: prioridadForm(form),
      estado: form.elements.estado.value,
      notas: form.elements.notas.value.trim().slice(0, 600),
    };
    const ed = vista.fichajes.editando;
    if (ed) {
      const i = estado.fichajes.findIndex((x) => x.id === ed);
      if (i >= 0) estado.fichajes[i] = { ...estado.fichajes[i], ...datos };
    } else {
      if (estado.fichajes.length >= 500) { err.textContent = "La lista admite como máximo 500 personas."; return; }
      estado.fichajes.unshift({ id: nuevoId(), ...datos });
    }
    vista.fichajes.editando = undefined;
    pintarChips(); pintarListaFichajes(); pintarFormFichaje();
    programarGuardado();
    toast(ed ? "Persona actualizada." : "Persona añadida a la lista.", "success", 2200);
  }

  async function borrarFichaje(id) {
    const f = estado.fichajes.find((x) => x.id === id);
    if (!f) return;
    if (!(await confirmar(`¿Quitar a «${f.nombre}» de la lista?`, { textoConfirmar: "Quitar", peligroso: true }))) return;
    estado.fichajes = estado.fichajes.filter((x) => x.id !== id);
    if (vista.fichajes.editando === id) vista.fichajes.editando = undefined;
    pintarChips(); pintarListaFichajes(); pintarFormFichaje();
    programarGuardado();
  }

  // ======================================================================
  //  BASE DE DATOS DE CONTACTOS (clubes, federaciones, prensa y comunicación)
  // ======================================================================
  const raizContactos = () => $("respRelContactos");
  const formContacto = () => { const r = raizContactos(); return r && r.querySelector('[data-zona="cont-form"]'); };
  const zonaContactos = (z) => { const r = raizContactos(); return r && r.querySelector(`[data-zona="${z}"]`); };
  const nuevoIdContacto = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function montarContactos() {
    const raiz = raizContactos();
    if (!raiz) return;
    const v = vista.contactos;
    if (!v.montada) {
      const opTipo = Object.entries(TIPOS_CONTACTO).map(([k, t]) => `<option value="${k}">${esc(t.nombre)}</option>`).join("");
      const opArea = Object.entries(AREAS_CONTACTO).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("");
      const sugerencias = listaClubes().map((c) => c.nombre).concat(SUGERENCIAS_ENTIDAD)
        .map((n) => `<option value="${esc(n)}"></option>`).join("");
      raiz.innerHTML = `
        <div class="resp-fich-top">
          <label class="resp-busca">${ICO.lupa}<input type="search" data-resp="cont-buscar" placeholder="Buscar entidad, persona, correo…" autocomplete="off" aria-label="Buscar contacto" value="${esc(v.busqueda)}"></label>
          <button type="button" class="resp-btn" data-resp="cont-copiar" title="Copia los correos de los contactos que se ven ahora, separados por «;»">Copiar correos</button>
          <button type="button" class="resp-btn" data-resp="cont-exportar" title="Descarga todos los contactos en un CSV para Excel">Exportar CSV</button>
          <button type="button" class="resp-btn" data-resp="cont-plantilla" title="Descarga un CSV con los clubes que aún no tienen correo, listo para rellenar en Excel">Plantilla CSV</button>
          <button type="button" class="resp-btn" data-resp="cont-importar" title="Sube un CSV (Excel, separado por «;» o «,») para añadir o completar contactos">Importar CSV</button>
          <input type="file" data-resp="cont-archivo" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden aria-label="Archivo CSV con contactos">
          <button type="button" class="resp-btn resp-btn-pri" data-resp="cont-nueva">+ Añadir contacto</button>
        </div>
        <div class="resp-chips resp-cont-chips" data-zona="cont-chips-tipo" role="group" aria-label="Filtrar por tipo de entidad"></div>
        <div class="resp-chips" data-zona="cont-chips-area" role="group" aria-label="Filtrar por departamento"></div>
        <div class="resp-form resp-import" data-zona="cont-import" hidden role="region" aria-label="Importar contactos desde CSV"></div>
        <form class="resp-form" data-zona="cont-form" hidden novalidate>
          <h5 data-zona="cont-form-titulo">Nuevo contacto</h5>
          <div class="resp-form-grid">
            <label>Tipo de entidad<select name="tipo">${opTipo}</select></label>
            <label>Departamento / función<select name="area">${opArea}</select></label>
            <label class="ancho">Entidad (club, federación u organismo) *<input type="text" name="entidad" maxlength="100" list="respDatalistEntidades" autocomplete="off" required></label>
            <label>Persona de contacto<input type="text" name="nombre" maxlength="80" autocomplete="off"></label>
            <label>Cargo<input type="text" name="cargo" maxlength="80" autocomplete="off" placeholder="Jefe de prensa, community manager…"></label>
            <label>Correo electrónico<input type="text" name="email" maxlength="120" inputmode="email" autocomplete="off"></label>
            <label>Teléfono<input type="text" name="telefono" maxlength="40" inputmode="tel" autocomplete="off"></label>
            <label class="ancho">Web o redes sociales<input type="text" name="web" maxlength="200" autocomplete="off" placeholder="https://…"></label>
            <label class="ancho">Notas<textarea name="notas" maxlength="600" placeholder="Idioma preferido, horarios, con quién se habló, qué se acordó…"></textarea></label>
          </div>
          <datalist id="respDatalistEntidades">${sugerencias}</datalist>
          <p class="resp-form-err" data-zona="cont-form-err" role="alert"></p>
          <div class="resp-form-acc">
            <button type="button" class="resp-btn" data-resp="cont-cancelar">Cancelar</button>
            <button type="submit" class="resp-btn resp-btn-pri">Guardar</button>
          </div>
        </form>
        <div data-zona="cont-lista"></div>`;
      v.montada = true;
    }
    pintarChipsContactos();
    pintarListaContactos();
    pintarFormContacto();
    if (v.imp) recalcularImportacion(); // la vista previa de una importación en curso sobrevive a un repintado
    pintarImportacion();
  }

  function coincideContacto(c, q) {
    if (!q) return true;
    return [c.entidad, c.nombre, c.cargo, c.email, c.telefono, c.web, c.notas, AREAS_CONTACTO[c.area], (TIPOS_CONTACTO[c.tipo] || {}).nombre]
      .some((t) => sinTildes(t).includes(q));
  }

  function contactosFiltrados() {
    const v = vista.contactos;
    const q = sinTildes(v.busqueda).trim();
    const ordenArea = Object.keys(AREAS_CONTACTO);
    return estado.contactos
      .filter((c) => (v.tipo === "todos" || c.tipo === v.tipo) && (v.area === "todas" || c.area === v.area) && coincideContacto(c, q))
      .sort((a, b) => sinTildes(a.entidad).localeCompare(sinTildes(b.entidad), "es")
        || ordenArea.indexOf(a.area) - ordenArea.indexOf(b.area)
        || sinTildes(a.nombre).localeCompare(sinTildes(b.nombre), "es"));
  }

  function pintarChipsContactos() {
    const zt = zonaContactos("cont-chips-tipo"), za = zonaContactos("cont-chips-area");
    if (!zt || !za) return;
    const v = vista.contactos;
    const cuentaT = { todos: estado.contactos.length };
    for (const k in TIPOS_CONTACTO) cuentaT[k] = estado.contactos.filter((c) => c.tipo === k).length;
    const mkT = (k, n) => `<button type="button" class="resp-chip" data-resp="cont-tipo" data-valor="${k}" aria-pressed="${v.tipo === k}">${esc(n)} <b>${cuentaT[k]}</b></button>`;
    zt.innerHTML = mkT("todos", "Todos") + Object.entries(TIPOS_CONTACTO).map(([k, t]) => mkT(k, t.nombre)).join("");
    const cuentaA = { todas: estado.contactos.length };
    for (const k in AREAS_CONTACTO) cuentaA[k] = estado.contactos.filter((c) => c.area === k).length;
    const mkA = (k, n) => `<button type="button" class="resp-chip" data-resp="cont-area" data-valor="${k}" aria-pressed="${v.area === k}">${esc(n)} <b>${cuentaA[k]}</b></button>`;
    za.innerHTML = mkA("todas", "Cualquier departamento") + Object.entries(AREAS_CONTACTO).map(([k, n]) => mkA(k, n)).join("");
  }

  // Solo se enlazan direcciones web completas; el resto se muestra como texto.
  function webHtml(t) {
    const txt = String(t || "").trim();
    if (!txt) return "";
    const cuerpo = /^https?:\/\//i.test(txt)
      ? `<a href="${esc(txt)}" target="_blank" rel="noopener noreferrer">${esc(txt.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, ""))}</a>`
      : `<span>${esc(txt)}</span>`;
    return `<div>${ICO.web}${cuerpo}</div>`;
  }

  function tarjetaContacto(c) {
    const tipo = TIPOS_CONTACTO[c.tipo] || TIPOS_CONTACTO.otro;
    const persona = [c.nombre, c.cargo].filter(Boolean).join(" · ");
    const tel = String(c.telefono || "").trim();
    const telLink = tel.replace(/[^\d+]/g, "");
    const lineas = [
      persona ? `<div>${ICO.persona}<span>${esc(persona)}</span></div>` : "",
      c.email ? `<div>${ICO.mail}<a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : "",
      tel ? `<div>${ICO.tel}${telLink.length >= 6 ? `<a href="tel:${esc(telLink)}">${esc(tel)}</a>` : `<span>${esc(tel)}</span>`}</div>` : "",
      webHtml(c.web),
    ].join("");
    const escudo = c.tipo === "club" ? escudoHtml(c.entidad) : "";
    return `<article class="resp-persona resp-contacto" data-id="${esc(c.id)}" style="--pc:${tipo.color}">
      <div class="resp-persona-cab">
        <span class="resp-avatar" aria-hidden="true">${esc(String(c.entidad).trim().charAt(0).toUpperCase() || "?")}</span>
        <div class="resp-persona-id"><h5 class="resp-persona-nombre" title="${esc(c.entidad)}">${esc(c.entidad)}</h5><p class="resp-persona-puesto">${esc(AREAS_CONTACTO[c.area] || AREAS_CONTACTO.general)}</p></div>
        <span class="resp-cont-tipo">${esc(tipo.nombre)}</span>
      </div>
      ${lineas ? `<div class="resp-persona-datos">${lineas}</div>` : ""}
      ${c.notas ? `<p class="resp-persona-notas">${esc(c.notas)}</p>` : ""}
      <div class="resp-persona-pie">
        ${escudo ? `<span class="resp-cont-escudo">${escudo}</span>` : ""}
        ${c.email ? `<button type="button" class="resp-icono" data-resp="cont-copiar-uno" title="Copiar correo" aria-label="Copiar el correo de ${esc(c.entidad)}">${ICO.copiar}</button>` : ""}
        <button type="button" class="resp-icono" data-resp="cont-editar" title="Editar" aria-label="Editar el contacto de ${esc(c.entidad)}">${ICO.lapiz}</button>
        <button type="button" class="resp-icono peligro" data-resp="cont-borrar" title="Quitar de la base de datos" aria-label="Quitar el contacto de ${esc(c.entidad)}">${ICO.papelera}</button>
      </div>
    </article>`;
  }

  function pintarListaContactos() {
    const zona = zonaContactos("cont-lista");
    if (!zona) return;
    const lista = contactosFiltrados();
    const btnCopiar = raizContactos().querySelector('[data-resp="cont-copiar"]');
    if (btnCopiar) btnCopiar.disabled = !lista.some((c) => c.email);
    if (!lista.length) {
      zona.innerHTML = estado.contactos.length
        ? '<p class="resp-vacio-busqueda">Ningún contacto coincide con ese filtro.</p>'
        : `<div class="resp-fich-vacio">${ICO.mail}<strong>La base de datos está vacía</strong><p>Añade aquí los clubes, federaciones, departamentos de prensa y responsables de comunicación con los que trabajas: correo, teléfono, redes y notas de cada uno.</p><button type="button" class="resp-btn resp-btn-pri" data-resp="cont-nueva">+ Añadir el primer contacto</button></div>`;
      return;
    }
    zona.innerHTML = `<p class="resp-cont-total">${lista.length === estado.contactos.length ? `${lista.length} contacto${lista.length === 1 ? "" : "s"}` : `${lista.length} de ${estado.contactos.length} contactos`}</p><div class="resp-personas">${lista.map(tarjetaContacto).join("")}</div>`;
  }

  function pintarFormContacto() {
    const form = formContacto();
    if (!form) return;
    const ed = vista.contactos.editando;
    if (ed === undefined) { form.hidden = true; return; }
    const c = ed ? estado.contactos.find((x) => x.id === ed) : null;
    form.hidden = false;
    form.querySelector('[data-zona="cont-form-titulo"]').textContent = c ? "Editar contacto" : "Nuevo contacto";
    // Al crear, el filtro activo de tipo/departamento sirve de valor inicial.
    const v = vista.contactos;
    form.elements.tipo.value = c ? c.tipo : (v.tipo !== "todos" ? v.tipo : "club");
    form.elements.area.value = c ? c.area : (v.area !== "todas" ? v.area : "prensa");
    form.elements.entidad.value = c ? c.entidad : "";
    form.elements.nombre.value = c ? c.nombre : "";
    form.elements.cargo.value = c ? c.cargo : "";
    form.elements.email.value = c ? c.email : "";
    form.elements.telefono.value = c ? c.telefono : "";
    form.elements.web.value = c ? c.web : "";
    form.elements.notas.value = c ? c.notas : "";
    form.querySelector('[data-zona="cont-form-err"]').textContent = "";
  }

  function abrirFormContacto(id) {
    vista.contactos.editando = id === undefined ? null : id;
    pintarFormContacto();
    const form = formContacto();
    if (form) { form.scrollIntoView({ behavior: "smooth", block: "nearest" }); setTimeout(() => form.elements.entidad.focus(), 60); }
  }
  function cerrarFormContacto() { vista.contactos.editando = undefined; pintarFormContacto(); }

  // «www.club.es» / «club.es/prensa» -> «https://…»; lo demás (usuarios de redes, etc.) se deja como está.
  function normalizarWeb(t) {
    const x = String(t || "").trim();
    return /^(www\.|[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,})(\/\S*)?$/i.test(x) ? "https://" + x : x;
  }

  function enviarFormContacto(form) {
    const err = form.querySelector('[data-zona="cont-form-err"]');
    const entidad = form.elements.entidad.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    if (!entidad) { err.textContent = "Escribe el nombre del club, la federación o el organismo."; form.elements.entidad.focus(); return; }
    if (email && !RE_EMAIL.test(email)) { err.textContent = "El correo no parece válido (ejemplo: prensa@club.es)."; form.elements.email.focus(); return; }
    const datos = {
      tipo: form.elements.tipo.value,
      area: form.elements.area.value,
      entidad: entidad.slice(0, 100),
      nombre: form.elements.nombre.value.trim().slice(0, 80),
      cargo: form.elements.cargo.value.trim().slice(0, 80),
      email: email.slice(0, 120),
      telefono: form.elements.telefono.value.trim().slice(0, 40),
      web: normalizarWeb(form.elements.web.value).slice(0, 200),
      notas: form.elements.notas.value.trim().slice(0, 600),
    };
    const ed = vista.contactos.editando;
    if (ed) {
      const i = estado.contactos.findIndex((x) => x.id === ed);
      if (i >= 0) estado.contactos[i] = { ...estado.contactos[i], ...datos };
    } else {
      if (estado.contactos.length >= MAX_CONTACTOS) { err.textContent = `La base de datos admite como máximo ${MAX_CONTACTOS} contactos.`; return; }
      estado.contactos.unshift({ id: nuevoIdContacto(), ...datos });
    }
    vista.contactos.editando = undefined;
    pintarChipsContactos(); pintarListaContactos(); pintarFormContacto();
    programarGuardado();
    toast(ed ? "Contacto actualizado." : "Contacto añadido.", "success", 2200);
  }

  async function borrarContacto(id) {
    const c = estado.contactos.find((x) => x.id === id);
    if (!c) return;
    const quien = [c.entidad, AREAS_CONTACTO[c.area]].filter(Boolean).join(" · ");
    if (!(await confirmar(`¿Quitar el contacto «${quien}» de la base de datos?`, { textoConfirmar: "Quitar", peligroso: true }))) return;
    estado.contactos = estado.contactos.filter((x) => x.id !== id);
    if (vista.contactos.editando === id) vista.contactos.editando = undefined;
    pintarChipsContactos(); pintarListaContactos(); pintarFormContacto();
    programarGuardado();
  }

  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = texto; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0;";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  async function copiarCorreos(lista) {
    const correos = [...new Set(lista.map((c) => c.email).filter(Boolean))];
    if (!correos.length) { toast("No hay correos en esta lista.", "info", 2500); return; }
    const ok = await copiarTexto(correos.join("; "));
    toast(ok ? `${correos.length} correo${correos.length === 1 ? "" : "s"} copiado${correos.length === 1 ? "" : "s"}.` : "No se ha podido copiar al portapapeles.", ok ? "success" : "error", 2600);
  }

  // CSV para Excel en español (separador «;» y BOM), igual que el resto de exportaciones del panel.
  function celdaCsv(v) {
    let s = String(v == null ? "" : v).replace(/\r?\n/g, " ");
    if (/^[=@\t]/.test(s) || /^[+\-][^\d\s(]/.test(s)) s = "'" + s; // evita que Excel lo interprete como fórmula
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportarContactosCsv() {
    if (!estado.contactos.length) { toast("Todavía no hay contactos que exportar.", "info", 2500); return; }
    const cab = ["Tipo", "Entidad", "Departamento", "Persona", "Cargo", "Correo", "Teléfono", "Web / redes", "Notas"];
    const filas = [...estado.contactos]
      .sort((a, b) => sinTildes(a.entidad).localeCompare(sinTildes(b.entidad), "es"))
      .map((c) => [(TIPOS_CONTACTO[c.tipo] || {}).nombre || "", c.entidad, AREAS_CONTACTO[c.area] || "", c.nombre, c.cargo, c.email, c.telefono, c.web, c.notas]);
    const csv = "\uFEFF" + [cab, ...filas].map((f) => f.map(celdaCsv).join(";")).join("\r\n");
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    enlace.download = `contactos-institucionales-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    setTimeout(() => { URL.revokeObjectURL(enlace.href); enlace.remove(); }, 1000);
  }

  // ======================================================================
  //  IMPORTAR / PLANTILLA CSV
  //  Acepta el mismo CSV que genera «Exportar CSV» (separador «;» o «,» o tabulador, con o sin
  //  BOM, UTF-8 o Windows-1252 de Excel). Casa cada fila con un contacto existente por entidad
  //  (+ departamento si viene) y, si no existe, lo crea. Antes de tocar nada se enseña una vista
  //  previa; por defecto solo se rellenan los campos vacíos y nunca se borra un dato por venir
  //  vacío en el CSV.
  // ======================================================================
  const IMP_MAX_BYTES = 2 * 1024 * 1024;
  const IMP_MAX_FILAS = 3000;
  const LIM = { entidad: 100, nombre: 80, cargo: 80, email: 120, telefono: 40, web: 200, notas: 600 };
  const ALIAS_COL = {
    tipo: ["tipo", "tipo de entidad"],
    entidad: ["entidad", "club", "equipo", "organismo", "entidad (club, federacion u organismo)"],
    area: ["departamento", "area", "departamento / funcion", "funcion"],
    nombre: ["persona", "persona de contacto", "nombre", "contacto"],
    cargo: ["cargo", "puesto"],
    email: ["correo", "email", "e-mail", "mail", "correo electronico"],
    telefono: ["telefono", "tel", "tlf", "movil"],
    web: ["web", "web / redes", "web o redes sociales", "redes", "url", "pagina web"],
    notas: ["notas", "observaciones", "comentarios"],
  };
  const claveEntidad = (t) => sinTildes(t).replace(/[^a-z0-9]+/g, " ").trim();

  async function leerArchivoTexto(archivo) {
    const buf = await archivo.arrayBuffer();
    let t = new TextDecoder("utf-8").decode(buf);
    if (t.includes("\uFFFD")) t = new TextDecoder("windows-1252").decode(buf); // CSV guardado por Excel sin UTF-8
    return t.replace(/^\uFEFF/, "");
  }

  // Devuelve [{ n: nº de fila en el archivo, celdas: [...] }], ignorando las filas totalmente vacías.
  function parsearCsv(texto) {
    const primera = texto.split(/\r?\n/, 1)[0] || "";
    const cuenta = (ch) => primera.split(ch).length - 1;
    let sep = ";", mejor = cuenta(";");
    for (const ch of [",", "\t"]) { const n = cuenta(ch); if (n > mejor) { sep = ch; mejor = n; } }
    const filas = [];
    let fila = [], cel = "", dentro = false, n = 1;
    const cerrarFila = () => { fila.push(cel); cel = ""; if (fila.some((c) => c.trim() !== "")) filas.push({ n, celdas: fila }); fila = []; n++; };
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (dentro) {
        if (ch === '"') { if (texto[i + 1] === '"') { cel += '"'; i++; } else dentro = false; }
        else cel += ch;
      } else if (ch === '"' && cel === "") dentro = true;
      else if (ch === sep) { fila.push(cel); cel = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && texto[i + 1] === "\n") i++; cerrarFila(); }
      else cel += ch;
    }
    if (cel !== "" || fila.length) cerrarFila();
    return filas;
  }

  function tipoDeTexto(t) {
    const x = sinTildes(t);
    if (!x) return "";
    if (x.includes("feder")) return "federacion";
    if (x.includes("club")) return "club";
    if (x.includes("otro")) return "otro";
    return "";
  }
  function areaDeTexto(t) {
    const x = sinTildes(t);
    if (!x) return "";
    if (x.includes("prensa")) return "prensa";
    if (x.includes("comunic")) return "comunicacion";
    if (x.includes("general")) return "general";
    if (x.includes("otro")) return "otro";
    return "";
  }

  // Convierte las filas del CSV en contactos "limpios" + avisos. { filas, avisos } o { error }.
  function leerFilasContactos(crudas) {
    if (!crudas.length) return { error: "El archivo está vacío." };
    const cab = crudas[0].celdas.map((c) => sinTildes(c).replace(/\*/g, "").replace(/\s+/g, " ").trim());
    const col = {};
    for (const [campo, alias] of Object.entries(ALIAS_COL)) {
      const i = cab.findIndex((h) => alias.includes(h));
      if (i >= 0) col[campo] = i;
    }
    if (col.entidad === undefined) return { error: "No encuentro la columna «Entidad» (o «Club») en la primera fila. Usa «Plantilla CSV» para ver el formato." };
    if (crudas.length - 1 > IMP_MAX_FILAS) return { error: `El archivo tiene demasiadas filas (máximo ${IMP_MAX_FILAS}).` };
    const celda = (f, campo) => {
      if (col[campo] === undefined) return "";
      let v = String(f.celdas[col[campo]] == null ? "" : f.celdas[col[campo]]).trim();
      if (/^'[=@+\-\t]/.test(v)) v = v.slice(1); // el apóstrofo que añade «Exportar CSV» contra fórmulas
      return v;
    };
    const filas = [], avisos = [];
    for (const f of crudas.slice(1)) {
      const entidad = celda(f, "entidad").slice(0, LIM.entidad);
      if (!entidad) { avisos.push({ n: f.n, grave: true, msg: "Falta la entidad: fila omitida." }); continue; }
      const d = {
        n: f.n, entidad,
        tipo: tipoDeTexto(celda(f, "tipo")),
        area: areaDeTexto(celda(f, "area")),
        nombre: celda(f, "nombre").slice(0, LIM.nombre),
        cargo: celda(f, "cargo").slice(0, LIM.cargo),
        email: "",
        telefono: celda(f, "telefono").slice(0, LIM.telefono),
        web: normalizarWeb(celda(f, "web")).slice(0, LIM.web),
        notas: celda(f, "notas"),
      };
      const bruto = celda(f, "email").toLowerCase();
      if (bruto) {
        const trozos = bruto.split(/[;,\s]+/).filter(Boolean);
        const validos = trozos.filter((x) => RE_EMAIL.test(x));
        if (!validos.length) avisos.push({ n: f.n, grave: false, msg: `«${entidad}»: el correo «${bruto.slice(0, 40)}» no es válido; se importa sin él.` });
        else {
          d.email = validos[0].slice(0, LIM.email);
          if (validos.length > 1) d.notas = (d.notas ? d.notas + " " : "") + "Otros correos: " + validos.slice(1).join(", ") + ".";
        }
      }
      d.notas = d.notas.slice(0, LIM.notas);
      filas.push(d);
    }
    return { filas, avisos };
  }

  function tipoInferido(entidad, clubes) {
    if (clubes.has(claveEntidad(entidad))) return "club";
    if (/federaci|federació|rfef|laliga/i.test(entidad)) return "federacion";
    return "otro";
  }

  // Calcula el resultado SIN tocar el estado. sobrescribir=false: solo rellena campos vacíos.
  function aplicarFilasContactos(filas, sobrescribir) {
    const clubes = new Set(listaClubes().map((c) => claveEntidad(c.nombre)));
    const lista = estado.contactos.map((c) => ({ ...c }));
    const tocados = new Set();
    const nuevos = [];
    const res = { nuevos: 0, actualizados: 0, iguales: 0, conservados: 0, lista };
    const CAMPOS = ["nombre", "cargo", "email", "telefono", "web", "notas"];
    for (const f of filas) {
      const k = claveEntidad(f.entidad);
      const candidatos = lista.concat(nuevos).filter((c) => claveEntidad(c.entidad) === k);
      const c = f.area ? candidatos.find((x) => x.area === f.area) : candidatos[0];
      if (!c) {
        const nuevo = {
          id: nuevoIdContacto() + nuevos.length, tipo: f.tipo || tipoInferido(f.entidad, clubes), entidad: f.entidad,
          area: f.area || "prensa", nombre: f.nombre, cargo: f.cargo, email: f.email, telefono: f.telefono, web: f.web, notas: f.notas,
        };
        nuevos.push(nuevo); tocados.add(nuevo.id); res.nuevos++;
        continue;
      }
      let cambio = false;
      for (const campo of CAMPOS) {
        const v = f[campo];
        if (!v || v === c[campo]) continue;
        if (!c[campo] || sobrescribir) { c[campo] = v; cambio = true; } else res.conservados++;
      }
      if (sobrescribir && f.tipo && f.tipo !== c.tipo) { c.tipo = f.tipo; cambio = true; }
      if (cambio && !tocados.has(c.id)) { tocados.add(c.id); if (!nuevos.includes(c)) res.actualizados++; }
      else if (!cambio && !tocados.has(c.id)) { tocados.add(c.id); res.iguales++; }
    }
    res.lista = nuevos.concat(lista);
    return res;
  }

  function pintarImportacion() {
    const z = zonaContactos("cont-import");
    if (!z) return;
    const imp = vista.contactos.imp;
    if (!imp) { z.hidden = true; z.innerHTML = ""; return; }
    const r = imp.res;
    const total = r.nuevos + r.actualizados;
    const graves = imp.avisos.filter((a) => a.grave).length;
    const chip = (n, txt, cls) => `<span class="resp-imp-chip ${cls || ""}"><b>${n}</b> ${txt}</span>`;
    const avisos = imp.avisos.slice(0, 8).map((a) => `<li class="${a.grave ? "grave" : ""}">Fila ${a.n}: ${esc(a.msg)}</li>`).join("");
    z.hidden = false;
    z.innerHTML = `
      <h5>Importar contactos desde CSV</h5>
      <p class="resp-imp-arch">Archivo <b>${esc(imp.nombre)}</b> · ${imp.filas.length} fila${imp.filas.length === 1 ? "" : "s"} leída${imp.filas.length === 1 ? "" : "s"}</p>
      <div class="resp-imp-chips">
        ${chip(r.nuevos, r.nuevos === 1 ? "contacto nuevo" : "contactos nuevos", "nuevo")}
        ${chip(r.actualizados, r.actualizados === 1 ? "se completa" : "se completan", "act")}
        ${chip(r.iguales, "sin cambios")}
        ${r.conservados ? chip(r.conservados, r.conservados === 1 ? "dato distinto se conserva" : "datos distintos se conservan", "aviso") : ""}
        ${imp.avisos.length ? chip(imp.avisos.length, imp.avisos.length === 1 ? "aviso" : "avisos", graves ? "err" : "aviso") : ""}
      </div>
      <label class="resp-imp-opt"><input type="checkbox" data-resp="imp-sobrescribir" ${imp.sobrescribir ? "checked" : ""}> Sustituir también los datos que ya existan (si no, solo se rellenan los campos vacíos)</label>
      ${avisos ? `<ul class="resp-imp-avisos">${avisos}${imp.avisos.length > 8 ? `<li>…y ${imp.avisos.length - 8} más.</li>` : ""}</ul>` : ""}
      <p class="resp-form-err" data-zona="cont-import-err" role="alert"></p>
      <div class="resp-form-acc">
        <button type="button" class="resp-btn" data-resp="imp-cancelar">Cancelar</button>
        <button type="button" class="resp-btn resp-btn-pri" data-resp="imp-aplicar" ${total ? "" : "disabled"}>${total ? `Importar (${total})` : "Nada que importar"}</button>
      </div>`;
    z.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function recalcularImportacion() {
    const imp = vista.contactos.imp;
    if (imp) imp.res = aplicarFilasContactos(imp.filas, imp.sobrescribir);
  }

  async function elegirArchivoImportacion(input) {
    const archivo = input.files && input.files[0];
    input.value = ""; // permite volver a elegir el mismo archivo
    if (!archivo) return;
    if (archivo.size > IMP_MAX_BYTES) { toast("El archivo es demasiado grande (máximo 2 MB).", "error", 3500); return; }
    let texto;
    try { texto = await leerArchivoTexto(archivo); } catch { toast("No se ha podido leer el archivo.", "error", 3500); return; }
    const leido = leerFilasContactos(parsearCsv(texto));
    if (leido.error) { toast(leido.error, "error", 5500); return; }
    if (!leido.filas.length) { toast("El archivo no tiene ninguna fila con entidad.", "info", 3500); return; }
    cerrarFormContacto();
    vista.contactos.imp = { nombre: archivo.name, filas: leido.filas, avisos: leido.avisos, sobrescribir: false, res: null };
    recalcularImportacion();
    pintarImportacion();
  }

  function confirmarImportacion() {
    const imp = vista.contactos.imp;
    if (!imp) return;
    const err = zonaContactos("cont-import-err");
    if (imp.res.lista.length > MAX_CONTACTOS) { if (err) err.textContent = `La base de datos admite como máximo ${MAX_CONTACTOS} contactos.`; return; }
    const { nuevos, actualizados } = imp.res;
    estado.contactos = imp.res.lista;
    vista.contactos.imp = null;
    pintarImportacion(); pintarChipsContactos(); pintarListaContactos();
    programarGuardado();
    toast(`Importación lista: ${nuevos} nuevo${nuevos === 1 ? "" : "s"} y ${actualizados} actualizado${actualizados === 1 ? "" : "s"}.`, "success", 3500);
  }

  // Hoja de trabajo: contactos que aún no tienen correo + clubes que no tienen ningún contacto.
  function descargarPlantillaContactos() {
    const conContacto = new Set(estado.contactos.map((c) => claveEntidad(c.entidad)));
    const pendientes = estado.contactos.filter((c) => !c.email);
    const sinContacto = listaClubes().filter((c) => !conContacto.has(claveEntidad(c.nombre)))
      .map((c) => ({ tipo: "club", entidad: c.nombre, area: "prensa", nombre: "", cargo: "", email: "", telefono: "", web: "", notas: "" }));
    const filas = pendientes.concat(sinContacto)
      .sort((a, b) => sinTildes(a.entidad).localeCompare(sinTildes(b.entidad), "es"));
    if (!filas.length) { toast("Todos los contactos ya tienen correo.", "info", 3000); return; }
    const cab = ["Tipo", "Entidad", "Departamento", "Persona", "Cargo", "Correo", "Teléfono", "Web / redes", "Notas"];
    const csv = "\uFEFF" + [cab, ...filas.map((c) => [(TIPOS_CONTACTO[c.tipo] || {}).nombre || "", c.entidad, AREAS_CONTACTO[c.area] || "", c.nombre, c.cargo, c.email, c.telefono, c.web, c.notas])]
      .map((f) => f.map(celdaCsv).join(";")).join("\r\n");
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    enlace.download = `plantilla-contactos-pendientes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    setTimeout(() => { URL.revokeObjectURL(enlace.href); enlace.remove(); }, 1000);
    toast(`Plantilla con ${filas.length} entidad${filas.length === 1 ? "" : "es"}. Rellena la columna «Correo» y súbela con «Importar CSV».`, "info", 5000);
  }

  // ======================================================================
  //  EVENTOS (delegados en el subpanel)
  // ======================================================================
  function claveDe(el) {
    const raiz = el.closest("#respRelClubes, #respRrhhRedactores, #respRrhhFotografos");
    if (!raiz) return null;
    return raiz.id === "respRelClubes" ? "relaciones" : raiz.id === "respRrhhRedactores" ? "rrhhRedactores" : "rrhhFotografos";
  }

  function onClick(e) {
    const b = e.target.closest("[data-resp]");
    if (!b || b.tagName === "INPUT" || b.tagName === "SELECT") return;
    const acc = b.dataset.resp;
    const clave = claveDe(b);

    if (acc === "reintentar-carga") { cargar(); return; }
    if (acc === "reintentar-guardado") { guardar(); return; }
    if (acc === "cm-hecho") { marcarContactoMes(true); return; }
    if (acc === "cm-deshacer") { marcarContactoMes(false); return; }
    if (acc === "cm-expandir") { alternarColaborador(b.dataset.id); return; }
    if (acc === "cm-filtro") { vista.cm.filtro = b.dataset.valor; pintarListaColab(); return; }
    if (acc === "cm-rol") { vista.cm.rol = b.dataset.valor; pintarListaColab(); return; }
    if (acc === "cm-ir-inactivos") { vista.cm.filtro = "inactivos"; vista.cm.orden = "inactividad"; montarContactoMensual(); return; }
    if (acc === "cm-marcar-uno") {
      const id = Number(b.dataset.id);
      if (Number.isInteger(id)) marcarColaborador(id, !idsContactados().has(id));
      return;
    }
    if (acc === "cm-copiar-uno") {
      copiarTexto(b.dataset.email || "").then((ok) => toast(ok ? "Correo copiado." : "No se ha podido copiar al portapapeles.", ok ? "success" : "error", 2200));
      return;
    }
    if (acc === "cm-marcar-todos") { marcarTodosColaboradores(true); return; }
    if (acc === "cm-quitar-todos") { marcarTodosColaboradores(false); return; }
    if (acc === "cm-copiar-correos") {
      const lista = estado.activos.filter((a) => a.email);
      copiarCorreos(lista.map((a) => ({ email: a.email })));
      return;
    }
    if (acc === "cm-copiar-mensaje") {
      copiarTexto(mensajeMensualColaboradores()).then((ok) => toast(ok ? "Mensaje copiado. Pega los correos en CCO para que no se vean entre ellos." : "No se ha podido copiar al portapapeles.", ok ? "success" : "error", 4200));
      return;
    }
    if (acc === "rrhh-rol") { vista.rolRrhh = b.dataset.valor === "fotografos" ? "fotografos" : "redactores"; pintarRolRrhh(); return; }

    if (clave) {
      const v = vista[clave];
      if (acc === "filtro") { v.filtro = b.dataset.valor; pintarFiltros(clave); pintarGrupos(clave); return; }
      if (acc === "plegar") {
        const sec = b.closest(".resp-grupo"), id = sec.dataset.comp;
        const plegar = !sec.classList.contains("plegado");
        if (plegar) v.plegados.add(id); else v.plegados.delete(id);
        sec.classList.toggle("plegado", plegar);
        b.setAttribute("aria-expanded", String(!plegar));
        return;
      }
      if (acc === "plegar-todo" || acc === "desplegar-todo") {
        const plegar = acc === "plegar-todo";
        COMPETICIONES.forEach((c) => { if (plegar) v.plegados.add(c.id); else v.plegados.delete(c.id); });
        pintarGrupos(clave);
        return;
      }
      if (acc === "marcar-grupo" || acc === "quitar-grupo") { accionGrupo(clave, b.closest(".resp-grupo"), acc === "marcar-grupo"); return; }
      if (acc === "ir-comp") {
        v.plegados.delete(b.dataset.comp);
        if (v.busqueda || v.filtro !== "todos") {
          v.busqueda = ""; v.filtro = "todos";
          const inp = raizDe(clave).querySelector('[data-resp="buscar"]'); if (inp) inp.value = "";
          pintarFiltros(clave);
        }
        pintarGrupos(clave);
        const sec = raizDe(clave).querySelector(`.resp-grupo[data-comp="${b.dataset.comp}"]`);
        if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }

    if (acc === "cont-nueva") { abrirFormContacto(null); return; }
    if (acc === "cont-cancelar") { cerrarFormContacto(); return; }
    if (acc === "cont-tipo") { vista.contactos.tipo = b.dataset.valor; pintarChipsContactos(); pintarListaContactos(); return; }
    if (acc === "cont-area") { vista.contactos.area = b.dataset.valor; pintarChipsContactos(); pintarListaContactos(); return; }
    if (acc === "cont-copiar") { copiarCorreos(contactosFiltrados()); return; }
    if (acc === "cont-exportar") { exportarContactosCsv(); return; }
    if (acc === "cont-plantilla") { descargarPlantillaContactos(); return; }
    if (acc === "cont-importar") { const inp = zonaContactos("cont-import") && raizContactos().querySelector('[data-resp="cont-archivo"]'); if (inp) inp.click(); return; }
    if (acc === "imp-cancelar") { vista.contactos.imp = null; pintarImportacion(); return; }
    if (acc === "imp-aplicar") { confirmarImportacion(); return; }
    const fichaContacto = b.closest(".resp-contacto");
    if (fichaContacto) {
      const cid = fichaContacto.dataset.id;
      if (acc === "cont-editar") { abrirFormContacto(cid); return; }
      if (acc === "cont-borrar") { borrarContacto(cid); return; }
      if (acc === "cont-copiar-uno") { copiarCorreos(estado.contactos.filter((x) => x.id === cid)); return; }
    }

    if (acc === "fich-nueva") { abrirForm(null); return; }
    if (acc === "fich-cancelar") { cerrarForm(); return; }
    if (acc === "prio") { fijarPrioridad(b.closest("form"), b.dataset.prio); return; }
    if (acc === "fich-estado") { vista.fichajes.estado = b.dataset.valor; pintarChips(); pintarListaFichajes(); return; }
    const tarjeta = b.closest(".resp-persona");
    if (acc === "fich-editar" && tarjeta) { abrirForm(tarjeta.dataset.id); return; }
    if (acc === "fich-borrar" && tarjeta) { borrarFichaje(tarjeta.dataset.id); return; }
  }

  function onChange(e) {
    const t = e.target;
    if (t.matches('[data-resp="cont-archivo"]')) { elegirArchivoImportacion(t); return; }
    if (t.matches('[data-resp="imp-sobrescribir"]')) {
      const imp = vista.contactos.imp;
      if (imp) { imp.sobrescribir = t.checked; recalcularImportacion(); pintarImportacion(); }
      return;
    }
    if (t.matches('[data-resp="cm-colab"]')) {
      const id = Number(t.dataset.id);
      if (Number.isInteger(id)) marcarColaborador(id, t.checked);
      return;
    }
    if (t.matches('[data-resp="cm-orden"]')) { vista.cm.orden = t.value; pintarListaColab(); return; }
    if (t.matches('[data-resp="cm-dia"]')) {
      const n = parseInt(t.value, 10);
      if (n >= 1 && n <= 28) { estado.contacto.dia = n; montarContactoMensual(); programarGuardado(); }
      return;
    }
    if (t.matches('[data-resp="club"]')) {
      const clave = claveDe(t);
      if (!clave) return;
      marcarClub(clave, t.dataset.slug, t.checked);
      actualizarContadores(clave);
      programarGuardado();
      return;
    }
    if (t.matches('[data-resp="fich-cambiar-estado"]')) {
      const tarjeta = t.closest(".resp-persona");
      const f = tarjeta && estado.fichajes.find((x) => x.id === tarjeta.dataset.id);
      if (!f) return;
      f.estado = t.value;
      pintarChips(); pintarListaFichajes();
      programarGuardado();
    }
  }

  function onInput(e) {
    const t = e.target;
    if (t.matches('[data-resp="buscar"]')) {
      const clave = claveDe(t);
      if (!clave) return;
      vista[clave].busqueda = t.value;
      pintarGrupos(clave);
    } else if (t.matches('[data-resp="cm-buscar"]')) {
      vista.cm.busqueda = t.value;
      pintarListaColab();
    } else if (t.matches('[data-resp="cm-nota"]')) {
      vista.contactoNota = t.value;
    } else if (t.matches('[data-resp="fich-buscar"]')) {
      vista.fichajes.busqueda = t.value;
      pintarListaFichajes();
    } else if (t.matches('[data-resp="cont-buscar"]')) {
      vista.contactos.busqueda = t.value;
      pintarListaContactos();
    }
  }

  function enlazar() {
    if (enlazado) return;
    const panel = $("subpanel-responsabilidades");
    if (!panel) return;
    enlazado = true;
    panel.addEventListener("click", onClick);
    panel.addEventListener("change", onChange);
    panel.addEventListener("input", onInput);
    panel.addEventListener("submit", (e) => {
      if (e.target.matches('[data-zona="form"]')) { e.preventDefault(); enviarForm(e.target); }
      else if (e.target.matches('[data-zona="cont-form"]')) { e.preventDefault(); enviarFormContacto(e.target); }
    });
    // Escudo que no carga -> inicial del club (el evento error no burbujea: captura).
    panel.addEventListener("error", (e) => {
      const img = e.target;
      if (img && img.tagName === "IMG" && img.classList.contains("resp-escudo")) {
        const s = document.createElement("span");
        s.className = "resp-escudo";
        s.textContent = img.dataset.inicial || "?";
        img.replaceWith(s);
      }
    }, true);
    window.addEventListener("beforeunload", (e) => {
      if (estado.guardado === "pendiente" || estado.guardado === "guardando" || estado.guardado === "error") { e.preventDefault(); e.returnValue = ""; }
    });
    // Al esconder la pestaña se adelanta el guardado pendiente.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && estado.guardado === "pendiente") guardar();
    });
  }

  // Para el módulo de plantillas (responsabilidades-plantillas.js).
  window.EOFResponsabilidades = { cargar, listaClubes, recordatorioMensual };
  // Aviso mensual al abrir el panel (solo administradores; espera a que admin.js haya arrancado).
  function arrancarRecordatorio() { setTimeout(() => { recordatorioMensual().catch(() => {}); }, 3500); }
  if (document.readyState === "complete") arrancarRecordatorio(); else window.addEventListener("load", arrancarRecordatorio);
})();
