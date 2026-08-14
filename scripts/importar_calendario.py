#!/usr/bin/env python3
"""Convierte la pestaña «Calendari» de la organización a data/calendario.json.

Es la misma hoja que lee la web oficial (jordilolapay/clubbegues), así que
mientras ellos la mantengan al día, nosotros vamos sincronizados. Solo nos
quedamos con la competición masculina.

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

from comu import ESPORTS, PARTIT_PER_NOM

HOJA = "1gB3BzDDBQATh5wTy8JRPxCHLMUqPpnQwFcp3pIsIvLo"
PESTANIA = "Calendari"
CSV_URL = (
    f"https://docs.google.com/spreadsheets/d/{HOJA}/gviz/tq?tqx=out:csv&sheet={PESTANIA}"
)

ANIO = 2026

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "data" / "calendario.json"

# Las filas sin competición valen para las dos: son pruebas compartidas.
NUESTRA = {"", "MASCULI"}

# Los partidos de la liga femenina se llaman «F1-F2».
PARTIDO_FEMENINO = re.compile(r"^F\d\s*-\s*F\d$", re.I)


def sin_acentos(texto):
    return "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )


def normaliza(celda):
    return re.sub(r"[ \t]+", " ", (celda or "").replace("\r", "")).strip()


def clave(texto):
    return sin_acentos(normaliza(texto)).upper()


def troceja(celda):
    return [t.strip() for t in normaliza(celda).split(",") if t.strip()]


def parte_fecha(celda):
    texto = normaliza(celda)
    if re.match(r"^\d{4}-\d{2}-\d{2}$", texto):
        return texto
    m = re.match(r"^(\d{1,2})/(\d{1,2})(?:/(\d{4}))?$", texto)
    if not m:
        return None
    return date(int(m.group(3) or ANIO), int(m.group(2)), int(m.group(1))).isoformat()


def parte_horas(celda):
    """«21-22h», «21:00-22:00» o «21h» → ('21:00', '22:00', orden)."""
    texto = normaliza(celda).replace("h", "")
    if not texto:
        return None
    horas = []
    for parte in texto.split("-"):
        m = re.match(r"^(\d{1,2})(?::(\d{2}))?$", parte.strip())
        if not m:
            return None
        horas.append(f"{int(m.group(1)):02d}:{m.group(2) or '00'}")
    inicio = horas[0]
    # Las franjas de madrugada (0h–6h) cierran el día anterior, no lo abren.
    hora = int(inicio[:2])
    return inicio, (horas[1] if len(horas) > 1 else ""), hora if hora >= 7 else hora + 24


def solo_masculino(partidos, quien_juega):
    """En las franjas compartidas quita lo que sea de la liga femenina."""
    lineas = [
        linea.strip()
        for linea in quien_juega.split("\n")
        if linea.strip() and not re.match(r"^F\d\s*-\s*F\d\s*:", linea.strip(), re.I)
    ]
    return [p for p in partidos if not PARTIDO_FEMENINO.match(p)], "\n".join(lineas)


def lee_csv(origen):
    if origen:
        texto = Path(origen).read_text(encoding="utf-8")
    else:
        with urllib.request.urlopen(CSV_URL) as r:  # noqa: S310 - URL fija y conocida
            texto = r.read().decode("utf-8")
    return list(csv.DictReader(texto.splitlines()))


def main():
    filas = lee_csv(sys.argv[1] if len(sys.argv) > 1 else None)
    faltan = {"Data", "Esport", "Partit"} - set(filas[0] if filas else set())
    if faltan:
        raise SystemExit(f"La pestaña «{PESTANIA}» no tiene las columnas {faltan}.")

    pruebas, limites = [], []
    vistos = set()

    for fila in filas:
        if clave(fila.get("Competició")) not in NUESTRA:
            continue
        fecha = parte_fecha(fila.get("Data"))
        if not fecha:
            continue

        tipo_fila = clave(fila.get("Tipus"))
        nota = normaliza(fila.get("Nota"))
        esports = troceja(fila.get("Esport"))
        partidos, quien = solo_masculino(
            troceja(fila.get("Partit")), fila.get("Qui juga") or ""
        )

        if tipo_fila == "LIMIT":
            limites.append({
                "fecha": fecha,
                "texto": nota.capitalize() if nota else "Data límit",
                "esports": esports,
                "rondes": partidos,
            })
            continue

        horas = parte_horas(fila.get("Hora"))
        if tipo_fila == "ACTE":
            hora, hora_fin, orden = horas or ("", "", 99)
            esports = [nota.capitalize() or "Acte"]
            nota = ""
        elif horas:
            hora, hora_fin, orden = horas
        else:
            continue

        for esport in esports:
            base = re.sub(r"[^a-z0-9]+", "-", sin_acentos(esport).lower()).strip("-")
            ident = f"{fecha}-{hora[:2] or 'xx'}-{base}"
            sufijo = 2
            while ident in vistos:
                ident = f"{fecha}-{hora[:2] or 'xx'}-{base}-{sufijo}"
                sufijo += 1
            vistos.add(ident)
            pruebas.append({
                "id": ident,
                "esport": esport,
                "esportId": (ESPORTS.get(esport) or ("",))[0],
                "detalle": "" if partidos == ["Tot"] else ", ".join(partidos),
                "partits": [PARTIT_PER_NOM[p] for p in partidos if p in PARTIT_PER_NOM],
                "tipo": "acte" if tipo_fila == "ACTE" else "esport",
                "fecha": fecha,
                "hora": hora,
                "horaFin": hora_fin,
                "orden": orden,
                "lloc": normaliza(fila.get("Lloc")),
                "quiJuga": quien,
                "nota": nota,
            })

    pruebas.sort(key=lambda p: (p["fecha"], p["orden"], p["esport"]))
    limites.sort(key=lambda l: l["fecha"])

    # Esports de lliga: no tienen franja fija, solo fechas límite por ronda.
    con_horario = {p["esport"] for p in pruebas}
    lligues = sorted({e for l in limites for e in l["esports"]} - con_horario)

    datos = {
        "titulo": "Olimpíades Begues 2026",
        "subtitulo": "14–29 d'agost",
        "fuente": CSV_URL,
        "actualizado": date.today().isoformat(),
        "pruebas": pruebas,
        "lligues": lligues,
        "limites": limites,
        "avisos": [],
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
    print(f"{len(pruebas)} proves · {len(limites)} dates límit · lligues: {', '.join(lligues)}")


if __name__ == "__main__":
    main()
