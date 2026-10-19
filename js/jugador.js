// Ficha de jugador. Los datos salen de GET /api/stats/jugador (calculados
// con el minuto a minuto y las alineaciones), igual que los tops de
// /estadisticas, así que se actualiza sola con cada partido.
const COMPETICIONES_FICHA = {
  hypermotion: "LaLiga Hypermotion",
  primera_federacion: "Primera Federación",
  segunda_federacion: "Segunda Federación",
};
const PARAMS_FICHA = new URLSearchParams(location.search);
const COMP_FICHA = COMPETICIONES_FICHA[PARAMS_FICHA.get("c")] ? PARAMS_FICHA.get("c") : "";
const SLUG_FICHA = (PARAMS_FICHA.get("j") || "").slice(0, 160);
const TIPO_VUELTA = PARAMS_FICHA.get("t") || "goleadores";
const contFicha = document.getElementById("fichaCont");
// ?temp=todas: la ficha se abre con el histórico acumulado (viene de los tops o del buscador con ese filtro).
const TEMP_FICHA = PARAMS_FICHA.get("temp") === "todas" ? "todas" : "";
const SUFIJO_TEMP = TEMP_FICHA ? "&temp=todas" : "";

// Dirección canónica: solo competición y jugador, sin t (pestaña de vuelta) ni temp.
function rutaCanonicaFicha(slug) {
  return COMP_FICHA && slug ? `/jugador?c=${encodeURIComponent(COMP_FICHA)}&j=${encodeURIComponent(slug)}` : "/jugador";
}

fijarSeoBasico({
  titulo: "Ficha de jugador — ELOTROFÚTBOLTV",
  descripcion: "Ficha de jugador: goles, asistencias, tarjetas y partidos de la temporada, calculados con el minuto a minuto.",
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

function fechaCorta(f) {
  if (!f) return "";
  const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
}

function minutoTexto(e) {
  if (e.minuto === null || e.minuto === undefined) return "";
  return `${e.minuto}${e.extra ? "+" + e.extra : ""}'`;
}

const ICONO_EVENTO = { gol: "⚽", asistencia: "🅰️", amarilla: "🟨", doble_amarilla: "🟨🟥", roja: "🟥" };
const TITULO_EVENTO = { gol: "Gol", asistencia: "Asistencia", amarilla: "Tarjeta amarilla", doble_amarilla: "Expulsión por doble amarilla", roja: "Tarjeta roja" };

function chipPuesto(texto, pos) {
  const clase = pos === 1 ? "oro" : pos <= 3 ? "podio" : "top";
  return `<span class="ficha-chip ficha-chip-${clase}">${texto}</span>`;
}

function chipsPosiciones(d) {
  const nombreGrupo = d.grupo ? ` del ${escapeHtml(d.grupo)}` : "";
  const defs = [
    ["goleadores", "goleador"],
    ["asistentes", "asistente"],
    ["participacion", "en goles + asistencias"],
    ["tarjetas", "en tarjetas"],
    ["mvps", "en MVP de partido"],
    ["mas_partidos", "en partidos jugados"],
  ];
  const chips = [];
  defs.forEach(([k, et]) => {
    const p = d.posiciones && d.posiciones[k];
    if (!p || p.pos > 10) return; // solo se destaca estar en el top 10
    const txt = k === "participacion" || k === "tarjetas"
      ? `${p.pos}º ${et}${nombreGrupo}`
      : `${p.pos}º ${et}${nombreGrupo}`;
    chips.push(chipPuesto("🏅 " + txt, p.pos));
  });
  return chips.join("");
}

function tarjetaDato(valor, etiqueta, extra = "") {
  return `<div class="ficha-dato${extra ? " " + extra : ""}"><span class="ficha-dato-valor">${valor}</span><span class="ficha-dato-etiqueta">${etiqueta}</span></div>`;
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
          <div class="ficha-tramo">
            <span class="ficha-tramo-num">${t.goles}</span>
            <div class="ficha-tramo-barra"><span style="height:${Math.round((t.goles / max) * 100)}%"></span></div>
            <span class="ficha-tramo-et">${t.tramo}'</span>
          </div>`).join("")}
      </div>
    </section>`;
}

function filaPartido(p) {
  const rival = p.rival
    ? `<a class="equipo-enlace ficha-rival" href="${enlaceEquipoHref(p.rival, COMP_FICHA)}"><img class="clas-escudo" src="${getEscudoUrl(p.rival, p.escudo_rival)}" alt="" loading="lazy" onerror="manejarErrorEscudo(this);"><span>${p.local ? "" : "@ "}${escapeHtml(p.rival)}</span></a>`
    : "—";
  const marcador = p.resultado
    ? `<span class="ficha-res ficha-res-${p.resultado}" title="${p.resultado === "V" ? "Victoria" : p.resultado === "D" ? "Derrota" : "Empate"}">${p.goles_favor}-${p.goles_contra}</span>`
    : "—";
  const rol = p.rol === "titular" ? "Titular" : p.rol === "suplente" ? "Suplente" : "";
  const ev = p.eventos.length
    ? p.eventos.map((e) => `<span class="ficha-ev" title="${TITULO_EVENTO[e.tipo] || ""}">${ICONO_EVENTO[e.tipo] || ""} ${minutoTexto(e)}</span>`).join("")
    : `<span class="ficha-sin-ev">${rol ? "Sin incidencias" : "—"}</span>`;
  return `
    <tr>
      <td class="col-jor">${p.jornada !== null ? "J" + p.jornada : ""}<small>${fechaCorta(p.fecha)}</small></td>
      <td class="col-rival">${rival}</td>
      <td class="col-res">${marcador}</td>
      <td class="col-rol">${rol}${p.mvp ? ` <span class="ficha-mvp" title="MVP del partido">⭐ MVP</span>` : ""}</td>
      <td class="col-ev">${ev}</td>
    </tr>`;
}

// ---------- Bloque aparte: estadísticas de temporada de una fuente externa ----------
// Datos estáticos en /data/jugadores/{slug-del-club}.json (los genera
// herramientas/lapreferente/lapreferente.py). NO se mezclan con las cifras
// calculadas por la redacción: van en su propio bloque, con la fuente a la vista.
function normNombreExt(t) {
  return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokensExt(t) { const n = normNombreExt(t); return n ? n.split(" ") : []; }
// ¿Todos los tokens de "corto" están en "largo"? Una inicial suelta vale para
// cualquier token que empiece por esa letra (misma regla que statsTokensContenidos del worker).
function tokensContenidosExt(corto, largo) {
  return corto.length > 0 && corto.every((t) => largo.some((l) => l === t || (t.length === 1 && l.startsWith(t))));
}
// Devuelve el jugador SOLO si la coincidencia es inequívoca; ante la duda, null
// (mejor no mostrar nada que mostrar los datos de otra persona).
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

function numExt(v) { return v === null || v === undefined ? "—" : v; }

function htmlExterno(p, doc) {
  const portero = p.posicion === "Portero";
  const datos = [
    tarjetaDato(numExt(p.pj), "Partidos", "destacado"),
    tarjetaDato(numExt(p.pt), "Titular"),
    tarjetaDato(p.min === null || p.min === undefined ? "—" : Number(p.min).toLocaleString("es-ES"), "Minutos"),
    portero ? tarjetaDato(numExt(p.encajados), "Goles encajados") : tarjetaDato(numExt(p.goles), "Goles"),
    tarjetaDato(numExt(p.ta), "🟨 Amarillas"),
    tarjetaDato(numExt(p.tr), "🟥 Rojas"),
  ];
  const meta = [p.nombre, p.demarcacion || p.posicion, p.edad ? `${p.edad} años` : ""].filter(Boolean).map(escapeHtml).join(" · ");
  const urlOk = typeof p.url === "string" && p.url.startsWith("https://www.lapreferente.com/");
  const enlace = urlOk ? ` · <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener nofollow">Ver ficha en LaPreferente ↗</a>` : "";
  return `
    <section class="ficha-bloque ficha-externo" aria-label="Estadísticas de fuente externa">
      <h2 class="ficha-titulo">Temporada ${escapeHtml(doc.temporada || "")} <span class="ficha-externo-etiqueta">Fuente externa</span></h2>
      <p class="ficha-externo-meta">${meta}</p>
      <div class="ficha-datos">${datos.join("")}</div>
      <p class="ficha-externo-fuente">Datos no oficiales de ${escapeHtml(doc.fuente || "una fuente externa")}, actualizados el ${fechaCorta(doc.actualizado)}${enlace}.
        Incluyen todas las competiciones del club y pueden diferir de las estadísticas calculadas por la redacción.</p>
    </section>`;
}

async function cargarExterno(j) {
  const cont = document.getElementById("fichaExterno");
  if (!cont || !j || j.sin_nombre || !j.club || !j.nombre) return;
  try {
    const res = await fetch(`${baseHref()}data/jugadores/${slugEquipo(j.club)}.json`);
    if (!res.ok || !/json/i.test(res.headers.get("Content-Type") || "")) return;
    const doc = await res.json();
    const p = buscarJugadorExterno(doc.jugadores, j.nombre);
    if (p) cont.innerHTML = htmlExterno(p, doc);
  } catch (e) { /* bloque opcional: si falla, la ficha se ve igual */ }
}

function pintarFicha(d) {
  const j = d.jugador;
  const t = d.totales;
  const nombre = j.sin_nombre ? `Dorsal ${j.dorsal}` : j.nombre;
  const compNombre = COMPETICIONES_FICHA[d.competicion] || "";
  fijarSeoBasico({
    titulo: `${nombre} (${j.club}) — estadísticas y ficha — ELOTROFÚTBOLTV`,
    descripcion: `${nombre}, ${j.club}: ${t.goles} gol${t.goles === 1 ? "" : "es"}, ${t.asistencias} asistencia${t.asistencias === 1 ? "" : "s"} y ${t.tarjetas} tarjeta${t.tarjetas === 1 ? "" : "s"} ${TEMP_FICHA ? "en el histórico acumulado" : "esta temporada"}${compNombre ? " en " + compNombre : ""}.`,
    urlPath: rutaCanonicaFicha(j.slug),
    noindex: !!TEMP_FICHA || !!j.sin_nombre,
  });

  const dorsal = j.dorsal !== null && j.dorsal !== undefined ? `<span class="ficha-dorsal" title="Dorsal">${j.dorsal}</span>` : "";
  const partidos = d.partidos || [];
  const alineaciones = t.titular + t.suplente;
  const datos = [
    tarjetaDato(t.goles, "Goles", "destacado"),
    tarjetaDato(t.asistencias, "Asistencias", "destacado"),
    tarjetaDato(t.participacion, "Goles + asist."),
    tarjetaDato(t.amarillas, "🟨 Amarillas"),
    tarjetaDato(t.dobles + t.rojas, "🟥 Expulsiones"),
    tarjetaDato(t.partidos_registrados, "Partidos con datos"),
  ];
  if (t.mvps) datos.push(tarjetaDato(t.mvps, "⭐ MVP"));
  if (alineaciones) datos.push(tarjetaDato(`${t.titular}<small>/${t.suplente}</small>`, "Titular / suplente"));

  contFicha.innerHTML = `
    <nav class="ficha-migas" aria-label="Migas de pan">
      <a href="${enlaceVolverEstadisticas()}">← Estadísticas</a>
      ${compNombre ? `<span>·</span><span>${escapeHtml(compNombre)}</span>` : ""}
      ${d.grupo ? `<span>·</span><span>${escapeHtml(d.grupo)}</span>` : ""}
    </nav>

    <header class="ficha-cabecera"${j.dorsal !== null && j.dorsal !== undefined ? ` data-dorsal="${escapeHtml(String(j.dorsal))}"` : ""}>
      <div class="ficha-escudo-wrap">
        <img class="ficha-escudo" src="${getEscudoUrl(j.club, j.escudo_url)}" alt="Escudo de ${escapeHtml(j.club)}" onerror="manejarErrorEscudo(this);">
      </div>
      <div class="ficha-ident">
        <h1 class="ficha-nombre">${dorsal}<span>${escapeHtml(nombre)}</span></h1>
        <a class="ficha-club" href="${baseHref()}plantilla?c=${encodeURIComponent(d.competicion)}&club=${encodeURIComponent(j.club)}${SUFIJO_TEMP}" title="Ver la plantilla de ${escapeHtml(j.club)}">${escapeHtml(j.club)}</a>
        <div class="ficha-chips">${chipsPosiciones(d)}</div>
      </div>
    </header>

    <section class="ficha-datos" aria-label="Resumen de la temporada">${datos.join("")}</section>

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
      <h2 class="ficha-titulo">Más jugadores de ${escapeHtml(j.club)} <a class="ficha-ver-plantilla" href="${baseHref()}plantilla?c=${encodeURIComponent(d.competicion)}&club=${encodeURIComponent(j.club)}${SUFIJO_TEMP}">Ver plantilla completa →</a></h2>
      <div class="ficha-companeros">
        ${d.companeros.map((c) => `
          <a class="ficha-companero" href="${baseHref()}jugador?c=${encodeURIComponent(d.competicion)}&j=${encodeURIComponent(c.slug)}&t=${encodeURIComponent(TIPO_VUELTA)}${SUFIJO_TEMP}">
            ${c.dorsal !== null && c.dorsal !== undefined ? `<span class="stats-dorsal">${c.dorsal}</span>` : ""}
            <span class="ficha-companero-nombre">${escapeHtml(c.jugador)}</span>
            <span class="ficha-companero-datos">⚽ ${c.goles} · 🅰️ ${c.asistencias}</span>
          </a>`).join("")}
      </div>
    </section>` : ""}

    <p class="stats-nota">${TEMP_FICHA ? "Histórico acumulado" : "Temporada en curso"}. Datos calculados automáticamente con el minuto a minuto y las alineaciones de los partidos cubiertos por la redacción; solo cuentan los partidos registrados.</p>`;
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

// Buscador de jugadores y clubes (Fase 3): busca en la competición de esta ficha.
iniciarBuscadorJugadores({
  contenedor: document.getElementById("buscadorJugadores"),
  competicion: () => COMP_FICHA,
  temporada: () => TEMP_FICHA,
});

cargarFicha();
