#!/usr/bin/env node
/* monitor-estado.mjs — Monitor automático del histórico de incidencias de /estado.
 *
 * Comprueba desde fuera (GitHub Actions) la web, la API y la base de datos, y mantiene
 * data/estado/incidencias.json, que lee public/js/estado-historico.js.
 *
 *   web  -> GET https://elotrofutbol.media/            (503 + página de mantenimiento = mantenimiento)
 *   api  -> GET https://api.elotrofutbol.media/api/health (responde, aunque sea con 503 JSON)
 *   db   -> campo "database" del JSON de /api/health (true = ok, false = incidencia)
 *
 * Reglas:
 *  - Una caída solo se da por buena si falla en TODOS los intentos de la misma ejecución
 *    (3 intentos separados 20 s), para no registrar parpadeos de red.
 *  - El mantenimiento programado se registra como tipo "mantenimiento" (no cuenta como caída).
 *  - Si no se puede evaluar un componente (p. ej. db cuando la API no responde) no se toca.
 *  - Solo se reescribe el fichero si hay cambios, o como latido cada 12 h (la página avisa
 *    de que el histórico puede estar incompleto si "actualizado" tiene más de 48 h).
 *  - Los avisos a Discord (DISCORD_WEBHOOK_URL) cubren apertura de caídas de web/db y
 *    recuperación de cualquier componente. La caída de la API ya la avisa monitor-salud.yml.
 *
 * Variables opcionales: MONITOR_WEB_URL, MONITOR_API_URL, MONITOR_ARCHIVO,
 * MONITOR_ESPERA_MS, MONITOR_TIMEOUT_MS, DISCORD_WEBHOOK_URL.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

export const COMPONENTES = ["web", "api", "db"];
const NOMBRES = { web: "Web", api: "API", db: "Base de datos" };
const HEARTBEAT_MS = 12 * 3600000;
const RETENCION_MS = 120 * 86400000;
const INTENTOS = 3;

const cfg = () => ({
  webUrl: process.env.MONITOR_WEB_URL || "https://elotrofutbol.media/",
  apiUrl: process.env.MONITOR_API_URL || "https://api.elotrofutbol.media/api/health",
  archivo: process.env.MONITOR_ARCHIVO || "data/estado/incidencias.json",
  esperaMs: Number(process.env.MONITOR_ESPERA_MS ?? 20000),
  timeoutMs: Number(process.env.MONITOR_TIMEOUT_MS ?? 20000),
});

const ms = (iso) => { const t = iso ? new Date(iso).getTime() : NaN; return Number.isNaN(t) ? null : t; };
const dormir = (t) => new Promise((r) => setTimeout(r, t));
const recortar = (s, n = 120) => String(s).replace(/\s+/g, " ").trim().slice(0, n);

/* ---------- Sondeo ---------- */
async function sondear(url, timeoutMs) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "ElOtroFutbol-Monitor/1.0 (+https://elotrofutbol.media/estado)", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    const texto = (await r.text()).slice(0, 4000);
    return { status: r.status, texto };
  } catch (e) {
    const timeout = e && (e.name === "TimeoutError" || e.name === "AbortError");
    return { error: timeout ? "sin respuesta (timeout)" : "sin conexión" };
  }
}

const esMantenimiento = (p) => p.status === 503 && /mantenimiento/i.test(p.texto || "");

export function clasificarWeb(p) {
  if (p.error) return { estado: "caida", detalle: p.error };
  if (p.status >= 200 && p.status < 400) return { estado: "ok" };
  if (esMantenimiento(p)) return { estado: "mantenimiento" };
  return { estado: "caida", detalle: "HTTP " + p.status };
}

export function clasificarApiDb(p) {
  if (p.error) return { api: { estado: "caida", detalle: p.error }, db: { estado: "desconocido" } };
  if (esMantenimiento(p)) return { api: { estado: "mantenimiento" }, db: { estado: "desconocido" } };
  let json = null;
  try { json = JSON.parse(p.texto); } catch { /* no es JSON */ }
  if (json && typeof json === "object" && typeof json.status === "string") {
    const db = json.database === true ? { estado: "ok" }
      : json.database === false ? { estado: "caida", detalle: "la base de datos no responde (HTTP " + p.status + ")" }
      : { estado: "desconocido" };
    return { api: { estado: "ok" }, db };
  }
  if (p.status === 200) return { api: { estado: "ok" }, db: { estado: "desconocido" } };
  return { api: { estado: "caida", detalle: "HTTP " + p.status }, db: { estado: "desconocido" } };
}

async function unaPasada(c) {
  const [w, a] = await Promise.all([sondear(c.webUrl, c.timeoutMs), sondear(c.apiUrl, c.timeoutMs)]);
  const ad = clasificarApiDb(a);
  return { web: clasificarWeb(w), api: ad.api, db: ad.db };
}

/* Una caída solo cuenta si falla en todos los intentos; si alguno salió bien, manda el último resultado no caído. */
export async function observar(c = cfg()) {
  const pasadas = [];
  for (let i = 0; i < INTENTOS; i++) {
    if (i > 0) await dormir(c.esperaMs);
    pasadas.push(await unaPasada(c));
    if (!COMPONENTES.some((k) => pasadas[i][k].estado === "caida")) break;
  }
  const final = {};
  for (const k of COMPONENTES) {
    const todasCaidas = pasadas.length === INTENTOS && pasadas.every((p) => p[k].estado === "caida");
    const ultima = pasadas[pasadas.length - 1][k];
    if (todasCaidas) final[k] = ultima;
    else if (ultima.estado === "caida") final[k] = [...pasadas].reverse().map((p) => p[k]).find((x) => x.estado !== "caida") || ultima;
    else final[k] = ultima;
  }
  return final;
}

/* ---------- Lógica de incidencias (pura) ---------- */
export function plantilla() { return { version: 1, desde: null, actualizado: null, incidencias: [] }; }

export function evaluar(datos, obs, ahora) {
  const iso = new Date(ahora).toISOString();
  const cambios = [];
  if (!Array.isArray(datos.incidencias)) datos.incidencias = [];
  if (ms(datos.desde) == null) { datos.desde = iso; cambios.push({ accion: "inicio" }); }
  for (const comp of COMPONENTES) {
    const o = obs[comp];
    if (!o || o.estado === "desconocido") continue;
    const deseado = o.estado === "caida" ? "incidencia" : o.estado === "mantenimiento" ? "mantenimiento" : null;
    const abiertas = datos.incidencias.filter((i) => i.componente === comp && !i.fin);
    if (deseado && abiertas.length === 1 && abiertas[0].tipo === deseado) continue;
    for (const a of abiertas) {
      a.fin = iso;
      cambios.push({ accion: "cierre", componente: comp, tipo: a.tipo, inicio: a.inicio, fin: iso });
    }
    if (deseado) {
      const nueva = { componente: comp, tipo: deseado, inicio: iso, fin: null, detalle: o.detalle ? recortar(o.detalle) : "" };
      datos.incidencias.push(nueva);
      cambios.push({ accion: "apertura", componente: comp, tipo: deseado, inicio: iso, detalle: nueva.detalle });
    }
  }
  datos.incidencias = datos.incidencias.filter((i) => !(i.fin && ms(i.fin) < ahora - RETENCION_MS));
  return cambios;
}

export function debeEscribir(datos, cambios, ahora) {
  const act = ms(datos.actualizado);
  return cambios.length > 0 || act == null || ahora - act > HEARTBEAT_MS;
}

/* ---------- Discord ---------- */
async function avisar(texto) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: texto }), signal: AbortSignal.timeout(15000) });
  } catch { /* un aviso fallido nunca debe romper el monitor */ }
}

export function mensajesDiscord(cambios) {
  const out = [];
  for (const c of cambios) {
    if (c.accion === "apertura" && c.tipo === "incidencia" && c.componente !== "api") {
      out.push("🚨 **Estado ElOtroFútbol** · " + NOMBRES[c.componente] + " con problemas" + (c.detalle ? " (" + c.detalle + ")" : "") + ".");
    } else if (c.accion === "cierre" && c.tipo === "incidencia") {
      const min = Math.max(1, Math.round((ms(c.fin) - ms(c.inicio)) / 60000));
      out.push("✅ **Estado ElOtroFútbol** · " + NOMBRES[c.componente] + " recuperada tras " + min + " min.");
    }
  }
  return out;
}

/* ---------- Principal ---------- */
async function main() {
  const c = cfg();
  const datos = existsSync(c.archivo) ? JSON.parse(readFileSync(c.archivo, "utf8")) : plantilla();
  const obs = await observar(c);
  const ahora = Date.now();
  const cambios = evaluar(datos, obs, ahora);

  console.log("Observación:", COMPONENTES.map((k) => k + "=" + obs[k].estado + (obs[k].detalle ? " (" + obs[k].detalle + ")" : "")).join(" · "));
  cambios.filter((x) => x.accion !== "inicio").forEach((x) => console.log("Cambio:", x.accion, x.componente, x.tipo));

  if (debeEscribir(datos, cambios, ahora)) {
    datos.actualizado = new Date(ahora).toISOString();
    mkdirSync(dirname(c.archivo), { recursive: true });
    writeFileSync(c.archivo, JSON.stringify(datos, null, 2) + "\n");
    console.log("Fichero actualizado:", c.archivo);
  } else {
    console.log("Sin cambios; no se reescribe el fichero.");
  }
  for (const m of mensajesDiscord(cambios)) await avisar(m);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, "### Monitor de estado\n" + COMPONENTES.map((k) => "- " + NOMBRES[k] + ": " + obs[k].estado + (obs[k].detalle ? " — " + obs[k].detalle : "")).join("\n") + "\n");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((e) => { console.error("Error del monitor:", e); process.exit(1); });
}
