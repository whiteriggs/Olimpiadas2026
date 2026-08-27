#!/usr/bin/env python3
"""Genera data/torneig.json: equipos, cuadros con resultados y clasificación general.

Junta tres fuentes: las pestañas «Equips» y «Masculí» de la hoja de la
organización (nombres y resultados, que van cambiando) y el sorteo publicado en
su repo (los emparejamientos, fijos desde el sorteo).

Uso:
    python3 scripts/importar_torneig.py
"""

import json
from datetime import datetime, timezone

from comu import (
    ESPORTS,
    ESQUEMA,
    ORIGEN_POSICIONS,
    PUNTS,
    RAIZ,
    baixa_pestanya,
    baixa_sorteig,
    clave,
    normaliza,
)

SALIDA = RAIZ / "data" / "torneig.json"
NOSALTRES = "DIABLOS"

# El color de la samarreta de cada equip, que al full no el posen.
COLORS = {
    "MASSUMBA Y LOS MAS ZUMBAOS": "#2f56d6",  # blau royal
    "DIABLOS": "#d92b2b",  # vermell
    "PASSA DIRECTAMENT": "#ff5f4d",  # coral fluor
    "LA JEE-PETA": "#e6f000",  # groc fluor
    "LA ONCE": "#4f7942",  # verd falguera
    "VAIG MOLT CREMAT": "#a3835c",  # sorra fosca
    "OLIMPIAKOJOS": "#5fe0ae",  # verd menta
    "YAYO VALLECANO": "#1c1c1c",  # negre
    "ESPERANDO A LOS PALOMOS": "#132a5e",  # blau mari
    "JOGA VOMITO": "#ffffff",  # blanc
}


def llegeix_equips():
    equips = []
    for fila in baixa_pestanya("Equips"):
        if clave(fila.get("Competició")) != "MASCULI":
            continue
        ident = normaliza(fila.get("Id"))
        if not ident:
            continue
        nom = normaliza(fila.get("Nom")) or ident
        equips.append(
            {
                "id": ident,
                "nom": nom,
                "color": normaliza(fila.get("Color")) or COLORS.get(clave(nom), ""),
            }
        )
    if not equips:
        raise SystemExit("La pestaña «Equips» no tiene ningún equipo masculino.")
    sense = [e["nom"] for e in equips if not e["color"]]
    if sense:
        print("  aviso: sense color:", ", ".join(sense))
    return equips


def llegeix_resultats():
    """{nombre del deporte: {nombre de la fila: (ganador, marcador)}}"""
    resultats = {}
    for fila in baixa_pestanya("Masculí"):
        esport = normaliza(fila.get("Esport"))
        partit = normaliza(fila.get("Partit"))
        if esport and partit:
            resultats.setdefault(esport, {})[partit] = (
                normaliza(fila.get("Guanyador")),
                normaliza(fila.get("Marcador")),
            )
    return resultats


def conserva_resultats_antics(actuals, antics):
    """Rellena celdas remotas vacías con el último resultado publicado."""
    fusionats = {nom: dict(resultats) for nom, resultats in actuals.items()}
    aliases_equip = {
        equip["id"]: {clave(equip["id"]), clave(equip["nom"])}
        for equip in antics.get("equips", [])
    }
    for esport in antics.get("esports", []):
        resultats = fusionats.setdefault(esport["nom"], {})
        for partit in esport.get("partits", []):
            guanyador, _ = resultats.get(partit["nom"], ("", ""))
            if not normaliza(guanyador) and partit.get("guanyador"):
                resultats[partit["nom"]] = (
                    partit["guanyador"],
                    partit.get("marcador", ""),
                )
        equips_publicats = {
            clave(publicat)
            for clau_lloc, (publicat, _) in resultats.items()
            if clau_lloc.startswith("Lloc ") and normaliza(publicat)
        }
        for index, equip in enumerate(esport.get("posicions", []), 1):
            clau_lloc = f"Lloc {index}"
            publicat, _ = resultats.get(clau_lloc, ("", ""))
            aliases = aliases_equip.get(equip, {clave(equip)}) if equip else set()
            if not normaliza(publicat) and equip and aliases.isdisjoint(equips_publicats):
                resultats[clau_lloc] = (equip, "")
    return fusionats


def resol_equip(celda, per_clau):
    """La hoja la rellenan a mano: aceptamos tanto «E5» como el nombre del equipo."""
    return per_clau.get(clave(celda)) if normaliza(celda) else None


def cuadre(sorteig, resultats, per_clau, avisos, nom):
    partits = {}
    guanyador = lambda i: partits.get(i, {}).get("guanyador")  # noqa: E731
    perdedor = lambda i: partits.get(i, {}).get("perdedor")  # noqa: E731
    parella = lambda v: (v or [None, None])[:2] if v else [None, None]  # noqa: E731

    deriva = {
        "previa1": lambda: parella(sorteig.get("previa1")),
        "previa2": lambda: parella(sorteig.get("previa2")),
        "qf1": lambda: [guanyador("previa1"), sorteig.get("qf1Rival")],
        "qf2": lambda: parella(sorteig.get("qf2")),
        "qf3": lambda: [guanyador("previa2"), sorteig.get("qf3Rival")],
        "qf4": lambda: parella(sorteig.get("qf4")),
        "sf1": lambda: [guanyador("qf1"), guanyador("qf2")],
        "sf2": lambda: [guanyador("qf3"), guanyador("qf4")],
        "final": lambda: [guanyador("sf1"), guanyador("sf2")],
        "tercerPuesto": lambda: [perdedor("sf1"), perdedor("sf2")],
        "consSf1": lambda: [perdedor("qf1"), perdedor("qf2")],
        "consSf2": lambda: [perdedor("qf3"), perdedor("qf4")],
        "consFinal": lambda: [guanyador("consSf1"), guanyador("consSf2")],
        "consTercero": lambda: [perdedor("consSf1"), perdedor("consSf2")],
        "puesto9": lambda: [perdedor("previa1"), perdedor("previa2")],
    }

    llista = []
    for ident, ronda, llarg, sigla in ESQUEMA:
        a, b = deriva[ident]()
        cru, marcador = resultats.get(llarg, ("", ""))
        guanya = resol_equip(cru, per_clau)
        if cru and not guanya:
            avisos.append(f"{nom} · {llarg}: no sé qui és «{cru}».")
        elif guanya and guanya not in (a, b):
            avisos.append(f"{nom} · {llarg}: {cru} no juga aquest partit.")
            guanya = None
        partits[ident] = {
            "id": ident,
            "ronda": ronda,
            "nom": llarg,
            "sigla": sigla,
            "equips": [a, b],
            "guanyador": guanya,
            "perdedor": (b if guanya == a else a) if guanya else None,
            "marcador": marcador,
            "estat": "jugat" if guanya else ("pendent" if a and b else "bloquejat"),
        }
        llista.append(partits[ident])

    posicions = [partits[i][quin] for i, quin in ORIGEN_POSICIONS]
    return llista, posicions


def classificacio(resultats, per_clau, avisos, nom, quants):
    posicions = []
    for i in range(1, quants + 1):
        cru, _ = resultats.get(f"Lloc {i}", ("", ""))
        equip = resol_equip(cru, per_clau)
        if cru and not equip:
            avisos.append(f"{nom} · Lloc {i}: no sé qui és «{cru}».")
        posicions.append(equip)
    return [], posicions


def main():
    antiguo = json.loads(SALIDA.read_text(encoding="utf-8")) if SALIDA.exists() else {}
    equips = llegeix_equips()
    per_clau = {}
    for e in equips:
        per_clau[clave(e["id"])] = e["id"]
        per_clau[clave(e["nom"])] = e["id"]

    nosaltres = next((e["id"] for e in equips if clave(e["nom"]) == NOSALTRES), None)
    sorteig = baixa_sorteig()
    resultats = conserva_resultats_antics(llegeix_resultats(), antiguo)
    avisos = []

    esports, punts = [], {e["id"]: 0 for e in equips}
    for nom, (ident, categoria, formato) in ESPORTS.items():
        taula = PUNTS[categoria]
        res = resultats.get(nom, {})
        if formato == "quadre":
            partits, posicions = cuadre(
                sorteig.get(ident) or {}, res, per_clau, avisos, nom
            )
            if not sorteig.get(ident):
                avisos.append(f"{nom}: encara no hi ha sorteig publicat.")
        else:
            partits, posicions = classificacio(
                res, per_clau, avisos, nom, len(equips)
            )

        per_esport = {}
        for i, equip in enumerate(posicions):
            if equip:
                per_esport[equip] = taula[i] if i < len(taula) else 0
                punts[equip] += per_esport[equip]

        esports.append({
            "id": ident,
            "nom": nom,
            "categoria": categoria,
            "format": formato,
            "taulaPunts": taula,
            "partits": partits,
            "posicions": posicions,
            "punts": per_esport,
        })

    general = sorted(
        ({"id": e["id"], "nom": e["nom"], "punts": punts[e["id"]]} for e in equips),
        key=lambda e: (-e["punts"], e["nom"]),
    )
    for i, fila in enumerate(general):
        # Empatados a puntos comparten posición.
        fila["posicio"] = (
            general[i - 1]["posicio"]
            if i and general[i - 1]["punts"] == fila["punts"]
            else i + 1
        )

    datos = {
        "actualizado": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "nosaltres": nosaltres,
        "equips": equips,
        "esports": esports,
        "general": general,
        "avisos": avisos,
    }

    # Els resultats només poden anar a més: si en surten menys és que hem llegit
    # malament el full, i val més quedar-nos amb les dades velles que publicar zeros.
    def compta(dades):
        esp = dades.get("esports", [])
        return (
            sum(1 for e in esp for p in e["partits"] if p["estat"] == "jugat"),
            sum(1 for e in esp for p in e["posicions"] if p),
        )

    jugats, decidits = compta(datos)
    abans = compta(antiguo)
    if (jugats, decidits) < abans:
        raise SystemExit(
            f"Em surten {jugats} partits jugats i {decidits} llocs decidits, i el fitxer "
            f"ja en tenia {abans[0]} i {abans[1]}. No toco res: revisa el full."
        )

    if {k: v for k, v in antiguo.items() if k != "actualizado"} == {
        k: v for k, v in datos.items() if k != "actualizado"
    }:
        datos["actualizado"] = antiguo["actualizado"]

    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", "utf-8")

    print(
        f"{len(equips)} equips · {jugats} partits jugats · {decidits} llocs decidits · "
        f"nosaltres: {nosaltres or 'encara no se sap'}"
    )
    for a in avisos[:5]:
        print("  aviso:", a)
    if len(avisos) > 5:
        print(f"  … i {len(avisos) - 5} avisos més")


if __name__ == "__main__":
    main()
