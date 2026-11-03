#!/usr/bin/env python3
"""Plantillas y estadísticas de temporada desde LaPreferente.com.

Genera un JSON estático por club en data/jugadores/{slug}.json, que
lee la ficha de jugador (js/jugador.js) para mostrar un bloque
aparte de "estadísticas externas". No toca workers ni bases de datos.

Dos pasos (ver README.md):

  1) descubrir  -> localiza los clubes de una competición/grupo en
                   LaPreferente y los empareja con los nombres del sitio
                   (clubs.js). Se guarda en equipos.json para revisarlo.
  2) plantillas -> descarga la plantilla de cada club emparejado, extrae
                   los jugadores y escribe los JSON.

Es deliberadamente lento y educado: respeta robots.txt, espera entre
peticiones, cachea en disco y se identifica con un User-Agent propio.
"""
from __future__ import annotations

import argparse
import datetime as dt
import difflib
import hashlib
import json
import os
import random
import re
import sys
import time
import unicodedata
import urllib.robotparser
from pathlib import Path
from urllib.parse import unquote, urljoin

BASE = "https://www.lapreferente.com/"
AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent

GRUPOS_DEMARCACION = {
    "porteros": "Portero",
    "defensas": "Defensa",
    "centrocampistas": "Centrocampista",
    "delanteros": "Delantero",
    "sin determinar": None,   # jugadores sin demarcación: se leen, pero sin posición
}
RE_SECCION = re.compile(r"^(Porteros|Defensas|Centrocampistas|Delanteros|Sin\s+Determinar)\s*\(\d+\)", re.I)
RE_EDAD = re.compile(r"\s*(\d{1,3})(?:\s*(Sub-?\s*\d+))?\s*", re.I)

# Patrón del enlace de un jugador: /J109749C23556/burgos-cf/cantero.html
# La web usa enlaces RELATIVOS a <base href="https://www.lapreferente.com/">,
# es decir, sin barra inicial: "J109749C23556/burgos-cf/cantero.html".
RE_JUGADOR = re.compile(r"(?<![A-Za-z0-9])J(\d+)(?:C\d+(?:-\d+)?)?/([^/?#]+)/([^/?#]+)\.html", re.I)
# Patrón del enlace de un equipo: /E6869C23556-1/burgos-cf-sad  o  /E6869/burgos-cf
# Se aplica SOLO al valor de un href, anclado al principio (con o sin dominio/barra).
RE_EQUIPO = re.compile(
    r"^(?:https?://(?:www\.)?lapreferente\.com)?/?E(\d+)(?:C\d+(?:-\d+)?)?/([^/?#\"'\s)]+)", re.I)
RE_HREF = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.I)

STOPWORDS_CLUB = {
    "cf", "cd", "ud", "sd", "fc", "ad", "rcd", "sad", "club", "de", "del", "la",
    "el", "y", "futbol", "senior",
}


# ---------------------------------------------------------------- utilidades

def normalizar(texto: str) -> str:
    """Minúsculas, sin acentos (conserva la ñ como n) ni signos."""
    t = unicodedata.normalize("NFKD", texto or "")
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def slug_equipo(nombre: str) -> str:
    """Igual que slugEquipo() de js/clubs.js."""
    t = unicodedata.normalize("NFKD", nombre or "")
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", t))


def num(texto: str):
    t = (texto or "").strip()
    if t in ("", "-", "—", "–"):
        return None
    t = re.sub(r"(?<=\d)[.,](?=\d{3}(?!\d))", "", t)  # 2.283 -> 2283
    return int(t) if re.fullmatch(r"\d+", t) else None


def celda_goles(texto: str):
    """'13' -> (13, None); '(32)' -> (None, 32): en porteros LaPreferente
    pone los goles ENCAJADOS entre paréntesis en la columna Goles."""
    m = re.fullmatch(r"\s*(\d+)?\s*(?:\(\s*(\d+)\s*\))?\s*", texto or "")
    if not m or (m.group(1) is None and m.group(2) is None):
        return None, None
    return (int(m.group(1)) if m.group(1) else None,
            int(m.group(2)) if m.group(2) else None)


def es_celda_numerica(texto: str) -> bool:
    t = (texto or "").strip()
    # La edad de los menores de 23 viene como "20 Sub-23": también es una celda numérica.
    return bool(re.fullmatch(r"-|—|\d[\d.,]*|\(\s*\d+\s*\)|\d+\s*\(\s*\d+\s*\)|\d{1,3}\s*Sub-?\s*\d+", t, re.I)) or t == ""


def parse_edad(texto: str):
    """'24' -> (24, False); '20 Sub-23' -> (20, True); '-' -> (None, False)."""
    m = RE_EDAD.fullmatch(texto or "")
    if not m:
        return None, False
    return int(m.group(1)), bool(m.group(2))


# ------------------------------------------------------------------ descarga

class Descargador:
    def __init__(self, user_agent, espera=4.0, cache_dir=None, cache_horas=20, sin_red=False):
        import requests  # import perezoso: los tests del parser no lo necesitan
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": user_agent, "Accept-Language": "es-ES,es;q=0.9"})
        self.espera = espera
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self.cache_horas = cache_horas
        self.sin_red = sin_red
        self._ultimo = 0.0
        self._robots = None
        if self.cache_dir:
            self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _permitido(self, url):
        if self._robots is None:
            rp = urllib.robotparser.RobotFileParser()
            try:
                r = self.s.get(urljoin(BASE, "/robots.txt"), timeout=20)
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
            except Exception:
                rp.parse([])
            self._robots = rp
        return self._robots.can_fetch(self.s.headers["User-Agent"], url)

    def get(self, url: str) -> bytes:
        archivo = None
        if self.cache_dir:
            archivo = self.cache_dir / (hashlib.sha1(url.encode()).hexdigest() + ".html")
            if archivo.exists():
                edad_h = (time.time() - archivo.stat().st_mtime) / 3600
                if self.sin_red or edad_h < self.cache_horas:
                    return archivo.read_bytes()
        if self.sin_red:
            raise RuntimeError(f"Sin red y sin caché para {url}")
        if not self._permitido(url):
            raise PermissionError(f"robots.txt no permite descargar {url}")
        for intento in range(1, 4):
            falta = self.espera + random.uniform(0, 1.5) - (time.time() - self._ultimo)
            if falta > 0:
                time.sleep(falta)
            self._ultimo = time.time()
            try:
                r = self.s.get(url, timeout=30)
            except Exception as exc:  # timeout, DNS, conexión cortada...
                pausa = 10 * intento
                print(f"  ! error de red en {url}: {exc}; reintento en {pausa}s", file=sys.stderr)
                if intento == 3:
                    raise
                time.sleep(pausa)
                continue
            if r.status_code in (429, 503):
                pausa = int(r.headers.get("Retry-After", 0) or 0) or 30 * intento
                print(f"  ! {r.status_code} en {url}; espero {pausa}s", file=sys.stderr)
                time.sleep(pausa)
                continue
            r.raise_for_status()
            if archivo:
                archivo.write_bytes(r.content)
            return r.content
        raise RuntimeError(f"Demasiados reintentos en {url}")


# -------------------------------------------------------------------- parser

def separar_nombre(texto: str, slug: str):
    """El texto del enlace es 'alias + nombre completo' pegados, p. ej.
    'Cantero Ander Cantero Armendariz'. El alias es el prefijo que coincide
    con el slug de la URL ('cantero', 'alex-lizancos', 'fer-niño')."""
    palabras = texto.split()
    objetivo = [t for t in normalizar(re.sub(r"-\d+$", "", unquote(slug))).split() if t]
    if objetivo:
        for k in range(1, len(palabras) + 1):
            if normalizar(" ".join(palabras[:k])).split() == objetivo:
                alias = " ".join(palabras[:k])
                resto = " ".join(palabras[k:]).strip()
                return alias, (resto or alias)
    return None, texto.strip()


def parse_plantilla(contenido: bytes | str, url: str = ""):
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(contenido, "html.parser")
    titulo = soup.title.get_text(" ", strip=True) if soup.title else ""
    m = re.search(r"Temporada\s+(\d{4})\s*/\s*(\d{4})", titulo)
    temporada = f"{m.group(1)}/{m.group(2)}" if m else None
    nombre_lp = titulo.split("::")[0].strip() if "::" in titulo else None

    # Cada cabecera de sección declara cuántos jugadores trae: "Porteros (3)". La suma
    # (con "Sin determinar") es lo que debe leerse. OJO: "Total de Jugadores: N" de
    # la web NO sirve para esto, porque no cuenta a los "Sin determinar".
    total_declarado = 0

    jugadores, vistos = [], set()
    grupo_actual = None
    for tr in soup.find_all("tr"):
        # Las cabeceras de sección de la web real son <th> ("Jugador | Porteros (3) |
        # Edad | PC ..."); en versiones anteriores eran <td>. Se miran las dos.
        celdas = tr.find_all(["th", "td"], recursive=False)
        textos_cab = [c.get_text(" ", strip=True) for c in celdas]

        # A partir de "Ex-Jugadores del Club" (gente que ya se fue a otro equipo,
        # con las mismas columnas numéricas) no hay más plantilla actual.
        if any(re.match(r"^Ex-?\s*Jugadores", t, re.I) for t in textos_cab):
            break

        # Cabecera de sección: "Jugador | Porteros (4) | ... | Edad | PC | ..."
        for t in textos_cab:
            mg = RE_SECCION.match(t)
            if mg:
                grupo_actual = GRUPOS_DEMARCACION[re.sub(r"\s+", " ", mg.group(1).lower())]
                total_declarado += int(re.search(r"\((\d+)\)", t).group(1))
                break

        tds = tr.find_all("td", recursive=False)
        if len(tds) < 10:
            continue
        textos = [td.get_text(" ", strip=True) for td in tds]

        # Fila de jugador: enlace /J…html en una celda y 8 columnas numéricas al final.
        idx, ancla = None, None
        for i, td in enumerate(tds):
            a = td.find("a", href=RE_JUGADOR)
            if a:
                idx, ancla = i, a
                break
        if ancla is None:
            continue
        cola = textos[-8:]
        if not all(es_celda_numerica(c) for c in cola):
            continue  # cuerpo técnico u otra tabla
        edad_txt, pc, pj, pt, minutos, goles_txt, ta, tr_ = cola
        edad, sub23 = parse_edad(edad_txt)
        mj = RE_JUGADOR.search(ancla["href"])
        fuente_id, club_slug, jug_slug = mj.group(1), mj.group(2), mj.group(3)
        if fuente_id in vistos:
            continue
        vistos.add(fuente_id)

        alias, completo = separar_nombre(ancla.get_text(" ", strip=True), jug_slug)
        if alias is None:  # el slug no cuadró: usa las cadenas del DOM si hay 2+
            cadenas = list(ancla.stripped_strings)
            if len(cadenas) >= 2:
                alias, completo = cadenas[0], " ".join(cadenas[1:])
        demarc = ""
        for t in textos[idx + 1: idx + 3]:
            if t and not es_celda_numerica(t):
                demarc = t
                break
        goles, encajados = celda_goles(goles_txt)
        ficha = {
            "id": fuente_id,
            "url": urljoin(BASE, ancla["href"]),
            "alias": alias,
            "nombre": completo,
            "demarcacion": demarc or None,
            "posicion": grupo_actual,
            "edad": edad,
            "pc": num(pc), "pj": num(pj), "pt": num(pt),
            "min": num(minutos),
            "goles": goles, "encajados": encajados,
            "ta": num(ta), "tr": num(tr_),
        }
        if sub23:
            ficha["sub23"] = True
        jugadores.append(ficha)
    return {"equipo_lp": nombre_lp, "temporada": temporada, "jugadores": jugadores,
            "total_declarado": total_declarado or None}


def descubrir_equipos(contenido: bytes | str):
    """Enlaces a equipos de una página de competición: [{id, slug}]."""
    if isinstance(contenido, bytes):
        try:
            txt = contenido.decode("utf-8")
        except UnicodeDecodeError:  # LaPreferente sirve iso-8859-1
            txt = contenido.decode("latin-1")
    else:
        txt = contenido
    orden, por_id = [], {}
    for h in RE_HREF.finditer(txt):
        m = RE_EQUIPO.match(h.group(1).strip())
        if not m:
            continue
        eid, slug = m.group(1), unquote(m.group(2)).strip(",")
        if eid not in por_id:
            por_id[eid] = {"id": eid, "slug": slug, "slugs": []}
            orden.append(eid)
        if slug and slug not in por_id[eid]["slugs"]:
            por_id[eid]["slugs"].append(slug)
    return [por_id[i] for i in orden]


# --------------------------------------------------------------- emparejado

def _tokens_club(texto: str):
    return [t for t in normalizar(texto).split() if t not in STOPWORDS_CLUB]


def puntuar_equipo(equipo_lp: dict, nombre_interno: str) -> float:
    return max(puntuar(sl, nombre_interno) for sl in (equipo_lp.get("slugs") or [equipo_lp["slug"]]))


def puntuar(slug_lp: str, nombre_interno: str) -> float:
    a, b = _tokens_club(slug_lp.replace("-", " ")), _tokens_club(nombre_interno)
    if not a or not b:
        return 0.0
    jac = len(set(a) & set(b)) / len(set(a) | set(b))
    ratio = difflib.SequenceMatcher(None, " ".join(a), " ".join(b)).ratio()
    contiene = 1.0 if set(b) <= set(a) or set(a) <= set(b) else 0.0
    return max(jac, ratio, 0.85 * contiene)


def emparejar(equipos_lp, clubes_internos, umbral=0.8, margen=0.08):
    """Devuelve [(equipo_lp, club_interno|None, puntuación)] sin repetir clubes."""
    candidatos = []
    for e in equipos_lp:
        pts = sorted(((puntuar_equipo(e, c["nombre"]), c) for c in clubes_internos),
                     key=lambda x: -x[0])
        candidatos.append((e, pts))
    usados, res = set(), []
    # primero los emparejamientos más claros
    orden = sorted(candidatos, key=lambda x: -(x[1][0][0] if x[1] else 0))
    for e, pts in orden:
        elegido, score = None, pts[0][0] if pts else 0.0
        if pts and score >= umbral:
            segundo = pts[1][0] if len(pts) > 1 else 0.0
            if score - segundo >= margen and pts[0][1]["nombre"] not in usados:
                elegido = pts[0][1]
                usados.add(elegido["nombre"])
        res.append((e, elegido, score))
    return res


# ------------------------------------------------------------ calidad de datos

def avisos_jugador(j: dict) -> list[str]:
    """Incoherencias evidentes en una fila (no se descarta nada: se informa)."""
    av = []
    pj, pt, m = j.get("pj"), j.get("pt"), j.get("min")
    if pj is not None and pt is not None and pt > pj:
        av.append("más titularidades que partidos")
    if pj is not None and m is not None and m > pj * 130:
        av.append("más minutos de los posibles")
    if pj == 0 and m:
        av.append("minutos con 0 partidos")
    if j.get("edad") is not None and not 14 <= j["edad"] <= 50:
        av.append(f"edad rara ({j['edad']})")
    for k in ("ta", "tr", "goles"):
        if pj is not None and j.get(k) is not None and j[k] > max(pj, 1) * 3:
            av.append(f"{k} desproporcionado")
    return av


def datos_equivalentes(a: dict | None, b: dict | None) -> bool:
    """¿Mismo contenido ignorando la fecha de actualización?"""
    if not a or not b:
        return False
    quitar = lambda d: {k: v for k, v in d.items() if k != "actualizado"}
    return quitar(a) == quitar(b)


def regresion(nuevo: dict, anterior: dict | None, minimo=0.6) -> str | None:
    """Motivo para NO sobrescribir si la plantilla nueva es sospechosamente
    más pequeña que la guardada (p. ej. la web devolvió media tabla)."""
    if not anterior or not anterior.get("jugadores"):
        return None
    antes, ahora = len(anterior["jugadores"]), len(nuevo["jugadores"])
    if ahora < antes * minimo:
        return f"{ahora} jugadores frente a {antes} guardados"
    return None


def escribir_atomico(ruta: Path, texto: str):
    ruta = Path(ruta)
    tmp = ruta.with_suffix(ruta.suffix + ".tmp")
    tmp.write_text(texto, encoding="utf-8")
    os.replace(tmp, ruta)


def diagnosticar_html(contenido: bytes | str) -> dict:
    """Radiografía de una página para entender por qué sale '0 jugadores'."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(contenido, "html.parser")
    trs = soup.find_all("tr")
    anchas = [tr for tr in trs if len(tr.find_all("td", recursive=False)) >= 10]
    con_enlace = [tr for tr in anchas if tr.find("a", href=RE_JUGADOR)]
    num_ok = 0
    for tr in con_enlace:
        cola = [td.get_text(" ", strip=True) for td in tr.find_all("td", recursive=False)][-8:]
        if all(es_celda_numerica(c) for c in cola):
            num_ok += 1
    r = parse_plantilla(contenido)
    return {
        "titulo": soup.title.get_text(" ", strip=True) if soup.title else None,
        "temporada": r["temporada"],
        "tablas": len(soup.find_all("table")),
        "filas_tr": len(trs),
        "filas_con_10_o_mas_celdas": len(anchas),
        "enlaces_jugador_en_html": len(soup.find_all("a", href=RE_JUGADOR)),
        "filas_con_enlace_jugador": len(con_enlace),
        "filas_con_cola_numerica": num_ok,
        "jugadores_parseados": len(r["jugadores"]),
        "avisos": sum(1 for j in r["jugadores"] if avisos_jugador(j)),
        "bytes": len(contenido),
    }


# ------------------------------------------------------------------ comandos

def cargar_json(ruta, defecto):
    ruta = Path(ruta)
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else defecto


def descubrir_una(args, d, competicion, grupo, url):
    internos = cargar_json(args.clubes, None)
    if not internos:
        sys.exit(f"Falta {args.clubes}. Ejecuta: node herramientas/lapreferente/exportar_clubes.mjs")
    candidatos = [c for c in internos if c["competicion"] == competicion
                  and (grupo is None or c["grupo"] == grupo)]
    if not candidatos:
        sys.exit(f"No hay clubes internos para {competicion} / {grupo} (revisa competición y grupo).")
    equipos_lp = descubrir_equipos(d.get(url))
    print(f"[{competicion} {grupo or ''}] {len(equipos_lp)} enlaces de equipo; "
          f"{len(candidatos)} clubes internos candidatos")

    previo = {e["lp_id"]: e for e in cargar_json(args.equipos, [])}
    sin_pareja = []
    for e, club, score in emparejar(equipos_lp, candidatos):
        if club is None:
            if score >= 0.5:
                sin_pareja.append((e["slug"], round(score, 2)))
            continue
        ya = previo.get(e["id"], {})
        previo[e["id"]] = {
            "lp_id": e["id"], "lp_slug": e["slug"],
            "club": ya.get("club") if ya.get("manual") else club["nombre"],
            "slug": ya.get("slug") if ya.get("manual") else club["slug"],
            "competicion": club["competicion"], "grupo": club["grupo"],
            "puntuacion": round(score, 2), "manual": bool(ya.get("manual")),
        }
    escribir_atomico(Path(args.equipos), json.dumps(list(previo.values()), ensure_ascii=False, indent=2) + "\n")
    emparejados = {previo[k]["club"] for k in previo}
    faltan = [c["nombre"] for c in candidatos if c["nombre"] not in emparejados]
    if faltan:
        print("   Clubes del sitio SIN pareja (añádelos a mano en equipos.json con \"manual\": true):")
        for n in faltan:
            print("     -", n)
    if sin_pareja:
        print("   Enlaces de LaPreferente parecidos pero ambiguos:", sin_pareja[:15])
    return len(faltan)


def cmd_descubrir(args, d: Descargador):
    descubrir_una(args, d, args.competicion, args.grupo, args.url)
    print(f"Equipos emparejados en total: {len(cargar_json(args.equipos, []))} -> {args.equipos}")
    return 0


def cmd_descubrir_todo(args, d: Descargador):
    """Lee competiciones.json (las 8 URLs, una sola vez) y descubre todo de golpe."""
    config = cargar_json(args.competiciones, None)
    if not config:
        sys.exit(f"Falta {args.competiciones}. Copia competiciones.ejemplo.json y rellena las URLs.")
    pendientes = [c for c in config if str(c.get("url", "")).startswith("http")]
    sin_url = [f"{c['competicion']} {c.get('grupo') or ''}".strip() for c in config
               if not str(c.get("url", "")).startswith("http")]
    if sin_url:
        print("Sin URL todavía (se ignoran):", ", ".join(sin_url))
    if not pendientes:
        sys.exit("Ninguna entrada de competiciones.json tiene una URL válida (https://...). "
                 "Edita el fichero y pega las URLs (ver README, apartado 1).")
    sin_pareja = 0
    for c in pendientes:
        sin_pareja += descubrir_una(args, d, c["competicion"], c.get("grupo"), c["url"])
    total = len(cargar_json(args.equipos, []))
    print(f"\n{len(pendientes)} páginas procesadas; {total} equipos emparejados; "
          f"{sin_pareja} clubes del sitio sin pareja -> {args.equipos}")
    return 0


def cmd_plantillas(args, d: Descargador):
    equipos = cargar_json(args.equipos, [])
    if not equipos:
        sys.exit(f"{args.equipos} vacío: ejecuta antes 'descubrir' o 'descubrir-todo'.")
    salida = Path(args.salida)
    salida.mkdir(parents=True, exist_ok=True)
    ahora = dt.date.today().isoformat()
    problemas, cambios, sin_cambios, con_avisos = [], [], 0, []
    ruta_indice = salida / "index.json"
    indice = {c["slug"]: c for c in cargar_json(ruta_indice, {}).get("clubes", [])}

    def falla(club, motivo):
        problemas.append((club, motivo))
        print(f"  x {club}: {motivo}", file=sys.stderr)

    for e in equipos:
        if args.solo and e["slug"] not in args.solo:
            continue
        url = urljoin(BASE, f"E{e['lp_id']}/{e['lp_slug']}")
        try:
            r = parse_plantilla(d.get(url), url)
        except Exception as exc:  # una caída no debe tumbar el resto
            falla(e["club"], f"descarga: {exc}")
            continue
        if not r["jugadores"]:
            falla(e["club"], "0 jugadores: ¿cambió el HTML? (no se sobrescribe)")
            continue
        td_ = r.get("total_declarado")
        if td_ and len(r["jugadores"]) < td_ * 0.9 and not args.forzar:
            falla(e["club"], f"solo se han leído {len(r['jugadores'])} de {td_} jugadores que declaran las cabeceras de sección: "
                             "¿cambió la maquetación? (no se sobrescribe; --forzar lo salta)")
            continue
        if td_ and len(r["jugadores"]) != td_:
            print(f"  ! {e['club']}: {len(r['jugadores'])} jugadores leídos, las cabeceras declaran {td_}", file=sys.stderr)
        if args.temporada and r["temporada"] != args.temporada:
            if not args.aceptar_otra_temporada:
                falla(e["club"], f"temporada {r['temporada'] or 'no detectada'} != {args.temporada}")
                continue
            print(f"  ! {e['club']}: temporada {r['temporada']} (se acepta por --aceptar-otra-temporada)",
                  file=sys.stderr)
        doc = {
            "club": e["club"], "competicion": e["competicion"], "grupo": e["grupo"],
            "fuente": "LaPreferente.com", "fuente_url": url,
            "temporada": r["temporada"], "actualizado": ahora,
            "jugadores": r["jugadores"],
        }
        destino = salida / f"{e['slug']}.json"
        anterior = cargar_json(destino, None) if destino.exists() else None
        if not args.forzar:
            motivo = regresion(doc, anterior)
            if motivo:
                falla(e["club"], f"plantilla sospechosamente más corta ({motivo}); no se sobrescribe (--forzar)")
                continue
        malos = [(j["alias"] or j["nombre"], avisos_jugador(j)) for j in r["jugadores"] if avisos_jugador(j)]
        if malos:
            con_avisos.append((e["club"], malos))
        if datos_equivalentes(anterior, doc):
            sin_cambios += 1
            print(f"  = {e['club']}: sin cambios ({len(r['jugadores'])} jugadores)")
        else:
            escribir_atomico(destino, json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
            cambios.append(e["club"])
            print(f"  ok {e['club']}: {len(r['jugadores'])} jugadores ({r['temporada']})")
        indice[e["slug"]] = {"club": e["club"], "slug": e["slug"], "competicion": e["competicion"],
                             "grupo": e["grupo"], "temporada": r["temporada"],
                             "jugadores": len(r["jugadores"])}
    if cambios or not ruta_indice.exists():
        escribir_atomico(ruta_indice, json.dumps(
            {"actualizado": ahora, "fuente": "LaPreferente.com",
             "clubes": sorted(indice.values(), key=lambda c: c["slug"])},
            ensure_ascii=False, indent=1) + "\n")

    print(f"\n{len(cambios)} clubes actualizados, {sin_cambios} sin cambios, {len(problemas)} con problemas")
    for club, malos in con_avisos:
        print(f"   ? {club}: {len(malos)} filas con datos raros, p. ej. {malos[0][0]} ({', '.join(malos[0][1])})")
    for club, motivo in problemas:
        print("   -", club, "->", motivo)
    if len(problemas) > args.max_problemas:
        print(f"\nFALLO: {len(problemas)} problemas (máximo tolerado: {args.max_problemas})", file=sys.stderr)
        return 1
    return 0


def cmd_diagnosticar(args, d: Descargador):
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
            print(" - No hay enlaces /J…html: la página no es una plantilla, o la web carga la tabla con JavaScript\n"
                  "   o te ha servido una página de bloqueo/captcha. Abre el fichero en un navegador.")
        elif info["filas_con_enlace_jugador"] == 0:
            print(" - Hay enlaces a jugadores pero no en filas de 10+ celdas: cambió la maquetación de la tabla.")
        elif info["filas_con_cola_numerica"] == 0:
            print(" - Las filas tienen enlace pero las 8 últimas columnas no son numéricas: cambió el orden/nº de columnas.")
        print(" Manda ese fichero HTML para ajustar parse_plantilla().")
        return 1
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--user-agent", default=os.environ.get(
        "LP_USER_AGENT", "ElOtroFutbolTV-datos/1.0 (uso editorial; contacto en la web del sitio)"))
    p.add_argument("--espera", type=float, default=4.0, help="segundos entre peticiones (def. 4)")
    p.add_argument("--cache", default=str(AQUI / "cache"))
    p.add_argument("--cache-horas", type=float, default=20)
    p.add_argument("--sin-red", action="store_true", help="usa solo la caché (para depurar el parser)")
    p.add_argument("--clubes", default=str(AQUI / "clubes_internos.json"))
    p.add_argument("--equipos", default=str(AQUI / "equipos.json"))
    p.add_argument("--competiciones", default=str(AQUI / "competiciones.json"))
    sub = p.add_subparsers(dest="cmd", required=True)

    sd = sub.add_parser("descubrir", help="empareja los clubes de una competición con LaPreferente")
    sd.add_argument("--url", required=True, help="URL de la competición/grupo en LaPreferente")
    sd.add_argument("--competicion", required=True,
                    choices=["hypermotion", "primera_federacion", "segunda_federacion"])
    sd.add_argument("--grupo", default=None, help='p. ej. "Grupo 2" (omitir en Hypermotion)')
    sd.set_defaults(fn=cmd_descubrir)

    st = sub.add_parser("descubrir-todo", help="descubre todas las competiciones de competiciones.json")
    st.set_defaults(fn=cmd_descubrir_todo)

    sp = sub.add_parser("plantillas", help="descarga las plantillas y escribe los JSON")
    sp.add_argument("--salida", default=str(RAIZ / "data" / "jugadores"))
    sp.add_argument("--solo", nargs="*", help="solo estos slugs de club")
    sp.add_argument("--temporada", default=None, help='p. ej. 2026/2027: descarta clubes que muestren otra')
    sp.add_argument("--aceptar-otra-temporada", action="store_true")
    sp.add_argument("--forzar", action="store_true",
                    help="sobrescribe aunque la plantilla nueva sea mucho más corta que la guardada")
    sp.add_argument("--max-problemas", type=int, default=0,
                    help="código de salida 1 si hay más clubes con problemas que esto (def. 0)")
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
