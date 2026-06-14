/** Strip duplicate `proxies/` when the route already includes `/media/.../proxies`. */
export function normalizeProxyStorageKey(key: string, mediaBasePath = "/media/proxies") {
  let normalized = key.replace(/^\/+/, "");
  const base = mediaBasePath.replace(/\/+$/, "");

  if (base.endsWith("/proxies") && normalized.startsWith("proxies/")) {
    normalized = normalized.slice("proxies/".length);
  }

  return normalized;
}

/** Build a URL for proxied media (video, HLS, thumbnails). */
export function buildMediaProxyUrl(
  key: string,
  authQuery: string,
  mediaBasePath = "/media/proxies"
) {
  const normalizedKey = normalizeProxyStorageKey(key, mediaBasePath);
  const query = authQuery ? (authQuery.startsWith("?") ? authQuery : `?${authQuery}`) : "";
  const basePath = mediaBasePath.replace(/\/+$/, "");

  // In the browser, always use same-origin URLs so Next.js rewrites `/media/*` to the API.
  const apiBase =
    typeof window !== "undefined"
      ? ""
      : (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

  return `${apiBase}${basePath}/${normalizedKey}${query}`;
}
