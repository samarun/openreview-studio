import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { inviteMemberSchema, updateMemberRoleSchema, updateOrganizationSchema } from "@openreview/shared";
import { prisma } from "../context.js";
import {
  assertCanChangeMembership,
  assertOrganizationRole,
  getAuthUser
} from "../services/access.js";
import { writeAuditLog } from "../services/audit.js";
import { sendInviteEmail } from "../services/mail.js";

export async function registerOrganizationRoutes(app: FastifyInstance) {
  app.get("/organizations/:organizationId/members", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { organizationId: string };
    await assertOrganizationRole(user.id, params.organizationId, ["OWNER", "ADMIN", "MEMBER", "REVIEWER"]);

    return prisma.organizationMember.findMany({
      where: { organizationId: params.organizationId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, email: true, name: true } } }
    });
  });

  app.post("/organizations/:organizationId/members", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { organizationId: string };
    const body = inviteMemberSchema.parse(request.body);
    await assertOrganizationRole(user.id, params.organizationId, ["OWNER", "ADMIN"]);

    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: params.organizationId } });
    const invitedUser = await prisma.user.upsert({
      where: { email: body.email.toLowerCase() },
      update: { name: body.name },
      create: { email: body.email.toLowerCase(), name: body.name }
    });

    const invitedMembership = await prisma.organizationMember.upsert({
      where: { userId_organizationId: { userId: invitedUser.id, organizationId: params.organizationId } },
      update: { role: body.role },
      create: { userId: invitedUser.id, organizationId: params.organizationId, role: body.role },
      include: { user: { select: { id: true, email: true, name: true } } }
    });

    if (!invitedUser.passwordHash) {
      const token = randomUUID();
      await prisma.inviteToken.create({
        data: {
          token,
          userId: invitedUser.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });
      await sendInviteEmail(app, { to: invitedUser.email, organizationName: organization.name, inviteToken: token });
    }

    await writeAuditLog(app, {
      action: "organization_member.invite",
      entityType: "OrganizationMember",
      entityId: invitedMembership.id,
      actorUserId: user.id,
      organizationId: params.organizationId,
      metadata: { email: body.email, role: body.role }
    });

    return reply.code(201).send(invitedMembership);
  });

  app.patch("/organizations/:organizationId/members/:membershipId", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { organizationId: string; membershipId: string };
    const body = updateMemberRoleSchema.parse(request.body);
    await assertOrganizationRole(user.id, params.organizationId, ["OWNER", "ADMIN"]);
    const membership = await assertCanChangeMembership({ membershipId: params.membershipId, nextRole: body.role });

    if (membership.organizationId !== params.organizationId) {
      return reply.code(404).send({ error: "Member not found" });
    }

    if (membership.role === "OWNER" && body.role !== "OWNER") {
      await assertOrganizationRole(user.id, params.organizationId, ["OWNER"]);
    }

    const updated = await prisma.organizationMember.update({
      where: { id: membership.id },
      data: { role: body.role },
      include: { user: { select: { id: true, email: true, name: true } } }
    });

    await writeAuditLog(app, {
      action: "organization_member.update_role",
      entityType: "OrganizationMember",
      entityId: updated.id,
      actorUserId: user.id,
      organizationId: params.organizationId,
      metadata: { email: updated.user.email, role: updated.role }
    });

    return updated;
  });

  app.delete("/organizations/:organizationId/members/:membershipId", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { organizationId: string; membershipId: string };
    await assertOrganizationRole(user.id, params.organizationId, ["OWNER", "ADMIN"]);
    const membership = await assertCanChangeMembership({ membershipId: params.membershipId, remove: true });

    if (membership.organizationId !== params.organizationId) {
      return reply.code(404).send({ error: "Member not found" });
    }

    if (membership.role === "OWNER") {
      await assertOrganizationRole(user.id, params.organizationId, ["OWNER"]);
    }

    await prisma.organizationMember.delete({ where: { id: membership.id } });
    await writeAuditLog(app, {
      action: "organization_member.remove",
      entityType: "OrganizationMember",
      entityId: membership.id,
      actorUserId: user.id,
      organizationId: params.organizationId,
      metadata: { email: membership.user.email, role: membership.role }
    });

    return reply.code(204).send();
  });

  app.get("/organizations/:organizationId/audit-logs", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { organizationId: string };
    await assertOrganizationRole(user.id, params.organizationId, ["OWNER", "ADMIN", "MEMBER", "REVIEWER"]);

    return prisma.auditLog.findMany({
      where: { organizationId: params.organizationId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { actorUser: { select: { id: true, email: true, name: true } } }
    });
  });

  app.patch("/organizations/:organizationId", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { organizationId: string };
    const body = updateOrganizationSchema.parse(request.body);
    await assertOrganizationRole(user.id, params.organizationId, ["OWNER", "ADMIN"]);

    const updated = await prisma.organization.update({
      where: { id: params.organizationId },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl } : {}),
        ...(body.brandColor !== undefined ? { brandColor: body.brandColor } : {})
      }
    });

    await writeAuditLog(app, {
      action: "organization.update",
      entityType: "Organization",
      entityId: updated.id,
      actorUserId: user.id,
      organizationId: updated.id
    });

    return updated;
  });

  app.get("/organizations/:organizationId/share-links", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { organizationId: string };
    await assertOrganizationRole(user.id, params.organizationId, ["OWNER", "ADMIN"]);

    const links = await prisma.shareLink.findMany({
      where: { project: { organizationId: params.organizationId } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        project: { select: { id: true, name: true } },
        assetVersion: {
          include: {
            asset: { select: { id: true, name: true } }
          }
        }
      }
    });

    return links.map((link) => ({
      id: link.id,
      token: link.token,
      projectId: link.projectId,
      projectName: link.project.name,
      assetVersionId: link.assetVersionId,
      assetName: link.assetVersion?.asset.name ?? null,
      versionNumber: link.assetVersion?.versionNumber ?? null,
      expiresAt: link.expiresAt,
      revokedAt: link.revokedAt,
      passwordProtected: Boolean(link.passwordHash),
      createdAt: link.createdAt
    }));
  });
}
