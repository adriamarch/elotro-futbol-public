// ---------- IMPORTACIÓN RÁPIDA DE PARTIDOS Y RESULTADOS ----------
// Permite pegar el bloque de texto tal cual se copia de la web de
// resultados y, para cada partido detectado:
//   - si ya existe un resultado igual (misma competición, mismos
//     equipos, mismo día) se ACTUALIZA (PUT) con el marcador/estado
//     nuevos, sin tocar lo que no cambia;
//   - si no existe, se CREA (POST).
// Se soportan cuatro formatos de texto pegado (ver detectarFormatoTexto):
//   1. "Markdown": fechas en español ("Viernes 28 de Agosto"),
//      "* Finalizado", enlaces "[Equipo](url)" y "[N - M](url)".
//   2. "Compacto": fechas abreviadas ("Vie, 28/8" o "Ayer"), estado en
//      su propia línea ("Fin"), hora ("► 3:15") y equipo/gol en líneas
//      sueltas sin enlaces, con el nombre del equipo duplicado (p.ej.
//      "TenerifeTenerife") porque el texto visible arrastra el alt del
//      escudo.
//   3. "BeSoccer": calendario/resultados de BeSoccer.com. Cada bloque
//      trae la competición en texto libre (se ignora), el equipo local
//      duplicado (con y sin espacios alrededor), la hora o ya la fecha
//      si el partido es lejano y BeSoccer aún no le ha puesto hora,
//      el equipo visitante duplicado, y una fecha de cierre tipo
//      "19 SEP" o "dentro de 21 días". No trae marcador aunque el
//      partido ya se haya jugado, así que todo se importa como
//      "programado" (el redactor corrige el marcador a mano en la
//      vista previa si hiciera falta).
//   4. "ESPN": bloques de seis líneas (estado "FIN", competición,
//      equipo local, línea de marcador "Local N-M Visitante", equipo
//      visitante y fecha "12 SEP 2026"). Sí trae marcador, así que
//      los partidos entran ya con el resultado y como "finalizado".
// La competición se adivina sola comparando los nombres de los
// equipos contra las listas de public/js/clubs.js (CLUBS_BY_CATEGORY),
// reutilizando la misma normalización que ya usa el buscador de clubes
// (normalizarTextoBusquedaClub), para no depender de que el texto
// pegado diga en ningún sitio "LaLiga Hypermotion" o "Primera
// Federación".

const MESES_ES = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11,
};

const DIAS_ABREV_ES = {
  lun: 1, mar: 2, mie: 3, mié: 3, jue: 4, vie: 5, sab: 6, sáb: 6, dom: 0,
};

// Reconoce cabeceras de día tipo "Viernes 28 de Agosto" (con o sin
// tilde en el nombre del mes, mayúsculas/minúsculas indistinto).
const RE_CABECERA_DIA = /^(lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)\s+(\d{1,2})\s+de\s+([a-zA-ZñÑáéíóúÁÉÍÓÚ]+)\s*$/i;

// Una línea de marcador ya jugado: "[N - M](url)". El guion puede
// llevar o no espacios alrededor.
const RE_MARCADOR = /^\[(\d+)\s*-\s*(\d+)\]\(([^)]*)\)\s*$/;

// Una línea de equipo (o de "Ver crónica" / "Más apuestas", que se
// descartan aparte): "[Texto](url)".
const RE_ENLACE = /^\[([^\]]+)\]\(([^)]*)\)\s*$/;

// Estados que puede traer el texto pegado ("* Finalizado", "* En
// juego"...) mapeados a los valores que espera el backend.
const ESTADOS_TEXTO_A_BACKEND = {
  "finalizado": "finalizado",
  "en juego": "en_juego",
  "en directo": "en_juego",
  "aplazado": "retrasado",
  "retrasado": "retrasado",
  "suspendido": "retrasado",
  "anulado": "anulado",
  "cancelado": "anulado",
};

// ---------- FORMATO 2 ("compacto", sin enlaces) ----------
// Línea de fecha del formato compacto: "Vie, 28/8", "Sáb, 29/8", o
// también sin el día de la semana delante, solo "18/9" (variante que
// se ve, p.ej., en partidos aún por jugar de la propia jornada). El
// día de la semana abreviado, si viene, se ignora a efectos de fecha:
// solo se usan el día y el mes numéricos.
const RE_FECHA_COMPACTA = /^(?:(?:lun|mar|mi[ée]|jue|vie|s[áa]b|dom)\.?,?\s+)?(\d{1,2})\/(\d{1,2})\s*$/i;

// "Ayer" / "Hoy" (fechas relativas que a veces trae este formato en
// vez de la fecha abreviada).
const RE_FECHA_RELATIVA = /^(ayer|hoy)\s*$/i;

// Estado en su propia línea: "Fin", "Descanso", "1ª parte"...
const ESTADOS_COMPACTO_A_BACKEND = {
  "fin": "finalizado",
  "descanso": "en_juego",
  "1ª parte": "en_juego",
  "2ª parte": "en_juego",
  "aplazado": "retrasado",
  "susp.": "retrasado",
  "suspendido": "retrasado",
};
const RE_ESTADO_COMPACTO = /^(fin|descanso|1ª\s*parte|2ª\s*parte|aplazado|susp\.?|suspendido)$/i;

// Línea de hora tipo "► 3:15" o "20:00" (el triángulo es opcional).
// SOLO la variante CON triángulo es una marca inequívoca del formato
// compacto: una hora simple "20:00" también la trae el formato
// BeSoccer, así que sin triángulo no sirve para distinguir entre los
// dos (ver detectarFormatoTexto).
const RE_HORA_COMPACTA = /^[►▶]?\s*(\d{1,2}):(\d{2})\s*$/;
const RE_HORA_COMPACTA_CON_TRIANGULO = /^[►▶]\s*(\d{1,2}):(\d{2})\s*$/;

// Línea que es solo un número entero (goles de un equipo).
const RE_GOLES = /^\d{1,2}$/;

// ---------- FORMATO 3 ("besoccer", resultados/calendario de BeSoccer.com) ----------
// Cada partido llega como un bloque de líneas sin enlaces ni marcador
// explícito por goles cuando aún no se ha jugado (BeSoccer, a
// diferencia de los otros dos formatos, no repite un marcador con
// número de goles en el texto pegado -- si el resultado ya se ha
// jugado hay que introducirlo a mano después, en la vista previa; lo
// que este parser sí reconoce solo es cuándo y quiénes juegan):
//   Segunda Federación      <- competición (texto libre, se ignora tal
//                              cual "Jornada 3": la competición real se
//                              adivina por los equipos, igual que en
//                              los otros dos formatos)
//   CD Basconia             <- equipo local (viene dos veces seguidas,
//   CD Basconia                una sin espacios y otra con espacio
//                              alrededor por el alt del escudo)
//   12:00                   <- hora (si el partido aún no se ha jugado)
//   Arosa                   <- equipo visitante (también duplicado)
//   Arosa
//   19 SEP                  <- fecha del bloque: "DD MES" (mes en
//                              mayúsculas, abreviado en español) o
//                              "dentro de N días" / "hoy" para
//                              partidos futuros que BeSoccer no fecha
//                              con día concreto todavía.
// La fecha cierra el bloque (va DESPUÉS de los dos equipos, al revés
// que en el formato compacto, donde la fecha abre el bloque).

// Meses abreviados de 3 letras tal como los escribe BeSoccer (sin
// tilde, en mayúsculas en el texto original, pero aquí se compara en
// minúsculas porque las líneas ya llegan pasadas por lower más abajo).
const MESES_ABREV3_ES = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11,
};

// "19 SEP" / "07 OCT" (día + mes abreviado de 3 letras, sin punto).
const RE_FECHA_BESOCCER = /^(\d{1,2})\s+([a-zA-ZñÑ]{3})\.?\s*$/i;

// "dentro de 21 días" / "dentro de 1 día": partido todavía sin fecha
// exacta fijada por BeSoccer, expresado como "faltan N días desde
// hoy". Se captura el número de días.
const RE_FECHA_BESOCCER_RELATIVA_DIAS = /^dentro\s+de\s+(\d+)\s+d[ií]as?\s*$/i;

// "Hoy" también aparece tal cual en este formato para partidos del
// día en curso (mismo texto que en el formato compacto, se reutiliza
// RE_FECHA_RELATIVA para reconocerlo).

// Líneas de cabecera/pie que hay que ignorar sin que corten un
// bloque de partido en curso: título de la página ("Resultados
// Segunda RFEF hoy"), "Jornada N" suelta, y el aviso de copyright del
// final. Nunca aparecen EN MEDIO de un bloque real (equipo/hora/
// equipo/fecha), así que basta con saltarlas cuando no se está
// esperando ninguna de esas piezas.
const RE_BESOCCER_IGNORAR = /^(resultados\s|jornada\s+\d+\s*$|copyright\s+©)/i;

function fechaBesoccerISO(dia, mesAbrev, anio, hoy) {
  const mesIdx = MESES_ABREV3_ES[mesAbrev.toLowerCase().slice(0, 3)];
  const d = parseInt(dia, 10);
  if (mesIdx === undefined || !d) return null;
  // Mismo criterio que en el formato compacto (fechaCompactaISO): si
  // el mes/día resultante con el año dado cae muy lejos en el futuro,
  // se asume que en realidad es del año siguiente (caso típico: es
  // diciembre y BeSoccer ya enseña partidos de enero) en vez de
  // dejarlo en el pasado con el año dado.
  let candidato = new Date(Date.UTC(anio, mesIdx, d));
  const MARGEN_PASADO_MS = 30 * 24 * 3600 * 1000;
  if (hoy && hoy.getTime() - candidato.getTime() > MARGEN_PASADO_MS) {
    candidato = new Date(Date.UTC(anio + 1, mesIdx, d));
  }
  const yyyy = candidato.getUTCFullYear();
  const mm = String(candidato.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(candidato.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// "dentro de N días" -> fecha ISO real sumando N días a hoy.
function fechaBesoccerRelativaISO(dias, hoy) {
  const base = hoy || new Date();
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + parseInt(dias, 10)));
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Parser del formato 3 ("besoccer"). A diferencia del compacto, aquí
// la fecha llega AL FINAL del bloque (tras los dos equipos), así que
// la máquina de estados es más simple: local -> hora-u-visitante ->
// visitante -> fecha, y con la fecha se cierra siempre el partido.
// Como el texto no trae marcador, todos los partidos salen sin goles
// (estado "programado"); si alguno ya se ha jugado, se corrige el
// marcador y el estado a mano en la vista previa antes de confirmar.
function analizarTextoImportacionBesoccer(texto, anio) {
  const lineas = texto.split("\n").map(l => l.trim()).filter(l => l !== "");
  const partidos = [];
  const avisos = [];
  const hoy = new Date();
  const hoyUTC = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));

  let pendiente = null; // { local, hora, visitante }
  let esperando = "local"; // "local" | "visitanteOHora" | "visitante" | "fecha"

  const descartarPendiente = (motivo) => {
    if (pendiente && pendiente.local) {
      avisos.push(`Bloque de partido incompleto cerca de "${pendiente.local}"${motivo ? ` (${motivo})` : ""}; se ha omitido.`);
    }
    pendiente = null;
    esperando = "local";
  };

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    // Cabeceras/pie de página conocidos: se ignoran solo si no
    // rompen un bloque ya empezado (si apareciesen a mitad de un
    // bloque real, mejor tratarlas como texto de equipo que perder
    // el partido en curso silenciosamente).
    if (esperando === "local" && RE_BESOCCER_IGNORAR.test(linea)) continue;
    // El nombre de la competición ("Segunda Federación", "LaLiga
    // Hypermotion"...) también se ignora tal cual: no hace falta
    // para nada, la competición real se detecta por los equipos.
    if (esperando === "local" && !RE_FECHA_BESOCCER.test(linea) && !RE_HORA_COMPACTA.test(linea) &&
        (/^(segunda federaci[oó]n|primera federaci[oó]n|laliga|liga|copa|amistoso)/i.test(linea))) {
      continue;
    }

    if (esperando === "local") {
      // El nombre puede venir duplicado (con y sin espacios
      // alrededor, por el alt del escudo) o suelto según la fila; se
      // guarda tal cual llega esta primera línea, y si la siguiente
      // es el mismo nombre (normalizado) se descarta como duplicado
      // más abajo, igual que hace deduplicarNombreEquipo con el
      // formato compacto (aquí el duplicado va en dos líneas
      // distintas, no en una sola línea pegada).
      pendiente = { local: linea.trim() };
      esperando = "localDup";
      continue;
    }
    if (esperando === "localDup") {
      // Si esta línea es (aproximadamente) el mismo nombre que la
      // anterior, es el duplicado del alt del escudo: se descarta.
      // Si no, es ya la hora o el equipo visitante y hay que
      // reprocesarla como tal.
      if (linea.trim().toLowerCase() === pendiente.local.trim().toLowerCase()) {
        esperando = "visitanteOHora";
        continue;
      }
      esperando = "visitanteOHora";
      // cae al siguiente bloque para reprocesar esta misma línea
    }
    if (esperando === "visitanteOHora") {
      const matchHora = linea.match(RE_HORA_COMPACTA);
      if (matchHora) {
        const [, hh, mm] = matchHora;
        pendiente.hora = `${hh.padStart(2, "0")}:${mm}`;
        esperando = "visitante";
        continue;
      }
      // Partidos aún lejanos (BeSoccer no les ha puesto hora todavía):
      // en vez de una hora, en este hueco aparece YA la fecha del
      // partido ("07 OCT", o alguna vez "dentro de N días"). Se
      // guarda como la fecha provisional del bloque -- si más
      // adelante aparece otra fecha antes de cerrar el partido (ver
      // "fecha"), esa segunda es la que prevalece, por ser la más
      // cercana al cierre del bloque y no arriesgarse a mezclar la
      // fecha de un partido con el siguiente.
      const matchFechaAqui = linea.match(RE_FECHA_BESOCCER);
      const matchRelDiasAqui = linea.match(RE_FECHA_BESOCCER_RELATIVA_DIAS);
      const matchHoyAqui = linea.match(RE_FECHA_RELATIVA);
      if (matchFechaAqui || matchRelDiasAqui || matchHoyAqui) {
        pendiente.fechaProvisional = linea;
        esperando = "visitante";
        continue;
      }
      // No es hora ni fecha: esta línea ya es el equipo visitante
      // (partido sin hora anunciada todavía, caso raro pero posible).
      pendiente.visitante = linea.trim();
      esperando = "visitanteDup";
      continue;
    }
    if (esperando === "visitante") {
      pendiente.visitante = linea.trim();
      esperando = "visitanteDup";
      continue;
    }
    if (esperando === "visitanteDup") {
      if (linea.trim().toLowerCase() === pendiente.visitante.trim().toLowerCase()) {
        esperando = "fecha";
        continue;
      }
      esperando = "fecha";
      // cae al siguiente bloque para reprocesar esta línea como fecha
    }
    if (esperando === "fecha") {
      let fechaISO = null;
      let fechaTextoUsada = linea;
      const matchFecha = linea.match(RE_FECHA_BESOCCER);
      const matchRelDias = linea.match(RE_FECHA_BESOCCER_RELATIVA_DIAS);
      const matchHoy = linea.match(RE_FECHA_RELATIVA);
      if (matchFecha) {
        const [, dia, mesAbrev] = matchFecha;
        fechaISO = fechaBesoccerISO(dia, mesAbrev, anio, hoyUTC);
      } else if (matchRelDias) {
        fechaISO = fechaBesoccerRelativaISO(matchRelDias[1], hoyUTC);
      } else if (matchHoy) {
        fechaISO = fechaRelativaISO(matchHoy[1], hoyUTC);
      } else if (pendiente.fechaProvisional) {
        // Esta línea no es una fecha (probablemente ya el inicio del
        // siguiente bloque), pero el propio partido ya traía una
        // fecha provisional en el hueco de la hora (ver
        // "visitanteOHora" más arriba, caso de partidos aún lejanos
        // sin hora anunciada). Se usa esa, y esta línea se reprocesa
        // como inicio de un nuevo bloque en vez de perderse.
        const mProv = pendiente.fechaProvisional.match(RE_FECHA_BESOCCER);
        const mProvRel = pendiente.fechaProvisional.match(RE_FECHA_BESOCCER_RELATIVA_DIAS);
        const mProvHoy = pendiente.fechaProvisional.match(RE_FECHA_RELATIVA);
        if (mProv) {
          fechaISO = fechaBesoccerISO(mProv[1], mProv[2], anio, hoyUTC);
        } else if (mProvRel) {
          fechaISO = fechaBesoccerRelativaISO(mProvRel[1], hoyUTC);
        } else if (mProvHoy) {
          fechaISO = fechaRelativaISO(mProvHoy[1], hoyUTC);
        }
        fechaTextoUsada = pendiente.fechaProvisional;
        // Esta línea no era la fecha de cierre de ESTE partido, sino
        // ya el principio del siguiente bloque (competición, nombre
        // de equipo local, etc.): se retrocede el índice para que se
        // vuelva a procesar en la próxima vuelta, en vez de perderla.
        i--;
      } else {
        // Línea rara donde tocaría la fecha: se descarta el bloque en
        // vez de arrastrar un partido sin fecha (más adelante
        // partidoImportable() ya lo filtraría, pero así queda el
        // aviso explicando por qué no salió).
        descartarPendiente(`no se ha entendido la fecha "${linea}"`);
        continue;
      }
      if (!pendiente.local || !pendiente.visitante) {
        descartarPendiente("faltan equipos");
        continue;
      }
      const competicion = detectarCompeticionPorEquipos(pendiente.local, pendiente.visitante);
      const nombreLocalOficial = nombreOficialEquipo(pendiente.local, competicion);
      const nombreVisitanteOficial = nombreOficialEquipo(pendiente.visitante, competicion);
      partidos.push({
        fecha_iso: fechaISO,
        fecha_texto: fechaTextoUsada,
        // BeSoccer no repite la hora de partidos ya jugados (solo la
        // trae para los que están por jugar), así que si no hubo
        // línea de hora se deja sin hora -- exactamente igual que en
        // el formato compacto.
        hora: pendiente.hora || null,
        competicion,
        equipo_local: nombreLocalOficial,
        equipo_visitante: nombreVisitanteOficial,
        equipo_local_original: pendiente.local,
        equipo_visitante_original: pendiente.visitante,
        // Sin marcador en el texto de origen: se asume "programado".
        // Si el partido ya se jugó, el redactor corrige el marcador y
        // el estado a mano en la vista previa antes de confirmar,
        // igual que con cualquier otro campo que falte.
        goles_local: null,
        goles_visitante: null,
        estado: "programado",
      });
      pendiente = null;
      esperando = "local";
      continue;
    }
  }
  if (pendiente && pendiente.local) {
    descartarPendiente("el texto termina a mitad de un partido");
  }

  return { partidos, avisos };
}

// ---------- FORMATO 4 ("espn", resultados de ESPN) ----------
// Cada partido llega como un bloque fijo de seis líneas, y sí trae el
// marcador (a diferencia de BeSoccer):
//   FIN                                        <- estado
//   Segunda Federación                         <- competición (se ignora:
//                                                 se deduce por los equipos)
//   Eibar B                                    <- equipo local suelto
//    Eibar B 1-0 Gimnástica Torrelavega        <- marcador, con los dos
//                                                 nombres pegados alrededor
//   Gimnástica Torrelavega                     <- equipo visitante suelto
//   12 SEP 2026                                <- fecha "DD MES AAAA"
// El texto suele abrir con una línea "Jornada N" suelta (a veces
// repetida): se ignora, porque la jornada se deduce luego por fecha
// con el calendario de jornadas, igual que en los otros formatos.
//
// La línea del marcador NO se parte por el guion: los nombres llevan
// espacios ("Real Valladolid Promesas") y filiales con letra suelta
// ("Eibar B"), así que partir por ahí es frágil. En su lugar se usan
// como anclas las líneas de alrededor (local antes, visitante
// después) y del marcador solo se sacan los dos números; que la línea
// empiece por el local y acabe por el visitante sirve además de
// comprobación de que el bloque está bien alineado.

// "12 SEP 2026" (día + mes abreviado de 3 letras + año de 4 cifras).
// El año es lo que lo distingue de la fecha de BeSoccer ("19 SEP").
const RE_FECHA_ESPN = /^(\d{1,2})\s+([a-zA-ZñÑ]{3})\.?\s+(\d{4})\s*$/i;

// Línea de marcador del formato ESPN: "Local N-M Visitante". Solo se
// capturan los goles; los equipos se toman de las líneas de alrededor.
const RE_MARCADOR_ESPN = /^(.+?)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(.+?)$/;

// "Jornada 2" suelta y otras cabeceras que el texto pegado arrastra.
const RE_ESPN_IGNORAR = /^jornada\s+\d+\s*$/i;

function fechaEspnISO(dia, mesAbrev, anio) {
  const mesIdx = MESES_ABREV3_ES[mesAbrev.toLowerCase().slice(0, 3)];
  const d = parseInt(dia, 10);
  const a = parseInt(anio, 10);
  if (mesIdx === undefined || !d || !a) return null;
  // Aquí no hace falta adivinar el año (al contrario que en el
  // formato compacto o en BeSoccer): el texto ya lo trae.
  return `${a}-${String(mesIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Parser del formato 4 ("espn"). Recorre las líneas buscando las de
// marcador y, por cada una, lee el bloque a su alrededor. No usa
// máquina de estados: al venir el bloque siempre en el mismo orden,
// anclarse al marcador es más robusto frente a cabeceras sueltas
// ("Jornada 2") o bloques mal copiados, que simplemente se saltan con
// un aviso en vez de descolocar todo lo que viene detrás.
function analizarTextoImportacionEspn(texto, anio) {
  const lineas = texto.split("\n").map(l => l.trim()).filter(l => l !== "");
  const partidos = [];
  const avisos = [];

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (RE_ESPN_IGNORAR.test(linea)) continue;

    const matchMarcador = linea.match(RE_MARCADOR_ESPN);
    if (!matchMarcador) continue;

    const local = lineas[i - 1] || "";
    const visitante = lineas[i + 1] || "";
    const lineaFecha = lineas[i + 2] || "";

    // Comprobación de alineación del bloque: la línea del marcador
    // tiene que empezar por el equipo local y acabar por el
    // visitante. Si no cuadra, el bloque viene mal copiado y se
    // omite (mejor eso que inventarse los equipos partiendo el
    // marcador por el guion).
    if (!local || !visitante || !linea.startsWith(local) || !linea.endsWith(visitante)) {
      avisos.push(`Bloque de partido mal alineado en "${linea}"; se ha omitido.`);
      continue;
    }

    const matchFecha = lineaFecha.match(RE_FECHA_ESPN);
    if (!matchFecha) {
      avisos.push(`No se ha entendido la fecha del partido "${linea}"; se ha omitido.`);
      continue;
    }
    const fechaISO = fechaEspnISO(matchFecha[1], matchFecha[2], matchFecha[3]);
    if (!fechaISO) {
      avisos.push(`Fecha no válida "${lineaFecha}" en el partido "${linea}"; se ha omitido.`);
      continue;
    }

    // El estado abre el bloque, tres líneas por encima del marcador
    // ("FIN" / "Aplazado"...). Si esa línea no es un estado conocido
    // (bloque recortado al copiar, por ejemplo), se asume finalizado:
    // en este formato el marcador solo aparece cuando el partido ya
    // se ha jugado.
    const lineaEstado = (lineas[i - 3] || "").toLowerCase();
    const estado = ESTADOS_COMPACTO_A_BACKEND[lineaEstado] || "finalizado";

    const competicion = detectarCompeticionPorEquipos(local, visitante);
    partidos.push({
      fecha_iso: fechaISO,
      fecha_texto: lineaFecha,
      // ESPN no trae la hora de los partidos ya jugados, igual que
      // los otros formatos con marcador.
      hora: null,
      competicion,
      equipo_local: nombreOficialEquipo(local, competicion),
      equipo_visitante: nombreOficialEquipo(visitante, competicion),
      equipo_local_original: local,
      equipo_visitante_original: visitante,
      goles_local: parseInt(matchMarcador[2], 10),
      goles_visitante: parseInt(matchMarcador[3], 10),
      estado,
    });

    i += 2; // visitante y fecha ya consumidos
  }

  return { partidos, avisos };
}


// Detecta si una línea "NombreNombre" es un nombre de equipo
// duplicado (el texto visible copiado incluye dos veces el nombre,
// por el alt del escudo). Si la primera mitad es igual a la segunda,
// se queda solo con una copia; si no, se deja el texto tal cual.
function deduplicarNombreEquipo(texto) {
  const t = texto.trim();
  const n = t.length;
  if (n % 2 === 0) {
    const mitad = n / 2;
    const a = t.slice(0, mitad);
    const b = t.slice(mitad);
    if (a === b && a.length > 0) return a;
  }
  return t;
}

// Detecta cuál de los dos formatos soportados trae el texto pegado,
// mirando las primeras líneas no vacías.
function detectarFormatoTexto(lineas) {
  // Pasada previa (formato ESPN): su fecha "12 SEP 2026" no la
  // produce ningún otro formato y es inequívoca, pero tiene que
  // comprobarse ANTES que el resto sobre TODO el texto, no línea a
  // línea junto a las demás marcas: el bloque de ESPN abre con "FIN",
  // que RE_ESTADO_COMPACTO también reconoce, así que en un recorrido
  // único el texto se clasificaría como "compacto" varias líneas
  // antes de llegar a la primera fecha.
  for (const linea of lineas) {
    if (RE_FECHA_ESPN.test(linea)) return "espn";
  }
  // Primera pasada: solo marcas INEQUÍVOCAS de cada formato (nunca
  // aparecen en los otros dos). "Hoy"/"Ayer" (RE_FECHA_RELATIVA) se
  // deja fuera de esta pasada a propósito: la usan tanto el formato
  // compacto como BeSoccer, así que sola no dice nada.
  for (const linea of lineas) {
    if (RE_CABECERA_DIA.test(linea)) return "markdown";
    if (RE_ENLACE.test(linea)) return "markdown";
    if (RE_ESTADO_COMPACTO.test(linea)) return "compacto";
    if (RE_FECHA_COMPACTA.test(linea)) return "compacto";
    if (RE_HORA_COMPACTA_CON_TRIANGULO.test(linea)) return "compacto"; // "► 3:15": solo lo trae el compacto
    // BeSoccer es el único de los tres formatos con fecha "DD MES"
    // (mes abreviado en letras, tipo "19 SEP") o "dentro de N días";
    // ninguno de los otros dos formatos produce nunca estas líneas.
    if (RE_FECHA_BESOCCER.test(linea) || RE_FECHA_BESOCCER_RELATIVA_DIAS.test(linea)) return "besoccer";
  }
  // Segunda pasada: si nada fue inequívoco pero hay un "Hoy"/"Ayer"
  // suelto, es casi con toda seguridad un texto de BeSoccer con un
  // único partido de hoy (el compacto casi siempre trae también hora
  // "► hh:mm" o un estado tipo "Fin", que ya se habría detectado
  // arriba). Se asume BeSoccer en ese caso.
  for (const linea of lineas) {
    if (RE_FECHA_RELATIVA.test(linea)) return "besoccer";
  }
  return "markdown"; // por defecto, para no romper el comportamiento previo
}

// Convierte "Vie, 28/8" (o "Ayer"/"Hoy") en "YYYY-MM-DD". Como el
// formato compacto no trae el año, se usa el año pasado por el
// usuario, salvo que la fecha resultante caiga muy lejos en el futuro
// respecto a hoy (más de ~200 días), en cuyo caso se asume que es del
// año anterior (caso típico: pegar en enero un texto de partidos de
// diciembre). Partidos de dentro de unos días o unas pocas semanas
// (la jornada siguiente, por ejemplo) se dejan en el año indicado.
function fechaCompactaISO(dia, mes, anio, hoy) {
  const d = parseInt(dia, 10);
  const m = parseInt(mes, 10);
  if (!d || !m || m < 1 || m > 12) return null;
  let candidato = new Date(Date.UTC(anio, m - 1, d));
  const MARGEN_FUTURO_MS = 200 * 24 * 3600 * 1000;
  if (hoy && candidato.getTime() - hoy.getTime() > MARGEN_FUTURO_MS) {
    candidato = new Date(Date.UTC(anio - 1, m - 1, d));
  }
  const yyyy = candidato.getUTCFullYear();
  const mm = String(candidato.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(candidato.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// "Ayer" / "Hoy" -> fecha ISO real, en base a la fecha de hoy.
function fechaRelativaISO(palabra, hoy) {
  const base = hoy || new Date();
  const offset = /ayer/i.test(palabra) ? -1 : 0;
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offset));
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Parser del formato 2 ("compacto"). Recorre las líneas con una
// pequeña máquina de estados. Cada partido puede venir ya jugado (con
// marcador) o todavía por jugar (sin marcador, solo con la hora):
//   Fin                  <- estado (o "Descanso", etc.); ausente si aún no se ha jugado
//   Vie, 28/8             <- fecha (se repite antes de cada partido)
//   ► 3:15                <- hora del partido (se guarda si aún no se ha jugado)
//   TenerifeTenerife       <- equipo local (duplicado)
//   0                      <- goles local (solo si ya se ha jugado)
//   Sporting GijónSporting Gijón   <- equipo visitante (duplicado)
//   1                      <- goles visitante (solo si ya se ha jugado)
function analizarTextoImportacionCompacto(texto, anio) {
  const lineas = texto.split("\n").map(l => l.trim()).filter(l => l !== "");
  const partidos = [];
  const avisos = [];
  const hoy = new Date();
  const hoyUTC = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));

  let fechaActualISO = null;
  let fechaActualTexto = null;
  let horaActual = null; // "HH:MM" del último "► 3:15" leído, o null si no venía
  let estadoActual = null;
  // Máquina de estados dentro de un bloque de partido: tras el
  // estado y la fecha llega la hora, luego local+goles, luego
  // visitante+goles. Los goles son opcionales (partido aún sin jugar).
  let pendiente = null; // { local, golesLocal, visitante, golesVisitante }
  let esperando = "hora"; // "hora" | "local" | "golesLocal" | "visitante" | "golesVisitante"

  // Cierra el bloque de partido actual y lo añade a la lista, tanto si
  // tiene marcador (ya jugado) como si no (aún por jugar). La hora solo
  // se adjunta cuando el partido todavía no se ha jugado (programado):
  // una vez finalizado, la hora de inicio ya no es el dato relevante y
  // el origen del texto tampoco la repite en ese caso.
  const cerrarPartido = () => {
    if (!pendiente || !pendiente.local || !pendiente.visitante) return;
    const competicion = detectarCompeticionPorEquipos(pendiente.local, pendiente.visitante);
    const nombreLocalOficial = nombreOficialEquipo(pendiente.local, competicion);
    const nombreVisitanteOficial = nombreOficialEquipo(pendiente.visitante, competicion);
    const tieneMarcador = pendiente.golesLocal !== undefined && pendiente.golesVisitante !== undefined;
    const estadoFinal = estadoActual || (tieneMarcador ? "finalizado" : "programado");
    partidos.push({
      fecha_iso: fechaActualISO,
      fecha_texto: fechaActualTexto,
      hora: estadoFinal === "programado" ? horaActual : null,
      competicion,
      equipo_local: nombreLocalOficial,
      equipo_visitante: nombreVisitanteOficial,
      equipo_local_original: pendiente.local,
      equipo_visitante_original: pendiente.visitante,
      goles_local: tieneMarcador ? pendiente.golesLocal : null,
      goles_visitante: tieneMarcador ? pendiente.golesVisitante : null,
      estado: estadoFinal,
    });
    pendiente = null;
  };

  const cerrarPendienteIncompleto = () => {
    if (pendiente && pendiente.local && !pendiente.visitante) {
      avisos.push(`Bloque de partido incompleto cerca de "${pendiente.local}" (${fechaActualTexto || "fecha desconocida"}); se ha omitido.`);
      pendiente = null;
    } else {
      cerrarPartido();
    }
    esperando = "hora";
  };

  for (const linea of lineas) {
    // Cabecera de estado: "Fin", "Descanso"... Abre un nuevo bloque.
    const matchEstado = linea.match(RE_ESTADO_COMPACTO);
    if (matchEstado) {
      cerrarPendienteIncompleto();
      const clave = matchEstado[1].toLowerCase().replace(/\s+/g, " ");
      estadoActual = ESTADOS_COMPACTO_A_BACKEND[clave] || "finalizado";
      pendiente = {};
      esperando = "fecha";
      continue;
    }

    // Fecha abreviada tipo "Vie, 28/8".
    const matchFecha = linea.match(RE_FECHA_COMPACTA);
    if (matchFecha && (esperando === "fecha" || esperando === "hora" || esperando === "local")) {
      // Llega una fecha nueva sin que el bloque anterior se cerrase
      // explícitamente con un estado (típico de los partidos aún por
      // jugar, que no traen "Fin"): se cierra lo que hubiera pendiente.
      cerrarPendienteIncompleto();
      estadoActual = null; // partidos por jugar: no hay estado explícito hasta el próximo "Fin"
      horaActual = null; // se espera la hora propia de este nuevo bloque
      const [, dia, mes] = matchFecha;
      fechaActualISO = fechaCompactaISO(dia, mes, anio, hoyUTC);
      fechaActualTexto = linea;
      if (!fechaActualISO) avisos.push(`No se ha entendido la fecha "${linea}".`);
      pendiente = {};
      esperando = "hora";
      continue;
    }
    // Fecha relativa "Ayer"/"Hoy".
    const matchFechaRel = linea.match(RE_FECHA_RELATIVA);
    if (matchFechaRel && (esperando === "fecha" || esperando === "hora" || esperando === "local")) {
      cerrarPendienteIncompleto();
      estadoActual = null;
      horaActual = null;
      fechaActualISO = fechaRelativaISO(matchFechaRel[1], hoyUTC);
      fechaActualTexto = linea;
      pendiente = {};
      esperando = "hora";
      continue;
    }

    // Hora "► 3:15" o "19:00": se guarda en horaActual (se usará solo
    // si el partido resulta estar aún por jugar), y marca que ya toca
    // leer el nombre del equipo local. Se acepta tanto si veníamos
    // esperando la hora como si veníamos esperando fecha (caso en que
    // el bloque no repite la fecha porque es igual a la anterior).
    const matchHora = linea.match(RE_HORA_COMPACTA);
    if (matchHora && (esperando === "hora" || esperando === "fecha")) {
      const [, hh, mm] = matchHora;
      horaActual = `${hh.padStart(2, "0")}:${mm}`;
      if (!pendiente) pendiente = {};
      esperando = "local";
      continue;
    }

    // Nombre de equipo local (posiblemente duplicado). Si por lo que
    // sea llegamos aquí sin haber visto antes un "Fin"/fecha/hora (p.
    // ej. el texto no repite la cabecera de cada partido), se abre el
    // bloque igualmente en vez de fallar. También se acepta viniendo
    // de "hora": algunos partidos (típicamente los ya finalizados) no
    // traen ninguna línea de hora entre la fecha y el equipo local
    // -sin marcador que lo distinga, esta línea simplemente no
    // aparece-, así que sin este caso el bloque entero se perdía en
    // silencio (nunca llegaba a fijarse "pendiente.local").
    if (esperando === "local" || esperando === "hora") {
      if (!pendiente) pendiente = {};
      pendiente.local = deduplicarNombreEquipo(linea);
      esperando = "golesLocal";
      continue;
    }
    // Tras el equipo local puede venir el marcador (partido ya
    // jugado) o directamente el equipo visitante (partido por jugar,
    // sin marcador). Si la línea es un número corto, son los goles;
    // si no, se interpreta ya como el nombre del equipo visitante.
    if (esperando === "golesLocal" && pendiente) {
      if (RE_GOLES.test(linea)) {
        pendiente.golesLocal = parseInt(linea, 10);
        esperando = "visitante";
      } else {
        pendiente.visitante = deduplicarNombreEquipo(linea);
        esperando = "golesVisitante";
      }
      continue;
    }
    // Nombre de equipo visitante (posiblemente duplicado).
    if (esperando === "visitante" && pendiente) {
      pendiente.visitante = deduplicarNombreEquipo(linea);
      esperando = "golesVisitante";
      continue;
    }
    // Tras el equipo visitante puede venir el marcador (partido ya
    // jugado) o cerrarse ahí el bloque (partido por jugar). Si la
    // línea no son goles, se cierra el partido sin marcador y esa
    // misma línea se reprocesa como el inicio del siguiente bloque
    // (normalmente una fecha).
    if (esperando === "golesVisitante" && pendiente) {
      if (RE_GOLES.test(linea)) {
        pendiente.golesVisitante = parseInt(linea, 10);
        cerrarPartido();
        esperando = "fecha"; // el siguiente bloque suele repetir la fecha; si no la trae, se reusa la última
        continue;
      }
      // No son goles: el partido no tenía marcador (aún no jugado).
      // Se cierra tal cual y se reprocesa esta línea como posible
      // fecha/hora/estado del siguiente bloque.
      cerrarPartido();
      esperando = "fecha";
      const matchFechaReintento = linea.match(RE_FECHA_COMPACTA);
      const matchFechaRelReintento = linea.match(RE_FECHA_RELATIVA);
      const matchEstadoReintento = linea.match(RE_ESTADO_COMPACTO);
      if (matchEstadoReintento) {
        const clave = matchEstadoReintento[1].toLowerCase().replace(/\s+/g, " ");
        estadoActual = ESTADOS_COMPACTO_A_BACKEND[clave] || "finalizado";
        pendiente = {};
        esperando = "fecha";
      } else if (matchFechaReintento) {
        estadoActual = null;
        horaActual = null;
        const [, dia, mes] = matchFechaReintento;
        fechaActualISO = fechaCompactaISO(dia, mes, anio, hoyUTC);
        fechaActualTexto = linea;
        if (!fechaActualISO) avisos.push(`No se ha entendido la fecha "${linea}".`);
        pendiente = {};
        esperando = "hora";
      } else if (matchFechaRelReintento) {
        estadoActual = null;
        horaActual = null;
        fechaActualISO = fechaRelativaISO(matchFechaRelReintento[1], hoyUTC);
        fechaActualTexto = linea;
        pendiente = {};
        esperando = "hora";
      }
      continue;
    }

    // "Jornada 3 de 38", "Fase de grupos · Jornada 2 de 38" y
    // cualquier otra línea suelta (cabeceras de jornada, etc.) se
    // ignoran silenciosamente.
  }
  cerrarPendienteIncompleto();

  return { partidos, avisos };
}

function normalizarNombreMesEs(mes) {
  return mes
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Convierte "28" + "Agosto" + año en "YYYY-MM-DD".
function fechaImportISO(dia, mesTexto, anio) {
  const mesIdx = MESES_ES[normalizarNombreMesEs(mesTexto)];
  if (mesIdx === undefined) return null;
  const d = String(parseInt(dia, 10)).padStart(2, "0");
  const m = String(mesIdx + 1).padStart(2, "0");
  return `${anio}-${m}-${d}`;
}

// Alias de nombres de equipo: cubre apodos o formas habituales con las
// que puede llegar un equipo en el texto pegado y que, aun normalizando
// y comparando por palabras, no encajarían con su nombre real en
// CLUBS_BY_CATEGORY (p.ej. "Atlético de Madrid B", que en clubs.js es
// "Atlético Madrileño": "madrid" y "madrileño" no son la misma palabra
// por subcadena). La clave es el texto normalizado (ver
// normalizarTextoBusquedaClub, sin puntos) tal cual puede llegar; el
// valor es el nombre EXACTO tal cual aparece en CLUBS_BY_CATEGORY, que
// es justo lo que hay que devolver siempre que se detecte este alias.
const ALIAS_NOMBRES_EQUIPO = {
  "atletico de madrid b": "Atlético Madrileño",
  "atletico madrid b": "Atlético Madrileño",
  "hercules de alicante": "Hércules CF",
  // El nombre oficial en clubs.js es "Real Sporting", pero el texto
  // pegado (Flashscore, prensa, etc.) casi siempre lo llama "Sporting
  // de Gijón" o "Sporting Gijón" a secas -- ninguna de las dos formas
  // comparte ninguna palabra con "real sporting" (ni "real" ni
  // "gijón"/"de" aparecen en el nombre oficial), así que la heurística
  // de coincidencia por palabras nunca los emparejaba y el partido se
  // importaba con el nombre tal cual venía en el texto.
  "sporting de gijon": "Real Sporting",
  "sporting gijon": "Real Sporting",
  // Nombres cortos/comerciales que usa ESPN en Segunda Federación y
  // que no comparten palabras suficientes con el nombre oficial de
  // clubs.js como para que las heurísticas los emparejen solas.
  "ud sanse": "UD San Sebastián de los Reyes",
  "sanse": "UD San Sebastián de los Reyes",
  "penya deportiva": "SCR Peña Deportiva",
  "pena deportiva": "SCR Peña Deportiva",
  "cs puertollano": "Calvo Sotelo Puertollano",
  "puertollano": "Calvo Sotelo Puertollano",
  // "Osasuna Promesas" no comparte ninguna palabra con "Atlético
  // Osasuna B" salvo "osasuna", que por sí sola también encaja con el
  // primer equipo.
  "osasuna promesas": "Atlético Osasuna B",
  "calamocha": "CF Calamocha",
  "barca atletic": "FC Barcelona Atlètic",
};

// Devuelve el nombre exacto de CLUBS_BY_CATEGORY si el texto coincide
// con un alias conocido, o null si no aplica ningún alias.
function resolverAliasNombreEquipo(nombreTexto) {
  const limpiar = (t) => normalizarTextoBusquedaClub(t).replace(/\./g, "");
  return ALIAS_NOMBRES_EQUIPO[limpiar(nombreTexto)] || null;
}

// Sufijo de filial de un nombre ya normalizado: "b" para "ud logrones
// b", "c" para "atletico de madrid c", "" para un primer equipo. Sirve
// para no dejar que las heurísticas de coincidencia parcial emparejen
// un filial con su primer equipo (o al revés): "UD Logroñés B"
// (Segunda Federación) contiene literalmente "UD Logroñés" (Primera
// Federación), así que sin esta comprobación el partido se importaba
// con el nombre y la competición del primer equipo.
function sufijoFilialEquipo(nombreNormalizado) {
  const m = nombreNormalizado.match(/\s([bc])$/);
  return m ? m[1] : "";
}

// Reconoce la competición de un partido a partir de los nombres de
// los dos equipos, reutilizando las listas de clubs.js. Si ambos
// equipos aparecen en la misma competición, se usa esa. Si solo uno
// de los dos se reconoce, se usa la de ese. Si no se reconoce
// ninguno, se deja sin determinar (el partido se marca como "revisar
// manualmente" en la vista previa, no se importa solo).
function detectarCompeticionPorEquipos(nombreLocal, nombreVisitante) {
  const candidatosLocal = buscarCompeticionesDeEquipo(nombreLocal);
  const candidatosVisitante = buscarCompeticionesDeEquipo(nombreVisitante);
  const comun = candidatosLocal.find(c => candidatosVisitante.includes(c));
  if (comun) return comun;
  if (candidatosLocal.length) return candidatosLocal[0];
  if (candidatosVisitante.length) return candidatosVisitante[0];
  return null;
}

// Todas las competiciones (de CLUBS_BY_CATEGORY) en las que aparece
// un equipo cuyo nombre coincide (exacto o parcial, con la misma
// normalización que ya usa buscarClubesPorTexto en clubs.js) con el
// texto dado.
function buscarCompeticionesDeEquipo(nombreTexto) {
  // Alias conocido (ver ALIAS_NOMBRES_EQUIPO): se busca directamente
  // la competición de ese nombre exacto, sin heurísticas.
  const alias = resolverAliasNombreEquipo(nombreTexto);
  if (alias) {
    const encontradas = [];
    for (const categoria of Object.keys(CLUBS_BY_CATEGORY)) {
      if (getClubsForCategoria(categoria).includes(alias)) encontradas.push(categoria);
    }
    return encontradas;
  }
  const limpiar = (t) => normalizarTextoBusquedaClub(t).replace(/\./g, "");
  const q = limpiar(nombreTexto);
  if (!q) return [];
  const qSinSigla = q.replace(/^(cd|ud|sd|cf|rc|rcd|ce|cp|ad|fc|ub)\s+/, "");
  const palabrasTexto = qSinSigla.split(" ").filter(w => w.length > 1);
  const encontradas = [];
  for (const categoria of Object.keys(CLUBS_BY_CATEGORY)) {
    for (const nombre of getClubsForCategoria(categoria)) {
      const nombreNorm = limpiar(nombre);
      const sinSigla = nombreNorm.replace(/^(cd|ud|sd|cf|rc|rcd|ce|cp|ad|fc|ub)\s+/, "");
      const coincideParcial = (nombreNorm.includes(q) || q.includes(sinSigla)) && sinSigla.length > 3;
      const coincidePorPalabras = palabrasTexto.length && palabrasTexto.every(w => sinSigla.includes(w));
      // Caso inverso: el texto trae el nombre oficial completo más
      // alguna palabra descriptiva extra ("Hércules de Alicante" para
      // "Hércules CF"): basta con que TODAS las palabras del nombre
      // oficial (sin sigla) estén contenidas en el texto, aunque el
      // texto tenga más palabras de las que hay en el nombre oficial.
      // (Esto NO cubre casos como "Sporting de Gijón" -> "Real
      // Sporting", donde ninguna palabra del nombre oficial aparece en
      // el texto pegado; esos van en ALIAS_NOMBRES_EQUIPO arriba.)
      const palabrasOficial = sinSigla.split(" ").filter(w => w.length > 1);
      const coincidePorPalabrasInversa = palabrasOficial.length && palabrasOficial.every(w => qSinSigla.includes(w));
      // Un filial y su primer equipo nunca son el mismo club aunque
      // uno contenga al otro: si los sufijos "B"/"C" no coinciden, las
      // coincidencias aproximadas no valen (las exactas no llegan aquí).
      const mismoFilial = sufijoFilialEquipo(q) === sufijoFilialEquipo(nombreNorm);
      if (nombreNorm === q || sinSigla === q || nombreNorm === qSinSigla || sinSigla === qSinSigla ||
          (mismoFilial && (coincideParcial || coincidePorPalabras || coincidePorPalabrasInversa))) {
        if (!encontradas.includes(categoria)) encontradas.push(categoria);
        break;
      }
    }
  }
  return encontradas;
}

// Devuelve el nombre "oficial" (tal y como está en clubs.js) más
// parecido a un nombre suelto del texto pegado, dentro de una
// competición ya determinada. Si no encuentra nada parecido, se
// queda con el nombre tal cual venía en el texto (se podrá corregir
// a mano después, como "Otro equipo").
function nombreOficialEquipo(nombreTexto, competicion) {
  if (!competicion) return nombreTexto;
  // Alias conocido: si el nombre alias pertenece a esta competición,
  // se devuelve directamente sin heurísticas de por medio.
  const alias = resolverAliasNombreEquipo(nombreTexto);
  if (alias && getClubsForCategoria(competicion).includes(alias)) return alias;
  // Quita puntos sueltos ("A. D. Ceuta" -> "a d ceuta", "R. Sociedad B"
  // -> "r sociedad b") para que las siglas con puntos también encajen.
  const limpiar = (t) => normalizarTextoBusquedaClub(t).replace(/\./g, "");
  const q = limpiar(nombreTexto);
  const qSinSigla = q.replace(/^(cd|ud|sd|cf|rc|rcd|ce|cp|ad|fc|ub)\s+/, "");
  let mejor = null;
  let mejorPuntuacion = -1;
  for (const nombre of getClubsForCategoria(competicion)) {
    const nombreNorm = limpiar(nombre);
    const sinSigla = nombreNorm.replace(/^(cd|ud|sd|cf|rc|rcd|ce|cp|ad|fc|ub)\s+/, "");
    if (nombreNorm === q || sinSigla === q || nombreNorm === qSinSigla || sinSigla === qSinSigla) {
      return nombre; // coincidencia exacta, no hace falta seguir
    }
    // Coincidencia parcial: se queda con la más larga que aparezca
    // contenida (evita que "r sociedad b" empareje antes con "real
    // sociedad" -sin el filial "b"- que con "real sociedad b").
    let puntuacion = -1;
    // Igual que en buscarCompeticionesDeEquipo: filial y primer
    // equipo no se emparejan entre sí por coincidencia aproximada.
    const mismoFilial = sufijoFilialEquipo(q) === sufijoFilialEquipo(nombreNorm);
    if (mismoFilial && (nombreNorm.includes(q) || q.includes(sinSigla))) puntuacion = sinSigla.length;
    // Coincidencia por palabras: todas las palabras del nombre del
    // texto (quitando siglas comunes) están en el nombre oficial, en
    // cualquier orden ("r sociedad b" -> palabras "sociedad","b").
    const palabrasTexto = qSinSigla.split(" ").filter(w => w.length > 1);
    if (mismoFilial && palabrasTexto.length && palabrasTexto.every(w => sinSigla.includes(w))) {
      puntuacion = Math.max(puntuacion, sinSigla.length);
    }
    if (puntuacion > mejorPuntuacion) {
      mejorPuntuacion = puntuacion;
      mejor = nombre;
    }
  }
  return mejor || nombreTexto;
}

// ---------- PARSER DEL TEXTO PEGADO ----------
// Recorre el texto línea a línea. Cada bloque de partido tiene esta
// forma (algunas líneas pueden faltar si el partido aún no se ha
// jugado):
//   * Finalizado
//   [Equipo local](url)
//   [N - M](url)              <- o el marcador puede venir vacío/ausente si no se ha jugado
//   [Equipo visitante](url)
//   [Ver crónica](url)        <- se ignora
//   [Más apuestas](url)       <- se ignora (publicidad de apuestas)
function analizarTextoImportacion(texto, anio) {
  const lineasDeteccion = texto.split("\n").map(l => l.trim()).filter(l => l !== "");
  const formato = detectarFormatoTexto(lineasDeteccion);
  if (formato === "compacto") {
    return analizarTextoImportacionCompacto(texto, anio);
  }
  if (formato === "besoccer") {
    return analizarTextoImportacionBesoccer(texto, anio);
  }
  if (formato === "espn") {
    return analizarTextoImportacionEspn(texto, anio);
  }
  return analizarTextoImportacionMarkdown(texto, anio);
}

// Parser del formato 1 ("markdown": enlaces "[Equipo](url)" y fechas
// en español tipo "Viernes 28 de Agosto"). Es el parser original.
function analizarTextoImportacionMarkdown(texto, anio) {
  const lineas = texto.split("\n").map(l => l.trim()).filter(l => l !== "");
  const partidos = [];
  const avisos = [];
  let fechaActualISO = null;
  let fechaActualTexto = null;
  let estadoActual = null;
  let pendiente = null; // { local, marcadorTexto }

  const cerrarPendienteSinVisitante = () => {
    if (pendiente) {
      avisos.push(`No se ha podido leer el rival de "${pendiente.local}" (${fechaActualTexto || "fecha desconocida"}); se ha omitido.`);
      pendiente = null;
    }
  };

  for (const lineaOriginal of lineas) {
    const linea = lineaOriginal;

    // Cabecera de día: "Viernes 28 de Agosto"
    const matchDia = linea.match(RE_CABECERA_DIA);
    if (matchDia) {
      cerrarPendienteSinVisitante();
      const [, , dia, mes] = matchDia;
      fechaActualISO = fechaImportISO(dia, mes, anio);
      fechaActualTexto = linea;
      if (!fechaActualISO) avisos.push(`No se ha entendido la fecha "${linea}".`);
      continue;
    }

    // Estado del partido: "* Finalizado", "* En juego"...
    if (linea.startsWith("*")) {
      cerrarPendienteSinVisitante();
      const textoEstado = linea.replace(/^\*+/, "").trim().toLowerCase();
      estadoActual = ESTADOS_TEXTO_A_BACKEND[textoEstado] || null;
      if (!estadoActual) avisos.push(`Estado de partido no reconocido: "${linea}" (se asumirá "Por jugar").`);
      continue;
    }

    // Líneas que se ignoran siempre, aunque tengan forma de enlace.
    if (/^\[Ver cr[oó]nica\]/i.test(linea) || /^\[M[aá]s apuestas\]/i.test(linea)) {
      continue;
    }
    if (/^gestionado por$/i.test(linea) || /^AD$/.test(linea) || /^\+18\b/.test(linea) || /^Actualizado a las/i.test(linea)) {
      continue;
    }

    // Marcador: "[N - M](url)"
    const matchMarcador = linea.match(RE_MARCADOR);
    if (matchMarcador && pendiente) {
      pendiente.golesLocal = parseInt(matchMarcador[1], 10);
      pendiente.golesVisitante = parseInt(matchMarcador[2], 10);
      continue;
    }

    // Enlace de equipo: "[Nombre](url)"
    const matchEnlace = linea.match(RE_ENLACE);
    if (matchEnlace) {
      const nombre = matchEnlace[1].trim();
      if (!pendiente) {
        // Primer equipo del bloque: el local.
        pendiente = { local: nombre, golesLocal: null, golesVisitante: null };
      } else if (!pendiente.visitante) {
        // Segundo equipo: el visitante. Con esto el partido queda
        // completo y se cierra el bloque.
        pendiente.visitante = nombre;
        const competicion = detectarCompeticionPorEquipos(pendiente.local, pendiente.visitante);
        const nombreLocalOficial = nombreOficialEquipo(pendiente.local, competicion);
        const nombreVisitanteOficial = nombreOficialEquipo(pendiente.visitante, competicion);
        const tieneMarcador = pendiente.golesLocal !== null && pendiente.golesVisitante !== null;
        let estadoFinal = estadoActual;
        if (!estadoFinal) estadoFinal = tieneMarcador ? "finalizado" : "programado";
        partidos.push({
          fecha_iso: fechaActualISO,
          fecha_texto: fechaActualTexto,
          hora: null, // el formato markdown no trae hora en el texto pegado
          competicion,
          equipo_local: nombreLocalOficial,
          equipo_visitante: nombreVisitanteOficial,
          equipo_local_original: pendiente.local,
          equipo_visitante_original: pendiente.visitante,
          goles_local: pendiente.golesLocal,
          goles_visitante: pendiente.golesVisitante,
          estado: estadoFinal,
        });
        pendiente = null;
      }
      continue;
    }
    // Cualquier otra línea suelta se ignora silenciosamente (pies de
    // foto, avisos legales de la casa de apuestas, etc.).
  }
  cerrarPendienteSinVisitante();

  return { partidos, avisos };
}

// ---------- DEDUCCIÓN DE JORNADA ----------
// Usa el calendario de jornadas ya guardado en el panel ("Resultados
// > Calendario de jornadas") para encontrar, a partir de la fecha del
// partido, la jornada que le corresponde. Si no hay ningún rango que
// cubra esa fecha, devuelve null (se usará entonces el valor de
// respaldo que haya escrito el usuario, si lo hay).
let CACHE_JORNADAS_CALENDARIO = null;

async function cargarCacheJornadasCalendario() {
  if (CACHE_JORNADAS_CALENDARIO) return CACHE_JORNADAS_CALENDARIO;
  try {
    const { jornadas = [] } = await apiFetch(`/api/jornadas-calendario`);
    CACHE_JORNADAS_CALENDARIO = jornadas;
  } catch {
    // Si el usuario conectado no es admin (o falla la petición), no
    // hay calendario disponible: se seguirá con el valor de respaldo.
    CACHE_JORNADAS_CALENDARIO = [];
  }
  return CACHE_JORNADAS_CALENDARIO;
}

function deducirJornadaPorFecha(competicion, fechaISO) {
  if (!CACHE_JORNADAS_CALENDARIO || !fechaISO || !competicion) return null;
  const filas = CACHE_JORNADAS_CALENDARIO.filter(j =>
    j.competicion === competicion && j.fecha_inicio <= fechaISO && j.fecha_fin >= fechaISO
  );
  if (!filas.length) return null;
  // Si hay varias (no debería, pero por si acaso), la más reciente.
  filas.sort((a, b) => (a.fecha_inicio < b.fecha_inicio ? 1 : -1));
  return filas[0].jornada;
}

// ---------- BÚSQUEDA DE PARTIDO YA EXISTENTE ----------
// Un partido pegado se considera "el mismo" que uno ya guardado si
// coincide la competición, el mismo día (no hace falta la hora, que
// el texto pegado no trae) y los mismos dos equipos (en cualquier
// orden, por si alguna vez vinieran cambiados local/visitante).
async function buscarResultadoExistente(partido) {
  if (!partido.competicion) return null;
  const { results = [] } = await apiFetch(
    `/api/results?competicion=${encodeURIComponent(partido.competicion)}&limit=500`
  );
  return results.find(r => {
    const mismoDia = (r.fecha_partido || "").slice(0, 10) === partido.fecha_iso;
    if (!mismoDia) return false;
    const mismosEquiposEnOrden = r.equipo_local === partido.equipo_local && r.equipo_visitante === partido.equipo_visitante;
    const mismosEquiposCruzados = r.equipo_local === partido.equipo_visitante && r.equipo_visitante === partido.equipo_local;
    return mismosEquiposEnOrden || mismosEquiposCruzados;
  }) || null;
}

// ---------- GRUPOS POR COMPETICIÓN ----------
// Mismo mapa que usa el formulario normal de "+ Nuevo resultado"
// (ver GRUPOS_POR_COMPETICION en admin.js): el grupo solo aplica en
// Primera y Segunda Federación, que tienen varias ligas regionales.
const GRUPOS_POR_COMPETICION_IMPORT = {
  primera_federacion: ["Grupo 1", "Grupo 2"],
  segunda_federacion: ["Grupo 1", "Grupo 2", "Grupo 3", "Grupo 4", "Grupo 5"],
};

function grupoEsObligatorio(competicion) {
  return !!(competicion && (GRUPOS_POR_COMPETICION_IMPORT[competicion] || []).length);
}

// Un partido está listo para importarse solo si tiene competición,
// fecha, y (cuando la competición tiene grupos regionales) grupo, y
// además ubicación siempre rellenada.
function partidoImportable(p) {
  if (!p.competicion) return false;
  if (!p.fecha_iso) return false;
  if (!p.ubicacion || !p.ubicacion.trim()) return false;
  if (grupoEsObligatorio(p.competicion) && !p.grupo) return false;
  return true;
}

// ---------- UI ----------
let ANALISIS_IMPORT_RAPIDA = []; // partidos ya "resueltos" (con existente/nuevo) tras analizar

function escaparHtmlImportRapida(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function actualizarContadorImportRapida() {
  const textarea = document.getElementById("importRapidaTexto");
  const contador = document.getElementById("importRapidaContador");
  if (!textarea || !contador) return;
  const texto = textarea.value;
  if (!texto.trim()) { contador.textContent = ""; return; }
  const lineas = texto.split("\n").filter(l => l.trim() !== "").length;
  const caracteres = texto.length;
  contador.textContent = `${lineas} línea(s) · ${caracteres} caracteres`;
}

function ponerBotonCargando(btn, textoCargando) {
  if (!btn) return;
  btn.dataset.textoOriginal = btn.querySelector(".import-rapida-btn-texto")?.textContent || btn.textContent;
  const spanTexto = btn.querySelector(".import-rapida-btn-texto");
  if (spanTexto) spanTexto.textContent = textoCargando;
  btn.classList.add("import-rapida-cargando");
  btn.disabled = true;
}

function quitarBotonCargando(btn) {
  if (!btn) return;
  const spanTexto = btn.querySelector(".import-rapida-btn-texto");
  if (spanTexto && btn.dataset.textoOriginal) spanTexto.textContent = btn.dataset.textoOriginal;
  btn.classList.remove("import-rapida-cargando");
  btn.disabled = false;
}

function iniciarImportacionRapidaUI() {
  const inputAnio = document.getElementById("importRapidaAnio");
  if (inputAnio && !inputAnio.value) inputAnio.value = new Date().getFullYear();

  document.getElementById("btnImportRapidaAnalizar")?.addEventListener("click", analizarImportacionRapida);
  document.getElementById("btnImportRapidaCancelar")?.addEventListener("click", () => {
    document.getElementById("importRapidaResultadoAnalisis").style.display = "none";
    document.getElementById("importRapidaResultadoFinal").style.display = "none";
  });
  document.getElementById("btnImportRapidaConfirmar")?.addEventListener("click", confirmarImportacionRapida);

  const textarea = document.getElementById("importRapidaTexto");
  textarea?.addEventListener("input", actualizarContadorImportRapida);
  actualizarContadorImportRapida();
}

async function analizarImportacionRapida() {
  const texto = document.getElementById("importRapidaTexto").value;
  const anio = parseInt(document.getElementById("importRapidaAnio").value, 10) || new Date().getFullYear();
  if (!texto.trim()) return EOF.toast("Pega primero el texto con los partidos", "error");

  const btn = document.getElementById("btnImportRapidaAnalizar");
  ponerBotonCargando(btn, "Analizando…");
  try {
    const { partidos, avisos } = analizarTextoImportacion(texto, anio);
    if (!partidos.length) {
      EOF.toast("No se ha detectado ningún partido en el texto", "error");
      return;
    }
    await cargarCacheJornadasCalendario();

    // Para cada partido detectado: busca si ya existe, y deduce la
    // jornada (calendario de jornadas, o el valor de respaldo).
    const jornadaFallback = parseInt(document.getElementById("importRapidaJornadaFallback").value, 10);
    const resueltos = [];
    for (const p of partidos) {
      let existente = null;
      let errorBusqueda = null;
      if (p.competicion && p.fecha_iso) {
        try {
          existente = await buscarResultadoExistente(p);
        } catch (err) {
          errorBusqueda = err.message;
        }
      }
      const jornadaDeducida = deducirJornadaPorFecha(p.competicion, p.fecha_iso);
      const jornadaFinal = jornadaDeducida ?? (Number.isInteger(jornadaFallback) ? jornadaFallback : (existente?.jornada ?? null));
      // Grupo y ubicación: si ya existe un resultado guardado en BD para
      // este partido, se respeta lo que tenga (puede haberse editado a
      // mano). Si no existe, se autorellena a partir del equipo local
      // (getGrupoClub/getEstadioClub, ver clubs.js). Para el grupo, si el
      // local no tiene grupo conocido (p.ej. un filial de Segunda
      // Federación sin grupos aún asignados), se prueba con el
      // visitante antes de dejarlo en blanco para elegir a mano. La
      // ubicación NUNCA debe tomarse del visitante: un partido se juega,
      // salvo excepción puntual, en el campo del equipo LOCAL, así que si
      // este no tiene estadio conocido en ESTADIO_POR_CLUB, el campo se
      // deja en blanco para rellenar a mano en vez de mostrar por error
      // el estadio del rival.
      const grupoLocal = getGrupoClub(p.equipo_local);
      const grupoVisitante = getGrupoClub(p.equipo_visitante);
      const grupoAuto = grupoLocal || grupoVisitante || "";
      // Si los DOS equipos tienen grupo conocido y es el mismo, ese
      // grupo es un dato objetivo de la competición, así que manda
      // sobre lo que hubiera guardado en BD: así se corrigen partidos
      // que se importaron en su día con el grupo equivocado (p.ej.
      // porque el nombre del equipo no se resolvió bien y el grupo se
      // dedujo del rival). Solo se respeta lo existente si los grupos
      // no coinciden o si alguno de los dos equipos no se reconoce.
      const grupoSeguro = (grupoLocal && grupoLocal === grupoVisitante) ? grupoLocal : "";
      if (grupoLocal && grupoVisitante && grupoLocal !== grupoVisitante) {
        avisos.push(`"${p.equipo_local}" (${grupoLocal}) y "${p.equipo_visitante}" (${grupoVisitante}) figuran en grupos distintos: revisa el grupo de ese partido a mano.`);
      }
      const ubicacionAuto = getEstadioClub(p.equipo_local) || "";
      resueltos.push({
        ...p,
        existente,
        error_busqueda: errorBusqueda,
        jornada: jornadaFinal,
        grupo: grupoSeguro || existente?.grupo || grupoAuto,
        ubicacion: existente?.ubicacion || ubicacionAuto,
        // Hora del partido (solo aplica a partidos aún por jugar,
        // "programado"): si ya existe un resultado guardado con hora
        // (fecha_partido con "T"), se respeta esa; si no, la que se
        // haya detectado en el texto pegado (formato compacto, "►
        // 3:15"); si tampoco hay, queda vacía para poner a mano.
        hora: (existente?.fecha_partido && String(existente.fecha_partido).includes("T"))
          ? String(existente.fecha_partido).slice(11, 16)
          : (p.hora || ""),
        incluir: true,
      });
    }

    ANALISIS_IMPORT_RAPIDA = resueltos;
    pintarAnalisisImportacionRapida(resueltos, avisos);
    document.getElementById("importRapidaResultadoAnalisis")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } finally {
    quitarBotonCargando(btn);
  }
}

const ESTADOS_LABEL_IMPORT = {
  programado: "Por jugar", en_juego: "En juego", retrasado: "Retrasado",
  anulado: "Anulado", finalizado: "Finalizado",
};
const COMPETICION_LABEL_IMPORT = {
  hypermotion: "LaLiga Hypermotion", primera_federacion: "Primera Federación",
  segunda_federacion: "Segunda Federación", amistoso: "Amistoso",
};

function pintarAnalisisImportacionRapida(partidos, avisos) {
  const cont = document.getElementById("importRapidaLista");
  const statsCont = document.getElementById("importRapidaResumenStats");
  const avisosCont = document.getElementById("importRapidaAvisos");
  const nuevos = partidos.filter(p => partidoImportable(p) && !p.existente).length;
  const actualizan = partidos.filter(p => partidoImportable(p) && p.existente).length;
  const incompletos = partidos.filter(p => !partidoImportable(p)).length;

  statsCont.innerHTML = `
    <span class="import-rapida-stat import-rapida-stat-total">
      <span class="import-rapida-stat-numero">${partidos.length}</span> detectado(s)
    </span>
    <span class="import-rapida-stat import-rapida-stat-nuevos">
      <span class="import-rapida-stat-numero">${nuevos}</span> nuevo(s)
    </span>
    <span class="import-rapida-stat import-rapida-stat-actualizan">
      <span class="import-rapida-stat-numero">${actualizan}</span> se actualizarán
    </span>
    ${incompletos ? `
    <span class="import-rapida-stat import-rapida-stat-sincompeticion">
      <span class="import-rapida-stat-numero">${incompletos}</span> con datos por completar
    </span>` : ""}
  `;

  const avisosCompletos = [...avisos];
  if (incompletos) avisosCompletos.push(`${incompletos} partido(s) necesitan grupo, fecha y/o ubicación antes de poder importarse (rellénalos abajo).`);

  if (avisosCompletos.length) {
    avisosCont.style.display = "block";
    avisosCont.innerHTML = `⚠️ ${avisosCompletos.map(escaparHtmlImportRapida).join("<br>⚠️ ")}`;
  } else {
    avisosCont.style.display = "none";
    avisosCont.innerHTML = "";
  }

  cont.innerHTML = "";
  partidos.forEach((p, idx) => {
    const tieneMarcador = p.goles_local !== null && p.goles_visitante !== null;
    const marcador = tieneMarcador ? `${p.goles_local} - ${p.goles_visitante}` : "— - —";
    const importable = partidoImportable(p);

    const fila = document.createElement("div");
    fila.className = "import-rapida-fila";
    fila.style.animationDelay = `${Math.min(idx * 0.03, 0.6)}s`;
    if (!importable) fila.classList.add("import-rapida-fila-sin-competicion");
    if (!p.incluir) fila.classList.add("import-rapida-fila-excluida");

    const etiquetaAccion = importable
      ? (p.existente
          ? `<span class="import-rapida-fila-etiqueta import-rapida-etiqueta-actualiza">🔄 Actualizará #${p.existente.id}</span>`
          : `<span class="import-rapida-fila-etiqueta import-rapida-etiqueta-nuevo">🆕 Nuevo</span>`)
      : `<span class="import-rapida-fila-etiqueta import-rapida-etiqueta-sin-competicion">⚠️ Faltan datos</span>`;

    const estadoClave = ESTADOS_LABEL_IMPORT[p.estado] ? p.estado : "programado";

    // ---- Campos editables obligatorios: grupo, fecha, ubicación ----
    const opcionesGrupo = GRUPOS_POR_COMPETICION_IMPORT[p.competicion] || [];
    const necesitaGrupo = grupoEsObligatorio(p.competicion);
    const inputGrupo = necesitaGrupo
      ? `<select data-idx="${idx}" data-campo="grupo" class="import-rapida-input-editable importRapidaCampo ${p.grupo ? "" : "import-rapida-input-falta"}">
          <option value="">Grupo *</option>
          ${opcionesGrupo.map(g => `<option value="${escaparHtmlImportRapida(g)}" ${p.grupo === g ? "selected" : ""}>${escaparHtmlImportRapida(g)}</option>`).join("")}
        </select>`
      : "";

    const inputFecha = `<input type="date" data-idx="${idx}" data-campo="fecha_iso" class="import-rapida-input-editable importRapidaCampo ${p.fecha_iso ? "" : "import-rapida-input-falta"}" value="${p.fecha_iso || ""}" placeholder="Fecha *">`;

    // La hora solo aplica a partidos aún por jugar ("programado"): una
    // vez finalizado ya no hace falta (no se muestra ni se envía). No
    // es obligatoria para poder importar (partidoImportable no la
    // exige), pero se resalta en naranja si falta, igual que los
    // demás campos, porque para un partido programado es un dato
    // importante que conviene rellenar antes de publicar.
    const inputHora = estadoClave === "programado"
      ? `<input type="time" data-idx="${idx}" data-campo="hora" class="import-rapida-input-editable importRapidaCampo ${p.hora ? "" : "import-rapida-input-falta"}" value="${escaparHtmlImportRapida(p.hora || "")}" placeholder="Hora">`
      : "";

    const inputUbicacion = `<input type="text" data-idx="${idx}" data-campo="ubicacion" class="import-rapida-input-editable importRapidaCampo ${p.ubicacion && p.ubicacion.trim() ? "" : "import-rapida-input-falta"}" value="${escaparHtmlImportRapida(p.ubicacion || "")}" placeholder="Ubicación *">`;

    fila.innerHTML = `
      <label class="import-rapida-fila-check">
        <input type="checkbox" data-idx="${idx}" class="importRapidaCheck" ${importable ? "checked" : "disabled"}>
      </label>
      <div class="import-rapida-fila-info">
        <div class="import-rapida-fila-partido">
          <span class="import-rapida-fila-equipo">${escaparHtmlImportRapida(p.equipo_local)}</span>
          <span class="import-rapida-fila-marcador ${tieneMarcador ? "" : "import-rapida-marcador-vacio"}">${marcador}</span>
          <span class="import-rapida-fila-equipo">${escaparHtmlImportRapida(p.equipo_visitante)}</span>
        </div>
        <div class="import-rapida-fila-meta">
          <span class="import-rapida-chip">${p.competicion ? (COMPETICION_LABEL_IMPORT[p.competicion] || p.competicion) : "competición no reconocida"}</span>
          <span class="import-rapida-chip">Jornada ${p.jornada ?? "—"}</span>
          <span class="import-rapida-chip import-rapida-chip-estado-${estadoClave}">${ESTADOS_LABEL_IMPORT[p.estado] || p.estado}</span>
        </div>
        <div class="import-rapida-fila-campos">
          ${inputFecha}
          ${inputHora}
          ${inputGrupo}
          ${inputUbicacion}
        </div>
      </div>
      ${etiquetaAccion}
    `;
    cont.appendChild(fila);
  });

  cont.querySelectorAll(".importRapidaCheck").forEach(chk => {
    chk.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      ANALISIS_IMPORT_RAPIDA[idx].incluir = e.target.checked;
      e.target.closest(".import-rapida-fila")?.classList.toggle("import-rapida-fila-excluida", !e.target.checked);
    });
  });

  // Campos editables (fecha/grupo/ubicación): al cambiar, se
  // actualiza el partido en memoria y se repinta esa fila para
  // recalcular si ya es importable (activa/desactiva su checkbox).
  cont.querySelectorAll(".importRapidaCampo").forEach(campo => {
    campo.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      const nombreCampo = e.target.dataset.campo;
      ANALISIS_IMPORT_RAPIDA[idx][nombreCampo] = e.target.value;
      pintarAnalisisImportacionRapida(ANALISIS_IMPORT_RAPIDA, avisos);
    });
  });

  document.getElementById("importRapidaResultadoAnalisis").style.display = "block";
  document.getElementById("importRapidaResultadoFinal").style.display = "none";
}

async function confirmarImportacionRapida() {
  const seleccionados = ANALISIS_IMPORT_RAPIDA.filter(p => p.incluir && partidoImportable(p));
  if (!seleccionados.length) return EOF.toast("No hay ningún partido marcado y completo para importar (revisa grupo, fecha y ubicación)", "error");

  const btn = document.getElementById("btnImportRapidaConfirmar");
  ponerBotonCargando(btn, "Importando…");

  const log = document.getElementById("importRapidaLog");
  log.innerHTML = "";
  let creados = 0, actualizados = 0, fallidos = 0;
  let i = 0;

  for (const p of seleccionados) {
    const fila = document.createElement("div");
    fila.className = "import-rapida-log-fila";
    fila.style.animationDelay = `${Math.min(i * 0.04, 0.6)}s`;
    i++;
    try {
      // Si el partido está programado (aún por jugar) y se conoce la
      // hora, se envía junto a la fecha como "YYYY-MM-DDTHH:MM" (mismo
      // formato que usa el formulario normal, ver r_fecha en admin.js).
      // Si ya ha finalizado o no se conoce la hora, se manda solo el
      // día, igual que antes.
      const fechaPartidoConHora = (p.estado === "programado" && p.hora)
        ? `${p.fecha_iso}T${p.hora}`
        : p.fecha_iso;
      const body = {
        competicion: p.competicion,
        grupo: p.grupo || "",
        jornada: p.jornada ?? 0,
        fecha_partido: fechaPartidoConHora,
        estado: p.estado,
        fecha_partido_retrasado: null,
        ubicacion: p.ubicacion,
        equipo_local: p.equipo_local,
        goles_local: p.goles_local,
        equipo_visitante: p.equipo_visitante,
        goles_visitante: p.goles_visitante,
        escudo_local_url: null,
        escudo_visitante_url: null,
      };
      if (p.existente) {
        // confirmar_duplicado: la actualización de un partido ya
        // identificado en la vista previa no debe frenarse por un aviso
        // de "hay otro partido parecido" (el bloqueo duro por mismo
        // enfrentamiento en la misma jornada sigue aplicándose en el
        // servidor y llegará aquí como error normal).
        await apiFetch(`/api/results/${p.existente.id}`, { method: "PUT", body: JSON.stringify({ ...body, confirmar_duplicado: true }) });
        actualizados++;
        fila.classList.add("import-rapida-log-fila-ok");
        fila.innerHTML = `<span class="import-rapida-log-icono">✅</span> Actualizado: <strong>${escaparHtmlImportRapida(p.equipo_local)}</strong> ${p.goles_local ?? "-"} - ${p.goles_visitante ?? "-"} <strong>${escaparHtmlImportRapida(p.equipo_visitante)}</strong> (#${p.existente.id})`;
      } else {
        try {
          await apiFetch(`/api/results`, { method: "POST", body: JSON.stringify(body) });
        } catch (err) {
          if (err.status === 409 && err.data?.duplicado_bloqueante) {
            // Duplicado duro (mismos equipos, misma jornada): no se
            // crea ni confirmando. Se marca la fila como error para que
            // el redactor vea exactamente cuál se ha quedado fuera.
            throw err;
          }
          if (err.status === 409 && err.data?.posible_duplicado) {
            // Ya existía algo prácticamente idéntico (aunque nuestra
            // búsqueda por día no lo haya visto, p.ej. por diferencias
            // de hora): se crea igual, ya que el usuario ya confirmó
            // la importación de este partido en la vista previa.
            await apiFetch(`/api/results`, { method: "POST", body: JSON.stringify({ ...body, confirmar_duplicado: true }) });
          } else {
            throw err;
          }
        }
        creados++;
        fila.classList.add("import-rapida-log-fila-nuevo");
        fila.innerHTML = `<span class="import-rapida-log-icono">🆕</span> Creado: <strong>${escaparHtmlImportRapida(p.equipo_local)}</strong> ${p.goles_local ?? "-"} - ${p.goles_visitante ?? "-"} <strong>${escaparHtmlImportRapida(p.equipo_visitante)}</strong>`;
      }
    } catch (err) {
      fallidos++;
      fila.classList.add("import-rapida-log-fila-error");
      fila.innerHTML = `<span class="import-rapida-log-icono">❌</span> Error con ${escaparHtmlImportRapida(p.equipo_local)} vs ${escaparHtmlImportRapida(p.equipo_visitante)}: ${escaparHtmlImportRapida(err.message)}`;
    }
    log.appendChild(fila);
  }

  const resumen = document.createElement("div");
  resumen.className = "import-rapida-log-resumen";
  resumen.textContent = `Hecho: ${creados} creado(s), ${actualizados} actualizado(s)${fallidos ? `, ${fallidos} con error` : ""}.`;
  log.appendChild(resumen);

  document.getElementById("importRapidaResultadoFinal").style.display = "block";
  document.getElementById("importRapidaResultadoFinal")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  EOF.toast(`Importación terminada: ${creados} creados, ${actualizados} actualizados`, fallidos ? "error" : "exito");

  quitarBotonCargando(btn);

  // Si la pestaña de "Ver resultados" está cargada, se refresca para
  // que se vean ya los cambios sin tener que recargar la página.
  try { await cargaListaResultados(); } catch { /* no pasa nada si no aplica todavía */ }
}

document.addEventListener("DOMContentLoaded", iniciarImportacionRapidaUI);