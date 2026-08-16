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
let acords = [];
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

/** Els noms del calendari i els del quadre venen del mateix full: coincideixen. */
function esportPerNom(nom) {
  return torneig ? (torneig.esports || []).find((e) => e.nom === nom) : null;
}

/** Els partits del quadre que es juguen en aquesta franja del calendari. */
function partitsDe(p) {
  const esport = esportDe(p.esportId);
  if (!esport || !p.partits.length) return [];
  // En l'ordre que els llista l'organització: és l'ordre en què es jugaran.
  return p.partits.map((id) => esport.partits.find((x) => x.id === id)).filter(Boolean);
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

/** Data d'avui en hora local: amb toISOString a la nit ens saltaria al dia anterior. */
const dataIso = (d) =>
  `${d.getFullYear()}-${dosXifres(d.getMonth() + 1)}-${dosXifres(d.getDate())}`;

function avui() {
  return dataIso(new Date());
}
let filtreRapid = "tot";

function pintarCalendario() {
  const cont = $("#listaCalendario");
  vaciar(cont);

  const dia = $("#filtroDia").value;
  const esport = $("#filtroDeporte").value;
  const mios = new Set((yo && yo.esports) || []);
  const avuiIso = avui();

  const visibles = totesLesProves().filter((p) => {
    if (dia && p.fecha !== dia) return false;
    if (esport && p.esport !== esport) return false;
    if (filtreRapid === "avui" && p.fecha !== avuiIso) return false;
    return true;
  });

  // Les lligues (petanca, tennis…) nomes surten com a data limit: sense aixo desapareixien.
  const limitsVisibles = (cal.limites || []).filter((l) => {
    if (dia && l.fecha !== dia) return false;
    if (esport && !l.esports.includes(esport)) return false;
    if (filtreRapid === "avui" && l.fecha !== avuiIso) return false;
    return true;
  });

  if (!visibles.length && !limitsVisibles.length) {
    cont.appendChild(el("p", "vacio", "No hi ha proves amb aquests filtres."));
    return;
  }

  // Les quedades poden caure en dies que el calendari oficial no cobreix.
  const dies = [...new Set([...fechas, ...visibles.map((p) => p.fecha)])].sort();

  // Els dies ja jugats es pleguen: el que interessa és el que ve.
  const passats = el("details", "passats");
  passats.appendChild(el("summary"));
  cont.appendChild(passats);
  let nPassats = 0;
  let nPerVenir = 0;

  for (const fecha of dies) {
    const delDia = visibles
      .filter((p) => p.fecha === fecha)
      .sort((a, b) => (a.hora || "").localeCompare(b.hora || "") || a.orden - b.orden);
    const limitsDelDia = limitsVisibles.filter((l) => l.fecha === fecha);
    if (!delDia.length && !limitsDelDia.length) continue;

    const bloque = el("section", "dia");
    if (fecha === avuiIso) bloque.classList.add("avui");
    bloque.id = "dia-" + fecha;
    const titol = el("h3", null, fmtDia.format(aFecha(fecha)));
    if (fecha === avuiIso) titol.appendChild(el("span", "etiqueta-avui", "avui"));
    bloque.appendChild(titol);

    for (const lim of limitsDelDia) {
      const caja = el("div", "limit");
      caja.appendChild(el("strong", null, "Data límit: " + lim.rondes.join(", ")));
      caja.appendChild(el("span", null, lim.esports.join(" · ")));
      bloque.appendChild(caja);
    }

    const lista = el("div", "eventos");
    for (const p of delDia) lista.appendChild(tarjetaEvento(p, mios));
    bloque.appendChild(lista);

    if (fecha < avuiIso) {
      nPassats++;
      passats.appendChild(bloque);
    } else {
      nPerVenir++;
      cont.appendChild(bloque);
    }
  }

  if (nPassats) {
    passats.querySelector("summary").textContent =
      nPassats === 1 ? "1 dia ja jugat" : `${nPassats} dies ja jugats`;
    // Si el filtre només deixa dies passats, obre'ls o semblaria que no hi ha res.
    passats.open = !nPerVenir;
  } else {
    passats.remove();
  }
}

function tarjetaEvento(p, mios) {
  const juguem = hiJuguem(p);
  // Mentre no sapiguem si hi som (falta la ronda anterior) tampoc ens reclama res.
  const alie = p.tipo === "esport" && nosaltres() && juguem !== true;
  const art = el(
    "article",
    "evento" +
      (mios.has(p.esport) ? " apuntado" : "") +
      (juguem ? " nostre" : "") +
      (alie ? " alie" : "")
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
    const jo = nosaltres();
    // Sense tocar l'ordre: la organització els llista en l'ordre en què es juguen.
    const altres = jo && partits.some((x) => x.equips.includes(jo));
    for (const partit of partits) {
      const nostre = jo && partit.equips.includes(jo);
      const fila = liniaPartit(partit);
      if (altres && !nostre) fila.classList.add("apagat");
      cuerpo.appendChild(fila);
    }
  } else {
    for (const linea of (p.quiJuga || "").split("\n").filter(Boolean)) {
      cuerpo.appendChild(el("div", "rival", linea));
    }
  }

  const gente = apuntadosA(p.esport);
  if (gente.length) {
    const { poden } = quiPotVenir(p);
    cuerpo.appendChild(
      el(
        "div",
        "compte" + (poden ? "" : " alerta"),
        `${poden} de ${gente.length} poden venir`
      )
    );
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

/** "d'aquí a 2 dies", "d'aquí a 6 h 20 min", "d'aquí a 12 min". */
function quantFalta(quan) {
  const min = Math.round((quan - new Date()) / 60000);
  if (min <= 0) return "ara mateix";
  if (min < 60) return `d'aquí a ${min} min`;
  const hores = Math.floor(min / 60);
  if (hores < 24) {
    const resta = min % 60;
    return `d'aquí a ${hores} h${resta ? ` ${resta} min` : ""}`;
  }
  const dies = Math.round(hores / 24);
  return `d'aquí a ${dies} ${dies === 1 ? "dia" : "dies"}`;
}

let comptadorSeguent = null;

const ordinalCa = (n) => n + (n === 1 ? "r" : n === 2 ? "n" : n === 3 ? "r" : n === 4 ? "t" : "è");

/** Targeta de dalt: el pròxim compromís nostre, amb qui hi pot anar. */
function pintarSeguent() {
  const caja = $("#seguent");
  vaciar(caja);
  caja.hidden = true;
  clearInterval(comptadorSeguent);
  if (!nosaltres()) return;

  const ara = new Date();
  const proxima = totesLesProves()
    .filter((p) => p.tipo === "esport" && hiJuguem(p) !== false)
    .map((p) => ({ p, quan: new Date(`${p.fecha}T${p.hora || "09:00"}:00`) }))
    .filter((x) => x.quan > ara)
    .sort((a, b) => a.quan - b.quan)[0];
  if (!proxima) return;

  const { p, quan } = proxima;
  const tots = partitsDe(p);
  const meus = tots.filter((x) => x.equips.includes(nosaltres()));
  const gent = quiPotVenir(p);

  caja.hidden = false;
  const falta = el("span", "seguent-etiqueta", quantFalta(quan));
  caja.appendChild(falta);
  comptadorSeguent = setInterval(() => (falta.textContent = quantFalta(quan)), 30000);

  caja.appendChild(el("strong", null, p.esport));
  caja.appendChild(
    el("span", "seguent-quan", `${fmtCorto.format(aFecha(p.fecha))} · ${p.hora} · ${p.lloc}`)
  );
  for (const partit of meus) {
    const rival = rivalNostre(partit);
    caja.appendChild(el("span", "seguent-rival", `${partit.nom}: contra ${rival || "?"}`));
  }
  // A la franja hi caben quatre partits: l'hora d'inici no és la nostra hora.
  if (meus.length && tots.length > 1) {
    const lloc = tots.indexOf(meus[0]) + 1;
    caja.appendChild(
      el(
        "span",
        "seguent-ordre",
        lloc === 1
          ? `Comencem nosaltres: som el 1r dels ${tots.length} partits de la franja.`
          : `Juguem el ${ordinalCa(lloc)} dels ${tots.length} partits de la franja, no a l'hora en punt.`
      )
    );
  }
  const gentTxt = el(
    "span",
    "seguent-gent" + (gent.total && gent.poden ? "" : " alerta"),
    gent.total
      ? `${gent.poden} de ${gent.total} apuntats hi poden anar.`
      : "Encara no s'hi ha apuntat ningú."
  );
  caja.appendChild(gentTxt);
}

/* ---------- compartir el pla i recordatoris ---------- */

/** Les proves d'un dia que ens toquen: les altres no interessen al grup. */
function provesNostres(fecha) {
  const jo = nosaltres();
  return totesLesProves()
    .filter((p) => !fecha || p.fecha === fecha)
    .filter((p) => {
      if (p.tipo !== "esport") return true;
      if (hiJuguem(p) !== true) return false;
      // Amb lloc a la classificació la nostra participació ja s'ha acabat.
      const esport = esportDe(p.esportId);
      return !esport || !esport.posicions.includes(jo);
    })
    .sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        (a.hora || "").localeCompare(b.hora || "") ||
        a.orden - b.orden
    );
}

const inici = (p) => new Date(`${p.fecha}T${p.hora || "09:00"}:00`);

/** El full de calça algun acte com a "Acte" i posa el nom de veritat a qui hi juga. */
function nomProva(p) {
  if (p.esport !== "Acte") return p.esport;
  const rotul = (p.quiJuga || "").split("\n").filter(Boolean)[0];
  return rotul || p.esport;
}

/** El dia que val la pena passar al grup: avui si encara queda res, si no el següent. */
function diaPerCompartir() {
  const ara = new Date();
  const queda = provesNostres().find((p) => inici(p) > ara);
  return queda ? queda.fecha : "";
}

function textDelPla(fecha) {
  const linies = [`${EQUIP} · ${fmtDia.format(aFecha(fecha))}`];
  for (const p of provesNostres(fecha)) {
    linies.push("", [p.hora, nomProva(p), p.lloc].filter(Boolean).join(" · "));
    for (const partit of partitsDe(p).filter((x) => x.equips.includes(nosaltres()))) {
      linies.push(`${partit.nom}: contra ${rivalNostre(partit) || "?"}`);
    }
    if (p.tipo === "esport") {
      const gent = quiPotVenir(p);
      linies.push(
        gent.total
          ? `${gent.poden} de ${gent.total} apuntats hi poden anar`
          : "Encara no s'hi ha apuntat ningú"
      );
    }
  }
  linies.push("", location.origin + location.pathname);
  return linies.join("\n");
}

async function copiar(text) {
  try {
    await navigator.clipboard.writeText(text);
    aviso("Pla copiat: ja el pots enganxar al grup.", "ok");
  } catch (err) {
    aviso("No s'ha pogut copiar el pla.");
  }
}

async function compartirPla() {
  const fecha = diaPerCompartir();
  if (!fecha) return;
  const text = textDelPla(fecha);
  if (!navigator.share) return copiar(text);
  try {
    await navigator.share({ text });
  } catch (err) {
    // Tancar el full de compartir no és cap error: només cal avisar si ha petat.
    if (!err || err.name !== "AbortError") copiar(text);
  }
}

/* ---------- botons del calendari ---------- */

function pintarAccions() {
  const boto = $("#compartirPla");
  const fecha = diaPerCompartir();
  boto.hidden = !fecha;
  if (!fecha) return;
  const dema = new Date(aFecha(avui()).getTime() + 86400000);
  boto.textContent =
    fecha === avui()
      ? "Compartir el pla d'avui"
      : fecha === dataIso(dema)
        ? "Compartir el pla de demà"
        : `Compartir el pla de ${fmtCorto.format(aFecha(fecha))}`;
}

/* ---------- quedades de les lligues ---------- */

const idAcord = (esportId, partitId) => `partit:${esportId}:${partitId}`;

const acordDe = (esportId, partitId) =>
  acords.find((a) => a.id === idAcord(esportId, partitId));

/** La data límit que li toca a un partit d'una lliga, si en té. */
function limitDe(nomEsport, nomPartit) {
  return (cal.limites || []).find(
    (l) => l.esports.includes(nomEsport) && l.rondes.includes(nomPartit)
  );
}

/** Els nostres partits de lliga que encara s'han de jugar, amb data límit i quedada. */
function partitsPerQuedar() {
  const jo = nosaltres();
  if (!jo || !torneig) return [];
  const fora = [];
  for (const nom of cal.lligues || []) {
    const esport = esportPerNom(nom);
    if (!esport) continue;
    for (const partit of esport.partits) {
      if (partit.guanyador || !partit.equips.includes(jo)) continue;
      const limit = limitDe(nom, partit.nom);
      if (!limit) continue;
      fora.push({ esport, partit, limit, acord: acordDe(esport.id, partit.id) });
      break; // només el següent de cada esport
    }
  }
  return fora.sort((a, b) => a.limit.fecha.localeCompare(b.limit.fecha));
}

/** Una quedada es pinta al calendari com una prova més. */
function provesAcordades() {
  const fora = [];
  for (const a of acords) {
    if (!a.data || !a.hora) continue;
    fora.push({
      id: "acord-" + a.id,
      esport: a.esport,
      esportId: a.esportId,
      detalle: a.partitNom || "",
      partits: [a.partitId],
      tipo: "esport",
      fecha: a.data,
      hora: a.hora,
      horaFin: "",
      orden: Number(a.hora.slice(0, 2)) || 0,
      lloc: a.lloc || "",
      quiJuga: "",
      nota: "Quedat amb ells",
      acord: a,
    });
  }
  return fora;
}

const totesLesProves = () => [...cal.pruebas, ...provesAcordades()];

function pintarPerQuedar() {
  const pendents = partitsPerQuedar();
  const falten = pendents.filter((x) => !x.acord);
  const fets = pendents.filter((x) => x.acord);

  const tab = document.querySelector('.tab[data-panel="quedar"]');
  const xifra = $("#numPerQuedar");
  tab.hidden = !pendents.length;
  xifra.hidden = !falten.length;
  xifra.textContent = falten.length || "";
  // Si la pestanya desapareix mentre la miraves, torna al calendari.
  if (tab.hidden && tab.classList.contains("activa")) activarPestanya("calendario");

  omplirLlistaQuedades($("#llistaPerQuedar"), falten, $("#quedarPendents"));
  omplirLlistaQuedades($("#llistaQuedats"), fets, $("#quedarFets"));

  const crida = $("#cridaQuedar");
  crida.hidden = !falten.length;
  crida.textContent = falten.length === 1
    ? "Hi ha 1 partit sense dia · posa-li hora"
    : `Hi ha ${falten.length} partits sense dia · posa'ls hora`;
}

function omplirLlistaQuedades(llista, pendents, caixa) {
  vaciar(llista);
  caixa.hidden = !pendents.length;

  for (const { esport, partit, limit, acord } of pendents) {
    const fila = el("div", "per-quedar" + (acord ? " tancat" : ""));
    const dades = el("div", "per-quedar-dades");
    dades.appendChild(el("strong", null, `${esport.nom} · ${partit.nom}`));

    const rival = rivalNostre(partit);
    dades.appendChild(
      el("span", "meta", rival ? `Contra ${rival}` : "Esperem rival de la ronda anterior")
    );
    dades.appendChild(
      el(
        "span",
        acord ? "per-quedar-quan" : "per-quedar-limit",
        acord
          ? `${fmtDia.format(aFecha(acord.data))} · ${acord.hora}${acord.lloc ? " · " + acord.lloc : ""}`
          : `Abans del ${fmtDia.format(aFecha(limit.fecha))}`
      )
    );
    fila.appendChild(dades);

    const boto = el("button", "btn petit", acord ? "Canvia" : "Posa dia i hora");
    boto.type = "button";
    boto.addEventListener("click", () => obrirQuedada(esport, partit, limit));
    fila.appendChild(boto);
    llista.appendChild(fila);
  }
}

let quedadaActual = null;

function obrirQuedada(esport, partit, limit) {
  const acord = acordDe(esport.id, partit.id);
  quedadaActual = { esport, partit, limit };
  $("#quedadaTitol").textContent = `${esport.nom} · ${partit.nom}`;
  $("#quedadaLimit").textContent = `S'ha de jugar abans del ${fmtDia.format(aFecha(limit.fecha))}.`;
  $("#quedadaData").value = acord ? acord.data : "";
  $("#quedadaData").max = limit.fecha;
  $("#quedadaHora").value = acord ? acord.hora : "";
  $("#quedadaLloc").value = acord ? acord.lloc || "" : "";
  $("#quedadaEstat").textContent = "";
  $("#quedadaEstat").className = "estado";
  $("#esborraQuedada").hidden = !acord;
  $("#quedada").showModal();
}

async function desarQuedada(evento) {
  evento.preventDefault();
  if (!quedadaActual) return;
  const { esport, partit } = quedadaActual;
  const acord = {
    id: idAcord(esport.id, partit.id),
    nombre: `${esport.nom} · ${partit.nom}`,
    tipus: "partit",
    esport: esport.nom,
    esportId: esport.id,
    partitId: partit.id,
    partitNom: partit.nom,
    data: $("#quedadaData").value,
    hora: $("#quedadaHora").value,
    lloc: $("#quedadaLloc").value.trim(),
    actualizado: new Date().toISOString(),
  };
  if (!acord.data || !acord.hora) return;

  const estat = $("#quedadaEstat");
  estat.textContent = "Desant…";
  estat.className = "estado pendent";
  try {
    await store.guardarPersona(acord);
    acords = [...acords.filter((a) => a.id !== acord.id), acord];
    $("#quedada").close();
    repintar();
  } catch (e) {
    estat.textContent = "No s'ha pogut desar: " + e.message;
    estat.className = "estado error";
  }
}

async function esborrarQuedada() {
  if (!quedadaActual) return;
  const id = idAcord(quedadaActual.esport.id, quedadaActual.partit.id);
  const estat = $("#quedadaEstat");
  estat.textContent = "Esborrant…";
  estat.className = "estado pendent";
  try {
    await store.borrarPersona(id);
    acords = acords.filter((a) => a.id !== id);
    $("#quedada").close();
    repintar();
  } catch (e) {
    estat.textContent = "No s'ha pogut esborrar: " + e.message;
    estat.className = "estado error";
  }
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
  // Mentre ningú no ha puntuat, tothom empata a 1r: no té sentit dir "anem primers".
  const hiHaPunts = torneig.general.some((e) => e.punts > 0);
  if (meu) {
    const caja = el("div", "tarjeta destacada");
    caja.appendChild(el("span", "seguent-etiqueta", "Diablos"));
    caja.appendChild(
      el(
        "strong",
        "gran",
        hiHaPunts ? `${ordinal(meu.posicio)} · ${meu.punts} punts` : "Encara sense punts"
      )
    );
    const lider = torneig.general[0];
    caja.appendChild(
      el(
        "span",
        "meta",
        !hiHaPunts
          ? "Comencem de zero: cap esport no ha donat punts encara."
          : meu.posicio === 1
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
    fila.appendChild(el("td", null, hiHaPunts ? String(e.posicio) : "–"));
    fila.appendChild(el("td", null, e.nom));
    fila.appendChild(el("td", null, String(e.punts)));
  }

  if (!jo) {
    pas.appendChild(
      el("p", "vacio", "Quan sapiguem quin equip som, aquí sortirà com anem a cada esport. Mentrestant, mira els quadres més avall.")
    );
    return;
  }
  for (const esport of torneig.esports) {
    const acabat = esport.posicions.includes(jo);
    const fila = el("button", "resumen-fila clicable" + (acabat ? " acabat" : ""));
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
    const gente = apuntadosA(e.nombre);
    const delQuadre = esportPerNom(e.nombre);
    const fila = el("div", "resumen-fila");
    const titol = el(delQuadre ? "button" : "strong", null, `${e.nombre} (${gente.length})`);
    if (delQuadre) {
      titol.type = "button";
      titol.className = "obre-quadre";
      titol.addEventListener("click", () => obrirQuadre(delQuadre.id));
    }
    fila.appendChild(titol);
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
    // Sense value="" explicit, l'opció val "Tots" i el filtre no troba res.
    const cap = el("option", null, "Tots");
    cap.value = "";
    sel.appendChild(cap);
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
    // Un cop comencen, el compte enrere útil és el del pròxim partit nostre.
    if (ara > fi || ara >= inici) {
      caja.hidden = true;
      clearInterval(rellotge);
      return;
    }
    caja.hidden = false;
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
  pintarAccions();
  pintarPerQuedar();
  pintarFormulario();
  pintarEquipo();
  pintarPunts();
  pintarGraella();
}

/* ---------- dades ---------- */

async function recargarPersonas() {
  usarPersonas(await store.cargarPersonas());
}

function usarPersonas(llista) {
  // Les quedades viuen al mateix full que la gent, marcades amb tipus "partit".
  acords = llista.filter((p) => p.tipus === "partit");
  personas = llista.filter((p) => p.tipus !== "partit");
  for (const p of personas) {
    p.esports = [...new Set((p.esports || []).map(canonic))];
  }
  personas.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "ca"));
  const mio = personas.find((p) => p.id === store.idGuardado());
  yo = mio ? structuredClone(mio) : yo || personaVacia();
}

/** Fa girar el botó ↻ mentre esperem el servidor. */
function carregant(si) {
  $("#refresca").classList.toggle("girant", si);
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
  // Sense resultats la web segueix servint: només perdem quadres i punts.
  const [res, resT] = await Promise.all([
    fetch("data/calendario.json", opcions),
    fetch("data/torneig.json", opcions).catch(() => null),
  ]);
  if (!res.ok) throw new Error("HTTP " + res.status);
  cal = await res.json();
  torneig = resT && resT.ok ? await resT.json().catch(() => null) : null;

  document.title = `${EQUIP} · ${cal.titulo}`;
  if (cal.actualizado) {
    $("#actualitzat").textContent =
      "Calendari actualitzat el " + fmtDia.format(aFecha(cal.actualizado)) + ".";
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

function activarPestanya(nom) {
  for (const t of document.querySelectorAll(".tab")) {
    const activa = t.dataset.panel === nom;
    t.classList.toggle("activa", activa);
    t.setAttribute("aria-selected", String(activa));
    $("#panel-" + t.dataset.panel).hidden = !activa;
  }
}

function conectarPestanias() {
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => {
      activarPestanya(tab.dataset.panel);
      // Amb les pestanyes enganxades pots canviar des de baix de tot: torna a dalt.
      window.scrollTo({ top: 0 });
    });
  }
  $("#cridaQuedar").addEventListener("click", () => {
    activarPestanya("quedar");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

async function iniciar() {
  conectarPestanias();
  const marcarXip = (nom) => {
    filtreRapid = nom;
    for (const x of document.querySelectorAll(".xip-filtre")) {
      x.classList.toggle("activa", x.dataset.rapid === nom);
    }
  };
  // Triar dia o esport al desplegable ha de veure's sobre tot el calendari.
  const filtrarPerDesplegable = () => {
    marcarXip("tot");
    pintarCalendario();
  };
  $("#filtroDia").addEventListener("change", filtrarPerDesplegable);
  $("#filtroDeporte").addEventListener("change", filtrarPerDesplegable);
  for (const xip of document.querySelectorAll(".xip-filtre")) {
    xip.addEventListener("click", () => {
      $("#filtroDia").value = "";
      $("#filtroDeporte").value = "";
      marcarXip(xip.dataset.rapid);
      pintarCalendario();
    });
  }
  $("#guardar").addEventListener("click", guardar);
  $("#borrarme").addEventListener("click", borrarme);
  $("#compartirPla").addEventListener("click", compartirPla);
  $("#nombre").addEventListener("change", recuperarSiJaHiEs);
  $("#accesoForm").addEventListener("submit", intentarEntrar);
  $("#refresca").addEventListener("click", refrescarTot);
  $("#tancaQuadre").addEventListener("click", () => $("#quadre").close());
  $("#tancaQuedada").addEventListener("click", () => $("#quedada").close());
  $("#quedadaForm").addEventListener("submit", desarQuedada);
  $("#esborraQuedada").addEventListener("click", esborrarQuedada);
  // Clic al fons fosc del dialog: el tanquem.
  $("#quadre").addEventListener("click", (e) => {
    if (e.target.id === "quadre") $("#quadre").close();
  });
  $("#quedada").addEventListener("click", (e) => {
    if (e.target.id === "quedada") $("#quedada").close();
  });
  // Alguns navegadors no tanquen el dialog amb Escape; ho fem nosaltres.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    for (const id of ["#quadre", "#quedada"]) if ($(id).open) $(id).close();
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

  // Pintem ja amb l'última còpia d'aquest mòbil; el servidor pot trigar segons.
  usarPersonas(store.personasLocales());
  repintar();
  aviso(personas.length ? "Actualitzant la llista de gent…" : "Carregant la llista de gent…", "pendent");
  carregant(true);

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
  } finally {
    carregant(false);
  }
}

iniciar();
