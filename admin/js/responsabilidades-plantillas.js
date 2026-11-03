// ---------- Funcionalidades > Responsabilidades > Relaciones institucionales ----------
// Plantillas de comunicaciones institucionales: modelos de correo para cada
// situación con los clubes (primer contacto, acreditaciones, entrevistas,
// material, seguimiento, correcciones…). Se rellenan los datos del caso, se
// revisa el texto resultante y se copia (o se abre en el programa de correo).
//
// No usa servidor: el catálogo está en este archivo. Solo se recuerdan en el
// navegador "tu nombre" y "tu cargo" (localStorage) para no reescribirlos.
//
// Sintaxis de las plantillas:
//   {{campo}}   se sustituye por lo que se haya escrito; si está vacío queda
//               marcado como [CAMPO] para que no se envíe sin rellenar.
//   {{campo?}}  opcional: si está vacío se elimina la línea entera.
//   {{saludo}} y {{firma}} se generan solos (la firma incluye la despedida).
//
// Las plantillas de acreditación (prensa, fotografía y temporada) NO tienen texto
// propio: se redactan con los mismos textos de Formularios > Acreditaciones
// (ACRED_CORREO_TXT y acredConstruirCorreoClubGrupo, en admin.js): mismo saludo,
// mismo bloque de datos, mismo compromiso y misma firma, y en el idioma propio del
// club (castellano, catalán, euskera o gallego). Si admin.js no los ofreciera, se
// usa el texto de respaldo de cada plantilla.
//
// Depende de: window.EOFResponsabilidades.listaClubes (opcional, para sugerir
// clubes) y window.EOF.toast (opcional).
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const toast = (msg, tipo, ms) => { try { window.EOF.toast(msg, tipo || "info", ms || 3000); } catch { /* sin toast */ } };

  const MEDIO = { nombre: "El Otro Fútbol", web: "elotrofutbol.media", correo: "contacto@elotrofutbol.media" };
  const CLAVE_LS = "eof_resp_plantillas_v1";
  const INI = "\u0001", FIN = "\u0002"; // delimitan los campos sin rellenar dentro del texto

  // ---------- Campos reutilizables ----------
  // Todas las plantillas comparten los valores: si cambias de plantilla,
  // el club y la persona destinataria se mantienen.
  const CAMPOS = {
    club: { etq: "Club", ph: "p. ej. CD Castellón", tipo: "club" },
    destinatario: { etq: "Persona destinataria", ph: "p. ej. Marta López", opc: true },
    partido: { etq: "Partido", ph: "p. ej. CD Castellón – UD Ibiza (Primera Federación)" },
    fecha: { etq: "Fecha y hora", ph: "p. ej. el domingo 26 de octubre a las 17:00" },
    asignado: { etq: "Persona de El Otro Fútbol", ph: "Nombre y apellidos" },
    rol: { etq: "Puesto", tipo: "select", opciones: ["redactor", "fotógrafo"] },
    persona: { etq: "Persona a entrevistar", ph: "p. ej. el entrenador, Juan Pérez" },
    tema: { etq: "Tema", ph: "", tipo: "area" },
    material: { etq: "Material solicitado", tipo: "area", ph: "p. ej. plantilla actualizada con dorsales, escudo en alta resolución, calendario de la temporada" },
    dato: { etq: "Dato", tipo: "area", ph: "" },
    enlace: { etq: "Enlace a la publicación", ph: "https://elotrofutbol.media/…", opc: true },
    correo: { etq: "Correo de la persona", ph: "p. ej. marta@correo.com", opc: true },
    dni: { etq: "DNI", ph: "", opc: true },
    funciones: { etq: "Función en el partido", ph: "p. ej. Cobertura informativa del partido", opc: true },
    plazo: { etq: "Fechas o plazo", ph: "p. ej. esta semana, antes del viernes", opc: true },
  };
  // Para ajustar la etiqueta/ayuda de un campo en una plantilla concreta: [id, { …cambios }]

  const CATEGORIAS = [
    { id: "contacto", nombre: "Primer contacto", color: "#2d6cdf" },
    { id: "partidos", nombre: "Partidos y acreditaciones", color: "#13a76a" },
    { id: "contenido", nombre: "Contenido y colaboración", color: "#7a3fe0" },
    { id: "seguimiento", nombre: "Seguimiento", color: "#f07a1a" },
    { id: "correcciones", nombre: "Correcciones", color: "#dc2626" },
  ];

  // ---------- Catálogo ----------
  const PLANTILLAS = [
    // ===== Primer contacto =====
    {
      id: "presentacion", cat: "contacto",
      titulo: "Presentación del medio",
      para: "Primer mensaje a un club con el que aún no habéis tenido relación.",
      campos: ["club", "destinatario"],
      asunto: "Presentación de El Otro Fútbol · {{club}}",
      cuerpo: `{{saludo}}

Me pongo en contacto con vosotros en nombre de El Otro Fútbol, un medio digital que cubre el fútbol de LaLiga Hypermotion, Primera, Segunda y Tercera Federación. Nos gustaría seguir de cerca la actualidad del {{club}} y dar a su afición la cobertura que merece.

Querríamos abrir un canal de comunicación estable con el club para:
- Recibir convocatorias, alineaciones, comunicados y noticias oficiales.
- Coordinar acreditaciones para nuestros redactores y fotógrafos.
- Contrastar con el club los datos antes de publicarlos.

¿Podríais indicarnos la persona de contacto del departamento de comunicación o prensa? Estaremos encantados de presentarnos con más detalle o de concertar una breve llamada cuando os venga bien.

Gracias de antemano por vuestro tiempo.

{{firma}}`,
    },
    {
      id: "contacto_prensa", cat: "contacto",
      titulo: "Pedir la persona de contacto de prensa",
      para: "No sabes a quién escribir en el club: pide el contacto del responsable de comunicación.",
      campos: ["club", "destinatario"],
      asunto: "¿Con quién contactar en prensa y comunicación? · {{club}}",
      cuerpo: `{{saludo}}

Os escribo desde El Otro Fútbol, un medio digital que informa sobre el fútbol de LaLiga Hypermotion y de las federaciones. Queremos seguir la actualidad del {{club}} y no sabemos cuál es el contacto adecuado para temas de prensa y acreditaciones.

¿Podríais facilitarnos el nombre, el correo y, si es posible, el teléfono de la persona responsable de comunicación o prensa del club?

Muchas gracias por vuestra ayuda.

{{firma}}`,
    },
    {
      id: "asignado", cat: "contacto",
      titulo: "Presentar a la persona asignada al club",
      para: "Cuando un redactor o fotógrafo pasa a cubrir un club: lo presentas como su interlocutor.",
      campos: ["club", "destinatario", "rol", ["asignado", { etq: "Nombre de la persona asignada" }]],
      asunto: "{{asignado}}, nuestra persona de contacto para el {{club}}",
      cuerpo: `{{saludo}}

Os escribo para presentaros a {{asignado}}, que se encargará de seguir al {{club}} como {{rol}} de El Otro Fútbol.

A partir de ahora será vuestra persona de referencia en el medio para acreditaciones, solicitudes de material, entrevistas y cualquier duda sobre nuestras publicaciones. También podéis escribirnos a ${MEDIO.correo} y nos aseguraremos de que el mensaje le llegue.

Agradeceremos que le prestéis vuestra colaboración en el día a día. Por nuestra parte, nos comprometemos a trabajar con rigor y respeto hacia el club.

Gracias por vuestra atención.

{{firma}}`,
    },

    // ===== Partidos y acreditaciones =====
    {
      id: "acred_redactor", cat: "partidos",
      titulo: "Acreditación de prensa para un partido",
      acred: { tipo: "Prensa / Pupitre" },
      para: "Solicitar acreditación de redactor para cubrir un partido concreto. Mismo texto que el correo al club de Formularios > Acreditaciones (en el idioma del club).",
      campos: ["club", "partido", "fecha", ["asignado", { etq: "Redactor/a que acudirá" }], "correo", "dni", "funciones"],
      asunto: "Solicitud de acreditación de prensa · {{partido}}",
      cuerpo: `{{saludo}}

Desde El Otro Fútbol os solicitamos acreditación de prensa para cubrir el partido {{partido}}, que se disputará {{fecha}}.

La persona acreditada sería {{asignado}}, redactor/a de nuestro medio.

Si necesitáis algún dato adicional (DNI, carta de encargo del medio o cualquier otro documento), os lo enviamos enseguida. Os agradeceríamos también que nos indicarais a qué hora conviene llegar, por dónde se accede a la zona de prensa y si habrá sala de prensa o zona mixta para las declaraciones.

Quedamos pendientes de vuestra confirmación. Muchas gracias.

{{firma}}`,
    },
    {
      id: "acred_fotografo", cat: "partidos",
      titulo: "Acreditación de fotografía para un partido",
      acred: { tipo: "Fotografía / Césped" },
      para: "Solicitar acreditación de fotógrafo/a para un partido concreto. Mismo texto que el correo al club de Formularios > Acreditaciones (en el idioma del club).",
      campos: ["club", "partido", "fecha", ["asignado", { etq: "Fotógrafo/a que acudirá" }], "correo", "dni", "funciones"],
      asunto: "Solicitud de acreditación de fotografía · {{partido}}",
      cuerpo: `{{saludo}}

Desde El Otro Fútbol os solicitamos acreditación de fotografía para el partido {{partido}}, que se disputará {{fecha}}.

La persona acreditada sería {{asignado}}, fotógrafo/a de nuestro medio.

Para organizarnos correctamente, ¿podríais indicarnos…?
- Si hay zonas habilitadas para fotógrafos (banda, tribuna u otras) y a qué hora se puede acceder.
- Si es obligatorio llevar peto o identificación específica y quién nos la facilita.
- Si existe alguna norma del club o de la competición sobre el material o el uso de las imágenes.

Las fotografías se utilizarán exclusivamente para la cobertura informativa en nuestra web y redes sociales, con el crédito correspondiente. Si os resulta de interés, podemos compartir una selección con el club.

Quedamos pendientes de vuestra confirmación. Muchas gracias.

{{firma}}`,
    },
    {
      id: "acred_temporada", cat: "partidos", acred: { temporada: true },
      titulo: "Acreditación para toda la temporada",
      para: "Pedir una acreditación fija para seguir al club durante toda la temporada.",
      campos: ["club", "destinatario", ["asignado", { etq: "Persona(s) a acreditar", tipo: "area", ph: "Nombre y puesto de cada una (redactor, fotógrafo…)" }]],
      asunto: "Solicitud de acreditación de temporada · {{club}}",
      cuerpo: `{{saludo}}

Desde El Otro Fútbol queremos seguir de forma regular los partidos del {{club}} esta temporada, por lo que os solicitamos una acreditación de temporada para:

{{asignado}}

Nos adaptaremos al procedimiento que tengáis: formulario, carta del medio, documentación personal, etc. Si preferís gestionarlo partido a partido, también podemos solicitar la acreditación con la antelación que establezcáis.

Nos comprometemos a respetar las normas de acceso y de uso de las instalaciones y a informar con rigor.

Quedamos a la espera de vuestras indicaciones. Muchas gracias.

{{firma}}`,
    },
    {
      id: "datos_partido", cat: "partidos",
      titulo: "Pedir información previa de un partido",
      para: "Antes de una jornada: convocatoria, bajas, rueda de prensa y otros datos para la previa.",
      campos: ["club", "destinatario", "partido", "fecha"],
      asunto: "Información previa · {{partido}}",
      cuerpo: `{{saludo}}

Estamos preparando la previa del partido {{partido}} ({{fecha}}) y nos gustaría contrastar con vosotros algunos datos. ¿Podríais facilitarnos, cuando los tengáis disponibles?
- La convocatoria y las bajas (lesiones o sanciones).
- El horario y el lugar de la rueda de prensa previa, si la hay.
- Cualquier información de interés para la afición: accesos, entradas, retransmisión, actos u homenajes.

Y, una vez terminado el encuentro, las alineaciones oficiales si podéis compartirlas.

Muchas gracias por vuestra colaboración.

{{firma}}`,
    },

    // ===== Contenido y colaboración =====
    {
      id: "entrevista", cat: "contenido",
      titulo: "Solicitud de entrevista",
      para: "Pedir una entrevista a un jugador, entrenador, directivo u otra persona del club.",
      campos: ["club", "destinatario", "persona", ["tema", { etq: "Tema o motivo", ph: "p. ej. el inicio de temporada y los objetivos del equipo" }], "plazo"],
      asunto: "Solicitud de entrevista con {{persona}} · El Otro Fútbol",
      cuerpo: `{{saludo}}

Desde El Otro Fútbol nos gustaría entrevistar a {{persona}} ({{club}}) sobre {{tema}}.

La entrevista duraría unos 15-20 minutos y podría hacerse en el formato que mejor os encaje: presencial, por videollamada, por teléfono o por escrito. Si lo preferís, os enviamos las preguntas con antelación y podemos confirmar con vosotros las citas y los datos antes de publicar.

{{plazo?}}

Quedamos a vuestra disposición para ajustar los detalles. Muchas gracias.

{{firma}}`,
      sustituciones: { "{{plazo?}}": "Por nuestra parte, podríamos ajustarnos a estas fechas: {{plazo?}}." },
    },
    {
      id: "material", cat: "contenido",
      titulo: "Solicitud de material al club",
      para: "Pedir plantilla, escudos, fotos oficiales, calendario u otros datos para vuestras fichas.",
      campos: ["club", "destinatario", "material", "plazo"],
      asunto: "Solicitud de material · {{club}}",
      cuerpo: `{{saludo}}

Para mantener al día nuestra información sobre el {{club}}, ¿podríais facilitarnos lo siguiente?

{{material}}

{{plazo?}}

Lo utilizaremos únicamente con fines informativos y citando siempre la fuente. Si el material tiene condiciones de uso (créditos, restricciones de imagen, etc.), indicádnoslas y las respetaremos.

Muchas gracias por vuestra ayuda.

{{firma}}`,
      sustituciones: { "{{plazo?}}": "Nos vendría bien recibirlo para: {{plazo?}}." },
    },
    {
      id: "colaboracion", cat: "contenido",
      titulo: "Propuesta de colaboración",
      para: "Proponer al club una colaboración estable (intercambio de contenidos, difusión, acceso…).",
      campos: ["club", "destinatario", ["tema", { etq: "Qué propones", ph: "p. ej. intercambio de contenidos y difusión cruzada en redes sociales" }]],
      asunto: "Propuesta de colaboración entre El Otro Fútbol y {{club}}",
      cuerpo: `{{saludo}}

Desde El Otro Fútbol nos gustaría proponeros una colaboración con el {{club}}: {{tema}}.

Creemos que puede beneficiar a ambas partes: el club gana visibilidad en un medio que sigue de cerca su competición y nosotros accedemos a información de primera mano para ofrecer a la afición contenido más completo y fiable, siempre manteniendo la independencia editorial de cada parte.

Si os parece interesante, podemos concretar los detalles en una llamada o por correo, adaptándonos a vuestra disponibilidad.

Gracias por considerarlo.

{{firma}}`,
    },
    {
      id: "declinar_comercial", cat: "contenido",
      titulo: "Declinar contenido promocional",
      para: "Respuesta amable cuando un club o entidad pide publicar algo que es publicidad, no noticia.",
      campos: ["destinatario", ["tema", { etq: "Propuesta recibida", ph: "p. ej. la publicación del patrocinio con la marca X" }]],
      asunto: "Re: {{tema}}",
      cuerpo: `{{saludo}}

Muchas gracias por pensar en El Otro Fútbol para {{tema}}.

Por política editorial separamos el contenido informativo del promocional, así que no podemos publicarlo como noticia tal cual. Si hay un componente informativo de interés para la afición (un anuncio del club, un evento, un resultado), lo valoraremos con criterio periodístico y con nuestro propio enfoque. Y si lo que os interesa es una acción comercial o publicitaria, podemos hablarlo por separado.

Agradecemos de nuevo vuestra confianza.

{{firma}}`,
    },

    // ===== Seguimiento =====
    {
      id: "recordatorio", cat: "seguimiento",
      titulo: "Recordatorio amable (sin respuesta)",
      para: "Retomar un mensaje que el club no ha contestado, sin presionar.",
      campos: ["club", "destinatario", ["tema", { etq: "Asunto del mensaje anterior", ph: "p. ej. nuestra solicitud de acreditación para el partido X" }]],
      asunto: "Re: {{tema}}",
      cuerpo: `{{saludo}}

Os escribo para retomar nuestro mensaje anterior sobre {{tema}}. Sabemos que son días de mucho trabajo en el club y no queremos insistir más de la cuenta, pero nos ayudaría mucho tener vuestra respuesta para poder organizarnos.

Si os resulta más cómodo, podemos tratarlo por teléfono o con otra persona del club. Y si no es posible, no hay problema: solo necesitamos saberlo para buscar otra solución.

Gracias de antemano.

{{firma}}`,
    },
    {
      id: "agradecimiento", cat: "seguimiento",
      titulo: "Agradecimiento tras una colaboración",
      para: "Dar las gracias después de una entrevista, una acreditación o un material recibido.",
      campos: ["club", "destinatario", ["tema", { etq: "Qué agradeces", ph: "p. ej. la entrevista con Juan Pérez" }], "enlace"],
      asunto: "Gracias · {{club}}",
      cuerpo: `{{saludo}}

Os escribo para daros las gracias por {{tema}}. Para nosotros es un placer trabajar con el {{club}}, y vuestra ayuda facilita mucho que podamos informar a la afición con rigor.

{{enlace?}}

Quedamos a vuestra disposición para lo que necesitéis y esperamos seguir colaborando.

{{firma}}`,
      sustituciones: { "{{enlace?}}": "Podéis ver el resultado publicado aquí: {{enlace?}}" },
    },

    // ===== Correcciones =====
    {
      id: "correccion_ok", cat: "correcciones",
      titulo: "Aceptar una corrección pedida por el club",
      para: "El club señala un error y tenéis razón: se corrige y se le comunica.",
      campos: ["club", "destinatario", ["dato", { etq: "Qué se ha corregido", ph: "p. ej. el apellido del entrenador figuraba mal escrito" }], "enlace"],
      asunto: "Re: corrección solicitada · {{club}}",
      cuerpo: `{{saludo}}

Gracias por avisarnos. Hemos revisado la información y, efectivamente, había un error en lo publicado: {{dato}}.

Ya lo hemos corregido y hemos dejado constancia en la propia publicación.

{{enlace?}}

Os agradecemos vuestra atención y os animamos a avisarnos siempre que detectéis cualquier imprecisión.

{{firma}}`,
      sustituciones: { "{{enlace?}}": "Podéis verlo aquí: {{enlace?}}" },
    },
    {
      id: "correccion_no", cat: "correcciones",
      titulo: "Mantener lo publicado (no procede corregir)",
      para: "El club pide una corrección pero, tras revisarlo, lo publicado es correcto.",
      campos: ["club", "destinatario", ["dato", { etq: "Lo que cuestiona el club", ph: "" }], ["tema", { etq: "Fuente o motivo por el que se mantiene", ph: "p. ej. el acta oficial del partido" }]],
      asunto: "Re: solicitud de corrección · {{club}}",
      cuerpo: `{{saludo}}

Gracias por escribirnos y por señalarnos vuestra observación sobre {{dato}}.

Hemos revisado la información con detalle y, por el momento, mantenemos lo publicado porque se basa en {{tema}}.

No obstante, queremos que vuestra versión esté presente. Si disponéis de documentación o de un comunicado oficial que indique lo contrario, lo estudiaremos de inmediato y, si procede, actualizaremos la noticia. También podemos incluir una declaración del club si nos la hacéis llegar.

Agradecemos vuestra comprensión y seguimos a vuestra disposición.

{{firma}}`,
    },
    {
      id: "error_propio", cat: "correcciones",
      titulo: "Disculpas por un error publicado",
      para: "Os habéis equivocado en una publicación sobre el club: se avisa, se corrige y se piden disculpas.",
      campos: ["club", "destinatario", ["dato", { etq: "Error cometido", ph: "p. ej. atribuimos el gol a otro jugador" }], "enlace"],
      asunto: "Disculpas y corrección · {{club}}",
      cuerpo: `{{saludo}}

Os escribo para informaros de que en una de nuestras publicaciones sobre el {{club}} cometimos un error: {{dato}}.

Lamentamos la confusión. Ya lo hemos corregido y hemos dejado constancia en la propia publicación.

{{enlace?}}

Si detectáis cualquier otra imprecisión, no dudéis en escribirnos y la corregiremos lo antes posible.

Gracias por vuestra comprensión.

{{firma}}`,
      sustituciones: { "{{enlace?}}": "Podéis verlo aquí: {{enlace?}}" },
    },
  ];

  // ---------- Estado ----------
  const valores = {};          // campo -> texto (compartido entre plantillas)
  let activa = PLANTILLAS[0].id;
  let montado = false;
  let raiz = null;

  function leerPersistidos() {
    try {
      const d = JSON.parse(localStorage.getItem(CLAVE_LS) || "{}");
      if (typeof d.remitente === "string") valores.remitente = d.remitente.slice(0, 80);
      if (typeof d.cargo === "string") valores.cargo = d.cargo.slice(0, 80);
    } catch { /* sin almacenamiento */ }
  }
  function guardarPersistidos() {
    try {
      localStorage.setItem(CLAVE_LS, JSON.stringify({ remitente: valores.remitente || "", cargo: valores.cargo || "" }));
    } catch { /* sin almacenamiento */ }
  }

  const plantillaActiva = () => PLANTILLAS.find((p) => p.id === activa) || PLANTILLAS[0];
  function defCampo(c) {
    const id = Array.isArray(c) ? c[0] : c;
    return { id, ...(CAMPOS[id] || { etq: id }), ...(Array.isArray(c) ? c[1] : {}) };
  }

  // ---------- Acreditaciones: textos de Formularios > Acreditaciones ----------
  function acredDisponible() {
    try {
      return typeof ACRED_CORREO_TXT !== "undefined" && typeof acredConstruirCorreoClubGrupo === "function" &&
        typeof acredIdiomaCorreo === "function" && typeof acredParsearPartido === "function";
    } catch { return false; }
  }

  function generarAcreditacion(p, val, falta) {
    const club = val("club") || falta("Club");
    const persona = val("asignado") || falta(p.acred.temporada ? "Persona(s) a acreditar" : "Persona que acudirá");
    const yo = val("remitente") || (typeof acredMiNombre === "function" ? acredMiNombre() : "") || falta("Tu nombre");
    const firmaCon = (T) => [T.atentamente, yo, T.acreditaciones, MEDIO.nombre].join("\n");
    let texto;
    if (p.acred.temporada) {
      const T = ACRED_CORREO_TXT.es; // la solicitud de temporada solo existe en castellano
      texto = [
        T.saludo(club),
        `Desde ${MEDIO.nombre} queremos seguir de forma regular los partidos del ${club} esta temporada, por lo que les solicitamos una acreditación de temporada para:`,
        persona,
        "Nos adaptaremos al procedimiento que tengan: formulario, carta del medio, documentación personal, etc. Si prefieren gestionarlo partido a partido, también podemos solicitar la acreditación con la antelación que establezcan.",
        T.compromiso,
        T.gracias(1),
        firmaCon(T),
      ].join("\n\n");
    } else {
      const partido = val("partido") || falta("Partido");
      const a = {
        nombre: persona, email: val("correo"), dni: val("dni"), equipo: club,
        funciones: val("funciones"), tipo_acreditacion: p.acred.tipo, jornada_partido: partido,
      };
      const idioma = acredIdiomaCorreo(club);
      texto = acredConstruirCorreoClubGrupo([a], idioma);
      // La fecha, junto a la frase de solicitud, y fuera las filas de datos sin rellenar.
      const fecha = val("fecha");
      if (fecha) texto = texto.replace(/\.(\n\n)/, ` (${fecha}).$1`);
      texto = texto.split("\n").filter((l) => !/^\s*●[^:\n]*:\s*$/.test(l)).join("\n");
      // La firma de Formularios usa el nombre de quien tiene la sesión; aquí manda el campo "Tu firma".
      const T = ACRED_CORREO_TXT[idioma];
      const viejaFirma = [T.atentamente, (typeof acredMiNombre === "function" ? acredMiNombre() : ""), T.acreditaciones, MEDIO.nombre].filter(Boolean).join("\n");
      if (texto.endsWith(viejaFirma)) texto = texto.slice(0, -viejaFirma.length) + firmaCon(T);
    }
    return texto.replace(/\n{3,}/g, "\n\n").trim();
  }

  // ---------- Generación del texto ----------
  function generar(p) {
    const faltan = new Set();
    const falta = (etq) => { faltan.add(etq); return INI + etq.toUpperCase() + FIN; };
    const val = (id) => String(valores[id] || "").trim();
    const etqDe = (id) => defCampo((p.campos.find((c) => (Array.isArray(c) ? c[0] : c) === id)) || id).etq;

    const saludo = () => (val("destinatario") ? `Buenos días, ${val("destinatario")}:` : "Buenos días:");
    const firma = () => {
      const cargo = val("cargo");
      return [
        "Un cordial saludo,",
        val("remitente") || falta("Tu nombre"),
        cargo ? `${cargo} · ${MEDIO.nombre}` : MEDIO.nombre,
        `${MEDIO.web} · ${MEDIO.correo}`,
      ].join("\n");
    };

    const sustituir = (texto) => {
      const salida = [];
      for (const linea of texto.split("\n")) {
        let descartar = false;
        const r = linea.replace(/\{\{(\w+)(\?)?\}\}/g, (m, id, opc) => {
          if (id === "saludo") return saludo();
          if (id === "firma") return firma();
          const v = val(id);
          if (v) return v;
          if (opc) { descartar = true; return ""; }
          return falta(etqDe(id));
        });
        if (!descartar) salida.push(r);
      }
      return salida.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    };

    // Líneas con texto propio para un campo opcional: «Por nuestra parte… {{plazo?}}.»
    let cuerpo = p.cuerpo;
    for (const [marca, linea] of Object.entries(p.sustituciones || {})) cuerpo = cuerpo.replace(marca, linea);

    const asunto = sustituir(p.asunto);
    const texto = p.acred && acredDisponible() ? generarAcreditacion(p, val, falta) : sustituir(cuerpo);
    return { asunto, cuerpo: texto, faltan: [...faltan] };
  }

  const aPlano = (t) => t.replace(new RegExp(`${INI}([^${FIN}]*)${FIN}`, "g"), "[$1]");
  const aHtml = (t) => esc(t).replace(new RegExp(`${INI}([^${FIN}]*)${FIN}`, "g"), '<mark class="rp-falta">[$1]</mark>');

  // ---------- Pintado ----------
  function montar() {
    raiz = $("respRelPlantillas");
    if (!raiz) return;
    if (!montado) {
      leerPersistidos();
      raiz.innerHTML = `
        <div class="rp">
          <nav class="rp-lista" data-zona="lista" aria-label="Plantillas"></nav>
          <div class="rp-editor" data-zona="editor"></div>
        </div>
        <datalist id="respDatalistClubesPlantillas"></datalist>`;
      raiz.addEventListener("click", onClick);
      raiz.addEventListener("input", onInput);
      montado = true;
    }
    // Clubes sugeridos (si clubs.js ha cargado más clubes entretanto).
    try {
      const clubes = (window.EOFResponsabilidades && window.EOFResponsabilidades.listaClubes && window.EOFResponsabilidades.listaClubes()) || [];
      $("respDatalistClubesPlantillas").innerHTML = clubes.map((c) => `<option value="${esc(c.nombre)}"></option>`).join("");
    } catch { /* sin sugerencias */ }
    pintarLista();
    pintarEditor();
  }

  function pintarLista() {
    const zona = raiz.querySelector('[data-zona="lista"]');
    zona.innerHTML = CATEGORIAS.map((c) => {
      const items = PLANTILLAS.filter((p) => p.cat === c.id).map((p) => `
        <button type="button" class="rp-item" data-rp="elegir" data-id="${p.id}" aria-current="${p.id === activa}">
          <span class="rp-item-t">${esc(p.titulo)}</span>
          <span class="rp-item-p">${esc(p.para)}</span>
        </button>`).join("");
      return `<section class="rp-cat" style="--rc:${c.color}"><h5>${esc(c.nombre)}</h5>${items}</section>`;
    }).join("");
  }

  function campoHtml(c) {
    const v = esc(valores[c.id] || "");
    const etq = esc(c.etq) + (c.opc ? ' <em>(opcional)</em>' : "");
    const comun = `data-rp-campo="${c.id}" autocomplete="off"`;
    if (c.tipo === "select") {
      const actual = valores[c.id] || c.opciones[0];
      valores[c.id] = actual;
      return `<label>${etq}<select ${comun}>${c.opciones.map((o) => `<option value="${esc(o)}"${o === actual ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
    }
    if (c.tipo === "area") return `<label class="ancho">${etq}<textarea ${comun} rows="2" maxlength="600" placeholder="${esc(c.ph || "")}">${v}</textarea></label>`;
    if (c.tipo === "club") return `<label>${etq}<input type="text" ${comun} maxlength="80" list="respDatalistClubesPlantillas" placeholder="${esc(c.ph || "")}" value="${v}"></label>`;
    return `<label>${etq}<input type="text" ${comun} maxlength="${c.id === "enlace" ? 300 : 120}" placeholder="${esc(c.ph || "")}" value="${v}"></label>`;
  }

  function pintarEditor() {
    const p = plantillaActiva();
    const zona = raiz.querySelector('[data-zona="editor"]');
    zona.innerHTML = `
      <header class="rp-cab">
        <h5>${esc(p.titulo)}</h5>
        <p>${esc(p.para)}</p>
      </header>
      <div class="rp-form">
        <div class="rp-form-grid">${p.campos.map((c) => campoHtml(defCampo(c))).join("")}</div>
        <div class="rp-yo">
          <span class="rp-yo-t">Tu firma</span>
          <div class="rp-form-grid">
            <label>Tu nombre<input type="text" data-rp-campo="remitente" maxlength="80" autocomplete="name" placeholder="Nombre y apellidos" value="${esc(valores.remitente || "")}"></label>
            <label>Tu cargo <em>(opcional)</em><input type="text" data-rp-campo="cargo" maxlength="80" autocomplete="off" placeholder="p. ej. Director" value="${esc(valores.cargo || "")}"></label>
          </div>
        </div>
      </div>
      <div class="rp-prev">
        <div class="rp-prev-cab">
          <strong>Vista previa</strong>
          <span class="rp-estado" data-zona="estado"></span>
        </div>
        <div class="rp-asunto"><span class="rp-asunto-e">Asunto</span><span class="rp-asunto-t" data-zona="asunto"></span></div>
        <pre class="rp-cuerpo" data-zona="cuerpo"></pre>
        <div class="rp-acc">
          <button type="button" class="resp-btn resp-btn-pri" data-rp="copiar-todo">Copiar asunto y texto</button>
          <button type="button" class="resp-btn" data-rp="copiar-cuerpo">Copiar solo el texto</button>
          <button type="button" class="resp-btn" data-rp="copiar-asunto">Copiar asunto</button>
          <button type="button" class="resp-btn" data-rp="correo">Abrir en mi correo</button>
          <button type="button" class="resp-btn" data-rp="limpiar">Vaciar campos</button>
        </div>
        <p class="rp-nota">Revisa el texto antes de enviarlo y ajústalo a cada caso. Los campos sin rellenar aparecen marcados entre corchetes.</p>
      </div>`;
    pintarPreview();
  }

  function pintarPreview() {
    const g = generar(plantillaActiva());
    const set = (z, html) => { const el = raiz.querySelector(`[data-zona="${z}"]`); if (el) el.innerHTML = html; };
    set("asunto", aHtml(g.asunto));
    set("cuerpo", aHtml(g.cuerpo));
    const est = raiz.querySelector('[data-zona="estado"]');
    if (est) {
      est.className = "rp-estado " + (g.faltan.length ? "faltan" : "listo");
      est.textContent = g.faltan.length
        ? (g.faltan.length === 1 ? "Falta 1 campo" : `Faltan ${g.faltan.length} campos`)
        : "Listo para enviar";
    }
    return g;
  }

  // ---------- Acciones ----------
  async function copiar(texto, aviso) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = document.createElement("textarea");
      t.value = texto; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch { /* sin portapapeles */ }
      t.remove();
    }
    toast(aviso, "success", 2200);
  }

  function actuar(acc) {
    const g = generar(plantillaActiva());
    const asunto = aPlano(g.asunto), cuerpo = aPlano(g.cuerpo);
    if (acc !== "limpiar" && g.faltan.length) toast(`Quedan campos por rellenar: ${g.faltan.join(", ")}.`, "info", 4200);
    if (acc === "copiar-asunto") copiar(asunto, "Asunto copiado.");
    else if (acc === "copiar-cuerpo") copiar(cuerpo, "Texto copiado.");
    else if (acc === "copiar-todo") copiar(`Asunto: ${asunto}\n\n${cuerpo}`, "Asunto y texto copiados.");
    else if (acc === "correo") window.location.href = `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    else if (acc === "limpiar") {
      for (const k of Object.keys(valores)) if (k !== "remitente" && k !== "cargo") delete valores[k];
      pintarEditor();
    }
  }

  function onClick(e) {
    const b = e.target.closest("[data-rp]");
    if (!b || !raiz.contains(b)) return;
    if (b.dataset.rp === "elegir") {
      // Los datos personales (correo, DNI, función) no se arrastran a otra plantilla: cada correo es de una persona.
      if (b.dataset.id !== activa) { delete valores.correo; delete valores.dni; delete valores.funciones; }
      activa = b.dataset.id;
      pintarLista();
      pintarEditor();
      if (window.matchMedia && window.matchMedia("(max-width: 820px)").matches) {
        const ed = raiz.querySelector('[data-zona="editor"]');
        if (ed) ed.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    actuar(b.dataset.rp);
  }

  function onInput(e) {
    const t = e.target.closest("[data-rp-campo]");
    if (!t) return;
    valores[t.dataset.rpCampo] = t.value;
    if (t.dataset.rpCampo === "remitente" || t.dataset.rpCampo === "cargo") guardarPersistidos();
    pintarPreview();
  }

  window.EOFRespPlantillas = { montar };
})();
