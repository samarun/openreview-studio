import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  abortMultipartUploadSchema,
  calculatePartSize,
  completeMultipartUploadSchema,
  createMultipartUploadSchema,
  presignUploadSchema,
  signMultipartPartSchema
} from "@openreview/shared";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  UploadPartCommand,
  getSignedUrl,
  originalsBucket,
  s3,
  s3Presign
} from "../context.js";
import {
  assertOriginalKeyAccess,
  assertProjectRole,
  checkStorageQuota,
  getAuthUser
} from "../services/access.js";
import { writeAuditLog } from "../services/audit.js";
import { sanitizeFilename } from "../lib/utils.js";

export async function registerUploadRoutes(app: FastifyInstance) {
  app.post("/uploads/presign", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const body = presignUploadSchema.parse(request.body);
    const project = await assertProjectRole(user.id, body.projectId, ["OWNER", "ADMIN", "MEMBER"]);
    await checkStorageQuota(project.organizationId, BigInt(body.sizeBytes));

    const key = `${project.organizationId}/${project.id}/${randomUUID()}-${sanitizeFilename(body.filename)}`;
    const uploadUrl = await getSignedUrl(
      s3Presign,
      new PutObjectCommand({
        Bucket: originalsBucket,
        Key: key,
        ContentType: body.contentType,
        ContentLength: body.sizeBytes
      }),
      { expiresIn: 60 * 15 }
    );

    return { uploadUrl, method: "PUT", bucket: originalsBucket, originalKey: key, expiresInSeconds: 60 * 15 };
  });

  app.post("/uploads/multipart", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const body = createMultipartUploadSchema.parse(request.body);
    const project = await assertProjectRole(user.id, body.projectId, ["OWNER", "ADMIN", "MEMBER"]);
    await checkStorageQuota(project.organizationId, BigInt(body.sizeBytes));

    const key = `${project.organizationId}/${project.id}/${randomUUID()}-${sanitizeFilename(body.filename)}`;
    const upload = await s3.send(
      new CreateMultipartUploadCommand({ Bucket: originalsBucket, Key: key, ContentType: body.contentType })
    );

    if (!upload.UploadId) return reply.code(500).send({ error: "Unable to create multipart upload" });

    const partSizeBytes = calculatePartSize(body.sizeBytes);

    await writeAuditLog(app, {
      action: "upload.multipart.create",
      entityType: "Object",
      entityId: key,
      actorUserId: user.id,
      organizationId: project.organizationId,
      metadata: { partCount: body.partCount, sizeBytes: body.sizeBytes, partSizeBytes }
    });

    return { bucket: originalsBucket, originalKey: key, uploadId: upload.UploadId, partSizeBytes };
  });

  app.post("/uploads/multipart/part", async (request) => {
    const user = await getAuthUser(app, request);
    const body = signMultipartPartSchema.parse(request.body);
    await assertOriginalKeyAccess(user.id, body.key);

    const expiresIn = 60 * 60 * 2; // 2 hours – large parts on slow connections
    const uploadUrl = await getSignedUrl(
      s3Presign,
      new UploadPartCommand({
        Bucket: originalsBucket,
        Key: body.key,
        UploadId: body.uploadId,
        PartNumber: body.partNumber
      }),
      { expiresIn }
    );

    return { uploadUrl, method: "PUT", partNumber: body.partNumber, expiresInSeconds: expiresIn };
  });

  app.post("/uploads/multipart/complete", async (request) => {
    const user = await getAuthUser(app, request);
    const body = completeMultipartUploadSchema.parse(request.body);
    const project = await assertOriginalKeyAccess(user.id, body.key);

    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: originalsBucket,
        Key: body.key,
        UploadId: body.uploadId,
        MultipartUpload: {
          Parts: body.parts.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber }))
        }
      })
    );

    await writeAuditLog(app, {
      action: "upload.multipart.complete",
      entityType: "Object",
      entityId: body.key,
      actorUserId: user.id,
      organizationId: project.organizationId,
      metadata: { parts: body.parts.length, sizeBytes: body.sizeBytes }
    });

    return { originalKey: body.key };
  });

  app.post("/uploads/multipart/abort", async (request) => {
    const user = await getAuthUser(app, request);
    const body = abortMultipartUploadSchema.parse(request.body);
    const project = await assertOriginalKeyAccess(user.id, body.key);

    await s3.send(new AbortMultipartUploadCommand({ Bucket: originalsBucket, Key: body.key, UploadId: body.uploadId }));
    await writeAuditLog(app, {
      action: "upload.multipart.abort",
      entityType: "Object",
      entityId: body.key,
      actorUserId: user.id,
      organizationId: project.organizationId
    });

    return { ok: true };
  });
}
