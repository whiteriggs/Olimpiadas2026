const IDS_PARTIT = [
  "previa1", "previa2", "qf1", "qf2", "qf3", "qf4", "sf1", "sf2",
  "final", "tercerPuesto", "consSf1", "consSf2", "consFinal",
  "consTercero", "puesto9",
];

const ORIGEN_POSICIONS = [
  ["final", "guanyador"],
  ["final", "perdedor"],
  ["tercerPuesto", "guanyador"],
  ["tercerPuesto", "perdedor"],
  ["consFinal", "guanyador"],
  ["consFinal", "perdedor"],
  ["consTercero", "guanyador"],
  ["consTercero", "perdedor"],
  ["puesto9", "guanyador"],
  ["puesto9", "perdedor"],
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

function participantsPartit(id, originals, resolts) {
  const guanya = (partit) => resolts.get(partit)?.guanyador || null;
  const perd = (partit) => resolts.get(partit)?.perdedor || null;
  const parella = (partit) => [...(originals.get(partit)?.equips || [null, null])];
  const rival = (partit, index) => parella(partit)[index] || null;
  const deriva = {
    previa1: () => parella("previa1"),
    previa2: () => parella("previa2"),
    qf1: () => [guanya("previa1"), rival("qf1", 1)],
    qf2: () => parella("qf2"),
    qf3: () => [guanya("previa2"), rival("qf3", 1)],
    qf4: () => parella("qf4"),
    sf1: () => [guanya("qf1"), guanya("qf2")],
    sf2: () => [guanya("qf3"), guanya("qf4")],
    final: () => [guanya("sf1"), guanya("sf2")],
    tercerPuesto: () => [perd("sf1"), perd("sf2")],
    consSf1: () => [perd("qf1"), perd("qf2")],
    consSf2: () => [perd("qf3"), perd("qf4")],
    consFinal: () => [guanya("consSf1"), guanya("consSf2")],
    consTercero: () => [perd("consSf1"), perd("consSf2")],
    puesto9: () => [perd("previa1"), perd("previa2")],
  };
  return deriva[id]();
}

function triaGuanyador(esportId, equips, aleatori, probabilitats) {
  for (const [index, equip] of equips.entries()) {
    const clau = `${esportId}:${equip}`;
    if (!Object.hasOwn(probabilitats, clau)) continue;
    return aleatori() < probabilitats[clau] ? equip : equips[1 - index];
  }
  return equips[aleatori() < 0.5 ? 0 : 1];
}

function completaQuadre(esport, aleatori, guanyadors, probabilitats = {}) {
  const originals = new Map(esport.partits.map((partit) => [partit.id, partit]));
  const resolts = new Map();

  for (const id of IDS_PARTIT) {
    const original = originals.get(id) || { id, equips: [null, null] };
    const equips = participantsPartit(id, originals, resolts);
    const clau = `${esport.id}:${id}`;
    const forcat = guanyadors[clau];
    const publicat = original.guanyador;
    const guanyador = equips.includes(publicat)
      ? publicat
      : equips.includes(forcat) ? forcat : triaGuanyador(esport.id, equips, aleatori, probabilitats);
    const perdedor = guanyador === equips[0] ? equips[1] : equips[0];
    resolts.set(id, {
      ...original,
      equips,
      guanyador,
      perdedor,
      estat: "jugat",
    });
  }

  const posicions = ORIGEN_POSICIONS.map(([id, camp]) => resolts.get(id)[camp]);
  return {
    ...esport,
    partits: IDS_PARTIT.map((id) => resolts.get(id)),
    posicions,
    punts: Object.fromEntries(posicions.map((equip, index) => [equip, esport.taulaPunts[index]])),
  };
}

function completaClassificacio(esport, equips, aleatori, llocs) {
  const posicions = [...esport.posicions];
  const ocupats = new Set(posicions.filter(Boolean));
  const lliures = equips.map((equip) => equip.id).filter((id) => !ocupats.has(id));
  const forats = posicions.map((equip, index) => equip ? null : index).filter((index) => index !== null);

  for (const equip of [...lliures]) {
    const lloc = llocs[`${esport.id}:${equip}`];
    const indexForat = forats.indexOf(lloc);
    if (indexForat < 0) continue;
    posicions[lloc] = equip;
    forats.splice(indexForat, 1);
    lliures.splice(lliures.indexOf(equip), 1);
  }
  for (let index = lliures.length - 1; index > 0; index -= 1) {
    const altre = Math.floor(aleatori() * (index + 1));
    [lliures[index], lliures[altre]] = [lliures[altre], lliures[index]];
  }
  forats.forEach((forat, index) => { posicions[forat] = lliures[index]; });

  return {
    ...esport,
    posicions,
    punts: Object.fromEntries(posicions.map((equip, index) => [equip, esport.taulaPunts[index]])),
  };
}

function completaEsport(esport, torneig, aleatori, condicions) {
  const provisionals = condicions.posicionsProvisionals?.[esport.id];
  const equipId = condicions.equipProvisional;
  const jaOficial = equipId && esport.posicions.includes(equipId);
  if (!provisionals?.length || !equipId || jaOficial) {
    return esport.format === "quadre"
      ? completaQuadre(esport, aleatori, condicions.guanyadors, condicions.probabilitats)
      : completaClassificacio(esport, torneig.equips, aleatori, condicions.llocs);
  }

  if (esport.format === "classificacio") {
    const possibles = provisionals.filter((lloc) => !esport.posicions[lloc]);
    if (!possibles.length) {
      throw new Error(`Posició provisional impossible a ${esport.nom}`);
    }
    const lloc = possibles[Math.floor(aleatori() * possibles.length)];
    return completaClassificacio(esport, torneig.equips, aleatori, {
      ...condicions.llocs,
      [`${esport.id}:${equipId}`]: lloc,
    });
  }

  for (let intent = 0; intent < 1024; intent += 1) {
    const final = completaQuadre(
      esport,
      aleatori,
      condicions.guanyadors,
      condicions.probabilitats
    );
    if (provisionals.includes(final.posicions.indexOf(equipId))) return final;
  }
  throw new Error(`Posició provisional impossible a ${esport.nom}`);
}

export function simulaFinal(torneig, aleatori, condicions = {}) {
  const completes = {
    ...condicions,
    guanyadors: condicions.guanyadors || {},
    llocs: condicions.llocs || {},
    probabilitats: condicions.probabilitats || {},
  };
  const esports = torneig.esports.map((esport) =>
    completaEsport(esport, torneig, aleatori, completes));
  const totals = Object.fromEntries(torneig.equips.map((equip) => [equip.id, 0]));
  esports.forEach((esport) => {
    Object.entries(esport.punts).forEach(([equip, punts]) => { totals[equip] += punts; });
  });
  return { ...torneig, esports, totals };
}

function rangsExactes(torneig) {
  const rangs = Object.fromEntries(torneig.equips.map((equip) => [equip.id, {
    minim: 0,
    maxim: 0,
  }]));

  for (const esport of torneig.esports) {
    const possibles = Object.fromEntries(torneig.equips.map((equip) => [equip.id, new Set()]));
    if (esport.format === "classificacio") {
      const ocupats = new Set(esport.posicions.filter(Boolean));
      const forats = esport.posicions
        .map((equip, index) => equip ? null : index)
        .filter((index) => index !== null);
      for (const equip of torneig.equips) {
        const lloc = esport.posicions.indexOf(equip.id);
        const llocs = lloc >= 0 ? [lloc] : ocupats.has(equip.id) ? [] : forats;
        llocs.forEach((index) => possibles[equip.id].add(esport.taulaPunts[index]));
      }
    } else {
      const pendents = esport.partits.filter((partit) => !partit.guanyador).length;
      const combinacions = 2 ** pendents;
      for (let mascara = 0; mascara < combinacions; mascara += 1) {
        let bit = 0;
        const aleatori = () => ((mascara >> bit++) & 1) ? 0.75 : 0.25;
        const final = completaQuadre(esport, aleatori, {});
        final.posicions.forEach((equip, index) => {
          possibles[equip].add(esport.taulaPunts[index]);
        });
      }
    }
    for (const equip of torneig.equips) {
      const punts = [...possibles[equip.id]];
      rangs[equip.id].minim += Math.min(...punts);
      rangs[equip.id].maxim += Math.max(...punts);
    }
  }
  return rangs;
}

export function calculaRang(torneig, equipId) {
  return rangsExactes(torneig)[equipId];
}

async function rangsExactesPerLots(
  torneig,
  cedeix,
  probabilitats,
  posicionsProvisionals = {},
  equipProvisional = null,
  guanyadors = {}
) {
  const rangs = Object.fromEntries(torneig.equips.map((equip) => [equip.id, {
    minim: 0,
    maxim: 0,
  }]));

  for (const esport of torneig.esports) {
    const possibles = Object.fromEntries(torneig.equips.map((equip) => [equip.id, new Set()]));
    const provisionals = posicionsProvisionals[esport.id];
    const aplicaProvisional = provisionals?.length &&
      equipProvisional && !esport.posicions.includes(equipProvisional);
    if (esport.format === "classificacio") {
      const ocupats = new Set(esport.posicions.filter(Boolean));
      const forats = esport.posicions
        .map((equip, index) => equip ? null : index)
        .filter((index) => index !== null);
      const provisionalsPossibles = aplicaProvisional
        ? provisionals.filter((lloc) => forats.includes(lloc))
        : [];
      if (aplicaProvisional && !provisionalsPossibles.length) {
        throw new Error(`Posició provisional impossible a ${esport.nom}`);
      }
      for (const equip of torneig.equips) {
        const lloc = esport.posicions.indexOf(equip.id);
        const llocs = lloc >= 0
          ? [lloc]
          : ocupats.has(equip.id) ? []
            : aplicaProvisional && equip.id === equipProvisional
              ? provisionalsPossibles
              : forats;
        llocs.forEach((index) => possibles[equip.id].add(esport.taulaPunts[index]));
      }
    } else {
      const pendents = esport.partits.filter((partit) => !partit.guanyador).length;
      const combinacions = 2 ** pendents;
      for (let mascara = 0; mascara < combinacions; mascara += 1) {
        let bit = 0;
        const aleatori = () => ((mascara >> bit++) & 1) ? 0.75 : 0.25;
        const final = completaQuadre(esport, aleatori, guanyadors, probabilitats);
        if (aplicaProvisional &&
          !provisionals.includes(final.posicions.indexOf(equipProvisional))) {
          continue;
        }
        final.posicions.forEach((equip, index) => {
          possibles[equip].add(esport.taulaPunts[index]);
        });
        if ((mascara + 1) % 512 === 0 && mascara + 1 < combinacions) await cedeix();
      }
    }
    for (const equip of torneig.equips) {
      const punts = [...possibles[equip.id]];
      if (!punts.length) {
        throw new Error(`No hi ha finals compatibles a ${esport.nom} per ${equip.id}`);
      }
      rangs[equip.id].minim += Math.min(...punts);
      rangs[equip.id].maxim += Math.max(...punts);
    }
    await cedeix();
  }
  return rangs;
}

function llavorTorneig(
  torneig,
  probabilitats = {},
  posicionsProvisionals = {},
  guanyadors = {}
) {
  const dades = JSON.stringify({
    equips: torneig.equips.map((equip) => equip.id),
    esports: torneig.esports.map((esport) => ({
      id: esport.id,
      taulaPunts: esport.taulaPunts,
      partits: esport.partits.map((partit) => [partit.id, partit.equips, partit.guanyador]),
      posicions: esport.posicions,
    })),
    probabilitats,
    posicionsProvisionals,
    guanyadors,
  });
  let hash = 2166136261;
  for (let index = 0; index < dades.length; index += 1) {
    hash ^= dades.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function etiquetaPercentatge(probabilitat, definitiu) {
  if (definitiu && probabilitat === 0) return "0%";
  if (definitiu && probabilitat === 1) return "100%";
  if (probabilitat === 0) return "<0,1%";
  if (probabilitat === 1) return ">99,9%";
  return `${(probabilitat * 100).toLocaleString("ca-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function diferenciaActual(torneig, equipId) {
  const propi = torneig.general.find((equip) => equip.id === equipId);
  if (!propi) return null;
  const rivals = torneig.general
    .filter((equip) => equip.id !== equipId && equip.punts > propi.punts)
    .sort((a, b) => a.punts - b.punts);
  if (!rivals.length) return null;
  return {
    rivalId: rivals[0].id,
    rivalNom: rivals[0].nom,
    punts: rivals[0].punts - propi.punts + 1,
  };
}

function resumSeguretat(rangs, equipId, nomEquip) {
  const propi = rangs[equipId];
  const rivals = Object.entries(rangs).filter(([id]) => id !== equipId);
  const superatSempre = rivals.find(([, rang]) => propi.minim > rang.maxim);
  if (superatSempre) {
    return {
      estat: "assolida",
      llindar: superatSempre[1].maxim + 1,
      text: `Fins i tot en el pitjor cas acabaríem per sobre de ${nomEquip(superatSempre[0])}.`,
    };
  }
  const menorMaxim = Math.min(...rivals.map(([, rang]) => rang.maxim));
  const llindar = menorMaxim + 1;
  if (propi.maxim >= llindar) {
    return {
      estat: "possible",
      llindar,
      text: `La seguretat total exigeix arribar com a mínim a ${llindar} punts; encara és possible, però també depèn dels resultats rivals.`,
    };
  }
  return {
    estat: "depen",
    llindar,
    text: "Ja no podem assegurar-ho només amb els nostres resultats: necessitem que algun rival quedi per sota.",
  };
}

export async function analitzaRisc(torneig, equipId, opcions = {}) {
  const iteracions = opcions.iteracions || 50000;
  const midaLot = opcions.midaLot || 500;
  const cedeix = opcions.cedeix || (() => new Promise((resolve) => setTimeout(resolve, 0)));
  const probabilitats = opcions.probabilitats || {};
  const posicionsProvisionals = opcions.posicionsProvisionals || {};
  const guanyadors = opcions.guanyadors || {};
  const aleatori = creaAleatori(llavorTorneig(
    torneig,
    probabilitats,
    posicionsProvisionals,
    guanyadors
  ));
  const rangs = await rangsExactesPerLots(
    torneig,
    cedeix,
    probabilitats,
    posicionsProvisionals,
    equipId,
    guanyadors
  );
  const esportsOriginals = new Map(torneig.esports.map((esport) => [esport.id, esport]));
  const originalsPerEsport = new Map(torneig.esports.map((esport) => [
    esport.id,
    new Map(esport.partits.map((partit) => [partit.id, partit])),
  ]));
  let casos = 0;
  let sumaPunts = 0;
  const impactes = new Map();
  const combinacions = new Map();
  const partitsPendents = new Map();
  let exempleSalvacio = null;
  const diferencia = diferenciaActual(torneig, equipId);
  const rivalId = diferencia?.rivalId || null;
  const nomEquip = (id) => torneig.equips.find((equip) => equip.id === id)?.nom || id;
  const ordinal = (lloc) => `${lloc}${["", "r", "n", "r", "t"][lloc] || "è"}`;

  for (let index = 0; index < iteracions; index += 1) {
    const final = simulaFinal(torneig, aleatori, {
      probabilitats,
      posicionsProvisionals,
      equipProvisional: equipId,
      guanyadors,
    });
    const punts = final.totals[equipId];
    const cullera = punts === Math.min(...Object.values(final.totals));
    if (cullera) casos += 1;
    sumaPunts += punts;
    if (!cullera && (!exempleSalvacio || punts < exempleSalvacio.puntsPropis)) {
      const [rivalSalvat] = Object.entries(final.totals)
        .filter(([id, total]) => id !== equipId && total < punts)
        .sort((a, b) => b[1] - a[1]);
      if (rivalSalvat) {
        const [idRival, puntsRival] = rivalSalvat;
        const condicions = final.esports
          .map((esportFinal, esportIndex) => {
            const esportOriginal = torneig.esports[esportIndex];
            const llocPropi = esportFinal.posicions.indexOf(equipId);
            const llocRival = esportFinal.posicions.indexOf(idRival);
            const diferenciaPunts = esportFinal.punts[equipId] - esportFinal.punts[idRival];
            const totsFixats = esportOriginal.posicions.includes(equipId) &&
              esportOriginal.posicions.includes(idRival);
            if (diferenciaPunts <= 0 || totsFixats) return null;
            return {
              esportId: esportFinal.id,
              diferenciaPunts,
              text: `${esportFinal.nom}: ${nomEquip(equipId)} ${ordinal(llocPropi + 1)} i ${nomEquip(idRival)} ${ordinal(llocRival + 1)}`,
            };
          })
          .filter(Boolean)
          .sort((a, b) => b.diferenciaPunts - a.diferenciaPunts)
          .slice(0, 4);
        exempleSalvacio = {
          rivalId: idRival,
          rivalNom: nomEquip(idRival),
          puntsPropis: punts,
          puntsRival,
          condicions,
        };
      }
    }
    const propis = [];
    const rivals = [];

    for (const esportFinal of final.esports) {
      const esportOriginal = esportsOriginals.get(esportFinal.id);
      const originals = originalsPerEsport.get(esportFinal.id);
      if (esportFinal.format === "quadre") {
        for (const partit of esportFinal.partits) {
          const original = originals.get(partit.id);
          if (original?.estat === "pendent" && original.equips.every(Boolean)) {
            const clauPartit = `${esportFinal.id}:${partit.id}`;
            const comptadorPartit = partitsPendents.get(clauPartit) || {
              esportId: esportFinal.id,
              esportNom: esportFinal.nom,
              partitId: partit.id,
              partitNom: partit.sigla || partit.nom || partit.id,
              equips: [...original.equips],
              resultats: new Map(),
            };
            const resultat = comptadorPartit.resultats.get(partit.guanyador) || {
              casos: 0,
              culleres: 0,
            };
            resultat.casos += 1;
            if (cullera) resultat.culleres += 1;
            comptadorPartit.resultats.set(partit.guanyador, resultat);
            partitsPendents.set(clauPartit, comptadorPartit);
          }
          if (original?.guanyador || partit.guanyador !== equipId) continue;
          const clau = `${esportFinal.id}:${partit.id}`;
          const comptador = impactes.get(clau) || {
            tipus: "victoria", esportId: esportFinal.id,
            text: `Guanyar ${esportFinal.nom} · ${partit.nom || partit.sigla || partit.id}`,
            casos: 0, culleres: 0,
          };
          comptador.casos += 1;
          if (cullera) comptador.culleres += 1;
          impactes.set(clau, comptador);
        }
      } else {
        const lloc = esportFinal.posicions.indexOf(equipId);
        const clau = `${esportFinal.id}:${lloc}`;
        const comptador = impactes.get(clau) || {
          tipus: "lloc", esportId: esportFinal.id,
          text: `Quedar ${lloc + 1}${lloc === 0 ? "r" : lloc === 1 ? "n" : lloc === 2 ? "r" : lloc === 3 ? "t" : "è"} a ${esportFinal.nom}`,
          casos: 0, culleres: 0,
        };
        comptador.casos += 1;
        if (cullera) comptador.culleres += 1;
        impactes.set(clau, comptador);
      }
      const llocPropi = esportFinal.posicions.indexOf(equipId);
      const llocPropiFixat = esportOriginal.posicions.includes(equipId);
      if (!llocPropiFixat && llocPropi < 5) {
        propis.push({
          clau: `lloc:${esportFinal.id}:${equipId}:${llocPropi}`,
          equipId,
          text: `${nomEquip(equipId)} queda ${ordinal(llocPropi + 1)} a ${esportFinal.nom}`,
        });
      }
      const llocRival = rivalId ? esportFinal.posicions.indexOf(rivalId) : -1;
      const llocRivalFixat = rivalId && esportOriginal.posicions.includes(rivalId);
      if (rivalId && !llocRivalFixat && llocRival >= 5) {
        rivals.push({
          clau: `lloc:${esportFinal.id}:${rivalId}:${llocRival}`,
          equipId: rivalId,
          text: `${nomEquip(rivalId)} queda ${ordinal(llocRival + 1)} a ${esportFinal.nom}`,
        });
      }
    }
    for (const propi of propis) {
      for (const rival of rivals) {
        const clau = `${propi.clau}|${rival.clau}`;
        const comptador = combinacions.get(clau) || {
          condicions: [propi, rival], casos: 0, culleres: 0,
        };
        comptador.casos += 1;
        if (cullera) comptador.culleres += 1;
        combinacions.set(clau, comptador);
      }
    }
    if ((index + 1) % midaLot === 0 && index + 1 < iteracions) await cedeix();
  }

  const probabilitatMostra = casos / iteracions;
  const rivals = Object.entries(rangs).filter(([id]) => id !== equipId);
  const segurNo = rivals.some(([, rang]) => rang.maxim < rangs[equipId].minim);
  const segurSi = rivals.every(([, rang]) => rangs[equipId].maxim <= rang.minim);
  const probabilitat = segurNo ? 0 : segurSi ? 1 : probabilitatMostra;
  const definitiu = segurNo || segurSi;
  const millores = [...impactes.values()]
    .filter((impacte) => impacte.casos > 0)
    .map((impacte) => ({
      tipus: impacte.tipus,
      esportId: impacte.esportId,
      text: impacte.text,
      probabilitat: impacte.culleres / impacte.casos,
      canvi: probabilitatMostra - impacte.culleres / impacte.casos,
    }))
    .filter((impacte) => impacte.canvi > 0.0005)
    .sort((a, b) => b.canvi - a.canvi)
    .slice(0, 3);
  const rutes = [...combinacions.values()]
    .filter((combinacio) => combinacio.casos >= Math.max(20, iteracions * 0.005))
    .map((combinacio) => {
      const probabilitat = combinacio.culleres / combinacio.casos;
      return {
        condicions: combinacio.condicions,
        risc: {
          probabilitat,
          etiqueta: etiquetaPercentatge(probabilitat, definitiu),
        },
        canvi: probabilitatMostra - probabilitat,
        frequencia: combinacio.casos / iteracions,
      };
    })
    .filter((ruta) => ruta.canvi > 0.005)
    .sort((a, b) => b.canvi - a.canvi || b.frequencia - a.frequencia)
    .slice(0, 3);
  const partits = [...partitsPendents.values()].map((partit) => ({
    esportId: partit.esportId,
    esportNom: partit.esportNom,
    partitId: partit.partitId,
    partitNom: partit.partitNom,
    equips: partit.equips,
    resultats: [...partit.resultats.entries()].map(([guanyadorId, resultat]) => {
      const probabilitat = resultat.culleres / resultat.casos;
      return {
        guanyadorId,
        guanyadorNom: nomEquip(guanyadorId),
        casos: resultat.casos,
        risc: {
          probabilitat,
          etiqueta: etiquetaPercentatge(probabilitat, definitiu),
        },
        canvi: probabilitatMostra - probabilitat,
      };
    }),
  }));

  return {
    punts: {
      minim: rangs[equipId].minim,
      esperats: Math.round(sumaPunts / iteracions),
      maxim: rangs[equipId].maxim,
    },
    risc: {
      probabilitat,
      casos,
      iteracions,
      definitiu,
      etiqueta: etiquetaPercentatge(probabilitat, definitiu),
    },
    diferencia,
    impactes: millores,
    partits,
    rutes,
    exempleSalvacio,
    seguretat: resumSeguretat(rangs, equipId, nomEquip),
  };
}