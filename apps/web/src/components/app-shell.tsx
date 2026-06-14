"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { Badge } from "@openreview/ui";
import { apiRequest } from "../lib/api";
import { clearAuthToken, getAuthToken } from "../lib/auth";
import { resolveOrganizationId, setSelectedOrganizationId } from "../lib/org";
import type { Notification, User } from "../lib/types";
import { NotificationPanel } from "./notification-panel";

const navigation = [
  { href: "/dashboard", label: "Projects", icon: "▦" },
  { href: "/settings", label: "Settings", icon: "⚙" }
];

export function AppShell({ children, user }: { children: ReactNode; user: User | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const memberships = user?.memberships ?? [];
  const selectedOrganizationId = resolveOrganizationId(memberships);
  const token = getAuthToken() ?? "";

  useEffect(() => {
    if (!token) return;
    apiRequest<Notification[]>("/notifications?unreadOnly=true", {}, token)
      .then(setNotifications)
      .catch(() => setNotifications([]));
  }, [token]);

  function signOut() {
    clearAuthToken();
    router.push("/login");
  }

  return (
    <main className="flex min-h-screen bg-frame-bg text-frame-text">
      <aside className="flex w-16 shrink-0 flex-col items-center border-r border-frame-border bg-frame-panel py-4 md:w-[220px] md:items-stretch md:px-4">
        <Link className="mb-8 flex flex-col items-center md:items-start" href="/dashboard">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-frame-accent text-xs font-bold text-white md:hidden">
            O
          </span>
          <span className="hidden md:block">
            <p className="text-lg font-semibold tracking-tight text-frame-accent">
              OpenReview Studio
            </p>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {navigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                className={`flex items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition md:justify-start ${
                  active ? "bg-frame-accent text-white" : "text-frame-muted hover:bg-white/5 hover:text-frame-text"
                }`}
                href={item.href}
                key={item.href}
                title={item.label}
              >
                <span className="text-base">{item.icon}</span>
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto hidden w-full md:block">
          {memberships.length > 1 ? (
            <select
              className="frame-input mb-3 text-xs"
              value={selectedOrganizationId ?? ""}
              onChange={(event) => {
                setSelectedOrganizationId(event.target.value);
                router.refresh();
              }}
            >
              {memberships.map((membership) => (
                <option key={membership.organization.id} value={membership.organization.id}>
                  {membership.organization.name}
                </option>
              ))}
            </select>
          ) : null}

          <form
            className="mb-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!searchQuery.trim()) return;
              router.push(`/dashboard?q=${encodeURIComponent(searchQuery.trim())}`);
            }}
          >
            <input
              className="frame-input text-xs"
              placeholder="Search…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </form>

          <div className="relative rounded-lg border border-frame-border bg-frame-panel-elevated p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-medium">{user?.name || "Reviewer"}</p>
              <button className="relative" onClick={() => setNotificationsOpen((value) => !value)} type="button">
                {notifications.length > 0 ? <Badge tone="warning">{notifications.length}</Badge> : <span className="text-frame-muted">Alerts</span>}
              </button>
            </div>
            <p className="mt-1 truncate text-frame-muted">{user?.email}</p>
            {notificationsOpen && token ? (
              <NotificationPanel onClose={() => setNotificationsOpen(false)} token={token} />
            ) : null}
            <button className="mt-3 w-full rounded-lg border border-frame-border py-1.5 text-frame-muted hover:bg-white/5" onClick={signOut} type="button">
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between border-b border-frame-border px-4 md:hidden">
          <p className="text-sm font-semibold">OpenReview Studio</p>
          {notifications.length > 0 ? <Badge tone="warning">{notifications.length}</Badge> : null}
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-6">{children}</div>
      </section>
    </main>
  );
}
