document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("hero")) iniciarPortada();
  if (document.getElementById("resultados-home")) cargaResultadosHome();
  if (document.getElementById("seccion-encuestas-portada")) cargaEncuestasPortada();
});

// ---------- Orquestación de la portada ----------
// Orden: 1) hero (destacadas) -> 2) en paralelo "Última hora" y "Noticias
// recientes" (esta última pide excluir lo que ya sale en el hero) -> 3) los
// módulos de más abajo (entrevista/reportaje, más leídas + tendencias y
// bloques por competición) se cargan cuando el lector se acerca a ellos
// (IntersectionObserver), para no pedir 7 listados a la API en cada visita
// a quien solo mira lo de arriba.
// PORTADA_VISTOS guarda los ids de noticias ya pintadas para no repetirlas
// entre módulos (hero, recientes, entrevista, bloques por competición).
const PORTADA_VISTOS = new Set();
// Solo las del hero: "Noticias recientes" las excluye por id y avanza con
// offset (si también excluyera las ya pintadas, se saltaría noticias al
// paginar); la entrevista/reportaje destacado tampoco debe quedar fuera
// solo porque ya salga entre las recientes.
const PORTADA_HERO = new Set();

function portadaRegistrar(lista) {
  (lista || []).forEach((a) => { if (a && a.id != null) PORTADA_VISTOS.add(a.id); });
}

// La API admite como máximo 30 ids en "excluir"; se mandan los más recientes.
function portadaExcluirParam(conjunto = PORTADA_VISTOS) {
  const ids = [...conjunto].slice(-30);
  return ids.length ? `&excluir=${ids.join(",")}` : "";
}

async function iniciarPortada() {
  const { ultimas } = await cargaPortada();
  const tareas = [];
  if (document.getElementById("seccion-ultima-hora")) tareas.push(cargaUltimaHora(ultimas));
  if (document.getElementById("grid-categoria-home")) tareas.push(cargaNoticiasRecientes());
  await Promise.allSettled(tareas);
  portadaCargaDiferida(() => {
    if (document.getElementById("seccion-galerias")) cargaGaleriasPortada();
    if (document.getElementById("seccion-entrevista")) cargaEntrevistaDestacada();
    if (document.getElementById("seccion-ranking")) cargaRanking();
    if (document.getElementById("seccion-reconocimiento")) cargaReconocimiento();
    if (document.getElementById("bloques-competicion")) cargaBloquesCompeticion();
  });
  iniciarPortadaEnVivo();
}

// Ejecuta fn una sola vez cuando el centinela (#portada-diferida) está a
// menos de 900px de la pantalla; sin IntersectionObserver, se ejecuta ya.
// ---------- Portada en directo ----------
// Sin recargar la página, la portada se mantiene al día:
//  - cada ~20 s se piden destacadas + últimas + banner. Si el hero cambia
//    se repinta el hero; "Última hora" se repinta si cambia (o cada minuto,
//    para que "hace X min" avance); y si ha cambiado el listado de últimas
//    (se publicó o editó algo) se refrescan también las "Noticias recientes".
//  - cada ~2 min se refrescan "Más leídas/Tendencias".
//  - las encuestas tienen su propia tarea (~15 s): ver iniciarEncuestasEnVivo en encuestas.js.
// Todo se compara por firma y solo se toca el DOM si algo ha cambiado.
const VIVO_PORTADA = { firmaHero: null, firmaUltimas: null, firmaUH: null };

// Solo los campos que se ven en las tarjetas: así un cambio de contador
// interno (vistas, etc.) no provoca repintados.
function firmaArticulos(lista) {
  return EOF_VIVO.firma((lista || []).map((a) => a && ({
    id: a.id, slug: a.slug, t: a.titulo, s: a.subtitulo, c: a.categoria, cl: a.club, tp: a.tipo,
    f: a.fecha_publicacion, i: a.imagen_url, if: a.imagen_foco, im: a.imagenes,
    a: a.autor_nombre, co: a.coautor_nombre, r: a.contenido,
  })));
}
function firmaHeroPortada(destacados, ultimas) {
  return firmaArticulos(destacados) + (destacados.length < 5 ? "|" + firmaArticulos((ultimas || []).slice(0, 8)) : "");
}

async function pedirJSONVivo(path) {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + path);
  return res.json();
}

async function refrescarPortadaEnVivo() {
  const [dest, ult, banner] = await Promise.all([
    pedirJSONVivo("/api/articles?destacado=1&limit=5"),
    pedirJSONVivo("/api/articles?limit=8"),
    pedirJSONVivo("/api/articles/banner-urgente").catch(() => null),
  ]);
  const destacados = dest.articles, ultimas = ult.articles;
  if (!Array.isArray(destacados) || !Array.isArray(ultimas)) throw new Error("respuesta inesperada");

  // 1) Hero
  let heroCambio = false;
  const hero = document.getElementById("hero");
  if (hero && destacados.length) {
    const fh = firmaHeroPortada(destacados, ultimas);
    if (fh !== VIVO_PORTADA.firmaHero) {
      VIVO_PORTADA.firmaHero = fh;
      pintarHero(destacados, ultimas);
      EOF_VIVO.resaltar(hero);
      heroCambio = true;
    }
  }

  // 2) Última hora (incluye el minuto actual en la firma para que "hace X min" avance)
  const seccionUH = document.getElementById("seccion-ultima-hora");
  if (seccionUH) {
    const urgente = banner && banner.activo && banner.titulo && banner.url ? banner : null;
    const fu = firmaArticulos(ultimas) + "|" + EOF_VIVO.firma(urgente) + "|" + Math.floor(Date.now() / 60000);
    if (fu !== VIVO_PORTADA.firmaUH) {
      VIVO_PORTADA.firmaUH = fu;
      pintarUltimaHora(seccionUH, ultimas, urgente);
    }
  }

  // 3) Noticias recientes: solo si algo se ha publicado/editado o cambió el hero
  const fUlt = firmaArticulos(ultimas);
  const ultimasCambiaron = fUlt !== VIVO_PORTADA.firmaUltimas;
  VIVO_PORTADA.firmaUltimas = fUlt;
  if ((ultimasCambiaron || heroCambio) && document.getElementById("grid-categoria-home")) {
    await refrescarRecientesEnVivo();
  }
}

async function refrescarRecientesEnVivo() {
  const cont = document.getElementById("grid-categoria-home");
  if (!cont || recientesCargando) return;
  const grid = document.getElementById("grid-recientes");
  // Si antes no había ninguna noticia reciente, se vuelve a montar el bloque.
  if (!grid) {
    const { articles = [] } = await pedirJSONVivo(`/api/articles?limit=${RECIENTES_PAGINA_INICIAL}&offset=0${portadaExcluirParam(PORTADA_HERO)}`);
    if (articles.length) { recientesOffset = 0; recientesPintados.clear(); await cargaNoticiasRecientes(); }
    return;
  }
  // Se piden tantas como hay pintadas (por si el lector ya pulsó "Ver más").
  const n = Math.min(40, Math.max(RECIENTES_PAGINA_INICIAL, recientesDatos.length));
  const { articles = [], hay_mas = false } = await pedirJSONVivo(`/api/articles?limit=${n}&offset=0${portadaExcluirParam(PORTADA_HERO)}`);
  if (!articles.length) return;
  if (firmaArticulos(articles) === firmaArticulos(recientesDatos)) return;

  const idsAntes = new Set(recientesDatos.map((a) => a.id));
  recientesDatos = articles.slice();
  recientesOffset = articles.length;
  recientesPintados.clear();
  articles.forEach((a) => recientesPintados.add(a.id));
  portadaRegistrar(articles);
  grid.innerHTML = articles.map(cardHTML).join("");
  articles.forEach((a) => {
    if (idsAntes.has(a.id)) return;
    const tarjeta = grid.querySelector(`[data-art-id="${Number(a.id)}"]`);
    if (tarjeta) EOF_VIVO.resaltar(tarjeta);
  });
  const zonaBoton = document.getElementById("cargar-mas-home");
  if (zonaBoton) zonaBoton.hidden = !hay_mas;
}

// Más leídas / tendencias y encuestas cambian más despacio.
const VIVO_LENTO = { firmaRanking: null, firmaEncuestas: null };
async function refrescarPortadaLentoEnVivo() {
  if (document.getElementById("seccion-ranking") && document.getElementById("seccion-ranking").innerHTML.trim()) {
    const r = await pedirJSONVivo("/api/articles/ranking?limit=5");
    const f = EOF_VIVO.firma([r.mas_leidas, r.tendencias].map((l) => (l || []).map((a) => [a.id, a.titulo, a.slug])));
    if (VIVO_LENTO.firmaRanking === null) VIVO_LENTO.firmaRanking = f;
    else if (f !== VIVO_LENTO.firmaRanking) { VIVO_LENTO.firmaRanking = f; await cargaRanking(); }
  }
}

function iniciarPortadaEnVivo() {
  if (!window.EOF_VIVO) return;
  EOF_VIVO.cada("portada", refrescarPortadaEnVivo, 20000);
  EOF_VIVO.cada("portada-lento", refrescarPortadaLentoEnVivo, 120000);
  // Encuestas: resultados en directo cada ~15 s (ver encuestas.js).
  if (typeof iniciarEncuestasEnVivo === "function" && document.getElementById("seccion-encuestas-portada")) {
    iniciarEncuestasEnVivo({
      nombre: "encuestas-portada",
      pedir: async () => {
        const res = await apiFetchLector("/api/polls/portada");
        if (!res.ok) throw new Error("HTTP " + res.status);
        return (await res.json()).encuestas;
      },
      // Se añadió/quitó una encuesta de portada: se vuelve a montar la sección.
      alCambiarConjunto: () => {
        const sec = document.getElementById("seccion-encuestas-portada");
        // Si el lector está eligiendo opción, se espera al siguiente ciclo.
        if (sec && (sec.matches(":focus-within") || sec.querySelector("input:checked"))) return;
        return cargaEncuestasPortada();
      },
    });
  }
}

function portadaCargaDiferida(fn) {
  const centinela = document.getElementById("portada-diferida");
  if (!centinela || typeof IntersectionObserver === "undefined") { fn(); return; }
  const obs = new IntersectionObserver((entradas) => {
    if (entradas.some((e) => e.isIntersecting)) { obs.disconnect(); fn(); }
  }, { rootMargin: "900px 0px" });
  obs.observe(centinela);
}

// "hace 12 min" / "hace 3 h" a partir de la fecha de publicación (UTC sin
// zona, como el resto de fechas de noticias, ver formatFecha en config.js).
function minutosDesdePublicacion(fechaStr) {
  const conT = String(fechaStr || "").trim().replace(" ", "T");
  if (!conT) return null;
  const d = new Date(/Z$|[+-]\d\d:\d\d$/.test(conT) ? conT : conT + "Z");
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 60000);
}

function textoHace(min) {
  if (min == null || min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

// Fila compacta (miniatura + categoría + titular). La usan "Más leídas",
// "Tendencias" y los bloques por competición.
function filaNoticiaHTML(a, { numero = "", icono = "" } = {}) {
  const portada = EOF_FOCO.portadaDeArticulo(a);
  const img = portada.url ? cloudinaryOptimizada(portada.url, 220) : "img/default.jpg";
  return `
    <a class="fila-noticia" href="${urlNoticia(a.categoria, a.slug)}">
      ${numero ? `<span class="fila-num" aria-hidden="true">${numero}</span>` : ""}
      ${icono ? `<span class="fila-icono" aria-hidden="true">${icono}</span>` : ""}
      ${EOF_FOCO.img({ src: img, alt: "", foco: portada.foco })}
      <div class="fila-texto">
        ${contextoNoticiaHTML(a, { variante: "compacta" })}
        <h3>${escapeHtml(a.titulo)}</h3>
        <span class="meta">${formatFecha(a.fecha_publicacion)}</span>
      </div>
    </a>`;
}

// conReintento() (reintento automático de una carga fallida) está
// definido en config.js, junto a apiFetch, para que esté disponible en
// todas las páginas sin duplicarlo en cada script.

// ---------- Noticias recientes (portada) ----------
// Todas las noticias publicadas, de más reciente a más antigua, SIN repetir
// las que ya salen en el hero (se excluyen por id). Se muestran 4 al
// principio y el botón "Cargar más noticias" añade 4 más cada vez
// (paginación con offset en GET /api/articles; la API devuelve "hay_mas").
const RECIENTES_PAGINA_INICIAL = 4;
const RECIENTES_PAGINA_MAS = 4;
let recientesOffset = 0;
let recientesCargando = false;
// Ids ya pintados en ESTE grid (solo para no duplicar al paginar; no se
// mezcla con PORTADA_VISTOS, que también rellenan los módulos de más abajo).
const recientesPintados = new Set();
// Artículos que hay ahora mismo en el grid (para detectar cambios en directo).
let recientesDatos = [];

function pedirRecientes(limit) {
  return conReintento(async () => {
    const res = await apiFetch(`/api/articles?limit=${limit}&offset=${recientesOffset}${portadaExcluirParam(PORTADA_HERO)}`);
    return res.json();
  });
}

async function cargaNoticiasRecientes() {
  const cont = document.getElementById("grid-categoria-home");
  const zonaBoton = document.getElementById("cargar-mas-home");
  cont.innerHTML = spinnerHTML();
  try {
    const { articles = [], hay_mas = false } = await pedirRecientes(RECIENTES_PAGINA_INICIAL);
    if (!articles.length) {
      cont.innerHTML = estadoHTML({
        titulo: "Todavía no hay más noticias",
        texto: "En cuanto publiquemos nuevas crónicas y noticias, las verás aquí.",
      });
      return;
    }
    recientesOffset += articles.length;
    portadaRegistrar(articles);
    articles.forEach((a) => recientesPintados.add(a.id));
    recientesDatos = articles.slice();
    cont.innerHTML = `<div class="grid-noticias" id="grid-recientes">${articles.map(cardHTML).join("")}</div>`;
    if (zonaBoton) {
      zonaBoton.hidden = !hay_mas;
      const boton = document.getElementById("btn-cargar-mas");
      if (boton && !boton.dataset.listo) {
        boton.dataset.listo = "1";
        boton.addEventListener("click", cargarMasRecientes);
      }
    }
  } catch (err) {
    console.error("Error cargando noticias recientes:", err);
    cont.innerHTML = estadoHTML({
      titulo: "No se ha podido conectar",
      texto: "Ha habido un problema al cargar las noticias. Comprueba tu conexión e inténtalo de nuevo.",
      tipo: "error",
      cta: `<a href="javascript:location.reload()" class="btn-volver">Reintentar</a>`,
    });
  }
}

async function cargarMasRecientes(ev) {
  if (recientesCargando) return;
  // detail === 0: se activó con el teclado (Enter/Espacio). Con el dedo o el ratón
  // no se mueve el foco: el botón se deshabilita mientras carga, el foco se pierde
  // y el navegador pintaría el aro azul de "foco de teclado" sobre la primera tarjeta.
  const porTeclado = !!ev && ev.detail === 0;
  const boton = document.getElementById("btn-cargar-mas");
  const zonaBoton = document.getElementById("cargar-mas-home");
  const grid = document.getElementById("grid-recientes");
  const aviso = document.getElementById("cargar-mas-aviso");
  if (!boton || !grid) return;
  recientesCargando = true;
  boton.disabled = true;
  boton.classList.add("cargando");
  if (aviso) aviso.textContent = "";
  try {
    const { articles = [], hay_mas = false } = await pedirRecientes(RECIENTES_PAGINA_MAS);
    recientesOffset += articles.length;
    // Si se publicó algo mientras tanto, el desplazamiento puede hacer que
    // llegue una noticia ya pintada: se descarta para no duplicarla.
    const nuevas = articles.filter((a) => !recientesPintados.has(a.id));
    portadaRegistrar(articles);
    articles.forEach((a) => recientesPintados.add(a.id));
    recientesDatos = recientesDatos.concat(nuevas);
    if (nuevas.length) {
      const marca = grid.children.length;
      grid.insertAdjacentHTML("beforeend", nuevas.map(cardHTML).join(""));
      // Solo con teclado: el foco pasa a la primera tarjeta nueva.
      const primera = grid.children[marca];
      if (porTeclado && primera && typeof primera.focus === "function") primera.focus({ preventScroll: false });
    }
    if (zonaBoton) zonaBoton.hidden = !hay_mas;
    if (!hay_mas && aviso) aviso.textContent = "";
  } catch (err) {
    console.error("Error cargando más noticias:", err);
    if (aviso) aviso.textContent = "No se han podido cargar más noticias. Inténtalo de nuevo.";
  } finally {
    recientesCargando = false;
    boton.disabled = false;
    boton.classList.remove("cargando");
  }
}

// ---------- Última hora (portada) ----------
// Titulares publicados en las últimas 24 horas, de más nuevo a más antiguo,
// con "hace X min". Si hay un banner de última hora activo (el que se
// activa desde el panel y dura 2 h), va el primero con la etiqueta
// "ÚLTIMA HORA". Si no hay nada tan reciente, el módulo se oculta (no se
// enseñan titulares viejos bajo un rótulo de "última hora").
const ULTIMA_HORA_MAX = 5;
const ULTIMA_HORA_VENTANA_MIN = 24 * 60;
let ultimaHoraTemporizador = null;

async function cargaUltimaHora(ultimas) {
  const seccion = document.getElementById("seccion-ultima-hora");
  if (!seccion) return;
  let urgente = null;
  try {
    const res = await apiFetch("/api/articles/banner-urgente");
    const datos = await res.json();
    if (datos && datos.activo && datos.titulo && datos.url) urgente = datos;
  } catch {
    // El banner es opcional: si falla, se sigue solo con los titulares.
  }
  pintarUltimaHora(seccion, ultimas || [], urgente);

  // Con en-vivo.js la actualiza refrescarPortadaEnVivo (cada ~20 s); este
  // intervalo de 90 s solo queda como respaldo si ese módulo no está cargado.
  if (!window.EOF_VIVO && !ultimaHoraTemporizador) {
    ultimaHoraTemporizador = setInterval(async () => {
      if (document.hidden) return;
      try {
        const [resArt, resBan] = await Promise.all([
          apiFetch("/api/articles?limit=8").then((r) => r.json()),
          apiFetch("/api/articles/banner-urgente").then((r) => r.json()).catch(() => null),
        ]);
        pintarUltimaHora(seccion, resArt.articles || [], resBan && resBan.activo ? resBan : null);
      } catch {
        // Un fallo puntual no debe borrar lo que ya se está mostrando.
      }
    }, 90000);
  }
}

function pintarUltimaHora(seccion, articulos, urgente) {
  const items = articulos
    .map((a) => ({ a, min: minutosDesdePublicacion(a.fecha_publicacion) }))
    .filter((x) => x.min != null && x.min >= -5 && x.min <= ULTIMA_HORA_VENTANA_MIN)
    .filter((x) => !urgente || urlNoticia(x.a.categoria, x.a.slug) !== urgente.url)
    .slice(0, urgente ? ULTIMA_HORA_MAX - 1 : ULTIMA_HORA_MAX);

  if (!items.length && !urgente) { seccion.hidden = true; seccion.innerHTML = ""; return; }

  const filaUrgente = urgente ? `
      <li class="uh-item uh-urgente">
        <a href="${escapeHtml(urgente.url)}">
          <span class="uh-hora"><span class="uh-sello">ÚLTIMA HORA</span></span>
          <span class="uh-titulo">${escapeHtml(urgente.titulo)}</span>
        </a>
      </li>` : "";
  const filas = items.map(({ a, min }) => `
      <li class="uh-item">
        <a href="${urlNoticia(a.categoria, a.slug)}">
          <span class="uh-hora">${textoHace(min)}</span>
          <span class="uh-titulo">${escapeHtml(a.titulo)}</span>
          <span class="uh-cat">${escapeHtml(categoriaLabel(a.categoria))}${clubArticuloLegible(a.club) ? " · " + escapeHtml(clubArticuloLegible(a.club)) : ""}</span>
        </a>
      </li>`).join("");

  seccion.hidden = false;
  seccion.innerHTML = `
    <h2 class="uh-cabecera"><span class="en-vivo-punto"></span>Última hora</h2>
    <ul class="uh-lista">${filaUrgente}${filas}</ul>`;
}

// ---------- Entrevista o reportaje destacado (portada) ----------
// La entrevista más reciente; si no hay ninguna, el análisis más reciente
// (el contenido de fondo más parecido a un reportaje). Sin repetir lo ya
// pintado más arriba. Si no hay ni una cosa ni la otra, el módulo no sale.
async function cargaEntrevistaDestacada() {
  const seccion = document.getElementById("seccion-entrevista");
  if (!seccion) return;
  try {
    let articulo = null;
    let tipo = "entrevista";
    for (const t of ["entrevista", "analisis"]) {
      const { articles = [] } = await conReintento(async () => {
        const res = await apiFetch(`/api/articles?tipo=${t}&limit=1${portadaExcluirParam(PORTADA_HERO)}`);
        return res.json();
      });
      if (articles.length) { articulo = articles[0]; tipo = t; break; }
    }
    if (!articulo) { seccion.hidden = true; return; }
    portadaRegistrar([articulo]);
    const etiqueta = tipo === "entrevista" ? "Entrevista destacada" : "Reportaje destacado";
    const accion = tipo === "entrevista" ? "Leer la entrevista" : "Leer el reportaje";
    const portada = EOF_FOCO.portadaDeArticulo(articulo);
    const img = portada.url ? cloudinaryOptimizada(portada.url, 900) : "img/default.jpg";
    const autor = articulo.autor_nombre
      ? ` · ${escapeHtml(articulo.autor_nombre)}${articulo.coautor_nombre ? " y " + escapeHtml(articulo.coautor_nombre) : ""}`
      : "";
    seccion.hidden = false;
    seccion.innerHTML = `
      <a class="entrevista-tarjeta" href="${urlNoticia(articulo.categoria, articulo.slug)}">
        <div class="entrevista-foto">
          ${EOF_FOCO.img({ src: img, alt: articulo.titulo, foco: portada.foco })}
        </div>
        <div class="entrevista-cuerpo">
          <span class="entrevista-etiqueta">${etiqueta}</span>
          <h2>${escapeHtml(articulo.titulo)}</h2>
          <p>${escapeHtml(resumText(articulo.subtitulo || articulo.contenido, 220))}</p>
          <span class="meta">${escapeHtml(categoriaLabel(articulo.categoria))} · ${formatFecha(articulo.fecha_publicacion)}${autor}</span>
          <span class="entrevista-cta">${accion} →</span>
        </div>
      </a>`;
  } catch (err) {
    console.error("Error cargando entrevista destacada:", err);
    seccion.hidden = true; // módulo opcional: si falla, no se enseña
  }
}

// ---------- Galerías de partidos (portada) ----------
// Tarjetas como las de noticias (.card dentro de .grid-noticias): cada galería
// de partido sale con la PORTADA que eligió quien la publicó (campo "portada"
// de GET /api/galerias/partidos; si el servidor aún no la manda, la primera
// foto), los equipos, el marcador, la fecha y el número de fotos. Chips para
// filtrar por competición (o "Recientes") y enlace a "Ver todas las galerías".
// Si no hay ningún partido con fotos, el módulo no sale.
async function cargaGaleriasPortada() {
  const seccion = document.getElementById("seccion-galerias");
  if (!seccion) return;

  const MAX_TARJETAS = 5; // el diseño se adapta a cuántas haya (1, 2, 3, 4 o 5)
  const ORDEN = ["hypermotion", "primera_federacion", "segunda_federacion", "tercera_federacion", "copa_del_rey", "copa_federacion"];
  const estado = { comp: "", partidos: [], competiciones: [], cache: {}, peticion: 0 };

  const etiquetaComp = (c) => (typeof CATEGORIES !== "undefined" && CATEGORIES[c]) || c || "";
  const logoComp = (c) => (typeof CATEGORY_LOGOS !== "undefined" && CATEGORY_LOGOS[c]) || "";
  const mini = (url, ancho) => (typeof cloudinaryMiniatura === "function" ? cloudinaryMiniatura(url, ancho, false) : url);
  const nombreFoto = (p) => `${p.equipo_local} - ${p.equipo_visitante}`;
  // La portada elegida; si no viene, la primera foto de muestra.
  const portadaDe = (p) => (p && (p.portada || (p.fotos && p.fotos[0]))) || null;

  const escudo = (nombre, url) => {
    const src = typeof getEscudoUrl === "function" ? getEscudoUrl(nombre, url) : "";
    return `<img class="cg-escudo" data-equipo="${escapeHtml(nombre)}" src="${escapeHtml(src)}" alt="" width="28" height="28" loading="lazy" decoding="async" onerror="manejarErrorEscudo(this);">`;
  };
  const marcador = (p) => {
    if (p.estado === "programado" || p.estado === "anulado") return "vs";
    return `${p.goles_local == null ? "-" : p.goles_local} - ${p.goles_visitante == null ? "-" : p.goles_visitante}`;
  };
  const fechaCorta = (fecha) => {
    const m = String(fecha || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const dias = Math.round((hoy - d) / 86400000);
    if (dias === 0) return "Hoy";
    if (dias === 1) return "Ayer";
    return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }).replace(".", "");
  };
  const fotosTxt = (n) => `${Number(n || 0).toLocaleString("es-ES")} ${Number(n) === 1 ? "foto" : "fotos"}`;
  const iconoCamara = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6.5" width="19" height="14" rx="2.5"/><circle cx="12" cy="13.5" r="3.6"/><path d="M8.5 6.5l1.3-2.3a1 1 0 0 1 .87-.5h2.66a1 1 0 0 1 .87.5l1.3 2.3"/></svg>`;

  async function pedir(comp, pagina) {
    const params = new URLSearchParams({ pagina: String(pagina || 1) });
    if (comp) params.set("competicion", comp);
    return conReintento(async () => {
      const res = await apiFetch("/api/galerias/partidos?" + params.toString());
      if (!res.ok) throw new Error("galerias " + res.status);
      return res.json();
    });
  }
  const conPortada = (lista) => (lista || []).filter((p) => p && p.slug && portadaDe(p) && portadaDe(p).url).slice(0, MAX_TARJETAS);

  function chipsHTML() {
    if (estado.competiciones.length < 2) return "";
    const lista = estado.competiciones.slice().sort((a, b) => {
      const ia = ORDEN.indexOf(a.clave), ib = ORDEN.indexOf(b.clave);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const chip = (clave, texto, logo) =>
      `<button type="button" class="gp-chip" data-comp="${escapeHtml(clave)}" aria-pressed="${estado.comp === clave}">${logo ? `<img src="${escapeHtml(logo)}" alt="" width="16" height="16">` : ""}${escapeHtml(texto)}</button>`;
    return `<div class="gp-chips" role="group" aria-label="Filtrar por competición">${chip("", "Recientes", "")}${lista.map((c) => chip(c.clave, etiquetaComp(c.clave), logoComp(c.clave))).join("")}</div>`;
  }

  // Qué tarjetas van "grandes" (con la foto a todo el tamaño y el texto encima),
  // según cuántas galerías haya: 1 → la única; 2 → las dos; 3 y 5 → la primera;
  // 4 → ninguna (fila de 4 iguales).
  const esGrande = (i, n) => n === 1 || n === 2 || ((n === 3 || n >= 5) && i === 0);

  function tarjetaHTML(p, grande) {
    const f = portadaDe(p);
    const etiqueta = [etiquetaComp(p.competicion), p.jornada ? "J" + p.jornada : ""].filter(Boolean).join(" · ");
    const fecha = fechaCorta(p.fecha_partido);
    return `
      <a class="card card-galeria${grande ? " card-hero" : ""}" href="/galeria/${encodeURIComponent(p.slug)}" aria-label="Galería de ${escapeHtml(nombreFoto(p))}, ${fotosTxt(p.total)}">
        <div class="cg-foto">
          ${EOF_FOCO.img({ src: mini(f.url, 500), alt: f.titulo || "Foto del partido " + nombreFoto(p), foco: f.foco })}
          <span class="cg-fotos">${iconoCamara}${escapeHtml(fotosTxt(p.total))}</span>
        </div>
        <div class="cbody">
          ${etiqueta ? `<span class="cat">${escapeHtml(etiqueta)}</span>` : ""}
          <h3>${escapeHtml(p.equipo_local)} – ${escapeHtml(p.equipo_visitante)}</h3>
          <span class="cg-marcador">${escudo(p.equipo_local, p.escudo_local_url)}<b>${escapeHtml(marcador(p))}</b>${escudo(p.equipo_visitante, p.escudo_visitante_url)}</span>
          <span class="meta">${escapeHtml(fecha)}${fecha ? " · " : ""}${escapeHtml(fotosTxt(p.total))}</span>
        </div>
      </a>`;
  }

  function pintarGrid() {
    const cont = seccion.querySelector(".gp-grid");
    if (!cont) return;
    // Con 5 tarjetas, la primera va destacada (grande) en escritorio y tablet.
    const n = estado.partidos.length;
    cont.dataset.n = String(n);
    cont.innerHTML = estado.partidos.length
      ? estado.partidos.map((p, i) => tarjetaHTML(p, esGrande(i, n))).join("")
      : `<p class="gp-vacio">Todavía no hay galerías en esta competición.</p>`;
  }

  function pintarTodo() {
    const enlaceTodo = `/galerias${estado.comp ? "?competicion=" + encodeURIComponent(estado.comp) : ""}`;
    seccion.hidden = false;
    seccion.innerHTML = `
      <div class="gp-cabecera">
        <h2 class="section-title gp-titulo"><span class="gp-icono">${iconoCamara}</span><span class="gp-titulo-txt">Galerías de partidos</span></h2>
        <a href="${enlaceTodo}" class="gp-ver-todo">Ver todas<span class="gp-ver-todo-extra"> las galerías</span> <span aria-hidden="true">→</span></a>
      </div>
      ${chipsHTML()}
      <div class="grid-noticias gp-grid" aria-live="polite"></div>`;
    pintarGrid();
  }

  async function elegirCompeticion(comp) {
    if (comp === estado.comp) return;
    const mia = ++estado.peticion;
    estado.comp = comp;
    seccion.querySelectorAll(".gp-chip").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.comp || "") === comp)));
    seccion.querySelectorAll(".gp-ver-todo").forEach((a) => { a.href = `/galerias${comp ? "?competicion=" + encodeURIComponent(comp) : ""}`; });
    seccion.classList.add("gp-cargando");
    try {
      if (!estado.cache[comp]) estado.cache[comp] = conPortada((await pedir(comp, 1)).partidos);
      if (mia !== estado.peticion) return;
      estado.partidos = estado.cache[comp];
      pintarGrid();
    } catch (err) {
      if (mia !== estado.peticion) return;
      estado.partidos = [];
      pintarGrid();
    } finally {
      if (mia === estado.peticion) seccion.classList.remove("gp-cargando");
    }
  }

  try {
    const datos = await pedir("", 1);
    const partidos = conPortada(datos.partidos);
    if (!partidos.length) { seccion.hidden = true; return; }
    estado.cache[""] = partidos;
    estado.partidos = partidos;
    // Solo salen las competiciones que de verdad tienen galerías que enseñar:
    // el resumen del servidor también cuenta partidos cuya galería no tiene
    // ninguna foto con portada (p. ej. solo vídeos), y esos dejarían un chip
    // que al pulsarlo no muestra nada. Se comprueba cada una y se guarda en
    // la caché, así al pulsar el chip la respuesta es inmediata.
    const candidatas = (datos.competiciones || []).filter((c) => c && c.clave && c.partidos > 0);
    const comprobadas = await Promise.all(candidatas.map(async (c) => {
      try {
        const lista = conPortada((await pedir(c.clave, 1)).partidos);
        if (!lista.length) return null;
        estado.cache[c.clave] = lista;
        return c;
      } catch (err) {
        return null; // si no se puede comprobar, mejor no enseñar un chip vacío
      }
    }));
    estado.competiciones = comprobadas.filter(Boolean);
    pintarTodo();
    seccion.addEventListener("click", (e) => {
      const chip = e.target.closest(".gp-chip");
      if (chip) elegirCompeticion(chip.dataset.comp || "");
    });
  } catch (err) {
    seccion.hidden = true; // módulo opcional: si falla, no se enseña
  }
}

// ---------- Más leídas y Tendencias (portada) ----------
// "Más leídas": las más vistas de los últimos 7 días. "Tendencias": las que
// más suben hoy (sin repetir las más leídas). Ver GET /api/articles/ranking.
// Si todavía no hay visitas registradas, el módulo no sale.
async function cargaRanking() {
  const seccion = document.getElementById("seccion-ranking");
  if (!seccion) return;
  try {
    const { mas_leidas = [], tendencias = [] } = await conReintento(async () => {
      const res = await apiFetch("/api/articles/ranking?limit=5");
      return res.json();
    });
    if (!mas_leidas.length && !tendencias.length) { seccion.hidden = true; return; }
    const iconoSube = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>`;
    const columna = (titulo, subtitulo, lista, opciones) => lista.length ? `
        <div class="ranking-col">
          <h2 class="section-title">${titulo}</h2>
          <p class="ranking-sub">${subtitulo}</p>
          <div class="ranking-lista">
            ${lista.map((a, i) => filaNoticiaHTML(a, opciones(i))).join("")}
          </div>
        </div>` : "";
    seccion.hidden = false;
    seccion.innerHTML = `
      <div class="ranking-grid${mas_leidas.length && tendencias.length ? "" : " ranking-una"}">
        ${columna("Más leídas", "Lo que más se ha leído esta semana", mas_leidas, (i) => ({ numero: String(i + 1) }))}
        ${columna("Tendencias", "Lo que más está subiendo hoy", tendencias, () => ({ icono: iconoSube }))}
      </div>`;
  } catch (err) {
    console.error("Error cargando el ranking de portada:", err);
    seccion.hidden = true;
  }
}

// ---------- Reconocimiento del mes (portada) ----------
// "Redactor/a del mes" y "Foto del mes" del último mes cerrado, confirmados por la dirección desde el
// panel (ver GET /api/reconocimientos). Si no hay nada confirmado, el módulo no sale. De la persona
// solo se enseña lo que ya es público: nombre, foto de perfil y nº de publicaciones del mes.
// Hoja de estilos del módulo: se pide solo si hay algo que pintar (y en paralelo a los datos),
// así no pesa en el primer pintado de la portada. Resuelve siempre (aunque falle) para no bloquear.
function cargaEstiloReconocimiento() {
  const href = "/css/reconocimiento-mes.css?v=2";
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
  return new Promise((resolve) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onload = l.onerror = () => resolve();
    document.head.appendChild(l);
  });
}

async function cargaReconocimiento() {
  const seccion = document.getElementById("seccion-reconocimiento");
  if (!seccion) return;
  try {
    const d = await conReintento(async () => {
      const res = await apiFetch("/api/reconocimientos");
      return res.json();
    });
    if (!d || !d.mes || (!d.redactor && !d.foto)) { seccion.hidden = true; return; }
    await cargaEstiloReconocimiento();
    const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const mesTexto = `${MESES[Number(d.mes.slice(5, 7)) - 1]} de ${d.mes.slice(0, 4)}`;
    const iconoTrofeo = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>`;
    const iconoCamara = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`;
    const enlaceAutor = (id, nombre) => id ? `<a href="/autor?id=${encodeURIComponent(id)}">${escapeHtml(nombre)}</a>` : escapeHtml(nombre);
    let html = "";
    if (d.redactor) {
      const r = d.redactor;
      const inicial = escapeHtml(String(r.nombre || "?").trim().charAt(0).toUpperCase() || "?");
      const n = Number(r.publicaciones) || 0;
      html += `<article class="reco-tarjeta reco-redactor">
        <div class="reco-avatar-caja">
          <div class="reco-avatar">${r.avatar_url ? `<img src="${escapeHtml(r.avatar_url)}" alt="" width="88" height="88" loading="lazy" decoding="async">` : inicial}</div>
          <span class="reco-medalla" aria-hidden="true">${iconoTrofeo}</span>
        </div>
        <div class="reco-cuerpo">
          <p class="reco-etiqueta">${iconoTrofeo} Redactor/a del mes</p>
          <h3 class="reco-nombre">${enlaceAutor(r.id, r.nombre)}</h3>
          ${n ? `<p class="reco-dato">${n} ${n === 1 ? "publicación" : "publicaciones"} en ${escapeHtml(mesTexto)}</p>` : ""}
        </div>
      </article>`;
    }
    if (d.foto) {
      const f = d.foto;
      html += `<article class="reco-tarjeta reco-foto">
        <span class="reco-imagen"><img src="${escapeHtml(f.url)}" alt="${escapeHtml(f.titulo || `Foto del mes de ${mesTexto}`)}" width="640" height="400" loading="lazy" decoding="async"></span>
        <div class="reco-cuerpo">
          <p class="reco-etiqueta">${iconoCamara} Foto del mes</p>
          ${f.titulo ? `<h3 class="reco-nombre">${escapeHtml(f.titulo)}</h3>` : ""}
          ${f.autor_nombre ? `<p class="reco-dato">Foto de ${enlaceAutor(f.autor_id, f.autor_nombre)}</p>` : ""}
        </div>
      </article>`;
    }
    seccion.hidden = false;
    seccion.innerHTML = `
      <div class="section-title-row"><h2 class="section-title">Reconocimiento del mes</h2></div>
      <p class="reconocimiento-sub">Lo mejor de ${escapeHtml(mesTexto)} en El Otro Fútbol</p>
      <div class="reconocimiento-grid${d.redactor && d.foto ? "" : " reconocimiento-una"}">${html}</div>`;
  } catch (err) {
    console.error("Error cargando el reconocimiento del mes:", err);
    seccion.hidden = true;
  }
}

// ---------- Bloques por competición (portada) ----------
// Un bloque por competición con sus últimas noticias (una destacada + tres
// en lista) y enlace a la página de la competición. Se saltan las noticias
// ya pintadas en otros módulos y los bloques sin noticias no salen.
const BLOQUES_COMPETICION = [
  "hypermotion",
  "primera_federacion",
  "segunda_federacion",
  "tercera_federacion",
  "copa_del_rey",
  "copa_federacion",
];
const BLOQUE_COMPETICION_NOTICIAS = 4;

async function cargaBloquesCompeticion() {
  const cont = document.getElementById("bloques-competicion");
  if (!cont) return;
  const excluir = portadaExcluirParam();
  const respuestas = await Promise.allSettled(BLOQUES_COMPETICION.map((cat) =>
    conReintento(async () => {
      const res = await apiFetch(`/api/articles?categoria=${encodeURIComponent(cat)}&limit=${BLOQUE_COMPETICION_NOTICIAS + 2}${excluir}`);
      const datos = await res.json();
      // Si todas las noticias de la competición ya salen en el hero o en
      // "Noticias recientes", el bloque desaparecía aunque hubiera noticias.
      // En ese caso se piden sin excluir para que la competición siempre
      // tenga su bloque.
      if (excluir && !(datos.articles || []).length) {
        const res2 = await apiFetch(`/api/articles?categoria=${encodeURIComponent(cat)}&limit=${BLOQUE_COMPETICION_NOTICIAS}`);
        const d2 = await res2.json();
        d2._sinExcluir = true;
        return d2;
      }
      return datos;
    })
  ));
  const bloques = [];
  respuestas.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    // Se evita repetir una noticia entre dos bloques seguidos.
    const lista = (r.value.articles || []).filter((a) => r.value._sinExcluir || !PORTADA_VISTOS.has(a.id)).slice(0, BLOQUE_COMPETICION_NOTICIAS);
    if (!lista.length) return;
    portadaRegistrar(lista);
    bloques.push({ cat: BLOQUES_COMPETICION[i], lista });
  });
  if (!bloques.length) { cont.innerHTML = ""; return; }
  cont.innerHTML = bloques.map(({ cat, lista }) => {
    const logo = categoriaLogo(cat);
    const [principal, ...resto] = lista;
    return `
      <section class="bloque-comp" aria-labelledby="bloque-${cat}">
        <div class="bloque-comp-cab">
          <h2 class="section-title" id="bloque-${cat}">
            ${logo ? `<span class="bloque-comp-logo-caja"><img class="bloque-comp-logo" src="${logo}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'"></span>` : ""}${escapeHtml(categoriaLabel(cat))}
          </h2>
          <a class="bloque-comp-ver" href="categoria?cat=${encodeURIComponent(cat)}">Ver todo →</a>
        </div>
        <div class="bloque-comp-grid${resto.length ? "" : " bloque-comp-solo"}">
          <div class="bloque-comp-principal">${cardHTML(principal)}</div>
          ${resto.length ? `<div class="bloque-comp-lista">${resto.map((a) => filaNoticiaHTML(a)).join("")}</div>` : ""}
        </div>
      </section>`;
  }).join("");
}

// ---------- En vivo / Próximos partidos / Últimos resultados (portada) ----------
// La portada separa los partidos en tres secciones independientes, en
// este orden: "Partidos en vivo" (TODOS los que estén "en juego" ahora
// mismo, para que no se pierda ninguno en directo; la sección entera se
// oculta si no hay ninguno), "Próximos partidos" (los siguientes por
// jugar) y "Últimos resultados" (los finalizados más recientes).
const RESULTADOS_HOME_PROGRAMADOS = 6;
const RESULTADOS_HOME_FINALIZADOS = 6;

// La portada solo debe mostrar partidos de competiciones que cubrimos
// al completo (LaLiga Hypermotion y Primera Federación) o, dentro de
// Segunda Federación, solo los partidos que involucran a alguno de los
// 9 equipos que sí tenemos cubiertos editorialmente (ver clubs.js,
// CLUBS_SEGUNDA_FEDERACION_CUBIERTOS_PORTADA: Conquense, Guadalajara,
// Linares, Numancia, Recreativo de Huelva, Talavera, Badajoz, Utebo FC y Reus FC Reddis). El
// resto de partidos de Segunda Federación (los ~81 equipos restantes de
// los 5 grupos que puedan estar cargados en la base de datos para
// Calendario/Clasificación, aunque no los cubramos con noticias) no
// deben aparecer en portada. Importante: esto usa
// CLUBS_SEGUNDA_FEDERACION_CUBIERTOS_PORTADA y NO
// getClubsForCategoria("segunda_federacion")/CLUBS_BY_CATEGORY, que
// siguen teniendo los 90 equipos completos para no romper los
// desplegables de creación de noticias del panel de admin.
//
// Se compara por un nombre "núcleo" (minúsculas, sin tildes, sin siglas
// de club ni la palabra "de") en vez de por igualdad exacta, porque el
// nombre de equipo guardado en el partido no siempre coincide letra por
// letra con el nombre "oficial" de clubs.js (p.ej. "Numancia" vs "CD
// Numancia", o "Recreativo Huelva" vs "Recreativo de Huelva").
function nucleoNombreClub(nombre) {
  return normalizarTextoBusquedaClub(nombre)
    .replace(/\b(cd|cf|ub|rc|rcd|ud|sd|ca|cp|club deportivo|club de futbol)\b/g, "")
    .replace(/\bde\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const COMPETICIONES_PORTADA = ["hypermotion", "primera_federacion"];

function filtrarParaPortada(results) {
  const nucleosSegundaFederacionCubiertos = new Set(
    CLUBS_SEGUNDA_FEDERACION_CUBIERTOS_PORTADA.map(nucleoNombreClub)
  );
  return results.filter(r => {
    if (COMPETICIONES_PORTADA.includes(r.competicion)) return true;
    if (r.competicion === "segunda_federacion") {
      return nucleosSegundaFederacionCubiertos.has(nucleoNombreClub(r.equipo_local)) ||
        nucleosSegundaFederacionCubiertos.has(nucleoNombreClub(r.equipo_visitante));
    }
    return false; // amistosos u otras competiciones futuras: fuera de portada
  });
}

async function cargaResultadosHome() {
  const seccionEnVivo = document.getElementById("seccion-en-vivo-home");
  const contEnVivo = document.getElementById("en-vivo-home");
  const contProximos = document.getElementById("proximos-home");
  const contResultados = document.getElementById("resultados-home");
  contProximos.innerHTML = spinnerHTML();
  contResultados.innerHTML = spinnerHTML();
  try {
    // Reintento automático conjunto: las 3 peticiones van en paralelo, así
    // que si UNA sola falla (p.ej. coincide con el circuito abriéndose)
    // se repiten las 3 tras una breve espera en vez de dejar la portada a
    // medias o mostrar el estado de error por un fallo puntual.
    // Se piden también los clubes "personalizados" (añadidos desde el
    // panel, no los fijos de clubs.js) en el mismo Promise.all: hace falta
    // esperarlos antes de filtrarParaPortada, o los equipos de Segunda
    // Federación que solo estén en custom_clubs (y no en la lista fija de
    // clubs.js) quedarían fuera de portada aunque sí los cubramos.
    const { enJuego, programados, anulados, finalizados } = await conReintento(async () => {
      const [resEnJuego, resProgramados, resFinalizados, resAnulados] = await Promise.all([
        apiFetch(`/api/results?estado=en_juego`),
        apiFetch(`/api/results?estado=programado&orden=cercania&limit=150`),
        apiFetch(`/api/results?estado=finalizado`),
        // Anulados: se enseñan como "por jugar" (pendientes de reprogramar).
        // Si esta petición fallara, la portada sigue funcionando sin ellos.
        apiFetch(`/api/results?estado=anulado&limit=60`).catch(() => null),
        cargarCustomClubs(),
      ]);
      const { results: enJuego = [] } = await resEnJuego.json();
      const { results: programados = [] } = await resProgramados.json();
      const { results: finalizados = [] } = await resFinalizados.json();
      let anulados = [];
      try { anulados = (resAnulados && resAnulados.ok ? (await resAnulados.json()).results : []) || []; } catch (e) { anulados = []; }
      return { enJuego, programados, anulados, finalizados };
    });

    // Cada sección se ordena cronológicamente por separado:
    // ordenarPartidosCronologicamente (partidos.js) ya resuelve tanto
    // "próximo primero" como "más reciente primero" según el estado de
    // cada partido. Antes de ordenar, se filtran fuera los partidos que
    // no deben aparecer en portada (ver filtrarParaPortada más arriba).
    const enJuegoOrdenados = ordenarPartidosCronologicamente(filtrarParaPortada(enJuego));
    // "Próximos partidos": los más cercanos a la fecha actual. La API se pide con
    // orden=cercania para que su LIMIT recorte lo más lejano y no lo más
    // próximo (sin él, el orden es fecha DESC y los próximos quedaban fuera
    // del recorte). Además se descartan los "programados" cuya hora ya pasó
    // hace mucho (partidos que nunca se actualizaron): si no, saldrían
    // arriba como si fueran lo próximo. Se deja un margen de 3 h por si un
    // partido empieza tarde y aún no se ha marcado como en juego.
    const limitePasado = Date.now() - 3 * 60 * 60 * 1000;
    const programadosVigentes = programados.filter((p) => {
      const t = timestampFechaPartido(p);
      return isNaN(t) || t >= limitePasado;
    });
    // Los partidos anulados siguen "por jugar" mientras no se reprogramen:
    // salen al final de próximos partidos, con su cinta de "Pendiente de
    // reprogramar". Solo los de los últimos 60 días (o sin fecha), para
    // que uno anulado hace meses y nunca reprogramado no se quede
    // eternamente en portada, y como mucho 4 para no desplazar a los que
    // sí tienen fecha.
    const limiteAnulados = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const anuladosVigentes = ordenarPartidosCronologicamente(
      filtrarParaPortada(anulados).filter((p) => {
        const t = timestampFechaPartido(p);
        return isNaN(t) || t >= limiteAnulados;
      })
    ).slice(0, 4);
    const proximosConFecha = ordenarPartidosCronologicamente(filtrarParaPortada(programadosVigentes))
      .slice(0, Math.max(RESULTADOS_HOME_PROGRAMADOS - anuladosVigentes.length, 0));
    const proximosOrdenados = [...proximosConFecha, ...anuladosVigentes];
    const finalizadosOrdenados = ordenarPartidosCronologicamente(filtrarParaPortada(finalizados)).slice(0, RESULTADOS_HOME_FINALIZADOS);

    // Guardamos todos los partidos mostrados para poder abrir el modal
    // de detalle al hacer clic, igual que en la página de resultados.
    PARTIDOS_CACHE = {};
    [...enJuegoOrdenados, ...proximosOrdenados, ...finalizadosOrdenados].forEach(r => { PARTIDOS_CACHE[r.id] = r; });

    // "Partidos en vivo": la sección entera se oculta si no hay ninguno,
    // para no dejar un hueco vacío en portada la mayor parte del tiempo.
    if (enJuegoOrdenados.length) {
      seccionEnVivo.hidden = false;
      contEnVivo.innerHTML = `
        <div class="tabla-jornada">
          ${enJuegoOrdenados.map((p) => partidoHTML(p, { mostrarCompeticion: true })).join("")}
        </div>`;
      inicializarClicsPartidos("en-vivo-home");
    } else {
      seccionEnVivo.hidden = true;
      contEnVivo.innerHTML = "";
    }

    // "Próximos partidos"
    if (proximosOrdenados.length) {
      contProximos.innerHTML = `
        <div class="tabla-jornada">
          ${proximosOrdenados.map((p) => partidoHTML(p, { mostrarCompeticion: true })).join("")}
        </div>`;
      inicializarClicsPartidos("proximos-home");
    } else {
      contProximos.innerHTML = estadoHTML({
        titulo: "No hay próximos partidos programados",
        texto: "En cuanto se programen los siguientes encuentros, los verás aquí.",
      });
    }

    // "Últimos resultados"
    if (finalizadosOrdenados.length) {
      contResultados.innerHTML = `
        <div class="tabla-jornada">
          ${finalizadosOrdenados.map((p) => partidoHTML(p, { mostrarCompeticion: true })).join("")}
        </div>`;
      inicializarClicsPartidos("resultados-home");
    } else {
      contResultados.innerHTML = estadoHTML({
        titulo: "Todavía no hay resultados",
        texto: "En cuanto se disputen los primeros partidos, verás aquí los marcadores.",
      });
    }
  } catch (err) {
    console.error("Error cargando resultados de portada:", err);
    seccionEnVivo.hidden = true;
    const errorHTML = estadoHTML({
      titulo: "No se ha podido conectar",
      texto: "Ha habido un problema al cargar los resultados. Comprueba tu conexión e inténtalo de nuevo.",
      tipo: "error",
      cta: `<a href="javascript:location.reload()" class="btn-volver">Reintentar</a>`,
    });
    contProximos.innerHTML = errorHTML;
    contResultados.innerHTML = errorHTML;
  }
}

// ---------- Encuestas destacadas en portada ----------
// Puede haber varias a la vez (ordenadas por orden_portada desde el
// backend); cada una se pinta como un widget independiente reutilizando
// encuestaWidgetHTML/pintarEncuesta (ver js/encuestas.js), igual que la
// encuesta de una noticia concreta.
async function cargaEncuestasPortada() {
  const seccion = document.getElementById("seccion-encuestas-portada");
  try {
    const res = await apiFetchLector(`/api/polls/portada`);
    const { encuestas = [] } = await res.json();
    if (!encuestas.length) { seccion.hidden = true; return; }

    seccion.hidden = false;
    // data-n deja que el CSS adapte la rejilla a cuántas encuestas hay
    // (1 = tarjeta ancha, 2 = dos columnas, 3 = tres...). Ver css/encuestas.css.
    seccion.dataset.n = encuestas.length;
    seccion.innerHTML = `
      <h2 class="section-title">${encuestas.length === 1 ? "Encuesta" : "Encuestas"}</h2>
      <div class="encuestas-portada-grid" data-n="${encuestas.length}">
        ${encuestas.map(e => `<div id="encuestaPortada_${e.id}"></div>`).join("")}
      </div>`;

    encuestas.forEach(encuesta => {
      const cont = document.getElementById(`encuestaPortada_${encuesta.id}`);
      if (cont) pintarEncuesta(cont, encuesta, "cargaEncuestasPortada");
    });
  } catch (err) {
    console.error("Error cargando encuestas de portada:", err);
    // No es contenido esencial de la portada: si falla, simplemente no
    // se muestra la sección, sin bloquear el resto de la página.
    seccion.hidden = true;
  }
}

function cardHTML(a) {
  // El foco sale de la foto que realmente se muestra (la portada o, si solo
  // hay collage, la primera foto del collage): ver js/foco.js.
  const portada = EOF_FOCO.portadaDeArticulo(a);
  const img = portada.url ? cloudinaryOptimizada(portada.url, 500) : "img/default.jpg";
  return `
    <a class="card" data-art-id="${Number(a.id) || ''}" href="${urlNoticia(a.categoria, a.slug)}">
      ${EOF_FOCO.img({ src: img, alt: a.titulo, foco: portada.foco })}
      <div class="cbody">
        ${contextoNoticiaHTML(a)}
        <h3>${escapeHtml(a.titulo)}</h3>
        <p>${escapeHtml(resumText(a.subtitulo || a.contenido, 110))}</p>
        <span class="meta">${formatFecha(a.fecha_publicacion)}${a.autor_nombre ? " · " + escapeHtml(a.autor_nombre) + (a.coautor_nombre ? " y " + escapeHtml(a.coautor_nombre) : "") : ""}</span>
      </div>
    </a>`;
}

// Pinta el hero (1 principal + 4 secundarias). Se usa en la carga inicial y en
// las actualizaciones en directo (ver refrescarPortadaEnVivo).
function pintarHero(destacados, ultimas) {
  const hero = document.getElementById("hero");
  // Las que van a salir en el hero se marcan como ya vistas (ver
  // PORTADA_VISTOS) para que "Noticias recientes" y el resto de módulos
  // no las repitan. Se calcula más abajo, junto a "secundarias".
  let idsHero = [];
  PORTADA_HERO.clear();
  if (destacados.length > 0) {
    const principal = destacados[0];
    const portadaPrincipal = EOF_FOCO.portadaDeArticulo(principal);
    // Si no hay suficientes destacadas, se completa con las últimas
    // noticias, pero evitando repetir la que ya es la principal.
    const candidatasExtra = ultimas.filter(a => a.id !== principal.id);
    const secundariasDestacadas = destacados.slice(1, 5);
    const secundarias = secundariasDestacadas.length >= 4
      ? secundariasDestacadas
      : [...secundariasDestacadas, ...candidatasExtra.filter(a => !secundariasDestacadas.some(s => s.id === a.id))].slice(0, 4);
    idsHero = [principal, ...secundarias];
    hero.innerHTML = `
      <a class="hero-principal" href="${urlNoticia(principal.categoria, principal.slug)}">
        ${EOF_FOCO.img({ src: portadaPrincipal.url ? cloudinaryOptimizada(portadaPrincipal.url, 900) : "img/default.jpg", alt: principal.titulo, foco: portadaPrincipal.foco, eager: true, fallback: "oculto" })}
        <div class="overlay">
          <div>
            ${contextoNoticiaHTML(principal, { variante: "hero" })}
            <h1>${escapeHtml(principal.titulo)}</h1>
            <p>${escapeHtml(resumText(principal.subtitulo || principal.contenido, 160))}</p>
          </div>
        </div>
      </a>
      <div class="hero-secundarias">
        ${secundarias.map(s => `
          <a class="mini-card" href="${urlNoticia(s.categoria, s.slug)}">
            ${(() => { const p = EOF_FOCO.portadaDeArticulo(s); return EOF_FOCO.img({ src: p.url ? cloudinaryOptimizada(p.url, 300) : "img/default.jpg", alt: s.titulo, foco: p.foco }); })()}
            <div>
              ${contextoNoticiaHTML(s, { variante: "compacta" })}
              <h3>${escapeHtml(s.titulo)}</h3>
            </div>
          </a>`).join("")}
      </div>`;
  } else {
    hero.innerHTML = estadoHTML({
      titulo: "Todavía no hay noticias destacadas",
      texto: "En cuanto publiquemos las primeras crónicas y noticias, las verás destacadas justo aquí.",
    });
  }
  portadaRegistrar(idsHero);
  idsHero.forEach((a) => { if (a && a.id != null) PORTADA_HERO.add(a.id); });
  return idsHero;
}

async function cargaPortada() {
  try {
    // 5 noticias destacadas en total: 1 grande (principal) + 4 pequeñas
    // a la derecha. Reintento automático conjunto, igual que en las
    // demás cargas de portada.
    // Si index.html ya lanzó las dos peticiones en el <head> (window.__eofPortada),
    // se aprovechan en el primer intento: así el hero no espera a que se
    // descarguen los scripts. Si fallan, se sigue por el camino normal
    // (timeout, failover a la API secundaria y reintento).
    let precarga = window.__eofPortada || null;
    window.__eofPortada = null;
    const { destacados, ultimas } = await conReintento(async () => {
      if (precarga) {
        const usada = precarga;
        precarga = null;
        try {
          const [d, u] = await Promise.all([usada.destacados, usada.ultimas]);
          return { destacados: (d && d.articles) || [], ultimas: (u && u.articles) || [] };
        } catch (e) { /* cae al camino normal */ }
      }
      const [destacadosRes, ultimasRes] = await Promise.all([
        apiFetch(`/api/articles?destacado=1&limit=5`).then(r => r.json()),
        apiFetch(`/api/articles?limit=8`).then(r => r.json()),
      ]);
      return {
        destacados: destacadosRes.articles || [],
        ultimas: ultimasRes.articles || [],
      };
    });

    pintarHero(destacados, ultimas);
    if (window.EOF_VIVO) {
      VIVO_PORTADA.firmaHero = firmaHeroPortada(destacados, ultimas);
      VIVO_PORTADA.firmaUltimas = firmaArticulos(ultimas);
    }
    return { ultimas };
  } catch (err) {
    console.error("Error cargando portada:", err);
    document.getElementById("hero").innerHTML = estadoHTML({
      titulo: "No se ha podido conectar",
      texto: "Ha habido un problema al cargar la portada. Comprueba tu conexión e inténtalo de nuevo.",
      tipo: "error",
      cta: `<a href="javascript:location.reload()" class="btn-volver">Reintentar</a>`,
    });
    return { ultimas: [] };
  }
}
