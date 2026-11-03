// ---------- Celebración de racha al entrar al panel ----------
// Si la persona tiene una racha semanal activa (redactores y fotógrafos), al entrar al panel se abre una
// pantalla completa con la llama, el contador subiendo, partículas y la tira de semanas. Los datos ya los
// calcula el backend en /api/me/nivel (campo `racha`); aquí solo se pintan, no hay endpoint nuevo.
//   · Sale una vez por día y por valor de racha (si hoy sumas una semana más, vuelve a salir).
//   · Mientras el panel sigue abierto se vuelve a comprobar cada 45 s: si publicas algo y la racha sube, salta sola.
//   · Se puede volver a ver desde "Mi progreso" (botón "Ver celebración") o con EOF_RACHA.mostrar().
// Depende de globales de admin.js: USER, apiFetch, irAAjustesCuenta.
(function () {
  "use strict";
  if (typeof USER === "undefined" || !USER) return;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CLAVE = "eof_racha_celebrada";   // localStorage: firma de la última celebración mostrada
  const RECHEQUEO_MS = 45 * 1000;
  const RETRASO_INICIAL_MS = 1200;
  const sinMovimiento = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const sem = (n) => (n === 1 ? "semana seguida" : "semanas seguidas");

  // Bloqueo/desbloqueo de la cola global de avisos (EOF.rachaBloquear / rachaLiberar, en js/ui-alertas.js).
  const rachaBloqueo = (m) => { try { window.EOF && EOF.rachaBloquear && EOF.rachaBloquear(m); } catch { /* nada */ } };
  const rachaLibera = (m) => { try { window.EOF && EOF.rachaLiberar && EOF.rachaLiberar(m); } catch { /* nada */ } };

  let abierta = false;
  let ultimoN = null;        // última racha vista en esta sesión (para detectar subidas mientras el panel sigue abierto)
  let comprobando = false;
  let pendiente = false;     // hubo racha por celebrar pero había un aviso obligatorio delante: se reintenta

  // ---------- Utilidades ----------
  function hoyMadrid() {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
    catch { return new Date().toISOString().slice(0, 10); }
  }
  const firmaDe = (r) => `${USER.id}|${hoyMadrid()}|${r.actual}|${r.en_riesgo ? "r" : "v"}`;
  const yaCelebrada = (r) => { try { return localStorage.getItem(CLAVE) === firmaDe(r); } catch { return false; } };
  const marcarCelebrada = (r) => { try { localStorage.setItem(CLAVE, firmaDe(r)); } catch { /* nada */ } };

  function tierDe(n) { return n >= 26 ? 4 : n >= 12 ? 3 : n >= 4 ? 2 : 1; }

  function describir(r) {
    const n = Number(r.actual) || 0;
    const hito = r.hito_actual && r.hito_actual.semanas === n ? r.hito_actual : null;
    if (r.en_riesgo) {
      const d = Number(r.dias_restantes) || 0;
      return {
        estado: "riesgo", hito: false,
        titulo: "¡Tu racha sigue viva!",
        sub: d === 0
          ? `Hoy es el último día de la semana: con una publicación o una foto en galería mantienes tu racha de ${n} ${sem(n)}.`
          : `Te quedan ${d + 1} días (hoy incluido) para sumar actividad y mantener tu racha de ${n} ${sem(n)}.`,
        medalla: r.hito_actual ? r.hito_actual.nombre : "",
      };
    }
    if (hito) {
      return { estado: "hito", hito: true, titulo: "¡Hito desbloqueado!", sub: `Has llegado a ${n} ${sem(n)} con actividad. Esto ya es constancia de verdad.`, medalla: hito.nombre };
    }
    if (n === 1) {
      return { estado: "nueva", hito: false, titulo: "¡Racha activada!", sub: "Primera semana con actividad. Publica o sube fotos cada semana y la verás crecer.", medalla: "" };
    }
    return { estado: "viva", hito: false, titulo: "¡Racha en marcha!", sub: `Llevas ${n} ${sem(n)} con actividad. ¡Que no pare!`, medalla: r.hito_actual ? r.hito_actual.nombre : "" };
  }

  // ---------- Dibujo ----------
  const ICO_CERRAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  const LLAMA = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="rcGradExt" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="var(--rc-3)"/><stop offset=".55" stop-color="var(--rc-2)"/><stop offset="1" stop-color="var(--rc-1)"/></linearGradient>
        <linearGradient id="rcGradMed" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="var(--rc-2)"/><stop offset="1" stop-color="var(--rc-1)"/></linearGradient>
        <linearGradient id="rcGradInt" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="var(--rc-int-b)"/><stop offset="1" stop-color="var(--rc-int-a)"/></linearGradient>
      </defs>
      <path class="rc-f-ext" d="M12 2c.6 3 2.2 4.6 3.9 6.4C17.6 10.2 19 12 19 14.6A7 7 0 0 1 5 14.6c0-2 .9-3.6 2.1-4.9.4 1.2 1 2 1.9 2.6C8.7 9 9.8 4.7 12 2Z"/>
      <g transform="translate(12 21.4) scale(.76) translate(-12 -21.4)"><path class="rc-f-med" d="M12 2c.6 3 2.2 4.6 3.9 6.4C17.6 10.2 19 12 19 14.6A7 7 0 0 1 5 14.6c0-2 .9-3.6 2.1-4.9.4 1.2 1 2 1.9 2.6C8.7 9 9.8 4.7 12 2Z"/></g>
      <path class="rc-f-int" d="M12 12.2c.3 1.3 1.1 1.9 1.8 2.7.6.7 1.2 1.4 1.2 2.4a3 3 0 0 1-6 0c0-.9.4-1.6 1-2.2.2.5.5.8.9 1 0-1.6.4-3.2 1.1-3.9Z"/>
    </svg>`;

  function html(r, d, tier) {
    const n = Number(r.actual) || 0;
    const semanas = Array.isArray(r.semanas) ? r.semanas : [];
    const celdas = semanas.map((s, i) => `<span class="rc-celda${s.activa ? " activa" : ""}${s.actual ? " actual" : ""}" style="--i:${i}"></span>`).join("");
    const prox = r.proximo_hito;
    const maxHito = (r.hitos && r.hitos.length) ? r.hitos[r.hitos.length - 1].semanas : 52;
    const pct = prox ? Math.max(4, Math.min(100, Math.round((n / prox.semanas) * 100))) : 100;
    const bloqueHito = prox
      ? `<div class="rc-hito">
           <div class="rc-hito-cab"><span>Próximo hito: <strong>${esc(prox.nombre)}</strong></span><span>${n} / ${prox.semanas}</span></div>
           <div class="rc-hito-pista"><div class="rc-hito-relleno" style="--w:${pct}%"></div></div>
           <p class="rc-hito-nota">${prox.faltan === 1 ? "Te falta 1 semana" : `Te faltan ${prox.faltan} semanas`} para desbloquearlo.</p>
         </div>`
      : `<div class="rc-hito"><div class="rc-hito-cab" style="justify-content:center"><span>🏆 Has superado el hito más alto (${maxHito} semanas)</span></div><div class="rc-hito-pista"><div class="rc-hito-relleno" style="--w:100%"></div></div></div>`;
    return `
      <canvas class="rc-canvas" aria-hidden="true"></canvas>
      <div class="rc-rayos" aria-hidden="true"></div>
      <div class="rc-halo" aria-hidden="true"></div>
      <div class="rc-ondas" aria-hidden="true"><i></i><i></i><i></i></div>
      <button type="button" class="rc-cerrar" data-rc="cerrar" aria-label="Cerrar">${ICO_CERRAR}</button>
      <div class="rc-escena">
        <p class="rc-etiqueta">Racha semanal</p>
        <div class="rc-llama-wrap" aria-hidden="true"><div class="rc-llama">${LLAMA}</div></div>
        <div class="rc-cifra">
          <span class="rc-num" aria-hidden="true">0</span>
          <span class="rc-unidad">${sem(n)}</span>
        </div>
        <h2 class="rc-titulo" id="rcTitulo">${esc(d.titulo)}</h2>
        <p class="rc-sub" id="rcSub">${esc(d.sub)}</p>
        ${d.medalla ? `<span class="rc-medalla">🏅 ${esc(d.medalla)}</span>` : ""}
        <div class="rc-tira" aria-hidden="true">${celdas}</div>
        <div class="rc-tira-ley" aria-hidden="true"><span>hace ${semanas.length} semanas</span><span>esta semana</span></div>
        ${bloqueHito}
        <div class="rc-botones">
          <button type="button" class="rc-btn rc-btn-prim" data-rc="cerrar">${d.estado === "riesgo" ? "¡No la voy a perder!" : "¡A por la siguiente!"}</button>
          <button type="button" class="rc-btn rc-btn-sec" data-rc="progreso">Ver mi progreso</button>
        </div>
      </div>`;
  }

  // ---------- Partículas (chispas, ascuas, confeti) ----------
  function crearMotor(canvas, wrap, tier, riesgo) {
    const ctx = canvas.getContext("2d");
    const ps = [];
    let W = 0, H = 0, raf = 0, ultimo = 0, vivo = true, acum = 0;
    const ASCUAS = ["#fff3b0", "#ffd166", "#ffb703", "#ff8c1a", "#ff6a00"];
    const CONFETI = ["#ffd166", "#ffb703", "#ff6a00", "#ffffff", "#ff3d00", "#ffe9a8", "#8fd8ff"];
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];

    function medir() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function origen() {
      const b = wrap.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height * 0.56, w: b.width, h: b.height };
    }
    function chispas(n, fuerza) {
      const o = origen();
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2), v = rnd(140, 520) * (fuerza || 1);
        ps.push({ t: "c", x: o.x, y: o.y, px: o.x, py: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, vida: 0, max: rnd(.7, 1.5), r: rnd(1.4, 3.4), col: pick(ASCUAS) });
      }
    }
    function confeti(n) {
      for (let i = 0; i < n; i++) {
        ps.push({ t: "f", x: rnd(0, W), y: rnd(-H * 0.35, -10), vx: rnd(-70, 70), vy: rnd(110, 280), vida: 0, max: 99, w: rnd(6, 11), h: rnd(10, 17), rot: rnd(0, 6.28), vr: rnd(-6, 6), fase: rnd(0, 6.28), col: pick(CONFETI) });
      }
    }
    function ascua() {
      const o = origen();
      ps.push({ t: "a", x: o.x + rnd(-o.w * 0.18, o.w * 0.18), y: o.y + o.h * 0.22, vx: rnd(-18, 18), vy: -rnd(50, 150), vida: 0, max: rnd(1.6, 3.2), r: rnd(1, 2.8), fase: rnd(0, 6.28), col: pick(ASCUAS) });
    }
    function paso(t) {
      if (!vivo) return;
      const dt = Math.min(0.05, (t - (ultimo || t)) / 1000); ultimo = t;
      ctx.clearRect(0, 0, W, H);
      acum += dt * (riesgo ? 14 : 22 + tier * 10);
      while (acum >= 1) { acum -= 1; if (ps.length < 700) ascua(); }
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.vida += dt;
        if (p.t === "f") {
          p.fase += dt * 3; p.rot += p.vr * dt;
          p.x += (p.vx + Math.sin(p.fase) * 40) * dt; p.y += p.vy * dt;
          if (p.y > H + 30) { ps.splice(i, 1); continue; }
          ctx.save(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 0.95;
          ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.fase * 1.7));
          ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
          continue;
        }
        if (p.vida >= p.max) { ps.splice(i, 1); continue; }
        const k = 1 - p.vida / p.max;
        ctx.globalCompositeOperation = "lighter";
        if (p.t === "c") {
          p.px = p.x; p.py = p.y;
          p.vy += 420 * dt; p.vx *= 0.985; p.vy *= 0.985;
          p.x += p.vx * dt; p.y += p.vy * dt;
          ctx.globalAlpha = k; ctx.strokeStyle = p.col; ctx.lineWidth = p.r * (0.4 + k); ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
        } else {
          p.fase += dt * 4;
          p.x += (p.vx + Math.sin(p.fase) * 22) * dt; p.y += p.vy * dt;
          ctx.globalAlpha = Math.min(1, k * 1.4) * 0.9; ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + k * 0.7), 0, 6.283); ctx.fill();
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(paso);
    }
    medir();
    window.addEventListener("resize", medir);
    raf = requestAnimationFrame(paso);
    return {
      chispas, confeti,
      parar() { vivo = false; cancelAnimationFrame(raf); window.removeEventListener("resize", medir); },
    };
  }

  // ---------- Abrir / cerrar ----------
  function abrir(r, opciones) {
    if (abierta || $("rachaCelebracion")) return;
    const n = Number(r && r.actual) || 0;
    if (n <= 0) return;
    abierta = true;
    rachaBloqueo("celebracion"); // el resto de avisos espera a que se cierre
    const d = describir(r);
    const tier = tierDe(n);
    const reducido = sinMovimiento();
    const previo = document.activeElement;
    const timers = [];
    let rafNum = 0, motor = null, cerrado = false;
    const luego = (fn, ms) => { const id = setTimeout(() => { if (!cerrado) fn(); }, ms); timers.push(id); };

    const el = document.createElement("div");
    el.id = "rachaCelebracion";
    el.className = "rc";
    el.dataset.estado = d.estado;
    el.dataset.tier = String(tier);
    el.dataset.hito = d.hito ? "1" : "0";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "rcTitulo");
    el.setAttribute("aria-describedby", "rcSub");
    el.tabIndex = -1;
    el.innerHTML = html(r, d, tier);
    document.body.appendChild(el);
    if (!(opciones && opciones.repetir)) marcarCelebrada(r);

    // Rayos, halo y ondas se centran en la llama (que depende de la altura de la pantalla).
    const centrar = () => {
      const w = el.querySelector(".rc-llama-wrap");
      if (!w) return;
      const b = w.getBoundingClientRect();
      el.style.setProperty("--fx", `${Math.round(b.left + b.width / 2)}px`);
      el.style.setProperty("--fy", `${Math.round(b.top + b.height * 0.56)}px`);
    };
    centrar();
    window.addEventListener("resize", centrar);
    const numEl = el.querySelector(".rc-num");
    const relleno = el.querySelector(".rc-hito-relleno");
    const primario = el.querySelector(".rc-btn-prim");
    // Lectores de pantalla: el número no va en el aria (cambia rápido), se anuncia en el título.
    el.querySelector(".rc-unidad").setAttribute("aria-label", `${n} ${sem(n)}`);

    if (reducido) {
      numEl.textContent = String(n);
      if (relleno) relleno.style.width = relleno.style.getPropertyValue("--w");
    } else {
      motor = crearMotor(el.querySelector(".rc-canvas"), el.querySelector(".rc-llama-wrap"), tier, d.estado === "riesgo");
      // Ignición: chispas al encenderse la llama.
      luego(() => motor.chispas(70 + tier * 18, 1), 420);
      luego(() => { if (navigator.vibrate) { try { navigator.vibrate([25, 40, 55]); } catch { /* nada */ } } }, 420);
      // Contador subiendo.
      const dur = Math.min(1500, 650 + n * 30);
      luego(() => {
        const t0 = performance.now();
        const frame = (t) => {
          if (cerrado) return;
          const k = Math.min(1, (t - t0) / dur);
          numEl.textContent = String(Math.round(n * (1 - Math.pow(1 - k, 3))));
          if (k < 1) { rafNum = requestAnimationFrame(frame); return; }
          numEl.classList.add("rc-pop");
          motor.chispas(46, 0.8);
          if (d.hito) motor.confeti(150);
          else if (d.estado !== "riesgo" && (n === 1 || n % 4 === 0)) motor.confeti(60);
        };
        rafNum = requestAnimationFrame(frame);
      }, 650);
      // Barra del próximo hito.
      if (relleno) luego(() => { relleno.style.width = relleno.style.getPropertyValue("--w"); }, 60);
    }

    function cerrar(irAProgreso) {
      if (cerrado) return;
      cerrado = true;
      timers.forEach(clearTimeout);
      cancelAnimationFrame(rafNum);
      document.removeEventListener("keydown", teclas, true);
      window.removeEventListener("resize", centrar);
      const quitar = () => { if (motor) motor.parar(); el.remove(); abierta = false; rachaLibera("celebracion"); try { if (previo && previo.focus) previo.focus({ preventScroll: true }); } catch { /* nada */ } };
      if (reducido) quitar();
      else { el.classList.add("rc-saliendo"); el.addEventListener("animationend", quitar, { once: true }); setTimeout(quitar, 500); }
      if (irAProgreso && typeof irAAjustesCuenta === "function") { try { irAAjustesCuenta("progreso"); } catch { /* nada */ } }
    }
    function teclas(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cerrar(false); return; }
      if (e.key !== "Tab") return;
      const foco = Array.from(el.querySelectorAll("button"));
      if (!foco.length) return;
      const i = foco.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); foco[foco.length - 1].focus(); }
      else if (!e.shiftKey && (i === -1 || i === foco.length - 1)) { e.preventDefault(); foco[0].focus(); }
    }
    document.addEventListener("keydown", teclas, true);
    const abiertoEn = Date.now();
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-rc]");
      if (b) { cerrar(b.dataset.rc === "progreso"); return; }
      // Tocar el fondo también cierra, pero no durante el primer segundo (evita cierres por doble toque).
      if ((ev.target === el || ev.target.classList.contains("rc-escena")) && Date.now() - abiertoEn > 1000) cerrar(false);
    });
    try { primario.focus({ preventScroll: true }); } catch { /* nada */ }
  }

  // ---------- Ciclo ----------
  async function leerRacha() {
    const data = await apiFetch("/api/me/nivel");
    return data && data.racha ? data.racha : null;
  }
  function hayModalPrioritario() {
    // No se tapa el aviso obligatorio de apellidos ni el tutorial en curso.
    return !!document.querySelector(".apo-overlay, #tutOverlay.tut-activo");
  }
  async function comprobar(inicial) {
    if (comprobando || abierta) return;
    comprobando = true;
    try {
      const r = await leerRacha();
      if (r && Number(r.actual) > 0) {
        const sube = ultimoN !== null && Number(r.actual) > ultimoN;
        if ((inicial || sube || pendiente) && !yaCelebrada(r)) {
          if (hayModalPrioritario()) pendiente = true;
          else { pendiente = false; abrir(r); }
        }
      }
      ultimoN = r ? Number(r.actual) || 0 : ultimoN;
    } catch { /* la celebración es un extra: si falla, el panel sigue igual */ }
    comprobando = false;
    rachaLibera("comprobacion"); // ya se sabe si hay celebración (si la hay, ya tiene su propio bloqueo)
  }

  // Repetir a propósito (botón de "Mi progreso" o consola): ignora la marca de "ya vista".
  async function mostrar() {
    try {
      const r = await leerRacha();
      if (r && Number(r.actual) > 0) abrir(r, { repetir: true });
      else if (window.EOF && window.EOF.toast) window.EOF.toast("Todavía no tienes una racha activa. Publica algo o sube fotos a una galería esta semana.", "info");
    } catch { /* nada */ }
  }
  // Vista previa con datos inventados (no toca nada): EOF_RACHA.probar(12) · EOF_RACHA.probar(3, true)
  function probar(n, riesgo) {
    n = Math.max(1, Math.floor(Number(n) || 5));
    const HITOS = [{ semanas: 2, nombre: "En marcha" }, { semanas: 4, nombre: "Constancia" }, { semanas: 8, nombre: "Imparable" }, { semanas: 12, nombre: "Trimestre redondo" }, { semanas: 26, nombre: "Medio año" }, { semanas: 52, nombre: "Un año entero" }];
    const semanas = [];
    for (let i = 11; i >= 0; i--) {
      const activa = riesgo ? (i >= 1 && i <= n) : i < n;
      semanas.push({ inicio: "", publicaciones: activa ? 1 : 0, fotos: 0, activa, actual: i === 0 });
    }
    const prox = HITOS.find((h) => n < h.semanas) || null;
    const hitos = HITOS.filter((h) => n >= h.semanas);
    abierta = false;
    rachaLibera("celebracion");
    const viejo = $("rachaCelebracion"); if (viejo) viejo.remove();
    abrir({ actual: n, en_riesgo: !!riesgo, dias_restantes: 3, semanas, hitos: HITOS, hito_actual: hitos[hitos.length - 1] || null, proximo_hito: prox ? { ...prox, faltan: prox.semanas - n } : null }, { repetir: true });
  }
  window.EOF_RACHA = { mostrar, probar };
  document.addEventListener("click", (e) => { if (e.target.closest("[data-racha-celebrar]")) mostrar(); });

  function iniciar() {
    // Hasta saber si hay celebración por enseñar, los avisos automáticos del panel esperan (máx. 8 s por si la API tarda).
    rachaBloqueo("comprobacion");
    setTimeout(() => rachaLibera("comprobacion"), 8000);
    setTimeout(() => comprobar(true), RETRASO_INICIAL_MS);
    setInterval(() => { if (document.visibilityState === "visible") comprobar(false); }, RECHEQUEO_MS);
    // Si algo obligatorio (apellidos, tutorial) la tapó al entrar, se reintenta pronto.
    setInterval(() => { if (pendiente && document.visibilityState === "visible") comprobar(false); }, 6000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") comprobar(false); });
  }
  iniciar();
})();
