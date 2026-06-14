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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  function signOut() {
    clearAuthToken();
    router.push("/login");
  }

  return (
    <main className="flex min-h-screen bg-frame-bg text-frame-text">
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:flex w-[220px] shrink-0 flex-col items-stretch border-r border-frame-border bg-frame-panel px-4 py-4">
        <Link className="mb-8 flex flex-col items-start" href="/dashboard">
          <p className="text-lg font-semibold tracking-tight text-frame-accent">
            OpenReview Studio
          </p>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {navigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-frame-accent text-white" : "text-frame-muted hover:bg-white/5 hover:text-frame-text"
                }`}
                href={item.href}
                key={item.href}
                title={item.label}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto w-full">
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

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-frame-panel shadow-xl">
            <div className="flex items-center justify-between border-b border-frame-border px-4 py-3">
              <p className="text-base font-semibold text-frame-accent">OpenReview Studio</p>
              <button className="flex h-10 w-10 items-center justify-center rounded-lg text-frame-muted hover:bg-white/5" onClick={() => setMobileMenuOpen(false)} type="button" aria-label="Close menu">
                ✕
              </button>
            </div>

            <nav className="flex flex-col gap-1 px-3 py-4">
              {navigation.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition ${
                      active ? "bg-frame-accent text-white" : "text-frame-muted hover:bg-white/5 hover:text-frame-text"
                    }`}
                    href={item.href}
                    key={item.href}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="flex-1" />

            <div className="border-t border-frame-border p-4">
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
                  setMobileMenuOpen(false);
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
        </div>
      ) : null}

      <section className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-12 items-center justify-between border-b border-frame-border px-4 md:hidden">
          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg text-frame-text hover:bg-white/5"
            onClick={() => setMobileMenuOpen(true)}
            type="button"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <p className="text-sm font-semibold">OpenReview Studio</p>
          <div className="flex items-center gap-2">
            {notifications.length > 0 ? <Badge tone="warning">{notifications.length}</Badge> : <span className="w-10" />}
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-6">{children}</div>
      </section>
    </main>
  );
}
