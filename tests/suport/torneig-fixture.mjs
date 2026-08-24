const IDS_PARTIT = [
  "previa1", "previa2", "qf1", "qf2", "qf3", "qf4", "sf1", "sf2",
  "final", "tercerPuesto", "consSf1", "consSf2", "consFinal",
  "consTercero", "puesto9",
];

export function torneigQuadre() {
  const equips = Array.from({ length: 10 }, (_, index) => ({
    id: `E${index + 1}`,
    nom: `Equip ${index + 1}`,
  }));
  const inicials = {
    previa1: ["E9", "E10"],
    previa2: ["E7", "E8"],
    qf1: ["E9", "E1"],
    qf2: ["E2", "E5"],
    qf3: ["E7", "E3"],
    qf4: ["E4", "E6"],
  };
  const publicats = { previa1: "E9", previa2: "E7" };
  const partits = IDS_PARTIT.map((id) => {
    const participants = inicials[id] || [null, null];
    const guanyador = publicats[id] || null;
    return {
      id,
      equips: participants,
      guanyador,
      perdedor: guanyador
        ? participants.find((equip) => equip !== guanyador)
        : null,
      estat: guanyador
        ? "jugat"
        : participants.every(Boolean) ? "pendent" : "bloquejat",
    };
  });

  return {
    actualizado: "2026-08-25T12:00:00Z",
    nosaltres: "E6",
    equips,
    esports: [{
      id: "petanca",
      nom: "Petanca",
      format: "quadre",
      taulaPunts: [40, 32, 29, 26, 20, 17, 14, 11, 8, 5],
      partits,
      posicions: Array(10).fill(null),
      punts: {},
    }],
    general: equips.map((equip) => ({ ...equip, punts: 0, posicio: 1 })),
  };
}