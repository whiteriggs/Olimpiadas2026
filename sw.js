// Xarxa primer i memòria com a reserva: així el calendari sempre surt actualitzat
// si hi ha cobertura, i la web segueix funcionant sense connexió.

const CAU = "olimpiades2026-v31";
const BASE = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./js/app.js",
  "./js/store.js",
  "./data/calendario.json",
  "./data/torneig.json",
  "./manifest.webmanifest",
  "./assets/escut-180.png",
  "./assets/favicon.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CAU)
      // 'reload' evita que la memòria del navegador ens coli una versió antiga.
      .then((cau) => cau.addAll(BASE.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CAU).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;
  if (new URL(peticion.url).origin !== self.location.origin) return;

  evento.respondWith(
    // Es reconstrueix la petició per poder saltar-se la memòria del navegador.
    fetch(new Request(peticion.url, { cache: "no-store", credentials: "same-origin" }))
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CAU).then((cau) => cau.put(peticion, copia));
        }
        return respuesta;
      })
      .catch(() =>
        caches.match(peticion).then((guardada) => guardada || caches.match("./index.html"))
      )
  );
});
