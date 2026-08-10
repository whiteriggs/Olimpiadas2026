const CLAU_PERSONES = "olimpiades2026.persones";
const CLAU_JO = "olimpiades2026.jo";
const CLAU_CODI = "olimpiades2026.codi";

const api = () => (window.CONFIG && window.CONFIG.API_URL) || "";

export const modoRemoto = () => api() !== "";

export class CodiInvalid extends Error {}

function leerLocal() {
  try {
    const crudo = localStorage.getItem(CLAU_PERSONES);
    const datos = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(datos) ? datos : [];
  } catch {
    return [];
  }
}

function escribirLocal(personas) {
  localStorage.setItem(CLAU_PERSONES, JSON.stringify(personas));
}

export const codi = () => localStorage.getItem(CLAU_CODI) || "";
export const guardarCodi = (v) => localStorage.setItem(CLAU_CODI, v);

export function idGuardado() {
  return localStorage.getItem(CLAU_JO) || "";
}

export function guardarId(id) {
  localStorage.setItem(CLAU_JO, id);
}

export function nuevoId() {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function enviar(cuerpo) {
  // text/plain evita el preflight CORS que Apps Script no respon.
  const res = await fetch(api(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...cuerpo, codi: codi() }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const datos = await res.json();
  if (datos.error === "codi") throw new CodiInvalid("codi incorrecte");
  if (!datos.ok) throw new Error(datos.error || "error desconegut");
}

export async function cargarPersonas() {
  if (!modoRemoto()) return leerLocal();
  const res = await fetch(api() + "?codi=" + encodeURIComponent(codi()));
  if (!res.ok) throw new Error("HTTP " + res.status);
  const datos = await res.json();
  if (!Array.isArray(datos)) throw new CodiInvalid("codi incorrecte");
  escribirLocal(datos); // còpia local per si falla la connexió
  return datos;
}

export async function guardarPersona(persona) {
  if (modoRemoto()) await enviar({ accion: "guardar", persona });
  const personas = leerLocal();
  const i = personas.findIndex((p) => p.id === persona.id);
  if (i >= 0) personas[i] = persona;
  else personas.push(persona);
  escribirLocal(personas);
}

export async function borrarPersona(id) {
  if (modoRemoto()) await enviar({ accion: "borrar", id });
  escribirLocal(leerLocal().filter((p) => p.id !== id));
}

export function reemplazarTodo(personas) {
  escribirLocal(personas);
}
