import { prisma, redis, transcodeQueue } from "./context.js";
import { buildApp } from "./app.js";
import { flushErrorReports } from "./lib/sentry.js";

const app = await buildApp();
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down api");
  await app.close();
  await transcodeQueue.close();
  await redis.quit();
  await prisma.$disconnect();
  await flushErrorReports();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port, host });
