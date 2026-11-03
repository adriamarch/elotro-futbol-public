// Ficha de jugador. Dos orígenes de datos, con la misma presentación:
//
//  1) ?c=hypermotion&e=cd-tenerife&f=zc8vwd36  → ficha de Flashscore (la que enlazan /estadisticas
//     y /plantilla). Sale de dos ficheros estáticos: data/jugadores/{club}.json (la plantilla
//     completa del club) y data/estadisticas/{competicion}.json (para los puestos en la liga).
//  2) ?c=hypermotion&j=slug-del-jugador        → ficha de la redacción (GET /api/stats/jugador), con el
//     partido a partido. Es la de siempre; los enlaces antiguos siguen funcionando.
const COMPETICIONES_FICHA = {
  hypermotion: "LaLiga Hypermotion",
  primera_federacion: "Primera Federación",
  segunda_federacion: "Segunda Federación",
};
const PARAMS_FICHA = new URLSearchParams(location.search);
const COMP_FICHA = COMPETICIONES_FICHA[PARAMS_FICHA.get("c")] ? PARAMS_FICHA.get("c") : "";
const SLUG_FICHA = (PARAMS_FICHA.get("j") || "").slice(0, 160);
const CLUB_FS = /^[a-z0-9-]{1,80}$/.test(PARAMS_FICHA.get("e") || "") ? PARAMS_FICHA.get("e") : "";
const ID_FS = /^[A-Za-z0-9]{4,24}$/.test(PARAMS_FICHA.get("f") || "") ? PARAMS_FICHA.get("f") : "";
const ES_FLASHSCORE = !!ID_FS;
const TIPO_VUELTA = PARAMS_FICHA.get("t") || "goleadores";
const contFicha = document.getElementById("fichaCont");
// ?temp=todas: la ficha de la redacción se abre con el histórico acumulado.
const TEMP_FICHA = PARAMS_FICHA.get("temp") === "todas" ? "todas" : "";
const SUFIJO_TEMP = TEMP_FICHA ? "&temp=todas" : "";
const URL_FLASHSCORE = /^https:\/\/(www\.)?flashscore\.(com|es)\//;

function rutaCanonicaFicha(slug) {
  if (ES_FLASHSCORE) return `/jugador?c=${encodeURIComponent(COMP_FICHA)}&e=${encodeURIComponent(CLUB_FS)}&f=${encodeURIComponent(ID_FS)}`;
  return COMP_FICHA && slug ? `/jugador?c=${encodeURIComponent(COMP_FICHA)}&j=${encodeURIComponent(slug)}` : "/jugador";
}

fijarSeoBasico({
  titulo: "Ficha de jugador — ELOTROFÚTBOLTV",
  descripcion: "Ficha de jugador: partidos, minutos, goles, asistencias y tarjetas de la temporada.",
  urlPath: rutaCanonicaFicha(SLUG_FICHA),
  noindex: !!TEMP_FICHA,
});

function enlaceVolverEstadisticas() {
  const q = new URLSearchParams();
  if (COMP_FICHA) q.set("c", COMP_FICHA);
  q.set("t", TIPO_VUELTA);
  if (TEMP_FICHA) q.set("temp", TEMP_FICHA);
  return `${baseHref()}estadisticas?${q.toString()}`;
}
function enlacePlantillaClub(club, comp) {
  return `${baseHref()}plantilla?c=${encodeURIComponent(comp)}&club=${encodeURIComponent(club)}${SUFIJO_TEMP}`;
}

// ---------- Utilidades de formato ----------
function fechaCorta(f) {
  if (!f) return "";
  const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
}
function fechaLarga(f) {
  const m = String(f || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
function minutoTexto(e) {
  if (e.minuto === null || e.minuto === undefined) return "";
  return `${e.minuto}${e.extra ? "+" + e.extra : ""}'`;
}
const n1 = (v) => Number(v || 0).toLocaleString("es-ES");
const dec2 = (v) => v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plural = (n, uno, varios) => `${n1(n)} ${n === 1 ? uno : varios}`;

// ---------- Piezas comunes ----------
// Las tarjetas se dibujan con CSS (un rectángulo de color), no con emojis.
const TARJETA_A = `<i class="tj tj-a" aria-hidden="true"></i>`;
const TARJETA_R = `<i class="tj tj-r" aria-hidden="true"></i>`;
const EVENTO = {
  gol: { txt: "Gol", html: "Gol" },
  asistencia: { txt: "Asistencia", html: "Asist." },
  amarilla: { txt: "Tarjeta amarilla", html: TARJETA_A },
  doble_amarilla: { txt: "Expulsión por doble amarilla", html: TARJETA_A + TARJETA_R },
  roja: { txt: "Tarjeta roja", html: TARJETA_R },
};

function migasHTML(partes) {
  return `<nav class="ficha-migas" aria-label="Migas de pan">${partes.filter(Boolean).join('<span aria-hidden="true">/</span>')}</nav>`;
}

// Cabecera tipo «hero» (como la ficha de club): escudo, competición, nombre, datos básicos en chips,
// el dorsal enorme como marca de agua y, opcionalmente, una franja con las cifras clave.
function cabeceraHTML({ nombre, dorsal, club, escudo, comp, kicker, linea, cifras }) {
  const hayDorsal = dorsal !== null && dorsal !== undefined && dorsal !== "";
  const dors = hayDorsal ? `<span class="ficha-dorsal"><span class="sr-only">Dorsal </span>${escapeHtml(String(dorsal))}</span>` : "";
  const chips = linea.filter(Boolean).map((c) => `<li class="ficha-chip">${c}</li>`).join("");
  return `
    <header class="ficha-cabecera">
      ${dors}
      <div class="ficha-escudo-wrap">
        <img class="ficha-escudo" src="${getEscudoUrl(club, escudo)}" alt="Escudo de ${escapeHtml(club)}" onerror="manejarErrorEscudo(this);">
      </div>
      <div class="ficha-ident">
        ${kicker ? `<p class="ficha-kicker">${kicker}</p>` : ""}
        <h1 class="ficha-nombre">${escapeHtml(nombre)}</h1>
        ${chips ? `<ul class="ficha-chips">${chips}</ul>` : ""}
      </div>
      ${cifras && cifras.length ? cifrasHeroHTML(cifras) : ""}
    </header>`;
}

// Franja de 3-4 cifras destacadas dentro de la cabecera.
function cifrasHeroHTML(items) {
  return `<dl class="ficha-hero-cifras">${items.map(([valor, et, fuerte]) =>
    `<div class="${fuerte ? "fuerte" : ""}"><dt>${et}</dt><dd>${valor}</dd></div>`).join("")}</dl>`;
}

// Franja de cifras (ficha de la redacción y bloque externo): números con su rótulo, sin cajas.
function resumenHTML(items) {
  return `<dl class="ficha-resumen">${items.map(([valor, et, fuerte]) =>
    `<div class="${fuerte ? "fuerte" : ""}"><dt>${et}</dt><dd>${valor}</dd></div>`).join("")}</dl>`;
}

// =====================================================================
//  FICHA DE FLASHSCORE
// =====================================================================
const MIN_PARA_RATIOS = 270;      // por 90' solo con 3 partidos completos o más
const MIN_PARA_MEDIAS = 300;      // para entrar en la media de su puesto

const FILAS_STATS = [
  { k: "pj", et: "Partidos" },
  { k: "min", et: "Minutos" },
  { k: "gol", et: "Goles", ratio: true },
  { k: "as", et: "Asistencias", ratio: true },
  { k: "ta", et: "Amarillas", ratio: true },
  { k: "tr", et: "Rojas", ratio: true },
];

function compactar(p) {
  return { id: p.id, n: p.alias || p.nombre || "", d: p.dorsal, pos: p.posicion, pj: p.pj || 0, min: p.min || 0, gol: p.goles || 0, as: p.asistencias || 0, ta: p.ta || 0, tr: p.tr || 0, u: p.url };
}

// Puesto de «valor» dentro de «lista» (solo cuentan los que tienen más de 0).
function puesto(valor, lista, k) {
  if (!(valor > 0)) return null;
  const mayores = lista.filter((x) => x[k] > valor).length;
  const iguales = lista.filter((x) => x[k] === valor).length;
  return { pos: mayores + 1, empate: iguales > 1, de: lista.filter((x) => x[k] > 0).length };
}
function puestoHTML(r) {
  if (!r) return `<span class="ficha-nd">—</span>`;
  return `<span class="${r.pos <= 3 ? "ficha-top" : ""}" title="${r.empate ? "Empatado con otros jugadores" : ""}">${r.empate ? "=" : ""}${r.pos}.º</span><small> de ${r.de}</small>`;
}

const PLURAL_POS = { Portero: "porteros", Defensa: "defensas", Centrocampista: "centrocampistas", Delantero: "delanteros" };

// Media por 90' de los jugadores de la misma demarcación con minutos suficientes.
function mediaDelPuesto(listaComp, pos) {
  const grupo = listaComp.filter((x) => x.pos === pos && x.min >= MIN_PARA_MEDIAS);
  const minutos = grupo.reduce((a, x) => a + x.min, 0);
  if (grupo.length < 5 || !minutos) return null;
  const por90 = (k) => (grupo.reduce((a, x) => a + x[k], 0) / minutos) * 90;
  return { n: grupo.length, gol: por90("gol"), as: por90("as"), ta: por90("ta"), tr: por90("tr") };
}

// Un par de frases con lo esencial, escritas como las escribiría un redactor.
function resumenTexto(p, club) {
  if (!p.pj && !p.min) return `Todavía no tiene minutos con el ${club} esta temporada.`;
  const porPartido = p.pj ? Math.round(p.min / p.pj) : 0;
  let t = `${plural(p.pj, "partido", "partidos")} y ${plural(p.min, "minuto", "minutos")} con el ${club}`;
  if (p.pj > 1) t += `, ${porPartido} por partido`;
  t += ".";
  const aportes = [];
  if (p.gol) aportes.push(plural(p.gol, "gol", "goles"));
  if (p.as) aportes.push(plural(p.as, "asistencia", "asistencias"));
  if (aportes.length) {
    t += ` Suma ${aportes.join(" y ")}`;
    if (p.gol && p.min >= MIN_PARA_RATIOS) t += `: un gol cada ${n1(Math.round(p.min / p.gol))} minutos`;
    t += ".";
  } else if (p.pos !== "Portero" && p.min >= MIN_PARA_RATIOS) {
    t += " Aún no ha intervenido en ningún gol.";
  }
  if (p.tr) t += ` Ha visto ${plural(p.tr, "roja", "rojas")}.`;
  return t;
}

function tablaStatsHTML(p, rClub, rLiga, media, etiquetaLiga) {
  const portero = p.pos === "Portero";
  const filas = FILAS_STATS.filter((f) => !(portero && (f.k === "gol" || f.k === "as") && !p[f.k])).map((f) => {
    const v = p[f.k];
    const por90 = f.ratio && p.min >= MIN_PARA_RATIOS ? dec2((v / p.min) * 90) : "";
    const med = f.ratio && media ? dec2(media[f.k]) : "";
    return `
      <tr>
        <th scope="row">${f.et}</th>
        <td class="num fuerte">${n1(v)}</td>
        <td class="num col-r90">${por90 || (f.ratio ? '<span class="ficha-nd">—</span>' : "")}</td>
        <td class="num col-med">${med}</td>
        <td class="num col-puesto">${puestoHTML(puesto(v, rClub.lista, f.k))}</td>
        <td class="num col-puesto">${f.ratio ? puestoHTML(puesto(v, rLiga.lista, f.k)) : ""}</td>
      </tr>`;
  }).join("");
  return `
    <div class="clasificacion-tabla-wrap">
      <table class="ficha-stats">
        <thead>
          <tr>
            <th scope="col"><span class="sr-only">Estadística</span></th>
            <th scope="col" class="num">Total</th>
            <th scope="col" class="num col-r90" title="Por cada 90 minutos jugados">Por 90'</th>
            <th scope="col" class="num col-med" title="Media por 90' de los de su misma demarcación">Media del puesto</th>
            <th scope="col" class="num col-puesto" title="Puesto entre los jugadores de su club">Club</th>
            <th scope="col" class="num col-puesto" title="Puesto entre los jugadores de su competición (o grupo)">${escapeHtml(etiquetaLiga)}</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

function hrefFichaFs(c, e, f) {
  return `${baseHref()}jugador?c=${encodeURIComponent(c)}&e=${encodeURIComponent(e)}&f=${encodeURIComponent(f)}`;
}

function plantelHTML(club, jugadores, yo, comp, slugClub) {
  const otros = jugadores.filter((x) => x.id !== yo.id && (x.pj > 0 || x.min > 0))
    .sort((a, b) => b.min - a.min || b.gol - a.gol).slice(0, 12);
  if (!otros.length) return "";
  const filas = otros.map((x) => `
    <tr>
      <td class="num">${x.d !== null && x.d !== undefined ? x.d : ""}</td>
      <th scope="row"><a href="${hrefFichaFs(comp, slugClub, x.id)}">${escapeHtml(x.n)}</a></th>
      <td class="col-pos">${escapeHtml(x.pos || "")}</td>
      <td class="num">${x.pj}</td><td class="num">${x.gol}</td><td class="num">${x.as}</td>
    </tr>`).join("");
  return `
    <section class="ficha-bloque">
      <h2 class="ficha-titulo">Resto de la plantilla <a class="ficha-ver-plantilla" href="${enlacePlantillaClub(club, comp)}">Plantilla completa</a></h2>
      <div class="clasificacion-tabla-wrap">
        <table class="ficha-plantel">
          <thead><tr><th class="num" scope="col">N.º</th><th scope="col">Jugador</th><th scope="col" class="col-pos">Demarcación</th><th class="num" scope="col" title="Partidos">PJ</th><th class="num" scope="col" title="Goles">G</th><th class="num" scope="col" title="Asistencias">A</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    </section>`;
}

async function pedirJsonEstatico(ruta) {
  const res = await fetch(`${baseHref()}${ruta}`);
  if (res.status === 404) return null;
  if (!res.ok || !/json/i.test(res.headers.get("Content-Type") || "")) throw new Error("HTTP " + res.status);
  return res.json();
}

function estadoNoEncontrado(texto) {
  contFicha.innerHTML = estadoHTML({
    titulo: "Jugador no encontrado",
    texto,
    tipo: "error",
    cta: `<a href="${baseHref()}estadisticas${COMP_FICHA ? "?c=" + encodeURIComponent(COMP_FICHA) : ""}" class="btn-volver">Ir a estadísticas</a>`,
  });
}

async function cargarFichaFlashscore() {
  if (!COMP_FICHA || !CLUB_FS) { estadoNoEncontrado("El enlace no es válido. Busca al jugador desde las estadísticas o desde la plantilla de su club."); return; }
  contFicha.innerHTML = spinnerHTML();
  try {
    const [comp, club] = await conReintento(() => Promise.all([
      pedirJsonEstatico(`data/estadisticas/${COMP_FICHA}.json`),
      pedirJsonEstatico(`data/jugadores/${CLUB_FS}.json`),
    ]));
    const infoClub = comp && (comp.clubes || []).find((c) => c.s === CLUB_FS);
    const fuenteOk = club && /flashscore/i.test(String(club.fuente || "")) && URL_FLASHSCORE.test(String(club.fuente_url || ""));
    const crudo = fuenteOk && infoClub ? (club.jugadores || []).find((x) => x.id === ID_FS) : null;
    if (!crudo) { estadoNoEncontrado("No tenemos datos de este jugador en Flashscore."); return; }

    const p = compactar(crudo);
    const plantilla = club.jugadores.map(compactar);
    const grupo = infoClub.g || "";
    const listaLiga = (comp.jugadores || []).filter((x) => !grupo || x.g === grupo);
    const etiquetaLiga = grupo || "Liga";
    const media = p.pos && p.pos !== "Portero" ? mediaDelPuesto(comp.jugadores || [], p.pos) : null;
    const compNombre = COMPETICIONES_FICHA[COMP_FICHA];

    const lead = resumenTexto(p, club.club);
    fijarSeoBasico({
      titulo: `${p.n} (${club.club}): estadísticas ${club.temporada || ""} — ELOTROFÚTBOLTV`.replace("  ", " "),
      descripcion: `${p.n}, ${club.club}${compNombre ? " (" + compNombre + ")" : ""}. ${lead}`,
      urlPath: rutaCanonicaFicha(),
      migas: [
        { nombre: "Estadísticas", urlPath: `estadisticas?c=${COMP_FICHA}` },
        { nombre: club.club, urlPath: `plantilla?c=${COMP_FICHA}&club=${encodeURIComponent(club.club)}` },
        { nombre: p.n },
      ],
    });

    const linea = [
      p.pos ? escapeHtml(p.pos) : "",
      crudo.edad ? `${crudo.edad} años` : "",
      `<a href="${enlacePlantillaClub(club.club, COMP_FICHA)}">${escapeHtml(club.club)}</a>`,
    ];
    const kicker = escapeHtml(compNombre + (grupo ? " · " + grupo : ""));
    // Porteros: sus goles y asistencias casi nunca cuentan, mejor las tarjetas.
    const cifras = p.pos === "Portero"
      ? [[n1(p.pj), "Partidos", true], [n1(p.min), "Minutos"], [n1(p.ta), "Amarillas"], [n1(p.tr), "Rojas"]]
      : [[n1(p.pj), "Partidos"], [n1(p.min), "Minutos"], [n1(p.gol), "Goles", true], [n1(p.as), "Asistencias", true]];
    const enlaceFs = p.u && URL_FLASHSCORE.test(p.u)
      ? ` <a href="${escapeHtml(p.u)}" target="_blank" rel="noopener nofollow">Ficha en Flashscore ↗</a>` : "";
    const notaMedia = media
      ? ` La media del puesto es la de los ${media.n} ${PLURAL_POS[p.pos] || "jugadores"} de ${escapeHtml(compNombre)} con ${MIN_PARA_MEDIAS} minutos o más.` : "";

    contFicha.innerHTML = `
      ${migasHTML([
        `<a href="${enlaceVolverEstadisticas()}">Estadísticas</a>`,
        `<a href="${baseHref()}estadisticas?c=${encodeURIComponent(COMP_FICHA)}">${escapeHtml(compNombre)}</a>`,
        `<a href="${enlacePlantillaClub(club.club, COMP_FICHA)}">${escapeHtml(club.club)}</a>`,
      ])}
      ${cabeceraHTML({ nombre: p.n, dorsal: p.d, club: club.club, comp: COMP_FICHA, kicker, linea, cifras })}
      <p class="ficha-lead">${escapeHtml(lead)}</p>
      <section class="ficha-bloque" aria-label="Estadísticas de la temporada ${escapeHtml(club.temporada || "")}">
        <h2 class="ficha-titulo">Temporada ${escapeHtml(club.temporada || "")}</h2>
        ${tablaStatsHTML(p, { lista: plantilla }, { lista: listaLiga }, media, etiquetaLiga)}
        <p class="ficha-nota">Datos no oficiales de Flashscore, actualizados el ${escapeHtml(fechaLarga(club.actualizado))}. Suman todas las competiciones del club, y el nombre aparece como lo escribe Flashscore (apellido primero). Los puestos cuentan solo a jugadores con al menos una cifra en esa fila; «por 90'» se calcula desde ${MIN_PARA_RATIOS} minutos.${notaMedia}${enlaceFs}</p>
      </section>
      ${plantelHTML(club.club, plantilla, p, COMP_FICHA, CLUB_FS)}`;
  } catch (err) {
    contFicha.innerHTML = estadoHTML({
      titulo: "No se ha podido conectar",
      texto: "Ha habido un problema al cargar la ficha. Comprueba tu conexión e inténtalo de nuevo.",
      tipo: "error",
      cta: `<a href="javascript:location.reload()" class="btn-volver">Reintentar</a>`,
    });
  }
}

// =====================================================================
//  FICHA DE LA REDACCIÓN (con partido a partido)
// =====================================================================
function frasePuestos(d) {
  const grupo = d.grupo ? ` del ${escapeHtml(d.grupo)}` : "";
  const defs = [
    ["goleadores", "goleador"], ["asistentes", "asistente"], ["participacion", "en goles y asistencias"],
    ["tarjetas", "en tarjetas"], ["mvps", "en MVP de partido"], ["mas_partidos", "en partidos jugados"],
  ];
  const lista = defs.map(([k, et]) => {
    const p = d.posiciones && d.posiciones[k];
    return p && p.pos <= 10 ? `${p.pos}.º ${et}${grupo}` : "";
  }).filter(Boolean);
  return lista.length ? `<p class="ficha-puestos"><b>En los tops de la redacción:</b> ${lista.join("; ")}.</p>` : "";
}

function graficoTramos(tramos) {
  const max = Math.max(1, ...tramos.map((t) => t.goles));
  const total = tramos.reduce((a, t) => a + t.goles, 0);
  if (!total) return "";
  return `
    <section class="ficha-bloque">
      <h2 class="ficha-titulo">Goles por tramos del partido</h2>
      <div class="ficha-tramos" role="img" aria-label="Goles por tramos de minutos">
        ${tramos.map((t) => `
          <div class="ficha-tramo${t.goles === max ? " ficha-tramo-max" : ""}${t.goles ? "" : " ficha-tramo-cero"}">
            <span class="ficha-tramo-num">${t.goles}</span>
            <div class="ficha-tramo-barra"><span style="height:${Math.round((t.goles / max) * 100)}%"></span></div>
            <span class="ficha-tramo-et">${t.tramo}'</span>
          </div>`).join("")}
      </div>
    </section>`;
}

function filaPartido(p) {
  const rival = p.rival
    ? `<a class="equipo-enlace ficha-rival" href="${enlaceEquipoHref(p.rival, COMP_FICHA)}"><img class="clas-escudo" src="${getEscudoUrl(p.rival, p.escudo_rival)}" alt="" loading="lazy" onerror="manejarErrorEscudo(this);"><span>${p.local ? "" : "en "}${escapeHtml(p.rival)}</span></a>`
    : "—";
  const marcador = p.resultado
    ? `<span class="ficha-res ficha-res-${p.resultado}" title="${p.resultado === "V" ? "Victoria" : p.resultado === "D" ? "Derrota" : "Empate"}">${p.goles_favor}-${p.goles_contra}</span>`
    : "—";
  const rol = p.rol === "titular" ? "Titular" : p.rol === "suplente" ? "Suplente" : "";
  const ev = p.eventos.length
    ? p.eventos.map((e) => `<span class="ficha-ev ficha-ev-${escapeHtml(String(e.tipo || ""))}" title="${(EVENTO[e.tipo] || {}).txt || ""}">${(EVENTO[e.tipo] || {}).html || ""} ${minutoTexto(e)}</span>`).join("")
    : `<span class="ficha-sin-ev">${rol ? "—" : ""}</span>`;
  return `
    <tr>
      <td class="col-jor">${p.jornada !== null ? "J" + p.jornada : ""}<small>${fechaCorta(p.fecha)}</small></td>
      <td class="col-rival">${rival}</td>
      <td class="col-res">${marcador}</td>
      <td class="col-rol">${rol}${p.mvp ? ` <b class="ficha-mvp" title="MVP del partido">MVP</b>` : ""}</td>
      <td class="col-ev">${ev}</td>
    </tr>`;
}

// ---------- Bloque aparte: cifras de Flashscore dentro de la ficha de la redacción ----------
function normNombreExt(t) {
  return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokensExt(t) { const n = normNombreExt(t); return n ? n.split(" ") : []; }
function tokensContenidosExt(corto, largo) {
  return corto.length > 0 && corto.every((t) => largo.some((l) => l === t || (t.length === 1 && l.startsWith(t))));
}
// Devuelve el jugador SOLO si la coincidencia es inequívoca (mejor nada que los datos de otra persona).
function buscarJugadorExterno(jugadores, nombre) {
  const buscado = tokensExt(nombre);
  if (!buscado.length) return null;
  const cands = (jugadores || []).filter((p) => tokensContenidosExt(buscado, tokensExt(`${p.alias || ""} ${p.nombre || ""}`)));
  if (cands.length === 1) return cands[0];
  if (cands.length > 1) {
    const n = normNombreExt(nombre);
    const exactos = cands.filter((p) => normNombreExt(p.alias) === n || normNombreExt(p.nombre) === n);
    return exactos.length === 1 ? exactos[0] : null;
  }
  return null;
}
function esDocFlashscore(doc) {
  return !!doc && /flashscore/i.test(String(doc.fuente || "")) && URL_FLASHSCORE.test(String(doc.fuente_url || ""));
}
const numExt = (v) => (v === null || v === undefined ? "—" : v);

function htmlExterno(p, doc) {
  const portero = p.posicion === "Portero";
  const datos = [
    [numExt(p.pj), "Partidos", true],
    [numExt(p.asistencias), "Asistencias"],
    [p.min === null || p.min === undefined ? "—" : n1(p.min), "Minutos"],
    ...(portero ? [] : [[numExt(p.goles), "Goles"]]),
    [numExt(p.ta), "Amarillas"],
    [numExt(p.tr), "Rojas"],
  ];
  const meta = [p.nombre, p.demarcacion || p.posicion, p.edad ? `${p.edad} años` : ""].filter(Boolean).map(escapeHtml).join(" · ");
  const enlace = p.url && URL_FLASHSCORE.test(p.url) ? ` <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener nofollow">Ficha en Flashscore ↗</a>` : "";
  return `
    <section class="ficha-bloque" aria-label="Estadísticas de Flashscore">
      <h2 class="ficha-titulo">Según Flashscore, temporada ${escapeHtml(doc.temporada || "")}</h2>
      <p class="ficha-linea">${meta}</p>
      ${resumenHTML(datos)}
      <p class="ficha-nota">Datos no oficiales, actualizados el ${escapeHtml(fechaLarga(doc.actualizado))}. Suman todas las competiciones del club y pueden diferir de lo que cuenta la redacción.${enlace}</p>
    </section>`;
}

async function cargarExterno(j) {
  const cont = document.getElementById("fichaExterno");
  if (!cont || !j || j.sin_nombre || !j.club || !j.nombre) return;
  try {
    const res = await fetch(`${baseHref()}data/jugadores/${slugEquipo(j.club)}.json`);
    if (!res.ok || !/json/i.test(res.headers.get("Content-Type") || "")) return;
    const doc = await res.json();
    if (!esDocFlashscore(doc)) return;
    const p = buscarJugadorExterno(doc.jugadores, j.nombre);
    if (p) cont.innerHTML = htmlExterno(p, doc);
  } catch (e) { /* bloque opcional */ }
}

function pintarFicha(d) {
  const j = d.jugador;
  const t = d.totales;
  const nombre = j.sin_nombre ? `Dorsal ${j.dorsal}` : j.nombre;
  const compNombre = COMPETICIONES_FICHA[d.competicion] || "";
  fijarSeoBasico({
    titulo: `${nombre} (${j.club}) — estadísticas y ficha — ELOTROFÚTBOLTV`,
    descripcion: `${nombre}, ${j.club}: ${plural(t.goles, "gol", "goles")}, ${plural(t.asistencias, "asistencia", "asistencias")} y ${plural(t.tarjetas, "tarjeta", "tarjetas")} ${TEMP_FICHA ? "en el histórico acumulado" : "esta temporada"}${compNombre ? " en " + compNombre : ""}.`,
    urlPath: rutaCanonicaFicha(j.slug),
    noindex: !!TEMP_FICHA || !!j.sin_nombre,
  });

  const partidos = d.partidos || [];
  const alineaciones = t.titular + t.suplente;
  const datos = [
    [t.goles, "Goles", true],
    [t.asistencias, "Asistencias", true],
    [t.participacion, "Goles + asist."],
    [t.amarillas, "Amarillas"],
    [t.dobles + t.rojas, "Expulsiones"],
    [t.partidos_registrados, "Partidos con datos"],
  ];
  if (t.mvps) datos.push([t.mvps, "MVP"]);
  if (alineaciones) datos.push([`${t.titular}<small> / ${t.suplente}</small>`, "Titular / suplente"]);

  contFicha.innerHTML = `
    ${migasHTML([
      `<a href="${enlaceVolverEstadisticas()}">Estadísticas</a>`,
      compNombre ? escapeHtml(compNombre) : "",
      d.grupo ? escapeHtml(d.grupo) : "",
    ])}
    ${cabeceraHTML({
      nombre, dorsal: j.dorsal, club: j.club, escudo: j.escudo_url, comp: d.competicion,
      kicker: escapeHtml([compNombre, d.grupo].filter(Boolean).join(" · ")),
      linea: [
        `<a href="${enlacePlantillaClub(j.club, d.competicion)}">${escapeHtml(j.club)}</a>`,
        TEMP_FICHA ? "Histórico acumulado" : "Temporada en curso",
      ],
      cifras: [[t.goles, "Goles", true], [t.asistencias, "Asistencias", true], [t.participacion, "G + A"], [t.partidos_registrados, "Partidos"]],
    })}
    ${frasePuestos(d)}
    <section class="ficha-bloque" aria-label="Resumen de la temporada">
      <h2 class="ficha-titulo">${TEMP_FICHA ? "Histórico acumulado" : "Temporada en curso"}</h2>
      ${resumenHTML(datos)}
    </section>

    ${graficoTramos(d.tramos_goles || [])}

    <section class="ficha-bloque">
      <h2 class="ficha-titulo">Partido a partido</h2>
      ${partidos.length ? `
      <div class="clasificacion-tabla-wrap">
        <table class="clasificacion-tabla ficha-tabla">
          <thead><tr><th title="Jornada">Jor.</th><th class="col-rival">Rival</th><th>Res.</th><th class="col-rol">Rol</th><th class="col-ev">Incidencias</th></tr></thead>
          <tbody>${partidos.map(filaPartido).join("")}</tbody>
        </table>
      </div>` : `<p class="ficha-vacio">Todavía no hay partidos registrados para este jugador.</p>`}
    </section>

    <div id="fichaExterno"></div>

    ${(d.companeros || []).length ? `
    <section class="ficha-bloque">
      <h2 class="ficha-titulo">Más jugadores de ${escapeHtml(j.club)} <a class="ficha-ver-plantilla" href="${enlacePlantillaClub(j.club, d.competicion)}">Plantilla completa</a></h2>
      <ul class="ficha-companeros">
        ${d.companeros.map((c) => `
          <li><a href="${baseHref()}jugador?c=${encodeURIComponent(d.competicion)}&j=${encodeURIComponent(c.slug)}&t=${encodeURIComponent(TIPO_VUELTA)}${SUFIJO_TEMP}">
            ${c.dorsal !== null && c.dorsal !== undefined ? `<span class="ficha-comp-dorsal">${c.dorsal}</span>` : ""}
            <span class="ficha-comp-nombre">${escapeHtml(c.jugador)}</span>
            <span class="ficha-comp-datos">${c.goles} g · ${c.asistencias} a</span>
          </a></li>`).join("")}
      </ul>
    </section>` : ""}

    <p class="ficha-nota">${TEMP_FICHA ? "Histórico acumulado" : "Temporada en curso"}. Calculado con el minuto a minuto y las alineaciones de los partidos que cubre la redacción; solo cuentan los partidos registrados.</p>`;
}

async function cargarFicha() {
  if (!COMP_FICHA || !SLUG_FICHA) {
    contFicha.innerHTML = estadoHTML({
      titulo: "Jugador no encontrado",
      texto: "El enlace no es válido. Busca al jugador desde las estadísticas.",
      tipo: "error",
      cta: `<a href="${baseHref()}estadisticas" class="btn-volver">Ir a estadísticas</a>`,
    });
    return;
  }
  contFicha.innerHTML = spinnerHTML();
  try {
    const params = new URLSearchParams({ competicion: COMP_FICHA, j: SLUG_FICHA });
    if (TEMP_FICHA) params.set("temporada", TEMP_FICHA);
    const res = await conReintento(() => apiFetch(`/api/stats/jugador?${params.toString()}`).then((r) => {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }));
    if (!res) {
      contFicha.innerHTML = estadoHTML({
        titulo: "Jugador no encontrado",
        texto: TEMP_FICHA ? "No hay datos de este jugador en el histórico acumulado." : "No hay datos de este jugador en la temporada en curso.",
        tipo: "error",
        cta: `<a href="${enlaceVolverEstadisticas()}" class="btn-volver">Volver a estadísticas</a>`,
      });
      return;
    }
    // Si un admin fundió o renombró al jugador, el enlace antiguo se sustituye por el vigente.
    if (res.jugador && res.jugador.slug && res.jugador.slug !== SLUG_FICHA && window.history && history.replaceState) {
      const u = new URL(location.href);
      u.searchParams.set("j", res.jugador.slug);
      history.replaceState(null, "", u.toString());
    }
    pintarFicha(res);
    cargarExterno(res.jugador);
  } catch (err) {
    contFicha.innerHTML = estadoHTML({
      titulo: "No se ha podido conectar",
      texto: "Ha habido un problema al cargar la ficha. Comprueba tu conexión e inténtalo de nuevo.",
      tipo: "error",
      cta: `<a href="javascript:location.reload()" class="btn-volver">Reintentar</a>`,
    });
  }
}

if (ES_FLASHSCORE) {
  // El buscador consulta la API de la redacción: en la ficha de Flashscore sobra.
  const b = document.getElementById("buscadorJugadores");
  if (b) b.hidden = true;
  cargarFichaFlashscore();
} else {
  // Buscador de jugadores y clubes: busca en la competición de esta ficha.
  iniciarBuscadorJugadores({
    contenedor: document.getElementById("buscadorJugadores"),
    competicion: () => COMP_FICHA,
    temporada: () => TEMP_FICHA,
  });
  cargarFicha();
}
