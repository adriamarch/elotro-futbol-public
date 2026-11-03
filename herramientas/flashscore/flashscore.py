#!/usr/bin/env python3
"""Plantillas y estadísticas de jugadores desde Flashscore.es.

Genera data/jugadores/{club}.json con el MISMO formato que usaba el
scraper de LaPreferente, de modo que la web (plantilla, ficha del jugador)
no necesita nada más. Reutiliza de ../lapreferente/lapreferente.py la
descarga con caché y robots.txt, el emparejado de clubes y las protecciones
de escritura.

Qué da Flashscore por jugador (pestaña «Plantilla» del equipo): dorsal,
nombre, edad, partidos, minutos, goles, asistencias, amarillas y rojas.
NO da convocatorias, titularidades ni goles encajados de los porteros: esos
campos salen a null y la web enseña asistencias en su lugar.

Comandos:
  descubrir-todo   lee competiciones.json y empareja los clubes -> equipos.json
  descubrir        lo mismo para una sola competición/grupo
  plantillas       descarga cada plantilla y escribe los JSON
  diagnosticar     explica por qué una página guardada da 0 jugadores
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import urljoin

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
sys.path.insert(0, str(AQUI.parent / "lapreferente"))
import lapreferente as lp  # noqa: E402  (descarga, emparejado, protecciones)

BASE = "https://www.flashscore.es/"
FUENTE = "Flashscore.es"

RE_JUGADOR = re.compile(r"/(?:jugador|player)/([^/?#]+)/([A-Za-z0-9]{8})(?:/|$|[?#])")
RE_EQUIPO = re.compile(r"/(?:equipo|team)/([a-z0-9-]+)/([A-Za-z0-9]{8})(?:/|$|[?#])")
# /partido/futbol/cadiz-cf-hdWjLJUJ/ceuta-xpWAk3h6/  (los dos equipos, por orden alfabético del slug)
RE_PARTIDO = re.compile(
    r"/(?:partido|match)/futbol/([a-z0-9-]+)-([A-Za-z0-9]{8})/([a-z0-9-]+)-([A-Za-z0-9]{8})(?:/|$|[?#])")
RE_TEMPORADA = re.compile(r"(?<!\d)(20\d\d)\s*[-/]\s*(20\d\d)(?!\d)")

# Cabeceras de sección de la plantilla -> posición (None = se ignora: cuerpo técnico).
SECCIONES = {
    "porteros": "Portero", "portero": "Portero", "goalkeepers": "Portero",
    "defensas": "Defensa", "defensa": "Defensa", "defenders": "Defensa",
    "centrocampistas": "Centrocampista", "mediocampistas": "Centrocampista", "midfielders": "Centrocampista",
    "delanteros": "Delantero", "atacantes": "Delantero", "forwards": "Delantero", "attackers": "Delantero",
    "entrenador": None, "entrenadores": None, "coach": None, "coaches": None, "manager": None,
}
# Orden de las cifras tras la edad en cada fila de jugador.
CAMPOS_CIFRAS = ("pj", "min", "goles", "asistencias", "ta", "tr")


# ------------------------------------------------------------------ utilidades

def _soup(contenido):
    from bs4 import BeautifulSoup  # import perezoso: los tests de descubrimiento no lo necesitan
    if isinstance(contenido, bytes):
        try:
            contenido = contenido.decode("utf-8")
        except UnicodeDecodeError:
            contenido = contenido.decode("latin-1")
    return BeautifulSoup(contenido, "html.parser")


def _sin_acentos(t: str) -> str:
    t = unicodedata.normalize("NFKD", t or "")
    return "".join(c for c in t if not unicodedata.combining(c)).lower().strip()


def _titulo_seccion(texto: str):
    """'Porteros' -> ('Portero', True); 'Entrenador' -> (None, True); otro texto -> (None, False)."""
    t = _sin_acentos(texto)
    t = re.sub(r"\s*\(\d+\)\s*$", "", t)
    if t in SECCIONES:
        return SECCIONES[t], True
    return None, False


def _id_jugador(href: str):
    m = RE_JUGADOR.search(href or "")
    return m.group(2) if m else None


def _enlaces_jugador(nodo):
    return [a for a in nodo.find_all("a", href=True) if _id_jugador(a["href"])]


# ---------------------------------------------------------------------- parser

def _fila_de(a, pid):
    """Contenedor más alto que solo contiene a ESTE jugador (la fila), sea <tr> o <div>.
    No depende de nombres de clase, que Flashscore cambia con frecuencia."""
    fila = a
    while fila.parent is not None and fila.parent.name not in ("[document]", "html", "body"):
        padre = fila.parent
        if {_id_jugador(x["href"]) for x in _enlaces_jugador(padre)} - {pid}:
            break
        # Si subir metiera una cabecera de sección en la fila, nos quedamos aquí.
        if any(_titulo_seccion(s)[1] for s in padre.stripped_strings):
            break
        fila = padre
    return fila


def _entero(t: str):
    return int(t) if re.fullmatch(r"\d+", t) else None


def parse_fila(tokens: list[str], nombre: str):
    """Tokens de texto de una fila -> dict con dorsal, edad, estado y cifras."""
    if nombre in tokens:
        i = tokens.index(nombre)
    else:
        cand = [k for k, t in enumerate(tokens) if nombre and nombre in t]
        if not cand:
            return None
        i = cand[0]
    antes, despues = tokens[:i], tokens[i + 1:]
    dorsal = _entero(antes[-1]) if antes else None
    # Marcas junto al nombre («Lesión», «Sancionado»…) antes de la edad.
    estado = []
    while despues and not re.fullmatch(r"\d+|\?|-|–|—", despues[0]):
        estado.append(despues.pop(0))
    edad = None
    if despues:
        edad = _entero(despues[0])
        despues = despues[1:]
    cifras, resto = [], despues
    for t in resto:
        if re.fullmatch(r"\d+", t):
            cifras.append(int(t))
        elif t in ("-", "–", "—"):
            cifras.append(None)
        else:
            break
    completa = len(cifras) >= len(CAMPOS_CIFRAS)
    datos = dict(zip(CAMPOS_CIFRAS, cifras[:len(CAMPOS_CIFRAS)])) if completa else {}
    return {
        "dorsal": dorsal, "edad": edad, "estado": " ".join(estado) or None,
        "incompleta": bool(cifras) and not completa,
        **{k: datos.get(k) for k in CAMPOS_CIFRAS},
    }


def parse_plantilla(contenido, url: str = ""):
    """HTML de la pestaña «Plantilla» -> {jugadores, temporada, ...}.

    La página repite la plantilla (pestaña «Total» y pestaña de la liga): se
    conserva la primera aparición de cada jugador, que es «Total». El cuerpo
    técnico («Entrenador») se descarta.
    """
    soup = _soup(contenido)
    filas = {}
    for a in _enlaces_jugador(soup):
        pid = _id_jugador(a["href"])
        fila = _fila_de(a, pid)
        previo = filas.get(id(fila))
        # Si la fila tiene dos enlaces al jugador (foto y nombre), vale el que lleva texto.
        if previo is None or (not previo[1].get_text(strip=True) and a.get_text(strip=True)):
            filas[id(fila)] = (fila, a, pid)
    dentro = {id(d) for fila, _, _ in filas.values() for d in fila.descendants}

    jugadores, vistos, duplicados, incompletas = [], set(), 0, 0
    seccion, ignorar = None, True
    for nodo in soup.descendants:
        if id(nodo) in dentro:
            continue
        if isinstance(nodo, str):
            pos, es = _titulo_seccion(nodo)
            if es:
                seccion, ignorar = pos, pos is None
            continue
        if id(nodo) not in filas:
            continue
        fila, a, pid = filas[id(nodo)]
        if ignorar or seccion is None:
            continue
        if pid in vistos:
            duplicados += 1
            continue
        nombre = a.get_text(" ", strip=True)
        r = parse_fila([t.strip() for t in fila.stripped_strings if t.strip()], nombre)
        if r is None:
            continue
        vistos.add(pid)
        incompletas += 1 if r["incompleta"] else 0
        href = a["href"].strip()
        jugadores.append({
            "id": pid,
            "url": urljoin(url or BASE, href),
            "alias": nombre, "nombre": nombre,
            "demarcacion": None, "posicion": seccion,
            "dorsal": r["dorsal"], "edad": r["edad"],
            "pc": None, "pj": r["pj"], "pt": None, "min": r["min"],
            "goles": r["goles"], "asistencias": r["asistencias"], "encajados": None,
            "ta": r["ta"], "tr": r["tr"],
        })

    temporada = None
    for m in RE_TEMPORADA.finditer(soup.get_text(" ")):
        if int(m.group(2)) == int(m.group(1)) + 1:
            temporada = f"{m.group(1)}/{m.group(2)}"
            break
    return {"jugadores": jugadores, "temporada": temporada,
            "duplicados": duplicados, "filas_incompletas": incompletas}


def avisos_jugador(j: dict) -> list[str]:
    av = lp.avisos_jugador(j)
    pj, m = j.get("pj"), j.get("min")
    if pj and m is not None and m < pj:
        av.append("menos minutos que partidos (¿columnas cambiadas?)")
    if j.get("asistencias") is not None and pj is not None and j["asistencias"] > max(pj, 1) * 3:
        av.append("asistencias desproporcionadas")
    return av


# ---------------------------------------------------------------- descubrimiento

def descubrir_equipos(contenido):
    """Equipos de una página de competición: [{id, slug, slugs, nombre}].

    La clasificación de Flashscore se carga con JavaScript y no viene en el
    HTML, pero sí los enlaces de los partidos (con el id de los DOS equipos) y
    los de equipo. Se usan ambos; a un club que no salga en ningún enlace hay
    que añadirlo a mano (el informe lo dice).
    """
    soup = _soup(contenido)
    equipos, orden = {}, []

    def alta(eid, slug, nombre=None):
        if eid not in equipos:
            equipos[eid] = {"id": eid, "slug": slug, "slugs": [slug], "nombre": None}
            orden.append(eid)
        if nombre and not equipos[eid]["nombre"]:
            equipos[eid]["nombre"] = nombre
            equipos[eid]["slugs"].append(nombre)

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        m = RE_PARTIDO.search(href)
        if m:
            (s1, i1, s2, i2) = m.groups()
            texto = re.sub(r"\s+", " ", a.get_text(" ", strip=True))
            partes = [p.strip() for p in re.split(r"\s+[-–]\s+", texto) if p.strip()]
            n1 = n2 = None
            if len(partes) == 2:
                # El orden del enlace es alfabético, no local-visitante: se asigna cada
                # nombre al slug que más se le parece.
                directo = lp.puntuar(s1, partes[0]) + lp.puntuar(s2, partes[1])
                cruzado = lp.puntuar(s1, partes[1]) + lp.puntuar(s2, partes[0])
                n1, n2 = (partes[0], partes[1]) if directo >= cruzado else (partes[1], partes[0])
            alta(i1, s1, n1)
            alta(i2, s2, n2)
            continue
        m = RE_EQUIPO.search(href)
        if m:
            nombre = re.sub(r"\s+", " ", a.get_text(" ", strip=True)) or None
            alta(m.group(2), m.group(1), nombre if nombre and len(nombre) < 40 else None)
    return [equipos[i] for i in orden]


def url_competicion(base: str, sufijo: str = "") -> str:
    return base.rstrip("/") + "/" + sufijo


def url_plantilla(e: dict) -> str:
    return urljoin(BASE, f"equipo/{e['fs_slug']}/{e['fs_id']}/plantilla/")


class Descargador(lp.Descargador):
    """Igual que el de LaPreferente, pero respetando el robots.txt de Flashscore."""

    def _permitido(self, url):
        if self._robots is None:
            import urllib.robotparser
            rp = urllib.robotparser.RobotFileParser()
            try:
                r = self.s.get(urljoin(BASE, "/robots.txt"), timeout=20)
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            except Exception:
                rp.parse([])
            self._robots = rp
        return self._robots.can_fetch(self.s.headers["User-Agent"], url)


def descubrir_una(args, d, competicion, grupo, url):
    internos = lp.cargar_json(args.clubes, None)
    if not internos:
        sys.exit(f"Falta {args.clubes}. Ejecuta: node herramientas/lapreferente/exportar_clubes.mjs")
    candidatos = [c for c in internos if c["competicion"] == competicion
                  and (grupo is None or c["grupo"] == grupo)]
    if not candidatos:
        sys.exit(f"No hay clubes internos para {competicion} / {grupo} (revisa competición y grupo).")

    encontrados = {}
    for sufijo in ("", "resultados/", "partidos/"):
        pagina = url_competicion(url, sufijo)
        try:
            for e in descubrir_equipos(d.get(pagina)):
                encontrados.setdefault(e["id"], e)
        except Exception as exc:
            print(f"   ! {pagina}: {exc}", file=sys.stderr)
    equipos = list(encontrados.values())
    print(f"[{competicion} {grupo or ''}] {len(equipos)} equipos en los enlaces; "
          f"{len(candidatos)} clubes internos candidatos")

    previo = {e["fs_id"]: e for e in lp.cargar_json(args.equipos, [])}
    sin_pareja = []
    for e, club, score in lp.emparejar(equipos, candidatos):
        if club is None:
            if score >= 0.5:
                sin_pareja.append((e["slug"], e.get("nombre"), round(score, 2)))
            continue
        ya = previo.get(e["id"], {})
        previo[e["id"]] = {
            "fs_id": e["id"], "fs_slug": e["slug"], "fs_nombre": e.get("nombre"),
            "club": ya.get("club") if ya.get("manual") else club["nombre"],
            "slug": ya.get("slug") if ya.get("manual") else club["slug"],
            "competicion": club["competicion"], "grupo": club["grupo"],
            "puntuacion": round(score, 2), "manual": bool(ya.get("manual")),
        }
        # Marca a mano/por revisión: Flashscore no publica la plantilla de este club.
        # Se conserva al volver a descubrir (si no, cada lunes volverían los "problemas").
        if ya.get("sin_plantilla"):
            previo[e["id"]]["sin_plantilla"] = True
    lp.escribir_atomico(Path(args.equipos), json.dumps(list(previo.values()), ensure_ascii=False, indent=2) + "\n")
    emparejados = {(previo[k]["competicion"], previo[k]["grupo"], previo[k]["club"]) for k in previo}
    faltan = [c["nombre"] for c in candidatos if (c["competicion"], c["grupo"], c["nombre"]) not in emparejados]
    if faltan:
        print("   Clubes del sitio SIN pareja (añádelos a mano en equipos.json con \"manual\": true;\n"
              "   fs_slug y fs_id salen de la URL del equipo: /equipo/<fs_slug>/<fs_id>/):")
        for n in faltan:
            print("     -", n)
    if sin_pareja:
        print("   Equipos de Flashscore parecidos pero ambiguos:", sin_pareja[:15])
    return len(faltan)


def cmd_descubrir(args, d):
    descubrir_una(args, d, args.competicion, args.grupo, args.url)
    print(f"Equipos emparejados en total: {len(lp.cargar_json(args.equipos, []))} -> {args.equipos}")
    return 0


def cmd_descubrir_todo(args, d):
    config = lp.cargar_json(args.competiciones, None)
    if not config:
        sys.exit(f"Falta {args.competiciones}.")
    sin_pareja = 0
    for c in config:
        sin_pareja += descubrir_una(args, d, c["competicion"], c.get("grupo"), c["url"])
    total = len(lp.cargar_json(args.equipos, []))
    print(f"\n{len(config)} competiciones procesadas; {total} equipos emparejados; "
          f"{sin_pareja} clubes del sitio sin pareja -> {args.equipos}")
    return 0


# ------------------------------------------------------------------- plantillas

def cmd_plantillas(args, d):
    equipos = lp.cargar_json(args.equipos, [])
    if not equipos:
        sys.exit(f"{args.equipos} vacío: ejecuta antes 'descubrir' o 'descubrir-todo'.")
    salida = Path(args.salida)
    salida.mkdir(parents=True, exist_ok=True)
    ahora = dt.date.today().isoformat()
    problemas, cambios, sin_cambios, con_avisos = [], [], 0, []
    sin_plantilla = []   # clubes marcados "sin_plantilla" que, como se esperaba, siguen sin plantilla
    sin_estadisticas = []  # plantillas con todo a cero: no se publican
    saltados = 0         # clubes marcados "sin_plantilla" que ni se descargan en esta ejecución
    ruta_indice = salida / "index.json"
    indice = {c["slug"]: c for c in lp.cargar_json(ruta_indice, {}).get("clubes", [])}

    def falla(club, motivo):
        problemas.append((club, motivo))
        print(f"  x {club}: {motivo}", file=sys.stderr)

    for e in equipos:
        if args.solo and e["slug"] not in args.solo:
            continue
        # Los clubes marcados "sin_plantilla" no se descargan (ahorra la mitad de las peticiones a
        # Flashscore) salvo que se pida revisarlos o se nombren con --solo.
        if e.get("sin_plantilla") and not getattr(args, "revisar_sin_plantilla", False) \
                and not (args.solo and e["slug"] in args.solo):
            saltados += 1
            continue
        url = url_plantilla(e)
        try:
            r = parse_plantilla(d.get(url), url)
        except Exception as exc:  # una caída no debe tumbar el resto
            falla(e["club"], f"descarga: {exc}")
            continue
        n = len(r["jugadores"])
        if n == 0 and e.get("sin_plantilla"):
            # Flashscore no tiene la plantilla de este club (p. ej. Segunda Federación): no es un
            # fallo y NO se toca lo que hubiera guardado (LaPreferente u otra fuente).
            sin_plantilla.append(e["club"])
            print(f"  · {e['club']}: sin plantilla en Flashscore (esperado; se conserva lo guardado)")
            continue
        if n == 0:
            falla(e["club"], "0 jugadores: ¿cambió el HTML o la plantilla se carga con JavaScript? (no se sobrescribe)")
            continue
        if e.get("sin_plantilla"):
            print(f"  ! {e['club']}: marcado \"sin_plantilla\" pero Flashscore YA trae {n} jugadores: "
                  "quita esa marca de equipos.json", file=sys.stderr)
        if n < args.minimo_jugadores and not args.forzar:
            falla(e["club"], f"solo {n} jugadores (mínimo {args.minimo_jugadores}); no se sobrescribe (--forzar lo salta)")
            continue
        sin_cifras = sum(1 for j in r["jugadores"] if j["pj"] is None)
        if sin_cifras > n * 0.5 and not args.forzar:
            falla(e["club"], f"{sin_cifras} de {n} jugadores sin cifras: ¿cambiaron las columnas? (no se sobrescribe)")
            continue
        # Plantilla "de plantilla": Flashscore lista a los jugadores pero todo a cero (ni un partido ni un
        # minuto en todo el equipo). Con la temporada en marcha es imposible: son clubes sin estadísticas
        # en Flashscore. No se publica (pisaría datos buenos o enseñaría 0 partidos a todos).
        if sum((j["pj"] or 0) for j in r["jugadores"]) == 0 and sum((j["min"] or 0) for j in r["jugadores"]) == 0 \
                and not args.forzar:
            sin_estadisticas.append(e["club"])
            print(f"  · {e['club']}: plantilla sin estadísticas en Flashscore (todo a cero); se conserva lo guardado")
            continue
        if r["filas_incompletas"]:
            print(f"  ! {e['club']}: {r['filas_incompletas']} filas con menos de 6 cifras (se dejan sin datos)", file=sys.stderr)
        temporada = r["temporada"]
        if args.temporada:
            if temporada is None:
                print(f"  ! {e['club']}: temporada no detectada en la página; se asume {args.temporada} "
                      "(la plantilla de Flashscore es siempre la de la temporada en curso)", file=sys.stderr)
                temporada = args.temporada
            elif temporada != args.temporada and not args.aceptar_otra_temporada:
                falla(e["club"], f"temporada {temporada} != {args.temporada}")
                continue
        malos = [(j["alias"], avisos_jugador(j)) for j in r["jugadores"] if avisos_jugador(j)]
        if len(malos) > n * 0.25 and not args.forzar:
            falla(e["club"], f"{len(malos)} de {n} filas con datos incoherentes (p. ej. {malos[0][0]}: "
                             f"{', '.join(malos[0][1])}); no se sobrescribe (--forzar lo salta)")
            continue
        doc = {
            "club": e["club"], "competicion": e["competicion"], "grupo": e["grupo"],
            "fuente": FUENTE, "fuente_url": url,
            "temporada": temporada, "actualizado": ahora,
            "jugadores": r["jugadores"],
        }
        destino = salida / f"{e['slug']}.json"
        anterior = lp.cargar_json(destino, None) if destino.exists() else None
        if not args.forzar:
            motivo = lp.regresion(doc, anterior)
            if motivo:
                falla(e["club"], f"plantilla sospechosamente más corta ({motivo}); no se sobrescribe (--forzar)")
                continue
        if malos:
            con_avisos.append((e["club"], malos))
        if lp.datos_equivalentes(anterior, doc):
            sin_cambios += 1
            print(f"  = {e['club']}: sin cambios ({n} jugadores)")
        else:
            lp.escribir_atomico(destino, json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
            cambios.append(e["club"])
            print(f"  ok {e['club']}: {n} jugadores ({temporada})")
        indice[e["slug"]] = {"club": e["club"], "slug": e["slug"], "competicion": e["competicion"],
                             "grupo": e["grupo"], "temporada": temporada, "jugadores": n}
    if cambios or not ruta_indice.exists():
        lp.escribir_atomico(ruta_indice, json.dumps(
            {"actualizado": ahora, "fuente": FUENTE,
             "clubes": sorted(indice.values(), key=lambda c: c["slug"])},
            ensure_ascii=False, indent=1) + "\n")

    print(f"\n{len(cambios)} clubes actualizados, {sin_cambios} sin cambios, {len(problemas)} con problemas"
          + (f", {len(sin_plantilla)} sin plantilla en Flashscore (esperado)" if sin_plantilla else "")
          + (f", {len(sin_estadisticas)} con plantilla pero sin estadísticas (no publicados: {', '.join(sin_estadisticas)})" if sin_estadisticas else "")
          + (f", {saltados} marcados sin_plantilla no descargados (--revisar-sin-plantilla los mira)" if saltados else ""))
    for club, malos in con_avisos:
        print(f"   ? {club}: {len(malos)} filas con datos raros, p. ej. {malos[0][0]} ({', '.join(malos[0][1])})")
    for club, motivo in problemas:
        print("   -", club, "->", motivo)
    if len(problemas) > args.max_problemas:
        print(f"\nFALLO: {len(problemas)} problemas (máximo tolerado: {args.max_problemas})", file=sys.stderr)
        return 1
    return 0


def diagnosticar_html(contenido) -> dict:
    soup = _soup(contenido)
    enlaces = _enlaces_jugador(soup)
    r = parse_plantilla(contenido)
    textos = [s for s in soup.stripped_strings]
    return {
        "enlaces_jugador_en_html": len(enlaces),
        "jugadores_parseados": len(r["jugadores"]),
        "duplicados_descartados": r["duplicados"],
        "filas_incompletas": r["filas_incompletas"],
        "temporada": r["temporada"],
        "cabeceras_de_seccion": sum(1 for s in textos if _titulo_seccion(s)[1]),
        "parece_bloqueo": bool(re.search(r"captcha|access denied|are you a robot|consent", " ".join(textos[:200]), re.I)),
    }


def cmd_diagnosticar(args, d):
    if args.archivo:
        contenido = Path(args.archivo).read_bytes()
    elif args.url:
        contenido = d.get(args.url)
    else:
        sys.exit("Indica --archivo (una página guardada, p. ej. cache/*.html) o --url.")
    info = diagnosticar_html(contenido)
    for k, v in info.items():
        print(f"{k:28} {v}")
    if info["jugadores_parseados"] == 0:
        print("\nDiagnóstico: 0 jugadores.")
        if info["enlaces_jugador_en_html"] == 0:
            print(" - No hay enlaces /jugador/…: la página no es una plantilla, la web carga la tabla con JavaScript\n"
                  "   o te ha servido un bloqueo/aviso de cookies. Abre el fichero en un navegador.")
        elif info["cabeceras_de_seccion"] == 0:
            print(" - Hay enlaces a jugadores pero no se reconocen «Porteros/Defensas/…»: cambió el texto de las cabeceras.")
        else:
            print(" - Hay enlaces y cabeceras pero ninguna fila se pudo leer: cambió el orden de nombre/edad/cifras.")
        print(" Manda ese fichero HTML para ajustar parse_plantilla().")
        return 1
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--user-agent", default=os.environ.get(
        "FS_USER_AGENT", "ElOtroFutbolTV-datos/1.0 (uso editorial; contacto en la web del sitio)"))
    p.add_argument("--espera", type=float, default=5.0, help="segundos entre peticiones (def. 5)")
    p.add_argument("--cache", default=str(AQUI / "cache"))
    p.add_argument("--cache-horas", type=float, default=20)
    p.add_argument("--sin-red", action="store_true", help="usa solo la caché (para depurar el parser)")
    p.add_argument("--clubes", default=str(AQUI.parent / "lapreferente" / "clubes_internos.json"))
    p.add_argument("--equipos", default=str(AQUI / "equipos.json"))
    p.add_argument("--competiciones", default=str(AQUI / "competiciones.json"))
    sub = p.add_subparsers(dest="cmd", required=True)

    sd = sub.add_parser("descubrir", help="empareja los clubes de una competición con Flashscore")
    sd.add_argument("--url", required=True, help="URL de la competición, p. ej. https://www.flashscore.es/futbol/espana/laliga-hypermotion/")
    sd.add_argument("--competicion", required=True, choices=["hypermotion", "primera_federacion", "segunda_federacion"])
    sd.add_argument("--grupo", default=None, help='p. ej. "Grupo 2" (omitir en Hypermotion)')
    sd.set_defaults(fn=cmd_descubrir)

    st = sub.add_parser("descubrir-todo", help="descubre todas las competiciones de competiciones.json")
    st.set_defaults(fn=cmd_descubrir_todo)

    sp = sub.add_parser("plantillas", help="descarga las plantillas y escribe los JSON")
    sp.add_argument("--salida", default=str(RAIZ / "data" / "jugadores"))
    sp.add_argument("--solo", nargs="*", help="solo estos slugs de club")
    sp.add_argument("--temporada", default=None, help="p. ej. 2026/2027: descarta clubes que muestren otra")
    sp.add_argument("--aceptar-otra-temporada", action="store_true")
    sp.add_argument("--minimo-jugadores", type=int, default=11,
                    help="no se escribe un club con menos jugadores que esto (def. 11)")
    sp.add_argument("--forzar", action="store_true", help="salta las protecciones de calidad y de tamaño")
    sp.add_argument("--max-problemas", type=int, default=0,
                    help="código de salida 1 si hay más clubes con problemas que esto (def. 0)")
    sp.add_argument("--revisar-sin-plantilla", action="store_true",
                    help="descarga también los clubes marcados sin_plantilla en equipos.json, para ver si "
                         "Flashscore ya publica su plantilla (por defecto se saltan)")
    sp.set_defaults(fn=cmd_plantillas)

    sg = sub.add_parser("diagnosticar", help="explica por qué una página da 0 jugadores")
    sg.add_argument("--archivo", help="HTML guardado (p. ej. cache/xxxx.html)")
    sg.add_argument("--url")
    sg.set_defaults(fn=cmd_diagnosticar)

    args = p.parse_args(argv)
    d = Descargador(args.user_agent, args.espera, args.cache, args.cache_horas, args.sin_red) \
        if args.cmd != "diagnosticar" or args.url else None
    return args.fn(args, d) or 0


if __name__ == "__main__":
    sys.exit(main())
