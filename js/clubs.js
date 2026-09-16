const CLUBS_BY_CATEGORY = {
  hypermotion: [
    "AD Ceuta FC",
    "Albacete Balompié",
    "Burgos CF",
    "Cádiz CF",
    "CD Castellón",
    "CD Eldense",
    "CD Leganés",
    "CD Tenerife",
    "CE Sabadell",
    "Celta Fortuna",
    "Córdoba CF",
    "FC Andorra",
    "Girona FC",
    "Granada CF",
    "Real Sociedad B",
    "RCD Mallorca",
    "Real Oviedo",
    "Real Sporting",
    "Real Valladolid CF",
    "SD Eibar",
    "UD Almería",
    "UD Las Palmas",
  ],

  primera_federacion: [
    // Grupo 1
    "AD Mérida",
    "Arenas Club",
    "Bilbao Athletic",
    "Barakaldo CF",
    "CD Coria",
    "CD Extremadura",
    "CD Lugo",
    "CD Mirandés",
    "CP Cacereño",
    "Cultural Leonesa",
    "Pontevedra CF",
    "Racing Club Ferrol",
    "RC Deportivo Fabril",
    "Real Avilés Industrial",
    "Real Unión Club",
    "SD Ponferradina",
    "UD Logroñés",
    "UD Ourense",
    "Unionistas de Salamanca CF",
    "Zamora CF",

    // Grupo 2
    "AD Alcorcón",
    "Águilas FC",
    "Algeciras CF",
    "Antequera CF",
    "Atlético Madrileño",
    "CD Teruel",
    "CE Europa",
    "CF Rayo Majadahonda",
    "FC Cartagena",
    "Gimnàstic de Tarragona",
    "Hércules CF",
    "Juventud Torremolinos CF",
    "Real Jaén CF",
    "Real Madrid Castilla",
    "Real Murcia CF",
    "Real Zaragoza",
    "SD Huesca",
    "UD Ibiza",
    "UE Sant Andreu",
    "Villarreal CF B",
  ],

  // La Segunda Federación (Segunda RFEF) tiene 5 grupos regionales y 90
  // clubes en total. Se listan aquí TODOS los oficiales de la temporada
  // 2026/27 (misma fuente y mismos nombres que
  // TODOS_LOS_CLUBES_SEGUNDA_FEDERACION más abajo, ordenados
  // alfabéticamente) para que cualquiera de ellos pueda elegirse al
  // escribir una noticia/crónica desde el panel (desplegables de
  // admin.js, importacion-rapida.js y contenido.html) y para Calendario/
  // Clasificación. OJO: esta lista NO determina qué aparece en
  // "Próximos partidos" de portada; para eso se usa la lista separada y
  // más corta CLUBS_SEGUNDA_FEDERACION_CUBIERTOS_PORTADA (justo debajo
  // de este objeto), con solo los clubes que cubrimos editorialmente.
  // No quitar equipos de aquí para acotar la portada: se rompería el
  // desplegable de estos 90 en el panel. Para cambiar qué sale en
  // portada, edita CLUBS_SEGUNDA_FEDERACION_CUBIERTOS_PORTADA.
  segunda_federacion: [
    "Arosa SC",
    "Atlético Albacete",
    "Atlético Antoniano",
    "Atlético Astorga",
    "Atlético Central",
    "Atlético de Madrid C",
    "Atlético Osasuna B",
    "Atlético Sanluqueño",
    "Atlético Tordesillas",
    "Bergantiños",
    "Betis Deportivo",
    "Calvo Sotelo Puertollano",
    "CD Alcoyano",
    "CD Arnedo",
    "CD Atlético Baleares",
    "CD Atlético Paso",
    "CD Badajoz",
    "CD Basconia",
    "CD Castellón B",
    "CD Cieza",
    "CD Ciudad de Lucena",
    "CD Don Benito",
    "CD Ebro",
    "CD Estepona",
    "CD Guadalajara",
    "CD Minera",
    "CD Numancia",
    "CD Tenerife B",
    "CD Tudelano",
    "CDA Navalcarnero",
    "CE Manresa",
    "CF Calamocha",
    "CF Intercity",
    "CF La Nucía",
    "CF Lorca Deportiva",
    "CF Talavera de la Reina",
    "Club Marino de Luanco",
    "Club Portugalete",
    "Coruxo",
    "CP Mijas Las Lagunas",
    "Deportivo Alavés B",
    "Elche Ilicitano",
    "FC Barcelona Atlètic",
    "Getafe B",
    "Gimnástica Segoviana",
    "Girona FC B",
    "Las Palmas Atlético",
    "Linares Deportivo",
    "Marbella FC",
    "Náxara",
    "Orihuela CF",
    "Ourense CF",
    "Peña Sport",
    "Rayo Cantabria",
    "RCD Espanyol B",
    "RCD Mallorca B",
    "Real Ávila",
    "Real Madrid C",
    "Real Murcia Imperial",
    "Real Oviedo Vetusta",
    "Real Valladolid Promesas",
    "Recreativo de Huelva",
    "Reus FC Reddis",
    "RS Gimnástica de Torrelavega",
    "RSD Alcalá",
    "Salamanca UDS",
    "Salerm Cosmetics Puente Genil",
    "SCR Peña Deportiva",
    "SD Amorebieta",
    "SD Compostela",
    "SD Eibar B",
    "SD Gernika",
    "SD Logroñés",
    "Sestao River",
    "Sevilla Atlético",
    "Terrassa",
    "UB Conquense",
    "UCAM Murcia",
    "UD Barbastro",
    "UD Castellonense",
    "UD Llanera",
    "UD Logroñés B",
    "UD Poblense",
    "UD San Sebastián de los Reyes",
    "UD Tamaraceite",
    "UE Olot",
    "Utebo",
    "Valencia Mestalla",
    "Xerez CD",
    "Yeclano Deportivo",
  ],
};

// ---------- Clubes de Segunda Federación cubiertos editorialmente ----------
// De los 90 clubes de Segunda RFEF (arriba), ElOtroFútbol solo cubre
// estos 7 con noticias/crónicas. Es la única lista que debe consultarse
// para decidir qué partidos de Segunda Federación aparecen en "Próximos
// partidos" de portada (ver filtrarParaPortada() en main.js): el resto
// de los 90 solo deben verse en Calendario y Clasificación, nunca en
// portada. NO tocar CLUBS_BY_CATEGORY.segunda_federacion para acotar
// esto: esa lista de 90 alimenta los desplegables del panel de admin y
// debe seguir completa.
const CLUBS_SEGUNDA_FEDERACION_CUBIERTOS_PORTADA = [
  "UB Conquense",
  "CD Guadalajara",
  "Linares Deportivo",
  "CD Numancia",
  "Recreativo de Huelva",
  "CF Talavera de la Reina",
  "CD Badajoz",
];

// ---------- LOS 90 CLUBES DE SEGUNDA FEDERACIÓN (5 GRUPOS COMPLETOS) ----------
// A diferencia de CLUBS_BY_CATEGORY.segunda_federacion (arriba, que son
// solo los clubes que cubrimos editorialmente y por tanto los únicos
// que aparecen en portada), esta lista es la composición OFICIAL
// completa de los 5 grupos de Segunda Federación para la temporada
// 2026/27 (fuente: RFEF, calendarios oficiales publicados el
// 14/08/2026 tras la redistribución de grupos). Se usa para:
//   - Calendario y Clasificación (public/calendario.html y
//     clasificacion.html): esas páginas ya muestran los 5 grupos
//     completos a partir de lo que haya en la base de datos, así que
//     esta lista no las alimenta directamente, pero sirve de
//     referencia para dar de alta partidos en el panel de admin con el
//     nombre "oficial" correcto de cada equipo.
//   - Escudos (getEscudoUrl más abajo): el nombre de cada club aquí usa
//     el mismo formato que ya usan los 7 clubes cubiertos (sin
//     "de Soria", sin comillas raras, con tildes), para que
//     slugEquipo(nombre) dé el nombre de archivo esperado en
//     img/escudos/. Si un partido se guarda en el panel con un nombre
//     distinto al de aquí (p.ej. "RC Recreativo de Huelva" en vez de
//     "Recreativo de Huelva"), el escudo no se encontrará por igualdad
//     exacta: usa ALIAS_ESCUDOS más abajo para mapear esas variantes.
//
// Para subir un escudo: guarda el archivo en public/img/escudos/ con el
// nombre exacto que indica el comentario junto a cada club (todo en
// minúsculas, sin acentos, espacios sustituidos por guiones, extensión
// .png). En cuanto el archivo exista con ese nombre, el escudo se
// mostrará automáticamente en Calendario, Clasificación y cualquier
// ficha de partido, sin tocar nada de código.
const TODOS_LOS_CLUBES_SEGUNDA_FEDERACION = {
  "Grupo 1": [
    "Deportivo Alavés B",            // deportivo-alaves-b.png
    "Atlético Astorga",              // atletico-astorga.png
    "Arosa SC",                      // arosa-sc.png
    "Bergantiños",                   // bergantinos.png
    "CD Basconia",                   // cd-basconia.png
    "Coruxo",                        // coruxo.png
    "SD Eibar B",                    // sd-eibar-b.png
    "Club Portugalete",              // club-portugalete.png
    "SD Gernika",                    // sd-gernika.png
    "Ourense CF",                    // ourense-cf.png
    "RS Gimnástica de Torrelavega",  // rs-gimnastica-de-torrelavega.png
    "Rayo Cantabria",                // rayo-cantabria.png
    "Real Oviedo Vetusta",           // real-oviedo-vetusta.png
    "SD Amorebieta",                 // sd-amorebieta.png
    "Sestao River",                  // sestao-river.png
    "SD Compostela",                 // sd-compostela.png
    "UD Llanera",                    // ud-llanera.png
    "Club Marino de Luanco",         // club-marino-de-luanco.png
  ],
  "Grupo 2": [
    "CD Arnedo",                     // cd-arnedo.png
    "CE Manresa",                    // ce-manresa.png
    "FC Barcelona Atlètic",          // fc-barcelona-atletic.png
    "Náxara",                        // naxara.png
    "UE Olot",                       // ue-olot.png
    "CD Ebro",                       // cd-ebro.png
    "Peña Sport",                    // pena-sport.png
    "Utebo",                         // utebo.png
    "Reus FC Reddis",                // reus-fc-reddis.png
    "Atlético Osasuna B",            // atletico-osasuna-b.png
    "SD Logroñés",                   // sd-logrones.png
    "RCD Espanyol B",                // rcd-espanyol-b.png
    "CF Calamocha",                  // cf-calamocha.png
    "Terrassa",                      // terrassa.png
    "CD Tudelano",                   // cd-tudelano.png
    "UD Logroñés B",                 // ud-logrones-b.png
    "UD Barbastro",                  // ud-barbastro.png
    "Girona FC B",                   // girona-fc-b.png
  ],
  "Grupo 3": [
    "CD Alcoyano",                   // cd-alcoyano.png
    "CD Cieza",                      // cd-cieza.png
    "UD Castellonense",              // ud-castellonense.png
    "UCAM Murcia",                   // ucam-murcia.png
    "CF La Nucía",                   // cf-la-nucia.png
    "UD Poblense",                   // ud-poblense.png
    "CF Lorca Deportiva",            // cf-lorca-deportiva.png
    "Elche Ilicitano",               // elche-ilicitano.png
    "CD Minera",                     // cd-minera.png
    "SCR Peña Deportiva",            // scr-pena-deportiva.png
    "Real Murcia Imperial",          // real-murcia-imperial.png
    "Orihuela CF",                   // orihuela-cf.png
    "CD Castellón B",                // cd-castellon-b.png
    "CF Intercity",                  // cf-intercity.png
    "Valencia Mestalla",             // valencia-mestalla.png
    "RCD Mallorca B",                // rcd-mallorca-b.png
    "Yeclano Deportivo",             // yeclano-deportivo.png
    "CD Atlético Baleares",          // cd-atletico-baleares.png
  ],
  "Grupo 4": [
    "Atlético Antoniano",            // atletico-antoniano.png
    "CD Don Benito",                 // cd-don-benito.png
    "Salerm Cosmetics Puente Genil", // salerm-cosmetics-puente-genil.png
    "CP Mijas Las Lagunas",          // cp-mijas-las-lagunas.png
    "CD Badajoz",                    // cd-badajoz.png (ya subido)
    "CD Tenerife B",                 // cd-tenerife-b.png
    "Atlético Central",              // atletico-central.png
    "Recreativo de Huelva",          // recreativo-de-huelva.png (ya subido)
    "CD Estepona",                   // cd-estepona.png
    "Xerez CD",                      // xerez-cd.png
    "Linares Deportivo",             // linares-deportivo.png (ya subido)
    "CD Ciudad de Lucena",           // cd-ciudad-de-lucena.png
    "Las Palmas Atlético",           // las-palmas-atletico.png
    "Betis Deportivo",               // betis-deportivo.png
    "Marbella FC",                   // marbella-fc.png
    "Atlético Sanluqueño",           // atletico-sanluqueno.png
    "UD Tamaraceite",                // ud-tamaraceite.png
    "Sevilla Atlético",              // sevilla-atletico.png
  ],
  "Grupo 5": [
    "Real Madrid C",                 // real-madrid-c.png
    "Atlético Albacete",             // atletico-albacete.png
    "Atlético de Madrid C",          // atletico-de-madrid-c.png
    "Real Ávila",                    // real-avila.png
    "CD Atlético Paso",              // cd-atletico-paso.png
    "CD Numancia",                   // cd-numancia.png (ya subido)
    "CD Guadalajara",                // cd-guadalajara.png (ya subido)
    "Salamanca UDS",                 // salamanca-uds.png
    "Calvo Sotelo Puertollano",      // calvo-sotelo-puertollano.png
    "Gimnástica Segoviana",          // gimnastica-segoviana.png
    "RSD Alcalá",                    // rsd-alcala.png
    "CF Talavera de la Reina",       // cf-talavera-de-la-reina.png (ya subido)
    "Real Valladolid Promesas",      // real-valladolid-promesas.png
    "CDA Navalcarnero",              // cda-navalcarnero.png
    "Atlético Tordesillas",          // atletico-tordesillas.png
    "UD San Sebastián de los Reyes", // ud-san-sebastian-de-los-reyes.png
    "UB Conquense",                  // ub-conquense.png (ya subido)
    "Getafe B",                      // getafe-b.png
  ],
};

// Lista plana (sin agrupar) de los 90, útil para poblar desplegables o
// comprobar pertenencia sin tener que recorrer el objeto por grupos.
const TODOS_LOS_CLUBES_SEGUNDA_FEDERACION_PLANO = Object.values(TODOS_LOS_CLUBES_SEGUNDA_FEDERACION).flat();

// Devuelve el grupo oficial ("Grupo 1".."Grupo 5") de un club de
// Segunda Federación a partir de TODOS_LOS_CLUBES_SEGUNDA_FEDERACION, o
// null si no se reconoce el nombre (por ejemplo, si en el panel se ha
// guardado con una grafía distinta a la de esta lista). Útil para
// futuras pantallas (p.ej. la ficha de un club) que quieran mostrar en
// qué grupo juega sin depender de que el campo "grupo" del partido esté
// siempre bien puesto en la base de datos.
function grupoSegundaFederacionDeClub(nombreEquipo) {
  for (const [grupo, equipos] of Object.entries(TODOS_LOS_CLUBES_SEGUNDA_FEDERACION)) {
    if (equipos.includes(nombreEquipo)) return grupo;
  }
  return null;
}

// Devuelve el listado de clubes de una categoría (p.ej. "hypermotion",
// "primera_federacion", "segunda_federacion"). Si la categoría no existe
// en CLUBS_BY_CATEGORY (por ejemplo "general", "resultados" o "inicio")
// devuelve un array vacío, para que tanto el panel de administración
// como el menú de la web sepan que esa categoría no tiene submenú/
// desplegable de clubes.
// Incluye también los clubes "personalizados" (ver más abajo) que se
// hayan cargado para esa categoría desde el servidor.
function getClubsForCategoria(categoria) {
  const fijos = CLUBS_BY_CATEGORY[categoria] || [];
  const personalizados = (CUSTOM_CLUBS_BY_CATEGORY[categoria] || []).map(c => c.nombre);
  // Evita duplicados por si un club personalizado coincide (por nombre)
  // con uno que ya estaba fijo en clubs.js.
  const extra = personalizados.filter(n => !fijos.includes(n));
  return [...fijos, ...extra];
}

// Normaliza un texto para comparar nombres de equipo sin distinguir
// mayúsculas, tildes ni dobles espacios (p.ej. "castellon" debe
// encontrar "CD Castellón"). Se apoya en el mismo NFKD que ya usa
// slugEquipo, pero sin convertir a guiones para poder hacer también
// coincidencias "contiene" (substring), no solo igualdad exacta.
function normalizarTextoBusquedaClub(texto) {
  return (texto || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Busca, entre todos los clubes conocidos (fijos de todas las
// categorías + personalizados ya cargados con cargarCustomClubs), TODOS
// los que coinciden con el texto que ha escrito el usuario en el
// buscador. Se usa para que, si alguien busca el nombre de un equipo en
// vez de una noticia, se le ofrezcan accesos directos a la ficha de
// cada club que encaje (categoria.html?club=...), además de los
// resultados de búsqueda de artículos. Devuelve un array (vacío si no
// hay ninguna coincidencia razonable), con las coincidencias exactas
// primero y luego las parciales, sin duplicar un mismo club aunque
// aparezca en varias categorías.
function buscarClubesPorTexto(textoBusqueda) {
  const q = normalizarTextoBusquedaClub(textoBusqueda);
  if (!q || q.length < 3) return []; // evita falsos positivos con 1-2 letras

  const exactas = [];
  const parciales = [];
  const vistos = new Set();

  for (const categoria of Object.keys(CLUBS_BY_CATEGORY)) {
    for (const nombre of getClubsForCategoria(categoria)) {
      // Mismo club con el mismo nombre puede repetirse entre categorías
      // (p.ej. un filial listado también en la categoría del primer
      // equipo); no lo repetimos como una tarjeta de acceso directo
      // distinta.
      const clave = `${categoria}||${nombre}`;
      if (vistos.has(clave)) continue;

      const nombreNorm = normalizarTextoBusquedaClub(nombre);
      // También se compara contra el nombre sin sigla inicial (CD, UD,
      // SD, CF, RC...) para que "castellon" encuentre "CD Castellón" y
      // "las palmas" encuentre "UD Las Palmas" sin tener que escribir
      // la sigla completa.
      const sinSigla = nombreNorm.replace(/^(cd|ud|sd|cf|rc|rcd|ce|cp|ad|fc|ub)\s+/, "");
      if (nombreNorm === q || sinSigla === q) {
        vistos.add(clave);
        exactas.push({ nombre, categoria });
      } else if (nombreNorm.includes(q) || sinSigla.includes(q)) {
        vistos.add(clave);
        parciales.push({ nombre, categoria });
      }
    }
  }

  return [...exactas, ...parciales];
}

// Compatibilidad: versión que devuelve solo la primera coincidencia
// (coincidencia exacta si la hay, si no la primera parcial). La usa
// quien solo necesita UN club, como el atajo de la tecla "Intro" en el
// buscador, donde hay que elegir un único destino al que navegar.
function buscarClubPorTexto(textoBusqueda) {
  return buscarClubesPorTexto(textoBusqueda)[0] || null;
}

// ---------- CLUBES PERSONALIZADOS ("Otro equipo") ----------
// Clubes que se han añadido a mano desde "Otro equipo (no está en la
// lista)" al crear un resultado o una noticia, guardados en el
// servidor (tabla custom_clubs) para que a partir de ese momento
// aparezcan ya en el desplegable normal. Se cargan una vez, al arrancar
// cada página, con cargarCustomClubs() (ver abajo).
// Forma: { categoria: [ { nombre, escudo_url }, ... ] }
let CUSTOM_CLUBS_BY_CATEGORY = {};

// Pide al servidor los clubes personalizados y los deja disponibles en
// CUSTOM_CLUBS_BY_CATEGORY. Hay que llamarla (y esperar a que termine)
// antes de pintar cualquier desplegable de equipos o menú que dependa
// de getClubsForCategoria/getEscudoUrl para que ya los incluya. Falla
// en silencio (deja la lista fija de clubs.js tal cual) si no hay
// conexión, para no romper la página por esto.
async function cargarCustomClubs() {
  try {
    const res = await apiFetch(`/api/custom-clubs`);
    const { clubes } = await res.json();
    const porCategoria = {};
    for (const c of clubes || []) {
      if (!porCategoria[c.categoria]) porCategoria[c.categoria] = [];
      porCategoria[c.categoria].push(c);
    }
    CUSTOM_CLUBS_BY_CATEGORY = porCategoria;
  } catch {
    // Sin conexión o error del servidor: se sigue trabajando solo con
    // los clubes fijos de CLUBS_BY_CATEGORY.
  }
}

// ---------- ENLACE A LA FICHA DE EQUIPO ----------
// La "ficha de equipo" es categoria.html?cat=<competicion>&club=<nombre>:
// ya muestra escudo, info del club, últimos resultados/próximos
// partidos y noticias. Se centraliza aquí la construcción de esa URL
// para que clasificación, calendario y resultados enlacen todos igual
// (mismo escape de caracteres, misma base de ruta) en vez de repetir
// la plantilla en cada página.
function enlaceEquipoHref(nombreEquipo, categoria) {
  if (!nombreEquipo || !categoria) return "";
  return `${baseHref()}categoria.html?cat=${encodeURIComponent(categoria)}&club=${encodeURIComponent(nombreEquipo)}`;
}

// ---------- ESCUDOS ----------
// Convierte el nombre de un club en el slug que usamos como nombre de
// archivo del escudo (minúsculas, sin acentos, espacios -> guiones).
// Ej: "CD Castellón" -> "cd-castellon"
function slugEquipo(nombre) {
  if (!nombre) return "";
  return nombre
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Alias manuales: cubre nombres que llegan desde la base de datos con una
// grafía distinta a la de CLUBS_BY_CATEGORY (con o sin tilde, con o sin
// sigla, abreviados, etc.) y no encontrarían su escudo solo con el slug
// automático. La clave es el slug "tal cual llega"; el valor es el slug
// real del archivo en img/escudos/.
const ALIAS_ESCUDOS = {
  "albacete": "albacete-balompie",
};

// Filiales cuyo escudo debe ser SIEMPRE el del primer equipo. La clave
// es el nombre del filial tal cual aparece en CLUBS_BY_CATEGORY; el
// valor es el slug de archivo (en img/escudos/) del escudo del primer
// equipo que hay que reutilizar. Esto es intencional y prioritario por
// encima del slug automático del propio nombre: un filial no tiene
// escudo distinto al del primer equipo en el fútbol real, así que aquí
// se fuerza el mismo archivo en vez de depender de que alguien suba uno
// (idéntico, por definición) a mano para cada filial.
const FILIAL_A_SLUG_PRIMER_EQUIPO = {
  "Real Sociedad B": "real-sociedad-b",
  "Bilbao Athletic": "bilbao-athletic",
  "RC Deportivo Fabril": "rc-deportivo-fabril",
  "Real Madrid Castilla": "real-madrid-castilla",
  "Villarreal CF B": "villarreal-cf-b",
  "Atlético Madrileño": "atletico-madrileno",
  "Celta Fortuna": "celta-fortuna",
};

// Sufijos de equipo filial: además del mapa explícito de arriba, esto
// cubre nombres no listados quitando el sufijo habitual (ej. "CD
// Castellón B" -> "CD Castellón") para reutilizar el escudo del primer
// equipo. Se usa como segundo intento (ver onerror en resultados.html),
// para no pisar clubes cuyo nombre "filial" es en realidad su nombre
// propio y ya tiene su escudo específico.
const SUFIJOS_FILIAL = [
  /\s+b$/i,
  /\s+c$/i,
  /\s+ii$/i,
  /\s+atl[eé]tico$/i,
  /\s+castilla$/i,
  /\s+fabril$/i,
  /\s+promesas$/i,
];

function quitarSufijoFilial(nombre) {
  for (const re of SUFIJOS_FILIAL) {
    if (re.test(nombre)) return nombre.replace(re, "").trim();
  }
  return null;
}

// Ruta del escudo genérico que se muestra cuando un equipo no tiene
// escudo propio (equipo externo sin escudo subido, o archivo no encontrado).
const ESCUDO_GENERICO = "img/escudos/generico.svg";

// Devuelve el slug "principal" a probar primero: si el nombre es un
// filial mapeado en FILIAL_A_SLUG_PRIMER_EQUIPO se usa directamente el
// slug fijado ahí (así el escudo del filial es siempre el mismo, de
// forma explícita y sin depender de heurísticas); si no, alias manual
// si existe, si no el slug directo del nombre tal cual llega.
function resolverSlugEscudo(nombreEquipo) {
  return FILIAL_A_SLUG_PRIMER_EQUIPO[nombreEquipo] || ALIAS_ESCUDOS[slugEquipo(nombreEquipo)] || slugEquipo(nombreEquipo);
}

// Devuelve el slug de "segundo intento", quitando sufijo de filial, para
// usarlo solo cuando el escudo principal no se ha podido cargar (ver
// onerror en resultados.html). Devuelve null si no aplica ningún sufijo.
function resolverSlugEscudoFilial(nombreEquipo) {
  const sinSufijo = quitarSufijoFilial(nombreEquipo);
  if (!sinSufijo) return null;
  const slug = slugEquipo(sinSufijo);
  return ALIAS_ESCUDOS[slug] || slug;
}

// Devuelve la URL del escudo de un club. Si el resultado trae su propio
// campo de escudo (por ejemplo un equipo externo subido a Cloudinary vía
// el panel de admin), se usa ese; si no, se busca primero entre los
// clubes personalizados cargados del servidor (por si se subió un
// escudo al añadirlo como "Otro equipo"), y si tampoco hay, se busca en
// la carpeta local de escudos por el slug del nombre (resolviendo alias).
function getEscudoUrl(nombreEquipo, escudoUrlPersonalizado) {
  if (escudoUrlPersonalizado) return escudoUrlPersonalizado;
  const personalizado = Object.values(CUSTOM_CLUBS_BY_CATEGORY)
    .flat()
    .find(c => c.nombre === nombreEquipo && c.escudo_url);
  if (personalizado) return personalizado.escudo_url;
  const slug = resolverSlugEscudo(nombreEquipo);
  return slug ? `img/escudos/${slug}.png` : ESCUDO_GENERICO;
}

// Se ejecuta cuando un <img class="escudo"> no carga. Primer fallo:
// reintenta quitando un posible sufijo de filial (ej. "CD Castellón B"
// -> "CD Castellón"). Si ese segundo intento también falla (o no aplica
// ningún sufijo), cae definitivamente al escudo genérico. Vive aquí
// (junto a getEscudoUrl) para que cualquier página que solo cargue
// clubs.js -no necesariamente partidos.js- pueda mostrar escudos con su
// mismo comportamiento de "reintento antes de genérico" (p.ej. el
// marcador de partido dentro de una noticia, en noticia.html).
function manejarErrorEscudo(img) {
  if (img.dataset.intentoFilial) {
    img.onerror = null;
    img.src = ESCUDO_GENERICO;
    return;
  }
  img.dataset.intentoFilial = "1";
  const slugFilial = resolverSlugEscudoFilial(img.dataset.equipo);
  if (slugFilial) {
    img.src = `img/escudos/${slugFilial}.png`;
  } else {
    img.onerror = null;
    img.src = ESCUDO_GENERICO;
  }
}

// ---------- ESTADIOS ----------
// Estadio habitual de cada club, para autorellenar el campo "Ubicación
// del partido" en el panel de admin cuando se elige el equipo local (un
// partido se juega, salvo excepción puntual, en el campo del local). La
// clave es el nombre del club tal cual aparece en CLUBS_BY_CATEGORY.
// Si un club no está aquí (por ejemplo uno "personalizado" añadido a
// mano, o uno que falte por incluir), simplemente no se autorellena nada
// y el campo se queda en blanco para rellenar a mano, sin romper nada.
const ESTADIO_POR_CLUB = {
  // LaLiga Hypermotion
  "AD Ceuta FC": "Alfonso Murube",
  "Albacete Balompié": "Carlos Belmonte",
  "Burgos CF": "El Plantío",
  "Cádiz CF": "Nuevo Mirandilla",
  "CD Castellón": "Castalia",
  "CD Eldense": "Nuevo Pepico Amat",
  "CD Leganés": "Butarque",
  "CD Tenerife": "Heliodoro Rodríguez López",
  "CE Sabadell": "Nova Creu Alta",
  "Celta Fortuna": "A Madroa",
  "Córdoba CF": "Nuevo Arcángel",
  "FC Andorra": "Estadi Nacional",
  "Girona FC": "Montilivi",
  "Granada CF": "Nuevo Los Cármenes",
  "Real Sociedad B": "Zubieta",
  "RCD Mallorca": "Son Moix",
  "Real Oviedo": "Carlos Tartiere",
  "Real Sporting": "El Molinón",
  "Real Valladolid CF": "José Zorrilla",
  "SD Eibar": "Ipurua",
  "UD Almería": "Power Horse Stadium",
  "UD Las Palmas": "Gran Canaria",

  // Primera Federación · Grupo 1
  "AD Mérida": "Romano",
  "Arenas Club": "Gobela",
  "Bilbao Athletic": "Lezama",
  "Barakaldo CF": "Lasesarre",
  "CD Coria": "La Isla",
  "CD Extremadura": "Francisco de la Hera",
  "CD Lugo": "Anxo Carro",
  "CD Mirandés": "Anduva",
  "CP Cacereño": "El Príncipe Felipe",
  "Cultural Leonesa": "Reino de León",
  "Pontevedra CF": "Pasarón",
  "Racing Club Ferrol": "A Malata",
  "RC Deportivo Fabril": "Abegondo",
  "Real Avilés Industrial": "Román Suárez Puerta",
  "Real Unión Club": "Gal",
  "SD Ponferradina": "El Toralín",
  "UD Logroñés": "Las Gaunas",
  "UD Ourense": "O Couto",
  "Unionistas de Salamanca CF": "Reina Sofía",
  "Zamora CF": "Ruta de la Plata",

  // Primera Federación · Grupo 2
  "AD Alcorcón": "Santo Domingo",
  "Águilas FC": "El Rubial",
  "Algeciras CF": "Nuevo Mirador",
  "Antequera CF": "El Maulí",
  "Atlético Madrileño": "Cerro del Espino",
  "CD Teruel": "Pinilla",
  "CE Europa": "Nou Sardenya",
  "CF Rayo Majadahonda": "Cerro del Espino",
  "FC Cartagena": "Cartagonova",
  "Gimnàstic de Tarragona": "Nou Estadi",
  "Hércules CF": "José Rico Pérez",
  "Juventud Torremolinos CF": "El Pozuelo",
  "Real Jaén CF": "La Victoria",
  "Real Madrid Castilla": "Alfredo Di Stéfano",
  "Real Murcia CF": "Nueva Condomina",
  "Real Zaragoza": "La Romareda",
  "SD Huesca": "El Alcoraz",
  "UD Ibiza": "Can Misses",
  "UE Sant Andreu": "Narcís Sala",
  "Villarreal CF B": "Ciudad Deportiva del Villarreal",

  // Segunda Federación · Grupo 1
  "Arosa SC": "A Lomba",
  "Atlético Astorga": "La Eragudina",
  "Bergantiños": "As Eiroas",
  "CD Basconia": "Artunduaga",
  "Club Marino de Luanco": "Miramar",
  "Club Portugalete": "La Florida",
  "Coruxo": "O Vao",
  "Deportivo Alavés B": "José Luis Compañón - Ibaia",
  "Ourense CF": "O Couto",
  "Rayo Cantabria": "La Planchada",
  "Real Oviedo Vetusta": "El Requexón",
  "RS Gimnástica de Torrelavega": "El Malecón",
  "SD Amorebieta": "Urritxe",
  "SD Compostela": "Verónica Boquete de San Lázaro",
  "SD Eibar B": "Unbe",
  "SD Gernika": "Urbieta",
  "Sestao River": "Las Llanas",
  "UD Llanera": "Pepe Quimarán",

  // Segunda Federación · Grupo 2
  "Atlético Osasuna B": "Tajonar",
  "CD Arnedo": "Sendero",
  "CD Ebro": "Pedro Sancho",
  "CD Tudelano": "Ciudad de Tudela",
  "CE Manresa": "Vilanova - Manresa",
  "CF Calamocha": "Pedro Sancho",
  "FC Barcelona Atlètic": "Johan Cruyff",
  "Girona FC B": "Municipal de Riudarenes",
  "Náxara": "Isaac Peña",
  "Peña Sport": "San Francisco (Tafalla)",
  "RCD Espanyol B": "Ciutat Esportiva Dani Jarque",
  "Reus FC Reddis": "Municipal de Reus",
  "SD Logroñés": "Pradoviejo",
  "Terrassa": "Estadi Olímpic de Terrassa",
  "UD Barbastro": "Municipal de Deportes de Barbastro",
  "UD Logroñés B": "Ciudad Deportiva UD Logroñés",
  "UE Olot": "Municipal d'Olot",
  "Utebo": "Municipal de Utebo",

  // Segunda Federación · Grupo 3
  "CD Alcoyano": "El Collao",
  "CD Atlético Baleares": "Balear",
  "CD Castellón B": "Gaetà Huguet",
  "CD Cieza": "La Arboleja",
  "CD Minera": "Ángel Celdrán",
  "CF Intercity": "Antonio Solana",
  "CF La Nucía": "Olímpic Camilo Cano",
  "CF Lorca Deportiva": "Francisco Artés Carrasco",
  "Elche Ilicitano": "José Díez Iborra",
  "Orihuela CF": "Los Arcos",
  "RCD Mallorca B": "Son Bibiloni",
  "Real Murcia Imperial": "Nueva Condomina",
  "SCR Peña Deportiva": "Estadi Balear",
  "UCAM Murcia": "BeSoccer La Condomina",
  "UD Castellonense": "Eliseo Pla Ramírez",
  "UD Poblense": "Municipal de Sa Pobla",
  "Valencia Mestalla": "Antonio Puchades",
  "Yeclano Deportivo": "La Constitución",

  // Segunda Federación · Grupo 4
  "Atlético Antoniano": "Municipal de Lebrija",
  "Atlético Central": "Nuevo Estadio Ciudad de Alcalá",
  "Atlético Sanluqueño": "El Palmar",
  "Betis Deportivo": "Luis del Sol",
  "CD Badajoz": "Nuevo Vivero",
  "CD Ciudad de Lucena": "Ciudad de Lucena",
  "CD Don Benito": "Vicente Sanz",
  "CD Estepona": "Francisco Muñoz Pérez",
  "CD Tenerife B": "Ciudad Deportiva Javier Pérez",
  "CP Mijas Las Lagunas": "Las Lagunas",
  "Las Palmas Atlético": "Anexo Estadio Gran Canaria",
  "Linares Deportivo": "Linarejos",
  "Marbella FC": "Dama de Noche - Banús Football Center",
  "Recreativo de Huelva": "Nuevo Colombino",
  "Salerm Cosmetics Puente Genil": "Manuel Polinario",
  "Sevilla Atlético": "Jesús Navas",
  "UD Tamaraceite": "Juan Guedes",
  "Xerez CD": "Municipal de Chapín",

  // Segunda Federación · Grupo 5
  "Atlético Albacete": "Ciudad Deportiva Andrés Iniesta",
  "Atlético de Madrid C": "Cerro del Espino",
  "Atlético Tordesillas": "Municipal Las Salinas",
  "Calvo Sotelo Puertollano": "Ciudad de Puertollano",
  "CD Atlético Paso": "Municipal El Paso",
  "CD Guadalajara": "Pedro Escartín",
  "CD Numancia": "Los Pajaritos",
  "CDA Navalcarnero": "Municipal Mariano González",
  "CF Talavera de la Reina": "El Prado",
  "Getafe B": "Ciudad Deportiva Getafe CF",
  "Gimnástica Segoviana": "La Albuera",
  "Real Ávila": "Adolfo Suárez",
  "Real Madrid C": "Ciudad Real Madrid",
  "Real Valladolid Promesas": "Anexos Estadio José Zorrilla",
  "RSD Alcalá": "El Val",
  "Salamanca UDS": "El Helmántico",
  "UB Conquense": "La Fuensanta",
  "UD San Sebastián de los Reyes": "José Luis de la Hoz",
};

// Devuelve el estadio habitual de un club (o cadena vacía si no está en
// ESTADIO_POR_CLUB, por ejemplo un club personalizado o uno pendiente de
// añadir a la base de datos de arriba).
function getEstadioClub(nombreEquipo) {
  return ESTADIO_POR_CLUB[nombreEquipo] || "";
}

// ---------- GRUPOS REGIONALES ----------
// Grupo regional habitual de cada club, para autorellenar el campo
// "Grupo" en el panel de admin (p.ej. importación rápida) cuando se
// elige el equipo local. La clave es el nombre del club tal cual
// aparece en CLUBS_BY_CATEGORY. Cubre Primera Federación (Grupo 1 y
// Grupo 2) y Segunda Federación (Grupo 1 a Grupo 5), tomando esta
// última de TODOS_LOS_CLUBES_SEGUNDA_FEDERACION más arriba (misma
// fuente oficial). Para cualquier club que no esté aquí (competición
// sin grupos, o un club personalizado añadido a mano) el campo
// simplemente se queda para elegir a mano, sin romper nada.
const GRUPO_POR_CLUB = {
  // Primera Federación · Grupo 1
  "AD Mérida": "Grupo 1",
  "Arenas Club": "Grupo 1",
  "Bilbao Athletic": "Grupo 1",
  "Barakaldo CF": "Grupo 1",
  "CD Coria": "Grupo 1",
  "CD Extremadura": "Grupo 1",
  "CD Lugo": "Grupo 1",
  "CD Mirandés": "Grupo 1",
  "CP Cacereño": "Grupo 1",
  "Cultural Leonesa": "Grupo 1",
  "Pontevedra CF": "Grupo 1",
  "Racing Club Ferrol": "Grupo 1",
  "RC Deportivo Fabril": "Grupo 1",
  "Real Avilés Industrial": "Grupo 1",
  "Real Unión Club": "Grupo 1",
  "SD Ponferradina": "Grupo 1",
  "UD Logroñés": "Grupo 1",
  "UD Ourense": "Grupo 1",
  "Unionistas de Salamanca CF": "Grupo 1",
  "Zamora CF": "Grupo 1",

  // Primera Federación · Grupo 2
  "AD Alcorcón": "Grupo 2",
  "Águilas FC": "Grupo 2",
  "Algeciras CF": "Grupo 2",
  "Antequera CF": "Grupo 2",
  "Atlético Madrileño": "Grupo 2",
  "CD Teruel": "Grupo 2",
  "CE Europa": "Grupo 2",
  "CF Rayo Majadahonda": "Grupo 2",
  "FC Cartagena": "Grupo 2",
  "Gimnàstic de Tarragona": "Grupo 2",
  "Hércules CF": "Grupo 2",
  "Juventud Torremolinos CF": "Grupo 2",
  "Real Jaén CF": "Grupo 2",
  "Real Madrid Castilla": "Grupo 2",
  "Real Murcia CF": "Grupo 2",
  "Real Zaragoza": "Grupo 2",
  "SD Huesca": "Grupo 2",
  "UD Ibiza": "Grupo 2",
  "UE Sant Andreu": "Grupo 2",
  "Villarreal CF B": "Grupo 2",

  // Segunda Federación · Grupo 1
  "Arosa SC": "Grupo 1",
  "Atlético Astorga": "Grupo 1",
  "Bergantiños": "Grupo 1",
  "CD Basconia": "Grupo 1",
  "Club Marino de Luanco": "Grupo 1",
  "Club Portugalete": "Grupo 1",
  "Coruxo": "Grupo 1",
  "Deportivo Alavés B": "Grupo 1",
  "Ourense CF": "Grupo 1",
  "Rayo Cantabria": "Grupo 1",
  "Real Oviedo Vetusta": "Grupo 1",
  "RS Gimnástica de Torrelavega": "Grupo 1",
  "SD Amorebieta": "Grupo 1",
  "SD Compostela": "Grupo 1",
  "SD Eibar B": "Grupo 1",
  "SD Gernika": "Grupo 1",
  "Sestao River": "Grupo 1",
  "UD Llanera": "Grupo 1",

  // Segunda Federación · Grupo 2
  "Atlético Osasuna B": "Grupo 2",
  "CD Arnedo": "Grupo 2",
  "CD Ebro": "Grupo 2",
  "CD Tudelano": "Grupo 2",
  "CE Manresa": "Grupo 2",
  "CF Calamocha": "Grupo 2",
  "FC Barcelona Atlètic": "Grupo 2",
  "Girona FC B": "Grupo 2",
  "Náxara": "Grupo 2",
  "Peña Sport": "Grupo 2",
  "RCD Espanyol B": "Grupo 2",
  "Reus FC Reddis": "Grupo 2",
  "SD Logroñés": "Grupo 2",
  "Terrassa": "Grupo 2",
  "UD Barbastro": "Grupo 2",
  "UD Logroñés B": "Grupo 2",
  "UE Olot": "Grupo 2",
  "Utebo": "Grupo 2",

  // Segunda Federación · Grupo 3
  "CD Alcoyano": "Grupo 3",
  "CD Atlético Baleares": "Grupo 3",
  "CD Castellón B": "Grupo 3",
  "CD Cieza": "Grupo 3",
  "CD Minera": "Grupo 3",
  "CF Intercity": "Grupo 3",
  "CF La Nucía": "Grupo 3",
  "CF Lorca Deportiva": "Grupo 3",
  "Elche Ilicitano": "Grupo 3",
  "Orihuela CF": "Grupo 3",
  "RCD Mallorca B": "Grupo 3",
  "Real Murcia Imperial": "Grupo 3",
  "SCR Peña Deportiva": "Grupo 3",
  "UCAM Murcia": "Grupo 3",
  "UD Castellonense": "Grupo 3",
  "UD Poblense": "Grupo 3",
  "Valencia Mestalla": "Grupo 3",
  "Yeclano Deportivo": "Grupo 3",

  // Segunda Federación · Grupo 4
  "Atlético Antoniano": "Grupo 4",
  "Atlético Central": "Grupo 4",
  "Atlético Sanluqueño": "Grupo 4",
  "Betis Deportivo": "Grupo 4",
  "CD Badajoz": "Grupo 4",
  "CD Ciudad de Lucena": "Grupo 4",
  "CD Don Benito": "Grupo 4",
  "CD Estepona": "Grupo 4",
  "CD Tenerife B": "Grupo 4",
  "CP Mijas Las Lagunas": "Grupo 4",
  "Las Palmas Atlético": "Grupo 4",
  "Linares Deportivo": "Grupo 4",
  "Marbella FC": "Grupo 4",
  "Recreativo de Huelva": "Grupo 4",
  "Salerm Cosmetics Puente Genil": "Grupo 4",
  "Sevilla Atlético": "Grupo 4",
  "UD Tamaraceite": "Grupo 4",
  "Xerez CD": "Grupo 4",

  // Segunda Federación · Grupo 5
  "Atlético Albacete": "Grupo 5",
  "Atlético de Madrid C": "Grupo 5",
  "Atlético Tordesillas": "Grupo 5",
  "Calvo Sotelo Puertollano": "Grupo 5",
  "CD Atlético Paso": "Grupo 5",
  "CD Guadalajara": "Grupo 5",
  "CD Numancia": "Grupo 5",
  "CDA Navalcarnero": "Grupo 5",
  "CF Talavera de la Reina": "Grupo 5",
  "Getafe B": "Grupo 5",
  "Gimnástica Segoviana": "Grupo 5",
  "Real Ávila": "Grupo 5",
  "Real Madrid C": "Grupo 5",
  "Real Valladolid Promesas": "Grupo 5",
  "RSD Alcalá": "Grupo 5",
  "Salamanca UDS": "Grupo 5",
  "UB Conquense": "Grupo 5",
  "UD San Sebastián de los Reyes": "Grupo 5",
};

// Devuelve el grupo regional habitual de un club (o cadena vacía si no
// está en GRUPO_POR_CLUB: club de una competición sin grupos, o club
// personalizado).
function getGrupoClub(nombreEquipo) {
  return GRUPO_POR_CLUB[nombreEquipo] || "";
}