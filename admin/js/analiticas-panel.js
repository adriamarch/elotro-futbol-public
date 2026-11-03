/* =========================================================
   Pestaña "Analíticas" del panel (admin/panel.html > #panel-analiticas).
   Antes era la página suelta public/panel-analiticas.html, que se recargaba
   entera al entrar y al salir. Ahora el marcado vive en panel.html y este
   archivo se carga UNA vez, la primera vez que se abre la pestaña
   (ver eofAbrirAnaliticas() en admin.js): al cambiar de pestaña y volver, los
   datos y los gráficos se quedan como estaban.

   Va envuelto en una función para no chocar con los nombres globales de
   admin.js (aquí hay funciones como formatMiles, cargarTodo, etc.).
   Solo se expone window.eofAnaliticasPanel.abrir().
   ========================================================= */
(function () {

/* =========================================================
   ESTADO GLOBAL
   ========================================================= */

let diasActuales = 28;

let chartEvolucion = null;
let chartPvVisitas = null;
let chartGsc = null;
let ultimaSerieGsc = null;
let chartHoras = null;
let chart24h = null;
let chartNr = null;


/* =========================================================
   UTILIDADES
   ========================================================= */

function formatMiles(numero){

  const n = Number(numero || 0);

  return n.toLocaleString('es-ES');
}


function formatSegundos(segundos){

  const n = Math.round(Number(segundos || 0));

  if (!n) {
    return '0s';
  }

  const minutos = Math.floor(n / 60);
  const segundosRestantes = n % 60;

  if (minutos <= 0) {
    return `${segundosRestantes}s`;
  }

  return `${minutos}m ${segundosRestantes}s`;
}


function iniciales(nombre){

  if (!nombre) {
    return '?';
  }

  return nombre
    .trim()
    .split(/\s+/)
    .slice(0,2)
    .map(x => x[0])
    .join('')
    .toUpperCase();
}


// Muestra un mensaje de error discreto dentro de una tarjeta cuando su
// petición a la API falla, en vez de dejar el "Cargando..." colgado para
// siempre sin ninguna pista de qué ha pasado. selector puede ser el id
// de un elemento de contenido (ej. "#autoresLista") o, si la tarjeta
// tiene un <canvas> (los gráficos), el id de ese canvas: en ese caso el
// mensaje se inserta en su lugar dentro de la misma tarjeta.
function marcarErrorSeccion(selector, mensaje){

  const el = document.querySelector(selector);
  if (!el) return;

  const html = `
    <div style="
      display:flex;
      align-items:center;
      gap:8px;
      padding:14px;
      color:var(--rojo-oscuro);
      background:rgba(209,19,46,.06);
      border:1px solid rgba(209,19,46,.18);
      border-radius:6px;
      font-size:.82rem;
    ">
      <span>⚠️</span>
      <span>${escapeHtml(String(mensaje ?? ''))}</span>
    </div>
  `;

  if (el.tagName === 'CANVAS'){
    // Antes se reemplazaba TODO el contenido del contenedor (canvas
    // incluido): tras un fallo puntual (p. ej. un 503) el <canvas> ya no
    // existía y el gráfico no se podía volver a pintar sin recargar la
    // página. Ahora el canvas solo se oculta y el aviso va a su lado;
    // restaurarCanvas() lo deshace al reintentar.
    const contenedor = el.closest('.chart-box') || el.parentElement;
    if (!contenedor) return;
    el.style.display = 'none';
    let aviso = contenedor.querySelector(':scope > .msg-error-seccion');
    if (!aviso){
      aviso = document.createElement('div');
      aviso.className = 'msg-error-seccion';
      contenedor.appendChild(aviso);
    }
    aviso.innerHTML = html;
    return;
  }

  el.innerHTML = html;
}

// Deshace marcarErrorSeccion() sobre un canvas: lo vuelve a mostrar y
// quita el aviso de error. Se llama al empezar cada carga de un gráfico.
function restaurarCanvas(id){
  const canvas = document.getElementById(id);
  if (!canvas) return;
  canvas.style.display = '';
  const contenedor = canvas.closest('.chart-box') || canvas.parentElement;
  if (!contenedor) return;
  contenedor.querySelectorAll(':scope > .msg-error-seccion').forEach(n => n.remove());
}


function categoriaLabel(categoria){

  const labels = {

    hypermotion: 'Hypermotion',

    primera_federacion: '1ª Federación',

    segunda_federacion: '2ª Federación',
    copa_del_rey: 'Copa del Rey',
    copa_federacion: 'Copa Federación',

    general: 'General',

    amistoso: 'Amistosos',

    arbitraje: 'Arbitraje',

    jurisdiccion: 'Jurisdicción deportiva'

  };

  return labels[categoria] || categoria;
}


/* =========================================================
   API
   ========================================================= */

// El guard de sesión (sin token -> login) ya lo hace admin.js al cargar
// panel.html; aquí solo se relee el token en cada petición (puede
// renovarse mientras el panel está abierto), igual que hace TOKEN_ACTUAL().
function tokenActual(){
  return (typeof TOKEN_ACTUAL === 'function') ? TOKEN_ACTUAL() : localStorage.getItem('eof_token');
}

async function apiFetchAnaliticasRed(url, opciones = {}){

  try{

    // OJO: antes esto era un fetch(url, ...) con "url" como ruta
    // relativa (p.ej. "/api/admin/analiticas/resumen?dias=28"), que el
    // navegador resolvía contra ESTE mismo dominio (elotrofutbol.media,
    // el sitio estático) en vez de contra la API -- de ahí que devolviera
    // siempre 404 (la página 404 del propio sitio, no un error de la
    // API). window.eofApiFetch (definido en js/config.js, cargado en el
    // <head>) resuelve la URL base correcta (api.elotrofutbol.media, con
    // failover a la secundaria de Railway) y aquí solo hace falta añadir
    // la cabecera de autenticación, igual que hace apiFetch() en
    // public/admin/js/admin.js.
    const response = await window.eofApiFetch(url, {
      ...opciones,
      headers:{
        'Accept':'application/json',
        'Content-Type':'application/json',
        'Authorization': `Bearer ${tokenActual()}`,
        ...(opciones.headers || {})
      }
    });

    if (response.status === 401){
      location.href = "/admin/login.html";
      return null;
    }

    if (!response.ok){

      const cuerpo = await response.json().catch(() => ({}));
      const err = new Error(cuerpo.error || `HTTP ${response.status} — ${response.statusText}`);
      err.status = response.status;
      throw err;

    }

    return await response.json();

  }catch(error){

    console.error(
      `Error solicitando ${url}:`,
      error
    );

    // 503 = cortacircuitos de cuota del servidor: se avisa con su mensaje
    // real (antes cada tarjeta mostraba un genérico "No se pudo cargar").
    if (error && error.status === 503) avisarLimiteAnaliticas(error.message);

    // Las llamadas "silenciosas" (todas las de solo-lectura del panel,
    // que ya comprueban "if (!data) marcarErrorSeccion(...)") esperan
    // null en vez de una excepción. Las acciones que sí necesitan saber
    // qué ha fallado exactamente (borrar datos, guardar la integración
    // con Google) pasan { lanzarError:true } y reciben la excepción tal
    // cual para poder mostrar error.message.
    if (opciones.lanzarError) throw error;
    return null;

  }

}

// ---------------------------------------------------------------------
// Caché en memoria + deduplicación de peticiones GET.
// Chart.js (carga tardía), el cambio de tema claro/oscuro y las
// recargas de cada tarjeta volvían a pedir las mismas rutas una y otra
// vez, y cada una cuenta contra la cuota de la base de datos del
// servidor. Aquí una misma URL se pide una sola vez cada 5 minutos
// (60 s la de últimas 24 h) y las peticiones simultáneas comparten
// respuesta. Las respuestas nulas o con error nunca se guardan.
// ---------------------------------------------------------------------
const CACHE_API_ANALITICAS = new Map();
const TTL_CACHE_API_ANALITICAS_MS = 5 * 60 * 1000;
const TTL_CACHE_API_24H_MS = 60 * 1000;

function limpiarCacheAnaliticas(){
  CACHE_API_ANALITICAS.clear();
}

let ultimoAvisoLimiteAnaliticas = 0;
function avisarLimiteAnaliticas(mensaje){
  const ahora = Date.now();
  if (ahora - ultimoAvisoLimiteAnaliticas < 30000) return;
  ultimoAvisoLimiteAnaliticas = ahora;
  window.EOF?.toast?.(mensaje || 'Panel de analíticas temporalmente limitado. Inténtalo de nuevo en unos minutos.', 'error');
}

async function apiFetchAnaliticas(url, opciones = {}){

  const metodo = String(opciones.method || 'GET').toUpperCase();
  const cacheable = metodo === 'GET' && !opciones.sinCache && !url.includes('/buscar-noticia');

  if (!cacheable) return apiFetchAnaliticasRed(url, opciones);

  const ttl = url.includes('/ultimas-24h') ? TTL_CACHE_API_24H_MS : TTL_CACHE_API_ANALITICAS_MS;
  const previa = CACHE_API_ANALITICAS.get(url);
  if (previa && Date.now() - previa.t < ttl) return previa.promesa;

  const promesa = apiFetchAnaliticasRed(url, opciones).then(
    datos => {
      if (datos === null || (datos && datos.error)) CACHE_API_ANALITICAS.delete(url);
      return datos;
    },
    error => {
      CACHE_API_ANALITICAS.delete(url);
      throw error;
    }
  );

  CACHE_API_ANALITICAS.set(url, { t: Date.now(), promesa });
  return promesa;
}


/* =========================================================
   CHART.JS SEGURO
   ========================================================= */

async function esperarChart(){

  try{

    if (window.Chart){
      return true;
    }

    if (window.__chartJsReady){
      return await window.__chartJsReady;
    }

  }catch(error){

    console.warn(
      'No se pudo cargar Chart.js:',
      error
    );

  }

  return !!window.Chart;
}


/* =========================================================
   COLORES DE CHART.JS SEGÚN EL TEMA (claro/oscuro)
   ========================================================= */

// Chart.js dibuja con colores fijos que hay que pasarle en JS (no se
// puede simplemente poner "var(--texto)" en las opciones), así que no
// basta con las variables CSS de arriba para que los gráficos se vean
// bien en modo oscuro: la rejilla y algunas líneas usaban colores
// pensados solo para fondo claro (un gris casi blanco para la rejilla,
// un marino casi negro para una de las líneas), invisibles sobre el
// fondo oscuro del panel. Esta función centraliza los colores que sí
// dependen del tema, leyéndolos en el momento de dibujar cada gráfico
// (nunca se cachean) para que cambien en cuanto se activa/desactiva el
// oscuro sin tener que recargar la página.
function coloresChart(){
  const oscuro = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    oscuro,
    // Línea/barra "Páginas vistas": en claro es el marino de marca
    // (casi negro), que se aclara en oscuro para no perderse sobre el
    // fondo oscuro; el resto de series de marca (celeste, verde, rojo)
    // ya tienen suficiente contraste en los dos modos y no cambian.
    lineaOscura: oscuro ? '#a8dcf5' : '#0c1b2e',
    rellenoLineaOscura: oscuro ? 'rgba(168,220,245,.10)' : 'rgba(12,27,46,.06)',
    rejilla: oscuro ? '#2a3242' : '#eef1f5',
    texto: oscuro ? '#9aa4b8' : '#5a6270',
  };
}

// Aplica los colores de texto/rejilla de coloresChart() a un objeto de
// "options" de Chart.js, tocando solo lo que no se haya definido ya
// explícitamente (así cada gráfico puede seguir fijando sus propios
// colores de serie sin que esta función se los pise). Se llama justo
// antes de cada "new Chart(...)".
function aplicarTemaChart(options){
  const { rejilla, texto } = coloresChart();

  options.plugins = options.plugins || {};
  options.plugins.legend = options.plugins.legend || {};
  options.plugins.legend.labels = options.plugins.legend.labels || {};
  if (options.plugins.legend.labels.color === undefined){
    options.plugins.legend.labels.color = texto;
  }

  options.scales = options.scales || {};
  for (const eje of Object.values(options.scales)){
    eje.ticks = eje.ticks || {};
    if (eje.ticks.color === undefined) eje.ticks.color = texto;
    if (eje.title){
      eje.title.color = eje.title.color !== undefined ? eje.title.color : texto;
    }
    // Solo se colorea la rejilla si el propio gráfico no la ha
    // desactivado (display:false) ni le ha puesto ya un color propio.
    if (eje.grid && eje.grid.display !== false && eje.grid.color === undefined){
      eje.grid.color = rejilla;
    }
  }

  return options;
}

// Vuelve a dibujar todos los gráficos ya creados cuando cambia el
// tema (ver el listener más abajo, junto al resto de inicialización),
// para que no haga falta recargar la página al pulsar el botón de
// modo oscuro/claro de la cabecera.
function redibujarGraficosConTemaActual(){
  cargarResumen(diasActuales).catch(() => {});
  cargarHoras(diasActuales).catch(() => {});
  cargarNoticiasRapidas(diasActuales).catch(() => {});
  cargarComparativaMensual().catch(() => {});
  cargar24h().catch(() => {});
  if (typeof cargarGsc === 'function'){
    cargarGsc(diasActuales).catch(() => {});
  }
}

// El botón de modo oscuro/claro de la cabecera (ver
// public/js/layout.js -> inicializarToggleTema) solo cambia el
// atributo data-theme en <html>; no dispara ningún evento propio que
// este panel pueda escuchar. Un MutationObserver sobre ese atributo es
// la forma más sencilla de enterarse del cambio sin tener que tocar
// layout.js (compartido por todo el sitio) ni duplicar el botón.
function inicializarObservadorTema(){
  const observador = new MutationObserver(() => {
    redibujarGraficosConTemaActual();
  });
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}


/* =========================================================
   DELTAS (comparativa con el periodo anterior equivalente)
   ========================================================= */

// El endpoint /resumen no admite un rango de fechas arbitrario, solo
// "últimos N días" (ver worker/src/index.js). Para poder mostrar el
// delta del selector "▲/▼ vs periodo anterior" sin tocar el backend,
// se pide también el resumen de los últimos 2*dias días y se resta la
// evolución diaria ya incluida en la respuesta para reconstruir el
// periodo [2*dias, dias) como "periodo anterior".
function sumarEvolucion(evolucion, campo){
  return (evolucion || []).reduce(
    (acc, fila) => acc + Number(fila[campo] || 0),
    0
  );
}

function calcularPeriodoAnterior(dataDoble, dias, dataActual){
  // Caso "24h": evolucion_diaria agrupa por fecha de calendario, que no
  // sirve para recortar horas exactas dentro de un mismo día. Aquí, en
  // vez de recortar por fecha, se resta directamente: dataDoble ya trae
  // el acumulado de las últimas 48h, así que el periodo anterior (las
  // 24h justo antes de las últimas 24h) es ese acumulado menos el actual.
  if (dias === 1){
    return {
      vistas: Math.max(0, (dataDoble?.vistas || 0) - (dataActual?.vistas || 0)),
      visitantes: Math.max(0, (dataDoble?.visitantes || 0) - (dataActual?.visitantes || 0)),
    };
  }
  const evolucion = dataDoble && dataDoble.evolucion_diaria || [];
  // evolucion viene ordenada ASC por fecha; los últimos "dias" días son
  // el periodo actual, los "dias" anteriores a esos son el periodo con
  // el que comparamos.
  const anterior = evolucion.slice(0, Math.max(0, evolucion.length - dias));
  return {
    vistas: sumarEvolucion(anterior, 'vistas'),
    visitantes: sumarEvolucion(anterior, 'visitantes'),
  };
}

function pintarDelta(elId, actual, anterior, { invertirColor = false } = {}){
  const el = document.getElementById(elId);
  if (!el) return;

  actual = Number(actual || 0);
  anterior = Number(anterior || 0);

  if (!anterior){
    el.textContent = 'Sin datos del periodo anterior';
    el.className = 'delta';
    return;
  }

  const cambio = ((actual - anterior) / anterior) * 100;
  const subio = cambio >= 0;
  // invertirColor: para métricas donde "menos" es mejor no las hay aquí
  // de momento, pero se deja preparado por si se añade alguna (p. ej.
  // rebote) sin tener que reescribir esta función.
  const esPositivo = invertirColor ? !subio : subio;

  el.className = `delta ${esPositivo ? 'up' : 'down'}`;
  el.textContent =
    `${subio ? '▲' : '▼'} ${Math.abs(cambio).toFixed(1)}% vs periodo anterior`;
}


/* =========================================================
   RESUMEN
   ========================================================= */

async function cargarResumen(dias){

  restaurarCanvas('chartEvolucion');

  const data = await apiFetchAnaliticas(
    `/api/admin/analiticas/resumen?dias=${dias}`
  );

  if (!data){
    marcarErrorSeccion('#chartEvolucion', 'No se pudo cargar el resumen.');
    return;
  }


  /* -------------------------------------------------------
     KPIs
     ------------------------------------------------------- */

  document.getElementById('kpiVistas').textContent =
    formatMiles(data.vistas);


  document.getElementById('kpiVisitantes').textContent =
    formatMiles(data.visitantes);


  document.getElementById('kpiTiempo').textContent =
    formatSegundos(data.tiempo_medio_segundos);


  const completitud =
    Number(data.completitud || 0);

  document.getElementById('kpiCompletitud').textContent =
    `${completitud.toFixed(1)}%`;


  /* -------------------------------------------------------
     DELTAS vs periodo anterior
     ------------------------------------------------------- */

  // El servidor devuelve ya el periodo anterior equivalente (data.anterior):
  // una sola petición, y válida también para 90 días (antes se pedía el
  // doble de días, que el servidor capa a 90, y la comparativa quedaba
  // vacía). Si llega una respuesta antigua sin ese campo (caché previa al
  // cambio) se usa el método anterior, solo cuando el doble cabe en 90 días.
  (async () => {

    let anterior = data.anterior || null;
    const comparaTiempos = !!anterior;

    if (!anterior && dias * 2 <= 90){
      const dataDoble = await apiFetchAnaliticas(
        `/api/admin/analiticas/resumen?dias=${dias === 1 ? 2 : dias * 2}`
      );
      if (dataDoble) anterior = calcularPeriodoAnterior(dataDoble, dias, data);
    }

    if (!anterior){
      ['kpiVistasDelta','kpiVisitantesDelta','kpiTiempoDelta','kpiCompletitudDelta']
        .forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = '—';
        });
      return;
    }

    pintarDelta('kpiVistasDelta', data.vistas, anterior.vistas);
    pintarDelta('kpiVisitantesDelta', data.visitantes, anterior.visitantes);

    if (comparaTiempos){
      pintarDelta('kpiTiempoDelta', data.tiempo_medio_segundos, anterior.tiempo_medio_segundos);
      pintarDelta('kpiCompletitudDelta', data.completitud, anterior.completitud);
    }else{
      ['kpiTiempoDelta','kpiCompletitudDelta'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.className = 'delta';
        el.textContent = 'Sin comparativa disponible';
      });
    }

  })().catch(error => {
    console.error('Error calculando deltas de KPIs:', error);
  });


  /* -------------------------------------------------------
     DISPOSITIVOS
     ------------------------------------------------------- */

  const dispositivos =
    data.dispositivos || {};

  const totalDispositivos =
    Object.values(dispositivos)
      .reduce((a,b) => a + Number(b || 0),0) || 1;


  function pct(tipo){

    return Math.round(
      (Number(dispositivos[tipo] || 0) /
      totalDispositivos) * 100
    );

  }


  document.getElementById('dispositivos').innerHTML = `

    <div class="disp-item">

      <div class="icon">
        📱
      </div>

      <div class="pct">
        ${pct('movil')}%
      </div>

      <div class="lbl">
        Móvil
      </div>

    </div>


    <div class="disp-item">

      <div class="icon">
        💻
      </div>

      <div class="pct">
        ${pct('escritorio')}%
      </div>

      <div class="lbl">
        Escritorio
      </div>

    </div>


    <div class="disp-item">

      <div class="icon">
        📟
      </div>

      <div class="pct">
        ${pct('tablet')}%
      </div>

      <div class="lbl">
        Tablet
      </div>

    </div>

  `;


  /* -------------------------------------------------------
     GRÁFICO
     ------------------------------------------------------- */

  const chartDisponible =
    await esperarChart();

  if (!chartDisponible){

    console.warn(
      'Chart.js no disponible. ' +
      'Se muestran las métricas pero no los gráficos.'
    );

    marcarErrorSeccion(
      '#chartEvolucion',
      'No se pudo cargar la librería de gráficos. Las métricas de arriba siguen siendo correctas.'
    );

    return;

  }


  const canvas =
    document.getElementById('chartEvolucion');

  if (!canvas){
    return;
  }


  const evolucion =
    data.evolucion_diaria || [];


  const labels =
    evolucion.map(x => {

      const fecha =
        new Date(`${x.fecha}T00:00:00`);

      return fecha.toLocaleDateString(
        'es-ES',
        {
          day:'2-digit',
          month:'short'
        }
      );

    });


  const visitas =
    evolucion.map(x =>
      Number(x.visitantes || 0)
    );


  const vistas =
    evolucion.map(x =>
      Number(x.vistas || 0)
    );


  if (chartEvolucion){

    try{
      chartEvolucion.destroy();
    }catch(e){}

    chartEvolucion = null;

  }


  chartEvolucion =
    new Chart(canvas, {

      type:'line',

      data:{

        labels,

        datasets:[

          {
            label:'Visitantes',
            data:visitas,
            borderColor:'#5bb8e8',
            backgroundColor:'rgba(91,184,232,.12)',
            tension:.35,
            fill:true,
            pointRadius:2
          },

          {
            label:'Páginas vistas',
            data:vistas,
            borderColor:coloresChart().lineaOscura,
            backgroundColor:coloresChart().rellenoLineaOscura,
            tension:.35,
            fill:true,
            pointRadius:2
          }

        ]

      },

      options:aplicarTemaChart({

        responsive:true,

        maintainAspectRatio:false,

        interaction:{
          mode:'index',
          intersect:false
        },

        plugins:{

          legend:{
            position:'top',

            labels:{
              usePointStyle:true,
              boxWidth:8,
              font:{
                family:'Inter',
                size:11
              }
            }
          }

        },

        scales:{

          x:{
            grid:{
              display:false
            }
          },

          y:{
            beginAtZero:true,
            grid:{}
          }

        }

      })

    });

}


/* =========================================================
   NOTICIAS MÁS LEÍDAS
   ========================================================= */

async function cargarMasLeidas(dias){

  const data =
    await apiFetchAnaliticas(
      `/api/admin/analiticas/mas-leidas?dias=${dias}&limit=10`
    );

  if (!data){
    marcarErrorSeccion('#tablaTop', 'No se pudieron cargar las noticias más leídas.');
    return;
  }


  const noticias =
    data.noticias || [];


  const max =
    Math.max(
      ...noticias.map(n =>
        Number(n.vistas || 0)
      ),
      1
    );


  document.getElementById('tablaTop').innerHTML = `

    <thead>

      <tr>
        <th></th>
        <th>Noticia</th>
        <th>Vistas</th>
      </tr>

    </thead>

    <tbody>

      ${
        noticias.map((n,i) => `

          <tr>

            <td class="rank">
              ${i + 1}
            </td>

            <td>

              <div class="tit-noticia">

                <strong>
                  ${n.titulo || ''}
                </strong>

                <span
                  class="tag-cat"
                  style="margin-top:2px"
                >
                  ${n.categoria || ''}
                </span>

                <span>
                  Por ${n.autor_nombre || 'Redacción'}
                  ·
                  ${formatSegundos(n.tiempo_medio_segundos)}
                  lectura media
                </span>

              </div>

            </td>

            <td>

              <span class="metric-num">
                ${formatMiles(n.vistas)}
              </span>

              <div class="barra-mini">

                <i
                  style="width:${(
                    Number(n.vistas || 0) /
                    max *
                    100
                  ).toFixed(0)}%"
                ></i>

              </div>

            </td>

          </tr>

        `).join('')

        ||

        `
          <tr>

            <td
              colspan="3"
              style="
                text-align:center;
                color:var(--texto-suave);
                padding:20px
              "
            >
              Sin vistas en este periodo
            </td>

          </tr>
        `
      }

    </tbody>

  `;

}


/* =========================================================
   FUENTES DE TRÁFICO
   ========================================================= */

const FUENTE_LABEL = {

  buscador:'Búsqueda orgánica',

  directo:'Directo',

  redes_sociales:'Redes sociales',

  referido:'Referidos',

  interno:'Navegación interna'

};


const FUENTE_ICON = {

  buscador:'🔍',

  directo:'🔗',

  redes_sociales:'📱',

  referido:'↪️',

  interno:'🧭'

};


const FUENTE_COLOR = {

  buscador:'#4285f4',

  directo:'#0c1b2e',

  redes_sociales:'#d1132e',

  referido:'#5bb8e8',

  interno:'#e08a1f'

};


async function cargarFuentes(dias){

  const data =
    await apiFetchAnaliticas(
      `/api/admin/analiticas/fuentes?dias=${dias}`
    );

  if (!data){
    marcarErrorSeccion('#fuentesLista', 'No se pudieron cargar las fuentes de tráfico.');
    return;
  }


  const fuentes =
    data.fuentes || [];


  const total =
    fuentes.reduce(
      (a,f) =>
        a + Number(f.vistas || 0),
      0
    ) || 1;


  document.getElementById('fuentesLista').innerHTML =

    fuentes.map(f => {

      const pct =
        Math.round(
          (Number(f.vistas || 0) /
          total) * 100
        );


      const color =
        FUENTE_COLOR[f.fuente] ||
        '#5a6270';


      return `

        <div class="fuente-row">

          <div
            class="fuente-icon"
            style="background:${color}"
          >
            ${FUENTE_ICON[f.fuente] || '•'}
          </div>

          <div class="fuente-info">

            <div class="nombre">
              ${FUENTE_LABEL[f.fuente] || f.fuente}
            </div>

            <div class="barra-mini">

              <i
                style="
                  width:${pct}%;
                  background:${color}
                "
              ></i>

            </div>

          </div>

          <div class="fuente-pct">
            ${pct}%
          </div>

        </div>

      `;

    }).join('')

    ||

    '<p class="sub">Sin datos en este periodo</p>';


  // ---------- Desglose por dominio (Instagram, X, Google...) ----------
  // data.dominios ya viene agrupado por referer_dominio + fuente desde
  // el backend (ver /api/admin/analiticas/fuentes en el Worker); antes
  // se pedía pero no se pintaba en ningún sitio, así que "Redes
  // sociales" se veía como una única categoría sin decir qué red
  // concreta traía el tráfico. Aquí se listan los dominios reales,
  // coloreados según la categoría a la que pertenecen (mismo
  // FUENTE_COLOR de arriba).
  const dominios = data.dominios || [];
  const contenedorDominios = document.getElementById('fuentesDominiosLista');

  if (!contenedorDominios){
    return;
  }

  if (!dominios.length){
    contenedorDominios.innerHTML = '';
    return;
  }

  contenedorDominios.innerHTML = `
    <div class="titulo-mini">Desglose por dominio de origen</div>
    ${dominios.map(d => {
      const color = FUENTE_COLOR[d.fuente] || '#5a6270';
      const etiquetaCategoria = FUENTE_LABEL[d.fuente] || d.fuente;
      return `
        <div class="dominio-row">
          <div class="dominio-nombre">
            <span class="dominio-badge" style="background:${color}">${etiquetaCategoria}</span>
            ${d.dominio}
          </div>
          <div class="dominio-vistas">${formatMiles(d.vistas)}</div>
        </div>
      `;
    }).join('')}
  `;

}


/* =========================================================
   AUTORES
   ========================================================= */

async function cargarAutores(dias){

  const data =
    await apiFetchAnaliticas(
      `/api/admin/analiticas/autores?dias=${dias}`
    );

  if (!data){
    marcarErrorSeccion('#autoresLista', 'No se pudo cargar el rendimiento por autor.');
    return;
  }


  const autores =
    data.autores || [];

  // La barra se escala contra el mejor autor del periodo (el 100 % de
  // la barra), no contra 100, para que se vean las diferencias aunque
  // todos estén cerca de la media.
  const maxPct =
    Math.max(1, ...autores.filter(a => a.rendimiento_pct != null).map(a => Number(a.rendimiento_pct) || 0));

  const fmt =
    n => Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 1 });

  const filaAutor = (a, i) => {

      const sinDatos = a.rendimiento_pct == null;
      const pct = sinDatos ? 0 : (Number(a.rendimiento_pct) || 0);
      const ancho = sinDatos ? 0 : Math.max(2, pct);

      // Podio: los 3 primeros (siempre que tengan vistas) se destacan
      // con oro / plata / bronce; el resto va en filas normales con
      // su número de posición.
      const puesto = i + 1;
      const enPodio = !sinDatos && puesto <= 3 && Number(a.vistas) > 0;
      const clasePodio = enPodio ? ` podio podio-${puesto}` : '';
      const medalla = enPodio ? ['🥇', '🥈', '🥉'][i] : '';

      return `
      <div class="autor-row${clasePodio}">
        <div class="autor-pos" aria-label="Puesto ${puesto}">${puesto}</div>
        <div class="avatar">
          ${iniciales(a.autor)}
          ${medalla ? `<span class="avatar-medalla" aria-hidden="true">${medalla}</span>` : ''}
        </div>
        <div class="autor-info">
          <div class="nombre">${escapeHtml(a.autor)}</div>
          <div class="stats">
            ${a.noticias} ${a.noticias === 1 ? 'artículo' : 'artículos'}
            · ${fmt(a.vistas)} vistas
            · ${fmt(a.vistas_por_noticia)} por artículo
            · ${formatSegundos(a.tiempo_medio_segundos)} lectura media
            ${a.pocos_articulos ? '· <em>pocos artículos</em>' : ''}
          </div>
          <div class="autor-barra"><span style="width:${ancho}%"></span></div>
        </div>
        <div class="autor-metric">
          <div class="n">${sinDatos ? '—' : pct + '%'}</div>
          <div class="l">${sinDatos ? 'pocos datos' : 'rendimiento'}</div>
        </div>
      </div>`;
  };

  const contenedorAutores = document.getElementById('autoresLista');

  if (!autores.length){
    contenedorAutores.innerHTML = '<p class="sub">Sin datos en este periodo</p>';
    return;
  }

  // Se muestran los 10 primeros; el resto queda plegado tras un botón
  // con flecha. El estado (abierto/cerrado) se recuerda al cambiar de
  // periodo, que vuelve a pintar la lista.
  const TOP_AUTORES = 10;
  const principales = autores.slice(0, TOP_AUTORES);
  const resto = autores.slice(TOP_AUTORES);

  let html = principales.map((a, i) => filaAutor(a, i)).join('');

  if (resto.length){
    const abierto = window.__autoresExpandido === true;
    html += `
      <div class="autores-resto${abierto ? ' abierto' : ''}" id="autoresResto">
        <div class="autores-resto-inner">
          ${resto.map((a, i) => filaAutor(a, i + TOP_AUTORES)).join('')}
        </div>
      </div>
      <button type="button" class="autores-toggle" id="autoresToggle"
              aria-expanded="${abierto}" aria-controls="autoresResto">
        <span class="autores-toggle-txt">${abierto ? 'Ocultar' : 'Ver los ' + resto.length + ' restantes'}</span>
        <svg class="autores-toggle-flecha" viewBox="0 0 24 24" width="18" height="18" fill="none"
             stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
             aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      </button>`;
  }

  contenedorAutores.innerHTML = html;

  const botonToggle = document.getElementById('autoresToggle');
  if (botonToggle){
    botonToggle.addEventListener('click', () => {
      const bloque = document.getElementById('autoresResto');
      const nuevoEstado = !bloque.classList.contains('abierto');
      bloque.classList.toggle('abierto', nuevoEstado);
      botonToggle.setAttribute('aria-expanded', String(nuevoEstado));
      botonToggle.querySelector('.autores-toggle-txt').textContent =
        nuevoEstado ? 'Ocultar' : 'Ver los ' + resto.length + ' restantes';
      window.__autoresExpandido = nuevoEstado;
    });
  }

}


/* =========================================================
   TIEMPO DE LECTURA
   ========================================================= */

const CAT_COLOR = {

  hypermotion:'#0c1b2e',

  primera_federacion:'#5bb8e8',

  segunda_federacion:'#d1132e',
  copa_del_rey:'#b8860b',
  copa_federacion:'#2f6f9f',

  general:'#e08a1f',

  amistoso:'#1a9c6b',

  arbitraje:'#9c0e23',

  jurisdiccion:'#5a3d99'

};


async function cargarTiempoLectura(dias){

  const data =
    await apiFetchAnaliticas(
      `/api/admin/analiticas/tiempo-lectura?dias=${dias}`
    );

  if (!data){
    marcarErrorSeccion('#tlLista', 'No se pudo cargar el tiempo de lectura.');
    return;
  }


  const categorias =
    data.categorias || [];


  const maxT =
    Math.max(
      ...categorias.map(c =>
        Number(c.tiempo_medio_segundos || 0)
      ),
      1
    );


  document.getElementById('tlLista').innerHTML =

    categorias.map(c => {

      const color =
        CAT_COLOR[c.categoria] ||
        '#5a6270';


      const label =
        categoriaLabel(c.categoria);


      const porcentaje =
        (
          Number(c.tiempo_medio_segundos || 0) /
          maxT *
          100
        ).toFixed(0);


      return `

        <div class="tl-item">

          <span
            class="cat-pill"
            style="background:${color}"
          >
            ${label}
          </span>

          <div class="barra">

            <i
              style="
                width:${porcentaje}%;
                background:${color}
              "
            ></i>

          </div>

          <span class="val">
            ${formatSegundos(c.tiempo_medio_segundos)}
          </span>

        </div>

      `;

    }).join('')

    ||

    '<p class="sub">Sin datos en este periodo</p>';

}


/* =========================================================
   IDIOMAS MÁS USADOS AL LEER UNA NOTICIA
   ========================================================= */

async function cargarIdiomas(dias){

  const data =
    await apiFetchAnaliticas(
      `/api/admin/analiticas/idiomas?dias=${dias}`
    );

  if (!data){
    marcarErrorSeccion('#idiomasLista', 'No se pudieron cargar los idiomas.');
    return;
  }


  const idiomas =
    data.idiomas || [];


  const maxV =
    Math.max(
      ...idiomas.map(i =>
        Number(i.vistas || 0)
      ),
      1
    );


  document.getElementById('idiomasLista').innerHTML =

    idiomas.map(i => `

      <div class="tl-item">

        <span
          class="cat-pill"
          style="background:#5a6270"
        >
          ${escapeHtml(i.nombre || i.idioma)}
        </span>

        <div class="barra">

          <i
            style="
              width:${(Number(i.vistas || 0) / maxV * 100).toFixed(0)}%;
              background:#5a6270
            "
          ></i>

        </div>

        <span class="val">
          ${formatMiles(i.vistas)} · ${i.porcentaje}%
        </span>

      </div>

    `).join('')

    ||

    '<p class="sub">Sin datos en este periodo</p>';

}


/* =========================================================
   PARTIDOS MÁS SEGUIDOS
   ========================================================= */

function competicionLabelAnaliticas(cod){
  const etiquetas = {
    hypermotion: 'LaLiga Hypermotion',
    primera_federacion: 'Primera Federación',
    segunda_federacion: 'Segunda Federación',
    copa_del_rey: 'Copa del Rey',
    copa_federacion: 'Copa Federación',
  };
  return etiquetas[cod] || cod || '';
}

async function cargarPartidosSeguidos(dias){

  const data =
    await apiFetchAnaliticas(
      `/api/admin/analiticas/partidos-seguidos?dias=${dias}&limit=10`
    );

  if (!data){
    marcarErrorSeccion('#partidosSeguidosLista', 'No se pudieron cargar los partidos más seguidos.');
    return;
  }


  const partidos =
    data.partidos || [];


  const max =
    Math.max(
      ...partidos.map(p =>
        Number(p.vistas || 0)
      ),
      1
    );


  const contenedor = document.getElementById('partidosSeguidosLista');
  if (!contenedor) return;

  if (!partidos.length){
    contenedor.innerHTML = '<p class="sub">Sin datos en este periodo</p>';
    return;
  }

  contenedor.innerHTML = `

    <table class="top-noticias">

      <thead>
        <tr>
          <th></th>
          <th>Partido</th>
          <th>Vistas</th>
        </tr>
      </thead>

      <tbody>

        ${
          partidos.map((p, i) => `

            <tr>

              <td class="rank">${i + 1}</td>

              <td>
                <div class="tit-noticia">
                  <strong>
                    ${escapeHtml(p.equipo_local)} ${p.goles_local ?? ''}-${p.goles_visitante ?? ''} ${escapeHtml(p.equipo_visitante)}
                  </strong>
                  <span class="tag-cat" style="margin-top:2px">
                    ${competicionLabelAnaliticas(p.competicion)}${p.jornada ? ' · J' + p.jornada : ''}
                  </span>
                </div>
              </td>

              <td>
                <span class="metric-num">${formatMiles(p.vistas)}</span>
                <div class="barra-mini">
                  <i style="width:${(Number(p.vistas || 0) / max * 100).toFixed(0)}%"></i>
                </div>
              </td>

            </tr>

          `).join('')
        }

      </tbody>

    </table>

  `;

}


/* =========================================================
   COMPARATIVA MENSUAL
   ========================================================= */

async function cargarComparativaMensual(){

  restaurarCanvas('chartPvVisitas');

  // Ruta propia (agregada por mes en el servidor y cacheada 6 h). Antes
  // se pedía /resumen?dias=365, que el servidor capa a 90 días: la
  // comparativa solo veía ~3 meses y repetía una consulta pesada.
  const data =
    await apiFetchAnaliticas(
      `/api/admin/analiticas/mensual`
    );

  if (!data || data.error || !Array.isArray(data.meses)){
    marcarErrorSeccion(
      '#chartPvVisitas',
      escapeHtml((data && data.error) || 'No se pudo cargar la comparativa mensual.')
    );
    return;
  }

  const porMes =
    new Map();

  data.meses.forEach(m => {

    if (!m.mes){
      return;
    }

    porMes.set(
      m.mes,
      {
        visitas:Number(m.visitantes || 0),
        pv:Number(m.vistas || 0)
      }
    );

  });

  const claves =
    [...porMes.keys()]
      .sort()
      .slice(-6);

  const labels =
    claves.map(c => {

      const [y,m] =
        c.split('-');


      return new Date(
        Number(y),
        Number(m) - 1,
        1
      ).toLocaleDateString(
        'es-ES',
        {
          month:'short'
        }
      );

    });


  const chartDisponible =
    await esperarChart();


  if (!chartDisponible){

    console.warn(
      'Chart.js no disponible para la comparativa mensual.'
    );

    marcarErrorSeccion(
      '#chartPvVisitas',
      'No se pudo cargar la librería de gráficos.'
    );

    return;

  }


  const canvas =
    document.getElementById('chartPvVisitas');


  if (!canvas){
    return;
  }


  if (chartPvVisitas){

    try{
      chartPvVisitas.destroy();
    }catch(e){}

    chartPvVisitas = null;

  }


  chartPvVisitas =
    new Chart(canvas, {

      type:'bar',

      data:{

        labels,

        datasets:[

          {
            label:'Visitantes',
            data:claves.map(
              c => porMes.get(c).visitas
            ),
            backgroundColor:'#5bb8e8',
            borderRadius:4
          },

          {
            label:'Páginas vistas',
            data:claves.map(
              c => porMes.get(c).pv
            ),
            backgroundColor:coloresChart().lineaOscura,
            borderRadius:4
          }

        ]

      },

      options:aplicarTemaChart({

        responsive:true,

        maintainAspectRatio:false,

        plugins:{

          legend:{
            position:'top',

            labels:{
              usePointStyle:true,
              boxWidth:8,
              font:{
                family:'Inter',
                size:11
              }
            }
          }

        },

        scales:{

          x:{
            grid:{
              display:false
            }
          },

          y:{
            beginAtZero:true,
            grid:{}
          }

        }

      })

    });

}


/* =========================================================
   SEARCH CONSOLE
   ========================================================= */

// Estado mientras se espera la respuesta: antes se pintaba "Sin conectar"
// de entrada y la tarjeta parecía rota durante los segundos de la carga.
function pintarGscCargando(){

  const estado = document.getElementById('estadoGscConexion');
  if (estado){
    estado.innerHTML = `
      <span class="punto" style="background:#9aa3ad"></span>
      Consultando Search Console…
    `;
  }

  const lista = document.getElementById('gscLista');
  if (lista) lista.innerHTML = '<p class="sub" style="margin:0">Cargando…</p>';

  const paginas = document.getElementById('gscPaginas');
  if (paginas) paginas.innerHTML = '';

}

// Deja la tarjeta de Search Console en estado "sin conectar": KPIs a
// guion, aviso en el hueco de la tabla y el gráfico destruido (no se
// dibuja ningún gráfico vacío ni de ejemplo -- sin conexión real no hay
// nada que mostrar, así que no se simula nada).
function pintarGscPendiente(){

  const estado =
    document.getElementById('estadoGscConexion');

  if (estado){
    estado.innerHTML = `
      <span class="punto" style="background:#e08a1f"></span>
      Sin conectar
    `;
  }

  ['gscKpiClics','gscKpiImpresiones','gscKpiCtr','gscKpiPosicion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });

  const lista =
    document.getElementById('gscLista');

  if (lista){

    lista.innerHTML = `

      <p
        class="sub"
        style="margin:0"
      >
        Aún no conectado a Search Console.
        En cuanto se guarden las credenciales de la API en la tarjeta
        de abajo, aquí se verán los datos reales: evolución de clics
        e impresiones y las consultas de búsqueda con más tráfico.
      </p>

    `;

  }

  if (chartGsc){

    try{
      chartGsc.destroy();
    }catch(e){}

    chartGsc = null;

  }

  const paginas = document.getElementById('gscPaginas');
  if (paginas) paginas.innerHTML = '';

}


// Pinta el gráfico de evolución diaria (clics + impresiones) con la
// serie real que devuelve la Search Console API -- sin datos de
// ejemplo ni placeholders: si no hay conexión real, ver
// pintarGscPendiente() más arriba.
async function pintarGraficoGsc(serie){

  const ctx =
    document.getElementById('chartGsc');

  if (!ctx) return;

  const chartListo = await esperarChart();
  if (!chartListo) return;

  if (chartGsc){
    try{
      chartGsc.destroy();
    }catch(e){}
    chartGsc = null;
  }

  chartGsc =
    new Chart(ctx, {

      type:'line',

      data:{

        labels: serie.map(d => formatFechaCorta(d.fecha)),

        datasets:[

          {
            label:'Clics',
            data: serie.map(d => d.clics),
            borderColor:'#1a9c6b',
            backgroundColor:'rgba(26,156,107,.12)',
            tension:.25,
            fill:true,
            yAxisID:'y'
          },

          {
            label:'Impresiones',
            data: serie.map(d => d.impresiones),
            borderColor:'#4285f4',
            backgroundColor:'rgba(66,133,244,.08)',
            tension:.25,
            fill:true,
            yAxisID:'y1'
          }

        ]

      },

      options:aplicarTemaChart({

        responsive:true,

        maintainAspectRatio:false,

        interaction:{
          mode:'index',
          intersect:false
        },

        plugins:{

          legend:{
            display:true,
            position:'top'
          }

        },

        scales:{

          y:{
            position:'left',
            beginAtZero:true,
            title:{ display:true, text:'Clics' }
          },

          y1:{
            position:'right',
            beginAtZero:true,
            grid:{ drawOnChartArea:false },
            title:{ display:true, text:'Impresiones' }
          }

        }

      })

    });

}


// dd/mm, para el eje del gráfico (la fecha llega en formato ISO
// yyyy-mm-dd desde la API de Search Console).
function formatFechaCorta(fechaIso){
  const partes = (fechaIso || '').split('-');
  if (partes.length !== 3) return fechaIso || '';
  return `${partes[2]}/${partes[1]}`;
}


// Estado de error de la tarjeta de Search Console: punto rojo, KPIs y
// gráfico a cero (antes se quedaban los números de la carga anterior) y el
// motivo real devuelto por el servidor/Google (permisos, propiedad mal
// escrita, clave inválida, cuota...) en vez de un "Error de conexión" mudo.
function pintarGscError(mensaje){

  const estado =
    document.getElementById('estadoGscConexion');

  if (estado){
    estado.innerHTML = `
      <span class="punto" style="background:#d1132e"></span>
      Error de conexión
    `;
  }

  ['gscKpiClics','gscKpiImpresiones','gscKpiCtr','gscKpiPosicion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });

  if (chartGsc){
    try{
      chartGsc.destroy();
    }catch(e){}
    chartGsc = null;
  }

  ultimaSerieGsc = null;

  const paginasErr = document.getElementById('gscPaginas');
  if (paginasErr) paginasErr.innerHTML = '';

  const lista = document.getElementById('gscLista');
  if (lista){
    lista.innerHTML =
      `<p class="sub">Error consultando Search Console: ${escapeHtml(mensaje || 'error desconocido')}</p>`;
  }

}


async function cargarGsc(dias){

  restaurarCanvas('chartGsc');

  const estado =
    document.getElementById('estadoGscConexion');

  let data = null;
  let errorPeticion = null;

  try{
    data = await apiFetchAnaliticas(
      `/api/admin/analiticas/gsc?dias=${dias}`,
      { lanzarError: true }
    );
  }catch(error){
    errorPeticion = error;
  }

  // Fallo de la petición en sí (red, 401, 403, 503 por cuota, 500...):
  // se muestra el motivo real, no un mensaje genérico.
  if (errorPeticion || !data){
    pintarGscError(errorPeticion ? errorPeticion.message : 'No se pudo cargar Search Console.');
    return;
  }

  // conectado === false: todavía no se han guardado las credenciales.
  if (!data.conectado){
    pintarGscPendiente();
    return;
  }

  // Google/Search Console ha rechazado la consulta.
  if (data.error){
    pintarGscError(data.error);
    return;
  }

  if (estado){
    estado.innerHTML = `
      <span class="punto" style="background:#1a9c6b"></span>
      Datos reales de Search Console
    `;
  }

  const totales = data.totales || { clics:0, impresiones:0, ctr:0, posicion:0 };

  const kpiClics = document.getElementById('gscKpiClics');
  const kpiImpresiones = document.getElementById('gscKpiImpresiones');
  const kpiCtr = document.getElementById('gscKpiCtr');
  const kpiPosicion = document.getElementById('gscKpiPosicion');

  if (kpiClics) kpiClics.textContent = formatMiles(totales.clics);
  if (kpiImpresiones) kpiImpresiones.textContent = formatMiles(totales.impresiones);
  if (kpiCtr) kpiCtr.textContent = `${totales.ctr}%`;
  if (kpiPosicion) kpiPosicion.textContent = totales.posicion;

  ultimaSerieGsc = data.serie || [];
  await pintarGraficoGsc(ultimaSerieGsc);

  const lista = document.getElementById('gscLista');
  const consultas = data.consultas || [];

  if (lista){
    lista.innerHTML = consultas.length
      ? `
        <table class="top-noticias">
          <thead>
            <tr><th>Consulta</th><th>Clics</th><th>Impresiones</th><th>CTR</th><th>Posición media</th></tr>
          </thead>
          <tbody>
            ${consultas.map(c => `
              <tr>
                <td>${escapeHtml(c.consulta)}</td>
                <td>${formatMiles(c.clics)}</td>
                <td>${formatMiles(c.impresiones)}</td>
                <td>${c.ctr}%</td>
                <td>${c.posicion}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
      : '<p class="sub">Sin consultas registradas en este periodo</p>';
  }

  const contPaginas = document.getElementById('gscPaginas');
  const paginas = data.paginas || [];

  if (contPaginas){
    contPaginas.innerHTML = paginas.length
      ? `
        <table class="top-noticias">
          <thead>
            <tr><th>Página</th><th>Clics</th><th>Impresiones</th><th>CTR</th><th>Posición media</th></tr>
          </thead>
          <tbody>
            ${paginas.map(pg => {
              let ruta = pg.pagina || '';
              try{ const u = new URL(ruta); ruta = u.pathname + u.search; }catch(e){}
              return `
              <tr>
                <td title="${escapeHtml(pg.pagina)}">${escapeHtml(ruta.length > 70 ? ruta.slice(0, 67) + '…' : ruta)}</td>
                <td>${formatMiles(pg.clics)}</td>
                <td>${formatMiles(pg.impresiones)}</td>
                <td>${pg.ctr}%</td>
                <td>${pg.posicion}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `
      : '';
  }

}


/* =========================================================
   FRANJA HORARIA CON MÁS TRÁFICO
   ========================================================= */

// El servidor agrupa por hora UTC. España va a UTC+1 (invierno) / UTC+2
// (verano), así que la "franja con más tráfico" salía desplazada 1-2 h.
// Se rota la serie con el desfase actual de Madrid (aproximación: si el
// periodo cruza un cambio de hora, las semanas del otro horario quedan
// 1 h movidas, irrelevante para ver cuándo conviene publicar).
function desfaseMadridHoras(){
  const ahora = new Date();
  const madrid = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Madrid', hour:'2-digit', hourCycle:'h23' }).format(ahora),
    10
  );
  return (madrid - ahora.getUTCHours() + 24) % 24;
}

function horasAMadrid(horasUtc, campo){
  const desfase = desfaseMadridHoras();
  const salida = Array.from({ length:24 }, (_, h) => ({ hora:h, [campo]:0 }));
  (horasUtc || []).forEach(f => {
    const h = (Number(f.hora) + desfase) % 24;
    if (h >= 0 && h < 24) salida[h][campo] += Number(f[campo]) || 0;
  });
  return salida;
}

async function cargarHoras(dias){

  restaurarCanvas('chartHoras');

  const data = await apiFetchAnaliticas(`/api/admin/analiticas/horas?dias=${dias}`);

  if (!data){
    marcarErrorSeccion('#chartHoras', 'No se pudo cargar la franja horaria.');
    return;
  }

  const chartListo = await esperarChart();
  if (!chartListo){
    return;
  }

  const horas = horasAMadrid(data.horas, 'vistas');
  const ctx = document.getElementById('chartHoras');
  if (!ctx) return;

  if (chartHoras){
    try{ chartHoras.destroy(); }catch(e){}
    chartHoras = null;
  }

  chartHoras = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: horas.map(h => `${String(h.hora).padStart(2,'0')}h`),
      datasets: [{
        label: 'Vistas',
        data: horas.map(h => h.vistas),
        backgroundColor: '#5bb8e8',
        borderRadius: 4,
        maxBarThickness: 18
      }]
    },
    options: aplicarTemaChart({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display:false }
      },
      scales: {
        x: {
          grid: { display:false },
          ticks: { autoSkip:true, maxTicksLimit:12 }
        },
        y: {
          beginAtZero: true,
          grid: {}
        }
      }
    })
  });

}


/* =========================================================
   RENDIMIENTO POR TIPO DE ARTÍCULO
   ========================================================= */

function tipoLabel(tipo){
  const labels = {
    noticia: 'Noticia',
    cronica: 'Crónica',
    opinion: 'Opinión',
    entrevista: 'Entrevista',
    uno_por_uno: '1x1 de jugadores',
    rdp_previa: 'Rueda de prensa previa',
    rdp_post: 'Rueda de prensa posterior',
  };
  return labels[tipo] || tipo;
}

async function cargarTipos(dias){

  const data = await apiFetchAnaliticas(`/api/admin/analiticas/tipos?dias=${dias}`);

  if (!data){
    marcarErrorSeccion('#tiposLista', 'No se pudo cargar el rendimiento por tipo.');
    return;
  }

  const tipos = data.tipos || [];
  const contenedor = document.getElementById('tiposLista');
  if (!contenedor) return;

  contenedor.innerHTML = tipos.map(t => `
    <div class="categoria-row">
      <div>
        <div class="cat-nombre">${tipoLabel(t.tipo)}</div>
        <div class="cat-meta">${formatMiles(t.noticias)} artículo${t.noticias === 1 ? '' : 's'} · ${formatSegundos(t.tiempo_medio_segundos)} de media</div>
      </div>
      <div style="text-align:right">
        <div class="cat-nombre">${formatMiles(t.vistas)}</div>
        <div class="cat-meta">${formatMiles(t.visitantes)} visitantes</div>
      </div>
    </div>
  `).join('') || '<p class="sub">Sin datos en este periodo</p>';

}


/* =========================================================
   ENGAGEMENT POR SCROLL
   ========================================================= */

async function cargarEngagementScroll(dias){

  const data = await apiFetchAnaliticas(`/api/admin/analiticas/engagement-scroll?dias=${dias}`);

  if (!data){
    marcarErrorSeccion('#scrollLista', 'No se pudo cargar el engagement por scroll.');
    return;
  }

  const contenedor = document.getElementById('scrollLista');
  if (!contenedor) return;

  const total = data.total || 0;
  const tramos = data.tramos || {};
  const orden = [
    { key: '75_100', lbl: '75% – 100% (leen hasta el final)' },
    { key: '50_75', lbl: '50% – 75%' },
    { key: '25_50', lbl: '25% – 50%' },
    { key: '0_25', lbl: '0% – 25% (abandonan pronto)' },
  ];

  if (!total){
    contenedor.innerHTML = '<p class="sub">Sin datos en este periodo</p>';
    return;
  }

  contenedor.innerHTML = orden.map(o => {
    const n = tramos[o.key] || 0;
    const pct = Math.round((n / total) * 100);
    return `
      <div class="categoria-row">
        <div>
          <div class="cat-nombre">${o.lbl}</div>
          <div class="cat-meta">${formatMiles(n)} lectura${n === 1 ? '' : 's'}</div>
        </div>
        <div style="text-align:right">
          <div class="cat-nombre">${pct}%</div>
        </div>
      </div>
    `;
  }).join('');

}


/* =========================================================
   VISTAS ÚLTIMAS 24 HORAS
   ========================================================= */

async function cargar24h(){

  restaurarCanvas('chart24h');

  const data = await apiFetchAnaliticas('/api/admin/analiticas/ultimas-24h');

  if (!data){
    marcarErrorSeccion('#chart24h', 'No se pudieron cargar las últimas 24 horas.');
    return;
  }

  const chartListo = await esperarChart();
  if (!chartListo){
    return;
  }

  const horas = data.horas || [];
  const ctx = document.getElementById('chart24h');
  if (!ctx) return;

  if (chart24h){
    try{ chart24h.destroy(); }catch(e){}
    chart24h = null;
  }

  chart24h = new Chart(ctx, {
    type: 'line',
    data: {
      labels: horas.map(h => {
        // h.hora = "YYYY-MM-DDTHH:00" en UTC -> hora de Madrid
        const d = new Date(`${h.hora.slice(0, 13)}:00:00Z`);
        if (Number.isNaN(d.getTime())) return h.hora.slice(11, 16);
        return new Intl.DateTimeFormat('es-ES', { timeZone:'Europe/Madrid', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(d);
      }),
      datasets: [{
        label: 'Vistas',
        data: horas.map(h => h.vistas),
        borderColor: '#5bb8e8',
        backgroundColor: 'rgba(91,184,232,.15)',
        fill: true,
        tension: .3,
        pointRadius: 2,
      }]
    },
    options: aplicarTemaChart({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display:false }
      },
      scales: {
        x: {
          grid: { display:false },
          ticks: { autoSkip:true, maxTicksLimit:12 }
        },
        y: {
          beginAtZero: true,
          grid: {}
        }
      }
    })
  });

}


/* =========================================================
   BUSCADOR DE NOTICIA POR TITULAR
   ========================================================= */

function inicializarBuscadorNoticia(){

  const input = document.getElementById('buscadorNoticiaInput');
  const btn = document.getElementById('buscadorNoticiaBtn');
  const contenedor = document.getElementById('buscadorNoticiaResultados');

  if (!btn || !input || !contenedor) return;

  async function buscar(){

    const q = input.value.trim();

    if (!q){
      contenedor.innerHTML = '';
      return;
    }

    btn.disabled = true;
    contenedor.innerHTML = '<p class="buscador-noticia-vacio">Buscando…</p>';

    try{

      const data = await apiFetchAnaliticas(
        `/api/admin/analiticas/buscar-noticia?q=${encodeURIComponent(q)}&dias=${diasActuales}`,
        { lanzarError: true }
      );

      const noticias = (data && data.noticias) || [];

      contenedor.innerHTML = noticias.length
        ? noticias.map(n => `
          <div class="buscador-noticia-item">
            <div style="flex:1 1 240px;min-width:0">
              <div class="titulo">${n.titulo}</div>
              <div class="meta">${tipoLabel(n.tipo)} · ${categoriaLabel(n.categoria)}${n.autor_nombre ? ' · ' + n.autor_nombre : ''}</div>
            </div>
            <div class="metricas">
              <span>👁️ <b>${formatMiles(n.vistas)}</b></span>
              <span>👤 <b>${formatMiles(n.visitantes)}</b></span>
              <span>⏱️ <b>${formatSegundos(n.tiempo_medio_segundos)}</b></span>
              <span>📖 <b>${n.scroll_medio}%</b></span>
            </div>
          </div>
        `).join('')
        : `<p class="buscador-noticia-vacio">Sin resultados para "${q}" en los últimos ${diasActuales} días.</p>`;

    }catch(error){

      contenedor.innerHTML = `<p class="buscador-noticia-vacio">Error al buscar: ${error.message}</p>`;

    }finally{

      btn.disabled = false;

    }

  }

  btn.addEventListener('click', buscar);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') buscar();
  });

}


/* =========================================================
   RENDIMIENTO POR CATEGORÍA
   ========================================================= */

async function cargarCategorias(dias){

  const data = await apiFetchAnaliticas(`/api/admin/analiticas/categorias?dias=${dias}`);

  if (!data){
    marcarErrorSeccion('#categoriasLista', 'No se pudieron cargar las categorías.');
    return;
  }

  const categorias = data.categorias || [];
  const contenedor = document.getElementById('categoriasLista');
  if (!contenedor) return;

  contenedor.innerHTML = categorias.map(c => `
    <div class="categoria-row">
      <div>
        <div class="cat-nombre">${categoriaLabel(c.categoria)}</div>
        <div class="cat-meta">${formatMiles(c.noticias)} noticia${c.noticias === 1 ? '' : 's'} con vistas</div>
      </div>
      <div style="text-align:right">
        <div class="cat-nombre">${formatMiles(c.vistas)}</div>
        <div class="cat-meta">${formatMiles(c.visitantes)} visitantes</div>
      </div>
    </div>
  `).join('') || '<p class="sub">Sin datos en este periodo</p>';

}


/* =========================================================
   LECTORES NUEVOS VS. RECURRENTES
   ========================================================= */

async function cargarRecurrencia(dias){

  const data = await apiFetchAnaliticas(`/api/admin/analiticas/recurrencia?dias=${dias}`);

  if (!data){
    marcarErrorSeccion('#recurrenciaBloque', 'No se pudo cargar la recurrencia de lectores.');
    return;
  }

  const contenedor = document.getElementById('recurrenciaBloque');
  if (!contenedor) return;

  const total = (data.nuevos || 0) + (data.recurrentes || 0) || 1;
  const pctRecurrentes = Math.round((data.recurrentes || 0) / total * 100);

  contenedor.innerHTML = `
    <div class="recurrencia-item">
      <div class="num">${formatMiles(data.nuevos)}</div>
      <div class="lbl">Lectores nuevos (1 vista en el periodo)</div>
    </div>
    <div class="recurrencia-item">
      <div class="num">${formatMiles(data.recurrentes)}</div>
      <div class="lbl">Lectores recurrentes (${pctRecurrentes}% del total)</div>
    </div>
  `;

}


/* =========================================================
   NOTICIAS RÁPIDAS
   ========================================================= */

async function cargarNoticiasRapidas(dias){

  restaurarCanvas('chartNr');

  const data = await apiFetchAnaliticas(`/api/admin/analiticas/noticias-rapidas?dias=${dias}`);

  if (!data){
    marcarErrorSeccion('#nrResumen', 'No se pudieron cargar las estadísticas de noticias rápidas.');
    marcarErrorSeccion('#chartNr', 'No se pudo cargar el gráfico de noticias rápidas.');
    const a = document.getElementById('nrAutores'); if (a) a.innerHTML = '';
    const h = document.getElementById('nrHoras'); if (h) h.innerHTML = '';
    return;
  }

  const resumen = document.getElementById('nrResumen');
  if (resumen){

    const dif = (data.total || 0) - (data.anterior || 0);
    let comparativa = 'sin periodo anterior con el que comparar';
    if (data.anterior > 0){
      const pct = Math.round(dif / data.anterior * 100);
      comparativa = `${dif >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs. periodo anterior (${formatMiles(data.anterior)})`;
    } else if (data.total > 0){
      comparativa = 'el periodo anterior no tuvo ninguna';
    }

    let ultimaTxt = 'Todavía no hay ninguna';
    if (data.ultima){
      const d = new Date(data.ultima);
      ultimaTxt = new Intl.DateTimeFormat('es-ES', {
        timeZone:'Europe/Madrid', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
      }).format(d);
    }

    resumen.innerHTML = `
      <div class="recurrencia-item">
        <div class="num">${formatMiles(data.total)}</div>
        <div class="lbl">Publicadas en ${dias === 1 ? '24 h' : dias + ' días'} — ${escapeHtml(comparativa)}</div>
      </div>
      <div class="recurrencia-item">
        <div class="num">${String(data.media_dia ?? 0).replace('.', ',')}</div>
        <div class="lbl">De media al día</div>
      </div>
      <div class="recurrencia-item">
        <div class="num" style="font-size:1.1rem">${escapeHtml(ultimaTxt)}</div>
        <div class="lbl">Última publicada · ${formatMiles(data.total_historico)} en total</div>
      </div>
    `;
  }

  const autores = data.autores || [];
  const contAutores = document.getElementById('nrAutores');
  if (contAutores){
    contAutores.innerHTML = autores.map(a => `
      <div class="categoria-row">
        <div class="cat-nombre">${escapeHtml(a.nombre)}</div>
        <div class="cat-nombre">${formatMiles(a.total)}</div>
      </div>
    `).join('') || '<p class="sub">Sin noticias rápidas en este periodo</p>';
  }

  const horasMax = (data.horas || []).slice().sort((x, y) => y.total - x.total).filter(x => x.total > 0).slice(0, 5);
  const contHoras = document.getElementById('nrHoras');
  if (contHoras){
    contHoras.innerHTML = horasMax.map(x => `
      <div class="categoria-row">
        <div class="cat-nombre">${String(x.hora).padStart(2, '0')}:00 – ${String(x.hora).padStart(2, '0')}:59</div>
        <div class="cat-nombre">${formatMiles(x.total)}</div>
      </div>
    `).join('') || '<p class="sub">Sin datos en este periodo</p>';
  }

  const chartListo = await esperarChart();
  if (!chartListo) return;

  const ctx = document.getElementById('chartNr');
  if (!ctx) return;

  if (chartNr){
    try{ chartNr.destroy(); }catch(e){}
    chartNr = null;
  }

  const serie = data.serie || [];
  chartNr = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: serie.map(d => formatFechaCorta(d.fecha)),
      datasets: [{
        label: 'Noticias rápidas',
        data: serie.map(d => d.total),
        backgroundColor: '#e08a1f',
        borderRadius: 4,
        maxBarThickness: 18
      }]
    },
    options: aplicarTemaChart({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display:false } },
      scales: {
        x: { grid: { display:false }, ticks: { autoSkip:true, maxTicksLimit:12 } },
        y: { beginAtZero:true, ticks: { precision:0 }, grid: {} }
      }
    })
  });

}


/* =========================================================
   CARGA COMPLETA
   ========================================================= */

async function cargarTodo(dias){

  /*
   * IMPORTANTE:
   *
   * Cada función tiene sus propios errores controlados.
   * Un fallo de Chart.js NO debe bloquear las demás.
   */

  const resultados =
    await Promise.allSettled([

      cargarResumen(dias),

      cargarMasLeidas(dias),

      cargarFuentes(dias),

      cargarAutores(dias),

      cargarTiempoLectura(dias),

      cargarIdiomas(dias),

      cargarPartidosSeguidos(dias),

      cargarHoras(dias),

      cargarCategorias(dias),

      cargarRecurrencia(dias),

      cargarTipos(dias),

      cargarEngagementScroll(dias),

      cargarNoticiasRapidas(dias)

    ]);


  resultados.forEach(resultado => {

    if (
      resultado.status === 'rejected'
    ){

      console.error(
        'Error cargando una sección de analíticas:',
        resultado.reason
      );

    }

  });

}


/* =========================================================
   CONTROLES DE PERIODO Y FUENTE
   ========================================================= */

let cargaPeriodoEnCurso = false;
let cargaPeriodoPendiente = false;

async function solicitarCargaPeriodo(){

  if (cargaPeriodoEnCurso){
    cargaPeriodoPendiente = true;
    return;
  }

  cargaPeriodoEnCurso = true;

  try{
    do{
      cargaPeriodoPendiente = false;
      const dias = diasActuales;

      const gsc = cargarGsc(dias)
        .catch(error => console.error('Error cargando Search Console:', error));

      await cargarTodo(dias);
      await gsc;
    }while (cargaPeriodoPendiente);
  }finally{
    cargaPeriodoEnCurso = false;
  }

}

function inicializarControlesAnaliticas(){

  /* -------------------------------------------------------
     PERIODOS
     ------------------------------------------------------- */

  document
    .querySelectorAll('.rango-selector button')
    .forEach(button => {

      button.addEventListener(
        'click',
        async () => {

          const nuevoPeriodo =
            parseInt(
              button.dataset.r,
              10
            );


          if (!Number.isFinite(nuevoPeriodo)){
            return;
          }


          document
            .querySelectorAll(
              '.rango-selector button'
            )
            .forEach(x => {

              x.classList.remove(
                'activo'
              );

            });


          button.classList.add(
            'activo'
          );


          diasActuales =
            nuevoPeriodo;


          const subtitulo =
            document
              .querySelector(
                '#chartEvolucion'
              )
              ?.closest('.card')
              ?.querySelector('.sub');


          if (subtitulo){

            subtitulo.textContent =
              `Visitas y páginas vistas — últimos ${diasActuales} días`;

          }


          /*
           * Cargamos el nuevo periodo.
           * No esperamos a Chart.js para hacerlo.
           *
           * Antes, dos clics seguidos en periodos distintos lanzaban dos
           * cargas completas a la vez y la que respondía más tarde (no la
           * última) se quedaba pintada. Ahora solo hay una carga en curso:
           * si se hace clic mientras carga, al terminar se vuelve a cargar
           * el último periodo elegido. Search Console va en paralelo
           * (antes esperaba a que terminaran las otras 13 peticiones).
           */

          solicitarCargaPeriodo();

        }
      );

    });

}


/* =========================================================
   BORRAR DATOS GUARDADOS (con confirmación)
   ========================================================= */

function inicializarBorrarDatos(){

  const btnAbrir = document.getElementById('btnBorrarDatos');
  const modal = document.getElementById('modalBorrarDatos');
  const btnCancelar = document.getElementById('btnCancelarBorrado');
  const btnConfirmar = document.getElementById('btnConfirmarBorrado');
  const checkTodo = document.getElementById('checkBorrarTodo');
  const texto = document.getElementById('modalBorrarDatosTexto');

  if (!btnAbrir || !modal || !btnConfirmar) return;

  function actualizarTexto(){
    texto.textContent = checkTodo.checked
      ? 'Esto borrará TODO el histórico de páginas vistas y tiempos de lectura del tracking propio, para siempre. No se puede deshacer.'
      : `Esto borrará las páginas vistas y los tiempos de lectura del tracking propio de los últimos ${diasActuales} días. No se puede deshacer.`;
  }

  btnAbrir.addEventListener('click', () => {
    checkTodo.checked = false;
    actualizarTexto();
    modal.classList.add('abierto');
  });

  checkTodo.addEventListener('change', actualizarTexto);

  btnCancelar.addEventListener('click', () => {
    modal.classList.remove('abierto');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('abierto');
  });

  btnConfirmar.addEventListener('click', async () => {

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = 'Borrando…';

    const borrarTodo = checkTodo.checked;
    const query = borrarTodo ? `?todo=1` : `?dias=${diasActuales}`;

    try{

      const resultado = await apiFetchAnaliticas(
        `/api/admin/analiticas/datos${query}`,
        { method: 'DELETE', lanzarError: true }
      );

      modal.classList.remove('abierto');

      window.EOF?.toast?.(
        `Datos borrados (${formatMiles(resultado?.filas_borradas || 0)} vistas eliminadas).`,
        'exito'
      );

      // Se recarga todo el panel para que los KPIs, gráficos y listas
      // reflejen inmediatamente que ya no hay (o hay menos) datos, en
      // vez de dejar en pantalla números que ya no existen en la BD.
      limpiarCacheAnaliticas();
      cargarTodo(diasActuales);
      cargarComparativaMensual().catch(() => {});
      cargar24h().catch(() => {});

    }catch(error){

      window.EOF?.toast?.('No se pudieron borrar los datos: ' + error.message, 'error');

    }finally{

      btnConfirmar.disabled = false;
      btnConfirmar.textContent = 'Sí, borrar';

    }

  });

}


/* =========================================================
   INICIALIZACIÓN
   ========================================================= */

async function iniciarPanelAnaliticas(){

  inicializarControlesAnaliticas();
  inicializarBorrarDatos();
  inicializarBuscadorNoticia();
  inicializarBotonActualizar();
  inicializarObservadorTema();


  /*
   * Search Console, la comparativa mensual y las últimas 24 h son
   * independientes del resto: se lanzan a la vez en vez de esperar a que
   * terminen las demás peticiones del panel.
   */

  pintarGscCargando();

  cargarGsc(diasActuales)
    .catch(error => console.error('Error cargando Search Console:', error));

  cargar24h()
    .catch(error => console.error('Error cargando las últimas 24h:', error));

  /*
   * No esperamos a Chart.js para cargar los datos.
   */

  await cargarTodo(
    diasActuales
  );


  cargarComparativaMensual()
    .catch(error => {

      console.error(
        'Error en comparativa mensual:',
        error
      );

    });


}



/* =========================================================
   BOTÓN "ACTUALIZAR"
   Al ser una pestaña que ya no se recarga sola al entrar, los datos se
   quedan como estaban hasta que se pulse esto (o se cambie de periodo).
   ========================================================= */

function inicializarBotonActualizar(){

  const boton = document.getElementById('btnActualizarAnaliticas');

  if (!boton){
    return;
  }

  boton.addEventListener('click', async () => {

    if (boton.disabled){
      return;
    }

    boton.disabled = true;
    boton.classList.add('cargando');

    try{

      // Hay caché de 5 min por URL: sin vaciarla, Actualizar no pediría nada nuevo.
      limpiarCacheAnaliticas();

      cargar24h().catch(() => {});
      cargarComparativaMensual().catch(() => {});

      await solicitarCargaPeriodo();

    }finally{

      boton.disabled = false;
      boton.classList.remove('cargando');

    }

  });

}


/* =========================================================
   ARRANQUE (una sola vez, al abrir la pestaña por primera vez)
   ========================================================= */

let analiticasIniciado = false;

function crearPromesaChartJs(){
  if (window.__chartJsReady){
    return;
  }

  window.__chartJsReady = new Promise((resolve) => {

    if (window.Chart) {
      resolve(true);
      return;
    }

    // Primero la copia propia (js/vendor/chart.umd.min.js, Chart.js 4.4.4
    // sin la línea sourceMappingURL): no depende de ningún CDN y evita el
    // error de CSP "Connecting to ...chart.umd.js.map violates connect-src"
    // (las DevTools piden el .map con fetch y connect-src no lista los CDN).
    // Los CDN quedan solo como respaldo.
    const sources = [
      '/js/vendor/chart.umd.min.js?v=1',
      'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js',
      'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js'
    ];

    let index = 0;

    function cargarSiguiente() {

      if (window.Chart) {
        resolve(true);
        return;
      }

      if (index >= sources.length) {
        console.warn(
          'Chart.js no pudo cargarse desde ningún CDN. ' +
          'Las métricas seguirán funcionando, pero no se mostrarán los gráficos.'
        );

        resolve(false);
        return;
      }

      const script = document.createElement('script');

      script.src = sources[index++];
      script.async = true;

      script.onload = () => {
        if (window.Chart) {
          resolve(true);
        } else {
          cargarSiguiente();
        }
      };

      script.onerror = () => {
        cargarSiguiente();
      };

      document.head.appendChild(script);
    }

    cargarSiguiente();
  });
}

function alCargarChartJs(){

  window.__chartJsReady
    .then(ok => {

      if (!ok){
        return;
      }


      /*
       * Chart.js ha llegado después
       * de cargar el panel.
       *
       * Redibujamos únicamente
       * los gráficos.
       */

      if (
        document.readyState !==
        'loading'
      ){

        cargarResumen(
          diasActuales
        ).catch(error => {

          console.error(
            'Error redibujando evolución:',
            error
          );

        });


        cargarComparativaMensual()
          .catch(error => {

            console.error(
              'Error redibujando comparativa:',
              error
            );

          });


        // OJO: pintarGscPendiente() ya NO se llama incondicionalmente
        // aquí. Chart.js suele tardar más en cargar (varios CDNs con
        // fallback) que las llamadas a la API, así que para cuando esta
        // promesa se resuelve, cargarGsc() (llamado en paralelo desde
        // iniciarPanelAnaliticas) puede haber pintado ya el gráfico real
        // de Search Console con pintarGraficoGsc(). Llamar aquí a
        // pintarGscPendiente() sin más lo destruiría y dejaría la
        // tarjeta atascada en "pendiente" para siempre aunque la
        // conexión funcionara. Solo hace falta pintar el estado
        // "pendiente" si todavía no existe ningún chartGsc (ni el vacío
        // de pintarGscPendiente ni el real de cargarGsc).
        if (!chartGsc && ultimaSerieGsc){
          pintarGraficoGsc(ultimaSerieGsc)
            .catch(error => console.error('Error redibujando Search Console:', error));
        }

      }

    })
    .catch(error => {

      console.warn(
        'Error en la carga de Chart.js:',
        error
      );

    });

}

// Al volver a una pestaña ya cargada los gráficos pueden haberse quedado con
// tamaño 0 (estaban en un panel oculto): se les pide que se redimensionen.
function redimensionarGraficosAnaliticas(){
  [chartEvolucion, chartPvVisitas, chartGsc, chartHoras, chart24h, chartNr].forEach(c => {
    try{
      if (c && typeof c.resize === 'function'){
        c.resize();
      }
    }catch(error){
      /* un gráfico ya destruido no debe romper al resto */
    }
  });
}

window.eofAnaliticasPanel = {
  abrir(){

    if (analiticasIniciado){
      redimensionarGraficosAnaliticas();
      return;
    }

    analiticasIniciado = true;

    crearPromesaChartJs();

    iniciarPanelAnaliticas().catch(error => {
      console.error('Error iniciando analíticas:', error);
    });

    alCargarChartJs();

  }
};

})();
