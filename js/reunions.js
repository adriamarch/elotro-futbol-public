// Calendari de reunions (/reunions).
// - Qualsevol persona amb l'enllaç: posa el seu nom, marca les franges que li van bé i les desa.
//   Veu qui més ha marcat cada franja (per ajuntar reunions en grup) i les reunions confirmades.
// - Un Responsable amb sessió iniciada (rol admin) veu a sobre el "Mode propietari": pinta quan PUC,
//   quan NO PUC, aplica plantilles, mira les respostes i confirma reunions.
// Backend: /api/reunions/public (sense sessió) i /api/reunions/admin (només Responsables).
// Totes les hores són hora de Madrid, tal qual (sense conversions de zona).
(function () {
  "use strict";

  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DIES = ["dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte", "diumenge"];
  const DIES_C = ["Dl", "Dt", "Dc", "Dj", "Dv", "Ds", "Dg"];
  const MESOS = ["de gener", "de febrer", "de març", "d'abril", "de maig", "de juny", "de juliol", "d'agost", "de setembre", "d'octubre", "de novembre", "de desembre"];
  const MESOS_C = ["gen", "febr", "març", "abr", "maig", "juny", "jul", "ag", "set", "oct", "nov", "des"];
  const CLAU_ID = "eof_reunions_id";

  // ---------- dates (tot en UTC "de pa'ntaula": són hores de Madrid sense zona) ----------
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const addDies = (d, n) => { const r = new Date(d.getTime()); r.setUTCDate(r.getUTCDate() + n); return r; };
  const dow = (d) => (d.getUTCDay() + 6) % 7;
  const mkClau = (ds, min) => `${ds}T${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const clauMin = (k) => +k.slice(11, 13) * 60 + +k.slice(14, 16);
  const clauData = (k) => k.slice(0, 10);
  const horaTxt = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
  const dataLlarga = (ds) => { const d = parseYmd(ds); return `${DIES[dow(d)]} ${d.getUTCDate()} ${MESOS[d.getUTCMonth()]}`; };
  function seguent(k) { let m = clauMin(k) + 30, d = clauData(k); if (m >= 1440) { m -= 1440; d = ymd(addDies(parseYmd(d), 1)); } return mkClau(d, m); }
  function anterior(k) { let m = clauMin(k) - 30, d = clauData(k); if (m < 0) { m += 1440; d = ymd(addDies(parseYmd(d), -1)); } return mkClau(d, m); }
  function araMadrid() {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  const plural = (n, u, v) => `${n} ${n === 1 ? u : v}`;
  const colorNom = (nom) => { let h = 0; for (const c of String(nom)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 55% 42%)`; };
  const inicials = (nom) => { const p = String(nom || "?").trim().split(/\s+/); return ((p[0] || "?")[0] + (p.length > 1 ? p[1][0] : "")).toUpperCase(); };
  const avatar = (nom) => `<span class="av" style="background:${colorNom(nom)}" aria-hidden="true">${esc(inicials(nom))}</span>`;
  const xips = (v, max) => {
    const ver = v.slice(0, max || 8);
    return `<span class="xips">${ver.map((x) => `<span class="xip${x.jo ? " jo" : ""}">${avatar(x.nom)}${esc(x.nom)}</span>`).join("")}${v.length > ver.length ? `<span class="xip">+${v.length - ver.length}</span>` : ""}</span>`;
  };

  // ---------- estat ----------
  let TOKEN = null, USUARI = null;
  try { TOKEN = localStorage.getItem("eof_token"); USUARI = JSON.parse(localStorage.getItem("eof_user") || "null"); } catch { /* sense sessió */ }
  const S = {
    cfg: { titol: "Reunions d'acollida", descripcio: "", obert: true },
    franges: new Map(), persones: new Map(), vots: new Map(), ara: araMadrid(),
    id: null, nom: "", nomDesat: "", meus: new Set(), originals: new Set(), editantNom: false,
    propietari: !!(TOKEN && USUARI && USUARI.rol === "admin"),
    mode: "editar", eina: "disponible", inici: null, nd: 7, maxV: 1, carregat: false, runs: [],
  };
  try { const g = JSON.parse(localStorage.getItem(CLAU_ID) || "null"); if (g && g.pid && g.secret) { S.id = g; S.nom = g.nom || ""; S.nomDesat = S.nom; } else if (g && g.nom) S.nom = g.nom; } catch { /* sense identitat */ }

  // ---------- xarxa ----------
  async function api(path, opts, auth) {
    const headers = { "Content-Type": "application/json" };
    if (auth) headers.Authorization = "Bearer " + TOKEN;
    const f = window.eofApiFetch || ((p, o) => fetch(p, o));
    const res = await f(path, { ...(opts || {}), headers });
    let data = null; try { data = await res.json(); } catch { /* sense cos */ }
    if (!res.ok) { const e = new Error((data && data.error) || "No s'ha pogut connectar. Torna-ho a provar."); e.status = res.status; throw e; }
    return data;
  }
  let toastT = null;
  function avis(msg, error) {
    const t = $("#toast"); t.textContent = msg; t.className = "v" + (error ? " err" : "");
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = ""; }, error ? 4800 : 2800);
  }

  // ---------- càrrega ----------
  async function carrega(silenci) {
    let d = null;
    if (S.propietari) {
      try { d = await api("/api/reunions/admin", {}, true); }
      catch (e) { if (e.status === 401 || e.status === 403) { S.propietari = false; } else if (!silenci) avis(e.message, true); }
    }
    if (!d) {
      try { d = await api("/api/reunions/public"); }
      catch (e) { if (!silenci) avis(e.message, true); if (!S.carregat) pintaTot(); return; }
    }
    aplica(d);
    if (!S.carregat) { S.carregat = true; saltaPrimeraFranja(); }
    pintaTot();
  }
  function aplica(d) {
    S.cfg = d.config; S.ara = d.ara || araMadrid();
    S.franges = new Map((d.franges || []).map((f) => [f.clau, f]));
    S.persones = new Map((d.persones || []).map((p) => [p.pid, p.nom]));
    S.vots = new Map();
    for (const v of d.vots || []) { if (!S.vots.has(v.clau)) S.vots.set(v.clau, []); S.vots.get(v.clau).push(v.pid); }
    if (!hiHaCanvis()) {
      S.meus = new Set(); if (S.id) for (const [k, pids] of S.vots) if (pids.includes(S.id.pid)) S.meus.add(k);
      S.originals = new Set(S.meus);
    }
  }
  function guardaId(extra) {
    try { localStorage.setItem(CLAU_ID, JSON.stringify(S.id ? { ...S.id, nom: S.nom } : (S.nom ? { nom: S.nom } : null))); } catch { /* ignorem */ }
  }
  function saltaPrimeraFranja() {
    const mateixa = (k) => k >= S.ara;
    const claus = [...S.franges.keys()].filter(mateixa).sort();
    const avui = parseYmd(S.ara.slice(0, 10));
    S.nd = window.innerWidth < 720 ? 3 : 7;
    S.inici = S.nd === 7 ? addDies(avui, -dow(avui)) : avui;
    if (claus.length && !S.propietari) {
      const primera = parseYmd(clauData(claus[0]));
      const fi = addDies(S.inici, S.nd);
      if (primera >= fi) S.inici = S.nd === 7 ? addDies(primera, -dow(primera)) : primera;
    }
  }

  // ---------- vots ----------
  function votants(k) {
    const v = (S.vots.get(k) || []).filter((p) => !(S.id && p === S.id.pid)).map((p) => ({ id: p, nom: S.persones.get(p) || "?" }));
    if (S.meus.has(k)) v.push({ id: S.id ? S.id.pid : "_jo", nom: S.nom || "Tu", jo: true });
    return v;
  }
  function recalculaMax() { let m = 1; for (const [k, f] of S.franges) if (f.estat === "disponible") m = Math.max(m, votants(k).length); S.maxV = m; }
  function hiHaCanvis() {
    if (S.meus.size !== S.originals.size) return true;
    for (const k of S.meus) if (!S.originals.has(k)) return true;
    return false;
  }

  // ---------- cel·les ----------
  const modeEditar = () => S.propietari && S.mode === "editar";
  function infoCela(k) {
    const f = S.franges.get(k), m = clauMin(k);
    let cls = "cel" + (m % 60 ? " mitja" : ""), txt = "", inter = false;
    if (k < S.ara) return { cls: cls + " off passat", txt, inter, h: 0 };
    if (!f) { cls += " off"; if (modeEditar()) { cls += " editable"; inter = true; } return { cls, txt, inter, h: 0 }; }
    const v = votants(k);
    if (f.estat === "confirmada") {
      const prev = S.franges.get(anterior(k));
      const primera = !prev || prev.grup !== f.grup;
      cls += " conf" + (primera ? " primera" : "") + (v.some((x) => x.jo) ? " meu" : "");
      return { cls, txt: primera ? (f.nota || "Reunió") : "", inter: S.propietari && S.mode === "resp", h: 0 };
    }
    if (f.estat === "no_puc") { cls += " nopuc"; if (modeEditar()) { cls += " editable"; inter = true; } return { cls, txt, inter, h: 0 }; }
    cls += " obert" + (v.some((x) => x.jo) ? " meu" : "") + (modeEditar() ? " editable" : "");
    return { cls, txt: v.length ? String(v.length) : "", inter: true, h: v.length / S.maxV };
  }
  const interactiva = (k) => infoCela(k).inter;

  // ---------- pintat ----------
  function pintaTot() {
    pintaCap(); pintaQui(); pintaEines(); pintaGraella(); pintaLateral(); pintaBarra();
  }
  function pintaCap() {
    $("#titol").textContent = S.cfg.titol || "Reunions d'acollida";
    document.title = (S.cfg.titol || "Reunions d'acollida") + " | ELOTROFÚTBOLTV";
    $("#descripcio").textContent = S.cfg.descripcio || "";
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } })();
    const el = $("#tz");
    if (tz && tz !== "Europe/Madrid" && !/^Atlantic\/Canary$/.test(tz)) {
      el.className = "tz avis"; el.textContent = `El teu dispositiu està en ${tz}. Les hores d'aquí són sempre hora de Madrid.`;
    } else { el.className = "tz"; el.textContent = "Totes les hores són hora de Madrid"; }
  }
  function pintaEines() {
    $("#eines").hidden = !S.propietari;
    if (!S.propietari) return;
    $("#modeEditar").setAttribute("aria-pressed", String(S.mode === "editar"));
    $("#modeResp").setAttribute("aria-pressed", String(S.mode === "resp"));
    $("#pinzells").hidden = S.mode !== "editar"; $("#btnPlantilla").hidden = S.mode !== "editar";
    for (const b of $("#pinzells").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.eina === S.eina));
    $("#chkObert").checked = !!S.cfg.obert;
  }
  function pintaQui() {
    const el = $("#qui");
    el.hidden = S.propietari || !S.cfg.obert;
    if (el.hidden) return;
    if (S.id && !S.editantNom) {
      el.innerHTML = `${avatar(S.nom)}<div class="hola">Hola, ${esc(S.nom)}<small>Marca o treu franges i prem «Desa». Pots tornar quan vulguis des d'aquest dispositiu.</small></div>
        <button type="button" class="btn sm" id="btnCanviaNom">Canvia el nom</button><button type="button" class="btn sm perill" id="btnBaixa">Esborra'm</button>`;
    } else {
      el.innerHTML = `<input type="text" id="inNom" maxlength="40" autocomplete="name" placeholder="El teu nom i cognom" value="${esc(S.nom)}" aria-label="El teu nom i cognom">
        <span class="mut" style="flex:1 1 220px">${S.id ? "Edita el nom i desa." : "1) Escriu el teu nom · 2) Marca a la graella quan et va bé · 3) Prem «Desa»"}</span>
        ${S.id ? `<button type="button" class="btn sm" id="btnNomOk">Fet</button>` : ""}`;
    }
  }

  function rangHores() {
    let min = 1440, max = -1;
    for (const k of S.franges.keys()) { const m = clauMin(k); if (m < min) min = m; if (m > max) max = m; }
    if (S.propietari) { min = Math.min(min, 8 * 60); max = Math.max(max, 23 * 60 + 30); }
    if (max < 0) { min = 9 * 60; max = 20 * 60 + 30; }
    min = Math.floor(min / 60) * 60; max = Math.floor(max / 60) * 60 + 30;
    if (max - min < 150) max = min + 150;
    return [min, Math.min(max, 23 * 60 + 30)];
  }
  function pintaGraella() {
    const cal = $("#cal");
    const tancat = !S.cfg.obert && !S.propietari;
    $(".fila").style.display = tancat ? "block" : "";
    $("#cardMillors").hidden = tancat; $("#cardConf").hidden = tancat;
    if (tancat) {
      $("#graella").innerHTML = `<div class="tancat" style="grid-column:1/-1"><h2>El calendari està tancat</h2><p class="mut">Ara mateix no s'accepten noves respostes. Torna-hi més endavant.</p></div>`;
      $("#llegenda").innerHTML = ""; $("#rang").textContent = "—"; cal.querySelector(".nav").style.visibility = "hidden"; return;
    }
    cal.querySelector(".nav").style.visibility = "";
    recalculaMax();
    const [min, max] = rangHores();
    const g = $("#graella");
    const dies = []; for (let i = 0; i < S.nd; i++) dies.push(addDies(S.inici, i));
    const avui = S.ara.slice(0, 10);
    g.style.gridTemplateColumns = `50px repeat(${S.nd}, minmax(${S.nd === 3 ? 92 : 78}px, 1fr))`;
    let h = `<div class="cap-dia"></div>`;
    for (const d of dies) {
      const ds = ymd(d);
      const inner = `<b>${DIES_C[dow(d)]}</b><span>${d.getUTCDate()}</span>`;
      h += `<div class="cap-dia${ds === avui ? " avui" : ""}">${modeEditar() && ds >= avui ? `<button type="button" data-dia="${ds}" title="Aplica l'eina a tot el dia">${inner}<i class="dia-sencer">dia sencer</i></button>` : inner}</div>`;
    }
    for (let m = min; m <= max; m += 30) {
      h += `<div class="hora">${m % 60 === 0 ? horaTxt(m) : ""}</div>`;
      for (const d of dies) {
        const k = mkClau(ymd(d), m), i = infoCela(k);
        const etq = `${dataLlarga(ymd(d))} a les ${horaTxt(m)}`;
        h += i.inter
          ? `<button type="button" class="${i.cls}" data-k="${k}" style="--h:${i.h.toFixed(2)}" aria-label="${esc(etq)}" aria-pressed="${/\bmeu\b/.test(i.cls)}"><span class="n">${esc(i.txt)}</span></button>`
          : `<div class="${i.cls}" data-k="${k}" style="--h:0" title=""><span class="n">${esc(i.txt)}</span></div>`;
      }
    }
    g.innerHTML = h;
    const d1 = dies[0], d2 = dies[dies.length - 1];
    $("#rang").textContent = d1.getUTCMonth() === d2.getUTCMonth()
      ? `${d1.getUTCDate()}–${d2.getUTCDate()} ${MESOS_C[d1.getUTCMonth()]} ${d1.getUTCFullYear()}`
      : `${d1.getUTCDate()} ${MESOS_C[d1.getUTCMonth()]} – ${d2.getUTCDate()} ${MESOS_C[d2.getUTCMonth()]} ${d2.getUTCFullYear()}`;
    $("#prev").disabled = ymd(S.inici) <= ymd(S.nd === 7 ? addDies(parseYmd(avui), -dow(parseYmd(avui))) : parseYmd(avui));
    const obertes = [...S.franges.values()].some((f) => f.estat === "disponible");
    if (!obertes && !S.propietari) g.insertAdjacentHTML("beforeend", `<div class="buit-msg" style="grid-column:1/-1">Encara no hi ha franges disponibles. Aviat n'hi haurà!</div>`);
    $("#llegenda").innerHTML = `<span><i class="sw ok"></i>Disponible</span><span><i class="sw meu"></i>${S.propietari ? "Amb respostes" : "Marcat per tu"}</span><span><i class="sw conf"></i>Reunió confirmada</span>${S.propietari ? `<span><i class="sw no"></i>No puc</span>` : ""}<span><i class="sw off"></i>No disponible</span>${S.propietari ? "" : `<span>El número = persones que ho han marcat</span>`}`;
  }
  function actualitzaCela(k) {
    const el = $(`[data-k="${k}"]`, $("#graella")); if (!el) return;
    const i = infoCela(k);
    el.className = i.cls; el.style.setProperty("--h", i.h.toFixed(2));
    const n = el.querySelector(".n"); if (n) n.textContent = i.txt;
    el.setAttribute("aria-pressed", String(/\bmeu\b/.test(i.cls)));
  }

  // ---------- panell lateral ----------
  function calculaRuns() {
    const claus = [...S.franges.entries()].filter(([k, f]) => f.estat === "disponible" && k >= S.ara).map(([k]) => k).sort();
    const out = []; let cur = null;
    for (const k of claus) {
      const v = votants(k), sig = v.map((x) => x.id).sort().join(",");
      if (cur && seguent(cur.fi) === k && cur.sig === sig) { cur.fi = k; cur.n++; }
      else { if (cur) out.push(cur); cur = { ini: k, fi: k, n: 1, sig, v }; }
    }
    if (cur) out.push(cur);
    const min = S.propietari ? 1 : 2;
    return out.filter((r) => r.v.length >= min).sort((a, b) => b.v.length - a.v.length || (a.ini < b.ini ? -1 : 1)).slice(0, 6);
  }
  const rangTxt = (ini, fi) => `${horaTxt(clauMin(ini))}–${horaTxt(clauMin(fi) + 30)}`;
  function grupsConfirmats() {
    const grups = new Map();
    for (const [k, f] of [...S.franges.entries()].sort()) {
      if (f.estat !== "confirmada" || !f.grup) continue;
      const g = grups.get(f.grup) || { grup: f.grup, ini: k, fi: k, nota: f.nota, enllac: f.enllac };
      g.fi = k; grups.set(f.grup, g);
    }
    return [...grups.values()].sort((a, b) => (a.ini < b.ini ? -1 : 1));
  }
  function pintaLateral() {
    S.runs = calculaRuns();
    $("#millors").innerHTML = S.runs.length ? S.runs.map((r, i) => {
      const jo = r.v.some((x) => x.jo);
      return `<li class="item"><div class="qt"><span>${esc(dataLlarga(clauData(r.ini)))} · ${rangTxt(r.ini, r.fi)}</span><em>${plural(r.v.length, "persona", "persones")}</em></div>${xips(r.v, 6)}
        <div class="acc">${S.propietari ? `<button type="button" class="btn sm prim" data-run="${i}" data-acc="confirma">Confirma</button>` : (jo ? `<button type="button" class="btn sm" data-run="${i}" data-acc="treu">Treu-m'hi</button>` : `<button type="button" class="btn sm prim" data-run="${i}" data-acc="uneix">Afegeix-m'hi</button>`)}
        <button type="button" class="btn sm fantasma" data-run="${i}" data-acc="veu">Veure</button></div></li>`;
    }).join("") : `<li class="mut">${S.propietari ? "Quan algú marqui franges, aquí veuràs on coincideix més gent." : "Quan hi hagi franges amb més d'una persona, apareixeran aquí."}</li>`;

    const gc = grupsConfirmats();
    $("#confirmades").innerHTML = gc.length ? gc.map((g) => {
      const v = votants(g.ini);
      return `<li class="item conf"><div class="qt"><span>${esc(dataLlarga(clauData(g.ini)))} · ${rangTxt(g.ini, g.fi)}</span><em>Confirmada</em></div>
        ${g.nota ? `<div class="mut">${esc(g.nota)}</div>` : ""}${v.length ? xips(v, 8) : `<span class="mut">Sense persones apuntades</span>`}
        ${S.propietari ? `<div class="acc"><button type="button" class="btn sm" data-copia="${g.grup}">Copia el missatge</button><button type="button" class="btn sm perill" data-cancela="${g.grup}">Cancel·la</button></div>` : ""}</li>`;
    }).join("") : `<li class="mut">Encara no hi ha cap reunió confirmada.</li>`;

    const nVots = new Map();
    for (const pids of S.vots.values()) for (const p of pids) nVots.set(p, (nVots.get(p) || 0) + 1);
    const llista = [...S.persones.entries()].sort((a, b) => a[1].localeCompare(b[1], "ca"));
    $("#nPersones").textContent = llista.length ? plural(llista.length, "persona", "persones") : "";
    $("#persones").innerHTML = llista.length ? llista.map(([pid, nom]) => {
      const jo = S.id && S.id.pid === pid;
      return `<div class="persona">${avatar(nom)}<span class="nom">${esc(nom)}${jo ? " <span class='mut'>(tu)</span>" : ""}</span><span class="mut">${plural(nVots.get(pid) || 0, "franja", "franges")}</span>${S.propietari ? `<button type="button" class="btn sm perill fantasma" data-esborra="${pid}" aria-label="Esborra ${esc(nom)}">✕</button>` : ""}</div>`;
    }).join("") : `<span class="mut">Encara no ha respost ningú. Sigues la primera persona!</span>`;
  }
  function pintaBarra() {
    const b = $("#barra"), canvi = !S.propietari && S.cfg.obert && (hiHaCanvis() || (S.id && S.nom && S.nom !== S.nomDesat));
    b.classList.toggle("visible", !!canvi);
    $("#barraTxt").textContent = `Tens canvis sense desar · ${plural(S.meus.size, "franja marcada", "franges marcades")}`;
  }

  // ---------- tooltip ----------
  let tipT = null;
  function mostraTip(el, k) {
    const f = S.franges.get(k), tip = $("#tip");
    if (!f || k < S.ara) { amagaTip(); return; }
    const v = votants(k), ds = clauData(k);
    let cos;
    if (f.estat === "confirmada") cos = `Reunió confirmada${f.nota ? ": " + esc(f.nota) : ""}<br>${v.length ? v.map((x) => esc(x.nom)).join(", ") : "Sense persones apuntades"}`;
    else if (f.estat === "no_puc") cos = "No puc en aquesta franja";
    else cos = v.length ? `${plural(v.length, "persona", "persones")}:<br>${v.map((x) => esc(x.nom)).join(", ")}` : "Ningú ho ha marcat encara";
    tip.innerHTML = `<b>${esc(dataLlarga(ds))} · ${horaTxt(clauMin(k))}</b>${cos}`;
    const r = el.getBoundingClientRect();
    tip.classList.add("v");
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    tip.style.top = (r.bottom + 8 + hh > window.innerHeight ? Math.max(8, r.top - hh - 8) : r.bottom + 8) + "px";
  }
  function amagaTip() { $("#tip").classList.remove("v"); }

  // ---------- interacció amb la graella ----------
  let pintant = null, ignoraClick = false;
  function iniciaPintar(k) {
    pintant = { valor: S.propietari ? S.eina : !S.meus.has(k), claus: new Set() };
    aplicaPintar(k);
  }
  function aplicaPintar(k) {
    if (!pintant || pintant.claus.has(k) || !interactiva(k)) return;
    pintant.claus.add(k);
    if (S.propietari) {
      const f = S.franges.get(k);
      if (f && f.estat === "confirmada") return;
      if (pintant.valor === "buit") S.franges.delete(k); else S.franges.set(k, { clau: k, estat: pintant.valor, nota: "" });
      if (pintant.valor !== "disponible") S.vots.delete(k);
    } else if (pintant.valor) S.meus.add(k); else S.meus.delete(k);
    actualitzaCela(k);
  }
  async function acabaPintar() {
    if (!pintant) return;
    const p = pintant; pintant = null;
    if (!p.claus.size) return;
    if (!S.propietari) { pintaLateral(); pintaBarra(); recalculaMax(); return; }
    try {
      await api("/api/reunions/admin/franges", { method: "PUT", body: JSON.stringify({ estat: p.valor, claus: [...p.claus] }) }, true);
      await carrega(true);
    } catch (e) { avis(e.message, true); carrega(true); }
  }
  async function aplicaDia(ds) {
    const [min, max] = rangHores(); const claus = [];
    for (let m = min; m <= max; m += 30) { const k = mkClau(ds, m); const f = S.franges.get(k); if (k >= S.ara && !(f && f.estat === "confirmada")) claus.push(k); }
    if (!claus.length) return;
    try { await api("/api/reunions/admin/franges", { method: "PUT", body: JSON.stringify({ estat: S.eina, claus }) }, true); await carrega(true); avis("Dia actualitzat"); }
    catch (e) { avis(e.message, true); }
  }
  function toggleTouch(k) {
    if (S.propietari) { if (S.mode === "resp") obreDetall(k); else { pintant = { valor: S.eina, claus: new Set() }; aplicaPintar(k); acabaPintar(); } return; }
    if (!interactiva(k)) return;
    if (S.meus.has(k)) S.meus.delete(k); else S.meus.add(k);
    actualitzaCela(k); pintaLateral(); pintaBarra();
  }
  function obreDetall(k) {
    const f = S.franges.get(k);
    if (!f) return;
    if (f.estat === "confirmada") { mostraTip($(`[data-k="${k}"]`), k); return; }
    if (f.estat === "disponible") obreConfirmar(k, 2);
  }

  // ---------- diàleg confirmar ----------
  let confirmant = null;
  function obreConfirmar(k, franges) {
    confirmant = k;
    const v = votants(k);
    $("#cfInfo").innerHTML = `<p style="margin:0"><b>${esc(dataLlarga(clauData(k)))} · ${horaTxt(clauMin(k))}</b></p><p class="mut" style="margin:4px 0 0">${v.length ? plural(v.length, "persona ha marcat", "persones han marcat") + " aquesta franja:" : "Ningú ha marcat aquesta franja encara."}</p>${v.length ? `<div style="margin-top:8px">${xips(v, 30)}</div>` : ""}`;
    $("#cfDurada").value = String(franges || 2); if (!$("#cfDurada").value) $("#cfDurada").value = "2"; $("#cfNota").value = ""; $("#cfEnllac").value = "";
    $("#dlgConfirmar").showModal();
  }
  function missatge(g) {
    const v = votants(g.ini).map((x) => x.nom);
    return `Reunió confirmada: ${dataLlarga(clauData(g.ini))}, de ${rangTxt(g.ini, g.fi)} (hora de Madrid)${g.nota ? "\nNota: " + g.nota : ""}${g.enllac ? "\nEnllaç: " + g.enllac : ""}${v.length ? "\nConvocats: " + v.join(", ") : ""}`;
  }
  async function copia(text, ok) {
    try { await navigator.clipboard.writeText(text); avis(ok || "Copiat!"); }
    catch { window.prompt("Copia el text:", text); }
  }

  // ---------- accions ----------
  async function desa() {
    const nom = ($("#inNom") ? $("#inNom").value : S.nom).replace(/\s+/g, " ").trim();
    if (nom.length < 2) { avis("Escriu el teu nom i cognom abans de desar", true); const i = $("#inNom"); if (i) i.focus(); return; }
    S.nom = nom;
    const b = $("#btnDesar"); b.disabled = true;
    try {
      const r = await api("/api/reunions/public/vots", { method: "POST", body: JSON.stringify({ pid: S.id && S.id.pid, secret: S.id && S.id.secret, nom, claus: [...S.meus], web: "" }) });
      S.id = { pid: r.pid, secret: r.secret }; S.editantNom = false; S.nomDesat = nom; guardaId();
      S.originals = new Set(S.meus);
      await carrega(true);
      avis("Desat! Gràcies");
    } catch (e) { avis(e.message, true); } finally { b.disabled = false; }
  }
  function desfes() { S.meus = new Set(S.originals); pintaTot(); }
  async function baixa() {
    if (!confirm("Vols esborrar el teu nom i totes les teves franges del calendari?")) return;
    try {
      await api("/api/reunions/public/baixa", { method: "POST", body: JSON.stringify({ pid: S.id.pid, secret: S.id.secret }) });
      S.id = null; S.meus = new Set(); S.originals = new Set(); S.nom = ""; try { localStorage.removeItem(CLAU_ID); } catch { /* ignorem */ }
      await carrega(true); avis("Dades esborrades");
    } catch (e) { avis(e.message, true); }
  }
  function mou(dir) {
    const pas = S.nd; S.inici = addDies(S.inici, dir * pas);
    const avui = parseYmd(S.ara.slice(0, 10)), lim = S.nd === 7 ? addDies(avui, -dow(avui)) : avui;
    if (S.inici < lim) S.inici = lim;
    pintaGraella();
  }
  function vesAvui() {
    const avui = parseYmd(S.ara.slice(0, 10)); S.inici = S.nd === 7 ? addDies(avui, -dow(avui)) : avui; pintaGraella();
  }

  // ---------- plantilla ----------
  function preparaPlantilla() {
    $("#plDies").innerHTML = DIES_C.map((d, i) => `<label><input type="checkbox" value="${i}" ${i < 5 ? "checked" : ""}><span>${d}</span></label>`).join("");
    const hores = []; for (let m = 6 * 60; m <= 24 * 60; m += 30) hores.push(m);
    $("#plDes").innerHTML = hores.slice(0, -1).map((m) => `<option value="${m}" ${m === 17 * 60 ? "selected" : ""}>${horaTxt(m)}</option>`).join("");
    $("#plFins").innerHTML = hores.slice(1).map((m) => `<option value="${m}" ${m === 20 * 60 ? "selected" : ""}>${m === 1440 ? "24:00" : horaTxt(m)}</option>`).join("");
    $("#plSetm").innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i === 3 ? "selected" : ""}>${plural(i + 1, "setmana", "setmanes")}</option>`).join("");
    $("#plEstat").value = S.eina;
    $("#dlgPlantilla").showModal();
  }
  async function aplicaPlantilla() {
    const dies = [...$("#plDies").querySelectorAll("input:checked")].map((i) => +i.value);
    const des = +$("#plDes").value, fins = +$("#plFins").value, setm = +$("#plSetm").value, estat = $("#plEstat").value;
    if (!dies.length || fins <= des) { avis("Revisa els dies i l'horari", true); return; }
    const avui = parseYmd(S.ara.slice(0, 10)), claus = [];
    for (let i = 0; i < setm * 7; i++) {
      const d = addDies(avui, i); if (!dies.includes(dow(d))) continue;
      for (let m = des; m < fins; m += 30) { const k = mkClau(ymd(d), m); const f = S.franges.get(k); if (k >= S.ara && !(f && f.estat === "confirmada")) claus.push(k); }
    }
    if (!claus.length) { avis("No hi ha franges per aplicar", true); return; }
    try {
      for (let i = 0; i < claus.length; i += 650) await api("/api/reunions/admin/franges", { method: "PUT", body: JSON.stringify({ estat, claus: claus.slice(i, i + 650) }) }, true);
      await carrega(true); avis(`Plantilla aplicada (${plural(claus.length, "franja", "franges")})`);
    } catch (e) { avis(e.message, true); }
  }

  // ---------- events ----------
  function enllaça() {
    const g = $("#graella");
    g.addEventListener("pointerdown", (e) => {
      const dia = e.target.closest("[data-dia]"); if (dia) return;
      const c = e.target.closest("[data-k]"); if (!c) return;
      if (e.pointerType !== "mouse" || e.button !== 0) return; // tàctil i teclat passen pel "click"
      const k = c.dataset.k;
      if (S.propietari && S.mode === "resp") return;
      if (!interactiva(k)) return;
      e.preventDefault(); ignoraClick = true; iniciaPintar(k);
    });
    g.addEventListener("pointerover", (e) => {
      const c = e.target.closest("[data-k]"); if (!c) return;
      if (pintant) aplicaPintar(c.dataset.k);
      if (e.pointerType === "mouse") mostraTip(c, c.dataset.k);
    });
    g.addEventListener("pointerleave", amagaTip);
    document.addEventListener("pointerup", () => { acabaPintar(); setTimeout(() => { ignoraClick = false; }, 60); });
    document.addEventListener("pointercancel", () => { pintant = null; });
    g.addEventListener("click", (e) => {
      const dia = e.target.closest("[data-dia]"); if (dia) { aplicaDia(dia.dataset.dia); return; }
      if (ignoraClick) { ignoraClick = false; return; }
      const c = e.target.closest("[data-k]"); if (!c) return;
      const k = c.dataset.k;
      toggleTouch(k);
      if (!S.propietari) { mostraTip(c, k); clearTimeout(tipT); tipT = setTimeout(amagaTip, 2400); }
    });

    $("#prev").onclick = () => mou(-1); $("#next").onclick = () => mou(1); $("#avui").onclick = vesAvui;
    $("#btnDesar").onclick = desa; $("#btnDesfer").onclick = desfes;

    $("#qui").addEventListener("input", (e) => { if (e.target.id === "inNom") { S.nom = e.target.value; pintaBarra(); } });
    $("#qui").addEventListener("click", (e) => {
      const id = e.target.id;
      if (id === "btnCanviaNom") { S.editantNom = true; pintaQui(); const i = $("#inNom"); if (i) { i.focus(); i.select(); } }
      if (id === "btnNomOk") { S.nom = ($("#inNom").value || "").replace(/\s+/g, " ").trim() || S.nom; S.editantNom = false; pintaQui(); pintaBarra(); }
      if (id === "btnBaixa") baixa();
    });
    $("#qui").addEventListener("keydown", (e) => { if (e.target.id === "inNom" && e.key === "Enter") { e.preventDefault(); if (S.id) $("#btnNomOk").click(); else $("#cal").scrollIntoView({ behavior: "smooth", block: "start" }); } });

    document.querySelector(".lateral").addEventListener("click", async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.run !== undefined) {
        const r = S.runs[+b.dataset.run]; if (!r) return;
        const claus = []; for (let k = r.ini; ; k = seguent(k)) { claus.push(k); if (k === r.fi) break; }
        if (b.dataset.acc === "confirma") obreConfirmar(r.ini, r.n);
        else if (b.dataset.acc === "veu") { S.inici = S.nd === 7 ? addDies(parseYmd(clauData(r.ini)), -dow(parseYmd(clauData(r.ini)))) : parseYmd(clauData(r.ini)); pintaGraella(); $("#cal").scrollIntoView({ behavior: "smooth", block: "start" }); }
        else { for (const k of claus) { if (b.dataset.acc === "uneix") S.meus.add(k); else S.meus.delete(k); } pintaTot(); if (b.dataset.acc === "uneix" && S.nom.trim().length < 2) { avis("Escriu el teu nom i prem Desa"); } }
      }
      if (b.dataset.copia) { const g = grupsConfirmats().find((x) => x.grup === b.dataset.copia); if (g) copia(missatge(g), "Missatge copiat"); }
      if (b.dataset.cancela && confirm("Vols cancel·lar aquesta reunió? Les franges tornaran a estar disponibles.")) {
        try { await api("/api/reunions/admin/cancelar", { method: "POST", body: JSON.stringify({ grup: b.dataset.cancela }) }, true); await carrega(true); avis("Reunió cancel·lada"); } catch (er) { avis(er.message, true); }
      }
      if (b.dataset.esborra && confirm("Vols esborrar aquesta persona i totes les seves respostes?")) {
        try { await api("/api/reunions/admin/persona/" + b.dataset.esborra, { method: "DELETE" }, true); await carrega(true); avis("Persona esborrada"); } catch (er) { avis(er.message, true); }
      }
    });

    // propietari
    $("#modeEditar").onclick = () => { S.mode = "editar"; pintaTot(); };
    $("#modeResp").onclick = () => { S.mode = "resp"; pintaTot(); };
    $("#pinzells").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.eina = b.dataset.eina; pintaEines(); } });
    $("#btnPlantilla").onclick = preparaPlantilla;
    $("#btnCopiarEnllac").onclick = () => copia(location.origin + "/reunions", "Enllaç copiat: ja el pots enviar");
    $("#chkObert").onchange = async (e) => {
      try { const r = await api("/api/reunions/admin/config", { method: "PUT", body: JSON.stringify({ ...S.cfg, obert: e.target.checked }) }, true); S.cfg = r.config; avis(S.cfg.obert ? "Calendari obert" : "Calendari tancat per al públic"); pintaTot(); }
      catch (er) { e.target.checked = !e.target.checked; avis(er.message, true); }
    };
    $("#btnConfig").onclick = () => { $("#cgTitol").value = S.cfg.titol || ""; $("#cgDesc").value = S.cfg.descripcio || ""; $("#dlgConfig").showModal(); };
    for (const d of document.querySelectorAll("dialog")) d.addEventListener("click", (e) => { if (e.target.closest("[data-tanca]") || e.target === d) d.close(); });
    $("#frmConfirmar").addEventListener("submit", async (e) => {
      e.preventDefault();
      const b = $("#cfOk"); b.disabled = true;
      try {
        const ini = confirmant, n = +$("#cfDurada").value, enllac = $("#cfEnllac").value.trim(), nota = $("#cfNota").value.trim();
        const rc = await api("/api/reunions/admin/confirmar", { method: "POST", body: JSON.stringify({ clau: ini, franges: n, enllac, nota }) }, true);
        $("#dlgConfirmar").close(); await carrega(true);
        const nc = rc && rc.correo && rc.correo.enviados ? rc.correo.enviados : 0;
        const txtCorreu = nc ? ` · correu enviat a ${nc} ${nc === 1 ? "persona" : "persones"}` : "";
        const g = grupsConfirmats().find((x) => x.ini === ini);
        if (g) { g.enllac = enllac; copia(missatge(g), "Reunió confirmada" + txtCorreu + " · missatge copiat per enviar-lo"); } else avis("Reunió confirmada" + txtCorreu);
      } catch (er) { avis(er.message, true); } finally { b.disabled = false; }
    });
    $("#frmPlantilla").addEventListener("submit", (e) => { e.preventDefault(); $("#dlgPlantilla").close(); aplicaPlantilla(); });
    $("#frmConfig").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { const r = await api("/api/reunions/admin/config", { method: "PUT", body: JSON.stringify({ titol: $("#cgTitol").value, descripcio: $("#cgDesc").value, obert: S.cfg.obert }) }, true); S.cfg = r.config; $("#dlgConfig").close(); pintaTot(); avis("Desat"); }
      catch (er) { avis(er.message, true); }
    });

    window.addEventListener("beforeunload", (e) => { if (!S.propietari && hiHaCanvis()) { e.preventDefault(); e.returnValue = ""; } });
    let rt = null;
    window.addEventListener("resize", () => {
      clearTimeout(rt); rt = setTimeout(() => {
        const nd = window.innerWidth < 720 ? 3 : 7;
        if (nd !== S.nd) { S.nd = nd; if (nd === 7) S.inici = addDies(S.inici, -dow(S.inici)); pintaGraella(); }
      }, 180);
    });
    setInterval(() => { if (!document.hidden && !pintant && !hiHaCanvis() && !document.querySelector("dialog[open]")) carrega(true); }, 45000);
  }

  enllaça();
  S.inici = parseYmd(S.ara.slice(0, 10)); S.nd = window.innerWidth < 720 ? 3 : 7;
  if (S.nd === 7) S.inici = addDies(S.inici, -dow(S.inici));
  pintaTot();
  carrega(false);
})();
