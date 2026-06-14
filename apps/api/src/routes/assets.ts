import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { GetObjectCommand, getSignedUrl } from "../context.js";
import { archiveSchema, createAssetSchema, createVersionSchema, moveAssetSchema } from "@openreview/shared";
import { originalsBucket, prisma, proxiesBucket, s3, s3Presign, transcodeQueue } from "../context.js";
import {
  assertAssetAccess,
  assertAssetVersionAccess,
  assertOriginalKeyAccess,
  assertOriginalObjectExists,
  assertProjectRole,
  getAuthUser,
  getAuthUserFromHeaderOrQuery,
  getObjectByteSize,
  incrementStorageUsed
} from "../services/access.js";
import { writeAuditLog } from "../services/audit.js";
import { publishReviewEvent } from "../services/events.js";
import { notifyVersionWatchers } from "../services/notifications.js";
import { publicMediaUrl } from "../lib/utils.js";

export async function registerAssetRoutes(app: FastifyInstance) {
  app.get("/assets/:assetId", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetId: string };
    return assertAssetAccess(user.id, params.assetId);
  });

  app.get("/versions/:assetVersionId", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetVersionId: string };
    return assertAssetVersionAccess(user.id, params.assetVersionId);
  });

  app.get("/versions/:assetVersionId/status", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetVersionId: string };
    const version = await assertAssetVersionAccess(user.id, params.assetVersionId);

    return {
      id: version.id,
      status: version.status,
      failureReason: version.failureReason,
      proxyKey: version.proxyKey,
      hlsManifestKey: version.hlsManifestKey,
      thumbnailKey: version.thumbnailKey,
      durationSeconds: version.durationSeconds,
      frameRate: version.frameRate,
      width: version.width,
      height: version.height,
      updatedAt: version.updatedAt
    };
  });

  app.get("/versions/:assetVersionId/frame", async (request, reply) => {
    const user = await getAuthUserFromHeaderOrQuery(app, request);
    const params = request.params as { assetVersionId: string };
    const query = request.query as { time?: string };
    const version = await assertAssetVersionAccess(user.id, params.assetVersionId);

    const timeSeconds = Math.max(0, parseFloat(query.time || "0") || 0);

    if (version.thumbnailKey && timeSeconds <= 1.5) {
      try {
        const obj = await s3.send(new GetObjectCommand({ Bucket: proxiesBucket, Key: version.thumbnailKey }));
        if (obj.Body) {
          return reply
            .header("content-type", "image/jpeg")
            .header("cache-control", "public, max-age=3600")
            .send(obj.Body as Readable);
        }
      } catch {}
    }

    if (!version.proxyKey) {
      if (version.thumbnailKey) {
        try {
          const obj = await s3.send(new GetObjectCommand({ Bucket: proxiesBucket, Key: version.thumbnailKey }));
          if (obj.Body) {
            return reply
              .header("content-type", "image/jpeg")
              .header("cache-control", "public, max-age=3600")
              .send(obj.Body as Readable);
          }
        } catch {}
      }
      return reply.code(404).send({ error: "No proxy video available" });
    }

    const workDir = join(tmpdir(), `openreview-frame-${params.assetVersionId}-${Date.now()}`);
    const inputPath = join(workDir, "input.mp4");
    const outputPath = join(workDir, "frame.jpg");

    try {
      await mkdir(workDir, { recursive: true });

      const obj = await s3.send(new GetObjectCommand({ Bucket: proxiesBucket, Key: version.proxyKey }));
      if (!obj.Body) return reply.code(404).send({ error: "Proxy video not found in storage" });

      const chunks: Buffer[] = [];
      for await (const chunk of obj.Body as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      await writeFile(inputPath, Buffer.concat(chunks));

      await new Promise<void>((resolve, reject) => {
        const proc = spawn("ffmpeg", [
          "-y",
          "-ss", String(timeSeconds),
          "-i", inputPath,
          "-frames:v", "1",
          "-vf", "scale=960:-2",
          "-q:v", "2",
          outputPath
        ]);

        let stderr = "";
        proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-500)}`));
        });
        proc.on("error", reject);
      });

      const { readFile } = await import("node:fs/promises");
      const frameData = await readFile(outputPath);
      return reply
        .header("content-type", "image/jpeg")
        .header("cache-control", "public, max-age=3600")
        .send(frameData);
    } catch (err: unknown) {
      if (version.thumbnailKey) {
        try {
          const obj = await s3.send(new GetObjectCommand({ Bucket: proxiesBucket, Key: version.thumbnailKey }));
          if (obj.Body) {
            return reply
              .header("content-type", "image/jpeg")
              .header("cache-control", "public, max-age=3600")
              .send(obj.Body as Readable);
          }
        } catch {}
      }
      const msg = err instanceof Error ? err.message : "Frame extraction failed";
      return reply.code(500).send({ error: msg });
    } finally {
      try { await unlink(inputPath); } catch {}
      try { await unlink(outputPath); } catch {}
      try { const { rmdir } = await import("node:fs/promises"); await rmdir(workDir); } catch {}
    }
  });

  app.get("/review/compare", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const query = request.query as { left?: string; right?: string };
    if (!query.left || !query.right) return reply.code(400).send({ error: "left and right version ids are required" });

    const [left, right] = await Promise.all([
      assertAssetVersionAccess(user.id, query.left),
      assertAssetVersionAccess(user.id, query.right)
    ]);

    if (left.assetId !== right.assetId) {
      return reply.code(400).send({ error: "Versions must belong to the same asset" });
    }

    return { left, right, asset: await assertAssetAccess(user.id, left.assetId) };
  });

  app.get("/assets/:assetId/versions/:assetVersionId/download", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetId: string; assetVersionId: string };
    const query = request.query as { type?: string };
    const asset = await assertAssetAccess(user.id, params.assetId);
    const version = asset.versions.find((item) => item.id === params.assetVersionId);

    if (!version) return reply.code(404).send({ error: "Version not found" });

    await assertProjectRole(user.id, asset.projectId, ["OWNER", "ADMIN", "MEMBER", "REVIEWER"]);

    const type = query.type === "original" ? "original" : "proxy";
    const bucket = type === "original" ? originalsBucket : process.env.S3_BUCKET_PROXIES ?? "proxies";
    const key = type === "original" ? version.originalKey : version.proxyKey;

    if (!key) return reply.code(404).send({ error: "File not available for download" });

    const publicUrl = type === "proxy" ? publicMediaUrl(key) : null;
    const downloadUrl =
      publicUrl ??
      (await getSignedUrl(s3Presign, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 60 * 15 }));
    return { downloadUrl, expiresInSeconds: 60 * 15, type };
  });

  app.patch("/assets/:assetId", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetId: string };
    const body = moveAssetSchema.parse(request.body);
    const asset = await prisma.asset.findUnique({ where: { id: params.assetId }, include: { project: true } });
    if (!asset) return reply.code(404).send({ error: "Asset not found" });

    await assertProjectRole(user.id, asset.projectId, ["OWNER", "ADMIN", "MEMBER"]);

    if (body.folderId) {
      const folder = await prisma.folder.findFirst({ where: { id: body.folderId, projectId: asset.projectId } });
      if (!folder) return reply.code(404).send({ error: "Folder not found" });
    }

    return prisma.asset.update({ where: { id: asset.id }, data: { folderId: body.folderId } });
  });

  app.patch("/assets/:assetId/archive", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetId: string };
    const body = archiveSchema.parse(request.body);
    const asset = await prisma.asset.findUnique({ where: { id: params.assetId }, include: { project: true } });
    if (!asset) return reply.code(404).send({ error: "Asset not found" });

    await assertProjectRole(user.id, asset.projectId, ["OWNER", "ADMIN", "MEMBER"]);
    const updated = await prisma.asset.update({
      where: { id: asset.id },
      data: { archivedAt: body.archived ? new Date() : null }
    });

    await writeAuditLog(app, {
      action: body.archived ? "asset.archive" : "asset.restore",
      entityType: "Asset",
      entityId: asset.id,
      actorUserId: user.id,
      organizationId: asset.project.organizationId
    });

    return updated;
  });

  app.patch("/versions/:assetVersionId/archive", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetVersionId: string };
    const body = archiveSchema.parse(request.body);
    const version = await assertAssetVersionAccess(user.id, params.assetVersionId);
    await assertProjectRole(user.id, version.asset.projectId, ["OWNER", "ADMIN", "MEMBER"]);

    const project = await prisma.project.findUnique({ where: { id: version.asset.projectId } });
    const updated = await prisma.assetVersion.update({
      where: { id: version.id },
      data: { archivedAt: body.archived ? new Date() : null }
    });

    await writeAuditLog(app, {
      action: body.archived ? "asset_version.archive" : "asset_version.restore",
      entityType: "AssetVersion",
      entityId: version.id,
      actorUserId: user.id,
      organizationId: project?.organizationId
    });

    return updated;
  });

  app.post("/assets", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const body = createAssetSchema.parse(request.body);
    await assertProjectRole(user.id, body.projectId, ["OWNER", "ADMIN", "MEMBER"]);
    const originalProject = await assertOriginalKeyAccess(user.id, body.originalKey);

    if (originalProject.id !== body.projectId) {
      return reply.code(403).send({ error: "Original object does not belong to this project" });
    }

    await assertOriginalObjectExists(s3, body.originalKey, originalsBucket);

    const asset = await prisma.asset.create({
      data: {
        name: body.name,
        projectId: body.projectId,
        folderId: body.folderId,
        versions: {
          create: {
            versionNumber: 1,
            originalKey: body.originalKey,
            status: "PROCESSING"
          }
        }
      },
      include: { versions: true }
    });

    const version = asset.versions[0];
    if (!version) return reply.code(500).send({ error: "Asset version was not created" });

    await transcodeQueue.add("asset-version", { assetVersionId: version.id, originalKey: version.originalKey });
    const project = await prisma.project.findUnique({ where: { id: asset.projectId } });
    if (project) {
      const bytes = await getObjectByteSize(s3, originalsBucket, body.originalKey);
      await incrementStorageUsed(project.organizationId, bytes);
    }

    await writeAuditLog(app, {
      action: "asset.create",
      entityType: "Asset",
      entityId: asset.id,
      actorUserId: user.id,
      organizationId: project?.organizationId
    });

    return reply.code(201).send(asset);
  });

  app.post("/assets/:assetId/versions", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetId: string };
    const body = createVersionSchema.parse(request.body);
    const asset = await prisma.asset.findUnique({ where: { id: params.assetId }, include: { versions: true } });
    if (!asset) return reply.code(404).send({ error: "Asset not found" });

    await assertProjectRole(user.id, asset.projectId, ["OWNER", "ADMIN", "MEMBER"]);
    const originalProject = await assertOriginalKeyAccess(user.id, body.originalKey);
    if (originalProject.id !== asset.projectId) {
      return reply.code(403).send({ error: "Original object does not belong to this asset project" });
    }

    await assertOriginalObjectExists(s3, body.originalKey, originalsBucket);

    const version = await prisma.$transaction(async (tx) => {
      const latest = await tx.assetVersion.aggregate({ where: { assetId: asset.id }, _max: { versionNumber: true } });
      return tx.assetVersion.create({
        data: {
          assetId: asset.id,
          versionNumber: (latest._max.versionNumber ?? 0) + 1,
          originalKey: body.originalKey,
          status: "PROCESSING"
        }
      });
    });

    await transcodeQueue.add("asset-version", { assetVersionId: version.id, originalKey: version.originalKey });
    const project = await prisma.project.findUnique({ where: { id: asset.projectId } });
    if (project) {
      const bytes = await getObjectByteSize(s3, originalsBucket, body.originalKey);
      await incrementStorageUsed(project.organizationId, bytes);
    }

    await writeAuditLog(app, {
      action: "asset_version.create",
      entityType: "AssetVersion",
      entityId: version.id,
      actorUserId: user.id,
      organizationId: project?.organizationId
    });

    await publishReviewEvent(version.id, "version.status", { status: "PROCESSING" });
    await notifyVersionWatchers(app, version.id, {
      type: "version.processing",
      payload: { assetVersionId: version.id, assetId: asset.id },
      email: { subject: "New version uploaded", text: `A new version was uploaded for ${asset.name}.` }
    });

    return reply.code(201).send(version);
  });
}
