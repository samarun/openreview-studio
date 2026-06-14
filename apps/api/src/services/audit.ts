import type { Prisma } from "@openreview/db";
import type { FastifyInstance } from "fastify";
import { prisma } from "../context.js";

export async function writeAuditLog(
  app: FastifyInstance,
  input: {
    action: string;
    entityType: string;
    entityId?: string;
    actorUserId?: string;
    organizationId?: string;
    metadata?: Prisma.InputJsonValue;
  }
) {
  await prisma.auditLog
    .create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        metadata: input.metadata
      }
    })
    .catch((error) => app.log.warn({ error }, "failed to write audit log"));
}
