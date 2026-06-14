import type { FastifyInstance } from "fastify";
import { HeadBucketCommand, originalsBucket, prisma, proxiesBucket, redis, s3 } from "../context.js";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok", service: "api" }));

  app.get("/health/ready", async (_request, reply) => {
    const checks = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
      s3.send(new HeadBucketCommand({ Bucket: originalsBucket })),
      s3.send(new HeadBucketCommand({ Bucket: proxiesBucket }))
    ]);
    const [database, redisCheck, originals, proxies] = checks.map((check) => check.status === "fulfilled");
    const ready = database && redisCheck && originals && proxies;

    return reply.code(ready ? 200 : 503).send({
      status: ready ? "ready" : "not_ready",
      checks: { database, redis: redisCheck, originalsBucket: originals, proxiesBucket: proxies }
    });
  });
}
