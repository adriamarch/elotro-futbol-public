// Exporta los clubes "oficiales" del sitio (js/clubs.js) a un JSON
// que lee el scraper: { nombre, competicion, grupo, slug }.
//
//   node herramientas/lapreferente/exportar_clubes.mjs
//
// Reutiliza clubs.js tal cual (no duplica la lista), así el slug de los
// ficheros de datos es SIEMPRE el mismo que usa el frontend (slugEquipo).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "..", "..");
const src = fs.readFileSync(path.join(raiz, "js", "clubs.js"), "utf8");

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(
  src + ";this.__R = { CLUBS_BY_CATEGORY, slugEquipo, getGrupoClub };",
  ctx
);
const { CLUBS_BY_CATEGORY, slugEquipo, getGrupoClub } = ctx.__R;

const salida = [];
for (const [competicion, clubes] of Object.entries(CLUBS_BY_CATEGORY)) {
  for (const nombre of clubes) {
    salida.push({
      nombre,
      competicion,
      grupo: getGrupoClub(nombre) || null,
      slug: slugEquipo(nombre),
    });
  }
}
const destino = path.join(aqui, "clubes_internos.json");
fs.writeFileSync(destino, JSON.stringify(salida, null, 2) + "\n");
console.log(`OK: ${salida.length} clubes -> ${path.relative(raiz, destino)}`);
