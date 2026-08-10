# Olimpiadas2026

Web del equipo para las **Olimpíades de Begues 2026** (14–29 de agosto).

- **Calendario** completo de pruebas por día, hora y sede, con los límites de las lligues.
- **Apuntarse** a los esports en los que quieres jugar.
- **Disponibilidad** día a día (sí / quizás / no).
- **Vista de equipo**: quién se ha apuntado a qué y tabla de disponibilidad.

HTML, CSS y JavaScript sin dependencias ni build.

## Ejecutar en local

```sh
python3 -m http.server 8000
# abrir http://localhost:8000
```

Hace falta un servidor (aunque sea local) porque la app usa módulos ES y `fetch`.

## Actualizar el calendario

Los horarios son provisionales. El origen es la hoja de cálculo de la organización;
`scripts/importar_calendario.py` la convierte al JSON que consume la web.

```sh
python3 scripts/importar_calendario.py                      # descarga la hoja publicada
python3 scripts/importar_calendario.py data/calendario-original.csv   # desde el CSV guardado
```

Genera `data/calendario.json` con:

| campo | contenido |
| --- | --- |
| `pruebas` | cada franja del calendario: esport, detalle (fase), fecha, hora, sede |
| `lligues` | esports sin horario fijo (petanca, dòmino, tennis, frontó, pàdel, billar) |
| `limites` | fechas límite de cada ronda de las lligues |
| `avisos` | notas de la hoja, p. ej. campo de fútbol 11 ocupado |

## Compartir los datos con el equipo

Por defecto todo se guarda en el `localStorage` del navegador: cada persona ve
solo lo suyo. Para que el equipo comparta inscripciones hay dos opciones.

**Opción A — Google Apps Script (recomendada).** Sigue las instrucciones de
[backend/apps-script.gs](backend/apps-script.gs) y pega la URL `/exec` en
[config.js](config.js):

```js
window.CONFIG = { API_URL: "https://script.google.com/macros/s/.../exec" };
```

**Opción B — sin backend.** Cada persona rellena lo suyo, exporta el JSON desde
la pestaña *Equipo* y alguien junta los archivos e importa el resultado.

## Publicar

Al ser estática vale cualquier hosting. Con GitHub Pages: *Settings → Pages →
Deploy from a branch → `main` / `root`.*

## Estructura

```
index.html                      página única con las tres pestañas
styles.css
config.js                       URL del backend (vacío = modo local)
js/app.js                       render y lógica de la interfaz
js/store.js                     persistencia local + remota
data/calendario.json            calendario generado
data/calendario-original.csv    export original de la hoja
scripts/importar_calendario.py  conversor CSV → JSON
backend/apps-script.gs          backend opcional
```
