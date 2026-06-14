declare const CSInterface: new () => { evalScript(script: string, callback?: (result: string) => void): void };

type CepNodeWindow = Window & {
  cep_node?: { require: (id: "fs") => typeof import("fs") };
};

type Project = {
  id: string;
  name: string;
  assets: Array<{
    id: string;
    name: string;
    versions: Array<{ id: string; versionNumber: number; status: string }>;
  }>;
};

type AnnotationPoint = { x: number; y: number };

type AnnotationPath = {
  kind?: "freehand";
  color: string;
  points: AnnotationPoint[];
};

type AnnotationShape = {
  kind: "rectangle" | "circle" | "arrow" | "text";
  color: string;
  start: AnnotationPoint;
  end: AnnotationPoint;
  text?: string;
};

type AnnotationData = {
  type: "annotation" | "freehand";
  shapes?: AnnotationShape[];
  paths: AnnotationPath[];
  endSeconds?: number | null;
};

type ReviewComment = {
  id: string;
  body: string;
  timeSeconds: number;
  resolvedAt: string | null;
  annotationJson: AnnotationData | null;
  author: { email: string; name: string | null } | null;
  guestReviewer: { email: string | null; name: string } | null;
};

type VersionMediaInfo = {
  proxyKey: string | null;
  thumbnailKey: string | null;
  width: number | null;
  height: number | null;
};

type PresignedUpload = {
  uploadUrl: string;
  originalKey: string;
};

const apiUrlInput = document.getElementById("apiUrl") as HTMLInputElement | null;
const emailInput = document.getElementById("email") as HTMLInputElement | null;
const passwordInput = document.getElementById("password") as HTMLInputElement | null;
const projectSelect = document.getElementById("projectSelect") as HTMLSelectElement | null;
const assetSelect = document.getElementById("assetSelect") as HTMLSelectElement | null;
const assetNameInput = document.getElementById("assetName") as HTMLInputElement | null;
const sequencePill = document.getElementById("sequencePill") as HTMLSpanElement | null;
const versionSelect = document.getElementById("versionSelect") as HTMLSelectElement | null;
const fileInput = document.getElementById("fileInput") as HTMLInputElement | null;
const progressWrap = document.getElementById("progressWrap") as HTMLDivElement | null;
const progressBar = document.getElementById("progressBar") as HTMLSpanElement | null;
const loginButton = document.getElementById("login");
const logoutButton = document.getElementById("logout");
const refreshProjectsButton = document.getElementById("refreshProjects");
const loadCommentsButton = document.getElementById("loadComments");
const importMarkersButton = document.getElementById("importMarkers");
const uploadSequenceButton = document.getElementById("uploadSequence");
const uploadFileButton = document.getElementById("uploadFile");
const uploadVersionButton = document.getElementById("uploadVersion");
const downloadToProjectButton = document.getElementById("downloadToProject");
const downloadProgressWrap = document.getElementById("downloadProgressWrap") as HTMLDivElement | null;
const downloadProgressBar = document.getElementById("downloadProgressBar") as HTMLSpanElement | null;
const commentsElement = document.getElementById("comments");
const statusElement = document.getElementById("status");
const signInFieldsDiv = document.getElementById("signInFields");
const signedInAsEl = document.getElementById("signedInAs");
const toastContainer = document.getElementById("toastContainer");

const drawingOverlay = document.getElementById("drawingOverlay") as HTMLDivElement | null;
const drawingCanvas = document.getElementById("drawingCanvas") as HTMLCanvasElement | null;
const overlayClose = document.getElementById("overlayClose");
const overlayInfo = document.getElementById("overlayInfo");
const overlayBody = document.getElementById("overlayBody");
const overlayPrev = document.getElementById("overlayPrev");
const overlayNext = document.getElementById("overlayNext");
const autoShowDrawings = document.getElementById("autoShowDrawings") as HTMLInputElement | null;
const drawingToggleRow = document.getElementById("drawingToggleRow");
const zoomInBtn = document.getElementById("zoomIn");
const zoomOutBtn = document.getElementById("zoomOut");
const zoomFitBtn = document.getElementById("zoomFit");
const zoomLevelEl = document.getElementById("zoomLevel");
const overlayCanvasWrap = drawingOverlay ? drawingOverlay.querySelector(".overlay-canvas-wrap") as HTMLDivElement | null : null;

let token = localStorage.getItem("openreview.panel.token") || "";
let projects: Project[] = [];
let comments: ReviewComment[] = [];
let eventsSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let currentDrawingIndex = -1;
let autoShowEnabled = false;
var cachedVersionMedia: VersionMediaInfo | null = null;
var cachedVersionMediaId = "";
var frameVideo: HTMLVideoElement | null = null;
var frameVideoProxyUrl = "";

var zoomLevel = 1;
var panX = 0;
var panY = 0;
var isPanning = false;
var panStartX = 0;
var panStartY = 0;
var panStartOffsetX = 0;
var panStartOffsetY = 0;
var lastBgSource: HTMLVideoElement | HTMLImageElement | null = null;
var lastAnnotation: AnnotationData | null = null;
var zoomDoubleClickedIn = false;

var ZOOM_MIN = 0.5;
var ZOOM_MAX = 5;
var ZOOM_STEP = 0.25;

const liveIndicator = document.getElementById("liveIndicator") as HTMLSpanElement | null;
const approvalBadge = document.getElementById("approvalBadge") as HTMLSpanElement | null;

type ReviewEventData = {
  type: string;
  assetVersionId: string;
  payload: Record<string, unknown>;
  at: string;
};

function getCsInterface() {
  if (typeof CSInterface === "undefined") {
    return null;
  }

  return new CSInterface();
}

function getFs(): typeof import("fs") | null {
  var fsResult: typeof import("fs") | null = null;

  try {
    if (typeof require === "function") {
      fsResult = require("fs");
    }
  } catch (_e) {}

  if (!fsResult) {
    try {
      var winReq = (window as any).require;
      if (typeof winReq === "function") {
        fsResult = winReq("fs");
      }
    } catch (_e) {}
  }

  if (!fsResult) {
    try {
      var globalReq: any = (0, eval)("typeof require==='function'?require:null");
      if (globalReq) {
        fsResult = globalReq("fs");
      }
    } catch (_e) {}
  }

  if (!fsResult) {
    try {
      var g = (typeof global !== "undefined" ? global : undefined) as any;
      if (g && typeof g.require === "function") {
        fsResult = g.require("fs");
      }
    } catch (_e) {}
  }

  if (!fsResult) {
    try {
      var cepNode = (window as CepNodeWindow).cep_node;
      if (cepNode) {
        fsResult = cepNode.require("fs");
      }
    } catch (_e) {}
  }

  return fsResult;
}

function readLocalFileXhr(filePath: string, timeoutMs: number = 30000): Promise<Uint8Array> {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    var url = filePath.indexOf("file://") === 0 ? filePath : "file://" + filePath;
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.timeout = timeoutMs;
    xhr.onload = function () {
      if (xhr.status === 0 || xhr.status === 200) {
        resolve(new Uint8Array(xhr.response as ArrayBuffer));
      } else {
        reject(new Error("Failed to read local file (status " + xhr.status + ")"));
      }
    };
    xhr.onerror = function () {
      reject(new Error("Failed to read local file: " + filePath));
    };
    xhr.ontimeout = function () {
      reject(new Error("Timed out reading local file: " + filePath));
    };
    xhr.send();
  });
}

async function readFileViaHost(filePath: string, fileSize: number, onProgress?: (percent: number) => void): Promise<Uint8Array> {
  var CHUNK_SIZE = 768 * 1024;
  var chunks: Uint8Array[] = [];
  var offset = 0;

  while (offset < fileSize) {
    var raw = await evalHostScript(
      "openReviewReadFileChunk(" + JSON.stringify(filePath) + "," + offset + "," + CHUNK_SIZE + ")"
    );
    var parsed: { data?: string; bytesRead?: number; error?: string } = JSON.parse(raw);
    if (parsed.error) throw new Error(parsed.error);
    if (!parsed.data || !parsed.bytesRead) break;

    var binaryStr = atob(parsed.data);
    var bytes = new Uint8Array(binaryStr.length);
    for (var i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    chunks.push(bytes);
    offset += parsed.bytesRead;

    if (onProgress) {
      onProgress(Math.round((offset / fileSize) * 100));
    }
  }

  if (chunks.length === 0) throw new Error("Read zero bytes from file: " + filePath);
  return concatUint8Arrays(chunks);
}

async function readExportFile(filePath: string, fileSize: number): Promise<Uint8Array> {
  var fs = getFs();
  if (fs) {
    try {
      return new Uint8Array(fs.readFileSync(filePath));
    } catch (fsErr) {
      console.warn("[openreview] fs.readFileSync failed, trying XHR fallback:", fsErr);
    }
  }

  try {
    return await readLocalFileXhr(filePath, 30000);
  } catch (xhrErr) {
    console.warn("[openreview] XHR file read failed, trying ExtendScript fallback:", xhrErr);
  }

  setStatus("Reading file via ExtendScript (fallback)\u2026");
  return await readFileViaHost(filePath, fileSize, function (percent) {
    setStatus("Reading file\u2026 " + percent + "%");
  });
}

function fileExistsViaHost(filePath: string): Promise<{ exists: boolean; size: number }> {
  return evalHostScript("openReviewFileExists(" + JSON.stringify(filePath) + ")").then(function (raw) {
    var parsed = JSON.parse(raw);
    return { exists: Boolean(parsed.exists), size: Number(parsed.size) || 0 };
  });
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  var totalLength = 0;
  for (var i = 0; i < chunks.length; i++) {
    totalLength += (chunks[i] as Uint8Array).byteLength;
  }
  var result = new Uint8Array(totalLength);
  var offset = 0;
  for (var j = 0; j < chunks.length; j++) {
    var chunk = chunks[j] as Uint8Array;
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function uint8ArrayToBase64(data: Uint8Array): string {
  var CHUNK = 8192;
  var parts: string[] = [];
  for (var i = 0; i < data.length; i += CHUNK) {
    var slice = data.subarray(i, i + CHUNK);
    parts.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return btoa(parts.join(""));
}

async function writeFileViaHost(filePath: string, data: Uint8Array): Promise<void> {
  var CHUNK_SIZE = 512 * 1024;
  var dirPath = filePath.replace(/[/\\][^/\\]*$/, "");
  if (dirPath) {
    await evalHostScript("openReviewMkdir(" + JSON.stringify(dirPath) + ")");
  }
  for (var offset = 0; offset < data.length; offset += CHUNK_SIZE) {
    var end = Math.min(offset + CHUNK_SIZE, data.length);
    var chunk = data.subarray(offset, end);
    var b64 = uint8ArrayToBase64(chunk);
    var mode = offset === 0 ? "write" : "append";
    var raw = await evalHostScript(
      "openReviewWriteFileChunk(" + JSON.stringify(filePath) + "," + JSON.stringify(b64) + "," + JSON.stringify(mode) + ")"
    );
    var parsed = JSON.parse(raw);
    if (parsed.error) throw new Error(parsed.error);
  }
}

function apiUrl() {
  var val = apiUrlInput ? apiUrlInput.value.replace(/\/+$/, "") : "";
  return val || "http://localhost:4000";
}

function setStatus(message: string) {
  if (statusElement) statusElement.textContent = message;
  console.log("[openreview] status:", message);
}

function flashStatus() {
  if (!statusElement) return;
  statusElement.style.transition = "background 0.3s";
  statusElement.style.background = "rgba(239,68,68,0.2)";
  setTimeout(function () {
    statusElement.style.background = "";
  }, 2000);
}

function showToast(message: string, type: "error" | "success" | "info", durationMs: number = 4000) {
  if (!toastContainer) return;

  var toast = document.createElement("div");
  toast.className = "toast toast-" + type;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  void toast.offsetHeight;
  toast.classList.add("toast-visible");

  setTimeout(function () {
    toast.classList.remove("toast-visible");
    toast.classList.add("toast-exit");
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, durationMs);
}

function setProgress(percent: number | null) {
  if (!progressWrap || !progressBar) return;

  if (percent === null) {
    progressWrap.hidden = true;
    progressBar.style.width = "0%";
    return;
  }

  progressWrap.hidden = false;
  progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

function evalHostScript(script: string) {
  return new Promise<string>((resolve, reject) => {
    const cs = getCsInterface();

    if (!cs) {
      reject(new Error("CEP runtime is unavailable. Open this inside Premiere Pro or After Effects."));
      return;
    }

    cs.evalScript(script, function (result: string) {
      if (result === "EvalScript_ErrMessage" || result === "EvalScript error.") {
        reject(new Error("Host script error — check the ExtendScript console for details."));
        return;
      }
      resolve(result);
    });
  });
}

function evalHostScriptWithTimeout(script: string, timeoutMs: number): Promise<string> {
  return new Promise<string>(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (!settled) {
        settled = true;
        reject(new Error(
          "Host script timed out after " + Math.round(timeoutMs / 1000) +
          "s. The operation may still be running in Premiere Pro."
        ));
      }
    }, timeoutMs);

    evalHostScript(script).then(
      function (result) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      },
      function (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      }
    );
  });
}

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const url = `${apiUrl()}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (networkErr) {
    console.error("[openreview] Network error for", url, networkErr);
    throw new Error(`Cannot reach API at ${apiUrl()} — is the server running?`);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (response.status === 401) {
      token = "";
      localStorage.removeItem("openreview.panel.token");
    }

    throw new Error(payload && payload.error ? JSON.stringify(payload.error) : "Request failed with " + response.status);
  }

  return payload as T;
}

function uploadFileToUrl(uploadUrl: string, data: Uint8Array, contentType: string, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.setRequestHeader("content-type", contentType);
    request.timeout = 10 * 60 * 1000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      reject(new Error("Upload failed with status " + request.status + ". Check that S3/MinIO is running and CORS is configured."));
    };
    request.onerror = () => reject(new Error("Upload network error — check that S3/MinIO is running at the configured endpoint."));
    request.ontimeout = () => reject(new Error("Upload timed out after 10 minutes."));
    request.send(new Blob([data as BlobPart], { type: contentType }));
  });
}

async function uploadOriginalBuffer(input: {
  projectId: string;
  filename: string;
  contentType: string;
  buffer: Uint8Array;
  onProgress: (percent: number) => void;
}) {
  const upload = await apiRequest<PresignedUpload>("/uploads/presign", {
    method: "POST",
    body: JSON.stringify({
      projectId: input.projectId,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.buffer.byteLength
    })
  });

  await uploadFileToUrl(upload.uploadUrl, input.buffer, input.contentType, input.onProgress);
  return upload.originalKey;
}

async function waitForExportFile(path: string, timeoutMs: number = 5 * 60 * 1000): Promise<number> {
  var fs = getFs();
  var started = Date.now();
  var attempts = 0;
  var lastError = "";

  while (Date.now() - started < timeoutMs) {
    attempts++;
    if (fs) {
      try {
        if (fs.existsSync(path)) {
          var stats = fs.statSync(path);
          if (stats.size > 0) return stats.size;
        }
      } catch (fsErr) {
        lastError = fsErr instanceof Error ? fsErr.message : String(fsErr);
        console.warn("[openreview] fs check attempt " + attempts + " failed:", lastError);
      }
    } else {
      try {
        var info = await fileExistsViaHost(path);
        if (info.exists && info.size > 0) return info.size;
      } catch (hostErr) {
        lastError = hostErr instanceof Error ? hostErr.message : String(hostErr);
        console.warn("[openreview] host file check attempt " + attempts + " failed:", lastError);
      }
    }

    await new Promise(function (resolve) { setTimeout(resolve, 500); });
  }

  throw new Error(
    "Export file not found after " + Math.round(timeoutMs / 1000) + "s (" + attempts + " checks). " +
    "Path: " + path + (lastError ? " Last error: " + lastError : "") +
    ". Try 'Upload video file' instead."
  );
}

function authorName(comment: ReviewComment) {
  return (comment.author && comment.author.name)
    || (comment.author && comment.author.email)
    || (comment.guestReviewer && comment.guestReviewer.name)
    || (comment.guestReviewer && comment.guestReviewer.email)
    || "Guest";
}

function getAnnotatedComments(): ReviewComment[] {
  var result: ReviewComment[] = [];
  for (var i = 0; i < comments.length; i++) {
    var c = comments[i] as ReviewComment;
    if (c.annotationJson) result.push(c);
  }
  return result;
}

function renderAnnotationOnCanvas(canvas: HTMLCanvasElement, annotation: AnnotationData, bgSource?: HTMLVideoElement | HTMLImageElement) {
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  lastAnnotation = annotation;
  if (bgSource) lastBgSource = bgSource;

  var aspect = 16 / 9;
  var activeBg = bgSource || lastBgSource;
  if (activeBg) {
    var bw = (activeBg as any).videoWidth || (activeBg as any).naturalWidth || 0;
    var bh = (activeBg as any).videoHeight || (activeBg as any).naturalHeight || 0;
    if (bw > 0 && bh > 0) {
      aspect = bw / bh;
    }
  }
  var displayW = canvas.parentElement ? canvas.parentElement.clientWidth : 640;
  var displayH = Math.round(displayW / aspect);
  var scale = window.devicePixelRatio || 1;

  canvas.style.width = displayW + "px";
  canvas.style.height = displayH + "px";
  canvas.width = Math.max(1, Math.floor(displayW * scale));
  canvas.height = Math.max(1, Math.floor(displayH * scale));
  ctx.scale(scale, scale);

  ctx.clearRect(0, 0, displayW, displayH);

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoomLevel, zoomLevel);

  if (activeBg) {
    ctx.drawImage(activeBg, 0, 0, displayW, displayH);
  } else {
    ctx.fillStyle = "#111113";
    ctx.fillRect(0, 0, displayW, displayH);
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;

  var shapes = annotation.shapes || [];
  for (var si = 0; si < shapes.length; si++) {
    var shape = shapes[si] as AnnotationShape;
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    var sx = shape.start.x * displayW;
    var sy = shape.start.y * displayH;
    var sw = (shape.end.x - shape.start.x) * displayW;
    var sh = (shape.end.y - shape.start.y) * displayH;

    if (shape.kind === "rectangle") {
      ctx.strokeRect(sx, sy, sw, sh);
    }
    if (shape.kind === "circle") {
      ctx.beginPath();
      ctx.ellipse(sx + sw / 2, sy + sh / 2, Math.abs(sw / 2), Math.abs(sh / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (shape.kind === "arrow") {
      ctx.beginPath();
      ctx.moveTo(shape.start.x * displayW, shape.start.y * displayH);
      ctx.lineTo(shape.end.x * displayW, shape.end.y * displayH);
      ctx.stroke();
      var angle = Math.atan2(sh, sw);
      var headLen = 14;
      ctx.beginPath();
      ctx.moveTo(shape.end.x * displayW, shape.end.y * displayH);
      ctx.lineTo(
        shape.end.x * displayW - headLen * Math.cos(angle - Math.PI / 6),
        shape.end.y * displayH - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(shape.end.x * displayW, shape.end.y * displayH);
      ctx.lineTo(
        shape.end.x * displayW - headLen * Math.cos(angle + Math.PI / 6),
        shape.end.y * displayH - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
    }
    if (shape.kind === "text" && shape.text) {
      ctx.font = "16px sans-serif";
      ctx.fillText(shape.text, sx, sy);
    }
  }

  var paths = annotation.paths || [];
  for (var pi = 0; pi < paths.length; pi++) {
    var path = paths[pi] as AnnotationPath;
    if (path.points.length < 2) continue;
    var first = path.points[0] as AnnotationPoint;
    ctx.strokeStyle = path.color;
    ctx.beginPath();
    ctx.moveTo(first.x * displayW, first.y * displayH);
    for (var pj = 1; pj < path.points.length; pj++) {
      var pt = path.points[pj] as AnnotationPoint;
      ctx.lineTo(pt.x * displayW, pt.y * displayH);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function updateZoomLevelDisplay() {
  if (zoomLevelEl) {
    zoomLevelEl.textContent = Math.round(zoomLevel * 100) + "%";
  }
}

function updateCanvasWrapCursor() {
  if (!overlayCanvasWrap) return;
  if (zoomLevel > 1) {
    overlayCanvasWrap.classList.add("zoomed");
  } else {
    overlayCanvasWrap.classList.remove("zoomed");
  }
}

function clampPan() {
  if (!drawingCanvas) return;
  var displayW = drawingCanvas.parentElement ? drawingCanvas.parentElement.clientWidth : 640;
  var displayH = parseInt(drawingCanvas.style.height, 10) || Math.round(displayW / (16 / 9));
  var scaledW = displayW * zoomLevel;
  var scaledH = displayH * zoomLevel;

  var maxPanX = Math.max(0, (scaledW - displayW) / 2 + displayW * 0.1);
  var maxPanY = Math.max(0, (scaledH - displayH) / 2 + displayH * 0.1);

  if (panX > maxPanX) panX = maxPanX;
  if (panX < -maxPanX) panX = -maxPanX;
  if (panY > maxPanY) panY = maxPanY;
  if (panY < -maxPanY) panY = -maxPanY;
}

function redrawCanvas() {
  if (!drawingCanvas || !lastAnnotation) return;
  renderAnnotationOnCanvas(drawingCanvas, lastAnnotation, lastBgSource || undefined);
}

function resetZoom() {
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  zoomDoubleClickedIn = false;
  updateZoomLevelDisplay();
  updateCanvasWrapCursor();
  redrawCanvas();
}

function applyZoom(newZoom: number, centerX?: number, centerY?: number) {
  var clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  if (clamped === zoomLevel) return;

  if (typeof centerX === "number" && typeof centerY === "number") {
    var ratio = clamped / zoomLevel;
    panX = centerX - ratio * (centerX - panX);
    panY = centerY - ratio * (centerY - panY);
  }

  zoomLevel = clamped;
  clampPan();
  updateZoomLevelDisplay();
  updateCanvasWrapCursor();
  redrawCanvas();
}

function handleWheel(e: WheelEvent) {
  e.preventDefault();
  var rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  var cx = e.clientX - rect.left;
  var cy = e.clientY - rect.top;

  var delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
  applyZoom(zoomLevel + delta, cx, cy);
}

function handlePanStart(e: MouseEvent) {
  if (zoomLevel <= 1) return;
  e.preventDefault();
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panStartOffsetX = panX;
  panStartOffsetY = panY;
  if (overlayCanvasWrap) overlayCanvasWrap.classList.add("panning");
}

function handlePanMove(e: MouseEvent) {
  if (!isPanning) return;
  e.preventDefault();
  panX = panStartOffsetX + (e.clientX - panStartX);
  panY = panStartOffsetY + (e.clientY - panStartY);
  clampPan();
  redrawCanvas();
}

function handlePanEnd() {
  if (!isPanning) return;
  isPanning = false;
  if (overlayCanvasWrap) overlayCanvasWrap.classList.remove("panning");
}

function handleCanvasDblClick(e: MouseEvent) {
  var rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  var cx = e.clientX - rect.left;
  var cy = e.clientY - rect.top;

  if (zoomDoubleClickedIn) {
    resetZoom();
  } else {
    zoomDoubleClickedIn = true;
    applyZoom(2, cx, cy);
  }
}

function parseAnnotation(raw: unknown): AnnotationData | null {
  if (!raw) return null;
  var data: any = raw;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch (_e) { return null; }
  }
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch (_e) { return null; }
  }
  if (!data || typeof data !== "object") return null;
  return data as AnnotationData;
}

function normalizeProxyKey(key: string): string {
  var normalized = key.replace(/^\/+/, "");
  if (normalized.indexOf("proxies/") === 0) {
    normalized = normalized.slice("proxies/".length);
  }
  return normalized;
}

function buildProxyUrl(key: string): string {
  return apiUrl() + "/media/proxies/" + normalizeProxyKey(key) + "?token=" + encodeURIComponent(token);
}

function fetchVersionMedia(versionId: string): Promise<VersionMediaInfo | null> {
  if (cachedVersionMediaId === versionId && cachedVersionMedia) {
    return Promise.resolve(cachedVersionMedia);
  }
  return apiRequest<{
    proxyKey: string | null;
    thumbnailKey: string | null;
    width: number | null;
    height: number | null;
  }>("/versions/" + versionId + "/status").then(function (status) {
    cachedVersionMedia = {
      proxyKey: status.proxyKey,
      thumbnailKey: status.thumbnailKey,
      width: status.width,
      height: status.height
    };
    cachedVersionMediaId = versionId;
    return cachedVersionMedia;
  });
}

function loadVideoElement(url: string): Promise<HTMLVideoElement> {
  return new Promise(function (resolve, reject) {
    var video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.style.position = "fixed";
    video.style.left = "-9999px";
    video.style.width = "1px";
    video.style.height = "1px";
    document.body.appendChild(video);

    var settled = false;
    var timeout: ReturnType<typeof setTimeout> = setTimeout(function () {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Video load timed out"));
      }
    }, 15000);

    function cleanup() {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
    }

    function onLoaded() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanup();
      resolve(video);
    }

    function onError() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanup();
      try { document.body.removeChild(video); } catch (_e) {}
      reject(new Error("Failed to load video"));
    }

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("error", onError);
    video.src = url;
    video.load();
  });
}

function seekVideoToTime(video: HTMLVideoElement, timeSeconds: number): Promise<void> {
  if (Math.abs(video.currentTime - timeSeconds) < 0.05) {
    return Promise.resolve();
  }
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timeout: ReturnType<typeof setTimeout> = setTimeout(function () {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Video seek timed out"));
      }
    }, 10000);

    function cleanup() {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    }

    function onSeeked() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanup();
      resolve();
    }

    function onError() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanup();
      reject(new Error("Video error during seek"));
    }

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = timeSeconds;
  });
}

function getVideoFrameAtTime(proxyKey: string, timeSeconds: number): Promise<HTMLVideoElement> {
  var url = buildProxyUrl(proxyKey);

  if (frameVideo && frameVideoProxyUrl === url) {
    return seekVideoToTime(frameVideo, timeSeconds).then(function () {
      return frameVideo as HTMLVideoElement;
    });
  }

  if (frameVideo) {
    frameVideo.pause();
    frameVideo.removeAttribute("src");
    frameVideo.load();
    try { document.body.removeChild(frameVideo); } catch (_e) {}
  }

  return loadVideoElement(url).then(function (video) {
    frameVideo = video;
    frameVideoProxyUrl = url;
    return seekVideoToTime(video, timeSeconds).then(function () {
      return video;
    });
  });
}

function loadFrameAsImage(versionId: string, timeSeconds: number): Promise<HTMLImageElement> {
  return new Promise(function (resolve, reject) {
    var url = apiUrl() + "/versions/" + versionId + "/frame?time=" + timeSeconds + "&token=" + encodeURIComponent(token);
    var img = new Image();
    var settled = false;
    var timeout: ReturnType<typeof setTimeout> = setTimeout(function () {
      if (!settled) {
        settled = true;
        reject(new Error("Frame image load timed out"));
      }
    }, 20000);

    img.onload = function () {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(img);
    };

    img.onerror = function () {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error("Failed to load frame image"));
    };

    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

function showDrawingOverlay(comment: ReviewComment) {
  if (!drawingOverlay || !drawingCanvas || !comment.annotationJson) return;

  var parsed = parseAnnotation(comment.annotationJson);
  if (!parsed) return;
  var annotation: AnnotationData = parsed;

  zoomLevel = 1;
  panX = 0;
  panY = 0;
  zoomDoubleClickedIn = false;
  isPanning = false;
  lastBgSource = null;
  lastAnnotation = null;
  updateZoomLevelDisplay();
  updateCanvasWrapCursor();

  var annotated = getAnnotatedComments();
  currentDrawingIndex = -1;
  for (var i = 0; i < annotated.length; i++) {
    if ((annotated[i] as ReviewComment).id === comment.id) {
      currentDrawingIndex = i;
      break;
    }
  }

  if (overlayInfo) {
    var timeStr = (Math.round(comment.timeSeconds * 100) / 100) + "s";
    overlayInfo.innerHTML = "<strong>" + timeStr + "</strong> \u2014 " + authorName(comment);
  }

  if (overlayBody) {
    overlayBody.textContent = comment.body;
  }

  var hasPrev = currentDrawingIndex > 0;
  var hasNext = currentDrawingIndex < annotated.length - 1;
  if (overlayPrev) {
    if (hasPrev) {
      overlayPrev.removeAttribute("disabled");
    } else {
      overlayPrev.setAttribute("disabled", "true");
    }
  }
  if (overlayNext) {
    if (hasNext) {
      overlayNext.removeAttribute("disabled");
    } else {
      overlayNext.setAttribute("disabled", "true");
    }
  }

  drawingOverlay.removeAttribute("hidden");

  var canvas = drawingCanvas;
  renderAnnotationOnCanvas(canvas, annotation);

  var versionId = versionSelect ? versionSelect.value : "";
  if (!versionId || !token) return;

  var commentId = comment.id;
  var timeSeconds = comment.timeSeconds;

  loadFrameAsImage(versionId, timeSeconds).then(function (img) {
    if (currentDrawingIndex < 0) return;
    var annotatedNow = getAnnotatedComments();
    if (currentDrawingIndex >= annotatedNow.length) return;
    if ((annotatedNow[currentDrawingIndex] as ReviewComment).id !== commentId) return;
    renderAnnotationOnCanvas(canvas, annotation, img);
  }).catch(function (err) {
    console.warn("[openreview] Frame image load failed, trying video fallback:", err);
    fetchVersionMedia(versionId).then(function (media) {
      if (!media || !media.proxyKey) return;
      if (currentDrawingIndex < 0) return;
      return getVideoFrameAtTime(media.proxyKey, timeSeconds);
    }).then(function (video) {
      if (!video || currentDrawingIndex < 0) return;
      var annotatedNow = getAnnotatedComments();
      if (currentDrawingIndex >= annotatedNow.length) return;
      if ((annotatedNow[currentDrawingIndex] as ReviewComment).id !== commentId) return;
      renderAnnotationOnCanvas(canvas, annotation, video);
    }).catch(function (videoErr) {
      console.warn("[openreview] Video fallback also failed:", videoErr);
    });
  });
}

function hideDrawingOverlay() {
  if (drawingOverlay) drawingOverlay.setAttribute("hidden", "");
  currentDrawingIndex = -1;
}

function navigateDrawing(delta: number) {
  var annotated = getAnnotatedComments();
  var next = currentDrawingIndex + delta;
  if (next < 0 || next >= annotated.length) return;
  var comment = annotated[next] as ReviewComment;
  showDrawingOverlay(comment);
}

if (overlayClose) overlayClose.addEventListener("click", hideDrawingOverlay);
if (overlayPrev) overlayPrev.addEventListener("click", function () { navigateDrawing(-1); });
if (overlayNext) overlayNext.addEventListener("click", function () { navigateDrawing(1); });

if (drawingOverlay) {
  drawingOverlay.addEventListener("click", function (e) {
    if (e.target === drawingOverlay) hideDrawingOverlay();
  });
}

if (zoomInBtn) zoomInBtn.addEventListener("click", function () { applyZoom(zoomLevel + ZOOM_STEP); });
if (zoomOutBtn) zoomOutBtn.addEventListener("click", function () { applyZoom(zoomLevel - ZOOM_STEP); });
if (zoomFitBtn) zoomFitBtn.addEventListener("click", function () { resetZoom(); });

if (overlayCanvasWrap) {
  overlayCanvasWrap.addEventListener("wheel", handleWheel, { passive: false });
  overlayCanvasWrap.addEventListener("mousedown", handlePanStart);
  overlayCanvasWrap.addEventListener("dblclick", handleCanvasDblClick);
}
document.addEventListener("mousemove", handlePanMove);
document.addEventListener("mouseup", handlePanEnd);

if (autoShowDrawings) {
  autoShowDrawings.addEventListener("change", function () {
    autoShowEnabled = autoShowDrawings.checked;
  });
}

function renderComments() {
  if (!commentsElement) return;

  commentsElement.innerHTML = "";

  if (comments.length === 0) {
    commentsElement.textContent = "No comments loaded.";
    return;
  }

  for (var ci = 0; ci < comments.length; ci++) {
    var comment = comments[ci] as ReviewComment;
    var container = document.createElement("div");
    var header = document.createElement("div");
    var timestamp = document.createElement("strong");
    var authorSpan = document.createElement("span");
    var bodyEl = document.createElement("p");
    var jumpButton = document.createElement("button");

    container.className = "comment" + (comment.resolvedAt ? " comment-resolved" : "");
    header.className = "comment-header";
    timestamp.textContent = Math.round(comment.timeSeconds * 100) / 100 + "s";
    authorSpan.textContent = " " + authorName(comment);
    authorSpan.className = "comment-author";

    if (comment.annotationJson) {
      var badge = document.createElement("span");
      badge.className = "pill";
      badge.textContent = "\u270E Drawing";
      badge.title = "This comment includes drawn annotations";
      header.appendChild(badge);
    }

    if (comment.resolvedAt) {
      var resolvedBadge = document.createElement("span");
      resolvedBadge.className = "pill resolved";
      resolvedBadge.textContent = "\u2713 Resolved";
      header.appendChild(resolvedBadge);
    }

    bodyEl.textContent = comment.body;
    bodyEl.style.margin = "4px 0";

    jumpButton.className = "secondary";
    jumpButton.textContent = "Jump to time";
    (function (seconds) {
      jumpButton.addEventListener("click", function () {
        evalHostScript("openReviewJumpToSeconds(" + JSON.stringify(seconds) + ")").then(function (msg) {
          setStatus(msg);
        }).catch(function (error) {
          var errMsg = error instanceof Error ? error.message : "Unable to jump to comment time.";
          setStatus(errMsg);
          showToast(errMsg, "error");
        });
      });
    })(comment.timeSeconds);

    header.prepend(authorSpan);
    header.prepend(timestamp);
    container.appendChild(header);
    container.appendChild(bodyEl);

    var actions = document.createElement("div");
    actions.className = "comment-actions";
    actions.appendChild(jumpButton);

    if (comment.annotationJson) {
      var drawBtn = document.createElement("button");
      drawBtn.className = "btn-drawing";
      drawBtn.textContent = "\u270E View Drawing";
      (function (c) {
        drawBtn.addEventListener("click", function () {
          showDrawingOverlay(c);
        });
      })(comment);
      actions.appendChild(drawBtn);
    }

    container.appendChild(actions);
    commentsElement.appendChild(container);
  }

  var hasAnyDrawings = false;
  for (var di = 0; di < comments.length; di++) {
    if ((comments[di] as ReviewComment).annotationJson) {
      hasAnyDrawings = true;
      break;
    }
  }
  if (drawingToggleRow) {
    if (hasAnyDrawings) {
      drawingToggleRow.removeAttribute("hidden");
    } else {
      drawingToggleRow.setAttribute("hidden", "");
    }
  }
}

function populateProjectSelect() {
  if (!projectSelect) return;

  projectSelect.innerHTML = "";

  for (const project of projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    projectSelect.appendChild(option);
  }

  if (projectSelect.options.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No projects";
    projectSelect.appendChild(option);
  }

  populateAssetSelect();
}

function populateAssetSelect() {
  if (!assetSelect) return;

  assetSelect.innerHTML = "";
  const projectId = projectSelect ? projectSelect.value : "";
  const project = projects.find((item) => item.id === projectId);

  for (const asset of (project ? project.assets : [])) {
    const option = document.createElement("option");
    option.value = asset.id;
    option.textContent = asset.name;
    assetSelect.appendChild(option);
  }

  if (assetSelect.options.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No assets in project";
    assetSelect.appendChild(option);
  }
}

function populateVersionSelect() {
  if (!versionSelect) return;

  versionSelect.innerHTML = "";

  var selectedProjectId = projectSelect ? projectSelect.value : "";
  var selectedProject = projects.find(function (p) { return p.id === selectedProjectId; });

  if (selectedProject) {
    for (const asset of selectedProject.assets) {
      for (const version of asset.versions) {
        const option = document.createElement("option");
        option.value = version.id;
        option.textContent = `${asset.name} / v${version.versionNumber} (${version.status})`;
        versionSelect.appendChild(option);
      }
    }
  }

  if (versionSelect.options.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No versions yet — upload first";
    versionSelect.appendChild(option);
  }
}

async function loadProjects() {
  var prevProjectId = projectSelect ? projectSelect.value : "";
  var prevVersionId = versionSelect ? versionSelect.value : "";

  projects = await apiRequest<Project[]>("/projects");
  populateProjectSelect();

  if (prevProjectId && projectSelect) {
    for (var i = 0; i < projectSelect.options.length; i++) {
      var pOpt = projectSelect.options[i];
      if (pOpt && pOpt.value === prevProjectId) {
        projectSelect.value = prevProjectId;
        populateAssetSelect();
        break;
      }
    }
  }

  populateVersionSelect();

  if (prevVersionId && versionSelect) {
    for (var i = 0; i < versionSelect.options.length; i++) {
      var vOpt = versionSelect.options[i];
      if (vOpt && vOpt.value === prevVersionId) {
        versionSelect.value = prevVersionId;
        break;
      }
    }
  }
}

async function refreshSequenceInfo() {
  try {
    const raw = await evalHostScript("openReviewGetActiveSequenceInfo()");
    const info = JSON.parse(raw) as { sequenceName?: string | null; error?: string };

    if (info.sequenceName && assetNameInput && !assetNameInput.value.trim()) {
      assetNameInput.value = info.sequenceName;
    }

    if (sequencePill) {
      if (info.sequenceName) {
        sequencePill.hidden = false;
        sequencePill.textContent = `Active: ${info.sequenceName}`;
      } else {
        sequencePill.hidden = true;
      }
    }
  } catch {
    if (sequencePill) sequencePill.hidden = true;
  }
}

async function uploadBufferAsVersion(buffer: Uint8Array, filename: string, contentType: string) {
  if (!token) throw new Error("Sign in first.");
  const assetId = assetSelect ? assetSelect.value : "";
  if (!assetId) throw new Error("Select an asset for the new version.");

  setProgress(0);
  setStatus("Uploading new version…");

  const projectId = projectSelect ? projectSelect.value : "";
  if (!projectId) throw new Error("Select a project.");

  const originalKey = await uploadOriginalBuffer({
    projectId,
    filename,
    contentType,
    buffer,
    onProgress: setProgress
  });

  await apiRequest(`/assets/${assetId}/versions`, {
    method: "POST",
    body: JSON.stringify({ originalKey })
  });

  await loadProjects();
  setProgress(null);
  setStatus("New version uploaded. Transcoding started.");
}

async function uploadBufferAsAsset(buffer: Uint8Array, filename: string, contentType: string) {
  if (!token) throw new Error("Sign in first.");
  const projectId = projectSelect ? projectSelect.value : "";
  if (!projectId) throw new Error("Select a project.");

  const assetName = (assetNameInput ? assetNameInput.value.trim() : "") || filename.replace(/\.[^.]+$/, "");

  setStatus("Getting upload URL…");
  setProgress(0);

  var originalKey: string;
  try {
    originalKey = await uploadOriginalBuffer({
      projectId,
      filename,
      contentType,
      buffer,
      onProgress: function (percent) {
        setProgress(percent);
        setStatus("Uploading… " + percent + "%");
      }
    });
  } catch (uploadErr) {
    throw new Error("Upload failed: " + (uploadErr instanceof Error ? uploadErr.message : String(uploadErr)));
  }

  setStatus("Creating asset…");
  setProgress(100);

  try {
    await apiRequest("/assets", {
      method: "POST",
      body: JSON.stringify({ projectId, name: assetName, originalKey })
    });
  } catch (assetErr) {
    throw new Error("Asset creation failed: " + (assetErr instanceof Error ? assetErr.message : String(assetErr)));
  }

  setStatus("Refreshing projects…");
  await loadProjects();
  setProgress(null);
  setStatus("Uploaded \"" + assetName + "\". Transcoding started — refresh versions in a minute.");
}

async function checkServerReady(): Promise<void> {
  var healthResponse: Response;
  try {
    healthResponse = await fetch(apiUrl() + "/health/ready");
  } catch (_netErr) {
    throw new Error("Cannot reach the API server at " + apiUrl() + ". Is it running?");
  }

  var readiness: { status?: string; checks?: { database?: boolean; redis?: boolean; originalsBucket?: boolean } };
  try {
    readiness = JSON.parse(await healthResponse.text());
  } catch (_parseErr) {
    throw new Error("Unexpected response from API health check.");
  }

  if (readiness.status === "ready") return;

  var down: string[] = [];
  if (readiness.checks) {
    if (!readiness.checks.database) down.push("database");
    if (!readiness.checks.redis) down.push("Redis");
    if (!readiness.checks.originalsBucket) down.push("object storage (MinIO/S3)");
  }
  throw new Error(
    "Server not ready" +
    (down.length ? " \u2014 " + down.join(", ") + " unavailable" : "") +
    ". Start Docker services and retry."
  );
}

async function uploadActiveSequence() {
  if (!token) throw new Error("Sign in first.");

  var projectId = projectSelect ? projectSelect.value : "";
  if (!projectId) {
    throw new Error(
      "No project selected. Create a project in the web dashboard, then click \u201cRefresh\u201d."
    );
  }

  setStatus("Checking server connectivity\u2026");
  setProgress(2);
  await checkServerReady();

  setStatus("Exporting active sequence\u2026");
  showToast("Export started \u2014 this can take a few minutes for long sequences.", "info", 10000);
  setProgress(5);

  var raw: string;
  try {
    raw = await evalHostScriptWithTimeout("openReviewExportActiveSequence()", 10 * 60 * 1000);
  } catch (exportErr) {
    throw new Error("Export failed: " + (exportErr instanceof Error ? exportErr.message : String(exportErr)));
  }

  var result: { path?: string; sequenceName?: string; fileSize?: number; error?: string };
  try {
    result = JSON.parse(raw);
  } catch (_e) {
    throw new Error("Unexpected response from Premiere Pro: " + (raw || "(empty)").substring(0, 200));
  }

  if (result.error || !result.path) {
    throw new Error(result.error || "Export failed \u2014 no output path returned.");
  }

  if (result.sequenceName && assetNameInput) {
    assetNameInput.value = result.sequenceName;
  }

  setProgress(8);

  var fileSize: number;
  if (result.fileSize && result.fileSize > 0) {
    fileSize = result.fileSize;
    console.log("[openreview] Export returned fileSize:", fileSize);
    setStatus("Export complete (" + Math.round(fileSize / 1024 / 1024) + " MB)");
  } else {
    setStatus("Waiting for export file\u2026 (this can take a few minutes)");
    showToast("Waiting for Media Encoder to finish\u2026", "info", 6000);
    console.log("[openreview] No fileSize from export, polling for file:", result.path);
    try {
      fileSize = await waitForExportFile(result.path, 5 * 60 * 1000);
    } catch (waitErr) {
      throw new Error(waitErr instanceof Error ? waitErr.message : String(waitErr));
    }
  }

  var sizeMB = Math.round(fileSize / 1024 / 1024);
  setStatus("Reading exported file (" + sizeMB + " MB)\u2026");
  setProgress(10);
  showToast("Export done. Reading " + sizeMB + " MB\u2026", "info");

  var data: Uint8Array;
  try {
    data = await readExportFile(result.path, fileSize);
  } catch (readErr) {
    throw new Error("Could not read exported file: " + (readErr instanceof Error ? readErr.message : String(readErr)));
  }

  setProgress(30);
  var assetName = (assetNameInput ? assetNameInput.value.trim() : "") || (result.path.split(/[/\\]/).pop() || "sequence.mp4").replace(/\.[^.]+$/, "");
  var filename = result.path.split(/[/\\]/).pop() || "sequence.mp4";

  setStatus("Getting upload URL\u2026");
  var originalKey: string;
  try {
    originalKey = await uploadOriginalBuffer({
      projectId: projectId,
      filename: filename,
      contentType: "video/mp4",
      buffer: data,
      onProgress: function (percent) {
        var mapped = 30 + Math.round(percent * 0.65);
        setProgress(mapped);
        setStatus("Uploading\u2026 " + percent + "%");
      }
    });
  } catch (uploadErr) {
    throw new Error("Upload failed: " + (uploadErr instanceof Error ? uploadErr.message : String(uploadErr)));
  }

  setStatus("Creating asset\u2026");
  setProgress(96);

  try {
    await apiRequest("/assets", {
      method: "POST",
      body: JSON.stringify({ projectId: projectId, name: assetName, originalKey: originalKey })
    });
  } catch (assetErr) {
    throw new Error("Asset creation failed: " + (assetErr instanceof Error ? assetErr.message : String(assetErr)));
  }

  setStatus("Refreshing projects\u2026");
  setProgress(98);
  await loadProjects();
  setProgress(100);
  setStatus("Uploaded \"" + assetName + "\". Transcoding started \u2014 refresh versions in a minute.");
}

async function uploadSelectedFile() {
  const file = fileInput && fileInput.files ? fileInput.files[0] : undefined;
  if (!file) throw new Error("Choose a video file first.");

  var data = new Uint8Array(await file.arrayBuffer());
  await uploadBufferAsAsset(data, file.name, file.type || "video/mp4");
}

function setDownloadProgress(percent: number | null) {
  if (!downloadProgressWrap || !downloadProgressBar) return;

  if (percent === null) {
    downloadProgressWrap.hidden = true;
    downloadProgressBar.style.width = "0%";
    return;
  }

  downloadProgressWrap.hidden = false;
  downloadProgressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

function updateAuthUI(signedInEmail?: string) {
  var isSignedIn = Boolean(token);

  if (signInFieldsDiv) {
    if (isSignedIn) {
      signInFieldsDiv.setAttribute("hidden", "");
    } else {
      signInFieldsDiv.removeAttribute("hidden");
    }
  }

  if (logoutButton) {
    if (isSignedIn) {
      logoutButton.removeAttribute("hidden");
    } else {
      logoutButton.setAttribute("hidden", "");
    }
  }

  if (signedInAsEl) {
    if (isSignedIn && signedInEmail) {
      signedInAsEl.textContent = "Signed in as " + signedInEmail;
      signedInAsEl.removeAttribute("hidden");
    } else if (isSignedIn) {
      signedInAsEl.textContent = "Signed in";
      signedInAsEl.removeAttribute("hidden");
    } else {
      signedInAsEl.setAttribute("hidden", "");
    }
  }
}

function findAssetIdForVersion(versionId: string): string | null {
  for (const project of projects) {
    for (const asset of project.assets) {
      for (const version of asset.versions) {
        if (version.id === versionId) return asset.id;
      }
    }
  }
  return null;
}

function downloadFileXhr(url: string, onProgress: (percent: number) => void): Promise<Uint8Array> {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.timeout = 10 * 60 * 1000;
    xhr.onprogress = function (event) {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(new Uint8Array(xhr.response as ArrayBuffer));
      } else {
        reject(new Error("Download failed with status " + xhr.status));
      }
    };
    xhr.onerror = function () {
      reject(new Error("Download network error — check that the file storage is accessible."));
    };
    xhr.ontimeout = function () {
      reject(new Error("Download timed out after 10 minutes."));
    };
    xhr.send();
  });
}

async function downloadToProject() {
  if (!token) throw new Error("Sign in first.");
  var versionId = versionSelect ? versionSelect.value : "";
  if (!versionId) throw new Error("Select a version first.");

  var assetId = findAssetIdForVersion(versionId);
  if (!assetId) throw new Error("Could not find the asset for this version. Try refreshing projects.");

  setStatus("Getting download URL…");
  setDownloadProgress(0);

  var downloadData: { downloadUrl: string };
  try {
    downloadData = await apiRequest<{ downloadUrl: string }>(
      "/assets/" + assetId + "/versions/" + versionId + "/download?type=original"
    );
  } catch (apiErr) {
    throw new Error("Failed to get download URL: " + (apiErr instanceof Error ? apiErr.message : String(apiErr)));
  }

  var downloadUrl = downloadData.downloadUrl;
  if (!downloadUrl) {
    throw new Error("Server returned no download URL. The file may not be available yet.");
  }

  setStatus("Downloading file…");
  showToast("Downloading file from storage…", "info");

  var fullBuffer: Uint8Array;
  try {
    fullBuffer = await downloadFileXhr(downloadUrl, function (percent) {
      setDownloadProgress(percent);
      setStatus("Downloading… " + percent + "%");
    });
  } catch (dlErr) {
    throw new Error("File download failed: " + (dlErr instanceof Error ? dlErr.message : String(dlErr)));
  }

  if (fullBuffer.byteLength === 0) {
    throw new Error("Downloaded file is empty. The original may not have been uploaded correctly.");
  }

  setStatus("Download complete (" + Math.round(fullBuffer.byteLength / 1024 / 1024) + " MB). Saving…");
  setDownloadProgress(100);

  var urlPath = "";
  try {
    var urlObj = new URL(downloadUrl);
    urlPath = urlObj.pathname;
  } catch (_e) {
    urlPath = downloadUrl.split("?")[0] || "";
  }
  var pathSegments = urlPath.split("/");
  var rawFilename = pathSegments[pathSegments.length - 1] || "download.mp4";
  var filename = decodeURIComponent(rawFilename);

  var homeDir = "";
  try {
    if (typeof process !== "undefined" && process.env && process.env.HOME) {
      homeDir = process.env.HOME;
    }
  } catch (_e) {}
  if (!homeDir) homeDir = "/tmp";

  var downloadDir = homeDir + "/Documents/OpenReview/downloads";
  var localPath = downloadDir + "/" + Date.now() + "-" + filename;

  var fs = getFs();
  if (fs) {
    try {
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }
      fs.writeFileSync(localPath, fullBuffer);
    } catch (fsErr) {
      throw new Error("Failed to write file locally: " + (fsErr instanceof Error ? fsErr.message : String(fsErr)));
    }
  } else {
    setStatus("Writing file via host script…");
    try {
      await writeFileViaHost(localPath, fullBuffer);
    } catch (writeErr) {
      throw new Error("Failed to write file: " + (writeErr instanceof Error ? writeErr.message : String(writeErr)));
    }
  }

  setStatus("Importing into Premiere Pro project…");
  setDownloadProgress(null);
  showToast("Importing into project…", "info");

  var raw: string;
  try {
    raw = await evalHostScript("openReviewImportFile(" + JSON.stringify(localPath) + ")");
  } catch (hostErr) {
    throw new Error("Import failed: " + (hostErr instanceof Error ? hostErr.message : String(hostErr)));
  }

  var result: { success?: boolean; error?: string };
  try {
    result = JSON.parse(raw);
  } catch (_e) {
    throw new Error("Unexpected response from host: " + (raw || "(empty)").substring(0, 200));
  }

  if (result.error) throw new Error("Import error: " + result.error);
  setStatus("Imported \"" + filename + "\" into project.");
}

function setConnectionState(state: "connected" | "connecting" | "disconnected") {
  if (!liveIndicator) return;

  liveIndicator.className = `live-indicator ${state}`;

  if (state === "connected") {
    liveIndicator.textContent = "Live";
    liveIndicator.hidden = false;
  } else if (state === "connecting") {
    liveIndicator.textContent = "Reconnecting\u2026";
    liveIndicator.hidden = false;
  } else {
    liveIndicator.hidden = true;
  }
}

function setApprovalBadge(status: string | null) {
  if (!approvalBadge) return;

  if (!status) {
    approvalBadge.hidden = true;
    return;
  }

  approvalBadge.hidden = false;
  approvalBadge.className = `pill approval-${status.toLowerCase().replace(/_/g, "-")}`;

  const labels: Record<string, string> = {
    PENDING: "Pending approval",
    APPROVED: "Approved",
    CHANGES_REQUESTED: "Changes requested"
  };
  approvalBadge.textContent = labels[status] || status;
}

function handleReviewEvent(event: ReviewEventData) {
  switch (event.type) {
    case "comment.created":
    case "comment.updated":
    case "comment.resolved":
    case "reply.created":
      void loadSelectedComments(true);
      break;
    case "approval.updated": {
      const status = event.payload && event.payload.status;
      if (typeof status === "string") setApprovalBadge(status);
      setStatus(`Approval updated: ${status}`);
      break;
    }
    case "version.status": {
      const newStatus = event.payload && event.payload.status;
      if (typeof newStatus === "string") {
        updateVersionStatus(event.assetVersionId, newStatus);
        setStatus(`Version status: ${newStatus}`);
      }
      break;
    }
  }
}

function updateVersionStatus(assetVersionId: string, newStatus: string) {
  for (const project of projects) {
    for (const asset of project.assets) {
      for (const version of asset.versions) {
        if (version.id === assetVersionId) {
          version.status = newStatus;
        }
      }
    }
  }
  populateVersionSelect();
}

const SSE_EVENT_TYPES = [
  "comment.created",
  "comment.updated",
  "comment.resolved",
  "reply.created",
  "approval.updated",
  "version.status",
  "presence.updated"
] as const;

function subscribeToReviewEvents(assetVersionId: string) {
  if (eventsSource) eventsSource.close();
  eventsSource = null;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;

  if (!token) {
    setConnectionState("disconnected");
    return;
  }

  function connect() {
    setConnectionState("connecting");

    const source = new EventSource(
      `${apiUrl()}/review/${assetVersionId}/events?token=${encodeURIComponent(token)}`
    );

    source.onopen = () => {
      reconnectAttempts = 0;
      setConnectionState("connected");
    };

    const listener = (e: MessageEvent) => {
      try {
        handleReviewEvent(JSON.parse(e.data) as ReviewEventData);
      } catch {
        void loadSelectedComments(true);
      }
    };

    for (const type of SSE_EVENT_TYPES) {
      source.addEventListener(type, listener);
    }

    source.onerror = () => {
      source.close();
      eventsSource = null;

      reconnectAttempts++;
      const delay = Math.min(1000 * 2 ** (reconnectAttempts - 1), 30_000);

      setConnectionState("connecting");
      reconnectTimer = setTimeout(connect, delay);
    };

    eventsSource = source;
  }

  connect();
}

async function loadSelectedComments(silent: boolean) {
  if (!(versionSelect && versionSelect.value)) {
    setStatus("Select a version first.");
    showToast("No version selected. Choose a version from the dropdown.", "error");
    return;
  }

  if (!silent) setStatus("Loading comments…");

  var versionId = versionSelect.value;
  try {
    comments = await apiRequest<ReviewComment[]>("/review/" + versionId + "/comments");
  } catch (fetchErr) {
    comments = [];
    renderComments();
    throw new Error("Failed to load comments: " + (fetchErr instanceof Error ? fetchErr.message : String(fetchErr)));
  }

  renderComments();
  subscribeToReviewEvents(versionId);

  if (!silent) {
    var annotatedCount = 0;
    for (var i = 0; i < comments.length; i++) {
      if ((comments[i] as ReviewComment).annotationJson) annotatedCount++;
    }
    var msg = "Loaded " + comments.length + " comment" + (comments.length !== 1 ? "s" : "");
    if (annotatedCount > 0) {
      msg += " (" + annotatedCount + " with drawings)";
    }
    msg += ". Live updates on.";
    setStatus(msg);
    showToast(msg, "success");
  }
}

if (loginButton) loginButton.addEventListener("click", async () => {
  console.log("[openreview] Sign-in clicked");
  if (loginButton) {
    loginButton.setAttribute("disabled", "true");
    loginButton.textContent = "Signing in\u2026";
  }
  setStatus("Signing in\u2026");
  var loginEmail = emailInput ? emailInput.value : "";
  try {
    var url = apiUrl();
    console.log("[openreview] POST", url + "/auth/login");
    var result = await apiRequest<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: emailInput ? emailInput.value : "", password: passwordInput ? passwordInput.value : "" })
    });
    console.log("[openreview] Login success, loading projects\u2026");
    token = result.token;
    localStorage.setItem("openreview.panel.token", token);
    updateAuthUI(loginEmail);
    await loadProjects();
    await refreshSequenceInfo();
    setStatus("Signed in. Upload a sequence or load comments.");
    showToast("Signed in successfully.", "success");
  } catch (error) {
    console.error("[openreview] Login error:", error);
    var message = error instanceof Error ? error.message : "Login failed.";
    setStatus("\u274C " + message);
    showToast(message, "error");
    flashStatus();
  } finally {
    if (loginButton) {
      loginButton.removeAttribute("disabled");
      loginButton.textContent = "Sign in";
    }
  }
});

if (logoutButton) logoutButton.addEventListener("click", () => {
  token = "";
  projects = [];
  comments = [];
  if (eventsSource) eventsSource.close();
  eventsSource = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  setConnectionState("disconnected");
  setApprovalBadge(null);
  localStorage.removeItem("openreview.panel.token");
  if (projectSelect) projectSelect.innerHTML = "";
  if (versionSelect) versionSelect.innerHTML = "";
  renderComments();
  setProgress(null);
  updateAuthUI();
  setStatus("Signed out.");
  showToast("Signed out.", "info");
});

if (refreshProjectsButton) refreshProjectsButton.addEventListener("click", async () => {
  try {
    await loadProjects();
    await refreshSequenceInfo();
    setStatus("Projects refreshed.");
  } catch (error) {
    var msg = error instanceof Error ? error.message : "Unable to refresh projects.";
    setStatus(msg);
    showToast(msg, "error");
  }
});

if (loadCommentsButton) loadCommentsButton.addEventListener("click", async () => {
  try {
    await loadSelectedComments(false);
  } catch (error) {
    var msg = error instanceof Error ? error.message : "Unable to load comments.";
    setStatus(msg);
    showToast(msg, "error");
  }
});

if (uploadSequenceButton) uploadSequenceButton.addEventListener("click", async () => {
  uploadSequenceButton.setAttribute("disabled", "true");
  setStatus("Starting upload\u2026");
  setProgress(0);
  try {
    await uploadActiveSequence();
    showToast("Sequence uploaded successfully!", "success");
    setProgress(null);
  } catch (error) {
    var msg = error instanceof Error ? error.message : "Upload failed.";
    setStatus("\u274C " + msg);
    showToast(msg, "error", 8000);
    flashStatus();
    setProgress(null);
  } finally {
    uploadSequenceButton.removeAttribute("disabled");
  }
});

if (uploadFileButton) uploadFileButton.addEventListener("click", async () => {
  uploadFileButton.setAttribute("disabled", "true");
  showToast("Uploading file\u2026", "info");
  try {
    await uploadSelectedFile();
    showToast("File uploaded successfully.", "success");
  } catch (error) {
    var msg = error instanceof Error ? error.message : "Upload failed.";
    setStatus(msg);
    showToast(msg, "error", 6000);
    flashStatus();
    setProgress(null);
  } finally {
    uploadFileButton.removeAttribute("disabled");
  }
});

if (projectSelect) projectSelect.addEventListener("change", () => {
  populateAssetSelect();
  populateVersionSelect();
});

if (uploadVersionButton) uploadVersionButton.addEventListener("click", async () => {
  uploadVersionButton.setAttribute("disabled", "true");
  setStatus("Starting version upload\u2026");
  try {
    if (!token) throw new Error("Sign in first.");
    var vProjectId = projectSelect ? projectSelect.value : "";
    if (!vProjectId) {
      throw new Error("No project selected. Create a project in the web dashboard, then click \u201cRefresh\u201d.");
    }
    var vAssetId = assetSelect ? assetSelect.value : "";
    if (!vAssetId) throw new Error("Select an asset for the new version.");

    const file = fileInput && fileInput.files ? fileInput.files[0] : undefined;
    if (file) {
      await checkServerReady();
      showToast("Uploading new version\u2026", "info");
      var fileData = new Uint8Array(await file.arrayBuffer());
      await uploadBufferAsVersion(fileData, file.name, file.type || "video/mp4");
      showToast("New version uploaded.", "success");
      return;
    }

    await checkServerReady();

    setStatus("Exporting active sequence for new version\u2026");
    showToast("Export started \u2014 this can take a few minutes.", "info", 10000);
    setProgress(0);
    const raw = await evalHostScriptWithTimeout("openReviewExportActiveSequence()", 10 * 60 * 1000);
    var vResult: { path?: string; fileSize?: number; error?: string };
    try {
      vResult = JSON.parse(raw);
    } catch (_e) {
      throw new Error("Unexpected response from Premiere Pro: " + (raw || "(empty)").substring(0, 200));
    }
    if (vResult.error || !vResult.path) throw new Error(vResult.error || "Export failed.");
    setStatus("Verifying export file\u2026");
    setProgress(10);
    var vFileSize: number;
    if (vResult.fileSize && vResult.fileSize > 0) {
      vFileSize = vResult.fileSize;
    } else {
      vFileSize = await waitForExportFile(vResult.path);
    }
    setStatus("Reading exported file\u2026");
    setProgress(20);
    var vData = await readExportFile(vResult.path, vFileSize);
    setStatus("Uploading new version\u2026");
    setProgress(30);
    await uploadBufferAsVersion(vData, vResult.path.split(/[/\\]/).pop() || "sequence.mp4", "video/mp4");
    showToast("New version uploaded.", "success");
  } catch (error) {
    var msg = error instanceof Error ? error.message : "Version upload failed.";
    setStatus("\u274C " + msg);
    showToast(msg, "error", 8000);
    flashStatus();
    setProgress(null);
  } finally {
    uploadVersionButton.removeAttribute("disabled");
  }
});

if (importMarkersButton) importMarkersButton.addEventListener("click", async () => {
  if (comments.length === 0) {
    setStatus("Load comments before importing markers.");
    showToast("Load comments before importing markers.", "info");
    return;
  }

  const markerPayload = comments.map((comment) => ({
    seconds: comment.timeSeconds,
    author: authorName(comment),
    body: comment.body,
    resolved: Boolean(comment.resolvedAt),
    hasDrawing: Boolean(comment.annotationJson)
  }));

  try {
    var result = await evalHostScript("openReviewImportMarkers(" + JSON.stringify(JSON.stringify(markerPayload)) + ")");
    setStatus(result);
    showToast(result, "success");
  } catch (error) {
    var msg = error instanceof Error ? error.message : "Unable to import markers.";
    setStatus(msg);
    showToast(msg, "error");
  }
});

if (downloadToProjectButton) downloadToProjectButton.addEventListener("click", async () => {
  downloadToProjectButton.setAttribute("disabled", "true");
  showToast("Downloading\u2026", "info");
  try {
    await downloadToProject();
    showToast("Downloaded and imported into project.", "success");
  } catch (error) {
    var msg = error instanceof Error ? error.message : "Download failed.";
    setStatus(msg);
    showToast(msg, "error", 6000);
    flashStatus();
    setDownloadProgress(null);
  } finally {
    downloadToProjectButton.removeAttribute("disabled");
  }
});

evalHostScript("openReviewGetHostInfo()").then(function (info) {
  console.log("[openreview] Host info:", info);
}).catch(function (err) {
  console.warn("[openreview] Could not get host info:", err);
});

if (token) {
  updateAuthUI(emailInput ? emailInput.value : undefined);
  loadProjects()
    .then(function () { return refreshSequenceInfo(); })
    .then(function () { setStatus("Connected with saved token."); })
    .catch(function () {
      token = "";
      localStorage.removeItem("openreview.panel.token");
      updateAuthUI();
      setStatus("Saved token expired. Sign in again.");
      showToast("Session expired. Please sign in again.", "error");
    });
} else {
  updateAuthUI();
  void refreshSequenceInfo();
}
