import * as store from "./store.js";

const $ = (sel) => document.querySelector(sel);

const EQUIP = "Diablos";

const ESTATS = [
  { valor: "si", texto: "Sí" },
  { valor: "quizas", texto: "Potser" },
  { valor: "no", texto: "No" },
];

const fmtDia = new Intl.DateTimeFormat("ca-ES", {
  weekday: "long", day: "numeric", month: "long",
});
const fmtCorto = new Intl.DateTimeFormat("ca-ES", { weekday: "short", day: "numeric" });
const fmtHora = new Intl.DateTimeFormat("ca-ES", { hour: "2-digit", minute: "2-digit" });

const aFecha = (iso) => new Date(iso + "T12:00:00");

/** Ordinals en català: 1r, 2n, 3r, 4t i d'aquí en amunt è. */
const ordinal = (n) => n + (["", "r", "n", "r", "t"][n] || "è");

// La pestanya nova de l'organització anòmena diferent alguns esports.
const ALIES = {
  "Vòlei": "Voleibol pista",
  "Vòlei platja": "Voleibol platja",
  Cros: "Atletisme",
};
const canonic = (nom) => ALIES[nom] || nom;

let cal = { pruebas: [], lligues: [], limites: [], avisos: [] };
let torneig = null;
let personas = [];
let yo = null;
let fechas = [];
let esports = [];
let esportsPerDia = new Map();
const pastillasPorDia = new Map();
let canvisSenseDesar = false;

/* ---------- utilitats DOM ---------- */

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined) n.textContent = texto;
  return n;
}

function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

function aviso(texto, tipus) {
  const n = $("#aviso");
  n.textContent = texto;
  n.className = tipus ? "aviso " + tipus : "aviso";
  n.hidden = !texto;
}

function marcarCanvis(hiHaCanvis) {
  canvisSenseDesar = hiHaCanvis;
  const estado = $("#estadoGuardado");
  if (hiHaCanvis) {
    estado.textContent = "Tens canvis sense desar.";
    estado.className = "estado pendent";
  }
}

/* ---------- estat ---------- */

function personaVacia() {
  return {
    id: store.nuevoId(),
    nombre: "",
    esports: [],
    disponibilidad: {},
    comentario: "",
    actualizado: "",
  };
}

function apuntadosA(esport) {
  return personas.filter((p) => (p.esports || []).includes(esport));
}

function dispoDe(persona, fecha) {
  return (persona.disponibilidad || {})[fecha] || "";
}

/* ---------- torneig ---------- */

const nosaltres = () => (torneig && torneig.nosaltres) || null;

function nomEquip(id) {
  if (!id) return null;
  const equip = (torneig.equips || []).find((e) => e.id === id);
  return equip ? equip.nom : id;
}

function esportDe(idEsport) {
  return torneig ? (torneig.esports || []).find((e) => e.id === idEsport) : null;
}

/** Els partits del quadre que es juguen en aquesta franja del calendari. */
function partitsDe(p) {
  const esport = esportDe(p.esportId);
  if (!esport || !p.partits.length) return [];
  return esport.partits.filter((x) => p.partits.includes(x.id));
}

/**
 * Si hi juguem nosaltres: true, false, o null quan encara depèn d'una ronda anterior.
 * Les proves sense quadre (natació, atletisme…) hi anem tots.
 */
function hiJuguem(p) {
  const jo = nosaltres();
  if (!jo || p.tipo !== "esport") return null;
  const partits = partitsDe(p);
  if (!partits.length) return p.partits.length ? null : true;
  if (partits.some((x) => x.equips.includes(jo))) return true;
  return partits.every((x) => x.estat !== "bloquejat") ? false : null;
}

function rivalNostre(partit) {
  const jo = nosaltres();
  return nomEquip(partit.equips.find((e) => e && e !== jo));
}

function quiPotVenir(p) {
  const gent = apuntadosA(p.esport);
  return { poden: gent.filter((x) => dispoDe(x, p.fecha) === "si").length, total: gent.length };
}

/* ---------- calendari ---------- */

function pintarCalendario() {
  const cont = $("#listaCalendario");
  vaciar(cont);

  const dia = $("#filtroDia").value;
  const esport = $("#filtroDeporte").value;
  const soloMios = $("#filtroMios").checked;
  const mios = new Set((yo && yo.esports) || []);

  const visibles = cal.pruebas.filter((p) => {
    if (dia && p.fecha !== dia) return false;
    if (esport && p.esport !== esport) return false;
    if (soloMios && !mios.has(p.esport)) return false;
    return true;
  });

  if (!visibles.length) {
    cont.appendChild(el("p", "vacio", "No hi ha proves amb aquests filtres."));
    return;
  }

  for (const fecha of fechas) {
    const delDia = visibles.filter((p) => p.fecha === fecha);
    const limitsDelDia = (cal.limites || []).filter((l) => {
      if (l.fecha !== fecha) return false;
      if (esport && !l.esports.includes(esport)) return false;
      if (soloMios && !l.esports.some((e) => mios.has(e))) return false;
      return true;
    });
    if (!delDia.length && !limitsDelDia.length) continue;

    const bloque = el("section", "dia");
    bloque.appendChild(el("h3", null, fmtDia.format(aFecha(fecha))));

    for (const lim of limitsDelDia) {
      const caja = el("div", "limit");
      caja.appendChild(el("strong", null, "Data límit: " + lim.rondes.join(", ")));
      caja.appendChild(el("span", null, lim.esports.join(" · ")));
      bloque.appendChild(caja);
    }

    const lista = el("div", "eventos");
    for (const p of delDia) lista.appendChild(tarjetaEvento(p, mios));
    bloque.appendChild(lista);
    cont.appendChild(bloque);
  }
}

function tarjetaEvento(p, mios) {
  const juguem = hiJuguem(p);
  const art = el(
    "article",
    "evento" + (mios.has(p.esport) ? " apuntado" : "") + (juguem ? " nostre" : "")
  );
  art.appendChild(el("div", "hora", p.hora));

  const cuerpo = el("div", "cuerpo");
  cuerpo.appendChild(el("div", "deporte", p.esport));
  if (p.detalle) cuerpo.appendChild(el("div", "ronda", p.detalle));
  cuerpo.appendChild(
    el("div", "meta", [p.lloc, [p.hora, p.horaFin].filter(Boolean).join("–")]
      .filter(Boolean)
      .join(" · "))
  );
  if (p.nota) cuerpo.appendChild(el("div", "nota", p.nota));

  const partits = partitsDe(p);
  if (partits.length) {
    for (const partit of partits) cuerpo.appendChild(liniaPartit(partit));
  } else {
    for (const linea of (p.quiJuga || "").split("\n").filter(Boolean)) {
      cuerpo.appendChild(el("div", "rival", linea));
    }
  }

  const gente = apuntadosA(p.esport);
  if (gente.length) {
    const fila = el("div", "apuntados");
    for (const persona of gente) {
      const estado = dispoDe(persona, p.fecha);
      const clase =
        estado === "si" ? "pastilla ok"
        : estado === "no" ? "pastilla falta"
        : estado === "quizas" ? "pastilla quizas"
        : "pastilla";
      fila.appendChild(el("span", clase, persona.nombre));
    }
    cuerpo.appendChild(fila);
  } else if (p.tipo === "esport") {
    cuerpo.appendChild(el("div", "apuntados vacio", "Ningú apuntat encara"));
  }

  art.appendChild(cuerpo);
  return art;
}

function liniaPartit(partit) {
  const jo = nosaltres();
  const nostre = jo && partit.equips.includes(jo);
  const fila = el("div", "rival" + (nostre ? " nostre" : ""));
  fila.appendChild(el("span", "sigla", partit.sigla));

  const [a, b] = partit.equips;
  const enfront = a && b ? `${nomEquip(a)} – ${nomEquip(b)}` : "pendent de la ronda anterior";
  fila.appendChild(el("span", null, enfront));

  if (partit.guanyador) {
    const guanyem = partit.guanyador === jo;
    const marcador = partit.marcador ? ` ${partit.marcador}` : "";
    fila.appendChild(
      el(
        "span",
        "resultat " + (jo ? (guanyem ? "ok" : "falta") : ""),
        (jo ? (guanyem ? "Guanyem" : "Perdem") : nomEquip(partit.guanyador)) + marcador
      )
    );
  }
  return fila;
}

/** Targeta de dalt: el pròxim compromís nostre, amb qui hi pot anar. */
function pintarSeguent() {
  const caja = $("#seguent");
  vaciar(caja);
  caja.hidden = true;
  if (!nosaltres()) return;

  const ara = new Date();
  const proxima = cal.pruebas
    .filter((p) => p.tipo === "esport" && hiJuguem(p) !== false)
    .map((p) => ({ p, quan: new Date(`${p.fecha}T${p.hora || "09:00"}:00`) }))
    .filter((x) => x.quan > ara)
    .sort((a, b) => a.quan - b.quan)[0];
  if (!proxima) return;

  const { p } = proxima;
  const meus = partitsDe(p).filter((x) => x.equips.includes(nosaltres()));
  const gent = quiPotVenir(p);

  caja.hidden = false;
  caja.appendChild(el("span", "seguent-etiqueta", "El pròxim nostre"));
  caja.appendChild(el("strong", null, p.esport));
  caja.appendChild(
    el("span", "seguent-quan", `${fmtCorto.format(aFecha(p.fecha))} · ${p.hora} · ${p.lloc}`)
  );
  for (const partit of meus) {
    const rival = rivalNostre(partit);
    caja.appendChild(el("span", "seguent-rival", `${partit.nom}: contra ${rival || "?"}`));
  }
  caja.appendChild(
    el(
      "span",
      "seguent-gent",
      gent.total
        ? `Hi poden anar ${gent.poden} dels ${gent.total} apuntats.`
        : "Encara no s'hi ha apuntat ningú."
    )
  );
}

/* ---------- punts ---------- */

function pintarPunts() {
  const estat = $("#nostreEstat");
  vaciar(estat);
  const tabla = $("#classificacio");
  vaciar(tabla);
  const pas = $("#nostrePas");
  vaciar(pas);

  if (!torneig) {
    estat.appendChild(el("p", "vacio", "Encara no hi ha dades del torneig."));
    return;
  }

  const jo = nosaltres();
  const meu = jo && torneig.general.find((e) => e.id === jo);
  if (meu) {
    const caja = el("div", "tarjeta destacada");
    caja.appendChild(el("span", "seguent-etiqueta", "Diablos"));
    caja.appendChild(el("strong", "gran", `${ordinal(meu.posicio)} · ${meu.punts} punts`));
    const lider = torneig.general[0];
    caja.appendChild(
      el(
        "span",
        "meta",
        meu.posicio === 1
          ? "Anem primers."
          : `A ${lider.punts - meu.punts} punts del primer (${lider.nom}).`
      )
    );
    estat.appendChild(caja);
  } else {
    estat.appendChild(
      el("p", "aviso", "Encara no sé quin equip som: falta que l'organització posi els noms del sorteig.")
    );
  }

  const cap = tabla.createTHead().insertRow();
  for (const t of ["#", "Equip", "Punts"]) cap.appendChild(el("th", null, t));
  const cos = tabla.createTBody();
  for (const e of torneig.general) {
    const fila = cos.insertRow();
    if (e.id === jo) fila.className = "meu";
    fila.appendChild(el("td", null, String(e.posicio)));
    fila.appendChild(el("td", null, e.nom));
    fila.appendChild(el("td", null, String(e.punts)));
  }

  if (!jo) return;
  for (const esport of torneig.esports) {
    const fila = el("button", "resumen-fila clicable");
    fila.type = "button";
    fila.appendChild(el("strong", null, esport.nom));
    fila.appendChild(el("span", "meta", resumEsport(esport, jo)));
    fila.addEventListener("click", () => obrirQuadre(esport.id));
    pas.appendChild(fila);
  }
}

/* ---------- quadres ---------- */

const RONDES = [
  ["Prèvies", ["previa1", "previa2"]],
  ["Quarts", ["qf1", "qf2", "qf3", "qf4"]],
  ["Semifinals", ["sf1", "sf2"]],
  ["Final", ["final", "tercerPuesto"]],
  ["Consolació", ["consSf1", "consSf2", "consFinal", "consTercero", "puesto9"]],
];

/** Com va l'esport: acabat, en joc o encara sense començar. */
function estatEsport(esport) {
  if (esport.posicions.some(Boolean)) {
    return esport.posicions.every(Boolean) ? "acabat" : "jugant";
  }
  return esport.partits.some((p) => p.estat === "jugat") ? "jugant" : "pendent";
}

function pintarGraella() {
  const caja = $("#graella");
  vaciar(caja);
  if (!torneig) return;

  for (const esport of torneig.esports) {
    const estat = estatEsport(esport);
    const boto = el("button", `xip-esport ${estat}`);
    boto.type = "button";
    boto.appendChild(el("span", "xip-nom", esport.nom));
    boto.appendChild(
      el("span", "xip-estat", estat === "acabat" ? "Acabat" : estat === "jugant" ? "En joc" : "Pendent")
    );
    boto.addEventListener("click", () => obrirQuadre(esport.id));
    caja.appendChild(boto);
  }
}

function obrirQuadre(idEsport) {
  const esport = esportDe(idEsport);
  if (!esport) return;
  $("#quadreTitol").textContent = esport.nom;
  const cos = $("#quadreCos");
  vaciar(cos);

  const meta = el("p", "ayuda", `Punts per lloc: ${esport.taulaPunts.join(" · ")}`);
  cos.appendChild(meta);

  if (esport.format === "quadre") {
    const perId = new Map(esport.partits.map((p) => [p.id, p]));
    for (const [titol, ids] of RONDES) {
      const partits = ids.map((id) => perId.get(id)).filter(Boolean);
      if (!partits.length) continue;
      const bloc = el("div", "ronda-bloc");
      bloc.appendChild(el("h3", null, titol));
      for (const partit of partits) bloc.appendChild(filaQuadre(partit));
      cos.appendChild(bloc);
    }
  }

  const decidides = esport.posicions.filter(Boolean).length;
  if (decidides) {
    const bloc = el("div", "ronda-bloc");
    bloc.appendChild(el("h3", null, "Classificació"));
    esport.posicions.forEach((idEquip, i) => {
      if (!idEquip) return;
      const fila = el("div", "lloc" + (idEquip === nosaltres() ? " nostre" : ""));
      fila.appendChild(el("span", "sigla", ordinal(i + 1)));
      fila.appendChild(el("span", null, nomEquip(idEquip)));
      fila.appendChild(el("span", "punts-lloc", `${esport.taulaPunts[i]} p`));
      bloc.appendChild(fila);
    });
    cos.appendChild(bloc);
  } else if (esport.format !== "quadre") {
    cos.appendChild(el("p", "vacio", "Encara no hi ha resultats."));
  }

  $("#quadre").showModal();
}

function filaQuadre(partit) {
  const jo = nosaltres();
  const fila = el("div", "partit" + (jo && partit.equips.includes(jo) ? " nostre" : ""));
  fila.appendChild(el("span", "sigla", partit.sigla));

  const centre = el("div", "partit-equips");
  for (const idEquip of partit.equips) {
    const linia = el(
      "span",
      "partit-equip" +
        (idEquip && idEquip === partit.guanyador ? " guanya" : "") +
        (idEquip && idEquip === jo ? " jo" : "")
    );
    linia.textContent = idEquip ? nomEquip(idEquip) : "—";
    centre.appendChild(linia);
  }
  fila.appendChild(centre);

  if (partit.marcador) fila.appendChild(el("span", "partit-marcador", partit.marcador));
  else if (partit.estat === "bloquejat") fila.appendChild(el("span", "partit-marcador buit", "…"));
  return fila;
}

function resumEsport(esport, jo) {
  const lloc = esport.posicions.indexOf(jo);
  if (lloc >= 0) {
    return `Acabat: ${ordinal(lloc + 1)} lloc · ${esport.taulaPunts[lloc]} punts.`;
  }
  if (esport.format !== "quadre") return "Pendent de disputar-se.";

  const seguent = esport.partits.find(
    (p) => p.estat === "pendent" && p.equips.includes(jo)
  );
  if (seguent) {
    const punts = esport.taulaPunts[PITJOR_SI_GUANYA[seguent.id]];
    return `${seguent.nom} contra ${rivalNostre(seguent)}. Si guanyem, mínim ${punts} punts.`;
  }
  const ultim = [...esport.partits].reverse().find((p) => p.equips.includes(jo));
  if (ultim && ultim.estat === "jugat") return `Esperem rival després de ${ultim.nom}.`;
  const bloquejat = esport.partits.find(
    (p) => p.estat === "bloquejat" && p.equips.includes(jo)
  );
  if (bloquejat) return `${bloquejat.nom}: esperem rival de la ronda anterior.`;
  return "Pendent de rondes anteriors.";
}

/** Pitjor lloc (índex) que ja no pots baixar si guanyes aquest partit. */
const PITJOR_SI_GUANYA = {
  previa1: 7, previa2: 7,
  qf1: 3, qf2: 3, qf3: 3, qf4: 3,
  sf1: 1, sf2: 1,
  final: 0, tercerPuesto: 2,
  consSf1: 5, consSf2: 5,
  consFinal: 4, consTercero: 6, puesto9: 8,
};

/* ---------- apuntar-se ---------- */

function pintarFormulario() {
  $("#nombre").value = yo.nombre;
  $("#comentario").value = yo.comentario || "";

  const lista = $("#personasExistentes");
  vaciar(lista);
  for (const p of personas) {
    const o = document.createElement("option");
    o.value = p.nombre;
    lista.appendChild(o);
  }

  const dispo = $("#disponibilidad");
  vaciar(dispo);
  pastillasPorDia.clear();
  for (const fecha of fechas) {
    const fila = el("div", "dispo-fila");

    const etiqueta = el("div", "etiqueta");
    etiqueta.appendChild(el("span", "dia-nom", fmtDia.format(aFecha(fecha))));
    const susEsports = el("div", "dia-esports");
    for (const nombre of esportsPerDia.get(fecha) || []) {
      susEsports.appendChild(el("span", "mini", nombre));
    }
    etiqueta.appendChild(susEsports);
    pastillasPorDia.set(fecha, susEsports);
    fila.appendChild(etiqueta);

    const ops = el("div", "opciones");
    for (const est of ESTATS) {
      const b = el("button", null, est.texto);
      b.type = "button";
      b.dataset.valor = est.valor;
      b.setAttribute("aria-pressed", String(dispoDe(yo, fecha) === est.valor));
      b.addEventListener("click", () => {
        yo.disponibilidad = yo.disponibilidad || {};
        if (yo.disponibilidad[fecha] === est.valor) delete yo.disponibilidad[fecha];
        else yo.disponibilidad[fecha] = est.valor;
        for (const otro of ops.children) {
          otro.setAttribute("aria-pressed", String(dispoDe(yo, fecha) === otro.dataset.valor));
        }
        marcarCanvis(true);
      });
      ops.appendChild(b);
    }
    fila.appendChild(ops);
    dispo.appendChild(fila);
  }

  const cont = $("#pruebasCheck");
  vaciar(cont);
  for (const e of esports) {
    const label = el("label", "prueba-check");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = (yo.esports || []).includes(e.nombre);
    input.addEventListener("change", () => {
      const set = new Set(yo.esports || []);
      if (input.checked) set.add(e.nombre);
      else set.delete(e.nombre);
      yo.esports = [...set];
      destacarEsportsPropis();
      marcarCanvis(true);
    });
    const txt = el("span");
    txt.appendChild(el("strong", null, e.nombre));
    txt.appendChild(el("small", null, e.resumen));
    label.appendChild(input);
    label.appendChild(txt);
    cont.appendChild(label);
  }

  destacarEsportsPropis();
}

function destacarEsportsPropis() {
  const meus = new Set(yo.esports || []);
  for (const cont of pastillasPorDia.values()) {
    for (const span of cont.children) {
      span.classList.toggle("meu", meus.has(span.textContent));
    }
  }
}

// Permet reconèixer-se des d'un altre mòbil: si el nom ja consta, es recuperen
// les seves dades en comptes de crear un duplicat buit.
function recuperarSiJaHiEs() {
  const nombre = $("#nombre").value.trim();
  if (!nombre) return;
  const existente = personas.find(
    (p) => (p.nombre || "").toLowerCase() === nombre.toLowerCase()
  );
  if (!existente || existente.id === yo.id) return;
  if (!esJo(existente)) return;

  yo = structuredClone(existente);
  store.guardarId(yo.id);
  pintarFormulario();
  marcarCanvis(false);
  const estado = $("#estadoGuardado");
  estado.textContent = "Ja hi eres: hem recuperat les teves dades.";
  estado.className = "estado";
}

// Dos «Marc» diferents s'esborrarien les dades l'un a l'altre sense preguntar.
function esJo(existente) {
  return confirm(
    `Ja hi ha algú apuntat com a «${existente.nombre}».\n\n` +
      "Accepta si ets tu i vols editar les teves dades.\n" +
      "Cancel·la si sou dues persones diferents i afegeix-hi el cognom."
  );
}

/* ---------- equip ---------- */

function pintarEquipo() {
  const resumen = $("#resumenPruebas");
  vaciar(resumen);
  const conGente = esports.filter((e) => apuntadosA(e.nombre).length);
  if (!conGente.length) {
    resumen.appendChild(el("p", "vacio", "Encara no s'hi ha apuntat ningú."));
  }
  for (const e of conGente) {
    const fila = el("div", "resumen-fila");
    const gente = apuntadosA(e.nombre);
    fila.appendChild(el("strong", null, `${e.nombre} (${gente.length})`));
    const pills = el("div");
    for (const p of gente) pills.appendChild(el("span", "pastilla", p.nombre));
    fila.appendChild(pills);
    resumen.appendChild(fila);
  }

  const tabla = $("#tablaDispo");
  vaciar(tabla);
  const thead = tabla.createTHead().insertRow();
  thead.appendChild(el("th", null, "Persona"));
  for (const f of fechas) thead.appendChild(el("th", null, fmtCorto.format(aFecha(f))));
  const tbody = tabla.createTBody();
  if (!personas.length) {
    const fila = tbody.insertRow();
    const celda = el("td", "vacio", "Encara no hi ha dades");
    celda.colSpan = fechas.length + 1;
    fila.appendChild(celda);
  }
  for (const p of personas) {
    const fila = tbody.insertRow();
    fila.appendChild(el("td", null, p.nombre));
    for (const f of fechas) {
      const estado = dispoDe(p, f);
      const texto =
        estado === "si" ? "✓" : estado === "no" ? "✗" : estado === "quizas" ? "?" : "";
      fila.appendChild(el("td", estado, texto));
    }
  }
}

/* ---------- llistes derivades ---------- */

function derivarListas() {
  const limites = cal.limites || [];
  fechas = [
    ...new Set([...cal.pruebas.map((p) => p.fecha), ...limites.map((l) => l.fecha)]),
  ].sort();

  esportsPerDia = new Map();
  for (const f of fechas) esportsPerDia.set(f, []);
  for (const p of cal.pruebas) {
    if (p.tipo !== "esport") continue;
    const llista = esportsPerDia.get(p.fecha);
    if (!llista.includes(p.esport)) llista.push(p.esport);
  }
  for (const llista of esportsPerDia.values()) llista.sort((a, b) => a.localeCompare(b, "ca"));

  const mapa = new Map();
  for (const p of cal.pruebas) {
    if (p.tipo !== "esport") continue;
    if (!mapa.has(p.esport)) mapa.set(p.esport, []);
    mapa.get(p.esport).push(p);
  }
  esports = [...mapa.entries()]
    .map(([nombre, lista]) => ({
      nombre,
      resumen: `${lista.length} ${lista.length === 1 ? "prova" : "proves"} · des del ${fmtCorto.format(aFecha(lista[0].fecha))}`,
    }))
    .concat(
      (cal.lligues || [])
        .filter((n) => !mapa.has(n))
        .map((nombre) => ({ nombre, resumen: "Lliga · dates límit per ronda" }))
    )
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "ca"));
}

function pintarFiltros() {
  const omplir = (sel, valors, etiqueta) => {
    const anterior = sel.value;
    vaciar(sel);
    sel.appendChild(el("option", null, "Tots"));
    for (const v of valors) {
      const o = el("option", null, etiqueta(v));
      o.value = v;
      sel.appendChild(o);
    }
    sel.value = [...sel.options].some((o) => o.value === anterior) ? anterior : "";
  };
  omplir($("#filtroDia"), fechas, (f) => fmtDia.format(aFecha(f)));
  omplir($("#filtroDeporte"), esports.map((e) => e.nombre), (n) => n);
}

const dosXifres = (n) => String(n).padStart(2, "0");
let rellotge = null;

function pintarCuentaAtras() {
  clearInterval(rellotge);
  if (!fechas.length) return;

  // El compte enrere va a la primera competició (la natació), no a la reunió informativa.
  const ordenades = [...cal.pruebas].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden
  );
  const primera = ordenades.find((p) => p.tipo === "esport") || ordenades[0];
  const inici = new Date(`${primera.fecha}T${primera.hora || "09:00"}:00`);
  const fi = new Date(`${fechas[fechas.length - 1]}T23:59:59`);

  const caja = $("#cuentaAtras");
  const num = $("#cuentaAtrasNum");
  const txt = $("#cuentaAtrasTxt");

  const refrescar = () => {
    const ara = new Date();
    if (ara > fi) {
      caja.hidden = true;
      clearInterval(rellotge);
      return;
    }
    caja.hidden = false;
    if (ara >= inici) {
      num.textContent = "🔥";
      txt.textContent = "en marxa";
      return;
    }
    const falten = Math.floor((inici - ara) / 1000);
    const dies = Math.floor(falten / 86400);
    const rellotgeTxt = [
      Math.floor(falten / 3600) % 24,
      Math.floor(falten / 60) % 60,
      falten % 60,
    ]
      .map(dosXifres)
      .join(":");
    num.textContent = dies ? `${dies}d ${rellotgeTxt}` : rellotgeTxt;
    txt.textContent = "per començar";
  };

  refrescar();
  if (!caja.hidden) rellotge = setInterval(refrescar, 1000);
}

function repintar() {
  pintarCalendario();
  pintarSeguent();
  pintarFormulario();
  pintarEquipo();
  pintarPunts();
  pintarGraella();
}

/* ---------- dades ---------- */

async function recargarPersonas() {
  personas = await store.cargarPersonas();
  for (const p of personas) {
    p.esports = [...new Set((p.esports || []).map(canonic))];
  }
  personas.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "ca"));
  const mio = personas.find((p) => p.id === store.idGuardado());
  yo = mio ? structuredClone(mio) : yo || personaVacia();
}

async function cargarYPintar() {
  await recargarPersonas();
  aviso(
    store.modoRemoto()
      ? ""
      : "Mode local: les dades només es desen en aquest navegador."
  );
  repintar();
}

async function carregarCalendari(forcant) {
  const opcions = forcant ? { cache: "reload" } : {};
  const res = await fetch("data/calendario.json", opcions);
  if (!res.ok) throw new Error("HTTP " + res.status);
  cal = await res.json();
  document.title = `${EQUIP} · ${cal.titulo}`;
  $("#subtitulo").textContent = `${cal.titulo} · ${cal.subtitulo}`;
  if (cal.actualizado) {
    $("#actualitzat").textContent =
      "Calendari actualitzat el " + fmtDia.format(aFecha(cal.actualizado)) + ".";
  }

  // Sense resultats la web segueix servint: només perdem cuadres i punts.
  try {
    const resT = await fetch("data/torneig.json", opcions);
    torneig = resT.ok ? await resT.json() : null;
  } catch {
    torneig = null;
  }

  derivarListas();
  pintarFiltros();
  pintarCuentaAtras();
}

// Botó de rescat: buida la còpia offline i ho torna a demanar tot al servidor.
async function refrescarTot() {
  const boto = $("#refresca");
  if (boto.disabled) return;
  if (canvisSenseDesar && !confirm("Tens canvis sense desar i es perdran. Vols continuar?")) return;

  boto.disabled = true;
  boto.classList.add("girant");
  aviso("Actualitzant…");
  try {
    if (window.caches) {
      const noms = await caches.keys();
      await Promise.all(noms.map((n) => caches.delete(n)));
    }
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg) await reg.update();

    await carregarCalendari(true);
    if (store.modoRemoto() && !store.codi()) {
      repintar();
      mostrarAcceso();
    } else {
      await cargarYPintar();
      marcarCanvis(false);
      aviso("Actualitzat a les " + fmtHora.format(new Date()) + ".", "ok");
      setTimeout(() => {
        if ($("#aviso").classList.contains("ok")) aviso("");
      }, 5000);
    }
  } catch (e) {
    if (e instanceof store.CodiInvalid) mostrarAcceso("La sessió ha caducat.");
    else aviso("No s'ha pogut actualitzar: " + e.message + ". Comprova la connexió.");
  } finally {
    boto.disabled = false;
    boto.classList.remove("girant");
  }
}

async function guardar() {
  const estado = $("#estadoGuardado");
  const nombre = $("#nombre").value.trim();
  if (!nombre) {
    estado.textContent = "Escriu el teu nom.";
    estado.className = "estado error";
    return;
  }
  const existente = personas.find(
    (p) => p.nombre.toLowerCase() === nombre.toLowerCase() && p.id !== yo.id
  );
  if (existente) {
    if (!esJo(existente)) {
      estado.textContent = "Afegeix el cognom per no barrejar-vos.";
      estado.className = "estado error";
      return;
    }
    yo.id = existente.id;
  }

  yo.nombre = nombre;
  yo.comentario = $("#comentario").value.trim();
  yo.actualizado = new Date().toISOString();

  try {
    await store.guardarPersona(structuredClone(yo));
    store.guardarId(yo.id);
    await cargarYPintar();
    marcarCanvis(false);
    estado.textContent = "Desat ✓";
    estado.className = "estado";
  } catch (e) {
    if (e instanceof store.CodiInvalid) return mostrarAcceso("La sessió ha caducat.");
    estado.textContent = "No s'ha pogut desar: " + e.message;
    estado.className = "estado error";
  }
}

async function borrarme() {
  if (!confirm("Vols esborrar les teves dades d'inscripció?")) return;
  try {
    await store.borrarPersona(yo.id);
    yo = personaVacia();
    store.guardarId("");
    await cargarYPintar();
    marcarCanvis(false);
    $("#estadoGuardado").textContent = "";
  } catch (e) {
    aviso("No s'ha pogut esborrar: " + e.message);
  }
}

/* ---------- porta d'accés ---------- */

function mostrarAcceso(mensaje) {
  $("#accesoError").textContent = mensaje || "";
  $("#acceso").hidden = false;
  $("#accesoCodi").focus();
}

async function intentarEntrar(evento) {
  evento.preventDefault();
  const codi = $("#accesoCodi").value.trim();
  if (!codi) return;
  store.guardarCodi(codi);
  try {
    await cargarYPintar();
    $("#acceso").hidden = true;
    $("#accesoCodi").value = "";
  } catch (e) {
    store.guardarCodi("");
    $("#accesoError").textContent =
      e instanceof store.CodiInvalid ? "Codi incorrecte." : "Error de connexió: " + e.message;
  }
}

/* ---------- arrencada ---------- */

function conectarPestanias() {
  const tabs = [...document.querySelectorAll(".tab")];
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      for (const t of tabs) {
        const activa = t === tab;
        t.classList.toggle("activa", activa);
        t.setAttribute("aria-selected", String(activa));
        $("#panel-" + t.dataset.panel).hidden = !activa;
      }
    });
  }
}

async function iniciar() {
  conectarPestanias();
  $("#filtroDia").addEventListener("change", pintarCalendario);
  $("#filtroDeporte").addEventListener("change", pintarCalendario);
  $("#filtroMios").addEventListener("change", pintarCalendario);
  $("#guardar").addEventListener("click", guardar);
  $("#borrarme").addEventListener("click", borrarme);
  $("#nombre").addEventListener("change", recuperarSiJaHiEs);
  $("#accesoForm").addEventListener("submit", intentarEntrar);
  $("#refresca").addEventListener("click", refrescarTot);
  $("#tancaQuadre").addEventListener("click", () => $("#quadre").close());
  // Clic al fons fosc del dialog: el tanquem.
  $("#quadre").addEventListener("click", (e) => {
    if (e.target.id === "quadre") $("#quadre").close();
  });
  // Alguns navegadors no tanquen el dialog amb Escape; ho fem nosaltres.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#quadre").open) $("#quadre").close();
  });
  addEventListener("beforeunload", (e) => {
    if (!canvisSenseDesar) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // Sense codi desat no cal ni intentar-ho: la porta surt de seguida.
  const calCodi = store.modoRemoto() && !store.codi();
  if (calCodi) mostrarAcceso();

  try {
    await carregarCalendari(false);
  } catch (e) {
    aviso("No s'ha pogut carregar el calendari. Prova el botó ↻ de dalt a la dreta.");
    return;
  }

  if (calCodi) {
    yo = personaVacia();
    repintar();
    return;
  }

  try {
    await cargarYPintar();
  } catch (e) {
    if (e instanceof store.CodiInvalid) {
      personas = [];
      yo = personaVacia();
      repintar();
      mostrarAcceso();
      return;
    }
    personas = store.personasLocales();
    const mio = personas.find((p) => p.id === store.idGuardado());
    yo = mio ? structuredClone(mio) : personaVacia();
    repintar();
    aviso("Sense connexió amb el servidor: veus l'última còpia desada en aquest dispositiu. Prova el botó ↻ de dalt a la dreta.");
  }
}

iniciar();
