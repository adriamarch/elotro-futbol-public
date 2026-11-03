// Integración scraper de Flashscore -> web: el parser Python genera los datos y el código
// REAL de public/js (extraído, no copiado) los casa por nombre y los pinta.
//   node herramientas/flashscore/tests/test_front.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "..", "..", "..");

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ctx = {
  baseHref: () => "/",
  slugEquipo: (n) => n.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
  escapeHtml,
  tarjetaDato: (v, e, x = "") => `<div class="d ${x}"><b>${v}</b><i>${e}</i></div>`,
  fechaCorta: () => "25 oct",
  document: { getElementById: () => null },
  location: { search: "" },
  fijarSeoBasico: () => {},
  URLSearchParams,
};
vm.createContext(ctx);

// jugador.js: bloque de la ficha
const srcJ = fs.readFileSync(path.join(raiz, "js/jugador.js"), "utf8");
const ini = srcJ.indexOf("// ---------- Bloque aparte");
const fin = srcJ.indexOf("function pintarFicha(d) {");
assert.ok(ini > 0 && fin > ini, "no se encuentra el bloque externo en jugador.js");
vm.runInContext(srcJ.slice(0, fin) + ";this.__J={buscarJugadorExterno,htmlExterno,esDocFlashscore};", ctx);
// plantilla-lp.js: tabla de /plantilla
const srcL = fs.readFileSync(path.join(raiz, "js/plantilla-lp.js"), "utf8");
vm.runInContext(srcL + ";this.__L={lpHtmlPlantilla,lpEmparejar,lpEsFlashscore,lpCargarPlantilla};", ctx);
const { buscarJugadorExterno, htmlExterno, esDocFlashscore } = ctx.__J;
const { lpHtmlPlantilla, lpEmparejar, lpEsFlashscore, lpCargarPlantilla } = ctx.__L;

const python = ["python3", "python", "py"].find((c) => {
  try { execFileSync(c, ["-c", "pass"], { stdio: "ignore" }); return true; } catch { return false; }
});
assert.ok(python, "no encuentro Python (python3 / python / py) en el PATH");
const py = `import json,sys;sys.path.insert(0,r'${aqui}');sys.path.insert(0,r'${path.join(aqui, "..")}');` +
  `import flashscore as fs, test_flashscore as t;r=fs.parse_plantilla(t.html_div(),'https://www.flashscore.es/equipo/cadiz-cf/hdWjLJUJ/plantilla/');print(json.dumps(r,ensure_ascii=False))`;
const datos = JSON.parse(execFileSync(python, ["-X", "utf8", "-c", py], {
  encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
}));
const doc = {
  fuente: "Flashscore.es", fuente_url: "https://www.flashscore.es/equipo/cadiz-cf/hdWjLJUJ/plantilla/",
  temporada: datos.temporada, actualizado: "2026-10-25", jugadores: datos.jugadores,
};
assert.equal(doc.jugadores.length, 33);

// Flashscore escribe «Apellido Nombre»; la redacción «Nombre Apellido»: el casado no depende del orden.
assert.equal(buscarJugadorExterno(doc.jugadores, "Sergio Arribas")?.id, "x82H42AD");
assert.equal(buscarJugadorExterno(doc.jugadores, "Arribas")?.id, "x82H42AD");
assert.equal(buscarJugadorExterno(doc.jugadores, "Antonio Cordero")?.id, "tQQcMsFa");
assert.equal(buscarJugadorExterno(doc.jugadores, "Jokin Ezkieta")?.id, "IPkF6s5H");
assert.equal(buscarJugadorExterno(doc.jugadores, "Izeta")?.id, "E1UCv80p");
assert.equal(buscarJugadorExterno(doc.jugadores, "Marc-Olivier Doué")?.id, "h0XIJLiF");   // tilde y guion
assert.equal(buscarJugadorExterno(doc.jugadores, "Pepe Inexistente"), null);
assert.equal(buscarJugadorExterno(doc.jugadores, "Ruben"), null);                        // 3 «Ruben»: ambiguo -> nada
assert.equal(buscarJugadorExterno(doc.jugadores, "Cesar Diaz")?.id, "6wZ65WvI");

// Ficha: sin titularidades ni goles encajados, enseña asistencias y goles (también al portero).
const ficha = (nombre) => htmlExterno(buscarJugadorExterno(doc.jugadores, nombre), doc);
const cordero = ficha("Antonio Cordero");
assert.match(cordero, /<dt>Partidos<\/dt><dd>10<\/dd>/);
assert.match(cordero, /<dt>Minutos<\/dt><dd>679<\/dd>/);
assert.match(cordero, /<dt>Goles<\/dt><dd>3<\/dd>/);
assert.match(cordero, /<dt>Asistencias<\/dt><dd>1<\/dd>/);
assert.doesNotMatch(cordero, /Titular/);
assert.match(cordero, /Datos no oficiales, actualizados el/);
assert.match(cordero, /Ficha en Flashscore/);
assert.match(cordero, /href="https:\/\/www\.flashscore\.es\/jugador\/cordero-antonio\/tQQcMsFa\/"/);
const portero = ficha("Jokin Ezkieta");
assert.doesNotMatch(portero, /<dt>Goles<\/dt>/);   // la ficha del portero no enseña goles
assert.match(portero, /<dt>Amarillas<\/dt>/);
assert.doesNotMatch(portero, /encajados/);

// Tabla de /plantilla: columna «Asist.» en lugar de «Tit.», sin «enc.» ni columnas vacías.
const tabla = lpHtmlPlantilla(doc, [], () => "#");
assert.match(tabla, /title="Asistencias">Asist\.<\/th>/);
assert.doesNotMatch(tabla, />Tit\.<\/th>/);
assert.doesNotMatch(tabla, /enc\./);
assert.match(tabla, /Ver plantilla en Flashscore\.es/);
assert.match(tabla, /Porteros \(4\)/);
assert.match(tabla, /Defensas \(15\)/);
assert.match(tabla, /Delanteros \(8\)/);
assert.equal((tabla.match(/<td class="col-jugador">/g) || []).length, 33);
// Casado con la redacción: el nombre enlaza a su ficha si es inequívoco
const emp = lpEmparejar(doc.jugadores, [{ jugador: "Sergio Arribas" }, { jugador: "Pepe Inexistente" }]);
assert.equal(emp.size, 1);
assert.ok(emp.has("x82H42AD"));

// En toda la web las estadísticas salen de Flashscore: un JSON de otra fuente (LaPreferente, que
// quedó en clubes de Segunda Federación) NO se enseña ni en la ficha del jugador ni en la plantilla.
const docLP = { fuente: "LaPreferente.com", fuente_url: "https://www.lapreferente.com/E3051/cadiz-cf", temporada: "2026/2027",
  actualizado: "2026-10-18", jugadores: [
    { id: "1", alias: "David Gil", nombre: "David Gil Mohedano", posicion: "Portero", edad: 32, pj: 3, pt: 3, min: 270, goles: null, encajados: 2, ta: 0, tr: 0 }] };
assert.equal(esDocFlashscore(doc), true);
assert.equal(lpEsFlashscore(doc), true);
assert.equal(esDocFlashscore(docLP), false);
assert.equal(lpEsFlashscore(docLP), false);
// Nombre de Flashscore pero URL ajena (o al revés): tampoco vale.
assert.equal(lpEsFlashscore({ ...doc, fuente_url: "https://www.lapreferente.com/E3051/cadiz-cf" }), false);
assert.equal(esDocFlashscore({ ...docLP, fuente_url: doc.fuente_url }), false);
assert.equal(lpEsFlashscore(null), false);

// lpCargarPlantilla descarta el JSON que no es de Flashscore y acepta el que sí lo es.
const servir = (d) => { ctx.fetch = async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => d }); };
servir(docLP);
assert.equal(await lpCargarPlantilla("Club LaPreferente Uno"), null);
servir(doc);
assert.equal((await lpCargarPlantilla("Club Flashscore Uno")).jugadores.length, 33);

console.log("OK: Flashscore -> casado por nombre -> ficha y tabla (sin columnas vacías) + solo se admite Flashscore");
