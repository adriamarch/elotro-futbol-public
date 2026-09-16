// ---------- IMPORTACIÓN RÁPIDA DE EVENTOS DE PARTIDO ----------
// Hermano de importacion-rapida.js (que importa partidos/resultados),
// pero para el texto de alineaciones + goles + tarjetas tal cual se
// suele copiar de las crónicas, con esta forma:
//
//   Nàstic: Ayesa, Joseda, José Amo, Van Rijn, Manel Royo, Meshak,
//   Montalvo, Eugeni (Segura, 63'), Prohens, Shin (Subirats. 80'),
//   Bakis (Diego Gómez, 80).
//   Zaragoza: Westerveld, Gabilondo, Barrachina, Tachi, Escudero
//   (Pereira, 55'), Lucas Terrer (Rubén Díez, 82'), Ander Herrera
//   (Peter Ademo, 82'), Jaume Jardí, Marcos Cuenca (Vadillo, 55'),
//   Pau Sans, Joaquín.
//   Goles: Bakis (1-0, 1'), Segura (2-0, 86')
//   Tarjetas amarillas: Lucas Terrer (27'), Barrachina (41'), Eugeni
//   (43'), Escudero (44'), Pau Sans (58'), Ander Herrera (79')
//
// A partir de esto se busca el partido ya guardado (mismo día, mismos
// dos equipos, igual que hace importacion-rapida.js) y, si se
// encuentra y se confirma:
//   - se crea/actualiza la ALINEACIÓN de cada equipo (once inicial +
//     suplentes que entraron, ver POST/PUT /api/alineaciones), con los
//     cambios ya reflejados como "titular:false" con el resto de
//     suplentes que no jugaron fuera de la lista;
//   - se crean los EVENTOS del partido (POST /api/results/:id/eventos):
//     un "cambio" por cada sustitución detectada en la alineación, un
//     "gol" por cada gol listado, y una "amarilla"/"roja"/
//     "doble_amarilla" por cada tarjeta listada.
// No se tocan goles_local/goles_visitante a mano: como los goles se
// crean como eventos de tipo "gol", el propio backend recalcula el
// marcador solo (recalcularMarcadorDesdeEventos).

// ---------- PARSER DEL TEXTO PEGADO ----------

// Cabecera de bloque "Equipo: ...", "Goles: ...", "Tarjetas amarillas: ...".
// Se admite con o sin tilde/mayúsculas y alguna variante de nombre.
const RE_CABECERA_EVENTOS = /^([^:]+):\s*(.*)$/s;

const CLAVES_GOLES = ["goles", "gol"];
const CLAVES_AMARILLAS = ["tarjetas amarillas", "amarillas", "tarjeta amarilla"];
const CLAVES_ROJAS = ["tarjetas rojas", "rojas", "tarjeta roja"];
const CLAVES_DOBLES_AMARILLAS = ["dobles amarillas", "segunda amarilla", "segundas amarillas"];

function normalizarClaveCabecera(t) {
  return t
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Separa el texto pegado en bloques, cada uno con su cabecera
// ("Nàstic", "Zaragoza", "Goles", "Tarjetas amarillas"...) y su
// contenido (todo lo que hay hasta la siguiente cabecera, con las
// líneas unidas por espacio para poder partir por comas tranquilamente
// aunque el texto venga con saltos de línea a media frase, como en el
// ejemplo del enunciado).
function dividirEnBloques(texto) {
  const lineas = texto.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  const bloques = [];
  let actual = null;
  for (const linea of lineas) {
    const m = linea.match(RE_CABECERA_EVENTOS);
    // Solo se considera cabecera si lo de antes de los ":" es corto
    // (nombre de equipo o "Goles"/"Tarjetas..."), para no confundir
    // con una hora tipo "20:00" perdida en medio de una lista.
    if (m && m[1].trim().length <= 40 && !/^\d+$/.test(m[1].trim())) {
      actual = { cabecera: m[1].trim(), contenido: m[2].trim() ? [m[2].trim()] : [] };
      bloques.push(actual);
    } else if (actual) {
      actual.contenido.push(linea);
    }
  }
  return bloques.map((b) => ({ cabecera: b.cabecera, texto: b.contenido.join(" ").trim() }));
}

// Parte "A, B (C, 63'), D." en la lista de nombres respetando los
// paréntesis de sustitución (que también llevan una coma dentro).
function partirListaJugadores(texto) {
  const partes = [];
  let actual = "";
  let profundidad = 0;
  for (const ch of texto) {
    if (ch === "(") profundidad++;
    if (ch === ")") profundidad = Math.max(0, profundidad - 1);
    if (ch === "," && profundidad === 0) {
      partes.push(actual.trim());
      actual = "";
    } else {
      actual += ch;
    }
  }
  if (actual.trim()) partes.push(actual.trim());
  // Quita el punto final del último jugador ("Bakis (Diego Gómez, 80).")
  return partes.map((p) => p.replace(/\.\s*$/, "").trim()).filter(Boolean);
}

// "Eugeni (Segura, 63')" -> { nombre: "Eugeni", entra: "Segura", minuto: 63 }
// "Ayesa" -> { nombre: "Ayesa", entra: null, minuto: null }
// Admite "63'", "63’", "63" o "min. 63" dentro del paréntesis, y tanto
// coma como punto como separador antes del minuto (visto en el propio
// ejemplo: "Shin (Subirats. 80')").
const RE_JUGADOR_CON_CAMBIO = /^(.+?)\s*\(([^,()]+)[,.]\s*(\d{1,3})['’]?\)$/;

function analizarJugadorConPosibleCambio(texto) {
  const t = texto.trim();
  const m = t.match(RE_JUGADOR_CON_CAMBIO);
  if (m) {
    return {
      nombre: m[1].trim(),
      entra: m[2].trim(),
      minuto: parseInt(m[3], 10),
    };
  }
  return { nombre: t, entra: null, minuto: null };
}

// "Bakis (1-0, 1')" -> { jugador: "Bakis", marcador: "1-0", minuto: 1 }
// También admite venir sin marcador: "Bakis (1')".
const RE_GOL = /^(.+?)\s*\(([^)]*)\)\s*$/;

function analizarLineaGol(texto) {
  const m = texto.trim().match(RE_GOL);
  if (!m) return { jugador: texto.trim(), minuto: null, propia: false };
  const jugador = m[1].trim();
  const dentro = m[2].trim();
  const propia = /\bp\.?\s*p\.?\b|propia/i.test(dentro);
  const minutoMatch = dentro.match(/(\d{1,3})\s*['’]?\s*$/);
  const minuto = minutoMatch ? parseInt(minutoMatch[1], 10) : null;
  return { jugador, minuto, propia };
}

// "Lucas Terrer (27')" -> { jugador: "Lucas Terrer", minuto: 27 }
// También admite que dentro del paréntesis venga más texto además del
// minuto (p.ej. el equipo de un resultado vinculado: "Lucas Terrer (27',
// Real Zaragoza)"): igual que en analizarLineaGol, se busca el minuto al
// final de una de las partes separadas por coma/punto, no exigiendo que
// sea todo el contenido del paréntesis. Antes, cualquier texto extra ahí
// dentro hacía fallar la coincidencia y el minuto se perdía (quedaba a
// null, mostrado luego como "0'"), dejando el "(27')" pegado al nombre.
const RE_TARJETA = /^(.+?)\s*\(([^)]*)\)\s*$/;

function analizarLineaTarjeta(texto) {
  const m = texto.trim().match(RE_TARJETA);
  if (!m) return { jugador: texto.trim(), minuto: null };
  const jugador = m[1].trim();
  const dentro = m[2].trim();
  // El minuto puede venir en su propio trozo ("27', Real Zaragoza") o
  // pegado al final de todo el contenido; se prueba primero por trozos
  // (separados por coma o punto) y si no aparece ahí, al final de todo.
  const trozo = dentro.split(/[,.]/).find((p) => /\d{1,3}\s*['’]?\s*$/.test(p.trim()));
  const minutoMatch = (trozo ?? dentro).match(/(\d{1,3})\s*['’]?\s*$/);
  const minuto = minutoMatch ? parseInt(minutoMatch[1], 10) : null;
  return { jugador, minuto };
}

// Analiza el texto completo pegado y devuelve la estructura intermedia,
// sin resolver todavía a qué equipo local/visitante corresponde cada
// alineación (eso se hace al emparejar con el partido real, porque
// hasta entonces no se sabe con seguridad quién es local y quién
// visitante: el texto pegado no lo dice explícitamente).
function analizarTextoEventosPartido(texto) {
  const bloques = dividirEnBloques(texto);
  const avisos = [];
  const alineaciones = []; // [{ equipoTexto, jugadores: [{nombre, dorsal:null, titular, entra, minutoCambio}] }]
  const goles = []; // [{ jugadorTexto, minuto, propia }]
  const amarillas = [];
  const rojas = [];
  const dobleAmarillas = [];

  for (const bloque of bloques) {
    const clave = normalizarClaveCabecera(bloque.cabecera);
    if (CLAVES_GOLES.includes(clave)) {
      partirListaJugadores(bloque.texto).forEach((linea) => {
        const g = analizarLineaGol(linea);
        if (!g.jugador) return;
        goles.push(g);
      });
      continue;
    }
    if (CLAVES_AMARILLAS.includes(clave)) {
      partirListaJugadores(bloque.texto).forEach((linea) => {
        const t = analizarLineaTarjeta(linea);
        if (t.jugador) amarillas.push(t);
      });
      continue;
    }
    if (CLAVES_ROJAS.includes(clave)) {
      partirListaJugadores(bloque.texto).forEach((linea) => {
        const t = analizarLineaTarjeta(linea);
        if (t.jugador) rojas.push(t);
      });
      continue;
    }
    if (CLAVES_DOBLES_AMARILLAS.includes(clave)) {
      partirListaJugadores(bloque.texto).forEach((linea) => {
        const t = analizarLineaTarjeta(linea);
        if (t.jugador) dobleAmarillas.push(t);
      });
      continue;
    }
    // Cualquier otra cabecera se interpreta como el nombre de un
    // equipo con su alineación (once inicial + cambios entre paréntesis).
    const jugadoresTexto = partirListaJugadores(bloque.texto);
    if (!jugadoresTexto.length) {
      avisos.push(`No se ha podido leer la alineación de "${bloque.cabecera}".`);
      continue;
    }
    const jugadores = jugadoresTexto.map((jt) => {
      const info = analizarJugadorConPosibleCambio(jt);
      return {
        nombre: info.nombre,
        titular: true,
        sale_en: info.minuto,
        entra: info.entra || null,
      };
    });
    alineaciones.push({ equipoTexto: bloque.cabecera.trim(), jugadores });
  }

  return { alineaciones, goles, amarillas, rojas, dobleAmarillas, avisos };
}

// ---------- FORMATO FLASHSCORE (minuto a minuto sin equipo explícito) ----------
// Cuando se pega el "minuto a minuto" tal cual aparece en Flashscore, no
// hay bloques "Equipo: jugador, jugador..." como en la crónica: solo hay
// una cabecera de partido (que si se pega la página completa incluye los
// nombres de los dos equipos, duplicados por la maquetación a dos
// columnas) y luego una lista de eventos línea a línea, cada uno con un
// minuto y 1 o 2 nombres de jugador, SIN indicar a qué equipo pertenece.
// Aquí no se intenta adivinar el equipo por texto: se deja "sin
// determinar" y es el propio usuario quien lo fija a mano con un
// desplegable en la vista previa (ver pintarAnalisisImportacionEventos).

// Se distingue de la crónica por no encajar el patrón "Equipo: lista de
// jugadores separados por comas" y, en cambio, contener la marca de
// "1er Tiempo" / "2º Tiempo" (o variantes) junto con minutos sueltos
// tipo "27'" en líneas propias.
const RE_MARCA_PARTE = /(?:^|\s)(1e?r?\.?\s*tiempo|2[ºo]\.?\s*tiempo|1ª?\s*parte|2ª?\s*parte)(?:\s|$)/i;
const RE_MINUTO_SUELTO = /^(\d{1,3})(?:\+(\d{1,2}))?['’]$/;
const RE_MARCADOR_SUELTO = /^(\d{1,2})\s*-\s*(\d{1,2})$/;
// Flashscore añade a veces, en una línea propia justo tras el nombre del
// jugador, el motivo de una tarjeta amarilla entre paréntesis: "(Falta)"
// es la tarjeta amarilla estándar por falta; "(Simulación)" es la
// amarilla por simulación. Ambas cuentan como amarilla al jugador
// inmediatamente anterior. Otros motivos entre paréntesis que también
// aparecen en el minuto a minuto (p.ej. "(Lesión)" en una sustitución)
// no son tarjeta y se descartan sin más.
const RE_MOTIVO_AMARILLA = /^\((?:falta|simulaci[oó]n)\)$/i;
const RE_MOTIVO_IGNORABLE = /^\((?:lesi[oó]n|vaR|var)\)$/i;
// Un paréntesis que no es ninguno de los motivos anteriores y contiene
// texto (normalmente un nombre) es el asistente de un gol: Flashscore
// pone "(Nombre Asistente)" en su propia línea justo después del
// goleador, p.ej. "Fuentes A. (Luvumbo Z.)".
const RE_ASISTENTE = /^\((.+)\)$/;

function pareceTextoFlashscore(texto) {
  const t = texto.replace(/\r/g, "");
  // Se reconoce por traer la marca de parte ("1er Tiempo"/"2º Tiempo")
  // junto con al menos un minuto suelto tipo "27'", ya sea en su propia
  // línea (variante con saltos) o pegado en mitad de una línea larga
  // (variante en texto plano corrido).
  return RE_MARCA_PARTE.test(t) && /\d{1,3}['’]/.test(t);
}

// El texto de Flashscore puede venir pegado con saltos de línea (markdown
// con enlaces "[Nombre](url)") o todo en una sola línea corrida (texto
// plano copiado de la página, sin saltos). Se normaliza a una lista de
// "tokens" de línea, insertando saltos también delante de cada minuto
// suelto y de cada marcador suelto cuando venían pegados en una sola
// línea larga, así el resto del parser puede tratar ambas variantes
// igual (una línea = un token).
function tokenizarTextoFlashscore(texto) {
  let t = texto.replace(/\r/g, "");
  // Quita los enlaces markdown "[Nombre](url)" dejando solo "Nombre".
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Si el texto viene todo corrido en pocas líneas largas (típico del
  // copiado en texto plano), se insertan saltos de línea delante de cada
  // minuto ("27'") y delante de cada marcador ("1 - 0") para poder
  // tokenizar por líneas de la misma forma que la variante con saltos.
  t = t.replace(/(\d{1,3}(?:\+\d{1,2})?['’])/g, "\n$1\n");
  t = t.replace(/(\d{1,2}\s*-\s*\d{1,2})/g, "\n$1\n");
  const lineasBrutas = t.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  // Cuando el texto venía todo corrido en pocas líneas largas, un mismo
  // "renglón" puede contener dos nombres de jugador pegados sin ningún
  // separador entre ellos (p.ej. "Vadillo I. Cuenca M. A." son en
  // realidad dos jugadores: "Vadillo I." y "Cuenca M. A."). Los nombres
  // de Flashscore en este formato terminan casi siempre en un apellido
  // seguido de una o más iniciales con punto ("Terrer L.", "Cuenca M.
  // A."), así que se parte cada renglón justo después de cada inicial
  // con punto que no vaya seguida inmediatamente de otra inicial.
  const lineas = [];
  for (const l of lineasBrutas) {
    if (RE_MINUTO_SUELTO.test(l) || RE_MARCADOR_SUELTO.test(l) || RE_MARCA_PARTE.test(l)) {
      lineas.push(l);
      continue;
    }
    partirNombresPegados(limpiarRuidoNombre(l)).forEach((n) => lineas.push(n));
  }
  return lineas;
}

// "Vadillo I. Cuenca M. A." -> ["Vadillo I.", "Cuenca M. A."]
// "Bakis S." -> ["Bakis S."]
// Un nombre en este formato es "Apellido(s) Inicial." o "Apellido(s)
// Inicial. Inicial." (varias iniciales, como "Cuenca M. A."). Se
// detectan los límites entre nombres buscando dónde termina un grupo de
// iniciales y empieza una palabra que ya no es una sola inicial con
// punto (o sea, un apellido nuevo, con mayúscula y más de una letra).
//
// Apellidos con partícula ("El Jmili", "Van Persie", "De la Cruz"...)
// no llevan punto en la partícula, así que a veces se cortaban a media
// partícula al partir los nombres pegados (ver partirNombresPegados),
// dejando de un cambio de dos jugadores tres fragmentos en vez de dos
// (p.ej. "Barry M. El Jmili N." → "Barry M." / "El" / "Jmili N." en
// vez de los dos jugadores reales). RE_PARTICULA_APELLIDO se usa en
// repararNombresPendientes (más abajo) para recomponer esos casos.
const RE_PARTICULA_APELLIDO = /^(de|del|dos|das|da|di|van|von|el|al|bin|ibn|abu|santa|san)$/i;

function partirNombresPegados(texto) {
  const t = texto.trim();
  if (!t) return [];
  // Sin ninguna inicial con punto (nombres de un único término, tipo
  // "Eugeni" o "Jamelli"), no hay nada que partir salvo por espacio
  // simple cuando de verdad son dos nombres de una palabra cada uno
  // pegados (caso más raro; se deja tal cual porque no hay señal fiable
  // para partirlo sin arriesgar cortar nombres compuestos legítimos).
  if (!/\b[A-ZÀ-Ý]\.(?:\s*[A-ZÀ-Ý]\.)*/.test(t)) return [t];
  // Corta después de cada grupo de iniciales con punto (fin de un
  // nombre "Apellido I." o "Apellido I. I."), y también antes de un
  // "Apellido Inicial." que empieza justo después de una palabra sin
  // punto (caso "Jamelli Terrer L.": el primer jugador es de un solo
  // término, sin inicial propia, y el segundo ya trae su inicial).
  const partes = t
    .split(/(?<=[A-ZÀ-Ý]\.)\s+(?=[A-ZÀ-ÿ][\wÀ-ÿ'\-]*(?:\s|$))(?![A-ZÀ-Ý]\.)/)
    .flatMap((parte) => parte.split(/\s+(?=[A-ZÀ-Ý][\wÀ-ÿ'\-]*\s+[A-ZÀ-Ý]\.(?:\s*[A-ZÀ-Ý]\.)*\s*$)/));
  return partes.map((p) => p.trim()).filter(Boolean);
}

// Palabras sueltas de la interfaz de Flashscore que a veces quedan
// pegadas justo después del último jugador de la lista al copiar en
// texto plano (p.ej. "Segura C. Estadísticas" cuando "Estadísticas" es
// en realidad el enlace/botón que viene justo después en la página, no
// parte del nombre). Se recortan si aparecen como palabra suelta al
// final de un nombre.
const RUIDO_FINAL_FLASHSCORE = /\s+(Estadísticas|Alineaciones|Clasificación|Comentarios|Resumen|Vídeo|H2H)\s*$/i;

function limpiarRuidoNombre(nombre) {
  return nombre.replace(RUIDO_FINAL_FLASHSCORE, "").trim();
}

// Extrae los nombres de local/visitante de la cabecera de la página de
// Flashscore, si están (cuando se pega la página completa en vez de solo
// el bloque de eventos). El patrón típico al copiar en texto plano es
// que cada nombre aparece dos veces seguidas por la maquetación a dos
// columnas: "Nàstic Nàstic 2 - 0 Finalizado  Real Zaragoza Real
// Zaragoza ...". Si no se encuentra, se devuelve null y el usuario
// resolverá el equipo de cada evento a mano.
function extraerEquiposCabeceraFlashscore(texto) {
  const antesDeEventos = texto.split(RE_MARCA_PARTE)[0] || "";
  // "NombreEquipo NombreEquipo" (repetido) seguido en algún punto de
  // "Finalizado" y del mismo patrón para el rival.
  const m = antesDeEventos.match(/([A-ZÀ-Ý][\wÀ-ÿ'.\-]*(?:\s+[A-ZÀ-Ýa-zà-ÿ'.\-]+)*?)\s+\1\b[\s\S]*?\bFinalizado\b[\s\S]*?([A-ZÀ-Ý][\wÀ-ÿ'.\-]*(?:\s+[A-ZÀ-Ýa-zà-ÿ'.\-]+)*?)\s+\2\b/);
  if (!m) return null;
  const local = m[1].trim();
  const visitante = m[2].trim();
  if (!local || !visitante || local === visitante) return null;
  return { local, visitante };
}

// Repara los casos en los que, pese al partido en tokens de
// tokenizarTextoFlashscore, quedan más de dos nombres pendientes para
// un mismo evento (síntoma de que un apellido compuesto se ha cortado
// a medias, p.ej. por una partícula sin punto como "El", "Van", "De").
// Solo se aplica cuando de verdad sobran fragmentos (más de 2): se
// fusiona cada fragmento que sea una partícula de apellido, o que no
// termine en una inicial con punto (o sea, que no parezca un nombre
// "cerrado" por sí mismo), con el fragmento siguiente, hasta quedarse
// como mucho con dos nombres (entra/sale de un cambio) o darse por
// vencido si aun así no cuadra.
function repararNombresPendientes(nombres) {
  if (nombres.length <= 2) return nombres;
  const TERMINA_EN_INICIAL = /[A-ZÀ-Ý]\.\s*$/;
  const resultado = [];
  let i = 0;
  while (i < nombres.length) {
    let actual = nombres[i];
    while (
      (RE_PARTICULA_APELLIDO.test(actual) || !TERMINA_EN_INICIAL.test(actual)) &&
      i + 1 < nombres.length
    ) {
      i++;
      actual = `${actual} ${nombres[i]}`;
    }
    resultado.push(actual);
    i++;
  }
  return resultado;
}

// Analiza la secuencia de tokens de eventos y la convierte en una lista
// de eventos "en bruto": goles (con marcador), tarjetas amarillas (un
// solo jugador) y cambios (dos jugadores: quien entra, quien sale — el
// orden visto en Flashscore es siempre "entra" primero, "sale" después).
// Ninguno lleva equipo asignado todavía.
function analizarEventosFlashscore(tokens) {
  const eventos = [];
  const avisos = [];
  let minutoActual = null;
  let minutoExtra = null;
  let pendientes = []; // nombres de jugador acumulados tras el minuto actual, a la espera de saber si son gol/tarjeta/cambio
  let marcadorPendiente = null;
  let asistentePendiente = null;

  const cerrarPendientes = () => {
    if (minutoActual === null || !pendientes.length) { pendientes = []; marcadorPendiente = null; asistentePendiente = null; return; }
    const listaFinal = repararNombresPendientes(pendientes);
    if (marcadorPendiente && listaFinal.length === 1) {
      eventos.push({ tipo: "gol", jugador: listaFinal[0], minuto: minutoActual, minuto_extra: minutoExtra, marcador: marcadorPendiente, asistente: asistentePendiente });
    } else if (listaFinal.length === 1) {
      eventos.push({ tipo: "amarilla", jugador: listaFinal[0], minuto: minutoActual, minuto_extra: minutoExtra });
    } else if (listaFinal.length === 2) {
      eventos.push({ tipo: "cambio", entra: listaFinal[0], sale: listaFinal[1], minuto: minutoActual, minuto_extra: minutoExtra });
    } else {
      avisos.push(`No se ha entendido el evento del minuto ${minutoActual}' (${listaFinal.join(" / ")}); revísalo a mano tras importar.`);
    }
    pendientes = [];
    marcadorPendiente = null;
    asistentePendiente = null;
  };

  for (const tok of tokens) {
    if (RE_MARCA_PARTE.test(tok)) { cerrarPendientes(); continue; } // "1er Tiempo" / "2º Tiempo"
    const mMin = tok.match(RE_MINUTO_SUELTO);
    if (mMin) {
      cerrarPendientes();
      minutoActual = parseInt(mMin[1], 10);
      minutoExtra = mMin[2] ? parseInt(mMin[2], 10) : null;
      continue;
    }
    const mMarcador = tok.match(RE_MARCADOR_SUELTO);
    if (mMarcador) {
      // Un marcador suelto justo tras el minuto (y antes del nombre) marca
      // que el evento es un gol; si aparece antes de tener minuto (el
      // marcador del propio encabezado de la parte, ej. "1 - 0" bajo "1er
      // Tiempo") se ignora, ya viene resumido en cada gol individual.
      if (!pendientes.length) marcadorPendiente = tok;
      continue;
    }
    if (RE_MOTIVO_AMARILLA.test(tok)) {
      // "(Falta)" / "(Simulación)" tras el nombre del jugador: es una
      // tarjeta amarilla a ese jugador, sea cual sea el número de nombres
      // acumulados hasta ahora (si venía justo detrás de un cambio o de
      // otro evento sin cerrar, la amarilla es solo para el último
      // jugador citado).
      const jugador = pendientes.length ? pendientes[pendientes.length - 1] : null;
      if (jugador && minutoActual !== null) {
        // Si el jugador ya iba a formar parte de un evento de un solo
        // nombre (amarilla "muda", sin motivo detectado aún), se
        // reemplaza por este mismo evento en vez de duplicarlo.
        if (pendientes.length === 1) pendientes = [];
        eventos.push({ tipo: "amarilla", jugador, minuto: minutoActual, minuto_extra: minutoExtra });
      }
      continue;
    }
    if (RE_MOTIVO_IGNORABLE.test(tok)) {
      // Otros motivos entre paréntesis ("(Lesión)", etc.) no son tarjeta;
      // se descartan sin afectar a los nombres pendientes.
      continue;
    }
    const mAsistente = tok.match(RE_ASISTENTE);
    if (mAsistente) {
      // "(Nombre)" tras el goleador es el asistente del gol, no un
      // segundo jugador del evento (para no confundirlo con un cambio).
      // Solo aplica si ya sabemos que este evento es un gol; si no,
      // Flashscore no pone paréntesis con nombre en otro contexto, pero
      // por seguridad se descarta igualmente en vez de colarlo como
      // nombre de jugador.
      if (marcadorPendiente) asistentePendiente = limpiarRuidoNombre(mAsistente[1]);
      continue;
    }
    // Cualquier otra cosa es un nombre de jugador.
    const nombreLimpio = limpiarRuidoNombre(tok);
    if (nombreLimpio) pendientes.push(nombreLimpio);
  }
  cerrarPendientes();
  return { eventos, avisos };
}

function analizarTextoEventosFlashscore(texto) {
  const equipos = extraerEquiposCabeceraFlashscore(texto);
  const tokens = tokenizarTextoFlashscore(texto);
  const { eventos, avisos } = analizarEventosFlashscore(tokens);
  return { formato: "flashscore", equipos, eventos, avisos };
}

// ---------- BÚSQUEDA DEL PARTIDO ----------
// Reutiliza la misma normalización de nombres de club que ya usa
// importacion-rapida.js, para poder comparar "Nàstic" con "Gimnàstic
// de Tarragona" o "Zaragoza" con "Real Zaragoza" tal y como estén
// guardados los equipos del resultado.
function coincideNombreEquipo(nombreTexto, nombreGuardado) {
  if (!nombreTexto || !nombreGuardado) return false;
  const limpiar = (t) => normalizarTextoBusquedaClub(t).replace(/\./g, "");
  const a = limpiar(nombreTexto);
  const b = limpiar(nombreGuardado);
  if (a === b) return true;
  const sinSiglaA = a.replace(/^(cd|ud|sd|cf|rc|rcd|ce|cp|ad|fc|ub)\s+/, "");
  const sinSiglaB = b.replace(/^(cd|ud|sd|cf|rc|rcd|ce|cp|ad|fc|ub)\s+/, "");
  if (sinSiglaA === sinSiglaB) return true;
  return (b.includes(a) || a.includes(sinSiglaB)) && sinSiglaB.length > 3;
}

// ---------- PARTIDO ACTUAL ----------
// Antes este importador buscaba el partido "a ciegas" entre los
// últimos resultados guardados, comparando el nombre de los equipos
// (y opcionalmente la fecha) con lo que hubiera en la base de datos.
// Eso fallaba constantemente ("No se ha encontrado ningún partido
// guardado entre...") en cuanto el nombre pegado no coincidía lo
// bastante con el guardado, o había más de un cruce entre los mismos
// equipos.
//
// Ahora este importador vive DENTRO de la ficha de cada partido (ver
// bloqueImportacionRapidaEventos en panel.html): para poder importar
// eventos hay que buscar primero el partido en "Ver resultados" y
// entrar en él desde el panel de redacción, igual que para tocar su
// alineación o sus goles/tarjetas a mano. Así el partido nunca hace
// falta "encontrarlo": ya se conoce de antemano (es el que se está
// editando), y solo queda usar el nombre de los equipos del texto
// pegado para saber cuál de los dos bloques es el local y cuál el
// visitante.
let RESULTADO_ACTUAL_IMPORT_EVENTOS = null; // objeto resultado (con .id, .equipo_local, .equipo_visitante...)

function fijarResultadoImportacionRapidaEventos(resultado) {
  RESULTADO_ACTUAL_IMPORT_EVENTOS = resultado || null;
}

// ---------- UI ----------
let ANALISIS_IMPORT_EVENTOS = null; // { partido, local:{...}, visitante:{...}, goles, amarillas, rojas, dobleAmarillas, avisos }

function escaparHtmlImportEventos(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function iniciarImportacionRapidaEventosUI() {
  document.getElementById("btnImportEventosAnalizar")?.addEventListener("click", analizarImportacionRapidaEventos);
  document.getElementById("btnImportEventosCancelar")?.addEventListener("click", () => {
    document.getElementById("importEventosResultadoAnalisis").style.display = "none";
    document.getElementById("importEventosResultadoFinal").style.display = "none";
  });
  document.getElementById("btnImportEventosConfirmar")?.addEventListener("click", confirmarImportacionRapidaEventos);

  const textarea = document.getElementById("importEventosTexto");
  const contador = document.getElementById("importEventosContador");
  textarea?.addEventListener("input", () => {
    if (!contador) return;
    const texto = textarea.value;
    if (!texto.trim()) { contador.textContent = ""; return; }
    const lineas = texto.split("\n").filter((l) => l.trim() !== "").length;
    contador.textContent = `${lineas} línea(s) · ${texto.length} caracteres`;
  });
}

async function analizarImportacionRapidaEventos() {
  const texto = document.getElementById("importEventosTexto").value;
  if (!texto.trim()) return EOF.toast("Pega primero el texto con las alineaciones y eventos", "error");

  const partido = RESULTADO_ACTUAL_IMPORT_EVENTOS;
  if (!partido) {
    return EOF.toast("Abre primero el partido desde \"Ver resultados\" para poder importarle eventos.", "error");
  }

  const btn = document.getElementById("btnImportEventosAnalizar");
  ponerBotonCargando(btn, "Analizando…");
  try {
    if (pareceTextoFlashscore(texto)) {
      return await analizarImportacionRapidaEventosFlashscore(texto);
    }
    const analisis = analizarTextoEventosPartido(texto);
    if (analisis.alineaciones.length !== 2) {
      EOF.toast(
        analisis.alineaciones.length < 2
          ? "No se han detectado las dos alineaciones (revisa que cada equipo empiece con \"Nombre: jugador, jugador...\")"
          : "Se han detectado más de dos bloques de alineación; revisa el texto pegado.",
        "error"
      );
      return;
    }
    const [bloqueA, bloqueB] = analisis.alineaciones;

    // El partido ya se conoce (es el que se está editando): el nombre
    // de los equipos del texto pegado solo sirve aquí para saber cuál
    // de los dos bloques es el local y cuál el visitante, no para
    // "encontrar" el partido.
    const aEsLocal = coincideNombreEquipo(bloqueA.equipoTexto, partido.equipo_local);
    const aEsVisitante = coincideNombreEquipo(bloqueA.equipoTexto, partido.equipo_visitante);
    const local = aEsLocal ? bloqueA : bloqueB;
    const visitante = aEsLocal ? bloqueB : bloqueA;

    const avisos = [...analisis.avisos];
    if (!aEsLocal && !aEsVisitante) {
      avisos.push(`Ninguno de los equipos del texto pegado ("${bloqueA.equipoTexto}", "${bloqueB.equipoTexto}") coincide claramente con los del partido abierto (${partido.equipo_local} - ${partido.equipo_visitante}); revisa que el texto sea de este partido antes de confirmar.`);
    }

    ANALISIS_IMPORT_EVENTOS = {
      partido,
      local, visitante,
      bloqueA, bloqueB,
      goles: analisis.goles,
      amarillas: analisis.amarillas,
      rojas: analisis.rojas,
      dobleAmarillas: analisis.dobleAmarillas,
      avisos,
    };
    pintarAnalisisImportacionEventos();
    document.getElementById("importEventosResultadoAnalisis")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } finally {
    quitarBotonCargando(btn);
  }
}

// ---------- ANÁLISIS (rama Flashscore) ----------
// A diferencia de la rama de crónica, aquí no hay alineaciones que
// guardar (el usuario ya no quiere que este importador toque
// alineaciones a partir de este formato) y ningún evento trae equipo:
// se guarda cada uno como "sin determinar" y el usuario lo fija a mano
// con un <select> en la vista previa antes de poder confirmar.
async function analizarImportacionRapidaEventosFlashscore(texto) {
  const btn = document.getElementById("btnImportEventosAnalizar");
  try {
    const r = analizarTextoEventosFlashscore(texto);
    if (!r.eventos.length) {
      EOF.toast("No se ha reconocido ningún evento en el texto de Flashscore pegado.", "error");
      return;
    }

    const partido = RESULTADO_ACTUAL_IMPORT_EVENTOS;

    // Cada evento se guarda con "equipo: null" (sin determinar); el
    // usuario lo completa a mano en la vista previa.
    const eventos = r.eventos.map((e, i) => ({ ...e, _id: i, equipo: null }));

    const avisos = [...r.avisos];
    if (r.equipos && partido) {
      const coincideAlguno = coincideNombreEquipo(r.equipos.local, partido.equipo_local) || coincideNombreEquipo(r.equipos.visitante, partido.equipo_visitante)
        || coincideNombreEquipo(r.equipos.local, partido.equipo_visitante) || coincideNombreEquipo(r.equipos.visitante, partido.equipo_local);
      if (!coincideAlguno) {
        avisos.push(`Los equipos de la cabecera de Flashscore ("${r.equipos.local}" - "${r.equipos.visitante}") no coinciden claramente con los del partido abierto (${partido.equipo_local} - ${partido.equipo_visitante}); revisa que el texto sea de este partido antes de confirmar.`);
      }
    }

    ANALISIS_IMPORT_EVENTOS = {
      formato: "flashscore",
      partido,
      equiposDetectados: r.equipos,
      eventos,
      avisos,
    };
    pintarAnalisisImportacionEventosFlashscore();
    document.getElementById("importEventosResultadoAnalisis")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } finally {
    quitarBotonCargando(btn);
  }
}

// Cambia el tipo de un evento del formato Flashscore (gol/amarilla/
// doble_amarilla/roja/cambio) desde el <select> de tipo en la vista
// previa. Se repinta toda la lista porque cada tipo muestra campos
// distintos (p.ej. "asistente" en gol, "sale"/"entra" en cambio).
function mamImportEventosCambiarTipoFlashscore(idEvento, tipoNuevo) {
  const a = ANALISIS_IMPORT_EVENTOS;
  if (!a || a.formato !== "flashscore") return;
  const ev = a.eventos.find((e) => e._id === idEvento);
  if (!ev) return;
  ev.tipo = tipoNuevo;
  pintarAnalisisImportacionEventosFlashscore();
}

// Se llama desde el <select> de cada evento en la vista previa cuando el
// usuario elige "local"/"visitante" a mano.
function mamImportEventosFijarEquipo(idEvento, equipo) {
  const a = ANALISIS_IMPORT_EVENTOS;
  if (!a || a.formato !== "flashscore") return;
  const ev = a.eventos.find((e) => e._id === idEvento);
  if (!ev) return;
  ev.equipo = equipo || null;
  const btnConfirmar = document.getElementById("btnImportEventosConfirmar");
  if (btnConfirmar) btnConfirmar.disabled = !(a.partido && a.eventos.every((e) => e.excluido || e.equipo));
}

// ---------- EDICIÓN MANUAL DE EVENTOS EN LA VISTA PREVIA ----------
// Permite corregir, antes de confirmar, cualquier dato mal leído por el
// parser (nombre de jugador, minuto, tipo de evento...) o excluir un
// evento suelto sin tener que reescribir todo el texto pegado y volver
// a analizarlo. Funciona igual para la rama de crónica y la de
// Flashscore: cada función recibe el/los campo(s) a tocar y repinta.

// Marca/desmarca un evento como excluido de la importación (no se
// manda al backend al confirmar), sin borrarlo de la vista previa por
// si el usuario se arrepiente.
// Las colecciones "públicas" (goles/amarillas/rojas/dobleAmarillas) son
// el resultado crudo del parser; una vez resuelto el equipo de cada
// jugador se trabaja sobre las copias "_xResueltas" (ver
// pintarAnalisisImportacionEventos), que son las que de verdad se
// pintan y se mandan al backend al confirmar.
const MAPA_COLECCION_RESUELTA = {
  goles: "_golesResueltos", amarillas: "_amarillasResueltas",
  rojas: "_rojasResueltas", dobleAmarillas: "_doblesResueltas",
};

function mamImportEventosAlternarExcluido(coleccion, idx) {
  const a = ANALISIS_IMPORT_EVENTOS;
  if (!a) return;
  const lista = a.formato === "flashscore" ? a.eventos : a[MAPA_COLECCION_RESUELTA[coleccion]];
  if (!lista || !lista[idx]) return;
  lista[idx].excluido = !lista[idx].excluido;
  a.formato === "flashscore" ? pintarAnalisisImportacionEventosFlashscore() : pintarAnalisisImportacionEventos();
}

// Cambia un campo de texto/número de un evento ya analizado (jugador,
// minuto, marcador, asistente...) desde el <input> de la vista previa.
function mamImportEventosEditarCampo(coleccion, idx, campo, valor) {
  const a = ANALISIS_IMPORT_EVENTOS;
  if (!a) return;
  const lista = a.formato === "flashscore" ? a.eventos : a[MAPA_COLECCION_RESUELTA[coleccion]];
  if (!lista || !lista[idx]) return;
  if (campo === "minuto" || campo === "minuto_extra") {
    lista[idx][campo] = valor.trim() === "" ? null : parseInt(valor, 10) || 0;
  } else {
    lista[idx][campo] = valor.trim() === "" ? null : valor;
  }
}

// Cambia el tipo de un evento de crónica ya clasificado (p.ej. pasar
// una "amarilla" mal detectada a "roja", o un "gol" a "gol en propia
// puerta") desde el <select> de tipo en la vista previa.
function mamImportEventosCambiarTipo(coleccion, idx, tipoNuevo) {
  const a = ANALISIS_IMPORT_EVENTOS;
  if (!a || a.formato === "flashscore") return;
  const mapaDestino = {
    gol: "_golesResueltos", gol_pp: "_golesResueltos",
    amarilla: "_amarillasResueltas", roja: "_rojasResueltas", doble_amarilla: "_doblesResueltas",
  };
  const origen = MAPA_COLECCION_RESUELTA[coleccion];
  if (!origen || !a[origen] || !a[origen][idx]) return;
  const item = a[origen][idx];
  const esGol = coleccion === "goles";
  const tipoActual = esGol ? (item.propia ? "gol_pp" : "gol") : coleccion === "amarillas" ? "amarilla" : coleccion === "rojas" ? "roja" : "doble_amarilla";
  if (tipoNuevo === tipoActual) return;
  if (esGol && (tipoNuevo === "gol" || tipoNuevo === "gol_pp")) {
    // Cambio de gol normal <-> gol en propia puerta: se queda en la
    // misma colección, solo cambia el flag "propia".
    item.propia = tipoNuevo === "gol_pp";
    pintarAnalisisImportacionEventos();
    return;
  }
  // Cambio entre tipo de tarjeta (o de gol a tarjeta): se mueve el
  // evento de una colección resuelta a otra.
  const destino = mapaDestino[tipoNuevo];
  if (!destino || destino === origen) return;
  a[origen].splice(idx, 1);
  const copia = { ...item };
  delete copia.propia;
  a[destino].push(copia);
  pintarAnalisisImportacionEventos();
}

function pintarAnalisisImportacionEventosFlashscore() {
  const a = ANALISIS_IMPORT_EVENTOS;
  const cont = document.getElementById("importEventosLista");
  const avisosCont = document.getElementById("importEventosAvisos");
  const btnConfirmar = document.getElementById("btnImportEventosConfirmar");

  const avisos = [...a.avisos];
  // Si no se ha podido leer la cabecera de Flashscore (formato de
  // copiado distinto, partido no finalizado...) no pasa nada: el
  // partido ya se conoce por el contexto de la ficha (a.partido), así
  // que el selector de cada evento igualmente ofrece "Local"/
  // "Visitante" con los nombres correctos; no hace falta avisar de
  // que la cabecera no se ha leído.
  avisos.push(`Formato Flashscore detectado: los eventos no indican equipo, elige "Local"/"Visitante" en cada uno abajo antes de confirmar.`);

  avisosCont.style.display = "block";
  avisosCont.innerHTML = `⚠️ ${avisos.map(escaparHtmlImportEventos).join("<br>⚠️ ")}`;

  const nombreLocal = a.partido ? a.partido.equipo_local : (a.equiposDetectados?.local || "Local");
  const nombreVisitante = a.partido ? a.partido.equipo_visitante : (a.equiposDetectados?.visitante || "Visitante");

  const selectorEquipo = (ev) => `
    <select class="import-rapida-select-equipo" onchange="mamImportEventosFijarEquipo(${ev._id}, this.value)">
      <option value="" ${!ev.equipo ? "selected" : ""}>Sin determinar…</option>
      <option value="local" ${ev.equipo === "local" ? "selected" : ""}>${escaparHtmlImportEventos(nombreLocal)} (local)</option>
      <option value="visitante" ${ev.equipo === "visitante" ? "selected" : ""}>${escaparHtmlImportEventos(nombreVisitante)} (visitante)</option>
    </select>`;

  // Selector de tipo de evento (gol/amarilla/roja/cambio) para el
  // formato Flashscore. Antes no existía: el tipo venía fijo del
  // parser y no era editable desde la vista previa.
  const OPCIONES_TIPO_FLASHSCORE = [
    ["gol", "Gol"], ["amarilla", "Amarilla"], ["doble_amarilla", "Doble amarilla"],
    ["roja", "Roja"], ["cambio", "Cambio"],
  ];
  const selectorTipoFlashscore = (ev) => `
    <select class="import-rapida-select-equipo" onchange="mamImportEventosCambiarTipoFlashscore(${ev._id}, this.value)">
      ${OPCIONES_TIPO_FLASHSCORE.map(([v, l]) => `<option value="${v}" ${v === ev.tipo ? "selected" : ""}>${l}</option>`).join("")}
    </select>`;

  const campoMinuto = (ev, idx) => `
    <input type="number" min="0" max="130" class="import-rapida-input-minuto"
      value="${ev.minuto ?? ""}" title="Minuto"
      onchange="mamImportEventosEditarCampo('eventos', ${idx}, 'minuto', this.value)" />'${ev.minuto_extra != null ? `
    <input type="number" min="0" max="15" class="import-rapida-input-minuto-extra"
      value="${ev.minuto_extra}" title="Minuto añadido"
      onchange="mamImportEventosEditarCampo('eventos', ${idx}, 'minuto_extra', this.value)" />` : ""}`;

  const campoJugador = (ev, idx, campo, etiqueta) => `
    <input type="text" class="import-rapida-input-jugador" value="${escaparHtmlImportEventos(ev[campo] ?? "")}"
      title="${etiqueta}" placeholder="${etiqueta}"
      onchange="mamImportEventosEditarCampo('eventos', ${idx}, '${campo}', this.value)" />`;

  const btnExcluir = (idx, ev) => `
    <button type="button" class="import-rapida-btn-excluir" title="${ev.excluido ? "Volver a incluir" : "No importar este evento"}"
      onclick="mamImportEventosAlternarExcluido('eventos', ${idx})">${ev.excluido ? "↺ Incluir" : "✕ Excluir"}</button>`;

  const filaEvento = (icono, ev, idx, camposEditables) => `
    <div class="import-rapida-fila${ev.excluido ? " import-rapida-fila-excluida" : ""}">
      <div class="import-rapida-fila-info">
        <div class="import-rapida-fila-partido">
          ${icono} ${camposEditables}
          ${!ev.equipo ? '<span class="import-rapida-chip import-rapida-chip-estado-retrasado">equipo sin determinar</span>' : ""}
        </div>
      </div>
      <div class="import-rapida-fila-accion">${selectorTipoFlashscore(ev)}${selectorEquipo(ev)}${btnExcluir(idx, ev)}</div>
    </div>`;

  cont.innerHTML = `
    ${a.partido ? `<p class="ayuda-editor"><strong>Partido encontrado:</strong> ${escaparHtmlImportEventos(a.partido.equipo_local)} ${a.partido.goles_local ?? ""} - ${a.partido.goles_visitante ?? ""} ${escaparHtmlImportEventos(a.partido.equipo_visitante)} (#${a.partido.id})</p>` : ""}
    <p class="ayuda-editor">Puedes corregir jugador, minuto o excluir cualquier evento antes de confirmar.</p>
    ${a.eventos.map((ev, idx) => {
      if (ev.tipo === "gol") {
        return filaEvento("⚽", ev, idx, `${campoMinuto(ev, idx)} — ${campoJugador(ev, idx, "jugador", "Jugador")} — gol${ev.marcador ? ` (${escaparHtmlImportEventos(ev.marcador)})` : ""} · asist. ${campoJugador(ev, idx, "asistente", "Asistente (opcional)")}`);
      }
      if (ev.tipo === "amarilla") {
        return filaEvento("🟨", ev, idx, `${campoMinuto(ev, idx)} — ${campoJugador(ev, idx, "jugador", "Jugador")} — tarjeta amarilla`);
      }
      if (ev.tipo === "doble_amarilla") {
        return filaEvento("🟨🟥", ev, idx, `${campoMinuto(ev, idx)} — ${campoJugador(ev, idx, "jugador", "Jugador")} — doble amarilla`);
      }
      if (ev.tipo === "roja") {
        return filaEvento("🟥", ev, idx, `${campoMinuto(ev, idx)} — ${campoJugador(ev, idx, "jugador", "Jugador")} — tarjeta roja`);
      }
      if (ev.tipo === "cambio") {
        return filaEvento("🔁", ev, idx, `${campoMinuto(ev, idx)} — ${campoJugador(ev, idx, "sale", "Sale")} → ${campoJugador(ev, idx, "entra", "Entra")} — cambio`);
      }
      return "";
    }).join("")}
  `;

  btnConfirmar.disabled = !(a.partido && a.eventos.every((e) => e.excluido || e.equipo));
  document.getElementById("importEventosResultadoAnalisis").style.display = "block";
  document.getElementById("importEventosResultadoFinal").style.display = "none";
}

async function confirmarImportacionRapidaEventosFlashscore() {
  const a = ANALISIS_IMPORT_EVENTOS;
  if (!a || !a.partido) return;
  if (!a.eventos.every((e) => e.excluido || e.equipo)) return EOF.toast("Falta elegir el equipo de algún evento", "error");

  const btn = document.getElementById("btnImportEventosConfirmar");
  ponerBotonCargando(btn, "Importando…");

  const log = document.getElementById("importEventosLog");
  log.innerHTML = "";
  let ok = 0, fallidos = 0;
  const anotar = (icono, texto, esError) => {
    const fila = document.createElement("div");
    fila.className = `import-rapida-log-fila ${esError ? "import-rapida-log-fila-error" : "import-rapida-log-fila-ok"}`;
    fila.innerHTML = `<span class="import-rapida-log-icono">${icono}</span> ${escaparHtmlImportEventos(texto)}`;
    log.appendChild(fila);
    esError ? fallidos++ : ok++;
  };

  const resultadoId = a.partido.id;

  for (const ev of a.eventos) {
    if (ev.excluido) continue;
    try {
      if (ev.tipo === "gol") {
        await crearEventoPartido(resultadoId, { tipo: "gol", equipo: ev.equipo, jugador: ev.jugador, jugador_asistencia: ev.asistente || null, minuto: ev.minuto, minuto_extra: ev.minuto_extra || null });
        anotar("⚽", `Gol: ${ev.jugador} (${ev.minuto}')${ev.asistente ? ` — asist. ${ev.asistente}` : ""}`);
      } else if (ev.tipo === "amarilla") {
        await crearEventoPartido(resultadoId, { tipo: "amarilla", equipo: ev.equipo, jugador: ev.jugador, minuto: ev.minuto, minuto_extra: ev.minuto_extra || null });
        anotar("🟨", `Tarjeta: ${ev.jugador} (${ev.minuto}')`);
      } else if (ev.tipo === "doble_amarilla") {
        await crearEventoPartido(resultadoId, { tipo: "doble_amarilla", equipo: ev.equipo, jugador: ev.jugador, minuto: ev.minuto, minuto_extra: ev.minuto_extra || null });
        anotar("🟨🟥", `Doble amarilla: ${ev.jugador} (${ev.minuto}')`);
      } else if (ev.tipo === "roja") {
        await crearEventoPartido(resultadoId, { tipo: "roja", equipo: ev.equipo, jugador: ev.jugador, minuto: ev.minuto, minuto_extra: ev.minuto_extra || null });
        anotar("🟥", `Roja: ${ev.jugador} (${ev.minuto}')`);
      } else if (ev.tipo === "cambio") {
        await crearEventoPartido(resultadoId, { tipo: "cambio", equipo: ev.equipo, jugador: ev.entra, jugador_sale: ev.sale, minuto: ev.minuto, minuto_extra: ev.minuto_extra || null });
        anotar("🔁", `Cambio: ${ev.sale} → ${ev.entra} (${ev.minuto}')`);
      }
    } catch (err) {
      anotar("❌", `Error en el evento del minuto ${ev.minuto}': ${err.message}`, true);
    }
  }

  const resumen = document.createElement("div");
  resumen.className = "import-rapida-log-resumen";
  resumen.textContent = `Hecho: ${ok} evento(s) guardados${fallidos ? `, ${fallidos} con error` : ""}.`;
  log.appendChild(resumen);

  document.getElementById("importEventosResultadoFinal").style.display = "block";
  document.getElementById("importEventosResultadoFinal")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  EOF.toast(`Importación de eventos terminada: ${ok} guardados`, fallidos ? "error" : "exito");

  if (typeof cargarEventosPartido === "function") cargarEventosPartido(resultadoId);

  quitarBotonCargando(btn);
}

// Encuentra, dentro de una lista de nombres de jugadores (los de una
// alineación ya emparejada con local/visitante), el que mejor encaja
// con el nombre suelto que trae un gol o una tarjeta. Coincidencia
// simple por subcadena en ambos sentidos, sin acentos ni mayúsculas.
function normalizarNombreJugador(t) {
  return (t || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function encontrarEquipoDeJugador(nombreJugador, local, visitante) {
  const q = normalizarNombreJugador(nombreJugador);
  const enLista = (bloque) => bloque && bloque.jugadores.some((j) => {
    const n = normalizarNombreJugador(j.nombre);
    const nEntra = normalizarNombreJugador(j.entra || "");
    return n === q || n.includes(q) || q.includes(n) || (nEntra && (nEntra === q || nEntra.includes(q) || q.includes(nEntra)));
  });
  if (enLista(local)) return "local";
  if (enLista(visitante)) return "visitante";
  return null;
}

function pintarAnalisisImportacionEventos() {
  const a = ANALISIS_IMPORT_EVENTOS;
  const cont = document.getElementById("importEventosLista");
  const avisosCont = document.getElementById("importEventosAvisos");
  const btnConfirmar = document.getElementById("btnImportEventosConfirmar");

  const avisos = [...a.avisos];

  const cambiosDetectados = [];
  if (a.local && a.visitante) {
    for (const equipo of ["local", "visitante"]) {
      const bloque = a[equipo];
      bloque.jugadores.forEach((j) => {
        if (j.entra && j.sale_en) cambiosDetectados.push({ equipo, sale: j.nombre, entra: j.entra, minuto: j.sale_en });
      });
    }
  }

  // Si ya existen las colecciones "_resueltas" (porque esto no es el
  // primer pintado), se reutilizan tal cual en vez de regenerarlas
  // desde a.goles/a.amarillas/a.rojas/a.dobleAmarillas: esas son las
  // crudas del parser y nunca cambian, así que si aquí se volviera a
  // partir de ellas cada vez se perdería cualquier cambio de tipo
  // hecho a mano (mamImportEventosCambiarTipo) en el repintado
  // inmediatamente posterior.
  const golesResueltos = a._golesResueltos ?? a.goles.map((g) => ({ ...g, equipo: encontrarEquipoDeJugador(g.jugador, a.local, a.visitante) }));
  const amarillasResueltas = a._amarillasResueltas ?? a.amarillas.map((t) => ({ ...t, equipo: encontrarEquipoDeJugador(t.jugador, a.local, a.visitante) }));
  const rojasResueltas = a._rojasResueltas ?? a.rojas.map((t) => ({ ...t, equipo: encontrarEquipoDeJugador(t.jugador, a.local, a.visitante) }));
  const doblesResueltas = a._doblesResueltas ?? a.dobleAmarillas.map((t) => ({ ...t, equipo: encontrarEquipoDeJugador(t.jugador, a.local, a.visitante) }));
  a._golesResueltos = golesResueltos;
  a._amarillasResueltas = amarillasResueltas;
  a._rojasResueltas = rojasResueltas;
  a._doblesResueltas = doblesResueltas;
  a._cambiosDetectados = cambiosDetectados;

  [...golesResueltos, ...amarillasResueltas, ...rojasResueltas, ...doblesResueltas].forEach((e) => {
    if (!e.equipo) avisos.push(`No se ha reconocido a "${e.jugador}" en ninguna de las dos alineaciones; revísalo a mano tras importar.`);
  });

  avisosCont.style.display = avisos.length ? "block" : "none";
  avisosCont.innerHTML = avisos.length ? `⚠️ ${avisos.map(escaparHtmlImportEventos).join("<br>⚠️ ")}` : "";

  const filaEquipo = (etiqueta, bloque) => bloque ? `
    <div class="import-rapida-fila">
      <div class="import-rapida-fila-info">
        <div class="import-rapida-fila-partido"><strong>${escaparHtmlImportEventos(etiqueta)}: ${escaparHtmlImportEventos(bloque.equipoTexto)}</strong></div>
        <p class="ayuda-editor" style="margin:4px 0 0;">${bloque.jugadores.map((j) => escaparHtmlImportEventos(j.nombre) + (j.entra ? ` → sale (${j.sale_en}') por ${escaparHtmlImportEventos(j.entra)}` : "")).join(", ")}</p>
      </div>
    </div>` : "";

  const campoMinuto = (coleccion, idx, e) => coleccion ? `
    <input type="number" min="0" max="130" class="import-rapida-input-minuto" value="${e.minuto ?? ""}"
      title="Minuto" onchange="mamImportEventosEditarCampo('${coleccion}', ${idx}, 'minuto', this.value)" />'` : `${e.minuto ? `${e.minuto}'` : ""}`;

  const campoJugador = (coleccion, idx, campo, valor, etiqueta) => coleccion ? `
    <input type="text" class="import-rapida-input-jugador" value="${escaparHtmlImportEventos(valor ?? "")}"
      title="${etiqueta}" placeholder="${etiqueta}"
      onchange="mamImportEventosEditarCampo('${coleccion}', ${idx}, '${campo}', this.value)" />` : escaparHtmlImportEventos(valor ?? "");

  const selectorTipo = (coleccion, idx, tipoActual) => {
    if (!coleccion) return "";
    const opciones = [
      ["gol", "Gol"], ["gol_pp", "Gol en propia puerta"],
      ["amarilla", "Amarilla"], ["doble_amarilla", "Doble amarilla"], ["roja", "Roja"],
    ];
    return `<select class="import-rapida-select-equipo" onchange="mamImportEventosCambiarTipo('${coleccion}', ${idx}, this.value)">
      ${opciones.map(([v, l]) => `<option value="${v}" ${v === tipoActual ? "selected" : ""}>${l}</option>`).join("")}
    </select>`;
  };

  const btnExcluir = (coleccion, idx, e) => coleccion ? `
    <button type="button" class="import-rapida-btn-excluir" title="${e.excluido ? "Volver a incluir" : "No importar este evento"}"
      onclick="mamImportEventosAlternarExcluido('${coleccion}', ${idx})">${e.excluido ? "↺ Incluir" : "✕ Excluir"}</button>` : "";

  // coleccion=null para los cambios de alineación (no son editables ni
  // excluibles aquí: se corrigen editando el texto pegado y reanalizando).
  const filaEvento = (icono, e, tipoLabel, coleccion, idx, tipoActual) => `
    <div class="import-rapida-fila${e.excluido ? " import-rapida-fila-excluida" : ""}">
      <div class="import-rapida-fila-info">
        <div class="import-rapida-fila-partido">${icono} <strong>${campoJugador(coleccion, idx, "jugador", e.jugador, "Jugador")}</strong> — ${coleccion ? selectorTipo(coleccion, idx, tipoActual) : tipoLabel} (${campoMinuto(coleccion, idx, e)}) ${e.equipo ? `<span class="import-rapida-chip">${e.equipo}</span>` : '<span class="import-rapida-chip import-rapida-chip-estado-retrasado">equipo no reconocido</span>'}
        </div>
      </div>
      ${coleccion ? `<div class="import-rapida-fila-accion">${btnExcluir(coleccion, idx, e)}</div>` : ""}
    </div>`;

  cont.innerHTML = `
    ${a.partido ? `<p class="ayuda-editor"><strong>Partido encontrado:</strong> ${escaparHtmlImportEventos(a.partido.equipo_local)} ${a.partido.goles_local ?? ""} - ${a.partido.goles_visitante ?? ""} ${escaparHtmlImportEventos(a.partido.equipo_visitante)} (#${a.partido.id})</p>` : ""}
    ${filaEquipo("Alineación", a.local)}
    ${filaEquipo("Alineación", a.visitante)}
    ${cambiosDetectados.map((c) => filaEvento("🔁", { jugador: `${c.sale} → ${c.entra}`, minuto: c.minuto, equipo: c.equipo }, "cambio", null, null)).join("")}
    <p class="ayuda-editor">Puedes corregir jugador, minuto, tipo o excluir cualquier gol/tarjeta antes de confirmar.</p>
    ${golesResueltos.map((g, idx) => filaEvento("⚽", g, g.propia ? "gol en propia puerta" : "gol", "goles", idx, g.propia ? "gol_pp" : "gol")).join("")}
    ${amarillasResueltas.map((t, idx) => filaEvento("🟨", t, "tarjeta amarilla", "amarillas", idx, "amarilla")).join("")}
    ${doblesResueltas.map((t, idx) => filaEvento("🟨🟨", t, "doble amarilla", "dobleAmarillas", idx, "doble_amarilla")).join("")}
    ${rojasResueltas.map((t, idx) => filaEvento("🟥", t, "tarjeta roja", "rojas", idx, "roja")).join("")}
  `;

  btnConfirmar.disabled = !a.partido;
  document.getElementById("importEventosResultadoAnalisis").style.display = "block";
  document.getElementById("importEventosResultadoFinal").style.display = "none";
}

// Convierte la alineación ya resuelta (bloque local o visitante) al
// formato que espera POST/PUT /api/alineaciones: todos los jugadores
// que aparecen en el texto se guardan como titulares (el texto pegado
// solo trae el once inicial, no el banquillo completo); los que
// entraron desde el banquillo (el nombre dentro del paréntesis) se
// añaden también, marcados como no titulares.
function construirJugadoresAlineacion(bloque) {
  const titulares = bloque.jugadores.map((j, i) => ({
    x: 50, y: 50, dorsal: null, nombre: j.nombre, titular: true, capitan: false,
  }));
  const entrados = bloque.jugadores
    .filter((j) => j.entra)
    .map((j) => ({ dorsal: null, nombre: j.entra, titular: false, capitan: false }));
  return [...titulares, ...entrados];
}

async function guardarAlineacionEquipo(resultadoId, equipoNombre, bloque) {
  const body = {
    article_id: null,
    result_id: resultadoId,
    equipo: equipoNombre,
    formacion: "4-3-3",
    jugadores: construirJugadoresAlineacion(bloque),
  };
  await apiFetch(`/api/alineaciones`, { method: "POST", body: JSON.stringify(body) });
}

async function crearEventoPartido(resultadoId, body) {
  return apiFetch(`/api/results/${resultadoId}/eventos`, { method: "POST", body: JSON.stringify(body) });
}

async function confirmarImportacionRapidaEventos() {
  const a = ANALISIS_IMPORT_EVENTOS;
  if (!a || !a.partido) return;
  if (a.formato === "flashscore") return confirmarImportacionRapidaEventosFlashscore();

  const btn = document.getElementById("btnImportEventosConfirmar");
  ponerBotonCargando(btn, "Importando…");

  const log = document.getElementById("importEventosLog");
  log.innerHTML = "";
  let ok = 0, fallidos = 0;
  const anotar = (icono, texto, esError) => {
    const fila = document.createElement("div");
    fila.className = `import-rapida-log-fila ${esError ? "import-rapida-log-fila-error" : "import-rapida-log-fila-ok"}`;
    fila.innerHTML = `<span class="import-rapida-log-icono">${icono}</span> ${escaparHtmlImportEventos(texto)}`;
    log.appendChild(fila);
    esError ? fallidos++ : ok++;
  };

  const resultadoId = a.partido.id;

  // 1) Alineaciones (local y visitante).
  for (const [etiqueta, bloque, nombreEquipo] of [
    ["local", a.local, a.partido.equipo_local],
    ["visitante", a.visitante, a.partido.equipo_visitante],
  ]) {
    try {
      await guardarAlineacionEquipo(resultadoId, nombreEquipo, bloque);
      anotar("🆕", `Alineación guardada: ${nombreEquipo}`);
    } catch (err) {
      anotar("❌", `Error guardando alineación de ${nombreEquipo}: ${err.message}`, true);
    }
  }

  // 2) Cambios, como eventos "cambio" (jugador = quien entra, jugador_sale = quien sale).
  for (const c of a._cambiosDetectados) {
    try {
      await crearEventoPartido(resultadoId, {
        tipo: "cambio", equipo: c.equipo, jugador: c.entra, jugador_sale: c.sale, minuto: c.minuto,
      });
      anotar("🔁", `Cambio: ${c.sale} → ${c.entra} (${c.minuto}')`);
    } catch (err) {
      anotar("❌", `Error en el cambio ${c.sale} → ${c.entra}: ${err.message}`, true);
    }
  }

  // 3) Goles.
  for (const g of a._golesResueltos) {
    if (g.excluido) continue;
    if (!g.equipo) { anotar("❌", `Gol de "${g.jugador}" omitido: equipo no reconocido.`, true); continue; }
    try {
      await crearEventoPartido(resultadoId, {
        tipo: g.propia ? "gol_pp" : "gol", equipo: g.equipo, jugador: g.jugador, minuto: g.minuto ?? 0,
      });
      anotar("⚽", `Gol: ${g.jugador} (${g.minuto ?? "?"}')`);
    } catch (err) {
      anotar("❌", `Error en el gol de ${g.jugador}: ${err.message}`, true);
    }
  }

  // 4) Tarjetas amarillas, dobles amarillas y rojas.
  const tandas = [
    ["amarilla", a._amarillasResueltas, "🟨"],
    ["doble_amarilla", a._doblesResueltas, "🟨🟨"],
    ["roja", a._rojasResueltas, "🟥"],
  ];
  for (const [tipo, lista, icono] of tandas) {
    for (const t of lista) {
      if (t.excluido) continue;
      if (!t.equipo) { anotar("❌", `Tarjeta de "${t.jugador}" omitida: equipo no reconocido.`, true); continue; }
      try {
        await crearEventoPartido(resultadoId, { tipo, equipo: t.equipo, jugador: t.jugador, minuto: t.minuto ?? 0 });
        anotar(icono, `Tarjeta: ${t.jugador} (${t.minuto ?? "?"}')`);
      } catch (err) {
        anotar("❌", `Error en la tarjeta de ${t.jugador}: ${err.message}`, true);
      }
    }
  }

  const resumen = document.createElement("div");
  resumen.className = "import-rapida-log-resumen";
  resumen.textContent = `Hecho: ${ok} evento(s)/alineación(es) guardados${fallidos ? `, ${fallidos} con error` : ""}.`;
  log.appendChild(resumen);

  document.getElementById("importEventosResultadoFinal").style.display = "block";
  document.getElementById("importEventosResultadoFinal")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  EOF.toast(`Importación de eventos terminada: ${ok} guardados`, fallidos ? "error" : "exito");

  // Refresca las listas de eventos/alineaciones ya visibles más abajo
  // en la misma ficha del partido, para que se vea al momento lo que
  // se acaba de importar sin tener que recargar la página.
  if (typeof cargarEventosPartido === "function") cargarEventosPartido(resultadoId);
  if (typeof cargarAlineacionesResultado === "function") cargarAlineacionesResultado(resultadoId);

  quitarBotonCargando(btn);
}

document.addEventListener("DOMContentLoaded", iniciarImportacionRapidaEventosUI);
