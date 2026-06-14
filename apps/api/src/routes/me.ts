import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { changePasswordSchema, updateProfileSchema } from "@openreview/shared";
import { prisma } from "../context.js";
import { getAuthUser } from "../services/access.js";
import { writeAuditLog } from "../services/audit.js";

export async function registerMeRoutes(app: FastifyInstance) {
  app.get("/me", async (request) => {
    const user = await getAuthUser(app, request);
    return prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        memberships: { include: { organization: true } }
      }
    });
  });

  app.patch("/me", async (request) => {
    const user = await getAuthUser(app, request);
    const body = updateProfileSchema.parse(request.body);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(body.email ? { email: body.email.toLowerCase() } : {}),
        ...(body.name !== undefined ? { name: body.name } : {})
      },
      select: { id: true, email: true, name: true }
    });

    await writeAuditLog(app, { action: "user.update_profile", entityType: "User", entityId: user.id, actorUserId: user.id });
    return { user: updated, token: app.jwt.sign({ id: updated.id, email: updated.email }) };
  });

  app.post("/me/password", async (request, reply) => {
    const authUser = await getAuthUser(app, request);
    const body = changePasswordSchema.parse(request.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });

    if (!user.passwordHash || !(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
      return reply.code(401).send({ error: "Current password is incorrect" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(body.newPassword, 12) }
    });
    await writeAuditLog(app, { action: "user.change_password", entityType: "User", entityId: user.id, actorUserId: user.id });
    return { ok: true };
  });
}
