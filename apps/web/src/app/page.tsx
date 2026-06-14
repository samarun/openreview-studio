import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-frame-bg px-4 text-center text-frame-text sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-frame-accent">OpenReview Studio</p>
      <h1 className="mt-4 text-2xl font-semibold sm:text-3xl md:text-4xl">Video review for production teams</h1>
      <p className="mt-3 max-w-lg text-sm text-frame-muted sm:text-base">
        Upload to a project workspace, share a review link, and collect timestamped comments with draw tools on every frame.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Link className="frame-btn-primary px-6 py-3 text-center" href="/login">
          Sign in
        </Link>
        <Link className="frame-btn-secondary px-6 py-3 text-center" href="/dashboard">
          Open workspace
        </Link>
      </div>
    </main>
  );
}
