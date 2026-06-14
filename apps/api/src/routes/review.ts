import type { FastifyInstance } from "fastify";
import type { Prisma } from "@openreview/db";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import {
  approvalSchema,
  createCommentSchema,
  createReplySchema,
  createShareLinkSchema,
  resolveCommentSchema,
  revokeShareLinkSchema
} from "@openreview/shared";
import { prisma, webUrl } from "../context.js";
import {
  assertAssetVersionAccess,
  assertCommentAccess,
  assertProjectRole,
  commentInclude,
  formatShareLink,
  getAuthUser
} from "../services/access.js";
import { writeAuditLog } from "../services/audit.js";
import { publishReviewEvent } from "../services/events.js";
import { notifyVersionWatchers } from "../services/notifications.js";
import { sendMail } from "../services/mail.js";

export async function registerReviewRoutes(app: FastifyInstance) {
  app.get("/review/:assetVersionId/comments", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetVersionId: string };
    await assertAssetVersionAccess(user.id, params.assetVersionId);

    return prisma.comment.findMany({
      where: { assetVersionId: params.assetVersionId },
      orderBy: { timeSeconds: "asc" },
      include: commentInclude
    });
  });

  app.post("/review/:assetVersionId/comments", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetVersionId: string };
    const body = createCommentSchema.parse(request.body);
    await assertAssetVersionAccess(user.id, params.assetVersionId);

    const comment = await prisma.comment.create({
      data: {
        assetVersionId: params.assetVersionId,
        authorId: user.id,
        body: body.body,
        timeSeconds: body.timeSeconds,
        frame: body.frame,
        annotationJson: body.annotationJson as Prisma.InputJsonValue | undefined
      },
      include: commentInclude
    });

    const version = await prisma.assetVersion.findUnique({
      where: { id: params.assetVersionId },
      include: { asset: { include: { project: true } }, shareLinks: true }
    });

    await writeAuditLog(app, {
      action: "comment.create",
      entityType: "Comment",
      entityId: comment.id,
      actorUserId: user.id,
      organizationId: version?.asset.project.organizationId
    });

    const shareToken = version?.shareLinks[0]?.token;
    await publishReviewEvent(params.assetVersionId, "comment.created", comment, shareToken);
    await notifyVersionWatchers(app, params.assetVersionId, {
      type: "comment.created",
      payload: { commentId: comment.id, assetVersionId: params.assetVersionId },
      email: { subject: "New review comment", text: `A new comment was added at ${body.timeSeconds}s.` }
    });

    return reply.code(201).send(comment);
  });

  app.post("/comments/:commentId/replies", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { commentId: string };
    const body = createReplySchema.parse(request.body);
    const comment = await assertCommentAccess(user.id, params.commentId);

    const replyRecord = await prisma.commentReply.create({
      data: { commentId: params.commentId, authorId: user.id, body: body.body },
      include: { author: { select: { id: true, email: true, name: true } } }
    });

    await publishReviewEvent(comment.assetVersionId, "reply.created", replyRecord);
    return reply.code(201).send(replyRecord);
  });

  app.patch("/comments/:commentId/resolve", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { commentId: string };
    const body = resolveCommentSchema.parse(request.body);
    const existing = await assertCommentAccess(user.id, params.commentId);

    const updated = await prisma.comment.update({
      where: { id: params.commentId },
      data: { resolvedAt: body.resolved ? new Date() : null },
      include: commentInclude
    });

    await publishReviewEvent(existing.assetVersionId, "comment.resolved", updated);
    return updated;
  });

  app.get("/review/:assetVersionId/approval", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetVersionId: string };
    await assertAssetVersionAccess(user.id, params.assetVersionId);

    return prisma.approval.findUnique({
      where: { assetVersionId_reviewerId: { assetVersionId: params.assetVersionId, reviewerId: user.id } }
    });
  });

  app.post("/review/:assetVersionId/approval", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetVersionId: string };
    const body = approvalSchema.parse(request.body);
    await assertAssetVersionAccess(user.id, params.assetVersionId);

    const approval = await prisma.approval.upsert({
      where: { assetVersionId_reviewerId: { assetVersionId: params.assetVersionId, reviewerId: user.id } },
      update: { status: body.status, note: body.note },
      create: {
        assetVersionId: params.assetVersionId,
        reviewerId: user.id,
        status: body.status,
        note: body.note
      }
    });

    const version = await prisma.assetVersion.findUnique({
      where: { id: params.assetVersionId },
      include: { asset: { include: { project: true } }, shareLinks: true }
    });

    await writeAuditLog(app, {
      action: "approval.upsert",
      entityType: "Approval",
      entityId: approval.id,
      actorUserId: user.id,
      organizationId: version?.asset.project.organizationId,
      metadata: { status: body.status }
    });

    await publishReviewEvent(params.assetVersionId, "approval.updated", approval, version?.shareLinks[0]?.token);
    return approval;
  });

  app.post("/review/:assetVersionId/share-links", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetVersionId: string };
    const body = createShareLinkSchema.parse(request.body);
    const version = await assertAssetVersionAccess(user.id, params.assetVersionId);
    await assertProjectRole(user.id, version.asset.projectId, ["OWNER", "ADMIN", "MEMBER"]);

    const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : null;
    const shareLink = await prisma.shareLink.create({
      data: {
        projectId: version.asset.projectId,
        assetVersionId: version.id,
        token: randomUUID().replace(/-/g, ""),
        passwordHash,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
      }
    });

    const project = await prisma.project.findUnique({ where: { id: version.asset.projectId } });
    await writeAuditLog(app, {
      action: "share_link.create",
      entityType: "ShareLink",
      entityId: shareLink.id,
      actorUserId: user.id,
      organizationId: project?.organizationId,
      metadata: { passwordProtected: Boolean(passwordHash) }
    });

    if (body.inviteEmail) {
      await sendMail(app, {
        to: body.inviteEmail,
        subject: "Review requested in OpenReview Studio",
        text: `You have been invited to review a video: ${webUrl}/share/${shareLink.token}${body.password ? "\n\nA password is required to open this review." : ""}`
      });
    }

    return reply.code(201).send(shareLink);
  });

  app.get("/review/:assetVersionId/share-links", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { assetVersionId: string };
    const version = await assertAssetVersionAccess(user.id, params.assetVersionId);
    await assertProjectRole(user.id, version.asset.projectId, ["OWNER", "ADMIN", "MEMBER"]);

    const links = await prisma.shareLink.findMany({
      where: { assetVersionId: version.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true, expiresAt: true, revokedAt: true, createdAt: true, updatedAt: true, passwordHash: true }
    });

    return links.map(formatShareLink);
  });

  app.patch("/share-links/:shareLinkId/revoke", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { shareLinkId: string };
    const body = revokeShareLinkSchema.parse(request.body);
    const shareLink = await prisma.shareLink.findUnique({ where: { id: params.shareLinkId } });
    if (!shareLink) return reply.code(404).send({ error: "Share link not found" });

    const project = await assertProjectRole(user.id, shareLink.projectId, ["OWNER", "ADMIN", "MEMBER"]);

    const updated = await prisma.shareLink.update({
      where: { id: shareLink.id },
      data: { revokedAt: body.revoked ? new Date() : null },
      select: { id: true, token: true, expiresAt: true, revokedAt: true, createdAt: true, updatedAt: true, passwordHash: true }
    });

    await writeAuditLog(app, {
      action: body.revoked ? "share_link.revoke" : "share_link.restore",
      entityType: "ShareLink",
      entityId: shareLink.id,
      actorUserId: user.id,
      organizationId: project.organizationId
    });

    return formatShareLink(updated);
  });
}
