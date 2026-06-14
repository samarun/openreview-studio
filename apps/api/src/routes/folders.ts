import type { FastifyInstance } from "fastify";
import { createFolderSchema, updateFolderSchema } from "@openreview/shared";
import { prisma } from "../context.js";
import { assertProjectRole, getAuthUser } from "../services/access.js";
import { writeAuditLog } from "../services/audit.js";

export async function registerFolderRoutes(app: FastifyInstance) {
  app.get("/projects/:projectId/folders", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { projectId: string };
    const project = await assertProjectRole(user.id, params.projectId, ["OWNER", "ADMIN", "MEMBER", "REVIEWER"]);

    return prisma.folder.findMany({
      where: { projectId: project.id },
      orderBy: { name: "asc" },
      include: { assets: { where: { archivedAt: null }, include: { versions: { where: { archivedAt: null } } } } }
    });
  });

  app.post("/folders", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const body = createFolderSchema.parse(request.body);
    const project = await assertProjectRole(user.id, body.projectId, ["OWNER", "ADMIN", "MEMBER"]);

    if (body.parentId) {
      const parent = await prisma.folder.findFirst({ where: { id: body.parentId, projectId: project.id } });
      if (!parent) return reply.code(404).send({ error: "Parent folder not found" });
    }

    const folder = await prisma.folder.create({
      data: {
        name: body.name,
        projectId: project.id,
        parentId: body.parentId,
        organizationId: project.organizationId
      }
    });

    await writeAuditLog(app, {
      action: "folder.create",
      entityType: "Folder",
      entityId: folder.id,
      actorUserId: user.id,
      organizationId: project.organizationId
    });

    return reply.code(201).send(folder);
  });

  app.patch("/folders/:folderId", async (request) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { folderId: string };
    const body = updateFolderSchema.parse(request.body);
    const folder = await prisma.folder.findUnique({ where: { id: params.folderId } });
    if (!folder) throw Object.assign(new Error("Folder not found"), { statusCode: 404 });

    await assertProjectRole(user.id, folder.projectId, ["OWNER", "ADMIN", "MEMBER"]);

    if (body.parentId) {
      const parent = await prisma.folder.findFirst({ where: { id: body.parentId, projectId: folder.projectId } });
      if (!parent) throw Object.assign(new Error("Parent folder not found"), { statusCode: 404 });
    }

    return prisma.folder.update({
      where: { id: folder.id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.parentId !== undefined ? { parentId: body.parentId } : {})
      }
    });
  });

  app.delete("/folders/:folderId", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { folderId: string };
    const folder = await prisma.folder.findUnique({ where: { id: params.folderId } });
    if (!folder) return reply.code(404).send({ error: "Folder not found" });

    await assertProjectRole(user.id, folder.projectId, ["OWNER", "ADMIN", "MEMBER"]);
    await prisma.asset.updateMany({ where: { folderId: folder.id }, data: { folderId: null } });
    await prisma.folder.delete({ where: { id: folder.id } });

    return reply.code(204).send();
  });
}
