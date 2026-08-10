const CLAVE = "olimpiadas2026.personas";
const CLAVE_YO = "olimpiadas2026.yo";

const api = () => (window.CONFIG && window.CONFIG.API_URL) || "";

export const modoRemoto = () => api() !== "";

function leerLocal() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    const datos = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(datos) ? datos : [];
  } catch {
    return [];
  }
}

function escribirLocal(personas) {
  localStorage.setItem(CLAVE, JSON.stringify(personas));
}

export function idGuardado() {
  return localStorage.getItem(CLAVE_YO) || "";
}

export function guardarId(id) {
  localStorage.setItem(CLAVE_YO, id);
}

export function nuevoId() {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function cargarPersonas() {
  if (!modoRemoto()) return leerLocal();
  const res = await fetch(api(), { method: "GET" });
  if (!res.ok) throw new Error("No se pudo cargar (" + res.status + ")");
  const datos = await res.json();
  const personas = Array.isArray(datos) ? datos : [];
  escribirLocal(personas); // copia de seguridad para modo sin conexión
  return personas;
}

export async function guardarPersona(persona) {
  const personas = leerLocal();
  const i = personas.findIndex((p) => p.id === persona.id);
  if (i >= 0) personas[i] = persona;
  else personas.push(persona);
  escribirLocal(personas);

  if (modoRemoto()) {
    // text/plain evita el preflight CORS que Apps Script no responde.
    const res = await fetch(api(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ accion: "guardar", persona }),
    });
    if (!res.ok) throw new Error("No se pudo guardar (" + res.status + ")");
  }
  return personas;
}

export async function borrarPersona(id) {
  escribirLocal(leerLocal().filter((p) => p.id !== id));
  if (modoRemoto()) {
    const res = await fetch(api(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ accion: "borrar", id }),
    });
    if (!res.ok) throw new Error("No se pudo borrar (" + res.status + ")");
  }
}

export function reemplazarTodo(personas) {
  escribirLocal(personas);
}
