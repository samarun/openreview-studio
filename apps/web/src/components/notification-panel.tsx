"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import type { Notification } from "../lib/types";

function notificationHref(notification: Notification) {
  const payload = notification.payload as {
    assetVersionId?: string;
    assetId?: string;
    projectId?: string;
  };

  if (payload.assetVersionId) return `/review/${payload.assetVersionId}`;
  if (payload.assetId) return `/assets/${payload.assetId}`;
  if (payload.projectId) return `/projects/${payload.projectId}`;
  return "/dashboard";
}

function notificationLabel(notification: Notification) {
  switch (notification.type) {
    case "guest_comment.created":
      return "Guest comment";
    case "guest_reply.created":
      return "Guest reply";
    case "guest_approval.updated":
      return "Guest decision";
    case "comment.created":
      return "New comment";
    case "version.created":
      return "New version";
    default:
      return notification.type.replaceAll(".", " ");
  }
}

export function NotificationPanel({ token, onClose }: { token: string; onClose: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadNotifications() {
    setNotifications(await apiRequest<Notification[]>("/notifications", {}, token));
  }

  useEffect(() => {
    loadNotifications().catch(() => setNotifications([]));
  }, [token]);

  async function markRead(notificationId: string) {
    setLoading(true);
    try {
      await apiRequest(`/notifications/${notificationId}/read`, { method: "PATCH" }, token);
      await loadNotifications();
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    setLoading(true);
    try {
      await apiRequest("/notifications/read-all", { method: "POST" }, token);
      await loadNotifications();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-frame-border bg-frame-panel shadow-frame">
      <div className="flex items-center justify-between border-b border-frame-border px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-frame-muted">Notifications</p>
        <div className="flex gap-2">
          <button className="text-[10px] text-frame-accent hover:underline" disabled={loading} onClick={() => void markAllRead()} type="button">
            Mark all read
          </button>
          <button className="text-[10px] text-frame-muted hover:text-frame-text" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <p className="p-4 text-center text-xs text-frame-muted">No notifications.</p>
        ) : (
          notifications.map((notification) => (
            <div
              className={`border-b border-frame-border px-3 py-2 text-xs ${notification.readAt ? "opacity-60" : ""}`}
              key={notification.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-frame-text">{notificationLabel(notification)}</p>
                  <p className="mt-1 text-frame-muted">{new Date(notification.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <Link className="text-frame-accent hover:underline" href={notificationHref(notification)} onClick={onClose}>
                    Open
                  </Link>
                  {!notification.readAt ? (
                    <button className="text-frame-muted hover:text-frame-text" disabled={loading} onClick={() => void markRead(notification.id)} type="button">
                      Read
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
