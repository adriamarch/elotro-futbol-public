// ---------- Modales bonitos para acciones sobre un partido (panel > Resultados) ----------
// Sustituyen a "te lleva al formulario" / "te pide la hora en un cuadro de texto":
//   · EOFModalesPartido.pedirFechaHora(r)  → Reprogramar: calendario + hora. Devuelve { fecha, hora, fecha_partido } o null.
//   · EOFModalesPartido.pedirHora(r)       → Retrasar: nueva hora con atajos (+15 min...). Devuelve { hora } o null.
//   · EOFModalesPartido.confirmarAnular(r) → Anular: confirmación con resumen de lo que pasará. Devuelve true/false.
// Solo piden los datos: la llamada a la API la sigue haciendo admin.js (reprogramarPartidoAnulado,
// retrasarPartidoDesdeLista, anularPartidoDesdeLista), que usan estos modales si están cargados.
// Estilos: css/modales-partido.css. Sin dependencias; se apoya en escapeHtml() si existe.
(function () {
  if (window.EOFModalesPartido) return;

  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
  const HORAS_RAPIDAS = ["12:00", "16:00", "18:00", "19:00", "20:00", "21:00"];

  const ICO = {
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="m9 15 2 2 4-4"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>',
    anular: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.5"/></svg>',
    papelera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.2a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L18 7M9 7V4.5h6V7"/></svg>',
    aviso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2h.01"/></svg>',
    marcador: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M12 5v14"/><path d="M7 10.5h.01M7 13.5h.01M17 10.5h.01M17 13.5h.01"/></svg>',
    flecha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };

  const esc = (s) => (typeof escapeHtml === "function" ? escapeHtml(s) : String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const sumaDias = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  const horaValida = (h) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(h || "").trim());
  const horaNorm = (h) => { const [a, b] = String(h).trim().split(":"); return `${pad(Number(a))}:${b}`; };
  const minutos = (h) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
  const deMinutos = (m) => { m = Math.max(0, Math.min(23 * 60 + 59, m)); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };

  // "Hoy" según la hora de Madrid (el medio y los partidos van en esa zona).
  function hoyMadrid() {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return p; // YYYY-MM-DD
  }
  function fechaLarga(f) {
    return parse(f).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function fechaCorta(f) {
    return parse(f).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
  }

  // ---------- Cabecera con el partido ----------
  // La BD casi nunca guarda la URL del escudo (solo equipos "personalizados"): el resto se
  // resuelve por nombre con getEscudoUrl (clubs.js), igual que en la web pública. Las rutas
  // son relativas (img/escudos/...), así que se pasan a absolutas porque el panel vive en /admin/.
  function urlEscudo(url, nombre) {
    let u = url || "";
    try { if (typeof getEscudoUrl === "function") u = getEscudoUrl(nombre, url) || u; } catch (e) {}
    if (u && !/^(https?:)?\/\//.test(u) && !u.startsWith("/") && !u.startsWith("data:")) u = "/" + u;
    return u;
  }
  function escudoHTML(url, nombre) {
    const inicial = esc(String(nombre || "?").trim().charAt(0).toUpperCase());
    const u = urlEscudo(url, nombre);
    return u
      ? `<span class="mp-escudo"><img src="${esc(u)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('mp-escudo-vacio');this.remove()"><b>${inicial}</b></span>`
      : `<span class="mp-escudo mp-escudo-vacio"><b>${inicial}</b></span>`;
  }
  function partidoHTML(r) {
    const f = r.fecha_partido ? String(r.fecha_partido).slice(0, 10) : "";
    const h = r.fecha_partido ? String(r.fecha_partido).slice(11, 16) : "";
    const meta = [r.jornada ? `Jornada ${esc(r.jornada)}` : "", f ? `${esc(fechaCorta(f))}${h ? " · " + esc(h) : ""}` : ""].filter(Boolean).join(" · ");
    return `<div class="mp-partido">
      <div class="mp-eq">${escudoHTML(r.escudo_local_url, r.equipo_local)}<span>${esc(r.equipo_local)}</span></div>
      <span class="mp-vs">vs</span>
      <div class="mp-eq">${escudoHTML(r.escudo_visitante_url, r.equipo_visitante)}<span>${esc(r.equipo_visitante)}</span></div>
      ${meta ? `<p class="mp-partido-meta">${meta}</p>` : ""}
    </div>`;
  }

  // ---------- Armazón común ----------
  // cfg: { r, icono, titulo, sub, cuerpo, confirmar, peligroso, ancho, alAbrir(ctl) → () => valor|undefined }
  function abrirModal(cfg) {
    return new Promise((resolve) => {
      const previo = document.activeElement;
      const ov = document.createElement("div");
      ov.className = "mp-overlay";
      ov.innerHTML = `<div class="mp-caja${cfg.peligroso ? " mp-peligro" : ""}${cfg.ancho ? " mp-ancho" : ""}" role="dialog" aria-modal="true" aria-labelledby="mpTitulo">
        <button type="button" class="mp-x" data-mp="cancelar" aria-label="Cerrar">✕</button>
        <div class="mp-cab"><span class="mp-ico">${cfg.icono}</span><div><h3 id="mpTitulo">${esc(cfg.titulo)}</h3><p>${esc(cfg.sub)}</p></div></div>
        ${cfg.r ? partidoHTML(cfg.r) : (cfg.cabecera || "")}
        <div class="mp-cuerpo">${cfg.cuerpo}</div>
        <div class="mp-pie">
          <button type="button" class="mp-btn mp-btn-sec" data-mp="cancelar">Cancelar</button>
          <button type="button" class="mp-btn mp-btn-pri" data-mp="ok">${esc(cfg.confirmar)}</button>
        </div>
      </div>`;
      document.body.appendChild(ov);
      document.body.classList.add("mp-abierto");
      const caja = ov.querySelector(".mp-caja");
      const ok = ov.querySelector('[data-mp="ok"]');
      let cerrado = false;
      let leer = () => true;

      const cerrar = (valor) => {
        if (cerrado) return;
        cerrado = true;
        document.removeEventListener("keydown", tecla, true);
        ov.classList.remove("mp-vis");
        setTimeout(() => { ov.remove(); if (!document.querySelector(".mp-overlay")) document.body.classList.remove("mp-abierto"); }, 200);
        try { if (previo && previo.focus) previo.focus(); } catch (e) {}
        resolve(valor);
      };
      const aceptar = () => { if (!ok.disabled) cerrar(leer()); };

      function tecla(ev) {
        if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); cerrar(cfg.valorCancelar); return; }
        if (ev.key === "Enter" && ev.target && ev.target.tagName === "INPUT") { ev.preventDefault(); aceptar(); return; }
        if (ev.key === "Tab") { // el foco no se escapa del modal
          const f = [...caja.querySelectorAll('button:not([disabled]),input:not([disabled]),[tabindex="0"]')].filter((e) => e.offsetParent !== null);
          if (!f.length) return;
          const primero = f[0], ultimo = f[f.length - 1];
          if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus(); }
          else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
        }
      }
      document.addEventListener("keydown", tecla, true);
      ov.addEventListener("mousedown", (ev) => { if (ev.target === ov) cerrar(cfg.valorCancelar); });
      ov.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-mp]");
        if (!b) return;
        if (b.dataset.mp === "cancelar") cerrar(cfg.valorCancelar);
        else if (b.dataset.mp === "ok") aceptar();
      });

      leer = cfg.alAbrir ? cfg.alAbrir({ ov, caja, ok }) || (() => true) : () => true;
      requestAnimationFrame(() => {
        ov.classList.add("mp-vis");
        const foco = caja.querySelector("[data-mp-foco]") || (cfg.peligroso ? caja.querySelector('[data-mp="cancelar"].mp-btn') : ok);
        try { foco && foco.focus({ preventScroll: true }); } catch (e) {}
      });
    });
  }

  // ---------- 1) Reprogramar: calendario + hora ----------
  function pedirFechaHora(r) {
    const hoy = hoyMadrid();
    const fOrig = r.fecha_partido ? String(r.fecha_partido).slice(0, 10) : "";
    const hOrig = r.fecha_partido ? String(r.fecha_partido).slice(11, 16) : "";
    const cuerpo = `
      <div class="mp-dos">
        <div class="mp-col">
          <div class="mp-etq">Día del partido</div>
          <div class="mp-atajos" id="mpAtajos"></div>
          <div class="mp-cal" id="mpCal"></div>
        </div>
        <div class="mp-col">
          <div class="mp-etq"><label for="mpHora">Hora de inicio</label></div>
          <input type="time" id="mpHora" class="mp-hora" step="300" required>
          <div class="mp-atajos mp-atajos-horas" id="mpHoras"></div>
          <div class="mp-resumen" id="mpResumen" role="status" aria-live="polite"></div>
        </div>
      </div>`;
    return abrirModal({
      r, icono: ICO.cal, titulo: "Reprogramar partido", sub: "Elige cuándo se jugará. Volverá a «Por jugar».",
      cuerpo, confirmar: "Reprogramar", ancho: true, valorCancelar: null,
      alAbrir({ caja, ok }) {
        const cal = caja.querySelector("#mpCal"), atajos = caja.querySelector("#mpAtajos");
        const inHora = caja.querySelector("#mpHora"), horasEl = caja.querySelector("#mpHoras"), resumen = caja.querySelector("#mpResumen");
        let sel = "";
        let mes = parse(fOrig && fOrig > hoy ? fOrig : hoy); mes = new Date(mes.getFullYear(), mes.getMonth(), 1);
        inHora.value = horaValida(hOrig) ? horaNorm(hOrig) : "18:00";
        inHora.setAttribute("data-mp-foco", "");

        const proximo = (dow) => { const d = parse(hoy); let n = (dow - d.getDay() + 7) % 7; if (n === 0) n = 7; return ymd(sumaDias(d, n)); };
        const ATAJOS = [
          ["Mañana", ymd(sumaDias(parse(hoy), 1))],
          ["Sábado", proximo(6)],
          ["Domingo", proximo(0)],
          ["En 1 semana", ymd(sumaDias(parse(hoy), 7))],
          ["En 2 semanas", ymd(sumaDias(parse(hoy), 14))],
        ];
        // Sin atajos repetidos: si "Sábado" cae el mismo día que "En 1 semana", solo sale el primero.
        const vistos = new Set();
        const ATAJOS_UNICOS = ATAJOS.filter(([, f]) => (vistos.has(f) ? false : (vistos.add(f), true)));
        atajos.innerHTML = ATAJOS_UNICOS.map(([t, f]) => `<button type="button" class="mp-chip" data-f="${f}" title="${esc(fechaLarga(f))}">${t}</button>`).join("");
        horasEl.innerHTML = HORAS_RAPIDAS.map((h) => `<button type="button" class="mp-chip" data-h="${h}">${h}</button>`).join("");

        function pintarCal() {
          const primerDia = new Date(mes.getFullYear(), mes.getMonth(), 1);
          const offset = (primerDia.getDay() + 6) % 7; // lunes primero
          const diasMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
          let celdas = "";
          for (let i = 0; i < offset; i++) celdas += '<span class="mp-dia mp-dia-vacio"></span>';
          for (let n = 1; n <= diasMes; n++) {
            const f = `${mes.getFullYear()}-${pad(mes.getMonth() + 1)}-${pad(n)}`;
            const cls = ["mp-dia", f === hoy ? "mp-hoy" : "", f < hoy ? "mp-pasado" : "", f === sel ? "mp-sel" : "", f === fOrig ? "mp-orig" : ""].filter(Boolean).join(" ");
            celdas += `<button type="button" class="${cls}" data-f="${f}" aria-pressed="${f === sel}" aria-label="${esc(fechaLarga(f))}">${n}</button>`;
          }
          cal.innerHTML = `<div class="mp-cal-cab">
              <button type="button" class="mp-nav" data-nav="-1" aria-label="Mes anterior">‹</button>
              <strong>${MESES[mes.getMonth()]} ${mes.getFullYear()}</strong>
              <button type="button" class="mp-nav" data-nav="1" aria-label="Mes siguiente">›</button>
            </div>
            <div class="mp-cal-sem">${DIAS.map((d) => `<span>${d}</span>`).join("")}</div>
            <div class="mp-cal-grid">${celdas}</div>
            ${fOrig ? `<p class="mp-leyenda"><span class="mp-punto-orig"></span> Fecha original: ${esc(fechaCorta(fOrig))}</p>` : ""}`;
        }
        function actualizar() {
          const hOk = horaValida(inHora.value);
          atajos.querySelectorAll(".mp-chip").forEach((b) => b.classList.toggle("mp-chip-act", b.dataset.f === sel));
          horasEl.querySelectorAll(".mp-chip").forEach((b) => b.classList.toggle("mp-chip-act", hOk && b.dataset.h === horaNorm(inHora.value)));
          if (sel && hOk) {
            const pasado = sel < hoy;
            resumen.className = "mp-resumen mp-resumen-ok" + (pasado ? " mp-resumen-aviso" : "");
            resumen.innerHTML = `<span>Se jugará el</span><strong>${esc(fechaLarga(sel))}</strong><span>a las <b>${esc(horaNorm(inHora.value))}</b></span>${pasado ? '<em>Ojo: esa fecha ya ha pasado.</em>' : ""}`;
          } else {
            resumen.className = "mp-resumen";
            resumen.innerHTML = `<span class="mp-resumen-vacio">${sel ? "Pon una hora válida (HH:MM)." : "Elige un día en el calendario."}</span>`;
          }
          ok.disabled = !(sel && hOk);
        }
        cal.addEventListener("click", (ev) => {
          const nav = ev.target.closest("[data-nav]");
          if (nav) { mes = new Date(mes.getFullYear(), mes.getMonth() + Number(nav.dataset.nav), 1); pintarCal(); return; }
          const d = ev.target.closest(".mp-dia[data-f]");
          if (d) { sel = d.dataset.f; pintarCal(); actualizar(); }
        });
        atajos.addEventListener("click", (ev) => {
          const b = ev.target.closest("[data-f]");
          if (!b) return;
          sel = b.dataset.f; const p = parse(sel); mes = new Date(p.getFullYear(), p.getMonth(), 1); pintarCal(); actualizar();
        });
        horasEl.addEventListener("click", (ev) => { const b = ev.target.closest("[data-h]"); if (b) { inHora.value = b.dataset.h; actualizar(); } });
        inHora.addEventListener("input", actualizar);
        pintarCal(); actualizar();
        return () => ({ fecha: sel, hora: horaNorm(inHora.value), fecha_partido: `${sel}T${horaNorm(inHora.value)}` });
      },
    });
  }

  // ---------- 2) Retrasar: nueva hora ----------
  function pedirHora(r) {
    const hOrig = r.fecha_partido ? String(r.fecha_partido).slice(11, 16) : "";
    const f = r.fecha_partido ? String(r.fecha_partido).slice(0, 10) : "";
    const base = horaValida(hOrig) ? horaNorm(hOrig) : "17:00";
    const cuerpo = `
      <div class="mp-compara">
        <div><small>Hora actual</small><b>${esc(hOrig || "—")}</b></div>
        <span class="mp-compara-flecha">${ICO.flecha}</span>
        <div class="mp-compara-nueva"><small>Nueva hora</small><b id="mpNueva">${esc(base)}</b></div>
      </div>
      <div class="mp-etq"><label for="mpHora">Nueva hora prevista de inicio</label></div>
      <input type="time" id="mpHora" class="mp-hora mp-hora-grande" step="300" required>
      <div class="mp-etq mp-etq-sec">Retrasar desde la hora actual</div>
      <div class="mp-atajos" id="mpMas"></div>
      <p class="mp-nota">${f ? `Sigue siendo el ${esc(fechaLarga(f))}; solo cambia la hora. ` : ""}El partido quedará marcado como «Retrasado».</p>`;
    return abrirModal({
      r, icono: ICO.reloj, titulo: "Retrasar partido", sub: "Indica a qué hora empezará ahora.",
      cuerpo, confirmar: "Marcar como retrasado", valorCancelar: null,
      alAbrir({ caja, ok }) {
        const inHora = caja.querySelector("#mpHora"), nueva = caja.querySelector("#mpNueva"), mas = caja.querySelector("#mpMas");
        inHora.value = base; inHora.setAttribute("data-mp-foco", "");
        const SUMAS = [["+15 min", 15], ["+30 min", 30], ["+45 min", 45], ["+1 h", 60], ["+2 h", 120]];
        // Si sumar pasaría de las 23:59 (cambiaría de día), el atajo se desactiva en vez de
        // quedarse mudo en 23:59: para pasarlo a otro día está «Reprogramar».
        mas.innerHTML = SUMAS.map(([t, m]) => `<button type="button" class="mp-chip" data-m="${m}"${minutos(base) + m > 23 * 60 + 59 ? ' disabled title="Pasaría a otro día: usa Reprogramar"' : ""}>${t}</button>`).join("");
        function actualizar() {
          const v = horaValida(inHora.value);
          nueva.textContent = v ? horaNorm(inHora.value) : "—";
          nueva.parentNode.classList.toggle("mp-invalida", !v);
          mas.querySelectorAll(".mp-chip").forEach((b) => b.classList.toggle("mp-chip-act", v && horaNorm(inHora.value) === deMinutos(minutos(base) + Number(b.dataset.m))));
          ok.disabled = !v;
        }
        mas.addEventListener("click", (ev) => { const b = ev.target.closest("[data-m]"); if (b) { inHora.value = deMinutos(minutos(base) + Number(b.dataset.m)); actualizar(); } });
        inHora.addEventListener("input", actualizar);
        actualizar();
        return () => ({ hora: horaNorm(inHora.value) });
      },
    });
  }

  // ---------- 3) Anular: confirmación con resumen ----------
  function confirmarAnular(r) {
    const enJuego = r.estado === "en_juego";
    const cuerpo = `<ul class="mp-lista">
        <li>Pasará a estado <b>«Anulado»</b> y dejará de contar como partido por jugar.</li>
        <li>Quedará en <b>Anulados</b> como «Sin reprogramar» hasta que le pongas nueva fecha.</li>
        ${enJuego ? "<li>El cronómetro en directo se <b>pausará</b> en el minuto actual.</li>" : ""}
      </ul>`;
    return abrirModal({
      r, icono: ICO.anular, titulo: "Anular partido", sub: "Acaba jugándose otro día: luego podrás reprogramarlo.",
      cuerpo, confirmar: "Sí, anular partido", peligroso: true, valorCancelar: false,
      alAbrir() { return () => true; },
    });
  }

  // ---------- 4) Finalizado sin cubrir: confirmar el marcador ----------
  // Lo abre el botón «Confirmar resultado» de los partidos que el cron cerró solo.
  // Devuelve { goles_local, goles_visitante } o null si se cancela.
  // Ayudas: muestra con qué marcador lo dejó el sistema, sugiere el marcador que resulta de los goles
  // registrados en el minuto a minuto (GET /api/results/:id/eventos; si falla, simplemente no se sugiere),
  // avisa si se cambia el marcador del sistema y el botón confirma con el marcador elegido.
  function marcadorDeEventos(eventos) {
    let l = 0, v = 0, hay = false;
    (eventos || []).forEach((e) => {
      const lado = e.equipo === "local" ? "local" : e.equipo === "visitante" ? "visitante" : null;
      if (!lado) return;
      const suma = (para, d) => { if (para === "local") l += d; else v += d; };
      if (e.tipo === "gol") { suma(lado, 1); hay = true; }
      else if (e.tipo === "gol_pp") { suma(lado === "local" ? "visitante" : "local", 1); hay = true; } // propia puerta: gol para el rival
      else if (e.tipo === "gol_var" && Number(e.bajar_gol)) { suma(lado, -1); hay = true; }
    });
    return hay ? { l: Math.max(0, l), v: Math.max(0, v) } : null;
  }

  function confirmarMarcador(r) {
    const entero = (x) => (x !== null && x !== undefined && x !== "" && Number.isInteger(Number(x)) ? Number(x) : null);
    const sl = entero(r.goles_local), sv = entero(r.goles_visitante);   // lo que dejó el sistema
    const gl = sl === null ? 0 : sl;
    const gv = sv === null ? 0 : sv;
    const paso = (id, nombre, v, escudo) => `<div class="mp-gol">
        ${escudoHTML(escudo, nombre)}
        <span class="mp-gol-eq">${esc(nombre)}</span>
        <div class="mp-gol-ctl">
          <button type="button" class="mp-nav" data-gol="${id}:-1" aria-label="Quitar un gol a ${esc(nombre)}">−</button>
          <input type="number" id="${id}" class="mp-hora mp-gol-in" min="0" max="99" step="1" value="${v}" inputmode="numeric" aria-label="Goles de ${esc(nombre)}">
          <button type="button" class="mp-nav" data-gol="${id}:1" aria-label="Sumar un gol a ${esc(nombre)}">+</button>
        </div>
      </div>`;
    const cuerpo = `
      <div class="mp-sistema" role="note"><span class="mp-sistema-tag">${ICO.aviso}Cerrado por el sistema</span><span class="mp-sistema-txt">${sl !== null && sv !== null ? `Lo dejó en <b>${sl} : ${sv}</b>` : "Sin marcador guardado"}</span></div>
      <div class="mp-marcador">${paso("mpGolL", r.equipo_local, gl, r.escudo_local_url)}<span class="mp-marcador-sep">:</span>${paso("mpGolV", r.equipo_visitante, gv, r.escudo_visitante_url)}</div>
      <div class="mp-resumen mp-resumen-ok" id="mpResumen" role="status" aria-live="polite"></div>
      <div class="mp-cambio" id="mpCambio" hidden></div>
      <div class="mp-sugerido" id="mpSugerido" hidden></div>
      <p class="mp-nota">Al confirmar, el partido deja de estar «sin cubrir»: <b>cuenta en la clasificación y en las estadísticas</b>. Los goles y tarjetas de cada jugador se añaden aparte, desde Editar.</p>`;
    return abrirModal({
      r, icono: ICO.marcador, titulo: "Confirmar resultado", sub: "Este partido lo cerró el sistema solo. Comprueba el marcador final.",
      cuerpo, confirmar: "Confirmar resultado", valorCancelar: null,
      alAbrir({ caja, ok }) {
        const l = caja.querySelector("#mpGolL"), v = caja.querySelector("#mpGolV"), resumen = caja.querySelector("#mpResumen");
        const cambio = caja.querySelector("#mpCambio"), sugerido = caja.querySelector("#mpSugerido");
        l.setAttribute("data-mp-foco", "");
        const valido = (e) => /^\d{1,2}$/.test(String(e.value).trim());
        let sugerencia = null;
        function pintarSugerencia() {
          if (!sugerencia) { sugerido.hidden = true; return; }
          const igual = valido(l) && valido(v) && Number(l.value) === sugerencia.l && Number(v.value) === sugerencia.v;
          sugerido.hidden = false;
          sugerido.className = "mp-sugerido" + (igual ? " mp-sugerido-ok" : "");
          sugerido.innerHTML = igual
            ? `<span class="mp-sugerido-ico">${ICO.check}</span><span>Coincide con los goles registrados en el minuto a minuto (<b>${sugerencia.l} : ${sugerencia.v}</b>).</span>`
            : `<span class="mp-sugerido-ico">${ICO.reloj}</span><span>Los goles del minuto a minuto suman <b>${sugerencia.l} : ${sugerencia.v}</b>.</span><button type="button" class="mp-chip" data-usar="1">Usar ese marcador</button>`;
        }
        function actualizar() {
          const okk = valido(l) && valido(v);
          if (okk) {
            const a = Number(l.value), b = Number(v.value);
            const veredicto = a === b ? "Empate" : `Gana ${a > b ? r.equipo_local : r.equipo_visitante}`;
            resumen.innerHTML = `<span>${esc(veredicto)}</span><strong>${esc(r.equipo_local)} ${a} : ${b} ${esc(r.equipo_visitante)}</strong>`;
            ok.textContent = `Confirmar ${a} : ${b}`;
            const distinto = sl === null || sv === null || a !== sl || b !== sv;
            cambio.hidden = !(distinto && sl !== null && sv !== null);
            if (!cambio.hidden) cambio.innerHTML = `Cambias el marcador del sistema (<b>${sl} : ${sv}</b>) por <b>${a} : ${b}</b>.`;
          } else {
            resumen.innerHTML = `<span class="mp-resumen-vacio">Pon un número de goles (0 a 99) en cada equipo.</span>`;
            ok.textContent = "Confirmar resultado";
            cambio.hidden = true;
          }
          resumen.className = "mp-resumen" + (okk ? " mp-resumen-ok" : "");
          ok.disabled = !okk;
          pintarSugerencia();
        }
        caja.addEventListener("click", (ev) => {
          const u = ev.target.closest("[data-usar]");
          if (u && sugerencia) { l.value = sugerencia.l; v.value = sugerencia.v; actualizar(); return; }
          const b = ev.target.closest("[data-gol]");
          if (!b) return;
          const [id, d] = b.dataset.gol.split(":");
          const inp = caja.querySelector("#" + id);
          inp.value = Math.max(0, Math.min(99, (parseInt(inp.value, 10) || 0) + Number(d)));
          actualizar();
        });
        [l, v].forEach((i) => i.addEventListener("focus", () => { try { i.select(); } catch (e) {} }));
        l.addEventListener("input", actualizar); v.addEventListener("input", actualizar);
        actualizar();
        // Sugerencia a partir de los eventos (no bloquea el modal: aparece cuando llega).
        if (r.id !== undefined && typeof apiFetch === "function") {
          Promise.resolve(apiFetch(`/api/results/${r.id}/eventos`)).then((d) => {
            sugerencia = marcadorDeEventos(d && d.eventos);
            pintarSugerencia();
          }).catch(() => {});
        }
        return () => ({ goles_local: Number(l.value), goles_visitante: Number(v.value) });
      },
    });
  }

  // ---------- 5) Eliminar: confirmación con resumen ----------
  function confirmarEliminar(r) {
    const cuerpo = `<ul class="mp-lista">
        <li>El partido <b>desaparece del panel y de la web</b>.</li>
        <li>Se borran también sus <b>eventos, alineaciones y fotos de galería</b> vinculados.</li>
        <li>Las noticias enlazadas se conservan, pero dejan de estar vinculadas al partido.</li>
        <li><b>No se puede deshacer.</b> Si solo está mal la fecha o el estado, mejor usa Editar o Reprogramar.</li>
      </ul>`;
    return abrirModal({
      r, icono: ICO.papelera, titulo: "Eliminar partido", sub: "Esta acción es definitiva.",
      cuerpo, confirmar: "Sí, eliminar partido", peligroso: true, valorCancelar: false,
      alAbrir() { return () => true; },
    });
  }

  // ---------- 6) Corregir el minuto del cronómetro (panel Minuto a Minuto) ----------
  // Devuelve { minuto } (0-130) o null. "actual" es el minuto que marca ahora el reloj.
  function pedirMinuto(r, actual) {
    const base = Number.isFinite(Number(actual)) ? Math.max(0, Math.min(130, Math.round(Number(actual)))) : 0;
    const cuerpo = `
      <div class="mp-compara">
        <div><small>Marca ahora</small><b>${base}'</b></div>
        <span class="mp-compara-flecha">${ICO.flecha}</span>
        <div class="mp-compara-nueva"><small>Minuto correcto</small><b id="mpNueva">${base}'</b></div>
      </div>
      <div class="mp-etq"><label for="mpMin">Minuto del partido</label></div>
      <div class="mp-gol-ctl mp-min-ctl">
        <button type="button" class="mp-nav" data-d="-5" aria-label="Restar 5 minutos">−5</button>
        <button type="button" class="mp-nav" data-d="-1" aria-label="Restar 1 minuto">−</button>
        <input type="number" id="mpMin" class="mp-hora mp-gol-in" min="0" max="130" step="1" value="${base}" inputmode="numeric">
        <button type="button" class="mp-nav" data-d="1" aria-label="Sumar 1 minuto">+</button>
        <button type="button" class="mp-nav" data-d="5" aria-label="Sumar 5 minutos">+5</button>
      </div>
      <p class="mp-nota">El reloj seguirá corriendo desde ese minuto. No cambia ningún evento ya registrado.</p>`;
    return abrirModal({
      r, icono: ICO.reloj, titulo: "Corregir el minuto", sub: "Ajusta el cronómetro si se ha desviado del partido real.",
      cuerpo, confirmar: "Corregir minuto", valorCancelar: null,
      alAbrir({ caja, ok }) {
        const inp = caja.querySelector("#mpMin"), nueva = caja.querySelector("#mpNueva");
        inp.setAttribute("data-mp-foco", "");
        const valido = () => /^\d{1,3}$/.test(String(inp.value).trim()) && Number(inp.value) <= 130;
        function actualizar() {
          const v = valido();
          nueva.textContent = v ? `${Number(inp.value)}'` : "—";
          nueva.parentNode.classList.toggle("mp-invalida", !v);
          ok.disabled = !v;
        }
        caja.addEventListener("click", (ev) => {
          const b = ev.target.closest("[data-d]");
          if (!b) return;
          inp.value = Math.max(0, Math.min(130, (parseInt(inp.value, 10) || 0) + Number(b.dataset.d)));
          actualizar();
        });
        inp.addEventListener("input", actualizar);
        actualizar();
        return () => ({ minuto: Number(inp.value) });
      },
    });
  }

  // ---------- 7) Dar el partido por finalizado (panel Minuto a Minuto) ----------
  function confirmarFinalizar(r) {
    const gl = r.goles_local ?? 0, gv = r.goles_visitante ?? 0;
    const cuerpo = `<div class="mp-resumen mp-resumen-ok"><span>Resultado final</span><strong>${esc(r.equipo_local)} ${esc(gl)} : ${esc(gv)} ${esc(r.equipo_visitante)}</strong></div>
      <p class="mp-nota">El partido pasará a «Finalizado», el cronómetro se detendrá y contará en la clasificación y en las estadísticas. Si el marcador no es el correcto, cancela y corrige primero los goles.</p>`;
    return abrirModal({
      r, icono: ICO.check, titulo: "Dar por finalizado", sub: "Pitido final: se cierra el partido.",
      cuerpo, confirmar: "Finalizar partido", valorCancelar: false,
      alAbrir() { return () => true; },
    });
  }

  // ---------- 8) Confirmación genérica (noticias y otras zonas del panel) ----------
  // cfg: { titulo, sub, items:[html seguro], cabecera:{ etiqueta, texto }, icono:'aviso'|'papelera'|'check'|'reloj',
  //        confirmar, peligroso }. Devuelve true/false.
  function confirmarAccion(cfg) {
    const items = (cfg.items || []).map((t) => `<li>${t}</li>`).join("");
    const cab = cfg.cabecera && cfg.cabecera.texto
      ? `<div class="mp-partido mp-cabecera-simple"><div>${cfg.cabecera.etiqueta ? `<small>${esc(cfg.cabecera.etiqueta)}</small>` : ""}<strong>${esc(cfg.cabecera.texto)}</strong></div></div>`
      : "";
    return abrirModal({
      cabecera: cab, icono: ICO[cfg.icono] || ICO.aviso, titulo: cfg.titulo, sub: cfg.sub || "",
      cuerpo: items ? `<ul class="mp-lista${cfg.peligroso ? "" : " mp-lista-suave"}">${items}</ul>` : "",
      confirmar: cfg.confirmar || "Aceptar", peligroso: !!cfg.peligroso, valorCancelar: false,
      alAbrir() { return () => true; },
    });
  }

  window.EOFModalesPartido = { pedirFechaHora, pedirHora, confirmarAnular, confirmarMarcador, confirmarEliminar, pedirMinuto, confirmarFinalizar, confirmarAccion };
})();
