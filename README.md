# Olimpiadas2026

Web del equipo para las **Olimpíades de Begues 2026** (14–29 de agosto).

**https://whiteriggs.github.io/Olimpiadas2026/**

- **Calendario** completo de pruebas por día, hora y sede, con los límites de las lligues.
- **Apuntarse** a los esports en los que quieres jugar.
- **Disponibilidad** día a día (sí / potser / no).
- **Vista de equipo**: quién se ha apuntado a qué y tabla de disponibilidad.

Interfaz en catalán. HTML, CSS y JavaScript sin dependencias ni build.

## Ejecutar en local

```sh
python3 -m http.server 8000
# abrir http://localhost:8000
```

Hace falta un servidor (aunque sea local) porque la app usa módulos ES y `fetch`.

## Actualizar el calendario

Los horarios son provisionales. El origen es la pestaña *Calendari* de la hoja de
cálculo de la organización (la misma que alimenta su web);
`scripts/importar_calendario.py` la convierte al JSON que consume la web y de paso
descarta lo que es solo del equipo femenino.

Una acción programada ([.github/workflows/actualitza-calendari.yml](.github/workflows/actualitza-calendari.yml))
lo hace sola cada día a las 6:00 UTC y solo hace commit si el calendario ha
cambiado. También se puede lanzar a mano desde la pestaña *Actions*.

Para hacerlo en local:

```sh
python3 scripts/importar_calendario.py                      # descarga la hoja publicada
python3 scripts/importar_calendario.py data/calendario-original.csv   # desde el CSV guardado
python3 scripts/importar_torneig.py                         # equipos, cuadros y puntos
```

El script aborta si detecta menos de 50 pruebas, señal de que la hoja ha cambiado
de formato y el parser necesita revisión.

Genera `data/calendario.json` con:

| campo | contenido |
| --- | --- |
| `pruebas` | cada franja del calendario: esport, detalle (ronda), fecha, hora, sede, rivales y nota |
| `lligues` | esports sin horario fijo (petanca, dòmino, tennis, frontó, pàdel, billar) |
| `limites` | fechas límite de cada ronda de las lligues |
| `avisos` | notas sueltas de la hoja (hoy vacío) |

`scripts/importar_torneig.py` genera además `data/torneig.json` cruzando las
pestañas *Equips* y *Masculí* con el sorteo que la organización publica en
[su repo](https://github.com/jordilolapay/clubbegues) (del que guardamos copia en
`data/sorteig.json`). Resuelve los 15 partidos de cada cuadro, deduce los puestos
finales y reparte los puntos del reglamento, así que la web sabe contra quién
jugamos, qué hemos ganado y en qué posición de la general vamos.

El equipo propio se detecta buscando el nombre *Diablos* en la pestaña *Equips*:
hasta que la organización no lo escriba, la pestaña de puntos lo avisa.

## Compartir los datos con el equipo

Los datos viven en un Google Sheet a través de un Apps Script publicado como
aplicación web; la URL está en [config.js](config.js). El backend solo responde
si la petición lleva el código de acceso que hay en la constante `CODI` de
[backend/apps-script.gs](backend/apps-script.gs), y la web lo pide al entrar.

El código evita que un curioso lea la lista, pero no es seguridad real: quien
mire el tráfico de la web lo encuentra. Por eso solo se guardan nombre, esports,
disponibilidad y comentario.

Para cambiar el código, edita `CODI` en el Apps Script y publica una versión
nueva (*Implementar → Gestionar implementaciones → Editar → Versión nueva*), así
la URL no cambia.

Sin backend la web también funciona: deja `API_URL` vacío y cada persona guarda
lo suyo en su navegador, sin compartirlo con nadie.

## Partidos que hay que acordar

Billar, Dòmino, Frontó, Pàdel, Petanca y Tennis no tienen horario en el
calendario oficial: cada eliminatoria se juega cuando los dos equipos quedan,
antes de la fecha límite de la ronda. La tarjeta *Partits per quedar* del
calendario lista nuestro siguiente partido de cada uno de esos deportes con su
límite, y desde ahí se pone día, hora y sitio.

Esos acuerdos se guardan en la misma hoja `inscripcions` que la gente, como
filas con `tipus: "partit"` e id `partit:<esport>:<partit>`. Así no hace falta
tocar ni volver a publicar el Apps Script. La web las separa al cargarlas y las
pinta en el calendario como una prueba más.

## Publicar

Publicada con GitHub Pages desde `main` / `root`. Cada `git push` a `main`
actualiza el sitio en un par de minutos.

## Estructura

```
index.html                      página única con las tres pestañas
styles.css
config.js                       URL del backend (vacío = modo local)
manifest.webmanifest            PWA: nombre, colores e iconos
sw.js                           service worker (red primero, caché de reserva)
js/app.js                       render y lógica de la interfaz
js/store.js                     persistencia local + remota y código de acceso
assets/                         escudo del equipo e iconos
data/calendario.json            calendario generado
data/calendario-original.csv    export original de la hoja
scripts/importar_calendario.py  conversor CSV → JSON
backend/apps-script.gs          backend opcional
```
