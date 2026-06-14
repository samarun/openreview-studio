import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Readable } from "node:stream";
import { text as streamText } from "node:stream/consumers";
import { GetObjectCommand, HeadObjectCommand, proxiesBucket, s3 } from "../context.js";
import {
  assertProxyKeyAccess,
  assertShareProxyKeyAccess,
  bearerTokenFromRequest,
  getAuthUserFromHeaderOrQuery,
  shareAccessTokenFromRequest
} from "../services/access.js";
import { mediaContentType, resolveProxyStorageKey, rewriteHlsManifest } from "../lib/utils.js";

/** HeadObjectCommand throws "NotFound"; GetObjectCommand throws "NoSuchKey". */
function isS3NotFound(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("name" in err)) return false;
  const name = (err as { name: string }).name;
  return name === "NoSuchKey" || name === "NotFound";
}

function parseRange(header: string | undefined, totalBytes: number) {
  if (!header || !header.startsWith("bytes=")) return null;
  const range = header.slice("bytes=".length);
  const [startStr, endStr] = range.split("-");
  const start = startStr ? Number(startStr) : 0;
  const end = endStr ? Math.min(Number(endStr), totalBytes - 1) : totalBytes - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0) return null;
  return { start, end };
}

async function headObject(storageKey: string) {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: proxiesBucket, Key: storageKey }));
  } catch (err: unknown) {
    if (isS3NotFound(err)) return null;
    throw err;
  }
}

async function streamMedia(request: FastifyRequest, reply: FastifyReply, storageKey: string) {
  const contentType = mediaContentType(storageKey);

  if (storageKey.endsWith(".m3u8")) {
    const object = await fetchObject(storageKey);
    if (!object?.Body) return reply.code(404).send({ error: "Media not found" });
    const token = bearerTokenFromRequest(request);
    const manifest = await streamText(object.Body as Readable);
    return reply
      .header("content-type", contentType)
      .send(rewriteHlsManifest(manifest, token ? `token=${encodeURIComponent(token)}` : undefined));
  }

  const head = await headObject(storageKey);
  const totalBytes = head?.ContentLength ?? 0;
  if (!head || totalBytes === 0) return reply.code(404).send({ error: "Media not found" });

  const rangeHeader = request.headers.range;
  const range = parseRange(rangeHeader, totalBytes);

  if (range) {
    const { start, end } = range;
    const object = await s3.send(
      new GetObjectCommand({ Bucket: proxiesBucket, Key: storageKey, Range: `bytes=${start}-${end}` })
    );
    if (!object.Body) return reply.code(404).send({ error: "Media not found" });

    return reply
      .code(206)
      .header("content-type", contentType)
      .header("accept-ranges", "bytes")
      .header("content-range", `bytes ${start}-${end}/${totalBytes}`)
      .header("content-length", end - start + 1)
      .send(object.Body as Readable);
  }

  const object = await s3.send(new GetObjectCommand({ Bucket: proxiesBucket, Key: storageKey }));
  if (!object.Body) return reply.code(404).send({ error: "Media not found" });

  return reply
    .header("content-type", contentType)
    .header("accept-ranges", "bytes")
    .header("content-length", totalBytes)
    .send(object.Body as Readable);
}

async function streamShareMedia(request: FastifyRequest, reply: FastifyReply, storageKey: string) {
  const contentType = mediaContentType(storageKey);

  if (storageKey.endsWith(".m3u8")) {
    const object = await fetchObject(storageKey);
    if (!object?.Body) return reply.code(404).send({ error: "Media not found" });
    const accessToken = shareAccessTokenFromRequest(request);
    const manifest = await streamText(object.Body as Readable);
    return reply
      .header("content-type", contentType)
      .send(rewriteHlsManifest(manifest, accessToken ? `accessToken=${encodeURIComponent(accessToken)}` : undefined));
  }

  const head = await headObject(storageKey);
  const totalBytes = head?.ContentLength ?? 0;
  if (!head || totalBytes === 0) return reply.code(404).send({ error: "Media not found" });

  const rangeHeader = request.headers.range;
  const range = parseRange(rangeHeader, totalBytes);

  if (range) {
    const { start, end } = range;
    const object = await s3.send(
      new GetObjectCommand({ Bucket: proxiesBucket, Key: storageKey, Range: `bytes=${start}-${end}` })
    );
    if (!object.Body) return reply.code(404).send({ error: "Media not found" });

    return reply
      .code(206)
      .header("content-type", contentType)
      .header("accept-ranges", "bytes")
      .header("content-range", `bytes ${start}-${end}/${totalBytes}`)
      .header("content-length", end - start + 1)
      .send(object.Body as Readable);
  }

  const object = await s3.send(new GetObjectCommand({ Bucket: proxiesBucket, Key: storageKey }));
  if (!object.Body) return reply.code(404).send({ error: "Media not found" });

  return reply
    .header("content-type", contentType)
    .header("accept-ranges", "bytes")
    .header("content-length", totalBytes)
    .send(object.Body as Readable);
}

async function fetchObject(storageKey: string) {
  try {
    return await s3.send(new GetObjectCommand({ Bucket: proxiesBucket, Key: storageKey }));
  } catch (err: unknown) {
    if (isS3NotFound(err)) return null;
    throw err;
  }
}

export async function registerMediaRoutes(app: FastifyInstance) {
  app.get("/media/proxies/*", async (request, reply) => {
    const user = await getAuthUserFromHeaderOrQuery(app, request);
    const params = request.params as { "*": string };
    const key = params["*"];
    if (!key) return reply.code(400).send({ error: "Media key is required" });

    const version = await assertProxyKeyAccess(user.id, key);
    const storageKey = resolveProxyStorageKey(version, key);

    try {
      return await streamMedia(request, reply, storageKey);
    } catch (err: unknown) {
      if (isS3NotFound(err)) {
        return reply.code(404).send({ error: "Media file not found in storage" });
      }
      throw err;
    }
  });

  app.get("/media/share/:token/proxies/*", async (request, reply) => {
    const params = request.params as { token: string; "*": string };
    const key = params["*"];
    if (!key) return reply.code(400).send({ error: "Media key is required" });

    const version = await assertShareProxyKeyAccess(app, params.token, shareAccessTokenFromRequest(request), key);
    const storageKey = resolveProxyStorageKey(version, key);

    try {
      return await streamShareMedia(request, reply, storageKey);
    } catch (err: unknown) {
      if (isS3NotFound(err)) {
        return reply.code(404).send({ error: "Media file not found in storage" });
      }
      throw err;
    }
  });
}
