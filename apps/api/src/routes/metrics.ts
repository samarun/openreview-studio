import type { FastifyInstance } from "fastify";

export async function registerMetricsRoutes(app: FastifyInstance) {
  app.get("/metrics", async (request, reply) => {
    if (process.env.METRICS_ENABLED !== "true") {
      return reply.code(404).send({ error: "Metrics disabled" });
    }

    const memory = process.memoryUsage();

    return {
      service: "api",
      uptime_seconds: Math.round(process.uptime()),
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external
      },
      timestamp: new Date().toISOString()
    };
  });
}
