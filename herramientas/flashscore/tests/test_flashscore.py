"""Parser, descubrimiento y comandos de flashscore.py (sin red).

Los datos son los de la plantilla REAL del Cádiz CF en
https://www.flashscore.es/equipo/cadiz-cf/hdWjLJUJ/plantilla/ (oct-2026),
tal como los entrega la página: cabeceras «Porteros/Defensas/…», dorsal,
enlace al jugador, marca «Lesión», edad y seis cifras (PJ, MIN, G, A, TA, TR),
la plantilla repetida en una segunda pestaña y la sección «Entrenador».
El HTML está reconstruido a partir de ese texto en DOS maquetaciones distintas
(divs y tabla) porque el parser no debe depender de nombres de clase.
"""
import argparse, contextlib, io, json, sys, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import flashscore as fs  # noqa: E402

# (sección, dorsal, nombre, slug, id, estado, edad, pj, min, goles, asist, ta, tr)
Z = (0, 0, 0, 0, 0, 0)
CADIZ = [
    ("Porteros", 26, "Dominguez Ruben", "dominguez-ruben", "bNWSPPO7", "", 21, *Z),
    ("Porteros", 13, "Ezkieta Jokin", "ezkieta-jokin", "IPkF6s5H", "", 30, 6, 540, 0, 0, 0, 0),
    ("Porteros", 1, "Gil David", "gil-david", "dfeW7Mbo", "", 32, 4, 360, 0, 0, 0, 0),
    ("Porteros", 30, "Rubio Ruben", "blanco-ruben", "jDwX4a44", "", 18, *Z),
    ("Defensas", 3, "Arribas Sergio", "arribas-sergio", "x82H42AD", "", 23, 6, 482, 0, 0, 3, 0),
    ("Defensas", 40, "Beltran Alex", "beltran-alex", "0I3YjXPO", "", 18, *Z),
    ("Defensas", 4, "Castro Javier", "castro-urdin-javier", "lAOXx9U7", "", 26, 10, 883, 1, 0, 3, 0),
    ("Defensas", 30, "Diaz Cesar", "diaz-cesar", "6wZ65WvI", "", 18, *Z),
    ("Defensas", 5, "Doué Marc-Olivier", "doue-marc-olivier", "h0XIJLiF", "", 26, 7, 500, 0, 0, 3, 0),
    ("Defensas", 27, "Díaz Juan", "diaz-juan", "dQOnpzm2", "", 20, 9, 677, 0, 0, 2, 0),
    ("Defensas", 6, "Fernández Manu", "fernandez-manuel", "GzP7gMs4", "", 25, 6, 522, 0, 0, 1, 0),
    ("Defensas", 12, "Gocholeishvili Giorgi", "gocholeishvili-giorgi", "tf1JvBAb", "Lesión", 25, 3, 145, 0, 0, 1, 0),
    ("Defensas", 22, "Gutiérrez Cristian", "gutierrez-cristian", "4tgH7UUS", "", 25, 3, 166, 0, 0, 0, 0),
    ("Defensas", 14, "Kovacevic Bojan", "kovacevic-bojan", "p2e5RJp3", "", 22, 6, 318, 0, 0, 1, 0),
    ("Defensas", 33, "Rivera Manu", "rivera-manuel", "WY5P7Wu2", "", 17, 2, 152, 0, 0, 1, 0),
    ("Defensas", 32, "Rosado Roberto", "rosado-roberto", "0SQy4ULt", "", 18, 1, 27, 0, 0, 0, 0),
    ("Defensas", 15, "Toibibou Kenan", "toibibou-kenan", "d4ur2BcP", "", 21, *Z),
    ("Defensas", 31, "Ukwuije David", "ukwuije-noah", "48qUOJVj", "", 18, 2, 149, 0, 0, 0, 0),
    ("Defensas", 2, "de Jesús Beñat", "de-jesus-benat", "f5WgRPuq", "", 24, 2, 79, 0, 0, 0, 0),
    ("Centrocampistas", 26, "Andujar Jose", "andujar-jose", "69XllDy3", "", 21, *Z),
    ("Centrocampistas", 18, "Jandro", "orellana-alejandro", "fTTIhuHi", "", 26, 7, 464, 0, 0, 2, 0),
    ("Centrocampistas", 17, "Moueffek Aimen", "moueffek-aimen", "zRiphMYO", "", 25, 3, 156, 1, 1, 0, 0),
    ("Centrocampistas", 23, "Rodriguez Damian", "rodriguez-damian", "IR1ghK3I", "", 23, 8, 422, 0, 0, 3, 0),
    ("Centrocampistas", 24, "Sánchez Ibon", "sanchez-ibon", "rZQ2C3up", "", 22, 9, 578, 1, 1, 1, 0),
    ("Centrocampistas", 28, "Zárate Dilan Andrés", "zarate-dilan", "Ic6oZTDT", "", 19, 7, 438, 0, 0, 1, 0),
    ("Delanteros", 8, "Aghama Efe", "ugiagbe-efe", "8bXyC67U", "", 22, 4, 86, 0, 0, 0, 0),
    ("Delanteros", 16, "Cordero Antonio", "cordero-antonio", "tQQcMsFa", "", 19, 10, 679, 3, 1, 1, 0),
    ("Delanteros", 19, "Izeta", "urko-iruretagoiena", "E1UCv80p", "", 27, 9, 458, 1, 0, 0, 0),
    ("Delanteros", 21, "Kopotun Vladyslav", "kopotun-vladyslav", "nmD9lI9b", "", 26, 9, 446, 2, 1, 1, 0),
    ("Delanteros", 10, "Ontiveros Javier", "ontiveros-javier", "lAD5z2Ck", "", 29, 3, 163, 0, 0, 0, 0),
    ("Delanteros", 9, "Pascual Alvaro", "pascual-alvaro", "6DqrCTiS", "", 24, 5, 264, 0, 0, 2, 0),
    ("Delanteros", 25, "Petit Gonzalo", "petit-gonzalo", "db2nz6Pq", "Lesión", 20, 1, 8, 0, 0, 0, 0),
    ("Delanteros", 20, "Vázquez Borja", "vazquez-borja", "SnOKSNXm", "", 21, 10, 367, 0, 1, 3, 0),
]
ENTRENADOR = (None, "Jiménez Borja", "jimenez-borja", "Ojpfg5p9", 41)
POS = {"Porteros": "Portero", "Defensas": "Defensa", "Centrocampistas": "Centrocampista", "Delanteros": "Delantero"}
CABECERA = "<span>#</span><span>Nombre</span><span>Edad</span><span>MIN</span>"


def _url(slug, pid):
    return f"https://www.flashscore.es/jugador/{slug}/{pid}/"


def _fila_div(j, foto=False):
    _, dorsal, nombre, slug, pid, estado, edad, *c = j
    img = f'<a href="{_url(slug, pid)}"><img src="x.png"></a>' if foto else ""
    marca = f" <em>{estado}</em>" if estado else ""
    cifras = "".join(f"<span>{v}</span>" for v in c)
    return (f'<div class="lineupTable__row"><span>{dorsal}</span>{img}<a href="{_url(slug, pid)}">{nombre}</a>'
            f'{marca}<span>{edad}</span>{cifras}</div>')


def _fila_tabla(j):
    _, dorsal, nombre, slug, pid, estado, edad, *c = j
    marca = f" <small>{estado}</small>" if estado else ""
    cifras = "".join(f"<td>{v}</td>" for v in c)
    return (f'<tr><td>{dorsal}</td><td><a href="{_url(slug, pid)}">{nombre}</a>{marca}</td>'
            f'<td>{edad}</td>{cifras}</tr>')


def _bloque_div(jugadores, foto=False):
    out = []
    for sec in POS:
        js = [j for j in jugadores if j[0] == sec]
        if js:
            out.append(f'<div class="sec"><div class="h">{sec}{CABECERA}</div>'
                       + "".join(_fila_div(j, foto) for j in js) + "</div>")
    return "".join(out)


def _coach_div():
    _, nombre, slug, pid, edad = ENTRENADOR
    return (f'<div class="sec"><div class="h">Entrenador<span>#</span><span>Nombre</span><span>Edad</span></div>'
            f'<div class="lineupTable__row"><a href="{_url(slug, pid)}">{nombre}</a><span>{edad}</span></div></div>')


def html_div(foto=False):
    liga = [j for j in CADIZ if j[8] > 0]  # la pestaña de la liga omite a los de 0 minutos
    return ("<html><body><nav><a href='/futbol/'>Fútbol</a></nav><div class='season'>2026-2027</div>"
            "<div class='tabs'>Total LaLiga Hypermotion</div>"
            + _bloque_div(CADIZ, foto) + _coach_div() + _bloque_div(liga, foto) + _coach_div()
            + "</body></html>")


def html_tabla():
    def bloque(js):
        out = []
        for sec in POS:
            f = [j for j in js if j[0] == sec]
            if f:
                out.append(f'<tr><th colspan="9">{sec}</th></tr>' + "".join(_fila_tabla(j) for j in f))
        return "".join(out)
    liga = [j for j in CADIZ if j[8] > 0]
    _, nombre, slug, pid, edad = ENTRENADOR
    coach = (f'<tr><th colspan="9">Entrenador</th></tr><tr><td><a href="{_url(slug, pid)}">{nombre}</a></td><td>{edad}</td></tr>')
    return ("<html><body><div>2026-2027</div><table><tbody>"
            + bloque(CADIZ) + coach + bloque(liga) + coach + "</tbody></table></body></html>")


class Parser(unittest.TestCase):
    def comprobar(self, html):
        r = fs.parse_plantilla(html, "https://www.flashscore.es/equipo/cadiz-cf/hdWjLJUJ/plantilla/")
        js = r["jugadores"]
        self.assertEqual(len(js), len(CADIZ))                      # 33, sin repetidos ni entrenador
        self.assertEqual(r["duplicados"], len([j for j in CADIZ if j[8] > 0]))
        self.assertEqual(r["temporada"], "2026/2027")
        self.assertEqual(r["filas_incompletas"], 0)
        self.assertNotIn("Ojpfg5p9", {j["id"] for j in js})        # cuerpo técnico fuera
        ez = next(j for j in js if j["id"] == "IPkF6s5H")
        self.assertEqual((ez["alias"], ez["posicion"], ez["dorsal"], ez["edad"]), ("Ezkieta Jokin", "Portero", 13, 30))
        self.assertEqual((ez["pj"], ez["min"], ez["goles"], ez["asistencias"], ez["ta"], ez["tr"]), (6, 540, 0, 0, 0, 0))
        self.assertIsNone(ez["pt"]); self.assertIsNone(ez["pc"]); self.assertIsNone(ez["encajados"])
        self.assertEqual(ez["url"], "https://www.flashscore.es/jugador/ezkieta-jokin/IPkF6s5H/")
        co = next(j for j in js if j["id"] == "lAOXx9U7")          # Castro: 10 PJ, 883', 1 gol, 3 amarillas
        self.assertEqual((co["posicion"], co["pj"], co["min"], co["goles"], co["ta"]), ("Defensa", 10, 883, 1, 3))
        cd = next(j for j in js if j["id"] == "nmD9lI9b")          # Kopotun: 2 goles, 1 asistencia
        self.assertEqual((cd["posicion"], cd["goles"], cd["asistencias"]), ("Delantero", 2, 1))
        sin_juego = next(j for j in js if j["id"] == "bNWSPPO7")   # los de 0 minutos están en «Total»
        self.assertEqual((sin_juego["pj"], sin_juego["min"]), (0, 0))
        por_pos = {p: sum(1 for j in js if j["posicion"] == p) for p in set(POS.values())}
        self.assertEqual(por_pos, {"Portero": 4, "Defensa": 15, "Centrocampista": 6, "Delantero": 8})
        return js

    def test_maquetacion_div(self):
        self.comprobar(html_div())

    def test_maquetacion_tabla(self):
        self.comprobar(html_tabla())

    def test_misma_lectura_en_ambas_maquetaciones(self):
        a, b = (fs.parse_plantilla(h)["jugadores"] for h in (html_div(), html_tabla()))
        quitar_url = lambda js: [{k: v for k, v in j.items() if k != "url"} for j in js]
        self.assertEqual(quitar_url(a), quitar_url(b))

    def test_fila_con_foto_enlazada_y_nombre(self):
        js = self.comprobar(html_div(foto=True))
        self.assertTrue(all(j["alias"] for j in js))               # el enlace de la foto no deja el nombre vacío

    def test_edad_sin_cifras_y_marca_de_lesion(self):
        r = fs.parse_fila(["12", "Gocholeishvili Giorgi", "Lesión", "25", "3", "145", "0", "0", "1", "0"],
                          "Gocholeishvili Giorgi")
        self.assertEqual((r["dorsal"], r["estado"], r["edad"], r["pj"], r["min"], r["ta"]), (12, "Lesión", 25, 3, 145, 1))
        r = fs.parse_fila(["Blanco Ruben", "?"], "Blanco Ruben")
        self.assertEqual((r["dorsal"], r["edad"], r["pj"], r["incompleta"]), (None, None, None, False))
        r = fs.parse_fila(["7", "Pepe", "24", "3", "200"], "Pepe")
        self.assertTrue(r["incompleta"]); self.assertIsNone(r["pj"])  # cifras a medias: mejor sin datos

    def test_seccion_con_un_solo_jugador(self):
        j = CADIZ[0]
        html = (f'<div class="sec"><div>Porteros<span>#</span></div>'
                f'<div class="row"><span>{j[1]}</span><a href="{_url(j[3], j[4])}">{j[2]}</a>'
                f'<span>{j[6]}</span><span>1</span><span>90</span><span>0</span><span>0</span><span>0</span><span>0</span></div></div>')
        r = fs.parse_plantilla(html)
        self.assertEqual([(x["alias"], x["posicion"], x["pj"], x["min"]) for x in r["jugadores"]],
                         [("Dominguez Ruben", "Portero", 1, 90)])

    def test_sin_cabecera_no_se_inventa_posicion(self):
        j = CADIZ[1]
        html = f'<div><a href="{_url(j[3], j[4])}">{j[2]}</a><span>30</span></div>'
        self.assertEqual(fs.parse_plantilla(html)["jugadores"], [])

    def test_pagina_sin_plantilla(self):
        r = fs.parse_plantilla("<html><body><div class='loading'>…</div></body></html>")
        self.assertEqual(r["jugadores"], [])
        self.assertEqual(fs.diagnosticar_html("<html></html>")["jugadores_parseados"], 0)

    def test_avisos_detectan_columnas_cambiadas(self):
        bien = {"alias": "X", "pj": 6, "min": 540, "goles": 0, "ta": 0, "tr": 0, "edad": 30, "asistencias": 0}
        self.assertEqual(fs.avisos_jugador(bien), [])
        girado = dict(bien, pj=540, min=6)                          # PJ y MIN intercambiados
        self.assertTrue(fs.avisos_jugador(girado))


# Enlaces reales de la página de LaLiga Hypermotion (la clasificación no viene en el HTML).
ENLACES_LIGA = """
<a href="https://www.flashscore.es/partido/futbol/albacete-balompie-UirAofN6/eldense-8WUSyF3F/">Albacete - Eldense</a>,
<a href="https://www.flashscore.es/partido/futbol/cadiz-cf-hdWjLJUJ/ceuta-xpWAk3h6/">Cádiz CF - AD Ceuta</a>,
<a href="https://www.flashscore.es/partido/futbol/girona-fc-nNNpcUSL/r-sociedad-UJOGLItN/">Real Sociedad B - Girona</a>,
<a href="https://www.flashscore.es/partido/futbol/celta-vigo-GQPCyIeG/cordoba-cf-CWuejruc/">Celta de Vigo B - Córdoba</a>,
<a href="https://www.flashscore.es/partido/futbol/leganes-Mi0rXQg7/real-valladolid-cf-zkpajjvm/">Real Valladolid - Leganés</a>,
<a href="https://www.flashscore.es/partido/futbol/cadiz-cf-hdWjLJUJ/rcd-mallorca-4jDQxrbf/">Mallorca - Cádiz CF</a>,
<a href="https://www.flashscore.es/equipo/cd-castellon/QyHHzdwl/">CD Castellón</a>
"""


class Descubrimiento(unittest.TestCase):
    def test_equipos_desde_enlaces_de_partido(self):
        eq = {e["id"]: e for e in fs.descubrir_equipos(ENLACES_LIGA)}
        self.assertEqual(len(eq), 12)
        self.assertEqual(eq["hdWjLJUJ"]["slug"], "cadiz-cf")                       # aparece en 2 partidos: una sola vez
        self.assertEqual(eq["zkpajjvm"]["slug"], "real-valladolid-cf")             # id en minúsculas y slug con guiones
        # El orden del enlace es alfabético, no local-visitante: cada nombre va a su slug.
        self.assertEqual(eq["UJOGLItN"]["nombre"], "Real Sociedad B")
        self.assertEqual(eq["nNNpcUSL"]["nombre"], "Girona")
        self.assertEqual(eq["GQPCyIeG"]["nombre"], "Celta de Vigo B")
        self.assertEqual(eq["CWuejruc"]["nombre"], "Córdoba")
        self.assertEqual(eq["QyHHzdwl"]["slug"], "cd-castellon")                   # también enlaces /equipo/

    def test_url_de_plantilla(self):
        e = {"fs_slug": "cadiz-cf", "fs_id": "hdWjLJUJ"}
        self.assertEqual(fs.url_plantilla(e), "https://www.flashscore.es/equipo/cadiz-cf/hdWjLJUJ/plantilla/")

    def _equipos(self):
        return json.loads((Path(__file__).resolve().parent.parent / "equipos.json").read_text(encoding="utf-8"))

    def test_equipos_json_de_hypermotion_es_coherente(self):
        # equipos.json trae ya todas las categorías: aquí solo se comprueba Hypermotion (22 clubes).
        datos = [d for d in self._equipos() if d["competicion"] == "hypermotion"]
        self.assertEqual(len(datos), 22)
        self.assertEqual(len({d["fs_id"] for d in datos}), 22)
        self.assertEqual(len({d["slug"] for d in datos}), 22)
        self.assertTrue(all(len(d["fs_id"]) == 8 for d in datos))

    def test_equipos_json_completo_es_coherente(self):
        datos = self._equipos()
        self.assertGreaterEqual(len(datos), 100)
        self.assertEqual(len({d["fs_id"] for d in datos}), len(datos))      # sin equipos repetidos
        self.assertEqual(len({d["slug"] for d in datos}), len(datos))       # ni dos clubes con el mismo fichero
        self.assertTrue(all(len(d["fs_id"]) == 8 for d in datos))
        self.assertTrue(all(d["competicion"] in ("hypermotion", "primera_federacion", "segunda_federacion") for d in datos))
        # "sin_plantilla" solo puede ser true (si no aplica, la clave no existe)
        self.assertTrue(all(d["sin_plantilla"] is True for d in datos if "sin_plantilla" in d))
        # Hypermotion y Primera Federación SÍ tienen plantilla en Flashscore: ahí la marca sería un error.
        self.assertFalse([d["club"] for d in datos if d.get("sin_plantilla") and d["competicion"] != "segunda_federacion"])


class FalsoDescargador:
    def __init__(self, paginas):
        self.paginas, self.pedidas = paginas, []

    def get(self, url):
        self.pedidas.append(url)
        for clave, contenido in self.paginas.items():
            if clave in url:
                return contenido
        raise RuntimeError("404 simulado " + url)


def silencio(fn, *a, **k):
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        return fn(*a, **k)


class Comandos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.equipos = self.dir / "equipos.json"
        self.equipos.write_text(json.dumps([{
            "fs_id": "hdWjLJUJ", "fs_slug": "cadiz-cf", "club": "Cádiz CF", "slug": "cadiz-cf",
            "competicion": "hypermotion", "grupo": None}]), encoding="utf-8")
        self.salida = self.dir / "jugadores"

    def tearDown(self):
        self.tmp.cleanup()

    def args(self, **kw):
        base = dict(equipos=str(self.equipos), salida=str(self.salida), solo=None, temporada="2026/2027",
                    aceptar_otra_temporada=False, minimo_jugadores=11, forzar=False, max_problemas=0,
                    revisar_sin_plantilla=False)
        base.update(kw)
        return argparse.Namespace(**base)

    def ejecutar(self, html, **kw):
        d = FalsoDescargador({"hdWjLJUJ/plantilla": html.encode("utf-8") if isinstance(html, str) else html})
        return silencio(fs.cmd_plantillas, self.args(**kw), d), d

    def test_escribe_el_json_con_el_formato_de_la_web(self):
        codigo, d = self.ejecutar(html_div())
        self.assertEqual(codigo, 0)
        self.assertEqual(d.pedidas, ["https://www.flashscore.es/equipo/cadiz-cf/hdWjLJUJ/plantilla/"])
        doc = json.loads((self.salida / "cadiz-cf.json").read_text(encoding="utf-8"))
        self.assertEqual((doc["fuente"], doc["temporada"], doc["club"]), ("Flashscore.es", "2026/2027", "Cádiz CF"))
        self.assertEqual(doc["fuente_url"], "https://www.flashscore.es/equipo/cadiz-cf/hdWjLJUJ/plantilla/")
        self.assertEqual(len(doc["jugadores"]), len(CADIZ))
        campos = {"id", "url", "alias", "nombre", "demarcacion", "posicion", "edad", "pc", "pj", "pt", "min",
                  "goles", "encajados", "ta", "tr"}                  # los que lee la web (+ dorsal y asistencias)
        self.assertTrue(campos <= set(doc["jugadores"][0]))
        idx = json.loads((self.salida / "index.json").read_text(encoding="utf-8"))
        self.assertEqual((idx["fuente"], idx["clubes"][0]["jugadores"]), ("Flashscore.es", len(CADIZ)))

    def test_segunda_ejecucion_no_toca_el_fichero(self):
        self.ejecutar(html_div())
        ruta = self.salida / "cadiz-cf.json"
        antes = ruta.stat().st_mtime_ns
        codigo, _ = self.ejecutar(html_div())
        self.assertEqual(codigo, 0)
        self.assertEqual(ruta.stat().st_mtime_ns, antes)

    def test_cero_jugadores_no_sobrescribe(self):
        self.ejecutar(html_div())
        antes = (self.salida / "cadiz-cf.json").read_text(encoding="utf-8")
        codigo, _ = self.ejecutar("<html><body>cargando…</body></html>")
        self.assertEqual(codigo, 1)
        self.assertEqual((self.salida / "cadiz-cf.json").read_text(encoding="utf-8"), antes)

    def test_plantilla_demasiado_corta_no_se_escribe(self):
        codigo, _ = self.ejecutar("<body><div>2026-2027</div>" + _bloque_div(CADIZ[:5]) + "</body>")   # 5 < 11
        self.assertEqual(codigo, 1)
        self.assertFalse((self.salida / "cadiz-cf.json").exists())
        codigo, _ = self.ejecutar("<body>" + _bloque_div(CADIZ[:5]) + "</body>", forzar=True, temporada=None)
        self.assertEqual(codigo, 0)

    def test_regresion_frente_a_lo_guardado(self):
        self.ejecutar(html_div())
        mitad = "<body><div>2026-2027</div>" + _bloque_div(CADIZ[:15]) + "</body>"   # 15 de 32: <60 %
        codigo, _ = self.ejecutar(mitad)
        self.assertEqual(codigo, 1)
        self.assertEqual(len(json.loads((self.salida / "cadiz-cf.json").read_text(encoding="utf-8"))["jugadores"]), len(CADIZ))

    def test_temporada_no_detectada_se_asume_la_pedida(self):
        sin_temp = html_div().replace("2026-2027", "")
        codigo, _ = self.ejecutar(sin_temp)
        self.assertEqual(codigo, 0)
        self.assertEqual(json.loads((self.salida / "cadiz-cf.json").read_text(encoding="utf-8"))["temporada"], "2026/2027")

    def test_otra_temporada_se_rechaza(self):
        codigo, _ = self.ejecutar(html_div().replace("2026-2027", "2025-2026"))
        self.assertEqual(codigo, 1)
        self.assertFalse((self.salida / "cadiz-cf.json").exists())

    def test_columnas_cambiadas_no_se_publican(self):
        # PJ y MIN intercambiados en TODAS las filas -> datos incoherentes -> no se escribe
        girado = [j[:7] + (j[8], j[7]) + j[9:] for j in CADIZ]
        html = "<body><div>2026-2027</div>" + _bloque_div(girado) + "</body>"
        codigo, _ = self.ejecutar(html)
        self.assertEqual(codigo, 1)
        self.assertFalse((self.salida / "cadiz-cf.json").exists())

    def test_plantilla_toda_a_cero_no_pisa_datos_guardados(self):
        # Flashscore lista a los jugadores pero sin un solo partido ni minuto: no debe sustituir lo guardado
        self.ejecutar(html_div())
        antes = (self.salida / "cadiz-cf.json").read_text(encoding="utf-8")
        ceros = [j[:7] + (0, 0, 0, 0, 0, 0) for j in CADIZ]
        html = "<body><div>2026-2027</div>" + _bloque_div(ceros) + "</body>"
        codigo, _ = self.ejecutar(html)
        self.assertEqual(codigo, 0)
        self.assertEqual((self.salida / "cadiz-cf.json").read_text(encoding="utf-8"), antes)

    def test_plantilla_toda_a_cero_sin_fichero_previo_no_se_publica(self):
        ceros = [j[:7] + (0, 0, 0, 0, 0, 0) for j in CADIZ]
        html = "<body><div>2026-2027</div>" + _bloque_div(ceros) + "</body>"
        self.ejecutar(html)
        self.assertFalse((self.salida / "cadiz-cf.json").exists())

    def test_solo_filtra_por_club(self):
        codigo, d = self.ejecutar(html_div(), solo=["otro-club"])
        self.assertEqual(codigo, 0)
        self.assertEqual(d.pedidas, [])

    def _marcar_sin_plantilla(self):
        datos = json.loads(self.equipos.read_text(encoding="utf-8"))
        datos[0]["sin_plantilla"] = True
        self.equipos.write_text(json.dumps(datos), encoding="utf-8")

    def test_sin_plantilla_esperada_no_es_un_problema_ni_toca_lo_guardado(self):
        self.ejecutar(html_div())                                  # hay un fichero guardado de otra fuente
        antes = (self.salida / "cadiz-cf.json").read_text(encoding="utf-8")
        self._marcar_sin_plantilla()
        codigo, _ = self.ejecutar("<html><body>sin plantilla</body></html>", revisar_sin_plantilla=True)
        self.assertEqual(codigo, 0)                                # con --max-problemas 0: no cuenta como fallo
        self.assertEqual((self.salida / "cadiz-cf.json").read_text(encoding="utf-8"), antes)

    def test_sin_plantilla_no_tapa_una_caida_de_red(self):
        self._marcar_sin_plantilla()
        self.assertEqual(silencio(fs.cmd_plantillas, self.args(revisar_sin_plantilla=True), FalsoDescargador({})), 1)

    def test_sin_plantilla_pero_ya_hay_jugadores_se_publican(self):
        self._marcar_sin_plantilla()
        codigo, _ = self.ejecutar(html_div(), revisar_sin_plantilla=True)
        self.assertEqual(codigo, 0)
        self.assertEqual(len(json.loads((self.salida / "cadiz-cf.json").read_text(encoding="utf-8"))["jugadores"]), len(CADIZ))

    def test_sin_plantilla_no_se_descarga_por_defecto(self):
        self._marcar_sin_plantilla()
        codigo, d = self.ejecutar(html_div())                          # sin --revisar-sin-plantilla
        self.assertEqual((codigo, d.pedidas), (0, []))                  # ni una petición a Flashscore
        self.assertFalse((self.salida / "cadiz-cf.json").exists())
        codigo, d = self.ejecutar(html_div(), solo=["cadiz-cf"])        # pero --solo lo fuerza
        self.assertEqual(codigo, 0)
        self.assertEqual(len(d.pedidas), 1)

    def test_el_descubrimiento_conserva_sin_plantilla(self):
        internos = self.dir / "clubes_internos.json"
        internos.write_text(json.dumps([{"nombre": "Cádiz CF", "competicion": "hypermotion", "grupo": None, "slug": "cadiz-cf"}]),
                            encoding="utf-8")
        datos = json.loads(self.equipos.read_text(encoding="utf-8"))
        datos[0].update(sin_plantilla=True, manual=False)
        self.equipos.write_text(json.dumps(datos), encoding="utf-8")
        args = argparse.Namespace(clubes=str(internos), equipos=str(self.equipos),
                                  competicion="hypermotion", grupo=None,
                                  url="https://www.flashscore.es/futbol/espana/laliga-hypermotion/")
        d = FalsoDescargador({"laliga-hypermotion": ENLACES_LIGA if isinstance(ENLACES_LIGA, bytes) else str(ENLACES_LIGA).encode("utf-8")})
        silencio(fs.cmd_descubrir, args, d)
        despues = {e["fs_id"]: e for e in json.loads(self.equipos.read_text(encoding="utf-8"))}
        self.assertIs(despues["hdWjLJUJ"].get("sin_plantilla"), True)

    def test_caida_de_red_cuenta_como_problema(self):
        d = FalsoDescargador({})
        self.assertEqual(silencio(fs.cmd_plantillas, self.args(), d), 1)
        self.assertEqual(silencio(fs.cmd_plantillas, self.args(max_problemas=1), d), 0)


if __name__ == "__main__":
    unittest.main(verbosity=1)
