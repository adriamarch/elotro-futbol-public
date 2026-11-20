let PORRAS_COMPETICION_ACTUAL="hypermotion",PORRAS_GRUPO_ACTUAL="",PORRAS_JORNADA_ACTUAL=null,PORRAS_PARTIDOS_CATEGORIA=[],PORRAS_PARTIDOS_JORNADA=[],PORRAS_MIAS={};const PORRAS_DEBOUNCE_MS=600,porrasTemporizadores={};function porrasFiltroGrupo(){return document.getElementById("filtroGrupo")}document.addEventListener("DOMContentLoaded",()=>{document.querySelectorAll(".filtros button[data-cat]").forEach(o=>{o.addEventListener("click",()=>{document.querySelectorAll(".filtros button[data-cat]").forEach(e=>e.classList.remove("activo")),o.classList.add("activo"),PORRAS_COMPETICION_ACTUAL=o.dataset.cat,PORRAS_GRUPO_ACTUAL="",PORRAS_JORNADA_ACTUAL=null,cargarCategoriaPorras(),cargarResumenTemporada(),PORRAS_TAB_ACTUAL==="ranking"&&cargarRanking()})});const a=porrasFiltroGrupo();a&&a.addEventListener("change",()=>{PORRAS_GRUPO_ACTUAL=a.value,PORRAS_JORNADA_ACTUAL=null,cargarCategoriaPorras()}),document.querySelectorAll(".porras-tab").forEach(o=>{o.addEventListener("click",()=>{document.querySelectorAll(".porras-tab").forEach(e=>{e.classList.remove("activo"),e.setAttribute("aria-selected","false")}),o.classList.add("activo"),o.setAttribute("aria-selected","true"),PORRAS_TAB_ACTUAL=o.dataset.tab,document.getElementById("porrasCont").hidden=PORRAS_TAB_ACTUAL!=="jornada",document.getElementById("porrasRankingCont").hidden=PORRAS_TAB_ACTUAL!=="ranking",document.getElementById("porrasRankingAyuda").hidden=PORRAS_TAB_ACTUAL!=="ranking",PORRAS_TAB_ACTUAL==="ranking"&&cargarRanking()})})});let PORRAS_TAB_ACTUAL="jornada";function iniciarPaginaPorras(){cargarCategoriaPorras(),cargarResumenTemporada()}async function cargarResumenTemporada(){const a=document.getElementById("porrasTemporadaCont");if(!sesionLectorActual()){a.innerHTML="";return}try{const e=new URLSearchParams({competicion:PORRAS_COMPETICION_ACTUAL}),t=await apiFetchLector(`/api/porras/resumen?${e.toString()}`);if(!t.ok){a.innerHTML="";return}const i=await t.json();if(!i.porras_resueltas){a.innerHTML="";return}a.innerHTML=`
      <div class="porras-temporada">
        <div class="porras-temporada-item">
          <span class="porras-temporada-valor">${i.puntos_totales}</span>
          <span class="porras-temporada-etiqueta">Puntos esta temporada</span>
        </div>
        <div class="porras-temporada-item">
          <span class="porras-temporada-valor">${i.exactos}</span>
          <span class="porras-temporada-etiqueta">Resultados exactos</span>
        </div>
        <div class="porras-temporada-item">
          <span class="porras-temporada-valor">${i.porras_resueltas}</span>
          <span class="porras-temporada-etiqueta">Porras jugadas</span>
        </div>
      </div>`}catch{a.innerHTML=""}}async function cargarRanking(){const a=document.getElementById("porrasRankingCont");if(PORRAS_JORNADA_ACTUAL===null){a.innerHTML=estadoHTML({titulo:"Todavía no hay ranking",texto:"En cuanto haya alguna jornada con partidos programados, podrás elegirla arriba para ver su ranking."});return}a.innerHTML=spinnerHTML("Cargando ranking...");try{const o=new URLSearchParams({competicion:PORRAS_COMPETICION_ACTUAL,jornada:String(PORRAS_JORNADA_ACTUAL)});PORRAS_GRUPO_ACTUAL&&o.set("grupo",PORRAS_GRUPO_ACTUAL);const e=sesionLectorActual(),t=e?await apiFetchLector(`/api/porras/ranking?${o.toString()}`):await apiFetch(`/api/porras/ranking?${o.toString()}`),{ranking:i,mi_posicion:r,jornada_terminada:s,total_participantes:c,partidos_totales:n,partidos_resueltos:u}=await t.json();if(!i||!i.length){a.innerHTML=estadoHTML({titulo:s?"Todavía no hay ranking":"Nadie ha jugado todavía",texto:s?`Nadie hizo su porra en la jornada ${PORRAS_JORNADA_ACTUAL} de esta competición.`:`Aún no hay porras guardadas en la jornada ${PORRAS_JORNADA_ACTUAL}. En cuanto alguien haga la suya aparecerá aquí.`});return}const d=s!==!1,g=i.map(l=>{const f=e&&l.reader_id===Number(e.id);return`
        <tr${f?' class="porras-ranking-fila-propia"':""}>
          <td class="col-pos">${l.posicion}</td>
          <td class="col-nombre">${escapeHtml(l.nombre)}${f?" (tú)":""}</td>
          <td>${l.exactos}</td>
          <td>${l.aciertos}</td>
          <td>${l.fallos}</td>
          <td>${l.porras_jugadas}</td>
          ${d?"":`<td>${l.porras_pendientes}</td>`}
          <td class="col-puntos">${l.puntos_totales}</td>
        </tr>`}).join(""),y=r&&!i.some(l=>e&&l.reader_id===Number(e.id))?`
      <div class="porras-ranking-fuera-top">
        Vas el <strong>puesto ${r.posicion}</strong> con <strong>${r.puntos_totales} puntos</strong> esta jornada
        (${r.exactos} exactos, ${r.aciertos} aciertos, ${r.fallos} fallos)${s?"":", provisional"}.
      </div>`:"";a.innerHTML=`
      <p class="porras-ranking-jornada-titulo">${s?"Ranking":"Clasificación provisional"} de la jornada ${PORRAS_JORNADA_ACTUAL}${PORRAS_GRUPO_ACTUAL?" · "+escapeHtml(PORRAS_GRUPO_ACTUAL):""}</p>
      ${s?"":`
      <p class="porras-ranking-provisional">
        Jornada en curso: clasificación <strong>provisional</strong>${n?` · ${u} de ${n} partidos resueltos`:""}.
        Los puntos se van sumando conforme terminan los partidos.
      </p>`}
      <p class="porras-ranking-participantes">${c||i.length} ${(c||i.length)===1?"participante":"participantes"} · 3 puntos por resultado exacto, 1 por acertar el signo.</p>
      <div class="porras-ranking-tabla-wrap">
        <table class="porras-ranking-tabla">
          <thead>
            <tr>
              <th title="Posición">#</th>
              <th class="col-nombre">Porrista</th>
              <th title="Marcador exacto acertado (3 puntos)">Exactos</th>
              <th title="Signo acertado sin marcador exacto (1 punto)">Aciertos</th>
              <th title="Porras falladas (0 puntos)">Fallos</th>
              <th title="Porras jugadas">Jugadas</th>
              ${s?"":'<th title="Partidos jugados pendientes de resolver">Pend.</th>'}
              <th title="Puntos">Pts</th>
            </tr>
          </thead>
          <tbody>${g}</tbody>
        </table>
      </div>
      ${y}`}catch{a.innerHTML=estadoHTML({titulo:"No se ha podido cargar el ranking",texto:"Ha habido un problema de conexión. Inténtalo de nuevo en un momento.",tipo:"error"})}}function porrasInicioTemporada(){const a=new Date;return`${a.getMonth()>=6?a.getFullYear():a.getFullYear()-1}-07-01`}function porrasPoblarFiltroGrupo(a){const o=porrasFiltroGrupo();if(!a.length){o.hidden=!0,o.innerHTML="",PORRAS_GRUPO_ACTUAL="";return}o.innerHTML=a.map(e=>`<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join(""),(!PORRAS_GRUPO_ACTUAL||!a.includes(PORRAS_GRUPO_ACTUAL))&&(PORRAS_GRUPO_ACTUAL=a[0]),o.value=PORRAS_GRUPO_ACTUAL,o.hidden=!1}async function cargarCategoriaPorras(){const a=document.getElementById("porrasCont"),o=document.getElementById("jornadasNav");a.innerHTML=spinnerHTML("Cargando partidos..."),o.innerHTML="";try{const e=porrasInicioTemporada();let t;try{const i=new URLSearchParams({competicion:PORRAS_COMPETICION_ACTUAL,desde_fecha:e}),r=await conReintento(()=>apiFetch(`/api/results/filtros?${i.toString()}`).then(s=>{if(!s.ok)throw new Error("filtros");return s.json()}));if(!Array.isArray(r.grupos))throw new Error("filtros");t=r.grupos}catch{const r=new URLSearchParams({competicion:PORRAS_COMPETICION_ACTUAL,desde_fecha:e,limit:"500"}),{results:s}=await conReintento(()=>apiFetch(`/api/results?${r.toString()}`).then(c=>c.json()));t=[...new Set(s.map(c=>c.grupo).filter(Boolean))].sort((c,n)=>c.localeCompare(n,"es"))}if(porrasPoblarFiltroGrupo(t),PORRAS_GRUPO_ACTUAL){const i=new URLSearchParams({competicion:PORRAS_COMPETICION_ACTUAL,grupo:PORRAS_GRUPO_ACTUAL,desde_fecha:e,limit:"500"}),{results:r}=await conReintento(()=>apiFetch(`/api/results?${i.toString()}`).then(s=>s.json()));PORRAS_PARTIDOS_CATEGORIA=r}else{const i=new URLSearchParams({competicion:PORRAS_COMPETICION_ACTUAL,desde_fecha:e,limit:"500"}),{results:r}=await conReintento(()=>apiFetch(`/api/results?${i.toString()}`).then(s=>s.json()));PORRAS_PARTIDOS_CATEGORIA=r}pintarNavJornadas()}catch{a.innerHTML=estadoHTML({titulo:"No se ha podido conectar",texto:"Ha habido un problema al cargar los partidos. Comprueba tu conexión e inténtalo de nuevo.",tipo:"error",cta:'<a href="javascript:location.reload()" class="btn-volver">Reintentar</a>'})}}function estadoJornada(a){const o=a.some(t=>t.estado==="programado"),e=a.length>0&&a.every(t=>t.estado==="finalizado"||t.estado==="anulado");return{bloqueadaParaPredecir:!o,jugada:e}}function pintarNavJornadas(){const a=document.getElementById("jornadasNav"),o=[...new Set(PORRAS_PARTIDOS_CATEGORIA.map(e=>e.jornada))].filter(e=>e!=null).sort((e,t)=>e-t);if(!o.length){a.innerHTML="",document.getElementById("porrasCont").innerHTML=estadoHTML({titulo:"Todavía no hay partidos programados",texto:"En cuanto se publique el calendario de esta competición podrás hacer tu porra aquí."});return}if(PORRAS_JORNADA_ACTUAL===null||!o.includes(PORRAS_JORNADA_ACTUAL))if(PORRAS_TAB_ACTUAL==="ranking"){const e=o.filter(t=>{const{jugada:i}=estadoJornada(PORRAS_PARTIDOS_CATEGORIA.filter(r=>r.jornada===t));return i});PORRAS_JORNADA_ACTUAL=e.length?e[e.length-1]:o[o.length-1]}else{const e=o.find(t=>{const{bloqueadaParaPredecir:i}=estadoJornada(PORRAS_PARTIDOS_CATEGORIA.filter(r=>r.jornada===t));return!i});PORRAS_JORNADA_ACTUAL=e!==void 0?e:o[o.length-1]}a.innerHTML=o.map(e=>{const t=PORRAS_PARTIDOS_CATEGORIA.filter(c=>c.jornada===e),{bloqueadaParaPredecir:i,jugada:r}=estadoJornada(t),s=e===PORRAS_JORNADA_ACTUAL;return`
      <button type="button" class="porras-jornada-btn${s?" activo":""}${r?" jugada":""}"
        data-jornada="${e}" role="tab" aria-selected="${s}"
        title="${r?"Jornada finalizada: consulta tu porra":i?"Jornada no disponible todavía":"Jornada "+e}">
        ${r?iconoCandadoAbierto():""}${e}
      </button>`}).join(""),a.querySelectorAll(".porras-jornada-btn").forEach(e=>{e.addEventListener("click",()=>{PORRAS_JORNADA_ACTUAL=parseInt(e.dataset.jornada,10),a.querySelectorAll(".porras-jornada-btn").forEach(t=>t.classList.remove("activo")),e.classList.add("activo"),PORRAS_TAB_ACTUAL==="ranking"?cargarRanking():cargarJornadaPorras()})}),PORRAS_TAB_ACTUAL==="ranking"?cargarRanking():cargarJornadaPorras()}function iconoCandadoAbierto(){return'<svg class="pj-candado" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.2-2.4"/></svg>'}function iconoCandadoCerrado(){return'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'}function iconoCheck(){return'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'}function iconoCruz(){return'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'}async function cargarJornadaPorras(){const a=document.getElementById("porrasCont");if(a.innerHTML=spinnerHTML("Cargando la jornada..."),PORRAS_PARTIDOS_JORNADA=PORRAS_PARTIDOS_CATEGORIA.filter(e=>e.jornada===PORRAS_JORNADA_ACTUAL).sort((e,t)=>(e.fecha_partido||"").localeCompare(t.fecha_partido||"")),!sesionLectorActual()){PORRAS_MIAS={},pintarJornadaPorras();return}try{const e=new URLSearchParams({competicion:PORRAS_COMPETICION_ACTUAL,jornada:String(PORRAS_JORNADA_ACTUAL)});PORRAS_GRUPO_ACTUAL&&e.set("grupo",PORRAS_GRUPO_ACTUAL);const t=await apiFetchLector(`/api/porras?${e.toString()}`);if(t.status===401){PORRAS_MIAS={},pintarJornadaPorras();return}const{porras:i}=await t.json();PORRAS_MIAS={},(i||[]).forEach(r=>{PORRAS_MIAS[r.resultado_id]=r})}catch{PORRAS_MIAS={}}pintarJornadaPorras()}function estadoVisualPorra(a,o){return a.estado==="en_juego"?"en_vivo":a.estado!=="finalizado"?a.estado==="programado"?"abierto":"bloqueado":o&&o.resultado_acierto&&o.resultado_acierto!=="pendiente"?o.resultado_acierto:"bloqueado"}function pintarJornadaPorras(){const a=document.getElementById("porrasCont"),o=sesionLectorActual();if(!PORRAS_PARTIDOS_JORNADA.length){a.innerHTML=estadoHTML({titulo:"No hay partidos en esta jornada",texto:"Prueba con otra jornada del selector de arriba."});return}const e=typeof sesionActual=="function"?sesionActual():null,t=o?"":e?`
    <div class="porras-acceso-aviso">
      <p>Como redactor, no puedes guardar tu porra cada jornada. Crea tu cuenta de lector para guardarla, ver tu resumen de temporada, aparecer en el ranking, comentar, votar en encuestas y mucho más. <strong>Es gratis y tarda un minuto.</strong></p>
      <a href="#" id="porrasIrAccesoDesdeRedactor">Inicia sesión o regístrate</a>
    </div>`:`
    <div class="porras-acceso-aviso">
      <p>Crea tu cuenta de lector para guardar tu porra de cada jornada, comentar, votar en encuestas, entrar en el ranking y mucho más. <strong>Es gratis y tarda un minuto.</strong></p>
      <a href="acceso.html?volver=${encodeURIComponent(location.pathname+location.search)}">Inicia sesión o regístrate</a>
    </div>`,i=PORRAS_PARTIDOS_JORNADA.every(d=>d.estado!=="programado"),r=o&&i?pintarResumenJornada():"",s=o&&PORRAS_PARTIDOS_JORNADA.some(d=>PORRAS_MIAS[d.id])?`
    <div class="porras-btns-imagen">
      <button type="button" class="porras-btn-compartir porras-btn-descargar" id="btnDescargarPorra">
        ${iconoDescargarPorra()}
        <span>Descargar</span>
      </button>
      <button type="button" class="porras-btn-compartir porras-btn-compartir-solo" id="btnCompartirPorra">
        ${iconoCompartirPorra()}
        <span>Compartir</span>
      </button>
    </div>`:"",c=PORRAS_PARTIDOS_JORNADA.map(d=>tarjetaPorraHTML(d,o)).join(""),n=PORRAS_PARTIDOS_JORNADA.length?`
    <div class="porras-marca-agua-pantalla">
      <img src="${SITE.logo}" alt="">
      <div class="porras-marca-agua-textos">
        <strong>ELOTROFÚTBOLTV</strong>
        <span>elotrofutbol.media</span>
      </div>
    </div>`:"";if(a.innerHTML=`
    ${t}
    ${r}
    ${s}
    <div class="porras-lista">${c}</div>
    ${n}`,o){a.querySelectorAll(".porra-input-gol").forEach(v=>{v.addEventListener("input",onCambioInputPorra)});const d=document.getElementById("btnDescargarPorra");d&&d.addEventListener("click",()=>descargarImagenPorra(o));const g=document.getElementById("btnCompartirPorra");g&&g.addEventListener("click",()=>compartirImagenPorra(o))}const u=document.getElementById("porrasIrAccesoDesdeRedactor");u&&u.addEventListener("click",d=>{d.preventDefault(),localStorage.removeItem("eof_token"),localStorage.removeItem("eof_user"),location.href=`acceso.html?volver=${encodeURIComponent(location.pathname+location.search)}`})}function iconoCompartirPorra(){return'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.7l7.4-4.2M8.3 13.3l7.4 4.2"/></svg>'}function iconoDescargarPorra(){return'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M12 3v13"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/></svg>'}function pintarResumenJornada(){const a=PORRAS_PARTIDOS_JORNADA.map(r=>PORRAS_MIAS[r.id]).filter(r=>r&&r.resultado_acierto&&r.resultado_acierto!=="pendiente");if(!a.length)return"";const o=a.reduce((r,s)=>r+(s.puntos_obtenidos||0),0),e=a.filter(r=>r.resultado_acierto==="exacto").length,t=a.filter(r=>r.resultado_acierto==="acierto").length,i=a.filter(r=>r.resultado_acierto==="fallo").length;return`
    <div class="porras-resumen">
      <div class="porras-resumen-item"><span class="porras-resumen-valor">${o}</span><span class="porras-resumen-etiqueta">Puntos</span></div>
      <div class="porras-resumen-item"><span class="porras-resumen-valor">${e}</span><span class="porras-resumen-etiqueta">Resultados exactos</span></div>
      <div class="porras-resumen-item"><span class="porras-resumen-valor">${t}</span><span class="porras-resumen-etiqueta">Aciertos de signo</span></div>
      <div class="porras-resumen-item"><span class="porras-resumen-valor">${i}</span><span class="porras-resumen-etiqueta">Fallos</span></div>
    </div>`}function tarjetaPorraHTML(a,o){const e=PORRAS_MIAS[a.id],t=estadoVisualPorra(a,e),i=a.estado==="programado"&&!!o,r=e?e.goles_local_predicho:"",s=e?e.goles_visitante_predicho:"",c=a.estado==="programado"?`
      <input type="number" min="0" max="20" inputmode="numeric" class="porra-input-gol" data-resultado-id="${a.id}" data-lado="local"
        value="${r}" ${i?"":"disabled"} aria-label="Goles predichos ${escapeHtml(a.equipo_local)}">
      <span class="porra-marcador-separador">–</span>
      <input type="number" min="0" max="20" inputmode="numeric" class="porra-input-gol" data-resultado-id="${a.id}" data-lado="visitante"
        value="${s}" ${i?"":"disabled"} aria-label="Goles predichos ${escapeHtml(a.equipo_visitante)}">`:`<span class="porra-marcador-real${t==="en_vivo"?" porra-marcador-real-en-vivo":""}">${a.goles_local??"–"} : ${a.goles_visitante??"–"}</span>`;let n="";t==="en_vivo"?n='<span class="porra-estado-icono" title="Partido en juego: ya no se puede predecir"><span class="en-vivo-punto"></span></span>':t==="bloqueado"&&a.estado!=="programado"&&a.estado!=="finalizado"?n=`<span class="porra-estado-icono" title="Ya no se puede predecir">${iconoCandadoCerrado()}</span>`:t==="exacto"||t==="acierto"?n=`<span class="porra-estado-icono" style="color:${t==="exacto"?"#2e9e57":"#2a80ab"}" title="Predicción acertada">${iconoCheck()}</span>`:t==="fallo"&&(n=`<span class="porra-estado-icono" style="color:var(--rojo)" title="Predicción fallada">${iconoCruz()}</span>`);const u=e&&e.resultado_acierto&&e.resultado_acierto!=="pendiente"?`<span class="porra-puntos-badge" data-tipo="${e.resultado_acierto}">+${e.puntos_obtenidos} pts</span>`:"",d=u?" data-tiene-puntos":"";return`
    <div class="porra-partido" data-estado-porra="${t}" data-resultado-id="${a.id}"${d}>
      <span class="porra-partido-fecha">${a.fecha_partido?formatFecha(a.fecha_partido):"Fecha por confirmar"}</span>
      <div class="porra-equipo">
        <img class="porra-escudo" src="${getEscudoUrl(a.equipo_local,a.escudo_local_url)}" alt="" loading="lazy" data-equipo="${escapeHtml(a.equipo_local)}" onerror="manejarErrorEscudo(this);">
        <span class="porra-nombre-equipo">${escapeHtml(a.equipo_local)}</span>
      </div>
      <div class="porra-marcador">${c}</div>
      <div class="porra-equipo porra-equipo--visitante">
        <img class="porra-escudo" src="${getEscudoUrl(a.equipo_visitante,a.escudo_visitante_url)}" alt="" loading="lazy" data-equipo="${escapeHtml(a.equipo_visitante)}" onerror="manejarErrorEscudo(this);">
        <span class="porra-nombre-equipo">${escapeHtml(a.equipo_visitante)}</span>
      </div>
      ${n}
      ${u}
    </div>`}function onCambioInputPorra(a){const o=a.target,e=o.dataset.resultadoId,t=o.closest(".porra-partido"),i=t.querySelector('.porra-input-gol[data-lado="local"]'),r=t.querySelector('.porra-input-gol[data-lado="visitante"]');if(o.value!==""){const n=parseInt(o.value,10);isNaN(n)||(n>20?o.value="20":n<0&&(o.value="0"))}const s=i.value===""?null:parseInt(i.value,10),c=r.value===""?null:parseInt(r.value,10);clearTimeout(porrasTemporizadores[e]),!(s===null||c===null||isNaN(s)||isNaN(c))&&(s<0||c<0||(porrasTemporizadores[e]=setTimeout(async()=>{marcarTarjetaGuardando(t,!0);try{const n=await apiFetchLector("/api/porras",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({resultado_id:parseInt(e,10),goles_local_predicho:s,goles_visitante_predicho:c})}),u=await n.json().catch(()=>({}));if(!n.ok){marcarTarjetaGuardando(t,!1,u.error||"No se ha podido guardar tu porra.");return}PORRAS_MIAS[e]={...PORRAS_MIAS[e]||{},resultado_id:parseInt(e,10),goles_local_predicho:s,goles_visitante_predicho:c},marcarTarjetaGuardando(t,!1)}catch{marcarTarjetaGuardando(t,!1,"Sin conexión: tu porra no se ha guardado todavía.")}},PORRAS_DEBOUNCE_MS)))}function marcarTarjetaGuardando(a,o,e){a.classList.toggle("porra-guardando",o);let t=a.querySelector(".porra-aviso-guardado");e?(t||(t=document.createElement("span"),t.className="porra-aviso-guardado",t.style.cssText="position:absolute;bottom:-8px;left:16px;font-size:.7rem;color:var(--rojo);background:var(--fondo);padding:0 6px;",a.appendChild(t)),t.textContent=e):t&&t.remove()}const PORRAS_IMG={ancho:1080,padding:48,colorFondo:"#ffffff",colorFondoAlt:"#f7f8fa",colorMarino:"#0c1b2e",colorRojo:"#d1132e",colorCeleste:"#5bb8e8",colorBorde:"#e7e9ee",colorTextoSuave:"#5a6270"};function cargarImagenSegura(a){return new Promise(o=>{if(!a)return o(null);const e=i=>new Promise(r=>{const s=new Image;i&&(s.crossOrigin="anonymous"),s.onload=()=>r(s),s.onerror=()=>r(null),s.src=a});if((()=>{try{return new URL(a,location.href).origin===location.origin}catch{return!0}})()){e(!1).then(o);return}e(!0).then(i=>{if(i)return o(i);fetch(a,{mode:"cors"}).then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.blob()}).then(r=>{const s=URL.createObjectURL(r),c=new Image;c.onload=()=>{o(c)},c.onerror=()=>{URL.revokeObjectURL(s),o(null)},c.src=s}).catch(()=>o(null))})})}function porrasCanvasTextoAjustado(a,o,e){let t=o;for(;a.measureText(t).width>e&&t.length>1;)t=t.slice(0,-1);return t.length<o.length?t.slice(0,-1).trimEnd()+"…":t}function dibujarImagenContenida(a,o,e,t,i){const r=Math.min(i/o.naturalWidth,i/o.naturalHeight),s=o.naturalWidth*r,c=o.naturalHeight*r,n=e+(i-s)/2,u=t+(i-c)/2;a.drawImage(o,n,u,s,c)}function eofFuente(a,o){try{return getComputedStyle(document.documentElement).getPropertyValue(a).trim()||o}catch{return o}}function dibujarMarcaDeAgua(a,o,e,t){const r=e-64;a.save(),a.fillStyle="rgba(12,27,46,0.88)",a.fillRect(0,r,o,64);const s=40,c=20,n=r+(64-s)/2;t&&(a.save(),a.beginPath(),a.arc(c+s/2,n+s/2,s/2,0,Math.PI*2),a.clip(),dibujarImagenContenida(a,t,c,n,s),a.restore()),a.fillStyle="#ffffff",a.textBaseline="middle",a.font="700 22px "+eofFuente("--font-tit","Oswald, Arial Narrow, sans-serif"),a.fillText("ELOTROFÚTBOLTV",c+s+14,r+64/2-9),a.font="500 15px "+eofFuente("--font-text","Inter, Arial, sans-serif"),a.fillStyle="rgba(255,255,255,0.75)",a.fillText("elotrofutbol.media",c+s+14,r+64/2+12),a.restore()}async function generarCanvasPorra(a){const o=PORRAS_PARTIDOS_JORNADA,e=92,t=190,r=t+o.length*e+PORRAS_IMG.padding+64,s=PORRAS_IMG.ancho,c=document.createElement("canvas");c.width=s,c.height=r;const n=c.getContext("2d");n.fillStyle=PORRAS_IMG.colorFondo,n.fillRect(0,0,s,r),n.fillStyle=PORRAS_IMG.colorMarino,n.fillRect(0,0,s,t),n.fillStyle="#ffffff",n.textBaseline="alphabetic",n.font="700 30px "+eofFuente("--font-tit","Oswald, Arial Narrow, sans-serif"),n.fillText("MI PORRA",PORRAS_IMG.padding,70),n.font="500 22px "+eofFuente("--font-text","Inter, Arial, sans-serif"),n.fillStyle="rgba(255,255,255,0.85)";const d=`${typeof categoriaLabel=="function"?categoriaLabel(PORRAS_COMPETICION_ACTUAL):PORRAS_COMPETICION_ACTUAL}${PORRAS_GRUPO_ACTUAL?" · "+PORRAS_GRUPO_ACTUAL:""} · Jornada ${PORRAS_JORNADA_ACTUAL}`;n.fillText(d,PORRAS_IMG.padding,104),n.font="700 20px "+eofFuente("--font-text","Inter, Arial, sans-serif"),n.fillStyle=PORRAS_IMG.colorCeleste,n.fillText(`Predicción de ${a.nombre}`,PORRAS_IMG.padding,148);const g=await Promise.all(o.map(l=>Promise.all([cargarImagenSegura(getEscudoUrl(l.equipo_local,l.escudo_local_url)),cargarImagenSegura(getEscudoUrl(l.equipo_visitante,l.escudo_visitante_url))]))),v=await cargarImagenSegura(SITE.logo);let y=t;return o.forEach((l,f)=>{const m=PORRAS_MIAS[l.id],[$,L]=g[f],b=y+f*e;n.fillStyle=f%2===0?PORRAS_IMG.colorFondo:PORRAS_IMG.colorFondoAlt,n.fillRect(0,b,s,e),n.strokeStyle=PORRAS_IMG.colorBorde,n.lineWidth=1,n.beginPath(),n.moveTo(0,b+e),n.lineTo(s,b+e),n.stroke();const h=b+e/2,p=40,_=330;$&&dibujarImagenContenida(n,$,PORRAS_IMG.padding,h-p/2,p),n.fillStyle=PORRAS_IMG.colorMarino,n.font="600 21px "+eofFuente("--font-text","Inter, Arial, sans-serif"),n.textBaseline="middle";const A=porrasCanvasTextoAjustado(n,l.equipo_local,_-p-16);n.fillText(A,PORRAS_IMG.padding+p+14,h);const T=s/2;n.textAlign="center",n.font="700 34px "+eofFuente("--font-tit","Oswald, Arial Narrow, sans-serif"),n.fillStyle=PORRAS_IMG.colorMarino;const j=m?`${m.goles_local_predicho} - ${m.goles_visitante_predicho}`:"? - ?";n.fillText(j,T,h+2),n.textAlign="left",n.textAlign="right",n.font="600 21px "+eofFuente("--font-text","Inter, Arial, sans-serif");const E=porrasCanvasTextoAjustado(n,l.equipo_visitante,_-p-16);if(n.fillText(E,s-PORRAS_IMG.padding-p-14,h),n.textAlign="left",L&&dibujarImagenContenida(n,L,s-PORRAS_IMG.padding-p,h-p/2,p),m&&m.resultado_acierto&&m.resultado_acierto!=="pendiente"){const w={exacto:["¡EXACTO!","#2e9e57"],acierto:["ACIERTO","#2a80ab"],fallo:["FALLO",PORRAS_IMG.colorRojo]},[P,R]=w[m.resultado_acierto];n.textAlign="center",n.font="700 12px "+eofFuente("--font-text","Inter, Arial, sans-serif"),n.fillStyle=R,n.fillText(P,T,h+24),n.textAlign="left"}}),dibujarMarcaDeAgua(n,s,r,v),c}function porrasNombreArchivo(){return`mi-porra-${PORRAS_COMPETICION_ACTUAL}-jornada-${PORRAS_JORNADA_ACTUAL}.png`}async function generarBlobPorra(a){const o=await generarCanvasPorra(a),e=await new Promise(t=>o.toBlob(t,"image/png"));if(!e)throw new Error("No se ha podido generar la imagen");return e}function porrasConBotonOcupado(a,o,e){const t=a?a.innerHTML:"";return a&&(a.disabled=!0,a.innerHTML=`<span>${o}</span>`),e().finally(()=>{a&&(a.disabled=!1,a.innerHTML=t)})}async function descargarImagenPorra(a){const o=document.getElementById("btnDescargarPorra");await porrasConBotonOcupado(o,"Generando…",async()=>{try{const e=await generarBlobPorra(a),t=porrasNombreArchivo(),i=URL.createObjectURL(e),r=document.createElement("a");r.href=i,r.download=t,document.body.appendChild(r),r.click(),r.remove(),setTimeout(()=>URL.revokeObjectURL(i),4e3)}catch{window.EOF&&EOF.toast&&EOF.toast("No se ha podido descargar la imagen de tu porra. Inténtalo de nuevo.","error")}})}function porrasMensajeCompartir(){const a=typeof categoriaLabel=="function"?categoriaLabel(PORRAS_COMPETICION_ACTUAL):PORRAS_COMPETICION_ACTUAL;return`Así va mi porra de la jornada ${PORRAS_JORNADA_ACTUAL} de ${a} en ELOTROFÚTBOLTV. ¿Te atreves a superarla? ${location.origin}${location.pathname}`}async function compartirImagenPorra(a){const o=document.getElementById("btnCompartirPorra");await porrasConBotonOcupado(o,"Generando…",async()=>{try{const e=await generarBlobPorra(a),t=porrasNombreArchivo(),i=new File([e],t,{type:"image/png"});if(navigator.canShare&&navigator.canShare({files:[i]}))await navigator.share({files:[i],title:"Mi porra — ELOTROFÚTBOLTV",text:porrasMensajeCompartir()});else{const r=URL.createObjectURL(e),s=document.createElement("a");s.href=r,s.download=t,document.body.appendChild(s),s.click(),s.remove(),setTimeout(()=>URL.revokeObjectURL(r),4e3)}}catch(e){if(e&&e.name==="AbortError")return;window.EOF&&EOF.toast&&EOF.toast("No se ha podido generar la imagen de tu porra. Inténtalo de nuevo.","error")}})}

/* Selector de jornadas en PC: flechas, rueda del ratón y arrastre (sin barra de scroll visible). */
(function(){
  function iniciarSelectorJornadas(){
    const nav=document.getElementById("jornadasNav");
    if(!nav||nav.dataset.flechas)return;
    nav.dataset.flechas="1";
    const wrap=document.createElement("div");
    wrap.className="porras-jornadas-wrap";
    nav.parentNode.insertBefore(wrap,nav);
    wrap.appendChild(nav);
    const crear=dir=>{
      const b=document.createElement("button");
      b.type="button";
      b.className="porras-jornadas-flecha "+(dir<0?"izq":"der");
      b.setAttribute("aria-label",dir<0?"Jornadas anteriores":"Jornadas siguientes");
      b.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(dir<0?"M15 6l-6 6 6 6":"M9 6l6 6-6 6")+'"/></svg>';
      b.addEventListener("click",()=>nav.scrollBy({left:dir*Math.max(200,nav.clientWidth*.7),behavior:"smooth"}));
      wrap.appendChild(b);
      return b;
    };
    const izq=crear(-1),der=crear(1);
    const actualizar=()=>{
      const max=nav.scrollWidth-nav.clientWidth;
      izq.hidden=nav.scrollLeft<=2;
      der.hidden=nav.scrollLeft>=max-2;
    };
    nav.addEventListener("scroll",actualizar,{passive:true});
    window.addEventListener("resize",actualizar);
    // Cada vez que se repinta el selector: centra la jornada activa y recalcula las flechas.
    new MutationObserver(()=>requestAnimationFrame(()=>{
      const a=nav.querySelector(".porras-jornada-btn.activo");
      if(a){
        const x=a.getBoundingClientRect().left-nav.getBoundingClientRect().left+nav.scrollLeft;
        nav.scrollLeft=x-(nav.clientWidth-a.offsetWidth)/2;
      }
      actualizar();
    })).observe(nav,{childList:true});
    // Rueda vertical del ratón → desplazamiento horizontal (hasta llegar al borde).
    nav.addEventListener("wheel",e=>{
      if(Math.abs(e.deltaY)<=Math.abs(e.deltaX))return;
      const max=nav.scrollWidth-nav.clientWidth;
      if(max<=0)return;
      if((e.deltaY>0&&nav.scrollLeft<max-1)||(e.deltaY<0&&nav.scrollLeft>0)){
        e.preventDefault();
        nav.scrollLeft+=e.deltaY;
      }
    },{passive:false});
    // Arrastrar con el ratón.
    let arrastrando=false,movido=false,x0=0,s0=0;
    nav.addEventListener("pointerdown",e=>{
      if(e.pointerType!=="mouse"||e.button!==0)return;
      arrastrando=true;movido=false;x0=e.clientX;s0=nav.scrollLeft;
    });
    window.addEventListener("pointermove",e=>{
      if(!arrastrando)return;
      const dx=e.clientX-x0;
      if(!movido&&Math.abs(dx)>5){movido=true;nav.classList.add("arrastrando");}
      if(movido)nav.scrollLeft=s0-dx;
    });
    window.addEventListener("pointerup",()=>{
      if(!arrastrando)return;
      arrastrando=false;
      nav.classList.remove("arrastrando");
    });
    nav.addEventListener("click",e=>{
      if(movido){e.stopPropagation();e.preventDefault();movido=false;}
    },true);
    actualizar();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",iniciarSelectorJornadas);
  else iniciarSelectorJornadas();
})();
