# Risc de cullera i punts possibles

## Objectiu

Afegir a la pestanya `Punts` una lectura honesta de com pot acabar Diablos:

- rang exacte de punts finals possibles;
- punts finals esperats amb un model neutral;
- probabilitat estimada de quedar últims;
- resultats propis amb més impacte;
- una via suficient per fer matemàticament impossible la cullera.

Un empat a l'última posició compta com a cullera.

## Model neutral

La simulació no intenta mesurar la força dels equips:

- cada partit pendent dona un 50% de probabilitat a cada participant;
- els resultats ja jugats no es modifiquen;
- en una classificació directa, les posicions ja publicades es conserven i els equips restants es reparteixen uniformement entre els llocs buits;
- esports diferents es consideren independents.

La interfície dirà explícitament `Estimació neutral: cada partit pendent és 50/50`.

## Motor de càlcul

El càlcul viurà en un mòdul ES pur, separat del DOM, i rebrà només `torneig.json`.

### Quadres

Es reproduiran les mateixes dependències que `scripts/importar_torneig.py`: prèvies, quarts, semifinals, final, tercer lloc, consolació i 9è/10è. Cada iteració mantindrà els guanyadors publicats, derivarà els participants bloquejats i sortejarà els partits pendents en ordre topològic. Les deu posicions sortiran dels mateixos partits que `ORIGEN_POSICIONS`.

### Classificacions directes

Es mantindran els equips que ja tenen lloc. Els altres equips s'ordenaran amb Fisher-Yates sobre els llocs buits. Això evita generar les `10!` permutacions i produeix la mateixa distribució uniforme.

### Probabilitat

Es faran 50.000 finals completes amb un generador pseudoaleatori determinista. La llavor sortirà del contingut rellevant del torneig, de manera que el percentatge no canviarà en recarregar si no ha entrat cap resultat nou.

En cada final, hi ha cullera quan els punts de Diablos són iguals al mínim de tots els equips. Això inclou l'empat en últim lloc.

El percentatge es mostrarà amb un decimal. Un zero observat a la mostra es presentarà com `<0,1%` i un cent per cent observat com `>99,9%`; només es mostrarà `0%` o `100%` quan el rang matemàtic demostri que l'altre resultat és impossible.

La simulació s'executarà per blocs asíncrons perquè no bloquegi la interacció en mòbil. La targeta mostrarà `Calculant escenaris…` fins que acabi.

### Rang exacte

El mínim i el màxim no dependran de la mostra Monte Carlo. Per cada esport s'enumeraran només els llocs encara assolibles per Diablos i se sumaran els extrems. Els punts esperats sí sortiran del model neutral.

## Recomanacions accionables

### Diferència necessària

Es compararan els punts ja assegurats de Diablos amb el rival immediat actual. Com que l'empat final també és cullera, el text expressarà quants punts més ha de sumar Diablos en els esports oberts per acabar almenys un punt per damunt d'aquest rival.

### Resultats amb més impacte

Per cada proper partit pendent on Diablos ja sigui participant, es repetirà la simulació condicionant el partit a victòria. Es mostraran com a màxim tres accions, ordenades per la reducció de risc.

Per una classificació directa oberta on Diablos encara no tingui lloc, es provaran els llocs possibles i es mostrarà el llindar de posició que més redueix el risc de manera útil.

No es mostraran recomanacions sense efecte mesurable.

### Seguretat total

Per cada rival es calcularà el seu màxim final assolible. Superar el menor d'aquests màxims garanteix que almenys un equip quedarà per sota de Diablos, passi el que passi a la resta.

La UI mostrarà:

- `La cullera ja és matemàticament impossible`, si Diablos ja supera aquest llindar;
- una via suficient basada en llocs assolibles de Diablos, si encara pot arribar-hi;
- `Encara no depèn només de nosaltres`, si ni el màxim de Diablos garanteix superar cap rival.

Aquesta és una garantia conservadora: pot haver-hi vies menys exigents que depenguin de resultats de tercers.

## Interfície

La nova targeta anirà entre el resum actual de Diablos i `Classificació general`.

Contindrà:

1. `Punts possibles`: mínim · esperats · màxim.
2. `Risc de cullera`: percentatge principal.
3. Una nota breu del model neutral.
4. `Per evitar-la`: diferència exacta i fins a tres resultats d'impacte.
5. `Seguretat total`: estat o via suficient.

No hi haurà gràfics ni controls de configuració. En acabar tots els esports, desapareixerà el llenguatge probabilístic i mostrarà el resultat matemàtic definitiu.

## Accessibilitat i presentació

El risc no es comunicarà només amb color. Percentatge, etiqueta i explicació seran text visible. El contingut funcionarà amb text ampli, mode fosc i una amplada de 320 px. `aria-live="polite"` anunciarà el resultat quan acabi el càlcul sense interrompre la navegació.

## Fitxers previstos

- `js/probabilitats.js`: simulació i anàlisi pura.
- `js/app.js`: render i coordinació asíncrona.
- `index.html`: contenidor de la targeta.
- `styles.css`: presentació responsive.
- `tests/probabilitats.test.mjs`: proves deterministes del motor.
- `sw.js`: nova versió de caché.

## Verificació

Les proves cobriran:

- propagació completa d'un quadre amb resultats jugats i pendents;
- preservació de llocs publicats en classificacions directes;
- empat en últim comptat com a cullera;
- mateix torneig i mateixa llavor produeixen el mateix resultat;
- rang mínim/màxim independent de Monte Carlo;
- estat final amb 0% o 100% sense simulació ambigua;
- llindar conservador de seguretat total.

La verificació visual es farà en mòbil, clar i fosc, amb dades actuals i amb fixtures de 0%, probabilitat intermèdia i 100%.