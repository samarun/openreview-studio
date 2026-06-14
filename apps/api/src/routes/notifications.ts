import type { FastifyInstance } from "fastify";
import { prisma } from "../context.js";
import { getAuthUser } from "../services/access.js";

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get("/notifications", async (request) => {
    const user = await getAuthUser(app, request);
    const query = request.query as { unreadOnly?: string };

    return prisma.notification.findMany({
      where: {
        userId: user.id,
        ...(query.unreadOnly === "true" ? { readAt: null } : {})
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  });

  app.patch("/notifications/:notificationId/read", async (request, reply) => {
    const user = await getAuthUser(app, request);
    const params = request.params as { notificationId: string };

    const notification = await prisma.notification.findFirst({
      where: { id: params.notificationId, userId: user.id }
    });

    if (!notification) return reply.code(404).send({ error: "Notification not found" });

    return prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: new Date() }
    });
  });

  app.post("/notifications/read-all", async (request) => {
    const user = await getAuthUser(app, request);

    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() }
    });

    return { ok: true };
  });
}
