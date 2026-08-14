#!/usr/bin/env python3
"""Cosas que comparten los dos importadores: la hoja, los deportes y los cuadros.

Las tablas de puntos y las categorías salen del reglamento de la organización
(mismo contenido que datos/torneo.json de jordilolapay/clubbegues).
"""

import csv
import io
import json
import re
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

HOJA = "1gB3BzDDBQATh5wTy8JRPxCHLMUqPpnQwFcp3pIsIvLo"
RAIZ = Path(__file__).resolve().parent.parent

# El sorteo lo publica la organización en su repo; guardamos copia por si cae.
SORTEIG_URL = "https://raw.githubusercontent.com/jordilolapay/clubbegues/main/datos/cuadros.json"
SORTEIG_LOCAL = RAIZ / "data" / "sorteig.json"

PUNTS = {
    "equip": [70, 54, 48, 42, 30, 25, 20, 15, 10, 5],
    "resistencia": [50, 37, 33, 29, 25, 21, 17, 13, 9, 5],
    "individual": [40, 32, 29, 26, 20, 17, 14, 11, 8, 5],
}

# nombre en la hoja -> (id de la organización, categoría de puntos, formato)
ESPORTS = {
    "Petanca": ("petanca", "individual", "quadre"),
    "Voleibol platja": ("voleibol-playa", "individual", "quadre"),
    "Voleibol pista": ("voleibol-pista", "equip", "quadre"),
    "Tennis": ("tenis", "individual", "quadre"),
    "Frontó": ("fronton", "individual", "quadre"),
    "Pàdel": ("padel", "individual", "quadre"),
    "Ping-pong": ("ping-pong", "individual", "quadre"),
    "Futbol sala": ("futbol-sala", "equip", "quadre"),
    "Futbol 7": ("futbol-siete", "equip", "quadre"),
    "Handbol": ("balonmano", "equip", "quadre"),
    "Bàsquet": ("baloncesto", "equip", "quadre"),
    "Waterpolo": ("waterpolo", "equip", "quadre"),
    "Dòmino": ("domino", "individual", "quadre"),
    "Escacs": ("ajedrez", "individual", "quadre"),
    "Dards": ("dardos", "individual", "quadre"),
    "Futbolí": ("futbolin", "individual", "quadre"),
    "Billar": ("billar", "individual", "quadre"),
    "Minigolf": ("minigolf", "individual", "classificacio"),
    "Ciclisme": ("ciclismo", "resistencia", "classificacio"),
    "Atletisme": ("atletismo", "resistencia", "classificacio"),
    "Natació": ("natacion", "resistencia", "classificacio"),
}

# Los 15 partidos de un cuadro, en orden de dependencia.
ESQUEMA = [
    ("previa1", "previes", "Prèvia 1", "P1"),
    ("previa2", "previes", "Prèvia 2", "P2"),
    ("qf1", "quarts", "Quarts 1", "QF1"),
    ("qf2", "quarts", "Quarts 2", "QF2"),
    ("qf3", "quarts", "Quarts 3", "QF3"),
    ("qf4", "quarts", "Quarts 4", "QF4"),
    ("sf1", "semis", "Semifinal 1", "SF1"),
    ("sf2", "semis", "Semifinal 2", "SF2"),
    ("final", "final", "Final", "Final"),
    ("tercerPuesto", "llocs", "3r i 4t lloc", "3r/4t"),
    ("consSf1", "consSemis", "Semifinal consolació 1", "SC1"),
    ("consSf2", "consSemis", "Semifinal consolació 2", "SC2"),
    ("consFinal", "consFinal", "Final consolació · 5è i 6è lloc", "5è/6è"),
    ("consTercero", "llocs", "7è i 8è lloc", "7è/8è"),
    ("puesto9", "llocs", "9è i 10è lloc", "9è/10è"),
]

# De dónde sale cada puesto final, del 1º al 10º.
ORIGEN_POSICIONS = [
    ("final", "guanyador"),
    ("final", "perdedor"),
    ("tercerPuesto", "guanyador"),
    ("tercerPuesto", "perdedor"),
    ("consFinal", "guanyador"),
    ("consFinal", "perdedor"),
    ("consTercero", "guanyador"),
    ("consTercero", "perdedor"),
    ("puesto9", "guanyador"),
    ("puesto9", "perdedor"),
]

PARTIT_PER_NOM = {llarg: ident for ident, _, llarg, _ in ESQUEMA}


def sin_acentos(texto):
    return "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )


def normaliza(celda):
    return re.sub(r"[ \t]+", " ", (celda or "").replace("\r", "")).strip()


def clave(texto):
    return sin_acentos(normaliza(texto)).upper()


def baixa_pestanya(nombre):
    url = (
        f"https://docs.google.com/spreadsheets/d/{HOJA}/gviz/tq"
        f"?tqx=out:csv&sheet={urllib.parse.quote(nombre)}"
    )
    with urllib.request.urlopen(url, timeout=60) as r:  # noqa: S310 - URL fija
        texto = r.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(texto)))


def baixa_sorteig():
    try:
        with urllib.request.urlopen(SORTEIG_URL, timeout=60) as r:  # noqa: S310
            datos = json.loads(r.read().decode("utf-8"))
        SORTEIG_LOCAL.write_text(
            json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
        )
        return datos
    except Exception as e:  # la copia local nos vale mientras el sorteo no cambie
        if not SORTEIG_LOCAL.exists():
            raise SystemExit(f"No se puede leer el sorteo ({e}) y no hay copia local.")
        print(f"Aviso: uso la copia local del sorteo ({e}).")
        return json.loads(SORTEIG_LOCAL.read_text(encoding="utf-8"))
