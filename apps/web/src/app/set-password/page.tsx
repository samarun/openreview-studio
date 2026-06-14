"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { apiRequest } from "../../lib/api";
import { setAuthToken } from "../../lib/auth";

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const result = await apiRequest<{ token: string }>("/auth/set-password", {
        method: "POST",
        body: JSON.stringify({ token, password })
      });
      setAuthToken(result.token);
      router.push("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to set password.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return <p className="text-slate-400">This invite link is missing a token.</p>;
  }

  return (
    <form className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-6" onSubmit={handleSubmit}>
      <h1 className="text-2xl font-semibold">Set your password</h1>
      <p className="mt-2 text-sm text-slate-400">Create a password to access your OpenReview Studio workspace.</p>
      <input
        className="mt-5 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none ring-cyan-300 focus:ring-2"
        minLength={8}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="New password"
        type="password"
        value={password}
      />
      <button className="mt-4 w-full rounded-xl bg-cyan-300 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60" disabled={loading || password.length < 8} type="submit">
        Continue to workspace
      </button>
      {message ? <p className="mt-4 text-sm text-amber-200">{message}</p> : null}
      <p className="mt-6 text-sm text-slate-400">
        Already have a password? <Link className="text-cyan-300 hover:text-cyan-200" href="/login">Sign in</Link>
      </p>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#08090f] px-4 text-slate-100 sm:px-5">
      <Suspense fallback={<p className="text-slate-400">Loading invite...</p>}>
        <SetPasswordForm />
      </Suspense>
    </main>
  );
}
