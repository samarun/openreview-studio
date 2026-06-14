import type { FastifyInstance } from "fastify";
import { addProjectMemberSchema, archiveSchema, createProjectSchema } from "@openreview/shared";
import { prisma } from "../context.js";
import { assertOrganizationRole, assertProjectAccess, assertProjectRole, getAuthUser, visibleProjectsFilter } from "../services/access.js";
import { writeAuditLog } from "../services/audit.js";

export async function registerProjectRoutes(app: FastifyInstance) {
  app.get("/projects", async (request) => {
    const user = await getAuthUser(app, request);
    const filter = await visibleProjectsFilter(user.id);
    return prisma.project.findMany({
      where: {
        archivedAt: null,
        ...filter
      },
      orderBy: { createdAt: "desc" },
      include: {
        organization: true,
        assets: {
          where: { archivedAt: null },
          include: {
            versions: {
              where: { archivedAt: null },
              include: { approvals: { select: { status: true, updatedAt: true } } }
            }
          }
        }
      }
    });
  });

  app.get("/projects/:projectId", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { projectId: string };
    await assertProjectAccess(user.id, params.projectId);

    return prisma.project.findFirstOrThrow({
      where: { id: params.projectId, archivedAt: null },
      include: {
        organization: true,
        assets: {
          where: { archivedAt: null },
          orderBy: { createdAt: "desc" },
          include: {
            versions: {
              where: { archivedAt: null },
              orderBy: { versionNumber: "asc" },
              include: { approvals: { select: { status: true, updatedAt: true } } }
            }
          }
        },
        folders: { orderBy: { name: "asc" } }
      }
    });
  });

  app.post("/projects", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const body = createProjectSchema.parse(request.body);
    await assertOrganizationRole(user.id, body.organizationId, ["OWNER", "ADMIN", "MEMBER"]);

    const project = await prisma.project.create({
      data: { name: body.name, organizationId: body.organizationId }
    });

    await writeAuditLog(app, {
      action: "project.create",
      entityType: "Project",
      entityId: project.id,
      actorUserId: user.id,
      organizationId: project.organizationId
    });

    return project;
  });

  app.patch("/projects/:projectId/archive", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { projectId: string };
    const body = archiveSchema.parse(request.body);
    const project = await assertProjectRole(user.id, params.projectId, ["OWNER", "ADMIN", "MEMBER"]);
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { archivedAt: body.archived ? new Date() : null }
    });

    await writeAuditLog(app, {
      action: body.archived ? "project.archive" : "project.restore",
      entityType: "Project",
      entityId: project.id,
      actorUserId: user.id,
      organizationId: project.organizationId
    });

    return updated;
  });

  // ── Project member management ──────────────────────────────────

  app.get("/projects/:projectId/members", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { projectId: string };
    await assertProjectAccess(user.id, params.projectId);

    return prisma.projectMember.findMany({
      where: { projectId: params.projectId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, email: true, name: true } } }
    });
  });

  app.post("/projects/:projectId/members", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { projectId: string };
    const body = addProjectMemberSchema.parse(request.body);
    const project = await assertProjectRole(user.id, params.projectId, ["OWNER", "ADMIN"]);

    const orgMember = await prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: body.userId, organizationId: project.organizationId } }
    });
    if (!orgMember) {
      return reply.code(400).send({ error: "User is not a member of this organization" });
    }

    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: params.projectId, userId: body.userId } },
      update: {},
      create: { projectId: params.projectId, userId: body.userId },
      include: { user: { select: { id: true, email: true, name: true } } }
    });

    await writeAuditLog(app, {
      action: "project_member.add",
      entityType: "ProjectMember",
      entityId: member.id,
      actorUserId: user.id,
      organizationId: project.organizationId,
      metadata: { projectId: params.projectId, userId: body.userId }
    });

    return reply.code(201).send(member);
  });

  app.delete("/projects/:projectId/members/:userId", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { projectId: string; userId: string };
    const project = await assertProjectRole(user.id, params.projectId, ["OWNER", "ADMIN"]);

    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: params.projectId, userId: params.userId } }
    });
    if (!existing) return reply.code(404).send({ error: "Project member not found" });

    await prisma.projectMember.delete({ where: { id: existing.id } });

    await writeAuditLog(app, {
      action: "project_member.remove",
      entityType: "ProjectMember",
      entityId: existing.id,
      actorUserId: user.id,
      organizationId: project.organizationId,
      metadata: { projectId: params.projectId, userId: params.userId }
    });

    return reply.code(204).send();
  });
}
