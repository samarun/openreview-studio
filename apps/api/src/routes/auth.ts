import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { loginSchema, registerSchema, setPasswordSchema } from "@openreview/shared";
import { prisma } from "../context.js";
import { writeAuditLog } from "../services/audit.js";
import { uniqueOrganizationSlug } from "../services/access.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(body.password, 12);
    const organizationSlug = await uniqueOrganizationSlug(body.organizationName);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: body.email.toLowerCase(), name: body.name, passwordHash },
        select: { id: true, email: true, name: true }
      });

      const organization = await tx.organization.create({
        data: {
          name: body.organizationName,
          slug: organizationSlug,
          members: { create: { userId: user.id, role: "OWNER" } }
        }
      });

      return { user, organization };
    });

    const token = app.jwt.sign({ id: result.user.id, email: result.user.email });
    await writeAuditLog(app, {
      action: "auth.register",
      entityType: "User",
      entityId: result.user.id,
      actorUserId: result.user.id,
      organizationId: result.organization.id
    });

    return reply.code(201).send({ ...result, token });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });

    if (!user?.passwordHash || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    return {
      token: app.jwt.sign({ id: user.id, email: user.email }),
      user: { id: user.id, email: user.email, name: user.name }
    };
  });

  app.post("/auth/set-password", async (request, reply) => {
    const body = setPasswordSchema.parse(request.body);
    const invite = await prisma.inviteToken.findUnique({
      where: { token: body.token },
      include: { user: true }
    });

    if (!invite || invite.usedAt || invite.expiresAt <= new Date()) {
      return reply.code(400).send({ error: "Invalid or expired invite link" });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: invite.userId },
        data: { passwordHash },
        select: { id: true, email: true, name: true }
      });
      await tx.inviteToken.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
      return updated;
    });

    return {
      token: app.jwt.sign({ id: user.id, email: user.email }),
      user
    };
  });
}
