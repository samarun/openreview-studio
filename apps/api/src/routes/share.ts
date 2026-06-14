import type { FastifyInstance } from "fastify";
import type { Prisma } from "@openreview/db";
import bcrypt from "bcryptjs";
import {
  publicApprovalSchema,
  publicCommentSchema,
  publicReplySchema,
  resolveCommentSchema,
  rollupApprovalStatus,
  shareAccessSchema
} from "@openreview/shared";
import { GetObjectCommand, getSignedUrl, prisma, proxiesBucket, s3Presign } from "../context.js";
import {
  commentInclude,
  findOrCreateGuestReviewer,
  getAccessibleShareLink,
  shareAccessTokenFromRequest
} from "../services/access.js";
import { writeAuditLog } from "../services/audit.js";
import { publishReviewEvent } from "../services/events.js";
import { notifyVersionWatchers } from "../services/notifications.js";
import { publicMediaUrl, resolveProxyStorageKey, shareLinkRevoked } from "../lib/utils.js";

export async function registerShareRoutes(app: FastifyInstance) {
  app.post("/share/:token/access", async (request, reply) => {
    const params = request.params as { token: string };
    const body = shareAccessSchema.parse(request.body);
    const shareLink = await prisma.shareLink.findUnique({ where: { token: params.token } });

    if (!shareLink || shareLinkRevoked(shareLink)) {
      return reply.code(404).send({ error: "Share link not found" });
    }

    if (shareLink.passwordHash && (!body.password || !(await bcrypt.compare(body.password, shareLink.passwordHash)))) {
      return reply.code(403).send({ error: "Invalid share password" });
    }

    return {
      accessToken: app.jwt.sign({ shareToken: params.token }, { expiresIn: "12h" }),
      requiresPassword: Boolean(shareLink.passwordHash)
    };
  });

  app.get("/share/:token", async (request, reply) => {
    const params = request.params as { token: string };
    await getAccessibleShareLink(app, params.token, shareAccessTokenFromRequest(request));

    const shareLink = await prisma.shareLink.findUnique({
      where: { token: params.token },
      include: {
        project: { include: { organization: true } },
        assetVersion: {
          include: {
            asset: true,
            comments: { orderBy: { timeSeconds: "asc" }, include: commentInclude },
            approvals: { include: { guestReviewer: true, reviewer: { select: { id: true, email: true, name: true } } } }
          }
        }
      }
    });

    if (!shareLink || shareLinkRevoked(shareLink) || !shareLink.assetVersion) {
      return reply.code(404).send({ error: "Share link not found" });
    }

    return shareLink;
  });

  app.post("/share/:token/comments", async (request, reply) => {
    const params = request.params as { token: string };
    const body = publicCommentSchema.parse(request.body);
    const shareLink = await getAccessibleShareLink(app, params.token, shareAccessTokenFromRequest(request));
    if (!shareLink.assetVersionId) return reply.code(404).send({ error: "Share link not found" });

    const guestReviewer = await findOrCreateGuestReviewer({ name: body.name, email: body.email });
    const comment = await prisma.comment.create({
      data: {
        assetVersionId: shareLink.assetVersionId,
        guestReviewerId: guestReviewer.id,
        body: body.body,
        timeSeconds: body.timeSeconds,
        frame: body.frame,
        annotationJson: body.annotationJson as Prisma.InputJsonValue | undefined
      },
      include: commentInclude
    });

    const version = await prisma.assetVersion.findUnique({
      where: { id: shareLink.assetVersionId },
      include: { asset: { include: { project: true } } }
    });

    await writeAuditLog(app, {
      action: "guest_comment.create",
      entityType: "Comment",
      entityId: comment.id,
      organizationId: version?.asset.project.organizationId
    });

    await publishReviewEvent(shareLink.assetVersionId, "comment.created", comment, params.token);
    await notifyVersionWatchers(app, shareLink.assetVersionId, {
      type: "guest_comment.created",
      payload: { commentId: comment.id, assetVersionId: shareLink.assetVersionId, guestName: body.name },
      email: {
        subject: "New guest comment on your review",
        text: `${body.name} left a comment on a shared review.`
      }
    });
    return reply.code(201).send(comment);
  });

  app.patch("/share/:token/comments/:commentId/resolve", async (request, reply) => {
    const params = request.params as { token: string; commentId: string };
    const body = resolveCommentSchema.parse(request.body);
    const shareLink = await getAccessibleShareLink(app, params.token, shareAccessTokenFromRequest(request));
    if (!shareLink.assetVersionId) return reply.code(404).send({ error: "Share link not found" });

    const existing = await prisma.comment.findFirst({
      where: { id: params.commentId, assetVersionId: shareLink.assetVersionId }
    });
    if (!existing) return reply.code(404).send({ error: "Comment not found" });

    const updated = await prisma.comment.update({
      where: { id: existing.id },
      data: { resolvedAt: body.resolved ? new Date() : null },
      include: commentInclude
    });

    await publishReviewEvent(shareLink.assetVersionId, "comment.resolved", updated, params.token);
    return updated;
  });

  app.post("/share/:token/comments/:commentId/replies", async (request, reply) => {
    const params = request.params as { token: string; commentId: string };
    const body = publicReplySchema.parse(request.body);
    const shareLink = await getAccessibleShareLink(app, params.token, shareAccessTokenFromRequest(request));
    if (!shareLink.assetVersionId) return reply.code(404).send({ error: "Share link not found" });

    const comment = await prisma.comment.findFirst({
      where: { id: params.commentId, assetVersionId: shareLink.assetVersionId }
    });
    if (!comment) return reply.code(404).send({ error: "Comment not found" });

    const guestReviewer = await findOrCreateGuestReviewer({ name: body.name, email: body.email });

    const replyRecord = await prisma.commentReply.create({
      data: { commentId: params.commentId, guestReviewerId: guestReviewer.id, body: body.body },
      include: {
        author: { select: { id: true, email: true, name: true } },
        guestReviewer: { select: { id: true, email: true, name: true } }
      }
    });

    await publishReviewEvent(shareLink.assetVersionId, "reply.created", replyRecord, params.token);
    await notifyVersionWatchers(app, shareLink.assetVersionId, {
      type: "guest_reply.created",
      payload: { commentId: params.commentId, replyId: replyRecord.id }
    });
    return reply.code(201).send(replyRecord);
  });

  app.post("/share/:token/approval", async (request, reply) => {
    const params = request.params as { token: string };
    const body = publicApprovalSchema.parse(request.body);
    const shareLink = await getAccessibleShareLink(app, params.token, shareAccessTokenFromRequest(request));
    if (!shareLink.assetVersionId) return reply.code(404).send({ error: "Share link not found" });

    const guestReviewer = await findOrCreateGuestReviewer({ name: body.name, email: body.email });
    const approval = await prisma.approval.upsert({
      where: {
        assetVersionId_guestReviewerId: {
          assetVersionId: shareLink.assetVersionId,
          guestReviewerId: guestReviewer.id
        }
      },
      update: { status: body.status, note: body.note },
      create: {
        assetVersionId: shareLink.assetVersionId,
        guestReviewerId: guestReviewer.id,
        status: body.status,
        note: body.note
      }
    });

    const version = await prisma.assetVersion.findUnique({
      where: { id: shareLink.assetVersionId },
      include: { asset: { include: { project: true } } }
    });

    await writeAuditLog(app, {
      action: "guest_approval.upsert",
      entityType: "Approval",
      entityId: approval.id,
      organizationId: version?.asset.project.organizationId,
      metadata: { status: body.status }
    });

    await publishReviewEvent(shareLink.assetVersionId, "approval.updated", approval, params.token);
    await notifyVersionWatchers(app, shareLink.assetVersionId, {
      type: "guest_approval.updated",
      payload: { status: body.status, guestName: body.name },
      email: {
        subject: `Guest review decision: ${body.status}`,
        text: `${body.name} set the review to ${body.status}.`
      }
    });
    return reply.code(201).send(approval);
  });

  app.get("/share/:token/download", async (request, reply) => {
    const params = request.params as { token: string };
    const shareLink = await getAccessibleShareLink(app, params.token, shareAccessTokenFromRequest(request));
    if (!shareLink.assetVersionId) return reply.code(404).send({ error: "Share link not found" });

    const version = await prisma.assetVersion.findUnique({
      where: { id: shareLink.assetVersionId },
      include: { approvals: { select: { status: true } } }
    });

    if (!version?.proxyKey) return reply.code(404).send({ error: "File not available for download" });

    if (rollupApprovalStatus(version.approvals) !== "APPROVED") {
      return reply.code(403).send({ error: "Download is available after the review is approved" });
    }

    const storageKey = resolveProxyStorageKey(version, version.proxyKey);
    const publicUrl = publicMediaUrl(storageKey);
    const downloadUrl =
      publicUrl ??
      (await getSignedUrl(s3Presign, new GetObjectCommand({ Bucket: proxiesBucket, Key: storageKey }), { expiresIn: 60 * 15 }));

    return { downloadUrl, expiresInSeconds: 60 * 15, type: "proxy" as const };
  });
}
