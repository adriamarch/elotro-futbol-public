// Noticias rápidas: tarjetas con foto + titular + subtitular.
// Se usa en la portada (las 5 últimas, bloque #seccion-noticias-rapidas) y
// en noticias-rapidas.html (listado completo, #grid-noticias-rapidas).
// Endpoint público: GET /api/noticias-rapidas?limit=N
// Estilos: css/noticias-rapidas.css

const NR_ICONO_RAYO = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.2 2 4.5 13.4c-.4.5 0 1.2.6 1.2H10l-1.2 7.2c-.1.7.8 1.1 1.2.5l8.7-11.4c.4-.5 0-1.2-.6-1.2H14l1.2-7.2c.1-.7-.8-1.1-1.2-.5Z"/></svg>';
const NR_ICONO_FLECHA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';
const NR_ICONO_COMPARTIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
const NR_ICONO_CERRAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const NR_ICONO_MAS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const NR_CACHE = new Map(); // clave -> noticia completa (para el modal)
let NR_CLAVE_SEQ = 0;
const NR_PORTADA_CANTIDAD = 4; // 2 filas de 2 en la portada
const NR_POR_PAGINA = 11; // 1 destacada + 10 normales por tanda
const NR_MINUTOS_NUEVA = 180; // por debajo de 3 h se marca como "nueva" (chip rojo)

// created_at llega en UTC sin zona ("YYYY-MM-DD HH:MM:SS").
function nrParsearFecha(iso) {
  if (!iso) return null;
  const t = String(iso).trim().replace(" ", "T");
  const d = new Date(/Z$|[+-]\d\d:\d\d$/.test(t) ? t : t + "Z");
  return isNaN(d.getTime()) ? null : d;
}

function nrTiempoRelativo(iso) {
  const d = nrParsearFecha(iso);
  if (!d) return { texto: "", minutos: Infinity };
  const minutos = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  let texto;
  if (minutos < 1) texto = "Ahora mismo";
  else if (minutos < 60) texto = `Hace ${minutos} min`;
  else if (minutos < 1440) texto = `Hace ${Math.floor(minutos / 60)} h`;
  else if (minutos < 10080) texto = `Hace ${Math.floor(minutos / 1440)} d`;
  else texto = formatFecha(iso);
  return { texto, minutos };
}

// Avatar del autor: <img> con el foco del avatar si la API lo envía
// (autor_avatar_foco), para que el recorte redondo respete el punto elegido.
function nrAvatarImg(n, ancho, lazy) {
  if (!n.autor_avatar_url) return "";
  return `<img src="${escapeHtml(cloudinaryOptimizada(n.autor_avatar_url, ancho))}" alt=""${EOF_FOCO.attrs(n.autor_avatar_foco)}${lazy ? ' loading="lazy"' : ""} decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`;
}

function nrIniciales(nombre) {
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "·";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

function noticiaRapidaCardHTML(n, indice = 0, destacarPrimera = true) {
  const img = n.imagen_url ? cloudinaryOptimizada(n.imagen_url, indice === 0 && destacarPrimera ? 1100 : 600) : "img/default.jpg";
  const { texto: tiempo, minutos } = nrTiempoRelativo(n.created_at);
  const nueva = minutos < NR_MINUTOS_NUEVA;
  const destacada = destacarPrimera && indice === 0;
  const fechaCompleta = nrParsearFecha(n.created_at)
    ? nrParsearFecha(n.created_at).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" })
    : "";
  const autor = n.autor_nombre
    ? `<span class="nr-avatar" aria-hidden="true"><span class="nr-avatar-ini">${escapeHtml(nrIniciales(n.autor_nombre))}</span>${nrAvatarImg(n, 80, true)}</span>
       <span class="nr-meta-autor">${escapeHtml(n.autor_nombre)}</span>`
    : "";
  const clave = String(n.id != null ? n.id : "i" + (++NR_CLAVE_SEQ));
  NR_CACHE.set(clave, n);
  return `
    <article class="nr-card${destacada ? " nr-card--destacada" : ""}"${n.id ? ` id="nr-${n.id}"` : ""} data-nr-clave="${escapeHtml(clave)}" data-creada="${escapeHtml(String(n.created_at || ""))}" data-titulo="${escapeHtml(n.titulo)}" style="--i:${indice % 8}">
      <div class="nr-card-media">
        ${EOF_FOCO.img({ src: img, alt: n.titulo, foco: n.imagen_foco, eager: indice < 2 })}
        ${tiempo ? `<span data-nr-chip class="nr-chip${nueva ? " nr-chip--nuevo" : ""}"><span class="nr-chip-punto"></span>${escapeHtml(tiempo)}</span>` : ""}
        <button type="button" class="nr-compartir" data-nr-compartir aria-label="Compartir esta noticia" title="Compartir">${NR_ICONO_COMPARTIR}</button>
      </div>
      <div class="nr-card-cuerpo">
        <h3>${escapeHtml(n.titulo)}</h3>
        <p>${escapeHtml(n.subtitulo)}</p>
        <span class="nr-leer-mas" aria-hidden="true">Leer completa${NR_ICONO_MAS}</span>
        <div class="nr-meta">
          ${autor}
          <time class="nr-meta-fecha" datetime="${escapeHtml(String(n.created_at || ""))}" title="${escapeHtml(fechaCompleta)}">${escapeHtml(formatFecha(n.created_at))}</time>
        </div>
      </div>
    </article>`;
}

function nrEsqueletosHTML(cantidad) {
  return Array.from({ length: cantidad }, () => `
    <div class="nr-esqueleto">
      <div class="nr-esqueleto-foto"></div>
      <div class="nr-esqueleto-linea"></div>
      <div class="nr-esqueleto-linea corta"></div>
    </div>`).join("");
}

async function pedirNoticiasRapidas(limite) {
  const res = await apiFetch(`/api/noticias-rapidas?limit=${limite}`);
  const data = await res.json();
  return data.noticias_rapidas || [];
}

// Portada: si no hay ninguna noticia rápida, el bloque se queda oculto.
async function cargaNoticiasRapidasPortada() {
  const seccion = document.getElementById("seccion-noticias-rapidas");
  if (!seccion) return;
  try {
    const noticias = await pedirNoticiasRapidas(NR_PORTADA_CANTIDAD);
    if (!noticias.length) return;
    seccion.innerHTML = `
      <div class="nr-cabecera">
        <h2 class="nr-titulo"><span class="nr-rayo">${NR_ICONO_RAYO}</span>Noticias rápidas</h2>
        <a class="nr-ver-todas" href="noticias-rapidas">Ver todas${NR_ICONO_FLECHA}</a>
      </div>
      <div class="nr-grid">${noticias.map((n, i) => noticiaRapidaCardHTML(n, i, false)).join("")}</div>`;
    const grid = seccion.querySelector(".nr-grid");
    grid.dataset.total = noticias.length;
    nrRevelar(grid);
    seccion.hidden = false;
    nrDetectarCortadas(grid);
  } catch (err) {
    // Es un extra de la portada: si falla, simplemente no se muestra.
  }
}

// Página propia con el listado completo.
async function cargaNoticiasRapidasPagina() {
  const grid = document.getElementById("grid-noticias-rapidas");
  if (!grid) return;
  grid.innerHTML = nrEsqueletosHTML(6);
  try {
    const noticias = await conReintento(() => pedirNoticiasRapidas(50));
    const contador = document.getElementById("nrContadorPagina");
    if (contador) {
      contador.textContent = noticias.length ? `${noticias.length} ${noticias.length === 1 ? "noticia" : "noticias"}` : "";
      contador.hidden = !noticias.length;
    }
    if (!noticias.length) {
      grid.style.display = "block";
      grid.innerHTML = estadoHTML({
        titulo: "Todavía no hay noticias rápidas",
        texto: "Cuando se publique alguna, la verás aquí.",
        cta: `<a href="/" class="btn-volver">Ir a portada</a>`,
      });
      return;
    }
    grid.innerHTML = "";
    grid.dataset.total = noticias.length;
    nrPintarPagina(grid, noticias);
  } catch (err) {
    grid.style.display = "block";
    grid.innerHTML = estadoHTML({
      titulo: "No se ha podido conectar",
      texto: "Ha habido un problema al cargar las noticias rápidas. Inténtalo de nuevo en unos minutos.",
      tipo: "error",
    });
  }
}


// Entrada escalonada: las tarjetas aparecen al entrar en pantalla.
function nrRevelar(raiz) {
  const nuevas = raiz.querySelectorAll(".nr-card:not(.nr-reveal)");
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entradas) => {
    entradas.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("nr-visto"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
  nuevas.forEach((c) => { c.classList.add("nr-reveal"); io.observe(c); });
}

// Página propia: se pinta por tandas con botón "Ver más".
function nrPintarPagina(grid, noticias) {
  let mostradas = 0;
  const pie = document.createElement("div");
  pie.className = "nr-mas";
  grid.insertAdjacentElement("afterend", pie);
  const paso = () => {
    const trozo = noticias.slice(mostradas, mostradas + NR_POR_PAGINA);
    grid.insertAdjacentHTML("beforeend", trozo.map((n, i) => noticiaRapidaCardHTML(n, mostradas + i)).join(""));
    mostradas += trozo.length;
    nrRevelar(grid);
    nrDetectarCortadas(grid);
    const quedan = noticias.length - mostradas;
    pie.innerHTML = quedan > 0
      ? `<button type="button" class="nr-mas-btn">Ver más <span>(${quedan} restantes)</span></button><p>Mostrando ${mostradas} de ${noticias.length}</p>`
      : (noticias.length > NR_POR_PAGINA ? `<p>Has llegado al final · ${noticias.length} noticias</p>` : "");
    const b = pie.querySelector("button");
    if (b) b.addEventListener("click", paso);
  };
  paso();
  // Enlace compartido (#nr-123): se carga hasta esa tarjeta y se resalta.
  const m = location.hash.match(/^#nr-(\d+)$/);
  if (m) {
    while (mostradas < noticias.length && !grid.querySelector("#nr-" + m[1])) paso();
    const objetivo = grid.querySelector("#nr-" + m[1]);
    if (objetivo) setTimeout(() => {
      objetivo.classList.add("nr-visto", "nr-resaltada");
      objetivo.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350);
  }
}


// ---------------------------------------------------------------------
// Texto entero si cabe; si no, la tarjeta se marca como "cortada" y al
// pulsarla se abre el modal con la noticia completa.
// ---------------------------------------------------------------------
function nrEstaCortado(el) {
  return !!el && el.scrollHeight - el.clientHeight > 1;
}

function nrDetectarCortadas(raiz) {
  (raiz || document).querySelectorAll(".nr-card").forEach((card) => {
    const cortada = nrEstaCortado(card.querySelector("h3")) || nrEstaCortado(card.querySelector(".nr-card-cuerpo > p"));
    card.classList.toggle("nr-cortada", cortada);
    if (cortada) {
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-haspopup", "dialog");
      card.setAttribute("aria-label", "Leer la noticia completa: " + (card.dataset.titulo || ""));
    } else {
      card.removeAttribute("role");
      card.removeAttribute("tabindex");
      card.removeAttribute("aria-haspopup");
      card.removeAttribute("aria-label");
    }
  });
}

let nrTimerResize = null;
function nrRedetectar() {
  clearTimeout(nrTimerResize);
  nrTimerResize = setTimeout(() => nrDetectarCortadas(document), 150);
}
window.addEventListener("resize", nrRedetectar);
window.addEventListener("load", nrRedetectar);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(nrRedetectar);

// ---------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------
let nrModal = null;      // { raiz, tarjetas, indice, previo }
let nrModalCierre = null;

function nrModalHTML(n) {
  const img = n.imagen_url ? cloudinaryOptimizada(n.imagen_url, 1400) : "img/default.jpg";
  const { texto: tiempo, minutos } = nrTiempoRelativo(n.created_at);
  const f = nrParsearFecha(n.created_at);
  const fechaCompleta = f ? f.toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" }) : "";
  const autor = n.autor_nombre
    ? `<span class="nr-avatar" aria-hidden="true"><span class="nr-avatar-ini">${escapeHtml(nrIniciales(n.autor_nombre))}</span>${nrAvatarImg(n, 96, false)}</span>
       <span class="nr-modal-autor"><b>${escapeHtml(n.autor_nombre)}</b><small>Redacción</small></span>`
    : "";
  return `
    <div class="nr-modal-foto">
      ${EOF_FOCO.img({ src: img, alt: n.titulo, foco: n.imagen_foco, eager: true })}
      ${tiempo ? `<span class="nr-chip${minutos < NR_MINUTOS_NUEVA ? " nr-chip--nuevo" : ""}"><span class="nr-chip-punto"></span>${escapeHtml(tiempo)}</span>` : ""}
    </div>
    <div class="nr-modal-cuerpo">
      <div class="nr-modal-etiqueta"><span class="nr-rayo">${NR_ICONO_RAYO}</span>Noticia rápida</div>
      <h2 class="nr-modal-titulo" id="nrModalTitulo">${escapeHtml(n.titulo)}</h2>
      <p class="nr-modal-texto">${escapeHtml(n.subtitulo)}</p>
    </div>
    <div class="nr-modal-pie">
      <div class="nr-modal-firma">
        ${autor}
        <time datetime="${escapeHtml(String(n.created_at || ""))}">${escapeHtml(fechaCompleta)}</time>
      </div>
      <button type="button" class="nr-modal-compartir" data-nr-modal-compartir>${NR_ICONO_COMPARTIR}<span>Compartir</span></button>
    </div>`;
}

function nrModalPintar(sentido) {
  const m = nrModal;
  const card = m.tarjetas[m.indice];
  const n = NR_CACHE.get(card.dataset.nrClave);
  if (!n) return;
  const cont = m.raiz.querySelector(".nr-modal-contenido");
  cont.innerHTML = nrModalHTML(n);
  cont.scrollTop = 0;
  m.raiz.querySelector(".nr-modal-caja").scrollTop = 0;
  if (sentido) {
    cont.classList.remove("nr-modal-sale-izq", "nr-modal-sale-der");
    void cont.offsetWidth;
    cont.classList.add(sentido > 0 ? "nr-modal-sale-der" : "nr-modal-sale-izq");
  }
  const pos = m.raiz.querySelector(".nr-modal-pos");
  if (pos) pos.textContent = `${m.indice + 1} / ${m.tarjetas.length}`;
  m.raiz.querySelector("[data-nr-prev]").disabled = m.indice <= 0;
  m.raiz.querySelector("[data-nr-next]").disabled = m.indice >= m.tarjetas.length - 1;
}

function nrModalIr(delta) {
  if (!nrModal) return;
  const nuevo = nrModal.indice + delta;
  if (nuevo < 0 || nuevo >= nrModal.tarjetas.length) return;
  nrModal.indice = nuevo;
  nrModalPintar(delta);
}

function nrAbrirModal(card) {
  if (nrModal) return;
  const grid = card.closest(".nr-grid");
  const tarjetas = Array.from((grid || document).querySelectorAll(".nr-card"));
  const indice = Math.max(0, tarjetas.indexOf(card));

  const raiz = document.createElement("div");
  raiz.className = "nr-modal";
  raiz.innerHTML = `
    <div class="nr-modal-fondo" data-nr-cerrar></div>
    <div class="nr-modal-caja" role="dialog" aria-modal="true" aria-labelledby="nrModalTitulo" tabindex="-1">
      <span class="nr-modal-asa" aria-hidden="true"></span>
      <button type="button" class="nr-modal-cerrar" data-nr-cerrar aria-label="Cerrar">${NR_ICONO_CERRAR}</button>
      <div class="nr-modal-contenido"></div>
      <nav class="nr-modal-nav" aria-label="Navegar entre noticias">
        <button type="button" data-nr-prev aria-label="Noticia anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
        <span class="nr-modal-pos"></span>
        <button type="button" data-nr-next aria-label="Noticia siguiente">${NR_ICONO_FLECHA}</button>
      </nav>
    </div>`;
  document.body.appendChild(raiz);
  nrModal = { raiz, tarjetas, indice, previo: document.activeElement };
  nrModalPintar(0);

  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.classList.add("nr-modal-abierto");
  if (scrollbar > 0) document.body.style.paddingRight = scrollbar + "px";

  requestAnimationFrame(() => {
    raiz.classList.add("nr-modal--visible");
    raiz.querySelector(".nr-modal-caja").focus({ preventScroll: true });
  });

  // Gesto de arrastrar hacia abajo para cerrar (móvil)
  const caja = raiz.querySelector(".nr-modal-caja");
  let y0 = null, dy = 0;
  caja.addEventListener("touchstart", (e) => {
    const sc = raiz.querySelector(".nr-modal-contenido");
    if (sc.scrollTop <= 0 && window.innerWidth < 720) { y0 = e.touches[0].clientY; dy = 0; }
  }, { passive: true });
  caja.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0) { caja.style.transition = "none"; caja.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  caja.addEventListener("touchend", () => {
    if (y0 == null) return;
    caja.style.transition = "";
    if (dy > 110) nrCerrarModal(); else caja.style.transform = "";
    y0 = null; dy = 0;
  });
}

function nrCerrarModal() {
  if (!nrModal) return;
  const { raiz, previo } = nrModal;
  nrModal = null;
  raiz.classList.remove("nr-modal--visible");
  raiz.classList.add("nr-modal--saliendo");
  const fin = () => {
    raiz.remove();
    document.documentElement.classList.remove("nr-modal-abierto");
    document.body.style.paddingRight = "";
    if (previo && previo.focus && document.contains(previo)) previo.focus({ preventScroll: true });
  };
  const reducido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducido) fin(); else setTimeout(fin, 260);
}

async function nrCompartirModal() {
  if (!nrModal) return;
  const card = nrModal.tarjetas[nrModal.indice];
  const n = NR_CACHE.get(card.dataset.nrClave) || {};
  const url = location.origin + "/noticias-rapidas" + (card.id ? "#" + card.id : "");
  try {
    if (navigator.share) { await navigator.share({ title: n.titulo || "Noticia rápida", url }); return; }
    await navigator.clipboard.writeText(url);
    nrToast("Enlace copiado");
  } catch (err) {
    if (!err || err.name !== "AbortError") nrToast("No se ha podido copiar el enlace");
  }
}

document.addEventListener("keydown", (ev) => {
  if (nrModal) {
    if (ev.key === "Escape") { ev.preventDefault(); nrCerrarModal(); return; }
    if (ev.key === "ArrowLeft") { ev.preventDefault(); nrModalIr(-1); return; }
    if (ev.key === "ArrowRight") { ev.preventDefault(); nrModalIr(1); return; }
    if (ev.key === "Tab") { // el foco no sale del modal
      const f = Array.from(nrModal.raiz.querySelectorAll("button:not([disabled])"));
      if (!f.length) return;
      const caja = nrModal.raiz.querySelector(".nr-modal-caja");
      const primero = f[0], ultimo = f[f.length - 1];
      if (ev.shiftKey && (document.activeElement === primero || document.activeElement === caja)) { ev.preventDefault(); ultimo.focus(); }
      else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
    }
    return;
  }
  if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList && ev.target.classList.contains("nr-cortada")) {
    ev.preventDefault();
    nrAbrirModal(ev.target);
  }
});

function nrToast(texto) {
  document.querySelectorAll(".nr-toast").forEach((t) => t.remove());
  const t = document.createElement("div");
  t.className = "nr-toast";
  t.setAttribute("role", "status");
  t.textContent = texto;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

async function nrCompartir(btn) {
  const card = btn.closest(".nr-card");
  if (!card) return;
  const url = location.origin + "/noticias-rapidas" + (card.id ? "#" + card.id : "");
  const titulo = card.dataset.titulo || "Noticia rápida";
  try {
    if (navigator.share) { await navigator.share({ title: titulo, url }); return; }
    await navigator.clipboard.writeText(url);
    nrToast("Enlace copiado");
  } catch (err) {
    if (!err || err.name !== "AbortError") nrToast("No se ha podido copiar el enlace");
  }
}

// "Hace 12 min" se mantiene al día sin recargar la página.
function nrActualizarTiempos() {
  document.querySelectorAll(".nr-card[data-creada]").forEach((card) => {
    const chip = card.querySelector("[data-nr-chip]");
    if (!chip) return;
    const { texto, minutos } = nrTiempoRelativo(card.dataset.creada);
    if (chip.lastChild) chip.lastChild.textContent = texto;
    chip.classList.toggle("nr-chip--nuevo", minutos < NR_MINUTOS_NUEVA);
  });
}

document.addEventListener("click", (ev) => {
  const t = ev.target;
  if (nrModal) {
    if (t.closest("[data-nr-cerrar]")) { nrCerrarModal(); return; }
    if (t.closest("[data-nr-prev]")) { nrModalIr(-1); return; }
    if (t.closest("[data-nr-next]")) { nrModalIr(1); return; }
    if (t.closest("[data-nr-modal-compartir]")) { nrCompartirModal(); return; }
    return;
  }
  const b = t.closest("[data-nr-compartir]");
  if (b) { ev.preventDefault(); nrCompartir(b); return; }
  const card = t.closest(".nr-card.nr-cortada");
  if (card) { ev.preventDefault(); nrAbrirModal(card); }
});

document.addEventListener("DOMContentLoaded", () => {
  setInterval(() => { if (!document.hidden) nrActualizarTiempos(); }, 60000);
  cargaNoticiasRapidasPortada();
  cargaNoticiasRapidasPagina();
});
