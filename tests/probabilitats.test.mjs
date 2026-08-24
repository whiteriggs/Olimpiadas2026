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

test("una probabilitat zero fa perdre tots els partits pendents de futbol sala", () => {
  const torneig = torneigQuadre();
  torneig.esports[0].id = "futbol-sala";
  torneig.esports[0].nom = "Futbol sala";

  const final = simulaFinal(torneig, creaAleatori(7), {
    probabilitats: { "futbol-sala:E6": 0 },
  });

  assert.equal(final.esports[0].posicions.indexOf("E6"), 7);
  assert.equal(final.esports[0].punts.E6, 11);
});

test("el rang exacte també respecta el zero per cent de futbol sala", async () => {
  const torneig = torneigQuadre();
  torneig.esports[0].id = "futbol-sala";
  torneig.esports[0].nom = "Futbol sala";

  const analisi = await analitzaRisc(torneig, "E6", {
    iteracions: 20,
    cedeix: async () => {},
    probabilitats: { "futbol-sala:E6": 0 },
  });

  assert.deepEqual(
    { minim: analisi.punts.minim, maxim: analisi.punts.maxim },
    { minim: 11, maxim: 11 }
  );
});

test("proposa rutes que combinen un resultat propi i un del rival immediat", async () => {
  const torneig = torneigClassificacio(Array(10).fill(null));
  torneig.esports.push({
    ...structuredClone(torneig.esports[0]),
    id: "atletismo",
    nom: "Atletisme",
  });
  torneig.equips.find((equip) => equip.id === "E5").nom = "Yayo Vallecano";
  torneig.general = torneig.equips.map((equip) => ({
    ...equip,
    punts: equip.id === "E5" ? 1 : equip.id === "E6" ? 0 : 10,
    posicio: equip.id === "E6" ? 10 : equip.id === "E5" ? 9 : 1,
  }));

  const analisi = await analitzaRisc(torneig, "E6", {
    iteracions: 5000,
    cedeix: async () => {},
  });

  assert.ok(analisi.rutes.length > 0);
  assert.ok(analisi.rutes.every((ruta) =>
    ruta.condicions.some((condicio) => condicio.equipId === "E6") &&
    ruta.condicions.some((condicio) => condicio.equipId === "E5")
  ));
  assert.ok(analisi.exempleSalvacio);
  assert.ok(analisi.exempleSalvacio.puntsPropis > analisi.exempleSalvacio.puntsRival);
  assert.ok(analisi.exempleSalvacio.condicions.length > 0);
});

test("limita cada esport a les posicions provisionals de Diablos", async () => {
  const torneig = torneigQuadre();
  const provisionals = { petanca: [4, 5] };
  const aleatori = creaAleatori(91);
  const llocs = new Set();

  for (let index = 0; index < 100; index += 1) {
    const final = simulaFinal(torneig, aleatori, {
      posicionsProvisionals: provisionals,
      equipProvisional: "E6",
    });
    llocs.add(final.esports[0].posicions.indexOf("E6"));
  }

  assert.deepEqual([...llocs].sort(), [4, 5]);

  const analisi = await analitzaRisc(torneig, "E6", {
    iteracions: 100,
    cedeix: async () => {},
    posicionsProvisionals: provisionals,
  });
  assert.deepEqual(
    { minim: analisi.punts.minim, maxim: analisi.punts.maxim },
    { minim: 17, maxim: 20 }
  );
});

test("compara el risc dels dos guanyadors de cada partit pendent", async () => {
  const torneig = torneigQuadre();
  const analisi = await analitzaRisc(torneig, "E6", {
    iteracions: 5000,
    cedeix: async () => {},
  });
  const quarts = analisi.partits.find((partit) =>
    partit.esportId === "petanca" && partit.partitId === "qf4"
  );

  assert.deepEqual(quarts.equips.sort(), ["E4", "E6"]);
  assert.equal(quarts.resultats.length, 2);
  assert.ok(quarts.resultats.every((resultat) =>
    resultat.guanyadorId && typeof resultat.risc.probabilitat === "number"
  ));
});

test("els partits mostren cent per cent quan la cullera és definitiva", async () => {
  const torneig = torneigQuadre();
  torneig.esports[0].taulaPunts = Array(10).fill(5);
  const analisi = await analitzaRisc(torneig, "E6", {
    iteracions: 100,
    cedeix: async () => {},
  });

  assert.equal(analisi.risc.definitiu, true);
  assert.ok(analisi.partits.every((partit) =>
    partit.resultats.every((resultat) => resultat.risc.etiqueta === "100%")
  ));
});

test("una posició oficial substitueix la provisional", async () => {
  const torneig = torneigClassificacio([
    "E6", null, null, null, null, null, null, null, null, null,
  ]);
  const analisi = await analitzaRisc(torneig, "E6", {
    iteracions: 20,
    cedeix: async () => {},
    posicionsProvisionals: { minigolf: [9] },
  });

  assert.deepEqual(
    { minim: analisi.punts.minim, maxim: analisi.punts.maxim },
    { minim: 40, maxim: 40 }
  );
});

test("rebutja una posició provisional ocupada per un altre equip", async () => {
  const torneig = torneigClassificacio([
    "E1", null, null, null, null, null, null, null, null, null,
  ]);

  await assert.rejects(
    analitzaRisc(torneig, "E6", {
      iteracions: 20,
      cedeix: async () => {},
      posicionsProvisionals: { minigolf: [0] },
    }),
    /provisional impossible/i
  );
});