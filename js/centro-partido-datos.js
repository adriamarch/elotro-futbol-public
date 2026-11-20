/* Centro de partido · fase 2 · lógica pura (sin DOM ni red)
 * Clasificación del grupo, forma reciente y cara a cara, calculados con los
 * resultados que ya sirve /api/results. Se carga en el navegador (window.EOFCentro)
 * y también se puede importar desde Node para los tests. */
(function (raiz) {
  "use strict";

  // Competiciones con tabla de liga (las demás son copas o amistosos).
  const COMPETICIONES_CON_TABLA = ["hypermotion", "primera_federacion", "segunda_federacion"];

  const tieneGoles = (p) =>
    p && p.goles_local != null && p.goles_visitante != null &&
    Number.isFinite(Number(p.goles_local)) && Number.isFinite(Number(p.goles_visitante));

  const esJugado = (p) => !!p && p.estado === "finalizado" && tieneGoles(p);

  // "YYYY-MM-DD HH:MM" o "YYYY-MM-DDTHH:MM" → clave comparable. Sin fecha → "".
  function claveFecha(p) {
    return String((p && p.fecha_partido) || "").replace(" ", "T").slice(0, 16);
  }

  function tieneTabla(competicion) {
    return COMPETICIONES_CON_TABLA.includes(competicion);
  }

  // Misma regla que /clasificacion: 3 puntos por victoria, 1 por empate; los partidos
  // en juego cuentan como provisionales con el marcador actual.
  function calcularClasificacion(partidos) {
    const tabla = {};
    const fila = (equipo) => (tabla[equipo] ||= {
      equipo, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0, escudoUrl: null, enVivo: false,
    });
    for (const p of partidos || []) {
      if (p.estado !== "finalizado" && p.estado !== "en_juego") continue;
      if (!tieneGoles(p)) continue;
      const gl = Number(p.goles_local), gv = Number(p.goles_visitante);
      const l = fila(p.equipo_local), v = fila(p.equipo_visitante);
      if (!l.escudoUrl && p.escudo_local_url) l.escudoUrl = p.escudo_local_url;
      if (!v.escudoUrl && p.escudo_visitante_url) v.escudoUrl = p.escudo_visitante_url;
      if (p.estado === "en_juego") { l.enVivo = true; v.enVivo = true; }
      l.pj++; v.pj++;
      l.gf += gl; l.gc += gv; v.gf += gv; v.gc += gl;
      if (gl > gv) { l.pg++; l.pts += 3; v.pp++; }
      else if (gl < gv) { v.pg++; v.pts += 3; l.pp++; }
      else { l.pe++; v.pe++; l.pts++; v.pts++; }
    }
    return Object.values(tabla).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      const dga = a.gf - a.gc, dgb = b.gf - b.gc;
      if (dgb !== dga) return dgb - dga;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.equipo.localeCompare(b.equipo, "es");
    });
  }

  // Zonas orientativas por posición (idéntico criterio al de /clasificacion).
  function zonaParaPosicion(competicion, pos, total) {
    if (competicion === "hypermotion") {
      if (pos <= 2) return "ascenso";
      if (pos <= 6) return "playoff";
      if (pos > total - 4) return "descenso";
    } else if (competicion === "primera_federacion") {
      if (pos === 1) return "ascenso";
      if (pos <= 5) return "playoff";
      if (pos > total - 5) return "descenso";
    } else {
      if (pos === 1) return "ascenso";
      if (pos <= 5) return "playoff";
      if (pos > total - 5) return "descenso";
      if (pos === total - 5) return "playout";
    }
    return "";
  }

  // Resultado de un partido visto desde un equipo.
  function vistaEquipo(p, equipo) {
    const local = p.equipo_local === equipo;
    const gf = Number(local ? p.goles_local : p.goles_visitante);
    const gc = Number(local ? p.goles_visitante : p.goles_local);
    return {
      id: p.id,
      res: gf > gc ? "V" : gf < gc ? "D" : "E",
      gf, gc, local,
      rival: local ? p.equipo_visitante : p.equipo_local,
      rivalEscudo: local ? p.escudo_visitante_url : p.escudo_local_url,
      fecha: p.fecha_partido || null,
      competicion: p.competicion || "",
      jornada: p.jornada_mostrar ?? p.jornada ?? null,
    };
  }

  // Últimos n partidos jugados de un equipo (más reciente primero). Si se da `antesDe`
  // (fecha del partido que se está viendo) solo cuentan los anteriores a esa fecha,
  // así la forma de un partido ya finalizado es la que tenían antes de jugarlo.
  function formaReciente(partidos, equipo, { excluirId = null, antesDe = "", n = 5 } = {}) {
    const lim = String(antesDe || "").replace(" ", "T").slice(0, 16);
    return (partidos || [])
      .filter((p) => esJugado(p) && (p.equipo_local === equipo || p.equipo_visitante === equipo))
      .filter((p) => excluirId == null || Number(p.id) !== Number(excluirId))
      .filter((p) => !lim || (claveFecha(p) && claveFecha(p) < lim))
      .sort((a, b) => claveFecha(b).localeCompare(claveFecha(a)))
      .slice(0, n)
      .map((p) => vistaEquipo(p, equipo));
  }

  // Cara a cara entre dos equipos, desde el punto de vista de `a` (local del partido).
  function caraACara(partidos, a, b, { excluirId = null, antesDe = "", n = 5 } = {}) {
    const lim = String(antesDe || "").replace(" ", "T").slice(0, 16);
    const duelos = (partidos || [])
      .filter((p) => esJugado(p) &&
        ((p.equipo_local === a && p.equipo_visitante === b) || (p.equipo_local === b && p.equipo_visitante === a)))
      .filter((p) => excluirId == null || Number(p.id) !== Number(excluirId))
      .filter((p) => !lim || (claveFecha(p) && claveFecha(p) < lim))
      .sort((x, y) => claveFecha(y).localeCompare(claveFecha(x)));
    const resumen = { total: duelos.length, a: 0, e: 0, b: 0, golesA: 0, golesB: 0, desde: "", ultimos: [] };
    for (const p of duelos) {
      const v = vistaEquipo(p, a);
      if (v.res === "V") resumen.a++; else if (v.res === "D") resumen.b++; else resumen.e++;
      resumen.golesA += v.gf; resumen.golesB += v.gc;
    }
    const fechas = duelos.map((p) => String(p.fecha_partido || "").slice(0, 10)).filter(Boolean).sort();
    resumen.desde = fechas[0] || "";
    resumen.ultimos = duelos.slice(0, n).map((p) => vistaEquipo(p, a));
    return resumen;
  }

  // Puesto de un equipo en la tabla ya calculada (calcularClasificacion). null si aún no ha jugado.
  function puestoEnTabla(tabla, equipo) {
    const i = (tabla || []).findIndex((f) => f.equipo === equipo);
    if (i < 0) return null;
    const f = tabla[i];
    return { pos: i + 1, total: tabla.length, pts: f.pts, pj: f.pj, dg: f.gf - f.gc };
  }

  // Temporada (1 jul → 30 jun) a la que pertenece una fecha "YYYY-MM-DD…". Sin fecha, la actual.
  function temporadaDe(fecha, ahora) {
    const hoy = ahora instanceof Date ? ahora : new Date();
    const str = String(fecha || "");
    const y = /^\d{4}-\d{2}/.test(str) ? parseInt(str.slice(0, 4), 10) : hoy.getFullYear();
    const m = /^\d{4}-\d{2}/.test(str) ? parseInt(str.slice(5, 7), 10) : hoy.getMonth() + 1;
    const ini = m >= 7 ? y : y - 1;
    const iniHoy = hoy.getMonth() + 1 >= 7 ? hoy.getFullYear() : hoy.getFullYear() - 1;
    return {
      desde: `${ini}-07-01`, hasta: `${ini + 1}-07-01`, actual: ini === iniHoy,
      etiqueta: `${ini}/${String(ini + 1).slice(2)}`,
    };
  }

  // Deja solo los partidos de esa temporada (los que no tienen fecha, solo si es la actual).
  function delTemporada(partidos, temp) {
    return (partidos || []).filter((p) => {
      const f = String(p.fecha_partido || "").slice(0, 10);
      if (!f) return temp.actual;
      return f >= temp.desde && f < temp.hasta;
    });
  }

  // Sustituye en la lista la fila del partido abierto por la versión que la página
  // ya tiene al día (marcador y estado en directo), para que todo cuadre con la cabecera.
  function conPartidoActual(lista, actual) {
    if (!actual || actual.id == null) return lista || [];
    const base = (lista || []).filter((p) => Number(p.id) !== Number(actual.id));
    base.push(actual);
    return base;
  }

  const api = {
    COMPETICIONES_CON_TABLA, tieneTabla, calcularClasificacion, zonaParaPosicion,
    formaReciente, caraACara, puestoEnTabla, conPartidoActual, esJugado, temporadaDe, delTemporada,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.EOFCentro = api;
})(typeof window !== "undefined" ? window : globalThis);
