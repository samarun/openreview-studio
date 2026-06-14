/*
 * CSInterface.js – minimal Adobe CEP 9+ interface library.
 *
 * Bridges the HTML/JS panel to the host application (Premiere Pro, After Effects, etc.)
 * via the __adobe_cep__ object injected by the CEP runtime.
 *
 * Based on the public Adobe CEP SDK CSInterface.js
 * (https://github.com/nicbarker/Adobe-CEP-CSInterface.js).
 */

/* eslint-disable no-var */

var SystemPath = {
  USER_DATA: "userData",
  COMMON_FILES: "commonFiles",
  MY_DOCUMENTS: "myDocuments",
  APPLICATION: "application",
  EXTENSION: "extension",
  HOST_APPLICATION: "hostApplication",
};

function CSInterface() {}

CSInterface.prototype.evalScript = function (script, callback) {
  if (window.__adobe_cep__) {
    if (typeof callback === "function") {
      window.__adobe_cep__.evalScript(script, callback);
    } else {
      window.__adobe_cep__.evalScript(script);
    }
  } else {
    if (typeof callback === "function") {
      callback("EvalScript_ErrMessage");
    }
  }
};

CSInterface.prototype.getSystemPath = function (pathType) {
  if (!window.__adobe_cep__) return "";
  var path = decodeURI(window.__adobe_cep__.getSystemPath(pathType));
  return path;
};

CSInterface.prototype.getHostEnvironment = function () {
  if (!window.__adobe_cep__) return null;
  var env = JSON.parse(window.__adobe_cep__.getHostEnvironment());
  return env;
};

CSInterface.prototype.getExtensionID = function () {
  return this.getHostEnvironment()
    ? this.getHostEnvironment().extensionId || ""
    : "";
};

CSInterface.prototype.addEventListener = function (type, listener, obj) {
  if (window.__adobe_cep__) {
    window.__adobe_cep__.addEventListener(type, listener, obj);
  }
};

CSInterface.prototype.removeEventListener = function (type, listener, obj) {
  if (window.__adobe_cep__) {
    window.__adobe_cep__.removeEventListener(type, listener, obj);
  }
};

CSInterface.prototype.dispatchEvent = function (event) {
  if (window.__adobe_cep__) {
    window.__adobe_cep__.dispatchEvent(event);
  }
};

CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
  if (window.__adobe_cep__) {
    window.__adobe_cep__.requestOpenExtension(extensionId, params || "");
  }
};

CSInterface.prototype.closeExtension = function () {
  if (window.__adobe_cep__) {
    window.__adobe_cep__.closeExtension();
  }
};

CSInterface.prototype.getApplicationID = function () {
  var env = this.getHostEnvironment();
  return env ? env.appId || "" : "";
};
