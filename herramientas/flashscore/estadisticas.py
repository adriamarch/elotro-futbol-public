#!/usr/bin/env python3
"""Agrega los JSON de plantillas de Flashscore en un fichero por competición.

    data/jugadores/{club}.json  ──>  data/estadisticas/{competicion}.json

La página /estadisticas lee estos ficheros (y solo estos): los tops de goleadores,
asistentes, tarjetas, etc. salen únicamente de Flashscore. Se ejecuta después de
`flashscore.py plantillas` (lo hace el workflow «Actualizar jugadores»).

    python3 herramientas/flashscore/estadisticas.py

Solo entran los JSON cuya fuente es Flashscore (nombre y URL), igual que en
plantilla-lp.js / jugador.js. Solo se guardan los jugadores con algún partido o
minuto, para que el fichero pese poco. Un club sin datos de Flashscore (p. ej. los
de Segunda Federación) simplemente no aparece.
"""
import argparse
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
COMPETICIONES = ("hypermotion", "primera_federacion", "segunda_federacion")
URL_FLASHSCORE = re.compile(r"^https://(www\.)?flashscore\.(com|es)/")


# Filiales que equipos.json tiene emparejados con el PRIMER equipo de Flashscore (puntuación
# 0.85: «Real Madrid Castilla» -> «Real Madrid», con Mbappé y Courtois en la plantilla).
# Sus cifras no son las del filial, así que no entran en los tops. Cuando se corrija su
# fs_slug/fs_id en equipos.json (con "manual": true), basta con quitarlos de aquí.
EXCLUIR_SLUGS = {
    "bilbao-athletic",
    "real-madrid-castilla",
    "atletico-madrileno",
    "fc-barcelona-atletic",
    "valencia-mestalla",
}


def es_flashscore(doc) -> bool:
    return (
        isinstance(doc, dict)
        and "flashscore" in str(doc.get("fuente", "")).lower()
        and bool(URL_FLASHSCORE.match(str(doc.get("fuente_url", ""))))
    )


def num(v) -> int:
    return v if isinstance(v, int) and not isinstance(v, bool) else 0


def jugador_compacto(p: dict, club: str, slug: str, grupo) -> dict | None:
    pj, minutos = num(p.get("pj")), num(p.get("min"))
    if pj <= 0 and minutos <= 0:
        return None
    url = p.get("url") if URL_FLASHSCORE.match(str(p.get("url", ""))) else None
    return {
        "id": p.get("id"),
        "n": p.get("alias") or p.get("nombre") or "",
        "d": p.get("dorsal"),
        "pos": p.get("posicion"),
        "c": club,
        "s": slug,
        "g": grupo,
        "pj": pj,
        "min": minutos,
        "gol": num(p.get("goles")),
        "as": num(p.get("asistencias")),
        "ta": num(p.get("ta")),
        "tr": num(p.get("tr")),
        "u": url,
    }


def agregar(carpeta_jugadores: Path) -> dict:
    por_comp = {c: {"clubes": [], "jugadores": [], "actualizado": "", "temporada": ""} for c in COMPETICIONES}
    for f in sorted(carpeta_jugadores.glob("*.json")):
        if f.name == "index.json" or f.stem in EXCLUIR_SLUGS:
            continue
        try:
            doc = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not es_flashscore(doc) or doc.get("competicion") not in por_comp or not doc.get("club"):
            continue
        comp = por_comp[doc["competicion"]]
        grupo = doc.get("grupo")
        comp["clubes"].append({"c": doc["club"], "s": f.stem, "g": grupo})
        for p in doc.get("jugadores") or []:
            j = jugador_compacto(p, doc["club"], f.stem, grupo)
            if j:
                comp["jugadores"].append(j)
        comp["actualizado"] = max(comp["actualizado"], str(doc.get("actualizado") or ""))
        comp["temporada"] = comp["temporada"] or str(doc.get("temporada") or "")
    return por_comp


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--origen", default=str(RAIZ / "data" / "jugadores"))
    ap.add_argument("--destino", default=str(RAIZ / "data" / "estadisticas"))
    args = ap.parse_args(argv)

    origen, destino = Path(args.origen), Path(args.destino)
    if not origen.is_dir():
        print(f"No existe {origen}", file=sys.stderr)
        return 1
    destino.mkdir(parents=True, exist_ok=True)
    for nombre, datos in agregar(origen).items():
        datos["clubes"].sort(key=lambda c: c["c"].casefold())
        salida = {
            "fuente": "Flashscore.es",
            "competicion": nombre,
            "temporada": datos["temporada"],
            "actualizado": datos["actualizado"],
            "clubes": datos["clubes"],
            "jugadores": datos["jugadores"],
        }
        (destino / f"{nombre}.json").write_text(
            json.dumps(salida, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
        )
        print(f"{nombre}: {len(datos['clubes'])} clubes, {len(datos['jugadores'])} jugadores")
    return 0


if __name__ == "__main__":
    sys.exit(main())
