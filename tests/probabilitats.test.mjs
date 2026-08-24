import test from "node:test";
import assert from "node:assert/strict";

import {
  analitzaRisc,
  calculaRang,
  creaAleatori,
  simulaFinal,
} from "../js/probabilitats.js";
import { torneigQuadre } from "./suport/torneig-fixture.mjs";

function torneigClassificacio(posicions) {
  const torneig = torneigQuadre();
  const esport = {
    id: "minigolf",
    nom: "Minigolf",
    format: "classificacio",
    taulaPunts: [40, 32, 29, 26, 20, 17, 14, 11, 8, 5],
    partits: [],
    posicions,
    punts: {},
  };
  return { ...torneig, esports: [esport] };
}

test("propaga un quadre i conserva els resultats publicats", () => {
  const torneig = torneigQuadre();
  const final = simulaFinal(torneig, creaAleatori(1), {
    guanyadors: {
      "petanca:qf1": "E1",
      "petanca:qf2": "E2",
      "petanca:qf3": "E3",
      "petanca:qf4": "E4",
      "petanca:sf1": "E1",
      "petanca:sf2": "E3",
      "petanca:final": "E1",
      "petanca:tercerPuesto": "E2",
      "petanca:consSf1": "E5",
      "petanca:consSf2": "E7",
      "petanca:consFinal": "E5",
      "petanca:consTercero": "E6",
      "petanca:puesto9": "E8",
    },
  });

  assert.deepEqual(
    final.esports[0].posicions,
    ["E1", "E3", "E2", "E4", "E5", "E7", "E6", "E9", "E8", "E10"]
  );
  assert.equal(
    final.esports[0].partits.find((partit) => partit.id === "previa1").guanyador,
    "E9"
  );
});

test("calcula els extrems exactes d'una classificació oberta", () => {
  const torneig = torneigClassificacio([
    "E1", null, "E3", null, null, null, null, null, null, null,
  ]);

  assert.deepEqual(calculaRang(torneig, "E6"), { minim: 5, maxim: 32 });
});

test("un empat en últim també és cullera definitiva", async () => {
  const torneig = torneigClassificacio([
    "E1", "E2", "E3", "E4", "E5", "E7", "E8", "E9", "E6", "E10",
  ]);
  torneig.esports[0].taulaPunts = [40, 32, 29, 26, 20, 17, 14, 11, 5, 5];

  const analisi = await analitzaRisc(torneig, "E6", {
    iteracions: 20,
    cedeix: async () => {},
  });

  assert.equal(analisi.risc.probabilitat, 1);
  assert.equal(analisi.risc.definitiu, true);
  assert.equal(analisi.risc.etiqueta, "100%");
});

test("la mateixa dada produeix la mateixa estimació", async () => {
  const torneig = torneigClassificacio(Array(10).fill(null));
  const opcions = { iteracions: 200, cedeix: async () => {} };

  const primera = await analitzaRisc(torneig, "E6", opcions);
  const segona = await analitzaRisc(torneig, "E6", opcions);

  assert.equal(primera.risc.probabilitat, segona.risc.probabilitat);
  assert.equal(primera.punts.esperats, segona.punts.esperats);
});

test("mostra zero només quan un rival queda sempre per sota", async () => {
  const torneig = torneigClassificacio([
    "E1", "E2", "E3", "E4", "E5", "E7", "E8", "E9", "E6", "E10",
  ]);

  const analisi = await analitzaRisc(torneig, "E6", {
    iteracions: 20,
    cedeix: async () => {},
  });

  assert.equal(analisi.risc.probabilitat, 0);
  assert.equal(analisi.risc.definitiu, true);
  assert.equal(analisi.risc.etiqueta, "0%");
});

test("una classificació oberta pot situar l'equip a qualsevol lloc", () => {
  const torneig = torneigClassificacio(Array(10).fill(null));
  const aleatori = creaAleatori(23);
  const llocs = new Set();

  for (let index = 0; index < 500; index += 1) {
    llocs.add(simulaFinal(torneig, aleatori).esports[0].posicions.indexOf("E6"));
  }

  assert.deepEqual([...llocs].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("cedeix mentre calcula els rangs exactes", async () => {
  const torneig = torneigQuadre();
  let cessions = 0;

  await analitzaRisc(torneig, "E6", {
    iteracions: 1,
    cedeix: async () => { cessions += 1; },
  });

  assert.ok(cessions > 0);
});