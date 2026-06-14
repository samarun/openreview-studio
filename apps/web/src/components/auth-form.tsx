"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../lib/api";
import { setAuthToken } from "../lib/auth";
import type { User } from "../lib/types";

type AuthMode = "login" | "register";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [email, setEmail] = useState("demo@openreview.local");
  const [password, setPassword] = useState("openreview-demo");
  const [name, setName] = useState("Demo Editor");
  const [organizationName, setOrganizationName] = useState("Demo Studio");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const result = await apiRequest<{ token: string; user: User }>(mode === "login" ? "/auth/login" : "/auth/register", {
        method: "POST",
        body: JSON.stringify(mode === "login" ? { email, password } : { email, password, name, organizationName })
      });

      setAuthToken(result.token);
      router.push("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to authenticate.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-frame-bg px-6 py-10 text-frame-text">
      <section className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-frame-accent">OpenReview Studio</p>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Video review for production teams</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-frame-muted">
            Upload cuts, share review links, collect timestamped feedback, and approve versions.
          </p>
        </div>

        <div className="frame-panel p-6 shadow-frame">
          <div className="mb-6 grid grid-cols-2 rounded-lg bg-frame-panel-elevated p-1">
            <a
              className={`rounded-md px-4 py-2.5 text-center text-sm font-medium ${mode === "login" ? "bg-frame-accent text-white" : "text-frame-muted"}`}
              href="/login"
            >
              Login
            </a>
            <a
              className={`rounded-md px-4 py-2.5 text-center text-sm font-medium ${mode === "register" ? "bg-frame-accent text-white" : "text-frame-muted"}`}
              href="/register"
            >
              Register
            </a>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {mode === "register" ? (
              <>
                <label className="block text-sm text-frame-muted">
                  Name
                  <input className="frame-input mt-2" value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="block text-sm text-frame-muted">
                  Organization
                  <input className="frame-input mt-2" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
                </label>
              </>
            ) : null}

            <label className="block text-sm text-frame-muted">
              Email
              <input className="frame-input mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>

            <label className="block text-sm text-frame-muted">
              Password
              <input className="frame-input mt-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>

            <button className="frame-btn-primary w-full" disabled={loading} type="submit">
              {loading ? "Working…" : mode === "login" ? "Login to workspace" : "Create account"}
            </button>
          </form>

          <p className="mt-5 rounded-lg border border-frame-accent/30 bg-frame-accent/10 px-4 py-3 text-sm text-indigo-100">
            Demo: demo@openreview.local / openreview-demo
          </p>
          {message ? <p className="mt-4 text-sm text-amber-200">{message}</p> : null}
        </div>
      </section>
    </main>
  );
}
