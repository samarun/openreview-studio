import type { ReviewEvent, ReviewEventType } from "@openreview/shared";
import { redis } from "../context.js";

export function reviewChannel(assetVersionId: string) {
  return `review:${assetVersionId}`;
}

export function shareChannel(shareToken: string) {
  return `share:${shareToken}`;
}

export async function publishReviewEvent(assetVersionId: string, type: ReviewEventType, payload: unknown, shareToken?: string) {
  const event: ReviewEvent = {
    type,
    assetVersionId,
    payload,
    at: new Date().toISOString()
  };

  await redis.publish(reviewChannel(assetVersionId), JSON.stringify(event));

  if (shareToken) {
    await redis.publish(shareChannel(shareToken), JSON.stringify(event));
  }
}

function createSubscriber(channel: string, onEvent: (event: ReviewEvent) => void) {
  const subscriber = redis.duplicate();
  subscriber.on("error", (err) => {
    console.error(`[redis-sub] ${channel} error:`, err.message);
  });

  void subscriber.subscribe(channel);
  subscriber.on("message", (receivedChannel, message) => {
    if (receivedChannel !== channel) return;

    try {
      onEvent(JSON.parse(message) as ReviewEvent);
    } catch {
      // ignore malformed events
    }
  });

  return async () => {
    try {
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    } catch {
      // connection may already be closed
    }
  };
}

export function subscribeReviewEvents(assetVersionId: string, onEvent: (event: ReviewEvent) => void) {
  return createSubscriber(reviewChannel(assetVersionId), onEvent);
}

export function subscribeShareEvents(shareToken: string, onEvent: (event: ReviewEvent) => void) {
  return createSubscriber(shareChannel(shareToken), onEvent);
}
