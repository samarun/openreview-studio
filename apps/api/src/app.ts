import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { jwtSecret } from "./context.js";
import { serializeJson } from "./lib/serialize.js";
import { registerAssetRoutes } from "./routes/assets.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerFolderRoutes } from "./routes/folders.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMetricsRoutes } from "./routes/metrics.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerOrganizationRoutes } from "./routes/organizations.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerReviewRoutes } from "./routes/review.js";
import { registerSearchRoutes } from "./routes/search.js";
import { registerShareRoutes } from "./routes/share.js";
import { registerUploadRoutes } from "./routes/uploads.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            requestId: request.headers["x-request-id"]
          };
        }
      }
    },
    genReqId: () => randomUUID()
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (
        !origin ||
        origin === "null" ||
        origin.startsWith("file://") ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("https://localhost:")
      ) {
        return cb(null, true);
      }

      const allowed = [
        ...(process.env.WEB_URL ?? "http://localhost:3000").split(",").map((u) => u.trim()),
        ...(process.env.CORS_ORIGINS ?? "").split(",").map((u) => u.trim()).filter(Boolean)
      ];

      if (allowed.includes(origin)) {
        return cb(null, true);
      }

      app.log.warn({ origin }, "CORS origin rejected");
      cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute"
  });
  await app.register(jwt, { secret: jwtSecret });
  await app.register(multipart);

  app.setReplySerializer((payload) => serializeJson(payload));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: error.flatten() });
    }

    if ((error as { code?: string }).code === "P2002") {
      return reply.code(409).send({ error: "A record with this value already exists" });
    }

    const normalizedError = error as Error & { statusCode?: number };
    const statusCode = typeof normalizedError.statusCode === "number" ? normalizedError.statusCode : 500;

    if (statusCode >= 500) {
      app.log.error(normalizedError);
    }

    return reply.code(statusCode).send({
      error: statusCode >= 500 ? "Internal server error" : normalizedError.message
    });
  });

  await registerHealthRoutes(app);
  await registerMetricsRoutes(app);
  await registerAuthRoutes(app);
  await registerMeRoutes(app);
  await registerOrganizationRoutes(app);
  await registerProjectRoutes(app);
  await registerFolderRoutes(app);
  await registerUploadRoutes(app);
  await registerMediaRoutes(app);
  await registerAssetRoutes(app);
  await registerReviewRoutes(app);
  await registerShareRoutes(app);
  await registerEventRoutes(app);
  await registerSearchRoutes(app);
  await registerNotificationRoutes(app);

  return app;
}
