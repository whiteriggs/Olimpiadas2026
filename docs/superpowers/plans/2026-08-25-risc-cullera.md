# Risc de Cullera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar punts finals possibles, risc neutral de cullera i les accions pròpies que més ajuden Diablos a evitar l'últim lloc.

**Architecture:** Un mòdul ES pur reproduirà els quadres i les classificacions directes a partir de `torneig.json`, sense DOM ni dependències. `app.js` l'executarà per blocs asíncrons i renderitzarà una única targeta a `Punts`; el motor tindrà proves deterministes amb `node:test`.

**Tech Stack:** JavaScript ES modules, `node:test`, DOM vanilla, CSS, Playwright temporal per validació visual.

**Spec:** `docs/superpowers/specs/2026-08-25-risc-cullera-design.md`

## Global Constraints

- Cada partit pendent és 50/50; els resultats publicats no es modifiquen.
- Els equips restants d'una classificació directa es reparteixen uniformement entre llocs buits.
- Empatar a l'última posició compta com a cullera.
- Executar 50.000 finals amb llavor determinista i sense bloquejar el mòbil.
- Mostrar `0%` o `100%` només quan el rang matemàtic ho demostri; en mostres extremes usar `<0,1%` o `>99,9%`.
- No afegir dependències de producció ni controls de configuració.
- El risc s'ha de comunicar amb text, no només amb color.

---

### Task 1: Simulador neutral del torneig

**Files:**
- Create: `js/probabilitats.js`
- Create: `tests/probabilitats.test.mjs`
- Create: `tests/suport/torneig-fixture.mjs`

**Interfaces:**
- Consumes: objecte amb la forma de `data/torneig.json`.
- Produces: `creaAleatori(llavor)`, `simulaFinal(torneig, aleatori, condicions)`, `calculaRang(torneig, equipId)`.
- `condicions` és un objecte `{ guanyadors?: Record<string, string>, llocs?: Record<string, number> }`; les claus de partit són `${esport.id}:${partit.id}` i els llocs són índexs zero-based.

- [ ] **Step 1: Escriure fixtures i la prova fallida del quadre**

Crear `tests/suport/torneig-fixture.mjs` amb deu equips, dues prèvies publicades i la resta pendent:

```js
const idsPartit = [
  "previa1", "previa2", "qf1", "qf2", "qf3", "qf4", "sf1", "sf2",
  "final", "tercerPuesto", "consSf1", "consSf2", "consFinal",
  "consTercero", "puesto9",
];

export function torneigQuadre() {
  const equips = Array.from({ length: 10 }, (_, i) => ({
    id: `E${i + 1}`, nom: `Equip ${i + 1}`,
  }));
  const inicials = {
    previa1: ["E9", "E10"], previa2: ["E7", "E8"],
    qf1: ["E9", "E1"], qf2: ["E2", "E5"],
    qf3: ["E7", "E3"], qf4: ["E4", "E6"],
  };
  const publicats = { previa1: "E9", previa2: "E7" };
  const partits = idsPartit.map((id) => {
    const participants = inicials[id] || [null, null];
    const guanyador = publicats[id] || null;
    return {
      id, equips: participants, guanyador,
      perdedor: guanyador ? participants.find((equip) => equip !== guanyador) : null,
      estat: guanyador ? "jugat" : participants.every(Boolean) ? "pendent" : "bloquejat",
    };
  });
  return {
    actualizado: "2026-08-25T12:00:00Z", nosaltres: "E6", equips,
    esports: [{
      id: "petanca", nom: "Petanca", format: "quadre",
      taulaPunts: [40, 32, 29, 26, 20, 17, 14, 11, 8, 5],
      partits, posicions: Array(10).fill(null), punts: {},
    }],
    general: equips.map((equip) => ({ ...equip, punts: 0, posicio: 1 })),
  };
}
```

La prova ha de fixar cada guanyador pendent amb `condicions.guanyadors` i comprovar les deu posicions finals:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { creaAleatori, simulaFinal } from "../js/probabilitats.js";
import { torneigQuadre } from "./suport/torneig-fixture.mjs";

test("propaga un quadre i conserva els resultats publicats", () => {
  const final = simulaFinal(torneigQuadre(), creaAleatori(1), {
    guanyadors: {
      "petanca:qf1": "E1", "petanca:qf2": "E2",
      "petanca:qf3": "E3", "petanca:qf4": "E4",
      "petanca:sf1": "E1", "petanca:sf2": "E3",
      "petanca:final": "E1", "petanca:tercerPuesto": "E2",
      "petanca:consSf1": "E5", "petanca:consSf2": "E7",
      "petanca:consFinal": "E5", "petanca:consTercero": "E6",
      "petanca:puesto9": "E8",
    },
  });
  assert.deepEqual(final.esports[0].posicions,
    ["E1", "E3", "E2", "E4", "E5", "E7", "E6", "E9", "E8", "E10"]);
  assert.equal(final.esports[0].partits.find((p) => p.id === "previa1").guanyador,
    torneigQuadre().esports[0].partits.find((p) => p.id === "previa1").guanyador);
});
```

- [ ] **Step 2: Executar la prova i confirmar el vermell**

Run: `node --test tests/probabilitats.test.mjs`

Expected: FAIL perquè `js/probabilitats.js` no existeix.

- [ ] **Step 3: Implementar PRNG i propagació mínima**

A `js/probabilitats.js`, definir l'ordre dels quinze partits, les dependències i l'origen dels llocs. Clonar només les estructures que es muten. Per cada partit: conservar el guanyador publicat, derivar participants, aplicar guanyador forçat si és vàlid i, en cas contrari, triar 50/50.

```js
const ORIGEN_POSICIONS = [
  ["final", "guanyador"], ["final", "perdedor"],
  ["tercerPuesto", "guanyador"], ["tercerPuesto", "perdedor"],
  ["consFinal", "guanyador"], ["consFinal", "perdedor"],
  ["consTercero", "guanyador"], ["consTercero", "perdedor"],
  ["puesto9", "guanyador"], ["puesto9", "perdedor"],
];

export function creaAleatori(llavor) {
  let estat = llavor >>> 0;
  return () => {
    estat = (estat + 0x6d2b79f5) | 0;
    let valor = Math.imul(estat ^ (estat >>> 15), 1 | estat);
    valor ^= valor + Math.imul(valor ^ (valor >>> 7), 61 | valor);
    return ((valor ^ (valor >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Executar la prova del quadre**

Run: `node --test tests/probabilitats.test.mjs`

Expected: PASS.

- [ ] **Step 5: Escriure la prova fallida de classificació directa**

Afegir un esport amb `posicions: ["E1", null, "E3", null, null, null, null, null, null, null]`. Forçar `E6` al lloc 5 amb `condicions.llocs` i comprovar que E1/E3 no es mouen, E6 ocupa l'índex 4 i no hi ha duplicats.

- [ ] **Step 6: Implementar classificació directa uniforme**

Construir `lliures` amb els equips absents i `forats` amb índexs buits; aplicar el lloc forçat si és lliure i barrejar la resta amb Fisher-Yates usant `aleatori`.

- [ ] **Step 7: Escriure la prova fallida del rang exacte**

Comprovar que `calculaRang(fixture, "E6")` suma els punts ja decidits i els extrems dels llocs assolibles, sense dependre de cap llavor.

- [ ] **Step 8: Implementar `calculaRang`**

Per quadres, enumerar totes les terminacions pendents de cada esport i recollir els punts diferents assolibles per E6. Per classificacions directes, usar el lloc publicat o tots els forats. Retornar:

```js
{
  minim: Number,
  maxim: Number,
  perEsport: [{ esportId: String, punts: Number[], vies: Map }],
}
```

- [ ] **Step 9: Executar totes les proves i fer commit**

Run: `node --test tests/probabilitats.test.mjs && node --check js/probabilitats.js`

Expected: totes PASS, exit 0.

```bash
git add js/probabilitats.js tests/
git commit -m "Simula els finals possibles del torneig"
```

---

### Task 2: Anàlisi de risc, impactes i seguretat

**Files:**
- Modify: `js/probabilitats.js`
- Modify: `tests/probabilitats.test.mjs`

**Interfaces:**
- Consumes: `simulaFinal`, `calculaRang` de Task 1.
- Produces: `analitzaRisc(torneig, equipId, opcions) -> Promise<AnalisiRisc>`.
- `opcions`: `{ iteracions?: 50000, midaLot?: 500, cedeix?: () => Promise<void> }`.
- `AnalisiRisc`:

```js
{
  punts: { minim, esperats, maxim },
  risc: { probabilitat, casos, iteracions, definitiu, etiqueta },
  diferencia: { rivalId, rivalNom, punts },
  impactes: [{ tipus, esportId, text, probabilitat, canvi }],
  seguretat: { estat: "assolida" | "possible" | "depen", llindar, text },
}
```

- [ ] **Step 1: Escriure proves fallides de cullera i determinisme**

Crear fixtures finals de tres equips: E6 últim sol, E6 empatat últim i E6 per sobre. Comprovar que els dos primers compten i que dues anàlisis del mateix input retornen exactament la mateixa probabilitat.

```js
test("un empat en últim també és cullera", async () => {
  const analisi = await analitzaRisc(torneigFinalEmpatat(), "E6", { iteracions: 20 });
  assert.equal(analisi.risc.probabilitat, 1);
  assert.equal(analisi.risc.definitiu, true);
  assert.equal(analisi.risc.etiqueta, "100%");
});
```

- [ ] **Step 2: Implementar llavor estable, lots i agregació**

Serialitzar només equips, taules, participants, guanyadors i posicions; calcular hash FNV-1a de 32 bits. Executar `midaLot` simulacions i fer `await cedeix()` entre lots. Per defecte, `cedeix` usa `setTimeout(resolve, 0)`.

Acumular totals de tots els equips, casos on `puntsE6 === Math.min(...totals)` i mitjana d'E6. Formatar `etiqueta` amb coma decimal i les regles `<0,1%` / `>99,9%`.

- [ ] **Step 3: Executar proves de risc**

Run: `node --test tests/probabilitats.test.mjs`

Expected: PASS.

- [ ] **Step 4: Escriure prova fallida de diferència necessària**

Amb E6 últim a 120 i E5 a 133, comprovar `{ rivalId: "E5", punts: 14 }`. Si E6 no és últim, `diferencia` ha de ser `null`.

- [ ] **Step 5: Implementar diferència i impactes**

Trobar el rival amb menys punts per damunt d'E6. Durant la mostra base, acumular per cada proper partit pendent d'E6 els casos on guanya i quants d'aquests acaben en cullera; això dona `P(cullera | victòria)` sense repetir 50.000 finals. Fer el mateix per cada lloc lliure d'E6 en classificacions directes. Calcular `canvi = riscBase - riscCondicionat`, ordenar descendent i limitar a tres impactes amb `canvi > 0`.

- [ ] **Step 6: Escriure prova fallida de seguretat conservadora**

En un fixture petit, comprovar els tres estats:

- `assolida`: mínim E6 > màxim d'algun rival;
- `possible`: màxim E6 > menor màxim rival;
- `depen`: màxim E6 no supera cap màxim rival.

- [ ] **Step 7: Implementar seguretat i via suficient**

Calcular el màxim exacte de cada rival amb `calculaRang`. El llindar és `Math.min(...maximsRivals) + 1`. Usar programació dinàmica sobre `perEsport` d'E6 per trobar una combinació assolible amb puntuació mínima igual o superior al llindar; conservar la via amb menys condicions i després menys punts sobrants. Generar text català a partir de llocs o victòries registrades a `vies`.

- [ ] **Step 8: Executar suite i fer commit**

Run: `node --test tests/probabilitats.test.mjs && node --check js/probabilitats.js`

Expected: totes PASS.

```bash
git add js/probabilitats.js tests/probabilitats.test.mjs
git commit -m "Calcula el risc neutral de cullera"
```

---

### Task 3: Targeta de Punts

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `analitzaRisc(torneig, nosaltres())` de Task 2.
- Produces: `pintarRiscCullera()` i contingut dins `#riscCullera`.

- [ ] **Step 1: Escriure una prova Playwright temporal que falli**

Crear `/tmp/wktest/cullera.mjs`, bloquejar service workers, interceptar Apps Script i congelar el rellotge. Obrir `Punts` i comprovar:

```js
await expect(page.locator("#riscCullera")).toBeVisible();
await expect(page.locator("#riscCullera")).toContainText("Risc de cullera");
await expect(page.locator("#riscCullera")).toContainText("Estimació neutral");
await expect(page.locator("#riscCullera")).toContainText(/%/);
```

Run: `node /tmp/wktest/cullera.mjs`

Expected: FAIL perquè `#riscCullera` no existeix.

- [ ] **Step 2: Afegir contenidor i import**

A `index.html`, entre `#nostreEstat` i `Classificació general`:

```html
<section class="tarjeta risc-cullera" id="riscCullera" aria-live="polite" hidden>
  <h2>Possibles finals</h2>
  <div id="riscCulleraCos"></div>
</section>
```

A l'inici d'`app.js`:

```js
import { analitzaRisc } from "./probabilitats.js";
```

- [ ] **Step 3: Implementar estat de càrrega i render**

Evitar recomputacions amb una clau basada en `torneig.actualizado`; ignorar resultats antics si entra una recàrrega mentre calcula. Mostrar `Calculant escenaris…`, després construir nodes amb `el()`:

- fila `Mínim · Esperats · Màxim`;
- percentatge i text `Risc de cullera`;
- `Estimació neutral: cada partit pendent és 50/50`;
- diferència necessària;
- llista de fins a tres impactes;
- text de seguretat total.

Quan tots els esports tinguin deu posicions, mostrar només punts finals i `0%` o `100%` definitiu.

Cridar `pintarRiscCullera()` des de `pintarPunts()` després de validar `torneig` i `nosaltres()`.

- [ ] **Step 4: Estilar sense dependre del color**

Afegir CSS amb una graella de tres valors, percentatge de mida continguda, separadors i text que pugui partir. A 320 px, usar una sola columna per les explicacions. El color pot reforçar el risc però l'etiqueta sempre queda visible.

- [ ] **Step 5: Executar Playwright i comprovacions estàtiques**

Run:

```bash
node /tmp/wktest/cullera.mjs
node --check js/app.js
node --check js/probabilitats.js
git diff --check
```

Expected: PASS i cap error.

- [ ] **Step 6: Fer commit**

```bash
git add index.html js/app.js styles.css
git commit -m "Mostra els finals possibles i el risc de cullera"
```

---

### Task 4: Validació de rendiment, escenaris i PWA

**Files:**
- Modify: `sw.js`
- Modify: `/tmp/wktest/cullera.mjs` (temporal, no commit)

**Interfaces:**
- Consumes: feature completa de Tasks 1-3.
- Produces: PWA v41 amb `js/probabilitats.js` precached i evidència visual/funcional.

- [ ] **Step 1: Mesurar les 50.000 iteracions en mòbil**

Fer que Playwright registri des de `Calculant escenaris…` fins al percentatge. Criteri: menys de 3 segons en WebKit local i cap tasca contínua superior a 100 ms; verificar que un clic de pestanya respon mentre calcula.

Si supera el límit, mantenir 50.000 iteracions però reduir `midaLot` fins que cada bloc quedi per sota de 100 ms.

- [ ] **Step 2: Validar tres fixtures de risc**

Interceptar `data/torneig.json` amb fixtures de:

- resultat definitiu 0%;
- probabilitat intermèdia;
- resultat definitiu 100% per empat en últim.

Comprovar text, absència de fals `0%/100%` en el cas intermedi i recomanacions presents només quan tenen efecte.

- [ ] **Step 3: Captures responsive**

Capturar clar i fosc a 320×700, 390×844 i 1280×800. Comprovar visualment que no hi ha solapaments, text tallat ni dependència exclusiva del color.

- [ ] **Step 4: Actualitzar service worker**

Canviar `olimpiades2026-v40` a `olimpiades2026-v41` i afegir `./js/probabilitats.js` a `BASE`.

- [ ] **Step 5: Verificació completa final**

Run:

```bash
node --test tests/probabilitats.test.mjs
node --check js/app.js
node --check js/probabilitats.js
git diff --check
git status --short
```

Expected: proves PASS, checks exit 0 i només `sw.js` pendent d'aquest task.

- [ ] **Step 6: Commit i publicació**

```bash
git add sw.js
git commit -m "Actualitza la cache del calcul de cullera"
git pull --rebase origin main
git push origin main
```

Verificar que `git status --short --branch` mostra `main...origin/main` sense canvis.
