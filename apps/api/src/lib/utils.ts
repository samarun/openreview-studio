export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function sanitizeFilename(filename: string) {
  return filename
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 180) || "upload.bin";
}

export function mediaContentType(key: string) {
  if (key.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (key.endsWith(".ts")) return "video/mp2t";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

export function rewriteHlsManifest(manifest: string, query: string | undefined) {
  if (!query) return manifest;

  return manifest
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      return `${line}${line.includes("?") ? "&" : "?"}${query}`;
    })
    .join("\n");
}

export function hlsManifestCandidateForKey(key: string) {
  const lastSlash = key.lastIndexOf("/");
  if (lastSlash === -1) return null;
  return `${key.slice(0, lastSlash)}/index.m3u8`;
}

/** URL path keys may omit a legacy `proxies/` prefix that is still stored in the database. */
export function proxyStorageKeyCandidates(key: string) {
  const normalized = key.replace(/^\/+/, "");
  const candidates = new Set<string>([normalized]);

  if (normalized.startsWith("proxies/")) {
    candidates.add(normalized.slice("proxies/".length));
  } else {
    candidates.add(`proxies/${normalized}`);
  }

  return [...candidates];
}

export function keysMatchProxyStorage(stored: string | null | undefined, requestKey: string) {
  if (!stored) return false;
  return proxyStorageKeyCandidates(requestKey).includes(stored);
}

export function resolveProxyStorageKey(
  version: { proxyKey: string | null; hlsManifestKey: string | null; thumbnailKey: string | null },
  requestKey: string
) {
  const fields = [version.proxyKey, version.hlsManifestKey, version.thumbnailKey].filter(
    (value): value is string => Boolean(value)
  );

  for (const field of fields) {
    if (keysMatchProxyStorage(field, requestKey)) return field;
  }

  return requestKey.replace(/^\/+/, "");
}

export function shareLinkRevoked(shareLink: { revokedAt: Date | null; expiresAt: Date | null }) {
  if (shareLink.revokedAt) return true;
  if (shareLink.expiresAt && shareLink.expiresAt <= new Date()) return true;
  return false;
}

export function publicMediaUrl(key: string) {
  const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT;
  const bucket = process.env.S3_BUCKET_PROXIES ?? "proxies";
  if (!publicEndpoint) return null;
  const base = publicEndpoint.replace(/\/+$/, "");
  return `${base}/${bucket}/${key}`;
}
