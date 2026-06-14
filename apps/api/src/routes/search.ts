import type { FastifyInstance } from "fastify";
import { prisma } from "../context.js";
import { getAuthUser, visibleProjectsFilter } from "../services/access.js";

export async function registerSearchRoutes(app: FastifyInstance) {
  app.get("/search", async (request) => {
    const user = await getAuthUser(app, request);
    const query = request.query as { q?: string; organizationId?: string };
    const term = query.q?.trim();

    if (!term) return { projects: [], assets: [] };

    const projectFilter = await visibleProjectsFilter(user.id);

    const orgFilter = query.organizationId
      ? { organizationId: query.organizationId }
      : {};

    const [projects, assets] = await Promise.all([
      prisma.project.findMany({
        where: {
          archivedAt: null,
          name: { contains: term, mode: "insensitive" },
          ...projectFilter,
          ...orgFilter
        },
        take: 20,
        orderBy: { updatedAt: "desc" },
        include: { organization: true }
      }),
      prisma.asset.findMany({
        where: {
          archivedAt: null,
          name: { contains: term, mode: "insensitive" },
          project: { ...projectFilter, ...orgFilter }
        },
        take: 20,
        orderBy: { updatedAt: "desc" },
        include: { project: { include: { organization: true } }, versions: { where: { archivedAt: null }, take: 1 } }
      })
    ]);

    return { projects, assets };
  });
}
