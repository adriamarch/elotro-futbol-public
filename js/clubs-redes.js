// ---------- Redes sociales de los clubes (X / Instagram) ----------
// Lo usa el modal "Compartir en redes" del panel (admin.js):
//   · hashtagDeClub(nombre)      -> "#RealOviedo" (se genera solo del nombre)
//   · cuentaXDeClub(nombre)      -> "@RealOviedo" o null si no está en la lista
//   · esNombreDeClub(nombre)     -> false para "General", "LaLiga Hypermotion"...
//                                   (valores del campo club que no son un club)
//   · mencionarClubesEnTexto()   -> cambia los nombres de los equipos de un
//                                   texto por la mención @ de su cuenta
//
// CÓMO AÑADIR UN CLUB: pon su nombre OFICIAL (el mismo que en clubs.js) y
// su cuenta oficial de X. Si un club no está aquí, su nombre se deja tal
// cual en el texto (no se inventa ninguna cuenta) y el modal avisa de cuáles
// faltan, con la línea ya preparada para pegar aquí abajo.
//
// CÓMO SE SUSTITUYEN LOS NOMBRES (todo en una sola pasada, de más largo a
// más corto, para que "Real Oviedo Vetusta" no se estropee por "Real Oviedo"):
//   1. Clubes de la noticia (los dos del partido en previas/crónicas, el club
//      elegido en el resto): prioridad máxima. Se buscan con su nombre
//      oficial, sin siglas ("Castellón"), sin "Real" ("Oviedo") y con los
//      alias de ALIAS_CLUB_X / ALIAS_CLUB_X_SOLO_CONTEXTO ("Dépor", "Racing").
//   2. Cualquier otro club de esta lista que aparezca en el titular (una
//      noticia de Arbitraje con "General" o "LaLiga Hypermotion" como club
//      también menciona a los equipos que cite el titular). Se desactiva
//      con MENCIONAR_CLUBES_DEL_TITULAR = false.
//   3. Clubes de clubs.js SIN cuenta: se "protegen" (se reconocen para que
//      "Sporting Hortaleza" no se convierta en "@RealSporting Hortaleza")
//      pero su nombre se deja tal cual.
const CLUB_CUENTA_X = {
  // ---------- LaLiga Hypermotion 2026/27 ----------
  "AD Ceuta FC": "@ADCeuta_FC",
  "Albacete Balompié": "@AlbaceteBPSAD",
  "Burgos CF": "@Burgos_CF",
  "Cádiz CF": "@Cadiz_CF",
  "CD Castellón": "@CDCastellon",
  "CD Eldense": "@CD_Eldense",
  "CD Leganés": "@CDLeganes",
  "CD Tenerife": "@CDTOficial",
  "CE Sabadell": "@CESabadell",
  "Celta Fortuna": "@CanteiraCeleste",
  "Córdoba CF": "@CordobaCF",
  "FC Andorra": "@FCAndorra",
  "Girona FC": "@GironaFC",
  "Granada CF": "@GranadaCF",
  "RCD Mallorca": "@RCD_Mallorca",
  "Real Oviedo": "@RealOviedo",
  "Real Sociedad B": "@RSZubieta_",
  "Real Sporting": "@RealSporting",
  "Real Valladolid CF": "@realvalladolid",
  "SD Eibar": "@SDEibar",
  "UD Almería": "@U_D_Almeria",
  "UD Las Palmas": "@UDLP_Oficial",
  "Málaga CF": "@MalagaCF",
  "Racing de Santander": "@RealRacingClub",
  "RC Deportivo": "@RCDeportivo",
  "Cultural Leonesa": "@CyDLeonesa",
  "SD Huesca": "@SDHuesca",
  "CD Mirandés": "@CDMirandes",
  "Real Zaragoza": "@RealZaragoza",

  // ---------- Primera Federación ----------
  "AD Mérida": "@Merida_AD",
  "Arenas Club": "@ArenasClub",
  "Bilbao Athletic": "@AthleticClub",
  "Barakaldo CF": "@BarakaldoCF",
  "CD Coria": "@CDCoria",
  "CD Extremadura": "@CDExt1924",
  "CD Lugo": "@CDeportivoLugo",
  "CP Cacereño": "@CPCacerenoSAD",
  "Pontevedra CF": "@PontevedraCFSAD",
  "Racing Club Ferrol": "@racingferrolsad",
  "RC Deportivo Fabril": "@DeporCanteira",
  "Real Avilés Industrial": "@RealAvilesInd",
  "Real Unión Club": "@RealUnionClub",
  "SD Ponferradina": "@SDP_1922",
  "UD Logroñés": "@UDLogrones",
  "UD Ourense": "@UDOurense2014",
  "Unionistas de Salamanca CF": "@UnionistasCF",
  "Zamora CF": "@ZCFoficial",
  "AD Alcorcón": "@AD_Alcorcon",
  "Águilas FC": "@AguilasFC",
  "Algeciras CF": "@AlgecirasCF",
  "Antequera CF": "@AntequeraCF",
  "Atlético Madrileño": "@AtletiAcademia",
  "CD Teruel": "@CDTeruel",
  "CE Europa": "@CEEuropa",
  "CF Rayo Majadahonda": "@RayoMajadahonda",
  "FC Cartagena": "@FCCartagena_efs",
  "Gimnàstic de Tarragona": "@NASTICTARRAGONA",
  "Hércules CF": "@cfhercules",
  "Juventud Torremolinos CF": "@JTorremolinosCF",
  "Real Jaén CF": "@RealJaenCF",
  "Real Madrid Castilla": "@lafabricacrm",
  "Real Murcia CF": "@realmurciacfsad",
  "UD Ibiza": "@UDIbiza",
  "UE Sant Andreu": "@UESantAndreu",
  "Villarreal CF B": "@CanteraGrogueta",
  "Ourense CF": "@Ourense_CF",
  "SD Amorebieta": "@SDAmorebieta",
  "Sestao River": "@SestaoRC",
  "SD Gernika": "@GernikaClub",

  // ---------- Segunda Federación - Grupo 1 (Galicia, Asturias, Cantabria, País Vasco + Atlético Astorga) ----------
  "Bergantiños": "@BerganFC",
  "SD Eibar B": "@SDEibar",
  "Deportivo Alavés B": "@Alaves",
  "CD Basconia": "@cdbasconia",
  "Club Portugalete": "@clubportugalete",
  "Arosa SC": "@ArosaSCOficial",
  "Coruxo": "@CoruxoFCoficial",
  "SD Compostela": "@SD_Compostela",
  "Real Oviedo Vetusta": "@Cantera1926",
  "Club Marino de Luanco": "@MarinoLuanco",
  "UD Llanera": "@UDLlanera",
  "Rayo Cantabria": "@RacingCantera",
  "RS Gimnástica de Torrelavega": "@RSGimnastica",
  "Atlético Astorga": "@AtleticoAstorga",

  // ---------- Segunda Federación - Grupo 2 (La Rioja, Navarra, Aragón y Cataluña) ----------
  "FC Barcelona Atlètic": "@FCBarcelonaB",
  "Atlético Osasuna B": "@Osasuna_Tajonar",
  "UE Olot": "@UEO1921",
  "CD Ebro": "@CD_Ebro",
  "RCD Espanyol B": "@RCDE_La21",
  "CE Manresa": "@CdEManresa",
  "Girona FC B": "@GFCAcademia",
  "CD Tudelano": "@cdtudelano",
  "Terrassa": "@TerrassaFC",
  "Utebo FC": "@UteboFC",
  "Peña Sport": "@PenaSportFC",
  "UD Barbastro": "@UD_Barbastro",
  "Reus FC Reddis": "@ReusFCR",
  "UD Logroñés B": "@UDLogrones",
  "Náxara": "@Naxaracd",
  "SD Logroñés": "@SDLogrones",
  "CD Arnedo": "@CDArnedo",
  "CF Calamocha": "@cfcalamocha",

  // ---------- Segunda Federación - Grupo 3 (Comunidad Valenciana, Región de Murcia e Islas Baleares) ----------
  "CD Castellón B": "@CDCS_Academy",
  "CF La Nucía": "@cfnucia",
  "UD Castellonense": "@castellonense_",
  "CD Alcoyano": "@CD_Alcoyano",
  "CF Intercity": "@CFIntercity",
  "UCAM Murcia": "@UCAMMurciaCF",
  "CD Cieza": "@cdcieza_",
  "CD Minera": "@DeportivaMinera",
  "Yeclano Deportivo": "@Yeclano_dptvo",
  "Orihuela CF": "@Orihuela_CF",
  "CF Lorca Deportiva": "@lorcadeportiva",
  "RCD Mallorca B": "@RCDMallorcaBase",
  "CD Atlético Baleares": "@atleticbalears",
  "Valencia Mestalla": "@Academia_VCF",
  "Elche Ilicitano": "@elchecf",
  "UD Poblense": "@UDPoblense",
  "Real Murcia Imperial": "@canteragrana",
  "SCR Peña Deportiva": "@PenyaDeportiva",

  // ---------- Segunda Federación - Grupo 4 (Andalucía, Extremadura e Islas Canarias) ----------
  "Betis Deportivo": "@RBetisCantera",
  "Recreativo de Huelva": "@recreoficial",
  "CD Don Benito": "@CDDonBenito_",
  "CD Tenerife B": "@CdtCantera",
  "CD Ciudad de Lucena": "@ciudaddelucena",
  "Sevilla Atlético": "@CanteraSFC",
  "CD Badajoz": "@CDBadajoz",
  "CD Estepona": "@CDEstepona",
  "Linares Deportivo": "@Linares_Dptvo",
  "CP Mijas Las Lagunas": "@cpmlaslagunas",
  "Atlético Sanluqueño": "@atcosanluqueno",
  "Atlético Central": "@ClubAtlCentral",
  "Xerez CD": "@XerezCD_OFICIAL",
  "Marbella FC": "@marbella_fc",
  "Salerm Cosmetics Puente Genil": "@SalermPG",
  "Las Palmas Atlético": "@UDLP_Oficial",
  "UD Tamaraceite": "@UDTamaraceite",
  "Atlético Antoniano": "@CAAntoniano",

  // ---------- Segunda Federación - Grupo 5 (Castilla y León, Madrid, Castilla-La Mancha + CD Atlético Paso) ----------
  "Atlético de Madrid C": "@AtletiAcademia",
  "CD Numancia": "@cdnumancia",
  "UD San Sebastián de los Reyes": "@UDSanse",
  "UB Conquense": "@UBConquense",
  "Real Valladolid Promesas": "@realvalladolid",
  "Salamanca UDS": "@SalamancaCFUDS",
  "CF Talavera de la Reina": "@CFTalavera",
  "Gimnástica Segoviana": "@lagimnastica",
  "CDA Navalcarnero": "@CDANavalcarnero",
  "RSD Alcalá": "@rsda_oficial",
  "Real Ávila": "@RealAvilaCF",
  "CD Guadalajara": "@deporguada",
  "CD Atlético Paso": "@AtleticoPaso",
  "Atlético Albacete": "@AlbaceteBPSAD",
  "Calvo Sotelo Puertollano": "@cspuertollanocf",
  "Getafe B": "@GetafeCF",
  "Real Madrid C": "@lafabricacrm",
  "Atlético Tordesillas": "@AtcoTordesillas",

  // ---------- Primer equipo (misma cuenta que ya usa su filial más arriba) ----------
  "Athletic Club": "@AthleticClub",
  "Deportivo Alavés": "@Alaves",
  "Getafe CF": "@GetafeCF",
  "Elche CF": "@elchecf",
};

// Si es true, además de los clubes de la noticia se mencionan los demás
// clubes de la lista que aparezcan en el titular. Ponlo en false para que
// solo se sustituyan los clubes de la propia noticia.
const MENCIONAR_CLUBES_DEL_TITULAR = true;

// Valores del campo "club" de una noticia que NO son un club (Arbitraje y
// Jurisdicción ofrecen "Competición completa"). No tienen cuenta de X que
// buscar, así que no deben salir nunca en el aviso de "sin cuenta".
const NOMBRES_QUE_NO_SON_CLUB = new Set([
  "general", "laliga hypermotion", "laliga 2", "hypermotion",
  "primera federacion", "primera rfef", "segunda federacion", "segunda rfef",
  "copa del rey", "amistoso", "amistosos", "competicion completa",
]);

// Cómo se llama a veces un club en un titular sin que se parezca a su nombre
// oficial. Clave = nombre oficial (el de CLUB_CUENTA_X).
// ALIAS_CLUB_X: alias seguros, valen aunque el club no sea de la noticia.
const ALIAS_CLUB_X = {
  "RC Deportivo": ["Dépor", "Deportivo de La Coruña", "Deportivo de A Coruña"],
  "Gimnàstic de Tarragona": ["Nàstic", "Gimnàstic", "Gimnástic de Tarragona"],
  "Albacete Balompié": ["Albacete"],
  "Unionistas de Salamanca CF": ["Unionistas"],
  "Real Oviedo Vetusta": ["Vetusta"],
  "Deportivo Alavés": ["Alavés"],
  "Deportivo Alavés B": ["Alavés B"],
};
// ALIAS_CLUB_X_SOLO_CONTEXTO: alias demasiado genéricos ("Deportivo", "Racing"):
// solo se sustituyen si ese club es uno de los de la noticia.
const ALIAS_CLUB_X_SOLO_CONTEXTO = {
  "RC Deportivo": ["Deportivo"],
  "RC Deportivo Fabril": ["Fabril"],
  "Racing de Santander": ["Racing", "Racing Santander"],
  "Racing Club Ferrol": ["Racing de Ferrol", "Racing Ferrol"],
  "Cultural Leonesa": ["Leonesa"],
};

// Siglas que no forman parte del nombre "hablado" del club.
const SIGLAS_CLUB = new Set(["ad", "cd", "ud", "fc", "cf", "sd", "ce", "rcd", "rc", "cp", "sad", "sc", "ca", "cda", "ue", "ue.", "up"]);
// Palabras sueltas demasiado genéricas para sustituirlas dentro de un texto.
const PALABRAS_GENERICAS_CLUB = new Set(["real", "club", "deportivo", "atletico", "racing", "union", "sociedad", "balompie", "futbol", "ciudad"]);

function _sinAcentosClub(texto) {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Clave para comparar nombres: sin acentos, en minúsculas y con los
// espacios (también los de no separación) colapsados.
function _claveClub(texto) {
  return _sinAcentosClub(texto).toLowerCase().replace(/\s+/g, " ").trim();
}

// Igual que _sinAcentosClub pero carácter a carácter, para que el texto sin
// acentos tenga SIEMPRE el mismo largo que el original (las posiciones de las
// coincidencias se usan para cortar el texto original).
function _planoClub(texto) {
  return Array.from(texto).map((ch) => {
    const f = _sinAcentosClub(ch);
    return f.length === ch.length ? f : ch;
  }).join("");
}

function esNombreDeClub(nombre) {
  const clave = _claveClub(nombre);
  return !!clave && !NOMBRES_QUE_NO_SON_CLUB.has(clave);
}

// Nombre sin siglas al principio ni al final: "CD Castellón" -> "Castellón",
// "Girona FC" -> "Girona", "Real Oviedo" -> "Real Oviedo".
function nombreCortoClub(nombre) {
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  while (partes.length > 1 && SIGLAS_CLUB.has(_claveClub(partes[0]))) partes.shift();
  while (partes.length > 1 && SIGLAS_CLUB.has(_claveClub(partes[partes.length - 1]))) partes.pop();
  return partes.join(" ");
}

// Sin ninguna sigla, también las del medio: "Girona FC B" -> "Girona B".
function _nombreSinSiglasClub(nombre) {
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  const resto = partes.filter((p) => !SIGLAS_CLUB.has(_claveClub(p)));
  return (resto.length ? resto : partes).join(" ");
}

// "#RealOviedo", "#Castellon", "#BilbaoAthletic"... Sin acentos, ñ ni
// símbolos para que X e Instagram lo reconozcan siempre entero.
function hashtagDeClub(nombre) {
  const base = _sinAcentosClub(nombreCortoClub(nombre))
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  return base ? `#${base}` : "";
}

// Formas con las que un club puede aparecer escrito en un titular.
function _variantesNombreClub(nombre) {
  const completo = String(nombre || "").trim();
  const corto = nombreCortoClub(completo);
  const sinSiglas = _nombreSinSiglasClub(completo);
  const sinReal = (v) => v.replace(/^real\s+/i, "");
  const out = [];
  [completo, corto, sinReal(corto), sinSiglas, sinReal(sinSiglas)].forEach((v) => {
    const clave = _claveClub(v);
    if (v.length < 4 || out.some((o) => _claveClub(o) === clave)) return;
    if (!/\s/.test(v) && PALABRAS_GENERICAS_CLUB.has(clave)) return;
    out.push(v);
  });
  return out.sort((a, b) => b.length - a.length);
}

function _escaparRegexClub(t) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function _formatearCuentaX(c) {
  return c ? (c.startsWith("@") ? c : `@${c}`) : null;
}

// Índice para encontrar la cuenta aunque el nombre guardado en la noticia
// no sea EXACTAMENTE el oficial ("CD Castellon", "castellón", "Oviedo"...):
//   exacto     -> nombre sin acentos/mayúsculas -> nombre oficial
//   aproximado -> variante del nombre ("Oviedo")  -> nombre oficial, o null
//                 si esa variante sirve para dos cuentas distintas
let _indiceClubesX = null;
function _indiceClubes() {
  const claves = Object.keys(CLUB_CUENTA_X);
  if (_indiceClubesX && _indiceClubesX.n === claves.length) return _indiceClubesX;
  const exacto = new Map();
  const aproximado = new Map();
  claves.forEach((k) => {
    exacto.set(_claveClub(k), k);
    _variantesNombreClub(k).forEach((v) => {
      const c = _claveClub(v);
      const previo = aproximado.get(c);
      if (previo === undefined) aproximado.set(c, k);
      else if (previo !== null && _formatearCuentaX(CLUB_CUENTA_X[previo]) !== _formatearCuentaX(CLUB_CUENTA_X[k])) aproximado.set(c, null);
    });
  });
  _indiceClubesX = { n: claves.length, exacto, aproximado };
  return _indiceClubesX;
}

// Nombre oficial (clave de CLUB_CUENTA_X) de un club, o null si no está.
function resolverClubX(nombre) {
  const c = _claveClub(nombre);
  if (!c) return null;
  const idx = _indiceClubes();
  if (idx.exacto.has(c)) return idx.exacto.get(c);
  return idx.aproximado.get(c) || null;
}

function cuentaXDeClub(nombre) {
  const oficial = resolverClubX(nombre);
  return oficial ? _formatearCuentaX(CLUB_CUENTA_X[oficial]) : null;
}

// Nombres de clubs.js (y clubes personalizados ya cargados) que no tienen
// cuenta en CLUB_CUENTA_X. Solo sirven para "protegerlos" al sustituir.
function _nombresClubesSinCuenta() {
  const todos = new Set();
  const anadir = (lista) => (lista || []).forEach((n) => { if (typeof n === "string" && n.trim()) todos.add(n.trim()); });
  try {
    if (typeof CLUBS_BY_CATEGORY !== "undefined") Object.values(CLUBS_BY_CATEGORY).forEach(anadir);
    if (typeof TODOS_LOS_CLUBES_SEGUNDA_FEDERACION_PLANO !== "undefined") anadir(TODOS_LOS_CLUBES_SEGUNDA_FEDERACION_PLANO);
    if (typeof CLUBS_COPA_DEL_REY !== "undefined") anadir(CLUBS_COPA_DEL_REY);
    if (typeof CUSTOM_CLUBS_BY_CATEGORY !== "undefined") {
      Object.values(CUSTOM_CLUBS_BY_CATEGORY).forEach((l) => anadir((l || []).map((c) => c && c.nombre)));
    }
  } catch (e) { /* sin clubs.js solo se pierde la protección */ }
  return [...todos].filter((n) => !resolverClubX(n));
}

// Cambia, en "texto", el nombre de cada club por su @cuenta (ver arriba cómo
// se decide qué se sustituye). Insensible a mayúsculas y acentos, solo
// palabras completas y, ante varias opciones, gana siempre la más larga.
// Devuelve:
//   texto       -> el texto ya con las menciones
//   sinCuenta   -> clubes de la noticia que no tienen cuenta registrada (no
//                  incluye "General" ni competiciones, que no son clubes)
//   noAparecen  -> [{ club, cuenta }] clubes de la noticia con cuenta cuyo
//                  nombre no aparece en el texto (no hay nada que sustituir)
//   mencionados -> cuentas que se han puesto en el texto
//   extras      -> cuentas puestas que NO son de los clubes de la noticia
function mencionarClubesEnTexto(texto, clubes) {
  const original = String(texto || "").normalize("NFC");
  const sinCuenta = [];
  const delArticulo = [];
  const vistos = new Set();
  (clubes || []).forEach((nombre) => {
    const n = String(nombre || "").trim();
    const clave = _claveClub(n);
    if (!clave || vistos.has(clave) || !esNombreDeClub(n)) return;
    vistos.add(clave);
    const oficial = resolverClubX(n);
    const cuenta = oficial ? _formatearCuentaX(CLUB_CUENTA_X[oficial]) : null;
    if (!cuenta) { sinCuenta.push(n); return; }
    delArticulo.push({ nombre: n, oficial, cuenta });
  });

  // variante (sin acentos, minúsculas) -> { cuenta, prioridad }. Prioridad:
  // 3 = club de la noticia, 2 = otro club con cuenta, 1 = club sin cuenta
  // (solo protegido). Con la misma prioridad y dos cuentas distintas la
  // variante es ambigua y no se toca.
  const mapa = new Map();
  const poner = (variante, cuenta, prioridad) => {
    const clave = _claveClub(variante);
    if (clave.length < 4) return;
    const previo = mapa.get(clave);
    if (!previo || prioridad > previo.prioridad) mapa.set(clave, { cuenta, prioridad });
    else if (prioridad === previo.prioridad && previo.cuenta !== cuenta) previo.cuenta = null;
  };

  delArticulo.forEach(({ oficial, cuenta }) => {
    _variantesNombreClub(oficial).forEach((v) => poner(v, cuenta, 3));
    (ALIAS_CLUB_X[oficial] || []).forEach((v) => poner(v, cuenta, 3));
    (ALIAS_CLUB_X_SOLO_CONTEXTO[oficial] || []).forEach((v) => poner(v, cuenta, 3));
  });
  if (MENCIONAR_CLUBES_DEL_TITULAR) {
    const oficialesArticulo = new Set(delArticulo.map((c) => c.oficial));
    Object.keys(CLUB_CUENTA_X).forEach((k) => {
      const cuenta = oficialesArticulo.has(k) ? null : _formatearCuentaX(CLUB_CUENTA_X[k]);
      if (!cuenta) return;
      _variantesNombreClub(k).forEach((v) => poner(v, cuenta, 2));
      (ALIAS_CLUB_X[k] || []).forEach((v) => poner(v, cuenta, 2));
    });
    _nombresClubesSinCuenta().forEach((n) => _variantesNombreClub(n).forEach((v) => poner(v, null, 1)));
  }

  const mencionadas = new Set();
  let salida = original;
  if (mapa.size && original) {
    const claves = [...mapa.keys()].sort((a, b) => b.length - a.length);
    const alternativas = claves.map((k) => _escaparRegexClub(k).replace(/ /g, "\\s+")).join("|");
    const patron = new RegExp(`(^|[^\\p{L}\\p{N}@#_])(${alternativas})(?![\\p{L}\\p{N}_])`, "giu");
    const plano = _planoClub(original);
    let parcial = "";
    let ultimo = 0;
    let m;
    while ((m = patron.exec(plano)) !== null) {
      const ini = m.index + m[1].length;
      const dato = mapa.get(_claveClub(m[2]));
      // Club sin cuenta o variante ambigua: se reconoce (para que no se
      // rompa por dentro) pero se deja el nombre tal cual.
      if (!dato || !dato.cuenta) continue;
      parcial += original.slice(ultimo, ini) + dato.cuenta;
      ultimo = ini + m[2].length;
      mencionadas.add(dato.cuenta);
    }
    salida = parcial + original.slice(ultimo);
  }

  const cuentasArticulo = new Set(delArticulo.map((c) => c.cuenta));
  return {
    texto: salida,
    sinCuenta,
    noAparecen: delArticulo.filter((c) => !mencionadas.has(c.cuenta)).map((c) => ({ club: c.nombre, cuenta: c.cuenta })),
    mencionados: [...mencionadas],
    extras: [...mencionadas].filter((c) => !cuentasArticulo.has(c)),
  };
}
