// Plantilla completa del club desde LaPreferente (/plantilla).
// Datos estáticos en /data/jugadores/{slug-del-club}.json, que genera
// herramientas/lapreferente/lapreferente.py (workflow «Actualizar jugadores»).
// Van en su propia tabla, con la fuente a la vista: NO se mezclan con lo que
// calcula la redacción con el minuto a minuto. Si un jugador de la redacción
// se reconoce de forma inequívoca en la plantilla, su nombre enlaza a su ficha.

const LP_PLURAL_POSICION = {
  Portero: "Porteros",
  Defensa: "Defensas",
  Centrocampista: "Centrocampistas",
  Delantero: "Delanteros",
};
const LP_ORDEN_POSICION = ["Portero", "Defensa", "Centrocampista", "Delantero"];
const LP_CACHE = { slug: null, doc: null };

function lpNormalizar(t) {
  return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function lpTokens(t) { const n = lpNormalizar(t); return n ? n.split(" ") : []; }
// ¿Todos los tokens de «corto» están en «largo»? Una inicial suelta vale para
// cualquier token que empiece por esa letra (misma regla que la ficha del jugador).
function lpContenidos(corto, largo) {
  return corto.length > 0 && corto.every((t) => largo.some((l) => l === t || (t.length === 1 && l.startsWith(t))));
}
// Devuelve el jugador de LaPreferente SOLO si la coincidencia es inequívoca.
function lpBuscar(jugadoresLP, nombre) {
  const buscado = lpTokens(nombre);
  if (!buscado.length) return null;
  const cands = (jugadoresLP || []).filter((p) => lpContenidos(buscado, lpTokens(`${p.alias || ""} ${p.nombre || ""}`)));
  if (cands.length === 1) return cands[0];
  if (cands.length > 1) {
    const n = lpNormalizar(nombre);
    const exactos = cands.filter((p) => lpNormalizar(p.alias) === n || lpNormalizar(p.nombre) === n);
    return exactos.length === 1 ? exactos[0] : null;
  }
  return null;
}

// Mapa id de LaPreferente -> jugador de la redacción. Si dos jugadores de la
// redacción caen en el mismo de LaPreferente, es ambiguo y no se enlaza ninguno.
function lpEmparejar(jugadoresLP, jugadoresRed) {
  const mapa = new Map();
  (jugadoresRed || []).forEach((j) => {
    if (!j || j.sin_nombre || !j.jugador) return;
    const p = lpBuscar(jugadoresLP, j.jugador);
    if (!p) return;
    mapa.set(p.id, mapa.has(p.id) ? null : j);
  });
  for (const [id, j] of [...mapa]) if (!j) mapa.delete(id);
  return mapa;
}

// Carga el JSON del club. Devuelve null si no existe o no tiene jugadores
// (la sección es opcional: sin datos, la plantilla se ve como siempre).
async function lpCargarPlantilla(club) {
  const slug = slugEquipo(club);
  if (LP_CACHE.slug === slug) return LP_CACHE.doc;
  let doc = null;
  try {
    const res = await fetch(`${baseHref()}data/jugadores/${slug}.json`);
    if (res.ok && /json/i.test(res.headers.get("Content-Type") || "")) {
      const d = await res.json();
      if (d && Array.isArray(d.jugadores) && d.jugadores.length) doc = d;
    }
  } catch (e) { /* opcional */ }
  LP_CACHE.slug = slug;
  LP_CACHE.doc = doc;
  return doc;
}

function lpNum(v) { return v === null || v === undefined ? "—" : v; }

function lpFila(p, red, fichaHref) {
  const nombre = escapeHtml(p.alias || p.nombre || "—");
  const detalle = [p.nombre && p.alias && p.nombre !== p.alias ? p.nombre : "", p.demarcacion]
    .filter(Boolean).map(escapeHtml).join(" · ");
  const celdaNombre = red
    ? `<a class="stats-jugador-nombre" href="${fichaHref(red)}" title="Ver su ficha con estadísticas de la redacción">${nombre}</a>`
    : `<span class="lp-nombre">${nombre}</span>`;
  const portero = p.posicion === "Portero";
  const goles = portero
    ? `<span class="lp-enc" title="Goles encajados">${lpNum(p.encajados)}<small> enc.</small></span>`
    : lpNum(p.goles);
  return `
    <tr>
      <td class="col-jugador">${celdaNombre}${detalle ? `<small>${detalle}</small>` : ""}</td>
      <td class="num">${p.edad ? lpNum(p.edad) : "—"}</td>
      <td class="num">${lpNum(p.pj)}</td><td class="num">${lpNum(p.pt)}</td>
      <td class="num">${p.min === null || p.min === undefined ? "—" : Number(p.min).toLocaleString("es-ES")}</td>
      <td class="num col-puntos">${goles}</td>
      <td class="num">${lpNum(p.ta)}</td><td class="num">${lpNum(p.tr)}</td>
    </tr>`;
}

// HTML de la sección. «fichaHref» es la función de plantilla.js que construye el enlace a la ficha.
function lpHtmlPlantilla(doc, jugadoresRed, fichaHref) {
  if (!doc) return "";
  const emparejados = lpEmparejar(doc.jugadores, jugadoresRed);
  const grupos = new Map();
  doc.jugadores.forEach((p) => {
    const clave = LP_PLURAL_POSICION[p.posicion] ? p.posicion : "otros";
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(p);
  });
  const claves = [...LP_ORDEN_POSICION.filter((k) => grupos.has(k)), ...(grupos.has("otros") ? ["otros"] : [])];
  const cuerpo = claves.map((k) => {
    const lista = grupos.get(k).sort((a, b) =>
      (b.pj || 0) - (a.pj || 0) || (b.min || 0) - (a.min || 0) ||
      String(a.alias || a.nombre).localeCompare(String(b.alias || b.nombre), "es"));
    const titulo = k === "otros" ? "Otros" : LP_PLURAL_POSICION[k];
    return `<tr class="plantilla-lp-grupo"><th colspan="8" scope="colgroup">${titulo} (${lista.length})</th></tr>`
      + lista.map((p) => lpFila(p, emparejados.get(p.id) || null, fichaHref)).join("");
  }).join("");
  const fecha = doc.actualizado ? ` Actualizado el ${escapeHtml(String(doc.actualizado).split("-").reverse().join("/"))}.` : "";
  const urlOk = typeof doc.fuente_url === "string" && doc.fuente_url.startsWith("https://www.lapreferente.com/");
  const enlace = urlOk ? ` <a href="${escapeHtml(doc.fuente_url)}" target="_blank" rel="noopener nofollow">Ver plantilla en LaPreferente ↗</a>` : "";
  return `
    <section class="plantilla-lp" aria-label="Plantilla completa del club">
      <h2 class="plantilla-lp-titulo">Plantilla completa ${escapeHtml(doc.temporada || "")} <span class="ficha-externo-etiqueta">Fuente externa</span></h2>
      <p class="plantilla-lp-meta">${doc.jugadores.length} jugadores. Datos no oficiales de ${escapeHtml(doc.fuente || "una fuente externa")}; suman todas las competiciones del club y pueden diferir de las cifras de la redacción.${fecha}${enlace}</p>
      <div class="clasificacion-tabla-wrap">
        <table class="clasificacion-tabla stats-tabla plantilla-lp-tabla">
          <thead><tr>
            <th class="col-equipo col-jugador">Jugador</th>
            <th class="num" title="Edad">Edad</th>
            <th class="num" title="Partidos jugados">PJ</th>
            <th class="num" title="Partidos de titular">Tit.</th>
            <th class="num" title="Minutos jugados">Min.</th>
            <th class="num" title="Goles (en porteros, goles encajados)">G</th>
            <th class="num" title="Tarjetas amarillas">🟨</th>
            <th class="num" title="Tarjetas rojas">🟥</th>
          </tr></thead>
          <tbody>${cuerpo}</tbody>
        </table>
      </div>
    </section>`;
}
