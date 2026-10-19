// Utilidades puras del calendario de jornadas.
//
// Expone window.EOFCalUtil con:
//   - fechaHoraPartido(p)             -> { dia: "YYYY-MM-DD"|null, hora: "HH:MM"|null }
//   - estadoPartidoPendiente(p)       -> true si aún no se ha jugado del todo
//   - estadoJornada(partidos)         -> "vivo" | "completa" | "parcial" | "pendiente"
//   - resumenJornada(partidos, opts)  -> { total, jugados, enVivo, pendientes, goles, desde, hasta, ... }
//   - formatRango(desde, hasta)       -> "13–15 sep" | "29 sep – 1 oct" | ""
//   - ordenarPorDia(partidos)         -> copia ordenada por día, hora y local (sin fecha al final)
//   - agruparPorDia(partidos)         -> [{ dia, partidos }] (el grupo sin fecha, al final)
//   - etiquetaDia(dia, hoy)           -> "Sábado 13 de septiembre"
//   - balanceEquipo(partidos, equipo) -> { pj, g, e, p, gf, gc }
//   - resultadoEquipo(p, equipo)      -> "g" | "e" | "p" | ""
//   - leerHash(texto)                 -> { comp, grupo, j, equipo, temp }
//   - escribirHash(estado)            -> "#comp=...&j=3"
//
// Es un módulo sin dependencias del DOM para poder probarlo en Node (ver
// tests-calendario/calendario-util.test.mjs). Las reglas de fecha son las de
// fechaHoraPartido() que antes vivía en calendario.html:
//   "YYYY-MM-DD"        -> solo día.
//   "YYYY-MM-DDTHH:MM"  -> día y hora de España tal cual se escribieron.
//   cualquier otro      -> instante UTC pasado a España (solo se usa el día).
(function () {
  "use strict";

  var PENDIENTES = { programado: 1, retrasado: 1, en_juego: 1, anulado: 1 };
  var MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  function fechaHoraPartido(p) {
    var raw = p && p.fecha_partido ? String(p.fecha_partido).trim() : "";
    if (!raw) return { dia: null, hora: null };
    var m = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (m) return { dia: m[1], hora: null };
    m = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
    if (m) return { dia: m[1], hora: m[2] + ":" + m[3] };
    var conT = raw.replace(" ", "T");
    var d = new Date(/Z$|[+-]\d\d:\d\d$/.test(conT) ? conT : conT + "Z");
    if (isNaN(d)) return { dia: null, hora: null };
    var dia;
    try { dia = d.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }); }
    catch (e) { dia = d.toISOString().slice(0, 10); }
    return { dia: dia, hora: null };
  }

  function estadoPartidoPendiente(p) {
    return !!(p && PENDIENTES[p.estado]);
  }

  // Estado agregado de una jornada para pintar su chip en la tira.
  function estadoJornada(partidos) {
    if (!partidos || !partidos.length) return "pendiente";
    var pend = 0, vivo = 0;
    partidos.forEach(function (p) {
      if (p.estado === "en_juego") vivo++;
      if (estadoPartidoPendiente(p)) pend++;
    });
    if (vivo) return "vivo";
    if (pend === 0) return "completa";
    if (pend === partidos.length) return "pendiente";
    return "parcial";
  }

  function golesNumericos(p) {
    var gl = Number(p.goles_local), gv = Number(p.goles_visitante);
    if (p.goles_local == null || p.goles_visitante == null || isNaN(gl) || isNaN(gv)) return null;
    return { gl: gl, gv: gv };
  }

  // opts.esValido(p): permite excluir finalizados "sin cubrir" (su marcador es
  // provisional y no debe contar en estadísticas).
  function resumenJornada(partidos, opts) {
    var esValido = (opts && opts.esValido) || function () { return true; };
    var r = { total: 0, jugados: 0, enVivo: 0, pendientes: 0, goles: 0, conMarcador: 0, desde: null, hasta: null, sinFecha: 0 };
    (partidos || []).forEach(function (p) {
      r.total++;
      if (p.estado === "en_juego") r.enVivo++;
      if (estadoPartidoPendiente(p)) r.pendientes++; else r.jugados++;
      if (p.estado === "finalizado" && esValido(p)) {
        var g = golesNumericos(p);
        if (g) { r.goles += g.gl + g.gv; r.conMarcador++; }
      }
      var dia = fechaHoraPartido(p).dia;
      if (!dia) { r.sinFecha++; return; }
      if (!r.desde || dia < r.desde) r.desde = dia;
      if (!r.hasta || dia > r.hasta) r.hasta = dia;
    });
    r.mediaGoles = r.conMarcador ? r.goles / r.conMarcador : null;
    r.progreso = r.total ? r.jugados / r.total : 0;
    return r;
  }

  function partesDia(dia) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia || "");
    if (!m) return null;
    return { y: +m[1], m: +m[2] - 1, d: +m[3] };
  }

  function formatRango(desde, hasta) {
    var a = partesDia(desde), b = partesDia(hasta);
    if (!a) return "";
    if (!b || desde === hasta) return a.d + " " + MESES_CORTOS[a.m];
    if (a.y === b.y && a.m === b.m) return a.d + "–" + b.d + " " + MESES_CORTOS[b.m];
    return a.d + " " + MESES_CORTOS[a.m] + " – " + b.d + " " + MESES_CORTOS[b.m];
  }

  function ordenarPorDia(partidos) {
    return (partidos || []).map(function (p) {
      var fh = fechaHoraPartido(p);
      return { p: p, k1: fh.dia || "9999-99-99", k2: fh.hora || "99:99" };
    }).sort(function (a, b) {
      if (a.k1 !== b.k1) return a.k1 < b.k1 ? -1 : 1;
      if (a.k2 !== b.k2) return a.k2 < b.k2 ? -1 : 1;
      return String(a.p.equipo_local || "").localeCompare(String(b.p.equipo_local || ""), "es");
    }).map(function (x) { return x.p; });
  }

  function agruparPorDia(partidos) {
    var grupos = [], idx = {};
    ordenarPorDia(partidos).forEach(function (p) {
      var dia = fechaHoraPartido(p).dia;
      var clave = dia || "_";
      if (!(clave in idx)) { idx[clave] = grupos.length; grupos.push({ dia: dia, partidos: [] }); }
      grupos[idx[clave]].partidos.push(p);
    });
    return grupos;
  }

  function capitalizar(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function etiquetaDia(dia, hoy) {
    var f = partesDia(dia);
    if (!f) return "Fecha por confirmar";
    var sem = DIAS[new Date(f.y, f.m, f.d).getDay()];
    var txt = capitalizar(sem) + " " + f.d + " de " + MESES[f.m];
    return dia === hoy ? "Hoy · " + txt : txt;
  }

  // Balance de un equipo con los partidos finalizados (por goles; los penaltis
  // no cambian un empate). opts.esValido excluye los "sin cubrir".
  function balanceEquipo(partidos, equipo, opts) {
    var esValido = (opts && opts.esValido) || function () { return true; };
    var b = { pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 };
    (partidos || []).forEach(function (p) {
      if (p.estado !== "finalizado" || !esValido(p)) return;
      var local = p.equipo_local === equipo, visit = p.equipo_visitante === equipo;
      if (!local && !visit) return;
      var g = golesNumericos(p);
      if (!g) return;
      var gf = local ? g.gl : g.gv, gc = local ? g.gv : g.gl;
      b.pj++; b.gf += gf; b.gc += gc;
      if (gf > gc) b.g++; else if (gf < gc) b.p++; else b.e++;
    });
    return b;
  }

  // Resultado de un equipo en un partido: "g" ganó, "e" empató, "p" perdió,
  // "" si no ha terminado, no juega o su marcador no cuenta (sin cubrir).
  function resultadoEquipo(p, equipo, opts) {
    var esValido = (opts && opts.esValido) || function () { return true; };
    if (!p || p.estado !== "finalizado" || !esValido(p)) return "";
    var local = p.equipo_local === equipo, visit = p.equipo_visitante === equipo;
    if (!local && !visit) return "";
    var g = golesNumericos(p);
    if (!g) return "";
    var gf = local ? g.gl : g.gv, gc = local ? g.gv : g.gl;
    return gf > gc ? "g" : gf < gc ? "p" : "e";
  }

  // Estado del calendario en la URL (hash), para poder compartir/recuperar
  // una jornada concreta. "j" es la posición visible (1ª, 2ª, 3ª…), no el
  // número interno de la BD, porque es lo que ve la persona.
  function leerHash(texto) {
    var s = String(texto || "").replace(/^#/, "");
    var out = { comp: "", grupo: "", j: null, equipo: "", temp: false };
    if (!s) return out;
    var params;
    try { params = new URLSearchParams(s); } catch (e) { return out; }
    out.comp = params.get("comp") || "";
    out.grupo = params.get("grupo") || "";
    out.equipo = params.get("equipo") || "";
    out.temp = params.get("temp") === "1";
    var j = parseInt(params.get("j"), 10);
    out.j = isFinite(j) && j > 0 ? j : null;
    return out;
  }

  function escribirHash(e) {
    var params = new URLSearchParams();
    if (e.comp) params.set("comp", e.comp);
    if (e.grupo) params.set("grupo", e.grupo);
    if (e.equipo) params.set("equipo", e.equipo);
    if (e.temp && e.equipo) params.set("temp", "1");
    else if (e.j) params.set("j", String(e.j));
    var s = params.toString();
    return s ? "#" + s : "";
  }

  var api = {
    fechaHoraPartido: fechaHoraPartido,
    estadoPartidoPendiente: estadoPartidoPendiente,
    estadoJornada: estadoJornada,
    resumenJornada: resumenJornada,
    formatRango: formatRango,
    ordenarPorDia: ordenarPorDia,
    agruparPorDia: agruparPorDia,
    etiquetaDia: etiquetaDia,
    balanceEquipo: balanceEquipo,
    resultadoEquipo: resultadoEquipo,
    leerHash: leerHash,
    escribirHash: escribirHash
  };
  if (typeof window !== "undefined") window.EOFCalUtil = api;
})();
