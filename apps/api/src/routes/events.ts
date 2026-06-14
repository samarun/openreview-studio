import type { FastifyInstance } from "fastify";
import type { ReviewEvent } from "@openreview/shared";
import {
  assertAssetVersionAccess,
  getAccessibleShareLink,
  getAuthUser,
  shareAccessTokenFromRequest
} from "../services/access.js";
import { subscribeReviewEvents, subscribeShareEvents } from "../services/events.js";

export async function registerEventRoutes(app: FastifyInstance) {
  app.get("/review/:assetVersionId/events", async (request, reply) => {
    const query = request.query as { token?: string };
    const user = query.token
      ? await app.jwt.verify<{ id: string; email: string }>(query.token)
      : await getAuthUser(app, request);
    const params = request.params as { assetVersionId: string };
    await assertAssetVersionAccess(user.id, params.assetVersionId);

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    const send = (event: ReviewEvent) => {
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    send({
      type: "presence.updated",
      assetVersionId: params.assetVersionId,
      payload: { userId: user.id, email: user.email },
      at: new Date().toISOString()
    });

    const unsubscribe = subscribeReviewEvents(params.assetVersionId, send);
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15_000);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      void unsubscribe();
    });
  });

  app.get("/share/:token/events", async (request, reply) => {
    const params = request.params as { token: string };
    const shareLink = await getAccessibleShareLink(app, params.token, shareAccessTokenFromRequest(request));
    if (!shareLink.assetVersionId) return reply.code(404).send({ error: "Share link not found" });

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    const send = (event: ReviewEvent) => {
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const unsubscribe = subscribeShareEvents(params.token, send);
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15_000);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      void unsubscribe();
    });
  });
}
