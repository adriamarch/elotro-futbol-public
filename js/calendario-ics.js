// Exportar partidos a un archivo .ics ("Añadir a mi calendario").
//
// Expone window.EOFCalendarioICS con:
//   - construirICS(partidos, { nombre })  -> { ics, incluidos, sinFecha }
//   - nombreArchivo(texto)                -> "elotrofutbol-<slug>.ics"
//   - descargar(ics, nombreArchivo)       -> dispara la descarga en el navegador
//
// Es un módulo puro (no toca el DOM salvo en descargar()), para poder
// probarlo en Node (ver tests-calendario/calendario-ics.test.mjs).
//
// Reglas de fecha: iguales a fechaHoraPartido() de calendario.html.
//   "YYYY-MM-DD"        -> evento de día completo ("hora por confirmar").
//   "YYYY-MM-DDTHH:MM"  -> hora de España tal cual se escribió (Europe/Madrid).
//   cualquier otro      -> instante UTC pasado a España; como el sitio solo usa
//                          el día en ese caso, aquí también va de día completo.
// Solo se exportan partidos pendientes (programado / retrasado / en_juego);
// los ya jugados o anulados no tienen sentido en una agenda.
(function () {
  "use strict";

  var DURACION_MIN = 120;      // un partido + descanso, de sobra para la agenda
  var AVISO_MIN = 60;          // recordatorio una hora antes
  var DOMINIO_UID = "elotrofutbol.media";
  var URL_CALENDARIO = "https://elotrofutbol.media/calendario";
  var ESTADOS_PENDIENTES = { programado: 1, retrasado: 1, en_juego: 1 };

  var VTIMEZONE_MADRID = [
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Madrid",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE"
  ];

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // Escapado de TEXT según RFC 5545: \ ; , y saltos de línea.
  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  // Las líneas de un .ics no pueden pasar de 75 octetos: se parten (por
  // octetos UTF-8, sin cortar un carácter por la mitad) y las continuaciones
  // empiezan por un espacio.
  function octetos(cp) { return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; }
  function plegar(linea) {
    var salida = [];
    var actual = "";
    var usados = 0;
    var limite = 75;
    for (var ch of linea) {
      var n = octetos(ch.codePointAt(0));
      if (usados + n > limite) {
        salida.push(actual);
        actual = " ";
        usados = 1;
        limite = 75;
      }
      actual += ch;
      usados += n;
    }
    salida.push(actual);
    return salida.join("\r\n");
  }

  // { dia: "YYYY-MM-DD" | null, hora: "HH:MM" | null }
  function fechaHora(p) {
    var raw = p && p.fecha_partido ? String(p.fecha_partido).trim() : "";
    if (!raw) return { dia: null, hora: null };
    var m = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (m) return { dia: m[1], hora: null };
    m = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
    if (m) return { dia: m[1], hora: m[2] + ":" + m[3] };
    var conT = raw.replace(" ", "T");
    var d = new Date(/Z$|[+-]\d\d:\d\d$/.test(conT) ? conT : conT + "Z");
    if (isNaN(d)) return { dia: null, hora: null };
    return { dia: d.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" }), hora: null };
  }

  function compacta(dia, hora) {
    return dia.replace(/-/g, "") + (hora ? "T" + hora.replace(":", "") + "00" : "");
  }

  // Suma minutos a una fecha/hora "de pared" sin pasar por zonas horarias.
  function sumarMinutos(dia, hora, minutos) {
    var d = dia.split("-").map(Number);
    var h = hora.split(":").map(Number);
    var t = new Date(Date.UTC(d[0], d[1] - 1, d[2], h[0], h[1] + minutos));
    return t.getUTCFullYear() + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate()) +
      "T" + pad(t.getUTCHours()) + pad(t.getUTCMinutes()) + "00";
  }

  function sumarDia(dia) {
    var d = dia.split("-").map(Number);
    var t = new Date(Date.UTC(d[0], d[1] - 1, d[2] + 1));
    return t.getUTCFullYear() + pad(t.getUTCMonth() + 1) + pad(t.getUTCDate());
  }

  function sello(ahora) {
    return ahora.getUTCFullYear() + pad(ahora.getUTCMonth() + 1) + pad(ahora.getUTCDate()) +
      "T" + pad(ahora.getUTCHours()) + pad(ahora.getUTCMinutes()) + pad(ahora.getUTCSeconds()) + "Z";
  }

  var COMPETICIONES = {
    hypermotion: "LaLiga Hypermotion",
    primera_federacion: "Primera Federación",
    segunda_federacion: "Segunda Federación",
    amistoso: "Amistoso"
  };

  function descripcion(p) {
    var partes = [];
    var comp = COMPETICIONES[p.competicion] || "";
    if (comp) partes.push(comp);
    if (p.competicion !== "amistoso" && (p.jornada_mostrar || p.jornada)) {
      partes.push("Jornada " + (p.jornada_mostrar || p.jornada));
    }
    if (p.grupo) partes.push(p.grupo);
    var l1 = partes.join(" · ");
    var l2 = p.estado === "retrasado" ? "Partido retrasado: comprueba la fecha en la web." : "";
    return [l1, l2, URL_CALENDARIO].filter(Boolean).join("\n");
  }

  function construirICS(partidos, opts) {
    opts = opts || {};
    var ahora = opts.ahora instanceof Date ? opts.ahora : new Date();
    var stamp = sello(ahora);
    var nombre = opts.nombre ? "ELOTROFÚTBOLTV — " + opts.nombre : "ELOTROFÚTBOLTV";
    var lineas = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//ELOTROFUTBOLTV//Calendario//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:" + esc(nombre),
      "X-WR-TIMEZONE:Europe/Madrid"
    ].concat(VTIMEZONE_MADRID);

    var incluidos = 0;
    var sinFecha = 0;

    (partidos || []).forEach(function (p) {
      if (!p || !ESTADOS_PENDIENTES[p.estado]) return;
      var fh = fechaHora(p);
      if (!fh.dia) { sinFecha++; return; }

      var ev = [
        "BEGIN:VEVENT",
        "UID:partido-" + p.id + "@" + DOMINIO_UID,
        "DTSTAMP:" + stamp
      ];
      if (fh.hora) {
        ev.push("DTSTART;TZID=Europe/Madrid:" + compacta(fh.dia, fh.hora));
        ev.push("DTEND;TZID=Europe/Madrid:" + sumarMinutos(fh.dia, fh.hora, DURACION_MIN));
      } else {
        ev.push("DTSTART;VALUE=DATE:" + compacta(fh.dia));
        ev.push("DTEND;VALUE=DATE:" + sumarDia(fh.dia));
      }
      var titulo = p.equipo_local + " - " + p.equipo_visitante;
      ev.push("SUMMARY:" + esc(titulo + (fh.hora ? "" : " (hora por confirmar)")));
      ev.push("DESCRIPTION:" + esc(descripcion(p)));
      if (p.ubicacion) ev.push("LOCATION:" + esc(p.ubicacion));
      ev.push("URL:" + URL_CALENDARIO);
      ev.push("STATUS:" + (fh.hora && p.estado !== "retrasado" ? "CONFIRMED" : "TENTATIVE"));
      if (fh.hora) {
        ev.push("BEGIN:VALARM", "ACTION:DISPLAY",
          "DESCRIPTION:" + esc(titulo),
          "TRIGGER:-PT" + AVISO_MIN + "M", "END:VALARM");
      }
      ev.push("END:VEVENT");
      lineas = lineas.concat(ev);
      incluidos++;
    });

    lineas.push("END:VCALENDAR");
    return {
      ics: lineas.map(plegar).join("\r\n") + "\r\n",
      incluidos: incluidos,
      sinFecha: sinFecha
    };
  }

  function nombreArchivo(texto) {
    var slug = String(texto || "calendario")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      .slice(0, 60) || "calendario";
    return "elotrofutbol-" + slug + ".ics";
  }

  function descargar(ics, archivo) {
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = archivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  window.EOFCalendarioICS = {
    construirICS: construirICS,
    nombreArchivo: nombreArchivo,
    descargar: descargar
  };
})();
