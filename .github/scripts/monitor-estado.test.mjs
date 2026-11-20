// Pruebas del monitor de estado: node --test .github/scripts/monitor-estado.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { evaluar, plantilla, debeEscribir, clasificarWeb, clasificarApiDb, observar, mensajesDiscord } from "./monitor-estado.mjs";

const T0 = Date.parse("2026-11-20T10:00:00Z");
const min = (n) => T0 + n * 60000;
const ok = { web: { estado: "ok" }, api: { estado: "ok" }, db: { estado: "ok" } };

test("primera ejecución fija 'desde' y no abre nada si todo va bien", () => {
  const d = plantilla();
  const c = evaluar(d, ok, T0);
  assert.equal(d.desde, new Date(T0).toISOString());
  assert.equal(d.incidencias.length, 0);
  assert.equal(c.length, 1);
});

test("abre una incidencia, no la duplica y la cierra al recuperarse", () => {
  const d = plantilla(); evaluar(d, ok, T0);
  const caida = { ...ok, db: { estado: "caida", detalle: "la base de datos no responde (HTTP 503)" } };
  evaluar(d, caida, min(10));
  assert.equal(d.incidencias.length, 1);
  assert.equal(evaluar(d, caida, min(20)).length, 0);
  assert.equal(d.incidencias.length, 1);
  const c = evaluar(d, ok, min(30));
  assert.equal(d.incidencias[0].fin, new Date(min(30)).toISOString());
  assert.equal(c[0].accion, "cierre");
});

test("mantenimiento se registra como tipo 'mantenimiento' y una caída abierta pasa a mantenimiento", () => {
  const d = plantilla(); evaluar(d, ok, T0);
  evaluar(d, { ...ok, web: { estado: "caida", detalle: "HTTP 502" } }, min(10));
  evaluar(d, { ...ok, web: { estado: "mantenimiento" } }, min(20));
  const w = d.incidencias.filter((i) => i.componente === "web");
  assert.deepEqual(w.map((i) => [i.tipo, !!i.fin]), [["incidencia", true], ["mantenimiento", false]]);
});

test("'desconocido' no abre ni cierra nada", () => {
  const d = plantilla(); evaluar(d, ok, T0);
  evaluar(d, { ...ok, db: { estado: "caida", detalle: "x" } }, min(10));
  evaluar(d, { ...ok, db: { estado: "desconocido" } }, min(20));
  assert.equal(d.incidencias[0].fin, null);
});

test("latido: solo reescribe sin cambios pasadas 12 h", () => {
  const d = plantilla(); evaluar(d, ok, T0); d.actualizado = new Date(T0).toISOString();
  assert.equal(debeEscribir(d, [], min(60)), false);
  assert.equal(debeEscribir(d, [], T0 + 13 * 3600000), true);
});

test("poda las incidencias cerradas de más de 120 días", () => {
  const d = plantilla(); evaluar(d, ok, T0);
  d.incidencias.push({ componente: "web", tipo: "incidencia", inicio: "2026-06-01T00:00:00Z", fin: "2026-06-01T01:00:00Z", detalle: "" });
  evaluar(d, ok, T0);
  assert.equal(d.incidencias.length, 0);
});

test("clasificación de web y API", () => {
  assert.equal(clasificarWeb({ status: 200, texto: "" }).estado, "ok");
  assert.equal(clasificarWeb({ status: 503, texto: "<h1>Mantenimiento en curso</h1>" }).estado, "mantenimiento");
  assert.equal(clasificarWeb({ status: 503, texto: "error" }).estado, "caida");
  assert.equal(clasificarWeb({ error: "sin conexión" }).estado, "caida");
  const sano = clasificarApiDb({ status: 200, texto: '{"status":"ok","database":true}' });
  assert.deepEqual([sano.api.estado, sano.db.estado], ["ok", "ok"]);
  const dbMal = clasificarApiDb({ status: 503, texto: '{"status":"degraded","database":false}' });
  assert.deepEqual([dbMal.api.estado, dbMal.db.estado], ["ok", "caida"]);
  const html503 = clasificarApiDb({ status: 503, texto: "<html>Error 1101</html>" });
  assert.deepEqual([html503.api.estado, html503.db.estado], ["caida", "desconocido"]);
  const mant = clasificarApiDb({ status: 503, texto: "<h1>En mantenimiento</h1>" });
  assert.deepEqual([mant.api.estado, mant.db.estado], ["mantenimiento", "desconocido"]);
});

test("observar con servidores locales: caída confirmada y parpadeo descartado", async () => {
  let llamadasWeb = 0;
  const srv = http.createServer((req, res) => {
    if (req.url === "/web-caida") { res.writeHead(500); return res.end("boom"); }
    if (req.url === "/web-parpadeo") { llamadasWeb++; res.writeHead(llamadasWeb === 1 ? 502 : 200); return res.end("x"); }
    if (req.url === "/health-db-mal") { res.writeHead(503, { "Content-Type": "application/json" }); return res.end('{"status":"degraded","database":false}'); }
    res.writeHead(200); res.end("ok");
  }).listen(0);
  await new Promise((r) => srv.once("listening", r));
  const base = "http://127.0.0.1:" + srv.address().port;
  const c = { webUrl: base + "/web-caida", apiUrl: base + "/health-db-mal", esperaMs: 5, timeoutMs: 2000 };
  const a = await observar(c);
  assert.deepEqual([a.web.estado, a.api.estado, a.db.estado], ["caida", "ok", "caida"]);
  const b = await observar({ ...c, webUrl: base + "/web-parpadeo" });
  assert.equal(b.web.estado, "ok");
  srv.close();
});

test("mensajes de Discord: sin duplicar la caída de la API", () => {
  const m = mensajesDiscord([
    { accion: "apertura", componente: "api", tipo: "incidencia", detalle: "HTTP 502" },
    { accion: "apertura", componente: "web", tipo: "incidencia", detalle: "HTTP 500" },
    { accion: "cierre", componente: "api", tipo: "incidencia", inicio: "2026-11-20T10:00:00Z", fin: "2026-11-20T10:30:00Z" },
    { accion: "apertura", componente: "web", tipo: "mantenimiento" },
  ]);
  assert.equal(m.length, 2);
});
