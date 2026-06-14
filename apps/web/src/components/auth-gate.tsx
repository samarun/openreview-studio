"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { apiRequest } from "../lib/api";
import { clearAuthToken, getAuthToken } from "../lib/auth";
import type { User } from "../lib/types";
import { AppShell } from "./app-shell";

export function AuthGate({
  children,
  bare = false
}: {
  children: (token: string, user: User) => ReactNode;
  bare?: boolean;
}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = getAuthToken();

    if (!savedToken) {
      router.replace("/login");
      return;
    }

    apiRequest<User>("/me", {}, savedToken)
      .then((me) => {
        setToken(savedToken);
        setUser(me);
      })
      .catch(() => {
        clearAuthToken();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading || !token || !user) {
    return <main className="flex min-h-screen items-center justify-center bg-[#08090f] text-slate-300">Loading workspace...</main>;
  }

  if (bare) {
    return <>{children(token, user)}</>;
  }

  return <AppShell user={user}>{children(token, user)}</AppShell>;
}
