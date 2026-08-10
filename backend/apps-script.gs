/**
 * Backend opcional para Olimpiadas2026 (Google Apps Script).
 *
 * 1. Crea una hoja de cálculo nueva en Google Drive.
 * 2. Extensiones → Apps Script, pega este archivo y guarda.
 * 3. Implementar → Nueva implementación → Aplicación web.
 *      Ejecutar como: yo
 *      Quién tiene acceso: cualquier usuario
 * 4. Copia la URL que acaba en /exec y ponla en config.js como API_URL.
 *
 * Nota: cualquiera con la URL puede leer y escribir. Es un enlace privado
 * pensado solo para el equipo; no metas datos sensibles.
 */

var HOJA = 'inscripciones';
var CABECERAS = ['id', 'nombre', 'telefono', 'esports', 'comentario', 'actualizado', 'datos'];

function hoja_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var h = libro.getSheetByName(HOJA);
  if (!h) {
    h = libro.insertSheet(HOJA);
    h.appendRow(CABECERAS);
  }
  return h;
}

function leerTodo_() {
  var h = hoja_();
  var filas = h.getDataRange().getValues();
  var personas = [];
  for (var i = 1; i < filas.length; i++) {
    var crudo = filas[i][CABECERAS.indexOf('datos')];
    if (!crudo) continue;
    try {
      personas.push(JSON.parse(crudo));
    } catch (e) {
      // fila corrupta: se ignora
    }
  }
  return personas;
}

function fila_(persona) {
  return [
    persona.id,
    persona.nombre || '',
    persona.telefono || '',
    (persona.esports || []).join(', '),
    persona.comentario || '',
    persona.actualizado || '',
    JSON.stringify(persona),
  ];
}

function buscarFila_(h, id) {
  var ids = h.getRange(1, 1, Math.max(h.getLastRow(), 1), 1).getValues();
  for (var i = 1; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 1;
  }
  return 0;
}

function json_(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doGet() {
  return json_(leerTodo_());
}

function doPost(e) {
  var bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(20000);
  try {
    var cuerpo = JSON.parse(e.postData.contents);
    var h = hoja_();

    if (cuerpo.accion === 'borrar') {
      var f = buscarFila_(h, cuerpo.id);
      if (f) h.deleteRow(f);
      return json_({ ok: true });
    }

    var persona = cuerpo.persona;
    if (!persona || !persona.id || !persona.nombre) {
      return json_({ ok: false, error: 'faltan datos' });
    }
    var destino = buscarFila_(h, persona.id);
    if (destino) {
      h.getRange(destino, 1, 1, CABECERAS.length).setValues([fila_(persona)]);
    } else {
      h.appendRow(fila_(persona));
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    bloqueo.releaseLock();
  }
}
