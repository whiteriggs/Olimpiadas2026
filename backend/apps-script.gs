/**
 * Backend d'Olimpiadas2026 (Google Apps Script).
 *
 * 1. Crea un full de càlcul nou a Google Drive.
 * 2. Extensions → Apps Script, enganxa aquest fitxer i desa.
 * 3. Implementar → Nova implementació → Aplicació web.
 *      Executar com: jo
 *      Qui hi té accés: qualsevol usuari
 * 4. Copia la URL que acaba en /exec i posa-la a config.js com a API_URL.
 *
 * Si canvies aquest fitxer: Implementar → Gestionar implementacions → Edita →
 * Versió nova. Així la URL no canvia.
 */

var CODI = '1573';
var FULL = 'inscripcions';
var CAPCALERES = ['id', 'nom', 'esports', 'comentari', 'actualitzat', 'dades'];

function full_() {
  var llibre = SpreadsheetApp.getActiveSpreadsheet();
  var f = llibre.getSheetByName(FULL);
  if (!f) {
    f = llibre.insertSheet(FULL);
    f.appendRow(CAPCALERES);
  }
  return f;
}

function llegirTot_() {
  var files = full_().getDataRange().getValues();
  var persones = [];
  for (var i = 1; i < files.length; i++) {
    var cru = files[i][CAPCALERES.indexOf('dades')];
    if (!cru) continue;
    try {
      persones.push(JSON.parse(cru));
    } catch (e) {
      // fila corrupta: s'ignora
    }
  }
  return persones;
}

function fila_(persona) {
  return [
    persona.id,
    persona.nombre || '',
    (persona.esports || []).join(', '),
    persona.comentario || '',
    persona.actualizado || '',
    JSON.stringify(persona),
  ];
}

function buscarFila_(f, id) {
  var ids = f.getRange(1, 1, Math.max(f.getLastRow(), 1), 1).getValues();
  for (var i = 1; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 1;
  }
  return 0;
}

function json_(dades) {
  return ContentService.createTextOutput(JSON.stringify(dades)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doGet(e) {
  if (!e || !e.parameter || e.parameter.codi !== CODI) {
    return json_({ error: 'codi' });
  }
  return json_(llegirTot_());
}

function doPost(e) {
  var pany = LockService.getScriptLock();
  pany.waitLock(20000);
  try {
    var cos = JSON.parse(e.postData.contents);
    if (cos.codi !== CODI) return json_({ error: 'codi' });

    var f = full_();

    if (cos.accion === 'borrar') {
      var fila = buscarFila_(f, cos.id);
      if (fila) f.deleteRow(fila);
      return json_({ ok: true });
    }

    var persona = cos.persona;
    if (!persona || !persona.id || !persona.nombre) {
      return json_({ ok: false, error: 'falten dades' });
    }
    var desti = buscarFila_(f, persona.id);
    if (desti) {
      f.getRange(desti, 1, 1, CAPCALERES.length).setValues([fila_(persona)]);
    } else {
      f.appendRow(fila_(persona));
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    pany.releaseLock();
  }
}
