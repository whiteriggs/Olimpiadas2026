#!/usr/bin/env python3
"""Convierte el calendario provisional (Google Sheets) a data/calendario.json.

Uso:
    python3 scripts/importar_calendario.py            # descarga la hoja publicada
    python3 scripts/importar_calendario.py cal.csv    # usa un CSV ya descargado
"""

import csv
import json
import re
import sys
import unicodedata
import urllib.request
from datetime import date
from pathlib import Path

HOJA = "1gB3BzDDBQATh5wTy8JRPxCHLMUqPpnQwFcp3pIsIvLo"
GID = "572313569"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{HOJA}/export?format=csv&gid={GID}"

ANIO = 2026
MES = 8  # las olimpíades van del 14 al 29 de agosto

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "data" / "calendario.json"

DIAS = {
    "DILLUNS": 0, "DIMARTS": 1, "DIMECRES": 2, "DIJOUS": 3,
    "DIVENDRES": 4, "DISSABTE": 5, "DIUMENGE": 6,
}

# Orden importa: los nombres largos deben ir antes que los cortos.
TERMINOS = [
    ("VOLEY PLATJA", "Vòlei platja", "esport"),
    ("VOLEI PLATJA", "Vòlei platja", "esport"),
    ("FUTBOL SALA", "Futbol sala", "esport"),
    ("FUTBOL 7", "Futbol 7", "esport"),
    ("FUTBOL 11", "Futbol 11", "esport"),
    ("PING PONG", "Ping-pong", "esport"),
    ("WATERPOLO", "Waterpolo", "esport"),
    ("HANDBALL", "Handbol", "esport"),
    ("BASQUET", "Bàsquet", "esport"),
    ("MINIGOLF", "Minigolf", "esport"),
    ("ATLETISME", "Atletisme", "esport"),
    ("CICLISME", "Ciclisme", "esport"),
    ("FUTBOLIN", "Futbolí", "esport"),
    ("NATACIO", "Natació", "esport"),
    ("ESCACS", "Escacs", "esport"),
    ("PETANCA", "Petanca", "esport"),
    ("DOMINO", "Dòmino", "esport"),
    ("FRONTON", "Frontó", "esport"),
    ("BILLAR", "Billar", "esport"),
    ("DARDS", "Dards", "esport"),
    ("PADEL", "Pàdel", "esport"),
    ("TENIS", "Tennis", "esport"),
    ("CROSS", "Cros", "esport"),
    ("VOLEY", "Vòlei", "esport"),
    ("VOLEI", "Vòlei", "esport"),
    ("REUNIO INFORMATIVA", "Reunió informativa", "acte"),
    ("INAUGURACIO", "Inauguració", "acte"),
    ("SOPAR CLOENDA", "Sopar de cloenda", "acte"),
    ("TARDEO", "Tardeo", "acte"),
]

# Valores de la columna de leyenda que no son eventos.
LEYENDA = {"MASCULI", "FEMENI", "MASCULI I FEMENI", "NO DISPONIBLE", ""}


def sin_acentos(texto):
    return "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )


def normaliza(celda):
    return re.sub(r"\s+", " ", celda.replace("\n", " ")).strip()


def clave(texto):
    return sin_acentos(normaliza(texto)).upper()


def limpia_detalle(texto):
    return re.sub(r"^[\s\-+I·]+|[\s\-+I·]+$", "", texto).strip()


def nombre_canonico(texto):
    plano = clave(texto)
    for patron, nombre, _ in TERMINOS:
        if patron in plano:
            return nombre
    return normaliza(texto).title()


def parte_horas(etiqueta):
    m = re.match(r"^(\d{1,2})\s*-\s*(\d{1,2})h$", etiqueta.strip(), re.I)
    if not m:
        return None
    ini, fin = int(m.group(1)), int(m.group(2))
    # Las franjas de 0h a 6h son de madrugada: van al final del día.
    orden = ini if ini >= 7 else ini + 24
    return f"{ini:02d}:00", f"{fin:02d}:00", orden


def separa_eventos(celda):
    """Una celda puede contener varios esports ('FUTBOLIN / DARDS 1-2 PREV.')."""
    texto = normaliza(celda)
    if not texto:
        return []
    plano = clave(texto)
    encontrados = []
    ocupado = [False] * len(plano)
    for patron, nombre, tipo in TERMINOS:
        for m in re.finditer(re.escape(patron), plano):
            if any(ocupado[m.start():m.end()]):
                continue
            for i in range(m.start(), m.end()):
                ocupado[i] = True
            encontrados.append((m.start(), m.end(), nombre, tipo))
    if not encontrados:
        return [{"nombre": texto, "detalle": "", "tipo": "altres"}]

    encontrados.sort()
    eventos = []
    for i, (ini, fin, nombre, tipo) in enumerate(encontrados):
        sig = encontrados[i + 1][0] if i + 1 < len(encontrados) else len(texto)
        detalle = texto[fin:sig]
        if i == 0 and ini > 0:
            detalle = texto[:ini] + " " + detalle
        eventos.append({"nombre": nombre, "detalle": limpia_detalle(detalle), "tipo": tipo})
    return eventos


def lee_csv(origen):
    if origen:
        texto = Path(origen).read_text(encoding="utf-8")
    else:
        with urllib.request.urlopen(CSV_URL) as r:  # noqa: S310 - URL fija y conocida
            texto = r.read().decode("utf-8")
    return list(csv.reader(texto.splitlines()))


def main():
    filas = lee_csv(sys.argv[1] if len(sys.argv) > 1 else None)

    pruebas, limites, avisos = [], [], []
    fecha_actual = None
    sedes = {}
    vistos = set()

    for fila in filas:
        fila = list(fila) + [""] * (8 - len(fila))
        col0 = normaliza(fila[0])

        m_dia = re.match(r"^([A-Za-zÀ-ÿ]+)\s+(\d{1,2})$", normaliza(fila[1])) if not col0 else None
        if m_dia and clave(m_dia.group(1)) in DIAS:
            fecha_actual = date(ANIO, MES, int(m_dia.group(2))).isoformat()
            sedes = {}
            continue

        if fecha_actual and not col0 and normaliza(fila[1]).upper().startswith("LIMIT"):
            limites.append({
                "fecha": fecha_actual,
                "texto": normaliza(fila[1]).title(),
                "esports": [nombre_canonico(t) for t in normaliza(fila[7]).split(",") if t.strip()],
            })
            continue

        # Fila de sedes: va justo debajo del nombre del día.
        if not col0 and not sedes and any(normaliza(fila[i]) for i in (1, 3, 5)):
            for i in (1, 3, 5):
                nombre = normaliza(fila[i])
                if nombre:
                    sedes[i] = nombre
                    sedes[i + 1] = nombre
            continue

        horas = parte_horas(col0)
        if not horas or not fecha_actual:
            continue
        hora, hora_fin, orden = horas

        nota = normaliza(fila[7])
        if nota and clave(nota) not in LEYENDA:
            avisos.append({"fecha": fecha_actual, "hora": hora, "texto": nota})

        for col in range(1, 7):
            for ev in separa_eventos(fila[col]):
                base = re.sub(r"[^a-z0-9]+", "-", sin_acentos(ev["nombre"]).lower()).strip("-")
                ident = f"{fecha_actual}-{hora[:2]}-{base}"
                sufijo = 2
                while ident in vistos:
                    ident = f"{fecha_actual}-{hora[:2]}-{base}-{sufijo}"
                    sufijo += 1
                vistos.add(ident)
                pruebas.append({
                    "id": ident,
                    "esport": ev["nombre"],
                    "detalle": ev["detalle"],
                    "tipo": ev["tipo"],
                    "fecha": fecha_actual,
                    "hora": hora,
                    "horaFin": hora_fin,
                    "orden": orden,
                    "lloc": sedes.get(col, ""),
                })

    pruebas.sort(key=lambda p: (p["fecha"], p["orden"], p["esport"]))

    # Esports de lliga: no tienen franja fija, solo fechas límite de ronda.
    lligues = sorted({e for l in limites for e in l["esports"]})

    datos = {
        "titulo": "Olimpíades Begues 2026",
        "subtitulo": "14–29 d'agost",
        "fuente": CSV_URL,
        "actualizado": date.today().isoformat(),
        "pruebas": pruebas,
        "lligues": lligues,
        "limites": limites,
        "avisos": avisos,
    }

    if len(pruebas) < 50:
        raise SystemExit(
            f"Solo se han detectado {len(pruebas)} pruebas: la hoja ha cambiado de formato. "
            "Revisa el parser antes de sobrescribir el calendario."
        )

    # Mantener la fecha anterior si el contenido no ha cambiado, para no generar
    # commits diarios vacíos desde la acción programada.
    if SALIDA.exists():
        previo = json.loads(SALIDA.read_text(encoding="utf-8"))
        campos = ("pruebas", "lligues", "limites", "avisos", "titulo", "subtitulo")
        if all(previo.get(c) == datos[c] for c in campos):
            datos["actualizado"] = previo.get("actualizado", datos["actualizado"])

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(pruebas)} pruebas, {len(limites)} límites, {len(avisos)} avisos → {SALIDA}")


if __name__ == "__main__":
    main()
