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

const aFecha = (iso) => new Date(iso + "T12:00:00");

let cal = { pruebas: [], lligues: [], limites: [], avisos: [] };
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

function aviso(texto) {
  const n = $("#aviso");
  n.textContent = texto;
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
    if (!delDia.length) continue;

    const bloque = el("section", "dia");
    bloque.appendChild(el("h3", null, fmtDia.format(aFecha(fecha))));

    for (const lim of cal.limites.filter((l) => l.fecha === fecha)) {
      bloque.appendChild(el("p", "aviso", `${lim.texto} — ${lim.esports.join(", ")}`));
    }
    for (const av of cal.avisos.filter((a) => a.fecha === fecha)) {
      bloque.appendChild(el("p", "aviso", `${av.hora} · ${av.texto}`));
    }

    const lista = el("div", "eventos");
    for (const p of delDia) lista.appendChild(tarjetaEvento(p, mios));
    bloque.appendChild(lista);
    cont.appendChild(bloque);
  }
}

function tarjetaEvento(p, mios) {
  const art = el("article", "evento" + (mios.has(p.esport) ? " apuntado" : ""));
  art.appendChild(el("div", "hora", p.hora));

  const cuerpo = el("div", "cuerpo");
  cuerpo.appendChild(el("div", "deporte", p.detalle ? `${p.esport} · ${p.detalle}` : p.esport));
  cuerpo.appendChild(
    el("div", "meta", [p.lloc, `${p.hora}–${p.horaFin}`].filter(Boolean).join(" · "))
  );

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
  fechas = [...new Set(cal.pruebas.map((p) => p.fecha))].sort();

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
  const dia = $("#filtroDia");
  for (const f of fechas) {
    const o = document.createElement("option");
    o.value = f;
    o.textContent = fmtDia.format(aFecha(f));
    dia.appendChild(o);
  }
  const dep = $("#filtroDeporte");
  for (const e of esports) {
    const o = document.createElement("option");
    o.value = e.nombre;
    o.textContent = e.nombre;
    dep.appendChild(o);
  }
}

function pintarCuentaAtras() {
  if (!fechas.length) return;
  const dias = Math.ceil((aFecha(fechas[0]) - new Date()) / 86400000);
  const caja = $("#cuentaAtras");
  if (dias > 0) {
    $("#cuentaAtrasNum").textContent = String(dias);
    $("#cuentaAtrasTxt").textContent = dias === 1 ? "dia" : "dies";
    caja.hidden = false;
  } else if (dias > -20) {
    $("#cuentaAtrasNum").textContent = "🔥";
    $("#cuentaAtrasTxt").textContent = "en marxa";
    caja.hidden = false;
  }
}

function repintar() {
  pintarCalendario();
  pintarFormulario();
  pintarEquipo();
}

/* ---------- dades ---------- */

async function recargarPersonas() {
  personas = await store.cargarPersonas();
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
  addEventListener("beforeunload", (e) => {
    if (!canvisSenseDesar) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // Sense codi desat no cal ni intentar-ho: la porta surt de seguida.
  const calCodi = store.modoRemoto() && !store.codi();
  if (calCodi) mostrarAcceso();

  try {
    const res = await fetch("data/calendario.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    cal = await res.json();
  } catch (e) {
    aviso("No s'ha pogut carregar el calendari. Torna-ho a provar més tard.");
    return;
  }
  document.title = `${EQUIP} · ${cal.titulo}`;
  $("#subtitulo").textContent = `${cal.titulo} · ${cal.subtitulo}`;
  if (cal.actualizado) {
    $("#actualitzat").textContent =
      "Calendari actualitzat el " + fmtDia.format(aFecha(cal.actualizado)) + ".";
  }

  derivarListas();
  pintarFiltros();
  pintarCuentaAtras();

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
    aviso("Sense connexió amb el servidor: veus l'última còpia desada en aquest dispositiu.");
  }
}

iniciar();
