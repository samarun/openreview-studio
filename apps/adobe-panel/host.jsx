/* JSON polyfill for ExtendScript (ES3) — JSON is not built in. */
if (typeof JSON !== "object" || JSON === null) {
  JSON = {};
}

(function () {
  function escapeString(s) {
    var result = '"';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var code = s.charCodeAt(i);
      if (c === '"') { result += '\\"'; }
      else if (c === '\\') { result += '\\\\'; }
      else if (c === '\b') { result += '\\b'; }
      else if (c === '\f') { result += '\\f'; }
      else if (c === '\n') { result += '\\n'; }
      else if (c === '\r') { result += '\\r'; }
      else if (c === '\t') { result += '\\t'; }
      else if (code < 32) {
        var hex = code.toString(16);
        result += '\\u' + ('0000' + hex).slice(-4);
      }
      else { result += c; }
    }
    return result + '"';
  }

  function stringifyValue(val) {
    if (val === null || typeof val === "undefined") { return "null"; }
    if (typeof val === "boolean") { return val ? "true" : "false"; }
    if (typeof val === "number") { return isFinite(val) ? String(val) : "null"; }
    if (typeof val === "string") { return escapeString(val); }
    if (val instanceof Array) {
      var items = [];
      for (var i = 0; i < val.length; i++) {
        items.push(stringifyValue(val[i]));
      }
      return "[" + items.join(",") + "]";
    }
    if (typeof val === "object") {
      var pairs = [];
      for (var k in val) {
        if (val.hasOwnProperty(k)) {
          var v = stringifyValue(val[k]);
          if (typeof v === "string") {
            pairs.push(escapeString(String(k)) + ":" + v);
          }
        }
      }
      return "{" + pairs.join(",") + "}";
    }
    return undefined;
  }

  if (typeof JSON.stringify !== "function") {
    JSON.stringify = function (value) { return stringifyValue(value); };
  }

  if (typeof JSON.parse !== "function") {
    JSON.parse = function (text) {
      return eval("(" + String(text) + ")");
    };
  }
})();

function isPremierePro() {
  try {
    if (typeof app === "undefined") return false;
    if (app.project && ("activeSequence" in app.project)) return true;
    if (typeof app.name === "string" && app.name.indexOf("Premiere") >= 0) return true;
    if (typeof BridgeTalk !== "undefined" && typeof BridgeTalk.appName === "string" && BridgeTalk.appName.indexOf("premiere") >= 0) return true;
  } catch (e) {}
  return false;
}

function isAfterEffects() {
  try {
    if (typeof app === "undefined") return false;
    if (typeof app.name === "string" && app.name.indexOf("After Effects") >= 0) return true;
    if (typeof BridgeTalk !== "undefined" && typeof BridgeTalk.appName === "string" && BridgeTalk.appName.indexOf("aftereffects") >= 0) return true;
    if (app.project && ("activeItem" in app.project) && !("activeSequence" in app.project)) return true;
  } catch (e) {}
  return false;
}

function openReviewGetHostInfo() {
  var info = { detected: "unknown" };
  try { info.appExists = typeof app !== "undefined"; } catch (e) { info.appExists = false; }
  try { info.appName = String(app.name); } catch (e) { info.appName = "error:" + e.message; }
  try { info.hasProject = Boolean(app.project); } catch (e) { info.hasProject = false; }
  try { info.hasActiveSequence = ("activeSequence" in app.project); } catch (e) { info.hasActiveSequence = false; }
  try { info.bridgeTalk = String(BridgeTalk.appName); } catch (e) { info.bridgeTalk = "unavailable"; }
  info.isPremiere = isPremierePro();
  info.isAE = isAfterEffects();
  if (info.isPremiere) info.detected = "Premiere Pro";
  if (info.isAE) info.detected = "After Effects";
  return JSON.stringify(info);
}

var TICKS_PER_SECOND = 254016000000;

function openReviewJumpToSeconds(seconds) {
  seconds = Number(seconds);

  if (!isFinite(seconds) || seconds < 0) {
    return "Invalid marker time";
  }

  if (isPremierePro()) {
    var activeSequence = app.project.activeSequence;
    if (!activeSequence) {
      return "No active sequence";
    }

    var ticks = seconds * TICKS_PER_SECOND;
    activeSequence.setPlayerPosition(ticks.toString());
    return "ok";
  }

  if (isAfterEffects()) {
    var comp = app.project.activeItem;
    if (!comp || !comp.time) {
      return "No active comp";
    }

    comp.time = seconds;
    return "ok";
  }

  return "Unsupported host: " + (app.name || "unknown");
}

function openReviewString(value, fallback, maxLength) {
  if (value === undefined || value === null) {
    return fallback;
  }

  var text = String(value).replace(/[\r\n\t]+/g, " ");

  if (text.length > maxLength) {
    return text.substring(0, maxLength - 1) + "…";
  }

  return text;
}

function openReviewNormalizeMarkers(payloadJson) {
  var parsed = JSON.parse(payloadJson);

  if (!parsed || typeof parsed.length !== "number") {
    throw new Error("Marker payload must be an array");
  }

  var markers = [];
  var maxMarkers = Math.min(parsed.length, 500);

  for (var i = 0; i < maxMarkers; i += 1) {
    var item = parsed[i];
    var seconds = Number(item && item.seconds);

    if (!isFinite(seconds) || seconds < 0) {
      continue;
    }

    markers.push({
      seconds: seconds,
      author: openReviewString(item.author, "Reviewer", 120),
      body: openReviewString(item.body, "", 4000),
      resolved: Boolean(item.resolved),
      hasDrawing: Boolean(item.hasDrawing)
    });
  }

  return markers;
}

function openReviewImportMarkers(payloadJson) {
  var markers;

  try {
    markers = openReviewNormalizeMarkers(payloadJson);
  } catch (error) {
    return "Invalid marker payload: " + error.message;
  }

  if (markers.length === 0) {
    return "No valid markers to import.";
  }

  if (isPremierePro()) {
    var sequence = app.project.activeSequence;
    if (!sequence) {
      return "No active sequence";
    }

    for (var i = 0; i < markers.length; i += 1) {
      var marker = markers[i];
      var sequenceMarker = sequence.markers.createMarker(marker.seconds);
      sequenceMarker.name = "OpenReview: " + marker.author;
      var commentText = marker.body;
      if (marker.hasDrawing) {
        commentText += "\n[Has drawing annotation]";
      }
      if (marker.resolved) {
        commentText += "\nResolved";
      }
      sequenceMarker.comments = commentText;
    }

    return "Imported " + markers.length + " markers into Premiere Pro.";
  }

  if (isAfterEffects()) {
    var comp = app.project.activeItem;
    if (!comp || !comp.markerProperty) {
      return "No active comp";
    }

    for (var j = 0; j < markers.length; j += 1) {
      var aeMarker = markers[j];
      var markerValue = new MarkerValue("OpenReview: " + aeMarker.author);
      markerValue.comment = aeMarker.body + (aeMarker.resolved ? "\nResolved" : "");
      comp.markerProperty.setValueAtTime(aeMarker.seconds, markerValue);
    }

    return "Imported " + markers.length + " markers into After Effects.";
  }

  return "Unsupported host: " + (app.name || "unknown");
}

function openReviewImportFile(filePath) {
  if (!filePath) {
    return JSON.stringify({ error: "No file path provided." });
  }

  var file = new File(filePath);
  if (!file.exists) {
    return JSON.stringify({ error: "File not found: " + filePath });
  }

  if (isPremierePro()) {
    var success = app.project.importFiles([filePath], true);
    if (success) {
      return JSON.stringify({ success: true, host: getHostLabel() });
    }
    return JSON.stringify({ error: "Premiere Pro importFiles() failed." });
  }

  if (isAfterEffects()) {
    var importOptions = new ImportOptions(file);
    var imported = app.project.importFile(importOptions);
    if (imported) {
      return JSON.stringify({ success: true, host: getHostLabel() });
    }
    return JSON.stringify({ error: "After Effects importFile() failed." });
  }

  return JSON.stringify({ error: "Unsupported host. Debug: " + openReviewGetHostInfo() });
}

function getHostLabel() {
  try { return String(app.name) || "Adobe App"; } catch (e) { return "Adobe App"; }
}

function openReviewGetActiveSequenceInfo() {
  var hostLabel = getHostLabel();
  if (!isPremierePro()) {
    return JSON.stringify({ host: hostLabel, sequenceName: null });
  }

  var sequence = app.project.activeSequence;
  if (!sequence) {
    return JSON.stringify({ host: hostLabel, sequenceName: null, error: "No active sequence" });
  }

  return JSON.stringify({
    host: hostLabel,
    sequenceName: sequence.name,
    durationSeconds: Number(sequence.end) || 0
  });
}

function openReviewFileExists(filePath) {
  try {
    var f = new File(filePath);
    if (f.exists) {
      return JSON.stringify({ exists: true, size: f.length });
    }
    return JSON.stringify({ exists: false, size: 0 });
  } catch (e) {
    return JSON.stringify({ exists: false, size: 0, error: e.message });
  }
}

function openReviewMkdir(dirPath) {
  try {
    var folder = new Folder(dirPath);
    if (!folder.exists) {
      folder.create();
    }
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ error: "mkdir failed: " + e.message });
  }
}

function _openReviewBase64Decode(input) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var cleaned = "";
  var x, ch;
  for (x = 0; x < input.length; x++) {
    ch = input.charAt(x);
    if (chars.indexOf(ch) >= 0) {
      cleaned += ch;
    }
  }
  var result = "";
  for (var i = 0; i < cleaned.length; i += 4) {
    var a = chars.indexOf(cleaned.charAt(i));
    var b = (i + 1 < cleaned.length) ? chars.indexOf(cleaned.charAt(i + 1)) : 0;
    var c = (i + 2 < cleaned.length) ? chars.indexOf(cleaned.charAt(i + 2)) : -1;
    var d = (i + 3 < cleaned.length) ? chars.indexOf(cleaned.charAt(i + 3)) : -1;
    result += String.fromCharCode((a << 2) | (b >> 4));
    if (c >= 0) result += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d >= 0) result += String.fromCharCode(((c & 3) << 6) | d);
  }
  return result;
}

function _openReviewBase64Encode(data) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var result = "";
  for (var i = 0; i < data.length; i += 3) {
    var a = data.charCodeAt(i);
    var b = (i + 1 < data.length) ? data.charCodeAt(i + 1) : 0;
    var c = (i + 2 < data.length) ? data.charCodeAt(i + 2) : 0;
    result += chars.charAt(a >> 2);
    result += chars.charAt(((a & 3) << 4) | (b >> 4));
    if (i + 1 < data.length) {
      result += chars.charAt(((b & 15) << 2) | (c >> 6));
    } else {
      result += "=";
    }
    if (i + 2 < data.length) {
      result += chars.charAt(c & 63);
    } else {
      result += "=";
    }
  }
  return result;
}

function openReviewReadFileChunk(filePath, offsetBytes, chunkSize) {
  try {
    var f = new File(filePath);
    f.encoding = "BINARY";
    if (!f.open("r")) {
      return JSON.stringify({ error: "Cannot open file: " + filePath });
    }
    if (offsetBytes > 0) {
      f.seek(offsetBytes);
    }
    var data = f.read(chunkSize);
    f.close();
    if (data === null || data === undefined) {
      data = "";
    }
    return JSON.stringify({ data: _openReviewBase64Encode(data), bytesRead: data.length });
  } catch (e) {
    return JSON.stringify({ error: "Read failed: " + e.message });
  }
}

function openReviewWriteFileChunk(filePath, base64Data, mode) {
  try {
    var decoded = _openReviewBase64Decode(base64Data);
    var f = new File(filePath);
    f.encoding = "BINARY";
    if (mode === "append") {
      f.open("a");
    } else {
      var parent = f.parent;
      if (parent && !parent.exists) {
        parent.create();
      }
      f.open("w");
    }
    f.write(decoded);
    f.close();
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ error: "Write failed: " + e.message });
  }
}

function _openReviewSearchPresetsFolder(presetsFolder) {
  var allItems = presetsFolder.getFiles();
  if (!allItems) return null;

  var matchSourceHigh = null;
  var matchSource = null;
  var anyPreset = null;

  for (var s = 0; s < allItems.length; s++) {
    if (!(allItems[s] instanceof Folder)) continue;

    var eprFiles = allItems[s].getFiles("*.epr");
    if (!eprFiles || eprFiles.length === 0) continue;

    for (var e = 0; e < eprFiles.length; e++) {
      var fName = String(eprFiles[e].name).toLowerCase();

      if (fName.indexOf("match source") >= 0 && fName.indexOf("high") >= 0) {
        matchSourceHigh = eprFiles[e].fsName;
      } else if (fName.indexOf("match source") >= 0 && !matchSource) {
        matchSource = eprFiles[e].fsName;
      }

      if (!anyPreset) {
        anyPreset = eprFiles[e].fsName;
      }
    }
  }

  return matchSourceHigh || matchSource || anyPreset || null;
}

function _openReviewFindH264Preset() {
  var searchPaths = [];

  try {
    if (typeof app !== "undefined" && app.path) {
      var appPathStr = String(app.path);
      searchPaths.push(appPathStr + "/MediaIO/systempresets");
      searchPaths.push(appPathStr + "/Contents/MediaIO/systempresets");
    }
  } catch (ignored) {}

  var years = ["2025", "2024", "2023", "2022", "2021", "2020"];
  for (var y = 0; y < years.length; y++) {
    var dirName = "Adobe Premiere Pro " + years[y];
    searchPaths.push("/Applications/" + dirName + "/" + dirName + ".app/Contents/MediaIO/systempresets");
  }
  searchPaths.push("/Applications/Adobe Premiere Pro/Adobe Premiere Pro.app/Contents/MediaIO/systempresets");

  for (var i = 0; i < searchPaths.length; i++) {
    var presetsFolder = new Folder(searchPaths[i]);
    if (!presetsFolder.exists) continue;

    var preset = _openReviewSearchPresetsFolder(presetsFolder);
    if (preset) return preset;
  }

  return null;
}

function openReviewExportActiveSequence() {
  if (!isPremierePro()) {
    return JSON.stringify({ error: "Upload active sequence requires Adobe Premiere Pro. Debug: " + openReviewGetHostInfo() });
  }

  var sequence = app.project.activeSequence;
  if (!sequence) {
    return JSON.stringify({ error: "No active sequence selected." });
  }

  try {
    var safeName = String(sequence.name).replace(/[^\w.-]+/g, "_");
    if (!safeName) {
      safeName = "sequence";
    }

    var exportFolder = new Folder(Folder.myDocuments.fsName + "/OpenReview/exports");
    if (!exportFolder.exists) {
      exportFolder.create();
    }

    var outputFile = new File(exportFolder.fsName + "/" + safeName + "-" + new Date().getTime() + ".mp4");

    var presetPath = _openReviewFindH264Preset();

    if (!presetPath) {
      return JSON.stringify({
        error: "Could not find an H.264 export preset in your Premiere Pro installation. " +
               "Please export your sequence manually (File \u2192 Export \u2192 Media), then use 'Upload video file' below."
      });
    }

    var directSuccess = false;
    try {
      sequence.exportAsMediaDirect(outputFile.fsName, presetPath, 0);
      var checkFile = new File(outputFile.fsName);
      if (checkFile.exists && checkFile.length > 0) {
        directSuccess = true;
      }
    } catch (directErr) {
      /* exportAsMediaDirect failed — fall through to app.encoder */
    }

    if (directSuccess) {
      var fileSize = new File(outputFile.fsName).length;
      return JSON.stringify({
        path: outputFile.fsName,
        sequenceName: sequence.name,
        fileSize: fileSize
      });
    }

    if (typeof app.encoder !== "undefined" && app.encoder) {
      try {
        app.encoder.launchEncoder();
        var jobId = app.encoder.encodeSequence(
          sequence,
          outputFile.fsName,
          presetPath,
          0,
          1
        );
        app.encoder.startBatch();

        if (jobId) {
          return JSON.stringify({
            path: outputFile.fsName,
            sequenceName: sequence.name,
            fileSize: 0,
            method: "encoder"
          });
        }
      } catch (encErr) {
        /* app.encoder also failed — fall through to error */
      }
    }

    return JSON.stringify({
      error: "Export failed. Premiere Pro could not render the sequence with the found preset (" +
             presetPath + "). Please export manually (File \u2192 Export \u2192 Media), " +
             "then use 'Upload video file' below."
    });
  } catch (e) {
    return JSON.stringify({ error: "Export failed: " + (e.message || String(e)) });
  }
}
