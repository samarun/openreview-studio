"use client";

import { useEffect, useRef } from "react";
import { API_URL } from "./api";

type ReviewEvent = {
  type: string;
  assetVersionId: string;
  payload: unknown;
  at: string;
};

export function useReviewEvents(
  path: string | null,
  onEvent: (event: ReviewEvent) => void,
  enabled = true,
  token?: string
) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !path) return;

    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let closed = false;
    let attempt = 0;

    const connect = () => {
      const url = new URL(`${API_URL}${path}`);
      if (token) url.searchParams.set("token", token);
      source = new EventSource(url.toString(), { withCredentials: false });

      const handleMessage = (message: MessageEvent<string>) => {
        attempt = 0;
        try {
          const event = JSON.parse(message.data) as ReviewEvent;
          handlerRef.current(event);
        } catch {
          // ignore malformed payloads
        }
      };

      source.addEventListener("comment.created", handleMessage);
      source.addEventListener("comment.resolved", handleMessage);
      source.addEventListener("reply.created", handleMessage);
      source.addEventListener("approval.updated", handleMessage);
      source.addEventListener("version.status", handleMessage);
      source.addEventListener("presence.updated", handleMessage);
      source.onmessage = handleMessage;

      source.onerror = () => {
        source?.close();
        source = null;
        if (closed) return;
        attempt += 1;
        const delay = Math.min(30_000, 1000 * 2 ** attempt);
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [path, enabled, token]);
}
