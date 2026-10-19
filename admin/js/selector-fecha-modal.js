// Selector de fecha en modal: "Fecha de preferencia" y "Programar publicación".
// Sustituye a fecha-preferencia-ui.js (el mini calendario incrustado).
//
// Dentro del formulario solo se muestra una tarjeta-resumen; al pulsarla se abre un
// modal con calendario, atajos y hora. Los inputs originales siguen en el DOM (ocultos)
// porque admin.js los lee y los rellena:
//   · Preferencia: prefFechaDesde, prefHoraDesde, prefFechaHasta, prefHoraHasta
//   · Programar:   programadoPara (datetime-local, "YYYY-MM-DDTHH:MM" en hora de Madrid)
// admin.js avisa de cambios hechos por código con window.refrescarFechaPreferenciaUI()
// y window.refrescarProgramarUI(). Para abrir el modal desde fuera: window.abrirSelectorFecha(modo).
(function () {
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const DIAS_CORTO = ["L", "M", "X", "J", "V", "S", "D"];
  const DIA_SEM = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const FRANJAS = [
    { id: "manana", nombre: "Mañana", d: "08:00", h: "10:30" },
    { id: "mediodia", nombre: "Mediodía", d: "10:30", h: "15:00" },
    { id: "tarde", nombre: "Tarde", d: "15:00", h: "18:45" },
    { id: "noche", nombre: "Noche", d: "18:45", h: "22:00" },
  ];
  const HORAS_RAPIDAS = ["08:00", "10:00", "12:00", "14:00", "17:00", "19:00", "21:00"];

  const ICO_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/></svg>';
  const ICO_RELOJ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>';
  const ICO_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';

  const $ = (id) => document.getElementById(id);
  const mayus = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const sumaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // ---------- Hora de Madrid ----------
  function partesMadrid(instante) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Madrid", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(instante).reduce((a, p) => (a[p.type] = p.value, a), {});
  }
  function ahoraMadrid(extraMin) {
    const p = partesMadrid(new Date(Date.now() + (extraMin || 0) * 60000));
    return { d: `${p.year}-${p.month}-${p.day}`, t: `${p.hour}:${p.minute}` };
  }
  const hoyMadrid = () => ahoraMadrid().d;
  function instanteMadrid(d, t) {
    const ficticio = Date.parse(`${d}T${t}:00Z`);
    if (isNaN(ficticio)) return NaN;
    const p = partesMadrid(new Date(ficticio));
    const comoUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return ficticio - Math.round((comoUTC - ficticio) / 60000) * 60000;
  }
  function esFuturo(d, t) {
    const inicioMinuto = Math.floor(Date.now() / 60000) * 60000;
    return instanteMadrid(d, t) >= inicioMinuto;
  }
  function relativo(d, t) {
    const min = Math.round((instanteMadrid(d, t) - Date.now()) / 60000);
    if (isNaN(min)) return "";
    if (min < 0) return "Esa hora ya ha pasado";
    if (min < 1) return "Se publicará en menos de un minuto";
    if (min < 60) return `Se publicará dentro de ${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    if (h < 24) return `Se publicará dentro de ${h} h${m ? " " + m + " min" : ""}`;
    const dias = Math.floor(h / 24), hr = h % 24;
    return `Se publicará dentro de ${dias} ${dias === 1 ? "día" : "días"}${hr ? " y " + hr + " h" : ""}`;
  }

  // ---------- Formato ----------
  function legible(f) {
    const d = parse(f);
    return `${DIA_SEM[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3).toLowerCase()}`;
  }
  function legibleLargo(f) {
    const hoy = hoyMadrid();
    const d = parse(f);
    const base = `${DIA_SEM[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`;
    if (f === hoy) return `Hoy, ${base}`;
    if (f === ymd(sumaDias(parse(hoy), 1))) return `Mañana, ${base}`;
    return base;
  }
  function textoPreferencia(v) {
    if (!v.d) return "";
    const horas = v.td ? `${v.td}${v.th ? "–" + v.th : ""}` : "todo el día";
    if (!v.h || v.h === v.d) return `${legible(v.d)} · ${horas}`;
    return `${legible(v.d)} → ${legible(v.h)}${v.td ? " · " + horas : ""}`;
  }

  // ---------- Lectura / escritura de los inputs originales ----------
  const disparar = (id) => $(id)?.dispatchEvent(new Event("change", { bubbles: true }));
  function leerPref() {
    const d = $("prefFechaDesde")?.value || "";
    let h = $("prefFechaHasta")?.value || "";
    if (!d) h = "";
    return { d, h, td: $("prefHoraDesde")?.value || "", th: $("prefHoraHasta")?.value || "" };
  }
  function escribirPref({ d, h, td, th }) {
    $("prefFechaDesde").value = d || "";
    $("prefFechaHasta").value = d ? (h || "") : "";
    $("prefHoraDesde").value = d ? (td || "") : "";
    $("prefHoraHasta").value = d ? (th || "") : "";
    ["prefFechaDesde", "prefHoraDesde", "prefFechaHasta", "prefHoraHasta"].forEach(disparar);
    pintarTriggers();
  }
  function leerProg() {
    const v = $("programadoPara")?.value || "";
    const [d, t] = v.split("T");
    return { d: d || "", t: (t || "").slice(0, 5) };
  }
  function escribirProg({ d, t }) {
    $("programadoPara").value = d && t ? `${d}T${t}` : "";
    disparar("programadoPara");
    pintarTriggers();
  }

  // ---------- Tarjetas-resumen dentro del formulario ----------
  const triggers = {};
  function crearTrigger(modo, contenedor, etiqueta, icono) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sfm-trigger";
    b.dataset.sfm = modo;
    b.innerHTML = `
      <span class="sfm-trigger-ico" aria-hidden="true">${icono}</span>
      <span class="sfm-trigger-txt">
        <small>${etiqueta}</small>
        <b class="sfm-trigger-val sfm-vacio"></b>
        <span class="sfm-trigger-rel" hidden></span>
      </span>
      <span class="sfm-trigger-cta">Elegir</span>`;
    b.addEventListener("click", () => abrir(modo));
    contenedor.appendChild(b);
    triggers[modo] = {
      el: b,
      val: b.querySelector(".sfm-trigger-val"),
      rel: b.querySelector(".sfm-trigger-rel"),
      cta: b.querySelector(".sfm-trigger-cta"),
    };
  }

  function montarTriggers() {
    const campoPref = $("campoFechaPreferencia");
    if (campoPref && !campoPref.dataset.sfmListo) {
      campoPref.dataset.sfmListo = "1";
      campoPref.querySelectorAll(":scope > div, :scope > p").forEach((n) => n.classList.add("sfm-oculto"));
      crearTrigger("preferencia", campoPref, "Fecha de preferencia", ICO_CAL);
    }
    const campoProg = $("campoFechaProgramada");
    if (campoProg && !campoProg.dataset.sfmListo) {
      campoProg.dataset.sfmListo = "1";
      campoProg.querySelectorAll(":scope > label, :scope > input").forEach((n) => n.classList.add("sfm-oculto"));
      crearTrigger("programar", campoProg, "Publicación programada", ICO_RELOJ);
    }
  }

  function pintarTriggers() {
    if (triggers.preferencia) {
      const t = triggers.preferencia, txt = textoPreferencia(leerPref());
      t.val.textContent = txt || "Sin elegir";
      t.val.classList.toggle("sfm-vacio", !txt);
      t.el.classList.toggle("sfm-con-valor", !!txt);
      t.el.classList.remove("sfm-error");
      t.cta.textContent = txt ? "Cambiar" : "Elegir";
    }
    if (triggers.programar) {
      const t = triggers.programar, v = leerProg(), ok = v.d && v.t;
      t.val.textContent = ok ? `${legibleLargo(v.d)} · ${v.t}` : "Sin elegir";
      t.val.classList.toggle("sfm-vacio", !ok);
      t.el.classList.toggle("sfm-con-valor", !!ok);
      t.el.classList.remove("sfm-error");
      const rel = ok ? relativo(v.d, v.t) : "";
      t.rel.textContent = rel;
      t.rel.hidden = !rel;
      t.cta.textContent = ok ? "Cambiar" : "Elegir";
    }
  }

  // ---------- Modal (se crea una vez y se reutiliza) ----------
  let ov, caja, st = null; // st: estado de la sesión abierta
  const q = (sel) => caja.querySelector(sel);

  function montarModal() {
    if (ov) return;
    ov = document.createElement("div");
    ov.className = "sfm-overlay";
    ov.setAttribute("aria-hidden", "true");
    ov.innerHTML = `
      <div class="sfm-caja" role="dialog" aria-modal="true" aria-labelledby="sfmTitulo">
        <header class="sfm-cab">
          <span class="sfm-cab-ico" aria-hidden="true"></span>
          <div><h3 id="sfmTitulo"></h3><p class="sfm-sub"></p></div>
          <button type="button" class="sfm-x" data-accion="cerrar" aria-label="Cerrar">&times;</button>
        </header>
        <div class="sfm-cuerpo">
          <section class="sfm-col sfm-col-cal">
            <div><p class="sfm-etq">Atajos</p><div class="sfm-chips sfm-atajos"></div></div>
            <div class="sfm-cal">
              <div class="sfm-cal-cab">
                <button type="button" class="sfm-nav" data-nav="-1" aria-label="Mes anterior">&lsaquo;</button>
                <strong class="sfm-mes" aria-live="polite"></strong>
                <button type="button" class="sfm-nav" data-nav="1" aria-label="Mes siguiente">&rsaquo;</button>
              </div>
              <div class="sfm-sem">${DIAS_CORTO.map((x) => `<span>${x}</span>`).join("")}</div>
              <div class="sfm-dias" role="grid"></div>
            </div>
          </section>
          <section class="sfm-col sfm-col-opc"></section>
        </div>
        <footer class="sfm-pie">
          <div class="sfm-pie-res"><small>Resumen</small><b class="sfm-pie-txt"></b></div>
          <div class="sfm-pie-btn">
            <button type="button" class="sfm-btn sfm-btn-texto" data-accion="quitar">Quitar</button>
            <button type="button" class="sfm-btn" data-accion="cerrar">Cancelar</button>
            <button type="button" class="sfm-btn sfm-btn-prim" data-accion="aplicar">Aplicar</button>
          </div>
        </footer>
      </div>`;
    document.body.appendChild(ov);
    caja = ov.querySelector(".sfm-caja");

    ov.addEventListener("mousedown", (e) => { if (e.target === ov) ov._cierraPorFondo = true; });
    ov.addEventListener("click", (e) => {
      if (e.target === ov && ov._cierraPorFondo) cerrar(true);
      ov._cierraPorFondo = false;
    });
    caja.addEventListener("click", onClick);
    caja.addEventListener("mouseover", (e) => {
      const b = e.target.closest("[data-f]");
      if (st && st.modo === "preferencia" && b && st.d && !st.h) pintarPrevia(b.dataset.f);
    });
    caja.addEventListener("mouseleave", () => pintarPrevia(null));
    caja.addEventListener("input", onInput);
    caja.addEventListener("change", onInput);
    document.addEventListener("keydown", (e) => {
      if (!st) return;
      if (e.key === "Escape") { e.preventDefault(); cerrar(true); }
      if (e.key === "Tab") atraparFoco(e);
    });
  }

  function atraparFoco(e) {
    const f = [...caja.querySelectorAll("button:not([disabled]):not([hidden]), input:not([disabled])")].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const primero = f[0], ultimo = f[f.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  }

  // ---------- Apertura / cierre ----------
  function abrir(modo, opciones) {
    montarModal();
    const o = opciones || {};
    const esPref = modo === "preferencia";
    const orig = esPref ? leerPref() : leerProg();
    st = { modo, ...orig, vista: null, auto: !!o.auto, volverA: document.activeElement, tieneValorInicial: esPref ? !!orig.d : !!(orig.d && orig.t) };
    const base = parse(st.d || hoyMadrid());
    st.vista = { y: base.getFullYear(), m: base.getMonth() };

    q(".sfm-cab-ico").innerHTML = esPref ? ICO_CAL : ICO_RELOJ;
    q("#sfmTitulo").textContent = esPref ? "Fecha de preferencia" : "Programar publicación";
    q(".sfm-sub").textContent = esPref
      ? "Sugiere cuándo te gustaría que se publique. Es solo una indicación para quien la revise: no programa nada."
      : "La noticia se guardará sin publicar y se publicará sola en el día y la hora que elijas (hora de Madrid).";

    // Atajos
    q(".sfm-atajos").innerHTML = (esPref
      ? [["hoy", "Hoy"], ["manana", "Mañana"], ["finde", "Este finde"], ["semana", "Próx. semana"]]
      : [["m30", "En 30 min"], ["h1", "En 1 hora"], ["hoy", "Hoy"], ["manana", "Mañana"], ["lunes", "Próx. lunes"]]
    ).map(([id, n]) => `<button type="button" class="sfm-chip" data-atajo="${id}">${n}</button>`).join("");

    // Panel derecho
    q(".sfm-col-opc").innerHTML = esPref ? `
      <div>
        <p class="sfm-etq">Horario <span style="font-weight:600;text-transform:none;letter-spacing:0">(opcional)</span></p>
        <div class="sfm-seg" role="group" aria-label="Horario">
          <button type="button" data-modo="dia">Todo el día</button>
          <button type="button" data-modo="franja">Franja horaria</button>
        </div>
      </div>
      <div class="sfm-franja-zona" hidden>
        <p class="sfm-etq">Franja</p>
        <div class="sfm-franjas">${FRANJAS.map((f) => `<button type="button" class="sfm-franja" data-franja="${f.id}"><b>${f.nombre}</b><small>${f.d} – ${f.h}</small></button>`).join("")}</div>
      </div>
      <div class="sfm-franja-zona" hidden>
        <p class="sfm-etq">Ajuste manual</p>
        <div class="sfm-horas">
          <label>De <input type="time" data-h="td"></label>
          <label>a <input type="time" data-h="th"></label>
        </div>
      </div>
      <p class="sfm-aviso sfm-aviso-pref" ${st.d ? "hidden" : ""}>${ICO_INFO}<span>Pulsa un día para elegirlo, o dos días para marcar un rango.</span></p>` : `
      <div>
        <p class="sfm-etq">Hora de publicación</p>
        <div class="sfm-reloj">
          <button type="button" class="sfm-paso" data-paso="-15" aria-label="Quitar 15 minutos">−15</button>
          <input type="time" data-h="t" step="60" aria-label="Hora de publicación">
          <button type="button" class="sfm-paso" data-paso="15" aria-label="Sumar 15 minutos">+15</button>
        </div>
        <p class="sfm-zona" style="margin-top:8px">Hora de Madrid (CET/CEST)</p>
      </div>
      <div>
        <p class="sfm-etq">Horas habituales</p>
        <div class="sfm-chips">${HORAS_RAPIDAS.map((h) => `<button type="button" class="sfm-chip" data-hora="${h}">${h}</button>`).join("")}</div>
      </div>
      <p class="sfm-aviso sfm-aviso-prog">${ICO_INFO}<span></span></p>`;

    q('[data-accion="quitar"]').hidden = !st.tieneValorInicial;
    q('[data-accion="aplicar"]').textContent = esPref ? "Aplicar fecha" : "Programar";

    ov.classList.add("sfm-abierto");
    ov.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("sfm-bloqueo");
    pintar();
    setTimeout(() => (q(".sfm-dia:not(:disabled).sfm-ini") || q(".sfm-dia:not(:disabled).sfm-hoy") || q('[data-accion="aplicar"]'))?.focus({ preventScroll: true }), 60);
  }

  // `descartar`: cierra sin aplicar (Cancelar, ✕, Esc o clic fuera)
  function cerrar(descartar) {
    if (!st) return;
    const { modo, auto, volverA, tieneValorInicial } = st;
    st = null;
    ov.classList.remove("sfm-abierto");
    ov.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("sfm-bloqueo");
    // Si el modal se abrió solo al activar el interruptor y no se llegó a elegir nada,
    // el interruptor se vuelve a desmarcar (salvo que sea obligatorio).
    if (descartar && auto && !tieneValorInicial) {
      const chk = $(modo === "preferencia" ? "fechaPreferenciaActiva" : "programarNoticia");
      if (chk && chk.checked && !chk.disabled) { chk.checked = false; chk.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    try { (volverA && document.contains(volverA) ? volverA : triggers[modo]?.el)?.focus({ preventScroll: true }); } catch (_) {}
  }

  function aplicar() {
    if (!st) return;
    if (st.modo === "preferencia") {
      if (!st.d) return;
      escribirPref({ d: st.d, h: st.h, td: st.td, th: st.th });
    } else {
      if (!st.d || !st.t || !esFuturo(st.d, st.t)) return;
      escribirProg({ d: st.d, t: st.t });
    }
    st.auto = false;
    cerrar(false);
  }

  function quitar() {
    if (!st) return;
    if (st.modo === "preferencia") escribirPref({ d: "", h: "", td: "", th: "" });
    else escribirProg({ d: "", t: "" });
    const modo = st.modo;
    cerrar(false);
    // Quitar la fecha deja el interruptor sin sentido: se desmarca (salvo que sea obligatorio).
    const chk = $(modo === "preferencia" ? "fechaPreferenciaActiva" : "programarNoticia");
    if (chk && chk.checked && !chk.disabled) { chk.checked = false; chk.dispatchEvent(new Event("change", { bubbles: true })); }
  }

  // ---------- Interacción ----------
  function onClick(e) {
    if (!st) return;
    const acc = e.target.closest("[data-accion]");
    if (acc) {
      if (acc.dataset.accion === "cerrar") return cerrar(true);
      if (acc.dataset.accion === "aplicar") return aplicar();
      if (acc.dataset.accion === "quitar") return quitar();
    }
    const nav = e.target.closest("[data-nav]");
    if (nav) {
      const x = new Date(st.vista.y, st.vista.m + Number(nav.dataset.nav), 1);
      st.vista = { y: x.getFullYear(), m: x.getMonth() };
      return pintarCalendario();
    }
    const dia = e.target.closest("[data-f]");
    if (dia && !dia.disabled) return elegirDia(dia.dataset.f);
    const atajo = e.target.closest("[data-atajo]");
    if (atajo) return aplicarAtajo(atajo.dataset.atajo);

    if (st.modo === "preferencia") {
      const modo = e.target.closest("[data-modo]");
      if (modo) {
        if (modo.dataset.modo === "dia") { st.td = ""; st.th = ""; }
        else if (!st.td) { st.td = FRANJAS[2].d; st.th = FRANJAS[2].h; }
        return pintar();
      }
      const fr = e.target.closest("[data-franja]");
      if (fr) {
        const f = FRANJAS.find((x) => x.id === fr.dataset.franja);
        st.td = f.d; st.th = f.h;
        return pintar();
      }
    } else {
      const hr = e.target.closest("[data-hora]");
      if (hr) { st.t = hr.dataset.hora; if (!st.d) st.d = hoyMadrid(); return pintar(); }
      const paso = e.target.closest("[data-paso]");
      if (paso) {
        if (!st.d) st.d = hoyMadrid();
        const [h, m] = (st.t || ahoraMadrid().t).split(":").map(Number);
        let tot = h * 60 + m + Number(paso.dataset.paso);
        tot = Math.max(0, Math.min(23 * 60 + 59, tot));
        st.t = `${pad(Math.floor(tot / 60))}:${pad(tot % 60)}`;
        return pintar();
      }
    }
  }

  function onInput(e) {
    if (!st) return;
    const inp = e.target.closest("input[data-h]");
    if (!inp) return;
    if (st.modo === "programar") {
      st.t = inp.value;
      if (!st.d && st.t) st.d = hoyMadrid();
      return pintar(true);
    }
    st[inp.dataset.h] = inp.value;
    if (st.td && st.th && st.th <= st.td) st.th = ""; // la hora fin debe ser posterior
    if (st.th && !st.td) { st.td = st.th; st.th = ""; }
    pintar(true);
  }

  function elegirDia(f) {
    if (st.modo === "preferencia") {
      if (!st.d || st.h || f < st.d) { st.d = f; st.h = ""; }   // empezar de nuevo
      else if (f === st.d) { st.h = ""; }                        // mismo día: solo ese día
      else { st.h = f; }                                         // cierra el rango
    } else {
      st.d = f;
      if (!st.t) st.t = f === hoyMadrid() ? siguienteHoraRedonda() : "09:00";
      else if (f === hoyMadrid() && !esFuturo(f, st.t)) st.t = siguienteHoraRedonda();
    }
    pintar();
  }

  function siguienteHoraRedonda() {
    const a = ahoraMadrid(60);
    return `${a.t.slice(0, 2)}:00`;
  }

  function aplicarAtajo(id) {
    const hoy = parse(hoyMadrid());
    if (st.modo === "preferencia") {
      let d = hoy, hasta = "";
      if (id === "manana") d = sumaDias(hoy, 1);
      if (id === "finde") {
        const dif = (6 - hoy.getDay() + 7) % 7;
        d = sumaDias(hoy, hoy.getDay() === 0 ? 0 : dif);
        hasta = hoy.getDay() === 0 ? "" : ymd(sumaDias(d, 1));
      }
      if (id === "semana") { const dif = ((1 - hoy.getDay() + 7) % 7) || 7; d = sumaDias(hoy, dif); hasta = ymd(sumaDias(d, 4)); }
      st.d = ymd(d); st.h = hasta;
    } else {
      if (id === "m30" || id === "h1") {
        const a = ahoraMadrid(id === "m30" ? 30 : 60);
        st.d = a.d; st.t = a.t;
      } else {
        let d = hoy;
        if (id === "manana") d = sumaDias(hoy, 1);
        if (id === "lunes") d = sumaDias(hoy, ((1 - hoy.getDay() + 7) % 7) || 7);
        st.d = ymd(d);
        if (!st.t || (st.d === hoyMadrid() && !esFuturo(st.d, st.t))) st.t = st.d === hoyMadrid() ? siguienteHoraRedonda() : "09:00";
      }
    }
    const b = parse(st.d);
    st.vista = { y: b.getFullYear(), m: b.getMonth() };
    pintar();
  }

  // ---------- Pintado ----------
  function pintarPrevia(f) {
    caja.querySelectorAll("[data-f]").forEach((b) => {
      b.classList.toggle("sfm-previa", !!(f && st && st.d && !st.h && b.dataset.f > st.d && b.dataset.f <= f));
    });
  }

  function pintarCalendario() {
    const hoy = hoyMadrid();
    const { y, m } = st.vista;
    q(".sfm-mes").textContent = `${MESES[m]} ${y}`;
    const hoyD = parse(hoy);
    q('[data-nav="-1"]').disabled = y < hoyD.getFullYear() || (y === hoyD.getFullYear() && m <= hoyD.getMonth());
    const offset = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0
    const total = new Date(y, m + 1, 0).getDate();
    const fin = st.modo === "preferencia" ? (st.h || st.d) : st.d;
    let html = "";
    for (let i = 0; i < offset; i++) html += "<span></span>";
    for (let n = 1; n <= total; n++) {
      const f = `${y}-${pad(m + 1)}-${pad(n)}`;
      let cl = "sfm-dia";
      if (f === hoy) cl += " sfm-hoy";
      if (st.d && f === st.d) cl += " sfm-ini";
      if (fin && f === fin) cl += " sfm-fin";
      if (st.modo === "preferencia" && st.d && st.h && st.h !== st.d) {
        if (f === st.d) cl += " sfm-rango";
        if (f > st.d && f < st.h) cl += " sfm-medio";
      }
      if ((offset + n - 1) % 7 >= 5) cl += " sfm-finde";
      const sel = f === st.d || f === fin;
      html += `<button type="button" class="${cl}" data-f="${f}" ${f < hoy ? "disabled" : ""} aria-pressed="${sel}" aria-label="${n} de ${MESES[m].toLowerCase()} de ${y}">${n}</button>`;
    }
    q(".sfm-dias").innerHTML = html;
  }

  // `soloEstado`: no tocar los inputs de hora (el usuario está escribiendo en ellos)
  function pintar(soloEstado) {
    pintarCalendario();
    const btnAplicar = q('[data-accion="aplicar"]');
    const resumen = q(".sfm-pie-txt");

    if (st.modo === "preferencia") {
      const txt = textoPreferencia(st);
      resumen.textContent = txt ? mayus(txt) : "Elige un día";
      resumen.classList.toggle("sfm-vacio", !txt);
      btnAplicar.disabled = !st.d;
      const conFranja = !!st.td;
      q(".sfm-col-opc").querySelectorAll(".sfm-franja-zona").forEach((z) => { z.hidden = !conFranja || !st.d; });
      q(".sfm-seg").parentElement.classList.toggle("sfm-bloqueada", !st.d);
      q(".sfm-col-opc").querySelectorAll("[data-modo]").forEach((b) => b.classList.toggle("sfm-on", (b.dataset.modo === "franja") === conFranja));
      q(".sfm-col-opc").querySelectorAll("[data-franja]").forEach((b) => {
        const f = FRANJAS.find((x) => x.id === b.dataset.franja);
        b.classList.toggle("sfm-on", st.td === f.d && st.th === f.h);
      });
      if (!soloEstado) {
        q("[data-h=td]").value = st.td;
        q("[data-h=th]").value = st.th;
      }
      q(".sfm-aviso-pref").hidden = !!st.d;
      q(".sfm-atajos").querySelectorAll("[data-atajo]").forEach((b) => b.classList.remove("sfm-on"));
    } else {
      const ok = st.d && st.t;
      const futuro = ok && esFuturo(st.d, st.t);
      resumen.textContent = ok ? mayus(`${legibleLargo(st.d)} · ${st.t}`) : "Elige día y hora";
      resumen.classList.toggle("sfm-vacio", !ok);
      btnAplicar.disabled = !futuro;
      if (!soloEstado) q("[data-h=t]").value = st.t || "";
      const av = q(".sfm-aviso-prog");
      av.classList.toggle("sfm-err", !!ok && !futuro);
      av.querySelector("span").textContent = !ok
        ? "Elige un día en el calendario y una hora para programar la publicación."
        : (futuro ? relativo(st.d, st.t) : "Esa hora ya ha pasado. Elige una posterior.");
      q(".sfm-col-opc").querySelectorAll("[data-hora]").forEach((b) => b.classList.toggle("sfm-on", b.dataset.hora === st.t));
    }
  }

  // ---------- Arranque ----------
  function iniciar() {
    montarTriggers();
    pintarTriggers();

    // Al activar el interruptor sin fecha todavía, se abre directamente el modal.
    [["fechaPreferenciaActiva", "preferencia", () => !leerPref().d],
     ["programarNoticia", "programar", () => { const v = leerProg(); return !(v.d && v.t); }]].forEach(([id, modo, vacio]) => {
      $(id)?.addEventListener("change", (e) => {
        if (e.target.checked && vacio() && e.isTrusted) setTimeout(() => abrir(modo, { auto: true }), 80);
      });
    });
  }

  window.refrescarFechaPreferenciaUI = pintarTriggers;
  window.refrescarProgramarUI = pintarTriggers;
  window.abrirSelectorFecha = function (modo) {
    montarTriggers();
    if (triggers[modo]) { triggers[modo].el.classList.add("sfm-error"); }
    abrir(modo, { auto: false });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();

  // El texto relativo ("dentro de 3 h") se mantiene al día mientras el panel está abierto.
  setInterval(() => { if (triggers.programar) pintarTriggers(); }, 60000);
})();
