import { calculatePartSize } from "@openreview/shared";

export type UploadProgress = {
  percent: number;
  bytesUploaded: number;
  bytesTotal: number;
  /** Current part being uploaded (1-indexed). null for single-request uploads. */
  currentPart: number | null;
  totalParts: number | null;
  /** Bytes per second (smoothed). null until enough samples. */
  speed: number | null;
  /** Estimated seconds remaining. null until speed is available. */
  etaSeconds: number | null;
};

export type UploadController = {
  /** Pause the upload after the current in-flight part completes. */
  pause: () => void;
  /** Resume a paused upload. */
  resume: () => void;
  /** Cancel and abort the multipart upload. */
  cancel: () => void;
  readonly isPaused: boolean;
  readonly isCancelled: boolean;
};

const MAX_PART_RETRIES = 3;
const SPEED_SAMPLE_WINDOW = 5;

class SpeedTracker {
  private samples: Array<{ bytes: number; ms: number }> = [];
  private lastTimestamp = performance.now();
  private lastLoaded = 0;

  tick(loaded: number) {
    const now = performance.now();
    const elapsed = now - this.lastTimestamp;
    if (elapsed < 200) return;
    const bytes = loaded - this.lastLoaded;
    this.samples.push({ bytes, ms: elapsed });
    if (this.samples.length > SPEED_SAMPLE_WINDOW) this.samples.shift();
    this.lastTimestamp = now;
    this.lastLoaded = loaded;
  }

  reset() {
    this.lastTimestamp = performance.now();
    this.lastLoaded = 0;
  }

  get bytesPerSecond(): number | null {
    if (this.samples.length < 2) return null;
    const totalBytes = this.samples.reduce((s, v) => s + v.bytes, 0);
    const totalMs = this.samples.reduce((s, v) => s + v.ms, 0);
    if (totalMs === 0) return null;
    return (totalBytes / totalMs) * 1000;
  }
}

export function uploadFile(
  uploadUrl: string,
  file: File,
  onProgress: (progress: UploadProgress) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const speedTracker = new SpeedTracker();

    request.open("PUT", uploadUrl);
    request.setRequestHeader("content-type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        speedTracker.tick(event.loaded);
        const speed = speedTracker.bytesPerSecond;
        const remaining = file.size - event.loaded;
        onProgress({
          percent: Math.round((event.loaded / event.total) * 100),
          bytesUploaded: event.loaded,
          bytesTotal: file.size,
          currentPart: null,
          totalParts: null,
          speed,
          etaSeconds: speed && speed > 0 ? remaining / speed : null,
        });
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }

      reject(new Error(`Upload failed with ${request.status}`));
    };
    request.onerror = () => reject(new Error("Upload failed."));
    request.send(file);
  });
}

function uploadBlobPart(
  uploadUrl: string,
  blob: Blob,
  onProgress: (loaded: number) => void,
  signal?: { cancelled: boolean },
) {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("PUT", uploadUrl);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        const etag = request.getResponseHeader("etag")?.replaceAll('"', "");

        if (!etag) {
          reject(new Error("Multipart upload part did not return an ETag."));
          return;
        }

        resolve(etag);
        return;
      }

      reject(new Error(`Part upload failed with ${request.status}`));
    };
    request.onerror = () => reject(new Error("Part upload failed."));

    if (signal?.cancelled) {
      reject(new Error("Upload cancelled."));
      return;
    }

    request.send(blob);

    if (signal) {
      const check = setInterval(() => {
        if (signal.cancelled) {
          clearInterval(check);
          request.abort();
          reject(new Error("Upload cancelled."));
        }
      }, 250);
      const clear = () => clearInterval(check);
      request.addEventListener("load", clear);
      request.addEventListener("error", clear);
      request.addEventListener("abort", clear);
    }
  });
}

async function uploadPartWithRetries(
  uploadUrl: string,
  blob: Blob,
  onProgress: (loaded: number) => void,
  signal: { cancelled: boolean },
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_PART_RETRIES; attempt++) {
    try {
      return await uploadBlobPart(uploadUrl, blob, onProgress, signal);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (signal.cancelled) throw lastError;
      if (attempt < MAX_PART_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastError ?? new Error("Part upload failed after retries.");
}

export function createUploadController(): UploadController {
  const state = {
    paused: false,
    cancelled: false,
    _onResume: null as (() => void) | null,
  };

  return {
    pause() {
      state.paused = true;
    },
    resume() {
      state.paused = false;
      state._onResume?.();
      state._onResume = null;
    },
    cancel() {
      state.cancelled = true;
      state.paused = false;
      state._onResume?.();
      state._onResume = null;
    },
    get isPaused() {
      return state.paused;
    },
    get isCancelled() {
      return state.cancelled;
    },

    /** @internal – wait if paused. Resolves immediately when not paused. */
    _waitIfPaused(): Promise<void> {
      if (!state.paused) return Promise.resolve();
      return new Promise<void>((resolve) => {
        state._onResume = resolve;
      });
    },
    _signal: state,
  } as UploadController & { _waitIfPaused: () => Promise<void>; _signal: { cancelled: boolean } };
}

export async function uploadOriginalFile(input: {
  apiRequest: <T>(path: string, options?: RequestInit) => Promise<T>;
  projectId: string;
  file: File;
  onProgress: (progress: UploadProgress) => void;
  controller?: UploadController;
}): Promise<string> {
  const multipartThreshold = 100 * 1024 * 1024;
  const ctrl = input.controller as
    | (UploadController & { _waitIfPaused: () => Promise<void>; _signal: { cancelled: boolean } })
    | undefined;

  if (input.file.size < multipartThreshold) {
    const upload = await input.apiRequest<PresignedUpload>("/uploads/presign", {
      method: "POST",
      body: JSON.stringify({
        projectId: input.projectId,
        filename: input.file.name,
        contentType: input.file.type || "application/octet-stream",
        sizeBytes: input.file.size,
      }),
    });
    await uploadFile(upload.uploadUrl, input.file, input.onProgress);

    return upload.originalKey;
  }

  const partSizeBytes = calculatePartSize(input.file.size);
  const partCount = Math.ceil(input.file.size / partSizeBytes);
  const multipart = await input.apiRequest<MultipartUpload>("/uploads/multipart", {
    method: "POST",
    body: JSON.stringify({
      projectId: input.projectId,
      filename: input.file.name,
      contentType: input.file.type || "application/octet-stream",
      sizeBytes: input.file.size,
      partCount,
    }),
  });

  const effectivePartSize = multipart.partSizeBytes;
  const effectivePartCount = Math.ceil(input.file.size / effectivePartSize);
  const uploadedBytesByPart = new Map<number, number>();
  const completedParts: Array<{ partNumber: number; etag: string }> = [];
  const speedTracker = new SpeedTracker();

  function emitProgress(currentPart: number) {
    const totalLoaded = Array.from(uploadedBytesByPart.values()).reduce((sum, v) => sum + v, 0);
    speedTracker.tick(totalLoaded);
    const speed = speedTracker.bytesPerSecond;
    const remaining = input.file.size - totalLoaded;
    input.onProgress({
      percent: Math.round((totalLoaded / input.file.size) * 100),
      bytesUploaded: totalLoaded,
      bytesTotal: input.file.size,
      currentPart,
      totalParts: effectivePartCount,
      speed,
      etaSeconds: speed && speed > 0 ? remaining / speed : null,
    });
  }

  try {
    for (let index = 0; index < effectivePartCount; index += 1) {
      if (ctrl) {
        await ctrl._waitIfPaused();
        if (ctrl._signal.cancelled) throw new Error("Upload cancelled.");
      }

      const partNumber = index + 1;

      const alreadyDone = completedParts.find((p) => p.partNumber === partNumber);
      if (alreadyDone) continue;

      const start = index * effectivePartSize;
      const end = Math.min(input.file.size, start + effectivePartSize);
      const part = input.file.slice(start, end);

      const signedPart = await input.apiRequest<MultipartPartUpload>("/uploads/multipart/part", {
        method: "POST",
        body: JSON.stringify({ key: multipart.originalKey, uploadId: multipart.uploadId, partNumber }),
      });

      const etag = await uploadPartWithRetries(
        signedPart.uploadUrl,
        part,
        (loaded) => {
          uploadedBytesByPart.set(partNumber, loaded);
          emitProgress(partNumber);
        },
        ctrl?._signal ?? { cancelled: false },
      );

      uploadedBytesByPart.set(partNumber, part.size);
      completedParts.push({ partNumber, etag });
      emitProgress(partNumber);
    }

    const completed = await input.apiRequest<{ originalKey: string }>("/uploads/multipart/complete", {
      method: "POST",
      body: JSON.stringify({
        key: multipart.originalKey,
        uploadId: multipart.uploadId,
        parts: completedParts,
        sizeBytes: input.file.size,
      }),
    });

    return completed.originalKey;
  } catch (error) {
    await input
      .apiRequest("/uploads/multipart/abort", {
        method: "POST",
        body: JSON.stringify({ key: multipart.originalKey, uploadId: multipart.uploadId }),
      })
      .catch(() => undefined);
    throw error;
  }
}

export type PresignedUpload = {
  uploadUrl: string;
  method: "PUT";
  bucket: string;
  originalKey: string;
  expiresInSeconds: number;
};

type MultipartUpload = {
  bucket: string;
  originalKey: string;
  uploadId: string;
  partSizeBytes: number;
};

type MultipartPartUpload = {
  uploadUrl: string;
  method: "PUT";
  partNumber: number;
  expiresInSeconds: number;
};
