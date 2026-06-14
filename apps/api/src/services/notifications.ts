import type { Prisma } from "@openreview/db";
import type { FastifyInstance } from "fastify";
import { prisma } from "../context.js";
import { sendMail } from "./mail.js";

export async function notifyUsers(
  app: FastifyInstance,
  userIds: string[],
  input: { type: string; payload: Prisma.InputJsonValue; email?: { subject: string; text: string } }
) {
  const uniqueIds = [...new Set(userIds)];

  if (uniqueIds.length === 0) return;

  await prisma.notification.createMany({
    data: uniqueIds.map((userId) => ({
      userId,
      type: input.type,
      payload: input.payload
    }))
  });

  if (!input.email) return;

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { email: true }
  });

  await Promise.all(users.map((user) => sendMail(app, { to: user.email, subject: input.email!.subject, text: input.email!.text })));
}

export async function notifyVersionWatchers(
  app: FastifyInstance,
  assetVersionId: string,
  input: { type: string; payload: Prisma.InputJsonValue; email?: { subject: string; text: string } }
) {
  const version = await prisma.assetVersion.findUnique({
    where: { id: assetVersionId },
    include: {
      asset: { include: { project: { include: { organization: { include: { members: true } } } } } },
      approvals: { where: { reviewerId: { not: null } }, select: { reviewerId: true } }
    }
  });

  if (!version) return;

  const memberIds = version.asset.project.organization.members.map((member) => member.userId);
  const approverIds = version.approvals.map((approval) => approval.reviewerId).filter((id): id is string => Boolean(id));
  await notifyUsers(app, [...memberIds, ...approverIds], input);
}
